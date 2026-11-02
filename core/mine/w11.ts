/** 11주차 — 내가 직접 구현하는 파일. AI는 시그니처·힌트·TODO만 작성한다. */
import { makeVo } from "../reference/w11";
import type {
  AteResult,
  Feature,
  InitOptions,
  InitResult,
  Intrinsics,
  Keyframe,
  LocalBAOptions,
  LocalBAResult,
  MapPoint,
  Sim3,
  TrackOptions,
  TrackResult,
  Vec3,
} from "../types";

// 읽기만 함수: 정답을 그대로 내보낸다 (LESSON_TEMPLATE §2)
export { rpe, selectKeyframe } from "../reference/w11";

// 이전 주차 함수는 이렇게 가져온다 (정답 구현을 쓴다, ARCHITECTURE §3)
//   import { expSO3 } from "@core/prev/w03";
//   import { eightPoint, ransac } from "@core/prev/w05";
//   import { decomposeE, pnpDLT, triangulate } from "@core/prev/w06";
//   import { levenbergMarquardt } from "@core/prev/w07";
//   import { projectionJacobian, smallBA } from "@core/prev/w08";
// SVD·행렬식은 ml-matrix
//   import { determinant, Matrix, SingularValueDecomposition } from "ml-matrix";

/**
 * 11a — 2D-2D 초기화: 두 프레임의 공통 특징점(같은 id)으로 상대 자세와 첫 맵 포인트를 만든다.
 * 프레임 1이 월드 (T1 = 단위), 돌려주는 T 는 T21 (p2 = R·p1 + t), |t| = 1.
 *
 * 단계 (레슨 11a 과제 힌트에 자세히):
 *   1) 공통 id 쌍을 모은다. 8개 미만이거나 minPoints 미만이면 null.
 *   2) 픽셀 → 정규화 좌표 x̂ = ((u − cx)/fx, (v − cy)/fy).
 *   3) ransac(쌍 번호들, { sampleSize: 8, fit: eightPoint (예외면 null), error, threshold, iterations, rng }).
 *      error = x̂2 와 에피폴라 직선 l = E·x̂1 사이 거리 × (fx + fy)/2  (픽셀 단위로 맞춘다).
 *   4) inlier 전부로 eightPoint 를 다시 → decomposeE(E, inlier x̂1, inlier x̂2) → T.
 *   5) inlier 마다 triangulate(단위, T, x̂1, x̂2) (예외면 버림). 두 카메라 앞이고 두 재투영 오차 < threshold 인 점만.
 *   6) 점마다 시차각 = 카메라 중심 C1 = 0, C2 = −Rᵀt 에서 X 로 가는 두 광선 사이 각(도). 중앙값 → parallaxDeg.
 *   7) 남은 점 < minPoints 이거나 parallaxDeg < minParallaxDeg 이면 null (순수 회전·정지: 다음 프레임으로 미룬다).
 *   그 밖에 null: ransac 이 null 이거나 inlier < 8, 4) 의 eightPoint·decomposeE 가 예외를 던질 때 (퇴화).
 * 조건 (예외): fx·fy ≤ 0, 한 프레임에 같은 id 두 번, 좌표 NaN·무한대, threshold ≤ 0, minParallaxDeg < 0, minPoints < 1.
 *
 * @returns { T, points (id 오름차순), parallaxDeg } 또는 null
 */
export function initMap(K: Intrinsics, f1: readonly Feature[], f2: readonly Feature[], opts: InitOptions): InitResult | null {
  throw new Error("TODO");
}

/**
 * 11b — PnP 추적: 맵 포인트(3D)와 새 프레임 특징점(2D)을 id로 이어 현재 자세 T_cw 를 구한다.
 *
 * 단계 (레슨 11b 과제 힌트에 자세히):
 *   1) 특징점 중 맵에 있는 id 만 대응 (X, uv) 로. minInliers 미만이면 null.
 *   2) ransac(대응들, { sampleSize: 6, fit, error, threshold, iterations, rng }).
 *      fit: 3D 점을 무게중심 μ 로 옮기고 평균 거리 σ 로 나눈 X' = (X − μ)/σ 와 정규화 좌표로 pnpDLT (예외면 null),
 *           결과 (R, t') 를 되돌려 T = (R, σ·t' − R·μ).  (월드 좌표가 원점에서 멀면 DLT 가 잡음에 매우 약하다)
 *      error: 재투영 오차 (픽셀, 카메라 뒤면 Infinity).
 *   3) 자세만 다듬기 (점은 고정): inlier 들의 재투영 오차를 7주차 levenbergMarquardt 로 줄인다.
 *      residual = 관측마다 [u − u관측, v − v관측], jacobian = 8a projectionJacobian 의 pose 블록 (2×6),
 *      plus = 좌섭동 (R ← Exp(φ)R, t ← Exp(φ)t + ρ), { maxIterations: 10, tolerance: 1e-10 }.
 *      LM 이 시도한 자세에서 점이 카메라 뒤(깊이 ≤ 0)로 가면 그 잔차는 큰 값(예: 1e6, 8b smallBA 와 같이),
 *      야코비안은 0 으로 둔다 (projectionJacobian 은 깊이 ≤ 0 이면 예외를 던진다).
 *      다듬은 자세로 inlier 를 다시 센다. (다듬기 → 다시 세기) 를 두 번.
 *   4) inlier < minInliers 이면 null.
 * 조건 (예외): fx·fy ≤ 0, 같은 id 두 번, NaN 좌표, threshold ≤ 0, minInliers < 6.
 *
 * @returns { T, inliers (특징점 id, 오름차순) } 또는 null
 */
export function trackPnP(K: Intrinsics, map: readonly MapPoint[], features: readonly Feature[], opts: TrackOptions): TrackResult | null {
  throw new Error("TODO");
}

/**
 * 11c — local BA: 최근 window 개 키프레임과 그 안에서 보이는 맵 포인트를 8주차 smallBA 로 함께 고친다.
 *
 * 단계:
 *   1) active = keyframes 의 마지막 window 개 (모자라면 전부).
 *   2) active 키프레임의 특징점 중 맵에 있는 id 의 관측을 모은다. 단 시작값에서 카메라 뒤(깊이 ≤ 0)인 관측은 뺀다.
 *   3) active 안에서 관측이 2개 이상인 점만 쓴다 (id 오름차순으로 번호). 하나도 없으면 아무것도 안 바꾸고 costs = [].
 *   4) 창 밖(active 보다 앞) 키프레임 중 그 점들을 (시작값에서 카메라 앞, 깊이 > 0 으로) 본 것도 카메라로 넣고
 *      그 관측도 넣는다. 이 카메라들은 고정.
 *      빼면 점이 창 안의 짧은 기준선 관측만으로 다시 맞춰져서 오래 쌓은 깊이 정보를 잃는다.
 *   5) smallBA({ K, cameras: [active 의 T…, 창 밖 키프레임의 T…], points, observations,
 *                fixed: [0, 1, 창 밖 카메라 번호들] }, opts.solver).
 *      0, 1 = 창에서 가장 오래된 두 키프레임 (단안의 7자유도 게이지: 위치·회전·스케일).
 *   6) 창 안 키프레임의 T 와 쓴 점의 X 만 바꾼 새 배열을 돌려준다 (나머지·순서·frame·features 는 그대로).
 * 조건 (예외): window 가 2 이상 정수가 아님, 키프레임 2개 미만, fx·fy ≤ 0.
 *
 * @returns { keyframes, map, costs (smallBA 의 costs) }
 */
export function localBA(K: Intrinsics, keyframes: readonly Keyframe[], map: readonly MapPoint[], opts: LocalBAOptions): LocalBAResult {
  throw new Error("TODO");
}

/** 읽기만: 위 세 함수로 조립한 VO (조립 코드는 reference/w11.ts 의 makeVo) */
export const vo = makeVo({ initMap, trackPnP, localBA });

/**
 * 11d — 우메야마 정렬: dst ≈ s·R·src + t 가 되는 닮음 변환 (최소제곱).
 *
 *   μs, μd = 평균,  σs² = (1/n) Σ |src − μs|²
 *   Σ = (1/n) Σ (dst − μd)(src − μs)ᵀ = U·D·Vᵀ  (SVD)
 *   S = diag(1, 1, det(U)·det(V) < 0 ? −1 : 1)   (반사 대신 회전)
 *   R = U·S·Vᵀ,  s = tr(D·S) / σs² (withScale 이 false 면 1),  t = μd − s·R·μs
 * 조건 (예외): 길이 다름, 3개 미만, NaN·무한대, 한 점·한 직선 위.
 *   퇴화 판정 예: σs² > 1e-15 이고 D₁ > 1e-10·D₀ 이어야 한다 (D 는 큰 순서 D₀ ≥ D₁ ≥ D₂).
 */
export function alignUmeyama(src: readonly Vec3[], dst: readonly Vec3[], withScale: boolean): Sim3 {
  throw new Error("TODO");
}

/**
 * 11d — ATE: est 를 gt 에 Sim(3)으로 정렬한 뒤 (alignUmeyama, withScale = true) 점마다 위치 오차 ‖s·R·est + t − gt‖.
 * rmse = √(평균 e²), mean, median (짝수 개면 가운데 둘의 평균), max, errors, align.
 * 조건: alignUmeyama 의 예외를 그대로 낸다.
 */
export function ate(est: readonly Vec3[], gt: readonly Vec3[]): AteResult {
  throw new Error("TODO");
}
