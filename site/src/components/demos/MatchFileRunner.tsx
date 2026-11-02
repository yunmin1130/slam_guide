/**
 * 5주차 "내 사진으로 해보기": export_matches.py가 만든 대응점 JSON(+ 선택: calib.json)을 올리면
 * 내(또는 정답) eightPoint·ransac으로 돌려 inlier 수와 행렬의 특이값을 보여준다.
 * - 어안 캘리브레이션: 4주차 unprojectFisheye로 베어링 벡터 → b/b_z (정규화 좌표) → 결과는 E.
 * - 핀홀 캘리브레이션: K⁻¹ 후 4주차 undistort로 왜곡을 푼다 → E. 캘리브레이션이 없으면 픽셀 그대로 → F.
 * - export_matches.py의 OpenCV 비교와 같은 방식(같은 점 제외, 같은 2px 임계값)으로 맞춰 둔다.
 * - 파일은 이 기기 안에서만 읽고 저장하지 않는다.
 */
import { Matrix, SingularValueDecomposition } from "ml-matrix";
import { useEffect, useRef, useState } from "react";
import { readText, toNormalized } from "../../lib/matchPrep";
import { isFiniteMatrix, makeFitter, pointLineDistance, seededRng, type M3, type V3 } from "../../lib/epipolarScene";
import { parseCalib, parseMatches, type Calib, type V2 } from "../../lib/matchesFile";
import styles from "./EpipolarDemo.module.css";

export type EpipolarFns = {
  epipolarLine: (F: M3, x: V2) => V3;
  eightPoint: (a: readonly V2[], b: readonly V2[]) => M3;
  ransac: <T, M>(
    items: readonly T[],
    opts: { sampleSize: number; fit: (s: readonly T[]) => M | null; error: (m: M, t: T) => number; threshold: number; iterations: number; rng: () => number },
  ) => { model: M; inliers: readonly number[] } | null;
};

const THRESHOLD_PX = 2;
const ITERATIONS = 1000;

interface Outcome {
  who: string;
  kind: "E" | "F";
  /** 쓴 캘리브레이션 모델 (없으면 null) — 뺀 점의 이유를 다르게 적으려고 */
  model: Calib["model"] | null;
  used: number;
  dropped: number;
  inliers: number;
  sigma: [number, number, number];
}

/** 캘리브레이션이 있으면 정규화 좌표(→ E), 없으면 픽셀 그대로(→ F) */
async function prepare(pts1: V2[], pts2: V2[], calib: Calib | null): Promise<{ a: V2[]; b: V2[]; scale: number; kind: "E" | "F" }> {
  if (!calib) return { a: pts1, b: pts2, scale: 1, kind: "F" };
  const { a, b, scale } = await toNormalized(pts1, pts2, calib);
  return { a, b, scale, kind: "E" };
}

async function run(fns: EpipolarFns, who: string, matchesFile: File, calibFile: File | null): Promise<Outcome> {
  const { pts1, pts2 } = parseMatches(await readText(matchesFile));
  const calib = calibFile ? parseCalib(await readText(calibFile)) : null;
  const { a, b, scale, kind } = await prepare(pts1, pts2, calib);
  if (a.length < 8) throw new Error(`쓸 수 있는 대응점이 ${a.length}개뿐이다 (8개 이상 필요)`);
  // 계산이 길 수 있어서, "계산 중…"이 먼저 화면에 그려지게 한 번 양보한다
  await new Promise((resolve) => setTimeout(resolve, 0));

  const idx = a.map((_, i) => i);
  const fitter = makeFitter(fns.eightPoint, a, b);
  const r = fns.ransac(idx, {
    sampleSize: 8,
    fit: fitter.fit,
    error: (F, i) => pointLineDistance(F, a[i]!, b[i]!) * scale,
    threshold: THRESHOLD_PX,
    iterations: ITERATIONS,
    rng: seededRng(1),
  });
  if (!r) {
    const why = fitter.lastError();
    throw new Error(`RANSAC이 모델을 하나도 찾지 못했다${why ? ` (8개 표본에서 eightPoint 오류: ${why})` : ""}`);
  }
  // inlier 전부로 다시 맞추고, 그 행렬로 inlier를 다시 센다 (데모와 같은 방식)
  const final = (r.inliers.length >= 8 ? fitter.fit(r.inliers) : null) ?? r.model;
  if (!isFiniteMatrix(final)) throw new Error("ransac이 돌려준 행렬에 NaN이 있거나 3×3이 아니다");
  const inliers = idx.filter((i) => pointLineDistance(final, a[i]!, b[i]!) * scale < THRESHOLD_PX).length;
  const s = new SingularValueDecomposition(new Matrix(final.map((row) => [...row]))).diagonal;
  const top = s[0]! || 1;
  return { who, kind, model: calib?.model ?? null, used: a.length, dropped: pts1.length - a.length, inliers, sigma: [s[0]! / top, s[1]! / top, s[2]! / top] };
}

interface MatchFileRunnerProps {
  fns: EpipolarFns;
  who: string;
}

export default function MatchFileRunner({ fns, who }: MatchFileRunnerProps) {
  const [matches, setMatches] = useState<File | null>(null);
  const [calib, setCalib] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 실행 번호: 계산 도중 조건(구현·파일)이 바뀌면 끝난 옛 계산의 결과를 버린다
  const runIdRef = useRef(0);
  const busyRef = useRef(false);
  const [discarded, setDiscarded] = useState(false);

  // 구현(토글)이나 파일이 바뀌면 이전 결과를 지운다 (다른 조건의 결과를 지금 것으로 오해하지 않게)
  useEffect(() => {
    runIdRef.current++;
    setDiscarded(busyRef.current);
    busyRef.current = false;
    setBusy(false);
    setOutcome(null);
    setError(null);
  }, [fns, matches, calib]);

  async function start() {
    if (!matches) return;
    const id = ++runIdRef.current;
    busyRef.current = true;
    setBusy(true);
    setDiscarded(false);
    setError(null);
    setOutcome(null);
    try {
      const out = await run(fns, who, matches, calib);
      if (id === runIdRef.current) setOutcome(out);
    } catch (e) {
      if (id === runIdRef.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      // 옛 계산이 늦게 끝나도 새 계산의 "계산 중"을 끄지 않게
      if (id === runIdRef.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <details className={styles.runner}>
      <summary>내 사진으로 해보기 (JetBot 대응점 파일)</summary>
      <p className={styles.note}>
        PC에서 <code>datasets/export_matches.py</code>로 만든 JSON을 고른다. 파일은 이 기기 안에서만 읽고 어디에도 올리지 않는다.
      </p>
      <label className={styles.file}>
        대응점 파일 (필수)
        <input type="file" accept=".json,application/json" disabled={busy} onChange={(e) => setMatches(e.currentTarget.files?.[0] ?? null)} />
      </label>
      <label className={styles.file}>
        calib.json (선택: 있으면 E, 없으면 F)
        <input type="file" accept=".json,application/json" disabled={busy} onChange={(e) => setCalib(e.currentTarget.files?.[0] ?? null)} />
      </label>
      <button type="button" className={styles.button} disabled={!matches || busy} onClick={start}>
        {busy ? "계산 중…" : `${who}으로 실행`}
      </button>
      <div role="status">
        {discarded && <p className={styles.note}>계산 중에 구현이 바뀌어서 그 결과는 버렸다. 다시 실행한다.</p>}
        {error && <p className={styles.error}>{error}</p>}
        {outcome && (
          <dl className={styles.values}>
            <dt>쓴 구현</dt>
            <dd>{outcome.who}</dd>
            <dt>쓴 대응점</dt>
            <dd>
              {outcome.used}
              {outcome.dropped > 0 &&
                (outcome.model === "fisheye"
                  ? ` (광축에서 84° 넘게 벗어난 ${outcome.dropped}개 뺌)`
                  : ` (왜곡을 풀지 못한 ${outcome.dropped}개 뺌)`)}
            </dd>
            <dt>RANSAC inlier</dt>
            <dd>
              {outcome.inliers} ({((outcome.inliers / outcome.used) * 100).toFixed(0)}%)
            </dd>
            <dt>{outcome.kind}의 특이값 (σ₁ = 1)</dt>
            <dd>{outcome.sigma.map((v) => v.toFixed(3)).join(", ")}</dd>
          </dl>
        )}
      </div>
    </details>
  );
}
