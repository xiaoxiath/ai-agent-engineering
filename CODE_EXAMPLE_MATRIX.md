# 代码示例成熟度矩阵

本文件用于明确“章节—代码示例—成熟度”的映射关系，避免正文阅读预期与代码现实之间出现偏差。

## 成熟度定义

| 标记 | 含义 | 说明 |
|---|---|---|
| **R** | Runnable | 可运行示例，适合快速上手 |
| **S** | Skeleton | 参考骨架，展示接口、结构或目录，适合继续扩展 |
| **P** | Placeholder | 占位目录或说明文件，当前仅用于结构对齐 |

## 章节映射

| 章节 | 主题 | 路径 | 成熟度 | 备注 |
|---|---|---|---|---|
| 第 3 章 | 基本 Agent 循环 | `code-examples/01-basic-agent-loop.ts` | **R** | 最小运行入口 |
| 第 4 章 | 状态管理 | `code-examples/02-state-management.ts` | **R** | Reducer 模式示例 |
| 第 5 章 | Context Engineering | `code-examples/03-context-engineering.ts` | **R** | 上下文构建与注入 |
| 第 6 章 | 工具系统 | `code-examples/04-tool-system.ts` | **R** | Tool / ACI 最小实现 |
| 第 9-10 章 | Multi-Agent 编排 | `code-examples/05-multi-agent-orchestration.ts` | **R** | 多 Agent 最小演示 |
| 第 20 章 | MCP Server | `code-examples/06-mcp-server.ts` | **R** | 协议最小实现 |
| 第 7 章 | 记忆架构 | `code-examples/ch07-memory/` | **S** | 需继续补齐 runnable path |
| 第 8 章 | RAG | `code-examples/ch08-rag/` | **S** | 建议优先补齐 |
| 第 11 章 | 框架对比 | `code-examples/ch11-framework-comparison/` | **P** | 索引/占位 |
| 第 12 章 | 威胁模型 | `code-examples/ch12-threat-model/` | **P** | 索引/占位 |
| 第 13 章 | Prompt 注入防御 | `code-examples/ch13-prompt-injection/` | **P** | 索引/占位 |
| 第 14 章 | 信任架构 | `code-examples/ch14-trust-architecture/` | **P** | 索引/占位 |
| 第 15 章 | 评估体系 | `code-examples/ch15-evaluation/` | **P** | 建议优先补齐最小 eval harness |
| 第 16 章 | 基准测试 | `code-examples/ch16-benchmarks/` | **P** | 索引/占位 |
| 第 17 章 | 可观测性 | `code-examples/ch17-observability/` | **P** | 建议补齐最小 tracing 示例 |
| 第 18 章 | 部署与运维 | `code-examples/ch18-deployment/` | **P** | 建议补齐最小部署骨架 |
| 第 19 章 | 成本工程 | `code-examples/ch19-cost-engineering/` | **P** | 索引/占位 |
| 第 21 章 | 生态与平台 | `code-examples/ch21-ecosystem/` | **P** | 索引/占位 |
| 第 22 章 | AX 设计 | `code-examples/ch22-agent-experience/` | **P** | 索引/占位 |
| 第 23 章 | 编码助手 | `code-examples/ch23-coding-assistant/` | **P** | 可逐步演进为综合案例 |
| 第 24 章 | 企业客服 | `code-examples/ch24-customer-service/` | **P** | 可逐步演进为综合案例 |
| 第 25 章 | 数据分析 Agent | `code-examples/ch25-data-analysis/` | **P** | 可逐步演进为综合案例 |

## 使用规则

1. 正文引用代码路径时，应优先引用 **R** 和 **S** 状态的目录。
2. 如果引用 **P** 状态目录，正文措辞应使用“参考目录”或“后续补齐”，不要使用“完整实现见...”。
3. 发布前，应至少保证 P0 章节具备稳定的 **R** 或 **S** 映射关系。
