#!/usr/bin/env python3
"""Convert the manual auto-detect models to ONNX and drop them in the app's
models folder so they become selectable in Settings -> Processing.

Two models have no public ONNX and must be converted locally:
  - OmniParser v2 (icon detect)  -> omniparser-icon-detect-v2.onnx  (YOLOv8)
  - UI-DETR (RF-DETR-Medium)      -> ui-detr.onnx                    (RF-DETR)

The heavy deps (PyTorch, ultralytics, rfdetr) are installed into throwaway
virtualenvs managed by `uv`, which also provisions a compatible Python (the
system Homebrew Python 3.14 has no PyTorch wheels yet). Each model gets its own
venv so ultralytics' and rfdetr's torch pins never collide.

Usage:
    python3 scripts/convert_models.py                 # both models
    python3 scripts/convert_models.py --only ui-detr  # just one
    python3 scripts/convert_models.py --models-dir /custom/path

Nothing is installed system-wide; delete scripts/.venv-* to reclaim the space.
"""
from __future__ import annotations

import argparse
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

APP_IDENTIFIER = "com.focusiswhatyouneed"
SCRIPT_DIR = Path(__file__).resolve().parent

# Each model's throwaway venv + the pip deps it needs. Kept apart on purpose:
# ultralytics and rfdetr pin different torch versions and would fight in one env.
TOOLS = {
    "omniparser-v2": {
        "venv": SCRIPT_DIR / ".venv-omniparser",
        "deps": ["huggingface_hub", "ultralytics", "onnx"],
        "out_name": "omniparser-icon-detect-v2.onnx",
    },
    "ui-detr": {
        "venv": SCRIPT_DIR / ".venv-uidetr",
        "deps": ["huggingface_hub", "rfdetr[onnx]", "onnx"],
        "out_name": "ui-detr.onnx",
    },
}

# --- Worker snippets: run *inside* each tool's venv via `python -c`. -----------

OMNIPARSER_WORKER = r'''
import sys, shutil
from pathlib import Path
from huggingface_hub import hf_hub_download
from ultralytics import YOLO

models_dir = Path(sys.argv[1])

pt = None
last = None
for cand in ("icon_detect/model.pt", "icon_detect/best.pt", "icon_detect.pt"):
    try:
        pt = hf_hub_download("microsoft/OmniParser-v2.0", cand)
        break
    except Exception as e:  # noqa: BLE001 - report the last failure below
        last = e
if pt is None:
    raise SystemExit(f"[omniparser-v2] could not find icon_detect weights: {last!r}")
print("[omniparser-v2] downloaded:", pt, flush=True)

# YOLOv8 export at the 640 square the Rust side expects; opset 17 like the app.
out = YOLO(pt).export(format="onnx", imgsz=640, opset=17)
dst = models_dir / "omniparser-icon-detect-v2.onnx"
shutil.copyfile(out, dst)
print("[omniparser-v2] wrote:", dst, flush=True)
'''

UIDETR_WORKER = r'''
import sys, shutil
from pathlib import Path
from huggingface_hub import hf_hub_download
from rfdetr import RFDETRMedium

models_dir = Path(sys.argv[1])
work = Path(sys.argv[2])
work.mkdir(parents=True, exist_ok=True)

pth = hf_hub_download("racineai/UI-DETR-1", "model.pth")
print("[ui-detr] downloaded:", pth, flush=True)

# Resolution 1600 is baked into the exported graph; the Rust side hard-codes the
# same value (UIDETR_SIZE). opset 17 -> raw dets/labels outputs (no NMS baked in).
RFDETRMedium(pretrain_weights=pth, resolution=1600).export(
    output_dir=str(work), opset_version=17
)

onnxs = sorted(work.rglob("*.onnx"), key=lambda p: p.stat().st_size, reverse=True)
if not onnxs:
    raise SystemExit(f"[ui-detr] export produced no .onnx under {work}")
dst = models_dir / "ui-detr.onnx"
shutil.copyfile(onnxs[0], dst)
print(f"[ui-detr] wrote: {dst} (from {onnxs[0].name})", flush=True)
'''

WORKERS = {"omniparser-v2": OMNIPARSER_WORKER, "ui-detr": UIDETR_WORKER}


def default_models_dir() -> Path:
    """The app's `$APP_DATA/models` folder (Tauri v2 app_data_dir per OS)."""
    home = Path.home()
    system = platform.system()
    if system == "Darwin":
        base = home / "Library" / "Application Support" / APP_IDENTIFIER
    elif system == "Windows":
        base = Path(os.environ.get("APPDATA", home / "AppData" / "Roaming")) / APP_IDENTIFIER
    else:  # Linux and friends
        xdg = os.environ.get("XDG_DATA_HOME")
        base = (Path(xdg) if xdg else home / ".local" / "share") / APP_IDENTIFIER
    return base / "models"


def venv_python(venv: Path) -> Path:
    return venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def ensure_uv() -> str:
    uv = shutil.which("uv")
    if uv:
        return uv
    print("uv not found; attempting to install it...", flush=True)
    if shutil.which("brew"):
        subprocess.run(["brew", "install", "uv"], check=False)
        uv = shutil.which("uv")
        if uv:
            return uv
    sys.exit(
        "Please install uv first, then re-run:\n"
        "  brew install uv\n"
        "  (or: curl -LsSf https://astral.sh/uv/install.sh | sh)\n"
        "See https://docs.astral.sh/uv/"
    )


def convert(tool: str, uv: str, python_version: str, models_dir: Path) -> None:
    spec = TOOLS[tool]
    venv: Path = spec["venv"]
    print(f"\n=== {tool} ===", flush=True)

    if not venv_python(venv).exists():
        print(f"[{tool}] creating venv ({venv.name}, Python {python_version})...", flush=True)
        subprocess.run([uv, "venv", "--python", python_version, str(venv)], check=True)

    print(f"[{tool}] installing deps: {', '.join(spec['deps'])}", flush=True)
    subprocess.run(
        [uv, "pip", "install", "--python", str(venv_python(venv)), *spec["deps"]],
        check=True,
    )

    argv = [str(models_dir)]
    if tool == "ui-detr":
        argv.append(str(SCRIPT_DIR / "_uidetr_export"))
    subprocess.run([str(venv_python(venv)), "-c", WORKERS[tool], *argv], check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--only",
        choices=list(TOOLS),
        help="Convert just one model (default: both).",
    )
    parser.add_argument(
        "--models-dir",
        type=Path,
        default=default_models_dir(),
        help="Target app models folder (default: the app's per-OS data dir).",
    )
    parser.add_argument(
        "--python",
        default="3.12",
        help="Python version uv provisions for the venvs (default: 3.12).",
    )
    args = parser.parse_args()

    models_dir: Path = args.models_dir
    models_dir.mkdir(parents=True, exist_ok=True)
    print(f"Target models folder: {models_dir}", flush=True)

    uv = ensure_uv()
    tools = [args.only] if args.only else list(TOOLS)
    for tool in tools:
        convert(tool, uv, args.python, models_dir)

    print("\nDone. Open Settings -> Processing -> Auto-detect Components and click", flush=True)
    print("the folder-in icon on the converted model(s) to enable them.", flush=True)


if __name__ == "__main__":
    main()
