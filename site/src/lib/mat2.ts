/**
 * 2×2 행렬 계산 (2주차 개념 그림 MatrixWarp 전용).
 * 과제 함수(core)가 아니라 그림을 그리기 위한 닫힌 식이다. 행렬은 행 우선 [a, b, c, d] = [[a, b], [c, d]].
 */
export type M2 = readonly [number, number, number, number];
export type V2 = readonly [number, number];

const EPS = 1e-12;

export function apply(A: M2, v: V2): V2 {
  return [A[0] * v[0] + A[1] * v[1], A[2] * v[0] + A[3] * v[1]];
}

export function mul(A: M2, B: M2): M2 {
  return [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]];
}

export function transpose(A: M2): M2 {
  return [A[0], A[2], A[1], A[3]];
}

export function det(A: M2): number {
  return A[0] * A[3] - A[1] * A[2];
}

export function norm(v: V2): number {
  return Math.hypot(v[0], v[1]);
}

/** 각도 θ(라디안)만큼 반시계로 돌리는 회전행렬 */
export function rotation(theta: number): M2 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [c, -s, s, c];
}

/** 90° 돌린 벡터 (직교하는 짝을 만들 때) */
function perp(v: V2): V2 {
  return [-v[1], v[0]];
}

function unit(v: V2): V2 {
  const n = norm(v);
  return [v[0] / n, v[1] / n];
}

/** 대칭 행렬 [[p, q], [q, r]]의 고유분해. 값은 큰 것부터, 벡터는 서로 수직인 단위벡터 */
function symmetricEigen(p: number, q: number, r: number): { values: V2; vectors: [V2, V2] } {
  const mid = (p + r) / 2;
  const rad = Math.hypot((p - r) / 2, q);
  const theta = 0.5 * Math.atan2(2 * q, p - r);
  const v1: V2 = [Math.cos(theta), Math.sin(theta)];
  return { values: [mid + rad, mid - rad], vectors: [v1, perp(v1)] };
}

/**
 * 실수 고유값·고유벡터. 고유값이 복소수(회전처럼 방향이 다 바뀌는 행렬)면 null.
 * 값은 큰 것부터. 고유값이 겹치는데 행렬이 λI가 아니면 두 벡터가 같은 방향일 수 있다.
 */
export function eigen(A: M2): { values: V2; vectors: [V2, V2] } | null {
  const [a, b, c, d] = A;
  if (Math.abs(b - c) < EPS) return symmetricEigen(a, b, d);
  const mid = (a + d) / 2;
  const disc = mid * mid - det(A);
  if (disc < -EPS) return null;
  const rad = Math.sqrt(Math.max(0, disc));
  const values: V2 = [mid + rad, mid - rad];
  const vec = (lambda: number): V2 => {
    // (A - λI)v = 0 의 첫 행 또는 둘째 행에서 v를 읽는다 (큰 쪽을 써야 수치가 안정적)
    const r1: V2 = [b, lambda - a];
    const r2: V2 = [lambda - d, c];
    return unit(norm(r1) >= norm(r2) ? r1 : r2);
  };
  return { values, vectors: [vec(values[0]), vec(values[1])] };
}

const angleOf = (R: M2): number => Math.atan2(R[2], R[0]);

/**
 * SVD를 한 단계씩 보여 주는 중간 행렬. t는 0~3:
 * 0→1 Vᵀ로 돌리기, 1→2 축마다 늘리기, 2→3 U로 돌리기 (3이면 정확히 A).
 * V는 svd2가 늘 회전(det +1)으로 만든다. U가 반사(det −1)면 σ₂에 −1을 붙이고 U를 회전으로 바꿔서,
 * 늘리기 단계에서 둘째 축이 0을 지나 뒤집히는 모습으로 이어지게 한다.
 */
export function svdStage(A: M2, t: number): M2 {
  const { U, sigma, V } = svd2(A);
  const flip = det(U) < 0 ? -1 : 1;
  const Urot: M2 = flip < 0 ? [U[0], -U[1], U[2], -U[3]] : U;
  const s: V2 = [sigma[0], flip * sigma[1]];
  const k = Math.min(3, Math.max(0, t));
  const f1 = Math.min(1, k);
  const f2 = Math.min(1, Math.max(0, k - 1));
  const f3 = Math.max(0, k - 2);
  const Vt = rotation(-angleOf(V) * f1);
  const S: M2 = [1 + (s[0] - 1) * f2, 0, 0, 1 + (s[1] - 1) * f2];
  const Ur = rotation(angleOf(Urot) * f3);
  return mul(Ur, mul(S, Vt));
}

/**
 * SVD A = U Σ Vᵀ. U·V는 직교행렬(열이 단위벡터), σ₁ ≥ σ₂ ≥ 0.
 * V는 AᵀA의 고유벡터, uᵢ = A vᵢ / σᵢ. σ가 0이면 그 u는 다른 u에 수직으로 채운다.
 */
export function svd2(A: M2): { U: M2; sigma: V2; V: M2 } {
  const AtA = mul(transpose(A), A);
  const { values, vectors } = symmetricEigen(AtA[0], AtA[1], AtA[3]);
  const sigma: V2 = [Math.sqrt(Math.max(0, values[0])), Math.sqrt(Math.max(0, values[1]))];
  const [v1, v2] = vectors;
  // σ²에서 √를 취하므로 반올림 오차 1e-16이 σ에서는 1e-8이 된다. 그보다 넉넉히 잡아 0으로 본다
  const tol = 1e-7 * Math.max(1, sigma[0]);
  const u1: V2 = sigma[0] > tol ? unit(apply(A, v1)) : [1, 0];
  const u2: V2 = sigma[1] > tol ? unit(apply(A, v2)) : perp(u1);
  return { U: [u1[0], u2[0], u1[1], u2[1]], sigma: [sigma[0], sigma[1] > tol ? sigma[1] : 0], V: [v1[0], v2[0], v1[1], v2[1]] };
}
