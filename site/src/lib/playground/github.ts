/**
 * 사이트에서 제출: GitHub Contents API로 core/mine 파일 하나를 main에 커밋한다.
 * 토큰은 이 저장소 전용·Contents 쓰기만 있는 fine-grained 토큰 (ARCHITECTURE §7).
 * 충돌 방지: 원격 파일 내용이 초안의 기준(baseHash)과 다르면 커밋하지 않는다 (호출하는 쪽에서 확인).
 */

export const REPO = "yunmin1130/slam_guide";
export const BRANCH = "main";
export const ACTIONS_URL = `https://github.com/${REPO}/actions`;

export interface RemoteFile {
  sha: string;
  text: string;
}

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

const API = `https://api.github.com/repos/${REPO}/contents/`;

function headers(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function explain(status: number): string {
  switch (status) {
    case 401:
      return "토큰이 틀렸거나 만료됐어. 제출 설정에서 다시 넣어줘";
    case 403:
      return "토큰 권한이 부족해 (Contents: Read and write 필요)";
    case 404:
      return "파일을 못 찾았어. 토큰의 저장소 범위에 slam_guide가 있는지 확인해줘";
    case 409:
      return "그 사이 저장소 파일이 바뀌었어. 다시 시도해줘";
    case 422:
      return "GitHub가 커밋을 거절했어 (파일이 바뀌었거나 main 브랜치 보호 규칙 때문일 수 있어)";
    default:
      return `GitHub 응답 오류 (${status})`;
  }
}

/** UTF-8 문자열 ↔ base64 (한글 주석 때문에 btoa만으로는 안 된다) */
export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function decodeBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

async function call(fetchFn: FetchFn, url: string, init: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchFn(url, { ...init, cache: "no-store" });
  } catch {
    throw new GitHubError("GitHub에 연결하지 못했어 (네트워크 확인)", 0);
  }
  if (!res.ok) throw new GitHubError(explain(res.status), res.status);
  return res.json();
}

export async function getFile(path: string, token: string, fetchFn: FetchFn = fetch): Promise<RemoteFile> {
  const data = (await call(fetchFn, `${API}${path}?ref=${BRANCH}`, { headers: headers(token) })) as {
    sha?: unknown;
    content?: unknown;
  };
  if (typeof data.sha !== "string" || typeof data.content !== "string") throw new GitHubError("GitHub 응답 모양이 이상해", 0);
  return { sha: data.sha, text: decodeBase64(data.content) };
}

export interface PutRequest {
  path: string;
  text: string;
  sha: string; // 덮어쓸 원격 파일의 sha (그 사이 바뀌었으면 GitHub가 거절한다)
  message: string;
  token: string;
}

/** 커밋 URL을 돌려준다 */
export async function putFile(req: PutRequest, fetchFn: FetchFn = fetch): Promise<string> {
  const data = (await call(fetchFn, `${API}${req.path}`, {
    method: "PUT",
    headers: { ...headers(req.token), "Content-Type": "application/json" },
    body: JSON.stringify({ message: req.message, content: encodeBase64(req.text), sha: req.sha, branch: BRANCH }),
  })) as { commit?: { html_url?: unknown } };
  return typeof data.commit?.html_url === "string" ? data.commit.html_url : ACTIONS_URL;
}
