/**
 * 특징점 트랙 JSON 읽기 (11d "TUM으로 VO 돌리기"). datasets/tum_tracks.py가 만든 파일, 형식은 DATA §2 tracks.
 * 외부 입력이라 모양을 엄격히 확인하고, 틀리면 무엇이 틀렸는지 한국어로 알려주는 예외를 던진다.
 */
import type { Feature, Intrinsics, Mat3, SE3 } from "@core/types";

/** tum_tracks.py와 같은 상한 (폰 메모리·계산 시간) */
export const MAX_FRAMES = 2000;
export const MAX_FEATURES = 2000;
/** 파일 전체 특징점 수 상한 (객체로 펼치면 수백 MB가 되지 않게). 800프레임 × 300개 = 24만 */
export const MAX_TOTAL_FEATURES = 600_000;
const FORMAT = "slam-guide-tracks";
const VERSION = 1;
const MAX_COORD = 1e5;
/** 쿼터니언 크기가 1에서 이만큼 넘게 벗어나면 잘못된 자세로 본다 */
const QUAT_TOLERANCE = 1e-3;

export interface TracksFile {
  readonly name: string;
  readonly camera: Intrinsics & { readonly width: number; readonly height: number };
  /** 프레임 시각 (초) */
  readonly times: readonly number[];
  readonly frames: readonly (readonly Feature[])[];
  /** 프레임마다 정답 자세 T_world_cam (없으면 null) */
  readonly groundtruth: readonly (SE3 | null)[];
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 쿼터니언 [w, x, y, z] → 회전 행렬 (크기는 1로 맞춘다) */
export function quatToMat(q: readonly [number, number, number, number]): Mat3 {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  const [w, x, y, z] = [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ];
}

function parseCamera(v: unknown): TracksFile["camera"] {
  if (!isObject(v)) throw new Error("트랙 파일에 camera 항목이 없다");
  const { fx, fy, cx, cy, width, height } = v;
  if (!finite(fx) || !finite(fy) || fx <= 0 || fy <= 0) throw new Error("camera.fx, fy가 양수가 아니다");
  if (!finite(cx) || !finite(cy)) throw new Error("camera.cx, cy가 숫자가 아니다");
  if (!Number.isInteger(width) || !Number.isInteger(height) || (width as number) <= 0 || (height as number) <= 0) {
    throw new Error("camera.width, height가 양의 정수가 아니다");
  }
  return { fx, fy, cx, cy, width: width as number, height: height as number };
}

function parseFeatures(v: unknown, k: number): Feature[] {
  if (!Array.isArray(v)) throw new Error(`frames[${k}].features가 배열이 아니다`);
  if (v.length > MAX_FEATURES) throw new Error(`frames[${k}]의 특징점이 너무 많다 (${v.length}개, 최대 ${MAX_FEATURES}개)`);
  const seen = new Set<number>();
  return v.map((f: unknown, i) => {
    if (!Array.isArray(f) || f.length !== 3) throw new Error(`frames[${k}].features[${i}]가 [id, u, v]가 아니다`);
    const [id, u, w] = f as unknown[];
    if (!Number.isInteger(id) || (id as number) < 0) throw new Error(`frames[${k}].features[${i}]의 id가 0 이상의 정수가 아니다`);
    if (!finite(u) || !finite(w) || Math.abs(u) > MAX_COORD || Math.abs(w) > MAX_COORD) {
      throw new Error(`frames[${k}].features[${i}]의 좌표가 숫자가 아니다 (절댓값 ${MAX_COORD} 이하)`);
    }
    if (seen.has(id as number)) throw new Error(`frames[${k}]에 같은 id(${String(id)})가 두 번 있다`);
    seen.add(id as number);
    return { id: id as number, uv: [u, w] as const };
  });
}

function parsePose(v: unknown, k: number): SE3 | null {
  if (v === null) return null;
  if (!Array.isArray(v) || v.length !== 7 || !v.every(finite)) throw new Error(`groundtruth[${k}]가 [tx, ty, tz, qw, qx, qy, qz] 또는 null이 아니다`);
  const [tx, ty, tz, qw, qx, qy, qz] = v as number[];
  if (Math.abs(Math.hypot(qw!, qx!, qy!, qz!) - 1) > QUAT_TOLERANCE) throw new Error(`groundtruth[${k}]의 쿼터니언 크기가 1이 아니다`);
  return { R: quatToMat([qw!, qx!, qy!, qz!]), t: [tx!, ty!, tz!] };
}

/** 화면·내려받기 파일 이름에 쓰므로 영문·숫자·_.- 만 남긴다 (줄바꿈·방향 제어 문자 등 제거) */
function safeName(v: unknown): string {
  const name = typeof v === "string" ? v.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 64) : "";
  return name.length > 0 ? name : "tracks";
}

export function parseTracks(text: string): TracksFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("트랙 파일이 올바른 JSON이 아니다");
  }
  if (!isObject(data)) throw new Error("트랙 파일의 최상위가 객체가 아니다");
  if (data.format !== FORMAT) throw new Error(`트랙 파일이 아니다 (format이 "${FORMAT}"이어야 한다, datasets/tum_tracks.py로 만든다)`);
  if (data.version !== VERSION) throw new Error(`모르는 트랙 파일 버전이다 (${String(data.version)})`);
  const camera = parseCamera(data.camera);
  const { frames, groundtruth } = data;
  if (!Array.isArray(frames) || frames.length < 2) throw new Error("frames가 2장 이상인 배열이 아니다");
  if (frames.length > MAX_FRAMES) throw new Error(`프레임이 너무 많다 (${frames.length}장, 최대 ${MAX_FRAMES}장)`);
  if (!Array.isArray(groundtruth) || groundtruth.length !== frames.length) throw new Error("groundtruth가 프레임마다 하나씩 있는 배열이 아니다");
  const times = frames.map((f: unknown, k) => {
    if (!isObject(f) || !finite(f.t)) throw new Error(`frames[${k}]에 시각 t가 없다`);
    return f.t;
  });
  if (times.some((t, k) => k > 0 && !(t > times[k - 1]!))) throw new Error("frames의 시각 t가 늘어나는 순서가 아니다");
  const total = frames.reduce((n: number, f: Record<string, unknown>) => n + (Array.isArray(f.features) ? f.features.length : 0), 0);
  if (total > MAX_TOTAL_FEATURES) throw new Error(`특징점이 모두 너무 많다 (${total}개, 최대 ${MAX_TOTAL_FEATURES}개). --max-frames나 --features를 줄여`);
  return {
    name: safeName(data.name),
    camera,
    times,
    frames: frames.map((f: unknown, k) => parseFeatures((f as Record<string, unknown>).features, k)),
    groundtruth: groundtruth.map((g: unknown, k) => parsePose(g, k)),
  };
}
