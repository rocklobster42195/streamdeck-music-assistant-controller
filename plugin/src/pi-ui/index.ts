// Entry of the property inspector bundle (ui/pi.js): shared core components + MAC components.
import { definePiComponents, initConditionalVisibility, sd, translateDom } from "streamdeck-core/pi";
import { initChoiceOptions } from "./choice-icons";
import { MacConnectionCard } from "./connection-card";
import { MacEffectSettings } from "./effect-settings";
import { MacFlowMode } from "./flow-mode";
import { MacItemPicker } from "./item-picker";
import { MacKeyPreview } from "./key-preview";
import { MacPlayerPicker } from "./player-picker";
import { MacSelect } from "./select";
import { functionIcon } from "../render/function-icons";
import { initPiState } from "./state";

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
    customElements.define("mac-effect-settings", MacEffectSettings);
    customElements.define("mac-select", MacSelect);
    customElements.define("mac-flow-mode", MacFlowMode);
    initChoiceOptions();
    initConditionalVisibility();

    const version = document.querySelector<HTMLElement>("[data-plugin-version]");
    if (version) version.textContent = `MAC ${sd.info?.plugin.version ?? ""}`.trim();
    document.querySelectorAll<HTMLAnchorElement>("a[href^='http']").forEach((a) =>
        a.addEventListener("click", (e) => {
            e.preventDefault();
            sd.openUrl(a.href);
        }),
    );
    document.body.hidden = false;
});
