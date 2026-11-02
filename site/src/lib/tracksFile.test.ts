import { describe, expect, it } from "vitest";
import { MAX_FEATURES, MAX_FRAMES, MAX_TOTAL_FEATURES, parseTracks, quatToMat } from "./tracksFile";

const base = () => ({
  format: "slam-guide-tracks",
  version: 1,
  name: "tum-freiburg1_xyz",
  camera: { fx: 517.3, fy: 516.5, cx: 318.6, cy: 255.3, width: 640, height: 480 },
  frames: [
    {
      t: 1000.0,
      features: [
        [0, 10.5, 20.25],
        [3, 100, 200],
      ],
    },
    { t: 1000.1, features: [[0, 11, 21]] },
  ],
  groundtruth: [[0.1, 0.2, 0.3, 1, 0, 0, 0], null] as (number[] | null)[],
});
const text = (o: unknown) => JSON.stringify(o);

describe("parseTracks", () => {
  it("DATA §2 tracks 형식을 읽는다: 특징점은 {id, uv}, 정답은 T_wc (쿼터니언 w 먼저)", () => {
    const f = parseTracks(text(base()));
    expect(f.name).toBe("tum-freiburg1_xyz");
    expect(f.camera.width).toBe(640);
    expect(f.times).toEqual([1000.0, 1000.1]);
    expect(f.frames[0]).toEqual([
      { id: 0, uv: [10.5, 20.25] },
      { id: 3, uv: [100, 200] },
    ]);
    expect(f.groundtruth[0]!.t).toEqual([0.1, 0.2, 0.3]);
    expect(f.groundtruth[0]!.R).toEqual(quatToMat([1, 0, 0, 0]));
    expect(f.groundtruth[1]).toBeNull();
  });

  it("JSON이 아니거나 format·version이 다르면 이유를 담아 예외", () => {
    expect(() => parseTracks("{oops")).toThrow(/JSON/);
    expect(() => parseTracks(text({ ...base(), format: "x" }))).toThrow(/tum_tracks/);
    expect(() => parseTracks(text({ ...base(), version: 2 }))).toThrow(/버전/);
  });

  it("카메라·프레임·특징점·정답의 모양이 틀리면 어디가 틀렸는지 알려준다", () => {
    expect(() => parseTracks(text({ ...base(), camera: { ...base().camera, fx: 0 } }))).toThrow(/fx/);
    expect(() => parseTracks(text({ ...base(), frames: base().frames.slice(0, 1), groundtruth: [null] }))).toThrow(/2장/);
    expect(() => parseTracks(text({ ...base(), groundtruth: [null] }))).toThrow(/groundtruth/);
    const dupId = base();
    dupId.frames[0]!.features.push([0, 1, 1]);
    expect(() => parseTracks(text(dupId))).toThrow(/같은 id/);
    const badFeat = base();
    badFeat.frames[1]!.features = [[1.5, 1, 1]];
    expect(() => parseTracks(text(badFeat))).toThrow(/frames\[1\]\.features\[0\]/);
    const badQuat = base();
    badQuat.groundtruth[0] = [0, 0, 0, 2, 0, 0, 0];
    expect(() => parseTracks(text(badQuat))).toThrow(/쿼터니언/);
    const noT = { ...base(), frames: [{ features: [] }, { t: 1, features: [] }] };
    expect(() => parseTracks(text(noT))).toThrow(/시각/);
  });

  it(`너무 크면 거부한다 (프레임 ${MAX_FRAMES}장, 프레임당 특징점 ${MAX_FEATURES}개 초과)`, () => {
    const frames = Array.from({ length: MAX_FRAMES + 1 }, (_, k) => ({ t: k, features: [] }));
    expect(() => parseTracks(text({ ...base(), frames, groundtruth: frames.map(() => null) }))).toThrow(/많다/);
    const wide = base();
    wide.frames[0]!.features = Array.from({ length: MAX_FEATURES + 1 }, (_, i) => [i, 1, 1]);
    expect(() => parseTracks(text(wide))).toThrow(/많다/);
  });
});

describe("parseTracks 정리", () => {
  it("이름에서 영문·숫자·_.- 밖의 글자를 걷어 내고, 시각이 늘지 않으면 거부한다", () => {
    const evil = ["tum", "\n", String.fromCharCode(0x202e), "x/../y"].join("");
    expect(parseTracks(text({ ...base(), name: evil })).name).toBe("tumx..y");
    expect(parseTracks(text({ ...base(), name: "///" })).name).toBe("tracks");
    const back = base();
    back.frames[1]!.t = 999;
    expect(() => parseTracks(text(back))).toThrow(/순서/);
  });

  it(`파일 전체 특징점이 ${MAX_TOTAL_FEATURES}개를 넘으면 거부한다`, () => {
    const many = Array.from({ length: 1000 }, (_, i) => [i, 1, 1]);
    const frames = Array.from({ length: Math.ceil(MAX_TOTAL_FEATURES / 1000) + 1 }, (_, k) => ({ t: k, features: many }));
    expect(() => parseTracks(text({ ...base(), frames, groundtruth: frames.map(() => null) }))).toThrow(/모두/);
  });
});

describe("quatToMat", () => {
  it("z축 90° 회전 쿼터니언 [cos45°, 0, 0, sin45°]는 x축을 y축으로 보낸다", () => {
    const c = Math.SQRT1_2;
    const R = quatToMat([c, 0, 0, c]);
    expect(R[0][0]).toBeCloseTo(0, 12);
    expect(R[1][0]).toBeCloseTo(1, 12);
    expect(R[2][2]).toBeCloseTo(1, 12);
  });
});
