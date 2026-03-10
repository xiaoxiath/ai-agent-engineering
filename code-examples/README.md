# 代码示例

本目录包含《AI Agent 工程化实战》书中的可运行代码示例。

## 环境要求

- Node.js >= 18.0
- TypeScript >= 5.0
- pnpm >= 8.0

## 快速开始

```bash
# 安装依赖
pnpm install

# 配置 API Key
cp .env.example .env
# 编辑 .env 填入你的 API Key

# 运行示例
pnpm tsx 01-basic-agent-loop.ts
```

## 示例列表

| 文件 | 对应章节 | 说明 |
|------|---------|------|
| 01-basic-agent-loop.ts | 第3章 | 基本 Agent 循环实现 |
| 02-state-management.ts | 第4章 | Reducer 模式状态管理 |
| 03-context-engineering.ts | 第5章 | 上下文工程实践 |
| 04-tool-system.ts | 第6章 | 工具系统与 ACI 设计 |
| 05-multi-agent-orchestration.ts | 第9-10章 | 多 Agent 编排模式 |
| 06-mcp-server.ts | 第20章 | MCP 服务端实现 |

## 注意事项

- 运行示例需要有效的 LLM API Key
- 部分示例会消耗 API 额度，请注意用量
- 代码主要用于演示概念，生产环境需要额外加固
