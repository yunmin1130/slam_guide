// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import { unified } from "@astrojs/markdown-remark";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { fileURLToPath } from "node:url";
import { playgroundTestsPlugin } from "./src/lib/playground/vitePlugin.ts";

const coreDir = fileURLToPath(new URL("../core", import.meta.url));
const prevImpl = process.env.CORE_PREV === "mine" ? "mine" : "reference";

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  site: "https://yunmin1130.github.io",
  base: "/slam_guide/",
  integrations: [mdx(), react()],
  // CSP (ARCHITECTURE §7): 빌드한 페이지마다 <meta http-equiv="content-security-policy">를 넣는다.
  // 인라인 스크립트(island 하이드레이션)는 Astro가 해시로 허용한다 → script-src에 'unsafe-inline' 없음.
  // style은 KaTeX·React의 인라인 style 속성 때문에 'unsafe-inline' (있으면 Astro가 style 해시를 빼 준다).
  // 채점·VO 워커는 같은 출처 파일이라 페이지 CSP를 물려받지 않는다 (§6.1).
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' https://api.github.com",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-src 'none'",
      ],
      scriptDirective: { resources: ["'self'"] },
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
    },
  },
  // 수식은 빌드 타임에 KaTeX로 렌더링 → 런타임 JS 0 (ARCHITECTURE §2). MDX도 이 설정을 물려받는다.
  // 기본 처리기(Sätteri)에는 KaTeX 플러그인이 없어서 remark/rehype 파이프라인(unified)을 쓴다.
  markdown: {
    // 잘못된 수식은 빌드 실패. \htmlClass만 허용한다: 수식 글자 색을 global.css 클래스(.k-c1, .k-c2)로 주어 다크 모드에서도 읽히게
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [[rehypeKatex, { throwOnError: true, trust: (/** @type {{ command: string, class?: string }} */ ctx) => ctx.command === "\\htmlClass" && /^k-c[12]$/.test(ctx.class ?? "") }]],
    }),
    // 코드 블록도 기기 다크 모드를 따른다 (global.css의 --shiki-dark 규칙)
    shikiConfig: { themes: { light: "github-light", dark: "github-dark" } },
  },
  vite: {
    // 코드 연습장: core/tests의 vitest·loadImpl import를 브라우저 채점기용으로 바꿔 끼운다 (lib/playground)
    plugins: [playgroundTestsPlugin()],
    worker: {
      format: "es", // 테스트 파일의 top-level await
      plugins: () => [playgroundTestsPlugin()],
    },
    resolve: {
      // 순서 중요: 더 구체적인 @core/prev를 먼저 둔다 (ARCHITECTURE §3)
      alias: [
        { find: /^@core\/prev\//, replacement: `${coreDir}/${prevImpl}/` },
        { find: /^@core\//, replacement: `${coreDir}/` },
      ],
    },
    server: {
      // core/는 site/ 밖이라 dev 서버 접근을 허용해야 한다
      fs: { allow: [".."] },
    },
  },
});
