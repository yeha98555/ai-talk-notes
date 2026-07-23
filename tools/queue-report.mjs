#!/usr/bin/env node
/*
 * queue-report.mjs — render the pending-video backlog as a Markdown body for the
 * GitHub review Issue, and detect how many pending videos this poll added.
 *
 *   node tools/queue-report.mjs           print the Issue body (all pending)
 *   node tools/queue-report.mjs --check   print only the count of NEWLY-added
 *                                         pending videos (working tree vs HEAD)
 *
 * "Newly added" = in the working queue.json but not in the committed one, so the
 * poll workflow can stay quiet when nothing new is worth reviewing.
 * Dependency-free. Run from the repo root.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const queue = JSON.parse(fs.readFileSync(path.join(ROOT, "queue.json"), "utf8"));

// Previous committed queue (empty if queue.json is untracked or on first run).
let prev = [];
try {
    prev = JSON.parse(execSync("git show HEAD:queue.json", { cwd: ROOT, encoding: "utf8" }));
} catch {
    prev = [];
}
const prevIds = new Set(prev.map((v) => v.videoId));

const pending = queue
    .filter((v) => v.status === "pending")
    .sort((a, b) => (b.published || "").localeCompare(a.published || ""));
const newlyPending = pending.filter((v) => !prevIds.has(v.videoId));

if (process.argv.includes("--check")) {
    console.log(newlyPending.length);
    process.exit(0);
}

const newIds = new Set(newlyPending.map((v) => v.videoId));
const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
const row = (v) =>
    `| ${newIds.has(v.videoId) ? "✨ " : ""}[${esc(v.title)}](${v.url}) | ${esc(v.channel)} | ${(v.published || "").slice(0, 10)} |`;

const lines = [
    "# 📥 Video review queue",
    "",
    `**${pending.length}** video(s) waiting to be picked` +
        (newlyPending.length ? ` · ✨ **${newlyPending.length}** new since last poll` : "") +
        ".",
    "",
    "Run `node tools/review.mjs` locally to Approve / Reject, then commit `queue.json`.",
    "",
    "| Video | Channel | Published |",
    "| --- | --- | --- |",
    ...pending.map(row),
    "",
    "<sub>Auto-updated by `.github/workflows/poll.yml` — do not edit by hand.</sub>",
];
console.log(lines.join("\n"));
