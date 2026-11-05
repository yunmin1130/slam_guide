/**
 * 2주차 데모: 점들에 직선 y = a·t + c를 손으로 맞춰 보고, 최소제곱 답과 비교한다.
 * - solveLeastSquares는 core를 직접 import하지 않고 useImplFns(lib/impl.ts)로 가져온다 (토글).
 * - 잔차는 세로 막대, 잔차의 제곱은 그 막대를 한 변으로 하는 정사각형 넓이로 그린다 (제곱합 = 넓이 합, LsPlot).
 * - 최소제곱 답에서는 잔차 벡터가 A의 두 열(t 열, 1 열)과 내적 0이 되는 것을 숫자로 보여 준다.
 */
import { useId, useMemo, useState } from "react";
import type { ImplKind } from "../../lib/impl";
import { columnDots, designMatrix, POINT_SETS, residuals, sse, type Point } from "../../lib/lsScene";
import { useImplFns } from "../../lib/useImplFns";
import ImplToggle, { defaultKind, type FnStatusEntry } from "../ui/ImplToggle";
import Slider from "../ui/Slider";
import LsPlot from "./LsPlot";
import styles from "./LeastSquaresDemo.module.css";

type Fns = { solveLeastSquares: (A: number[][], b: number[]) => number[] };
const FN_NAMES = ["solveLeastSquares"] as const;

const fmt = (v: number, d = 2) => {
  const s = v.toFixed(d);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
};
const vec = (r: readonly number[]) => `[${r.map((v) => fmt(v)).join(", ")}]`;

interface Solved {
  ac: [number, number] | null;
  error: string | null;
}

function solve(fns: Fns | null, points: readonly Point[]): Solved {
  if (!fns) return { ac: null, error: null };
  try {
    const { A, b } = designMatrix(points);
    const x = fns.solveLeastSquares(A, b);
    if (!Array.isArray(x) || x.length !== 2 || !x.every(Number.isFinite)) throw new Error(`길이 2인 숫자 배열이 아니다: ${JSON.stringify(x)}`);
    return { ac: [x[0]!, x[1]!], error: null };
  } catch (e) {
    return { ac: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function statusText(atBest: boolean, hasBest: boolean): string {
  if (atBest) return "제곱합이 가장 작다. 이때 잔차 r은 A의 두 열과 내적이 0, 즉 열공간에 수직이다";
  if (!hasBest) return "슬라이더로 정사각형 넓이 합을 줄여 보자";
  return "슬라이더로 정사각형 넓이 합을 줄여 보자. 두 내적 값이 0에서 멀수록 아직 덜 맞춘 것이다";
}

interface ReadoutProps {
  a: number;
  c: number;
  r: readonly number[];
  dots: readonly [number, number];
  best: { ac: [number, number]; sse: number } | null;
  who: string;
}

function Readout({ a, c, r, dots, best, who }: ReadoutProps) {
  return (
    <dl className={styles.values}>
      <dt>내 직선</dt>
      <dd>
        y = {fmt(a)}·t + {fmt(c)}
      </dd>
      <dt>잔차 r</dt>
      <dd>{vec(r)}</dd>
      <dt>제곱합 |r|²</dt>
      <dd>{fmt(sse(r), 3)}</dd>
      <dt>최소제곱 ({who})</dt>
      <dd>{best ? `y = ${fmt(best.ac[0], 3)}·t + ${fmt(best.ac[1], 3)}` : "–"}</dd>
      <dt>그때 |r|²</dt>
      <dd>{best ? fmt(best.sse, 3) : "–"}</dd>
      <dt>r · (t 열)</dt>
      <dd>{fmt(dots[0], 3)}</dd>
      <dt>r · (1 열)</dt>
      <dd>{fmt(dots[1], 3)}</dd>
    </dl>
  );
}

interface ControlsProps {
  setId: string;
  onSet: (id: string) => void;
  a: number;
  c: number;
  onA: (v: number) => void;
  onC: (v: number) => void;
  squares: boolean;
  onSquares: (v: boolean) => void;
  overlay: boolean;
  onOverlay: (v: boolean) => void;
  /** 최소제곱 답 (a, c). 아직 없으면(불러오는 중·오류) 관련 버튼을 끈다 */
  best: [number, number] | null;
}

function LsControls({ setId, onSet, a, c, onA, onC, squares, onSquares, overlay, onOverlay, best }: ControlsProps) {
  const id = useId().replace(/:/g, "");
  return (
    <div className={styles.controls}>
      <div className={styles.segment} role="group" aria-label="점 묶음">
        {POINT_SETS.map((s) => (
          <button key={s.id} type="button" className={styles.option} aria-pressed={setId === s.id} onClick={() => onSet(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <Slider id={`${id}-a`} label="기울기 a" value={a} min={-1} max={2} step={0.05} unit="" onChange={onA} format={(v) => fmt(v)} />
      <Slider id={`${id}-c`} label="절편 c" value={c} min={-1} max={4} step={0.05} unit="" onChange={onC} format={(v) => fmt(v)} />
      <div className={styles.toggles}>
        <button type="button" className={styles.chip} aria-pressed={squares} onClick={() => onSquares(!squares)}>
          제곱 넓이
        </button>
        <button type="button" className={styles.chip} aria-pressed={overlay} onClick={() => onOverlay(!overlay)} disabled={!best}>
          최소제곱 직선 겹치기
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={!best}
          onClick={() => {
            if (!best) return;
            onA(best[0]);
            onC(best[1]);
          }}
        >
          최소제곱 답으로 맞추기
        </button>
      </div>
    </div>
  );
}

interface Props {
  week: number;
  statuses: FnStatusEntry[];
}

export default function LeastSquaresDemo({ week, statuses }: Props) {
  const [kind, setKind] = useState<ImplKind>(() => defaultKind(statuses));
  const { fns, loadError } = useImplFns<Fns>(week, FN_NAMES, kind);
  const [setId, setSetId] = useState(POINT_SETS[0]!.id);
  const [a, setA] = useState(0);
  const [c, setC] = useState(2);
  const [squares, setSquares] = useState(true);
  const [overlay, setOverlay] = useState(false);
  const points = (POINT_SETS.find((s) => s.id === setId) ?? POINT_SETS[0]!).points;
  const solved = useMemo(() => solve(fns, points), [fns, points]);
  const who = kind === "mine" ? "내 구현" : "정답";

  const r = residuals(points, a, c);
  const best = solved.ac ? { ac: solved.ac, sse: sse(residuals(points, ...solved.ac)) } : null;
  const atBest = best !== null && sse(r) - best.sse < 1e-6;

  return (
    <div className={styles.demo}>
      <ImplToggle statuses={statuses} value={kind} onChange={setKind} />

      <figure className={styles.panel} role="figure" aria-label="점과 직선, 잔차">
        <LsPlot
          points={points}
          a={a}
          c={c}
          residuals={r}
          squares={squares}
          best={overlay ? solved.ac : null}
          label={`직선 y = ${fmt(a)}t + ${fmt(c)}, 제곱합 ${fmt(sse(r), 3)}`}
        />
        <figcaption className={styles.caption}>
          <span className={styles.lgMine}>내가 고른 직선</span> <span className={styles.lgRes}>잔차 rᵢ (세로 막대)</span>
          {squares && <span className={styles.lgItem}>연한 정사각형 = rᵢ²</span>}
          {overlay && <span className={styles.lgBest}>최소제곱 직선</span>}
        </figcaption>
      </figure>

      <LsControls
        setId={setId}
        onSet={setSetId}
        a={a}
        c={c}
        onA={setA}
        onC={setC}
        squares={squares}
        onSquares={setSquares}
        overlay={overlay}
        onOverlay={setOverlay}
        best={solved.ac}
      />

      <div className={styles.readout}>
        <div role="status">{!fns && !loadError && <p className={styles.muted}>구현 불러오는 중…</p>}</div>
        {(loadError || solved.error) && (
          <div role="alert" className={styles.alerts}>
            {loadError && <p className={styles.error}>{loadError}</p>}
            {solved.error && (
              <p className={styles.error}>
                {who} solveLeastSquares가 멈췄다: {solved.error}
              </p>
            )}
          </div>
        )}
        {solved.error && kind === "mine" && (
          <button type="button" className={styles.button} onClick={() => setKind("reference")}>
            정답으로 보기
          </button>
        )}
        <Readout a={a} c={c} r={r} dots={columnDots(points, r)} best={best} who={who} />
        <p className={styles.status} data-hit={atBest}>
          {statusText(atBest, best !== null)}
        </p>
      </div>
    </div>
  );
}
