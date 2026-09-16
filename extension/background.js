// ================================================================================
// background.js
//
// 拡張のサービスワーカー。
// 本文抽出、選択読み上げ、Offscreen 再生、ページ上ハイライトへ中継する。
// ================================================================================

import { debugError, debugLog } from "./debug.js";
import { openReaderWindow } from "./reader_window.js";
import {
    broadcastReaderFlags,
    getCachedSettings,
    getReaderFlags,
    loadExtensionSettings,
    persistExtensionSettings,
    setCachedSettings
} from "./extension_settings.js";

const OFFSCREEN_DOCUMENT = "offscreen.html";

let currentReadingTabId = null;

// ================================================================================
// reply
// 非同期処理の結果を onMessage の sendResponse へ返す。
// ================================================================================
function reply(sendResponse, work) {
    Promise.resolve(work)
        .then((result) => {
            sendResponse(result);
        })
        .catch((error) => {
            sendResponse({
                success: false,
                error: error && error.message ? error.message : String(error)
            });
        });

    return true;
}

// ================================================================================
// fail
// 失敗をログに残して、同じ例外を投げ直す。
// ================================================================================
function fail(label, error) {
    debugError("background", label + " failed", {
        error: error && error.message ? error.message : String(error)
    });
    throw error;
}

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

    startReading(tab.id, "selection").catch((error) => {
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
// applyExtensionSettings
// settings.json を読み、Offscreen へ反映する。
// ================================================================================
async function applyExtensionSettings() {
    const settings = await loadExtensionSettings();
    setCachedSettings(settings);

    await forwardToOffscreen({
        action: "setSettings",
        value: settings
    });

    await broadcastReaderFlags(settings);

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

    if (message.action === "getReaderFlags") {
        return reply(
            sendResponse,
            getReaderFlags()
                .then((flags) => ({
                    success: true,
                    ...flags
                }))
                .catch((error) => ({
                    success: false,
                    error: error.message,
                    highlightSentence: false,
                    autoReadChat: false
                }))
        );
    }

    if (message.action === "changeReaderFlags") {
        return reply(
            sendResponse,
            persistExtensionSettings({
                highlightSentence: Boolean(message.highlightSentence),
                autoReadChat: Boolean(message.autoReadChat)
            })
                .then((settings) => broadcastReaderFlags(settings).then(() => settings))
                .then((settings) => ({
                    success: true,
                    settings: settings
                }))
                .catch((error) => fail("changeReaderFlags", error))
        );
    }

    if (message.action === "startProvidedReading") {
        const tabId = sender && sender.tab && sender.tab.id;

        return reply(
            sendResponse,
            startProvidedReading(tabId, message.text)
                .then((result) => ({
                    success: true,
                    text: result && result.text ? result.text : ""
                }))
                .catch((error) => fail("startProvidedReading", error))
        );
    }

    if (message.action === "startPageReading") {
        return reply(
            sendResponse,
            startReading(message.tabId, "page")
                .then((result) => ({
                    success: true,
                    text: result && result.text ? result.text : ""
                }))
                .catch((error) => fail("startPageReading", error))
        );
    }

    if (message.action === "startSelectionReading") {
        return reply(
            sendResponse,
            startReading(message.tabId, "selection")
                .then((result) => ({
                    success: true,
                    text: result && result.text ? result.text : ""
                }))
                .catch((error) => fail("startSelectionReading", error))
        );
    }

    if (message.action === "readingProgress") {
        forwardProgressToTab(message);
        return false;
    }

    if (message.action === "reloadSettings") {
        return reply(
            sendResponse,
            applyExtensionSettings().then((settings) => ({
                success: true,
                settings: settings
            }))
        );
    }

    if (message.action === "getPlaybackState") {
        return reply(
            sendResponse,
            forwardToOffscreen({ action: "getPlaybackState" })
                .then((response) => response || { success: true })
        );
    }

    if (message.action === "pausePlayback") {
        return reply(
            sendResponse,
            forwardToOffscreen({ action: "pauseReading" })
                .then((response) => response || { success: true })
        );
    }

    if (message.action === "resumePlayback") {
        return reply(
            sendResponse,
            forwardToOffscreen({ action: "resumeReading" })
                .then((response) => response || { success: true })
        );
    }

    if (message.action === "stopPlayback") {
        return reply(
            sendResponse,
            forwardToOffscreen({ action: "stopReading" })
                .then((response) => response || { success: true })
        );
    }

    if (message.action === "changeSpeed") {
        return reply(
            sendResponse,
            persistExtensionSettings({
                playbackSpeed: message.value
            })
                .then(() => forwardToOffscreen({
                    action: "setSpeed",
                    value: message.value
                }))
                .then((response) => response || { success: true })
        );
    }

    if (message.action === "changeGenerationOptions") {
        return reply(
            sendResponse,
            persistExtensionSettings(message.value || {})
                .then(() => forwardToOffscreen({
                    action: "setGenerationOptions",
                    value: message.value
                }))
                .then((response) => response || { success: true })
        );
    }

    if (message.action === "changeVolume") {
        return reply(
            sendResponse,
            persistExtensionSettings({
                playbackVolume: message.value
            })
                .then(() => forwardToOffscreen({
                    action: "setVolume",
                    value: message.value
                }))
                .then((response) => response || { success: true })
        );
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
    await createOffscreenDocument();

    await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content.js"]
    });

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
        lines: response.text.split(/\n+/).filter((line) => line.trim()).length
    });

    forwardToOffscreen({
        action: "startReading",
        text: response.text
    }).catch((error) => {
        debugError("background", "offscreen startReading failed", {
            error: error && error.message ? error.message : String(error)
        });
    });

    return {
        text: response.text
    };
}

// ================================================================================
// startProvidedReading
// 渡された本文を、そのまま Offscreen で読み上げる。
// ================================================================================
async function startProvidedReading(tabId, text) {
    const trimmed = String(text || "").trim();

    if (!trimmed) {
        throw new Error("本文が空です。");
    }

    if (tabId) {
        await setCurrentReadingTabId(tabId);
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ["content.js"]
        }).catch(() => {});
    }

    await createOffscreenDocument();

    forwardToOffscreen({
        action: "startReading",
        text: trimmed
    }).catch((error) => {
        debugError("background", "offscreen startReading failed", {
            error: error && error.message ? error.message : String(error)
        });
    });

    return {
        text: trimmed
    };
}

// ================================================================================
// forwardProgressToTab
// 現在の文を、読み上げ中タブの content script へ送ってハイライトする。
// ================================================================================
function forwardProgressToTab(message) {
    const settings = getCachedSettings();

    if (!settings || !settings.highlightSentence) {
        return;
    }

    getCurrentReadingTabId().then((tabId) => {
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

        await new Promise((resolve) => {
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

chrome.action.onClicked.addListener((tab) => {
    openReaderWindow(tab).catch((error) => {
        debugError("background", "openReaderWindow failed", {
            error: error && error.message ? error.message : String(error)
        });
    });
});

// ================================================================================
