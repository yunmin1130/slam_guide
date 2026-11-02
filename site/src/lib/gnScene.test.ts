import { describe, expect, it } from "vitest";
import * as w07 from "../../../core/reference/w07";
import { curve, expProblem, isFiniteParams, makeExpData, T_MAX, TRUTH } from "./gnScene";

describe("makeExpData", () => {
  it("점 20개, 잡음이 없으면 진짜 곡선 위, 아웃라이어를 켜면 3개", () => {
    const d = makeExpData(1, 0, false);
    expect(d.ts).toHaveLength(20);
    expect(d.ts[19]).toBeCloseTo(T_MAX, 12);
    d.ts.forEach((t, i) => expect(d.ys[i]).toBeCloseTo(TRUTH.a * Math.exp(TRUTH.b * t), 12));
    expect(makeExpData(1, 0, true).isOutlier.filter(Boolean)).toHaveLength(3);
  });
});

describe("expProblem", () => {
  it("야코비안이 수치 미분과 맞고, 진짜 값에서 잔차가 0", () => {
    const p = expProblem(makeExpData(2, 0, false));
    expect(Math.max(...p.residual([TRUTH.a, TRUTH.b]).map(Math.abs))).toBeLessThan(1e-12);
    const J = w07.numericJacobian((x: readonly [number, number]) => p.residual(x), [1.3, -0.2] as const, p.plus, 2);
    const A = p.jacobian([1.3, -0.2]);
    expect(Math.max(...J.flatMap((row, i) => row.map((v, j) => Math.abs(v - A[i]![j]!))))).toBeLessThan(1e-6);
  });

  it("데모 기본 설정(시작 1, 0)에서 GN과 LM이 진짜 값 근처로, 먼 시작(5, 2)에서는 LM만", () => {
    const p = expProblem(makeExpData(1, 0.05, false));
    const opts = { maxIterations: 30, tolerance: 1e-8 };
    const gn = w07.gaussNewton(p, [1, 0] as const, opts);
    expect(Math.abs(gn.x[0] - TRUTH.a)).toBeLessThan(0.1);
    const far = w07.gaussNewton(p, [5, 2] as const, opts);
    expect(far.x[1]).toBeGreaterThan(10); // GN은 b가 크게 튄 엉뚱한 곳으로 간다 (데모 지시문과 같다)
    const lm = w07.levenbergMarquardt(p, [5, 2] as const, opts);
    expect(Math.abs(lm.x[1] - TRUTH.b)).toBeLessThan(0.1);
  });
});

describe("데모 설정 격자", () => {
  it("기본 시작 (1, 0)에서 잡음 0~0.2 × 아웃라이어 × Huber 모든 조합에 GN·LM이 예외 없이 끝난다", () => {
    const huber = (r: number) => w07.huber(r, 0.1);
    for (const noise of [0, 0.05, 0.1, 0.15, 0.2]) {
      for (const outliers of [false, true]) {
        for (const robust of [undefined, huber]) {
          const p = expProblem(makeExpData(1, noise, outliers));
          const opts = { maxIterations: 30, tolerance: 1e-8, robust };
          expect(Number.isFinite(w07.gaussNewton(p, [1, 0] as const, opts).cost)).toBe(true);
          expect(Number.isFinite(w07.levenbergMarquardt(p, [1, 0] as const, opts).cost)).toBe(true);
        }
      }
    }
  });
});

describe("curve · isFiniteParams", () => {
  it("곡선은 0 ~ T_MAX를 덮고, NaN 매개변수는 거른다", () => {
    const c = curve([2, -0.5], 10);
    expect(c[0]![0]).toBe(0);
    expect(c[9]![0]).toBeCloseTo(T_MAX, 12);
    expect(isFiniteParams([1, 2])).toBe(true);
    expect(isFiniteParams([1, Number.NaN])).toBe(false);
    expect(isFiniteParams([1])).toBe(false);
  });
});
