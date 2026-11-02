/**
 * 화면 쪽 채점 실행기: 실행마다 새 워커를 만들고, 끝나거나 시간이 넘으면 종료한다.
 * 새 워커를 쓰는 이유: 테스트 파일은 모듈 캐시 때문에 한 워커에서 한 번만 등록된다 (runTests.ts).
 */
import type { CaseResult, RunMessage, RunSummary, WorkerMessage } from "./protocol";

// 워커 시작·테스트 파일 로드 시간 포함. 느린 폰의 첫 실행도 넉넉히 들어오게
export const RUN_TIMEOUT_MS = 8000;

export type RunOutcome =
  | RunSummary
  | { kind: "timeout"; cases: CaseResult[] }
  | { kind: "crash"; message: string; cases: CaseResult[] };

export interface WorkerLike {
  postMessage(m: RunMessage): void;
  terminate(): void;
  onmessage: ((e: MessageEvent<WorkerMessage>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

function createWorker(): WorkerLike {
  return new Worker(new URL("./runner.worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike;
}

export interface RunOptions {
  week: string;
  fn?: string;
  source: string;
  onCase?(c: CaseResult): void;
  timeoutMs?: number;
  makeWorker?: () => WorkerLike; // 테스트용
}

export function runInWorker(opts: RunOptions): Promise<RunOutcome> {
  const { timeoutMs = RUN_TIMEOUT_MS, makeWorker = createWorker } = opts;
  return new Promise((resolve) => {
    const cases: CaseResult[] = [];
    let worker: WorkerLike;
    try {
      worker = makeWorker();
    } catch (e) {
      resolve({ kind: "crash", message: `채점기를 시작하지 못했어: ${e instanceof Error ? e.message : String(e)}`, cases });
      return;
    }
    let settled = false;
    const finish = (outcome: RunOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(outcome);
    };
    const timer = setTimeout(() => finish({ kind: "timeout", cases }), timeoutMs);

    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "case") {
        cases.push(m.result);
        opts.onCase?.(m.result);
      } else if (m.type === "summary") {
        finish(m.summary);
      } else {
        finish({ kind: "crash", message: m.message, cases });
      }
    };
    worker.onerror = (e) => {
      e.preventDefault?.();
      finish({ kind: "crash", message: e.message || "채점기 오류", cases });
    };
    worker.postMessage({ type: "run", week: opts.week, fn: opts.fn, source: opts.source });
  });
}
