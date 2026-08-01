---
heading: 模型訓練與推論
desc: 訓練、RL／RLVR、MoE、量化、推論基礎設施——多屬底層技術，與產品層的關聯較為間接。
---
## 大規模智能體時代：深入 MiniMax 模型與背後的基礎設施
@ Olive Song, MiniMax 與 Dan, Together AI
MiniMax 研究負責人 Olive Song 與 Together AI 的 Dan 對談，剖析 MiniMax M3 從多模態後訓練、稀疏注意力到百萬 token KV cache 服務的完整鏈路，並展望開源模型追上前沿實驗室的三年願景。



## AI：好到不像真的，卻又差到不管用
@ Diogo（前 OpenAI）, TypeSafe AI
主張今日的 LLM 是以 RLHF 最佳化成「取悅人類的助理」，而非「值得信賴的自主執行者」——這正是為何它們在有人類盯著時表現驚艷，卻不夠可靠到能無人監督地運行，也正是「看似強大卻未能帶來經濟革命」背後的落差。認為助理行為與自主性是彼此衝突的最佳化目標，出路在於邁向型別安全（type-safe）的語言模型，把模型與型別系統、結構化資料深度整合。











## AsyncOPD：on-policy distillation 能有多「過時」？
@ Hugging Face Journal Club, Hugging Face
一場 Hugging Face Journal Club 的論文討論，主題是非同步的 on-policy distillation（AsyncOPD）：把 on-policy distillation 的迴圈改為非同步，能將樣本生成與最佳化器解耦以提升吞吐量，但訓練所用的樣本會來自略微過時（stale）的策略——這篇論文探討的正是該方法能容忍多少 staleness，才不會讓這種落差抵銷掉加速帶來的效益。









## 超越 API：為現代工作負載打造的現代推論
@ 座談：NVIDIA、Together AI、Modal
核心訊息是微調並沒有死——它正以 RL／「模型塑形（model shaping）」的形式回歸，而把智慧壓縮進更小、更專精的模型，能同時改善體驗與延遲，模型路由則是應用開發者的護城河。同時指出 token 用量每年大約成長 10 倍，供給在未來數年內都追不上需求，因此節省 token 是應用開發者與供應商共同的責任；長期而言，推論最終會從純雲端擴散到本地與邊緣。











## 為 LLM 後訓練打造資料與環境策展
@ Mahesh Sathiamoorthy, Bespoke Labs
Bespoke Labs 的 Mahesh Sathiamoorthy 說明策展優質資料與 RL 環境（而非單純追求更大模型）如何驅動後訓練成效，涵蓋 Open Thoughts 的推理資料配方、Open Thoughts Agents 的軌跡策展，以及 Credit Karma 一個真實的企業合規微調案例。

## 資料品質是運算力的乘數
@ Ari Morcos, DatologyAI
DatologyAI 的 Ari Morcos 主張，在運算日益稀缺的時代，透過清理、篩選、合成改寫與組合等資料策劃手段可作為運算力乘數，讓模型在 VLM、多語言 LLM 以及領域特定的中期／後訓練流程中，以遠少於對手的運算量達到甚至超越更大規模基準的表現，並以 DatologyAI 自身基準測試及與 Thomson Reuters、RC Trendy Large 的客戶案例為佐證。


## 為背景 Agent 打造的優質基礎設施
@ Sail
論點是當 Agent 長時間在背景自主運行時，推論基礎設施需要從「對人類低延遲回覆」轉向「為機器打造的高吞吐量」，成本可比主流供應商低 5-6 倍。強調「平行智慧」（多個 Agent 平行運行）勝過單一模型的 IQ，並呼籲雲端沙盒應具備可自動休眠以節省計費的能力。











## 開源前沿實驗室究竟如何訓練模型
@ Sami, Prime Intellect
說明由於開源前沿實驗室有 70% 以上的成本花在推論上，因此架構設計是圍繞「推論成本與延遲」而非基準分數展開。兩大主題：高效注意力機制（GQA／MLA、滑動視窗、稀疏注意力）以降低長序列的 KV cache；以及 MoE 稀疏化，在不增加每個 token 運算量（FLOPs）的前提下擴大總參數量。











## 如何透過訓練自有語言模型釋放企業價值
@ Snowflake
分享企業何時該訓練自有模型的原則（只在擁有可防禦優勢之處訓練、解決客戶痛點勝過追逐基準分數、資料比演算法更重要，以及要懂得何時該停手），並以 Arctic Embed（企業檢索用 embedding）與 Arctic Text-to-SQL 為案例。指出由於 RAG 加上 Agent 可以多次檢索，top-1 排名的邊際效益正在下降；也坦承 Text-to-SQL 模型在技術上成功，但產品整合卻遇到阻礙。











## 正式環境中非同步 Agent 的推論
@ Meryem, Doubleword
把長時間運行的非同步 Agent 面臨的挑戰抽象為一道「token 問題」＝ token 數量 × 每個 token 的成本，並提出三個槓桿：上下文管理（壓縮、修剪無用的工具結果、外部記憶、快取——可節省約 80%）以降低 token 數量；改用夠好、便宜的開源模型；以及為「高吞吐量、對延遲不敏感」的工作負載重新設計推論堆疊。











## Local AI 201：推論引擎與硬體堆疊
@ Ahmed Osman 與 Mike，Osmantic（另有 Alex，Exo）
一場實作導向的講解，說明硬體記憶體頻寬、模型選擇與引擎／核心優化如何共同決定本地 AI 效能，並以 RTX Pro 6000、DGX Spark、Strix Halo、M5 MacBook Pro 的現場競速為例，同時介紹 Exo 全新的 local.ai 本地硬體代理任務效能評測平台。










## 讓神經網路變小：量化與剪枝
@ PrismML
介紹量化與剪枝如何讓大型模型變得更小、更快、更省電：說明離群值，以及長序列下 KV cache 超過權重大小，是兩大瓶頸，並以分組量化、Hadamard 旋轉、混合精度與 SVD-Quant 等技術因應。顯示完全 1-bit／三元（ternary）模型能保留約 90-95% 的效能，同時把記憶體用量削減約一個數量級。











## 一幀不掉：圍繞延遲預算設計 VLM
@ Moondream
說明如何在三個層面圍繞「延遲預算」重新設計一款即時 VLM：把模型架構換成約 9B 的 MoE 以加速解碼；使用 SuperBPE 與專屬的 grounding token 大幅減少輸出 token 數；以及打造自訂推論引擎（自訂 CUDA kernel，排程與解碼平行執行）。在 B200 上每幀約 30 毫秒，可支援多路 30 FPS 串流。











## 端到端最佳化模型訓練：一個小型 MoE 案例研究
@ Zach Mueller, Lambda
以一個約 5 億參數的小型 MoE 為例，示範如何在家用多 GPU 主機上，把預訓練時間從約 61 小時縮短到約 13.2 小時。這項最佳化來自一連串細節：2 的冪次批次大小、Flex Attention、預先 tokenize、融合式 AdamW，以及用梯度累積把通訊頻率降到十分之一。











## 量化：模型大小與品質的權衡
@ Hugging Face
一段關於量化的說明——透過降低位元寬度（FP32→Q8→Q4→一位元）來縮小模型體積、加快推論速度，並以 Transformers.js 的 Bonsai 模型與 Google 的 Gemma 4 QAT 版本為例，說明量化感知訓練如何在壓縮的同時盡量保留品質，強調量化整體上是大小與品質的權衡，而非免費的性能提升。






## RAG 還是微調？用 LoRA 客製化 LLM
@ Keshka, Sonder
從 token、embedding 到自迴歸生成的 LLM 基礎原理出發，帶出 RAG 與微調的實務選擇框架，並介紹 LoRA 作為以低成本讓 LLM 適應新領域與風格的方法。





## 實戰中的 RLVR：從合成資料到 GRPO
@ Chris, NVIDIA
拆解訓練 Nemotron 的 hero-run 流程：先用少量高品質合成資料做 SFT 鋪路，再以多環境 RLVR 運用可由程式驗證的獎勵，最後加入 RLHF／GenRM。重點包括資料配比如何反映模型的定位、GRPO 讓一組樣本互相比較排名，以及 Pivot RL 只在「變難的那一步」之後才執行 rollout 以節省運算資源。訓練框架大部分已開源。











## 開放層：開源模型、路由與推論如何重塑 Agentic 工程
@ 座談：OpenRouter、Fireworks、Arcee
討論開放權重模型、模型路由與推論基礎設施在 Agentic 工程中扮演的角色。重點包括：「開放」意味著掌控權與選擇權；對多數商業任務而言，開放權重模型已經「夠好，且便宜一個數量級」；品質／成本／速度的取捨三角；以及以 token 計價所帶來的「里程焦慮」，還有訂閱制模式的設計。











## 世界還不夠：RL 的環境問題
@ 座談：Fleet、Prime Intellect、Taste
主張 RL／Agent 進展的瓶頸已從運算力轉移到「高品質環境」，而其中最困難的部分是「驗證／評分」——尤其是如何在設計與美感這類主觀領域避免 reward hacking。強調評測與環境緊密耦合，需要頂尖的人類專家來設定標準，並提出「產品資料飛輪」：每間公司都應重新設計產品以擷取偏好與行為訊號，形成專屬的 RL 資料與模型改進循環。











## 邁向可靠的金融 Agent：4B 模型如何智勝 235B 巨獸
@ Snorkel AI（與加州大學柏克萊分校合作）
一個經 RL 微調的 4B 專精模型，在自建的 FinQA 基準測試（SEC 10-K 財報文件、約 6,900 張 SQL 資料表）上以約 60% 的 pass@1，擊敗了 235B 的通用模型（約 51%）。關鍵不在推理能力，而在「工具使用紀律」：大型模型經常幻覺出不存在的資料表名稱、濫用 SELECT *，且出錯後不會修正；小型模型則學會了 schema 探索、正確的 SQL 與錯誤復原。消融實驗顯示，最簡單的 0/1 正確性獎勵勝過複雜的評分規準，且推論成本僅約十分之一。











## Training Agents 2：客製化代理人的模型蒸餾實作直播教學
@ Ben 與 Sergio，Hugging Face
Hugging Face 的 Ben 與 Sergio 講解代理人訓練中的模型蒸餾——off-policy、on-policy 與自我蒸餾的差異、on-policy 蒸餾背後的反向 KL 機制，並以 TRL 的 GKDTrainer 實作將 4B 程式碼代理人教師模型蒸餾成 0.6B 學生模型的直播實驗。








## 訓練 Agent 系列 3:強化學習
@ Ben 與 Sergio Paniego, Hugging Face
Hugging Face 的 Ben 與 Sergio Paniego 介紹 GRPO(group relative policy optimization)作為 agent 訓練管線中 SFT、蒸餾之後的強化學習階段,說明組內相對 advantage、KL/裁剪護欄、把 reward function 設計為「契約」,以及如何透過 TRL 與 Trackio 曲線分辨 reward hacking 與健康訓練,並以三組遞進的 HF Jobs 實驗(無意義 reward、可驗證的程式測試 reward、刻意可被鑽漏洞的 reward)具體示範。




## 訓練 Agent 系列直播教學：如何微調程式碼 Agent 以實現持續學習
@ Ben Burtenshaw, Hugging Face
Hugging Face 的 Ben Burtenshaw 與 Sergio Paniego 讓一個 coding agent（Codex）透過 TRL、HF Jobs 與 Trackio，在真實 agent trace 上對一個小型 Gemma 模型進行 SFT 微調，並講解 prompt/completion 遮罩機制、超參數掃描與評測時的注意事項，作為訓練 Agent 系列邁向 RL 的第一集。







## Trinity：如何在不崩潰的情況下從零訓練 400B MoE
@ Lucas（技術長）, Arcee AI
分享在約 5,000 萬美元資金、30 天租用期限內，從零開始預訓練一個 400B MoE 模型（每個 token 僅啟用 13B）的過程。在約 1,000 億 token 時遇到嚴重的路由失衡，最終靠一次同時上線六項變更才穩定訓練。內容涵蓋除錯哲學（縮小搜尋空間）、MoE 稀疏性帶來的低推論成本，以及高壓下的領導與團隊心理安全感。











## 深度學習之後是什麼？
@ Incept Labs
以「路徑依賴」檢視當今大型模型背負的設計包袱：分層網路、序列化的反向傳播、同步的大規模訓練，以及黑盒式最佳化器，多半是 1980 年代硬體與應用假設下的產物，如今在「運算便宜、記憶體昂貴」的時代已成為瓶頸。預測趨勢將轉向優先重新設計演算法、抹除抽象邊界（mega-kernel）、貼近硬體的 DSL，以及針對任務特化的最佳化器。
