/**
 * 폰용 코드 입력칸: textarea + 기호 버튼 줄.
 * - iOS 자동 수정·대문자·맞춤법 끔, 글자 16px (확대 방지)
 * - Enter는 윗줄 들여쓰기 유지, Tab은 공백 2칸 (패드·PC 키보드)
 * - 기호 버튼은 누를 때 포커스를 뺏지 않아 키보드가 내려가지 않는다
 */
import { useRef, type KeyboardEvent } from "react";
import styles from "./CodePlayground.module.css";

const INDENT = "  ";
const SYMBOLS = ["⇥", "(", ")", "[", "]", "{", "}", ",", ";", "=", "-", "*", "+", "/", ".", "<", ">", "=>", "!", "?", ":"];

interface CodeEditorProps {
  value: string;
  onChange(value: string): void;
  label: string;
  readOnly?: boolean;
}

export default function CodeEditor({ value, onChange, label, readOnly = false }: CodeEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function insert(text: string) {
    const el = ref.current;
    if (!el || readOnly) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const next = value.slice(0, s) + text + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + text.length, s + text.length);
    });
  }

  function onKeyDown(ev: KeyboardEvent<HTMLTextAreaElement>) {
    if (ev.nativeEvent.isComposing) return; // 한글 조합 중에는 건드리지 않는다
    if (ev.key === "Tab" && !ev.shiftKey) {
      ev.preventDefault();
      insert(INDENT);
    } else if (ev.key === "Enter") {
      const el = ev.currentTarget;
      const lineStart = value.lastIndexOf("\n", el.selectionStart - 1) + 1;
      const indent = /^[ \t]*/.exec(value.slice(lineStart, el.selectionStart))?.[0] ?? "";
      const extra = /[{[(]\s*$/.test(value.slice(lineStart, el.selectionStart)) ? INDENT : "";
      if (indent || extra) {
        ev.preventDefault();
        insert(`\n${indent}${extra}`);
      }
    }
  }

  return (
    <div className={styles.editor}>
      <textarea
        ref={ref}
        className={styles.textarea}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        aria-label={label}
        readOnly={readOnly}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        wrap="off"
        rows={16}
      />
      <div className={styles.symbols} role="toolbar" aria-label="기호 입력">
        {SYMBOLS.map((s) => (
          <button
            key={s}
            type="button"
            className={styles.symbol}
            onPointerDown={(e) => e.preventDefault()}
            disabled={readOnly}
            onClick={() => insert(s === "⇥" ? INDENT : s)}
            aria-label={s === "⇥" ? "들여쓰기" : s}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
