/**
 * core/mine/*.ts 구문·import 검사 (ARCHITECTURE §6).
 *
 * - 기본 (test:mine 전): 모든 mine 파일을 TypeScript 파서로 검사하고, 구문 오류를
 *   site/src/data/mine-syntax.json 에 { "w01": "오류 메시지" } 형태로 기록한다.
 * - --after-tests (test:mine 후): import 실패 주차를 찾아 같은 파일에 "import 오류: …"로 덧붙인다.
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
const RESULTS_FILE = join(ROOT, "site", "src", "data", "test-results.json");
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
  return `// CI 전용 자동 생성 스텁: core/mine/${week}.ts 에 구문·import 오류가 있어 대체됨\n${body}\n`;
}

/** CI에서만: 깨진 mine 파일을 같은 함수 이름의 스텁으로 바꾼다 */
function stubInCi(week) {
  if (!IS_CI) return;
  const file = `${week}.ts`;
  const refPath = join(REF_DIR, file);
  const names = existsSync(refPath) ? exportedFunctionNames(refPath) : [];
  writeFileSync(join(MINE_DIR, file), stubSource(week, names));
  process.stderr.write(`[mine-syntax] CI: ${file} 를 TODO 스텁으로 대체 (${names.join(", ")})\n`);
}

function writeReport(report) {
  mkdirSync(join(ROOT, "site", "src", "data"), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(report, null, 2) + "\n");
}

/** 1단계 (test:mine 전): 구문 오류 검사 */
function checkSyntax() {
  const report = {};
  const files = existsSync(MINE_DIR) ? readdirSync(MINE_DIR).filter((f) => f.endsWith(".ts")) : [];

  for (const file of files) {
    const week = basename(file, ".ts");
    const errors = syntaxErrors(join(MINE_DIR, file));
    if (errors.length === 0) continue;

    report[week] = errors.join("\n");
    process.stderr.write(`[mine-syntax] ${file}: 구문 오류\n${report[week]}\n`);
    stubInCi(week);
  }

  writeReport(report);
  process.stdout.write(`[mine-syntax] 검사 ${files.length}개, 오류 ${Object.keys(report).length}개\n`);
}

const WEEK_FROM_TEST_FILE = /[\\/](w\d{2})\.test\.ts$/;

/**
 * 2단계 (test:mine 후, --after-tests): import 오류 검사.
 * 구문은 맞아도 없는 모듈·export를 import하면 test:mine에서 그 주차 파일이 "실패, 테스트 0개"로 나온다.
 * 그대로 두면 사이트 빌드(impl.ts의 mine glob)가 실패해 배포가 막히므로 같은 방식으로 스텁을 끼운다.
 */
function checkImports() {
  if (!existsSync(RESULTS_FILE)) {
    process.stdout.write("[mine-syntax] test-results.json 없음, import 검사 건너뜀\n");
    return;
  }
  const report = existsSync(OUT_FILE) ? JSON.parse(readFileSync(OUT_FILE, "utf8")) : {};
  const results = JSON.parse(readFileSync(RESULTS_FILE, "utf8"));
  const rootPrefix = ROOT.replaceAll("\\", "/").replace(/\/?$/, "/");
  let found = 0;

  for (const suite of results.testResults ?? []) {
    const week = WEEK_FROM_TEST_FILE.exec(suite.name ?? "")?.[1];
    const noTestsRan = (suite.assertionResults ?? []).length === 0;
    if (!week || suite.status !== "failed" || !noTestsRan || report[week]) continue;
    if (!existsSync(join(MINE_DIR, `${week}.ts`))) continue;

    // 메시지의 절대 경로(내 PC 경로)는 사이트에 노출하지 않는다
    const firstLine = String(suite.message ?? "알 수 없는 오류").split("\n")[0].replaceAll(rootPrefix, "");
    report[week] = `import 오류: ${firstLine}`;
    process.stderr.write(`[mine-syntax] ${week}.ts: ${report[week]}\n`);
    stubInCi(week);
    found++;
  }

  writeReport(report);
  process.stdout.write(`[mine-syntax] import 오류 ${found}개\n`);
}

if (process.argv.includes("--after-tests")) checkImports();
else checkSyntax();
