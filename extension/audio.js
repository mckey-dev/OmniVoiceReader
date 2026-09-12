// ================================================================================
// audio.js
//
// 生成済み音声の再生、停止、一時停止、再開と、速度・音量の反映を担当する。
// ================================================================================

import { state, isSessionActive } from "./state.js";
import { debugError, debugLog } from "./debug.js";

// ================================================================================
// stopCurrentAudio
// 現在再生中の音声を停止し、playAudio の Promise を完了させる。
// ================================================================================
export function stopCurrentAudio() {
    if (!state.currentAudio) {
        return;
    }

    const audio = state.currentAudio;

    try {

        // 先に再生を停止する
        audio.pause();
        audio.currentTime = 0;

        // playAudio() に停止を通知する
        if (typeof audio._omniVoiceStop === "function") {
            audio._omniVoiceStop();
        }

    } catch (error) {
        debugError("audio", "stop failed", {
            error: error && error.message ? error.message : String(error)
        });
    }
}

// ================================================================================
// playAudio
// 生成済み音声 blob を再生する。終了または停止で Promise を完了する。
// ================================================================================
export function playAudio(blob, sessionId) {
    return new Promise((resolve, reject) => {
        if (!isSessionActive(sessionId) || !blob) {
            debugLog("audio", "skip play", {
                sessionId: sessionId,
                active: isSessionActive(sessionId),
                bytes: blob ? blob.size : 0
            });
            resolve();
            return;
        }

        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        state.currentAudio = audio;

        debugLog("audio", "play", {
            sessionId: sessionId,
            bytes: blob.size,
            speed: state.playbackSpeed,
            volume: state.playbackVolume
        });

        // 再生設定
        audio.volume = state.playbackVolume;
        audio.playbackRate = state.playbackSpeed;

        let finished = false;

        // ================================================================================
        // cleanup
        // 再生終了後の URL 解放と、currentAudio のクリアを行う。
        // ================================================================================
        function cleanup() {
            if (finished) {
                return;
            }

            finished = true;

            URL.revokeObjectURL(url);

            audio.onended = null;
            audio.onerror = null;
            audio._omniVoiceStop = null;

            if (state.currentAudio === audio) {
                state.currentAudio = null;
            }
        }

        // 正常終了
        audio.onended = () => {
            debugLog("audio", "ended", {
                sessionId: sessionId,
                seconds: Number.isFinite(audio.duration) ? audio.duration : null
            });
            cleanup();
            resolve();
        };

        // 再生エラー
        audio.onerror = () => {
            const code = audio.error && audio.error.code;
            debugError("audio", "element error", {
                sessionId: sessionId,
                code: code
            });
            cleanup();
            reject(new Error("Audio playback failed" + (code ? ` (${code})` : "")));
        };

        // 明示的な停止
        //
        // stopCurrentAudio() はブラウザの ended イベントに頼らず、
        // ここで停止を通知する。
        //
        // これにより playAudio() の Promise は、
        // 再生停止時に必ず完了する。
        audio._omniVoiceStop = () => {
            cleanup();
            resolve();
        };

        // 開始
        audio.play().catch(error => {
            debugError("audio", "play() rejected", {
                sessionId: sessionId,
                error: error && error.message ? error.message : String(error)
            });
            cleanup();
            reject(error);
        });
    });
}

// ================================================================================
// pauseCurrentAudio
// 現在再生中の音声を一時停止する。
// ================================================================================
export function pauseCurrentAudio() {
    if (!state.currentAudio) {
        return;
    }

    try {
        state.currentAudio.pause();
    } catch (error) {
        debugError("audio", "pause failed", {
            error: error && error.message ? error.message : String(error)
        });
    }
}

// ================================================================================
// resumeCurrentAudio
// 一時停止中の音声を再開する。
// ================================================================================
export async function resumeCurrentAudio() {
    if (!state.currentAudio) {
        return;
    }

    await state.currentAudio.play();
}

// ================================================================================
// updateCurrentAudioSpeed
// 再生中音声の速度を、現在の設定値へ反映する。
// ================================================================================
export function updateCurrentAudioSpeed() {
    if (!state.currentAudio) {
        return;
    }

    state.currentAudio.playbackRate = state.playbackSpeed;
}

// ================================================================================
// updateCurrentAudioVolume
// 再生中音声の音量を、現在の設定値へ反映する。
// ================================================================================
export function updateCurrentAudioVolume() {
    if (!state.currentAudio) {
        return;
    }

    state.currentAudio.volume = state.playbackVolume;
}

// ================================================================================
