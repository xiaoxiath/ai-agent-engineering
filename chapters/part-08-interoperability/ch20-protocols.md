# 第 20 章：Agent 互操作协议

> **"孤立的智能体只是玩具，互联的智能体才是基础设施。"**

在前面的章节中，我们深入探讨了工具系统设计（第 6 章）、Multi-Agent 编排基础（第 9 章）等核心主题。这些内容聚焦于单一系统内部的 Agent 能力构建。然而，当 Agent 需要跨越组织边界、与异构系统交互、在开放网络中发现并协作时，标准化的互操作协议成为不可或缺的基础设施。

2025 年是 Agent 互操作协议的分水岭之年。三大事件重塑了协议格局：

1. **MCP 捐赠 AAIF**（2025 年 12 月）：Anthropic 将 Model Context Protocol 捐赠给 Linux Foundation 旗下的 AI Application Infrastructure Foundation（AAIF），从企业主导走向社区治理。
2. **ACP 合并入 A2A**（2025 年 8 月）：IBM 主导的 Agent Communication Protocol 正式合并入 Google 发起的 Agent-to-Agent Protocol，在 Linux Foundation 治理下形成统一的 Agent 间通信标准 [[A2A Protocol]](https://github.com/google-a2a/A2A)。
3. **ANP 崛起**（2025 年）：Agent Network Protocol 作为中国社区发起的跨平台 Agent 通信开放协议进入公众视野，填补了开放互联网中不同厂商 Agent 互发现与互通信的空白 [[Agent Network Protocol]](https://github.com/agent-network-protocol/ANP)。

本章将深入剖析这三大协议——MCP、A2A、ANP——的架构设计、实现细节和互操作模式，并通过完整的 TypeScript 实现帮助读者掌握协议工程的核心技能。

---

## 20.1 协议生态全景（2025）

### 20.1.1 三大协议的定位

Agent 互操作协议按通信对象和场景可以划分为三个层次：

| 维度 | MCP | A2A | ANP |
|------|-----|-----|-----|
| **全称** | Model Context Protocol | Agent-to-Agent Protocol | Agent Network Protocol |
| **通信模式** | Agent ↔ Tool/Resource（客户端-服务端） | Agent ↔ Agent（对等） | Agent ↔ Agent（去中心化发现） |
| **治理组织** | Linux Foundation AAIF（2025.12） | Linux Foundation（2025.08 吸收 ACP/BeeAI） | 开源社区 |
| **发起方** | Anthropic（2024） | Google（2025，捐赠 Linux Foundation），IBM ACP 合并 | 中国开源社区发起（2025） |
| **核心场景** | 工具调用、资源访问、上下文注入 | 跨 Agent 任务委托与协作 | 去中心化 Agent 发现与路由 |
| **传输协议** | Streamable HTTP（推荐）+ OAuth 2.1、stdio | HTTP + SSE | DID + P2P 消息 |
| **发现机制** | 服务端声明能力 | Agent Card（JSON） | DID Document + 能力描述协议 |
| **安全模型** | TLS + OAuth 2.1（远程） | OAuth 2.1 + Agent Card 验证 | DID 认证 + 端到端加密 |
| **适用边界** | 单 Agent 增强能力 | 组织内/跨组织 Agent 协作 | 开放互联网跨厂商 Agent 互发现与通信 |

### 20.1.2 协议演进时间线

```
2024.06  ── Anthropic 发布 MCP 初始规范（stdio + HTTP/SSE 传输）
2024.11  ── Google 发布 A2A v1 草案
2025.03  ── IBM 发布 ACP v1，侧重企业合规与审计
2025.05  ── MCP 引入 Streamable HTTP 传输，替代 SSE
2025.08  ── ACP 正式合并入 A2A（Linux Foundation 治理）
         ── A2A 获得企业级特性：审计追踪、合规元数据、多方信任
2025.09  ── ANP 发布首个规范草案（DID 身份 + 去中心化发现）
2025.12  ── MCP 捐赠给 Linux Foundation AAIF
         ── 三大协议形成互补生态格局
```

### 20.1.3 协议关系模型

三大协议并非竞争关系，而是互补的分层架构：

```
┌─────────────────────────────────────────────────────┐
│                    应用层（Agent 业务逻辑）             │
├─────────────────────────────────────────────────────┤
│  ANP 层：去中心化发现 ─── "我如何找到合适的 Agent？"     │
├─────────────────────────────────────────────────────┤
│  A2A 层：Agent 间协作 ─── "Agent 之间如何委托任务？"     │
├─────────────────────────────────────────────────────┤
│  MCP 层：工具与资源   ─── "Agent 如何使用外部工具？"     │
├─────────────────────────────────────────────────────┤
│                    传输层（HTTP, WebSocket, P2P）       │
└─────────────────────────────────────────────────────┘
```

### 20.1.4 协议注册表实现

在实际工程中，一个 Agent 系统往往需要同时支持多种协议。我们首先实现一个 `ProtocolRegistry`，作为协议管理的核心组件：

```typescript
// ============================================================
// 协议注册表 —— 管理系统中所有可用的互操作协议
// ============================================================

/** 协议类型枚举 */
enum ProtocolType {
  MCP = "mcp",
  A2A = "a2a",
  ANP = "anp",
}

/** 协议版本信息 */
interface ProtocolVersion {
  major: number;
  minor: number;
  patch: number;
  label?: string; // 如 "streamable-http", "post-acp-merger"
}

/** 协议能力描述 */
interface ProtocolCapability {
  name: string;
  description: string;
  required: boolean;
  version: string;
}

/** 协议端点配置 */
interface ProtocolEndpoint {
  url: string;
  transport: "streamable-http" | "stdio" | "sse" | "websocket" | "p2p";
  authentication?: {
    type: "oauth2" | "tls" | "did" | "api-key";
    config: Record<string, unknown>;
  };
}

/** 协议注册条目 */
interface ProtocolRegistryEntry {
  type: ProtocolType;
  version: ProtocolVersion;
  capabilities: ProtocolCapability[];
  endpoints: ProtocolEndpoint[];
  metadata: {
    governance: string;       // "AAIF" | "Linux Foundation" | "Community"
    registeredAt: Date;
    lastHealthCheck?: Date;
    healthStatus: "healthy" | "degraded" | "unavailable";
  };
}

/** 协议选择条件 */
interface ProtocolSelectionCriteria {
  communicationPattern: "agent-tool" | "agent-agent" | "agent-discovery";
  requireDecentralized?: boolean;
  requireEnterprise?: boolean;
  requiredCapabilities?: string[];
  preferredTransport?: string;
}

class ProtocolRegistry {
  private entries: Map<string, ProtocolRegistryEntry> = new Map();
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * 注册一个协议端点
   */
  register(entry: ProtocolRegistryEntry): string {
    const id = this.generateId(entry);

    // 验证协议版本兼容性
    this.validateCompatibility(entry);

    this.entries.set(id, {
      ...entry,
      metadata: {
        ...entry.metadata,
        registeredAt: new Date(),
        healthStatus: "healthy",
      },
    });

    console.log(
      `[ProtocolRegistry] 已注册 ${entry.type} v${this.formatVersion(entry.version)} ` +
      `(${entry.endpoints.length} 个端点, 治理: ${entry.metadata.governance})`
    );

    return id;
  }

  /**
   * 根据选择条件查找最佳协议
   */
  select(criteria: ProtocolSelectionCriteria): ProtocolRegistryEntry | null {
    const candidates = Array.from(this.entries.values()).filter((entry) => {
      // 按通信模式筛选
      if (criteria.communicationPattern === "agent-tool" && entry.type !== ProtocolType.MCP) {
        return false;
      }
      if (criteria.communicationPattern === "agent-agent" &&
          entry.type !== ProtocolType.A2A && entry.type !== ProtocolType.ANP) {
        return false;
      }
      if (criteria.communicationPattern === "agent-discovery" && entry.type !== ProtocolType.ANP) {
        return false;
      }

      // 去中心化要求
      if (criteria.requireDecentralized && entry.type !== ProtocolType.ANP) {
        return false;
      }

      // 企业级特性要求（A2A 合并 ACP 后具备）
      if (criteria.requireEnterprise && entry.type !== ProtocolType.A2A) {
        return false;
      }

      // 健康状态检查
      if (entry.metadata.healthStatus === "unavailable") {
        return false;
      }

      // 能力匹配
      if (criteria.requiredCapabilities) {
        const available = new Set(entry.capabilities.map((c) => c.name));
        if (!criteria.requiredCapabilities.every((rc) => available.has(rc))) {
          return false;
        }
      }

      return true;
    });

    if (candidates.length === 0) return null;

    // 优先选择健康状态良好的
    candidates.sort((a, b) => {
      if (a.metadata.healthStatus === "healthy" && b.metadata.healthStatus !== "healthy") return -1;
      if (a.metadata.healthStatus !== "healthy" && b.metadata.healthStatus === "healthy") return 1;
      return 0;
    });

    return candidates[0];
  }

  /**
   * 列出所有已注册协议的摘要
   */
  listAll(): Array<{ id: string; type: ProtocolType; version: string; status: string }> {
    return Array.from(this.entries.entries()).map(([id, entry]) => ({
      id,
      type: entry.type,
      version: this.formatVersion(entry.version),
      status: entry.metadata.healthStatus,
    }));
  }

  /**
   * 启动周期性健康检查
   */
  startHealthChecks(intervalMs: number = 30000): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const [id, entry] of this.entries) {
        try {
          const healthy = await this.checkEndpointHealth(entry);
          entry.metadata.healthStatus = healthy ? "healthy" : "degraded";
          entry.metadata.lastHealthCheck = new Date();
        } catch {
          entry.metadata.healthStatus = "unavailable";
        }
      }
    }, intervalMs);
  }

  /**
   * 停止健康检查
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  // ---- 私有方法 ----

  private generateId(entry: ProtocolRegistryEntry): string {
    return `${entry.type}-${this.formatVersion(entry.version)}-${Date.now()}`;
  }

  private formatVersion(v: ProtocolVersion): string {
    const base = `${v.major}.${v.minor}.${v.patch}`;
    return v.label ? `${base}-${v.label}` : base;
  }

  private validateCompatibility(entry: ProtocolRegistryEntry): void {
    // MCP 必须使用 Streamable HTTP 或 stdio
    if (entry.type === ProtocolType.MCP) {
      const validTransports = ["streamable-http", "stdio"];
      for (const ep of entry.endpoints) {
        if (!validTransports.includes(ep.transport)) {
          console.warn(
            `[ProtocolRegistry] 警告: MCP 端点使用了非推荐传输 "${ep.transport}"。` +
            `推荐使用 Streamable HTTP（2025 年新标准）。`
          );
        }
      }
    }

    // ANP 必须使用 P2P 传输
    if (entry.type === ProtocolType.ANP) {
      for (const ep of entry.endpoints) {
        if (ep.transport !== "p2p" && ep.transport !== "websocket") {
          throw new Error(`ANP 端点必须使用 p2p 或 websocket 传输，收到: ${ep.transport}`);
        }
      }
    }
  }

  private async checkEndpointHealth(entry: ProtocolRegistryEntry): Promise<boolean> {
    // 对每个端点执行健康检查
    for (const endpoint of entry.endpoints) {
      try {
        if (endpoint.transport === "streamable-http" || endpoint.transport === "sse") {
          const response = await fetch(endpoint.url, {
            method: "GET",
            signal: AbortSignal.timeout(5000),
          });
          if (response.ok) return true;
        }
        // stdio 和 p2p 传输使用不同的健康检查策略
        if (endpoint.transport === "stdio") {
          return true; // stdio 本地传输默认健康
        }
      } catch {
        continue;
      }
    }
    return false;
  }
}

// ---- 使用示例 ----

const registry = new ProtocolRegistry();

// 注册 MCP 端点（AAIF 治理）
registry.register({
  type: ProtocolType.MCP,
  version: { major: 1, minor: 3, patch: 0, label: "streamable-http" },
  capabilities: [
    { name: "tools", description: "工具调用", required: true, version: "1.3" },
    { name: "resources", description: "资源访问", required: true, version: "1.3" },
    { name: "prompts", description: "提示模板", required: false, version: "1.3" },
  ],
  endpoints: [
    {
      url: "https://mcp.example.com/v1",
      transport: "streamable-http",
      authentication: { type: "tls", config: { certPath: "/certs/mcp.pem" } },
    },
  ],
  metadata: {
    governance: "AAIF (Linux Foundation)",
    registeredAt: new Date(),
    healthStatus: "healthy",
  },
});

// 注册 A2A 端点（含 ACP 企业特性）
registry.register({
  type: ProtocolType.A2A,
  version: { major: 2, minor: 0, patch: 0, label: "post-acp-merger" },
  capabilities: [
    { name: "task-delegation", description: "任务委托", required: true, version: "2.0" },
    { name: "streaming", description: "SSE 流式交互", required: false, version: "2.0" },
    { name: "audit-trail", description: "审计追踪（源自 ACP）", required: false, version: "2.0" },
    { name: "compliance-metadata", description: "合规元数据（源自 ACP）", required: false, version: "2.0" },
    { name: "multi-party-trust", description: "多方信任（源自 ACP）", required: false, version: "2.0" },
  ],
  endpoints: [
    {
      url: "https://a2a.example.com/v2",
      transport: "sse",
      authentication: { type: "oauth2", config: { issuer: "https://auth.example.com" } },
    },
  ],
  metadata: {
    governance: "Linux Foundation",
    registeredAt: new Date(),
    healthStatus: "healthy",
  },
});

// 注册 ANP 端点（去中心化）
registry.register({
  type: ProtocolType.ANP,
  version: { major: 0, minor: 9, patch: 0 },
  capabilities: [
    { name: "did-identity", description: "DID 身份认证", required: true, version: "0.9" },
    { name: "peer-discovery", description: "P2P Agent 发现", required: true, version: "0.9" },
    { name: "capability-advertisement", description: "能力广播", required: false, version: "0.9" },
  ],
  endpoints: [
    {
      url: "wss://anp-node.example.com/ws",
      transport: "websocket",
      authentication: { type: "did", config: { method: "did:web" } },
    },
  ],
  metadata: {
    governance: "Community",
    registeredAt: new Date(),
    healthStatus: "healthy",
  },
});

// 根据需求选择协议
const toolProtocol = registry.select({
  communicationPattern: "agent-tool",
});
console.log(`工具调用推荐协议: ${toolProtocol?.type}`); // mcp

const enterpriseProtocol = registry.select({
  communicationPattern: "agent-agent",
  requireEnterprise: true,
});
console.log(`企业协作推荐协议: ${enterpriseProtocol?.type}`); // a2a

const discoveryProtocol = registry.select({
  communicationPattern: "agent-discovery",
  requireDecentralized: true,
});
console.log(`去中心化发现推荐协议: ${discoveryProtocol?.type}`); // anp
```

### 20.1.5 ACP 合并始末

IBM 在 2025 年 3 月发布 Agent Communication Protocol（ACP，源自 BeeAI 项目），侧重于企业级 Agent 通信需求，特别是审计追踪、合规元数据和多方信任机制。然而，ACP 和 Google 的 A2A 在 Agent 间通信这一核心场景上存在高度重叠。

经过数月的社区讨论，两个项目在 Linux Foundation 的协调下于 2025 年 8 月完成合并。合并的关键决策包括：

- **协议名称**：保留 A2A（Agent-to-Agent Protocol），因其已获得更广泛的生态采用。
- **核心架构**：保留 A2A 的 Agent Card + Task 生命周期模型。
- **企业特性**：将 ACP 的审计追踪、合规元数据、多方信任等能力作为 A2A 的可选扩展模块整合。
- **治理模型**：由 Linux Foundation 统一治理，IBM 和 Google 共同担任技术指导委员会成员。

这次合并的意义在于：开发者不再需要在 ACP 和 A2A 之间做选择——A2A 同时覆盖了轻量级 Agent 协作和企业级合规需求。

---
## 20.2 MCP 深入

Model Context Protocol（MCP）是 Agent 与外部工具、资源交互的标准化协议（关于 MCP 的工具系统集成细节，参见第 6 章 6.4 节）。2024 年由 Anthropic 发布，2025 年 12 月捐赠给 Linux Foundation 旗下的 AI Application Infrastructure Foundation（AAIF），标志着 MCP 从单一企业主导迈向开放社区治理。

### 20.2.1 MCP 架构概览

MCP 采用客户端-服务端架构，核心组件包括：

```
┌──────────────────┐         ┌──────────────────┐
│   MCP Client     │         │   MCP Server     │
│  （嵌入 Agent）   │◄───────►│  （提供能力）      │
│                  │  传输层   │                  │
│  - 发起请求       │         │  - Tools（工具）   │
│  - 处理响应       │         │  - Resources（资源）│
│  - 管理会话       │         │  - Prompts（模板） │
└──────────────────┘         └──────────────────┘
        │                            │
        └───────── Streamable HTTP ──┘
                  （推荐传输方式）
```

**三大原语（Primitives）：**

1. **Tools（工具）**：可执行的函数，Agent 可以调用它们完成特定任务（如搜索、计算、API 调用）。
2. **Resources（资源）**：可读取的数据源，Agent 可以获取上下文信息（如文件内容、数据库记录）。
3. **Prompts（提示模板）**：预定义的交互模板，帮助用户以标准化方式与 Agent 交互。

### 20.2.2 Streamable HTTP 传输

2025 年 5 月，MCP 引入 Streamable HTTP 作为新的推荐传输方式，替代了此前的 HTTP + Server-Sent Events (SSE) 方案。Streamable HTTP 的核心改进在于：

- **单一端点**：所有请求通过一个 HTTP 端点处理（不再需要单独的 SSE 端点）。
- **按需流式**：服务端可以选择直接返回 JSON 响应，或升级为 SSE 流——由响应的 `Content-Type` 决定。
- **会话管理**：通过 `Mcp-Session-Id` 头实现有状态会话，同时也支持无状态模式。
- **OAuth 2.1 授权**：远程 Server 场景支持 OAuth 2.1 授权框架（强制 PKCE），详见第 6 章 6.4.4c 节。
- **向后兼容**：客户端和服务端可以协商传输能力，平滑过渡。

```typescript
// ============================================================
// Streamable HTTP 传输实现
// ============================================================

import { EventEmitter } from "events";

/** JSON-RPC 2.0 消息类型 */
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

/** 传输层配置 */
interface StreamableHTTPConfig {
  baseUrl: string;
  sessionId?: string;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * Streamable HTTP 传输
 *
 * MCP 2025 年推荐传输方式，替代此前的 SSE 方案。
 * 支持单次 JSON 响应和 SSE 流式响应两种模式。
 */
class StreamableHTTPTransport extends EventEmitter {
  private config: StreamableHTTPConfig;
  private sessionId: string | null = null;
  private abortController: AbortController | null = null;
  private isConnected: boolean = false;

  constructor(config: StreamableHTTPConfig) {
    super();
    this.config = {
      timeout: 30000,
      ...config,
    };
    this.sessionId = config.sessionId ?? null;
  }

  /**
   * 建立连接（初始化会话）
   */
  async connect(): Promise<void> {
    // 发送 initialize 请求以建立会话
    const initResponse = await this.sendRequest({
      jsonrpc: "2.0",
      id: "init-1",
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {
          tools: { listChanged: true },
          resources: { subscribe: true, listChanged: true },
          prompts: { listChanged: true },
        },
        clientInfo: {
          name: "TypeScript MCP Client",
          version: "1.3.0",
        },
      },
    });

    if (initResponse.error) {
      throw new Error(`MCP 初始化失败: ${initResponse.error.message}`);
    }

    // 从响应头获取会话 ID
    this.isConnected = true;
    console.log(`[StreamableHTTP] 连接已建立, 会话: ${this.sessionId ?? "无状态"}`);

    // 发送 initialized 通知
    await this.sendNotification({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
  }

  /**
   * 发送 JSON-RPC 请求（可能返回 JSON 或 SSE 流）
   */
  async sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...this.config.headers,
    };

    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    const response = await fetch(this.config.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.config.timeout!),
    });

    // 从响应头获取或更新会话 ID
    const newSessionId = response.headers.get("Mcp-Session-Id");
    if (newSessionId) {
      this.sessionId = newSessionId;
    }

    const contentType = response.headers.get("Content-Type") ?? "";

    // 情况 1：直接 JSON 响应
    if (contentType.includes("application/json")) {
      const body = await response.json() as JsonRpcResponse;
      return body;
    }

    // 情况 2：SSE 流式响应
    if (contentType.includes("text/event-stream")) {
      return this.consumeSSEStream(response, request.id);
    }

    throw new Error(`不支持的响应类型: ${contentType}`);
  }

  /**
   * 发送通知（无需响应）
   */
  async sendNotification(notification: JsonRpcNotification): Promise<void> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.config.headers,
    };

    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    await fetch(this.config.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(notification),
    });
  }

  /**
   * 开启 SSE 监听（用于接收服务端推送的通知）
   */
  async startListening(): Promise<void> {
    const headers: Record<string, string> = {
      Accept: "text/event-stream",
      ...this.config.headers,
    };

    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    this.abortController = new AbortController();

    const response = await fetch(this.config.baseUrl, {
      method: "GET",
      headers,
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      // 服务端不支持 GET 流式监听，退回到轮询模式
      console.log("[StreamableHTTP] 服务端不支持 GET 流式监听，使用轮询模式");
      return;
    }

    // 持续消费 SSE 事件
    this.consumeSSENotifications(response);
  }

  /**
   * 关闭连接
   */
  async disconnect(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.sessionId) {
      // 发送 DELETE 请求终止会话
      const headers: Record<string, string> = {
        "Mcp-Session-Id": this.sessionId,
        ...this.config.headers,
      };

      try {
        await fetch(this.config.baseUrl, { method: "DELETE", headers });
      } catch {
        // 忽略断开连接时的错误
      }
    }

    this.isConnected = false;
    this.sessionId = null;
    console.log("[StreamableHTTP] 连接已关闭");
  }

  /**
   * 消费 SSE 流并提取最终的 JSON-RPC 响应
   */
  private async consumeSSEStream(
    response: Response,
    requestId: string | number
  ): Promise<JsonRpcResponse> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResponse: JsonRpcResponse | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const message = JSON.parse(data) as JsonRpcMessage;

              // 检查是否为对应请求的响应
              if ("id" in message && message.id === requestId) {
                finalResponse = message as JsonRpcResponse;
              }

              // 中间通知事件
              if (!("id" in message) && "method" in message) {
                this.emit("notification", message);
              }
            } catch {
              // 忽略无法解析的 SSE 数据
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!finalResponse) {
      throw new Error(`未收到请求 ${requestId} 的响应`);
    }

    return finalResponse;
  }

  /**
   * 持续消费服务端推送的通知
   */
  private async consumeSSENotifications(response: Response): Promise<void> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            try {
              const notification = JSON.parse(data) as JsonRpcNotification;
              this.emit("notification", notification);
            } catch {
              // 忽略
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // 正常关闭
      } else {
        this.emit("error", err);
      }
    } finally {
      reader.releaseLock();
    }
  }
}
```

### 20.2.3 MCP Server 完整实现

一个 MCP Server 需要处理三大原语的注册和请求路由。以下是完整的服务端实现：

```typescript
// ============================================================
// MCP Server 完整实现 —— 支持 Tools、Resources、Prompts
// ============================================================

/** 工具定义 */
interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
  handler: (args: Record<string, unknown>) => Promise<MCPToolResult>;
}

interface MCPToolResult {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
    uri?: string;
  }>;
  isError?: boolean;
}

/** 资源定义 */
interface MCPResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  handler: () => Promise<MCPResourceContent>;
}

interface MCPResourceContent {
  uri: string;
  mimeType: string;
  text?: string;
  blob?: string; // base64 编码
}

/** 资源模板定义 */
interface MCPResourceTemplate {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
  handler: (params: Record<string, string>) => Promise<MCPResourceContent>;
}

/** 提示模板定义 */
interface MCPPromptDefinition {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
  handler: (args: Record<string, string>) => Promise<MCPPromptResult>;
}

interface MCPPromptResult {
  description?: string;
  messages: Array<{
    role: "user" | "assistant";
    content: {
      type: "text" | "image" | "resource";
      text?: string;
      uri?: string;
      mimeType?: string;
    };
  }>;
}

/** 服务端能力声明 */
interface MCPServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: {};
}

/** 订阅管理 */
interface ResourceSubscription {
  uri: string;
  callback: (content: MCPResourceContent) => void;
}

class MCPServer {
  private tools: Map<string, MCPToolDefinition> = new Map();
  private resources: Map<string, MCPResourceDefinition> = new Map();
  private resourceTemplates: Map<string, MCPResourceTemplate> = new Map();
  private prompts: Map<string, MCPPromptDefinition> = new Map();
  private subscriptions: Map<string, ResourceSubscription[]> = new Map();
  private serverInfo: { name: string; version: string };
  private capabilities: MCPServerCapabilities;

  constructor(name: string, version: string) {
    this.serverInfo = { name, version };
    this.capabilities = {
      tools: { listChanged: true },
      resources: { subscribe: true, listChanged: true },
      prompts: { listChanged: true },
      logging: {},
    };
  }

  // ---- 原语注册 ----

  /**
   * 注册工具
   */
  registerTool(tool: MCPToolDefinition): void {
    this.tools.set(tool.name, tool);
    console.log(`[MCPServer] 已注册工具: ${tool.name}`);
    this.notifyListChanged("tools");
  }

  /**
   * 注册资源
   */
  registerResource(resource: MCPResourceDefinition): void {
    this.resources.set(resource.uri, resource);
    console.log(`[MCPServer] 已注册资源: ${resource.uri}`);
    this.notifyListChanged("resources");
  }

  /**
   * 注册资源模板
   */
  registerResourceTemplate(template: MCPResourceTemplate): void {
    this.resourceTemplates.set(template.uriTemplate, template);
    console.log(`[MCPServer] 已注册资源模板: ${template.uriTemplate}`);
  }

  /**
   * 注册提示模板
   */
  registerPrompt(prompt: MCPPromptDefinition): void {
    this.prompts.set(prompt.name, prompt);
    console.log(`[MCPServer] 已注册提示模板: ${prompt.name}`);
    this.notifyListChanged("prompts");
  }

  // ---- 请求路由 ----

  /**
   * 处理 JSON-RPC 请求
   */
  async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      let result: unknown;

      switch (request.method) {
        case "initialize":
          result = this.handleInitialize(request.params);
          break;
        case "tools/list":
          result = this.handleToolsList();
          break;
        case "tools/call":
          result = await this.handleToolsCall(request.params as {
            name: string;
            arguments?: Record<string, unknown>;
          });
          break;
        case "resources/list":
          result = this.handleResourcesList();
          break;
        case "resources/read":
          result = await this.handleResourcesRead(request.params as { uri: string });
          break;
        case "resources/templates/list":
          result = this.handleResourceTemplatesList();
          break;
        case "resources/subscribe":
          result = this.handleResourceSubscribe(request.params as { uri: string });
          break;
        case "resources/unsubscribe":
          result = this.handleResourceUnsubscribe(request.params as { uri: string });
          break;
        case "prompts/list":
          result = this.handlePromptsList();
          break;
        case "prompts/get":
          result = await this.handlePromptsGet(request.params as {
            name: string;
            arguments?: Record<string, string>;
          });
          break;
        case "ping":
          result = {};
          break;
        default:
          return {
            jsonrpc: "2.0",
            id: request.id,
            error: { code: -32601, message: `未知方法: ${request.method}` },
          };
      }

      return { jsonrpc: "2.0", id: request.id, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : "内部错误";
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32603, message },
      };
    }
  }

  // ---- 具体处理方法 ----

  private handleInitialize(params?: Record<string, unknown>) {
    return {
      protocolVersion: "2025-06-18",
      capabilities: this.capabilities,
      serverInfo: this.serverInfo,
      instructions: `${this.serverInfo.name} 提供 ${this.tools.size} 个工具、` +
        `${this.resources.size} 个资源和 ${this.prompts.size} 个提示模板。`,
    };
  }

  private handleToolsList() {
    return {
      tools: Array.from(this.tools.values()).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  }

  private async handleToolsCall(params: {
    name: string;
    arguments?: Record<string, unknown>;
  }): Promise<MCPToolResult> {
    const tool = this.tools.get(params.name);
    if (!tool) {
      throw new Error(`未找到工具: ${params.name}`);
    }

    const startTime = Date.now();
    try {
      const result = await tool.handler(params.arguments ?? {});
      const duration = Date.now() - startTime;
      console.log(`[MCPServer] 工具 ${params.name} 执行完毕 (${duration}ms)`);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "工具执行失败";
      return {
        content: [{ type: "text", text: `错误: ${message}` }],
        isError: true,
      };
    }
  }

  private handleResourcesList() {
    return {
      resources: Array.from(this.resources.values()).map((r) => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType,
      })),
    };
  }

  private async handleResourcesRead(params: { uri: string }) {
    // 先尝试精确匹配
    const resource = this.resources.get(params.uri);
    if (resource) {
      const content = await resource.handler();
      return { contents: [content] };
    }

    // 尝试模板匹配
    for (const [template, def] of this.resourceTemplates) {
      const matched = this.matchUriTemplate(template, params.uri);
      if (matched) {
        const content = await def.handler(matched);
        return { contents: [content] };
      }
    }

    throw new Error(`未找到资源: ${params.uri}`);
  }

  private handleResourceTemplatesList() {
    return {
      resourceTemplates: Array.from(this.resourceTemplates.values()).map((t) => ({
        uriTemplate: t.uriTemplate,
        name: t.name,
        description: t.description,
        mimeType: t.mimeType,
      })),
    };
  }

  private handleResourceSubscribe(params: { uri: string }) {
    if (!this.subscriptions.has(params.uri)) {
      this.subscriptions.set(params.uri, []);
    }
    console.log(`[MCPServer] 客户端订阅了资源: ${params.uri}`);
    return {};
  }

  private handleResourceUnsubscribe(params: { uri: string }) {
    this.subscriptions.delete(params.uri);
    console.log(`[MCPServer] 客户端取消订阅: ${params.uri}`);
    return {};
  }

  private handlePromptsList() {
    return {
      prompts: Array.from(this.prompts.values()).map((p) => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments,
      })),
    };
  }

  private async handlePromptsGet(params: {
    name: string;
    arguments?: Record<string, string>;
  }) {
    const prompt = this.prompts.get(params.name);
    if (!prompt) {
      throw new Error(`未找到提示模板: ${params.name}`);
    }

    return prompt.handler(params.arguments ?? {});
  }

  // ---- 辅助方法 ----

  private matchUriTemplate(
    template: string,
    uri: string
  ): Record<string, string> | null {
    // 简化的 URI 模板匹配（支持 {param} 占位符）
    const templateParts = template.split("/");
    const uriParts = uri.split("/");

    if (templateParts.length !== uriParts.length) return null;

    const params: Record<string, string> = {};
    for (let i = 0; i < templateParts.length; i++) {
      const tPart = templateParts[i];
      const uPart = uriParts[i];

      const match = tPart.match(/^\{(\w+)\}$/);
      if (match) {
        params[match[1]] = uPart;
      } else if (tPart !== uPart) {
        return null;
      }
    }
    return params;
  }

  private notifyListChanged(primitive: "tools" | "resources" | "prompts"): void {
    // 在实际实现中，这里应通过 SSE 通道向客户端推送 listChanged 通知
    console.log(`[MCPServer] ${primitive} 列表已变更，通知已连接的客户端`);
  }

  /**
   * 通知资源变更（触发订阅回调）
   */
  notifyResourceUpdated(uri: string): void {
    const subs = this.subscriptions.get(uri);
    if (subs && subs.length > 0) {
      console.log(`[MCPServer] 资源 ${uri} 已更新，通知 ${subs.length} 个订阅者`);
    }
  }
}

// ---- MCP Server 使用示例 ----

const mcpServer = new MCPServer("code-analysis-server", "1.3.0");

// 注册工具：代码分析
mcpServer.registerTool({
  name: "analyze_code",
  description: "分析代码文件的复杂度、依赖关系和潜在问题",
  inputSchema: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "文件路径" },
      language: {
        type: "string",
        description: "编程语言",
        enum: ["typescript", "python", "java", "go"],
      },
      depth: { type: "string", description: "分析深度: shallow | deep" },
    },
    required: ["filePath", "language"],
  },
  handler: async (args) => {
    const filePath = args.filePath as string;
    const language = args.language as string;
    const depth = (args.depth as string) ?? "shallow";

    // 模拟代码分析
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            file: filePath,
            language,
            complexity: { cyclomatic: 12, cognitive: 8 },
            dependencies: ["express", "lodash"],
            issues: [
              { severity: "warning", message: "函数超过 50 行", line: 42 },
            ],
            analysisDepth: depth,
          }, null, 2),
        },
      ],
    };
  },
});

// 注册工具：代码搜索
mcpServer.registerTool({
  name: "search_code",
  description: "在代码仓库中搜索符合条件的代码片段",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "搜索关键词或正则表达式" },
      filePattern: { type: "string", description: "文件匹配模式 (glob)" },
      maxResults: { type: "string", description: "最大结果数" },
    },
    required: ["query"],
  },
  handler: async (args) => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            query: args.query,
            results: [
              { file: "src/main.ts", line: 15, content: "export function main() {" },
              { file: "src/utils.ts", line: 42, content: "// matching code here" },
            ],
            totalMatches: 2,
          }, null, 2),
        },
      ],
    };
  },
});

// 注册资源：项目配置
mcpServer.registerResource({
  uri: "config://project/tsconfig",
  name: "TypeScript 配置",
  description: "项目的 tsconfig.json 配置文件",
  mimeType: "application/json",
  handler: async () => ({
    uri: "config://project/tsconfig",
    mimeType: "application/json",
    text: JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        strict: true,
      },
    }, null, 2),
  }),
});

// 注册资源模板：文件内容
mcpServer.registerResourceTemplate({
  uriTemplate: "file:///{path}",
  name: "文件内容",
  description: "读取指定路径的文件内容",
  handler: async (params) => ({
    uri: `file:///${params.path}`,
    mimeType: "text/plain",
    text: `// 文件内容: ${params.path}\n// (模拟)`,
  }),
});

// 注册提示模板：代码审查
mcpServer.registerPrompt({
  name: "code_review",
  description: "生成代码审查提示",
  arguments: [
    { name: "language", description: "编程语言", required: true },
    { name: "focus", description: "审查重点（安全/性能/可读性）", required: false },
  ],
  handler: async (args) => ({
    description: `${args.language} 代码审查（关注: ${args.focus ?? "综合"}）`,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `请审查以下 ${args.language} 代码，重点关注 ${args.focus ?? "代码质量、安全性和性能"}。
提供具体的改进建议，并按严重程度排序。`,
        },
      },
    ],
  }),
});

// 注册提示模板：架构决策记录
mcpServer.registerPrompt({
  name: "architecture_decision_record",
  description: "生成架构决策记录(ADR)模板",
  arguments: [
    { name: "title", description: "决策标题", required: true },
    { name: "context", description: "背景描述", required: true },
  ],
  handler: async (args) => ({
    description: `ADR: ${args.title}`,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `请为以下架构决策生成 ADR 文档：
标题：${args.title}
背景：${args.context}

请包含：状态、决策、理由、后果、替代方案分析。`,
        },
      },
    ],
  }),
});
```

### 20.2.4 MCP Client 实现

```typescript
// ============================================================
// MCP Client 实现 —— 支持传输协商和完整的三原语操作
// ============================================================

/** 客户端配置 */
interface MCPClientConfig {
  serverUrl: string;
  transport?: "streamable-http" | "stdio";
  clientInfo: { name: string; version: string };
  capabilities?: {
    sampling?: {};
    roots?: { listChanged?: boolean };
  };
}

/** 服务端声明的能力 */
interface ServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: {};
}

class MCPClient {
  private transport: StreamableHTTPTransport;
  private config: MCPClientConfig;
  private serverCapabilities: ServerCapabilities | null = null;
  private requestId: number = 0;
  private cachedTools: MCPToolDefinition[] | null = null;
  private isInitialized: boolean = false;

  constructor(config: MCPClientConfig) {
    this.config = config;
    this.transport = new StreamableHTTPTransport({
      baseUrl: config.serverUrl,
    });
  }

  /**
   * 连接到 MCP 服务端并完成握手
   */
  async connect(): Promise<void> {
    const response = await this.sendRequest("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: this.config.capabilities ?? {},
      clientInfo: this.config.clientInfo,
    });

    this.serverCapabilities = response.capabilities as ServerCapabilities;
    this.isInitialized = true;

    // 发送 initialized 通知
    await this.sendNotification("notifications/initialized");

    console.log(
      `[MCPClient] 已连接到 ${(response as any).serverInfo?.name ?? "MCP Server"}`
    );

    // 监听服务端推送的通知
    this.transport.on("notification", (notification: JsonRpcNotification) => {
      this.handleServerNotification(notification);
    });

    // 开启 SSE 监听（如果服务端支持）
    this.transport.startListening().catch(() => {
      // 服务端不支持 GET SSE 监听，这是正常的
    });
  }

  /**
   * 列出所有可用工具
   */
  async listTools(): Promise<Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>> {
    this.ensureInitialized();
    const response = await this.sendRequest("tools/list");
    const tools = (response as any).tools ?? [];
    return tools;
  }

  /**
   * 调用工具
   */
  async callTool(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<MCPToolResult> {
    this.ensureInitialized();
    const response = await this.sendRequest("tools/call", {
      name,
      arguments: args,
    });
    return response as unknown as MCPToolResult;
  }

  /**
   * 列出所有可用资源
   */
  async listResources(): Promise<Array<{
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
  }>> {
    this.ensureInitialized();
    const response = await this.sendRequest("resources/list");
    return (response as any).resources ?? [];
  }

  /**
   * 读取资源
   */
  async readResource(uri: string): Promise<MCPResourceContent[]> {
    this.ensureInitialized();
    const response = await this.sendRequest("resources/read", { uri });
    return (response as any).contents ?? [];
  }

  /**
   * 订阅资源变更
   */
  async subscribeResource(uri: string): Promise<void> {
    this.ensureInitialized();
    if (!this.serverCapabilities?.resources?.subscribe) {
      throw new Error("服务端不支持资源订阅");
    }
    await this.sendRequest("resources/subscribe", { uri });
    console.log(`[MCPClient] 已订阅资源: ${uri}`);
  }

  /**
   * 列出所有可用提示模板
   */
  async listPrompts(): Promise<Array<{
    name: string;
    description?: string;
    arguments?: Array<{ name: string; description?: string; required?: boolean }>;
  }>> {
    this.ensureInitialized();
    const response = await this.sendRequest("prompts/list");
    return (response as any).prompts ?? [];
  }

  /**
   * 获取提示模板的具体内容
   */
  async getPrompt(
    name: string,
    args: Record<string, string> = {}
  ): Promise<MCPPromptResult> {
    this.ensureInitialized();
    const response = await this.sendRequest("prompts/get", {
      name,
      arguments: args,
    });
    return response as unknown as MCPPromptResult;
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    await this.transport.disconnect();
    this.isInitialized = false;
    this.serverCapabilities = null;
    this.cachedTools = null;
  }

  // ---- 私有方法 ----

  private async sendRequest(
    method: string,
    params?: Record<string, unknown>
  ): Promise<unknown> {
    const id = ++this.requestId;
    const response = await this.transport.sendRequest({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });

    if (response.error) {
      throw new Error(
        `MCP 错误 [${response.error.code}]: ${response.error.message}`
      );
    }

    return response.result;
  }

  private async sendNotification(
    method: string,
    params?: Record<string, unknown>
  ): Promise<void> {
    await this.transport.sendNotification({
      jsonrpc: "2.0",
      method,
      params,
    });
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error("MCPClient 尚未初始化，请先调用 connect()");
    }
  }

  private handleServerNotification(notification: JsonRpcNotification): void {
    switch (notification.method) {
      case "notifications/tools/list_changed":
        console.log("[MCPClient] 工具列表已变更，清除缓存");
        this.cachedTools = null;
        break;
      case "notifications/resources/list_changed":
        console.log("[MCPClient] 资源列表已变更");
        break;
      case "notifications/resources/updated":
        const uri = (notification.params as any)?.uri;
        console.log(`[MCPClient] 资源已更新: ${uri}`);
        break;
      case "notifications/prompts/list_changed":
        console.log("[MCPClient] 提示模板列表已变更");
        break;
      default:
        console.log(`[MCPClient] 收到未知通知: ${notification.method}`);
    }
  }
}

// ---- MCP Client 使用示例 ----

async function mcpClientDemo(): Promise<void> {
  const client = new MCPClient({
    serverUrl: "https://mcp.example.com/v1",
    transport: "streamable-http",
    clientInfo: { name: "agent-assistant", version: "2.0.0" },
  });

  await client.connect();

  // 1. 列出工具并调用
  const tools = await client.listTools();
  console.log(`发现 ${tools.length} 个工具:`);
  for (const tool of tools) {
    console.log(`  - ${tool.name}: ${tool.description}`);
  }

  const analysisResult = await client.callTool("analyze_code", {
    filePath: "src/main.ts",
    language: "typescript",
    depth: "deep",
  });
  console.log("分析结果:", analysisResult.content[0].text);

  // 2. 读取资源
  const resources = await client.listResources();
  console.log(`发现 ${resources.length} 个资源:`);
  for (const resource of resources) {
    console.log(`  - ${resource.uri}: ${resource.name}`);
  }

  const config = await client.readResource("config://project/tsconfig");
  console.log("项目配置:", config[0].text);

  // 3. 使用提示模板
  const prompts = await client.listPrompts();
  console.log(`发现 ${prompts.length} 个提示模板:`);
  for (const prompt of prompts) {
    console.log(`  - ${prompt.name}: ${prompt.description}`);
  }

  const reviewPrompt = await client.getPrompt("code_review", {
    language: "TypeScript",
    focus: "安全",
  });
  console.log("代码审查提示:", reviewPrompt.messages[0].content.text);

  await client.disconnect();
}
```

### 20.2.5 MCP 服务发现与生命周期

MCP 服务的发现和管理是生产部署中的关键挑战。以下实现了一个 MCP 服务生命周期管理器：

```typescript
// ============================================================
// MCP 服务生命周期管理
// ============================================================

/** 服务状态 */
type MCPServiceStatus = "discovered" | "connecting" | "ready" | "error" | "stopped";

/** 服务描述 */
interface MCPServiceDescriptor {
  id: string;
  name: string;
  url: string;
  transport: "streamable-http" | "stdio";
  capabilities: string[];
  status: MCPServiceStatus;
  client?: MCPClient;
  error?: string;
  lastHealthCheck?: Date;
  retryCount: number;
  maxRetries: number;
}

class MCPServiceManager {
  private services: Map<string, MCPServiceDescriptor> = new Map();
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * 注册并连接 MCP 服务
   */
  async addService(config: {
    name: string;
    url: string;
    transport?: "streamable-http" | "stdio";
    maxRetries?: number;
  }): Promise<string> {
    const id = `mcp-${config.name}-${Date.now()}`;
    const descriptor: MCPServiceDescriptor = {
      id,
      name: config.name,
      url: config.url,
      transport: config.transport ?? "streamable-http",
      capabilities: [],
      status: "discovered",
      retryCount: 0,
      maxRetries: config.maxRetries ?? 3,
    };

    this.services.set(id, descriptor);
    await this.connectService(descriptor);
    return id;
  }

  /**
   * 获取可用的工具列表（跨所有已连接服务）
   */
  async getAllTools(): Promise<Array<{
    serviceId: string;
    serviceName: string;
    tool: { name: string; description: string };
  }>> {
    const allTools: Array<{
      serviceId: string;
      serviceName: string;
      tool: { name: string; description: string };
    }> = [];

    for (const [id, svc] of this.services) {
      if (svc.status === "ready" && svc.client) {
        try {
          const tools = await svc.client.listTools();
          for (const tool of tools) {
            allTools.push({
              serviceId: id,
              serviceName: svc.name,
              tool: { name: tool.name, description: tool.description },
            });
          }
        } catch {
          svc.status = "error";
        }
      }
    }

    return allTools;
  }

  /**
   * 通过服务 ID 调用工具
   */
  async callTool(
    serviceId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MCPToolResult> {
    const svc = this.services.get(serviceId);
    if (!svc || svc.status !== "ready" || !svc.client) {
      throw new Error(`服务 ${serviceId} 不可用`);
    }
    return svc.client.callTool(toolName, args);
  }

  /**
   * 启动健康检查
   */
  startHealthChecks(intervalMs: number = 60000): void {
    this.healthCheckTimer = setInterval(() => this.runHealthChecks(), intervalMs);
  }

  /**
   * 移除服务
   */
  async removeService(id: string): Promise<void> {
    const svc = this.services.get(id);
    if (svc?.client) {
      await svc.client.disconnect();
    }
    this.services.delete(id);
    console.log(`[MCPServiceManager] 服务 ${id} 已移除`);
  }

  /**
   * 停止管理器
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    for (const [id] of this.services) {
      await this.removeService(id);
    }
  }

  // ---- 私有方法 ----

  private async connectService(descriptor: MCPServiceDescriptor): Promise<void> {
    descriptor.status = "connecting";

    try {
      const client = new MCPClient({
        serverUrl: descriptor.url,
        transport: descriptor.transport,
        clientInfo: { name: "mcp-service-manager", version: "1.0.0" },
      });

      await client.connect();
      descriptor.client = client;
      descriptor.status = "ready";
      descriptor.retryCount = 0;

      // 获取服务能力
      const tools = await client.listTools();
      descriptor.capabilities = tools.map((t) => `tool:${t.name}`);

      console.log(
        `[MCPServiceManager] 服务 ${descriptor.name} 已就绪 ` +
        `(${descriptor.capabilities.length} 个能力)`
      );
    } catch (err) {
      descriptor.status = "error";
      descriptor.error = err instanceof Error ? err.message : "连接失败";
      descriptor.retryCount++;

      if (descriptor.retryCount < descriptor.maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, descriptor.retryCount), 30000);
        console.log(
          `[MCPServiceManager] 服务 ${descriptor.name} 连接失败，` +
          `${delay}ms 后重试 (${descriptor.retryCount}/${descriptor.maxRetries})`
        );
        setTimeout(() => this.connectService(descriptor), delay);
      } else {
        console.error(
          `[MCPServiceManager] 服务 ${descriptor.name} 连接失败，已达最大重试次数`
        );
      }
    }
  }

  private async runHealthChecks(): Promise<void> {
    for (const [id, svc] of this.services) {
      if (svc.status === "ready" && svc.client) {
        try {
          // 使用 ping 方法进行健康检查
          await (svc.client as any).sendRequest("ping");
          svc.lastHealthCheck = new Date();
        } catch {
          console.warn(`[MCPServiceManager] 服务 ${svc.name} 健康检查失败`);
          svc.status = "error";
          // 尝试重连
          svc.retryCount = 0;
          this.connectService(svc);
        }
      }
    }
  }
}
```

### 20.2.6 MCP 安全模型

MCP 的安全模型围绕四个层面展开（详见第 6 章 6.4.4c 节关于 MCP OAuth 2.1 授权框架的深入讨论）：

1. **传输安全**：Streamable HTTP 强制使用 TLS 加密。
2. **授权框架**：远程 MCP Server 场景采用 OAuth 2.1 授权（强制 PKCE、禁止隐式授权、Refresh Token 旋转），与第 6 章的 MCP 授权实现保持一致。
3. **服务端认证**：客户端验证服务端身份，防止 MCP Server 投毒攻击。
4. **权限控制**：工具和资源的访问权限由服务端管理。

```typescript
// ============================================================
// MCP 安全配置
// ============================================================

interface MCPSecurityConfig {
  /** TLS 配置 */
  tls: {
    enabled: boolean;
    certPath?: string;
    keyPath?: string;
    caPath?: string;
    rejectUnauthorized: boolean;
  };
  /** 服务端身份验证 */
  serverAuth: {
    allowedOrigins: string[];
    pinnedCertificates?: string[];
    verifyServerIdentity: boolean;
  };
  /** 工具调用权限 */
  toolPermissions: {
    allowlist?: string[];   // 允许的工具名称
    blocklist?: string[];   // 禁止的工具名称
    requireConfirmation?: string[]; // 需要用户确认的工具
  };
  /** 资源访问权限 */
  resourcePermissions: {
    allowedUriPatterns: string[];  // 允许的 URI 模式
    maxResourceSize: number;       // 最大资源大小 (bytes)
  };
}

/**
 * MCP 安全管理器
 */
class MCPSecurityManager {
  private config: MCPSecurityConfig;

  constructor(config: MCPSecurityConfig) {
    this.config = config;
  }

  /**
   * 验证服务端来源
   */
  validateServerOrigin(origin: string): boolean {
    return this.config.serverAuth.allowedOrigins.some(
      (allowed) => origin === allowed || origin.endsWith(`.${allowed}`)
    );
  }

  /**
   * 检查工具调用权限
   */
  checkToolPermission(toolName: string): {
    allowed: boolean;
    requireConfirmation: boolean;
    reason?: string;
  } {
    const { allowlist, blocklist, requireConfirmation } = this.config.toolPermissions;

    if (blocklist?.includes(toolName)) {
      return { allowed: false, requireConfirmation: false, reason: "工具在黑名单中" };
    }

    if (allowlist && !allowlist.includes(toolName)) {
      return { allowed: false, requireConfirmation: false, reason: "工具不在白名单中" };
    }

    const needsConfirm = requireConfirmation?.includes(toolName) ?? false;
    return { allowed: true, requireConfirmation: needsConfirm };
  }

  /**
   * 检查资源访问权限
   */
  checkResourcePermission(uri: string): boolean {
    return this.config.resourcePermissions.allowedUriPatterns.some(
      (pattern) => {
        const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
        return regex.test(uri);
      }
    );
  }
}
```

### 20.2.7 MCP 治理变更：从 Anthropic 到 AAIF

2025 年 12 月，Anthropic 将 MCP 捐赠给 Linux Foundation 旗下新成立的 AI Application Infrastructure Foundation（AAIF）。这一决策的背景和影响：

**为什么捐赠？**

- MCP 作为基础设施协议，需要中立治理以获得更广泛的行业信任。
- 避免"供应商锁定"的质疑——多家 LLM 提供商（OpenAI、Google、微软）已表态支持 MCP。
- AAIF 提供了标准化的贡献者协议（CLA）、RFC 流程和版本治理。

**对开发者的影响：**

- MCP 规范的演进将通过 AAIF 的 RFC 流程进行，而非 Anthropic 单方面决定。
- SDK 仓库从 `github.com/anthropic/mcp-*` 迁移到 `github.com/aaif/mcp-*`（旧仓库设置重定向）。
- 协议版本号统一采用 ISO 日期格式（如 `2025-06-18`）。

---
## 20.3 A2A 深入

Agent-to-Agent Protocol（A2A）是 Agent 间任务委托与协作的标准化协议。由 Google 于 2024 年底发起，后由 Google 捐赠给 Linux Foundation 进行中立治理。2025 年 8 月，IBM 主导的 Agent Communication Protocol（ACP/BeeAI）正式合并入 A2A 后，A2A 成为涵盖轻量级协作和企业级合规需求的统一 Agent 间通信标准 [[A2A Protocol]](https://github.com/google-a2a/A2A)。A2A 以 Agent Card 作为 Agent 发现的核心机制，聚焦于跨 Agent 的任务委托与实时协作。

### 20.3.1 A2A 与 ACP 合并后的架构

合并后的 A2A 协议架构包含以下核心组件：

```
┌────────────────────────────────────────────────────────────────┐
│                      A2A 协议栈（v2.0, 含 ACP 特性）              │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │  Agent Card   │    │ Task 生命周期  │    │  企业扩展模块     │  │
│  │  (身份发现)    │    │ (核心交互)     │    │ (源自 ACP)       │  │
│  │              │    │              │    │                  │  │
│  │ - 能力声明    │    │ - submitted  │    │ - 审计追踪       │  │
│  │ - 技能列表    │    │ - working    │    │ - 合规元数据      │  │
│  │ - 认证方式    │    │ - input-need │    │ - 多方信任        │  │
│  │ - 端点地址    │    │ - completed  │    │ - 策略执行        │  │
│  │              │    │ - failed     │    │                  │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│                                                                │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │  SSE 流式     │    │  Push 通知    │    │  安全层          │  │
│  │  (实时交互)    │    │ (异步回调)     │    │ (OAuth 2.0)     │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│                     HTTP/HTTPS 传输层                           │
└────────────────────────────────────────────────────────────────┘
```

### 20.3.2 Agent Card 完整规范

Agent Card 是 A2A 中 Agent 的"名片"，通过 `/.well-known/agent.json` 路径暴露，描述 Agent 的能力、认证方式和交互协议：

```typescript
// ============================================================
// A2A Agent Card 完整类型定义
// ============================================================

/** Agent Card —— A2A Agent 的身份与能力声明 */
interface AgentCard {
  /** Agent 基本信息 */
  name: string;
  description: string;
  url: string;                       // Agent 的 A2A 端点
  version: string;
  provider?: {
    organization: string;
    url: string;
    contact?: string;
  };

  /** 能力声明 */
  capabilities: {
    streaming?: boolean;             // 是否支持 SSE 流式
    pushNotifications?: boolean;     // 是否支持推送通知
    stateTransitionHistory?: boolean; // 是否返回状态变迁历史
  };

  /** 技能列表 */
  skills: AgentSkill[];

  /** 认证方式 */
  authentication: {
    schemes: AuthenticationScheme[];
    credentials?: string;            // 凭据获取 URL
  };

  /** 默认输入/输出模态 */
  defaultInputModes: ContentMode[];
  defaultOutputModes: ContentMode[];

  /** 企业扩展（源自 ACP 合并） */
  enterprise?: {
    compliance: {
      standards: string[];           // 如 ["SOC2", "GDPR", "HIPAA"]
      certifications?: string[];
      dataResidency?: string[];      // 数据驻留区域
    };
    audit: {
      enabled: boolean;
      retentionDays: number;
      exportFormat: "json" | "csv" | "parquet";
    };
    trust: {
      trustFramework: string;        // 如 "mtls", "oauth2-mtls"
      attestations?: string[];       // 第三方认证
      policyEndpoint?: string;       // 策略查询端点
    };
  };
}

/** Agent 技能 */
interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  examples?: string[];               // 交互示例
  inputModes?: ContentMode[];
  outputModes?: ContentMode[];
}

/** 认证方案 */
interface AuthenticationScheme {
  scheme: "oauth2" | "api-key" | "mtls" | "bearer";
  config?: {
    authorizationUrl?: string;
    tokenUrl?: string;
    scopes?: string[];
    clientId?: string;
  };
}

/** 内容模态 */
type ContentMode = "text" | "image" | "audio" | "video" | "file";
```

### 20.3.3 Task 生命周期

A2A 的核心交互模型是 Task——一个有状态的工作单元，在客户端 Agent 和远程 Agent 之间流转：

```
                submitted
                    │
                    ▼
              ┌──────────┐
              │ working   │◄──────────────┐
              └──────────┘                │
                    │                     │
            ┌───────┼───────┐             │
            ▼       ▼       ▼             │
    ┌────────┐ ┌────────┐ ┌──────────┐    │
    │completed│ │ failed │ │input-need│────┘
    └────────┘ └────────┘ └──────────┘
                             ▲    │
                             │    │ (用户提供额外输入)
                             └────┘
```

**状态说明：**
- `submitted`：任务已提交，等待 Agent 处理。
- `working`：Agent 正在处理任务。
- `input-needed`：Agent 需要额外输入才能继续（类似人机交互中的 clarification）。
- `completed`：任务成功完成。
- `failed`：任务执行失败。

### 20.3.4 A2A Client 完整实现

```typescript
// ============================================================
// A2A Client —— 完整的 Agent 间通信客户端
// ============================================================

/** 任务状态 */
type TaskStatus = "submitted" | "working" | "input-needed" | "completed" | "failed" | "canceled";

/** 消息内容 */
interface MessageContent {
  type: "text" | "image" | "file" | "data";
  text?: string;
  data?: unknown;
  mimeType?: string;
  uri?: string;
}

/** 消息 */
interface A2AMessage {
  role: "user" | "agent";
  parts: MessageContent[];
  metadata?: Record<string, unknown>;
}

/** 任务 */
interface A2ATask {
  id: string;
  sessionId?: string;
  status: {
    state: TaskStatus;
    message?: A2AMessage;
    timestamp: string;
  };
  history?: Array<{
    state: TaskStatus;
    message?: A2AMessage;
    timestamp: string;
  }>;
  artifacts?: A2AArtifact[];
  metadata?: Record<string, unknown>;
  /** 企业审计字段（源自 ACP） */
  audit?: {
    initiatedBy: string;
    initiatedAt: string;
    stateTransitions: Array<{
      from: TaskStatus;
      to: TaskStatus;
      at: string;
      reason?: string;
    }>;
    complianceFlags?: string[];
  };
}

/** 制品（任务输出） */
interface A2AArtifact {
  name: string;
  description?: string;
  parts: MessageContent[];
  index?: number;
  append?: boolean;
  lastChunk?: boolean;
}

/** 推送通知配置 */
interface PushNotificationConfig {
  url: string;
  token?: string;
  authentication?: {
    scheme: string;
    credentials: string;
  };
}

/** 客户端配置 */
interface A2AClientConfig {
  agentUrl: string;
  authentication?: {
    scheme: "oauth2" | "api-key" | "bearer";
    token?: string;
    clientId?: string;
    clientSecret?: string;
    tokenUrl?: string;
  };
  timeout?: number;
}

class A2AClient {
  private config: A2AClientConfig;
  private agentCard: AgentCard | null = null;
  private accessToken: string | null = null;

  constructor(config: A2AClientConfig) {
    this.config = { timeout: 30000, ...config };
  }

  /**
   * 获取远程 Agent 的 Agent Card
   */
  async fetchAgentCard(): Promise<AgentCard> {
    const cardUrl = new URL("/.well-known/agent.json", this.config.agentUrl);
    const response = await fetch(cardUrl.toString(), {
      signal: AbortSignal.timeout(this.config.timeout!),
    });

    if (!response.ok) {
      throw new Error(`获取 Agent Card 失败: ${response.status} ${response.statusText}`);
    }

    this.agentCard = await response.json() as AgentCard;
    console.log(
      `[A2AClient] 获取到 Agent Card: ${this.agentCard.name} ` +
      `(${this.agentCard.skills.length} 个技能)`
    );

    return this.agentCard;
  }

  /**
   * 进行 OAuth 2.0 认证
   */
  async authenticate(): Promise<void> {
    if (!this.config.authentication) {
      console.log("[A2AClient] 无需认证");
      return;
    }

    const { scheme, clientId, clientSecret, tokenUrl } = this.config.authentication;

    if (scheme === "oauth2" && tokenUrl && clientId && clientSecret) {
      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (!response.ok) {
        throw new Error(`OAuth 认证失败: ${response.status}`);
      }

      const tokenData = await response.json() as { access_token: string };
      this.accessToken = tokenData.access_token;
      console.log("[A2AClient] OAuth 2.0 认证成功");
    } else if (scheme === "bearer" || scheme === "api-key") {
      this.accessToken = this.config.authentication.token ?? null;
    }
  }

  /**
   * 发送任务（同步模式）
   */
  async sendTask(params: {
    message: A2AMessage;
    sessionId?: string;
    metadata?: Record<string, unknown>;
    pushNotification?: PushNotificationConfig;
  }): Promise<A2ATask> {
    const body = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tasks/send",
      params: {
        id: crypto.randomUUID(),
        sessionId: params.sessionId,
        message: params.message,
        metadata: params.metadata,
        pushNotification: params.pushNotification,
      },
    };

    const response = await this.makeRequest(body);
    return response.result as A2ATask;
  }

  /**
   * 发送任务（SSE 流式模式）
   */
  async *sendTaskStreaming(params: {
    message: A2AMessage;
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }): AsyncGenerator<{
    type: "status" | "artifact";
    data: A2ATask | A2AArtifact;
  }> {
    const body = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tasks/sendSubscribe",
      params: {
        id: crypto.randomUUID(),
        sessionId: params.sessionId,
        message: params.message,
        metadata: params.metadata,
      },
    };

    const response = await fetch(this.config.agentUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`A2A 流式请求失败: ${response.status}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") return;

            try {
              const event = JSON.parse(data);

              if (event.result?.status) {
                yield { type: "status", data: event.result as A2ATask };
              }

              if (event.result?.artifact) {
                yield { type: "artifact", data: event.result.artifact as A2AArtifact };
              }
            } catch {
              // 忽略无法解析的 SSE 事件
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 查询任务状态
   */
  async getTask(taskId: string): Promise<A2ATask> {
    const body = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tasks/get",
      params: { id: taskId },
    };

    const response = await this.makeRequest(body);
    return response.result as A2ATask;
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<A2ATask> {
    const body = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tasks/cancel",
      params: { id: taskId },
    };

    const response = await this.makeRequest(body);
    return response.result as A2ATask;
  }

  /**
   * 配置推送通知
   */
  async configurePushNotification(
    taskId: string,
    config: PushNotificationConfig
  ): Promise<void> {
    const body = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tasks/pushNotification/set",
      params: { id: taskId, pushNotificationConfig: config },
    };

    await this.makeRequest(body);
    console.log(`[A2AClient] 已配置任务 ${taskId} 的推送通知`);
  }

  // ---- 私有方法 ----

  private async makeRequest(body: Record<string, unknown>): Promise<{
    result: unknown;
    error?: { code: number; message: string };
  }> {
    const response = await fetch(this.config.agentUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout!),
    });

    if (!response.ok) {
      throw new Error(`A2A 请求失败: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    if (result.error) {
      throw new Error(`A2A 错误 [${result.error.code}]: ${result.error.message}`);
    }

    return result;
  }

  private getAuthHeaders(): Record<string, string> {
    if (!this.accessToken) return {};
    return { Authorization: `Bearer ${this.accessToken}` };
  }
}
```

### 20.3.5 A2A Server 与 Task Manager 实现

```typescript
// ============================================================
// A2A Server —— 包含 Agent Card 服务和任务管理
// ============================================================

/** 任务处理器 */
type TaskHandler = (
  task: A2ATask,
  message: A2AMessage
) => AsyncGenerator<{
  type: "status" | "artifact";
  status?: TaskStatus;
  message?: A2AMessage;
  artifact?: A2AArtifact;
}>;

/** 任务存储条目 */
interface TaskStoreEntry {
  task: A2ATask;
  handler: TaskHandler;
  pushConfig?: PushNotificationConfig;
  createdAt: Date;
  updatedAt: Date;
}

class A2ATaskManager {
  private tasks: Map<string, TaskStoreEntry> = new Map();
  private defaultHandler: TaskHandler;
  private auditEnabled: boolean;

  constructor(defaultHandler: TaskHandler, auditEnabled: boolean = false) {
    this.defaultHandler = defaultHandler;
    this.auditEnabled = auditEnabled;
  }

  /**
   * 创建并执行任务（同步）
   */
  async createAndExecute(
    taskId: string,
    message: A2AMessage,
    sessionId?: string,
    metadata?: Record<string, unknown>
  ): Promise<A2ATask> {
    const task = this.createTask(taskId, sessionId, metadata);
    this.tasks.set(taskId, {
      task,
      handler: this.defaultHandler,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 执行任务处理器，收集最终状态
    const handler = this.defaultHandler;
    let lastTask = task;

    for await (const event of handler(task, message)) {
      if (event.status) {
        this.updateTaskStatus(taskId, event.status, event.message);
      }
      if (event.artifact) {
        this.addArtifact(taskId, event.artifact);
      }
      lastTask = this.tasks.get(taskId)!.task;
    }

    return lastTask;
  }

  /**
   * 创建并执行任务（流式）
   */
  async *createAndStream(
    taskId: string,
    message: A2AMessage,
    sessionId?: string,
    metadata?: Record<string, unknown>
  ): AsyncGenerator<{
    type: "status" | "artifact";
    data: A2ATask | A2AArtifact;
  }> {
    const task = this.createTask(taskId, sessionId, metadata);
    this.tasks.set(taskId, {
      task,
      handler: this.defaultHandler,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 流式执行
    for await (const event of this.defaultHandler(task, message)) {
      if (event.status) {
        this.updateTaskStatus(taskId, event.status, event.message);
        yield {
          type: "status",
          data: this.tasks.get(taskId)!.task,
        };
      }

      if (event.artifact) {
        this.addArtifact(taskId, event.artifact);
        yield {
          type: "artifact",
          data: event.artifact,
        };
      }
    }
  }

  /**
   * 查询任务
   */
  getTask(taskId: string): A2ATask | null {
    return this.tasks.get(taskId)?.task ?? null;
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: string): A2ATask {
    const entry = this.tasks.get(taskId);
    if (!entry) throw new Error(`任务不存在: ${taskId}`);

    if (entry.task.status.state === "completed" || entry.task.status.state === "failed") {
      throw new Error(`任务已终结，无法取消: ${entry.task.status.state}`);
    }

    this.updateTaskStatus(taskId, "canceled");
    return entry.task;
  }

  /**
   * 向任务追加输入（用于 input-needed 状态）
   */
  async provideInput(taskId: string, message: A2AMessage): Promise<A2ATask> {
    const entry = this.tasks.get(taskId);
    if (!entry) throw new Error(`任务不存在: ${taskId}`);

    if (entry.task.status.state !== "input-needed") {
      throw new Error(`任务当前状态不是 input-needed: ${entry.task.status.state}`);
    }

    // 重新执行处理器
    return this.createAndExecute(taskId, message);
  }

  /**
   * 获取审计追踪（ACP 特性）
   */
  getAuditTrail(taskId: string): A2ATask["audit"] | null {
    if (!this.auditEnabled) return null;
    return this.tasks.get(taskId)?.task.audit ?? null;
  }

  // ---- 私有方法 ----

  private createTask(
    taskId: string,
    sessionId?: string,
    metadata?: Record<string, unknown>
  ): A2ATask {
    const now = new Date().toISOString();
    const task: A2ATask = {
      id: taskId,
      sessionId,
      status: {
        state: "submitted",
        timestamp: now,
      },
      history: [],
      artifacts: [],
      metadata,
    };

    if (this.auditEnabled) {
      task.audit = {
        initiatedBy: (metadata?.initiatedBy as string) ?? "unknown",
        initiatedAt: now,
        stateTransitions: [],
        complianceFlags: [],
      };
    }

    return task;
  }

  private updateTaskStatus(
    taskId: string,
    state: TaskStatus,
    message?: A2AMessage
  ): void {
    const entry = this.tasks.get(taskId);
    if (!entry) return;

    const now = new Date().toISOString();
    const previousState = entry.task.status.state;

    // 记录历史
    if (entry.task.history) {
      entry.task.history.push({ ...entry.task.status });
    }

    // 更新当前状态
    entry.task.status = {
      state,
      message,
      timestamp: now,
    };

    // 审计追踪（ACP 特性）
    if (this.auditEnabled && entry.task.audit) {
      entry.task.audit.stateTransitions.push({
        from: previousState,
        to: state,
        at: now,
      });
    }

    entry.updatedAt = new Date();

    // 推送通知
    if (entry.pushConfig) {
      this.sendPushNotification(entry.pushConfig, entry.task).catch((err) => {
        console.error(`[A2ATaskManager] 推送通知失败: ${err}`);
      });
    }

    console.log(`[A2ATaskManager] 任务 ${taskId}: ${previousState} → ${state}`);
  }

  private addArtifact(taskId: string, artifact: A2AArtifact): void {
    const entry = this.tasks.get(taskId);
    if (!entry) return;

    if (!entry.task.artifacts) {
      entry.task.artifacts = [];
    }

    if (artifact.append && artifact.index !== undefined) {
      // 追加到现有制品
      const existing = entry.task.artifacts.find((a) => a.index === artifact.index);
      if (existing) {
        existing.parts.push(...artifact.parts);
        existing.lastChunk = artifact.lastChunk;
        return;
      }
    }

    entry.task.artifacts.push(artifact);
  }

  private async sendPushNotification(
    config: PushNotificationConfig,
    task: A2ATask
  ): Promise<void> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (config.authentication) {
      headers.Authorization = `${config.authentication.scheme} ${config.authentication.credentials}`;
    }

    await fetch(config.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tasks/pushNotification/update",
        params: { id: task.id, status: task.status },
      }),
    });
  }
}

class A2AServer {
  private agentCard: AgentCard;
  private taskManager: A2ATaskManager;

  constructor(agentCard: AgentCard, taskHandler: TaskHandler, auditEnabled: boolean = false) {
    this.agentCard = agentCard;
    this.taskManager = new A2ATaskManager(taskHandler, auditEnabled);
  }

  /**
   * 处理 HTTP 请求
   */
  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Agent Card 发现
    if (url.pathname === "/.well-known/agent.json" && request.method === "GET") {
      return new Response(JSON.stringify(this.agentCard, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // JSON-RPC 端点
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = await request.json() as {
      jsonrpc: string;
      id: string;
      method: string;
      params: Record<string, unknown>;
    };

    try {
      let result: unknown;

      switch (body.method) {
        case "tasks/send":
          result = await this.handleTaskSend(body.params);
          break;
        case "tasks/sendSubscribe":
          return this.handleTaskSendSubscribe(body.params, body.id);
        case "tasks/get":
          result = this.handleTaskGet(body.params);
          break;
        case "tasks/cancel":
          result = this.handleTaskCancel(body.params);
          break;
        case "tasks/pushNotification/set":
          result = this.handlePushNotificationSet(body.params);
          break;
        default:
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: body.id,
              error: { code: -32601, message: `未知方法: ${body.method}` },
            }),
            { headers: { "Content-Type": "application/json" } }
          );
      }

      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: body.id, result }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "内部错误";
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          error: { code: -32603, message },
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // ---- 请求处理 ----

  private async handleTaskSend(params: Record<string, unknown>): Promise<A2ATask> {
    const taskId = (params.id as string) ?? crypto.randomUUID();
    const message = params.message as A2AMessage;
    const sessionId = params.sessionId as string | undefined;
    const metadata = params.metadata as Record<string, unknown> | undefined;

    return this.taskManager.createAndExecute(taskId, message, sessionId, metadata);
  }

  private handleTaskSendSubscribe(
    params: Record<string, unknown>,
    requestId: string
  ): Response {
    const taskId = (params.id as string) ?? crypto.randomUUID();
    const message = params.message as A2AMessage;
    const sessionId = params.sessionId as string | undefined;

    // 创建 SSE 流
    const stream = new ReadableStream({
      start: async (controller) => {
        const encoder = new TextEncoder();

        try {
          const events = this.taskManager.createAndStream(
            taskId, message, sessionId
          );

          for await (const event of events) {
            const sseData = JSON.stringify({
              jsonrpc: "2.0",
              id: requestId,
              result: event.type === "status"
                ? { id: taskId, status: (event.data as A2ATask).status }
                : { id: taskId, artifact: event.data },
            });

            controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          const errorData = JSON.stringify({
            jsonrpc: "2.0",
            id: requestId,
            error: {
              code: -32603,
              message: err instanceof Error ? err.message : "流式处理失败",
            },
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  private handleTaskGet(params: Record<string, unknown>): A2ATask {
    const task = this.taskManager.getTask(params.id as string);
    if (!task) throw new Error(`任务不存在: ${params.id}`);
    return task;
  }

  private handleTaskCancel(params: Record<string, unknown>): A2ATask {
    return this.taskManager.cancelTask(params.id as string);
  }

  private handlePushNotificationSet(params: Record<string, unknown>): {} {
    console.log(
      `[A2AServer] 配置推送通知: 任务 ${params.id}, URL: ${(params.pushNotificationConfig as any)?.url}`
    );
    return {};
  }
}

// ---- A2A Server 使用示例 ----

// 定义 Agent Card
const translatorAgentCard: AgentCard = {
  name: "TranslatorAgent",
  description: "专业多语言翻译 Agent，支持 12 种语言间的实时翻译",
  url: "https://translator-agent.example.com/a2a",
  version: "2.0.0",
  provider: {
    organization: "Example AI Labs",
    url: "https://example.com",
    contact: "agent-support@example.com",
  },
  capabilities: {
    streaming: true,
    pushNotifications: true,
    stateTransitionHistory: true,
  },
  skills: [
    {
      id: "translate-text",
      name: "文本翻译",
      description: "将文本从源语言翻译为目标语言",
      tags: ["translation", "nlp", "multilingual"],
      examples: [
        "将以下英文翻译为中文: Hello, World!",
        "请把这段日文翻译成英文",
      ],
      inputModes: ["text"],
      outputModes: ["text"],
    },
    {
      id: "translate-document",
      name: "文档翻译",
      description: "翻译整个文档，保持格式",
      tags: ["translation", "document"],
      inputModes: ["text", "file"],
      outputModes: ["text", "file"],
    },
  ],
  authentication: {
    schemes: [
      {
        scheme: "oauth2",
        config: {
          authorizationUrl: "https://auth.example.com/authorize",
          tokenUrl: "https://auth.example.com/token",
          scopes: ["translate:read", "translate:write"],
        },
      },
    ],
  },
  defaultInputModes: ["text"],
  defaultOutputModes: ["text"],
  enterprise: {
    compliance: {
      standards: ["SOC2", "GDPR"],
      dataResidency: ["US", "EU"],
    },
    audit: {
      enabled: true,
      retentionDays: 90,
      exportFormat: "json",
    },
    trust: {
      trustFramework: "oauth2-mtls",
      attestations: ["ISO27001"],
    },
  },
};

// 定义任务处理器
const translationHandler: TaskHandler = async function* (task, message) {
  // 1. 标记为处理中
  yield { type: "status", status: "working" };

  // 2. 提取翻译请求
  const inputText = message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("\n");

  if (!inputText) {
    yield {
      type: "status",
      status: "input-needed",
      message: {
        role: "agent",
        parts: [{ type: "text", text: "请提供需要翻译的文本。" }],
      },
    };
    return;
  }

  // 3. 模拟翻译过程（流式输出）
  const translatedChunks = [
    "这是翻译的",
    "第一部分。",
    "这是翻译的",
    "第二部分。",
  ];

  for (let i = 0; i < translatedChunks.length; i++) {
    yield {
      type: "artifact",
      artifact: {
        name: "translation",
        parts: [{ type: "text", text: translatedChunks[i] }],
        index: 0,
        append: i > 0,
        lastChunk: i === translatedChunks.length - 1,
      },
    };

    // 模拟处理延迟
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // 4. 标记完成
  yield {
    type: "status",
    status: "completed",
    message: {
      role: "agent",
      parts: [{ type: "text", text: "翻译完成。" }],
    },
  };
};

// 创建 A2A Server
const a2aServer = new A2AServer(
  translatorAgentCard,
  translationHandler,
  true  // 启用审计（ACP 特性）
);
```

### 20.3.6 ACP 企业特性在 A2A 中的体现

ACP 合并入 A2A 后，以下企业级特性成为 A2A 的可选扩展模块：

```typescript
// ============================================================
// A2A 企业扩展（源自 ACP）
// ============================================================

/** 合规元数据 */
interface ComplianceMetadata {
  /** 数据分类 */
  dataClassification: "public" | "internal" | "confidential" | "restricted";
  /** 适用法规 */
  regulatoryFrameworks: string[];
  /** 数据处理依据 */
  processingBasis: "consent" | "contract" | "legal_obligation" | "legitimate_interest";
  /** 数据保留策略 */
  retentionPolicy: {
    maxDays: number;
    autoDelete: boolean;
  };
  /** 跨境传输 */
  crossBorderTransfer?: {
    allowed: boolean;
    mechanisms: string[];  // 如 ["SCC", "BCR"]
    restrictedRegions?: string[];
  };
}

/** 审计事件 */
interface AuditEvent {
  eventId: string;
  timestamp: string;
  eventType: "task_created" | "task_updated" | "task_completed" |
    "task_failed" | "data_accessed" | "policy_evaluated";
  actor: {
    agentId: string;
    organizationId: string;
  };
  resource: {
    taskId: string;
    resourceType: string;
  };
  details: Record<string, unknown>;
  compliance: ComplianceMetadata;
}

/** 多方信任评估 */
interface TrustAssessment {
  agentId: string;
  trustLevel: "untrusted" | "basic" | "verified" | "certified";
  factors: {
    identityVerified: boolean;
    organizationVerified: boolean;
    complianceCertified: boolean;
    reputationScore: number;       // 0-100
    auditHistoryAvailable: boolean;
  };
  attestations: Array<{
    issuer: string;
    type: string;
    issuedAt: string;
    expiresAt: string;
  }>;
  evaluatedAt: string;
}

class EnterpriseA2AExtension {
  private auditLog: AuditEvent[] = [];
  private trustCache: Map<string, TrustAssessment> = new Map();

  /**
   * 记录审计事件
   */
  recordAuditEvent(event: Omit<AuditEvent, "eventId" | "timestamp">): string {
    const fullEvent: AuditEvent = {
      ...event,
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };

    this.auditLog.push(fullEvent);

    console.log(
      `[Audit] ${fullEvent.eventType}: ` +
      `Task ${fullEvent.resource.taskId} by ${fullEvent.actor.agentId}`
    );

    return fullEvent.eventId;
  }

  /**
   * 导出审计日志
   */
  exportAuditLog(format: "json" | "csv" = "json"): string {
    if (format === "json") {
      return JSON.stringify(this.auditLog, null, 2);
    }

    // CSV 格式导出
    const headers = "eventId,timestamp,eventType,actorAgentId,taskId\n";
    const rows = this.auditLog
      .map((e) =>
        `${e.eventId},${e.timestamp},${e.eventType},${e.actor.agentId},${e.resource.taskId}`
      )
      .join("\n");
    return headers + rows;
  }

  /**
   * 评估 Agent 信任等级
   */
  async assessTrust(agentId: string, agentCard: AgentCard): Promise<TrustAssessment> {
    // 检查缓存
    const cached = this.trustCache.get(agentId);
    if (cached) {
      const cacheAge = Date.now() - new Date(cached.evaluatedAt).getTime();
      if (cacheAge < 3600000) return cached; // 缓存 1 小时
    }

    const factors = {
      identityVerified: !!agentCard.authentication?.schemes.length,
      organizationVerified: !!agentCard.provider?.organization,
      complianceCertified: !!agentCard.enterprise?.compliance?.standards.length,
      reputationScore: this.calculateReputationScore(agentId),
      auditHistoryAvailable: agentCard.enterprise?.audit?.enabled ?? false,
    };

    // 根据因素确定信任等级
    let trustLevel: TrustAssessment["trustLevel"] = "untrusted";
    const score = Object.values(factors).filter(Boolean).length;

    if (score >= 5) trustLevel = "certified";
    else if (score >= 3) trustLevel = "verified";
    else if (score >= 1) trustLevel = "basic";

    const assessment: TrustAssessment = {
      agentId,
      trustLevel,
      factors,
      attestations: (agentCard.enterprise?.trust?.attestations ?? []).map((a) => ({
        issuer: "trust-authority",
        type: a,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
      })),
      evaluatedAt: new Date().toISOString(),
    };

    this.trustCache.set(agentId, assessment);
    return assessment;
  }

  /**
   * 评估合规策略
   */
  evaluateCompliancePolicy(
    task: A2ATask,
    requiredStandards: string[]
  ): { compliant: boolean; violations: string[] } {
    const violations: string[] = [];

    // 检查数据分类
    const compliance = task.metadata?.compliance as ComplianceMetadata | undefined;
    if (!compliance) {
      violations.push("任务缺少合规元数据");
      return { compliant: false, violations };
    }

    // 检查法规覆盖
    for (const standard of requiredStandards) {
      if (!compliance.regulatoryFrameworks.includes(standard)) {
        violations.push(`缺少法规覆盖: ${standard}`);
      }
    }

    // 检查数据分类是否满足要求
    if (compliance.dataClassification === "restricted") {
      if (!compliance.crossBorderTransfer || !compliance.crossBorderTransfer.allowed) {
        violations.push("受限数据不允许跨境传输");
      }
    }

    return {
      compliant: violations.length === 0,
      violations,
    };
  }

  private calculateReputationScore(agentId: string): number {
    // 基于历史审计记录计算声誉分数
    const agentEvents = this.auditLog.filter(
      (e) => e.actor.agentId === agentId
    );

    if (agentEvents.length === 0) return 50; // 默认中等

    const completedTasks = agentEvents.filter(
      (e) => e.eventType === "task_completed"
    ).length;
    const failedTasks = agentEvents.filter(
      (e) => e.eventType === "task_failed"
    ).length;

    const total = completedTasks + failedTasks;
    if (total === 0) return 50;

    return Math.round((completedTasks / total) * 100);
  }
}
```

---
## 20.4 ANP 协议

Agent Network Protocol（ANP）是 2025 年由中国开源社区发起的跨平台 Agent 通信开放协议，专注于解决开放互联网上不同厂商、不同组织的 Agent 之间的发现、身份验证与消息交换问题 [[Agent Network Protocol]](https://github.com/agent-network-protocol/ANP)。与 MCP（Agent↔Tool，侧重工具集成）和 A2A（Agent↔Agent，侧重企业内/跨组织协作）不同，ANP 填补了开放网络中 Agent 互发现、互认证的空白——无需中央注册表，任何 Agent 可以通过去中心化身份（DID）自主地发布能力、发现同伴、建立信任通道。三者互为补充：MCP 处理工具集成层，A2A 处理企业级 Agent 间协作层，ANP 则处理开放互联网上的 Agent 网络层。

### 20.4.1 ANP 核心概念

ANP 的设计哲学深受 Web3 去中心化理念影响，包含三个核心概念：

1. **去中心化身份（DID）**：每个 Agent 拥有一个全局唯一的去中心化标识符（Decentralized Identifier），不依赖中央权威机构。
2. **Agent 描述协议**：Agent 通过标准化的描述文档（类似 DID Document）向网络广播自身能力。
3. **消息路由**：基于 DID 的端到端加密消息传递，支持直接通信和中继转发。

```
┌─────────────────────────────────────────────────────────┐
│                    ANP 协议架构                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────┐   发现   ┌──────────┐   发现   ┌────────┐ │
│  │ Agent A  │◄────────►│ Agent B  │◄────────►│Agent C │ │
│  │ DID:a:.. │  (DHT)   │ DID:b:.. │  (DHT)   │DID:c:..│ │
│  └──────────┘          └──────────┘          └────────┘ │
│       │                      │                     │    │
│       └──────────────────────┼─────────────────────┘    │
│                              │                          │
│                    ┌─────────┴─────────┐                │
│                    │   ANP 中继节点      │                │
│                    │  (可选, 提高可达性)  │                │
│                    └───────────────────┘                │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  身份层: DID (did:web / did:key / did:peer)              │
│  发现层: DHT 分布式哈希表 + Agent Description Protocol     │
│  传输层: WebSocket / WebRTC / HTTP                       │
│  安全层: DID Authentication + E2E Encryption              │
└─────────────────────────────────────────────────────────┘
```

### 20.4.2 DID 身份系统

DID（Decentralized Identifier）是 W3C 标准化的去中心化标识符。在 ANP 中，每个 Agent 的 DID 格式如下：

```
did:web:agent.example.com    —— 基于 Web 域名的 DID
did:key:z6Mkf...             —— 基于公钥的 DID
did:peer:2.Ez6L...           —— 用于点对点通信的临时 DID
```

```typescript
// ============================================================
// ANP DID 身份系统实现
// ============================================================

/** DID 方法类型 */
type DIDMethod = "web" | "key" | "peer";

/** DID 文档 */
interface DIDDocument {
  "@context": string[];
  id: string;                        // 如 "did:web:agent.example.com"
  controller?: string;
  verificationMethod: VerificationMethod[];
  authentication: string[];
  keyAgreement?: string[];
  service?: DIDService[];
}

/** 验证方法 */
interface VerificationMethod {
  id: string;
  type: "Ed25519VerificationKey2020" | "X25519KeyAgreementKey2020" | "JsonWebKey2020";
  controller: string;
  publicKeyMultibase?: string;
  publicKeyJwk?: JsonWebKey;
}

/** DID 服务端点 */
interface DIDService {
  id: string;
  type: string;
  serviceEndpoint: string | Record<string, string>;
}

/** ANP Agent 描述（扩展 DID Document） */
interface ANPAgentDescription {
  did: string;
  name: string;
  description: string;
  capabilities: ANPCapability[];
  protocols: string[];               // 支持的通信协议
  availability: {
    status: "online" | "busy" | "offline";
    lastSeen?: string;
    uptimeHours?: number;
  };
  metadata: {
    version: string;
    createdAt: string;
    updatedAt: string;
    tags: string[];
  };
}

/** ANP 能力声明 */
interface ANPCapability {
  id: string;
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  cost?: {
    model: "free" | "per-request" | "subscription";
    amount?: number;
    currency?: string;
  };
}

/**
 * ANP Agent —— 基于 DID 的去中心化 Agent 身份
 */
class ANPAgent {
  private did: string;
  private didDocument: DIDDocument;
  private description: ANPAgentDescription;
  private privateKey: CryptoKey | null = null;
  private publicKey: CryptoKey | null = null;

  constructor(config: {
    method: DIDMethod;
    domain?: string;    // did:web 需要
    name: string;
    description: string;
    capabilities: ANPCapability[];
  }) {
    // 生成 DID
    this.did = this.generateDID(config.method, config.domain);

    // 构建 DID Document
    this.didDocument = {
      "@context": [
        "https://www.w3.org/ns/did/v1",
        "https://w3id.org/security/suites/ed25519-2020/v1",
      ],
      id: this.did,
      verificationMethod: [
        {
          id: `${this.did}#key-1`,
          type: "Ed25519VerificationKey2020",
          controller: this.did,
          publicKeyMultibase: "", // 在 initialize() 中填充
        },
      ],
      authentication: [`${this.did}#key-1`],
      keyAgreement: [`${this.did}#key-agreement-1`],
      service: [
        {
          id: `${this.did}#anp-endpoint`,
          type: "ANPMessaging",
          serviceEndpoint: config.domain
            ? `wss://${config.domain}/anp/ws`
            : "pending",
        },
      ],
    };

    // 构建 Agent 描述
    this.description = {
      did: this.did,
      name: config.name,
      description: config.description,
      capabilities: config.capabilities,
      protocols: ["anp/1.0", "didcomm/2.0"],
      availability: {
        status: "online",
        lastSeen: new Date().toISOString(),
      },
      metadata: {
        version: "0.9.0",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: config.capabilities.map((c) => c.name),
      },
    };
  }

  /**
   * 初始化密钥对
   */
  async initialize(): Promise<void> {
    // 生成 Ed25519 密钥对（用于身份验证和签名）
    const keyPair = await crypto.subtle.generateKey(
      { name: "Ed25519" } as any,
      true,
      ["sign", "verify"]
    );

    this.privateKey = keyPair.privateKey;
    this.publicKey = keyPair.publicKey;

    // 导出公钥并更新 DID Document
    const publicKeyRaw = await crypto.subtle.exportKey("raw", this.publicKey);
    const publicKeyBase64 = btoa(
      String.fromCharCode(...new Uint8Array(publicKeyRaw))
    );

    this.didDocument.verificationMethod[0].publicKeyMultibase =
      `z${publicKeyBase64}`;

    console.log(`[ANPAgent] 已初始化: ${this.did}`);
  }

  /**
   * 获取 DID
   */
  getDID(): string {
    return this.did;
  }

  /**
   * 获取 DID Document
   */
  getDIDDocument(): DIDDocument {
    return this.didDocument;
  }

  /**
   * 获取 Agent 描述
   */
  getDescription(): ANPAgentDescription {
    return this.description;
  }

  /**
   * 签名消息
   */
  async signMessage(message: string): Promise<string> {
    if (!this.privateKey) throw new Error("Agent 尚未初始化");

    const encoder = new TextEncoder();
    const data = encoder.encode(message);

    const signature = await crypto.subtle.sign(
      { name: "Ed25519" } as any,
      this.privateKey,
      data
    );

    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }

  /**
   * 验证消息签名
   */
  async verifySignature(
    message: string,
    signature: string,
    signerPublicKey: CryptoKey
  ): Promise<boolean> {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);

    const sigBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));

    return crypto.subtle.verify(
      { name: "Ed25519" } as any,
      signerPublicKey,
      sigBytes,
      data
    );
  }

  /**
   * 更新可用性状态
   */
  updateAvailability(status: "online" | "busy" | "offline"): void {
    this.description.availability = {
      status,
      lastSeen: new Date().toISOString(),
    };
    this.description.metadata.updatedAt = new Date().toISOString();
  }

  /**
   * 添加能力
   */
  addCapability(capability: ANPCapability): void {
    this.description.capabilities.push(capability);
    this.description.metadata.updatedAt = new Date().toISOString();
    this.description.metadata.tags.push(capability.name);
  }

  // ---- 私有方法 ----

  private generateDID(method: DIDMethod, domain?: string): string {
    switch (method) {
      case "web":
        if (!domain) throw new Error("did:web 需要提供域名");
        return `did:web:${domain}`;
      case "key": {
        const randomBytes = crypto.getRandomValues(new Uint8Array(32));
        const encoded = btoa(String.fromCharCode(...randomBytes))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=/g, "");
        return `did:key:z${encoded}`;
      }
      case "peer": {
        const randomBytes = crypto.getRandomValues(new Uint8Array(16));
        const encoded = btoa(String.fromCharCode(...randomBytes))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=/g, "");
        return `did:peer:2.E${encoded}`;
      }
    }
  }
}
```

### 20.4.3 ANP 发现服务

ANP 的发现机制基于分布式哈希表（DHT），Agent 可以将自身描述发布到网络中，也可以根据能力、标签等条件搜索其他 Agent：

```typescript
// ============================================================
// ANP 发现服务 —— 去中心化 Agent 发现
// ============================================================

/** 发现查询 */
interface DiscoveryQuery {
  capabilities?: string[];           // 按能力名称搜索
  tags?: string[];                   // 按标签搜索
  availability?: "online" | "any";   // 可用性过滤
  proximity?: {                      // 地理位置过滤（可选）
    latitude: number;
    longitude: number;
    radiusKm: number;
  };
  maxResults?: number;
  minTrustScore?: number;            // 最低信任分数
}

/** 发现结果 */
interface DiscoveryResult {
  agent: ANPAgentDescription;
  relevanceScore: number;            // 相关性评分 (0-1)
  trustScore: number;                // 信任评分 (0-100)
  latencyMs?: number;                // 估计通信延迟
  discoveredAt: string;
  discoveredVia: "dht" | "relay" | "direct" | "cache";
}

/** DHT 节点 */
interface DHTNode {
  id: string;
  address: string;
  lastSeen: Date;
  agentDescriptions: Map<string, ANPAgentDescription>;
}

class ANPDiscoveryService {
  private localAgent: ANPAgent;
  private knownAgents: Map<string, ANPAgentDescription> = new Map();
  private dhtNodes: Map<string, DHTNode> = new Map();
  private trustScores: Map<string, number> = new Map();
  private discoveryCache: Map<string, DiscoveryResult[]> = new Map();
  private cacheMaxAge: number = 300000; // 5 分钟

  constructor(localAgent: ANPAgent) {
    this.localAgent = localAgent;
  }

  /**
   * 将本地 Agent 发布到发现网络
   */
  async publish(): Promise<void> {
    const description = this.localAgent.getDescription();

    // 1. 将描述添加到本地缓存
    this.knownAgents.set(description.did, description);

    // 2. 广播到已知的 DHT 节点
    for (const [, node] of this.dhtNodes) {
      try {
        await this.publishToNode(node, description);
        console.log(`[ANPDiscovery] 已发布到节点 ${node.id}`);
      } catch (err) {
        console.warn(`[ANPDiscovery] 发布到节点 ${node.id} 失败`);
      }
    }

    console.log(`[ANPDiscovery] Agent ${description.did} 已发布到发现网络`);
  }

  /**
   * 搜索匹配条件的 Agent
   */
  async search(query: DiscoveryQuery): Promise<DiscoveryResult[]> {
    // 检查缓存
    const cacheKey = JSON.stringify(query);
    const cached = this.discoveryCache.get(cacheKey);
    if (cached) {
      const cacheAge = Date.now() - new Date(cached[0]?.discoveredAt ?? 0).getTime();
      if (cacheAge < this.cacheMaxAge) {
        console.log("[ANPDiscovery] 使用缓存结果");
        return cached;
      }
    }

    const results: DiscoveryResult[] = [];

    // 1. 搜索本地已知 Agent
    for (const [did, agent] of this.knownAgents) {
      if (did === this.localAgent.getDID()) continue;

      const match = this.matchAgent(agent, query);
      if (match.matches) {
        results.push({
          agent,
          relevanceScore: match.score,
          trustScore: this.trustScores.get(did) ?? 50,
          discoveredAt: new Date().toISOString(),
          discoveredVia: "cache",
        });
      }
    }

    // 2. 向 DHT 节点查询
    for (const [, node] of this.dhtNodes) {
      try {
        const remoteResults = await this.queryNode(node, query);
        for (const agent of remoteResults) {
          if (!results.some((r) => r.agent.did === agent.did)) {
            const match = this.matchAgent(agent, query);
            results.push({
              agent,
              relevanceScore: match.score,
              trustScore: this.trustScores.get(agent.did) ?? 30,
              discoveredAt: new Date().toISOString(),
              discoveredVia: "dht",
            });
          }
        }
      } catch {
        // 节点不可达
      }
    }

    // 3. 过滤和排序
    let filtered = results;
    if (query.minTrustScore) {
      filtered = filtered.filter((r) => r.trustScore >= query.minTrustScore!);
    }

    filtered.sort((a, b) => {
      // 优先按相关性排序，其次按信任分数
      const scoreA = a.relevanceScore * 0.6 + (a.trustScore / 100) * 0.4;
      const scoreB = b.relevanceScore * 0.6 + (b.trustScore / 100) * 0.4;
      return scoreB - scoreA;
    });

    const maxResults = query.maxResults ?? 10;
    const finalResults = filtered.slice(0, maxResults);

    // 缓存结果
    this.discoveryCache.set(cacheKey, finalResults);

    return finalResults;
  }

  /**
   * 解析 DID 获取 Agent 描述
   */
  async resolve(did: string): Promise<ANPAgentDescription | null> {
    // 本地缓存查找
    const local = this.knownAgents.get(did);
    if (local) return local;

    // did:web 解析
    if (did.startsWith("did:web:")) {
      return this.resolveWebDID(did);
    }

    // DHT 查找
    for (const [, node] of this.dhtNodes) {
      const found = node.agentDescriptions.get(did);
      if (found) {
        this.knownAgents.set(did, found);
        return found;
      }
    }

    return null;
  }

  /**
   * 添加 DHT 引导节点
   */
  addBootstrapNode(id: string, address: string): void {
    this.dhtNodes.set(id, {
      id,
      address,
      lastSeen: new Date(),
      agentDescriptions: new Map(),
    });
    console.log(`[ANPDiscovery] 已添加引导节点: ${id} (${address})`);
  }

  /**
   * 更新 Agent 信任分数
   */
  updateTrustScore(did: string, score: number): void {
    this.trustScores.set(did, Math.max(0, Math.min(100, score)));
  }

  // ---- 私有方法 ----

  private matchAgent(
    agent: ANPAgentDescription,
    query: DiscoveryQuery
  ): { matches: boolean; score: number } {
    let score = 0;
    let totalCriteria = 0;

    // 能力匹配
    if (query.capabilities && query.capabilities.length > 0) {
      totalCriteria++;
      const agentCaps = new Set(agent.capabilities.map((c) => c.name.toLowerCase()));
      const matched = query.capabilities.filter((c) => agentCaps.has(c.toLowerCase()));
      const capScore = matched.length / query.capabilities.length;
      score += capScore;
      if (capScore === 0) return { matches: false, score: 0 };
    }

    // 标签匹配
    if (query.tags && query.tags.length > 0) {
      totalCriteria++;
      const agentTags = new Set(agent.metadata.tags.map((t) => t.toLowerCase()));
      const matched = query.tags.filter((t) => agentTags.has(t.toLowerCase()));
      score += matched.length / query.tags.length;
    }

    // 可用性过滤
    if (query.availability === "online") {
      if (agent.availability.status !== "online") {
        return { matches: false, score: 0 };
      }
    }

    const finalScore = totalCriteria > 0 ? score / totalCriteria : 0.5;
    return { matches: finalScore > 0, score: finalScore };
  }

  private async publishToNode(
    node: DHTNode,
    description: ANPAgentDescription
  ): Promise<void> {
    // 在实际实现中，这里会通过 WebSocket/HTTP 将描述推送到 DHT 节点
    node.agentDescriptions.set(description.did, description);
    node.lastSeen = new Date();
  }

  private async queryNode(
    node: DHTNode,
    query: DiscoveryQuery
  ): Promise<ANPAgentDescription[]> {
    // 在实际实现中，这里会通过网络查询 DHT 节点
    const results: ANPAgentDescription[] = [];
    for (const [, desc] of node.agentDescriptions) {
      const match = this.matchAgent(desc, query);
      if (match.matches) {
        results.push(desc);
      }
    }
    return results;
  }

  private async resolveWebDID(did: string): Promise<ANPAgentDescription | null> {
    // did:web:example.com → https://example.com/.well-known/did.json
    const domain = did.replace("did:web:", "");
    const url = `https://${domain}/.well-known/did.json`;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return null;

      const didDoc = await response.json() as DIDDocument;

      // 从 DID Document 的 service 端点获取 Agent 描述
      const anpService = didDoc.service?.find(
        (s) => s.type === "ANPAgentDescription"
      );
      if (!anpService) return null;

      const descUrl = typeof anpService.serviceEndpoint === "string"
        ? anpService.serviceEndpoint
        : anpService.serviceEndpoint.description;

      const descResponse = await fetch(descUrl);
      if (!descResponse.ok) return null;

      const description = await descResponse.json() as ANPAgentDescription;
      this.knownAgents.set(did, description);
      return description;
    } catch {
      return null;
    }
  }
}
```

### 20.4.4 ANP 消息路由

ANP 的消息路由系统负责在 Agent 之间建立端到端加密的通信通道：

```typescript
// ============================================================
// ANP 消息路由器
// ============================================================

/** ANP 消息 */
interface ANPMessage {
  id: string;
  from: string;           // 发送方 DID
  to: string;             // 接收方 DID
  type: "request" | "response" | "notification" | "error";
  body: {
    method?: string;
    params?: Record<string, unknown>;
    result?: unknown;
    error?: { code: number; message: string };
  };
  metadata: {
    timestamp: string;
    threadId?: string;     // 对话线程 ID
    signature?: string;    // 消息签名
    encrypted?: boolean;
    ttl?: number;          // 生存时间（秒）
  };
}

/** 路由表条目 */
interface RouteEntry {
  did: string;
  endpoint: string;
  transport: "websocket" | "http" | "relay";
  relayDid?: string;      // 如果通过中继节点
  lastUsed: Date;
  latencyMs: number;
}

/** 消息处理器 */
type MessageHandler = (message: ANPMessage) => Promise<ANPMessage | null>;

class ANPMessageRouter {
  private localAgent: ANPAgent;
  private routes: Map<string, RouteEntry> = new Map();
  private handlers: Map<string, MessageHandler> = new Map();
  private pendingResponses: Map<string, {
    resolve: (msg: ANPMessage) => void;
    reject: (err: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = new Map();
  private connections: Map<string, WebSocket> = new Map();
  private relayNodes: string[] = [];

  constructor(localAgent: ANPAgent) {
    this.localAgent = localAgent;
  }

  /**
   * 注册消息处理器
   */
  registerHandler(method: string, handler: MessageHandler): void {
    this.handlers.set(method, handler);
    console.log(`[ANPRouter] 已注册处理器: ${method}`);
  }

  /**
   * 发送消息并等待响应
   */
  async sendRequest(
    to: string,
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number = 30000
  ): Promise<ANPMessage> {
    const messageId = crypto.randomUUID();

    const message: ANPMessage = {
      id: messageId,
      from: this.localAgent.getDID(),
      to,
      type: "request",
      body: { method, params },
      metadata: {
        timestamp: new Date().toISOString(),
        threadId: crypto.randomUUID(),
      },
    };

    // 签名消息
    const messageStr = JSON.stringify(message.body);
    message.metadata.signature = await this.localAgent.signMessage(messageStr);

    // 创建响应 Promise
    const responsePromise = new Promise<ANPMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingResponses.delete(messageId);
        reject(new Error(`请求超时: ${method} → ${to}`));
      }, timeoutMs);

      this.pendingResponses.set(messageId, { resolve, reject, timeout });
    });

    // 路由消息
    await this.routeMessage(message);

    return responsePromise;
  }

  /**
   * 发送通知（不等待响应）
   */
  async sendNotification(
    to: string,
    method: string,
    params: Record<string, unknown>
  ): Promise<void> {
    const message: ANPMessage = {
      id: crypto.randomUUID(),
      from: this.localAgent.getDID(),
      to,
      type: "notification",
      body: { method, params },
      metadata: {
        timestamp: new Date().toISOString(),
      },
    };

    const messageStr = JSON.stringify(message.body);
    message.metadata.signature = await this.localAgent.signMessage(messageStr);

    await this.routeMessage(message);
  }

  /**
   * 处理收到的消息
   */
  async handleIncoming(message: ANPMessage): Promise<void> {
    // 检查消息是否发给自己
    if (message.to !== this.localAgent.getDID()) {
      // 作为中继节点转发
      await this.routeMessage(message);
      return;
    }

    // 处理响应消息
    if (message.type === "response" || message.type === "error") {
      const threadId = message.metadata.threadId;
      // 使用 message.id 对应的请求 ID 查找 pending
      for (const [reqId, pending] of this.pendingResponses) {
        // 简化匹配：这里通过 threadId 关联
        clearTimeout(pending.timeout);
        pending.resolve(message);
        this.pendingResponses.delete(reqId);
        return;
      }
      return;
    }

    // 处理请求消息
    if (message.type === "request" && message.body.method) {
      const handler = this.handlers.get(message.body.method);
      if (handler) {
        try {
          const response = await handler(message);
          if (response) {
            await this.routeMessage(response);
          }
        } catch (err) {
          const errorResponse: ANPMessage = {
            id: crypto.randomUUID(),
            from: this.localAgent.getDID(),
            to: message.from,
            type: "error",
            body: {
              error: {
                code: -1,
                message: err instanceof Error ? err.message : "处理失败",
              },
            },
            metadata: {
              timestamp: new Date().toISOString(),
              threadId: message.metadata.threadId,
            },
          };
          await this.routeMessage(errorResponse);
        }
      }
    }

    // 处理通知消息
    if (message.type === "notification" && message.body.method) {
      const handler = this.handlers.get(message.body.method);
      if (handler) {
        await handler(message);
      }
    }
  }

  /**
   * 添加路由表条目
   */
  addRoute(did: string, endpoint: string, transport: "websocket" | "http" | "relay"): void {
    this.routes.set(did, {
      did,
      endpoint,
      transport,
      lastUsed: new Date(),
      latencyMs: 0,
    });
  }

  /**
   * 添加中继节点
   */
  addRelayNode(relayEndpoint: string): void {
    this.relayNodes.push(relayEndpoint);
  }

  // ---- 私有方法 ----

  private async routeMessage(message: ANPMessage): Promise<void> {
    const route = this.routes.get(message.to);

    if (route) {
      switch (route.transport) {
        case "websocket":
          await this.sendViaWebSocket(route.endpoint, message);
          break;
        case "http":
          await this.sendViaHTTP(route.endpoint, message);
          break;
        case "relay":
          await this.sendViaRelay(message);
          break;
      }
      route.lastUsed = new Date();
    } else {
      // 尝试通过中继节点发送
      if (this.relayNodes.length > 0) {
        await this.sendViaRelay(message);
      } else {
        throw new Error(`无法路由消息到 ${message.to}: 无可用路由`);
      }
    }
  }

  private async sendViaWebSocket(endpoint: string, message: ANPMessage): Promise<void> {
    let ws = this.connections.get(endpoint);

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      ws = new WebSocket(endpoint);
      await new Promise<void>((resolve, reject) => {
        ws!.onopen = () => resolve();
        ws!.onerror = (err) => reject(new Error("WebSocket 连接失败"));
      });
      this.connections.set(endpoint, ws);

      ws.onmessage = async (event) => {
        const incoming = JSON.parse(event.data as string) as ANPMessage;
        await this.handleIncoming(incoming);
      };
    }

    ws.send(JSON.stringify(message));
  }

  private async sendViaHTTP(endpoint: string, message: ANPMessage): Promise<void> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP 发送失败: ${response.status}`);
    }

    // 如果有响应体，处理它
    const contentType = response.headers.get("Content-Type") ?? "";
    if (contentType.includes("application/json")) {
      const responseMsg = await response.json() as ANPMessage;
      if (responseMsg.id) {
        await this.handleIncoming(responseMsg);
      }
    }
  }

  private async sendViaRelay(message: ANPMessage): Promise<void> {
    // 尝试所有中继节点
    for (const relay of this.relayNodes) {
      try {
        await this.sendViaHTTP(relay, message);
        return;
      } catch {
        continue;
      }
    }
    throw new Error(`所有中继节点均不可达，无法发送消息到 ${message.to}`);
  }
}

// ---- ANP 使用示例 ----

async function anpDemo(): Promise<void> {
  // 创建两个 Agent
  const agentA = new ANPAgent({
    method: "web",
    domain: "agent-a.example.com",
    name: "数据分析 Agent",
    description: "专业的数据分析和可视化 Agent",
    capabilities: [
      {
        id: "data-analysis",
        name: "数据分析",
        description: "对结构化数据进行统计分析",
        cost: { model: "per-request", amount: 0.01, currency: "USD" },
      },
    ],
  });

  const agentB = new ANPAgent({
    method: "web",
    domain: "agent-b.example.com",
    name: "报告生成 Agent",
    description: "将分析结果生成专业报告",
    capabilities: [
      {
        id: "report-generation",
        name: "报告生成",
        description: "生成 PDF/HTML 格式的分析报告",
        cost: { model: "per-request", amount: 0.02, currency: "USD" },
      },
    ],
  });

  await agentA.initialize();
  await agentB.initialize();

  // 设置发现服务
  const discovery = new ANPDiscoveryService(agentA);
  discovery.addBootstrapNode("boot-1", "wss://bootstrap.anp-network.example.com");

  await discovery.publish();

  // 搜索报告生成能力的 Agent
  const results = await discovery.search({
    capabilities: ["报告生成"],
    availability: "online",
    maxResults: 5,
  });

  console.log(`发现 ${results.length} 个匹配的 Agent`);

  // 设置消息路由
  const router = new ANPMessageRouter(agentA);

  router.registerHandler("analyze", async (msg) => {
    console.log(`收到分析请求: ${JSON.stringify(msg.body.params)}`);
    return {
      id: crypto.randomUUID(),
      from: agentA.getDID(),
      to: msg.from,
      type: "response" as const,
      body: {
        result: { analysis: "完成", confidence: 0.95 },
      },
      metadata: {
        timestamp: new Date().toISOString(),
        threadId: msg.metadata.threadId,
      },
    };
  });
}
```

### 20.4.5 ANP 与中心化发现的比较

| 维度 | A2A（中心化发现） | ANP（去中心化发现） |
|------|-------------------|---------------------|
| **发现机制** | Agent Card 通过 well-known URL | DHT 分布式哈希表 |
| **身份管理** | 依赖 OAuth/TLS 证书 | DID 自主身份 |
| **可用性** | 依赖服务端在线 | P2P 网络容错 |
| **隐私性** | 中等（需暴露端点） | 高（可使用 did:peer） |
| **延迟** | 低（直接 HTTP） | 较高（DHT 查询） |
| **适用场景** | 企业内部、已知合作方 | 开放网络、未知 Agent |
| **治理** | Linux Foundation | 社区驱动 |
| **成熟度** | 生产就绪 | 早期阶段 |

---
## 20.5 协议互操作

在真实的 Agent 系统中，MCP、A2A、ANP 三大协议往往需要协同工作。一个典型的场景：Agent 通过 ANP 发现协作伙伴，通过 A2A 委托任务，而被委托的 Agent 通过 MCP 调用底层工具完成具体工作。本节实现协议间的桥接和统一网关。

### 20.5.1 协议桥接：MCP ↔ A2A

当一个 A2A Agent 收到任务请求，需要调用 MCP 工具来完成工作时，需要协议桥接层来翻译请求格式：

```typescript
// ============================================================
// 协议桥接 —— MCP Tool Call ↔ A2A Task
// ============================================================

/** 桥接映射规则 */
interface BridgeMappingRule {
  /** A2A 技能 ID → MCP 工具映射 */
  skillToTool: {
    skillId: string;
    toolName: string;
    parameterMapping: Record<string, string>;  // A2A参数名 → MCP参数名
  };
  /** 结果转换 */
  resultTransform?: (mcpResult: MCPToolResult) => MessageContent[];
}

class ProtocolBridge {
  private mcpClient: MCPClient;
  private mappingRules: Map<string, BridgeMappingRule> = new Map();
  private translationStats = {
    mcpToA2A: 0,
    a2aToMcp: 0,
    errors: 0,
  };

  constructor(mcpClient: MCPClient) {
    this.mcpClient = mcpClient;
  }

  /**
   * 添加映射规则
   */
  addMapping(rule: BridgeMappingRule): void {
    this.mappingRules.set(rule.skillToTool.skillId, rule);
    console.log(
      `[ProtocolBridge] 映射: A2A技能 "${rule.skillToTool.skillId}" → ` +
      `MCP工具 "${rule.skillToTool.toolName}"`
    );
  }

  /**
   * 自动发现映射：基于 MCP 工具列表生成 A2A 技能
   */
  async autoGenerateSkills(): Promise<AgentSkill[]> {
    const tools = await this.mcpClient.listTools();
    const skills: AgentSkill[] = [];

    for (const tool of tools) {
      const skill: AgentSkill = {
        id: `mcp-${tool.name}`,
        name: tool.name.replace(/_/g, " "),
        description: tool.description,
        tags: ["mcp-bridge", "auto-generated"],
        inputModes: ["text"],
        outputModes: ["text"],
      };

      skills.push(skill);

      // 自动创建映射规则（参数名直接映射）
      const paramNames = Object.keys(
        (tool.inputSchema as any)?.properties ?? {}
      );
      const parameterMapping: Record<string, string> = {};
      for (const name of paramNames) {
        parameterMapping[name] = name;
      }

      this.addMapping({
        skillToTool: {
          skillId: skill.id,
          toolName: tool.name,
          parameterMapping,
        },
      });
    }

    console.log(
      `[ProtocolBridge] 自动生成 ${skills.length} 个 A2A 技能 (从 MCP 工具)`
    );

    return skills;
  }

  /**
   * 将 A2A 任务请求转换为 MCP 工具调用
   */
  async a2aTaskToMcpCall(
    skillId: string,
    message: A2AMessage
  ): Promise<MCPToolResult> {
    const rule = this.mappingRules.get(skillId);
    if (!rule) {
      throw new Error(`未找到技能 "${skillId}" 的映射规则`);
    }

    // 从 A2A 消息中提取参数
    const params = this.extractParamsFromMessage(message, rule);

    try {
      // 调用 MCP 工具
      const result = await this.mcpClient.callTool(
        rule.skillToTool.toolName,
        params
      );
      this.translationStats.a2aToMcp++;
      return result;
    } catch (err) {
      this.translationStats.errors++;
      throw err;
    }
  }

  /**
   * 将 MCP 工具结果转换为 A2A 消息
   */
  mcpResultToA2AMessage(
    result: MCPToolResult,
    skillId?: string
  ): A2AMessage {
    this.translationStats.mcpToA2A++;

    // 使用自定义转换规则（如果存在）
    if (skillId) {
      const rule = this.mappingRules.get(skillId);
      if (rule?.resultTransform) {
        const parts = rule.resultTransform(result);
        return {
          role: "agent",
          parts,
        };
      }
    }

    // 默认转换：将 MCP 内容映射到 A2A 消息部分
    const parts: MessageContent[] = result.content.map((c) => {
      if (c.type === "text") {
        return { type: "text" as const, text: c.text };
      }
      if (c.type === "image") {
        return {
          type: "image" as const,
          data: c.data,
          mimeType: c.mimeType ?? "image/png",
        };
      }
      return { type: "text" as const, text: JSON.stringify(c) };
    });

    if (result.isError) {
      parts.unshift({
        type: "text",
        text: "[错误] MCP 工具执行失败:",
      });
    }

    return {
      role: "agent",
      parts,
    };
  }

  /**
   * 创建 A2A 任务处理器（自动桥接到 MCP）
   */
  createBridgedTaskHandler(): TaskHandler {
    const bridge = this;

    return async function* (task, message) {
      yield { type: "status", status: "working" };

      // 从消息中推断要调用的技能
      const skillId = bridge.inferSkillFromMessage(message);
      if (!skillId) {
        yield {
          type: "status",
          status: "input-needed",
          message: {
            role: "agent",
            parts: [{ type: "text", text: "无法确定要执行的操作，请提供更多信息。" }],
          },
        };
        return;
      }

      try {
        // A2A → MCP 桥接
        const mcpResult = await bridge.a2aTaskToMcpCall(skillId, message);

        // MCP → A2A 结果转换
        const a2aMessage = bridge.mcpResultToA2AMessage(mcpResult, skillId);

        // 输出制品
        yield {
          type: "artifact",
          artifact: {
            name: skillId,
            parts: a2aMessage.parts,
            lastChunk: true,
          },
        };

        yield {
          type: "status",
          status: "completed",
          message: a2aMessage,
        };
      } catch (err) {
        yield {
          type: "status",
          status: "failed",
          message: {
            role: "agent",
            parts: [{
              type: "text",
              text: `执行失败: ${err instanceof Error ? err.message : "未知错误"}`,
            }],
          },
        };
      }
    };
  }

  /**
   * 获取统计信息
   */
  getStats(): typeof this.translationStats {
    return { ...this.translationStats };
  }

  // ---- 私有方法 ----

  private extractParamsFromMessage(
    message: A2AMessage,
    rule: BridgeMappingRule
  ): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    // 尝试从消息的 data 部分提取结构化参数
    for (const part of message.parts) {
      if (part.type === "data" && typeof part.data === "object" && part.data !== null) {
        const data = part.data as Record<string, unknown>;
        for (const [a2aKey, mcpKey] of Object.entries(rule.skillToTool.parameterMapping)) {
          if (a2aKey in data) {
            params[mcpKey] = data[a2aKey];
          }
        }
      }
    }

    // 如果没有结构化数据，从文本中提取
    if (Object.keys(params).length === 0) {
      const text = message.parts
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("\n");

      // 将完整文本作为第一个必填参数
      const firstParam = Object.values(rule.skillToTool.parameterMapping)[0];
      if (firstParam) {
        params[firstParam] = text;
      }
    }

    return params;
  }

  private inferSkillFromMessage(message: A2AMessage): string | null {
    // 从消息元数据中获取技能 ID
    if (message.metadata?.skillId) {
      return message.metadata.skillId as string;
    }

    // 简单的关键词匹配
    const text = message.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join(" ")
      .toLowerCase();

    for (const [skillId] of this.mappingRules) {
      const keywords = skillId.replace("mcp-", "").split(/[-_]/);
      if (keywords.some((kw) => text.includes(kw))) {
        return skillId;
      }
    }

    return null;
  }
}
```

### 20.5.2 统一 Agent 网关

统一网关是三协议互操作的核心组件，对外暴露统一接口，内部根据请求类型分发到对应的协议处理器：

```typescript
// ============================================================
// 统一 Agent 网关 —— 同时支持 MCP、A2A、ANP
// ============================================================

/** 网关配置 */
interface GatewayConfig {
  port: number;
  agentName: string;
  agentDescription: string;
  enableMCP: boolean;
  enableA2A: boolean;
  enableANP: boolean;
  security: {
    tlsCert?: string;
    tlsKey?: string;
    oauth2Config?: {
      issuer: string;
      audience: string;
    };
  };
}

/** 请求上下文 */
interface RequestContext {
  protocol: ProtocolType;
  requestId: string;
  timestamp: Date;
  clientIdentity?: string;
  metadata: Record<string, unknown>;
}

/** 网关统计 */
interface GatewayStats {
  totalRequests: number;
  byProtocol: Record<ProtocolType, number>;
  errors: number;
  uptime: number;
  lastRequest: Date | null;
}

class UnifiedAgentGateway {
  private config: GatewayConfig;
  private mcpServer: MCPServer | null = null;
  private a2aServer: A2AServer | null = null;
  private anpAgent: ANPAgent | null = null;
  private anpRouter: ANPMessageRouter | null = null;
  private protocolBridge: ProtocolBridge | null = null;
  private stats: GatewayStats;
  private startTime: Date;

  constructor(config: GatewayConfig) {
    this.config = config;
    this.startTime = new Date();
    this.stats = {
      totalRequests: 0,
      byProtocol: {
        [ProtocolType.MCP]: 0,
        [ProtocolType.A2A]: 0,
        [ProtocolType.ANP]: 0,
      },
      errors: 0,
      uptime: 0,
      lastRequest: null,
    };
  }

  /**
   * 初始化所有协议组件
   */
  async initialize(components: {
    mcpServer?: MCPServer;
    a2aAgentCard?: AgentCard;
    a2aTaskHandler?: TaskHandler;
    anpConfig?: {
      method: DIDMethod;
      domain: string;
      capabilities: ANPCapability[];
    };
  }): Promise<void> {
    // 初始化 MCP
    if (this.config.enableMCP && components.mcpServer) {
      this.mcpServer = components.mcpServer;
      console.log("[Gateway] MCP 服务已初始化");
    }

    // 初始化 A2A
    if (this.config.enableA2A && components.a2aAgentCard && components.a2aTaskHandler) {
      this.a2aServer = new A2AServer(
        components.a2aAgentCard,
        components.a2aTaskHandler,
        true  // 启用审计
      );
      console.log("[Gateway] A2A 服务已初始化");
    }

    // 初始化 ANP
    if (this.config.enableANP && components.anpConfig) {
      this.anpAgent = new ANPAgent({
        ...components.anpConfig,
        name: this.config.agentName,
        description: this.config.agentDescription,
      });
      await this.anpAgent.initialize();
      this.anpRouter = new ANPMessageRouter(this.anpAgent);
      console.log("[Gateway] ANP 服务已初始化");
    }

    console.log(
      `[Gateway] 统一网关已初始化 (MCP: ${!!this.mcpServer}, ` +
      `A2A: ${!!this.a2aServer}, ANP: ${!!this.anpAgent})`
    );
  }

  /**
   * 设置 MCP↔A2A 协议桥接
   */
  async setupBridge(mcpClient: MCPClient): Promise<void> {
    this.protocolBridge = new ProtocolBridge(mcpClient);
    const skills = await this.protocolBridge.autoGenerateSkills();
    console.log(`[Gateway] 协议桥接已设置 (${skills.length} 个自动映射)`);
  }

  /**
   * 处理入站 HTTP 请求
   */
  async handleHTTPRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.stats.totalRequests++;
    this.stats.lastRequest = new Date();

    try {
      // 路由到对应的协议处理器
      const protocol = this.detectProtocol(request, url);

      if (!protocol) {
        return this.createErrorResponse(400, "无法识别协议类型");
      }

      this.stats.byProtocol[protocol]++;

      const context: RequestContext = {
        protocol,
        requestId: crypto.randomUUID(),
        timestamp: new Date(),
        metadata: {},
      };

      switch (protocol) {
        case ProtocolType.MCP:
          return this.handleMCPRequest(request, context);
        case ProtocolType.A2A:
          return this.handleA2ARequest(request, context);
        case ProtocolType.ANP:
          return this.handleANPRequest(request, context);
      }
    } catch (err) {
      this.stats.errors++;
      const message = err instanceof Error ? err.message : "内部网关错误";
      return this.createErrorResponse(500, message);
    }
  }

  /**
   * 获取网关状态
   */
  getStats(): GatewayStats {
    return {
      ...this.stats,
      uptime: (Date.now() - this.startTime.getTime()) / 1000,
    };
  }

  /**
   * 获取网关健康信息
   */
  getHealthInfo(): Record<string, unknown> {
    return {
      status: "healthy",
      agent: this.config.agentName,
      protocols: {
        mcp: { enabled: this.config.enableMCP, ready: !!this.mcpServer },
        a2a: { enabled: this.config.enableA2A, ready: !!this.a2aServer },
        anp: { enabled: this.config.enableANP, ready: !!this.anpAgent },
      },
      bridge: {
        enabled: !!this.protocolBridge,
        stats: this.protocolBridge?.getStats() ?? null,
      },
      uptime: (Date.now() - this.startTime.getTime()) / 1000,
      stats: this.stats,
    };
  }

  // ---- 协议检测 ----

  private detectProtocol(request: Request, url: URL): ProtocolType | null {
    // Agent Card 请求 → A2A
    if (url.pathname === "/.well-known/agent.json") {
      return ProtocolType.A2A;
    }

    // MCP 端点
    if (url.pathname.startsWith("/mcp")) {
      return ProtocolType.MCP;
    }

    // ANP 端点
    if (url.pathname.startsWith("/anp") || url.pathname.startsWith("/.well-known/did.json")) {
      return ProtocolType.ANP;
    }

    // A2A 端点（默认 JSON-RPC）
    if (url.pathname.startsWith("/a2a") || url.pathname === "/") {
      // 检查请求体中的 method 前缀
      return ProtocolType.A2A;
    }

    // 通过 Content-Type 检测
    const contentType = request.headers.get("Content-Type") ?? "";
    if (contentType.includes("application/json")) {
      return ProtocolType.A2A; // 默认 A2A
    }

    return null;
  }

  // ---- 协议处理 ----

  private async handleMCPRequest(
    request: Request,
    context: RequestContext
  ): Promise<Response> {
    if (!this.mcpServer) {
      return this.createErrorResponse(503, "MCP 服务未启用");
    }

    if (request.method === "POST") {
      const body = await request.json() as JsonRpcRequest;
      const result = await this.mcpServer.handleRequest(body);

      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.method === "GET") {
      // SSE 流式监听端点
      return new Response("SSE 监听端点", {
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    return this.createErrorResponse(405, "不支持的方法");
  }

  private async handleA2ARequest(
    request: Request,
    context: RequestContext
  ): Promise<Response> {
    if (!this.a2aServer) {
      return this.createErrorResponse(503, "A2A 服务未启用");
    }

    return this.a2aServer.handleRequest(request);
  }

  private async handleANPRequest(
    request: Request,
    context: RequestContext
  ): Promise<Response> {
    if (!this.anpAgent || !this.anpRouter) {
      return this.createErrorResponse(503, "ANP 服务未启用");
    }

    const url = new URL(request.url);

    // DID Document 请求
    if (url.pathname === "/.well-known/did.json") {
      return new Response(
        JSON.stringify(this.anpAgent.getDIDDocument(), null, 2),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Agent 描述请求
    if (url.pathname === "/anp/description") {
      return new Response(
        JSON.stringify(this.anpAgent.getDescription(), null, 2),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // ANP 消息端点
    if (request.method === "POST") {
      const message = await request.json() as ANPMessage;
      await this.anpRouter.handleIncoming(message);
      return new Response(JSON.stringify({ status: "accepted" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return this.createErrorResponse(404, "ANP 端点不存在");
  }

  private createErrorResponse(status: number, message: string): Response {
    return new Response(
      JSON.stringify({ error: message }),
      {
        status,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
```

### 20.5.3 协议协商器

在多协议环境中，自动选择最优协议是一个重要的工程决策。以下实现了一个协议协商器：

```typescript
// ============================================================
// 协议协商器 —— 自动选择最优通信协议
// ============================================================

/** 协商请求 */
interface NegotiationRequest {
  /** 通信目标 */
  targetAgent: {
    url?: string;          // 已知 URL → 尝试 A2A/MCP
    did?: string;          // 已知 DID → 尝试 ANP
    name?: string;         // 仅知名称 → 需要发现
  };
  /** 通信需求 */
  requirements: {
    type: "tool-call" | "task-delegation" | "discovery" | "streaming";
    needEnterprise?: boolean;
    needDecentralized?: boolean;
    latencyRequirement?: "low" | "medium" | "any";
    securityLevel?: "basic" | "enhanced" | "maximum";
  };
}

/** 协商结果 */
interface NegotiationResult {
  recommendedProtocol: ProtocolType;
  confidence: number;        // 0-1
  reasoning: string;
  fallbackProtocol?: ProtocolType;
  estimatedLatency: string;
  securityLevel: string;
}

class ProtocolNegotiator {
  private registry: ProtocolRegistry;
  private negotiationHistory: Array<{
    request: NegotiationRequest;
    result: NegotiationResult;
    timestamp: Date;
    outcome?: "success" | "failure";
  }> = [];

  constructor(registry: ProtocolRegistry) {
    this.registry = registry;
  }

  /**
   * 自动协商最优协议
   */
  negotiate(request: NegotiationRequest): NegotiationResult {
    const scores: Record<ProtocolType, { score: number; reasons: string[] }> = {
      [ProtocolType.MCP]: { score: 0, reasons: [] },
      [ProtocolType.A2A]: { score: 0, reasons: [] },
      [ProtocolType.ANP]: { score: 0, reasons: [] },
    };

    const { requirements, targetAgent } = request;

    // ---- 通信类型评分 ----

    if (requirements.type === "tool-call") {
      scores[ProtocolType.MCP].score += 10;
      scores[ProtocolType.MCP].reasons.push("工具调用是 MCP 的核心场景");
      scores[ProtocolType.A2A].score += 2;
      scores[ProtocolType.A2A].reasons.push("A2A 可通过技能间接完成");
    }

    if (requirements.type === "task-delegation") {
      scores[ProtocolType.A2A].score += 10;
      scores[ProtocolType.A2A].reasons.push("任务委托是 A2A 的核心场景");
      scores[ProtocolType.ANP].score += 5;
      scores[ProtocolType.ANP].reasons.push("ANP 也支持消息传递");
    }

    if (requirements.type === "discovery") {
      scores[ProtocolType.ANP].score += 10;
      scores[ProtocolType.ANP].reasons.push("去中心化发现是 ANP 的核心场景");
      scores[ProtocolType.A2A].score += 5;
      scores[ProtocolType.A2A].reasons.push("A2A Agent Card 提供中心化发现");
    }

    if (requirements.type === "streaming") {
      scores[ProtocolType.A2A].score += 8;
      scores[ProtocolType.A2A].reasons.push("A2A 原生支持 SSE 流式");
      scores[ProtocolType.MCP].score += 6;
      scores[ProtocolType.MCP].reasons.push("MCP Streamable HTTP 支持流式");
    }

    // ---- 企业特性评分 ----

    if (requirements.needEnterprise) {
      scores[ProtocolType.A2A].score += 8;
      scores[ProtocolType.A2A].reasons.push("A2A 具备 ACP 合并后的企业特性");
      scores[ProtocolType.MCP].score -= 2;
      scores[ProtocolType.MCP].reasons.push("MCP 缺乏内置企业合规特性");
    }

    // ---- 去中心化需求评分 ----

    if (requirements.needDecentralized) {
      scores[ProtocolType.ANP].score += 10;
      scores[ProtocolType.ANP].reasons.push("ANP 是唯一的去中心化协议");
      scores[ProtocolType.A2A].score -= 3;
      scores[ProtocolType.A2A].reasons.push("A2A 依赖中心化端点");
    }

    // ---- 延迟要求评分 ----

    if (requirements.latencyRequirement === "low") {
      scores[ProtocolType.MCP].score += 3;
      scores[ProtocolType.MCP].reasons.push("MCP 直连，延迟最低");
      scores[ProtocolType.A2A].score += 2;
      scores[ProtocolType.ANP].score -= 2;
      scores[ProtocolType.ANP].reasons.push("ANP DHT 查询增加延迟");
    }

    // ---- 安全要求评分 ----

    if (requirements.securityLevel === "maximum") {
      scores[ProtocolType.ANP].score += 5;
      scores[ProtocolType.ANP].reasons.push("ANP 提供 DID 认证 + 端到端加密");
      scores[ProtocolType.A2A].score += 3;
      scores[ProtocolType.A2A].reasons.push("A2A 支持 OAuth 2.0 + mTLS");
    }

    // ---- 目标信息评分 ----

    if (targetAgent.url && !targetAgent.did) {
      scores[ProtocolType.A2A].score += 3;
      scores[ProtocolType.MCP].score += 3;
      scores[ProtocolType.ANP].score -= 2;
    }

    if (targetAgent.did && !targetAgent.url) {
      scores[ProtocolType.ANP].score += 5;
    }

    if (!targetAgent.url && !targetAgent.did && targetAgent.name) {
      scores[ProtocolType.ANP].score += 5;
      scores[ProtocolType.ANP].reasons.push("仅知名称，需要发现机制");
    }

    // ---- 确定最优协议 ----

    const sorted = Object.entries(scores).sort(
      ([, a], [, b]) => b.score - a.score
    ) as [ProtocolType, { score: number; reasons: string[] }][];

    const best = sorted[0];
    const fallback = sorted[1];
    const maxScore = Math.max(...sorted.map(([, s]) => s.score));

    const result: NegotiationResult = {
      recommendedProtocol: best[0],
      confidence: maxScore > 0 ? best[1].score / (maxScore * 1.5) : 0,
      reasoning: best[1].reasons.join("; "),
      fallbackProtocol: fallback[1].score > 0 ? fallback[0] : undefined,
      estimatedLatency: this.estimateLatency(best[0]),
      securityLevel: this.assessSecurityLevel(best[0], requirements.securityLevel),
    };

    // 记录历史
    this.negotiationHistory.push({
      request,
      result,
      timestamp: new Date(),
    });

    return result;
  }

  /**
   * 批量协商（为多个目标选择协议）
   */
  negotiateBatch(
    requests: NegotiationRequest[]
  ): NegotiationResult[] {
    return requests.map((r) => this.negotiate(r));
  }

  /**
   * 获取协商历史统计
   */
  getHistoryStats(): {
    total: number;
    byProtocol: Record<string, number>;
    averageConfidence: number;
  } {
    const byProtocol: Record<string, number> = {};
    let totalConfidence = 0;

    for (const entry of this.negotiationHistory) {
      const proto = entry.result.recommendedProtocol;
      byProtocol[proto] = (byProtocol[proto] ?? 0) + 1;
      totalConfidence += entry.result.confidence;
    }

    return {
      total: this.negotiationHistory.length,
      byProtocol,
      averageConfidence:
        this.negotiationHistory.length > 0
          ? totalConfidence / this.negotiationHistory.length
          : 0,
    };
  }

  // ---- 私有方法 ----

  private estimateLatency(protocol: ProtocolType): string {
    switch (protocol) {
      case ProtocolType.MCP:
        return "<50ms（直连）";
      case ProtocolType.A2A:
        return "50-200ms（HTTP RPC）";
      case ProtocolType.ANP:
        return "200-1000ms（DHT + P2P）";
    }
  }

  private assessSecurityLevel(
    protocol: ProtocolType,
    required?: string
  ): string {
    switch (protocol) {
      case ProtocolType.MCP:
        return "TLS 传输加密";
      case ProtocolType.A2A:
        return "OAuth 2.0 + TLS";
      case ProtocolType.ANP:
        return "DID 认证 + 端到端加密";
    }
  }
}

// ---- 使用示例 ----

function protocolNegotiationDemo(): void {
  const registry = new ProtocolRegistry();
  const negotiator = new ProtocolNegotiator(registry);

  // 场景 1：调用外部工具
  const toolResult = negotiator.negotiate({
    targetAgent: { url: "https://tools.example.com" },
    requirements: { type: "tool-call", latencyRequirement: "low" },
  });
  console.log(`工具调用 → ${toolResult.recommendedProtocol} (${toolResult.reasoning})`);

  // 场景 2：企业级任务委托
  const enterpriseResult = negotiator.negotiate({
    targetAgent: { url: "https://enterprise-agent.example.com" },
    requirements: {
      type: "task-delegation",
      needEnterprise: true,
      securityLevel: "enhanced",
    },
  });
  console.log(`企业委托 → ${enterpriseResult.recommendedProtocol} (${enterpriseResult.reasoning})`);

  // 场景 3：发现未知 Agent
  const discoveryResult = negotiator.negotiate({
    targetAgent: { name: "翻译服务" },
    requirements: {
      type: "discovery",
      needDecentralized: true,
    },
  });
  console.log(`发现服务 → ${discoveryResult.recommendedProtocol} (${discoveryResult.reasoning})`);
}
```

---

## 20.6 协议安全

Agent 互操作协议的安全性直接决定了 Agent 系统的可信度。本节深入分析三大协议的安全模型，并实现统一的安全管理器。

### 20.6.1 安全威胁全景

```
┌─────────────────────────────────────────────────────────────┐
│                  Agent 互操作安全威胁模型                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  MCP 威胁                                                   │
│  ├── 服务端投毒：恶意 MCP Server 返回有害工具结果               │
│  ├── 工具注入：通过恶意工具描述诱导 Agent 执行危险操作           │
│  ├── 资源泄露：未授权访问敏感资源                              │
│  └── 传输窃听：非 TLS 传输中的中间人攻击                       │
│                                                             │
│  A2A 威胁                                                   │
│  ├── 任务注入：伪造任务请求欺骗 Agent 执行                     │
│  ├── Agent 冒充：伪造 Agent Card 冒充合法 Agent               │
│  ├── 数据外泄：任务数据在传输中被截获                           │
│  └── 信任链断裂：OAuth 2.1 Token 被窃取或伪造                 │
│                                                             │
│  ANP 威胁                                                   │
│  ├── DID 劫持：控制 DID Document 的解析域名                   │
│  ├── Sybil 攻击：大量虚假 Agent 污染发现网络                  │
│  ├── 路由攻击：恶意中继节点篡改消息                            │
│  └── 密钥泄露：Agent 私钥被窃取导致身份被盗                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 20.6.2 统一安全管理器

```typescript
// ============================================================
// 统一协议安全管理器
// ============================================================

/** 安全事件类型 */
type SecurityEventType =
  | "auth_success"
  | "auth_failure"
  | "tool_blocked"
  | "resource_denied"
  | "task_rejected"
  | "agent_impersonation"
  | "message_tampered"
  | "key_rotation"
  | "policy_violation";

/** 安全事件 */
interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: "info" | "warning" | "critical";
  protocol: ProtocolType;
  timestamp: string;
  source: string;
  target?: string;
  details: Record<string, unknown>;
  mitigationApplied?: string;
}

/** 安全策略 */
interface SecurityPolicy {
  /** MCP 安全策略 */
  mcp: {
    requireTLS: boolean;
    serverAllowlist: string[];
    toolPermissions: {
      defaultAction: "allow" | "deny";
      rules: Array<{
        pattern: string;    // 工具名匹配模式
        action: "allow" | "deny" | "confirm";
        reason?: string;
      }>;
    };
    maxResourceSize: number;
    sessionTimeout: number;
  };
  /** A2A 安全策略 */
  a2a: {
    requireOAuth21: boolean;  // OAuth 2.1（强制 PKCE）
    trustedIssuers: string[];
    agentCardVerification: "strict" | "relaxed" | "none";
    taskRateLimit: { maxPerMinute: number; maxConcurrent: number };
    complianceRequired: string[];
    enterpriseAudit: boolean;
  };
  /** ANP 安全策略 */
  anp: {
    acceptedDIDMethods: DIDMethod[];
    requireSignedMessages: boolean;
    endToEndEncryption: boolean;
    trustScoreThreshold: number;
    maxRelayHops: number;
    blacklistedDIDs: string[];
  };
}

class ProtocolSecurityManager {
  private policy: SecurityPolicy;
  private eventLog: SecurityEvent[] = [];
  private rateLimitCounters: Map<string, { count: number; windowStart: number }> = new Map();
  private blockedEntities: Set<string> = new Set();

  constructor(policy: SecurityPolicy) {
    this.policy = policy;
  }

  // ---- MCP 安全检查 ----

  /**
   * 验证 MCP 服务端
   */
  validateMCPServer(serverUrl: string): {
    allowed: boolean;
    reason?: string;
  } {
    if (this.policy.mcp.requireTLS && !serverUrl.startsWith("https://")) {
      this.logSecurityEvent({
        type: "policy_violation",
        severity: "critical",
        protocol: ProtocolType.MCP,
        source: serverUrl,
        details: { violation: "非 TLS 连接" },
      });
      return { allowed: false, reason: "策略要求 TLS 加密连接" };
    }

    const origin = new URL(serverUrl).origin;
    if (this.policy.mcp.serverAllowlist.length > 0) {
      const isAllowed = this.policy.mcp.serverAllowlist.some(
        (allowed) => origin.includes(allowed)
      );
      if (!isAllowed) {
        this.logSecurityEvent({
          type: "auth_failure",
          severity: "warning",
          protocol: ProtocolType.MCP,
          source: serverUrl,
          details: { reason: "服务端不在白名单中" },
        });
        return { allowed: false, reason: "MCP 服务端不在白名单中" };
      }
    }

    return { allowed: true };
  }

  /**
   * 检查 MCP 工具调用权限
   */
  checkMCPToolPermission(toolName: string): {
    allowed: boolean;
    action: "allow" | "deny" | "confirm";
    reason?: string;
  } {
    const { defaultAction, rules } = this.policy.mcp.toolPermissions;

    // 检查具体规则
    for (const rule of rules) {
      const regex = new RegExp(rule.pattern);
      if (regex.test(toolName)) {
        if (rule.action === "deny") {
          this.logSecurityEvent({
            type: "tool_blocked",
            severity: "warning",
            protocol: ProtocolType.MCP,
            source: toolName,
            details: { reason: rule.reason ?? "匹配拒绝规则" },
          });
        }
        return {
          allowed: rule.action !== "deny",
          action: rule.action,
          reason: rule.reason,
        };
      }
    }

    return {
      allowed: defaultAction === "allow",
      action: defaultAction,
    };
  }

  // ---- A2A 安全检查 ----

  /**
   * 验证 A2A Agent Card
   */
  async validateAgentCard(card: AgentCard): Promise<{
    valid: boolean;
    trustLevel: "high" | "medium" | "low" | "untrusted";
    issues: string[];
  }> {
    const issues: string[] = [];
    let trustLevel: "high" | "medium" | "low" | "untrusted" = "untrusted";

    // 基本字段验证
    if (!card.name || !card.url || !card.skills?.length) {
      issues.push("Agent Card 缺少必要字段");
    }

    // 认证方式验证
    if (this.policy.a2a.requireOAuth21) {
      const hasOAuth = card.authentication?.schemes.some(
        (s) => s.scheme === "oauth2"
      );
      if (!hasOAuth) {
        issues.push("策略要求 OAuth 2.0 认证，但 Agent Card 未声明");
      }
    }

    // 合规验证（ACP 特性）
    if (this.policy.a2a.complianceRequired.length > 0) {
      const agentCompliance = card.enterprise?.compliance?.standards ?? [];
      for (const required of this.policy.a2a.complianceRequired) {
        if (!agentCompliance.includes(required)) {
          issues.push(`缺少必要合规标准: ${required}`);
        }
      }
    }

    // URL 可达性验证
    if (this.policy.a2a.agentCardVerification === "strict") {
      try {
        const response = await fetch(card.url, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
          issues.push(`Agent 端点不可达: ${response.status}`);
        }
      } catch {
        issues.push("Agent 端点验证超时");
      }
    }

    // 计算信任等级
    if (issues.length === 0) {
      trustLevel = card.enterprise?.trust ? "high" : "medium";
    } else if (issues.length <= 2) {
      trustLevel = "low";
    }

    if (issues.length > 0) {
      this.logSecurityEvent({
        type: "auth_failure",
        severity: issues.length > 2 ? "critical" : "warning",
        protocol: ProtocolType.A2A,
        source: card.url,
        details: { issues },
      });
    }

    return { valid: issues.length === 0, trustLevel, issues };
  }

  /**
   * A2A 请求速率限制
   */
  checkA2ARateLimit(agentId: string): {
    allowed: boolean;
    retryAfterMs?: number;
  } {
    const key = `a2a-rate-${agentId}`;
    const now = Date.now();
    const windowMs = 60000; // 1 分钟窗口

    let counter = this.rateLimitCounters.get(key);
    if (!counter || now - counter.windowStart > windowMs) {
      counter = { count: 0, windowStart: now };
      this.rateLimitCounters.set(key, counter);
    }

    counter.count++;

    if (counter.count > this.policy.a2a.taskRateLimit.maxPerMinute) {
      const retryAfterMs = windowMs - (now - counter.windowStart);
      this.logSecurityEvent({
        type: "policy_violation",
        severity: "warning",
        protocol: ProtocolType.A2A,
        source: agentId,
        details: {
          violation: "速率限制超出",
          count: counter.count,
          limit: this.policy.a2a.taskRateLimit.maxPerMinute,
        },
      });
      return { allowed: false, retryAfterMs };
    }

    return { allowed: true };
  }

  // ---- ANP 安全检查 ----

  /**
   * 验证 ANP DID
   */
  validateDID(did: string): { valid: boolean; reason?: string } {
    // 检查 DID 格式
    const didRegex = /^did:(\w+):(.+)$/;
    const match = did.match(didRegex);
    if (!match) {
      return { valid: false, reason: "无效的 DID 格式" };
    }

    // 检查 DID 方法是否被接受
    const method = match[1] as DIDMethod;
    if (!this.policy.anp.acceptedDIDMethods.includes(method)) {
      return {
        valid: false,
        reason: `不接受的 DID 方法: ${method}。允许: ${this.policy.anp.acceptedDIDMethods.join(", ")}`,
      };
    }

    // 检查黑名单
    if (this.policy.anp.blacklistedDIDs.includes(did)) {
      this.logSecurityEvent({
        type: "auth_failure",
        severity: "critical",
        protocol: ProtocolType.ANP,
        source: did,
        details: { reason: "DID 在黑名单中" },
      });
      return { valid: false, reason: "DID 已被列入黑名单" };
    }

    return { valid: true };
  }

  /**
   * 验证 ANP 消息签名
   */
  async validateMessageSignature(message: ANPMessage): Promise<{
    valid: boolean;
    reason?: string;
  }> {
    if (!this.policy.anp.requireSignedMessages) {
      return { valid: true };
    }

    if (!message.metadata.signature) {
      return { valid: false, reason: "消息缺少签名（策略要求签名）" };
    }

    // 在完整实现中，这里需要：
    // 1. 解析发送方的 DID
    // 2. 获取 DID Document 中的公钥
    // 3. 验证签名

    // 简化示例
    return { valid: true };
  }

  // ---- 安全事件管理 ----

  /**
   * 记录安全事件
   */
  private logSecurityEvent(
    event: Omit<SecurityEvent, "id" | "timestamp">
  ): void {
    const fullEvent: SecurityEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };

    this.eventLog.push(fullEvent);

    // 关键事件自动触发响应
    if (event.severity === "critical") {
      this.handleCriticalEvent(fullEvent);
    }

    console.log(
      `[Security] [${event.severity.toUpperCase()}] ${event.type}: ` +
      `${event.source} (${event.protocol})`
    );
  }

  /**
   * 处理关键安全事件
   */
  private handleCriticalEvent(event: SecurityEvent): void {
    // 自动封禁攻击来源
    if (event.source) {
      this.blockedEntities.add(event.source);
      console.warn(
        `[Security] 已自动封禁: ${event.source} (原因: ${event.type})`
      );
    }
  }

  /**
   * 获取安全事件统计
   */
  getSecurityStats(): {
    totalEvents: number;
    bySeverity: Record<string, number>;
    byProtocol: Record<string, number>;
    byType: Record<string, number>;
    blockedEntities: number;
  } {
    const bySeverity: Record<string, number> = {};
    const byProtocol: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const event of this.eventLog) {
      bySeverity[event.severity] = (bySeverity[event.severity] ?? 0) + 1;
      byProtocol[event.protocol] = (byProtocol[event.protocol] ?? 0) + 1;
      byType[event.type] = (byType[event.type] ?? 0) + 1;
    }

    return {
      totalEvents: this.eventLog.length,
      bySeverity,
      byProtocol,
      byType,
      blockedEntities: this.blockedEntities.size,
    };
  }

  /**
   * 导出安全报告
   */
  exportSecurityReport(): string {
    const stats = this.getSecurityStats();
    const criticalEvents = this.eventLog.filter(
      (e) => e.severity === "critical"
    );

    return JSON.stringify({
      reportDate: new Date().toISOString(),
      summary: stats,
      criticalEvents,
      recommendations: this.generateRecommendations(),
    }, null, 2);
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    const stats = this.getSecurityStats();

    if ((stats.bySeverity["critical"] ?? 0) > 0) {
      recommendations.push("存在关键安全事件，建议立即审查封禁的实体列表");
    }

    if ((stats.byType["auth_failure"] ?? 0) > 5) {
      recommendations.push("认证失败次数较多，建议加强凭据管理和密钥轮换");
    }

    if ((stats.byType["tool_blocked"] ?? 0) > 0) {
      recommendations.push("存在被阻止的工具调用，建议审查 MCP 工具权限策略");
    }

    if ((stats.byType["policy_violation"] ?? 0) > 3) {
      recommendations.push("策略违规频繁，建议审查和收紧安全策略");
    }

    return recommendations;
  }
}

// ---- 安全策略配置示例 ----

const defaultSecurityPolicy: SecurityPolicy = {
  mcp: {
    requireTLS: true,
    serverAllowlist: ["tools.example.com", "mcp.trusted.org"],
    toolPermissions: {
      defaultAction: "allow",
      rules: [
        {
          pattern: "^(exec|shell|system)_.*",
          action: "deny",
          reason: "禁止执行系统命令类工具",
        },
        {
          pattern: "^(delete|remove|drop)_.*",
          action: "confirm",
          reason: "破坏性操作需要确认",
        },
        {
          pattern: "^(read|search|analyze)_.*",
          action: "allow",
          reason: "只读操作默认允许",
        },
      ],
    },
    maxResourceSize: 10 * 1024 * 1024, // 10MB
    sessionTimeout: 3600, // 1 小时
  },
  a2a: {
    requireOAuth21: true,  // OAuth 2.1（强制 PKCE，禁止隐式授权）
    trustedIssuers: ["https://auth.example.com", "https://accounts.google.com"],
    agentCardVerification: "strict",
    taskRateLimit: { maxPerMinute: 60, maxConcurrent: 10 },
    complianceRequired: ["SOC2"],
    enterpriseAudit: true,
  },
  anp: {
    acceptedDIDMethods: ["web", "key"],
    requireSignedMessages: true,
    endToEndEncryption: true,
    trustScoreThreshold: 40,
    maxRelayHops: 3,
    blacklistedDIDs: [],
  },
};
```

---
## 20.7 协议选型指南

面对 MCP、A2A、ANP 三大协议，工程团队常常陷入选型困境。本节提供系统化的决策框架和实现参考。

### 20.7.1 决策树

```
你的 Agent 需要做什么？
│
├── 调用外部工具/获取数据 ──────────────────→ MCP
│   ├── 工具在本地进程中？ ─→ MCP (stdio 传输)
│   └── 工具是远程服务？ ──→ MCP (Streamable HTTP)
│
├── 与其他 Agent 协作
│   ├── 合作方已知且固定？ ──→ A2A
│   │   ├── 需要企业合规？ ─→ A2A (启用企业扩展)
│   │   └── 轻量级协作？ ──→ A2A (基础模式)
│   │
│   └── 合作方未知，需要发现？ ──→ ANP + A2A
│       ├── 发现阶段 ─────→ ANP (DID + DHT)
│       └── 协作阶段 ─────→ A2A (Task 生命周期)
│
├── 需要去中心化能力
│   ├── 无中心服务器？ ────→ ANP
│   ├── 隐私敏感场景？ ────→ ANP (did:peer)
│   └── 开放网络互发现？ ──→ ANP
│
└── 复合场景 ──────────────→ 组合使用
    ├── ANP 发现 + A2A 协作 + MCP 工具
    └── 使用 UnifiedAgentGateway
```

### 20.7.2 实现复杂度对比

| 维度 | MCP | A2A | ANP |
|------|-----|-----|-----|
| **最小可用实现** | ~200 行 | ~400 行 | ~600 行 |
| **SDK 成熟度** | 高（官方 TypeScript/Python） | 中（Google 示例） | 低（社区早期） |
| **学习曲线** | 低（JSON-RPC + 3 原语） | 中（状态机 + SSE） | 高（DID + DHT + 密码学） |
| **部署复杂度** | 低（单进程或 HTTP） | 中（需要 OAuth + 端点） | 高（需要 DHT 网络） |
| **调试工具** | MCP Inspector | A2A Playground | 有限 |
| **生产案例** | 大量 | 增长中 | 早期试验 |

### 20.7.3 性能特征

```typescript
// ============================================================
// 协议性能基准测试框架
// ============================================================

interface BenchmarkResult {
  protocol: ProtocolType;
  operation: string;
  samples: number;
  latency: {
    p50: number;
    p95: number;
    p99: number;
    mean: number;
  };
  throughput: {
    requestsPerSecond: number;
    bytesPerSecond: number;
  };
  errors: number;
}

class ProtocolBenchmark {
  private results: BenchmarkResult[] = [];

  /**
   * 执行延迟基准测试
   */
  async benchmarkLatency(
    protocol: ProtocolType,
    operation: string,
    fn: () => Promise<void>,
    samples: number = 100
  ): Promise<BenchmarkResult> {
    const latencies: number[] = [];
    let errors = 0;

    for (let i = 0; i < samples; i++) {
      const start = performance.now();
      try {
        await fn();
        latencies.push(performance.now() - start);
      } catch {
        errors++;
      }
    }

    latencies.sort((a, b) => a - b);

    const result: BenchmarkResult = {
      protocol,
      operation,
      samples,
      latency: {
        p50: latencies[Math.floor(latencies.length * 0.5)] ?? 0,
        p95: latencies[Math.floor(latencies.length * 0.95)] ?? 0,
        p99: latencies[Math.floor(latencies.length * 0.99)] ?? 0,
        mean: latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1),
      },
      throughput: {
        requestsPerSecond:
          latencies.length > 0
            ? 1000 / (latencies.reduce((a, b) => a + b, 0) / latencies.length)
            : 0,
        bytesPerSecond: 0, // 需要实际数据量计算
      },
      errors,
    };

    this.results.push(result);
    return result;
  }

  /**
   * 执行吞吐量基准测试
   */
  async benchmarkThroughput(
    protocol: ProtocolType,
    operation: string,
    fn: () => Promise<number>,  // 返回字节数
    durationMs: number = 10000
  ): Promise<BenchmarkResult> {
    const start = performance.now();
    let totalBytes = 0;
    let requestCount = 0;
    let errors = 0;
    const latencies: number[] = [];

    while (performance.now() - start < durationMs) {
      const reqStart = performance.now();
      try {
        const bytes = await fn();
        totalBytes += bytes;
        requestCount++;
        latencies.push(performance.now() - reqStart);
      } catch {
        errors++;
      }
    }

    const elapsed = performance.now() - start;
    latencies.sort((a, b) => a - b);

    const result: BenchmarkResult = {
      protocol,
      operation,
      samples: requestCount,
      latency: {
        p50: latencies[Math.floor(latencies.length * 0.5)] ?? 0,
        p95: latencies[Math.floor(latencies.length * 0.95)] ?? 0,
        p99: latencies[Math.floor(latencies.length * 0.99)] ?? 0,
        mean: latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1),
      },
      throughput: {
        requestsPerSecond: (requestCount / elapsed) * 1000,
        bytesPerSecond: (totalBytes / elapsed) * 1000,
      },
      errors,
    };

    this.results.push(result);
    return result;
  }

  /**
   * 生成对比报告
   */
  generateReport(): string {
    let report = "# 协议性能基准测试报告\n\n";
    report += `测试时间: ${new Date().toISOString()}\n\n`;

    // 按协议分组
    const grouped = new Map<ProtocolType, BenchmarkResult[]>();
    for (const result of this.results) {
      if (!grouped.has(result.protocol)) {
        grouped.set(result.protocol, []);
      }
      grouped.get(result.protocol)!.push(result);
    }

    for (const [protocol, results] of grouped) {
      report += `## ${protocol.toUpperCase()}\n\n`;
      report += "| 操作 | P50 (ms) | P95 (ms) | P99 (ms) | 吞吐量 (req/s) | 错误率 |\n";
      report += "|------|----------|----------|----------|---------------|--------|\n";

      for (const r of results) {
        const errorRate = r.samples > 0
          ? `${((r.errors / r.samples) * 100).toFixed(1)}%`
          : "N/A";
        report += `| ${r.operation} | ${r.latency.p50.toFixed(1)} | ` +
          `${r.latency.p95.toFixed(1)} | ${r.latency.p99.toFixed(1)} | ` +
          `${r.throughput.requestsPerSecond.toFixed(1)} | ${errorRate} |\n`;
      }
      report += "\n";
    }

    return report;
  }
}
```

### 20.7.4 迁移路径

从传统集成方式迁移到标准化协议的建议路径：

```
阶段 1：MCP 化（2-4 周）
├── 将现有 REST API 封装为 MCP Server
├── 将文件系统访问封装为 MCP Resource
├── 将常用提示封装为 MCP Prompt
└── 验收：Agent 可通过 MCP 访问所有现有工具

阶段 2：A2A 化（4-8 周）
├── 为每个 Agent 创建 Agent Card
├── 实现 Task 生命周期管理
├── 添加 SSE 流式支持
├── （可选）集成企业扩展（审计、合规）
└── 验收：Agent 可通过 A2A 互相委托任务

阶段 3：ANP 集成（8-12 周，可选）
├── 为 Agent 分配 DID 身份
├── 集成 DHT 发现网络
├── 实现消息路由和端到端加密
└── 验收：Agent 可在开放网络中被发现

阶段 4：统一网关（2-4 周）
├── 部署 UnifiedAgentGateway
├── 配置协议桥接规则
├── 实现安全策略
└── 验收：单一入口支持所有协议
```

### 20.7.5 协议顾问实现

```typescript
// ============================================================
// 协议顾问 —— 基于项目特征推荐协议组合
// ============================================================

/** 项目特征 */
interface ProjectProfile {
  /** 项目规模 */
  scale: "small" | "medium" | "large" | "enterprise";
  /** 团队技术栈 */
  techStack: string[];
  /** Agent 数量 */
  agentCount: number;
  /** 是否需要跨组织协作 */
  crossOrganization: boolean;
  /** 是否需要合规 */
  complianceNeeded: boolean;
  /** 是否需要去中心化 */
  decentralizationNeeded: boolean;
  /** 延迟敏感度 */
  latencySensitivity: "high" | "medium" | "low";
  /** 预算约束 */
  budgetConstraint: "tight" | "moderate" | "flexible";
  /** 现有集成 */
  existingIntegrations: string[];
  /** 安全要求等级 */
  securityLevel: "basic" | "enhanced" | "maximum";
}

/** 推荐方案 */
interface ProtocolRecommendation {
  /** 推荐的协议组合 */
  protocols: Array<{
    type: ProtocolType;
    priority: "primary" | "secondary" | "optional";
    useCase: string;
    estimatedEffort: string;
  }>;
  /** 架构建议 */
  architecture: string;
  /** 实施路线图 */
  roadmap: Array<{
    phase: number;
    title: string;
    duration: string;
    tasks: string[];
  }>;
  /** 风险提示 */
  risks: string[];
  /** 总体评分 */
  confidence: number;
}

class ProtocolAdvisor {
  /**
   * 根据项目特征生成推荐方案
   */
  recommend(profile: ProjectProfile): ProtocolRecommendation {
    const protocols: ProtocolRecommendation["protocols"] = [];
    const risks: string[] = [];
    const roadmap: ProtocolRecommendation["roadmap"] = [];

    // ---- MCP 评估 ----
    // MCP 几乎在所有场景中都是必要的
    protocols.push({
      type: ProtocolType.MCP,
      priority: "primary",
      useCase: "Agent 与工具/资源的标准化交互",
      estimatedEffort: this.estimateMCPEffort(profile),
    });

    roadmap.push({
      phase: 1,
      title: "MCP 集成",
      duration: profile.existingIntegrations.length > 5 ? "4 周" : "2 周",
      tasks: [
        "将现有工具封装为 MCP Server",
        "实现 Streamable HTTP 传输",
        "配置工具权限策略",
        "集成测试验证",
      ],
    });

    // ---- A2A 评估 ----
    if (profile.agentCount > 1 || profile.crossOrganization) {
      const a2aPriority = profile.crossOrganization ? "primary" : "secondary";
      protocols.push({
        type: ProtocolType.A2A,
        priority: a2aPriority as "primary" | "secondary",
        useCase: profile.complianceNeeded
          ? "Agent 间协作（含企业合规，源自 ACP 合并特性）"
          : "Agent 间任务委托与协作",
        estimatedEffort: this.estimateA2AEffort(profile),
      });

      const a2aTasks = [
        "创建 Agent Card",
        "实现 Task 生命周期管理",
        "添加 SSE 流式支持",
        "配置 OAuth 2.0 认证",
      ];

      if (profile.complianceNeeded) {
        a2aTasks.push("集成审计追踪（ACP 企业扩展）");
        a2aTasks.push("配置合规元数据");
      }

      roadmap.push({
        phase: 2,
        title: "A2A 集成",
        duration: profile.complianceNeeded ? "6 周" : "4 周",
        tasks: a2aTasks,
      });
    }

    // ---- ANP 评估 ----
    if (profile.decentralizationNeeded ||
        (profile.crossOrganization && profile.securityLevel === "maximum")) {
      protocols.push({
        type: ProtocolType.ANP,
        priority: profile.decentralizationNeeded ? "secondary" : "optional",
        useCase: "去中心化 Agent 发现与端到端安全通信",
        estimatedEffort: this.estimateANPEffort(profile),
      });

      roadmap.push({
        phase: 3,
        title: "ANP 集成",
        duration: "8-12 周",
        tasks: [
          "分配 DID 身份",
          "集成 DHT 发现网络",
          "实现消息路由",
          "配置端到端加密",
          "安全审计",
        ],
      });

      risks.push("ANP 生态尚不成熟，可能面临工具和社区支持不足的问题");
      risks.push("DHT 网络在小规模部署中可能效率不高");
    }

    // ---- 统一网关 ----
    if (protocols.length > 1) {
      roadmap.push({
        phase: roadmap.length + 1,
        title: "统一网关部署",
        duration: "2-4 周",
        tasks: [
          "部署 UnifiedAgentGateway",
          "配置协议桥接",
          "实现安全策略",
          "性能测试",
          "监控配置",
        ],
      });
    }

    // ---- 风险评估 ----
    if (profile.scale === "enterprise" && !profile.complianceNeeded) {
      risks.push("企业规模项目建议启用 A2A 合规扩展");
    }

    if (profile.budgetConstraint === "tight" && protocols.length > 2) {
      risks.push("预算有限情况下建议先聚焦 MCP + A2A，ANP 后续引入");
    }

    if (profile.latencySensitivity === "high" && protocols.some(
      (p) => p.type === ProtocolType.ANP
    )) {
      risks.push("ANP 的 DHT 查询延迟可能影响高延迟敏感场景");
    }

    // ---- 架构建议 ----
    const architecture = this.generateArchitectureAdvice(profile, protocols);

    return {
      protocols,
      architecture,
      roadmap,
      risks,
      confidence: this.calculateConfidence(profile, protocols),
    };
  }

  /**
   * 快速问答式推荐
   */
  quickRecommend(question: string): string {
    const qLower = question.toLowerCase();

    if (qLower.includes("工具") || qLower.includes("tool") || qLower.includes("api")) {
      return "推荐 MCP：Agent 与工具交互的标准协议，使用 Streamable HTTP 传输。";
    }

    if (qLower.includes("协作") || qLower.includes("任务") || qLower.includes("委托")) {
      return "推荐 A2A：Agent 间任务委托协议。如需企业合规，启用 ACP 合并后的企业扩展模块。";
    }

    if (qLower.includes("发现") || qLower.includes("去中心") || qLower.includes("did")) {
      return "推荐 ANP：去中心化 Agent 发现协议。注意 ANP 仍处于早期阶段。";
    }

    if (qLower.includes("企业") || qLower.includes("合规") || qLower.includes("审计")) {
      return "推荐 A2A + 企业扩展：2025 年 8 月 ACP 合并入 A2A 后，审计追踪、合规元数据等特性已内置。";
    }

    return "请描述具体场景以获得精准推荐。一般建议：MCP(工具) + A2A(协作) 是最常见的组合。";
  }

  // ---- 私有方法 ----

  private estimateMCPEffort(profile: ProjectProfile): string {
    const integrations = profile.existingIntegrations.length;
    if (integrations <= 3) return "1-2 周";
    if (integrations <= 10) return "2-4 周";
    return "4-6 周";
  }

  private estimateA2AEffort(profile: ProjectProfile): string {
    if (profile.complianceNeeded) return "4-8 周（含企业扩展）";
    if (profile.crossOrganization) return "3-6 周（含跨组织认证）";
    return "2-4 周";
  }

  private estimateANPEffort(profile: ProjectProfile): string {
    return "8-12 周（含密码学实现和 DHT 集成）";
  }

  private generateArchitectureAdvice(
    profile: ProjectProfile,
    protocols: ProtocolRecommendation["protocols"]
  ): string {
    const protocolNames = protocols.map((p) => p.type).join(" + ");

    if (protocols.length === 1) {
      return `单协议架构 (${protocolNames})：直接集成，无需网关层。` +
        `适合 ${profile.scale} 规模项目。`;
    }

    if (protocols.length === 2 && !protocols.some((p) => p.type === ProtocolType.ANP)) {
      return `双协议架构 (${protocolNames})：使用 ProtocolBridge 连接 MCP 和 A2A。` +
        `MCP 负责工具层，A2A 负责协作层。建议部署 UnifiedAgentGateway。`;
    }

    return `三协议架构 (${protocolNames})：完整的分层互操作栈。` +
      `ANP 层负责发现，A2A 层负责协作，MCP 层负责工具。` +
      `必须部署 UnifiedAgentGateway 和 ProtocolBridge。` +
      `建议配备完整的安全策略和监控体系。`;
  }

  private calculateConfidence(
    profile: ProjectProfile,
    protocols: ProtocolRecommendation["protocols"]
  ): number {
    let confidence = 0.7; // 基础分

    // MCP 成熟度高，增加信心
    if (protocols.some((p) => p.type === ProtocolType.MCP)) {
      confidence += 0.1;
    }

    // A2A 社区活跃，有案例
    if (protocols.some((p) => p.type === ProtocolType.A2A && p.priority === "primary")) {
      confidence += 0.05;
    }

    // ANP 不成熟，降低信心
    if (protocols.some((p) => p.type === ProtocolType.ANP)) {
      confidence -= 0.1;
    }

    // 复杂度越高，信心越低
    if (protocols.length > 2) {
      confidence -= 0.05;
    }

    return Math.max(0.3, Math.min(1.0, confidence));
  }
}

// ---- 协议顾问使用示例 ----

function advisorDemo(): void {
  const advisor = new ProtocolAdvisor();

  // 场景 1：小型初创团队
  const startupRecommendation = advisor.recommend({
    scale: "small",
    techStack: ["TypeScript", "Node.js"],
    agentCount: 2,
    crossOrganization: false,
    complianceNeeded: false,
    decentralizationNeeded: false,
    latencySensitivity: "medium",
    budgetConstraint: "tight",
    existingIntegrations: ["GitHub API", "Slack"],
    securityLevel: "basic",
  });

  console.log("=== 初创团队推荐 ===");
  for (const p of startupRecommendation.protocols) {
    console.log(`${p.priority}: ${p.type} — ${p.useCase}`);
  }

  // 场景 2：企业级 Agent 平台
  const enterpriseRecommendation = advisor.recommend({
    scale: "enterprise",
    techStack: ["TypeScript", "Java", "Python"],
    agentCount: 50,
    crossOrganization: true,
    complianceNeeded: true,
    decentralizationNeeded: true,
    latencySensitivity: "medium",
    budgetConstraint: "flexible",
    existingIntegrations: [
      "Salesforce", "SAP", "ServiceNow", "Jira", "Confluence",
      "Slack", "Teams", "Datadog", "PagerDuty",
    ],
    securityLevel: "maximum",
  });

  console.log("\n=== 企业平台推荐 ===");
  for (const p of enterpriseRecommendation.protocols) {
    console.log(`${p.priority}: ${p.type} — ${p.useCase} (${p.estimatedEffort})`);
  }
  console.log(`架构: ${enterpriseRecommendation.architecture}`);
  console.log(`风险: ${enterpriseRecommendation.risks.join("; ")}`);

  // 快速问答
  console.log("\n=== 快速问答 ===");
  console.log(advisor.quickRecommend("我需要让 Agent 调用外部 API"));
  console.log(advisor.quickRecommend("多个 Agent 需要企业级合规的协作"));
  console.log(advisor.quickRecommend("在开放网络中发现合适的 Agent"));
}
```

---

## 20.8 本章小结

本章深入探讨了 2025 年 Agent 互操作协议生态的三大支柱——MCP、A2A、ANP——的架构设计、实现细节和协同工作模式。以下是本章的十大核心要点：

### 十大要点

**1. 三大协议互补而非竞争。** MCP 解决 Agent↔Tool 的问题，A2A 解决 Agent↔Agent 的问题，ANP 解决去中心化发现的问题。它们共同构成完整的分层互操作栈。

**2. MCP 已捐赠给 Linux Foundation AAIF。** 2025 年 12 月，Anthropic 将 MCP 捐赠给 AI Application Infrastructure Foundation，从企业主导走向社区治理。这意味着 MCP 的演进将更加开放和中立。

**3. Streamable HTTP 是 MCP 的新推荐传输。** 取代了此前的 SSE + stdio 方案，Streamable HTTP 提供单一端点、按需流式、会话管理等改进。所有新的 MCP 集成应优先使用此传输方式。

**4. ACP 已不再作为独立协议存在。** 2025 年 8 月，IBM 的 ACP 正式合并入 Google 的 A2A，在 Linux Foundation 治理下形成统一标准。开发者不需要在两者间做选择。

**5. A2A 现已具备企业级能力。** ACP 合并带来了审计追踪、合规元数据和多方信任等企业特性。需要合规的场景应启用 A2A 的企业扩展模块。

**6. ANP 是去中心化的新生力量。** 基于 DID 身份和 DHT 发现，ANP 填补了开放网络中 Agent 互发现的空白。但需注意其仍处于早期阶段，生产应用需谨慎评估。

**7. 协议桥接是实际工程的常见需求。** `ProtocolBridge` 和 `UnifiedAgentGateway` 的实现展示了如何在一个系统中同时支持多种协议，实现 MCP 工具调用到 A2A 任务委托的无缝转换。

**8. 安全是协议选型的首要考量。** MCP 的服务端投毒、A2A 的 Agent 冒充、ANP 的 Sybil 攻击——每种协议都有独特的安全威胁。`ProtocolSecurityManager` 提供了统一的安全策略管理。

**9. 协议选型取决于具体场景。** `ProtocolAdvisor` 的决策框架表明：小型项目只需 MCP，中型项目使用 MCP + A2A，大型企业平台可能需要三者组合。不要过度工程化。

**10. 协议生态正在快速演进。** 2025 年的协议格局与 2024 年截然不同。工程团队应关注 AAIF（MCP）和 Linux Foundation（A2A）的最新动态，保持协议版本的及时更新。

### 回顾与前瞻

本章与前面章节的关联：

- **第 6 章（工具系统设计）**：MCP 是工具系统的标准化协议表达，第 6 章的工具设计模式可以直接映射为 MCP Tool。第 6 章还详细介绍了 Streamable HTTP 传输模式和 OAuth 2.1 授权框架的实现，与本章的协议层讨论形成互补。
- **第 9 章（Multi-Agent 编排基础）**：A2A 为 Multi-Agent 编排提供了标准化的跨进程、跨服务通信协议。

**展望第 21 章（Agent 生态与平台）：** 有了标准化的互操作协议，Agent 生态的构建才有了基础。第 21 章将探讨如何基于这些协议构建 Agent 市场、平台服务和治理框架——从"协议可以互操作"到"生态繁荣发展"的跨越。

---

> **工程格言：** 协议的价值不在于规范本身的精巧，而在于它能被多少不同的系统正确地实现和使用。选择成熟的协议，从最简单的集成开始，随需求演进逐步扩展协议栈——这是协议工程的务实之道。
