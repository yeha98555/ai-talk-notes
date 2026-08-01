#!/usr/bin/env node
/*
 * prose-check.mjs — the single source of truth for "is this generated content
 * complete?": placeholder stubs, empty fields, and sentences cut off mid-word.
 *
 * Shared by content-check.mjs (build-time gate over the written .md trees) and
 * gen-note.mjs (draft-time gate BEFORE anything is written, enabling a retry).
 * Any change to these rules must happen here, never inline in a consumer —
 * otherwise a draft could pass generation and still fail the build (or vice
 * versa). Pure functions only: no filesystem, no process.exit. Dependency-free.
 */

// The gen step leaves this exact string where content wasn't produced. Match a
// whole trimmed field/body only (case-insensitive), so a talk that legitimately
// *discusses* placeholders in its prose is never flagged.
export const isStub = (s) => s.trim().toLowerCase() === "placeholder";

// Trailing citation/timestamp brackets like [7:29][5:20–5:32] are legitimate
// sentence enders — strip them before the truncation test.
export const stripCites = (s) => s.replace(/(\s*\[[^\]]*\])+$/, "").trim();

// Punctuation a finished sentence may end on (ASCII + closing quotes + CJK).
// A body/summary ending on anything else was cut off mid-word.
const TERMINAL = /[.!?…。！？”"’')）」』》】]$/;

// True when non-empty prose ends on something other than terminal punctuation.
export const endsMidSentence = (s) => {
    const tail = stripCites(s);
    return !!tail && !TERMINAL.test(tail);
};

// Field-level check for a draft object (gen-note's per-call gate). Every field
// must be non-empty and not a stub; prose fields (any key ending in "body" or
// "summary") must additionally end on terminal punctuation. Short fields like
// title/speaker/category are exempt from the sentence test — titles rarely end
// with punctuation. Returns problems[] (empty = draft is acceptable), phrased
// like content-check's messages so console output stays recognizable.
export const checkDraftFields = (fields) => {
    const problems = [];
    for (const [k, v] of Object.entries(fields)) {
        const s = String(v ?? "").trim();
        if (!s) {
            problems.push(`${k}: empty`);
        } else if (isStub(s)) {
            problems.push(`${k}: is a "placeholder" stub`);
        } else if (/(body|summary)$/.test(k) && endsMidSentence(s)) {
            problems.push(`${k}: ends mid-sentence (truncated?) — "…${stripCites(s).slice(-40)}"`);
        }
    }
    return problems;
};
