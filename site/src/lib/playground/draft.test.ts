import { describe, expect, it } from "vitest";
import { contentHash, draftState, settleDraft } from "./draft";

const d = (baseHash: string, pending = false) => ({ code: "x", baseHash, pending, updatedAt: "" });

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
    const old = { ...d("new", true), updatedAt: "2026-11-02T00:00:00.000Z" };
    expect(draftState(old, "old", Date.parse("2026-11-02T00:10:00.000Z")).kind).toBe("pending-deploy");
    expect(draftState(old, "old", Date.parse("2026-11-02T00:31:00.000Z")).kind).toBe("repo-changed");
  });
  it("제출 안 했는데 배포 파일이 바뀌었으면 repo-changed", () => expect(draftState(d("old"), "new")).toEqual({ kind: "repo-changed" }));
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
