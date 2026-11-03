/**
 * 세션 완료 체크 버튼 (island). 저장은 storage.ts만 거친다.
 * 완료로 표시하면 걸린 시간(분)을 고를 수 있다 (선택, 일정 재추정용).
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { SESSION_MINUTES, updateLesson, withSessionMinutes } from "../../lib/storage";
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

/** "기록했다" 표시를 보여 주는 시간 */
const SAVED_FLASH_MS = 2000;
const SAVE_FAILED = "저장하지 못했어. 다시 눌러줘";

export default function SessionCheck({ lessonKey, sessionId, allSessionIds, title, deviceLabel, position }: SessionCheckProps) {
  const { progress, error: loadError } = useProgress();
  // null = 아직 저장소를 읽지 않음 (서버 렌더링·하이드레이션 직후)
  const checked = progress ? (progress.lessons[lessonKey]?.checked.includes(sessionId) ?? false) : null;
  const [saveError, setError] = useState<string | null>(null);
  const error = saveError ?? (loadError ? "진도를 읽지 못했어" : null);
  const savedMinutes = progress?.lessons[lessonKey]?.sessionMinutes?.[sessionId] ?? null;
  const [minutesInput, setMinutesInput] = useState("");
  // 숫자가 아닌 글자를 넣으면 value는 ""라서 "바뀐 값 없음"으로 보인다 → 따로 기억해 버튼을 살려 둔다
  const [badInput, setBadInput] = useState(false);
  const [minutesError, setMinutesError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setMinutesInput(savedMinutes === null ? "" : String(savedMinutes)), [savedMinutes]);
  useEffect(() => {
    if (savedFlash === null) return;
    const t = setTimeout(() => setSavedFlash(null), SAVED_FLASH_MS);
    return () => clearTimeout(t);
  }, [savedFlash]);

  async function writeMinutes(minutes: number | null, done: string) {
    setMinutesError(null);
    setSavedFlash(null);
    try {
      await updateLesson(lessonKey, (s) => withSessionMinutes(s, sessionId, minutes));
      setSavedFlash(done);
    } catch (err: unknown) {
      setMinutesError(err instanceof Error ? err.message : SAVE_FAILED);
    }
  }

  async function saveMinutes(e: FormEvent) {
    e.preventDefault();
    const text = minutesInput.trim();
    // 숫자가 아닌 글자는 브라우저가 빈 값으로 넘긴다 → 지우기로 착각하지 않게 막는다
    if (inputRef.current?.validity.badInput || text === "") {
      setSavedFlash(null);
      setMinutesError("분을 숫자로 넣어줘");
      return;
    }
    await writeMinutes(Number(text), "기록했다");
  }

  async function clearMinutes() {
    await writeMinutes(null, "지웠다");
  }

  async function toggle() {
    if (checked === null) return;
    setError(null);
    try {
      await updateLesson(lessonKey, (s) => applySessionToggle(s, sessionId, !checked, allSessionIds));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : SAVE_FAILED);
    }
  }

  return (
    <div className={styles.wrap}>
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
      {checked && (
        <form className={styles.minutes} onSubmit={saveMinutes} noValidate>
          <label className={styles.minutesLabel} htmlFor={`min-${lessonKey}-${sessionId}`}>
            걸린 시간 (선택)
          </label>
          <input
            ref={inputRef}
            id={`min-${lessonKey}-${sessionId}`}
            className={styles.minutesInput}
            type="number"
            inputMode="numeric"
            min={SESSION_MINUTES.min}
            max={SESSION_MINUTES.max}
            step={SESSION_MINUTES.step}
            placeholder="30"
            value={minutesInput}
            aria-invalid={minutesError !== null}
            aria-describedby={`min-msg-${lessonKey}-${sessionId}`}
            onChange={(e) => {
              setMinutesInput(e.currentTarget.value);
              setBadInput(e.currentTarget.validity.badInput);
              setMinutesError(null);
            }}
          />
          <span className={styles.unit}>분</span>
          <button type="submit" className={styles.smallButton} disabled={!badInput && minutesInput.trim() === (savedMinutes === null ? "" : String(savedMinutes))}>
            {savedMinutes === null ? "기록" : "고치기"}
          </button>
          {savedMinutes !== null && (
            <button type="button" className={styles.smallButton} onClick={clearMinutes}>
              지우기
            </button>
          )}
          <span id={`min-msg-${lessonKey}-${sessionId}`} className={styles.minutesMsg} aria-live="polite">
            {minutesError ? (
              <span className={styles.error} role="alert">
                {minutesError}
              </span>
            ) : (
              savedFlash && <span className={styles.saved}>{savedFlash}</span>
            )}
          </span>
        </form>
      )}
    </div>
  );
}
