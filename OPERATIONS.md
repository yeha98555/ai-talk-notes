# Operations — daily runbook

> **English** · [繁體中文](OPERATIONS.zh-TW.md)

How to run the content pipeline day to day: what happens automatically, and the
three steps where **you** are the quality gate. For the design behind it see
[`PRD-v2.md`](PRD-v2.md); for tool internals see the [`tools/`](tools/) sources
and [`CONTRIBUTING.md`](CONTRIBUTING.md).

## The flow at a glance

```text
YouTube RSS ──① poll (cron)──▶ queue.json + "Video review queue" Issue
                                     │
                    ② you pick  Approve / Reject   (tools/review.mjs)
                                     │
                    ③ gen-note  transcript → Claude draft → PR
                                     │
                    ④ you review the PR (note + category) → merge
                                     │
                    ⑤ Vercel  build + deploy ──▶ live site
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
- opens/updates a single **"📥 Video review queue"** Issue listing what's pending

👉 **You:** open that Issue and glance at the pending list. On days with no new
videos the Action stays silent and the Issue is untouched — nothing to do.

> To trigger a poll on demand: GitHub → **Actions → `poll` → Run workflow**.

### Step 2 — Pick videos (manual)

Do the pick **and** the draft on the **same branch** (`develop`), so the
`queue.json` edit never has to be carried across a `git switch`. `queue.json` lives
on `develop` now — the poll bot pushes there — so just pull, then open the picker UI:

```bash
git switch develop && git pull    # queue.json is already here — no cross-branch checkout
node tools/review.mjs             # opens http://localhost:4321
```

Click **Approve / Reject** on each pending video (an optional note field is
available). This rewrites the `status` in `queue.json` live. Close the tab when
done.

> **Pre-screen first (optional, advisory):** with a big pending list, run the
> **`triage-queue` skill** — "triage the queue" / "幫我看 pending 哪個值得收". It ranks
> every pending video **⭐ Strong / 🤔 Maybe / ⏭️ Skip** with a suggested category and a
> one-line reason, flags duplicates, and hands you a copy-ready approve-list. It never
> changes `status` — you still Approve/Reject in the UI (or ask it to apply the picks
> and write the reject reasons into each item's `note`).

> Port in use? `PORT=4322 node tools/review.mjs`.

### Step 3 — Generate note drafts + open a PR (manual)

Stay on `develop` — the branch you just approved on — so the `queue.json` edit is
right here, nothing is carried across a switch, and the PR opens against `develop`.
`gen-note --pr` stages the **whole working tree** (`git add -A`), so confirm it's
clean first:

```bash
git status        # expect: only queue.json modified

# Live run (needs the API key; passed via env, never committed).
ANTHROPIC_API_KEY=sk-... node tools/gen-note.mjs --pr
```

For every video that is **approved and has no `docId` yet**, it does all of this
per video: fetch transcript → Claude drafts `doc-N.md` +
Traditional-Chinese translation → classify A–I and insert the card into the right
`cat-*.md` → update `order.json` and the talk count → backfill the queue item's
`docId` and mark it `published` → `npm run build` → branch, commit, push, and
`gh pr create`.

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

## Cheat sheet

| Step | Do | Where / command |
|---|---|---|
| ① | Check for pending videos | GitHub Issue "📥 Video review queue" |
| ② | Approve / Reject | `git pull` → `node tools/review.mjs` |
| ③ | Draft + open PR | `ANTHROPIC_API_KEY=... node tools/gen-note.mjs --pr` |
| ④ | Review category + content → merge | GitHub PR (wait for green CI) |
| ⑤ | Auto-publish | Vercel (on merge to `main`) |

**On a day with no new videos, only ① matters — a glance at the Issue, nothing else.**

> Before picking, optionally pre-screen the queue with the **`triage-queue`** skill
> (⭐/🤔/⏭️ ranking + suggested categories + approve-list) — advisory, speeds up Step ②.
>
> Occasional, not daily: add/remove a tracked channel with the **`manage-channels`**
> skill (paste a URL) — it feeds Step ①. See *Managing subscriptions* above.
