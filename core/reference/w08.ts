/** 8주차 정답 구현. 시그니처는 core/mine/w08.ts와 같다. */
import { expSO3 } from "@core/prev/w03";
import { levenbergMarquardt } from "@core/prev/w07";
import type { BAProblem, BAResult, Intrinsics, Mat3, SE3, SolverOptions, Vec3 } from "../types";

/** 카메라 뒤로 간 점의 잔차 (픽셀). LM이 그 업데이트를 버리게 크게 둔다 */
const BEHIND_PENALTY = 1e6;

function mv(R: Mat3, v: Vec3): Vec3 {
  return [
    R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2],
    R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2],
    R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2],
  ];
}

function mm(A: Mat3, B: Mat3): Mat3 {
  const r = (i: number): Vec3 => [
    A[i][0] * B[0][0] + A[i][1] * B[1][0] + A[i][2] * B[2][0],
    A[i][0] * B[0][1] + A[i][1] * B[1][1] + A[i][2] * B[2][1],
    A[i][0] * B[0][2] + A[i][1] * B[1][2] + A[i][2] * B[2][2],
  ];
  return [r(0), r(1), r(2)];
}

function toCamera(T: SE3, X: Vec3): Vec3 {
  const p = mv(T.R, X);
  return [p[0] + T.t[0], p[1] + T.t[1], p[2] + T.t[2]];
}

function matmul(A: readonly (readonly number[])[], B: readonly (readonly number[])[]): number[][] {
  return A.map((row) => B[0]!.map((_, j) => row.reduce((s, v, k) => s + v * B[k]![j]!, 0)));
}

export function projectionJacobian(T: SE3, X: Vec3, K: Intrinsics): { pose: number[][]; point: number[][] } {
  const [x, y, z] = toCamera(T, X);
  if (!(z > 0)) throw new Error("projectionJacobian: 점이 카메라 뒤에 있다 (z ≤ 0)");
  // u = fx·x/z + cx, v = fy·y/z + cy 를 p = (x, y, z)로 미분 (2×3)
  const dudp = [
    [K.fx / z, 0, (-K.fx * x) / (z * z)],
    [0, K.fy / z, (-K.fy * y) / (z * z)],
  ];
  // 좌섭동 δ = [ρ; φ]: ∂p/∂δ = [I | −[p]×]
  const dpdDelta = [
    [1, 0, 0, 0, z, -y],
    [0, 1, 0, -z, 0, x],
    [0, 0, 1, y, -x, 0],
  ];
  return { pose: matmul(dudp, dpdDelta), point: matmul(dudp, T.R) }; // ∂p/∂X = R
}

interface State {
  cams: SE3[];
  pts: Vec3[];
}

function validate(problem: BAProblem): void {
  const { cameras, points, observations, fixed } = problem;
  if (observations.length === 0) throw new Error("smallBA: 관측이 없다");
  for (const o of observations) {
    if (!(Number.isInteger(o.cam) && o.cam >= 0 && o.cam < cameras.length)) throw new Error(`smallBA: 없는 카메라 번호 ${o.cam}`);
    if (!(Number.isInteger(o.point) && o.point >= 0 && o.point < points.length)) throw new Error(`smallBA: 없는 점 번호 ${o.point}`);
    if (!(Number.isFinite(o.uv[0]) && Number.isFinite(o.uv[1]))) throw new Error("smallBA: 관측 픽셀에 NaN·무한대가 있다");
    // 시작값에서 이미 카메라 뒤에 있는 점은 야코비안이 없어 LM이 "수렴"한 것처럼 멈춘다 → 처음부터 막는다
    if (!(toCamera(cameras[o.cam]!, points[o.point]!)[2] > 0)) {
      throw new Error(`smallBA: 시작값에서 점 ${o.point}이 카메라 ${o.cam} 뒤에 있다 (깊이 ≤ 0)`);
    }
  }
  for (const c of fixed) {
    if (!(Number.isInteger(c) && c >= 0 && c < cameras.length)) throw new Error(`smallBA: 없는 고정 카메라 번호 ${c}`);
  }
}

export function smallBA(problem: BAProblem, opts: SolverOptions): BAResult {
  validate(problem);
  const { K, observations } = problem;
  const fixed = new Set(problem.fixed);
  // 변수 순서: 고정하지 않은 카메라(6개씩) 다음에 점(3개씩)
  const camCol = new Map<number, number>();
  problem.cameras.forEach((_, c) => {
    if (!fixed.has(c)) camCol.set(c, camCol.size * 6);
  });
  const pointBase = camCol.size * 6;
  const n = pointBase + problem.points.length * 3;

  const residual = (s: State): number[] =>
    observations.flatMap((o) => {
      const p = toCamera(s.cams[o.cam]!, s.pts[o.point]!);
      if (!(p[2] > 1e-9)) return [BEHIND_PENALTY, BEHIND_PENALTY];
      return [K.fx * (p[0] / p[2]) + K.cx - o.uv[0], K.fy * (p[1] / p[2]) + K.cy - o.uv[1]];
    });

  const jacobian = (s: State): number[][] =>
    observations.flatMap((o) => {
      const rows = [new Array<number>(n).fill(0), new Array<number>(n).fill(0)];
      const T = s.cams[o.cam]!;
      const X = s.pts[o.point]!;
      if (!(toCamera(T, X)[2] > 1e-9)) return rows; // 뒤로 간 점: 기울기 없음 (그 업데이트는 잔차가 커서 버려진다)
      const J = projectionJacobian(T, X, K);
      const c0 = camCol.get(o.cam);
      const p0 = pointBase + o.point * 3;
      for (let r = 0; r < 2; r++) {
        if (c0 !== undefined) for (let k = 0; k < 6; k++) rows[r]![c0 + k] = J.pose[r]![k]!;
        for (let k = 0; k < 3; k++) rows[r]![p0 + k] = J.point[r]![k]!;
      }
      return rows;
    });

  const plus = (s: State, d: readonly number[]): State => ({
    cams: s.cams.map((T, c) => {
      const c0 = camCol.get(c);
      if (c0 === undefined) return T;
      // 좌섭동: R ← Exp(φ)R, t ← Exp(φ)t + ρ  (δ = [ρ; φ])
      const E = expSO3([d[c0 + 3]!, d[c0 + 4]!, d[c0 + 5]!]);
      const t = mv(E, T.t);
      return { R: mm(E, T.R), t: [t[0] + d[c0]!, t[1] + d[c0 + 1]!, t[2] + d[c0 + 2]!] };
    }),
    pts: s.pts.map((X, i) => {
      const b = pointBase + i * 3;
      return [X[0] + d[b]!, X[1] + d[b + 1]!, X[2] + d[b + 2]!];
    }),
  });

  const start: State = { cams: [...problem.cameras], pts: [...problem.points] };
  const r = levenbergMarquardt<State>({ residual, jacobian, plus }, start, opts);
  return {
    cameras: r.x.cams,
    points: r.x.pts,
    cost: r.cost,
    iterations: r.iterations,
    converged: r.converged,
    costs: r.history.map((h) => h.cost),
  };
}
