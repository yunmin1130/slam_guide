#!/usr/bin/env python3
"""
TUM RGB-D 시퀀스 → 특징점 트랙 JSON (CURRICULUM 11주차, DATA §2 tracks 형식).

컬러 영상에서 KLT로 특징점을 추적해 프레임마다 (추적 번호 id, 픽셀 u, v)를 남기고,
렌즈 왜곡을 편 좌표로 바꾼 뒤, 프레임 시각에 맞는 정답 자세(T_world_cam)를 붙인다.
사이트의 "TUM으로 VO 돌리기"(11d)가 이 파일을 읽어 내 vo와 ATE·RPE를 계산한다.

준비 (PC):
  pip install opencv-python numpy
  TUM RGB-D 페이지에서 시퀀스 tgz를 받아 푼다 (예: rgbd_dataset_freiburg1_xyz/).

사용:
  python datasets/tum_tracks.py path/to/rgbd_dataset_freiburg1_xyz
  python datasets/tum_tracks.py path/to/rgbd_dataset_freiburg3_long_office_household --every 3 --max-frames 800
  python datasets/tum_tracks.py --selftest      # 합성 시퀀스로 스크립트 검증
기본 저장: datasets/tracks/{시퀀스 이름}.json (이미 있으면 --force)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path

try:
    import cv2
    import numpy as np
except ImportError:  # pragma: no cover - 안내만
    sys.exit("opencv-python과 numpy가 필요하다: pip install opencv-python numpy")

DATASETS_DIR = Path(__file__).resolve().parent
DEFAULT_OUT_DIR = DATASETS_DIR / "tracks"
FORMAT = "slam-guide-tracks"
VERSION = 1

# TUM RGB-D 공식 컬러 카메라 내부 파라미터 (데이터셋 페이지 "Intrinsic Camera Calibration").
# 왜곡은 OpenCV 순서 k1, k2, p1, p2, k3. fr3 영상은 이미 왜곡이 펴져 있다.
CAMERAS: dict[str, dict] = {
    "fr1": {"fx": 517.3, "fy": 516.5, "cx": 318.6, "cy": 255.3, "dist": [0.2624, -0.9531, -0.0054, 0.0026, 1.1633]},
    "fr2": {"fx": 520.9, "fy": 521.0, "cx": 325.1, "cy": 249.7, "dist": [0.2312, -0.7849, -0.0033, -0.0001, 0.9172]},
    "fr3": {"fx": 535.4, "fy": 539.2, "cx": 320.1, "cy": 247.6, "dist": [0.0, 0.0, 0.0, 0.0, 0.0]},
}

DEFAULT_EVERY = 2
DEFAULT_MAX_FRAMES = 300
DEFAULT_FEATURES = 300
# 남은 트랙이 목표의 이 비율보다 적으면 새 특징점을 채운다
REFILL_BELOW = 0.7
MIN_DISTANCE_PX = 12
# 서로 다른 트랙이 이보다 가까이 모이면(같은 점으로 수렴) 나중 id를 버린다
MERGE_PX = MIN_DISTANCE_PX / 2
QUALITY = 0.01
LK_WINDOW = (21, 21)
LK_LEVELS = 3
# 앞으로 추적한 점을 다시 거꾸로 추적해 원래 자리로 돌아오는지 (픽셀). 안 돌아오면 버린다
FB_MAX_PX = 1.0
# 왜곡 보정 반복: OpenCV 기본(5번)은 fr1 모서리에서 0.1px 남는다
UNDISTORT_CRITERIA = (cv2.TERM_CRITERIA_COUNT | cv2.TERM_CRITERIA_EPS, 50, 1e-10)
# 정답 자세: 앞뒤 정답 사이를 보간한다. 두 정답의 간격이 이보다 크면(빠진 구간) 가장 가까운 것만,
# 그것도 영상 시각에서 GT_MAX_DT보다 멀면 없음(None). TUM 정답은 100Hz라 보통 10ms 간격이다
GT_MAX_GAP = 0.05
GT_MAX_DT = 0.02
# 쿼터니언 크기가 이 범위 밖이면 손상된 줄로 보고 쓰지 않는다 (안이면 1로 맞춘다)
QUAT_NORM_RANGE = (0.5, 1.5)
# 사이트(lib/tracksFile.ts)와 같은 상한
MAX_FRAMES_LIMIT = 2000
MAX_FEATURES_LIMIT = 2000
NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")
# Windows에서 파일 이름으로 쓸 수 없는 예약어 (확장자가 붙어도 안 된다)
WINDOWS_RESERVED = {"con", "prn", "aux", "nul", *(f"com{i}" for i in range(1, 10)), *(f"lpt{i}" for i in range(1, 10))}


class InputError(Exception):
    """사용자 입력이 잘못됨 (메시지를 그대로 보여주고 끝낸다)"""


@dataclass(frozen=True)
class Options:
    every: int
    max_frames: int
    start: int
    features: int


# ---- TUM 파일 읽기 ----


def read_list(path: Path) -> list[list[str]]:
    """TUM 목록 파일: '#'으로 시작하는 줄은 주석, 나머지는 공백으로 나뉜 칸 (UTF-8 BOM 허용)"""
    if not path.is_file():
        raise InputError(f"파일이 없다: {path}")
    try:
        text = path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError:
        raise InputError(f"UTF-8 글자가 아닌 파일이다: {path}") from None
    rows = []
    for line in text.splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            rows.append(line.split())
    return rows


def finite_float(text: str, what: str) -> float:
    try:
        v = float(text)
    except ValueError:
        raise InputError(f"{what}이 숫자가 아니다: {text}") from None
    if not np.isfinite(v):
        raise InputError(f"{what}이 유한한 숫자가 아니다: {text}")
    return v


def read_rgb(seq: Path) -> list[tuple[float, Path]]:
    root = seq.resolve()
    out = []
    for row in read_list(seq / "rgb.txt"):
        if len(row) < 2:
            raise InputError(f"rgb.txt 줄이 이상하다: {' '.join(row)}")
        img = (seq / row[1]).resolve()
        # rgb.txt의 경로가 시퀀스 폴더 밖을 가리키면 거부한다 (심볼릭 링크로 밖을 가리켜도 마찬가지)
        if root not in img.parents:
            raise InputError(f"rgb.txt의 경로가 시퀀스 폴더 밖이다 (심볼릭 링크 포함): {row[1]}")
        out.append((finite_float(row[0], "rgb.txt의 시각"), img))
    if not out:
        raise InputError("rgb.txt에 영상이 없다")
    if any(b[0] <= a[0] for a, b in zip(out, out[1:])):
        raise InputError("rgb.txt의 시각이 늘어나는 순서가 아니다 (같은 시각이 두 번 있거나 정렬되지 않음)")
    return out


def read_groundtruth(seq: Path) -> tuple[np.ndarray, np.ndarray]:
    """시각 (N,)과 자세 (N, 7) [tx, ty, tz, qw, qx, qy, qz] (쿼터니언은 크기 1로 맞춤, w 먼저).
    숫자가 아니거나 유한하지 않거나 쿼터니언이 손상된 줄은 건너뛴다 (그 시각은 정답 없음이 된다)."""
    rows = []
    for r in read_list(seq / "groundtruth.txt"):
        if len(r) < 8:
            continue
        try:
            v = np.array([float(x) for x in r[:8]])
        except ValueError:
            continue
        if not np.all(np.isfinite(v)):
            continue
        q = v[4:8]  # TUM 원본 순서 qx qy qz qw
        n = float(np.linalg.norm(q))
        if not QUAT_NORM_RANGE[0] <= n <= QUAT_NORM_RANGE[1]:
            continue
        qx, qy, qz, qw = q / n
        rows.append([v[0], v[1], v[2], v[3], qw, qx, qy, qz])
    if not rows:
        raise InputError("groundtruth.txt에 쓸 수 있는 줄이 없다 (시각 tx ty tz qx qy qz qw)")
    data = np.array(rows)
    order = np.argsort(data[:, 0], kind="stable")
    return data[order, 0], data[order, 1:]


def slerp(q0: np.ndarray, q1: np.ndarray, a: float) -> np.ndarray:
    """단위 쿼터니언 구면 보간 (짧은 쪽 호)"""
    d = float(np.dot(q0, q1))
    if d < 0:
        q1, d = -q1, -d
    if d > 0.9995:  # 거의 같으면 선형 보간 후 정규화
        q = q0 + a * (q1 - q0)
        return q / np.linalg.norm(q)
    th = np.arccos(d)
    return (np.sin((1 - a) * th) * q0 + np.sin(a * th) * q1) / np.sin(th)


def associate(times: list[float], gt_t: np.ndarray, gt_pose: np.ndarray) -> list[list[float] | None]:
    """영상 시각마다 정답 [tx, ty, tz, qw, qx, qy, qz]. 앞뒤 정답이 가까우면 보간(위치 선형, 회전 slerp)"""
    out: list[list[float] | None] = []
    for t in times:
        k = int(np.searchsorted(gt_t, t))
        if 0 < k < len(gt_t) and gt_t[k] - gt_t[k - 1] <= GT_MAX_GAP:
            a = (t - gt_t[k - 1]) / (gt_t[k] - gt_t[k - 1]) if gt_t[k] > gt_t[k - 1] else 0.0
            p = (1 - a) * gt_pose[k - 1, :3] + a * gt_pose[k, :3]
            q = slerp(gt_pose[k - 1, 3:], gt_pose[k, 3:], a)
            out.append([round(float(v), 6) for v in (*p, *q)])
            continue
        near = [c for c in (k - 1, k) if 0 <= c < len(gt_t)]
        best = min(near, key=lambda c: abs(gt_t[c] - t))
        out.append([round(float(v), 6) for v in gt_pose[best]] if abs(gt_t[best] - t) <= GT_MAX_DT else None)
    return out


def camera_of(seq: Path, given: str | None) -> str:
    if given:
        return given
    m = re.search(r"freiburg([123])", seq.name)
    if not m:
        raise InputError("폴더 이름에서 카메라(freiburg1/2/3)를 알 수 없다. --camera fr1 처럼 지정해")
    return f"fr{m.group(1)}"


def read_gray(path: Path) -> np.ndarray:
    try:
        img = cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    except (OSError, cv2.error):
        img = None
    if img is None:
        raise InputError(f"이미지를 읽을 수 없다: {path}")
    return img


def gray_frames(paths: list[Path]) -> Iterator[np.ndarray]:
    """영상을 한 장씩 읽는다 (전부 메모리에 올리지 않게). 크기가 다르면 그 자리에서 멈춘다"""
    shape = None
    for p in paths:
        img = read_gray(p)
        if shape is None:
            shape = img.shape
        elif img.shape != shape:
            raise InputError(f"영상 크기가 프레임마다 다르다: {p.name} {img.shape[::-1]} ≠ {shape[::-1]}")
        yield img


# ---- KLT 추적 ----


def detect(gray: np.ndarray, existing: np.ndarray, count: int) -> np.ndarray:
    """이미 있는 점 근처를 피해서 새 특징점 (최대 count개)"""
    if count <= 0:
        return np.empty((0, 2), np.float32)
    mask = np.full(gray.shape, 255, np.uint8)
    for x, y in existing:
        cv2.circle(mask, (int(round(x)), int(round(y))), MIN_DISTANCE_PX, 0, -1)
    pts = cv2.goodFeaturesToTrack(gray, maxCorners=count, qualityLevel=QUALITY, minDistance=MIN_DISTANCE_PX, mask=mask)
    return np.empty((0, 2), np.float32) if pts is None else pts.reshape(-1, 2).astype(np.float32)


def track(prev: np.ndarray, cur: np.ndarray, pts: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """앞으로·뒤로 KLT. (새 위치, 살아남았는지)"""
    if len(pts) == 0:
        return pts, np.zeros(0, bool)
    params = {"winSize": LK_WINDOW, "maxLevel": LK_LEVELS}
    p0 = pts.reshape(-1, 1, 2)
    p1, st1, _ = cv2.calcOpticalFlowPyrLK(prev, cur, p0, None, **params)
    p0b, st2, _ = cv2.calcOpticalFlowPyrLK(cur, prev, p1, None, **params)
    fb = np.linalg.norm((p0 - p0b).reshape(-1, 2), axis=1)
    h, w = cur.shape
    p1 = p1.reshape(-1, 2)
    inside = (p1[:, 0] >= 0) & (p1[:, 0] < w) & (p1[:, 1] >= 0) & (p1[:, 1] < h)
    ok = (st1.ravel() == 1) & (st2.ravel() == 1) & (fb < FB_MAX_PX) & inside  # fb가 NaN이면 False라 버려진다
    return p1, ok


def drop_merged(pts: np.ndarray, ids: np.ndarray) -> np.ndarray:
    """같은 곳으로 모인 트랙: MERGE_PX보다 가까운 쌍에서 나중 id(더 짧은 트랙)를 버린다. 남길 것의 표시"""
    keep = np.ones(len(pts), bool)
    if len(pts) < 2:
        return keep
    d = np.linalg.norm(pts[:, None, :] - pts[None, :, :], axis=2)
    older = ids[:, None] < ids[None, :]  # [i, j]: i가 j보다 오래된 트랙
    close = (d < MERGE_PX) & older
    keep[np.any(close, axis=0)] = False
    return keep


def undistort(pts: np.ndarray, cam: dict) -> np.ndarray:
    """왜곡된 픽셀 → 왜곡을 편 픽셀 (같은 K로 다시 투영). OpenCV 4.x는 반복 조건을 별도 함수로 받는다"""
    if len(pts) == 0 or not any(cam["dist"]):
        return pts
    K = np.array([[cam["fx"], 0, cam["cx"]], [0, cam["fy"], cam["cy"]], [0, 0, 1]])
    src = pts.reshape(-1, 1, 2).astype(np.float64)
    dist = np.array(cam["dist"])
    if hasattr(cv2, "undistortPointsIter"):
        out = cv2.undistortPointsIter(src, K, dist, None, K, UNDISTORT_CRITERIA)
    else:
        out = cv2.undistortPoints(src, K, dist, P=K, criteria=UNDISTORT_CRITERIA)
    return out.reshape(-1, 2)


def build_tracks(images: Iterator[np.ndarray], cam: dict, n_features: int) -> tuple[list[list[list[float]]], tuple[int, int]]:
    """프레임마다 [[id, u, v], ...] (왜곡 편 픽셀, 소수 둘째 자리)와 영상 크기 (w, h)"""
    frames: list[list[list[float]]] = []
    pts = np.empty((0, 2), np.float32)
    ids = np.empty(0, int)
    next_id = 0
    prev = None
    for gray in images:
        if prev is not None:
            pts, ok = track(prev, gray, pts)
            pts, ids = pts[ok], ids[ok]
            keep = drop_merged(pts, ids)
            pts, ids = pts[keep], ids[keep]
        if len(pts) < REFILL_BELOW * n_features:
            new = detect(gray, pts, n_features - len(pts))
            pts = np.vstack([pts, new]).astype(np.float32)
            ids = np.concatenate([ids, np.arange(next_id, next_id + len(new))])
            next_id += len(new)
        und = undistort(pts, cam)
        frames.append([[int(i), round(float(u), 2), round(float(v), 2)] for i, (u, v) in zip(ids, und)])
        prev = gray
    if prev is None:
        raise InputError("읽은 영상이 없다")
    return frames, (prev.shape[1], prev.shape[0])


# ---- 저장 ----


def default_out(name: str) -> Path:
    return DEFAULT_OUT_DIR / f"{name}.json"


def check_out(out: Path, force: bool) -> None:
    if out.suffix.lower() != ".json":
        raise InputError(f"저장 파일은 .json이어야 한다: {out}")
    if out.stem.split(".")[0].lower() in WINDOWS_RESERVED:
        raise InputError(f"Windows에서 쓸 수 없는 파일 이름이다: {out.name}")
    if out.is_symlink():
        raise InputError(f"저장 파일이 심볼릭 링크다 (링크를 지우거나 다른 이름을 써): {out}")
    if out.exists() and not out.is_file():
        raise InputError(f"파일이 아니다: {out}")
    if out.exists() and not force:
        raise InputError(f"이미 있다: {out} (덮어쓰려면 --force)")
    # 기본 폴더는 만들어 주고, --out의 폴더는 이미 있어야 한다 (오타로 새 폴더 트리가 생기지 않게)
    if out.parent.resolve() != DEFAULT_OUT_DIR.resolve() and not out.parent.is_dir():
        raise InputError(f"저장할 폴더가 없다: {out.parent}")


def write_json(out: Path, data: dict, force: bool) -> None:
    check_out(out, force)
    out.parent.mkdir(parents=True, exist_ok=True)
    # 임시 파일에 다 쓴 뒤 바꿔 끼운다 (중간에 멈춰도 반쯤 쓴 파일이 남지 않게).
    # NaN은 브라우저 JSON.parse가 못 읽으므로 쓰기 전에 막는다 (allow_nan=False)
    fd, tmp = tempfile.mkstemp(dir=out.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        os.chmod(tmp, 0o644)
        if force:
            os.replace(tmp, out)
        else:
            # 확인한 뒤 다른 실행이 같은 파일을 만들었으면 덮어쓰지 않는다 (link는 대상이 있으면 실패)
            try:
                os.link(tmp, out)
            except FileExistsError:
                raise InputError(f"이미 있다: {out} (덮어쓰려면 --force)") from None
    except ValueError as e:
        raise InputError(f"JSON에 넣을 수 없는 값이 있다 (NaN 등): {e}") from None
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def convert(seq: Path, camera: str | None, opts: Options) -> dict:
    if not seq.is_dir():
        raise InputError(f"시퀀스 폴더가 없다: {seq}")
    name = seq.resolve().name.replace("rgbd_dataset_", "tum-")
    if not NAME_PATTERN.match(name) or name.split(".")[0].lower() in WINDOWS_RESERVED:
        raise InputError(f"시퀀스 폴더 이름이 이상하다: {seq.name}")
    cam = CAMERAS[camera_of(seq.resolve(), camera)]
    rgb = read_rgb(seq)[opts.start :: opts.every][: opts.max_frames]
    if len(rgb) < 2:
        raise InputError("고른 프레임이 2장보다 적다 (--start, --every, --max-frames 확인)")
    gt_t, gt_pose = read_groundtruth(seq)
    tracks, (w, h) = build_tracks(gray_frames([p for _, p in rgb]), cam, opts.features)
    gt = associate([t for t, _ in rgb], gt_t, gt_pose)
    return {
        "format": FORMAT,
        "version": VERSION,
        "name": name,
        "source": "tum",
        "license": "tum-cc-by",
        "camera": {"fx": cam["fx"], "fy": cam["fy"], "cx": cam["cx"], "cy": cam["cy"], "width": w, "height": h},
        "every": opts.every,
        "frames": [{"t": round(t, 6), "features": f} for (t, _), f in zip(rgb, tracks)],
        "groundtruth": gt,
    }


def summary(data: dict) -> str:
    counts = [len(f["features"]) for f in data["frames"]]
    gt_ok = sum(g is not None for g in data["groundtruth"])
    span = data["frames"][-1]["t"] - data["frames"][0]["t"]
    return (
        f"프레임 {len(counts)}장 ({span:.1f}초), 특징점 평균 {np.mean(counts):.0f}개 (최소 {min(counts)}), "
        f"정답 자세 {gt_ok}/{len(counts)}"
    )


# ---- 자체 검사 ----


def _expect_input_error(fn: Callable[[], object]) -> bool:
    try:
        fn()
    except InputError:
        return True
    return False


def _write_sequence(seq: Path, big: np.ndarray, n: int, gt_lines: list[str], bom: bool = False) -> None:
    """합성 TUM 폴더: 무늬 이미지를 프레임마다 (3, 1)픽셀씩 옮긴 영상"""
    (seq / "rgb").mkdir(parents=True, exist_ok=True)
    lines = []
    for k in range(n):
        name = f"rgb/{k:04d}.png"
        cv2.imwrite(str(seq / name), big[100 + k : 100 + k + 480, 100 + 3 * k : 100 + 3 * k + 640])
        lines.append(f"{1000 + 0.1 * k:.6f} {name}")
    head = "﻿" if bom else ""
    (seq / "rgb.txt").write_text(head + "# timestamp filename\n" + "\n".join(lines) + "\n", encoding="utf-8")
    (seq / "groundtruth.txt").write_text("# timestamp tx ty tz qx qy qz qw\n" + "\n".join(gt_lines) + "\n", encoding="utf-8")


def _selftest() -> None:
    rng = np.random.default_rng(0)
    big = cv2.GaussianBlur((rng.random((700, 900)) * 255).astype(np.uint8), (0, 0), 2.0)
    checks: list[tuple[str, bool]] = []
    with tempfile.TemporaryDirectory() as tmp:
        seq = Path(tmp) / "rgbd_dataset_freiburg3_synthetic"
        # 정답: 프레임 k 시각 + 3ms에 x = 0.01k (프레임 7 근처는 빠짐, 망가진 줄 몇 개 섞음)
        gt_lines = [f"{1000 + 0.1 * k + 0.003:.6f} {0.01 * k} 0 0 0 0 0 1" for k in range(12) if k != 7]
        gt_lines += ["2000.0 9 9 9 0 0 0 1", "1000.05 nan 0 0 0 0 0 1", "1000.06 1 1 1 0 0 0 0", "1000.07 not a number"]
        _write_sequence(seq, big, 12, gt_lines, bom=True)

        data = convert(seq, None, Options(every=1, max_frames=100, start=0, features=200))
        f0 = {i: (u, v) for i, u, v in data["frames"][0]["features"]}
        f5 = {i: (u, v) for i, u, v in data["frames"][5]["features"]}
        common = sorted(set(f0) & set(f5))
        shifts = np.array([[f0[i][0] - f5[i][0], f0[i][1] - f5[i][1]] for i in common]) if common else np.full((1, 2), np.nan)
        med = np.median(shifts, axis=0)
        gt = data["groundtruth"]
        checks.append(("이름·카메라 자동 인식, BOM 있는 rgb.txt", data["name"] == "tum-freiburg3_synthetic" and data["camera"]["fx"] == CAMERAS["fr3"]["fx"]))
        checks.append(("프레임 12장, 첫 프레임 특징점 100개 이상", len(data["frames"]) == 12 and len(f0) >= 100))
        checks.append(("5프레임 뒤에도 같은 id로 절반 이상 추적", len(common) >= 0.5 * len(f0)))
        checks.append((f"추적 이동이 (15, 5)픽셀 (중앙값 {med[0]:.2f}, {med[1]:.2f})", bool(np.all(np.abs(med - [15, 5]) < 0.3))))
        checks.append(("한 프레임 안 id 중복 없음", all(len({i for i, _, _ in f["features"]}) == len(f["features"]) for f in data["frames"])))
        pts_ok = all(
            np.min(np.linalg.norm(np.array([[u, v] for _, u, v in f["features"]])[:, None] - np.array([[u, v] for _, u, v in f["features"]])[None] + np.eye(len(f["features"]))[:, :, None] * 1e9, axis=2)) >= MERGE_PX - 0.02
            for f in data["frames"]
        )
        checks.append(("한 프레임 안 두 트랙이 같은 곳에 겹치지 않음", pts_ok))
        g4 = gt[4]
        checks.append(("정답 간격이 50ms를 넘으면 가장 가까운 정답 (프레임 4, 쿼터니언 qw 먼저)", g4 == [0.04, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0]))
        half = np.array([np.cos(0.25), 0, 0, np.sin(0.25)])  # z축 0.5rad
        dense = associate([1000.004], np.array([1000.0, 1000.01]), np.array([[0, 0, 0, 1, 0, 0, 0], [0.01, 0, 0, *half]]))[0]
        want_q = [np.cos(0.1), 0, 0, np.sin(0.1)]  # 40% 지점 → 0.2rad
        checks.append(("10ms 간격 정답은 보간 (위치 선형, 회전 slerp)", dense is not None and abs(dense[0] - 0.004) < 1e-9 and np.allclose(dense[3:], want_q, atol=1e-6)))
        checks.append(("정답이 빠진 구간(프레임 7 근처)은 가까운 정답이 20ms 안에 없으면 None", gt[7] is None))
        checks.append(("망가진 정답 줄(NaN, 0 쿼터니언, 글자)은 건너뛴다", all(g is None or np.all(np.isfinite(g)) for g in gt)))
        every = convert(seq, None, Options(every=3, max_frames=100, start=1, features=200))
        checks.append(("--every 3 --start 1 → 프레임 1, 4, 7, 10", [round(f["t"] - 1000, 1) for f in every["frames"]] == [0.1, 0.4, 0.7, 1.0]))
        fr1 = convert(seq, "fr1", Options(every=1, max_frames=3, start=0, features=200))
        moved = [abs(a[1] - b[1]) + abs(a[2] - b[2]) for a, b in zip(fr1["frames"][0]["features"], data["frames"][0]["features"])]
        checks.append(("--camera fr1이면 좌표가 왜곡 보정을 거친다 (가장자리 점이 움직임)", max(moved) > 1.0))

        # 왜곡 보정: fr1 왜곡으로 투영한 점을 되돌리면 핀홀 투영과 같아야 한다 (모서리까지)
        cam = CAMERAS["fr1"]
        K = np.array([[cam["fx"], 0, cam["cx"]], [0, cam["fy"], cam["cy"]], [0, 0, 1]])
        X = np.array([[0.3, -0.2, 1.0], [-0.4, 0.25, 1.0], [0.0, 0.0, 1.0], [-0.58, -0.47, 1.0], [0.6, 0.45, 1.0]])
        distorted, _ = cv2.projectPoints(X, np.zeros(3), np.zeros(3), K, np.array(cam["dist"]))
        ideal = (K @ X.T).T[:, :2]
        back = undistort(distorted.reshape(-1, 2), cam)
        err = float(np.max(np.abs(back - ideal)))
        checks.append((f"fr1 왜곡 보정, 모서리 포함 (최대 {err:.4f}px, 0.01px 안)", err < 0.01))

        out = Path(tmp) / "out" / "t.json"
        out.parent.mkdir()
        write_json(out, data, force=False)
        reread = json.loads(out.read_text(encoding="utf-8"))
        checks.append(("저장한 JSON을 다시 읽으면 같다", reread["format"] == FORMAT and len(reread["frames"]) == 12))
        checks.append(("이미 있는 파일은 --force 없이 덮어쓰지 않는다", _expect_input_error(lambda: write_json(out, data, force=False))))
        checks.append((".json이 아닌 저장 파일은 거부", _expect_input_error(lambda: write_json(Path(tmp) / "x.txt", data, force=True))))
        checks.append(("--out의 폴더가 없으면 거부 (새 폴더 트리를 만들지 않는다)", _expect_input_error(lambda: write_json(Path(tmp) / "no" / "dir" / "t.json", data, force=True))))
        checks.append(("Windows 예약어 이름은 거부", _expect_input_error(lambda: write_json(Path(tmp) / "out" / "CON.json", data, force=True))))
        checks.append(("NaN이 든 데이터는 저장하지 않는다", _expect_input_error(lambda: write_json(Path(tmp) / "out" / "nan.json", {"x": float("nan")}, force=True))))
        checks.append(("폴더 이름에 freiburg가 없고 --camera도 없으면 거부", _expect_input_error(lambda: camera_of(Path(tmp) / "mydata", None))))

        bad = Path(tmp) / "rgbd_dataset_freiburg1_bad"
        _write_sequence(bad, big, 3, ["1000.0 0 0 0 0 0 0 1"])
        (bad / "rgb.txt").write_text("1000.0 rgb/0000.png\n999.0 rgb/0001.png\n", encoding="utf-8")
        checks.append(("rgb.txt 시각이 늘어나지 않으면 거부", _expect_input_error(lambda: read_rgb(bad))))
        (bad / "rgb.txt").write_text("nan rgb/0000.png\n", encoding="utf-8")
        checks.append(("rgb.txt 시각이 NaN이면 거부", _expect_input_error(lambda: read_rgb(bad))))
        (bad / "rgb.txt").write_text("1000.0 ../../escape.png\n", encoding="utf-8")
        checks.append(("rgb.txt가 폴더 밖을 가리키면 거부", _expect_input_error(lambda: read_rgb(bad))))

    for label, ok in checks:
        print(f"[{'통과' if ok else '실패'}] {label}")
    failed = [label for label, ok in checks if not ok]
    if failed:
        sys.exit(f"자체 검사 실패 {len(failed)}개")
    print(f"자체 검사 {len(checks)}개 모두 통과")


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="TUM RGB-D 시퀀스 → 특징점 트랙 JSON (11주차)")
    ap.add_argument("sequence", nargs="?", help="풀어 둔 TUM 시퀀스 폴더 (rgb.txt, groundtruth.txt가 있는 곳)")
    ap.add_argument("--camera", choices=sorted(CAMERAS), help="카메라 (기본: 폴더 이름의 freiburgN)")
    ap.add_argument("--every", type=int, default=DEFAULT_EVERY, help=f"몇 장마다 하나씩 쓸지 (기본 {DEFAULT_EVERY}, 30Hz → 15Hz)")
    ap.add_argument("--start", type=int, default=0, help="처음 몇 장을 건너뛸지")
    ap.add_argument("--max-frames", type=int, default=DEFAULT_MAX_FRAMES, help=f"최대 프레임 수 (기본 {DEFAULT_MAX_FRAMES})")
    ap.add_argument("--features", type=int, default=DEFAULT_FEATURES, help=f"프레임당 특징점 목표 수 (기본 {DEFAULT_FEATURES})")
    ap.add_argument("--out", help="저장할 .json (기본 datasets/tracks/{이름}.json, 다른 곳이면 폴더가 이미 있어야 한다)")
    ap.add_argument("--force", action="store_true", help="이미 있는 파일을 덮어쓴다")
    ap.add_argument("--selftest", action="store_true", help="합성 시퀀스로 스크립트를 검사한다")
    args = ap.parse_args()
    try:
        if args.selftest:
            _selftest()
            return
        if not args.sequence:
            raise InputError("시퀀스 폴더를 줘야 한다 (도움말: --help)")
        if not (1 <= args.every <= 30 and args.start >= 0 and 2 <= args.max_frames <= MAX_FRAMES_LIMIT and 20 <= args.features <= MAX_FEATURES_LIMIT):
            raise InputError(f"설정 범위: --every 1~30, --start ≥ 0, --max-frames 2~{MAX_FRAMES_LIMIT}, --features 20~{MAX_FEATURES_LIMIT}")
        opts = Options(every=args.every, max_frames=args.max_frames, start=args.start, features=args.features)
        out = Path(args.out) if args.out else None
        if out is not None:
            check_out(out, args.force)  # 오래 계산하기 전에 저장 위치부터 확인한다
        data = convert(Path(args.sequence), args.camera, opts)
        out = out or default_out(data["name"])
        if args.force and out.exists():
            print(f"덮어쓴다: {out}")
        write_json(out, data, args.force)
        print(summary(data))
        print(f"저장: {out}")
    except InputError as e:
        sys.exit(f"오류: {e}")
    except (OSError, UnicodeDecodeError) as e:
        sys.exit(f"오류: 파일을 읽거나 쓰지 못했다 ({type(e).__name__}: {e})")


if __name__ == "__main__":
    main()
