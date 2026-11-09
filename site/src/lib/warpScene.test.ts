import { describe, expect, it } from "vitest";
import { norm, svd2 } from "./mat2";
import { EIGEN_PRESETS, EIGEN_STEP, eigenProbe, EXAMPLE, MIN_PRESETS, MIN_STEP, minAngles, minimizeProbe, rangeFor, sliderAngles } from "./warpScene";

describe("eigenProbe", () => {
  it("기본: 대칭·비대칭 preset은 슬라이더 눈금 위에서 고유벡터 방향(양쪽 부호 포함 4곳)에 닿는다", () => {
    for (const p of EIGEN_PRESETS.filter((q) => q.id !== "rot")) {
      const hits = sliderAngles(EIGEN_STEP).filter((d) => eigenProbe(p.m, d).hit);
      expect(hits).toHaveLength(4);
      for (const d of hits) {
        const r = eigenProbe(p.m, d);
        expect(norm([r.Ax[0] - r.lambda * r.x[0], r.Ax[1] - r.lambda * r.x[1]])).toBeLessThan(1e-9);
      }
    }
  });

  it("경계: 회전 30°는 어느 눈금에서도 닿지 않는다", () => {
    const rot = EIGEN_PRESETS.find((p) => p.id === "rot")!;
    expect(sliderAngles(EIGEN_STEP).some((d) => eigenProbe(rot.m, d).hit)).toBe(false);
  });

  it("수치: 대칭 preset의 x와 Ax 사이 각은 모든 눈금에서 90° 미만 (양의 정부호, 본문 주장)", () => {
    const sym = EIGEN_PRESETS.find((p) => p.id === "sym")!;
    for (const d of sliderAngles(EIGEN_STEP)) expect(eigenProbe(sym.m, d).angle).toBeLessThan(90);
  });
});

describe("본문 SVD 예시", () => {
  it("기본: A = (1/5)[[4,-3],[6,8]]는 σ = 2, 1, v₁ = (0.6, 0.8), v₂ = (-0.8, 0.6), u₁ = (0, 1), u₂ = (-1, 0) (본문 숫자)", () => {
    const { U, sigma, V } = svd2(EXAMPLE);
    [2, 1].forEach((s, i) => expect(sigma[i]).toBeCloseTo(s, 12));
    [0.6, -0.8, 0.8, 0.6].forEach((v, i) => expect(V[i]).toBeCloseTo(v, 12));
    [0, -1, 1, 0].forEach((v, i) => expect(U[i]).toBeCloseTo(v, 12));
  });
});

describe("minAngles", () => {
  it("기본: 3° 눈금을 모두 담고, 0~360 사이에서 오름차순·중복 없음", () => {
    for (const p of MIN_PRESETS) {
      const a = minAngles(p.m);
      sliderAngles(MIN_STEP).forEach((d) => expect(a).toContain(d));
      a.forEach((d, i) => {
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThan(360);
        if (i > 0) expect(d).toBeGreaterThan(a[i - 1]!);
      });
    }
  });

  it("경계: 눈금 위에 있는 방향(랭크 1의 135°)은 두 번 들어가지 않는다", () => {
    const rank1 = MIN_PRESETS.find((p) => p.id === "rank1")!;
    expect(minAngles(rank1.m)).toHaveLength(sliderAngles(MIN_STEP).length);
  });
});

describe("minimizeProbe", () => {
  it("기본: 각 preset은 슬라이더 위치 중 가장 짧은 방향(±v₂) 두 곳에 정확히 닿는다", () => {
    for (const p of MIN_PRESETS) {
      const hits = minAngles(p.m)
        .map((d) => minimizeProbe(p.m, d))
        .filter((r) => r.hit);
      expect(hits).toHaveLength(2);
      hits.forEach((r) => expect(r.len).toBeCloseTo(r.sigma[1], 9));
    }
  });

  it("경계: 랭크 1 preset은 닿은 곳에서 |Ax|가 정확히 0이다 (상태문 '|Ax| = 0'과 판독값이 일치)", () => {
    const rank1 = MIN_PRESETS.find((p) => p.id === "rank1")!;
    const hits = minAngles(rank1.m)
      .map((d) => minimizeProbe(rank1.m, d))
      .filter((r) => r.hit);
    expect(hits.length).toBeGreaterThan(0);
    hits.forEach((r) => expect(r.len).toBeLessThan(1e-9));
  });

  it("수치: |Ax|는 늘 σ₂ 이상 σ₁ 이하, 그림 범위는 타원을 다 담는다", () => {
    for (const p of MIN_PRESETS) {
      for (const d of sliderAngles(1)) {
        const r = minimizeProbe(p.m, d);
        expect(r.len).toBeGreaterThanOrEqual(r.sigma[1] - 1e-9);
        expect(r.len).toBeLessThanOrEqual(r.sigma[0] + 1e-9);
        expect(r.len).toBeLessThan(rangeFor(p.m));
      }
    }
  });
});
