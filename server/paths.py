# ================================================================================
# paths.py
#
# リポジトリ直下を基準にしたパス。
# ================================================================================

import os


PACKAGE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(PACKAGE_DIR)

# 声クローン用の参照音声・書き起こし・プロンプト。コードではなく実行時データ。
VOICE_DIR = os.path.join(PROJECT_ROOT, "voice")
VOICES_FILE = os.path.join(VOICE_DIR, "voices.json")

# 移行前にルートへ置いていたファイル
LEGACY_SAMPLE_WAV = os.path.join(VOICE_DIR, "sample.wav")
LEGACY_SAMPLE_TXT = os.path.join(VOICE_DIR, "sample.txt")
LEGACY_PROMPT = os.path.join(VOICE_DIR, "voice_clone_prompt.pt")

AUDIO_EXTENSIONS = (
    ".wav",
    ".mp3",
    ".ogg",
    ".oga",
    ".flac",
)

# ================================================================================
