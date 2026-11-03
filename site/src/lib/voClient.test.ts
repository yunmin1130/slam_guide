import { describe, expect, it, vi } from "vitest";
import { runVoInWorker, VO_LOAD_FAILED_MESSAGE, type VoWorkerOut, type WorkerLike } from "./voClient";
import { SYNTHETIC_SETTINGS, type VoJobResult } from "./voJob";

const job = { kind: "reference" as const, K: { fx: 1, fy: 1, cx: 0, cy: 0 }, frames: [], settings: SYNTHETIC_SETTINGS };
const result: VoJobResult = { poses: [], keyframeFrames: [], mapPoints: [], initFrames: null, lostAt: null, ms: 1, fallbacks: [] };

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
const send = (w: WorkerLike, m: VoWorkerOut) => w.onmessage?.({ data: m } as MessageEvent<VoWorkerOut>);

describe("runVoInWorker", () => {
  it("진행을 넘기고 done으로 끝낸 뒤 워커를 종료한다", async () => {
    const f = fakeWorker((w) => {
      send(w, { type: "progress", frame: 5 });
      send(w, { type: "done", result });
    });
    const seen: number[] = [];
    const out = await runVoInWorker(job, { makeWorker: f.make, onProgress: (k) => seen.push(k) }).promise;
    expect(out).toEqual({ kind: "done", result });
    expect(seen).toEqual([5]);
    expect(f.terminated()).toBe(true);
  });

  it("취소하면 cancelled, 시간이 넘으면 timeout, 둘 다 워커를 끊는다", async () => {
    const idle = fakeWorker(() => undefined);
    const run = runVoInWorker(job, { makeWorker: idle.make });
    run.cancel();
    expect(await run.promise).toEqual({ kind: "cancelled" });
    expect(idle.terminated()).toBe(true);

    vi.useFakeTimers();
    const slow = fakeWorker(() => undefined);
    const p = runVoInWorker(job, { makeWorker: slow.make, timeoutMs: 100 }).promise;
    await vi.advanceTimersByTimeAsync(150);
    vi.useRealTimers();
    expect(await p).toEqual({ kind: "timeout" });
    expect(slow.terminated()).toBe(true);
  });

  it("워커 오류·메시지 없는 오류·워커 생성 실패를 error로 알린다", async () => {
    const boom = fakeWorker((w) => send(w, { type: "error", message: "boom" }));
    expect(await runVoInWorker(job, { makeWorker: boom.make }).promise).toEqual({ kind: "error", message: "boom" });
    const silent = fakeWorker((w) => w.onerror?.({ message: "", preventDefault: () => undefined } as unknown as ErrorEvent));
    expect(await runVoInWorker(job, { makeWorker: silent.make }).promise).toEqual({ kind: "error", message: VO_LOAD_FAILED_MESSAGE });
    const out = await runVoInWorker(job, {
      makeWorker: () => {
        throw new Error("no worker");
      },
    }).promise;
    expect(out).toMatchObject({ kind: "error" });
  });

  it("작업을 넘기다 실패하면(구조화 복제 오류) error로 알리고 워커를 끊는다", async () => {
    const f = fakeWorker(() => undefined);
    const make = () => {
      const w = f.make();
      w.postMessage = () => {
        throw new Error("DataCloneError");
      };
      return w;
    };
    const out = await runVoInWorker(job, { makeWorker: make }).promise;
    expect(out).toMatchObject({ kind: "error" });
    expect(f.terminated()).toBe(true);
  });

  it("끝난 뒤에 온 결과·오류는 무시한다 (결과가 두 번 바뀌지 않게)", async () => {
    let late: (() => void) | null = null;
    const f = fakeWorker((w) => {
      send(w, { type: "done", result });
      late = () => send(w, { type: "error", message: "late" });
    });
    const run = runVoInWorker(job, { makeWorker: f.make });
    const out = await run.promise;
    late!();
    expect(out.kind).toBe("done");
    expect(await run.promise).toEqual(out);
  });
});
