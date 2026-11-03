/** 13주차 — 내가 직접 구현하는 파일. AI는 시그니처·힌트·TODO만 작성한다. */
import type { EskfNoise, EskfState, ImuStep, MatN, Vec3 } from "../types";

// 이전 주차 함수는 이렇게 가져온다 (정답 구현을 쓴다, ARCHITECTURE §3)
//   import { skew } from "@core/prev/w01";
//   import { expSO3 } from "@core/prev/w03";
// 9×9 행렬 계산은 ml-matrix
//   import { CholeskyDecomposition, Matrix, inverse } from "ml-matrix";

/**
 * 13 — ESKF 예측: IMU 한 번으로 명목 상태를 적분하고 오차 상태 공분산 P 를 전파한다.
 *
 * 오차 상태 δx = [δθ, δp, δv] (9개, 이 순서). 회전 오차는 좌섭동: 참 R = Exp(δθ)·R (7주차 규약).
 * 명목 상태 (a = R·accel + g, 월드 가속도. 여기 R 은 적분 전 값):
 *   R ← R·Exp(gyro·dt),  p ← p + v·dt + ½·a·dt²,  v ← v + a·dt
 * 오차 전이 F (9×9, 단위 행렬에서 시작, W = [R·accel]×, R 은 적분 전 값):
 *   δp 행: δθ 열에 −½·W·dt²,  δv 열에 I·dt
 *   δv 행: δθ 열에 −W·dt
 * 과정 잡음 Q = diag((gyro·dt)²·I, 0, (accel·dt)²·I)  (noise.gyro, noise.accel 은 표준편차)
 * P ← F·P·Fᵀ + Q, 끝에 (P + Pᵀ)/2 로 대칭을 맞춘다.
 * 조건 (예외): dt ≤ 0, NaN·무한대 (잡음 포함), P 가 9×9 가 아님, 잡음 표준편차 < 0. 입력을 바꾸지 않는다.
 */
export function eskfPredict(s: EskfState, imu: ImuStep, noise: EskfNoise): EskfState {
  throw new Error("TODO");
}

/**
 * 13 — ESKF 갱신: 위치 측정 z (= p + 잡음, 공분산 Rm) 로 상태를 고친다.
 *
 *   H = [0 I 0] (3×9),  S = H·P·Hᵀ + Rm,  K = P·Hᵀ·S⁻¹,  δx = K·(z − p)
 *   주입: R ← Exp(δθ)·R (왼쪽!),  p ← p + δp,  v ← v + δv
 *   P ← (I − K·H)·P·(I − K·H)ᵀ + K·Rm·Kᵀ  (조셉 형태), 끝에 대칭 맞추기
 *   (주입 뒤 오차를 0으로 되돌리는 리셋 야코비안은 ≈ I 로 둔다, 레슨 개념 절)
 * 조건 (예외): 상태·z 에 NaN, Rm 이 3×3 대칭(허용 오차 1e-9) 양의 정부호가 아님.
 */
export function eskfUpdate(s: EskfState, z: Vec3, Rm: MatN): EskfState {
  throw new Error("TODO");
}
