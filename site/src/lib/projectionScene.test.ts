import { describe, expect, it } from "vitest";
import { IMAGE, boardLines, cameraToWorld, frustumCorners, insideImage, intrinsicsFor, toNormalized, toPixel } from "./projectionScene";

const close = (got: readonly number[], want: readonly number[], digits = 9) => got.forEach((x, i) => expect(x).toBeCloseTo(want[i]!, digits));

describe("cameraToWorld", () => {
  it("카메라 앞(z)은 장면 앞(y), 카메라 아래(y)는 장면 아래(-z), 오른쪽(x)은 그대로", () => {
    close(cameraToWorld([0, 0, 1]), [0, 1, 0]);
    close(cameraToWorld([0, 1, 0]), [0, 0, -1]);
    close(cameraToWorld([1, 0, 0]), [1, 0, 0]);
  });

  it("오른손 좌표계를 유지한다 (x × y = z가 변환 뒤에도 성립)", () => {
    const x = cameraToWorld([1, 0, 0]);
    const y = cameraToWorld([0, 1, 0]);
    const z = cameraToWorld([0, 0, 1]);
    const cross = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
    close(cross, z);
  });
});

describe("intrinsicsFor · toPixel · toNormalized", () => {
  it("주점은 이미지 가운데, 정규화 좌표와 픽셀은 서로 역", () => {
    const K = intrinsicsFor(300);
    expect(K).toEqual({ fx: 300, fy: 300, cx: IMAGE.width / 2, cy: IMAGE.height / 2 });
    close(toPixel([0, 0], K), [IMAGE.width / 2, IMAGE.height / 2]);
    close(toNormalized(toPixel([0.3, -0.2], K), K), [0.3, -0.2]);
  });
});

describe("insideImage", () => {
  it("경계 포함, 밖과 NaN은 false", () => {
    expect(insideImage([0, 0])).toBe(true);
    expect(insideImage([IMAGE.width, IMAGE.height])).toBe(true);
    expect(insideImage([-1, 10])).toBe(false);
    expect(insideImage([10, IMAGE.height + 1])).toBe(false);
    expect(insideImage([Number.NaN, 0])).toBe(false);
  });
});

describe("boardLines", () => {
  it("판 가운데는 광축 위 depth, 가로·세로 선은 촘촘한 점으로 이어진다", () => {
    const lines = boardLines({ depth: 2, tiltDeg: 0 });
    const all = lines.flat();
    const zs = all.map((p) => p[2]);
    expect(Math.min(...zs)).toBeCloseTo(2, 9);
    expect(Math.max(...zs)).toBeCloseTo(2, 9);
    const xs = all.map((p) => p[0]);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 9);
    expect(lines.every((l) => l.length > 2)).toBe(true);
  });

  it("기울이면 한쪽은 가까워지고 반대쪽은 멀어진다 (가운데 깊이는 그대로)", () => {
    const all = boardLines({ depth: 2, tiltDeg: 30 }).flat();
    const left = all.filter((p) => p[0] < -0.5).map((p) => p[2]);
    const right = all.filter((p) => p[0] > 0.5).map((p) => p[2]);
    expect(Math.max(...left)).toBeLessThan(2);
    expect(Math.min(...right)).toBeGreaterThan(2);
  });
});

describe("frustumCorners", () => {
  it("깊이 d의 네 모서리를 다시 투영하면 이미지 네 모서리", () => {
    const K = intrinsicsFor(250);
    const corners = frustumCorners(K, 1.5);
    const px = corners.map((p) => [(K.fx * p[0]) / p[2] + K.cx, (K.fy * p[1]) / p[2] + K.cy]);
    close(px[0]!, [0, 0]);
    close(px[1]!, [IMAGE.width, 0]);
    close(px[2]!, [IMAGE.width, IMAGE.height]);
    close(px[3]!, [0, IMAGE.height]);
    corners.forEach((p) => expect(p[2]).toBeCloseTo(1.5, 12));
  });
});
