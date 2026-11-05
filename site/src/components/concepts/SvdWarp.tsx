/** MatrixWarp svd 모드: A = UΣVᵀ를 돌리기 → 늘리기 → 돌리기 3단계로 나눠 본다 */
import { useEffect, useId, useRef, useState } from "react";
import { apply, svd2, svdStage } from "../../lib/mat2";
import { findPreset, rangeFor, SVD_PRESETS } from "../../lib/warpScene";
import Slider from "../ui/Slider";
import { Arrow, fmtNum, MatrixView, Plane, Shape } from "./Plane";
import { CIRCLE, colOf, Frame, imageOf, Key, matricesStyle, rowStyle, Segment, Status, valuesStyle } from "./warpParts";
import styles from "./MatrixWarp.module.css";

const STAGES = [
  "입력: 단위 원과 V의 두 열 v₁(파랑), v₂(보라)",
  "① Vᵀ로 돌리기: v₁은 가로축으로, v₂는 세로축으로 간다 (원은 원 그대로)",
  "② Σ로 늘리기: 가로축은 σ₁배, 세로축은 σ₂배 → 축에 맞춘 타원",
  "③ U로 돌리기: 파랑은 σ₁u₁, 보라는 σ₂u₂가 된다 = A를 곱한 결과",
] as const;
const PLAY_MS = 4500;

function stageText(t: number): string {
  if (t <= 0) return STAGES[0];
  return STAGES[Math.min(3, Math.ceil(t - 1e-9))]!;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** 단계 t를 0→3으로 재생. 슬라이더를 직접 움직이면 재생을 멈춘다 */
function usePlayback(): { t: number; playing: boolean; play: () => void; seek: (v: number) => void } {
  const [t, setT] = useState(3);
  const [playing, setPlaying] = useState(false);
  const frame = useRef<number | null>(null);
  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setPlaying(false);
  };
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  const play = () => {
    stop();
    if (prefersReducedMotion()) {
      setT(3);
      return;
    }
    const start = performance.now();
    setPlaying(true);
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / PLAY_MS);
      setT(Number((k * 3).toFixed(3)));
      if (k < 1) frame.current = requestAnimationFrame(tick);
      else stop();
    };
    frame.current = requestAnimationFrame(tick);
  };
  const seek = (v: number) => {
    stop();
    setT(v);
  };
  return { t, playing, play, seek };
}

export default function SvdWarp({ initial }: { initial: string }) {
  const id = useId();
  const [presetId, setPresetId] = useState(initial);
  const { t, playing, play, seek } = usePlayback();
  const preset = findPreset(SVD_PRESETS, presetId);
  const A = preset.m;
  const { U, sigma, V } = svd2(A);
  const M = svdStage(A, t);

  return (
    <Frame
      label="SVD를 세 단계로 나눠 본 모습"
      caption={
        <>
          점선 = 단위 원. <Key tone="image">주황</Key> = 지금 단계까지 곱한 원. <Key tone="v1">파랑</Key>·<Key tone="v2">보라</Key> = v₁, v₂가 옮겨 간 곳. 마지막엔 길이 σ₁, σ₂인 타원의 반축이 된다
        </>
      }
      controls={
        <>
          <Segment label="행렬" options={SVD_PRESETS} value={preset.id} onChange={setPresetId} />
          <Slider id={`${id}-t`} label="단계" value={t} min={0} max={3} step={0.05} unit="" onChange={seek} format={(v) => `${v.toFixed(2)} / 3`} />
          <div className={rowStyle}>
            <button type="button" className={styles.chip} onClick={play} disabled={playing}>
              {playing ? "재생 중…" : "▶ 처음부터 재생"}
            </button>
          </div>
        </>
      }
      readout={
        <>
          <Status hit={t >= 3}>{stageText(t)}</Status>
          <div className={matricesStyle}>
            <MatrixView m={V} label="V" />
            <MatrixView m={[sigma[0], 0, 0, sigma[1]]} label="Σ" />
            <MatrixView m={U} label="U" />
          </div>
          <dl className={valuesStyle}>
            <dt>특이값</dt>
            <dd>
              σ₁ = {fmtNum(sigma[0])}, σ₂ = {fmtNum(sigma[1])}
            </dd>
          </dl>
        </>
      }
    >
      <Plane range={rangeFor(A)} label={`${preset.label}, 단계 ${t.toFixed(2)}`}>
        <Shape points={imageOf(M)} tone="image" />
        <Shape points={CIRCLE} tone="faint" dashed />
        <Arrow to={apply(M, colOf(V, 0))} tone="v1" thick />
        <Arrow to={apply(M, colOf(V, 1))} tone="v2" thick />
      </Plane>
    </Frame>
  );
}
