# TODO — PRD v3 實作清單

> 對應 [`PRD-v3.md`](PRD-v3.md)。把「挑片 + 生草稿觸發」流程搬上 GitHub：review issue 變控制面板。
> 依 Phase 順序執行，每個 Phase **跑通驗收 + 回來打勾**再進下一個。
>
> **進度（2026-07-24）**：Phase 1 ✅、Phase 2 ✅（皆已併回 develop、本機/CI 驗收通過；各剩「release 到 main 排程實跑」一項待收尾）。**下一步：Phase 3**。尚未 push 到 origin、尚未 release 到 main。

## Git 工作流（每個 Phase 都遵守）

每個 Phase **開始前**先從 `develop` 切一條該階段的分支實作，**跑通驗收後**用
`git merge --no-ff` 併回 `develop`（保留分支合併節點，方便回溯整個階段）。

**階段內分功能、邊做邊 commit**：在該階段分支上，每完成一個可獨立交代的子功能
（例如 `triage.mjs`、`queue-apply.mjs` 各算一個）就 commit 一次，而不是整個 Phase 攢成一
包。每個 commit 聚焦單一功能、訊息用 Conventional Commits（冒號後第一個字母大寫、不加
co-author）；最後才 `--no-ff` 併回 `develop`。

```bash
# 階段開始
git switch develop && git pull
git switch -c <該階段分支名>

# 階段內：每做完一個子功能就 commit（可多次）
git add <該功能相關檔案>
git commit -m "feat(scope): ……"      # 分功能、邊做邊 commit

# 全部子功能完成 + 驗收通過後
git switch develop
git merge --no-ff <該階段分支名>     # 保留合併節點
git branch -d <該階段分支名>          # 清掉已併入的分支
```

| Phase | 建議分支名 |
|---|---|
| 1 | `feat/v3-queue-home-develop` |
| 2 | `feat/v3-ci-triage` |
| 3 | `feat/v3-issue-control` |
| 4 | `feat/v3-record-pr` |

> **⚠️ 事件觸發的 workflow 只認 default branch(main) 上的版本**：`poll.yml`（`schedule`）與
> `queue-control.yml`（`issues`）被 GitHub 觸發時，跑的是 **`main`** 上的檔案。所以這些 workflow 的
> 改動「合進 develop」還**不會真的生效**，要 release 到 `main` 後才會被排程／事件觸發。每個動到 workflow 檔的
> Phase，驗收都要做「先合 develop → release 到 main → 在 main 上實跑」這一輪；`workflow_dispatch`
> 可在合併前先驗手動路徑，但 `schedule` / `issues` 的自動觸發一定要等上 main。

## Phase 1 — queue.json 家搬到 develop ★ 先做，其他階段的地基

**目標**：`queue.json` 唯一寫入分支改成 `develop`，`main` 收斂為純 release 分支。

### `.github/workflows/poll.yml`（改）
- [x] job 內 `actions/checkout@v4` 指定 `ref: develop`（抓 develop 的 queue 當基準）
- [x] poll 後 commit + `push origin HEAD:develop`（顯式 refspec，保留 `[skip ci]`）；不再推 main
- [x] Issue 開/更新邏輯不變（仍 `video-queue` 單一 issue）
- [x] 確認 `queue-report.mjs` 的 `git show HEAD:queue.json` diff 在 develop checkout 下仍正確（HEAD=poll 前 develop tip，working=poll 後，diff 正確）

### 文件（改）
- [x] `OPERATIONS.md` / `OPERATIONS.zh-TW.md` Step ②：拿掉 `git checkout main -- queue.json`，改 `git switch develop && git pull`
- [x] 把「queue 的家 = `develop`、`main` = 純 release 分支」寫進 OPERATIONS（分支模型 note + 頻道生效改 develop）

### 驗收
- [x] `workflow_dispatch` 跑 poll：新 pending 落在 **develop** 的 `queue.json`，`main` 不被動到（run 30107389079：18 新片 → commit `a7f0d29` push develop、issue #1 更新；main tip `08fe9ea` 前後一致）
- [x] 本機在 develop `git pull` 即拿到最新 queue，不需跨分支 checkout（queue 現住 develop）
- [ ] `develop → main` release PR 合併後，`main` 的 `queue.json` 追上 —— **待 release 到 main**
- [ ] release 到 main 後，`schedule` 觸發的 poll 也確實推 develop —— **待 release 到 main**（poll.yml 排程版仍在 main 舊版）

> **狀態（2026-07-24）**：實作 + `workflow_dispatch` 驗收通過，已 `--no-ff` 併回 develop。剩兩項驗收綁 release 到 main，屬 Phase 收尾、非阻擋 Phase 2。

## Phase 2 — CI triage 寫進 issue

**目標**：review issue 自動呈現 triage 建議，並帶上 Phase 3 要用的 checkbox 與 `vid` 錨點。

### `tools/triage.mjs`（新）
- [x] 讀 `queue.json` 的 `pending` 項目（忽略 approved/rejected/published）
- [x] 呼叫 GitHub Models：endpoint `https://models.github.ai/inference/chat/completions`、model `openai/gpt-4o-mini`、`Bearer $GITHUB_TOKEN`、`response_format: json_object`（皆實測確認）
- [x] 移植 `triage-queue` skill 判準到 prompt：tier（⭐/🤔/⏭️）+ 建議分類 A–I + 一句貼題理由（繁中）
- [x] 渲染 issue body：tier 分組、每片含隱藏 `<!-- vid:VIDEOID -->` 錨點 + `- [ ] ✅ approve` / `- [ ] ❌ reject`（Phase 3 契約）
- [x] flag 疑似重複/近似標題（`duplicateOf` → 標「⚠️ 疑似與 \`id\` 重複」）
- [x] **降級**：無 token / HTTP 失敗 / JSON 壞掉 → 退回純清單 body（仍附 checkbox 與錨點），exit 0 不擋流程
- [x] 額外修 bug：gpt-4o-mini 一次吃 42 支會漏 ~10 支 → 改**分批 12（allSettled）+ 漏網補抓**，degraded 42→0

### `.github/workflows/poll.yml`（接 triage）
- [x] 有新 pending 時 body 產生器換成 `triage.mjs`（`--check` 計數仍用便宜的 `queue-report.mjs`，不花模型）
- [x] workflow 加 `permissions: models: read` + 該 step 傳 `GITHUB_TOKEN`（不放額外 secret）

### 驗收
- [x] issue body 每片有 tier/分類/理由 + 兩個 checkbox + 隱藏 `vid` 錨點（本機 live：42/42、degraded 0、tier 15/23/4）
- [x] triage 失敗（模擬無 token）→ 純清單、仍 42 錨點 + checkbox、exit 0
- [x] 用量落在免費 tier、無 Azure 帳單（Actions `GITHUB_TOKEN` + `models: read`，非付費呼叫）
- [x] **Actions 實測**（throwaway probe run 30108522633）：Actions 的 `GITHUB_TOKEN` 打得到 GitHub Models、degraded 0、tier 3 組、42 錨點；probe 分支/workflow 已清除
- [ ] （workflow 檔改動）release 到 main 後在 main 上排程實跑確認 —— **待 release 到 main**

> **狀態（2026-07-24）**：實作 + 本機/CI 驗收通過，已 `--no-ff` 併回 develop。剩「排程實跑」綁 release 到 main。

## Phase 3 — issue checkbox 批核控制面板

**目標**：負責人在 issue 打勾即改 `queue.json`，owner-only、可靠、冪等。與 Phase 2 共用 body 契約，建議連著做。

### `tools/queue-apply.mjs`（新）
- [ ] 解析 issue body：依 `<!-- vid:xxx -->` 錨點與其下 checkbox 勾選狀態，組 id→action map
- [ ] 套用：✅ 勾 → `approved`；❌ 勾 → `rejected` + 把該列 triage 理由寫進 `note`；兩者皆未勾 → 維持 `pending`
- [ ] 安全規則（沿用 PRD-v2）：只動當前 `pending` 項目、不覆寫人手寫 `note`、寫完 `JSON.parse` 驗證
- [ ] 只對「勾選狀態 ≠ 已提交 status」的列動作（冪等，避免改錯字誤觸）
- [ ] 產出重繪後的 body：已處理列標「✔ 已 approved／❌ 已 rejected」並移除其 checkbox

### `.github/workflows/queue-control.yml`（新）
- [ ] `on: issues.edited`
- [ ] `if:` 同時滿足（a）issue 有 `video-queue` label、（b）`github.event.sender.login == '<owner>'`（owner-only；預設 `yeha98555`）
- [ ] 呼叫 `queue-apply.mjs` → commit/`push` develop → 用重繪 body 更新 issue
- [ ] `permissions: contents: write`（推 develop）+ `issues: write`（重繪 body）
- [ ] `concurrency` group 串行化多次快速編輯，避免競態

### 驗收
- [ ] 勾 ✅ 某片 → develop 的 `queue.json` 該片變 `approved`；勾 ❌ → `rejected` 且 `note` 帶理由
- [ ] 非負責人編輯 body → 無任何變更
- [ ] 重複編輯/改錯字 → 不重跑已處理項目（冪等）
- [ ] （workflow 檔改動）release 到 main 後，`issues` 事件在 main 上實跑確認 owner-only 與套用正確

## Phase 4 — 批核後記錄 PR#

**目標**：每批 queue 與其產出的 PR 在 issue 上有對照。

### `tools/gen-note.mjs`（微調）
- [ ] `gh pr create` 成功後，找出 open 的 `video-queue` issue
- [ ] `gh issue comment` 寫「🧾 這批 → PR #NN：<PR 連結>；videoId / docId 清單」
- [ ] 找不到 open issue 時優雅略過（不讓記錄失敗中斷 PR 流程）

### 驗收
- [ ] 本機 `gen-note --pr`（可先 `--dry-run --pr`）後，review issue 出現一則含 PR# 與該批 ids 的留言
- [ ] 留言的 ids 與該 PR 實際處理的影片一致

## 橫向注意事項（每階段隨手檢查）

- [ ] **poll 與控制面板同源**：兩者都只寫 `develop`，`main` 只被 release PR 更新（不可只搬一半，否則 queue 分岔）
- [ ] **事件/排程 workflow 要上 main 才生效**：poll.yml、queue-control.yml 改動未 release 到 main 前，`schedule`/`issues` 觸發跑的是舊版
- [ ] **checkbox 對應靠 `vid` 錨點**，不靠標題（標題會變、會撞）；套用後重繪鎖定已處理列防重複
- [ ] **owner-only guard**：非負責人的 issue 編輯一律忽略
- [x] **API key/token**：triage 只用 `GITHUB_TOKEN`（零額外 secret）；`ANTHROPIC_API_KEY` 只在本機 gen-note，絕不上雲/進 repo
- [x] **字幕在 CI 抓不到**：已定案，生成留本機（依 2026-07-24 實測）
- [ ] `actions/checkout` / `setup-node` 適時升 `@v5`（沿用 v2 的注意事項）

## 開放問題（PRD-v3 第 8 節，做之前確認；已給預設）

- [ ] owner 判定：`sender.login == 'yeha98555'`（預設）vs `author_association == 'OWNER'`
- [ ] reject 理由：預設沿用 triage 理由當 `note`
- [ ] triage 是否加 `workflow_dispatch` 手動重跑：預設要
- [ ] PR# 記錄位置：預設本機 gen-note 直接留言（vs `on: pull_request` workflow）
- [ ] `review.mjs` 是否保留為 fallback：預設保留

## 未來優化（非 MVP，想到再收）

### 無字幕影片：Whisper 轉錄 fallback
- **現況（最小策略）**：`transcript.mjs` 拿不到字幕 → gen-note 標 `needs-transcript` 跳過。多數影片有 YouTube 自動字幕（asr）；真正無字幕主要是「剛上傳、asr 還沒生成」，隔天 poll 再跑通常就有，天然被處理掉。
- **何時才值得做**：等 `needs-transcript` 真的開始累積、或要收永久無字幕的片子，再加。**現在做是對付一個幾乎不會發生的 case，先不做**。
- **若要做（建議做法）**：gen-note 加 `--whisper` opt-in 旗標；流程 `yt-dlp 下載音訊 → ffmpeg → Whisper → 逐字稿 → 餵 Claude（同現流程）`。
  - 首選 **Groq `whisper-large-v3` API**（快、便宜、一個 `fetch` 就好），而非重量級 local 安裝。
  - 代價要清楚：破壞零依賴（至少要 `yt-dlp` + `ffmpeg`）；API 版多一支非 Anthropic 的 key；音訊下載比抓字幕脆弱（易被節流）。
  - 品質上 Whisper 通常優於 asr（有標點、辨識更準）。
- **可先留接點**：在 `transcript.mjs` 放一個 `fetchTranscriptWhisper(videoId)` 骨架 + TODO（不實作、不引依賴），未來要接時有明確位置。

### 全自動生成（繞過 CI 抓不到字幕）
- **現況**：CI（Azure IP）向 YouTube 抓字幕被回 `no-captions`（2026-07-24 實測 4/4 全滅），故 gen-note 留本機。
- **若要全自動**：self-hosted runner（跑在住宅 IP）或 residential proxy／第三方 transcript API 繞過資料中心封鎖；代價是要自管 runner/proxy 與 `ANTHROPIC_API_KEY` 上雲。**維持混合（生成留本機）最省事，先不做**。
