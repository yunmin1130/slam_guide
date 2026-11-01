/**
 * mine / reference 선택 — 사이트의 유일한 분기점 (ARCHITECTURE §5).
 * 데모는 core를 직접 import하지 않고 이 파일의 loadFn으로 함수를 가져온다.
 *
 * 기본값: 그 함수의 mine 테스트가 전부 통과하면 mine, 아니면 reference + "아직 내 구현 아님" 배지.
 * 결과 파일(test-results.json, mine-syntax.json)은 CI 생성물이라 없을 수 있다 → 빈 결과로 처리.
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

// ---- 결과 요약 (순수 함수) ----

const WEEK_FROM_TEST_FILE = /[\\/](w\d{2})\.test\.ts$/;
const TODO_ERROR = /\bError: TODO\b/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function assertionsOf(suite: unknown): Array<{ fn: string; passed: boolean; todo: boolean }> {
  if (!isRecord(suite) || !Array.isArray(suite.assertionResults)) return [];
  return suite.assertionResults.flatMap((a: unknown) => {
    if (!isRecord(a) || !Array.isArray(a.ancestorTitles)) return [];
    // 테스트 제목 규칙: describe(구현) > describe(함수명) > it(...)  (LESSON_TEMPLATE §4)
    // reference 결과가 섞여 들어와도 오판하지 않도록 mine 결과만 센다
    if (a.ancestorTitles[0] !== "mine") return [];
    const fn = a.ancestorTitles[1];
    if (typeof fn !== "string" || (a.status !== "passed" && a.status !== "failed")) return [];
    const messages = Array.isArray(a.failureMessages) ? a.failureMessages.join("\n") : "";
    return [{ fn, passed: a.status === "passed", todo: TODO_ERROR.test(messages) }];
  });
}

/** Vitest JSON 결과 + 구문 검사 결과 → { "w01/skew": "todo", ... } */
export function summarizeResults(results: unknown, syntax: unknown): Record<string, FnStatus> {
  const brokenWeeks = new Set(isRecord(syntax) ? Object.keys(syntax) : []);
  const suites = isRecord(results) && Array.isArray(results.testResults) ? results.testResults : [];
  const groups = new Map<string, Array<{ passed: boolean; todo: boolean }>>();

  for (const suite of suites) {
    const name = isRecord(suite) && typeof suite.name === "string" ? suite.name : "";
    const week = WEEK_FROM_TEST_FILE.exec(name)?.[1];
    if (!week) continue;
    for (const { fn, ...r } of assertionsOf(suite)) {
      const key = `${week}/${fn}`;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
  }

  const summary: Record<string, FnStatus> = {};
  for (const [key, rs] of groups) {
    const failures = rs.filter((r) => !r.passed);
    summary[key] = brokenWeeks.has(key.slice(0, 3))
      ? "syntax-error"
      : failures.length === 0
        ? "pass"
        : failures.every((r) => r.todo)
          ? "todo"
          : "fail";
  }
  return summary;
}

// ---- 빌드 시점 데이터 ----

const resultFiles = import.meta.glob<unknown>("../data/test-results.json", { eager: true, import: "default" });
const syntaxFiles = import.meta.glob<unknown>("../data/mine-syntax.json", { eager: true, import: "default" });
const syntaxReport: Record<string, unknown> = Object.values(syntaxFiles).find(isRecord) ?? {};
const statusTable = summarizeResults(Object.values(resultFiles)[0], syntaxReport);

export function fnStatus(week: number, fn: string): FnStatus {
  return statusTable[fnKey(week, fn)] ?? "missing";
}

/** 구문 오류 메시지 (예: "3행: ';' expected.") */
export function syntaxMessage(week: number): string | undefined {
  const msg = syntaxReport[`w${String(week).padStart(2, "0")}`];
  return typeof msg === "string" ? msg : undefined;
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

/** 데모용: 함수 하나를 지정한 구현에서 가져온다. kind를 생략하면 테스트 결과 기준 기본값. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 함수 시그니처는 호출하는 데모가 정한다
export async function loadFn<F extends (...args: any[]) => unknown>(
  week: number,
  fn: string,
  kind: ImplKind = defaultImpl(fnStatus(week, fn)),
): Promise<F> {
  const value = (await loadWeek(week, kind))[fn];
  if (typeof value !== "function") throw new Error(`${kind}/w${week}에 ${fn} 함수가 없다`);
  return value as F;
}
