# ================================================================================
# generation.py
#
# /tts の入力モデルと、生成オプションの既定値合成。
# ================================================================================

from typing import Optional

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
)
from server.tts_language import DEFAULT_LANGUAGE, normalize_language_choice


# ================================================================================
# TTSRequest
# /tts に送る読み上げテキストと、任意の生成オプションを受け取る。
# 省略した項目はサーバー既定値を使う。
# ================================================================================
class TTSRequest(BaseModel):
    text: str
    request_id: Optional[str] = None
    instruct: Optional[str] = None
    num_step: Optional[int] = Field(default=None, ge=1)
    guidance_scale: Optional[float] = Field(default=None, ge=0)
    speed: Optional[float] = Field(default=None, gt=0)
    t_shift: Optional[float] = Field(default=None, ge=0)
    position_temperature: Optional[float] = Field(default=None, ge=0)
    class_temperature: Optional[float] = Field(default=None, ge=0)
    denoise: Optional[bool] = None
    language: Optional[str] = None


# ================================================================================
# default_generation_options
# サーバー側の生成既定値を返す。
# ================================================================================
def default_generation_options():
    return {
        "instruct": DEFAULT_INSTRUCT,
        "num_step": DEFAULT_NUM_STEP,
        "guidance_scale": DEFAULT_GUIDANCE_SCALE,
        "speed": DEFAULT_SPEED,
        "t_shift": DEFAULT_T_SHIFT,
        "position_temperature": DEFAULT_POSITION_TEMPERATURE,
        "class_temperature": DEFAULT_CLASS_TEMPERATURE,
        "denoise": DEFAULT_DENOISE,
        "language": DEFAULT_LANGUAGE,
    }


# ================================================================================
# resolve_generation_options
# リクエストの指定値と既定値を合成する。空の instruct は未指定として扱う。
# ================================================================================
def resolve_generation_options(request):
    instruct = (
        request.instruct.strip()
        if isinstance(request.instruct, str)
        else ""
    )

    return {
        "instruct": instruct or None,
        "num_step": (
            DEFAULT_NUM_STEP
            if request.num_step is None
            else request.num_step
        ),
        "guidance_scale": (
            DEFAULT_GUIDANCE_SCALE
            if request.guidance_scale is None
            else request.guidance_scale
        ),
        "speed": (
            DEFAULT_SPEED
            if request.speed is None
            else request.speed
        ),
        "t_shift": (
            DEFAULT_T_SHIFT
            if request.t_shift is None
            else request.t_shift
        ),
        "position_temperature": (
            DEFAULT_POSITION_TEMPERATURE
            if request.position_temperature is None
            else request.position_temperature
        ),
        "class_temperature": (
            DEFAULT_CLASS_TEMPERATURE
            if request.class_temperature is None
            else request.class_temperature
        ),
        "denoise": (
            DEFAULT_DENOISE
            if request.denoise is None
            else request.denoise
        ),
        "language": normalize_language_choice(request.language),
    }


# ================================================================================
