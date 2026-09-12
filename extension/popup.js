// ================================================================================
// popup.js
//
// 拡張ポップアップの UI。抽出、読み上げ開始、再生制御、進捗表示を行う。
// ================================================================================

const status = document.getElementById("status");
const result = document.getElementById("result");
const progress = document.getElementById("progress");
const currentSentence = document.getElementById("currentSentence");
const extractButton = document.getElementById("extractButton");
const readButton = document.getElementById("readButton");
const readSelectionButton = document.getElementById("readSelectionButton");
const pauseButton = document.getElementById("pauseButton");
const resumeButton = document.getElementById("resumeButton");
const stopButton = document.getElementById("stopButton");
const speedRange = document.getElementById("speedRange");
const speedValue = document.getElementById("speedValue");
const volumeRange = document.getElementById("volumeRange");
const volumeValue = document.getElementById("volumeValue");
const instructInput = document.getElementById("instructInput");
const numStepInput = document.getElementById("numStepInput");
const guidanceScaleInput = document.getElementById("guidanceScaleInput");
const tShiftInput = document.getElementById("tShiftInput");
const positionTemperatureInput = document.getElementById("positionTemperatureInput");
const classTemperatureInput = document.getElementById("classTemperatureInput");
const denoiseInput = document.getElementById("denoiseInput");

// ================================================================================
// getCurrentTab
// 現在表示中のタブを取得する。
// ================================================================================
async function getCurrentTab() {
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });

    if (!tab || !tab.id) {
        throw new Error("現在のタブを取得できませんでした。");
    }

    return tab;
}

// ================================================================================
// sendCommand
// background へ操作を送り、失敗時は例外を投げる。
// ================================================================================
async function sendCommand(action, extra = {}) {
    const response = await chrome.runtime.sendMessage({
        action,
        ...extra
    });

    if (!response || response.success === false) {
        throw new Error(response?.error || "操作に失敗しました。");
    }

    return response;
}

// ================================================================================
// applyPlaybackState
// 取得した再生状態を、ポップアップ表示へ反映する。
// ================================================================================
function applyPlaybackState(playbackState) {
    if (!playbackState) {
        return;
    }

    // 全文を復元する
    if (typeof playbackState.currentText === "string") {
        result.textContent = playbackState.currentText;
    }

    // 進捗
    const current = Number(playbackState.currentSentenceIndex);
    const total = Number(playbackState.currentSentenceTotal);

    if (Number.isFinite(current) && Number.isFinite(total)) {
        if (total > 0) {
            progress.textContent = `${current} / ${total} 文`;
        } else {
            progress.textContent = "0 / 0 文";
        }
    }

    // 現在の文
    if (typeof playbackState.currentSentenceText === "string") {
        if (playbackState.currentSentenceText) {
            currentSentence.textContent = playbackState.currentSentenceText;
        } else if (playbackState.stopped) {
            currentSentence.textContent = "現在の文章はありません";
        }
    }

    // 速度
    const speed = Number(playbackState.playbackSpeed);

    if (Number.isFinite(speed)) {
        speedRange.value = String(speed);
        speedValue.textContent = speed.toFixed(2) + "x";
    }

    // 音量
    const volume = Number(playbackState.playbackVolume);

    if (Number.isFinite(volume)) {
        const volumePercent = Math.round(volume * 100);
        volumeRange.value = String(volumePercent);
        volumeValue.textContent = volumePercent + "%";
    }

    applyGenerationOptions(playbackState.generationOptions);

    // 再生状態
    if (playbackState.lastError || playbackState.playbackState === "error") {
        status.textContent = "読み上げエラー:\n" + (
            playbackState.lastError || "読み上げに失敗しました。"
        );
        return;
    }

    if (playbackState.stopped) {
        if (total > 0 && current >= total) {
            status.textContent = "読み上げ完了";
        } else {
            status.textContent = "停止しました";
        }

        return;
    }

    if (playbackState.paused) {
        status.textContent = "一時停止中";
        return;
    }

    if (playbackState.playbackState === "finished") {
        status.textContent = "読み上げ完了";
        return;
    }

    if (playbackState.playing) {
        status.textContent = "読み上げ中";
        return;
    }

    // 再生していない
    if (total === 0) {
        status.textContent = "待機中";
    }
}

// ================================================================================
// applyGenerationOptions
// 生成オプションをポップアップ入力へ反映する。
// ================================================================================
function applyGenerationOptions(options) {
    if (!options) {
        return;
    }

    if (typeof options.instruct === "string") {
        instructInput.value = options.instruct;
    }

    if (Number.isFinite(Number(options.num_step))) {
        numStepInput.value = String(options.num_step);
    }

    if (Number.isFinite(Number(options.guidance_scale))) {
        guidanceScaleInput.value = String(options.guidance_scale);
    }

    if (Number.isFinite(Number(options.t_shift))) {
        tShiftInput.value = String(options.t_shift);
    }

    if (Number.isFinite(Number(options.position_temperature))) {
        positionTemperatureInput.value = String(options.position_temperature);
    }

    if (Number.isFinite(Number(options.class_temperature))) {
        classTemperatureInput.value = String(options.class_temperature);
    }

    if (typeof options.denoise === "boolean") {
        denoiseInput.checked = options.denoise;
    }
}

// ================================================================================
// collectGenerationOptions
// ポップアップ入力から生成オプションを集める。
// ================================================================================
function collectGenerationOptions() {
    return {
        instruct: instructInput.value,
        num_step: Number(numStepInput.value),
        guidance_scale: Number(guidanceScaleInput.value),
        t_shift: Number(tShiftInput.value),
        position_temperature: Number(positionTemperatureInput.value),
        class_temperature: Number(classTemperatureInput.value),
        denoise: denoiseInput.checked
    };
}

// ================================================================================
// applySettingsToForm
// settings.json の内容をポップアップ入力へ反映する。
// ================================================================================
function applySettingsToForm(settings) {
    if (!settings) {
        return;
    }

    applyGenerationOptions(settings);

    const speed = Number(settings.playbackSpeed);

    if (Number.isFinite(speed)) {
        speedRange.value = String(speed);
        speedValue.textContent = speed.toFixed(2) + "x";
    }

    const volume = Number(settings.playbackVolume);

    if (Number.isFinite(volume)) {
        const volumePercent = Math.round(volume * 100);
        volumeRange.value = String(volumePercent);
        volumeValue.textContent = volumePercent + "%";
    }
}

// ================================================================================
// sendGenerationOptions
// 生成オプションを settings.json と offscreen へ送る。
// ================================================================================
async function sendGenerationOptions() {
    const value = collectGenerationOptions();

    try {
        await sendCommand("changeGenerationOptions", {
            value: value
        });
    } catch (error) {
        console.error("Generation options error:", error);
        status.textContent = "生成設定エラー:\n" + error.message;
    }
}

// ================================================================================
// restorePlaybackState
// ポップアップを開いたとき、進行中の読み上げ状態を復元する。
// ================================================================================
async function restorePlaybackState() {
    try {
        const settingsResponse = await sendCommand("reloadSettings");
        applySettingsToForm(settingsResponse && settingsResponse.settings);
    } catch (error) {
        console.warn("Failed to restore settings.json:", error);
    }

    try {
        const response = await sendCommand("getPlaybackState");

        if (response && response.state) {
            applyPlaybackState(response.state);
        }
    } catch (error) {
        console.log(
            "Playback state restore is not available yet:",
            error
        );
    }
}

// ================================================================================
// extractArticle
// 現在のタブから記事本文を抽出する。
// ================================================================================
async function extractArticle() {
    const tab = await getCurrentTab();

    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
    });

    const response = await chrome.tabs.sendMessage(tab.id, {
        action: "extractText"
    });

    if (!response || !response.success) {
        throw new Error("本文を抽出できませんでした。");
    }

    return response.text;
}

// ================================================================================
// extractButton クリック
// 本文抽出ボタンの処理。
// ================================================================================
extractButton.addEventListener("click", async () => {
    status.textContent = "本文を抽出しています……";
    result.textContent = "";

    try {
        const text = await extractArticle();
        result.textContent = text;
        status.textContent = `本文を抽出しました（${text.length}文字）`;
    } catch (error) {
        console.error(error);
        status.textContent = "抽出エラー:\n" + error.message;
    }
});

// ================================================================================
// readButton クリック
// ページ全体の読み上げを開始する。
// ================================================================================
readButton.addEventListener("click", async () => {
    status.textContent = "読み上げを開始しています……";

    try {
        const tab = await getCurrentTab();
        const response = await chrome.runtime.sendMessage({
            action: "startPageReading",
            tabId: tab.id
        });

        if (!response || !response.success) {
            throw new Error(
                response?.error || "読み上げを開始できませんでした。"
            );
        }

        status.textContent = "読み上げ中";

        if (typeof response.text === "string") {
            result.textContent = response.text;
        }
    } catch (error) {
        console.error(error);
        status.textContent = "読み上げエラー:\n" + error.message;
    }
});

// ================================================================================
// readSelectionButton クリック
// 選択テキストだけの読み上げを開始する。
// ================================================================================
readSelectionButton.addEventListener("click", async () => {
    status.textContent = "選択テキストを読み上げています……";

    try {
        const tab = await getCurrentTab();
        const response = await chrome.runtime.sendMessage({
            action: "startSelectionReading",
            tabId: tab.id
        });

        if (!response || !response.success) {
            throw new Error(
                response?.error || "選択テキストを読み上げできませんでした。"
            );
        }

        status.textContent = "読み上げ中";

        if (typeof response.text === "string") {
            result.textContent = response.text;
        }
    } catch (error) {
        console.error(error);
        status.textContent = "読み上げエラー:\n" + error.message;
    }
});

// ================================================================================
// pauseButton クリック
// 読み上げを一時停止する。
// ================================================================================
pauseButton.addEventListener("click", async () => {
    try {
        await sendCommand("pausePlayback");
        status.textContent = "一時停止中";
    } catch (error) {
        console.error(error);
        status.textContent = "一時停止エラー:\n" + error.message;
    }
});

// ================================================================================
// resumeButton クリック
// 一時停止中の読み上げを再開する。
// ================================================================================
resumeButton.addEventListener("click", async () => {
    try {
        await sendCommand("resumePlayback");
        status.textContent = "読み上げ中";
    } catch (error) {
        console.error(error);
        status.textContent = "再開エラー:\n" + error.message;
    }
});

// ================================================================================
// stopButton クリック
// 読み上げを停止し、表示を初期状態へ戻す。
// ================================================================================
stopButton.addEventListener("click", async () => {
    try {
        await sendCommand("stopPlayback");
        status.textContent = "停止しました";
        progress.textContent = "0 / 0 文";
        currentSentence.textContent = "現在の文章はありません";
        result.textContent = "";
    } catch (error) {
        console.error(error);
        status.textContent = "停止エラー:\n" + error.message;
    }
});

// ================================================================================
// speedRange 入力
// 再生速度を変更する。
// ================================================================================
speedRange.addEventListener("input", async () => {
    const value = Number(speedRange.value);
    speedValue.textContent = value.toFixed(2) + "x";

    try {
        await sendCommand("changeSpeed", { value: value });
    } catch (error) {
        console.error("Speed error:", error);
        status.textContent = "速度変更エラー:\n" + error.message;
    }
});

// ================================================================================
// volumeRange 入力
// 再生音量を変更する。
// ================================================================================
volumeRange.addEventListener("input", async () => {
    const value = Number(volumeRange.value);
    volumeValue.textContent = value + "%";

    try {
        await sendCommand("changeVolume", { value: value / 100 });
    } catch (error) {
        console.error("Volume error:", error);
        status.textContent = "音量変更エラー:\n" + error.message;
    }
});

// ================================================================================
// 生成設定の入力
// 変更した生成オプションを offscreen へ送る。
// ================================================================================
[
    instructInput,
    numStepInput,
    guidanceScaleInput,
    tShiftInput,
    positionTemperatureInput,
    classTemperatureInput
].forEach(input => {
    input.addEventListener("change", () => {
        sendGenerationOptions();
    });
});

denoiseInput.addEventListener("change", () => {
    sendGenerationOptions();
});

// ================================================================================
// onMessage
// Offscreen からの読み上げ進捗をポップアップへ反映する。
// ================================================================================
chrome.runtime.onMessage.addListener((message) => {
    if (message.action !== "readingProgress") {
        return;
    }

    const current = Number(message.current);
    const total = Number(message.total);

    if (!Number.isFinite(current) || !Number.isFinite(total)) {
        return;
    }

    progress.textContent = `${current} / ${total} 文`;

    if (typeof message.sentence === "string") {
        currentSentence.textContent = message.sentence;
    }

    if (message.state === "error") {
        status.textContent = "読み上げエラー:\n" + (
            message.error || "読み上げに失敗しました。"
        );
    } else if (message.state === "finished") {
        status.textContent = "読み上げ完了";
    } else if (message.state === "paused") {
        status.textContent = "一時停止中";
    } else if (message.state === "playing") {
        status.textContent = "読み上げ中";
    } else if (message.state === "starting") {
        status.textContent = "読み上げを開始しています……";
    } else if (message.state === "stopped") {
        status.textContent = "停止しました";
        progress.textContent = "0 / 0 文";
        currentSentence.textContent = "現在の文章はありません";
        result.textContent = "";
    }
});

// ================================================================================
// 初期化
// ポップアップ表示時に、現在の再生状態を復元する。
// ================================================================================
restorePlaybackState();

// ================================================================================
