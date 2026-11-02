import { describe, expect, it } from "vitest";
import { IMAGE, clipLine, isFiniteMatrix, makeFitter, makeScene, meanLineDistance, pointLineDistance, ransacIterations, seededRng, trueF } from "./epipolarScene";

describe("seededRng", () => {
  it("같은 시드는 같은 수열, [0, 1) 범위", () => {
    const a = seededRng(7);
    const b = seededRng(7);
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe("makeScene", () => {
  it("점 개수, 아웃라이어 비율을 지키고 모든 점이 이미지 안에 있다", () => {
    const s = makeScene({ seed: 1, count: 60, noisePx: 0.5, outlierRatio: 0.3 });
    expect(s.x1).toHaveLength(60);
    expect(s.x2).toHaveLength(60);
    expect(s.isOutlier.filter(Boolean)).toHaveLength(18);
    const inside = ([u, v]: readonly [number, number]) => u >= 0 && u <= IMAGE.width && v >= 0 && v <= IMAGE.height;
    expect(s.x1.every(inside) && s.x2.every(inside)).toBe(true);
  });

  it("잡음이 없으면 진짜 inlier는 진짜 F의 에피폴라선 위에 있다", () => {
    const s = makeScene({ seed: 2, count: 40, noisePx: 0, outlierRatio: 0.25 });
    const F = trueF(s);
    const inl = s.isOutlier.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);
    expect(meanLineDistance(F, s.x1, s.x2, inl)).toBeLessThan(1e-8);
    const out = s.isOutlier.map((o, i) => (o ? i : -1)).filter((i) => i >= 0);
    expect(meanLineDistance(F, s.x1, s.x2, out)).toBeGreaterThan(1);
  });
});

describe("isFiniteMatrix · makeFitter", () => {
  it("NaN·크기가 틀린 행렬은 거부, fit은 예외를 null로 바꾸고 이유를 기억한다", () => {
    expect(isFiniteMatrix([[1, 0, 0], [0, 1, 0], [0, 0, 1]])).toBe(true);
    expect(isFiniteMatrix([[1, 0, 0], [0, Number.NaN, 0], [0, 0, 1]])).toBe(false);
    expect(isFiniteMatrix([[1, 0], [0, 1]])).toBe(false);
    const throwing = makeFitter(() => {
      throw new Error("TODO");
    }, [[0, 0]], [[0, 0]]);
    expect(throwing.fit([0])).toBe(null);
    expect(throwing.lastError()).toBe("TODO");
    const nan = makeFitter(() => [[Number.NaN, 0, 0], [0, 0, 0], [0, 0, 0]], [[0, 0]], [[0, 0]]);
    expect(nan.fit([0])).toBe(null);
    expect(nan.lastError()).toMatch(/NaN/);
  });
});

describe("ransacIterations", () => {
  it("inlier 70%, 표본 8개면 약 78번, 100%면 1번, 0%면 무한", () => {
    expect(ransacIterations(0.7, 8)).toBe(78);
    expect(ransacIterations(1, 8)).toBe(1);
    expect(ransacIterations(0, 8)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("pointLineDistance", () => {
  it("F = [t]× (x축 이동)에서 (0, 0.2)의 선은 y = 0.2, 점 (5, 1.2)까지 거리 1", () => {
    const F = [
      [0, 0, 0],
      [0, 0, -1],
      [0, 1, 0],
    ];
    expect(pointLineDistance(F, [0, 0.2], [5, 1.2])).toBeCloseTo(1, 12);
  });
});

describe("clipLine", () => {
  it("수평선 y = 100은 이미지 왼쪽 끝에서 오른쪽 끝까지", () => {
    const seg = clipLine([0, 1, -100]);
    expect(seg).not.toBe(null);
    const xs = [seg![0][0], seg![1][0]].sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(0, 9);
    expect(xs[1]).toBeCloseTo(IMAGE.width, 9);
    expect(seg![0][1]).toBeCloseTo(100, 9);
  });

  it("이미지를 지나지 않는 선은 null", () => {
    expect(clipLine([0, 1, -10000])).toBe(null);
  });
});
