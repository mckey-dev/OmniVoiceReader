// ================================================================================
// offscreen.js
//
// Offscreen 再生の司令塔。popup を閉じても音声を継続する。
// 実際の処理は playback.js などへ委譲する。
// 「前の文」「次の文」「この文から再生」は使用しない。
// ================================================================================

import { state } from "./state.js";
import { debugError } from "./debug.js";
import { sendProgress } from "./progress.js";

import {
    startReading,
    pauseReading,
    resumeReading,
    stopReading,
    setSpeed,
    setVolume,
    getGenerationOptions,
    setGenerationOptions
} from "./playback.js";

// ================================================================================
// onMessage
// Offscreen 向けの読み上げ・状態取得・再生制御メッセージを処理する。
// ================================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.target !== "offscreen") {
        return false;
    }

    // 準備確認
    if (message.action === "ping") {
        sendResponse({ success: true });
        return false;
    }

    // 読み上げ開始
    //
    // 全文の再生完了まで sendResponse を待つと、
    // メッセージ経路が閉じて Chrome がエラーにする。
    if (message.action === "startReading") {
        startReading(message.text).catch(error => {
            debugError("offscreen", "startReading failed", {
                error: error && error.message ? error.message : String(error)
            });
            sendProgress(
                state.currentSentenceIndex,
                state.currentSentenceTotal,
                "error",
                state.currentSentenceText,
                {
                    error: error && error.message ? error.message : String(error)
                }
            );
        });

        sendResponse({
            success: true,
            started: true
        });

        return false;
    }

    // 現在の再生状態を取得する
    if (message.action === "getPlaybackState") {
        try {
            const current = Number(state.currentSentenceIndex);
            const total = Number(state.currentSentenceTotal);
            const stopped = Boolean(state.stopped);
            const paused = Boolean(state.paused);

            const sentenceText = typeof state.currentSentenceText === "string"
                ? state.currentSentenceText
                : "";

            const currentText = typeof state.currentText === "string"
                ? state.currentText
                : "";

            // 現在の再生状態を判定する
            //
            // state.js にはまだ専用の playbackStatus が
            // ないため、現在の状態から判定する。
            //
            // 完了:
            //   ・全文数が 0 より大きい
            //   ・現在文番号が全文数に到達
            //   ・現在の文章が空
            //
            // 最後の文を再生中は currentSentenceText が
            // 残っているため、完了判定にはならない。
            let playbackState = "stopped";

            if (state.lastError) {
                playbackState = "error";
            } else if (stopped) {
                playbackState = "stopped";
            } else if (paused) {
                playbackState = "paused";
            } else if (total > 0 && current >= total && sentenceText === "") {
                playbackState = "finished";
            } else if (total > 0) {
                playbackState = "playing";
            }

            sendResponse({
                success: true,
                state: {

                    // 全文
                    currentText: currentText,

                    // 文の状態
                    currentSentenceIndex: current,
                    currentSentenceTotal: total,
                    currentSentenceText: sentenceText,

                    // 再生状態
                    stopped: stopped,
                    paused: paused,
                    playing: playbackState === "playing",
                    playbackState: playbackState,

                    // 設定
                    playbackSpeed: state.playbackSpeed,
                    playbackVolume: state.playbackVolume,
                    generationOptions: getGenerationOptions(),
                    lastError: state.lastError || ""
                }
            });

        } catch (error) {
            debugError("offscreen", "getPlaybackState failed", {
                error: error && error.message ? error.message : String(error)
            });
            sendResponse({
                success: false,
                error: error.message
            });
        }

        return true;
    }

    // 一時停止
    if (message.action === "pauseReading") {
        try {
            pauseReading();
            sendResponse({ success: true });
        } catch (error) {
            console.error("pauseReading error:", error);
            sendResponse({
                success: false,
                error: error.message
            });
        }

        return true;
    }

    // 再開
    if (message.action === "resumeReading") {
        resumeReading()
            .then(() => {
                sendResponse({ success: true });
            })
            .catch(error => {
                console.error("resumeReading error:", error);
                sendResponse({
                    success: false,
                    error: error.message
                });
            });

        return true;
    }

    // 停止
    if (message.action === "stopReading") {
        try {
            stopReading();
            sendResponse({ success: true });
        } catch (error) {
            console.error("stopReading error:", error);
            sendResponse({
                success: false,
                error: error.message
            });
        }

        return true;
    }

    // 速度
    if (message.action === "setSpeed") {
        try {
            setSpeed(message.value);
            sendResponse({
                success: true,
                value: state.playbackSpeed
            });
        } catch (error) {
            console.error("setSpeed error:", error);
            sendResponse({
                success: false,
                error: error.message
            });
        }

        return true;
    }

    // 音量
    if (message.action === "setVolume") {
        try {
            setVolume(message.value);
            sendResponse({
                success: true,
                value: state.playbackVolume
            });
        } catch (error) {
            console.error("setVolume error:", error);
            sendResponse({
                success: false,
                error: error.message
            });
        }

        return true;
    }

    // 設定ファイルの内容をまとめて反映する
    if (message.action === "setSettings") {
        try {
            const value = message.value || {};
            setSpeed(value.playbackSpeed);
            setVolume(value.playbackVolume);

            sendResponse({
                success: true,
                value: {
                    ...setGenerationOptions(value),
                    playbackSpeed: state.playbackSpeed,
                    playbackVolume: state.playbackVolume
                }
            });
        } catch (error) {
            console.error("setSettings error:", error);
            sendResponse({
                success: false,
                error: error.message
            });
        }

        return true;
    }

    // 生成オプション
    if (message.action === "setGenerationOptions") {
        try {
            sendResponse({
                success: true,
                value: setGenerationOptions(message.value || {})
            });
        } catch (error) {
            console.error("setGenerationOptions error:", error);
            sendResponse({
                success: false,
                error: error.message
            });
        }

        return true;
    }

    // 不明なメッセージ
    return false;
});

// ================================================================================
