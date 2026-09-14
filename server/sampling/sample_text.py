# ================================================================================
# sample_text.py
#
# 参照音声から、書き起こし sample.txt を用意する。
# ================================================================================

import os

from server.model_store import ensure_whisper_model
from server.sampling.sample_audio import load_mono


# ================================================================================
# _read_existing_text
# 既存の書き起こしファイルを読む。空なら空文字を返す。
# ================================================================================
def _read_existing_text(txt_path):
    if not os.path.isfile(txt_path):
        return ""

    with open(txt_path, "r", encoding="utf-8") as f:
        return f.read().strip()


# ================================================================================
# ensure_sample_text
# sample.txt があればそれを返す。無ければ参照音声を書き起こして保存する。
# ================================================================================
def ensure_sample_text(model, wav_path, txt_path):
    text = _read_existing_text(txt_path)

    if text:
        print(f"Using existing transcript: {txt_path}")
        return text

    if not os.path.isfile(wav_path):
        raise FileNotFoundError(
            f"Reference audio not found: {wav_path}"
        )

    print(f"Transcribing {wav_path} ...")

    asr_dir = ensure_whisper_model()
    print(f"ASR model path: {asr_dir}")

    model.load_asr_model(model_name=asr_dir)
    waveform, sample_rate = load_mono(wav_path)
    text = model.transcribe((waveform, sample_rate)).strip()

    if not text:
        raise ValueError(
            f"Transcription of {wav_path} was empty."
        )

    with open(txt_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text + "\n")

    print(f"Saved transcript: {txt_path}")

    return text

# ================================================================================
