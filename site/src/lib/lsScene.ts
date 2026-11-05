/**
 * 2주차 데모(LeastSquaresDemo)의 점 묶음과 계산. 최소제곱 해는 데모가 impl.ts로 불러온 solveLeastSquares로 구한다.
 * 점 하나 (tᵢ, yᵢ)가 식 하나 a·tᵢ + c = yᵢ, 즉 A의 행 [tᵢ, 1]과 b의 성분 yᵢ가 된다.
 */
export type Point = readonly [number, number];

export interface PointSet {
  id: string;
  label: string;
  points: readonly Point[];
}

/** 화면 범위: t 0~5, y 0~5 */
export const T_RANGE = [0, 5] as const;
export const Y_RANGE = [0, 5] as const;

export const POINT_SETS: readonly PointSet[] = [
  {
    id: "basic",
    label: "점 5개",
    points: [
      [0.5, 1.2],
      [1.5, 1.5],
      [2.5, 2.6],
      [3.5, 2.7],
      [4.5, 3.6],
    ],
  },
  {
    id: "outlier",
    label: "튀는 점 하나",
    points: [
      [0.5, 1.2],
      [1.5, 1.5],
      [2.5, 4.6],
      [3.5, 2.7],
      [4.5, 3.6],
    ],
  },
  {
    id: "three",
    label: "본문 예시 3개",
    points: [
      [0, 1],
      [1, 1],
      [2, 3],
    ],
  },
];

/** 점들 → A(행 [t, 1])와 b(y) */
export function designMatrix(points: readonly Point[]): { A: number[][]; b: number[] } {
  return { A: points.map(([t]) => [t, 1]), b: points.map(([, y]) => y) };
}

/** 잔차 rᵢ = yᵢ − (a·tᵢ + c). 점이 직선보다 위면 양수 */
export function residuals(points: readonly Point[], a: number, c: number): number[] {
  return points.map(([t, y]) => y - (a * t + c));
}

export function sse(r: readonly number[]): number {
  return r.reduce((s, v) => s + v * v, 0);
}

/** 잔차와 A의 두 열(t 열, 1 열)의 내적. 최소제곱 해에서는 둘 다 0이다 */
export function columnDots(points: readonly Point[], r: readonly number[]): [number, number] {
  return [points.reduce((s, [t], i) => s + t * r[i]!, 0), r.reduce((s, v) => s + v, 0)];
}
