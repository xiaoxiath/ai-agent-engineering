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

### C.3.1 协议概述

- **发起者**: IBM (2025)
- **目的**: 企业级 Agent 异步协作
- **特点**: 原生支持多轮对话和人工介入

### C.3.2 与 A2A 的差异

| 特性 | A2A | ACP |
|------|-----|-----|
| 多轮交互 | 通过 input-required | 原生支持 |
| 人工干预 | 未定义 | 内置 HITL |
| 消息格式 | 自定义 JSON | MIME multipart |
| 发现机制 | Agent Card | 服务注册 |
| 适用场景 | 通用协作 | 企业工作流 |

## C.4 协议互操作

### C.4.1 三协议集成模式

```
MCP: Agent ←→ Tools (工具连接层)
A2A: Agent ←→ Agent (对等协作层)
ACP: Agent ←→ Enterprise (企业集成层)

推荐架构:
┌─────────────────────────────┐
│        Agent Core           │
│  ┌───────┐ ┌────┐ ┌────┐  │
│  │  MCP  │ │ A2A│ │ACP │  │
│  │Client │ │Peer│ │Node│  │
│  └───────┘ └────┘ └────┘  │
└─────────────────────────────┘
```
