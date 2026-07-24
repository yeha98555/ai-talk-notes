#!/usr/bin/env node
/*
 * queue-apply.mjs — apply the checkbox choices from the review Issue body to
 * queue.json, and emit the re-rendered body. Driven by queue-control.yml when the
 * owner ticks the bottom "🚀 送出" checkbox.
 *
 *   node tools/queue-apply.mjs --body <body.md> [--out <newbody.md>]
 *
 * Contract (rendered by tools/triage.mjs): each video is a block
 *     ### <head>
 *     <!-- vid:VIDEOID -->
 *     <reason/info line>
 *     - [ ] ✅ approve
 *     - [ ] ❌ reject
 * and the bottom carries `<!-- submit -->` + a `- [ ] 🚀 …` submit checkbox.
 *
 * Behaviour: only acts when submit is checked. ✅ → approved; ❌ → rejected (reason
 * copied into `note` if empty); both/neither → left pending. Only touches items
 * currently `pending`. Re-renders the body: drop processed blocks, fix tier counts,
 * uncheck submit. DETERMINISTIC — no model call, so applying never depends on GitHub
 * Models being up. Prints a one-line summary to stdout (for the audit comment);
 * writes the new body to --out (or stdout if absent, after the summary line).
 * Dependency-free. Run from the repo root.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const getArg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : null;
};
const bodyPath = getArg("--body");
const outPath = getArg("--out");
if (!bodyPath) {
    console.error("usage: node tools/queue-apply.mjs --body <body.md> [--out <newbody.md>]");
    process.exit(2);
}

const body = fs.readFileSync(bodyPath, "utf8");
const lines = body.split(/\r?\n/);
const checked = (l) => /^\s*-\s*\[[xX]\]/.test(l || "");

// ---- submit gate --------------------------------------------------------------

const submitAnchor = lines.findIndex((l) => l.includes("<!-- submit -->"));
let submitLine = -1;
if (submitAnchor >= 0) {
    for (let i = submitAnchor + 1; i < lines.length; i++) {
        if (/🚀/.test(lines[i]) && /^\s*-\s*\[/.test(lines[i])) {
            submitLine = i;
            break;
        }
    }
}
const submitted = submitLine >= 0 && checked(lines[submitLine]);
if (!submitted) {
    // Nothing to do — queue-control also guards on this, but be safe/idempotent.
    process.stdout.write("no-submit\n");
    if (outPath) fs.writeFileSync(outPath, body);
    process.exit(0);
}

// ---- parse video blocks -------------------------------------------------------

// Reason line → plain note: strip the "建議分類 **A**｜" prefix and any dup suffix.
const cleanReason = (info) => {
    let s = String(info || "")
        .replace(/^建議分類\s+\*\*[A-I]\*\*｜/, "")
        .replace(/　?⚠️.*$/, "")
        .trim();
    if (/^_?（?\s*triage/.test(s)) s = ""; // the "triage 暫不可用" placeholder
    return s || "從 issue reject";
};

const blocks = []; // { vid, start, end, approve, reject, reason }
for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/<!--\s*vid:([A-Za-z0-9_-]{11})\s*-->/);
    if (!m) continue;
    const start = i - 1; // the ### head line
    let end = i + 3; // the reject checkbox
    if (lines[end + 1] === "") end += 1; // swallow the trailing blank
    blocks.push({
        vid: m[1],
        start: start >= 0 ? start : i,
        end,
        approve: checked(lines[i + 2]),
        reject: checked(lines[i + 3]),
        reason: lines[i + 1],
    });
}

// ---- apply to queue.json ------------------------------------------------------

const queuePath = path.join(ROOT, "queue.json");
const queue = JSON.parse(fs.readFileSync(queuePath, "utf8"));
const byId = new Map(queue.map((v) => [v.videoId, v]));

const done = { approved: [], rejected: [], ambiguous: [], skipped: [] };
const processed = new Set(); // vids whose block should be dropped from the body

for (const b of blocks) {
    const item = byId.get(b.vid);
    if (!item || item.status !== "pending") {
        if (b.approve || b.reject) done.skipped.push(b.vid); // not pending anymore
        continue;
    }
    if (b.approve && b.reject) {
        done.ambiguous.push(b.vid); // both ticked — leave pending, keep block
        continue;
    }
    if (b.approve) {
        item.status = "approved";
        done.approved.push(b.vid);
        processed.add(b.vid);
    } else if (b.reject) {
        item.status = "rejected";
        if (!item.note) item.note = cleanReason(b.reason); // don't clobber a human note
        done.rejected.push(b.vid);
        processed.add(b.vid);
    }
    // neither ticked → leave pending, keep block
}

const changed = done.approved.length + done.rejected.length > 0;
if (changed) {
    fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2) + "\n");
    JSON.parse(fs.readFileSync(queuePath, "utf8")); // validate round-trips
}

// ---- re-render body: drop processed blocks, fix counts, uncheck submit --------

const drop = new Set();
for (const b of blocks) {
    if (!processed.has(b.vid)) continue;
    for (let i = b.start; i <= b.end; i++) drop.add(i);
}
let out = lines.filter((_, i) => !drop.has(i));

// Recompute tier header counts (## ⭐ …（N）); drop a section that is now empty.
const dropIdx = new Set();
for (let i = 0; i < out.length; i++) {
    const h = out[i].match(/^(##\s+(?:⭐|🤔|⏭️).*?（)\d+(）.*)$/);
    if (!h) continue;
    let count = 0;
    for (let j = i + 1; j < out.length; j++) {
        if (/^##\s/.test(out[j]) || out[j].includes("<!-- submit -->") || out[j].startsWith("<sub>")) break;
        if (/<!--\s*vid:/.test(out[j])) count++;
    }
    if (count === 0) {
        dropIdx.add(i);
        if (out[i + 1] === "") dropIdx.add(i + 1);
    } else {
        out[i] = `${h[1]}${count}${h[2]}`;
    }
}
out = out.filter((_, i) => !dropIdx.has(i));

// Uncheck the submit box so the panel is ready for the next batch.
out = out.map((l) => (/🚀/.test(l) ? l.replace(/^(\s*-\s*)\[[xX]\]/, "$1[ ]") : l));

const newBody = out.join("\n");

// ---- report -------------------------------------------------------------------

const list = (a) => (a.length ? a.join(", ") : "—");
const summary =
    `approved=${done.approved.length} rejected=${done.rejected.length}` +
    `${done.ambiguous.length ? ` ambiguous=${done.ambiguous.length}` : ""}` +
    `${done.skipped.length ? ` skipped=${done.skipped.length}` : ""}`;

if (outPath) {
    fs.writeFileSync(outPath, newBody);
    process.stdout.write(summary + "\n");
} else {
    process.stdout.write(summary + "\n---\n" + newBody + "\n");
}
// Detail to stderr (won't pollute --out; handy in the Action log / comment).
process.stderr.write(
    `applied: ${summary}\n` +
        `  approved: ${list(done.approved)}\n` +
        `  rejected: ${list(done.rejected)}\n` +
        (done.ambiguous.length ? `  ambiguous (both ticked, left pending): ${list(done.ambiguous)}\n` : "") +
        (done.skipped.length ? `  skipped (not pending): ${list(done.skipped)}\n` : ""),
);
