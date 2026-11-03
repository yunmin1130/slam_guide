/**
 * VO 워커 (11c 데모, 11d TUM 실행기). 몇 초 걸리는 계산을 화면 밖에서 돌려 폰 화면이 멈추지 않게 한다.
 * 구현(mine/reference)은 lib/impl.ts로 불러온다 (ARCHITECTURE §5).
 * mine이면 initMap·trackPnP·localBA 중 아직 TODO인 것만 reference로 바꿔 reference의 makeVo로 조립한다 (lib/voFallback.ts).
 */
import { loadWeek, type ImplKind } from "./impl";
import { buildVoParts } from "./voFallback";
import { runVoJob, type VoFn } from "./voJob";
import type { VoWorkerIn, VoWorkerOut } from "./voClient";

const post = (m: VoWorkerOut) => self.postMessage(m);
/** 진행 표시는 이 간격(프레임)마다 한 번만 보낸다 */
const PROGRESS_EVERY = 5;

interface LoadedVo {
  readonly vo: VoFn;
  readonly fallbacks: () => readonly string[];
}

async function loadVo(kind: ImplKind): Promise<LoadedVo> {
  const ref = await loadWeek(11, "reference");
  if (kind === "reference") {
    if (typeof ref.vo !== "function") throw new Error("reference/w11에 vo가 없다");
    return { vo: ref.vo as VoFn, fallbacks: () => [] };
  }
  const mine = await loadWeek(11, "mine");
  if (typeof ref.makeVo !== "function") throw new Error("reference/w11에 makeVo가 없다");
  const { parts, fallbacks } = buildVoParts(mine, ref);
  return { vo: (ref.makeVo as (p: typeof parts) => VoFn)(parts), fallbacks };
}

self.onmessage = async (e: MessageEvent<VoWorkerIn>) => {
  const job = e.data;
  try {
    const { vo, fallbacks } = await loadVo(job.kind);
    const onFrame = (frame: number) => {
      if (frame % PROGRESS_EVERY === 0) post({ type: "progress", frame });
    };
    const result = runVoJob(job, vo, onFrame, fallbacks);
    post({ type: "done", result });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
