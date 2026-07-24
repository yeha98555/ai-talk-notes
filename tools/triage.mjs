#!/usr/bin/env node
/*
 * triage.mjs — pre-screen the pending queue with GitHub Models (gpt-4o-mini) and
 * render the GitHub review Issue body as an interactive control panel: one block
 * per pending video with a hidden `<!-- vid:ID -->` anchor and ✅/❌ task-list
 * checkboxes. That anchor + checkbox pair is the CONTRACT the Phase-3
 * queue-control workflow parses, so keep it stable.
 *
 *   node tools/triage.mjs      print the Issue body to stdout
 *
 * Judgement is title-only and advisory — the real gates are gen-note (reads the
 * transcript) and the human PR review. If the model call fails (no token, HTTP
 * error, bad JSON) it DEGRADES to a plain pending list that still carries the
 * anchors + checkboxes, so the control panel keeps working. Never hard-fails.
 *
 * Auth: GitHub Models via `GITHUB_TOKEN` (Bearer). In Actions grant `models: read`.
 * Dependency-free. Run from the repo root.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readText = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const ENDPOINT = process.env.GH_MODELS_ENDPOINT || "https://models.github.ai/inference/chat/completions";
const MODEL = process.env.GH_MODELS_MODEL || "openai/gpt-4o-mini";
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

// ---- load queue + categories --------------------------------------------------

const queue = JSON.parse(readText("queue.json"));
const pending = queue
    .filter((v) => v.status === "pending")
    .sort((a, b) => (b.published || "").localeCompare(a.published || ""));

// Previous committed queue → mark which pending items are new since last poll.
let prevIds = new Set();
try {
    prevIds = new Set(JSON.parse(execSync("git show HEAD:queue.json", { cwd: ROOT, encoding: "utf8" })).map((v) => v.videoId));
} catch {
    prevIds = new Set();
}
const isNew = (v) => !prevIds.has(v.videoId);

// Category headings/descs so the model classifies against the real A–I options.
const CATS = "ABCDEFGHI".split("");
const catMeta = CATS.map((k) => {
    const fm = (readText(`src/sections/cat-${k}.md`).match(/^---\n([\s\S]*?)\n---/) || [])[1] || "";
    const heading = (fm.match(/^heading:\s*(.+)$/m) || [])[1] || "";
    const desc = (fm.match(/^desc:\s*(.+)$/m) || [])[1] || "";
    return { k, heading, desc };
});

// ---- model triage -------------------------------------------------------------

const buildMessages = () => {
    const catList = catMeta.map((c) => `${c.k}: ${c.heading} — ${c.desc}`).join("\n");
    const system =
        "你是一個技術內容策展助手，替一個「AI 工程演講筆記」網站預篩 YouTube 影片。" +
        "只憑『標題 + 頻道』判斷，替每支影片給出：\n" +
        "- tier：Strong（明顯是切題的技術演講：conference/meetup talk、深入架構/評測/基礎設施主題）｜" +
        "Maybe（可能相關但標題模糊，或像 keynote/panel 技術含量待確認——不確定就給 Maybe）｜" +
        "Skip（多半不合：預告/宣傳/產品廣告/贊助/純 hype 無工程內容，或明顯離題）。\n" +
        "- category：A–I 其中一個字母（僅 Strong/Maybe 需要；Skip 給 null）。\n" +
        "- reason：一句貼著實際標題的理由（繁體中文，20 字內，不要空泛）。\n" +
        "- duplicateOf：若與清單中另一支是同一場演講的重貼，填那支的 videoId，否則 null。\n" +
        "寧可標 Maybe 也不要輕易 Skip（標題模糊時）。只輸出 JSON。";
    const user =
        `分類 A–I：\n${catList}\n\n` +
        `待判斷影片（videoId ｜ channel ｜ title）：\n` +
        pending.map((v) => `${v.videoId} | ${v.channel} | ${v.title}`).join("\n") +
        `\n\n輸出 JSON 物件：{"items":[{"videoId","tier","category","reason","duplicateOf"}]}，涵蓋上面每一支。`;
    return [
        { role: "system", content: system },
        { role: "user", content: user },
    ];
};

// Returns Map<videoId, {tier, category, reason, duplicateOf}> or throws.
const callModel = async () => {
    if (!TOKEN) throw new Error("no GITHUB_TOKEN");
    if (!pending.length) return new Map();
    const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model: MODEL,
            temperature: 0.2,
            response_format: { type: "json_object" },
            messages: buildMessages(),
        }),
        signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`GitHub Models HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const content = (await res.json())?.choices?.[0]?.message?.content || "";
    const items = JSON.parse(content).items;
    if (!Array.isArray(items)) throw new Error("model JSON missing items[]");
    const norm = (t) => {
        const s = String(t || "").toLowerCase();
        return s.startsWith("strong") ? "Strong" : s.startsWith("skip") ? "Skip" : "Maybe";
    };
    const map = new Map();
    for (const it of items) {
        if (!it?.videoId) continue;
        const category = CATS.includes(it.category) ? it.category : null;
        map.set(it.videoId, {
            tier: norm(it.tier),
            category,
            reason: String(it.reason || "").replace(/\s+/g, " ").trim(),
            duplicateOf: it.duplicateOf || null,
        });
    }
    return map;
};

// ---- render Issue body --------------------------------------------------------

const escLink = (s) => String(s).replace(/[[\]]/g, "").replace(/\r?\n/g, " ").trim();
const TIERS = [
    { key: "Strong", emoji: "⭐", label: "建議收" },
    { key: "Maybe", emoji: "🤔", label: "待確認" },
    { key: "Skip", emoji: "⏭️", label: "建議略過" },
];

// One video block: header + hidden anchor + reason line + the two checkboxes.
// The `<!-- vid:ID -->` anchor and the ✅/❌ task-list items are the Phase-3 contract.
const block = (v, t) => {
    const date = (v.published || "").slice(0, 10);
    const head = `### [${escLink(v.title)}](${v.url}) · ${escLink(v.channel)} · ${date}${isNew(v) ? " ✨" : ""}`;
    let info;
    if (t && t.category && t.tier !== "Skip") info = `建議分類 **${t.category}**｜${t.reason || "—"}`;
    else if (t) info = t.reason || "—";
    else info = "_（triage 暫不可用，請自行判斷）_";
    if (t?.duplicateOf) info += `　⚠️ 疑似與 \`${t.duplicateOf}\` 重複`;
    return [head, `<!-- vid:${v.videoId} -->`, info, "- [ ] ✅ approve", "- [ ] ❌ reject", ""].join("\n");
};

const newCount = pending.filter(isNew).length;
const header = [
    "# 📥 Video review queue",
    "",
    `**${pending.length}** 支待挑選` + (newCount ? ` · ✨ **${newCount}** 支為本次新增` : "") + "。",
    "",
    "在每支影片下勾選 **✅ approve** 或 **❌ reject**（只有 repo 負責人的勾選會生效；兩者留白＝維持 pending）。",
];

let bodyLines;
let triage = null;
try {
    triage = await callModel();
} catch (e) {
    process.stderr.write(`triage: model unavailable, degrading to plain list (${e.message})\n`);
}

if (pending.length === 0) {
    bodyLines = [...header, "", "目前沒有待挑選的影片。"];
} else if (triage) {
    header.push(
        "Triage 由 GitHub Models（`gpt-4o-mini`）產生，僅供參考——真正把關在 gen-note 逐字稿與 PR 複審。",
    );
    const sections = [];
    for (const { key, emoji, label } of TIERS) {
        const group = pending.filter((v) => (triage.get(v.videoId)?.tier || "Maybe") === key);
        if (!group.length) continue;
        sections.push(`## ${emoji} ${label}（${group.length}）`, "", ...group.map((v) => block(v, triage.get(v.videoId))));
    }
    bodyLines = [...header, "", "---", "", ...sections];
} else {
    // Degraded: no tiers, but every item still carries anchor + checkboxes.
    bodyLines = [...header, "", "---", "", ...pending.map((v) => block(v, null))];
}

bodyLines.push("<sub>Auto-updated by `.github/workflows/poll.yml` — 勾選由 `queue-control.yml` 套用。</sub>");
process.stdout.write(bodyLines.join("\n") + "\n");
