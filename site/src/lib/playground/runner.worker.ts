/**
 * 채점 워커. 실행 한 번에 워커 하나 (client.ts가 끝나면 종료한다).
 * DOM·localStorage·토큰에 접근할 수 없는 곳에서 사용자 코드를 돌리기 위해 분리했다.
 */
import { runDraft } from "./runTests";
import { compileDeps, loadTestFile } from "./testFiles";
import type { RunMessage, WorkerMessage } from "./protocol";

const post = (m: WorkerMessage) => self.postMessage(m);

self.onmessage = async (e: MessageEvent<RunMessage>) => {
  const { week, fn, source } = e.data;
  try {
    const summary = await runDraft(
      { week, fn, source },
      { ...compileDeps, loadTestFile, onCase: (result) => post({ type: "case", result }) },
    );
    post({ type: "summary", summary });
  } catch (err) {
    post({ type: "crash", message: err instanceof Error ? err.message : String(err) });
  }
};
