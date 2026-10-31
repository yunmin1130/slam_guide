/**
 * core/mine/*.ts 구문 검사 (ARCHITECTURE §6, CI 2단계).
 *
 * - 모든 mine 파일을 TypeScript 파서로 검사하고, 구문 오류를
 *   site/src/data/mine-syntax.json 에 { "w01": "오류 메시지" } 형태로 기록한다.
 * - CI 환경(CI=true)에서만: 오류 파일을 "시그니처 이름만 같은 TODO 스텁"으로 바꿔 끼운다.
 *   github.dev에서 반쯤 짠 코드를 push해도 test:ref·build가 막히지 않게 하기 위함.
 * - 로컬에서는 절대 파일을 바꾸지 않는다 (작성 중인 내 코드 보호).
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// SLAM_ROOT: 검사 대상 루트 (기본: 저장소 루트. 스크립트 자체 검증 시 임시 복사본을 가리킨다)
const ROOT = process.env.SLAM_ROOT ?? fileURLToPath(new URL("..", import.meta.url));
const MINE_DIR = join(ROOT, "core", "mine");
const REF_DIR = join(ROOT, "core", "reference");
const OUT_FILE = join(ROOT, "site", "src", "data", "mine-syntax.json");
// CI=true는 다른 도구도 세팅할 수 있어서 쓰지 않는다. GitHub Actions에서만 덮어쓴다.
const IS_CI = process.env.GITHUB_ACTIONS === "true";

/** 구문 오류 메시지 목록 (없으면 빈 배열) */
function syntaxErrors(filePath) {
  const source = readFileSync(filePath, "utf8");
  const result = ts.transpileModule(source, {
    reportDiagnostics: true,
    fileName: filePath,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return (result.diagnostics ?? []).map((d) => {
    const msg = ts.flattenDiagnosticMessageText(d.messageText, "\n");
    if (d.file && d.start !== undefined) {
      const { line } = d.file.getLineAndCharacterOfPosition(d.start);
      return `${line + 1}행: ${msg}`;
    }
    return msg;
  });
}

/**
 * reference 파일에서 export된 함수 이름 목록.
 * `export function`만 잡는다 (reference는 이 형식만 쓰는 규칙). 스텁은 읽기만 함수(dot 등)까지
 * 전부 throw로 바꾸므로, 구문 오류가 난 주차는 mine 테스트 전체가 실패한다 (의도된 동작).
 */
function exportedFunctionNames(refPath) {
  const source = ts.createSourceFile(refPath, readFileSync(refPath, "utf8"), ts.ScriptTarget.ES2022);
  const names = [];
  for (const stmt of source.statements) {
    const isExported = ts.getModifiers(stmt)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (isExported && ts.isFunctionDeclaration(stmt) && stmt.name) {
      names.push(stmt.name.text);
    }
  }
  return names;
}

function stubSource(week, names) {
  const body = names
    .map((n) => `export function ${n}(..._args: unknown[]): never {\n  throw new Error("SYNTAX_ERROR");\n}`)
    .join("\n\n");
  return `// CI 전용 자동 생성 스텁: core/mine/${week}.ts 에 구문 오류가 있어 대체됨\n${body}\n`;
}

function main() {
  const report = {};
  const files = existsSync(MINE_DIR) ? readdirSync(MINE_DIR).filter((f) => f.endsWith(".ts")) : [];

  for (const file of files) {
    const week = basename(file, ".ts");
    const errors = syntaxErrors(join(MINE_DIR, file));
    if (errors.length === 0) continue;

    report[week] = errors.join("\n");
    process.stderr.write(`[mine-syntax] ${file}: 구문 오류\n${report[week]}\n`);

    if (IS_CI) {
      const refPath = join(REF_DIR, file);
      const names = existsSync(refPath) ? exportedFunctionNames(refPath) : [];
      writeFileSync(join(MINE_DIR, file), stubSource(week, names));
      process.stderr.write(`[mine-syntax] CI: ${file} 를 TODO 스텁으로 대체 (${names.join(", ")})\n`);
    }
  }

  mkdirSync(join(ROOT, "site", "src", "data"), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(`[mine-syntax] 검사 ${files.length}개, 오류 ${Object.keys(report).length}개\n`);
}

main();
