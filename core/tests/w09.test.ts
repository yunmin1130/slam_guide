/**
 * 9주차 테스트. 제목 구조는 강제 규칙이다 (LESSON_TEMPLATE §4):
 *   describe(구현) > describe("<함수명>") > it("기본|경계|수치: …")
 * - 2D 자세 계산(합성 ⊕, 상대 자세 ⊖, 각도 감싸기)은 테스트 안에서 직접 한다.
 * - 정답을 아는 그래프(원 위의 노드 8개 + 루프 엣지)와, 손으로 풀리는 가중 평균 문제로 본다.
 */
import { describe, expect, it } from "vitest";
import { IMPL, loadImpl } from "./loadImpl";
import { createRng, type Rng } from "./rng";

type W09 = typeof import("../reference/w09");
interface Pose2 {
  x: number;
  y: number;
  theta: number;
}
interface Edge {
  i: number;
  j: number;
  measurement: Pose2;
  info: number[][];
}

const m = await loadImpl<W09>("w09");

// ---- 테스트용 도우미 ----

const OPTS = { maxIterations: 100, tolerance: 1e-10 };

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** a⊕b: a 자세에서 상대 자세 b만큼 간 곳 */
function oplus(a: Pose2, b: Pose2): Pose2 {
  const c = Math.cos(a.theta);
  const s = Math.sin(a.theta);
  return { x: a.x + c * b.x - s * b.y, y: a.y + s * b.x + c * b.y, theta: wrap(a.theta + b.theta) };
}

/** a⁻¹·b */
function between(a: Pose2, b: Pose2): Pose2 {
  const c = Math.cos(a.theta);
  const s = Math.sin(a.theta);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return { x: c * dx + s * dy, y: -s * dx + c * dy, theta: wrap(b.theta - a.theta) };
}

function diag(a: number, b: number, c: number): number[][] {
  return [
    [a, 0, 0],
    [0, b, 0],
    [0, 0, c],
  ];
}

function gauss(rng: Rng): number {
  return Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-12))) * Math.cos(2 * Math.PI * rng());
}

/** 반지름 2인 원 위의 노드 8개. 방향은 원의 접선이라 θ가 ±π를 지난다 */
function circle(): Pose2[] {
  return Array.from({ length: 8 }, (_, k) => {
    const a = (2 * Math.PI * k) / 8;
    return { x: 2 * Math.cos(a), y: 2 * Math.sin(a), theta: wrap(a + Math.PI / 2) };
  });
}

/** 오도메트리 엣지 k → k+1 과 루프 엣지 7 → 0 (오도메트리 측정에만 잡음 noise) */
function circleEdges(truth: Pose2[], rng: Rng | null, noise = 0, loopInfo = 100): Edge[] {
  const n = (s: number) => (rng ? gauss(rng) * s : 0);
  return truth.map((_, k) => {
    const j = (k + 1) % truth.length;
    const z = between(truth[k]!, truth[j]!);
    const isLoop = j === 0;
    return {
      i: k,
      j,
      measurement: isLoop ? z : { x: z.x + n(noise), y: z.y + n(noise), theta: wrap(z.theta + n(noise)) },
      info: isLoop ? diag(loopInfo, loopInfo, loopInfo) : diag(1, 1, 1),
    };
  });
}

/** 오도메트리만 이어 붙인 시작값 (루프 엣지는 안 씀) */
function deadReckoning(start: Pose2, edges: Edge[], count: number): Pose2[] {
  const poses = [start];
  for (let k = 0; k < count - 1; k++) poses.push(oplus(poses[k]!, edges[k]!.measurement));
  return poses;
}

function posErr(a: Pose2, b: Pose2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe(IMPL, () => {
  describe("poseGraph2D", () => {
    it("기본: 측정이 모두 맞는 원 그래프는 흔든 시작값에서 진짜 자세로 돌아온다 (1e-6)", () => {
      const truth = circle();
      const edges = circleEdges(truth, null);
      const rng = createRng(1);
      const start = truth.map((p, k) =>
        k === 0 ? p : { x: p.x + (rng() - 0.5) * 0.6, y: p.y + (rng() - 0.5) * 0.6, theta: wrap(p.theta + (rng() - 0.5) * 0.4) },
      );
      const out = m.poseGraph2D({ poses: start, edges, fixed: [0] }, OPTS);
      out.poses.forEach((p, k) => {
        expect(posErr(p, truth[k]!)).toBeLessThan(1e-6);
        expect(Math.abs(wrap(p.theta - truth[k]!.theta))).toBeLessThan(1e-6);
      });
    });

    it("경계: 각도가 ±π를 넘나드는 엣지에서 오차를 감싼다 (θ = 3.1 → −3.1 은 0.083 회전)", () => {
      const a: Pose2 = { x: 0, y: 0, theta: 3.1 };
      const truthB: Pose2 = { x: -1, y: 0.05, theta: -3.1 };
      const z = between(a, truthB);
      const out = m.poseGraph2D(
        { poses: [a, { x: -0.9, y: 0, theta: 3.13 }], edges: [{ i: 0, j: 1, measurement: z, info: diag(1, 1, 1) }], fixed: [0] },
        OPTS,
      );
      expect(posErr(out.poses[1]!, truthB)).toBeLessThan(1e-6);
      expect(Math.abs(wrap(out.poses[1]!.theta - truthB.theta))).toBeLessThan(1e-6);
      expect(out.cost).toBeLessThan(1e-12);
      // 업데이트 뒤에도 θ를 (−π, π]로 감싼다
      out.poses.forEach((p) => {
        expect(-p.theta).toBeLessThan(Math.PI);
        expect(p.theta).toBeLessThanOrEqual(Math.PI);
      });
    });

    it("경계: 같은 두 노드의 측정 두 개는 정보 행렬로 가중 평균된다 (정보 100 vs 1 → x = 102/101)", () => {
      const out = m.poseGraph2D(
        {
          poses: [
            { x: 0, y: 0, theta: 0 },
            { x: 0.5, y: 0.3, theta: 0.2 },
          ],
          edges: [
            { i: 0, j: 1, measurement: { x: 1, y: 0, theta: 0 }, info: diag(100, 100, 100) },
            { i: 0, j: 1, measurement: { x: 2, y: 0, theta: 0 }, info: diag(1, 1, 1) },
          ],
          fixed: [0],
        },
        OPTS,
      );
      expect(out.poses[1]!.x).toBeCloseTo(102 / 101, 6);
      expect(out.poses[1]!.y).toBeCloseTo(0, 6);
      expect(out.poses[1]!.theta).toBeCloseTo(0, 6);
      // 비용 = ½Σ eᵀΩe
      const expected = 0.5 * (100 * (102 / 101 - 1) ** 2 + 1 * (102 / 101 - 2) ** 2);
      expect(out.cost).toBeCloseTo(expected, 6);
    });

    it("기본: 비용은 ½·eᵀΩe, 오차는 e = z⁻¹·(xᵢ⁻¹·xⱼ) 를 [x, y, θ]로 (대각이 아닌 정보 행렬, 반복 0번의 시작 비용)", () => {
      const xi: Pose2 = { x: 0.3, y: -0.2, theta: 0.4 };
      const xj: Pose2 = { x: 1.5, y: 0.6, theta: 1.1 };
      const z: Pose2 = { x: 1.2, y: 0.1, theta: 0.5 };
      const info = [
        [4, 1, 0.5],
        [1, 3, 0.2],
        [0.5, 0.2, 2],
      ];
      const e = between(z, between(xi, xj));
      const ev = [e.x, e.y, e.theta];
      const expected = 0.5 * ev.reduce((s, a, r) => s + a * info[r]!.reduce((t, w, c) => t + w * ev[c]!, 0), 0);
      const out = m.poseGraph2D({ poses: [xi, xj], edges: [{ i: 0, j: 1, measurement: z, info }], fixed: [0] }, { maxIterations: 0, tolerance: 1e-10 });
      expect(out.cost).toBeCloseTo(expected, 10);
      expect(out.costs).toHaveLength(1);
    });

    it("경계: 중간 노드(3)도 고정하면 그 노드는 그대로이고, 나머지 노드는 진짜 자세로 돌아온다 (변수 번호 매기기)", () => {
      const truth = circle();
      const edges = circleEdges(truth, null);
      const rng = createRng(2);
      const start = truth.map((p, k) =>
        k === 0 || k === 3 ? p : { x: p.x + (rng() - 0.5) * 0.6, y: p.y + (rng() - 0.5) * 0.6, theta: wrap(p.theta + (rng() - 0.5) * 0.4) },
      );
      const out = m.poseGraph2D({ poses: start, edges, fixed: [0, 3] }, OPTS);
      expect(out.poses[0]).toEqual(start[0]);
      expect(out.poses[3]).toEqual(start[3]);
      out.poses.forEach((p, k) => expect(posErr(p, truth[k]!)).toBeLessThan(1e-6));
    });

    it("경계: 엣지 없음·없는 노드·자기 자신·없는 고정 번호·NaN·정보 행렬이 3×3 대칭 양의 정부호가 아니면 예외", () => {
      const start = circle();
      const base = { poses: start, fixed: [0] };
      const z = { x: 1, y: 0, theta: 0 };
      const edge = (info: number[][], extra: Partial<Edge> = {}) => [{ i: 0, j: 1, measurement: z, info, ...extra }];
      expect(() => m.poseGraph2D({ ...base, edges: [] }, OPTS)).toThrow();
      expect(() => m.poseGraph2D({ ...base, edges: edge(diag(1, 1, 1), { j: 9 }) }, OPTS)).toThrow();
      expect(() => m.poseGraph2D({ ...base, edges: edge(diag(1, 1, 1), { j: 0 }) }, OPTS)).toThrow();
      expect(() => m.poseGraph2D({ ...base, fixed: [8], edges: edge(diag(1, 1, 1)) }, OPTS)).toThrow();
      expect(() => m.poseGraph2D({ ...base, edges: edge(diag(1, 1, 1), { measurement: { x: Number.NaN, y: 0, theta: 0 } }) }, OPTS)).toThrow();
      expect(() => m.poseGraph2D({ ...base, edges: edge(diag(1, -1, 1)) }, OPTS)).toThrow();
      expect(() => m.poseGraph2D({ ...base, edges: edge([[1, 0.5, 0], [0, 1, 0], [0, 0, 1]]) }, OPTS)).toThrow();
      expect(() => m.poseGraph2D({ ...base, edges: edge([[1, 0], [0, 1]]) }, OPTS)).toThrow();
      expect(() => m.poseGraph2D({ ...base, edges: edge(diag(1, Number.NaN, 1)) }, OPTS)).toThrow();
    });

    it("수치: 잡음 섞인 오도메트리로 쌓인 표류를 루프 엣지가 줄인다 (마지막 노드 오차가 오도메트리만일 때의 1/3 이하)", () => {
      for (const seed of [3, 4, 5, 6]) {
        const truth = circle();
        const edges = circleEdges(truth, createRng(seed), 0.08);
        const start = deadReckoning(truth[0]!, edges, truth.length);
        const before = posErr(start[7]!, truth[7]!);
        const out = m.poseGraph2D({ poses: start, edges, fixed: [0] }, OPTS);
        expect(posErr(out.poses[7]!, truth[7]!)).toBeLessThan(before / 3);
        for (let i = 1; i < out.costs.length; i++) expect(out.costs[i]!).toBeLessThan(out.costs[i - 1]!);
      }
    });

    it("수치: 루프 엣지의 정보가 클수록 결과가 루프 측정을 더 정확히 지킨다", () => {
      const truth = circle();
      const loopErr = (info: number) => {
        const edges = circleEdges(truth, createRng(7), 0.08, info);
        const out = m.poseGraph2D({ poses: deadReckoning(truth[0]!, edges, truth.length), edges, fixed: [0] }, OPTS);
        const e = between(edges[7]!.measurement, between(out.poses[7]!, out.poses[0]!));
        return Math.hypot(e.x, e.y, e.theta);
      };
      expect(loopErr(1000)).toBeLessThan(loopErr(1) / 10);
    });
  });
});
