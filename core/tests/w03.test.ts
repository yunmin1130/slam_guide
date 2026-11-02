/**
 * 3주차 테스트. 제목 구조는 강제 규칙이다 (LESSON_TEMPLATE §4):
 *   describe(구현) > describe("<함수명>") > it("기본|경계|수치: …")
 * 기대값은 테스트 안에서 쿼터니언 곱(q v q*)으로 직접 만든다. 구현 함수끼리 서로를 검증하지 않게 하기 위함이다.
 */
import { describe, expect, it } from "vitest";
import { IMPL, loadImpl } from "./loadImpl";
import { createRng, randomVec3, type Rng } from "./rng";

type W03 = typeof import("../reference/w03");
type V3 = readonly [number, number, number];
type M3 = readonly [V3, V3, V3];
type Q = readonly [number, number, number, number];
type Pose = { readonly R: M3; readonly t: V3 };

const m = await loadImpl<W03>("w03");

const TOL = 1e-9;
const I3: M3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
/** z축 90° 회전: x축 → y축 */
const RZ90: M3 = [
  [0, -1, 0],
  [1, 0, 0],
  [0, 0, 1],
];
const RX180: M3 = [
  [1, 0, 0],
  [0, -1, 0],
  [0, 0, -1],
];

// ---- 테스트용 도우미 (구현과 무관하게 정의대로 계산) ----

function qmul(a: Q, b: Q): Q {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

function qnormalize(q: Q): Q {
  const n = Math.hypot(...q);
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/** 단위 쿼터니언으로 벡터 돌리기: q v q* */
function qrotate(q: Q, v: V3): V3 {
  const [, x, y, z] = qmul(qmul(q, [0, v[0], v[1], v[2]]), [q[0], -q[1], -q[2], -q[3]]);
  return [x, y, z];
}

/** 축-각 벡터(방향 = 축, 크기 = 각도) → 쿼터니언 */
function axisAngleQuat(w: V3): Q {
  const th = Math.hypot(...w);
  if (th === 0) return [1, 0, 0, 0];
  const s = Math.sin(th / 2) / th;
  return [Math.cos(th / 2), w[0] * s, w[1] * s, w[2] * s];
}

/** 쿼터니언으로 기저 벡터를 돌려 열을 채운 회전행렬 (닫힌 공식을 쓰지 않는다) */
function rotFromQuat(q: Q): M3 {
  const c0 = qrotate(q, [1, 0, 0]);
  const c1 = qrotate(q, [0, 1, 0]);
  const c2 = qrotate(q, [0, 0, 1]);
  return [
    [c0[0], c1[0], c2[0]],
    [c0[1], c1[1], c2[1]],
    [c0[2], c1[2], c2[2]],
  ];
}

const rotFromAxisAngle = (w: V3): M3 => rotFromQuat(axisAngleQuat(w));

function matVec(A: M3, v: V3): V3 {
  const row = (i: number) => A[i][0] * v[0] + A[i][1] * v[1] + A[i][2] * v[2];
  return [row(0), row(1), row(2)];
}

function matMul(A: M3, B: M3): M3 {
  const cell = (i: number, j: number) => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  const row = (i: number): V3 => [cell(i, 0), cell(i, 1), cell(i, 2)];
  return [row(0), row(1), row(2)];
}

function transpose(A: M3): M3 {
  return [
    [A[0][0], A[1][0], A[2][0]],
    [A[0][1], A[1][1], A[2][1]],
    [A[0][2], A[1][2], A[2][2]],
  ];
}

function det(A: M3): number {
  return (
    A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
    A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
    A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0])
  );
}

/** 원소별 최대 차이 */
function matDiff(A: readonly (readonly number[])[], B: readonly (readonly number[])[]): number {
  return Math.max(...A.flatMap((row, i) => row.map((v, j) => Math.abs(v - B[i][j]))));
}

function vecDiff(a: readonly number[], b: readonly number[]): number {
  return Math.max(...a.map((v, i) => Math.abs(v - b[i])));
}

/** θ = π처럼 부호가 정해지지 않는 경우: b와 -b 중 가까운 쪽까지의 차이 */
function signFreeVecDiff(a: readonly number[], b: readonly number[]): number {
  return Math.min(vecDiff(a, b), vecDiff(a, b.map((v) => -v)));
}

function poseDiff(a: Pose, b: Pose): number {
  return Math.max(matDiff(a.R, b.R), vecDiff(a.t, b.t));
}

function apply(T: Pose, p: V3): V3 {
  const r = matVec(T.R, p);
  return [r[0] + T.t[0], r[1] + T.t[1], r[2] + T.t[2]];
}

function randomQuat(rng: Rng): Q {
  return qnormalize([rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1]);
}

function randomPose(rng: Rng): Pose {
  return { R: rotFromQuat(randomQuat(rng)), t: randomVec3(rng, 5) };
}

function randomAxis(rng: Rng): V3 {
  const a = randomVec3(rng, 1);
  const n = Math.hypot(...a);
  return [a[0] / n, a[1] / n, a[2] / n];
}

const scaled = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];

/** 각도가 [0, maxAngle) 인 무작위 축-각 벡터 */
function randomRotVec(rng: Rng, maxAngle: number): V3 {
  return scaled(randomAxis(rng), rng() * maxAngle);
}

function expectRotation(R: M3): void {
  expect(matDiff(matMul(transpose(R), R), I3)).toBeLessThan(1e-9);
  expect(det(R)).toBeCloseTo(1, 9);
}

describe(IMPL, () => {
  describe("quatToRot", () => {
    it("기본: 항등 쿼터니언은 I, z축 90° 쿼터니언 [cos45°,0,0,sin45°]는 x축을 y축으로 보낸다", () => {
      expect(matDiff(m.quatToRot([1, 0, 0, 0]), I3)).toBeLessThan(TOL);
      const h = Math.SQRT1_2;
      expect(matDiff(m.quatToRot([h, 0, 0, h]), RZ90)).toBeLessThan(TOL);
    });

    it("경계: q와 -q는 같은 회전, 크기가 1이 아니면 정규화해서 쓰고, 0 쿼터니언은 예외", () => {
      const rng = createRng(31);
      const q = randomQuat(rng);
      const R = m.quatToRot(q);
      expect(matDiff(m.quatToRot([-q[0], -q[1], -q[2], -q[3]]), R)).toBeLessThan(TOL);
      expect(matDiff(m.quatToRot([3 * q[0], 3 * q[1], 3 * q[2], 3 * q[3]]), R)).toBeLessThan(TOL);
      expect(() => m.quatToRot([0, 0, 0, 0])).toThrow();
    });

    it("수치: 무작위 쿼터니언 100개에서 R·v = q v q* 이고 R은 회전행렬 (RᵀR = I, det = +1)", () => {
      const rng = createRng(32);
      for (let k = 0; k < 100; k++) {
        const q = randomQuat(rng);
        const R = m.quatToRot(q);
        expectRotation(R);
        const v = randomVec3(rng);
        expect(vecDiff(matVec(R, v), qrotate(q, v))).toBeLessThan(1e-9);
      }
    });
  });

  describe("rotToQuat", () => {
    it("기본: I는 [1,0,0,0], z축 90°는 [cos45°, 0, 0, sin45°]", () => {
      expect(vecDiff(m.rotToQuat(I3), [1, 0, 0, 0])).toBeLessThan(TOL);
      const h = Math.SQRT1_2;
      expect(vecDiff(m.rotToQuat(RZ90), [h, 0, 0, h])).toBeLessThan(TOL);
    });

    it("경계: 180° 회전(w = 0)과 180° 근처(대각합 음수)도 처리하고, w ≥ 0인 단위 쿼터니언을 돌려준다", () => {
      const q = m.rotToQuat(RX180);
      expect(Math.abs(q[0])).toBeLessThan(TOL);
      expect(signFreeVecDiff([q[1], q[2], q[3]], [1, 0, 0])).toBeLessThan(TOL);

      const rng = createRng(33);
      for (let k = 0; k < 50; k++) {
        const w = scaled(randomAxis(rng), Math.PI - rng() * 0.1);
        const r = m.rotToQuat(rotFromAxisAngle(w));
        expect(Math.hypot(...r)).toBeCloseTo(1, 12);
        expect(-r[0]).toBeLessThanOrEqual(0);
        expect(vecDiff(r, axisAngleQuat(w))).toBeLessThan(1e-9);
      }
    });

    it("수치: 무작위 회전 100개 왕복 R → q → R 오차 < 1e-9", () => {
      const rng = createRng(34);
      for (let k = 0; k < 100; k++) {
        const R = rotFromQuat(randomQuat(rng));
        expect(matDiff(rotFromQuat(m.rotToQuat(R)), R)).toBeLessThan(1e-9);
      }
    });
  });

  describe("composeSE3", () => {
    it("기본: 평행이동끼리는 더해지고, (회전+이동)·(이동)은 점을 오른쪽부터 차례로 옮긴 것과 같다", () => {
      const ab = m.composeSE3({ R: I3, t: [1, 2, 3] }, { R: I3, t: [10, 20, 30] });
      expect(poseDiff(ab, { R: I3, t: [11, 22, 33] })).toBeLessThan(TOL);

      // a = z축 90° + [1,0,0], b = 이동 [1,0,0] → (a·b)(0) = a(b(0)) = Rz90·[1,0,0] + [1,0,0] = [1,1,0]
      const c = m.composeSE3({ R: RZ90, t: [1, 0, 0] }, { R: I3, t: [1, 0, 0] });
      expect(poseDiff(c, { R: RZ90, t: [1, 1, 0] })).toBeLessThan(TOL);
    });

    it("경계: 항등 변환과 합성하면 그대로이고, 입력을 바꾸지 않는다", () => {
      const rng = createRng(35);
      const T0 = randomPose(rng);
      const copy = JSON.parse(JSON.stringify(T0)) as Pose;
      const id: Pose = { R: I3, t: [0, 0, 0] };
      expect(poseDiff(m.composeSE3(id, T0), T0)).toBeLessThan(TOL);
      expect(poseDiff(m.composeSE3(T0, id), T0)).toBeLessThan(TOL);
      expect(T0).toEqual(copy);
    });

    it("수치: 무작위 100쌍에서 (a·b)(p) = a(b(p)), 결합법칙 (a·b)·c = a·(b·c)", () => {
      const rng = createRng(36);
      for (let k = 0; k < 100; k++) {
        const a = randomPose(rng);
        const b = randomPose(rng);
        const c = randomPose(rng);
        const p = randomVec3(rng);
        expect(vecDiff(apply(m.composeSE3(a, b), p), apply(a, apply(b, p)))).toBeLessThan(1e-9);
        const left = m.composeSE3(m.composeSE3(a, b), c);
        const right = m.composeSE3(a, m.composeSE3(b, c));
        expect(poseDiff(left, right)).toBeLessThan(1e-9);
      }
    });
  });

  describe("invSE3", () => {
    it("기본: 평행이동의 역은 반대 방향, (z축 90° + [1,0,0])의 역은 (-90° + [0,1,0])", () => {
      expect(poseDiff(m.invSE3({ R: I3, t: [1, -2, 3] }), { R: I3, t: [-1, 2, -3] })).toBeLessThan(TOL);
      expect(poseDiff(m.invSE3({ R: RZ90, t: [1, 0, 0] }), { R: transpose(RZ90), t: [0, 1, 0] })).toBeLessThan(TOL);
    });

    it("경계: 항등 변환의 역은 항등, 역의 역은 원래 변환, 입력을 바꾸지 않는다", () => {
      const id: Pose = { R: I3, t: [0, 0, 0] };
      expect(poseDiff(m.invSE3(id), id)).toBeLessThan(TOL);
      const rng = createRng(37);
      const T0 = randomPose(rng);
      const copy = JSON.parse(JSON.stringify(T0)) as Pose;
      expect(poseDiff(m.invSE3(m.invSE3(T0)), T0)).toBeLessThan(1e-9);
      expect(T0).toEqual(copy);
    });

    it("수치: 무작위 100개에서 T⁻¹(T(p)) = p", () => {
      const rng = createRng(38);
      for (let k = 0; k < 100; k++) {
        const T0 = randomPose(rng);
        const p = randomVec3(rng);
        expect(vecDiff(apply(m.invSE3(T0), apply(T0, p)), p)).toBeLessThan(1e-9);
      }
    });
  });

  describe("expSO3", () => {
    it("기본: [0, 0, π/2]는 z축 90° 회전", () => {
      expect(matDiff(m.expSO3([0, 0, Math.PI / 2]), RZ90)).toBeLessThan(TOL);
    });

    it("경계: 영벡터는 I (0/0으로 NaN이 나면 안 된다), 아주 작은 각도(1e-9 rad)는 I + [w]×", () => {
      expect(matDiff(m.expSO3([0, 0, 0]), I3)).toBeLessThan(1e-15);
      const w: V3 = [1e-9, -2e-9, 3e-9];
      const firstOrder: M3 = [
        [1, -w[2], w[1]],
        [w[2], 1, -w[0]],
        [-w[1], w[0], 1],
      ];
      expect(matDiff(m.expSO3(w), firstOrder)).toBeLessThan(1e-15);
    });

    it("수치: 무작위 100개(각도 0~π)에서 쿼터니언으로 만든 회전과 같고, 축 방향 w는 제자리에 있다", () => {
      const rng = createRng(39);
      for (let k = 0; k < 100; k++) {
        const w = randomRotVec(rng, Math.PI);
        const R = m.expSO3(w);
        expectRotation(R);
        expect(matDiff(R, rotFromAxisAngle(w))).toBeLessThan(1e-9);
        expect(vecDiff(matVec(R, w), w)).toBeLessThan(1e-9);
      }
    });
  });

  describe("logSO3", () => {
    it("기본: z축 90° 회전은 [0, 0, π/2], I는 영벡터", () => {
      expect(vecDiff(m.logSO3(RZ90), [0, 0, Math.PI / 2])).toBeLessThan(TOL);
      expect(vecDiff(m.logSO3(I3), [0, 0, 0])).toBeLessThan(1e-15);
    });

    it("경계: 아주 작은 각도(1e-9 rad)에서도 NaN 없이 w를 되찾는다", () => {
      const w: V3 = [1e-9, -2e-9, 3e-9];
      const out = m.logSO3(rotFromAxisAngle(w));
      expect(out.every(Number.isFinite)).toBe(true);
      expect(vecDiff(out, w)).toBeLessThan(1e-15);
    });

    it("경계: θ = π 정확히와 그 근처 (sinθ ≈ 0이라 축을 다른 방법으로 구해야 한다), 결과 크기는 π 이하", () => {
      expect(signFreeVecDiff(m.logSO3(RX180), [Math.PI, 0, 0])).toBeLessThan(1e-9);

      const rng = createRng(40);
      for (let k = 0; k < 50; k++) {
        const axis = randomAxis(rng);
        for (const th of [Math.PI, Math.PI - 1e-9, Math.PI - 1e-7, Math.PI - 1e-4]) {
          const w = scaled(axis, th);
          const out = m.logSO3(rotFromAxisAngle(w));
          expect(Math.hypot(...out)).toBeLessThanOrEqual(Math.PI + 1e-12);
          // θ = π 정확히는 w와 -w가 같은 회전이라 부호를 보지 않는다. 그 밖에는 부호까지 맞아야 한다
          // 허용 오차 1e-10: 반대칭 부분(sinθ·a)으로만 축을 구하면 π - 1e-7에서 약 1e-9 오차가 나서 걸린다
          const diff = th === Math.PI ? signFreeVecDiff(out, w) : vecDiff(out, w);
          expect(diff).toBeLessThan(1e-10);
        }
      }
    });

    it("수치: 무작위 200개(각도 0~π)에서 log(exp(w)) = w", () => {
      const rng = createRng(41);
      for (let k = 0; k < 200; k++) {
        const w = randomRotVec(rng, Math.PI);
        expect(vecDiff(m.logSO3(rotFromAxisAngle(w)), w)).toBeLessThan(1e-9);
      }
    });
  });
});
