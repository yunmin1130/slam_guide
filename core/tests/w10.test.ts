/**
 * 10주차 테스트. 제목 구조는 강제 규칙이다 (LESSON_TEMPLATE §4):
 *   describe(구현) > describe("<함수명>") > it("기본|경계|수치: …")
 * - 해밍 거리는 테스트 안에서 비트를 하나씩 세어 비교한다.
 * - 무작위 테스트: 진짜 짝(조금 바꾼 사본)과 방해꾼을 섞고, 비율 검사가 진짜 짝만 남기는지 본다.
 */
import { describe, expect, it } from "vitest";
import { IMPL, loadImpl } from "./loadImpl";
import { createRng, type Rng } from "./rng";

type W10 = typeof import("../reference/w10");
type Desc = number[];

const m = await loadImpl<W10>("w10");

// ---- 테스트용 도우미 ----

/** 비트를 하나씩 세는 해밍 거리 (느리지만 확실한 기준) */
function slowHamming(a: Desc, b: Desc): number {
  let d = 0;
  for (let k = 0; k < a.length; k++) for (let bit = 0; bit < 8; bit++) d += ((a[k]! >> bit) & 1) !== ((b[k]! >> bit) & 1) ? 1 : 0;
  return d;
}

function randomBytes(rng: Rng, n: number): Desc {
  return Array.from({ length: n }, () => Math.floor(rng() * 256));
}

/** 비트 몇 개를 뒤집은 사본 (같은 점을 다시 본 디스크립터 흉내) */
function flipBits(rng: Rng, d: Desc, count: number): Desc {
  const out = [...d];
  for (let c = 0; c < count; c++) {
    const k = Math.floor(rng() * out.length);
    out[k] = out[k]! ^ (1 << Math.floor(rng() * 8));
  }
  return out;
}

describe(IMPL, () => {
  describe("ratioTest", () => {
    it("기본: L2 거리에서 1위가 2위보다 확실히 가까운 것만 남긴다", () => {
      const query = [
        [0, 0],
        [10, 10],
      ];
      const train = [
        [0.1, 0],
        [3, 4],
        [10, 10.4],
        [10, 9.55],
      ];
      // query 0: 1위 0.1(train 0), 2위 5(train 1) → 0.1 < 0.8×5 → 통과
      // query 1: 1위 0.4(train 2), 2위 0.45(train 3) → 0.4 < 0.8×0.45 = 0.36 은 거짓 → 버림
      const out = m.ratioTest(query, train, { metric: "l2", ratio: 0.8 });
      expect(out).toHaveLength(1);
      expect(out[0]!.query).toBe(0);
      expect(out[0]!.train).toBe(0);
      expect(out[0]!.distance).toBeCloseTo(0.1, 12);
      expect(out[0]!.secondDistance).toBeCloseTo(5, 12);
    });

    it("기본: 해밍 거리는 바이트를 XOR한 뒤 1인 비트 수 (0b1011 vs 0b0001 → 2비트)", () => {
      const out = m.ratioTest([[0b1011, 255]], [[0b0001, 255], [0, 0]], { metric: "hamming", ratio: 0.8 });
      expect(out).toHaveLength(1);
      expect(out[0]!.distance).toBe(2);
      expect(out[0]!.secondDistance).toBe(slowHamming([0b1011, 255], [0, 0]));
    });

    it("경계: 1위와 2위가 같으면 버리고, train이 2개 미만이면 빈 결과, query가 비면 빈 결과", () => {
      expect(m.ratioTest([[1, 1]], [[0, 1], [2, 1]], { metric: "l2", ratio: 1 })).toHaveLength(0);
      expect(m.ratioTest([[1, 1]], [[0, 1]], { metric: "l2", ratio: 0.8 })).toHaveLength(0);
      expect(m.ratioTest([], [[0, 1], [2, 1]], { metric: "l2", ratio: 0.8 })).toHaveLength(0);
      // 1위 거리 0, 2위 거리 > 0 이면 통과
      expect(m.ratioTest([[5, 5]], [[5, 5], [9, 9]], { metric: "l2", ratio: 0.5 })).toHaveLength(1);
    });

    it("경계: ratio가 (0, 1] 밖, 디스크립터 길이가 다름, 해밍인데 바이트가 아님, NaN이면 예외", () => {
      const q = [[1, 2]];
      const t = [
        [1, 2],
        [3, 4],
      ];
      expect(() => m.ratioTest(q, t, { metric: "l2", ratio: 0 })).toThrow();
      expect(() => m.ratioTest(q, t, { metric: "l2", ratio: 1.2 })).toThrow();
      expect(() => m.ratioTest([[1, 2, 3]], t, { metric: "l2", ratio: 0.8 })).toThrow();
      expect(() => m.ratioTest([[1, 300]], t, { metric: "hamming", ratio: 0.8 })).toThrow();
      expect(() => m.ratioTest([[1, 2.5]], t, { metric: "hamming", ratio: 0.8 })).toThrow();
      expect(() => m.ratioTest([[1, Number.NaN]], t, { metric: "l2", ratio: 0.8 })).toThrow();
    });

    it("수치: 무작위 32바이트 디스크립터 200개 중 진짜 짝 100개(비트 0~8개 뒤집음)를 오매칭 없이 거의 다 찾는다", () => {
      const rng = createRng(1);
      const train = Array.from({ length: 200 }, () => randomBytes(rng, 32));
      const query = Array.from({ length: 100 }, (_, i) => flipBits(rng, train[i * 2]!, Math.floor(rng() * 9)));
      const out = m.ratioTest(query, train, { metric: "hamming", ratio: 0.8 });
      expect(out.every((mt) => mt.train === mt.query * 2)).toBe(true);
      expect(out.length).toBeLessThanOrEqual(100);
      expect(95).toBeLessThanOrEqual(out.length);
      out.forEach((mt) => expect(mt.distance).toBe(slowHamming(query[mt.query]!, train[mt.train]!)));
    });

    it("수치: ratio를 줄이면 결과는 늘 줄어들고(부분집합), 짝이 없는 질의는 대부분 버려진다", () => {
      const rng = createRng(2);
      const train = Array.from({ length: 100 }, () => randomBytes(rng, 32));
      const real = Array.from({ length: 50 }, (_, i) => flipBits(rng, train[i]!, 10));
      const noise = Array.from({ length: 50 }, () => randomBytes(rng, 32));
      const query = [...real, ...noise];
      const loose = m.ratioTest(query, train, { metric: "hamming", ratio: 0.9 });
      const strict = m.ratioTest(query, train, { metric: "hamming", ratio: 0.6 });
      expect(strict.length).toBeLessThanOrEqual(loose.length);
      const looseSet = new Set(loose.map((mt) => `${mt.query}-${mt.train}`));
      expect(strict.every((mt) => looseSet.has(`${mt.query}-${mt.train}`))).toBe(true);
      // 아무 짝도 없는 질의는 1·2위 거리가 비슷해서 0.8에서 거의 다 버려진다
      const kept = m.ratioTest(noise, train, { metric: "hamming", ratio: 0.8 });
      expect(kept.length).toBeLessThan(5);
    });
  });
});
