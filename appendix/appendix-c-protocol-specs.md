# 附录 C：Agent 协议规范速查

## C.1 MCP (Model Context Protocol)

### C.1.1 协议概述

- **发起者**: Anthropic (2024.11 开源)
- **目的**: 标准化 LLM 与外部工具/数据的连接
- **传输层**: stdio / HTTP+SSE / Streamable HTTP
- **消息格式**: JSON-RPC 2.0

### C.1.2 核心概念

| 概念 | 描述 | 示例 |
|------|------|------|
| Tool | 可调用的函数 | `search`, `read_file` |
| Resource | 可读取的数据源 | `file://path`, `db://table` |
| Prompt | 预定义的提示模板 | `summarize`, `translate` |
| Sampling | 服务端请求 LLM 推理 | 递归 Agent 调用 |

### C.1.3 消息流

```
Client (Host/LLM)          Server (Tool Provider)
       │                          │
       │── initialize ──────────→ │
       │←── capabilities ─────── │
       │                          │
       │── tools/list ──────────→ │
       │←── tool definitions ──── │
       │                          │
       │── tools/call ──────────→ │
       │←── result ───────────── │
       │                          │
       │── resources/read ──────→ │
       │←── resource content ──── │
```

## C.2 A2A (Agent-to-Agent Protocol)

### C.2.1 协议概述

- **发起者**: Google (2025.04)
- **目的**: Agent 之间的发现和协作
- **传输层**: HTTP/HTTPS
- **消息格式**: JSON

### C.2.2 核心概念

| 概念 | 描述 |
|------|------|
| Agent Card | Agent 能力描述 (/.well-known/agent.json) |
| Task | 协作单元，有完整的生命周期 |
| Message | Agent 之间的通信 |
| Artifact | 任务产出物 |
| Push Notification | 异步状态更新 |

### C.2.3 Task 生命周期

```
submitted → working → completed
                  ↘ → failed
                  ↘ → input-required → working → ...
                  ↘ → canceled
```

### C.2.4 Agent Card 示例

```json
{
  "name": "Data Analyst Agent",
  "description": "Analyzes data and generates insights",
  "url": "https://agent.example.com",
  "capabilities": {
    "streaming": true,
    "pushNotifications": true,
    "stateTransitionHistory": true
  },
  "skills": [
    {
      "id": "sql-analysis",
      "name": "SQL Data Analysis",
      "description": "Convert natural language to SQL and analyze results"
    }
  ],
  "authentication": {
    "schemes": ["Bearer"]
  }
}
```

## C.3 ACP (Agent Communication Protocol)

> **历史说明**：ACP 最初由 IBM 于 2025 年发起，作为独立的企业级 Agent 通信协议。2025 年 8 月，ACP 正式合并入 A2A 协议，其核心特性（多轮对话支持、人工介入机制）被整合进 A2A 规范。以下内容保留作为历史参考。

### C.3.1 协议概述（历史）

- **发起者**: IBM (2025)
- **目的**: 企业级 Agent 异步协作
- **特点**: 原生支持多轮对话和人工介入
- **当前状态**: 已于 2025 年 8 月合并入 A2A 协议

### C.3.2 与 A2A 的关系

ACP 的核心设计理念已融入 A2A 协议。原 ACP 特有功能在 A2A 中的对应关系：

| ACP 原有特性 | A2A 中的实现 |
|-------------|-------------|
| 多轮交互 | A2A Tasks 的 input-required 状态 |
| 人工干预（HITL） | A2A 任务状态机 + 外部回调 |
| MIME multipart 消息 | A2A Parts（TextPart / FilePart / DataPart） |
| 服务注册与发现 | A2A Agent Card |

## C.4 协议互操作

### C.4.1 双协议集成模式

```
MCP: Agent ←→ Tools (工具连接层)
A2A: Agent ←→ Agent (对等协作层，含原 ACP 企业特性)

推荐架构:
┌─────────────────────────────┐
│        Agent Core           │
│  ┌───────┐ ┌────┐          │
│  │  MCP  │ │ A2A│          │
│  │Client │ │Peer│          │
│  └───────┘ └────┘          │
└─────────────────────────────┘
```
