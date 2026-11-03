/**
 * 14주차 테스트. 제목 구조는 강제 규칙이다 (LESSON_TEMPLATE §4):
 *   describe(구현) > describe("<함수명>") > it("기본|경계|수치: …")
 * - 원운동은 해석해(위치·속도·자세)가 있어서 적분 오차를 정확히 잴 수 있다.
 * - 사전적분은 손코딩 함수(integrateIMU)에 기대지 않으려고, 비교용 오일러 적분을 테스트 안에서 따로 돌린다.
 * - biasJacobians(읽기만)는 바이어스를 조금 바꿔 정답 preintegrate 를 다시 돌린 유한 차분과 비교한다.
 */
import { describe, expect, it } from "vitest";
import { expSO3, logSO3 } from "../reference/w03";
import { preintegrate as refPreintegrate } from "../reference/w14";
import { IMPL, loadImpl } from "./loadImpl";
import { createRng, type Rng } from "./rng";
import type { ImuBias, ImuSample, Mat3, NavState, Vec3 } from "../types";

type W14 = typeof import("../reference/w14");
const m = await loadImpl<W14>("w14");

const G: Vec3 = [0, 0, -9.81];
const I3: Mat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const NO_BIAS: ImuBias = { gyro: [0, 0, 0], accel: [0, 0, 0] };

function mm(A: Mat3, B: Mat3): Mat3 {
  const c = (i: number, j: number) => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  return [
    [c(0, 0), c(0, 1), c(0, 2)],
    [c(1, 0), c(1, 1), c(1, 2)],
    [c(2, 0), c(2, 1), c(2, 2)],
  ];
}

function mv(A: Mat3, v: Vec3): Vec3 {
  const r = (i: number) => A[i][0] * v[0] + A[i][1] * v[1] + A[i][2] * v[2];
  return [r(0), r(1), r(2)];
}

function tr(A: Mat3): Mat3 {
  return [
    [A[0][0], A[1][0], A[2][0]],
    [A[0][1], A[1][1], A[2][1]],
    [A[0][2], A[1][2], A[2][2]],
  ];
}

function v3(f: (i: number) => number): Vec3 {
  return [f(0), f(1), f(2)];
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function maxDiff(A: readonly (readonly number[])[], B: readonly (readonly number[])[]): number {
  let d = 0;
  A.forEach((r, i) => r.forEach((x, j) => (d = Math.max(d, Math.abs(x - B[i]![j]!)))));
  return d;
}

/**
 * 반지름 r, 각속도 w 로 원을 그리며 진행 방향을 보는 몸체 (몸체 x = 진행 방향).
 * 위치 p(t) = r·[sin wt, 1 − cos wt, 0], 가속도는 몸체 y 방향 r·w².
 */
function circle(r: number, w: number, hz: number, seconds: number): { samples: ImuSample[]; truth: (t: number) => NavState } {
  const n = Math.round(hz * seconds) + 1;
  const samples = Array.from({ length: n }, (_, k) => ({
    t: k / hz,
    gyro: [0, 0, w] as Vec3,
    accel: [0, r * w * w, 9.81] as Vec3, // 비력 = Rᵀ(a − g)
  }));
  const truth = (t: number): NavState => ({
    R: expSO3([0, 0, w * t]),
    p: [r * Math.sin(w * t), r * (1 - Math.cos(w * t)), 0],
    v: [r * w * Math.cos(w * t), r * w * Math.sin(w * t), 0],
  });
  return { samples, truth };
}

function randomSamples(rng: Rng, n: number): ImuSample[] {
  let t = 0;
  return Array.from({ length: n }, () => {
    const s = {
      t,
      gyro: [rng() - 0.5, rng() - 0.5, rng() - 0.5] as Vec3,
      accel: [2 * rng() - 1, 2 * rng() - 1, 9.81 + rng() - 0.5] as Vec3,
    };
    t += 0.005 + 0.01 * rng(); // 간격이 고르지 않아도 된다
    return s;
  });
}

/** 비교용 오일러 적분 (integrateIMU euler 와 같은 식, 손코딩 함수에 기대지 않으려고 따로 둔다) */
function eulerFinal(init: NavState, samples: readonly ImuSample[], bias: ImuBias): NavState {
  let { R, p, v } = init;
  for (let k = 0; k + 1 < samples.length; k++) {
    const s = samples[k]!;
    const dt = samples[k + 1]!.t - s.t;
    const Rf = mv(R, v3((i) => s.accel[i]! - bias.accel[i]!));
    const a = v3((i) => Rf[i]! + G[i]!);
    const pv = p;
    const vv = v;
    p = v3((i) => pv[i]! + vv[i]! * dt + 0.5 * a[i]! * dt * dt);
    v = v3((i) => vv[i]! + a[i]! * dt);
    R = mm(R, expSO3(v3((i) => (s.gyro[i]! - bias.gyro[i]!) * dt)));
  }
  return { R, p, v };
}

/** 사전적분으로 i → j 상태 */
function apply(s: NavState, pre: { dR: Mat3; dv: Vec3; dp: Vec3; dt: number }): NavState {
  const T = pre.dt;
  const Rdv = mv(s.R, pre.dv);
  const Rdp = mv(s.R, pre.dp);
  return {
    R: mm(s.R, pre.dR),
    v: v3((i) => s.v[i]! + G[i]! * T + Rdv[i]!),
    p: v3((i) => s.p[i]! + s.v[i]! * T + 0.5 * G[i]! * T * T + Rdp[i]!),
  };
}

describe(IMPL, () => {
  describe("integrateIMU", () => {
    it("기본: 결과 길이는 측정 수와 같고 0번은 시작 상태다", () => {
      const init: NavState = { R: I3, p: [1, 2, 3], v: [0, 0, 0] };
      const { samples } = circle(1, 0.5, 100, 0.1);
      const out = m.integrateIMU(init, samples, { gravity: G, method: "euler" });
      expect(out).toHaveLength(samples.length);
      expect(out[0]!.p).toEqual([1, 2, 3]);
    });

    it("기본: 일정한 비력·각속도면 두 방법 모두 정확하다 (p = ½at², R = Exp(ωt))", () => {
      const samples = Array.from({ length: 101 }, (_, k) => ({ t: k * 0.01, gyro: [0, 0, 0] as Vec3, accel: [1, 0, 9.81] as Vec3 }));
      for (const method of ["euler", "midpoint"] as const) {
        const out = m.integrateIMU({ R: I3, p: [0, 0, 0], v: [0, 0, 0] }, samples, { gravity: G, method });
        const last = out[out.length - 1]!;
        expect(last.p[0]).toBeCloseTo(0.5, 10);
        expect(last.v[0]).toBeCloseTo(1, 10);
        expect(Math.abs(last.p[2])).toBeLessThan(1e-10);
      }
      const spin = Array.from({ length: 51 }, (_, k) => ({ t: k * 0.02, gyro: [0.3, -0.1, 0.2] as Vec3, accel: [0, 0, 0] as Vec3 }));
      const out = m.integrateIMU({ R: I3, p: [0, 0, 0], v: [0, 0, 0] }, spin, { gravity: [0, 0, 0], method: "midpoint" });
      expect(maxDiff(out[50]!.R, expSO3([0.3, -0.1, 0.2]))).toBeLessThan(1e-10);
    });

    it("기본: 각속도·비력이 바뀌는 한 구간을 손으로 계산한 값과 같다 (오일러는 시작 값, 중점은 양 끝 평균)", () => {
      const R0 = expSO3([0.2, -0.1, 0.4]);
      const init: NavState = { R: R0, p: [1, 0, 0], v: [0.3, 0.1, 0] };
      const s0: ImuSample = { t: 0, gyro: [0.5, -0.4, 1.2], accel: [0.7, 0.2, 9.6] };
      const s1: ImuSample = { t: 0.2, gyro: [-0.3, 0.9, 0.1], accel: [-0.4, 1.1, 10.2] };
      const dt = 0.2;
      const expectStep = (R1: Mat3, a: Vec3, out: NavState) => {
        expect(maxDiff(out.R, R1)).toBeLessThan(1e-14);
        expect(dist(out.v, v3((i) => init.v[i]! + a[i]! * dt))).toBeLessThan(1e-14);
        expect(dist(out.p, v3((i) => init.p[i]! + init.v[i]! * dt + 0.5 * a[i]! * dt * dt))).toBeLessThan(1e-14);
      };
      // 오일러: 시작 자세 R0 로 시작 비력을 돌린다
      const Re = mm(R0, expSO3(v3((i) => s0.gyro[i]! * dt)));
      const fe = mv(R0, s0.accel);
      expectStep(Re, v3((i) => fe[i]! + G[i]!), m.integrateIMU(init, [s0, s1], { gravity: G, method: "euler" })[1]!);
      // 중점: 평균 각속도, 두 끝 비력을 각자 자세로 돌려 평균
      const Rm = mm(R0, expSO3(v3((i) => 0.5 * (s0.gyro[i]! + s1.gyro[i]!) * dt)));
      const f0 = mv(R0, s0.accel);
      const f1 = mv(Rm, s1.accel);
      expectStep(Rm, v3((i) => 0.5 * (f0[i]! + f1[i]!) + G[i]!), m.integrateIMU(init, [s0, s1], { gravity: G, method: "midpoint" })[1]!);
    });

    it("경계: 측정 2개 미만, 줄어드는 시각, NaN, 모르는 method 면 예외", () => {
      const init: NavState = { R: I3, p: [0, 0, 0], v: [0, 0, 0] };
      const s = (t: number): ImuSample => ({ t, gyro: [0, 0, 0], accel: [0, 0, 9.81] });
      const opts = { gravity: G, method: "euler" as const };
      expect(() => m.integrateIMU(init, [s(0)], opts)).toThrow();
      expect(() => m.integrateIMU(init, [s(0), s(0)], opts)).toThrow();
      expect(() => m.integrateIMU(init, [s(0), s(-1)], opts)).toThrow();
      expect(() => m.integrateIMU(init, [s(0), { ...s(1), accel: [NaN, 0, 0] }], opts)).toThrow();
      expect(() => m.integrateIMU(init, [s(0), s(1)], { gravity: G, method: "rk4" as unknown as "euler" })).toThrow();
    });

    it("수치: 원운동 2초에서 중점법이 오일러보다 훨씬 정확하다", () => {
      const { samples, truth } = circle(2, 1.5, 100, 2);
      const init = truth(0);
      const end = truth(samples[samples.length - 1]!.t);
      const errOf = (method: "euler" | "midpoint"): number => {
        const out = m.integrateIMU(init, samples, { gravity: G, method });
        return dist(out[out.length - 1]!.p, end.p);
      };
      const eEuler = errOf("euler");
      const eMid = errOf("midpoint");
      expect(eMid).toBeLessThan(2e-3);
      expect(eMid * 10).toBeLessThan(eEuler);
      // 자세는 각속도가 일정해서 두 방법 다 정확하다
      const out = m.integrateIMU(init, samples, { gravity: G, method: "euler" });
      expect(maxDiff(out[out.length - 1]!.R, end.R)).toBeLessThan(1e-9);
    });
  });

  describe("preintegrate", () => {
    it("기본: 가만히 있으면 ΔR = I, Δv = −g·Δt, Δp = −½g·Δt² (몸체 좌표의 비력만 쌓인다)", () => {
      const samples = Array.from({ length: 21 }, (_, k) => ({ t: k * 0.05, gyro: [0, 0, 0] as Vec3, accel: [0, 0, 9.81] as Vec3 }));
      const pre = m.preintegrate(samples, NO_BIAS);
      expect(pre.dt).toBeCloseTo(1, 12);
      expect(maxDiff(pre.dR, I3)).toBeLessThan(1e-12);
      expect(pre.dv[2]).toBeCloseTo(9.81, 10);
      expect(pre.dp[2]).toBeCloseTo(0.5 * 9.81, 10);
      // 상태에 적용하면 중력과 상쇄되어 그대로
      const after = apply({ R: I3, p: [1, 1, 1], v: [0, 0, 0] }, pre);
      expect(dist(after.p, [1, 1, 1])).toBeLessThan(1e-10);
    });

    it("기본: 주어진 바이어스를 빼고 적분한다", () => {
      const rng = createRng(3);
      const clean = randomSamples(rng, 40);
      const bias: ImuBias = { gyro: [0.01, -0.02, 0.03], accel: [0.1, 0.2, -0.1] };
      const biased = clean.map((s) => ({
        t: s.t,
        gyro: v3((i) => s.gyro[i]! + bias.gyro[i]!),
        accel: v3((i) => s.accel[i]! + bias.accel[i]!),
      }));
      const a = m.preintegrate(clean, NO_BIAS);
      const b = m.preintegrate(biased, bias);
      expect(maxDiff(a.dR, b.dR)).toBeLessThan(1e-12);
      expect(dist(a.dv, b.dv)).toBeLessThan(1e-12);
      expect(dist(a.dp, b.dp)).toBeLessThan(1e-12);
    });

    it("경계: 측정 2개 미만, 줄어드는 시각, NaN 바이어스면 예외", () => {
      const s = (t: number): ImuSample => ({ t, gyro: [0, 0, 0], accel: [0, 0, 9.81] });
      expect(() => m.preintegrate([s(0)], NO_BIAS)).toThrow();
      expect(() => m.preintegrate([s(1), s(0.5)], NO_BIAS)).toThrow();
      expect(() => m.preintegrate([s(0), s(1)], { gyro: [NaN, 0, 0], accel: [0, 0, 0] })).toThrow();
    });

    it("수치: 사전적분을 적용한 결과가 같은 측정의 오일러 적분과 같다 (시작 자세·속도가 달라도)", () => {
      const rng = createRng(14);
      const samples = randomSamples(rng, 60);
      const bias: ImuBias = { gyro: [0.02, 0, -0.01], accel: [0, 0.05, 0.1] };
      const pre = m.preintegrate(samples, bias);
      const inits: NavState[] = [
        { R: I3, p: [0, 0, 0], v: [0, 0, 0] },
        { R: expSO3([0.5, -1.2, 2.0]), p: [3, -1, 2], v: [1, 2, -0.5] },
      ];
      for (const init of inits) {
        const want = eulerFinal(init, samples, bias);
        const got = apply(init, pre);
        expect(maxDiff(got.R, want.R)).toBeLessThan(1e-10);
        expect(dist(got.v, want.v)).toBeLessThan(1e-9);
        expect(dist(got.p, want.p)).toBeLessThan(1e-9);
      }
    });

    it("수치: 둘로 나눠 사전적분한 뒤 합치면 한 번에 한 것과 같다", () => {
      const rng = createRng(41);
      const samples = randomSamples(rng, 50);
      const all = m.preintegrate(samples, NO_BIAS);
      const a = m.preintegrate(samples.slice(0, 21), NO_BIAS); // 0~20
      const b = m.preintegrate(samples.slice(20), NO_BIAS); // 20~49 (경계 측정을 같이 쓴다)
      const Rdv = mv(a.dR, b.dv);
      const Rdp = mv(a.dR, b.dp);
      expect(maxDiff(mm(a.dR, b.dR), all.dR)).toBeLessThan(1e-12);
      expect(dist(v3((i) => a.dv[i]! + Rdv[i]!), all.dv)).toBeLessThan(1e-12);
      expect(dist(v3((i) => a.dp[i]! + a.dv[i]! * b.dt + Rdp[i]!), all.dp)).toBeLessThan(1e-12);
    });
  });

  describe("biasJacobians", () => {
    it("기본: 측정이 둘이면 손으로 푼 값과 같다 (Δv_ba = −dt·I, Δp_ba = −½dt²·I, ΔR_bg = −dt·Jr(0))", () => {
      const samples: ImuSample[] = [
        { t: 0, gyro: [0, 0, 0], accel: [0, 0, 9.81] },
        { t: 0.1, gyro: [0, 0, 0], accel: [0, 0, 9.81] },
      ];
      const J = m.biasJacobians(samples, NO_BIAS);
      const d = (k: number) => [
        [k, 0, 0],
        [0, k, 0],
        [0, 0, k],
      ];
      expect(maxDiff(J.dv_dba, d(-0.1))).toBeLessThan(1e-15);
      expect(maxDiff(J.dp_dba, d(-0.005))).toBeLessThan(1e-15);
      expect(maxDiff(J.dR_dbg, d(-0.1))).toBeLessThan(1e-15);
      // 첫 구간에서는 ΔR 의 바이어스 의존이 아직 0이라 v 의 자이로 바이어스 의존도 0
      expect(maxDiff(J.dv_dbg, d(0))).toBeLessThan(1e-15);
    });

    it("경계: 측정 2개 미만이면 예외", () => {
      expect(() => m.biasJacobians([{ t: 0, gyro: [0, 0, 0], accel: [0, 0, 0] }], NO_BIAS)).toThrow();
    });

    it("수치: 바이어스를 조금 바꿔 다시 사전적분한 유한 차분과 맞는다", () => {
      const rng = createRng(1414);
      const samples = randomSamples(rng, 80);
      const bias: ImuBias = { gyro: [0.01, -0.02, 0.005], accel: [0.05, -0.03, 0.02] };
      const J = m.biasJacobians(samples, bias);
      const base = refPreintegrate(samples, bias);
      const eps = 1e-6;
      let worst = 0;
      for (let k = 0; k < 3; k++) {
        const pg = refPreintegrate(samples, { gyro: v3((i) => bias.gyro[i]! + (i === k ? eps : 0)), accel: bias.accel });
        const pa = refPreintegrate(samples, { gyro: bias.gyro, accel: v3((i) => bias.accel[i]! + (i === k ? eps : 0)) });
        const dR = logSO3(mm(tr(base.dR), pg.dR)); // 우섭동
        for (let i = 0; i < 3; i++) {
          worst = Math.max(
            worst,
            Math.abs(J.dR_dbg[i]![k]! - dR[i]! / eps),
            Math.abs(J.dv_dbg[i]![k]! - (pg.dv[i]! - base.dv[i]!) / eps),
            Math.abs(J.dp_dbg[i]![k]! - (pg.dp[i]! - base.dp[i]!) / eps),
            Math.abs(J.dv_dba[i]![k]! - (pa.dv[i]! - base.dv[i]!) / eps),
            Math.abs(J.dp_dba[i]![k]! - (pa.dp[i]! - base.dp[i]!) / eps),
          );
        }
      }
      expect(worst).toBeLessThan(1e-5);
    });
  });
});
