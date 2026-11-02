/**
 * 제출 절차 (순수 흐름, GitHub 호출은 주입): 원격 파일 확인 → 충돌 검사 → 커밋.
 * 원격 내용이 초안의 기준(baseHash)과 다르면 force 없이는 커밋하지 않는다 (PC에서 push한 코드 보호).
 */
import { contentHash, normalizeNewlines } from "./draft";
import type { PutRequest, RemoteFile } from "./github";

export type SubmitResult =
  | { kind: "committed"; commitUrl: string; baseHash: string }
  | { kind: "unchanged"; baseHash: string } // 원격과 내용이 같아서 커밋할 게 없음
  | { kind: "conflict"; remote: RemoteFile }; // 원격이 기준과 다름

export interface SubmitInput {
  path: string; // "core/mine/w01.ts"
  week: string; // "w01"
  code: string;
  baseHash: string;
  token: string;
  force?: boolean; // 충돌을 알고도 덮어쓰기
}

export interface SubmitDeps {
  getFile(path: string, token: string): Promise<RemoteFile>;
  putFile(req: PutRequest): Promise<string>;
}

export function commitMessage(week: string): string {
  return `feat: ${week} 손코딩 제출 (사이트)`;
}

export async function submitDraft(input: SubmitInput, deps: SubmitDeps): Promise<SubmitResult> {
  const remote = await deps.getFile(input.path, input.token);
  const text = normalizeNewlines(input.code);
  if (normalizeNewlines(remote.text) === text) return { kind: "unchanged", baseHash: contentHash(text) };
  if (!input.force && contentHash(remote.text) !== input.baseHash) return { kind: "conflict", remote };
  const commitUrl = await deps.putFile({
    path: input.path,
    text,
    sha: remote.sha,
    message: commitMessage(input.week),
    token: input.token,
  });
  return { kind: "committed", commitUrl, baseHash: contentHash(text) };
}
