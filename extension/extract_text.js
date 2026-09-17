// ================================================================================
// extract_text.js
//
// HTML から読み上げ用テキストを取る。
// 改行にするのはブロック要素の切れ目と br だけ。
// CSS の折り返しは改行にしない。
// ================================================================================

(function () {

    const BLOCK_TAGS = {
        ARTICLE: true,
        BLOCKQUOTE: true,
        DD: true,
        DIV: true,
        DL: true,
        DT: true,
        FIGCAPTION: true,
        FIGURE: true,
        H1: true,
        H2: true,
        H3: true,
        H4: true,
        H5: true,
        H6: true,
        HR: true,
        LI: true,
        OL: true,
        P: true,
        PRE: true,
        SECTION: true,
        TABLE: true,
        TBODY: true,
        TD: true,
        TFOOT: true,
        TH: true,
        THEAD: true,
        TR: true,
        UL: true
    };

    const IGNORE_TAGS = {
        BUTTON: true,
        IFRAME: true,
        INPUT: true,
        NOSCRIPT: true,
        SCRIPT: true,
        SELECT: true,
        STYLE: true,
        TEXTAREA: true
    };

    // ================================================================================
    // cleanExtractedText
    // 空行を除き、行ごとに整える。
    // ================================================================================
    function cleanExtractedText(text) {
        return String(text || "")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .split("\n")
            .map(line => line.replace(/[ \t\u00a0]+/g, " ").trim())
            .filter(line => line.length > 0)
            .join("\n");
    }

    // ================================================================================
    // walk
    // ノードを歩き、テキストと改行を parts に積む。
    // ================================================================================
    function walk(node, parts, inPre) {
        if (!node) {
            return;
        }

        if (node.nodeType === Node.COMMENT_NODE) {
            return;
        }

        if (node.nodeType === Node.TEXT_NODE) {
            const value = node.nodeValue || "";

            if (inPre) {
                parts.push(value);
                return;
            }

            const collapsed = value.replace(/\s+/g, " ");

            if (collapsed) {
                parts.push(collapsed);
            }

            return;
        }

        if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
            for (let index = 0; index < node.childNodes.length; index += 1) {
                walk(node.childNodes[index], parts, inPre);
            }

            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
            return;
        }

        const tag = node.tagName;

        if (IGNORE_TAGS[tag]) {
            return;
        }

        if (tag === "BR") {
            parts.push("\n");
            return;
        }

        const nextPre = inPre || tag === "PRE";
        const block = BLOCK_TAGS[tag] === true;

        if (block) {
            parts.push("\n");
        }

        for (let index = 0; index < node.childNodes.length; index += 1) {
            walk(node.childNodes[index], parts, nextPre);
        }

        if (block) {
            parts.push("\n");
        }
    }

    // ================================================================================
    // extractTextFromNode
    // 要素または DocumentFragment から、読み上げ用テキストを取る。
    // ================================================================================
    function extractTextFromNode(root) {
        const parts = [];
        walk(root, parts, false);
        return cleanExtractedText(parts.join(""));
    }

    // ================================================================================
    // extractTextFromRange
    // 選択範囲の HTML 構造を保ったまま、同じ規則でテキストを取る。
    // ================================================================================
    function extractTextFromRange(range) {
        if (!range) {
            return "";
        }

        try {
            return extractTextFromNode(range.cloneContents());
        } catch (error) {
            return cleanExtractedText(range.toString());
        }
    }

    window.__omniVoiceExtractText = {
        fromNode: extractTextFromNode,
        fromRange: extractTextFromRange,
        clean: cleanExtractedText
    };

})();

// ================================================================================
