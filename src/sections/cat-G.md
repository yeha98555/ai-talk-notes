---
heading: Model Training & Inference
desc: Training, RL/RLVR, MoE, quantization, inference infrastructure — mostly background technology, more indirectly related to the product layer.
color: #64748b
docs: 152, 6, 115, 17, 158, 157, 43, 47, 49, 52, 114, 57, 59, 60, 118, 127, 65, 83, 85, 86, 116, 132, 117, 88, 93
---
## Agents at Scale: Inside MiniMax's Model and the Infrastructure Behind It
@ Olive Song, MiniMax & Dan, Together AI
the intent is that even if a model overfits to it, the resulting kernels are directly useful and can be adopted into inference stacks.

On the inference side, serving a newly dropped model starts as soon as early architecture details are shared — attention variant, MoE routing, quantization choices, all of which differ meaningfully between open models. Together's day-zero goal is simply quality parity and a workable user experience; from there a running list of optimizations (KV cache handling, attention kernels, quantization work) gets worked through over the following weeks, so the same model measurably speeds up between launch day, day seven, and day fourteen. The shift from chat-style workloads (short system prompt plus turns) to agentic workloads (whole codebases uploaded, hundreds of tool calls, long multi-turn sessions) changes what part of the stack is worth optimizing — prompting, KV cache strategy, and routing all have to adapt to sustained, code-heavy context rather than short conversational turns.

MiniMax M3 adds further inference complexity via a custom sparse attention mechanism (distinct from DeepSeek's or GLM's), multimodality, and a context length extended to one million tokens. There's no single biggest lever — the approach is to optimize essentially everything, kernel by kernel, and carry over general lessons from prior sparse-attention work (something Together has studied since well before it was mainstream) even though each new sparse-attention design requires bespoke kernels.

A striking capability highlighted from training is the model's ability to reproduce a 12-hour research task — replicating an ICLR paper end to end. Training for tasks this long-horizon and hardware-constrained again comes down to environment and reward design, plus RL algorithm adjustments for efficiency. Evaluation happens iteratively across the run: intermediate submissions are checked against internal evaluations (including ones MiniMax built while using the model to accelerate its own development, i.e., self-evolution) to catch reward hacking and confirm genuine progress rather than just a plausible-looking final output.

Managing KV cache at these scales — million-token contexts across many concurrent requests — is described as effectively building a distributed file system or large database: deciding where cache lives, how to detect reuse, and how to move it efficiently between machines, conceptually simple but operationally demanding.

Looking three years out, both speakers expect today's practices to look primitive: GPU utilization in training remains low industry-wide and should improve substantially, and the gap between closed frontier labs and open-source models — already narrower than commonly assumed, as shown by M3, GLM, and Kimi — is expected to keep closing. From the training side, the compounding effect of self-evolution, where models increasingly help build and accelerate their own development pipeline, is flagged as the trend most likely to keep accelerating progress.



## AI: too good to be true, too bad to be useful
@ Diogo (ex-OpenAI), TypeSafe AI
Argues that today's LLMs are RLHF-optimized to be "assistants that please humans" rather than "reliable autonomous executors" — which is why they seem amazing when a human is watching, but aren't reliable enough to run unsupervised, exactly the gap behind "looks powerful but hasn't delivered an economic revolution." Believes assistant behavior and autonomy are conflicting optimization targets, and the way out is toward type-safe language models that deeply integrate the model with type systems and structured data.











## AsyncOPD: How Stale Can On-Policy Distillation Get?
@ Hugging Face Journal Club, Hugging Face
A Hugging Face Journal Club discussion of a paper on asynchronous on-policy distillation (AsyncOPD): making the on-policy distillation loop asynchronous decouples sample generation from the optimizer for higher throughput, but trains on samples drawn from a slightly stale policy — the paper asks how much staleness the method can tolerate before that drift outweighs the speedup.









## Beyond the API: Modern Inference for Modern Workloads
@ Panel: NVIDIA, Together AI, Modal
The core message is that fine-tuning isn't dead — it's coming back in the form of RL/"model shaping," and compressing intelligence into smaller, more specialized models can improve both experience and latency, while model routing is application developers' moat. Also notes that token usage is growing roughly 10x year over year and supply won't catch up with demand for years, so saving tokens is a shared responsibility between application builders and providers, and inference will eventually spread from pure cloud to local and edge over the long term.











## Data and Environment Curation for Post-Training LLMs
@ Mahesh Sathiamoorthy, Bespoke Labs
Bespoke Labs' Mahesh Sathiamoorthy explains how curated data and RL environments — not just bigger models — drive post-training gains, drawing on Open Thoughts' reasoning-data recipes, Open Thoughts Agents' trajectory curation, and a real enterprise compliance fine-tuning case at Credit Karma.

## Data Quality Is the Compute Multiplier
@ Ari Morcos, DatologyAI
DatologyAI's Ari Morcos argues that in an increasingly compute-constrained world, curating training data (cleaning, curating, synthetic rephrasing, and composing datasets) acts as a compute multiplier, letting models match or beat much larger-compute baselines across VLMs, multilingual LLMs, and domain-specific mid-training/post-training pipelines — as shown by DatologyAI's own benchmarks and customer results with Thomson Reuters and RC's Trendy Large.


## Great Infra for Background Agents
@ Sail
The argument is that as agents run autonomously in the background for long stretches, inference infrastructure needs to shift from "low-latency replies to humans" toward "high-throughput, built for machines," which can cost 5–6x less than mainstream providers. Emphasizes that "parallel intelligence" (many agents running in parallel) beats a single model's IQ, and calls for cloud sandboxes that can auto-sleep for billing purposes.











## How Open Frontier Labs Actually Train Their Models
@ Sami, Prime Intellect
Explains that because open frontier labs spend 70%+ of their costs on inference, they design architectures around "inference cost and latency" rather than benchmark accuracy. Two main themes: efficient attention (GQA/MLA, sliding window, sparse attention) to cut down KV cache for long sequences; and MoE sparsification, which scales up total parameters without increasing per-token FLOPs.











## How to Unlock Enterprise Value by Training Your Own Language Models
@ Snowflake
Shares principles for when enterprises should train their own models (only train where you have a defensible advantage, solving customer pain beats chasing benchmarks, data matters more than algorithms, and know when to stop), using Arctic Embed (enterprise retrieval embeddings) and Arctic Text-to-SQL as case studies. Notes that because RAG plus agents can retrieve multiple times, the marginal benefit of top-1 ranking declines; also admits the Text-to-SQL model succeeded technically but product integration hit snags.











## Inference for Async Agents in Production
@ Meryem, Doubleword
Abstracts the challenge of long-running async agents into a "token problem" = token count × cost per token, and proposes three levers: context management (compaction, pruning useless tool results, external memory, caching — saving roughly 80%) to cut token count; switching to good-enough, cheap open-source models; and redesigning the inference stack for "high-throughput, latency-insensitive" workloads.











## Local AI 201: Inference Engines and the Hardware Stack
@ Ahmed Osman & Mike, Osmantic (with Alex, Exo)
A hands-on walkthrough of how hardware memory bandwidth, model choice, and engine/kernel selection jointly determine local-AI performance, illustrated with live races between an RTX Pro 6000, DGX Spark, Strix Halo, and M5 MacBook Pro, plus a look at Exo's new local.ai benchmark for agentic task performance across local hardware.










## Making Neural Networks Smaller: Quantization and Pruning
@ PrismML
Introduces how quantization and pruning make large models smaller, faster, and more power-efficient: explains that outliers and KV cache exceeding weight size at long sequence lengths are the two big bottlenecks, and counters them with techniques like per-group quantization, Hadamard rotation, mixed precision, and SVD-Quant. Shows that fully 1-bit/ternary models can retain roughly 90–95% of performance while cutting memory by about an order of magnitude.











## No Dropped Frames: designing a VLM around a latency budget
@ Moondream
Explains how a real-time VLM was redesigned around a "latency budget" at three layers: switching the model architecture to a roughly 9B MoE to speed up decoding; using SuperBPE and dedicated grounding tokens to drastically cut output tokens; and building a custom inference engine (custom CUDA kernels, with scheduling and decode running in parallel). Runs at about 30ms per frame on a B200, supporting multiple 30 FPS streams.











## Optimizing Model Training End-to-End: A Tiny MoE Case Study
@ Zach Mueller, Lambda
Using a roughly 500-million-parameter tiny MoE as an example, demonstrates cutting pretraining time on a home multi-GPU rig from about 61 hours down to about 13.2 hours. The optimization comes from a string of details: power-of-two batch sizes, Flex Attention, pre-tokenization, fused AdamW, and using gradient accumulation to cut communication frequency to 1/10.











## Quantization: The Size vs Quality Trade-Off
@ Hugging Face
An explainer on quantization — reducing bit-width (FP32→Q8→Q4→1-bit) to shrink model size and speed inference, illustrated with Transformers.js's Bonsai model and Google's Gemma 4 QAT variants, framing quantization-aware training as a way to preserve quality while compressing, and quantization overall as a size-versus-quality trade-off rather than a free improvement.






## RAG or Fine-Tune? Customizing LLMs with LoRA
@ Keshka, Sonder
A fundamentals-first walkthrough of tokenization, embeddings, and autoregressive generation, followed by a practical RAG-vs-fine-tuning framework and an introduction to LoRA as a low-cost way to adapt LLMs to new domains and styles.





## RLVR in Practice: From Synthetic Data to GRPO
@ Chris, NVIDIA
Breaks down the hero-run pipeline for training Nemotron: SFT paves the way with a small amount of high-quality synthetic data, multi-environment RLVR uses programmatically verifiable rewards, then adds RLHF/GenRM. Highlights include how the data mix reveals the model's positioning, GRPO ranking a group of samples against each other, and Pivot RL only running rollouts after "the step that gets hard" to save compute. The training framework is largely open-sourced.











## The Open Layer: How Open Models, Routing, and Inference Are Reshaping Agentic Engineering
@ Panel: OpenRouter, Fireworks, Arcee
Discusses the role of open-weight models, model routing, and inference infrastructure in agentic engineering. Highlights include: "open" means control and choice; open-weight models are already "good enough and an order of magnitude cheaper" for most commercial tasks; the quality/cost/speed tradeoff triangle; and the "range anxiety" of token-based pricing along with subscription-model design.











## The World Is Not Enough: RL's Environment Problem
@ Panel: Fleet, Prime Intellect, Taste
Argues that the bottleneck for RL/agent progress has shifted from compute to "high-quality environments," and the hardest part of that is "verification/scoring" — especially how to avoid reward hacking in subjective domains like design and aesthetics. Emphasizes that evals are tightly coupled to environments and need top human experts to set standards, and proposes a "product data flywheel": every company should redesign its product to capture preference and behavioral signals, forming a proprietary loop of RL data and model improvement.











## Towards Reliable Financial Agents: How a 4B Model Outsmarted a 235B Giant
@ Snorkel AI (with UC Berkeley)
A 4B specialist model fine-tuned with RL beats a 235B generalist (about 51%) with roughly 60% pass@1 on a custom FinQA benchmark (SEC 10-K filings, about 6,900 SQL tables). The key isn't reasoning power but "tool-use discipline": large models often hallucinate table names, overuse SELECT *, and don't correct errors when they occur; the small model learns schema exploration, correct SQL, and error recovery. Ablations show the simplest 0/1 correctness reward beats a complex rubric, and inference cost is only about 1/10 as much.











## Training Agents 2: Live Tutorial on Model Distillation for Training Custom Agents
@ Ben and Sergio, Hugging Face
Hugging Face's Ben and Sergio walk through model distillation for agent training — off-policy vs on-policy vs self-distillation, the reverse-KL mechanics behind on-policy distillation, and live TRL/GKDTrainer experiments distilling a 4B coding-agent teacher into a 0.6B student.








## Training Agents 3: Reinforcement Learning
@ Ben & Sergio Paniego, Hugging Face
Hugging Face's Ben and Sergio Paniego walk through GRPO (group relative policy optimization) as the RL stage of an agent-training pipeline that starts with SFT and distillation, covering the group-relative advantage, KL/clipping guardrails, reward-function design as a "contract," and how to spot reward hacking versus healthy training via TRL and Trackio curves, illustrated with three escalating HF Jobs experiments (dummy reward, verifiable coding-test reward, and a deliberately gameable reward).




## Training Agents: Live tutorial on how to fine-tune a coding agent for continual learning
@ Ben Burtenshaw, Hugging Face
Hugging Face's Ben Burtenshaw and Sergio Paniego use a coding agent (Codex) to orchestrate SFT fine-tuning of a small Gemma model on real agent traces via TRL, HF Jobs, and Trackio, walking through prompt/completion masking, hyperparameter sweeps, and eval caveats as episode one of a training-agents series heading toward RL.







## Trinity: Training a 400B MoE from Scratch Without Losing Your Mind
@ Lucas (CTO), Arcee AI
Shares the process of pretraining a 400B MoE model from scratch (only 13B active per token) on roughly $50M in funding within a 30-day rental window. Hit severe routing imbalance around 100B tokens, and eventually stabilized training by shipping six changes at once. Covers debugging philosophy (narrowing the search space), the low inference cost that comes from MoE sparsity, and leadership and team psychological safety under high pressure.











## What comes after Deep Learning?
@ Incept Labs
Uses "path dependence" to examine the design baggage of today's large models: layered networks, serialized backprop, synchronous large-scale training, and black-box optimizers are mostly artifacts of 1980s hardware and application assumptions, and have now become bottlenecks in an era where "arithmetic is cheap, memory is expensive." Predicts the trend will move toward reworking algorithms first, erasing abstraction boundaries (mega-kernels), hardware-hugging DSLs, and task-specialized optimizers.
