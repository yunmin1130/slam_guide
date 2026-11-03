/**
 * 13주차 테스트. 제목 구조는 강제 규칙이다 (LESSON_TEMPLATE §4):
 *   describe(구현) > describe("<함수명>") > it("기본|경계|수치: …")
 * - 오차 전이 F는 명목 상태를 조금 흔든 두 궤적의 차이(유한 차분)로 따로 만들어 P 전파와 비교한다.
 * - 회전 오차는 좌섭동: 참 R = Exp(δθ)·R (CURRICULUM 7주차 규약).
 */
import { describe, expect, it } from "vitest";
import { Matrix, inverse } from "ml-matrix";
import { expSO3, logSO3 } from "../reference/w03";
import { IMPL, loadImpl } from "./loadImpl";
import { createRng } from "./rng";
import type { EskfNoise, EskfState, Mat3, Vec3 } from "../types";

type W13 = typeof import("../reference/w13");
const m = await loadImpl<W13>("w13");

const G: Vec3 = [0, 0, -9.81];
const I3: Mat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

function eye(n: number, k = 1): number[][] {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? k : 0)));
}

function zeros(n: number): number[][] {
  return eye(n, 0);
}

function mm(A: Mat3, B: Mat3): Mat3 {
  const c = (i: number, j: number) => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  return [
    [c(0, 0), c(0, 1), c(0, 2)],
    [c(1, 0), c(1, 1), c(1, 2)],
    [c(2, 0), c(2, 1), c(2, 2)],
  ];
}

function tr(A: Mat3): Mat3 {
  return [
    [A[0][0], A[1][0], A[2][0]],
    [A[0][1], A[1][1], A[2][1]],
    [A[0][2], A[1][2], A[2][2]],
  ];
}

function maxDiff(A: readonly (readonly number[])[], B: readonly (readonly number[])[]): number {
  let d = 0;
  A.forEach((r, i) => r.forEach((x, j) => (d = Math.max(d, Math.abs(x - B[i]![j]!)))));
  return d;
}

function state(R: Mat3, p: Vec3, v: Vec3, P: number[][]): EskfState {
  return { R, p, v, P };
}

const quiet: EskfNoise = { gyro: 0, accel: 0, gravity: G };

describe(IMPL, () => {
  describe("eskfPredict", () => {
    it("기본: 가만히 있으면 (비력이 중력을 상쇄) 명목 상태가 그대로이고 P에 전이와 잡음이 더해진다", () => {
      const s = state(I3, [1, 2, 3], [0, 0, 0], eye(9, 0.01));
      const noise: EskfNoise = { gyro: 0.1, accel: 0.2, gravity: G };
      const out = m.eskfPredict(s, { gyro: [0, 0, 0], accel: [0, 0, 9.81], dt: 0.5 }, noise);
      expect(maxDiff(out.R, I3)).toBeLessThan(1e-12);
      expect(maxDiff([out.p, out.v], [[1, 2, 3], [0, 0, 0]])).toBeLessThan(1e-12);
      // δθ: 그대로 + 자이로 잡음
      expect(out.P[0]![0]).toBeCloseTo(0.01 + (0.1 * 0.5) ** 2, 12);
      expect(out.P[2]![2]).toBeCloseTo(0.01 + (0.1 * 0.5) ** 2, 12);
      // δp_x: δv_x·dt 와 δθ_y·½·9.81·dt² 를 받는다 (비력이 z축이라 [R·a]× 의 x행은 θ_y 성분만)
      const pxx = 0.01 + 0.01 * 0.25 + 0.01 * (0.5 * 0.25 * 9.81) ** 2;
      expect(out.P[3]![3]).toBeCloseTo(pxx, 10);
      // δp_z: [R·a]× 의 z행이 0이라 δv_z 만
      expect(out.P[5]![5]).toBeCloseTo(0.01 + 0.01 * 0.25, 12);
      // δv_z: 가속도계 잡음만
      expect(out.P[8]![8]).toBeCloseTo(0.01 + (0.2 * 0.5) ** 2, 12);
    });

    it("기본: 일정한 가속도와 각속도를 정확히 적분한다 (p = ½at², v = at, R = Exp(ωt))", () => {
      let s = state(I3, [0, 0, 0], [0, 0, 0], zeros(9));
      for (let k = 0; k < 100; k++) s = m.eskfPredict(s, { gyro: [0, 0, 0.3], accel: [0, 0, 9.81], dt: 0.01 }, quiet);
      expect(maxDiff(s.R, expSO3([0, 0, 0.3]))).toBeLessThan(1e-10);
      // 몸체가 z축으로만 돌므로 비력 [0,0,9.81]은 월드에서도 같은 방향 → 정지 그대로
      expect(Math.hypot(...s.p) + Math.hypot(...s.v)).toBeLessThan(1e-10);

      let t = state(I3, [0, 0, 0], [0, 0, 0], zeros(9));
      for (let k = 0; k < 100; k++) t = m.eskfPredict(t, { gyro: [0, 0, 0], accel: [2, 0, 9.81], dt: 0.01 }, quiet);
      expect(t.p[0]).toBeCloseTo(1, 10);
      expect(t.v[0]).toBeCloseTo(2, 10);
    });

    it("기본: 몸체가 기울어 있으면 비력을 월드로 돌린 뒤 중력을 더한다", () => {
      // y축으로 −90° 돌면 몸체 x축이 월드 z축을 본다 → 몸체 [9.81, 0, 0]이 월드 [0, 0, 9.81]
      const R = expSO3([0, -Math.PI / 2, 0]);
      const hold = m.eskfPredict(state(R, [0, 0, 0], [0, 0, 0], zeros(9)), { gyro: [0, 0, 0], accel: [9.81, 0, 0], dt: 0.1 }, quiet);
      expect(Math.hypot(...hold.v)).toBeLessThan(1e-12);
      // 비력이 0이면 중력으로 떨어진다
      const fall = m.eskfPredict(state(R, [0, 0, 0], [0, 0, 0], zeros(9)), { gyro: [0, 0, 0], accel: [0, 0, 0], dt: 0.1 }, quiet);
      expect(fall.v[2]).toBeCloseTo(-0.981, 12);
      expect(fall.p[2]).toBeCloseTo(-0.5 * 9.81 * 0.01, 12);
    });

    it("기본: 비스듬한 비력과 각속도를 함께 주면 비력은 적분 전 자세로 돌린다 (한 걸음 손 계산)", () => {
      const R0 = expSO3([0.4, -0.3, 0.6]);
      const f: Vec3 = [1.2, -0.5, 9.5];
      const w: Vec3 = [0.8, 0.3, -1.1];
      const dt = 0.1;
      const out = m.eskfPredict(state(R0, [1, 2, 3], [0.5, -0.2, 0.1], zeros(9)), { gyro: w, accel: f, dt }, quiet);
      const Rf = [0, 1, 2].map((i) => R0[i][0] * f[0] + R0[i][1] * f[1] + R0[i][2] * f[2]);
      const a = [0, 1, 2].map((i) => Rf[i]! + G[i]!);
      const v0 = [0.5, -0.2, 0.1];
      const p0 = [1, 2, 3];
      expect(maxDiff(out.R, mm(R0, expSO3([w[0] * dt, w[1] * dt, w[2] * dt])))).toBeLessThan(1e-14);
      expect(maxDiff([out.v], [[0, 1, 2].map((i) => v0[i]! + a[i]! * dt)])).toBeLessThan(1e-14);
      expect(maxDiff([out.p], [[0, 1, 2].map((i) => p0[i]! + v0[i]! * dt + 0.5 * a[i]! * dt * dt)])).toBeLessThan(1e-14);
    });

    it("경계: dt ≤ 0, NaN, 9×9가 아닌 P, 음수 잡음이면 예외", () => {
      const s = state(I3, [0, 0, 0], [0, 0, 0], eye(9));
      const imu = { gyro: [0, 0, 0] as Vec3, accel: [0, 0, 9.81] as Vec3, dt: 0.1 };
      expect(() => m.eskfPredict(s, { ...imu, dt: 0 }, quiet)).toThrow();
      expect(() => m.eskfPredict(s, { ...imu, dt: -0.1 }, quiet)).toThrow();
      expect(() => m.eskfPredict(s, { ...imu, gyro: [NaN, 0, 0] }, quiet)).toThrow();
      expect(() => m.eskfPredict({ ...s, P: eye(6) }, imu, quiet)).toThrow();
      expect(() => m.eskfPredict(s, imu, { ...quiet, gyro: -1 })).toThrow();
      expect(() => m.eskfPredict(s, imu, { ...quiet, accel: Infinity })).toThrow();
    });

    it("경계: 입력 상태를 바꾸지 않는다", () => {
      const s = state(I3, [1, 1, 1], [1, 0, 0], eye(9, 0.5));
      m.eskfPredict(s, { gyro: [0.1, 0.2, 0.3], accel: [1, 2, 3], dt: 0.1 }, { gyro: 0.1, accel: 0.1, gravity: G });
      expect(maxDiff(s.P, eye(9, 0.5))).toBe(0);
      expect(s.p).toEqual([1, 1, 1]);
      expect(s.v).toEqual([1, 0, 0]);
    });

    it("수치: P 전파가 명목 상태를 흔들어 잰 유한 차분 F 로 만든 F·P·Fᵀ 와 맞는다 (좌섭동)", () => {
      const rng = createRng(13);
      const R0 = expSO3([0.3, -0.5, 0.8]);
      const p0: Vec3 = [1, -2, 0.5];
      const v0: Vec3 = [0.4, 0.1, -0.3];
      const imu = { gyro: [0.5, -0.2, 0.9] as Vec3, accel: [1.5, -0.7, 9.0] as Vec3, dt: 0.05 };
      const base = m.eskfPredict(state(R0, p0, v0, zeros(9)), imu, quiet);

      // 오차 성분 k 를 ε 만큼 넣고 명목 적분 → 결과 오차 / ε 가 F 의 k열
      const eps = 1e-6;
      const Fnum = zeros(9);
      for (let k = 0; k < 9; k++) {
        const d = Array.from({ length: 9 }, (_, i) => (i === k ? eps : 0));
        const R = mm(expSO3([d[0]!, d[1]!, d[2]!]), R0);
        const p: Vec3 = [p0[0] + d[3]!, p0[1] + d[4]!, p0[2] + d[5]!];
        const v: Vec3 = [v0[0] + d[6]!, v0[1] + d[7]!, v0[2] + d[8]!];
        const o = m.eskfPredict(state(R, p, v, zeros(9)), imu, quiet);
        const dth = logSO3(mm(o.R, tr(base.R)));
        const col = [...dth, ...[0, 1, 2].map((i) => o.p[i]! - base.p[i]!), ...[0, 1, 2].map((i) => o.v[i]! - base.v[i]!)];
        col.forEach((x, i) => (Fnum[i]![k] = x / eps));
      }
      const A = new Matrix(Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => rng() - 0.5)));
      const P0 = A.mmul(A.transpose()).add(Matrix.eye(9, 9).mul(0.1));
      const out = m.eskfPredict(state(R0, p0, v0, P0.to2DArray()), imu, quiet);
      const F = new Matrix(Fnum);
      expect(maxDiff(out.P, F.mmul(P0).mmul(F.transpose()).to2DArray())).toBeLessThan(1e-5);
      expect(maxDiff(out.P, new Matrix(out.P.map((r) => [...r])).transpose().to2DArray())).toBeLessThan(1e-12);
    });
  });

  describe("eskfUpdate", () => {
    it("기본: 상관이 없으면 위치만 P/(P+r) 비율로 측정 쪽으로 당겨진다", () => {
      const s = state(I3, [0, 0, 0], [1, 1, 1], eye(9, 4));
      const out = m.eskfUpdate(s, [2, -4, 6], eye(3, 1));
      // 이득 k = 4 / (4 + 1) = 0.8
      expect(out.p[0]).toBeCloseTo(1.6, 12);
      expect(out.p[1]).toBeCloseTo(-3.2, 12);
      expect(out.p[2]).toBeCloseTo(4.8, 12);
      expect(maxDiff([out.v], [[1, 1, 1]])).toBeLessThan(1e-15);
      expect(maxDiff(out.R, I3)).toBeLessThan(1e-15);
      expect(out.P[3]![3]).toBeCloseTo(0.8, 12); // 4·1/(4+1)
      expect(out.P[0]![0]).toBeCloseTo(4, 12); // 위치와 상관없는 성분은 그대로
    });

    it("기본: 위치–속도 상관이 있으면 속도도 같이 고쳐진다", () => {
      const P = eye(9, 1);
      // x축: Var(δp)=2, Var(δv)=1, Cov=0.5
      P[3]![3] = 2;
      P[3]![6] = 0.5;
      P[6]![3] = 0.5;
      const out = m.eskfUpdate(state(I3, [0, 0, 0], [0, 0, 0], P), [3, 0, 0], eye(3, 1));
      // 위치 이득 2/3, 속도 이득 0.5/3, 혁신 y = 3
      expect(out.p[0]).toBeCloseTo(2, 12);
      expect(out.v[0]).toBeCloseTo(0.5, 12);
      expect(out.P[6]![6]).toBeCloseTo(1 - 0.25 / 3, 12);
    });

    it("기본: 회전 오차는 왼쪽에서 주입한다 (R ← Exp(δθ)·R)", () => {
      const P = eye(9, 1);
      // δθ_z 와 δp_x 의 상관 0.5
      P[2]![3] = 0.5;
      P[3]![2] = 0.5;
      const R0 = expSO3([0.7, 0, 0]); // 단위 행렬이 아니어야 왼쪽·오른쪽 주입이 갈린다
      const out = m.eskfUpdate(state(R0, [0, 0, 0], [0, 0, 0], P), [1, 0, 0], eye(3, 1));
      // δθ_z = 0.5 / (1 + 1) · 1 = 0.25
      expect(maxDiff(out.R, mm(expSO3([0, 0, 0.25]), R0))).toBeLessThan(1e-12);
      // 오른쪽에 곱한 것과는 다르다
      expect(maxDiff(out.R, mm(R0, expSO3([0, 0, 0.25]))) > 1e-3).toBe(true);
    });

    it("경계: 측정 공분산이 대칭·양의 정부호·3×3이 아니거나 측정이 NaN이면 예외", () => {
      const s = state(I3, [0, 0, 0], [0, 0, 0], eye(9));
      expect(() => m.eskfUpdate(s, [0, 0, 0], [[1, 0.5, 0], [0, 1, 0], [0, 0, 1]])).toThrow();
      expect(() => m.eskfUpdate(s, [0, 0, 0], [[1, 0, 0], [0, -1, 0], [0, 0, 1]])).toThrow();
      expect(() => m.eskfUpdate(s, [0, 0, 0], eye(2))).toThrow();
      expect(() => m.eskfUpdate(s, [NaN, 0, 0], eye(3))).toThrow();
    });

    it("수치: P 가 아주 크고 측정 잡음이 아주 작아도 갱신 뒤 분산이 측정 잡음 r 로 남는다 (조셉 형태, 짧은 형태는 0이 된다)", () => {
      const out = m.eskfUpdate(state(I3, [0, 0, 0], [0, 0, 0], eye(9, 1e8)), [1, 2, 3], eye(3, 1e-10));
      expect(Math.abs(out.P[3]![3]! - 1e-10)).toBeLessThan(1e-13);
      expect(Math.abs(out.P[5]![5]! - 1e-10)).toBeLessThan(1e-13);
    });

    it("수치: 같은 측정을 반복하면 위치가 측정으로 수렴하고 정보가 쌓인다 (1/P = 1/P₀ + n/r)", () => {
      let s = state(I3, [0, 0, 0], [0, 0, 0], eye(9, 100));
      for (let k = 0; k < 50; k++) s = m.eskfUpdate(s, [1, 2, 3], eye(3, 0.5));
      expect(Math.hypot(s.p[0] - 1, s.p[1] - 2, s.p[2] - 3)).toBeLessThan(1e-3);
      expect(s.P[4]![4]).toBeCloseTo(1 / (1 / 100 + 50 / 0.5), 10);
    });

    it("수치: 무작위 P에서 결과 P 가 (I − KH)·P 와 같다 (최적 이득에서 조셉 형태 = 짧은 형태)", () => {
      const rng = createRng(7);
      const A = new Matrix(Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => rng() - 0.5)));
      const P0 = A.mmul(A.transpose()).add(Matrix.eye(9, 9).mul(0.05));
      const Rm = [
        [0.2, 0.05, 0],
        [0.05, 0.3, 0.02],
        [0, 0.02, 0.1],
      ];
      const z: Vec3 = [0.3, -0.2, 0.5];
      const out = m.eskfUpdate(state(expSO3([0.1, 0.2, -0.3]), [0, 0, 0], [0, 0, 0], P0.to2DArray()), z, Rm);
      const H = Matrix.zeros(3, 9);
      for (let i = 0; i < 3; i++) H.set(i, 3 + i, 1);
      const K = P0.mmul(H.transpose()).mmul(inverse(H.mmul(P0).mmul(H.transpose()).add(new Matrix(Rm))));
      expect(maxDiff(out.P, Matrix.eye(9, 9).sub(K.mmul(H)).mmul(P0).to2DArray())).toBeLessThan(1e-10);
      const dx = K.mmul(Matrix.columnVector([...z])).to1DArray();
      expect(Math.abs(out.v[1] - dx[7]!)).toBeLessThan(1e-12);
      expect(Math.abs(out.p[2] - dx[5]!)).toBeLessThan(1e-12);
    });
  });
});
