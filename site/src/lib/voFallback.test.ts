import { describe, expect, it, vi } from "vitest";
import { buildVoParts, fallbackNote, isTodoError, withFallback } from "./voFallback";

const todo = () => {
  throw new Error("TODO");
};

describe("isTodoError", () => {
  it("메시지가 정확히 TODO인 Error만 참", () => {
    expect(isTodoError(new Error("TODO"))).toBe(true);
    expect(isTodoError(new Error("TODO: 나중에"))).toBe(false);
    expect(isTodoError("TODO")).toBe(false);
  });
});

describe("withFallback", () => {
  it("mine이 TODO를 던지면 그 호출부터 ref를 쓰고, 이후엔 mine을 다시 부르지 않는다", () => {
    const mine = vi.fn(todo);
    const ref = vi.fn((x: number) => x * 2);
    const onFallback = vi.fn();
    const f = withFallback(mine as unknown as (x: number) => number, ref, onFallback);
    expect(f(2)).toBe(4);
    expect(f(3)).toBe(6);
    expect(mine).toHaveBeenCalledTimes(1);
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it("mine이 짜여 있으면 mine 결과를 쓴다", () => {
    const f = withFallback((x: number) => x + 1, () => -1, () => undefined);
    expect(f(1)).toBe(2);
  });

  it("TODO가 아닌 오류는 그대로 던진다 (내 버그를 정답으로 덮지 않는다)", () => {
    const onFallback = vi.fn();
    const f = withFallback(
      () => {
        throw new Error("index out of range");
      },
      () => 0,
      onFallback,
    );
    expect(() => f()).toThrow("index out of range");
    expect(onFallback).not.toHaveBeenCalled();
  });
});

describe("buildVoParts", () => {
  const ref = { initMap: () => "ref-init", trackPnP: () => "ref-track", localBA: () => "ref-ba" };

  it("TODO인 함수만 reference로 바꾸고, 바꾼 이름을 순서대로 알려준다", () => {
    const mine = { initMap: () => "mine-init", trackPnP: todo, localBA: todo };
    const { parts, fallbacks } = buildVoParts(mine, ref);
    expect(fallbacks()).toEqual([]); // 부르기 전에는 모른다
    expect(parts.localBA()).toBe("ref-ba");
    expect(parts.initMap()).toBe("mine-init");
    expect(parts.trackPnP()).toBe("ref-track");
    expect(fallbacks()).toEqual(["trackPnP", "localBA"]);
  });

  it("mine이 reference 함수를 다시 내보낸 경우(읽기만)는 대체로 치지 않는다", () => {
    const mine = { initMap: todo, trackPnP: () => "mine-track", localBA: ref.localBA };
    const { parts, fallbacks } = buildVoParts(mine, ref);
    expect(parts.localBA).toBe(ref.localBA);
    parts.initMap();
    parts.localBA();
    expect(fallbacks()).toEqual(["initMap"]);
  });

  it("mine에 함수가 없으면 처음부터 reference이고 대체로 기록한다", () => {
    const { parts, fallbacks } = buildVoParts({ initMap: () => "m", trackPnP: () => "m" }, ref);
    expect(parts.localBA()).toBe("ref-ba");
    expect(fallbacks()).toEqual(["localBA"]);
  });

  it("reference에 함수가 없으면 오류", () => {
    expect(() => buildVoParts({}, { initMap: () => 0 })).toThrow(/trackPnP/);
  });
});

describe("fallbackNote", () => {
  it("대체가 없으면 null, 있으면 이름을 나열한다", () => {
    expect(fallbackNote([])).toBeNull();
    expect(fallbackNote(undefined)).toBeNull();
    expect(fallbackNote(["localBA"])).toBe("아직 TODO라 정답을 쓴 함수: localBA (실제로 불린 함수만 표시)");
  });
});
