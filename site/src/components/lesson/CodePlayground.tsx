/**
 * 과제 카드 안 코드 연습장 (island): 폰에서 core/mine 파일을 고치고 → 바로 채점 → 제출(커밋).
 * - 채점: 워커에서 core/tests 그대로 실행 (lib/playground/client.ts)
 * - 초안: storage.ts DraftStore (자동 저장)
 * - 제출: GitHub Contents API로 main에 커밋 → CI가 배지를 바꾼다
 * 데모와 배지에는 영향 없음: 그건 CI 결과(impl.ts)로만 정해진다.
 * 한 페이지에서 한 번에 하나만 연다 (같은 주차 파일을 두 카드가 동시에 고치지 않게).
 */
import { useEffect, useState } from "react";
import { runInWorker, type RunOutcome } from "../../lib/playground/client";
import { normalizeQuotes } from "../../lib/playground/quotes";
import { contentHash } from "../../lib/playground/draft";
import { ACTIONS_URL, getFile, putFile, type RemoteFile } from "../../lib/playground/github";
import type { CaseResult } from "../../lib/playground/protocol";
import { submitDraft } from "../../lib/playground/submit";
import { flushAllDrafts, useDraft } from "../../lib/playground/useDraft";
import { getTokenStore } from "../../lib/storage";
import CodeEditor from "./CodeEditor";
import PlaygroundResults from "./PlaygroundResults";
import TokenSettings from "./TokenSettings";
import styles from "./CodePlayground.module.css";

const OPEN_EVENT = "slam-playground-open";

interface CodePlaygroundProps {
  week: string; // "w01"
  fn: string;
  path: string; // "core/mine/w01.ts"
  initialSource: string; // 빌드 시점의 core/mine 파일
  buildHash: string;
  /** CI가 구문·import 오류 때문에 이 파일을 TODO 스텁으로 바꿔 배포함 (저장소 원본과 다르다) */
  buildIsStub: boolean;
}

export default function CodePlayground(props: CodePlaygroundProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== props.fn) setOpen(false);
    };
    window.addEventListener(OPEN_EVENT, onOther);
    return () => window.removeEventListener(OPEN_EVENT, onOther);
  }, [props.fn]);

  function show() {
    flushAllDrafts(); // 다른 카드에서 아직 저장 안 된 입력을 먼저 저장
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: props.fn }));
    setOpen(true);
  }

  if (!open) {
    return (
      <button type="button" className={styles.openBtn} onClick={show}>
        코드 쓰기 · 바로 채점
      </button>
    );
  }
  return <Panel {...props} onClose={() => setOpen(false)} />;
}

type Notice = { tone: "ok" | "fail" | "muted"; text: string; link?: { href: string; label: string } };

function Panel({ week, fn, path, initialSource, buildHash, buildIsStub, onClose }: CodePlaygroundProps & { onClose(): void }) {
  const draft = useDraft(week, initialSource, buildHash);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [cases, setCases] = useState<CaseResult[]>([]);
  const [lastRun, setLastRun] = useState<{ hash: string; allPass: boolean } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [conflict, setConflict] = useState<RemoteFile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function run() {
    const { code, replaced } = normalizeQuotes(draft.code);
    if (replaced) draft.setCode(code);
    setRunning(true);
    setCases([]);
    setOutcome(null);
    setNotice(replaced ? { tone: "muted", text: "둥근 따옴표(“ ”)를 곧은 따옴표로 바꿨어 (iPhone 스마트 구두점)" } : null);
    const out = await runInWorker({ week, fn, source: code, onCase: (c) => setCases((prev) => [...prev, c]) });
    setCases(out.cases);
    setOutcome(out);
    setRunning(false);
    setLastRun({ hash: contentHash(code), allPass: out.kind === "done" && out.cases.every((c) => c.status === "pass") });
  }

  async function submit(force = false) {
    const token = getTokenStore().get();
    if (!token) {
      setSettingsOpen(true);
      setNotice({ tone: "fail", text: "제출하려면 먼저 GitHub 토큰을 넣어줘" });
      return;
    }
    const tested = lastRun?.hash === contentHash(draft.code) && lastRun.allPass;
    if (!force && !tested && !window.confirm(`${fn} 테스트를 다 통과한 코드가 아니야. 그래도 제출할까?`)) return;
    setSubmitting(true); // 제출하는 동안 입력칸을 잠근다 (끝난 뒤 옛 코드로 덮이지 않게)
    setNotice({ tone: "muted", text: "제출 중…" });
    const sent = draft.code;
    try {
      const out = await submitDraft(
        { path, week, code: sent, baseHash: draft.base.hash, token, force },
        { getFile: (p, t) => getFile(p, t), putFile: (req) => putFile(req) },
      );
      if (out.kind === "conflict") {
        setConflict(out.remote);
        setNotice(null);
      } else {
        setConflict(null);
        draft.replace(sent, { hash: out.baseHash, pending: out.baseHash !== buildHash });
        setNotice(
          out.kind === "committed"
            ? { tone: "ok", text: "제출했어. 몇 분 뒤 배포되면 배지가 바뀌어", link: { href: out.commitUrl, label: "커밋 보기" } }
            : { tone: "muted", text: "저장소 파일과 같아서 제출할 게 없어" },
        );
      }
    } catch (e) {
      setNotice({ tone: "fail", text: e instanceof Error ? e.message : "제출하지 못했어" });
    } finally {
      setSubmitting(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft.code);
      setNotice({ tone: "ok", text: "파일 전체를 복사했어" });
    } catch {
      setNotice({ tone: "fail", text: "복사하지 못했어. 입력칸을 길게 눌러 전체 선택해줘" });
    }
  }

  function reset() {
    if (!window.confirm("초안을 지우고 사이트에 배포된 파일로 되돌릴까?")) return;
    draft.reset();
    setOutcome(null);
    setCases([]);
    setNotice(null);
    setConflict(null);
  }

  async function loadOriginal() {
    const token = getTokenStore().get();
    if (!token) {
      setSettingsOpen(true);
      setNotice({ tone: "fail", text: "원본을 불러오려면 GitHub 토큰이 필요해" });
      return;
    }
    if (draft.code !== initialSource && !window.confirm("지금 쓴 코드를 GitHub 원본으로 바꿀까?")) return;
    try {
      takeVersion((await getFile(path, token)).text);
    } catch (e) {
      setNotice({ tone: "fail", text: e instanceof Error ? e.message : "불러오지 못했어" });
    }
  }

  function takeVersion(text: string) {
    const hash = contentHash(text);
    draft.replace(text, { hash, pending: hash !== buildHash });
    setConflict(null);
    setNotice({ tone: "muted", text: "저장소 버전으로 바꿨어" });
  }

  return (
    <section className={styles.panel} aria-label={`${fn} 코드 연습장`}>
      <header className={styles.panelHead}>
        <span className={styles.eyebrow}>{path} 전체 · 이 기기에 자동 저장</span>
        <button type="button" className={styles.linkBtn} onClick={onClose}>
          닫기
        </button>
      </header>

      {buildIsStub && !draft.base.pending && (
        <div className={styles.banner} role="status">
          <p>배포된 파일은 구문·import 오류 때문에 TODO 스텁으로 바뀐 거야. 저장소의 원본을 불러와서 고쳐줘.</p>
          <div className={styles.row}>
            <button type="button" className={styles.btn} onClick={loadOriginal}>
              GitHub에서 원본 불러오기
            </button>
          </div>
        </div>
      )}
      {!buildIsStub && draft.state.kind === "repo-changed" && (
        <div className={styles.banner} role="status">
          <p>초안을 만든 뒤 저장소 파일이 바뀌었어 (PC에서 push했을 수 있어).</p>
          <div className={styles.row}>
            <button type="button" className={styles.btn} onClick={() => takeVersion(initialSource)}>
              배포된 버전 불러오기
            </button>
            <button type="button" className={styles.btn} onClick={draft.keepDraft}>
              내 초안 유지
            </button>
          </div>
        </div>
      )}
      {(buildIsStub ? draft.base.pending : draft.state.kind === "pending-deploy") && (
        <p className={styles.note}>
          저장소가 사이트보다 앞서 있어 · 배포 기다리는 중.{" "}
          <a href={ACTIONS_URL} target="_blank" rel="noreferrer">
            진행 보기
          </a>
        </p>
      )}

      <CodeEditor value={draft.code} onChange={draft.setCode} label={`${path} 코드`} readOnly={submitting} />

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={run} disabled={running || submitting}>
          {running ? "채점 중…" : `테스트 실행 (${fn})`}
        </button>
        <button type="button" className={styles.btn} onClick={() => submit()} disabled={submitting || running}>
          제출
        </button>
        <button type="button" className={styles.btn} onClick={copy}>
          복사
        </button>
        <button type="button" className={styles.linkBtn} onClick={reset} disabled={submitting}>
          초기화
        </button>
      </div>

      {draft.saveError && (
        <p className={styles.error} role="alert">
          {draft.saveError}
        </p>
      )}

      {conflict && (
        <div className={styles.banner} role="alert">
          <p>GitHub의 파일이 이 초안을 만들 때와 달라. 그대로 제출하면 그 내용이 덮어써져.</p>
          <div className={styles.row}>
            <button type="button" className={styles.btn} onClick={() => takeVersion(conflict.text)} disabled={submitting}>
              저장소 버전으로 바꾸기
            </button>
            <button
              type="button"
              className={styles.btn}
              disabled={submitting}
              onClick={() => {
                if (window.confirm("저장소 파일을 내 초안으로 덮어쓸까?")) void submit(true);
              }}
            >
              그래도 덮어쓰기
            </button>
          </div>
        </div>
      )}

      {notice && (
        <p className={styles.notice} data-tone={notice.tone} role="status">
          {notice.text}
          {notice.link && (
            <>
              {" "}
              <a href={notice.link.href} target="_blank" rel="noreferrer">
                {notice.link.label}
              </a>
            </>
          )}
        </p>
      )}

      <PlaygroundResults outcome={outcome} cases={cases} running={running} />

      <TokenSettings open={settingsOpen} onToggle={setSettingsOpen} onChange={(has) => has && setNotice(null)} />
    </section>
  );
}
