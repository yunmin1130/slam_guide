import { describe, expect, it } from "vitest";
import * as w11 from "@core/reference/w11";
import type { SE3 } from "@core/types";
import { quatToMat } from "./tracksFile";
import { evaluateVo, invertSE3, matToQuat, MIN_EVAL_FRAMES, toTumTrajectory } from "./voEval";

const fns = { ate: w11.ate, rpe: w11.rpe };
const rotZ = (a: number) => quatToMat([Math.cos(a / 2), 0, 0, Math.sin(a / 2)]);

/** 원을 도는 정답 궤적 T_wc */
function circle(n: number): SE3[] {
  return Array.from({ length: n }, (_, k) => ({ R: rotZ(0.1 * k), t: [Math.cos(0.1 * k), Math.sin(0.1 * k), 0.05 * k] as const }));
}

describe("evaluateVo", () => {
  it("VO 자세(T_cw)가 정답을 스케일만 바꾼 것이면 ATE·RPE가 0이고 정렬 스케일을 찾는다", () => {
    const gt = circle(30);
    const poses = gt.map((T) => invertSE3({ R: T.R, t: [T.t[0] / 3, T.t[1] / 3, T.t[2] / 3] }));
    const ev = evaluateVo(poses, gt, fns, 5)!;
    expect(ev.frames).toHaveLength(30);
    expect(ev.ate.rmse).toBeLessThan(1e-9);
    expect(ev.ate.align.s).toBeCloseTo(3, 9);
    expect(ev.rpe!.transRmse).toBeLessThan(1e-9);
    ev.estAligned.forEach((p, i) => p.forEach((v, k) => expect(v).toBeCloseTo(gt[i]!.t[k]!, 9)));
    expect(ev.pathLength).toBeGreaterThan(2.9);
  });

  it("추정이나 정답이 null인 프레임은 빼고, 남은 프레임이 3개 미만이면 null", () => {
    const gt = circle(10);
    const poses: (SE3 | null)[] = gt.map((T) => invertSE3(T));
    poses[0] = null;
    const gt2: (SE3 | null)[] = [...gt];
    gt2[5] = null;
    const ev = evaluateVo(poses, gt2, fns, 1)!;
    expect(ev.frames).toEqual([1, 2, 3, 4, 6, 7, 8, 9]);
    expect(evaluateVo(poses.map((T, k) => (k < MIN_EVAL_FRAMES ? T : null)), gt, fns, 1)).toBeNull();
    // 짝이 delta + 1개보다 적으면 RPE는 null
    expect(evaluateVo(poses, gt2, fns, 8)!.rpe).toBeNull();
  });
});

describe("matToQuat · toTumTrajectory", () => {
  it("회전 → 쿼터니언 → 회전이 되돌아온다 (대각합이 음수인 큰 회전 포함)", () => {
    for (const R of [rotZ(0.3), rotZ(2.5), rotZ(3.1), quatToMat([0.1, 0.99, 0.05, 0.02]), quatToMat([0.05, 0.1, 0.99, 0.02])]) {
      const back = quatToMat(matToQuat(R));
      R.forEach((row, i) => row.forEach((v, j) => expect(back[i]![j]).toBeCloseTo(v, 12)));
    }
  });

  it("TUM 궤적 파일: 자세가 있는 프레임만 '시각 tx ty tz qx qy qz qw' (T_wc)", () => {
    const Twc: SE3 = { R: rotZ(Math.PI / 2), t: [1, 2, 3] };
    const lines = toTumTrajectory([10, 10.5], [invertSE3(Twc), null]).trim().split("\n");
    expect(lines[0]).toMatch(/^#/);
    expect(lines).toHaveLength(2);
    const v = lines[1]!.split(" ").map(Number);
    expect(v[0]).toBe(10);
    expect(v.slice(1, 4)).toEqual([1, 2, 3]);
    expect(v[6]).toBeCloseTo(Math.SQRT1_2, 5); // qz
    expect(v[7]).toBeCloseTo(Math.SQRT1_2, 5); // qw
  });
});
