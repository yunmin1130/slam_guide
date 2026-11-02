/** 4주차 — 내가 직접 구현하는 파일. AI는 시그니처·힌트·TODO만 작성한다. */
import type { BrownDistortion, Intrinsics, Vec2, Vec3 } from "../types";

// 읽기만 함수: reference를 그대로 쓴다 (ARCHITECTURE §5)
export { undistort, unprojectFisheye } from "../reference/w04";

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
