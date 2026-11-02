/** 7주차 — 내가 직접 구현하는 파일. AI는 시그니처·힌트·TODO만 작성한다. */
import type { LsqProblem, RobustLoss, SolverOptions, SolverResult, VecN } from "../types";

// 읽기만 함수: 정답을 그대로 내보낸다 (LESSON_TEMPLATE §2)
export { levenbergMarquardt } from "../reference/w07";

// 선형 방정식은 ml-matrix로 푼다
//   import { CholeskyDecomposition, Matrix } from "ml-matrix";

/**
 * Huber 로버스트 커널. 잔차 r 하나에 대한 비용 ρ(r)과 IRLS 가중치 w(r) = ρ'(r) / r.
 *
 *   |r| ≤ k : ρ = r²/2,            w = 1
 *   |r| > k : ρ = k·(|r| − k/2),   w = k / |r|
 * 조건: k ≤ 0 이면 예외.
 *
 * @returns { rho, weight }
 */
export function huber(r: number, k: number): RobustLoss {
  throw new Error("TODO");
}

/**
 * 가우스-뉴턴: 비용 ½Σrᵢ² (opts.robust 가 있으면 Σρ(rᵢ)) 를 줄이는 x 를 찾는다.
 *
 * 반복 (최대 opts.maxIterations 번):
 *   1) r = residual(x), J = jacobian(x). 가중치 wᵢ = robust(rᵢ).weight (없으면 1).
 *   2) 정규방정식 (JᵀWJ) δ = −JᵀWr 를 푼다 (숄레스키). 풀리지 않으면 (양의 정부호 아님) 예외.
 *      주의: JᵀWJ 는 부동소수 오차로 정확히 대칭이 아닐 수 있다 → 숄레스키 전에 (H + Hᵀ)/2 로 맞춘다.
 *   3) x ← plus(x, δ)  ← 그냥 더하지 않는다 (회전 같은 변수는 plus 로만 바꿀 수 있다).
 *   4) 새 비용을 history 에 넣는다. ‖δ‖ < opts.tolerance 면 수렴 (converged = true) 으로 끝.
 *   비용이 NaN·무한대가 되면 (발산) 수렴 아님으로 끝.
 * 결과: history[0] = 처음 { x0, cost }, 업데이트마다 하나씩 추가. iterations = history.length − 1.
 *
 * @returns { x, cost, iterations, converged, history }
 */
export function gaussNewton<X>(problem: LsqProblem<X>, x0: X, opts: SolverOptions): SolverResult<X> {
  throw new Error("TODO");
}

/**
 * 수치 야코비안 (중앙 차분): J 의 j 번째 열 = (f(x ⊞ εeⱼ) − f(x ⊞ −εeⱼ)) / 2ε.
 *
 * x ⊞ δ 는 plus(x, δ) 로만 만든다 (7b 좌섭동: 회전은 Exp(φ)·R, 자세는 (Exp(φ)·R, Exp(φ)·t + ρ)).
 * 조건: dim 이 1 이상의 정수가 아니거나 eps ≤ 0 이면 예외.
 *
 * @param f     x → 길이 m 벡터
 * @param x     기준점
 * @param plus  업데이트 x ⊞ δ (δ 길이 dim)
 * @param dim   δ 의 길이 (회전 3, 자세 6)
 * @param eps   차분 간격 (기본 1e-6)
 * @returns     m × dim 행렬 (행 우선)
 */
export function numericJacobian<X>(f: (x: X) => VecN, x: X, plus: (x: X, delta: VecN) => X, dim: number, eps = 1e-6): number[][] {
  throw new Error("TODO");
}
