// ================================================================================
// chat_auto.js
//
// ChatGPT / Gemini で、新しく完成したアシスタント解答だけを読み上げる。
// ================================================================================

(function () {

    const TARGET_HOSTS = [
        "chatgpt.com",
        "chat.openai.com",
        "gemini.google.com"
    ];
    const SETTLE_MS = 800;
    const MIN_CHARS = 8;

    function isTargetHost() {
        const host = location.hostname.replace(/^www\./, "");
        return TARGET_HOSTS.some((item) => host === item || host.endsWith("." + item));
    }

    if (!isTargetHost()) {
        return;
    }

    let enabled = false;
    let observer = null;
    let settleTimer = null;
    let baselineText = "";
    let lastSentText = "";
    let lastSeenText = "";

    // ================================================================================
    // chatgptNodes
    // ChatGPT のアシスタント解答ノードを返す。
    // ================================================================================
    function chatgptNodes() {
        return Array.from(
            document.querySelectorAll('[data-message-author-role="assistant"]')
        );
    }

    // ================================================================================
    // geminiNodes
    // Gemini の解答らしいノードを返す。セレクタは複数候補。
    // ================================================================================
    function geminiNodes() {
        const selectors = [
            "model-response",
            '[data-test-id="model-response"]',
            "message-content",
            ".model-response-text",
            '[class*="model-response"]'
        ];
        const found = [];

        selectors.forEach((selector) => {
            document.querySelectorAll(selector).forEach((node) => {
                if (found.indexOf(node) === -1) {
                    found.push(node);
                }
            });
        });

        return found.filter((node) => {
            const text = (node.innerText || "").trim();
            return text.length >= MIN_CHARS;
        });
    }

    // ================================================================================
    // assistantNodes
    // いまのページの解答ノード一覧を返す。
    // ================================================================================
    function assistantNodes() {
        const chatgpt = chatgptNodes();

        if (chatgpt.length > 0) {
            return chatgpt;
        }

        return geminiNodes();
    }

    // ================================================================================
    // extractAnswerText
    // 解答ノードから、読み上げ用テキストを取る。コードとボタンは除く。
    // ================================================================================
    function extractAnswerText(node) {
        if (!node) {
            return "";
        }

        const clone = node.cloneNode(true);
        const removeSelectors = [
            "pre",
            "code",
            "button",
            "nav",
            "script",
            "style",
            "noscript",
            '[data-testid="reasoning"]',
            '[data-testid="thoughts"]'
        ];

        clone.querySelectorAll(removeSelectors.join(",")).forEach((element) => {
            element.remove();
        });

        return String(clone.innerText || clone.textContent || "")
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .join("\n");
    }

    // ================================================================================
    // isStreaming
    // まだ生成中なら true。
    // ================================================================================
    function isStreaming() {
        return Boolean(
            document.querySelector('[data-testid="stop-button"]') ||
            document.querySelector('button[aria-label*="Stop"]') ||
            document.querySelector('button[aria-label*="停止"]') ||
            document.querySelector('button[aria-label*="stop" i]')
        );
    }

    // ================================================================================
    // latestAnswer
    // 最新の解答ノードとテキストを返す。
    // ================================================================================
    function latestAnswer() {
        const nodes = assistantNodes();

        if (!nodes.length) {
            return null;
        }

        const node = nodes[nodes.length - 1];
        return {
            node: node,
            text: extractAnswerText(node)
        };
    }

    // ================================================================================
    // sendAnswer
    // 完成した解答を background へ渡す。
    // ================================================================================
    function sendAnswer(answer) {
        if (typeof window.__omniVoiceSetHighlightRoot === "function") {
            window.__omniVoiceSetHighlightRoot(answer.node);
        }

        chrome.runtime.sendMessage({
            action: "startProvidedReading",
            text: answer.text
        }, () => {
            if (chrome.runtime.lastError) {
                return;
            }
        });
    }

    // ================================================================================
    // maybeComplete
    // テキストが止まっていれば、新しい解答として読む。
    // ================================================================================
    function maybeComplete() {
        if (!enabled) {
            return;
        }

        const answer = latestAnswer();

        if (!answer || answer.text.length < MIN_CHARS) {
            return;
        }

        if (answer.text === baselineText || answer.text === lastSentText) {
            return;
        }

        if (isStreaming()) {
            clearTimeout(settleTimer);
            settleTimer = setTimeout(maybeComplete, SETTLE_MS);
            return;
        }

        lastSentText = answer.text;
        sendAnswer(answer);
    }

    // ================================================================================
    // onMutate
    // DOM 変化のあと、完成待ちタイマーをやり直す。
    // ================================================================================
    function onMutate() {
        if (!enabled) {
            return;
        }

        const answer = latestAnswer();
        const text = answer ? answer.text : "";

        if (text === lastSeenText) {
            return;
        }

        lastSeenText = text;
        clearTimeout(settleTimer);
        settleTimer = setTimeout(maybeComplete, SETTLE_MS);
    }

    // ================================================================================
    // startWatch
    // いまある解答を基準にして監視を始める。
    // ================================================================================
    function startWatch() {
        if (observer) {
            return;
        }

        const answer = latestAnswer();
        baselineText = answer ? answer.text : "";
        lastSentText = baselineText;
        lastSeenText = baselineText;

        observer = new MutationObserver(onMutate);
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    // ================================================================================
    // stopWatch
    // 監視を止める。
    // ================================================================================
    function stopWatch() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }

        clearTimeout(settleTimer);
        settleTimer = null;
    }

    // ================================================================================
    // setEnabled
    // 自動読み上げのオン／オフ。
    // ================================================================================
    function setEnabled(value) {
        enabled = Boolean(value);

        if (enabled) {
            startWatch();
            clearTimeout(settleTimer);
            settleTimer = setTimeout(maybeComplete, SETTLE_MS);
            return;
        }

        stopWatch();
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action !== "setAutoReadChat") {
            return false;
        }

        setEnabled(message.value);
        sendResponse({
            success: true,
            enabled: enabled
        });
        return true;
    });

    chrome.runtime.sendMessage({ action: "getReaderFlags" }, (response) => {
        if (chrome.runtime.lastError) {
            return;
        }

        if (response && response.autoReadChat) {
            setEnabled(true);
        }
    });

})();

// ================================================================================
