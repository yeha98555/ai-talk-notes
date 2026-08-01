---
heading: 上下文 / 記憶 / RAG
desc: 上下文工程、記憶系統、混合檢索、Agentic RAG：決定 Agent 能否取得「正確」上下文的關鍵。
---
## AI on Your Lakehouse:情境以「形狀」呈現,而非查詢——Zach Blumenfeld, Neo4j
@ Zach Blumenfeld, Neo4j
Neo4j 的工作坊展示如何用圖形化的「形狀」——metadata 語意層、確定性文件大綱、以及基於 Leiden 演算法的主題分群——讓程式碼代理人在 lakehouse 資料上獲得可靠的導覽能力與全域性情境,這是單靠 text-to-SQL 與向量搜尋無法達成的。







## 用 ClickHouse 打造 Agentic RAG 系統
@ ClickHouse
示範只用一行 Docker Compose 指令，就能啟動完整的 Agentic RAG 堆疊——ClickHouse + LibreChat + MCP + LangFuse——讓 Agent 透過 MCP 以自然語言查詢 ClickHouse，並輸出互動式圖表產物。展示 skills、子 Agent、RBAC，以及在 LangFuse 中運用 LLM-as-a-judge 對追蹤紀錄進行抽樣評測。








## 繞過多模態稅：混合 RAG、SQL RRF 與 UI 遙測
@ Abed Matini, Ogilvy
示範以本地優先、少框架、大量倚重 SQL 的方式，打造一套可上線的企業 RAG FAQ 聊天機器人：用 Docling 把文件轉為乾淨的 Markdown，分塊採用刻意設計的策略，並以 Postgres 加上 pgvector 做結合向量、BM25 與 RRF 的混合檢索，最後交由小型本地模型回答。強調以純 Python 函式取代 Agent 以降低延遲、在觸及 LLM 前先執行護欄檢查，並用 Langfuse 加上前端 widget 做可觀測性。








## 引用不可少:為 LLM 建構的知識圖譜設計來源追溯機制
@ Daniel Chalef, Zep AI
Zep／Graffiti 的 Daniel Chalef 說明為何 LLM 綜合出的事實會失去追溯線索，並展示如何將來源鏈結建模為圖譜中「來源 episode」與「衍生事實」之間的關係，藉此支援可信度篩選、安全的實體合併、事實失效標記，以及合規的資料刪除。






## 上下文工程 2.0：統一 MCP、Agentic RAG 與記憶
@ Redis
主張讓 Agent 真正好用的關鍵是「上下文引擎」，而非模型本身，將 RAG 從線性的預先查詢升級為 Agent 能自主導覽的工具（Agentic RAG），同時強調上下文必須低延遲且新鮮，而記憶本質上就是狀態。此架構由新鮮資料的 ETL、用 Pydantic 加上 MCP 自動建構語意層的 Context Retriever、短期與長期記憶擷取，以及語意快取組成，並以一個查詢結構化資料（而非政策 PDF）的 Agent 做示範。








## 前沿的上下文工程
@ Linus Lee, Thrive Capital
打造研究型 Agent「Puck」與行動型 Agent「Hobgoblin」，核心理念是「把複雜度推向資料結構與索引階段，而非查詢當下的提示」。技巧包括結合 BM25、向量與神經網路重新排序器的混合搜尋；在索引階段預先豐富化「權威實體卡」；用 SQL 子 Agent 與平行子 Agent 避免污染主要上下文；以及提供逐字、可驗證引用的自訂工具。








## Coding Agent 的 Context Engineering
@ Fausto, JADS Applied AI Lab
主張工程師唯一真正能掌控的槓桿，是進入 context window 的內容——Claude Code session 別用超過約 25% 的 context 預算——並巡覽各種注入面：CLAUDE.md 與路徑範圍的 rules、hooks、sub-agents、skills 與 deferred tools。核心是一套仿大腦的記憶系統——純 markdown wiki 加索引、類 Ebbinghaus 遺忘曲線的衰減分數，再以 tmux observer sessions 監看主聊天、雙向推送知識——在五分鐘期限的對照 demo 中擊敗完全相同但沒有 wiki 的環境。


## 影片智慧的上下文工程：超越模型規模，邁向真實影響力
@ TwelveLabs
主張讓影片 AI 真正好用的關鍵不在模型規模，而在於把影片轉變成一條「上下文管線」，提出四大支柱——Write → Select → Compress → Isolate（結構化證據、多模態語意檢索、滾動式摘要，以及依類型／時間隔離）——並主張上下文應被視為可量測、可版本控管的工程產物。








## CrabRAG：自動化助理需要的是圖記憶，而非更多 token
@ Stephen Chin, Neo4j
Neo4j 的 Stephen Chin 主張，無論是 markdown 檔案、技能式，甚至是 MCP 或向量資料庫支援的 agent 記憶，在規模擴大後都會失靈；他透過家庭實驗室數位分身示範，展示結合向量種子節點與圖遍歷（透過 Cognee／Neo4j）如何讓 agent 獲得單靠相似度搜尋做不到的準確、可解釋、多跳記憶能力。



## 為 AI Agent 設計記憶系統
@ MongoDB
完整走過為 Agent 設計記憶系統的過程，區分三種記憶類型：短期記憶（工作階段對話，使用 session_id 加上 TTL）、語意長期記憶（使用者事實與偏好），以及程序性長期記憶（step-by-step 指南，使用 embedding 加上向量搜尋）。重點在於「記憶生命週期」——該儲存什麼、何時儲存、何時修剪——並以一套記憶 API、工具執行與 Agent 迴圈做示範。








## 從記錄系統到情境系統
@ Omri Bruchim 與 Tomer Ast，monday.com
monday.com 的 Omri Bruchim 與 Tomer Ast 主張，AI 助理失敗的原因不是缺乏資料，而是缺乏理解，並介紹了 Monday 世界模型——一個雙引擎架構（慢速建構檔案、快速追蹤即時訊號），呼應互補學習系統與 lambda 架構的概念，提前預先建構相互連結的情境，讓其代理人 Sidekick 真正能回答「我現在該專注什麼？」。




## 解析 Hermes 架構：記憶、上下文與閘道
@ Hermes project
拆解常駐型 Agent「Hermes」的架構：每一輪都重建上下文的 Agent 迴圈（soul.md／user.md／memory.md 加上歷史摘要與工具描述）、以字元數估算 token 的上下文壓縮機制、具備工作階段管理的多平台閘道（Telegram／Slack／Email），以及搭配 cron 排程的三層記憶（markdown 加上 SQLite 加上外部記憶）。








## 邊睡邊學：超越記憶、邁向做夢
@ Lamis Mukta, Anthropic
梳理從「記憶系統」到「做夢（dreaming）」的演進，主張讓 Agent 持久又能規模化的關鍵是上下文工程，而非更聰明的模型。回顧一年來記憶的演進（Claude MD → Agent 自主的記憶工具 → 具 progressive disclosure 的 Skills → 把記憶當成檔案系統），以及隨之而來的生產級護欄：版本管理、以 hashing 做併發控制、權限管理，以及透過乾淨 API 達成的可攜性。接著介紹「做夢」——一個 out-of-band 的批次程序，由 orchestrator 與子 Agent 從大量 session transcript 中挖掘反覆出現的失敗模式，對記憶庫提出一份可審核的新增、修改與刪除清單，就像老師在觀察完一整屆學生後修訂課綱。Memory（in-band）是讓下一次執行更強的短迴圈；dreaming（out-of-band）則是保持記憶新鮮的長迴圈，雖然多花 token，卻能讓 Agent 在後續任務一次到位，從而降低整體成本與延遲。








## 用 turbopuffer 教 Claude Code 做語意程式碼搜尋
@ turbopuffer
示範運用 turbopuffer（向量加上全文檢索）為 Claude Code 加上語意程式碼搜尋（把 embedding 視為可快取的運算），並以 ContextBench 量化成效。發現語意搜尋能提升精確率、減少不必要的檔案讀取（從約 65% 提升到接近 90%），但它是 grep 的互補，而非取代——真正的難題在於教會 Agent 何時該選用哪種工具。








## RAG 已死，對吧？？
@ Kuba Rogut, Turbopuffer
主張「RAG 沒有死——死的是把 RAG 窄化為『向量搜尋加上塞爆上下文』的定義」。真正的檢索是一整套工具箱——向量、全文檢索（BM25）、grep、篩選條件——由 Agent 反覆呼叫，直到蒐集到足夠的上下文為止。以 Cursor（預先索引 embedding）對比 Claude Code（每次都用 grep 重新掃描），說明索引成本的取捨，並強調應採分階段檢索，先縮小範圍找到「正確的那百萬個 token」。








## 把所有資料放進知識圖譜，但別把它當 RAG 用
@ 講者，AI Native Dev
與其做相似度搜尋式的 RAG，不如把資料放進具索引的知識圖譜，讓 agent 像瀏覽 wiki 一樣直接走訪實體之間的關係，藉此在更大規模下取得更快、更一致的結果。


## 把 10,994 則筆記化為記憶
@ Paul Iusztin 與 Louis-François Bouchard
示範一套「AI Research OS」：把數萬則第二大腦筆記轉變成 AI 可用的研究記憶，刻意採用檔案加上索引（raw/、index.yaml、wiki/）而非向量資料庫或巨大的上下文視窗。查詢遵循分層、節省 token 的策略（先讀索引 → 來源摘要 → 概念 → 原始資料），原始筆記為唯讀，而 wiki 則是隨每個問題被回答而不斷成長的「活記憶」。整體設計哲學偏好本地 markdown／YAML 檔案，以利除錯。








## 影片沒有記憶——我們如何為它打造一個
@ James Le, TwelveLabs
TwelveLabs 的 James Le 主張影片 AI 需要真正的記憶層——而不只是影格取樣或文字式 RAG——並以由時刻、實體、出現紀錄與關係構成的脈絡圖為基礎，透過體育、安防與廣告等案例展示其應用。





## 當所有上下文都重要：擴充快取增強生成
@ Luis Romero-Sevilla, Orbis
針對「所有文件都相關，且經常大批次更新」的情境，提出擴充快取增強生成（Extended Cache Augmented Generation，ECAG）：不是把所有內容塞進單一巨大上下文，而是同時啟動多個 CAG「桶」（多組 KV 快取），由一個監督模型決定該查詢哪些桶、以及如何綜合出答案。關鍵設計是把文件隨機打散分配到各桶中，而非依主題分組，以免遺漏藏有關鍵線索的領域；由於載入是平行進行，速度比 GraphRAG 更快，品質也優於一般 RAG。
