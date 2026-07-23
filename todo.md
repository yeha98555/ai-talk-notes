# TODO — PRD v2 實作清單

> 對應 [`PRD-v2.md`](PRD-v2.md)。依 Phase 順序執行,每個 Phase 跑通驗收再進下一個。
> 建議起步:**Phase 1**。

## Git 工作流(每個 Phase 都遵守)

每個 Phase **開始前**先從 `develop` 切一條該階段的分支實作,**跑通驗收後**用
`git merge --no-ff` 併回 `develop`(保留分支合併節點,方便回溯整個階段)。

```bash
# 階段開始
git switch develop && git pull
git switch -c <該階段分支名>

# 實作 + 驗收通過後
git switch develop
git merge --no-ff <該階段分支名>     # 保留合併節點
git branch -d <該階段分支名>          # 清掉已併入的分支
```

| Phase | 建議分支名 |
|---|---|
| 0 | `feat/v2-data-skeleton` |
| 1 | `feat/v2-poll-review` |
| 2 | `feat/v2-cron-notify` |
| 3 | `feat/v2-gen-note` |
| 4 | `feat/v2-review-publish` |
| 5 | `feat/v2-vercel-deploy` |

> 註:Phase 4 / 5 談的「merge 到 `main`」指最終上站的 release 動作(`develop` → `main`),
> 與各階段「功能分支 → `develop`」是不同層級;先累積到 `develop`,要出站時再合到 `main`。

## Phase 0 — 資料骨架

- [x] 建立 `channels.json`,填入目前追蹤的頻道(`id` / `name` / `handle`)—— 由現有 100 支 notes 反解出 4 個實際來源頻道
- [x] 建立空的 `queue.json`(`[]`)
- [x] 確認兩檔格式合法、被 git 追蹤(非 `.gitignore` 排除)
- [x] 在 `CONTRIBUTING.md` / `CONTRIBUTING.zh-TW.md` 補一段資料檔 schema 說明
- [x] **驗收**:兩檔存在、JSON 合法、git status 看得到(額外:4 個頻道 RSS 皆回 HTTP 200)

## Phase 1 — 輪詢與挑選(最小可跑)★ 先做

### `tools/poll.mjs`
- [ ] 讀 `channels.json`
- [ ] 對每頻道抓 RSS(`youtube.com/feeds/videos.xml?channel_id=XXX`,免 API key)
- [ ] 解析 videoId / title / channel / published / thumb / url
- [ ] 與 `queue.json` 既有 videoId diff,只 append 新片為 `status: pending`
- [ ] 支援手動執行 `node tools/poll.mjs`

### `tools/review.mjs`
- [ ] `node tools/review.mjs` 起 localhost(Node 內建 http,無依賴)
- [ ] 列出 `pending` 影片:縮圖 + 標題 + 頻道 + 日期
- [ ] Approve / Reject 按鈕 → 改寫 `queue.json` 的 `status`
- [ ] 選填:備註欄寫入 `note` 欄位

### 驗收
- [ ] 對已知頻道跑 poll,新片正確落進 queue 且不重複
- [ ] 瀏覽器按 Approve/Reject,`queue.json` status 正確變更
- [ ] 重跑 poll 不重複塞已存在影片

## Phase 2 — 自動輪詢與通知

### `.github/workflows/poll.yml`
- [ ] cron 排程(建議每天一次)跑 `node tools/poll.mjs`
- [ ] queue 有新增時 commit 更新後的 `queue.json`
- [ ] 有新片 → 開/更新 Issue 列出待挑選清單
- [ ] 無新片 → 不 commit、不製造雜訊

### 驗收
- [ ] Action 依排程觸發並成功 commit
- [ ] 有新片時 Issue 建立/更新;無新片時安靜

## Phase 3 — LLM 生成 note 草稿

### `tools/gen-note.mjs`
- [ ] 抓 transcript;抓不到 → 標 `needs-transcript`,不硬產
- [ ] 呼叫 Claude,用既有 note(如 `doc-100.md`)當 few-shot 鎖 house style
- [ ] doc id 依 `order.json` 現有最大值 +1 配號(同批不搶號)
- [ ] 產 `src/notes/doc-N.md`(frontmatter 三欄齊全 + 內文)
- [ ] 產中文翻譯 `src/i18n/zh/notes/doc-N.md`
- [ ] LLM 分類 A–I → append 到 `cat-K.md` 的 `docs:` + `order.json`
- [ ] 回填 queue 的 `docId`,status 標 `published`
- [ ] API key 走環境變數,**絕不進 repo**

### 驗收
- [ ] 對一支 approved 影片跑 gen-note,產物通過 `npm run build`
- [ ] 通過 `node tools/i18n-check.mjs`
- [ ] 草稿格式與既有 note 一致(frontmatter / 段落 / 清單)
- [ ] 分類落進正確 cat 檔、`order.json` 有新 id

## Phase 4 — 複審與上站流程收斂

- [ ] gen-note 後自動開 PR(或產生本機分支供開 PR)
- [ ] CI 在 PR 跑 `npm run build` + `tools/i18n-check.mjs`
- [ ] 在 PR 上複審/修訂 note 與分類 → merge → 上站
- [ ] **驗收**:PR diff 正確、CI 綠燈、merge 後站點正確顯示新 note

## Phase 5 — Vercel 部署與自動重新部署

### 部署設定
- [x] 產物策略定案:**B — build 時產出、不 commit 產物**
- [ ] `git rm --cached index.html index.zh.html`(從版控移除既有產物)
- [ ] 把 `index.html` / `index.zh.html` 加進 `.gitignore`
- [ ] 建立 `vercel.json`(`buildCommand: npm run build`【B 必要】、`outputDirectory: .`、必要的 `cleanUrls`/路由)
- [ ] Vercel 匯入 GitHub repo,Production Branch 設 `main`
- [ ] 確認 PR 會產生 Preview Deployment

### 自動重新部署
- [ ] 驗證 merge 到 main 後 Vercel 自動觸發 build + deploy(Git 整合預設行為)
- [ ] (替代方案,通常不需要)Deploy Hook + GitHub Action 在 merge 後 `curl` 觸發

### 文件收尾(最後完成)
- [ ] 更新 `README.md`:加上 Live 站點網址 + 部署方式(Vercel)說明
- [ ] 更新 `README.zh-TW.md`:同步中文版
- [ ] 更新兩份 README 的「開啟方式」段落:因採策略 B,repo 內不再有現成 `index.html`,需先 `npm run build` 才能本機開啟

### 驗收
- [ ] Vercel 網址可開,`index.html`(EN)與 `index.zh.html`(中文)皆正常
- [ ] merge 一個 PR 到 main 後線上內容自動更新
- [ ] PR 有 Preview Deployment 可預覽
- [ ] 兩份 README 皆已反映 Live 網址與部署流程

## 橫向注意事項(每階段隨手檢查)

- [ ] 字幕缺失有優雅處理(`needs-transcript`),不產爛草稿
- [ ] API key 只走環境變數 / GitHub Secrets,絕不進 repo
- [ ] doc id 不撞號
- [ ] LLM 分類僅為「建議」,一律以 PR 複審為準
- [ ] 不改動既有 `build.mjs` / `order.json` / `cat-*.md` 的格式與行為
