/**
 * 사용자가 올린 대응점·캘리브레이션 JSON 읽기 (5주차 "내 사진으로 해보기").
 * 형식은 DATA §2 matches/{i}_{j}.json, §3 calib.json. 외부 입력이라 모양을 엄격히 확인하고,
 * 틀리면 무엇이 틀렸는지 한국어로 알려주는 예외를 던진다.
 */

export type V2 = readonly [number, number];

/** 폰에서 RANSAC을 돌릴 수 있는 정도로 제한 */
export const MAX_MATCHES = 5000;
const MIN_MATCHES = 8;

export interface Matches {
  pts1: V2[];
  pts2: V2[];
}

export interface Calib {
  model: "pinhole" | "fisheye";
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  distortion: number[];
}

function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${what} 파일이 올바른 JSON이 아니다`);
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** 픽셀 좌표로 말이 되는 범위 (1e300 같은 값이 계산 중에 넘치지 않게) */
const MAX_COORD = 1e5;
const pixel = (v: unknown): v is number => finite(v) && Math.abs(v) <= MAX_COORD;

function points(v: unknown, key: string): V2[] {
  if (!Array.isArray(v)) throw new Error(`대응점 파일에 ${key} 배열이 없다`);
  if (v.length > MAX_MATCHES) throw new Error(`대응점이 너무 많다 (${v.length}개, 최대 ${MAX_MATCHES}개)`);
  return v.map((p, i) => {
    if (!Array.isArray(p) || p.length < 2 || !pixel(p[0]) || !pixel(p[1])) throw new Error(`${key}[${i}]가 [숫자, 숫자]가 아니다 (픽셀 좌표, 절댓값 ${MAX_COORD} 이하)`);
    return [p[0], p[1]] as const;
  });
}

export function parseMatches(text: string): Matches {
  const data = parseJson(text, "대응점");
  if (!isObject(data)) throw new Error("대응점 파일의 최상위가 객체가 아니다");
  const pts1 = points(data.pts_i, "pts_i");
  const pts2 = points(data.pts_j, "pts_j");
  if (pts1.length !== pts2.length) throw new Error(`pts_i와 pts_j의 개수가 다르다 (${pts1.length} ≠ ${pts2.length})`);
  if (pts1.length < MIN_MATCHES) throw new Error(`대응점이 ${MIN_MATCHES}개 이상 필요하다 (${pts1.length}개)`);
  return { pts1, pts2 };
}

export function parseCalib(text: string): Calib {
  const data = parseJson(text, "캘리브레이션");
  const cam = isObject(data) ? data.camera : undefined;
  if (!isObject(cam)) throw new Error("캘리브레이션 파일에 camera 항목이 없다 (DATA §3)");
  const { model, fx, fy, cx, cy, distortion } = cam;
  if (model !== "pinhole" && model !== "fisheye") throw new Error(`camera.model은 pinhole 또는 fisheye여야 한다 (${String(model)})`);
  for (const [k, v] of Object.entries({ fx, fy })) {
    if (!finite(v) || v <= 0) throw new Error(`camera.${k}가 양수가 아니다`);
  }
  for (const [k, v] of Object.entries({ cx, cy })) {
    if (!finite(v)) throw new Error(`camera.${k}가 숫자가 아니다`);
  }
  if (!Array.isArray(distortion) || !distortion.every(finite)) throw new Error("camera.distortion이 숫자 배열이 아니다");
  if (model === "fisheye" && distortion.length !== 4) throw new Error(`어안 모델은 왜곡 계수가 4개여야 한다 (${distortion.length}개)`);
  return { model, fx: fx as number, fy: fy as number, cx: cx as number, cy: cy as number, distortion: distortion as number[] };
}
