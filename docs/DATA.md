# DATA

JetBot 수집 데이터와 공개 데이터셋을 같은 코드로 처리하기 위한 데이터 포맷 규격.

## 1. 원칙

- **로봇은 수집, PC·웹은 처리.** Jetson Nano에서는 기록만 하고 처리는 PC나 브라우저에서 한다.
- 모든 데이터는 아래 **표준 포맷**으로 변환한 뒤 사용한다. 데모와 core 코드는 표준 포맷만 읽는다.
- 사이트(`site/public/data/`)에는 짧은 샘플만 올린다 (시퀀스당 수 MB 이내). 긴 데이터는 브라우저에서 드래그앤드롭으로 로컬 파일을 연다.
- 회사 코드·내부 데이터는 절대 포함하지 않는다.

## 2. 표준 시퀀스 포맷

EuRoC와 비슷한 폴더 구조를 쓴다.

```
{sequence_name}/
├── meta.json            # 시퀀스 정보
├── calib.json           # 카메라 캘리브레이션
├── images/              # 프레임 이미지
│   ├── 000000.jpg
│   ├── 000001.jpg
│   └── ...
├── timestamps.txt       # 프레임별 시간
├── imu.csv              # (선택) IMU
├── odom.csv             # (선택) 휠 오도메트리
└── groundtruth.csv      # (선택) 정답 궤적
```

### meta.json
```jsonc
{
  "name": "home-square-slow-01",
  "source": "jetbot",            // jetbot | kitti | euroc
  "robot": "jetbot-basic",       // jetbot-basic | jetbot-ros
  "recorded_at": "2026-11-15",
  "path_desc": "거실 1m×1m 사각형, 저속",
  "conditions": { "speed": "slow", "lighting": "day", "exposure": "auto" },
  "eval": "loop-closure-error",  // groundtruth | loop-closure-error | measured-square
  "license": "own"               // own | kitti-noncommercial | euroc
}
```
`conditions`는 캡스톤 실험(속도·조명·노출 비교)에서 그룹을 나누는 키로 쓴다.

### timestamps.txt
- 한 줄에 하나, 이미지 번호 순서대로.
- 단위: 나노초 정수 (EuRoC와 동일).
```
0
33333333
66666666
```

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
- 월드 좌표계에서 본 카메라 포즈 (T_world_cam).

## 3. 캘리브레이션 (calib.json)

JetBot 카메라(IMX219-160)는 160° 광각이라 **어안(fisheye) 모델이 기본**이다. 4주차에서 핀홀 모델과 비교한다.

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
    "gyro_noise": null, "accel_noise": null
  },
  "wheel": {
    "radius_m": null,
    "baseline_m": null,
    "ticks_per_rev": null
  },
  "calibrated_at": "2026-11-10",
  "reproj_error_px": null
}
```

- 카메라가 흔들리거나 각도가 바뀌면 다시 캘리브레이션한다.
- 수집할 때 해상도는 캘리브레이션 해상도와 같아야 한다.

## 4. JetBot 수집 규칙

- **버전 확인**: 기본 JetBot은 카메라만, ROS 버전은 엔코더·IMU·RPLIDAR A1 포함. `meta.json`의 `robot`에 기록.
- **환경 세팅 상한**: Jetson Nano 환경 문제로 1~2주 이상 쓰지 않는다. "영상 녹화해서 PC로 옮기기"까지만 되면 충분.
- **해상도·FPS**: 처리 속도를 고려해 저해상도(예: 820×616) 30fps부터 시작.
- **정답 궤적이 없을 때 평가 방법**
  - 출발점으로 돌아오는 경로 → 복귀 오차 (`eval: loop-closure-error`)
  - 줄자로 잰 사각형 경로 → 모서리 위치 오차 (`eval: measured-square`)
  - (ROS 버전) 라이다 SLAM 결과를 기준 궤적으로 사용
- **캡스톤용 통제 실험**: 같은 경로를 조건 하나만 바꿔 반복 주행 (속도 / 조명 / 노출 고정 여부).
- **이름 규칙**: `{장소}-{경로}-{조건}-{번호}` (예: `home-square-fast-02`)

## 5. 공개 데이터셋

| 데이터셋 | 용도 | 라이선스 | 비고 |
| --- | --- | --- | --- |
| KITTI Odometry | 7, 11~12주 VO | 비상업 (CC BY-NC-SA) | 강의 판매 시 사용 불가 → 자체 데이터로 교체 |
| EuRoC MAV | 13~14주 EKF·VIO (기본 JetBot일 때) | 연구용 공개 | IMU + 스테레오 + 정답 궤적 |

- 사이트 샘플에는 짧은 구간(수백 프레임 이하)만 잘라서 넣는다.
- 변환 스크립트는 `datasets/` 폴더에 둔다: `kitti_to_std.py`, `euroc_to_std.py`, `jetbot_to_std.py`
- 변환 스크립트는 PC 전용이며 사이트 빌드에 포함하지 않는다.
