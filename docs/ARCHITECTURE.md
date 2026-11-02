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
│   │   │   ├── implStatus.ts # mine 테스트 상태 (빌드 전용, 결과 JSON 읽기)
│   │   │   └── playground/   # 코드 연습장: 브라우저 채점(워커·vitest shim)·초안·제출 (§6.1)
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
- mine 실행 중 예외가 나면 에러 메시지를 데모 안에 보여주고 reference로 되돌릴 수 있게 한다 (5주차 `EpipolarDemo`부터, 2026-11-02). 데모는 함수마다 따로 try로 감싸서, 한 함수가 TODO여도 나머지 결과는 그린다. 내 구현에서 오류가 나면 "정답으로 보기" 버튼이 토글을 reference로 바꾼다.
- 비교 그리기: 5주차 데모는 같은 구현 안에서 "8점 전체"와 "RANSAC" 결과를 겹쳐 그린다. 내 구현과 정답을 동시에 겹쳐 그리는 모드는 필요해지면 붙인다 (TASKS "나중에").
- 사용자 파일: 5주차 "내 사진으로 해보기"는 사용자가 고른 JSON(대응점·calib)을 브라우저 안에서만 읽고 저장하지 않는다. 형식 검사는 `lib/matchesFile.ts` 한 곳에서 한다.

## 6. 과제 함수와 CI

- 시그니처, 입출력 타입, 수식 힌트 주석은 AI가 작성한다. 본문은 내가 작성한다.
- 새 함수는 `core/tests/`에 테스트를 먼저 만들고 reference로 통과를 확인한다.
- 테스트는 구현체를 인자로 받아 `ref`·`mine` 양쪽에 돈다 (작성법은 LESSON_TEMPLATE §4).
- **CI 순서 (GitHub Actions)**
  1. `test:ref` — **통과 조건**. 실패하면 배포 중단. `--passWithNoTests`.
  1-1. `test:site` — **통과 조건**. 사이트 로직과 브라우저 채점 parity(§6.1).
  2. **mine 구문 검사** (`scripts/check-mine-syntax.mjs`) — `core/mine/*.ts`를 TypeScript 파서로 검사해 `site/src/data/mine-syntax.json`에 기록한다. CI에서만 실패한 파일을 TODO 스텁(reference와 같은 함수 이름)으로 바꿔 끼운다. 로컬에서는 파일을 절대 바꾸지 않는다. github.dev에서 반쯤 짠 코드를 push해도 배포가 막히지 않게 하기 위함.
  3. `test:mine` — `--reporter=json --outputFile=site/src/data/test-results.json --passWithNoTests`. 실패해도 계속 (`|| true`). mine은 TODO 상태가 정상이기 때문. `implStatus.ts`가 두 결과 파일을 합쳐 읽는다.
  4. **mine import 검사** (`check-mine-syntax.mjs --after-tests`) — 구문은 맞지만 import가 깨진 주차(결과 JSON에서 "실패, 테스트 0개")를 찾아 `mine-syntax.json`에 `import 오류`로 덧붙이고, CI에서만 같은 방식으로 스텁을 끼운다. 그대로 두면 `impl.ts`의 mine glob 때문에 build가 실패한다.
  5. `astro build --root site` → Pages 배포.
- 테스트 파일은 `core/tests/loadImpl.ts`의 `loadImpl("wNN")`으로 `IMPL` 쪽 구현 하나만 불러온다. ref 실행이 mine 파일의 오류에 영향받지 않게 하기 위함 (LESSON_TEMPLATE §4).
- 손코딩은 어느 기기에서든 한다: PC는 `npm run test:mine`, 폰·패드는 과제 카드의 **코드 연습장**(아래), github.dev도 그대로 쓸 수 있다.

### 6.1 코드 연습장 (사이트 안 편집·채점·제출) — 결정 변경 2026-11-02

원래 결정("사이트 안 코드 에디터는 두지 않는다, github.dev로 대체")을 뒤집었다. github.dev는 터미널이 없고 CI 피드백이 몇 분 걸려 폰 손코딩이 사실상 불가능했기 때문. 설계는 서브에이전트 2개 안을 비교해 정했다.

- **위치**: 과제 카드(`TaskCard.astro`)의 `CodePlayground` island. 편집 단위는 `core/mine/wNN.ts` 파일 전체, 한 페이지에 한 번에 하나만 연다.
- **채점**: `site/src/lib/playground/`. 실행마다 새 Web Worker를 만들어 `core/tests` 파일을 **그대로** 돌린다 (케이스 중복 없음).
  - sucrase로 타입만 지우고 `require` 허용 목록(`ml-matrix`, `../reference/wNN`, `@core/prev/wNN`, `../types`)으로 실행. 타입 검사는 하지 않는다.
  - `vitePlugin.ts`가 core/tests 안의 `"vitest"` → `shim.ts`, `"./loadImpl"` → `draftImpl.ts`로 바꿔 끼운다 (페이지·워커 빌드, vitest `site` project).
  - 5초 넘으면 워커를 끊는다 (무한 루프). 새 워커를 쓰는 이유: 테스트 파일은 모듈 캐시 때문에 한 번만 등록된다.
  - **판정이 PC와 같아야 한다**: `shim.test.ts`가 matcher를 진짜 vitest expect와 나란히 비교하고, `parity.test.ts`가 reference 소스를 이 경로로 돌려 전부 통과·케이스 수 일치를 확인한다. 둘 다 CI `test:site`(통과 조건)에 들어간다.
- **분기점은 그대로**: 초안 결과는 데모·배지에 영향이 없다. 배지와 데모 기본값은 계속 CI의 `test-results.json`(§5)으로만 정한다.
- **제출**: GitHub Contents API로 그 파일을 main에 커밋 → CI가 테스트·배포 → 배지 갱신.
  - 원격 파일 내용이 초안의 기준(`baseHash`)과 다르면 커밋하지 않고 "저장소 버전으로 바꾸기 / 그래도 덮어쓰기"를 묻는다 (PC에서 push한 코드 보호).
  - 사이트에서 제출하면 main이 앞서므로, PC에서 작업하기 전에 `git pull`(작업 브랜치는 main을 merge)한다.
  - **main에 브랜치 보호(PR 필수)를 걸지 않는다.** 걸면 제출이 422로 거절된다.
  - AI 작업 브랜치는 기존 `core/mine` 파일을 고치지 않는다 (사이트 제출과 merge 충돌 방지, CLAUDE.md 규칙과 같음).
  - 제출 후 30분이 지나도 배포가 따라오지 않으면 "저장소가 바뀜"으로 본다 (배포 실패·그 뒤 PC push 대비).
- **한계**: 초안은 워커 전역에서 실행되므로 마음먹으면 채점을 속일 수 있다. 브라우저 통과는 연습용 신호이고, 배지는 CI 결과만 믿는다.
- **워커는 같은 출처 파일로만 만든다** (blob·inline 금지). 같은 출처 URL 워커는 페이지 meta CSP를 물려받지 않아 `new Function`에 `'unsafe-eval'`이 필요 없다. blob 워커로 바꾸면 페이지 CSP를 물려받아 채점이 막힌다.
- 번들: 화면 쪽 약 6KB gz, 채점 워커(sucrase·ml-matrix·테스트 포함) 약 65KB gz는 "테스트 실행"을 누를 때만 받는다.

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
- 코드 초안은 진도와 다른 키 `slam-drafts`에 둔다 (`DraftStore`, 주차별 `{ code, baseHash, pending, updatedAt }`, 초안당 10만 자 제한). 타이핑마다 진도 JSON을 다시 쓰지 않고, Gist 동기화 때 따로 다루기 위함.
- 3~4주차 (기기 간 불편이 실제로 생길 때): Gist 동기화 추가.

**Gist 구현**
- 비공개 Gist 하나에 `progress.json`을 저장한다.
- 항상 localStorage에 먼저 저장하고, **동기화 버튼**으로 Gist와 맞춘다. 자동 오프라인 큐는 두지 않는다.
- 충돌 확인은 기기 시계가 아니라 Gist API의 `updated_at`으로 한다. GET은 캐시될 수 있으므로 `fetch(..., { cache: "no-store" })`를 쓰고, 마지막으로 본 값은 PATCH 응답의 `updated_at`으로 갱신한다. 원격이 마지막으로 본 값보다 새로우면 덮어쓰지 않고 확인을 띄운다.
- 토큰이 없으면 localStorage 전용 모드로 동작한다.
- Gist 동기화가 붙기 전까지는 진도가 기기마다 따로 저장된다. 그동안 **진도 기준 기기는 PC**로 한다.

**토큰 보안**
- fine-grained PAT, 권한은 Gists 읽기·쓰기 하나만, 만료 90일. (발급 시 해당 권한이 없으면 classic 토큰 `gist` 스코프만.)
- **제출용 토큰(§6.1)은 따로 둔다** (결정 변경 2026-11-02): fine-grained PAT(`github_pat_`만 받는다, classic 거절), 저장소는 `slam_guide` 하나, 권한은 Contents 읽기·쓰기 하나, 만료 90일. 키 `slam-github-token`. 채점 워커에는 넘기지 않는다.
  - 위험: 이 토큰이 새면 `site/` 코드도 고쳐 main에 push할 수 있고, 배포되면 같은 origin의 Gist 토큰까지 읽힐 수 있다 (Workflows 권한이 없어 CI 파일은 못 고친다). 그래서 CSP는 미루지 않고 Gist 동기화 전에 넣는다.
- 토큰은 해당 기기 localStorage에만 둔다. 로그·Gist·URL에 절대 쓰지 않는다.
- `yunmin1130.github.io` 아래의 모든 Pages 저장소는 origin(=localStorage)을 공유한다. 같은 계정에 신뢰할 수 없는 Pages를 두지 않는다 (필요해지면 커스텀 도메인으로 분리).
- 런타임 CDN 스크립트를 쓰지 않는다 (§2). CSP는 첫 배포가 안정된 뒤 프로덕션 빌드에만 meta로 넣는다:
  ```
  default-src 'self'; script-src 'self' (+Astro 인라인 스크립트 해시);
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
  connect-src 'self' https://api.github.com; worker-src 'self'; object-src 'none'; base-uri 'self'
  ```
  `style-src 'unsafe-inline'`은 KaTeX의 인라인 `style` 속성 때문에 필요하다. 인라인 스크립트(island 하이드레이션)는 해시로 허용한다. 다크 모드는 `prefers-color-scheme`만 따르므로 스크립트가 없다.

## 8. 모바일 우선 UI 원칙

- 기준 화면: iPhone 14 Pro 세로, 393px 폭. 레이아웃은 1단 세로 흐름.
- 터치 영역은 최소 44×44px. 슬라이더 손잡이는 크게.
- 마우스 호버에 의존하는 기능 금지. 툴팁은 탭으로 연다.
- 3D 뷰어(`viewer3d/Viewer3D.tsx`): 처음에는 조작이 꺼져 있어 그림 위에서도 페이지가 스크롤된다. "탭해서 돌리기"를 누르면 한 손가락 회전·두 손가락 확대가 켜지고, 바깥을 누르거나 "다 봤어"로 끈다 (4주차, 2026-11-02). 이동(pan)은 장면이 화면 밖으로 사라지기 쉬워서 넣지 않았다.
- 3D 뷰어 좌표: 장면·카메라 위치·회전 중심 모두 수학 좌표(z 위)로 받는다. 카메라 좌표계(x 오른쪽, y 아래, z 앞)의 점은 데모가 변환 함수(예: `lib/projectionScene.ts`의 `cameraToWorld`)로 바꿔 넘긴다.
- 성능: 데모는 화면에 보일 때만 로드·렌더링. 점 구름은 수천 개 이하로 다운샘플. devicePixelRatio는 2로 제한. 페이지당 WebGL Canvas 1개.
- 노치·다이내믹 아일랜드 영역은 safe-area inset으로 피한다.
- 다크 모드 지원 (밤에 아기 재우면서 보는 상황 고려).
- 대시보드는 "마지막 세션 + 다음 할 일 1개"를 맨 위에 보여준다 (복귀 진입점).

## 9. 기기별 역할

| 기기 | 역할 |
| --- | --- |
| iPhone 14 Pro | 개념 읽기, 데모 조작, 체크 질문, 코드 연습장으로 짧은 과제 (주 사용) |
| iPad | 손으로 수식 풀기, 데모, 코드 연습장으로 과제 |
| PC (Windows) | 사이트 개발(Claude Code), core/mine 구현, PC Python 영상 처리, WSL2/Docker에서 C++ VO·ORB-SLAM3 |

## 10. 하지 않는 것

- 백엔드 서버, 로그인, 결제 (강의 판매를 고민할 때 다시 검토)
- 로봇에서의 실시간 SLAM 구동 (마지막 보너스 목표)
- 대용량 데이터셋 사이트 업로드 (긴 데이터는 드래그앤드롭으로 로컬 파일 사용)
