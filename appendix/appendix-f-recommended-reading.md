# 附录 F：推荐阅读与资源

## F.1 必读论文

### F.1.1 基础理论

| 论文 | 作者/机构 | 年份 | 核心贡献 |
|------|----------|------|---------|
| Attention Is All You Need | Google | 2017 | Transformer 架构 |
| ReAct: Synergizing Reasoning and Acting | Yao et al. | 2022 | ReAct 推理范式 |
| Reflexion: Language Agents with Verbal Reinforcement | Shinn et al. | 2023 | Agent 自我反思 |
| Toolformer: Language Models Can Teach Themselves to Use Tools | Schick et al. | 2023 | LLM 自主学习工具使用 |
| Chain-of-Thought Prompting Elicits Reasoning | Wei et al. | 2022 | 思维链推理 |

### F.1.2 Agent 系统

| 论文 | 作者/机构 | 年份 | 核心贡献 |
|------|----------|------|---------|
| A Survey on Large Language Model based Autonomous Agents | Wang et al. | 2023 | Agent 综述 |
| AutoGen: Enabling Next-Gen LLM Applications | Wu et al. (Microsoft) | 2023 | Multi-Agent 对话框架 |
| Voyager: An Open-Ended Embodied Agent | Fan et al. | 2023 | 持续学习的游戏 Agent |
| SWE-agent: Agent-Computer Interfaces | Yang et al. | 2024 | ACI 设计原则 |
| τ-bench: A Benchmark for Tool-Agent-User Interaction | Sierra | 2024 | Agent 评测方法 |

### F.1.3 安全与对齐

| 论文 | 作者/机构 | 年份 | 核心贡献 |
|------|----------|------|---------|
| Not what you've signed up for: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection | Greshake et al. | 2023 | 间接 Prompt 注入 |
| OWASP Top 10 for LLM & Agentic Applications | OWASP | 2025 | Agent 安全威胁分类 |

## F.2 重要博客文章

### F.2.1 工程实践

| 文章 | 作者 | 关键内容 |
|------|------|---------|
| Building effective agents | Anthropic | Agent 设计模式 |
| Context Engineering | Toby Lutke / Anthropic | 上下文工程方法论 |
| Multi-agent systems | Andrew Ng / Anthropic | 多 Agent 编排 |
| How to Build an Agent | OpenAI | Agent 开发指南 |
| The Bitter Lesson | Rich Sutton | 计算优先的 AI 哲学 |

## F.3 开源项目

### F.3.1 框架

| 项目 | 语言 | Stars | 特点 |
|------|------|-------|------|
| LangGraph | Python/TS | 10k+ | 灵活的状态图编排 |
| Google ADK | Python | 5k+ | Google 生态集成 |
| CrewAI | Python | 25k+ | 角色扮演式协作 |
| AutoGen | Python | 35k+ | 微软多 Agent 对话 |
| Mastra | TypeScript | 10k+ | TS 原生 Agent 框架 |

### F.3.2 工具与基础设施

| 项目 | 用途 | 特点 |
|------|------|------|
| MCP Servers | 工具连接 | 官方 + 社区 MCP 服务 |
| LangSmith | 可观测性 | 追踪、评估、调试 |
| Qdrant | 向量数据库 | 高性能相似搜索 |
| OpenTelemetry GenAI | 追踪标准 | AI 系统可观测性 |

## F.4 学习路线推荐

### F.4.1 入门路线（1-2 个月）

```
Week 1-2: LLM 基础
  ├── 阅读 Transformer 论文
  ├── 使用 OpenAI/Anthropic API
  └── 完成本书第1-2章

Week 3-4: Agent 基础
  ├── 实现基本 Agent Loop（本书第3章）
  ├── 学习 ReAct 范式
  └── 使用一个 Agent 框架（推荐 ADK/LangGraph）

Week 5-6: 工具与记忆
  ├── 实现 MCP Server（本书第6章）
  ├── 构建 RAG 系统（本书第8章）
  └── 完成一个端到端项目

Week 7-8: 进阶
  ├── Multi-Agent 编排（本书第9-10章）
  ├── 安全与评估（本书第12-16章）
  └── 部署一个生产级 Agent
```

### F.4.2 进阶路线（3-6 个月）

```
Month 1: 深入架构
  ├── 状态管理与 Context Engineering
  ├── 高级工具系统设计
  └── 自定义评测框架

Month 2: 生产工程
  ├── 可观测性体系建设
  ├── 成本优化实践
  └── 安全防护深入

Month 3+: 前沿探索
  ├── 推理模型与 Agent
  ├── Agent 协议生态
  └── 行业案例深入研究
```

## F.5 社区与会议

### F.5.1 技术社区

| 社区 | 平台 | 关注点 |
|------|------|--------|
| LangChain Community | Discord | LangGraph 开发 |
| Anthropic Community | Discord | Claude & MCP |
| AI Agent Dev | Reddit | 综合讨论 |
| Agent Protocol | GitHub | 协议标准化 |

### F.5.2 重要会议

| 会议 | 周期 | 关注 Agent 的 Track |
|------|------|-------------------|
| NeurIPS | 年度 | Agent Learning |
| ICML | 年度 | LLM & Planning |
| ACL | 年度 | Tool Use & Interaction |
| AI Engineer Summit | 半年度 | Agent Engineering |
