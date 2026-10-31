/** 1주차 — 내가 직접 구현하는 파일. AI는 시그니처·힌트·TODO만 작성한다. */
import type { Mat3, Vec3 } from "../types";

// 읽기만 함수: reference를 그대로 쓴다 (ARCHITECTURE §5)
export { dot, cross } from "../reference/w01";

/**
 * 벡터 v의 반대칭 행렬(skew-symmetric matrix) [v]× 를 만든다.
 * 모든 벡터 w에 대해 [v]× · w = v × w (외적) 가 성립하는 행렬이다.
 *
 * 수식 힌트: v = [x, y, z] 일 때
 *   [v]× = [[ 0, -z,  y],
 *           [ z,  0, -x],
 *           [-y,  x,  0]]
 * 확인 방법: 결과 행렬 S는 Sᵀ = -S 이고, 대각 성분이 모두 0이다.
 *
 * @param v  3차원 벡터 [x, y, z]
 * @returns  3×3 반대칭 행렬 (행 우선)
 */
export function skew(v: Vec3): Mat3 {
  throw new Error("TODO");
}
