/** 14주차 정답 구현. 시그니처는 core/mine/w14.ts와 같다. */
import { skew } from "@core/prev/w01";
import { expSO3 } from "@core/prev/w03";
import type { ImuBias, ImuSample, IntegrateOptions, Mat3, MatN, NavState, PreintJacobians, Preintegrated, Vec3 } from "../types";

// 이보다 작은 각은 Jr 계수를 급수로 (1 − cosθ 의 상쇄 오차를 피한다)
const SMALL_ANGLE = 1e-3;
const I3: Mat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const Z3: Mat3 = [
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
];

function mm(A: Mat3, B: Mat3): Mat3 {
  const c = (i: number, j: number) => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  const row = (i: number): Vec3 => [c(i, 0), c(i, 1), c(i, 2)];
  return [row(0), row(1), row(2)];
}

function mv(A: Mat3, v: Vec3): Vec3 {
  const r = (i: number) => A[i][0] * v[0] + A[i][1] * v[1] + A[i][2] * v[2];
  return [r(0), r(1), r(2)];
}

function tr(A: Mat3): Mat3 {
  return [
    [A[0][0], A[1][0], A[2][0]],
    [A[0][1], A[1][1], A[2][1]],
    [A[0][2], A[1][2], A[2][2]],
  ];
}

/** a·A + b·B */
function lin(a: number, A: Mat3, b: number, B: Mat3): Mat3 {
  const c = (i: number, j: number) => a * A[i][j] + b * B[i][j];
  const row = (i: number): Vec3 => [c(i, 0), c(i, 1), c(i, 2)];
  return [row(0), row(1), row(2)];
}

function add3(a: Vec3, b: Vec3, k = 1): Vec3 {
  return [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];
}

function scale3(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

function finite3(v: Vec3): boolean {
  return v.length === 3 && v.every(Number.isFinite);
}

function checkSamples(samples: readonly ImuSample[], who: string): void {
  if (samples.length < 2) throw new Error(`${who}: 측정이 2개 이상 필요하다`);
  samples.forEach((s, k) => {
    if (!(Number.isFinite(s.t) && finite3(s.gyro) && finite3(s.accel))) throw new Error(`${who}: ${k}번 측정에 NaN·무한대가 있다`);
    if (k > 0 && !(s.t > samples[k - 1]!.t)) throw new Error(`${who}: 시각이 늘어나지 않는다 (${k}번)`);
  });
}

function checkBias(b: ImuBias, who: string): void {
  if (!(finite3(b.gyro) && finite3(b.accel))) throw new Error(`${who}: 바이어스에 NaN·무한대가 있다`);
}

/** p ← p + v·dt + ½·a·dt²,  v ← v + a·dt */
function step(p: Vec3, v: Vec3, a: Vec3, dt: number): { p: Vec3; v: Vec3 } {
  return { p: add3(add3(p, v, dt), a, 0.5 * dt * dt), v: add3(v, a, dt) };
}

export function integrateIMU(init: NavState, samples: readonly ImuSample[], opts: IntegrateOptions): NavState[] {
  checkSamples(samples, "integrateIMU");
  if (!(init.R.length === 3 && init.R.every(finite3) && finite3(init.p) && finite3(init.v) && finite3(opts.gravity))) {
    throw new Error("integrateIMU: 시작 상태·중력에 NaN·무한대가 있다");
  }
  if (opts.method !== "euler" && opts.method !== "midpoint") throw new Error("integrateIMU: method는 euler 또는 midpoint");
  const g = opts.gravity;
  const out: NavState[] = [{ R: init.R, p: init.p, v: init.v }];
  for (let k = 0; k + 1 < samples.length; k++) {
    const s0 = samples[k]!;
    const s1 = samples[k + 1]!;
    const dt = s1.t - s0.t;
    const cur = out[k]!;
    let R: Mat3;
    let a: Vec3;
    if (opts.method === "euler") {
      // 구간 시작의 측정과 자세만 쓴다
      R = mm(cur.R, expSO3(scale3(s0.gyro, dt)));
      a = add3(mv(cur.R, s0.accel), g);
    } else {
      // 각속도는 양 끝 평균, 비력은 양 끝 자세로 각각 월드로 돌린 뒤 평균 (VINS-Mono 방식)
      R = mm(cur.R, expSO3(scale3(add3(s0.gyro, s1.gyro), 0.5 * dt)));
      a = add3(scale3(add3(mv(cur.R, s0.accel), mv(R, s1.accel)), 0.5), g);
    }
    const { p, v } = step(cur.p, cur.v, a, dt);
    out.push({ R, p, v });
  }
  return out;
}

export function preintegrate(samples: readonly ImuSample[], bias: ImuBias): Preintegrated {
  checkSamples(samples, "preintegrate");
  checkBias(bias, "preintegrate");
  let dR = I3;
  let dv: Vec3 = [0, 0, 0];
  let dp: Vec3 = [0, 0, 0];
  for (let k = 0; k + 1 < samples.length; k++) {
    const dt = samples[k + 1]!.t - samples[k]!.t;
    const w = add3(samples[k]!.gyro, bias.gyro, -1);
    const a = mv(dR, add3(samples[k]!.accel, bias.accel, -1)); // 몸체 i 좌표로 돌린 비력
    // p 는 갱신 전 v 를, v 는 갱신 전 R 을 쓴다 (오일러)
    const next = step(dp, dv, a, dt);
    dp = next.p;
    dv = next.v;
    dR = mm(dR, expSO3(scale3(w, dt)));
  }
  return { dR, dv, dp, dt: samples[samples.length - 1]!.t - samples[0]!.t };
}

/** SO(3) 오른쪽 야코비안 Jr(φ) = I − (1 − cosθ)/θ²·[φ]× + (θ − sinθ)/θ³·[φ]×² */
function rightJacobian(phi: Vec3): Mat3 {
  const th = Math.hypot(...phi);
  const W = skew(phi);
  const W2 = mm(W, W);
  const small = th < SMALL_ANGLE;
  const t2 = th * th;
  const a = small ? 0.5 - t2 / 24 + (t2 * t2) / 720 : (1 - Math.cos(th)) / t2;
  const b = small ? 1 / 6 - t2 / 120 + (t2 * t2) / 5040 : (th - Math.sin(th)) / (t2 * th);
  return lin(1, I3, 1, lin(-a, W, b, W2));
}

function toMatN(A: Mat3): MatN {
  return A.map((r) => [...r]);
}

/**
 * 읽기만: 사전적분의 바이어스 1차 보정 야코비안
 * (Forster 등 2017, 부록의 반복식).
 * 측정 하나씩 진행하며, 각 식은 갱신 전 값을
 * 쓴다 (p → v → R 순서).
 * lin(a, A, b, B) = a·A + b·B (3×3)
 */
export function biasJacobians(
  samples: readonly ImuSample[],
  bias: ImuBias,
): PreintJacobians {
  checkSamples(samples, "biasJacobians");
  checkBias(bias, "biasJacobians");
  let dR = I3;
  let JR = Z3; // ∂ΔR/∂bg (우섭동)
  let Jvg = Z3; // ∂Δv/∂bg
  let Jva = Z3; // ∂Δv/∂ba
  let Jpg = Z3; // ∂Δp/∂bg
  let Jpa = Z3; // ∂Δp/∂ba
  for (let k = 0; k + 1 < samples.length; k++) {
    const s = samples[k]!;
    const dt = samples[k + 1]!.t - s.t;
    const half = 0.5 * dt * dt;
    const w = add3(s.gyro, bias.gyro, -1);
    const f = add3(s.accel, bias.accel, -1);
    // RFJ = ΔR·[f]×·J_R
    const RFJ = mm(mm(dR, skew(f)), JR);
    // p: 갱신 전 J_v 와 ΔR 을 쓴다
    Jpa = lin(1, Jpa, 1, lin(dt, Jva, -half, dR));
    Jpg = lin(1, Jpg, 1, lin(dt, Jvg, -half, RFJ));
    // v: 갱신 전 ΔR, J_R 을 쓴다
    Jva = lin(1, Jva, -dt, dR);
    Jvg = lin(1, Jvg, -dt, RFJ);
    // R: J_R ← Exp(φ)ᵀ·J_R − Jr(φ)·dt
    const phi = scale3(w, dt);
    const back = mm(tr(expSO3(phi)), JR);
    JR = lin(1, back, -dt, rightJacobian(phi));
    dR = mm(dR, expSO3(phi));
  }
  return {
    dR_dbg: toMatN(JR),
    dv_dbg: toMatN(Jvg),
    dv_dba: toMatN(Jva),
    dp_dbg: toMatN(Jpg),
    dp_dba: toMatN(Jpa),
  };
}
