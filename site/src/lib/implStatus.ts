/**
 * mine 테스트 상태 — 빌드 시점 전용 (.astro 프런트매터에서만 import한다).
 * Vitest 결과 JSON을 클라이언트 번들에 싣지 않으려고 lib/impl.ts에서 떼어냈다.
 * 섬(React) 컴포넌트는 이 파일을 import하지 말고, 여기서 구한 상태를 props로 받는다.
 *
 * 결과 파일(test-results.json, mine-syntax.json)은 CI 생성물이라 없을 수 있다 → 빈 결과로 처리.
 */
import { fnKey, type FnStatus } from "./impl";

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

/** Vitest JSON 결과 + 구문·import 검사 결과 → { "w01/skew": "todo", ... } */
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

const resultFiles = import.meta.glob<unknown>("../data/test-results.json", { eager: true, import: "default" });
const syntaxFiles = import.meta.glob<unknown>("../data/mine-syntax.json", { eager: true, import: "default" });
const syntaxReport: Record<string, unknown> = Object.values(syntaxFiles).find(isRecord) ?? {};
const statusTable = summarizeResults(Object.values(resultFiles)[0], syntaxReport);

export function fnStatus(week: number, fn: string): FnStatus {
  return statusTable[fnKey(week, fn)] ?? "missing";
}

/** 그 주차 mine 파일의 구문·import 오류 메시지 (예: "3행: ';' expected.") */
export function syntaxMessage(week: number): string | undefined {
  const msg = syntaxReport[`w${String(week).padStart(2, "0")}`];
  return typeof msg === "string" ? msg : undefined;
}
