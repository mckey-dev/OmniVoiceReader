// ================================================================================
// sentence.js
//
// 読み上げ対象テキストを文単位に分割する。
// 句点がない長い塊は、読点や文字数でも切る。
// ================================================================================

import { debugLog } from "./debug.js";

export const MAX_SENTENCE_LENGTH = 120;

// ================================================================================
// splitByLength
// 句読点でも切れない長い文を、文字数で切る。
// ================================================================================
function splitByLength(sentence) {
    const chunks = [];

    for (let index = 0; index < sentence.length; index += MAX_SENTENCE_LENGTH) {
        chunks.push(sentence.slice(index, index + MAX_SENTENCE_LENGTH));
    }

    return chunks;
}

// ================================================================================
// splitLongSentence
// 長い文を読点で分け、まだ長ければ文字数で切る。
// ================================================================================
function splitLongSentence(sentence) {
    if (sentence.length <= MAX_SENTENCE_LENGTH) {
        return [sentence];
    }

    const pieces = sentence
        .split(/(?<=[、，,；;：:])/)
        .map(piece => piece.trim())
        .filter(piece => piece.length > 0);

    if (pieces.length <= 1) {
        return splitByLength(sentence);
    }

    const merged = [];
    let buffer = "";

    for (const piece of pieces) {
        if (!buffer) {
            buffer = piece;
            continue;
        }

        if ((buffer + piece).length <= MAX_SENTENCE_LENGTH) {
            buffer += piece;
            continue;
        }

        merged.push(buffer);
        buffer = piece;
    }

    if (buffer) {
        merged.push(buffer);
    }

    return merged.flatMap(item => {
        if (item.length <= MAX_SENTENCE_LENGTH) {
            return [item];
        }

        return splitByLength(item);
    });
}

// ================================================================================
// splitSentences
// 改行で分け、各行を句点や英文のピリオドで分け、長い文はさらに短くする。
// ================================================================================
export function splitSentences(text) {
    const source = String(text || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\u2028|\u2029/g, "\n")
        .trim();

    if (!source) {
        return [];
    }

    const sentences = source
        .split(/\n+/)
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .flatMap(line => line
            .split(/(?<=[。．！？!?])|(?<=\.["'”’)\]]*)\s+(?=[A-Z"“‘(\[])/)
            .map(part => part.trim())
            .filter(part => part.length > 0)
        )
        .flatMap(splitLongSentence);

    debugLog("sentence", "split", {
        chars: source.length,
        sentences: sentences.length,
        lengths: sentences.map(item => item.length),
        overLimit: sentences.filter(item => item.length > MAX_SENTENCE_LENGTH).length
    });

    return sentences;
}

// ================================================================================
