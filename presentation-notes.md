# GLM-5 Seminar Presentation Notes

## Presentation Constraints

- Target length: about 90 minutes including questions and discussion.
- Prepare enough technical material for at least 60 minutes of speaking.
- Audience: technical seminar on LLM technical reports.
- Slide style: clear, informative, visually clean, not cluttered.
- No private speaker notes embedded in slides; this document is the working memory for structure and delivery.
- Build format: interactive HTML slides from scratch in this repository.

## Core Emphasis

- Training data in every stage: what data is used, how it is curated, what seems to matter.
- Evaluation data and signals: base model, long-context model, final model, and real-world agentic evaluations.
- Architecture and systems details only where they are central to long context or efficient serving.
- Weird or interesting choices that need discussion, such as dense layers inside an MoE model.
- Hover notes for datasets/evaluations when the paper provides concrete definitions.

## Implementation State

- Initial deck scaffold created at `slides/index.html`.
- Styling lives in `slides/styles.css`.
- Keyboard/navigation logic lives in `slides/deck.js`.
- First slide is a GLM-5 title slide with Uriel Dolev as speaker.
- OpenAI symbol asset for the Codex credit is stored at `slides/assets/openai-logo-symbol.svg`.

## Working Process

- We will decide the outline together before expanding the deck.
- For each section, load the relevant TeX source and figures as ground truth.
- Then decide what belongs on slides, what belongs only in this notes document, and what should become discussion material.

## Opening Slides

- Slide 1: title slide.
- Slide 2: technical paper overview.
  - Purpose: orient the audience before diving into the paper.
  - Flow we will follow: goal/results -> architecture -> pre+mid training -> SFT -> RL/agentic -> evaluations -> easter eggs.
  - Approximate paper-space estimates are from main-body TeX word counts, excluding appendix/contributors.
  - Estimated shares: goal/results 7%, architecture 13%, pre+mid data 4%, SFT 3%, RL/agentic 35%, evaluations 25%, infrastructure 11%, other 2%.
  - Infrastructure is explicitly shown as a real paper focus, but we will mostly skip it unless it explains long context, serving, or training scale.
- Slide 3: abstract framing.
  - GLM-4.5 is positioned as the ARC foundation: agentic, reasoning, and coding capabilities.
  - GLM-5 is positioned as the next step: real-world coding and end-to-end software engineering.
  - Claimed mechanisms to interrogate later: long-context fidelity, RL scaling, and infrastructure.
  - Infrastructure is a major paper component, but we will not emphasize every implementation detail unless it affects long context, serving, or training scale.
  - Our seminar lens throughout remains data and evaluation signals, not promotional benchmark claims alone.
- Slide 4: abstract repo-release line.
  - Quote: "Code, models, and more information are available at https://github.com/zai-org/GLM-5."
  - Ask audience what they expect to find before opening the link.
  - Use this as a light transition into reading technical reports critically: release language, artifacts, and actual reproducibility can diverge.
- Slide 5: main reported results from the Introduction.
  - Open-weight leader: AA Index v4.0 score 50; No. 1 open model on LMArena Text and Code.
  - Clear improvement over GLM-4.7: about +20% average on ARC; +8 points on AA Index.
  - Frontier competitive but not dominant: comparable to Claude Opus 4.5 and GPT-5.2 (xhigh), better than Gemini 3 Pro in their ARC summary.
  - Real-world / long-horizon emphasis: Vending-Bench 2 No. 1 among open models; CC-Bench-V2 narrows the Claude gap across frontend, backend, and long-horizon tasks.
- Slide 6: evidence gallery.
  - 2x2 gallery uses intro Figures 1-4. Each figure can be clicked to inspect it with the paper caption.
  - Converted PDF figures for browser display: `slides/assets/results/arc_clean.png`, `slides/assets/results/cc-bench-v2.png`.
- Slide 7: Introduction technical contributions.
  - DSA: efficient sparse attention, reported to reduce training/inference costs while preserving long-context reasoning; enables 744B parameters and ~28.5T training tokens.
  - Asynchronous RL infrastructure: decouples generation from training to improve GPU utilization and large-scale trajectory exploration. We mention mostly as context.
  - Asynchronous Agent RL algorithms: aimed at long-horizon interactions, planning, and self-correction in dynamic environments. Main focus.
  - Chinese GPU ecosystem adaptation: full-stack optimization across seven domestic chip platforms. Mention, mostly skip.
  - Close with the practical mechanism: efficient long-context modeling plus scalable RL for long-horizon, real-world agent tasks.

## Architecture Slides

- Slide 8: Architecture / Attention: long-running agents need long context.
  - Motivation should connect back to the paper's stated target: real-world coding and end-to-end software engineering through long-horizon agentic workflows.
  - Core architecture problem: dense full attention is `O(L^2)` and becomes prohibitively expensive at 128K contexts.
  - Present the generic efficient-attention recipe:
    - For the current token, choose a smaller set of relevant previous tokens.
    - Then perform attention over the selected tokens instead of the full context.
  - Do not introduce MLA/DSA/MTP on this slide yet.
- Slide 9: Architecture / Attention: two design questions.
  - Question 1: which tokens participate?
  - Question 2: what attention variant runs on the selected tokens?
  - Second question matters for both model performance and KV-cache footprint.
- Slide 10: Architecture / Attention: MLA.
  - Paper order starts with MLA before DSA.
  - Motivation: reduced key-value vectors, effectiveness comparable to GQA, better GPU memory savings and long-context processing speed.
  - Dimension clarification for the slide: GQA-8 is the baseline with 8 KV heads and `8 x (128 K + 128 V) = 2048` cached dims; MLA cache is `512 latent KV + 64 RoPE key = 576` cached dims.
  - Important reading note: the paragraph is easy to misread because it mixes the GQA baseline's 128-dim score, MLA's 576-dim latent-cache score, and GLM-5's final head dimensions (`QK=192`, `V=256`, 64 heads). Do not imply the 256 value dimension reduces the QK dot product directly.
  - Initial issue: MLA with 576-dimensional latent KV cache did not match GQA-8 with 2048-dimensional KV cache under the Muon optimizer recipe.
  - Muon Split: split the up-projection matrices for Q/K/V into smaller per-head matrices and orthogonalize them independently.
  - Interpretation: Muon Split keeps each head's up-projection well-conditioned while relaxing cross-head coupling; the paper gives this as an empirical optimizer fix, not a full theory.
  - MLA-256: increase head dimension from 192 to 256 and reduce attention heads by one third; training computation and parameter count stay constant, decoding computation decreases.
  - Explanation of MLA-256: decode cost decreases because fewer heads each perform the 576-dimensional score computation; increasing the value/head width preserves value/output capacity and roughly maintains the full attention block's training compute/parameter budget.
  - Full table is on the slide: GQA-8, MLA, MLA + Muon Split, MLA-256 + Muon Split across HellaSwag, MMLU, C-Eval, RACE, BBH, GSM8K, HumanEval.
- Slide 11: Architecture / Attention: DSA continued pre-training.
  - DSA replaces dense `O(L^2)` attention with dynamic, fine-grained token selection.
  - Unlike fixed patterns such as sliding windows, DSA uses content to decide which tokens are important.
  - Paper states that DeepSeek-V3.2-Exp maintaining dense-predecessor benchmark performance proves about 90% of attention entries in long contexts are redundant.
  - Reported long-sequence attention compute reduction: roughly 1.5-2x.
  - GLM-5 DSA training starts from the base model at the end of mid-training.
  - Warm-up: 1000 steps, 14 sequences of 202,752 tokens per step, max LR 5e-3.
  - Sparse adaptation: follows mid-training data/hyperparameters and uses 20B tokens.
  - Contrast in the paper: this is much smaller than DeepSeek-V3.2's 943.7B-token DSA training budget.
- Slide 12: Architecture / Attention: DSA evidence.
  - Table source: "Comparison of long-context benchmarks between MLA and DSA base models."
  - Scores: MQ-NIAH-128K 100.0 vs 100.0; MV-NIAH-128K 95.5 vs 97.0; SQuAD-128K 79.7 vs 86.0; HotpotQA-128K 66.3 vs 63.0.
  - Figure source: `loss_v2.pdf`, SFT loss curves comparing MLA and DSA after same SFT data.
  - Main point: after only 20B adaptation tokens, DSA is close to the original MLA model on these long-context evaluations.
- Slide 13: Architecture / Attention: efficient attention variants.
  - Ablation baseline: GLM-9B with GQA across all 40 layers, fine-tuned to 128K context.
  - SWA Interleave: fixed alternating full-attention/windowed-attention layers.
  - GDN: gated linear recurrence replacing quadratic softmax attention.
  - SWA Pattern: search-based layer selection using beam search at 16K; final pattern applied to all context lengths.
  - SimpleGDN: removes Conv1d and explicit gating modules, reusing pretrained QKV projection weights.
- Slide 14: Architecture / Attention: SWA pattern search result.
  - Full table is on the slide: GLM-9B full attention, SWA Interleave, SWA Pattern from 4K to 128K without additional training.
  - 128K values: full attention 75.28; SWA Interleave 6.51; SWA Pattern 53.95.
  - Both SWA methods use a 1:1 full-attention/SWA ratio with a 4096-token window.
  - The search uses beam size 8, optimizes two layers per step at 16K, and applies the pattern to all tested context lengths.
  - Beam-search explanation: the choice being searched is the layer pattern, not token routing. For GLM-9B's 40 layers, the search keeps a beam of the 8 best partial layer configurations. At each step it extends the candidate patterns by optimizing two more layers, evaluates candidates on RULER at 16K, then keeps only the top 8 for the next step. It converges in about 10 steps and returns `SFSSFFSSSFFFFSSFSFFFFFFSFSFSSFSSFSFSSFSSS`, where `S` is SWA and `F` is full attention.
- Slide 15: Architecture / Attention: continual-training results.
  - Full table is on the slide: RULER, MRCR, HELMET-ICL, RepoQA at 64K/128K after 190B-token continual training.
  - Benchmark hovers:
    - RULER: synthetic long-context benchmark for effective context size, with retrieval, multi-hop tracing, aggregation, and QA-style tasks.
    - MRCR: OpenAI Multi-Round Co-reference Resolution, a multiple-needle test over long multi-turn conversations.
    - HELMET-ICL: in-context-learning category of HELMET, an application-centric benchmark with controllable lengths up to 128K.
    - RepoQA: long-context code-understanding benchmark where a model identifies a target function from repository context and a natural-language description.
  - Continual training uses 64K context length and a 1:1 ratio between efficient attention layers and full attention layers.
  - Important paper point: even improved efficient-attention variants incur accuracy gaps on fine-grained retrieval tasks.
  - Exact section conclusion shown on slide: DSA is lossless by construction because token-level sparsity does not discard long-range dependencies.
- Slide 16: Architecture / Attention: GLM-4.7-Flash DSA check.
  - Full RULER table from 4K to 128K is on the slide.
  - Baseline 128K: 79.21; DSA warmup: 71.35; DSA after 150B joint training: 78.86.
  - Warmup trains only the indexer while keeping base model frozen; full DSA jointly trains both model and indexer.
- Slide 17: Architecture / MTP: MTP with parameter sharing.
  - MTP improves base model performance and serves as a draft model for speculative decoding.
  - Naively predicting the next `n` tokens requires `n` MTP layers, causing MTP parameters and KV cache to scale linearly with speculative steps.
  - DeepSeek-V3 is trained with a single MTP layer and predicts the next 2 tokens during inference; the paper says this training-inference discrepancy reduces acceptance rate of the second token.
  - GLM-5 shares parameters across 3 MTP layers during training.
  - Reported accept length on private prompts with 4 speculative steps: DeepSeek-V3.2 2.55, GLM-5 2.76.
- Slide 18: Architecture Summary: scale table.
  - Source: appendix Table "Model architecture of GLM-4.5 and GLM-5".
  - GLM-5 vs GLM-4.5: total parameters 355B -> 744B; activated parameters 32B -> 40B; dense layers 3 -> 3; MoE layers 89 -> 75; total experts 160 -> 256; routed/shared experts stay 8 + 1.
  - Discussion hook: in both models, the first 3 layers remain dense even though the main architecture is MoE.
- Slide 19: Architecture Summary: GLM-5 vs GLM-4.5 architecture comparison.
  - Visual asset: `slides/assets/architecture/glm4.5_vs_glm5.png`.
  - Use as a synthesis slide after explaining individual components.
  - Talking anchors: scale increases, active parameters increase modestly, GQA changes to MLA+DSA, experts scale, first dense layers remain.
- Slide 20: Architecture Summary: GLM-5 vs DeepSeek-V3.2 architecture comparison.
  - Visual asset: `slides/assets/architecture/glm5_vs_deepseekv32.png`.
  - Use to validate the reading that GLM-5 is architecturally close to DeepSeek-V3.2 in the major ingredients: MoE, MLA, DSA, MTP.
  - Keep wording precise: show similarity, do not overstate direct implementation identity.

## Architecture Verification Checklist

- Every architecture slide should have one clear takeaway and be explainable in about 1-3 minutes.
- Every number should be traceable to `GLM-5-arXiv/2_pretrain.tex` or `GLM-5-arXiv/9_appendix.tex`.
- Wording should avoid unsupported inference, skeptical framing, and promotional filler.
- Slides should stay visually simple enough that the audience can follow while listening.

## Training Slides

- Slide 21: Training / Overview: full training procedure.
  - Source figure: `GLM-5-arXiv/figures/overall_pipeline.pdf`, captioned in the paper as "Overall training pipeline of GLM-5."
  - Use this as the handoff from architecture into the training recipe: base pre-training, mid-training/context extension, SFT, sequential RL, and distillation.

- Slide 22: Training / Pretraining: broad corpus, domain-specific filters.
  - Sources: `GLM-5-arXiv/1_intro.tex` Methods paragraph for the 27T-token base corpus and early code/reasoning priority; `GLM-5-arXiv/2_pretrain.tex` Pre-training Data subsection.
  - Context source for plain-language framing: Kili Technology blog, "A Data Story of the GLM Model Family," especially its summary of the GLM-4.5 pattern as cleaning/deduplication, quality scoring, bucketization, and quality-aware sampling.
  - Presenter emphasis: this slide is about general base pre-training data, not SWE workflow data or context-extension stages.
  - Visible copy intentionally avoids hard-to-parse codenames. If asked: the web sentence-embedding quality selector corresponds to the paper's additional DCLM classifier, and the knowledge-focused selector corresponds to the World Knowledge classifier.
  - Web includes documents from the GLM-4.5 web pipeline; GLM-5 adds selectors for additional high-quality data and long-tail knowledge.
  - Code includes major code hosting snapshots and code-containing web pages; GLM-5 refreshes sources, expands code web pages, reports 28% more fuzzily deduplicated unique tokens, fixes Software Heritage metadata alignment, and improves language detection including low-resource languages.
  - Math & Science includes webpages, books, papers; GLM-5 refines extraction/PDF parsing, uses LLM scoring for educational content, adds chunk-and-aggregate scoring for long documents, and filters out synthetic, AI-generated, or template-based data.

- Slide 23: Training / Midtraining: stretching workflows.
  - Sources: `GLM-5-arXiv/1_intro.tex` Methods paragraph for `4K -> 200K`; `GLM-5-arXiv/2_pretrain.tex` Mid-Training subsection.
  - Presenter emphasis: mid-training is not just more tokens; it changes the example shape toward long code, reasoning, long-context recall, and agentic workflows.
  - Context stages: `32K (1T tokens)`, `128K (500B tokens)`, `200K (50B tokens)`, totaling `1.55T` mid-training tokens.
  - Between-the-lines context from the GLM-family data story: this is a stagewise mixture/curriculum move. Later training shifts toward high-signal domains such as code, reasoning-heavy text, long-context candidates, and agentic traces.
  - SWE data: repo-level code files, commit diffs, GitHub issues, pull requests, and relevant files are concatenated into unified training sequences; about 10M issue-PR pairs and about 160B unique tokens after filtering.
  - Construction detail: GLM-5 broadens eligible repositories with relaxed repo-level filtering, but tightens issue-level quality filtering and retrieves more relevant files per issue-PR pair.
  - Natural long-context data: books, academic papers, and general pre-training documents; multi-stage filtering by perplexity, deduplication, and length; knowledge-intensive domains upsampled.
  - Synthetic/MRCR-like data: NextLong/EntropyLong-inspired construction for long-range dependencies, interleaved packing for highly similar texts to mitigate lost-in-the-middle, and a small MRCR-like portion at 200K for recall in extended multi-turn dialogues.

## Post-Training Slides

- Slide: Post-training / SFT data.
  - Source: `GLM-5-arXiv/3_posttrain.tex` SFT subsection.
  - Visible structure: General Chat, Reasoning, Coding & Agent, plus the masked-loss trajectory callout.
  - Key caveat: the paper gives categories and construction signals, but not SFT category sizes, source lists, or mixture proportions.
  - General Chat: question answering, writing, role-playing, translation, multi-turn dialogue, long-context interactions; role-play is filtered on instruction following, linguistic expressiveness, creativity, logical coherence, and long-dialogue consistency.
  - Reasoning: logical reasoning uses verifiable problems and rejection sampling; math/science uses difficulty filtering to keep problems challenging for GLM-4.7.
  - Coding & Agent: execution environments generate trajectories; expert RL and rejection sampling improve them; erroneous segments are retained but masked in the loss so recovery context is learned without imitating wrong actions.
- Slide: Post-training / SFT chat template.
  - Source figure: `GLM-5-arXiv/figures/glm5_tr_thinking_mode_v2.pdf`, rendered as `slides/assets/posttraining/thinking_mode.png`.
  - SFT maximum context length: `202,752` tokens.
  - Interleaved Thinking: thinking before responses and tool calls.
  - Preserved Thinking: retain thinking blocks across multi-turn coding-agent sessions to reduce information loss and inconsistencies.
  - Turn-level Thinking: per-turn control over reasoning, trading latency/cost against accuracy/stability.
- Slide: Post-training / Reasoning RL.
  - Source: `GLM-5-arXiv/3_posttrain.tex` Reasoning RL subsection.
  - Algorithm details are intentionally compressed: GRPO backbone plus IcePop-style handling for training/inference mismatch; no equation needed.
  - Domains: mathematics, science, code, and tool-integrated reasoning, kept roughly balanced.
  - Math/science data: open-source plus vendor-built collections; difficulty filtering keeps problems GLM-4.7 rarely solves or fails, while stronger teachers can solve.
  - Code data: competitive programming from Codeforces, TACO, SYNTHETIC-2-RL; scientific coding is built from internal problem pools by decomposing questions into minimal code implementations.
  - TIR: reuses harder math/science data and adds STEM questions designed for external tools.
  - Rewards: domain/source-specific judge models or evaluation systems produce binary outcome rewards.
  - DSA RL detail: deterministic `torch.topk` stabilizes top-k indexer selection; indexer is frozen by default during RL.
- Slide: Post-training / Agentic RL.
  - Sources: `GLM-5-arXiv/3_posttrain.tex` Agentic RL subsection and `GLM-5-arXiv/3.1_agenticRL.tex` asynchronous RL design.
  - Main point: long-horizon agent rollouts create bubbles in synchronous RL, so GLM-5 decouples inference and training.
  - Multi-Task Rollout Orchestrator: task services register independent rollout/reward logic; trajectories are standardized as message lists; supports over 1K concurrent rollouts.
  - TITO preserves exact tokenization and action correspondence, avoiding re-tokenization mismatch.
  - Direct double-sided importance sampling reuses rollout logprobs and masks tokens outside the trust interval, avoiding historical-policy checkpoint tracking.
  - Additional stability: drop stale off-policy samples and environment-collapse failures; DP-aware routing preserves KV-cache locality across turns.
- Slide: Post-training / General RL.
  - Source: `GLM-5-arXiv/3_posttrain.tex` General RL subsection.
  - Objectives: foundational correctness, emotional intelligence, task-specific quality.
  - Reward signals: rule-based rewards, ORMs, GRMs; each has tradeoffs, so they are blended.
  - Human-authored responses are used as style/quality anchors to avoid model-like verbosity and formulaic patterns.
  - Caveat: paper does not disclose exact reward recipes, quantities, or mixture proportions.
- Slide: Post-training / On-Policy Distillation.
  - Source: `GLM-5-arXiv/3_posttrain.tex` On-Policy Cross-Stage Distillation subsection.
  - Problem: sequential RL over different objectives can degrade previously acquired skills.
  - Teachers: final checkpoints from earlier training stages, especially SFT, Reasoning RL, and General RL.
  - Prompts: sampled from each teacher's RL training set and mixed in appropriate proportions.
  - Training: advantage term is replaced by teacher-current model gap; group size `1`, batch size `1024`, because no large sampled group is needed to estimate advantages.
  - Takeaway: sequential RL specializes; on-policy cross-stage distillation consolidates and reduces regression.

## Agent Environment Slides

- Slide: Agent Environments / Overview.
  - Source: `GLM-5-arXiv/3.1_agenticRL.tex`, Environment Scaling for Agents.
  - Presenter emphasis: this section is about converting open-ended long-horizon work into executable or otherwise grounded feedback. Keep training/construction and evaluation separate: BrowseComp is used here for search context-management evaluation, not stated as training data.
  - Environments covered: SWE, terminal, search, and slide generation. Search context management is split out because it is an inference mechanism with a strong plotted result.
- Slide: Agent Environments / SWE.
  - Source: Software Engineering Environments subsection.
  - Real Issue-PR pairs are filtered by rule-based and LLM-based filters, categorized into bug fixing, feature implementation, refactoring, and other task types.
  - RepoLaunch-style setup analyzes installation/dependencies, builds executable environments, and generates test commands.
  - LLM-generated language-aware log parsers extract fail-to-pass and pass-to-pass cases.
  - Scale: over 10k verifiable environments across thousands of repositories and 9 languages: Python, Java, Go, C, C++, JavaScript, TypeScript, PHP, Ruby.
- Slide: Agent Environments / Terminal.
  - Source: Terminal Environments subsection.
  - Seed-data route: seeds from SWE and terminal computer-use; LLM drafts tasks; construction agent instantiates Harbor tasks; refine agent checks build reliability, spec/test consistency, and exploit resistance.
  - Web-corpus route: quality-filter code-relevant pages; select pages suited to terminal tasks; stratified sample by topic/difficulty; coding agent writes Harbor task and validates its own output.
  - Environment shape: structured task description, Dockerized execution environment, and test scripts. Paper reports Docker construction accuracy above 90%.
- Slide: Agent Environments / Search.
  - Source: Search Tasks subsection.
  - Starts from early-stage search-agent trajectories; deduplicates URLs and keeps over 2M high-information web pages.
  - LLM parses entities, removes noise, extracts structured info, and updates a Web Knowledge Graph through alignment/normalization/relation consolidation/semantic consistency.
  - Questions are generated from low- to mid-frequency seed entities and expanded multi-hop neighborhoods.
  - Filtering removes tool-free-solvable questions, basic-agent-solvable questions, and ambiguous or inconsistent examples via verification-agent checks.
- Slide: Agent Environments / Search Inference.
  - Source: Inference with Context Management for Search Agents subsection and `GLM-5-arXiv/figures/GLM5-BC-cm.pdf`.
  - BrowseComp is an evaluation benchmark for context-management strategies in this subsection; the paper does not state that BrowseComp itself is used as training data.
  - Tools exposed in the paper: search, open, find, and python.
  - Keep-recent-k folds only old tool observations, not all old reasoning/actions. With `k=5`, the paper reports GLM-5 improves from 55.3% to 62.0%.
  - Hierarchical context management combines keep-recent with discard-all when total context exceeds `T=32k`, reaching 75.9 on BrowseComp.
  - Judge setup: official OpenAI evaluation prompt and o3-mini, chosen because open-source judges can introduce systematic bias.
- Slide: Agent Environments / Slide Generation.
  - Source: Slide Generation subsection and `GLM-5-arXiv/figures/ppt_reward_hacking.pdf`.
  - Pipeline: SFT -> RL with multi-level rewards -> rejection sampling -> masking-based refinement.
  - Level 1 reward: static markup attributes and HTML/CSS validity, including hallucinated/duplicate image detection.
  - Level 2 reward: runtime DOM/rendering metrics such as element geometry, overflow, and bounding boxes; important because it catches reward hacking like hard truncation or spacing manipulation.
  - Level 3 reward: perceptual/compositional signals such as abnormal whitespace.
  - Rejection sampling transfers reward functions into filtering; Best-of-N keeps the highest-quality candidate.
  - Masking-based refinement preserves good pages inside partially defective trajectories.
  - Reported outcomes: strict 16:9 compliance improves from 40% to 92%; human evaluation win rates vs GLM-4.5 are 60% content, 57.5% layout, 65% aesthetics, 67.5% overall.
