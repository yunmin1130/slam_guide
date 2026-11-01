/** 레슨을 열면 마지막 방문 시각을 남기고, todo였으면 in-progress로 바꾼다 (화면 없음). */
import { useEffect } from "react";
import { updateLesson } from "../../lib/storage";

interface LessonTrackerProps {
  lessonKey: string;
}

export default function LessonTracker({ lessonKey }: LessonTrackerProps) {
  useEffect(() => {
    updateLesson(lessonKey, (s) => ({
      ...s,
      status: s?.status === "done" ? "done" : "in-progress",
      checked: s?.checked ?? [],
      lastVisited: new Date().toISOString(),
    })).catch(() => {
      // 방문 기록은 부가 기능이라 실패해도 화면을 막지 않는다 (사생활 모드 등)
    });
  }, [lessonKey]);
  return null;
}
