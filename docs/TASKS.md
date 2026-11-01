# TASKS

현재 진행 중인 단계의 체크리스트. 완료하면 체크하고, 단계가 끝나면 다음 단계 목록으로 교체한다 (지난 목록은 git 기록에 남는다).

## 현재: 0주차 플랫폼 뼈대 (WORKFLOW B단계)

AI 주도, PC에서만. 목표는 **최소 범위**다. 위에서부터 순서대로 하고, 미룬 항목은 아래 "나중에"에 있다.
사용자가 직접 리뷰·이해할 범위는 **`impl.ts`와 테스트 구조 두 가지**로 한정한다. 나머지는 AI가 만들고 G1이 검토한다.

### 1. 저장소와 첫 배포 (빈 페이지)
- [x] 저장소 public 확인 (무료 계정의 private 저장소는 Pages 불가)
- [x] 루트 `package.json` (npm workspaces: `site`), lockfile, Node 버전 고정(`.nvmrc` + `engines`), `.gitignore`
- [x] Astro + MDX + React 초기화 (`site/`), `site`·`base: "/slam_guide/"` 설정
- [x] GitHub Actions workflow 작성 (`.github/workflows/deploy.yml`, `permissions: pages: write, id-token: write`)
- [x] **사용자**: 저장소 Settings → Pages → Source를 "GitHub Actions"로
- [x] main에 머지·push 후 빈 페이지가 `https://yunmin1130.github.io/slam_guide/`에 뜨는지 확인 (2026-11-01)

### 2. core와 테스트
- [x] `core/{mine,reference,tests}` 구조, 루트 `tsconfig.json`(`@core/*`, `@core/prev/*` paths) + Vite `resolve.alias` + `server.fs.allow`
- [x] 루트 `vitest.config.ts`: `ref`·`mine` 두 project, `IMPL` env 주입
- [x] `skew` 1세트: mine TODO 스텁 + reference + 테스트(제목 규칙 준수). `dot`·`cross`는 mine에서 reference re-export
- [x] `test:ref`, `test:mine`(JSON → `site/src/data/test-results.json`) 스크립트, `--passWithNoTests`
- [x] 결과 JSON은 gitignore, `impl.ts`가 `import.meta.glob`으로 없으면 빈 값 처리 (placeholder 커밋 대신)
- [x] CI 테스트 단계: `test:ref`(통과 조건) → `scripts/check-mine-syntax.mjs` → `test:mine || true` → import 검사(`--after-tests`) → build → deploy

### 3. 사이트 기본
- [x] remark-math + rehype-katex (빌드 타임 수식)
- [x] 다크 모드(기기 설정 따름), 1단 모바일 레이아웃, safe-area inset
- [x] 레슨 컬렉션 스키마 (LESSON_TEMPLATE §2 frontmatter 검증, `sessions.device` 포함)
- [x] 레슨 컴포넌트: `LABox`, `TaskCard`(+`readOnly`), `Details`, `Hint`, `SessionBreak`, `CheckQuestion`
- [x] `lib/impl.ts`: `test-results.json` 키(`w{NN}/{함수명}`) 기반 기본값 + `ImplToggle` + "아직 내 구현 아님" 배지
- [x] `lib/storage.ts`: localStorage 전용 구현 (인터페이스는 ARCHITECTURE §7)
- [x] 대시보드: 레슨 목록 + 현재 기기 기준 "다음 세션"
- [x] 사이트 로직 테스트 (`test:site`, CI 통과 조건). 393px 가로 넘침·콘솔 에러 없음 확인 (headless)

### 4. 완료 확인
- [x] 1주차 LA1 레슨 MDX 생성 + 빌드 통과 (손코딩 자체는 1주차에서). 공용 3D 뷰어(`viewer3d/`) + VectorViewer 데모 포함
- [x] iPhone 14 Pro 세로에서 레슨 읽기·토글 확인 (2026-11-01, 3D 회전·슬라이더·토글·레슨 읽기 양호)
- [x] WORKFLOW 관문 G1 (architect) 통과 — 2026-11-01 조건부 통과, HIGH 2건 수정 (결과 JSON 클라이언트 번들 제외, mine import 오류 스텁)

## 나중에 (붙이는 시점)

| 항목 | 시점 |
| --- | --- |
| CSP meta (ARCHITECTURE §7 정책) | 첫 배포 안정 후 |
| Gist 동기화 + 동기화 버튼 | 3~4주차 (기기 간 불편이 생길 때) |
| 3D 뷰어 터치 게이팅, 두 손가락 조작 | 4주차 |
| `datasets/` PC Python 스크립트 (`calibrate.py`, `export_matches.py`) | 4~5주차 |
| mine 예외 시 reference 복귀 UI, 비교 오버레이 | 5주차 |
| WSL2 / Docker 세팅 | 12주차 (M1 이후) |
| 체크 질문 풀이 저장 (`checked`에 `q:` 접두사 id로 넣어 세션 id와 충돌 방지) | 2주 복귀 복습 기능 만들 때 |
