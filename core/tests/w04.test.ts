/**
 * 4주차 테스트. 제목 구조는 강제 규칙이다 (LESSON_TEMPLATE §4):
 *   describe(구현) > describe("<함수명>") > it("기본|경계|수치: …")
 * - project·distort는 손으로 계산한 값과 성질(스케일 불변, 회전 대칭, 계수에 대한 선형성)로 검사한다.
 * - 읽기만 함수(undistort)는 정답 distort로 왕복을 검사한다. 내 distort가 TODO여도 undistort 테스트가 깨지지 않게 하기 위함이다.
 */
import { describe, expect, it } from "vitest";
import { distort as refDistort } from "../reference/w04";
import { IMPL, loadImpl } from "./loadImpl";
import { createRng, type Rng } from "./rng";

type W04 = typeof import("../reference/w04");
type V2 = readonly [number, number];
type V3 = readonly [number, number, number];
type Brown = { k1: number; k2: number; p1: number; p2: number; k3: number };
type Fisheye = readonly [number, number, number, number];

const m = await loadImpl<W04>("w04");

const TOL = 1e-9;
const K = { fx: 500, fy: 400, cx: 320, cy: 240 };
const NO_DISTORTION: Brown = { k1: 0, k2: 0, p1: 0, p2: 0, k3: 0 };
/** 흔한 광각 렌즈 정도의 왜곡 (OpenCV 예제 수준) */
const REALISTIC: Brown = { k1: -0.28, k2: 0.07, p1: 1e-3, p2: -5e-4, k3: 0.01 };
/** JetBot 160° 카메라 정도의 어안 내부 파라미터 (820×616, 반각 80°가 화면 가장자리) */
const FISHEYE_K = { fx: 290, fy: 291, cx: 410, cy: 308 };
const FISHEYE_D: Fisheye = [0.02, -0.01, 0.004, -0.0008];

const diff = (a: readonly number[], b: readonly number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

function randomIn(rng: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * rng();
}

/** 반지름 maxR 안의 무작위 정규화 평면 점 */
function randomNormalized(rng: Rng, maxR: number): V2 {
  const r = maxR * Math.sqrt(rng());
  const a = rng() * 2 * Math.PI;
  return [r * Math.cos(a), r * Math.sin(a)];
}

function rotate2(p: V2, a: number): V2 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c * p[0] - s * p[1], s * p[0] + c * p[1]];
}

/** 어안(Kannala-Brandt) 투영: 방향 벡터 → 픽셀 (테스트용, 정의대로) */
function projectFisheye(b: V3, k: Fisheye): V2 {
  const rxy = Math.hypot(b[0], b[1]);
  const th = Math.atan2(rxy, b[2]);
  const th2 = th * th;
  const thd = th * (1 + k[0] * th2 + k[1] * th2 ** 2 + k[2] * th2 ** 3 + k[3] * th2 ** 4);
  const s = rxy === 0 ? 0 : thd / rxy;
  return [FISHEYE_K.fx * b[0] * s + FISHEYE_K.cx, FISHEYE_K.fy * b[1] * s + FISHEYE_K.cy];
}

/** 광축과 angle(라디안)을 이루는 무작위 단위 방향 */
function bearingAt(rng: Rng, angle: number): V3 {
  const az = rng() * 2 * Math.PI;
  return [Math.sin(angle) * Math.cos(az), Math.sin(angle) * Math.sin(az), Math.cos(angle)];
}

describe(IMPL, () => {
  describe("project", () => {
    it("기본: 광축 위의 점은 주점 (cx, cy)으로, [1, 2, 4]는 [445, 440]으로 간다", () => {
      expect(diff(m.project([0, 0, 3], K) ?? [NaN, NaN], [320, 240])).toBeLessThan(TOL);
      expect(diff(m.project([1, 2, 4], K) ?? [NaN, NaN], [445, 440])).toBeLessThan(TOL);
    });

    it("경계: Z ≤ 0 (카메라 뒤 또는 렌즈 평면 위)이면 null, 아주 작은 양수 Z는 값을 돌려준다, 입력을 바꾸지 않는다", () => {
      expect(m.project([1, 1, 0], K)).toBe(null);
      expect(m.project([1, 1, -2], K)).toBe(null);
      // 카메라 바로 앞의 점: 픽셀이 아주 커도 null이 아니라 계산된 값 (이미지 밖인지는 호출하는 쪽이 판단)
      const near = m.project([1e-9, 0, 1e-9], K);
      expect(near === null).toBe(false);
      expect(diff(near ?? [NaN, NaN], [320 + 500, 240])).toBeLessThan(1e-6);
      const p: V3 = [0.5, -0.5, 2];
      m.project(p, K);
      expect(p).toEqual([0.5, -0.5, 2]);
    });

    it("수치: 같은 광선 위의 점은 같은 픽셀 (스케일 불변), 픽셀을 깊이로 되돌리면 원래 점 (무작위 100개)", () => {
      const rng = createRng(41);
      for (let i = 0; i < 100; i++) {
        const u = randomIn(rng, 0, 640);
        const v = randomIn(rng, 0, 480);
        const Z = randomIn(rng, 0.2, 30);
        const P: V3 = [((u - K.cx) / K.fx) * Z, ((v - K.cy) / K.fy) * Z, Z];
        expect(diff(m.project(P, K) ?? [NaN, NaN], [u, v])).toBeLessThan(1e-8);
        const s = randomIn(rng, 0.1, 10);
        expect(diff(m.project([P[0] * s, P[1] * s, P[2] * s], K) ?? [NaN, NaN], [u, v])).toBeLessThan(1e-8);
      }
    });
  });

  describe("distort", () => {
    it("기본: 계수 하나씩 — k1, k2, k3는 반지름 방향으로 늘리고, p1, p2는 정해진 방향으로 민다", () => {
      const only = (d: Partial<Brown>): Brown => ({ ...NO_DISTORTION, ...d });
      // r² = 0.25 → 1 + 0.1·0.25 = 1.025
      expect(diff(m.distort([0.5, 0], only({ k1: 0.1 })), [0.5125, 0])).toBeLessThan(TOL);
      // r⁴ = 0.0625 → 1 + 0.1·0.0625
      expect(diff(m.distort([0.5, 0], only({ k2: 0.1 })), [0.503125, 0])).toBeLessThan(TOL);
      // r⁶ = 0.015625 → 1 + 0.1·0.015625
      expect(diff(m.distort([0.5, 0], only({ k3: 0.1 })), [0.50078125, 0])).toBeLessThan(TOL);
      // x = 0.2, y = 0.1, r² = 0.05: p1 → [2p1xy, p1(r² + 2y²)], p2 → [p2(r² + 2x²), 2p2xy]
      expect(diff(m.distort([0.2, 0.1], only({ p1: 0.01 })), [0.2004, 0.1007])).toBeLessThan(TOL);
      expect(diff(m.distort([0.2, 0.1], only({ p2: 0.01 })), [0.2013, 0.1004])).toBeLessThan(TOL);
    });

    it("경계: 계수가 모두 0이면 그대로, 원점은 어떤 계수로도 원점, 입력을 바꾸지 않는다", () => {
      expect(diff(m.distort([0.31, -0.42], NO_DISTORTION), [0.31, -0.42])).toBeLessThan(TOL);
      expect(diff(m.distort([0, 0], REALISTIC), [0, 0])).toBeLessThan(TOL);
      const x: V2 = [0.3, 0.2];
      const d = { ...REALISTIC };
      m.distort(x, d);
      expect(x).toEqual([0.3, 0.2]);
      expect(d).toEqual(REALISTIC);
    });

    it("수치: 방사 왜곡은 회전 대칭, 접선 왜곡은 p1·p2에 선형, 둘은 더해진다 (무작위 100개)", () => {
      const rng = createRng(42);
      for (let i = 0; i < 100; i++) {
        const x = randomNormalized(rng, 0.8);
        const radial: Brown = { k1: randomIn(rng, -0.4, 0.4), k2: randomIn(rng, -0.2, 0.2), p1: 0, p2: 0, k3: randomIn(rng, -0.05, 0.05) };
        const a = rng() * 2 * Math.PI;
        // 돌린 뒤 왜곡 = 왜곡한 뒤 돌리기
        expect(diff(m.distort(rotate2(x, a), radial), rotate2(m.distort(x, radial), a))).toBeLessThan(1e-12);

        const p1 = randomIn(rng, -0.01, 0.01);
        const p2 = randomIn(rng, -0.01, 0.01);
        const tang1 = m.distort(x, { ...NO_DISTORTION, p1, p2 });
        const tang2 = m.distort(x, { ...NO_DISTORTION, p1: 2 * p1, p2: 2 * p2 });
        // 계수를 두 배 하면 이동량도 두 배
        expect(diff([tang2[0] - x[0], tang2[1] - x[1]], [2 * (tang1[0] - x[0]), 2 * (tang1[1] - x[1])])).toBeLessThan(1e-12);

        // 방사 + 접선 = 방사만 + 접선만 - 원래 점
        const both = m.distort(x, { ...radial, p1, p2 });
        const r = m.distort(x, radial);
        expect(diff(both, [r[0] + tang1[0] - x[0], r[1] + tang1[1] - x[1]])).toBeLessThan(1e-12);
      }
    });
  });

  describe("undistort", () => {
    it("기본: 왜곡이 없으면 그대로, 있으면 distort의 역", () => {
      expect(diff(m.undistort([0.31, -0.42], NO_DISTORTION), [0.31, -0.42])).toBeLessThan(TOL);
      const x: V2 = [0.3, -0.2];
      expect(diff(m.undistort(refDistort(x, REALISTIC), REALISTIC), x)).toBeLessThan(TOL);
    });

    it("경계: 원점은 원점, 입력을 바꾸지 않는다", () => {
      expect(diff(m.undistort([0, 0], REALISTIC), [0, 0])).toBeLessThan(TOL);
      const xd: V2 = [0.25, 0.1];
      m.undistort(xd, REALISTIC);
      expect(xd).toEqual([0.25, 0.1]);
    });

    it("수치: 반지름 0.6 안의 무작위 200개에서 distort(undistort(x)) = x, undistort(distort(x)) = x", () => {
      const rng = createRng(43);
      for (let i = 0; i < 200; i++) {
        const x = randomNormalized(rng, 0.6);
        expect(diff(m.undistort(refDistort(x, REALISTIC), REALISTIC), x)).toBeLessThan(1e-9);
        expect(diff(refDistort(m.undistort(x, REALISTIC), REALISTIC), x)).toBeLessThan(1e-10);
      }
    });
  });

  describe("unprojectFisheye", () => {
    it("기본: 주점은 광축 [0,0,1], 왜곡 0이면 주점에서 fx·θ 떨어진 픽셀은 광축과 θ를 이룬다", () => {
      expect(diff(m.unprojectFisheye([FISHEYE_K.cx, FISHEYE_K.cy], FISHEYE_K, FISHEYE_D), [0, 0, 1])).toBeLessThan(TOL);
      const th = 0.5;
      const b = m.unprojectFisheye([FISHEYE_K.cx + FISHEYE_K.fx * th, FISHEYE_K.cy], FISHEYE_K, [0, 0, 0, 0]);
      expect(diff(b, [Math.sin(th), 0, Math.cos(th)])).toBeLessThan(TOL);
    });

    it("경계: 화면 가장자리(광축과 80°, 85°)에서도 방향을 되찾고, 결과는 단위 벡터, 입력을 바꾸지 않는다", () => {
      const px: V2 = [500, 100];
      const kCopy = [...FISHEYE_D];
      m.unprojectFisheye(px, FISHEYE_K, FISHEYE_D);
      expect(px).toEqual([500, 100]);
      expect([...FISHEYE_D]).toEqual(kCopy);

      const rng = createRng(44);
      for (const deg of [80, 85]) {
        const truth = bearingAt(rng, (deg * Math.PI) / 180);
        const b = m.unprojectFisheye(projectFisheye(truth, FISHEYE_D), FISHEYE_K, FISHEYE_D);
        expect(Math.hypot(...b)).toBeCloseTo(1, 12);
        expect(diff(b, truth)).toBeLessThan(1e-9);
      }
    });

    it("수치: 광축과 0~80°인 무작위 방향 200개를 픽셀로 보냈다가 되돌리면 같은 방향", () => {
      const rng = createRng(45);
      for (let i = 0; i < 200; i++) {
        const truth = bearingAt(rng, rng() * ((80 * Math.PI) / 180));
        expect(diff(m.unprojectFisheye(projectFisheye(truth, FISHEYE_D), FISHEYE_K, FISHEYE_D), truth)).toBeLessThan(1e-9);
      }
    });
  });
});
