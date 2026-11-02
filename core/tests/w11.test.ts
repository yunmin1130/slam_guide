/**
 * 11주차 테스트. 제목 구조는 강제 규칙이다 (LESSON_TEMPLATE §4):
 *   describe(구현) > describe("<함수명>") > it("기본|경계|수치: …")
 * - 합성 장면: 앞쪽 상자 안의 무작위 점, 옆으로 걸어가며 살짝 고개를 돌리는 카메라. 정답 자세·점을 안다.
 * - 단안이라 스케일이 없다: 초기화 결과는 |t| = 1 이므로 비교할 때 정답 기준선 길이로 스케일을 맞춘다.
 * - vo는 mine에서도 손코딩한 initMap·trackPnP·localBA로 조립되므로 끝에서 전체 파이프라인을 본다.
 */
import { determinant, Matrix } from "ml-matrix";
import { describe, expect, it } from "vitest";
import { IMPL, loadImpl } from "./loadImpl";
import { createRng, type Rng } from "./rng";

type W11 = typeof import("../reference/w11");
type V2 = readonly [number, number];
type V3 = readonly [number, number, number];
type M3 = readonly [V3, V3, V3];
interface Pose {
  R: M3;
  t: V3;
}
interface Feat {
  id: number;
  uv: V2;
}

const m = await loadImpl<W11>("w11");

// ---- 테스트용 도우미 ----

const K = { fx: 500, fy: 500, cx: 320, cy: 240 };
const W = 640;
const H = 480;

function gauss(rng: Rng): number {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

/** Huber (테스트 안에서 직접, 7주차와 같은 정의) */
function huber(r: number, k: number): { rho: number; weight: number } {
  const a = Math.abs(r);
  return a <= k ? { rho: (r * r) / 2, weight: 1 } : { rho: k * (a - k / 2), weight: k / a };
}

/** 회전 벡터 → 회전 행렬 (로드리게스, 테스트 안에서 직접) */
function expRot(w: readonly number[]): M3 {
  const th = Math.hypot(w[0]!, w[1]!, w[2]!);
  let R = Matrix.eye(3);
  if (th > 1e-15) {
    const k = w.map((v) => v / th);
    const S = new Matrix([
      [0, -k[2]!, k[1]!],
      [k[2]!, 0, -k[0]!],
      [-k[1]!, k[0]!, 0],
    ]);
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

function tr(R: M3): M3 {
  return [0, 1, 2].map((i) => [R[0][i], R[1][i], R[2][i]]) as unknown as M3;
}

function sub(a: readonly number[], b: readonly number[]): V3 {
  return [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
}

function len(a: readonly number[]): number {
  return Math.hypot(a[0]!, a[1]!, a[2]!);
}

/** 카메라 중심 C, 요(y축)·피치(x축) 회전으로 T_cw = (R, −R·C) */
function poseFrom(C: readonly number[], yaw: number, pitch = 0): Pose {
  const R = tr(mm(expRot([0, yaw, 0]), expRot([pitch, 0, 0])));
  const t = mv(R, C);
  return { R, t: [-t[0], -t[1], -t[2]] };
}

function centerOf(T: Pose): V3 {
  const c = mv(tr(T.R), T.t);
  return [-c[0], -c[1], -c[2]];
}

function rotErrDeg(A: M3, B: M3): number {
  const E = mm(tr(A), B);
  const c = (E[0][0] + E[1][1] + E[2][2] - 1) / 2;
  return (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
}

function angleDeg(a: readonly number[], b: readonly number[]): number {
  const c = (a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) / (len(a) * len(b));
  return (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
}

function randomPoints(rng: Rng, n: number): V3[] {
  return Array.from({ length: n }, () => [-6 + 15 * rng(), -3 + 6 * rng(), 6 + 8 * rng()] as const);
}

function project(T: Pose, X: V3): V2 | null {
  const p = mv(T.R, X);
  const z = p[2] + T.t[2];
  if (!(z > 0.1)) return null;
  const u = (K.fx * (p[0] + T.t[0])) / z + K.cx;
  const v = (K.fy * (p[1] + T.t[1])) / z + K.cy;
  return u >= 0 && u < W && v >= 0 && v < H ? [u, v] : null;
}

/** 보이는 점만, 잡음 σ 픽셀. outlierIds에 든 점은 화면 아무 데나 */
function observe(rng: Rng, T: Pose, pts: readonly V3[], sigma: number, outlierIds: ReadonlySet<number> = new Set()): Feat[] {
  return pts.flatMap((X, id) => {
    const uv = project(T, X);
    if (!uv) return [];
    if (outlierIds.has(id)) return [{ id, uv: [W * rng(), H * rng()] as V2 }];
    return [{ id, uv: [uv[0] + sigma * gauss(rng), uv[1] + sigma * gauss(rng)] as V2 }];
  });
}

const INIT = (rng: Rng) => ({ threshold: 2, iterations: 200, minParallaxDeg: 1, minPoints: 30, rng });
const TRACK = (rng: Rng) => ({ threshold: 3, iterations: 100, minInliers: 15, rng });
const SOLVER = { maxIterations: 15, tolerance: 1e-8 };

describe(IMPL, () => {
  describe("initMap", () => {
    it("기본: 옆으로 0.5 m 움직인 두 프레임에서 회전·이동 방향·점(스케일 맞춤)을 되찾는다", () => {
      const rng = createRng(1);
      const pts = randomPoints(rng, 150);
      const T1 = poseFrom([0, 0, 0], 0);
      const T2 = poseFrom([0.5, 0.05, 0.1], 0.06);
      const out = m.initMap(K, observe(rng, T1, pts, 0.5), observe(rng, T2, pts, 0.5), INIT(createRng(7)));
      expect(out === null).toBe(false);
      // 정답 상대 자세 T21 = T2·T1⁻¹ = T2 (T1 = 단위)
      expect(rotErrDeg(out!.T.R, T2.R)).toBeLessThan(0.5);
      expect(len(out!.T.t)).toBeCloseTo(1, 9);
      expect(angleDeg(out!.T.t, T2.t)).toBeLessThan(3);
      // 점: 정답 기준선 길이 |t21|로 스케일을 맞추면 비슷해야 한다 (시차 약 3°, 잡음 0.5px → 깊이 오차 수 %)
      const s = len(T2.t);
      const rel = out!.points.map((p) => len(sub(p.X.map((v) => v * s), pts[p.id]!)) / len(pts[p.id]!));
      rel.sort((a, b) => a - b);
      expect(rel[rel.length >> 1]!).toBeLessThan(0.1);
      expect(80).toBeLessThan(out!.points.length);
      expect(out!.points.every((p, i, a) => i === 0 || a[i - 1]!.id < p.id)).toBe(true);
      expect(1).toBeLessThan(out!.parallaxDeg);
    });

    it("경계: 제자리 회전, 거의 정지, 공통 점 8개 미만, 남은 점 < minPoints 이면 null (초기화를 미룬다)", () => {
      const rng = createRng(2);
      const pts = randomPoints(rng, 150);
      const f1 = observe(rng, poseFrom([0, 0, 0], 0), pts, 0.5);
      expect(m.initMap(K, f1, observe(rng, poseFrom([0, 0, 0], 0.08), pts, 0.5), INIT(createRng(3)))).toBe(null);
      expect(m.initMap(K, f1, observe(rng, poseFrom([0.005, 0, 0], 0), pts, 0.5), INIT(createRng(3)))).toBe(null);
      expect(m.initMap(K, f1.slice(0, 7), observe(rng, poseFrom([0.5, 0, 0], 0), pts, 0.5), INIT(createRng(3)))).toBe(null);
      const few = { ...INIT(createRng(3)), minPoints: 1000 };
      expect(m.initMap(K, f1, observe(rng, poseFrom([0.5, 0, 0], 0), pts, 0.5), few)).toBe(null);
    });

    it("수치: 대응의 20%가 엉터리여도 그 점들은 맵에 들어가지 않고 자세는 맞다", () => {
      const rng = createRng(4);
      const pts = randomPoints(rng, 200);
      const bad = new Set(pts.map((_, i) => i).filter((i) => i % 5 === 0));
      const T2 = poseFrom([0.6, 0, 0.1], -0.05);
      const out = m.initMap(K, observe(rng, poseFrom([0, 0, 0], 0), pts, 0.5), observe(rng, T2, pts, 0.5, bad), INIT(createRng(5)));
      expect(out === null).toBe(false);
      expect(out!.points.filter((p) => bad.has(p.id)).length).toBeLessThanOrEqual(2);
      expect(rotErrDeg(out!.T.R, T2.R)).toBeLessThan(0.5);
      expect(angleDeg(out!.T.t, T2.t)).toBeLessThan(3);
    });

    it("경계: K가 이상함, 한 프레임에 같은 id 두 번, NaN 좌표, threshold ≤ 0 이면 예외", () => {
      const f: Feat[] = [
        { id: 1, uv: [10, 10] },
        { id: 2, uv: [20, 20] },
      ];
      const o = INIT(createRng(1));
      expect(() => m.initMap({ ...K, fx: 0 }, f, f, o)).toThrow();
      expect(() => m.initMap(K, [...f, { id: 1, uv: [5, 5] }], f, o)).toThrow();
      expect(() => m.initMap(K, f, [{ id: 1, uv: [Number.NaN, 1] }], o)).toThrow();
      expect(() => m.initMap(K, f, f, { ...o, threshold: 0 })).toThrow();
    });
  });

  describe("trackPnP", () => {
    it("기본: 맵 포인트 대응의 30%가 엉터리여도 자세를 찾고, 엉터리는 inlier에서 뺀다", () => {
      const rng = createRng(11);
      const pts = randomPoints(rng, 150);
      const map = pts.map((X, id) => ({ id, X }));
      const T = poseFrom([1.2, -0.1, 0.3], 0.1, 0.03);
      const bad = new Set(pts.map((_, i) => i).filter((i) => i % 10 < 3));
      const out = m.trackPnP(K, map, observe(rng, T, pts, 0.5, bad), TRACK(createRng(12)));
      expect(out === null).toBe(false);
      expect(rotErrDeg(out!.T.R, T.R)).toBeLessThan(0.3);
      expect(len(sub(centerOf(out!.T), centerOf(T)))).toBeLessThan(0.05);
      expect(out!.inliers.filter((id) => bad.has(id)).length).toBeLessThanOrEqual(2);
      expect(50).toBeLessThan(out!.inliers.length);
      expect(out!.inliers.every((id, i, a) => i === 0 || a[i - 1]! < id)).toBe(true);
    });

    it("경계: 맵에 없는 id는 무시하고, 맵과 겹치는 점이 minInliers보다 적으면 null", () => {
      const rng = createRng(13);
      const pts = randomPoints(rng, 150);
      const T = poseFrom([0.5, 0, 0], 0);
      const feats = observe(rng, T, pts, 0.5);
      const small = pts.slice(0, 10).map((X, id) => ({ id, X }));
      expect(m.trackPnP(K, small, feats, TRACK(createRng(1)))).toBe(null);
      // 맵에 없는 id(1000 이상)의 엉터리 특징점이 섞여도 같은 자세
      const extra = feats.map((f) => ({ id: f.id + 1000, uv: [W * rng(), H * rng()] as V2 }));
      const out = m.trackPnP(
        K,
        pts.map((X, id) => ({ id, X })),
        [...feats, ...extra],
        TRACK(createRng(2)),
      );
      expect(out === null).toBe(false);
      expect(out!.inliers.every((id) => id < 1000)).toBe(true);
      expect(rotErrDeg(out!.T.R, T.R)).toBeLessThan(0.3);
    });

    it("수치: 맵 좌표가 원점에서 멀어도(월드를 (20, −10, 20)만큼 옮김) RANSAC 시드와 상관없이 진짜 inlier를 거의 다 찾는다", () => {
      const rng = createRng(77);
      const pts = randomPoints(rng, 150);
      const T = poseFrom([1.2, -0.1, 0.3], 0.1, 0.03);
      const bad = new Set(pts.map((_, i) => i).filter(() => rng() < 0.3));
      const feats = observe(rng, T, pts, 1.0, bad);
      const truth = feats.filter((f) => !bad.has(f.id)).length;
      // 월드를 옮겨도 사진은 같다 (카메라도 함께 옮긴 것). DLT 행렬의 열 크기만 크게 달라진다
      const map = pts.map((X, id) => ({ id, X: [X[0] + 20, X[1] - 10, X[2] + 20] as V3 }));
      for (let seed = 1; seed <= 5; seed++) {
        const out = m.trackPnP(K, map, feats, { threshold: 3, iterations: 100, minInliers: 15, rng: createRng(seed) });
        expect(out === null).toBe(false);
        expect(0.85 * truth).toBeLessThan(out!.inliers.length);
      }
    });

    it("경계: 맵과 겹치는 점은 충분해도 최종 inlier가 minInliers보다 적으면 null", () => {
      const rng = createRng(14);
      const pts = randomPoints(rng, 150);
      const T = poseFrom([0.5, 0, 0], 0);
      const bad = new Set(pts.map((_, i) => i).filter((i) => i % 5 < 2)); // 40%
      const feats = observe(rng, T, pts, 0.5, bad);
      const map = pts.map((X, id) => ({ id, X }));
      const minInliers = Math.floor(0.8 * feats.length); // 대응 수는 넘지만 진짜 inlier(약 60%)보다 많다
      expect(m.trackPnP(K, map, feats, { ...TRACK(createRng(1)), minInliers })).toBe(null);
      expect(m.trackPnP(K, map, feats, { ...TRACK(createRng(1)), minInliers: 30 }) === null).toBe(false);
    });

    it("경계: minInliers < 6, threshold ≤ 0, 같은 id 두 번이면 예외", () => {
      const map = [{ id: 0, X: [0, 0, 5] as V3 }];
      const f: Feat[] = [{ id: 0, uv: [320, 240] }];
      expect(() => m.trackPnP(K, map, f, { ...TRACK(createRng(1)), minInliers: 5 })).toThrow();
      expect(() => m.trackPnP(K, map, f, { ...TRACK(createRng(1)), threshold: 0 })).toThrow();
      expect(() => m.trackPnP(K, map, [...f, ...f], TRACK(createRng(1)))).toThrow();
    });
  });

  describe("localBA", () => {
    /** 정답 키프레임 5개 + 흔든 시작값 (처음 두 키프레임은 정답 그대로) */
    function scene(seed: number) {
      const rng = createRng(seed);
      const pts = randomPoints(rng, 80);
      const gtPoses = [0, 1, 2, 3, 4].map((k) => poseFrom([0.3 * k, 0.02 * k, 0.05 * k], 0.02 * k));
      const feats = gtPoses.map((T) => observe(rng, T, pts, 0.5));
      const shake = (T: Pose, k: number): Pose =>
        k < 2
          ? T
          : {
              R: mm(expRot([0.02 * gauss(rng), 0.02 * gauss(rng), 0.02 * gauss(rng)]), T.R),
              t: [T.t[0] + 0.1 * gauss(rng), T.t[1] + 0.1 * gauss(rng), T.t[2] + 0.1 * gauss(rng)],
            };
      const keyframes = gtPoses.map((T, k) => ({ frame: k * 3, T: shake(T, k), features: feats[k]! }));
      const map = pts.map((X, id) => ({ id, X: [X[0] + 0.1 * gauss(rng), X[1] + 0.1 * gauss(rng), X[2] + 0.1 * gauss(rng)] as V3 }));
      return { gtPoses, keyframes, map };
    }

    it("기본: 흔든 자세·점에서 재투영 비용이 줄고, 창에서 가장 오래된 두 키프레임은 그대로다", () => {
      const s = scene(21);
      const out = m.localBA(K, s.keyframes, s.map, { window: 5, solver: SOLVER });
      expect(1).toBeLessThan(out.costs.length);
      expect(out.costs[out.costs.length - 1]!).toBeLessThan(0.05 * out.costs[0]!);
      expect(out.keyframes[0]!.T).toEqual(s.keyframes[0]!.T);
      expect(out.keyframes[1]!.T).toEqual(s.keyframes[1]!.T);
      // 움직인 키프레임 셋의 위치 오차 평균이 줄고, 하나하나도 5 cm 안
      const err = (kfs: readonly { T: Pose }[], k: number) => len(sub(centerOf(kfs[k]!.T), centerOf(s.gtPoses[k]!)));
      const free = [2, 3, 4];
      const before = free.reduce((a, k) => a + err(s.keyframes, k), 0) / 3;
      const after = free.reduce((a, k) => a + err(out.keyframes, k), 0) / 3;
      expect(after).toBeLessThan(0.5 * before);
      for (const k of free) {
        expect(err(out.keyframes, k)).toBeLessThan(0.05);
        expect(out.keyframes[k]!.frame).toBe(s.keyframes[k]!.frame);
        expect(out.keyframes[k]!.features).toBe(s.keyframes[k]!.features);
      }
    });

    it("경계: 창 밖 키프레임과 창 안에서 두 번 이상 안 보인 점은 바꾸지 않는다", () => {
      const s = scene(22);
      const hidden = { id: 999, X: [0, 0, 9] as V3 }; // 어느 키프레임의 특징점에도 없다
      const out = m.localBA(K, s.keyframes, [...s.map, hidden], { window: 3, solver: SOLVER });
      // window 3 → 키프레임 2, 3, 4가 창. 2·3은 고정, 4만 움직인다. 0·1은 창 밖
      for (let k = 0; k < 4; k++) expect(out.keyframes[k]!.T).toEqual(s.keyframes[k]!.T);
      expect(JSON.stringify(out.keyframes[4]!.T) === JSON.stringify(s.keyframes[4]!.T)).toBe(false);
      expect(out.map.find((p) => p.id === 999)!.X).toEqual(hidden.X);
      expect(out.map).toHaveLength(s.map.length + 1);
    });

    it("수치: 창 밖 키프레임의 관측도 (고정 카메라로) 비용에 들어간다", () => {
      const s = scene(25);
      const out = m.localBA(K, s.keyframes, s.map, { window: 3, solver: SOLVER });
      // 창 = 키프레임 2, 3, 4. 그 안에서 두 번 이상 보인 점의 관측을 키프레임 0~4 전부에서 모아 시작 비용을 직접 계산
      const byId = new Map(s.map.map((p) => [p.id, p.X]));
      const seen = new Map<number, number>();
      for (const kf of s.keyframes.slice(2)) for (const f of kf.features) if (byId.has(f.id)) seen.set(f.id, (seen.get(f.id) ?? 0) + 1);
      let cost = 0;
      for (const kf of s.keyframes) {
        for (const f of kf.features) {
          if ((seen.get(f.id) ?? 0) < 2) continue;
          const p = mv(kf.T.R, byId.get(f.id)!);
          const z = p[2] + kf.T.t[2];
          if (!(z > 0)) continue;
          const u = (K.fx * (p[0] + kf.T.t[0])) / z + K.cx;
          const v = (K.fy * (p[1] + kf.T.t[1])) / z + K.cy;
          cost += 0.5 * ((u - f.uv[0]) ** 2 + (v - f.uv[1]) ** 2);
        }
      }
      expect(out.costs[0]!).toBeCloseTo(cost, 6);
    });

    it("경계: 공통 점이 없으면 아무것도 안 바꾸고 costs는 빈 배열, window < 2·키프레임 < 2면 예외", () => {
      const s = scene(23);
      const out = m.localBA(K, s.keyframes, [], { window: 5, solver: SOLVER });
      expect(out.costs).toHaveLength(0);
      expect(out.keyframes.map((k) => k.T)).toEqual(s.keyframes.map((k) => k.T));
      expect(() => m.localBA(K, s.keyframes, s.map, { window: 1, solver: SOLVER })).toThrow();
      expect(() => m.localBA(K, s.keyframes.slice(0, 1), s.map, { window: 5, solver: SOLVER })).toThrow();
    });

    it("수치: 시작값에서 카메라 뒤에 있는 점은 빼고 돌아간다 (그 점은 그대로)", () => {
      const s = scene(24);
      const map = s.map.map((p, i) => (i === 0 ? { id: p.id, X: [p.X[0], p.X[1], -5] as V3 } : p));
      const out = m.localBA(K, s.keyframes, map, { window: 5, solver: { ...SOLVER, robust: (r: number) => huber(r, 2) } });
      expect(out.costs[out.costs.length - 1]!).toBeLessThan(out.costs[0]!);
      expect(out.map[0]!.X).toEqual(map[0]!.X);
    });
  });

  describe("alignUmeyama", () => {
    it("기본: 알려진 Sim(3)으로 옮긴 점들에서 s, R, t를 정확히 되찾는다 (스케일 없이도)", () => {
      const rng = createRng(31);
      const src = Array.from({ length: 30 }, () => [rng() * 4 - 2, rng() * 4 - 2, rng() * 4 - 2] as V3);
      const R = expRot([0.3, -1.2, 0.7]);
      const t: V3 = [1, -2, 3];
      const apply = (s: number) =>
        src.map((p) => {
          const q = mv(R, p);
          return [s * q[0] + t[0], s * q[1] + t[1], s * q[2] + t[2]] as V3;
        });
      const out = m.alignUmeyama(src, apply(2.5), true);
      expect(out.s).toBeCloseTo(2.5, 9);
      expect(rotErrDeg(out.R, R)).toBeLessThan(1e-4);
      out.t.forEach((v, i) => expect(v).toBeCloseTo(t[i]!, 8));
      const rigid = m.alignUmeyama(src, apply(1), false);
      expect(rigid.s).toBe(1);
      expect(rotErrDeg(rigid.R, R)).toBeLessThan(1e-4);
      rigid.t.forEach((v, i) => expect(v).toBeCloseTo(t[i]!, 8));
    });

    it("경계: 거울상 점들에도 반사가 아닌 회전(det = +1)과 그에 맞는 최소제곱 크기를 돌려준다", () => {
      const rng = createRng(32);
      const src = Array.from({ length: 20 }, () => [rng(), rng(), rng()] as V3);
      const dst = src.map((p) => [p[0], p[1], -p[2]] as V3);
      const a = m.alignUmeyama(src, dst, true);
      expect(determinant(new Matrix(a.R.map((r) => [...r])))).toBeCloseTo(1, 9);
      // 회전으로 제한한 최소제곱 해: 크기를 조금 바꾸면 오차 제곱합이 커진다 (s = tr(DS)/σ², 셋째 항은 −)
      const sse = (s: number) =>
        src.reduce((acc, p, i) => {
          const q = mv(a.R, p);
          return acc + len(sub([s * q[0] + a.t[0], s * q[1] + a.t[1], s * q[2] + a.t[2]], dst[i]!)) ** 2;
        }, 0);
      expect(sse(a.s)).toBeLessThan(sse(a.s * 1.02));
      expect(sse(a.s)).toBeLessThan(sse(a.s * 0.98));
    });

    it("수치: 잡음이 있으면 최소제곱 해다 (s, R, t를 조금씩 흔들면 오차 제곱합이 커진다)", () => {
      const rng = createRng(33);
      const src = Array.from({ length: 50 }, () => [rng() * 4, rng() * 4, rng() * 4] as V3);
      const dst = src.map((p) => [2 * p[1] + 0.05 * gauss(rng) + 1, -2 * p[0] + 0.05 * gauss(rng), 2 * p[2] + 0.05 * gauss(rng)] as V3);
      const sse = (s: number, R: M3, t: readonly number[]) =>
        src.reduce((acc, p, i) => {
          const q = mv(R, p);
          return acc + len(sub([s * q[0] + t[0]!, s * q[1] + t[1]!, s * q[2] + t[2]!], dst[i]!)) ** 2;
        }, 0);
      const a = m.alignUmeyama(src, dst, true);
      const best = sse(a.s, a.R, a.t);
      for (const ds of [0.99, 1.01]) expect(best).toBeLessThan(sse(a.s * ds, a.R, a.t));
      for (const w of [
        [0.01, 0, 0],
        [0, -0.01, 0],
        [0, 0, 0.01],
      ]) {
        expect(best).toBeLessThan(sse(a.s, mm(expRot(w), a.R), a.t));
      }
      expect(best).toBeLessThan(sse(a.s, a.R, [a.t[0] + 0.01, a.t[1], a.t[2]]));
    });

    it("경계: 3개 미만, 길이 다름, 한 직선 위, NaN이면 예외", () => {
      const p: V3[] = [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ];
      expect(() => m.alignUmeyama(p.slice(0, 2), p.slice(0, 2), true)).toThrow();
      expect(() => m.alignUmeyama(p, p.slice(0, 2), true)).toThrow();
      const line: V3[] = [0, 1, 2, 3].map((k) => [k, 2 * k, 0] as V3);
      expect(() => m.alignUmeyama(line, line, true)).toThrow();
      expect(() => m.alignUmeyama([p[0]!, p[1]!, [0, Number.NaN, 0]], p, true)).toThrow();
    });
  });

  describe("ate", () => {
    it("기본: 정답을 Sim(3)으로 옮긴 궤적이면 0, 오차는 정렬 뒤 위치 차이의 RMSE", () => {
      const gt = Array.from({ length: 40 }, (_, k) => [Math.cos(k / 6), Math.sin(k / 6), 0.1 * k] as V3);
      const R = expRot([0.2, 0.4, -0.1]);
      const est = gt.map((p) => {
        const q = mv(R, p);
        return [0.3 * q[0] + 5, 0.3 * q[1], 0.3 * q[2] - 1] as V3;
      });
      const zero = m.ate(est, gt);
      expect(zero.rmse).toBeLessThan(1e-9);
      expect(zero.align.s).toBeCloseTo(1 / 0.3, 8);

      const rng = createRng(41);
      const noisy = est.map((p) => [p[0] + 0.01 * gauss(rng), p[1] + 0.01 * gauss(rng), p[2] + 0.01 * gauss(rng)] as V3);
      const r = m.ate(noisy, gt);
      expect(r.errors).toHaveLength(40);
      expect(r.rmse).toBeCloseTo(Math.sqrt(r.errors.reduce((s, e) => s + e * e, 0) / 40), 12);
      expect(r.mean).toBeCloseTo(r.errors.reduce((s, e) => s + e, 0) / 40, 12);
      expect(r.max).toBe(Math.max(...r.errors));
      const sorted = [...r.errors].sort((a, b) => a - b);
      expect(r.median).toBeCloseTo((sorted[19]! + sorted[20]!) / 2, 12);
      // 잡음 σ = 0.01 (3축)이 1/0.3배로 커진 크기 근처
      expect(0.03).toBeLessThan(r.rmse);
      expect(r.rmse).toBeLessThan(0.08);
    });

    it("경계: 길이가 다르거나 3개 미만이면 예외", () => {
      const p: V3[] = [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ];
      expect(() => m.ate(p, p.slice(0, 2))).toThrow();
      expect(() => m.ate(p.slice(0, 2), p.slice(0, 2))).toThrow();
    });
  });

  describe("rpe", () => {
    it("기본: 스케일만 다른 같은 궤적이면 0, 한 프레임만 밀리면 그 앞뒤 쌍에만 오차가 생긴다", () => {
      const gt = Array.from({ length: 10 }, (_, k) => ({ R: expRot([0, 0.1 * k, 0]), t: [k, 0, 0.5 * k] as V3 }));
      const est = gt.map((T) => ({ R: T.R, t: [T.t[0] / 4, T.t[1] / 4, T.t[2] / 4] as V3 }));
      const r0 = m.rpe(est, gt, 1, 4);
      expect(r0.count).toBe(9);
      expect(r0.transRmse).toBeLessThan(1e-12);
      expect(r0.rotRmseDeg).toBeLessThan(1e-4); // acos(1 − 1ulp)가 1e-6° 정도라 여유를 둔다 (브라우저마다 sin·cos 끝자리가 다름)
      const moved = est.map((T, k) => (k === 5 ? { R: T.R, t: [T.t[0] + 0.25, T.t[1], T.t[2]] as V3 } : T));
      // 쌍 (4,5)와 (5,6)에서 각각 이동 오차 1 (= 0.25 × 4) → √(2/9)
      expect(m.rpe(moved, gt, 1, 4).transRmse).toBeCloseTo(Math.sqrt(2 / 9), 9);
      expect(() => m.rpe(est, gt.slice(1), 1, 1)).toThrow();
      expect(() => m.rpe(est, gt, 0, 1)).toThrow();
    });
  });

  describe("vo", () => {
    /** 40프레임: 처음 6프레임은 제자리 회전, 그다음 옆으로 걸으며 고개를 돌린다 */
    function sequence(seed: number, outlierRate: number) {
      const rng = createRng(seed);
      const pts = randomPoints(rng, 400);
      const gt: Pose[] = Array.from({ length: 40 }, (_, k) => {
        if (k < 6) return poseFrom([0, 0, 0], 0.01 * k);
        const s = k - 6;
        return poseFrom([0.08 * s, 0.01 * Math.sin(s / 4), 0.03 * s], 0.05 + 0.004 * s);
      });
      const frames = gt.map((T) => {
        const bad = new Set(pts.map((_, i) => i).filter(() => rng() < outlierRate));
        return observe(rng, T, pts, 0.7, bad);
      });
      return { gt, frames };
    }

    const OPTS = (ba: boolean) => ({
      // 시차 3°: 1°로 초기화하면 첫 맵의 깊이 오차가 커서 뒤 프레임 추적이 흔들린다 (레슨 11a)
      init: { ...INIT(createRng(51)), minParallaxDeg: 3 },
      track: TRACK(createRng(52)),
      keyframe: { minFrames: 2, maxFrames: 5, minTrackedRatio: 0.8 },
      ba: ba ? { window: 4, solver: { maxIterations: 8, tolerance: 1e-6, robust: (r: number) => huber(r, 2) } } : null,
    });

    function ateOf(out: ReturnType<W11["vo"]>, gt: readonly Pose[]) {
      const idx = out.poses.flatMap((T, k) => (T ? [k] : []));
      return {
        idx,
        r: m.ate(
          idx.map((k) => centerOf(out.poses[k]!)),
          idx.map((k) => centerOf(gt[k]!)),
        ),
      };
    }

    it("수치: 제자리 회전 구간에서는 초기화를 미루고, 끝까지 추적하며 Sim(3) 정렬 ATE가 이동 거리의 2% 미만", () => {
      const { gt, frames } = sequence(61, 0.05);
      const out = m.vo(K, frames, OPTS(true));
      expect(out.initFrames === null).toBe(false);
      expect(6).toBeLessThan(out.initFrames![1]); // 회전만 있던 처음 6프레임으로는 초기화하지 않는다
      expect(out.lostAt).toBe(null);
      expect(5).toBeLessThan(out.keyframes.length);
      const { idx, r } = ateOf(out, gt);
      expect(30).toBeLessThan(idx.length);
      const path = len(sub(centerOf(gt[39]!), centerOf(gt[6]!)));
      expect(r.rmse).toBeLessThan(0.02 * path);
    });

    it("수치: local BA를 끄고 켜도 끝까지 추적하고, 다른 장면에서도 ATE가 이동 거리의 2% 미만", () => {
      const { gt, frames } = sequence(62, 0.05);
      const path = len(sub(centerOf(gt[39]!), centerOf(gt[6]!)));
      for (const ba of [true, false]) {
        const out = m.vo(K, frames, OPTS(ba));
        expect(out.lostAt).toBe(null);
        expect(ateOf(out, gt).r.rmse).toBeLessThan(0.02 * path);
      }
    });
  });
});
