# TODO — PRD v4 實作清單

> 對應 [`PRD-v4.md`](PRD-v4.md)。把 content-check 的品質守門**前移到 gen-note 產生當下**
> （產生即驗證 + 最多一次 retry + 單篇失敗隔離），並把英文草稿與中文翻譯**拆成兩次呼叫**。
> 起因：2026-08-01 doc-134–158 批次 25 篇壞 5 篇（20%），全批卡在 build、手工修補收場（PR #16）。
> 依 Phase 順序執行，每個 Phase **跑通驗收 + 回來打勾**再進下一個。
>
> **進度（2026-08-01）**：尚未開始。Phase 1 ☐、Phase 2 ☐、Phase 3 ☐。

## Git 工作流（每個 Phase 都遵守）

每個 Phase **開始前**先從 `develop` 切分支實作，**跑通驗收後**用 `git merge --no-ff` 併回
`develop`（保留合併節點）。階段內分功能、邊做邊 commit（Conventional Commits、冒號後首字母大寫、
不加 co-author）。

> **v4 特別注意**：Phase 2 與 Phase 3 都只動 `tools/gen-note.mjs`，**共用同一條分支、
> 兩個 Phase 各自 commit、驗收各自打勾，最後一起併回**（PRD §7：分開反而衝突）。
> 本版**不動任何 workflow YAML** → 全部是本機工具腳本，**併進 develop 即生效**，
> 沒有「要 release 到 main 才生效」的 gated 驗收（對比 v3）。

| Phase | 分支名 |
|---|---|
| 1 | `feat/v4-prose-check` |
| 2 + 3 | `feat/v4-gen-note-guard`（共用一條，兩 Phase 分開 commit） |

## Phase 1 — 抽出 `prose-check.mjs`，content-check 改用 ★ 先做，2/3 的地基

**目標**：檢查邏輯單一事實來源——gen-note 產生時擋的與 content-check build 時擋的永遠同一套規則。

### `tools/prose-check.mjs`（新）
- [x] 從 `content-check.mjs` 搬出核心純函式：`isStub()`、`stripCites()`、`TERMINAL` 正則（+ 包成 `endsMidSentence()`）
- [x] 新增 `checkDraftFields(fields) → problems[]`：對草稿物件做欄位級檢查
  （title/speaker：不得 stub 或空；body/card_summary 類（key 以 `body`/`summary` 結尾）：不得 stub、空、斷句結尾——判準與 content-check 對 note/卡片的檢查一一對應）
- [x] 零依賴、純函式（不讀檔、不 exit），gen-note 與 content-check 皆可 import

### `tools/content-check.mjs`（改）
- [x] 改 import `prose-check.mjs`，刪除內聯副本（header 加註「規則住在 prose-check.mjs」）
- [x] 掃描邏輯、輸出格式、exit code **完全不變**（純重構）

### 驗收
- [x] 對當前 repo 跑 `node tools/content-check.mjs`，輸出與改動前**逐字元一致**（`diff` 前後輸出 = 空、exit 0）
- [x] 手動構造三類壞草稿（斷句結尾／`placeholder` stub／空欄位），`checkDraftFields` 逐一命中（scratch 測試 10/10 pass，含 CJK 句號、citation 結尾、大小寫 stub、title 豁免斷句檢查等邊界）
- [x] 對照組：doc-100 的欄位餵進去 → `problems` 為空

> **狀態（2026-08-01）**：✅ 全綠。commit `0985103`，`--no-ff` 併回 develop。
> 語意備註：「`…citation [7:29]` 無標點收尾」會被flag（剝 cite 後仍須標點）——與 content-check 原行為一致，非 v4 新增判準。

## Phase 2 — gen-note 拆成兩段呼叫（en 草稿 / zh 翻譯）

**目標**：call 1 產英文草稿＋分類、call 2 只做 zh 翻譯，各自擁有完整 `max_tokens: 16000` 預算；
翻譯輸入改為**定稿英文 note**（不重送逐字稿）。

### `tools/gen-note.mjs`（改 — 與 Phase 3 同分支）
- [ ] `DRAFT_SCHEMA` 拆成 `EN_SCHEMA`（title/speaker/category/body/card_summary）與
  `ZH_SCHEMA`（zh_title/zh_speaker/zh_body/zh_card_summary），皆 `additionalProperties: false`
- [ ] `buildEnPrompt(item, transcript)`：沿用現有 system（doc-100 house-style 範例 + 規則），僅要求英文欄位 + 分類
- [ ] `buildZhPrompt(enDraft)`：輸入定稿英文 note（frontmatter + body + card_summary）＋
  zh 風格範例 `src/i18n/zh/notes/doc-100.md` ＋ 翻譯規則（台灣繁中、專有名詞保留原文）；**不含逐字稿**
- [ ] category 只存在於 `EN_SCHEMA`（zh 呼叫結構上不可能推翻分類）
- [ ] `stubDraft` 對應拆成兩段（en stub / zh stub），`--dry-run` 全流程行為不變
- [ ] 兩段結果合併回現有寫檔流程（寫檔、插卡、order、queue 標 published 的程式碼不動）

### 驗收
- [ ] `--dry-run`：檔案結構、console 輸出與現行一致
- [ ] 挑一支影片 live 重跑（`gen-note <videoId>`，暫時清該片 docId 測試後還原）：
  產出檔案結構與現行完全一致、zh 風格與既有 note 無明顯落差
- [ ] 觀察兩段呼叫的 input 大小：call 2 不含逐字稿（應遠小於 call 1）

> **狀態**：未開始。

## Phase 3 — 呼叫後驗證 + 最多一次 retry + usage 觀測

**目標**：每次呼叫後就地跑 `checkDraftFields`，不合格**最多重試一次**（附失敗欄位提示）；
仍失敗 → 該篇原子放棄（item 保持 `approved`、不寫任何檔）、**批次續行**；token 用量可觀測。

### `tools/gen-note.mjs`（改 — 承 Phase 2 分支）
- [ ] `callClaude` 回傳附帶 `usage`；每次呼叫 console 印 `tokens: in=… out=…（out/max=…%）`，
  逾 80% 加 `⚠ near max_tokens`
- [ ] 包裝 `callWithRetry(prompt, schema, label)`：
  - [ ] 呼叫 → `checkDraftFields` 合格即回傳
  - [ ] 不合格 → 印 problems → **重試一次**，user message 尾端附失敗欄位提示
    （"Previous attempt failed checks: <problems>. Ensure every field is complete prose ending with terminal punctuation; never output the word \"placeholder\"."）
  - [ ] 仍不合格 → throw（**上限就是 1 次 retry，單篇最壞 4 次呼叫**，call 1 失敗則 call 2 不發生）
- [ ] 外層 catch 沿用現有「✗ draft failed — left approved for retry」路徑：該篇不寫檔、批次續行
- [ ] `--dry-run` 的 stub 必須恆過 `checkDraftFields`（stub 文案以句號收尾——改 stub 文案時注意）

### 驗收
- [ ] **故障注入**（暫時 mock 一次壞回應或調嚴檢查）驗兩條路徑：
  - [ ] 第一次失敗 → 重試 → 成功寫檔（console 可見 problems + retry）
  - [ ] 兩次失敗 → 該篇跳過、item 仍 `approved`、後續影片照常處理、PR 只含成功篇
- [ ] 注入痕跡清除後，正常批次跑完 `npm run build` → content-check **0 FAIL**
- [ ] console 可見每次呼叫 token 用量；用一支長逐字稿影片（如 jXtnhyro-QE，60k 字元）實測
  out/max 百分比，判斷 16k 是否仍貼近上限（貼近 → 回 PRD 開放問題討論調 `max_tokens`）

> **狀態**：未開始。

## 橫向注意事項（每階段隨手檢查）

- [ ] **規則只改一處**：任何檢查判準調整只動 `prose-check.mjs`，禁止在 gen-note / content-check 各自加料
- [ ] **本機工具、develop 即生效**：本版不動 workflow YAML，無 main-gated 驗收；
  `main` 由下次一鍵 release 自然追上
- [ ] **`ANTHROPIC_API_KEY` 僅本機**（沿用 v2/v3：不上雲、不進 repo）
- [ ] **失敗語意不變**：重試耗盡 = 「item 保持 `approved`、無 docId」，與現況 draft-failed 語意一致，
  重跑 `gen-note` 自然重試；`queue.json` schema 不動
- [ ] **成本上限**：單篇最壞 4 次呼叫（call1 ×2 + call2 ×2）；整批成本估 +20–40%（PRD §7）

## 開放問題（PRD-v4 §8，做之前確認；已給預設）

- [ ] retry 提示內容：預設附「失敗欄位 + 一句糾正指示」（可改純重打）
- [ ] call 1 成功、call 2 兩次失敗：預設**丟棄 en 草稿**（不暫存、重跑全部重做，保持原子性）
- [ ] Schema `minLength` 兜底:預設不加（程式端檢查已涵蓋）
- [ ] usage 警告閾值：預設 80%
- [ ] 失敗是否記進 `queue.json` 的 `note`：預設不記（console 已可見；常態化再議）

## 未來優化（非 MVP，PRD-v4 明列 out of scope，想到再收）

- **build 失敗解耦**（PRD §1 非目標）：`--pr` 流程 catch 住 `npm run build` 失敗，
  印「檔案已寫入、queue 已更新，修正後可手動 commit/PR」指引而非裸 stack trace。
  有了 Phase 1–3，內容問題理論上到不了 build，優先級低。
- **批次大小 `--limit N`**：25 篇一個 PR review 負擔重；一次 8–10 篇分批開 PR。
- **翻譯事實核對**：數字/單位誤譯（如 "two-fifty" → 250）仍靠 PR 人工複審；
  自動 verify pass 成本不成比例，除非誤譯常態化。
