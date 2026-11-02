/**
 * 7주차 GnDemo의 장면 (화면 표시용 보조 계산).
 * 곡선 y = a·exp(b·t)를 잡음 섞인 점들에 맞춘다. 풀이(gaussNewton, levenbergMarquardt, huber)는
 * 여기서 하지 않는다 → 데모가 lib/impl.ts로 core 함수를 가져온다.
 */
import { seededRng } from "./epipolarScene";

export const TRUTH = { a: 2, b: -0.5 } as const;
export const T_MAX = 4;
const COUNT = 20;
/** 아웃라이어로 바꿀 점의 번호 (앞·가운데·뒤) */
const OUTLIER_IDX = [3, 9, 15];
const OUTLIER_JUMP = 1.5;

export interface ExpData {
  ts: number[];
  ys: number[];
  isOutlier: boolean[];
}

function gaussian(rng: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-12))) * Math.cos(2 * Math.PI * rng());
}

export function makeExpData(seed: number, noise: number, withOutliers: boolean): ExpData {
  const rng = seededRng(seed);
  const ts = Array.from({ length: COUNT }, (_, i) => (i / (COUNT - 1)) * T_MAX);
  const ys = ts.map((t) => TRUTH.a * Math.exp(TRUTH.b * t) + gaussian(rng) * noise);
  const isOutlier = ts.map((_, i) => withOutliers && OUTLIER_IDX.includes(i));
  isOutlier.forEach((o, i) => {
    if (o) ys[i] = ys[i]! + OUTLIER_JUMP;
  });
  return { ts, ys, isOutlier };
}

export type Params = readonly [number, number];

/** core의 LsqProblem과 같은 모양 (변수는 [a, b]) */
export function expProblem({ ts, ys }: ExpData) {
  return {
    residual: ([a, b]: Params) => ts.map((t, i) => a * Math.exp(b * t) - ys[i]!),
    jacobian: ([a, b]: Params) => ts.map((t) => [Math.exp(b * t), a * t * Math.exp(b * t)]),
    plus: (x: Params, d: readonly number[]): Params => [x[0] + d[0]!, x[1] + d[1]!],
  };
}

/** 화면에 그릴 곡선 점들 (t 0 ~ T_MAX) */
export function curve([a, b]: Params, samples = 60): [number, number][] {
  return Array.from({ length: samples }, (_, i) => {
    const t = (i / (samples - 1)) * T_MAX;
    return [t, a * Math.exp(b * t)];
  });
}

export function isFiniteParams(x: unknown): x is Params {
  return Array.isArray(x) && x.length === 2 && x.every((v) => typeof v === "number" && Number.isFinite(v));
}
