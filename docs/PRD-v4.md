# PRD v4 — gen-note 草稿品質守門前移（產生即驗證 + 拆分翻譯呼叫）

> 把 `prebuild` 的 content-check 檢查**前移到 `gen-note.mjs` 產生當下**：每篇草稿寫檔前就地驗證、
> 失敗自動重試（**每次呼叫最多一次 retry**），並把「英文草稿」與「中文翻譯」**拆成兩次 Messages API 呼叫**，
> 讓各自擁有完整的 `max_tokens` 預算。延續 [`PRD-v2`](PRD-v2.md)／[`PRD-v3`](PRD-v3.md) 原則：
> **零依賴、repo 即資料庫、人複審 PR 仍是最終品質守門**。

## 1. 背景與目標

### 現況（PRD-v3 落地後）

- Step ③：本機 `gen-note.mjs --pr` 對每支 approved 影片**一次呼叫**產出 9 個欄位
  （en title/speaker/category/body/card_summary + zh 四欄），寫檔 → 插卡 → bump 計數 → build → 開 PR。
- 呼叫防線只有兩道：`stop_reason === "refusal"` 與 `stop_reason === "max_tokens"`。
- 內容品質防線在 `prebuild` 的 `content-check.mjs`（截斷句、placeholder stub、空內容），**build 時才觸發**。

### 痛點（2026-08-01 doc-134–158 批次實測）

25 篇中 **5 篇（20%）** 內容不完整：模型在額度內回傳了**結構合法、內容截斷**的 JSON——
接近預算上限時模型急著收尾字串、補齊引號括號，甚至直接填 `"placeholder"` 交差
（doc-138/139/145/152 英文結尾斷句、doc-147 幾乎全空）。`JSON.parse` 過關、`stop_reason` 正常，
所以 gen-note 照常寫檔、queue 照常標 `published`，直到 `--pr` 流程跑 `npm run build`
才被 content-check 擋下——此時 25 篇已全部落盤，**單篇失敗污染整批**，只能手工從逐字稿修補（見 PR #16）。

根因有二：

1. **驗證時機太晚**：內容檢查只存在於 build 階段，產生當下沒有守門，也沒有重試機會。
2. **單次呼叫預算太擠**：一次要產英文全文 + 中文全文 + 兩份摘要 + 分類，且 adaptive thinking
   也計入 `max_tokens: 16000`；長逐字稿（doc-138 約 60k 字元）時預算見底，截斷集中發生。

### 目標

1. **產生即驗證**：草稿欄位在寫檔前通過與 content-check **同一份**檢查邏輯；不合格自動重試
   （**每次 API 呼叫最多一次 retry**，控制預算上限）。
2. **單篇失敗隔離**：重試後仍失敗的影片保留 `approved` 待下次重跑，**不寫任何檔案、不中斷批次**；
   其餘成功篇照常 build + 開 PR。
3. **拆分呼叫**：call 1 產英文草稿 + 分類、call 2 只做中文翻譯，各自擁有完整 `max_tokens`，
   從源頭降低截斷機率；翻譯輸入改為定稿的英文 note（不重送逐字稿），成本增幅有限。
4. 檢查邏輯**單一事實來源**：gen-note 產生時擋的，和 content-check build 時擋的，永遠是同一套規則。

### 非目標（Out of scope）

- 不改 `content-check.mjs` 的檢查**規則**（只把實作抽成共用 module，行為不變）。
- 不動 `--pr` 的 build 失敗處理（有了目標 1–2，內容問題理論上到不了 build；build 失敗解耦另案處理）。
- 不加 JSON Schema `minLength` 兜底（本次以程式端檢查涵蓋；見開放問題 3）。
- 不改 `queue.json` schema、不改 build/order/cat 格式、不動 PRD-v3 的 issue 控制面板流程。
- 不做翻譯事實核對（如 doc-139 "two-fifty" 誤譯 250 美元這類數字錯誤仍靠 PR 人工複審）。

## 2. 已定案決策

| 決策點 | 選擇 | 理由 |
|---|---|---|
| 檢查邏輯歸屬 | **抽成 `tools/prose-check.mjs` 共用 module** | gen-note 與 content-check import 同一份；規則改一處、兩端同步，不會出現「生成時放行、build 時擋下」的分裂。 |
| retry 上限 | **每次 API 呼叫最多 1 次**（單篇最壞 4 次呼叫） | 使用者定案：避免預算爆掉。截斷多為抽樣波動，一次重試已能吃掉大多數失敗；連兩次失敗多半是任務本身問題，交還人工。 |
| retry 策略 | **重試時附上失敗欄位提示** | 第二次呼叫在 user message 尾端附「上次哪些欄位截斷/為 stub」的一句話，比純重打命中率高，成本近乎零。 |
| 呼叫拆分 | **call 1＝en 草稿＋分類；call 2＝zh 翻譯** | 各有完整 16k 預算（等效翻倍）；翻譯輸入為英文 note 而非逐字稿，input token 大減、風格也更受控。 |
| call 2 輸入 | **定稿英文 note + zh 風格範例（doc-100 zh 鏡像）** | 不重送逐字稿：便宜、且英文 note 已把口語正規化，降低口語誤聽誤譯進 zh 的機率。 |
| 失敗處理 | **任一 call 重試後仍失敗 → 該篇原子放棄** | 不寫 en-only 半成品（雙語鏡像是 build 硬約束）；item 保持 `approved`、console 記 ✗，批次繼續。 |
| 用量可觀測 | **每次呼叫 log `usage`，輸出逾 `max_tokens` 80% 印警告** | 截斷的前兆是「貼著預算上限」；量化後才知道 16k 夠不夠、何時該調。 |

## 3. 目標流程全貌

```
每支 approved 影片：
  fetchTranscript ──無字幕──▶ needs-transcript（不變）
        │
        ▼
  call 1（en：title/speaker/category/body/card_summary）
        │  prose-check：截斷句？stub？空欄位？
        ├─ 不合格 ──▶ retry ×1（附失敗欄位提示）──仍不合格──▶ ✗ 該篇放棄，item 保持 approved，下一支
        ▼ 合格
  call 2（zh：zh_title/zh_speaker/zh_body/zh_card_summary；輸入＝定稿 en note）
        │  prose-check（同一套規則）
        ├─ 不合格 ──▶ retry ×1 ──仍不合格──▶ ✗ 該篇放棄（en 草稿一併丟棄），下一支
        ▼ 合格
  寫 doc-N.md + zh 鏡像 → 插卡 → order.json → queue 標 published（不變）
        │
        ▼（批次結束，addedDocs > 0）
  bump 計數 → npm run build（content-check 此時應為 0 FAIL）→ 開 PR → issue 留言（不變）
```

單篇最壞情況 4 次呼叫（call 1 ×2 + call 2 ×2）；call 1 失敗則 call 2 不發生（最壞 2 次）。

## 4. 資料模型影響

**無。** `queue.json` schema 不變；重試後仍失敗的影片就是「維持 `approved`、無 `docId`」——
與現況「draft failed 保留重試」語意一致，下次 `gen-note` 重跑自然重抓。
失敗原因只進 console 輸出，不寫入 `note`（見開放問題 5）。

## 5. 元件設計

| 元件 | 型態 | 職責 | 依賴 |
|---|---|---|---|
| `tools/prose-check.mjs`（新） | Node module | 從 content-check 抽出的純函式庫：`isStub()`、`stripCites()`、`endsMidSentence()`，外加 `checkDraftFields(fields) → problems[]`（對草稿物件的欄位級檢查，供 gen-note 用） | 無 |
| `tools/content-check.mjs`（改） | Node script | import 上述純函式取代自身內聯實作；掃描邏輯、輸出格式、exit code **完全不變** | `prose-check.mjs` |
| `tools/gen-note.mjs`（改） | Node script | ① `DRAFT_SCHEMA` 拆成 `EN_SCHEMA`／`ZH_SCHEMA`；② `callClaude` 加 usage log + 80% 警告；③ 每次呼叫後跑 `checkDraftFields`，不合格重試一次（附失敗欄位提示）；④ 兩段任一最終失敗 → 該篇原子放棄、批次續行 | `prose-check.mjs`、Anthropic API |

`--dry-run` 行為不變：stub 草稿本身必須通過 `checkDraftFields`（stub 文案以完整句號收尾，現況已合格），
使 dry-run 同時煙霧測試檢查管線。

## 6. 分階段實作計畫

### Phase 1 — 抽出 `prose-check.mjs`，content-check 改用（0.5 天）★ 地基

- 新增 `tools/prose-check.mjs`：搬移 `isStub` / `stripCites` / `TERMINAL` 正則 / `checkProse` 核心，
  並新增 `checkDraftFields({title, speaker, body, card_summary, …}) → problems[]`
  （語意：標題/講者欄不得為 stub 或空；body/summary 不得為 stub、空、或斷句結尾——與 content-check 對
  note/卡片的判準一一對應）。
- `content-check.mjs` 改 import，刪除內聯副本。
- **驗收**：
  - 對當前 repo 跑 `node tools/content-check.mjs`，輸出與改動前逐字元一致（掃描數、OK 行）。
  - 手動構造截斷/stub/空欄位的草稿物件，`checkDraftFields` 逐一命中。

### Phase 2 — gen-note 拆成兩段呼叫（1 天）

- `EN_SCHEMA`（title/speaker/category/body/card_summary）＋ `ZH_SCHEMA`（zh_ 四欄），各自 `additionalProperties: false`。
- `buildEnPrompt(item, transcript)`：沿用現有 system（house-style 範例 + 規則）但僅要求英文欄位與分類。
- `buildZhPrompt(enNote)`：輸入定稿英文 note（frontmatter + body + card_summary）＋ zh 風格範例
  （`src/i18n/zh/notes/doc-100.md`）＋ 翻譯規則（台灣繁中、專有名詞保留原文）；**不送逐字稿**。
- zh 欄位不得推翻 call 1 的 category（schema 中根本不含 category，結構上杜絕）。
- **驗收**：
  - `--dry-run` 全流程不變（stub 改為兩段各自產出）。
  - 挑一支已 published 影片以 `gen-note <videoId>` 重跑（暫時清 docId）——產出檔案結構與現行完全一致；
    zh 風格與既有 note 無明顯落差。

### Phase 3 — 呼叫後驗證 + 單次重試 + usage 觀測（0.5 天）

- `callClaude` 回傳附帶 `usage`；每次呼叫 console 印
  `tokens: in=… out=…（out/max=…%）`，超過 80% 加 `⚠ near max_tokens`。
- 呼叫包裝為 `callWithRetry(prompt, schema, label)`：
  1. 呼叫 → `checkDraftFields`；合格即回傳。
  2. 不合格 → 印出 problems → **重試一次**，user message 尾端附
     「Previous attempt failed checks: <problems>. Ensure every field is complete prose ending with terminal punctuation; never output the word "placeholder".」
  3. 仍不合格 → throw；外層 catch 沿用現有「✗ draft failed — left approved for retry」路徑，**批次續行**。
- **驗收**：
  - 故障注入（暫時把檢查閾值調嚴或 mock 一次壞回應）：觀察到「第一次失敗 → 重試 → 成功寫檔」與
    「兩次失敗 → 該篇跳過、item 仍 approved、後續影片照常處理、PR 只含成功篇」兩條路徑。
  - 正常批次跑完 `npm run build`，content-check 0 FAIL。
  - console 可見每次呼叫的 token 用量。

## 7. 風險與注意事項

- **重試也失敗的殘留風險**：單次重試不保證收斂；但 item 保持 `approved`，重跑 `gen-note` 即自然重試，
  且 content-check 仍在 build 端兜底——防線變兩層，不是換層。
- **翻譯不見逐字稿**：call 2 只看英文 note，若 call 1 就理解錯，zh 只會忠實複製錯誤——
  但這與現況相同（現況 zh 也是同一次呼叫的產物），且英文 note 已正規化口語，
  反而降低「two-fifty → 250」這類口語誤譯直入 zh 的機率。事實正確性仍歸 PR 複審。
- **斷句檢查誤殺**：`TERMINAL` 正則與 content-check 同源，誤殺概率與現況相同；差別只是誤殺成本
  從「手工修檔」變成「多燒一次重試呼叫」，可接受。
- **成本**：每篇從 1 次呼叫變 2 次，但 call 2 不含逐字稿（input 約為 call 1 的 1/5–1/10）；
  重試上限 1 次使最壞情況封頂在 4 次呼叫。整體 token 成本估計 +20–40%，換 20% 失敗率歸零，划算。
- **latency**：每篇多一次 round-trip；批次為離線操作，無感。
- **順序耦合**：Phase 2、3 都依賴 Phase 1 的 module；2 與 3 可同一個 PR 交付（同檔改動，分開反而衝突）。

## 8. 開放問題（我先給了預設，你可否決）

1. **retry 提示內容**：預設附「失敗欄位 + 一句糾正指示」。可改純重打（省 prompt 又更簡單，命中率略降）。
2. **call 1 成功、call 2 兩次失敗時的 en 草稿**：預設**丟棄**（重跑全部重做，保持原子性與簡單）。
   可改暫存 scratchpad 供重跑復用，省一次 call 1——需要多管一份中間態，先不做。
3. **Schema `minLength` 兜底**：預設不加（程式端檢查已涵蓋空欄位與 stub）。若之後發現 API 端擋掉更省，再補。
4. **usage 警告閾值**：預設 80%。
5. **失敗是否記進 `queue.json` 的 `note`**：預設不記（保持 schema 語意乾淨，console 已可見）。
   若常態化出現「連續重跑都失敗」的影片，再考慮記 `note: "draft-failed×N"` 供 triage。

## 9. 建議起步

**先做 Phase 1**（抽 module）——零行為變更、可獨立驗收，且是 2、3 的地基。
Phase 2 + 3 建議**同一個 PR** 交付（都動 `gen-note.mjs`），完成後用一支長逐字稿影片
（如 doc-138 的 jXtnhyro-QE）實測重跑，觀察 usage 百分比是否仍貼近上限，再決定要不要調 `max_tokens`。
