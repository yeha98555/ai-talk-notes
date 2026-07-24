# 操作手冊 — 每日流程

> [English](OPERATIONS.md) · **繁體中文**

日常怎麼跑內容 pipeline:哪些是自動發生的,哪些三步需要**你**當品質關卡。背後設計
見 [`PRD-v2.md`](PRD-v2.md);工具細節見 [`tools/`](tools/) 原始碼與
[`CONTRIBUTING.zh-TW.md`](CONTRIBUTING.zh-TW.md)。

## 資料流(一眼看懂)

```text
YouTube RSS ──① poll(cron)──▶ queue.json +「Video review queue」Issue
                                     │
                    ② 你挑片  Approve / Reject   (tools/review.mjs)
                                     │
                    ③ gen-note  字幕 → Claude 草稿 → PR
                                     │
                    ④ 你在 PR 複審(筆記 + 分類)→ merge
                                     │
                    ⑤ Vercel  build + deploy ──▶ 上站
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
- 開/更新單一 **「📥 Video review queue」** Issue,列出待挑清單

👉 **你:** 打開那個 Issue,掃一眼待挑清單。沒新片的日子 Action 安靜、Issue 不動
——什麼都不用做。

> 想手動催一次:GitHub → **Actions → `poll` → Run workflow**。

### Step 2 — 挑片(手動)

挑片**和**生草稿都在**同一條分支**(`develop`)做完,`queue.json` 的改動就不用跨
`git switch` 帶來帶去。`queue.json` 現在就住在 `develop`——poll bot 直接 push 到這裡
——所以 pull 一下就好,再開挑片 UI:

```bash
git switch develop && git pull    # queue.json 已在手邊,不用跨分支 checkout
node tools/review.mjs             # 開 http://localhost:4321
```

對每支 pending 影片按 **Approve / Reject**(可填備註)。這會即時改寫 `queue.json`
的 `status`。挑完關掉分頁即可。

> **先預篩(選用,advisory):** pending 一多時,先用 **`triage-queue` skill**——講
> 「幫我看 pending 哪個值得收」/「triage the queue」。它會把每支 pending 排成
> **⭐ Strong / 🤔 Maybe / ⏭️ Skip**,附建議分類與一句理由、標出重複片,並給你一份可直接
> 複製的 approve 清單。它不改 `status`——你仍在 UI 按 Approve/Reject(或請它幫你套用選擇、
> 把拒絕原因寫進各項的 `note`)。

> Port 被占用?`PORT=4322 node tools/review.mjs`。

### Step 3 — 生成筆記草稿 + 開 PR(手動)

停在 `develop`——就是你剛 approve 的那條分支——`queue.json` 的改動就在這裡、不跨分支
帶動,PR 也會以 `develop` 為 base 開出。`gen-note --pr` 會 `git add -A` 把**整個工作
區**都 commit 進去,所以先確認乾淨:

```bash
git status        # 預期:只有 queue.json 被改動

# 正式跑(需要 API key;走環境變數,絕不進 repo)。
ANTHROPIC_API_KEY=sk-... node tools/gen-note.mjs --pr
```

對「已 approve 且還沒 `docId`」的影片,每支它會一路做完:抓字幕 → Claude 產 `doc-N.md` + 繁體中文翻譯 → 分類 A–I 並把
卡片插進對應的 `cat-*.md` → 更新 `order.json` 與演講總數 → 回填 queue 的 `docId`
標 `published` → `npm run build` → 開分支、commit、push、`gh pr create`。

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

## 濃縮表(貼在手邊)

| 步驟 | 動作 | 位置 / 指令 |
|---|---|---|
| ① | 看有無 pending | GitHub Issue「📥 Video review queue」 |
| ② | Approve / Reject | `git pull` → `node tools/review.mjs` |
| ③ | 產草稿 + 開 PR | `ANTHROPIC_API_KEY=... node tools/gen-note.mjs --pr` |
| ④ | 複審分類 + 內容 → merge | GitHub PR(等 CI 綠燈) |
| ⑤ | 自動上站 | Vercel(merge 到 `main` 後) |

**沒新片的日子只有 ① 要做——瞄一眼 Issue,其餘免動。**

> 挑片前可先用 **`triage-queue`** skill 預篩(⭐/🤔/⏭️ 排名 + 建議分類 + approve 清單)
> ——advisory,加速 Step ②。
>
> 偶爾、非每日:用 **`manage-channels`** skill 新增/移除追蹤頻道(貼網址即可)——它餵給
> Step ①。詳見上面的《管理訂閱頻道》。
