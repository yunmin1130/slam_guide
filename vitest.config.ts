import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const coreDir = fileURLToPath(new URL("./core", import.meta.url));
// 이전 주차 함수: 기본은 reference, M1 리포트 때만 CORE_PREV=mine (ARCHITECTURE §3)
const prevImpl = process.env.CORE_PREV === "mine" ? "mine" : "reference";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@core\/prev\//, replacement: `${coreDir}/${prevImpl}/` },
      { find: /^@core\//, replacement: `${coreDir}/` },
    ],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "ref",
          include: ["core/tests/**/*.test.ts"],
          env: { IMPL: "reference" },
        },
      },
      {
        extends: true,
        test: {
          name: "mine",
          include: ["core/tests/**/*.test.ts"],
          env: { IMPL: "mine" },
        },
      },
      {
        // 사이트 순수 로직 (impl·storage·sessions). core 테스트와 분리
        extends: true,
        test: {
          name: "site",
          include: ["site/src/lib/**/*.test.ts"],
        },
      },
    ],
  },
});
