// ================================================================================
// sentence.js
//
// 読み上げ対象テキストを、TTS 向けの単位に分割する。
//
// 1. 改行で1行ずつ分ける（HTML 抽出側で入れた改行）
// 2. 120文字を超えた行だけ、。または . の直後で切る
// 3. それでも長ければ 120 文字で切る
// 4. 60文字未満なら、120 を超えない範囲で次の単位を足す
// ================================================================================

import { debugLog } from "./debug.js";

export const MAX_SENTENCE_LENGTH = 120;
export const MIN_SENTENCE_LENGTH = 60;

// ================================================================================
// normalizeSource
// 改行をそろえ、前後の空白を除く。
// ================================================================================
function normalizeSource(text) {
    return String(text || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\u2028|\u2029/g, "\n")
        .trim();
}

// ================================================================================
// splitLines
// 空行を除いて、行ごとに分ける。
// ================================================================================
function splitLines(text) {
    return text
        .split(/\n+/)
        .map(line => line.trim())
        .filter(line => line.length > 0);
}

// ================================================================================
// isEnglishPeriodBreak
// 英文の . で切ってよいか。直後が数字なら切らない。空白か行末なら切る。
// ================================================================================
function isEnglishPeriodBreak(text, index) {
    if (text[index] !== ".") {
        return false;
    }

    const next = text[index + 1];

    if (next === undefined) {
        return true;
    }

    if (next >= "0" && next <= "9") {
        return false;
    }

    return /\s/.test(next);
}

// ================================================================================
// splitByPeriod
// 長すぎる1行を、。と . の直後で分ける。
// ================================================================================
function splitByPeriod(line) {
    const parts = [];
    let start = 0;

    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        const breakHere = character === "。" || isEnglishPeriodBreak(line, index);

        if (!breakHere) {
            continue;
        }

        const part = line.slice(start, index + 1).trim();

        if (part) {
            parts.push(part);
        }

        start = index + 1;
    }

    const tail = line.slice(start).trim();

    if (tail) {
        parts.push(tail);
    }

    return parts;
}

// ================================================================================
// splitByLength
// 句点でも切れない長い行を、文字数で切る。
// ================================================================================
function splitByLength(sentence) {
    const chunks = [];

    for (let index = 0; index < sentence.length; index += MAX_SENTENCE_LENGTH) {
        chunks.push(sentence.slice(index, index + MAX_SENTENCE_LENGTH));
    }

    return chunks;
}

// ================================================================================
// splitLongLine
// 120文字を超えた行だけ、句点で分け、だめなら文字数で切る。
// ================================================================================
function splitLongLine(line) {
    if (line.length <= MAX_SENTENCE_LENGTH) {
        return [line];
    }

    const parts = splitByPeriod(line);

    if (parts.length <= 1) {
        return splitByLength(line);
    }

    return parts.flatMap(item => {
        if (item.length <= MAX_SENTENCE_LENGTH) {
            return [item];
        }

        return splitByLength(item);
    });
}

// ================================================================================
// mergeShortSentences
// 直前が 60 文字未満なら、120 以下に収まる範囲で次を足す。
// ================================================================================
function mergeShortSentences(sentences) {
    const merged = [];

    for (const part of sentences) {
        if (merged.length === 0) {
            merged.push(part);
            continue;
        }

        const previous = merged[merged.length - 1];
        const combined = previous + " " + part;

        if (
            previous.length < MIN_SENTENCE_LENGTH &&
            combined.length <= MAX_SENTENCE_LENGTH
        ) {
            merged[merged.length - 1] = combined;
            continue;
        }

        merged.push(part);
    }

    return merged;
}

// ================================================================================
// splitSentences
// 本文を、読み上げ単位に分ける。
// ================================================================================
export function splitSentences(text) {
    const source = normalizeSource(text);

    if (!source) {
        return [];
    }

    const sentences = mergeShortSentences(
        splitLines(source).flatMap(splitLongLine)
    );

    debugLog("sentence", "split", {
        chars: source.length,
        sentences: sentences.length,
        lengths: sentences.map(item => item.length),
        overLimit: sentences.filter(item => item.length > MAX_SENTENCE_LENGTH).length
    });

    return sentences;
}

// ================================================================================
