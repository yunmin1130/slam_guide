/**
 * 4주차 데모: 카메라 앞의 체커보드가 이미지(820×616) 어디에 맺히는지.
 * - 위: 3D 장면 (카메라·화각 피라미드·판). 아래: 카메라가 본 이미지 (SVG).
 * - project·distort는 core를 직접 import하지 않고 useImplFns(lib/impl.ts)로 가져온다 (ARCHITECTURE §4).
 * - 내 project가 TODO면 이미지를 못 그리고 오류만, 내 distort만 TODO면 왜곡 없는 이미지 + 오류를 보여준다.
 */
import { useId, useMemo, useState } from "react";
import type { ImplKind } from "../../lib/impl";
import {
  IMAGE,
  boardCorners,
  boardLines,
  cameraToWorld,
  frustumCorners,
  insideImage,
  intrinsicsFor,
  toNormalized,
  toPixel,
  type Intr,
  type V2,
  type V3,
} from "../../lib/projectionScene";
import { useImplFns } from "../../lib/useImplFns";
import ImplToggle, { defaultKind, type FnStatusEntry } from "../ui/ImplToggle";
import Slider from "../ui/Slider";
import Segments, { polylinesToSegments, type Segment } from "../viewer3d/Segments";
import Viewer3D from "../viewer3d/Viewer3D";
import styles from "./ProjectionDemo.module.css";

interface Brown {
  k1: number;
  k2: number;
  p1: number;
  p2: number;
  k3: number;
}
type Fns = {
  project: (p: V3, K: Intr) => V2 | null;
  distort: (x: V2, d: Brown) => V2;
};
const FN_NAMES = ["project", "distort"] as const;
const BOARD_COLS = 9;

/** 축 색(빨강·초록·파랑)과 겹치지 않는 색 */
// 광선은 얇은 선이라 라이트 배경에서도 보이게 진한 보라
const COLOR = { board: "#f08a24", frustum: "#17a398", ray: "#7b4fd0" } as const;
/** 3D 장면을 비스듬히 뒤에서 내려다본다 (수학 좌표: 카메라는 원점, 앞이 +y) */
const VIEW_CAMERA: V3 = [-3.2, -2.2, 2.6];
const VIEW_TARGET: V3 = [0, 1.3, -0.1];

interface ProjectionDemoProps {
  week: number;
  statuses: FnStatusEntry[];
}

const fmt = (digits: number) => (v: number) => v.toFixed(digits);
const ORIGIN = cameraToWorld([0, 0, 0]);

/** 카메라 원점에서 판 바깥 네 모서리까지의 광선 */
function boardRays(corners: readonly V3[]): Segment[] {
  const pick = [0, BOARD_COLS - 1, corners.length - 1, corners.length - BOARD_COLS];
  return pick.map((i): Segment => [ORIGIN, cameraToWorld(corners[i]!)]);
}

/** 화각 피라미드: 원점 → 네 모서리, 그리고 모서리끼리 */
function frustumSegments(corners: readonly V3[]): Segment[] {
  const w = corners.map(cameraToWorld);
  return [...w.map((c): Segment => [ORIGIN, c]), ...w.map((c, i): Segment => [c, w[(i + 1) % 4]!])];
}

interface ImageResult {
  ideal: (V2 | null)[][];
  distorted: (V2 | null)[][] | null;
  visible: number;
  total: number;
  maxShift: number;
  projectError: string | null;
  distortError: string | null;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 판의 선·교차점을 투영하고 왜곡한다. 함수가 예외를 던지면 그 단계까지만 그린다 */
function computeImage(fns: Fns, lines: V3[][], corners: V3[], K: Intr, d: Brown): ImageResult {
  const empty: ImageResult = { ideal: [], distorted: null, visible: 0, total: corners.length, maxShift: 0, projectError: null, distortError: null };
  let ideal: (V2 | null)[][];
  let idealCorners: (V2 | null)[];
  try {
    ideal = lines.map((l) => l.map((p) => fns.project(p, K)));
    idealCorners = corners.map((p) => fns.project(p, K));
  } catch (e) {
    return { ...empty, projectError: errorText(e) };
  }
  const warp = (px: V2 | null): V2 | null => (px ? toPixel(fns.distort(toNormalized(px, K), d), K) : null);
  try {
    const distorted = ideal.map((l) => l.map(warp));
    const finalCorners = idealCorners.map(warp);
    let maxShift = 0;
    finalCorners.forEach((p, i) => {
      const q = idealCorners[i];
      if (p && q && insideImage(q)) maxShift = Math.max(maxShift, Math.hypot(p[0] - q[0], p[1] - q[1]));
    });
    return { ...empty, ideal, distorted, visible: finalCorners.filter((p) => p && insideImage(p)).length, maxShift };
  } catch (e) {
    return { ...empty, ideal, visible: idealCorners.filter((p) => p && insideImage(p)).length, distortError: errorText(e) };
  }
}

/** 점 목록 → SVG 경로. null·NaN(카메라 뒤 등)에서는 펜을 든다 */
function pathOf(line: (V2 | null)[]): string {
  let d = "";
  let pen = false;
  for (const p of line) {
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    pen = true;
  }
  return d;
}

function ImageView({ result, k1 }: { result: ImageResult; k1: number }) {
  const { width: W, height: H } = IMAGE;
  const showIdeal = result.distorted !== null && k1 !== 0;
  // 한 페이지에 데모가 둘이어도 clipPath id가 겹치지 않게
  const clipId = `pd-clip-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <svg className={styles.image} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`카메라 이미지 ${W}×${H}. 판 교차점 ${result.visible}개가 보인다`}>
      <defs>
        <clipPath id={clipId}>
          <rect width={W} height={H} />
        </clipPath>
      </defs>
      <rect className={styles.sensor} width={W} height={H} />
      <g clipPath={`url(#${clipId})`} fill="none">
        {showIdeal && result.ideal.map((l, i) => <path key={`i${i}`} d={pathOf(l)} className={styles.idealLine} />)}
        {(result.distorted ?? result.ideal).map((l, i) => (
          <path key={`d${i}`} d={pathOf(l)} className={styles.boardLine} />
        ))}
      </g>
      {/* 주점 (cx, cy) */}
      <path className={styles.principal} d={`M${W / 2 - 14} ${H / 2}H${W / 2 + 14}M${W / 2} ${H / 2 - 14}V${H / 2 + 14}`} />
    </svg>
  );
}

export default function ProjectionDemo({ week, statuses }: ProjectionDemoProps) {
  const [kind, setKind] = useState<ImplKind>(() => defaultKind(statuses));
  // 기본값: 판이 이미지 폭의 절반쯤 차서 왜곡을 바꾸면 휘는 모습이 잘 보인다
  const [focal, setFocal] = useState(450);
  const [depth, setDepth] = useState(2);
  const [tiltDeg, setTilt] = useState(0);
  const [k1, setK1] = useState(0);
  const { fns, loadError } = useImplFns<Fns>(week, FN_NAMES, kind);

  const K = useMemo(() => intrinsicsFor(focal), [focal]);
  const lines = useMemo(() => boardLines({ depth, tiltDeg }), [depth, tiltDeg]);
  const corners = useMemo(() => boardCorners({ depth, tiltDeg }), [depth, tiltDeg]);

  const scene = useMemo(
    () => ({
      board: polylinesToSegments(lines.map((l) => l.map(cameraToWorld))),
      rays: boardRays(corners),
      frustum: frustumSegments(frustumCorners(K, depth)),
    }),
    [lines, corners, K, depth],
  );

  const result = useMemo(() => (fns ? computeImage(fns, lines, corners, K, { k1, k2: 0, p1: 0, p2: 0, k3: 0 }) : null), [fns, lines, corners, K, k1]);

  const hfov = (2 * Math.atan(IMAGE.width / 2 / focal) * 180) / Math.PI;
  const who = kind === "mine" ? "내 구현" : "정답";

  return (
    <div className={styles.demo}>
      <ImplToggle statuses={statuses} value={kind} onChange={setKind} />

      <Viewer3D
        label={`카메라와 ${depth.toFixed(1)}m 앞의 체커보드, 수평 화각 ${hfov.toFixed(0)}도`}
        cameraPosition={VIEW_CAMERA}
        target={VIEW_TARGET}
        axisLength={0.6}
      >
        <Segments segments={scene.frustum} color={COLOR.frustum} />
        <Segments segments={scene.rays} color={COLOR.ray} />
        <Segments segments={scene.board} color={COLOR.board} />
      </Viewer3D>

      <ul className={styles.legend} aria-label="3D 장면 색 범례">
        <li style={{ ["--c" as string]: COLOR.frustum }}>화각 (이미지에 들어오는 범위)</li>
        <li style={{ ["--c" as string]: COLOR.board }}>체커보드</li>
        <li style={{ ["--c" as string]: COLOR.ray }}>모서리로 가는 광선</li>
      </ul>

      {result && !result.projectError && (
        <>
          <ImageView result={result} k1={k1} />
          <ul className={styles.legend} aria-label="이미지 범례">
            <li style={{ ["--c" as string]: COLOR.board }}>왜곡 후 (실선)</li>
            <li className={styles.dashed}>왜곡 전 (점선, k1 ≠ 0일 때)</li>
            <li className={styles.cross}>주점 (cx, cy)</li>
          </ul>
        </>
      )}

      <div className={styles.controls}>
        {/* 250px 아래는 화각 피라미드가 3D 장면 밖으로 크게 넘친다 */}
        <Slider id="pd-focal" label="초점거리 f" value={focal} min={250} max={700} step={10} unit=" px" onChange={setFocal} />
        <Slider id="pd-depth" label="판까지 거리" value={depth} min={1} max={4} step={0.1} unit=" m" onChange={setDepth} format={fmt(1)} />
        <Slider id="pd-tilt" label="판 기울기" value={tiltDeg} min={-60} max={60} step={5} unit="°" onChange={setTilt} />
        <Slider id="pd-k1" label="방사 왜곡 k1" value={k1} min={-0.4} max={0.3} step={0.02} unit="" onChange={setK1} format={fmt(2)} />
      </div>

      <div className={styles.readout}>
        {/* 낭독기는 오류·불러오기 문구만 읽는다. 수치는 슬라이더마다 바뀌어서 live 영역 밖에 둔다 */}
        <div role="status">
          {!fns && !loadError && <p className={styles.muted}>구현 불러오는 중…</p>}
          {loadError && <p className={styles.error}>{loadError}</p>}
          {result?.projectError && (
            <p className={styles.error}>
              {who} project가 예외를 던졌다: {result.projectError}
            </p>
          )}
          {result?.distortError && (
            <p className={styles.error}>
              {who} distort가 예외를 던졌다: {result.distortError} (왜곡 없이 그렸다)
            </p>
          )}
        </div>
        {result && !result.projectError && (
          <dl className={styles.values}>
            <dt>수평 화각</dt>
            <dd>{hfov.toFixed(1)}°</dd>
            <dt>보이는 교차점</dt>
            <dd>
              {result.visible} / {result.total}
            </dd>
            <dt>왜곡 이동 (최대)</dt>
            <dd>{result.maxShift.toFixed(1)} px</dd>
          </dl>
        )}
      </div>
    </div>
  );
}
