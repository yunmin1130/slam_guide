#!/usr/bin/env python3
"""
colmap_tracks.py의 자체 검사 (합성 COLMAP 모델로 변환·오류 처리를 확인한다).

본체 파일이 800줄을 넘지 않게 따로 뺐다. 실행은 본체에서 한다:
  python datasets/colmap_tracks.py --selftest
"""

from __future__ import annotations

import dataclasses
import tempfile
from dataclasses import dataclass
from typing import Callable

from colmap_tracks import *  # noqa: F401,F403  (본체의 공개 이름: Camera, Options, convert, np, Path ...)


def _mat_to_quat(R: np.ndarray) -> np.ndarray:
    """회전 행렬 → [w, x, y, z] (자체 검사용, 가장 큰 성분부터)"""
    K = np.array(
        [
            [R[0, 0] + R[1, 1] + R[2, 2], R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]],
            [R[2, 1] - R[1, 2], R[0, 0] - R[1, 1] - R[2, 2], R[0, 1] + R[1, 0], R[0, 2] + R[2, 0]],
            [R[0, 2] - R[2, 0], R[0, 1] + R[1, 0], R[1, 1] - R[0, 0] - R[2, 2], R[1, 2] + R[2, 1]],
            [R[1, 0] - R[0, 1], R[0, 2] + R[2, 0], R[1, 2] + R[2, 1], R[2, 2] - R[0, 0] - R[1, 1]],
        ]
    )
    w, v = np.linalg.eigh(K)
    q = v[:, int(np.argmax(w))]
    return q if q[0] >= 0 else -q


def _look_at(center: np.ndarray, target: np.ndarray) -> np.ndarray:
    """카메라→월드 회전 (열 = 카메라의 x 오른쪽, y 아래, z 앞 축을 월드에서 본 것)"""
    z = (target - center) / np.linalg.norm(target - center)
    x = np.cross(np.array([0.0, 0.0, 1.0]), z)
    x /= np.linalg.norm(x)
    return np.stack([x, np.cross(z, x), z], axis=1)


@dataclass(frozen=True)
class _Synthetic:
    """합성 COLMAP 모델의 참값"""

    names: list[str]
    centers: np.ndarray  # (N, 3)
    r_wc: np.ndarray  # (N, 3, 3)
    points: np.ndarray  # (M, 3)
    visible: list[list[int]]  # 사진마다 보이는 점 번호 (POINT3D_ID = 번호 + 1)


def _synthetic_cameras() -> dict[int, Camera]:
    """폰 사진 크기의 카메라 두 대: 기준(SIMPLE_RADIAL)과, 내부 파라미터가 다른 OPENCV"""
    return {
        1: Camera(1, "SIMPLE_RADIAL", 4000, 3000, 3000.0, 3000.0, 2010.0, 1490.0, k1=0.08),
        2: Camera(2, "OPENCV", 4000, 3000, 2900.0, 2950.0, 1980.0, 1520.0, k1=0.05, k2=-0.02, p1=0.001, p2=-0.002),
    }


def _synthetic_scene(n_images: int, n_points: int, seed: int) -> _Synthetic:
    """상자 안의 점들을 반 바퀴 돌며 찍는다. 월드는 COLMAP처럼 아무 좌표계(돌리고 2.5배 키우고 옮김)다"""
    rng = np.random.default_rng(seed)
    points = rng.uniform([-1.5, -1.5, -1.0], [1.5, 1.5, 1.0], size=(n_points, 3))
    angles = np.linspace(0.0, np.pi, n_images)
    centers = np.stack([4 * np.cos(angles), 4 * np.sin(angles), 0.3 * np.sin(3 * angles)], axis=1)
    r_wc = np.stack([_look_at(c, rng.normal(0, 0.15, 3)) for c in centers])
    # 점마다 보이는 각도 구간이 다르다 (실제 사진처럼 트랙이 짧다)
    mid = rng.uniform(0.0, np.pi, n_points)
    half = rng.uniform(0.35, 0.9, n_points)
    visible = [[int(j) for j in np.flatnonzero(np.abs(mid - a) < half)] for a in angles]
    gauge = _look_at(np.array([0.3, -0.2, 0.9]), np.zeros(3))  # 아무 회전
    move = lambda p: 2.5 * p @ gauge.T + np.array([10.0, -4.0, 2.0])  # noqa: E731
    return _Synthetic(
        [f"IMG_{k:04d}.jpg" for k in range(n_images)],
        move(centers),
        np.stack([gauge @ R for R in r_wc]),
        move(points),
        visible,
    )


def _project(cam: Camera, R_wc: np.ndarray, center: np.ndarray, X: np.ndarray) -> np.ndarray:
    """COLMAP 식으로 투영한 원본(왜곡된) 픽셀"""
    pc = (X - center) @ R_wc  # Rᵀ(X − C)
    x, y = pc[:, 0] / pc[:, 2], pc[:, 1] / pc[:, 2]
    dx, dy = distortion(cam, x, y)
    return np.stack([cam.fx * (x + dx) + cam.cx, cam.fy * (y + dy) + cam.cy], axis=1)


def _write_model(model_dir: Path, scene: _Synthetic, cameras: dict[int, Camera], noise_px: float = 0.0, seed: int = 0) -> None:
    """합성 장면을 COLMAP 텍스트 모델로 쓴다. 홀수 번째 사진은 카메라 2, 사진마다 3D 점이 없는 특징점(-1)도 하나 넣는다"""
    rng = np.random.default_rng(seed)
    model_dir.mkdir(parents=True, exist_ok=True)
    cam_lines = []
    for c in cameras.values():
        params = {"f": c.fx, "fx": c.fx, "fy": c.fy, "cx": c.cx, "cy": c.cy, "k1": c.k1, "k2": c.k2, "p1": c.p1, "p2": c.p2}
        cam_lines.append(f"{c.camera_id} {c.model} {c.width} {c.height} " + " ".join(repr(params[n]) for n in MODEL_PARAMS[c.model]))
    img_lines, tracks = [], {}
    for k, name in enumerate(scene.names):
        cam = cameras[1 + k % 2]
        R_cw = scene.r_wc[k].T
        q = _mat_to_quat(R_cw)
        t = -R_cw @ scene.centers[k]
        ids = scene.visible[k]
        px = _project(cam, scene.r_wc[k], scene.centers[k], scene.points[ids]) + rng.normal(0, noise_px, (len(ids), 2)) if ids else np.empty((0, 2))
        obs = ["123.5 456.5 -1"] + [f"{u!r} {v!r} {j + 1}" for (u, v), j in zip(px.tolist(), ids)]
        for idx, j in enumerate(ids):
            tracks.setdefault(j, []).append((k + 1, idx + 1))
        img_lines += [f"{k + 1} {q[0]!r} {q[1]!r} {q[2]!r} {q[3]!r} {t[0]!r} {t[1]!r} {t[2]!r} {cam.camera_id} {name}", " ".join(obs)]
    pt_lines = [f"{j + 1} {X[0]!r} {X[1]!r} {X[2]!r} 128 128 128 0.5 " + " ".join(f"{a} {b}" for a, b in tracks[j]) for j, X in enumerate(scene.points.tolist()) if j in tracks]
    # 실제 COLMAP처럼 위에서부터 쓴 순서가 이름순이 아니게 사진 순서를 뒤집어 쓴다 (두 줄씩 묶어서)
    pairs = [img_lines[i : i + 2] for i in range(0, len(img_lines), 2)][::-1]
    (model_dir / "cameras.txt").write_text("# Camera list with one line of data per camera:\n" + "\n".join(cam_lines) + "\n", encoding="utf-8")
    (model_dir / "images.txt").write_text("# Image list with two lines of data per image:\n" + "\n".join(line for p in pairs for line in p) + "\n", encoding="utf-8")
    (model_dir / "points3D.txt").write_text("# 3D point list with one line of data per point:\n" + "\n".join(pt_lines) + "\n", encoding="utf-8")


def _expect_input_error(fn: Callable[[], object]) -> bool:
    try:
        fn()
    except InputError:
        return True
    return False


def _selftest_conversion(tmp: Path, checks: list[tuple[str, bool]]) -> dict:
    """알고 있는 자세·점으로 만든 모델을 변환해 숫자로 대조한다"""
    cameras = _synthetic_cameras()
    scene = _synthetic_scene(n_images=12, n_points=300, seed=1)
    model = tmp / "model"
    _write_model(model, scene, cameras)
    data = convert(model, Options(name="synthetic", long_side=640, max_features=2000, camera_id=None))
    cam = data["camera"]
    gt = np.array(data["groundtruth"])
    checks.append(("사진은 이름순, 시각은 0, 1, 2, …", data["images"] == scene.names and [f["t"] for f in data["frames"]] == [float(k) for k in range(12)]))
    checks.append(("기준 카메라 = 사진이 가장 많은(같으면 번호가 작은) 카메라 1, 긴 변 640으로 축소", data["reference_camera_id"] == 1 and (cam["width"], cam["height"]) == (640, 480) and abs(cam["fx"] - 480.0) < 1e-9 and abs(cam["cx"] - 321.6) < 1e-9))
    err_c = float(np.max(np.abs(gt[:, :3] - scene.centers)))
    checks.append((f"카메라 중심 C = −Rᵀt 가 참값과 같다 (최대 차이 {err_c:.1e})", err_c < 2e-6))
    err_r = max(float(np.max(np.abs(quat_to_mat(g[3:]) - R))) for g, R in zip(gt, scene.r_wc))
    checks.append((f"쿼터니언(w 먼저)이 카메라→월드 회전이다 (최대 차이 {err_r:.1e})", err_r < 5e-6))
    # 왜곡 편 픽셀 = 기준 K(축소)로 한 이상적인 핀홀 투영. 카메라 1·2 사진 모두
    worst = 0.0
    for k, frame in enumerate(data["frames"]):
        pc = (scene.points[[i - 1 for i, _, _ in frame["features"]]] - scene.centers[k]) @ scene.r_wc[k]
        ideal = np.stack([cam["fx"] * pc[:, 0] / pc[:, 2] + cam["cx"], cam["fy"] * pc[:, 1] / pc[:, 2] + cam["cy"]], axis=1)
        worst = max(worst, float(np.max(np.abs(ideal - np.array([[u, v] for _, u, v in frame["features"]])))))
    checks.append((f"왜곡을 편 픽셀이 핀홀 투영과 같다, 카메라가 달라도 (최대 {worst:.4f}px, 0.002px 안)", worst < 0.002))
    checks.append(("POINT3D_ID가 -1인 특징점은 빠지고, id는 POINT3D_ID 그대로", all([i - 1 for i, _, _ in f["features"]] == sorted(scene.visible[k]) for k, f in enumerate(data["frames"]))))
    first = tum_trajectory(data).splitlines()[1].split()
    checks.append(("TUM 궤적 줄은 '시각 tx ty tz qx qy qz qw' (w가 마지막)", len(first) == 8 and abs(float(first[7]) - gt[0, 3]) < 1e-6 and abs(float(first[4]) - gt[0, 4]) < 1e-6))
    # 왜곡 식을 이 스크립트의 함수가 아니라 손으로 계산한 값과 대조한다 (위 검사는 투영과 펴기에 같은 함수를 쓴다)
    #   RADIAL f=1000, (cx, cy)=(500, 400), k1=0.1, k2=0.01, 점 (0.5, 0): r²=0.25, 방사 = 0.1·0.25 + 0.01·0.0625 = 0.025625
    #     → 왜곡된 x = 0.5·1.025625 = 0.5128125 → u = 500 + 512.8125 = 1012.8125
    #   OPENCV k=0, p1=0.01, p2=0.02, 점 (0.2, 0.1): r²=0.05
    #     dx = 2·p1·x·y + p2·(r² + 2x²) = 0.0004 + 0.0026 = 0.003,  dy = 2·p2·x·y + p1·(r² + 2y²) = 0.0008 + 0.0007 = 0.0015
    radial = Camera(9, "RADIAL", 1000, 800, 1000.0, 1000.0, 500.0, 400.0, k1=0.1, k2=0.01)
    back, ok = to_normalized(radial, np.array([[1012.8125, 400.0]]))
    tangential = Camera(9, "OPENCV", 1000, 800, 1000.0, 1000.0, 500.0, 400.0, p1=0.01, p2=0.02)
    tdx, tdy = distortion(tangential, np.array([0.2]), np.array([0.1]))
    hand_ok = bool(ok[0]) and np.allclose(back[0], [0.5, 0.0], atol=1e-9) and abs(tdx[0] - 0.003) < 1e-12 and abs(tdy[0] - 0.0015) < 1e-12
    checks.append(("왜곡 식이 손으로 계산한 값과 같다 (RADIAL 펴기, OPENCV 접선 항)", hand_ok))
    capped = convert(model, Options(name="synthetic", long_side=0, max_features=50, camera_id=2))
    checks.append(("--max-features 50, --long-side 0, --camera-id 2", max(len(f["features"]) for f in capped["frames"]) == 50 and capped["camera"]["width"] == 4000 and capped["camera"]["fy"] == 2950.0))
    return data


def _selftest_errors(tmp: Path, data: dict, checks: list[tuple[str, bool]]) -> None:
    """파일 모양이 틀렸을 때와 저장 규칙"""
    cameras = _synthetic_cameras()
    scene = _synthetic_scene(n_images=4, n_points=40, seed=2)
    opts = Options(name="bad", long_side=640, max_features=400, camera_id=None)

    def broken(folder: str, file: str, edit: Callable[[str], str]) -> bool:
        d = tmp / folder
        _write_model(d, scene, cameras)
        (d / file).write_text(edit((d / file).read_text(encoding="utf-8")), encoding="utf-8")
        return _expect_input_error(lambda: convert(d, opts))

    empty = tmp / "empty-line"
    _write_model(empty, scene, cameras)
    lines = (empty / "images.txt").read_text(encoding="utf-8").splitlines()
    lines[2] = ""  # 첫 사진의 특징점 줄을 비운다
    (empty / "images.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    kept = convert(empty, opts)
    checks.append(("특징점 줄이 빈 사진도 읽는다 (그 사진은 특징점 0개)", len(kept["frames"]) == 4 and sorted(len(f["features"]) == 0 for f in kept["frames"]) == [False, False, False, True]))
    checks.append(("빈 특징점 줄이 지워져 두 줄 구조가 깨지면 이유를 담아 거부", broken("stripped", "images.txt", lambda s: "\n".join(line for i, line in enumerate(s.splitlines()) if i != 2) + "\n")))
    named = tmp / "natural"
    _write_model(named, dataclasses.replace(scene, names=["a10.jpg", "A2.jpg", "a1.jpg", "b0.jpg"]), cameras)
    checks.append(("사진 순서는 숫자를 숫자로 비교한다 (a1, A2, a10, b0)", convert(named, opts)["images"] == ["a1.jpg", "A2.jpg", "a10.jpg", "b0.jpg"]))
    checks.append(("지원하지 않는 카메라 모델(OPENCV_FISHEYE)은 거부", broken("fisheye", "cameras.txt", lambda s: s.replace("SIMPLE_RADIAL", "OPENCV_FISHEYE"))))
    checks.append(("파라미터 개수가 모델과 다르면 거부", broken("params", "cameras.txt", lambda s: s.replace("SIMPLE_RADIAL", "RADIAL"))))
    checks.append(("images.txt가 points3D.txt에 없는 점을 가리키면 거부", broken("orphan", "points3D.txt", lambda s: "\n".join(s.splitlines()[:3]) + "\n")))
    checks.append(("쿼터니언이 0이면 거부", broken("quat", "images.txt", lambda s: re.sub(r"(?m)^1 \S+ \S+ \S+ \S+", "1 0 0 0 0", s))))
    checks.append(("사진이 3장보다 적으면 거부", broken("few", "images.txt", lambda s: "\n".join(s.splitlines()[:5]) + "\n")))
    checks.append(("cameras.txt가 없으면 거부", _expect_input_error(lambda: convert(tmp / "nowhere", opts)) and _expect_input_error(lambda: read_cameras(tmp))))
    checks.append(("--name에 경로 글자가 있으면 거부", _expect_input_error(lambda: convert(empty, Options("../x", 640, 400, None)))))

    out_dir = tmp / "out"
    out_dir.mkdir()
    out = out_dir / "t.json"
    write_text(out, to_json(data), ".json", force=False)
    reread = json.loads(out.read_text(encoding="utf-8"))
    checks.append(("저장한 JSON을 다시 읽으면 같다", reread == json.loads(to_json(data))))
    checks.append(("이미 있는 파일은 --force 없이 덮어쓰지 않는다", _expect_input_error(lambda: write_text(out, "{}", ".json", force=False))))
    checks.append(("저장할 폴더가 없으면 거부 (새 폴더 트리를 만들지 않는다)", _expect_input_error(lambda: write_text(tmp / "no" / "dir" / "t.json", "{}", ".json", force=True))))
    checks.append(("NaN이 든 데이터는 저장하지 않는다", _expect_input_error(lambda: to_json({"x": float("nan")}))))
    photos = tmp / "photos"
    photos.mkdir()
    for n in ("IMG_0000.jpg", "IMG_0099.jpg", "IMG_100.jpg", "IMG_20.jpg", "notes.txt"):
        (photos / n).write_bytes(b"")
    missing = unregistered(photos, kept["images"])
    checks.append(("--images: 모델에 없는 사진(등록 실패)을 이름순으로 찾는다", missing == ["IMG_20.jpg", "IMG_0099.jpg", "IMG_100.jpg"]))


def selftest() -> None:
    checks: list[tuple[str, bool]] = []
    with tempfile.TemporaryDirectory() as tmp:
        data = _selftest_conversion(Path(tmp), checks)
        _selftest_errors(Path(tmp), data, checks)
    for label, ok in checks:
        print(f"[{'통과' if ok else '실패'}] {label}")
    failed = [label for label, ok in checks if not ok]
    if failed:
        sys.exit(f"자체 검사 실패 {len(failed)}개")
    print(f"자체 검사 {len(checks)}개 모두 통과")
