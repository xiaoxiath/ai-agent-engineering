# 代码示例

本目录包含《AI Agent 工程化实战》全书的可运行代码示例。

## 环境要求

- Node.js >= 18.0
- TypeScript >= 5.0
- pnpm >= 8.0

## 快速开始

```bash
# 安装依赖
pnpm install

# 配置 API Key（运行 Mock 示例可跳过）
cp .env.example .env
# 编辑 .env 填入你的 API Key

# 运行示例
pnpm tsx 01-basic-agent-loop.ts
```

## 目录结构

```
code-examples/
├── shared/                         # 全书共享类型与工具函数（附录 G）
│   ├── index.ts                    #   统一导出入口
│   ├── types.ts                    #   核心类型：Message, AgentState, AgentEvent,
│   │                               #     ToolDefinition, ToolCall, ToolResult,
│   │                               #     Registry<T>, SemanticCacheConfig 等
│   ├── utils.ts                    #   工具函数：estimateTokens, cosineSimilarity,
│   │                               #     SemanticCache<T>
│   ├── llm-client.ts               #   LLMClient 接口 + MockLLMClient
│   └── embedding.ts                #   EmbeddingService 接口 + MockEmbeddingService
│
├── 01-basic-agent-loop.ts          # 第 3 章 — 基本 Agent 循环
├── 02-state-management.ts          # 第 4 章 — Reducer 模式状态管理
├── 03-context-engineering.ts       # 第 5 章 — 上下文工程
├── 04-tool-system.ts               # 第 6 章 — 工具系统与 ACI 设计
├── 05-multi-agent-orchestration.ts # 第 9-10 章 — 多 Agent 编排
├── 06-mcp-server.ts                # 第 20 章 — MCP 服务端实现
│
├── ch07-memory/                    # 第 7 章 — 记忆架构（待迁移）
├── ch08-rag/                       # 第 8 章 — RAG 与知识工程（待迁移）
├── ch11-framework-comparison/      # 第 11 章 — 框架对比（待迁移）
├── ch12-threat-model/              # 第 12 章 — 威胁模型（待迁移）
├── ch13-prompt-injection/          # 第 13 章 — Prompt 注入防御（待迁移）
├── ch14-trust-architecture/        # 第 14 章 — 信任架构（待迁移）
├── ch15-evaluation/                # 第 15 章 — 评估体系（待迁移）
├── ch16-benchmarks/                # 第 16 章 — 基准测试（待迁移）
├── ch17-observability/             # 第 17 章 — 可观测性（待迁移）
├── ch18-deployment/                # 第 18 章 — 部署与运维（待迁移）
├── ch19-cost-engineering/          # 第 19 章 — 成本工程（待迁移）
├── ch20-protocols/                 # 第 20 章 — 协议与互操作（待迁移）
├── ch21-ecosystem/                 # 第 21 章 — 生态系统与平台（待迁移）
├── ch22-agent-experience/          # 第 22 章 — Agent 体验设计（待迁移）
├── ch23-coding-assistant/          # 第 23 章 — 编程助手案例（待迁移）
├── ch24-customer-service/          # 第 24 章 — 企业客服案例（待迁移）
├── ch25-data-analysis/             # 第 25 章 — 数据分析 Agent 案例（待迁移）
│
├── package.json
├── tsconfig.json
└── README.md
```

## shared/ — 共享模块

`shared/` 目录对应附录 G《共享类型与工具函数参考》，提取了全书代码示例中反复引用的公共定义：

| 文件 | 附录章节 | 内容 |
|------|---------|------|
| `types.ts` | G.2-G.3 | Message, ToolDefinition, ToolCall, ToolResult, AgentState, AgentEvent, Registry\<T\>, SemanticCacheConfig 等 |
| `utils.ts` | G.1, G.3.2 | estimateTokens(), cosineSimilarity(), SemanticCache\<T\> |
| `llm-client.ts` | G.2.1 | LLMClient 接口, LLMResponse, MockLLMClient |
| `embedding.ts` | G.1.3 | EmbeddingService 接口, MockEmbeddingService |
| `index.ts` | — | 统一重导出，供各章节 `import { ... } from '../shared'` |

### 使用方式

各章节代码通过统一入口导入所需类型和工具函数：

```typescript
import {
  estimateTokens,
  cosineSimilarity,
  type Message,
  type AgentState,
  type ToolDefinition,
  type LLMClient,
  MockLLMClient,
  MockEmbeddingService,
  Registry,
  SemanticCache,
} from '../shared';
```

## 示例列表

| 文件 | 对应章节 | 说明 |
|------|---------|------|
| `01-basic-agent-loop.ts` | 第 3 章 | 基本 Agent 循环 (ReAct Loop) |
| `02-state-management.ts` | 第 4 章 | Reducer 模式状态管理 + 事件溯源 |
| `03-context-engineering.ts` | 第 5 章 | 上下文窗口管理、Context Rot 检测、NOTES.md 模式 |
| `04-tool-system.ts` | 第 6 章 | 工具系统 ACI 设计、Poka-Yoke 防错 |
| `05-multi-agent-orchestration.ts` | 第 9-10 章 | Coordinator / Pipeline / Fan-Out Gather 模式 |
| `06-mcp-server.ts` | 第 20 章 | MCP 服务端简化实现 |

## 待迁移章节

以下章节的代码目前嵌入在正文 Markdown 中，将在后续重构中提取为独立可运行示例：

- 第 7 章（记忆架构）、第 8 章（RAG）
- 第 11 章（框架对比）
- 第 12-14 章（安全与信任）
- 第 15-16 章（评估与基准）
- 第 17-19 章（生产运维与成本）
- 第 20-21 章（协议与生态）
- 第 22 章（Agent 体验）
- 第 23-25 章（行业案例）

## 注意事项

- 运行 Mock 示例无需 API Key；运行真实 LLM 调用的示例需要有效的 API Key
- 部分示例会消耗 API 额度，请注意用量
- 代码主要用于演示架构概念，生产环境需要额外加固
- 所有共享类型均为零外部依赖的纯 TypeScript 定义，可在任何 Node.js 18+ 运行时中使用
