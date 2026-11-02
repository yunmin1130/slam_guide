import { describe, expect, it, vi } from "vitest";
import { runInWorker, type WorkerLike } from "./client";
import type { WorkerMessage } from "./protocol";
import { LOAD_FAILED_MESSAGE, STALE_CHUNK_MESSAGE } from "../staleChunk";

function fakeWorker(script: (w: WorkerLike) => void): { make: () => WorkerLike; terminated: () => boolean } {
  let terminated = false;
  const w: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage: () => queueMicrotask(() => script(w)),
    terminate: () => {
      terminated = true;
    },
  };
  return { make: () => w, terminated: () => terminated };
}

const send = (w: WorkerLike, m: WorkerMessage) => w.onmessage?.({ data: m } as MessageEvent<WorkerMessage>);

describe("runInWorker", () => {
  it("케이스를 차례로 넘기고 summary로 끝낸 뒤 워커를 종료한다", async () => {
    const f = fakeWorker((w) => {
      send(w, { type: "case", result: { fn: "skew", name: "기본: a", status: "pass" } });
      send(w, { type: "summary", summary: { kind: "done", cases: [{ fn: "skew", name: "기본: a", status: "pass" }] } });
    });
    const seen: string[] = [];
    const out = await runInWorker({ week: "w01", fn: "skew", source: "", makeWorker: f.make, onCase: (c) => seen.push(c.name) });
    expect(out.kind).toBe("done");
    expect(seen).toEqual(["기본: a"]);
    expect(f.terminated()).toBe(true);
  });

  it("시간이 넘으면 워커를 끊고 그때까지 받은 케이스와 timeout을 돌려준다 (무한 루프)", async () => {
    vi.useFakeTimers();
    const f = fakeWorker((w) => send(w, { type: "case", result: { fn: "skew", name: "기본: a", status: "pass" } }));
    const p = runInWorker({ week: "w01", source: "", makeWorker: f.make, timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(150);
    const out = await p;
    vi.useRealTimers();
    expect(out.kind).toBe("timeout");
    expect(out.cases).toHaveLength(1);
    expect(f.terminated()).toBe(true);
  });

  it("워커를 못 만들면 crash로 알린다", async () => {
    const out = await runInWorker({
      week: "w01",
      source: "",
      makeWorker: () => {
        throw new Error("no worker");
      },
    });
    expect(out).toMatchObject({ kind: "crash" });
  });

  it("워커 내부 오류(crash 메시지)도 결과로 돌려준다", async () => {
    const f = fakeWorker((w) => send(w, { type: "crash", message: "boom" }));
    const out = await runInWorker({ week: "w01", source: "", makeWorker: f.make });
    expect(out).toMatchObject({ kind: "crash", message: "boom" });
  });
  it("배포로 테스트 파일이 사라졌으면 새로고침 안내로 바꾼다", async () => {
    const f = fakeWorker((w) => send(w, { type: "crash", message: "Failed to fetch dynamically imported module: https://x/_astro/w01.test-A.js" }));
    const out = await runInWorker({ week: "w01", source: "", makeWorker: f.make });
    expect(out).toMatchObject({ kind: "crash", message: STALE_CHUNK_MESSAGE });
  });

  it("워커 스크립트를 못 불러오면(메시지 없는 onerror) 새로고침 안내로 알린다", async () => {
    const f = fakeWorker((w) => w.onerror?.({ message: "", preventDefault: () => undefined } as unknown as ErrorEvent));
    const out = await runInWorker({ week: "w01", source: "", makeWorker: f.make });
    expect(out).toMatchObject({ kind: "crash", message: LOAD_FAILED_MESSAGE });
  });

  it("일반 오류 메시지는 그대로 둔다", async () => {
    const f = fakeWorker((w) => w.onerror?.({ message: "boom", preventDefault: () => undefined } as unknown as ErrorEvent));
    const out = await runInWorker({ week: "w01", source: "", makeWorker: f.make });
    expect(out).toMatchObject({ kind: "crash", message: "boom" });
  });
});
