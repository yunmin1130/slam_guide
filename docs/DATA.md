# DATA

내가 찍은 사진(폰 메인 카메라, JetBot 카메라)과 공개 데이터셋을 같은 코드로 처리하기 위한 데이터 규격.

2026-11-27에 목표가 3D 재구성·센서 시뮬레이션으로 바뀌면서(CURRICULUM) 핵심 경로의 데이터는 **폰 사진 → COLMAP → 3DGS** 흐름이 됐다(§0). JetBot 주행 영상, IMU·휠 오도메트리, TUM으로 내는 M1 리포트는 핵심 경로에서 빠졌고, 관련 절은 선택 레슨(21–28주차)용으로 남겨 두었다(절마다 표시).

## 0. 핵심 경로의 데이터 흐름 (2026-11-27)

```
datasets/raw/room01/            # 장면 하나 = 폴더 하나 (저장소에 올리지 않는다)
├── images/                     # 0주차: 폰 메인 카메라 사진 50–150장 (초점·노출 고정)
├── colmap/                     # 0주차: COLMAP 작업 폴더
│   ├── database.db             #   특징점·매칭
│   ├── sparse/0/               #   결과 모델 (cameras.bin, images.bin, points3D.bin)
│   └── sparse_txt/             #   9주차: 같은 모델의 텍스트 (cameras.txt, images.txt, points3D.txt)
├── sparse/0/                   # 0주차: colmap/sparse를 gsplat용으로 복사한 것 (원본은 colmap/에 그대로)
├── images_4/                   # 0주차: gsplat용 사진 복사본 (원본 images/를 복사)
├── images_4_png/               # 0주차: gsplat 스크립트가 images_4/에서 만든 1/4 크기 PNG
├── gsplat/                     # 0·12주차: 3DGS 학습 결과
└── capstone/                   # 14주차: 캡스톤 실험 결과 (plan.md, report.md, export/ 등)

datasets/tracks/                # 11주차: 사이트 실행기 입력 (저장소에 올리지 않는다)
├── room01.json                 #   colmap_tracks.py: 특징점 트랙 + COLMAP 자세 (§2 tracks)
└── room01-colmap.txt           #   colmap_tracks.py: COLMAP 카메라 궤적 (TUM 형식)

datasets/calib-phone.json       # 4a주차: 폰 메인 카메라 캘리브레이션 (§3)
datasets/calib.json             # 4a주차: JetBot 카메라 어안 캘리브레이션 (§3)
```

| 주차 | 만드는 것 | 도구 |
| --- | --- | --- |
| 0 | `images/`, `colmap/`, `gsplat/` | 폰, COLMAP, gsplat |
| 4a | `calib-phone.json`, `calib.json` | `datasets/calibrate.py` |
| 9 | `colmap/sparse_txt/` | `colmap model_converter` |
| 11 | `tracks/room01.json`, `room01-colmap.txt` | `datasets/colmap_tracks.py` |
| 12 | `gsplat/` 아래 설정별 결과 | gsplat |

- 장면 이름(`room01`)은 예시다. 다시 찍으면 `room02`처럼 폴더를 새로 만든다.
- COLMAP 텍스트 모델의 형식과 자세 규약(월드→카메라, `QW QX QY QZ TX TY TZ`)은 9주차 레슨과 COLMAP 문서(Output Format)를 따른다.
- **아직 이 PC에서 검증하지 않았다**: 실제 COLMAP 결과로 `colmap_tracks.py`를 돌리는 것(합성 텍스트 모델로만 확인, 2026-11-27).

## 1. 원칙

- **촬영은 폰·JetBot 카메라, 처리는 PC·웹.** JetBot(Jetson Nano)에서는 기록만 하고 처리는 PC나 브라우저에서 한다.
- **무거운 영상 처리는 PC.** 캘리브레이션, 특징점 추출·매칭, COLMAP, 3DGS 학습은 PC에서 하고, `datasets/` 스크립트가 결과를 JSON으로 내보낸다. 브라우저는 JSON을 읽어 수학과 시각화만 한다.
- 사이트 데모와 core 코드는 아래 §2의 JSON 형식(matches, tracks)만 읽는다. 영상 시퀀스를 다룰 때는 **표준 시퀀스 포맷**으로 변환한 뒤 쓴다.
- 사이트(`site/public/data/`) 샘플 상한: **시퀀스당 100프레임 이하, JPEG로 축소, 5MB 이내.** (GitHub 파일 한도 100MB, KITTI PNG 300프레임은 100MB를 넘는다.) 긴 데이터는 브라우저에서 드래그앤드롭으로 로컬 파일을 연다.
- 회사 코드·내부 데이터는 절대 포함하지 않는다.

## 2. 표준 시퀀스 포맷

영상(프레임이 시간순으로 이어진 데이터)용 형식이다. 핵심 경로에서는 `matches/`(5주차)와 `tracks/`(11주차) JSON만 쓰고, 나머지(`timestamps.txt`, `imu.csv`, `odom.csv`, `groundtruth.csv`)는 선택 레슨(23·24·28주차)에서 쓴다. EuRoC와 비슷한 폴더 구조를 쓴다.

```
{sequence_name}/
├── meta.json            # 시퀀스 정보
├── calib.json           # 카메라 캘리브레이션 (없으면 jetbot_to_std.py가 경고만 한다)
├── images/              # 프레임 이미지
│   ├── 000000.jpg
│   ├── 000001.jpg
│   └── ...
├── timestamps.txt       # 프레임별 시간
├── matches/             # (선택) PC Python이 뽑은 대응점, 프레임 쌍별 JSON
├── imu.csv              # (선택) IMU
├── odom.csv             # (선택) 휠 오도메트리
└── groundtruth.csv      # (선택) 정답 궤적
```

### meta.json
```jsonc
{
  "name": "home-square-slow-01",
  "source": "jetbot",            // jetbot | iphone | kitti | euroc | tum
  "robot": "jetbot-basic",       // jetbot-basic | jetbot-ros | none
  "recorded_at": "2026-11-15",
  "path_desc": "거실 1m×1m 사각형, 저속",
  "conditions": { "rotation_speed": "slow", "lighting": "day", "exposure": "auto" },
  "eval": "return-to-start",     // groundtruth | return-to-start | measured-square
  "license": "own"               // own | kitti-cc-by-nc-sa | euroc | tum-cc-by
}
```
- `conditions`는 선택 28주차(옛 캡스톤: 회전 속도·조명·노출 비교)에서 그룹을 나누는 키로 쓴다. `exposure`는 `auto | fixed`.
- `eval: return-to-start`는 출발점 복귀 오차다. 루프 클로저(21주차)와 다른 개념이라 이름을 구분한다.

### timestamps.txt
- 한 줄에 하나, 이미지 번호 순서대로.
- 단위: 나노초 정수 (EuRoC와 동일).
```
0
33333333
66666666
```

### matches/{i}_{j}.json
```jsonc
{
  "frames": [0, 1],
  "detector": "orb",                    // orb | sift
  "pts_i": [[412.3, 201.8], ...],       // 픽셀 좌표 (왜곡된 원본 이미지 기준)
  "pts_j": [[418.9, 199.2], ...],
  "ratio": [0.61, ...]                  // 1·2위 거리비 d₁/d₂ (10주차 비율 검사, 0.8 미만만 남는다)
}
```
- 어안 이미지는 core에서 `calib.json`으로 언프로젝션해 베어링 벡터(bearing vector, 광선 방향의 단위 벡터)로 바꾼 뒤 E를 추정한다 (CURRICULUM 5주차).
- `datasets/export_matches.py`가 만든다(기본 저장 `datasets/matches/{i}_{j}.json`, 시퀀스에 붙이려면 `--out datasets/sequences/{name}/matches/{i}_{j}.json`). 입력은 사진 두 장(`a.jpg b.jpg`) 또는 영상의 두 프레임(`--video walk.mp4 --frames 45 75`). ORB 특징점 + 1·2위 거리비 0.8 미만만 남긴다. `--calib`을 주면 OpenCV `findEssentialMat`(RANSAC 2px)의 inlier 수도 출력한다(5주차 비교 기준).

### tracks/{name}.json (11주차 미니 SfM 입력)
사이트 11d 실행기가 읽는다(`site/src/lib/tracksFile.ts`). 기본 저장 `datasets/tracks/`, 저장소에 올리지 않는다. 만드는 스크립트는 둘이고 형식은 같다.

| 스크립트 | 입력 | `groundtruth`에 들어가는 것 |
| --- | --- | --- |
| `datasets/colmap_tracks.py` (주 실습) | 내 사진의 COLMAP 텍스트 모델 | COLMAP이 구한 자세 (정답이 아니라 기준) |
| `datasets/tum_tracks.py` (평가 코드 확인) | TUM RGB-D 시퀀스 | 모션캡처 정답 자세 |

```jsonc
{
  "format": "slam-guide-tracks", "version": 1,
  "name": "room01", "source": "colmap", "license": "own",   // TUM: "tum-freiburg1_xyz", "tum", "tum-cc-by"
  "camera": { "fx": 480.0, "fy": 480.0, "cx": 321.6, "cy": 238.4, "width": 640, "height": 480 },
  "every": 2,                                   // TUM 전용: 원본 영상 몇 장마다 하나 (COLMAP 파일은 늘 1)
  "frames": [ { "t": 0.0,                        // 초. TUM은 원본 시각, COLMAP 파일은 사진 순서 번호 0, 1, 2, …
                "features": [[12, 412.31, 201.8], ...] } ],  // [추적 id, u, v], 왜곡을 편 픽셀
  "groundtruth": [ [tx, ty, tz, qw, qx, qy, qz] | null, ... ]  // 프레임마다 T_world_cam (위치 = 카메라 중심), 없으면 null
}
```
- 같은 id = 같은 3D 점. 한 프레임 안에 같은 id는 한 번만 나온다.
- 쿼터니언은 이 문서의 다른 파일과 같이 w가 먼저다(TUM 원본은 x, y, z, w 순서, COLMAP 원본은 w가 먼저지만 월드→카메라다).
- 사이트 상한: 프레임 2000장, 프레임당 특징점 2000개, 전체 특징점 60만 개, 파일 30MB.
- 사이트는 `source`가 `"colmap"`이면 비교 대상을 "COLMAP 기준"으로, 길이 단위를 미터가 아닌 "단위"로 표시한다(COLMAP의 길이 단위는 임의다). 그 밖의 값은 정답(미터)으로 본다.

**`tum_tracks.py` (TUM RGB-D).** 특징점은 KLT 앞·뒤 추적(되돌아온 거리 1px 이하)으로 이어 붙이고, 목표 수의 70% 아래로 줄면 새로 채운다. 프레임 시각에서 20ms 안에 정답이 없으면 그 프레임의 `groundtruth`는 null이다.

**`colmap_tracks.py` (내 사진).** 입력은 COLMAP 텍스트 모델 폴더(`cameras.txt`, `images.txt`, `points3D.txt`)다. 바이너리 모델은 `colmap model_converter --input_path … --output_path … --output_type TXT`로 먼저 바꾼다. 스크립트가 정하는 것:
- **id**: `images.txt` 둘째 줄의 `POINT3D_ID`를 그대로 쓴다. `-1`(3D 점이 없는 특징점)은 뺀다. 한 사진에 같은 번호가 두 번 나오면 첫 번째만 남긴다.
- **순서와 시각**: 사진은 파일 이름순이고, 숫자는 숫자로 비교한다(`IMG_2`가 `IMG_10`보다 앞, 대소문자 무시). 시각 `t`는 순서 번호(0, 1, 2, …)다. COLMAP이 등록하지 못한 사진은 `images.txt`에 없어서 빠진다(`--images 사진폴더`를 주면 빠진 이름을 알려준다).
- **왜곡**: 특징점을 자기 카메라 모델로 편 뒤 기준 카메라(사진이 가장 많은 카메라, `--camera-id`로 지정 가능)의 핀홀 K로 다시 투영한다. 카메라가 여러 대여도 결과는 K 하나다. 결과 K는 기준 카메라의 `fx`와 `fy`를 따로 그대로 둔다(`SIMPLE_*` 모델처럼 초점거리가 하나면 둘이 같다). 지원 모델은 `SIMPLE_PINHOLE`, `PINHOLE`, `SIMPLE_RADIAL`, `RADIAL`, `OPENCV`이고, 어안 계열은 거부한다(`colmap image_undistorter`로 핀홀 모델을 만든 뒤 넣는다).
- **크기**: 긴 변이 `--long-side`(기본 640) 픽셀이 되게 K와 특징점 좌표를 같은 배율로 줄인다(기하는 그대로다). 실행기의 픽셀 기준(초기화 2px, 등록 6px)이 640×480 영상에 맞춰져 있어서다. 0이면 줄이지 않는다.
- **특징점 수**: 사진당 `--max-features`(기본 400)개까지, 긴 트랙(여러 사진에서 본 점)부터 남긴다.
- **자세**: COLMAP의 월드→카메라 `(QW QX QY QZ, TX TY TZ)`를 카메라→월드로 뒤집는다. 카메라 중심 `C = −Rᵀt`, 쿼터니언은 켤레 `(qw, −qx, −qy, −qz)`.
- **사진 이름**: `images.txt` 첫째 줄의 10번째 칸부터 끝까지를 공백 하나로 이어 붙인다. 이름 안에 공백이 연달아 있으면 하나로 줄어든다(그런 이름은 `--images` 비교에서 등록 실패로 잘못 나온다).
- **두 줄 구조**: 특징점이 없는 사진은 둘째 줄이 빈 줄이어야 한다. 편집기가 빈 줄을 지워 사진 줄이 연달아 나오면 이유를 담은 오류로 멈춘다.
- 부가 필드(사이트는 무시한다): `pixel_scale`(줄인 배율), `reference_camera_id`, `dropped_features`, `images`(프레임 순서대로의 파일 이름).
- 함께 쓰는 파일 `{name}-colmap.txt`: COLMAP 카메라 궤적의 TUM 형식 텍스트. 줄마다 `시각 tx ty tz qx qy qz qw`(T_world_cam, w가 마지막), 시각은 위의 순서 번호다. 머리 주석은 ASCII만 쓴다(cp949로 읽는 Windows 도구가 멈추지 않게). 실행기의 "내 궤적 저장" 파일과 시각이 같아 다른 도구(evo 등)로 바로 비교할 수 있다.
- 검증: `python datasets/colmap_tracks.py --selftest`(합성 텍스트 모델로 카메라 중심·회전·왜곡 편 픽셀을 참값과 대조하고, 왜곡 식은 손으로 계산한 값과도 대조하며, 잘못된 입력은 거부하는지 본다. 검사 수는 스크립트 출력의 마지막 줄을 본다). 실제 COLMAP 결과로는 아직 검증하지 않았다.

### cpp-results/{name}.json (선택 22a 결과 쇼케이스)
`datasets/cpp_result.py`가 evo 결과 zip(`--save_results`의 `stats.json`) 또는 직접 입력한 숫자로 만든다. 저장 위치는 `site/src/data/cpp-results/`이고 저장소에 올린다(작은 숫자 파일). 사이트 22a 레슨이 빌드 때 읽어 표로 보여준다(`site/src/lib/cppResults.ts`, 형식이 틀리면 빌드가 멈춘다).
```jsonc
{
  "format": "slam-guide-result", "version": 1,
  "sequence": "fr1/xyz",
  "impl": "cpp",                       // ts-mine | ts-reference | cpp | orbslam3
  "git_sha": "abc1234",                // 스크립트가 자동으로 (git 밖이면 null)
  "date": "2026-11-03",
  "frames": { "tracked": 299, "total": 300 } | null,
  "ate": { "rmse": 0.046 },             // m
  "rpe": { "trans_rmse": 0.012, "rot_rmse_deg": 0.5 } | null,
  "note": ""                            // 200자 이하
}
```
- `A | null`은 "둘 중 하나"라는 표기다(실제 파일은 둘 중 하나만 쓴다).
- 검사 규칙(틀리면 빌드가 파일 이름과 함께 멈춘다): `sequence`는 비어 있지 않은 200자 이하, `date`는 `YYYY-MM-DD`, `git_sha`는 소문자 16진수 7–40자 또는 null, 숫자는 0 이상의 유한한 수, `frames`는 0 < total, 0 ≤ tracked ≤ total인 정수, `rpe` 객체면 두 값 중 하나는 있어야 한다.
- 궤적 자체는 넣지 않는다(숫자 비교 표만). 궤적 그림이 필요해지면 TASKS "나중에"를 본다.

### imu.csv
```
timestamp_ns,gx,gy,gz,ax,ay,az
0,0.0012,-0.0004,0.0001,0.02,-0.01,9.81
```
- 자이로 rad/s, 가속도 m/s². 축 방향은 `calib.json`의 `T_cam_imu`로 카메라와 연결한다.

### odom.csv
```
timestamp_ns,left_ticks,right_ticks
```
- 원시 엔코더 틱을 저장하고, 바퀴 반지름·축간 거리는 `calib.json`에 둔다.

### groundtruth.csv
```
timestamp_ns,tx,ty,tz,qw,qx,qy,qz
```
- **표기 규약**: `T_a_b`는 b 좌표계의 점을 a 좌표계로 옮기는 변환이다 (p_a = T_a_b · p_b). 모든 문서와 코드가 이 규약을 따른다.
- 표준 포맷에서는 **월드 좌표계에서 본 카메라 포즈 (T_world_cam)**로 통일한다.
- EuRoC 원본 정답은 카메라가 아니라 **IMU(body) 포즈 (T_world_imu)**다. 변환 시 `T_world_cam = T_world_imu · T_imu_cam`으로 바꾼다.
  - EuRoC `sensor.yaml`의 `T_BS`는 이미 `T_imu_cam`(카메라 → body)이므로 **역행렬을 취하지 않는다.** `calib.json`의 `T_cam_imu`에는 그 역행렬을 저장한다.
  - EuRoC 정답은 200Hz, 카메라는 20Hz라 시각이 다르다. 변환 스크립트에서 카메라 타임스탬프로 보간한다 (평행이동 선형, 회전 slerp).

## 3. 캘리브레이션 (calib.json)

4a주차에서 카메라 두 대를 캘리브레이션한다(`datasets/calibrate.py`, PC Python OpenCV). 파일은 카메라마다 따로 둔다.

| 카메라 | 실행 | 기본 저장 | `camera.model` |
| --- | --- | --- | --- |
| 폰 메인 카메라 | `--model pinhole` | `datasets/calib-phone.json` | `pinhole` |
| JetBot (IMX219-160) | `--model fisheye` (기본) | `datasets/calib.json` | `fisheye` |

- **폰**: 핀홀(Brown) 모델만 맞춘다. `distortion`은 `k1, k2, p1, p2, k3` 다섯 개이고 k3는 0으로 고정한다(COLMAP의 `OPENCV` 모델 `fx fy cx cy k1 k2 p1 p2`에 그대로 옮기려는 것). `imu`·`wheel` 항목은 없고 `comparison`에는 `pinhole`만 들어간다. 이 값은 9주차의 비교 기준(COLMAP `cameras.txt`의 값과 비교)이고 14주차 캡스톤의 정답 값이다. 11주차 `colmap_tracks.py`는 이 파일이 아니라 COLMAP이 다듬은 값을 쓴다(COLMAP과 같은 K로 비교해야 차이가 기하에서만 나온다).
- **픽셀 원점 규약**: OpenCV는 맨 왼쪽 위 픽셀의 중심이 (0, 0)이고, COLMAP은 왼쪽 위 모서리가 (0, 0)이라 그 픽셀의 중심이 (0.5, 0.5)다([COLMAP 문서 Database Format](https://colmap.github.io/database.html)). `calib-phone.json`은 OpenCV 규약 그대로 두고, COLMAP에 줄 때 `cx`, `cy`에 0.5씩 더한다. `colmap_tracks.py`는 영향이 없다(COLMAP의 K로 펴고 같은 K로 다시 투영하므로 규약이 한쪽으로만 쓰인다).
- **JetBot**: 160° 광각이라 **어안(fisheye) 모델이 기본**이고, 같은 교차점으로 핀홀 모델도 맞춰 비교한다. 14주차 캡스톤 도전 과제에 쓴다.
- 폰 쪽 설명은 `calibrate.py`의 `--model pinhole` 경로를 보고 적었다(2026-11-27). 스크립트가 바뀌면 이 절을 맞춘다.

아래는 JetBot(어안) 파일의 전체 모양이다. 폰 파일은 여기서 `imu`, `wheel`, `comparison.fisheye`가 빠진 것이다.

```jsonc
{
  "camera": {
    "model": "fisheye",                 // pinhole | fisheye
    "width": 820,
    "height": 616,
    "fx": 0, "fy": 0, "cx": 0, "cy": 0,
    "distortion": [0, 0, 0, 0],         // pinhole: k1,k2,p1,p2,(k3) / fisheye: k1–k4 (Kannala-Brandt)
    "rolling_shutter": true,
    "readout_time_ms": null             // 측정 가능하면 기록 (14주차 롤링셔터 렌더링, 선택 28주차용)
  },
  "imu": {
    "model": "MPU9250",
    "T_cam_imu": null,                  // 4x4 행렬, 미측정 시 null
    "time_offset_ms": null,             // 카메라-IMU 시간 오프셋 (Kalibr)
    "gyro_noise": null, "accel_noise": null
  },
  "wheel": {
    "radius_m": null,
    "baseline_m": null,
    "ticks_per_rev": null
  },
  "calibrated_at": "2026-11-10",
  "reproj_error_px": null,              // camera 모델(어안)의 전체 RMS
  "comparison": {                       // 4a주차: 같은 교차점으로 두 모델을 맞춘 결과 (calibrate.py가 씀)
    "views": 0,                         // 판을 찾아 쓴 프레임 수
    "pinhole": { "fx": 0, "fy": 0, "cx": 0, "cy": 0, "distortion": [0, 0, 0, 0, 0],
                 "rms_px": 0, "center_rms_px": 0, "edge_rms_px": 0, "edge_points": 0 },
    "fisheye": { "...": "pinhole과 같은 필드, distortion은 k1–k4" }
  }
}
```

- `datasets/calibrate.py`가 이 파일을 쓴다. 이미 파일이 있으면 `imu`·`wheel`은 그대로 두고 `camera`·`comparison`만 갱신한다. 합성 데이터로 스크립트를 검증하려면 `--selftest`.
- "가장자리"는 이미지 중심에서 반대각선 길이의 60%보다 먼 교차점이다. 광각 렌즈는 여기서 핀홀과 어안의 차이가 크게 난다.
- 카메라가 흔들리거나 각도가 바뀌면 다시 캘리브레이션한다.
- 수집할 때 해상도·센서 모드는 캘리브레이션 때와 같아야 한다.

## 4. JetBot 수집 규칙

**핵심 경로에서의 쓰임 (2026-11-27)**: JetBot은 로봇이 아니라 **광각 카메라**로만 쓴다(CURRICULUM 장비). 필요한 것은 4a주차의 체커보드 영상과 14주차 도전 과제의 사진 몇 장뿐이라, 아래에서 "녹화 방법"까지만 해당한다. 주행 영상, 정답 궤적 없는 평가, 통제 실험, 이름 규칙은 선택 레슨(10주차 `jetbot_to_std.py` 실습, 28주차 옛 캡스톤)용으로 남겨 둔 것이다.

- **버전 확인**: 기본 JetBot은 카메라만, ROS 버전은 엔코더·IMU·RPLIDAR A1 포함. `meta.json`의 `robot`에 기록. ROS 버전 실습은 선택 트랙이다 (CURRICULUM).
- **환경**: JetPack 4.6 (Ubuntu 18.04, Python 3.6, ROS Melodic EOL)이라 새 패키지를 올리지 않는다. 녹화만 한다.
- **녹화 방법**: `gst-launch-1.0`으로 `nvarguscamerasrc` → mp4 한 줄. **센서 모드 1640×1232로 받아 820×616으로 축소**한다. 1280×720 모드는 센서를 크롭해서 화각이 줄고 캘리브레이션과 어긋난다.
  - JetBot 터미널(SSH 또는 Jupyter 터미널)에서 실행하고, Ctrl+C로 멈춘다(`-e`가 있어야 mp4가 깨지지 않는다). 카메라를 쓰는 노트북 커널이 켜져 있으면 먼저 끈다.
  - IMX219의 `sensor-mode=3`이 1640×1232다(JetPack 4.6 기준). 다른 모드 번호면 `nvarguscamerasrc` 실행 시 출력되는 모드 목록에서 1640×1232를 고른다.

```text
gst-launch-1.0 -e nvarguscamerasrc sensor-mode=3 \
  ! 'video/x-raw(memory:NVMM),width=1640,height=1232,framerate=30/1' \
  ! nvvidconv \
  ! 'video/x-raw(memory:NVMM),width=820,height=616' \
  ! nvv4l2h264enc bitrate=8000000 ! h264parse \
  ! mp4mux ! filesink location=board.mp4
```
- **환경 세팅 상한**: 1–2주 이상 쓰지 않는다. "영상 녹화해서 PC로 옮기기"까지만 되면 충분.
- **막히면 대안 경로**: iPhone 0.5× 초광각 영상(광각·롤링셔터 실험 대체 가능, `source: iphone`).

아래는 선택 레슨(28주차 옛 캡스톤)에서만 쓴다.

- **노출 고정**: `exposure: fixed` 조건은 `nvarguscamerasrc`의 노출·게인 범위를 고정해서 만든다.
- **정답 궤적이 없을 때 평가 방법**
  - 출발점으로 돌아오는 경로 → 복귀 오차 (`eval: return-to-start`)
  - 줄자로 잰 사각형 경로 → 모서리 위치 오차 (`eval: measured-square`)
  - (ROS 선택 트랙) 라이다 SLAM 결과를 기준 궤적으로 사용
- **통제 실험**: 같은 경로를 조건 하나만 바꿔 반복 주행 (회전 속도 / 조명 / 노출 고정 여부). 롤링셔터 효과는 직진보다 제자리 회전에서 크다.
- **이름 규칙**: `{장소}-{경로}-{조건}-{번호}` (예: `home-square-fast-02`)

## 5. 공개 데이터셋

| 데이터셋 | 용도 | 라이선스 | 비고 |
| --- | --- | --- | --- |
| TUM RGB-D | 11주차: 평가 코드(`ate`)와 조립 코드를 정답이 있는 데이터로 먼저 확인 (주 실습은 내 사진의 COLMAP 비교). 선택 22주차 C++ 포팅 | CC BY 4.0 | 정답 궤적 포함. `tum_tracks.py`로 트랙 JSON |
| KITTI Odometry | 선택 22주차 이후 확장 (C++ VO), 선택 25주차 PC 실습(Open3D, 기본 레슨은 합성 방 장면) | CC BY-NC-SA 3.0 | 출처 표기·동일조건 공유 의무. 강의 판매 시 사용 불가 → 자체 데이터로 교체 |
| EuRoC MAV | 선택 23–24주차 ESKF·VIO | 연구용 공개 | IMU + 스테레오 + 정답 궤적 (IMU 기준, §2 변환 필요) |
| TUM RS-VIO | 선택 28주차(옛 캡스톤) 롤링셔터 비교 | 데이터셋 페이지 확인 | 글로벌·롤링셔터 동시 촬영 |

- 핵심 경로의 주 데이터는 공개 데이터셋이 아니라 내가 찍은 방 사진이다(§0). TUM으로 M1 리포트를 내던 계획(2026-11-03)은 2026-11-27 재편으로 없어졌다.
- 사이트 샘플에는 §1 상한만큼만 잘라서 넣고, 페이지에 출처를 표기한다.
- 스크립트는 `datasets/` 폴더에 둔다. 있음: `calibrate.py`(4a주차), `export_matches.py`(5주차), `jetbot_to_std.py`(10주차), `colmap_tracks.py`·`tum_tracks.py`(11주차), `cpp_result.py`(선택 22주차). 예정: `euroc_to_std.py`(선택 23주차 전, T_BS 역행렬 없이·200Hz→20Hz 보간을 `--selftest`로 검증). 선택: `kitti_to_std.py`(KITTI 확장을 할 때). TUM은 `tum_tracks.py`가 원본 폴더를 바로 읽어서 `tum_to_std.py`는 만들지 않는다 (G0 2026-11-03).
- `datasets/jetbot_to_std.py`(10주차): 주행 영상 mp4 → 표준 시퀀스 폴더(`images/`, `timestamps.txt`, `meta.json`, 선택 `calib.json`). 기본 3장마다 1장, 결과는 `datasets/sequences/{name}/`(저장소에 올리지 않는다). `--selftest`로 합성 영상 검증.
- 스크립트는 PC 전용이며 사이트 빌드에 포함하지 않는다. Python 3.8 이상이 필요해서(`from __future__ import annotations`) JetBot(Python 3.6)에서는 돌리지 않는다. JetBot에서는 녹화(gst-launch)만 한다.
