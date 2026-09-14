# ================================================================================
# app.py
#
# OmniVoice をローカル GPU（ROCm / CUDA）または CPU で動かす TTS サーバー。
# ================================================================================

import os
import traceback

from server.gpu_runtime import configure_backend_env, print_torch_device, resolve_torch_device

# ROCm の最適化。torch を import する前に設定すること。CUDA では無視される。
configure_backend_env()

from server.miopen_log import flush_miopen_warnings, install_miopen_log_filter

install_miopen_log_filter()


import io
import json
import tempfile
import time

import torch
import soundfile as sf

from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from omnivoice import OmniVoice, VoiceClonePrompt

from server.sampling.sample_audio import SAMPLE_WAV, ensure_sample_wav
from server.model_store import ensure_omnivoice_model
from server.paths import PROJECT_ROOT, VOICE_CLONE_PROMPT
from server.tts_language import (
    DEFAULT_LANGUAGE,
    language_catalog,
    normalize_language_choice,
    resolve_tts_language,
)


# 設定

APP_VERSION = "1.0.0"
PROMPT_FILE = VOICE_CLONE_PROMPT
SAMPLE_FILE = SAMPLE_WAV
SETTINGS_FILE = os.path.join(PROJECT_ROOT, "extension", "settings.json")

HOST = "127.0.0.1"
PORT = 8000

DEFAULT_NUM_STEP = 32
DEFAULT_GUIDANCE_SCALE = 2.0
DEFAULT_T_SHIFT = 0.1
DEFAULT_POSITION_TEMPERATURE = 5.0
DEFAULT_CLASS_TEMPERATURE = 0.0
DEFAULT_DENOISE = True
DEFAULT_INSTRUCT = ""


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
    t_shift: Optional[float] = Field(default=None, ge=0)
    position_temperature: Optional[float] = Field(default=None, ge=0)
    class_temperature: Optional[float] = Field(default=None, ge=0)
    denoise: Optional[bool] = None
    language: Optional[str] = None


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


# ================================================================================
# default_generation_options
# サーバー側の生成既定値を返す。
# ================================================================================
def default_generation_options():
    return {
        "instruct": DEFAULT_INSTRUCT,
        "num_step": DEFAULT_NUM_STEP,
        "guidance_scale": DEFAULT_GUIDANCE_SCALE,
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
# require_sample_audio
# 参照音声が無いときは、モデルを読む前に起動を止める。
# MP3 / OGG などがあれば sample.wav へ変換する。
# ================================================================================
def require_sample_audio():
    ensure_sample_wav()


require_sample_audio()


device = resolve_torch_device(torch)


# モデルを読み込む

print("=" * 60)
print(f"OmniVoice Reader Server - {device['label']}")
print("=" * 60)

print()
print_torch_device(torch, device)

print()
print("Loading OmniVoice...")

model_dir = ensure_omnivoice_model()
print(f"Model path: {model_dir}")

load_start = time.perf_counter()

try:
    model = OmniVoice.from_pretrained(
        model_dir,
        device_map=device["device_map"],
        dtype=device["dtype"],
    )
except Exception as error:
    print(f"Failed to load OmniVoice: {error}")
    traceback.print_exc()

    try:
        with open("server_error.log", "w", encoding="utf-8") as handle:
            handle.write(f"Failed to load OmniVoice: {error}\n\n")
            traceback.print_exc(file=handle)
    except OSError:
        pass

    raise

flush_miopen_warnings()
print(f"Model loaded in {time.perf_counter() - load_start:.2f} sec")


# 保存済みの声クローン用プロンプトを読み込む

print()
print(f"Loading voice clone prompt: {PROMPT_FILE}")

if not os.path.exists(PROMPT_FILE):
    raise FileNotFoundError(
        f"Voice clone prompt not found: {PROMPT_FILE}"
    )

prompt_start = time.perf_counter()
voice_clone_prompt = VoiceClonePrompt.load(
    PROMPT_FILE,
    map_location="cpu",
)
print(f"Voice clone prompt loaded in {time.perf_counter() - prompt_start:.4f} sec")


# FastAPI の初期化

app = FastAPI(
    title="OmniVoice Local Reader",
    version=APP_VERSION,
)


# CORS 設定

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ルート

# ================================================================================
# root
# サーバーの稼働確認用情報を返す。
# ================================================================================
@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "OmniVoice Local Reader",
        "device": device["label"],
    }


# ================================================================================
# health
# ヘルスチェック用の簡易応答を返す。
# ================================================================================
@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": APP_VERSION,
    }


# ================================================================================
# tts_defaults
# 生成オプションの既定値を返す。クライアントの初期表示用。
# ================================================================================
@app.get("/tts/defaults")
def tts_defaults():
    return {
        "status": "ok",
        "defaults": default_generation_options(),
    }


# ================================================================================
# tts_languages
# OmniVoice が受け付ける language の一覧を返す。選択 UI 用。
# ================================================================================
@app.get("/tts/languages")
def tts_languages():
    catalog = language_catalog()
    catalog["status"] = "ok"
    return catalog


# ================================================================================
# get_extension_settings
# 拡張の設定ファイルを返す。
# ================================================================================
@app.get("/extension/settings")
def get_extension_settings():
    return {
        "status": "ok",
        "path": SETTINGS_FILE,
        "settings": read_extension_settings(),
    }


# ================================================================================
# put_extension_settings
# 拡張の設定ファイルを保存する。
# ================================================================================
@app.put("/extension/settings")
def put_extension_settings(settings: ExtensionSettings):
    saved = write_extension_settings(settings_to_dict(settings))

    return {
        "status": "ok",
        "path": SETTINGS_FILE,
        "settings": saved,
    }


# ================================================================================
# tts
# テキストから音声を生成し、WAV を返す。
# ================================================================================
@app.post("/tts")
def tts(request: TTSRequest):

    text = request.text.strip()

    if not text:
        raise HTTPException(
            status_code=400,
            detail="text is empty",
        )

    options = resolve_generation_options(request)
    language = resolve_tts_language(options["language"], text)

    print()
    print("-" * 60)
    print("TTS request:")
    if request.request_id:
        print(f"id: {request.request_id}")
    print(f"chars: {len(text)}")
    print(f"language: {language or 'none'}")
    print(text)
    print("Options:", options)

    start = time.perf_counter()

    try:
        audio = model.generate(
            text=text,
            language=language,
            voice_clone_prompt=voice_clone_prompt,
            instruct=options["instruct"],
            num_step=options["num_step"],
            guidance_scale=options["guidance_scale"],
            t_shift=options["t_shift"],
            position_temperature=options["position_temperature"],
            class_temperature=options["class_temperature"],
            denoise=options["denoise"],
        )

    except Exception as e:

        print("Generation error:")
        print(e)
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=str(e),
        )

    elapsed = time.perf_counter() - start

    flush_miopen_warnings()

    samples = 0
    channels = 0

    try:
        channels = len(audio)
        samples = len(audio[0]) if channels else 0
    except Exception:
        samples = 0

    duration = (
        samples / model.sampling_rate
        if samples and getattr(model, "sampling_rate", 0)
        else 0
    )

    print(f"Generation finished in {elapsed:.2f} sec")
    print(f"Audio: {samples} samples, {duration:.2f} sec, {channels} ch")

    if samples <= 0:
        print("Warning: generated audio is empty")

    # 生成音声をメモリ上で WAV に変換する

    wav_buffer = io.BytesIO()

    sf.write(
        wav_buffer,
        audio[0],
        model.sampling_rate,
        format="WAV",
    )

    wav_data = wav_buffer.getvalue()

    print(f"Audio size: {len(wav_data)} bytes")

    return Response(
        content=wav_data,
        media_type="audio/wav",
    )


# サーバーを起動する

# ================================================================================
# ensure_port_available
# 待ち受けポートが空いていることを確認する。
# ================================================================================
def ensure_port_available(host, port):
    import socket

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

    try:
        sock.bind((host, port))
    except OSError:
        print()
        print(f"{port} 番ポートは既に使われています。")
        print("前のサーバーを閉じてから、もう一度起動してください。")
        print(f"例: netstat -ano | findstr :{port}")
        raise SystemExit(1)
    finally:
        sock.close()


# ================================================================================
