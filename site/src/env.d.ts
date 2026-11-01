/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** 레슨 페이지가 렌더링 전에 넣는다. TaskCard·SessionBreak가 주차·세션을 여기서 찾는다. */
    lesson?: import("./components/lesson/context").LessonContext;
  }
}
