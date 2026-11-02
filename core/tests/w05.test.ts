/**
 * 5주차 테스트. 제목 구조는 강제 규칙이다 (LESSON_TEMPLATE §4):
 *   describe(구현) > describe("<함수명>") > it("기본|경계|수치: …")
 * - 기대 F는 테스트 안에서 정의대로 만든다: F = K⁻ᵀ [t]× R K⁻¹ (손코딩 함수끼리 서로 검증하지 않는다).
 * - F는 부호·크기가 정해지지 않으므로 ‖F‖ = 1로 맞춘 뒤 ± 중 가까운 쪽으로 비교한다.
 * - ransac은 F와 무관한 직선 맞추기로 검사한다 (eightPoint가 TODO여도 ransac 테스트가 돌게).
 */
import { Matrix, SingularValueDecomposition, inverse } from "ml-matrix";
import { describe, expect, it } from "vitest";
import { IMPL, loadImpl } from "./loadImpl";
import { createRng, type Rng } from "./rng";

type W05 = typeof import("../reference/w05");
type V2 = readonly [number, number];
type V3 = readonly [number, number, number];
type M3 = readonly [V3, V3, V3];

const m = await loadImpl<W05>("w05");

// ---- 테스트용 도우미 ----

const K: M3 = [
  [500, 0, 320],
  [0, 500, 240],
  [0, 0, 1],
];

function toMatrix(A: readonly (readonly number[])[]): Matrix {
  return new Matrix(A.map((r) => [...r]));
}

function toM3(A: Matrix): M3 {
  const r = (i: number): V3 => [A.get(i, 0), A.get(i, 1), A.get(i, 2)];
  return [r(0), r(1), r(2)];
}

function skewOf(t: V3): M3 {
  return [
    [0, -t[2], t[1]],
    [t[2], 0, -t[0]],
    [-t[1], t[0], 0],
  ];
}

/** 축-각 → 회전행렬 (로드리게스, 테스트 안에서 직접) */
function rotation(axis: V3, angle: number): M3 {
  const n = Math.hypot(...axis);
  const a: V3 = [axis[0] / n, axis[1] / n, axis[2] / n];
  const S = toMatrix(skewOf(a));
  const R = Matrix.eye(3).add(S.clone().mul(Math.sin(angle))).add(S.mmul(S).mul(1 - Math.cos(angle)));
  return toM3(R);
}

function frob(A: readonly (readonly number[])[]): number {
  return Math.hypot(...A.flat());
}

/** ‖·‖ = 1로 맞춘 뒤 A와 ±B 중 가까운 쪽의 원소별 최대 차이 */
function signFreeDiff(A: readonly (readonly number[])[], B: readonly (readonly number[])[]): number {
  const na = frob(A);
  const nb = frob(B);
  const d = (s: number) => Math.max(...A.flatMap((row, i) => row.map((v, j) => Math.abs(v / na - (s * B[i][j]) / nb))));
  return Math.min(d(1), d(-1));
}

interface TwoView {
  F: M3;
  x1: V2[];
  x2: V2[];
}

/** 큰 이미지 카메라 (8000×6000, f = 5000): 픽셀 값이 수천이라 좌표 정규화가 없으면 크게 틀어진다 */
const K_BIG: M3 = [
  [5000, 0, 4000],
  [0, 5000, 3000],
  [0, 0, 1],
];

/** 카메라 1은 원점, 카메라 2는 p2 = R p1 + t. 두 카메라 앞에 있는 점만 쓴다 */
function twoView(rng: Rng, n: number, noisePx = 0, cam: M3 = K, rotate = true): TwoView {
  // rotate = false: 옆으로만 미는 움직임 (스테레오, JetBot 실습). 이때 좌표 크기 맞추기가 빠지면 크게 틀어진다
  const R = rotate ? rotation([rng() - 0.5, rng() - 0.5, rng() - 0.5], 0.05 + 0.2 * rng()) : toM3(Matrix.eye(3));
  const t: V3 = [0.5 + rng(), (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.4];
  const Kinv = inverse(toMatrix(cam));
  const F = toM3(Kinv.transpose().mmul(toMatrix(skewOf(t))).mmul(toMatrix(R)).mmul(Kinv));
  const [f, cx, cy] = [cam[0][0], cam[0][2], cam[1][2]];
  const project = (p: V3): V2 => [(f * p[0]) / p[2] + cx + (rng() - 0.5) * 2 * noisePx, (f * p[1]) / p[2] + cy + (rng() - 0.5) * 2 * noisePx];
  const x1: V2[] = [];
  const x2: V2[] = [];
  while (x1.length < n) {
    const p: V3 = [(rng() - 0.5) * 6, (rng() - 0.5) * 4, 4 + rng() * 8];
    const q: V3 = [
      R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2] + t[0],
      R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2] + t[1],
      R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2] + t[2],
    ];
    if (q[2] <= 0.5) continue;
    x1.push(project(p));
    x2.push(project(q));
  }
  return { F, x1, x2 };
}

/** 점 b에서 에피폴라선 F a까지의 거리 (픽셀) */
function lineDistance(F: readonly (readonly number[])[], a: V2, b: V2): number {
  const l = [0, 1, 2].map((i) => F[i][0] * a[0] + F[i][1] * a[1] + F[i][2]);
  return Math.abs(l[0] * b[0] + l[1] * b[1] + l[2]) / Math.hypot(l[0], l[1]);
}

function singularValues(A: readonly (readonly number[])[]): number[] {
  return new SingularValueDecomposition(toMatrix(A)).diagonal;
}

// 직선 y = a x + b 맞추기 (ransac 테스트용): 점 두 개로 모델, 오차는 세로 거리
type Pt = readonly [number, number];
interface Line {
  a: number;
  b: number;
}
const fitLine = (s: readonly Pt[]): Line | null => {
  const [p, q] = s;
  if (Math.abs(q[0] - p[0]) < 1e-12) return null; // 세로로 겹친 표본은 기울기를 못 구한다
  const a = (q[1] - p[1]) / (q[0] - p[0]);
  return { a, b: p[1] - a * p[0] };
};
const lineError = (L: Line, p: Pt): number => Math.abs(L.a * p[0] + L.b - p[1]);

/** y = 2x + 1 위의 inlier n개(작은 잡음) + 무작위 outlier k개, 섞어서 */
function lineData(rng: Rng, n: number, k: number): { items: Pt[]; isInlier: boolean[] } {
  const all: { p: Pt; inl: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    const x = rng() * 10 - 5;
    all.push({ p: [x, 2 * x + 1 + (rng() - 0.5) * 0.01], inl: true });
  }
  for (let i = 0; i < k; i++) all.push({ p: [rng() * 10 - 5, rng() * 40 - 20], inl: false });
  // 섞기 (Fisher-Yates)
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  return { items: all.map((e) => e.p), isInlier: all.map((e) => e.inl) };
}

describe(IMPL, () => {
  describe("epipolarLine", () => {
    it("기본: 옆(x축)으로만 움직인 카메라(F = [t]×, t = x축 방향)에서 점 (0.3, 0.2)의 에피폴라선은 수평선 y = 0.2", () => {
      const F: M3 = [
        [0, 0, 0],
        [0, 0, -1],
        [0, 1, 0],
      ];
      const l = m.epipolarLine(F, [0.3, 0.2]);
      expect(l).toHaveLength(3);
      // a·u + b·v + c = 0 이 y = 0.2 → [0, ±1, ∓0.2]
      expect(Math.abs(l[0])).toBeLessThan(1e-12);
      expect(Math.abs(l[1])).toBeCloseTo(1, 12);
      expect(l[2] / l[1]).toBeCloseTo(-0.2, 12);
    });

    it("경계: 결과는 a² + b² = 1로 정규화, F에 상수를 곱해도 같은 직선, 선이 정해지지 않으면(F·x의 a, b가 0) 예외", () => {
      const rng = createRng(51);
      const { F } = twoView(rng, 1);
      const l1 = m.epipolarLine(F, [100, 50]);
      expect(Math.hypot(l1[0], l1[1])).toBeCloseTo(1, 12);
      const F3 = F.map((r) => r.map((v) => -3 * v)) as unknown as M3;
      const l2 = m.epipolarLine(F3, [100, 50]);
      expect(signFreeDiff([l1], [l2])).toBeLessThan(1e-12);
      const zero: M3 = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 1],
      ];
      expect(() => m.epipolarLine(zero, [1, 1])).toThrow();
    });

    it("수치: 무작위 두 시점 장면 50개 대응점에서 짝 점까지의 거리 < 1e-8 픽셀", () => {
      const rng = createRng(52);
      const { F, x1, x2 } = twoView(rng, 50);
      x1.forEach((a, i) => {
        const l = m.epipolarLine(F, a);
        const b = x2[i]!;
        expect(Math.abs(l[0] * b[0] + l[1] * b[1] + l[2])).toBeLessThan(1e-8);
      });
    });
  });

  describe("eightPoint", () => {
    it("기본: 잡음 없는 대응점 8개로 진짜 F를 (부호·크기 빼고) 되찾는다", () => {
      const rng = createRng(53);
      const { F, x1, x2 } = twoView(rng, 8);
      const est = m.eightPoint(x1, x2);
      expect(est).toHaveLength(3);
      expect(signFreeDiff(est, F)).toBeLessThan(1e-6);
    });

    it("경계: 결과는 랭크 2이고 ‖F‖ = 1, 점이 8개보다 적거나 개수가 다르면 예외, 입력을 바꾸지 않는다", () => {
      const rng = createRng(54);
      const { x1, x2 } = twoView(rng, 30, 1);
      const copy1 = JSON.stringify(x1);
      const est = m.eightPoint(x1, x2);
      const s = singularValues(est);
      expect(s[2]! / s[0]!).toBeLessThan(1e-12);
      expect(frob(est)).toBeCloseTo(1, 12);
      expect(JSON.stringify(x1)).toBe(copy1);
      expect(() => m.eightPoint(x1.slice(0, 7), x2.slice(0, 7))).toThrow();
      // 길이가 다르면 어느 쪽이 길든 예외 (짧은 쪽을 기준으로 조용히 계산하면 안 된다)
      expect(() => m.eightPoint(x1.slice(0, 10), x2.slice(0, 9))).toThrow();
      expect(() => m.eightPoint(x1.slice(0, 9), x2.slice(0, 10))).toThrow();
    });

    it("수치: 픽셀 잡음 ±0.5인 100개 대응점에서 평균 에피폴라 거리 < 0.5px, 잡음이 없으면 < 1e-6px", () => {
      for (const seed of [55, 56, 57]) {
        const noisy = twoView(createRng(seed), 100, 0.5);
        const est = m.eightPoint(noisy.x1, noisy.x2);
        const mean = noisy.x1.reduce((s, a, i) => s + lineDistance(est, a, noisy.x2[i]!), 0) / noisy.x1.length;
        expect(mean).toBeLessThan(0.5);
      }
      const clean = twoView(createRng(60), 100);
      const exact = m.eightPoint(clean.x1, clean.x2);
      const worst = Math.max(...clean.x1.map((a, i) => lineDistance(exact, a, clean.x2[i]!)));
      expect(worst).toBeLessThan(1e-6);
      // 큰 이미지(8000×6000, 잡음 ±5px)에서 옆으로만 민 경우: 중심 이동과 크기 맞추기(평균 거리 √2)가 둘 다 있어야
      // 평균 거리가 잡음 수준(약 3px)에 머문다. 크기 맞추기를 빼면 수십~수백 px로 틀어진다
      for (const seed of [61, 63, 65]) {
        const big = twoView(createRng(seed), 100, 5, K_BIG, false);
        const est = m.eightPoint(big.x1, big.x2);
        const mean = big.x1.reduce((s, a, i) => s + lineDistance(est, a, big.x2[i]!), 0) / big.x1.length;
        expect(mean).toBeLessThan(5);
      }
    });
  });

  describe("ransac", () => {
    it("기본: 직선 위 100점 + 아웃라이어 30점에서 inlier 100개를 정확히 찾는다", () => {
      const rng = createRng(58);
      const { items, isInlier } = lineData(rng, 100, 30);
      const r = m.ransac(items, { sampleSize: 2, fit: fitLine, error: lineError, threshold: 0.05, iterations: 100, rng: createRng(1) });
      expect(r === null).toBe(false);
      const found = new Set(r?.inliers ?? []);
      expect(found.size).toBe(100);
      expect(isInlier.every((inl, i) => inl === found.has(i))).toBe(true);
      expect(Math.abs((r?.model.a ?? 0) - 2)).toBeLessThan(0.01);
    });

    it("경계: inlier 번호는 오름차순, 표본이 데이터보다 크거나 반복 0번이면 null, 퇴화 표본(fit → null)은 건너뛴다, 입력을 바꾸지 않는다", () => {
      const rng = createRng(59);
      const { items } = lineData(rng, 40, 10);
      const copy = JSON.stringify(items);
      const r = m.ransac(items, { sampleSize: 2, fit: fitLine, error: lineError, threshold: 0.05, iterations: 50, rng: createRng(2) });
      const idx = r?.inliers ?? [];
      expect(idx.length).toBeLessThanOrEqual(50);
      expect(idx.every((v, i) => i === 0 || idx[i - 1]! < v)).toBe(true);
      expect(JSON.stringify(items)).toBe(copy);
      const opts = { sampleSize: 2, fit: fitLine, error: lineError, threshold: 0.05, rng: createRng(3) };
      expect(m.ransac(items.slice(0, 1), { ...opts, iterations: 50 })).toBe(null);
      expect(m.ransac(items, { ...opts, iterations: 0 })).toBe(null);
      // x가 모두 같은 점들: 모든 표본이 퇴화 → 모델 없음
      const vertical: Pt[] = Array.from({ length: 10 }, (_, i) => [1, i]);
      expect(m.ransac(vertical, { ...opts, iterations: 30 })).toBe(null);
    });

    it("경계: 표본은 중복 없이 뽑고 fit은 정확히 iterations번, 같은 시드면 같은 결과, 오차가 기준과 같으면 inlier가 아니다, 동점이면 먼저 찾은 모델", () => {
      const items = Array.from({ length: 12 }, (_, i) => i);
      let calls = 0;
      let duplicated = 0;
      let first: string | null = null;
      // 모델 = 표본(정렬해 문자열로). 오차는 모델과 무관하게 x % 3 → 모든 모델의 inlier 수가 같다(동점)
      const fit = (s: readonly number[]): string => {
        calls++;
        if (new Set(s).size !== s.length) duplicated++;
        const model = [...s].sort((a, b) => a - b).join(",");
        first ??= model;
        return model;
      };
      const opts = { sampleSize: 4, fit, error: (_m: string, x: number) => x % 3, threshold: 1, iterations: 37 };
      const r = m.ransac(items, { ...opts, rng: createRng(7) });
      expect(calls).toBe(37);
      expect(duplicated).toBe(0);
      expect(r?.inliers).toEqual([0, 3, 6, 9]); // x % 3 == 1 (= 기준)은 inlier가 아니다
      expect(r?.model).toBe(first);
      const again = m.ransac(items, { ...opts, rng: createRng(7) });
      expect(again).toEqual(r);
      // 표본 크기 = 데이터 수: 모두 한 번씩 뽑는다
      calls = 0;
      const all = m.ransac(items, { ...opts, sampleSize: 12, iterations: 3, rng: createRng(8) });
      expect(all === null).toBe(false);
      expect(calls).toBe(3);
      expect(duplicated).toBe(0);
    });

    it("수치: 아웃라이어 50%에서도 시드 20개 모두 inlier를 95% 이상 찾고 아웃라이어는 5% 미만만 섞인다", () => {
      for (let seed = 0; seed < 20; seed++) {
        const rng = createRng(100 + seed);
        const { items, isInlier } = lineData(rng, 60, 60);
        const r = m.ransac(items, { sampleSize: 2, fit: fitLine, error: lineError, threshold: 0.05, iterations: 60, rng: createRng(200 + seed) });
        const found = r?.inliers ?? [];
        const truePos = found.filter((i) => isInlier[i]).length;
        expect(1 - truePos / 60).toBeLessThan(0.05);
        expect((found.length - truePos) / 60).toBeLessThan(0.05);
      }
    });
  });
});
