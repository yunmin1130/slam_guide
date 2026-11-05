import { describe, expect, it } from "vitest";
import { solveLeastSquares } from "../../../core/reference/w02";
import { columnDots, designMatrix, POINT_SETS, residuals, sse } from "./lsScene";

describe("lsScene", () => {
  it("기본: 레슨 본문 예시 (0,1),(1,1),(2,3)의 최소제곱 직선은 y = t + 2/3", () => {
    const pts = [
      [0, 1],
      [1, 1],
      [2, 3],
    ] as const;
    const { A, b } = designMatrix(pts);
    expect(A).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
    ]);
    expect(b).toEqual([1, 1, 3]);
    const [a, c] = solveLeastSquares(A, b);
    expect(a).toBeCloseTo(1, 12);
    expect(c).toBeCloseTo(2 / 3, 12);
    const r = residuals(pts, a!, c!);
    [1 / 3, -2 / 3, 1 / 3].forEach((v, i) => expect(r[i]).toBeCloseTo(v, 12));
  });

  it("경계: 모든 점 위를 지나는 직선이면 잔차·제곱합이 0", () => {
    const pts = [
      [0, 2],
      [1, 3],
      [3, 5],
    ] as const;
    expect(sse(residuals(pts, 1, 2))).toBe(0);
  });

  it("수치: 점 묶음마다 최소제곱 해에서 잔차가 두 열에 수직이고, 해를 조금 옮기면 제곱합이 커진다", () => {
    for (const set of POINT_SETS) {
      const { A, b } = designMatrix(set.points);
      const [a, c] = solveLeastSquares(A, b) as [number, number];
      const r = residuals(set.points, a, c);
      const [dt, d1] = columnDots(set.points, r);
      expect(Math.abs(dt)).toBeLessThan(1e-9);
      expect(Math.abs(d1)).toBeLessThan(1e-9);
      const best = sse(r);
      for (const [da, dc] of [
        [0.05, 0],
        [0, 0.05],
        [-0.05, 0.05],
      ] as const) {
        expect(sse(residuals(set.points, a + da, c + dc))).toBeGreaterThan(best);
      }
    }
  });
});
