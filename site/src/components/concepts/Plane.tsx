/**
 * 개념 그림 공용 2D 좌표 평면 (SVG). 수학 좌표(y 위쪽)를 받아 그린다.
 * 한 페이지에 그림이 여러 개라 화살촉 marker id는 useId로 그림마다 따로 만든다.
 */
import { createContext, useContext, useId, type ReactNode } from "react";
import type { V2 } from "../../lib/mat2";
import styles from "./MatrixWarp.module.css";

const VIEW = 300;
const HALF = VIEW / 2;

export type Tone = "image" | "probe" | "v1" | "v2" | "faint";
const TONES: readonly Tone[] = ["image", "probe", "v1", "v2", "faint"];

interface PlaneCtx {
  px: (p: V2) => [number, number];
  markerId: (tone: Tone) => string;
}
const Ctx = createContext<PlaneCtx | null>(null);

function usePlane(): PlaneCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("Plane 안에서만 쓴다");
  return c;
}

interface PlaneProps {
  /** 화면 반폭 (수학 좌표). 원점에서 이 거리까지 보인다 */
  range: number;
  label: string;
  children: ReactNode;
}

export function Plane({ range, label, children }: PlaneProps) {
  const uid = useId().replace(/:/g, "");
  const scale = (HALF - 12) / range;
  const px = (p: V2): [number, number] => [HALF + p[0] * scale, HALF - p[1] * scale];
  const markerId = (tone: Tone) => `${uid}-${tone}`;
  const n = Math.floor(range);
  const ticks = Array.from({ length: 2 * n + 1 }, (_, i) => i - n).filter((v) => v !== 0);

  return (
    <svg className={styles.plane} viewBox={`0 0 ${VIEW} ${VIEW}`} role="img" aria-label={label}>
      <defs>
        {TONES.map((t) => (
          <marker key={t} id={markerId(t)} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className={styles[`head_${t}`]} />
          </marker>
        ))}
      </defs>
      <clipPath id={`${uid}-clip`}>
        <rect x={0} y={0} width={VIEW} height={VIEW} rx={6} />
      </clipPath>
      <rect className={styles.ground} x={0} y={0} width={VIEW} height={VIEW} rx={6} />
      {/* 점선 직선·큰 타원이 배경 사각형 밖으로 나가지 않게 자른다 */}
      <g clipPath={`url(#${uid}-clip)`}>
        {ticks.map((v) => (
          <g key={v}>
            <line className={styles.grid} x1={px([v, 0])[0]} y1={0} x2={px([v, 0])[0]} y2={VIEW} />
            <line className={styles.grid} x1={0} y1={px([0, v])[1]} x2={VIEW} y2={px([0, v])[1]} />
          </g>
        ))}
        <line className={styles.axis} x1={0} y1={HALF} x2={VIEW} y2={HALF} />
        <line className={styles.axis} x1={HALF} y1={0} x2={HALF} y2={VIEW} />
        <Ctx.Provider value={{ px, markerId }}>{children}</Ctx.Provider>
      </g>
    </svg>
  );
}

/** 점들을 잇는 닫힌 도형 (원·타원·사각형) */
export function Shape({ points, tone, dashed = false }: { points: readonly V2[]; tone: "image" | "faint"; dashed?: boolean }) {
  const { px } = usePlane();
  const d =
    points
      .map((p, i) => {
        const [x, y] = px(p);
        return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") + " Z";
  return <path d={d} className={`${styles[`shape_${tone}`]} ${dashed ? styles.dashed : ""}`} />;
}

/** from에서 to까지 화살표. 너무 짧으면(0으로 눌린 벡터) 점으로 그린다 */
export function Arrow({ to, tone, thick = false, from = [0, 0] }: { to: V2; tone: Tone; thick?: boolean; from?: V2 }) {
  const { px, markerId } = usePlane();
  const [x1, y1] = px(from);
  const [x2, y2] = px(to);
  if (Math.hypot(x2 - x1, y2 - y1) < 3) return <circle cx={x1} cy={y1} r={5} className={styles[`dot_${tone}`]} />;
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      className={`${styles[`line_${tone}`]} ${thick ? styles.thick : ""}`}
      markerEnd={`url(#${markerId(tone)})`}
    />
  );
}

/** 원점을 지나 방향 dir로 화면 끝까지 그은 점선 (고유벡터 방향, 영공간 방향) */
export function Through({ dir, tone, range }: { dir: V2; tone: Tone; range: number }) {
  const { px } = usePlane();
  const k = range * 1.5;
  const [x1, y1] = px([-dir[0] * k, -dir[1] * k]);
  const [x2, y2] = px([dir[0] * k, dir[1] * k]);
  return <line x1={x1} y1={y1} x2={x2} y2={y2} className={`${styles[`line_${tone}`]} ${styles.through}`} />;
}

/** 점 표시 + 짧은 글자 */
export function Mark({ at, tone, text }: { at: V2; tone: Tone; text?: string }) {
  const { px } = usePlane();
  const [x, y] = px(at);
  return (
    <g>
      <circle cx={x} cy={y} r={5} className={styles[`dot_${tone}`]} />
      {text && (
        <text x={x + 8} y={y - 8} className={`${styles.markText} ${styles[`text_${tone}`]}`}>
          {text}
        </text>
      )}
    </g>
  );
}

/** 단위 원 위의 점 n개 (변환하면 타원) */
export function circlePoints(n = 96): V2[] {
  return Array.from({ length: n }, (_, i): V2 => [Math.cos((2 * Math.PI * i) / n), Math.sin((2 * Math.PI * i) / n)]);
}

export function fmtNum(v: number, digits = 2): string {
  const s = v.toFixed(digits);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
}

/** 2×2 행렬을 괄호 모양으로 보여 준다 (행 우선 [a, b, c, d]) */
export function MatrixView({ m, label, digits = 2 }: { m: readonly number[]; label: string; digits?: number }) {
  const f = (v: number) => fmtNum(v, digits);
  return (
    <span className={styles.matrix} role="img" aria-label={`${label} = [[${f(m[0]!)}, ${f(m[1]!)}], [${f(m[2]!)}, ${f(m[3]!)}]]`}>
      <span className={styles.matrixLabel} aria-hidden="true">
        {label} =
      </span>
      <span className={styles.matrixBody} aria-hidden="true">
        {m.slice(0, 4).map((v, i) => (
          <span key={i}>{f(v)}</span>
        ))}
      </span>
    </span>
  );
}
