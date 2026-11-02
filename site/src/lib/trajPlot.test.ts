import { describe, expect, it } from "vitest";
import type { Vec3 } from "@core/types";
import { bounds, plotFrame, project, scaleBar } from "./trajPlot";

describe("plotFrame · project", () => {
  it("가장 넓게 퍼진 방향이 가로축: x로 길고 z로 조금 퍼진 궤적은 (x, z) 평면으로 투영된다", () => {
    const pts: Vec3[] = Array.from({ length: 20 }, (_, k) => [k, 0.01 * Math.sin(k), 0.3 * Math.cos(k)]);
    const f = plotFrame(pts);
    expect(Math.abs(f.axes[0][0])).toBeCloseTo(1, 3);
    expect(Math.abs(f.axes[1][2])).toBeGreaterThan(0.99);
    expect(Math.abs(project(f, pts[19]!)[0])).toBeCloseTo(9.5, 1);
  });
});

describe("bounds · scaleBar", () => {
  it("범위와 깔끔한 축척 막대 길이", () => {
    expect(
      bounds([
        [1, 2],
        [-3, 5],
      ]),
    ).toEqual({ x0: -3, x1: 1, y0: 2, y1: 5 });
    expect(bounds([])).toEqual({ x0: -1, x1: 1, y0: -1, y1: 1 });
    expect(scaleBar(100, 360)).toBe(1); // 1 m = 100px ≤ 폭의 35%(126px)
    expect(scaleBar(1000, 360)).toBe(0.1);
    // 거의 정지한 궤적: 0.01 m도 그림을 넘으면 폭의 35%로 줄인다
    expect(1e5 * scaleBar(1e5, 360)).toBeCloseTo(0.35 * 360, 9);
  });
});
