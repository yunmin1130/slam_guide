/** 4주차 — 내가 직접 구현하는 파일. AI는 시그니처·힌트·TODO만 작성한다. */
import type { BrownDistortion, CompositeResult, Intrinsics, Mat2, Mat3, Vec2, Vec3 } from "../types";

// 읽기만 함수: reference를 그대로 쓴다 (ARCHITECTURE §5). buildCovariance는 4b
export { buildCovariance, undistort, unprojectFisheye } from "../reference/w04";

/**
 * 카메라 좌표계의 3D 점을 이미지 픽셀로 투영한다 (핀홀 모델, 왜곡 없음).
 * 카메라 좌표계: x 오른쪽, y 아래, z 앞(광축).
 *
 * 수식 힌트: 닮은 삼각형으로 정규화 평면 (x, y) = (X/Z, Y/Z) 를 구한 뒤 K 로 픽셀로 바꾼다.
 *   u = fx·x + cx,  v = fy·y + cy
 * 주의: Z ≤ 0 이면 카메라 뒤 (또는 렌즈 평면 위) → null 반환
 * 확인 방법: 같은 광선 위의 점 [sX, sY, sZ] (s > 0) 은 모두 같은 픽셀로 가야 한다.
 *
 * @param p  카메라 좌표계 3D 점 [X, Y, Z]
 * @param K  내부 파라미터 { fx, fy, cx, cy }
 * @returns  픽셀 [u, v] 또는 null
 */
export function project(p: Vec3, K: Intrinsics): Vec2 | null {
  throw new Error("TODO");
}

/**
 * 정규화 평면 좌표에 렌즈 왜곡(Brown-Conrady, OpenCV 계수 순서)을 적용한다.
 * 이상적인 핀홀 위치 x 가 실제 렌즈에서는 어디에 맺히는지 돌려준다.
 *
 * 수식 힌트: 레슨 "렌즈 왜곡" 절. 방사 왜곡(k1, k2, k3)은 반지름 r² = x² + y² 의 다항식으로
 *   점을 중심에서 멀리/가까이 밀고, 접선 왜곡(p1, p2)은 렌즈가 기울어 생기는 비대칭 이동이다.
 * 조건: 입력 x, d 를 바꾸지 않는다.
 * 확인 방법: 계수가 모두 0이면 그대로, 원점은 항상 원점.
 *
 * @param x  정규화 평면 좌표 [x, y] (= [X/Z, Y/Z])
 * @param d  왜곡 계수 { k1, k2, p1, p2, k3 }
 * @returns  왜곡된 정규화 평면 좌표
 */
export function distort(x: Vec2, d: BrownDistortion): Vec2 {
  throw new Error("TODO");
}

// ---- 4b: 3DGS ----
// 수식과 단계는 레슨 과제 카드의 힌트 ① 개념 → ② 수식 → ③ 의사코드를 차례로 연다.

/**
 * 2D 가우시안의 가중치: 중심에서 d 만큼 떨어진 픽셀이 이 가우시안을 얼마나 "진하게" 보는가 (0 ~ 1).
 *
 * 수식: w = exp(−½ · dᵀ Σ⁻¹ d) (레슨 "2D 가우시안" 절). 중심(d = 0)에서 1.
 * 조건: Σ 의 행렬식이 0 이하(납작하거나 잘못된 공분산)면 0 을 돌려준다. 입력을 바꾸지 않는다.
 * 확인 방법: Σ = diag(4, 1) 이면 (2, 0) 과 (0, 1) 에서 같은 값 e^(−1/2).
 *
 * @param d        픽셀 − 가우시안 중심 [du, dv]
 * @param Sigma2D  2D 공분산 [[a, b], [b, c]] (대칭이라고 가정한다)
 * @returns        가중치 (0 이상 1 이하)
 */
export function gaussianWeight2D(d: Vec2, Sigma2D: Mat2): number {
  throw new Error("TODO");
}

/**
 * 3D 가우시안의 공분산을 화면(픽셀)의 2D 공분산으로 투영한다: Σ' = J · W · Σ · Wᵀ · Jᵀ.
 *
 * 규약: W = Rcw (월드 → 카메라 회전, p_c = R·X + t 의 R). J 는 pCam 에서 구한 핀홀 투영의 야코비안
 *   (레슨 "화면으로 투영하기" 절).
 * 주의: z ≤ 0 이면 카메라 뒤 → null 반환.
 * 조건: 입력을 바꾸지 않는다.
 * 확인 방법: 광축 위 (0, 0, 4), f = 80, Σ = diag(4, 1, 1), Rcw = I 이면 diag(1600, 400)
 *   (반지름 2 인 축이 80·2/4 = 40 픽셀).
 *
 * @param Sigma  월드 좌표의 3D 공분산 (3×3, 대칭)
 * @param Rcw    월드 → 카메라 회전행렬
 * @param pCam   카메라 좌표계에서 본 가우시안 중심 [x, y, z]
 * @param K      내부 파라미터 { fx, fy, cx, cy }
 * @returns      2D 공분산 [[a, b], [b, c]] (픽셀² 단위) 또는 null
 */
export function projectCovariance(Sigma: Mat3, Rcw: Mat3, pCam: Vec3, K: Intrinsics): Mat2 | null {
  throw new Error("TODO");
}

/**
 * 한 픽셀에 겹친 가우시안들을 앞에서부터 알파 합성한다.
 *
 * 수식: 레슨 "알파 합성" 절의 C = Σᵢ cᵢ · αᵢ · Tᵢ. T 는 앞의 것들을 통과하고 남은 빛의 비율이다.
 * 조건: colors 와 alphas 는 카메라에 가까운 것부터(깊이 오름차순) 정렬되어 들어온다. 길이가 다르면 예외를 던진다.
 *   빈 목록이면 색 [0, 0, 0], 투과율 1. 입력을 바꾸지 않는다.
 * 확인 방법: 빨강·초록·파랑, α = (0.5, 0.5, 1) 이면 색 [0.5, 0.25, 0.25], 남은 투과율 0.
 *
 * @param colors  가우시안마다 색 [r, g, b] (앞에서부터)
 * @param alphas  가우시안마다 이 픽셀에서의 α (불투명도 × 가우시안 가중치, 0 ~ 1)
 * @returns       { color: 합성한 색, transmittance: 끝까지 남은 T }
 */
export function alphaComposite(colors: readonly Vec3[], alphas: readonly number[]): CompositeResult {
  throw new Error("TODO");
}
