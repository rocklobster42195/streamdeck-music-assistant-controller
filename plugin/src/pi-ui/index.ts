// Entry of the property inspector bundle (ui/pi.js): shared core components + MAC components.
// The same page runs as the short PI and, with "?window", as the settings window (the kit's
// src/pi/window.ts): sections with class "pi-win" show only there.
import { definePiComponents, initConditionalVisibility, initSettingsWindow, sd, settingsWindowShown, translateDom } from "@rocklobster42195/streamdeck-kit/pi";
import { initChoiceOptions } from "./choice-icons";
import { MacConnectionCard } from "./connection-card";
import { MacFlowMode } from "./flow-mode";
import { MacItemPicker } from "./item-picker";
import { MacKeyPreview } from "./key-preview";
import { MacPlayerPicker } from "./player-picker";
import { MacProviderFilter } from "./provider-filter";
import { functionIcon } from "../render/function-icons";
import { initAudioSource } from "./audio-source";
import { initPiState } from "./state";

initSettingsWindow({ name: "MA-C" });
initPiState();

// Components render translated text, so wait until Stream Deck told us the language.
sd.onReady(() => {
    translateDom();
    // <pi-range data-fn-icon="timing">: the icon the Panorama dial shows for that function
    document.querySelectorAll<HTMLElement>("[data-fn-icon]").forEach((el) => el.setAttribute("icon", functionIcon(el.dataset.fnIcon ?? "")));
    definePiComponents();
    customElements.define("mac-player-picker", MacPlayerPicker);
    customElements.define("mac-key-preview", MacKeyPreview);
    customElements.define("mac-connection-card", MacConnectionCard);
    customElements.define("mac-item-picker", MacItemPicker);
    customElements.define("mac-flow-mode", MacFlowMode);
    customElements.define("mac-provider-filter", MacProviderFilter);
    initChoiceOptions();
    initConditionalVisibility();
    initAudioSource();

    const version = document.querySelector<HTMLElement>("[data-plugin-version]");
    if (version) version.textContent = `MA-C ${sd.info?.plugin.version ?? ""}`.trim();
    document.querySelectorAll<HTMLAnchorElement>("a[href^='http']").forEach((a) =>
        a.addEventListener("click", (e) => {
            e.preventDefault();
            sd.openUrl(a.href);
        }),
    );
    document.body.hidden = false;
    settingsWindowShown();
});
