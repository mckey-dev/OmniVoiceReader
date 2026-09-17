# ================================================================================
# app.py
#
# OmniVoice をローカル GPU（ROCm / CUDA）または CPU で動かす TTS サーバー。
# HTTP ルート。モデルと声の実行時状態は runtime が持つ。
# ================================================================================

import io
import os
import shutil
import time
import traceback

from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware

import soundfile as sf

from server import runtime
from server.config import APP_VERSION, MAX_VOICE_UPLOAD_BYTES, SETTINGS_FILE
from server.extension_settings import (
    ExtensionSettings,
    read_extension_settings,
    settings_to_dict,
    write_extension_settings,
)
from server.generation import TTSRequest, default_generation_options, resolve_generation_options
from server.miopen_log import flush_miopen_warnings
from server.paths import AUDIO_EXTENSIONS
from server.runtime import apply_voice_prompt, load_runtime
from server.sampling.prepare_voice import prepare_voice_prompt
from server.sampling.voice_store import (
    add_voice,
    delete_voice,
    extension_of,
    find_voice,
    migrate_legacy_voices,
    new_voice_id,
    public_catalog,
    sanitize_stem,
    set_active,
    voice_paths,
)
from server.tts_language import language_catalog, resolve_tts_language


load_runtime()


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
        "device": runtime.device["label"],
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
# list_voices
# 登録済みの声一覧と、今使う声を返す。
# ================================================================================
@app.get("/voices")
def list_voices():
    catalog = migrate_legacy_voices()
    return public_catalog(catalog)


# ================================================================================
# create_voice
# 参照音声を保存し、書き起こしとクローン用プロンプトを作って active にする。
# ================================================================================
@app.post("/voices")
def create_voice(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
):
    migrate_legacy_voices()

    filename = file.filename or "voice.wav"
    source_ext = extension_of(filename)

    if not source_ext:
        allowed = ", ".join(AUDIO_EXTENSIONS)
        raise HTTPException(
            status_code=400,
            detail=f"対応していない形式です。{allowed} を指定してください。",
        )

    payload = file.file.read()

    if not payload:
        raise HTTPException(
            status_code=400,
            detail="ファイルが空です。",
        )

    if len(payload) > MAX_VOICE_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail="ファイルが大きすぎます（20MB まで）。",
        )

    stem = sanitize_stem(filename)
    display_name = (name or "").strip() or stem
    voice_id = new_voice_id()
    voice = {
        "id": voice_id,
        "name": display_name,
        "stem": stem,
        "source_name": os.path.basename(filename),
        "source_ext": source_ext,
        "has_prompt": False,
    }
    paths = voice_paths(voice)
    os.makedirs(paths["dir"], exist_ok=True)

    try:
        with open(paths["source"], "wb") as handle:
            handle.write(payload)

        print()
        print(f"Saving voice: {display_name}")
        prepare_voice_prompt(runtime.model, voice)
        voice["has_prompt"] = True
        catalog = add_voice(voice, make_active=True)
    except Exception as error:
        traceback.print_exc()

        if os.path.isdir(paths["dir"]):
            shutil.rmtree(paths["dir"], ignore_errors=True)

        raise HTTPException(
            status_code=500,
            detail=f"声の準備に失敗しました: {error}",
        )

    apply_voice_prompt(voice)
    return public_catalog(catalog)


# ================================================================================
# select_voice
# 使う声を切り替える。保存済みプロンプトをメモリへ載せる。
# ================================================================================
@app.put("/voices/{voice_id}/select")
def select_voice(voice_id: str):
    catalog = migrate_legacy_voices()
    voice = find_voice(catalog, voice_id)

    if voice is None:
        raise HTTPException(
            status_code=404,
            detail="指定した声が見つかりません。",
        )

    paths = voice_paths(voice)

    if not os.path.isfile(paths["pt"]):
        raise HTTPException(
            status_code=409,
            detail="この声のプロンプトがありません。もう一度アップロードしてください。",
        )

    voice, catalog = set_active(voice_id)
    apply_voice_prompt(voice)
    return public_catalog(catalog)


# ================================================================================
# remove_voice
# 声とその中間ファイルを削除する。
# ================================================================================
@app.delete("/voices/{voice_id}")
def remove_voice(voice_id: str):
    catalog = migrate_legacy_voices()

    if find_voice(catalog, voice_id) is None:
        raise HTTPException(
            status_code=404,
            detail="指定した声が見つかりません。",
        )

    _removed, catalog = delete_voice(voice_id)
    next_voice = find_voice(catalog, catalog.get("active_id"))
    apply_voice_prompt(next_voice)
    return public_catalog(catalog)


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

    with runtime.voice_lock:
        prompt = runtime.voice_clone_prompt

    if prompt is None:
        raise HTTPException(
            status_code=409,
            detail="声が選ばれていません。拡張から参照音声を登録してください。",
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
        audio = runtime.model.generate(
            text=text,
            language=language,
            voice_clone_prompt=prompt,
            instruct=options["instruct"],
            num_step=options["num_step"],
            guidance_scale=options["guidance_scale"],
            speed=options["speed"],
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
        samples / runtime.model.sampling_rate
        if samples and getattr(runtime.model, "sampling_rate", 0)
        else 0
    )

    print(f"Generation finished in {elapsed:.2f} sec")
    print(f"Audio: {samples} samples, {duration:.2f} sec, {channels} ch")
    runtime.print_vram()

    if samples <= 0:
        print("Warning: generated audio is empty")

    # 生成音声をメモリ上で WAV に変換する

    wav_buffer = io.BytesIO()

    sf.write(
        wav_buffer,
        audio[0],
        runtime.model.sampling_rate,
        format="WAV",
    )

    wav_data = wav_buffer.getvalue()

    print(f"Audio size: {len(wav_data)} bytes")

    return Response(
        content=wav_data,
        media_type="audio/wav",
    )


# ================================================================================
