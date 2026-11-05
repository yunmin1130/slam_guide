/**
 * 2주차 개념 그림 MatrixWarp의 행렬 preset과 판정 (그림 전용, core 아님).
 * preset은 슬라이더 눈금 위에서 고유벡터·최소 방향에 정확히 닿도록 골랐다. warpScene.test.ts가 보장한다.
 */
import { apply, norm, rotation, svd2, type M2, type V2 } from "./mat2";

export interface Preset {
  id: string;
  label: string;
  m: M2;
}

export const DEG = Math.PI / 180;
const R5 = Math.sqrt(5);
/** 본문 예시: σ가 3, 1로 딱 떨어진다 */
export const EXAMPLE: M2 = [3 / R5, 0, 4 / R5, 5 / R5];
/** 본문 영공간 예시: (1, −1) 방향이 0으로 눌린다 */
export const RANK1: M2 = [1, 1, 2, 2];

export const EIGEN_PRESETS: readonly Preset[] = [
  { id: "sym", label: "대칭 [[2,1],[1,2]]", m: [2, 1, 1, 2] },
  { id: "nonsym", label: "비대칭", m: [1.5, 1, 0, 0.5] },
  { id: "rot", label: "회전 30°", m: rotation(30 * DEG) },
];
export const SVD_PRESETS: readonly Preset[] = [
  { id: "example", label: "본문 예시", m: EXAMPLE },
  { id: "shear", label: "밀기 [[1,1],[0,1]]", m: [1, 1, 0, 1] },
  { id: "rank1", label: "랭크 1", m: RANK1 },
];
export const MIN_PRESETS: readonly Preset[] = [
  { id: "example", label: "본문 예시", m: EXAMPLE },
  { id: "rank1", label: "랭크 1 [[1,1],[2,2]]", m: RANK1 },
];

/** 슬라이더 눈금 (도) */
export const EIGEN_STEP = 5;
export const MIN_STEP = 3;
/** 같은 선 위로 보는 각도 허용치 (도) */
const PARALLEL_TOL_DEG = 1.5;

export function findPreset(list: readonly Preset[], id: string): Preset {
  return list.find((p) => p.id === id) ?? list[0]!;
}

export function sliderAngles(step: number): number[] {
  return Array.from({ length: Math.round(360 / step) }, (_, i) => i * step);
}

export const unitAt = (deg: number): V2 => [Math.cos(deg * DEG), Math.sin(deg * DEG)];

/** 두 벡터 사이 각 (0~180°). 0 벡터면 NaN */
export function angleBetween(a: V2, b: V2): number {
  const n = norm(a) * norm(b);
  if (n < 1e-9) return Number.NaN;
  return Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / n))) / DEG;
}

/** 그림 범위: 단위 원과 변환된 원이 여유 있게 들어가게 */
export function rangeFor(M: M2): number {
  return Math.max(1.5, svd2(M).sigma[0] * 1.3);
}

/** x 방향(도)에서 Ax가 x와 같은 선 위인지. lambda = x·Ax (|x| = 1이라 같은 선이면 고유값) */
export function eigenProbe(A: M2, deg: number): { x: V2; Ax: V2; angle: number; hit: boolean; lambda: number } {
  const x = unitAt(deg);
  const Ax = apply(A, x);
  const angle = angleBetween(x, Ax);
  const hit = angle < PARALLEL_TOL_DEG || angle > 180 - PARALLEL_TOL_DEG;
  return { x, Ax, angle, hit, lambda: Ax[0] * x[0] + Ax[1] * x[1] };
}

/** x 방향(도)에서 |Ax|가 가장 짧은 값(σ₂)에 닿았는지 */
export function minimizeProbe(A: M2, deg: number): { x: V2; Ax: V2; len: number; hit: boolean; sigma: V2 } {
  const { sigma } = svd2(A);
  const x = unitAt(deg);
  const Ax = apply(A, x);
  const len = norm(Ax);
  return { x, Ax, len, hit: len - sigma[1] < 1e-6 * Math.max(1, sigma[0]), sigma };
}
