/**
 * VO 결과 평가와 내보내기 (11c 데모, 11d TUM 실행기). 계산 함수(ate, rpe)는 데모가 lib/impl.ts로 불러와 넘긴다.
 * 규약: VO 자세는 T_cw (월드 → 카메라), 정답은 T_wc (카메라 → 월드, TUM·DATA §2와 같음).
 */
import type { AteResult, Mat3, RpeResult, SE3, Vec3 } from "@core/types";

export interface EvalFns {
  readonly ate: (est: readonly Vec3[], gt: readonly Vec3[]) => AteResult;
  readonly rpe: (est: readonly SE3[], gt: readonly SE3[], delta: number, scale: number) => RpeResult;
}

export interface VoEval {
  /** 추정과 정답이 모두 있는 프레임 번호 */
  readonly frames: readonly number[];
  readonly ate: AteResult;
  /** 짝지은 프레임 기준 delta 간격. 짝이 delta + 1개보다 적으면 null */
  readonly rpe: RpeResult | null;
  /** Sim(3) 정렬한 추정 카메라 중심 (정답 좌표계) */
  readonly estAligned: readonly Vec3[];
  readonly gtCenters: readonly Vec3[];
  /** 정답 궤적 길이 (짝지은 프레임을 이은 선분 합) */
  readonly pathLength: number;
}

export const MIN_EVAL_FRAMES = 3;

function mv(R: Mat3, v: Vec3): Vec3 {
  return [
    R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2],
    R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2],
    R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2],
  ];
}

/** T⁻¹ = (Rᵀ, −Rᵀt). T_cw를 넣으면 T_wc (t가 카메라 중심) */
export function invertSE3(T: SE3): SE3 {
  const Rt: Mat3 = [
    [T.R[0][0], T.R[1][0], T.R[2][0]],
    [T.R[0][1], T.R[1][1], T.R[2][1]],
    [T.R[0][2], T.R[1][2], T.R[2][2]],
  ];
  const t = mv(Rt, T.t);
  return { R: Rt, t: [-t[0], -t[1], -t[2]] };
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function evaluateVo(poses: readonly (SE3 | null)[], gt: readonly (SE3 | null)[], fns: EvalFns, rpeDelta: number): VoEval | null {
  const frames = poses.flatMap((T, k) => (T && gt[k] ? [k] : []));
  if (frames.length < MIN_EVAL_FRAMES) return null;
  const estTwc = frames.map((k) => invertSE3(poses[k]!));
  const gtTwc = frames.map((k) => gt[k]!);
  const gtCenters = gtTwc.map((T) => T.t);
  const ate = fns.ate(
    estTwc.map((T) => T.t),
    gtCenters,
  );
  const { s, R, t } = ate.align;
  const estAligned = estTwc.map((T): Vec3 => {
    const q = mv(R, T.t);
    return [s * q[0] + t[0], s * q[1] + t[1], s * q[2] + t[2]];
  });
  const rpe = frames.length > rpeDelta ? fns.rpe(estTwc, gtTwc, rpeDelta, s) : null;
  const pathLength = gtCenters.slice(1).reduce((acc, c, i) => acc + dist(c, gtCenters[i]!), 0);
  return { frames, ate, rpe, estAligned, gtCenters, pathLength };
}

/** 회전 행렬 → 쿼터니언 [w, x, y, z] (셰퍼드 방법: 가장 큰 성분부터 구해 나눗셈을 안정하게) */
export function matToQuat(R: Mat3): [number, number, number, number] {
  const tr = R[0][0] + R[1][1] + R[2][2];
  if (tr > 0) {
    const s = 2 * Math.sqrt(1 + tr);
    return [s / 4, (R[2][1] - R[1][2]) / s, (R[0][2] - R[2][0]) / s, (R[1][0] - R[0][1]) / s];
  }
  if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) {
    const s = 2 * Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]);
    return [(R[2][1] - R[1][2]) / s, s / 4, (R[0][1] + R[1][0]) / s, (R[0][2] + R[2][0]) / s];
  }
  if (R[1][1] > R[2][2]) {
    const s = 2 * Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]);
    return [(R[0][2] - R[2][0]) / s, (R[0][1] + R[1][0]) / s, s / 4, (R[1][2] + R[2][1]) / s];
  }
  const s = 2 * Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]);
  return [(R[1][0] - R[0][1]) / s, (R[0][2] + R[2][0]) / s, (R[1][2] + R[2][1]) / s, s / 4];
}

/**
 * 추정 궤적을 TUM 궤적 파일 형식으로: 줄마다 "시각 tx ty tz qx qy qz qw" (T_wc, 스케일은 VO 그대로).
 * 12주차 evo(evo_ape tum gt.txt est.txt -as)로 같은 ATE를 다시 계산할 수 있다.
 */
export function toTumTrajectory(times: readonly number[], poses: readonly (SE3 | null)[]): string {
  const f = (v: number): string => v.toFixed(6);
  const lines = poses.flatMap((T, k) => {
    if (!T) return [];
    const P = invertSE3(T);
    const [w, x, y, z] = matToQuat(P.R);
    return [`${times[k]!.toFixed(6)} ${f(P.t[0])} ${f(P.t[1])} ${f(P.t[2])} ${f(x)} ${f(y)} ${f(z)} ${f(w)}`];
  });
  return `# timestamp tx ty tz qx qy qz qw (slam_guide VO, T_world_cam, 단안이라 스케일 임의)\n${lines.join("\n")}\n`;
}
