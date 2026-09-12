// ================================================================================
// state.js
//
// 読み上げの共有状態だけを管理する。
// 再生処理や Audio 操作はここには書かない。
// ================================================================================

export const state = {

    // サーバー
    SERVER_URL: "http://127.0.0.1:8000",

    // 再生状態
    stopped: false,
    paused: false,
    currentAudio: null,

    // 読み上げセッション
    readingSession: 0,

    // 文の状態
    //
    // currentSentenceIndex は 1 始まり。
    currentSentenceIndex: 0,
    currentSentenceTotal: 0,
    currentSentenceText: "",

    // テキスト
    currentText: "",
    currentSentences: [],

    // 直近の失敗。ポップアップ復元と調査用。
    lastError: "",

    // 再生設定
    playbackSpeed: 1.0,
    playbackVolume: 1.0,

    // 生成オプション
    instruct: "",
    numStep: 32,
    guidanceScale: 2.0,
    tShift: 0.1,
    positionTemperature: 5.0,
    classTemperature: 0.0,
    denoise: true,
    language: "auto",

    // TTS リクエストの管理
    activeControllers: new Set()
};

// ================================================================================
// sleep
// 指定ミリ秒だけ待機する。
// ================================================================================
export function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

// ================================================================================
// isSessionActive
// 指定セッションが、現在の有効な読み上げセッションかどうかを返す。
// ================================================================================
export function isSessionActive(sessionId) {
    return !state.stopped && sessionId === state.readingSession;
}

// ================================================================================
// cancelAllRequests
// 進行中の TTS リクエストをすべて中断する。
// ================================================================================
export function cancelAllRequests() {
    for (const controller of state.activeControllers) {
        try {
            controller.abort();
        } catch (error) {
            console.warn("Abort error:", error);
        }
    }

    state.activeControllers.clear();
}

// ================================================================================
// createNewSession
// 新しい読み上げセッション ID を発行する。
// ================================================================================
export function createNewSession() {
    state.readingSession++;
    return state.readingSession;
}

// ================================================================================
