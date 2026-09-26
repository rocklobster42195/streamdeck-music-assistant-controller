import { maConnection } from "../ma/connection";
import { piBridge } from "./pi-bridge";

/** Lists the property inspectors can ask for via <mac-select source="…">. */
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

    piBridge.registerOptions("dashboards", async () => {
        const ma = maConnection.ma;
        if (!ma?.isConnected) return [];
        return (await ma.dashboards()).map((d) => ({ value: d.dashboard_id, label: d.name, sub: d.provider_domain_hint ?? undefined }));
    });
}
