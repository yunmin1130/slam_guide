/** 10주차 정답 구현. 시그니처는 core/mine/w10.ts와 같다. */
import type { Descriptor, Match, RatioTestOptions } from "../types";

/** 바이트 하나의 1인 비트 수 */
function popcount8(v: number): number {
  let x = v & 0xff;
  let c = 0;
  while (x) {
    x &= x - 1; // 가장 낮은 1 비트를 지운다
    c++;
  }
  return c;
}

function distance(a: Descriptor, b: Descriptor, metric: RatioTestOptions["metric"]): number {
  if (metric === "hamming") {
    let d = 0;
    for (let k = 0; k < a.length; k++) d += popcount8(a[k]! ^ b[k]!);
    return d;
  }
  let s = 0;
  for (let k = 0; k < a.length; k++) s += (a[k]! - b[k]!) ** 2;
  return Math.sqrt(s);
}

function validate(query: readonly Descriptor[], train: readonly Descriptor[], opts: RatioTestOptions): void {
  if (!(opts.ratio > 0 && opts.ratio <= 1)) throw new Error("ratioTest: ratio는 0보다 크고 1 이하여야 한다");
  if (opts.metric !== "hamming" && opts.metric !== "l2") throw new Error(`ratioTest: 모르는 거리 ${String(opts.metric)}`);
  const all = [...query, ...train];
  if (all.length === 0) return;
  const len = all[0]!.length;
  for (const d of all) {
    if (d.length !== len) throw new Error("ratioTest: 디스크립터 길이가 서로 다르다");
    if (!d.every(Number.isFinite)) throw new Error("ratioTest: 디스크립터에 NaN·무한대가 있다");
    if (opts.metric === "hamming" && !d.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)) {
      throw new Error("ratioTest: 해밍 거리의 디스크립터는 0~255 정수(바이트)여야 한다");
    }
  }
}

export function ratioTest(query: readonly Descriptor[], train: readonly Descriptor[], opts: RatioTestOptions): Match[] {
  validate(query, train, opts);
  if (train.length < 2) return []; // 2위가 없으면 비교할 수 없다
  const out: Match[] = [];
  query.forEach((q, qi) => {
    let best = Infinity;
    let second = Infinity;
    let bestIdx = -1;
    train.forEach((t, ti) => {
      const d = distance(q, t, opts.metric);
      if (d < best) {
        second = best;
        best = d;
        bestIdx = ti;
      } else if (d < second) {
        second = d;
      }
    });
    // 1위가 2위보다 확실히 가까울 때만 (같으면 애매하므로 버린다)
    if (best < opts.ratio * second) out.push({ query: qi, train: bestIdx, distance: best, secondDistance: second });
  });
  return out;
}
