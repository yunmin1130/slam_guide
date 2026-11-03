/** 15주차 — 내가 직접 구현하는 파일. AI는 시그니처·힌트·TODO만 작성한다. */
import type { IcpOptions, IcpResult, Vec3 } from "../types";

// 읽기만 함수: 정답을 그대로 내보낸다 (LESSON_TEMPLATE §2)
//   nearestNeighbors: 최근접 점 찾기 (전수 탐색),  icpPointToPlane: 점-평면 ICP (7a 가우스-뉴턴)
export { icpPointToPlane, nearestNeighbors } from "../reference/w15";

// 도우미·이전 주차 함수는 이렇게 가져온다 (정답 구현을 쓴다, ARCHITECTURE §3)
//   import { nearestNeighbors } from "../reference/w15";
//   import { alignUmeyama } from "@core/prev/w11";

/**
 * 15 — 점-점 ICP: src 점군을 dst 점군에 맞추는 강체 변환 T (dst ≈ R·src + t) 를 찾는다.
 *
 * T = opts.init (없으면 단위) 에서 시작해 최대 maxIterations 번:
 *   1) src 의 각 점을 지금 T 로 옮겨 nearestNeighbors 로 가장 가까운 dst 를 찾는다.
 *   2) 거리 ≤ maxDistance 인 짝만 남긴다. 3개 미만이면 예외.
 *   3) 남은 짝의 (원래 src 점, dst 점) 으로 alignUmeyama(…, false) → 새 T (누적이 아니라 통째로 다시 푼다).
 *   4) 새 T 로 옮긴 src 와 짝 dst 사이 거리의 RMSE 를 history 에 넣는다.
 *      직전 RMSE 와의 차이 < tolerance 면 converged = true 로 멈춘다.
 * 결과: T, rmse (마지막 history), pairs (마지막 짝 수), iterations (= history 길이), converged, history.
 * 조건 (예외): 빈 점군, NaN·무한대, maxIterations < 1 이거나 정수가 아님, tolerance < 0, maxDistance ≤ 0, 짝 3개 미만.
 */
export function icpPointToPoint(src: readonly Vec3[], dst: readonly Vec3[], opts: IcpOptions): IcpResult {
  throw new Error("TODO");
}
