/**
 * 제출용 GitHub 토큰 설정. 저장은 storage.ts의 TokenStore만 거친다.
 * 토큰 값은 화면에 다시 보여주지 않고 끝 4자리만 보인다.
 */
import { useState } from "react";
import { getTokenStore } from "../../lib/storage";
import styles from "./CodePlayground.module.css";

const NEW_TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";

interface TokenSettingsProps {
  open: boolean;
  onToggle(open: boolean): void;
  onChange(hasToken: boolean): void;
}

export default function TokenSettings({ open, onToggle, onChange }: TokenSettingsProps) {
  const store = getTokenStore();
  const [saved, setSaved] = useState(() => store.get());
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function save() {
    try {
      store.set(input);
      setSaved(store.get());
      setInput("");
      setError(null);
      onChange(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어");
    }
  }

  function clear() {
    store.clear();
    setSaved(null);
    onChange(false);
  }

  return (
    <details className={styles.settings} open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
      <summary>제출 설정 · {saved ? `토큰 저장됨 (…${saved.slice(-4)})` : "토큰 없음"}</summary>
      <div className={styles.settingsBody}>
        <ol className={styles.steps}>
          <li>
            <a href={NEW_TOKEN_URL} target="_blank" rel="noreferrer">
              GitHub 새 토큰 만들기
            </a>{" "}
            (Fine-grained)
          </li>
          <li>Expiration 90 days · Repository access: Only select → slam_guide</li>
          <li>Permissions → Contents: Read and write (나머지는 그대로)</li>
          <li>만든 토큰을 아래에 붙여넣기. 이 기기 브라우저에만 저장돼</li>
        </ol>
        <div className={styles.tokenRow}>
          <input
            className={styles.tokenInput}
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="github_pat_…"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="GitHub 토큰"
          />
          <button type="button" className={styles.btn} onClick={save} disabled={!input.trim()}>
            저장
          </button>
        </div>
        {saved && (
          <button type="button" className={styles.linkBtn} onClick={clear}>
            저장된 토큰 지우기
          </button>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
