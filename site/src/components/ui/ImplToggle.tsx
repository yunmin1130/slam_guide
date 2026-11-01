/**
 * 데모 상단의 mine/reference 토글 + "아직 내 구현 아님" 배지 (ARCHITECTURE §5).
 * 기본값은 데모가 쓰는 함수가 전부 mine 테스트를 통과했을 때만 mine.
 * 상태(statuses)는 빌드 시점에 lib/impl.ts의 fnStatus로 구해 props로 넘긴다.
 *
 * 사용 (데모 안):
 *   const [kind, setKind] = useState(defaultKind(statuses));
 *   <ImplToggle statuses={statuses} value={kind} onChange={setKind} />
 *   const f = await loadFn(week, "skew", kind);
 */
import { defaultImpl, STATUS_LABEL, type FnStatus, type ImplKind } from "../../lib/impl";
import styles from "./ImplToggle.module.css";

export interface FnStatusEntry {
  fn: string;
  status: FnStatus;
}

interface ImplToggleProps {
  statuses: FnStatusEntry[];
  value: ImplKind;
  onChange: (kind: ImplKind) => void;
}

/** 데모 전체의 기본 구현: 하나라도 통과 못 했으면 reference */
export function defaultKind(statuses: readonly FnStatusEntry[]): ImplKind {
  return statuses.length > 0 && statuses.every((s) => defaultImpl(s.status) === "mine") ? "mine" : "reference";
}

const OPTIONS: Array<{ kind: ImplKind; label: string }> = [
  { kind: "mine", label: "내 구현" },
  { kind: "reference", label: "정답" },
];

export default function ImplToggle({ statuses, value, onChange }: ImplToggleProps) {
  const notMine = statuses.filter((s) => s.status !== "pass");

  return (
    <div className={styles.wrap}>
      <div className={styles.segment} role="group" aria-label="데모에 쓸 구현">
        {OPTIONS.map((o) => (
          <button
            key={o.kind}
            type="button"
            aria-pressed={value === o.kind}
            className={styles.option}
            data-kind={o.kind}
            onClick={() => onChange(o.kind)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {notMine.length > 0 && (
        <span className={styles.badge} title={notMine.map((s) => `${s.fn}: ${STATUS_LABEL[s.status]}`).join("\n")}>
          아직 내 구현 아님 · {notMine.map((s) => s.fn).join(", ")}
        </span>
      )}
    </div>
  );
}
