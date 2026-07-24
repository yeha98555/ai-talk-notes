# AI Engineering Talks — Classified & Distilled

> **English** · [繁體中文](README.zh-TW.md) · **[Live site ↗](https://ai-talk-notes.vercel.app)**

A systematic read-through of **131 conference and YouTube talk notes** on AI
engineering, sorted into **9 thematic categories** and distilled into short,
skimmable key-point summaries — plus **9 cross-cutting insights** drawn from the
entire corpus.

The published page is a **single, self-contained `index.html`** — no server, no
external dependencies, just open it in a browser. That file is now **generated
from small, composable sources** under [`src/`](src/) by a tiny build script
([`build.mjs`](build.mjs)), so you edit focused partials instead of one
44k-line monolith. CSS and JS are inlined at build time, keeping the output
dependency-free.

The site ships in **English and Traditional Chinese**. A language toggle
(`EN | 中文`) sits just above the *View source on GitHub* button; the first
visit follows your browser's language (any `zh*` preference → Chinese, otherwise
English) and your choice is remembered. The build emits two self-contained
pages — `index.html` (English) and `index.zh.html` (Traditional Chinese) — and
the toggle switches between them while preserving your place on the page.

## Highlights

- **131 talks** distilled into short key-point summaries.
- **9 thematic categories** (A–I) with a category-distribution overview.
- **9 cross-cutting insights** synthesized across all talks.
- **Dual evidence for every summary:**
  - Click a talk title (or the **📄 Full notes** button) to expand the complete
    original notes, embedded directly in the page.
  - Follow **▶ Source video** back to the original YouTube talk.
- **Personal notes** — inside a talk's full notes, select a sentence (or, on a
  phone, tap a sentence — tap again to extend across more sentences) and choose
  **★ Save as note** to highlight it. Saved notes are collected in a **Your
  Notes** section grouped by talk and persist in your browser.
- **Fully self-contained output** — all notes are rendered and embedded, so the
  published `index.html` depends on no external files or network connection.
- **Composable sources** — the page is built from small partials (`src/`), so
  it's easy to edit and extend without touching a giant single file.

## Categories

| # | Category | Talks |
|---|----------|:-----:|
| A | BI / Analytics / Semantic Layer | 15 |
| B | Agent Evaluation & Observability | 16 |
| C | Agent Architecture, Reliability & Productionization | 17 |
| D | Agent Security & Identity | 8 |
| E | Context / Memory / RAG | 18 |
| F | Data Infrastructure | 18 |
| G | Model Training & Inference | 21 |
| H | AI Coding & AI-Native Engineering | 12 |
| I | Product Strategy & Business | 6 |

Each talk is assigned a single primary theme.

## Cross-cutting insights

1. The semantic layer is being redefined — sinking from BI tools down into
   "context that agents consume."
2. The key to reliable text-to-SQL is grounding and data modeling, not a bigger
   model.
3. Evals move from "gut feel" to data-driven engineering.
4. From PoC to production: reliability is systems engineering, not a model
   problem.
5. Context engineering and memory decide whether an agent uses the right data.
6. Data infrastructure is being reshaped for AI / agents.
7. Security and identity are prerequisites for agents to access enterprise data.
8. The future of BI and the product data flywheel.
9. Small, specialized models / agents beat big and general-purpose ones.

## Usage

The two pages are **build artifacts and are no longer committed**, so build them
from source first, then open one in a browser:

```bash
npm run build          # emits index.html + index.zh.html

# macOS
open index.html
# Linux
xdg-open index.html
# or serve locally, then visit http://localhost:8000
python3 -m http.server
```

The always-on version is the live site — see [Deployment](#deployment).

## Content pipeline

New talks reach the site through a lightweight **discover → pick → draft → review
→ release** pipeline. The site stays backend-free — the "database" is git-tracked
JSON plus GitHub Actions — and a **GitHub Issue is the control panel** you drive it
from, so you can even pick from your phone:

```text
channels.json ─poll (cron)─▶ queue.json (develop) + 📥 review Issue
                     Issue: triage.mjs ranks each pending video ⭐/🤔/⏭️ (GitHub Models) + ✅/❌ boxes
   ② tick ✅/❌ + 🚀 submit ─queue-control─▶ approved   (one commit on develop)
   ③ gen-note --pr (transcript → Claude draft + 中文 + category) ─▶ PR (linked on the Issue)
   ④ review PR ─merge─▶ develop ─⑤ Release (one click)─▶ main ─▶ Vercel build + deploy
```

- [`tools/poll.mjs`](tools/poll.mjs) — pull each channel's RSS into `queue.json` on
  `develop` (scheduled by [`.github/workflows/poll.yml`](.github/workflows/poll.yml))
- [`tools/triage.mjs`](tools/triage.mjs) — score the pending queue with GitHub Models
  (`gpt-4o-mini`) and render the review Issue as a ⭐/🤔/⏭️ control panel with checkboxes
- **Pick on the Issue** — tick ✅/❌ then the bottom 🚀 submit;
  [`queue-control.yml`](.github/workflows/queue-control.yml) applies the batch to
  `develop` as one commit (via [`tools/queue-apply.mjs`](tools/queue-apply.mjs)). Offline
  alternative: [`tools/review.mjs`](tools/review.mjs), a local approve/reject UI.
- [`tools/gen-note.mjs`](tools/gen-note.mjs) `--pr` — transcript → house-style note +
  Traditional-Chinese translation + category suggestion; opens a review PR and records
  the batch → PR back on the Issue
- **Branch model:** `queue.json` lives on `develop`; `main` is a pure release branch,
  published with one click via the **Release (develop → main)** workflow.
- **Two human gates:** which videos to keep, and reviewing each generated note in its PR

Day-to-day runbook — the steps you actually perform — in
**[`OPERATIONS.md`](OPERATIONS.md)** ([繁體中文](OPERATIONS.zh-TW.md)). Design: the base
pipeline in [`docs/PRD-v2.md`](docs/PRD-v2.md), the Issue control panel in
[`docs/PRD-v3.md`](docs/PRD-v3.md); phase-by-phase status in
[`docs/todo-v2.md`](docs/todo-v2.md) / [`docs/todo-v3.md`](docs/todo-v3.md).

## Deployment

Deployed on **Vercel** with Git integration — every push/merge to `main` runs
`npm run build` and redeploys; pull requests get their own Preview Deployment.
Publish reviewed content from `develop` with one click via the **Release
(develop → main)** workflow (Actions → Run workflow) — it opens the release PR,
waits for CI, and merges.

- **Live:** <https://ai-talk-notes.vercel.app>
- The pages (`index.html` / `index.zh.html`) are **not committed** — Vercel builds
  them from source ([`vercel.json`](vercel.json) sets `buildCommand: npm run build`).
- Pure-data commits — the poll bot / the Issue control panel updating `queue.json` on
  `develop` — skip the rebuild via Vercel's *Ignored Build Step*, so only real content
  changes trigger a deploy.

## Project structure

```
index.html        # generated English page (build artifact — git-ignored)
index.zh.html     # generated Traditional Chinese page (build artifact — git-ignored)
build.mjs         # renders src/* into both pages (inlines CSS + JS)
package.json      # `npm run build`
tools/            # content pipeline (poll · triage · review · gen-note · queue-apply) + i18n-check
src/
  head.html       # document head (minus styles)
  styles.css      # all page styles
  partials/       # hero, nav, footer, lang-toggle
  sections/       # overview.html, themes.html; cat-*.md (English card text + color/docs)
  notes/          # shell.html + doc-*.md (English notes) + order.json
  scripts/        # modal, reading-progress, notes, nav-scrollspy, lang
  i18n/zh/        # Traditional Chinese content (notes/*.md, sections/cat-*.md, HTML mirrors)
```

All talk notes and category cards are authored in **Markdown** and rendered into
language-agnostic HTML; see [`src/README.md`](src/README.md) for the full
layout and [`CONTRIBUTING.md`](CONTRIBUTING.md) for how to add or translate one.

## Development

`index.html` is a build artifact — edit the files under `src/` instead, then
regenerate:

```bash
npm run build   # or: node build.mjs
```

The build only concatenates, inlines, and renders (no dependencies to install),
and the result is reproducible. Requires Node.js. One run emits both
`index.html` and `index.zh.html`.

**All content is Markdown.** Talk notes (`notes/doc-*.md`) and category cards
(`sections/cat-*.md`) are authored as Markdown / flat text and rendered into
language-agnostic HTML — English under `src/`, each translation under
`src/i18n/<locale>/`. Untranslated pieces fall back to English. After building,
run `node tools/i18n-check.mjs` to verify the two pages stay structurally
identical.

## Contributing

Contributions — new talks, corrections, and translations — are welcome. All
content is authored in Markdown, and one build renders both language pages from
it. See **[`CONTRIBUTING.md`](CONTRIBUTING.md)** ([繁體中文](CONTRIBUTING.zh-TW.md))
for the content model, the Markdown formats, how to add a talk, and how to add or
improve a translation.

## Method & evidence

- **Data source:** all 131 Markdown talk notes, fully rendered and embedded in
  the built page (no dependency on external `.md` files).
- **Dual grounding:** every summary links to both the full original notes
  (expandable in-page) and the source YouTube video.
- **Classification:** a single primary theme per talk across the 9 categories
  (A–I); every insight is drawn from the full corpus.

## Credits

This project is based on [cyyeh/ai-talk-notes](https://github.com/cyyeh/ai-talk-notes)
(MIT License), with additional features by [yeha98555](https://github.com/yeha98555).

## License

Released under the [MIT License](LICENSE). © 2026 cyyeh, yeha98555.
