/** 3주차 정답 구현. 시그니처는 core/mine/w03.ts와 같다. */
import { skew } from "@core/prev/w01";
import type { Mat3, Quat, SE3, Vec3 } from "../types";

// 이 각도보다 작으면 sinθ/θ 같은 식을 테일러 전개로 바꾼다 (0/0 방지)
const SMALL_ANGLE = 1e-6;
// 이 각도보다 π에 가까우면 sinθ ≈ 0이라 반대칭 부분으로는 축을 못 구한다 → 대칭 부분을 쓴다
const NEAR_PI = 1e-3;

const I3: Mat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

function matMul(A: Mat3, B: Mat3): Mat3 {
  const cell = (i: number, j: number) => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  const row = (i: number): Vec3 => [cell(i, 0), cell(i, 1), cell(i, 2)];
  return [row(0), row(1), row(2)];
}

function matVec(A: Mat3, v: Vec3): Vec3 {
  const row = (i: number) => A[i][0] * v[0] + A[i][1] * v[1] + A[i][2] * v[2];
  return [row(0), row(1), row(2)];
}

function transpose(A: Mat3): Mat3 {
  return [
    [A[0][0], A[1][0], A[2][0]],
    [A[0][1], A[1][1], A[2][1]],
    [A[0][2], A[1][2], A[2][2]],
  ];
}

/** I + a·A + b·B (3×3) */
function combine(a: number, A: Mat3, b: number, B: Mat3): Mat3 {
  const cell = (i: number, j: number) => I3[i][j] + a * A[i][j] + b * B[i][j];
  const row = (i: number): Vec3 => [cell(i, 0), cell(i, 1), cell(i, 2)];
  return [row(0), row(1), row(2)];
}

export function quatToRot(q: Quat): Mat3 {
  const n = Math.hypot(...q);
  if (!(n > 1e-12)) throw new Error("quatToRot: 크기가 0인 쿼터니언은 회전이 아니다");
  const [w, x, y, z] = [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ];
}

export function rotToQuat(R: Mat3): Quat {
  // Shepperd 방법: w, x, y, z 중 가장 큰 성분을 sqrt로 먼저 구해 0에 가까운 값으로 나누는 일을 피한다
  const tr = R[0][0] + R[1][1] + R[2][2];
  let q: [number, number, number, number];
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2; // s = 4w
    q = [s / 4, (R[2][1] - R[1][2]) / s, (R[0][2] - R[2][0]) / s, (R[1][0] - R[0][1]) / s];
  } else if (R[0][0] >= R[1][1] && R[0][0] >= R[2][2]) {
    const s = Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]) * 2; // s = 4x
    q = [(R[2][1] - R[1][2]) / s, s / 4, (R[0][1] + R[1][0]) / s, (R[0][2] + R[2][0]) / s];
  } else if (R[1][1] >= R[2][2]) {
    const s = Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]) * 2; // s = 4y
    q = [(R[0][2] - R[2][0]) / s, (R[0][1] + R[1][0]) / s, s / 4, (R[1][2] + R[2][1]) / s];
  } else {
    const s = Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]) * 2; // s = 4z
    q = [(R[1][0] - R[0][1]) / s, (R[0][2] + R[2][0]) / s, (R[1][2] + R[2][1]) / s, s / 4];
  }
  const sign = q[0] < 0 ? -1 : 1; // q와 -q는 같은 회전 → w ≥ 0 쪽으로 통일
  const n = Math.hypot(...q) * sign;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

export function composeSE3(a: SE3, b: SE3): SE3 {
  const Rb = matVec(a.R, b.t);
  return { R: matMul(a.R, b.R), t: [Rb[0] + a.t[0], Rb[1] + a.t[1], Rb[2] + a.t[2]] };
}

export function invSE3(T: SE3): SE3 {
  const Rt = transpose(T.R);
  const t = matVec(Rt, T.t);
  return { R: Rt, t: [-t[0], -t[1], -t[2]] };
}

export function expSO3(w: Vec3): Mat3 {
  const th = Math.hypot(...w);
  const W = skew(w);
  const W2 = matMul(W, W);
  if (th < SMALL_ANGLE) {
    // sinθ/θ ≈ 1 - θ²/6, (1 - cosθ)/θ² ≈ 1/2 - θ²/24
    return combine(1 - (th * th) / 6, W, 0.5 - (th * th) / 24, W2);
  }
  // 로드리게스: R = I + (sinθ/θ)W + ((1 - cosθ)/θ²)W². 1 - cosθ = 2sin²(θ/2)로 써서 작은 θ의 상쇄 오차를 피한다
  const half = Math.sin(th / 2);
  return combine(Math.sin(th) / th, W, (2 * half * half) / (th * th), W2);
}

export function logSO3(R: Mat3): Vec3 {
  // R = cosθ·I + sinθ·[a]× + (1 - cosθ)·aaᵀ
  const c = (R[0][0] + R[1][1] + R[2][2] - 1) / 2; // cosθ
  const v: Vec3 = [(R[2][1] - R[1][2]) / 2, (R[0][2] - R[2][0]) / 2, (R[1][0] - R[0][1]) / 2]; // sinθ·a
  const s = Math.hypot(...v); // sinθ (θ ∈ [0, π]이라 ≥ 0)
  // acos(c)는 c가 ±1 근처에서 오차가 크고, 반올림으로 |c| > 1이면 NaN이 난다 → atan2를 쓴다
  const th = Math.atan2(s, c);

  if (th < SMALL_ANGLE) {
    const k = 1 + (th * th) / 6; // θ/sinθ ≈ 1 + θ²/6
    return [v[0] * k, v[1] * k, v[2] * k];
  }
  if (th < Math.PI - NEAR_PI) {
    const k = th / s;
    return [v[0] * k, v[1] * k, v[2] * k];
  }

  // θ ≈ π: 대칭 부분 (R + Rᵀ)/2 = cosθ·I + (1 - cosθ)·aaᵀ 에서 aaᵀ를 꺼낸다
  const aaT = (i: number, j: number) => ((R[i][j] + R[j][i]) / 2 - (i === j ? c : 0)) / (1 - c);
  // 대각 성분(= a_i²)이 가장 큰 열을 써야 0에 가까운 값으로 나누지 않는다
  const diag = [aaT(0, 0), aaT(1, 1), aaT(2, 2)];
  const k = diag.indexOf(Math.max(...diag));
  const ak = Math.sqrt(diag[k]);
  const col: Vec3 = [aaT(0, k) / ak, aaT(1, k) / ak, aaT(2, k) / ak];
  const n = Math.hypot(...col);
  // aaᵀ로는 a의 부호를 모른다 → sinθ·a(= v)와 같은 방향으로 맞춘다. θ = π 정확히면 v = 0이라 어느 쪽이든 정답
  const sign = col[0] * v[0] + col[1] * v[1] + col[2] * v[2] < 0 ? -1 : 1;
  const scale = (sign * th) / n;
  return [col[0] * scale, col[1] * scale, col[2] * scale];
}
