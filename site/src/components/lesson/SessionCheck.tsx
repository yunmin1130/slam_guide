/** 세션 완료 체크 버튼 (island). 저장은 storage.ts만 거친다. */
import { useState } from "react";
import { updateLesson } from "../../lib/storage";
import { applySessionToggle } from "../../lib/sessions";
import { useProgress } from "../../lib/useProgress";
import styles from "./SessionCheck.module.css";

interface SessionCheckProps {
  lessonKey: string;
  sessionId: string;
  allSessionIds: string[];
  title: string;
  deviceLabel: string;
  position: string; // "3/12"
}

export default function SessionCheck({ lessonKey, sessionId, allSessionIds, title, deviceLabel, position }: SessionCheckProps) {
  const { progress, error: loadError } = useProgress();
  // null = 아직 저장소를 읽지 않음 (서버 렌더링·하이드레이션 직후)
  const checked = progress ? (progress.lessons[lessonKey]?.checked.includes(sessionId) ?? false) : null;
  const [saveError, setError] = useState<string | null>(null);
  const error = saveError ?? (loadError ? "진도를 읽지 못했어" : null);

  async function toggle() {
    if (checked === null) return;
    setError(null);
    try {
      await updateLesson(lessonKey, (s) => applySessionToggle(s, sessionId, !checked, allSessionIds));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "저장하지 못했어. 다시 눌러줘");
    }
  }

  return (
    <div className={styles.row}>
      <div className={styles.meta}>
        <span className={styles.eyebrow}>
          세션 {position} 끝 · {deviceLabel}
        </span>
        <span className={styles.title}>{title}</span>
        {error && (
          <span className={styles.error} role="alert">
            {error}
          </span>
        )}
      </div>
      <button
        type="button"
        className={styles.button}
        aria-pressed={checked ?? false}
        disabled={checked === null}
        onClick={toggle}
      >
        {checked ? "✓ 완료" : "완료 표시"}
      </button>
    </div>
  );
}
