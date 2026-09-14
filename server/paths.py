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

SAMPLE_WAV = os.path.join(VOICE_DIR, "sample.wav")
SAMPLE_TXT = os.path.join(VOICE_DIR, "sample.txt")
VOICE_CLONE_PROMPT = os.path.join(VOICE_DIR, "voice_clone_prompt.pt")
OUTPUT_SAVED_PROMPT = os.path.join(VOICE_DIR, "output_saved_prompt.wav")

SAMPLE_SOURCE_NAMES = (
    "sample.wav",
    "sample.mp3",
    "sample.ogg",
    "sample.oga",
    "sample.flac",
)

SAMPLE_SOURCES = tuple(
    os.path.join(VOICE_DIR, name) for name in SAMPLE_SOURCE_NAMES
)

# ================================================================================
