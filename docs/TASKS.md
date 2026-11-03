# TASKS

현재 진행 중인 단계의 체크리스트. 완료하면 체크하고, 단계가 끝나면 다음 단계 목록으로 교체한다 (지난 목록은 git 기록에 남는다).

## 현재: 주차별 레슨 (WORKFLOW C단계)

B단계(0주차 플랫폼 뼈대)는 2026-11-01 완료, G1 통과. 그 체크리스트는 git 기록에 있다.
레슨 하나 = `LESSON_TEMPLATE.md` §5 흐름 + G2(수학·자동 QA·읽기·시각 검사) + G3(데모 주차만 사용자 폰 확인). 손코딩은 사용자 몫이라 여기서는 상태만 적는다.

| 주 | 레슨·G2 | G3 폰 확인 | 손코딩 |
| --- | --- | --- | --- |
| 1 | 완료 | 완료 | `skew` 통과 (2026-11-02, 사이트 제출) |
| 2 | 완료 | 완료 | 아직 |
| 3 | 완료 (2026-11-02) | 없음 (데모 없음) | 아직 |
| 4 | 완료 (2026-11-02) | 완료 (2026-11-02) | 아직 · JetBot 캘리브레이션 아직 |
| 5 | 완료 (2026-11-02) | 완료 (2026-11-02) | 아직 · JetBot 대응점 아직 |
| 6 | 완료 (2026-11-02) | 없음 (데모 없음) | 아직 · JetBot 3D 복원 아직 |
| 7a | 완료 (2026-11-02) | 대기 (GN 데모, 모아서 확인) | 아직 |
| 7b | 완료 (2026-11-02) | 없음 (데모 없음) | 아직 |
| 8a | 완료 (2026-11-02) | 없음 (데모 없음) | 아직 |
| 8b | 완료 (2026-11-02) | 대기 (BA 데모, 모아서 확인) | 아직 |
| 9 | 완료 (2026-11-02) | 없음 (데모 없음) | 아직 |
| 10 | 완료 (2026-11-03) | 없음 (데모 없음) | 아직 · JetBot 주행 데이터셋 아직 |
| 11a | 완료 (2026-11-03) | 없음 (데모 없음) | 아직 |
| 11b | 완료 (2026-11-03) | 없음 (데모 없음) | 아직 |
| 11c | 완료 (2026-11-03) | 대기 (VO 데모, 모아서 확인) | 아직 |
| 11d | 완료 (2026-11-03) | 대기 (TUM 실행기, 모아서 확인) | 아직 · M1 리포트 아직 |
| 12a | 완료 (2026-11-03) | 없음 (데모 없음) | 아직 · C++ 포팅·환경 세팅 아직 |
| 12b | 완료 (2026-11-03, 필수) | 없음 (데모 없음) | 아직 |
| 13 | 완료 (2026-11-03) | 없음 (데모 없음) | 아직 |
| 14a | 완료 (2026-11-03) | 없음 (데모 없음) | 아직 |
| 14b | 완료 (2026-11-03) | 없음 (데모 없음) | 아직 |
| 15 | 완료 (2026-11-03) | 없음 (데모 없음) | 아직 |
| 16 | 완료 (2026-11-03) | 없음 (데모 없음) | — (손코딩 없음) |
| 17 | 완료 (2026-11-03) | 없음 (데모 없음) | — (리딩 노트·ORB-SLAM3 실행 아직) |
| 18a | 완료 (2026-11-03) | 없음 (데모 없음) | — (실험 설계·수집 아직) |
| 18b | 완료 (2026-11-03) | 없음 (인터랙티브 리포트는 데이터 뒤) | — (분석·리포트 아직) |

### 플랫폼 추가 (C단계 중)
- [x] 코드 연습장: 폰에서 편집·브라우저 채점·GitHub 제출 (2026-11-02, ARCHITECTURE §6.1)
- [x] 배포 후 옛 페이지의 파일 불러오기 실패 → 새로고침 안내 (2026-11-02)
- [x] 레슨 자동 QA: `npm run qa` + 학습자·시각 검사 에이전트, G3는 데모 주차만 (2026-11-02)
- [x] 3D 뷰어: 좌표를 모두 수학 좌표로 통일, "탭해서 돌리기"(터치 게이팅)·두 손가락 확대 (2026-11-02, 4주차)
- [x] 데모 공용 부품: `ui/Slider`, `lib/useImplFns`(여러 함수를 mine/reference에서 불러오기), `viewer3d/Segments`
- [x] `datasets/calibrate.py`: 핀홀·어안 캘리브레이션 비교, `--selftest`로 합성 데이터 검증 (OpenCV 4.x·5.x)
- [x] 데모에서 내 구현이 예외를 던지면 "정답으로 보기" (5주차 EpipolarDemo, ARCHITECTURE §5)
- [x] `datasets/export_matches.py`: 사진 두 장 또는 영상 두 프레임의 ORB 대응점 → DATA §2 JSON, OpenCV E 추정 비교, `--selftest`
- [x] "내 사진으로 해보기": 대응점·calib JSON을 브라우저에서 읽어 내 eightPoint·ransac으로 E 추정 (저장 안 함)
- [x] `datasets/jetbot_to_std.py`: 주행 영상 → 표준 시퀀스 폴더(DATA §2), `--selftest` (10주차)
- [x] VO 워커(`lib/vo.worker.ts`, `voClient.ts`): 몇 초 걸리는 VO를 화면 밖에서, 취소·시간 제한. 11c 합성 VO 데모, 11d TUM 실행기(트랙 JSON 열기 → 내 VO → ATE·RPE, TUM 형식 궤적 저장)
- [x] `datasets/tum_tracks.py`: TUM RGB-D → KLT 트랙 JSON(DATA §2 tracks), `--selftest` (11주차)
- [x] 6주차 "3D 복원" 도구: 합성 장면(정답 비교) 또는 내 대응점 파일로 E → decomposeE → triangulate → pnpDLT, 위에서 본 점 구름 (`lib/reconstruct.ts`, `lib/matchPrep.ts`)
- [x] CSP meta: `astro.config.mjs`의 `security.csp` (인라인 스크립트는 빌드 해시, ARCHITECTURE §7) (2026-11-03)
- [x] 코드 연습장 채점 시간 제한 주차별 (기본 8초, w11 30초, 시간 초과 시 PC `npm run test:mine` 안내) (2026-11-03)
- [x] VO 워커 함수별 대체: mine의 initMap·trackPnP·localBA 중 TODO인 것만 정답으로 바꿔 조립, 화면에 이름 표시 (`lib/voFallback.ts`) (2026-11-03)
- [x] 세션 소요 시간 기록: "완료 표시" 뒤 5~240분 입력 (`storage.ts`의 `sessionMinutes`) (2026-11-03)
- [x] iPhone 7일 저장소 삭제 대응: `navigator.storage.persist()` 요청 + 대시보드(폰·패드)·제출 설정·코드 연습장 안내 (2026-11-03)
- [x] G4 리뷰 반영: 세션 해제 시 걸린 시간 기록도 삭제, `minutes`는 항상 계산값(예전 값은 `legacyMinutes`), 기록 "지우기" 버튼, 대시보드 안내는 홈 화면 앱이면 숨김, QA가 폰 UA로 대시보드 안내까지 찍음, QA 대기 시간은 `playground/timeouts.ts`에서 읽음 (2026-11-03)

### M1 관문 (2026-11-03, G0 재검토 3개 완료)
- 사용자 결정:
  - 11주차 최소 경로: 손코딩은 `initMap`, `trackPnP`, `alignUmeyama`, `ate`. 도우미(`checkFrame`, `matchById`, `normalizePixel`, `reprojectionError`)와 `refinePose`는 읽기만, `localBA`는 읽기만(선택 과제).
  - M1 리포트 보강: evo로 다시 재기, 소거 실험표, ORB-SLAM 기준선(논문 표 III 인용, 선택: ORB-SLAM3 Docker 실행). 숫자는 내 구현(mine)으로.
  - 12a: TUM + WSL2 Ubuntu 24.04. KITTI는 선택 확장.
  - 13주차 ESKF, 14주차 IMU 사전적분 손코딩, 15주차 라이다 ICP 신설 (뒤 주차 하나씩 밀림).
  - iPhone 7일 저장소 삭제: 안내 + 저장소 보존 요청만 (Gist 동기화는 그대로 나중에).
  - 적용 안 함 (사용자가 고르지 않음): poseGraph2D 읽기만, JetBot 실습 선택 트랙, M1/M1.5 분리, ROS2 필수, GTSAM 루프 클로저, 캡스톤 축소, 영어 README·GIF는 최소 README만.
- 일정: CURRICULUM 일정 절을 레슨 내용 기준 추정(M1까지 약 29~31단위, 공부주당 1단위면 남은 약 9개월)으로 고쳤다.
- 정답 구현 TUM 기준 숫자(2026-11-03): fr1/xyz 299/300 ATE 4.6cm(6.5m), fr3/long_office 799/800 ATE 17cm(20.8m, 0.83%), fr1/desk 15Hz는 77에 초기화·99에서 끊김(30Hz는 155/600). local BA를 끄면 fr1/xyz 151, fr3 92에서 끊김. 11d 표.
- G3(폰 확인)는 모아서 한다: 7a GN 데모, 8b BA 데모, 11c VO 데모, 11d TUM 실행기. 그때 w11 코드 연습장 "테스트 실행"도 iPhone에서 시간을 재 본다.

### 12~18주차 레슨 (2026-11-03, 전체 커리큘럼 먼저 완성)
- 코어: w13(ESKF), w14(IMU 적분·사전적분·바이어스 야코비안), w15(ICP) 정답·테스트·스텁. G2-math에서 남은 뮤턴트를 잡는 테스트를 보강했다.
- 12a 결과 쇼케이스: `datasets/cpp_result.py` → `site/src/data/cpp-results/*.json` → `CppResults` 표. `deploy.yml`의 main 푸시에만 `paths-ignore: cpp/**`(PR에는 걸지 않는다: 필수 체크가 대기 중에 멈추는 것을 막으려고).
- 13주차는 세션 9개라 1.5단위로 잡았다. 15주차 데이터는 합성 방 장면(KITTI는 선택 PC 실습). 14·18주차는 a/b 파트.
- 검증 안 된 명령·버전·속성 이름은 레슨에 "검증 안 됨/확인 필요"로 표시했다(WSL2·apt 버전, cpp.yml, Ceres 매니폴드, ORB-SLAM3 Docker, VINS·ORB-SLAM3 함수 이름, nvarguscamerasrc 속성, TUM RS-VIO, Open3D·KITTI 코드). 사용자가 실행하면서 확인한다.

### 12주차 준비 메모 (레슨에 반영함)
- C++ 포팅 (지원과 병행). 12a 필수: WSL2 Ubuntu 24.04 → C++17 + Eigen + OpenCV 단안 VO, **TUM** `fr1/xyz`·`fr3/long_office` → evo → CMake, GTest, CI.
- WSL2 규칙을 레슨에 넣는다: 코드·데이터는 `~/`(ext4)에 (`/mnt/c`는 몇 배 느림), `.wslconfig` 메모리 8GB 이상 + swap, VS Code Remote-WSL, Docker는 하나만(Desktop WSL2 백엔드 또는 WSL 안 엔진), 세팅이 1단위를 넘으면 devcontainer로.
- CI는 `cpp.yml`로 분리: `paths: cpp/**`, `ubuntu-24.04`, apt로 OpenCV·Eigen·GTest·Ceres + ccache, 데이터셋은 CI에서 받지 않는다(합성 데이터 GTest). `deploy.yml`에는 main 푸시에만 `paths-ignore: cpp/**` (반영함).
- C++ 결과 쇼케이스: TUM 형식 궤적 → evo → `site/src/data/cpp-results/*.json`(git sha, 데이터셋, 파라미터, ATE/RPE, 2000포즈 이하 궤적), 스키마 검사 후 `trajPlot`·`voEval` 재사용해 TS·C++·evo 비교.
- evo 주의: `evo_rpe`에는 초 단위가 없어 `-d 15 -u f`(15Hz). evo는 타임스탬프로 짝지어서 사이트와 쌍 수가 다를 수 있다. evo는 Python 3.10+ 환경(WSL2 venv/pipx)에.
- ORB-SLAM3 Docker 절차(11d 선택 경로)를 이때 실제로 검증한다: viewer 끄기, `-j2~4`, ORBvoc.txt는 커밋하지 않기.
- 산출물은 함수가 아니라 `deliverables`로.

## 나중에 (붙이는 시점)

| 항목 | 시점 |
| --- | --- |
| 코드 연습장 1.5단계: 코드 색칠 편집기(CodeMirror 6), 기호 버튼 개선 | 폰 손코딩이 불편하다고 느낄 때 |
| 코드 연습장: 초안을 Gist 별도 파일로 동기화 (기기 간 이어 쓰기) | Gist 동기화와 함께 |
| 파트별 레슨 페이지 분리 지원 (LESSON_TEMPLATE §1: glob, `part` 스키마, 진도 키, prereq) | 7주차 레슨 준비 때 |
| Gist 동기화 + 동기화 버튼 | 기기 간 불편이 생길 때 |
| 사이트에서 `calib.json` 결과 보기 (핀홀·어안 재투영 오차 비교 표) | 사용자가 JetBot 캘리브레이션을 마친 뒤 |
| 내 구현과 정답을 한 화면에 겹쳐 그리는 비교 모드 | 데모에서 둘을 나란히 보고 싶어질 때 |
| WSL2 Ubuntu 24.04 / Docker 세팅 | 12주차 (M1 이후) |
| VO 재초기화(relocalization): 추적이 끊기면 키프레임 사진과 다시 맞춰 잇기 | 캡스톤에서 JetBot 주행이 자주 끊길 때 |
| 초기화의 호모그래피 경로 (평면·순수 회전 판별, ORB-SLAM의 H/F 점수 비율) | JetBot 바닥 장면에서 E 초기화가 실패할 때 |
| `tum_tracks.py`를 표준 시퀀스 폴더(JetBot, DATA §2, 정답 없음)에도 쓰게 넓히기 (M1 보너스: 출발점 복귀 오차, 캡스톤 18a 준비물) | M1 보너스나 캡스톤(18a)을 시작할 때, 먼저 오는 쪽 |
| VO 실행기에서 프레임별 로그 CSV 내보내기 (특징점 수, PnP inlier 수·비율, 평균 밝기) + 캡스톤용 `capstone.json` 조건 필드, `jetbot_to_std.py` 선택지 넓히기 | 캡스톤(18a)을 시작할 때 (18a 준비물) |
| 큰 함수 단계별 체크포인트 (smallBA·initMap·trackPnP: "1단계 → 이 테스트", 예외 테스트는 "마무리") | 사용자가 손코딩하다 한 세션에 안 끝나는 함수를 만날 때 (G0 ② P7) |
| 과밀 세션 나누기: w06 s4·s8, w07a s5, w08a s3 / w02 짧은 개념 세션 합치기 + 강의 시청 세션 | 해당 레슨을 공부하기 전 (G0 ② P8·P10) |
| M1 리포트 페이지 틀 (표·그림 자리를 미리 채운 페이지) | 사용자가 TUM 결과를 낼 때 (G0 ② P9) |
| 제출 토큰 만료일 알림 (저장할 때 만료일 입력 → 2주 전 배지) | 토큰을 처음 갱신할 때쯤 (G0 ③ L7) |
| C++ 결과 쇼케이스에 궤적 그림 (cpp-results에 2000포즈 이하 궤적 + trajPlot 재사용) | C++ 결과가 처음 나올 때 |
| 캡스톤 인터랙티브 리포트 페이지 (조건 토글로 궤적 비교) | 18a 데이터 수집을 마친 뒤 |
| 라이다 ICP를 실데이터 스캔으로 사이트에서 돌리기 (KITTI 샘플 축소본) | 15주차 공부 중 원하면 |
| EuRoC IMU를 사이트에서 적분해 보기 (`imu0/data.csv` 읽기) | 14주차 공부 중 원하면 |
| ORB-SLAM3용 calib.json → yaml 변환기 (KannalaBrandt8), `rgb.txt` 생성, 드롭 프레임 검사(`jetbot_to_std.py`) | 17주차 코드 리딩·캡스톤 전 |
| 체크 질문 풀이 저장 (`checked`에 `q:` 접두사 id로 넣어 세션 id와 충돌 방지) | 2주 복귀 복습 기능 만들 때 |
