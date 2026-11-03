/**
 * VO 워커의 함수별 대체: mine의 initMap·trackPnP·localBA 중 아직 TODO인 것만 reference로 바꿔 끼운다.
 * 셋 중 하나만 짰어도 내 VO를 돌려볼 수 있게 하기 위함. 조립(makeVo)은 reference 것을 쓴다.
 * "아직 TODO"는 호출할 때 안다: Error("TODO")를 던지면 그 호출부터 계속 reference를 쓴다.
 * 모듈은 lib/impl.ts(loadWeek)로 불러서 넘긴다. 이 파일은 core를 import하지 않는다.
 */

export const VO_PART_NAMES = ["initMap", "trackPnP", "localBA"] as const;
export type VoPartName = (typeof VO_PART_NAMES)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 시그니처는 core의 VoParts가 정한다
type AnyFn = (...args: any[]) => unknown;
type Module = Record<string, unknown>;

/** mine 스텁이 던지는 "아직 안 짬" 오류인지 (메시지가 정확히 "TODO") */
export function isTodoError(e: unknown): boolean {
  return e instanceof Error && e.message === "TODO";
}

/** mine을 부르다 TODO가 나오면 그 호출과 이후 호출은 ref로 돌린다. 처음 바꿀 때 onFallback을 한 번 부른다 */
export function withFallback<F extends AnyFn>(mine: F, ref: F, onFallback: () => void): F {
  let useRef = false;
  const wrapped = (...args: Parameters<F>): ReturnType<F> => {
    if (!useRef) {
      try {
        return mine(...args) as ReturnType<F>;
      } catch (e) {
        if (!isTodoError(e)) throw e;
        useRef = true;
        onFallback();
      }
    }
    return ref(...args) as ReturnType<F>;
  };
  return wrapped as F;
}

export interface VoPartsWithFallback {
  readonly parts: Readonly<Record<VoPartName, AnyFn>>;
  /** 지금까지 reference로 바꾼 함수 이름 (VO_PART_NAMES 순서) */
  fallbacks(): string[];
}

function requireFn(mod: Module, name: string, who: string): AnyFn {
  const v = mod[name];
  if (typeof v !== "function") throw new Error(`${who}/w11에 ${name} 함수가 없다`);
  return v as AnyFn;
}

/**
 * mine·reference 모듈에서 VO 부품을 고른다. mine에 함수가 없으면 처음부터 reference를 쓴다.
 * mine이 reference 함수를 그대로 다시 내보낸 경우(읽기만 함수)는 대체로 치지 않는다.
 */
export function buildVoParts(mine: Module, ref: Module): VoPartsWithFallback {
  const used = new Set<VoPartName>();
  const entries = VO_PART_NAMES.map((name) => {
    const refFn = requireFn(ref, name, "reference");
    const mineFn = mine[name];
    if (typeof mineFn !== "function") {
      used.add(name);
      return [name, refFn] as const;
    }
    if (mineFn === refFn) return [name, refFn] as const;
    return [name, withFallback(mineFn as AnyFn, refFn, () => used.add(name))] as const;
  });
  return {
    parts: Object.fromEntries(entries) as Record<VoPartName, AnyFn>,
    fallbacks: () => VO_PART_NAMES.filter((n) => used.has(n)),
  };
}

/** 화면에 보일 짧은 안내. 대체한 함수가 없으면 null */
export function fallbackNote(fallbacks: readonly string[] | undefined): string | null {
  return fallbacks && fallbacks.length > 0 ? `아직 TODO라 정답을 쓴 함수: ${fallbacks.join(", ")} (실제로 불린 함수만 표시)` : null;
}
