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

/** 특징점 디스크립터 (10주차). 바이너리(ORB)는 바이트(0~255) 배열, 실수(SIFT)는 실수 배열 */
export type Descriptor = readonly number[];

/** 매칭 하나: query[query] ↔ train[train], 1위 거리와 2위 거리 */
export interface Match {
  readonly query: number;
  readonly train: number;
  readonly distance: number;
  readonly secondDistance: number;
}

export interface RatioTestOptions {
  /** "hamming": 바이트 배열의 다른 비트 수, "l2": 유클리드 거리 */
  readonly metric: "hamming" | "l2";
  /** 1위 거리 < ratio × 2위 거리 일 때만 받아들인다 (0 < ratio ≤ 1, 보통 0.7~0.8) */
  readonly ratio: number;
}

/**
 * 프레임 하나에서 본 특징점 (11주차). id는 추적 번호: 여러 프레임에서 같은 3D 점을 가리킨다
 * (KLT 추적이나 디스크립터 매칭으로 이어 붙인 결과). uv는 왜곡을 이미 편 픽셀 좌표.
 */
export interface Feature {
  readonly id: number;
  readonly uv: Vec2;
}

/** 두 프레임에서 같은 id로 이어진 특징점 짝 (11주차): a = 프레임 1 픽셀, b = 프레임 2 픽셀 */
export interface FeaturePair {
  readonly id: number;
  readonly a: Vec2;
  readonly b: Vec2;
}

/** 맵 포인트 (11주차): 추적 번호 id인 점의 월드 좌표 */
export interface MapPoint {
  readonly id: number;
  readonly X: Vec3;
}

/** 키프레임 (11주차): 프레임 번호, 자세 T_cw (p_c = R·X + t), 그 프레임의 특징점 */
export interface Keyframe {
  readonly frame: number;
  readonly T: SE3;
  readonly features: readonly Feature[];
}

/** 2D-2D 초기화 설정 (11a) */
export interface InitOptions {
  /** RANSAC inlier 기준과 삼각측량 점의 재투영 오차 상한 (픽셀) */
  readonly threshold: number;
  readonly iterations: number;
  /** 시차각 중앙값이 이보다 작으면 초기화를 미룬다 (도) */
  readonly minParallaxDeg: number;
  /** 살아남은 맵 포인트가 이보다 적으면 초기화를 미룬다 */
  readonly minPoints: number;
  readonly rng: () => number;
}

export interface InitResult {
  /** 프레임 1 → 프레임 2 상대 자세 T21 (프레임 1이 월드). |t| = 1 */
  readonly T: SE3;
  /** 두 카메라 앞에 있고 재투영 오차가 작은 점들 (id 오름차순) */
  readonly points: readonly MapPoint[];
  /** 남은 점들의 시차각 중앙값 (도) */
  readonly parallaxDeg: number;
}

/** PnP 추적 설정 (11b) */
export interface TrackOptions {
  /** 재투영 오차 inlier 기준 (픽셀) */
  readonly threshold: number;
  readonly iterations: number;
  /** inlier가 이보다 적으면 추적 실패 (6 이상) */
  readonly minInliers: number;
  readonly rng: () => number;
}

export interface TrackResult {
  /** 현재 프레임 자세 T_cw */
  readonly T: SE3;
  /** inlier 특징점의 id (오름차순) */
  readonly inliers: readonly number[];
}

/** local BA 설정 (11c) */
export interface LocalBAOptions {
  /** 최근 몇 개의 키프레임을 최적화하나 (2 이상) */
  readonly window: number;
  /** LM 설정 (로버스트 커널 포함) */
  readonly solver: SolverOptions;
}

export interface LocalBAResult {
  /** 창 안의 키프레임만 자세가 바뀐다 (창의 가장 오래된 둘과 창 밖 키프레임은 고정) */
  readonly keyframes: readonly Keyframe[];
  /** 최적화한 점만 바뀐다 */
  readonly map: readonly MapPoint[];
  /** smallBA가 받아들인 업데이트마다의 비용 (처음 값 포함) */
  readonly costs: readonly number[];
}

/** 새 키프레임 판정 규칙 (11c, 읽기만) */
export interface KeyframeRule {
  /** 지난 키프레임 뒤로 최소 몇 프레임 */
  readonly minFrames: number;
  /** 이만큼 지나면 무조건 키프레임 */
  readonly maxFrames: number;
  /** 추적 inlier가 지난 키프레임의 이 비율 아래로 떨어지면 키프레임 */
  readonly minTrackedRatio: number;
}

export interface VoOptions {
  readonly init: InitOptions;
  readonly track: TrackOptions;
  readonly keyframe: KeyframeRule;
  /** null이면 local BA를 건너뛴다 (비교용) */
  readonly ba: LocalBAOptions | null;
  /** 프레임 하나를 처리할 때마다 부른다 (진행 표시용, 선택) */
  readonly onFrame?: (frame: number) => void;
}

export interface VoResult {
  /** 프레임마다 자세 T_cw. 초기화 전·추적 실패 뒤는 null */
  readonly poses: readonly (SE3 | null)[];
  readonly keyframes: readonly Keyframe[];
  readonly map: readonly MapPoint[];
  /** 초기화에 쓴 두 프레임 [기준, 두 번째]. 초기화 못 했으면 null */
  readonly initFrames: readonly [number, number] | null;
  /** 추적이 끊긴 프레임. 끝까지 갔으면 null */
  readonly lostAt: number | null;
}

/** 닮음 변환 Sim(3) (11d): y = s·R·x + t */
export interface Sim3 {
  readonly s: number;
  readonly R: Mat3;
  readonly t: Vec3;
}

export interface AteResult {
  /** 정렬 뒤 위치 오차의 제곱평균제곱근 */
  readonly rmse: number;
  readonly mean: number;
  readonly median: number;
  readonly max: number;
  /** 점마다 정렬 뒤 위치 오차 */
  readonly errors: readonly number[];
  /** est → gt 정렬 변환 */
  readonly align: Sim3;
}

export interface RpeResult {
  /** 상대 이동 오차 RMSE (gt 단위) */
  readonly transRmse: number;
  /** 상대 회전 오차 RMSE (도) */
  readonly rotRmseDeg: number;
  /** 비교한 쌍의 수 */
  readonly count: number;
}
