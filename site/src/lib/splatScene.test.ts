import { describe, expect, it } from "vitest";
import {
  INTR,
  STRIP,
  STRIP_SPLATS,
  centerPixel,
  depthOrder,
  ellipseAxes,
  ellipsePoints,
  marginalXZ,
  rotationYawRoll,
  silhouetteU,
  stripColumns,
  toCss,
  type M2,
  type M3,
  type V3,
} from "./splatScene";

const close = (got: readonly number[], want: readonly number[], digits = 9) => got.forEach((x, i) => expect(x).toBeCloseTo(want[i]!, digits));

function apply(R: M3, v: V3): V3 {
  return [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]];
}

describe("rotationYawRoll", () => {
  it("각이 0이면 단위행렬, 어떤 각에서도 직교행렬이고 det = +1", () => {
    close(rotationYawRoll(0, 0).flat(), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const R = rotationYawRoll(35, -70);
    const x = apply(R, [1, 0, 0]);
    const y = apply(R, [0, 1, 0]);
    const z = apply(R, [0, 0, 1]);
    close([x[0] * y[0] + x[1] * y[1] + x[2] * y[2], Math.hypot(...x), Math.hypot(...y), Math.hypot(...z)], [0, 1, 1, 1]);
    // x × y = z (오른손 좌표계 유지)
    close([x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]], z);
  });

  it("yaw 90°는 긴 축(x)을 광축(z)과 나란하게, roll 90°는 x축을 이미지의 세로(y)로 보낸다", () => {
    close(apply(rotationYawRoll(90, 0), [1, 0, 0]), [0, 0, -1]);
    close(apply(rotationYawRoll(0, 90), [1, 0, 0]), [0, 1, 0]);
  });
});

describe("ellipseAxes · ellipsePoints", () => {
  it("diag(4, 1)은 반축 2와 1, 긴 축은 가로", () => {
    const e = ellipseAxes([
      [4, 0],
      [0, 1],
    ]);
    close([e!.major, e!.minor, e!.angleDeg], [2, 1, 0]);
  });

  it("레슨의 기울어진 타원 (1/25)[[52, 36], [36, 73]]은 반축 2와 1, 긴 축은 (0.6, 0.8) 방향", () => {
    const e = ellipseAxes([
      [2.08, 1.44],
      [1.44, 2.92],
    ])!;
    close([e.major, e.minor], [2, 1]);
    close([Math.cos((e.angleDeg * Math.PI) / 180), Math.sin((e.angleDeg * Math.PI) / 180)], [0.6, 0.8]);
  });

  it("고유값이 음수면 그 반축은 0으로, NaN이 섞이면 null", () => {
    const bad = ellipseAxes([
      [1, 2],
      [2, 1],
    ])!;
    close([bad.major, bad.minor], [Math.sqrt(3), 0]);
    expect(
      ellipseAxes([
        [NaN, 0],
        [0, 1],
      ]),
    ).toBe(null);
  });

  it("타원 위의 점은 모두 dᵀΣ⁻¹d = k² 을 만족한다", () => {
    const S: M2 = [
      [2.08, 1.44],
      [1.44, 2.92],
    ];
    const det = S[0][0] * S[1][1] - S[0][1] * S[1][0];
    for (const k of [1, 3]) {
      const points = ellipsePoints([10, -5], S, k, 16);
      expect(points).toHaveLength(16);
      for (const [px, py] of points) {
        const dx = px - 10;
        const dy = py + 5;
        expect((S[1][1] * dx * dx - 2 * S[0][1] * dx * dy + S[0][0] * dy * dy) / det).toBeCloseTo(k * k, 9);
      }
    }
  });
});

describe("marginalXZ · centerPixel", () => {
  it("(x, z) 성분만 남긴다", () => {
    expect(
      marginalXZ([
        [1, 2, 3],
        [2, 4, 5],
        [3, 5, 6],
      ]),
    ).toEqual([
      [1, 3],
      [3, 6],
    ]);
  });

  it("광축 위의 점은 주점, (4, 0, 4)는 오른쪽 끝", () => {
    close(centerPixel([0, 0, 5], INTR), [160, 100]);
    close(centerPixel([4, 0, 4], INTR), [320, 100]);
  });
});

describe("silhouetteU", () => {
  const sphere = (r: number): M3 => [
    [r * r, 0, 0],
    [0, r * r, 0],
    [0, 0, r * r],
  ];

  it("광축 위 반지름 r 인 구: 접선 기울기 ±r/√(z² − r²) (z = 5, r = 3 이면 ±3/4)", () => {
    const u = silhouetteU([0, 0, 5], sphere(3), INTR)!;
    close(u, [160 - 160 * 0.75, 160 + 160 * 0.75]);
  });

  it("작은 가우시안이면 선형화 폭 f·r/z 와 거의 같고, 크면 실제 실루엣이 더 넓다", () => {
    const small = silhouetteU([0, 0, 8], sphere(0.1), INTR)!;
    expect((small[1] - small[0]) / 2).toBeCloseTo((160 * 0.1) / 8, 3);
    const big = silhouetteU([0, 0, 4], sphere(2), INTR)!;
    expect((big[1] - big[0]) / 2).toBeGreaterThan((160 * 2) / 4);
  });

  it("타원체가 카메라 평면에 닿거나 카메라가 안에 있으면 null", () => {
    expect(silhouetteU([0, 0, 2], sphere(2), INTR)).toBe(null);
    expect(silhouetteU([0, 0, 1], sphere(3), INTR)).toBe(null);
    expect(silhouetteU([0, 0, -3], sphere(1), INTR)).toBe(null);
  });

  it("실루엣 경계 방향은 정말로 타원에 접한다 (접점이 하나)", () => {
    const Sigma: M3 = [
      [1.5, 0, 0.6],
      [0, 1, 0],
      [0.6, 0, 0.8],
    ];
    const c: V3 = [1.5, 0, 5];
    const u = silhouetteU(c, Sigma, INTR)!;
    for (const edge of u) {
      const t = (edge - INTR.cx) / INTR.fx;
      // 직선 x = t·z 와 타원 (p − c)ᵀ M⁻¹ (p − c) = 1 의 교점 방정식의 판별식이 0
      const n: [number, number] = [1, -t];
      const dist2 = (n[0] * c[0] + n[1] * c[2]) ** 2;
      const spread = Sigma[0][0] * n[0] * n[0] + 2 * Sigma[0][2] * n[0] * n[1] + Sigma[2][2] * n[1] * n[1];
      expect(dist2).toBeCloseTo(spread, 9);
    }
  });
});

describe("알파 합성 띠", () => {
  it("칸 중심은 범위 안에 고르게 놓이고 좌우 대칭", () => {
    const xs = stripColumns();
    expect(xs).toHaveLength(STRIP.columns);
    expect(xs[0]! + xs[xs.length - 1]!).toBeCloseTo(0, 12);
    expect(xs[0]!).toBeGreaterThan(STRIP.min);
    expect(xs[1]! - xs[0]!).toBeCloseTo((STRIP.max - STRIP.min) / STRIP.columns, 12);
  });

  it("깊이 순서: 기본은 빨강이 앞, 뒤집으면 파랑이 앞", () => {
    expect(depthOrder(false)).toEqual([0, 1, 2]);
    expect(depthOrder(true)).toEqual([2, 1, 0]);
    expect(STRIP_SPLATS.map((s) => s.name)).toEqual(["빨강", "초록", "파랑"]);
  });

  it("toCss: 0~1 을 0~255 로, 범위 밖과 NaN 은 잘라 낸다", () => {
    expect(toCss([1, 0.5, 0])).toBe("rgb(255 128 0)");
    expect(toCss([2, -1, NaN])).toBe("rgb(255 0 0)");
  });
});
