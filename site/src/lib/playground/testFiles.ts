/** 채점기가 쓰는 core 파일 목록 (워커·parity 테스트 공용). 테스트 파일은 주차별로 필요할 때만 불러온다. */
import * as mlMatrix from "ml-matrix";
import type { CompileDeps } from "./compile";

const testFiles = import.meta.glob("../../../../core/tests/w*.test.ts");
const referenceFiles = import.meta.glob<Record<string, unknown>>("../../../../core/reference/w*.ts", { eager: true });

function weekOf(path: string): string | undefined {
  return /[\/](w\d{2})(?:\.test)?\.ts$/.exec(path)?.[1];
}

export function loadTestFile(week: string): Promise<unknown> {
  const entry = Object.entries(testFiles).find(([path]) => weekOf(path) === week);
  if (!entry) return Promise.reject(new Error(`core/tests/${week}.test.ts 가 없다`));
  return entry[1]();
}

export const compileDeps: CompileDeps = {
  reference: Object.fromEntries(
    Object.entries(referenceFiles).flatMap(([path, mod]) => {
      const week = weekOf(path);
      return week ? [[week, mod]] : [];
    }),
  ),
  packages: { "ml-matrix": mlMatrix },
};

export function availableWeeks(): string[] {
  return Object.keys(testFiles).flatMap((p) => weekOf(p) ?? []).sort();
}
