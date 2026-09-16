# ================================================================================
# prepare_voice.py
#
# 1 件の声について、WAV 変換・書き起こし・クローン用プロンプトを用意する。
# ================================================================================

import os

from omnivoice import VoiceClonePrompt

from server.sampling.sample_audio import convert_to_wav
from server.sampling.sample_text import ensure_sample_text
from server.sampling.voice_store import voice_paths


# ================================================================================
# load_voice_prompt
# 保存済みの .pt を読む。無ければ None。
# ================================================================================
def load_voice_prompt(voice):
    paths = voice_paths(voice)
    pt_path = paths["pt"]

    if not os.path.isfile(pt_path):
        return None

    return VoiceClonePrompt.load(pt_path, map_location="cpu")


# ================================================================================
# prepare_voice_prompt
# wav / txt / pt を残して、クローン用プロンプトを返す。
# 既存の .pt があれば作り直さない。rebuild=True なら作り直す。
# ================================================================================
def prepare_voice_prompt(model, voice, rebuild=False):
    paths = voice_paths(voice)
    source_path = paths["source"]
    wav_path = paths["wav"]

    if not os.path.isfile(source_path) and os.path.isfile(wav_path):
        source_path = wav_path

    if not os.path.isfile(source_path):
        raise FileNotFoundError("参照音声がありません。")

    convert_to_wav(source_path, wav_path)

    if not rebuild:
        existing = load_voice_prompt(voice)

        if existing is not None:
            return existing

    if os.path.isfile(paths["pt"]):
        os.remove(paths["pt"])

    print("Preparing reference text...")
    reference_text = ensure_sample_text(model, wav_path, paths["txt"])
    print("Reference text:")
    print(reference_text)

    print("Creating voice clone prompt from reference audio...")
    prompt = model.create_voice_clone_prompt(
        ref_audio=wav_path,
        ref_text=reference_text,
    )
    prompt.save(paths["pt"])
    print(f"Prompt saved: {paths['pt']}")

    return prompt

# ================================================================================
