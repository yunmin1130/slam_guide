/** 5주차 — 내가 직접 구현하는 파일. AI는 시그니처·힌트·TODO만 작성한다. */
import type { Mat3, RansacOptions, RansacResult, Vec2, Vec3 } from "../types";

// 이전 주차 함수가 필요하면 이렇게 가져온다 (정답 구현을 쓴다, ARCHITECTURE §3)
//   import { nullspaceSVD } from "@core/prev/w02";
// SVD는 ml-matrix를 쓴다
//   import { Matrix, SingularValueDecomposition } from "ml-matrix";

/**
 * 첫 번째 이미지의 점 x 에 대응하는, 두 번째 이미지의 에피폴라선 l' = F x̃ (x̃ = [x, y, 1]).
 * 직선은 [a, b, c] 로 나타내고 a·u + b·v + c = 0 이다.
 *
 * 조건: a² + b² = 1 이 되게 나눠서 돌려준다 (그러면 |a·u + b·v + c| 가 점과 직선 사이의 픽셀 거리).
 *       a, b 가 둘 다 0 이면 직선이 아니므로 예외를 던진다.
 * 확인 방법: 짝 점 x' 를 넣으면 a·u' + b·v' + c ≈ 0.
 *
 * @param F  기초 행렬 (3×3, 행 우선). x'ᵀ F x = 0
 * @param x  첫 번째 이미지의 점 [u, v]
 * @returns  [a, b, c]
 */
export function epipolarLine(F: Mat3, x: Vec2): Vec3 {
  throw new Error("TODO");
}

/**
 * 정규화된 8점 알고리즘: 대응점 8개 이상으로 기초 행렬 F 를 추정한다 (x2ᵀ F x1 = 0).
 *
 * 단계 (레슨 과제 힌트에 자세히):
 *   1) 하틀리 정규화: 각 이미지의 점을 무게중심이 원점, 평균 거리 √2 가 되게 옮기고 늘린다 (N1, N2).
 *   2) 대응점 하나가 F 의 9개 원소에 대한 식 한 줄 → 쌓아서 Af = 0 → 2주차 nullspaceSVD.
 *   3) 랭크 2 강제: SVD 로 가장 작은 특이값을 0 으로.
 *   4) 정규화 되돌리기: F = N2ᵀ F̄ N1, 마지막에 ‖F‖ = 1 (프로베니우스 노름).
 * 조건: 점이 8개 미만이거나 두 배열 길이가 다르면 예외. 입력을 바꾸지 않는다.
 *       부호는 상관없다 (F 와 -F 는 같은 기하).
 *
 * @param pts1  첫 번째 이미지의 점들 (픽셀)
 * @param pts2  두 번째 이미지의 짝 점들 (같은 순서)
 * @returns     3×3 F (행 우선, 랭크 2, ‖F‖ = 1)
 */
export function eightPoint(pts1: readonly Vec2[], pts2: readonly Vec2[]): Mat3 {
  throw new Error("TODO");
}

/**
 * RANSAC: 아웃라이어가 섞인 데이터에서 가장 많은 데이터가 동의하는 모델을 찾는다.
 *
 * 반복 opts.iterations 번:
 *   - 서로 다른 데이터 opts.sampleSize 개를 opts.rng 로 무작위로 뽑는다 (같은 것을 두 번 뽑지 않는다).
 *   - opts.fit(표본) 으로 모델을 맞춘다. null 이면 이번 반복은 건너뛴다.
 *   - 모든 데이터에 opts.error(모델, 데이터) < opts.threshold 인지 세어 inlier 목록을 만든다.
 *   - inlier 가 지금까지 기록보다 많으면 기억한다 (같으면 바꾸지 않는다 → 동점이면 먼저 찾은 모델).
 *   - inlier 는 오차가 threshold 보다 "작은" 것만이다 (같으면 inlier 가 아니다).
 * 조건: sampleSize 가 데이터 수보다 크거나, iterations < 1 이거나, 모델을 하나도 못 맞추면 null.
 *       inliers 는 데이터 번호 오름차순. 입력을 바꾸지 않는다. Math.random 대신 opts.rng 만 쓴다.
 *
 * @returns  { model, inliers } 또는 null
 */
export function ransac<T, M>(items: readonly T[], opts: RansacOptions<T, M>): RansacResult<M> | null {
  throw new Error("TODO");
}
