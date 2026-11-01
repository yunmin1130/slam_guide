/**
 * 진도 구독 hook. 아래 세 경우 모두 다시 읽는다.
 * - 같은 페이지의 저장 (PROGRESS_EVENT)
 * - 다른 탭의 저장 (storage 이벤트)
 * - 뒤로가기로 bfcache에서 복원 (pageshow.persisted) — iPhone에서 레슨 → 대시보드 복귀 시
 * null = 아직 읽지 않음 (서버 렌더링·하이드레이션 직후)
 */
import { useEffect, useState } from "react";
import { getStore, PROGRESS_EVENT, type Progress } from "./storage";

export function useProgress(): { progress: Progress | null; error: boolean } {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const reload = () =>
      getStore()
        .load()
        .then(
          (p) => {
            setProgress(p);
            setError(false);
          },
          () => setError(true),
        );
    const onChange = (e: Event) => setProgress((e as CustomEvent<Progress>).detail);
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) reload();
    };

    reload();
    window.addEventListener(PROGRESS_EVENT, onChange);
    window.addEventListener("storage", reload);
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener(PROGRESS_EVENT, onChange);
      window.removeEventListener("storage", reload);
      window.removeEventListener("pageshow", onShow);
    };
  }, []);

  return { progress, error };
}
