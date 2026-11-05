/** MatrixWarp minimize 모드: |x| = 1에서 |Ax|가 가장 작은 방향 = V의 마지막 열 (Ax = 0 풀기) */
import { useId, useState } from "react";
import { svd2 } from "../../lib/mat2";
import { findPreset, MIN_PRESETS, MIN_STEP, minimizeProbe, rangeFor } from "../../lib/warpScene";
import Slider from "../ui/Slider";
import { Arrow, fmtNum, Mark, Plane, Shape, Through } from "./Plane";
import { Chip, CIRCLE, colOf, Frame, imageOf, Key, rowStyle, Segment, Status, valuesStyle } from "./warpParts";

function minimizeStatus(hit: boolean, sigmaMin: number): string {
  if (!hit) return "x를 돌려서 |Ax|가 가장 작아지는 방향을 찾아 보자";
  if (sigmaMin < 1e-6) return "|Ax| = 0: A가 이 방향을 0으로 눌러 버린다 → Ax = 0의 답(영공간). x = ±v₂, V의 마지막 열";
  return "|Ax|가 가장 작다 (= σ₂). x = ±v₂, V의 마지막 열";
}

export default function MinimizeWarp({ initial }: { initial: string }) {
  const id = useId();
  const [presetId, setPresetId] = useState(initial);
  const [deg, setDeg] = useState(0);
  const [show, setShow] = useState(false);
  const preset = findPreset(MIN_PRESETS, presetId);
  const A = preset.m;
  const { V } = svd2(A);
  const { x, Ax, len, hit, sigma } = minimizeProbe(A, deg);
  const range = rangeFor(A);
  const v2 = colOf(V, 1);

  return (
    <Frame
      label="단위벡터 x를 돌리며 |Ax| 길이 재기"
      caption={
        <>
          <Key tone="probe">청록</Key> = 길이 1인 x, <Key tone="image">주황</Key> = Ax. x가 원을 한 바퀴 돌면 Ax는 주황 타원을 한 바퀴 돈다. Ax가 가장 짧은 곳은 타원의 가장 짧은 반축이다
        </>
      }
      controls={
        <>
          <Segment label="행렬" options={MIN_PRESETS} value={preset.id} onChange={setPresetId} />
          <Slider id={`${id}-deg`} label="x의 방향" value={deg} min={0} max={360 - MIN_STEP} step={MIN_STEP} unit="°" onChange={setDeg} />
          <div className={rowStyle}>
            <Chip on={show} onToggle={() => setShow(!show)}>
              V의 열 보기
            </Chip>
          </div>
        </>
      }
      readout={
        <>
          <dl className={valuesStyle}>
            <dt>|x|</dt>
            <dd>1.00</dd>
            <dt>|Ax|</dt>
            <dd>{fmtNum(len, 3)}</dd>
            <dt>가능한 범위</dt>
            <dd>
              σ₂ = {fmtNum(sigma[1])} ~ σ₁ = {fmtNum(sigma[0])}
            </dd>
          </dl>
          <Status hit={hit}>{minimizeStatus(hit, sigma[1])}</Status>
        </>
      }
    >
      <Plane range={range} label={`${preset.label}, x 방향 ${deg}°`}>
        <Shape points={imageOf(A)} tone="image" />
        <Shape points={CIRCLE} tone="faint" dashed />
        {show && (
          <>
            <Through dir={v2} tone="v2" range={range} />
            <Mark at={colOf(V, 0)} tone="v1" text="v₁" />
            <Mark at={v2} tone="v2" text="v₂" />
          </>
        )}
        <Arrow to={Ax} tone="image" thick />
        <Arrow to={x} tone="probe" thick />
      </Plane>
    </Frame>
  );
}
