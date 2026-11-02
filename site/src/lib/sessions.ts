/**
 * 세션·기기 관련 순수 로직. 저장은 storage.ts, 화면은 컴포넌트가 맡는다.
 * 규칙 근거: LESSON_TEMPLATE §2 (다음 세션 = 현재 기기에 맞는 첫 미완료 세션)
 */
import type { LessonState, Progress } from "./storage";

export type Device = "phone" | "pad" | "pc";

export const DEVICE_LABEL: Record<Device, string> = { phone: "폰", pad: "패드", pc: "PC" };

export interface SessionMeta {
  id: string;
  device: Device;
  title: string;
}

/** 대시보드·세션 계산에 필요한 레슨 요약 (frontmatter에서 만든다) */
export interface LessonMeta {
  key: string; // "w01", 파트가 있으면 "w07a"
  week: number;
  /** 한 주차를 여러 페이지로 나눈 파트 (LESSON_TEMPLATE §1). 없으면 그 주차 페이지는 하나 */
  part?: Part;
  title: string;
  href: string;
  units: number;
  sessions: SessionMeta[];
}

export interface SessionPick {
  lesson: LessonMeta;
  session: SessionMeta;
}

export interface NextSessions {
  /** 기기 상관없이 순서상 다음 세션 */
  overall?: SessionPick;
  /** 지금 기기로 할 수 있는 다음 세션 */
  forDevice?: SessionPick;
}

export type Part = "a" | "b" | "c" | "d";

/** 진도 저장 키이자 화면 표기: w07, 파트가 있으면 w07a (파트끼리 진도가 섞이지 않게) */
export function lessonKey(week: number, part?: Part): string {
  return `w${String(week).padStart(2, "0")}${part ?? ""}`;
}

/** 레슨 순서: 주차, 같은 주차면 파트 (파트 없는 쪽이 먼저) */
export function compareLessons(a: { week: number; part?: Part }, b: { week: number; part?: Part }): number {
  return a.week - b.week || (a.part ?? "").localeCompare(b.part ?? "");
}

function pendingSessions(lesson: LessonMeta, state: LessonState | undefined): SessionMeta[] {
  if (state?.status === "done") return [];
  const checked = new Set(state?.checked ?? []);
  return lesson.sessions.filter((s) => !checked.has(s.id));
}

export function nextSessions(lessons: readonly LessonMeta[], progress: Progress, device: Device): NextSessions {
  const ordered = [...lessons].sort(compareLessons);
  let overall: SessionPick | undefined;

  for (const lesson of ordered) {
    const pending = pendingSessions(lesson, progress.lessons[lesson.key]);
    if (!overall && pending[0]) overall = { lesson, session: pending[0] };
    const match = pending.find((s) => s.device === device);
    if (match) return { overall, forDevice: { lesson, session: match } };
  }
  return { overall };
}

/** 세션 체크/해제를 반영한 새 LessonState. 전부 체크되면 done. */
export function applySessionToggle(
  state: LessonState | undefined,
  sessionId: string,
  checked: boolean,
  allSessionIds: readonly string[],
): LessonState {
  const prev = state?.checked ?? [];
  const next = checked
    ? prev.includes(sessionId)
      ? prev
      : [...prev, sessionId]
    : prev.filter((id) => id !== sessionId);
  const allDone = allSessionIds.length > 0 && allSessionIds.every((id) => next.includes(id));
  return { ...state, status: allDone ? "done" : "in-progress", checked: next };
}

/**
 * 기기 추정. iPadOS는 데스크톱 UA(Macintosh)를 보내므로 터치 지점 수로 구분한다.
 * 틀릴 수 있으니 대시보드에서 기기를 직접 바꿀 수 있게 한다.
 */
export function detectDevice(userAgent: string, maxTouchPoints: number): Device {
  if (/iPhone|iPod|Android.+Mobile/i.test(userAgent)) return "phone";
  if (/iPad|Android/i.test(userAgent)) return "pad";
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "pad";
  return "pc";
}
