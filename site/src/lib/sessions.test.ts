import { describe, expect, it } from "vitest";
import {
  applySessionToggle,
  compareLessons,
  detectDevice,
  lessonKey,
  nextSessions,
  type LessonMeta,
} from "./sessions";
import type { Progress } from "./storage";

const lessons: LessonMeta[] = [
  {
    key: "w02",
    week: 2,
    title: "선형대수 ②",
    href: "/w02",
    units: 2,
    sessions: [
      { id: "s1", device: "phone", title: "개념" },
      { id: "s2", device: "pc", title: "과제" },
    ],
  },
  {
    key: "w01",
    week: 1,
    title: "선형대수 ①",
    href: "/w01",
    units: 1,
    sessions: [
      { id: "s1", device: "phone", title: "개념" },
      { id: "s2", device: "pc", title: "과제: skew" },
      { id: "s3", device: "phone", title: "체크 질문" },
    ],
  },
];

const empty: Progress = { lessons: {} };

describe("lessonKey", () => {
  it("주차를 두 자리로 맞춘다", () => {
    expect(lessonKey(1)).toBe("w01");
    expect(lessonKey(12)).toBe("w12");
  });

  it("파트가 있으면 뒤에 붙는다 (파트끼리 진도 키가 다르다)", () => {
    expect(lessonKey(7, "a")).toBe("w07a");
    expect(lessonKey(7, "b")).toBe("w07b");
  });
});

describe("compareLessons", () => {
  it("주차 순, 같은 주차면 파트 순", () => {
    const list = [
      { week: 8, part: "a" as const },
      { week: 7, part: "b" as const },
      { week: 6 },
      { week: 7, part: "a" as const },
    ];
    expect([...list].sort(compareLessons).map((l) => lessonKey(l.week, "part" in l ? l.part : undefined))).toEqual(["w06", "w07a", "w07b", "w08a"]);
  });
});

describe("nextSessions", () => {
  it("진도가 없으면 가장 앞 주차의 첫 세션", () => {
    const r = nextSessions(lessons, empty, "phone");
    expect(r.overall?.lesson.key).toBe("w01");
    expect(r.overall?.session.id).toBe("s1");
    expect(r.forDevice?.session.id).toBe("s1");
  });

  it("다음 할 일이 PC 세션이면 폰에는 다음 폰 세션을 제시한다", () => {
    const p: Progress = { lessons: { w01: { status: "in-progress", checked: ["s1"] } } };
    const r = nextSessions(lessons, p, "phone");
    expect(r.overall?.session.id).toBe("s2");
    expect(r.forDevice?.lesson.key).toBe("w01");
    expect(r.forDevice?.session.id).toBe("s3");
  });

  it("현재 레슨에 그 기기 세션이 없으면 다음 레슨으로 넘어간다", () => {
    const p: Progress = { lessons: { w01: { status: "in-progress", checked: ["s1", "s3"] } } };
    const r = nextSessions(lessons, p, "phone");
    expect(r.overall?.session.id).toBe("s2");
    expect(r.forDevice?.lesson.key).toBe("w02");
  });

  it("done 레슨은 체크가 비어 있어도 건너뛴다", () => {
    const p: Progress = { lessons: { w01: { status: "done", checked: [] } } };
    expect(nextSessions(lessons, p, "pc").overall?.lesson.key).toBe("w02");
  });

  it("전부 끝나면 둘 다 없음", () => {
    const p: Progress = {
      lessons: {
        w01: { status: "done", checked: [] },
        w02: { status: "done", checked: [] },
      },
    };
    const r = nextSessions(lessons, p, "pad");
    expect(r.overall).toBeUndefined();
    expect(r.forDevice).toBeUndefined();
  });
});

describe("applySessionToggle", () => {
  const ids = ["s1", "s2"];

  it("체크하면 in-progress, 전부 체크하면 done", () => {
    const a = applySessionToggle(undefined, "s1", true, ids);
    expect(a).toMatchObject({ status: "in-progress", checked: ["s1"] });
    const b = applySessionToggle(a, "s2", true, ids);
    expect(b.status).toBe("done");
  });

  it("해제하면 done에서 in-progress로 돌아가고 원본은 바뀌지 않는다", () => {
    const done = { status: "done" as const, checked: ["s1", "s2"], notes: "메모" };
    const r = applySessionToggle(done, "s2", false, ids);
    expect(r).toEqual({ status: "in-progress", checked: ["s1"], notes: "메모" });
    expect(done.checked).toEqual(["s1", "s2"]);
  });

  it("해제하면 기록도 사라진다", () => {
    const state = { status: "done" as const, checked: ["s1", "s2"], sessionMinutes: { s1: 30, s2: 45 }, minutes: 75 };
    const r = applySessionToggle(state, "s2", false, ids);
    expect(r).toEqual({ status: "in-progress", checked: ["s1"], sessionMinutes: { s1: 30 }, minutes: 30 });
    const r2 = applySessionToggle(r, "s1", false, ids);
    expect(r2).toEqual({ status: "in-progress", checked: [] });
  });

  it("같은 id를 두 번 체크해도 중복되지 않는다", () => {
    const a = applySessionToggle(undefined, "s1", true, ids);
    expect(applySessionToggle(a, "s1", true, ids).checked).toEqual(["s1"]);
  });
});

describe("detectDevice", () => {
  it("iPhone은 phone", () => {
    expect(detectDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5)).toBe("phone");
  });
  it("터치가 있는 Macintosh UA는 iPadOS → pad", () => {
    expect(detectDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe("pad");
  });
  it("Windows 데스크톱은 pc", () => {
    expect(detectDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0)).toBe("pc");
  });
});
