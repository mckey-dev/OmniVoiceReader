// ================================================================================
// background.js
//
// 拡張のサービスワーカー。
// 本文抽出、選択読み上げ、Offscreen 再生、ページ上ハイライトへ中継する。
// ================================================================================

const OFFSCREEN_DOCUMENT = "offscreen.html";
const SERVER_URL = "http://127.0.0.1:8000";

// ================================================================================
// debugLog / debugError
// service worker 用。offscreen の debug.js と同じ形。
// ================================================================================
function debugLog(scope, message, extra) {
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

function debugError(scope, message, extra) {
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

let currentReadingTabId = null;
let cachedSettings = null;

// ================================================================================
// setCurrentReadingTabId
// 読み上げ中タブ ID をメモリと session storage に保存する。
// ================================================================================
async function setCurrentReadingTabId(tabId) {
    currentReadingTabId = tabId || null;

    try {
        await chrome.storage.session.set({
            currentReadingTabId: currentReadingTabId
        });
    } catch (error) {
        console.warn("Failed to persist currentReadingTabId:", error);
    }
}

// ================================================================================
// getCurrentReadingTabId
// 読み上げ中タブ ID をメモリ、なければ session storage から取得する。
// ================================================================================
async function getCurrentReadingTabId() {
    if (currentReadingTabId) {
        return currentReadingTabId;
    }

    try {
        const data = await chrome.storage.session.get("currentReadingTabId");
        currentReadingTabId = data.currentReadingTabId || null;
    } catch (error) {
        console.warn("Failed to restore currentReadingTabId:", error);
    }

    return currentReadingTabId;
}

// ================================================================================
// registerContextMenus
// 「選択テキストを読み上げ」の右クリックメニューを登録する。
// ================================================================================
function registerContextMenus() {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: "omnivoice-read-selection",
            title: "選択テキストを読み上げ",
            contexts: ["selection"]
        });
    });
}

registerContextMenus();
getCurrentReadingTabId();

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== "omnivoice-read-selection") {
        return;
    }

    if (!tab || !tab.id) {
        return;
    }

    startReading(tab.id, "selection").catch(error => {
        debugError("background", "startSelectionReading failed", {
            error: error && error.message ? error.message : String(error)
        });
    });
});

// ================================================================================
// createOffscreenDocument
// 音声再生用の Offscreen ドキュメントを、未作成なら作成する。
// ================================================================================
async function createOffscreenDocument() {
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT)]
    });

    if (existingContexts.length > 0) {
        return;
    }

    await chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT,
        reasons: ["AUDIO_PLAYBACK"],
        justification:
            "OmniVoice TTS audio playback must continue after the popup closes."
    });

    await waitForOffscreenReady();
    await applyExtensionSettings();
}

// ================================================================================
// defaultExtensionSettings
// 拡張設定の既定値を返す。
// ================================================================================
function defaultExtensionSettings() {
    return {
        playbackSpeed: 1.0,
        playbackVolume: 1.0,
        instruct: "",
        num_step: 32,
        guidance_scale: 2.0,
        t_shift: 0.1,
        position_temperature: 5.0,
        class_temperature: 0.0,
        denoise: true,
        language: "auto"
    };
}

// ================================================================================
// normalizeExtensionSettings
// 設定値を既定値と合成し、範囲を整える。
// ================================================================================
function normalizeExtensionSettings(value) {
    const settings = defaultExtensionSettings();

    if (!value || typeof value !== "object") {
        return settings;
    }

    if (typeof value.instruct === "string") {
        settings.instruct = value.instruct;
    }

    const numStep = Number(value.num_step);

    if (Number.isFinite(numStep) && numStep >= 1) {
        settings.num_step = Math.round(numStep);
    }

    const guidanceScale = Number(value.guidance_scale);

    if (Number.isFinite(guidanceScale) && guidanceScale >= 0) {
        settings.guidance_scale = guidanceScale;
    }

    const tShift = Number(value.t_shift);

    if (Number.isFinite(tShift) && tShift >= 0) {
        settings.t_shift = tShift;
    }

    const positionTemperature = Number(value.position_temperature);

    if (Number.isFinite(positionTemperature) && positionTemperature >= 0) {
        settings.position_temperature = positionTemperature;
    }

    const classTemperature = Number(value.class_temperature);

    if (Number.isFinite(classTemperature) && classTemperature >= 0) {
        settings.class_temperature = classTemperature;
    }

    if (typeof value.denoise === "boolean") {
        settings.denoise = value.denoise;
    }

    if (typeof value.language === "string") {
        const language = value.language.trim();
        const aliases = {
            auto: "auto",
            detect: "auto",
            ja: "Japanese",
            jp: "Japanese",
            japanese: "Japanese",
            en: "English",
            english: "English",
            none: "none"
        };
        const mapped = aliases[language.toLowerCase()];

        if (mapped) {
            settings.language = mapped;
        } else if (language) {
            settings.language = language;
        }
    }

    const playbackSpeed = Number(value.playbackSpeed);

    if (Number.isFinite(playbackSpeed)) {
        settings.playbackSpeed = Math.max(0.5, Math.min(2.0, playbackSpeed));
    }

    const playbackVolume = Number(value.playbackVolume);

    if (Number.isFinite(playbackVolume)) {
        settings.playbackVolume = Math.max(0, Math.min(1, playbackVolume));
    }

    return settings;
}

// ================================================================================
// loadExtensionSettings
// サーバーの settings.json を読む。失敗時は拡張内のファイルを使う。
// ================================================================================
async function loadExtensionSettings() {
    try {
        const response = await fetch(SERVER_URL + "/extension/settings");

        if (response.ok) {
            const data = await response.json();
            return normalizeExtensionSettings(data && data.settings);
        }
    } catch (error) {
        console.warn("Failed to load settings from server:", error);
    }

    try {
        const response = await fetch(chrome.runtime.getURL("settings.json"));

        if (response.ok) {
            return normalizeExtensionSettings(await response.json());
        }
    } catch (error) {
        console.warn("Failed to load bundled settings.json:", error);
    }

    return defaultExtensionSettings();
}

// ================================================================================
// writeExtensionSettings
// サーバー経由で settings.json に保存する。
// ================================================================================
async function writeExtensionSettings(settings) {
    const response = await fetch(SERVER_URL + "/extension/settings", {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(settings)
    });

    if (!response.ok) {
        throw new Error("設定ファイルの保存に失敗しました。");
    }

    const data = await response.json();
    return normalizeExtensionSettings(data && data.settings);
}

// ================================================================================
// persistExtensionSettings
// 設定の一部を更新し、settings.json へ保存する。
// ================================================================================
async function persistExtensionSettings(patch) {
    const current = cachedSettings || await loadExtensionSettings();

    cachedSettings = normalizeExtensionSettings({
        ...current,
        ...patch
    });

    try {
        cachedSettings = await writeExtensionSettings(cachedSettings);
    } catch (error) {
        console.warn("Failed to save settings.json:", error);
    }

    return cachedSettings;
}

// ================================================================================
// applyExtensionSettings
// settings.json を読み、Offscreen へ反映する。
// ================================================================================
async function applyExtensionSettings() {
    const settings = await loadExtensionSettings();
    cachedSettings = settings;

    await forwardToOffscreen({
        action: "setSettings",
        value: settings
    });

    return settings;
}

// ================================================================================
// onMessage
// popup からの操作と、Offscreen からの進捗通知を処理する。
// ================================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.target === "offscreen") {
        return false;
    }

    // ページの読み上げを開始する
    if (message.action === "startPageReading") {
        startReading(message.tabId, "page")
            .then(result => {
                sendResponse({
                    success: true,
                    text: result && result.text ? result.text : ""
                });
            })
            .catch(error => {
                debugError("background", "startPageReading failed", {
                    error: error && error.message ? error.message : String(error)
                });
                sendResponse({
                    success: false,
                    error: error.message
                });
            });

        return true;
    }

    // 選択テキストの読み上げを開始する
    if (message.action === "startSelectionReading") {
        startReading(message.tabId, "selection")
            .then(result => {
                sendResponse({
                    success: true,
                    text: result && result.text ? result.text : ""
                });
            })
            .catch(error => {
                debugError("background", "startSelectionReading failed", {
                    error: error && error.message ? error.message : String(error)
                });
                sendResponse({
                    success: false,
                    error: error.message
                });
            });

        return true;
    }

    // 進捗をページへ送り、文をハイライトする
    if (message.action === "readingProgress") {
        forwardProgressToTab(message);
        return false;
    }

    // 設定ファイルを読み直して Offscreen へ反映する
    if (message.action === "reloadSettings") {
        applyExtensionSettings()
            .then(settings => {
                sendResponse({
                    success: true,
                    settings: settings
                });
            })
            .catch(error => {
                console.error("reloadSettings error:", error);
                sendResponse({
                    success: false,
                    error: error.message
                });
            });

        return true;
    }

    // 現在の再生状態を取得する
    if (message.action === "getPlaybackState") {
        forwardToOffscreen({ action: "getPlaybackState" })
            .then(response => {
                sendResponse(response || { success: true });
            })
            .catch(error => {
                console.error("getPlaybackState error:", error);
                sendResponse({
                    success: false,
                    error: error.message
                });
            });

        return true;
    }

    // 一時停止
    if (message.action === "pausePlayback") {
        forwardToOffscreen({ action: "pauseReading" })
            .then(response => {
                sendResponse(response || { success: true });
            })
            .catch(error => {
                console.error("pausePlayback error:", error);
                sendResponse({
                    success: false,
                    error: error.message
                });
            });

        return true;
    }

    // 再開
    if (message.action === "resumePlayback") {
        forwardToOffscreen({ action: "resumeReading" })
            .then(response => {
                sendResponse(response || { success: true });
            })
            .catch(error => {
                console.error("resumePlayback error:", error);
                sendResponse({
                    success: false,
                    error: error.message
                });
            });

        return true;
    }

    // 停止
    if (message.action === "stopPlayback") {
        forwardToOffscreen({ action: "stopReading" })
            .then(response => {
                sendResponse(response || { success: true });
            })
            .catch(error => {
                console.error("stopPlayback error:", error);
                sendResponse({
                    success: false,
                    error: error.message
                });
            });

        return true;
    }

    // 速度
    if (message.action === "changeSpeed") {
        persistExtensionSettings({
            playbackSpeed: message.value
        })
            .then(() => forwardToOffscreen({
                action: "setSpeed",
                value: message.value
            }))
            .then(response => {
                sendResponse(response || { success: true });
            })
            .catch(error => {
                console.error("changeSpeed error:", error);
                sendResponse({
                    success: false,
                    error: error.message
                });
            });

        return true;
    }

    // 生成オプション
    if (message.action === "changeGenerationOptions") {
        persistExtensionSettings(message.value || {})
            .then(() => forwardToOffscreen({
                action: "setGenerationOptions",
                value: message.value
            }))
            .then(response => {
                sendResponse(response || { success: true });
            })
            .catch(error => {
                console.error("changeGenerationOptions error:", error);
                sendResponse({
                    success: false,
                    error: error.message
                });
            });

        return true;
    }

    // 音量
    if (message.action === "changeVolume") {
        persistExtensionSettings({
            playbackVolume: message.value
        })
            .then(() => forwardToOffscreen({
                action: "setVolume",
                value: message.value
            }))
            .then(response => {
                sendResponse(response || { success: true });
            })
            .catch(error => {
                console.error("changeVolume error:", error);
                sendResponse({
                    success: false,
                    error: error.message
                });
            });

        return true;
    }

    return false;
});

// ================================================================================
// startReading
// 対象タブから本文または選択テキストを取得し、Offscreen で読み上げを開始する。
// ================================================================================
async function startReading(tabId, mode = "page") {
    debugLog("background", "startReading", {
        tabId: tabId,
        mode: mode
    });

    if (!tabId) {
        throw new Error("読み上げ対象のタブを取得できませんでした。");
    }

    await setCurrentReadingTabId(tabId);

    // Offscreen ドキュメントを作成する
    await createOffscreenDocument();

    // content.js を注入する
    await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content.js"]
    });

    // 本文または選択テキストを抽出する
    const extractAction = mode === "selection"
        ? "extractSelection"
        : "extractText";

    const response = await chrome.tabs.sendMessage(tabId, {
        action: extractAction
    });

    if (!response || !response.success) {
        throw new Error(
            (response && response.error) ||
            (
                mode === "selection"
                    ? "選択テキストを取得できませんでした。"
                    : "本文を抽出できませんでした。"
            )
        );
    }

    if (!response.text || !response.text.trim()) {
        throw new Error(
            mode === "selection"
                ? "選択されたテキストが空です。"
                : "本文が空です。"
        );
    }

    debugLog("background", "extracted", {
        mode: mode,
        chars: response.text.length,
        lines: response.text.split(/\n+/).filter(line => line.trim()).length
    });

    // Offscreen で読み上げを開始する
    forwardToOffscreen({
        action: "startReading",
        text: response.text
    }).catch(error => {
        debugError("background", "offscreen startReading failed", {
            error: error && error.message ? error.message : String(error)
        });
    });

    return {
        text: response.text
    };
}

// ================================================================================
// forwardProgressToTab
// 現在の文を、読み上げ中タブの content script へ送ってハイライトする。
// ================================================================================
function forwardProgressToTab(message) {
    getCurrentReadingTabId().then(tabId => {
        if (!tabId) {
            return;
        }

        return chrome.tabs.sendMessage(tabId, {
            action: "highlightSentence",
            sentence: message.sentence || "",
            state: message.state || "",
            current: message.current,
            total: message.total
        }).catch(() => {
            // タブが閉じられたか、別ページへ移動した。
        });
    });
}

// ================================================================================
// waitForOffscreenReady
// Offscreen の listener が使えるまで待つ。
// ================================================================================
async function waitForOffscreenReady(timeoutMs = 4000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        try {
            const response = await chrome.runtime.sendMessage({
                target: "offscreen",
                action: "ping"
            });

            if (response && response.success) {
                return;
            }
        } catch (error) {
            // Offscreen の listener がまだ無い
        }

        await new Promise(resolve => {
            setTimeout(resolve, 50);
        });
    }

    throw new Error("Offscreen ドキュメントの準備が完了しませんでした。");
}

// ================================================================================
// forwardToOffscreen
// Offscreen ドキュメントへメッセージを転送する。
// ================================================================================
async function forwardToOffscreen(message) {
    await createOffscreenDocument();
    return await chrome.runtime.sendMessage({
        ...message,
        target: "offscreen"
    });
}

// ================================================================================
