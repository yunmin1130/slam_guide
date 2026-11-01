/** 레슨 컬렉션 → 페이지·대시보드용 요약 (빌드 시점 전용) */
import { getCollection, type CollectionEntry } from "astro:content";
import { lessonKey, type LessonMeta } from "./sessions";

export type LessonEntry = CollectionEntry<"lessons">;

export function lessonHref(entry: LessonEntry): string {
  return `${import.meta.env.BASE_URL}lessons/${entry.id}/`;
}

export function toLessonMeta(entry: LessonEntry): LessonMeta {
  const d = entry.data;
  return {
    key: lessonKey(d.week),
    week: d.week,
    title: d.title,
    href: lessonHref(entry),
    units: d.units,
    sessions: d.sessions,
  };
}

/** 주차 순으로 정렬한 레슨 목록. 같은 주차 파일이 둘이면 빌드를 멈춘다 (진도 키 충돌 방지). */
export async function getLessons(): Promise<LessonEntry[]> {
  const entries = (await getCollection("lessons")).sort((a, b) => a.data.week - b.data.week);
  const seen = new Map<number, string>();
  for (const e of entries) {
    const other = seen.get(e.data.week);
    if (other) throw new Error(`week ${e.data.week} 레슨이 두 개다: ${other}, ${e.id}`);
    seen.set(e.data.week, e.id);
  }
  return entries;
}
