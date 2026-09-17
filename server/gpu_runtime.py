# ================================================================================
# gpu_runtime.py
#
# PyTorch が使えるデバイスを判定する。ROCm / CUDA / CPU に対応する。
# ================================================================================

import os
import shutil
import subprocess


NVIDIA_DRIVER_MIN_MAJOR = 580
NVIDIA_DRIVER_URL = "https://www.nvidia.com/ja-jp/geforce/drivers/"


# ================================================================================
# configure_backend_env
# ROCm 向けの環境変数を、torch の import 前に設定する。CUDA では無視される。
# ================================================================================
def configure_backend_env():
    os.environ.setdefault("TORCH_ROCM_AOTRITON_ENABLE_EXPERIMENTAL", "1")


# ================================================================================
# nvidia_smi_info
# nvidia-smi からドライバ版と CUDA 版を読む。無ければ空の情報を返す。
# ================================================================================
def nvidia_smi_info():
    info = {
        "available": False,
        "name": None,
        "driver_version": None,
        "cuda_version": None,
        "driver_major": None,
    }

    nvidia_smi = shutil.which("nvidia-smi")
    if not nvidia_smi:
        return info

    try:
        gpu = subprocess.run(
            [
                nvidia_smi,
                "--query-gpu=name,driver_version",
                "--format=csv,noheader",
            ],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        line = gpu.stdout.strip().splitlines()[0]
        name, driver_version = [part.strip() for part in line.split(",", 1)]
        info["available"] = True
        info["name"] = name
        info["driver_version"] = driver_version
        major_text = driver_version.split(".", 1)[0]
        if major_text.isdigit():
            info["driver_major"] = int(major_text)
    except (OSError, subprocess.CalledProcessError, IndexError, ValueError):
        return info

    try:
        smi = subprocess.run(
            [nvidia_smi],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        for raw_line in smi.stdout.splitlines():
            marker = None
            if "CUDA UMD Version:" in raw_line:
                marker = "CUDA UMD Version:"
            elif "CUDA Version:" in raw_line:
                marker = "CUDA Version:"
            if not marker:
                continue
            info["cuda_version"] = raw_line.split(marker, 1)[1].split()[0]
            break
    except (OSError, subprocess.CalledProcessError, IndexError):
        pass

    return info


# ================================================================================
# is_gpu_torch_build
# GPU 向けにビルドされた PyTorch かどうかを返す。
# ================================================================================
def is_gpu_torch_build(torch_module):
    return bool(
        getattr(torch_module.version, "cuda", None)
        or getattr(torch_module.version, "hip", None)
    )


# ================================================================================
# driver_too_old_message
# NVIDIA ドライバが不足しているときの案内文を返す。
# ================================================================================
def driver_too_old_message(info=None):
    info = info or nvidia_smi_info()
    driver = info.get("driver_version") or "不明"
    cuda_version = info.get("cuda_version") or "不明"
    name = info.get("name") or "NVIDIA GPU"

    return (
        f"{name} は検出されていますが、NVIDIA ドライバ {driver} "
        f"（CUDA {cuda_version}）では現行の PyTorch CUDA を使えません。\n"
        f"ドライバ {NVIDIA_DRIVER_MIN_MAJOR} 以降（Game Ready 616.92 など）に更新してから、"
        f"start_cuda.bat を実行してください。\n"
        f"{NVIDIA_DRIVER_URL}"
    )


# ================================================================================
# require_nvidia_driver
# CUDA 起動に必要なドライバが入っているかを確認する。不足なら終了する。
# ================================================================================
def require_nvidia_driver():
    info = nvidia_smi_info()

    if not info["available"]:
        print("nvidia-smi が見つかりません。NVIDIA ドライバを入れてください。")
        print(NVIDIA_DRIVER_URL)
        raise SystemExit(1)

    print(f"NVIDIA GPU: {info['name']}")
    print(f"NVIDIA ドライバ: {info['driver_version']}")
    if info.get("cuda_version"):
        print(f"ドライバの CUDA: {info['cuda_version']}")

    if info["driver_major"] is None or info["driver_major"] < NVIDIA_DRIVER_MIN_MAJOR:
        print()
        print(driver_too_old_message(info))
        raise SystemExit(1)


# ================================================================================
# resolve_torch_device
# 使えるデバイス、dtype、表示名を返す。GPU 向け torch なのに GPU が使えないときは終了する。
# ================================================================================
def resolve_torch_device(torch_module):
    if torch_module.cuda.is_available():
        name = torch_module.cuda.get_device_name(0)
        backend = "ROCm" if getattr(torch_module.version, "hip", None) else "CUDA"
        return {
            "device_map": "cuda:0",
            "dtype": torch_module.float16,
            "name": name,
            "backend": backend,
            "label": f"{backend} ({name})",
        }

    if is_gpu_torch_build(torch_module):
        print()
        print(driver_too_old_message())
        raise SystemExit(1)

    return {
        "device_map": "cpu",
        "dtype": torch_module.float32,
        "name": "CPU",
        "backend": "CPU",
        "label": "CPU",
    }


# ================================================================================
# vram_usage_text
# GPU の使用量と最大量を返す。CUDA / ROCm 以外は None。
# ================================================================================
def vram_usage_text(torch_module, device_index=0):
    cuda = getattr(torch_module, "cuda", None)

    if cuda is None or not cuda.is_available():
        return None

    try:
        free_bytes, total_bytes = cuda.mem_get_info(device_index)
    except (RuntimeError, TypeError, ValueError):
        return None

    used_gb = (total_bytes - free_bytes) / (1024 ** 3)
    total_gb = total_bytes / (1024 ** 3)
    return f"VRAM: {used_gb:.2f} / {total_gb:.2f} GB"


# ================================================================================
# print_vram_usage
# ターミナルに VRAM 使用量 / 最大量を出す。
# ================================================================================
def print_vram_usage(torch_module):
    text = vram_usage_text(torch_module)

    if text:
        print(text)


# ================================================================================
# print_torch_device
# 起動ログに PyTorch とデバイス情報を出す。
# ================================================================================
def print_torch_device(torch_module, device):
    print("PyTorch:", torch_module.__version__)
    print("CUDA available:", torch_module.cuda.is_available())
    print("Device:", device["label"])
    print_vram_usage(torch_module)


if __name__ == "__main__":
    require_nvidia_driver()

# ================================================================================
