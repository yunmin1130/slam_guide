import { describe, expect, it } from "vitest";
import { STALE_CHUNK_MESSAGE, friendlyLoadError, isStaleChunkError } from "./staleChunk";

describe("isStaleChunkError", () => {
  it("브라우저별 동적 import 실패 메시지를 알아본다", () => {
    // Chrome / Safari / Firefox
    expect(isStaleChunkError(new TypeError("Failed to fetch dynamically imported module: https://x/_astro/w01.DJ5Ng1S7.js"))).toBe(true);
    expect(isStaleChunkError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isStaleChunkError(new TypeError("error loading dynamically imported module: https://x/a.js"))).toBe(true);
    expect(isStaleChunkError("Failed to fetch dynamically imported module: y")).toBe(true);
    expect(isStaleChunkError({ message: "Importing a module script failed." })).toBe(true);
  });
  it("다른 오류는 그대로 둔다", () => {
    expect(isStaleChunkError(new Error("TODO"))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
  });
});

describe("friendlyLoadError", () => {
  it("배포로 파일이 바뀐 경우 새로고침 안내로 바꾼다", () => {
    expect(friendlyLoadError(new TypeError("Importing a module script failed."))).toBe(STALE_CHUNK_MESSAGE);
  });
  it("그 밖의 오류는 메시지를 그대로 쓴다", () => {
    expect(friendlyLoadError(new Error("w01에 skew 함수가 없다"))).toBe("w01에 skew 함수가 없다");
    expect(friendlyLoadError("문자열")).toBe("문자열");
  });
});
