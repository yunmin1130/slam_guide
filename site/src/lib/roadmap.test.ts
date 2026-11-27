import { describe, expect, it } from "vitest";
import { buildRoadmap, PLANNED, type PlannedLesson } from "./roadmap";
import type { LessonMeta } from "./sessions";

function lesson(week: number, part?: "a" | "b", track: "core" | "optional" = "core"): LessonMeta {
  const key = `w${String(week).padStart(2, "0")}${part ?? ""}`;
  return {
    key,
    week,
    ...(part ? { part } : {}),
    track,
    title: key,
    href: `/${key}`,
    units: 1,
    sessions: [{ id: "s1", device: "phone", title: "개념" }],
  };
}

const planned: PlannedLesson[] = [
  { week: 0, title: "도구 먼저", units: 2, form: "노트" },
  { week: 4, part: "b", title: "3DGS 원리", units: 2, form: "레슨" },
];

describe("buildRoadmap", () => {
  it("기본: 준비 중 레슨을 번호 순서대로 핵심 레슨 사이에 끼운다", () => {
    const { core } = buildRoadmap([lesson(5), lesson(4, "a"), lesson(1)], planned);
    expect(core.map((r) => r.key)).toEqual(["w00", "w01", "w04a", "w04b", "w05"]);
    expect(core.map((r) => r.kind)).toEqual(["planned", "lesson", "lesson", "planned", "lesson"]);
  });

  it("기본: 선택 레슨은 핵심 목록에서 빠지고 따로 번호 순서로 모인다", () => {
    const { core, optional } = buildRoadmap([lesson(23, undefined, "optional"), lesson(1), lesson(21, undefined, "optional")], []);
    expect(core.map((r) => r.key)).toEqual(["w01"]);
    expect(optional.map((l) => l.key)).toEqual(["w21", "w23"]);
  });

  it("경계: 준비 중 목록과 같은 키의 레슨이 이미 있으면 멈춘다 (만든 뒤 목록에서 지우는 것을 잊지 않게)", () => {
    expect(() => buildRoadmap([lesson(4, "b")], planned)).toThrow("w04b");
  });

  it("경계: 같은 주차의 파트는 a, b 순서로 놓인다 (만든 4a 뒤에 준비 중 4b)", () => {
    const { core } = buildRoadmap([lesson(4, "a"), lesson(3)], [{ week: 4, part: "b", title: "3DGS 원리", units: 2, form: "레슨" }]);
    expect(core.map((r) => r.key)).toEqual(["w03", "w04a", "w04b"]);
  });

  it("경계: 준비 중 목록이 비면 레슨만 나온다", () => {
    expect(buildRoadmap([lesson(2), lesson(1)], []).core.map((r) => r.key)).toEqual(["w01", "w02"]);
  });

  it("수치: 실제 준비 중 목록은 키가 겹치지 않고 단위가 모두 양수다", () => {
    const keys = buildRoadmap([], PLANNED).core.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    PLANNED.forEach((p) => expect(p.units).toBeGreaterThan(0));
  });
});
