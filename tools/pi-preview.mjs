// Preview the property inspectors in a normal browser, without Stream Deck.
// Serves plugin/*.sdPlugin/ui and fakes both the Stream Deck socket and the plugin's messages.
//
//   node tools/pi-preview.mjs            → http://localhost:5199/play-pause-key.html?scenario=connected&lang=de
//   scenarios: connected · setup · auth · offline        lang: en · de
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.resolve("plugin/package.json"));
const { WebSocketServer } = require("ws");

const HTTP_PORT = Number(process.env.PORT ?? 5199);
const WS_PORT = HTTP_PORT + 1;
const UI = path.resolve("plugin/de.boriskemper.music-assistant-controller.sdPlugin/ui");

const players = [
    { id: "bath", name: "Badezimmer", state: "playing" },
    { id: "dining", name: "Esszimmer", state: "idle" },
    { id: "study", name: "Herrenzimmer", state: "idle" },
    { id: "kitchen", name: "Küche", state: "paused" },
    { id: "bedroom", name: "Schlafzimmer", state: "idle" },
    { id: "shield", name: "SHIELD", state: "idle" },
    { id: "terrace", name: "Terrasse", state: "offline" },
];

const svg = (body) => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 72 72">${body}</svg>`).toString("base64")}`;
const coverKey = svg(`<rect width="72" height="72" fill="#10220f"/><circle cx="50" cy="22" r="18" fill="#1f4a1b"/><circle cx="22" cy="48" r="26" fill="#2c6a25"/><circle cx="46" cy="52" r="9" fill="#55c939"/><rect y="68" width="72" height="4" fill="#000" opacity="0.5"/><rect y="68" width="30" height="4" fill="#55c939"/>`);
const iconKey = (color) => svg(`<rect width="72" height="72" fill="#101010"/><circle cx="36" cy="36" r="14" fill="none" stroke="${color}" stroke-width="3"/>`);

const scenarios = {
    connected: {
        global: { maUrl: "192.168.1.10:8095", maToken: "demo", activePlayerId: "bath" },
        status: { configured: true, state: "connected", reachable: true, url: "http://192.168.1.10:8095", serverVersion: "2.10.4", playerCount: players.length },
        preview: { image: coverKey, state: "playing", track: "Lisboa Dreaming · Alex Cortiz", playerName: "Badezimmer", following: true },
    },
    setup: {
        global: {},
        status: { configured: false, state: "stopped", reachable: false, playerCount: 0 },
        preview: { image: iconKey("#777"), state: "setup" },
    },
    auth: {
        global: { maUrl: "192.168.1.10:8095", maToken: "wrong" },
        status: { configured: true, state: "auth_failed", reachable: true, url: "http://192.168.1.10:8095", serverVersion: "2.10.4", playerCount: 0 },
        preview: { image: iconKey("#e57373"), state: "auth_failed" },
    },
    offline: {
        global: { maUrl: "192.168.1.99:8095", maToken: "demo" },
        status: { configured: true, state: "reconnecting", reachable: false, url: "http://192.168.1.99:8095", playerCount: 0 },
        preview: { image: iconKey("#777"), state: "offline" },
    },
};

// Fake Stream Deck socket: the PI registers with ?scenario encoded in its context id.
const wss = new WebSocketServer({ port: WS_PORT });
wss.on("connection", (ws) => {
    let scenario = scenarios.connected;
    let settings = { playerId: "", showPlayerName: false, showProgress: true };
    const reply = (msg) => ws.send(JSON.stringify(msg));
    ws.on("message", (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.uuid) scenario = scenarios[msg.uuid.split(":")[1]] ?? scenarios.connected;
        switch (msg.event) {
            case "getGlobalSettings":
                reply({ event: "didReceiveGlobalSettings", payload: { settings: scenario.global } });
                break;
            case "setSettings":
                settings = msg.payload;
                console.log("setSettings", settings);
                break;
            case "setGlobalSettings":
                scenario = { ...scenario, global: msg.payload };
                console.log("setGlobalSettings", msg.payload);
                break;
            case "sendToPlugin":
                if (msg.payload?.event === "pi-ready") {
                    reply({ event: "sendToPropertyInspector", payload: { event: "status", status: scenario.status } });
                    reply({ event: "sendToPropertyInspector", payload: { event: "players", players: scenario.status.state === "connected" ? players : [], activePlayerId: scenario.global.activePlayerId } });
                    reply({ event: "sendToPropertyInspector", payload: { event: "preview", preview: scenario.preview } });
                } else console.log("sendToPlugin", msg.payload);
                break;
            case "openUrl":
                console.log("openUrl", msg.payload.url);
                break;
        }
    });
});

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };

http.createServer((req, res) => {
    const u = new URL(req.url, `http://localhost:${HTTP_PORT}`);
    const file = path.join(UI, decodeURIComponent(u.pathname === "/" ? "/play-pause-key.html" : u.pathname));
    if (!file.startsWith(UI) || !fs.existsSync(file)) {
        res.writeHead(404).end("not found");
        return;
    }
    let body = fs.readFileSync(file);
    if (file.endsWith(".html")) {
        const scenario = u.searchParams.get("scenario") ?? "connected";
        const lang = u.searchParams.get("lang") ?? "de";
        const info = { application: { language: lang, platform: "windows", version: "7.0" }, plugin: { uuid: "de.boriskemper.music-assistant-controller", version: "0.1.0" } };
        const actionInfo = { action: "de.boriskemper.music-assistant-controller.play-pause-key", context: "ctx", device: "dev", payload: { settings: { playerId: "", showProgress: true } } };
        // ?click=<css selector> clicks an element after load (e.g. to screenshot an open dropdown)
        const click = u.searchParams.get("click");
        const boot = `<script>window.addEventListener("load",()=>{connectElgatoStreamDeckSocket(${WS_PORT},"pi:${scenario}","registerPropertyInspector",${JSON.stringify(JSON.stringify(info))},${JSON.stringify(JSON.stringify(actionInfo))});${click ? `let n=0;const tryClick=()=>{const el=!document.body.hidden&&document.querySelector(${JSON.stringify(click)});if(el)el.click();else if(n++<50)setTimeout(tryClick,100);};tryClick();` : ""}});</script><style>body{width:360px}</style>`;
        body = Buffer.from(String(body).replace("</body>", `${boot}</body>`));
    }
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" }).end(body);
}).listen(HTTP_PORT, () => {
    console.log(`PI preview: http://localhost:${HTTP_PORT}/play-pause-key.html?scenario=connected&lang=de`);
    console.log(`scenarios: ${Object.keys(scenarios).join(", ")}`);
});
