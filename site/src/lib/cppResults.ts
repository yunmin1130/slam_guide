/**
 * 12a 결과 쇼케이스: site/src/data/cpp-results/*.json (datasets/cpp_result.py가 만든다)을 검사·정렬한다.
 * 형식 "slam-guide-result" v1 (docs/DATA.md §2). 빌드 때 읽으므로 틀리면 파일 이름과 함께 빌드를 멈춘다.
 */

export const RESULT_FORMAT = "slam-guide-result";
export const IMPLS = ["ts-mine", "ts-reference", "cpp", "orbslam3"] as const;
export type ResultImpl = (typeof IMPLS)[number];

export const IMPL_LABEL: Readonly<Record<ResultImpl, string>> = {
  "ts-mine": "TS (mine)",
  "ts-reference": "TS (reference)",
  cpp: "C++",
  orbslam3: "ORB-SLAM3",
};

export interface ResultEntry {
  readonly file: string;
  readonly sequence: string;
  readonly impl: ResultImpl;
  readonly gitSha: string | null;
  readonly date: string;
  readonly tracked: number | null;
  readonly total: number | null;
  /** ATE RMSE (m) */
  readonly ateRmse: number;
  /** RPE 이동 RMSE (m), 없으면 null */
  readonly rpeTrans: number | null;
  /** RPE 회전 RMSE (도), 없으면 null */
  readonly rpeRotDeg: number | null;
  readonly note: string;
}

const MAX_TEXT = 200;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fail(file: string, msg: string): never {
  throw new Error(`cpp-results/${file}: ${msg}`);
}

function text(file: string, v: unknown, name: string, allowEmpty = false): string {
  if (typeof v !== "string" || (!allowEmpty && v.trim() === "") || v.length > MAX_TEXT) {
    fail(file, `${name}는 ${MAX_TEXT}자 이하 문자열이어야 한다`);
  }
  return v;
}

function nonNegative(file: string, v: unknown, name: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) fail(file, `${name}는 0 이상의 유한한 수여야 한다`);
  return v;
}

function optionalNonNegative(file: string, v: unknown, name: string): number | null {
  return v === null || v === undefined ? null : nonNegative(file, v, name);
}

function frames(file: string, v: unknown): { tracked: number | null; total: number | null } {
  if (v === null || v === undefined) return { tracked: null, total: null };
  if (!isRecord(v)) fail(file, "frames는 { tracked, total } 이어야 한다");
  const tracked = nonNegative(file, v.tracked, "frames.tracked");
  const total = nonNegative(file, v.total, "frames.total");
  if (!(Number.isInteger(tracked) && Number.isInteger(total) && tracked <= total && total > 0)) {
    fail(file, "frames는 0 < total, 0 ≤ tracked ≤ total 인 정수여야 한다");
  }
  return { tracked, total };
}

/** 결과 파일 하나를 검사해 표에 쓸 꼴로 바꾼다 */
export function parseResult(file: string, raw: unknown): ResultEntry {
  if (!isRecord(raw)) fail(file, "JSON 객체가 아니다");
  if (raw.format !== RESULT_FORMAT || raw.version !== 1) fail(file, `format "${RESULT_FORMAT}", version 1 이 아니다`);
  const impl = raw.impl;
  if (typeof impl !== "string" || !(IMPLS as readonly string[]).includes(impl)) fail(file, `impl은 ${IMPLS.join(" | ")} 중 하나`);
  const sha = raw.git_sha;
  if (!(sha === null || (typeof sha === "string" && /^[0-9a-f]{7,40}$/.test(sha)))) fail(file, "git_sha는 16진수 7~40자 또는 null");
  const date = text(file, raw.date, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(file, "date는 YYYY-MM-DD");
  if (!isRecord(raw.ate)) fail(file, "ate가 없다");
  const rpe = raw.rpe;
  if (!(rpe === null || rpe === undefined || isRecord(rpe))) fail(file, "rpe는 객체 또는 null");
  if (isRecord(rpe) && (rpe.trans_rmse ?? null) === null && (rpe.rot_rmse_deg ?? null) === null) {
    fail(file, "rpe 객체에 trans_rmse·rot_rmse_deg가 둘 다 없다 (없으면 rpe를 null로)");
  }
  const f = frames(file, raw.frames);
  return {
    file,
    sequence: text(file, raw.sequence, "sequence"),
    impl: impl as ResultImpl,
    gitSha: sha,
    date,
    tracked: f.tracked,
    total: f.total,
    ateRmse: nonNegative(file, raw.ate.rmse, "ate.rmse"),
    rpeTrans: isRecord(rpe) ? optionalNonNegative(file, rpe.trans_rmse, "rpe.trans_rmse") : null,
    rpeRotDeg: isRecord(rpe) ? optionalNonNegative(file, rpe.rot_rmse_deg, "rpe.rot_rmse_deg") : null,
    note: raw.note === undefined ? "" : text(file, raw.note, "note", true),
  };
}

/** 시퀀스 이름순, 같은 시퀀스 안에서는 IMPLS 순서 */
export function groupBySequence(entries: readonly ResultEntry[]): { sequence: string; rows: ResultEntry[] }[] {
  const order = (e: ResultEntry) => IMPLS.indexOf(e.impl);
  const names = [...new Set(entries.map((e) => e.sequence))].sort();
  return names.map((sequence) => ({
    sequence,
    rows: entries.filter((e) => e.sequence === sequence).sort((a, b) => order(a) - order(b) || a.file.localeCompare(b.file)),
  }));
}

/** 미터를 표에 맞게: 1 m 미만은 cm */
export function formatMeters(m: number): string {
  return m < 1 ? `${(m * 100).toFixed(m < 0.1 ? 2 : 1)} cm` : `${m.toFixed(2)} m`;
}
