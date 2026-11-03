/** 11주차 — 내가 직접 구현하는 파일. AI는 시그니처·힌트·TODO만 작성한다. */
import { localBA, makeVo } from "../reference/w11";
import type { AteResult, Feature, InitOptions, InitResult, Intrinsics, MapPoint, Sim3, TrackOptions, TrackResult, Vec3 } from "../types";

// 읽기만 함수: 정답을 그대로 내보낸다 (LESSON_TEMPLATE §2).
//   checkFrame, matchById, normalizePixel, reprojectionError: 11a·11b에서 가져다 쓰는 도우미
//   refinePose: 11b 자세만 다듬기,  localBA·selectKeyframe·vo: 11c,  rpe: 11d
// localBA를 직접 짜 보고 싶으면 (선택 과제, 레슨 11c) 아래 export와 import에서 localBA를 지우고 함수를 새로 쓴다.
export { checkFrame, localBA, matchById, normalizePixel, refinePose, reprojectionError, rpe, selectKeyframe } from "../reference/w11";

// 도우미·이전 주차 함수는 이렇게 가져온다 (정답 구현을 쓴다, ARCHITECTURE §3)
//   import { checkFrame, matchById, normalizePixel, refinePose, reprojectionError } from "../reference/w11";
//   import { eightPoint, ransac } from "@core/prev/w05";
//   import { decomposeE, pnpDLT, triangulate } from "@core/prev/w06";
// SVD·행렬식은 ml-matrix
//   import { determinant, Matrix, SingularValueDecomposition } from "ml-matrix";

/**
 * 11a — 2D-2D 초기화: 두 프레임의 공통 특징점(같은 id)으로 상대 자세와 첫 맵 포인트를 만든다.
 * 프레임 1이 월드 (T1 = 단위), 돌려주는 T 는 T21 = 프레임 2의 T_cw (p2 = R·p1 + t), |t| = 1.
 *
 * 단계 (레슨 11a 과제 힌트에 자세히):
 *   0) checkFrame(K, f1, "initMap"), checkFrame(K, f2, "initMap") 와 설정 검사.
 *   1) pairs = matchById(f1, f2). max(8, minPoints) 개 미만이면 null.
 *   2) 정규화 좌표: normalizePixel(K, uv).
 *   3) ransac(쌍 번호들, { sampleSize: 8, fit: eightPoint (예외면 null), error, threshold, iterations, rng }).
 *      error = x̂2 와 에피폴라 직선 l = E·x̂1 사이 거리 × (fx + fy)/2  (픽셀 단위로 맞춘다, x̂ 는 (x, y, 1)).
 *   4) inlier 전부로 eightPoint 를 다시 → decomposeE(E, inlier x̂1, inlier x̂2) → T. 예외면 null.
 *   5) inlier 마다 triangulate(단위, T, x̂1, x̂2) (예외면 버림). 두 재투영 오차(reprojectionError) < threshold 인 점만.
 *   6) 점마다 시차각 = 카메라 중심 C1 = 0, C2 = −Rᵀt 에서 X 로 가는 두 광선 사이 각(도). 중앙값 → parallaxDeg.
 *   7) 남은 점 < minPoints 이거나 parallaxDeg < minParallaxDeg 이면 null (순수 회전·정지: 다음 프레임으로 미룬다).
 *   그 밖에 null: ransac 이 null 이거나 inlier < 8.
 * 조건 (예외): checkFrame 의 예외, threshold ≤ 0, minParallaxDeg < 0, minPoints < 1.
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
 *   0) checkFrame(K, features, "trackPnP"), threshold > 0, minInliers ≥ 6 검사.
 *   1) 특징점 중 맵에 있는 id 만 대응 { id, X, uv } 로. minInliers 미만이면 null.
 *   2) ransac(대응들, { sampleSize: 6, fit, error, threshold, iterations, rng }).
 *      fit: 3D 점을 무게중심 μ 로 옮기고 평균 거리 d 로 나눈 X' = (X − μ)/d 와 정규화 좌표로 pnpDLT (예외면 null),
 *           결과 (R, t') 를 되돌려 T = (R, d·t' − R·μ).  (월드 좌표가 원점에서 멀면 DLT 가 잡음에 매우 약하다)
 *      error: reprojectionError(K, T, X, uv).
 *   3) (refinePose(K, T, inlier 대응들) → inlier 다시 세기) 를 두 번.
 *   4) inlier < minInliers 이면 null.
 *
 * @returns { T, inliers (특징점 id, 오름차순) } 또는 null
 */
export function trackPnP(K: Intrinsics, map: readonly MapPoint[], features: readonly Feature[], opts: TrackOptions): TrackResult | null {
  throw new Error("TODO");
}

/** 읽기만: 위 함수들과 localBA 로 조립한 VO (조립 코드는 reference/w11.ts 의 makeVo) */
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
