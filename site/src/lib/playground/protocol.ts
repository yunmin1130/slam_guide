/** 채점 워커와 화면 사이의 메시지 (runner.worker.ts ↔ client.ts) */

export type CaseStatus = "pass" | "fail" | "todo";

export interface CaseResult {
  fn: string;
  name: string; // "기본: …"
  status: CaseStatus;
  message?: string;
}

export type RunSummary =
  | { kind: "done"; cases: CaseResult[] }
  | { kind: "compile-error" | "no-tests"; message: string; cases: [] };

export interface RunMessage {
  type: "run";
  week: string;
  fn?: string;
  source: string;
}

export type WorkerMessage =
  | { type: "case"; result: CaseResult }
  | { type: "summary"; summary: RunSummary }
  | { type: "crash"; message: string };
