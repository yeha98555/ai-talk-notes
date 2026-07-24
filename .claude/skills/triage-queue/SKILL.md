---
name: triage-queue
description: >
  Trigger when the user wants an advisory pre-screen of the pending videos in
  queue.json before the manual pick (Step ② in OPERATIONS) — e.g. "triage the
  queue"、"預篩 queue"、"幫我看 pending"、"哪些值得收"、"挑片前先篩一下",
  "pre-screen the queue", "score the pending videos", "which of these are worth
  keeping". Reads the pending items, judges each from its title + channel (is it a
  substantive AI-engineering talk? which of categories A–I?), and prints a ranked
  report so the human can approve the good ones fast in tools/review.mjs. Advisory
  only — it never changes any status.
---

# Triage the pending queue

Speed up **Step ② (pick)** by pre-screening the `pending` videos in `queue.json`.
**You (Claude) are the judge here** — no API call, no transcript fetch: you read the
list and score it yourself from the title + channel. This is *advisory*. The human
still decides in `tools/review.mjs`; this skill **never writes `status`**.

These instructions are English for precision; talk to the user in their language
(Traditional Chinese here).

## What this is (and isn't)

- **Is:** a fast, cheap first-pass ranking over titles so the user isn't reading 70
  raw rows in the review UI. Catches obvious keeps and obvious noise.
- **Isn't:** the real quality check. Transcript-level faithfulness and the final
  category are decided later — `gen-note` reads the transcript and the human reviews
  the PR (Step ④). So **err toward "Maybe" over "Skip"** when a title is ambiguous;
  never discard silently.

## Steps

### 1. Load the pending items

Read `queue.json`, select items with `status === "pending"` (ignore
`approved` / `rejected` / `published`). If none, say so and stop. Report the count.

```bash
node -e "const q=require('./queue.json').filter(v=>v.status==='pending'); console.log(q.length+' pending'); q.forEach(v=>console.log(v.videoId+'\t'+v.channel+'\t'+v.title))"
```

### 2. Judge each item (from title + channel)

For every pending video assign:

- **Tier**
  - **⭐ Strong** — clearly a substantive technical talk on AI engineering that fits a
    category well (a real conference/meetup talk, deep-dive, architecture/eval/infra topic).
  - **🤔 Maybe** — plausibly relevant but the title is vague, or it could be a
    keynote/panel with thin technical content. Default here when unsure.
  - **⏭️ Skip** — likely not a fit: trailer/teaser/promo/product ad, sizzle reel,
    sponsor slot, pure hype with no engineering content, or clearly off-topic.
- **Suggested category A–I** (Strong/Maybe only) — one letter.
- **Reason** — one short clause grounded in the actual title (not generic).

**Categories (A–I).** Canonical labels live in [`src/sections/cat-*.md`](../../../src/sections/);
this is the working shorthand:

| | Category |
|---|---|
| A | BI / Analytics / Semantic Layer |
| B | Agent Evaluation & Observability |
| C | Agent Architecture, Reliability & Productionization |
| D | Agent Security & Identity |
| E | Context / Memory / RAG |
| F | Data Infrastructure |
| G | Model Training & Inference |
| H | AI Coding & AI-Native Engineering |
| I | Product Strategy & Business |

Also flag **duplicates / near-duplicate titles** across channels (same talk reposted).

### 3. Print a ranked report

Group by tier (Strong → Maybe → Skip). One line each:
`title — channel — [category] — reason`. Give per-tier counts. End with a copy-ready
**approve-list of `videoId`s** for the Strong tier (plus any Maybe the user might want),
so the user can act quickly in the review UI.

### 4. (Opt-in) annotate the queue notes

**Only if the user asks.** Write the hint into each pending item's `note` field so it
shows in `tools/review.mjs` — prefix `triage: <tier> <cat> — <reason>`. Rules:

- Touch **only** items with `status === "pending"`; **never** change `status` or any
  other field, and never touch non-pending items.
- Preserve an existing non-triage `note` (don't clobber a human note).
- Validate afterward: `node -e "JSON.parse(require('fs').readFileSync('queue.json','utf8'));console.log('OK')"`.
- This modifies `queue.json` — mention it belongs to the pick/review flow, not a config commit.

## Report back

- Tier counts (Strong / Maybe / Skip) and any duplicates flagged.
- The recommended approve-list of `videoId`s.
- A reminder: this is advisory — **decide in `tools/review.mjs` (Step ②)**; the real
  check is the transcript (`gen-note`) and the PR review (Step ④).
