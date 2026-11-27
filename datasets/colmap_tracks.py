#!/usr/bin/env python3
"""
COLMAP 텍스트 모델 → 특징점 트랙 JSON + 기준 궤적 (CURRICULUM 11주차 미니 SfM, DATA §2 tracks 형식).

COLMAP이 이미 찾아 둔 2D 특징점과 그 점이 속한 3D 점 번호(POINT3D_ID)를 읽어,
사진마다 (추적 번호 id, 픽셀 u, v)를 남긴다. 같은 POINT3D_ID = 같은 3D 점이라 그대로 트랙이 된다.
COLMAP의 카메라 자세는 비교 기준으로 붙인다 (정답이 아니라 강한 기준이다).
사이트의 "내 SfM 돌리기"(11d)가 이 파일을 읽어 내 함수로 자세를 다시 구하고 COLMAP과 비교한다.

이 스크립트가 정하는 것 (레슨 11d, DATA §2에 같은 설명):
  - 사진 순서: 파일 이름순. COLMAP이 등록하지 못한 사진은 images.txt에 없으므로 빠진다.
  - 시각: 사진에는 시각이 없어서 0, 1, 2, … (순서 번호)를 쓴다.
  - 왜곡: 특징점을 자기 카메라 모델로 펴서 정규화 좌표로 바꾼 뒤, 기준 카메라의 핀홀 K로 다시 투영한다.
    그래서 카메라가 여러 대(사진마다 내부 파라미터가 다름)여도 결과는 K 하나의 핀홀 픽셀이다.
  - 크기: 긴 변이 --long-side(기본 640)가 되게 K와 픽셀을 같은 배율로 줄인다 (기하는 그대로다).
    실행기의 픽셀 기준(2px, 6px)이 640×480 영상에 맞춰져 있어서다.
  - 자세: COLMAP은 월드→카메라 (QW QX QY QZ, TX TY TZ). 여기서는 카메라→월드로 뒤집는다:
    카메라 중심 C = −Rᵀt, 쿼터니언은 켤레 (qw, −qx, −qy, −qz).

준비 (PC): pip install numpy
  COLMAP 결과가 바이너리(.bin)면 먼저 텍스트로 바꾼다 (출력 폴더는 미리 만든다):
    colmap model_converter --input_path sparse/0 --output_path sparse_txt --output_type TXT

사용:
  python datasets/colmap_tracks.py datasets/raw/room01/colmap/sparse_txt --name room01
  python datasets/colmap_tracks.py path/to/model_txt --name room01 --images datasets/raw/room01/images
  python datasets/colmap_tracks.py --selftest      # 합성 모델로 스크립트 검증
기본 저장: datasets/tracks/{name}.json 과 datasets/tracks/{name}-colmap.txt (이미 있으면 --force)
"""
from __future__ import annotations

import argparse
import dataclasses
import json
import os
import re
import sys
import tempfile
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

try:
    import numpy as np
except ImportError:  # pragma: no cover - 안내만
    sys.exit("numpy가 필요하다: pip install numpy")

DATASETS_DIR = Path(__file__).resolve().parent
DEFAULT_OUT_DIR = DATASETS_DIR / "tracks"
FORMAT = "slam-guide-tracks"
VERSION = 1

# COLMAP 카메라 모델의 파라미터 순서 (src/colmap/sensor/models/*.h 의 params_info, 2026-11-27 확인)
MODEL_PARAMS: dict[str, tuple[str, ...]] = {
    "SIMPLE_PINHOLE": ("f", "cx", "cy"),
    "PINHOLE": ("fx", "fy", "cx", "cy"),
    "SIMPLE_RADIAL": ("f", "cx", "cy", "k1"),
    "RADIAL": ("f", "cx", "cy", "k1", "k2"),
    "OPENCV": ("fx", "fy", "cx", "cy", "k1", "k2", "p1", "p2"),
}

DEFAULT_NAME = "colmap-model"
DEFAULT_LONG_SIDE = 640
DEFAULT_MAX_FEATURES = 400
# 사이트(lib/tracksFile.ts)와 같은 상한
MAX_FRAMES_LIMIT = 2000
MAX_FEATURES_LIMIT = 2000
MAX_TOTAL_FEATURES = 600_000
MIN_FRAMES = 3
# 왜곡 펴기: 고정점 반복. 다시 왜곡시켜 원래 자리로 돌아오지 않는 점은 버린다 (정규화 좌표 기준)
UNDISTORT_ITERATIONS = 100
UNDISTORT_TOLERANCE = 1e-9
# 쿼터니언 크기가 이 범위 밖이면 손상된 줄로 본다 (안이면 1로 맞춘다)
QUAT_NORM_RANGE = (0.5, 1.5)
# 이웃한 두 사진이 함께 본 점이 이보다 적으면 실행기의 PnP 등록이 끊길 수 있다 (voJob.ts minTrackInliers)
WEAK_OVERLAP = 30
PIXEL_DECIMALS = 3
POSE_DECIMALS = 6
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".heic", ".tif", ".tiff", ".bmp"}
NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")
# Windows에서 파일 이름으로 쓸 수 없는 예약어 (확장자가 붙어도 안 된다)
WINDOWS_RESERVED = {"con", "prn", "aux", "nul", *(f"com{i}" for i in range(1, 10)), *(f"lpt{i}" for i in range(1, 10))}


class InputError(Exception):
    """사용자 입력이 잘못됨 (메시지를 그대로 보여주고 끝낸다)"""


@dataclass(frozen=True)
class Camera:
    camera_id: int
    model: str
    width: int
    height: int
    fx: float
    fy: float
    cx: float
    cy: float
    k1: float = 0.0
    k2: float = 0.0
    p1: float = 0.0
    p2: float = 0.0


@dataclass(frozen=True)
class Image:
    image_id: int
    name: str
    camera_id: int
    # 월드 → 카메라 (COLMAP 원본 그대로): p_cam = R · p_world + t
    q_cw: np.ndarray  # (4,) qw qx qy qz, 크기 1
    t_cw: np.ndarray  # (3,)
    xy: np.ndarray  # (N, 2) 원본 픽셀
    point_ids: np.ndarray  # (N,) POINT3D_ID, 3D 점이 없으면 -1


@dataclass(frozen=True)
class Options:
    name: str
    long_side: int
    max_features: int
    camera_id: int | None


# ---- 숫자·회전 도우미 ----


def to_float(text: str, what: str) -> float:
    try:
        v = float(text)
    except ValueError:
        raise InputError(f"{what}이 숫자가 아니다: {text}") from None
    if not np.isfinite(v):
        raise InputError(f"{what}이 유한한 숫자가 아니다: {text}")
    return v


def to_int(text: str, what: str) -> int:
    try:
        return int(text)
    except ValueError:
        raise InputError(f"{what}이 정수가 아니다: {text}") from None


def quat_to_mat(q: np.ndarray) -> np.ndarray:
    """단위 쿼터니언 [w, x, y, z] (Hamilton) → 회전 행렬"""
    w, x, y, z = q
    return np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
            [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
            [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
        ]
    )


def camera_to_world(q_cw: np.ndarray, t_cw: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """COLMAP 월드→카메라 (q, t) → 카메라→월드: (카메라 중심 C = −Rᵀt, 켤레 쿼터니언 [w, x, y, z])"""
    center = -quat_to_mat(q_cw).T @ t_cw
    q_wc = np.array([q_cw[0], -q_cw[1], -q_cw[2], -q_cw[3]])
    # q와 −q는 같은 회전이다. w ≥ 0 쪽으로 통일한다
    return center, (q_wc if q_wc[0] >= 0 else -q_wc)


# ---- COLMAP 텍스트 모델 읽기 ----


def read_lines(path: Path) -> list[str]:
    """주석('#')을 뺀 줄들. 빈 줄은 남긴다 (images.txt에서 특징점이 없는 사진의 둘째 줄이 빈 줄이다)"""
    if not path.is_file():
        hint = " (.bin만 있으면 colmap model_converter --output_type TXT 로 먼저 바꾼다)" if path.with_suffix(".bin").is_file() else ""
        raise InputError(f"파일이 없다: {path}{hint}")
    try:
        text = path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError:
        raise InputError(f"UTF-8 글자가 아닌 파일이다: {path}") from None
    return [line.strip() for line in text.splitlines() if not line.lstrip().startswith("#")]


def parse_camera(row: list[str]) -> Camera:
    if len(row) < 4:
        raise InputError(f"cameras.txt 줄이 이상하다: {' '.join(row)}")
    camera_id = to_int(row[0], "cameras.txt의 CAMERA_ID")
    model = row[1]
    if model not in MODEL_PARAMS:
        raise InputError(
            f"카메라 {camera_id}의 모델 {model}은 지원하지 않는다 (지원: {', '.join(MODEL_PARAMS)}). "
            "colmap image_undistorter로 핀홀 모델을 만든 뒤 그 모델을 넣어"
        )
    names = MODEL_PARAMS[model]
    if len(row) != 4 + len(names):
        raise InputError(f"카메라 {camera_id} ({model})의 파라미터가 {len(names)}개가 아니다: {' '.join(row[4:])}")
    p = {n: to_float(v, f"카메라 {camera_id}의 {n}") for n, v in zip(names, row[4:])}
    width, height = to_int(row[2], "WIDTH"), to_int(row[3], "HEIGHT")
    fx, fy = p.get("fx", p.get("f", 0.0)), p.get("fy", p.get("f", 0.0))
    if width <= 0 or height <= 0 or fx <= 0 or fy <= 0:
        raise InputError(f"카메라 {camera_id}의 크기나 초점거리가 양수가 아니다")
    return Camera(camera_id, model, width, height, fx, fy, p["cx"], p["cy"], p.get("k1", 0.0), p.get("k2", 0.0), p.get("p1", 0.0), p.get("p2", 0.0))


def read_cameras(model_dir: Path) -> dict[int, Camera]:
    cameras: dict[int, Camera] = {}
    for line in read_lines(model_dir / "cameras.txt"):
        if not line:
            continue
        cam = parse_camera(line.split())
        if cam.camera_id in cameras:
            raise InputError(f"cameras.txt에 같은 CAMERA_ID가 두 번 있다: {cam.camera_id}")
        cameras[cam.camera_id] = cam
    if not cameras:
        raise InputError("cameras.txt에 카메라가 없다")
    return cameras


def parse_points2d(line: str, name: str) -> tuple[np.ndarray, np.ndarray]:
    """images.txt 둘째 줄 'X Y POINT3D_ID …' → (픽셀 (N, 2), 점 번호 (N,))"""
    tokens = line.split()
    if len(tokens) % 3 != 0:
        raise InputError(f"{name}의 특징점 줄이 (X, Y, POINT3D_ID) 세 개씩이 아니다")
    try:
        values = np.array(tokens, dtype=np.float64).reshape(-1, 3)
        ids = np.array(tokens[2::3], dtype=np.int64)
    except (ValueError, OverflowError):
        raise InputError(f"{name}의 특징점 줄에 숫자가 아닌 값이 있다") from None
    if not np.all(np.isfinite(values[:, :2])):
        raise InputError(f"{name}의 특징점 좌표에 NaN·무한대가 있다")
    return values[:, :2], ids


def parse_image(header: str, points_line: str) -> Image:
    row = header.split()
    if len(row) < 10:
        raise InputError(f"images.txt 첫째 줄이 이상하다 (IMAGE_ID QW QX QY QZ TX TY TZ CAMERA_ID NAME): {header[:80]}")
    name = " ".join(row[9:])
    q = np.array([to_float(v, f"{name}의 쿼터니언") for v in row[1:5]])
    n = float(np.linalg.norm(q))
    if not QUAT_NORM_RANGE[0] <= n <= QUAT_NORM_RANGE[1]:
        raise InputError(f"{name}의 쿼터니언 크기가 1이 아니다 ({n:.3f})")
    t = np.array([to_float(v, f"{name}의 이동") for v in row[5:8]])
    xy, ids = parse_points2d(points_line, name)
    return Image(to_int(row[0], "IMAGE_ID"), name, to_int(row[8], f"{name}의 CAMERA_ID"), q / n, t, xy, ids)


def natural_key(name: str) -> tuple[list[int | str], str]:
    """사람이 읽는 이름순: 숫자는 숫자로 비교하고(IMG_2 < IMG_10) 글자는 대소문자를 무시한다.
    re.split의 결과는 [글자, 숫자, 글자, …]로 번갈아 나와서 같은 자리끼리는 늘 같은 종류다. 끝의 원래 이름은 동점 정리용"""
    parts = re.split(r"(\d+)", name)
    return [int(c) if i % 2 else c.lower() for i, c in enumerate(parts)], name


def looks_like_header(line: str) -> bool:
    """images.txt의 사진 줄(IMAGE_ID QW … CAMERA_ID NAME)처럼 보이는가. 특징점 줄은 숫자만 있어서 구별된다"""
    row = line.split()
    if len(row) < 10:
        return False
    try:
        int(row[0]), int(row[8]), [float(v) for v in row[1:8]]
    except ValueError:
        return False
    return not all(_is_number(v) for v in row[9:])


def _is_number(text: str) -> bool:
    try:
        float(text)
    except ValueError:
        return False
    return True


def read_images(model_dir: Path) -> list[Image]:
    """등록된 사진들 (natural_key 이름순). 사진 하나가 두 줄이고, 특징점이 없는 사진은 둘째 줄이 빈 줄이다.
    사진 이름은 첫째 줄의 10번째 칸부터 끝까지를 공백 하나로 이어 붙인다 (이름 안의 연속 공백은 하나로 줄어든다)"""
    lines = read_lines(model_dir / "images.txt")
    images: list[Image] = []
    k = 0
    while k < len(lines):
        if not lines[k]:
            k += 1
            continue
        points_line = lines[k + 1] if k + 1 < len(lines) else ""
        if looks_like_header(points_line):
            raise InputError(
                f"images.txt 두 줄 구조가 깨졌다: {lines[k][:60]} 다음 줄이 특징점 줄이 아니라 다음 사진 줄이다. "
                "특징점이 없는 사진의 빈 둘째 줄이 지워진 것 같다 (편집기가 빈 줄을 지웠는지 보고, colmap model_converter로 다시 내보내)"
            )
        images.append(parse_image(lines[k], points_line))
        k += 2
    for what, values in (("IMAGE_ID", [im.image_id for im in images]), ("NAME", [im.name for im in images])):
        dup = [v for v, c in Counter(values).items() if c > 1]
        if dup:
            raise InputError(f"images.txt에 같은 {what}가 두 번 있다: {dup[0]}")
    return sorted(images, key=lambda im: natural_key(im.name))


def read_points3d(model_dir: Path) -> dict[int, tuple[int, float]]:
    """POINT3D_ID → (트랙 길이, 재투영 오차 px). 좌표는 쓰지 않는다 (3D 점은 내 함수로 다시 만든다)"""
    points: dict[int, tuple[int, float]] = {}
    for line in read_lines(model_dir / "points3D.txt"):
        if not line:
            continue
        row = line.split()
        if len(row) < 8 or (len(row) - 8) % 2 != 0:
            raise InputError(f"points3D.txt 줄이 이상하다: {line[:80]}")
        points[to_int(row[0], "POINT3D_ID")] = ((len(row) - 8) // 2, to_float(row[7], "points3D.txt의 ERROR"))
    if not points:
        raise InputError("points3D.txt에 점이 없다")
    return points


# ---- 왜곡 펴기와 다시 투영 ----


def distortion(cam: Camera, x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """COLMAP Distortion(): 정규화 좌표 (x, y)에 더해지는 양 (dx, dy). OPENCV 식이고 나머지 모델은 0인 항이 빠진 것"""
    r2 = x * x + y * y
    radial = cam.k1 * r2 + cam.k2 * r2 * r2
    dx = x * radial + 2 * cam.p1 * x * y + cam.p2 * (r2 + 2 * x * x)
    dy = y * radial + 2 * cam.p2 * x * y + cam.p1 * (r2 + 2 * y * y)
    return dx, dy


def to_normalized(cam: Camera, xy: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """원본 픽셀 → 왜곡을 편 정규화 좌표 (N, 2)와, 제대로 펴졌는지 (N,)"""
    xd = (xy[:, 0] - cam.cx) / cam.fx
    yd = (xy[:, 1] - cam.cy) / cam.fy
    if not any((cam.k1, cam.k2, cam.p1, cam.p2)):
        return np.stack([xd, yd], axis=1), np.ones(len(xy), bool)
    x, y = xd.copy(), yd.copy()
    # 발산하는 점(가장자리, 큰 왜곡)은 inf·NaN이 되므로 경고를 끄고, 아직 움직이는 유한한 점만 계속 반복한다
    with np.errstate(all="ignore"):
        active = np.ones(len(x), bool)
        for _ in range(UNDISTORT_ITERATIONS):  # 고정점 반복: x ← x_d − d(x)
            idx = np.flatnonzero(active)
            if idx.size == 0:
                break
            dx, dy = distortion(cam, x[idx], y[idx])
            x_new, y_new = xd[idx] - dx, yd[idx] - dy
            step = np.maximum(np.abs(x_new - x[idx]), np.abs(y_new - y[idx]))
            x[idx], y[idx] = x_new, y_new
            active[idx] = np.isfinite(step) & (step >= UNDISTORT_TOLERANCE)
        # 다시 왜곡시켜 원래 자리로 돌아오지 않는 점(발산·진동)은 버린다
        dx, dy = distortion(cam, x, y)
        ok = np.isfinite(x) & np.isfinite(y) & (np.abs(x + dx - xd) < 1e-6) & (np.abs(y + dy - yd) < 1e-6)
    return np.stack([x, y], axis=1), ok


def output_camera(ref: Camera, long_side: int) -> tuple[dict, float]:
    """기준 카메라의 핀홀 K를 긴 변이 long_side가 되게 줄인 것과 그 배율 (0이면 줄이지 않는다, 키우지는 않는다)"""
    longest = max(ref.width, ref.height)
    scale = min(1.0, long_side / longest) if long_side > 0 else 1.0
    camera = {
        "fx": ref.fx * scale,
        "fy": ref.fy * scale,
        "cx": ref.cx * scale,
        "cy": ref.cy * scale,
        "width": max(1, round(ref.width * scale)),
        "height": max(1, round(ref.height * scale)),
    }
    return camera, scale


def pick_reference(cameras: dict[int, Camera], images: list[Image], given: int | None) -> Camera:
    """K를 빌려 올 기준 카메라: 지정한 것, 없으면 사진이 가장 많은 것 (같으면 번호가 작은 것)"""
    if given is not None:
        if given not in cameras:
            raise InputError(f"--camera-id {given}가 cameras.txt에 없다 (있는 번호: {sorted(cameras)})")
        return cameras[given]
    count = Counter(im.camera_id for im in images)
    return cameras[min(count, key=lambda c: (-count[c], c))]


# ---- 트랙 만들기 ----


def frame_features(im: Image, cam: Camera, out_cam: dict, points: dict[int, tuple[int, float]], max_features: int) -> tuple[list[list[float]], int]:
    """사진 한 장의 [[id, u, v], ...] (id 오름차순)와 버린 개수 (펴지지 않은 점 + 같은 id 중복)"""
    seen = im.point_ids >= 0
    missing = [int(i) for i in im.point_ids[seen] if int(i) not in points]
    if missing:
        raise InputError(f"{im.name}의 POINT3D_ID {missing[0]}이 points3D.txt에 없다 (세 파일이 같은 모델인지 확인해)")
    xyn, ok = to_normalized(cam, im.xy[seen])
    ids = im.point_ids[seen]
    u = out_cam["fx"] * xyn[:, 0] + out_cam["cx"]
    v = out_cam["fy"] * xyn[:, 1] + out_cam["cy"]
    best: dict[int, tuple[float, float]] = {}
    dropped = 0
    for i, uu, vv, good in zip(ids.tolist(), u.tolist(), v.tolist(), ok.tolist()):
        if not good or i in best:
            dropped += 1
            continue
        best[i] = (uu, vv)
    # 너무 많으면 여러 사진에서 본 점(긴 트랙)부터, 같으면 재투영 오차가 작은 점부터 남긴다
    keep = sorted(best, key=lambda i: (-points[i][0], points[i][1], i))[:max_features]
    return [[i, round(best[i][0], PIXEL_DECIMALS), round(best[i][1], PIXEL_DECIMALS)] for i in sorted(keep)], dropped


def pose_row(im: Image) -> list[float]:
    """기준 자세 T_world_cam: [cx, cy, cz, qw, qx, qy, qz] (DATA §2: w가 먼저)"""
    center, q_wc = camera_to_world(im.q_cw, im.t_cw)
    return [round(float(v), POSE_DECIMALS) for v in (*center, *q_wc)]


def convert(model_dir: Path, opts: Options) -> dict:
    if not model_dir.is_dir():
        raise InputError(f"모델 폴더가 없다: {model_dir}")
    if not NAME_PATTERN.match(opts.name) or opts.name.split(".")[0].lower() in WINDOWS_RESERVED:
        raise InputError(f"--name은 영문·숫자·_.- 64자 이하여야 한다: {opts.name}")
    cameras = read_cameras(model_dir)
    images = read_images(model_dir)
    points = read_points3d(model_dir)
    if not MIN_FRAMES <= len(images) <= MAX_FRAMES_LIMIT:
        raise InputError(f"등록된 사진이 {len(images)}장이다 ({MIN_FRAMES}~{MAX_FRAMES_LIMIT}장이어야 한다)")
    unknown = [im.name for im in images if im.camera_id not in cameras]
    if unknown:
        raise InputError(f"{unknown[0]}의 CAMERA_ID가 cameras.txt에 없다")
    ref = pick_reference(cameras, images, opts.camera_id)
    out_cam, scale = output_camera(ref, opts.long_side)
    built = [frame_features(im, cameras[im.camera_id], out_cam, points, opts.max_features) for im in images]
    frames = [{"t": float(k), "features": feats} for k, (feats, _) in enumerate(built)]
    if sum(len(f["features"]) for f in frames) > MAX_TOTAL_FEATURES:
        raise InputError(f"특징점이 모두 {MAX_TOTAL_FEATURES}개를 넘는다. --max-features를 줄여")
    return {
        "format": FORMAT,
        "version": VERSION,
        "name": opts.name,
        "source": "colmap",
        "license": "own",
        "camera": out_cam,
        "every": 1,
        "pixel_scale": scale,
        "reference_camera_id": ref.camera_id,
        "dropped_features": sum(d for _, d in built),
        "images": [im.name for im in images],
        "frames": frames,
        "groundtruth": [pose_row(im) for im in images],
    }


def tum_trajectory(data: dict) -> str:
    """기준 궤적을 TUM 형식으로: 줄마다 '시각 tx ty tz qx qy qz qw' (T_world_cam, 쿼터니언은 w가 마지막)"""
    lines = []
    for frame, (cx, cy, cz, qw, qx, qy, qz) in zip(data["frames"], data["groundtruth"]):
        lines.append(f"{frame['t']:.6f} {cx:.6f} {cy:.6f} {cz:.6f} {qx:.6f} {qy:.6f} {qz:.6f} {qw:.6f}")
    # 머리줄은 ASCII만 쓴다 (cp949로 읽는 Windows 도구가 UTF-8 한글에서 멈추지 않게)
    head = "# timestamp tx ty tz qx qy qz qw (COLMAP reference, T_world_cam, timestamp = photo index, arbitrary scale)"
    return head + "\n" + "\n".join(lines) + "\n"


# ---- 요약 ----


def overlaps(data: dict) -> list[int]:
    """이웃한 두 사진이 함께 본 점 수"""
    sets = [{f[0] for f in frame["features"]} for frame in data["frames"]]
    return [len(a & b) for a, b in zip(sets, sets[1:])]


def unregistered(images_dir: Path, registered: list[str]) -> list[str]:
    """사진 폴더에는 있는데 COLMAP 모델에는 없는 파일 (등록 실패)"""
    if not images_dir.is_dir():
        raise InputError(f"사진 폴더가 없다: {images_dir}")
    known = set(registered)
    files = sorted((p.relative_to(images_dir).as_posix() for p in images_dir.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES), key=natural_key)
    return [f for f in files if f not in known]


def summary(data: dict) -> str:
    counts = [len(f["features"]) for f in data["frames"]]
    shared = overlaps(data)
    cam = data["camera"]
    lines = [
        f"사진 {len(counts)}장 (이름순, 시각 0–{len(counts) - 1}), 특징점 평균 {np.mean(counts):.0f}개 (최소 {min(counts)})",
        f"카메라 {cam['width']}×{cam['height']}, fx {cam['fx']:.1f}, fy {cam['fy']:.1f} (기준 카메라 {data['reference_camera_id']}, 배율 {data['pixel_scale']:.4f})",
        f"이웃 사진이 함께 본 점: 중앙값 {int(np.median(shared))}개, 최소 {min(shared)}개",
    ]
    if data["dropped_features"]:
        lines.append(f"버린 특징점 {data['dropped_features']}개 (왜곡이 펴지지 않았거나 한 사진에 같은 점이 두 번)")
    weak = [k for k, n in enumerate(shared) if n < WEAK_OVERLAP]
    if weak:
        pairs = ", ".join(f"{k}–{k + 1}" for k in weak[:5])
        lines.append(f"주의: 함께 본 점이 {WEAK_OVERLAP}개보다 적은 이웃 쌍이 {len(weak)}곳 있다 ({pairs}). 그 자리에서 등록이 끊길 수 있다")
    return "\n".join(lines)


# ---- 저장 ----


def check_out(out: Path, suffix: str, force: bool) -> None:
    if out.suffix.lower() != suffix:
        raise InputError(f"저장 파일은 {suffix}이어야 한다: {out}")
    if out.stem.split(".")[0].lower() in WINDOWS_RESERVED:
        raise InputError(f"Windows에서 쓸 수 없는 파일 이름이다: {out.name}")
    if out.is_symlink():
        raise InputError(f"저장 파일이 심볼릭 링크다 (링크를 지우거나 다른 이름을 써): {out}")
    if out.exists() and not out.is_file():
        raise InputError(f"파일이 아니다: {out}")
    if out.exists() and not force:
        raise InputError(f"이미 있다: {out} (덮어쓰려면 --force)")
    # 기본 폴더는 만들어 주고, 다른 폴더는 이미 있어야 한다 (오타로 새 폴더 트리가 생기지 않게)
    if out.parent.resolve() != DEFAULT_OUT_DIR.resolve() and not out.parent.is_dir():
        raise InputError(f"저장할 폴더가 없다: {out.parent}")


def write_text(out: Path, text: str, suffix: str, force: bool) -> None:
    """임시 파일에 다 쓴 뒤 바꿔 끼운다 (중간에 멈춰도 반쯤 쓴 파일이 남지 않게)"""
    check_out(out, suffix, force)
    out.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=out.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        os.replace(tmp, out)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def to_json(data: dict) -> str:
    try:
        # NaN은 브라우저 JSON.parse가 못 읽으므로 쓰기 전에 막는다
        return json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    except ValueError as e:
        raise InputError(f"JSON에 넣을 수 없는 값이 있다 (NaN 등): {e}") from None


# ---- 명령줄 ----


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="COLMAP 텍스트 모델 → 특징점 트랙 JSON + 기준 궤적 (11주차 미니 SfM)")
    ap.add_argument("model", nargs="?", help="COLMAP 텍스트 모델 폴더 (cameras.txt, images.txt, points3D.txt가 있는 곳)")
    ap.add_argument("--name", default=DEFAULT_NAME, help=f"결과 이름 (기본 {DEFAULT_NAME}). 파일 이름과 화면에 쓴다")
    ap.add_argument("--images", help="사진 폴더. 주면 COLMAP이 등록하지 못한 사진 이름을 알려준다")
    ap.add_argument("--long-side", type=int, default=DEFAULT_LONG_SIDE, help=f"긴 변이 이 픽셀이 되게 K와 좌표를 줄인다 (기본 {DEFAULT_LONG_SIDE}, 0이면 그대로)")
    ap.add_argument("--max-features", type=int, default=DEFAULT_MAX_FEATURES, help=f"사진당 특징점 상한 (기본 {DEFAULT_MAX_FEATURES}, 긴 트랙부터 남긴다)")
    ap.add_argument("--camera-id", type=int, help="K를 빌려 올 기준 카메라 번호 (기본: 사진이 가장 많은 카메라)")
    ap.add_argument("--out", help="저장할 .json (기본 datasets/tracks/{name}.json, 다른 곳이면 폴더가 이미 있어야 한다)")
    ap.add_argument("--traj-out", help="기준 궤적 .txt (기본: --out과 같은 폴더의 {name}-colmap.txt)")
    ap.add_argument("--force", action="store_true", help="이미 있는 파일을 덮어쓴다")
    ap.add_argument("--selftest", action="store_true", help="합성 COLMAP 모델로 스크립트를 검사한다")
    return ap.parse_args()


def run(args: argparse.Namespace) -> None:
    if not args.model:
        raise InputError("모델 폴더를 줘야 한다 (도움말: --help)")
    if not (args.long_side == 0 or 160 <= args.long_side <= 8000) or not 20 <= args.max_features <= MAX_FEATURES_LIMIT:
        raise InputError(f"설정 범위: --long-side 0 또는 160~8000, --max-features 20~{MAX_FEATURES_LIMIT}")
    opts = Options(name=args.name, long_side=args.long_side, max_features=args.max_features, camera_id=args.camera_id)
    out = Path(args.out) if args.out else DEFAULT_OUT_DIR / f"{args.name}.json"
    traj = Path(args.traj_out) if args.traj_out else out.with_name(f"{out.stem}-colmap.txt")
    # 계산하기 전에 저장 위치부터 확인한다
    check_out(out, ".json", args.force)
    check_out(traj, ".txt", args.force)
    data = convert(Path(args.model), opts)
    write_text(out, to_json(data), ".json", args.force)
    write_text(traj, tum_trajectory(data), ".txt", args.force)
    print(summary(data))
    if args.images:
        missing = unregistered(Path(args.images), data["images"])
        shown = ", ".join(missing[:10]) + (" …" if len(missing) > 10 else "")
        print(f"COLMAP이 등록하지 못한 사진 {len(missing)}장" + (f": {shown}" if missing else ""))
    print(f"저장: {out}")
    print(f"저장: {traj}")


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    args = parse_args()
    try:
        if args.selftest:
            from colmap_tracks_selftest import selftest  # 본체 길이를 줄이려고 따로 둔 파일

            selftest()
        else:
            run(args)
    except InputError as e:
        sys.exit(f"오류: {e}")
    except (OSError, UnicodeDecodeError) as e:
        sys.exit(f"오류: 파일을 읽거나 쓰지 못했다 ({type(e).__name__}: {e})")


if __name__ == "__main__":
    main()
