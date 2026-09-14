#!/usr/bin/env bash

# ================================================================================
# start_amd.sh
#
# AMD GPU / ROCm 向け仮想環境 venv_amd でサーバーを起動する。
# 仮想環境が無い場合は作成し、requirements_amd.txt を入れる。
# ================================================================================

set -euo pipefail

cd "$(dirname "$0")"

VENV_DIR="venv_amd"
PYTHON_EXE="${VENV_DIR}/bin/python"

if command -v python3 >/dev/null 2>&1; then
    PY="python3"
elif command -v python >/dev/null 2>&1; then
    PY="python"
else
    echo "Python が見つかりません。Python 3 をインストールしてください。"
    exit 1
fi

if [ ! -x "${PYTHON_EXE}" ]; then
    echo "仮想環境を作成しています: ${VENV_DIR}"
    "${PY}" -m venv "${VENV_DIR}"

    echo "pip を更新しています..."
    "${PYTHON_EXE}" -m pip install -U pip

    echo "必要なパッケージをインストールしています: requirements_amd.txt"
    echo "注意: torch の +rocm 版は通常の PyPI だけでは入らないことがあります。"
    if ! "${PYTHON_EXE}" -m pip install -r requirements_amd.txt; then
        echo "requirements_amd.txt からのインストールに失敗しました。"
        echo "AMD ROCm / TheRock 向けの torch を入れたあと、再実行してください。"
        exit 1
    fi
fi

if ! "${PYTHON_EXE}" -c "from server.sampling.sample_audio import ensure_sample_wav; ensure_sample_wav()"; then
    echo "参照音声の準備に失敗しました。"
    echo "voice フォルダに sample.wav / sample.mp3 / sample.ogg などを置いてから再実行してください。"
    exit 1
fi

if [ ! -f "voice/voice_clone_prompt.pt" ]; then
    echo "voice/voice_clone_prompt.pt が無いため、参照音声から作成します..."
    "${PYTHON_EXE}" -m server.sampling.build_voice_prompt
fi

echo "サーバーを起動します: http://127.0.0.1:8000"
exec "${PYTHON_EXE}" -m server

# ================================================================================
