/** MatrixWarp eigen 모드: x를 돌려 Ax가 x와 같은 선에 오는 방향(고유벡터)을 찾는다 */
import { useId, useState } from "react";
import { eigen } from "../../lib/mat2";
import { EIGEN_PRESETS, EIGEN_STEP, eigenProbe, findPreset, rangeFor } from "../../lib/warpScene";
import Slider from "../ui/Slider";
import { Arrow, fmtNum, MatrixView, Plane, Shape, Through } from "./Plane";
import { Chip, CIRCLE, Frame, imageOf, Key, matricesStyle, rowStyle, Segment, Status, valuesStyle, vecText } from "./warpParts";

function eigenStatus(hit: boolean, lambda: number, isRotation: boolean): string {
  if (hit) return `Ax가 x와 같은 선 위다 → x는 고유벡터, Ax = ${fmtNum(lambda)}·x (λ = ${fmtNum(lambda)})`;
  if (isRotation) return "회전은 모든 방향을 30° 돌린다. 어느 x를 골라도 같은 선에 오지 않는다 → 실수 고유벡터가 없다";
  return "Ax가 x의 직선(청록 점선)에서 벗어나 있다. x를 돌려서 같은 선에 오는 방향을 찾아 보자";
}

export default function EigenWarp({ initial, eigenOn }: { initial: string; eigenOn: boolean }) {
  const id = useId();
  const [presetId, setPresetId] = useState(initial);
  const [deg, setDeg] = useState(20);
  const [show, setShow] = useState(eigenOn);
  const preset = findPreset(EIGEN_PRESETS, presetId);
  const A = preset.m;
  const range = rangeFor(A);
  const { x, Ax, angle, hit, lambda } = eigenProbe(A, deg);
  const eig = eigen(A);

  return (
    <Frame
      label="x와 Ax의 방향 비교"
      caption={
        <>
          <Key tone="probe">청록</Key> = 내가 고른 x (길이 1), <Key tone="image">주황</Key> = Ax. 청록 점선은 x가 놓인 직선이다. 주황 화살표가 이 점선 위에 오면 x는 고유벡터다.
          {show && (
            <>
              {" "}
              <Key tone="v1">파랑</Key>·<Key tone="v2">보라</Key> 점선 = 고유벡터 방향
            </>
          )}
        </>
      }
      controls={
        <>
          <Segment label="행렬" options={EIGEN_PRESETS} value={preset.id} onChange={setPresetId} />
          <Slider id={`${id}-deg`} label="x의 방향" value={deg} min={0} max={360 - EIGEN_STEP} step={EIGEN_STEP} unit="°" onChange={setDeg} />
          <div className={rowStyle}>
            <Chip on={show} onToggle={() => setShow(!show)}>
              고유벡터 방향 보기
            </Chip>
          </div>
        </>
      }
      readout={
        <>
          <div className={matricesStyle}>
            <MatrixView m={A} label="A" />
          </div>
          <dl className={valuesStyle}>
            <dt>x → Ax</dt>
            <dd>
              {vecText(x)} → {vecText(Ax)}
            </dd>
            <dt>x와 Ax 사이 각</dt>
            <dd>{fmtNum(angle, 1)}°</dd>
            {show && (
              <>
                <dt>고유값</dt>
                <dd>{eig ? `λ₁ = ${fmtNum(eig.values[0])}, λ₂ = ${fmtNum(eig.values[1])}` : "실수 고유값 없음"}</dd>
              </>
            )}
          </dl>
          <Status hit={hit}>{eigenStatus(hit, lambda, preset.id === "rot")}</Status>
        </>
      }
    >
      <Plane range={range} label={`A = ${preset.label}, x 방향 ${deg}°`}>
        <Shape points={imageOf(A)} tone="image" />
        <Shape points={CIRCLE} tone="faint" dashed />
        {show && eig && (
          <>
            <Through dir={eig.vectors[0]} tone="v1" range={range} />
            <Through dir={eig.vectors[1]} tone="v2" range={range} />
          </>
        )}
        <Through dir={x} tone="probe" range={range} />
        <Arrow to={Ax} tone="image" thick />
        <Arrow to={x} tone="probe" thick />
      </Plane>
    </Frame>
  );
}
