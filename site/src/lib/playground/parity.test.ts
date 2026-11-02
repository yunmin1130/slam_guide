/**
 * 브라우저 채점 경로 전체(컴파일 → shim → core/tests)가 PC 채점과 같은 결과를 내는지 확인한다.
 * - reference 소스를 초안처럼 넣으면 모든 케이스가 통과해야 한다
 * - 등록된 케이스 수가 테스트 파일의 it( 개수와 같아야 한다 (빠뜨린 케이스 없음)
 * - mine 스텁을 넣으면 TODO 함수의 케이스는 "todo"로 나와야 한다
 * vitest.config.ts의 site project가 vitePlugin.ts로 core/tests의 import를 바꿔 끼운다.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runDraft } from "./runTests";
import { availableWeeks, compileDeps } from "./testFiles";
import type { RunSummary } from "./protocol";

const CORE = fileURLToPath(new URL("../../../../core/", import.meta.url)).replaceAll("\\", "/");
const read = (rel: string) => readFileSync(`${CORE}${rel}`, "utf8");

// 테스트 파일은 프로세스당 한 번만 import되므로 주차마다 새로 등록하려고 매번 쿼리를 붙인다
let n = 0;
const freshImport = (week: string) => import(/* @vite-ignore */ `${CORE}tests/${week}.test.ts?run=${n++}`);

async function run(week: string, source: string): Promise<RunSummary> {
  return runDraft({ week, source }, { ...compileDeps, loadTestFile: freshImport });
}

describe("브라우저 채점 parity", () => {
  const weeks = availableWeeks();

  it("core/tests의 모든 주차를 찾는다", () => {
    const files = readdirSync(`${CORE}tests`).filter((f) => /^w\d{2}\.test\.ts$/.test(f)).map((f) => f.slice(0, 3));
    expect(weeks).toEqual(files.sort());
  });

  it.each(weeks)("%s: reference를 넣으면 전부 통과하고 케이스 수가 같다", async (week) => {
    const summary = await run(week, read(`reference/${week}.ts`));
    expect(summary.kind).toBe("done");
    const failed = summary.cases.filter((c) => c.status !== "pass");
    expect(failed).toEqual([]);
    const itCount = (read(`tests/${week}.test.ts`).match(/^\s*it\(/gm) ?? []).length;
    expect(summary.cases).toHaveLength(itCount);
  });

  it("w01: mine 스텁의 skew는 todo, 읽기만 함수(dot)는 통과", async () => {
    const stub = `import type { Vec3, Mat3 } from "../types";\nexport { dot, cross } from "../reference/w01";\nexport function skew(v: Vec3): Mat3 {\n  throw new Error("TODO");\n}\n`;
    const summary = await run("w01", stub);
    const byFn = (fn: string) => summary.cases.filter((c) => c.fn === fn);
    expect(byFn("dot").every((c) => c.status === "pass")).toBe(true);
    expect(byFn("skew").some((c) => c.status === "todo")).toBe(true);
  });

  it("틀린 구현은 실패로 나온다 (거짓 통과 없음)", async () => {
    const wrong = `export { dot, cross } from "../reference/w01";\nexport function skew(v) {\n  return [[0, 0, 0], [0, 0, 0], [0, 0, 0]];\n}\n`;
    const summary = await run("w01", wrong);
    expect(summary.cases.filter((c) => c.fn === "skew" && c.status === "fail").length).toBeGreaterThan(0);
  });

  it("구문 오류는 줄 번호와 함께 compile-error로 나온다", async () => {
    const summary = await run("w01", "export function skew(v) {\n  return [\n}\n");
    expect(summary.kind).toBe("compile-error");
    expect(summary.kind === "compile-error" && summary.message).toMatch(/^\d+행/);
  });
});
