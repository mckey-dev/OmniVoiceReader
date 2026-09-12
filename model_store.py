# ================================================================================
# model_store.py
#
# OmniVoice と Whisper をリポジトリの models 配下へ置き、そこから読み込む。
# ================================================================================

import os

from huggingface_hub import snapshot_download


REPO_ROOT = os.path.dirname(os.path.abspath(__file__))

MODEL_REPO = "k2-fsa/OmniVoice"
ASR_REPO = "openai/whisper-large-v3-turbo"

MODEL_DIR = os.path.join(REPO_ROOT, "models", "OmniVoice")
ASR_DIR = os.path.join(REPO_ROOT, "models", "whisper-large-v3-turbo")


# ================================================================================
# _is_local_model_ready
# ローカルに config.json と model.safetensors があるかを返す。
# ================================================================================
def _is_local_model_ready(model_dir):
    return (
        os.path.isfile(os.path.join(model_dir, "config.json")) and
        os.path.isfile(os.path.join(model_dir, "model.safetensors"))
    )


# ================================================================================
# _ensure_hub_model
# 指定ディレクトリにモデルが無ければ、Hugging Face からダウンロードする。
# ================================================================================
def _ensure_hub_model(repo_id, model_dir):
    if _is_local_model_ready(model_dir):
        return model_dir

    os.makedirs(model_dir, exist_ok=True)

    print(f"Downloading {repo_id} to {model_dir} ...")

    snapshot_download(
        repo_id=repo_id,
        local_dir=model_dir,
    )

    if not _is_local_model_ready(model_dir):
        raise FileNotFoundError(
            f"Model was not downloaded to {model_dir}"
        )

    return model_dir


# ================================================================================
# ensure_omnivoice_model
# models/OmniVoice を返す。無ければ Hugging Face からそこにダウンロードする。
# ================================================================================
def ensure_omnivoice_model():
    return _ensure_hub_model(MODEL_REPO, MODEL_DIR)


# ================================================================================
# ensure_whisper_model
# models/whisper-large-v3-turbo を返す。無ければダウンロードする。
# ================================================================================
def ensure_whisper_model():
    return _ensure_hub_model(ASR_REPO, ASR_DIR)

# ================================================================================
