// ================================================================================
// debug.js
//
// 拡張内の調査用ログ。Offscreen / popup のコンソールに同じ形式で出す。
// ================================================================================

// ================================================================================
// debugLog
// [時刻] [場所] メッセージ の形で出す。
// ================================================================================
export function debugLog(scope, message, extra) {
    const now = new Date();
    const time = [
        String(now.getHours()).padStart(2, "0"),
        String(now.getMinutes()).padStart(2, "0"),
        String(now.getSeconds()).padStart(2, "0")
    ].join(":") + "." + String(now.getMilliseconds()).padStart(3, "0");

    const prefix = `[${time}] [${scope}] ${message}`;

    if (extra !== undefined) {
        console.log(prefix, extra);
        return;
    }

    console.log(prefix);
}

// ================================================================================
// debugError
// 失敗を同じ形式で出す。
// ================================================================================
export function debugError(scope, message, extra) {
    const now = new Date();
    const time = [
        String(now.getHours()).padStart(2, "0"),
        String(now.getMinutes()).padStart(2, "0"),
        String(now.getSeconds()).padStart(2, "0")
    ].join(":") + "." + String(now.getMilliseconds()).padStart(3, "0");

    const prefix = `[${time}] [${scope}] ${message}`;

    if (extra !== undefined) {
        console.error(prefix, extra);
        return;
    }

    console.error(prefix);
}

// ================================================================================
