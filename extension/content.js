// ================================================================================
// content.js
//
// Web ページ上で本文・選択テキストの抽出と、現在文のハイライトを行う。
// ================================================================================

(function () {

    if (window.__omniVoiceContentReady) {
        return;
    }

    window.__omniVoiceContentReady = true;

    const HIGHLIGHT_CLASS = "omnivoice-current-sentence";
    const HIGHLIGHT_STYLE_ID = "omnivoice-highlight-style";

    if (!window.__omniVoicePageState) {
        window.__omniVoicePageState = {
            highlightRoot: null,
            lastMatchEnd: 0,
            lastSelectionText: "",
            lastSelectionRange: null
        };
    }

    const pageState = window.__omniVoicePageState;

    // ================================================================================
    // ensureHighlightStyle
    // 現在文ハイライト用の CSS を、未挿入ならページへ追加する。
    // ================================================================================
    function ensureHighlightStyle() {
        if (document.getElementById(HIGHLIGHT_STYLE_ID)) {
            return;
        }

        const style = document.createElement("style");
        style.id = HIGHLIGHT_STYLE_ID;
        style.textContent = `
            mark.${HIGHLIGHT_CLASS} {
                background: rgba(253, 224, 71, 0.85) !important;
                box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.85);
                border-radius: 3px;
                color: inherit !important;
            }
        `;
        document.documentElement.appendChild(style);
    }

    // ================================================================================
    // normalizeForMatch
    // 空白を除いて、DOM 上の文検索用文字列にする。
    // ================================================================================
    function normalizeForMatch(text) {
        return String(text || "").replace(/\s+/g, "");
    }

    // ================================================================================
    // cleanExtractedText
    // 抽出テキストの空行を除き、行ごとに整える。
    // ================================================================================
    function cleanExtractedText(text) {
        return String(text || "")
            .split("\n")
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join("\n");
    }

    // ================================================================================
    // setHighlightRoot
    // 文ハイライトの検索範囲を設定する。
    // ================================================================================
    function setHighlightRoot(node) {
        if (!node) {
            pageState.highlightRoot = document.body;
            pageState.lastMatchEnd = 0;
            return;
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
            pageState.highlightRoot = node;
        } else {
            pageState.highlightRoot = node.parentElement || document.body;
        }

        pageState.lastMatchEnd = 0;
    }

    // ================================================================================
    // getHighlightRoot
    // 有効なハイライト検索範囲を返す。無効なら body を使う。
    // ================================================================================
    function getHighlightRoot() {
        const root = pageState.highlightRoot;

        if (root && document.contains(root)) {
            return root;
        }

        return document.body;
    }

    // ================================================================================
    // findArticleRoot
    // 記事本文らしいルート要素を探す。
    // ================================================================================
    function findArticleRoot() {
        return (
            document.querySelector("article") ||
            document.querySelector("main") ||
            document.body
        );
    }

    // ================================================================================
    // debugLog
    // ページ上の抽出・ハイライト調査用。
    // ================================================================================
    function debugLog(scope, message, extra) {
        const prefix = `[OmniVoice] [${scope}] ${message}`;

        if (extra !== undefined) {
            console.log(prefix, extra);
            return;
        }

        console.log(prefix);
    }

    // ================================================================================
    // extractArticleText
    // 記事本文から、読み上げ不要な要素を除いたテキストを返す。
    // ================================================================================
    function extractArticleText() {
        const article = findArticleRoot();
        setHighlightRoot(article);

        const clone = article.cloneNode(true);

        const removeSelectors = [
            "script",
            "style",
            "noscript",
            "iframe",
            "nav",
            "header",
            "footer",
            "aside",
            "form",
            "button",
            "input",
            "textarea",
            "select",
            "[role='navigation']",
            "[role='banner']",
            "[role='complementary']",
            ".ad",
            ".ads",
            ".advertisement",
            ".sidebar",
            ".comment",
            ".comments",
            ".share",
            ".social"
        ];

        clone.querySelectorAll(removeSelectors.join(",")).forEach(el => {
            el.remove();
        });

        const text = cleanExtractedText(clone.innerText || clone.textContent || "");
        debugLog("content", "extractText", {
            chars: text.length,
            lines: text ? text.split("\n").length : 0
        });
        return text;
    }

    // ================================================================================
    // rememberCurrentSelection
    // 現在の選択範囲を保持する。ポップアップ表示後も使えるようにする。
    // ================================================================================
    function rememberCurrentSelection() {
        const selection = window.getSelection();

        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            return;
        }

        const rawText = selection.toString();

        if (!rawText.trim()) {
            return;
        }

        pageState.lastSelectionText = rawText;

        try {
            pageState.lastSelectionRange = selection.getRangeAt(0).cloneRange();
        } catch (error) {
            pageState.lastSelectionRange = null;
        }
    }

    // ================================================================================
    // getSavedSelectionRange
    // ページ上に残っている直前の選択 Range を返す。
    // ================================================================================
    function getSavedSelectionRange() {
        const range = pageState.lastSelectionRange;

        if (!range) {
            return null;
        }

        try {
            if (
                range.commonAncestorContainer &&
                document.contains(range.commonAncestorContainer)
            ) {
                return range;
            }
        } catch (error) {
            return null;
        }

        return null;
    }

    // ================================================================================
    // extractSelectedText
    // 現在の選択、または直前に保持した選択テキストを返す。
    // ================================================================================
    function extractSelectedText() {
        const selection = window.getSelection();
        let rawText = "";
        let range = null;

        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
            rawText = selection.toString();
            range = selection.getRangeAt(0);
        }

        if (!rawText.trim()) {
            rawText = pageState.lastSelectionText || "";
            range = getSavedSelectionRange();
        }

        const text = cleanExtractedText(rawText);

        if (!text) {
            return {
                success: false,
                error: "テキストが選択されていません。"
            };
        }

        if (range) {
            setHighlightRoot(range.commonAncestorContainer);
        } else {
            setHighlightRoot(document.body);
        }

        debugLog("content", "extractSelection", {
            chars: text.length,
            lines: text.split("\n").length
        });

        return {
            success: true,
            text: text,
            length: text.length
        };
    }

    // ================================================================================
    // clearHighlight
    // ページ上の現在文ハイライトをすべて解除する。
    // ================================================================================
    function clearHighlight() {
        const marks = document.querySelectorAll("." + HIGHLIGHT_CLASS);

        marks.forEach(mark => {
            const parent = mark.parentNode;

            if (!parent) {
                return;
            }

            while (mark.firstChild) {
                parent.insertBefore(mark.firstChild, mark);
            }

            parent.removeChild(mark);
            parent.normalize();
        });
    }

    // ================================================================================
    // isIgnorableTextParent
    // script や style など、検索対象外の親要素かどうかを返す。
    // ================================================================================
    function isIgnorableTextParent(parent) {
        if (!parent) {
            return true;
        }

        return Boolean(
            parent.closest("script, style, noscript, iframe, textarea")
        );
    }

    // ================================================================================
    // collectTextNodes
    // ハイライト検索に使うテキストノードを集める。
    // ================================================================================
    function collectTextNodes(root) {
        const nodes = [];
        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    if (!node.nodeValue) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    if (isIgnorableTextParent(node.parentElement)) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        let current = walker.nextNode();

        while (current) {
            nodes.push(current);
            current = walker.nextNode();
        }

        return nodes;
    }

    // ================================================================================
    // buildCharIndex
    // 空白を除いた文字と、元テキストノード位置の対応表を作る。
    // ================================================================================
    function buildCharIndex(nodes) {
        const chars = [];

        for (const node of nodes) {
            const value = node.nodeValue;

            for (let i = 0; i < value.length; i++) {
                if (/\s/.test(value[i])) {
                    continue;
                }

                chars.push({
                    node: node,
                    offset: i,
                    char: value[i]
                });
            }
        }

        return chars;
    }

    // ================================================================================
    // findNeedleIndex
    // 前回位置から文を探し、無ければ先頭から再検索する。
    // ================================================================================
    function findNeedleIndex(haystack, needle, fromIndex) {
        if (!needle) {
            return -1;
        }

        const nextIndex = haystack.indexOf(needle, fromIndex);

        if (nextIndex !== -1) {
            return nextIndex;
        }

        if (fromIndex > 0) {
            return haystack.indexOf(needle, 0);
        }

        return -1;
    }

    // ================================================================================
    // wrapCharRange
    // 見つかった文字範囲を mark 要素で囲む。
    // ================================================================================
    function wrapCharRange(chars, start, end) {
        const segments = [];

        for (let i = start; i < end; i++) {
            const item = chars[i];
            const last = segments[segments.length - 1];

            if (last && last.node === item.node && last.end === item.offset) {
                last.end = item.offset + 1;
            } else {
                segments.push({
                    node: item.node,
                    start: item.offset,
                    end: item.offset + 1
                });
            }
        }

        for (let i = segments.length - 1; i >= 0; i--) {
            const segment = segments[i];
            const node = segment.node;

            if (!node || !node.parentNode) {
                continue;
            }

            if (node.parentElement?.closest("." + HIGHLIGHT_CLASS)) {
                continue;
            }

            const range = document.createRange();
            range.setStart(node, segment.start);
            range.setEnd(node, segment.end);

            const mark = document.createElement("mark");
            mark.className = HIGHLIGHT_CLASS;

            try {
                range.surroundContents(mark);
            } catch (error) {
                const contents = range.extractContents();
                mark.appendChild(contents);
                range.insertNode(mark);
            }
        }
    }

    // ================================================================================
    // scrollHighlightIntoView
    // 現在文ハイライトが見える位置までスクロールする。
    // ================================================================================
    function scrollHighlightIntoView() {
        const first = document.querySelector("." + HIGHLIGHT_CLASS);

        if (!first) {
            return;
        }

        const rect = first.getBoundingClientRect();
        const topMargin = 80;
        const bottomMargin = 80;
        const inView = (
            rect.top >= topMargin &&
            rect.bottom <= window.innerHeight - bottomMargin
        );

        if (!inView) {
            first.scrollIntoView({
                behavior: "smooth",
                block: "center",
                inline: "nearest"
            });
        }
    }

    // ================================================================================
    // highlightInRoot
    // 指定ルート内で文を探し、見つかればハイライトする。
    // ================================================================================
    function highlightInRoot(root, needle) {
        const nodes = collectTextNodes(root);
        const chars = buildCharIndex(nodes);
        const haystack = chars.map(item => item.char).join("");
        const start = findNeedleIndex(haystack, needle, pageState.lastMatchEnd);

        if (start === -1) {
            return false;
        }

        wrapCharRange(chars, start, start + needle.length);
        pageState.lastMatchEnd = start + needle.length;
        return true;
    }

    // ================================================================================
    // highlightSentence
    // 再生中の文をハイライトする。停止・完了時は解除する。
    // ================================================================================
    function highlightSentence(sentence, playbackState) {
        ensureHighlightStyle();
        clearHighlight();

        if (
            playbackState === "stopped" ||
            playbackState === "finished" ||
            !sentence
        ) {
            pageState.lastMatchEnd = 0;
            return;
        }

        const needle = normalizeForMatch(sentence);

        if (!needle) {
            return;
        }

        const scopedRoot = getHighlightRoot();
        const found = (
            highlightInRoot(scopedRoot, needle) ||
            (
                scopedRoot !== document.body &&
                highlightInRoot(document.body, needle)
            )
        );

        if (found) {
            debugLog("content", "highlight", {
                chars: needle.length,
                preview: sentence.slice(0, 80)
            });
            scrollHighlightIntoView();
            return;
        }

        debugLog("content", "highlight missed", {
            chars: needle.length,
            preview: sentence.slice(0, 80)
        });
    }

    document.addEventListener(
        "selectionchange",
        rememberCurrentSelection,
        true
    );

    rememberCurrentSelection();

    // ================================================================================
    // onMessage
    // 本文抽出、選択抽出、文ハイライトの要求を処理する。
    // ================================================================================
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "extractText") {
            const text = extractArticleText();

            sendResponse({
                success: true,
                text: text,
                length: text.length
            });

            return true;
        }

        if (message.action === "extractSelection") {
            sendResponse(extractSelectedText());
            return true;
        }

        if (message.action === "highlightSentence") {
            highlightSentence(message.sentence, message.state);
            sendResponse({ success: true });
            return true;
        }

        return false;
    });

})();

// ================================================================================
