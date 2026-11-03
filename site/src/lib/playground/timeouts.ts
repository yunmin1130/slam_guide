/**
 * 코드 연습장 채점 제한 시간. import 없는 상수 파일로 둔다:
 * scripts/qa.mjs가 Node 타입 제거(.ts 직접 import)로 같은 값을 읽어 기다릴 시간을 정한다.
 */

// 워커 시작·테스트 파일 로드 시간 포함. 느린 폰의 첫 실행도 넉넉히 들어오게
export const RUN_TIMEOUT_MS = 8000;

// 테스트가 무거운 주차만 따로 늘린다 (11주차 VO 테스트는 iPhone에서 몇 초씩 걸린다)
export const WEEK_TIMEOUT_MS: Readonly<Record<string, number>> = { w11: 30000 };

/** 주차별 채점 제한 시간 (ms). 목록에 없으면 RUN_TIMEOUT_MS */
export function timeoutForWeek(week: string): number {
  return WEEK_TIMEOUT_MS[week] ?? RUN_TIMEOUT_MS;
}
