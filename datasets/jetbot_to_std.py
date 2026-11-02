#!/usr/bin/env python3
"""
주행 영상 → 표준 시퀀스 폴더 (CURRICULUM 10주차 JetBot 데이터셋 제작, DATA §2 형식).

JetBot(또는 아이폰)으로 찍은 mp4에서 N장마다 한 장씩 프레임을 꺼내 images/, timestamps.txt, meta.json을 만든다.
calib.json을 주면 함께 복사한다. 11주차 VO와 캡스톤이 이 폴더를 그대로 읽는다.

안전장치: 결과는 임시 폴더에 다 만든 뒤에만 제자리로 옮긴다. --force로 덮어쓸 때도
그 폴더가 이 스크립트가 만든 시퀀스 폴더(meta.json, images/ …)일 때만 지운다.

사용 (PC):
  pip install opencv-python numpy
  python datasets/jetbot_to_std.py --video home.mp4 --name home-square-slow-01 \\
      --path-desc "거실 1m×1m 사각형, 저속" --eval measured-square --calib datasets/calib.json
  python datasets/jetbot_to_std.py --selftest     # 합성 영상으로 스크립트 검증
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shutil
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

DATASETS_DIR = Path(__file__).resolve().parent
SEQUENCES_DIR = DATASETS_DIR / "sequences"
DEFAULT_EVERY = 3  # 30fps 영상이면 10fps로 줄인다 (VO에 충분하고 파일이 작다)
JPEG_QUALITY = 92
NAME_PATTERN = re.compile(r"^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+-\d{2}$")  # {장소}-{경로}-{조건}-{번호} (DATA §4)
# 이 스크립트가 만드는 시퀀스 폴더의 내용. --force는 이것들만 있는 폴더만 지운다
OWN_ENTRIES = {"images", "meta.json", "timestamps.txt", "calib.json", "matches"}
SOURCES = ("jetbot", "iphone")
ROBOTS = ("jetbot-basic", "jetbot-ros", "none")
EVALS = ("return-to-start", "measured-square", "groundtruth")
FRAME_COUNT_SLACK = 0.9  # 영상이 알려 준 프레임 수의 90%도 못 읽으면 깨진 영상일 수 있다


class InputError(Exception):
    """사용자 입력 문제 (안내 문구만 보여주고 끝낸다)"""


def write_text(path: Path, text: str) -> None:
    """임시 파일에 쓴 뒤 바꿔치기 (쓰다 실패해도 기존 파일을 망가뜨리지 않는다)"""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def open_video(video: str) -> tuple[cv2.VideoCapture, float, int]:
    if not Path(video).is_file():
        raise InputError(f"영상 파일이 없다: {video}")
    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        raise InputError(f"영상을 열 수 없다: {video} (Windows에서는 한글이 든 경로를 OpenCV가 못 여는 경우가 있다. 영어 경로로 옮겨 봐)")
    fps = cap.get(cv2.CAP_PROP_FPS)
    if not (fps and fps > 0):
        cap.release()
        raise InputError("영상의 fps를 알 수 없다. 녹화 명령의 framerate를 확인해")
    return cap, fps, int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)


def resolve_out(args: argparse.Namespace) -> Path:
    """저장 폴더를 정하고, 지우면 안 되는 곳을 막는다"""
    if args.out:
        out = Path(args.out).resolve()
    else:
        out = (SEQUENCES_DIR / args.name).resolve()
        if out.parent != SEQUENCES_DIR.resolve():
            raise InputError(f"이름 {args.name}으로 만든 경로가 datasets/sequences 밖이다")
    forbidden = {Path.home().resolve(), Path.cwd().resolve(), DATASETS_DIR, DATASETS_DIR.parent, Path(out.anchor)}
    if out in forbidden or out in Path.cwd().resolve().parents:
        raise InputError(f"{out}은 시퀀스 폴더로 쓸 수 없다 (홈·현재 폴더·저장소·드라이브 루트)")
    video = Path(args.video).resolve()
    if out == video.parent or out in video.parents:
        raise InputError("저장 폴더 안에 원본 영상이 있다. 다른 폴더를 골라")
    return out


def check_replaceable(out: Path, force: bool) -> None:
    """이미 있는 폴더는 --force이고, 이 스크립트가 만든 시퀀스 폴더 모양일 때만 덮어쓴다"""
    if not out.exists():
        return
    if not out.is_dir():
        raise InputError(f"{out}은 폴더가 아니다")
    entries = {p.name for p in out.iterdir()}
    if not entries:
        return
    if not force:
        raise InputError(f"{out}이 이미 있다. 덮어쓰려면 --force")
    if "meta.json" not in entries or not entries <= OWN_ENTRIES:
        raise InputError(f"{out}은 시퀀스 폴더가 아니라서 지우지 않는다 (들어 있는 것: {sorted(entries)[:5]})")


def extract_frames(cap: cv2.VideoCapture, fps: int | float, expected: int, images: Path, every: int, max_frames: int | None, width: int | None) -> list[int]:
    """every장마다 한 장을 JPEG로 쓰고, 그 프레임의 시간(나노초)을 돌려준다.
    시간은 프레임 번호 ÷ fps로 계산한다 (mp4 시각 정보가 어긋나는 경우가 있어 번호 기준이 더 안정하다)."""
    images.mkdir(parents=True, exist_ok=True)
    stamps: list[int] = []
    read = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        index = read
        read += 1
        if index % every:
            continue
        if width and frame.shape[1] != width:
            h = round(frame.shape[0] * width / frame.shape[1])
            frame = cv2.resize(frame, (width, h), interpolation=cv2.INTER_AREA)
        ok_write, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
        if not ok_write:
            raise InputError(f"{index}번 프레임을 JPEG로 바꿀 수 없다")
        buf.tofile(str(images / f"{len(stamps):06d}.jpg"))  # 한글 경로도 되게
        stamps.append(round(index * 1_000_000_000 / fps))
        if max_frames and len(stamps) >= max_frames:
            break
    if len(stamps) < 2:
        raise InputError("꺼낸 프레임이 2장보다 적다. 영상 길이와 --every를 확인해")
    print(f"프레임 {read}장 읽고 {len(stamps)}장 저장 (fps {fps:.2f}, {every}장마다 1장)")
    if not max_frames and expected and read < expected * FRAME_COUNT_SLACK:
        print(f"주의: 영상은 {expected}장이라는데 {read}장만 읽혔다. 녹화를 Ctrl+C로 끊을 때 -e가 없었으면 끝이 깨진다")
    return stamps


def build_meta(args: argparse.Namespace) -> dict:
    return {
        "name": args.name,
        "source": args.source,
        "robot": args.robot,
        "recorded_at": args.recorded_at,
        "path_desc": args.path_desc,
        "conditions": {"rotation_speed": args.rotation_speed, "lighting": args.lighting, "exposure": args.exposure},
        "eval": args.eval,
        "license": "own",
    }


def convert(args: argparse.Namespace) -> Path:
    """입력을 모두 검사한 뒤 임시 폴더에 만들고, 성공했을 때만 제자리로 옮긴다"""
    if not NAME_PATTERN.match(args.name or ""):
        raise InputError(f"이름 {args.name!r}이 규칙 {{장소}}-{{경로}}-{{조건}}-{{번호}}(소문자·숫자, 예: home-square-slow-01)와 다르다")
    if args.calib and not (Path(args.calib).is_file() and args.calib.lower().endswith(".json")):
        raise InputError(f"calib.json이 없다: {args.calib}")
    out = resolve_out(args)
    check_replaceable(out, args.force)
    cap, fps, expected = open_video(args.video)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(dir=out.parent, prefix=f".{out.name}.", suffix=".tmp"))
    try:
        try:
            stamps = extract_frames(cap, fps, expected, tmp / "images", args.every, args.max_frames, args.width)
        finally:
            cap.release()
        write_text(tmp / "timestamps.txt", "".join(f"{t}\n" for t in stamps))
        write_text(tmp / "meta.json", json.dumps(build_meta(args), ensure_ascii=False, indent=2) + "\n")
        if args.calib:
            shutil.copyfile(args.calib, tmp / "calib.json")
        if out.exists():
            shutil.rmtree(out)  # check_replaceable이 시퀀스 폴더임을 확인했다
        os.replace(tmp, out)
    except BaseException:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    if args.calib and args.width:
        print("주의: --width로 크기를 바꿨다. calib.json은 원래 해상도 기준이니 fx, fy, cx, cy를 같은 비율로 바꿔야 한다")
    if not args.calib:
        print("주의: calib.json을 주지 않았다. VO에 쓰려면 4주차 캘리브레이션 결과를 이 폴더에 복사해")
    print(f"저장: {out}")
    return out


def selftest() -> int:
    """합성 영상(30fps, 90장)으로 변환 결과와 안전장치를 확인한다"""
    rng = np.random.default_rng(3)
    h, w = 240, 320
    base = (rng.random((h, w * 2)) * 255).astype(np.uint8)
    checks: list[tuple[str, bool]] = []

    def refused(ns: argparse.Namespace) -> bool:
        try:
            convert(ns)
        except InputError:
            return True
        return False

    with tempfile.TemporaryDirectory() as d:
        video = str(Path(d) / "walk.avi")
        writer = cv2.VideoWriter(video, cv2.VideoWriter_fourcc(*"MJPG"), 30.0, (w, h))
        if not writer.isOpened():
            print("실패: 합성 영상을 쓸 수 없다 (OpenCV 비디오 코덱)")
            return 1
        for k in range(90):
            writer.write(cv2.cvtColor(base[:, k : k + w].copy(), cv2.COLOR_GRAY2BGR))
        writer.release()
        calib = Path(d) / "calib.json"
        calib.write_text('{"model": "pinhole"}\n', encoding="utf-8")
        out = Path(d) / "out" / "seq"

        def ns(**kw: object) -> argparse.Namespace:
            base_args = dict(
                video=video, name="test-line-slow-01", out=str(out), every=3, max_frames=None, width=None, force=False,
                source="jetbot", robot="jetbot-basic", recorded_at="2026-11-03", path_desc="합성", rotation_speed="slow",
                lighting="day", exposure="auto", eval="return-to-start", calib=str(calib),
            )
            base_args.update(kw)
            return argparse.Namespace(**base_args)

        convert(ns())
        images = sorted((out / "images").glob("*.jpg"))
        stamps = [int(x) for x in (out / "timestamps.txt").read_text(encoding="utf-8").split()]
        meta = json.loads((out / "meta.json").read_text(encoding="utf-8"))
        gaps = {b - a for a, b in zip(stamps, stamps[1:])}
        checks += [
            ("이미지 30장 (90장 중 3장마다)", len(images) == 30),
            ("이미지 이름 000000.jpg부터 차례로", [p.name for p in images[:2]] == ["000000.jpg", "000001.jpg"]),
            ("시간 30개, 0부터 0.1초(1e8 ns) 간격", len(stamps) == 30 and stamps[0] == 0 and gaps == {100_000_000}),
            ("meta.json 필드 (DATA §2)", set(meta) == {"name", "source", "robot", "recorded_at", "path_desc", "conditions", "eval", "license"}),
            ("calib.json 복사", (out / "calib.json").is_file()),
        ]
        # 안전장치
        checks.append(("이미 있으면 --force 없이는 거부", refused(ns())))
        checks.append(("영상 경로가 틀리면 기존 결과를 지우지 않는다", refused(ns(video=str(Path(d) / "missing.mp4"), force=True)) and (out / "meta.json").is_file()))
        convert(ns(force=True, max_frames=5))
        checks.append(("--force로 다시 만들면 바뀐다 (5장)", len(list((out / "images").glob("*.jpg"))) == 5))
        checks.append(("이름 규칙에 안 맞으면(.. 등) 거부", refused(ns(name="..", out=None, force=True))))
        stranger = Path(d) / "stranger"
        stranger.mkdir()
        (stranger / "notes.txt").write_text("내 파일", encoding="utf-8")
        checks.append(("시퀀스 폴더가 아니면 --force여도 지우지 않는다", refused(ns(out=str(stranger), force=True)) and (stranger / "notes.txt").is_file()))
        checks.append(("원본 영상이 든 폴더는 거부", refused(ns(out=d, force=True)) and Path(video).is_file()))
        checks.append(("임시 폴더가 남지 않는다", not any(p.name.endswith(".tmp") for p in (Path(d) / "out").iterdir())))
    for name, ok in checks:
        print(f"{'통과' if ok else '실패'}: {name}")
    return 0 if all(ok for _, ok in checks) else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video", help="주행 영상 (mp4)")
    ap.add_argument("--name", help="시퀀스 이름 {장소}-{경로}-{조건}-{번호} (소문자·숫자, 예: home-square-slow-01)")
    ap.add_argument("--out", help="저장 폴더 (기본 datasets/sequences/{name})")
    ap.add_argument("--every", type=int, default=DEFAULT_EVERY, help=f"몇 장마다 한 장 저장할지 (기본 {DEFAULT_EVERY})")
    ap.add_argument("--max-frames", type=int, help="최대 저장 장수 (사이트 샘플은 100장 이하, DATA §1)")
    ap.add_argument("--width", type=int, help="가로 크기를 바꿔 저장 (calib.json도 같은 비율로 바꿔야 한다)")
    ap.add_argument("--force", action="store_true", help="같은 시퀀스 폴더가 이미 있으면 새로 만든 것으로 바꾼다")
    ap.add_argument("--source", choices=SOURCES, default="jetbot")
    ap.add_argument("--robot", choices=ROBOTS, default="jetbot-basic")
    ap.add_argument("--recorded-at", default=dt.date.today().isoformat(), help="녹화 날짜 YYYY-MM-DD (기본 오늘)")
    ap.add_argument("--path-desc", default="", help='경로 설명 (예: "거실 1m×1m 사각형, 저속")')
    ap.add_argument("--rotation-speed", choices=("slow", "fast"), default="slow")
    ap.add_argument("--lighting", choices=("day", "night"), default="day")
    ap.add_argument("--exposure", choices=("auto", "fixed"), default="auto")
    ap.add_argument("--eval", choices=EVALS, default="return-to-start", help="정답 없이 평가하는 방법 (DATA §4)")
    ap.add_argument("--calib", help="함께 복사할 calib.json (4주차 결과)")
    ap.add_argument("--selftest", action="store_true", help="합성 영상으로 스크립트 검증")
    args = ap.parse_args()

    if args.selftest:
        return selftest()
    if not args.video or not args.name:
        ap.error("--video와 --name이 필요하다 (또는 --selftest)")
    if args.every < 1:
        ap.error("--every는 1 이상이어야 한다")
    if args.max_frames is not None and args.max_frames < 2:
        ap.error("--max-frames는 2 이상이어야 한다")
    if args.width is not None and args.width < 16:
        ap.error("--width는 16 이상이어야 한다")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.recorded_at):
        ap.error("--recorded-at은 YYYY-MM-DD 형식이다")
    try:
        convert(args)
    except InputError as e:
        print(f"멈춤: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
