/** 레슨 컬렉션 → 페이지·대시보드용 요약 (빌드 시점 전용) */
import { getCollection, type CollectionEntry } from "astro:content";
import { compareLessons, lessonKey, type LessonMeta } from "./sessions";

export type LessonEntry = CollectionEntry<"lessons">;

export function lessonHref(entry: LessonEntry): string {
  return `${import.meta.env.BASE_URL}lessons/${entry.id}/`;
}

export function toLessonMeta(entry: LessonEntry): LessonMeta {
  const d = entry.data;
  return {
    key: lessonKey(d.week, d.part),
    week: d.week,
    ...(d.part ? { part: d.part } : {}),
    title: d.title,
    href: lessonHref(entry),
    units: d.units,
    sessions: d.sessions,
  };
}

/**
 * 주차·파트 순으로 정렬한 레슨 목록. 진도 키(w07, w07a)가 같은 파일이 둘이면 빌드를 멈춘다.
 * 한 주차에 파트 있는 페이지와 없는 페이지가 섞여도 멈춘다 (w07과 w07a가 같이 있으면 어느 쪽이 그 주차인지 모호).
 */
export async function getLessons(): Promise<LessonEntry[]> {
  const entries = (await getCollection("lessons")).sort((a, b) => compareLessons(a.data, b.data));
  const seen = new Map<string, string>();
  const partStyle = new Map<number, boolean>();
  for (const e of entries) {
    const key = lessonKey(e.data.week, e.data.part);
    if (!e.id.startsWith(`${key}-`)) throw new Error(`${e.id}: 파일 이름이 frontmatter(week, part)의 ${key}로 시작하지 않는다`);
    const other = seen.get(key);
    if (other) throw new Error(`${key} 레슨이 두 개다: ${other}, ${e.id}`);
    seen.set(key, e.id);
    const hasPart = e.data.part !== undefined;
    if (partStyle.has(e.data.week) && partStyle.get(e.data.week) !== hasPart) {
      throw new Error(`week ${e.data.week}: 파트 있는 레슨과 없는 레슨이 섞였다 (${e.id})`);
    }
    partStyle.set(e.data.week, hasPart);
  }
  return entries;
}
