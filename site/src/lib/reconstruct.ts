/**
 * 6주차 "3D 복원" 계산 (화면과 분리한 순수 함수).
 * 대응점(정규화 좌표) → 5주차 정답 RANSAC으로 E → decomposeE → triangulate → pnpDLT로 되짚어 확인.
 * 6주차 함수(decomposeE, triangulate, pnpDLT)는 호출하는 쪽이 lib/impl.ts로 가져와 넘긴다 (내 구현/정답 토글).
 * 어느 함수에서 실패했는지 알 수 있게 단계 이름을 붙인 StageError를 던진다.
 */
import { isFiniteMatrix, makeFitter, makeScene, pointLineDistance, SCENE_K, seededRng, type M3, type V2, type V3 } from "./epipolarScene";

export interface Pose {
  R: M3;
  t: V3;
}

export interface W05Fns {
  eightPoint: (a: readonly V2[], b: readonly V2[]) => M3;
  ransac: <T, M>(
    items: readonly T[],
    opts: { sampleSize: number; fit: (s: readonly T[]) => M | null; error: (m: M, t: T) => number; threshold: number; iterations: number; rng: () => number },
  ) => { model: M; inliers: readonly number[] } | null;
}

// type(인터페이스 아님): useImplFns의 함수 묶음 제약(인덱스 시그니처)을 만족하려고
export type W06Fns = {
  decomposeE: (E: M3, x1: readonly V2[], x2: readonly V2[]) => Pose;
  triangulate: (T1: Pose, T2: Pose, x1: V2, x2: V2) => V3;
  pnpDLT: (Xw: readonly V3[], x: readonly V2[]) => Pose;
};

export class StageError extends Error {
  constructor(
    readonly stage: string,
    message: string,
  ) {
    super(message);
  }
}

export interface ReconResult {
  /** RANSAC 인라이어 수 / 전체 대응 수 */
  inliers: number;
  total: number;
  /** decomposeE가 고른 상대 자세 (|t| = 1) */
  T21: Pose;
  /** 두 카메라 앞에 온 3D 점 (카메라 1 좌표계, 단위는 |t| = 1) */
  points: V3[];
  /** 삼각측량했지만 한쪽 카메라 뒤로 간 점 수, 삼각측량이 예외를 던진 점 수 */
  behind: number;
  failed: number;
  /** 복원한 점을 두 사진에 다시 투영했을 때 오차의 중앙값 (픽셀) */
  reprojMedianPx: number;
  /** 복원한 점의 깊이(카메라 1 기준 z) 중앙값. 단위는 두 카메라 사이 거리 = 1 */
  depthMedian: number;
  /** pnpDLT(3D 점, 사진 2)로 구한 자세와 decomposeE 자세의 차이. 점이 6개 미만이면 null */
  pnpCheck: { rotDeg: number; tDeg: number } | null;
}

const THRESHOLD_PX = 2;
const ITERATIONS = 1000;
const IDENTITY: Pose = {
  R: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  t: [0, 0, 0],
};

export function applyPose(T: Pose, p: V3): V3 {
  const r = (i: number) => T.R[i]![0] * p[0] + T.R[i]![1] * p[1] + T.R[i]![2] * p[2] + T.t[i]!;
  return [r(0), r(1), r(2)];
}

/** 카메라 중심의 월드 좌표: p_c = R·c + t = 0 → c = −Rᵀt */
export function cameraCenter(T: Pose): V3 {
  const { R, t } = T;
  return [
    -(R[0][0] * t[0] + R[1][0] * t[1] + R[2][0] * t[2]),
    -(R[0][1] * t[0] + R[1][1] * t[1] + R[2][1] * t[2]),
    -(R[0][2] * t[0] + R[1][2] * t[1] + R[2][2] * t[2]),
  ];
}

/** 두 회전 사이의 각도 (도) */
export function rotationDiffDeg(A: M3, B: M3): number {
  let tr = 0;
  for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) tr += A[k]![i]! * B[k]![i]!;
  return (Math.acos(Math.min(1, Math.max(-1, (tr - 1) / 2))) * 180) / Math.PI;
}

/** 두 방향 사이의 각도 (도) */
export function directionDiffDeg(a: V3, b: V3): number {
  const na = Math.hypot(...a);
  const nb = Math.hypot(...b);
  if (!(na > 0 && nb > 0)) return Number.NaN;
  const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (na * nb);
  return (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
}

function median(xs: number[]): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((p, q) => p - q);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function isPose(T: unknown): T is Pose {
  const p = T as Pose | null;
  return !!p && isFiniteMatrix(p.R) && Array.isArray(p.t) && p.t.length === 3 && p.t.every(Number.isFinite);
}

function stage<T>(name: string, f: () => T): T {
  try {
    return f();
  } catch (e) {
    throw new StageError(name, e instanceof Error ? e.message : String(e));
  }
}

/** E 추정 (5주차 정답): RANSAC → 인라이어 전부로 다시 맞추기 → 그 E로 인라이어 다시 세기 */
function estimateE(w5: W05Fns, a: readonly V2[], b: readonly V2[], scale: number): { E: M3; inl: number[] } {
  const idx = a.map((_, i) => i);
  const fitter = makeFitter(w5.eightPoint, a, b);
  const r = w5.ransac(idx, {
    sampleSize: 8,
    fit: fitter.fit,
    error: (F, i) => pointLineDistance(F, a[i]!, b[i]!) * scale,
    threshold: THRESHOLD_PX,
    iterations: ITERATIONS,
    rng: seededRng(1),
  });
  if (!r) throw new StageError("E 추정", "RANSAC이 E를 찾지 못했다 (대응점이 너무 적거나 거의 다 엉뚱하다)");
  const E = (r.inliers.length >= 8 ? fitter.fit(r.inliers) : null) ?? r.model;
  const inl = idx.filter((i) => pointLineDistance(E, a[i]!, b[i]!) * scale < THRESHOLD_PX);
  return { E, inl };
}

interface Triangulated {
  points: V3[];
  kept2: V2[];
  errs: number[];
  behind: number;
  failed: number;
  lastError: string;
}

/** 인라이어마다 삼각측량, 두 카메라 앞인 점만 남기고 재투영 오차(픽셀)를 잰다 */
function triangulateAll(w6: W06Fns, T21: Pose, ia: readonly V2[], ib: readonly V2[], scale: number): Triangulated {
  const out: Triangulated = { points: [], kept2: [], errs: [], behind: 0, failed: 0, lastError: "" };
  ia.forEach((p, i) => {
    const q2 = ib[i]!;
    let X: V3;
    try {
      X = w6.triangulate(IDENTITY, T21, p, q2);
    } catch (e) {
      out.failed++;
      out.lastError = e instanceof Error ? e.message : String(e);
      return;
    }
    if (!Array.isArray(X) || X.length !== 3 || !X.every(Number.isFinite)) {
      out.failed++;
      out.lastError = "[x, y, z] 꼴의 유한한 값을 돌려주지 않았다";
      return;
    }
    const q = applyPose(T21, X);
    if (!(X[2] > 0 && q[2] > 0)) {
      out.behind++;
      return;
    }
    out.points.push(X);
    out.kept2.push(q2);
    const e1 = Math.hypot(X[0] / X[2] - p[0], X[1] / X[2] - p[1]);
    const e2 = Math.hypot(q[0] / q[2] - q2[0], q[1] / q[2] - q2[1]);
    out.errs.push(((e1 + e2) / 2) * scale);
  });
  return out;
}

/**
 * 대응점(정규화 좌표)으로 두 카메라 자세와 3D 점을 복원한다.
 * scale: 정규화 좌표 → 픽셀 (보통 초점거리). RANSAC 임계값과 재투영 오차를 픽셀로 재려고.
 */
export function reconstruct(w5: W05Fns, w6: W06Fns, a: readonly V2[], b: readonly V2[], scale: number): ReconResult {
  if (a.length < 8) throw new StageError("입력", `쓸 수 있는 대응점이 ${a.length}개뿐이다 (8개 이상 필요)`);
  const { E, inl } = estimateE(w5, a, b, scale);
  const ia = inl.map((i) => a[i]!);
  const ib = inl.map((i) => b[i]!);

  const T21 = stage("decomposeE", () => w6.decomposeE(E, ia, ib));
  if (!isPose(T21)) throw new StageError("decomposeE", "{ R: 3×3, t: [x, y, z] } 꼴의 유한한 값을 돌려주지 않았다");

  const tri = triangulateAll(w6, T21, ia, ib, scale);
  if (tri.points.length === 0) {
    throw new StageError("triangulate", tri.failed > 0 ? `모든 점에서 실패했다: ${tri.lastError}` : "두 카메라 앞에 온 점이 하나도 없다");
  }

  let pnpCheck: ReconResult["pnpCheck"] = null;
  if (tri.points.length >= 6) {
    const T = stage("pnpDLT", () => w6.pnpDLT(tri.points, tri.kept2));
    if (!isPose(T)) throw new StageError("pnpDLT", "{ R: 3×3, t: [x, y, z] } 꼴의 유한한 값을 돌려주지 않았다");
    pnpCheck = { rotDeg: rotationDiffDeg(T.R, T21.R), tDeg: directionDiffDeg(T.t, T21.t) };
  }

  return {
    inliers: inl.length,
    total: a.length,
    T21,
    points: tri.points,
    behind: tri.behind,
    failed: tri.failed,
    reprojMedianPx: median(tri.errs),
    depthMedian: median(tri.points.map((p) => p[2])),
    pnpCheck,
  };
}

/**
 * 연습용 합성 장면 (5주차 데모와 같은 장면): 정답 자세를 알아서 결과를 직접 비교할 수 있다.
 * 픽셀 → 정규화 좌표는 장면 카메라의 K로 바로 바꾼다 (왜곡 없음).
 */
export function syntheticPairs(seed: number): { a: V2[]; b: V2[]; scale: number; truth: Pose } {
  const s = makeScene({ seed, count: 150, noisePx: 0.5, outlierRatio: 0.3 });
  const norm = (p: V2): V2 => [(p[0] - SCENE_K.cx) / SCENE_K.fx, (p[1] - SCENE_K.cy) / SCENE_K.fy];
  return { a: s.x1.map(norm), b: s.x2.map(norm), scale: SCENE_K.fx, truth: { R: s.R, t: s.t } };
}
