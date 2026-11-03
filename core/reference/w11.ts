/** 11주차 정답 구현. 시그니처는 core/mine/w11.ts와 같다. */
import { Matrix, SingularValueDecomposition, determinant } from "ml-matrix";
import { expSO3 } from "@core/prev/w03";
import { eightPoint, ransac } from "@core/prev/w05";
import { decomposeE, pnpDLT, triangulate } from "@core/prev/w06";
import { levenbergMarquardt } from "@core/prev/w07";
import { projectionJacobian, smallBA } from "@core/prev/w08";
import type {
  AteResult,
  BAObservation,
  Feature,
  FeaturePair,
  InitOptions,
  InitResult,
  Intrinsics,
  Keyframe,
  KeyframeRule,
  LocalBAOptions,
  LocalBAResult,
  MapPoint,
  Mat3,
  RpeResult,
  SE3,
  Sim3,
  TrackOptions,
  TrackResult,
  Vec2,
  Vec3,
  VoOptions,
  VoResult,
} from "../types";

const EIGHT = 8;
const PNP_SAMPLE = 6;
const RAD2DEG = 180 / Math.PI;
/** 자세 다듬기: 반복 수, (다듬기 → inlier 다시 세기) 횟수 */
const REFINE_ITERATIONS = 10;
const REFINE_ROUNDS = 2;
/** 새 점을 삼각측량할 때 트랙 시작을 찾아 거슬러 올라가는 최대 프레임 수 */
const MAX_TRACK_BACK = 30;
/** 카메라 뒤로 간 점의 잔차 (픽셀, 8주차 smallBA와 같은 방식) */
const BEHIND_PENALTY = 1e6;

// ---- 작은 도우미 ----

function mv(R: Mat3, v: Vec3): Vec3 {
  return [
    R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2],
    R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2],
    R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2],
  ];
}

function transpose(R: Mat3): Mat3 {
  return [
    [R[0][0], R[1][0], R[2][0]],
    [R[0][1], R[1][1], R[2][1]],
    [R[0][2], R[1][2], R[2][2]],
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

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function norm(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function scale3(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

function mean3(ps: readonly Vec3[]): Vec3 {
  const n = ps.length;
  return [ps.reduce((s, p) => s + p[0], 0) / n, ps.reduce((s, p) => s + p[1], 0) / n, ps.reduce((s, p) => s + p[2], 0) / n];
}

const IDENTITY: SE3 = {
  R: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  t: [0, 0, 0],
};

/** 읽기만: 픽셀 → 정규화 좌표 x̂ = ((u − cx)/fx, (v − cy)/fy) */
export function normalizePixel(K: Intrinsics, uv: Vec2): Vec2 {
  return [(uv[0] - K.cx) / K.fx, (uv[1] - K.cy) / K.fy];
}

function toCamera(T: SE3, X: Vec3): Vec3 {
  const p = mv(T.R, X);
  return [p[0] + T.t[0], p[1] + T.t[1], p[2] + T.t[2]];
}

/** 읽기만: 재투영 오차 (픽셀). T는 T_cw, 점이 카메라 뒤(깊이 ≤ 0)면 Infinity */
export function reprojectionError(K: Intrinsics, T: SE3, X: Vec3, uv: Vec2): number {
  const p = toCamera(T, X);
  if (!(p[2] > 1e-9)) return Infinity;
  return Math.hypot(K.fx * (p[0] / p[2]) + K.cx - uv[0], K.fy * (p[1] / p[2]) + K.cy - uv[1]);
}

/** T_cw의 카메라 중심 (월드) C = −Rᵀt */
function center(T: SE3): Vec3 {
  const c = mv(transpose(T.R), T.t);
  return [-c[0], -c[1], -c[2]];
}

/** 두 카메라 중심에서 X로 가는 광선 사이 각 (도) */
function parallaxDeg(C1: Vec3, C2: Vec3, X: Vec3): number {
  const a = sub(X, C1);
  const b = sub(X, C2);
  const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (norm(a) * norm(b));
  return Math.acos(Math.min(1, Math.max(-1, c))) * RAD2DEG;
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** 읽기만: 두 프레임에 모두 있는 id의 짝 { id, a: 프레임 1 픽셀, b: 프레임 2 픽셀 } (프레임 1 순서) */
export function matchById(f1: readonly Feature[], f2: readonly Feature[]): FeaturePair[] {
  const byId = new Map(f2.map((f) => [f.id, f.uv]));
  return f1.flatMap((f) => {
    const b = byId.get(f.id);
    return b ? [{ id: f.id, a: f.uv, b }] : [];
  });
}

/**
 * 읽기만: 입력 검사. K가 이상하거나(fx, fy ≤ 0, cx·cy가 유한하지 않음), 한 프레임에 같은 id가 두 번 있거나,
 * 특징점 좌표에 NaN·무한대가 있으면 예외 (메시지 앞에 who)
 */
export function checkFrame(
  K: Intrinsics,
  features: readonly Feature[],
  who: string,
): void {
  checkK(K, who);
  const seen = new Set<number>();
  for (const f of features) {
    if (seen.has(f.id)) {
      throw new Error(
        `${who}: 한 프레임에 같은 id(${f.id})가 두 번 있다`,
      );
    }
    seen.add(f.id);
    const [u, v] = f.uv;
    if (!(Number.isFinite(u) && Number.isFinite(v))) {
      throw new Error(
        `${who}: 특징점 좌표에 NaN·무한대가 있다`,
      );
    }
  }
}

function checkK(K: Intrinsics, who: string): void {
  if (!(K.fx > 0 && K.fy > 0 && Number.isFinite(K.cx) && Number.isFinite(K.cy))) throw new Error(`${who}: K가 이상하다 (fx, fy > 0)`);
}

/**
 * 두 자세 T1, T2에서 본 대응을 삼각측량해서 쓸 만한 점만 남긴다:
 * 두 카메라 앞, 두 재투영 오차 < threshold, 시차각 ≥ minParallax (도, 0이면 검사 안 함).
 */
function triangulateGood(K: Intrinsics, T1: SE3, T2: SE3, pairs: readonly FeaturePair[], threshold: number, minParallax: number): { point: MapPoint; parallax: number }[] {
  const C1 = center(T1);
  const C2 = center(T2);
  return pairs.flatMap(({ id, a, b }) => {
    let X: Vec3;
    try {
      X = triangulate(T1, T2, normalizePixel(K, a), normalizePixel(K, b));
    } catch {
      return []; // 광선이 평행
    }
    if (!(reprojectionError(K, T1, X, a) < threshold && reprojectionError(K, T2, X, b) < threshold)) return [];
    const parallax = parallaxDeg(C1, C2, X);
    if (parallax < minParallax) return [];
    return [{ point: { id, X }, parallax }];
  });
}

// ---- 11a ----

export function initMap(K: Intrinsics, f1: readonly Feature[], f2: readonly Feature[], opts: InitOptions): InitResult | null {
  checkFrame(K, f1, "initMap");
  checkFrame(K, f2, "initMap");
  if (!(opts.threshold > 0 && opts.minParallaxDeg >= 0 && opts.minPoints >= 1)) throw new Error("initMap: threshold > 0, minParallaxDeg ≥ 0, minPoints ≥ 1 이어야 한다");

  const pairs = matchById(f1, f2);
  if (pairs.length < Math.max(EIGHT, opts.minPoints)) return null;
  const n1 = pairs.map((p) => normalizePixel(K, p.a));
  const n2 = pairs.map((p) => normalizePixel(K, p.b));
  const f = (K.fx + K.fy) / 2; // 정규화 좌표의 거리를 픽셀로 바꾸는 배율

  // 1) RANSAC으로 E: 오차는 x̂2와 에피폴라 직선 E·x̂1 사이 거리 (픽셀)
  const fit = (s: readonly number[]): Mat3 | null => {
    try {
      return eightPoint(
        s.map((i) => n1[i]!),
        s.map((i) => n2[i]!),
      );
    } catch {
      return null;
    }
  };
  const epiError = (E: Mat3, i: number): number => {
    const l = mv(E, [n1[i]![0], n1[i]![1], 1]);
    const d = Math.hypot(l[0], l[1]);
    if (!(d > 1e-12)) return Infinity;
    return (f * Math.abs(l[0] * n2[i]![0] + l[1] * n2[i]![1] + l[2])) / d;
  };
  const idx = pairs.map((_, i) => i);
  const found = ransac(idx, { sampleSize: EIGHT, fit, error: epiError, threshold: opts.threshold, iterations: opts.iterations, rng: opts.rng });
  if (!found || found.inliers.length < EIGHT) return null;

  // 2) inlier 전체로 E를 다시 맞추고 분해
  const E = fit(found.inliers);
  if (!E) return null;
  let T: SE3;
  try {
    T = decomposeE(
      E,
      found.inliers.map((i) => n1[i]!),
      found.inliers.map((i) => n2[i]!),
    );
  } catch {
    return null;
  }

  // 3) 삼각측량 → 앞에 있고 재투영이 맞는 점만. 시차는 점 하나씩이 아니라 중앙값으로 판정
  const inPairs = found.inliers.map((i) => pairs[i]!);
  const good = triangulateGood(K, IDENTITY, T, inPairs, opts.threshold, 0);
  if (good.length < opts.minPoints) return null;
  const par = median(good.map((g) => g.parallax));
  if (par < opts.minParallaxDeg) return null; // 순수 회전·정지: 깊이를 믿을 수 없다 → 다음 프레임으로 미룬다
  return { T, points: good.map((g) => g.point).sort((a, b) => a.id - b.id), parallaxDeg: par };
}

// ---- 11b ----

interface Corr {
  readonly id: number;
  readonly X: Vec3;
  readonly uv: Vec2;
}

/**
 * 읽기만: 점을 고정하고 자세 T_cw만 LM으로 다듬는다 (모션 전용 BA). 대응 (X, uv)의 재투영 오차를 줄인다.
 * 8a 야코비안의 pose 블록, 좌섭동 R ← Exp(φ)R, t ← Exp(φ)t + ρ. 시도한 자세에서 점이 카메라 뒤면 잔차를 크게 둔다
 */
export function refinePose(
  K: Intrinsics,
  T0: SE3,
  corr: readonly { readonly X: Vec3; readonly uv: Vec2 }[],
): SE3 {
  // 관측마다 [u − u관측, v − v관측]
  const residual = (T: SE3): number[] =>
    corr.flatMap((c) => {
      const p = toCamera(T, c.X);
      if (!(p[2] > 1e-9)) {
        return [BEHIND_PENALTY, BEHIND_PENALTY];
      }
      const u = K.fx * (p[0] / p[2]) + K.cx;
      const v = K.fy * (p[1] / p[2]) + K.cy;
      return [u - c.uv[0], v - c.uv[1]];
    });
  // 8a 야코비안의 pose 블록 (2×6). 뒤면 0
  const zero = (): number[] => new Array<number>(6).fill(0);
  const jacobian = (T: SE3): number[][] =>
    corr.flatMap((c) =>
      toCamera(T, c.X)[2] > 1e-9
        ? projectionJacobian(T, c.X, K).pose
        : [zero(), zero()],
    );
  // 좌섭동: R ← Exp(φ)R, t ← Exp(φ)t + ρ
  const plus = (T: SE3, d: readonly number[]): SE3 => {
    const E = expSO3([d[3]!, d[4]!, d[5]!]);
    const t = mv(E, T.t);
    return {
      R: mm(E, T.R),
      t: [t[0] + d[0]!, t[1] + d[1]!, t[2] + d[2]!],
    };
  };
  const opts = {
    maxIterations: REFINE_ITERATIONS,
    tolerance: 1e-10,
  };
  const problem = { residual, jacobian, plus };
  return levenbergMarquardt<SE3>(problem, T0, opts).x;
}

export function trackPnP(K: Intrinsics, map: readonly MapPoint[], features: readonly Feature[], opts: TrackOptions): TrackResult | null {
  checkFrame(K, features, "trackPnP");
  if (!(opts.threshold > 0 && opts.minInliers >= PNP_SAMPLE)) throw new Error(`trackPnP: threshold > 0, minInliers ≥ ${PNP_SAMPLE} 이어야 한다`);

  const byId = new Map(map.map((p) => [p.id, p.X]));
  const corr: Corr[] = features.flatMap((f) => {
    const X = byId.get(f.id);
    return X ? [{ id: f.id, X, uv: f.uv }] : [];
  });
  if (corr.length < opts.minInliers) return null;

  const fit = (s: readonly Corr[]): SE3 | null => {
    // 3D 점을 무게중심 μ로 옮기고 평균 거리 σ로 나눈 뒤 DLT (월드 좌표가 원점에서 멀면 A의 조건수가 나빠진다).
    // X' = (X − μ)/σ 에서 구한 (R, t') 를 되돌리면 p_c = σ(R·X' + t') = R·X + (σ·t' − R·μ)
    const mu = mean3(s.map((c) => c.X));
    const sigma = s.reduce((acc, c) => acc + norm(sub(c.X, mu)), 0) / s.length;
    if (!(sigma > 0)) return null;
    let T: SE3;
    try {
      T = pnpDLT(
        s.map((c) => scale3(sub(c.X, mu), 1 / sigma)),
        s.map((c) => normalizePixel(K, c.uv)),
      );
    } catch {
      return null;
    }
    const Rmu = mv(T.R, mu);
    return { R: T.R, t: [sigma * T.t[0] - Rmu[0], sigma * T.t[1] - Rmu[1], sigma * T.t[2] - Rmu[2]] };
  };
  const err = (T: SE3, c: Corr): number => reprojectionError(K, T, c.X, c.uv);
  const found = ransac(corr, { sampleSize: PNP_SAMPLE, fit, error: err, threshold: opts.threshold, iterations: opts.iterations, rng: opts.rng });
  if (!found) return null;

  // 자세만 최적화 (점은 고정): DLT는 대수적 오차를 줄일 뿐이라 재투영 오차로 다듬는다.
  // 다듬은 자세로 inlier를 다시 세고 한 번 더 다듬는다
  let T = found.model;
  let inl = found.inliers;
  for (let round = 0; round < REFINE_ROUNDS; round++) {
    T = refinePose(
      K,
      T,
      inl.map((i) => corr[i]!),
    );
    inl = corr.flatMap((c, i) => (err(T, c) < opts.threshold ? [i] : []));
  }
  if (inl.length < opts.minInliers) return null;
  return { T, inliers: inl.map((i) => corr[i]!.id).sort((a, b) => a - b) };
}

/**
 * 읽기만 (11c): 최근 window개 키프레임과 그 안에서 두 번 이상 보인 맵 포인트를 8b smallBA로 함께 고친다.
 * 창에서 가장 오래된 두 키프레임과, 창 밖에서 그 점을 본 키프레임은 고정 카메라로 넣는다.
 */
export function localBA(
  K: Intrinsics,
  keyframes: readonly Keyframe[],
  map: readonly MapPoint[],
  opts: LocalBAOptions,
): LocalBAResult {
  checkK(K, "localBA");
  const w = opts.window;
  if (!(Number.isInteger(w) && w >= 2)) {
    throw new Error("localBA: window는 2 이상의 정수");
  }
  if (keyframes.length < 2) {
    throw new Error("localBA: 키프레임이 2개 이상 필요");
  }

  const first = Math.max(0, keyframes.length - w);
  const active = keyframes.slice(first);
  const pointById = new Map(map.map((p) => [p.id, p.X]));
  const inFront = (T: SE3, X: Vec3): boolean =>
    toCamera(T, X)[2] > 1e-9;

  // 1) 창 안 관측을 점별로 (시작값에서 카메라 앞인 것만)
  type Obs = { cam: number; uv: Vec2 };
  const obsByPoint = new Map<number, Obs[]>();
  active.forEach((kf, cam) => {
    for (const f of kf.features) {
      const X = pointById.get(f.id);
      if (!X || !inFront(kf.T, X)) continue;
      const list = obsByPoint.get(f.id) ?? [];
      obsByPoint.set(f.id, [...list, { cam, uv: f.uv }]);
    }
  });
  // 2) 창 안에서 두 번 이상 보인 점만, id 순서
  const ids = [...obsByPoint.keys()]
    .filter((id) => obsByPoint.get(id)!.length >= 2)
    .sort((a, b) => a - b);
  if (ids.length === 0) {
    return {
      keyframes: [...keyframes],
      map: [...map],
      costs: [],
    };
  }

  // 3) 창 밖 키프레임이 본 관측도 넣되, 그 카메라는
  //    고정한다. 빼면 점이 창 안의 짧은 기준선만으로
  //    다시 맞춰져 오래 쌓은 깊이 정보를 잃는다
  const chosen = new Set(ids);
  const outside = keyframes
    .slice(0, first)
    .flatMap((kf) => {
      const seen = kf.features.filter(
        (f) =>
          chosen.has(f.id) &&
          inFront(kf.T, pointById.get(f.id)!),
      );
      return seen.length > 0 ? [{ kf, seen }] : [];
    });

  // 4) 카메라 순서: 창 안 키프레임, 그다음 창 밖
  const pointIndex = new Map(ids.map((id, i) => [id, i]));
  const n = active.length;
  const inside: BAObservation[] = ids.flatMap(
    (id, point) =>
      obsByPoint.get(id)!.map((o) => ({
        cam: o.cam,
        point,
        uv: o.uv,
      })),
  );
  const outer: BAObservation[] = outside.flatMap(
    ({ seen }, j) =>
      seen.map((f) => ({
        cam: n + j,
        point: pointIndex.get(f.id)!,
        uv: f.uv,
      })),
  );
  // 게이지: 창에서 가장 오래된 두 키프레임(0, 1)과
  // 창 밖 카메라를 고정 (단안 7자유도를 묶는다)
  const fixed = [0, 1, ...outside.map((_, j) => n + j)];
  const cameras = [
    ...active.map((kf) => kf.T),
    ...outside.map(({ kf }) => kf.T),
  ];
  const points = ids.map((id) => pointById.get(id)!);
  const r = smallBA(
    {
      K,
      cameras,
      points,
      observations: [...inside, ...outer],
      fixed,
    },
    opts.solver,
  );

  // 5) 창 안 자세와 쓴 점만 바꾼 새 배열
  const newX = new Map(ids.map((id, i) => [id, r.points[i]!]));
  return {
    keyframes: keyframes.map((kf, i) =>
      i < first ? kf : { ...kf, T: r.cameras[i - first]! },
    ),
    map: map.map((p) => {
      const X = newX.get(p.id);
      return X ? { id: p.id, X } : p;
    }),
    costs: r.costs,
  };
}

/** 읽기만: 새 키프레임을 넣을 때인가 */
export function selectKeyframe(
  framesSince: number,
  tracked: number,
  trackedAtKeyframe: number,
  rule: KeyframeRule,
): boolean {
  if (framesSince >= rule.maxFrames) return true;
  // 보이는 맵이 지난 키프레임 때보다 줄었다
  const shrinking = tracked < rule.minTrackedRatio * trackedAtKeyframe;
  return framesSince >= rule.minFrames && shrinking;
}

// ---- 조립 (읽기만) ----

export interface VoParts {
  readonly initMap: typeof initMap;
  readonly trackPnP: typeof trackPnP;
  readonly localBA: typeof localBA;
}

export type VoFn = (K: Intrinsics, frames: readonly (readonly Feature[])[], opts: VoOptions) => VoResult;

interface VoState {
  readonly keyframes: readonly Keyframe[];
  readonly map: readonly MapPoint[];
  /** 아웃라이어로 맵에서 뺀 트랙 id. 같은 트랙(미끄러진 KLT)을 새 점으로 다시 넣지 않는다 */
  readonly banned: ReadonlySet<number>;
}

/** 초기화: 기준 프레임 ref와 그 뒤 프레임. 공통 점이 너무 적어지면 기준을 옮긴다 */
function findInit(parts: VoParts, K: Intrinsics, frames: readonly (readonly Feature[])[], opts: VoOptions): { ref: number; second: number; init: InitResult } | null {
  let ref = 0;
  for (let i = 1; i < frames.length; i++) {
    opts.onFrame?.(i);
    const init = parts.initMap(K, frames[ref]!, frames[i]!, opts.init);
    if (init) return { ref, second: i, init };
    if (matchById(frames[ref]!, frames[i]!).length < Math.max(EIGHT, opts.init.minPoints)) ref = i;
  }
  return null;
}

/**
 * 새 키프레임의 새 점: 맵에 없는 특징점마다 그 트랙이 처음 보인 (자세가 있는) 프레임까지 거슬러 올라가 그 프레임과 삼각측량한다.
 * 지난 키프레임과만 짝지으면 키프레임 사이에 생긴 트랙을 놓치고 기준선도 짧다. 시차가 작으면(순수 회전) 넣지 않는다.
 */
function newPoints(K: Intrinsics, s: VoState, kf: Keyframe, frames: readonly (readonly Feature[])[], poses: readonly (SE3 | null)[], opts: VoOptions): MapPoint[] {
  const known = new Set(s.map.map((p) => p.id));
  const fresh = kf.features.filter((f) => !known.has(f.id));
  const first = Math.max(0, kf.frame - MAX_TRACK_BACK);
  const uvAt = new Map<number, Map<number, Vec2>>();
  for (let k = first; k < kf.frame; k++) uvAt.set(k, new Map(frames[k]!.map((f) => [f.id, f.uv])));
  // 처음 보인 프레임별로 모은다
  const byStart = new Map<number, FeaturePair[]>();
  for (const f of fresh) {
    let start = -1;
    for (let k = kf.frame - 1; k >= first && poses[k] && uvAt.get(k)!.has(f.id); k--) start = k;
    if (start < 0) continue;
    byStart.set(start, [...(byStart.get(start) ?? []), { id: f.id, a: uvAt.get(start)!.get(f.id)!, b: f.uv }]);
  }
  return [...byStart].flatMap(([k, pairs]) => triangulateGood(K, poses[k]!, kf.T, pairs, opts.init.threshold, opts.init.minParallaxDeg).map((g) => g.point));
}

/**
 * 맵 점 정리: 이번 프레임에서 보였는데 PnP 아웃라이어였던 점은 맵에서 뺀다.
 * KLT 트랙이 다른 곳으로 미끄러진 점은 다시 맞는 일이 드물고, 남겨 두면 다음 추적의 inlier 비율을 깎는다.
 */
function cullOutliers(s: VoState, features: readonly Feature[], inliers: readonly number[]): VoState {
  const inl = new Set(inliers);
  const inMap = new Set(s.map.map((p) => p.id));
  const culled = features.filter((f) => inMap.has(f.id) && !inl.has(f.id)).map((f) => f.id);
  if (culled.length === 0) return s;
  const bad = new Set(culled);
  return { keyframes: s.keyframes, map: s.map.filter((p) => !bad.has(p.id)), banned: new Set([...s.banned, ...culled]) };
}

/** 새 키프레임: 새 점을 넣고 local BA */
function addKeyframe(parts: VoParts, K: Intrinsics, s: VoState, kf: Keyframe, added: readonly MapPoint[], opts: VoOptions): VoState {
  const keyframes = [...s.keyframes, kf];
  const map = [...s.map, ...added];
  if (!opts.ba) return { keyframes, map, banned: s.banned };
  const r = parts.localBA(K, keyframes, map, opts.ba);
  return { keyframes: r.keyframes, map: r.map, banned: s.banned };
}

/**
 * 초기화 직후 두 프레임 BA (첫 프레임만 고정): 두 번째 자세의 오차가 이후 local BA의 고정 키프레임으로 얼어붙지 않게.
 * 스케일 방향은 고정하지 않으므로 LM 감쇠에 맡기고, 끝나면 |t| = 1로 다시 맞춘 뒤 점을 모두 다시 삼각측량한다.
 */
function refineInit(K: Intrinsics, f1: readonly Feature[], f2: readonly Feature[], init: InitResult, opts: VoOptions): InitResult {
  if (!opts.ba || init.points.length === 0) return init;
  const pairs = matchById(f1, f2);
  const byId = new Map(pairs.map((p) => [p.id, p]));
  const used = init.points;
  const observations: BAObservation[] = used.flatMap((p, i) => [
    { cam: 0, point: i, uv: byId.get(p.id)!.a },
    { cam: 1, point: i, uv: byId.get(p.id)!.b },
  ]);
  const r = smallBA({ K, cameras: [IDENTITY, init.T], points: used.map((p) => p.X), observations, fixed: [0] }, opts.ba.solver);
  const T2 = r.cameras[1]!;
  const scale = norm(T2.t);
  if (!(scale > 0)) return init;
  const T: SE3 = { R: T2.R, t: scale3(T2.t, 1 / scale) };
  const kept = new Set(init.points.map((p) => p.id));
  const good = triangulateGood(
    K,
    IDENTITY,
    T,
    pairs.filter((p) => kept.has(p.id)),
    opts.init.threshold,
    0,
  );
  if (good.length < opts.init.minPoints) return init;
  return { T, points: good.map((g) => g.point).sort((a, b) => a.id - b.id), parallaxDeg: median(good.map((g) => g.parallax)) };
}

/** 손코딩한 세 함수를 받아 VO를 만든다 (mine에서도 같은 조립을 쓴다) */
export function makeVo(parts: VoParts): VoFn {
  return (K, frames, opts) => {
    const poses: (SE3 | null)[] = frames.map(() => null);
    const start = findInit(parts, K, frames, opts);
    if (!start) return { poses, keyframes: [], map: [], initFrames: null, lostAt: null };
    const { ref, second } = start;
    const init = refineInit(K, frames[ref]!, frames[second]!, start.init, opts);

    let s: VoState = {
      keyframes: [
        { frame: ref, T: IDENTITY, features: frames[ref]! },
        { frame: second, T: init.T, features: frames[second]! },
      ],
      map: init.points,
      banned: new Set(),
    };
    poses[ref] = IDENTITY;
    poses[second] = init.T;
    // 초기화 두 프레임 사이도 맵이 생겼으니 추적할 수 있다
    for (let j = ref + 1; j < second; j++) poses[j] = parts.trackPnP(K, s.map, frames[j]!, opts.track)?.T ?? null;

    let trackedAtKf = init.points.length;
    let lostAt: number | null = null;
    for (let j = second + 1; j < frames.length; j++) {
      opts.onFrame?.(j);
      const tr = parts.trackPnP(K, s.map, frames[j]!, opts.track);
      if (!tr) {
        lostAt = j; // 다시 초기화(relocalization)는 이 과정 범위 밖
        break;
      }
      poses[j] = tr.T;
      s = cullOutliers(s, frames[j]!, tr.inliers);
      const last = s.keyframes[s.keyframes.length - 1]!;
      if (!selectKeyframe(j - last.frame, tr.inliers.length, trackedAtKf, opts.keyframe)) continue;
      // 키프레임에는 추적 inlier와 새 점 후보(맵에 없고, 아웃라이어로 뺀 적도 없는 트랙)만 남긴다.
      // 맵 점의 아웃라이어 관측이 BA를 끌어당기지 않게
      const inl = new Set(tr.inliers);
      const known = new Set(s.map.map((p) => p.id));
      const features = frames[j]!.filter((f) => inl.has(f.id) || (!known.has(f.id) && !s.banned.has(f.id)));
      const kf: Keyframe = { frame: j, T: tr.T, features };
      const added = newPoints(K, s, kf, frames, poses, opts);
      s = addKeyframe(parts, K, s, kf, added, opts);
      for (const k of s.keyframes) poses[k.frame] = k.T; // BA가 고친 키프레임 자세를 반영
      trackedAtKf = tr.inliers.length + added.length;
    }
    return { poses, keyframes: s.keyframes, map: s.map, initFrames: [ref, second], lostAt };
  };
}

/** 읽기만: 위 세 함수로 조립한 VO. 조립 단계는 makeVo에 있다 */
export function vo(
  K: Intrinsics,
  frames: readonly (readonly Feature[])[],
  opts: VoOptions,
): VoResult {
  const run = makeVo({ initMap, trackPnP, localBA });
  return run(K, frames, opts);
}

// ---- 11d ----

export function alignUmeyama(src: readonly Vec3[], dst: readonly Vec3[], withScale: boolean): Sim3 {
  if (src.length !== dst.length) throw new Error(`alignUmeyama: 두 궤적의 점 개수가 다르다 (${src.length} ≠ ${dst.length})`);
  if (src.length < 3) throw new Error("alignUmeyama: 점이 3개 이상 필요하다");
  if (![...src, ...dst].every((p) => p.every(Number.isFinite))) throw new Error("alignUmeyama: NaN·무한대가 있다");
  const n = src.length;
  const ms = mean3(src);
  const md = mean3(dst);

  // 공분산 Σ = (1/n) Σ (d − μd)(s − μs)ᵀ,  σs² = (1/n) Σ |s − μs|²
  const S = Matrix.zeros(3, 3);
  let varS = 0;
  src.forEach((p, i) => {
    const a = sub(p, ms);
    const b = sub(dst[i]!, md);
    varS += (a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) / n;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S.set(r, c, S.get(r, c) + (b[r]! * a[c]!) / n);
  });
  const svd = new SingularValueDecomposition(S);
  const D = svd.diagonal;
  // 점들이 한 점·한 직선 위면 그 직선 둘레 회전을 정할 수 없다 (둘째 특이값 ≈ 0)
  if (!(varS > 1e-15 && D[1]! > 1e-10 * D[0]!)) throw new Error("alignUmeyama: 점들이 한 점·한 직선 위라 회전이 정해지지 않는다");
  const U = svd.leftSingularVectors;
  const V = svd.rightSingularVectors;
  // 반사가 아니라 회전이 되게: det(U)·det(V) < 0 이면 마지막 축 부호를 뒤집는다
  const sgn = determinant(U) * determinant(V) < 0 ? -1 : 1;
  const Rm = U.mmul(Matrix.diag([1, 1, sgn])).mmul(V.transpose());
  const row = (i: number): Vec3 => [Rm.get(i, 0), Rm.get(i, 1), Rm.get(i, 2)];
  const R: Mat3 = [row(0), row(1), row(2)];
  const s = withScale ? (D[0]! + D[1]! + sgn * D[2]!) / varS : 1;
  const Rms = mv(R, ms);
  return { s, R, t: [md[0] - s * Rms[0], md[1] - s * Rms[1], md[2] - s * Rms[2]] };
}

export function ate(est: readonly Vec3[], gt: readonly Vec3[]): AteResult {
  const align = alignUmeyama(est, gt, true); // 단안: 스케일까지 맞춘다 (Sim(3))
  const errors = est.map((p, i) => {
    const q = mv(align.R, p);
    return norm(sub([align.s * q[0] + align.t[0], align.s * q[1] + align.t[1], align.s * q[2] + align.t[2]], gt[i]!));
  });
  return {
    rmse: Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length),
    mean: errors.reduce((s, e) => s + e, 0) / errors.length,
    median: median(errors),
    max: Math.max(...errors),
    errors,
    align,
  };
}

/** A⁻¹B (A, B는 T_wc). 이동은 s배 */
function rel(A: SE3, B: SE3, s: number): SE3 {
  const Rt = transpose(A.R);
  const d = mv(Rt, sub(B.t, A.t));
  return { R: mm(Rt, B.R), t: scale3(d, s) };
}

/** 회전 행렬의 회전각 (도) */
function angleDeg(R: Mat3): number {
  const c = (R[0][0] + R[1][1] + R[2][2] - 1) / 2;
  return Math.acos(Math.min(1, Math.max(-1, c))) * RAD2DEG;
}

/**
 * 읽기만: Δ 프레임 떨어진 쌍마다 상대 자세 오차.
 * est, gt는 T_wc (카메라 → 월드). scale은 ate의 align.s
 */
export function rpe(
  est: readonly SE3[],
  gt: readonly SE3[],
  delta: number,
  scale: number,
): RpeResult {
  if (est.length !== gt.length) {
    throw new Error("rpe: 두 궤적의 길이가 다르다");
  }
  if (!(Number.isInteger(delta) && delta >= 1)) {
    throw new Error("rpe: delta는 1 이상의 정수");
  }
  if (!(scale > 0)) throw new Error("rpe: scale > 0");
  let st = 0; // 이동 오차 제곱합
  let sr = 0; // 회전 오차 제곱합
  let count = 0;
  for (let i = 0; i + delta < est.length; i++) {
    const j = i + delta;
    // 추정의 상대 움직임만 스케일을 맞춘다
    const P = rel(est[i]!, est[j]!, scale);
    const Q = rel(gt[i]!, gt[j]!, 1);
    // Q⁻¹P: 완벽하면 단위 변환
    const E = rel(Q, P, 1);
    st += norm(E.t) ** 2;
    sr += angleDeg(E.R) ** 2;
    count++;
  }
  if (count === 0) {
    return { transRmse: 0, rotRmseDeg: 0, count: 0 };
  }
  return {
    transRmse: Math.sqrt(st / count),
    rotRmseDeg: Math.sqrt(sr / count),
    count,
  };
}
