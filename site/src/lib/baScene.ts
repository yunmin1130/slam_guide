/**
 * 8b BaDemo의 장면 (화면 표시용 보조 계산).
 * 카메라 4대가 점 무리를 둘러싸고 보는 합성 장면, 흔든 시작값, 정규방정식 H의 블록 희소 구조.
 * 번들 조정 자체(smallBA)는 여기서 하지 않는다 → 데모가 lib/impl.ts로 core 함수를 가져온다.
 */
import { seededRng, type M3, type V2, type V3 } from "./epipolarScene";

export interface Pose {
  R: M3;
  t: V3;
}
export interface Obs {
  cam: number;
  point: number;
  uv: V2;
}

export const BA_K = { fx: 500, fy: 500, cx: 320, cy: 240 } as const;
export const FIXED = [0, 1] as const;
const CAM_DEG = [-40, -15, 15, 40];
export const CAMERA_COUNT = CAM_DEG.length;
const POINTS = 24;
const CENTER_Z = 6;

function rotY(a: number): M3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c],
  ];
}

function transpose(R: M3): M3 {
  return [
    [R[0][0], R[1][0], R[2][0]],
    [R[0][1], R[1][1], R[2][1]],
    [R[0][2], R[1][2], R[2][2]],
  ];
}

function mv(R: M3, v: readonly number[]): V3 {
  return [
    R[0][0] * v[0]! + R[0][1] * v[1]! + R[0][2] * v[2]!,
    R[1][0] * v[0]! + R[1][1] * v[1]! + R[1][2] * v[2]!,
    R[2][0] * v[0]! + R[2][1] * v[1]! + R[2][2] * v[2]!,
  ];
}

/** A·B: B의 열마다 A를 곱해 열로 모은 뒤 전치 */
function mm(A: M3, B: M3): M3 {
  return transpose([mv(A, [B[0][0], B[1][0], B[2][0]]), mv(A, [B[0][1], B[1][1], B[2][1]]), mv(A, [B[0][2], B[1][2], B[2][2]])]);
}

/** 회전 벡터 → 회전행렬 (로드리게스) */
function expRot(w: readonly number[]): M3 {
  const th = Math.hypot(w[0]!, w[1]!, w[2]!);
  if (th < 1e-15) {
    return [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
  }
  const [x, y, z] = [w[0]! / th, w[1]! / th, w[2]! / th];
  const c = Math.cos(th);
  const s = Math.sin(th);
  const C = 1 - c;
  return [
    [c + x * x * C, x * y * C - z * s, x * z * C + y * s],
    [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
    [z * x * C - y * s, z * y * C + x * s, c + z * z * C],
  ];
}

function gaussian(rng: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-12))) * Math.cos(2 * Math.PI * rng());
}

export function project(T: Pose, X: V3): V2 | null {
  const p = mv(T.R, X);
  const z = p[2] + T.t[2];
  if (!(z > 1e-9)) return null;
  return [BA_K.fx * ((p[0] + T.t[0]) / z) + BA_K.cx, BA_K.fy * ((p[1] + T.t[1]) / z) + BA_K.cy];
}

/** 카메라 중심의 월드 좌표 c = −Rᵀt */
export function center(T: Pose): V3 {
  return mv(transpose(T.R), T.t).map((v) => -v) as unknown as V3;
}

export interface BaScene {
  truth: { cams: Pose[]; pts: V3[] };
  start: { cams: Pose[]; pts: V3[] };
  obs: Obs[];
}

/**
 * spread: 시작값을 흔드는 정도 (0 ~ 1). 1이면 카메라 회전 ±3°, 이동 ±0.3, 점 ±0.8 정도.
 * 처음 두 카메라는 정답 그대로 둔다 (게이지 고정).
 */
export function makeBaScene(seed: number, noisePx: number, spread: number): BaScene {
  const rng = seededRng(seed);
  const cams: Pose[] = CAM_DEG.map((deg) => {
    const a = (deg * Math.PI) / 180;
    const c = [6 * Math.sin(a), 0.4 * Math.sin(3 * a), CENTER_Z - 6 * Math.cos(a)];
    const R = transpose(rotY(-a)); // 카메라가 무리 가운데를 본다
    return { R, t: mv(R, c).map((v) => -v) as unknown as V3 };
  });
  const pts: V3[] = Array.from({ length: POINTS }, () => [(rng() - 0.5) * 5, (rng() - 0.5) * 2, CENTER_Z + (rng() - 0.5) * 4] as V3);
  const obs: Obs[] = [];
  cams.forEach((T, c) =>
    pts.forEach((X, p) => {
      const uv = project(T, X);
      if (uv) obs.push({ cam: c, point: p, uv: [uv[0] + gaussian(rng) * noisePx, uv[1] + gaussian(rng) * noisePx] });
    }),
  );
  const startCams = cams.map((T, c) => {
    if ((FIXED as readonly number[]).includes(c)) return T;
    const E = expRot([0, 1, 2].map(() => (rng() - 0.5) * 2 * 0.05 * spread));
    const t = mv(E, T.t).map((v) => v + (rng() - 0.5) * 2 * 0.3 * spread) as unknown as V3;
    return { R: mm(E, T.R), t };
  });
  const startPts = pts.map((X) => X.map((v) => v + (rng() - 0.5) * 2 * 0.8 * spread) as unknown as V3);
  return { truth: { cams, pts }, start: { cams: startCams, pts: startPts }, obs };
}

/** 카메라 뒤로 간 관측 수 (재투영 RMS에서 빠지므로 따로 보여준다) */
export function behindCount(cams: readonly Pose[], pts: readonly V3[], obs: readonly Obs[]): number {
  return obs.filter((o) => project(cams[o.cam]!, pts[o.point]!) === null).length;
}

/** 재투영 오차 RMS (픽셀). 카메라 뒤로 간 점은 빼고 센다 */
export function rmsReprojection(cams: readonly Pose[], pts: readonly V3[], obs: readonly Obs[]): number {
  let s = 0;
  let n = 0;
  for (const o of obs) {
    const uv = project(cams[o.cam]!, pts[o.point]!);
    if (!uv) continue;
    s += (uv[0] - o.uv[0]) ** 2 + (uv[1] - o.uv[1]) ** 2;
    n++;
  }
  return n ? Math.sqrt(s / n) : Number.NaN;
}

/**
 * 정규방정식 H = JᵀJ의 블록 구조. 변수 블록 순서는 smallBA와 같다 (고정 안 한 카메라 → 점).
 * filled[i][j] = 블록 i와 j를 함께 보는 관측이 있으면 true (대각은 그 변수를 보는 관측이 있으면).
 */
export function hessianBlocks(
  cameraCount: number,
  pointCount: number,
  obs: readonly Obs[],
  fixed: readonly number[],
): { freeCams: number[]; filled: boolean[][] } {
  const freeCams = Array.from({ length: cameraCount }, (_, c) => c).filter((c) => !fixed.includes(c));
  const nb = freeCams.length + pointCount;
  const filled = Array.from({ length: nb }, () => new Array<boolean>(nb).fill(false));
  for (const o of obs) {
    const ci = freeCams.indexOf(o.cam);
    const pi = freeCams.length + o.point;
    filled[pi]![pi] = true;
    if (ci >= 0) {
      filled[ci]![ci] = true;
      filled[ci]![pi] = true;
      filled[pi]![ci] = true;
    }
  }
  return { freeCams, filled };
}
