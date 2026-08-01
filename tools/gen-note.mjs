#!/usr/bin/env node
/*
 * gen-note.mjs — turn an approved queue video into a house-style note draft.
 *
 * For each queue item with status "approved" (no docId yet): fetch its transcript,
 * ask Claude for an English note draft + category (call 1), then a Traditional-
 * Chinese translation of that finalized note (call 2), then write doc-N.md
 * (+ zh mirror), append to order.json, insert a card into the chosen cat-K.md
 * (+ zh mirror) at its alphabetical position, bump the hard-coded talk count, and
 * backfill the queue item to "published". Every call's fields are validated with
 * prose-check (same rules as the build-time content-check) and retried at most
 * once; a video that still fails stays "approved" and the batch continues. A video
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
import { checkDraftFields } from "./prose-check.mjs";

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

// Two calls per video (PRD-v4): call 1 drafts the English note + category from
// the transcript; call 2 translates the FINALIZED English note (no transcript)
// into zh. Each call gets the full max_tokens budget — the single-call version
// ran out of room on long talks and returned schema-valid JSON with truncated
// prose. `category` exists only in EN_SCHEMA, so the zh call structurally
// cannot override the classification.
const EN_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["title", "speaker", "category", "body", "card_summary"],
    properties: {
        title: { type: "string" },
        speaker: { type: "string" },
        category: { type: "string", enum: CATS },
        body: { type: "string" },
        card_summary: { type: "string" },
    },
};

const ZH_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["zh_title", "zh_speaker", "zh_body", "zh_card_summary"],
    properties: {
        zh_title: { type: "string" },
        zh_speaker: { type: "string" },
        zh_body: { type: "string" },
        zh_card_summary: { type: "string" },
    },
};

const buildEnPrompt = (item, transcript) => {
    const example = readText("src/notes/doc-100.md");
    const catList = catMeta.map((c) => `${c.k}: ${c.heading} — ${c.desc}`).join("\n");
    const system =
        "You distill AI-engineering conference talks into concise, information-dense notes that match an existing site's house style. " +
        "Study this example note (frontmatter + body) and mirror its register, paragraph rhythm, and depth:\n\n" +
        example +
        "\n\nRules: write flowing prose in blank-line-separated paragraphs (no headings, no bullet dumps unless the talk is genuinely a list). " +
        "Be faithful to the transcript; do not invent facts. `speaker` is \"Name, Company\" (infer from the transcript/title; use the name only if the company is unclear). " +
        "Pick the single best-fitting category.";
    const user =
        `Video title: ${item.title}\nChannel: ${item.channel}\nURL: ${item.url}\n\n` +
        `Categories:\n${catList}\n\n` +
        `Transcript:\n${transcript}`;
    return { system, user };
};

const buildZhPrompt = (en) => {
    const example = readText("src/i18n/zh/notes/doc-100.md");
    const system =
        "You translate finalized English AI-engineering talk notes into Traditional Chinese, Taiwan style (zh-Hant), matching an existing site's zh house style. " +
        "Study this example zh note (frontmatter + body) and mirror its register:\n\n" +
        example +
        "\n\nRules: translate faithfully — do not add, drop, or reorder information; keep the same paragraph structure as the English. " +
        "Keep product/company names, people's names, and established jargon (RAG, LLM, MCP, …) as-is.";
    const user =
        `English note to translate:\n\n---\ntitle: ${en.title}\nspeaker: ${en.speaker}\n---\n${en.body.trim()}\n\n` +
        `Card summary (translate as zh_card_summary):\n${en.card_summary.trim()}`;
    return { system, user };
};

const MAX_TOKENS = 16000;

const callClaude = async ({ system, user }, schema, retryNote) => {
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
            max_tokens: MAX_TOKENS,
            thinking: { type: "adaptive" },
            output_config: { effort: "high", format: { type: "json_schema", schema } },
            system,
            messages: [{ role: "user", content: retryNote ? `${user}\n\n${retryNote}` : user }],
        }),
    });
    if (!res.ok) throw new Error(`Messages API HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    // Truncation's leading indicator is output riding close to the budget —
    // surface usage on every call so the 16k ceiling can be judged from logs.
    const out = data.usage?.output_tokens ?? 0;
    const pct = Math.round((out / MAX_TOKENS) * 100);
    console.log(`    tokens: in=${data.usage?.input_tokens ?? "?"} out=${out} (out/max=${pct}%)${pct >= 80 ? " ⚠ near max_tokens" : ""}`);
    if (data.stop_reason === "refusal") throw new Error(`model refused: ${data.stop_details?.category}`);
    if (data.stop_reason === "max_tokens") throw new Error("hit max_tokens — draft truncated");
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    return JSON.parse(text);
};

// Draft-time gate (PRD-v4): validate every call's fields with the same rules
// content-check applies at build time, and retry AT MOST ONCE with the failures
// spelled out. The model can return schema-valid JSON whose strings were cut
// off mid-sentence (or literal "placeholder" filler) when it runs low on
// budget — stop_reason checks can't see that. Still failing after the retry
// throws, which the per-video catch turns into "left approved for retry"
// (nothing written, batch continues). Worst case per video: 4 calls.
const callWithRetry = async (prompt, schema, label) => {
    let draft = await callClaude(prompt, schema);
    let problems = checkDraftFields(draft);
    if (!problems.length) return draft;
    console.log(`    ✗ ${label} draft failed checks — retrying once:\n      ${problems.join("\n      ")}`);
    draft = await callClaude(
        prompt,
        schema,
        `Previous attempt failed checks: ${problems.join("; ")}. Ensure every field is complete prose ending with terminal punctuation; never output the word "placeholder".`,
    );
    problems = checkDraftFields(draft);
    if (problems.length) throw new Error(`${label} draft still incomplete after retry (${problems[0]})`);
    return draft;
};

const stubEnDraft = (item) => ({
    title: item.title,
    speaker: "Dry Run, Placeholder Co.",
    category: "C",
    body: `(--dry-run placeholder) A stub draft used to exercise the file-writing pipeline for "${item.title}".\n\nA second paragraph to verify blank-line paragraph handling renders correctly.`,
    card_summary: `Placeholder one-paragraph card summary for "${item.title}" (dry run).`,
});

const stubZhDraft = (item) => ({
    zh_title: item.title,
    zh_speaker: "Dry Run, Placeholder Co.",
    zh_body: "（--dry-run 佔位內容）這是用來驗證寫檔管線的假草稿,不含真實重點。\n\n第二段落,確認段落與空行處理正確。",
    zh_card_summary: "假的一段式卡片摘要(dry run)。",
});

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
    const processed = []; // { videoId, docId, title } — for the Phase-4 batch record
    const cats = new Set();
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
            if (DRY) {
                // Stubs must pass the same gate — keeps dry-run an honest
                // smoke test of the checker (mind sentence-final punctuation
                // when editing stub copy).
                draft = { ...stubEnDraft(item), ...stubZhDraft(item) };
                const problems = checkDraftFields(draft);
                if (problems.length) throw new Error(`stub draft failed checks (${problems[0]})`);
            } else {
                const en = await callWithRetry(buildEnPrompt(item, text), EN_SCHEMA, "en");
                const zh = await callWithRetry(buildZhPrompt(en), ZH_SCHEMA, "zh");
                draft = { ...en, ...zh };
            }
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
        processed.push({ videoId: item.videoId, docId, title: item.title });
        cats.add(draft.category);
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
    // Compact branch name: a range, not every id joined — a long list blows past
    // GitHub's 255-byte ref limit once a batch has ~20+ docs.
    const nums = addedDocs.map((d) => +d.replace("doc-", ""));
    const branch =
        addedDocs.length === 1 ? `gen-note/${addedDocs[0]}` : `gen-note/doc-${Math.min(...nums)}-${Math.max(...nums)}`;
    const title = `Add ${addedDocs.join(", ")} (gen-note draft)`;
    const body =
        "Auto-generated by `tools/gen-note.mjs`. Review the note prose, speaker, and category " +
        "before merging — the classification is only a suggestion. CI runs build + i18n-check.";
    // Stage ONLY the files this run touched — never `git add -A`, which would sweep
    // unrelated working-tree changes (e.g. an untracked memory/ file) into the PR.
    const touched = [
        "queue.json",
        "src/notes/order.json",
        ...addedDocs.flatMap((d) => [`src/notes/${d}.md`, `src/i18n/zh/notes/${d}.md`]),
        ...[...cats].flatMap((k) => [`src/sections/cat-${k}.md`, `src/i18n/zh/sections/cat-${k}.md`]),
        ...COUNT_FILES,
    ].filter((rel) => fs.existsSync(p(rel)));
    out("git", ["switch", "-c", branch]);
    out("git", ["add", "--", ...touched]);
    out("git", ["commit", "-m", title]);
    out("git", ["push", "-u", "origin", branch]);
    let prUrl = "";
    try {
        prUrl = out("gh", ["pr", "create", "--base", base, "--head", branch, "--title", title, "--body", body]);
        console.log(`Review PR → ${prUrl}`);
    } catch {
        console.log(`Pushed ${branch}. Open the PR manually: gh pr create --base ${base} --head ${branch}`);
    }
    // Phase 4: record "this batch → PR" back on the open review Issue so each queue
    // batch maps to its PR. Best-effort — a missing issue or a comment failure must
    // never fail the run (the PR is already open).
    if (prUrl) {
        try {
            const num = out("gh", ["issue", "list", "--label", "video-queue", "--state", "open", "--json", "number", "--jq", ".[0].number // empty"]);
            if (num) {
                const prNum = prUrl.split("/").pop();
                const rows = processed.map((x) => `- \`${x.docId}\` · ${x.title} (${x.videoId})`).join("\n");
                const comment = `🧾 這批 note 草稿 → PR #${prNum}：${prUrl}\n\n${rows}`;
                run("gh", ["issue", "comment", num, "--body", comment], { stdio: ["ignore", "ignore", "inherit"] });
                console.log(`Recorded this batch on review issue #${num}`);
            } else {
                console.log("No open video-queue issue found — batch not recorded (skipped).");
            }
        } catch (e) {
            console.log(`Could not record batch on the review issue (skipped): ${e.message}`);
        }
    }
};

await main();
