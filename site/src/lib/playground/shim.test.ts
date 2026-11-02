/**
 * 브라우저 채점기 shim이 진짜 vitest와 같은 판정을 내리는지 확인한다.
 * 같은 (matcher, 받은 값, 기대 값)을 양쪽에 넣고 "통과/실패"가 같아야 한다.
 */
import { describe, expect, it } from "vitest";
import * as shim from "./shim";

type Case = [matcher: string, received: unknown, ...args: unknown[]];

const CASES: Case[] = [
  ["toBe", 32, 32],
  ["toBe", 0, -0],
  ["toBe", NaN, NaN],
  ["toBe", 0.1 + 0.2, 0.3],
  ["toEqual", [0, 0, 1], [0, 0, 1]],
  ["toEqual", [0, -0, 1], [0, 0, 1]],
  ["toEqual", [1, 2], [1, 2, 3]],
  ["toEqual", [[1, 2], [3, 4]], [[1, 2], [3, 4]]],
  ["toEqual", [[1, 2], [3, 4]], [[1, 2], [3, 5]]],
  ["toEqual", [NaN], [NaN]],
  ["toEqual", { a: 1, b: undefined }, { a: 1 }],
  ["toEqual", [1, 2], { 0: 1, 1: 2 }],
  ["toBeCloseTo", 0.1 + 0.2, 0.3],
  ["toBeCloseTo", 1.004, 1],
  ["toBeCloseTo", 1.005, 1],
  ["toBeCloseTo", 1.006, 1],
  ["toBeCloseTo", 1 + 4e-10, 1, 9],
  ["toBeCloseTo", 1 + 6e-10, 1, 9],
  ["toBeCloseTo", 1 + 4e-13, 1, 12],
  ["toBeCloseTo", 1 + 6e-13, 1, 12],
  ["toBeCloseTo", -0, 0, 12],
  ["toBeCloseTo", NaN, 0, 9],
  ["toBeCloseTo", Infinity, Infinity],
  ["toBeCloseTo", -Infinity, Infinity],
  ["toBeLessThan", 1e-10, 1e-9],
  ["toBeLessThan", 1e-9, 1e-9],
  ["toBeLessThan", NaN, 1],
  ["toBeLessThanOrEqual", 1e-9, 1e-9],
  ["toBeLessThanOrEqual", 2, 1],
  ["toBeLessThanOrEqual", NaN, 1],
  ["toHaveLength", [1, 2, 3], 3],
  ["toHaveLength", [1, 2, 3], 2],
  ["toHaveLength", "abc", 3],
  ["toThrow", () => { throw new Error("x"); }],
  ["toThrow", () => 1],
  ["toThrow", () => { throw new Error("rows < cols"); }, "rows"],
  ["toThrow", () => { throw new Error("rows < cols"); }, "zzz"],
  ["toThrow", () => { throw new Error("rows < cols"); }, /cols$/],
];

function passes(run: () => void): boolean {
  try {
    run();
    return true;
  } catch {
    return false;
  }
}

describe("shim expect", () => {
  it.each(CASES)("vitest와 같은 판정: %s(%o)", (matcher, received, ...args) => {
    const real = passes(() => (expect(received) as unknown as Record<string, (...a: unknown[]) => void>)[matcher](...args));
    const fake = passes(() => (shim.expect(received) as unknown as Record<string, (...a: unknown[]) => void>)[matcher](...args));
    expect(fake).toBe(real);
  });

  it("지원하지 않는 matcher는 실패로 처리한다 (조용히 통과 금지)", () => {
    expect(() => (shim.expect(1) as unknown as { not: unknown }).not).toThrow(/지원하지 않는다/);
    expect(() => (shim.expect(1) as unknown as { toBeGreaterThan: unknown }).toBeGreaterThan).toThrow(/지원하지 않는다/);
  });

  it("실패 메시지에 받은 값과 기대 값이 들어간다", () => {
    expect(() => shim.expect([1, 2]).toEqual([1, 3])).toThrow("[1,2]는 [1,3]와 같아야 한다");
  });
});

describe("shim describe/it", () => {
  it("describe 경로와 it 이름을 순서대로 등록하고, 꺼내면 비운다", () => {
    shim.takeRegistered();
    shim.describe("mine", () => {
      shim.describe("skew", () => {
        shim.it("기본: a", () => undefined);
      });
      shim.it("밖: b", () => undefined);
    });
    const cases = shim.takeRegistered();
    expect(cases.map((c) => [c.path, c.name])).toEqual([
      [["mine", "skew"], "기본: a"],
      [["mine"], "밖: b"],
    ]);
    expect(shim.takeRegistered()).toEqual([]);
  });
});
