/** 13주차 정답 구현. 시그니처는 core/mine/w13.ts와 같다. */
import { skew } from "@core/prev/w01";
import { expSO3 } from "@core/prev/w03";
import { CholeskyDecomposition, Matrix, inverse } from "ml-matrix";
import type { EskfNoise, EskfState, ImuStep, Mat3, MatN, Vec3 } from "../types";

const N = 9; // 오차 상태 [δθ, δp, δv]
const SYM_TOL = 1e-9;
const I3: Mat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

function mm(A: Mat3, B: Mat3): Mat3 {
  const c = (i: number, j: number) => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  const row = (i: number): Vec3 => [c(i, 0), c(i, 1), c(i, 2)];
  return [row(0), row(1), row(2)];
}

function mv(A: Mat3, v: Vec3): Vec3 {
  const r = (i: number) => A[i][0] * v[0] + A[i][1] * v[1] + A[i][2] * v[2];
  return [r(0), r(1), r(2)];
}

function finite3(v: Vec3): boolean {
  return v.length === 3 && v.every(Number.isFinite);
}

function checkSquare(P: MatN, n: number, who: string, name: string): void {
  if (P.length !== n || P.some((r) => r.length !== n || !r.every(Number.isFinite))) {
    throw new Error(`${who}: ${name}는 NaN 없는 ${n}×${n} 행렬이어야 한다`);
  }
}

function checkState(s: EskfState, who: string): void {
  if (!(s.R.length === 3 && s.R.every(finite3) && finite3(s.p) && finite3(s.v))) {
    throw new Error(`${who}: 상태에 NaN·무한대가 있다`);
  }
  checkSquare(s.P, N, who, "P");
}

/** (A + Aᵀ)/2 를 2차원 배열로 */
function symmetric(A: Matrix): number[][] {
  const n = A.rows;
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (A.get(i, j) + A.get(j, i)) / 2));
}

/** F[r.., c..] += k·B */
function addBlock(F: Matrix, r: number, c: number, B: Mat3, k: number): void {
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) F.set(r + i, c + j, F.get(r + i, c + j) + k * B[i][j]);
}

export function eskfPredict(s: EskfState, imu: ImuStep, noise: EskfNoise): EskfState {
  checkState(s, "eskfPredict");
  const { dt } = imu;
  if (!(Number.isFinite(dt) && dt > 0)) throw new Error("eskfPredict: dt > 0 이어야 한다");
  if (!(finite3(imu.gyro) && finite3(imu.accel) && finite3(noise.gravity))) {
    throw new Error("eskfPredict: IMU 측정·중력에 NaN·무한대가 있다");
  }
  if (!(noise.gyro >= 0 && noise.accel >= 0 && Number.isFinite(noise.gyro) && Number.isFinite(noise.accel))) {
    throw new Error("eskfPredict: 잡음 표준편차는 0 이상의 유한한 수");
  }

  // 1) 명목 상태: 측정을 그대로 믿고 적분한다
  const Ra = mv(s.R, imu.accel); // 월드 좌표 비력
  const a: Vec3 = [Ra[0] + noise.gravity[0], Ra[1] + noise.gravity[1], Ra[2] + noise.gravity[2]];
  const R = mm(s.R, expSO3([imu.gyro[0] * dt, imu.gyro[1] * dt, imu.gyro[2] * dt]));
  const p: Vec3 = [
    s.p[0] + s.v[0] * dt + 0.5 * a[0] * dt * dt,
    s.p[1] + s.v[1] * dt + 0.5 * a[1] * dt * dt,
    s.p[2] + s.v[2] * dt + 0.5 * a[2] * dt * dt,
  ];
  const v: Vec3 = [s.v[0] + a[0] * dt, s.v[1] + a[1] * dt, s.v[2] + a[2] * dt];

  // 2) 오차 상태 전이 F (좌섭동: δθ 는 그대로, 회전 오차가 비력 방향을 틀어 δv·δp 로 샌다)
  const F = Matrix.eye(N, N);
  const W = skew(Ra);
  addBlock(F, 3, 0, W, -0.5 * dt * dt); // δp += −½[R·a]×·δθ·dt²
  addBlock(F, 3, 6, I3, dt); // δp += δv·dt
  addBlock(F, 6, 0, W, -dt); // δv += −[R·a]×·δθ·dt

  // 3) 과정 잡음: 자이로는 δθ 로, 가속도계는 δv 로 (R 이 직교라 등방 잡음은 그대로)
  const Q = Matrix.zeros(N, N);
  const qg = (noise.gyro * dt) ** 2;
  const qa = (noise.accel * dt) ** 2;
  for (let i = 0; i < 3; i++) {
    Q.set(i, i, qg);
    Q.set(6 + i, 6 + i, qa);
  }
  const P = F.mmul(new Matrix(s.P.map((r) => [...r]))).mmul(F.transpose()).add(Q);
  return { R, p, v, P: symmetric(P) };
}

export function eskfUpdate(s: EskfState, z: Vec3, Rm: MatN): EskfState {
  checkState(s, "eskfUpdate");
  if (!finite3(z)) throw new Error("eskfUpdate: 측정에 NaN·무한대가 있다");
  checkSquare(Rm, 3, "eskfUpdate", "측정 공분산");
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (Math.abs(Rm[i]![j]! - Rm[j]![i]!) > SYM_TOL) throw new Error("eskfUpdate: 측정 공분산이 대칭이 아니다");
    }
  }
  const Rmat = new Matrix(symmetric(new Matrix(Rm.map((r) => [...r]))));
  if (!new CholeskyDecomposition(Rmat).isPositiveDefinite()) throw new Error("eskfUpdate: 측정 공분산이 양의 정부호가 아니다");

  // H = [0 I 0]: 위치만 잰다
  const H = Matrix.zeros(3, N);
  for (let i = 0; i < 3; i++) H.set(i, 3 + i, 1);
  const P = new Matrix(s.P.map((r) => [...r]));
  const S = H.mmul(P).mmul(H.transpose()).add(Rmat);
  const K = P.mmul(H.transpose()).mmul(inverse(S));
  const y = Matrix.columnVector([z[0] - s.p[0], z[1] - s.p[1], z[2] - s.p[2]]);
  const dx = K.mmul(y).to1DArray();

  // 오차를 명목 상태에 주입: R ← Exp(δθ)·R, p ← p + δp, v ← v + δv
  const R = mm(expSO3([dx[0]!, dx[1]!, dx[2]!]), s.R);
  const p: Vec3 = [s.p[0] + dx[3]!, s.p[1] + dx[4]!, s.p[2] + dx[5]!];
  const v: Vec3 = [s.v[0] + dx[6]!, s.v[1] + dx[7]!, s.v[2] + dx[8]!];

  // 조셉 형태: (I − KH)·P·(I − KH)ᵀ + K·Rm·Kᵀ (반올림에도 대칭·양의 정부호 유지)
  const A = Matrix.eye(N, N).sub(K.mmul(H));
  const Pn = A.mmul(P).mmul(A.transpose()).add(K.mmul(Rmat).mmul(K.transpose()));
  return { R, p, v, P: symmetric(Pn) };
}
