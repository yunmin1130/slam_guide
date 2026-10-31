# ARCHITECTURE

SLAM 학습 사이트의 구조 설계 문서. 백엔드 없는 정적 사이트로, 모든 계산은 브라우저에서 돈다.

## 1. 목표와 원칙

- **공부 + 포트폴리오 + 사이드 프로젝트**를 하나로 합친다.
- **시각화·UI는 AI가, 수학 코어는 내가 직접** 구현한다.
- **모바일 우선**: iPhone 14 Pro 세로(약 393×852 CSS px)에서 읽고 조작하는 것이 1순위. iPad·데스크톱은 그다음.
- **백엔드 없음**: 유지보수 부담을 없앤다. 동기화는 GitHub Gist로 해결한다.
- 육아로 몇 주 멈췄다 돌아와도 바로 이어갈 수 있게, 모든 결정과 규칙은 문서로 남긴다.

## 2. 기술 스택

| 영역 | 선택 | 이유 |
| --- | --- | --- |
| 사이트 프레임워크 | Astro + MDX | 글 중심 학습 사이트에 데모 컴포넌트를 끼워 넣기 좋음 |
| 인터랙티브 컴포넌트 | React (Astro islands) | 데모가 있는 부분만 JS 로드 → 모바일에서 가벼움 |
| 언어 | TypeScript | core 함수 시그니처와 테스트를 타입으로 고정 |
| 3D | Three.js (react-three-fiber) | 카메라 프러스텀, 점 구름, 궤적 표시 |
| 그래프 | Plotly (또는 가벼운 대안) | 수렴 곡선, 오차 그래프 |
| 영상 처리 | OpenCV.js | 특징점·매칭은 라이브러리에 맡김 (필요한 레슨에서만 지연 로드) |
| 선형대수 | ml-matrix | SVD, 역행렬 등 기본 연산 |
| 수식 | KaTeX | 레슨 본문 수식 렌더링 |
| 브라우저 코드 에디터 | CodeMirror 6 | 터치 지원이 비교적 좋음 (모바일은 읽기 위주) |
| 테스트 | Vitest | core/tests 실행 |
| 배포 | GitHub Pages + GitHub Actions | 무료, push 시 자동 배포, 포트폴리오 링크로 사용 |

## 3. 폴더 구조

```
slam-lab/
├── CLAUDE.md                 # Claude Code 핵심 규칙 (200자 이하)
├── docs/                     # 상세 설계 문서
│   ├── ARCHITECTURE.md
│   ├── CURRICULUM.md
│   ├── LESSON_TEMPLATE.md
│   └── DATA.md
├── site/                     # Astro 사이트
│   ├── src/
│   │   ├── content/lessons/  # 주차별 MDX (w01-vectors.mdx …)
│   │   ├── components/
│   │   │   ├── demos/        # 레슨별 데모 컴포넌트
│   │   │   ├── viewer3d/     # 공용 3D 뷰어
│   │   │   ├── lesson/       # LA박스, 과제 카드, 체크 질문 등
│   │   │   └── ui/           # 슬라이더, 토글 등 공용 UI
│   │   ├── lib/
│   │   │   ├── storage.ts    # 저장 계층 (유일한 저장 진입점)
│   │   │   └── impl.ts       # mine/reference 선택 로직
│   │   └── pages/            # 대시보드, 레슨 라우트
│   └── public/data/          # 작은 샘플 데이터
├── core/                     # 수학 코어 (TypeScript, 사이트와 독립)
│   ├── mine/                 # ✍️ 내가 직접 구현 (AI는 시그니처·힌트·TODO만)
│   ├── reference/            # 정답 구현 (AI 작성, 테스트로 검증)
│   └── tests/                # 테스트 (mine, reference 모두 대상)
└── datasets/                 # JetBot·공개 데이터셋 변환 스크립트 (PC 전용)
```

## 4. 데이터 흐름

```
레슨 MDX ──(삽입)──> 데모 컴포넌트 ──(호출)──> lib/impl.ts ──> core/mine 또는 core/reference
                          │                                         │
                          └──────────── 결과 렌더링 <───────────────┘
```

1. 레슨 MDX가 `<ProjectionDemo />` 같은 데모 컴포넌트를 삽입한다.
2. 데모는 core 함수를 직접 import하지 않고 `lib/impl.ts`를 통해 가져온다.
3. `impl.ts`는 현재 토글 상태에 따라 mine 또는 reference 구현을 반환한다.
4. 데모는 결과를 3D 뷰어·그래프로 렌더링한다.

## 5. mine / reference 토글

- `core/mine/`과 `core/reference/`는 **같은 파일명, 같은 함수 시그니처**를 갖는다.
- `core/mine`의 미구현 함수는 `throw new Error("TODO")`를 던진다.
- 데모 상단에 토글을 두고, 기본값은 다음 규칙을 따른다.
  - mine 구현이 테스트를 통과했으면 → mine
  - 아직 TODO면 → reference (데모가 깨지지 않게) + "아직 내 구현 아님" 배지 표시
- mine 실행 중 예외가 나면 에러 메시지를 데모 안에 보여주고 reference로 되돌릴 수 있게 한다.
- 비교 모드: 두 결과를 겹쳐 그려서 어디서 틀어지는지 눈으로 확인한다.

## 6. 과제 함수 규칙

- 시그니처, 입출력 타입, 수식 힌트 주석은 AI가 작성한다. 본문은 내가 작성한다.
- 새 함수는 `core/tests/`에 테스트를 먼저 만든다. 테스트는 reference로 먼저 통과를 확인한다.
- 테스트 결과(통과/실패)는 빌드 시 JSON으로 출력해 레슨 과제 카드와 대시보드에 표시한다.
- 손코딩은 주로 PC에서 한다. 사이트의 브라우저 에디터는 iPad용 보조 수단이다.

## 7. 저장 계층 (`lib/storage.ts`)

모든 저장은 이 파일만 거친다. 나중에 Supabase나 라즈베리파이 서버로 바꿀 때 이 파일만 교체한다.

```ts
interface Storage {
  load(): Promise<Progress>;
  save(p: Progress): Promise<void>;
}

interface Progress {
  updatedAt: string;                       // ISO 시간, 덮어쓰기 충돌 확인용
  lessons: Record<string, LessonState>;    // key: "w04"
}

interface LessonState {
  status: "todo" | "in-progress" | "done";
  checked: string[];                       // 체크한 항목 id
  notes?: string;
  code?: Record<string, string>;           // 브라우저 에디터에서 쓴 코드
}
```

**Gist 구현**
- 비공개 Gist 하나에 `progress.json`을 저장한다.
- Gist 권한만 있는 GitHub 토큰을 각 기기 브라우저에 한 번 입력한다 (localStorage 저장).
- 저장 전 원격 `updatedAt`이 내가 마지막으로 불러온 값보다 새로우면 덮어쓰지 않고 확인을 띄운다.
- 오프라인이면 localStorage에 임시 저장하고, 연결되면 업로드한다.
- 토큰이 없으면 localStorage 전용 모드로 동작한다.

## 8. 모바일 우선 UI 원칙

- 기준 화면: iPhone 14 Pro 세로, 393px 폭. 레이아웃은 1단 세로 흐름.
- 터치 영역은 최소 44×44px. 슬라이더 손잡이는 크게.
- 마우스 호버에 의존하는 기능 금지. 툴팁은 탭으로 연다.
- 3D 뷰어: 한 손가락 회전, 두 손가락 확대·이동. 페이지 스크롤과 충돌하지 않게 뷰어를 탭해야 조작이 활성화되도록 한다.
- 성능: 데모는 화면에 보일 때만 로드·렌더링. 점 구름은 수천 개 이하로 다운샘플. devicePixelRatio는 2로 제한.
- 무거운 라이브러리(OpenCV.js 등)는 해당 레슨에서만 지연 로드.
- 노치·다이내믹 아일랜드 영역은 safe-area inset으로 피한다.
- 다크 모드 지원 (밤에 아기 재우면서 보는 상황 고려).

## 9. 기기별 역할

| 기기 | 역할 |
| --- | --- |
| iPhone 14 Pro | 개념 읽기, 데모 조작, 체크 질문 (주 사용) |
| iPad | 손으로 수식 풀기, 데모, 가벼운 과제 |
| PC | 사이트 개발(Claude Code), core/mine 구현, C++ 미니 VO, JetBot 데이터 처리 |

## 10. 하지 않는 것

- 백엔드 서버, 로그인, 결제 (강의 판매를 고민할 때 다시 검토)
- 로봇에서의 실시간 SLAM 구동 (마지막 보너스 목표)
- 대용량 데이터셋 사이트 업로드 (긴 데이터는 드래그앤드롭으로 로컬 파일 사용)
