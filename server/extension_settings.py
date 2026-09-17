# ================================================================================
# extension_settings.py
#
# 拡張の設定ファイル extension/settings.json の形と読み書き。
# ================================================================================

import json
import os
import tempfile

from pydantic import BaseModel, Field

from server.config import (
    DEFAULT_CLASS_TEMPERATURE,
    DEFAULT_DENOISE,
    DEFAULT_GUIDANCE_SCALE,
    DEFAULT_INSTRUCT,
    DEFAULT_NUM_STEP,
    DEFAULT_POSITION_TEMPERATURE,
    DEFAULT_SPEED,
    DEFAULT_T_SHIFT,
    SETTINGS_FILE,
)
from server.tts_language import DEFAULT_LANGUAGE, normalize_language_choice


# ================================================================================
# ExtensionSettings
# 拡張の設定ファイル extension/settings.json の形。
# ================================================================================
class ExtensionSettings(BaseModel):
    playbackSpeed: float = Field(default=1.0, ge=0.5, le=2.0)
    playbackVolume: float = Field(default=1.0, ge=0, le=1)
    instruct: str = DEFAULT_INSTRUCT
    num_step: int = Field(default=DEFAULT_NUM_STEP, ge=1)
    guidance_scale: float = Field(default=DEFAULT_GUIDANCE_SCALE, ge=0)
    speed: float = Field(default=DEFAULT_SPEED, gt=0)
    t_shift: float = Field(default=DEFAULT_T_SHIFT, ge=0)
    position_temperature: float = Field(
        default=DEFAULT_POSITION_TEMPERATURE,
        ge=0,
    )
    class_temperature: float = Field(
        default=DEFAULT_CLASS_TEMPERATURE,
        ge=0,
    )
    denoise: bool = DEFAULT_DENOISE
    language: str = DEFAULT_LANGUAGE
    highlightSentence: bool = False
    autoReadChat: bool = False


# ================================================================================
# settings_to_dict
# Pydantic モデルを JSON 用の dict にする。
# ================================================================================
def settings_to_dict(model):
    if hasattr(model, "model_dump"):
        return model.model_dump()

    return model.dict()


# ================================================================================
# default_extension_settings
# 拡張設定の既定値を返す。
# ================================================================================
def default_extension_settings():
    return settings_to_dict(ExtensionSettings())


# ================================================================================
# parse_extension_settings
# 設定 JSON を検証してモデルにする。
# ================================================================================
def parse_extension_settings(data):
    if hasattr(ExtensionSettings, "model_validate"):
        settings = ExtensionSettings.model_validate(data)
    else:
        settings = ExtensionSettings.parse_obj(data)

    payload = settings_to_dict(settings)
    payload["language"] = normalize_language_choice(payload.get("language"))

    if hasattr(ExtensionSettings, "model_validate"):
        return ExtensionSettings.model_validate(payload)

    return ExtensionSettings.parse_obj(payload)


# ================================================================================
# write_extension_settings
# 拡張設定を settings.json に保存する。
# ================================================================================
def write_extension_settings(settings):
    normalized = settings_to_dict(parse_extension_settings(settings))
    directory = os.path.dirname(SETTINGS_FILE)
    os.makedirs(directory, exist_ok=True)

    fd, tmp_path = tempfile.mkstemp(
        prefix="settings.",
        suffix=".tmp",
        dir=directory,
    )

    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(normalized, handle, ensure_ascii=False, indent=2)
            handle.write("\n")

        os.replace(tmp_path, SETTINGS_FILE)
    except Exception:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

        raise

    return normalized


# ================================================================================
# read_extension_settings
# 拡張設定を settings.json から読む。無ければ作成する。
# ================================================================================
def read_extension_settings():
    if not os.path.exists(SETTINGS_FILE):
        return write_extension_settings(default_extension_settings())

    try:
        with open(SETTINGS_FILE, encoding="utf-8") as handle:
            data = json.load(handle)

        return settings_to_dict(parse_extension_settings(data))
    except Exception as error:
        print("Failed to read extension settings:", error)
        return default_extension_settings()


# ================================================================================
