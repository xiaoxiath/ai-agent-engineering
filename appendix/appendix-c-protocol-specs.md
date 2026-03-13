# 附录 C：Agent 协议规范速查

## C.1 MCP (Model Context Protocol)

### C.1.1 协议概述

- **发起者**: Anthropic (2024.11 开源)
- **目的**: 标准化 LLM 与外部工具/数据的连接
- **最新规范**: [[MCP Specification 2025-06-18]](https://modelcontextprotocol.io/specification/2025-06-18)
- **传输层**: Streamable HTTP（推荐） / stdio（本地进程）
- **消息格式**: JSON-RPC 2.0
- **授权框架**: OAuth 2.1

> **传输层演进说明**：2025-06-18 版本规范将 **Streamable HTTP** 确立为首选远程传输方式，取代了早期的 HTTP+SSE 传输。HTTP+SSE 已被标记为 legacy/deprecated，新实现应使用 Streamable HTTP。Streamable HTTP 在单一 HTTP 端点上同时支持请求-响应和服务端流式推送，简化了部署和代理兼容性。stdio 传输继续用于本地进程间通信场景。

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
- **治理**: 现由 [[Linux Foundation]](https://www.linuxfoundation.org/) 托管
- **仓库**: [[google-a2a/A2A]](https://github.com/google-a2a/A2A)

> **治理与合并说明**：A2A 协议已移交至 Linux Foundation 进行开放治理，以确保供应商中立的长期演进。此外，原由 IBM 发起的 ACP（Agent Communication Protocol）已正式合并入 A2A（见 C.3 节），其企业级多轮对话和人工介入等核心特性被纳入 A2A 规范。

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

> **历史说明**：ACP 最初由 IBM 于 2025 年发起，作为独立的企业级 Agent 通信协议。2025 年 8 月，ACP 正式合并入 A2A 协议（现由 Linux Foundation 治理），其核心特性（多轮对话支持、人工介入机制）被整合进 A2A 规范。以下内容保留作为历史参考。

### C.3.1 协议概述（历史）

- **发起者**: IBM (2025)
- **目的**: 企业级 Agent 异步协作
- **特点**: 原生支持多轮对话和人工介入
- **当前状态**: 已于 2025 年 8 月合并入 A2A 协议（Linux Foundation 治理）

### C.3.2 与 A2A 的关系

ACP 的核心设计理念已融入 A2A 协议。原 ACP 特有功能在 A2A 中的对应关系：

| ACP 原有特性 | A2A 中的实现 |
|-------------|-------------|
| 多轮交互 | A2A Tasks 的 input-required 状态 |
| 人工干预（HITL） | A2A 任务状态机 + 外部回调 |
| MIME multipart 消息 | A2A Parts（TextPart / FilePart / DataPart） |
| 服务注册与发现 | A2A Agent Card |

## C.4 ANP (Agent Network Protocol)

### C.4.1 协议概述

- **发起者**: 中国开源社区 (2025)
- **目的**: 面向开放互联网的 Agent 发现、身份验证与通信
- **仓库**: [[agent-network-protocol/ANP]](https://github.com/agent-network-protocol/ANP)
- **特点**: 强调去中心化的 Agent 互联互通

### C.4.2 核心设计理念

ANP（Agent Network Protocol）是一项源自中国的开放协议，专注于解决开放互联网环境中 Agent 之间的发现与通信问题。与 MCP 侧重工具连接、A2A 侧重任务协作不同，ANP 的目标是构建一个去中心化的 Agent 网络，让不同组织和个人开发的 Agent 能够在互联网上自主发现彼此并建立安全的通信连接。

### C.4.3 关键特性

| 特性 | 描述 |
|------|------|
| Agent 身份与发现 | 基于开放标准的 Agent 身份标识和去中心化发现机制 |
| 安全通信 | Agent 之间的端到端加密和身份验证 |
| 协议协商 | Agent 之间动态协商通信协议和数据格式 |
| 开放互联网适配 | 面向公网环境设计，无需中心化注册中心 |

## C.5 协议互操作

### C.5.1 协议定位对比

| 协议 | 层级 | 核心场景 | 治理 |
|------|------|---------|------|
| MCP | Agent ↔ 工具 | 工具连接与数据访问 | Anthropic 主导开源 |
| A2A | Agent ↔ Agent | 任务协作与能力共享 | Linux Foundation |
| ANP | Agent ↔ 开放网络 | 互联网级 Agent 发现与通信 | 中国开源社区 |

### C.5.2 多协议集成模式

```
MCP: Agent ←→ Tools  (工具连接层)
A2A: Agent ←→ Agent  (对等协作层，含原 ACP 企业特性)
ANP: Agent ←→ 开放网络 (互联网发现与通信层)

推荐架构:
┌─────────────────────────────────┐
│          Agent Core             │
│  ┌───────┐ ┌────┐ ┌─────┐     │
│  │  MCP  │ │ A2A│ │ ANP │     │
│  │Client │ │Peer│ │Node │     │
│  └───────┘ └────┘ └─────┘     │
└─────────────────────────────────┘
```
