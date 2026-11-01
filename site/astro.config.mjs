// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import { unified } from "@astrojs/markdown-remark";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { fileURLToPath } from "node:url";

const coreDir = fileURLToPath(new URL("../core", import.meta.url));
const prevImpl = process.env.CORE_PREV === "mine" ? "mine" : "reference";

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  site: "https://yunmin1130.github.io",
  base: "/slam_guide/",
  integrations: [mdx(), react()],
  // 수식은 빌드 타임에 KaTeX로 렌더링 → 런타임 JS 0 (ARCHITECTURE §2). MDX도 이 설정을 물려받는다.
  // 기본 처리기(Sätteri)에는 KaTeX 플러그인이 없어서 remark/rehype 파이프라인(unified)을 쓴다.
  markdown: {
    processor: unified({ remarkPlugins: [remarkMath], rehypePlugins: [[rehypeKatex, { throwOnError: true }]] }), // 잘못된 수식은 빌드 실패
    // 코드 블록도 기기 다크 모드를 따른다 (global.css의 --shiki-dark 규칙)
    shikiConfig: { themes: { light: "github-light", dark: "github-dark" } },
  },
  vite: {
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
