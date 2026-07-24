---
name: daily-log
description: >
  Trigger when the user says "記今天"、"寫 log"、"寫日誌"、"log today",
  or otherwise "把今天的進度記錄下來給下一個 session 接手".
  Writes a dated daily log (append-only, the running record) capturing what got
  done, where it's stuck, and what was decided — enough for the next session to take over.
---

# Daily Log

**Output language:** write the file *contents* in the user's language (Traditional Chinese here).
These instructions are in English for precision; the files you produce are not.

**Why:** the log leaves a signal the *next* session can act on. Resuming a session reloads the
whole old conversation (costly, maybe already compressed). This skill does not dump the
conversation — it leaves a running record: **reading this log + the named source files is enough
to take over and start doing.**

The daily log is a passive running record — what got done today, where it's stuck, what was
decided and why. It is append-only history, and the raw material for distilling MEMORY.md later
(a separate, manually triggered step — **not done here**).

## Where to write
- The log lives in the directory of the work in progress (e.g. `Cadence/memory/2026-07-18.md`);
  if work spans a subproject folder put it there, else repo root under `memory/`.
- **Get today's date first** with `date +%F` — use that for the `memory/YYYY-MM-DD.md` filename
  and any dated lines. Never copy the example date (`2026-07-18`) or guess it.
- **Append, never blind-Write.** If today's file already exists, **Read it first, then Write back
  old content + new content**, or use Edit to insert at the end. A plain Write to an existing
  daily log clobbers the whole day — never do that. New day → new file.
- Never treat session-scoped scratch dirs (`/private/tmp/claude-*`) as the source of truth —
  copy any IDs/state from there **verbatim** into the log.

---

## The daily log (`memory/YYYY-MM-DD.md`)

Today's raw clues. **Prefer keeping context over summarizing too early** — this is the raw
material for a later MEMORY.md distillation, so don't filter it down prematurely.

Append three sections:
1. **Done today** — what was done (with file paths).
2. **Stuck / to continue** — where it's blocked, what to check first next time. The next-step
   line must be **executable**: never write "continue" — name the file to open, the section to
   check, what to add. If the next session can't start doing within one read, it's not specific enough.
3. **Decisions today (with reasons)** — what was decided and *why*; use dated lines like
   `### YYYY-MM-DD: decision + reason`, appended (never overwriting older ones). Date order is
   version order. ⚠️ This is the most-often skipped and most critical part — writing "rejected
   plan A" is not enough, **write *why* it was rejected**, or the next session walks back into it.

```
# memory/2026-07-18.md
今天完成:
- 比較 Vercel 和 Cloudflare Pages 的限制(見 docs/deploy-notes.md)
- 決定部署方案改成 Cloudflare Pages

卡住 / 待接續:
- 下一步:打開 docs/deploy-notes.md,檢查環境變數和 preview deploy 流程
- 若 build 失敗,先看 node version 和 adapter 設定

### 2026-07-18:部署方案變更
改用 Cloudflare Pages,原因:新的限制和成本條件更符合目前需求(取代先前的 Vercel)
```

### External state ledger (only if applicable)
If this work has out-of-repo state — file keys, node/variable/component IDs, run IDs, URLs,
plan/team keys, dashboards, ticket ids — copy **every** id the next session must reference,
**verbatim**, into a table or fenced code block. Read them from the returned tool results / state
ledger — **never reconstruct an id from memory** (a wrong id breaks the next session). If there's
no external state, skip this section.

**Do NOT distill the daily log into MEMORY.md while logging.** Distillation is curation that
needs hindsight and should happen later; folding it into the logging reflex regresses to the
"filter-in-the-moment gamble."

---

## Self-check before finishing
Read the file back; if any answer is "no", fix it first:
1. Is the log **appended**, with no older content overwritten?
2. Can the next session immediately tell **which file to open** and what to do?
3. Does it say **which directions were already rejected (and why)**?

## Rules
- Get today's date with `date +%F` before naming the log file; never copy the example date.
- **Append-only (Read-then-Write, never blind-Write).** New day → new file; never overwrite an
  existing day.
- File *contents* in the user's language (Traditional Chinese); these instructions stay English.
- Absolute dates (`2026-07-18`), never "today".
- IDs verbatim; accuracy over brevity.
- Keep only actionable signal; don't paste the old conversation.
- Persist state only; **do NOT start new build work** (unless the user also asks to continue).
- Report back: the log file path + a 3–5 line summary (done / not-done / next step).
