/** 5주차 정답 구현. 시그니처는 core/mine/w05.ts와 같다. */
import { Matrix, SingularValueDecomposition } from "ml-matrix";
import { nullspaceSVD } from "@core/prev/w02";
import type { Mat3, RansacOptions, RansacResult, Vec2, Vec3 } from "../types";

const MIN_POINTS = 8;

export function epipolarLine(F: Mat3, x: Vec2): Vec3 {
  // l' = F x̃ (x̃ = [x, y, 1]): 두 번째 이미지에서 짝 점이 있어야 할 직선 a·u + b·v + c = 0
  const l = [0, 1, 2].map((i) => F[i][0] * x[0] + F[i][1] * x[1] + F[i][2]);
  const n = Math.hypot(l[0]!, l[1]!);
  // 절대 크기가 아니라 c와 비교한다: F 전체의 크기(상수배)와 상관없이 같은 판정이 나오게
  if (!(n > 1e-12 * Math.hypot(l[0]!, l[1]!, l[2]!))) throw new Error("epipolarLine: 직선이 정해지지 않는다 (F·x의 a, b가 0)");
  return [l[0]! / n, l[1]! / n, l[2]! / n];
}

/** 하틀리 정규화: 무게중심을 원점으로, 원점까지 평균 거리를 √2로. 3×3 행렬 T (x̂ = T x̃) */
function normalizer(pts: readonly Vec2[]): number[][] {
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p[0], 0) / n;
  const cy = pts.reduce((s, p) => s + p[1], 0) / n;
  const mean = pts.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / n;
  const s = mean > 0 ? Math.SQRT2 / mean : 1;
  return [
    [s, 0, -s * cx],
    [0, s, -s * cy],
    [0, 0, 1],
  ];
}

function apply(T: number[][], p: Vec2): Vec2 {
  return [T[0]![0]! * p[0] + T[0]![2]!, T[1]![1]! * p[1] + T[1]![2]!];
}

export function eightPoint(pts1: readonly Vec2[], pts2: readonly Vec2[]): Mat3 {
  if (pts1.length !== pts2.length) throw new Error(`eightPoint: 대응점 개수가 다르다 (${pts1.length} ≠ ${pts2.length})`);
  if (pts1.length < MIN_POINTS) throw new Error(`eightPoint: 대응점이 ${MIN_POINTS}개 이상 필요하다 (${pts1.length}개)`);

  // 1) 좌표 정규화 (픽셀 값이 수백이라 정규화 없이 풀면 A의 조건수가 매우 커진다)
  const T1 = normalizer(pts1);
  const T2 = normalizer(pts2);

  // 2) x̂2ᵀ F̂ x̂1 = 0 을 F̂의 9개 원소(행 우선)에 대한 식 한 줄로 쌓는다
  const A = pts1.map((p, i) => {
    const [u1, v1] = apply(T1, p);
    const [u2, v2] = apply(T2, pts2[i]!);
    return [u2 * u1, u2 * v1, u2, v2 * u1, v2 * v1, v2, u1, v1, 1];
  });
  const f = nullspaceSVD(A); // 2주차: |f| = 1 에서 |A f| 최소

  // 3) 랭크 2 강제: 가장 작은 특이값을 0으로 (진짜 F는 랭크 2, 잡음 때문에 랭크 3이 된다)
  const svd = new SingularValueDecomposition(new Matrix([f.slice(0, 3), f.slice(3, 6), f.slice(6, 9)]));
  const S = Matrix.diag([svd.diagonal[0]!, svd.diagonal[1]!, 0]);
  const Fhat = svd.leftSingularVectors.mmul(S).mmul(svd.rightSingularVectors.transpose());

  // 4) 정규화 되돌리기: F = N2ᵀ F̄ N1 (레슨 표기), 그리고 ‖F‖ = 1
  const F = new Matrix(T2).transpose().mmul(Fhat).mmul(new Matrix(T1));
  const norm = F.norm("frobenius");
  const row = (i: number): Vec3 => [F.get(i, 0) / norm, F.get(i, 1) / norm, F.get(i, 2) / norm];
  return [row(0), row(1), row(2)];
}

/** 0 ~ n-1 에서 서로 다른 k개를 고른다 (부분 Fisher-Yates) */
function sampleIndices(n: number, k: number, rng: () => number): number[] {
  const pool = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (n - i));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, k);
}

export function ransac<T, M>(items: readonly T[], opts: RansacOptions<T, M>): RansacResult<M> | null {
  const { sampleSize, fit, error, threshold, iterations, rng } = opts;
  if (sampleSize > items.length || iterations < 1) return null;

  let best: RansacResult<M> | null = null;
  for (let it = 0; it < iterations; it++) {
    const sample = sampleIndices(items.length, sampleSize, rng).map((i) => items[i]!);
    const model = fit(sample);
    if (model === null) continue; // 퇴화 표본 (예: 같은 점, 한 직선 위의 점들)
    const inliers: number[] = [];
    items.forEach((item, i) => {
      if (error(model, item) < threshold) inliers.push(i);
    });
    // 동점이면 먼저 찾은 것을 둔다
    if (!best || inliers.length > best.inliers.length) best = { model, inliers };
  }
  return best;
}
