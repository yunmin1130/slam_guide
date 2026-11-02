/** 6주차 정답 구현. 시그니처는 core/mine/w06.ts와 같다. */
import { determinant, Matrix, SingularValueDecomposition } from "ml-matrix";
import { nullspaceSVD } from "@core/prev/w02";
import type { Mat3, SE3, Vec2, Vec3 } from "../types";

const PNP_MIN_POINTS = 6;

function toMat3(A: Matrix): Mat3 {
  const r = (i: number): Vec3 => [A.get(i, 0), A.get(i, 1), A.get(i, 2)];
  return [r(0), r(1), r(2)];
}

function mulVec(R: Mat3, v: Vec3): Vec3 {
  return [
    R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2],
    R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2],
    R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2],
  ];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * 후보 (R, t)에서 대응 하나의 두 깊이 (Z1, Z2). Z2·x̂2 = Z1·R·x̂1 + t 를 x̂2와 외적해서 Z1을 구한다.
 * 두 광선이 거의 평행하면 깊이를 정할 수 없어 null.
 */
function depths(R: Mat3, t: Vec3, x1: Vec2, x2: Vec2): [number, number] | null {
  const a = mulVec(R, [x1[0], x1[1], 1]);
  const h2: Vec3 = [x2[0], x2[1], 1];
  const c = cross(h2, a);
  const cc = dot(c, c);
  if (!(cc > 1e-18)) return null;
  const z1 = -dot(cross(h2, t), c) / cc;
  return [z1, z1 * a[2] + t[2]];
}

export function decomposeE(E: Mat3, x1: readonly Vec2[], x2: readonly Vec2[]): SE3 {
  if (x1.length !== x2.length) throw new Error(`decomposeE: 대응점 개수가 다르다 (${x1.length} ≠ ${x2.length})`);
  if (x1.length === 0) throw new Error("decomposeE: 대응점이 하나 이상 필요하다");

  const svd = new SingularValueDecomposition(new Matrix(E.map((r) => [...r])));
  let U = svd.leftSingularVectors;
  let V = svd.rightSingularVectors;
  // E와 -E는 같은 기하라서 U, V의 부호는 마음대로 바꿔도 된다 → det = +1 로 맞춰야 R이 회전(반사 아님)이 된다
  if (determinant(U) < 0) U = U.mul(-1);
  if (determinant(V) < 0) V = V.mul(-1);

  const W = new Matrix([
    [0, -1, 0],
    [1, 0, 0],
    [0, 0, 1],
  ]);
  const Ra = toMat3(U.mmul(W).mmul(V.transpose()));
  const Rb = toMat3(U.mmul(W.transpose()).mmul(V.transpose()));
  const u3: Vec3 = [U.get(0, 2), U.get(1, 2), U.get(2, 2)]; // 크기 1 (이동의 크기는 사진만으로 모른다)
  const neg: Vec3 = [-u3[0], -u3[1], -u3[2]];
  const candidates: SE3[] = [
    { R: Ra, t: u3 },
    { R: Ra, t: neg },
    { R: Rb, t: u3 },
    { R: Rb, t: neg },
  ];

  // 키랄리티(cheirality): 두 카메라 모두 앞(깊이 > 0)에 점이 가장 많이 오는 후보. 동점이면 먼저 나온 후보
  let best: SE3 | null = null;
  let bestCount = 0;
  for (const c of candidates) {
    let count = 0;
    x1.forEach((p, i) => {
      const z = depths(c.R, c.t, p, x2[i]!);
      if (z && z[0] > 0 && z[1] > 0) count++;
    });
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  if (!best) throw new Error("decomposeE: 두 카메라 앞에 오는 점이 하나도 없다");
  return best;
}

export function triangulate(T1: SE3, T2: SE3, x1: Vec2, x2: Vec2): Vec3 {
  // 카메라마다 x × (P X) = 0 에서 독립인 식 두 줄: x·P[2] − P[0], y·P[2] − P[1]  (P = [R | t], 3×4)
  const rows = (T: SE3, x: Vec2): number[][] => {
    const P = T.R.map((r, i) => [...r, T.t[i]!]);
    return [P[2]!.map((v, j) => x[0] * v - P[0]![j]!), P[2]!.map((v, j) => x[1] * v - P[1]![j]!)];
  };
  const h = nullspaceSVD([...rows(T1, x1), ...rows(T2, x2)]); // 2주차: |h| = 1 에서 |A h| 최소
  // 동차좌표의 마지막 성분이 0이면 무한히 먼 점 (두 광선이 평행)
  if (!(Math.abs(h[3]!) > 1e-12)) throw new Error("triangulate: 두 광선이 평행해서 점을 정할 수 없다");
  return [h[0]! / h[3]!, h[1]! / h[3]!, h[2]! / h[3]!];
}

export function pnpDLT(Xw: readonly Vec3[], x: readonly Vec2[]): SE3 {
  if (Xw.length !== x.length) throw new Error(`pnpDLT: 3D 점과 2D 점 개수가 다르다 (${Xw.length} ≠ ${x.length})`);
  if (Xw.length < PNP_MIN_POINTS) throw new Error(`pnpDLT: 점이 ${PNP_MIN_POINTS}개 이상 필요하다 (${Xw.length}개)`);

  // x̂ × (P X̃) = 0 의 독립인 두 줄을 P의 12개 원소(행 우선)에 대해 쌓는다
  const A = Xw.flatMap((X, i) => {
    const [u, v] = x[i]!;
    const h = [X[0], X[1], X[2], 1];
    return [
      [...h, 0, 0, 0, 0, ...h.map((c) => -u * c)],
      [0, 0, 0, 0, ...h, ...h.map((c) => -v * c)],
    ];
  });
  const p = nullspaceSVD(A);
  let P = new Matrix([p.slice(0, 4), p.slice(4, 8), p.slice(8, 12)]);

  // P = λ[R | t]. 앞 3×3의 행렬식 부호가 λ의 부호다 (det(λR) = λ³) → λ > 0 으로 맞춘다 (점이 카메라 앞)
  if (determinant(P.subMatrix(0, 2, 0, 2)) < 0) P = P.mul(-1);
  const M = P.subMatrix(0, 2, 0, 2);
  // 잡음 때문에 M/λ는 정확한 회전이 아니다 → 가장 가까운 회전 U·Vᵀ, 크기 λ는 특이값 평균
  const svd = new SingularValueDecomposition(M);
  const R = svd.leftSingularVectors.mmul(svd.rightSingularVectors.transpose());
  const s = svd.diagonal;
  const lambda = (s[0]! + s[1]! + s[2]!) / 3;
  return { R: toMat3(R), t: [P.get(0, 3) / lambda, P.get(1, 3) / lambda, P.get(2, 3) / lambda] };
}
