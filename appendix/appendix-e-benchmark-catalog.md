# 附录 E：Agent 评测基准大全

## E.1 综合能力评测

### E.1.1 GAIA (General AI Assistants)

| 属性 | 值 |
|------|-----|
| 发布 | Meta, 2023 |
| 规模 | 466 个问题 |
| 难度 | Level 1/2/3 |
| 能力 | 推理、工具使用、多步规划 |
| 指标 | 准确率 (Exact Match) |
| 特点 | 问题答案明确，无歧义 |
| 当前 SOTA | ~82%（综合）；Level 1 约 86–89% [[GAIA Leaderboard]](https://huggingface.co/spaces/gaia-benchmark/leaderboard) |

**示例问题**: "How many studio albums were published by Mercedes Sosa between 2000 and 2009?"

> **趋势：** 2024 年初顶级系统约 50%，至 2026 年初已突破 80%，Level 1 上最强 Agent 系统接近甚至超越人类基线（92%）。

### E.1.2 AgentBench

| 属性 | 值 |
|------|-----|
| 发布 | Tsinghua, 2023 |
| 子任务 | 8 个环境（OS, DB, Web, Game 等）|
| 能力 | 多环境交互、长程规划 |
| 指标 | 任务成功率 |
| 特点 | 真实交互环境 |

## E.2 编码能力评测

### E.2.1 SWE-bench

| 属性 | 值 |
|------|-----|
| 发布 | Princeton, 2024 |
| 规模 | 2,294 个 GitHub issue |
| 子集 | SWE-bench Lite (300), Verified (500) |
| 能力 | 代码理解、bug 修复、测试生成 |
| 指标 | % Resolved (patch 通过测试) |
| 当前 SOTA | **~79.2%**（SWE-bench Verified）[[Sonar, 2026]](https://www.swebench.com/) |

> **注意：** SWE-bench Verified 正逐渐接近饱和。研究者指出部分前沿模型可能存在数据污染问题，实际天花板估计在 87–95% 之间 [[The End of SWE-Bench Verified]](https://www.latent.space/p/swe-bench-dead)。mini-SWE-agent 用约 100 行 Python 即可在 Verified 上达到 74%。

### E.2.2 SWE-bench Pro

| 属性 | 值 |
|------|-----|
| 发布 | Scale AI, 2025 |
| 规模 | 1,865 个任务（公开集 731 个） |
| 语言 | Python, Go, TypeScript, JavaScript |
| 仓库 | 41 个真实专业仓库 |
| 能力 | 长程代码编辑、跨文件修改、多语言工程 |
| 指标 | % Resolved |
| 当前 SOTA | **~46%**（公开集）[[Scale AI Leaderboard]](https://scale.com/leaderboard/swe_bench_pro_public) |
| 特点 | 显著难于 Verified；同一模型在 Verified 上 ~81% 而在 Pro 上仅 ~46% |

> SWE-bench Pro 被设计为 SWE-bench Verified 的后继基准。Scale AI（OpenAI 审计方）发现 GPT-5、Claude Opus 4.5、Gemini 3 Flash 等前沿模型能在 Verified 的部分任务中复现 gold patch，这也是 Pro 诞生的动因之一 [[Morph Analysis]](https://www.morphllm.com/swe-bench-pro)。

### E.2.3 HumanEval / MBPP

| 评测集 | 规模 | 任务 | 指标 | 当前 SOTA |
|--------|------|------|------|-----------|
| HumanEval | 164 | 函数生成 | pass@1 | **96%+** [[CodeSOTA]](https://www.codesota.com/code-generation) |
| HumanEval+ | 164 | 增强测试 | pass@1 | ~90%+ |
| MBPP | 974 | Python 编程 | pass@1 | ~92%+ |
| MBPP+ | 974 | 增强测试 | pass@1 | ~87%+ |

> HumanEval 已基本饱和——多个前沿模型 pass@1 超过 95%，作为区分度指标的价值有限。

### E.2.4 Terminal-Bench

| 属性 | 值 |
|------|-----|
| 发布 | Stanford / Laude Institute, 2025 |
| 版本 | v1.0 (80 tasks), **v2.0** (89 tasks) |
| 能力 | 终端环境下的端到端工程任务：编译、模型训练、服务部署、系统管理、安全等 |
| 指标 | 任务成功率（Easy / Medium / Hard） |
| 特点 | 真实沙箱终端环境，模拟工程师日常工作 |
| 当前 SOTA | Easy 60%+, Hard <50%（初始发布时）[[Terminal-Bench]](https://www.tbench.ai/) |

> 与 SWE-bench 测试孤立代码补丁不同，Terminal-Bench 评估 Agent 在完整终端环境中完成端到端任务的能力，包括模型训练、SSL 证书配置、数据管道搭建等。支持 Claude Code、Codex CLI、OpenHands 等主流 Agent。v3.0 开发中 [[arXiv:2601.11868]](https://arxiv.org/abs/2601.11868)。

### E.2.5 MLE-bench

| 属性 | 值 |
|------|-----|
| 发布 | OpenAI, 2024 |
| 规模 | 75 个 Kaggle ML 竞赛 |
| 能力 | 模型训练、数据准备、特征工程、实验运行 |
| 指标 | % 获得奖牌（Bronze+） |
| 当前 SOTA | **~34%** medal rate [[MLE-bench Leaderboard]](https://github.com/openai/mle-bench) |
| 特点 | 以 Kaggle 人类排行榜为基线 |

> MLE-bench 测试 AI Agent 自主完成 ML 工程全流程的能力。最初 o1-preview + AIDE 达 16.9% 奖牌率，2026 年初最佳系统（NEO）已达约 34% [[ICLR 2025]](https://iclr.cc/virtual/2025/poster/30860)。

## E.3 Web 交互评测

### E.3.1 WebArena

| 属性 | 值 |
|------|-----|
| 发布 | CMU, 2023 |
| 规模 | 812 个任务 |
| 环境 | 4 个真实网站（电商、论坛、CMS、地图）|
| 能力 | 网页导航、表单填写、信息提取 |
| 指标 | 任务成功率 |
| 当前 SOTA | **~71.6%** [[OpAgent, 2026]](https://arxiv.org/abs/2602.13559) |

> 从 2023 年首发时约 14% 到 2026 年初 ~72%，WebArena 上的进步极为迅速。

### E.3.2 WebArena Verified

| 属性 | 值 |
|------|-----|
| 发布 | CMU, 2025 |
| 规模 | WebArena 的人工验证子集 |
| 改进 | 重新验证评估脚本，减少 11.3pp 的假阴性率 |
| 指标 | 任务成功率 |
| 特点 | 更准确的评分流水线，减少因评估错误导致的分数低估 |

> WebArena Verified 通过人工审核去除了原始评估中的错误，提供了更可靠的 Agent web 交互能力度量 [[OpenReview]](https://openreview.net/pdf?id=CSIo4D7xBG)。

### E.3.3 BrowseComp

| 属性 | 值 |
|------|-----|
| 发布 | OpenAI, 2025 |
| 规模 | 1,266 个问题 |
| 能力 | 深度网页浏览、多跳推理、信息聚合 |
| 指标 | 准确率 (Exact Match) |
| 特点 | 需要长时间多步搜索，测试持久导航能力 |
| 当前 SOTA | **~51.5%**（Deep Research 系统），基础浏览模型仅 1.9% [[OpenAI]](https://openai.com/index/browsecomp/) |

> BrowseComp 要求 Agent 在多个网站间持续导航、重构查询、综合事实，远超简单搜索能力。基础 GPT-4o + 浏览仅 1.9%，而专门的 Deep Research 系统可达 51.5%，揭示了"有搜索工具"和"会搜索"之间的巨大差距。后续扩展包括 BrowseComp-Plus（固定语料库版本）和 MM-BrowseComp（多模态版本）[[Galileo AI]](https://galileo.ai/blog/what-is-browsecomp-openai-benchmark-web-browsing-agents)。

## E.4 客户服务评测

### E.4.1 τ-bench (Tau-bench)

| 属性 | 值 |
|------|-----|
| 发布 | Sierra, 2024 |
| 场景 | 航空公司、零售 |
| 能力 | 多轮对话、政策遵守、工具使用 |
| 指标 | 任务成功率 × 政策合规率 |
| 特点 | 用 LLM 模拟动态用户，测试 Agent 在严格政策约束下的交互能力 |

> τ-bench 是首个系统性评测 Tool-Agent-User 三方交互的基准。每个任务模拟一个客服场景，Agent 需在 JSON 数据库上使用 Python API 工具，同时严格遵守领域政策。后续推出 τ²-bench 进一步测试"双控"场景——Agent 需协调、引导用户共同完成任务 [[Sierra]](https://sierra.ai/resources/research/tau-bench) [[arXiv:2406.12045]](https://arxiv.org/abs/2406.12045)。

## E.5 安全评测

### E.5.1 InjectBench

| 属性 | 值 |
|------|-----|
| 类型 | Prompt Injection 防御评测 |
| 攻击类型 | Direct / Indirect injection |
| 指标 | 攻击成功率、防御准确率 |

### E.5.2 AgentHarm

| 属性 | 值 |
|------|-----|
| 类型 | Agent 有害行为评测 |
| 场景 | 380 种有害指令 |
| 指标 | 拒绝率、有害完成率 |

## E.6 评测实践建议

### E.6.1 自建评测集指南

1. **明确评测目标**：选择与业务最相关的能力维度
2. **收集真实数据**：从实际用户交互中采样
3. **设计评分标准**：结合自动指标和人工评审
4. **保持评测集活性**：定期更新防止过拟合
5. **建立基线**：先测人类表现，再测 Agent

### E.6.2 评测指标体系

| 层次 | 指标 | 说明 |
|------|------|------|
| 基础 | 任务成功率 | Agent 完成任务的比例 |
| 效率 | 步骤数/Token 数 | 完成任务的资源消耗 |
| 质量 | LLM-as-Judge 评分 | 输出质量的细粒度评估 |
| 安全 | 拒绝率/泄露率 | 安全防护的有效性 |
| 用户 | 满意度/NPS | 终端用户体验评估 |

### E.6.3 基准饱和与演进趋势

截至 2026 年 3 月，多个早期基准已接近或达到饱和：

| 基准 | 状态 | 说明 |
|------|------|------|
| HumanEval | **已饱和** | 多模型 pass@1 > 95%，区分度极低 |
| SWE-bench Verified | **接近饱和** | 顶级系统 ~79%，存在数据污染争议 |
| GAIA Level 1 | **接近饱和** | 最强系统 ~89%，接近人类基线 92% |
| WebArena | **快速进展中** | 两年内从 14% 升至 72% |
| SWE-bench Pro | **活跃挑战** | 顶级系统仅 ~46%，设计为长期基准 |
| BrowseComp | **活跃挑战** | 专业系统 ~51%，基础模型 < 2% |
| Terminal-Bench | **活跃挑战** | Hard 任务 <50%，v3.0 开发中 |

社区趋势是不断推出更难、更真实、更不易被污染的基准来替代饱和的旧基准。
