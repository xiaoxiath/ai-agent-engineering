# 《AI Agent 工程：从架构设计到生产实践》

> **AI Agent Engineering: From Architecture Design to Production Practice**

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
[![TypeScript](https://img.shields.io/badge/Code-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Code-Python-yellow.svg)](https://www.python.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

一本面向 AI Agent 开发者的系统性工程指南。全书当前按 **11 个部分**组织，覆盖基础认知、核心架构、Context Engineering、工具与 Skill、记忆与知识、多 Agent、安全防御、评估体系、生产部署、互操作协议、用户体验、案例与前沿趋势。

## 本项目当前定位

本仓库当前更适合作为一部**持续迭代的开源工程书稿（living book）**，而不是一次性定稿的静态教材。阅读与使用时，建议将其理解为：

1. **以工程方法论为主线**：重点讨论 AI Agent 作为软件系统时的设计、实现、评估与运维问题。
2. **以正文为主、代码为辅**：正文提供知识结构与设计原则；代码示例用于演示关键实现路径，而非为每一章提供同等完整度的可运行项目。
3. **版本持续演进**：模型、框架、协议与平台变化较快，相关内容会以迭代方式持续更新。

## 为什么写这本书

2024-2026 年，AI Agent 从实验室走向生产环境。然而，大多数开发者面临的困境是：

- **碎片化知识**：架构模式散落在各框架文档、论文和博客中，缺乏统一视角
- **理论与实践脱节**：很多内容停留在概念介绍，缺少工程上的状态管理、评估、安全与运维方法
- **工程经验匮乏**：如何控制成本？如何做可观测性？如何防御 Prompt 注入？如何上线和回滚？

这本书尝试填补这个空白——用工程师的语言，把 AI Agent 开发的完整知识体系串联起来。

## 适合谁读

- **AI 应用开发者**：想从 Chatbot 进阶到 Agent 系统
- **技术架构师**：需要为团队选型 Agent 框架并设计系统架构
- **平台与基础设施工程师**：需要建设 Agent 的评估、观测、部署与成本治理能力
- **产品经理 / 技术管理者**：想理解 Agent 的能力边界、风险与设计约束

## 如何阅读本书

### 推荐阅读路径

| 路径 | 适合人群 | 建议章节 |
|---|---|---|
| **快速建立全局认知** | 第一次系统学习 Agent 工程的读者 | 第 1 章 → 第 3 章 → 第 5 章 → 第 6 章 → 第 15 章 |
| **工程实现主线** | 要落地真实 Agent 系统的开发者 | 第 3–8 章 → 第 12–19 章 |
| **生产化与平台化** | 关注安全、评估、部署、成本与观测的团队 | 第 12–19 章 |
| **高阶扩展与趋势** | 想补充协议、体验、案例和前沿的读者 | 第 20–27 章 |

### 章节优先级说明

为降低认知负担，建议按以下优先级使用本书：

- **P0 核心必读**：构成 Agent 工程主线的基础章节
- **P1 工程推荐**：与生产化直接相关的扩展章节
- **P2 主题选读**：特定主题或场景下重点阅读
- **P3 参考资料**：高时效性、索引型或附录型内容

## 技术栈

全书以 **TypeScript** 为主要示例语言（部分主题附 Python 等价说明），涉及的主要框架和工具包括：

- **Agent 框架**：Google ADK、LangGraph、CrewAI、AutoGen、OpenAI Agents SDK、Mastra、Vercel AI SDK
- **协议标准**：MCP（Model Context Protocol）、A2A（Agent2Agent）、ANP（Agent Network Protocol）等
- **可观测性**：OpenTelemetry、LangSmith、Langfuse
- **评估工具**：DeepEval、Arize、GAIA、SWE-bench

> 注：与模型版本、协议治理、平台格局有关的内容变化较快。阅读这些主题时，请优先结合章节中的“适用边界”“设计原则”和仓库后续更新，而不是将具体版本结论视为长期不变的事实。

## 目录结构

```
ai-agent-engineering/
├── README.md                          # 项目总览与阅读入口
├── SUMMARY.md                         # 完整目录与优先级标记
├── EDITORIAL_GUIDE.md                 # 出版级修订说明与阅读导航
├── CODE_EXAMPLE_MATRIX.md             # 章节—代码示例—成熟度对照表
├── chapters/                          # 正文章节
├── appendix/                          # 附录与术语表
├── code-examples/                     # 配套示例代码
├── CONTRIBUTING.md                    # 贡献指南
└── LICENSE                            # 许可证
```

## 本书的知识结构

全书建议按“**主干 / 扩展 / 案例 / 前沿**”四层理解：

1. **主干（P0）**：基础认知、架构、状态、上下文、工具、记忆、RAG、评估
2. **扩展（P1/P2）**：多 Agent、安全、信任、观测、部署、成本、协议、AX
3. **案例（P2）**：编码助手、企业客服、数据分析 Agent
4. **前沿（P3）**：趋势、责任开发、生态演化

## 代码示例说明

`code-examples/` 的职责是：

- 提供最核心章节的参考实现
- 支撑正文中的关键概念落地
- 为读者提供可继续扩展的工程骨架

它**不是**每一章都同等完整的工程化实现示例集合。为避免预期错位，仓库提供了专门的成熟度对照表：

- [代码示例成熟度矩阵](CODE_EXAMPLE_MATRIX.md)
- [代码示例说明](code-examples/README.md)

## 配套文档

- [完整目录](SUMMARY.md)
- [出版级修订与阅读说明](EDITORIAL_GUIDE.md)
- [代码示例成熟度矩阵](CODE_EXAMPLE_MATRIX.md)
- [附录 H：术语与结构说明](appendix/appendix-h-editorial-glossary.md)

## 贡献方式

欢迎通过 Issue / PR 提交：

- 技术错误修正
- 结构优化建议
- 代码示例补齐
- 章节重写与精炼
- 案例与实践经验补充

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。
