# Operations — daily runbook

> **English** · [繁體中文](OPERATIONS.zh-TW.md)

How to run the content pipeline day to day: what happens automatically, and the
steps where **you** are the quality gate. For the design behind it see
[`PRD-v2.md`](docs/PRD-v2.md) (base pipeline) and [`PRD-v3.md`](docs/PRD-v3.md) (the GitHub
Issue control panel); for tool internals see the [`tools/`](tools/) sources and
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## The flow at a glance

```text
YouTube RSS ──① poll (cron)──▶ queue.json + 📥 Issue control panel (triage + checkboxes)
                                     │
                    ② you pick — tick ✅/❌ then 🚀 submit on the Issue
                                     │        (or Approve/Reject in tools/review.mjs locally)
                    ③ gen-note  transcript → Claude draft → PR (linked back on the Issue)
                                     │
                    ④ you review the PR (note + category) → merge to develop
                                     │
                    ⑤ Release (develop → main) ──▶ Vercel build + deploy ──▶ live site
```

Steps **① and ⑤ are fully automatic**. Steps **②③④ are yours** — the human is
the quality gate.

> **Branch model:** `queue.json` (and `channels.json`) live on **`develop`** — poll
> reads and writes them there, and you pick/draft there. **`main` is a pure release
> branch**, updated only by the `develop → main` release PR (⑤). Nothing writes to
> `main` directly.

## Prerequisites (one-time)

- `gh` CLI installed and authenticated (`gh auth login`) — `gen-note --pr` uses it.
- An Anthropic API key, passed via the `ANTHROPIC_API_KEY` environment variable.
  **Never commit it** — it only ever lives in your shell env or GitHub Secrets.
- Vercel already connected to the repo with Production Branch = `main` (done).

## Managing subscriptions (occasional, upstream of Step ①)

`channels.json` decides **which channels Step ① polls**. Adding or removing one is an
occasional setup task, not part of the daily loop. The easiest way is the
**`manage-channels` skill** — just say it in natural language, usually pasting a URL:

- **Add:** "訂閱 https://www.youtube.com/@SomeChannel" / "add this channel `<url>`"
- **Remove:** "移除 @SomeChannel" / "unsubscribe `<name>`"

The skill resolves the `channel_id`, verifies the RSS feed, edits `channels.json`
safely (dedupe + valid JSON), and can run poll to pull the new channel's videos
straight into the queue — which drops you into the normal
**② pick → ③ draft → ④ review → ⑤ publish** flow below.

Notes:

- A channel change only takes effect for the daily 08:00 UTC poll **once it reaches
  `develop`** (poll now checks out `develop`) — commit `channels.json` to `develop`
  (the skill proposes the commit and asks first). It reaches `main` later via the
  `develop → main` release PR.
- Removing a channel stops *future* polling only; videos already in `queue.json` stay.
- Manual fallback (what the skill automates): edit `channels.json` — an entry is
  `{ "id": "UC…", "name": "…", "handle": "@…" }`, only `id` drives the fetch — then
  `node tools/poll.mjs`.

## Daily steps

### Step 1 — Check for new videos (automatic; you just look)

The `poll.yml` GitHub Action runs every day at **08:00 UTC**. When there are new
videos it:

- appends them to `queue.json` as `status: pending` and pushes to `develop` (`[skip ci]`)
- rebuilds the single **"📥 Video review queue"** Issue as a **control panel**:
  `triage.mjs` scores each pending video with GitHub Models (`gpt-4o-mini`) into
  **⭐ / 🤔 / ⏭️** with a suggested category and a one-line reason, and renders
  **✅ approve / ❌ reject** checkboxes per video plus a bottom **🚀 submit** box.

👉 **You:** open that Issue and skim the triage. On days with no new videos the
Action stays silent and the Issue is untouched — nothing to do.

> To trigger a poll on demand: GitHub → **Actions → `poll` → Run workflow**. Triage
> runs on GitHub Models via the Action's `GITHUB_TOKEN` (no extra key); if it's ever
> unavailable the Issue still lists every video with working checkboxes.

### Step 2 — Pick videos (on the Issue, or locally)

**Primary — right on the Issue (works from your phone):** tick **✅ approve** or
**❌ reject** under each video, then tick the bottom **🚀 送出 (submit)**. Ticking
approve/reject alone does nothing — only submit applies the batch: `queue-control.yml`
(owner-only) writes the whole batch to `develop` as **one commit**, copies each
reject's triage reason into its `note`, re-renders the Issue (submit cleared,
processed rows dropped), and comments a summary. Leave both boxes unticked to keep a
video `pending` for later.

**Fallback — locally (offline or bulk edits):** `queue.json` lives on `develop`, so
just pull, then use the local picker UI:

```bash
git switch develop && git pull    # queue.json is already here — no cross-branch checkout
node tools/review.mjs             # opens http://localhost:4321
```

Click **Approve / Reject** on each pending video (optional note); this rewrites the
`status` in `queue.json` live. Commit it when done.

> The Issue already shows triage automatically (CI, via GitHub Models). The local
> **`triage-queue` skill** — "triage the queue" / "幫我看 pending 哪個值得收" — is the
> offline equivalent for the `review.mjs` path: same **⭐ / 🤔 / ⏭️** ranking, suggested
> categories, and a copy-ready approve-list; it never changes `status` unless you ask.

> Port in use? `PORT=4322 node tools/review.mjs`.

### Step 3 — Generate note drafts + open a PR (manual)

If you approved on the Issue, those approvals are already on `develop` — **pull
first**. `gen-note --pr` opens the PR against `develop` and stages **only the files
it touched** (never `git add -A`):

```bash
git switch develop && git pull    # get the approvals queue-control committed

# Live run (needs the API key; passed via env, never committed).
ANTHROPIC_API_KEY=sk-... node tools/gen-note.mjs --pr
```

For every video that is **approved and has no `docId` yet**, it does all of this
per video: fetch transcript → Claude drafts `doc-N.md` +
Traditional-Chinese translation → classify A–I and insert the card into the right
`cat-*.md` → update `order.json` and the talk count → backfill the queue item's
`docId` and mark it `published` → `npm run build` → branch, commit, push,
`gh pr create`, and **comment "🧾 this batch → PR #NN" on the review Issue** (one PR
per run, so each queue batch maps to its PR).

Useful variants:

- `node tools/gen-note.mjs --dry-run --pr` — stub the model call; exercise the
  file writes and PR flow without spending an API key.
- `ANTHROPIC_API_KEY=... node tools/gen-note.mjs <videoId> --pr` — process only
  one specific video.
- Videos with no captions are marked `needs-transcript` and skipped (no garbage
  draft); the next day's poll usually picks up auto-captions.

### Step 4 — Review + revise in the PR (manual; the key gate)

Open the PR on GitHub:

1. Wait for **CI (`ci.yml`) to go green** — it runs `npm run build` + `i18n-check`.
2. Read the diff: **is the note faithful, is the A–I category right, is the
   Chinese translation good?** The LLM's category is only a *suggestion* — if it's
   off, edit the `cat-*.md` placement directly on the PR branch.
3. When it's clean → **Merge**. (Merging into `develop` to accumulate, then
   `develop → main` to release, is the recommended cadence.)

### Step 5 — Publish (automatic)

On merge/push to **`main`**, **Vercel builds and deploys** automatically; the live
site updates within a minute.

- Live: <https://ai-talk-notes.vercel.app>
- PRs also get their own **Preview Deployment** to eyeball before merge.
- Pure-data commits (only `queue.json` / `channels.json`) are skipped by Vercel's
  *Ignored Build Step*, so they don't trigger a rebuild.

**Releasing (`develop → main`).** Reviewed notes accumulate on `develop`; publish when
ready with **one click**: Actions → **"Release (develop → main)" → Run workflow** — it
opens the release PR, waits for CI, and merges (uncheck *merge* to only open the PR).
Or open/merge the `develop → main` PR by hand.

> **What needs a release vs. what doesn't.** The tool *scripts* (`triage.mjs`,
> `queue-apply.mjs`, `gen-note.mjs`) take effect on `develop` with **no release** —
> `poll.yml` / `queue-control.yml` check out `develop`, and `gen-note` runs locally.
> Only changes to the **workflow YAML themselves** (`poll.yml`, `queue-control.yml`,
> `release.yml`) must reach `main` to take effect, because `schedule` / `issues` /
> `workflow_dispatch` always run the **default-branch** copy.

## Cheat sheet

| Step | Do | Where / command |
|---|---|---|
| ① | Skim the triaged queue | GitHub Issue "📥 Video review queue" (⭐/🤔/⏭️ + checkboxes) |
| ② | Approve / Reject | Tick ✅/❌ + **🚀 submit** on the Issue (or `node tools/review.mjs`) |
| ③ | Draft + open PR | `git pull` → `ANTHROPIC_API_KEY=... node tools/gen-note.mjs --pr` |
| ④ | Review category + content → merge to develop | GitHub PR (wait for green CI) |
| ⑤ | Release + publish | Actions → **"Release (develop → main)"** → Vercel |

**On a day with no new videos, only ① matters — a glance at the Issue, nothing else.**

> The Issue shows triage automatically (CI, via GitHub Models). The local
> **`triage-queue`** skill is the offline equivalent for the `review.mjs` path.
>
> Occasional, not daily: add/remove a tracked channel with the **`manage-channels`**
> skill (paste a URL) — it feeds Step ①. See *Managing subscriptions* above.
