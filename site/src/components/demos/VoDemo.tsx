/**
 * 11c 데모: 합성 장면에서 미니 VO 전체(초기화 → PnP 추적 → 키프레임·local BA)를 돌리고 정답과 비교한다.
 * - vo(내 initMap·trackPnP·localBA로 조립)는 워커가 lib/impl.ts로 불러 돌린다 (폰 화면이 멈추지 않게).
 * - 평가(ate, rpe)는 useImplFns로 불러 화면에서 계산한다. 설정을 바꾸면 이전 계산을 취소하고 다시 돌린다.
 */
import { useEffect, useMemo, useState } from "react";
import type { AteResult, RpeResult, SE3, Vec3 } from "@core/types";
import { type ImplKind } from "../../lib/impl";
import { useImplFns } from "../../lib/useImplFns";
import { runVoInWorker, type VoOutcome } from "../../lib/voClient";
import { evaluateVo } from "../../lib/voEval";
import { fallbackNote } from "../../lib/voFallback";
import { SYNTHETIC_SETTINGS, type VoSettings } from "../../lib/voJob";
import { makeVoScene, ROTATION_FRAMES, VO_FRAMES, VO_K } from "../../lib/voScene";
import ImplToggle, { defaultKind, type FnStatusEntry } from "../ui/ImplToggle";
import Slider from "../ui/Slider";
import TrajectoryView, { TrajectoryPlaceholder } from "./TrajectoryView";
import styles from "./Vo.module.css";

type EvalFns = {
  ate: (est: readonly Vec3[], gt: readonly Vec3[]) => AteResult;
  rpe: (est: readonly SE3[], gt: readonly SE3[], delta: number, scale: number) => RpeResult;
};
const FN_NAMES = ["ate", "rpe"] as const;
const RPE_DELTA = 5;

interface VoDemoProps {
  week: number;
  statuses: FnStatusEntry[];
}

type RunState = { kind: "running"; frame: number } | VoOutcome;

/** 슬라이더를 끄는 동안 틱마다 워커를 새로 띄우지 않게, 손을 멈춘 뒤에 값을 넘긴다 */
const SETTLE_MS = 250;
function useSettled<T>(value: T): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), SETTLE_MS);
    return () => clearTimeout(id);
  }, [value]);
  return settled;
}

function runErrorText(run: RunState): string | null {
  if (run.kind === "error") return run.message;
  if (run.kind === "timeout") return "시간이 너무 오래 걸려 멈췄다";
  return null;
}

export default function VoDemo({ week, statuses }: VoDemoProps) {
  const [kind, setKind] = useState<ImplKind>(() => defaultKind(statuses));
  const { fns, loadError } = useImplFns<EvalFns>(week, FN_NAMES, kind);
  const [rotationStart, setRotationStart] = useState(true);
  const [noise, setNoise] = useState(0.7);
  const [outliers, setOutliers] = useState(5);
  const [parallax, setParallax] = useState(SYNTHETIC_SETTINGS.minParallaxDeg);
  const [localBA, setLocalBA] = useState(true);
  const [seed, setSeed] = useState(1);
  const [run, setRun] = useState<RunState>({ kind: "running", frame: 0 });

  const noiseIn = useSettled(noise);
  const outliersIn = useSettled(outliers);
  const parallaxIn = useSettled(parallax);
  const scene = useMemo(
    () => makeVoScene({ seed, noise: noiseIn, outlierRate: outliersIn / 100, rotationStart }),
    [seed, noiseIn, outliersIn, rotationStart],
  );
  const settings: VoSettings = useMemo(() => ({ ...SYNTHETIC_SETTINGS, minParallaxDeg: parallaxIn, localBA }), [parallaxIn, localBA]);

  useEffect(() => {
    setRun({ kind: "running", frame: 0 });
    let alive = true;
    const r = runVoInWorker({ kind, K: VO_K, frames: scene.frames, settings }, { onProgress: (frame) => alive && setRun({ kind: "running", frame }) });
    r.promise.then((outcome) => alive && setRun(outcome));
    return () => {
      alive = false;
      r.cancel();
    };
  }, [kind, scene, settings]);

  const result = run.kind === "done" ? run.result : null;
  const evaluation = useMemo(() => {
    if (!result || !fns) return null;
    try {
      return { ev: evaluateVo(result.poses, scene.gt, fns, RPE_DELTA), error: null };
    } catch (e) {
      return { ev: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [result, fns, scene]);
  const ev = evaluation?.ev ?? null;
  const who = kind === "mine" ? "내 구현" : "정답";
  const runError = runErrorText(run);
  const fallbackText = kind === "mine" ? fallbackNote(result?.fallbacks) : null;
  const failed = !!runError || !!evaluation?.error;
  const fmt = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : "–");
  const kfSet = new Set(result?.keyframeFrames ?? []);
  const kfIdx = ev ? ev.frames.flatMap((f, i) => (kfSet.has(f) ? [i] : [])) : [];

  return (
    <div className={styles.demo}>
      <ImplToggle statuses={statuses} value={kind} onChange={setKind} />

      <div className={styles.segment} role="group" aria-label="카메라 움직임">
        <button type="button" aria-pressed={rotationStart} className={styles.option} onClick={() => setRotationStart(true)}>
          제자리 회전 먼저
        </button>
        <button type="button" aria-pressed={!rotationStart} className={styles.option} onClick={() => setRotationStart(false)}>
          처음부터 걷기
        </button>
      </div>

      {ev ? (
        <TrajectoryView gt={ev.gtCenters} est={ev.estAligned} keyframes={kfIdx} unit="m" />
      ) : (
        <TrajectoryPlaceholder message={run.kind === "running" ? "VO 계산 중…" : "그릴 궤적이 없다 (초기화 실패 또는 추적 3프레임 미만)"} />
      )}

      <div className={styles.controls}>
        <Slider id="vo-noise" label="픽셀 잡음 (표준편차)" value={noise} min={0} max={2} step={0.1} unit=" px" onChange={setNoise} format={(v) => v.toFixed(1)} />
        <Slider id="vo-outliers" label="엉터리 대응 비율" value={outliers} min={0} max={30} step={5} unit="%" onChange={setOutliers} />
        <Slider id="vo-parallax" label="초기화 시차 기준" value={parallax} min={0.5} max={5} step={0.5} unit="°" onChange={setParallax} format={(v) => v.toFixed(1)} />
        <label className={styles.check}>
          <input type="checkbox" checked={localBA} onChange={(e) => setLocalBA(e.currentTarget.checked)} />
          키프레임마다 local BA
        </label>
        <button type="button" className={styles.button} onClick={() => setSeed((s) => s + 1)}>
          새 장면
        </button>
      </div>

      <div className={styles.readout}>
        <div role="status">
          {!fns && !loadError && <p className={styles.muted}>구현 불러오는 중…</p>}
          {fallbackText && <p className={styles.muted}>{fallbackText}</p>}
          {run.kind === "running" && (
            <p className={styles.muted}>
              {who} VO 계산 중… 프레임 {run.frame}/{VO_FRAMES}
            </p>
          )}
        </div>
        {(loadError || failed) && (
          <div role="alert">
            {loadError && <p className={styles.error}>{loadError}</p>}
            {runError && (
              <p className={styles.error}>
                {who} vo가 멈췄다: {runError}
              </p>
            )}
            {evaluation?.error && (
              <p className={styles.error}>
                {who} ate·rpe가 멈췄다: {evaluation.error}
              </p>
            )}
          </div>
        )}
        {failed && kind === "mine" && (
          <button type="button" className={styles.button} onClick={() => setKind("reference")}>
            정답으로 보기
          </button>
        )}
        <dl className={styles.values}>
          <dt>초기화</dt>
          <dd>
            {result
              ? result.initFrames
                ? `프레임 ${result.initFrames[0]}과 ${result.initFrames[1]}${rotationStart ? ` (0~${ROTATION_FRAMES - 1}은 제자리 회전)` : ""}`
                : "못 함 (시차가 끝까지 부족)"
              : "–"}
          </dd>
          <dt>추적</dt>
          <dd>{result ? (result.lostAt === null ? `끝까지 (${VO_FRAMES}프레임)` : `프레임 ${result.lostAt}에서 끊김`) : "–"}</dd>
          <dt>키프레임 · 맵 포인트</dt>
          <dd>{result ? `${result.keyframeFrames.length}개 · ${result.mapPoints.length}개` : "–"}</dd>
          <dt>ATE RMSE (Sim(3) 정렬 뒤)</dt>
          <dd>{ev ? `${fmt(ev.ate.rmse)} m (이동 거리 ${fmt(ev.pathLength, 2)} m의 ${fmt((100 * ev.ate.rmse) / ev.pathLength, 2)}%)` : "–"}</dd>
          <dt>RPE ({RPE_DELTA}프레임 간격)</dt>
          <dd>{ev?.rpe ? `이동 ${fmt(ev.rpe.transRmse)} m · 회전 ${fmt(ev.rpe.rotRmseDeg, 2)}°` : "–"}</dd>
          <dt>계산 시간</dt>
          <dd>{result ? `${(result.ms / 1000).toFixed(1)}초` : "–"}</dd>
        </dl>
      </div>
    </div>
  );
}
