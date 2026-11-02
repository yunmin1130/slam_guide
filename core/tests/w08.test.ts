/**
 * 8주차 테스트. 제목 구조는 강제 규칙이다 (LESSON_TEMPLATE §4):
 *   describe(구현) > describe("<함수명>") > it("기본|경계|수치: …")
 * - projectionJacobian은 테스트 안에서 만든 수치 야코비안(중앙 차분, 좌섭동)과 비교한다.
 *   규약: T ← (Exp(φ)R, Exp(φ)t + ρ), δ = [ρ; φ] (CURRICULUM 7주차).
 * - smallBA는 정답을 아는 합성 장면에서 시작값을 흔든 뒤 되돌아오는지 본다. 처음 두 카메라는 고정(게이지).
 */
import { Matrix } from "ml-matrix";
import { describe, expect, it } from "vitest";
import { IMPL, loadImpl } from "./loadImpl";
import { createRng, type Rng } from "./rng";

type W08 = typeof import("../reference/w08");
type V2 = readonly [number, number];
type V3 = readonly [number, number, number];
type M3 = readonly [V3, V3, V3];
interface Pose {
  R: M3;
  t: V3;
}
interface Obs {
  cam: number;
  point: number;
  uv: V2;
}

const m = await loadImpl<W08>("w08");

// ---- 테스트용 도우미 ----

const K = { fx: 500, fy: 480, cx: 320, cy: 240 };

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
  let R = Matrix.eye(3);
  if (th > 1e-15) {
    const S = new Matrix(skew([w[0]! / th, w[1]! / th, w[2]! / th]));
    R = R.add(S.clone().mul(Math.sin(th))).add(S.mmul(S).mul(1 - Math.cos(th)));
  }
  return [0, 1, 2].map((i) => [R.get(i, 0), R.get(i, 1), R.get(i, 2)]) as unknown as M3;
}

function mv(R: M3, v: readonly number[]): V3 {
  return [0, 1, 2].map((i) => R[i][0] * v[0]! + R[i][1] * v[1]! + R[i][2] * v[2]!) as unknown as V3;
}

function mm(A: M3, B: M3): M3 {
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j])) as unknown as M3;
}

function project(T: Pose, X: readonly number[]): V2 {
  const p = mv(T.R, X).map((v, i) => v + T.t[i]!);
  return [K.fx * (p[0]! / p[2]!) + K.cx, K.fy * (p[1]! / p[2]!) + K.cy];
}

/** 좌섭동 */
function posePlus(T: Pose, d: readonly number[]): Pose {
  const E = expRot(d.slice(3));
  const t = mv(E, T.t);
  return { R: mm(E, T.R), t: [t[0] + d[0]!, t[1] + d[1]!, t[2] + d[2]!] };
}

function numericJ(f: (d: number[]) => V2, dim: number): number[][] {
  const eps = 1e-6;
  const cols = Array.from({ length: dim }, (_, j) => {
    const d = new Array<number>(dim).fill(0);
    d[j] = eps;
    const a = f(d);
    d[j] = -eps;
    const b = f(d);
    return [(a[0] - b[0]) / (2 * eps), (a[1] - b[1]) / (2 * eps)];
  });
  return [0, 1].map((i) => cols.map((c) => c[i]!));
}

function maxAbs(A: readonly (readonly number[])[], B: readonly (readonly number[])[]): number {
  return Math.max(...A.flatMap((row, i) => row.map((v, j) => Math.abs(v - B[i]![j]!))));
}

function gauss(rng: Rng): number {
  return Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-12))) * Math.cos(2 * Math.PI * rng());
}

/** 카메라 4대가 옆으로 늘어서 앞(+z)의 점 30개를 보는 장면. 카메라 자세는 T_cw */
function scene(rng: Rng, noisePx = 0): { cams: Pose[]; pts: V3[]; obs: Obs[] } {
  const cams: Pose[] = [0, 1, 2, 3].map((i) => {
    const R = expRot([0, (i - 1.5) * 0.05, 0]);
    const t = mv(R, [i * 0.5, 0, 0]).map((v) => -v) as unknown as V3; // 카메라 중심 c에서 t = −R·c
    return { R, t };
  });
  const pts: V3[] = Array.from({ length: 30 }, () => [(rng() - 0.3) * 4, (rng() - 0.5) * 2, 4 + rng() * 4] as V3);
  const obs: Obs[] = [];
  cams.forEach((T, c) =>
    pts.forEach((X, p) => {
      const uv = project(T, X);
      obs.push({ cam: c, point: p, uv: [uv[0] + gauss(rng) * noisePx, uv[1] + gauss(rng) * noisePx] });
    }),
  );
  return { cams, pts, obs };
}

/** 카메라 4대가 점 무리를 둘러싸고(±40°) 가운데 (0, 0, 6)을 보는 장면 (카메라 회전이 커서 섭동 규약 차이가 드러난다) */
function arcScene(rng: Rng): { cams: Pose[]; pts: V3[]; obs: Obs[] } {
  const cams: Pose[] = [-40, -15, 15, 40].map((deg) => {
    const a = (deg * Math.PI) / 180;
    const c = [6 * Math.sin(a), 0.5 * Math.sin(3 * a), 6 - 6 * Math.cos(a)];
    const Rwc = expRot([0, -a, 0]);
    const R = [0, 1, 2].map((i) => [0, 1, 2].map((j) => Rwc[j][i])) as unknown as M3; // R_cw = R_wcᵀ
    return { R, t: mv(R, c).map((v) => -v) as unknown as V3 };
  });
  const pts: V3[] = Array.from({ length: 30 }, () => [(rng() - 0.5) * 3, (rng() - 0.5) * 2, 6 + (rng() - 0.5) * 3] as V3);
  const obs: Obs[] = [];
  cams.forEach((T, c) => pts.forEach((X, p) => obs.push({ cam: c, point: p, uv: project(T, X) })));
  return { cams, pts, obs };
}

/** 고정하지 않은 카메라와 모든 점을 흔든 시작값 */
function perturb(rng: Rng, cams: Pose[], pts: V3[], fixed: number[]): { cams: Pose[]; pts: V3[] } {
  return {
    cams: cams.map((T, c) => (fixed.includes(c) ? T : posePlus(T, [0, 1, 2, 3, 4, 5].map((k) => (rng() - 0.5) * 2 * (k < 3 ? 0.05 : 0.02))))),
    pts: pts.map((X) => X.map((v) => v + (rng() - 0.5) * 0.3) as unknown as V3),
  };
}

function rotDiffDeg(A: M3, B: M3): number {
  let tr = 0;
  for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) tr += A[k][i] * B[k][i];
  return (Math.acos(Math.min(1, Math.max(-1, (tr - 1) / 2))) * 180) / Math.PI;
}

function rmsReproj(cams: readonly Pose[], pts: readonly V3[], obs: readonly Obs[]): number {
  const s = obs.reduce((acc, o) => {
    const uv = project(cams[o.cam]!, pts[o.point]!);
    return acc + (uv[0] - o.uv[0]) ** 2 + (uv[1] - o.uv[1]) ** 2;
  }, 0);
  return Math.sqrt(s / obs.length);
}

const OPTS = { maxIterations: 50, tolerance: 1e-10 };

describe(IMPL, () => {
  describe("projectionJacobian", () => {
    it("기본: 단위 자세에서 점 (1, 2, 5)의 야코비안을 직접 계산한 값과 비교 (1e-12)", () => {
      const T: Pose = { R: expRot([0, 0, 0]), t: [0, 0, 0] };
      const J = m.projectionJacobian(T, [1, 2, 5], K);
      // ∂u/∂p = [[fx/z, 0, −fx·x/z²], [0, fy/z, −fy·y/z²]], ∂p/∂δ = [I | −[p]×], ∂p/∂X = R = I
      const dudp = [
        [K.fx / 5, 0, (-K.fx * 1) / 25],
        [0, K.fy / 5, (-K.fy * 2) / 25],
      ];
      const dp = [
        [1, 0, 0, 0, 5, -2],
        [0, 1, 0, -5, 0, 1],
        [0, 0, 1, 2, -1, 0],
      ];
      const pose = dudp.map((row) => dp[0]!.map((_, j) => row.reduce((s, v, k) => s + v * dp[k]![j]!, 0)));
      expect(maxAbs(J.pose, pose)).toBeLessThan(1e-12);
      expect(maxAbs(J.point, dudp)).toBeLessThan(1e-12);
    });

    it("경계: 모양은 자세 2×6, 점 2×3. 점이 카메라 뒤(z ≤ 0)면 예외", () => {
      const T: Pose = { R: expRot([0.1, 0.2, 0]), t: [0, 0, 1] };
      const J = m.projectionJacobian(T, [0.3, -0.2, 3], K);
      expect(J.pose).toHaveLength(2);
      expect(J.pose[0]).toHaveLength(6);
      expect(J.point).toHaveLength(2);
      expect(J.point[0]).toHaveLength(3);
      const I: Pose = { R: expRot([0, 0, 0]), t: [0, 0, 0] };
      expect(() => m.projectionJacobian(I, [0, 0, -1], K)).toThrow();
      expect(() => m.projectionJacobian(I, [1, 1, 0], K)).toThrow();
    });

    it("수치: 무작위 자세·점 30개에서 수치 야코비안(좌섭동, 중앙 차분)과 상대오차 1e-6", () => {
      const rng = createRng(1);
      for (let k = 0; k < 30; k++) {
        const T: Pose = {
          R: expRot([(rng() - 0.5) * 2, (rng() - 0.5) * 2, (rng() - 0.5) * 2]),
          t: [(rng() - 0.5) * 2, (rng() - 0.5) * 2, 3 + rng()],
        };
        const X: V3 = [(rng() - 0.5) * 2, (rng() - 0.5) * 2, (rng() - 0.5) * 2];
        const J = m.projectionJacobian(T, X, K);
        const Jp = numericJ((d) => project(posePlus(T, d), X), 6);
        const Jx = numericJ((d) => project(T, X.map((v, i) => v + d[i]!)), 3);
        const scale = Math.max(1, ...Jp.flat().map(Math.abs));
        expect(maxAbs(J.pose, Jp) / scale).toBeLessThan(1e-6);
        expect(maxAbs(J.point, Jx) / scale).toBeLessThan(1e-6);
      }
    });
  });

  describe("smallBA", () => {
    it("기본: 잡음 없는 관측, 흔든 시작값에서 진짜 장면으로 돌아온다 (점 1e-6, 재투영 1e-6px)", () => {
      const rng = createRng(2);
      const { cams, pts, obs } = scene(rng);
      const fixed = [0, 1];
      const start = perturb(rng, cams, pts, fixed);
      const out = m.smallBA({ K, cameras: start.cams, points: start.pts, observations: obs, fixed }, OPTS);
      expect(Math.max(...out.points.flatMap((X, i) => X.map((v, j) => Math.abs(v - pts[i]![j]!))))).toBeLessThan(1e-6);
      expect(rmsReproj(out.cameras, out.points, obs)).toBeLessThan(1e-6);
      [2, 3].forEach((c) => expect(rotDiffDeg(out.cameras[c]!.R, cams[c]!.R)).toBeLessThan(1e-4));
    });

    it("경계: 고정한 카메라는 그대로, 비용 기록은 처음 비용부터 줄어들기만 한다", () => {
      const rng = createRng(3);
      const { cams, pts, obs } = scene(rng, 0.5);
      const fixed = [0, 1];
      const start = perturb(rng, cams, pts, fixed);
      const out = m.smallBA({ K, cameras: start.cams, points: start.pts, observations: obs, fixed }, OPTS);
      fixed.forEach((c) => {
        expect(out.cameras[c]!.R).toEqual(start.cams[c]!.R);
        expect(out.cameras[c]!.t).toEqual(start.cams[c]!.t);
      });
      expect(out.costs).toHaveLength(out.iterations + 1);
      for (let i = 1; i < out.costs.length; i++) expect(out.costs[i]!).toBeLessThan(out.costs[i - 1]!);
      expect(out.costs[out.costs.length - 1]).toBe(out.cost);
    });

    it("경계: 관측이 없거나, 없는 번호를 가리키거나, 픽셀이 NaN이거나, 시작값에서 점이 카메라 뒤면 예외", () => {
      const rng = createRng(4);
      const { cams, pts, obs } = scene(rng);
      const base = { K, cameras: cams, points: pts, fixed: [0, 1] };
      expect(() => m.smallBA({ ...base, observations: [] }, OPTS)).toThrow();
      expect(() => m.smallBA({ ...base, observations: [...obs, { cam: 9, point: 0, uv: [0, 0] as V2 }] }, OPTS)).toThrow();
      expect(() => m.smallBA({ ...base, observations: [...obs, { cam: 0, point: 99, uv: [0, 0] as V2 }] }, OPTS)).toThrow();
      expect(() => m.smallBA({ ...base, observations: [...obs, { cam: 0, point: 0, uv: [Number.NaN, 0] as V2 }] }, OPTS)).toThrow();
      // 점 0을 카메라들 뒤(z = −3)로 옮긴 시작값: 야코비안이 없어 "수렴"처럼 멈추지 않게 처음부터 막는다
      const behind = pts.map((X, i) => (i === 0 ? ([X[0], X[1], -3] as V3) : X));
      expect(() => m.smallBA({ ...base, points: behind, observations: obs }, OPTS)).toThrow();
    });

    it("수치: 크게 돈 카메라(±40°)에서도 15번 안에 수렴한다 (야코비안과 업데이트의 섭동 규약이 같아야 빠르다)", () => {
      for (const seed of [2, 3, 5]) {
        const rng = createRng(seed);
        const { cams, pts, obs } = arcScene(rng);
        const start = perturb(rng, cams, pts, [0, 1]);
        const out = m.smallBA({ K, cameras: start.cams, points: start.pts, observations: obs, fixed: [0, 1] }, OPTS);
        expect(out.converged).toBe(true);
        expect(out.iterations).toBeLessThanOrEqual(15);
        expect(rmsReproj(out.cameras, out.points, obs)).toBeLessThan(1e-6);
      }
    });

    it("수치: 픽셀 잡음 0.5px(관측당 2D 오차 RMS 약 0.71px)에서 BA가 진짜 장면보다 작은 RMS(< 0.6px)까지 줄이고, 카메라 회전 오차 < 1°", () => {
      const rng = createRng(5);
      const { cams, pts, obs } = scene(rng, 0.5);
      const fixed = [0, 1];
      const start = perturb(rng, cams, pts, fixed);
      const before = rmsReproj(start.cams, start.pts, obs);
      const out = m.smallBA({ K, cameras: start.cams, points: start.pts, observations: obs, fixed }, OPTS);
      expect(rmsReproj(out.cameras, out.points, obs)).toBeLessThan(0.6);
      expect(rmsReproj(out.cameras, out.points, obs)).toBeLessThan(before / 10);
      [2, 3].forEach((c) => expect(rotDiffDeg(out.cameras[c]!.R, cams[c]!.R)).toBeLessThan(1));
    });

    it("수치: 로버스트 커널(Huber)을 주면 30px 튄 관측이 섞여도 점 위치(중앙값)와 정상 관측의 재투영이 훨씬 좋다", () => {
      const rng = createRng(6);
      const { cams, pts, obs } = scene(rng, 0.3);
      const isBad = obs.map((_, i) => i % 23 === 0);
      const bad = obs.map((o, i) => (isBad[i] ? { ...o, uv: [o.uv[0] + 30, o.uv[1] - 30] as V2 } : o));
      const good = obs.filter((_, i) => !isBad[i]);
      const fixed = [0, 1];
      const start = perturb(rng, cams, pts, fixed);
      const k = 1;
      const robust = (r: number) => {
        const a = Math.abs(r);
        return a <= k ? { rho: 0.5 * r * r, weight: 1 } : { rho: k * (a - 0.5 * k), weight: k / a };
      };
      const opts = { maxIterations: 100, tolerance: 1e-10 };
      const plain = m.smallBA({ K, cameras: start.cams, points: start.pts, observations: bad, fixed }, opts);
      const hub = m.smallBA({ K, cameras: start.cams, points: start.pts, observations: bad, fixed }, { ...opts, robust });
      const medianErr = (P: readonly V3[]) => P.map((X, i) => Math.hypot(X[0] - pts[i]![0], X[1] - pts[i]![1], X[2] - pts[i]![2])).sort((a, b) => a - b)[15]!;
      expect(medianErr(hub.points)).toBeLessThan(0.15);
      expect(medianErr(hub.points)).toBeLessThan(medianErr(plain.points) / 2);
      expect(rmsReproj(hub.cameras, hub.points, good)).toBeLessThan(rmsReproj(plain.cameras, plain.points, good) / 2);
    });
  });
});
