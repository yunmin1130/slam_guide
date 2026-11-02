/**
 * core/tests 파일을 브라우저 채점기에서 쓰도록 import 두 개를 바꿔 끼우는 Vite 플러그인.
 *   "vitest"      → ./shim.ts       (describe/it/expect 대역)
 *   "./loadImpl"  → ./draftImpl.ts  (구현 = 초안 모듈)
 * core/tests 안에서 온 import만 바꾼다. 사이트의 다른 코드와 Vitest의 ref·mine 실행에는 영향 없음.
 * 쓰는 곳: site/astro.config.mjs (페이지·워커 빌드), vitest.config.ts의 site project (parity 테스트).
 */
import { fileURLToPath } from "node:url";
import { normalizePath, type Plugin } from "vite";

// 경로 표기를 Vite 방식(/)으로 맞춘다. 안 그러면 Windows에서 같은 파일이 두 모듈로 번들돼 초안 슬롯이 갈라진다
const SHIM = normalizePath(fileURLToPath(new URL("./shim.ts", import.meta.url)));
const DRAFT_IMPL = normalizePath(fileURLToPath(new URL("./draftImpl.ts", import.meta.url)));
const CORE_TEST = /[\/]core[\/]tests[\/][^\/]+\.ts$/;

export function playgroundTestsPlugin(): Plugin {
  return {
    name: "slam-playground-tests",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer || !CORE_TEST.test(importer.split("?")[0])) return null;
      if (source === "vitest") return SHIM;
      if (source === "./loadImpl" || source === "./loadImpl.ts") return DRAFT_IMPL;
      return null;
    },
  };
}
