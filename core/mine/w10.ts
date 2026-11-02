/** 10주차 — 내가 직접 구현하는 파일. AI는 시그니처·힌트·TODO만 작성한다. */
import type { Descriptor, Match, RatioTestOptions } from "../types";

/**
 * 로우(Lowe)의 비율 검사: query 디스크립터마다 train 에서 가장 가까운 것(1위)과 두 번째(2위)를 찾고,
 * 1위 거리 < ratio × 2위 거리 일 때만 매칭으로 남긴다 (같으면 버린다).
 *
 * 거리 (opts.metric):
 *   "hamming": 바이트(0~255) 배열을 XOR 한 뒤 1 인 비트 수를 모두 더한다 (ORB 같은 바이너리 디스크립터).
 *   "l2":      유클리드 거리 √Σ(aₖ − bₖ)² (SIFT 같은 실수 디스크립터).
 * 조건: train 이 2개 미만이면 빈 배열 (2위가 없다). query 가 비면 빈 배열.
 * 조건 (예외): ratio 가 (0, 1] 밖, 디스크립터 길이가 서로 다름, NaN·무한대,
 *             hamming 인데 0~255 정수가 아닌 값.
 *
 * @param query  찾을 디스크립터들 (예: 새 프레임)
 * @param train  후보 디스크립터들 (예: 이전 프레임)
 * @returns      남은 매칭 { query, train, distance(1위), secondDistance(2위) }, query 순서대로
 */
export function ratioTest(query: readonly Descriptor[], train: readonly Descriptor[], opts: RatioTestOptions): Match[] {
  throw new Error("TODO");
}
