# ================================================================================
# voice_store.py
#
# 声ライブラリの一覧・保存場所・移行。各声は voice/{id}/{stem}.* に置く。
# ================================================================================

import json
import os
import re
import shutil
import uuid

from server.paths import (
    AUDIO_EXTENSIONS,
    LEGACY_PROMPT,
    LEGACY_SAMPLE_TXT,
    LEGACY_SAMPLE_WAV,
    VOICE_DIR,
    VOICES_FILE,
)


INVALID_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
MAX_STEM_LENGTH = 80


# ================================================================================
# empty_catalog
# 空の声一覧を返す。
# ================================================================================
def empty_catalog():
    return {
        "active_id": None,
        "voices": [],
    }


# ================================================================================
# voice_folder
# 1 件の声フォルダパスを返す。
# ================================================================================
def voice_folder(voice_id):
    return os.path.join(VOICE_DIR, voice_id)


# ================================================================================
# voice_paths
# 1 件の声について、元ファイル・wav・txt・pt のパスを返す。
# ================================================================================
def voice_paths(voice):
    folder = voice_folder(voice["id"])
    stem = voice["stem"]
    source_ext = voice.get("source_ext") or os.path.splitext(
        voice.get("source_name") or ""
    )[1]
    source_path = os.path.join(folder, stem + source_ext)
    wav_path = os.path.join(folder, stem + ".wav")

    return {
        "dir": folder,
        "source": source_path,
        "wav": wav_path,
        "txt": os.path.join(folder, stem + ".txt"),
        "pt": os.path.join(folder, stem + ".pt"),
    }


# ================================================================================
# sanitize_stem
# アップロードファイル名から、保存に使う stem を作る。
# ================================================================================
def sanitize_stem(filename):
    name = os.path.basename(filename or "")
    stem, _ext = os.path.splitext(name)
    stem = INVALID_FILENAME_CHARS.sub("", stem).strip(" .")

    if not stem:
        stem = "voice"

    return stem[:MAX_STEM_LENGTH]


# ================================================================================
# extension_of
# 許可された音声拡張子を小文字で返す。不可なら空文字。
# ================================================================================
def extension_of(filename):
    ext = os.path.splitext(os.path.basename(filename or ""))[1].lower()

    if ext in AUDIO_EXTENSIONS:
        return ext

    return ""


# ================================================================================
# new_voice_id
# 声フォルダ用の短い ID を返す。
# ================================================================================
def new_voice_id():
    return uuid.uuid4().hex[:12]


# ================================================================================
# read_catalog
# voices.json を読む。無ければ空。
# ================================================================================
def read_catalog():
    if not os.path.isfile(VOICES_FILE):
        return empty_catalog()

    try:
        with open(VOICES_FILE, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except Exception:
        return empty_catalog()

    voices = data.get("voices") if isinstance(data, dict) else None

    if not isinstance(voices, list):
        return empty_catalog()

    active_id = data.get("active_id")

    return {
        "active_id": active_id if isinstance(active_id, str) else None,
        "voices": voices,
    }


# ================================================================================
# write_catalog
# voices.json を保存する。
# ================================================================================
def write_catalog(catalog):
    os.makedirs(VOICE_DIR, exist_ok=True)

    payload = {
        "active_id": catalog.get("active_id"),
        "voices": catalog.get("voices") or [],
    }

    tmp_path = VOICES_FILE + ".tmp"

    with open(tmp_path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    os.replace(tmp_path, VOICES_FILE)
    return payload


# ================================================================================
# find_voice
# ID から声レコードを返す。無ければ None。
# ================================================================================
def find_voice(catalog, voice_id):
    if not voice_id:
        return None

    for voice in catalog.get("voices") or []:
        if voice.get("id") == voice_id:
            return voice

    return None


# ================================================================================
# public_voice
# 拡張へ返す 1 件分。
# ================================================================================
def public_voice(voice, active_id):
    return {
        "id": voice.get("id"),
        "name": voice.get("name") or voice.get("stem") or "",
        "stem": voice.get("stem") or "",
        "source_name": voice.get("source_name") or "",
        "has_prompt": bool(voice.get("has_prompt")),
        "active": voice.get("id") == active_id,
    }


# ================================================================================
# public_catalog
# 拡張へ返す一覧。
# ================================================================================
def public_catalog(catalog):
    active_id = catalog.get("active_id")
    voices = [
        public_voice(voice, active_id)
        for voice in catalog.get("voices") or []
        if voice.get("id")
    ]
    active = next((voice for voice in voices if voice["active"]), None)

    return {
        "status": "ok",
        "active_id": active_id if active else None,
        "active_name": active["name"] if active else "",
        "voices": voices,
    }


# ================================================================================
# _move_if_exists
# あれば移動する。
# ================================================================================
def _move_if_exists(source, dest):
    if not os.path.isfile(source):
        return False

    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.move(source, dest)
    return True


# ================================================================================
# migrate_legacy_voices
# 旧 voice/sample.* を 1 件の声フォルダへ移す。
# ================================================================================
def migrate_legacy_voices():
    os.makedirs(VOICE_DIR, exist_ok=True)
    catalog = read_catalog()

    if catalog["voices"]:
        return catalog

    source_name = None
    source_path = None

    for name in (
        "sample.wav",
        "sample.mp3",
        "sample.ogg",
        "sample.oga",
        "sample.flac",
    ):
        path = os.path.join(VOICE_DIR, name)

        if os.path.isfile(path):
            source_name = name
            source_path = path
            break

    has_txt = os.path.isfile(LEGACY_SAMPLE_TXT)
    has_prompt = os.path.isfile(LEGACY_PROMPT)

    if not source_path and not has_txt and not has_prompt:
        return catalog

    voice_id = new_voice_id()
    stem = "sample"
    source_ext = os.path.splitext(source_name or "sample.wav")[1].lower()
    voice = {
        "id": voice_id,
        "name": "sample",
        "stem": stem,
        "source_name": source_name or "sample.wav",
        "source_ext": source_ext,
        "has_prompt": False,
    }
    paths = voice_paths(voice)
    os.makedirs(paths["dir"], exist_ok=True)

    if source_path:
        _move_if_exists(source_path, paths["source"])

        if source_ext != ".wav" and os.path.isfile(LEGACY_SAMPLE_WAV):
            _move_if_exists(LEGACY_SAMPLE_WAV, paths["wav"])

    elif os.path.isfile(LEGACY_SAMPLE_WAV):
        voice["source_name"] = "sample.wav"
        voice["source_ext"] = ".wav"
        paths = voice_paths(voice)
        _move_if_exists(LEGACY_SAMPLE_WAV, paths["wav"])

    _move_if_exists(LEGACY_SAMPLE_TXT, paths["txt"])
    voice["has_prompt"] = _move_if_exists(LEGACY_PROMPT, paths["pt"])

    catalog = {
        "active_id": voice_id if voice["has_prompt"] else None,
        "voices": [voice],
    }

    return write_catalog(catalog)


# ================================================================================
# add_voice
# 声レコードを追加し、必要なら active にする。
# ================================================================================
def add_voice(voice, make_active=True):
    catalog = read_catalog()
    catalog["voices"] = [
        item for item in catalog.get("voices") or []
        if item.get("id") != voice.get("id")
    ]
    catalog["voices"].append(voice)

    if make_active:
        catalog["active_id"] = voice.get("id")

    return write_catalog(catalog)


# ================================================================================
# set_active
# 使う声を切り替える。
# ================================================================================
def set_active(voice_id):
    catalog = read_catalog()
    voice = find_voice(catalog, voice_id)

    if not voice:
        return None, catalog

    catalog["active_id"] = voice_id
    return voice, write_catalog(catalog)


# ================================================================================
# delete_voice
# 声フォルダとレコードを消す。active なら別の声へ、無ければ空にする。
# ================================================================================
def delete_voice(voice_id):
    catalog = read_catalog()
    voice = find_voice(catalog, voice_id)

    if not voice:
        return None, catalog

    folder = voice_folder(voice_id)

    if os.path.isdir(folder):
        shutil.rmtree(folder)

    remaining = [
        item for item in catalog.get("voices") or []
        if item.get("id") != voice_id
    ]

    active_id = catalog.get("active_id")

    if active_id == voice_id:
        next_voice = next(
            (item for item in remaining if item.get("has_prompt")),
            remaining[0] if remaining else None,
        )
        active_id = next_voice["id"] if next_voice else None

    catalog = {
        "active_id": active_id,
        "voices": remaining,
    }

    return voice, write_catalog(catalog)

# ================================================================================
