# ARCHITECTURE

SLAM 학습 사이트의 구조 설계 문서. 백엔드 없는 정적 사이트로, 수학 계산은 브라우저에서 돈다. 무거운 영상 처리(캘리브레이션, 특징점 추출·매칭)는 PC Python에서 미리 하고 결과 JSON만 사이트로 가져온다.

## 1. 목표와 원칙

- **공부 + 포트폴리오 + 사이드 프로젝트**를 하나로 합친다.
- **시각화·UI는 AI가, 수학 코어는 내가 직접** 구현한다.
- **모바일 우선**: iPhone 14 Pro 세로(약 393×852 CSS px)에서 읽고 조작하는 것이 1순위. iPad·데스크톱은 그다음.
- **백엔드 없음**: 유지보수 부담을 없앤다. 기기 간 동기화는 GitHub Gist로 해결한다.
- 육아로 몇 주 멈췄다 돌아와도 바로 이어갈 수 있게, 모든 결정과 규칙은 문서로 남긴다.

## 2. 기술 스택

| 영역 | 선택 | 이유 |
| --- | --- | --- |
| 사이트 프레임워크 | Astro + MDX | 글 중심 학습 사이트에 데모 컴포넌트를 끼워 넣기 좋음 |
| 인터랙티브 컴포넌트 | React (Astro islands) | 데모가 있는 부분만 JS 로드 → 모바일에서 가벼움 |
| 언어 | TypeScript | core 함수 시그니처와 테스트를 타입으로 고정 |
| 3D | Three.js (react-three-fiber) | 카메라 프러스텀, 점 구름, 궤적. iOS WebGL 컨텍스트 제한 때문에 **페이지당 Canvas 1개**, `frameloop="demand"` |
| 그래프 | uPlot 또는 손으로 그린 SVG | Plotly(약 3.5MB)는 모바일에 무거움 |
| 영상 처리 | PC Python OpenCV (`datasets/`) | 캘리브레이션·특징점은 PC에서 JSON으로 내보냄. OpenCV.js는 선택 (8~10MB, 기본 빌드에 `fisheye` 없음) |
| 선형대수 | ml-matrix | SVD, 역행렬 등 기본 연산. thin SVD 함정은 LESSON_TEMPLATE §4 |
| 수식 | KaTeX (remark-math + rehype-katex) | 빌드 타임 렌더링 → 런타임 JS 0. Astro 7 기본 처리기(Sätteri)엔 KaTeX 플러그인이 없어 `markdown.processor: unified()`로 쓴다. katex는 rehype-katex와 같은 0.16.x로 맞춘다 (CSS·렌더러 버전 일치) |
| 테스트 | Vitest (`ref`·`mine` 두 project) | §6 참고 |
| 배포 | GitHub Pages + GitHub Actions | 무료, push 시 자동 배포, 포트폴리오 링크 |
| C++ (12주차~) | C++17 + Eigen + OpenCV, CMake, GTest | 채용 시장 요구. Windows에서는 WSL2 Ubuntu 22.04 또는 Docker |

- 외부 스크립트는 런타임 CDN으로 불러오지 않고 전부 번들·셀프호스팅한다 (§7 토큰 보안).
- Astro `site`는 `https://yunmin1130.github.io`, `base`는 `/slam_guide/`로 설정한다. 내부 링크와 `public/data` 경로는 모두 `import.meta.env.BASE_URL`을 붙여 참조한다.

## 3. 폴더 구조

```
slam_guide/
├── CLAUDE.md                 # Claude Code 핵심 규칙 (200자 이하)
├── docs/                     # 상세 설계 문서
│   ├── ARCHITECTURE.md
│   ├── CURRICULUM.md
│   ├── LESSON_TEMPLATE.md
│   ├── DATA.md
│   ├── WORKFLOW.md           # 진행 단계·검토 관문
│   └── TASKS.md              # 0주차 플랫폼 체크리스트
├── site/                     # Astro 사이트
│   ├── src/
│   │   ├── content/lessons/  # 주차별 MDX (w01-vectors.mdx …)
│   │   ├── components/
│   │   │   ├── demos/        # 레슨별 데모 컴포넌트
│   │   │   ├── viewer3d/     # 공용 3D 뷰어
│   │   │   ├── lesson/       # LABox, TaskCard, 체크 질문 등
│   │   │   └── ui/           # 슬라이더, 토글 등 공용 UI
│   │   ├── data/
│   │   │   └── test-results.json  # CI가 생성 (mine 테스트 결과)
│   │   ├── lib/
│   │   │   ├── storage.ts    # 저장 계층 (유일한 저장 진입점)
│   │   │   ├── impl.ts       # mine/reference 선택 로직 (유일한 분기점)
│   │   │   └── implStatus.ts # mine 테스트 상태 (빌드 전용, 결과 JSON 읽기)
│   │   └── pages/            # 대시보드, 레슨 라우트
│   └── public/data/          # 작은 샘플 데이터 (DATA §1 상한)
├── core/                     # 수학 코어 (TypeScript, 사이트와 독립)
│   ├── mine/                 # ✍️ 내가 직접 구현 (AI는 시그니처·힌트·TODO만)
│   ├── reference/            # 정답 구현 (AI 작성, 테스트로 검증)
│   └── tests/                # 테스트 (mine, reference 모두 대상)
├── cpp/                      # C++ 미니 VO (12주차~, 별도 CMake 프로젝트)
├── datasets/                 # 변환·캘리브레이션·매칭 스크립트 (PC Python 전용)
├── package.json              # 루트: npm workspaces(site) + core 의존성(ml-matrix) + 스크립트
├── package-lock.json
├── vitest.config.ts          # 루트: ref·mine projects, IMPL env, @core alias
└── tsconfig.json             # 루트: @core/* paths
```

**패키지 구조**: 의존성은 루트에서 설치한다(npm workspaces로 hoist). core는 위로 올라가며 모듈을 찾으므로 `site/node_modules`에만 있으면 ml-matrix를 못 찾는다. Astro는 `astro build --root site`로 실행하고, `@core` 별칭은 tsconfig `paths`와 Vite `resolve.alias` 양쪽에 둔다 (Vite는 tsconfig paths를 자동으로 읽지 않는다).

**함수 → 파일 매핑**: 레슨 주차가 파일을 정한다. `w04` 레슨의 `tasks`는 `core/mine/w04.ts`, `core/reference/w04.ts`, `core/tests/w04.test.ts`에 있다. TaskCard는 frontmatter `week`와 함수명으로 위치를 찾는다.

**이전 주차 함수 재사용**: mine·reference 모두 이전 주차 함수는 `@core/prev/w{NN}` 별칭으로 import한다.
- 기본값: `@core/prev/*` → `core/reference/*`. 내 6주차 버그가 11주차로 번지지 않게 해서, 실패하면 이번 주 함수만 의심하면 된다.
- `CORE_PREV=mine`일 때: `@core/prev/*` → `core/mine/*`. **M1 리포트를 낼 때** 전부 내 구현으로 이어서 돌려보는 용도다 (`test:all-mine` 스크립트).
- 같은 주차 안의 함수끼리는 상대 경로로 import한다.

`core/`는 `site/` 밖에 있으므로 tsconfig `paths` 별칭(`@core/*`)과 Vite `server.fs.allow`에 등록한다.

## 4. 데이터 흐름

```
레슨 MDX ──(삽입)──> 데모 컴포넌트 ──(호출)──> lib/impl.ts ──> core/mine 또는 core/reference
                          │                                         │
                          └──────────── 결과 렌더링 <───────────────┘

PC Python(datasets/) ──> JSON (캘리브레이션, 대응점) ──> public/data ──> 데모
```

1. 레슨 MDX가 `<ProjectionDemo />` 같은 데모 컴포넌트를 삽입한다.
2. 데모는 core 함수를 직접 import하지 않고 `lib/impl.ts`를 통해 가져온다.
3. `impl.ts`는 현재 토글 상태에 따라 mine 또는 reference 구현을 반환한다.
4. 데모는 결과를 3D 뷰어·그래프로 렌더링한다.

## 5. mine / reference 토글

- `core/mine/`과 `core/reference/`는 **같은 파일명, 같은 함수 시그니처**를 갖는다.
- `core/mine`의 미구현 함수는 `throw new Error("TODO")`를 던진다. 미사용 파라미터는 lint 예외로 둔다.
- **읽기만(`read_only`) 함수는 mine에서 reference를 re-export한다** (`export { undistort } from "@core/reference/w04"`). TODO 스텁으로 두면 그 함수를 부르는 mine 함수(예: `smallBA` → `levenbergMarquardt`)가 깨진다.
- 토글 기본값은 `test-results.json`에서 읽는다. 키는 `w{NN}/{함수명}`이다 (테스트 제목 규칙은 LESSON_TEMPLATE §4).
  - 해당 함수의 mine 테스트가 전부 통과 → mine
  - 실패·TODO·`syntax-error`·결과 없음 → reference + "아직 내 구현 아님" 배지
  - 주차 파일 전체가 import 실패해 결과가 비면 그 주차 전체를 reference로 처리한다.
- `test-results.json`과 `mine-syntax.json`은 생성물이라 gitignore한다. 빌드 전용 `lib/implStatus.ts`가 `import.meta.glob`으로 읽어서, 파일이 없으면 빈 결과로 처리한다 (로컬 빌드에서도 깨지지 않음). 상태는 `.astro`에서 구해 props로 넘긴다. `impl.ts`는 클라이언트 번들에 들어가므로 결과 JSON을 import하지 않는다 (G1, 2026-11-01).
- 예외: `components/lesson/context.ts`는 읽기만 카드에 보여줄 reference **소스 문자열**을 빌드 시점에 `?raw`로 읽는다. 실행하지 않으므로 분기점이 아니다.
- mine 실행 중 예외가 나면 에러 메시지를 데모 안에 보여주고 reference로 되돌릴 수 있게 한다 (5주차에 추가).
- 비교 모드(두 결과 겹쳐 그리기)는 5주차에 추가한다.

## 6. 과제 함수와 CI

- 시그니처, 입출력 타입, 수식 힌트 주석은 AI가 작성한다. 본문은 내가 작성한다.
- 새 함수는 `core/tests/`에 테스트를 먼저 만들고 reference로 통과를 확인한다.
- 테스트는 구현체를 인자로 받아 `ref`·`mine` 양쪽에 돈다 (작성법은 LESSON_TEMPLATE §4).
- **CI 순서 (GitHub Actions)**
  1. `test:ref` — **통과 조건**. 실패하면 배포 중단. `--passWithNoTests`.
  2. **mine 구문 검사** (`scripts/check-mine-syntax.mjs`) — `core/mine/*.ts`를 TypeScript 파서로 검사해 `site/src/data/mine-syntax.json`에 기록한다. CI에서만 실패한 파일을 TODO 스텁(reference와 같은 함수 이름)으로 바꿔 끼운다. 로컬에서는 파일을 절대 바꾸지 않는다. github.dev에서 반쯤 짠 코드를 push해도 배포가 막히지 않게 하기 위함.
  3. `test:mine` — `--reporter=json --outputFile=site/src/data/test-results.json --passWithNoTests`. 실패해도 계속 (`|| true`). mine은 TODO 상태가 정상이기 때문. `implStatus.ts`가 두 결과 파일을 합쳐 읽는다.
  4. **mine import 검사** (`check-mine-syntax.mjs --after-tests`) — 구문은 맞지만 import가 깨진 주차(결과 JSON에서 "실패, 테스트 0개")를 찾아 `mine-syntax.json`에 `import 오류`로 덧붙이고, CI에서만 같은 방식으로 스텁을 끼운다. 그대로 두면 `impl.ts`의 mine glob 때문에 build가 실패한다.
  5. `astro build --root site` → Pages 배포.
- 테스트 파일은 `IMPL` 값에 따라 한쪽 구현만 `await import()`로 불러온다. ref 실행이 mine 파일의 오류에 영향받지 않게 하기 위함 (LESSON_TEMPLATE §4).
- 손코딩은 PC에서 한다. iPad에서는 github.dev(또는 Codespaces)로 `core/mine`을 편집하고 push하면 CI가 결과를 반영한다. 사이트 안 코드 에디터는 두지 않는다.

## 7. 저장 계층 (`lib/storage.ts`)

모든 저장은 이 파일만 거친다. 나중에 Supabase나 라즈베리파이 서버로 바꿀 때 이 파일만 교체한다.

```ts
interface Storage {
  load(): Promise<Progress>;
  save(p: Progress): Promise<void>;
}

interface Progress {
  lessons: Record<string, LessonState>;    // key: "w04"
}

interface LessonState {
  status: "todo" | "in-progress" | "done";
  checked: string[];                       // 완료한 세션 id·체크 질문 id
  minutes?: number;                        // 실제 소요 시간 (일정 재추정용)
  lastVisited?: string;                    // ISO 시간, 복귀 진입점 표시용
  notes?: string;
}
```

**단계적 구현**
- 0주차: **localStorage 전용**.
- 3~4주차 (기기 간 불편이 실제로 생길 때): Gist 동기화 추가.

**Gist 구현**
- 비공개 Gist 하나에 `progress.json`을 저장한다.
- 항상 localStorage에 먼저 저장하고, **동기화 버튼**으로 Gist와 맞춘다. 자동 오프라인 큐는 두지 않는다.
- 충돌 확인은 기기 시계가 아니라 Gist API의 `updated_at`으로 한다. GET은 캐시될 수 있으므로 `fetch(..., { cache: "no-store" })`를 쓰고, 마지막으로 본 값은 PATCH 응답의 `updated_at`으로 갱신한다. 원격이 마지막으로 본 값보다 새로우면 덮어쓰지 않고 확인을 띄운다.
- 토큰이 없으면 localStorage 전용 모드로 동작한다.
- Gist 동기화가 붙기 전까지는 진도가 기기마다 따로 저장된다. 그동안 **진도 기준 기기는 PC**로 한다.

**토큰 보안**
- fine-grained PAT, 권한은 Gists 읽기·쓰기 하나만, 만료 90일. (발급 시 해당 권한이 없으면 classic 토큰 `gist` 스코프만.)
- 토큰은 해당 기기 localStorage에만 둔다. 로그·Gist·URL에 절대 쓰지 않는다.
- `yunmin1130.github.io` 아래의 모든 Pages 저장소는 origin(=localStorage)을 공유한다. 같은 계정에 신뢰할 수 없는 Pages를 두지 않는다 (필요해지면 커스텀 도메인으로 분리).
- 런타임 CDN 스크립트를 쓰지 않는다 (§2). CSP는 첫 배포가 안정된 뒤 프로덕션 빌드에만 meta로 넣는다:
  ```
  default-src 'self'; script-src 'self' (+Astro 인라인 스크립트 해시);
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
  connect-src 'self' https://api.github.com; object-src 'none'; base-uri 'self'
  ```
  `style-src 'unsafe-inline'`은 KaTeX의 인라인 `style` 속성 때문에 필요하다. 인라인 스크립트(island 하이드레이션)는 해시로 허용한다. 다크 모드는 `prefers-color-scheme`만 따르므로 스크립트가 없다.

## 8. 모바일 우선 UI 원칙

- 기준 화면: iPhone 14 Pro 세로, 393px 폭. 레이아웃은 1단 세로 흐름.
- 터치 영역은 최소 44×44px. 슬라이더 손잡이는 크게.
- 마우스 호버에 의존하는 기능 금지. 툴팁은 탭으로 연다.
- 3D 뷰어: 한 손가락 회전, 두 손가락 확대·이동. 페이지 스크롤과 충돌하지 않게 뷰어를 탭해야 조작이 활성화되도록 한다 (4주차에 추가, 1주차 첫 뷰어는 회전만).
- 성능: 데모는 화면에 보일 때만 로드·렌더링. 점 구름은 수천 개 이하로 다운샘플. devicePixelRatio는 2로 제한. 페이지당 WebGL Canvas 1개.
- 노치·다이내믹 아일랜드 영역은 safe-area inset으로 피한다.
- 다크 모드 지원 (밤에 아기 재우면서 보는 상황 고려).
- 대시보드는 "마지막 세션 + 다음 할 일 1개"를 맨 위에 보여준다 (복귀 진입점).

## 9. 기기별 역할

| 기기 | 역할 |
| --- | --- |
| iPhone 14 Pro | 개념 읽기, 데모 조작, 체크 질문 (주 사용) |
| iPad | 손으로 수식 풀기, 데모, github.dev로 가벼운 과제 |
| PC (Windows) | 사이트 개발(Claude Code), core/mine 구현, PC Python 영상 처리, WSL2/Docker에서 C++ VO·ORB-SLAM3 |

## 10. 하지 않는 것

- 백엔드 서버, 로그인, 결제 (강의 판매를 고민할 때 다시 검토)
- 사이트 안 코드 에디터 (github.dev로 대체)
- 로봇에서의 실시간 SLAM 구동 (마지막 보너스 목표)
- 대용량 데이터셋 사이트 업로드 (긴 데이터는 드래그앤드롭으로 로컬 파일 사용)
