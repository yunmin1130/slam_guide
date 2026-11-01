/** 2주차 — 내가 직접 구현하는 파일. AI는 시그니처·힌트·TODO만 작성한다. */
import type { MatN, VecN } from "../types";

/**
 * 과결정 연립방정식 Ax ≈ b 의 최소제곱 해: |Ax - b|² 를 최소로 하는 x.
 *
 * 쓸 수 있는 것: ml-matrix (`Matrix`, `SingularValueDecomposition`, `solve` 등)
 * 수식 힌트: 레슨의 "최소제곱" LA 박스와 과제 힌트를 따라 직접 유도한다.
 * 조건:
 *   - 행(식) 수 < 열(미지수) 수 이면 예외를 던진다.
 *   - b 길이가 A 행 수와 다르면 예외를 던진다.
 *   - 입력 A, b를 바꾸지 않는다.
 *   - A의 열은 일차독립이라고 가정한다 (랭크 부족 입력은 처리하지 않아도 된다).
 * 확인 방법: 잔차 r = Ax - b 에 대해 Aᵀr ≈ 0 이어야 한다.
 *
 * @param A  m×n 행렬 (m ≥ n, 행 우선)
 * @param b  길이 m 벡터
 * @returns  길이 n 벡터 x
 */
export function solveLeastSquares(A: MatN, b: VecN): number[] {
  throw new Error("TODO");
}

/**
 * |x| = 1 조건에서 |Ax| 를 최소로 하는 단위벡터 x (Ax = 0 의 최소제곱 해).
 * 정확한 영공간이 있으면 그 방향이고, 노이즈가 있으면 "가장 0에 가까운" 방향이다.
 *
 * 쓸 수 있는 것: ml-matrix `SingularValueDecomposition`
 * 주의 (thin SVD 함정): 행 < 열 인 가로로 긴 행렬(예: 8×9)은 설정에 따라 V가 잘려서
 *   찾는 벡터가 빠질 수 있다. V의 크기가 n×n 인지 꼭 확인한다. 레슨 과제 힌트에 대처법이 있다.
 * 조건: 결과는 단위벡터, 부호는 상관없다(x 와 -x 모두 정답). 입력 A를 바꾸지 않는다.
 *
 * @param A  m×n 행렬 (행 우선, m은 n보다 작아도 된다)
 * @returns  길이 n 단위벡터
 */
export function nullspaceSVD(A: MatN): number[] {
  throw new Error("TODO");
}
