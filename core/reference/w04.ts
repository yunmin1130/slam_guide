/** 4주차 정답 구현. 시그니처는 core/mine/w04.ts와 같다. */
import type { BrownDistortion, FisheyeDistortion, Intrinsics, Vec2, Vec3 } from "../types";

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
