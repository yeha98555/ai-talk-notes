#!/usr/bin/env node
/*
 * content-check.mjs — fail the build when a source .md is incomplete: a literal
 * "placeholder" stub, an empty body/summary, a sentence cut off mid-word, or a
 * category that lists more docs than it has cards. Covers notes + category cards
 * across the English source AND every i18n locale.
 *
 * This is the guardrail for the gen-note draft failure mode: `node build.mjs`
 * happily renders "placeholder" and truncated prose, and i18n-check only catches
 * missing frontmatter (literal "undefined") + structural drift — neither notices
 * incomplete CONTENT. Dependency-free dev tool; never inlined. Exit 1 on any
 * problem. Run before `node build.mjs` (wired as `prebuild`) and in CI.
 *
 * The completeness rules themselves live in prose-check.mjs (shared with
 * gen-note's draft-time gate) — change them there, not here.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isStub, stripCites, endsMidSentence } from "./prose-check.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, "src");
const rel = (p) => path.relative(ROOT, p);
const problems = [];

function parseFrontmatter(text) {
    const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
    const data = {};
    if (m)
        for (const line of m[1].split("\n")) {
            const i = line.indexOf(":");
            if (i > -1) data[line.slice(0, i).trim()] = line.slice(i + 1).trim();
        }
    return { data, body: (m ? text.slice(m[0].length) : text).trim() };
}

const checkProse = (where, s) => {
    if (endsMidSentence(s))
        problems.push(`${where}: ends mid-sentence (truncated?) — "…${stripCites(s).slice(-40)}"`);
};

function checkNote(file) {
    const { data, body } = parseFrontmatter(fs.readFileSync(file, "utf8"));
    for (const [k, v] of Object.entries(data))
        if (isStub(v)) problems.push(`${rel(file)}: frontmatter '${k}' is a "placeholder" stub`);
    if (!body) return problems.push(`${rel(file)}: empty body`);
    if (isStub(body)) return problems.push(`${rel(file)}: body is a "placeholder" stub`);
    checkProse(`${rel(file)} body`, body);
}

function checkSection(file) {
    const { data, body } = parseFrontmatter(fs.readFileSync(file, "utf8"));
    for (const [k, v] of Object.entries(data))
        if (isStub(v)) problems.push(`${rel(file)}: frontmatter '${k}' is a "placeholder" stub`);

    // Card blocks: "## title" / "@ speaker" / summary…
    const blocks = body.split(/\n(?=## )/).filter((b) => b.trim().startsWith("## "));

    // A doc listed in `docs:` with no matching card renders an empty card. Only the
    // English source carries `docs:`; i18n cat files overlay text onto the same order.
    if (data.docs) {
        const n = data.docs.split(",").map((s) => s.trim()).filter(Boolean).length;
        if (blocks.length !== n)
            problems.push(`${rel(file)}: 'docs:' lists ${n} ids but body has ${blocks.length} card block(s)`);
    }

    blocks.forEach((b, i) => {
        const lines = b.split("\n").map((s) => s.trim()).filter(Boolean);
        const title = (lines[0] || "").replace(/^##\s*/, "");
        const speaker = (lines[1] || "").replace(/^@\s*/, "");
        const summary = lines.slice(2).join(" ").trim();
        const at = `${rel(file)} card#${i + 1} ("${title.slice(0, 36)}")`;
        if (isStub(title)) problems.push(`${at}: title is a "placeholder" stub`);
        if (isStub(speaker)) problems.push(`${at}: speaker is a "placeholder" stub`);
        if (!summary) problems.push(`${at}: empty summary`);
        else if (isStub(summary)) problems.push(`${at}: summary is a "placeholder" stub`);
        else checkProse(`${at} summary`, summary);
    });
}

// Walk the English source tree and every i18n/<locale>/ tree.
const i18n = path.join(SRC, "i18n");
const trees = [SRC, ...(fs.existsSync(i18n) ? fs.readdirSync(i18n).map((l) => path.join(i18n, l)) : [])];
let notes = 0;
let cats = 0;
for (const t of trees) {
    const nd = path.join(t, "notes");
    if (fs.existsSync(nd))
        for (const f of fs.readdirSync(nd).filter((f) => /^doc-\d+\.md$/.test(f))) {
            checkNote(path.join(nd, f));
            notes++;
        }
    const sd = path.join(t, "sections");
    if (fs.existsSync(sd))
        for (const f of fs.readdirSync(sd).filter((f) => /^cat-[A-I]\.md$/.test(f))) {
            checkSection(path.join(sd, f));
            cats++;
        }
}

console.log(`content-check: scanned ${notes} note .md + ${cats} category .md across ${trees.length} tree(s)`);
if (problems.length) {
    for (const p of problems) console.error("FAIL " + p);
    process.exit(1);
}
console.log("OK no placeholder stubs, empty bodies, or truncated sentences");
