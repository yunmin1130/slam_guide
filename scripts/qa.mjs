/**
 * 레슨 화면 자동 QA (WORKFLOW G2-qa). 빌드 결과를 폰 크기(393px)·라이트/다크로 열어 검사한다.
 *
 * 사용: npm run build && npm run qa
 *   QA_URL=http://localhost:4399  이미 떠 있는 preview 서버를 쓴다 (없으면 직접 띄우고 끈다)
 *   QA_CHROMIUM=경로               크롬 실행 파일을 직접 지정 (없으면 ms-playwright 폴더에서 찾는다.
 *                                  아무것도 없으면 `npx playwright install chromium`)
 *   QA_ONLY=w03                    이름에 이 문자열이 들어간 페이지만 검사
 *
 * 검사: 수식 렌더 오류, 가로 넘침, 콘솔·페이지 오류, 과제 카드, 코드 연습장 채점 실행(결과 종류는
 *       PlaygroundResults의 data-outcome으로 판정), 데모 그림 높이(≤ 400px)와 토글.
 * 결과는 qa-output/report.json, 스크린샷은 qa-output/*.png. 실패가 하나라도 있으면 종료 코드 1.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(ROOT, "qa-output");
const LESSONS = join(ROOT, "site/src/content/lessons");
const BASE_PATH = "/slam_guide/";
const PORT = 4391;
const VIEWPORT = { width: 393, height: 852 };
const MAX_FIGURE_HEIGHT = 400; // LESSON_TEMPLATE §3 ③
const RUN_WAIT_MS = 12_000; // 코드 연습장 시간 제한(8초) + 워커 시작
const ACTION_TIMEOUT_MS = 10_000; // 클릭·대기 한 번의 상한 (기본 30초는 너무 길다)
const SHOT_CHUNK = 1600; // 스크린샷 한 장의 높이 (시각 검사 에이전트가 읽기 좋은 크기)
const CASE_STATUSES = new Set(["pass", "fail", "todo"]);

// ---- 준비 ----

function browserDirs() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return [process.env.PLAYWRIGHT_BROWSERS_PATH];
  if (process.platform === "win32") return [join(homedir(), "AppData/Local/ms-playwright")];
  if (process.platform === "darwin") return [join(homedir(), "Library/Caches/ms-playwright")];
  return [join(homedir(), ".cache/ms-playwright")];
}

const CHROME_EXES = [
  "chrome-win/chrome.exe",
  "chrome-win64/chrome.exe",
  "chrome-linux/chrome",
  "chrome-linux64/chrome",
  "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
  "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
];

function findChromium() {
  if (process.env.QA_CHROMIUM) return process.env.QA_CHROMIUM;
  for (const dir of browserDirs().filter(existsSync)) {
    const builds = readdirSync(dir)
      .map((d) => /^chromium-(\d+)$/.exec(d))
      .filter(Boolean)
      .sort((a, b) => Number(b[1]) - Number(a[1])); // 최신 빌드부터 (숫자 정렬)
    for (const [name] of builds) {
      const exe = CHROME_EXES.map((e) => join(dir, name, e)).find(existsSync);
      if (exe) return exe;
    }
  }
  return undefined; // playwright 기본 경로에 맡긴다
}

/** frontmatter에서 필요한 필드만 읽는다 (tasks, read_only, demo). 한 줄 배열 형식만 지원한다 */
function readLessons() {
  return readdirSync(LESSONS)
    .filter((f) => /^w\d{2}.*\.mdx$/.test(f))
    .sort()
    .map((f) => {
      const fm = readFileSync(join(LESSONS, f), "utf8").split(/^---\s*$/m)[1] ?? "";
      // 키가 없거나, 한 줄 배열 [a, b]가 아니면(여러 줄 YAML 등) 조용히 빈 목록으로 두지 않고 멈춘다
      const list = (key) => {
        const match = new RegExp(`^${key}:[ \\t]*(.*)$`, "m").exec(fm);
        if (!match) throw new Error(`${f}: frontmatter에 ${key}가 없다`);
        const value = match[1].trim();
        if (!/^\[.*\]$/.test(value)) throw new Error(`${f}: ${key}는 한 줄 배열 [a, b]로 써야 QA가 읽는다 (지금: "${value}")`);
        return value.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
      };
      const demo = /^demo:[ \t]*(\S+)/m.exec(fm)?.[1];
      return { slug: f.replace(/\.mdx$/, ""), tasks: list("tasks"), readOnly: list("read_only"), demo: Boolean(demo) && demo !== "false" };
    });
}

// 서버 대기 중에 Ctrl+C가 와도 끌 수 있게 모듈 변수로 잡아 둔다
let serverChild;

/** preview 서버를 띄운다. Astro는 preview를 하나만 허용하므로, 이미 떠 있으면 그 주소를 쓴다 */
async function startServer() {
  const noop = () => {};
  if (process.env.QA_URL) return { origin: process.env.QA_URL.replace(/\/$/, ""), stop: noop };
  if (!existsSync(join(ROOT, "site/dist"))) throw new Error("site/dist가 없다. 먼저 npm run build");
  const astroBin = join(ROOT, "node_modules/astro/bin/astro.mjs");
  const child = (serverChild = spawn(process.execPath, [astroBin, "preview", "--root", "site", "--port", String(PORT)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  }));
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  const stop = () => child.exitCode === null && child.kill();

  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    const plain = output.replace(/\x1b\[[0-9;]*m/g, "");
    const running = /already running[\s\S]*?URL:\s*(http\S+)/.exec(plain);
    if (running) {
      stop();
      console.log(`이미 떠 있는 preview 서버를 쓴다: ${running[1]} (그 서버가 최신 빌드를 보고 있는지 확인할 것)`);
      return { origin: running[1].replace(/\/$/, ""), stop: noop };
    }
    // 내 자식 프로세스가 주소를 알린 뒤에만 접속한다 (같은 포트의 다른 서버에 붙지 않게)
    if (plain.includes(`localhost:${PORT}`)) {
      try {
        if ((await fetch(`http://localhost:${PORT}${BASE_PATH}`)).ok) return { origin: `http://localhost:${PORT}`, stop };
      } catch {
        // 아직 준비 중
      }
    }
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  stop();
  throw new Error(`preview 서버를 띄우지 못했다:\n${output.slice(-800)}`);
}

// ---- 페이지 검사 ----

async function layoutChecks(page) {
  return page.evaluate((vw) => {
    // 블록 수식·코드·표는 자체 가로 스크롤이 있어서 넘쳐도 된다 (인라인 수식은 예외 아님).
    // .katex-mathml은 화면 읽기용으로 숨긴 사본이라 위치가 의미 없다
    // SVG 안쪽 도형은 svg 상자가 잘라 보여준다(KaTeX 근호는 아주 긴 path를 잘라 쓴다) → svg 상자만 본다
    const scrollsItself = (e) => e.closest(".katex-display, pre, table, .katex-mathml") || (e.ownerSVGElement ?? null) !== null;
    const outside = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.right > vw + 1 || r.left < -1);
    };
    const wide = [...document.querySelectorAll("main *")]
      .filter((e) => outside(e) && !scrollsItself(e))
      .slice(0, 5)
      .map((e) => `${e.tagName.toLowerCase()}.${(e.getAttribute("class") ?? "").split(" ")[0]}`);
    // 블록 수식이 자체 가로 스크롤로 넘치는 것도 폰에서는 읽기 어렵다 → 수식을 여러 줄로 나눠야 한다
    const wideMath = [...document.querySelectorAll("main .katex-display")]
      .filter((e) => e.scrollWidth > e.clientWidth + 1)
      .slice(0, 5)
      .map((e) => (e.querySelector(".katex-mathml annotation")?.textContent ?? "").replace(/\s+/g, " ").slice(0, 60));
    return {
      wideMath,
      katexErrors: [...document.querySelectorAll(".katex-error")].map((e) => e.getAttribute("title") ?? e.textContent).slice(0, 5),
      overflow: document.documentElement.scrollWidth - vw,
      wide,
    };
  }, VIEWPORT.width);
}

/**
 * 페이지를 끝까지 한 화면씩 내려서 client:visible 아일랜드를 모두 하이드레이션한다.
 * 스크린샷이 "불러오는 중" 상태(비활성 버튼 등)로 찍혀 시각 검사를 속이지 않게 하고,
 * 끝내 하이드레이션되지 않는 컴포넌트(로드 오류)를 잡는다.
 */
async function hydrateAll(page, fail) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += VIEWPORT.height / 2) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(60);
  }
  try {
    await page.waitForFunction(() => !document.querySelector("astro-island[ssr]"), null, { timeout: ACTION_TIMEOUT_MS });
  } catch {
    const stuck = await page.$$eval("astro-island[ssr]", (els) => els.map((e) => e.getAttribute("component-url")?.split("/").pop()));
    fail(`하이드레이션되지 않은 컴포넌트: ${stuck.join(", ")}`);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function screenshots(page, name) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const files = [];
  for (let y = 0, i = 1; y < height; y += SHOT_CHUNK, i++) {
    const path = join(OUT, `${name}-${String(i).padStart(2, "0")}.png`);
    await page.screenshot({ path, fullPage: true, clip: { x: 0, y, width: VIEWPORT.width, height: Math.min(SHOT_CHUNK, height - y) } });
    files.push(path);
  }
  return files;
}

/** selector 아래 Astro 아일랜드가 있고, 전부 하이드레이션됐을 때까지 기다린다 */
async function hydrated(page, selector) {
  const count = await page.locator(`${selector} astro-island`).count();
  if (count === 0) throw new Error(`${selector} 안에 인터랙티브 컴포넌트(astro-island)가 없다`);
  await page.waitForFunction((s) => !document.querySelector(`${s} astro-island[ssr]`), selector, { timeout: ACTION_TIMEOUT_MS });
}

/** 테스트 실행을 누르고, 결과 종류(data-outcome)와 케이스 상태 목록을 돌려준다 */
async function runPlayground(card) {
  await card.getByRole("button", { name: /코드 쓰기/ }).click({ timeout: ACTION_TIMEOUT_MS });
  const results = card.locator("section[data-outcome]");
  if ((await results.count()) > 0) throw new Error("실행 전부터 결과가 있다 (이전 상태가 남음)");
  await card.getByRole("button", { name: /테스트 실행/ }).click({ timeout: ACTION_TIMEOUT_MS });
  // "running"이 아닌 결과가 나올 때까지 기다린다
  await card.locator('section[data-outcome]:not([data-outcome="running"])').waitFor({ timeout: RUN_WAIT_MS });
  const outcome = await results.getAttribute("data-outcome");
  const statuses = await card.locator("li[data-status]").evaluateAll((els) => els.map((e) => e.getAttribute("data-status")));
  // 문구는 실패 메시지용 참고값이라, 없어도 판정(outcome·statuses)을 가리지 않게 기다리지 않는다
  const headlineEl = results.locator("p").first();
  const headline = (await headlineEl.count()) > 0 ? ((await headlineEl.textContent()) ?? "").trim() : "";
  return { outcome, statuses, headline };
}

/** 과제 카드: 있는지, 코드 연습장 채점이 정상 결과(통과·실패·TODO 케이스 1개 이상)를 내는지 */
async function taskCardChecks(page, lesson, fail) {
  for (const fn of lesson.readOnly) {
    if ((await page.locator(`#task-${fn}`).count()) === 0) fail(`읽기만 카드 없음: ${fn}`);
  }
  for (const fn of lesson.tasks) {
    const card = page.locator(`#task-${fn}`);
    if ((await card.count()) === 0) {
      fail(`과제 카드 없음: ${fn}`);
      continue;
    }
    try {
      await card.scrollIntoViewIfNeeded();
      await hydrated(page, `#task-${fn}`);
      const r = await runPlayground(card);
      if (r.outcome !== "done") fail(`${fn}: 채점 결과가 ${r.outcome} — ${r.headline}`);
      else if (r.statuses.length === 0) fail(`${fn}: 채점 케이스가 0개`);
      else if (!r.statuses.every((s) => CASE_STATUSES.has(s))) fail(`${fn}: 알 수 없는 케이스 상태 ${r.statuses.join(",")}`);
    } catch (e) {
      fail(`${fn}: 코드 연습장 검사 실패 — ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    }
  }
}

async function figureHeights(page, fail, when) {
  const figures = page.locator('main astro-island [role="figure"]');
  const n = await figures.count();
  if (n === 0) fail(`frontmatter에 demo가 있는데 데모 그림(아일랜드 안 role=figure)이 없다 (${when})`);
  for (let i = 0; i < n; i++) {
    const box = await figures.nth(i).boundingBox();
    if (!box) fail(`데모 그림 ${i + 1}이 화면에 그려지지 않았다 (${when})`);
    else if (box.height > MAX_FIGURE_HEIGHT) fail(`데모 그림 높이 ${Math.round(box.height)}px > ${MAX_FIGURE_HEIGHT}px (${when})`);
  }
}

/** 데모: 하이드레이션 후 그림 높이, 토글을 하나씩 눌러 눌림 상태가 바뀌는지, 누른 뒤 높이 */
async function demoChecks(page, fail) {
  try {
    // client:visible 아일랜드는 화면에 보여야 하이드레이션된다 → 데모 아일랜드마다 스크롤해서 기다린다
    const islands = page.locator('main astro-island:has([role="figure"])');
    for (let i = 0; i < (await islands.count()); i++) {
      const island = islands.nth(i);
      await island.scrollIntoViewIfNeeded();
      await page.waitForFunction((el) => !el.hasAttribute("ssr"), await island.elementHandle(), { timeout: ACTION_TIMEOUT_MS });
    }
    await figureHeights(page, fail, "처음");
    const toggles = page.locator("main button[data-kind]");
    const count = await toggles.count();
    if (count === 0) fail("데모에 mine/reference 토글(button[data-kind])이 없다");
    let switched = 0; // 눌리지 않은 상태에서 눌러 실제로 바뀐 토글 수
    for (let i = 0; i < count; i++) {
      const t = toggles.nth(i);
      if (!(await t.isEnabled())) continue; // 내 구현이 아직 없으면 mine 쪽은 비활성일 수 있다
      const before = await t.getAttribute("aria-pressed");
      await t.scrollIntoViewIfNeeded();
      await t.click({ timeout: ACTION_TIMEOUT_MS });
      await page.waitForFunction((el) => el.getAttribute("aria-pressed") === "true", await t.elementHandle(), { timeout: ACTION_TIMEOUT_MS });
      if (before !== "true") switched++;
    }
    if (count > 0 && switched === 0) fail("데모 토글을 하나도 바꿔 보지 못했다 (전부 비활성이거나 이미 눌림)");
    if (count > 0) await figureHeights(page, fail, "토글 후");
  } catch (e) {
    fail(`데모 검사 실패 — ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  }
}

async function checkPage(browser, origin, target, scheme) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: scheme });
  ctx.setDefaultTimeout(ACTION_TIMEOUT_MS);
  const page = await ctx.newPage();
  const failures = [];
  const fail = (m) => failures.push(m);
  page.on("pageerror", (e) => fail(`페이지 오류: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && fail(`콘솔 오류: ${m.text()}`));
  page.on("dialog", (d) => d.accept());
  let shots = [];
  try {
    await page.goto(`${origin}${BASE_PATH}${target.path}`, { waitUntil: "load", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: ACTION_TIMEOUT_MS }).catch(() => {}); // 폰트·KaTeX CSS까지 기다리되, 끝없는 요청이 있어도 진행
    const layout = await layoutChecks(page);
    if (layout.katexErrors.length) fail(`수식 렌더 오류 ${layout.katexErrors.length}개: ${layout.katexErrors.join(" | ")}`);
    if (layout.overflow > 1 || layout.wide.length) fail(`가로 넘침 ${layout.overflow}px: ${layout.wide.join(", ")}`);
    if (layout.wideMath.length) fail(`화면보다 넓은 블록 수식 ${layout.wideMath.length}개 (줄 나누기 필요): ${layout.wideMath.join(" | ")}`);
    await hydrateAll(page, fail);
    shots = await screenshots(page, `${target.name}-${scheme}`);
    // 인터랙션 검사는 라이트에서 한 번만 한다 (다크는 화면·오류 리스너만)
    if (target.lesson && scheme === "light") {
      await taskCardChecks(page, target.lesson, fail);
      if (target.lesson.demo) await demoChecks(page, fail);
    }
  } catch (e) {
    fail(`검사 중단: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  } finally {
    await ctx.close();
  }
  return { page: target.name, scheme, failures, screenshots: shots.map((p) => p.slice(ROOT.length).replaceAll("\\", "/")) };
}

// ---- 실행 ----

let cleanup = async () => {
  if (serverChild && serverChild.exitCode === null) serverChild.kill();
};

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const only = process.env.QA_ONLY;
  const targets = [
    { name: "dashboard", path: "" },
    ...readLessons().map((l) => ({ name: l.slug, path: `lessons/${l.slug}/`, lesson: l })),
  ].filter((t) => !only || t.name.includes(only));
  if (targets.length === 0) throw new Error(`QA_ONLY="${only}"에 맞는 페이지가 없다`);

  const server = await startServer();
  let browser;
  cleanup = async () => {
    await browser?.close().catch(() => {});
    server.stop();
  };
  const results = [];
  try {
    browser = await chromium.launch({ executablePath: findChromium() });
    for (const t of targets) {
      for (const scheme of ["light", "dark"]) {
        const r = await checkPage(browser, server.origin, t, scheme);
        results.push(r);
        console.log(`${r.failures.length ? "✗" : "✓"} ${r.page} (${scheme})${r.failures.map((f) => `\n    - ${f}`).join("")}`);
      }
    }
  } finally {
    await cleanup();
  }
  const ok = results.every((r) => r.failures.length === 0);
  writeFileSync(join(OUT, "report.json"), JSON.stringify({ ok, pages: results }, null, 2));
  console.log(ok ? `\nQA 통과 (${results.length}개 화면)` : "\nQA 실패: qa-output/report.json 참고");
  process.exitCode = ok ? 0 : 1;
}

// Ctrl+C 등으로 끊겨도 preview 서버와 브라우저를 남기지 않는다
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    cleanup().finally(() => process.exit(130));
  });
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await cleanup();
  process.exitCode = 1;
});
