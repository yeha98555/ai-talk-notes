# AI 工程演講 — 分類與精華整理

> [English](README.md) · **繁體中文** · **[線上站點 ↗](https://ai-talk-notes.vercel.app)**

本專案有系統地整理了 **159 篇 AI 工程領域的研討會與 YouTube 演講筆記**，依 **9
大主題分類**歸類，並濃縮成簡短、易讀的重點摘要——另外還提煉出橫跨全部語料庫的
**9 項跨主題洞察**。

發布的頁面是一個**單一、自成一體的 `index.html`**——不需伺服器、沒有外部相依套
件，用瀏覽器打開即可。此檔案現在是透過一支小型建置腳本
（[`build.mjs`](build.mjs)）從 [`src/`](src/) 底下**小型、可組合的來源檔案**
產生出來的，因此你編輯的是聚焦的局部檔案，而非單一 44k 行的龐大檔案。CSS 與
JS 會在建置時內嵌，讓輸出檔案不需任何相依套件。

本站同時提供**英文與繁體中文**版本。語言切換按鈕（`EN | 中文`）位於「*View
source on GitHub*」按鈕正上方；首次造訪時會依照瀏覽器語言設定（任何 `zh*` 偏
好 → 中文，否則為英文），之後你的選擇會被記住。建置流程會產生兩個自成一體的頁
面——`index.html`（英文）與 `index.zh.html`（繁體中文）——切換按鈕會在兩者間切
換，同時保留你在頁面上的位置。

## 亮點

- **159 場演講**濃縮為簡短的重點摘要。
- **9 大主題分類**（A–I），並附分類分布總覽。
- 橫跨全部演講整理出的 **9 項跨主題洞察**。
- **每則摘要皆附雙重佐證：**
  - 點擊演講標題（或 **📄 Full notes** 按鈕）即可展開完整原始筆記，直接嵌入頁
    面中。
  - 透過 **▶ Source video** 連結回原始 YouTube 演講影片。
- **個人筆記** ——在演講的完整筆記中選取一句話（在手機上則是點選一句話，再次
  點選可延伸涵蓋更多句子），選擇 **★ Save as note** 即可將其標記起來。已儲存
  的筆記會集中收錄在依演講分組的 **Your Notes** 區塊中，並保存於你的瀏覽器
  裡。
- **完全自成一體的輸出** ——所有筆記都會被渲染並嵌入，因此發布的 `index.html`
  不依賴任何外部檔案或網路連線。
- **可組合的來源檔案** ——頁面由小型局部檔案（`src/`）建置而成，因此無需改動
  單一巨型檔案即可輕鬆編輯與擴充。

## 分類

| # | 分類 | 演講數 |
|---|----------|:-----:|
| A | BI / 分析 / 語意層 | 15 |
| B | Agent 評估與可觀測性 | 16 |
| C | Agent 架構、可靠性與上線部署 | 17 |
| D | Agent 安全與身分 | 8 |
| E | 上下文 / 記憶 / RAG | 18 |
| F | 資料基礎設施 | 18 |
| G | 模型訓練與推論 | 21 |
| H | AI 輔助開發與 AI 原生工程 | 12 |
| I | 產品策略與商業 | 6 |

每場演講皆歸入單一主要主題。

## 跨主題洞察

1. 語意層正被重新定義——從 BI 工具下沉，成為「Agent 所消費的上下文」。
2. 可靠 text-to-SQL 的關鍵在於扎根（grounding）與資料建模，而非更大的模型。
3. 評測正從「憑直覺」走向資料驅動的工程。
4. 從 PoC 到正式上線：可靠性是系統工程問題，而非模型問題。
5. 上下文工程與記憶決定了 Agent 是否使用正確的資料。
6. 資料基礎設施正為 AI／Agent 而重塑。
7. 安全與身分是 Agent 存取企業資料的前提條件。
8. BI 的未來與產品資料飛輪。
9. 小型、專精的模型／Agent 勝過龐大且通用的模型。

## 使用方式

兩個頁面是**建置產物、已不再提交進版控**,因此請先從來源建置,再於瀏覽器開啟:

```bash
npm run build          # 產出 index.html + index.zh.html

# macOS
open index.html
# Linux
xdg-open index.html
# 或在本機起伺服器,再造訪 http://localhost:8000
python3 -m http.server
```

隨時可用的版本是線上站點——見 [部署](#部署)。

## 內容 pipeline

新演講透過一條輕量的**發現 → 挑選 → 生草稿 → 複審 → 上站** pipeline 進到站上。
站點本身維持零後端——「資料庫」就是進 git 的 JSON 加上 GitHub Actions——而且**一個
GitHub Issue 就是你操作的控制面板**,連手機都能挑片:

```text
channels.json ─poll(cron)─▶ queue.json(develop)+ 📥 review Issue
                    Issue:triage.mjs 把每支 pending 評成 ⭐/🤔/⏭️(OpenAI)+ ✅/❌ checkbox
   ② 勾 ✅/❌ + 🚀 送出 ─queue-control─▶ approved   (develop 上一個 commit)
   ③ gen-note --pr(字幕 → Claude 草稿 + 中文 + 分類)─▶ PR(記回 Issue)
   ④ 複審 PR ─merge─▶ develop ─⑤ Release(一鍵)─▶ main ─▶ Vercel build + 部署
```

- [`tools/poll.mjs`](tools/poll.mjs) —— 把各頻道 RSS 抓進 `develop` 上的 `queue.json`
  (由 [`.github/workflows/poll.yml`](.github/workflows/poll.yml) 排程)
- [`tools/triage.mjs`](tools/triage.mjs) —— 用 OpenAI API(`gpt-4o-mini`)替 pending
  評分,並把 review Issue 渲染成 ⭐/🤔/⏭️ + checkbox 的控制面板
- **在 Issue 上挑片** —— 勾 ✅/❌ 再勾底部 🚀 送出;
  [`queue-control.yml`](.github/workflows/queue-control.yml) 用
  [`tools/queue-apply.mjs`](tools/queue-apply.mjs) 把整批一次寫進 `develop`(一個 commit)。
  離線替代:[`tools/review.mjs`](tools/review.mjs) 本機 approve/reject UI。
- [`tools/gen-note.mjs`](tools/gen-note.mjs) `--pr` —— 字幕 → house-style 筆記 +
  繁體中文翻譯 + 分類建議;開複審 PR,並把「這批 → PR#」記回 Issue
- **分支模型:** `queue.json` 住在 `develop`;`main` 是純 release 分支,用 **Release
  (develop → main)** workflow 一鍵發佈。
- **兩道人工關卡:** 決定收哪些影片、以及在 PR 上複審每篇生成的筆記

每日操作手冊(你實際要做的步驟)見 **[`OPERATIONS.zh-TW.md`](OPERATIONS.zh-TW.md)**
([English](OPERATIONS.md))。設計筆記與逐階段狀態放在 [`docs/`](docs/)(PRD + todo)。

## 部署

部署在 **Vercel**,採 Git 整合——每次 push/merge 到 `main` 就跑 `npm run build`
並重新部署;Pull Request 會各自產生 Preview Deployment。要把 `develop` 上複審過的
內容上站,用 **Release (develop → main)** workflow 一鍵發佈(Actions → Run workflow)
——它會開 release PR、等 CI 綠、自動 merge。

- **Live:** <https://ai-talk-notes.vercel.app>
- 頁面(`index.html` / `index.zh.html`)**不進版控**——由 Vercel 從來源建置
  ([`vercel.json`](vercel.json) 設定 `buildCommand: npm run build`)。
- 純資料 commit(poll bot / Issue 控制面板更新 `develop` 上的 `queue.json`)會透過
  Vercel 的 *Ignored Build Step* 略過重建,只有真正的內容變更才觸發部署。

## 專案結構

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

所有演講筆記與分類卡片都是以 **Markdown** 撰寫，並渲染成與語言無關的 HTML；完整版面配置請見 [`src/README.zh-TW.md`](src/README.zh-TW.md)，如何新增或翻譯
內容請見 [`CONTRIBUTING.zh-TW.md`](CONTRIBUTING.zh-TW.md)。

## 開發

`index.html` 是建置產物——請改為編輯 `src/` 底下的檔案，然後重新產生：

```bash
npm run build   # or: node build.mjs
```

建置流程只做串接、內嵌與渲染（無需安裝任何相依套件），且結果可重現。需要
Node.js。執行一次即可同時產生 `index.html` 與 `index.zh.html`。

**所有內容皆以 Markdown 撰寫。** 演講筆記（`notes/doc-*.md`）與分類卡片
（`sections/cat-*.md`）都是以 Markdown／純文字撰寫，並渲染成與語言無關的 HTML——英文版位於 `src/`，各語言翻譯則位於 `src/i18n/<locale>/`。尚未翻譯的部
分會回退（fallback）為英文。建置完成後，執行 `node tools/i18n-check.mjs` 以驗
證兩個頁面在結構上維持一致。

## 貢獻

歡迎貢獻——包含新增演講、修正錯誤與翻譯。所有內容皆以 Markdown 撰寫，一次建
置即可同時渲染兩個語言頁面。內容模型、Markdown 格式、如何新增演講，以及如何
新增或改善翻譯，請見 **[`CONTRIBUTING.md`](CONTRIBUTING.md)**
（[繁體中文](CONTRIBUTING.zh-TW.md)）。

## 方法與佐證

- **資料來源：** 全部 159 篇 Markdown 演講筆記，皆完整渲染並嵌入建置後的頁面中
  （不依賴外部 `.md` 檔案）。
- **雙重佐證：** 每則摘要皆同時連結至完整原始筆記（可於頁面內展開）與來源
  YouTube 影片。
- **分類方式：** 每場演講在 9 大分類（A–I）中歸入單一主要主題；每項洞察皆取
  材自完整語料庫。

## 致謝

本專案改作自 [cyyeh/ai-talk-notes](https://github.com/cyyeh/ai-talk-notes)
（MIT 授權），並由 [yeha98555](https://github.com/yeha98555) 加入額外功能。

## 授權

採用 [MIT 授權](LICENSE) 釋出。© 2026 cyyeh、yeha98555。
