/**
 * 3D 궤적을 2D 그림으로 (11c 데모, 11d TUM 실행기). 정답 궤적이 가장 넓게 퍼진 평면(주성분 두 축)에 투영한다.
 * 합성 장면은 거의 위에서 본 모습, TUM은 손으로 든 카메라가 많이 움직인 평면이 나온다.
 */
import { EigenvalueDecomposition, Matrix } from "ml-matrix";
import type { Vec3 } from "@core/types";

export type P2 = readonly [number, number];

export interface PlotFrame {
  readonly mean: Vec3;
  /** 가장 넓게 퍼진 방향 (가로), 그다음 방향 (세로). 단위 벡터 */
  readonly axes: readonly [Vec3, Vec3];
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function plotFrame(points: readonly Vec3[]): PlotFrame {
  const n = Math.max(points.length, 1);
  const mean: Vec3 = [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n, points.reduce((s, p) => s + p[2], 0) / n];
  const C = Matrix.zeros(3, 3);
  for (const p of points) {
    const d = [p[0] - mean[0], p[1] - mean[1], p[2] - mean[2]];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C.set(r, c, C.get(r, c) + d[r]! * d[c]!);
  }
  const eig = new EigenvalueDecomposition(C, { assumeSymmetric: true });
  // 고윳값이 큰 순서
  const order = eig.realEigenvalues.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  const V = eig.eigenvectorMatrix;
  const col = (i: number): Vec3 => [V.get(0, i), V.get(1, i), V.get(2, i)];
  return { mean, axes: [col(order[0]![1]), col(order[1]![1])] };
}

export function project(f: PlotFrame, p: Vec3): P2 {
  const d: Vec3 = [p[0] - f.mean[0], p[1] - f.mean[1], p[2] - f.mean[2]];
  return [dot(d, f.axes[0]), dot(d, f.axes[1])];
}

export interface Bounds {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

export function bounds(pts: readonly P2[]): Bounds {
  if (pts.length === 0) return { x0: -1, x1: 1, y0: -1, y1: 1 };
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

const NICE = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];

/** 축척 막대 길이: 그림 폭의 maxFrac 안에 들어가는 가장 긴 깔끔한 길이 */
export function scaleBar(pxPerUnit: number, width: number, maxFrac = 0.35): number {
  const nice = NICE.filter((v) => pxPerUnit * v <= maxFrac * width).at(-1);
  // 궤적이 아주 작으면(거의 정지) 가장 짧은 깔끔한 길이도 그림을 넘는다 → 폭 안에 들어가는 길이로 줄인다
  return nice ?? (maxFrac * width) / pxPerUnit;
}
