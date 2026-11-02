/**
 * 레슨 컴포넌트가 공유하는 빌드 시점 헬퍼 (서버 전용, 클라이언트로 가지 않는다).
 */
import ts from "typescript";
import type { SessionMeta } from "../../lib/sessions";

export const REPO = "yunmin1130/slam_guide";

export interface LessonContext {
  key: string; // 진도 키: "w01", 파트가 있으면 "w07a"
  /** 과제 파일 이름: "w07" (core/mine/w07.ts 등. 파트들이 한 파일을 나눠 쓴다, LESSON_TEMPLATE §1) */
  fileKey: string;
  week: number;
  tasks: string[];
  read_only: string[];
  sessions: SessionMeta[];
}

/** MDX 컴포넌트에서 현재 레슨을 꺼낸다. 레슨 페이지 밖에서 쓰면 빌드를 멈춘다. */
export function requireLesson(locals: App.Locals, component: string): LessonContext {
  if (!locals.lesson) throw new Error(`<${component}>는 레슨 페이지 안에서만 쓸 수 있다`);
  return locals.lesson;
}

export function coreFile(kind: "mine" | "reference", key: string): string {
  return `core/${kind}/${key}.ts`;
}

export function githubUrl(path: string): string {
  return `https://github.com/${REPO}/blob/main/${path}`;
}

/** iPad에서 바로 편집할 수 있는 github.dev 링크 (ARCHITECTURE §6) */
export function githubDevUrl(path: string): string {
  return `https://github.dev/${REPO}/blob/main/${path}`;
}

const referenceSources = import.meta.glob<string>("../../../../core/reference/w*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

const mineSources = import.meta.glob<string>("../../../../core/mine/w*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** core/mine 파일 전체 (코드 연습장의 시작 내용). 없으면 undefined. */
export function mineSource(key: string): string | undefined {
  return Object.entries(mineSources).find(([path]) => path.endsWith(`/${key}.ts`))?.[1];
}

/** reference 파일에서 함수 하나의 소스(JSDoc 포함)를 꺼낸다. 없으면 undefined. */
export function referenceFunctionSource(key: string, fn: string): string | undefined {
  const entry = Object.entries(referenceSources).find(([path]) => path.endsWith(`/${key}.ts`));
  if (!entry) return undefined;
  const file = ts.createSourceFile(`${key}.ts`, entry[1], ts.ScriptTarget.ES2022, true);
  const decl = file.statements.find(
    (s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === fn,
  );
  return decl ? decl.getFullText(file).trim() : undefined;
}
