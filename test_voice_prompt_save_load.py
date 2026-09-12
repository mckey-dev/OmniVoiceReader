# ================================================================================
# test_voice_prompt_save_load.py
#
# 声クローン用プロンプトの作成、保存、再読み込みを確認する。
# ================================================================================

import os

# AMD Radeon 780M / ROCm の最適化
os.environ["TORCH_ROCM_AOTRITON_ENABLE_EXPERIMENTAL"] = "1"

from miopen_log import flush_miopen_warnings, install_miopen_log_filter

install_miopen_log_filter()

import time
import torch
import soundfile as sf

from omnivoice import OmniVoice, VoiceClonePrompt

from model_store import ensure_omnivoice_model
from sample_text import ensure_sample_text


REF_AUDIO = "sample.wav"
REF_TEXT_FILE = "sample.txt"

PROMPT_FILE = "voice_clone_prompt.pt"
OUTPUT_FILE = "output_amd_saved_prompt.wav"

TEST_TEXT = "こんにちは。今日はとてもいい天気ですね。"


print("=" * 60)
print("OmniVoice AMD GPU - Saved Voice Clone Prompt Test")
print("=" * 60)

print()
print("PyTorch:", torch.__version__)
print("CUDA available:", torch.cuda.is_available())
print("GPU:", torch.cuda.get_device_name(0))


# モデルを読み込む

print()
print("Loading OmniVoice...")

model_dir = ensure_omnivoice_model()
print(f"Model path: {model_dir}")

start = time.perf_counter()

model = OmniVoice.from_pretrained(
    model_dir,
    device_map="cuda:0",
    dtype=torch.float16,
)

elapsed = time.perf_counter() - start

flush_miopen_warnings()
print(f"Model loaded in {elapsed:.2f} sec")


# 参照テキストを用意する。無ければ sample.wav から書き起こす。

print()
print("Preparing reference text...")

if not os.path.isfile(REF_AUDIO):
    raise FileNotFoundError(
        f"Reference audio not found: {REF_AUDIO}"
    )

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
print("Generating speech on AMD GPU...")

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

# ================================================================================
