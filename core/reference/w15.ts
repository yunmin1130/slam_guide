/** 15주차 정답 구현. 시그니처는 core/mine/w15.ts와 같다. */
import { expSO3 } from "@core/prev/w03";
import { alignUmeyama } from "@core/prev/w11";
import { CholeskyDecomposition, Matrix } from "ml-matrix";
import type { IcpOptions, IcpResult, Mat3, Neighbor, SE3, Vec3 } from "../types";

const MIN_PAIRS_P2P = 3;
const MIN_PAIRS_P2L = 6;
const I3: Mat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

function mm(A: Mat3, B: Mat3): Mat3 {
  const c = (i: number, j: number) => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  const row = (i: number): Vec3 => [c(i, 0), c(i, 1), c(i, 2)];
  return [row(0), row(1), row(2)];
}

function mv(A: Mat3, v: Vec3): Vec3 {
  const r = (i: number) => A[i][0] * v[0] + A[i][1] * v[1] + A[i][2] * v[2];
  return [r(0), r(1), r(2)];
}

function apply(T: SE3, p: Vec3): Vec3 {
  const q = mv(T.R, p);
  return [q[0] + T.t[0], q[1] + T.t[1], q[2] + T.t[2]];
}

function finiteCloud(ps: readonly Vec3[]): boolean {
  return ps.every((p) => p.length === 3 && p.every(Number.isFinite));
}

function checkOptions(opts: IcpOptions, who: string): void {
  if (!(Number.isInteger(opts.maxIterations) && opts.maxIterations >= 1)) throw new Error(`${who}: maxIterations는 1 이상의 정수`);
  if (!(opts.tolerance >= 0)) throw new Error(`${who}: tolerance ≥ 0`);
  if (!(opts.maxDistance > 0)) throw new Error(`${who}: maxDistance > 0`);
}

function checkClouds(src: readonly Vec3[], dst: readonly Vec3[], who: string): void {
  if (src.length === 0 || dst.length === 0) throw new Error(`${who}: 점군이 비어 있다`);
  if (!(finiteCloud(src) && finiteCloud(dst))) throw new Error(`${who}: NaN·무한대가 있다`);
}

/**
 * 읽기만: query 의 점마다 points 에서 가장
 * 가까운 점 (전수 탐색, 같은 거리면 앞 번호)
 */
export function nearestNeighbors(
  query: readonly Vec3[],
  points: readonly Vec3[],
): Neighbor[] {
  if (points.length === 0) {
    throw new Error(
      "nearestNeighbors: 찾을 점이 없다",
    );
  }
  const ok =
    finiteCloud(query) && finiteCloud(points);
  if (!ok) {
    throw new Error(
      "nearestNeighbors: NaN·무한대가 있다",
    );
  }
  return query.map((q) => {
    let best = 0;
    let bestD2 = Infinity;
    points.forEach((p, i) => {
      const dx = p[0] - q[0];
      const dy = p[1] - q[1];
      const dz = p[2] - q[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      // 엄격한 < : 같은 거리면 앞 번호가 남는다
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    });
    return { index: best, dist: Math.sqrt(bestD2) };
  });
}

/** 지금 T 로 옮긴 src 점마다 최근접 dst 를 찾고, maxDistance 안의 짝만 [src 번호, dst 번호] 로 */
function associate(src: readonly Vec3[], dst: readonly Vec3[], T: SE3, maxDistance: number): [number, number][] {
  const nn = nearestNeighbors(src.map((p) => apply(T, p)), dst);
  return nn.flatMap((n, i): [number, number][] => (n.dist <= maxDistance ? [[i, n.index]] : []));
}

function rmseOf(errors: readonly number[]): number {
  return Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length);
}

export function icpPointToPoint(src: readonly Vec3[], dst: readonly Vec3[], opts: IcpOptions): IcpResult {
  checkClouds(src, dst, "icpPointToPoint");
  checkOptions(opts, "icpPointToPoint");
  let T: SE3 = opts.init ?? { R: I3, t: [0, 0, 0] };
  const history: number[] = [];
  let pairs = 0;
  let converged = false;
  for (let it = 0; it < opts.maxIterations; it++) {
    // 1) 대응: 지금 변환으로 옮긴 src 의 최근접 dst
    const match = associate(src, dst, T, opts.maxDistance);
    if (match.length < MIN_PAIRS_P2P) throw new Error(`icpPointToPoint: maxDistance 안의 대응이 ${MIN_PAIRS_P2P}개 미만이다`);
    // 2) 그 대응으로 원래 src → dst 강체 정렬 (11d 우메야마, 스케일 없이)
    const S = match.map(([i]) => src[i]!);
    const D = match.map(([, j]) => dst[j]!);
    const a = alignUmeyama(S, D, false);
    T = { R: a.R, t: a.t };
    pairs = match.length;
    const rmse = rmseOf(
      S.map((p, k) => {
        const q = apply(T, p);
        return Math.hypot(q[0] - D[k]![0], q[1] - D[k]![1], q[2] - D[k]![2]);
      }),
    );
    const prev = history[history.length - 1];
    history.push(rmse);
    // 3) RMSE 가 거의 안 바뀌면 멈춘다
    if (prev !== undefined && Math.abs(prev - rmse) < opts.tolerance) {
      converged = true;
      break;
    }
  }
  return { T, rmse: history[history.length - 1]!, pairs, iterations: history.length, converged, history };
}

/**
 * 읽기만: 점-평면 ICP.
 * 대응마다 오차 r = nᵀ(T·s − q)
 * (q 의 법선 n 방향 거리)를
 * 7a 가우스-뉴턴 한 걸음씩 줄인다.
 * 좌섭동 T ← Exp(δ)·T, δ = [ρ; φ] (1차),
 * x = T·s 이면 ∂x/∂ρ = I, ∂x/∂φ = −[x]×
 * → 야코비안 한 행은 [nᵀ, (x × n)ᵀ].
 */
export function icpPointToPlane(
  src: readonly Vec3[],
  dst: readonly Vec3[],
  normals: readonly Vec3[],
  opts: IcpOptions,
): IcpResult {
  const who = "icpPointToPlane";
  checkClouds(src, dst, who);
  checkOptions(opts, who);
  const sameCount = normals.length === dst.length;
  if (!sameCount || !finiteCloud(normals)) {
    throw new Error(
      `${who}: 법선은 dst 와 개수가 같고 ` +
        "NaN 이 없어야 한다",
    );
  }
  // 법선을 길이 1로
  const unit = normals.map((n): Vec3 => {
    const l = Math.hypot(...n);
    if (!(l > 1e-12)) {
      throw new Error(`${who}: 길이 0인 법선`);
    }
    return [n[0] / l, n[1] / l, n[2] / l];
  });
  // 짝마다 r = n·(T·s − q)
  type Pair = readonly [number, number];
  const residuals = (
    match: readonly Pair[],
    X: SE3,
  ): number[] =>
    match.map(([i, j]) => {
      const x = apply(X, src[i]!);
      const q = dst[j]!;
      const n = unit[j]!;
      const dx = x[0] - q[0];
      const dy = x[1] - q[1];
      const dz = x[2] - q[2];
      return n[0] * dx + n[1] * dy + n[2] * dz;
    });

  let T: SE3 = opts.init ?? {
    R: I3,
    t: [0, 0, 0],
  };
  const history: number[] = [];
  let pairs = 0;
  let converged = false;
  for (let it = 0; it < opts.maxIterations; it++) {
    const match = associate(
      src,
      dst,
      T,
      opts.maxDistance,
    );
    if (match.length < MIN_PAIRS_P2L) {
      throw new Error(
        `${who}: maxDistance 안의 대응이 ` +
          `${MIN_PAIRS_P2L}개 미만이다`,
      );
    }
    // 정규방정식 JᵀJ·δ = −Jᵀr (6×6)
    const r = residuals(match, T);
    const H = Matrix.zeros(6, 6);
    const g = Matrix.zeros(6, 1);
    match.forEach(([i, j], k) => {
      const x = apply(T, src[i]!);
      const n = unit[j]!;
      // c = x × n
      const c: Vec3 = [
        x[1] * n[2] - x[2] * n[1],
        x[2] * n[0] - x[0] * n[2],
        x[0] * n[1] - x[1] * n[0],
      ];
      const row = [...n, ...c];
      for (let a = 0; a < 6; a++) {
        const ga = g.get(a, 0) + row[a]! * r[k]!;
        g.set(a, 0, ga);
        for (let b = 0; b < 6; b++) {
          const h = row[a]! * row[b]!;
          H.set(a, b, H.get(a, b) + h);
        }
      }
    });
    const chol = new CholeskyDecomposition(H);
    // 평면 하나·평행한 평면들뿐이면 미끄러지는
    // 방향이 생겨 JᵀJ 가 특이하다
    if (!chol.isPositiveDefinite()) {
      throw new Error(
        `${who}: 기하가 퇴화했다 ` +
          "(평면들이 모든 방향을 막지 못한다)",
      );
    }
    const d = chol.solve(g.neg()).to1DArray();
    // 좌섭동 업데이트 (11b refinePose 와 같은
    // 분리형): R ← Exp(φ)·R, t ← Exp(φ)·t + ρ.
    // 엄밀한 Exp(δ)·T 는 t 에 V(φ)·ρ 를 더하지만
    // 1차까지 같아서 가우스-뉴턴 수렴은 그대로다
    const E = expSO3([d[3]!, d[4]!, d[5]!]);
    const t = mv(E, T.t);
    T = {
      R: mm(E, T.R),
      t: [t[0] + d[0]!, t[1] + d[1]!, t[2] + d[2]!],
    };
    pairs = match.length;
    const rmse = rmseOf(residuals(match, T));
    const prev = history[history.length - 1];
    history.push(rmse);
    // 첫 반복은 비교할 값이 없다
    const small =
      prev !== undefined &&
      Math.abs(prev - rmse) < opts.tolerance;
    if (small) {
      converged = true;
      break;
    }
  }
  return {
    T,
    rmse: history[history.length - 1]!,
    pairs,
    iterations: history.length,
    converged,
    history,
  };
}
