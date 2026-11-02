/**
 * 대응점 파일(export_matches.py) + calib.json을 브라우저에서 읽어 정규화 좌표로 바꾸는 공용 부분.
 * 5주차 "내 사진으로 해보기"(MatchFileRunner)와 6주차 "내 사진으로 3D 복원"(ReconstructRunner)이 함께 쓴다.
 * 왜곡 풀기는 4주차 정답(undistort, unprojectFisheye)을 lib/impl.ts 경유로 쓴다 (실습의 주인공이 아니라서).
 */
import { loadFn } from "./impl";
import type { Calib, V2 } from "./matchesFile";

type V3 = readonly [number, number, number];
type Intr = { fx: number; fy: number; cx: number; cy: number };
type Unproject = (px: V2, K: Intr, k: readonly number[]) => V3;
type Undistort = (xd: V2, d: { k1: number; k2: number; p1: number; p2: number; k3: number }) => V2;

const MAX_FILE_BYTES = 2 * 1024 * 1024;
/** 광축과 이 각도보다 많이 벌어진 방향은 b/b_z가 너무 커져서 뺀다 (b_z ≤ 0.1, 약 84°). export_matches.py와 같다 */
const MIN_BZ = 0.1;

export async function readText(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name}이 너무 크다 (${Math.round(file.size / 1024)}KB, 최대 2MB)`);
  return file.text();
}

export interface Normalized {
  /** 사진 1, 2의 정규화 좌표 (쓸 수 없는 대응은 뺐다) */
  a: V2[];
  b: V2[];
  /** 정규화 좌표 거리 → 픽셀 거리 (임계값을 픽셀로 쓰려고) */
  scale: number;
  /** 뺀 대응 수 */
  dropped: number;
}

/** 캘리브레이션에 맞게 픽셀을 정규화 좌표로 바꾼다. 어안은 84° 밖, 핀홀은 왜곡을 못 푼 점을 뺀다 */
export async function toNormalized(pts1: readonly V2[], pts2: readonly V2[], calib: Calib): Promise<Normalized> {
  const K: Intr = { fx: calib.fx, fy: calib.fy, cx: calib.cx, cy: calib.cy };
  let toNorm: (p: V2) => V2 | null;
  if (calib.model === "fisheye") {
    const unproject = await loadFn<Unproject>(4, "unprojectFisheye", "reference");
    toNorm = (p) => {
      const v = unproject(p, K, calib.distortion);
      return v[2] > MIN_BZ ? [v[0] / v[2], v[1] / v[2]] : null;
    };
  } else {
    const undistort = await loadFn<Undistort>(4, "undistort", "reference");
    const [k1 = 0, k2 = 0, p1 = 0, p2 = 0, k3 = 0] = calib.distortion;
    toNorm = (p) => {
      const x = undistort([(p[0] - K.cx) / K.fx, (p[1] - K.cy) / K.fy], { k1, k2, p1, p2, k3 });
      return Number.isFinite(x[0]) && Number.isFinite(x[1]) ? x : null;
    };
  }
  const a: V2[] = [];
  const b: V2[] = [];
  pts1.forEach((p, i) => {
    const na = toNorm(p);
    const nb = toNorm(pts2[i]!);
    if (na && nb) {
      a.push(na);
      b.push(nb);
    }
  });
  return { a, b, scale: (calib.fx + calib.fy) / 2, dropped: pts1.length - a.length };
}
