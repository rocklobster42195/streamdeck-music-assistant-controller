// Live property inspector: the PI page in a normal browser talks — through the simulator — to the
// REAL plugin, which talks to your REAL Music Assistant (from .env). Settings you change in the page
// reach the plugin exactly as Stream Deck would deliver them.
//
//   node tools/sd-sim/pi-live.mjs [action] [lang]      e.g.  node tools/sd-sim/pi-live.mjs play-item-key de
//   → http://localhost:5299/  (the key image is at /key.png)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { readEnv, startSim } from "./sim.mjs";

const require = createRequire(path.resolve("plugin/package.json"));
const { WebSocketServer } = require("ws");
const sharp = require("sharp");

const action = process.argv[2] ?? "play-item-key";
const lang = process.argv[3] ?? "de";
const HTTP_PORT = Number(process.env.PORT ?? 5299);
const WS_PORT = HTTP_PORT + 1;
const UI = path.resolve("plugin/de.boriskemper.music-assistant-controller.sdPlugin/ui");
const env = readEnv();

const sim = await startSim({ language: lang, globalSettings: { maUrl: env.MA_URL, maToken: env.MA_TOKEN, activePlayerId: env.MA_TEST_PLAYER } });
// Dials must be placed as encoders — a dial action ignores a keypad slot
const ctx = sim.add(action, {}, { column: 0, row: 0, controller: action.endsWith("-dial") ? "Encoder" : "Keypad" });
const slot = () => sim.state.slots.get(ctx);

const wss = new WebSocketServer({ port: WS_PORT });
wss.on("connection", (ws) => {
    const toPi = (msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
    const off = sim.onPiMessage((payload) => toPi({ event: "sendToPropertyInspector", action: slot().action, context: ctx, payload }));
    ws.on("close", off);
    ws.on("message", (raw) => {
        const msg = JSON.parse(String(raw));
        switch (msg.event) {
            case "registerPropertyInspector":
                sim.piOpen(ctx);
                break;
            case "getGlobalSettings":
                toPi({ event: "didReceiveGlobalSettings", payload: { settings: sim.state.globalSettings } });
                break;
            case "setSettings":
                sim.setSettings(ctx, msg.payload);
                console.log("settings →", JSON.stringify(msg.payload));
                break;
            case "setGlobalSettings":
                sim.setGlobalSettings(msg.payload);
                break;
            case "sendToPlugin":
                sim.piSend(ctx, msg.payload);
                break;
            case "openUrl":
                console.log("openUrl", msg.payload?.url);
                break;
        }
    });
});

http.createServer(async (req, res) => {
    const u = new URL(req.url, `http://localhost:${HTTP_PORT}`);
    if (u.pathname === "/key.png") {
        const img = slot().image;
        if (!img) return res.writeHead(404).end();
        const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(img);
        const buf = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]));
        return res.writeHead(200, { "content-type": "image/png" }).end(await sharp(buf, { density: 144 }).resize(144, 144).png().toBuffer());
    }
    const file = path.join(UI, u.pathname === "/" ? `/${action}.html` : decodeURIComponent(u.pathname));
    if (!file.startsWith(UI) || !fs.existsSync(file)) return res.writeHead(404).end("not found");
    let body = fs.readFileSync(file);
    if (file.endsWith(".html")) {
        const info = { application: { language: lang, platform: "windows", version: "7.0" }, plugin: { uuid: "de.boriskemper.music-assistant-controller", version: "0.1.0" } };
        const actionInfo = { action: slot().action, context: ctx, device: "sim-device", payload: { settings: slot().settings } };
        const click = u.searchParams.get("click");
        const type = u.searchParams.get("type");
        const boot = `<script>window.addEventListener("load",()=>{connectElgatoStreamDeckSocket(${WS_PORT},${JSON.stringify(ctx)},"registerPropertyInspector",${JSON.stringify(JSON.stringify(info))},${JSON.stringify(JSON.stringify(actionInfo))});`
            + (click || type ? `let n=0;const go=()=>{const el=!document.body.hidden&&document.querySelector(${JSON.stringify(click ?? "input")});if(!el){if(n++<80)setTimeout(go,100);return;}${type ? `el.value=${JSON.stringify(type)};el.dispatchEvent(new Event("input"));` : "el.click();"}};setTimeout(go,${Number(u.searchParams.get("delay") ?? 800)});` : "")
            + `});</script><style>body{width:360px}</style>`;
        body = Buffer.from(String(body).replace("</body>", `${boot}</body>`));
    }
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" }).end(body);
}).listen(HTTP_PORT, () => console.log(`Live PI for ${action}: http://localhost:${HTTP_PORT}/  (key image: /key.png)`));
