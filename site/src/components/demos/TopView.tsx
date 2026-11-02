/**
 * 복원한 점 구름을 위에서 내려다본 그림 (x: 오른쪽, z: 카메라 1이 보는 앞쪽). y(아래)는 버린다.
 * 멀리 튄 점 몇 개 때문에 그림이 작아지지 않게, 범위는 점들의 2~98% 구간과 두 카메라로 잡는다.
 */
import type { V3 } from "../../lib/epipolarScene";
import styles from "./ReconstructRunner.module.css";

const W = 360;
const H = 260;
const PAD = 22;
const NICE = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];

function quantile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]!;
}

interface TopViewProps {
  points: readonly V3[];
  camera2: V3;
}

export default function TopView({ points, camera2 }: TopViewProps) {
  const xs = points.map((p) => p[0]).sort((a, b) => a - b);
  const zs = points.map((p) => p[2]).sort((a, b) => a - b);
  const x0 = Math.min(quantile(xs, 0.02), 0, camera2[0]);
  const x1 = Math.max(quantile(xs, 0.98), 0, camera2[0]);
  const z0 = Math.min(0, camera2[2]);
  const z1 = Math.max(quantile(zs, 0.98), camera2[2], 1e-6);
  // 가로세로 같은 축척 (위에서 본 모양이 찌그러지지 않게)
  const k = Math.min((W - 2 * PAD) / Math.max(x1 - x0, 1e-6), (H - 2 * PAD) / Math.max(z1 - z0, 1e-6));
  const ox = (W - k * (x1 - x0)) / 2;
  const oz = (H - k * (z1 - z0)) / 2;
  const sx = (x: number) => ox + k * (x - x0);
  const sz = (z: number) => H - (oz + k * (z - z0)); // 앞(+z)이 위로
  const shown = points.filter((p) => p[0] >= x0 && p[0] <= x1 && p[2] >= z0 && p[2] <= z1);
  // 축척 막대: 그림 폭의 35% 안에 들어가는 가장 긴 "깔끔한" 길이 (단위: 두 카메라 사이 거리 = 1)
  const bar = NICE.filter((v) => k * v <= 0.35 * W).at(-1) ?? NICE[0]!;
  const c1: [number, number] = [sx(0), sz(0)];
  const c2: [number, number] = [sx(camera2[0]), sz(camera2[2])];
  // 두 카메라가 붙어 있어도 번호가 겹치지 않게, 서로 반대쪽 바깥에 적는다
  const side = camera2[0] >= 0 ? 1 : -1;

  return (
    <figure className={styles.figure}>
      <svg
        className={styles.topView}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`위에서 본 점 구름: 복원한 점 ${points.length}개 중 ${shown.length}개, 카메라 2는 카메라 1의 ${side > 0 ? "오른쪽" : "왼쪽"}`}
      >
        <rect className={styles.ground} x={0} y={0} width={W} height={H} rx={6} />
        {shown.map((p, i) => (
          <circle key={i} className={styles.point} cx={sx(p[0])} cy={sz(p[2])} r={2.5} />
        ))}
        <line className={styles.baseline} x1={c1[0]} y1={c1[1]} x2={c2[0]} y2={c2[1]} />
        <circle className={styles.cam1} cx={c1[0]} cy={c1[1]} r={4} />
        <circle className={styles.cam2} cx={c2[0]} cy={c2[1]} r={4} />
        <text className={styles.camLabel} x={c1[0] - side * 8} y={c1[1] + 4} textAnchor={side > 0 ? "end" : "start"}>
          1
        </text>
        <text className={styles.camLabel} x={c2[0] + side * 8} y={c2[1] + 4} textAnchor={side > 0 ? "start" : "end"}>
          2
        </text>
        {/* 방향 표시: 왼쪽 위 */}
        <g className={styles.axes}>
          <line x1={14} y1={40} x2={40} y2={40} />
          <line x1={14} y1={40} x2={14} y2={14} />
          <text x={44} y={44}>+x</text>
          <text x={8} y={11}>+z</text>
        </g>
        {/* 축척 막대: 오른쪽 아래 */}
        <g className={styles.axes}>
          <line x1={W - 12 - k * bar} y1={H - 12} x2={W - 12} y2={H - 12} />
          <text x={W - 12} y={H - 18} textAnchor="end">
            {bar}
          </text>
        </g>
      </svg>
      <figcaption className={styles.caption}>
        위에서 본 모습 (가로 x, 세로 앞쪽 z). <span className={styles.lgCam1}>카메라 1</span> · <span className={styles.lgCam2}>카메라 2</span> · 길이 단위는
        두 카메라 사이 거리 = 1 · 점 {shown.length}/{points.length}개 표시
      </figcaption>
    </figure>
  );
}
