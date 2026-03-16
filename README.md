# 《AI Agent 工程：从架构设计到生产实践》

> **AI Agent Engineering: From Architecture Design to Production Practice**

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
[![TypeScript](https://img.shields.io/badge/Code-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Code-Python-yellow.svg)](https://www.python.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

一本面向 AI Agent 开发者的系统性工程指南，全书共 **11 部分 28 章**，涵盖架构设计、Context Engineering、Skill 工程、Multi-Agent 编排、安全防御、评估体系、生产部署到前沿趋势的完整知识体系。

## 为什么写这本书

2024-2025 年，AI Agent 从实验室走向生产环境。然而，大多数开发者面临的困境是：

- **碎片化知识**：架构模式散落在各框架文档中，缺乏统一视角
- **理论与实践脱节**：论文讲 Multi-Agent 协作，但没人告诉你 session.state 怎么设计
- **工程经验匮乏**：如何控制成本？如何做可观测性？如何防御 Prompt 注入？

这本书试图填补这个空白——用工程师的语言，把 AI Agent 开发的完整知识体系串联起来。

## 适合谁读

- **AI 应用开发者**：想从 Chatbot 进阶到 Agent 系统
- **技术架构师**：需要为团队选型 Agent 框架并设计架构
- **产品经理**：想理解 Agent 的能力边界与设计约束
- **对 AI Agent 感兴趣的任何人**：想建立系统性认知

## 技术栈

全书以 **TypeScript** 为主要示例语言（附 **Python** 等价实现），涉及的主要框架和工具：

- **Agent 框架**：Google ADK、LangGraph、CrewAI、AutoGen、OpenAI Agents SDK、Mastra、Vercel AI SDK v5
- **协议标准**：MCP（Model Context Protocol）、A2A（Agent2Agent）、ANP（Agent Network Protocol）、ACP
- **主流模型**：GPT-5、Claude Opus 4.6 / Sonnet 4.6、Gemini 3 Pro、DeepSeek-V3.2 / R1、Llama 4
- **可观测性**：OpenTelemetry、LangSmith、Langfuse
- **评估工具**：DeepEval、Arize、GAIA、SWE-bench

## 目录结构

```
ai-agent-engineering/
├── README.md                          # 本文件
├── LICENSE                            # CC BY-NC-SA 4.0
├── CONTRIBUTING.md                    # 贡献指南
├── SUMMARY.md                         # 完整目录
├── chapters/
│   ├── part-01-foundation/            # 第一部分：基础与愿景
│   │   ├── ch01-age-of-agents.md
│   │   └── ch02-theoretical-foundations.md
│   ├── part-02-core-architecture/     # 第二部分：核心架构设计
│   │   ├── ch03-architecture-overview.md
│   │   ├── ch04-state-management.md
│   │   ├── ch05-context-engineering.md
│   │   ├── ch06-tool-system-design.md
│   │   └── ch06.5-skill-engineering.md
│   ├── part-03-memory-knowledge/      # 第三部分：记忆与知识
│   │   ├── ch07-memory-architecture.md
│   │   └── ch08-rag-knowledge-engineering.md
│   ├── part-04-multi-agent/           # 第四部分：Multi-Agent 系统
│   │   ├── ch09-multi-agent-fundamentals.md
│   │   ├── ch10-orchestration-patterns.md
│   │   └── ch11-framework-comparison.md
│   ├── part-05-security-trust/        # 第五部分：安全与信任
│   │   ├── ch12-threat-model.md
│   │   ├── ch13-prompt-injection-defense.md
│   │   └── ch14-trust-architecture.md
│   ├── part-06-evaluation/            # 第六部分：评估与质量
│   │   ├── ch15-evaluation-system.md
│   │   └── ch16-benchmarks.md
│   ├── part-07-production/            # 第七部分：生产部署
│   │   ├── ch17-observability.md
│   │   ├── ch18-deployment-operations.md
│   │   └── ch19-cost-engineering.md
│   ├── part-08-interoperability/      # 第八部分：互操作与生态
│   │   ├── ch20-protocols.md
│   │   └── ch21-ecosystem-platforms.md
│   ├── part-09-user-experience/       # 第九部分：用户体验
│   │   └── ch22-agent-experience-design.md
│   ├── part-10-case-studies/          # 第十部分：实战案例
│   │   ├── ch23-coding-assistant.md
│   │   ├── ch24-enterprise-customer-service.md
│   │   └── ch25-data-analysis-agent.md
│   └── part-11-future/               # 第十一部分：前沿与展望
│       ├── ch26-frontier-trends.md
│       └── ch27-responsible-development.md
├── appendix/
│   ├── appendix-a-dev-environment.md
│   ├── appendix-b-framework-api-reference.md
│   ├── appendix-c-protocol-specs.md
│   ├── appendix-d-owasp-checklist.md
│   ├── appendix-e-benchmark-catalog.md
│   ├── appendix-f-recommended-reading.md
│   └── appendix-g-python-equivalents.md
└── code-examples/
    ├── ch03-control-loop/
    │   └── agent-loop.ts
    ├── ch04-state-management/
    │   └── reducer-pattern.ts
    ├── ch05-context-engineering/
    │   ├── system-prompt-design.ts
    │   ├── compaction.ts
    │   ├── structured-notes.ts
    │   └── sub-agent-isolation.ts
    ├── ch06-tool-system/
    │   ├── tool-design.ts
    │   └── response-format.ts
    ├── ch06.5-skill-engineering/
    │   └── skill-patterns.ts
    ├── ch09-multi-agent/
    │   ├── sequential-agent.ts
    │   ├── parallel-agent.ts
    │   ├── loop-agent.ts
    │   └── agent-tool.ts
    └── ch10-orchestration/
        └── content-pipeline.ts
```

## 快速开始

### 在线阅读

直接浏览 `chapters/` 目录下的 Markdown 文件即可开始阅读。建议从 [SUMMARY.md](SUMMARY.md) 开始。

### 运行代码示例

```bash
# 安装依赖
cd code-examples
npm install

# 运行特定章节的代码示例
npx ts-node ch03-control-loop/agent-loop.ts

# 运行 Python 等价示例
python ch03-control-loop/agent_loop.py
```

## 参与贡献

我们非常欢迎社区贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详情。

贡献方式包括但不限于：
- 📝 修正错误或补充内容
- 💻 增加代码示例
- 🌐 翻译为其他语言
- 📊 补充案例研究
- 🔗 更新参考链接

## 致谢

本书的知识体系受到以下工作的深刻影响：

- Anthropic 的 Context Engineering 与 Agent Design 系列文章
- Google ADK（Agent Development Kit）文档与设计理念
- OWASP Agentic Application Security Top 10
- OpenTelemetry AI Agent 语义约定
- 以及无数开源 Agent 框架贡献者

## 许可证

本书采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 许可证。

代码示例采用 [MIT License](https://opensource.org/licenses/MIT)。

---

> *"The best way to predict the future of AI Agents is to engineer it."*
