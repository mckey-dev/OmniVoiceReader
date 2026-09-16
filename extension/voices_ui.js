// ================================================================================
// voices_ui.js
//
// 操作ウィンドウの「声」一覧・選択・削除・アップロード。
// ================================================================================

const SERVER_URL = "http://127.0.0.1:8000";
const voiceSettings = document.getElementById("voiceSettings");
const voiceSummaryLabel = document.getElementById("voiceSummaryLabel");
const voiceEmpty = document.getElementById("voiceEmpty");
const voiceList = document.getElementById("voiceList");
const voiceNameInput = document.getElementById("voiceNameInput");
const voiceFileInput = document.getElementById("voiceFileInput");
const voiceUploadButton = document.getElementById("voiceUploadButton");
const voiceStatus = document.getElementById("voiceStatus");
let voiceBusy = false;

// ================================================================================
// voiceErrorMessage
// サーバー応答から表示用のエラー文を取り出す。
// ================================================================================
function voiceErrorMessage(error, fallback) {
    const message = error && error.message ? error.message : "";

    if (/fetch/i.test(message)) {
        return "サーバーに接続できません";
    }

    if (message) {
        return message;
    }

    return fallback;
}

// ================================================================================
// readVoiceResponse
// /voices の JSON を読む。失敗時は例外。
// ================================================================================
async function readVoiceResponse(response, fallback) {
    let data = null;

    try {
        data = await response.json();
    } catch (error) {
        data = null;
    }

    if (!response.ok) {
        const detail = data && data.detail;

        if (typeof detail === "string" && detail) {
            throw new Error(detail);
        }

        throw new Error(fallback);
    }

    return data;
}

// ================================================================================
// updateVoiceSummary
// 折りたたみ見出しに、選択中の声名を添える。
// ================================================================================
function updateVoiceSummary(catalog) {
    const name = catalog && catalog.active_name;

    if (name) {
        voiceSummaryLabel.textContent = "声　" + name;
        return;
    }

    voiceSummaryLabel.textContent = "声";
}

// ================================================================================
// setVoiceBusy
// アップロード中は入力を止める。
// ================================================================================
function setVoiceBusy(busy) {
    voiceBusy = busy;
    voiceUploadButton.disabled = busy;
    voiceFileInput.disabled = busy;
    voiceNameInput.disabled = busy;

    voiceList.querySelectorAll("input, button").forEach((element) => {
        element.disabled = busy;
    });
}

window.addEventListener("beforeunload", (event) => {
    if (!voiceBusy) {
        return;
    }

    event.preventDefault();
    event.returnValue = "";
});

// ================================================================================
// renderVoiceList
// 声のラジオ一覧を描く。
// ================================================================================
function renderVoiceList(catalog) {
    const voices = (catalog && catalog.voices) || [];

    voiceList.innerHTML = "";
    voiceEmpty.hidden = voices.length > 0;

    voices.forEach((voice) => {
        const row = document.createElement("div");
        row.className = "voice-row";

        const label = document.createElement("label");
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "activeVoice";
        radio.value = voice.id;
        radio.checked = Boolean(voice.active);

        radio.addEventListener("change", () => {
            if (radio.checked) {
                selectVoice(voice.id);
            }
        });

        const title = document.createElement("span");
        title.textContent = voice.name || voice.stem || voice.id;

        label.appendChild(radio);
        label.appendChild(title);

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.textContent = "削除";
        removeButton.addEventListener("click", () => {
            deleteVoice(voice.id, voice.name || voice.stem);
        });

        row.appendChild(label);
        row.appendChild(removeButton);
        voiceList.appendChild(row);
    });

    updateVoiceSummary(catalog);
}

// ================================================================================
// refreshVoices
// サーバーから声一覧を取る。
// ================================================================================
async function refreshVoices() {
    try {
        const response = await fetch(SERVER_URL + "/voices");
        const catalog = await readVoiceResponse(
            response,
            "声一覧を取得できませんでした。"
        );
        renderVoiceList(catalog);
        voiceStatus.textContent = catalog.active_name
            ? "準備完了"
            : (catalog.voices && catalog.voices.length
                ? "使う声を選んでください。"
                : "");
    } catch (error) {
        renderVoiceList({ voices: [], active_name: "" });
        voiceStatus.textContent = "サーバーに接続できません";
        console.warn("Failed to load voices:", error);
    }
}

// ================================================================================
// selectVoice
// 使う声を切り替える。
// ================================================================================
async function selectVoice(voiceId) {
    if (voiceBusy) {
        return;
    }

    setVoiceBusy(true);

    try {
        const response = await fetch(
            SERVER_URL + "/voices/" + encodeURIComponent(voiceId) + "/select",
            { method: "PUT" }
        );
        const catalog = await readVoiceResponse(
            response,
            "声を選べませんでした。"
        );
        renderVoiceList(catalog);
        voiceStatus.textContent = "準備完了";
    } catch (error) {
        voiceStatus.textContent = voiceErrorMessage(error, "声を選べませんでした。");
        await refreshVoices();
    } finally {
        setVoiceBusy(false);
    }
}

// ================================================================================
// deleteVoice
// 声を削除する。
// ================================================================================
async function deleteVoice(voiceId, voiceName) {
    if (voiceBusy) {
        return;
    }

    const label = voiceName || "この声";

    if (!window.confirm(label + " を削除しますか？")) {
        return;
    }

    setVoiceBusy(true);

    try {
        const response = await fetch(
            SERVER_URL + "/voices/" + encodeURIComponent(voiceId),
            { method: "DELETE" }
        );
        const catalog = await readVoiceResponse(
            response,
            "声を削除できませんでした。"
        );
        renderVoiceList(catalog);
        voiceStatus.textContent = catalog.active_name ? "準備完了" : "";
    } catch (error) {
        voiceStatus.textContent = voiceErrorMessage(error, "声を削除できませんでした。");
        await refreshVoices();
    } finally {
        setVoiceBusy(false);
    }
}

// ================================================================================
// uploadVoice
// 参照音声を送り、変換・書き起こし・プロンプト作成まで待つ。
// ================================================================================
async function uploadVoice() {
    if (voiceBusy) {
        return;
    }

    const file = voiceFileInput.files && voiceFileInput.files[0];

    if (!file) {
        voiceStatus.textContent = "音声ファイルを選んでください。";
        return;
    }

    voiceSettings.open = true;
    setVoiceBusy(true);
    voiceStatus.textContent = "変換・書き起こし・プロンプトを作成しています。";

    const body = new FormData();
    body.append("file", file, file.name);

    const name = voiceNameInput.value.trim();

    if (name) {
        body.append("name", name);
    }

    try {
        const response = await fetch(SERVER_URL + "/voices", {
            method: "POST",
            body: body
        });
        const catalog = await readVoiceResponse(
            response,
            "声の準備に失敗しました。"
        );
        renderVoiceList(catalog);
        voiceFileInput.value = "";
        voiceNameInput.value = "";
        voiceStatus.textContent = "準備完了";
    } catch (error) {
        voiceStatus.textContent = voiceErrorMessage(error, "声の準備に失敗しました。");
        await refreshVoices();
    } finally {
        setVoiceBusy(false);
    }
}

voiceUploadButton.addEventListener("click", () => {
    uploadVoice();
});

// ================================================================================
