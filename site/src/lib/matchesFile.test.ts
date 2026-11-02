import { describe, expect, it } from "vitest";
import { MAX_MATCHES, parseCalib, parseMatches } from "./matchesFile";

const pts = (n: number) => Array.from({ length: n }, (_, i) => [i, i * 2]);

describe("parseMatches", () => {
  it("DATA §2 matches 형식을 읽는다", () => {
    const m = parseMatches(JSON.stringify({ frames: [0, 1], detector: "orb", pts_i: pts(10), pts_j: pts(10), ratio: [] }));
    expect(m.pts1).toHaveLength(10);
    expect(m.pts2[3]).toEqual([3, 6]);
  });

  it("JSON이 아니거나, 배열 길이가 다르거나, 8개 미만이거나, 숫자가 아니면 이유를 담아 예외", () => {
    expect(() => parseMatches("{oops")).toThrow(/JSON/);
    expect(() => parseMatches(JSON.stringify({ pts_i: pts(10), pts_j: pts(9) }))).toThrow(/개수/);
    expect(() => parseMatches(JSON.stringify({ pts_i: pts(5), pts_j: pts(5) }))).toThrow(/8/);
    expect(() => parseMatches(JSON.stringify({ pts_i: [...pts(9), ["a", 1]], pts_j: pts(10) }))).toThrow(/숫자/);
    expect(() => parseMatches(JSON.stringify({ pts_j: pts(10) }))).toThrow(/pts_i/);
    expect(() => parseMatches(JSON.stringify({ pts_i: [...pts(9), [1e300, 1]], pts_j: pts(10) }))).toThrow(/절댓값/);
  });

  it(`너무 많으면(${MAX_MATCHES}개 초과) 거부한다`, () => {
    expect(() => parseMatches(JSON.stringify({ pts_i: pts(MAX_MATCHES + 1), pts_j: pts(MAX_MATCHES + 1) }))).toThrow(/많다/);
  });
});

describe("parseCalib", () => {
  it("DATA §3 calib.json의 camera를 읽는다", () => {
    const c = parseCalib(JSON.stringify({ camera: { model: "fisheye", fx: 290, fy: 291, cx: 410, cy: 308, distortion: [0.1, 0, 0, 0] } }));
    expect(c).toEqual({ model: "fisheye", fx: 290, fy: 291, cx: 410, cy: 308, distortion: [0.1, 0, 0, 0] });
  });

  it("모델 이름이 틀리거나 fx가 0 이하이거나 어안 계수가 4개가 아니면 예외", () => {
    const base = { model: "fisheye", fx: 290, fy: 291, cx: 410, cy: 308, distortion: [0, 0, 0, 0] };
    expect(() => parseCalib(JSON.stringify({ camera: { ...base, model: "weird" } }))).toThrow(/model/);
    expect(() => parseCalib(JSON.stringify({ camera: { ...base, fx: 0 } }))).toThrow(/fx/);
    expect(() => parseCalib(JSON.stringify({ camera: { ...base, distortion: [0, 0] } }))).toThrow(/4개/);
    expect(() => parseCalib(JSON.stringify({}))).toThrow(/camera/);
  });
});
