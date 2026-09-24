// Translation one-pager for MAC. Reads data.json (built by tools/build-translator.mjs), shows every
// text with where it is used, keeps a draft per language in localStorage, and exports <lang>.json.
(() => {
    const REPO = "rocklobster42195/streamdeck-music-assistant-controller";
    const LANG_NAMES = { en: "English", de: "Deutsch", es: "Español", fr: "Français", ja: "日本語", ko: "한국어", zh_CN: "简体中文", zh_TW: "繁體中文" };

    // The page's own UI texts (the page follows the browser language: German or English)
    const UI = {
        en: {
            title: "Translations", intro: "Translate the Stream Deck plugin into your language. Every text shows where it appears; drafts are kept in this browser.",
            reset: "Discard draft", github: "Propose on GitHub", download: "Download JSON", from: "From", to: "To", search: "Search texts…",
            all: "All", missing: "Missing", outdated: "Outdated", done: "Done", progress: "{done} of {total} translated", progressOutdated: " · {n} outdated",
            g_plugin: "Plugin (store listing)", g_manifest: "Action list in Stream Deck", g_key: "On the keys and dials", g_pi: "Settings panels", g_effect: "Panorama effects",
            w_name: "action name", w_tooltip: "tooltip", w_trigger: "dial hint", w_key: "key", w_dial: "dial", w_settings: "settings", w_plugin: "plugin",
            all_actions: "all actions", all_settings: "all settings panels",
            tooWide: "Probably too wide for a key", placeholderMissing: "Missing placeholder: {p}", sameAsSource: "Same as the source — still untranslated?",
            outdatedNote: "The source text changed after this was translated", nothing: "No texts match.",
            resetConfirm: "Discard your draft for {lang}?", resetDone: "Draft discarded.",
            githubNew: "The JSON is in your clipboard. On GitHub, paste it as the file content and choose “Propose new file”.",
            githubEdit: "The JSON is in your clipboard. On GitHub, replace the file content with it and choose “Propose changes”.",
            githubNoClipboard: "Couldn't copy to the clipboard — use “Download JSON” and upload the file on GitHub instead.",
            downloaded: "Saved {file}. Attach it to a pull request or an issue.",
        },
        de: {
            title: "Übersetzen", intro: "Übersetze das Stream-Deck-Plugin in deine Sprache. Zu jedem Text steht, wo er erscheint; Entwürfe bleiben in diesem Browser.",
            reset: "Entwurf verwerfen", github: "Auf GitHub vorschlagen", download: "JSON herunterladen", from: "Von", to: "Nach", search: "Texte durchsuchen…",
            all: "Alle", missing: "Fehlend", outdated: "Veraltet", done: "Fertig", progress: "{done} von {total} übersetzt", progressOutdated: " · {n} veraltet",
            g_plugin: "Plugin (Store-Eintrag)", g_manifest: "Aktionsliste in Stream Deck", g_key: "Auf Tasten und Dials", g_pi: "Einstellungsfenster", g_effect: "Panorama-Effekte",
            w_name: "Aktionsname", w_tooltip: "Tooltip", w_trigger: "Dial-Hinweis", w_key: "Taste", w_dial: "Dial", w_settings: "Einstellungen", w_plugin: "Plugin",
            all_actions: "alle Aktionen", all_settings: "alle Einstellungsfenster",
            tooWide: "Vermutlich zu breit für eine Taste", placeholderMissing: "Platzhalter fehlt: {p}", sameAsSource: "Wie die Quelle – noch unübersetzt?",
            outdatedNote: "Der Ausgangstext wurde nach der Übersetzung geändert", nothing: "Keine passenden Texte.",
            resetConfirm: "Entwurf für {lang} verwerfen?", resetDone: "Entwurf verworfen.",
            githubNew: "Das JSON ist in der Zwischenablage. Auf GitHub als Dateiinhalt einfügen und „Propose new file“ wählen.",
            githubEdit: "Das JSON ist in der Zwischenablage. Auf GitHub den Dateiinhalt damit ersetzen und „Propose changes“ wählen.",
            githubNoClipboard: "Kopieren in die Zwischenablage ging nicht – nutze „JSON herunterladen“ und lade die Datei auf GitHub hoch.",
            downloaded: "{file} gespeichert. Häng die Datei an einen Pull Request oder ein Issue.",
        },
    };
    const uiLang = (navigator.language || "en").toLowerCase().startsWith("de") ? "de" : "en";
    const u = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), UI[uiLang][key] ?? UI.en[key] ?? key);

    const GROUPS = ["plugin", "manifest", "key", "pi", "effect"];
    const HEADER_FIELDS = ["Name", "Category", "Description"];
    const $ = (sel) => document.querySelector(sel);
    const esc = (s) => String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    const store = {
        get(k) {
            try {
                return JSON.parse(localStorage.getItem(k) ?? "null");
            } catch {
                return null;
            }
        },
        set(k, v) {
            try {
                localStorage.setItem(k, JSON.stringify(v));
            } catch {
                /* private mode etc. — drafts just aren't kept */
            }
        },
        del(k) {
            try {
                localStorage.removeItem(k);
            } catch {
                /* ignore */
            }
        },
    };

    let data;
    let entries = []; // { id, group, usedIn }
    let source = "en";
    let target = "de";
    let draft = {};
    let filter = "all";
    let query = "";
    const measure = document.createElement("canvas").getContext("2d");

    // ---- data ---------------------------------------------------------------------------------------------

    const textOf = (lang, id) => {
        const l = data.languages[lang];
        if (!l) return "";
        return id.startsWith("header.") ? (l.header?.[id.slice(7)] ?? "") : (l.strings[id] ?? "");
    };
    const targetText = (id) => (id in draft ? draft[id] : textOf(target, id));

    function statusOf(id) {
        const t = targetText(id).trim();
        if (!t) return "missing";
        if (!(id in draft) && (data.outdated[target] ?? []).includes(id)) return "outdated";
        return "done";
    }

    // ---- setup ----------------------------------------------------------------------------------------------

    async function init() {
        document.documentElement.lang = uiLang;
        document.querySelectorAll("[data-t]").forEach((el) => (el.textContent = u(el.dataset.t)));
        $("#search").placeholder = u("search");

        data = await (await fetch("data.json")).json();
        entries = [
            ...HEADER_FIELDS.map((f) => ({ id: `header.${f}`, group: "plugin", usedIn: [] })),
            ...data.keys.map((k) => ({ id: k.key, group: k.group, usedIn: k.usedIn })),
        ];

        const langs = [...new Set([...Object.keys(data.languages), ...data.supported])];
        const option = (l) => `<option value="${l}">${esc(LANG_NAMES[l] ?? l)} (${l})${data.languages[l] ? "" : " ✚"}</option>`;
        $("#source").innerHTML = Object.keys(data.languages).map(option).join("");
        $("#target").innerHTML = langs.filter((l) => l !== "en").map(option).join("");
        // ?to=fr&from=en preselects languages (handy for inviting translators)
        const params = new URLSearchParams(location.search);
        const last = store.get("mac-translate:last");
        const wanted = params.get("to") ?? last;
        target = wanted && langs.includes(wanted) && wanted !== "en" ? wanted : (Object.keys(data.languages).find((l) => l !== "en") ?? "de");
        if (params.get("from") && data.languages[params.get("from")]) source = params.get("from");
        $("#source").value = source;
        $("#target").value = target;

        $("#source").addEventListener("change", (e) => {
            source = e.target.value;
            render();
        });
        $("#target").addEventListener("change", (e) => switchTarget(e.target.value));
        $("#search").addEventListener("input", (e) => {
            query = e.target.value.toLowerCase();
            render();
        });
        $("#btn-download").addEventListener("click", download);
        $("#btn-github").addEventListener("click", proposeOnGitHub);
        $("#btn-reset").addEventListener("click", resetDraft);
        switchTarget(target);
    }

    function switchTarget(lang) {
        target = lang;
        store.set("mac-translate:last", lang);
        draft = store.get(`mac-translate:${lang}`) ?? {};
        render();
    }

    // ---- rendering ------------------------------------------------------------------------------------------

    function render() {
        renderFilters();
        const visible = entries.filter((e) => {
            if (filter !== "all" && statusOf(e.id) !== filter) return false;
            if (!query) return true;
            return [e.id, textOf(source, e.id), targetText(e.id)].some((s) => s.toLowerCase().includes(query));
        });
        const list = $("#list");
        if (!visible.length) {
            list.innerHTML = `<p class="pi-hint tr-empty">${esc(u("nothing"))}</p>`;
            updateProgress();
            return;
        }
        list.innerHTML = GROUPS.map((g) => {
            const items = visible.filter((e) => e.group === g);
            if (!items.length) return "";
            return `<section class="tr-group"><div class="pi-section-title"><span>${esc(u(`g_${g}`))}</span><span>${items.length}</span></div><div class="pi-card">${items.map(itemHtml).join("")}</div></section>`;
        }).join("");
        list.querySelectorAll("textarea").forEach((ta) => {
            autosize(ta);
            ta.addEventListener("input", () => onEdit(ta));
        });
        list.querySelectorAll(".tr-item").forEach((el) => updateItem(el));
        updateProgress();
    }

    function renderFilters() {
        const counts = { all: entries.length, missing: 0, outdated: 0, done: 0 };
        for (const e of entries) counts[statusOf(e.id)]++;
        $("#filters").innerHTML = ["all", "missing", "outdated", "done"]
            .map((f) => `<button type="button" class="mac-chip" data-f="${f}" aria-pressed="${f === filter}">${esc(u(f))}<span class="tr-count">${counts[f]}</span></button>`)
            .join("");
        $("#filters").querySelectorAll(".mac-chip").forEach((b) =>
            b.addEventListener("click", () => {
                filter = b.dataset.f;
                render();
            }),
        );
    }

    function itemHtml(e) {
        const src = textOf(source, e.id) || textOf("en", e.id);
        const places = [...new Set(e.usedIn.map(placeLabel))];
        const keyPreview = e.group === "key" ? `<div class="tr-keyprev"><span></span></div>` : "";
        return `<div class="tr-item" data-id="${esc(e.id)}">
            <div class="tr-item-head"><span class="pi-dot"></span><span class="tr-key">${esc(e.id)}</span><span class="tr-used">${places.map((p) => `<span>${esc(p)}</span>`).join("")}</span></div>
            <div class="tr-source">${esc(src)}</div>
            <div class="tr-target"><textarea rows="1" lang="${esc(target.replace("_", "-"))}" placeholder="${esc(src)}" aria-label="${esc(e.id)}">${esc(targetText(e.id))}</textarea>${keyPreview}</div>
            <div class="tr-notes"></div>
        </div>`;
    }

    function placeLabel(p) {
        const where = u(`w_${p.where}`);
        if (p.label !== "*") return `${p.label} · ${where}`;
        return p.where === "settings" ? u("all_settings") : u("all_actions");
    }

    /** Status dot, notes (placeholders, width, outdated) and key preview for one item. */
    function updateItem(el) {
        const id = el.dataset.id;
        const status = statusOf(id);
        el.dataset.status = status;
        el.querySelector(".pi-dot").dataset.status = status;
        const text = targetText(id);
        const src = textOf(source, id) || textOf("en", id);
        const notes = [];
        const missing = (src.match(/\{[a-z_]+\}/g) ?? []).filter((p) => text.trim() && !text.includes(p));
        for (const p of missing) notes.push(`<span class="tr-note tr-error">${esc(u("placeholderMissing", { p }))}</span>`);
        if (status === "outdated") notes.push(`<span class="tr-note tr-warn">${esc(u("outdatedNote"))}</span>`);
        // Brand names (plugin name/category) may stay the same
        const brand = id === "header.Name" || id === "header.Category";
        if (!brand && text.trim() && text.trim() === src.trim() && target !== source && src.length > 3) notes.push(`<span class="tr-note">${esc(u("sameAsSource"))}</span>`);
        const prev = el.querySelector(".tr-keyprev");
        if (prev) {
            const shown = text.trim() || src;
            prev.querySelector("span").textContent = shown;
            measure.font = "bold 11px Arial";
            const tooWide = measure.measureText(shown).width > 64;
            prev.classList.toggle("tr-too-wide", tooWide);
            if (tooWide) notes.push(`<span class="tr-note tr-warn">${esc(u("tooWide"))}</span>`);
        }
        el.querySelector(".tr-notes").innerHTML = notes.join("");
    }

    function onEdit(ta) {
        const el = ta.closest(".tr-item");
        draft[el.dataset.id] = ta.value;
        store.set(`mac-translate:${target}`, draft);
        autosize(ta);
        updateItem(el);
        updateProgress();
        renderFilters();
    }

    function updateProgress() {
        const total = entries.length;
        const done = entries.filter((e) => statusOf(e.id) === "done").length;
        const outdated = entries.filter((e) => statusOf(e.id) === "outdated").length;
        $("#progress-fill").style.width = `${Math.round((done / total) * 100)}%`;
        $("#progress-text").textContent = u("progress", { done, total }) + (outdated ? u("progressOutdated", { n: outdated }) : "");
    }

    function autosize(ta) {
        ta.style.height = "auto";
        ta.style.height = `${ta.scrollHeight + 2}px`;
    }

    // ---- export ---------------------------------------------------------------------------------------------

    /** The locale file for `target`, in the plugin's format (flat manifest keys, nested groups). */
    function buildJson() {
        const header = Object.fromEntries(HEADER_FIELDS.map((f) => [f, targetText(`header.${f}`) || textOf("en", `header.${f}`)]));
        const loc = {};
        for (const e of entries) {
            if (e.group === "plugin") continue;
            const value = targetText(e.id).trim();
            if (!value) continue; // missing texts fall back to English at runtime
            if (e.group === "manifest") {
                loc[e.id] = value;
                continue;
            }
            const parts = e.id.split(".");
            let node = loc;
            for (const p of parts.slice(0, -1)) node = node[p] ??= {};
            node[parts.at(-1)] = value;
        }
        return JSON.stringify({ Description: header.Description, Name: header.Name, Category: header.Category, Localization: loc }, null, "\t") + "\n";
    }

    function download() {
        const file = `${target}.json`;
        const blob = new Blob([buildJson()], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast(u("downloaded", { file }));
    }

    async function proposeOnGitHub() {
        const exists = !!data.languages[target];
        const dir = data.localeDir;
        try {
            await navigator.clipboard.writeText(buildJson());
        } catch {
            toast(u("githubNoClipboard"));
            return;
        }
        const url = exists ? `https://github.com/${REPO}/edit/main/${dir}/${target}.json` : `https://github.com/${REPO}/new/main/${dir}?filename=${encodeURIComponent(`${target}.json`)}`;
        window.open(url, "_blank", "noopener");
        toast(u(exists ? "githubEdit" : "githubNew"));
    }

    function resetDraft() {
        if (!confirm(u("resetConfirm", { lang: LANG_NAMES[target] ?? target }))) return;
        draft = {};
        store.del(`mac-translate:${target}`);
        render();
        toast(u("resetDone"));
    }

    let toastTimer;
    function toast(text) {
        const t = $("#toast");
        t.textContent = text;
        t.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => (t.hidden = true), 6000);
    }

    init().catch((e) => {
        $("#list").innerHTML = `<p class="pi-hint tr-empty">Could not load data.json — run <code>node tools/build-translator.mjs</code>. (${esc(e.message)})</p>`;
    });
})();
