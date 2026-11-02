/**
 * 5주차 데모: 두 사진 사이의 대응점, 에피폴라선, RANSAC.
 * - 합성 장면(카메라 2대, 대응점 60개)에 잡음과 잘못된 대응(아웃라이어)을 섞는다.
 * - 8점 알고리즘을 전체 점에 바로 쓴 결과와, RANSAC으로 inlier만 골라 쓴 결과를 비교한다.
 * - epipolarLine·eightPoint·ransac은 useImplFns(lib/impl.ts)로 가져온다. 하나가 예외를 던지면 그 부분만
 *   오류를 보여주고, 내 구현이면 "정답으로 보기" 버튼으로 reference로 되돌릴 수 있다 (ARCHITECTURE §5, 5주차).
 */
import { useDeferredValue, useId, useMemo, useState } from "react";
import type { ImplKind } from "../../lib/impl";
import {
  IMAGE,
  clipLine,
  isFiniteMatrix,
  makeFitter,
  makeScene,
  meanLineDistance,
  pointLineDistance,
  ransacIterations,
  seededRng,
  type M3,
  type Scene,
  type V2,
  type V3,
} from "../../lib/epipolarScene";
import { useImplFns } from "../../lib/useImplFns";
import ImplToggle, { defaultKind, type FnStatusEntry } from "../ui/ImplToggle";
import Slider from "../ui/Slider";
import styles from "./EpipolarDemo.module.css";
import MatchFileRunner, { type EpipolarFns } from "./MatchFileRunner";

const FN_NAMES = ["epipolarLine", "eightPoint", "ransac"] as const;
const COUNT = 60;
const SAMPLE = 8;
const THRESHOLD_PX = 2;
const MAX_ITERATIONS = 2000;
const TAP_RADIUS = 40; // 이미지 좌표(640×480) 기준, 이 안에서 가장 가까운 점을 고른다
/** 테두리에 걸친 점 표시가 잘리지 않게 그림 바깥에 남기는 여백 (이미지 좌표) */
const PAD = 12;

interface Result {
  plainF: M3 | null;
  ransacF: M3 | null;
  inliers: Set<number> | null;
  iterations: number;
  errors: { fn: string; message: string }[];
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 단계마다 따로 try: 한 함수가 TODO여도 나머지 결과는 보여준다 */
function compute(fns: EpipolarFns, scene: Scene, seed: number, outlierRatio: number): Result {
  const { x1, x2 } = scene;
  const errors: Result["errors"] = [];
  const iterations = Math.min(MAX_ITERATIONS, ransacIterations(1 - outlierRatio, SAMPLE));

  let plainF: M3 | null = null;
  try {
    plainF = fns.eightPoint(x1, x2);
    if (!isFiniteMatrix(plainF)) throw new Error("결과에 NaN이나 무한대가 있다");
  } catch (e) {
    plainF = null;
    errors.push({ fn: "eightPoint", message: message(e) });
  }

  let ransacF: M3 | null = null;
  let inliers: Set<number> | null = null;
  if (plainF) {
    const fitter = makeFitter(fns.eightPoint, x1, x2);
    try {
      const r = fns.ransac(
        x1.map((_, i) => i),
        {
          sampleSize: SAMPLE,
          fit: fitter.fit,
          error: (F, i) => pointLineDistance(F, x1[i]!, x2[i]!),
          threshold: THRESHOLD_PX,
          iterations,
          rng: seededRng(seed * 7919 + 1),
        },
      );
      if (r) {
        // 마지막에 inlier 전부로 다시 맞추고(표본 8개보다 정확하다), 그 F로 inlier를 다시 센다
        const refit = (r.inliers.length >= SAMPLE ? fitter.fit(r.inliers) : null) ?? r.model;
        // 내 ransac이 이상한 모델을 돌려줘도 아래 통계 계산에서 데모 전체가 멈추지 않게 여기서 거른다
        if (!isFiniteMatrix(refit)) throw new Error("돌려준 모델이 3×3 유한 행렬이 아니다");
        ransacF = refit;
        const F = refit;
        inliers = new Set(x1.flatMap((_, i) => (pointLineDistance(F, x1[i]!, x2[i]!) < THRESHOLD_PX ? [i] : [])));
      } else {
        // 모든 표본에서 eightPoint가 실패하면 ransac은 null → 이유를 숨기지 않는다
        const why = fitter.lastError();
        errors.push({ fn: "ransac", message: `모델을 하나도 찾지 못했다${why ? ` (8개 표본에서 eightPoint 오류: ${why})` : ""}` });
      }
    } catch (e) {
      errors.push({ fn: "ransac", message: message(e) });
    }
  }
  return { plainF, ransacF, inliers, iterations, errors };
}

/** 화면 좌표 → SVG 이미지 좌표 */
function toImage(e: React.MouseEvent<SVGSVGElement>): V2 | null {
  const ctm = e.currentTarget.getScreenCTM();
  if (!ctm) return null;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
  return [p.x, p.y];
}

interface PanelProps {
  title: string;
  pts: readonly V2[];
  inliers: Set<number> | null;
  selected: number;
  lines?: { l: V3 | null; kind: "ransac" | "plain" }[];
  onPick?: (p: V2) => void;
}

function Panel({ title, pts, inliers, selected, lines = [], onPick }: PanelProps) {
  const { width: W, height: H } = IMAGE;
  const clipId = `ep-clip-${useId().replace(/[^\w-]/g, "")}`;
  const kept = inliers ? pts.filter((_, i) => inliers.has(i)).length : pts.length;
  return (
    // role="figure": 자동 QA(scripts/qa.mjs)가 데모 그림을 찾는 기준
    <figure className={styles.panel} role="figure" aria-label={title}>
      <figcaption className={styles.caption}>{title}</figcaption>
      <svg
        className={styles.image}
        viewBox={`${-PAD} ${-PAD} ${W + 2 * PAD} ${H + 2 * PAD}`}
        role="img"
        aria-label={`${title}. 점 ${pts.length}개 중 ${kept}개가 inlier`}
        onClick={onPick ? (e) => {
          const p = toImage(e);
          if (p) onPick(p);
        } : undefined}
        data-tappable={onPick ? "true" : undefined}
      >
        <defs>
          <clipPath id={clipId}>
            <rect width={W} height={H} />
          </clipPath>
        </defs>
        <rect className={styles.sensor} width={W} height={H} />
        <g clipPath={`url(#${clipId})`}>
          {lines.map(({ l, kind }, i) => {
            const seg = l ? clipLine(l) : null;
            return seg ? (
              <line key={i} className={kind === "ransac" ? styles.lineRansac : styles.linePlain} x1={seg[0][0]} y1={seg[0][1]} x2={seg[1][0]} y2={seg[1][1]} />
            ) : null;
          })}
        </g>
        {/* 점 표시는 테두리 밖으로 조금 나가도 보이게 잘라내지 않는다 (viewBox 여백) */}
        {pts.map(([u, v], i) => {
          const rejected = inliers !== null && !inliers.has(i);
          return rejected ? (
            <path key={i} className={styles.rejected} d={`M${u - 7} ${v - 7}L${u + 7} ${v + 7}M${u - 7} ${v + 7}L${u + 7} ${v - 7}`} />
          ) : (
            <circle key={i} className={inliers ? styles.inlier : styles.point} cx={u} cy={v} r={6} />
          );
        })}
        {pts[selected] && <circle className={styles.selected} cx={pts[selected][0]} cy={pts[selected][1]} r={16} />}
      </svg>
    </figure>
  );
}

const fmtPx = (v: number | null) => (v === null || !Number.isFinite(v) ? "–" : `${v.toFixed(2)} px`);

interface EpipolarDemoProps {
  week: number;
  statuses: FnStatusEntry[];
}

export default function EpipolarDemo({ week, statuses }: EpipolarDemoProps) {
  const [kind, setKind] = useState<ImplKind>(() => defaultKind(statuses));
  const [seed, setSeed] = useState(1);
  const [outlierPct, setOutlierPct] = useState(30);
  const [noise, setNoise] = useState(0.5);
  // null = 아직 안 골랐다 → 첫 진짜 대응을 보여준다 (처음부터 선이 짝 점을 지나는 모습이 보이게)
  const [selected, setSelected] = useState<number | null>(null);
  const { fns, loadError } = useImplFns<EpipolarFns>(week, FN_NAMES, kind);

  // 아웃라이어가 많으면 RANSAC 반복이 1000번을 넘어 계산이 길다 → 조작은 바로 반영하고 계산은 뒤따라오게
  const deferredPct = useDeferredValue(outlierPct);
  const deferredNoise = useDeferredValue(noise);
  const deferredSeed = useDeferredValue(seed);
  const pending = deferredPct !== outlierPct || deferredNoise !== noise || deferredSeed !== seed;
  const outlierRatio = deferredPct / 100;
  const scene = useMemo(
    () => makeScene({ seed: deferredSeed, count: COUNT, noisePx: deferredNoise, outlierRatio }),
    [deferredSeed, deferredNoise, outlierRatio],
  );
  const result = useMemo(() => (fns ? compute(fns, scene, deferredSeed, outlierRatio) : null), [fns, scene, deferredSeed, outlierRatio]);
  const firstInlier = Math.max(0, scene.isOutlier.indexOf(false));
  const sel = Math.min(selected ?? firstInlier, scene.x1.length - 1);

  // 선택한 점의 에피폴라선: 손코딩 epipolarLine으로 그린다 (실패하면 선만 빠진다)
  const lines = useMemo(() => {
    if (!fns || !result) return { list: [], error: null as string | null };
    const x = scene.x1[sel]!;
    try {
      const list: { l: V3 | null; kind: "ransac" | "plain" }[] = [];
      if (result.plainF) list.push({ l: fns.epipolarLine(result.plainF, x), kind: "plain" });
      if (result.ransacF) list.push({ l: fns.epipolarLine(result.ransacF, x), kind: "ransac" });
      return { list, error: null };
    } catch (e) {
      return { list: [], error: message(e) };
    }
  }, [fns, result, scene, sel]);

  const trueInliers = useMemo(() => scene.isOutlier.flatMap((o, i) => (o ? [] : [i])), [scene]);
  const stats = useMemo(() => {
    if (!result) return null;
    const found = result.inliers;
    return {
      mixed: found ? [...found].filter((i) => scene.isOutlier[i]).length : null,
      found: found?.size ?? null,
      plainErr: result.plainF ? meanLineDistance(result.plainF, scene.x1, scene.x2, trueInliers) : null,
      ransacErr: result.ransacF ? meanLineDistance(result.ransacF, scene.x1, scene.x2, trueInliers) : null,
    };
  }, [result, scene, trueInliers]);

  const pick = (p: V2) => {
    let best = -1;
    let bestD = TAP_RADIUS;
    scene.x1.forEach((q, i) => {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) setSelected(best);
  };
  const step = (d: number) => setSelected((sel + d + scene.x1.length) % scene.x1.length);
  const newScene = () => {
    setSeed((s) => s + 1);
    setSelected(null); // 새 장면에서는 다시 첫 진짜 대응부터
  };
  const errors = [...(result?.errors ?? []), ...(lines.error ? [{ fn: "epipolarLine", message: lines.error }] : [])];
  const who = kind === "mine" ? "내 구현" : "정답";

  return (
    <div className={styles.demo} aria-busy={pending}>
      <ImplToggle statuses={statuses} value={kind} onChange={setKind} />

      <div className={styles.figures} data-pending={pending}>
        <Panel title="카메라 1 사진: 점을 탭해서 고른다" pts={scene.x1} inliers={result?.inliers ?? null} selected={sel} onPick={pick} />
        <div className={styles.stepper}>
          <button type="button" onClick={() => step(-1)} aria-label="이전 대응점 고르기">
            ◀ 이전 점
          </button>
          <span aria-live="polite">
            {sel + 1} / {scene.x1.length}번 점
          </span>
          <button type="button" onClick={() => step(1)} aria-label="다음 대응점 고르기">
            다음 점 ▶
          </button>
        </div>
        <Panel title="카메라 2 사진: 고른 점의 에피폴라선" pts={scene.x2} inliers={result?.inliers ?? null} selected={sel} lines={lines.list} />
      </div>

      <ul className={styles.legend} aria-label="범례">
        <li className={styles.lgInlier}>RANSAC이 고른 대응 (inlier)</li>
        <li className={styles.lgRejected}>버린 대응</li>
        <li className={styles.lgSelected}>고른 점과 그 짝</li>
        <li className={styles.lgRansac}>RANSAC F의 에피폴라선</li>
        <li className={styles.lgPlain}>8점 전체 F의 선 (점선)</li>
      </ul>

      <div className={styles.controls}>
        <Slider id="ep-outlier" label="잘못된 대응 비율" value={outlierPct} min={0} max={50} step={5} unit="%" onChange={setOutlierPct} />
        <Slider id="ep-noise" label="픽셀 잡음 (표준편차)" value={noise} min={0} max={2} step={0.1} unit=" px" onChange={setNoise} format={(v) => v.toFixed(1)} />
        <button type="button" className={styles.button} onClick={newScene}>
          새 장면
        </button>
      </div>

      <div className={styles.readout}>
        <div role="status">{!fns && !loadError && <p className={styles.muted}>구현 불러오는 중…</p>}</div>
        {(loadError || errors.length > 0) && (
          <div role="alert" className={styles.alerts}>
            {loadError && <p className={styles.error}>{loadError}</p>}
            {errors.map((e) => (
              <p key={e.fn} className={styles.error}>
                {who} {e.fn}가 예외를 던졌다: {e.message}
              </p>
            ))}
          </div>
        )}
        {errors.length > 0 && kind === "mine" && (
          <button type="button" className={styles.button} onClick={() => setKind("reference")}>
            정답으로 보기
          </button>
        )}
        {stats && (
          <dl className={styles.values}>
            <dt>대응점 / 잘못된 대응</dt>
            <dd>
              {scene.x1.length} / {scene.x1.length - trueInliers.length}
            </dd>
            <dt>RANSAC이 고른 inlier</dt>
            <dd>{stats.found === null ? "–" : `${stats.found} (아웃라이어 섞임 ${stats.mixed})`}</dd>
            <dt>반복 횟수 (99%)</dt>
            <dd>{result?.iterations}</dd>
            <dt>평균 거리: 8점 전체</dt>
            <dd>{fmtPx(stats.plainErr)}</dd>
            <dt>평균 거리: RANSAC</dt>
            <dd>{fmtPx(stats.ransacErr)}</dd>
          </dl>
        )}
      </div>

      {fns && <MatchFileRunner fns={fns} who={who} />}
    </div>
  );
}
