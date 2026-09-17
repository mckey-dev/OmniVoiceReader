#!/usr/bin/env bash

# ================================================================================
# start_cuda.sh
#
# NVIDIA CUDA 向け仮想環境 venv_cuda でサーバーを起動する。
# 仮想環境が無い場合は作成し、requirements_cuda.txt を入れる。
# ================================================================================

set -euo pipefail

cd "$(dirname "$0")"

VENV_DIR="venv_cuda"
PYTHON_EXE="${VENV_DIR}/bin/python"

if command -v python3 >/dev/null 2>&1; then
    PY="python3"
elif command -v python >/dev/null 2>&1; then
    PY="python"
else
    echo "Python が見つかりません。Python 3 をインストールしてください。"
    exit 1
fi

echo "NVIDIA ドライバを確認しています..."
"${PY}" -m server.gpu_runtime

if [ ! -x "${PYTHON_EXE}" ]; then
    echo "仮想環境を作成しています: ${VENV_DIR}"
    "${PY}" -m venv "${VENV_DIR}"

    echo "pip を更新しています..."
    "${PYTHON_EXE}" -m pip install -U pip

    echo "必要なパッケージをインストールしています: requirements_cuda.txt"
    echo "注意: 既定は torch の CUDA 13.0 版 (cu130) です。"
    if ! "${PYTHON_EXE}" -m pip install -r requirements_cuda.txt; then
        echo "requirements_cuda.txt からのインストールに失敗しました。"
        echo "CUDA 版が環境と合わない場合は、cu126 / cu130 / cu132 を確認してください。"
        exit 1
    fi
fi

echo "サーバーを起動します"
exec "${PYTHON_EXE}" -m server "$@"

# ================================================================================
