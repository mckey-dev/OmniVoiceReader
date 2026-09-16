# ================================================================================
# sample_audio.py
#
# 参照音声をモノラル WAV にする。
# ================================================================================

import os

import numpy as np
import soundfile as sf


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
# convert_to_wav
# source_path を wav_path へ変換する。同じ WAV ならそのまま返す。
# ================================================================================
def convert_to_wav(source_path, wav_path):
    if not os.path.isfile(source_path):
        raise FileNotFoundError(source_path)

    os.makedirs(os.path.dirname(wav_path) or ".", exist_ok=True)

    if os.path.normcase(os.path.abspath(source_path)) == os.path.normcase(
        os.path.abspath(wav_path)
    ):
        return wav_path

    print(f"{source_path} を {wav_path} に変換しています...")
    waveform, sample_rate = load_mono(source_path)
    sf.write(wav_path, waveform, sample_rate)
    print(f"Saved: {wav_path}")

    return wav_path

# ================================================================================
