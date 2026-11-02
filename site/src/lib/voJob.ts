/**
 * VO 한 번 실행하기 (11c 데모, 11d TUM 실행기 공용). 화면은 설정(VoSettings)만 고르고,
 * 워커(vo.worker.ts)가 lib/impl.ts로 vo를 불러 이 파일의 runVoJob으로 돌린다.
 * 설정 → VoOptions 변환과 결과 정리를 여기 모아서 워커 없이도 테스트한다.
 */
import type { Feature, Intrinsics, RobustLoss, SE3, Vec3, VoOptions, VoResult } from "@core/types";
import type { ImplKind } from "./impl";

export interface VoSettings {
  /** 추적 inlier 기준 (픽셀). 합성은 3, TUM은 롤링 셔터·블러 때문에 5~6 */
  readonly trackThreshold: number;
  /** 초기화 시차 기준 (도) */
  readonly minParallaxDeg: number;
  readonly localBA: boolean;
  readonly window: number;
  /** 키프레임 사이 최대 프레임 수 */
  readonly maxKeyframeGap: number;
  readonly minInitPoints: number;
  readonly minTrackInliers: number;
}

export const SYNTHETIC_SETTINGS: VoSettings = {
  trackThreshold: 3,
  minParallaxDeg: 3,
  localBA: true,
  window: 4,
  maxKeyframeGap: 5,
  minInitPoints: 30,
  minTrackInliers: 15,
};

/** TUM fr1/xyz 300프레임, fr3/long_office 800프레임(--every 3)을 끝까지 따라간 설정 (2026-11-03 확인) */
export const TUM_SETTINGS: VoSettings = {
  trackThreshold: 6,
  minParallaxDeg: 3,
  localBA: true,
  window: 4,
  maxKeyframeGap: 8,
  minInitPoints: 50,
  minTrackInliers: 30,
};

export interface VoJob {
  readonly kind: ImplKind;
  readonly K: Intrinsics;
  readonly frames: readonly (readonly Feature[])[];
  readonly settings: VoSettings;
}

/** 워커가 돌려주는 결과 (구조화 복제가 되는 값만) */
export interface VoJobResult {
  readonly poses: readonly (SE3 | null)[];
  readonly keyframeFrames: readonly number[];
  readonly mapPoints: readonly Vec3[];
  readonly initFrames: readonly [number, number] | null;
  readonly lostAt: number | null;
  readonly ms: number;
}

/** 시드 고정 난수 (RANSAC 결과가 실행마다 같게) */
export function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** local BA의 Huber 커널 (k = 2 px). 7a와 같은 정의를 여기 둔다: 7a 손코딩 전에도 데모가 돌게 */
const HUBER_K = 2;
function huber(r: number): RobustLoss {
  const a = Math.abs(r);
  return a <= HUBER_K ? { rho: 0.5 * r * r, weight: 1 } : { rho: HUBER_K * (a - 0.5 * HUBER_K), weight: HUBER_K / a };
}

const INIT_THRESHOLD_PX = 2;
const RANSAC_ITERATIONS = { init: 200, track: 100 };
const BA_SOLVER = { maxIterations: 6, tolerance: 1e-6 };
const KEYFRAME_MIN_FRAMES = 2;
const KEYFRAME_TRACKED_RATIO = 0.8;

export function buildVoOptions(s: VoSettings, onFrame?: (frame: number) => void): VoOptions {
  return {
    init: { threshold: INIT_THRESHOLD_PX, iterations: RANSAC_ITERATIONS.init, minParallaxDeg: s.minParallaxDeg, minPoints: s.minInitPoints, rng: seededRng(1) },
    track: { threshold: s.trackThreshold, iterations: RANSAC_ITERATIONS.track, minInliers: s.minTrackInliers, rng: seededRng(2) },
    keyframe: { minFrames: KEYFRAME_MIN_FRAMES, maxFrames: s.maxKeyframeGap, minTrackedRatio: KEYFRAME_TRACKED_RATIO },
    ba: s.localBA ? { window: s.window, solver: { ...BA_SOLVER, robust: huber } } : null,
    onFrame,
  };
}

const isTriple = (v: unknown): boolean => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number" && Number.isFinite(x));

function isPose(T: unknown): T is SE3 {
  if (typeof T !== "object" || T === null) return false;
  const { R, t } = T as { R?: unknown; t?: unknown };
  return Array.isArray(R) && R.length === 3 && R.every(isTriple) && isTriple(t);
}

/** 내 vo가 돌려준 값이 그림을 그릴 수 있는 꼴인지 확인하고 정리한다 */
export function summarize(r: VoResult, frameCount: number, ms: number): VoJobResult {
  if (!r || !Array.isArray(r.poses) || r.poses.length !== frameCount || !r.poses.every((T) => T === null || isPose(T))) {
    throw new Error("vo가 프레임마다 자세(또는 null)를 돌려주지 않았다");
  }
  return {
    poses: r.poses,
    keyframeFrames: (r.keyframes ?? []).map((k) => k.frame),
    mapPoints: (r.map ?? []).map((p) => p.X).filter(isTriple),
    initFrames: r.initFrames ?? null,
    lostAt: r.lostAt ?? null,
    ms,
  };
}

export type VoFn = (K: Intrinsics, frames: readonly (readonly Feature[])[], opts: VoOptions) => VoResult;

export function runVoJob(job: VoJob, vo: VoFn, onFrame?: (frame: number) => void): VoJobResult {
  const t0 = performance.now();
  const r = vo(job.K, job.frames, buildVoOptions(job.settings, onFrame));
  return summarize(r, job.frames.length, performance.now() - t0);
}
