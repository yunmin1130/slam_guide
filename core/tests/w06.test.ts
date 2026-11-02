/**
 * 6주차 테스트. 제목 구조는 강제 규칙이다 (LESSON_TEMPLATE §4):
 *   describe(구현) > describe("<함수명>") > it("기본|경계|수치: …")
 * - 장면(R, t, 3D 점)은 테스트 안에서 직접 만들고, 정규화 좌표 x̂ = [X/Z, Y/Z]로 투영한다.
 * - 손코딩 함수끼리 서로 검증하지 않는다. 잡음 섞인 E가 필요한 곳만 5주차 정답 eightPoint를 직접 쓴다.
 * - E는 부호·크기가 정해지지 않으므로 decomposeE 결과는 R과 t의 "방향"으로 비교한다 (|t| = 1).
 */
import { Matrix } from "ml-matrix";
import { describe, expect, it } from "vitest";
import { eightPoint as refEightPoint } from "../reference/w05";
import { IMPL, loadImpl } from "./loadImpl";
import { createRng, type Rng } from "./rng";

type W06 = typeof import("../reference/w06");
type V2 = readonly [number, number];
type V3 = readonly [number, number, number];
type M3 = readonly [V3, V3, V3];
interface Pose {
  R: M3;
  t: V3;
}

const m = await loadImpl<W06>("w06");

// ---- 테스트용 도우미 ----

const I3: M3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

function skewOf(t: V3): M3 {
  return [
    [0, -t[2], t[1]],
    [t[2], 0, -t[0]],
    [-t[1], t[0], 0],
  ];
}

function mat(A: readonly (readonly number[])[]): Matrix {
  return new Matrix(A.map((r) => [...r]));
}

function toM3(A: Matrix): M3 {
  const r = (i: number): V3 => [A.get(i, 0), A.get(i, 1), A.get(i, 2)];
  return [r(0), r(1), r(2)];
}

/** 축-각 → 회전행렬 (로드리게스, 테스트 안에서 직접) */
function rotation(axis: V3, angle: number): M3 {
  const n = Math.hypot(...axis);
  const S = mat(skewOf([axis[0] / n, axis[1] / n, axis[2] / n]));
  return toM3(Matrix.eye(3).add(S.clone().mul(Math.sin(angle))).add(S.mmul(S).mul(1 - Math.cos(angle))));
}

function apply(T: Pose, p: V3): V3 {
  const r = (i: number) => T.R[i]![0] * p[0] + T.R[i]![1] * p[1] + T.R[i]![2] * p[2] + T.t[i]!;
  return [r(0), r(1), r(2)];
}

function project(p: V3): V2 {
  return [p[0] / p[2], p[1] / p[2]];
}

function unit(v: V3): V3 {
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
}

/** 두 회전 사이의 각도 (도) */
function rotationErrorDeg(A: M3, B: M3): number {
  const D = mat(A).transpose().mmul(mat(B));
  const c = (D.get(0, 0) + D.get(1, 1) + D.get(2, 2) - 1) / 2;
  return (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
}

/** 두 방향 사이의 각도 (도) */
function angleDeg(a: V3, b: V3): number {
  const ua = unit(a);
  const ub = unit(b);
  const c = ua[0] * ub[0] + ua[1] * ub[1] + ua[2] * ub[2];
  return (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
}

function maxAbsDiff(a: readonly number[], b: readonly number[]): number {
  return Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));
}

/** RᵀR − I 의 원소별 최대 크기와 det R */
function rotationCheck(R: M3): { orth: number; det: number } {
  const M = mat(R);
  const E = M.transpose().mmul(M).sub(Matrix.eye(3));
  const det =
    R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1]) -
    R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0]) +
    R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0]);
  return { orth: Math.max(...E.to1DArray().map(Math.abs)), det };
}

function gauss(rng: Rng): number {
  return Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-12))) * Math.cos(2 * Math.PI * rng());
}

/** 무작위 상대 자세 T21 (회전 ≤ 약 17°, 주로 옆으로 0.3 ~ 1 이동) */
function randomPose(rng: Rng): Pose {
  const R = rotation([rng() - 0.5, rng() - 0.5, rng() - 0.5], (rng() - 0.5) * 0.6);
  const dir = unit([rng() - 0.5, (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.4]);
  const s = 0.3 + rng() * 0.7;
  return { R, t: [dir[0] * s, dir[1] * s, dir[2] * s] };
}

/** 카메라 1(원점) 앞 3~9m의 점 중 카메라 2 앞에도 있는 점 n개의 대응 (정규화 좌표, 잡음 noise) */
function twoView(rng: Rng, T: Pose, n: number, noise = 0): { x1: V2[]; x2: V2[] } {
  const x1: V2[] = [];
  const x2: V2[] = [];
  while (x1.length < n) {
    const z = 3 + rng() * 6;
    const p: V3 = [(rng() - 0.5) * z, (rng() - 0.5) * z * 0.75, z];
    const q = apply(T, p);
    if (q[2] <= 0.5) continue;
    const a = project(p);
    const b = project(q);
    x1.push([a[0] + gauss(rng) * noise, a[1] + gauss(rng) * noise]);
    x2.push([b[0] + gauss(rng) * noise, b[1] + gauss(rng) * noise]);
  }
  return { x1, x2 };
}

function essential(T: Pose): M3 {
  return toM3(mat(skewOf(T.t)).mmul(mat(T.R)));
}

function scaled(A: M3, s: number): M3 {
  return toM3(mat(A).mul(s));
}

function randomCloud(rng: Rng, n: number, size: number): V3[] {
  return Array.from({ length: n }, () => [(rng() - 0.5) * size, (rng() - 0.5) * size, (rng() - 0.5) * size] as V3);
}

describe(IMPL, () => {
  describe("decomposeE", () => {
    it("기본: E = [t]×R 에서 R과 t의 방향(|t| = 1)을 되찾는다", () => {
      const T: Pose = { R: rotation([0, 1, 0], -0.15), t: [-0.8, 0.05, 0.1] };
      const { x1, x2 } = twoView(createRng(1), T, 30);
      const out = m.decomposeE(essential(T), x1, x2);
      expect(rotationErrorDeg(out.R, T.R)).toBeLessThan(1e-4);
      expect(maxAbsDiff(out.t, unit(T.t))).toBeLessThan(1e-9);
      expect(Math.hypot(...out.t)).toBeCloseTo(1, 9);
    });

    it("경계: E의 부호와 크기가 달라도(−3E, 0.01E, −E) 같은 답", () => {
      const T: Pose = { R: rotation([1, 2, 0.5], 0.2), t: [0.3, -0.6, 0.2] };
      const { x1, x2 } = twoView(createRng(2), T, 30);
      for (const s of [-3, 0.01, -1]) {
        const out = m.decomposeE(scaled(essential(T), s), x1, x2);
        expect(rotationErrorDeg(out.R, T.R)).toBeLessThan(1e-4);
        expect(maxAbsDiff(out.t, unit(T.t))).toBeLessThan(1e-9);
      }
    });

    it("경계: 돌려준 R은 언제나 회전이다 (RᵀR = I, det R = +1, 반사 아님)", () => {
      const rng = createRng(3);
      for (let k = 0; k < 30; k++) {
        const T = randomPose(rng);
        const { x1, x2 } = twoView(rng, T, 20);
        const { R } = m.decomposeE(scaled(essential(T), k % 2 === 0 ? 1 : -1), x1, x2);
        const c = rotationCheck(R);
        expect(c.orth).toBeLessThan(1e-9);
        expect(c.det).toBeCloseTo(1, 9);
      }
    });

    it("경계: 대응점 개수가 다르거나 0개면 예외", () => {
      const T: Pose = { R: I3, t: [-1, 0, 0] };
      const { x1, x2 } = twoView(createRng(4), T, 10);
      expect(() => m.decomposeE(essential(T), x1, x2.slice(1))).toThrow();
      expect(() => m.decomposeE(essential(T), x1.slice(1), x2)).toThrow();
      expect(() => m.decomposeE(essential(T), [], [])).toThrow();
    });

    it("경계: 잘못된 대응이 30% 섞여도 '앞에 오는 점이 가장 많은' 후보를 고른다 (하나라도 앞이면 끝내지 않는다)", () => {
      const rng = createRng(13);
      for (let k = 0; k < 20; k++) {
        const T = randomPose(rng);
        const { x1, x2 } = twoView(rng, T, 40);
        // 앞 12개의 짝을 엉뚱한 점으로 바꾼다 (잘못된 후보에서도 몇 개는 "앞"으로 나온다)
        const bad = x2.map((p, i) => (i < 12 ? ([(rng() - 0.5) * 1.2, (rng() - 0.5) * 0.9] as V2) : p));
        const out = m.decomposeE(essential(T), x1, bad);
        expect(rotationErrorDeg(out.R, T.R)).toBeLessThan(1e-4);
        expect(maxAbsDiff(out.t, unit(T.t))).toBeLessThan(1e-8);
      }
    });

    it("수치: 무작위 자세 50개에서 4개 후보 중 맞는 것을 고른다", () => {
      const rng = createRng(5);
      for (let k = 0; k < 50; k++) {
        const T = randomPose(rng);
        const { x1, x2 } = twoView(rng, T, 15);
        const out = m.decomposeE(essential(T), x1, x2);
        expect(rotationErrorDeg(out.R, T.R)).toBeLessThan(1e-4);
        expect(maxAbsDiff(out.t, unit(T.t))).toBeLessThan(1e-8);
      }
    });

    it("수치: 잡음(약 0.5px) 섞인 대응으로 추정한 E에서도 회전 오차 < 1°, 이동 방향 오차 < 5°", () => {
      const rng = createRng(6);
      for (let k = 0; k < 5; k++) {
        const T = randomPose(rng);
        const { x1, x2 } = twoView(rng, T, 80, 0.001);
        const out = m.decomposeE(refEightPoint(x1, x2), x1, x2);
        expect(rotationErrorDeg(out.R, T.R)).toBeLessThan(1);
        expect(angleDeg(out.t, T.t)).toBeLessThan(5);
      }
    });
  });

  describe("triangulate", () => {
    it("기본: 카메라 2가 오른쪽으로 1 옮겨 갔을 때 점 (0.5, 0.2, 4)를 되찾는다", () => {
      const T1: Pose = { R: I3, t: [0, 0, 0] };
      const T2: Pose = { R: I3, t: [-1, 0, 0] };
      const P: V3 = [0.5, 0.2, 4];
      const X = m.triangulate(T1, T2, project(apply(T1, P)), project(apply(T2, P)));
      expect(maxAbsDiff(X, P)).toBeLessThan(1e-9);
    });

    it("경계: 두 광선이 평행하면(무한히 먼 점) 예외", () => {
      const T1: Pose = { R: I3, t: [0, 0, 0] };
      const T2: Pose = { R: I3, t: [-1, 0, 0] };
      expect(() => m.triangulate(T1, T2, [0, 0], [0, 0])).toThrow();
      expect(() => m.triangulate(T1, T2, [0.2, -0.1], [0.2, -0.1])).toThrow();
    });

    it("수치: 두 카메라가 모두 원점이 아닐 때(월드 좌표계) 무작위 점 100개, 오차 < 1e-6", () => {
      const rng = createRng(7);
      const T1: Pose = { R: rotation([0.2, 1, 0.1], 0.3), t: [0.5, -0.2, 1] };
      const T2: Pose = { R: rotation([1, 0.3, -0.2], -0.2), t: [-0.4, 0.1, 1.3] };
      for (let k = 0; k < 100; k++) {
        const P: V3 = [(rng() - 0.5) * 6, (rng() - 0.5) * 4, 3 + rng() * 6];
        const X = m.triangulate(T1, T2, project(apply(T1, P)), project(apply(T2, P)));
        expect(maxAbsDiff(X, P)).toBeLessThan(1e-6);
      }
    });

    it("수치: 잡음(약 0.5px)이 있어도 4~9m 거리의 점을 상대오차 5% 이내로", () => {
      const rng = createRng(8);
      const T1: Pose = { R: I3, t: [0, 0, 0] };
      const T2: Pose = { R: rotation([0, 1, 0], -0.1), t: [-1, 0, 0.1] };
      const noisy = (v: V2): V2 => [v[0] + gauss(rng) * 0.001, v[1] + gauss(rng) * 0.001];
      for (let k = 0; k < 50; k++) {
        const P: V3 = [(rng() - 0.5) * 4, (rng() - 0.5) * 3, 4 + rng() * 5];
        const X = m.triangulate(T1, T2, noisy(project(apply(T1, P))), noisy(project(apply(T2, P))));
        expect(Math.hypot(X[0] - P[0], X[1] - P[1], X[2] - P[2]) / Math.hypot(...P)).toBeLessThan(0.05);
      }
    });
  });

  describe("pnpDLT", () => {
    it("기본: 잡음 없는 3D 점 8개와 투영으로 카메라 자세 T_cw 를 되찾는다", () => {
      const T: Pose = { R: rotation([0.3, 1, -0.2], 0.4), t: [0.2, -0.3, 5] };
      const Xw = randomCloud(createRng(9), 8, 4);
      const out = m.pnpDLT(Xw, Xw.map((p) => project(apply(T, p))));
      expect(rotationErrorDeg(out.R, T.R)).toBeLessThan(1e-4);
      expect(maxAbsDiff(out.t, T.t)).toBeLessThan(1e-6);
    });

    it("경계: 점이 6개 미만이거나 개수가 다르면 예외, 정확히 6개면 푼다", () => {
      const T: Pose = { R: rotation([1, 0, 0], 0.2), t: [0, 0, 4] };
      const Xw = randomCloud(createRng(10), 6, 3);
      const x = Xw.map((p) => project(apply(T, p)));
      expect(() => m.pnpDLT(Xw.slice(0, 5), x.slice(0, 5))).toThrow();
      expect(() => m.pnpDLT(Xw, x.slice(1))).toThrow();
      // 개수 검사는 6개 검사와 따로: 7개 vs 8개
      const X8 = randomCloud(createRng(14), 8, 3);
      const x8 = X8.map((p) => project(apply(T, p)));
      expect(() => m.pnpDLT(X8.slice(1), x8)).toThrow();
      expect(() => m.pnpDLT(X8, x8.slice(1))).toThrow();
      const out = m.pnpDLT(Xw, x);
      expect(rotationErrorDeg(out.R, T.R)).toBeLessThan(1e-4);
      expect(maxAbsDiff(out.t, T.t)).toBeLessThan(1e-5);
    });

    it("경계: 무작위 자세 30개에서 R은 언제나 회전이고(det = +1) 모든 점이 카메라 앞에 온다", () => {
      const rng = createRng(11);
      for (let k = 0; k < 30; k++) {
        const T: Pose = {
          R: rotation([rng() - 0.5, rng() - 0.5, rng() - 0.5], rng() * 2),
          t: [(rng() - 0.5) * 2, (rng() - 0.5) * 2, 4 + rng() * 4],
        };
        const Xw = randomCloud(rng, 10, 3);
        const out = m.pnpDLT(Xw, Xw.map((p) => project(apply(T, p))));
        const c = rotationCheck(out.R);
        expect(c.orth).toBeLessThan(1e-9);
        expect(c.det).toBeCloseTo(1, 9);
        expect(Math.min(...Xw.map((p) => apply(out, p)[2])) > 0).toBe(true);
      }
    });

    it("수치: 잡음(약 0.5px) 섞인 점 50개에서도 R은 정확한 회전, 회전 오차 < 1°, 위치 오차 < 이동 크기의 5%", () => {
      const rng = createRng(12);
      for (let k = 0; k < 5; k++) {
        const T: Pose = {
          R: rotation([rng() - 0.5, rng() - 0.5, rng() - 0.5], rng()),
          t: [(rng() - 0.5) * 2, (rng() - 0.5) * 2, 5 + rng() * 3],
        };
        const Xw = randomCloud(rng, 50, 4);
        const x = Xw.map((p) => {
          const v = project(apply(T, p));
          return [v[0] + gauss(rng) * 0.001, v[1] + gauss(rng) * 0.001] as V2;
        });
        const out = m.pnpDLT(Xw, x);
        expect(rotationErrorDeg(out.R, T.R)).toBeLessThan(1);
        // 잡음이 있으면 앞 3×3을 λ로 나눈 것은 정확한 회전이 아니다 → 가장 가까운 회전으로 고쳤는지
        expect(rotationCheck(out.R).orth).toBeLessThan(1e-9);
        expect(Math.hypot(out.t[0] - T.t[0], out.t[1] - T.t[1], out.t[2] - T.t[2]) / Math.hypot(...T.t)).toBeLessThan(0.05);
      }
    });
  });
});
