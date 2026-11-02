/**
 * 배포 후 옛 페이지가 사라진 JS 파일을 불러오려다 실패한 경우를 알아보고 안내 문구로 바꾼다.
 * 사이트 제출도 배포를 일으키므로 페이지를 열어둔 채 제출하면 자주 생긴다.
 */

export const STALE_CHUNK_MESSAGE = "사이트가 새로 배포돼서 옛 파일을 못 불러왔어. 페이지를 새로고침해줘";

/** 원인을 모르는 불러오기 실패 (워커 스크립트 404일 때 브라우저가 이유 없이 오류만 낸다) */
export const LOAD_FAILED_MESSAGE = "채점기를 불러오지 못했어. 페이지를 새로고침해줘";

// Chrome · Safari · Firefox 순서
const PATTERNS = [/Failed to fetch dynamically imported module/i, /Importing a module script failed/i, /error loading dynamically imported module/i];

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  // Safari는 Error가 아닌 DOMException·객체를 던지기도 한다
  if (typeof e === "object" && e !== null && typeof (e as { message?: unknown }).message === "string") return (e as { message: string }).message;
  return String(e);
}

export function isStaleChunkError(e: unknown): boolean {
  if (e === null || e === undefined) return false;
  const message = messageOf(e);
  return PATTERNS.some((p) => p.test(message));
}

/** 화면에 보여줄 불러오기 오류 문구 */
export function friendlyLoadError(e: unknown): string {
  return isStaleChunkError(e) ? STALE_CHUNK_MESSAGE : messageOf(e);
}
