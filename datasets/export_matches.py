#!/usr/bin/env python3
"""
사진 두 장의 대응점 뽑기 (CURRICULUM 5주차, DATA §2 matches 형식).

ORB 특징점을 찾아 짝을 짓고(1·2위 거리비 검사), 대응점을 JSON으로 저장한다.
매칭 원리는 10주차에 배운다. 지금은 블랙박스로 쓴다.
--calib을 주면 OpenCV의 findEssentialMat(RANSAC) 결과도 함께 보여준다. 사이트에서 내 RANSAC 결과와 비교하는 기준이다.

사용 (PC):
  pip install opencv-python numpy
  python datasets/export_matches.py --video walk.mp4 --frames 45 75 --calib datasets/calib.json
  python datasets/export_matches.py a.jpg b.jpg --calib datasets/calib.json
  python datasets/export_matches.py --selftest     # 합성 이미지로 스크립트 검증
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8")

try:
    import cv2
    import numpy as np
except ImportError:  # pragma: no cover - 안내만
    sys.exit("opencv-python과 numpy가 필요하다: pip install opencv-python numpy")

DEFAULT_FEATURES = 3000
DEFAULT_RATIO = 0.8
MIN_MATCHES = 8
# 사이트(lib/matchesFile.ts)가 받는 최대 대응점 수. 넘으면 거리비가 좋은 것부터 남긴다
MAX_MATCHES = 5000
RANSAC_THRESHOLD_PX = 2.0
# 사이트와 같은 조건: 광축과 84° 넘게 벌어진 방향(베어링 b_z ≤ 0.1)은 뺀다. 정규화 반지름으로 tan(acos(0.1))
MAX_NORMALIZED_RADIUS = float(np.sqrt(1 - 0.1**2) / 0.1)
# 기본 저장 위치: 이 스크립트가 있는 datasets 폴더 기준 (다른 폴더에서 실행해도 같은 곳)
DATASETS_DIR = Path(__file__).resolve().parent


def read_gray(path: str) -> np.ndarray:
    """한글 경로도 되게 바이트로 읽는다"""
    try:
        img = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    except (OSError, cv2.error):
        img = None
    if img is None:
        sys.exit(f"이미지를 읽을 수 없다: {path}")
    return img


def read_video_frames(path: str, frames: list[int]) -> tuple[np.ndarray, np.ndarray]:
    """영상에서 프레임 두 장을 흑백으로 꺼낸다 (4주차 녹화 명령으로 찍은 mp4를 그대로 쓴다).
    mp4(H.264)는 프레임 번호로 바로 건너뛰면 키프레임 때문에 몇 장 어긋날 수 있어서, 처음부터 차례로 읽는다."""
    if frames[0] == frames[1]:
        sys.exit("두 프레임이 같다. 카메라가 움직인 뒤의 다른 프레임을 골라야 한다")
    if min(frames) < 0:
        sys.exit("프레임 번호는 0 이상이어야 한다")
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        hint = " (Windows의 OpenCV는 영문 아닌 경로를 못 여는 경우가 있다. 영문 폴더로 옮겨서 다시 해 봐)" if not path.isascii() else ""
        sys.exit(f"영상을 열 수 없다: {path}{hint}")
    wanted = set(frames)
    got: dict[int, np.ndarray] = {}
    try:
        for i in range(max(frames) + 1):
            if not cap.grab():
                sys.exit(f"영상이 {i}프레임에서 끝났다 (요청: {frames[0]}, {frames[1]})")
            if i in wanted:
                ok, frame = cap.retrieve()
                if not ok:
                    sys.exit(f"프레임 {i}을 읽지 못했다")
                got[i] = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    finally:
        cap.release()
    return got[frames[0]], got[frames[1]]


def match(img1: np.ndarray, img2: np.ndarray, features: int, ratio: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """ORB + 2-NN 거리비 검사. (pts1, pts2, 거리비) — 모양 (N,2), (N,2), (N,)"""
    orb = cv2.ORB_create(nfeatures=features)
    k1, d1 = orb.detectAndCompute(img1, None)
    k2, d2 = orb.detectAndCompute(img2, None)
    if d1 is None or d2 is None or len(k1) < 2 or len(k2) < 2:
        return np.zeros((0, 2)), np.zeros((0, 2)), np.zeros(0)
    pairs = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(d1, d2, k=2)
    # 두 번째 후보와 거리가 비슷하면(반복 무늬 등) 헷갈리는 짝이라 버린다
    candidates = []
    for pair in pairs:
        if len(pair) < 2:
            continue
        best, second = pair
        r = best.distance / max(second.distance, 1e-9)
        if r < ratio:
            candidates.append((r, best))
    # 거리비가 좋은(작은) 짝부터 받아서, 사진 2의 한 점이 두 번 짝지어지면 더 확실한 쪽을 남긴다
    candidates.sort(key=lambda c: c[0])
    pts1, pts2, ratios, used = [], [], [], set()
    for r, m in candidates:
        if m.trainIdx in used:
            continue
        used.add(m.trainIdx)
        pts1.append(k1[m.queryIdx].pt)
        pts2.append(k2[m.trainIdx].pt)
        ratios.append(r)
        if len(pts1) >= MAX_MATCHES:
            break
    return np.array(pts1, dtype=np.float64).reshape(-1, 2), np.array(pts2, dtype=np.float64).reshape(-1, 2), np.array(ratios)


def load_calib(path: str) -> dict:
    try:
        cam = json.loads(Path(path).read_text(encoding="utf-8"))["camera"]
        K = np.array([[cam["fx"], 0, cam["cx"]], [0, cam["fy"], cam["cy"]], [0, 0, 1]], dtype=np.float64)
        D = np.array(cam["distortion"], dtype=np.float64)
        return {"model": cam["model"], "K": K, "D": D}
    except (OSError, ValueError, KeyError, TypeError) as e:
        sys.exit(f"calib.json을 읽을 수 없다 ({e}). DATA §3 형식인지 확인해")


def opencv_essential(pts1: np.ndarray, pts2: np.ndarray, calib: dict) -> tuple[int, int] | None:
    """비교 기준: 사이트와 같은 조건(왜곡 보정, 84° 밖 제외, 2px)으로 OpenCV RANSAC E의 inlier 수. (쓴 점, inlier)"""
    K, D = calib["K"], calib["D"]
    try:
        if calib["model"] == "fisheye":
            n1 = cv2.fisheye.undistortPoints(pts1.reshape(-1, 1, 2), K, D).reshape(-1, 2)
            n2 = cv2.fisheye.undistortPoints(pts2.reshape(-1, 1, 2), K, D).reshape(-1, 2)
        else:
            n1 = cv2.undistortPoints(pts1.reshape(-1, 1, 2), K, D).reshape(-1, 2)
            n2 = cv2.undistortPoints(pts2.reshape(-1, 1, 2), K, D).reshape(-1, 2)
        keep = (np.linalg.norm(n1, axis=1) < MAX_NORMALIZED_RADIUS) & (np.linalg.norm(n2, axis=1) < MAX_NORMALIZED_RADIUS)
        n1, n2 = n1[keep], n2[keep]
        if len(n1) < 5:
            print("OpenCV 비교 생략: 쓸 수 있는 대응점이 너무 적다")
            return None
        f = (K[0, 0] + K[1, 1]) / 2
        _, mask = cv2.findEssentialMat(n1, n2, focal=1.0, pp=(0.0, 0.0), method=cv2.RANSAC, prob=0.999, threshold=RANSAC_THRESHOLD_PX / f)
    except cv2.error as e:
        print(f"OpenCV 비교 생략: {(str(e).strip().splitlines() or [type(e).__name__])[-1]}")
        return None
    return len(n1), int(mask.sum()) if mask is not None else 0


def write_json(path: Path, data: dict) -> None:
    """임시 파일에 쓴 뒤 바꿔치기 (쓰다 실패해도 기존 파일을 망가뜨리지 않는다)"""
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, allow_nan=False) + "\n"
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def export(img1: np.ndarray, img2: np.ndarray, out: Path, frames: list[int], features: int, ratio: float, calib: dict | None) -> int:
    pts1, pts2, ratios = match(img1, img2, features, ratio)
    print(f"대응점 {len(pts1)}개 (ORB {features}개, 거리비 < {ratio})")
    if len(pts1) < MIN_MATCHES:
        sys.exit(f"대응점이 {MIN_MATCHES}개보다 적다. 두 사진이 같은 장면을 충분히 겹쳐 찍었는지, 너무 흐리거나 어둡지 않은지 확인해")
    write_json(out, {
        "frames": frames,
        "detector": "orb",
        "pts_i": [[round(float(u), 2), round(float(v), 2)] for u, v in pts1],
        "pts_j": [[round(float(u), 2), round(float(v), 2)] for u, v in pts2],
        "ratio": [round(float(r), 3) for r in ratios],
    })
    print(f"저장: {out}")
    if calib is not None:
        result = opencv_essential(pts1, pts2, calib)
        if result is not None:
            used, inliers = result
            print(f"OpenCV findEssentialMat (5점 RANSAC, {RANSAC_THRESHOLD_PX}px): inlier {inliers} / {used}  ← 사이트의 내 RANSAC 결과와 비교")
    return len(pts1)


def selftest() -> int:
    """무늬 이미지를 원근 변환해 두 번째 사진을 만들고, 대응점이 충분히 나오고 JSON이 잘 써지는지 본다"""
    rng = np.random.default_rng(5)
    h, w = 616, 820
    base = cv2.GaussianBlur((rng.random((h, w)) * 255).astype(np.uint8), (0, 0), 2)
    for _ in range(60):  # 모서리가 많은 도형을 얹어 특징점을 만든다
        x, y = int(rng.integers(0, w - 60)), int(rng.integers(0, h - 60))
        cv2.rectangle(base, (x, y), (x + int(rng.integers(10, 60)), y + int(rng.integers(10, 60))), int(rng.integers(0, 255)), -1)
    H = np.array([[0.97, 0.03, 12], [-0.02, 0.98, 6], [1e-5, -2e-5, 1]])
    warped = cv2.warpPerspective(base, H, (w, h))
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "0_1.json"
        n = export(base, warped, out, [0, 1], DEFAULT_FEATURES, DEFAULT_RATIO, None)
        data = json.loads(out.read_text(encoding="utf-8"))
        # 진짜 짝인지: 첫 사진 점을 H로 옮긴 위치와 두 번째 사진 점이 가까운 비율
        p1 = np.array(data["pts_i"])
        p2 = np.array(data["pts_j"])
        proj = cv2.perspectiveTransform(p1.reshape(-1, 1, 2), H).reshape(-1, 2)
        good = float(np.mean(np.linalg.norm(proj - p2, axis=1) < 3))
    checks = [
        ("대응점 100개 이상", n >= 100),
        ("JSON 형식 (pts_i, pts_j, ratio 길이 같음)", len(data["pts_i"]) == len(data["pts_j"]) == len(data["ratio"])),
        ("대응의 90% 이상이 진짜 짝", good >= 0.9),
    ]
    print(f"진짜 짝 비율: {good:.1%}")
    for name, ok in checks:
        print(f"{'통과' if ok else '실패'}: {name}")
    return 0 if all(ok for _, ok in checks) else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("images", nargs="*", help="사진 두 장 (첫 번째, 두 번째). --video를 쓰면 생략")
    ap.add_argument("--video", help="영상 파일. --frames의 두 프레임을 꺼내 쓴다")
    ap.add_argument("--out", help="저장할 JSON 경로 (기본 datasets/matches/{I}_{J}.json)")
    ap.add_argument("--frames", type=int, nargs=2, default=[0, 1], metavar=("I", "J"), help="프레임 번호 (영상에서 꺼낼 프레임, 사진이면 기록용)")
    ap.add_argument("--calib", help="calib.json (주면 OpenCV E 추정 결과도 보여준다)")
    ap.add_argument("--features", type=int, default=DEFAULT_FEATURES, help=f"ORB 특징점 수 (기본 {DEFAULT_FEATURES})")
    ap.add_argument("--ratio", type=float, default=DEFAULT_RATIO, help=f"거리비 기준 (기본 {DEFAULT_RATIO}, 작을수록 엄격)")
    ap.add_argument("--selftest", action="store_true", help="합성 이미지로 스크립트 검증")
    args = ap.parse_args()

    if args.selftest:
        return selftest()
    if args.video and args.images:
        ap.error("--video와 사진 경로를 같이 줄 수 없다")
    if not args.video and len(args.images) != 2:
        ap.error("사진 두 장의 경로, 또는 --video와 --frames를 주어야 한다")
    if not 0 < args.ratio < 1 or args.features < 100:
        sys.exit("--ratio는 0과 1 사이, --features는 100 이상이어야 한다")
    calib = load_calib(args.calib) if args.calib else None
    if args.video:
        img1, img2 = read_video_frames(args.video, args.frames)
    else:
        img1, img2 = read_gray(args.images[0]), read_gray(args.images[1])
    out = Path(args.out) if args.out else DATASETS_DIR / "matches" / f"{args.frames[0]}_{args.frames[1]}.json"
    export(img1, img2, out, args.frames, args.features, args.ratio, calib)
    return 0


if __name__ == "__main__":
    sys.exit(main())
