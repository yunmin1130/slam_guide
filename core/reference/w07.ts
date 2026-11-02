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

/** 대칭 행렬 (행마다 Float64Array, 위·아래 삼각 모두 채움) */
type SymMatrix = Float64Array[];

/**
 * 가중 정규방정식 H = JᵀWJ, g = JᵀWr.
 * 행 하나씩 Hₐᵦ += wᵢ·Jᵢₐ·Jᵢᵦ 로 더하고 0인 칸은 건너뛴다. BA처럼 한 행에 0이 아닌 칸이 몇 개뿐인
 * 야코비안에서는 행렬 곱 JᵀJ를 통째로 하는 것보다 훨씬 빠르다 (8b 희소성). 결과는 같다.
 */
function normalEquations(J: MatN, r: VecN, robust: SolverOptions["robust"]): { H: SymMatrix; g: Float64Array } {
  const n = J[0]?.length ?? 0;
  const H: SymMatrix = Array.from({ length: n }, () => new Float64Array(n));
  const g = new Float64Array(n);
  J.forEach((row, i) => {
    const w = robust ? robust(r[i]!).weight : 1;
    const nz: number[] = [];
    row.forEach((v, k) => {
      if (v !== 0) nz.push(k);
    });
    for (let p = 0; p < nz.length; p++) {
      const a = nz[p]!;
      const wa = w * row[a]!;
      g[a]! += wa * r[i]!;
      const Ha = H[a]!;
      for (let q = p; q < nz.length; q++) Ha[nz[q]!]! += wa * row[nz[q]!]!; // 위 삼각만 (a ≤ b)
    }
  });
  for (let a = 0; a < n; a++) for (let b = 0; b < a; b++) H[a]![b] = H[b]![a]!; // 아래 삼각은 복사 (정확히 대칭)
  return { H, g };
}

/** 변수가 이 개수 이하면 보통 숄레스키 (작은 문제의 결과를 예전과 똑같이 유지), 넘으면 희소 소거 */
const DENSE_MAX = 64;

/** H δ = −g 를 숄레스키로 푼다. H가 양의 정부호가 아니면 null */
function solveSPD(H: SymMatrix, g: Float64Array): number[] | null {
  if (!H.every((row) => row.every(Number.isFinite)) || !g.every(Number.isFinite)) return null; // 잔차·야코비안에 NaN이 섞임
  return g.length <= DENSE_MAX ? solveDense(H, g) : solveSparse(H, g);
}

function solveDense(H: SymMatrix, g: Float64Array): number[] | null {
  const chol = new CholeskyDecomposition(new Matrix(H.map((row) => Array.from(row))));
  if (!chol.isPositiveDefinite()) return null;
  const d = chol.solve(Matrix.columnVector(Array.from(g, (v) => -v))).getColumn(0);
  return d.every(Number.isFinite) ? d : null;
}

/**
 * 큰 문제용 숄레스키 (H = LLᵀ): 변수를 뒤에서부터 소거하고 0인 칸은 건너뛴다.
 * BA는 변수가 [카메라, 점] 순서라 점을 먼저 지우게 되어 8b의 Schur 보수와 같은 계산이 된다:
 * 점 하나를 지우면 그 점을 본 카메라끼리만 채워진다. 답은 순서와 상관없이 같다(반올림 차이만).
 */
function solveSparse(H: SymMatrix, g: Float64Array): number[] | null {
  const n = g.length;
  // A = 뒤집은 순서의 H (아래 삼각만 쓴다). A[i][j] = H[n−1−i][n−1−j]
  const A: SymMatrix = Array.from({ length: n }, (_, i) => {
    const src = H[n - 1 - i]!;
    const row = new Float64Array(i + 1);
    for (let j = 0; j <= i; j++) row[j] = src[n - 1 - j]!;
    return row;
  });
  for (let k = 0; k < n; k++) {
    const d = A[k]![k]!;
    if (!(d > 0)) return null;
    const lkk = Math.sqrt(d);
    A[k]![k] = lkk;
    const nz: number[] = [];
    for (let i = k + 1; i < n; i++) {
      if (A[i]![k] !== 0) {
        A[i]![k]! /= lkk;
        nz.push(i);
      }
    }
    // 남은 부분 행렬에서 L[:,k]·L[:,k]ᵀ 를 뺀다 (0이 아닌 칸끼리만)
    for (let p = 0; p < nz.length; p++) {
      const a = nz[p]!;
      const la = A[a]![k]!;
      const rowA = A[a]!;
      for (let q = 0; q <= p; q++) rowA[nz[q]!]! -= la * A[nz[q]!]![k]!;
    }
  }
  // L y = −g (뒤집은 순서), Lᵀ x = y
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = -g[n - 1 - i]!;
    const row = A[i]!;
    for (let j = 0; j < i; j++) if (row[j] !== 0) s -= row[j]! * y[j]!;
    y[i] = s / row[i]!;
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let j = i + 1; j < n; j++) {
      const l = A[j]![i]!;
      if (l !== 0) s -= l * x[j]!;
    }
    x[i] = s / A[i]![i]!;
  }
  const d = Array.from({ length: n }, (_, i) => x[n - 1 - i]!);
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
    // 대각만 잠시 바꿨다가 되돌린다 (큰 BA에서 n×n 복사본을 반복마다 만들지 않게)
    const diag = H.map((row, i) => row[i]!);
    H.forEach((row, i) => (row[i] = diag[i]! * (1 + lambda) + 1e-12));
    const dx = solveSPD(H, g);
    H.forEach((row, i) => (row[i] = diag[i]!));
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
