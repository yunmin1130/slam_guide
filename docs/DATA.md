# DATA

JetBot 수집 데이터와 공개 데이터셋을 같은 코드로 처리하기 위한 데이터 포맷 규격.

## 1. 원칙

- **로봇은 수집, PC·웹은 처리.** Jetson Nano에서는 기록만 하고 처리는 PC나 브라우저에서 한다.
- **무거운 영상 처리는 PC Python.** 캘리브레이션과 특징점 추출·매칭은 `datasets/` 스크립트가 하고, 결과를 JSON으로 내보낸다. 브라우저는 JSON을 읽어 수학과 시각화만 한다.
- 모든 데이터는 아래 **표준 포맷**으로 변환한 뒤 사용한다. 데모와 core 코드는 표준 포맷만 읽는다.
- 사이트(`site/public/data/`) 샘플 상한: **시퀀스당 100프레임 이하, JPEG로 축소, 5MB 이내.** (GitHub 파일 한도 100MB, KITTI PNG 300프레임은 100MB를 넘는다.) 긴 데이터는 브라우저에서 드래그앤드롭으로 로컬 파일을 연다.
- 회사 코드·내부 데이터는 절대 포함하지 않는다.

## 2. 표준 시퀀스 포맷

EuRoC와 비슷한 폴더 구조를 쓴다.

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
- `conditions`는 캡스톤 실험(회전 속도·조명·노출 비교)에서 그룹을 나누는 키로 쓴다. `exposure`는 `auto | fixed`.
- `eval: return-to-start`는 출발점 복귀 오차다. 루프 클로저(9주차)와 다른 개념이라 이름을 구분한다.

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

JetBot 카메라(IMX219-160)는 160° 광각이라 **어안(fisheye) 모델이 기본**이다. 4주차에서 핀홀 모델과 비교한다. 캘리브레이션은 PC Python `cv2.fisheye.calibrate`로 하고 결과를 이 파일로 쓴다 (`datasets/calibrate.py`).

```jsonc
{
  "camera": {
    "model": "fisheye",                 // pinhole | fisheye
    "width": 820,
    "height": 616,
    "fx": 0, "fy": 0, "cx": 0, "cy": 0,
    "distortion": [0, 0, 0, 0],         // pinhole: k1,k2,p1,p2,(k3) / fisheye: k1~k4 (Kannala-Brandt)
    "rolling_shutter": true,
    "readout_time_ms": null             // 측정 가능하면 기록 (캡스톤용)
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
  "comparison": {                       // 4주차: 같은 교차점으로 두 모델을 맞춘 결과 (calibrate.py가 씀)
    "views": 0,                         // 판을 찾아 쓴 프레임 수
    "pinhole": { "fx": 0, "fy": 0, "cx": 0, "cy": 0, "distortion": [0, 0, 0, 0, 0],
                 "rms_px": 0, "center_rms_px": 0, "edge_rms_px": 0, "edge_points": 0 },
    "fisheye": { "...": "pinhole과 같은 필드, distortion은 k1~k4" }
  }
}
```

- `datasets/calibrate.py`가 이 파일을 쓴다. 이미 파일이 있으면 `imu`·`wheel`은 그대로 두고 `camera`·`comparison`만 갱신한다. 합성 데이터로 스크립트를 검증하려면 `--selftest`.
- "가장자리"는 이미지 중심에서 반대각선 길이의 60%보다 먼 교차점이다. 광각 렌즈는 여기서 핀홀과 어안의 차이가 크게 난다.
- 카메라가 흔들리거나 각도가 바뀌면 다시 캘리브레이션한다.
- 수집할 때 해상도·센서 모드는 캘리브레이션 때와 같아야 한다.

## 4. JetBot 수집 규칙

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
- **노출 고정**: 캡스톤의 `exposure: fixed` 조건은 `nvarguscamerasrc`의 노출·게인 범위를 고정해서 만든다.
- **환경 세팅 상한**: 1~2주 이상 쓰지 않는다. "영상 녹화해서 PC로 옮기기"까지만 되면 충분.
- **막히면 대안 경로**: iPhone 0.5× 초광각 영상(광각·롤링셔터 실험 대체 가능, `source: iphone`) + TUM RGB-D(CC BY 4.0)·EuRoC.
- **정답 궤적이 없을 때 평가 방법**
  - 출발점으로 돌아오는 경로 → 복귀 오차 (`eval: return-to-start`)
  - 줄자로 잰 사각형 경로 → 모서리 위치 오차 (`eval: measured-square`)
  - (ROS 선택 트랙) 라이다 SLAM 결과를 기준 궤적으로 사용
- **캡스톤용 통제 실험**: 같은 경로를 조건 하나만 바꿔 반복 주행 (회전 속도 / 조명 / 노출 고정 여부). 롤링셔터 효과는 직진보다 제자리 회전에서 크다.
- **이름 규칙**: `{장소}-{경로}-{조건}-{번호}` (예: `home-square-fast-02`)

## 5. 공개 데이터셋

| 데이터셋 | 용도 | 라이선스 | 비고 |
| --- | --- | --- | --- |
| KITTI Odometry | 11주차 VO, 12주차 C++ VO | CC BY-NC-SA 3.0 | 출처 표기·동일조건 공유 의무. 강의 판매 시 사용 불가 → 자체 데이터로 교체 |
| EuRoC MAV | 13~14주차 EKF·VIO (기본 트랙) | 연구용 공개 | IMU + 스테레오 + 정답 궤적 (IMU 기준, §2 변환 필요) |
| TUM RGB-D | JetBot 대안, 실내 VO | CC BY 4.0 | 정답 궤적 포함 |
| TUM RS-VIO | 캡스톤 롤링셔터 비교 | 데이터셋 페이지 확인 | 글로벌·롤링셔터 동시 촬영 |

- 사이트 샘플에는 §1 상한만큼만 잘라서 넣고, 페이지에 출처를 표기한다.
- 스크립트는 `datasets/` 폴더에 둔다: `kitti_to_std.py`, `euroc_to_std.py`, `tum_to_std.py`, `jetbot_to_std.py`, `calibrate.py`, `export_matches.py`
- `datasets/jetbot_to_std.py`(10주차): 주행 영상 mp4 → 표준 시퀀스 폴더(`images/`, `timestamps.txt`, `meta.json`, 선택 `calib.json`). 기본 3장마다 1장, 결과는 `datasets/sequences/{name}/`(저장소에 올리지 않는다). `--selftest`로 합성 영상 검증.
- 스크립트는 PC 전용이며 사이트 빌드에 포함하지 않는다.
