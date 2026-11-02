import { describe, expect, it } from "vitest";
import * as w05 from "../../../core/reference/w05";
import * as w06 from "../../../core/reference/w06";
import { cameraCenter, directionDiffDeg, reconstruct, rotationDiffDeg, StageError, syntheticPairs, type W06Fns } from "./reconstruct";

const W5 = { eightPoint: w05.eightPoint, ransac: w05.ransac };
const W6: W06Fns = { decomposeE: w06.decomposeE, triangulate: w06.triangulate, pnpDLT: w06.pnpDLT };

function stageOf(f: () => unknown): string | null {
  try {
    f();
    return null;
  } catch (e) {
    return e instanceof StageError ? e.stage : "StageError 아님";
  }
}

describe("reconstruct (정답 구현으로)", () => {
  it("합성 장면: 자세를 되찾고, 점이 두 카메라 앞에 오며, 재투영 오차가 작다", () => {
    const { a, b, scale, truth } = syntheticPairs(1);
    const r = reconstruct(W5, W6, a, b, scale);
    expect(rotationDiffDeg(r.T21.R, truth.R)).toBeLessThan(1);
    expect(directionDiffDeg(r.T21.t, truth.t)).toBeLessThan(5);
    expect(r.inliers / r.total).toBeGreaterThan(0.6);
    expect(r.points.length).toBeGreaterThan(r.inliers * 0.9);
    expect(r.reprojMedianPx).toBeLessThan(1);
    expect(r.pnpCheck).not.toBeNull();
    expect(r.pnpCheck!.rotDeg).toBeLessThan(1);
    expect(r.pnpCheck!.tDeg).toBeLessThan(5);
  });

  it("복원한 점의 깊이에 진짜 이동 크기를 곱하면 장면 거리(4~12m)가 나온다", () => {
    const { a, b, scale, truth } = syntheticPairs(2);
    const r = reconstruct(W5, W6, a, b, scale);
    const med = r.depthMedian * Math.hypot(...truth.t);
    expect(med).toBeGreaterThan(4);
    expect(med).toBeLessThan(12);
  });

  it("'새 장면'으로 나올 장면 40개 모두에서 회전 오차 < 1°, pnpDLT와 회전 차이 < 0.5° (레슨 체크리스트 기준)", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { a, b, scale, truth } = syntheticPairs(seed);
      const r = reconstruct(W5, W6, a, b, scale);
      expect(rotationDiffDeg(r.T21.R, truth.R)).toBeLessThan(1);
      expect(directionDiffDeg(r.T21.t, truth.t)).toBeLessThan(10);
      expect(r.pnpCheck!.rotDeg).toBeLessThan(0.5);
    }
  });

  it("어느 함수에서 실패했는지 단계 이름으로 알린다", () => {
    const { a, b, scale } = syntheticPairs(3);
    const boom = (): never => {
      throw new Error("TODO");
    };
    expect(stageOf(() => reconstruct(W5, { ...W6, decomposeE: boom }, a, b, scale))).toBe("decomposeE");
    expect(stageOf(() => reconstruct(W5, { ...W6, triangulate: boom }, a, b, scale))).toBe("triangulate");
    expect(stageOf(() => reconstruct(W5, { ...W6, pnpDLT: boom }, a, b, scale))).toBe("pnpDLT");
    expect(stageOf(() => reconstruct(W5, W6, a.slice(0, 7), b.slice(0, 7), scale))).toBe("입력");
  });

  it("NaN을 돌려주는 구현도 예외가 아니라 StageError로 알린다", () => {
    const { a, b, scale } = syntheticPairs(4);
    const nanPose = () => ({ R: [[Number.NaN, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 1] }) as never;
    const nanPoint = () => [Number.NaN, 0, 1] as never;
    expect(stageOf(() => reconstruct(W5, { ...W6, decomposeE: nanPose }, a, b, scale))).toBe("decomposeE");
    expect(stageOf(() => reconstruct(W5, { ...W6, triangulate: nanPoint }, a, b, scale))).toBe("triangulate");
    expect(stageOf(() => reconstruct(W5, { ...W6, pnpDLT: nanPose }, a, b, scale))).toBe("pnpDLT");
  });
});

describe("cameraCenter", () => {
  it("p_c = R·c + t = 0 인 점", () => {
    const T = {
      R: [
        [0, -1, 0],
        [1, 0, 0],
        [0, 0, 1],
      ] as const,
      t: [1, 2, 3] as const,
    };
    const c = cameraCenter(T);
    const back = [0, 1, 2].map((i) => T.R[i]![0] * c[0] + T.R[i]![1] * c[1] + T.R[i]![2] * c[2] + T.t[i]!);
    expect(Math.max(...back.map(Math.abs))).toBeLessThan(1e-12);
  });
});
