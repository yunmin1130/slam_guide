"""12a 결과 쇼케이스용 JSON 만들기 (형식 "slam-guide-result" v1, docs/DATA.md §2).

evo 결과 zip(--save_results)의 stats.json 에서 RMSE를 꺼내거나, 숫자를 직접 받아
site/src/data/cpp-results/<시퀀스>-<구현>.json 을 만든다. 사이트는 빌드 때 이 파일들을 표로 보여준다.

예:
  evo_ape tum gt.txt est.txt -as --save_results ape.zip
  evo_rpe tum gt.txt est.txt -as -d 15 -u f --save_results rpe.zip
  python datasets/cpp_result.py --sequence fr1/xyz --impl cpp \
      --ape ape.zip --rpe rpe.zip --tracked 299 --total 300

  # 사이트 실행기 숫자(TS mine)를 직접 넣을 때
  python datasets/cpp_result.py --sequence fr1/xyz --impl ts-mine --ate-rmse 0.046 --rpe-trans 0.012

  python datasets/cpp_result.py --selftest
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import math
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

FORMAT = "slam-guide-result"
IMPLS = ("ts-mine", "ts-reference", "cpp", "orbslam3")
ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "site" / "src" / "data" / "cpp-results"
MAX_TEXT = 200
MAX_ZIP_ENTRY = 1_000_000  # stats.json 은 작다. 큰 파일은 거부한다


def read_evo_rmse(zip_path: Path) -> float:
    """evo --save_results zip 의 stats.json 에서 rmse 를 꺼낸다."""
    with zipfile.ZipFile(zip_path) as z:
        names = [n for n in z.namelist() if n.rsplit("/", 1)[-1] == "stats.json"]
        if not names:
            raise ValueError(f"{zip_path}: stats.json 이 없다 (evo --save_results 로 만든 zip 인가?)")
        if len(names) > 1:
            raise ValueError(f"{zip_path}: stats.json 이 여러 개다 ({', '.join(names)})")
        # 헤더의 크기 선언은 믿지 않고, 상한 + 1 바이트까지만 실제로 읽어 본다
        with z.open(names[0]) as fh:
            raw = fh.read(MAX_ZIP_ENTRY + 1)
        if len(raw) > MAX_ZIP_ENTRY:
            raise ValueError(f"{zip_path}: stats.json 이 너무 크다")
        stats = json.loads(raw.decode("utf-8"))
    rmse = stats.get("rmse") if isinstance(stats, dict) else None
    if isinstance(rmse, bool) or not isinstance(rmse, (int, float)) or not math.isfinite(rmse) or rmse < 0:
        raise ValueError(f"{zip_path}: stats.json 의 rmse 가 0 이상의 수가 아니다")
    return float(rmse)


def git_sha() -> str | None:
    try:
        out = subprocess.run(["git", "rev-parse", "--short=7", "HEAD"], cwd=ROOT, capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return None
    sha = out.stdout.strip()
    return sha if out.returncode == 0 and re.fullmatch(r"[0-9a-f]{7,40}", sha) else None


def slug(text: str) -> str:
    s = re.sub(r"[^0-9A-Za-z]+", "-", text).strip("-").lower()
    return s or "result"


def check_text(name: str, value: str, allow_empty: bool = False) -> str:
    if (not allow_empty and not value.strip()) or len(value) > MAX_TEXT:
        raise ValueError(f"{name} 는 {MAX_TEXT}자 이하여야 한다")
    return value


def check_number(name: str, value: float | None) -> float | None:
    if value is None:
        return None
    if not math.isfinite(value) or value < 0:
        raise ValueError(f"{name} 는 0 이상의 유한한 수여야 한다")
    return value


def build(args: argparse.Namespace, sha: str | None, today: str) -> dict:
    if args.impl not in IMPLS:
        raise ValueError(f"--impl 은 {', '.join(IMPLS)} 중 하나")
    if (args.ape is None) == (args.ate_rmse is None):
        raise ValueError("--ape 와 --ate-rmse 중 하나만 준다")
    if args.rpe is not None and args.rpe_trans is not None:
        raise ValueError("--rpe 와 --rpe-trans 중 하나만 준다")
    if args.rpe_rot is not None and args.rpe_rot_deg is not None:
        raise ValueError("--rpe-rot 과 --rpe-rot-deg 중 하나만 준다")
    ate = read_evo_rmse(Path(args.ape)) if args.ape else check_number("--ate-rmse", args.ate_rmse)
    trans = read_evo_rmse(Path(args.rpe)) if args.rpe else check_number("--rpe-trans", args.rpe_trans)
    rot = read_evo_rmse(Path(args.rpe_rot)) if args.rpe_rot else check_number("--rpe-rot-deg", args.rpe_rot_deg)
    frames = None
    if (args.tracked is None) != (args.total is None):
        raise ValueError("--tracked 와 --total 은 함께 준다")
    if args.total is not None:
        if not (0 < args.total and 0 <= args.tracked <= args.total):
            raise ValueError("0 < total, 0 ≤ tracked ≤ total 이어야 한다")
        frames = {"tracked": args.tracked, "total": args.total}
    rpe = None if trans is None and rot is None else {"trans_rmse": trans, "rot_rmse_deg": rot}
    return {
        "format": FORMAT,
        "version": 1,
        "sequence": check_text("--sequence", args.sequence),
        "impl": args.impl,
        "git_sha": sha,
        "date": today,
        "frames": frames,
        "ate": {"rmse": ate},
        "rpe": rpe,
        "note": check_text("--note", args.note, allow_empty=True),
    }


def out_path(args: argparse.Namespace) -> Path:
    if args.out:
        p = Path(args.out).resolve()
        if p.suffix.lower() != ".json":
            raise ValueError("--out 은 .json 파일이어야 한다")
        if not p.parent.is_dir():
            raise ValueError(f"--out 폴더가 없다: {p.parent}")
        return p
    return OUT_DIR / f"{slug(args.sequence)}-{args.impl}.json"


def write_json(path: Path, data: dict, force: bool) -> None:
    text = json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        # "x": 이미 있으면 실패 (검사와 생성을 한 번에)
        with open(path, "w" if force else "x", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
    except FileExistsError:
        raise ValueError(f"{path} 가 이미 있다 (덮어쓰려면 --force)") from None


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="12a 결과 쇼케이스 JSON 만들기")
    p.add_argument("--sequence", help="예: fr1/xyz")
    p.add_argument("--impl", choices=IMPLS)
    p.add_argument("--ape", help="evo_ape --save_results zip")
    p.add_argument("--ate-rmse", type=float, help="ATE RMSE (m) 직접 입력")
    p.add_argument("--rpe", help="evo_rpe (이동) --save_results zip")
    p.add_argument("--rpe-trans", type=float, help="RPE 이동 RMSE (m) 직접 입력")
    p.add_argument("--rpe-rot", help="evo_rpe -r angle_deg --save_results zip")
    p.add_argument("--rpe-rot-deg", type=float, help="RPE 회전 RMSE (도) 직접 입력")
    p.add_argument("--tracked", type=int)
    p.add_argument("--total", type=int)
    p.add_argument("--note", default="")
    p.add_argument("--out", help="기본: site/src/data/cpp-results/<시퀀스>-<구현>.json")
    p.add_argument("--force", action="store_true", help="같은 이름 파일을 덮어쓴다")
    p.add_argument("--selftest", action="store_true")
    return p


def selftest() -> None:
    ok = 0

    def check(cond: bool, what: str) -> None:
        nonlocal ok
        if not cond:
            raise SystemExit(f"selftest 실패: {what}")
        ok += 1

    def rejects(fn, what: str) -> None:
        try:
            fn()
        except ValueError:
            check(True, what)
            return
        check(False, what)

    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)

        def make_zip(name: str, entries: dict) -> Path:
            p = t / name
            with zipfile.ZipFile(p, "w") as z:
                for k, v in entries.items():
                    z.writestr(k, v)
            return p

        ape = make_zip("ape.zip", {"stats.json": json.dumps({"rmse": 0.046, "mean": 0.04}), "info.json": "{}"})
        check(abs(read_evo_rmse(ape) - 0.046) < 1e-12, "stats.json rmse 읽기")
        rejects(lambda: read_evo_rmse(make_zip("none.zip", {"info.json": "{}"})), "stats.json 없음 거부")
        rejects(lambda: read_evo_rmse(make_zip("neg.zip", {"stats.json": '{"rmse": -1}'})), "음수 rmse 거부")
        rejects(lambda: read_evo_rmse(make_zip("bool.zip", {"stats.json": '{"rmse": true}'})), "bool rmse 거부")
        two = {"stats.json": '{"rmse": 1}', "sub/stats.json": '{"rmse": 2}'}
        rejects(lambda: read_evo_rmse(make_zip("two.zip", two)), "stats.json 여러 개 거부")
        big = {"stats.json": '{"rmse": 1, "pad": "' + "x" * (MAX_ZIP_ENTRY + 10) + '"}'}
        rejects(lambda: read_evo_rmse(make_zip("big.zip", big)), "큰 stats.json 거부")

        def args(**kw: object) -> argparse.Namespace:
            base = parser().parse_args(["--sequence", "fr1/xyz", "--impl", "cpp"])
            for k, v in kw.items():
                setattr(base, k, v)
            return base

        d = build(args(ape=str(ape), tracked=299, total=300), "abc1234", "2026-11-03")
        check(d["ate"]["rmse"] == 0.046 and d["frames"]["total"] == 300 and d["rpe"] is None, "zip 으로 만들기")
        d2 = build(args(ate_rmse=0.05, rpe_trans=0.01), None, "2026-11-03")
        check(d2["rpe"] == {"trans_rmse": 0.01, "rot_rmse_deg": None} and d2["git_sha"] is None, "직접 입력")
        for kw, what in (
            ({}, "ATE 없음"),
            ({"ape": str(ape), "ate_rmse": 0.1}, "ATE 둘 다"),
            ({"ate_rmse": float("nan")}, "NaN"),
            ({"ate_rmse": 0.1, "tracked": 5}, "tracked 만"),
            ({"ate_rmse": 0.1, "tracked": 5, "total": 4}, "tracked > total"),
            ({"ate_rmse": 0.1, "note": "a" * 201}, "긴 note"),
            ({"ate_rmse": 0.1, "sequence": " "}, "빈 sequence"),
        ):
            rejects(lambda kw=kw: build(args(**kw), None, "2026-11-03"), what)
        check(slug("fr3/long_office_household") == "fr3-long-office-household", "slug")
        out = t / "r.json"
        write_json(out, d, force=False)
        check(json.loads(out.read_text(encoding="utf-8"))["format"] == FORMAT, "쓰기")
        rejects(lambda: write_json(out, d, force=False), "덮어쓰기 거부")
        write_json(out, d2, force=True)
        check(json.loads(out.read_text(encoding="utf-8"))["ate"]["rmse"] == 0.05, "--force 덮어쓰기")
        rejects(lambda: out_path(args(out=str(t / "x.txt"))), "--out 확장자")
        rejects(lambda: out_path(args(out=str(t / "no" / "x.json"))), "--out 폴더 없음")
    print(f"selftest 통과 ({ok}개)")


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = parser().parse_args(argv)
    if args.selftest:
        selftest()
        return 0
    if not args.sequence or not args.impl:
        parser().error("--sequence 와 --impl 이 필요하다")
    try:
        data = build(args, git_sha(), _dt.date.today().isoformat())
        path = out_path(args)
        write_json(path, data, args.force)
    except (ValueError, OSError, zipfile.BadZipFile, json.JSONDecodeError) as e:
        print(f"오류: {e}", file=sys.stderr)
        return 1
    try:
        shown = path.relative_to(ROOT)
    except ValueError:
        shown = path
    print(f"저장: {shown}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
