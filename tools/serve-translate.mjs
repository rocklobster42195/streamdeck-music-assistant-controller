// Serves the translation one-pager locally: rebuilds translate/data.json, then serves the repo root.
//   npm run translate      → http://localhost:5399/translate/
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const root = path.resolve(".");
const port = Number(process.env.PORT ?? 5399);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

execFileSync(process.execPath, ["tools/build-translator.mjs"], { stdio: "inherit" });

http.createServer((req, res) => {
    let p = path.resolve(root, "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname));
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
    if (!p.startsWith(root + path.sep) || !fs.existsSync(p)) {
        res.writeHead(404).end("not found");
        return;
    }
    res.writeHead(200, { "content-type": types[path.extname(p)] ?? "application/octet-stream" }).end(fs.readFileSync(p));
}).listen(port, () => console.log(`Translations: http://localhost:${port}/translate/`));
