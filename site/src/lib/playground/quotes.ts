/** iPhone "스마트 구두점"이 바꾼 둥근 따옴표를 곧은 따옴표로 되돌린다 (화면 쪽에서 쓰므로 sucrase와 분리) */
export function normalizeQuotes(source: string): { code: string; replaced: boolean } {
  const code = source.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  return { code, replaced: code !== source };
}
