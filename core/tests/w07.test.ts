/**
 * 7주차 테스트. 제목 구조는 강제 규칙이다 (LESSON_TEMPLATE §4):
 *   describe(구현) > describe("<함수명>") > it("기본|경계|수치: …")
 * - gaussNewton의 로버스트 테스트는 테스트 안에서 만든 Huber를 넘긴다 (내 huber가 TODO여도 돌게).
 * - 매니폴드(⊞) 테스트는 회전을 숫자 배열이 아닌 값으로 둬서, plus를 쓰지 않고 그냥 더하면 실패하게 한다.
 * - 야코비안 규약은 좌섭동: R ← Exp(φ)·R, T ← (Exp(φ)R, Exp(φ)t + ρ), δ = [ρ; φ] (CURRICULUM 7주차).
 */
import { Matrix, solve } from "ml-matrix";
import { describe, expect, it } from "vitest";
import { IMPL, loadImpl } from "./loadImpl";
import { createRng, type Rng } from "./rng";

type W07 = typeof import("../reference/w07");
type V3 = readonly [number, number, number];
type M3 = readonly [V3, V3, V3];
interface Problem<X> {
  residual: (x: X) => number[];
  jacobian: (x: X) => number[][];
  plus: (x: X, d: readonly number[]) => X;
}

const m = await loadImpl<W07>("w07");

// ---- 테스트용 도우미 ----

const vecPlus = (x: readonly number[], d: readonly number[]): number[] => x.map((v, i) => v + d[i]!);
const OPTS = { maxIterations: 50, tolerance: 1e-10 };

function gauss(rng: Rng): number {
  return Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-12))) * Math.cos(2 * Math.PI * rng());
}

function maxAbs(A: readonly (readonly number[])[], B: readonly (readonly number[])[]): number {
  return Math.max(...A.flatMap((row, i) => row.map((v, j) => Math.abs(v - B[i]![j]!))));
}

/** 테스트 안에서 만든 Huber (내 huber와 무관하게) */
function localHuber(k: number) {
  return (r: number) => {
    const a = Math.abs(r);
    return a <= k ? { rho: 0.5 * r * r, weight: 1 } : { rho: k * (a - 0.5 * k), weight: k / a };
  };
}

/** 선형 문제 r = A x − b */
function linearProblem(A: number[][], b: number[]): Problem<number[]> {
  return {
    residual: (x) => A.map((row, i) => row.reduce((s, v, j) => s + v * x[j]!, 0) - b[i]!),
    jacobian: () => A,
    plus: vecPlus,
  };
}

/** y = a·exp(b·t) 곡선 맞추기 */
function expFit(ts: number[], ys: number[]): Problem<number[]> {
  return {
    residual: ([a, b]) => ts.map((t, i) => a! * Math.exp(b! * t) - ys[i]!),
    jacobian: ([a, b]) => ts.map((t) => [Math.exp(b! * t), a! * t * Math.exp(b! * t)]),
    plus: vecPlus,
  };
}

function skew(v: readonly number[]): number[][] {
  return [
    [0, -v[2]!, v[1]!],
    [v[2]!, 0, -v[0]!],
    [-v[1]!, v[0]!, 0],
  ];
}

/** 로드리게스 (테스트 안에서 직접) */
function expRot(w: readonly number[]): M3 {
  const th = Math.hypot(w[0]!, w[1]!, w[2]!);
  const I = Matrix.eye(3);
  const R =
    th < 1e-15
      ? I
      : (() => {
          const S = new Matrix(skew([w[0]! / th, w[1]! / th, w[2]! / th]));
          return I.add(S.clone().mul(Math.sin(th))).add(S.mmul(S).mul(1 - Math.cos(th)));
        })();
  return [0, 1, 2].map((i) => [R.get(i, 0), R.get(i, 1), R.get(i, 2)]) as unknown as M3;
}

function mul(A: M3, B: M3): M3 {
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => A[i][0] * B[0][j]! + A[i][1] * B[1][j]! + A[i][2] * B[2][j]!)) as unknown as M3;
}

function mv(R: M3, p: readonly number[]): number[] {
  return [0, 1, 2].map((i) => R[i]![0] * p[0]! + R[i]![1] * p[1]! + R[i]![2] * p[2]!);
}

/** 2D 회전을 숫자 배열이 아닌 값 {c, s}로 둔다: 그냥 더하면 안 되고 plus로만 바꿀 수 있다 */
interface Angle {
  readonly c: number;
  readonly s: number;
}
const anglePlus = (x: Angle, d: readonly number[]): Angle => {
  const c = Math.cos(d[0]!);
  const s = Math.sin(d[0]!);
  return { c: x.c * c - x.s * s, s: x.s * c + x.c * s };
};

describe(IMPL, () => {
  describe("huber", () => {
    it("기본: |r| ≤ k면 ρ = r²/2, w = 1 / 밖이면 ρ = k(|r| − k/2), w = k/|r|", () => {
      expect(m.huber(0.5, 1).rho).toBeCloseTo(0.125, 12);
      expect(m.huber(0.5, 1).weight).toBe(1);
      expect(m.huber(3, 1).rho).toBeCloseTo(2.5, 12);
      expect(m.huber(3, 1).weight).toBeCloseTo(1 / 3, 12);
      expect(m.huber(-3, 1).rho).toBeCloseTo(2.5, 12);
      expect(m.huber(-3, 1).weight).toBeCloseTo(1 / 3, 12);
    });

    it("경계: r = k에서 두 식이 이어지고, r = 0이면 ρ = 0, w = 1. k ≤ 0이면 예외", () => {
      const k = 1.7;
      expect(m.huber(k, k).rho).toBeCloseTo(0.5 * k * k, 12);
      expect(m.huber(k, k).weight).toBeCloseTo(1, 12);
      expect(m.huber(k * (1 + 1e-9), k).rho).toBeCloseTo(0.5 * k * k, 6);
      expect(m.huber(0, k).rho).toBe(0);
      expect(m.huber(0, k).weight).toBe(1);
      expect(() => m.huber(1, 0)).toThrow();
      expect(() => m.huber(1, -1)).toThrow();
    });

    it("수치: 무작위 r, k 200개에서 ρ'(r) = w·r (수치 미분과 1e-6), 0 < w ≤ 1", () => {
      const rng = createRng(1);
      for (let i = 0; i < 200; i++) {
        const k = 0.1 + rng() * 3;
        const r = (rng() - 0.5) * 20;
        if (Math.abs(Math.abs(r) - k) < 1e-3) continue; // 꺾이는 점 바로 옆은 수치 미분이 부정확
        const h = 1e-6;
        const d = (m.huber(r + h, k).rho - m.huber(r - h, k).rho) / (2 * h);
        const { weight } = m.huber(r, k);
        expect(Math.abs(d - weight * r)).toBeLessThan(1e-6);
        expect(0).toBeLessThan(weight);
        expect(weight).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("gaussNewton", () => {
    it("기본: 선형 문제는 한 번에 정규방정식의 해 (오차 < 1e-9)", () => {
      const rng = createRng(2);
      const A = Array.from({ length: 10 }, () => [rng(), rng(), rng()]);
      const b = Array.from({ length: 10 }, () => rng() * 5);
      const At = new Matrix(A).transpose();
      const expected = solve(At.mmul(new Matrix(A)), At.mmul(Matrix.columnVector(b))).getColumn(0);
      const out = m.gaussNewton(linearProblem(A, b), [0, 0, 0], OPTS);
      expect(Math.max(...out.history[1]!.x.map((v, i) => Math.abs(v - expected[i]!)))).toBeLessThan(1e-9);
      expect(Math.max(...out.x.map((v, i) => Math.abs(v - expected[i]!)))).toBeLessThan(1e-9);
      expect(out.converged).toBe(true);
    });

    it("경계: history[0]은 처음 값, history 길이 = iterations + 1, 마지막 값 = x와 cost", () => {
      const ts = [0, 0.5, 1, 1.5, 2, 2.5, 3];
      const out = m.gaussNewton(expFit(ts, ts.map((t) => 2 * Math.exp(-0.5 * t))), [1, 0], OPTS);
      expect(out.history[0]!.x).toEqual([1, 0]);
      expect(out.history[0]!.cost).toBeCloseTo(0.5 * ts.reduce((s, t) => s + (1 - 2 * Math.exp(-0.5 * t)) ** 2, 0), 12);
      expect(out.history).toHaveLength(out.iterations + 1);
      expect(out.history[out.iterations]!.x).toEqual(out.x);
      expect(out.history[out.iterations]!.cost).toBe(out.cost);
    });

    it("경계: maxIterations = 0이면 처음 값 그대로(수렴 아님), 답에서 시작하면 바로 수렴", () => {
      const A = [[1, 0], [0, 2], [1, 1]];
      const b = [1, 2, 2];
      const zero = m.gaussNewton(linearProblem(A, b), [5, 5], { maxIterations: 0, tolerance: 1e-10 });
      expect(zero.x).toEqual([5, 5]);
      expect(zero.iterations).toBe(0);
      expect(zero.converged).toBe(false);
      const exact = m.gaussNewton(linearProblem(A, b), [1, 1], OPTS);
      expect(exact.iterations).toBe(1);
      expect(exact.converged).toBe(true);
    });

    it("경계: JᵀJ가 풀리지 않으면(두 열이 같음) 예외", () => {
      const A = [[1, 1], [2, 2], [3, 3]];
      expect(() => m.gaussNewton(linearProblem(A, [1, 2, 3]), [0, 0], OPTS)).toThrow();
    });

    it("수치: 곡선 y = a·exp(b·t)를 (1, 0)에서 시작해 진짜 (2, −0.5)로 (오차 < 1e-8)", () => {
      const ts = Array.from({ length: 20 }, (_, i) => i * 0.2);
      const out = m.gaussNewton(expFit(ts, ts.map((t) => 2 * Math.exp(-0.5 * t))), [1, 0], OPTS);
      expect(Math.abs(out.x[0]! - 2)).toBeLessThan(1e-8);
      expect(Math.abs(out.x[1]! + 0.5)).toBeLessThan(1e-8);
      expect(out.converged).toBe(true);
    });

    it("수치: 회전처럼 더할 수 없는 변수는 plus로만 바꾼다 (2D 회전 맞추기, 각도 오차 < 1e-9)", () => {
      const truth = 0.9;
      const pts = [[1, 0], [0, 2], [-1, 1], [2, -1]];
      const rot = (a: Angle, p: number[]) => [a.c * p[0]! - a.s * p[1]!, a.s * p[0]! + a.c * p[1]!];
      const target = pts.map((p) => rot({ c: Math.cos(truth), s: Math.sin(truth) }, p));
      const problem: Problem<Angle> = {
        residual: (a) => pts.flatMap((p, i) => rot(a, p).map((v, j) => v - target[i]![j]!)),
        // 좌섭동: d/dθ (R(θ)·R·p) at θ = 0 = [−y, x] (x, y는 R·p의 성분)
        jacobian: (a) =>
          pts.flatMap((p) => {
            const q = rot(a, p);
            return [[-q[1]!], [q[0]!]];
          }),
        plus: anglePlus,
      };
      const out = m.gaussNewton(problem, { c: 1, s: 0 }, OPTS);
      expect(Math.abs(Math.atan2(out.x.s, out.x.c) - truth)).toBeLessThan(1e-9);
      expect(Math.hypot(out.x.c, out.x.s)).toBeCloseTo(1, 12);
    });

    it("경계: 로버스트 커널 + 잡음 섞인 곡선(모든 열이 상수가 아님)에서도 예외 없이 수렴한다 (JᵀWJ의 대칭 오차)", () => {
      for (const seed of [8, 9, 10, 11]) {
        const rng = createRng(seed);
        const ts = Array.from({ length: 20 }, (_, i) => (i / 19) * 4);
        const ys = ts.map((t) => 2 * Math.exp(-0.5 * t) + gauss(rng) * 0.1);
        const out = m.gaussNewton(expFit(ts, ys), [1, 0], { ...OPTS, robust: localHuber(0.1) });
        expect(Math.abs(out.x[0]! - 2)).toBeLessThan(0.3);
        expect(Math.abs(out.x[1]! + 0.5)).toBeLessThan(0.2);
      }
    });

    it("수치: 로버스트 커널을 주면 아웃라이어 3개가 섞인 직선을 더 정확히 맞추고, cost는 Σρ(r)", () => {
      const rng = createRng(3);
      const xs = Array.from({ length: 30 }, (_, i) => i / 3);
      const ys = xs.map((x) => 2 * x + 1 + gauss(rng) * 0.05);
      [4, 15, 25].forEach((i) => (ys[i] = ys[i]! + 15)); // 아웃라이어
      const A = xs.map((x) => [x, 1]);
      const robust = localHuber(0.2);
      const plain = m.gaussNewton(linearProblem(A, ys), [0, 0], OPTS);
      const hub = m.gaussNewton(linearProblem(A, ys), [0, 0], { ...OPTS, robust });
      const err = (x: readonly number[]) => Math.hypot(x[0]! - 2, x[1]! - 1);
      expect(err(hub.x)).toBeLessThan(0.1);
      expect(err(hub.x)).toBeLessThan(err(plain.x) / 5);
      const r = linearProblem(A, ys).residual(hub.x);
      expect(hub.cost).toBeCloseTo(r.reduce((s, v) => s + robust(v).rho, 0), 9);
    });
  });

  describe("levenbergMarquardt", () => {
    it("경계: 로버스트 커널 + 잡음 섞인 곡선에서도 정규방정식이 풀린다 (JᵀWJ의 대칭 오차에 견딘다)", () => {
      const rng = createRng(8);
      const ts = Array.from({ length: 20 }, (_, i) => (i / 19) * 4);
      const ys = ts.map((t) => 2 * Math.exp(-0.5 * t) + gauss(rng) * 0.1);
      const out = m.levenbergMarquardt(expFit(ts, ys), [1, 0], { ...OPTS, robust: localHuber(0.1) });
      expect(Math.abs(out.x[0]! - 2)).toBeLessThan(0.3);
      expect(Math.abs(out.x[1]! + 0.5)).toBeLessThan(0.2);
    });

    it("기본: 곡선 y = a·exp(b·t)를 맞춘다 (오차 < 1e-6)", () => {
      const ts = Array.from({ length: 20 }, (_, i) => i * 0.2);
      const out = m.levenbergMarquardt(expFit(ts, ts.map((t) => 2 * Math.exp(-0.5 * t))), [1, 0], OPTS);
      expect(Math.abs(out.x[0]! - 2)).toBeLessThan(1e-6);
      expect(Math.abs(out.x[1]! + 0.5)).toBeLessThan(1e-6);
    });

    it("경계: 받아들인 업데이트마다 비용이 줄어든다 (history의 cost가 감소)", () => {
      const ts = Array.from({ length: 20 }, (_, i) => i * 0.2);
      const out = m.levenbergMarquardt(expFit(ts, ts.map((t) => 2 * Math.exp(-0.5 * t))), [5, 2], OPTS);
      for (let i = 1; i < out.history.length; i++) expect(out.history[i]!.cost).toBeLessThan(out.history[i - 1]!.cost);
    });

    it("수치: 먼 시작점 (5, 2)에서도 진짜 값으로 간다 (오차 < 1e-6)", () => {
      const ts = Array.from({ length: 20 }, (_, i) => i * 0.2);
      const out = m.levenbergMarquardt(expFit(ts, ts.map((t) => 2 * Math.exp(-0.5 * t))), [5, 2], { maxIterations: 200, tolerance: 1e-10 });
      expect(Math.abs(out.x[0]! - 2)).toBeLessThan(1e-6);
      expect(Math.abs(out.x[1]! + 0.5)).toBeLessThan(1e-6);
    });
  });

  describe("numericJacobian", () => {
    it("기본: 선형 함수 f(x) = A·x의 야코비안은 A (오차 < 1e-8)", () => {
      const A = [[1, 2, 3], [-4, 5, 0.5]];
      const J = m.numericJacobian((x: number[]) => A.map((row) => row.reduce((s, v, j) => s + v * x[j]!, 0)), [0.3, -1, 2], vecPlus, 3);
      expect(J).toHaveLength(2);
      expect(J[0]).toHaveLength(3);
      expect(maxAbs(J, A)).toBeLessThan(1e-8);
    });

    it("경계: 출력 m개 × 입력 dim개 모양, dim이 1 이상 정수가 아니거나 eps ≤ 0이면 예외", () => {
      const J = m.numericJacobian((x: number[]) => [x[0]!, 2 * x[0]!, x[0]! ** 2], [3], vecPlus, 1);
      expect(J).toHaveLength(3);
      expect(J.every((row) => row.length === 1)).toBe(true);
      expect(maxAbs(J, [[1], [2], [6]])).toBeLessThan(1e-6);
      expect(() => m.numericJacobian((x: number[]) => x, [1], vecPlus, 0)).toThrow();
      expect(() => m.numericJacobian((x: number[]) => x, [1], vecPlus, 1.5)).toThrow();
      expect(() => m.numericJacobian((x: number[]) => x, [1], vecPlus, 1, 0)).toThrow();
    });

    it("수치: 비선형 f = [sin(x₀)·x₁, x₀² + exp(x₁)]의 해석 야코비안과 1e-6", () => {
      const rng = createRng(4);
      for (let k = 0; k < 20; k++) {
        const x = [(rng() - 0.5) * 4, (rng() - 0.5) * 2];
        const J = m.numericJacobian((v: number[]) => [Math.sin(v[0]!) * v[1]!, v[0]! ** 2 + Math.exp(v[1]!)], x, vecPlus, 2);
        const A = [
          [Math.cos(x[0]!) * x[1]!, Math.sin(x[0]!)],
          [2 * x[0]!, Math.exp(x[1]!)],
        ];
        expect(maxAbs(J, A)).toBeLessThan(1e-6);
      }
    });

    it("수치: 회전 좌섭동 R ← Exp(φ)R 에서 ∂(R·p)/∂φ = −[R·p]× (오차 < 1e-6)", () => {
      const rng = createRng(5);
      for (let k = 0; k < 20; k++) {
        const R = expRot([(rng() - 0.5) * 3, (rng() - 0.5) * 3, (rng() - 0.5) * 3]);
        const p = [(rng() - 0.5) * 4, (rng() - 0.5) * 4, (rng() - 0.5) * 4];
        const J = m.numericJacobian((Q: M3) => mv(Q, p), R, (Q: M3, d: readonly number[]) => mul(expRot(d), Q), 3);
        const expected = skew(mv(R, p)).map((row) => row.map((v) => -v));
        expect(maxAbs(J, expected)).toBeLessThan(1e-6);
      }
    });

    it("수치: 자세 좌섭동 δ = [ρ; φ] 에서 점 T·p의 야코비안 = [I | −[T·p]×] (3×6, 오차 < 1e-6)", () => {
      const rng = createRng(6);
      interface Pose {
        R: M3;
        t: number[];
      }
      const apply = (T: Pose, p: readonly number[]) => mv(T.R, p).map((v, i) => v + T.t[i]!);
      const plus = (T: Pose, d: readonly number[]): Pose => {
        const E = expRot(d.slice(3));
        return { R: mul(E, T.R), t: mv(E, T.t).map((v, i) => v + d[i]!) };
      };
      for (let k = 0; k < 10; k++) {
        const T: Pose = { R: expRot([rng() - 0.5, rng() - 0.5, rng() - 0.5]), t: [rng() * 2, rng() * 2, rng() * 2] };
        const p = [rng() * 3, rng() * 3, rng() * 3];
        const J = m.numericJacobian((X: Pose) => apply(X, p), T, plus, 6);
        const S = skew(apply(T, p));
        const expected = [0, 1, 2].map((i) => [...[0, 1, 2].map((j) => (i === j ? 1 : 0)), ...S[i]!.map((v) => -v)]);
        expect(maxAbs(J, expected)).toBeLessThan(1e-6);
      }
    });
  });
});
