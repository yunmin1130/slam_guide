import { describe, expect, it } from "vitest";
import * as w08 from "../../../core/reference/w08";
import { BA_K, center, FIXED, hessianBlocks, makeBaScene, rmsReprojection } from "./baScene";

describe("makeBaScene", () => {
  it("잡음 없으면 진짜 장면의 재투영 오차가 0, 고정 카메라는 시작값도 정답", () => {
    const s = makeBaScene(1, 0, 1);
    expect(rmsReprojection(s.truth.cams, s.truth.pts, s.obs)).toBeLessThan(1e-9);
    expect(s.obs).toHaveLength(4 * 24);
    FIXED.forEach((c) => expect(s.start.cams[c]).toEqual(s.truth.cams[c]));
    expect(rmsReprojection(s.start.cams, s.start.pts, s.obs)).toBeGreaterThan(5);
  });

  it("카메라는 점 무리를 둘러싼다 (중심이 서로 다르고 모두 z < 6)", () => {
    const s = makeBaScene(1, 0, 0);
    const cs = s.truth.cams.map(center);
    expect(new Set(cs.map((c) => c[0].toFixed(3))).size).toBe(4);
    cs.forEach((c) => expect(c[2]).toBeLessThan(6));
  });

  it("데모 기본 설정에서 정답 smallBA가 진짜 장면 이하의 재투영 오차까지 줄인다 (spread 0 ~ 1, 잡음 0 ~ 2px)", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      for (const [spread, noise] of [[0, 0], [0.5, 1], [1, 2], [1, 0.5]] as const) {
        const s = makeBaScene(seed, noise, spread);
        const out = w08.smallBA({ K: BA_K, cameras: s.start.cams, points: s.start.pts, observations: s.obs, fixed: [...FIXED] }, { maxIterations: 50, tolerance: 1e-8 });
        // 진짜 장면도 가능한 해이므로, 최적해의 재투영 오차는 그보다 작거나 같아야 한다
        expect(rmsReprojection(out.cameras, out.points, s.obs)).toBeLessThan(rmsReprojection(s.truth.cams, s.truth.pts, s.obs) + 1e-6);
      }
    }
  });
});

describe("hessianBlocks", () => {
  it("화살표 모양: 점 블록끼리는 대각만, 카메라-점은 관측이 있을 때", () => {
    const s = makeBaScene(1, 0, 0);
    const { freeCams, filled } = hessianBlocks(4, 24, s.obs, [...FIXED]);
    expect(freeCams).toEqual([2, 3]);
    expect(filled).toHaveLength(26);
    expect(filled[2]![3]).toBe(false); // 점 0과 점 1
    expect(filled[2]![2]).toBe(true);
    expect(filled[0]![2]).toBe(true); // 카메라 2와 점 0
    expect(filled[0]![1]).toBe(false); // 카메라끼리는 같은 변수를 공유하지 않는다
    // 고정 카메라(1, 2)만 본 관측은 점 대각만 채운다
    const onlyFixed = hessianBlocks(4, 24, s.obs.filter((o) => o.cam < 2), [...FIXED]).filled;
    expect(onlyFixed[0]![0]).toBe(false);
    expect(onlyFixed[2]![2]).toBe(true);
  });
});
