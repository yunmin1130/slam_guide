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

/** RANSAC 설정 (5주차). T = 데이터 하나(예: 대응점 쌍), M = 모델(예: F 행렬) */
export interface RansacOptions<T, M> {
  /** 모델 하나를 맞추는 데 필요한 최소 개수 (8점 알고리즘이면 8) */
  readonly sampleSize: number;
  /** 표본으로 모델을 맞춘다. 표본이 퇴화해서 못 맞추면 null */
  readonly fit: (sample: readonly T[]) => M | null;
  /** 모델에 대한 데이터 하나의 오차 (0 이상) */
  readonly error: (model: M, item: T) => number;
  /** 오차가 이 값보다 작으면 inlier */
  readonly threshold: number;
  /** 표본을 뽑아 볼 횟수 */
  readonly iterations: number;
  /** [0, 1) 난수. Math.random 대신 시드 고정 RNG를 넣는다 (LESSON_TEMPLATE §4) */
  readonly rng: () => number;
}

export interface RansacResult<M> {
  readonly model: M;
  /** inlier 데이터의 번호 (오름차순) */
  readonly inliers: readonly number[];
}
