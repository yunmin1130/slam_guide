/**
 * 초안 하나를 그 주차 core/tests로 채점한다 (워커 안에서 실행, parity 테스트는 Node에서 실행).
 * 순서: 컴파일 → 초안 모듈 등록 → 테스트 파일 import(이때 describe/it 등록) → 함수 하나의 케이스만 실행.
 * 테스트 파일은 한 번만 import되므로 실행할 때마다 새 워커를 쓴다 (client.ts).
 */
import { compileDraft, CompileError, type CompileDeps } from "./compile";
import { setDraftModule } from "./draftImpl";
import { takeRegistered } from "./shim";
import type { CaseResult, RunSummary } from "./protocol";

const TODO_MESSAGE = /^(TODO|SYNTAX_ERROR)$/;

export interface RunRequest {
  week: string; // "w01"
  fn?: string; // 없으면 그 주차 전체
  source: string;
}

export interface RunEnv extends CompileDeps {
  loadTestFile(week: string): Promise<unknown>;
  onCase?(c: CaseResult): void;
}

function classify(e: unknown): Pick<CaseResult, "status" | "message"> {
  const message = e instanceof Error ? e.message : String(e);
  if (TODO_MESSAGE.test(message)) return { status: "todo", message: "아직 TODO" };
  return { status: "fail", message };
}

export async function runDraft(req: RunRequest, env: RunEnv): Promise<RunSummary> {
  let module: Record<string, unknown>;
  try {
    module = compileDraft(req.source, env);
  } catch (e) {
    if (e instanceof CompileError) return { kind: "compile-error", message: e.message, cases: [] };
    throw e;
  }
  setDraftModule(req.week, module);
  takeRegistered(); // 혹시 남은 등록 정리
  await env.loadTestFile(req.week);
  const cases = takeRegistered().filter((c) => c.path[0] === "mine" && (req.fn === undefined || c.path[1] === req.fn));
  if (cases.length === 0) return { kind: "no-tests", message: `${req.week} 테스트에 ${req.fn ?? "함수"} 케이스가 없다`, cases: [] };

  const results: CaseResult[] = [];
  for (const c of cases) {
    let result: CaseResult;
    try {
      await c.fn();
      result = { fn: c.path[1] ?? "", name: c.name, status: "pass" };
    } catch (e) {
      result = { fn: c.path[1] ?? "", name: c.name, ...classify(e) };
    }
    results.push(result);
    env.onCase?.(result);
  }
  return { kind: "done", cases: results };
}
