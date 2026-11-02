/**
 * 11d "TUM으로 VO 돌리기": datasets/tum_tracks.py가 만든 트랙 JSON을 열어 내 vo를 돌리고 정답과 비교한다 (M1 리포트).
 * - 파일은 브라우저 안에서만 읽는다 (저장·업로드 안 함). vo는 워커에서 돌린다 (lib/voClient.ts).
 * - 결과: 궤적 그림, ATE·RPE, TUM 궤적 파일 내려받기 (12주차 evo로 다시 계산할 수 있게).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { AteResult, RpeResult, SE3, Vec3 } from "@core/types";
import { type ImplKind } from "../../lib/impl";
import { parseTracks, type TracksFile } from "../../lib/tracksFile";
import { useImplFns } from "../../lib/useImplFns";
import { runVoInWorker, type VoOutcome, type VoRun } from "../../lib/voClient";
import { evaluateVo, toTumTrajectory } from "../../lib/voEval";
import { TUM_SETTINGS } from "../../lib/voJob";
import ImplToggle, { defaultKind, type FnStatusEntry } from "../ui/ImplToggle";
import Slider from "../ui/Slider";
import TrajectoryView, { TrajectoryPlaceholder } from "./TrajectoryView";
import styles from "./Vo.module.css";

type EvalFns = {
  ate: (est: readonly Vec3[], gt: readonly Vec3[]) => AteResult;
  rpe: (est: readonly SE3[], gt: readonly SE3[], delta: number, scale: number) => RpeResult;
};
const FN_NAMES = ["ate", "rpe"] as const;
/** 폰 메모리 보호 (300프레임 트랙 파일은 약 1.5MB) */
const MAX_FILE_BYTES = 30 * 1024 * 1024;

type RunState = { kind: "idle" } | { kind: "running"; frame: number } | VoOutcome;

interface VoFileRunnerProps {
  week: number;
  statuses: FnStatusEntry[];
}

/** RPE 간격: 약 1초에 해당하는 프레임 수 (TUM 평가 관례) */
function oneSecondFrames(times: readonly number[]): number {
  const span = times[times.length - 1]! - times[0]!;
  const fps = span > 0 ? (times.length - 1) / span : 1;
  return Math.max(1, Math.round(fps));
}

/** iOS Safari는 클릭 직후 URL을 지우면 내려받기가 실패할 수 있어서, 링크를 문서에 붙였다가 잠시 뒤에 치운다 */
const REVOKE_DELAY_MS = 2000;
function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, REVOKE_DELAY_MS);
}

function runErrorText(run: RunState): string | null {
  if (run.kind === "error") return run.message;
  if (run.kind === "timeout") return "5분 안에 끝나지 않아 멈췄다 (PC에서 열거나 --max-frames를 줄여)";
  return null;
}

export default function VoFileRunner({ week, statuses }: VoFileRunnerProps) {
  const [kind, setKind] = useState<ImplKind>(() => defaultKind(statuses));
  const { fns, loadError } = useImplFns<EvalFns>(week, FN_NAMES, kind);
  const [file, setFile] = useState<TracksFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(TUM_SETTINGS.trackThreshold);
  const [localBA, setLocalBA] = useState(true);
  const [run, setRun] = useState<RunState>({ kind: "idle" });
  const [ranWith, setRanWith] = useState<string>("");
  const current = useRef<VoRun | null>(null);
  const readId = useRef(0);

  // 화면을 떠나면 계산을 멈추고, 늦게 온 결과는 버린다
  useEffect(
    () => () => {
      current.current?.cancel();
      current.current = null;
    },
    [],
  );

  const stop = () => {
    current.current?.cancel();
    current.current = null;
  };

  // 구현을 바꾸면 이전 구현의 계산·결과·오류를 모두 지운다 (다른 구현의 것이 새 라벨로 보이지 않게)
  const changeKind = (k: ImplKind) => {
    stop();
    setRun({ kind: "idle" });
    setKind(k);
  };

  const onFile = async (f: File | undefined) => {
    stop();
    setRun({ kind: "idle" });
    setFile(null);
    setFileError(null);
    const id = ++readId.current; // 읽던 이전 파일의 결과는 버린다 (선택을 취소해도)
    if (!f) return;
    try {
      if (f.size > MAX_FILE_BYTES) {
        throw new Error(`파일이 너무 크다 (${(f.size / 1e6).toFixed(1)}MB, 최대 ${MAX_FILE_BYTES / 1e6}MB). --max-frames를 줄여 다시 만들어`);
      }
      const parsed = parseTracks(await f.text());
      if (id === readId.current) setFile(parsed);
    } catch (e) {
      if (id === readId.current) setFileError(e instanceof Error ? e.message : String(e));
    }
  };

  const start = () => {
    if (!file) return;
    stop();
    setRun({ kind: "running", frame: 0 });
    const label = `추적 기준 ${threshold}px · local BA ${localBA ? "켬" : "끔"}`;
    const r = runVoInWorker(
      { kind, K: file.camera, frames: file.frames, settings: { ...TUM_SETTINGS, trackThreshold: threshold, localBA } },
      { onProgress: (frame) => current.current === r && setRun({ kind: "running", frame }) },
    );
    current.current = r;
    r.promise.then((outcome) => {
      if (current.current !== r) return;
      current.current = null;
      setRun(outcome);
      setRanWith(label);
    });
  };

  const result = run.kind === "done" ? run.result : null;
  const delta = file ? oneSecondFrames(file.times) : 1;
  const evaluation = useMemo(() => {
    if (!result || !file || !fns) return null;
    try {
      return { ev: evaluateVo(result.poses, file.groundtruth, fns, delta), error: null };
    } catch (e) {
      return { ev: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [result, file, fns, delta]);
  const ev = evaluation?.ev ?? null;
  const who = kind === "mine" ? "내 구현" : "정답";
  const runError = runErrorText(run);
  const failed = !!runError || !!evaluation?.error;
  const fmt = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : "–");
  const tracked = result ? result.poses.filter(Boolean).length : 0;
  const kfSet = new Set(result?.keyframeFrames ?? []);
  const kfIdx = ev ? ev.frames.flatMap((f, i) => (kfSet.has(f) ? [i] : [])) : [];

  return (
    <div className={styles.demo}>
      <ImplToggle statuses={statuses} value={kind} onChange={changeKind} />

      <label className={styles.file}>
        트랙 파일 (datasets/tum_tracks.py로 만든 .json)
        <input type="file" accept=".json,application/json" onChange={(e) => {
            const input = e.currentTarget;
            void onFile(input.files?.[0]).finally(() => (input.value = "")); // 같은 파일을 다시 골라도 다시 읽게
          }} />
      </label>

      <div className={styles.controls}>
        <Slider id="vo-track-th" label="추적 inlier 기준" value={threshold} min={3} max={8} step={1} unit=" px" onChange={setThreshold} />
        <label className={styles.check}>
          <input type="checkbox" checked={localBA} onChange={(e) => setLocalBA(e.currentTarget.checked)} />
          키프레임마다 local BA
        </label>
        <div className={styles.row}>
          <button type="button" className={`${styles.button} ${styles.primary}`} disabled={!file || run.kind === "running"} onClick={start}>
            VO 실행
          </button>
          {run.kind === "running" && (
            <button
              type="button"
              className={styles.button}
              onClick={() => {
                stop();
                setRun({ kind: "cancelled" });
              }}
            >
              취소
            </button>
          )}
        </div>
      </div>

      {ev ? (
        <TrajectoryView gt={ev.gtCenters} est={ev.estAligned} keyframes={kfIdx} unit="m" />
      ) : (
        <TrajectoryPlaceholder message={!file ? "트랙 파일을 열어 줘" : run.kind === "running" ? "VO 계산 중…" : result ? "그릴 궤적이 없다 (추적 3프레임 미만)" : "VO 실행을 눌러 줘"} />
      )}

      <div className={styles.readout}>
        <div role="status">
          {!file && !fileError && <p className={styles.muted}>트랙 파일을 열면 여기에 결과가 나온다</p>}
          {file && run.kind === "idle" && (
            <p className={styles.muted}>
              {file.name}: {file.frames.length}프레임, 정답 자세 {file.groundtruth.filter(Boolean).length}개. "VO 실행"을 눌러
            </p>
          )}
          {file && run.kind === "running" && (
            <p className={styles.muted}>
              {who} VO 계산 중… 프레임 {run.frame}/{file.frames.length} (300프레임에 PC 약 10초, 폰은 몇 배)
            </p>
          )}
          {run.kind === "cancelled" && <p className={styles.muted}>취소했다</p>}
          {!fns && !loadError && <p className={styles.muted}>구현 불러오는 중…</p>}
        </div>
        {(fileError || loadError || failed) && (
          <div role="alert">
            {fileError && <p className={styles.error}>{fileError}</p>}
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
          <button type="button" className={styles.button} onClick={() => changeKind("reference")}>
            정답으로 보기
          </button>
        )}
        {result && file && (
          <dl className={styles.values}>
            <dt>설정</dt>
            <dd>
              {who} · {ranWith}
            </dd>
            <dt>추적한 프레임</dt>
            <dd>
              {tracked}/{file.frames.length} ({fmt((100 * tracked) / file.frames.length, 0)}%)
              {result.initFrames ? ` · 초기화 ${result.initFrames[0]}–${result.initFrames[1]}` : " · 초기화 못 함"}
              {result.lostAt !== null ? ` · 프레임 ${result.lostAt}에서 끊김` : " · 끝까지"}
            </dd>
            <dt>키프레임 · 맵 포인트</dt>
            <dd>
              {result.keyframeFrames.length}개 · {result.mapPoints.length}개
            </dd>
            <dt>ATE (Sim(3) 정렬, 정답 있는 {ev?.frames.length ?? 0}프레임)</dt>
            <dd>
              {ev
                ? `RMSE ${fmt(ev.ate.rmse)} m · 중앙값 ${fmt(ev.ate.median)} · 최대 ${fmt(ev.ate.max)} · 이동 거리 ${fmt(ev.pathLength, 2)} m의 ${fmt((100 * ev.ate.rmse) / ev.pathLength, 2)}%`
                : "–"}
            </dd>
            <dt>RPE (Δ = {delta}프레임 ≈ 1초, 정답이 빠진 프레임은 건너뛰고 셈)</dt>
            <dd>{ev?.rpe ? `이동 ${fmt(ev.rpe.transRmse)} m · 회전 ${fmt(ev.rpe.rotRmseDeg, 2)}°` : "–"}</dd>
            <dt>정렬 스케일 s</dt>
            <dd>{ev ? `${fmt(ev.ate.align.s, 4)} (VO 1단위 = s 미터)` : "–"}</dd>
            <dt>계산 시간</dt>
            <dd>{(result.ms / 1000).toFixed(1)}초</dd>
          </dl>
        )}
        {result && file && (
          <button type="button" className={styles.button} onClick={() => download(`${file.name}-vo.txt`, toTumTrajectory(file.times, result.poses))}>
            내 궤적 저장 (TUM 형식)
          </button>
        )}
      </div>
    </div>
  );
}
