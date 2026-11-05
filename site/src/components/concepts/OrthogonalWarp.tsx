/** MatrixWarp orthogonal 모드: 회전·반사는 원을 원 그대로 둔다 (직교 아닌 행렬과 비교) */
import { useId, useState } from "react";
import { det, mul, norm, rotation, type M2 } from "../../lib/mat2";
import { angleBetween, DEG } from "../../lib/warpScene";
import Slider from "../ui/Slider";
import { Arrow, fmtNum, MatrixView, Plane, Shape } from "./Plane";
import { CIRCLE, colOf, Frame, imageOf, Key, matricesStyle, Segment, Status, valuesStyle } from "./warpParts";

type OrthoKind = "rotate" | "reflect" | "stretch";
const ORTHO_OPTIONS: readonly { id: OrthoKind; label: string }[] = [
  { id: "rotate", label: "회전" },
  { id: "reflect", label: "반사" },
  { id: "stretch", label: "직교 아님" },
];

function matrixFor(kind: OrthoKind, deg: number): M2 {
  const R = rotation(deg * DEG);
  if (kind === "rotate") return R;
  if (kind === "reflect") return mul(R, [1, 0, 0, -1]);
  return mul(R, [1.6, 0, 0, 0.5]);
}

function orthoStatus(isOrthogonal: boolean, d: number): string {
  if (!isOrthogonal) return "열 길이가 1이 아니다 → 직교행렬이 아니다. 원이 타원으로 찌그러지고 길이가 바뀐다";
  if (d > 0) return "열이 길이 1이고 서로 수직 → 직교행렬. 원은 원 그대로, 행렬식 +1 = 회전";
  return "열이 길이 1이고 서로 수직 → 직교행렬. 원은 그대로지만 보라(Qe₂)가 파랑(Qe₁)의 시계 방향에 있다 → 행렬식 −1 = 반사";
}

export default function OrthogonalWarp() {
  const id = useId();
  const [kind, setKind] = useState<OrthoKind>("rotate");
  const [deg, setDeg] = useState(30);
  const Q = matrixFor(kind, deg);
  const q1 = colOf(Q, 0);
  const q2 = colOf(Q, 1);
  const isOrthogonal = Math.abs(norm(q1) - 1) < 1e-9 && Math.abs(norm(q2) - 1) < 1e-9 && Math.abs(angleBetween(q1, q2) - 90) < 0.5;

  return (
    <Frame
      label="직교행렬이 단위 원과 두 축을 옮기는 모습"
      caption={
        <>
          점선 = 원래 단위 원과 축 e₁, e₂. <Key tone="image">주황</Key> = 행렬을 곱한 원. <Key tone="v1">파랑</Key> = Qe₁(첫 열), <Key tone="v2">보라</Key> = Qe₂(둘째 열)
        </>
      }
      controls={
        <>
          <Segment label="행렬 종류" options={ORTHO_OPTIONS} value={kind} onChange={setKind} />
          <Slider id={`${id}-deg`} label="돌리는 각 θ" value={deg} min={-180} max={180} step={5} unit="°" onChange={setDeg} />
        </>
      }
      readout={
        <>
          <div className={matricesStyle}>
            <MatrixView m={Q} label="Q" />
          </div>
          <dl className={valuesStyle}>
            <dt>열 길이</dt>
            <dd>
              |Qe₁| = {fmtNum(norm(q1))}, |Qe₂| = {fmtNum(norm(q2))}
            </dd>
            <dt>두 열 사이 각</dt>
            <dd>{fmtNum(angleBetween(q1, q2), 1)}°</dd>
            <dt>행렬식</dt>
            <dd>{fmtNum(det(Q))}</dd>
          </dl>
          <Status hit={isOrthogonal}>{orthoStatus(isOrthogonal, det(Q))}</Status>
        </>
      }
    >
      <Plane range={1.9} label={`Q = ${ORTHO_OPTIONS.find((o) => o.id === kind)!.label}, θ = ${deg}°`}>
        <Shape points={imageOf(Q)} tone="image" />
        <Shape points={CIRCLE} tone="faint" dashed />
        <Arrow to={[1, 0]} tone="faint" />
        <Arrow to={[0, 1]} tone="faint" />
        <Arrow to={q1} tone="v1" thick />
        <Arrow to={q2} tone="v2" thick />
      </Plane>
    </Frame>
  );
}
