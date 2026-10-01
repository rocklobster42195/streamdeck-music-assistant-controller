import streamDeck from "@elgato/streamdeck";
import { offeredStreams } from "../bus/mac-bus";
import { maConnection } from "../ma/connection";
import { piBridge } from "@rocklobster42195/streamdeck-kit/bridge";
import { mdiOptions } from "@rocklobster42195/streamdeck-kit/mdi";

/** Lists the property inspectors can ask for via <pi-select source="…"> (and the icon picker). */
export function registerOptionSources(): void {
    piBridge.registerOptions("tts-engines", async () => {
        const ma = maConnection.ma;
        if (!ma?.isConnected) return [];
        return (await ma.ttsEngines()).map((e) => ({ value: e.uid, label: e.name.replace(/^Home Assistant \| /, ""), sub: e.uid.split("/")[0] }));
    });

    // Selectable inputs of a player (passive sources like AirPlay start on their own)
    piBridge.registerOptions("player-sources", ({ playerId }) => {
        const player = maConnection.player(playerId);
        // The player's own queue is listed as "Music Assistant Queue" — "Music Assistant" is enough on a key
        return (player?.source_list ?? []).filter((s) => !s.passive).map((s) => ({ value: s.id, label: s.id === playerId ? "Music Assistant" : s.name }));
    });

    // Music providers for the Browser dial's filter (instance id, name, provider type)
    piBridge.registerOptions("music-providers", async () => {
        const ma = maConnection.ma;
        if (!ma?.isConnected) return [];
        const providers = (await ma.send<{ instance_id: string; domain: string; name: string; type: string; available?: boolean }[]>("providers")) ?? [];
        return providers.filter((p) => p.type === "music" && p.available !== false).map((p) => ({ value: p.instance_id, label: p.name, sub: p.domain }));
    });

    // Icon picker: search all Material Design Icons
    piBridge.registerOptions("mdi-icons", mdiOptions);

    piBridge.registerOptions("dashboards", async () => {
        const ma = maConnection.ma;
        if (!ma?.isConnected) return [];
        return (await ma.dashboards()).map((d) => ({ value: d.dashboard_id, label: d.name, sub: d.provider_domain_hint ?? undefined }));
    });

    // Panorama "Moves with": level streams other plugins offer on deckbus (XR-C channels, …). The
    // chosen one stays in the list while its plugin is away, so it can still be seen and switched off.
    piBridge.registerOptions("audio-sources", (params) => {
        const offered = offeredStreams();
        const current = params.current ?? "";
        const away = current && !offered.some((s) => s.id === current) ? [{ value: current, label: params.name || current, sub: streamDeck.i18n.t("key.audio_away") }] : [];
        return [{ value: "", label: streamDeck.i18n.t("key.audio_none") }, ...offered.map((s) => ({ value: s.id, label: s.label, sub: s.peer })), ...away];
    });
}
