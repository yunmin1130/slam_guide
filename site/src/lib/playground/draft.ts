/**
 * 초안과 저장소 파일의 관계 판단 (순수 로직). 저장 자체는 storage.ts의 DraftStore가 한다.
 *
 * baseHash: 이 초안이 기준으로 삼은 저장소 파일 내용의 해시.
 * buildHash: 지금 사이트에 배포된(빌드된) core/mine 파일의 해시.
 * pending: 사이트에서 제출했고 아직 배포가 따라오지 않은 상태.
 */
import type { DraftRecord } from "../storage";

/** 줄바꿈 차이(CRLF/LF)는 같은 내용으로 본다 */
export function normalizeNewlines(s: string): string {
  return s.replace(/\r\n?/g, "\n");
}

/** FNV-1a 32bit. 빌드(Node)와 브라우저에서 같은 값이 나와야 해서 crypto 대신 직접 계산한다 */
export function contentHash(s: string): string {
  let h = 0x811c9dc5;
  const text = normalizeNewlines(s);
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export type DraftState =
  | { kind: "fresh" } // 초안 없음: 배포된 파일에서 시작
  | { kind: "synced" } // 초안이 배포된 파일을 기준으로 함
  | { kind: "pending-deploy" } // 제출했고 배포 기다리는 중
  | { kind: "repo-changed" }; // 초안을 만든 뒤 저장소 파일이 바뀜 (PC에서 push 등)

/** 제출 후 이 시간이 지나도 배포가 따라오지 않으면 (배포 실패, 그 뒤 PC push 등) 저장소가 바뀐 것으로 본다 */
export const PENDING_LIMIT_MS = 30 * 60 * 1000;

export function draftState(draft: DraftRecord | null, buildHash: string, now: number = Date.now()): DraftState {
  if (!draft) return { kind: "fresh" };
  if (draft.baseHash === buildHash) return { kind: "synced" };
  const age = now - Date.parse(draft.updatedAt);
  if (draft.pending && !(age > PENDING_LIMIT_MS)) return { kind: "pending-deploy" };
  return { kind: "repo-changed" };
}

/** 배포가 제출을 따라잡았으면 pending을 내린다 */
export function settleDraft(draft: DraftRecord, buildHash: string): DraftRecord {
  return draft.pending && draft.baseHash === buildHash ? { ...draft, pending: false } : draft;
}
