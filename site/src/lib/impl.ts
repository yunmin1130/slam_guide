/**
 * mine / reference 선택 — 사이트의 유일한 분기점 (ARCHITECTURE §5).
 * 데모는 core를 직접 import하지 않고 이 파일의 loadFn으로 함수를 가져온다.
 *
 * 기본값 규칙: 그 함수의 mine 테스트가 전부 통과하면 mine, 아니면 reference + "아직 내 구현 아님" 배지.
 * 테스트 상태(pass/todo/…)는 빌드 시점에 lib/implStatus.ts가 구해서 props로 넘긴다.
 * 이 파일은 클라이언트 번들에 들어가므로 테스트 결과 JSON을 import하지 않는다.
 */

export type ImplKind = "mine" | "reference";
export type FnStatus = "pass" | "todo" | "fail" | "syntax-error" | "missing";

export const STATUS_LABEL: Record<FnStatus, string> = {
  pass: "내 구현 통과",
  todo: "아직 내 구현 아님",
  fail: "내 구현 테스트 실패",
  "syntax-error": "내 구현 구문 오류",
  missing: "테스트 결과 없음",
};

export function fnKey(week: number, fn: string): string {
  return `w${String(week).padStart(2, "0")}/${fn}`;
}

export function defaultImpl(status: FnStatus): ImplKind {
  return status === "pass" ? "mine" : "reference";
}

// ---- 구현 불러오기 (필요한 주차만 동적 로드) ----

type Module = Record<string, unknown>;
const modules: Record<ImplKind, Record<string, () => Promise<unknown>>> = {
  mine: import.meta.glob("../../../core/mine/w*.ts"),
  reference: import.meta.glob("../../../core/reference/w*.ts"),
};

function findLoader(kind: ImplKind, week: number): (() => Promise<unknown>) | undefined {
  const file = `/w${String(week).padStart(2, "0")}.ts`;
  const entry = Object.entries(modules[kind]).find(([path]) => path.endsWith(file));
  return entry?.[1];
}

export async function loadWeek(week: number, kind: ImplKind): Promise<Module> {
  const loader = findLoader(kind, week);
  if (!loader) throw new Error(`core/${kind}/w${String(week).padStart(2, "0")}.ts 가 없다`);
  return (await loader()) as Module;
}

/** 데모용: 함수 하나를 지정한 구현에서 가져온다. kind는 데모의 토글 상태(기본값은 ImplToggle의 defaultKind). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 함수 시그니처는 호출하는 데모가 정한다
export async function loadFn<F extends (...args: any[]) => unknown>(week: number, fn: string, kind: ImplKind): Promise<F> {
  const value = (await loadWeek(week, kind))[fn];
  if (typeof value !== "function") throw new Error(`${kind}/w${week}에 ${fn} 함수가 없다`);
  return value as F;
}
