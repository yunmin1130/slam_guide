import { describe, expect, it } from "vitest";
import { decodeBase64, encodeBase64, getFile, GitHubError, putFile } from "./github";

type Call = { url: string; init: RequestInit };

function fakeFetch(status: number, body: unknown, calls: Call[] = []) {
  return async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  };
}

describe("base64", () => {
  it("한글과 줄바꿈이 섞인 코드를 왕복해도 같다", () => {
    const code = "// 반대칭 행렬\nexport const a = 1;\n";
    expect(decodeBase64(encodeBase64(code))).toBe(code);
  });
  it("GitHub가 넣는 줄바꿈이 섞인 base64도 읽는다", () => {
    const text = "hello world, hello world, hello world";
    const b64 = encodeBase64(text);
    expect(decodeBase64(`${b64.slice(0, 10)}\n${b64.slice(10)}`)).toBe(text);
  });
});

describe("getFile", () => {
  it("main 브랜치 파일의 sha와 내용을 돌려주고 토큰을 헤더에 넣는다", async () => {
    const calls: Call[] = [];
    const f = await getFile("core/mine/w01.ts", "github_pat_x", fakeFetch(200, { sha: "abc", content: encodeBase64("x") }, calls));
    expect(f).toEqual({ sha: "abc", text: "x" });
    expect(calls[0].url).toBe("https://api.github.com/repos/yunmin1130/slam_guide/contents/core/mine/w01.ts?ref=main");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer github_pat_x");
  });

  it.each([
    [401, /토큰이 틀렸거나/],
    [403, /권한/],
    [404, /못 찾았어/],
    [500, /500/],
  ])("HTTP %i는 이해할 수 있는 메시지로 바꾼다", async (status, msg) => {
    await expect(getFile("p", "t", fakeFetch(status, {}))).rejects.toThrow(msg);
  });

  it("네트워크 오류는 GitHubError(0)", async () => {
    const err = await getFile("p", "t", async () => {
      throw new TypeError("Failed to fetch");
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect((err as GitHubError).status).toBe(0);
  });
});

describe("putFile", () => {
  it("sha, branch, base64 내용을 담아 PUT하고 커밋 URL을 돌려준다", async () => {
    const calls: Call[] = [];
    const url = await putFile(
      { path: "core/mine/w01.ts", text: "코드", sha: "abc", message: "feat: w01", token: "t" },
      fakeFetch(200, { commit: { html_url: "https://github.com/c/1" } }, calls),
    );
    expect(url).toBe("https://github.com/c/1");
    expect(calls[0].init.method).toBe("PUT");
    const body = JSON.parse(String(calls[0].init.body)) as Record<string, string>;
    expect(body).toMatchObject({ sha: "abc", branch: "main", message: "feat: w01" });
    expect(decodeBase64(body.content)).toBe("코드");
  });

  it("422는 거절 이유를 안내한다", async () => {
    await expect(putFile({ path: "p", text: "", sha: "s", message: "m", token: "t" }, fakeFetch(422, {}))).rejects.toThrow(/거절/);
  });

  it("409(그 사이 바뀜)는 충돌 메시지", async () => {
    await expect(putFile({ path: "p", text: "", sha: "s", message: "m", token: "t" }, fakeFetch(409, {}))).rejects.toThrow(/바뀌었어/);
  });
});
