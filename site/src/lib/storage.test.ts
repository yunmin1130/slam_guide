import { describe, expect, it } from "vitest";
import { createLocalStore, sanitizeProgress, STORAGE_KEY, type KeyValueBackend } from "./storage";

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
