// ================================================================================
// language_ui.js
//
// language の <select> に OmniVoice の言語一覧を入れる。
// ================================================================================

function languageItemText(item) {
    return [item.value, item.id, item.label]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}

function languageMatches(item, query) {
    if (!query) {
        return true;
    }

    return languageItemText(item).indexOf(query) !== -1;
}

function addLanguageOption(parent, item) {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label || item.value;
    parent.appendChild(option);
}

function fillLanguageSelect(select, catalog, selectedValue, query) {
    if (!select || !catalog) {
        return;
    }

    const selected = selectedValue || "auto";
    const needle = String(query || "").trim().toLowerCase();
    const special = catalog.special || [];
    const frequent = catalog.frequent || [];
    const languages = catalog.languages || [];

    select.innerHTML = "";

    special.forEach(item => {
        if (languageMatches(item, needle) || item.value === selected) {
            addLanguageOption(select, item);
        }
    });

    const frequentGroup = document.createElement("optgroup");
    frequentGroup.label = "よく使う";
    frequent.forEach(item => {
        if (languageMatches(item, needle) || item.value === selected) {
            addLanguageOption(frequentGroup, item);
        }
    });
    if (frequentGroup.childElementCount > 0) {
        select.appendChild(frequentGroup);
    }

    const allGroup = document.createElement("optgroup");
    allGroup.label = "すべて";
    languages.forEach(item => {
        if (languageMatches(item, needle) || item.value === selected) {
            addLanguageOption(allGroup, item);
        }
    });
    if (allGroup.childElementCount > 0) {
        select.appendChild(allGroup);
    }

    select.value = selected;

    if (select.value !== selected && selected) {
        addLanguageOption(select, {
            value: selected,
            label: selected
        });
        select.value = selected;
    }
}

async function loadLanguageCatalog(fallbackUrl) {
    try {
        const response = await fetch("http://127.0.0.1:8000/tts/languages");
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        // サーバー停止中は同梱の一覧を使う。
    }

    if (!fallbackUrl) {
        return null;
    }

    const response = await fetch(fallbackUrl);
    if (!response.ok) {
        throw new Error("language catalog を読み込めませんでした。");
    }

    return await response.json();
}

// ================================================================================
