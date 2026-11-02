#!/usr/bin/env python3
"""
JetBot 카메라 캘리브레이션 (CURRICULUM 4주차, DATA §3).

체커보드 영상(또는 사진들)에서 교차점을 찾고, 같은 교차점으로
핀홀(Brown, k1 k2 p1 p2 k3) 모델과 어안(Kannala-Brandt, k1~k4) 모델을 둘 다 맞춘다.
재투영 오차를 화면 가운데와 가장자리로 나눠 비교하고, 결과를 calib.json으로 저장한다.

사용 (PC):
  pip install opencv-python numpy
  python datasets/calibrate.py --video board.mp4 --cols 9 --rows 6 --square 0.025 --out datasets/calib.json
  python datasets/calibrate.py --images "frames/*.png" --cols 9 --rows 6 --square 0.025
  python datasets/calibrate.py --selftest      # 합성 데이터로 스크립트 자체를 검증 (영상 없이)
  python datasets/calibrate.py --make-board board.png   # 인쇄용 체커보드 (A4 가로, 칸 2.5cm, 10×7칸)

--cols, --rows 는 칸 수가 아니라 내부 교차점 수다 (10×7칸 판이면 9×6).
주의: 재투영 오차는 캘리브레이션에 쓴 프레임으로 잰다 (따로 떼어 둔 검증 프레임이 없다).
      두 모델을 같은 조건에서 비교하는 용도로는 충분하지만, 절대 정확도의 증거는 아니다.
"""
from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import math
import os
import sys
import tempfile
from pathlib import Path

# Windows 콘솔·파이프에서도 한글 출력이 깨지거나 멈추지 않게
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8")

try:
    import cv2
    import numpy as np
except ImportError:  # pragma: no cover - 안내만
    sys.exit("opencv-python과 numpy가 필요하다: pip install opencv-python numpy")

# 이미지 중심에서 반대각선 길이의 이 비율보다 먼 교차점을 "가장자리"로 본다
EDGE_RADIUS_RATIO = 0.6
MAX_VIEWS = 60
MIN_VIEWS = 5
CRITERIA = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 100, 1e-9)


# ---------- 교차점 찾기 ----------

def board_object_points(cols: int, rows: int, square: float) -> np.ndarray:
    """판 좌표계의 교차점 (z = 0 평면), 미터 단위. 모양 (N, 3)"""
    grid = np.zeros((rows * cols, 3), np.float64)
    grid[:, :2] = np.mgrid[0:cols, 0:rows].T.reshape(-1, 2) * square
    return grid


def find_corners(gray: np.ndarray, pattern: tuple[int, int]) -> np.ndarray | None:
    """교차점 (N, 2) 또는 None. 어안 가장자리에서도 잘 되는 SB 검출기를 먼저 쓴다"""
    ok, corners = cv2.findChessboardCornersSB(gray, pattern, flags=cv2.CALIB_CB_EXHAUSTIVE | cv2.CALIB_CB_ACCURACY)
    if not ok:
        ok, corners = cv2.findChessboardCorners(gray, pattern, flags=cv2.CALIB_CB_ADAPTIVE_THRESH | cv2.CALIB_CB_NORMALIZE_IMAGE)
        if not ok:
            return None
        corners = cv2.cornerSubPix(gray, corners, (5, 5), (-1, -1), CRITERIA)
    return corners.reshape(-1, 2).astype(np.float64)


def frames_from_video(path: str, every: int):
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        hint = " (Windows의 OpenCV는 한글 등 영문 아닌 경로를 못 여는 경우가 있다. 영문 폴더로 옮겨서 다시 해 봐)" if not path.isascii() else ""
        sys.exit(f"영상을 열 수 없다: {path}{hint}")
    i = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if i % every == 0:
                yield frame
            i += 1
    finally:
        cap.release()


def frames_from_images(pattern: str):
    paths = sorted(glob.glob(pattern))
    if not paths:
        sys.exit(f"이미지가 없다: {pattern}")
    for p in paths:
        # cv2.imread는 Windows에서 한글 경로를 못 읽는다 → 바이트로 읽어서 디코드
        try:
            img = cv2.imdecode(np.fromfile(p, dtype=np.uint8), cv2.IMREAD_COLOR)
        except (OSError, cv2.error):  # 폴더, 0바이트·깨진 파일
            img = None
        if img is None:
            print(f"건너뜀 (읽을 수 없음): {p}")
            continue
        yield img


def collect(frames, pattern: tuple[int, int]) -> tuple[list[np.ndarray], tuple[int, int]]:
    """교차점을 찾은 프레임의 교차점 목록과 이미지 크기 (폭, 높이)"""
    found: list[np.ndarray] = []
    size = None
    seen = 0
    for frame in frames:
        seen += 1
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        if size is not None and size != (gray.shape[1], gray.shape[0]):
            sys.exit("프레임마다 해상도가 다르다. 캘리브레이션은 한 해상도로만 해야 한다 (DATA §3)")
        size = (gray.shape[1], gray.shape[0])
        corners = find_corners(gray, pattern)
        if corners is not None:
            found.append(corners)
    if size is None:
        sys.exit("프레임을 하나도 읽지 못했다")
    print(f"프레임 {seen}장 중 {len(found)}장에서 판을 찾았다")
    if len(found) > MAX_VIEWS:  # 너무 많으면 고르게 줄인다 (계산 시간)
        idx = np.linspace(0, len(found) - 1, MAX_VIEWS).round().astype(int)
        found = [found[i] for i in idx]
    return found, size


# ---------- 두 모델로 캘리브레이션 ----------

def calibrate_pinhole(obj: np.ndarray, views: list[np.ndarray], size: tuple[int, int]) -> dict:
    objs = [obj.astype(np.float32)] * len(views)
    imgs = [v.astype(np.float32).reshape(-1, 1, 2) for v in views]
    rms, K, dist, rvecs, tvecs = cv2.calibrateCamera(objs, imgs, size, None, None, criteria=CRITERIA)
    dist = dist.ravel()[:5]
    projected = [cv2.projectPoints(obj, r, t, K, dist)[0].reshape(-1, 2) for r, t in zip(rvecs, tvecs)]
    return {"K": K, "distortion": dist.tolist(), "rms": float(rms), "projected": projected}


def fisheye_flag(name: str) -> int:
    """OpenCV 4.x는 cv2.fisheye.CALIB_*, 5.x는 cv2.CALIB_*에 어안 플래그를 둔다"""
    value = getattr(cv2.fisheye, name, None)
    return value if value is not None else getattr(cv2, name)


def calibrate_fisheye(obj: np.ndarray, views: list[np.ndarray], size: tuple[int, int]) -> dict:
    # 모양 (1, N, 3)·(1, N, 2): OpenCV 5.0의 fisheye.calibrate는 (N, 1, 3)에서 크기 오류를 낸다 (4.x는 둘 다 된다)
    objs = [obj.reshape(1, -1, 3)] * len(views)
    imgs = [v.reshape(1, -1, 2) for v in views]
    flags = fisheye_flag("CALIB_RECOMPUTE_EXTRINSIC") | fisheye_flag("CALIB_FIX_SKEW")
    rms, K, D, rvecs, tvecs = cv2.fisheye.calibrate(objs, imgs, size, np.zeros((3, 3)), np.zeros((4, 1)), flags=flags, criteria=CRITERIA)
    projected = [cv2.fisheye.projectPoints(obj.reshape(-1, 1, 3), r, t, K, D)[0].reshape(-1, 2) for r, t in zip(rvecs, tvecs)]
    return {"K": K, "distortion": D.ravel().tolist(), "rms": float(rms), "projected": projected}


def rms_of(e: np.ndarray) -> float | None:
    return float(np.sqrt(np.mean(e ** 2))) if e.size else None


def split_errors(views: list[np.ndarray], projected: list[np.ndarray], size: tuple[int, int]) -> dict:
    """재투영 오차 RMS: 전체, 가운데, 가장자리 (px)"""
    w, h = size
    center = np.array([w / 2, h / 2])
    half_diag = math.hypot(w / 2, h / 2)
    found = np.concatenate(views)
    err = np.linalg.norm(found - np.concatenate(projected), axis=1)
    edge = np.linalg.norm(found - center, axis=1) > EDGE_RADIUS_RATIO * half_diag
    return {"rms_px": rms_of(err), "center_rms_px": rms_of(err[~edge]), "edge_rms_px": rms_of(err[edge]), "edge_points": int(edge.sum())}


def summarize(name: str, result: dict, views, size) -> dict:
    K = result["K"]
    return {
        "model": name,
        "fx": float(K[0, 0]), "fy": float(K[1, 1]), "cx": float(K[0, 2]), "cy": float(K[1, 2]),
        "distortion": [float(x) for x in result["distortion"]],
        **split_errors(views, result["projected"], size),
    }


def fmt(x) -> str:
    return "-" if x is None else f"{x:.3f}"


def print_table(rows: list[dict]) -> None:
    print(f"\n{'모델':<8}{'fx':>9}{'fy':>9}{'전체 RMS':>11}{'가운데':>9}{'가장자리':>10}")
    for r in rows:
        print(f"{r['model']:<8}{r['fx']:>9.1f}{r['fy']:>9.1f}{fmt(r['rms_px']):>11}{fmt(r['center_rms_px']):>9}{fmt(r['edge_rms_px']):>10}")
    print(f"(가장자리 = 중심에서 반대각선의 {EDGE_RADIUS_RATIO:.0%}보다 먼 교차점, {rows[0]['edge_points']}개)\n")
    if rows[0]["edge_points"] == 0:
        print("주의: 가장자리에 찍힌 교차점이 없다. 판을 화면 구석에도 두고 다시 찍으면 왜곡 추정이 좋아진다\n")


def run(views, size, obj) -> tuple[dict, dict]:
    if len(views) < MIN_VIEWS:
        sys.exit(f"판을 찾은 프레임이 {len(views)}장뿐이다. 최소 {MIN_VIEWS}장, 보통 20장 이상 필요하다")
    try:
        pin = summarize("pinhole", calibrate_pinhole(obj, views, size), views, size)
        fish = summarize("fisheye", calibrate_fisheye(obj, views, size), views, size)
    except cv2.error as e:
        # 어안 캘리브레이션은 판 위치·각도가 비슷한 프레임만 있으면 "ill-conditioned" 오류로 멈춘다
        last = (str(e).strip().splitlines() or [type(e).__name__])[-1]
        sys.exit(f"캘리브레이션 실패: {last}\n판을 화면 구석구석에 두고, 여러 방향으로 기울인 프레임을 더 찍어서 다시 해 봐")
    print_table([pin, fish])
    return pin, fish


# ---------- calib.json ----------

def write_calib(path: Path, size: tuple[int, int], pin: dict, fish: dict, views: int) -> None:
    """DATA §3 형식. 이미 파일이 있으면 imu·wheel 등 다른 항목은 그대로 둔다"""
    data = {}
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            sys.exit(f"{path}가 올바른 JSON이 아니다 ({e}). 손으로 고치거나 다른 --out 경로를 써")
        if not isinstance(data, dict):
            sys.exit(f"{path}의 최상위가 객체가 아니다. 다른 --out 경로를 써")
    camera = data.get("camera")
    if not isinstance(camera, dict):
        camera = {}
    camera.update({
        "model": "fisheye",
        "width": size[0], "height": size[1],
        "fx": fish["fx"], "fy": fish["fy"], "cx": fish["cx"], "cy": fish["cy"],
        "distortion": fish["distortion"],
    })
    camera.setdefault("rolling_shutter", True)
    camera.setdefault("readout_time_ms", None)
    data["camera"] = camera
    data.setdefault("imu", {"model": "MPU9250", "T_cam_imu": None, "time_offset_ms": None, "gyro_noise": None, "accel_noise": None})
    data.setdefault("wheel", {"radius_m": None, "baseline_m": None, "ticks_per_rev": None})
    data["calibrated_at"] = dt.date.today().isoformat()
    data["reproj_error_px"] = fish["rms_px"]
    data["comparison"] = {"views": views, "pinhole": pin, "fisheye": fish}
    try:
        # NaN은 사이트의 JSON.parse가 못 읽는 잘못된 JSON이 되므로 막는다
        text = json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    except ValueError:
        sys.exit("저장할 값에 NaN/무한대가 있다 (이번 결과 또는 기존 파일의 다른 항목). 판을 찾은 프레임이 너무 적거나 비슷한지, 기존 파일 내용을 확인해")
    path.parent.mkdir(parents=True, exist_ok=True)
    # 기존 파일 권한을 유지한다 (mkstemp는 0600으로 만든다). 새 파일이면 일반 파일 권한
    mode = path.stat().st_mode & 0o777 if path.exists() else 0o644
    # 임시 파일에 다 쓴 뒤 바꿔치기: 쓰는 도중 실패해도 기존 imu·wheel 기록이 날아가지 않는다
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.chmod(tmp, mode)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise
    print(f"저장: {path}")


# ---------- 인쇄용 체커보드 ----------

A4_LANDSCAPE_MM = (297, 210)
PRINT_DPI = 300


def make_board(path: Path, cols: int, rows: int, square_mm: float) -> None:
    """내부 교차점 cols×rows (칸은 (cols+1)×(rows+1)) 체커보드를 A4 가로 300dpi PNG로 저장한다"""
    px_per_mm = PRINT_DPI / 25.4
    w, h = (round(v * px_per_mm) for v in A4_LANDSCAPE_MM)
    sq = round(square_mm * px_per_mm)
    nx, ny = cols + 1, rows + 1
    if nx * sq > w or ny * sq > h:
        sys.exit(f"{nx}×{ny}칸 × {square_mm}mm 판은 A4에 안 들어간다. --square를 줄여")
    img = np.full((h, w), 255, np.uint8)
    x0, y0 = (w - nx * sq) // 2, (h - ny * sq) // 2
    for j in range(ny):
        for i in range(nx):
            if (i + j) % 2 == 0:
                img[y0 + j * sq: y0 + (j + 1) * sq, x0 + i * sq: x0 + (i + 1) * sq] = 0
    ok, buf = cv2.imencode(".png", img)
    if not ok:
        sys.exit("PNG를 만들지 못했다")
    buf.tofile(str(path))  # 한글 경로도 되게 바이트로 쓴다
    print(f"저장: {path} ({nx}×{ny}칸, 한 칸 {square_mm}mm). 인쇄할 때 '페이지에 맞춤'을 끄고 100% 크기로 뽑은 뒤, 칸 크기를 자로 다시 재")


# ---------- 합성 데이터 자체 검증 ----------

def synthetic_views(rng, obj_c, K_true, D_true, size, count=30) -> list[np.ndarray]:
    """화면 곳곳(가장자리 포함)에 판을 두고 알려진 어안 카메라로 투영한다"""
    views = []
    for _ in range(5000):
        if len(views) >= count:
            break
        direction = rng.normal(size=3)
        direction[2] = abs(direction[2]) + 0.3
        direction /= np.linalg.norm(direction)
        if math.degrees(math.acos(direction[2])) > 70:
            continue
        rvec = rng.normal(scale=0.35, size=3)
        R, _ = cv2.Rodrigues(rvec)
        tvec = direction * rng.uniform(0.2, 0.45)
        cam = (R @ obj_c.T).T + tvec
        if (cam[:, 2] <= 0.05).any():
            continue
        px = cv2.fisheye.projectPoints(obj_c.reshape(-1, 1, 3), rvec, tvec, K_true, D_true)[0].reshape(-1, 2)
        if (px < 0).any() or (px[:, 0] > size[0]).any() or (px[:, 1] > size[1]).any():
            continue
        views.append(px + rng.normal(scale=0.2, size=px.shape))
    return views


def selftest() -> int:
    """알려진 어안 카메라(JetBot 정도)로 판을 투영해서, 캘리브레이션이 그 값을 되찾는지 본다"""
    rng = np.random.default_rng(4)
    size = (820, 616)
    K_true = np.array([[290.0, 0, 410], [0, 291.0, 308], [0, 0, 1]])
    D_true = np.array([0.02, -0.01, 0.004, -0.0008])
    obj = board_object_points(9, 6, 0.025)
    obj_c = obj - obj.mean(axis=0)  # 판 가운데를 원점으로
    views = synthetic_views(rng, obj_c, K_true, D_true, size)
    print(f"합성 판 {len(views)}장 (노이즈 0.2px)")
    pin, fish = run(views, size, obj_c)
    checks = [
        ("어안 fx를 1% 안으로 되찾는다", abs(fish["fx"] - 290) / 290 < 0.01),
        ("어안 cx를 2px 안으로 되찾는다", abs(fish["cx"] - 410) < 2),
        ("어안 RMS가 노이즈 수준 (0.4px 미만)", fish["rms_px"] < 0.4),
        ("가장자리에서 어안이 핀홀보다 정확하다", (fish["edge_rms_px"] or 0) < (pin["edge_rms_px"] or 0)),
    ]
    for name, ok in checks:
        print(f"{'통과' if ok else '실패'}: {name}")
    return 0 if all(ok for _, ok in checks) else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--video", help="체커보드 영상 (mp4 등)")
    src.add_argument("--images", help='이미지 glob 패턴 (예: "frames/*.png")')
    src.add_argument("--selftest", action="store_true", help="합성 데이터로 스크립트 검증")
    src.add_argument("--make-board", metavar="PNG", help="인쇄용 체커보드 PNG를 만든다 (A4 가로)")
    ap.add_argument("--cols", type=int, default=9, help="가로 내부 교차점 수 (기본 9)")
    ap.add_argument("--rows", type=int, default=6, help="세로 내부 교차점 수 (기본 6)")
    ap.add_argument("--square", type=float, default=0.025, help="한 칸 크기 (m, 기본 0.025)")
    ap.add_argument("--every", type=int, default=10, help="영상에서 몇 프레임마다 하나씩 쓸지 (기본 10)")
    ap.add_argument("--out", default="datasets/calib.json", help="저장할 calib.json 경로")
    args = ap.parse_args()

    if args.selftest:
        return selftest()
    if args.every < 1 or args.square <= 0 or args.cols < 2 or args.rows < 2:
        sys.exit("--every ≥ 1, --square > 0, --cols·--rows ≥ 2 여야 한다")
    if args.make_board:
        make_board(Path(args.make_board), args.cols, args.rows, args.square * 1000)
        return 0
    pattern = (args.cols, args.rows)
    frames = frames_from_video(args.video, args.every) if args.video else frames_from_images(args.images)
    views, size = collect(frames, pattern)
    pin, fish = run(views, size, board_object_points(args.cols, args.rows, args.square))
    write_calib(Path(args.out), size, pin, fish, len(views))
    return 0


if __name__ == "__main__":
    sys.exit(main())
