/**
 * 초안 상태 hook: 코드, 기준 해시, 배포 대기 여부를 들고 있고 자동 저장한다 (storage.ts DraftStore 경유).
 * 같은 주차 카드가 여러 개여도 열 때마다 저장소에서 다시 읽으므로 최신 초안을 이어 쓴다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getDraftStore, type DraftRecord } from "../storage";
import { draftState, settleDraft, type DraftState } from "./draft";

const SAVE_DELAY_MS = 600;

// 열려 있는 패널들의 "지금 저장" 함수. 다른 카드를 열기 전에 불러서, 아직 저장 안 된 입력이 새 패널에 보이게 한다.
const openWriters = new Set<() => void>();

export function flushAllDrafts(): void {
  for (const write of openWriters) write();
}

interface Base {
  hash: string;
  pending: boolean;
  pendingSince?: string; // 제출 시각 (pending일 때)
}

export interface DraftApi {
  code: string;
  base: Base;
  state: DraftState;
  saveError: string | null;
  setCode(code: string): void;
  /** 코드와 기준을 한꺼번에 바꾼다 (저장소 버전 불러오기, 제출 후) */
  replace(code: string, base: Base): void;
  /** 초안 유지: 지금 배포된 파일을 새 기준으로 삼는다 */
  keepDraft(): void;
  /** 초안 지우고 배포된 파일로 */
  reset(): void;
  flush(): void;
}

export function useDraft(week: string, initialSource: string, buildHash: string): DraftApi {
  const store = getDraftStore();
  const [record] = useState<DraftRecord | null>(() => {
    const r = store.load(week);
    return r ? settleDraft(r, buildHash) : null;
  });
  const [code, setCodeState] = useState(record?.code ?? initialSource);
  const [base, setBase] = useState<Base>(
    record ? { hash: record.baseHash, pending: record.pending, pendingSince: record.pendingSince } : { hash: buildHash, pending: false },
  );
  const [state, setState] = useState<DraftState>(() => draftState(record, buildHash));
  const [saveError, setSaveError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ code, base, dirty: false });

  const write = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const { code: c, base: b, dirty } = latest.current;
    if (!dirty) return;
    try {
      const now = new Date().toISOString();
      const pendingSince = b.pending ? (b.pendingSince ?? now) : undefined;
      store.save(week, { code: c, baseHash: b.hash, pending: b.pending, ...(pendingSince ? { pendingSince } : {}), updatedAt: now });
      latest.current.dirty = false;
      setSaveError(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "초안을 저장하지 못했어");
    }
  }, [store, week]);

  const schedule = useCallback(
    (c: string, b: Base) => {
      latest.current = { code: c, base: b, dirty: true };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(write, SAVE_DELAY_MS);
    },
    [write],
  );

  // 페이지를 떠나거나 백그라운드로 갈 때 바로 저장 (iPhone은 탭 전환 후 페이지를 버릴 수 있다)
  useEffect(() => {
    openWriters.add(write);
    const onHide = () => write();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      write();
      openWriters.delete(write);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [write]);

  return {
    code,
    base,
    state,
    saveError,
    setCode(c) {
      setCodeState(c);
      if (state.kind === "fresh") setState({ kind: "synced" });
      schedule(c, base);
    },
    replace(c, b) {
      const now = new Date().toISOString();
      const next: Base = b.pending ? { ...b, pendingSince: b.pendingSince ?? now } : { hash: b.hash, pending: false };
      setCodeState(c);
      setBase(next);
      setState(draftState({ code: c, baseHash: next.hash, pending: next.pending, pendingSince: next.pendingSince, updatedAt: now }, buildHash));
      schedule(c, next);
      write();
    },
    keepDraft() {
      const b = { hash: buildHash, pending: false };
      setBase(b);
      setState({ kind: "synced" });
      schedule(code, b);
      write();
    },
    reset() {
      if (timer.current) clearTimeout(timer.current);
      latest.current.dirty = false;
      try {
        store.remove(week);
      } catch {
        // 지우기 실패는 다음 저장에서 덮인다
      }
      setCodeState(initialSource);
      setBase({ hash: buildHash, pending: false });
      setState({ kind: "fresh" });
    },
    flush: write,
  };
}

