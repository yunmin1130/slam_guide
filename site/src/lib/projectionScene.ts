/**
 * 4주차 ProjectionDemo의 장면 계산 (화면 표시용 보조 계산).
 * 투영(project)·왜곡(distort)은 여기서 계산하지 않는다 → 데모가 lib/impl.ts의 loadFn으로 가져온다.
 *
 * 좌표계 두 가지:
 * - 카메라 좌표: x 오른쪽, y 아래, z 앞(광축). core 함수가 받는 좌표다.
 * - 장면(수학) 좌표: x 오른쪽, y 앞, z 위. 공용 3D 뷰어(Viewer3D)가 받는 좌표다.
 */

export type V2 = readonly [number, number];
export type V3 = readonly [number, number, number];

export interface Intr {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
}

/** JetBot 카메라를 820×616으로 줄인 해상도 (DATA §4) */
export const IMAGE = { width: 820, height: 616 } as const;

/** 체커보드 크기: 내부 교차점 9×6, 간격 0.25m */
const BOARD_COLS = 9;
const BOARD_ROWS = 6;
const BOARD_SPACING = 0.25;
/** 선 하나를 이만큼 잘게 나눠야 왜곡으로 휘는 모습이 보인다 */
const SAMPLES_PER_CELL = 6;

/** 카메라 좌표 → 장면 좌표: (x, y, z)_cam → (x, z, -y)_scene */
export function cameraToWorld(p: V3): V3 {
  return [p[0], p[2], -p[1]];
}

/** 정사각 픽셀, 주점은 이미지 가운데 */
export function intrinsicsFor(focal: number): Intr {
  return { fx: focal, fy: focal, cx: IMAGE.width / 2, cy: IMAGE.height / 2 };
}

/** 정규화 평면 좌표 → 픽셀 (K 곱하기) */
export function toPixel(x: V2, K: Intr): V2 {
  return [K.fx * x[0] + K.cx, K.fy * x[1] + K.cy];
}

/** 픽셀 → 정규화 평면 좌표 (K⁻¹ 곱하기) */
export function toNormalized(px: V2, K: Intr): V2 {
  return [(px[0] - K.cx) / K.fx, (px[1] - K.cy) / K.fy];
}

export function insideImage(px: V2): boolean {
  return px[0] >= 0 && px[0] <= IMAGE.width && px[1] >= 0 && px[1] <= IMAGE.height;
}

export interface BoardParams {
  /** 판 가운데까지의 거리 (m, 광축 위) */
  depth: number;
  /** 판을 세로축(카메라 y) 둘레로 돌린 각 (도). 양수면 오른쪽이 멀어진다 */
  tiltDeg: number;
}

/** 판 위의 (s, t) (판 가운데 기준, m) → 카메라 좌표 */
function boardPoint(s: number, t: number, { depth, tiltDeg }: BoardParams): V3 {
  const a = (tiltDeg * Math.PI) / 180;
  return [s * Math.cos(a), t, depth + s * Math.sin(a)];
}

const halfWidth = ((BOARD_COLS - 1) * BOARD_SPACING) / 2;
const halfHeight = ((BOARD_ROWS - 1) * BOARD_SPACING) / 2;

/**
 * 체커보드 격자선 (카메라 좌표). 가로선·세로선 각각을 촘촘한 점 목록으로 돌려준다.
 * 직선을 점으로 잘게 나눠 두면, 왜곡을 적용했을 때 선이 휘는 모습을 그대로 그릴 수 있다.
 */
export function boardLines(params: BoardParams): V3[][] {
  const line = (from: V2, to: V2, cells: number): V3[] => {
    const n = cells * SAMPLES_PER_CELL;
    return Array.from({ length: n + 1 }, (_, i) => {
      const r = i / n;
      return boardPoint(from[0] + (to[0] - from[0]) * r, from[1] + (to[1] - from[1]) * r, params);
    });
  };
  const rows = Array.from({ length: BOARD_ROWS }, (_, j) => {
    const t = -halfHeight + j * BOARD_SPACING;
    return line([-halfWidth, t], [halfWidth, t], BOARD_COLS - 1);
  });
  const cols = Array.from({ length: BOARD_COLS }, (_, i) => {
    const s = -halfWidth + i * BOARD_SPACING;
    return line([s, -halfHeight], [s, halfHeight], BOARD_ROWS - 1);
  });
  return [...rows, ...cols];
}

/** 격자 교차점만 (3D 장면에 점으로 찍을 것) */
export function boardCorners(params: BoardParams): V3[] {
  const out: V3[] = [];
  for (let j = 0; j < BOARD_ROWS; j++) {
    for (let i = 0; i < BOARD_COLS; i++) out.push(boardPoint(-halfWidth + i * BOARD_SPACING, -halfHeight + j * BOARD_SPACING, params));
  }
  return out;
}

/** 이미지 네 모서리 (왼위, 오른위, 오른아래, 왼아래)를 깊이 d에서 본 3D 점 (카메라 좌표) */
export function frustumCorners(K: Intr, d: number): V3[] {
  const corners: V2[] = [
    [0, 0],
    [IMAGE.width, 0],
    [IMAGE.width, IMAGE.height],
    [0, IMAGE.height],
  ];
  return corners.map((px) => {
    const [x, y] = toNormalized(px, K);
    return [x * d, y * d, d];
  });
}
