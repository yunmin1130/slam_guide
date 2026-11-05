/** MatrixWarp 모드들이 같이 쓰는 틀·버튼·작은 도우미 */
import type { ReactNode } from "react";
import { apply, type M2, type V2 } from "../../lib/mat2";
import { circlePoints, fmtNum } from "./Plane";
import styles from "./MatrixWarp.module.css";

export const CIRCLE = circlePoints();
export const imageOf = (M: M2): V2[] => CIRCLE.map((p) => apply(M, p));
export const colOf = (M: M2, j: 0 | 1): V2 => [M[j], M[2 + j]];
export const vecText = (v: V2): string => `(${fmtNum(v[0])}, ${fmtNum(v[1])})`;

interface SegmentProps<T extends string> {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}

export function Segment<T extends string>({ label, options, value, onChange }: SegmentProps<T>) {
  return (
    <div className={styles.segment} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" className={styles.option} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ on, onToggle, children }: { on: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <button type="button" className={styles.chip} aria-pressed={on} onClick={onToggle}>
      {children}
    </button>
  );
}

export function Key({ tone, children }: { tone: "image" | "probe" | "v1" | "v2"; children: ReactNode }) {
  return (
    <span className={styles.key} data-tone={tone}>
      {children}
    </span>
  );
}

export function Status({ hit, children }: { hit: boolean; children: ReactNode }) {
  return (
    <p className={styles.status} data-hit={hit}>
      {children}
    </p>
  );
}

interface FrameProps {
  label: string;
  caption: ReactNode;
  controls: ReactNode;
  readout: ReactNode;
  children: ReactNode;
}

/** 그림(캡션 포함) → 조작 → 판독값 순서의 카드 */
export function Frame({ label, caption, controls, readout, children }: FrameProps) {
  return (
    <div className={styles.widget}>
      <figure className={styles.panel} role="figure" aria-label={label}>
        {children}
        <figcaption className={styles.caption}>{caption}</figcaption>
      </figure>
      <div className={styles.controls}>{controls}</div>
      <div className={styles.readout}>{readout}</div>
    </div>
  );
}

export const rowStyle = styles.row;
export const matricesStyle = styles.matrices;
export const valuesStyle = styles.values;
