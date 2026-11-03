/** 14주차 — 내가 직접 구현하는 파일. AI는 시그니처·힌트·TODO만 작성한다. */
import type { ImuBias, ImuSample, IntegrateOptions, NavState, Preintegrated } from "../types";

// 읽기만 함수: 정답을 그대로 내보낸다 (LESSON_TEMPLATE §2)
//   biasJacobians: 바이어스 1차 보정 야코비안 (레슨의 손 유도와 맞춰 읽는다)
export { biasJacobians } from "../reference/w14";

// 이전 주차 함수는 이렇게 가져온다 (정답 구현을 쓴다, ARCHITECTURE §3)
//   import { expSO3 } from "@core/prev/w03";

/**
 * 14a — IMU 적분: 시작 상태에서 측정을 차례로 적분해 측정 시각마다의 상태를 낸다.
 *
 * 구간 k (samples[k] → samples[k+1], dt = t_{k+1} − t_k) 마다:
 *   euler:    R' = R·Exp(ω_k·dt),               a = R·f_k + g
 *   midpoint: R' = R·Exp(½(ω_k + ω_{k+1})·dt),  a = ½(R·f_k + R'·f_{k+1}) + g
 *   공통:     p' = p + v·dt + ½·a·dt²,  v' = v + a·dt
 *   (ω = gyro, f = accel, g = opts.gravity. 바이어스는 없다고 본다)
 * 결과 길이는 samples 길이와 같고, 0번은 init 그대로.
 * 조건 (예외): 측정 2개 미만, 시각이 늘지 않음, NaN·무한대, method 가 둘 중 하나가 아님.
 */
export function integrateIMU(init: NavState, samples: readonly ImuSample[], opts: IntegrateOptions): NavState[] {
  throw new Error("TODO");
}

/**
 * 14b — 사전적분: 시각 t_0 → t_{n−1} 사이 측정을 몸체 0 좌표로 묶는다 (중력·시작 상태와 무관).
 *
 * ΔR = I, Δv = 0, Δp = 0 에서 시작해 구간 k 마다 (ω = gyro_k − bg, f = accel_k − ba):
 *   Δp ← Δp + Δv·dt + ½·ΔR·f·dt²
 *   Δv ← Δv + ΔR·f·dt
 *   ΔR ← ΔR·Exp(ω·dt)          (이 순서: p 와 v 는 갱신 전 ΔR, Δv 를 쓴다)
 * dt = t_{n−1} − t_0.
 * 쓰는 법: R_j = R_i·ΔR,  v_j = v_i + g·Δt + R_i·Δv,  p_j = p_i + v_i·Δt + ½·g·Δt² + R_i·Δp
 * 조건 (예외): integrateIMU 와 같고, 바이어스에 NaN 이면 예외.
 */
export function preintegrate(samples: readonly ImuSample[], bias: ImuBias): Preintegrated {
  throw new Error("TODO");
}
