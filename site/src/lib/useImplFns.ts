/**
 * 데모가 쓰는 core 함수 여러 개를 mine 또는 reference에서 불러오는 훅 (lib/impl.ts의 loadFn 경유, ARCHITECTURE §4).
 * 불러온 결과에 key를 붙여 두어, 토글 직후 이전 구현의 결과가 새 라벨로 보이지 않게 한다.
 */
import { useEffect, useState } from "react";
import { loadFn, type ImplKind } from "./impl";
import { friendlyLoadError } from "./staleChunk";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 함수 시그니처는 호출하는 데모가 정한다
type FnMap = Record<string, (...args: any[]) => unknown>;

interface Loaded<T> {
  key: string | null;
  fns: T | null;
  loadError: string | null;
}

export function useImplFns<T extends FnMap>(
  week: number,
  names: readonly (keyof T & string)[],
  kind: ImplKind,
): { fns: T | null; loadError: string | null } {
  const joined = names.join(",");
  const key = `${week}|${kind}|${joined}`;
  const [state, setState] = useState<Loaded<T>>({ key: null, fns: null, loadError: null });

  useEffect(() => {
    let alive = true;
    const list = joined.split(",");
    Promise.all(list.map((name) => loadFn(week, name, kind)))
      .then((loaded) => {
        if (!alive) return;
        const fns = Object.fromEntries(list.map((name, i) => [name, loaded[i]])) as T;
        setState({ key, fns, loadError: null });
      })
      .catch((e: unknown) => alive && setState({ key, fns: null, loadError: friendlyLoadError(e) }));
    return () => {
      alive = false;
    };
  }, [key, joined, week, kind]);

  return state.key === key ? { fns: state.fns, loadError: state.loadError } : { fns: null, loadError: null };
}
