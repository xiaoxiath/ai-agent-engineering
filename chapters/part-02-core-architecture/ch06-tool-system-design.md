# 第 6 章 工具系统设计 — Agent 的手和脚
工具是 Agent 与外部世界交互的手和脚。没有工具的 Agent 只能思考和说话，有了工具它才能行动——发送邮件、查询数据库、操作文件系统、调用 API。但工具设计的质量直接决定了 Agent 的行为质量：一个描述含糊的工具会让 LLM 在错误的时机调用它；一个缺乏防护的工具可能导致灾难性的副作用。

Anthropic 在其 Agent 设计文档中提出了一个深刻的洞见：**工具的设计应该遵循 ACI（Agent-Computer Interface）原则，就像传统软件遵循 HCI（Human-Computer Interface）原则一样**。区别在于，你的"用户"不再是人类，而是一个通过自然语言理解世界的 LLM。这意味着工具的名称、描述和参数定义必须针对 LLM 的推理方式来优化。

本章首先讨论工具设计哲学（ACI 原则和 Poka-Yoke 防错设计），然后深入实现层面的关键模式（参数验证、错误处理、并发控制），最后介绍 MCP（Model Context Protocol）生态集成。

```mermaid
sequenceDiagram
    participant U as 用户
    participant A as Agent Core
    participant V as 参数验证
    participant T as 工具执行
    participant E as 错误处理
    U->>A: 用户请求
  // ... 省略 9 行
    else 执行失败
        T->>E: 错误处理
        E-->>A: 结构化错误+恢复建议
    end
    A-->>U: 最终回复
```


> **"An agent without tools is just a chatbot with ambitions."**
> — Andrej Karpathy（意译）

大语言模型（LLM）本身是一个"纯思维"的存在——它能推理、规划、生成文本，但无法直接与外部世界交互。工具系统（Tool System）赋予了 Agent "手和脚"，让它能够读取数据库、调用 API、操作文件系统、执行代码，乃至控制物理设备。

本章将从设计哲学出发，系统性地讲解如何构建一个**安全、可扩展、可测试**的工具系统。我们将覆盖以下核心主题：

- **ACI 设计哲学**：如何让 LLM "读懂"工具定义，减少 token 浪费
- **三段式工具描述**：标准化的工具描述框架
- **Poka-Yoke 防错设计**：从权限、速率、成本多维度保护工具执行
- **MCP 深度集成**：与 Model Context Protocol 的完整对接
- **工具编排**：依赖解析、熔断、缓存、重试的完整编排方案
- **工具测试与质量保证**：Mock、Schema 快照测试、性能基准
- **实战：DevOps 工具生态系统**：完整的部署工作流示例

---

## 6.1 ACI 设计哲学

### 6.1.1 什么是 ACI？

ACI（Agent-Computer Interface）是 Agent 与外部工具交互的界面设计范式。正如优秀的 GUI 设计让人类用户能直觉地操作计算机，优秀的 ACI 设计让 LLM 能准确地理解和调用工具。

ACI 设计的三大原则：

1. **命名即文档**（Naming as Documentation）：工具名和参数名本身就应传达足够信息
2. **最小认知负荷**（Minimal Cognitive Load）：LLM 无需复杂推理即可正确使用工具
3. **防错优于纠错**（Prevention over Correction）：通过设计消除误用可能性

### 6.1.2 命名规范与验证

工具命名是 ACI 的第一道关卡。一个好的工具名应当是**自描述的**——LLM 看到名字就知道这个工具做什么。

```typescript
/**
 * 工具命名验证器
 * 强制执行 <领域>_<动词>_<宾语> 的命名规范
 * 例如：github_create_issue, k8s_scale_deployment
 */
class ToolNameValidator {
  // 允许的动词白名单——限制动词集合可降低 LLM 歧义
  private static readonly ALLOWED_VERBS: ReadonlySet<string> = new Set([
  // ... 省略 116 行，完整实现见 code-examples/ 对应目录
interface ValidationResult {
  valid: boolean;
  errors: string[];
  suggestions: string[];
  tokenCost: number;
}
```

### 6.1.3 Tool Context Cost 分析

每一个注册到 Agent 的工具，其定义（名称 + 描述 + 参数 Schema）都会被注入到 system prompt 中，消耗宝贵的 context window。当工具数量增长到 50+ 时，仅工具定义就可能占据数千 token，严重挤压用户消息和推理空间。

```typescript
/**
 * 工具 Token 成本分析器
 * 精确计算每个工具定义在 context window 中的 token 开销
 */
class ToolContextCostAnalyzer {
  // 近似 token 计算：英文约 4 字符/token，中文约 1.5 字符/token
  private static readonly CHARS_PER_TOKEN_EN = 4;
  private static readonly CHARS_PER_TOKEN_ZH = 1.5;
  // ... 省略 103 行，完整实现见 code-examples/ 对应目录
  toolCount: number;
  averageTokensPerTool: number;
  costBreakdown: ToolCostReport[];
  topCostlyTools: ToolCostReport[];
  contextBudgetUsage: Record<string, number | string>;
}
```

### 6.1.4 自动描述生成器

手动撰写工具描述既耗时又容易不一致。`AutoDescriptionGenerator` 利用 LLM 从代码签名自动生成最优描述。

```typescript
/**
 * 自动工具描述生成器
 * 从 TypeScript 函数签名和 JSDoc 自动生成 LLM-friendly 的工具描述
 */
class AutoDescriptionGenerator {
  constructor(private readonly llmClient: LLMClient) {}

  /**
  // ... 省略 154 行，完整实现见 code-examples/ 对应目录
  complete(request: {
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ content: string }>;
}
```

### 6.1.5 工具复杂度分级

不同复杂度的工具需要不同的设计策略。我们将工具分为三个层级：

| 层级 | 类型 | 特征 | 示例 |
|------|------|------|------|
| L1 | Simple（简单工具） | 单次 API 调用，无状态 | `weather_get_current` |
| L2 | Compound（复合工具） | 多步骤，有内部状态 | `git_create_pull_request` |
| L3 | Composite（组合工具） | 编排其他工具 | `deploy_full_stack` |

```typescript
/**
 * 工具复杂度评分系统
 * 帮助开发者理解工具的复杂程度，指导设计决策
 */
enum ToolComplexityLevel {
  Simple = 'L1_SIMPLE',       // 单次调用，无副作用或可控副作用
  Compound = 'L2_COMPOUND',   // 多步骤，有条件逻辑
  Composite = 'L3_COMPOSITE', // 编排多个子工具
  // ... 省略 105 行，完整实现见 code-examples/ 对应目录
  sideEffectLevel: number;       // 0=无 1=读 2=写 3=破坏
  externalDependencies: number;
  errorPathCount: number;
  expectedDurationMs: number;
  subToolCount: number;
}
```

---

## 6.2 三段式工具描述

### 6.2.1 描述框架

优质的工具描述是 Agent 正确使用工具的基础。我们提出**三段式描述框架**：

```
第一段（WHAT）：一句话说明工具功能
第二段（WHEN）：使用场景、限制条件、与相似工具的区别
第三段（RETURNS）：返回值说明和可能的错误
```

这个框架源自一个关键洞察：**LLM 选择工具时的推理路径是 "我需要做什么 -> 哪个工具能做 -> 它会返回什么"**。三段式描述精确匹配了这个推理路径。

### 6.2.2 不同类型工具的描述示例

**只读工具（Read-only）**

```typescript
const searchDocsTool: ToolDefinition = {
  name: 'knowledge_search_docs',
  description: `在知识库中搜索与查询相关的文档片段。

使用场景：当用户提问涉及公司内部知识、产品文档、技术规范时调用。
支持语义搜索，无需精确关键词。每次最多返回 10 条结果。
不要用于：搜索用户个人数据（用 user_search_data）或实时新闻（用 web_search）。
  // ... 省略 7 行
      },
    },
    required: ['query'],
  },
};
```

**写入工具（Write）**

```typescript
const createIssueTool: ToolDefinition = {
  name: 'github_create_issue',
  description: `在 GitHub 仓库中创建新的 Issue。

使用场景：当用户要求报告 bug、提出需求或创建任务时调用。
调用前必须确认：仓库名（owner/repo 格式）、标题和正文内容。
如果用户未指定 labels 和 assignees，可以不填。
  // ... 省略 7 行
      },
    },
    required: ['repo', 'title', 'body'],
  },
};
```

**破坏性工具（Destructive）**

```typescript
const deleteDatabaseTool: ToolDefinition = {
  name: 'db_delete_records',
  description: `【危险操作】从数据库中永久删除匹配条件的记录。

使用场景：仅在用户明确要求删除数据时调用。
必须先调用 db_query_records 确认将要删除的记录数量和内容。
如果匹配记录超过 100 条，将拒绝执行并要求用户缩小范围。
  // ... 省略 7 行
      },
    },
    required: ['table', 'where'],
  },
};
```

**长时间运行工具（Long-running）**

```typescript
const deployServiceTool: ToolDefinition = {
  name: 'k8s_deploy_service',
  description: `部署或更新 Kubernetes 服务，这是一个长时间运行的操作（通常 2-10 分钟）。

使用场景：当用户要求部署新版本或更新服务配置时调用。
调用后返回 deploymentId，可通过 k8s_get_deployment_status 轮询进度。
不要等待部署完成后才回复用户——先告知 deploymentId，然后按需轮询。
  // ... 省略 7 行
      },
    },
    required: ['service', 'image', 'environment'],
  },
};
```

### 6.2.3 参数描述最佳实践

参数描述的质量直接影响 LLM 填参的准确率。以下是关键原则：

```typescript
/**
 * 参数描述质量检查器
 * 确保每个参数的描述满足 LLM-friendly 标准
 */
class ParameterDescriptionChecker {
  /** 检查参数描述质量 */
  static check(
  // ... 省略 7 行
interface ParameterCheckResult {
  paramName: string;
  issues: string[];
  quality: 'good' | 'fair' | 'poor';
}
```

### 6.2.4 LLM-Friendly 错误消息设计

工具执行失败时返回的错误信息同样重要。LLM 需要理解错误原因才能决定下一步行动。

```typescript
/**
 * LLM 友好的错误消息构建器
 * 生成结构化的错误信息，帮助 LLM 理解错误并采取正确行动
 */
class ToolErrorBuilder {
  /**
   * 构建标准化错误响应
   * 包含：错误类型 + 原因 + LLM 应采取的行动建议
  // ... 省略 65 行，完整实现见 code-examples/ 对应目录
  errorType: ToolErrorType;
  message: string;
  suggestedAction: string;
  retryable: boolean;
  invalidParams?: Array<{ param: string; reason: string }>;
}
```

---

## 6.3 Poka-Yoke 防错设计

Poka-Yoke（ポカヨケ）是丰田生产系统中的防错理念——**通过设计使错误不可能发生，而非依赖人的注意力**。在 Agent 工具系统中，LLM 就是那个"可能犯错的操作员"，我们需要通过多层防护让危险操作无法被误触发。

### 6.3.1 核心防护验证器

```typescript
/**
 * Poka-Yoke 防错验证器
 * 在工具执行前进行多维度安全检查
 */
class PokayokeValidator {
  private readonly guards: ToolGuard[] = [];

  // ... 省略 7 行

interface ToolGuard {
  name: string;
  check(invocation: ToolInvocation): Promise<GuardResult>;
}
```

### 6.3.2 基础防护：参数安全守卫

```typescript
/**
 * 参数安全守卫
 * 检测危险参数模式，防止 SQL 注入、路径遍历等
 */
class ParameterSafetyGuard implements ToolGuard {
  readonly name = 'ParameterSafetyGuard';

  // ... 省略 7 行
        this.inspectValues(value as Record<string, unknown>, callback, fullKey);
      }
    }
  }
}
```

### 6.3.3 速率限制守卫

```typescript
/**
 * 速率限制守卫
 * 使用滑动窗口算法限制工具调用频率
 */
class RateLimitGuard implements ToolGuard {
  readonly name = 'RateLimitGuard';

  // ... 省略 7 行
interface RateLimitConfig {
  global: RateLimit;
  perTool: RateLimit;
  perUser: RateLimit;
}
```

### 6.3.4 输出大小守卫

```typescript
/**
 * 输出大小守卫
 * 防止工具返回过大的结果撑爆 context window
 */
class OutputSizeGuard implements ToolGuard {
  readonly name = 'OutputSizeGuard';

  // 记录每个工具最近输出的 token 数，用于预检判断
  // ... 省略 101 行，完整实现见 code-examples/ 对应目录

interface TruncationResult {
  output: string;
  truncated: boolean;
  originalTokens: number;
}
```

### 6.3.5 成本守卫

```typescript
/**
 * 成本守卫
 * 跟踪和限制工具调用产生的费用
 */
class CostGuard implements ToolGuard {
  readonly name = 'CostGuard';

  // 记录累计成本（内存中，生产环境应持久化）
  // ... 省略 66 行，完整实现见 code-examples/ 对应目录
  perDayMax: number;
}

interface ToolCostEstimator {
  estimate(toolName: string, args: Record<string, unknown>): number;
}
```

### 6.3.6 超时守卫

```typescript
/**
 * 超时守卫
 * 根据工具类型动态设置执行超时时间
 */
class TimeoutGuard implements ToolGuard {
  readonly name = 'TimeoutGuard';

  // ... 省略 7 行
    const parts = toolName.split('_');
    const verb = parts.length >= 2 ? parts[1] : '';
    return this.defaultTimeouts[verb] || 30_000; // 默认 30 秒
  }
}
```

### 6.3.7 工具执行沙箱

```typescript
/**
 * 工具执行沙箱
 * 在隔离环境中执行工具，限制资源使用
 */
class ToolExecutionSandbox {
  constructor(
    private readonly resourceLimits: ResourceLimits = {
      maxMemoryMB: 256,
  // ... 省略 72 行，完整实现见 code-examples/ 对应目录
  error?: string;
  metrics: {
    duration: number;
    memoryDeltaBytes: number;
  };
}
```

### 6.3.8 基于角色的权限模型

```typescript
/**
 * 工具权限管理器
 * 基于 RBAC（Role-Based Access Control）控制工具访问
 */
class ToolPermissionManager {
  // 角色 -> 权限映射
  private readonly rolePermissions: Map<string, Set<ToolPermission>> = new Map();
  // 用户 -> 角色映射
  // ... 省略 99 行，完整实现见 code-examples/ 对应目录
interface PermissionCheckResult {
  allowed: boolean;
  reason: string;
  requiredPermissions: ToolPermission[];
  userPermissions: ToolPermission[];
}
```

### 6.3.9 审计日志

```typescript
/**
 * 工具调用审计日志
 * 记录每次工具调用的完整信息，用于审计和调试
 */
class ToolAuditLogger {
  private readonly logEntries: AuditLogEntry[] = [];
  private readonly sinks: AuditSink[] = [];

  // ... 省略 151 行，完整实现见 code-examples/ 对应目录
  topUsers: Array<{ id: string; count: number }>;
}

interface AuditSink {
  write(entry: AuditLogEntry): Promise<void>;
}
```

### 6.3.10 防护体系集成

将所有守卫组合成完整的防护链：

```typescript
/**
 * 创建完整的防护体系
 * 按照检查优先级排列守卫
 */
function createProductionValidator(): PokayokeValidator {
  const permissionManager = new ToolPermissionManager();
  const costEstimator: ToolCostEstimator = {
  // ... 省略 7 行
    .use(new TimeoutGuard())                 // 5. 超时设置
    .use(new OutputSizeGuard());             // 6. 输出大小

  return validator;
}
```

---

## 6.4 MCP 深度集成

### 6.4.1 MCP 协议概述

Model Context Protocol（MCP）是 Anthropic 于 2024 年发布的开放协议，旨在标准化 LLM 应用与外部工具/数据源之间的交互方式 [[MCP Specification]](https://modelcontextprotocol.io/specification/2025-06-18)。MCP 之于 Agent 工具系统，正如 HTTP 之于 Web——它定义了一套通用的通信规范，使得工具提供方和消费方可以解耦开发。

截至 2025 年，MCP 已成为 Agent 工具集成领域的**事实标准**（de-facto standard）。所有主流 IDE 和 Agent 平台（包括 VS Code、JetBrains、Cursor、Windsurf、Claude Desktop 等）均已原生支持 MCP，社区贡献的 MCP Server 超过 10,000 个，覆盖数据库、云服务、开发工具、企业应用等各个领域。

**MCP 的核心价值：**

| 特性 | 描述 |
|------|------|
| 标准化 | 统一的工具描述、调用、响应格式 |
| 可发现性 | 客户端可以动态发现服务端提供的工具 |
| 传输无关 | 支持 stdio（本地进程）和 Streamable HTTP（远程服务）两种传输方式 [[MCP Transports]](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) |
| 双向通信 | 服务端可以向客户端请求上下文（Sampling） |

**MCP 架构：**

```
Host (LLM 应用)
  +-- MCP Client
        |-- MCP Server A (via stdio)            -> 本地工具
        |-- MCP Server B (via Streamable HTTP)  -> 远程服务
        +-- MCP Server C (via Streamable HTTP)  -> 第三方 API
```

### 6.4.2 MCP 核心类型定义

```typescript
/**
 * MCP 协议核心类型定义
 * 基于 MCP 规范 2025-06-18 版本
 */

/** JSON-RPC 2.0 消息基础类型 */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  // ... 省略 66 行，完整实现见 code-examples/ 对应目录
  capabilities: MCPCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
}
```

### 6.4.2b MCP Resources 与 Prompts 原语

MCP 协议不仅仅是"工具调用协议"。MCP 2025-06-18 规范定义了三种核心原语（Primitive），构成完整的 Agent-Server 交互模型 [[MCP Specification]](https://modelcontextprotocol.io/specification/2025-06-18)：

| 原语 | 方向 | 控制方 | 用途 |
|------|------|--------|------|
| **Tools** | Server → Client | 模型发起调用 | 执行操作、产生副作用 |
| **Resources** | Server → Client | 应用程序控制 | 向 LLM 上下文注入结构化数据 |
| **Prompts** | Server → Client | 用户触发 | 提供可复用的 Prompt 模板 |

前文已深入讨论了 Tools 原语。本节补充 Resources 和 Prompts 两个同样重要但容易被忽视的原语。

#### Resources 原语

Resources 允许 MCP Server 向客户端暴露 **只读的结构化数据**，供 LLM 作为上下文使用。典型场景包括：数据库 Schema 暴露、配置文件内容、用户画像数据、实时日志流等。与 Tools 不同，Resources 不执行操作、不产生副作用——它们是纯粹的数据源。

```typescript
// ============================================================
// MCP Resources 原语 -- 类型定义
// ============================================================

/** 资源描述 */
interface MCPResource {
  uri: string;           // 资源唯一标识，如 "file:///workspace/schema.sql"
  // ... 省略 7 行
/** 资源变更通知（需要 capabilities.resources.subscribe） */
interface ResourceUpdatedNotification {
  method: 'notifications/resources/updated';
  params: { uri: string };
}
```

Resource Template 是一种强大的参数化机制。例如，一个数据库 MCP Server 可以暴露模板 `db://{schema}/{table}`，客户端通过填入具体参数（如 `db://public/users`）来读取特定表的 Schema 信息，而不需要为每张表注册独立的资源。

#### Prompts 原语

Prompts 允许 MCP Server 暴露 **可复用的 Prompt 模板**，供用户通过斜杠命令（如 `/review-code`）或 UI 选择触发。这与 Tools 的关键区别在于：Tools 由模型自主决定何时调用，而 Prompts 由用户显式触发。

```typescript
// ============================================================
// MCP Prompts 原语 -- 类型定义
// ============================================================

/** Prompt 参数定义 */
interface MCPPromptArgument {
  name: string;
  // ... 省略 7 行
      text?: string;
      resource?: { uri: string; text?: string; mimeType?: string };
    };
  }>;
}
```

一个典型的 Prompts 使用场景：代码审查 MCP Server 提供 `review-code` Prompt，用户在 IDE 中输入 `/review-code`，客户端调用 `prompts/get` 获取包含审查规则和输出格式的完整 Prompt 模板，然后将其注入 LLM 上下文。模板中还可以通过嵌入 Resource 引用来自动拉取相关代码文件。

#### 三原语协作模式

三种原语在实际集成中互相配合，形成完整的 Agent-Server 交互链路：

```
┌──────────────────────────────────────────────────────────────────┐
│                      MCP 三原语协作流程                           │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  用户触发: /deploy-service                                       │
│       │                                                          │
│       ▼                                                          │
  // ... 省略 8 行
│       ▼                                                          │
│  ④ Resources -- resources/read("logs://deploy/latest")          │
│                  读取部署日志供 LLM 生成摘要                      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

这种分层设计的核心价值在于 **关注点分离**：

- **Prompts** 封装"怎么问"——将领域知识和最佳实践固化为模板，降低用户使用门槛。
- **Resources** 封装"知道什么"——将动态数据以标准接口暴露，避免 LLM 产生幻觉。
- **Tools** 封装"能做什么"——将操作能力标准化，由模型在充分上下文下自主调用。

> **设计提示**：在实现 MCP Server 时，优先考虑哪些数据适合作为 Resources 暴露（而非硬编码在 Tool 的 description 中），哪些常见工作流适合封装为 Prompts（而非让用户每次手动编写）。三原语的合理划分，能显著降低 Token 消耗并提升 Agent 的一致性表现。

### 6.4.3 Stdio 传输模式实现

Stdio 传输模式适用于本地 MCP Server——通过子进程的标准输入/输出进行通信。

```typescript
import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as readline from 'readline';

/**
 * MCP Stdio 传输层
 * 通过子进程的 stdin/stdout 与 MCP Server 通信
 */
  // ... 省略 125 行，完整实现见 code-examples/ 对应目录
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}
```

### 6.4.4 SSE 传输模式实现（已废弃）

> **⚠️ 废弃声明**：旧版 HTTP+SSE 双端点传输已在 MCP 2025-06-18 规范修订中标记为 **legacy/deprecated** [[MCP Transports]](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)。新项目应使用 6.4.4b 节介绍的 Streamable HTTP 传输。以下代码仅供维护旧系统时参考。

SSE（Server-Sent Events）传输曾是远程 MCP Server 的标准传输方式，通过 HTTP 进行通信。该方案使用两个独立端点（`/sse` 用于建立 SSE 长连接，`/messages` 用于发送请求），在部署和连接管理上存在诸多限制。

```typescript
/**
 * MCP SSE 传输层
 * 使用 HTTP POST 发送请求，通过 SSE 接收响应
 */
class SSETransport extends EventEmitter {
  private sessionUrl: string | null = null;
  private requestId = 0;
  private pendingRequests: Map<string | number, {
  // ... 省略 180 行，完整实现见 code-examples/ 对应目录
      clearTimeout(pending.timer);
      pending.reject(new Error('连接关闭'));
    }
    this.pendingRequests.clear();
  }
}
```

### 6.4.4b Streamable HTTP 传输模式（主要传输）

> **当前标准**：Streamable HTTP 是 MCP 2025-06-18 规范指定的**主要远程传输方式**，完全取代了旧版 HTTP+SSE 双端点方案 [[MCP Transports]](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)。Streamable HTTP 使用单一 HTTP 端点，在同一连接上支持请求-响应和流式两种模式，大幅简化了部署架构。

**Streamable HTTP vs 旧版 SSE 对比**：

| 特性 | 旧版 HTTP+SSE（已废弃） | Streamable HTTP（当前标准） |
|------|-------------|-----------------|
| 端点数量 | 2 个（/sse + /messages） | 1 个（/mcp） |
| 连接管理 | 长连接 SSE 流 | 按需连接，可选流式 |
| 无状态支持 | 否（需持久连接） | 是（支持无状态和有状态两种模式） |
| 恢复能力 | 需重新建连 | 支持会话恢复（Mcp-Session-Id） |
| 部署友好性 | 需 SSE 支持的基础设施 | 标准 HTTP，兼容 CDN/负载均衡 |

```typescript
/**
 * Streamable HTTP Transport（MCP 2025-06-18 规范，主要远程传输方式）
 *
 * 核心改进：
 * 1. 单一端点 /mcp，通过 Accept header 协商响应格式
 * 2. 支持无状态模式（每次请求独立）和有状态模式（Mcp-Session-Id 关联会话）
 * 3. 服务端可选择返回普通 JSON 或 SSE 流
 */
  // ... 省略 125 行，完整实现见 code-examples/ 对应目录
    });

    this.sessionId = null;
    this.emit('close');
  }
}
```

> **迁移建议**：所有新项目**必须**使用 Streamable HTTP 传输。旧版 HTTP+SSE 传输已在 2025-06-18 规范修订中正式标记为 deprecated，仅建议在维护遗留系统时使用。对于本地 MCP Server（如 IDE 插件），stdio 传输仍是最佳选择 [[MCP Transports]](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)。

### 6.4.4c MCP 授权框架（OAuth 2.1）

MCP 规范指定了 **OAuth 2.1** 作为远程 MCP Server 的标准授权框架（最初在 2025-03-26 规范修订中引入）[[MCP Specification]](https://modelcontextprotocol.io/specification/2025-06-18)，用于身份验证和权限控制。这意味着所有需要认证的远程 MCP Server 都应遵循统一的 OAuth 2.1 流程，而不是各自实现私有的认证方案。

**授权流程**：

```
┌──────────┐     ┌──────────────┐     ┌──────────────────┐
│ MCP      │     │ Authorization│     │ Remote MCP       │
│ Client   │     │ Server       │     │ Server           │
└────┬─────┘     └──────┬───────┘     └────────┬─────────┘
     │                  │                      │
     │  1. 发现授权端点  │                      │
     │──────────────────────────────────────────>
  // ... 省略 7 行
     │                  │                      │
     │  4. 访问 MCP Server（携带 Access Token） │
     │──────────────────────────────────────────>
     │  Bearer Token 验证                      │
     │<──────────────────────────────────────────
```

```typescript
/**
 * MCP OAuth 2.1 授权管理器
 * 实现远程 MCP Server 的认证流程
 */
interface MCPAuthConfig {
  /** 授权服务器端点 */
  authorizationEndpoint: string;
  /** Token 端点 */
  // ... 省略 125 行，完整实现见 code-examples/ 对应目录
  private base64UrlEncode(buffer: Uint8Array): string {
    let binary = '';
    for (const byte of buffer) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}
```

> **安全提示**：OAuth 2.1 相比 OAuth 2.0 的主要变化是：(1) **强制 PKCE** 用于所有客户端类型；(2) **禁止隐式授权**（Implicit Flow）；(3) **Refresh Token 需要旋转**（Rotation）或绑定至发送者。这些改进显著提升了 MCP 远程 Server 场景下的安全性。

### 6.4.4d Elicitation（用户信息请求）

MCP 规范包含 Elicitation 能力（2025-03-26 修订引入），允许 MCP Server 在工具执行过程中向用户请求额外信息。这解决了一个常见问题：工具执行时发现需要用户确认或补充输入，但传统 MCP 流程中没有"反向请求"机制。

**典型场景**：
- 文件删除工具请求用户确认："确定要删除这 15 个文件吗？"
- 数据库工具请求凭证："请提供目标数据库的连接密码"
- 部署工具请求选择："检测到 3 个可用环境，请选择部署目标"

```typescript
/**
 * Elicitation 消息类型
 * Server → Client 方向的请求，要求用户提供额外信息
 */
interface ElicitRequest {
  method: 'elicitation/create';
  params: {
  // ... 省略 7 行
  return {
    action: 'accept',
    content: userResponse.data,
  };
}
```

> **设计要点**：Elicitation 体现了 MCP 的"人在回路"（Human-in-the-Loop）设计哲学。MCP Client（Host 应用）有权决定是否将 Elicitation 请求展示给用户，可以根据安全策略自动拒绝或过滤敏感请求。

### 6.4.5 MCP 客户端实现

```typescript
/**
 * MCP 客户端
 * 封装与单个 MCP Server 的完整交互逻辑
 */
class MCPClient {
  private transport: StdioTransport | StreamableHTTPTransport;
  private serverCapabilities: MCPCapabilities | null = null;
  private cachedTools: MCPToolDefinition[] | null = null;
  // ... 省略 96 行，完整实现见 code-examples/ 对应目录
  env?: Record<string, string>;
  /** Streamable HTTP 模式：服务器端点 URL */
  url?: string;
  /** Streamable HTTP 模式：OAuth 2.1 access token */
  accessToken?: string;
}
```

### 6.4.6 多 MCP Server 管理器

在实际应用中，一个 Agent 可能同时连接多个 MCP Server（文件系统、数据库、Web 搜索等）。MCPServerManager 统一管理这些连接。

```typescript
/**
 * MCP Server 管理器
 * 管理多个 MCP Server 连接，提供统一的工具发现和调用接口
 */
class MCPServerManager {
  private readonly clients: Map<string, MCPClient> = new Map();
  private readonly toolToServer: Map<string, string> = new Map();

  // ... 省略 116 行，完整实现见 code-examples/ 对应目录

interface ServerStatus {
  id: string;
  capabilities: MCPCapabilities | null;
  toolCount: number;
}
```

### 6.4.7 MCP 错误处理与重连

```typescript
/**
 * 带自动重连功能的 MCP 客户端包装器
 * 处理连接断开、超时、协议错误等异常
 */
class ResilientMCPClient {
  private client: MCPClient;
  private connected = false;
  private reconnectAttempts = 0;
  // ... 省略 117 行，完整实现见 code-examples/ 对应目录
interface ResilienceOptions {
  maxReconnectAttempts: number;
  baseReconnectDelayMs: number;
  maxReconnectDelayMs: number;
  healthCheckIntervalMs: number;
}
```

### 6.4.8 动态工具注册

将 MCP 发现的工具动态注册到 Agent 的工具系统中：

```typescript
/**
 * 动态工具注册表
 * 将 MCP 工具和本地工具统一管理
 */
class DynamicToolRegistry {
  private readonly tools: Map<string, RegisteredTool> = new Map();
  private readonly mcpManager: MCPServerManager;
  private readonly validator: PokayokeValidator;
  // ... 省略 119 行，完整实现见 code-examples/ 对应目录
interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration: number;
}
```

## 6.5 工具编排 — 从单兵作战到协同作战

真实的 Agent 任务很少只调用一个工具。部署一个服务可能需要：拉取代码 → 构建镜像 → 推送仓库 → 更新 K8s → 验证健康检查。这就是**工具编排**要解决的问题。

### 6.5.1 编排模式总览

```
┌─────────────────────────────────────────────────┐
│              工具编排模式                          │
├────────────┬──────────────┬─────────────────────┤
│   串行链    │   并行扇出    │     DAG 编排         │
│  A → B → C │  A ─┬→ B    │    A → B ─→ D       │
│            │    ├→ C    │    A → C ─→ D       │
│            │    └→ D    │                     │
├────────────┼──────────────┼─────────────────────┤
│ 最简单      │ 提升吞吐      │ 最灵活，处理复杂依赖   │
│ 前一步输出   │ 无依赖任务    │ 自动拓扑排序          │
│ 作为下一步输入│ 并行执行      │ 支持条件分支          │
└────────────┴──────────────┴─────────────────────┘
```

### 6.5.2 工具编排器：链式与并行

```typescript
// ---- 工具编排器：支持链式、并行、条件分支 ----

/** 编排步骤定义 */
interface OrchestrationStep {
  id: string;
  toolName: string;
  /** 参数生成函数，接收前序步骤结果 */
  paramsFn: (context: StepContext) => Record<string, unknown>;
  // ... 省略 222 行，完整实现见 code-examples/ 对应目录
    if (next) {
      this.current++;
      next();
    }
  }
}
```

### 6.5.3 DAG 执行器：复杂依赖编排

当步骤之间存在任意依赖关系时，我们需要 DAG（有向无环图）执行器。它会自动进行拓扑排序，找出可以并行的步骤批次。

```typescript
// ---- DAG 执行器：基于拓扑排序的依赖编排 ----

interface DAGNode {
  id: string;
  toolName: string;
  paramsFn: (context: StepContext) => Record<string, unknown>;
  /** 依赖的节点 ID 列表 */
  dependencies: string[];
  // ... 省略 173 行，完整实现见 code-examples/ 对应目录
      if (color.get(node.id) === WHITE) {
        dfs(node.id, []);
      }
    }
  }
}
```

**使用示例：部署流水线**

```typescript
// 定义部署流水线的 DAG 节点
const deploymentDAG: DAGNode[] = [
  {
    id: 'pull-code',
    toolName: 'github_pull_repo',
    dependencies: [],
    paramsFn: () => ({ repo: 'myapp', branch: 'main' }),
  // ... 省略 7 行
];

// 执行 DAG
const dagExecutor = new ToolDAGExecutor(toolExecutor);
const results = await dagExecutor.execute(deploymentDAG);
```

### 6.5.4 熔断器模式

当某个工具持续失败时，继续调用只会浪费时间和 token。熔断器在连续失败达到阈值后自动"断路"，快速返回错误，并定期探测恢复。

```typescript
// ---- 熔断器：保护不稳定的外部工具 ----

enum CircuitState {
  CLOSED = 'CLOSED',       // 正常状态，允许调用
  OPEN = 'OPEN',           // 熔断状态，拒绝调用
  HALF_OPEN = 'HALF_OPEN', // 探测状态，允许有限调用
}

  // ... 省略 143 行，完整实现见 code-examples/ 对应目录
      toolName: this.toolName,
      currentState: this.state,
      ...this.stats,
    };
  }
}
```

### 6.5.5 工具结果缓存

对于幂等的只读工具（如搜索、查询），缓存结果可以显著减少 API 调用和延迟。

```typescript
// ---- 工具结果缓存：TTL + LRU 淘汰 ----

interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  createdAt: number;
  ttlMs: number;
  accessCount: number;
  // ... 省略 138 行，完整实现见 code-examples/ 对应目录
      hitRate: `${hitRate}%`,
      size: this.cache.size,
      maxSize: this.config.maxEntries,
    };
  }
}
```

### 6.5.6 重试策略

不同的失败场景需要不同的重试策略。临时网络问题可以立即重试，而限流错误则需要指数退避。

```typescript
// ---- 重试策略：为不同失败场景选择合适的重试方式 ----

type RetryStrategy = 'immediate' | 'fixed' | 'exponential' | 'exponential_jitter';

interface RetryConfig {
  strategy: RetryStrategy;
  maxAttempts: number;
  baseDelayMs: number;
  // ... 省略 101 行，完整实现见 code-examples/ 对应目录
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

> **编排组合实践**：在生产环境中，熔断器、缓存和重试通常组合使用。典型的调用链路为：`缓存查询 → 重试包装 → 熔断器保护 → 实际工具调用`。这种分层设计让每一层专注于自己的职责，组合后提供了强大的容错能力。


## 6.6 工具测试与质量保障

工具是 Agent 与外部世界交互的桥梁，一个有 bug 的工具可能导致 Agent 执行整条链路的失败。本节介绍如何系统性地测试工具。

### 6.6.1 工具 Mock 框架

测试 Agent 工具链时，我们不希望真正调用外部 API。Mock 框架让我们可以模拟各种响应场景。

```typescript
// ---- 工具 Mock 框架：模拟工具行为用于测试 ----

/** Mock 响应定义 */
interface MockResponse {
  output: unknown;
  /** 模拟延迟（毫秒） */
  delayMs?: number;
  /** 模拟错误 */
  // ... 省略 185 行，完整实现见 code-examples/ 对应目录
        JSON.stringify(record.params)
      );
    }
    return this;
  }
}
```

**使用示例**

```typescript
// 设置 mock
const mocker = new ToolMocker();

mocker.when('github_search_issues')
  .thenReturn({ issues: [{ id: 1, title: 'Bug report' }] })
  .build();

  // ... 省略 7 行

// 验证行为
mocker.verify('github_search_issues').calledTimes(1);
mocker.verify('github_create_comment').calledAtLeastOnce();
mocker.verify('slack_send_message').calledTimes(2);
```

### 6.6.2 Schema 快照测试

工具的 JSON Schema 是 Agent 的"API 契约"。任何不经意的 Schema 变更都可能导致 Agent 行为异常。快照测试可以在 CI 中自动捕获这些变更。

```typescript
// ---- Schema 快照测试：捕获不经意的契约变更 ----

interface SchemaSnapshot {
  toolName: string;
  schema: Record<string, unknown>;
  hash: string;
  timestamp: number;
}
  // ... 省略 142 行，完整实现见 code-examples/ 对应目录
interface SchemaDiff {
  type: 'new_tool' | 'added' | 'removed' | 'type_changed' | 'value_changed';
  toolName: string;
  details: string;
  severity?: 'breaking' | 'warning' | 'info';
}
```

### 6.6.3 工具链集成测试

单个工具测试通过不代表工具链能正常工作。集成测试验证多个工具按预期顺序和数据流协作。

```typescript
// ---- 工具链集成测试运行器 ----

interface ChainTestCase {
  name: string;
  description: string;
  /** 测试步骤 */
  steps: ChainTestStep[];
  /** 全局断言：在所有步骤完成后执行 */
  // ... 省略 156 行，完整实现见 code-examples/ 对应目录
    console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
    console.log('='.repeat(60));

    return { passed, failed, results };
  }
}
```

### 6.6.4 工具性能基准测试

```typescript
// ---- 工具性能基准测试 ----

interface BenchmarkResult {
  toolName: string;
  iterations: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  // ... 省略 82 行，完整实现见 code-examples/ 对应目录

  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}
```


## 6.7 实战：DevOps Agent 工具集

本节将前面所有概念融合为一个完整的实战案例——构建一个 DevOps Agent 的工具集。该 Agent 能够自动化处理从代码管理到部署监控的完整流程。

### 6.7.1 GitHub 工具集

```typescript
// ---- DevOps 实战：GitHub 工具集 ----

interface GitHubConfig {
  token: string;
  baseUrl: string;
  defaultOwner: string;
}

  // ... 省略 126 行，完整实现见 code-examples/ 对应目录
    return {
      Authorization: `Bearer ${this.config.token}`,
      Accept: 'application/vnd.github.v3+json',
    };
  }
}
```

### 6.7.2 Docker 工具集

```typescript
// ---- DevOps 实战：Docker 工具集 ----

interface DockerConfig {
  socketPath?: string;
  host?: string;
  registry?: string;
}

  // ... 省略 75 行，完整实现见 code-examples/ 对应目录
          required: [],
        },
      },
    ];
  }
}
```

### 6.7.3 Kubernetes 工具集

```typescript
// ---- DevOps 实战：Kubernetes 工具集 ----

interface K8sConfig {
  kubeconfig?: string;
  context?: string;
  namespace?: string;
}

  // ... 省略 83 行，完整实现见 code-examples/ 对应目录
          required: ['pod_name'],
        },
      },
    ];
  }
}
```

### 6.7.4 监控告警工具集

```typescript
// ---- DevOps 实战：监控告警工具集 ----

class MonitoringToolkit {
  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'monitor_query_metrics',
  // ... 省略 7 行
        },
      },
    ];
  }
}
```

### 6.7.5 完整部署工作流

将所有工具集组合为一个完整的部署工作流：

```typescript
// ---- 完整部署工作流：集成所有工具集 ----

class DeploymentWorkflow {
  private orchestrator: ToolOrchestrator;
  private circuitBreakers = new Map<string, ToolCircuitBreaker>();
  private cache: ToolCache;

  constructor(executor: ToolExecutor) {
  // ... 省略 179 行，完整实现见 code-examples/ 对应目录
    );
    lines.push('', `## 最终状态: ${success ? '部署成功' : '部署失败'}`);

    return lines.join('\n');
  }
}
```

---

## 6.8 本章小结

本章系统性地介绍了 Agent 工具系统的设计方法论。以下是核心要点回顾：

### 设计原则速查表

| 原则 | 核心思想 | 关键实践 |
|------|---------|---------|
| ACI 优先 | 工具接口为 LLM 设计，而非为人类设计 | 限制名称长度、控制参数数量、优化 token 成本 |
| 三段式描述 | WHAT + WHEN + RETURNS | 每个描述回答三个关键问题，消除歧义 |
| 防呆设计 | 预防错误而非事后补救 | 参数校验、速率限制、输出截断、成本控制 |
| 最小权限 | 工具只拥有必要的权限 | RBAC 模型、操作审计、沙箱执行 |

### 技术栈选型建议

| 场景 | 推荐方案 | 理由 |
|------|---------|------|
| 工具协议 | MCP (Model Context Protocol) | 标准化、跨语言、支持动态发现 |
| 进程内工具 | 直接函数调用 + Schema 验证 | 低延迟、类型安全 |
| 远程工具 | MCP over Streamable HTTP | 单一端点、支持流式和请求-响应、兼容标准 HTTP 基础设施 |
| 工具编排 | DAG 执行器 | 自动并行化、依赖管理、可视化 |
| 容错处理 | 熔断器 + 指数退避重试 | 保护下游服务、避免级联故障 |
| 测试策略 | Mock 框架 + Schema 快照 | 隔离外部依赖、捕获契约变更 |

### 复杂度管理矩阵

| 工具复杂度 | 参数数量 | 嵌套层数 | 建议 |
|-----------|---------|---------|------|
| L1 简单 | 1-3 | 0 | 直接使用 |
| L2 复合 | 4-8 | 1 | 提供参数默认值和示例 |
| L3 组合 | 8+ | 2+ | 拆分为多个 L1/L2 工具 |

### 下一步建议

1. **从小处开始**：先为最高频的 3-5 个工具应用 ACI 规范，观察 Agent 准确率提升
2. **逐步引入防呆**：从参数校验开始，逐步添加速率限制和成本控制
3. **标准化协议**：采用 MCP 作为工具集成的统一协议——MCP 已成为行业事实标准，拥有超过 10,000 个社区 Server，可大幅降低接入成本
4. **持续测试**：将 Schema 快照测试集成到 CI/CD，防止无意的契约破坏
5. **监控先行**：为工具调用添加审计日志和性能指标，用数据驱动优化

> **核心理念**：工具系统的质量直接决定了 Agent 的能力上限。好的工具设计不是让工具"能用"，而是让 Agent "好用"——减少歧义、预防错误、优雅容错。这就是 ACI 设计哲学的精髓。

