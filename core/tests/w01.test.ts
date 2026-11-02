/**
 * 1주차 테스트. 제목 구조는 강제 규칙이다 (LESSON_TEMPLATE §4):
 *   describe(구현) > describe("<함수명>") > it("기본|경계|수치: …")
 */
import { describe, expect, it } from "vitest";
import { IMPL, loadImpl } from "./loadImpl";
import { createRng, randomVec3 } from "./rng";

type W01 = typeof import("../reference/w01");

const m = await loadImpl<W01>("w01");

const TOL = 1e-9;

function matVec(M: readonly (readonly number[])[], v: readonly number[]): number[] {
  return M.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
}

describe(IMPL, () => {
  describe("dot", () => {
    it("기본: [1,2,3]·[4,5,6] = 32", () => {
      expect(m.dot([1, 2, 3], [4, 5, 6])).toBe(32);
    });
    it("경계: 직교 벡터의 내적은 0", () => {
      expect(m.dot([1, 0, 0], [0, 1, 0])).toBe(0);
    });
    it("수치: 교환법칙 a·b = b·a (무작위 100쌍)", () => {
      const rng = createRng(1);
      for (let i = 0; i < 100; i++) {
        const a = randomVec3(rng);
        const b = randomVec3(rng);
        expect(m.dot(a, b)).toBeCloseTo(m.dot(b, a), 9);
      }
    });
  });

  describe("cross", () => {
    it("기본: x × y = z", () => {
      expect(m.cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    });
    it("경계: 평행 벡터의 외적은 0", () => {
      const c = m.cross([2, 4, 6], [1, 2, 3]);
      c.forEach((x) => expect(Math.abs(x)).toBeLessThan(TOL));
    });
    it("수치: 결과는 두 입력에 수직 (무작위 100쌍)", () => {
      const rng = createRng(2);
      for (let i = 0; i < 100; i++) {
        const a = randomVec3(rng);
        const b = randomVec3(rng);
        const c = m.cross(a, b);
        expect(Math.abs(m.dot(c, a))).toBeLessThan(1e-6);
        expect(Math.abs(m.dot(c, b))).toBeLessThan(1e-6);
      }
    });
  });

  describe("skew", () => {
    it("기본: [1,2,3]의 반대칭 행렬", () => {
      expect(m.skew([1, 2, 3])).toEqual([
        [0, -3, 2],
        [3, 0, -1],
        [-2, 1, 0],
      ]);
    });
    it("경계: 영벡터의 반대칭 행렬은 영행렬, 결과는 항상 Sᵀ = -S", () => {
      const Z = m.skew([0, 0, 0]);
      Z.flat().forEach((x) => expect(Math.abs(x)).toBeLessThan(TOL));
      const S = m.skew([4, -5, 6]);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(S[i][j]).toBeCloseTo(-S[j][i], 12);
        }
      }
    });
    it("수치: [a]× · b = a × b (무작위 100쌍)", () => {
      const rng = createRng(3);
      for (let i = 0; i < 100; i++) {
        const a = randomVec3(rng);
        const b = randomVec3(rng);
        const lhs = matVec(m.skew(a), b);
        const rhs = m.cross(a, b);
        for (let k = 0; k < 3; k++) {
          expect(lhs[k]).toBeCloseTo(rhs[k], 9);
        }
      }
    });
  });
});
