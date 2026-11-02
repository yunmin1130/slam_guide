/** 9주차 — 내가 직접 구현하는 파일. AI는 시그니처·힌트·TODO만 작성한다. */
import type { PoseGraphProblem, PoseGraphResult, SolverOptions } from "../types";

// 이전 주차 함수는 이렇게 가져온다 (정답 구현을 쓴다, ARCHITECTURE §3)
//   import { levenbergMarquardt } from "@core/prev/w07";
// 야코비안은 엣지마다 중앙 차분 (θ 차이를 감싸야 해서 numericJacobian 을 통째로 쓰지 않는다, 레슨 힌트 2)
// 정보 행렬 분해는 ml-matrix를 쓴다
//   import { CholeskyDecomposition, Matrix } from "ml-matrix";

/**
 * 2D 포즈 그래프 최적화: 노드(자세 x, y, θ)들을 엣지(상대 자세 측정)에 맞게 고친다.
 *
 * 엣지 하나의 오차: e = z⁻¹·(xᵢ⁻¹·xⱼ) 를 [x, y, θ] 로 (θ 는 (−π, π] 로 감싼다).
 * 비용: ½·Σ eᵀ Ω e  (Ω = 엣지의 정보 행렬). LM 에 넘길 잔차는 Ω = L·Lᵀ (숄레스키) 일 때 Lᵀ·e.
 * 7주차 levenbergMarquardt 에 { residual, jacobian, plus } 를 넘긴다 (자세한 단계는 레슨 힌트).
 *   - 변수 순서: 고정하지 않은 노드마다 [x, y, θ]. 업데이트는 더한 뒤 θ 를 감싼다.
 * 조건 (예외): 엣지가 없음, 없는 노드를 가리킴, 자기 자신을 잇는 엣지, 고정 노드 번호가 없음,
 *             노드·측정에 NaN, 정보 행렬이 3×3 대칭(허용 오차 1e-9) 양의 정부호가 아님. 입력을 바꾸지 않는다.
 *       fixed 가 비어 있어도 예외는 아니다 (LM 감쇠에 맡긴다).
 * 결과: poses, cost, iterations, converged 는 LM 결과 그대로, costs = LM history 의 비용들.
 *
 * @param problem  { poses, edges, fixed }
 * @param opts     LM 설정
 */
export function poseGraph2D(problem: PoseGraphProblem, opts: SolverOptions): PoseGraphResult {
  throw new Error("TODO");
}
