---
name: triage-queue
description: >
  Trigger when the user wants an advisory pre-screen of the pending videos in
  queue.json before the manual pick (Step ② in OPERATIONS) — e.g. "triage the
  queue"、"預篩 queue"、"幫我看 pending"、"哪些值得收"、"挑片前先篩一下",
  "pre-screen the queue", "score the pending videos", "which of these are worth
  keeping". Reads the pending items, judges each from its title + channel (is it a
  substantive AI-engineering talk? which of categories A–I?), and prints a ranked
  report. Advisory by default; **only after the user confirms** can it apply the
  picks to queue.json (approve Strong, reject Skip/duplicates with reasons in `note`,
  leave Maybe pending).
---

# Triage the pending queue

Speed up **Step ② (pick)** by pre-screening the `pending` videos in `queue.json`.
**You (Claude) are the judge here** — no API call, no transcript fetch: you read the
list and score it yourself from the title + channel. **Advisory by default:** always
print the report first; only write to `queue.json` **after the user confirms** (Step 4).
The human stays the gate — either in `tools/review.mjs`, or by approving the apply here.

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
so the user can act quickly. Then **offer to apply it** (Step 4).

### 4. Apply the picks (opt-in — confirm first)

**Always ask before writing.** Print the report, then ask whether to apply. Only on a
clear yes, write to `queue.json` with this default policy (state it when you ask, so the
user can override — e.g. "also reject the Maybe", "approve these extra ids too"):

- **⭐ Strong → `status: "approved"`.**
- **⏭️ Skip + duplicates → `status: "rejected"`**, and write the one-line reason into
  that item's `note`.
- **🤔 Maybe → leave `pending`.** Don't decide borderline cases for the user unless told to.

**Safety rules for the write:**

- Touch **only** items currently `status === "pending"`. Never change an item that is
  already `approved` / `rejected` / `published`, and change no field other than the
  intended `status` (and `note` for rejects).
- Don't clobber a human-written `note`; only set `note` on the items you reject.
- Do it as one script over an explicit id→action map, then validate:
  `node -e "JSON.parse(require('fs').readFileSync('queue.json','utf8'));console.log('OK')"`.
- Report per-action counts and any ids skipped (not found / not pending).

This modifies `queue.json` — it's a **pick-flow change, not a config commit**. It stays
uncommitted and either flows into the `gen-note --pr` PR (Step ③) or can be a checkpoint
commit (`chore(queue): …`) if the user is stopping for now.

> Lighter alternative the user may prefer: instead of setting `status`, just annotate
> each pending item's `note` with `triage: <tier> <cat> — <reason>` so the ranking shows
> inside `tools/review.mjs` and they click Approve/Reject themselves. Same safety rules.

## Report back

- Tier counts (Strong / Maybe / Skip) and any duplicates flagged.
- The recommended approve-list of `videoId`s.
- If you applied: per-action counts (approved / rejected / left pending) and the new
  `queue.json` status totals; that it's uncommitted and belongs to the pick flow.
- A reminder: title-only triage is advisory — the real check is the transcript
  (`gen-note`) and the PR review (Step ④).
