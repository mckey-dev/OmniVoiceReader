# ================================================================================
# tts_language.py
#
# OmniVoice が受け付ける language の一覧と、auto / none の解決。
# ================================================================================

import json
import os
import re

from omnivoice.utils.lang_map import LANG_NAME_TO_ID, lang_display_name


DEFAULT_LANGUAGE = "auto"

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
LANGUAGES_FILE = os.path.join(ROOT_DIR, "extension", "languages.json")

LANGUAGE_ALIASES = {
    "auto": "auto",
    "detect": "auto",
    "none": "none",
    "und": "none",
    "unspecified": "none",
    "指定なし": "none",
    "ja": "Japanese",
    "jp": "Japanese",
    "japanese": "Japanese",
    "日本語": "Japanese",
    "en": "English",
    "eng": "English",
    "english": "English",
    "英語": "English",
    "zh": "Chinese",
    "chinese": "Chinese",
    "中国語": "Chinese",
    "中文": "Chinese",
    "yue": "Cantonese",
    "cantonese": "Cantonese",
    "広東語": "Cantonese",
    "廣東話": "Cantonese",
    "ko": "Korean",
    "korean": "Korean",
    "韓国語": "Korean",
    "한국어": "Korean",
    "fr": "French",
    "french": "French",
    "フランス語": "French",
    "de": "German",
    "german": "German",
    "ドイツ語": "German",
    "es": "Spanish",
    "spanish": "Spanish",
    "スペイン語": "Spanish",
    "pt": "Portuguese",
    "portuguese": "Portuguese",
    "ポルトガル語": "Portuguese",
    "it": "Italian",
    "italian": "Italian",
    "イタリア語": "Italian",
    "ru": "Russian",
    "russian": "Russian",
    "ロシア語": "Russian",
    "hi": "Hindi",
    "hindi": "Hindi",
    "vi": "Vietnamese",
    "vietnamese": "Vietnamese",
    "ベトナム語": "Vietnamese",
    "th": "Thai",
    "thai": "Thai",
    "タイ語": "Thai",
}

FREQUENT_NAMES = [
    ("japanese", "日本語"),
    ("english", "英語"),
    ("chinese", "中国語"),
    ("cantonese", "広東語"),
    ("korean", "韓国語"),
    ("french", "フランス語"),
    ("german", "ドイツ語"),
    ("spanish", "スペイン語"),
    ("portuguese", "ポルトガル語"),
    ("italian", "イタリア語"),
    ("russian", "ロシア語"),
    ("standard arabic", "アラビア語（標準）"),
    ("hindi", "ヒンディー語"),
    ("vietnamese", "ベトナム語"),
    ("thai", "タイ語"),
    ("indonesian", "インドネシア語"),
    ("dutch", "オランダ語"),
    ("polish", "ポーランド語"),
    ("turkish", "トルコ語"),
    ("ukrainian", "ウクライナ語"),
    ("swedish", "スウェーデン語"),
    ("greek", "ギリシャ語"),
    ("hebrew", "ヘブライ語"),
    ("finnish", "フィンランド語"),
    ("czech", "チェコ語"),
    ("romanian", "ルーマニア語"),
    ("hungarian", "ハンガリー語"),
    ("malay", "マレー語"),
    ("filipino", "フィリピン語"),
    ("bengali", "ベンガル語"),
    ("tamil", "タミル語"),
    ("persian", "ペルシア語"),
    ("swahili", "スワヒリ語"),
    ("norwegian", "ノルウェー語"),
    ("danish", "デンマーク語"),
    ("catalan", "カタルーニャ語"),
    ("khmer", "クメール語"),
    ("lao", "ラオ語"),
    ("burmese", "ビルマ語"),
    ("nepali", "ネパール語"),
]

_ID_TO_NAME = {code: name for name, code in LANG_NAME_TO_ID.items()}


# ================================================================================
# language_item
# 選択 UI 用の 1 件を作る。
# ================================================================================
def language_item(name, extra_label=None):
    code = LANG_NAME_TO_ID[name]
    display = lang_display_name(name)
    label = f"{display} ({code})"
    if extra_label:
        label = f"{extra_label} / {label}"

    return {
        "value": display,
        "id": code,
        "label": label,
    }


# ================================================================================
# language_catalog
# auto / none と、OmniVoice の全言語を返す。
# ================================================================================
def language_catalog():
    frequent = []
    frequent_names = set()

    for name, extra_label in FREQUENT_NAMES:
        if name not in LANG_NAME_TO_ID:
            continue
        frequent.append(language_item(name, extra_label))
        frequent_names.add(name)

    languages = [
        language_item(name)
        for name in sorted(LANG_NAME_TO_ID)
        if name not in frequent_names
    ]

    return {
        "default": DEFAULT_LANGUAGE,
        "special": [
            {
                "value": "auto",
                "id": None,
                "label": "自動（本文から判定）",
            },
            {
                "value": "none",
                "id": None,
                "label": "指定なし",
            },
        ],
        "frequent": frequent,
        "languages": languages,
        "count": len(LANG_NAME_TO_ID),
    }


# ================================================================================
# write_languages_json
# 拡張がサーバー停止中でも読める一覧を書く。
# ================================================================================
def write_languages_json(path=None):
    target = path or LANGUAGES_FILE
    payload = language_catalog()
    os.makedirs(os.path.dirname(target), exist_ok=True)

    with open(target, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    return target


# ================================================================================
# normalize_language_choice
# auto / none / 表示名 / ISO コードを、保存用の値に揃える。
# ================================================================================
def normalize_language_choice(value):
    if value is None:
        return DEFAULT_LANGUAGE

    text = str(value).strip()
    if not text:
        return DEFAULT_LANGUAGE

    aliased = LANGUAGE_ALIASES.get(text) or LANGUAGE_ALIASES.get(text.lower())
    if aliased:
        return aliased

    lower = text.lower()
    if lower in LANG_NAME_TO_ID:
        return lang_display_name(lower)

    if text in _ID_TO_NAME:
        return lang_display_name(_ID_TO_NAME[text])

    if lower in _ID_TO_NAME:
        return lang_display_name(_ID_TO_NAME[lower])

    return text


# ================================================================================
# detect_tts_language
# 本文から日本語・英語・中国語・韓国語のどれかを決める。
# ================================================================================
def detect_tts_language(text):
    source = str(text or "")
    hangul = len(re.findall(r"[\uac00-\ud7af]", source))
    kana = len(re.findall(r"[\u3040-\u30ff]", source))
    cjk = len(re.findall(r"[\u3400-\u9fff\uf900-\ufaff]", source))
    latin = len(re.findall(r"[A-Za-z]", source))

    if hangul > max(kana, latin, cjk // 2):
        return "Korean"

    japanese_score = kana * 2 + cjk
    if kana > 0 and japanese_score >= latin:
        return "Japanese"

    if cjk > 0 and cjk >= latin and kana == 0:
        return "Chinese"

    if latin > japanese_score and latin > hangul:
        return "English"

    if japanese_score > 0:
        return "Japanese"

    if hangul > 0:
        return "Korean"

    if latin > 0:
        return "English"

    return "Japanese"


# ================================================================================
# resolve_tts_language
# 設定値と本文から、OmniVoice へ渡す language を決める。
# ================================================================================
def resolve_tts_language(choice, text):
    normalized = normalize_language_choice(choice)

    if normalized == "auto":
        return detect_tts_language(text)

    if normalized == "none":
        return None

    return normalized


if __name__ == "__main__":
    path = write_languages_json()
    catalog = language_catalog()
    print(f"wrote {path}")
    print(f"languages: {catalog['count']}")

# ================================================================================
