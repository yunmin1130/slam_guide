import { describe, expect, it } from "vitest";
import { defaultImpl, fnKey, loadFn, loadWeek, summarizeResults, type FnStatus } from "./impl";

// Vitest JSON reporter 형식을 줄인 가짜 결과 (실제 필드명과 같다)
function suite(file: string, tests: Array<[string, "passed" | "failed", string?]>, message = "") {
  return {
    name: `C:/repo/core/tests/${file}`,
    status: tests.some((t) => t[1] === "failed") || message ? "failed" : "passed",
    message,
    assertionResults: tests.map(([fn, status, err]) => ({
      ancestorTitles: ["mine", fn],
      title: "기본: ...",
      status,
      failureMessages: err ? [err] : [],
    })),
  };
}

describe("fnKey", () => {
  it("w{NN}/{함수명}", () => {
    expect(fnKey(4, "project")).toBe("w04/project");
  });
});

describe("summarizeResults", () => {
  it("함수별로 통과·TODO·실패를 구분한다", () => {
    const results = {
      testResults: [
        suite("w01.test.ts", [
          ["dot", "passed"],
          ["dot", "passed"],
          ["skew", "failed", "Error: TODO\n    at Module.skew"],
          ["cross", "passed"],
          ["cross", "failed", "AssertionError: expected 1 to be 2"],
        ]),
      ],
    };
    const s = summarizeResults(results, {});
    expect(s["w01/dot"]).toBe<FnStatus>("pass");
    expect(s["w01/skew"]).toBe<FnStatus>("todo");
    expect(s["w01/cross"]).toBe<FnStatus>("fail");
  });

  it("TODO와 다른 실패가 섞이면 fail", () => {
    const s = summarizeResults(
      { testResults: [suite("w02.test.ts", [["f", "failed", "Error: TODO"], ["f", "failed", "AssertionError"]])] },
      {},
    );
    expect(s["w02/f"]).toBe<FnStatus>("fail");
  });

  it("구문 오류 주차는 테스트 결과와 상관없이 syntax-error", () => {
    const s = summarizeResults(
      { testResults: [suite("w01.test.ts", [["skew", "failed", "Error: SYNTAX_ERROR"], ["dot", "failed", "Error: SYNTAX_ERROR"]])] },
      { w01: "3행: ';' expected." },
    );
    expect(s["w01/skew"]).toBe<FnStatus>("syntax-error");
    expect(s["w01/dot"]).toBe<FnStatus>("syntax-error");
  });

  it("결과 파일이 없거나 형식이 이상하면 빈 결과", () => {
    expect(summarizeResults(undefined, undefined)).toEqual({});
    expect(summarizeResults({ testResults: "x" }, null)).toEqual({});
  });

  it("주차 파일 이름이 규칙과 다르면 무시한다", () => {
    expect(summarizeResults({ testResults: [suite("helpers.test.ts", [["x", "passed"]])] }, {})).toEqual({});
  });
});

describe("loadFn", () => {
  it("reference w01의 skew를 실제로 불러온다", async () => {
    const skew = await loadFn<(v: readonly [number, number, number]) => unknown>(1, "skew", "reference");
    expect(skew([1, 2, 3])).toEqual([[0, -3, 2], [3, 0, -1], [-2, 1, 0]]);
  });

  it("없는 주차·함수는 분명한 에러", async () => {
    await expect(loadWeek(99, "reference")).rejects.toThrow("w99");
    await expect(loadFn(1, "nope", "reference")).rejects.toThrow("nope");
  });
});

describe("defaultImpl", () => {
  it("mine 테스트를 전부 통과했을 때만 mine", () => {
    expect(defaultImpl("pass")).toBe("mine");
    for (const s of ["todo", "fail", "syntax-error", "missing"] as const) {
      expect(defaultImpl(s)).toBe("reference");
    }
  });
});
