# ================================================================================
# sample_audio.py
#
# 参照音声 sample.wav を用意する。sample.mp3 / sample.ogg などがあれば WAV に変換する。
# ================================================================================

import os

import numpy as np
import soundfile as sf


SAMPLE_WAV = "sample.wav"

SAMPLE_SOURCES = (
    "sample.wav",
    "sample.mp3",
    "sample.ogg",
    "sample.oga",
    "sample.flac",
)


# ================================================================================
# sample_source_hint
# 置ける参照音声ファイル名を、案内文用に並べる。
# ================================================================================
def sample_source_hint():
    return " / ".join(SAMPLE_SOURCES)


# ================================================================================
# find_sample_source
# 使える参照音声のパスを返す。無ければ None。
# ================================================================================
def find_sample_source():
    for name in SAMPLE_SOURCES:
        if os.path.isfile(name):
            return name

    return None


# ================================================================================
# _load_soundfile
# WAV / FLAC / OGG を soundfile で読む。
# ================================================================================
def _load_soundfile(path):
    waveform, sample_rate = sf.read(path, dtype="float32", always_2d=True)

    if waveform.shape[1] > 1:
        waveform = np.mean(waveform, axis=1)
    else:
        waveform = waveform[:, 0]

    return waveform, int(sample_rate)


# ================================================================================
# _load_miniaudio
# MP3 などを miniaudio で読む。ffmpeg は使わない。
# ================================================================================
def _load_miniaudio(path):
    import miniaudio

    decoded = miniaudio.decode_file(
        path,
        dither=miniaudio.DitherMode.NONE,
        output_format=miniaudio.SampleFormat.FLOAT32,
    )
    samples = np.frombuffer(decoded.samples, dtype=np.float32)
    channels = int(decoded.nchannels) or 1

    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)

    return samples, int(decoded.sample_rate)


# ================================================================================
# load_mono
# 参照音声をモノラル float32 で読む。
# ================================================================================
def load_mono(path):
    errors = []

    try:
        return _load_soundfile(path)
    except Exception as error:
        errors.append(f"soundfile: {error}")

    try:
        return _load_miniaudio(path)
    except Exception as error:
        errors.append(f"miniaudio: {error}")

    detail = " / ".join(errors) if errors else "unknown error"
    raise RuntimeError(
        f"音声ファイルを読めませんでした: {path} ({detail})"
    )


# ================================================================================
# ensure_sample_wav
# sample.wav が無ければ、sample.mp3 / sample.ogg などから変換して作る。
# ================================================================================
def ensure_sample_wav():
    if os.path.isfile(SAMPLE_WAV):
        return SAMPLE_WAV

    source = find_sample_source()

    if not source:
        print()
        print("参照音声が見つかりません。")
        print(f"{sample_source_hint()} のいずれかを置いてから、もう一度起動してください。")
        raise SystemExit(1)

    print(f"{source} を {SAMPLE_WAV} に変換しています...")
    waveform, sample_rate = load_mono(source)
    sf.write(SAMPLE_WAV, waveform, sample_rate)
    print(f"Saved: {SAMPLE_WAV}")

    return SAMPLE_WAV


if __name__ == "__main__":
    ensure_sample_wav()

# ================================================================================
