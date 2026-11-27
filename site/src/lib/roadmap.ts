/**
 * 대시보드 로드맵: 만든 레슨 + 아직 안 만든 레슨(준비 중) + 선택 레슨.
 * 순서와 번호는 docs/CURRICULUM.md의 표를 따른다.
 */
import { compareLessons, lessonKey, type LessonMeta, type Part } from "./sessions";

/** 커리큘럼에는 있지만 아직 페이지가 없는 레슨 */
export interface PlannedLesson {
  week: number;
  part?: Part;
  title: string;
  units: number;
  /** 레슨 = 손 유도·구현까지 하는 정식 레슨, 노트 = 도구 실습 기록 수준 */
  form: "레슨" | "노트";
}

/** 레슨을 만들면 여기서 지운다 (같은 키가 둘이면 buildRoadmap이 빌드를 멈춘다) */
export const PLANNED: readonly PlannedLesson[] = [
  { week: 0, title: "도구 먼저: 폰 사진 → COLMAP → 3DGS 학습", units: 2, form: "노트" },
  { week: 4, part: "b", title: "3DGS 원리: 가우시안, 화면 투영, 알파 합성", units: 2, form: "레슨" },
  { week: 9, title: "COLMAP 구조 파악", units: 1, form: "노트" },
  { week: 12, title: "3DGS 학습 실험: 옵션별 품질 비교", units: 1, form: "노트" },
  { week: 13, title: "코드 리딩과 작은 수정 (3DGRT 또는 gsplat)", units: 3, form: "노트" },
  { week: 14, title: "캡스톤: 미니 센서 시뮬레이터", units: 6, form: "레슨" },
];

export type RoadmapRow =
  | { kind: "lesson"; key: string; lesson: LessonMeta }
  | { kind: "planned"; key: string; planned: PlannedLesson };

export interface Roadmap {
  /** 핵심 경로: 만든 레슨과 준비 중 레슨을 번호 순서로 */
  core: RoadmapRow[];
  /** 선택 레슨 (이직 뒤나 여유가 생기면) */
  optional: LessonMeta[];
}

export function buildRoadmap(lessons: readonly LessonMeta[], planned: readonly PlannedLesson[]): Roadmap {
  const built = new Set(lessons.map((l) => l.key));
  const clash = planned.map((p) => lessonKey(p.week, p.part)).find((key) => built.has(key));
  if (clash) throw new Error(`${clash}: 이미 만든 레슨이 준비 중 목록(roadmap.ts PLANNED)에 남아 있다`);

  const lessonRow = (lesson: LessonMeta): RoadmapRow => ({ kind: "lesson", key: lesson.key, lesson });
  const plannedRow = (p: PlannedLesson): RoadmapRow => ({ kind: "planned", key: lessonKey(p.week, p.part), planned: p });
  const rows = [
    ...lessons.filter((l) => l.track === "core").map((l) => ({ week: l.week, part: l.part, row: lessonRow(l) })),
    ...planned.map((p) => ({ week: p.week, part: p.part, row: plannedRow(p) })),
  ];
  return {
    core: rows.sort(compareLessons).map((r) => r.row),
    optional: lessons.filter((l) => l.track === "optional").sort(compareLessons),
  };
}
