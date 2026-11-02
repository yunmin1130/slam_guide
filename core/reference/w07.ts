/** 7주차 정답 구현. 시그니처는 core/mine/w07.ts와 같다. */
import { CholeskyDecomposition, Matrix } from "ml-matrix";
import type { LsqProblem, MatN, RobustLoss, SolverOptions, SolverResult, SolverStep, VecN } from "../types";

const LM_LAMBDA0 = 1e-3;
const LM_UP = 10;
const LM_DOWN = 10;

export function huber(r: number, k: number): RobustLoss {
  if (!(k > 0)) throw new Error("huber: k는 양수여야 한다");
  const a = Math.abs(r);
  // |r| ≤ k: 보통 제곱 (가중치 1), 밖: 직선으로 자라서 큰 잔차의 영향이 줄어든다 (가중치 k/|r|)
  return a <= k ? { rho: 0.5 * r * r, weight: 1 } : { rho: k * (a - 0.5 * k), weight: k / a };
}

function costOf(r: VecN, robust: SolverOptions["robust"]): number {
  return robust ? r.reduce((s, v) => s + robust(v).rho, 0) : 0.5 * r.reduce((s, v) => s + v * v, 0);
}

/** 가중 정규방정식 H = JᵀWJ, g = JᵀWr */
function normalEquations(J: MatN, r: VecN, robust: SolverOptions["robust"]): { H: Matrix; g: Matrix } {
  const w = r.map((v) => (robust ? robust(v).weight : 1));
  const Jm = new Matrix(J.map((row) => [...row]));
  const WJ = new Matrix(J.map((row, i) => row.map((v) => v * w[i]!)));
  const H0 = Jm.transpose().mmul(WJ);
  // Jᵀ(WJ)는 수학적으로 대칭이지만 곱하는 순서 때문에 끝자리가 달라질 수 있다.
  // ml-matrix 숄레스키는 정확히 대칭이 아니면 예외를 던지므로 (H + Hᵀ)/2로 맞춘다.
  const H = H0.clone().add(H0.transpose()).div(2);
  const g = WJ.transpose().mmul(Matrix.columnVector([...r]));
  return { H, g };
}

/** H δ = −g 를 숄레스키로 푼다. H가 양의 정부호가 아니면 null */
function solveSPD(H: Matrix, g: Matrix): number[] | null {
  if (!H.to1DArray().every(Number.isFinite)) return null; // 잔차·야코비안에 NaN이 섞임
  const chol = new CholeskyDecomposition(H);
  if (!chol.isPositiveDefinite()) return null;
  const d = chol.solve(g.clone().mul(-1)).getColumn(0);
  return d.every(Number.isFinite) ? d : null;
}

function norm(v: readonly number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

export function gaussNewton<X>(problem: LsqProblem<X>, x0: X, opts: SolverOptions): SolverResult<X> {
  let x = x0;
  let r = problem.residual(x);
  let cost = costOf(r, opts.robust);
  const history: SolverStep<X>[] = [{ x, cost }];
  const finish = (converged: boolean): SolverResult<X> => ({ x, cost, iterations: history.length - 1, converged, history });
  for (let it = 0; it < opts.maxIterations; it++) {
    const J = problem.jacobian(x);
    const { H, g } = normalEquations(J, r, opts.robust);
    const dx = solveSPD(H, g);
    if (!dx) throw new Error("gaussNewton: JᵀJ가 풀리지 않는다 (야코비안 열이 일차종속, 예: 관측이 부족하다)");
    x = problem.plus(x, dx);
    r = problem.residual(x);
    cost = costOf(r, opts.robust);
    history.push({ x, cost });
    if (norm(dx) < opts.tolerance) return finish(true);
    if (!Number.isFinite(cost)) break; // 발산
  }
  return finish(false);
}

export function levenbergMarquardt<X>(problem: LsqProblem<X>, x0: X, opts: SolverOptions): SolverResult<X> {
  let x = x0;
  let r = problem.residual(x);
  let cost = costOf(r, opts.robust);
  let lambda = LM_LAMBDA0;
  const history: SolverStep<X>[] = [{ x, cost, lambda }];
  const finish = (converged: boolean): SolverResult<X> => ({ x, cost, iterations: history.length - 1, converged, history });
  for (let it = 0; it < opts.maxIterations; it++) {
    const J = problem.jacobian(x);
    const { H, g } = normalEquations(J, r, opts.robust);
    // 감쇠: H + λ·diag(H). λ가 크면 짧은 경사하강, 작으면 GN
    const damped = H.clone();
    for (let i = 0; i < H.rows; i++) {
      damped.set(i, i, H.get(i, i) * (1 + lambda) + 1e-12);
    }
    const dx = solveSPD(damped, g);
    if (!dx) {
      lambda *= LM_UP;
      continue;
    }
    const xNew = problem.plus(x, dx);
    const rNew = problem.residual(xNew);
    const costNew = costOf(rNew, opts.robust);
    if (Number.isFinite(costNew) && costNew < cost) {
      // 좋아졌다: 받아들이고 GN 쪽으로
      x = xNew;
      r = rNew;
      cost = costNew;
      lambda = Math.max(lambda / LM_DOWN, 1e-12);
      history.push({ x, cost, lambda });
      if (norm(dx) < opts.tolerance) return finish(true);
    } else {
      // 나빠졌다: 버리고 경사하강 쪽으로 (더 짧게)
      lambda *= LM_UP;
      if (norm(dx) < opts.tolerance) return finish(true);
    }
  }
  return finish(false);
}

export function numericJacobian<X>(f: (x: X) => VecN, x: X, plus: (x: X, delta: VecN) => X, dim: number, eps = 1e-6): number[][] {
  if (!(Number.isInteger(dim) && dim >= 1)) throw new Error("numericJacobian: dim은 1 이상의 정수여야 한다");
  if (!(eps > 0)) throw new Error("numericJacobian: eps는 양수여야 한다");
  const cols: number[][] = [];
  for (let j = 0; j < dim; j++) {
    const d = Array.from({ length: dim }, (_, k) => (k === j ? eps : 0));
    // 중앙 차분: (f(x ⊞ εeⱼ) − f(x ⊞ −εeⱼ)) / 2ε. 한쪽 차분보다 오차가 ε² 수준으로 작다
    const fp = f(plus(x, d));
    const fm = f(plus(x, d.map((v) => -v)));
    cols.push(fp.map((v, i) => (v - fm[i]!) / (2 * eps)));
  }
  const m = cols[0]!.length;
  return Array.from({ length: m }, (_, i) => cols.map((c) => c[i]!));
}
