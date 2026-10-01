// The Panorama's "Moves with" ([data-audio-source]): shown only while another plugin offers a level
// on deckbus, or while one is chosen (its plugin may be away; it can still be seen and switched off).
// The select also sends the chosen source, so the plugin can list it while its plugin is away.
import { registerSelectParams, sd } from "@rocklobster42195/streamdeck-kit/pi";
import { onPiState, piState } from "./state";

export function initAudioSource(): void {
    const parts = document.querySelectorAll<HTMLElement>("[data-audio-source]");
    if (!parts.length) return;
    registerSelectParams("audio-source", () => ({ current: String(sd.settings.audioSource ?? ""), name: String(sd.settings.audioSourceName ?? "") }));
    const apply = () => {
        const show = (piState.audioSources ?? 0) > 0 || !!sd.settings.audioSource;
        parts.forEach((el) => (el.hidden = !show));
    };
    onPiState(apply);
    sd.onSettings(apply);
    apply();
}
