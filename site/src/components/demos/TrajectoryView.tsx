/**
 * 정답 궤적과 Sim(3) 정렬한 VO 궤적을 한 평면에 그린다 (11c 데모, 11d TUM 실행기 공용).
 * 평면은 정답 궤적이 가장 넓게 퍼진 두 방향 (lib/trajPlot.ts). 가로세로 같은 축척.
 */
import type { Vec3 } from "@core/types";
import { bounds, plotFrame, project, scaleBar, type P2 } from "../../lib/trajPlot";
import styles from "./Vo.module.css";

const W = 360;
const H = 280;
/** 궤적이 한 방향으로만 길면(옆걸음) 그림 높이를 줄인다. 가로세로 축척은 같게 둔다 */
const H_MIN = 150;
const PAD = 18;

interface TrajectoryViewProps {
  gt: readonly Vec3[];
  est: readonly Vec3[];
  /** est 중 키프레임인 것의 번호 */
  keyframes?: readonly number[];
  /** 축척 막대의 단위 이름 */
  unit: string;
}

function pathOf(pts: readonly P2[], sx: (x: number) => number, sy: (y: number) => number): string {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(" ");
}

/** 계산 중이거나 그릴 궤적이 없을 때 같은 자리를 지키는 빈 그림 (화면이 덜컹거리지 않게) */
export function TrajectoryPlaceholder({ message }: { message: string }) {
  return (
    <figure className={styles.panel} role="figure" aria-label="궤적 그림">
      <svg className={styles.image} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={message}>
        <rect className={styles.ground} x={0} y={0} width={W} height={H} rx={6} />
        <text className={styles.placeholder} x={W / 2} y={H / 2} textAnchor="middle">
          {message}
        </text>
      </svg>
      <figcaption className={styles.caption}>정답(점선)과 VO 궤적이 여기에 나온다</figcaption>
    </figure>
  );
}

export default function TrajectoryView({ gt, est, keyframes = [], unit }: TrajectoryViewProps) {
  const frame = plotFrame(gt);
  const g2 = gt.map((p) => project(frame, p));
  const e2 = est.map((p) => project(frame, p));
  const b = bounds([...g2, ...e2]);
  const k = Math.min((W - 2 * PAD) / Math.max(b.x1 - b.x0, 1e-9), (H - 2 * PAD) / Math.max(b.y1 - b.y0, 1e-9));
  const h = Math.min(H, Math.max(H_MIN, k * (b.y1 - b.y0) + 2 * PAD + 20)); // 아래 20px은 축척 막대 자리
  const ox = (W - k * (b.x1 - b.x0)) / 2;
  const oy = (h - k * (b.y1 - b.y0)) / 2;
  const sx = (x: number) => ox + k * (x - b.x0);
  const sy = (y: number) => h - (oy + k * (y - b.y0));
  const bar = scaleBar(k, W);
  const kfSet = new Set(keyframes);
  const start = g2[0];

  return (
    <figure className={styles.panel} role="figure" aria-label="궤적 그림">
      <svg
        className={styles.image}
        viewBox={`0 0 ${W} ${h}`}
        role="img"
        aria-label={`궤적 그림: 정답 ${gt.length}개 위치, VO ${est.length}개 위치, 키프레임 ${keyframes.length}개`}
      >
        <rect className={styles.ground} x={0} y={0} width={W} height={h} rx={6} />
        {/* VO를 먼저, 정답 점선을 위에: 오차가 작아 겹쳐도 점선이 보이게 */}
        <path className={styles.estPath} d={pathOf(e2, sx, sy)} />
        <path className={styles.gtPath} d={pathOf(g2, sx, sy)} />
        {e2.map((p, i) => (kfSet.has(i) ? <circle key={i} className={styles.kf} cx={sx(p[0])} cy={sy(p[1])} r={3.5} /> : null))}
        {start && <circle className={styles.start} cx={sx(start[0])} cy={sy(start[1])} r={5} />}
        <g className={styles.axes}>
          <line x1={W - 12 - k * bar} y1={h - 12} x2={W - 12} y2={h - 12} />
          <text x={W - 12} y={h - 18} textAnchor="end">
            {Number(bar.toPrecision(2))} {unit}
          </text>
        </g>
      </svg>
      <figcaption className={styles.caption}>
        <span className={styles.lgGt}>정답(점선)</span> · <span className={styles.lgEst}>VO(Sim(3) 정렬)</span> · 작은 점 = 키프레임 · 큰 원 = 출발. 궤적이 가장 넓게
        퍼진 평면에서 본 모습
      </figcaption>
    </figure>
  );
}
