/** 4주차 정답 구현. 시그니처는 core/mine/w04.ts와 같다. */
import type { BrownDistortion, CompositeResult, FisheyeDistortion, Intrinsics, Mat2, Mat3, Vec2, Vec3 } from "../types";

const NEWTON_MAX_ITER = 50;
const NEWTON_TOL = 1e-15;

export function project(p: Vec3, K: Intrinsics): Vec2 | null {
  const [X, Y, Z] = p;
  if (!(Z > 0)) return null; // 카메라 뒤(또는 렌즈 평면 위)는 이미지에 맺히지 않는다
  return [K.fx * (X / Z) + K.cx, K.fy * (Y / Z) + K.cy];
}

export function distort(x: Vec2, d: BrownDistortion): Vec2 {
  const [u, v] = x;
  const r2 = u * u + v * v;
  const radial = 1 + d.k1 * r2 + d.k2 * r2 * r2 + d.k3 * r2 * r2 * r2;
  return [u * radial + 2 * d.p1 * u * v + d.p2 * (r2 + 2 * u * u), v * radial + d.p1 * (r2 + 2 * v * v) + 2 * d.p2 * u * v];
}

export function undistort(xd: Vec2, d: BrownDistortion): Vec2 {
  // distort(x) = xd 를 뉴턴법으로 푼다. 왜곡이 작으면 x ≈ xd 라 거기서 출발한다.
  // 수렴하지 않으면(야코비안이 특이하거나 반복 한도 초과) 마지막 추정을 그대로 돌려준다.
  // 보통 렌즈의 이미지 안쪽에서는 몇 번 만에 수렴한다 (테스트: |x| ≤ 0.6, 리뷰에서 |x| ≤ 1.2까지 확인).
  let [u, v] = xd;
  for (let i = 0; i < NEWTON_MAX_ITER; i++) {
    const r2 = u * u + v * v;
    const radial = 1 + d.k1 * r2 + d.k2 * r2 * r2 + d.k3 * r2 * r2 * r2;
    const dRadial = d.k1 + 2 * d.k2 * r2 + 3 * d.k3 * r2 * r2; // ∂radial/∂(r²)
    const [fu, fv] = distort([u, v], d);
    const eu = fu - xd[0];
    const ev = fv - xd[1];
    // distort의 야코비안 [[a, b], [b, e]] (∂u'/∂v 와 ∂v'/∂u 가 같다)
    const a = radial + 2 * u * u * dRadial + 2 * d.p1 * v + 6 * d.p2 * u;
    const b = 2 * u * v * dRadial + 2 * d.p1 * u + 2 * d.p2 * v;
    const e = radial + 2 * v * v * dRadial + 6 * d.p1 * v + 2 * d.p2 * u;
    const det = a * e - b * b;
    if (det === 0) break;
    const du = (e * eu - b * ev) / det;
    const dv = (a * ev - b * eu) / det;
    u -= du;
    v -= dv;
    if (Math.abs(du) + Math.abs(dv) < NEWTON_TOL) break;
  }
  return [u, v];
}

export function unprojectFisheye(px: Vec2, K: Intrinsics, k: FisheyeDistortion): Vec3 {
  // Kannala-Brandt: 광축과의 각 θ 가 정규화 반지름 θd = θ(1 + k1θ² + k2θ⁴ + k3θ⁶ + k4θ⁸) 로 간다.
  // 가정: 쓰는 θ 범위(0 ~ 90° 안팎)에서 θd 가 θ 에 대해 증가한다 (실제 캘리브레이션 계수는 그렇다).
  // 계수가 커서 θd 가 줄어드는 구간이 있으면 뉴턴이 다른 근으로 가거나 엉뚱한 방향을 돌려줄 수 있다.
  const xd = (px[0] - K.cx) / K.fx;
  const yd = (px[1] - K.cy) / K.fy;
  const thd = Math.hypot(xd, yd);
  if (thd === 0) return [0, 0, 1];
  let th = thd;
  for (let i = 0; i < NEWTON_MAX_ITER; i++) {
    const t2 = th * th;
    const f = th * (1 + k[0] * t2 + k[1] * t2 ** 2 + k[2] * t2 ** 3 + k[3] * t2 ** 4) - thd;
    const df = 1 + 3 * k[0] * t2 + 5 * k[1] * t2 ** 2 + 7 * k[2] * t2 ** 3 + 9 * k[3] * t2 ** 4;
    const step = f / df;
    th -= step;
    if (Math.abs(step) < NEWTON_TOL) break;
  }
  const s = Math.sin(th) / thd;
  return [xd * s, yd * s, Math.cos(th)];
}

// ---- 4b: 3DGS ----
// 3D Gaussian Splatting (Kerbl 등 2023) 의 화면 투영과 알파 합성. 공분산 투영은 EWA splatting (Zwicker 등 2001) 의 식이다.
// 원 논문 구현과 다른 점: Σ' 대각에 0.3 을 더하는 저역 통과 필터와 x/z 를 화각의 1.3배로 자르는 처리는 넣지 않았다 (레슨 디버그 목록).

export function buildCovariance(scale: Vec3, R: Mat3): Mat3 {
  // M = R·S 의 k번째 열은 타원체의 k번째 반축 벡터 (길이 s_k, 방향은 R의 k번째 열). Σ = M·Mᵀ = R·S·Sᵀ·Rᵀ
  const M = R.map((row) => row.map((v, k) => v * scale[k]));
  const e = (i: number, j: number) => M[i][0] * M[j][0] + M[i][1] * M[j][1] + M[i][2] * M[j][2];
  return [
    [e(0, 0), e(0, 1), e(0, 2)],
    [e(1, 0), e(1, 1), e(1, 2)],
    [e(2, 0), e(2, 1), e(2, 2)],
  ];
}

export function projectCovariance(Sigma: Mat3, Rcw: Mat3, pCam: Vec3, K: Intrinsics): Mat2 | null {
  const [x, y, z] = pCam;
  if (!(z > 0)) return null; // 카메라 뒤: 투영도 야코비안도 뜻이 없다
  // 핀홀 투영 (u, v) = (fx·x/z + cx, fy·y/z + cy) 를 가우시안 중심에서 미분한 야코비안 (2×3)
  const J: readonly [Vec3, Vec3] = [
    [K.fx / z, 0, (-K.fx * x) / (z * z)],
    [0, K.fy / z, (-K.fy * y) / (z * z)],
  ];
  // T = J·W (2×3). W = Rcw 는 월드 → 카메라 회전 (이동 t 는 모양을 바꾸지 않는다)
  const T = J.map((row) => [0, 1, 2].map((c) => row[0] * Rcw[0][c] + row[1] * Rcw[1][c] + row[2] * Rcw[2][c]));
  // Σ' = T·Σ·Tᵀ = J·W·Σ·Wᵀ·Jᵀ
  const TS = T.map((row) => [0, 1, 2].map((c) => row[0] * Sigma[0][c] + row[1] * Sigma[1][c] + row[2] * Sigma[2][c]));
  const e = (i: number, j: number) => TS[i][0] * T[j][0] + TS[i][1] * T[j][1] + TS[i][2] * T[j][2];
  return [
    [e(0, 0), e(0, 1)],
    [e(1, 0), e(1, 1)],
  ];
}

export function gaussianWeight2D(d: Vec2, Sigma2D: Mat2): number {
  // 대칭 Σ = [[a, b], [b, c]] 의 역행렬은 [[c, −b], [−b, a]] / det
  const a = Sigma2D[0][0];
  const b = Sigma2D[0][1];
  const c = Sigma2D[1][1];
  const det = a * c - b * b;
  if (!(det > 0)) return 0; // 납작한(또는 잘못된) 공분산은 그리지 않는다
  const [dx, dy] = d;
  const mahalanobis2 = (c * dx * dx - 2 * b * dx * dy + a * dy * dy) / det; // dᵀ Σ⁻¹ d
  return Math.exp(-0.5 * mahalanobis2);
}

export function alphaComposite(colors: readonly Vec3[], alphas: readonly number[]): CompositeResult {
  if (colors.length !== alphas.length) throw new Error(`colors(${colors.length})와 alphas(${alphas.length})의 길이가 다르다`);
  let r = 0;
  let g = 0;
  let b = 0;
  let T = 1; // 지금까지 지나온 가우시안들을 통과하고 남은 빛의 비율
  for (let i = 0; i < colors.length; i++) {
    const w = alphas[i] * T; // 이 가우시안이 픽셀 색에 기여하는 몫
    r += colors[i][0] * w;
    g += colors[i][1] * w;
    b += colors[i][2] * w;
    T *= 1 - alphas[i];
  }
  return { color: [r, g, b], transmittance: T };
}
