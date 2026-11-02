/**
 * 화면 쪽 VO 실행기: 실행마다 새 워커를 만들고, 끝나거나 취소·시간 초과면 종료한다 (playground/client.ts와 같은 방식).
 */
import { friendlyLoadError } from "./staleChunk";
import type { VoJob, VoJobResult } from "./voJob";

/** TUM 800프레임(PC 약 25초)도 느린 폰에서 들어오게 넉넉히 */
export const VO_TIMEOUT_MS = 300_000;
/** 워커 스크립트 자체가 404면(배포로 파일 이름이 바뀜) 브라우저가 이유 없는 오류만 낸다 */
export const VO_LOAD_FAILED_MESSAGE = "VO 계산기를 불러오지 못했어. 페이지를 새로고침해줘";

export type VoWorkerIn = VoJob;
export type VoWorkerOut = { type: "progress"; frame: number } | { type: "done"; result: VoJobResult } | { type: "error"; message: string };

export type VoOutcome = { kind: "done"; result: VoJobResult } | { kind: "error"; message: string } | { kind: "timeout" } | { kind: "cancelled" };

export interface WorkerLike {
  postMessage(m: VoWorkerIn): void;
  terminate(): void;
  onmessage: ((e: MessageEvent<VoWorkerOut>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  onmessageerror?: ((e: MessageEvent) => void) | null;
}

function createWorker(): WorkerLike {
  return new Worker(new URL("./vo.worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike;
}

export interface VoRun {
  readonly promise: Promise<VoOutcome>;
  cancel(): void;
}

export interface VoRunOptions {
  onProgress?(frame: number): void;
  timeoutMs?: number;
  makeWorker?: () => WorkerLike; // 테스트용
}

export function runVoInWorker(job: VoJob, opts: VoRunOptions = {}): VoRun {
  const { timeoutMs = VO_TIMEOUT_MS, makeWorker = createWorker } = opts;
  let cancel = () => {};
  const promise = new Promise<VoOutcome>((resolve) => {
    let worker: WorkerLike;
    try {
      worker = makeWorker();
    } catch (e) {
      resolve({ kind: "error", message: `계산기를 시작하지 못했어: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }
    let settled = false;
    const finish = (outcome: VoOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(outcome);
    };
    const timer = setTimeout(() => finish({ kind: "timeout" }), timeoutMs);
    cancel = () => finish({ kind: "cancelled" });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") opts.onProgress?.(m.frame);
      else if (m.type === "done") finish({ kind: "done", result: m.result });
      else finish({ kind: "error", message: friendlyLoadError(m.message) });
    };
    worker.onerror = (e) => {
      e.preventDefault?.();
      finish({ kind: "error", message: e.message ? friendlyLoadError(e.message) : VO_LOAD_FAILED_MESSAGE });
    };
    worker.onmessageerror = () => finish({ kind: "error", message: "계산기가 보낸 결과를 읽지 못했어" });
    try {
      worker.postMessage(job);
    } catch (e) {
      finish({ kind: "error", message: `계산기에 데이터를 넘기지 못했어: ${e instanceof Error ? e.message : String(e)}` });
    }
  });
  return { promise, cancel: () => cancel() };
}
