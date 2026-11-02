/**
 * 초안 TS 코드 → 실행된 모듈 객체 (브라우저 채점기, 워커 안에서 실행).
 * sucrase로 타입만 지우고 import를 require로 바꾼 뒤, 허용된 모듈만 넘겨서 실행한다.
 * 타입 검사는 하지 않는다 (PC의 npm run test:mine·CI 구문 검사가 맡는다).
 */
import { transform } from "sucrase";

export class CompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompileError";
  }
}

export interface CompileDeps {
  /** "w01" → reference 모듈 (읽기만 함수 re-export, @core/prev용) */
  reference: Record<string, unknown>;
  /** 패키지 이름 → 모듈 (예: "ml-matrix") */
  packages: Record<string, unknown>;
}

const REFERENCE_SPEC = /^(?:\.\.\/reference\/|@core\/reference\/|@core\/prev\/)(w\d{2})(?:\.ts)?$/;
const TYPES_SPEC = /^(?:\.\.\/types|@core\/types)(?:\.ts)?$/;

function makeRequire(deps: CompileDeps): (spec: string) => unknown {
  return (spec) => {
    if (TYPES_SPEC.test(spec)) return {};
    const ref = REFERENCE_SPEC.exec(spec);
    if (ref) {
      const mod = deps.reference[ref[1]];
      if (mod) return mod;
      throw new CompileError(`'${spec}': 그 주차 reference가 없다`);
    }
    if (spec in deps.packages) return deps.packages[spec];
    const allowed = [...Object.keys(deps.packages), "../reference/wNN", "../types"].join(", ");
    throw new CompileError(`'${spec}'는 브라우저에서 불러올 수 없어. 쓸 수 있는 것: ${allowed}`);
  };
}

/** sucrase 오류 메시지 "Unexpected token (3:5)" → "3행 5열: Unexpected token" */
function syntaxMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = /^(.*?)\s*\((\d+):(\d+)\)\s*$/.exec(msg);
  return m ? `${m[2]}행 ${Number(m[3]) + 1}열: ${m[1]}` : msg;
}

export function compileDraft(source: string, deps: CompileDeps): Record<string, unknown> {
  let js: string;
  try {
    js = transform(source, { transforms: ["typescript", "imports"], production: true }).code;
  } catch (e) {
    throw new CompileError(syntaxMessage(e));
  }
  const module = { exports: {} as Record<string, unknown> };
  // 사용자 자신의 코드만 실행한다 (워커 안, DOM·저장소·토큰 접근 없음)
  const run = new Function("require", "exports", "module", js) as (
    r: (s: string) => unknown,
    e: Record<string, unknown>,
    m: { exports: Record<string, unknown> },
  ) => void;
  try {
    run(makeRequire(deps), module.exports, module);
  } catch (e) {
    if (e instanceof CompileError) throw e;
    throw new CompileError(`파일을 읽는 중 오류: ${e instanceof Error ? e.message : String(e)}`);
  }
  return module.exports;
}
