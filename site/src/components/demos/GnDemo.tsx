/**
 * 7a 데모: GN 수렴. 곡선 y = a·exp(b·t)를 점들에 맞추는 과정을 한 단계씩 본다.
 * - gaussNewton·huber·levenbergMarquardt는 useImplFns(lib/impl.ts)로 가져온다 (토글).
 * - 시작점을 멀리 두면 GN이 엉뚱한 곳으로 가고 LM은 돌아온다. 아웃라이어를 켜면 Huber의 효과가 보인다.
 * - 위 그림: 점과 곡선(선택한 단계), 아래 그림: 단계별 비용(로그 눈금).
 */
import { useMemo, useState } from "react";
import { type ImplKind } from "../../lib/impl";
import { curve, expProblem, isFiniteParams, makeExpData, T_MAX, TRUTH, type Params } from "../../lib/gnScene";
import { useImplFns } from "../../lib/useImplFns";
import ImplToggle, { defaultKind, type FnStatusEntry } from "../ui/ImplToggle";
import Slider from "../ui/Slider";
import styles from "./GnDemo.module.css";

type Step = { x: Params; cost: number; lambda?: number };
type Result = { x: Params; cost: number; iterations: number; converged: boolean; history: readonly Step[] };
type Opts = { maxIterations: number; tolerance: number; robust?: (r: number) => { rho: number; weight: number } };
type Solver = (problem: ReturnType<typeof expProblem>, x0: Params, opts: Opts) => Result;
type GnFns = {
  gaussNewton: Solver;
  levenbergMarquardt: Solver;
  huber: (r: number, k: number) => { rho: number; weight: number };
};

const FN_NAMES = ["gaussNewton", "levenbergMarquardt", "huber"] as const;
const HUBER_K = 0.1;
const MAX_ITERS = 30;

// 그림 좌표 (viewBox)
const W = 360;
const H_FIT = 220;
const H_COST = 130;
const PAD = 26;
const Y_MIN = -0.5;
const Y_MAX = 4;
const fx = (t: number) => PAD + ((W - 2 * PAD) * t) / T_MAX;
// 그림 밖으로 크게 튀는 곡선은 위아래 1만큼 넘어서 자른다 (SVG 좌표가 폭발하지 않게)
const fy = (y: number) => H_FIT - PAD - ((H_FIT - 2 * PAD) * (Math.min(Y_MAX + 1, Math.max(Y_MIN - 1, y)) - Y_MIN)) / (Y_MAX - Y_MIN);

interface Outcome {
  result: Result | null;
  error: { fn: string; message: string } | null;
}

function solve(fns: GnFns, solver: "gn" | "lm", data: ReturnType<typeof makeExpData>, x0: Params, robust: boolean): Outcome {
  let robustFn: Opts["robust"];
  if (robust) {
    try {
      // 먼저 한 번 불러서, 예외나 이상한 값이면 huber 탓으로 보여준다
      const probe = fns.huber(0.5, HUBER_K);
      if (!probe || !Number.isFinite(probe.rho) || !Number.isFinite(probe.weight)) throw new Error("{ rho, weight } 숫자를 돌려주지 않았다");
    } catch (e) {
      return { result: null, error: { fn: "huber", message: e instanceof Error ? e.message : String(e) } };
    }
    robustFn = (r) => fns.huber(r, HUBER_K);
  }
  const name = solver === "gn" ? "gaussNewton" : "levenbergMarquardt";
  try {
    const result = fns[name](expProblem(data), x0, { maxIterations: MAX_ITERS, tolerance: 1e-8, robust: robustFn });
    if (!result || !Array.isArray(result.history) || result.history.length === 0) throw new Error("history가 비어 있다");
    return { result, error: null };
  } catch (e) {
    return { result: null, error: { fn: name, message: e instanceof Error ? e.message : String(e) } };
  }
}

function path(points: [number, number][]): string {
  return points.map(([t, y], i) => `${i ? "L" : "M"}${fx(t).toFixed(1)},${fy(y).toFixed(1)}`).join(" ");
}

interface GnDemoProps {
  week: number;
  statuses: FnStatusEntry[];
}

export default function GnDemo({ week, statuses }: GnDemoProps) {
  const [kind, setKind] = useState<ImplKind>(() => defaultKind(statuses));
  const { fns, loadError } = useImplFns<GnFns>(week, FN_NAMES, kind);
  const [solver, setSolver] = useState<"gn" | "lm">("gn");
  const [robust, setRobust] = useState(false);
  const [outliers, setOutliers] = useState(false);
  const [noise, setNoise] = useState(0.05);
  const [a0, setA0] = useState(1);
  const [b0, setB0] = useState(0);
  const [step, setStep] = useState<number | null>(null); // null = 마지막 단계

  const data = useMemo(() => makeExpData(1, noise, outliers), [noise, outliers]);
  const outcome = useMemo(() => (fns ? solve(fns, solver, data, [a0, b0], robust) : null), [fns, solver, data, a0, b0, robust]);
  const history = outcome?.result?.history ?? [];
  const last = Math.max(0, history.length - 1);
  const sel = step === null ? last : Math.min(step, last);
  const cur = history[sel];
  const curOk = cur !== undefined && isFiniteParams(cur.x) && Number.isFinite(cur.cost);
  const who = kind === "mine" ? "내 구현" : "정답";

  // 설정을 바꾸면 다시 마지막 단계를 보여준다
  function reset<T>(set: (v: T) => void): (v: T) => void {
    return (v) => {
      set(v);
      setStep(null);
    };
  }

  const costs = history.map((h) => (Number.isFinite(h.cost) && h.cost > 0 ? Math.log10(h.cost) : Number.NaN));
  const finite = costs.filter(Number.isFinite);
  const cMin = finite.length ? Math.min(...finite) : 0;
  const cMax = finite.length ? Math.max(...finite, cMin + 1) : 1;
  const cx = (i: number) => PAD + ((W - 2 * PAD) * i) / Math.max(1, last);
  const cy = (c: number) => H_COST - 18 - ((H_COST - 36) * (c - cMin)) / (cMax - cMin);
  const costPath = costs
    .map((c, i) => (Number.isFinite(c) ? `${i > 0 && Number.isFinite(costs[i - 1]!) ? "L" : "M"}${cx(i).toFixed(1)},${cy(c).toFixed(1)}` : ""))
    .join(" ");

  return (
    <div className={styles.demo}>
      <ImplToggle statuses={statuses} value={kind} onChange={setKind} />

      <figure className={styles.panel} role="figure" aria-label="점과 맞춘 곡선">
        <svg className={styles.image} viewBox={`0 0 ${W} ${H_FIT}`} role="img" aria-label={`곡선 맞추기 ${sel}단계`}>
          <rect className={styles.ground} x={0} y={0} width={W} height={H_FIT} rx={6} />
          <line className={styles.axis} x1={PAD} y1={fy(0)} x2={W - PAD} y2={fy(0)} />
          {[0, 1, 2, 3].map((v) => (
            <g key={v}>
              <line className={styles.grid} x1={PAD} y1={fy(v)} x2={W - PAD} y2={fy(v)} />
              <text className={styles.tick} x={PAD - 6} y={fy(v) + 4} textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          {curOk && <path className={styles.fit} d={path(curve(cur.x))} />}
          {/* 진짜 곡선은 맞춘 곡선 위에 그린다 (수렴해서 겹쳐도 보이게) */}
          <path className={styles.truth} d={path(curve([TRUTH.a, TRUTH.b]))} />
          {data.ts.map((t, i) =>
            data.isOutlier[i] ? (
              <text key={i} className={styles.outlier} x={fx(t)} y={fy(data.ys[i]!) + 5} textAnchor="middle">
                ×
              </text>
            ) : (
              <circle key={i} className={styles.point} cx={fx(t)} cy={fy(data.ys[i]!)} r={4} />
            ),
          )}
          <text className={styles.tick} x={W - PAD} y={fy(0) + 14} textAnchor="end">
            t →
          </text>
        </svg>
        <figcaption className={styles.caption}>
          <span className={styles.lgFit}>{sel}단계 곡선</span> · <span className={styles.lgTruth}>진짜 곡선</span> · 점 = 관측
          {outliers && " · × = 아웃라이어"}
        </figcaption>
      </figure>

      <figure className={styles.panel} role="figure" aria-label="단계별 비용">
        <svg className={styles.image} viewBox={`0 0 ${W} ${H_COST}`} role="img" aria-label="단계별 비용 (로그 눈금)">
          <rect className={styles.ground} x={0} y={0} width={W} height={H_COST} rx={6} />
          <path className={styles.costLine} d={costPath} />
          {costs.map((c, i) =>
            Number.isFinite(c) ? <circle key={i} className={i === sel ? styles.costSel : styles.costDot} cx={cx(i)} cy={cy(c)} r={i === sel ? 6 : 3} /> : null,
          )}
        </svg>
        <figcaption className={styles.caption}>단계별 비용 (세로는 로그 눈금, 가로는 단계 0 → {last}). 주황 점이 보는 단계</figcaption>
      </figure>

      <div className={styles.controls}>
        <div className={styles.segment} role="group" aria-label="풀이 방법">
          {(["gn", "lm"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={solver === s} className={styles.option} onClick={() => reset(setSolver)(s)}>
              {s === "gn" ? "가우스-뉴턴" : "LM"}
            </button>
          ))}
        </div>
        <div className={styles.toggles}>
          <button type="button" aria-pressed={outliers} className={styles.chip} onClick={() => reset(setOutliers)(!outliers)}>
            아웃라이어 3개
          </button>
          <button type="button" aria-pressed={robust} className={styles.chip} onClick={() => reset(setRobust)(!robust)}>
            Huber (k = {HUBER_K})
          </button>
        </div>
        <Slider id="gn-step" label="보는 단계" value={sel} min={0} max={last} step={1} unit="" onChange={setStep} format={(v) => `${v} / ${last}`} />
        <Slider id="gn-a0" label="시작 a₀" value={a0} min={0.5} max={5} step={0.5} unit="" onChange={reset(setA0)} format={(v) => v.toFixed(1)} />
        <Slider id="gn-b0" label="시작 b₀" value={b0} min={-1} max={2.5} step={0.5} unit="" onChange={reset(setB0)} format={(v) => v.toFixed(1)} />
        <Slider id="gn-noise" label="잡음 (표준편차)" value={noise} min={0} max={0.2} step={0.05} unit="" onChange={reset(setNoise)} format={(v) => v.toFixed(2)} />
      </div>

      <div className={styles.readout}>
        <div role="status">{!fns && !loadError && <p className={styles.muted}>구현 불러오는 중…</p>}</div>
        {(loadError || outcome?.error) && (
          <div role="alert" className={styles.alerts}>
            {loadError && <p className={styles.error}>{loadError}</p>}
            {outcome?.error && (
              <p className={styles.error}>
                {who} {outcome.error.fn}가 멈췄다: {outcome.error.message}
              </p>
            )}
          </div>
        )}
        {outcome?.error && kind === "mine" && (
          <button type="button" className={styles.button} onClick={() => setKind("reference")}>
            정답으로 보기
          </button>
        )}
        {outcome?.result && (
          <dl className={styles.values}>
            <dt>{sel}단계 (a, b)</dt>
            <dd>{curOk ? `${cur.x[0].toFixed(3)}, ${cur.x[1].toFixed(3)}` : "발산 (NaN)"}</dd>
            <dt>진짜 (a, b)</dt>
            <dd>
              {TRUTH.a}, {TRUTH.b}
            </dd>
            <dt>비용</dt>
            <dd>{cur && Number.isFinite(cur.cost) ? cur.cost.toExponential(2) : "–"}</dd>
            {cur?.lambda !== undefined && (
              <>
                <dt>감쇠 λ</dt>
                <dd>{cur.lambda.toExponential(0)}</dd>
              </>
            )}
            <dt>끝난 상태</dt>
            <dd>
              {outcome.result.iterations}번 업데이트 · {outcome.result.converged ? "업데이트가 거의 0이 되어 멈춤" : "최대 반복까지 감"}
            </dd>
          </dl>
        )}
      </div>
    </div>
  );
}
