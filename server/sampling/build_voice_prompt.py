# ================================================================================
# build_voice_prompt.py
#
# 参照音声から声クローン用プロンプトを作成し、保存・再読み込みする。
# 起動スクリプトが voice_clone_prompt.pt の無いときに使う。
# ================================================================================

import os

from server.gpu_runtime import configure_backend_env, print_torch_device, resolve_torch_device

configure_backend_env()

from server.miopen_log import flush_miopen_warnings, install_miopen_log_filter

install_miopen_log_filter()

import time
import torch
import soundfile as sf

from omnivoice import OmniVoice, VoiceClonePrompt

from server.sampling.sample_audio import SAMPLE_WAV, ensure_sample_wav
from server.sampling.sample_text import ensure_sample_text
from server.model_store import ensure_omnivoice_model
from server.paths import OUTPUT_SAVED_PROMPT, SAMPLE_TXT, VOICE_CLONE_PROMPT


REF_AUDIO = SAMPLE_WAV
REF_TEXT_FILE = SAMPLE_TXT

PROMPT_FILE = VOICE_CLONE_PROMPT
OUTPUT_FILE = OUTPUT_SAVED_PROMPT

TEST_TEXT = "こんにちは。今日はとてもいい天気ですね。"


def main():
    device = resolve_torch_device(torch)

    print("=" * 60)
    print(f"OmniVoice {device['label']} - Saved Voice Clone Prompt Test")
    print("=" * 60)

    print()
    print_torch_device(torch, device)


    # モデルを読み込む

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


    print()
    print("Preparing reference audio...")
    ensure_sample_wav()

    # 参照テキストを用意する。無ければ参照音声から書き起こす。

    print()
    print("Preparing reference text...")

    reference_text = ensure_sample_text(
        model,
        REF_AUDIO,
        REF_TEXT_FILE,
    )

    print("Reference text:")
    print(reference_text)


    # 声クローン用プロンプトを作成または読み込む

    if os.path.exists(PROMPT_FILE):

        print()
        print(f"Found saved voice clone prompt: {PROMPT_FILE}")
        print("Loading saved prompt...")

        start = time.perf_counter()
        voice_clone_prompt = VoiceClonePrompt.load(
            PROMPT_FILE,
            map_location="cpu",
        )
        elapsed = time.perf_counter() - start
        print(f"Prompt loaded in {elapsed:.4f} sec")

    else:

        print()
        print("Saved prompt not found.")
        print("Creating voice clone prompt from reference audio...")

        start = time.perf_counter()

        voice_clone_prompt = model.create_voice_clone_prompt(
            ref_audio=REF_AUDIO,
            ref_text=reference_text,
        )

        elapsed = time.perf_counter() - start

        print(f"Prompt created in {elapsed:.2f} sec")

        print()
        print(f"Saving prompt to: {PROMPT_FILE}")

        voice_clone_prompt.save(PROMPT_FILE)

        print("Prompt saved.")


    # 音声を生成する

    print()
    print("Test text:")
    print(TEST_TEXT)

    print()
    print(f"Generating speech on {device['label']}...")

    start = time.perf_counter()

    audio = model.generate(
        text=TEST_TEXT,
        language="Japanese",
        voice_clone_prompt=voice_clone_prompt,
    )

    generation_time = time.perf_counter() - start

    print()
    flush_miopen_warnings()
    print(f"Generation finished in {generation_time:.2f} sec")


    # WAV を保存する

    print()
    print("Saving WAV...")

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    sf.write(
        OUTPUT_FILE,
        audio[0],
        24000,
    )

    print(f"Saved: {OUTPUT_FILE}")


    # 結果

    print()
    print("=" * 60)
    print("SUCCESS")
    print("=" * 60)

    print()
    print(f"Generation time: {generation_time:.2f} sec")
    print(f"Prompt file: {PROMPT_FILE}")


if __name__ == "__main__":
    main()

# ================================================================================
