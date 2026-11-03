/**
 * 15주차 테스트. 제목 구조는 강제 규칙이다 (LESSON_TEMPLATE §4):
 *   describe(구현) > describe("<함수명>") > it("기본|경계|수치: …")
 * - 장면: 바닥과 벽 세 개, 기둥 하나가 있는 방 (라이다가 실내에서 보는 평면들). 점마다 법선을 안다.
 * - "같은 점을 옮긴 것"은 정확히 맞아야 하고, "같은 방을 따로 샘플링한 것"은 대응이 근사라 오차가 남는다
 *   (점-평면이 점-점보다 훨씬 작게 남기는 것이 15주차 요점).
 * - 점-평면 테스트의 점-점 비교값은 손코딩 함수에 기대지 않게 정답을 직접 쓴다 (LESSON_TEMPLATE §4).
 */
import { describe, expect, it } from "vitest";
import { expSO3, logSO3 } from "../reference/w03";
import { icpPointToPoint as refIcpPointToPoint } from "../reference/w15";
import { IMPL, loadImpl } from "./loadImpl";
import { createRng, type Rng } from "./rng";
import type { IcpOptions, Mat3, SE3, Vec3 } from "../types";

type W15 = typeof import("../reference/w15");
const m = await loadImpl<W15>("w15");

interface Scan {
  readonly points: Vec3[];
  readonly normals: Vec3[];
}

/** 직사각형 면 위 무작위 점: origin + s·u + t·v (s, t ∈ [0, 1]) */
function face(rng: Rng, n: number, origin: Vec3, u: Vec3, v: Vec3, normal: Vec3): Scan {
  const points = Array.from({ length: n }, (): Vec3 => {
    const s = rng();
    const t = rng();
    return [origin[0] + s * u[0] + t * v[0], origin[1] + s * u[1] + t * v[1], origin[2] + s * u[2] + t * v[2]];
  });
  return { points, normals: points.map(() => normal) };
}

/** 6 × 4 × 2.5 m 방: 바닥, 벽 셋, 기둥 두 면 */
function room(rng: Rng, perFace = 60): Scan {
  const faces = [
    face(rng, perFace * 2, [0, 0, 0], [6, 0, 0], [0, 4, 0], [0, 0, 1]),
    face(rng, perFace, [0, 0, 0], [0, 4, 0], [0, 0, 2.5], [1, 0, 0]),
    face(rng, perFace, [0, 0, 0], [6, 0, 0], [0, 0, 2.5], [0, 1, 0]),
    face(rng, perFace, [0, 4, 0], [6, 0, 0], [0, 0, 2.5], [0, -1, 0]),
    face(rng, perFace / 2, [2, 1.5, 0], [0.5, 0, 0], [0, 0, 2.5], [0, -1, 0]),
    face(rng, perFace / 2, [2, 1.5, 0], [0, 0.5, 0], [0, 0, 2.5], [-1, 0, 0]),
  ];
  return { points: faces.flatMap((f) => f.points), normals: faces.flatMap((f) => f.normals) };
}

function mv(A: Mat3, v: Vec3): Vec3 {
  const r = (i: number) => A[i][0] * v[0] + A[i][1] * v[1] + A[i][2] * v[2];
  return [r(0), r(1), r(2)];
}

function apply(T: SE3, p: Vec3): Vec3 {
  const q = mv(T.R, p);
  return [q[0] + T.t[0], q[1] + T.t[1], q[2] + T.t[2]];
}

/** 회전 오차 (도, A·Bᵀ 의 회전각. acos 는 0° 근처에서 정밀도를 잃어 logSO3 로 잰다), 이동 오차 */
function poseError(A: SE3, B: SE3): { deg: number; trans: number } {
  const c = (i: number, j: number) => A.R[i]![0]! * B.R[j]![0]! + A.R[i]![1]! * B.R[j]![1]! + A.R[i]![2]! * B.R[j]![2]!;
  const ABt: Mat3 = [
    [c(0, 0), c(0, 1), c(0, 2)],
    [c(1, 0), c(1, 1), c(1, 2)],
    [c(2, 0), c(2, 1), c(2, 2)],
  ];
  const deg = (Math.hypot(...logSO3(ABt)) * 180) / Math.PI;
  return { deg, trans: Math.hypot(A.t[0] - B.t[0], A.t[1] - B.t[1], A.t[2] - B.t[2]) };
}

const IDENTITY: SE3 = { R: expSO3([0, 0, 0]), t: [0, 0, 0] };
const TRUE_T: SE3 = { R: expSO3([0.01, -0.02, 0.08]), t: [0.15, -0.1, 0.03] };
const OPTS: IcpOptions = { maxIterations: 60, tolerance: 1e-10, maxDistance: 1.0 };

describe(IMPL, () => {
  describe("nearestNeighbors", () => {
    it("기본: 가장 가까운 점의 번호와 거리", () => {
      const pts: Vec3[] = [[0, 0, 0], [1, 0, 0], [0, 2, 0]];
      const nn = m.nearestNeighbors([[0.9, 0.1, 0], [0, 1.5, 0]], pts);
      expect(nn[0]!.index).toBe(1);
      expect(nn[0]!.dist).toBeCloseTo(Math.hypot(0.1, 0.1), 12);
      expect(nn[1]!.index).toBe(2);
    });

    it("경계: 거리가 같으면 앞 번호, 찾을 점이 없거나 NaN이면 예외", () => {
      expect(m.nearestNeighbors([[0, 0, 0]], [[1, 0, 0], [-1, 0, 0]])[0]!.index).toBe(0);
      expect(() => m.nearestNeighbors([[0, 0, 0]], [])).toThrow();
      expect(() => m.nearestNeighbors([[NaN, 0, 0]], [[0, 0, 0]])).toThrow();
    });

    it("수치: 무작위 점군에서 하나씩 다 재 본 결과와 같다", () => {
      const rng = createRng(5);
      const pts = Array.from({ length: 200 }, (): Vec3 => [rng() * 10, rng() * 10, rng() * 10]);
      const q = Array.from({ length: 50 }, (): Vec3 => [rng() * 10, rng() * 10, rng() * 10]);
      const nn = m.nearestNeighbors(q, pts);
      q.forEach((p, i) => {
        const d = pts.map((r) => Math.hypot(r[0] - p[0], r[1] - p[1], r[2] - p[2]));
        expect(nn[i]!.dist).toBeCloseTo(Math.min(...d), 12);
      });
    });
  });

  describe("icpPointToPoint", () => {
    it("기본: 같은 점군이면 단위 변환, RMSE 0, 수렴", () => {
      const { points } = room(createRng(1));
      const r = m.icpPointToPoint(points, points, OPTS);
      const e = poseError(r.T, IDENTITY);
      expect(e.deg + e.trans).toBeLessThan(1e-6);
      expect(r.rmse).toBeLessThan(1e-9);
      expect(r.converged).toBe(true);
      expect(r.pairs).toBe(points.length);
    });

    it("기본: 같은 점을 강체 변환으로 옮긴 dst 면 그 변환을 정확히 찾는다", () => {
      const { points } = room(createRng(2));
      const dst = points.map((p) => apply(TRUE_T, p));
      const r = m.icpPointToPoint(points, dst, OPTS);
      const e = poseError(r.T, TRUE_T);
      expect(e.deg).toBeLessThan(1e-6);
      expect(e.trans).toBeLessThan(1e-6);
      expect(r.iterations).toBe(r.history.length);
      expect(r.rmse).toBe(r.history[r.history.length - 1]);
    });

    it("경계: maxDistance 밖의 이상치는 대응에서 빠진다", () => {
      const { points } = room(createRng(3));
      const dst = points.map((p) => apply(TRUE_T, p));
      const far = Array.from({ length: 30 }, (_, k): Vec3 => [30 + k, -20, 5]); // src 에만 있는 먼 점
      const r = m.icpPointToPoint([...points, ...far], dst, OPTS);
      expect(poseError(r.T, TRUE_T).deg).toBeLessThan(1e-6);
      expect(r.pairs).toBe(points.length);
      expect(r.rmse).toBeLessThan(1e-9); // RMSE 는 남은 짝만으로 잰다
    });

    it("경계: 거리가 maxDistance 와 정확히 같은 짝은 남긴다 (≤)", () => {
      const src: Vec3[] = [[0, 0, 0], [4, 0, 0], [0, 4, 0], [0, 0, 4]];
      const dst = src.map((p): Vec3 => [p[0] + 0.5, p[1], p[2]]);
      const r = m.icpPointToPoint(src, dst, { ...OPTS, maxDistance: 0.5 });
      expect(r.pairs).toBe(4);
      expect(Math.abs(r.T.t[0] - 0.5)).toBeLessThan(1e-12);
    });

    it("경계: maxIterations 1 이면 한 번만 돌고 수렴으로 치지 않는다, tolerance 0 이면 끝까지 돈다", () => {
      const { points } = room(createRng(15));
      const dst = points.map((p) => apply(TRUE_T, p));
      const one = m.icpPointToPoint(points, dst, { ...OPTS, maxIterations: 1 });
      expect(one.iterations).toBe(1);
      expect(one.converged).toBe(false);
      const all = m.icpPointToPoint(points, dst, { ...OPTS, maxIterations: 7, tolerance: 0 });
      expect(all.iterations).toBe(7);
      expect(all.converged).toBe(false);
    });

    it("경계: 빈 점군, NaN, 잘못된 설정, maxDistance 안 대응 3개 미만이면 예외", () => {
      const a: Vec3[] = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const b = a.map((p): Vec3 => [p[0] + 100, p[1], p[2]]);
      expect(() => m.icpPointToPoint([], a, OPTS)).toThrow();
      expect(() => m.icpPointToPoint(a, [[NaN, 0, 0]], OPTS)).toThrow();
      expect(() => m.icpPointToPoint(a, a, { ...OPTS, maxIterations: 0 })).toThrow();
      expect(() => m.icpPointToPoint(a, a, { ...OPTS, maxDistance: 0 })).toThrow();
      expect(() => m.icpPointToPoint(a, b, OPTS)).toThrow();
    });

    it("수치: 이상치를 버리지 않으면 RMSE 가 반복마다 줄거나 같다", () => {
      const { points } = room(createRng(4));
      const dst = points.map((p) => apply(TRUE_T, p));
      const r = m.icpPointToPoint(points, dst, { ...OPTS, maxDistance: 1e9 });
      for (let k = 1; k < r.history.length; k++) expect(r.history[k]!).toBeLessThanOrEqual(r.history[k - 1]! + 1e-12);
    });

    // 대응 규칙(최근접, 같은 거리면 앞 번호)과 정렬이 정해져 있어 규격대로 구현하면 같은 곳에 멈춘다
    it("수치: 크게 돈 경우 초기값이 없으면 엉뚱한 곳에 멈추고, 가까운 초기값을 주면 찾는다", () => {
      const { points } = room(createRng(6));
      const big: SE3 = { R: expSO3([0, 0, 1.3]), t: [0.5, 0.3, 0] }; // 약 74°
      const dst = points.map((p) => apply(big, p));
      const lost = m.icpPointToPoint(points, dst, { ...OPTS, maxDistance: 1e9 });
      expect(poseError(lost.T, big).deg > 1).toBe(true);
      const init: SE3 = { R: expSO3([0, 0, 1.2]), t: [0.4, 0.3, 0] };
      const found = m.icpPointToPoint(points, dst, { ...OPTS, init });
      expect(poseError(found.T, big).deg).toBeLessThan(1e-6);
    });

    it("수치: 같은 방을 따로 샘플링하면 대응이 근사라 오차가 조금 남는다 (잡음 없이도)", () => {
      const src = room(createRng(7)).points;
      const dst = room(createRng(8)).points.map((p) => apply(TRUE_T, p));
      const r = m.icpPointToPoint(src, dst, OPTS);
      const e = poseError(r.T, TRUE_T);
      expect(e.deg).toBeLessThan(3);
      expect(e.trans).toBeLessThan(0.2);
    });
  });

  describe("icpPointToPlane", () => {
    it("기본: 같은 점을 옮긴 dst 면 변환을 정확히 찾는다", () => {
      const scan = room(createRng(9));
      const dst = scan.points.map((p) => apply(TRUE_T, p));
      const normals = scan.normals.map((n) => mv(TRUE_T.R, n));
      const r = m.icpPointToPlane(scan.points, dst, normals, OPTS);
      const e = poseError(r.T, TRUE_T);
      expect(e.deg).toBeLessThan(1e-6);
      expect(e.trans).toBeLessThan(1e-6);
    });

    it("경계: 법선 길이가 1이 아니어도 같은 답 (안에서 정규화)", () => {
      const scan = room(createRng(16));
      const dst = scan.points.map((p) => apply(TRUE_T, p));
      const normals = scan.normals.map((n) => mv(TRUE_T.R, n)).map((n): Vec3 => [3 * n[0], 3 * n[1], 3 * n[2]]);
      const r = m.icpPointToPlane(scan.points, dst, normals, OPTS);
      expect(poseError(r.T, TRUE_T).trans).toBeLessThan(1e-6);
      expect(r.rmse).toBeLessThan(1e-9);
    });

    it("경계: 평면 하나뿐이면 (미끄러지는 방향) 예외, 법선 개수가 다르면 예외", () => {
      const floor = face(createRng(10), 100, [0, 0, 0], [5, 0, 0], [0, 5, 0], [0, 0, 1]);
      expect(() => m.icpPointToPlane(floor.points, floor.points, floor.normals, OPTS)).toThrow();
      const scan = room(createRng(11));
      expect(() => m.icpPointToPlane(scan.points, scan.points, scan.normals.slice(1), OPTS)).toThrow();
    });

    it("수치: 따로 샘플링한 방에서 점-평면이 점-점보다 훨씬 정확하다 (모서리의 엉뚱한 짝을 줄이려고 maxDistance 0.2)", () => {
      const src = room(createRng(12));
      const dstScan = room(createRng(13));
      const dst = dstScan.points.map((p) => apply(TRUE_T, p));
      const normals = dstScan.normals.map((n) => mv(TRUE_T.R, n));
      const near = { ...OPTS, maxDistance: 0.2 };
      const p2l = poseError(m.icpPointToPlane(src.points, dst, normals, near).T, TRUE_T);
      const p2p = poseError(refIcpPointToPoint(src.points, dst, near).T, TRUE_T);
      expect(p2l.trans).toBeLessThan(0.01);
      expect(p2l.trans * 5).toBeLessThan(p2p.trans);
    });
  });
});
