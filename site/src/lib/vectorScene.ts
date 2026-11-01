/**
 * 1주차 VectorViewer 데모의 장면 좌표 (화면 표시용 보조 계산).
 * 내적·외적·반대칭 행렬은 여기서 계산하지 않는다 → 데모가 lib/impl.ts의 loadFn으로 가져온다.
 */

export type V3 = readonly [number, number, number];
export type M3 = readonly [V3, V3, V3];

/** a의 길이 (x축 위에 고정) */
export const A_LENGTH = 2;

export interface SceneParams {
  /** a와 b 사이 각 (도) */
  thetaDeg: number;
  /** a를 축으로 a·b 평면을 돌리는 각 (도). 0이면 xy 평면 */
  tiltDeg: number;
  /** b의 길이 */
  bLength: number;
}

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** a = [A_LENGTH, 0, 0], b는 a와 θ를 이루고 a 축으로 tilt만큼 돌아간 평면 위의 벡터 */
export function sceneVectors({ thetaDeg, tiltDeg, bLength }: SceneParams): { a: V3; b: V3 } {
  const t = rad(thetaDeg);
  const p = rad(tiltDeg);
  return {
    a: [A_LENGTH, 0, 0],
    b: [bLength * Math.cos(t), bLength * Math.sin(t) * Math.cos(p), bLength * Math.sin(t) * Math.sin(p)],
  };
}

/** 행 우선 3×3 행렬 × 벡터 */
export function matVec(M: M3, v: V3): V3 {
  const row = (r: V3): number => r[0] * v[0] + r[1] * v[1] + r[2] * v[2];
  return [row(M[0]), row(M[1]), row(M[2])];
}

export function scale(v: V3, k: number): V3 {
  return [v[0] * k, v[1] * k, v[2] * k];
}

export function add(u: V3, v: V3): V3 {
  return [u[0] + v[0], u[1] + v[1], u[2] + v[2]];
}
