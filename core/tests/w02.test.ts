/**
 * 2주차 테스트. 제목 구조는 강제 규칙이다 (LESSON_TEMPLATE §4):
 *   describe(구현) > describe("<함수명>") > it("기본|경계|수치: …")
 * 영공간 벡터는 부호·스케일이 정해지지 않으므로 단위화 후 ± 중 가까운 쪽으로 비교한다.
 */
import { describe, expect, it } from "vitest";
import { createRng, type Rng } from "./rng";

type W02 = typeof import("../reference/w02");

const IMPL = process.env.IMPL === "mine" ? "mine" : "reference";
const m: W02 = await import(`@core/${IMPL}/w02.ts`);

const TOL = 1e-9;

// ---- 테스트용 작은 도우미 (구현과 무관하게 직접 계산) ----

function matVec(A: readonly (readonly number[])[], x: readonly number[]): number[] {
  return A.map((row) => row.reduce((s, a, j) => s + a * x[j], 0));
}

function transposeVec(A: readonly (readonly number[])[], r: readonly number[]): number[] {
  return A[0].map((_, j) => A.reduce((s, row, i) => s + row[j] * r[i], 0));
}

function norm(v: readonly number[]): number {
  return Math.hypot(...v);
}

function normalize(v: readonly number[]): number[] {
  const n = norm(v);
  return v.map((x) => x / n);
}

/** 부호 무관 거리: min(|u - v|, |u + v|) (둘 다 단위벡터라고 가정) */
function signFreeDistance(u: readonly number[], v: readonly number[]): number {
  const minus = norm(u.map((x, i) => x - v[i]));
  const plus = norm(u.map((x, i) => x + v[i]));
  return Math.min(minus, plus);
}

function randomVec(rng: Rng, n: number): number[] {
  return Array.from({ length: n }, () => rng() * 2 - 1);
}

function randomMat(rng: Rng, rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () => randomVec(rng, cols));
}

/** x에 수직인 무작위 행 rows개 → x가 정확한 영공간인 행렬 */
function matWithNullspace(rng: Rng, rows: number, x: readonly number[]): number[][] {
  const xn = normalize(x);
  return Array.from({ length: rows }, () => {
    const a = randomVec(rng, xn.length);
    const d = a.reduce((s, v, k) => s + v * xn[k], 0);
    return a.map((v, k) => v - d * xn[k]);
  });
}

describe(IMPL, () => {
  describe("solveLeastSquares", () => {
    it("기본: 정방 가역 행렬이면 정확한 해 (2x+y=3, x+3y=5 → [0.8, 1.4])", () => {
      const x = m.solveLeastSquares(
        [
          [2, 1],
          [1, 3],
        ],
        [3, 5],
      );
      expect(x).toHaveLength(2);
      expect(x[0]).toBeCloseTo(0.8, 9);
      expect(x[1]).toBeCloseTo(1.4, 9);
    });

    it("경계: 점 (0,0),(1,1),(2,1)에 직선 y=at+c 맞추기 → a=1/2, c=1/6 (잔차가 0이 아님)", () => {
      const A = [
        [0, 1],
        [1, 1],
        [2, 1],
      ];
      const [a, c] = m.solveLeastSquares(A, [0, 1, 1]);
      expect(a).toBeCloseTo(0.5, 9);
      expect(c).toBeCloseTo(1 / 6, 9);
    });

    it("경계: 식(행)이 미지수(열)보다 적거나, b 길이가 행 수와 다르면 예외", () => {
      expect(() => m.solveLeastSquares([[1, 2, 3]], [1])).toThrow();
      expect(() =>
        m.solveLeastSquares(
          [
            [1, 0],
            [0, 1],
            [1, 1],
          ],
          [1, 2],
        ),
      ).toThrow();
    });

    it("경계: 입력 A, b를 바꾸지 않는다", () => {
      const A = [
        [0, 1],
        [1, 1],
        [2, 1],
      ];
      const b = [0, 1, 1];
      const copyA = A.map((r) => [...r]);
      const copyB = [...b];
      m.solveLeastSquares(A, b);
      expect(A).toEqual(copyA);
      expect(b).toEqual(copyB);
    });

    it("수치: 잔차가 열공간에 수직 Aᵀ(Ax−b) ≈ 0 (무작위 20×4, 50회)", () => {
      const rng = createRng(21);
      for (let t = 0; t < 50; t++) {
        const A = randomMat(rng, 20, 4);
        const b = randomVec(rng, 20);
        const x = m.solveLeastSquares(A, b);
        expect(x).toHaveLength(4);
        const r = matVec(A, x).map((v, i) => v - b[i]);
        const g = transposeVec(A, r);
        expect(norm(g)).toBeLessThan(1e-8);
      }
    });
  });

  describe("nullspaceSVD", () => {
    it("기본: [[1,2,3],[4,5,6],[7,8,9]]의 영공간은 ±[1,-2,1]/√6", () => {
      const x = m.nullspaceSVD([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ]);
      expect(x).toHaveLength(3);
      expect(signFreeDistance(x, normalize([1, -2, 1]))).toBeLessThan(1e-6);
    });

    it("경계: 가로로 긴 행렬(2×3, 8×9)에서도 영공간을 찾는다 (thin SVD 함정)", () => {
      const x23 = m.nullspaceSVD([
        [1, 0, 0],
        [0, 1, 0],
      ]);
      expect(signFreeDistance(x23, [0, 0, 1])).toBeLessThan(1e-6);

      const rng = createRng(22);
      const truth = normalize(randomVec(rng, 9));
      const x89 = m.nullspaceSVD(matWithNullspace(rng, 8, truth));
      expect(x89).toHaveLength(9);
      expect(signFreeDistance(x89, truth)).toBeLessThan(1e-6);
    });

    it("경계: 결과는 단위벡터이고 입력 행렬을 바꾸지 않는다", () => {
      const A = [
        [2, 0, 0],
        [0, 3, 0],
        [0, 0, 0],
      ];
      const copy = A.map((r) => [...r]);
      const x = m.nullspaceSVD(A);
      expect(norm(x)).toBeCloseTo(1, 12);
      expect(A).toEqual(copy);
      expect(signFreeDistance(x, [0, 0, 1])).toBeLessThan(1e-9);

      // 가로로 긴 입력: 0행을 원본에 직접 붙이는 버그를 잡는다
      const wide = [
        [1, 0, 0],
        [0, 1, 0],
      ];
      const wideCopy = wide.map((r) => [...r]);
      m.nullspaceSVD(wide);
      expect(wide).toEqual(wideCopy);
    });

    it("수치: 노이즈가 있는 세로로 긴 행렬에서 |Ax|가 최소 (20×4, 무작위 단위벡터 200개보다 작거나 같다)", () => {
      const rng = createRng(23);
      const truth = normalize(randomVec(rng, 4));
      const A = matWithNullspace(rng, 20, truth).map((row) => row.map((v) => v + (rng() * 2 - 1) * 1e-3));
      const x = m.nullspaceSVD(A);
      expect(norm(x)).toBeCloseTo(1, 9);
      const best = norm(matVec(A, x));
      for (let t = 0; t < 200; t++) {
        const y = normalize(randomVec(rng, 4));
        expect(best).toBeLessThanOrEqual(norm(matVec(A, y)) + TOL);
      }
      expect(signFreeDistance(x, truth)).toBeLessThan(1e-2);
    });
  });
});
