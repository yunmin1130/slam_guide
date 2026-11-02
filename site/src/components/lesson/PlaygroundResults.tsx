/** 채점 결과 목록: 케이스마다 통과/실패/TODO + 실패 메시지 */
import type { RunOutcome } from "../../lib/playground/client";
import type { CaseResult } from "../../lib/playground/protocol";
import styles from "./CodePlayground.module.css";

const ICON: Record<CaseResult["status"], string> = { pass: "✓", fail: "✗", todo: "○" };

function headline(outcome: RunOutcome | null, cases: CaseResult[], running: boolean): { text: string; tone: string } {
  if (running) return { text: `채점 중… (${cases.length})`, tone: "muted" };
  if (!outcome) return { text: "", tone: "muted" };
  switch (outcome.kind) {
    case "compile-error":
      return { text: `코드를 읽지 못했어 — ${outcome.message}`, tone: "fail" };
    case "no-tests":
      return { text: outcome.message, tone: "fail" };
    case "timeout":
      return { text: "8초 안에 안 끝났어. 무한 루프가 있는지 봐줘 (처음 실행이면 한 번 더 눌러봐)", tone: "fail" };
    case "crash":
      return { text: `채점기 오류: ${outcome.message}`, tone: "fail" };
    case "done": {
      const pass = cases.filter((c) => c.status === "pass").length;
      const all = pass === cases.length;
      return { text: all ? `전부 통과 (${pass}/${cases.length})` : `통과 ${pass} / ${cases.length}`, tone: all ? "mine" : "fail" };
    }
  }
}

interface PlaygroundResultsProps {
  outcome: RunOutcome | null;
  cases: CaseResult[];
  running: boolean;
}

export default function PlaygroundResults({ outcome, cases, running }: PlaygroundResultsProps) {
  const head = headline(outcome, cases, running);
  if (!head.text) return null;
  return (
    <section className={styles.results} aria-live="polite">
      <p className={styles.headline} data-tone={head.tone}>
        {head.text}
      </p>
      {cases.length > 0 && (
        <ul className={styles.cases}>
          {cases.map((c) => (
            <li key={c.name} className={styles.case} data-status={c.status}>
              <span className={styles.icon} aria-label={c.status}>
                {ICON[c.status]}
              </span>
              <span className={styles.caseName}>{c.name}</span>
              {c.message && c.status === "fail" && <pre className={styles.caseMsg}>{c.message}</pre>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
