/**
 * VO 워커 (11c 데모, 11d TUM 실행기). 몇 초 걸리는 계산을 화면 밖에서 돌려 폰 화면이 멈추지 않게 한다.
 * 구현(mine/reference)은 lib/impl.ts로 불러온다 (ARCHITECTURE §5).
 */
import { loadWeek } from "./impl";
import { runVoJob, type VoFn } from "./voJob";
import type { VoWorkerIn, VoWorkerOut } from "./voClient";

const post = (m: VoWorkerOut) => self.postMessage(m);
/** 진행 표시는 이 간격(프레임)마다 한 번만 보낸다 */
const PROGRESS_EVERY = 5;

self.onmessage = async (e: MessageEvent<VoWorkerIn>) => {
  const job = e.data;
  try {
    const mod = await loadWeek(11, job.kind);
    if (typeof mod.vo !== "function") throw new Error(`${job.kind}/w11에 vo가 없다`);
    const result = runVoJob(job, mod.vo as VoFn, (frame) => {
      if (frame % PROGRESS_EVERY === 0) post({ type: "progress", frame });
    });
    post({ type: "done", result });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
