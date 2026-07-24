# PRD v3 — 把「挑片 + 生草稿」流程搬上 GitHub（issue 控制面板）

> 把 [`OPERATIONS`](OPERATIONS.md) 的 **Step ②（挑片）** 與 **Step ③ 的觸發** 從「本機 CLI + 手」
> 搬到 GitHub：review issue 變成可操作的控制面板，負責人直接在上面批核，並讓每批 queue 對應到 PR。
> 延續 [`PRD-v2`](PRD-v2.md) 的核心原則：**不破壞成品的零後端、零依賴、單檔靜態站本質**；repo 即資料庫。

## 1. 背景與目標

### 現況（PRD-v2 落地後）

- `poll.yml`（cron）抓 RSS → 更新 `queue.json` → 推 **`main`** → 開/更新「📥 Video review queue」Issue。
- Step ②：本機 `node tools/review.mjs` 起 localhost，Approve/Reject 改寫 `queue.json`；挑片前可用本機 `triage-queue` skill 預篩。
- Step ③：本機 `gen-note.mjs --pr` 抓字幕 → Claude 產草稿 → 分類 → 開 PR。

### 痛點

- 挑片一定要**開電腦、起本機 UI**；人不在電腦前就動不了。
- `triage-queue` 的建議只活在本機對話裡，issue 上看不到，決策沒有留痕。
- `queue.json` 的「家」在 `main`，本機得做 `git checkout main -- queue.json` 跨分支撈檔，是多餘動作。
- 哪一批 queue 產出了哪個 PR，沒有集中紀錄。

### 目標

把**判斷面**留在 GitHub，讓負責人能「用手機也能批核、決策全程留痕」：

1. review issue 直接呈現 **triage 建議（⭐/🤔/⏭️ + 理由 + 建議分類）**。
2. 負責人（**且只有負責人**）在 issue 上勾選 approve / reject，CI 據此改 `queue.json`。
3. 批核完由本機生成草稿並開 PR，**把 PR 編號記回該 issue**，形成「這批 queue → PR#」的對照。
4. 順手把 `queue.json` 的家從 `main` 搬到 `develop`，`main` 收斂為純 release 分支。

### 非目標（Out of scope）— 已定案

- **生成（`gen-note`）不搬上 CI，維持本機。** 依 2026-07-24 的實測：GitHub Actions runner（Azure IP）
  向 YouTube 抓字幕會被回 `no-captions`（同一支影片本機 35,599 字、runner 0 字，4/4 全滅）。
  這是 YouTube 對資料中心 IP 的行為，非程式問題，故草稿生成保留在本機（也順便讓 `ANTHROPIC_API_KEY` 不必上雲）。
- 不改 `build.mjs` / `order.json` / `cat-*.md` 的格式與行為。
- 不做多人系統、不架後端、不引入資料庫。品質守門點（人複審 PR）保留。

## 2. 已定案決策

| 決策點 | 選擇 | 理由 |
|---|---|---|
| `queue.json` 的家 | **搬到 `develop`** | 消掉本機的 `git checkout main -- queue.json`；`main` 只被人工 release PR 更新，issue 自動化永不碰 production 分支。 |
| poll 推送目標 | **一起改推 `develop`** | 否則 poll 塞 pending 到 main、控制面板改 status 到 develop，`queue.json` 兩邊分岔。必須同源。 |
| 批核互動方式 | **Task-list checkbox** | 在 issue body 每片一列，勾 ✅/❌ 觸發 `issues.edited`。視覺直覺；靠隱藏 `vid` 錨點保證對應可靠。 |
| CI triage 後端 | **GPT-4o-mini（GitHub Models）** | 免費 tier、零雲端 key、零 Azure 帳單；title-only 評分綽綽有餘（後面還有 gen-note 讀逐字稿 + PR 複審兩道關卡）。 |
| 生成程度 | **維持本機 `gen-note --pr`** | CI 抓不到字幕（見非目標）。生成本來就是人的守門點，留本機最省事也最安全。 |
| 權限邊界 | **owner-only** | 控制面板 workflow 只認負責人的操作，其他人的編輯忽略。 |

## 3. 目標流程全貌

```
YouTube RSS ──poll.yml(cron，改推 develop)──▶ queue.json[pending] @develop
                                                    │
                                    tools/triage.mjs（GPT-4o-mini / GitHub Models）
                                                    ▼
        📥 Review Issue：每片一列 + ☐approve / ☐reject（含隱藏 <!-- vid:xxx --> 錨點 + triage 理由）
                                                    │
                    你(owner) 在 issue 打勾 ──issues.edited──▶ queue-control.yml
                                                    │   （owner-only；改 status，reject 沿用 triage 理由為 note）
                                                    ▼
                              queue.json[approved/rejected] commit → develop
                                                    │
                本機：git switch develop && git pull → ANTHROPIC_API_KEY=... gen-note --pr
                                                    ▼
              gen-note/doc-X-Y → develop PR；gen-note 收尾 gh issue comment 記「這批 <ids> → PR #NN」
                                                    │
                                    你複審內容 PR（分類/翻譯/忠實度）→ merge 進 develop
                                                    ▼
                          release PR：develop → main ──▶ Vercel 自動上線
```

`main` 全程只被最後那個人工 release PR 更新。

## 4. 資料模型影響

**`queue.json` schema 不變**（欄位沿用 PRD-v2：`videoId` / `title` / `channel` / `published` / `thumb` / `url` /
`status` / `docId` / `note`）。這次只改「它住在哪個分支」與「誰來改它」：

- triage 的評分**不寫進 `queue.json`**，只渲染進 issue body（純展示，避免污染資料檔）。
- 勾選 apply 時：`⭐/✅ → status: "approved"`；`⏭️/❌ → status: "rejected"` 且把該片 triage 的一句理由寫進 `note`。
- 沿用 PRD-v2 安全規則：只動當前 `pending` 的項目；不覆寫人手寫過的 `note`；寫完 `JSON.parse` 驗證。

> 仍是 single source of truth：任何 stage 只讀寫 `queue.json` + `src/`，差別只是家從 `main` 換成 `develop`。

## 5. 元件設計

| 元件 | 型態 | 職責 | 依賴 |
|---|---|---|---|
| `poll.yml`（改） | GH Action | cron 仍需掛在 default branch(main) 才會定時觸發；job 內 checkout `develop`、poll、commit、push **回 develop**；呼叫 triage 產 issue body | GitHub Actions |
| `tools/triage.mjs`（新） | Node script | 讀 pending → 呼叫 GitHub Models(GPT-4o-mini) 評 ⭐/🤔/⏭️ + 建議分類 A–I + 一句理由 → 產出**含 checkbox 與 `vid` 錨點**的 issue body markdown | GitHub Models（`GITHUB_TOKEN`, `models: read`） |
| `queue-control.yml`（新） | GH Action | `on: issues.edited`（限 video-queue issue、owner-only）→ 解析 body checkbox → 改 `queue.json` status → commit/push develop → 重繪 body 鎖定已處理列 | GitHub Actions |
| `tools/queue-apply.mjs`（新） | Node script | 被 `queue-control.yml` 呼叫：吃 body → 產 id→action map → 套用到 `queue.json`（含安全規則與驗證） | 無 |
| `tools/gen-note.mjs`（微調） | Node script | 現有流程不變；**收尾多一步**：`gh issue comment` 把「這批 videoId/docId → PR #NN」記回 review issue | Anthropic API key、字幕來源、`gh` |
| `tools/review.mjs`（保留） | 本機 web 工具 | 保留為 fallback／離線批核；與 issue 控制面板並存 | 無 |
| `tools/queue-report.mjs`（併入 triage 或保留） | Node script | body 產生器；triage 上線後由 `triage.mjs` 接手渲染，或退化為無 triage 時的純清單 | 無 |

## 6. 分階段實作計畫

四個階段有依賴順序：**Phase 1 是地基**；Phase 2 產出控制面（issue body 格式）、Phase 3 消費它，兩者共用同一份
**body 契約**（每列一個 `<!-- vid:VIDEOID -->` 錨點 + `- [ ] ✅ approve` / `- [ ] ❌ reject` 兩個 checkbox）。

### Phase 1 — queue.json 家搬到 develop（0.5 天）★ 先做，其他階段的地基

**目標**：`queue.json` 唯一寫入分支改成 `develop`，`main` 收斂為純 release 分支。

- 改 `poll.yml`：job 內 `actions/checkout` 指定 `ref: develop`；poll 後 commit、`push` 回 develop（保留 `[skip ci]`）。
  Issue 開/更新邏輯不變。
- 改 `OPERATIONS.md` / `OPERATIONS.zh-TW.md`：Step ② 拿掉 `git checkout main -- queue.json`，改為 `git switch develop && git pull`；
  把「queue 的家 = develop、main = 純 release」寫清楚。
- **驗收**：
  - 手動 `workflow_dispatch` 跑 poll，新 pending 落在 develop 的 `queue.json`，main 不被動到。
  - 本機在 develop `git pull` 就拿到最新 queue，不需跨分支 checkout。
  - `develop → main` release PR 合併後，main 的 `queue.json` 追上。

### Phase 2 — CI triage 寫進 issue（1 天）

**目標**：review issue 自動呈現 triage 建議，並帶上 Phase 3 要用的 checkbox 與 `vid` 錨點。

- `tools/triage.mjs`：讀 `queue.json` 的 pending → 呼叫 GitHub Models（`gpt-4o-mini`，`Authorization: Bearer $GITHUB_TOKEN`）
  → 每片產出 tier（⭐/🤔/⏭️）+ 建議分類 A–I + 一句貼題理由 → 渲染 issue body。移植 `triage-queue` skill 的判準
  （見 [`.claude/skills/triage-queue/SKILL.md`](.claude/skills/triage-queue/SKILL.md) 的分類表與 tier 定義）到 prompt。
- body 格式（**Phase 3 的契約**），每片一列，例如：

  ```markdown
  ### ⭐ [Snowflake’s Bala…](https://youtu.be/Q3lomQPPcXg) · Snowflake · 2026-07-20
  <!-- vid:Q3lomQPPcXg -->
  建議分類 **A**｜理由：semantic layer 上的 BI 查詢實戰，切題。
  - [ ] ✅ approve
  - [ ] ❌ reject
  ```
- `poll.yml` 在有新 pending 時呼叫 `triage.mjs` 產 body（取代／包住現有 `queue-report.mjs`）；workflow 加 `permissions: models: read`。
- **降級**：GitHub Models 呼叫失敗（rate limit/暫時不可用）時，退回純 pending 清單 body（仍附 checkbox 與錨點），不擋流程。
- **驗收**：
  - 有新片時 issue body 每片有 tier/分類/理由 + 兩個 checkbox + 隱藏 `vid` 錨點。
  - triage 失敗時 issue 仍正常更新（純清單）。
  - 用量落在免費 tier，無帳單。

### Phase 3 — issue checkbox 批核控制面板（1.5 天）

**目標**：負責人在 issue 打勾即改 `queue.json`，owner-only、可靠、冪等。

- `queue-control.yml`：`on: issues.edited`；`if:` 同時滿足（a）該 issue 有 `video-queue` label、（b）
  `github.event.sender.login == '<owner>'`（或 `author_association == 'OWNER'`）。非負責人的編輯直接忽略。
- `tools/queue-apply.mjs`：解析 body → 依 `vid` 錨點與其下 checkbox 勾選狀態，組 id→action map
  （✅ 勾 → approved；❌ 勾 → rejected + 把該列 triage 理由寫進 `note`；兩者皆未勾 → 維持 pending）→
  只動當前 `pending` 項目、驗證 JSON → commit push develop。
- **冪等 / 防重複**：套用後重繪 body，把已處理列標為「✔ 已 approved／❌ 已 rejected」並移除其 checkbox；
  只對「勾選狀態 ≠ 已提交 status」的列動作，避免任何 body 編輯（改錯字）誤觸。加 `concurrency` group 串行化多次快速編輯。
- `permissions: contents: write`（推 develop）、`issues: write`（重繪 body）。
- **驗收**：
  - 勾 ✅ 某片 → develop 的 `queue.json` 該片變 approved；勾 ❌ → rejected 且 `note` 帶理由。
  - 非負責人編輯 body → 無任何變更。
  - 重複編輯／改錯字不會重跑已處理項目。

### Phase 4 — 批核後記錄 PR#（0.5 天）

**目標**：每批 queue 與其產出的 PR 在 issue 上有對照。

- `gen-note.mjs` 收尾：`gh pr create` 成功後，找出 open 的 `video-queue` issue，`gh issue comment` 寫
  「🧾 這批 → PR #NN：<PR 連結>；videoId / docId 清單」。
- （選配）之後可把對照維護進 issue body 的一張「已處理」表；先用留言累積即可。
- **驗收**：本機跑 `gen-note --pr` 後，review issue 出現一則含 PR# 與該批 ids 的留言。

## 7. 風險與注意事項

- **checkbox → 動作的可靠性**：靠隱藏 `<!-- vid:xxx -->` 錨點對應，不靠標題（標題會變、會撞）；套用後重繪鎖定已處理列，防重複。
- **`issues.edited` 誤觸**：任何 body 編輯都會觸發；用「勾選狀態 ≠ 已提交 status」的差異判斷 + owner-only guard + concurrency 串行化。
- **reject 理由**：checkbox 帶不了自由文字 → 預設沿用 triage 那句理由當 `note`；要自訂就改 `note` 行或本機 review.mjs 補。
- **poll 必須同步改推 develop**：否則 `queue.json` 在 main/develop 分岔（Phase 1 一起處理，不可只做一半）。
- **排程 workflow 掛在 default branch**：`poll.yml`（含 triage 呼叫）要合進 `main` 才會定時觸發；改動當下不會立即生效。
- **GitHub Models 免費 tier 限制**：rate limit／暫時不可用時走降級（純清單），不擋批核。
- **字幕在 CI 抓不到**：已定案，生成留本機（見非目標的實測數據）。

## 8. 開放問題（我先給了預設，你可否決）

1. **owner 判定**：用 `sender.login == 'yeha98555'` 硬判（明確）還是 `author_association == 'OWNER'`（較通用）？預設前者。
2. **reject 理由來源**：預設「沿用 triage 理由當 note」。可改成「reject 一律留空 note」或「要理由就本機補」。
3. **triage 觸發時機**：預設「併進 poll，有新 pending 才跑」。是否也要一個手動 `workflow_dispatch` 重跑 triage？預設要。
4. **PR# 記錄實作位置**：預設由本機 `gen-note` 直接 `gh issue comment`（最少元件）。是否偏好改用 `on: pull_request` 的 workflow？預設本機。
5. **保留 `review.mjs`**：預設保留為 fallback／離線批核，與 issue 控制面板並存。是否要直接淘汰？預設保留。

## 9. 建議起步

**先做 Phase 1**（queue 家搬 develop）——它是其他三階段的地基、風險最低、且立刻消掉本機那個跨分支 checkout 的痛點。
確認 Phase 1 在 Actions 上跑順、`main` 不再被 poll 動到後，再依序接 Phase 2 → 3（共用 body 契約，建議連著做）→ 4。
