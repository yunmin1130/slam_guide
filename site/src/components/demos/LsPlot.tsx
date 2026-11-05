/** LeastSquaresDemo의 그림: 점, 내가 고른 직선, 잔차 막대(분홍)와 그 제곱 넓이, 최소제곱 직선(점선) */
import { useId } from "react";
import { T_RANGE, Y_RANGE, type Point } from "../../lib/lsScene";
import styles from "./LeastSquaresDemo.module.css";

const W = 300;
const PAD = 22;
const SPAN = W - 2 * PAD;
const fx = (t: number) => PAD + (SPAN * (t - T_RANGE[0])) / (T_RANGE[1] - T_RANGE[0]);
const fy = (y: number) => W - PAD - (SPAN * (y - Y_RANGE[0])) / (Y_RANGE[1] - Y_RANGE[0]);
/** t·y 범위가 같아서 같은 길이가 가로·세로에서 같은 픽셀이다 (정사각형이 진짜 정사각형) */
const UNIT_PX = SPAN / (T_RANGE[1] - T_RANGE[0]);
const TICKS = [1, 2, 3, 4];

function linePath(a: number, c: number): string {
  const [t0, t1] = T_RANGE;
  return `M${fx(t0).toFixed(1)},${fy(a * t0 + c).toFixed(1)} L${fx(t1).toFixed(1)},${fy(a * t1 + c).toFixed(1)}`;
}

interface LsPlotProps {
  points: readonly Point[];
  a: number;
  c: number;
  residuals: readonly number[];
  squares: boolean;
  /** 겹쳐 그릴 최소제곱 직선 (a, c). 없으면 안 그린다 */
  best: readonly [number, number] | null;
  label: string;
}

export default function LsPlot({ points, a, c, residuals, squares, best, label }: LsPlotProps) {
  const clip = `${useId().replace(/:/g, "")}-clip`;
  return (
    <svg className={styles.image} viewBox={`0 0 ${W} ${W}`} role="img" aria-label={label}>
      <rect className={styles.ground} x={0} y={0} width={W} height={W} rx={6} />
      {TICKS.map((v) => (
        <g key={v}>
          <line className={styles.grid} x1={fx(v)} y1={PAD} x2={fx(v)} y2={W - PAD} />
          <line className={styles.grid} x1={PAD} y1={fy(v)} x2={W - PAD} y2={fy(v)} />
          <text className={styles.tick} x={fx(v)} y={W - 6} textAnchor="middle">
            {v}
          </text>
          <text className={styles.tick} x={PAD - 6} y={fy(v) + 4} textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      <line className={styles.axis} x1={PAD} y1={fy(0)} x2={W - PAD} y2={fy(0)} />
      <line className={styles.axis} x1={fx(0)} y1={PAD} x2={fx(0)} y2={W - PAD} />
      <clipPath id={clip}>
        <rect x={PAD} y={PAD} width={SPAN} height={SPAN} />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        {squares &&
          points.map(([t, y], i) => {
            const side = Math.abs(residuals[i]!) * UNIT_PX;
            return <rect key={i} className={styles.square} x={fx(t)} y={Math.min(fy(y), fy(a * t + c))} width={side} height={side} />;
          })}
        {best && <path className={styles.best} d={linePath(best[0], best[1])} />}
        <path className={styles.mine} d={linePath(a, c)} />
        {points.map(([t, y], i) => (
          <line key={i} className={styles.residual} x1={fx(t)} y1={fy(y)} x2={fx(t)} y2={fy(a * t + c)} />
        ))}
      </g>
      {points.map(([t, y], i) => (
        <circle key={i} className={styles.point} cx={fx(t)} cy={fy(y)} r={5} />
      ))}
    </svg>
  );
}
