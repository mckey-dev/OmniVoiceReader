// ================================================================================
// test_sentence_split.mjs
//
// extension/sentence.js の分割を、Node 上で確認する。
// ================================================================================

import {
    MAX_SENTENCE_LENGTH,
    MIN_SENTENCE_LENGTH,
    splitSentences
} from "../extension/sentence.js";

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
    ["こんにちは。今日はいい天気です。"],
    "short line keeps periods together"
);

assertEqual(
    splitSentences("一行目\n二行目"),
    ["一行目 二行目"],
    "short lines merge across newline"
);

assertEqual(
    splitSentences("一行目\r\n\r\n二行目"),
    ["一行目 二行目"],
    "blank lines ignored then short lines merge"
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

const overflowJp = "あ".repeat(80) + "今日はいい天気です。" + "い".repeat(80) + "駅まで歩きます。";
const overflowJpParts = splitSentences(overflowJp);

assert(overflowJpParts.length >= 2, "long Japanese line splits on 。");
assert(
    overflowJpParts[0].endsWith("。"),
    "first overflow chunk ends with 。"
);
assert(
    overflowJpParts.every(item => item.length <= MAX_SENTENCE_LENGTH),
    "period-split chunks stay within limit"
);

const mixed = [
    "見出し",
    "これは句点で終わる文。次の文も続く。",
    "あ".repeat(130)
].join("\n");
const mixedParts = splitSentences(mixed);

assert(
    mixedParts[0] === "見出し これは句点で終わる文。次の文も続く。",
    "short heading merges with the next short line"
);
assert(
    mixedParts.slice(1).every(item => item.length <= MAX_SENTENCE_LENGTH),
    "remaining long line is capped"
);

assertEqual(
    splitSentences("Hello world. This is English."),
    ["Hello world. This is English."],
    "short English line stays one unit"
);

assertEqual(
    splitSentences("Version 3.14 is ready."),
    ["Version 3.14 is ready."],
    "decimal is not a sentence end"
);

const overflowEn = ("word ".repeat(30) + "Nice day. " + "word ".repeat(30)).trim();
const overflowEnParts = splitSentences(overflowEn);

assert(
    overflowEnParts.some(item => item.endsWith("Nice day.")),
    "long English line splits on ."
);

const sample = "今日は朝からよく晴れて、窓の外では鳥の声が聞こえていた。駅までの道は少し混んでいたが、いつものように歩いて十五分ほどで着いた。改札を出て向かいのビルの二階にある事務所へ向かう。エレベーターの中で時計を見ると、まだ余裕があった。会議は十時から";
assertEqual(sample.length, 120, "sample is 120 chars");
assertEqual(splitSentences(sample), [sample], "120 char Japanese sample is one chunk");

const shortThenFit = "あ".repeat(20) + "\n" + "い".repeat(20) + "\n" + "う".repeat(20);
const shortThenFitParts = splitSentences(shortThenFit);
assertEqual(shortThenFitParts.length, 1, "short lines keep merging until min length");
assert(
    shortThenFitParts[0].length >= MIN_SENTENCE_LENGTH,
    "merged short lines reach MIN_SENTENCE_LENGTH"
);
assert(
    shortThenFitParts[0].length <= MAX_SENTENCE_LENGTH,
    "merged short lines stay within MAX_SENTENCE_LENGTH"
);

const shortThenOverflow = "あ".repeat(50) + "\n" + "い".repeat(80);
const shortThenOverflowParts = splitSentences(shortThenOverflow);
assertEqual(
    shortThenOverflowParts,
    ["あ".repeat(50), "い".repeat(80)],
    "short line does not merge when combined text would exceed max"
);

console.log("test_sentence_split: ok");
console.log({
    max: MAX_SENTENCE_LENGTH,
    min: MIN_SENTENCE_LENGTH,
    longParts: longParts.map(item => item.length),
    overflowJpParts: overflowJpParts.map(item => item.length),
    mixedParts: mixedParts.map(item => item.length),
    overflowEnParts: overflowEnParts.map(item => item.length),
    shortThenFitParts: shortThenFitParts.map(item => item.length),
    shortThenOverflowParts: shortThenOverflowParts.map(item => item.length)
});
