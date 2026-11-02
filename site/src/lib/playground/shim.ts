/**
 * 브라우저용 vitest 대역 — core/tests 파일을 그대로 브라우저에서 돌리기 위한 최소 구현.
 * 빌드 때 core/tests의 `import … from "vitest"`가 이 파일로 바뀐다 (vitePlugin.ts).
 *
 * 지원: describe, it, expect + matcher 7개 (core/tests에서 실제로 쓰는 것만).
 * 판정은 vitest와 같아야 한다. shim.test.ts가 같은 입력을 진짜 vitest expect와 나란히 돌려 확인한다.
 * 지원하지 않는 matcher는 조용히 통과시키지 않고 오류를 낸다 (거짓 통과 방지).
 */

export interface RegisteredCase {
  path: string[]; // describe 이름들: ["mine", "skew"]
  name: string; // it 이름: "기본: …"
  fn: () => unknown;
}

let registry: RegisteredCase[] = [];
const stack: string[] = [];

export function describe(name: string, body: () => void): void {
  stack.push(name);
  try {
    body();
  } finally {
    stack.pop();
  }
}

export function it(name: string, fn: () => unknown): void {
  registry.push({ path: [...stack], name, fn });
}

export const test = it;

/** 지금까지 등록된 테스트를 꺼내고 목록을 비운다 */
export function takeRegistered(): RegisteredCase[] {
  const out = registry;
  registry = [];
  return out;
}

// ---- expect ----

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionError";
  }
}

function show(v: unknown): string {
  if (typeof v === "number") return Object.is(v, -0) ? "-0" : String(v);
  if (typeof v === "function") return "[함수]";
  try {
    return JSON.stringify(v, (_k, x: unknown) => (typeof x === "number" && !Number.isFinite(x) ? String(x) : x)) ?? String(v);
  } catch {
    return String(v);
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && Object.getPrototypeOf(v) === Object.prototype;
}

/** vitest toEqual 규칙: 원시값은 Object.is, 배열은 길이·원소, 객체는 undefined 값 키를 무시하고 비교 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = (o: Record<string, unknown>) => Object.keys(o).filter((k) => o[k] !== undefined);
    const ka = keys(a);
    const kb = keys(b);
    return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

function requireNumber(v: unknown, matcher: string, role: string): number {
  if (typeof v !== "number") throw new AssertionError(`${matcher}: ${role} 값이 숫자가 아니다 (${show(v)})`);
  return v;
}

function check(pass: boolean, message: () => string): void {
  if (!pass) throw new AssertionError(message());
}

function throwsMatching(received: unknown, expected?: string | RegExp): void {
  if (typeof received !== "function") throw new AssertionError("toThrow: 함수를 넘겨야 한다");
  let thrown: unknown;
  let didThrow = false;
  try {
    (received as () => unknown)();
  } catch (e) {
    didThrow = true;
    thrown = e;
  }
  check(didThrow, () => "예외가 나야 하는데 나지 않았다");
  if (expected === undefined) return;
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  const ok = typeof expected === "string" ? message.includes(expected) : expected.test(message);
  check(ok, () => `예외 메시지 ${show(message)}가 ${String(expected)}와 맞지 않는다`);
}

function matchers(received: unknown) {
  return {
    toBe(expected: unknown) {
      check(Object.is(received, expected), () => `${show(received)}는 ${show(expected)}여야 한다`);
    },
    toEqual(expected: unknown) {
      check(deepEqual(received, expected), () => `${show(received)}는 ${show(expected)}와 같아야 한다`);
    },
    toBeCloseTo(expected: number, numDigits = 2) {
      const r = requireNumber(received, "toBeCloseTo", "받은");
      const e = requireNumber(expected, "toBeCloseTo", "기대");
      const pass = (r === Infinity && e === Infinity) || (r === -Infinity && e === -Infinity) || Math.abs(e - r) < 10 ** -numDigits / 2;
      check(pass, () => `${show(r)}는 ${show(e)}에 가까워야 한다 (소수 ${numDigits}자리, 차이 ${show(Math.abs(e - r))})`);
    },
    toBeLessThan(expected: number) {
      const r = requireNumber(received, "toBeLessThan", "받은");
      const e = requireNumber(expected, "toBeLessThan", "기대");
      check(r < e, () => `${show(r)} < ${show(e)} 이어야 한다`);
    },
    toBeLessThanOrEqual(expected: number) {
      const r = requireNumber(received, "toBeLessThanOrEqual", "받은");
      const e = requireNumber(expected, "toBeLessThanOrEqual", "기대");
      check(r <= e, () => `${show(r)} ≤ ${show(e)} 이어야 한다`);
    },
    toHaveLength(expected: number) {
      const len = (received as { length?: unknown } | null | undefined)?.length;
      if (typeof len !== "number") throw new AssertionError(`toHaveLength: length가 없는 값이다 (${show(received)})`);
      check(len === expected, () => `길이가 ${expected}여야 하는데 ${len}이다`);
    },
    toThrow(expected?: string | RegExp) {
      throwsMatching(received, expected);
    },
  };
}

export type Matchers = ReturnType<typeof matchers>;

/** 지원하지 않는 matcher(.not 포함)에 접근하면 바로 오류 → 그 테스트는 실패로 처리된다 */
export function expect(received: unknown): Matchers {
  return new Proxy(matchers(received), {
    get(target, prop, receiver) {
      if (typeof prop === "string" && !(prop in target)) {
        throw new AssertionError(`브라우저 채점기는 expect().${prop}를 지원하지 않는다 (PC에서 npm run test:mine으로 확인)`);
      }
      return Reflect.get(target, prop, receiver) as unknown;
    },
  });
}
