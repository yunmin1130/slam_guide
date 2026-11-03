import { describe, expect, it } from "vitest";
import * as w11 from "@core/reference/w11";
import type { VoResult } from "@core/types";
import { evaluateVo } from "./voEval";
import { buildVoParts } from "./voFallback";
import { buildVoOptions, runVoJob, summarize, SYNTHETIC_SETTINGS, TUM_SETTINGS } from "./voJob";
import { makeVoScene, ROTATION_FRAMES, VO_FRAMES, VO_K } from "./voScene";

describe("buildVoOptions", () => {
  it("설정을 VoOptions로 옮기고, local BA를 끄면 ba = null", () => {
    const o = buildVoOptions(TUM_SETTINGS);
    expect(o.track.threshold).toBe(TUM_SETTINGS.trackThreshold);
    expect(o.init.minParallaxDeg).toBe(TUM_SETTINGS.minParallaxDeg);
    expect(o.ba?.window).toBe(TUM_SETTINGS.window);
    expect(o.ba?.solver.robust?.(10).weight).toBeCloseTo(0.2, 12); // Huber k = 2
    expect(buildVoOptions({ ...TUM_SETTINGS, localBA: false }).ba).toBeNull();
  });

  it("같은 설정이면 RANSAC 난수가 매번 같다 (결과가 실행마다 같게)", () => {
    const a = buildVoOptions(SYNTHETIC_SETTINGS);
    const b = buildVoOptions(SYNTHETIC_SETTINGS);
    expect([a.track.rng(), a.track.rng()]).toEqual([b.track.rng(), b.track.rng()]);
  });
});

describe("runVoJob", () => {
  it("합성 장면(제자리 회전 먼저)을 정답 vo로 돌리면 회전 뒤에 초기화하고 끝까지 추적, ATE < 이동 거리의 2%", () => {
    const scene = makeVoScene({ seed: 1, noise: 0.7, outlierRate: 0.05, rotationStart: true });
    const frames: number[] = [];
    const r = runVoJob({ kind: "reference", K: VO_K, frames: scene.frames, settings: SYNTHETIC_SETTINGS }, w11.vo, (f) => frames.push(f));
    expect(r.initFrames![1]).toBeGreaterThanOrEqual(ROTATION_FRAMES);
    expect(r.lostAt).toBeNull();
    expect(frames.at(-1)).toBe(VO_FRAMES - 1);
    const ev = evaluateVo(r.poses, scene.gt, { ate: w11.ate, rpe: w11.rpe }, 5)!;
    expect(ev.ate.rmse).toBeLessThan(0.02 * ev.pathLength);
  });
});

describe("runVoJob + 함수별 대체 (vo.worker.ts와 같은 조립)", () => {
  it("mine 세 함수가 전부 TODO면 reference makeVo로 조립해 정답과 같은 결과를 내고, 대체한 이름을 돌려준다", () => {
    const scene = makeVoScene({ seed: 1, noise: 0.7, outlierRate: 0.05, rotationStart: true });
    const todo = () => {
      throw new Error("TODO");
    };
    const job = { kind: "mine" as const, K: VO_K, frames: scene.frames, settings: SYNTHETIC_SETTINGS };
    const { parts, fallbacks } = buildVoParts({ initMap: todo, trackPnP: todo, localBA: todo }, w11 as unknown as Record<string, unknown>);
    const r = runVoJob(job, w11.makeVo(parts as unknown as w11.VoParts), undefined, fallbacks);
    const expected = runVoJob({ ...job, kind: "reference" }, w11.vo);
    expect(r.fallbacks).toEqual(["initMap", "trackPnP", "localBA"]);
    expect(r.poses).toEqual(expected.poses);
    expect(expected.fallbacks).toEqual([]);
  });
});

describe("summarize", () => {
  const I = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ] as const;
  const ok: VoResult = { poses: [null, { R: I, t: [0, 0, 0] }], keyframes: [], map: [], initFrames: null, lostAt: null };

  it("내 vo가 프레임 수와 다른 길이·NaN 자세를 돌려주면 예외 (그림을 그릴 수 없다)", () => {
    expect(summarize(ok, 2, 1).poses).toHaveLength(2);
    expect(summarize(ok, 2, 1).fallbacks).toEqual([]);
    expect(summarize(ok, 2, 1, ["localBA"]).fallbacks).toEqual(["localBA"]);
    expect(() => summarize(ok, 3, 1)).toThrow(/자세/);
    expect(() => summarize({ ...ok, poses: [null, { R: I, t: [Number.NaN, 0, 0] }] }, 2, 1)).toThrow(/자세/);
    expect(() => summarize(undefined as unknown as VoResult, 2, 1)).toThrow();
  });
});
