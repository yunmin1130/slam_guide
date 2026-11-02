/**
 * 6주차 "3D 복원" 실습 도구 (데모 아님: 화면 조작보다 실행 결과를 보는 도구).
 * 대응점 → E (5주차 정답) → decomposeE → triangulate → pnpDLT 확인. 6주차 세 함수는 내 구현/정답 토글.
 * - 합성 장면: 5주차 데모와 같은 장면이라 정답 자세와 직접 비교한다.
 * - 내 사진: export_matches.py의 대응점 + calib.json (캘리브레이션이 있어야 E를 쓸 수 있다).
 * - 위에서 내려다본 그림(x: 오른쪽, z: 앞)으로 점 구름과 두 카메라 위치를 보여준다.
 */
import { useEffect, useRef, useState } from "react";
import { loadFn, type ImplKind } from "../../lib/impl";
import { readText, toNormalized } from "../../lib/matchPrep";
import { parseCalib, parseMatches } from "../../lib/matchesFile";
import {
  cameraCenter,
  directionDiffDeg,
  reconstruct,
  rotationDiffDeg,
  StageError,
  syntheticPairs,
  type Pose,
  type ReconResult,
  type W05Fns,
  type W06Fns,
} from "../../lib/reconstruct";
import { useImplFns } from "../../lib/useImplFns";
import ImplToggle, { defaultKind, type FnStatusEntry } from "../ui/ImplToggle";
import TopView from "./TopView";
import styles from "./ReconstructRunner.module.css";

const FN_NAMES = ["decomposeE", "triangulate", "pnpDLT"] as const;

interface Outcome {
  who: string;
  source: string;
  result: ReconResult;
  /** 합성 장면이면 정답 자세 */
  truth: Pose | null;
  dropped: number;
}

interface Failure {
  stage: string;
  message: string;
}

async function loadW05(): Promise<W05Fns> {
  const [eightPoint, ransac] = await Promise.all([
    loadFn<W05Fns["eightPoint"]>(5, "eightPoint", "reference"),
    loadFn<W05Fns["ransac"]>(5, "ransac", "reference"),
  ]);
  return { eightPoint, ransac };
}

const yieldToPaint = () => new Promise((resolve) => setTimeout(resolve, 0));
const fmt = (v: number, unit: string, digits = 1) => (Number.isFinite(v) ? `${v.toFixed(digits)}${unit}` : "–");

interface ReconstructRunnerProps {
  week: number;
  statuses: FnStatusEntry[];
}

export default function ReconstructRunner({ week, statuses }: ReconstructRunnerProps) {
  const [kind, setKind] = useState<ImplKind>(() => defaultKind(statuses));
  const { fns, loadError } = useImplFns<W06Fns>(week, FN_NAMES, kind);
  const [seed, setSeed] = useState(1);
  const [matches, setMatches] = useState<File | null>(null);
  const [calib, setCalib] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  // 실행 번호: 계산 도중 구현이 바뀌면 끝난 옛 계산의 결과를 버린다
  const runIdRef = useRef(0);
  const who = kind === "mine" ? "내 구현" : "정답";

  // 구현을 바꾸면 이전 결과를 지운다 (다른 구현의 결과를 지금 것으로 오해하지 않게)
  useEffect(() => {
    runIdRef.current++;
    setBusy(false);
    setOutcome(null);
    setFailure(null);
  }, [fns]);

  async function compute(source: "synthetic" | "file", sceneSeed: number, w6: W06Fns): Promise<Outcome> {
    const w5 = await loadW05();
    if (source === "synthetic") {
      const { a, b, scale, truth } = syntheticPairs(sceneSeed);
      await yieldToPaint(); // "계산 중…"이 먼저 그려지게
      return { who, source: `합성 장면 ${sceneSeed}`, result: reconstruct(w5, w6, a, b, scale), truth, dropped: 0 };
    }
    if (!matches || !calib) throw new StageError("입력", "대응점 파일과 calib.json이 둘 다 필요하다 (E를 쓰려면 캘리브레이션이 있어야 한다)");
    const { pts1, pts2 } = parseMatches(await readText(matches));
    const { a, b, scale, dropped } = await toNormalized(pts1, pts2, parseCalib(await readText(calib)));
    await yieldToPaint();
    return { who, source: matches.name, result: reconstruct(w5, w6, a, b, scale), truth: null, dropped };
  }

  async function start(source: "synthetic" | "file", sceneSeed = seed) {
    if (!fns) return;
    const id = ++runIdRef.current;
    setBusy(true);
    setFailure(null);
    setOutcome(null);
    try {
      const out = await compute(source, sceneSeed, fns);
      if (id === runIdRef.current) setOutcome(out);
    } catch (e) {
      const f = e instanceof StageError ? { stage: e.stage, message: e.message } : { stage: "입력", message: e instanceof Error ? e.message : String(e) };
      if (id === runIdRef.current) setFailure(f);
    } finally {
      if (id === runIdRef.current) setBusy(false);
    }
  }

  const newScene = () => {
    const next = seed + 1;
    setSeed(next);
    void start("synthetic", next);
  };
  const r = outcome?.result;
  const userStage = failure !== null && (FN_NAMES as readonly string[]).includes(failure.stage);

  return (
    <div className={styles.runner} aria-busy={busy}>
      <ImplToggle statuses={statuses} value={kind} onChange={setKind} />

      <div className={styles.actions}>
        <button type="button" className={styles.button} disabled={!fns || busy} onClick={() => start("synthetic")}>
          {busy ? "계산 중…" : `합성 장면을 ${who}으로 복원`}
        </button>
        <button type="button" className={styles.button} disabled={!fns || busy} onClick={newScene}>
          새 장면
        </button>
      </div>

      <details className={styles.files}>
        <summary>내 사진으로 (JetBot 대응점 파일)</summary>
        <p className={styles.note}>5주차와 같은 두 파일을 고른다. 파일은 이 기기 안에서만 읽고 어디에도 올리지 않는다.</p>
        <label className={styles.file}>
          대응점 파일
          <input type="file" accept=".json,application/json" disabled={busy} onChange={(e) => setMatches(e.currentTarget.files?.[0] ?? null)} />
        </label>
        <label className={styles.file}>
          calib.json
          <input type="file" accept=".json,application/json" disabled={busy} onChange={(e) => setCalib(e.currentTarget.files?.[0] ?? null)} />
        </label>
        <button type="button" className={styles.button} disabled={!fns || busy || !matches || !calib} onClick={() => start("file")}>
          내 사진을 {who}으로 복원
        </button>
      </details>

      <div className={styles.readout}>
        <div role="status">
          {!fns && !loadError && <p className={styles.muted}>구현 불러오는 중…</p>}
          {!outcome && !failure && fns && !busy && <p className={styles.muted}>위 버튼을 누르면 결과가 여기 나온다.</p>}
        </div>
        {(loadError || failure) && (
          <div role="alert" className={styles.alerts}>
            {loadError && <p className={styles.error}>{loadError}</p>}
            {failure && (
              <p className={styles.error}>
                {userStage ? `${who} ${failure.stage}에서 멈췄다` : `${failure.stage} 단계에서 멈췄다`}: {failure.message}
              </p>
            )}
          </div>
        )}
        {userStage && kind === "mine" && (
          <button type="button" className={styles.button} onClick={() => setKind("reference")}>
            정답으로 보기
          </button>
        )}
        {outcome && r && (
          <>
            <TopView points={r.points} camera2={cameraCenter(r.T21)} />
            <dl className={styles.values}>
              <dt>쓴 구현 · 입력</dt>
              <dd>
                {outcome.who} · {outcome.source}
              </dd>
              <dt>E의 인라이어</dt>
              <dd>
                {r.inliers} / {r.total}
                {outcome.dropped > 0 && ` (쓸 수 없는 대응 ${outcome.dropped}개 뺌)`}
              </dd>
              <dt>복원한 점 (두 카메라 앞)</dt>
              <dd>
                {r.points.length}
                {r.behind > 0 && ` · 뒤로 간 점 ${r.behind}`}
                {r.failed > 0 && ` · 실패 ${r.failed}`}
              </dd>
              <dt>재투영 오차 (중앙값)</dt>
              <dd>{fmt(r.reprojMedianPx, " px", 2)}</dd>
              <dt>점 깊이 중앙값 (카메라 사이 거리 = 1)</dt>
              <dd>{fmt(r.depthMedian, "", 1)}</dd>
              <dt>카메라 2 위치 (카메라 1 기준)</dt>
              <dd>
                {cameraCenter(r.T21)
                  .map((v) => v.toFixed(2))
                  .join(", ")}
              </dd>
              <dt>pnpDLT와 차이 (회전 · 이동 방향)</dt>
              <dd>{r.pnpCheck ? `${fmt(r.pnpCheck.rotDeg, "°", 2)} · ${fmt(r.pnpCheck.tDeg, "°", 1)}` : "점이 6개 미만"}</dd>
              {outcome.truth && (
                <>
                  <dt>정답과 차이 (회전 · 이동 방향)</dt>
                  <dd>
                    {fmt(rotationDiffDeg(r.T21.R, outcome.truth.R), "°", 2)} · {fmt(directionDiffDeg(r.T21.t, outcome.truth.t), "°", 1)}
                  </dd>
                </>
              )}
            </dl>
          </>
        )}
      </div>
    </div>
  );
}
