// ================================================================================
// extension_settings.js
//
// settings.json の読み書きと、ページへのフラグ配信。
// ================================================================================

const SERVER_URL = "http://127.0.0.1:8000";

let cachedSettings = null;

// ================================================================================
// getCachedSettings
// メモリ上の設定を返す。未読み込みなら null。
// ================================================================================
export function getCachedSettings() {
    return cachedSettings;
}

// ================================================================================
// setCachedSettings
// メモリ上の設定を差し替える。
// ================================================================================
export function setCachedSettings(settings) {
    cachedSettings = settings || null;
    return cachedSettings;
}

// ================================================================================
// defaultExtensionSettings
// 拡張設定の既定値を返す。
// ================================================================================
export function defaultExtensionSettings() {
    return {
        playbackSpeed: 1.0,
        playbackVolume: 1.0,
        instruct: "",
        num_step: 32,
        guidance_scale: 2.0,
        speed: 1.0,
        t_shift: 0.1,
        position_temperature: 5.0,
        class_temperature: 0.0,
        denoise: true,
        language: "auto",
        highlightSentence: false,
        autoReadChat: false
    };
}

// ================================================================================
// normalizeExtensionSettings
// 設定値を既定値と合成し、範囲を整える。
// ================================================================================
export function normalizeExtensionSettings(value) {
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

    const speed = Number(value.speed);

    if (Number.isFinite(speed) && speed > 0) {
        settings.speed = speed;
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

    if (typeof value.highlightSentence === "boolean") {
        settings.highlightSentence = value.highlightSentence;
    }

    if (typeof value.autoReadChat === "boolean") {
        settings.autoReadChat = value.autoReadChat;
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
export async function loadExtensionSettings() {
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
export async function writeExtensionSettings(settings) {
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
export async function persistExtensionSettings(patch) {
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
// getReaderFlags
// ページ側へ渡すハイライト／チャット自動のフラグを返す。
// ================================================================================
export async function getReaderFlags() {
    const settings = cachedSettings || await loadExtensionSettings();
    cachedSettings = settings;

    return {
        highlightSentence: Boolean(settings.highlightSentence),
        autoReadChat: Boolean(settings.autoReadChat)
    };
}

// ================================================================================
// broadcastReaderFlags
// 開いているページへ、ハイライトとチャット自動の設定を伝える。
// ================================================================================
export async function broadcastReaderFlags(settings) {
    const highlightSentence = Boolean(settings && settings.highlightSentence);
    const autoReadChat = Boolean(settings && settings.autoReadChat);
    let tabs = [];

    try {
        tabs = await chrome.tabs.query({});
    } catch (error) {
        return;
    }

    tabs.forEach((tab) => {
        if (!tab.id) {
            return;
        }

        chrome.tabs.sendMessage(tab.id, {
            action: "setHighlightSentence",
            value: highlightSentence
        }).catch(() => {});

        chrome.tabs.sendMessage(tab.id, {
            action: "setAutoReadChat",
            value: autoReadChat
        }).catch(() => {});
    });
}

// ================================================================================
