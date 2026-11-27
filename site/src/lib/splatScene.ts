/**
 * 4b주차 SplatDemo의 장면 계산 (화면 표시용 보조 계산).
 * 공분산 만들기·투영·가중치·알파 합성은 여기서 계산하지 않는다 → 데모가 lib/impl.ts로 core 함수를 가져온다.
 * 여기 있는 것은 그림을 그리는 데만 쓰는 닫힌 식이다 (타원 축, 타원 위의 점, 실제 실루엣 폭, 색 변환).
 *
 * 좌표: 카메라 좌표 (x 오른쪽, y 아래, z 앞). 데모의 카메라는 월드 원점에 있어서 월드 = 카메라 (W = I).
 */

export type V2 = readonly [number, number];
export type V3 = readonly [number, number, number];
export type M2 = readonly [V2, V2];
export type M3 = readonly [V3, V3, V3];

export interface Intr {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
}

/** 데모의 가상 카메라: 320×200, f = 160 (수평 화각 90°) */
export const IMAGE = { width: 320, height: 200 } as const;
export const INTR: Intr = { fx: 160, fy: 160, cx: 160, cy: 100 };

export const IDENTITY3: M3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

const RAD = Math.PI / 180;

/**
 * 가우시안의 방향 R = Rz(roll) · Ry(yaw).
 * yaw: 세로축(y) 둘레 — 위에서 본 그림에서 도는 각. roll: 광축(z) 둘레 — 이미지 안에서 도는 각.
 */
export function rotationYawRoll(yawDeg: number, rollDeg: number): M3 {
  const cy = Math.cos(yawDeg * RAD);
  const sy = Math.sin(yawDeg * RAD);
  const cr = Math.cos(rollDeg * RAD);
  const sr = Math.sin(rollDeg * RAD);
  // Rz(roll) · Ry(yaw), Ry = [[c, 0, s], [0, 1, 0], [−s, 0, c]]
  return [
    [cr * cy, -sr, cr * sy],
    [sr * cy, cr, sr * sy],
    [-sy, 0, cy],
  ];
}

export interface EllipseAxes {
  /** 긴 반축 (1σ) */
  major: number;
  /** 짧은 반축 (1σ) */
  minor: number;
  /** 긴 축의 방향 (도, 첫째 좌표축에서 둘째 좌표축 쪽으로 잰 각, −90 초과 90 이하) */
  angleDeg: number;
}

/** 대칭 2×2 공분산의 타원: 반축 = √고유값, 방향 = 고유벡터. 값이 유한하지 않으면 null */
export function ellipseAxes(S: M2): EllipseAxes | null {
  const a = S[0][0];
  const b = (S[0][1] + S[1][0]) / 2;
  const c = S[1][1];
  if (![a, b, c].every(Number.isFinite)) return null;
  const mid = (a + c) / 2;
  const rad = Math.hypot((a - c) / 2, b);
  const angle = 0.5 * Math.atan2(2 * b, a - c);
  return { major: Math.sqrt(Math.max(0, mid + rad)), minor: Math.sqrt(Math.max(0, mid - rad)), angleDeg: angle / RAD };
}

/** k·σ 타원 위의 점 n개 (닫힌 다각형으로 그린다). 타원을 못 만들면 빈 배열 */
export function ellipsePoints(center: V2, S: M2, k = 1, n = 48): V2[] {
  const axes = ellipseAxes(S);
  if (!axes) return [];
  const cos = Math.cos(axes.angleDeg * RAD);
  const sin = Math.sin(axes.angleDeg * RAD);
  const points: V2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    const p = k * axes.major * Math.cos(t);
    const q = k * axes.minor * Math.sin(t);
    points.push([center[0] + p * cos - q * sin, center[1] + p * sin + q * cos]);
  }
  return points;
}

/** 3D 공분산을 위에서 내려다본 그림자: (x, z) 성분만 남긴 2×2 블록 */
export function marginalXZ(S: M3): M2 {
  return [
    [S[0][0], S[0][2]],
    [S[2][0], S[2][2]],
  ];
}

/** 가우시안 중심이 찍히는 픽셀 (그림의 기준점. z > 0 이라고 가정한다) */
export function centerPixel(p: V3, K: Intr): V2 {
  return [(K.fx * p[0]) / p[2] + K.cx, (K.fy * p[1]) / p[2] + K.cy];
}

/**
 * 1σ 타원체의 "실제" 실루엣이 이미지에서 차지하는 가로 범위 [u_min, u_max] (선형화 없이 원근 그대로).
 * 카메라 원점에서 타원체에 그은 접평면 중 세로축을 품는 두 장이 경계다.
 * 방향 (t, ·, 1) 의 접선 조건: (c_x − t·c_z)² = M00 − 2t·M01 + t²·M11  (M = Σ 의 (x, z) 블록)
 * 타원체가 카메라 평면(z = 0)에 닿으면(c_z² ≤ M11) 실루엣이 끝없이 커져서 null.
 */
export function silhouetteU(center: V3, Sigma: M3, K: Intr): V2 | null {
  const M = marginalXZ(Sigma);
  const cx = center[0];
  const cz = center[2];
  const A = cz * cz - M[1][1];
  if (!(cz > 0) || !(A > 1e-9)) return null;
  const B = cx * cz - M[0][1];
  const C = cx * cx - M[0][0];
  const disc = B * B - A * C;
  if (!(disc >= 0)) return null;
  const root = Math.sqrt(disc);
  return [K.fx * ((B - root) / A) + K.cx, K.fx * ((B + root) / A) + K.cx];
}

// ---- 알파 합성 띠 ----

export interface StripSplat {
  name: string;
  color: V3;
  /** 띠 위의 중심 위치 */
  center: number;
}

/** 띠의 가로 범위와 칸 수. 세 스플랫은 폭(σ = 1)이 같고 중심만 다르다 */
export const STRIP = { min: -3, max: 3, columns: 60 } as const;
export const STRIP_SIGMA: M2 = [
  [1, 0],
  [0, 1],
];
export const STRIP_SPLATS: readonly StripSplat[] = [
  { name: "빨강", color: [0.92, 0.22, 0.16], center: -1 },
  { name: "초록", color: [0.2, 0.74, 0.3], center: 0 },
  { name: "파랑", color: [0.22, 0.42, 0.96], center: 1 },
];

/** 띠의 칸 중심 좌표들 */
export function stripColumns(): number[] {
  const step = (STRIP.max - STRIP.min) / STRIP.columns;
  return Array.from({ length: STRIP.columns }, (_, i) => STRIP.min + step * (i + 0.5));
}

/** 앞에서 뒤로 가는 순서 (스플랫 번호). reversed 면 파랑이 맨 앞 */
export function depthOrder(reversed: boolean): number[] {
  const order = STRIP_SPLATS.map((_, i) => i);
  return reversed ? order.reverse() : order;
}

/** [0, 1] 색 → CSS rgb(). 범위를 벗어나거나 NaN 이면 잘라 낸다 */
export function toCss(color: V3): string {
  const ch = (v: number) => Math.round(255 * Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0)));
  return `rgb(${ch(color[0])} ${ch(color[1])} ${ch(color[2])})`;
}
