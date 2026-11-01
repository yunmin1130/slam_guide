/**
 * 저장 계층 — 사이트의 유일한 저장 진입점 (ARCHITECTURE §7, CLAUDE.md "저장은 storage.ts만").
 * 0주차: localStorage 전용. Gist 동기화(3~4주차)는 이 파일 안에서만 붙인다.
 */

export type LessonStatus = "todo" | "in-progress" | "done";

export interface LessonState {
  status: LessonStatus;
  checked: string[]; // 완료한 세션 id·체크 질문 id
  minutes?: number; // 실제 소요 시간 (일정 재추정용)
  lastVisited?: string; // ISO 8601
  notes?: string;
}

export interface Progress {
  lessons: Record<string, LessonState>; // key: "w04"
}

export interface ProgressStore {
  load(): Promise<Progress>;
  save(p: Progress): Promise<void>;
  /** load → fn → save를 순서대로 처리한다. 여러 컴포넌트가 동시에 불러도 서로 덮어쓰지 않는다. */
  update(fn: (p: Progress) => Progress): Promise<Progress>;
}

/** localStorage와 같은 모양. 테스트에서는 메모리 구현을 넣는다. */
export interface KeyValueBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const STORAGE_KEY = "slam-progress";
/** 같은 페이지의 다른 컴포넌트에 변경을 알리는 이벤트 이름 */
export const PROGRESS_EVENT = "slam-progress-change";

const STATUSES: readonly LessonStatus[] = ["todo", "in-progress", "done"];

const emptyProgress = (): Progress => ({ lessons: {} });

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function sanitizeLesson(raw: unknown): LessonState | null {
  if (!isRecord(raw)) return null;
  const status = STATUSES.includes(raw.status as LessonStatus) ? (raw.status as LessonStatus) : "todo";
  const checked = Array.isArray(raw.checked) ? raw.checked.filter((x): x is string => typeof x === "string") : [];
  const state: LessonState = { status, checked };
  if (typeof raw.minutes === "number" && Number.isFinite(raw.minutes)) state.minutes = raw.minutes;
  if (typeof raw.lastVisited === "string") state.lastVisited = raw.lastVisited;
  if (typeof raw.notes === "string") state.notes = raw.notes;
  return state;
}

/** 저장된 값은 외부 입력으로 보고 검증한다. 살릴 수 있는 레슨은 살리고, 전체 구조가 틀리면 null. */
export function sanitizeProgress(raw: unknown): Progress | null {
  if (!isRecord(raw) || !isRecord(raw.lessons)) return null;
  const lessons: Record<string, LessonState> = {};
  for (const [key, value] of Object.entries(raw.lessons)) {
    const lesson = sanitizeLesson(value);
    if (lesson) lessons[key] = lesson;
  }
  return { lessons };
}

export function createLocalStore(
  backend: KeyValueBackend | null,
  now: () => string = () => new Date().toISOString(),
): ProgressStore {
  let queue: Promise<unknown> = Promise.resolve();
  let lastBackedUp: string | null = null;

  function backupCorrupt(raw: string): void {
    // 읽을 수 없는 값을 덮어쓰기 전에 따로 보관한다 (진도 유실 방지).
    // 여러 컴포넌트가 load를 불러도 같은 값은 한 번만 백업한다.
    if (raw === lastBackedUp) return;
    lastBackedUp = raw;
    try {
      backend?.setItem(`${STORAGE_KEY}.corrupt.${now()}`, raw);
    } catch {
      // 용량 초과 등: 백업을 못 해도 읽기는 계속한다 (원본은 아직 지워지지 않았다)
    }
  }

  function loadSync(): Progress {
    const raw = backend?.getItem(STORAGE_KEY);
    if (!raw) return emptyProgress();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      backupCorrupt(raw);
      return emptyProgress();
    }
    const progress = sanitizeProgress(parsed);
    if (!progress) {
      backupCorrupt(raw);
      return emptyProgress();
    }
    return progress;
  }

  function saveSync(p: Progress): void {
    // 저장소가 막혀 있으면 조용히 넘어가지 않고 실패로 알린다 (화면에 "완료"로 보였다가 사라지는 일 방지)
    if (!backend) throw new Error("이 브라우저에서는 저장할 수 없어 (사생활 모드?)");
    backend.setItem(STORAGE_KEY, JSON.stringify(p));
  }

  return {
    load: async () => loadSync(),
    save: async (p) => saveSync(p),
    update(fn) {
      const run = queue.then(() => {
        const next = fn(loadSync());
        saveSync(next);
        return next;
      });
      // 실패해도 다음 update가 막히지 않게 큐에는 결과와 상관없이 이어 붙인다
      queue = run.catch(() => undefined);
      return run;
    },
  };
}

/** 브라우저 localStorage. 사파리 사생활 모드처럼 접근이 막히면 null. */
function browserBackend(): KeyValueBackend | null {
  try {
    if (typeof window === "undefined") return null;
    const ls = window.localStorage;
    const probe = `${STORAGE_KEY}.probe`;
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

let browserStore: ProgressStore | null = null;

/** 컴포넌트가 쓰는 기본 저장소. 저장 후 PROGRESS_EVENT를 보내 같은 페이지의 다른 화면을 갱신한다. */
export function getStore(): ProgressStore {
  if (browserStore) return browserStore;
  const base = createLocalStore(browserBackend());
  const notify = (p: Progress): Progress => {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(PROGRESS_EVENT, { detail: p }));
    return p;
  };
  browserStore = {
    load: base.load,
    save: async (p) => {
      await base.save(p);
      notify(p);
    },
    update: async (fn) => notify(await base.update(fn)),
  };
  return browserStore;
}

/** 한 레슨의 상태만 바꾸는 편의 함수 */
export function updateLesson(
  key: string,
  fn: (s: LessonState | undefined) => LessonState,
  store: ProgressStore = getStore(),
): Promise<Progress> {
  return store.update((p) => ({ lessons: { ...p.lessons, [key]: fn(p.lessons[key]) } }));
}
