/** 6주차 — 내가 직접 구현하는 파일. AI는 시그니처·힌트·TODO만 작성한다. */
import type { Mat3, SE3, Vec2, Vec3 } from "../types";

// 이전 주차 함수가 필요하면 이렇게 가져온다 (정답 구현을 쓴다, ARCHITECTURE §3)
//   import { nullspaceSVD } from "@core/prev/w02";
// SVD·행렬식은 ml-matrix를 쓴다
//   import { determinant, Matrix, SingularValueDecomposition } from "ml-matrix";

/**
 * 필수 행렬 E 를 두 카메라의 상대 자세 T21 = { R, t } 로 분해한다 (p2 = R·p1 + t, 5주차와 같은 규약).
 *
 * 단계 (레슨 과제 힌트에 자세히):
 *   1) E = U·diag(1, 1, 0)·Vᵀ (SVD). det U < 0 이면 U 를, det V < 0 이면 V 를 −1 배 한다 (E 와 −E 는 같은 기하).
 *   2) W = [[0,−1,0],[1,0,0],[0,0,1]] 로 후보 R 두 개 (U·W·Vᵀ, U·Wᵀ·Vᵀ) × t 두 개 (U 의 셋째 열, 그 반대) = 4개.
 *   3) 키랄리티: 후보마다 대응점의 두 깊이 Z1, Z2 를 구해 둘 다 양수인 점을 센다. 가장 많은 후보를 고른다
 *      (같으면 먼저 본 후보). 하나도 없으면 예외.
 * 조건: 입력은 정규화 좌표 [x, y] (픽셀 아님, 식에서는 1을 붙여 x̂ = [x, y, 1]). 두 배열 길이가 다르거나 0개면 예외.
 *       E 의 부호·크기는 상관없다. 돌려주는 t 는 크기 1 (이동의 크기는 사진만으로 모른다).
 *
 * @param E   필수 행렬 (3×3, 행 우선). x̂2ᵀ E x̂1 = 0
 * @param x1  사진 1의 정규화 좌표들
 * @param x2  사진 2의 짝 정규화 좌표들 (같은 순서)
 * @returns   { R, t }: R 은 회전 (det = +1), |t| = 1
 */
export function decomposeE(E: Mat3, x1: readonly Vec2[], x2: readonly Vec2[]): SE3 {
  throw new Error("TODO");
}

/**
 * 선형 삼각측량 (DLT): 두 카메라에서 본 같은 점의 정규화 좌표로 3D 점을 구한다.
 *
 * 카메라 i 는 월드 점을 p_ci = R_i·X + t_i 로 옮긴다 (T_i = T_{c_i w}). P_i = [R_i | t_i] (3×4).
 * 카메라마다 식 두 줄 (x·P[2] − P[0], y·P[2] − P[1]) → 4×4 행렬 A → A·h = 0 을 2주차 nullspaceSVD 로.
 * 조건: h 의 마지막 성분이 0 (거의 0) 이면 두 광선이 평행 → 예외. 아니면 [h0, h1, h2] / h3.
 *
 * @param T1  카메라 1 자세 (월드 → 카메라 1)
 * @param T2  카메라 2 자세 (월드 → 카메라 2)
 * @param x1  카메라 1의 정규화 좌표
 * @param x2  카메라 2의 정규화 좌표
 * @returns   월드 좌표의 3D 점
 */
export function triangulate(T1: SE3, T2: SE3, x1: Vec2, x2: Vec2): Vec3 {
  throw new Error("TODO");
}

/**
 * PnP (DLT): 월드 3D 점과 그 정규화 좌표로 카메라 자세 T_cw = { R, t } 를 구한다 (p_c = R·X + t).
 *
 * 단계 (레슨 과제 힌트에 자세히):
 *   1) 점 하나가 P (3×4, 원소 12개, 행 우선) 에 대한 식 두 줄 → 쌓아서 A·p = 0 → nullspaceSVD.
 *   2) P = λ·[R | t]. 앞 3×3 M 의 행렬식이 음수면 P 를 −1 배 (λ > 0, 점이 카메라 앞).
 *   3) 잡음 때문에 M/λ 는 정확한 회전이 아니다 → M = U·Σ·Vᵀ 에서 R = U·Vᵀ, λ = 특이값 평균, t = P 의 넷째 열 / λ.
 * 조건: 점이 6개 미만이거나 두 배열 길이가 다르면 예외.
 *
 * @param Xw  월드 좌표 3D 점들
 * @param x   각 점의 정규화 좌표 (같은 순서)
 * @returns   { R, t }: R 은 회전 (RᵀR = I, det = +1)
 */
export function pnpDLT(Xw: readonly Vec3[], x: readonly Vec2[]): SE3 {
  throw new Error("TODO");
}
