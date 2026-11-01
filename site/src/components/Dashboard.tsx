/**
 * 대시보드 (island). 맨 위에 "지금 기기로 할 다음 세션" 1개 = 복귀 진입점 (ARCHITECTURE §8).
 * 레슨 메타는 빌드 시점에 props로, 진도는 브라우저에서 storage.ts로 읽는다 (useProgress).
 */
import { useEffect, useState } from "react";
import { useProgress } from "../lib/useProgress";
import {
  DEVICE_LABEL,
  detectDevice,
  nextSessions,
  type Device,
  type LessonMeta,
  type SessionPick,
} from "../lib/sessions";
import styles from "./Dashboard.module.css";

interface DashboardProps {
  lessons: LessonMeta[];
}

const DEVICES: Device[] = ["phone", "pad", "pc"];
const STATUS_TEXT = { todo: "시작 전", "in-progress": "진행 중", done: "완료" } as const;

/** 세션 시작 위치: 첫 세션은 레슨 맨 위, 나머지는 이전 세션의 끝 표시 */
function sessionHref(pick: SessionPick): string {
  const i = pick.lesson.sessions.findIndex((s) => s.id === pick.session.id);
  const prev = pick.lesson.sessions[i - 1];
  return prev ? `${pick.lesson.href}#session-end-${prev.id}` : pick.lesson.href;
}

function formatDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default function Dashboard({ lessons }: DashboardProps) {
  const { progress, error } = useProgress();
  // 서버 렌더링 때는 기기를 모른다 → null이면 자리만 잡아 둔다
  const [device, setDevice] = useState<Device | null>(null);

  useEffect(() => {
    setDevice(detectDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0));
  }, []);

  const ready = progress !== null && device !== null;
  const next = ready ? nextSessions(lessons, progress, device) : null;
  const ordered = [...lessons].sort((a, b) => a.week - b.week);

  return (
    <div className={styles.dash}>
      <section className={styles.next}>
        <div className={styles.nextHead}>
          <span className={styles.eyebrow}>다음 세션</span>
          <div className={styles.devices} role="group" aria-label="지금 쓰는 기기">
            {DEVICES.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={device === d}
                className={styles.chip}
                onClick={() => setDevice(d)}
              >
                {DEVICE_LABEL[d]}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.result} aria-live="polite">
          {error && <p className={styles.placeholder}>진도를 읽지 못했어. 새로고침해줘.</p>}

          {!ready && !error && <p className={styles.placeholder}>진도를 불러오는 중…</p>}

          {ready && next?.forDevice && (
            <a className={styles.nextCard} href={sessionHref(next.forDevice)}>
              <span className={styles.nextLesson}>
                {next.forDevice.lesson.key} · {next.forDevice.lesson.title}
              </span>
              <span className={styles.nextTitle}>{next.forDevice.session.title}</span>
              <span className={styles.nextGo}>이어서 하기 →</span>
            </a>
          )}

          {ready && !next?.forDevice && next?.overall && (
            <p className={styles.placeholder}>이 기기({DEVICE_LABEL[device]})로 할 세션이 남아 있지 않아.</p>
          )}

          {ready && next?.overall && next.overall.session !== next.forDevice?.session && (
            <p className={styles.overall}>
              순서상 다음은 <strong>{DEVICE_LABEL[next.overall.session.device]}</strong> 세션:{" "}
              <a href={sessionHref(next.overall)}>{next.overall.session.title}</a>
            </p>
          )}

          {ready && !next?.overall && <p className={styles.placeholder}>모든 세션을 끝냈어.</p>}
        </div>
      </section>

      <section aria-labelledby="lessons-heading">
        <h2 id="lessons-heading" className={styles.listHeading}>
          레슨
        </h2>
        <ol className={styles.list}>
          {ordered.map((lesson) => {
            const state = progress?.lessons[lesson.key];
            const done =
              state?.status === "done"
                ? lesson.sessions.length
                : (state?.checked.filter((id) => lesson.sessions.some((s) => s.id === id)).length ?? 0);
            const status = state?.status ?? "todo";
            const visited = formatDate(state?.lastVisited);
            return (
              <li key={lesson.key}>
                <a className={styles.row} href={lesson.href}>
                  <span className={styles.week}>{String(lesson.week).padStart(2, "0")}</span>
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>{lesson.title}</span>
                    <span className={styles.rowMeta}>
                      {lesson.units}단위 · 세션 {done}/{lesson.sessions.length}
                      {progress && ` · ${STATUS_TEXT[status]}`}
                      {visited && ` · ${visited}`}
                    </span>
                    <span className={styles.bar} aria-hidden="true">
                      <span style={{ width: `${(done / lesson.sessions.length) * 100}%` }} />
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
