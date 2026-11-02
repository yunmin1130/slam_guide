import { describe, expect, it, vi } from "vitest";
import { contentHash } from "./draft";
import { submitDraft, type SubmitDeps } from "./submit";

const base = { path: "core/mine/w01.ts", week: "w01", token: "t" };

function deps(remoteText: string): SubmitDeps & { putFile: ReturnType<typeof vi.fn> } {
  return {
    getFile: async () => ({ sha: "sha1", text: remoteText }),
    putFile: vi.fn(async () => "https://github.com/c/1"),
  };
}

describe("submitDraft", () => {
  it("원격이 초안의 기준과 같으면 커밋하고 새 기준 해시를 돌려준다", async () => {
    const d = deps("old");
    const out = await submitDraft({ ...base, code: "new", baseHash: contentHash("old") }, d);
    expect(out).toEqual({ kind: "committed", commitUrl: "https://github.com/c/1", baseHash: contentHash("new") });
    expect(d.putFile).toHaveBeenCalledWith(expect.objectContaining({ sha: "sha1", text: "new", message: "feat: w01 손코딩 제출 (사이트)" }));
  });

  it("원격이 기준과 다르면 커밋하지 않고 conflict (PC에서 push한 코드 보호)", async () => {
    const d = deps("pc version");
    const out = await submitDraft({ ...base, code: "new", baseHash: contentHash("old") }, d);
    expect(out.kind).toBe("conflict");
    expect(d.putFile).not.toHaveBeenCalled();
  });

  it("force면 충돌이어도 덮어쓴다", async () => {
    const d = deps("pc version");
    const out = await submitDraft({ ...base, code: "new", baseHash: contentHash("old"), force: true }, d);
    expect(out.kind).toBe("committed");
  });

  it("원격과 내용이 같으면 커밋하지 않는다 (줄바꿈 차이 무시)", async () => {
    const d = deps("same\r\n");
    const out = await submitDraft({ ...base, code: "same\n", baseHash: "whatever" }, d);
    expect(out.kind).toBe("unchanged");
    expect(d.putFile).not.toHaveBeenCalled();
  });

  it("CRLF 초안은 LF로 바꿔 커밋한다", async () => {
    const d = deps("old");
    await submitDraft({ ...base, code: "a\r\nb", baseHash: contentHash("old") }, d);
    expect(d.putFile).toHaveBeenCalledWith(expect.objectContaining({ text: "a\nb" }));
  });
});
