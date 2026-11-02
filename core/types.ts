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

/**
 * 비선형 최소제곱 문제 (7주차). X = 변수의 종류 (숫자 배열, 회전, 자세 …).
 * 비용 = ½ Σ rᵢ(x)² (로버스트 커널이 있으면 Σ ρ(rᵢ)).
 */
export interface LsqProblem<X> {
  /** 잔차 r(x) (길이 m) */
  readonly residual: (x: X) => VecN;
  /** 야코비안 J = ∂r(x ⊞ δ)/∂δ at δ = 0 (m × n). 숫자 배열이면 그냥 ∂r/∂x */
  readonly jacobian: (x: X) => MatN;
  /** 업데이트 x ⊞ δ (δ 길이 n). 숫자 배열이면 x + δ, 회전·자세면 7b의 섭동 규약 */
  readonly plus: (x: X, delta: VecN) => X;
}

/** 로버스트 커널 값 하나: 비용 ρ(r)과 IRLS 가중치 w(r) = ρ'(r) / r */
export interface RobustLoss {
  readonly rho: number;
  readonly weight: number;
}

export interface SolverOptions {
  /** 최대 반복 수 (업데이트 시도 횟수) */
  readonly maxIterations: number;
  /** 업데이트 크기 ‖δ‖ 가 이보다 작으면 수렴 */
  readonly tolerance: number;
  /** 잔차마다 적용할 로버스트 커널 (없으면 보통 최소제곱) */
  readonly robust?: (r: number) => RobustLoss;
}

export interface SolverStep<X> {
  readonly x: X;
  readonly cost: number;
  /** LM의 감쇠 λ (GN은 없음) */
  readonly lambda?: number;
}

export interface SolverResult<X> {
  readonly x: X;
  readonly cost: number;
  /** 받아들인 업데이트 수 */
  readonly iterations: number;
  readonly converged: boolean;
  /** 처음 값부터 받아들인 업데이트마다 하나씩 */
  readonly history: readonly SolverStep<X>[];
}

/** 번들 조정 관측 하나 (8주차): 카메라 cam이 점 point를 픽셀 uv에서 봤다 */
export interface BAObservation {
  readonly cam: number;
  readonly point: number;
  readonly uv: Vec2;
}

/**
 * 번들 조정 문제 (8주차). 카메라 자세는 T_cw (월드 점 → 카메라 좌표: p_c = R·X + t).
 * fixed에 든 카메라는 움직이지 않는다 (게이지 고정: 보통 처음 두 대).
 */
export interface BAProblem {
  readonly K: Intrinsics;
  readonly cameras: readonly SE3[];
  readonly points: readonly Vec3[];
  readonly observations: readonly BAObservation[];
  readonly fixed: readonly number[];
}

export interface BAResult {
  readonly cameras: SE3[];
  readonly points: Vec3[];
  /** 마지막 비용 (½Σ‖재투영 오차‖², 로버스트면 Σρ) */
  readonly cost: number;
  readonly iterations: number;
  readonly converged: boolean;
  /** 처음부터 받아들인 업데이트마다의 비용 */
  readonly costs: readonly number[];
}

/** 2D 자세 (9주차): 위치 (x, y)와 방향 θ (라디안). 월드에서 본 로봇 자세 T_wi */
export interface Pose2 {
  readonly x: number;
  readonly y: number;
  readonly theta: number;
}

/**
 * 포즈 그래프 엣지 (9주차): 노드 i에서 본 노드 j의 상대 자세 측정 z_ij = T_i⁻¹·T_j.
 * info는 3×3 정보 행렬 (측정 공분산의 역, 순서 [x, y, θ]). 오도메트리와 루프 클로저 모두 이 꼴이다.
 */
export interface PoseGraphEdge {
  readonly i: number;
  readonly j: number;
  readonly measurement: Pose2;
  readonly info: MatN;
}

export interface PoseGraphProblem {
  readonly poses: readonly Pose2[];
  readonly edges: readonly PoseGraphEdge[];
  /** 움직이지 않는 노드 (게이지 고정, 보통 [0]) */
  readonly fixed: readonly number[];
}

export interface PoseGraphResult {
  readonly poses: Pose2[];
  readonly cost: number;
  readonly iterations: number;
  readonly converged: boolean;
  readonly costs: readonly number[];
}
