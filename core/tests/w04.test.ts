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

    it("경계: z ≤ 0 (카메라 뒤 또는 렌즈 평면 위)이면 null, 아주 작은 양수 Z는 값을 돌려준다, 입력을 바꾸지 않는다", () => {
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

// ---- 4b: 3DGS ----
// - 기대값은 테스트 안에서 정의대로 계산한다 (다른 손코딩 함수에 기대지 않는다).
// - projectCovariance는 ① 손으로 계산한 값 ② 핀홀 투영의 수치 야코비안 ③ 작은 가우시안에서 뽑은 점들의 표본 공분산, 세 가지와 비교한다.

type M2 = readonly [V2, V2];
type M3 = readonly [V3, V3, V3];

const NAN2: M2 = [
  [NaN, NaN],
  [NaN, NaN],
];
const I3: M3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
/** 레슨의 3-4-5 회전 (z축 둘레, cos = 0.6, sin = 0.8) */
const R345: M3 = [
  [0.6, -0.8, 0],
  [0.8, 0.6, 0],
  [0, 0, 1],
];
/** 축을 돌려 끼우는 회전 (det = +1): p_c = (y_w, z_w, x_w). R ≠ Rᵀ 라서 R과 Rᵀ를 바꿔 쓴 구현을 잡는다 */
const R_CYCLE: M3 = [
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 0],
];
/** 레슨 예시 카메라: f = 80. 주점은 공분산에 영향이 없다 */
const K80 = { fx: 80, fy: 80, cx: 0, cy: 0 };

const diff2 = (A: M2, B: M2) => Math.max(...A.flatMap((row, i) => row.map((v, j) => Math.abs(v - B[i][j]))));
const diff3 = (A: M3, B: M3) => Math.max(...A.flatMap((row, i) => row.map((v, j) => Math.abs(v - B[i][j]))));
const v3 = (a: readonly number[]): V3 => [a[0], a[1], a[2]];

function matVec3(A: M3, v: V3): V3 {
  return [A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2], A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2], A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]];
}

function matMul3(A: M3, B: M3): M3 {
  const e = (i: number, j: number) => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  return [
    [e(0, 0), e(0, 1), e(0, 2)],
    [e(1, 0), e(1, 1), e(1, 2)],
    [e(2, 0), e(2, 1), e(2, 2)],
  ];
}

function transpose3(A: M3): M3 {
  return [
    [A[0][0], A[1][0], A[2][0]],
    [A[0][1], A[1][1], A[2][1]],
    [A[0][2], A[1][2], A[2][2]],
  ];
}

/** 무작위 회전행렬 (단위 쿼터니언에서) */
function randomRotation(rng: Rng): M3 {
  const q = [rng() - 0.5, rng() - 0.5, rng() - 0.5, rng() - 0.5];
  const n = Math.hypot(...q) || 1;
  const [w, x, y, z] = q.map((v) => v / n);
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ];
}

function randomMat3(rng: Rng, scale: number): M3 {
  const r = () => randomIn(rng, -scale, scale);
  return [
    [r(), r(), r()],
    [r(), r(), r()],
    [r(), r(), r()],
  ];
}

/** 핀홀 투영 (정의대로, 테스트용) */
function pinhole(p: V3, k: { fx: number; fy: number; cx: number; cy: number }): V2 {
  return [(k.fx * p[0]) / p[2] + k.cx, (k.fy * p[1]) / p[2] + k.cy];
}

/** 2×3 행렬 J 로 J·S·Jᵀ */
function sandwich(J: readonly [V3, V3], S: M3): M2 {
  const e = (a: V3, b: V3) => {
    const Sb = matVec3(S, b);
    return a[0] * Sb[0] + a[1] * Sb[1] + a[2] * Sb[2];
  };
  return [
    [e(J[0], J[0]), e(J[0], J[1])],
    [e(J[1], J[0]), e(J[1], J[1])],
  ];
}

/** 표준정규 난수 (Box-Muller) */
function gaussian(rng: Rng): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

describe(IMPL, () => {
  describe("buildCovariance", () => {
    it("기본: R = I 이면 대각에 s², 레슨 예시 (3-4-5 회전, s = (2, 1, 1)) 는 왼쪽 위 블록이 [[2.08, 1.44], [1.44, 2.92]]", () => {
      const diag = m.buildCovariance([2, 3, 4], I3);
      expect(diff3(diag, [[4, 0, 0], [0, 9, 0], [0, 0, 16]])).toBeLessThan(TOL);
      const tilted = m.buildCovariance([2, 1, 1], R345);
      expect(diff3(tilted, [[2.08, 1.44, 0], [1.44, 2.92, 0], [0, 0, 1]])).toBeLessThan(TOL);
    });

    it("경계: 스케일 0 인 축은 납작해진다 (그 방향 분산 0), 음수 스케일은 양수와 같다, 입력을 바꾸지 않는다", () => {
      const flat = m.buildCovariance([2, 1, 0], R345);
      expect(Math.abs(flat[2][2])).toBeLessThan(TOL);
      expect(diff3(m.buildCovariance([-2, 1, -1], R345), m.buildCovariance([2, 1, 1], R345))).toBeLessThan(TOL);
      const s: V3 = [2, 1, 1];
      const R: M3 = [v3(R345[0]), v3(R345[1]), v3(R345[2])];
      m.buildCovariance(s, R);
      expect(s).toEqual([2, 1, 1]);
      expect(R).toEqual(R345);
    });

    it("수치: 무작위 R, s 100개 — 대칭이고, R의 k번째 열이 고유값 s_k² 의 고유벡터이고, xᵀΣx ≥ 0", () => {
      const rng = createRng(46);
      for (let i = 0; i < 100; i++) {
        const R = randomRotation(rng);
        const s: V3 = [randomIn(rng, 0.1, 3), randomIn(rng, 0.1, 3), randomIn(rng, 0.1, 3)];
        const S = m.buildCovariance(s, R);
        expect(diff3(S, transpose3(S))).toBeLessThan(1e-12);
        for (let k = 0; k < 3; k++) {
          const axis: V3 = [R[0][k], R[1][k], R[2][k]];
          expect(diff(matVec3(S, axis), axis.map((v) => v * s[k] * s[k]))).toBeLessThan(1e-9);
        }
        const x: V3 = [randomIn(rng, -1, 1), randomIn(rng, -1, 1), randomIn(rng, -1, 1)];
        const Sx = matVec3(S, x);
        expect(-(x[0] * Sx[0] + x[1] * Sx[1] + x[2] * Sx[2])).toBeLessThanOrEqual(1e-12);
      }
    });
  });

  describe("projectCovariance", () => {
    it("기본: 광축 위 (0, 0, 4), f = 80 에서 diag(4, 1, 1) 은 diag(1600, 400) (반지름 2 가 80·2/4 = 40 픽셀), 두 배 멀면 1/4", () => {
      const Sigma: M3 = [[4, 0, 0], [0, 1, 0], [0, 0, 1]];
      const near = m.projectCovariance(Sigma, I3, [0, 0, 4], K80);
      expect(near === null).toBe(false);
      expect(diff2(near ?? NAN2, [[1600, 0], [0, 400]])).toBeLessThan(TOL);
      const far = m.projectCovariance(Sigma, I3, [0, 0, 8], K80);
      expect(diff2(far ?? NAN2, [[400, 0], [0, 100]])).toBeLessThan(TOL);
    });

    it("기본: 광축 밖 — 구(Σ = I)가 (3, 0, 4) 에서 diag(625, 400), (1, 2, 4) 에서 [[425, 50], [50, 500]]", () => {
      // J = [[20, 0, −15], [0, 20, 0]]
      expect(diff2(m.projectCovariance(I3, I3, [3, 0, 4], K80) ?? NAN2, [[625, 0], [0, 400]])).toBeLessThan(TOL);
      // J = [[20, 0, −5], [0, 20, −10]]
      expect(diff2(m.projectCovariance(I3, I3, [1, 2, 4], K80) ?? NAN2, [[425, 50], [50, 500]])).toBeLessThan(TOL);
    });

    it("기본: 야코비안 셋째 열의 부호 — x와 z가 함께 변하는 Σ 는 (3, 0, 4) 에서 u 분산이 650 (부호가 반대면 1850)", () => {
      // 400·2 + 2·20·(−15)·1 + 225·2 = 650
      const S = m.projectCovariance([[2, 0, 1], [0, 1, 0], [1, 0, 2]], I3, [3, 0, 4], K80);
      expect(diff2(S ?? NAN2, [[650, 0], [0, 400]])).toBeLessThan(TOL);
    });

    it("기본: 월드 → 카메라는 R·Σ·Rᵀ (Rᵀ·Σ·R 이 아니다) — p_c = (y_w, z_w, x_w) 이면 diag(1, 4, 9) 가 카메라에서 diag(4, 9, 1)", () => {
      const S = m.projectCovariance([[1, 0, 0], [0, 4, 0], [0, 0, 9]], R_CYCLE, [0, 0, 4], K80);
      expect(diff2(S ?? NAN2, [[1600, 0], [0, 3600]])).toBeLessThan(TOL);
    });

    it("경계: z ≤ 0 이면 null, 주점 (cx, cy) 은 결과에 영향이 없다, fx 와 fy 를 따로 쓴다, 결과는 대칭, 입력을 바꾸지 않는다", () => {
      expect(m.projectCovariance(I3, I3, [1, 1, 0], K80)).toBe(null);
      expect(m.projectCovariance(I3, I3, [1, 1, -3], K80)).toBe(null);
      const a = m.projectCovariance(I3, I3, [1, 2, 4], K80) ?? NAN2;
      const b = m.projectCovariance(I3, I3, [1, 2, 4], { ...K80, cx: 320, cy: 240 }) ?? NAN2;
      expect(diff2(a, b)).toBeLessThan(TOL);
      // fx = 80, fy = 40: 광축 위 구는 diag(20², 10²)
      const aniso = m.projectCovariance(I3, I3, [0, 0, 4], { fx: 80, fy: 40, cx: 0, cy: 0 });
      expect(diff2(aniso ?? NAN2, [[400, 0], [0, 100]])).toBeLessThan(TOL);
      const sym = m.projectCovariance([[2, 0.3, 1], [0.3, 1, -0.2], [1, -0.2, 2]], R345, [1, 2, 4], K80) ?? NAN2;
      expect(Math.abs(sym[0][1] - sym[1][0])).toBeLessThan(1e-9);
      const Sigma: M3 = [[2, 0, 1], [0, 1, 0], [1, 0, 2]];
      const p: V3 = [3, 0, 4];
      m.projectCovariance(Sigma, R345, p, K80);
      expect(Sigma).toEqual([[2, 0, 1], [0, 1, 0], [1, 0, 2]]);
      expect(p).toEqual([3, 0, 4]);
    });

    it("수치: 핀홀 투영의 수치 야코비안(중앙 차분)으로 만든 J·(RΣRᵀ)·Jᵀ 와 같다 (무작위 100개)", () => {
      const rng = createRng(47);
      const k = { fx: 500, fy: 400, cx: 320, cy: 240 };
      const h = 1e-5;
      for (let i = 0; i < 100; i++) {
        const R = randomRotation(rng);
        const L = randomMat3(rng, 0.5);
        const Sigma = matMul3(L, transpose3(L));
        const p: V3 = [randomIn(rng, -2, 2), randomIn(rng, -2, 2), randomIn(rng, 2, 10)];
        // J 의 c 번째 열 = (π(p + h·e_c) − π(p − h·e_c)) / 2h
        const cols = [0, 1, 2].map((c) => {
          const e: V3 = [c === 0 ? h : 0, c === 1 ? h : 0, c === 2 ? h : 0];
          const plus = pinhole([p[0] + e[0], p[1] + e[1], p[2] + e[2]], k);
          const minus = pinhole([p[0] - e[0], p[1] - e[1], p[2] - e[2]], k);
          return [(plus[0] - minus[0]) / (2 * h), (plus[1] - minus[1]) / (2 * h)];
        });
        const J: readonly [V3, V3] = [
          [cols[0][0], cols[1][0], cols[2][0]],
          [cols[0][1], cols[1][1], cols[2][1]],
        ];
        const want = sandwich(J, matMul3(matMul3(R, Sigma), transpose3(R)));
        const got = m.projectCovariance(Sigma, R, p, k) ?? NAN2;
        const scale = Math.max(1, want[0][0] + want[1][1]);
        expect(diff2(got, want) / scale).toBeLessThan(1e-6);
      }
    });

    it("수치: 작은 가우시안에서 뽑은 점 20000개를 투영한 표본 공분산과 5% 안에서 같다 (선형화가 맞는 조건)", () => {
      const rng = createRng(48);
      const k = { fx: 500, fy: 400, cx: 320, cy: 240 };
      const R = randomRotation(rng);
      const t: V3 = [0.3, -0.2, 6];
      // 깊이 약 6 에 비해 아주 작은 가우시안 (축 길이 0.01 ~ 0.03). Σ = L·Lᵀ
      const L: M3 = [
        [0.03, 0, 0],
        [0.01, 0.02, 0],
        [-0.01, 0.005, 0.01],
      ];
      const Sigma = matMul3(L, transpose3(L));
      const mu: V3 = [0.5, 0.4, -0.3];
      const toCam = (x: V3): V3 => {
        const r = matVec3(R, x);
        return [r[0] + t[0], r[1] + t[1], r[2] + t[2]];
      };
      const N = 20000;
      const px: V2[] = [];
      for (let i = 0; i < N; i++) {
        const d = matVec3(L, [gaussian(rng), gaussian(rng), gaussian(rng)]);
        px.push(pinhole(toCam([mu[0] + d[0], mu[1] + d[1], mu[2] + d[2]]), k));
      }
      const meanU = px.reduce((s, p) => s + p[0], 0) / N;
      const meanV = px.reduce((s, p) => s + p[1], 0) / N;
      let suu = 0;
      let suv = 0;
      let svv = 0;
      for (const p of px) {
        const du = p[0] - meanU;
        const dv = p[1] - meanV;
        suu += du * du;
        suv += du * dv;
        svv += dv * dv;
      }
      const sample: M2 = [
        [suu / (N - 1), suv / (N - 1)],
        [suv / (N - 1), svv / (N - 1)],
      ];
      const got = m.projectCovariance(Sigma, R, toCam(mu), k) ?? NAN2;
      expect(diff2(got, sample) / (sample[0][0] + sample[1][1])).toBeLessThan(0.05);
    });
  });

  describe("gaussianWeight2D", () => {
    it("기본: 중심에서 1, Σ = diag(4, 1) 에서 (2, 0) 과 (0, 1) 은 e^(−1/2), (2, 1) 은 e^(−1), (4, 0) 은 e^(−2)", () => {
      const S: M2 = [[4, 0], [0, 1]];
      expect(Math.abs(m.gaussianWeight2D([0, 0], S) - 1)).toBeLessThan(TOL);
      expect(Math.abs(m.gaussianWeight2D([2, 0], S) - Math.exp(-0.5))).toBeLessThan(TOL);
      expect(Math.abs(m.gaussianWeight2D([0, 1], S) - Math.exp(-0.5))).toBeLessThan(TOL);
      expect(Math.abs(m.gaussianWeight2D([2, 1], S) - Math.exp(-1))).toBeLessThan(TOL);
      expect(Math.abs(m.gaussianWeight2D([4, 0], S) - Math.exp(-2))).toBeLessThan(TOL);
    });

    it("기본: 기울어진 타원 Σ = (1/25)[[52, 36], [36, 73]] — 긴 축 끝 (1.2, 1.6) 과 짧은 축 끝 (−0.8, 0.6) 이 모두 e^(−1/2)", () => {
      const S: M2 = [[2.08, 1.44], [1.44, 2.92]];
      expect(Math.abs(m.gaussianWeight2D([1.2, 1.6], S) - Math.exp(-0.5))).toBeLessThan(TOL);
      expect(Math.abs(m.gaussianWeight2D([-0.8, 0.6], S) - Math.exp(-0.5))).toBeLessThan(TOL);
      // 중심에서 똑같이 2 떨어져도 짧은 축 방향 (−1.6, 1.2) 은 2σ 라서 e^(−2)
      expect(Math.abs(m.gaussianWeight2D([-1.6, 1.2], S) - Math.exp(-2))).toBeLessThan(TOL);
    });

    it("경계: 행렬식이 0 이하(납작한 Σ, 공분산이 아닌 Σ)면 0, 아주 멀면 0 에 가깝고 음수가 아니다, d 와 −d 는 같다, 입력을 바꾸지 않는다", () => {
      expect(m.gaussianWeight2D([0.5, 0.5], [[1, 1], [1, 1]])).toBe(0);
      expect(m.gaussianWeight2D([0.5, 0.5], [[0, 0], [0, 0]])).toBe(0);
      // det = 1 − 4 = −3: 고유값이 3 과 −1 이라 공분산이 아니다. det === 0 만 막으면 ≈ 0.92 가 나온다
      expect(m.gaussianWeight2D([0.5, 0.5], [[1, 2], [2, 1]])).toBe(0);
      const S: M2 = [[4, 0], [0, 1]];
      const far = m.gaussianWeight2D([1000, 1000], S);
      expect(far).toBeLessThan(1e-12);
      expect(-far).toBeLessThanOrEqual(0);
      expect(Math.abs(m.gaussianWeight2D([1.3, -0.7], S) - m.gaussianWeight2D([-1.3, 0.7], S))).toBeLessThan(TOL);
      const d: V2 = [2, 1];
      m.gaussianWeight2D(d, S);
      expect(d).toEqual([2, 1]);
      expect(S).toEqual([[4, 0], [0, 1]]);
    });

    it("수치: 무작위 Σ = L·Lᵀ 100개 — d = L·u (|u| = 1) 는 늘 e^(−1/2), 임의의 d 는 exp(−½ dᵀΣ⁻¹d) (Σx = d 를 직접 풀어 비교)", () => {
      const rng = createRng(49);
      for (let i = 0; i < 100; i++) {
        const l11 = randomIn(rng, 0.3, 3);
        const l21 = randomIn(rng, -2, 2);
        const l22 = randomIn(rng, 0.3, 3);
        const S: M2 = [
          [l11 * l11, l11 * l21],
          [l11 * l21, l21 * l21 + l22 * l22],
        ];
        const a = rng() * 2 * Math.PI;
        const u: V2 = [Math.cos(a), Math.sin(a)];
        expect(Math.abs(m.gaussianWeight2D([l11 * u[0], l21 * u[0] + l22 * u[1]], S) - Math.exp(-0.5))).toBeLessThan(1e-9);

        const d: V2 = [randomIn(rng, -3, 3), randomIn(rng, -3, 3)];
        // 크라메르 공식으로 Σx = d 를 푼다
        const det = S[0][0] * S[1][1] - S[0][1] * S[1][0];
        const x: V2 = [(d[0] * S[1][1] - S[0][1] * d[1]) / det, (S[0][0] * d[1] - S[1][0] * d[0]) / det];
        expect(Math.abs(m.gaussianWeight2D(d, S) - Math.exp(-0.5 * (d[0] * x[0] + d[1] * x[1])))).toBeLessThan(1e-9);
      }
    });
  });

  describe("alphaComposite", () => {
    const RED: V3 = [1, 0, 0];
    const GREEN: V3 = [0, 1, 0];
    const BLUE: V3 = [0, 0, 1];

    it("기본: 레슨 예시 α = (0.5, 0.5, 1) 은 색 (0.5, 0.25, 0.25), 남은 T = 0 / α = (0.2, 0.5, 0.5) 는 (0.2, 0.4, 0.2), T = 0.2", () => {
      const a = m.alphaComposite([RED, GREEN, BLUE], [0.5, 0.5, 1]);
      expect(diff(a.color, [0.5, 0.25, 0.25])).toBeLessThan(TOL);
      expect(Math.abs(a.transmittance)).toBeLessThan(TOL);
      const b = m.alphaComposite([RED, GREEN, BLUE], [0.2, 0.5, 0.5]);
      expect(diff(b.color, [0.2, 0.4, 0.2])).toBeLessThan(TOL);
      expect(Math.abs(b.transmittance - 0.2)).toBeLessThan(TOL);
    });

    it("기본: 순서가 결과를 바꾼다 — 불투명한 것이 맨 앞이면 뒤는 안 보인다", () => {
      const a = m.alphaComposite([BLUE, RED, GREEN], [1, 0.5, 0.5]);
      expect(diff(a.color, [0, 0, 1])).toBeLessThan(TOL);
      expect(Math.abs(a.transmittance)).toBeLessThan(TOL);
    });

    it("경계: 빈 목록은 색 (0, 0, 0), T = 1 / α = 0 인 가우시안은 아무것도 바꾸지 않는다 / 길이가 다르면 예외 / 입력을 바꾸지 않는다", () => {
      const empty = m.alphaComposite([], []);
      expect(diff(empty.color, [0, 0, 0])).toBeLessThan(TOL);
      expect(Math.abs(empty.transmittance - 1)).toBeLessThan(TOL);
      const withZero = m.alphaComposite([RED, GREEN, BLUE], [0.5, 0, 0.5]);
      const without = m.alphaComposite([RED, BLUE], [0.5, 0.5]);
      expect(diff(withZero.color, without.color)).toBeLessThan(TOL);
      expect(Math.abs(withZero.transmittance - without.transmittance)).toBeLessThan(TOL);
      expect(() => m.alphaComposite([RED, GREEN], [0.5])).toThrow();
      expect(() => m.alphaComposite([RED], [0.5, 0.5])).toThrow();
      const colors: V3[] = [
        [1, 0.5, 0.25],
        [0.2, 0.4, 0.6],
      ];
      const alphas = [0.3, 0.7];
      m.alphaComposite(colors, alphas);
      expect(colors).toEqual([[1, 0.5, 0.25], [0.2, 0.4, 0.6]]);
      expect(alphas).toEqual([0.3, 0.7]);
    });

    it("수치: 뒤에서부터 over 연산을 거듭한 것과 같고, T = Π(1 − α), 모두 흰색이면 색 = 1 − T (무작위 100개)", () => {
      const rng = createRng(50);
      for (let i = 0; i < 100; i++) {
        const n = 1 + Math.floor(rng() * 12);
        const colors: V3[] = [];
        const alphas: number[] = [];
        for (let j = 0; j < n; j++) {
          colors.push([rng(), rng(), rng()]);
          alphas.push(rng());
        }
        // 뒤에서 앞으로: C ← α·c + (1 − α)·C
        let over: V3 = [0, 0, 0];
        let T = 1;
        for (let j = n - 1; j >= 0; j--) {
          const a = alphas[j];
          over = [a * colors[j][0] + (1 - a) * over[0], a * colors[j][1] + (1 - a) * over[1], a * colors[j][2] + (1 - a) * over[2]];
          T *= 1 - a;
        }
        const got = m.alphaComposite(colors, alphas);
        expect(diff(got.color, over)).toBeLessThan(1e-12);
        expect(Math.abs(got.transmittance - T)).toBeLessThan(1e-12);
        const white = m.alphaComposite(colors.map((): V3 => [1, 1, 1]), alphas);
        expect(diff(white.color, [1 - T, 1 - T, 1 - T])).toBeLessThan(1e-12);
      }
    });
  });
});
