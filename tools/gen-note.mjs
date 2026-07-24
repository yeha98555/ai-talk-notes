#!/usr/bin/env node
/*
 * gen-note.mjs — turn an approved queue video into a house-style note draft.
 *
 * For each queue item with status "approved" (no docId yet): fetch its transcript,
 * ask Claude for a note draft + Traditional-Chinese translation + a category
 * suggestion, then write doc-N.md (+ zh mirror), append to order.json, insert a
 * card into the chosen cat-K.md (+ zh mirror) at its alphabetical position, bump
 * the hard-coded talk count, and backfill the queue item to "published". A video
 * with no captions is marked "needs-transcript" and skipped — never hard-produced.
 *
 * The category suggestion and every draft are advisory: the Phase-4 PR review is
 * the quality gate. Dependency-free (raw fetch to the Messages API; the project is
 * deliberately zero-dependency). The API key is read from ANTHROPIC_API_KEY and
 * never written anywhere.
 *
 *   node tools/gen-note.mjs               process all approved videos (needs key)
 *   node tools/gen-note.mjs --dry-run     stub the model call; exercise the writes
 *   node tools/gen-note.mjs --pr          after generating, open a review PR (gh)
 *   node tools/gen-note.mjs <videoId>...  restrict to specific videos
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { fetchTranscript } from "./transcript.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Summarize + translate + classify is a single-call task with a few-shot style
// example and a human PR review after, so Sonnet is plenty. Override per run with
// GEN_NOTE_MODEL=claude-opus-4-8 for an unusually hard talk.
const MODEL = process.env.GEN_NOTE_MODEL || "claude-sonnet-5";
const p = (...f) => path.join(ROOT, ...f);
const readText = (f) => fs.readFileSync(p(f), "utf8");
const readJSON = (f) => JSON.parse(readText(f));
const writeJSON = (f, v) => fs.writeFileSync(p(f), JSON.stringify(v, null, 2) + "\n");
const writeText = (f, v) => fs.writeFileSync(p(f), v);

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const PR = argv.includes("--pr");
const onlyIds = new Set(argv.filter((a) => /^[A-Za-z0-9_-]{11}$/.test(a)));

const CATS = "ABCDEFGHI".split("");
// Read each category's heading/desc so the model classifies against real options.
const catMeta = CATS.map((k) => {
    const fm = readText(`src/sections/cat-${k}.md`).match(/^---\n([\s\S]*?)\n---/)[1];
    const heading = (fm.match(/^heading:\s*(.+)$/m) || [])[1] || "";
    const desc = (fm.match(/^desc:\s*(.+)$/m) || [])[1] || "";
    return { k, heading, desc };
});

// ---- draft source: Claude (live) or a deterministic stub (--dry-run) ----------

const DRAFT_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["title", "speaker", "category", "body", "card_summary", "zh_title", "zh_speaker", "zh_body", "zh_card_summary"],
    properties: {
        title: { type: "string" },
        speaker: { type: "string" },
        category: { type: "string", enum: CATS },
        body: { type: "string" },
        card_summary: { type: "string" },
        zh_title: { type: "string" },
        zh_speaker: { type: "string" },
        zh_body: { type: "string" },
        zh_card_summary: { type: "string" },
    },
};

const buildPrompt = (item, transcript) => {
    const example = readText("src/notes/doc-100.md");
    const catList = catMeta.map((c) => `${c.k}: ${c.heading} — ${c.desc}`).join("\n");
    const system =
        "You distill AI-engineering conference talks into concise, information-dense notes that match an existing site's house style. " +
        "Study this example note (frontmatter + body) and mirror its register, paragraph rhythm, and depth:\n\n" +
        example +
        "\n\nRules: write flowing prose in blank-line-separated paragraphs (no headings, no bullet dumps unless the talk is genuinely a list). " +
        "Be faithful to the transcript; do not invent facts. `speaker` is \"Name, Company\" (infer from the transcript/title; use the name only if the company is unclear). " +
        "Translate the Chinese fields into Traditional Chinese, Taiwan style (zh-Hant); keep product/company names and established jargon (RAG, LLM, MCP, …) as-is. " +
        "Pick the single best-fitting category.";
    const user =
        `Video title: ${item.title}\nChannel: ${item.channel}\nURL: ${item.url}\n\n` +
        `Categories:\n${catList}\n\n` +
        `Transcript:\n${transcript}`;
    return { system, user };
};

const callClaude = async ({ system, user }) => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        body: JSON.stringify({
            model: MODEL,
            max_tokens: 16000,
            thinking: { type: "adaptive" },
            output_config: { effort: "high", format: { type: "json_schema", schema: DRAFT_SCHEMA } },
            system,
            messages: [{ role: "user", content: user }],
        }),
    });
    if (!res.ok) throw new Error(`Messages API HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    if (data.stop_reason === "refusal") throw new Error(`model refused: ${data.stop_details?.category}`);
    if (data.stop_reason === "max_tokens") throw new Error("hit max_tokens — draft truncated");
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    return JSON.parse(text);
};

const stubDraft = (item) => {
    const zh = "（--dry-run 佔位內容）這是用來驗證寫檔管線的假草稿,不含真實重點。\n\n第二段落,確認段落與空行處理正確。";
    return {
        title: item.title,
        speaker: "Dry Run, Placeholder Co.",
        category: "C",
        body: `(--dry-run placeholder) A stub draft used to exercise the file-writing pipeline for "${item.title}".\n\nA second paragraph to verify blank-line paragraph handling renders correctly.`,
        card_summary: `Placeholder one-paragraph card summary for "${item.title}" (dry run).`,
        zh_title: item.title,
        zh_speaker: "Dry Run, Placeholder Co.",
        zh_body: zh,
        zh_card_summary: "假的一段式卡片摘要(dry run)。",
    };
};

// ---- cat-K.md card insertion (alphabetical by title, docs stays aligned) ------

const splitCards = (body) => body.trim().split(/\n(?=## )/).filter(Boolean);
const cardTitle = (block) => block.match(/^## (.+)$/m)[1].trim();
// First index whose existing title sorts after `title`; -1 → append.
const insertIndex = (cards, title) => {
    const i = cards.findIndex((c) => cardTitle(c).localeCompare(title, "en", { sensitivity: "base" }) > 0);
    return i === -1 ? cards.length : i;
};

const insertEnglishCard = (k, docId, title, speaker, summary) => {
    const raw = readText(`src/sections/cat-${k}.md`);
    const [, fm, body] = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    const docs = fm.match(/^docs:\s*(.+)$/m)[1].split(",").map((s) => s.trim());
    const cards = splitCards(body);
    const idx = insertIndex(cards, title);
    cards.splice(idx, 0, `## ${title}\n@ ${speaker}\n${summary}`);
    docs.splice(idx, 0, String(docId));
    const newFm = fm.replace(/^docs:\s*.+$/m, `docs: ${docs.join(", ")}`);
    writeText(`src/sections/cat-${k}.md`, `---\n${newFm}\n---\n${cards.join("\n\n")}\n`);
    return idx;
};

// zh mirror: no docs list; insert at the SAME positional index as English.
const insertZhCard = (k, idx, title, speaker, summary) => {
    const rel = `src/i18n/zh/sections/cat-${k}.md`;
    if (!fs.existsSync(p(rel))) return;
    const raw = readText(rel);
    const [, fm, body] = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    const cards = splitCards(body);
    const at = Math.min(idx, cards.length);
    cards.splice(at, 0, `## ${title}\n@ ${speaker}\n${summary}`);
    writeText(rel, `---\n${fm}\n---\n${cards.join("\n\n")}\n`);
};

// ---- talk-count bump (CONTRIBUTING's hard-coded spots) -------------------------

const COUNT_FILES = [
    "src/partials/hero.html",
    "src/sections/overview.html",
    "src/sections/themes.html",
    "src/partials/footer.html",
    "src/i18n/zh/partials/hero.html",
    "src/i18n/zh/sections/overview.html",
    "src/i18n/zh/sections/themes.html",
    "src/i18n/zh/partials/footer.html",
    "README.md",
    "README.zh-TW.md",
];

// Replace the total count only. Anchor on the noun that follows the number
// (</b> in the hero metric, or " talks/conference/Markdown/篇/場"), so a bare
// number inside a talk title — e.g. "Evals 101" — is never touched. A file that
// unexpectedly reports 0 hits is logged for the human to check.
const bumpCount = (oldN, newN) => {
    const re = new RegExp(`(?<![\\w#-])${oldN}(?=</b>| (?:talks|conference|Markdown|篇|場))`, "g");
    const changed = [];
    for (const f of COUNT_FILES) {
        if (!fs.existsSync(p(f))) continue;
        const before = readText(f);
        let hits = 0;
        const after = before.replace(re, () => (hits++, String(newN)));
        if (hits) {
            writeText(f, after);
            changed.push(`${f} (${hits})`);
        }
    }
    return changed;
};

// ---- main ---------------------------------------------------------------------

const main = async () => {
    const queue = readJSON("queue.json");
    const order = readJSON("src/notes/order.json");
    let nextNum = Math.max(0, ...order.map((s) => +s.replace("doc-", ""))) + 1;
    const startCount = order.length;

    let targets = queue.filter((v) => v.status === "approved" && !v.docId);
    if (onlyIds.size) targets = targets.filter((v) => onlyIds.has(v.videoId));
    if (!targets.length) {
        console.log("No approved videos to process (status=approved, docId=null).");
        return;
    }
    console.log(`${targets.length} approved video(s)${DRY ? " [dry-run]" : ""}. Next id: doc-${nextNum}`);

    const addedDocs = [];
    for (const item of targets) {
        process.stdout.write(`\n▶ ${item.videoId}  ${item.title.slice(0, 60)}\n`);
        const { text, reason } = await fetchTranscript(item.videoId);
        if (!text) {
            item.note = "needs-transcript";
            console.log(`  ⚠ no transcript (${reason}) — marked needs-transcript, skipped`);
            continue;
        }
        console.log(`  transcript: ${text.length} chars`);

        let draft;
        try {
            draft = DRY ? stubDraft(item) : await callClaude(buildPrompt(item, text));
        } catch (err) {
            console.log(`  ✗ draft failed: ${err.message} — left approved for retry`);
            continue;
        }

        const docId = `doc-${nextNum}`;
        writeText(`src/notes/${docId}.md`, `---\ntitle: ${draft.title}\nspeaker: ${draft.speaker}\nvideo: ${item.url}\n---\n${draft.body.trim()}\n`);
        writeText(`src/i18n/zh/notes/${docId}.md`, `---\ntitle: ${draft.zh_title}\nspeaker: ${draft.zh_speaker}\n---\n${draft.zh_body.trim()}\n`);
        order.push(docId);
        const idx = insertEnglishCard(draft.category, nextNum, draft.title, draft.speaker, draft.card_summary.trim());
        insertZhCard(draft.category, idx, draft.zh_title, draft.zh_speaker, draft.zh_card_summary.trim());
        item.docId = docId;
        item.status = "published";
        console.log(`  ✓ ${docId} → category ${draft.category} (card #${idx + 1})`);
        addedDocs.push(docId);
        nextNum++;
    }

    const added = addedDocs.length;
    if (!added) {
        console.log("\nNo notes produced.");
        return;
    }
    writeJSON("src/notes/order.json", order);
    writeJSON("queue.json", queue);
    const changed = bumpCount(startCount, startCount + added);
    console.log(`\n+${added} note(s): ${addedDocs.join(", ")}. Talk count ${startCount} → ${startCount + added}.`);
    console.log(`  count bumped in: ${changed.join(", ") || "(no files matched — check manually)"}`);

    if (!PR) {
        console.log("Next: npm run build && node tools/i18n-check.mjs, then review the diff.");
        return;
    }
    // Open a review PR: build, branch off the current branch, commit, push, gh pr create.
    // execFile with arg arrays avoids shell-quoting issues in titles/bodies.
    const run = (file, args, opts = {}) => execFileSync(file, args, { cwd: ROOT, ...opts });
    const out = (file, args) => run(file, args, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
    console.log("\nBuilding and opening a review PR…");
    run("npm", ["run", "build"], { stdio: "inherit" });
    const base = out("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
    const branch = `gen-note/${addedDocs.join("-")}`;
    const title = `Add ${addedDocs.join(", ")} (gen-note draft)`;
    const body =
        "Auto-generated by `tools/gen-note.mjs`. Review the note prose, speaker, and category " +
        "before merging — the classification is only a suggestion. CI runs build + i18n-check.";
    out("git", ["switch", "-c", branch]);
    out("git", ["add", "-A"]);
    out("git", ["commit", "-m", title]);
    out("git", ["push", "-u", "origin", branch]);
    try {
        const url = out("gh", ["pr", "create", "--base", base, "--head", branch, "--title", title, "--body", body]);
        console.log(`Review PR → ${url}`);
    } catch {
        console.log(`Pushed ${branch}. Open the PR manually: gh pr create --base ${base} --head ${branch}`);
    }
};

await main();
