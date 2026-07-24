# 操作手冊 — 每日流程

> [English](OPERATIONS.md) · **繁體中文**

日常怎麼跑內容 pipeline:哪些是自動發生的,哪些步驟需要**你**當品質關卡。背後設計
見 [`PRD-v2.md`](PRD-v2.md)(基礎 pipeline)與 [`PRD-v3.md`](PRD-v3.md)(GitHub Issue
控制面板);工具細節見 [`tools/`](tools/) 原始碼與 [`CONTRIBUTING.zh-TW.md`](CONTRIBUTING.zh-TW.md)。

## 資料流(一眼看懂)

```text
YouTube RSS ──① poll(cron)──▶ queue.json + 📥 Issue 控制面板(triage + checkbox)
                                     │
                    ② 你挑片 — 在 Issue 上勾 ✅/❌ 再勾 🚀 送出
                                     │        (或本機 tools/review.mjs 按 Approve/Reject)
                    ③ gen-note  字幕 → Claude 草稿 → PR(結果記回 Issue)
                                     │
                    ④ 你在 PR 複審(筆記 + 分類)→ merge 進 develop
                                     │
                    ⑤ Release(develop → main)──▶ Vercel build + deploy ──▶ 上站
```

**① 與 ⑤ 全自動**,**②③④ 是你的活**——人是品質關卡。

> **分支模型:** `queue.json`(與 `channels.json`)住在 **`develop`**——poll 在那裡讀
> 寫,你也在那裡挑片/生草稿。**`main` 是純 release 分支**,只被 `develop → main` 的
> release PR(⑤)更新,沒有東西直接寫 `main`。

## 前置(一次性)

- 安裝並登入 `gh` CLI(`gh auth login`)——`gen-note --pr` 會用到。
- 一把 Anthropic API key,透過環境變數 `ANTHROPIC_API_KEY` 傳入。
  **絕不進 repo**——只存在你的 shell 環境或 GitHub Secrets。
- Vercel 已接上 repo,Production Branch = `main`(已完成)。

## 管理訂閱頻道(偶爾做,在 Step ① 之前)

`channels.json` 決定 **Step ① poll 追哪些頻道**。新增或移除頻道是偶爾性的設定,不屬於
每日循環。最省事的做法是用 **`manage-channels` skill**——直接用自然語言講,通常就是貼一
個網址:

- **新增:**「訂閱 https://www.youtube.com/@某頻道」/「add this channel `<url>`」
- **移除:**「移除 @某頻道」/「unsubscribe `<名稱>`」

skill 會解析 `channel_id`、驗 RSS feed、安全地改 `channels.json`(去重 + 保持 JSON 合
法),並可跑 poll 把新頻道的影片直接拉進 queue——接著就進到下面的
**② 挑片 → ③ 生草稿 → ④ 複審 → ⑤ 上站** 日常流程。

注意:

- 頻道異動要**進到 `develop`** 才會被每天 08:00 UTC 的 poll 用到(poll 現在 checkout
  `develop`)——把 `channels.json` commit 到 `develop`(skill 會提議 commit 並先問你);
  之後再經 `develop → main` release PR 進到 `main`。
- 移除頻道只停*未來*輪詢;已在 `queue.json` 的影片保留不動。
- 手動 fallback(skill 幫你自動化的部分):改 `channels.json`——一筆是
  `{ "id": "UC…", "name": "…", "handle": "@…" }`,只有 `id` 驅動抓取——再跑
  `node tools/poll.mjs`。

## 每日步驟

### Step 1 — 看有沒有新片(自動,你只需查看)

`poll.yml` GitHub Action 每天 **08:00 UTC** 自動跑。有新片時:

- 以 `status: pending` 追加進 `queue.json` 並 push 回 `develop`(`[skip ci]`)
- 把單一 **「📥 Video review queue」** Issue 重建成**控制面板**:`triage.mjs` 用 GitHub
  Models(`gpt-4o-mini`)把每支 pending 評成 **⭐ / 🤔 / ⏭️**,附建議分類與一句理由,每支
  帶 **✅ approve / ❌ reject** checkbox,底部再放一個 **🚀 送出** box。

👉 **你:** 打開那個 Issue,掃一眼 triage。沒新片的日子 Action 安靜、Issue 不動
——什麼都不用做。

> 想手動催一次:GitHub → **Actions → `poll` → Run workflow**。triage 走 Action 的
> `GITHUB_TOKEN` 打 GitHub Models(不用額外 key);萬一它暫時不可用,Issue 仍會列出每支
> 影片、checkbox 照常可用。

### Step 2 — 挑片(在 Issue 上,或本機)

**主要 — 直接在 Issue 上(手機也能做):** 在每支影片下勾 **✅ approve** 或 **❌ reject**,
全部勾好後勾底部的 **🚀 送出**。只勾 approve/reject 不會有動作——只有勾送出才套用:
`queue-control.yml`(owner-only)把整批一次寫進 `develop`(**一個 commit**)、把每支 reject 的
triage 理由寫進它的 `note`,再重繪 Issue(送出取消、已處理列移除)並留言 summary。兩個都不勾就
維持 `pending` 留待之後。

**備援 — 本機(離線或大量修改):** `queue.json` 住在 `develop`,pull 一下就好,再開本機挑片 UI:

```bash
git switch develop && git pull    # queue.json 已在手邊,不用跨分支 checkout
node tools/review.mjs             # 開 http://localhost:4321
```

對每支 pending 影片按 **Approve / Reject**(可填備註);這會即時改寫 `queue.json` 的 `status`。
弄完自己 commit。

> Issue 本來就會自動顯示 triage(CI,走 GitHub Models)。本機 **`triage-queue` skill**——講
> 「幫我看 pending 哪個值得收」/「triage the queue」——是 `review.mjs` 路徑的離線等價:一樣的
> **⭐ / 🤔 / ⏭️** 排名、建議分類、可複製的 approve 清單;不主動改 `status`,除非你要它套用。

> Port 被占用?`PORT=4322 node tools/review.mjs`。

### Step 3 — 生成筆記草稿 + 開 PR(手動)

若你在 Issue 上批的,approve 已經在 `develop` 上了——**先 pull**。`gen-note --pr` 以 `develop`
為 base 開 PR,而且**只 stage 它動到的檔**(不是 `git add -A`):

```bash
git switch develop && git pull    # 取回 queue-control 幫你 commit 的 approve

# 正式跑(需要 API key;走環境變數,絕不進 repo)。
ANTHROPIC_API_KEY=sk-... node tools/gen-note.mjs --pr
```

對「已 approve 且還沒 `docId`」的影片,每支它會一路做完:抓字幕 → Claude 產 `doc-N.md` + 繁體中文翻譯 → 分類 A–I 並把
卡片插進對應的 `cat-*.md` → 更新 `order.json` 與演講總數 → 回填 queue 的 `docId`
標 `published` → `npm run build` → 開分支、commit、push、`gh pr create`,並在 review Issue
**留言「🧾 這批 → PR #NN」**(一次一個 PR,每批 queue 對應到它的 PR)。

實用變化:

- `node tools/gen-note.mjs --dry-run --pr` —— 用假草稿驗機械寫檔與開 PR 流程,不花
  API key。
- `ANTHROPIC_API_KEY=... node tools/gen-note.mjs <videoId> --pr` —— 只處理指定某支。
- 抓不到字幕的片會被標 `needs-transcript` 跳過(不硬產爛草稿);隔天 poll 通常就抓
  得到自動字幕。

### Step 4 — 在 PR 上複審 + 修訂(手動,關鍵關卡)

到 GitHub 打開這個 PR:

1. 等 **CI(`ci.yml`)綠燈**——它跑 `npm run build` + `i18n-check`。
2. 讀 diff:**筆記是否忠實、分類 A–I 是否正確、中文翻譯是否 OK?** LLM 的分類只是
   *建議*——不對就直接在 PR 分支改 `cat-*.md` 的歸類。
3. 沒問題 → **Merge**。(建議節奏:先併回 `develop` 累積,要上站時再 `develop → main`。)

### Step 5 — 上站(自動)

merge/push 到 **`main`** 後,**Vercel 自動 build + deploy**,線上一分鐘內更新。

- 線上:<https://ai-talk-notes.vercel.app>
- PR 階段也會有各自的 **Preview Deployment**,可在 merge 前先預覽。
- 純資料 commit(只動 `queue.json` / `channels.json`)會被 Vercel 的 *Ignored
  Build Step* 略過,不觸發重建。

**上線(`develop → main`)。** 複審過的 note 累積在 `develop`,要上站時**一鍵**發佈:
Actions → **「Release (develop → main)」→ Run workflow** —— 它會開 release PR、等 CI 綠、
自動 merge(把 *merge* 取消勾選則只開 PR)。或自己手動開/併 `develop → main` PR。

> **什麼要 release、什麼不用。** 工具*腳本*(`triage.mjs`、`queue-apply.mjs`、`gen-note.mjs`)
> 改動進 `develop` **就生效**——`poll.yml` / `queue-control.yml` 都 checkout `develop`,`gen-note`
> 本機跑。只有**workflow YAML 本身**(`poll.yml`、`queue-control.yml`、`release.yml`)的改動要進到
> `main` 才生效,因為 `schedule` / `issues` / `workflow_dispatch` 一律跑 **default branch** 上的版本。

## 濃縮表(貼在手邊)

| 步驟 | 動作 | 位置 / 指令 |
|---|---|---|
| ① | 掃一眼 triage 過的 queue | GitHub Issue「📥 Video review queue」(⭐/🤔/⏭️ + checkbox) |
| ② | Approve / Reject | 在 Issue 上勾 ✅/❌ + **🚀 送出**(或 `node tools/review.mjs`) |
| ③ | 產草稿 + 開 PR | `git pull` → `ANTHROPIC_API_KEY=... node tools/gen-note.mjs --pr` |
| ④ | 複審分類 + 內容 → merge 進 develop | GitHub PR(等 CI 綠燈) |
| ⑤ | Release + 上站 | Actions → **「Release (develop → main)」** → Vercel |

**沒新片的日子只有 ① 要做——瞄一眼 Issue,其餘免動。**

> Issue 會自動顯示 triage(CI,走 GitHub Models)。本機 **`triage-queue`** skill 是
> `review.mjs` 路徑的離線等價。
>
> 偶爾、非每日:用 **`manage-channels`** skill 新增/移除追蹤頻道(貼網址即可)——它餵給
> Step ①。詳見上面的《管理訂閱頻道》。
