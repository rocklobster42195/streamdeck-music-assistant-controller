// Releases music-assistant-client to npm: bumps packages/ma-client/package.json, turns the
// package CHANGELOG's [Unreleased] into a version section, commits, tags ma-client-v<version> and
// pushes. The "Publish client" workflow then checks and publishes the tag (needs the NPM_TOKEN secret).
//
//   node tools/release-client.mjs <patch|minor|major> [--dry-run]
//
// While no ma-client-v* tag exists, the version in package.json is released as it is.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const pkgPath = path.join(root, "packages/ma-client/package.json");
const changelogPath = path.join(root, "packages/ma-client/CHANGELOG.md");
const bump = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!["patch", "minor", "major"].includes(bump)) {
    console.error("Usage: node tools/release-client.mjs <patch|minor|major> [--dry-run]");
    process.exit(1);
}

const git = (cmd, inherit = false) => execSync(`git ${cmd}`, { cwd: root, stdio: inherit ? "inherit" : "pipe" })?.toString().trim();
if (!dryRun && git("status --porcelain --untracked-files=no")) {
    console.error("  ❌ Working tree has uncommitted changes. Commit or stash them first.");
    process.exit(1);
}

const pkgRaw = fs.readFileSync(pkgPath, "utf8");
const current = JSON.parse(pkgRaw).version;
let [a, b, c] = current.split(".").map(Number);
const first = !git("tag --list ma-client-v*");
if (!first) {
    if (bump === "patch") c++;
    else if (bump === "minor") [b, c] = [b + 1, 0];
    else [a, b, c] = [a + 1, 0, 0];
}
const version = `${a}.${b}.${c}`;
const tag = `ma-client-v${version}`;
console.log(`\nmusic-assistant-client ${current} → ${version} (tag ${tag})${first ? " — first release" : ""}`);
if (git(`tag --list ${tag}`)) {
    console.error(`  ❌ Tag ${tag} already exists.`);
    process.exit(1);
}

const changelog = fs.readFileSync(changelogPath, "utf8").replace(/\r\n/g, "\n");
const unreleased = /\n## \[Unreleased\]\n([\s\S]*?)(?=\n## \[|$)/.exec(changelog);
if (!unreleased?.[1].trim()) {
    console.error("  ❌ packages/ma-client/CHANGELOG.md has nothing under [Unreleased] — write the release notes first.");
    process.exit(1);
}
if (dryRun) {
    console.log("  (dry run — nothing written)\n");
    process.exit(0);
}

fs.writeFileSync(pkgPath, pkgRaw.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`));
fs.writeFileSync(changelogPath, changelog.replace("\n## [Unreleased]\n", `\n## [Unreleased]\n\n## [${version}] — ${new Date().toISOString().slice(0, 10)}\n`));
git(`add "${pkgPath}" "${changelogPath}"`);
git(`commit -m "chore: release music-assistant-client ${version}"`);
git(`tag -a ${tag} -m "music-assistant-client ${version}"`);
console.log("  📤 Pushing…");
git("push", true);
git(`push origin ${tag}`, true);
console.log(`\n✔  ${tag} pushed. The "Publish client" workflow publishes it to npm.\n`);
