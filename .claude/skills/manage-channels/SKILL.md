---
name: manage-channels
description: >
  Trigger when the user wants to add/subscribe or remove/unsubscribe a tracked
  YouTube channel in this repo's poll pipeline — e.g. "新增頻道"、"訂閱這個頻道"、
  "追蹤這個 channel"、"移除頻道"、"取消訂閱"、"退訂", "add channel", "subscribe",
  "remove channel", "unsubscribe" — or simply pastes a YouTube channel URL / @handle
  with the intent to track it. Resolves the channel_id, edits channels.json safely,
  and (on request) runs poll to pull the channel's videos into the queue.
---

# Manage tracked channels

`channels.json` is the source of truth for which YouTube channels the poll pipeline
watches. Each entry is `{ "id": "<channel_id>", "name": "<display name>", "handle": "@<handle>" }`.
Only **`id`** (the `UC…` channel_id, 24 chars) actually drives the RSS fetch in
[`tools/poll.mjs`](../../../tools/poll.mjs) via `feeds/videos.xml?channel_id=<id>`;
`name` is stored as each video's source channel; `handle` is human reference only.

These instructions are English for precision; talk to the user in their language
(Traditional Chinese here).

---

## Adding a channel

The user usually pastes a URL or `@handle`. Any of these forms is valid input:
`https://www.youtube.com/@Handle`, `@Handle`, `https://www.youtube.com/channel/UC…`,
`/c/Custom`, `/user/Name`, or even a video URL from the channel.

### 1. Resolve the channel_id (`UC…`)

- If the input **already contains `/channel/UC…`**, take that id directly.
- Otherwise fetch the page and grep the raw HTML (markdown/WebFetch strips it — use `curl`).
  **Use `externalId` or the `canonical` link — NOT a bare `channelId`.** On `/c/`, `/user/`,
  and `@handle` pages the HTML also lists *recommended* channels, so the first `channelId`
  match can belong to a different channel. `externalId` and `<link rel="canonical">` always
  point to the page's own channel:

```bash
URL="<the url; if only @handle given, use https://www.youtube.com/@handle>"
HTML=$(curl -s -L -A "Mozilla/5.0" "$URL")
echo "$HTML" | grep -oE '"externalId":"UC[A-Za-z0-9_-]{22}"' | head -1          # page owner
echo "$HTML" | grep -oE 'channel/UC[A-Za-z0-9_-]{22}' | head -1                 # canonical, must agree
echo "$HTML" | grep -oE '<meta property="og:title" content="[^"]+">' | head -1  # sanity: is this the right channel?
```

Take the `UC…` from `externalId`; confirm the canonical `channel/UC…` **matches it**, and
that `og:title` looks like the channel the user meant. If they disagree, re-check before writing.

### 2. Verify the feed works and get the real display name

```bash
ID="UC…"
curl -s -o /tmp/ch.xml -w "RSS HTTP %{http_code}\n" -A "Mozilla/5.0" \
  "https://www.youtube.com/feeds/videos.xml?channel_id=$ID"
grep -oE '<title>[^<]+</title>' /tmp/ch.xml | head -1   # → the channel's display name
```

Must be **HTTP 200**. If not, the id is wrong — re-resolve; do not write a broken entry.
Use the feed `<title>` as `name`. Derive `handle` from the input `@handle` if present, else "".

### 3. Add to `channels.json` (dedupe first)

- **Check it isn't already there** by `id` (and by handle). If present, tell the user it's
  already subscribed and stop — never write a duplicate.
- Append one entry with **Edit**, keeping the array valid JSON (comma on the previous last line).
- Validate: `node -e "JSON.parse(require('fs').readFileSync('channels.json','utf8'));console.log('OK')"`.

### 4. Pull its videos now (ask / on request)

Offer to run poll so the channel's recent videos land in the queue immediately:

```bash
node tools/poll.mjs        # appends new videos as status:pending to queue.json
```

Report the `<channel>: N in feed, M new` line. Note this also modifies `queue.json`.

---

## Removing a channel

The user names a channel by `@handle`, display name, or URL/id.

1. Read `channels.json`, find the matching entry (match id, then handle, then name;
   case-insensitive). If **no match** or **ambiguous**, show the current list and ask which one.
2. Remove that one entry with **Edit** (fix the trailing comma so the array stays valid JSON),
   then validate with the same `node -e "JSON.parse(…)"` check.
3. **Do NOT touch `queue.json`.** Already-queued or published videos from that channel are
   historical data and stay. Removing the channel only stops *future* polling. Say this to the user.

---

## Committing (ask before pushing)

- `channels.json` is git-tracked config. The poll bot runs on `main`, so a channel change only
  takes effect for the daily 08:00 UTC schedule **once it reaches `main`**.
- Propose a commit (`chore(channels): Add <Name>` / `chore(channels): Remove <Name>`), but
  **ask before committing to / pushing `main`** — pushing to main is a gated action.
- Keep the `channels.json` change as its own commit; if you also ran poll, the `queue.json`
  changes belong to the review/pick flow, not this config commit.

## Report back
- The resolved `channel_id` + verified display name (add), or which entry was removed.
- That `channels.json` is valid JSON.
- If poll ran: the per-channel new-video counts and that `queue.json` changed.
- The suggested commit, and that it should land on `main` to take effect.
