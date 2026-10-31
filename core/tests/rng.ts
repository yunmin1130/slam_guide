/**
 * 시드 고정 난수 생성기 (mulberry32). 무작위 테스트·RANSAC은 Math.random 대신 이걸 주입한다.
 * (LESSON_TEMPLATE §4)
 */
export type Rng = () => number;

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [-scale, scale) 범위의 무작위 3차원 벡터 */
export function randomVec3(rng: Rng, scale = 10): [number, number, number] {
  return [
    (rng() * 2 - 1) * scale,
    (rng() * 2 - 1) * scale,
    (rng() * 2 - 1) * scale,
  ];
}
