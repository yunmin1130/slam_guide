/**
 * 브라우저 채점기용 core/tests/loadImpl.ts 대역 (vitePlugin.ts가 바꿔 끼운다).
 * 테스트 파일은 IMPL = "mine"으로 등록되고, 구현은 채점기가 미리 넣어둔 초안 모듈을 받는다.
 */

export const IMPL = "mine" as const;

let current: { week: string; module: unknown } | null = null;

/** 테스트 파일을 import하기 전에 불러야 한다 (테스트 파일이 맨 위에서 loadImpl을 await한다) */
export function setDraftModule(week: string, module: unknown): void {
  current = { week, module };
}

export async function loadImpl<T>(week: string): Promise<T> {
  if (!current || current.week !== week) throw new Error(`${week} 초안 모듈이 준비되지 않았다`);
  return current.module as T;
}
