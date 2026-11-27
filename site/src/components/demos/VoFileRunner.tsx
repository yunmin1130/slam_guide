/**
 * 11d 실행기: 트랙 JSON을 열어 내 vo(미니 SfM 조립)를 돌리고 기준 자세와 비교한다.
 * - 트랙 파일은 datasets/colmap_tracks.py(내 사진의 COLMAP 결과, 기준 = COLMAP 자세)나 tum_tracks.py(TUM RGB-D, 기준 = 모션캡처 정답)가 만든다.
 * - 파일은 브라우저 안에서만 읽는다 (저장·업로드 안 함). vo는 워커에서 돌린다 (lib/voClient.ts).
 * - 결과: 궤적 그림, ATE·RPE, TUM 형식 궤적 파일 내려받기 (다른 도구로 다시 재 볼 수 있게).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { AteResult, RpeResult, SE3, Vec3 } from "@core/types";
import { type ImplKind } from "../../lib/impl";
import { parseTracks, type TracksFile } from "../../lib/tracksFile";
import { useImplFns } from "../../lib/useImplFns";
import { runVoInWorker, VO_TIMEOUT_MS, type VoOutcome, type VoRun } from "../../lib/voClient";
import { evaluateVo, toTumTrajectory } from "../../lib/voEval";
import { fallbackNote } from "../../lib/voFallback";
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
  if (run.kind === "timeout") return `${Math.round(VO_TIMEOUT_MS / 60_000)}분 안에 끝나지 않아 멈췄다 (PC에서 열거나, 트랙 파일을 더 작게 다시 만들어: --max-features 또는 --max-frames)`;
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
        throw new Error(`파일이 너무 크다 (${(f.size / 1e6).toFixed(1)}MB, 최대 ${MAX_FILE_BYTES / 1e6}MB). --max-features나 --max-frames를 줄여 다시 만들어`);
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
  // "정답"이라 하지 않는다: COLMAP 파일에서는 비교 대상(COLMAP 기준)과 헷갈린다
  const who = kind === "mine" ? "내 구현" : "기준 구현";
  // COLMAP 파일은 비교 대상이 정답이 아니라 기준이고, 길이 단위도 미터가 아니라 COLMAP이 정한 임의 단위다
  const colmap = file?.reference === "colmap";
  const refWord = colmap ? "COLMAP 기준" : "정답";
  const unit = colmap ? "단위" : "m";
  const runError = runErrorText(run);
  const fallbackText = kind === "mine" ? fallbackNote(result?.fallbacks) : null;
  const failed = !!runError || !!evaluation?.error;
  const fmt = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : "–");
  const tracked = result ? result.poses.filter(Boolean).length : 0;
  const kfSet = new Set(result?.keyframeFrames ?? []);
  const kfIdx = ev ? ev.frames.flatMap((f, i) => (kfSet.has(f) ? [i] : [])) : [];

  return (
    <div className={styles.demo}>
      <ImplToggle statuses={statuses} value={kind} onChange={changeKind} />

      <label className={styles.file}>
        트랙 파일 (datasets/colmap_tracks.py 또는 tum_tracks.py로 만든 .json)
        <input type="file" accept=".json,application/json" onChange={(e) => {
            const input = e.currentTarget;
            void onFile(input.files?.[0]).finally(() => (input.value = "")); // 같은 파일을 다시 골라도 다시 읽게
          }} />
      </label>
      <p className={`${styles.muted} ${styles.coarseOnly}`}>폰에서는 몇 배 느리다. 긴 시퀀스는 PC에서 여는 걸 권한다</p>

      <div className={styles.controls}>
        <Slider id="vo-track-th" label="추적 inlier 기준" value={threshold} min={3} max={8} step={1} unit=" px" onChange={setThreshold} />
        <label className={styles.check}>
          <input type="checkbox" checked={localBA} onChange={(e) => setLocalBA(e.currentTarget.checked)} />
          키프레임마다 local BA
        </label>
        <div className={styles.row}>
          <button type="button" className={`${styles.button} ${styles.primary}`} disabled={!file || run.kind === "running"} onClick={start}>
            실행
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
        <TrajectoryView gt={ev.gtCenters} est={ev.estAligned} keyframes={kfIdx} unit={unit} />
      ) : (
        <TrajectoryPlaceholder message={!file ? "트랙 파일을 열어 줘" : run.kind === "running" ? "계산 중…" : result ? "그릴 궤적이 없다 (추적 3프레임 미만)" : "실행을 눌러 줘"} />
      )}

      <div className={styles.readout}>
        <div role="status">
          {!file && !fileError && <p className={styles.muted}>트랙 파일을 열면 여기에 결과가 나온다</p>}
          {file && run.kind === "idle" && (
            <p className={styles.muted}>
              {file.name}: {file.frames.length}프레임, {refWord} 자세 {file.groundtruth.filter(Boolean).length}개. "실행"을 눌러
            </p>
          )}
          {file && run.kind === "running" && (
            <p className={styles.muted}>
              {who} 계산 중… 프레임 {run.frame}/{file.frames.length} (300프레임에 PC 약 10초, 폰은 몇 배)
            </p>
          )}
          {run.kind === "cancelled" && <p className={styles.muted}>취소했다</p>}
          {fallbackText && <p className={styles.muted}>{fallbackText}</p>}
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
            기준 구현으로 보기
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
            <dt>ATE (Sim(3) 정렬, {refWord} 자세가 있는 {ev?.frames.length ?? 0}프레임)</dt>
            <dd>
              {ev
                ? `RMSE ${fmt(ev.ate.rmse)} ${unit} · 중앙값 ${fmt(ev.ate.median)} · 최대 ${fmt(ev.ate.max)} · 이동 거리 ${fmt(ev.pathLength, 2)} ${unit}의 ${fmt((100 * ev.ate.rmse) / ev.pathLength, 2)}%`
                : "–"}
            </dd>
            <dt>RPE (Δ = {delta}프레임{colmap ? ", 이웃한 사진끼리" : " ≈ 1초"}, {refWord} 자세가 빠진 프레임은 건너뛰고 셈)</dt>
            <dd>{ev?.rpe ? `이동 ${fmt(ev.rpe.transRmse)} ${unit} · 회전 ${fmt(ev.rpe.rotRmseDeg, 2)}°` : "–"}</dd>
            <dt>정렬 스케일 s</dt>
            <dd>{ev ? `${fmt(ev.ate.align.s, 4)} (내 1단위 = ${colmap ? "COLMAP의 s 단위" : "s 미터"})` : "–"}</dd>
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
