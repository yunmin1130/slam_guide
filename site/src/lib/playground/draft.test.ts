import { describe, expect, it } from "vitest";
import { contentHash, draftState, settleDraft } from "./draft";

const d = (baseHash: string, pending = false) => ({ code: "x", baseHash, pending, pendingSince: pending ? new Date().toISOString() : undefined, updatedAt: "" });

describe("contentHash", () => {
  it("CRLF와 LF는 같은 해시, 내용이 다르면 다른 해시", () => {
    expect(contentHash("a\r\nb\n")).toBe(contentHash("a\nb\n"));
    expect(contentHash("a\nb\n")).not.toBe(contentHash("a\nc\n"));
    expect(contentHash("")).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("draftState", () => {
  it("초안 없음이면 fresh", () => expect(draftState(null, "b")).toEqual({ kind: "fresh" }));
  it("기준이 배포 파일과 같으면 synced", () => expect(draftState(d("b"), "b")).toEqual({ kind: "synced" }));
  it("제출 후 배포 전이면 pending-deploy", () => expect(draftState(d("new", true), "old")).toEqual({ kind: "pending-deploy" }));
  it("제출 후 30분이 지나도 배포가 안 따라오면 repo-changed", () => {
    // 편집 시각(updatedAt)이 최근이어도 제출 시각(pendingSince) 기준으로 판단한다
    const old = { ...d("new", true), pendingSince: "2026-11-02T00:00:00.000Z", updatedAt: "2026-11-02T00:29:00.000Z" };
    expect(draftState(old, "old", Date.parse("2026-11-02T00:10:00.000Z")).kind).toBe("pending-deploy");
    expect(draftState(old, "old", Date.parse("2026-11-02T00:31:00.000Z")).kind).toBe("repo-changed");
  });
  it("제출 시각이 없거나 깨졌으면 기다리지 않고 repo-changed", () => {
    expect(draftState({ ...d("new", true), pendingSince: undefined }, "old").kind).toBe("repo-changed");
    expect(draftState({ ...d("new", true), pendingSince: "garbage" }, "old").kind).toBe("repo-changed");
  });
  it("제출 안 했는데 배포 파일이 바뀌었으면 repo-changed", () => expect(draftState(d("old"), "new")).toEqual({ kind: "repo-changed" }));
});

describe("isCiStub", () => {
  it("CI 스텁 표식으로 시작하는 파일만 스텁으로 본다", async () => {
    const { isCiStub } = await import("./draft");
    expect(isCiStub("// CI 전용 자동 생성 스텁: core/mine/w01.ts 에 구문·import 오류가 있어 대체됨\n")).toBe(true);
    expect(isCiStub("/** 1주차 */\n")).toBe(false);
  });
  it("표식이 scripts/check-mine-syntax.mjs의 스텁 첫 줄과 같다", async () => {
    const { readFileSync } = await import("node:fs");
    const { CI_STUB_MARKER } = await import("./draft");
    const script = readFileSync(new URL("../../../../scripts/check-mine-syntax.mjs", import.meta.url), "utf8");
    expect(script).toContain("`" + CI_STUB_MARKER);
  });
});

describe("settleDraft", () => {
  it("배포가 따라잡으면 pending을 내린다", () => {
    expect(settleDraft(d("b", true), "b").pending).toBe(false);
    expect(settleDraft(d("b", true), "old").pending).toBe(true);
  });
});

describe("normalizeQuotes", () => {
  it("둥근 따옴표를 곧은 따옴표로 바꾸고 바꿨는지 알려준다", async () => {
    const { normalizeQuotes } = await import("./quotes");
    expect(normalizeQuotes("“a” ‘b’")).toEqual({ code: "\"a\" 'b'", replaced: true });
    expect(normalizeQuotes("\"a\"").replaced).toBe(false);
  });
});
