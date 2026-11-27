/**
 * 4b주차 데모: 가우시안 하나가 화면의 타원이 되는 과정과, 겹친 스플랫의 알파 합성.
 * - 그림 ①: 위에서 본 장면 (카메라·화각·가우시안). 그림 ②: 카메라 이미지 위의 2D 타원 (1σ·2σ·3σ).
 * - 그림 ③: 스플랫 세 개가 겹친 띠. 칸마다 α = 불투명도 × gaussianWeight2D, 색은 alphaComposite.
 * - core 함수는 직접 import하지 않고 useImplFns(lib/impl.ts)로 가져온다 (ARCHITECTURE §4).
 * - 함수마다 따로 try로 감싸서, 내 구현 하나가 TODO여도 나머지 그림은 그린다.
 */
import { useId, useMemo, useState } from "react";
import type { ImplKind } from "../../lib/impl";
import {
  IDENTITY3,
  IMAGE,
  INTR,
  STRIP,
  STRIP_SIGMA,
  STRIP_SPLATS,
  centerPixel,
  depthOrder,
  ellipseAxes,
  ellipsePoints,
  marginalXZ,
  rotationYawRoll,
  silhouetteU,
  stripColumns,
  toCss,
  type EllipseAxes,
  type Intr,
  type M2,
  type M3,
  type V2,
  type V3,
} from "../../lib/splatScene";
import { useImplFns } from "../../lib/useImplFns";
import ImplToggle, { defaultKind, type FnStatusEntry } from "../ui/ImplToggle";
import Slider from "../ui/Slider";
import styles from "./SplatDemo.module.css";

type Fns = {
  buildCovariance: (scale: V3, R: M3) => M3;
  projectCovariance: (Sigma: M3, Rcw: M3, pCam: V3, K: Intr) => M2 | null;
  gaussianWeight2D: (d: V2, Sigma2D: M2) => number;
  alphaComposite: (colors: readonly V3[], alphas: readonly number[]) => { color: V3; transmittance: number };
};
const FN_NAMES = ["buildCovariance", "projectCovariance", "gaussianWeight2D", "alphaComposite"] as const;

interface SplatDemoProps {
  week: number;
  statuses: FnStatusEntry[];
}

const fmt = (digits: number) => (v: number) => v.toFixed(digits);
const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const polygon = (points: readonly V2[]): string => points.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

// ---- 그림 ①: 위에서 본 장면 (x 오른쪽, z 위쪽) ----

const TOP = { width: 320, height: 200, scale: 22, originY: 190 } as const;
const topX = (x: number) => TOP.width / 2 + TOP.scale * x;
const topY = (z: number) => TOP.originY - TOP.scale * z;
const TOP_FAR = TOP.originY / TOP.scale;

/** 카메라 원점에서 방향 (t, 1)로 뻗는 광선 (t = x/z) */
function rayPath(t: number): string {
  return `M${topX(0)} ${topY(0)}L${topX(t * TOP_FAR).toFixed(1)} ${topY(TOP_FAR).toFixed(1)}`;
}

interface TopViewProps {
  center: V3;
  /** 아직 구현을 불러오는 중이면 null (카메라와 화각만 그린다) */
  Sigma: M3 | null;
  /** 선형화가 예측한 1σ 가로 범위 [u_min, u_max] (픽셀). 투영을 못 했으면 null */
  linearU: V2 | null;
  trueU: V2 | null;
}

function TopView({ center, Sigma, linearU, trueU }: TopViewProps) {
  const clipId = `sd-top-${useId().replace(/[^\w-]/g, "")}`;
  const slope = (u: number) => (u - INTR.cx) / INTR.fx;
  const body = Sigma ? ellipsePoints([center[0], center[2]], marginalXZ(Sigma)).map((p): V2 => [topX(p[0]), topY(p[1])]) : [];
  const half = IMAGE.width / 2 / INTR.fx;
  return (
    <svg className={styles.image} viewBox={`0 0 ${TOP.width} ${TOP.height}`} role="img" aria-label={`위에서 본 장면. 가우시안 중심은 옆으로 ${center[0].toFixed(1)}, 깊이 ${center[2].toFixed(1)}`}>
      <defs>
        <clipPath id={clipId}>
          <rect width={TOP.width} height={TOP.height} />
        </clipPath>
      </defs>
      <rect className={styles.ground} width={TOP.width} height={TOP.height} rx={6} />
      <g clipPath={`url(#${clipId})`}>
        <path className={styles.fov} d={`${rayPath(-half)}${rayPath(half)}`} />
        <path className={styles.centerRay} d={rayPath(center[0] / center[2])} />
        {trueU && <path className={styles.trueRay} d={`${rayPath(slope(trueU[0]))}${rayPath(slope(trueU[1]))}`} />}
        {linearU && <path className={styles.ray} d={`${rayPath(slope(linearU[0]))}${rayPath(slope(linearU[1]))}`} />}
        {body.length > 0 && <polygon className={styles.gaussFill} points={polygon(body)} />}
        {/* 이미지 평면 (z = 1) 과 그 위에 맺힌 1σ 폭 */}
        <line className={styles.plane} x1={topX(-half)} y1={topY(1)} x2={topX(half)} y2={topY(1)} />
        {linearU && <line className={styles.footprint} x1={topX(slope(linearU[0]))} y1={topY(1)} x2={topX(slope(linearU[1]))} y2={topY(1)} />}
      </g>
      <circle className={styles.camera} cx={topX(0)} cy={topY(0)} r={5} />
      <text className={styles.label} x={topX(0) + 10} y={topY(0) + 6}>
        카메라
      </text>
      <text className={styles.label} x={topX(half) + 6} y={topY(1) + 4}>
        이미지 평면
      </text>
    </svg>
  );
}

// ---- 그림 ②: 카메라 이미지 ----

function ImageView({ center, S2, trueU }: { center: V2; S2: M2 | null; trueU: V2 | null }) {
  const clipId = `sd-img-${useId().replace(/[^\w-]/g, "")}`;
  const { width: W, height: H } = IMAGE;
  const axes = S2 ? ellipseAxes(S2) : null;
  const dir: V2 = axes ? [Math.cos((axes.angleDeg * Math.PI) / 180), Math.sin((axes.angleDeg * Math.PI) / 180)] : [1, 0];
  const label = axes ? `카메라 이미지. 타원의 긴 반축 ${axes.major.toFixed(0)}픽셀, 짧은 반축 ${axes.minor.toFixed(0)}픽셀` : "카메라 이미지";
  return (
    <svg className={styles.image} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <defs>
        <clipPath id={clipId}>
          <rect width={W} height={H} />
        </clipPath>
      </defs>
      <rect className={styles.sensor} width={W} height={H} />
      <g clipPath={`url(#${clipId})`}>
        {S2 && axes && (
          <>
            <polygon className={styles.sigma3} points={polygon(ellipsePoints(center, S2, 3))} />
            <polygon className={styles.sigma2} points={polygon(ellipsePoints(center, S2, 2))} />
            <polygon className={styles.sigma1} points={polygon(ellipsePoints(center, S2, 1))} />
          </>
        )}
        {axes && (
          <path
            className={styles.axis}
            d={`M${center[0]} ${center[1]}l${(dir[0] * axes.major).toFixed(1)} ${(dir[1] * axes.major).toFixed(1)}M${center[0]} ${center[1]}l${(-dir[1] * axes.minor).toFixed(1)} ${(dir[0] * axes.minor).toFixed(1)}`}
          />
        )}
        {trueU && <path className={styles.trueRay} d={`M${trueU[0].toFixed(1)} 0V${H}M${trueU[1].toFixed(1)} 0V${H}`} />}
      </g>
      {/* 주점 (cx, cy) */}
      <path className={styles.principal} d={`M${INTR.cx - 7} ${INTR.cy}h14M${INTR.cx} ${INTR.cy - 7}v14`} />
    </svg>
  );
}

// ---- 그림 ③: 알파 합성 띠 ----

const BAND = { width: 320, left: 52, right: 314, rowHeight: 22, rowGap: 6, top: 6, finalHeight: 44 } as const;
const BAND_FINAL_Y = BAND.top + 3 * (BAND.rowHeight + BAND.rowGap) + 6;
const BAND_HEIGHT = BAND_FINAL_Y + BAND.finalHeight + 6;
const COLUMNS = stripColumns();
const COLUMN_WIDTH = (BAND.right - BAND.left) / STRIP.columns;
const bandX = (x: number) => BAND.left + ((x - STRIP.min) / (STRIP.max - STRIP.min)) * (BAND.right - BAND.left);

interface StripResult {
  /** 깊이 순서대로, 칸마다 그 스플랫 혼자의 α */
  rowAlphas: number[][];
  /** 칸마다 합성한 색 (alphaComposite가 실패했으면 null) */
  final: V3[] | null;
  /** 가운데 픽셀 (x = 0) 에서의 α (깊이 순서) */
  probeAlphas: number[];
  probe: { color: V3; transmittance: number } | null;
  /** 가운데 픽셀의 합성 과정 한 줄씩 (깊이 순서) */
  steps: CompositeStep[];
  weightError: string | null;
  /** gaussianWeight2D가 0~1 밖이나 NaN을 낸 적이 있으면 true (그림은 0~1로 잘라 그린다) */
  weightOutOfRange: boolean;
  compositeError: string | null;
}

/** 합성 과정 한 줄: 이 가우시안 직전의 T 와 그 가우시안의 기여 */
interface CompositeStep {
  alpha: number;
  transmittanceBefore: number;
  contribution: number;
}

const EMPTY_STRIP: StripResult = { rowAlphas: [], final: null, probeAlphas: [], probe: null, steps: [], weightError: null, weightOutOfRange: false, compositeError: null };

/**
 * 수치 표시용 합성 과정. 정답 식을 데모에 따로 두지 않고, 토글로 고른 alphaComposite 로 구한다:
 * 앞의 r개만 합성하고 남은 T 가 r번째 직전 투과율이고, 기여는 그 가우시안을 지나며 줄어든 T 다.
 */
function probeSteps(fns: Fns, colors: readonly V3[], alphas: readonly number[]): CompositeStep[] {
  const left = (n: number) => fns.alphaComposite(colors.slice(0, n), alphas.slice(0, n)).transmittance;
  return alphas.map((alpha, r) => {
    const before = left(r);
    return { alpha, transmittanceBefore: before, contribution: before - left(r + 1) };
  });
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
const inUnitRange = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1;

function computeStrip(fns: Fns, order: readonly number[], opacities: readonly number[]): StripResult {
  const empty = EMPTY_STRIP;
  let weightOutOfRange = false;
  const alphaAt = (i: number, x: number) => {
    const w = fns.gaussianWeight2D([x - STRIP_SPLATS[i]!.center, 0], STRIP_SIGMA);
    if (!inUnitRange(w)) weightOutOfRange = true;
    return clamp01(opacities[i]! * w);
  };
  let rowAlphas: number[][];
  let probeAlphas: number[];
  try {
    rowAlphas = order.map((i) => COLUMNS.map((x) => alphaAt(i, x)));
    probeAlphas = order.map((i) => alphaAt(i, 0));
  } catch (e) {
    return { ...empty, weightError: errorText(e) };
  }
  const colors = order.map((i) => STRIP_SPLATS[i]!.color);
  try {
    const final = COLUMNS.map((_, c) => fns.alphaComposite(colors, rowAlphas.map((row) => row[c]!)).color);
    const probe = fns.alphaComposite(colors, probeAlphas);
    return { ...empty, rowAlphas, probeAlphas, weightOutOfRange, final, probe, steps: probeSteps(fns, colors, probeAlphas) };
  } catch (e) {
    return { ...empty, rowAlphas, probeAlphas, weightOutOfRange, compositeError: errorText(e) };
  }
}

function StripView({ order, result }: { order: readonly number[]; result: StripResult }) {
  const rowY = (r: number) => BAND.top + r * (BAND.rowHeight + BAND.rowGap);
  const place = ["앞", "중간", "뒤"];
  return (
    <svg className={styles.image} viewBox={`0 0 ${BAND.width} ${BAND_HEIGHT}`} role="img" aria-label="스플랫 세 개와 그것을 앞에서부터 합성한 띠">
      {order.map((i, r) => (
        <g key={i}>
          <text className={styles.label} x={BAND.left - 6} y={rowY(r) + 15} textAnchor="end">
            {place[r]} {STRIP_SPLATS[i]!.name}
          </text>
          <rect className={styles.stripBack} x={BAND.left} y={rowY(r)} width={BAND.right - BAND.left} height={BAND.rowHeight} />
          {result.rowAlphas[r]?.map((a, c) => {
            const col = STRIP_SPLATS[i]!.color;
            return <rect key={c} x={BAND.left + c * COLUMN_WIDTH} y={rowY(r)} width={COLUMN_WIDTH + 0.5} height={BAND.rowHeight} fill={toCss([col[0] * a, col[1] * a, col[2] * a])} />;
          })}
          <rect className={styles.stripFrame} x={BAND.left} y={rowY(r)} width={BAND.right - BAND.left} height={BAND.rowHeight} />
        </g>
      ))}
      <text className={styles.label} x={BAND.left - 6} y={BAND_FINAL_Y + 26} textAnchor="end">
        합성
      </text>
      <rect className={styles.stripBack} x={BAND.left} y={BAND_FINAL_Y} width={BAND.right - BAND.left} height={BAND.finalHeight} />
      {result.final?.map((color, c) => <rect key={c} x={BAND.left + c * COLUMN_WIDTH} y={BAND_FINAL_Y} width={COLUMN_WIDTH + 0.5} height={BAND.finalHeight} fill={toCss(color)} />)}
      <rect className={styles.stripFrame} x={BAND.left} y={BAND_FINAL_Y} width={BAND.right - BAND.left} height={BAND.finalHeight} />
      {/* 수치를 읽는 가운데 픽셀 */}
      <line className={styles.probe} x1={bandX(0)} y1={BAND.top} x2={bandX(0)} y2={BAND_FINAL_Y + BAND.finalHeight} />
    </svg>
  );
}

// ---- 데모 ① 가우시안 하나를 화면으로 ----

interface Projection {
  Sigma: M3 | null;
  S2: M2 | null;
  error: string | null;
}

function computeProjection(fns: Fns, scale: V3, R: M3, center: V3): Projection {
  let Sigma: M3;
  try {
    Sigma = fns.buildCovariance(scale, R);
  } catch (e) {
    return { Sigma: null, S2: null, error: `buildCovariance: ${errorText(e)}` };
  }
  try {
    // 데모의 카메라는 월드 원점에 있다: W = I, 카메라 좌표 = 월드 좌표
    return { Sigma, S2: fns.projectCovariance(Sigma, IDENTITY3, center, INTR), error: null };
  } catch (e) {
    return { Sigma, S2: null, error: `projectCovariance: ${errorText(e)}` };
  }
}

/** 그림과 수치에 쓰는 값: 중심 픽셀, 타원 축, 선형화가 예측한 가로 폭과 실제 실루엣 */
interface ProjectionView {
  pixel: V2;
  S2: M2 | null;
  axes: EllipseAxes | null;
  sigmaU: number | null;
  linearU: V2 | null;
  trueU: V2 | null;
}

function projectionView(center: V3, proj: Projection | null): ProjectionView {
  const pixel = centerPixel(center, INTR);
  const S2 = proj?.S2 ?? null;
  const sigmaU = S2 ? Math.sqrt(Math.max(0, S2[0][0])) : null;
  const linearU: V2 | null = sigmaU !== null && Number.isFinite(sigmaU) ? [pixel[0] - sigmaU, pixel[0] + sigmaU] : null;
  const trueU = proj?.Sigma ? silhouetteU(center, proj.Sigma, INTR) : null;
  return { pixel, S2, axes: S2 ? ellipseAxes(S2) : null, sigmaU, linearU, trueU };
}

function ProjectionFigures({ center, Sigma, view }: { center: V3; Sigma: M3 | null; view: ProjectionView }) {
  // 그림 틀은 구현을 불러오는 중에도 늘 그린다 (자리 밀림 방지, QA가 role=figure를 찾는다)
  return (
    <>
      <figure className={styles.panel} role="figure" aria-label="위에서 본 장면">
        <TopView center={center} Sigma={Sigma} linearU={view.linearU} trueU={view.trueU} />
        <figcaption className={styles.caption}>
          <span className={styles.lgGauss}>가우시안 1σ와 선형화가 예측한 폭</span> <span className={styles.lgTrue}>실제 실루엣</span>{" "}
          <span className={styles.lgCam}>화각·이미지 평면</span>
        </figcaption>
      </figure>
      <figure className={`${styles.panel} ${styles.sticky}`} role="figure" aria-label="카메라 이미지 위의 2D 타원">
        <ImageView center={view.pixel} S2={view.S2} trueU={view.trueU} />
        <figcaption className={styles.caption}>
          <span className={styles.lgGauss}>진한 선 1σ, 바깥으로 2σ·3σ</span> <span className={styles.lgTrue}>실제 실루엣의 좌우 끝</span>
        </figcaption>
      </figure>
    </>
  );
}

interface ProjectionReadoutProps {
  who: string;
  loading: boolean;
  loadError: string | null;
  proj: Projection | null;
  view: ProjectionView;
}

function ProjectionReadout({ who, loading, loadError, proj, view }: ProjectionReadoutProps) {
  const { pixel, S2, axes, sigmaU, trueU } = view;
  return (
    <div className={styles.readout}>
      {/* 낭독기는 오류·불러오기 문구만 읽는다. 수치는 슬라이더마다 바뀌어서 live 영역 밖에 둔다 */}
      <div role="status">
        {loading && !loadError && <p className={styles.muted}>구현 불러오는 중…</p>}
        {loadError && <p className={styles.error}>{loadError}</p>}
        {proj?.error && (
          <p className={styles.error}>
            {who}이 예외를 던졌다 — {proj.error}
          </p>
        )}
        {proj && !proj.error && !S2 && <p className={styles.error}>{who} projectCovariance가 null을 돌려줬다 (z &gt; 0 인데도).</p>}
      </div>
      {S2 && axes && (
        <dl className={styles.values}>
          <dt>중심 픽셀</dt>
          <dd>
            ({pixel[0].toFixed(0)}, {pixel[1].toFixed(0)})
          </dd>
          <dt>2D 공분산 Σ′</dt>
          <dd>
            [[{S2[0][0].toFixed(0)}, {S2[0][1].toFixed(0)}], [{S2[1][0].toFixed(0)}, {S2[1][1].toFixed(0)}]]
          </dd>
          <dt>축 길이 (1σ)</dt>
          <dd>
            {axes.major.toFixed(1)} px · {axes.minor.toFixed(1)} px, 기울기 {axes.angleDeg.toFixed(0)}°
          </dd>
          <dt>가로 폭 (1σ)</dt>
          <dd>
            선형화 {sigmaU !== null ? sigmaU.toFixed(1) : "–"} px · 실제 {trueU ? `${((trueU[1] - trueU[0]) / 2).toFixed(1)} px` : "잴 수 없음"}
          </dd>
        </dl>
      )}
    </div>
  );
}

interface PanelProps {
  fns: Fns | null;
  who: string;
}

function ProjectionPanel({ fns, who, loadError }: PanelProps & { loadError: string | null }) {
  const [depth, setDepth] = useState(4);
  const [side, setSide] = useState(0);
  const [length, setLength] = useState(1.2);
  const [thickness, setThickness] = useState(0.4);
  const [yaw, setYaw] = useState(0);
  const [roll, setRoll] = useState(0);
  const center: V3 = useMemo(() => [side, 0, depth], [side, depth]);
  const proj = useMemo(
    () => (fns ? computeProjection(fns, [length, thickness, thickness], rotationYawRoll(yaw, roll), center) : null),
    [fns, length, thickness, yaw, roll, center],
  );
  const view = projectionView(center, proj);
  return (
    <section className={styles.section} aria-label="가우시안 하나를 화면으로">
      <h3 className={styles.title}>① 가우시안 하나를 화면으로</h3>
      <ProjectionFigures center={center} Sigma={proj?.Sigma ?? null} view={view} />
      <div className={styles.controls}>
        <Slider id="sd-depth" label="깊이 z" value={depth} min={2} max={8} step={0.5} unit="" onChange={setDepth} format={fmt(1)} />
        <Slider id="sd-side" label="옆 위치 x" value={side} min={-4} max={4} step={0.5} unit="" onChange={setSide} format={fmt(1)} />
        <Slider id="sd-length" label="긴 축 길이 s₁" value={length} min={0.2} max={2} step={0.1} unit="" onChange={setLength} format={fmt(1)} />
        <Slider id="sd-thick" label="굵기 s₂ = s₃" value={thickness} min={0.2} max={1.6} step={0.1} unit="" onChange={setThickness} format={fmt(1)} />
        <Slider id="sd-yaw" label="회전 (위에서 볼 때)" value={yaw} min={0} max={180} step={5} unit="°" onChange={setYaw} />
        <Slider id="sd-roll" label="회전 (이미지 안에서)" value={roll} min={0} max={180} step={5} unit="°" onChange={setRoll} />
      </div>
      <ProjectionReadout who={who} loading={!fns} loadError={loadError} proj={proj} view={view} />
    </section>
  );
}

// ---- 데모 ② 겹친 스플랫을 앞에서부터 합성 ----

function StripReadout({ who, strip, order }: { who: string; strip: StripResult | null; order: readonly number[] }) {
  return (
    <div className={styles.readout}>
      <div role="status">
        {strip?.weightError && (
          <p className={styles.error}>
            {who} gaussianWeight2D가 예외를 던졌다: {strip.weightError}
          </p>
        )}
        {strip?.weightOutOfRange && (
          <p className={styles.error}>
            {who} gaussianWeight2D가 0~1 밖의 값(또는 NaN)을 냈다. 그림은 0~1로 잘라 그렸으니 테스트로 확인한다.
          </p>
        )}
        {strip?.compositeError && (
          <p className={styles.error}>
            {who} alphaComposite가 예외를 던졌다: {strip.compositeError} (합성 줄은 비워 뒀다)
          </p>
        )}
      </div>
      {strip?.probe && (
        <dl className={styles.values}>
          {strip.steps.map((step, r) => (
            <div key={order[r]} style={{ display: "contents" }}>
              <dt>{STRIP_SPLATS[order[r]!]!.name}</dt>
              <dd>
                α {step.alpha.toFixed(2)} × T {step.transmittanceBefore.toFixed(2)} = {step.contribution.toFixed(2)}
              </dd>
            </div>
          ))}
          <dt>남은 T</dt>
          <dd>{strip.probe.transmittance.toFixed(2)}</dd>
          <dt>픽셀 색</dt>
          <dd>
            <span className={styles.swatch} style={{ background: toCss(strip.probe.color) }} />({strip.probe.color.map((v) => v.toFixed(2)).join(", ")})
          </dd>
        </dl>
      )}
    </div>
  );
}

function StripPanel({ fns, who }: PanelProps) {
  const [opacities, setOpacities] = useState<readonly number[]>([0.5, 0.5, 1]);
  const [reversed, setReversed] = useState(false);
  const order = useMemo(() => depthOrder(reversed), [reversed]);
  const strip = useMemo(() => (fns ? computeStrip(fns, order, opacities) : null), [fns, order, opacities]);
  const setOpacity = (i: number) => (v: number) => setOpacities((prev) => prev.map((o, n) => (n === i ? v : o)));
  return (
    <section className={styles.section} aria-label="겹친 스플랫의 알파 합성">
      <h3 className={styles.title}>② 겹친 스플랫을 앞에서부터 합성</h3>
      <figure className={`${styles.panel} ${styles.sticky}`} role="figure" aria-label="알파 합성 띠">
        <StripView order={order} result={strip ?? EMPTY_STRIP} />
        <figcaption className={styles.caption}>
          <span className={styles.lgPlain}>위 세 줄 = 스플랫 하나씩, 맨 아래 = 합성 결과, 흰 점선 = 수치를 읽는 픽셀</span>
        </figcaption>
      </figure>
      <div className={styles.controls}>
        {STRIP_SPLATS.map((s, i) => (
          <Slider key={s.name} id={`sd-op-${i}`} label={`${s.name} 불투명도`} value={opacities[i]!} min={0} max={1} step={0.05} unit="" onChange={setOpacity(i)} format={fmt(2)} />
        ))}
        <button type="button" className={styles.button} aria-pressed={reversed} onClick={() => setReversed((v) => !v)}>
          앞뒤 순서 뒤집기
        </button>
      </div>
      <StripReadout who={who} strip={strip} order={order} />
    </section>
  );
}

// ---- 데모 ----

export default function SplatDemo({ week, statuses }: SplatDemoProps) {
  const [kind, setKind] = useState<ImplKind>(() => defaultKind(statuses));
  const { fns, loadError } = useImplFns<Fns>(week, FN_NAMES, kind);
  const who = kind === "mine" ? "내 구현" : "정답";
  return (
    <div className={styles.demo}>
      <ImplToggle statuses={statuses} value={kind} onChange={setKind} />
      <ProjectionPanel fns={fns} who={who} loadError={loadError} />
      <StripPanel fns={fns} who={who} />
    </div>
  );
}
