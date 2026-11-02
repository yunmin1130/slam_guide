/** 9주차 정답 구현. 시그니처는 core/mine/w09.ts와 같다. */
import { CholeskyDecomposition, Matrix } from "ml-matrix";
import { levenbergMarquardt } from "@core/prev/w07";
import type { Pose2, PoseGraphEdge, PoseGraphProblem, PoseGraphResult, SolverOptions } from "../types";

const EPS = 1e-6;

/** 각도를 (−π, π]로 */
function wrap(a: number): number {
  const r = a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
  return r <= -Math.PI ? r + 2 * Math.PI : r;
}

/** a⁻¹·b: a에서 본 b의 상대 자세 */
function between(a: Pose2, b: Pose2): Pose2 {
  const c = Math.cos(a.theta);
  const s = Math.sin(a.theta);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return { x: c * dx + s * dy, y: -s * dx + c * dy, theta: wrap(b.theta - a.theta) };
}

/** 엣지 오차 e = z⁻¹·(xᵢ⁻¹·xⱼ) 를 [x, y, θ] 벡터로. 측정과 예측이 같으면 0 */
function edgeError(xi: Pose2, xj: Pose2, z: Pose2): number[] {
  const e = between(z, between(xi, xj));
  return [e.x, e.y, e.theta];
}

function plusPose(p: Pose2, d: readonly number[], at: number): Pose2 {
  return { x: p.x + d[at]!, y: p.y + d[at + 1]!, theta: wrap(p.theta + d[at + 2]!) };
}

/** 정보 행렬 Ω = L·Lᵀ (숄레스키) → 잔차를 Lᵀ·e 로 바꾸면 ½‖Lᵀe‖² = ½·eᵀΩe */
function whitener(info: PoseGraphEdge["info"], k: number): Matrix {
  const ok = info.length === 3 && info.every((r) => r.length === 3 && r.every(Number.isFinite));
  if (!ok) throw new Error(`poseGraph2D: 엣지 ${k}의 정보 행렬이 3×3 유한 행렬이 아니다`);
  const M0 = new Matrix(info.map((r) => [...r]));
  // inverse(Σ)로 만든 Ω는 끝자리가 조금 어긋날 수 있다 → 허용 오차로 대칭을 보고, 정확히 대칭으로 맞춰 쓴다
  const scale = Math.max(1, ...info.flat().map(Math.abs));
  const asym = Math.max(...[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => Math.abs(info[r]![c]! - info[c]![r]!))));
  if (asym > 1e-9 * scale) throw new Error(`poseGraph2D: 엣지 ${k}의 정보 행렬이 대칭이 아니다`);
  const M = M0.clone().add(M0.transpose()).div(2);
  const chol = new CholeskyDecomposition(M);
  if (!chol.isPositiveDefinite()) throw new Error(`poseGraph2D: 엣지 ${k}의 정보 행렬이 양의 정부호가 아니다`);
  return chol.lowerTriangularMatrix.transpose();
}

function validate(problem: PoseGraphProblem): void {
  const n = problem.poses.length;
  const finitePose = (p: Pose2) => [p.x, p.y, p.theta].every(Number.isFinite);
  if (problem.edges.length === 0) throw new Error("poseGraph2D: 엣지가 없다");
  problem.poses.forEach((p, i) => {
    if (!finitePose(p)) throw new Error(`poseGraph2D: 노드 ${i}에 NaN·무한대가 있다`);
  });
  problem.edges.forEach((e, k) => {
    const ok = (v: number) => Number.isInteger(v) && v >= 0 && v < n;
    if (!ok(e.i) || !ok(e.j)) throw new Error(`poseGraph2D: 엣지 ${k}가 없는 노드를 가리킨다 (${e.i} → ${e.j})`);
    if (e.i === e.j) throw new Error(`poseGraph2D: 엣지 ${k}가 자기 자신을 잇는다`);
    if (!finitePose(e.measurement)) throw new Error(`poseGraph2D: 엣지 ${k}의 측정에 NaN·무한대가 있다`);
  });
  for (const f of problem.fixed) {
    if (!(Number.isInteger(f) && f >= 0 && f < n)) throw new Error(`poseGraph2D: 없는 고정 노드 ${f}`);
  }
}

export function poseGraph2D(problem: PoseGraphProblem, opts: SolverOptions): PoseGraphResult {
  validate(problem);
  const { edges } = problem;
  const W = edges.map((e, k) => whitener(e.info, k));
  const fixed = new Set(problem.fixed);
  // 변수 순서: 고정하지 않은 노드마다 [x, y, θ]
  const col = new Map<number, number>();
  problem.poses.forEach((_, i) => {
    if (!fixed.has(i)) col.set(i, col.size * 3);
  });
  const n = col.size * 3;

  const whiten = (k: number, e: readonly number[]): number[] => {
    const L = W[k]!;
    return [0, 1, 2].map((r) => L.get(r, 0) * e[0]! + L.get(r, 1) * e[1]! + L.get(r, 2) * e[2]!);
  };

  const residual = (x: Pose2[]): number[] => edges.flatMap((e, k) => whiten(k, edgeError(x[e.i]!, x[e.j]!, e.measurement)));

  /** 엣지 k의 오차를 노드 하나(node)만 d번째 성분으로 흔든 중앙 차분 (θ 차이는 감싼다) */
  const edgeDerivative = (x: Pose2[], e: PoseGraphEdge, node: number, d: number): number[] => {
    const step = [0, 0, 0];
    step[d] = EPS;
    const p = plusPose(x[node]!, step, 0);
    step[d] = -EPS;
    const m = plusPose(x[node]!, step, 0);
    const at = (q: Pose2) => (node === e.i ? edgeError(q, x[e.j]!, e.measurement) : edgeError(x[e.i]!, q, e.measurement));
    const ep = at(p);
    const em = at(m);
    return ep.map((v, r) => (r === 2 ? wrap(v - em[r]!) : v - em[r]!) / (2 * EPS));
  };

  // 엣지마다 두 노드(6개 열)에 대한 야코비안. 각도 감싸기가 있어 수치 미분이 해석 미분보다 실수가 적다
  const jacobian = (x: Pose2[]): number[][] =>
    edges.flatMap((e, k) => {
      const rows = [0, 1, 2].map(() => new Array<number>(n).fill(0));
      for (const node of [e.i, e.j]) {
        const c0 = col.get(node);
        if (c0 === undefined) continue;
        for (let d = 0; d < 3; d++) {
          const colVec = whiten(k, edgeDerivative(x, e, node, d));
          for (let r = 0; r < 3; r++) rows[r]![c0 + d] = colVec[r]!;
        }
      }
      return rows;
    });

  const plus = (x: Pose2[], d: readonly number[]): Pose2[] =>
    x.map((p, i) => {
      const c0 = col.get(i);
      return c0 === undefined ? p : plusPose(p, d, c0);
    });

  const r = levenbergMarquardt<Pose2[]>({ residual, jacobian, plus }, [...problem.poses], opts);
  return { poses: r.x, cost: r.cost, iterations: r.iterations, converged: r.converged, costs: r.history.map((h) => h.cost) };
}
