import { describe, expect, it } from "vitest";
import { A_LENGTH, add, matVec, scale, sceneVectors } from "./vectorScene";

const close = (got: readonly number[], want: readonly number[]) =>
  got.forEach((x, i) => expect(x).toBeCloseTo(want[i]!, 9));

describe("sceneVectors", () => {
  it("a는 x축 위에 고정 길이로 놓인다", () => {
    const { a } = sceneVectors({ thetaDeg: 37, tiltDeg: 20, bLength: 1 });
    close(a, [A_LENGTH, 0, 0]);
  });

  it("θ=90°, 기울기 0이면 b는 y축 방향", () => {
    const { b } = sceneVectors({ thetaDeg: 90, tiltDeg: 0, bLength: 1.5 });
    close(b, [0, 1.5, 0]);
  });

  it("기울기 90°면 b는 xz 평면으로 넘어간다", () => {
    const { b } = sceneVectors({ thetaDeg: 90, tiltDeg: 90, bLength: 1 });
    close(b, [0, 0, 1]);
  });

  it("b 길이는 bLength, a와 이루는 각은 θ", () => {
    const { a, b } = sceneVectors({ thetaDeg: 120, tiltDeg: 33, bLength: 1.3 });
    const len = Math.hypot(...b);
    expect(len).toBeCloseTo(1.3, 9);
    const cos = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (A_LENGTH * len);
    expect(cos).toBeCloseTo(Math.cos((120 * Math.PI) / 180), 9);
  });
});

describe("벡터 보조 함수", () => {
  it("matVec: 행 우선 3×3 행렬과 벡터의 곱", () => {
    close(
      matVec(
        [
          [1, 2, 3],
          [4, 5, 6],
          [7, 8, 9],
        ],
        [1, 0, -1],
      ),
      [-2, -2, -2],
    );
  });

  it("scale·add는 원본을 바꾸지 않고 새 벡터를 만든다", () => {
    const v = [1, 2, 3] as const;
    close(scale(v, 2), [2, 4, 6]);
    close(add(v, [1, 1, 1]), [2, 3, 4]);
    expect(v).toEqual([1, 2, 3]);
  });
});
