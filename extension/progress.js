// ================================================================================
// progress.js
//
// 読み上げ進捗を popup と background へ通知する。
// ================================================================================

// ================================================================================
// sendProgress
// 現在の文番号、全文数、再生状態、対象文を拡張へ送る。
// ================================================================================
export function sendProgress(
    current,
    total,
    state = "playing",
    sentence = "",
    extra = {}
) {
    try {
        const result = chrome.runtime.sendMessage({
            action: "readingProgress",
            current: current,
            total: total,
            state: state,
            sentence: sentence,
            error: extra && extra.error ? extra.error : ""
        });

        if (result && typeof result.catch === "function") {
            result.catch(() => {
                // ポップアップが閉じている場合がある。
                // 無視する。
            });
        }
    } catch (error) {
        // 拡張のコンテキストが消えている場合がある。
        // 無視する。
    }
}

// ================================================================================
