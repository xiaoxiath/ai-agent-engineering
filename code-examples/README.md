# 代码示例

本目录包含《AI Agent 工程》全书的配套代码示例。

## 这份代码仓的定位

请先明确一个预期：本目录的目标不是为每一章提供同等完整度的“生产级项目”，而是提供三类支持：

1. **关键概念的最小实现**：帮助读者理解正文中的核心抽象
2. **工程模式的参考骨架**：为进一步扩展提供起点
3. **章节之间的共享基础设施**：减少重复定义，提高阅读连贯性

因此，这里的示例按成熟度分为：

- **可运行示例**：可直接执行，适合快速上手
- **参考骨架**：展示目录、接口和关键组件，适合作为扩展起点
- **占位目录**：用于对齐章节结构，后续逐步补齐

详细对照请见：[代码示例成熟度矩阵](../CODE_EXAMPLE_MATRIX.md)

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

## 当前目录结构

```
code-examples/
├── shared/                         # 全书共享类型与工具函数（附录 G）
├── 01-basic-agent-loop.ts          # 可运行：基本 Agent 循环
├── 02-state-management.ts          # 可运行：Reducer 模式状态管理
├── 03-context-engineering.ts       # 可运行：上下文工程
├── 04-tool-system.ts               # 可运行：工具系统与 ACI 设计
├── 05-multi-agent-orchestration.ts # 可运行：多 Agent 编排最小示例
├── 06-mcp-server.ts                # 可运行：MCP 服务端最小实现
│
├── ch07-memory/                    # 参考骨架：第 7 章
├── ch08-rag/                       # 参考骨架：第 8 章
├── ch11-framework-comparison/      # 占位目录：第 11 章
├── ch12-threat-model/              # 占位目录：第 12 章
├── ch13-prompt-injection/          # 占位目录：第 13 章
├── ch14-trust-architecture/        # 占位目录：第 14 章
├── ch15-evaluation/                # 占位目录：第 15 章
├── ch16-benchmarks/                # 占位目录：第 16 章
├── ch17-observability/             # 占位目录：第 17 章
├── ch18-deployment/                # 占位目录：第 18 章
├── ch19-cost-engineering/          # 占位目录：第 19 章
├── ch20-protocols/                 # 占位目录：第 20 章
├── ch21-ecosystem/                 # 占位目录：第 21 章
├── ch22-agent-experience/          # 占位目录：第 22 章
├── ch23-coding-assistant/          # 占位目录：第 23 章
├── ch24-customer-service/          # 占位目录：第 24 章
├── ch25-data-analysis/             # 占位目录：第 25 章
│
├── package.json
├── tsconfig.json
└── README.md
```

## shared/ — 共享模块

`shared/` 目录对应附录 G《共享类型与工具函数参考》，提取了全书代码示例中反复引用的公共定义：

| 文件 | 内容 | 角色 |
|------|------|------|
| `types.ts` | Message、ToolDefinition、ToolCall、ToolResult、AgentState 等 | 基础类型定义 |
| `utils.ts` | estimateTokens()、cosineSimilarity()、SemanticCache 等 | 常用工具函数 |
| `llm-client.ts` | LLMClient 接口、LLMResponse、MockLLMClient | 模型调用抽象 |
| `embedding.ts` | EmbeddingService 接口、MockEmbeddingService | 向量与嵌入抽象 |
| `index.ts` | 统一重导出 | 供各章节复用 |

## 使用建议

- 如果你是第一次阅读本书，优先运行 `01` 到 `06` 六个核心示例。
- 如果你在跟读对应章节，请先查看 [代码示例成熟度矩阵](../CODE_EXAMPLE_MATRIX.md)，确认该章节当前属于“可运行示例”还是“参考骨架”。
- 如果你准备贡献代码，请优先补齐 P0 / P1 章节的最小可运行实现。
