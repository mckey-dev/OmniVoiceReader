# ================================================================================
# runtime.py
#
# GPU / モデル / 声プロンプトの実行時状態。
# ================================================================================

import threading
import time
import traceback

from server.gpu_runtime import (
    configure_backend_env,
    print_torch_device,
    print_vram_usage,
    resolve_torch_device,
)

# ROCm の最適化。torch を import する前に設定すること。CUDA では無視される。
configure_backend_env()

from server.miopen_log import flush_miopen_warnings, install_miopen_log_filter

install_miopen_log_filter()

import torch

from omnivoice import OmniVoice

from server.model_store import ensure_omnivoice_model
from server.sampling.prepare_voice import load_voice_prompt
from server.sampling.voice_store import find_voice, migrate_legacy_voices


device = None
model = None
voice_lock = threading.Lock()
voice_clone_prompt = None
active_voice_id = None
_loaded = False


# ================================================================================
# apply_voice_prompt
# メモリ上のクローン用プロンプトを、指定の声へ載せ替える。
# ================================================================================
def apply_voice_prompt(voice):
    global voice_clone_prompt
    global active_voice_id

    with voice_lock:
        if voice is None:
            voice_clone_prompt = None
            active_voice_id = None
            return None

        prompt = load_voice_prompt(voice)
        voice_clone_prompt = prompt
        active_voice_id = voice.get("id") if prompt is not None else None
        return prompt


# ================================================================================
# load_startup_voice
# 保存済みの active 声があればプロンプトを読む。無ければ待受のみ。
# ================================================================================
def load_startup_voice():
    catalog = migrate_legacy_voices()
    voice = find_voice(catalog, catalog.get("active_id"))

    if voice is None:
        print()
        print("声がまだありません。拡張から参照音声を追加してください。")
        apply_voice_prompt(None)
        return

    print()
    print(f"Loading voice clone prompt: {voice.get('name') or voice.get('stem')}")

    prompt_start = time.perf_counter()
    prompt = apply_voice_prompt(voice)

    if prompt is None:
        print("プロンプトがありません。拡張から声を選び直すか、追加してください。")
        return

    print(f"Voice clone prompt loaded in {time.perf_counter() - prompt_start:.4f} sec")


# ================================================================================
# print_vram
# 現在の VRAM 使用量を出す。
# ================================================================================
def print_vram():
    print_vram_usage(torch)


# ================================================================================
# load_runtime
# デバイス判定、OmniVoice の読み込み、起動時の声ロードを行う。
# ================================================================================
def load_runtime():
    global device
    global model
    global _loaded

    if _loaded:
        return

    device = resolve_torch_device(torch)

    print("=" * 60)
    print(f"OmniVoice Reader Server - {device['label']}")
    print("=" * 60)

    print()
    print_torch_device(torch, device)

    print()
    print("Loading OmniVoice...")

    model_dir = ensure_omnivoice_model()
    print(f"Model path: {model_dir}")

    load_start = time.perf_counter()

    try:
        model = OmniVoice.from_pretrained(
            model_dir,
            device_map=device["device_map"],
            dtype=device["dtype"],
        )
    except Exception as error:
        print(f"Failed to load OmniVoice: {error}")
        traceback.print_exc()

        try:
            with open("server_error.log", "w", encoding="utf-8") as handle:
                handle.write(f"Failed to load OmniVoice: {error}\n\n")
                traceback.print_exc(file=handle)
        except OSError:
            pass

        raise

    flush_miopen_warnings()
    print(f"Model loaded in {time.perf_counter() - load_start:.2f} sec")
    print_vram()

    load_startup_voice()
    _loaded = True


# ================================================================================
