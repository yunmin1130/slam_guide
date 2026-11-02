/**
 * 5주차 EpipolarDemo의 합성 장면 (화면 표시용 보조 계산).
 * 에피폴라선·8점·RANSAC은 여기서 계산하지 않는다 → 데모가 lib/impl.ts로 core 함수를 가져온다.
 * 여기 있는 것은 장면 만들기, 진짜 F(정답 비교용), 평가 지표, 화면에 선 그리기뿐이다.
 */

export type V2 = readonly [number, number];
export type V3 = readonly [number, number, number];
export type M3 = readonly [V3, V3, V3];

/** 두 카메라 모두 640×480, f = 500, 주점은 가운데 */
export const IMAGE = { width: 640, height: 480 } as const;
const FOCAL = 500;
const CX = IMAGE.width / 2;
const CY = IMAGE.height / 2;

/** 시드 고정 난수 (mulberry32). 같은 시드면 같은 장면 */
export function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  // Box-Muller
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

export interface SceneParams {
  seed: number;
  count: number;
  /** 픽셀 잡음 표준편차 */
  noisePx: number;
  /** 0 ~ 1. 이 비율만큼 대응을 엉뚱한 점으로 바꾼다 */
  outlierRatio: number;
}

export interface Scene {
  x1: V2[];
  x2: V2[];
  isOutlier: boolean[];
  /** 카메라 2 좌표 = R · 카메라 1 좌표 + t */
  R: M3;
  t: V3;
}

/** 카메라 2: 오른쪽으로 0.8m, y축(아래) 둘레로 -8° (왼쪽을 조금 더 본다) */
const YAW = (-8 * Math.PI) / 180;
const R2: M3 = [
  [Math.cos(YAW), 0, Math.sin(YAW)],
  [0, 1, 0],
  [-Math.sin(YAW), 0, Math.cos(YAW)],
];
const T2: V3 = [-0.8, 0.05, 0.1];

function project(p: V3): V2 {
  return [(FOCAL * p[0]) / p[2] + CX, (FOCAL * p[1]) / p[2] + CY];
}

function inside(p: V2): boolean {
  return p[0] >= 0 && p[0] <= IMAGE.width && p[1] >= 0 && p[1] <= IMAGE.height;
}

const clampToImage = (p: V2): V2 => [Math.min(IMAGE.width, Math.max(0, p[0])), Math.min(IMAGE.height, Math.max(0, p[1]))];

export function makeScene({ seed, count, noisePx, outlierRatio }: SceneParams): Scene {
  const rng = seededRng(seed);
  const x1: V2[] = [];
  const x2: V2[] = [];
  for (let tries = 0; x1.length < count && tries < count * 50; tries++) {
    const z = 4 + rng() * 8;
    const p: V3 = [(rng() - 0.5) * z * 1.2, (rng() - 0.5) * z * 0.9, z];
    const q: V3 = [
      R2[0][0] * p[0] + R2[0][1] * p[1] + R2[0][2] * p[2] + T2[0],
      R2[1][0] * p[0] + R2[1][1] * p[1] + R2[1][2] * p[2] + T2[1],
      R2[2][0] * p[0] + R2[2][1] * p[1] + R2[2][2] * p[2] + T2[2],
    ];
    const a = project(p);
    const b = project(q);
    if (q[2] <= 0.5 || !inside(a) || !inside(b)) continue;
    const noisy = (v: V2): V2 => clampToImage([v[0] + gaussian(rng) * noisePx, v[1] + gaussian(rng) * noisePx]);
    x1.push(noisy(a));
    x2.push(noisy(b));
  }
  // 앞에서부터가 아니라 무작위 위치에 아웃라이어를 넣는다
  const outliers = Math.round(x1.length * Math.min(1, Math.max(0, outlierRatio)));
  const order = x1.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const isOutlier = x1.map(() => false);
  order.slice(0, outliers).forEach((i) => {
    isOutlier[i] = true;
    x2[i] = [rng() * IMAGE.width, rng() * IMAGE.height]; // 잘못 짝지어진 대응 (엉뚱한 점)
  });
  return { x1, x2, isOutlier, R: R2, t: T2 };
}

function mul(A: M3, B: M3): M3 {
  const c = (i: number, j: number) => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  const r = (i: number): V3 => [c(i, 0), c(i, 1), c(i, 2)];
  return [r(0), r(1), r(2)];
}

/** 진짜 기본 행렬 F = K⁻ᵀ [t]× R K⁻¹ (정답 비교용) */
export function trueF({ R, t }: Pick<Scene, "R" | "t">): M3 {
  const tx: M3 = [
    [0, -t[2], t[1]],
    [t[2], 0, -t[0]],
    [-t[1], t[0], 0],
  ];
  const Kinv: M3 = [
    [1 / FOCAL, 0, -CX / FOCAL],
    [0, 1 / FOCAL, -CY / FOCAL],
    [0, 0, 1],
  ];
  const KinvT: M3 = [
    [Kinv[0][0], Kinv[1][0], Kinv[2][0]],
    [Kinv[0][1], Kinv[1][1], Kinv[2][1]],
    [Kinv[0][2], Kinv[1][2], Kinv[2][2]],
  ];
  return mul(mul(KinvT, mul(tx, R)), Kinv);
}

/**
 * 점 b와 에피폴라선 F·a 사이의 거리 (평가 지표). RANSAC 오차에도 쓴다.
 * 손코딩 epipolarLine과 따로 둔 이유: 내 epipolarLine이 TODO여도 내 eightPoint·ransac은 돌려 볼 수 있게.
 */
export function pointLineDistance(F: readonly (readonly number[])[], a: V2, b: V2): number {
  // RANSAC에서 수백만 번 불리므로 배열을 만들지 않고 풀어 쓴다 (폰에서 멈춤 줄이기)
  const f0 = F[0]!;
  const f1 = F[1]!;
  const f2 = F[2]!;
  const la = f0[0]! * a[0] + f0[1]! * a[1] + f0[2]!;
  const lb = f1[0]! * a[0] + f1[1]! * a[1] + f1[2]!;
  const lc = f2[0]! * a[0] + f2[1]! * a[1] + f2[2]!;
  const n = Math.sqrt(la * la + lb * lb);
  return n > 0 ? Math.abs(la * b[0] + lb * b[1] + lc) / n : Number.POSITIVE_INFINITY;
}

/** idx의 대응들에 대한 평균 에피폴라 거리 (픽셀) */
export function meanLineDistance(F: readonly (readonly number[])[], x1: readonly V2[], x2: readonly V2[], idx: readonly number[]): number {
  if (idx.length === 0) return Number.NaN;
  return idx.reduce((s, i) => s + pointLineDistance(F, x1[i]!, x2[i]!), 0) / idx.length;
}

/** 3×3이고 모든 원소가 유한한 수인지 (내 구현이 NaN을 돌려줬는지 확인) */
export function isFiniteMatrix(F: unknown): F is M3 {
  return Array.isArray(F) && F.length === 3 && F.every((r) => Array.isArray(r) && r.length === 3 && r.every((v) => typeof v === "number" && Number.isFinite(v)));
}

/**
 * RANSAC용 fit: 번호 목록 → eightPoint. 예외·NaN이면 null(퇴화 표본으로 보고 건너뜀)을 돌려주되,
 * 마지막 예외 메시지는 기억해 둔다. 모든 표본이 실패했을 때 "왜"를 화면에 보여주기 위해서다.
 */
export function makeFitter(
  eightPoint: (a: readonly V2[], b: readonly V2[]) => M3,
  x1: readonly V2[],
  x2: readonly V2[],
): { fit: (idx: readonly number[]) => M3 | null; lastError: () => string | null } {
  let last: string | null = null;
  const fit = (idx: readonly number[]): M3 | null => {
    try {
      const F = eightPoint(
        idx.map((i) => x1[i]!),
        idx.map((i) => x2[i]!),
      );
      if (isFiniteMatrix(F)) return F;
      last = "결과에 NaN이나 무한대가 있다";
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    return null;
  };
  return { fit, lastError: () => last };
}

/** RANSAC에 필요한 반복 횟수: 표본 s개가 모두 inlier일 확률이 p 이상이 되게 (inlier 비율 w) */
export function ransacIterations(w: number, s: number, p = 0.99): number {
  const good = w ** s;
  if (good >= 1) return 1;
  if (good <= 0) return Number.POSITIVE_INFINITY;
  return Math.ceil(Math.log(1 - p) / Math.log(1 - good));
}

/** 직선 a·u + b·v + c = 0 을 이미지 사각형으로 자른 선분. 이미지를 안 지나면 null */
export function clipLine(l: V3): [V2, V2] | null {
  const [a, b, c] = l;
  const { width: W, height: H } = IMAGE;
  const eps = 1e-9;
  const pts: V2[] = [];
  if (Math.abs(b) > eps) {
    for (const u of [0, W]) pts.push([u, -(a * u + c) / b]);
  }
  if (Math.abs(a) > eps) {
    for (const v of [0, H]) pts.push([-(b * v + c) / a, v]);
  }
  const onEdge = pts.filter((p) => p[0] >= -eps && p[0] <= W + eps && p[1] >= -eps && p[1] <= H + eps);
  // 가장 먼 두 점 (모서리를 지나면 같은 점이 두 번 나올 수 있다)
  let best: [V2, V2] | null = null;
  let bestD = eps;
  for (let i = 0; i < onEdge.length; i++) {
    for (let j = i + 1; j < onEdge.length; j++) {
      const d = Math.hypot(onEdge[i]![0] - onEdge[j]![0], onEdge[i]![1] - onEdge[j]![1]);
      if (d > bestD) {
        bestD = d;
        best = [onEdge[i]!, onEdge[j]!];
      }
    }
  }
  return best;
}
