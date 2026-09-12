// ================================================================================
// test_sentence_split.mjs
//
// extension/sentence.js の分割を、Node 上で確認する。
// ================================================================================

import {
    MAX_SENTENCE_LENGTH,
    splitSentences
} from "./extension/sentence.js";

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function assertEqual(actual, expected, message) {
    const actualText = JSON.stringify(actual);
    const expectedText = JSON.stringify(expected);

    if (actualText !== expectedText) {
        throw new Error(
            `${message}\n  expected: ${expectedText}\n  actual:   ${actualText}`
        );
    }
}

assertEqual(splitSentences(""), [], "empty text");
assertEqual(splitSentences("   "), [], "whitespace only");

assertEqual(
    splitSentences("こんにちは。今日はいい天気です。"),
    ["こんにちは。", "今日はいい天気です。"],
    "period split"
);

assertEqual(
    splitSentences("一行目\n二行目"),
    ["一行目", "二行目"],
    "newline split first"
);

assertEqual(
    splitSentences("一行目\r\n\r\n二行目"),
    ["一行目", "二行目"],
    "blank lines ignored"
);

const long = "あ".repeat(250);
const longParts = splitSentences(long);

assertEqual(longParts.length, 3, "long text becomes 3 chunks");
assert(
    longParts.every(item => item.length <= MAX_SENTENCE_LENGTH),
    "no chunk exceeds MAX_SENTENCE_LENGTH"
);
assertEqual(longParts[0].length, 120, "first hard-split chunk");
assertEqual(longParts[1].length, 120, "second hard-split chunk");
assertEqual(longParts[2].length, 10, "remainder chunk");

const commaText = "短い、" + "あ".repeat(100) + "、" + "い".repeat(50);
const commaParts = splitSentences(commaText);

assert(
    commaParts.length >= 2,
    "comma should split a long line"
);
assert(
    commaParts.every(item => item.length <= MAX_SENTENCE_LENGTH),
    "comma-split chunks stay within limit"
);

const mixed = [
    "見出し",
    "これは句点で終わる文。次の文も続く。",
    "あ".repeat(130)
].join("\n");
const mixedParts = splitSentences(mixed);

assert(mixedParts[0] === "見出し", "heading stays its own sentence");
assert(mixedParts[1] === "これは句点で終わる文。", "period after newline");
assert(mixedParts[2] === "次の文も続く。", "second period sentence");
assert(
    mixedParts.slice(3).every(item => item.length <= MAX_SENTENCE_LENGTH),
    "remaining long line is capped"
);

assertEqual(
    splitSentences("Hello world. This is English."),
    ["Hello world.", "This is English."],
    "english period split"
);

assertEqual(
    splitSentences("Version 3.14 is ready."),
    ["Version 3.14 is ready."],
    "decimal is not a sentence end"
);

console.log("test_sentence_split: ok");
console.log({
    max: MAX_SENTENCE_LENGTH,
    longParts: longParts.map(item => item.length),
    commaParts: commaParts.map(item => item.length),
    mixedParts: mixedParts.map(item => item.length)
});
