/** 데모 공용 슬라이더: 라벨 + 현재 값 + 44px 터치 영역 (ARCHITECTURE §8) */
import styles from "./Slider.module.css";

interface SliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  /** 화면에 보일 값 형식 (기본: 그대로) */
  format?: (v: number) => string;
}

export default function Slider({ id, label, value, min, max, step, unit, onChange, format = String }: SliderProps) {
  return (
    <div className={styles.slider}>
      <label htmlFor={id}>
        {label}{" "}
        <output htmlFor={id}>
          {format(value)}
          {unit}
        </output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
      />
    </div>
  );
}
