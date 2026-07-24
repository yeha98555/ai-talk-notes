# PRD v2 — 頻道追蹤 × 影片挑選 × 自動生成 note

> 在現有靜態站前面,補一段「發現 → 追蹤 → 通知 → 人工挑選 → 生成 note」的前置 pipeline。
> 核心原則:**不破壞成品的零後端、零依賴、單檔靜態站本質**。

## 1. 背景與目標

### 現況

站點是單一自包含的 `index.html` / `index.zh.html`,由 `build.mjs` 從 `src/` 下的
小型 Markdown partials 產生。一支影片要進站,目前全手動:

1. 手寫 `src/notes/doc-N.md`(frontmatter `title`/`speaker`/`video` + 內文重點)
2. 手寫中文翻譯 `src/i18n/zh/notes/doc-N.md`
3. 把 `doc-N` 加進 `src/notes/order.json`
4. 把 `N` 加進某分類的 `src/sections/cat-K.md` 的 `docs:` 清單(= 分類)
5. `npm run build` → commit

### 痛點

- 要靠自己記得去看各頻道有沒有更新,容易漏片。
- 抓字幕、消化重點、排版、分類是重複體力活。

### 目標

自動化「發現/追蹤/抓取/生草稿/分類」,把**判斷權**留給人:

- **守門點 1 — 挑片**:哪些新片值得收,由人決定。
- **守門點 2 — 複審 note**:LLM 生成的重點由人在 PR 上改過再合。

### 非目標(Out of scope)

- 不做多人線上系統、不架後端伺服器、不引入資料庫。
- 不改動既有 `build.mjs` / `order.json` / `cat-*.md` 的格式與行為。
- 不追求「全自動免複審上站」——品質守門點保留。

## 2. 架構決策(已定案)

| 決策點 | 選擇 | 理由 |
|---|---|---|
| 狀態與 UI 落地 | **repo 即資料庫** | `channels.json` / `queue.json` 進 git;GitHub Actions 排程;本機小工具當挑選 UI;PR 當複審。零後端、零成本。 |
| note 生成程度 | **LLM 產草稿 + 人複審** | 抓字幕 → Claude 產草稿 + 自動分類,人在 PR 上修訂後合併。省體力又保品質。 |
| 起步範圍 | **最小可跑先行** | 先打通「訂閱 → 看到新片 → 挑選」,LLM 與 CI 之後再接。 |
| 部署 | **Vercel Git 整合** | 連結 GitHub repo,push/merge 到 main 自動重新部署;靜態產物,零後端。 |

## 3. 目標 pipeline 全貌

```
channels.json ──poll.mjs(cron)──▶ queue.json[pending] ──Issue 通知──▶ 你
                                        │
                              review.mjs(你按 approve)
                                        ▼
                                  queue.json[approved]
                                        │
                              gen-note.mjs(Claude 產草稿 + 分類)
                                        ▼
        doc-N.md + zh + order.json + cat-K.md ──build──▶ PR ──你複審──▶ merge to main
                                                                            │
                                                              Vercel Git 整合(自動)
                                                                            ▼
                                                                    重新部署上站
```

新流程只在最前面接一段,末端交棒給既有的 build/PR 手動步驟,merge 到 main 後由
Vercel 自動重新部署。

## 4. 資料模型

### `channels.json`(追蹤清單,進 git)

```json
[
  { "id": "UCxxxxxxxx", "name": "Anthropic", "handle": "@anthropic" }
]
```

- `id` 為 YouTube channel_id(RSS 用)。`name` / `handle` 僅供人辨識。

### `queue.json`(影片佇列,進 git)

```json
[
  {
    "videoId": "tTcxVv8HHNw",
    "title": "Learning while you sleep...",
    "channel": "Anthropic",
    "published": "2026-07-20T00:00:00Z",
    "thumb": "https://i.ytimg.com/vi/tTcxVv8HHNw/hqdefault.jpg",
    "url": "https://youtu.be/tTcxVv8HHNw",
    "status": "pending",
    "docId": null,
    "note": null
  }
]
```

- `status`:`pending` → `approved` / `rejected` → `published`。
- `docId`:生成 note 後回填(對應 `doc-N`),避免重複處理。
- `note`:選填,挑片時的備註(例如「主題偏行銷,考慮」)。

> 兩個 JSON 都是「single source of truth」,任何 stage 只讀寫這兩個檔 + `src/`。

## 5. 元件設計

| 元件 | 型態 | 職責 | 依賴 |
|---|---|---|---|
| `tools/poll.mjs` | Node script | 讀 channels → 抓各頻道 RSS → 與 queue diff → 新片 append 為 pending | 無(RSS 免 API key) |
| `.github/workflows/poll.yml` | GH Action | cron 跑 poll;有新片 commit queue + 開/更新 Issue 通知 | GitHub Actions |
| `tools/review.mjs` | 本機 web 工具 | 起 localhost,pending 影片做成縮圖卡,Approve/Reject 改寫 queue | 無(Node 內建 http) |
| `tools/gen-note.mjs` | Node script | 對 approved:抓字幕 → Claude 產 doc-N.md(+zh)→ 分類 → 更新 order/cat → 標 published | Anthropic API key、字幕來源 |
| `build.mjs`(既有) | Node script | 產出 index.html / index.zh.html | 無 |
| `tools/i18n-check.mjs`(既有) | Node script | 驗雙語結構一致 | 無 |
| `vercel.json` | 設定檔 | Vercel build/output/路由設定,讓部署時跑 `npm run build` | Vercel 專案 |

## 6. 分階段實作計畫

### Phase 0 — 資料骨架(0.5 天)

**目標**:定義並建立兩個資料檔與 schema,不動任何邏輯。

- 交付:`channels.json`(先填你目前追蹤的頻道)、空的 `queue.json`、在
  `CONTRIBUTING` 補一段資料檔說明。
- 驗收:兩檔存在、格式合法、被 git 追蹤。

### Phase 1 — 輪詢與挑選(最小可跑,1–2 天)★ 先做這段

**目標**:當天就能「訂閱頻道 → 本機看到新片 → 挑選」跑通一輪。不碰 LLM、不碰 CI。

- `tools/poll.mjs`:讀 channels → 抓 RSS → diff → 寫 pending 進 queue。手動 `node tools/poll.mjs` 執行。
- `tools/review.mjs`:`node tools/review.mjs` 開 localhost,列出 pending 影片(縮圖+標題+頻道+日期),Approve/Reject 直接改寫 queue.json。
- 驗收:
  - 對已知頻道跑 poll,新片正確落進 queue 且不重複。
  - 在瀏覽器按 Approve/Reject,queue.json 的 status 正確變更。
  - 重跑 poll 不會重複塞已存在的影片。

### Phase 2 — 自動輪詢與通知(1 天)

**目標**:不用自己記得跑 poll。

- `.github/workflows/poll.yml`:cron(建議每天一次)跑 `poll.mjs`;若 queue 有新增,commit 更新後的 queue.json,並開/更新一個 Issue 列出待挑選清單。
- 驗收:
  - Action 依排程觸發、成功 commit。
  - 有新片時 Issue 被建立/更新;無新片時不製造雜訊。

### Phase 3 — LLM 生成 note 草稿(2–3 天)

**目標**:approved 影片自動產出 house-style 草稿 + 分類建議。

- `tools/gen-note.mjs`:
  - 抓 transcript(抓不到 → 標 `needs-transcript`,不硬產)。
  - 呼叫 Claude,以 `doc-100.md` 等既有 note 當 few-shot 鎖 house style,產 `doc-N.md`。
  - doc id 依 `order.json` 現有最大值 +1 配號(同批多片不搶號)。
  - 產中文翻譯 `src/i18n/zh/notes/doc-N.md`。
  - LLM 分類到 A–I → append 到 `cat-K.md` 的 `docs:` + `order.json`。
  - 回填 queue 的 `docId`,status 標 `published`。
- 安全:API key 走環境變數,**絕不進 repo**。
- 驗收:
  - 對一支 approved 影片跑 gen-note,產出的 doc-N.md 通過 `npm run build` 與 `i18n-check`。
  - 草稿格式(frontmatter 三欄齊全、段落/清單合規)與既有 note 一致。
  - 分類落進正確的 cat 檔、order.json 有新 id。

### Phase 4 — 複審與上站流程收斂(1 天)

**目標**:把末端接回既有手動流程,並自動化把關。

- gen-note 後自動開 PR(或產生本機分支供你開 PR)。
- CI 在 PR 跑 `npm run build` + `i18n-check.mjs`。
- 你在 PR 上複審/修訂 note 與分類 → merge → 上站。
- 驗收:PR 內含正確 diff、CI 綠燈、merge 後站點正確顯示新 note。

### Phase 5 — Vercel 部署與自動重新部署(0.5–1 天)

**目標**:站點掛上 Vercel,且每次 merge 到 main 後自動重新部署,不用手動出站。

**部署策略(建議 Vercel Git 整合)**

Vercel 原生支援連結 GitHub repo,push 到 main 即自動觸發 build + deploy——
最省事、零額外密鑰、與既有 PR 流程天然接上。

- `vercel.json`:
  - `buildCommand`: `npm run build`
  - `outputDirectory`: `.`(產物 `index.html` / `index.zh.html` 在 repo 根目錄)
  - 視需要設 `cleanUrls` / 路由,確保根路徑開 `index.html`。
- Vercel 專案設定:
  - Import GitHub repo,Production Branch 設 `main`。
  - PR 會自動產生 Preview Deployment(複審時可先看預覽)。
- 產物策略:**採方案 B — build 時產出、不 commit 產物**(定案)。
  - 把 `index.html` / `index.zh.html` 從版控移除(`git rm --cached`)並加進 `.gitignore`。
  - Vercel `buildCommand: npm run build` 為**必要**(repo 內不再有現成產物)。
  - 好處:diff 乾淨、不再把 1MB+ 的 HTML 塞進每次 commit。
  - 代價:本機預覽需先 `npm run build`;README「開啟方式」段落需同步調整。
  - (未採用的 A:續留 commit 產物、`buildCommand` 可省,但 diff 會含大檔。)

**替代方案(不接 Git 整合時)**:用 Vercel Deploy Hook + GitHub Action,
在 merge to main 後 `curl` 觸發部署。多一組 Hook URL 要當 Secret 管,一般不需要。

**文件收尾(最後完成)**

- 更新 `README.md` 與 `README.zh-TW.md`:補上 Live 站點網址與部署方式(Vercel)說明;
  若採產物策略 B,一併調整「開啟方式」段落(需先 `npm run build`)。

- 驗收:
  - 站點可由 Vercel 網址開啟,`index.html`(EN)與 `index.zh.html`(中文)皆正常。
  - merge 一個 PR 到 main 後,Vercel 自動重新部署且線上內容更新。
  - PR 有 Preview Deployment 可預覽。
  - 兩份 README 皆已反映 Live 網址與部署流程。

## 7. 風險與注意事項

- **字幕缺失**:非每片都有官方字幕。gen-note 要能優雅處理(標 `needs-transcript`,不硬產爛草稿)。
- **API key 外洩**:gen-note 用 Anthropic API key,只走環境變數 / GitHub Secrets,絕不進 repo。
- **doc id 搶號**:同批多片處理時依 order.json 現有最大值遞增,避免撞號。
- **LLM 分類誤判**:分類僅為「建議」,以 PR 複審為準。
- **RSS 限制**:YouTube RSS 每頻道只回最近約 15 支;頻繁更新的頻道靠 cron 頻率兜住,不追歷史全量。
- **queue.json 膨脹**:長期 rejected/published 累積,之後可加封存或裁剪(非 MVP)。
- **產物 commit 策略**:若採「build 時產出、不 commit」(Phase 5 方案 B),要把
  `index*.html` 加進 `.gitignore`,並確認本機 / CI 預覽都能自行 build,避免出現
  「repo 沒產物、Vercel 也沒設 buildCommand」的空站。

## 8. 未來延伸(非 MVP)

- 挑片 UI 加關鍵字/頻道過濾、批次操作。
- gen-note 支援「多語系一次產出」。
- 依主題自動建議是否需要新增分類。
- 以 GitHub Projects 看板取代/補強本機 review 工具。

## 9. 建議起步

從 **Phase 1** 開始(`channels.json` + `poll.mjs` + `review.mjs`),不碰 LLM 與 CI,
先讓「訂閱 → 看到新片 → 挑選」跑通一輪,再往後接自動輪詢與生成。
