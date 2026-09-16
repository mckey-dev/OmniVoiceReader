// ================================================================================
// reader_window.js
//
// 操作ウィンドウの位置決めと開閉。
// ================================================================================

const READER_WINDOW_URL = chrome.runtime.getURL("popup.html");
const READER_WINDOW_WIDTH = 380;
const READER_WINDOW_HEIGHT = 860;

// ================================================================================
// findReaderWindow
// 既に開いている操作ウィンドウがあれば返す。
// ================================================================================
async function findReaderWindow() {
    const windows = await chrome.windows.getAll({ populate: true });

    for (const win of windows) {
        if (win.type !== "popup") {
            continue;
        }

        const tab = win.tabs && win.tabs[0];
        const url = tab && tab.url ? tab.url : "";

        if (url === READER_WINDOW_URL || url.startsWith(READER_WINDOW_URL + "?")) {
            return win;
        }
    }

    return null;
}

// ================================================================================
// getPointerFromTab
// ページ上で最後に観測したマウス位置を取る。ツールバー上の座標は取れない。
// ================================================================================
async function getPointerFromTab(tab) {
    if (!tab || !tab.id) {
        return null;
    }

    try {
        const response = await chrome.tabs.sendMessage(tab.id, {
            action: "getPointerScreen"
        });

        if (
            response &&
            Number.isFinite(response.x) &&
            Number.isFinite(response.y) &&
            Number.isFinite(response.at) &&
            Date.now() - response.at < 3000
        ) {
            return {
                left: response.x,
                top: response.y
            };
        }
    } catch (error) {
        // chrome:// など、content script が無いタブ。
    }

    return null;
}

// ================================================================================
// getFallbackPosition
// 拡張ボタン付近（現在のブラウザ窓の右上）を返す。
// ================================================================================
async function getFallbackPosition(tab) {
    let win = null;

    try {
        if (tab && tab.windowId != null) {
            win = await chrome.windows.get(tab.windowId);
        } else {
            win = await chrome.windows.getLastFocused({
                windowTypes: ["normal"]
            });
        }
    } catch (error) {
        win = null;
    }

    if (!win) {
        return {
            left: 80,
            top: 80
        };
    }

    return {
        left: win.left + win.width - READER_WINDOW_WIDTH - 8,
        top: win.top + 88
    };
}

// ================================================================================
// getWorkArea
// 指定座標が載っているディスプレイの作業領域を返す。
// ================================================================================
async function getWorkArea(left, top) {
    try {
        const displays = await chrome.system.display.getInfo();
        const hit = displays.find((display) => {
            const area = display.workArea;
            return (
                left >= area.left &&
                top >= area.top &&
                left < area.left + area.width &&
                top < area.top + area.height
            );
        });
        const area = (hit || displays[0] || {}).workArea;

        if (area) {
            return area;
        }
    } catch (error) {
        // system.display が使えない環境。
    }

    return null;
}

// ================================================================================
// clampWindowPosition
// ウィンドウが画面外へ出ないよう位置を収める。
// ================================================================================
function clampWindowPosition(left, top, workArea) {
    if (!workArea) {
        return {
            left: Math.round(left),
            top: Math.round(top)
        };
    }

    const maxLeft = workArea.left + workArea.width - READER_WINDOW_WIDTH;
    const maxTop = workArea.top + workArea.height - READER_WINDOW_HEIGHT;

    return {
        left: Math.round(Math.max(workArea.left, Math.min(left, maxLeft))),
        top: Math.round(Math.max(workArea.top, Math.min(top, maxTop)))
    };
}

// ================================================================================
// resolveReaderWindowBounds
// カーソル位置、無ければ拡張ボタン付近の座標を返す。
// ================================================================================
async function resolveReaderWindowBounds(tab) {
    const pointer = await getPointerFromTab(tab);
    const fallback = await getFallbackPosition(tab);
    const left = pointer ? pointer.left : fallback.left;
    const top = pointer ? pointer.top : fallback.top;
    const workArea = await getWorkArea(left, top);

    return clampWindowPosition(left, top, workArea);
}

// ================================================================================
// openReaderWindow
// 拡張ボタン用の操作ウィンドウを、カーソル位置に開く。既にあればそこへ移す。
// ================================================================================
export async function openReaderWindow(tab) {
    const bounds = await resolveReaderWindowBounds(tab);
    const existing = await findReaderWindow();

    if (existing) {
        await chrome.windows.update(existing.id, {
            focused: true,
            left: bounds.left,
            top: bounds.top
        });
        return existing;
    }

    return chrome.windows.create({
        url: READER_WINDOW_URL,
        type: "popup",
        width: READER_WINDOW_WIDTH,
        height: READER_WINDOW_HEIGHT,
        left: bounds.left,
        top: bounds.top,
        focused: true
    });
}

// ================================================================================
