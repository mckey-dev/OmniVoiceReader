// ================================================================================
// tts.js
//
// ローカル OmniVoice サーバーへ TTS リクエストを送る。
// ================================================================================

import { state, isSessionActive } from "./state.js";
import { debugError, debugLog } from "./debug.js";

// ================================================================================
// buildTtsRequest
// /tts に送る本文と、現在の生成オプションを組み立てる。
// ================================================================================
function buildTtsRequest(text) {
    const instruct = typeof state.instruct === "string"
        ? state.instruct.trim()
        : "";

    const body = {
        text: text,
        num_step: state.numStep,
        guidance_scale: state.guidanceScale,
        t_shift: state.tShift,
        position_temperature: state.positionTemperature,
        class_temperature: state.classTemperature,
        denoise: Boolean(state.denoise),
        language: state.language || "auto"
    };

    if (instruct) {
        body.instruct = instruct;
    }

    return body;
}

// ================================================================================
// generateAudio
// 1文の音声をサーバーから取得する。無効セッションや中断時は null を返す。
// ================================================================================
export async function generateAudio(text, sessionId) {

    // セッションが無効なら、すぐに無視する
    if (!isSessionActive(sessionId)) {
        return null;
    }

    const controller = new AbortController();
    state.activeControllers.add(controller);

    try {
        if (!isSessionActive(sessionId)) {
            return null;
        }

        const startedAt = Date.now();

        const requestId = `${sessionId}-${Date.now()}`;
        const body = buildTtsRequest(text);
        body.request_id = requestId;

        debugLog("tts", "request", {
            sessionId: sessionId,
            requestId: requestId,
            chars: text.length,
            language: body.language,
            preview: text.slice(0, 80)
        });

        const response = await fetch(state.SERVER_URL + "/tts", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body),
            signal: controller.signal
        });

        // セッションが変わっている可能性がある
        if (!isSessionActive(sessionId)) {
            return null;
        }

        if (!response.ok) {
            let message = "TTS request failed";

            try {
                const errorData = await response.json();

                if (errorData && errorData.detail) {
                    message = errorData.detail;
                }
            } catch (error) {
                // JSON の解析エラーは無視する。
            }

            throw new Error(message);
        }

        const blob = await response.blob();

        debugLog("tts", "response", {
            sessionId: sessionId,
            requestId: requestId,
            status: response.status,
            bytes: blob.size,
            ms: Date.now() - startedAt
        });

        // セッションを再確認する
        if (!isSessionActive(sessionId)) {
            debugLog("tts", "ignored stale session after response", {
                sessionId: sessionId
            });
            return null;
        }

        return blob;

    } catch (error) {

        // 意図的な中断
        if (error && error.name === "AbortError") {
            debugLog("tts", "cancelled", {
                sessionId: sessionId
            });
            return null;
        }

        // 古いセッション
        if (!isSessionActive(sessionId)) {
            return null;
        }

        debugError("tts", "request failed", {
            sessionId: sessionId,
            chars: String(text || "").length,
            error: error && error.message ? error.message : String(error)
        });

        // 実際のエラー
        throw error;

    } finally {
        state.activeControllers.delete(controller);
    }
}

// ================================================================================
