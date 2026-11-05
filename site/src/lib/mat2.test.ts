import { describe, expect, it } from "vitest";
import { apply, det, eigen, mul, norm, rotation, svd2, svdStage, transpose, type M2 } from "./mat2";

const close = (a: readonly number[], b: readonly number[], digits = 9) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));

/** 고정 시드 난수 (테스트가 매번 같게) */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("기본 연산", () => {
  it("apply·det·mul·transpose가 정의대로다", () => {
    const A: M2 = [1, 2, 3, 4];
    close(apply(A, [1, 1]), [3, 7]);
    expect(det(A)).toBeCloseTo(-2, 12);
    close(mul(A, [0, 1, 1, 0]), [2, 1, 4, 3]);
    close(transpose(A), [1, 3, 2, 4]);
  });

  it("회전행렬은 길이를 지키고 행렬식이 1이다", () => {
    const Q = rotation(0.7);
    expect(det(Q)).toBeCloseTo(1, 12);
    expect(norm(apply(Q, [3, 4]))).toBeCloseTo(5, 12);
    close(mul(transpose(Q), Q), [1, 0, 0, 1]);
  });
});

describe("eigen", () => {
  it("기본: [[2,1],[1,2]]의 고유값은 3, 1이고 고유벡터는 (1,1), (1,-1) 방향", () => {
    const e = eigen([2, 1, 1, 2]);
    expect(e).not.toBeNull();
    close(e!.values, [3, 1]);
    const [v1, v2] = e!.vectors;
    expect(v1[0] * v1[1]).toBeCloseTo(0.5, 9);
    expect(v2[0] * v2[1]).toBeCloseTo(-0.5, 9);
  });

  it("경계: 회전(90°)은 실수 고유벡터가 없어 null, 대각행렬은 축 방향", () => {
    expect(eigen(rotation(Math.PI / 2))).toBeNull();
    const d = eigen([1, 0, 0, 3])!;
    close(d.values, [3, 1]);
    expect(Math.abs(d.vectors[0][1])).toBeCloseTo(1, 12);
    expect(Math.abs(d.vectors[1][0])).toBeCloseTo(1, 12);
  });

  it("경계: 고유값이 겹치는 밀기 [[1,1],[0,1]]는 같은 방향 두 개, 음의 고유값 비대칭도 Av = λv", () => {
    const s = eigen([1, 1, 0, 1])!;
    close(s.values, [1, 1]);
    expect(Math.abs(s.vectors[0][0] * s.vectors[1][0] + s.vectors[0][1] * s.vectors[1][1])).toBeCloseTo(1, 9);
    expect(Math.abs(s.vectors[0][1])).toBeLessThan(1e-9); // (±1, 0) 방향
    const N: M2 = [1, 3, 0, -2];
    const e = eigen(N)!;
    close(e.values, [1, -2]);
    e.vectors.forEach((v, i) => close(apply(N, v), [e.values[i]! * v[0], e.values[i]! * v[1]]));
  });

  it("수치: 실수 고유값인 무작위 행렬 100개에서 Av = λv", () => {
    const r = rng(7);
    let tested = 0;
    while (tested < 100) {
      const A: M2 = [r() * 4 - 2, r() * 4 - 2, r() * 4 - 2, r() * 4 - 2];
      const e = eigen(A);
      if (!e) continue;
      tested++;
      e.vectors.forEach((v, i) => {
        expect(norm(v)).toBeCloseTo(1, 9);
        close(apply(A, v), [e.values[i]! * v[0], e.values[i]! * v[1]], 7);
      });
    }
  });
});

describe("svdStage", () => {
  const A: M2 = [3 / Math.sqrt(5), 0, 4 / Math.sqrt(5), 5 / Math.sqrt(5)];

  it("기본: 0단계는 I, 1단계는 Vᵀ, 3단계는 A", () => {
    const { V } = svd2(A);
    close(svdStage(A, 0), [1, 0, 0, 1]);
    close(svdStage(A, 1), transpose(V));
    close(svdStage(A, 3), A);
  });

  it("경계: 행렬식이 음수(반사)인 A도 3단계에서 정확히 A, 범위 밖 t는 잘린다", () => {
    const R: M2 = [1, 2, 3, -1];
    expect(det(R)).toBeLessThan(0);
    close(svdStage(R, 3), R);
    close(svdStage(R, 9), R);
    close(svdStage(R, -1), [1, 0, 0, 1]);
  });

  it("수치: 2단계는 Σ·Vᵀ (대각 늘리기까지), 반사·랭크 1까지 단계 사이가 이어진다", () => {
    const { sigma, V } = svd2(A);
    close(svdStage(A, 2), mul([sigma[0], 0, 0, sigma[1]], transpose(V)));
    for (const M of [A, [1, 2, 3, -1] as M2, [1, 1, 2, 2] as M2]) {
      const { sigma: s, V: W } = svd2(M);
      close(svdStage(M, 1), transpose(W));
      // 2단계: 반사면 σ₂ 부호가 뒤집혀 있으므로 절댓값으로 비교
      const S2 = svdStage(M, 2);
      const rowLen = (i: number) => Math.hypot(...mul(S2, W).slice(2 * i, 2 * i + 2));
      expect(rowLen(0)).toBeCloseTo(s[0], 9);
      expect(rowLen(1)).toBeCloseTo(s[1], 9);
      // 간격 0.001마다 성분 변화가 작다 (끊김 없음)
      const scale = Math.max(1, s[0]);
      for (let t = 0; t < 3; t += 0.001) {
        const a = svdStage(M, t);
        const b = svdStage(M, t + 0.001);
        expect(Math.max(...a.map((v, i) => Math.abs(v - b[i]!)))).toBeLessThan(0.02 * scale);
      }
    }
  });
});

describe("svd2", () => {
  it("기본: [[3,0],[4,5]]의 특이값은 3√5, √5", () => {
    close(svd2([3, 0, 4, 5]).sigma, [3 * Math.sqrt(5), Math.sqrt(5)]);
  });

  it("경계: 랭크 1 [[1,2],[2,4]]는 σ₂ = 0이고 V의 둘째 열이 0으로 눌린다, 0행렬도 동작", () => {
    const { sigma, V } = svd2([1, 2, 2, 4]);
    expect(sigma[0]).toBeCloseTo(5, 12);
    expect(sigma[1]).toBeCloseTo(0, 12);
    expect(norm(apply([1, 2, 2, 4], [V[1], V[3]]))).toBeLessThan(1e-12);
    // 0으로 볼지 가르는 경계 (1e-7·σ₁) 양쪽
    expect(svd2([1, 0, 0, 1e-9]).sigma[1]).toBe(0);
    expect(svd2([1, 0, 0, 1e-5]).sigma[1]).toBeCloseTo(1e-5, 12);
    const z = svd2([0, 0, 0, 0]);
    close(z.sigma, [0, 0]);
    close(mul(transpose(z.U), z.U), [1, 0, 0, 1]);
  });

  it("수치: 무작위 100개에서 UΣVᵀ = A, U·V 직교, σ₁ ≥ σ₂ ≥ 0", () => {
    const r = rng(11);
    for (let k = 0; k < 100; k++) {
      const A: M2 = [r() * 6 - 3, r() * 6 - 3, r() * 6 - 3, r() * 6 - 3];
      const { U, sigma, V } = svd2(A);
      expect(sigma[0]).toBeGreaterThanOrEqual(sigma[1]);
      expect(sigma[1]).toBeGreaterThanOrEqual(0);
      close(mul(transpose(U), U), [1, 0, 0, 1]);
      close(mul(transpose(V), V), [1, 0, 0, 1]);
      close(mul(mul(U, [sigma[0], 0, 0, sigma[1]]), transpose(V)), A);
    }
  });
});
