/** 2주차 정답 구현. 시그니처는 core/mine/w02.ts와 같다. */
import { Matrix, SingularValueDecomposition } from "ml-matrix";
import type { MatN, VecN } from "../types";

function assertRectangular(A: MatN, name: string): void {
  if (A.length === 0 || A[0].length === 0) throw new Error(`${name}: 빈 행렬`);
  const cols = A[0].length;
  if (A.some((row) => row.length !== cols)) throw new Error(`${name}: 행 길이가 서로 다르다`);
}

export function solveLeastSquares(A: MatN, b: VecN): number[] {
  assertRectangular(A, "solveLeastSquares");
  const rows = A.length;
  const cols = A[0].length;
  if (b.length !== rows) throw new Error(`solveLeastSquares: b 길이(${b.length})가 A 행 수(${rows})와 다르다`);
  if (rows < cols) throw new Error(`solveLeastSquares: 식(${rows})이 미지수(${cols})보다 적다`);

  // x = V Σ⁻¹ Uᵀ b (유사역행렬). 세로로 길거나 정방이라 thin SVD로 충분하다.
  // 열이 일차종속(랭크 부족)인 입력은 스펙 밖이다: σ가 0이면 Infinity/NaN이 나온다.
  const svd = new SingularValueDecomposition(new Matrix(A.map((r) => [...r])));
  const sigma = svd.diagonal;

  const U = svd.leftSingularVectors;
  const V = svd.rightSingularVectors;
  const x = new Array<number>(cols).fill(0);
  for (let k = 0; k < cols; k++) {
    let ub = 0;
    for (let i = 0; i < rows; i++) ub += U.get(i, k) * b[i];
    const coef = ub / sigma[k];
    for (let j = 0; j < cols; j++) x[j] += coef * V.get(j, k);
  }
  return x;
}

export function nullspaceSVD(A: MatN): number[] {
  assertRectangular(A, "nullspaceSVD");
  const cols = A[0].length;

  // thin SVD 함정: 가로로 긴 행렬(행 < 열)은 V의 마지막 열이 잘릴 수 있다 → 0행을 채워 정방으로 만든다.
  const padded = A.map((r) => [...r]);
  while (padded.length < cols) padded.push(new Array<number>(cols).fill(0));

  const V = new SingularValueDecomposition(new Matrix(padded)).rightSingularVectors;
  // 특이값은 내림차순 → 마지막 열이 가장 작은 특이값의 오른쪽 특이벡터
  const x = V.getColumn(cols - 1);
  const n = Math.hypot(...x);
  return x.map((v) => v / n);
}
