import { describe, expect, it } from "vitest";
import { formatMeters, groupBySequence, parseResult } from "./cppResults";

const good = {
  format: "slam-guide-result",
  version: 1,
  sequence: "fr1/xyz",
  impl: "cpp",
  git_sha: "abc1234",
  date: "2026-11-03",
  frames: { tracked: 299, total: 300 },
  ate: { rmse: 0.046, mean: 0.04 },
  rpe: { trans_rmse: 0.012, rot_rmse_deg: 0.5 },
  note: "",
};

describe("parseResult", () => {
  it("올바른 파일을 표 행으로 바꾼다", () => {
    const r = parseResult("a.json", good);
    expect(r.impl).toBe("cpp");
    expect(r.ateRmse).toBe(0.046);
    expect(r.tracked).toBe(299);
    expect(r.rpeRotDeg).toBe(0.5);
  });

  it("rpe·frames·note는 없어도 되고 git_sha는 null이어도 된다", () => {
    const { rpe: _r, frames: _f, note: _n, ...rest } = good;
    const r = parseResult("b.json", { ...rest, git_sha: null });
    expect(r.rpeTrans).toBe(null);
    expect(r.total).toBe(null);
    expect(r.note).toBe("");
    expect(r.gitSha).toBe(null);
  });

  it("틀린 형식이면 파일 이름을 넣어 예외를 던진다", () => {
    expect(() => parseResult("x.json", { ...good, format: "other" })).toThrow(/x\.json/);
    expect(() => parseResult("x.json", { ...good, impl: "python" })).toThrow(/impl/);
    expect(() => parseResult("x.json", { ...good, ate: { rmse: -1 } })).toThrow(/ate\.rmse/);
    expect(() => parseResult("x.json", { ...good, ate: { rmse: "0.1" } })).toThrow();
    expect(() => parseResult("x.json", { ...good, frames: { tracked: 301, total: 300 } })).toThrow(/frames/);
    expect(() => parseResult("x.json", { ...good, date: "2026/11/03" })).toThrow(/date/);
    expect(() => parseResult("x.json", { ...good, git_sha: "<script>" })).toThrow(/git_sha/);
    expect(() => parseResult("x.json", { ...good, note: "a".repeat(201) })).toThrow(/note/);
    expect(() => parseResult("x.json", [])).toThrow();
    expect(() => parseResult("x.json", { ...good, rpe: {} })).toThrow(/rpe/);
    expect(() => parseResult("x.json", { ...good, rpe: { trans: 0.1 } })).toThrow(/rpe/);
  });
});

describe("groupBySequence", () => {
  it("시퀀스 이름순, 같은 시퀀스 안에서는 TS(mine) → TS(reference) → C++ → ORB-SLAM3", () => {
    const rows = [
      parseResult("3.json", { ...good, sequence: "fr3/long_office", impl: "cpp" }),
      parseResult("2.json", { ...good, impl: "orbslam3" }),
      parseResult("1.json", { ...good, impl: "cpp" }),
      parseResult("0.json", { ...good, impl: "ts-mine" }),
    ];
    const g = groupBySequence(rows);
    expect(g.map((x) => x.sequence)).toEqual(["fr1/xyz", "fr3/long_office"]);
    expect(g[0]!.rows.map((r) => r.impl)).toEqual(["ts-mine", "cpp", "orbslam3"]);
  });
});

describe("formatMeters", () => {
  it("1 m 미만은 cm, 0.1 m 미만은 소수 둘째 자리", () => {
    expect(formatMeters(0.046)).toBe("4.60 cm");
    expect(formatMeters(0.17)).toBe("17.0 cm");
    expect(formatMeters(1.234)).toBe("1.23 m");
  });
});
