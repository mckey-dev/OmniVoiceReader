# ================================================================================
# build_voice_prompt.py
#
# 選択中の声のクローン用プロンプトを、手動で作り直す。
# ================================================================================

from server.gpu_runtime import (
    configure_backend_env,
    print_torch_device,
    print_vram_usage,
    resolve_torch_device,
)

configure_backend_env()

from server.miopen_log import flush_miopen_warnings, install_miopen_log_filter

install_miopen_log_filter()

import time
import torch

from omnivoice import OmniVoice

from server.model_store import ensure_omnivoice_model
from server.sampling.prepare_voice import prepare_voice_prompt
from server.sampling.voice_store import (
    find_voice,
    migrate_legacy_voices,
    read_catalog,
    write_catalog,
)


def main():
    device = resolve_torch_device(torch)

    print("=" * 60)
    print(f"OmniVoice {device['label']} - Voice clone prompt")
    print("=" * 60)

    print()
    print_torch_device(torch, device)

    catalog = migrate_legacy_voices()
    voice = find_voice(catalog, catalog.get("active_id"))

    if not voice:
        voices = catalog.get("voices") or []
        voice = voices[0] if voices else None

    if not voice:
        print()
        print("声がありません。サーバーを起動して、拡張から参照音声を追加してください。")
        raise SystemExit(1)

    print()
    print("Loading OmniVoice...")

    model_dir = ensure_omnivoice_model()
    print(f"Model path: {model_dir}")

    start = time.perf_counter()

    model = OmniVoice.from_pretrained(
        model_dir,
        device_map=device["device_map"],
        dtype=device["dtype"],
    )

    elapsed = time.perf_counter() - start

    flush_miopen_warnings()
    print(f"Model loaded in {elapsed:.2f} sec")
    print_vram_usage(torch)

    print()
    print(f"Voice: {voice.get('name') or voice.get('stem')}")

    start = time.perf_counter()
    prepare_voice_prompt(model, voice, rebuild=True)
    elapsed = time.perf_counter() - start

    voice["has_prompt"] = True
    catalog = read_catalog()
    stored = find_voice(catalog, voice["id"])

    if stored is not None:
        stored["has_prompt"] = True

    catalog["active_id"] = voice["id"]
    write_catalog(catalog)

    flush_miopen_warnings()
    print(f"Prompt prepared in {elapsed:.2f} sec")
    print_vram_usage(torch)


if __name__ == "__main__":
    main()

# ================================================================================
