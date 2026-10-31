# LESSON_TEMPLATE

모든 레슨은 이 규격을 따른다. 레슨이 매번 들쭉날쭉해지는 것을 막는 문서다.

## 1. 파일 위치와 이름

- 위치: `site/src/content/lessons/`
- 이름: `w{주차 두 자리}-{영문 슬러그}.mdx` (예: `w04-pinhole.mdx`)
- 과제 함수 위치는 주차로 정해진다: `core/{mine,reference}/w{NN}.ts`, `core/tests/w{NN}.test.ts` (ARCHITECTURE §3)

## 2. 메타데이터 (frontmatter)

```yaml
---
week: 4
title: 핀홀 카메라 모델
summary: 3D 점이 이미지 위 한 점이 되는 과정과 렌즈 왜곡
prereq: [w01, w03]          # 선행 레슨
la_box: [동차좌표, 스케일 모호성]
tasks: [project, distort]   # 손코딩 함수 (core/mine)
read_only: [undistort, unprojectFisheye]  # 읽기만 함수 (mine은 reference re-export)
deliverables: []            # 함수가 아닌 산출물 (리딩 노트, 실험 스크립트 등)
demo: ProjectionDemo        # 없으면 생략
jetbot: true                # JetBot 실습 포함 여부
units: 2                    # 예상 단위 (1단위 ≈ 5시간, CURRICULUM 표와 일치)
sessions:                   # 45분 안팎 세션. id는 진도 저장(checked)에 쓴다
  - { id: s1, device: phone, title: "개념: 핀홀 투영" }
  - { id: s2, device: phone, title: "개념: 왜곡 모델" }
  - { id: s3, device: phone, title: "LA 박스: 동차좌표" }
  - { id: s4, device: pad,   title: "손으로 투영식 유도" }
  - { id: s5, device: phone, title: "데모 조작" }
  - { id: s6, device: pc,    title: "과제: project 구현" }
  - { id: s7, device: pc,    title: "과제: project 디버그·테스트 통과" }
  - { id: s8, device: pc,    title: "과제: distort 구현" }
  - { id: s9, device: pc,    title: "과제: distort 디버그·테스트 통과" }
  - { id: s10, device: pc,   title: "읽기만: undistort, unprojectFisheye" }
  - { id: s11, device: pc,   title: "JetBot: 캘리브레이션 결과 비교" }
  - { id: s12, device: phone, title: "체크 질문" }
---
```

- `units` × 5시간 ≈ 세션 수 × 45분이 되도록 세션을 잡는다. 손코딩 함수 하나는 최소 "구현 → 디버그" 세션 2개다.
- `device`는 `phone | pad | pc`. 대시보드는 **지금 쓰는 기기에서 할 수 있는 다음 세션**을 보여준다 (폰으로 들어왔는데 다음 할 일이 PC 손코딩이면 폰 세션을 대신 제시).
- `tasks`와 `read_only`의 이름은 `core/mine/w{NN}.ts`의 함수명과 정확히 일치해야 한다. `read_only` 함수는 mine에서 **reference를 re-export**한다 (ARCHITECTURE §5). TODO 스텁으로 두면 그 함수를 부르는 mine 함수가 깨진다.
- 16주차 리딩 노트, 캡스톤 실험 스크립트처럼 함수가 아닌 산출물은 `tasks`가 아니라 `deliverables`에 적는다.
- 진도(`status`, 완료 세션)는 frontmatter가 아니라 저장 계층(ARCHITECTURE §7)에 둔다.
- 대시보드는 이 메타데이터를 모아 자동 생성된다. "다음 세션"은 `sessions` 순서에서 아직 완료하지 않은 항목 중 현재 기기에 맞는 첫 항목이다.

## 3. 본문 구성

순서와 제목을 고정한다. 세션은 이 구성을 45분 단위로 자른 것이다.

### ⓪ 복귀 박스 (맨 위)
- 3줄 요약 + `prereq` 레슨 링크.
- 2주 넘게 쉬다 돌아왔을 때 이것만 읽고 시작할 수 있어야 한다.

### ① 개념 (`## 개념`)
- 분량: 세션 1~2개 (약 1,500~2,500자). 세션 경계마다 `<SessionBreak id="s1" />`를 둔다.
- 첫 문단에 "이번 주에 이걸 하면 무엇을 할 수 있게 되는가"를 한 줄로.
- 증명은 생략하고 **기하학적 직관 → 수식 → 코드로 어떻게 쓰이는지** 순서.
- 수식은 KaTeX(빌드 타임 렌더링). 한 줄 수식은 3개 이하, 긴 유도는 접기(`<Details>`)로. MDX에서 `{}`는 수식 블록 안에서만 쓴다.
- 단락은 3문장 이하. 모바일 1단 레이아웃 기준으로 표는 열 3개 이하.

### ② 선형대수 박스 (`<LABox>`)
- 기본 접힌 상태. `la_box` 항목마다 하나씩.
- 항목당: 한 줄 정의 → 기하학적 의미 → SLAM에서 어디 쓰이나 → 관련 이전 레슨 링크.
- 분량: 항목당 300~600자.

### ③ 데모 (`## 데모`)
- 데모가 없는 주차는 정적 그림 1~2개 또는 생략.
- 데모 위에 **"무엇을 조작해 보고, 무엇을 관찰할지"** 2~3개 지시를 둔다.
  - 예: "초점거리 슬라이더를 늘리면 점들이 어떻게 움직이는지 보기"
- mine/reference 토글을 데모 상단에 둔다.
- 393px 폭에서 데모 높이는 화면 절반(약 400px) 이내.

### ④ 과제 (`## 과제`)
- `<TaskCard fn="project" />` 형태로 `tasks` 함수마다 카드 하나. `read_only` 함수는 `<TaskCard fn="undistort" readOnly />`로 reference 코드 읽기 + 테스트 상태만 보여준다.
- 카드 내용: 함수 설명, 입출력, 힌트 단계(접기 1→2→3), 테스트 통과 상태(`test-results.json`).
- 힌트 단계: ① 개념 힌트 → ② 수식 힌트 → ③ 의사코드. 정답 코드는 넣지 않는다.
- JetBot 실습이 있으면 `### JetBot 실습` 하위 섹션에 수집 방법과 확인할 것을 적고, 대안 경로(DATA §4)를 한 줄 적는다.

### ⑤ 체크 질문 (`## 체크 질문`)
- 면접형 질문 3개. 답은 접어둔다.
- 1개는 개념 설명, 1개는 "왜?"를 묻는 것, 1개는 실무 상황형.
  - 예: "160° 광각 카메라에 핀홀 모델을 쓰면 어떤 문제가 생기나?"
- 2주 넘게 쉬었으면 대시보드가 직전 2개 레슨의 체크 질문부터 다시 풀게 한다.

## 4. 과제 함수 작성 규칙

AI가 생성하는 것과 내가 작성하는 것을 엄격히 구분한다.

**`core/mine/w{NN}.ts` (AI는 이것만 생성)**
```ts
/**
 * 3D 점을 카메라 좌표계에서 이미지 평면으로 투영한다.
 *
 * 수식 힌트: u = fx * X/Z + cx,  v = fy * Y/Z + cy
 * 주의: Z <= 0 이면 카메라 뒤 → null 반환
 *
 * @param p  카메라 좌표계 3D 점 [X, Y, Z]
 * @param K  내부 파라미터 { fx, fy, cx, cy }
 * @returns  픽셀 좌표 [u, v] 또는 null
 */
export function project(p: Vec3, K: Intrinsics): Vec2 | null {
  throw new Error("TODO");
}
```

**`core/reference/w{NN}.ts`**: 같은 시그니처의 정답 구현 (AI 작성).

**`core/tests/w{NN}.test.ts`**
- Vitest `ref`·`mine` project가 `IMPL` 환경변수로 구현을 하나만 고르고, **그쪽만 동적 import**한다. ref 실행이 mine 파일 오류의 영향을 받지 않게 하기 위함 (CI는 ARCHITECTURE §6).
  ```ts
  const IMPL = process.env.IMPL === "mine" ? "mine" : "reference";
  const m = await import(`@core/${IMPL}/w04`);

  describe(IMPL, () => {
    describe("project", () => {
      it("기본: 광축 위의 점은 주점으로 간다", () => { /* ... */ });
      it("경계: Z <= 0 이면 null", () => { /* ... */ });
      it("수치: 무작위 점 100개 왕복 오차 < 1e-6", () => { /* ... */ });
    });
  });
  ```
- **테스트 제목 규칙 (강제)**: `describe(구현) > describe("<함수명>") > it("기본|경계|수치: …")`. `impl.ts`는 JSON 결과의 `ancestorTitles[1]`(함수명)과 파일명(`w{NN}`)으로 `w{NN}/{함수명}` 키를 만든다. 이 구조를 벗어나면 대시보드가 함수별 통과 여부를 알 수 없다.
- 함수당 테스트 최소 3개: 기본 케이스 1, 경계 케이스 1, 수치 안정성/무작위 케이스 1.
- 부동소수 비교는 허용 오차를 명시한다 (기본 1e-6).
- **SVD·영공간·E/F 결과는 부호·스케일 불변으로 비교한다** (정규화 후 `±` 둘 중 가까운 쪽, 또는 제약식 잔차 `x'ᵀFx ≈ 0`으로 검사).
- **ml-matrix thin SVD 함정**: 8×9처럼 가로로 긴 행렬은 V의 마지막 열(영공간)이 안 나올 수 있다. 0행을 채워 정방행렬로 만들거나 AᵀA의 고유분해를 쓴다. reference가 이 처리를 하고, 힌트에도 적는다.
- **무작위 함수(RANSAC 등)는 시드를 고정한 RNG를 인자로 주입**한다. `Math.random` 직접 호출 금지.
- 야코비안 함수는 `numericJacobian`(7주차)과 비교하는 테스트를 반드시 둔다. ⊞와 섭동 야코비안은 CURRICULUM 7주차의 **좌섭동 규약**(T ← exp(δ^)·T, δ = [ρ; φ])을 따르고, 힌트 주석에 규약을 명시한다.
- reference가 먼저 통과하는지 확인한 뒤 커밋한다.

## 5. 레슨 생성 요청 흐름

Claude Code에 "N주차 레슨 만들어줘"라고 하면:

1. `docs/CURRICULUM.md`에서 N주차 주제, LA 박스, 데모, 손코딩·읽기만, JetBot, 단위 확인
2. 이 템플릿대로 MDX 생성 (세션 분할 포함)
3. `core/mine` 시그니처 + `core/reference` 정답 + `core/tests` 테스트 생성
4. 데모가 있으면 `components/demos/`에 컴포넌트 생성
5. reference 기준 테스트 통과 확인
6. `docs/WORKFLOW.md` 관문 G2 (code-reviewer) 실행, CRITICAL·HIGH 수정
7. 만든 파일 목록과 내가 구현할 함수 목록을 요약

## 6. 문체

- 레슨 본문은 평서체(~다).
- 용어는 처음 나올 때 한글(영문) 병기: "번들 조정(Bundle Adjustment)".
- 이모지는 상태 배지(✅ 등) 외에는 쓰지 않는다.
