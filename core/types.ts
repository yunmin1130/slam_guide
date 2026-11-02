/** 공용 타입. 모든 주차의 core 함수가 이 타입을 쓴다. */

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

/** 3×3 행렬, 행 우선(row-major): m[행][열] */
export type Mat3 = readonly [Vec3, Vec3, Vec3];

/** 길이가 정해지지 않은 벡터 */
export type VecN = readonly number[];
/** m×n 행렬, 행 우선: m[행][열]. 모든 행의 길이가 같아야 한다 */
export type MatN = readonly VecN[];

/** 쿼터니언 [w, x, y, z]. Hamilton 규약이고 스칼라 w가 먼저다 (Eigen 생성자 순서와 같고, ROS 메시지의 x,y,z,w 순서와는 다르다) */
export type Quat = readonly [number, number, number, number];

/**
 * 강체 변환 T = [R t; 0 1] (SE(3)).
 * T_AB는 B 좌표계의 점을 A 좌표계로 옮긴다: p_A = R · p_B + t
 */
export interface SE3 {
  readonly R: Mat3;
  readonly t: Vec3;
}

/** 카메라 내부 파라미터 (픽셀 단위). u = fx·x + cx, v = fy·y + cy. calib.json의 fx, fy, cx, cy (DATA §3) */
export interface Intrinsics {
  readonly fx: number;
  readonly fy: number;
  readonly cx: number;
  readonly cy: number;
}

/** 핀홀 렌즈 왜곡 (Brown-Conrady, OpenCV와 같은 계수 이름). 정규화 평면 좌표에 적용한다 */
export interface BrownDistortion {
  readonly k1: number;
  readonly k2: number;
  readonly p1: number;
  readonly p2: number;
  readonly k3: number;
}

/** 어안 렌즈 왜곡 (Kannala-Brandt, OpenCV fisheye) [k1, k2, k3, k4] */
export type FisheyeDistortion = readonly [number, number, number, number];
