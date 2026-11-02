/** 3주차 — 내가 직접 구현하는 파일. AI는 시그니처·힌트·TODO만 작성한다. */
import type { Mat3, Quat, SE3, Vec3 } from "../types";

// 읽기만 함수: reference를 그대로 쓴다 (ARCHITECTURE §5)
export { rotToQuat } from "../reference/w03";

// 이전 주차 함수가 필요하면 이렇게 가져온다 (내 1주차 버그가 번지지 않게 정답 구현을 쓴다, ARCHITECTURE §3)
//   import { skew, cross, dot } from "@core/prev/w01";

/**
 * 쿼터니언 q = [w, x, y, z] (Hamilton, 스칼라 먼저)를 회전행렬로 바꾼다.
 * R · v 가 q v q* (쿼터니언 곱으로 돌린 v) 와 같아야 한다.
 *
 * 수식 힌트: 레슨 과제의 손 유도 (q v q* 를 전개해서 기저 벡터가 어디로 가는지 보기)
 * 조건:
 *   - q 크기가 1이 아니면 먼저 정규화한다.
 *   - 크기가 0인 쿼터니언은 예외를 던진다.
 * 확인 방법: q 와 -q 는 같은 R 이 나와야 한다. RᵀR = I, det R = +1.
 *
 * @param q  쿼터니언 [w, x, y, z]
 * @returns  3×3 회전행렬 (행 우선)
 */
export function quatToRot(q: Quat): Mat3 {
  throw new Error("TODO");
}

/**
 * 두 강체 변환의 합성 a·b. 점에 적용하면 b 를 먼저, a 를 나중에 적용한 것과 같다: (a·b)(p) = a(b(p)).
 * T = [R t; 0 1] 4×4 행렬끼리 곱한 결과를 R, t 로 나눠 담는다고 생각하면 된다.
 *
 * 조건: 입력 a, b 를 바꾸지 않는다.
 * 확인 방법: 아무 점 p 에 대해 a.R·(b.R·p + b.t) + a.t 와 결과를 p 에 적용한 값이 같아야 한다.
 *
 * @returns  { R, t } 새 객체
 */
export function composeSE3(a: SE3, b: SE3): SE3 {
  throw new Error("TODO");
}

/**
 * 강체 변환의 역 T⁻¹. T 가 B→A 로 옮긴다면 T⁻¹ 은 A→B 로 옮긴다.
 *
 * 수식 힌트: 4×4 역행렬을 일반 공식으로 구하지 말고, p_A = R p_B + t 를 p_B 에 대해 푼다.
 *   회전행렬의 역은 무엇이었나? (2주차 직교행렬)
 * 조건: 입력 T 를 바꾸지 않는다.
 * 확인 방법: composeSE3(T, invSE3(T)) 가 항등 변환 { R: I, t: 0 } 이어야 한다.
 */
export function invSE3(T: SE3): SE3 {
  throw new Error("TODO");
}

/**
 * 축-각 벡터 omega (= ω, 방향 = 회전축, 크기 θ = 회전각, 라디안)를 회전행렬로 바꾼다. exp([ω]×).
 *
 * 수식 힌트: 로드리게스 공식 (레슨 개념 "행렬 지수"와 과제 손 유도)
 * 주의: θ = 0 이면 θ 로 나누는 항이 0/0 이 된다. 아주 작은 θ 에서는 테일러 전개로 바꾼다.
 * 확인 방법: R · ω = ω (축은 제자리), RᵀR = I.
 *
 * @param omega  축-각 벡터 [ωx, ωy, ωz] (쿼터니언의 스칼라 w와 다른 것)
 * @returns  3×3 회전행렬
 */
export function expSO3(omega: Vec3): Mat3 {
  throw new Error("TODO");
}

/**
 * 회전행렬을 축-각 벡터 ω 로 바꾼다. expSO3 의 역: logSO3(expSO3(ω)) = ω (|ω| ≤ π 일 때).
 *
 * 수식 힌트: 대각합(trace)으로 θ, 반대칭 부분 (R - Rᵀ)/2 로 축 방향을 구한다.
 * 주의 (경계 두 곳):
 *   - θ ≈ 0: 축 방향을 sinθ 로 나누면 0/0 이다. 그리고 acos 에 1보다 살짝 큰 값이 들어가면 NaN 이다.
 *   - θ ≈ π: sinθ ≈ 0 이라 반대칭 부분이 거의 0 → 축을 다른 방법으로 구해야 한다 (레슨 힌트 3).
 * 조건: 결과 크기는 [0, π]. θ = π 정확히면 ω 와 -ω 둘 다 정답이다.
 *
 * @param R  3×3 회전행렬
 * @returns  축-각 벡터
 */
export function logSO3(R: Mat3): Vec3 {
  throw new Error("TODO");
}
