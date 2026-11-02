/**
 * 11c 데모의 합성 장면: 앞쪽 상자 안의 점들, 옆으로 걸으며 고개를 조금씩 돌리는 카메라 (core/tests/w11과 비슷한 꼴.
 * 고개 각도와 아웃라이어 뽑는 방식은 조금 다르다: 여기서는 관측마다 엉터리 위치로 바뀐다).
 * 정답 자세를 알기 때문에 VO 결과를 ATE로 바로 채점할 수 있다.
 */
import type { Feature, Intrinsics, Mat3, SE3, Vec3 } from "@core/types";
import { invertSE3 } from "./voEval";
import { seededRng } from "./voJob";

export const VO_K: Intrinsics = { fx: 500, fy: 500, cx: 320, cy: 240 };
export const VO_W = 640;
export const VO_H = 480;
export const VO_FRAMES = 40;
export const VO_POINTS = 300;
/** 처음 제자리 회전 구간의 프레임 수 */
export const ROTATION_FRAMES = 6;

export interface VoSceneOptions {
  readonly seed: number;
  /** 픽셀 잡음 표준편차 */
  readonly noise: number;
  /** 프레임마다 엉터리 위치로 바뀌는 특징점 비율 (0~1) */
  readonly outlierRate: number;
  /** 처음 몇 프레임을 제자리 회전으로 */
  readonly rotationStart: boolean;
}

export interface VoScene {
  readonly frames: readonly (readonly Feature[])[];
  /** 정답 T_wc (카메라 → 월드) */
  readonly gt: readonly SE3[];
  readonly points: readonly Vec3[];
}

function rotY(a: number): Mat3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c],
  ];
}

function gauss(rng: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

/** k번째 프레임의 정답 T_wc. 회전 구간이면 제자리에서 고개만 돌린다 */
function poseAt(k: number, rotationStart: boolean): SE3 {
  const r = rotationStart ? ROTATION_FRAMES : 0;
  if (k < r) return { R: rotY(0.01 * k), t: [0, 0, 0] };
  const s = k - r;
  return { R: rotY(0.01 * r + 0.004 * s), t: [0.08 * s, 0.01 * Math.sin(s / 4), 0.03 * s] };
}

export function makeVoScene(o: VoSceneOptions): VoScene {
  const rng = seededRng(o.seed);
  const points: Vec3[] = Array.from({ length: VO_POINTS }, () => [-6 + 15 * rng(), -3 + 6 * rng(), 6 + 8 * rng()]);
  const gt = Array.from({ length: VO_FRAMES }, (_, k) => poseAt(k, o.rotationStart));
  const frames = gt.map((Twc) => {
    const T = invertSE3(Twc);
    return points.flatMap((X, id): Feature[] => {
      const z = T.R[2][0] * X[0] + T.R[2][1] * X[1] + T.R[2][2] * X[2] + T.t[2];
      if (!(z > 0.1)) return [];
      const x = T.R[0][0] * X[0] + T.R[0][1] * X[1] + T.R[0][2] * X[2] + T.t[0];
      const y = T.R[1][0] * X[0] + T.R[1][1] * X[1] + T.R[1][2] * X[2] + T.t[1];
      const u = (VO_K.fx * x) / z + VO_K.cx;
      const v = (VO_K.fy * y) / z + VO_K.cy;
      if (!(u >= 0 && u < VO_W && v >= 0 && v < VO_H)) return [];
      if (rng() < o.outlierRate) return [{ id, uv: [VO_W * rng(), VO_H * rng()] }];
      return [{ id, uv: [u + o.noise * gauss(rng), v + o.noise * gauss(rng)] }];
    });
  });
  return { frames, gt, points };
}
