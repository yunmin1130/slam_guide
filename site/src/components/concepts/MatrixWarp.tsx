/**
 * 2주차 개념 그림: 2×2 행렬이 평면(단위 원)을 어떻게 바꾸는지 손으로 돌려 본다.
 * 과제 함수(core)를 쓰지 않는 개념 그림이라 mine/reference 토글이 없다 (LESSON_TEMPLATE §3 ①, ARCHITECTURE §4).
 * 색: 주황 = 행렬을 곱한 결과, 청록 = 내가 고르는 x, 파랑 = 첫 열·v₁, 보라 = 둘째 열·v₂.
 *   orthogonal  회전·반사는 원을 원 그대로 둔다 (직교 아닌 행렬과 비교)
 *   eigen       x를 돌려 Ax가 x와 같은 선에 오는 방향(고유벡터)을 찾는다
 *   svd         A = UΣVᵀ를 돌리기 → 늘리기 → 돌리기 3단계로 나눠 본다
 *   minimize    |x| = 1에서 |Ax|가 가장 작은 방향 = V의 마지막 열 (Ax = 0 풀기)
 */
import EigenWarp from "./EigenWarp";
import MinimizeWarp from "./MinimizeWarp";
import OrthogonalWarp from "./OrthogonalWarp";
import SvdWarp from "./SvdWarp";

interface MatrixWarpProps {
  mode: "orthogonal" | "eigen" | "svd" | "minimize";
  /** 처음 고른 행렬 (모드별 preset id, lib/warpScene.ts) */
  preset?: string;
  /** eigen 모드: 고유벡터 방향을 처음부터 보여 줄지 */
  eigenOn?: boolean;
}

export default function MatrixWarp({ mode, preset, eigenOn = false }: MatrixWarpProps) {
  if (mode === "orthogonal") return <OrthogonalWarp />;
  if (mode === "eigen") return <EigenWarp initial={preset ?? "sym"} eigenOn={eigenOn} />;
  if (mode === "svd") return <SvdWarp initial={preset ?? "example"} />;
  return <MinimizeWarp initial={preset ?? "example"} />;
}
