/** 8주차 — 내가 직접 구현하는 파일. AI는 시그니처·힌트·TODO만 작성한다. */
import type { BAProblem, BAResult, Intrinsics, SE3, SolverOptions, Vec3 } from "../types";

// 이전 주차 함수는 이렇게 가져온다 (정답 구현을 쓴다, ARCHITECTURE §3)
//   import { expSO3 } from "@core/prev/w03";
//   import { levenbergMarquardt } from "@core/prev/w07";

/**
 * 재투영 오차의 야코비안. 카메라 자세 T = T_cw (p = R·X + t), 픽셀 u = fx·x/z + cx, v = fy·y/z + cy.
 *
 * 연쇄 법칙:
 *   ∂u/∂p (2×3) = [[fx/z, 0, −fx·x/z²], [0, fy/z, −fy·y/z²]]
 *   자세: 좌섭동 δ = [ρ; φ] (T ← (Exp(φ)R, Exp(φ)t + ρ)) 에서 ∂p/∂δ = [I | −[p]×]  → pose = ∂u/∂p · [I | −[p]×]  (2×6)
 *   점:   ∂p/∂X = R  → point = ∂u/∂p · R  (2×3)
 * 조건: 카메라 좌표의 z ≤ 0 (카메라 뒤) 이면 예외.
 *
 * @param T  카메라 자세 (월드 → 카메라)
 * @param X  월드 3D 점
 * @param K  내부 파라미터
 * @returns  { pose: 2×6, point: 2×3 } (행 우선)
 */
export function projectionJacobian(T: SE3, X: Vec3, K: Intrinsics): { pose: number[][]; point: number[][] } {
  throw new Error("TODO");
}

/**
 * 작은 번들 조정: 카메라 자세와 3D 점을 함께 고쳐 재투영 오차의 제곱합을 줄인다.
 *
 * 7주차 levenbergMarquardt 에 문제 { residual, jacobian, plus } 를 만들어 넘긴다 (자세한 단계는 레슨 힌트).
 *   - 변수 순서 (δ 의 열): 고정하지 않은 카메라마다 6개 (ρ 3 + φ 3), 그다음 점마다 3개.
 *   - 카메라 업데이트는 8a 야코비안과 같은 좌섭동, 고정 카메라는 그대로.
 * 조건 (예외): 관측이 없음, 관측·fixed 가 없는 카메라/점 번호를 가리킴, 관측 픽셀에 NaN,
 *             시작값에서 관측된 점이 그 카메라 뒤에 있음 (깊이 ≤ 0). 입력을 바꾸지 않는다.
 * 결과: cameras, points, cost, iterations, converged 는 LM 결과 그대로, costs = LM history 의 비용들.
 *
 * @param problem  { K, cameras, points, observations, fixed }
 * @param opts     LM 설정 (robust 를 주면 로버스트 커널)
 */
export function smallBA(problem: BAProblem, opts: SolverOptions): BAResult {
  throw new Error("TODO");
}
