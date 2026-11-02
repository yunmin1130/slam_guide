/**
 * 테스트가 구현(mine 또는 reference)을 불러오는 유일한 통로 (LESSON_TEMPLATE §4).
 * Vitest에서는 IMPL 환경변수로 한쪽만 동적 import한다 (ref 실행이 mine 오류의 영향을 받지 않게).
 * 사이트의 브라우저 채점기는 빌드 때 이 파일을 site/src/lib/playground/draftImpl.ts로 바꿔 끼운다.
 */

export const IMPL: "mine" | "reference" = process.env.IMPL === "mine" ? "mine" : "reference";

/** week: "w01" 형식 */
export async function loadImpl<T>(week: string): Promise<T> {
  return (await import(`@core/${IMPL}/${week}.ts`)) as T; // 확장자 필수
}
