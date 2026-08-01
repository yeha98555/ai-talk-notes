---
name: release
description: >
  Trigger when the user wants to publish reviewed content from develop to main —
  e.g. "release develop to main"、"發布到 main"、"release"、"把 develop 出到 main"、
  "publish to production"、"上線"、"發佈"、"出一版" — i.e. ship the current develop
  branch to main so Vercel deploys it. Opens (or reuses) the develop → main PR,
  verifies the build, and merges. Merging to main is a gated, outward-facing action:
  confirm the release delta with the user before the merge.
---

# Release develop → main

`main` is a **pure release branch** — the live Vercel site builds from it. All
content and pipeline work lands on `develop` first; a release is the deliberate
develop → main merge that publishes it. This skill does that as a PR + merge.

These instructions are English for precision; talk to the user in their language
(Traditional Chinese here). Vercel auto-deploys on push to `main`, so a release
publishes to production — treat the merge as gated: **show the delta and get a
go-ahead before merging.**

---

## 1. Sync and compute the release delta

The poll bot pushes to `origin/develop` on its own, and you may have local commits
that were never pushed. Reconcile first so the PR reflects *everything* that should
ship:

```bash
git fetch origin
git switch develop
git log --oneline origin/develop..develop   # local commits not on origin → push them
git log --oneline develop..origin/develop    # origin commits not local → rebase onto them
```

- If local has unpushed commits, `git rebase origin/develop` then `git push origin develop`
  **before** opening the PR — otherwise the PR won't contain them.
- If the trees only differ by data commits (`chore(poll): … [skip ci]`) they never
  conflict; rebase is clean.

Then show the user exactly what will go to main:

```bash
git log --oneline origin/main..origin/develop
```

If this is **empty**, develop is already released — say so and stop.

## 2. Check the workflow-YAML-on-main caveat

If the delta touches **`.github/workflows/*.yml`** (poll / queue-control / release),
call it out: `schedule` / `issues` / `workflow_dispatch` always run the **default
branch (main)** copy, so those workflow changes only take effect for automated runs
**once this release lands**. (Tool changes under `tools/` and content under `src/`
already take effect on develop — only the workflow YAML itself needs main.)

## 3. Verify the build locally

The PR's HEAD is often a `chore(poll): … [skip ci]` commit, and **`[skip ci]` makes
GitHub Actions skip `build-check`** — so a `CLEAN` mergeStateStatus does *not* prove
CI ran. Verify locally instead:

```bash
git pull --ff-only origin develop
node tools/content-check.mjs      # no placeholder/truncated/empty source
npm run build                     # both pages build (prebuild runs content-check too)
node tools/i18n-check.mjs         # structural parity OK
```

All three must be clean (talk counts match, `OK`, no `FAIL`). If content-check or
i18n-check fails, **stop and fix on develop first** — never release a red build.

## 4. Open (or reuse) the develop → main PR

```bash
gh pr list --base main --head develop --state open --json number --jq '.[0].number'
```

If one is open, reuse it. Otherwise create it — **`gh pr create` does not accept
`--json`; it prints the URL**, so capture that and parse the number:

```bash
url=$(gh pr create --base main --head develop \
  --title "Release: develop → main" \
  --body "$(printf 'Publishes reviewed develop content to main (Vercel production deploy).\n\nHighlights since last release:\n- <one line per notable change>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)')")
num=$(echo "$url" | grep -oE '[0-9]+$')
```

Fill the highlights from the `origin/main..origin/develop` log (new talks, fixes,
workflow changes). If reusing an open PR, update its body to match with
`gh pr edit "$num" --body "…"`.

## 5. Confirm CI, then merge

```bash
gh pr checks "$num"
gh pr view "$num" --json mergeable,mergeStateStatus --jq '{mergeable,mergeStateStatus}'
```

- `build-check` **pass** and `mergeable: MERGEABLE` → good.
- If `build-check` is **absent** because the HEAD commit was `[skip ci]`, rely on the
  Step-3 local verification instead (the code already passed CI when its PR merged to
  develop; a `[skip ci]` data commit on top changes no built output).
- Never merge on a real `build-check` **failure**.

Show the user the delta + CI state and get the go-ahead, then merge with a merge
commit (matches history and `release.yml`):

```bash
gh pr merge "$num" --merge
```

## 6. Verify and report

```bash
git fetch origin
git log --oneline origin/main..origin/develop   # → empty means fully released
git log --oneline -2 origin/main                 # → the merge commit is on top
```

Report to the user:
- Merged PR number + the merge commit.
- That `origin/main..origin/develop` is empty (main == develop).
- **Vercel** auto-builds `main` and deploys to <https://ai-talk-notes.vercel.app>
  (~1–2 min) — offer to check the deployment if they want.
- If Step 2 flagged a workflow-YAML change, confirm it is now on main and thus live
  for the next scheduled run.

---

## One-click alternative

Once [`release.yml`](../../../.github/workflows/release.yml) is on `main`, the same
thing is available as **Actions → "Release (develop → main)" → Run workflow** (it
opens the PR, waits for CI, merges). Mention it as the fast path for a clean release;
use this skill's explicit PR + merge flow when you need to sync/rebase develop first,
verify a `[skip ci]` HEAD locally, or review the delta step by step.

## Gotchas (learned the hard way)
- **`gh pr create --json …` fails** → parse the number from the printed URL.
- **`[skip ci]` HEAD commit skips `build-check`** → a `CLEAN` PR isn't proof CI ran;
  verify the build locally (Step 3).
- **Local develop drifts** — the poll bot pushes to origin; always `git fetch` + rebase/
  ff before trusting local state, and push local commits before opening the PR.
- **`gh pr view ""`** (empty arg) silently falls back to the current branch's last PR,
  which may be an already-merged one — always resolve the real number first.
