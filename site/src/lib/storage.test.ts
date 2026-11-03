import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDraftStore,
  createLocalStore,
  createTokenStore,
  DRAFTS_KEY,
  isValidSessionMinutes,
  MAX_DRAFT_CHARS,
  requestPersistentStorage,
  resetPersistRequestForTest,
  sanitizeProgress,
  STORAGE_KEY,
  TOKEN_KEY,
  withSessionMinutes,
  type KeyValueBackend,
} from "./storage";

function memoryBackend(initial: Record<string, string> = {}): KeyValueBackend & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe("sanitizeProgress", () => {
  it("올바른 값은 그대로 통과", () => {
    const p = { lessons: { w01: { status: "done", checked: ["s1"], minutes: 30, lastVisited: "2026-11-01T00:00:00.000Z" } } };
    expect(sanitizeProgress(p)).toEqual(p);
  });

  it("모르는 status·잘못된 필드는 버리고 나머지는 살린다", () => {
    const r = sanitizeProgress({
      lessons: {
        w01: { status: "weird", checked: ["s1", 3] },
        w02: { status: "todo", checked: "s1", minutes: "x" },
        w03: null,
      },
    });
    expect(r).toEqual({
      lessons: {
        w01: { status: "todo", checked: ["s1"] },
        w02: { status: "todo", checked: [] },
      },
    });
  });

  it("객체가 아니면 null", () => {
    expect(sanitizeProgress("hello")).toBeNull();
    expect(sanitizeProgress({ lessons: [] })).toBeNull();
  });
});

describe("createLocalStore", () => {
  it("저장한 값을 다시 읽는다", async () => {
    const store = createLocalStore(memoryBackend());
    await store.save({ lessons: { w01: { status: "in-progress", checked: ["s1"] } } });
    expect(await store.load()).toEqual({ lessons: { w01: { status: "in-progress", checked: ["s1"] } } });
  });

  it("저장소가 없으면(사파리 사생활 모드 등) 읽기는 빈 진도, 쓰기는 실패로 알린다", async () => {
    const store = createLocalStore(null);
    expect(await store.load()).toEqual({ lessons: {} });
    await expect(store.save({ lessons: {} })).rejects.toThrow("저장");
    await expect(store.update((p) => p)).rejects.toThrow("저장");
  });

  it("깨진 JSON은 백업 키로 옮겨서 기존 진도를 잃지 않는다", async () => {
    const backend = memoryBackend({ [STORAGE_KEY]: "{not json" });
    const store = createLocalStore(backend, () => "T");
    expect(await store.load()).toEqual({ lessons: {} });
    expect(backend.data[`${STORAGE_KEY}.corrupt.T`]).toBe("{not json");
  });

  it("같은 깨진 값은 여러 번 읽어도 한 번만 백업한다", async () => {
    const backend = memoryBackend({ [STORAGE_KEY]: "{not json" });
    let t = 0;
    const store = createLocalStore(backend, () => String(t++));
    await store.load();
    await store.load();
    await store.load();
    expect(Object.keys(backend.data).filter((k) => k.includes(".corrupt."))).toHaveLength(1);
  });

  it("백업 쓰기가 실패해도(용량 초과) 읽기는 빈 진도로 계속된다", async () => {
    const backend: KeyValueBackend = {
      getItem: () => "{not json",
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(await createLocalStore(backend).load()).toEqual({ lessons: {} });
  });

  it("update는 순서대로 적용된다 (동시에 불러도 앞 변경을 덮어쓰지 않음)", async () => {
    const store = createLocalStore(memoryBackend());
    await Promise.all([
      store.update((p) => ({ lessons: { ...p.lessons, w01: { status: "todo", checked: [] } } })),
      store.update((p) => ({ lessons: { ...p.lessons, w02: { status: "todo", checked: [] } } })),
    ]);
    expect(Object.keys((await store.load()).lessons).sort()).toEqual(["w01", "w02"]);
  });

  it("update 함수가 throw해도 큐가 멈추지 않는다", async () => {
    const store = createLocalStore(memoryBackend());
    await expect(store.update(() => { throw new Error("boom"); })).rejects.toThrow("boom");
    await store.update(() => ({ lessons: { w01: { status: "done", checked: [] } } }));
    expect((await store.load()).lessons.w01?.status).toBe("done");
  });
});

function removableBackend() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("DraftStore", () => {
  const draft = { code: "x", baseHash: "h", pending: false, updatedAt: "2026-11-02T00:00:00.000Z" };

  it("주차별로 저장, 불러오기, 삭제하고 진도 키는 건드리지 않는다", () => {
    const b = removableBackend();
    const s = createDraftStore(b);
    s.save("w01", draft);
    s.save("w02", { ...draft, code: "y" });
    expect(s.load("w01")).toEqual(draft);
    s.remove("w01");
    expect(s.load("w01")).toBeNull();
    expect(s.load("w02")?.code).toBe("y");
    expect(b.m.has(STORAGE_KEY)).toBe(false);
  });

  it("깨진 값은 초안 없음으로 본다", () => {
    const b = removableBackend();
    b.setItem(DRAFTS_KEY, "{not json");
    expect(createDraftStore(b).load("w01")).toBeNull();
    b.setItem(DRAFTS_KEY, JSON.stringify({ w01: { code: 1 } }));
    expect(createDraftStore(b).load("w01")).toBeNull();
  });

  it("너무 긴 초안은 저장을 거절한다", () => {
    expect(() => createDraftStore(removableBackend()).save("w01", { ...draft, code: "a".repeat(MAX_DRAFT_CHARS + 1) })).toThrow(/너무 길어/);
  });

  it("저장소가 막혀 있으면 저장 실패를 알린다", () => {
    expect(() => createDraftStore(null).save("w01", draft)).toThrow(/저장할 수 없어/);
  });
});

describe("TokenStore", () => {
  const TOKEN = `github_pat_${"A".repeat(30)}`;

  it("토큰 모양만 받고 앞뒤 공백은 지운다", () => {
    const s = createTokenStore(removableBackend());
    expect(() => s.set("hello")).toThrow(/토큰 모양/);
    expect(() => s.set(`ghp_${"A".repeat(36)}`)).toThrow(/토큰 모양/); // classic 토큰 거절
    s.set(`  ${TOKEN}\n`);
    expect(s.get()).toBe(TOKEN);
    s.clear();
    expect(s.get()).toBeNull();
  });

  it("저장된 값이 토큰 모양이 아니면 없는 것으로 본다", () => {
    const b = removableBackend();
    b.setItem(TOKEN_KEY, "garbage");
    expect(createTokenStore(b).get()).toBeNull();
  });
});

describe("세션 소요 시간", () => {
  it("5~240분, 5분 단위 정수만 받는다", () => {
    expect([5, 30, 240].every(isValidSessionMinutes)).toBe(true);
    expect([0, 3, 7, 245, 12.5, Number.NaN, "30"].some(isValidSessionMinutes)).toBe(false);
  });

  it("세션별로 기록하고 minutes는 합으로 맞춘다. 같은 세션을 다시 넣으면 덮어쓴다", () => {
    const a = withSessionMinutes(undefined, "s1", 30);
    expect(a).toEqual({ status: "todo", checked: [], sessionMinutes: { s1: 30 }, minutes: 30 });
    const b = withSessionMinutes(a, "s2", 45);
    expect(b.minutes).toBe(75);
    const c = withSessionMinutes(b, "s1", 20);
    expect(c.sessionMinutes).toEqual({ s1: 20, s2: 45 });
    expect(c.minutes).toBe(65);
    expect(a.sessionMinutes).toEqual({ s1: 30 }); // 원래 상태는 그대로
  });

  it("null이면 그 세션 기록을 지우고, 다 지우면 필드도 없앤다", () => {
    const a = withSessionMinutes({ status: "in-progress", checked: ["s1"] }, "s1", 30);
    expect(withSessionMinutes(a, "s1", null)).toEqual({ status: "in-progress", checked: ["s1"] });
  });

  it("예전 데이터(minutes만 있음)는 첫 세션 기록 때 legacyMinutes로 옮겨 합에 더한다", () => {
    const old = { status: "in-progress" as const, checked: ["s1"], minutes: 50 };
    const a = withSessionMinutes(old, "s1", 30);
    expect(a).toEqual({ status: "in-progress", checked: ["s1"], sessionMinutes: { s1: 30 }, legacyMinutes: 50, minutes: 80 });
    expect(withSessionMinutes(a, "s1", 40).minutes).toBe(90);
    // 세션 기록을 다 지우면 예전 모양(minutes 하나)으로 돌아간다
    expect(withSessionMinutes(a, "s1", null)).toEqual(old);
  });

  it("불러올 때 minutes는 항상 sessionMinutes(+legacyMinutes)로 다시 계산한다", () => {
    const p = sanitizeProgress({
      lessons: {
        w01: { status: "todo", checked: [], sessionMinutes: { s1: 30, s2: 15 }, minutes: 999 },
        w02: { status: "todo", checked: [], sessionMinutes: { s1: 30 }, legacyMinutes: 20, minutes: 1 },
        w03: { status: "todo", checked: [], minutes: 40 },
        w04: { status: "todo", checked: [], legacyMinutes: 25, minutes: 1 },
        w05: { status: "todo", checked: [], minutes: -3 },
      },
    });
    expect(p?.lessons.w01).toEqual({ status: "todo", checked: [], sessionMinutes: { s1: 30, s2: 15 }, minutes: 45 });
    expect(p?.lessons.w02).toEqual({ status: "todo", checked: [], sessionMinutes: { s1: 30 }, legacyMinutes: 20, minutes: 50 });
    expect(p?.lessons.w03).toEqual({ status: "todo", checked: [], minutes: 40 }); // 예전 합은 그대로
    expect(p?.lessons.w04).toEqual({ status: "todo", checked: [], minutes: 25 });
    expect(p?.lessons.w05).toEqual({ status: "todo", checked: [] });
  });

  it("범위 밖 값은 저장하지 않고 오류", () => {
    expect(() => withSessionMinutes(undefined, "s1", 300)).toThrow(/5~240/);
  });

  it("저장된 sessionMinutes도 검증해 이상한 값은 버린다", () => {
    const p = sanitizeProgress({ lessons: { w01: { status: "todo", checked: [], sessionMinutes: { s1: 30, s2: -1, s3: "x" } } } });
    expect(p?.lessons.w01?.sessionMinutes).toEqual({ s1: 30 });
    const q = sanitizeProgress({ lessons: { w01: { status: "todo", checked: [], sessionMinutes: { s2: -1 } } } });
    expect(q?.lessons.w01).not.toHaveProperty("sessionMinutes");
  });
});

describe("requestPersistentStorage", () => {
  beforeEach(() => resetPersistRequestForTest());

  it("한 번만 부른다", () => {
    const persist = vi.fn(() => Promise.resolve(true));
    requestPersistentStorage({ storage: { persist } });
    requestPersistentStorage({ storage: { persist } });
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("지원하지 않거나 실패해도 던지지 않는다", async () => {
    expect(() => requestPersistentStorage(undefined)).not.toThrow();
    resetPersistRequestForTest();
    expect(() => requestPersistentStorage({ storage: {} })).not.toThrow();
    resetPersistRequestForTest();
    expect(() =>
      requestPersistentStorage({
        storage: {
          persist: () => {
            throw new Error("no");
          },
        },
      }),
    ).not.toThrow();
    resetPersistRequestForTest();
    requestPersistentStorage({ storage: { persist: () => Promise.reject(new Error("denied")) } });
    await Promise.resolve(); // 처리 안 된 거절이 남지 않는다
  });
});
