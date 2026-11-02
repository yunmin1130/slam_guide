import { describe, expect, it } from "vitest";
import { invertSE3 } from "./voEval";
import { makeVoScene, ROTATION_FRAMES, VO_FRAMES, VO_H, VO_K, VO_W } from "./voScene";

describe("makeVoScene", () => {
  it("프레임마다 화면 안의 특징점만, 잡음이 없으면 정답 자세로 정확히 투영한 좌표", () => {
    const s = makeVoScene({ seed: 3, noise: 0, outlierRate: 0, rotationStart: false });
    expect(s.frames).toHaveLength(VO_FRAMES);
    expect(s.gt).toHaveLength(VO_FRAMES);
    for (const [k, f] of s.frames.entries()) {
      expect(f.length).toBeGreaterThan(100);
      const T = invertSE3(s.gt[k]!);
      for (const { id, uv } of f) {
        expect(uv[0]).toBeGreaterThanOrEqual(0);
        expect(uv[0]).toBeLessThan(VO_W);
        expect(uv[1]).toBeLessThan(VO_H);
        const X = s.points[id]!;
        const p = [0, 1, 2].map((i) => T.R[i]![0] * X[0] + T.R[i]![1] * X[1] + T.R[i]![2] * X[2] + T.t[i]!);
        expect(uv[0]).toBeCloseTo((VO_K.fx * p[0]!) / p[2]! + VO_K.cx, 9);
        expect(uv[1]).toBeCloseTo((VO_K.fy * p[1]!) / p[2]! + VO_K.cy, 9);
      }
    }
  });

  it("제자리 회전 구간은 위치가 그대로이고, 같은 seed면 같은 장면", () => {
    const a = makeVoScene({ seed: 4, noise: 0.5, outlierRate: 0.1, rotationStart: true });
    for (let k = 0; k < ROTATION_FRAMES; k++) expect(a.gt[k]!.t).toEqual([0, 0, 0]);
    expect(a.gt[ROTATION_FRAMES + 1]!.t[0]).toBeGreaterThan(0);
    expect(makeVoScene({ seed: 4, noise: 0.5, outlierRate: 0.1, rotationStart: true })).toEqual(a);
  });
});
