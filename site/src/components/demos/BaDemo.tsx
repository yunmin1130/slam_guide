/**
 * 8b 데모: 번들 조정. 카메라 4대(앞 두 대 고정)와 점 24개를 함께 고친다.
 * - smallBA는 useImplFns(lib/impl.ts)로 가져온다 (토글). 내 smallBA는 내 projectionJacobian을 쓴다.
 * - 위 그림: 위에서 본 장면 (진짜 / 시작값 또는 BA 결과). 아래 그림: 정규방정식 H의 블록 구조 (화살표 모양).
 */
import { useMemo, useState } from "react";
import { type ImplKind } from "../../lib/impl";
import { BA_K, behindCount, CAMERA_COUNT, center, FIXED, hessianBlocks, makeBaScene, rmsReprojection, type Obs, type Pose } from "../../lib/baScene";
import type { V3 } from "../../lib/epipolarScene";
import { useImplFns } from "../../lib/useImplFns";
import ImplToggle, { defaultKind, type FnStatusEntry } from "../ui/ImplToggle";
import Slider from "../ui/Slider";
import styles from "./BaDemo.module.css";

type BaResult = { cameras: Pose[]; points: V3[]; cost: number; iterations: number; converged: boolean; costs: readonly number[] };
type BaFns = {
  smallBA: (
    problem: { K: typeof BA_K; cameras: readonly Pose[]; points: readonly V3[]; observations: readonly Obs[]; fixed: readonly number[] },
    opts: { maxIterations: number; tolerance: number },
  ) => BaResult;
};
const FN_NAMES = ["smallBA"] as const;

// 위에서 본 그림 (x 가로, z 세로)
const W = 360;
const H_TOP = 260;
const PAD = 20;
const X_RANGE = [-4.5, 4.5] as const;
const Z_RANGE = [-0.5, 8.5] as const;
const SCALE = Math.min((W - 2 * PAD) / (X_RANGE[1] - X_RANGE[0]), (H_TOP - 2 * PAD) / (Z_RANGE[1] - Z_RANGE[0]));
const sx = (x: number) => W / 2 + SCALE * x;
const sz = (z: number) => H_TOP - PAD - SCALE * (z - Z_RANGE[0]);

// H 블록 그림
const H_MAT = 300;

const isFiniteTriple = (v: unknown): boolean => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number" && Number.isFinite(x));

/** 내 구현이 돌려준 값이 그림을 그릴 수 있는 꼴인지 (3×3 회전, 3개짜리 이동·점, 모두 유한) */
function isPoseList(x: unknown, n: number): x is Pose[] {
  return Array.isArray(x) && x.length === n && x.every((T: Pose) => !!T && Array.isArray(T.R) && T.R.length === 3 && T.R.every(isFiniteTriple) && isFiniteTriple(T.t));
}

function isPointList(x: unknown, n: number): x is V3[] {
  return Array.isArray(x) && x.length === n && x.every(isFiniteTriple);
}

interface BaDemoProps {
  week: number;
  statuses: FnStatusEntry[];
}

export default function BaDemo({ week, statuses }: BaDemoProps) {
  const [kind, setKind] = useState<ImplKind>(() => defaultKind(statuses));
  const { fns, loadError } = useImplFns<BaFns>(week, FN_NAMES, kind);
  const [spread, setSpread] = useState(1);
  const [noise, setNoise] = useState(0.5);
  const [seed, setSeed] = useState(1);
  const [view, setView] = useState<"start" | "result">("result");

  const scene = useMemo(() => makeBaScene(seed, noise, spread), [seed, noise, spread]);
  const outcome = useMemo(() => {
    if (!fns) return null;
    try {
      const r = fns.smallBA(
        { K: BA_K, cameras: scene.start.cams, points: scene.start.pts, observations: scene.obs, fixed: [...FIXED] },
        { maxIterations: 50, tolerance: 1e-8 },
      );
      if (!r || !isPoseList(r.cameras, CAMERA_COUNT) || !isPointList(r.points, scene.truth.pts.length)) {
        throw new Error("{ cameras, points, … } 꼴의 유한한 결과를 돌려주지 않았다");
      }
      return { result: r, error: null };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [fns, scene]);
  const blocks = useMemo(() => hessianBlocks(CAMERA_COUNT, scene.truth.pts.length, scene.obs, [...FIXED]), [scene]);
  const who = kind === "mine" ? "내 구현" : "정답";
  const res = outcome?.result ?? null;
  const shown = view === "result" && res ? { cams: res.cameras, pts: res.points } : scene.start;

  const rmsStart = rmsReprojection(scene.start.cams, scene.start.pts, scene.obs);
  const rmsTruth = rmsReprojection(scene.truth.cams, scene.truth.pts, scene.obs);
  const rmsResult = res ? rmsReprojection(res.cameras, res.points, scene.obs) : Number.NaN;
  const pointErr = (pts: readonly V3[]) =>
    pts.reduce((s, X, i) => s + Math.hypot(X[0] - scene.truth.pts[i]![0], X[1] - scene.truth.pts[i]![1], X[2] - scene.truth.pts[i]![2]), 0) / pts.length;

  const nb = blocks.filled.length;
  const cell = (H_MAT - 2 * PAD) / nb;
  const nCam = blocks.freeCams.length;
  const filledCount = blocks.filled.flat().filter(Boolean).length;
  const size = nCam * 6 + (nb - nCam) * 3;
  const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "–");

  return (
    <div className={styles.demo}>
      <ImplToggle statuses={statuses} value={kind} onChange={setKind} />

      <div className={styles.segment} role="group" aria-label="위 그림에 보일 값">
        <button type="button" aria-pressed={view === "start"} className={styles.option} onClick={() => setView("start")}>
          시작값
        </button>
        <button type="button" aria-pressed={view === "result"} className={styles.option} onClick={() => setView("result")}>
          BA 결과
        </button>
      </div>

      <figure className={styles.panel} role="figure" aria-label="위에서 본 장면">
        <svg className={styles.image} viewBox={`0 0 ${W} ${H_TOP}`} role="img" aria-label={`위에서 본 장면: ${view === "result" ? "BA 결과" : "시작값"}와 진짜`}>
          <rect className={styles.ground} x={0} y={0} width={W} height={H_TOP} rx={6} />
          {scene.truth.pts.map((X, i) => (
            <circle key={`t${i}`} className={styles.truthPt} cx={sx(X[0])} cy={sz(X[2])} r={4} />
          ))}
          {shown.pts.map((X, i) => (
            <circle key={`s${i}`} className={view === "result" ? styles.resultPt : styles.startPt} cx={sx(X[0])} cy={sz(X[2])} r={2.8} />
          ))}
          {scene.truth.cams.map((T, c) => {
            const t = center(T);
            const s = center(shown.cams[c]!);
            const fixed = (FIXED as readonly number[]).includes(c);
            return (
              <g key={`c${c}`}>
                <rect className={styles.truthCam} x={sx(t[0]) - 6} y={sz(t[2]) - 6} width={12} height={12} />
                <rect
                  className={fixed ? styles.fixedCam : view === "result" ? styles.resultCam : styles.startCam}
                  x={sx(s[0]) - 4}
                  y={sz(s[2]) - 4}
                  width={8}
                  height={8}
                />
                <text className={styles.label} x={sx(t[0])} y={sz(t[2]) + 20} textAnchor="middle">
                  {c + 1}
                  {fixed ? " 고정" : ""}
                </text>
              </g>
            );
          })}
        </svg>
        <figcaption className={styles.caption}>
          위에서 본 장면. 빈 원·큰 네모 = 진짜, 작은 점·작은 네모 = {view === "result" ? "BA 결과 (원 안에 들어가면 잘 맞은 것)" : "시작값"}
        </figcaption>
      </figure>

      <figure className={styles.panel} role="figure" aria-label="정규방정식 H의 블록 구조">
        <svg className={styles.image} viewBox={`0 0 ${W} ${H_MAT}`} role="img" aria-label={`H 블록 ${nb}×${nb} 중 ${filledCount}개가 0이 아니다`}>
          <rect className={styles.ground} x={0} y={0} width={W} height={H_MAT} rx={6} />
          <g transform={`translate(${(W - (H_MAT - 2 * PAD)) / 2}, ${PAD})`}>
            {blocks.filled.map((row, i) =>
              row.map((f, j) =>
                f ? (
                  <rect
                    key={`${i}-${j}`}
                    className={i < nCam && j < nCam ? styles.hCam : i < nCam || j < nCam ? styles.hCross : styles.hPoint}
                    x={j * cell + 0.5}
                    y={i * cell + 0.5}
                    width={cell - 1}
                    height={cell - 1}
                  />
                ) : null,
              ),
            )}
            <line className={styles.split} x1={nCam * cell} y1={0} x2={nCam * cell} y2={nb * cell} />
            <line className={styles.split} x1={0} y1={nCam * cell} x2={nb * cell} y2={nCam * cell} />
          </g>
        </svg>
        <figcaption className={styles.caption}>
          H의 블록 ({nb}×{nb}): 앞 {nCam}칸은 고정 안 한 카메라(6×6), 나머지는 점(3×3). 점끼리는 대각 블록만 있다.
        </figcaption>
      </figure>

      <div className={styles.controls}>
        <Slider id="ba-spread" label="시작값 흔들기" value={spread} min={0} max={1} step={0.25} unit="" onChange={setSpread} format={(v) => v.toFixed(2)} />
        <Slider id="ba-noise" label="픽셀 잡음 (표준편차)" value={noise} min={0} max={2} step={0.5} unit=" px" onChange={setNoise} format={(v) => v.toFixed(1)} />
        <button type="button" className={styles.button} onClick={() => setSeed((s) => s + 1)}>
          새 장면
        </button>
      </div>

      <div className={styles.readout}>
        <div role="status">{!fns && !loadError && <p className={styles.muted}>구현 불러오는 중…</p>}</div>
        {(loadError || outcome?.error) && (
          <div role="alert" className={styles.alerts}>
            {loadError && <p className={styles.error}>{loadError}</p>}
            {outcome?.error && (
              <p className={styles.error}>
                {who} smallBA가 멈췄다: {outcome.error}
              </p>
            )}
          </div>
        )}
        {outcome?.error && kind === "mine" && (
          <button type="button" className={styles.button} onClick={() => setKind("reference")}>
            정답으로 보기
          </button>
        )}
        <dl className={styles.values}>
          <dt>재투영 RMS: 시작 → BA</dt>
          <dd>
            {fmt(rmsStart)} → {fmt(rmsResult)} px (진짜 장면 {fmt(rmsTruth)})
          </dd>
          {res && behindCount(res.cameras, res.points, scene.obs) > 0 && (
            <>
              <dt>카메라 뒤로 간 관측</dt>
              <dd>{behindCount(res.cameras, res.points, scene.obs)}개 (RMS에서 빠짐)</dd>
            </>
          )}
          <dt>점 위치 오차 평균: 시작 → BA</dt>
          <dd>
            {fmt(pointErr(scene.start.pts))} → {res ? fmt(pointErr(res.points)) : "–"}
          </dd>
          <dt>LM</dt>
          <dd>{res ? `${res.iterations}번 업데이트 · ${res.converged ? "업데이트가 거의 0이 되어 멈춤" : "최대 반복까지 감"}` : "–"}</dd>
          <dt>정규방정식 크기</dt>
          <dd>
            전체 {size}×{size} → Schur 보수 {nCam * 6}×{nCam * 6}
          </dd>
        </dl>
      </div>
    </div>
  );
}
