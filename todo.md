# TODO — PRD v2 實作清單

> 對應 [`PRD-v2.md`](PRD-v2.md)。依 Phase 順序執行,每個 Phase 跑通驗收再進下一個。
> 建議起步:**Phase 1**。

## Git 工作流(每個 Phase 都遵守)

每個 Phase **開始前**先從 `develop` 切一條該階段的分支實作,**跑通驗收後**用
`git merge --no-ff` 併回 `develop`(保留分支合併節點,方便回溯整個階段)。

**階段內分功能、邊做邊 commit**:在該階段分支上,每完成一個可獨立交代的子功能
(例如 `poll.mjs`、`review.mjs` 各算一個)就 commit 一次,而不是整個 Phase 攢成一
包。每個 commit 聚焦單一功能、訊息用 Conventional Commits;最後才 `--no-ff` 併回
`develop`。

```bash
# 階段開始
git switch develop && git pull
git switch -c <該階段分支名>

# 階段內:每做完一個子功能就 commit(可多次)
git add <該功能相關檔案>
git commit -m "feat(scope): ……"      # 分功能、邊做邊 commit

# 全部子功能完成 + 驗收通過後
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
- [x] 讀 `channels.json`
- [x] 對每頻道抓 RSS(`youtube.com/feeds/videos.xml?channel_id=XXX`,免 API key)
- [x] 解析 videoId / title / channel / published / thumb / url
- [x] 與 `queue.json` 既有 videoId diff,只 append 新片為 `status: pending`
- [x] 支援手動執行 `node tools/poll.mjs`
- [x] 額外:已在站上的影片(對到 `doc-N`)標 `published` + 回填 `docId`,不混進 pending

### `tools/review.mjs`
- [x] `node tools/review.mjs` 起 localhost(Node 內建 http,無依賴)
- [x] 列出 `pending` 影片:縮圖 + 標題 + 頻道 + 日期
- [x] Approve / Reject 按鈕 → 改寫 `queue.json` 的 `status`
- [x] 選填:備註欄寫入 `note` 欄位

### 驗收
- [x] 對已知頻道跑 poll,新片正確落進 queue 且不重複(4 頻道各 15,共 60;重跑 0 重複)
- [x] 瀏覽器按 Approve/Reject,`queue.json` status 正確變更(approve 寫入 note、reject 改狀態、counts 即時更新)
- [x] 重跑 poll 不重複塞已存在影片

## Phase 2 — 自動輪詢與通知

### `.github/workflows/poll.yml`
- [x] cron 排程(每天 08:00 UTC)跑 `node tools/poll.mjs`;另加 `workflow_dispatch` 可手動觸發
- [x] queue 有新增時 commit + push 更新後的 `queue.json`(`[skip ci]`)
- [x] 有新 pending → 開/更新單一 `video-queue` Issue,列出待挑選清單(`tools/queue-report.mjs`)
- [x] 無新片 → 不 commit、不開 Issue(`--check` 回 0 時安靜)

### 驗收
- [x] workflow 邏輯本機實跑驗證:有變動→commit 條件成立、有新 pending→通知條件成立;無變動→兩者皆 skip
- [x] YAML 合法(ruby/psych 解析通過)、`queue-report.mjs --check` 邊界(0 / N)正確
- [x] **GitHub 實跑確認**(2026-07-24,dispatch on `main`):
  - run #30081686673:有新片 → commit `27d8a3c chore(poll): update video queue [skip ci]` 推回 main、開 Issue #1「📥 Video review queue」(52 pending)✅
  - run #30081780665:無新片 → `changed=false, new_pending=0`,commit 與 Issue 兩步皆 skip、不製造雜訊 ✅
  - 前置:預設分支設為 `main`、Actions Workflow permissions 設 Read and write

## Phase 3 — LLM 生成 note 草稿

### `tools/transcript.mjs`(gen-note 前置,已獨立完成)
- [x] 免 API key 抓 YouTube 字幕(InnerTube ANDROID → timedtext XML → 純文字)
- [x] 無字幕優雅回 `{ text: null, reason }`,供 gen-note 標 `needs-transcript`

### `tools/gen-note.mjs`
- [x] 抓 transcript(用 `transcript.mjs`);抓不到 → 標 `needs-transcript`,不硬產
- [x] 呼叫 Claude(`claude-opus-4-8`,`fetch` 直打 Messages API,零依賴),用 `doc-100.md` 當 few-shot 鎖 house style
- [x] doc id 依 `order.json` 現有最大值 +1 配號(同批遞增不搶號)
- [x] 產 `src/notes/doc-N.md`(frontmatter 三欄齊全 + 內文)
- [x] 產中文翻譯 `src/i18n/zh/notes/doc-N.md`
- [x] LLM 分類 A–I → 卡片依標題字母序插入 `cat-K.md`(`docs:` 對齊)+ zh 對照 + `order.json`
- [x] 回填 queue 的 `docId`,status 標 `published`
- [x] 額外:自動 bump 演講總數(精確 pattern,跳過 `doc-N`/`#tN`/`#N`/`%`)—— 定案「工具 bump + PR 複審把關」
- [x] API key 走環境變數 `ANTHROPIC_API_KEY`,**絕不進 repo**;支援 `--dry-run` 免 key 驗機械環節

### 驗收
- [x] `--dry-run` 實跑一支 approved 影片:產物通過 `npm run build`(兩頁 101 talk notes)
- [x] 通過 `node tools/i18n-check.mjs`(coverage 101/101、structural parity OK)
- [x] 分類落進正確 cat 檔(卡片字母序就位)、`order.json` 有新 id、總數 100→101 各檔命中正確
- [x] **live 跑確認草稿品質**(2026-07-24,`claude-sonnet-5`,doc-101 TextQL 一場):frontmatter 三欄齊全、7 段密集 prose 合 house style、忠於逐字稿、中文翻譯自然保留術語、分類 A 精準、卡片字母序就位、build + i18n-check 綠

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
- [ ] 用 `.vercelignore` 或 Vercel「Ignored Build Step」擋掉純資料變更觸發部署:
      poll bot 每輪會 commit `queue.json` 到 main,不該因此重新部署(只有 `src/` 內容變動才需要 build)

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
- [ ] `poll.yml` 的 `actions/checkout@v4` / `setup-node@v4` 依賴 Node 20(將淘汰,現被 GitHub 強制跑在 Node 24 上,功能正常);適時升到 `@v5`

## 未來優化(非 MVP,想到再收)

### 無字幕影片:Whisper 轉錄 fallback
- **現況(最小策略)**:`transcript.mjs` 拿不到字幕 → gen-note 標 `needs-transcript` 跳過。多數影片有 YouTube 自動字幕(asr);真正無字幕主要是「剛上傳、asr 還沒生成」,隔天 poll 再跑通常就有,天然被處理掉。
- **何時才值得做**:等 `needs-transcript` 真的開始累積、或要收永久無字幕的片子,再加。**現在做是對付一個幾乎不會發生的 case,先不做**。
- **若要做(建議做法)**:gen-note 加 `--whisper` opt-in 旗標;流程 `yt-dlp 下載音訊 → ffmpeg → Whisper → 逐字稿 → 餵 Claude(同現流程)`。
  - 首選 **Groq `whisper-large-v3` API**(快、便宜、一個 `fetch` 就好),而非重量級 local 安裝。
  - 代價要清楚:破壞零依賴(至少要 `yt-dlp` + `ffmpeg`);API 版多一支非 Anthropic 的 key;音訊下載比抓字幕脆弱(易被節流)。
  - 品質上 Whisper 通常優於 asr(有標點、辨識更準)。
- **可先留接點**:在 `transcript.mjs` 放一個 `fetchTranscriptWhisper(videoId)` 骨架 + TODO(不實作、不引依賴),未來要接時有明確位置。
