# 第 3 章 架构总览 — Agent 的七层模型

> **本章目标**
> 1. 建立一个可复用的 **七层参考架构**，为后续章节提供统一术语与分层边界。
> 2. 深入剖析三种经典 **Agent Loop 模式**（ReAct、Plan-and-Execute、Adaptive），并扩展 Reflective Loop 与 Hybrid 模式。
> 3. 以 **Event Sourcing + Reducer** 的方式管理 Agent 状态，确保可测试、可回放、可审计。
> 4. 引入 **Agent 生命周期管理**，理解从创建到销毁的完整状态机。
> 5. 通过 **架构决策矩阵**，帮助读者在真实项目中做出合理的技术选型。

---

## 3.1 七层参考架构

在构建生产级 AI Agent 系统时，我们需要一个清晰的分层模型来组织复杂性。类似于 OSI 七层网络模型将网络通信分解为可独立演进的层次，我们提出 **Agent 七层参考架构**，将 Agent 系统的关键关注点分离到七个明确定义的层次中。

每一层都有明确的职责边界、对外接口和对内实现。层与层之间通过定义良好的接口通信，上层依赖下层提供的能力，而下层对上层保持无感知。这种分层设计带来三大好处：**可替换性**（任意一层的实现可以独立替换）、**可测试性**（每层可独立进行单元测试）、**可演进性**（新的模型或工具可以在不影响其他层的情况下接入）。

```
+-----------------------------------------------------------------+
|                  Layer 7 - Orchestration 编排层                  |
|          多 Agent 路由 / 任务分发 / 结果聚合 / 工作流编排         |
+-----------------------------------------------------------------+
|                  Layer 6 - Evaluation 评估层                     |
|          指标采集 / 基准测试 / 回归检测 / 质量守门                |
+-----------------------------------------------------------------+
|                  Layer 5 - Security 安全层                       |
|          输入校验 / 输出净化 / 权限控制 / 审计日志                |
+-----------------------------------------------------------------+
|                  Layer 4 - Memory 记忆层                         |
|          短期记忆 / 长期记忆 / 语义检索 / 记忆压缩                |
+-----------------------------------------------------------------+
|                  Layer 3 - Tool System 工具层                    |
|          工具注册 / 能力发现 / 参数校验 / 安全执行                |
+-----------------------------------------------------------------+
|                  Layer 2 - Context Engine 上下文引擎层            |
|          窗口管理 / 上下文组装 / 压缩策略 / 优先级注入            |
+-----------------------------------------------------------------+
|                  Layer 1 - Agent Core 核心循环层                  |
|          感知-推理-行动循环 / 模型调用 / 流式处理 / Token 追踪    |
+-----------------------------------------------------------------+
```

下面我们逐层深入分析。


---

### 3.1.1 Layer 1 -- Agent Core 核心循环层

**核心循环层**是整个 Agent 系统的心脏。它实现了经典的 **感知-推理-行动（Perceive-Reason-Act）** 循环，负责与大语言模型（LLM）进行交互，并根据模型的响应决定下一步行动。

核心循环层的职责包括：（1）接收用户输入或上层编排层的指令；（2）组装 prompt 并调用 LLM；（3）解析模型响应，判断是需要调用工具、返回结果还是继续推理；（4）管理循环的终止条件，包括最大迭代次数、Token 预算、超时等。

在生产环境中，核心循环层还需要处理大量的非功能性需求：**错误恢复**（模型调用失败时的指数退避重试）、**流式输出**（实时将生成内容传递给用户）、**Token 追踪**（记录每次调用的 Token 消耗，用于成本控制和性能分析）、以及 **可观测性**（通过结构化日志和 Trace 为调试和监控提供支持）。

以下是一个生产级的核心循环实现：

```typescript
// ============================================================
// Layer 1: Agent Core -- 生产级核心循环
// ============================================================

/** LLM 模型响应的结构化表示 */
interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  finishReason: "stop" | "tool_calls" | "length" | "content_filter";
  usage: { promptTokens: number; completionTokens: number };
}

/** 工具调用的描述 */
interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** 工具执行结果 */
interface ToolResult {
  callId: string;
  output: string;
  isError: boolean;
  durationMs: number;
}

/** Token 使用追踪器 */
interface TokenTracker {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  callCount: number;
  history: Array<{
    step: number;
    promptTokens: number;
    completionTokens: number;
    timestamp: number;
  }>;
}

/** Agent 循环配置 */
interface AgentCoreConfig {
  maxIterations: number;        // 最大循环次数，防止无限循环
  maxTokenBudget: number;       // Token 预算上限
  timeoutMs: number;            // 单次循环超时（毫秒）
  retryConfig: {
    maxRetries: number;         // 最大重试次数
    baseDelayMs: number;        // 基础延迟
    maxDelayMs: number;         // 最大延迟
  };
  enableStreaming: boolean;     // 是否启用流式输出
  onStream?: (chunk: string) => void;  // 流式回调
}

/** 每一步循环的结构化记录 */
interface AgentStep {
  index: number;
  thought: string;
  action?: { tool: string; args: Record<string, unknown> };
  observation?: string;
  tokenUsage: { prompt: number; completion: number };
  durationMs: number;
  timestamp: number;
}

/**
 * agentLoop -- 生产级 Agent 核心循环
 *
 * 实现了完整的感知-推理-行动循环，包含：
 * - 指数退避重试机制
 * - Token 预算追踪与控制
 * - 流式输出支持
 * - 结构化步骤日志
 * - 优雅的错误处理与降级
 */
async function agentLoop(
  goal: string,
  config: AgentCoreConfig,
  deps: {
    callLLM: (messages: Message[], stream?: boolean) => Promise<LLMResponse>;
    executeTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
    contextEngine: ContextEngine;
    securityGuard: SecurityGuard;
  }
): Promise<{
  answer: string;
  steps: AgentStep[];
  tokenTracker: TokenTracker;
}> {
  const steps: AgentStep[] = [];
  const tokenTracker: TokenTracker = {
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    callCount: 0,
    history: [],
  };

  // 初始化消息上下文
  const messages: Message[] = deps.contextEngine.assembleContext(goal);

  for (let i = 0; i < config.maxIterations; i++) {
    const stepStart = Date.now();

    // ---- Token 预算检查 ----
    const totalTokens =
      tokenTracker.totalPromptTokens + tokenTracker.totalCompletionTokens;
    if (totalTokens >= config.maxTokenBudget) {
      console.warn(
        `[AgentCore] Token 预算耗尽: ${totalTokens}/${config.maxTokenBudget}`
      );
      return buildFinalResult(
        "抱歉，Token 预算已用尽。以下是目前的分析结果：\n" +
          steps.map((s) => s.thought).join("\n"),
        steps,
        tokenTracker
      );
    }

    // ---- 带重试的 LLM 调用 ----
    let response: LLMResponse;
    try {
      response = await callWithRetry(
        () => deps.callLLM(messages, config.enableStreaming),
        config.retryConfig,
        (chunk) => config.onStream?.(chunk)
      );
    } catch (error) {
      const errorStep: AgentStep = {
        index: i,
        thought: `LLM 调用失败: ${(error as Error).message}`,
        tokenUsage: { prompt: 0, completion: 0 },
        durationMs: Date.now() - stepStart,
        timestamp: Date.now(),
      };
      steps.push(errorStep);
      return buildFinalResult(
        `处理过程中遇到错误，已完成 ${i} 步。`,
        steps,
        tokenTracker
      );
    }

    // ---- 更新 Token 追踪 ----
    tokenTracker.totalPromptTokens += response.usage.promptTokens;
    tokenTracker.totalCompletionTokens += response.usage.completionTokens;
    tokenTracker.callCount += 1;
    tokenTracker.history.push({
      step: i,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      timestamp: Date.now(),
    });

    // ---- 判断是否需要调用工具 ----
    if (response.finishReason === "tool_calls" && response.toolCalls?.length) {
      for (const call of response.toolCalls) {
        const validation = deps.securityGuard.validateToolCall(call);
        if (!validation.allowed) {
          console.warn(`[Security] 工具调用被拒绝: ${call.name}`);
          messages.push({
            role: "tool",
            content: `工具 ${call.name} 被安全策略拒绝: ${validation.reason}`,
            toolCallId: call.id,
          });
          continue;
        }
      }

      // 并行执行所有被批准的工具调用
      const toolResults = await Promise.allSettled(
        response.toolCalls.map((call) =>
          withTimeout(
            deps.executeTool(call.name, call.arguments),
            config.timeoutMs,
            `工具 ${call.name} 执行超时`
          )
        )
      );

      for (let t = 0; t < response.toolCalls.length; t++) {
        const call = response.toolCalls[t];
        const result = toolResults[t];
        const observation =
          result.status === "fulfilled"
            ? result.value.output
            : `工具执行失败: ${(result.reason as Error).message}`;

        messages.push({
          role: "tool",
          content: observation,
          toolCallId: call.id,
        });

        steps.push({
          index: i,
          thought: response.content || "(模型未输出思考过程)",
          action: { tool: call.name, args: call.arguments as Record<string, unknown> },
          observation,
          tokenUsage: {
            prompt: response.usage.promptTokens,
            completion: response.usage.completionTokens,
          },
          durationMs: Date.now() - stepStart,
          timestamp: Date.now(),
        });
      }

      deps.contextEngine.compressIfNeeded(messages);
    } else {
      // ---- 模型认为任务完成 ----
      steps.push({
        index: i,
        thought: response.content,
        tokenUsage: {
          prompt: response.usage.promptTokens,
          completion: response.usage.completionTokens,
        },
        durationMs: Date.now() - stepStart,
        timestamp: Date.now(),
      });
      const sanitized = deps.securityGuard.sanitizeOutput(response.content);
      return buildFinalResult(sanitized, steps, tokenTracker);
    }
  }

  return buildFinalResult(
    "已达到最大推理步数限制。",
    steps,
    tokenTracker
  );
}

/** 构建最终返回结果 */
function buildFinalResult(
  answer: string,
  steps: AgentStep[],
  tokenTracker: TokenTracker
): { answer: string; steps: AgentStep[]; tokenTracker: TokenTracker } {
  console.log(
    `[AgentCore] 完成: ${steps.length} 步, ` +
      `${tokenTracker.totalPromptTokens + tokenTracker.totalCompletionTokens} tokens`
  );
  return { answer, steps, tokenTracker };
}

/** 指数退避重试 */
async function callWithRetry<T>(
  fn: () => Promise<T>,
  retryConfig: AgentCoreConfig["retryConfig"],
  onRetry?: (msg: string) => void
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < retryConfig.maxRetries) {
        const delay = Math.min(
          retryConfig.baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
          retryConfig.maxDelayMs
        );
        onRetry?.(`第 ${attempt + 1} 次重试，等待 ${Math.round(delay)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/** 带超时的 Promise 包装 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]);
}
```


---

### 3.1.2 Layer 2 -- Context Engine 上下文引擎层

**上下文引擎层**是 Agent 系统中最容易被忽视但最影响实际效果的一层。LLM 的上下文窗口是有限的——即使是最新的模型也存在 Token 上限，而真实的 Agent 任务往往需要处理大量的历史对话、工具返回结果、外部文档等信息。上下文引擎的核心使命是：**在有限的窗口中，放入对当前决策最有价值的信息**。

上下文引擎层需要处理三个关键问题：（1）**上下文组装**——将系统 prompt、用户目标、历史消息、工具定义、记忆检索结果等按照优先级和格式要求组装成完整的消息列表；（2）**上下文压缩**——当累积的消息长度接近窗口上限时，智能地压缩或裁剪内容，同时保留关键信息；（3）**上下文注入**——在运行时动态地向上下文中注入新的信息片段（如 RAG 检索结果、实时数据等），而不破坏已有的结构。

一个优秀的上下文引擎还需要考虑 Token 计数的精确性、不同消息类型的优先级排序、以及多轮对话中的信息衰减策略。

```typescript
// ============================================================
// Layer 2: Context Engine -- 上下文引擎
// ============================================================

/** 消息角色与结构 */
interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  toolCallId?: string;
  metadata?: {
    priority: number;       // 优先级 0-100
    tokenCount: number;
    timestamp: number;
    compressible: boolean;
  };
}

/** 上下文窗口配置 */
interface ContextConfig {
  maxWindowTokens: number;
  reservedForOutput: number;
  compressionThreshold: number;  // 触发压缩的阈值比例 0-1
}

/** 可注入的上下文片段 */
interface ContextFragment {
  id: string;
  content: string;
  source: "rag" | "memory" | "tool_schema" | "user_profile" | "realtime";
  priority: number;
  tokenCount: number;
  ttlMs?: number;
  insertedAt?: number;
}

/**
 * ContextEngine -- 上下文引擎
 *
 * 职责：
 * 1. 将各来源的信息组装成 LLM 可消费的消息列表
 * 2. 在上下文接近窗口上限时进行智能压缩
 * 3. 支持运行时动态注入上下文片段
 */
class ContextEngine {
  private config: ContextConfig;
  private fragments: Map<string, ContextFragment> = new Map();
  private systemPrompt: string;
  private toolSchemas: string;

  constructor(
    config: ContextConfig,
    systemPrompt: string,
    toolSchemas: string
  ) {
    this.config = config;
    this.systemPrompt = systemPrompt;
    this.toolSchemas = toolSchemas;
  }

  /**
   * assembleContext -- 组装完整上下文
   *
   * 按优先级顺序：系统提示词 > 工具定义 > 上下文片段 > 历史消息 > 用户输入
   */
  assembleContext(goal: string, history: Message[] = []): Message[] {
    const result: Message[] = [];
    let usedTokens = 0;
    const available = this.config.maxWindowTokens - this.config.reservedForOutput;

    // 1. 系统提示词（不可压缩）
    const sysContent = this.systemPrompt +
      (this.toolSchemas ? `\n\n## 可用工具\n${this.toolSchemas}` : "");
    const sysTokens = this.estimateTokens(sysContent);
    result.push({
      role: "system",
      content: sysContent,
      metadata: { priority: 100, tokenCount: sysTokens, timestamp: Date.now(), compressible: false },
    });
    usedTokens += sysTokens;

    // 2. 清理过期片段并注入
    this.evictExpiredFragments();
    const sorted = Array.from(this.fragments.values())
      .sort((a, b) => b.priority - a.priority);
    for (const frag of sorted) {
      if (usedTokens + frag.tokenCount > available * 0.7) break;
      result.push({
        role: "system",
        content: `[${frag.source}] ${frag.content}`,
        metadata: {
          priority: frag.priority,
          tokenCount: frag.tokenCount,
          timestamp: frag.insertedAt || Date.now(),
          compressible: true,
        },
      });
      usedTokens += frag.tokenCount;
    }

    // 3. 历史消息（最新优先）
    const reversed = [...history].reverse();
    const historyMsgs: Message[] = [];
    for (const msg of reversed) {
      const tkns = msg.metadata?.tokenCount || this.estimateTokens(msg.content);
      if (usedTokens + tkns > available - 200) break;
      historyMsgs.unshift(msg);
      usedTokens += tkns;
    }
    result.push(...historyMsgs);

    // 4. 用户当前输入
    result.push({ role: "user", content: goal });
    return result;
  }

  /**
   * compressIfNeeded -- 智能压缩
   *
   * 策略：截断过长工具结果 -> 摘要化早期对话
   */
  compressIfNeeded(messages: Message[]): void {
    const total = messages.reduce(
      (s, m) => s + (m.metadata?.tokenCount || this.estimateTokens(m.content)), 0
    );
    const threshold = this.config.maxWindowTokens * this.config.compressionThreshold;
    if (total < threshold) return;

    console.log(`[ContextEngine] 触发压缩: ${total} tokens (阈值: ${threshold})`);

    // 截断过长的工具返回结果
    for (const msg of messages) {
      if (msg.role === "tool" && msg.content.length > 2000) {
        msg.content = msg.content.slice(0, 1500) + "\n...[结果已截断]...";
        if (msg.metadata) {
          msg.metadata.tokenCount = this.estimateTokens(msg.content);
        }
      }
    }
  }

  /** inject -- 运行时注入上下文片段 */
  inject(fragment: ContextFragment): void {
    fragment.insertedAt = Date.now();
    this.fragments.set(fragment.id, fragment);
  }

  /** eject -- 移除指定片段 */
  eject(fragmentId: string): boolean {
    return this.fragments.delete(fragmentId);
  }

  private evictExpiredFragments(): void {
    const now = Date.now();
    for (const [id, frag] of this.fragments) {
      if (frag.ttlMs && frag.insertedAt && now - frag.insertedAt > frag.ttlMs) {
        this.fragments.delete(id);
      }
    }
  }

  /** Token 估算（生产环境应使用 tiktoken） */
  private estimateTokens(text: string): number {
    const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    return Math.ceil(cjk / 2 + (text.length - cjk) / 4);
  }
}
```


---

### 3.1.3 Layer 3 -- Tool System 工具层

**工具层**赋予 Agent 与外部世界交互的能力。如果说 LLM 是 Agent 的"大脑"，那么工具层就是它的"双手"。一个没有工具的 Agent 只能进行纯文本推理；而有了工具层，Agent 可以搜索互联网、查询数据库、调用 API、执行代码等。

工具层的设计需要解决四个核心问题：（1）**注册与发现**——如何让 Agent 知道有哪些工具可用及其功能；（2）**参数校验**——确保 LLM 生成的工具调用参数符合 Schema；（3）**安全执行**——在沙箱中执行工具，防止恶意操作；（4）**结果标准化**——将不同工具的异构返回结果转换为 LLM 可理解的统一格式。

```typescript
// ============================================================
// Layer 3: Tool System -- 工具注册与执行
// ============================================================

/** JSON Schema 子集，用于描述工具参数 */
interface ParameterSchema {
  type: "object";
  properties: Record<string, {
    type: string;
    description: string;
    enum?: string[];
    default?: unknown;
  }>;
  required: string[];
}

/** 工具定义 */
interface ToolDefinition {
  name: string;
  description: string;
  category: string;
  parameters: ParameterSchema;
  returnType: string;
  estimatedLatencyMs: number;
  costPerCall?: number;
  requiresConfirmation?: boolean;
  rateLimit?: { maxCalls: number; windowMs: number };
}

/** 工具执行器 */
type ToolExecutor = (args: Record<string, unknown>) => Promise<string>;

/** 工具注册表条目 */
interface ToolRegistryEntry {
  definition: ToolDefinition;
  executor: ToolExecutor;
  callCount: number;
  lastCalledAt?: number;
  totalDurationMs: number;
}

/**
 * ToolRegistry -- 工具注册中心
 *
 * 提供完整的工具生命周期管理：注册、发现、校验、执行、监控
 */
class ToolRegistry {
  private tools: Map<string, ToolRegistryEntry> = new Map();
  private rateLimitCounters: Map<string, { count: number; windowStart: number }> = new Map();

  /** register -- 注册工具 */
  register(definition: ToolDefinition, executor: ToolExecutor): void {
    if (this.tools.has(definition.name)) {
      console.warn(`[ToolRegistry] 工具 "${definition.name}" 已存在，将被覆盖`);
    }
    this.tools.set(definition.name, {
      definition, executor, callCount: 0, totalDurationMs: 0,
    });
  }

  /** discover -- 发现可用工具，支持按分类和关键词过滤 */
  discover(filter?: {
    category?: string;
    keyword?: string;
    maxLatencyMs?: number;
  }): ToolDefinition[] {
    let results = Array.from(this.tools.values()).map((t) => t.definition);
    if (filter?.category) {
      results = results.filter((t) => t.category === filter.category);
    }
    if (filter?.keyword) {
      const kw = filter.keyword.toLowerCase();
      results = results.filter(
        (t) =>
          t.name.toLowerCase().includes(kw) ||
          t.description.toLowerCase().includes(kw)
      );
    }
    if (filter?.maxLatencyMs) {
      results = results.filter((t) => t.estimatedLatencyMs <= filter.maxLatencyMs!);
    }
    return results;
  }

  /** validate -- 校验工具调用参数 */
  validate(
    name: string,
    args: Record<string, unknown>
  ): { valid: boolean; errors: string[] } {
    const entry = this.tools.get(name);
    if (!entry) return { valid: false, errors: [`工具 "${name}" 未注册`] };

    const errors: string[] = [];
    const schema = entry.definition.parameters;

    for (const req of schema.required) {
      if (!(req in args)) errors.push(`缺少必填参数: ${req}`);
    }
    for (const [key, value] of Object.entries(args)) {
      const prop = schema.properties[key];
      if (!prop) { errors.push(`未知参数: ${key}`); continue; }
      if (prop.enum && !prop.enum.includes(String(value))) {
        errors.push(`参数 ${key} 值不在允许范围: [${prop.enum.join(", ")}]`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  /** execute -- 执行工具（含速率限制、超时、监控） */
  async execute(
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const entry = this.tools.get(name);
    if (!entry) {
      return { callId: "", output: `工具 "${name}" 不存在`, isError: true, durationMs: 0 };
    }

    // 速率限制
    if (entry.definition.rateLimit && !this.checkRateLimit(name, entry.definition.rateLimit)) {
      return { callId: "", output: `工具 "${name}" 频率超限`, isError: true, durationMs: 0 };
    }

    // 参数校验
    const v = this.validate(name, args);
    if (!v.valid) {
      return { callId: "", output: `参数校验失败: ${v.errors.join("; ")}`, isError: true, durationMs: 0 };
    }

    const start = Date.now();
    try {
      const output = await withTimeout(entry.executor(args), 30_000, `工具 ${name} 超时`);
      const dur = Date.now() - start;
      entry.callCount += 1;
      entry.lastCalledAt = Date.now();
      entry.totalDurationMs += dur;
      return { callId: crypto.randomUUID(), output, isError: false, durationMs: dur };
    } catch (error) {
      return {
        callId: crypto.randomUUID(),
        output: `工具执行错误: ${(error as Error).message}`,
        isError: true,
        durationMs: Date.now() - start,
      };
    }
  }

  /** 生成供 LLM 消费的工具 Schema 描述 */
  toSchemaString(): string {
    return Array.from(this.tools.values())
      .map((t) => {
        const d = t.definition;
        const params = Object.entries(d.parameters.properties)
          .map(([k, v]) =>
            `  - ${k} (${v.type}${d.parameters.required.includes(k) ? ", 必填" : ""}): ${v.description}`
          )
          .join("\n");
        return `### ${d.name}\n${d.description}\n参数:\n${params}`;
      })
      .join("\n\n");
  }

  private checkRateLimit(name: string, limit: NonNullable<ToolDefinition["rateLimit"]>): boolean {
    const now = Date.now();
    const counter = this.rateLimitCounters.get(name);
    if (!counter || now - counter.windowStart > limit.windowMs) {
      this.rateLimitCounters.set(name, { count: 1, windowStart: now });
      return true;
    }
    if (counter.count >= limit.maxCalls) return false;
    counter.count += 1;
    return true;
  }
}
```


---

### 3.1.4 Layer 4 -- Memory 记忆层

**记忆层**使 Agent 能够跨越单次对话的边界，积累和利用历史经验。记忆系统通常分为三个层次：（1）**工作记忆**——当前对话的上下文，对应上下文引擎中的消息列表；（2）**短期记忆**——最近几次对话的关键信息，存储在内存或缓存中；（3）**长期记忆**——持久化的知识，使用向量数据库实现语义检索。

记忆层的核心挑战是 **检索相关性**——如何从海量历史中快速找到与当前任务最相关的信息。这需要结合语义向量搜索和结构化过滤（时间、标签、重要性等元数据）。

```typescript
// ============================================================
// Layer 4: Memory System -- 记忆系统
// ============================================================

/** 记忆条目 */
interface MemoryEntry {
  id: string;
  content: string;
  embedding?: number[];
  type: "episodic" | "semantic" | "procedural";
  importance: number;        // 0-1
  accessCount: number;
  lastAccessedAt: number;
  createdAt: number;
  metadata: Record<string, unknown>;
  tags: string[];
}

/** 记忆检索请求 */
interface MemoryQuery {
  text: string;
  topK: number;
  type?: MemoryEntry["type"];
  minImportance?: number;
  tags?: string[];
  timeRange?: { start: number; end: number };
}

/** 记忆检索结果 */
interface MemorySearchResult {
  entry: MemoryEntry;
  relevanceScore: number;
  recencyScore: number;
  combinedScore: number;
}

/**
 * MemorySystem -- 三层记忆系统
 *
 * 整合短期记忆、长期记忆和语义检索，
 * 为 Agent 提供跨会话的知识积累与利用能力。
 */
class MemorySystem {
  private shortTermBuffer: MemoryEntry[] = [];
  private longTermStore: MemoryEntry[] = [];  // 生产环境应替换为向量数据库
  private readonly shortTermCapacity: number;

  constructor(config: { shortTermCapacity: number }) {
    this.shortTermCapacity = config.shortTermCapacity;
  }

  /** store -- 存储新记忆 */
  async store(
    entry: Omit<MemoryEntry, "id" | "accessCount" | "lastAccessedAt" | "createdAt">
  ): Promise<string> {
    const full: MemoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      accessCount: 0,
      lastAccessedAt: Date.now(),
      createdAt: Date.now(),
    };

    if (full.importance >= 0.7) {
      this.longTermStore.push(full);
    } else {
      this.shortTermBuffer.push(full);
      if (this.shortTermBuffer.length > this.shortTermCapacity) {
        this.consolidate();
      }
    }
    return full.id;
  }

  /** retrieve -- 语义检索记忆 */
  async retrieve(query: MemoryQuery): Promise<MemorySearchResult[]> {
    const all = [...this.shortTermBuffer, ...this.longTermStore];

    let candidates = all.filter((entry) => {
      if (query.type && entry.type !== query.type) return false;
      if (query.minImportance && entry.importance < query.minImportance) return false;
      if (query.tags?.length && !query.tags.some((t) => entry.tags.includes(t))) return false;
      if (query.timeRange) {
        if (entry.createdAt < query.timeRange.start || entry.createdAt > query.timeRange.end)
          return false;
      }
      return true;
    });

    const now = Date.now();
    const scored: MemorySearchResult[] = candidates.map((entry) => {
      const relevanceScore = this.textSimilarity(query.text, entry.content);
      const hoursSince = (now - entry.lastAccessedAt) / 3_600_000;
      const recencyScore = Math.exp(-0.01 * hoursSince);
      const combinedScore = relevanceScore * 0.6 + recencyScore * 0.2 + entry.importance * 0.2;
      return { entry, relevanceScore, recencyScore, combinedScore };
    });

    scored.sort((a, b) => b.combinedScore - a.combinedScore);
    const results = scored.slice(0, query.topK);

    for (const r of results) {
      r.entry.accessCount += 1;
      r.entry.lastAccessedAt = now;
    }
    return results;
  }

  /** reflect -- 反思近期记忆，提取高层模式 */
  async reflect(): Promise<MemoryEntry[]> {
    const recent = this.shortTermBuffer.slice(-20);
    if (recent.length < 5) return [];
    // 生产环境：调用 LLM 对近期记忆进行归纳
    console.log(`[Memory] 反思 ${recent.length} 条近期记忆`);
    return [];
  }

  private consolidate(): void {
    this.shortTermBuffer.sort((a, b) => b.importance - a.importance);
    const promoted = this.shortTermBuffer.splice(this.shortTermCapacity);
    for (const entry of promoted) {
      if (entry.accessCount >= 3 || entry.importance >= 0.5) {
        this.longTermStore.push(entry);
      }
    }
  }

  private textSimilarity(a: string, b: string): number {
    const setA = new Set(a.toLowerCase().split(/\s+/));
    const setB = new Set(b.toLowerCase().split(/\s+/));
    const inter = new Set([...setA].filter((x) => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size > 0 ? inter.size / union.size : 0;
  }
}
```


---

### 3.1.5 Layer 5 -- Security 安全层

**安全层**是生产级 Agent 系统中不可或缺的防护网。Agent 不仅要防范传统的注入攻击和越权访问，还要应对 **Prompt Injection**、**工具滥用**、**信息泄露**等 LLM 特有的安全风险。

安全层的职责贯穿 Agent 处理的全生命周期：（1）**输入校验**——检测 Prompt Injection、恶意指令；（2）**工具调用审核**——检查调用是否符合权限策略；（3）**输出净化**——过滤内部信息、隐私数据；（4）**审计日志**——记录所有关键操作。

```typescript
// ============================================================
// Layer 5: Security -- 安全守卫
// ============================================================

/** 安全校验结果 */
interface SecurityCheckResult {
  allowed: boolean;
  reason?: string;
  riskLevel: "none" | "low" | "medium" | "high" | "critical";
}

/** 审计日志条目 */
interface AuditLogEntry {
  id: string;
  timestamp: number;
  action: string;
  actor: string;
  target: string;
  input?: string;
  output?: string;
  riskLevel: string;
  decision: "allowed" | "blocked" | "modified";
}

/** 安全策略配置 */
interface SecurityPolicy {
  allowedTools: string[];
  blockedPatterns: RegExp[];
  maxOutputLength: number;
  piiPatterns: RegExp[];
  sensitiveKeywords: string[];
  requireConfirmation: string[];
}

/**
 * SecurityGuard -- 安全守卫
 *
 * 提供全链路安全防护：输入校验、工具审核、输出净化、审计日志。
 */
class SecurityGuard {
  private policy: SecurityPolicy;
  private auditLog: AuditLogEntry[] = [];
  private readonly INJECTION_PATTERNS: RegExp[] = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /system\s*:\s*/i,
    /DROP\s+TABLE/i,
    /;\s*DELETE\s+FROM/i,
    /<script\b/i,
  ];

  constructor(policy: SecurityPolicy) {
    this.policy = policy;
  }

  /** validateInput -- 校验用户输入 */
  validateInput(input: string): SecurityCheckResult {
    for (const pattern of this.INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        this.log("input_validation", "user", "agent_input", "high", "blocked");
        return { allowed: false, reason: "检测到疑似 Prompt Injection", riskLevel: "high" };
      }
    }
    for (const pattern of this.policy.blockedPatterns) {
      if (pattern.test(input)) {
        this.log("input_validation", "user", "agent_input", "medium", "blocked");
        return { allowed: false, reason: "输入包含被禁止的内容", riskLevel: "medium" };
      }
    }
    if (input.length > 50000) {
      return { allowed: false, reason: "输入超出长度限制", riskLevel: "low" };
    }
    this.log("input_validation", "user", "agent_input", "none", "allowed");
    return { allowed: true, riskLevel: "none" };
  }

  /** validateToolCall -- 校验工具调用权限 */
  validateToolCall(call: ToolCall): SecurityCheckResult {
    if (!this.policy.allowedTools.includes(call.name) &&
        !this.policy.allowedTools.includes("*")) {
      this.log("tool_validation", "agent", `tool:${call.name}`, "high", "blocked");
      return { allowed: false, reason: `工具 "${call.name}" 不在允许列表`, riskLevel: "high" };
    }
    const argsStr = JSON.stringify(call.arguments);
    for (const pattern of this.INJECTION_PATTERNS) {
      if (pattern.test(argsStr)) {
        this.log("tool_validation", "agent", `tool:${call.name}`, "high", "blocked");
        return { allowed: false, reason: "工具参数含可疑注入", riskLevel: "high" };
      }
    }
    this.log("tool_validation", "agent", `tool:${call.name}`, "none", "allowed");
    return { allowed: true, riskLevel: "none" };
  }

  /** sanitizeOutput -- 输出净化 */
  sanitizeOutput(output: string): string {
    let sanitized = output;
    for (const pattern of this.policy.piiPatterns) {
      sanitized = sanitized.replace(pattern, "[已脱敏]");
    }
    for (const kw of this.policy.sensitiveKeywords) {
      const regex = new RegExp(`[^。]*${kw}[^。]*[。]?`, "gi");
      sanitized = sanitized.replace(regex, "[敏感内容已移除]");
    }
    if (sanitized.length > this.policy.maxOutputLength) {
      sanitized = sanitized.slice(0, this.policy.maxOutputLength) + "\n...[输出已截断]";
    }
    if (sanitized !== output) {
      this.log("output_sanitization", "agent", "output", "medium", "modified");
    }
    return sanitized;
  }

  /** getAuditLog -- 获取审计日志 */
  getAuditLog(filter?: { since?: number; riskLevel?: string }): AuditLogEntry[] {
    let entries = [...this.auditLog];
    if (filter?.since) entries = entries.filter((e) => e.timestamp >= filter.since!);
    if (filter?.riskLevel) entries = entries.filter((e) => e.riskLevel === filter.riskLevel);
    return entries;
  }

  private log(
    action: string, actor: string, target: string,
    riskLevel: string, decision: "allowed" | "blocked" | "modified"
  ): void {
    this.auditLog.push({
      id: crypto.randomUUID(), timestamp: Date.now(),
      action, actor, target, riskLevel, decision,
    });
  }
}
```


---

### 3.1.6 Layer 6 -- Evaluation 评估层

**评估层**是 Agent 系统从"能用"走向"好用"的关键保障。Agent 的行为具有非确定性，评估层需要建立系统化的质量度量和基准测试体系。

评估层覆盖三个维度：（1）**实时指标采集**——追踪延迟、Token 消耗、工具成功率等；（2）**离线基准测试**——在标准数据集上运行对比；（3）**回归检测**——模型升级或 Prompt 修改时自动检测质量退化。

```typescript
// ============================================================
// Layer 6: Evaluation -- 评估框架
// ============================================================

/** 评估指标 */
interface Metric {
  name: string;
  description: string;
  compute: (result: EvalResult) => number;  // 返回 0-1
  weight: number;
  threshold: number;
}

/** 单次评估结果 */
interface EvalResult {
  input: string;
  expectedOutput?: string;
  actualOutput: string;
  steps: AgentStep[];
  tokenTracker: TokenTracker;
  durationMs: number;
  toolCallCount: number;
  errorCount: number;
}

/** 基准测试用例 */
interface BenchmarkCase {
  id: string;
  input: string;
  expectedOutput?: string;
  tags: string[];
}

/** 回归检测报告 */
interface RegressionReport {
  timestamp: number;
  baselineVersion: string;
  currentVersion: string;
  totalCases: number;
  regressions: Array<{
    caseId: string;
    metric: string;
    baselineValue: number;
    currentValue: number;
    delta: number;
  }>;
  improvements: Array<{ caseId: string; metric: string; delta: number }>;
}

/**
 * EvalFramework -- Agent 评估框架
 *
 * 提供指标定义、基准测试、回归检测的完整评估能力。
 */
class EvalFramework {
  private metrics: Map<string, Metric> = new Map();
  private benchmarkSuite: BenchmarkCase[] = [];
  private baselineResults: Map<string, Record<string, number>> = new Map();

  constructor() {
    this.registerDefaultMetrics();
  }

  registerMetric(metric: Metric): void {
    this.metrics.set(metric.name, metric);
  }

  /** evaluate -- 评估单次执行结果 */
  evaluate(result: EvalResult): Record<string, number> & { overall: number } {
    const scores: Record<string, number> = {};
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [name, metric] of this.metrics) {
      try {
        const score = Math.max(0, Math.min(1, metric.compute(result)));
        scores[name] = score;
        weightedSum += score * metric.weight;
        totalWeight += metric.weight;
        if (score < metric.threshold) {
          console.warn(`[Eval] "${name}" 低于阈值: ${score.toFixed(3)} < ${metric.threshold}`);
        }
      } catch {
        scores[name] = 0;
      }
    }

    return { ...scores, overall: totalWeight > 0 ? weightedSum / totalWeight : 0 };
  }

  /** runBenchmark -- 运行基准测试 */
  async runBenchmark(
    agentFn: (input: string) => Promise<EvalResult>,
    tags?: string[]
  ): Promise<{
    summary: { avgScore: number; passRate: number; totalDuration: number };
    details: Array<{ caseId: string; scores: Record<string, number> }>;
  }> {
    let cases = this.benchmarkSuite;
    if (tags?.length) cases = cases.filter((c) => tags.some((t) => c.tags.includes(t)));

    const start = Date.now();
    const details: Array<{ caseId: string; scores: Record<string, number> }> = [];
    let totalScore = 0;
    let passCount = 0;

    for (const tc of cases) {
      try {
        const result = await agentFn(tc.input);
        if (tc.expectedOutput) result.expectedOutput = tc.expectedOutput;
        const scores = this.evaluate(result);
        details.push({ caseId: tc.id, scores });
        totalScore += scores.overall;
        if (scores.overall >= 0.7) passCount += 1;
      } catch {
        details.push({ caseId: tc.id, scores: { overall: 0 } });
      }
    }

    return {
      summary: {
        avgScore: cases.length > 0 ? totalScore / cases.length : 0,
        passRate: cases.length > 0 ? passCount / cases.length : 0,
        totalDuration: Date.now() - start,
      },
      details,
    };
  }

  /** detectRegressions -- 回归检测 */
  detectRegressions(
    current: Array<{ caseId: string; scores: Record<string, number> }>,
    baselineVersion: string,
    currentVersion: string,
    threshold = 0.05
  ): RegressionReport {
    const regressions: RegressionReport["regressions"] = [];
    const improvements: RegressionReport["improvements"] = [];

    for (const c of current) {
      const baseline = this.baselineResults.get(c.caseId);
      if (!baseline) continue;
      for (const [metric, val] of Object.entries(c.scores)) {
        if (metric === "overall") continue;
        const base = baseline[metric];
        if (base === undefined) continue;
        const delta = val - base;
        if (delta < -threshold) regressions.push({ caseId: c.caseId, metric, baselineValue: base, currentValue: val, delta });
        else if (delta > threshold) improvements.push({ caseId: c.caseId, metric, delta });
      }
    }

    return { timestamp: Date.now(), baselineVersion, currentVersion, totalCases: current.length, regressions, improvements };
  }

  private registerDefaultMetrics(): void {
    this.registerMetric({
      name: "task_completion", description: "任务完成度",
      weight: 0.3, threshold: 0.6,
      compute: (r) => r.errorCount === 0 ? 0.8 : 0.3,
    });
    this.registerMetric({
      name: "token_efficiency", description: "Token 效率",
      weight: 0.2, threshold: 0.4,
      compute: (r) => {
        const total = r.tokenTracker.totalPromptTokens + r.tokenTracker.totalCompletionTokens;
        return Math.max(0, 1 - (total - 2000) / 18000);
      },
    });
    this.registerMetric({
      name: "latency", description: "延迟表现",
      weight: 0.15, threshold: 0.5,
      compute: (r) => Math.max(0, 1 - (r.durationMs - 5000) / 55000),
    });
    this.registerMetric({
      name: "step_efficiency", description: "步骤效率",
      weight: 0.15, threshold: 0.5,
      compute: (r) => Math.max(0, 1 - (r.steps.length - 3) / 7),
    });
    this.registerMetric({
      name: "error_rate", description: "错误率",
      weight: 0.2, threshold: 0.7,
      compute: (r) => r.steps.length > 0 ? 1 - r.errorCount / r.steps.length : 1,
    });
  }
}
```


---

### 3.1.7 Layer 7 -- Orchestration 编排层

**编排层**负责协调多个 Agent 之间的协作。在复杂任务中，单个 Agent 往往难以胜任。编排层通过 **路由、分发和聚合** 机制，将复杂任务分解给多个专业 Agent，并将结果整合为最终输出。

编排层的三个核心能力：（1）**路由（Route）**——根据任务特征选择最合适的 Agent；（2）**委派（Delegate）**——分配子任务，管理依赖关系和并行执行；（3）**聚合（Aggregate）**——整合各 Agent 的结果。

编排模式的变体包括：**串行管道**（Pipeline）、**并行扇出**（Fan-out/Fan-in）、**层级委派**（Hierarchical）。

```typescript
// ============================================================
// Layer 7: Orchestration -- 多 Agent 编排
// ============================================================

/** Agent 描述信息 */
interface AgentDescriptor {
  id: string;
  name: string;
  capabilities: string[];
  maxConcurrency: number;
  avgLatencyMs: number;
  costPerCall: number;
  reliability: number;   // 0-1
}

/** 路由决策 */
interface RoutingDecision {
  targetAgent: string;
  confidence: number;
  reasoning: string;
  fallbackAgent?: string;
}

/** 委派任务 */
interface DelegatedTask {
  id: string;
  agentId: string;
  input: string;
  priority: number;
  dependencies: string[];
  timeout: number;
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
}

/** 聚合策略 */
type AggregationStrategy = "concat" | "vote" | "synthesize" | "best_of_n" | "chain";

/**
 * Orchestrator -- 多 Agent 编排器
 */
class Orchestrator {
  private agents: Map<string, AgentDescriptor> = new Map();
  private activeTasks: Map<string, DelegatedTask> = new Map();

  registerAgent(descriptor: AgentDescriptor): void {
    this.agents.set(descriptor.id, descriptor);
  }

  /** route -- 智能路由（能力匹配 + 可靠性 + 成本） */
  route(
    taskDescription: string,
    constraints?: { maxLatencyMs?: number; maxCost?: number }
  ): RoutingDecision {
    const candidates = Array.from(this.agents.values());
    if (candidates.length === 0) throw new Error("没有可用 Agent");

    const scored = candidates.map((agent) => {
      const words = new Set(taskDescription.toLowerCase().split(/\s+/));
      const capMatch = agent.capabilities.filter(
        (c) => [...words].some((w) => c.toLowerCase().includes(w))
      ).length / Math.max(agent.capabilities.length, 1);

      if (constraints?.maxLatencyMs && agent.avgLatencyMs > constraints.maxLatencyMs)
        return { agent, score: 0, reasoning: "延迟超限" };
      if (constraints?.maxCost && agent.costPerCall > constraints.maxCost)
        return { agent, score: 0, reasoning: "成本超限" };

      const score = capMatch * 0.5 + agent.reliability * 0.3 + (1 - agent.costPerCall / 10) * 0.2;
      return { agent, score, reasoning: `能力: ${capMatch.toFixed(2)}, 可靠性: ${agent.reliability}` };
    });

    scored.sort((a, b) => b.score - a.score);
    return {
      targetAgent: scored[0].agent.id,
      confidence: scored[0].score,
      reasoning: scored[0].reasoning,
      fallbackAgent: scored[1]?.agent.id,
    };
  }

  /** delegate -- 任务委派（拓扑排序并行执行） */
  async delegate(
    tasks: Array<Omit<DelegatedTask, "status">>,
    executeFn: (agentId: string, input: string) => Promise<string>
  ): Promise<DelegatedTask[]> {
    for (const t of tasks) {
      this.activeTasks.set(t.id, { ...t, status: "pending" });
    }

    const completed: DelegatedTask[] = [];

    while (completed.length < tasks.length) {
      const ready = tasks.filter((t) => {
        const task = this.activeTasks.get(t.id)!;
        if (task.status !== "pending") return false;
        return t.dependencies.every((d) => this.activeTasks.get(d)?.status === "completed");
      });

      if (ready.length === 0 && completed.length < tasks.length) {
        throw new Error("循环依赖或不可达任务");
      }

      const results = await Promise.allSettled(
        ready.map(async (t) => {
          const active = this.activeTasks.get(t.id)!;
          active.status = "running";
          try {
            let enriched = t.input;
            for (const depId of t.dependencies) {
              const dep = this.activeTasks.get(depId)!;
              if (dep.result) enriched += `\n\n[来自 ${dep.agentId}]\n${dep.result}`;
            }
            active.result = await withTimeout(executeFn(t.agentId, enriched), t.timeout, `任务 ${t.id} 超时`);
            active.status = "completed";
            return active;
          } catch (e) {
            active.status = "failed";
            active.result = `错误: ${(e as Error).message}`;
            return active;
          }
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled") completed.push(r.value);
      }
    }
    return completed;
  }

  /** aggregate -- 结果聚合 */
  async aggregate(
    results: Array<{ agentId: string; output: string; score?: number }>,
    strategy: AggregationStrategy,
    synthesizeFn?: (outputs: string[]) => Promise<string>
  ): Promise<string> {
    switch (strategy) {
      case "concat":
        return results.map((r) => `[${r.agentId}]\n${r.output}`).join("\n\n---\n\n");
      case "best_of_n":
        return results.reduce((a, b) => ((a.score ?? 0) >= (b.score ?? 0) ? a : b)).output;
      case "vote": {
        const votes = new Map<string, number>();
        for (const r of results) {
          const k = r.output.trim().toLowerCase();
          votes.set(k, (votes.get(k) || 0) + 1);
        }
        const winner = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
        return results.find((r) => r.output.trim().toLowerCase() === winner[0])!.output;
      }
      case "synthesize":
        if (!synthesizeFn) throw new Error("synthesize 需要 synthesizeFn");
        return synthesizeFn(results.map((r) => r.output));
      case "chain":
        return results[results.length - 1].output;
      default:
        throw new Error(`未知聚合策略: ${strategy}`);
    }
  }
}
```


---

### 3.1.8 跨层交互：数据流全景

理解了每一层的职责后，让我们来看它们之间的数据流动。以下图展示了一次完整的 Agent 执行过程中数据的流转路径：

```
用户请求
    |
    v
+--------- Layer 7: Orchestration 编排层 ----------+
|  route(task) --> 选择目标 Agent --> delegate()    |
|                      |                  ^         |
|                      v                  |         |
|  +--- Layer 5: Security ---+    aggregate()       |
|  |   validateInput(req)    |         |            |
|  +---------+---------------+         |            |
|            v                         |            |
|  +--- Layer 1: Agent Core 核心循环 --+            |
|  |                                   |            |
|  |  for each iteration:              |            |
|  |                                   |            |
|  |    Layer 2: Context Engine        |            |
|  |      assembleContext()            |            |
|  |        <-- Layer 4: Memory        |            |
|  |        <-- RAG fragments          |            |
|  |           |                       |            |
|  |           v                       |            |
|  |      callLLM(messages)            |            |
|  |           |                       |            |
|  |      +----+----+                  |            |
|  |   tool_calls   stop               |            |
|  |      |          |                 |            |
|  |      v          v                 |            |
|  |  Layer 3:    sanitizeOutput()     |            |
|  |  validate()  (Layer 5)            |            |
|  |  execute()      |                 |            |
|  |      |          v                 |            |
|  |  observation  final answer -------+            |
|  |      |                                         |
|  |  Layer 4: Memory.store()                       |
|  +------------------------------------------------+
|                      |                             |
|  +--- Layer 6: Evaluation ---+                     |
|  |   evaluate(result)        |                     |
|  |   detectRegressions()     |                     |
|  +---------------------------+                     |
+----------------------------------------------------+
    |
    v
最终响应 --> 用户
```

**关键数据流说明：**

1. **请求入站**：用户请求首先到达 **编排层**（L7），编排层决定路由策略。
2. **安全前置**：在进入核心循环前，请求经过 **安全层**（L5）的输入校验。
3. **上下文组装**：**上下文引擎**（L2）从 **记忆层**（L4）检索相关历史，组装完整上下文。
4. **推理与执行**：**核心循环**（L1）调用 LLM，如需工具则交由 **工具层**（L3）执行。
5. **记忆沉淀**：工具结果和关键推理步骤被写入 **记忆层**（L4）。
6. **输出净化**：最终答案经过 **安全层**（L5）的输出净化后返回。
7. **质量评估**：完成后，**评估层**（L6）对本次执行进行质量评分和回归检测。
8. **结果聚合**：多 Agent 场景下，**编排层**（L7）聚合各 Agent 的结果。


---

## 3.2 Agent Loop 模式

Agent Loop（智能体循环）是 Agent 系统的行为模式——它定义了 Agent 如何组织推理和行动过程。不同的 Loop 模式适用于不同类型的任务，选择合适的模式对效率、可靠性和成本有决定性影响。

本节将深入分析三种经典模式（ReAct、Plan-and-Execute、Adaptive），并扩展引入 Reflective Loop 和 Hybrid 模式。

---

### 3.2.1 ReAct 模式：思考-行动-观察

**ReAct（Reasoning + Acting）** 是最经典的 Agent Loop 模式，由 Yao et al. 于 2022 年提出。其核心思想是让 LLM 在每一步中显式输出 **思考过程（Thought）**，然后决定一个 **行动（Action）**，最后观察行动的 **结果（Observation）**，再基于观察进行下一轮思考。

ReAct 模式的优势在于：（1）**可解释性强**——每一步思考过程都被记录；（2）**灵活性高**——可根据每步观察动态调整策略；（3）**实现简单**——不需要预先制定完整计划。

但 ReAct 也有缺点：（1）**贪心决策**——每一步只看当前状态，缺乏全局规划；（2）**Token 消耗高**——每步都需完整上下文；（3）**容易陷入循环**——在缺乏进展时可能反复执行相同动作。

以下实现增加了结构化的步骤追踪，每步的 Thought、Action、Observation 都被完整记录：

```typescript
// ============================================================
// 3.2.1 ReAct 模式 -- 带完整追踪的实现
// ============================================================

/** ReAct 单步追踪记录 */
interface ReActTrace {
  step: number;
  thought: string;
  action: {
    type: "tool_call" | "final_answer";
    tool?: string;
    args?: Record<string, unknown>;
    answer?: string;
  };
  observation?: string;
  tokenUsage: { prompt: number; completion: number };
  durationMs: number;
  timestamp: number;
}

/** ReAct Agent 配置 */
interface ReActConfig {
  maxSteps: number;
  systemPrompt: string;
  tools: ToolDefinition[];
  enableThoughtChain: boolean;
  loopDetection: {
    enabled: boolean;
    maxRepeats: number;     // 相同动作最多重复次数
  };
}

/**
 * TracedReActAgent -- 带完整追踪的 ReAct Agent
 *
 * 每步 Thought / Action / Observation 都被结构化记录，
 * 支持循环检测、Token 追踪、步骤级性能分析。
 */
class TracedReActAgent {
  private config: ReActConfig;
  private traces: ReActTrace[] = [];
  private actionHistory: string[] = [];

  constructor(config: ReActConfig) {
    this.config = config;
  }

  async run(
    userQuery: string,
    deps: {
      callLLM: (messages: Message[]) => Promise<LLMResponse>;
      executeTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
    }
  ): Promise<{ answer: string; traces: ReActTrace[] }> {
    this.traces = [];
    this.actionHistory = [];

    const messages: Message[] = [
      { role: "system", content: this.buildReActPrompt() },
      { role: "user", content: userQuery },
    ];

    for (let step = 0; step < this.config.maxSteps; step++) {
      const stepStart = Date.now();
      const response = await deps.callLLM(messages);
      const parsed = this.parseReActResponse(response.content);

      // ---- 循环检测 ----
      if (this.config.loopDetection.enabled && parsed.action.type === "tool_call") {
        const actionKey = `${parsed.action.tool}:${JSON.stringify(parsed.action.args)}`;
        const repeatCount = this.actionHistory.filter((a) => a === actionKey).length;

        if (repeatCount >= this.config.loopDetection.maxRepeats) {
          console.warn(`[ReAct] 检测到循环: ${actionKey} 已重复 ${repeatCount} 次`);
          messages.push({
            role: "user",
            content: `注意：你已重复执行 "${parsed.action.tool}" ${repeatCount} 次。请尝试不同方法或给出当前最佳答案。`,
          });
          continue;
        }
        this.actionHistory.push(actionKey);
      }

      // ---- Final Answer ----
      if (parsed.action.type === "final_answer") {
        this.traces.push({
          step,
          thought: parsed.thought,
          action: parsed.action,
          tokenUsage: { prompt: response.usage.promptTokens, completion: response.usage.completionTokens },
          durationMs: Date.now() - stepStart,
          timestamp: Date.now(),
        });
        return { answer: parsed.action.answer!, traces: this.traces };
      }

      // ---- 执行工具 ----
      let observation: string;
      try {
        const result = await deps.executeTool(parsed.action.tool!, parsed.action.args!);
        observation = result.isError ? `工具执行错误: ${result.output}` : result.output;
      } catch (error) {
        observation = `工具执行异常: ${(error as Error).message}`;
      }

      this.traces.push({
        step,
        thought: parsed.thought,
        action: parsed.action,
        observation,
        tokenUsage: { prompt: response.usage.promptTokens, completion: response.usage.completionTokens },
        durationMs: Date.now() - stepStart,
        timestamp: Date.now(),
      });

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: `Observation: ${observation}` });
    }

    return {
      answer: "已达到最大步数。" + (this.traces[this.traces.length - 1]?.thought || ""),
      traces: this.traces,
    };
  }

  /** 构建 ReAct 系统提示词 */
  private buildReActPrompt(): string {
    const toolDesc = this.config.tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");
    return `${this.config.systemPrompt}

你可以使用以下工具:
${toolDesc}

请严格按照以下格式回答:
Thought: [你的分析和推理]
Action: [工具名称，或 "FinalAnswer"]
Action Input: [JSON 参数；若为 FinalAnswer 则写最终答案]

每次只执行一个动作，等待观察结果后再进行下一步。`;
  }

  /** 解析 ReAct 格式输出 */
  private parseReActResponse(content: string): {
    thought: string;
    action: ReActTrace["action"];
  } {
    const thoughtMatch = content.match(/Thought:\s*([\s\S]*?)(?=\nAction:)/i);
    const actionMatch = content.match(/Action:\s*(.*)/i);
    const inputMatch = content.match(/Action Input:\s*([\s\S]*?)$/i);

    const thought = thoughtMatch?.[1]?.trim() || content;
    const actionName = actionMatch?.[1]?.trim() || "";

    if (actionName.toLowerCase().includes("finalanswer") || actionName.toLowerCase().includes("final_answer")) {
      return {
        thought,
        action: { type: "final_answer", answer: inputMatch?.[1]?.trim() || thought },
      };
    }

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(inputMatch?.[1]?.trim() || "{}");
    } catch {
      args = { query: inputMatch?.[1]?.trim() || "" };
    }

    return { thought, action: { type: "tool_call", tool: actionName, args } };
  }

  /** 获取执行摘要 */
  getSummary(): {
    totalSteps: number;
    totalTokens: number;
    totalDurationMs: number;
    toolsUsed: string[];
  } {
    const toolsUsed = new Set<string>();
    let totalTokens = 0;
    let totalDurationMs = 0;
    for (const t of this.traces) {
      totalTokens += t.tokenUsage.prompt + t.tokenUsage.completion;
      totalDurationMs += t.durationMs;
      if (t.action.tool) toolsUsed.add(t.action.tool);
    }
    return { totalSteps: this.traces.length, totalTokens, totalDurationMs, toolsUsed: [...toolsUsed] };
  }
}
```

---

### 3.2.2 Plan-and-Execute 模式：先规划后执行

**Plan-and-Execute** 模式将工作分为两个阶段：**Planner（规划器）** 制定完整计划，**Executor（执行器）** 逐步执行。这种模式借鉴了传统 AI 规划的思想，用 LLM 替代形式化规划算法。

优势：（1）**全局视角**——执行前就考虑了任务完整结构；（2）**Token 效率高**——执行阶段不需每次传入完整任务描述；（3）**可预测性强**——用户可在执行前审查计划。

局限：（1）**计划可能过时**——执行过程中环境可能变化；（2）**规划开销**——简单任务中制定计划反而增加延迟。

为解决计划过时问题，我们引入 **动态重规划** 机制：当执行结果与预期严重偏离时，通过 **DiffPlanMerger** 将新计划与旧计划合并。

```typescript
// ============================================================
// 3.2.2 Plan-and-Execute -- 含动态重规划
// ============================================================

/** 计划步骤 */
interface PlanStep {
  id: string;
  description: string;
  tool?: string;
  dependencies: string[];
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  result?: string;
  estimatedTokens?: number;
}

/** 执行计划 */
interface ExecutionPlan {
  goal: string;
  steps: PlanStep[];
  createdAt: number;
  version: number;
  reasoning: string;
}

/**
 * PlanAndExecuteAgent -- 先规划后执行 Agent
 *
 * 支持：LLM 驱动的计划生成与校验、步骤依赖图拓扑排序执行、
 * 执行偏差检测与动态重规划、DiffPlanMerger 最小化变更。
 */
class PlanAndExecuteAgent {
  private currentPlan: ExecutionPlan | null = null;

  async run(
    goal: string,
    deps: {
      callLLM: (messages: Message[]) => Promise<LLMResponse>;
      executeTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
    }
  ): Promise<{ answer: string; plan: ExecutionPlan }> {

    // 阶段一：制定计划
    this.currentPlan = await this.createPlan(goal, deps.callLLM);
    console.log(`[Planner] 生成计划: ${this.currentPlan.steps.length} 步`);

    // 校验计划
    const validation = this.validatePlan(this.currentPlan);
    if (!validation.valid) {
      console.warn(`[Planner] 计划校验失败: ${validation.errors.join(", ")}`);
      this.currentPlan = await this.createPlan(
        goal + `\n注意避免: ${validation.errors.join("; ")}`,
        deps.callLLM
      );
    }

    // 阶段二：拓扑排序执行
    const order = this.topologicalSort(this.currentPlan.steps);
    let replanCount = 0;

    for (const stepId of order) {
      const step = this.currentPlan.steps.find((s) => s.id === stepId)!;
      if (step.status === "completed" || step.status === "skipped") continue;

      step.status = "running";
      try {
        const depContext = step.dependencies
          .map((d) => {
            const dep = this.currentPlan!.steps.find((s) => s.id === d);
            return dep?.result ? `[${dep.id}] ${dep.result}` : "";
          })
          .filter(Boolean)
          .join("\n");

        let result: string;
        if (step.tool) {
          const tr = await deps.executeTool(step.tool, { task: step.description, context: depContext });
          result = tr.output;
        } else {
          const resp = await deps.callLLM([
            { role: "system", content: "请根据上下文完成子任务。" },
            { role: "user", content: `任务: ${step.description}\n上下文:\n${depContext}` },
          ]);
          result = resp.content;
        }

        step.status = "completed";
        step.result = result;

        // 偏差检测
        const deviation = this.detectDeviation(step, result);
        if (deviation.needsReplan && replanCount < 3) {
          console.log(`[Planner] 触发重规划 (第 ${replanCount + 1} 次)`);
          const newPlan = await this.createPlan(
            `${goal}\n已完成:\n${this.getCompletedSummary()}\n偏差: ${deviation.reason}`,
            deps.callLLM
          );
          this.currentPlan = DiffPlanMerger.merge(this.currentPlan, newPlan);
          replanCount += 1;
          break;
        }
      } catch (error) {
        step.status = "failed";
        step.result = `执行失败: ${(error as Error).message}`;
      }
    }

    // 阶段三：综合最终答案
    const completedResults = this.currentPlan.steps
      .filter((s) => s.status === "completed" && s.result)
      .map((s) => `[${s.description}]\n${s.result}`)
      .join("\n\n");

    const final = await deps.callLLM([
      { role: "system", content: "请综合各步骤结果，生成完整最终答案。" },
      { role: "user", content: `目标: ${goal}\n\n各步骤结果:\n${completedResults}` },
    ]);

    return { answer: final.content, plan: this.currentPlan };
  }

  private async createPlan(
    goal: string,
    callLLM: (messages: Message[]) => Promise<LLMResponse>
  ): Promise<ExecutionPlan> {
    const resp = await callLLM([
      {
        role: "system",
        content: `你是任务规划器。请为目标制定分步计划，以 JSON 输出 steps 数组。
每步含: id, description, tool(可选), dependencies(前置步骤 ID 数组), estimatedTokens。
确保无循环依赖。`,
      },
      { role: "user", content: goal },
    ]);

    try {
      const data = JSON.parse(resp.content.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
      return {
        goal,
        steps: data.steps.map((s: any) => ({ ...s, status: "pending" as const })),
        createdAt: Date.now(),
        version: (this.currentPlan?.version || 0) + 1,
        reasoning: data.reasoning || "",
      };
    } catch {
      return {
        goal,
        steps: [{ id: "step_1", description: goal, dependencies: [], status: "pending" as const }],
        createdAt: Date.now(),
        version: 1,
        reasoning: "解析失败，退化为单步执行",
      };
    }
  }

  private validatePlan(plan: ExecutionPlan): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const ids = new Set(plan.steps.map((s) => s.id));
    for (const step of plan.steps) {
      for (const dep of step.dependencies) {
        if (!ids.has(dep)) errors.push(`步骤 ${step.id} 引用不存在的依赖: ${dep}`);
      }
      if (step.dependencies.includes(step.id)) errors.push(`步骤 ${step.id} 自引用`);
    }
    try { this.topologicalSort(plan.steps); } catch { errors.push("存在循环依赖"); }
    return { valid: errors.length === 0, errors };
  }

  private topologicalSort(steps: PlanStep[]): string[] {
    const inDeg = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const s of steps) {
      inDeg.set(s.id, s.dependencies.length);
      for (const d of s.dependencies) {
        if (!adj.has(d)) adj.set(d, []);
        adj.get(d)!.push(s.id);
      }
    }
    const queue = steps.filter((s) => s.dependencies.length === 0).map((s) => s.id);
    const result: string[] = [];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      result.push(cur);
      for (const next of adj.get(cur) || []) {
        const d = (inDeg.get(next) || 1) - 1;
        inDeg.set(next, d);
        if (d === 0) queue.push(next);
      }
    }
    if (result.length !== steps.length) throw new Error("循环依赖");
    return result;
  }

  private detectDeviation(step: PlanStep, result: string): { needsReplan: boolean; reason: string } {
    if (result.includes("错误") || result.includes("失败") || result.trim().length === 0) {
      return { needsReplan: true, reason: `步骤 ${step.id} 结果异常` };
    }
    return { needsReplan: false, reason: "" };
  }

  private getCompletedSummary(): string {
    if (!this.currentPlan) return "";
    return this.currentPlan.steps
      .filter((s) => s.status === "completed")
      .map((s) => `- ${s.description}: ${(s.result || "").slice(0, 100)}`)
      .join("\n");
  }
}

/**
 * DiffPlanMerger -- 计划差异合并器
 *
 * 保留已完成步骤，将新计划中的未完成步骤与旧计划合并。
 */
class DiffPlanMerger {
  static merge(oldPlan: ExecutionPlan, newPlan: ExecutionPlan): ExecutionPlan {
    const completed = oldPlan.steps.filter(
      (s) => s.status === "completed" || s.status === "running"
    );
    const completedIds = new Set(completed.map((s) => s.id));
    const newSteps = newPlan.steps.filter((s) => !completedIds.has(s.id));

    for (const step of newSteps) {
      step.dependencies = step.dependencies.filter(
        (d) => completedIds.has(d) || newSteps.some((s) => s.id === d)
      );
    }

    return {
      goal: oldPlan.goal,
      steps: [...completed, ...newSteps],
      createdAt: oldPlan.createdAt,
      version: oldPlan.version + 1,
      reasoning: `重规划: 保留 ${completed.length} 步，新增 ${newSteps.length} 步`,
    };
  }
}
```

---

### 3.2.3 Adaptive 模式：自适应选择

**Adaptive 模式**是一种元模式——它根据任务特征动态选择最合适的执行模式。通过 **复杂度评估**（基于 Token 数量、工具需求、领域检测、问句类型等 heuristic）在 Direct、ReAct、Plan-and-Execute 之间做出最优选择。

```typescript
// ============================================================
// 3.2.3 Adaptive 模式 -- 智能路由
// ============================================================

/** 任务复杂度等级 */
type ComplexityLevel = "trivial" | "simple" | "moderate" | "complex" | "expert";

/** 复杂度评估结果 */
interface ComplexityAssessment {
  level: ComplexityLevel;
  score: number;               // 0-100
  factors: {
    tokenCount: number;
    estimatedToolCount: number;
    domainComplexity: number;
    questionType: string;
    requiresPlanning: boolean;
  };
  recommendedPattern: "direct" | "react" | "plan_and_execute" | "reflective";
  reasoning: string;
}

/**
 * ComplexityScorer -- 任务复杂度评分器
 *
 * 多维度启发式规则对用户输入进行复杂度评估。
 */
class ComplexityScorer {
  private toolKeywords: Map<string, string[]>;
  private domainKeywords: Map<string, string[]>;

  constructor() {
    this.toolKeywords = new Map([
      ["search", ["搜索", "查找", "查询", "search", "look up", "find"]],
      ["code", ["代码", "编程", "实现", "code", "implement", "debug"]],
      ["data", ["数据", "分析", "统计", "data", "analyze", "chart"]],
      ["file", ["文件", "读取", "写入", "file", "read", "write"]],
      ["api", ["API", "接口", "请求", "调用", "fetch", "request"]],
    ]);
    this.domainKeywords = new Map([
      ["math", ["计算", "数学", "方程", "积分", "概率"]],
      ["coding", ["算法", "数据结构", "设计模式", "重构", "架构"]],
      ["research", ["研究", "论文", "综述", "对比分析", "调研"]],
    ]);
  }

  assess(input: string): ComplexityAssessment {
    const tokenCount = Math.ceil(input.length / 3);
    const tokenScore = Math.min(100, tokenCount / 10);

    let estimatedToolCount = 0;
    for (const [, keywords] of this.toolKeywords) {
      if (keywords.some((kw) => input.toLowerCase().includes(kw.toLowerCase()))) {
        estimatedToolCount += 1;
      }
    }
    const toolScore = estimatedToolCount * 20;

    let domainComplexity = 0;
    for (const [, keywords] of this.domainKeywords) {
      const matchCount = keywords.filter((kw) => input.includes(kw)).length;
      domainComplexity = Math.max(domainComplexity, matchCount * 15);
    }

    const isYesNo = /^(是否|能否|可以吗)/.test(input) || (/\?$/.test(input.trim()) && input.length < 30);
    const isMultiPart = (input.match(/[，。；\n]/g) || []).length >= 3;
    const hasStepWords = /(步骤|首先|然后|接着|最后|第[一二三四五])/.test(input);
    const questionType = isYesNo ? "yes_no" : isMultiPart ? "multi_part" : hasStepWords ? "procedural" : "open_ended";
    const questionScore = isYesNo ? 10 : isMultiPart ? 60 : hasStepWords ? 70 : 30;

    const requiresPlanning = estimatedToolCount >= 2 || isMultiPart || hasStepWords;
    const score = Math.min(100, Math.round(
      tokenScore * 0.15 + toolScore * 0.35 + domainComplexity * 0.25 + questionScore * 0.25
    ));

    let level: ComplexityLevel;
    let recommendedPattern: ComplexityAssessment["recommendedPattern"];
    if (score <= 15) { level = "trivial"; recommendedPattern = "direct"; }
    else if (score <= 35) { level = "simple"; recommendedPattern = "react"; }
    else if (score <= 60) { level = "moderate"; recommendedPattern = "react"; }
    else if (score <= 80) { level = "complex"; recommendedPattern = "plan_and_execute"; }
    else { level = "expert"; recommendedPattern = "reflective"; }

    return {
      level, score,
      factors: { tokenCount, estimatedToolCount, domainComplexity, questionType, requiresPlanning },
      recommendedPattern,
      reasoning: `评分 ${score}/100 -> ${recommendedPattern}`,
    };
  }
}

/**
 * AdaptiveAgent -- 自适应 Agent
 *
 * 根据复杂度评估自动选择执行模式。
 */
class AdaptiveAgent {
  private scorer = new ComplexityScorer();
  private reactAgent: TracedReActAgent;
  private planAgent: PlanAndExecuteAgent;

  constructor(reactAgent: TracedReActAgent, planAgent: PlanAndExecuteAgent) {
    this.reactAgent = reactAgent;
    this.planAgent = planAgent;
  }

  async run(
    input: string,
    deps: {
      callLLM: (messages: Message[]) => Promise<LLMResponse>;
      executeTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
    }
  ): Promise<{ answer: string; assessment: ComplexityAssessment; patternUsed: string }> {
    const assessment = this.scorer.assess(input);
    console.log(`[Adaptive] ${assessment.reasoning}`);

    let answer: string;
    switch (assessment.recommendedPattern) {
      case "direct": {
        const resp = await deps.callLLM([{ role: "user", content: input }]);
        answer = resp.content;
        break;
      }
      case "react": {
        const result = await this.reactAgent.run(input, deps);
        answer = result.answer;
        break;
      }
      case "plan_and_execute":
      case "reflective": {
        const result = await this.planAgent.run(input, deps);
        answer = result.answer;
        break;
      }
      default:
        throw new Error(`未知模式: ${assessment.recommendedPattern}`);
    }

    return { answer, assessment, patternUsed: assessment.recommendedPattern };
  }
}
```

---

### 3.2.4 Reflective Loop 模式：自我评估与修正

**Reflective Loop（反思循环）** 是在 ReAct 基础上增加了一个 **自我评估** 环节的高级模式。Agent 在生成初步答案后，不会立即返回，而是先对自己的输出进行质量评估。如果评估结果低于阈值，Agent 会进入修正循环，根据评估反馈改进答案。

这种模式特别适用于对输出质量要求高的场景：代码生成（需要检查语法和逻辑）、报告撰写（需要检查完整性和准确性）、数学推理（需要验证计算结果）。

Reflective Loop 的代价是额外的 LLM 调用（每次反思需要一次评估 + 一次修正），因此需要在质量提升和成本之间取得平衡。通常设置 2-3 次最大反思次数。

```typescript
// ============================================================
// 3.2.4 Reflective Loop -- 自我评估与修正
// ============================================================

/** 反思评估结果 */
interface ReflectionResult {
  qualityScore: number;           // 0-1，综合质量评分
  issues: string[];               // 发现的问题列表
  suggestions: string[];          // 改进建议
  shouldRefine: boolean;          // 是否需要修正
}

/** 反思追踪记录 */
interface ReflectionTrace {
  iteration: number;
  draft: string;
  evaluation: ReflectionResult;
  refinedDraft?: string;
  tokenUsage: { prompt: number; completion: number };
}

/**
 * ReflectiveAgent -- 带自我反思的 Agent
 *
 * 工作流程：生成初稿 -> 自我评估 -> 发现不足则修正 -> 重新评估
 * 直到质量达标或达到最大反思次数。
 */
class ReflectiveAgent {
  private maxReflections: number;
  private qualityThreshold: number;
  private reflectionTraces: ReflectionTrace[] = [];

  constructor(config: { maxReflections: number; qualityThreshold: number }) {
    this.maxReflections = config.maxReflections;
    this.qualityThreshold = config.qualityThreshold;
  }

  async run(
    task: string,
    deps: {
      callLLM: (messages: Message[]) => Promise<LLMResponse>;
      executeTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
    }
  ): Promise<{
    answer: string;
    reflections: ReflectionTrace[];
    totalIterations: number;
  }> {
    this.reflectionTraces = [];

    // 生成初稿
    let currentDraft = await this.generateDraft(task, deps.callLLM);

    for (let i = 0; i < this.maxReflections; i++) {
      // 自我评估
      const evaluation = await this.evaluate(task, currentDraft, deps.callLLM);

      const trace: ReflectionTrace = {
        iteration: i,
        draft: currentDraft,
        evaluation,
        tokenUsage: { prompt: 0, completion: 0 },
      };

      console.log(
        `[Reflective] 第 ${i + 1} 轮评估: ` +
        `质量 ${evaluation.qualityScore.toFixed(2)}, ` +
        `问题 ${evaluation.issues.length} 个`
      );

      // 质量达标，停止反思
      if (!evaluation.shouldRefine || evaluation.qualityScore >= this.qualityThreshold) {
        this.reflectionTraces.push(trace);
        break;
      }

      // 根据评估反馈修正
      currentDraft = await this.refine(
        task,
        currentDraft,
        evaluation,
        deps.callLLM
      );

      trace.refinedDraft = currentDraft;
      this.reflectionTraces.push(trace);
    }

    return {
      answer: currentDraft,
      reflections: this.reflectionTraces,
      totalIterations: this.reflectionTraces.length,
    };
  }

  /** 生成初稿 */
  private async generateDraft(
    task: string,
    callLLM: (messages: Message[]) => Promise<LLMResponse>
  ): Promise<string> {
    const response = await callLLM([
      {
        role: "system",
        content: "你是一个专业的任务执行者。请认真完成用户的任务，确保输出的完整性和准确性。",
      },
      { role: "user", content: task },
    ]);
    return response.content;
  }

  /** 自我评估 */
  private async evaluate(
    task: string,
    draft: string,
    callLLM: (messages: Message[]) => Promise<LLMResponse>
  ): Promise<ReflectionResult> {
    const response = await callLLM([
      {
        role: "system",
        content: `你是一个严格的质量评审专家。请评估以下回答的质量。
以 JSON 格式返回:
{
  "qualityScore": 0.0-1.0,
  "issues": ["问题1", "问题2"],
  "suggestions": ["建议1", "建议2"],
  "shouldRefine": true/false
}

评估维度：完整性、准确性、相关性、清晰度。`,
      },
      {
        role: "user",
        content: `原始任务: ${task}\n\n待评估的回答:\n${draft}`,
      },
    ]);

    try {
      const parsed = JSON.parse(
        response.content.replace(/```json?\n?/g, "").replace(/```/g, "").trim()
      );
      return {
        qualityScore: Math.max(0, Math.min(1, parsed.qualityScore || 0)),
        issues: parsed.issues || [],
        suggestions: parsed.suggestions || [],
        shouldRefine: parsed.shouldRefine ?? true,
      };
    } catch {
      // 解析失败时返回保守评估
      return {
        qualityScore: 0.5,
        issues: ["评估解析失败"],
        suggestions: ["请改进输出格式"],
        shouldRefine: false,
      };
    }
  }

  /** 根据评估反馈修正 */
  private async refine(
    task: string,
    draft: string,
    evaluation: ReflectionResult,
    callLLM: (messages: Message[]) => Promise<LLMResponse>
  ): Promise<string> {
    const response = await callLLM([
      {
        role: "system",
        content: "请根据评估反馈改进你的回答。保留好的部分，修正发现的问题。",
      },
      {
        role: "user",
        content: [
          `原始任务: ${task}`,
          `\n当前回答:\n${draft}`,
          `\n发现的问题:\n${evaluation.issues.map((i, idx) => `${idx + 1}. ${i}`).join("\n")}`,
          `\n改进建议:\n${evaluation.suggestions.map((s, idx) => `${idx + 1}. ${s}`).join("\n")}`,
          `\n请输出改进后的完整回答:`,
        ].join("\n"),
      },
    ]);
    return response.content;
  }
}
```

---

### 3.2.5 模式对比表

在选择 Agent Loop 模式时，以下对比表提供了快速决策参考：

| 维度 | Direct | ReAct | Plan-and-Execute | Reflective | Hybrid |
|------|--------|-------|-------------------|------------|--------|
| **延迟** | 极低 (1 次 LLM) | 中等 (N 次) | 中高 (规划+执行) | 高 (N+评估) | 可变 |
| **Token 成本** | 最低 | 中等 | 中等偏低 | 高（含评估） | 中等 |
| **可靠性** | 低（无纠错） | 中等 | 较高（有计划） | 最高（自纠错） | 高 |
| **可解释性** | 无 | 高（Thought 链） | 高（计划可见） | 最高（含评估） | 高 |
| **最佳场景** | 简单问答 | 通用任务 | 复杂多步任务 | 高质量输出 | 混合场景 |
| **最差场景** | 需工具任务 | 需全局规划 | 简单任务（浪费） | 低延迟要求 | 过度工程 |
| **典型步数** | 1 | 3-8 | 规划1+执行N | (3-8)*2 | 自适应 |
| **适用复杂度** | 0-15 | 15-60 | 60-80 | 80-100 | 全范围 |

---

### 3.2.6 Hybrid 模式：ReAct + Plan-and-Execute 混合

在实际生产环境中，纯粹的单一模式往往不够灵活。**Hybrid 模式**将 Plan-and-Execute 的全局视角与 ReAct 的灵活执行结合起来：先用 Planner 制定高层计划，然后每个计划步骤内部用 ReAct 循环来执行，允许在步骤级别进行灵活的探索和调整。

这种模式的优势在于既有宏观的任务分解，又保留了微观的执行灵活性。Planner 不需要预测每一个细节，而 ReAct 执行器可以在每个步骤中根据实际情况自主决策。

```typescript
// ============================================================
// 3.2.6 Hybrid 模式 -- Plan + ReAct 混合
// ============================================================

/**
 * HybridAgent -- 计划驱动 + ReAct 执行的混合 Agent
 *
 * 架构：
 *   Planner (全局计划) --> 每个步骤由 ReAct Agent 执行
 *                      --> 步骤间结果传递
 *                      --> 偏差触发重规划
 */
class HybridAgent {
  private planner: PlanAndExecuteAgent;
  private stepExecutor: TracedReActAgent;

  constructor(
    plannerConfig: { callLLM: (msgs: Message[]) => Promise<LLMResponse> },
    reactConfig: ReActConfig
  ) {
    this.planner = new PlanAndExecuteAgent();
    this.stepExecutor = new TracedReActAgent(reactConfig);
  }

  async run(
    goal: string,
    deps: {
      callLLM: (messages: Message[]) => Promise<LLMResponse>;
      executeTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
    }
  ): Promise<{
    answer: string;
    plan: ExecutionPlan;
    stepTraces: Map<string, ReActTrace[]>;
  }> {
    // 阶段一：生成高层计划
    const planResponse = await deps.callLLM([
      {
        role: "system",
        content: `你是任务规划器。请将复杂任务分解为 3-7 个高层步骤。
每个步骤应该是一个可独立执行的子任务。
以 JSON 格式输出 { steps: [{ id, description, dependencies }] }`,
      },
      { role: "user", content: goal },
    ]);

    let plan: ExecutionPlan;
    try {
      const data = JSON.parse(
        planResponse.content.replace(/```json?\n?/g, "").replace(/```/g, "").trim()
      );
      plan = {
        goal,
        steps: data.steps.map((s: any) => ({ ...s, status: "pending" as const })),
        createdAt: Date.now(),
        version: 1,
        reasoning: "Hybrid planner",
      };
    } catch {
      plan = {
        goal,
        steps: [{ id: "step_1", description: goal, dependencies: [], status: "pending" as const }],
        createdAt: Date.now(),
        version: 1,
        reasoning: "解析失败，单步执行",
      };
    }

    // 阶段二：用 ReAct 执行每个步骤
    const stepTraces = new Map<string, ReActTrace[]>();
    const stepResults = new Map<string, string>();

    for (const step of plan.steps) {
      // 收集前置步骤结果作为上下文
      const context = step.dependencies
        .map((d) => stepResults.get(d) || "")
        .filter(Boolean)
        .join("\n\n");

      const stepGoal = context
        ? `${step.description}\n\n参考信息:\n${context}`
        : step.description;

      console.log(`[Hybrid] 执行步骤 ${step.id}: ${step.description}`);

      // 用 ReAct 执行这个步骤
      const result = await this.stepExecutor.run(stepGoal, deps);

      step.status = "completed";
      step.result = result.answer;
      stepResults.set(step.id, result.answer);
      stepTraces.set(step.id, result.traces);
    }

    // 阶段三：综合最终答案
    const allResults = plan.steps
      .filter((s) => s.result)
      .map((s) => `## ${s.description}\n${s.result}`)
      .join("\n\n");

    const synthesis = await deps.callLLM([
      { role: "system", content: "请综合以下各步骤结果，生成完整连贯的最终答案。" },
      { role: "user", content: `目标: ${goal}\n\n${allResults}` },
    ]);

    return { answer: synthesis.content, plan, stepTraces };
  }
}
```


---

## 3.3 状态管理基础

Agent 系统的状态管理是一个被严重低估的工程挑战。一个正在执行的 Agent 包含大量的运行时状态：当前执行到哪一步、已经调用了哪些工具、累计消耗了多少 Token、当前的计划是什么、是否遇到了错误等。如何组织和管理这些状态，直接影响系统的可测试性、可调试性和可恢复性。

### 3.3.1 为什么需要不可变状态

在 Agent 系统中采用 **不可变状态（Immutable State）** 模式有三个核心理由：

**1. 可测试性**——不可变状态使得每一次状态转换都是纯函数：给定相同的旧状态和事件，必然产生相同的新状态。这意味着我们可以在不依赖外部环境的情况下，对状态转换逻辑进行完整的单元测试。

**2. 可调试性（Time-travel Debugging）**——由于每次状态变更都产生新的状态快照，我们可以保留完整的状态变更历史。当出现问题时，开发者可以"回到过去"，逐步检查每一次状态变更，精确定位问题发生的位置。

**3. 可审计性**——在生产环境中，我们需要能够回答"Agent 为什么做出这个决定"这样的问题。不可变状态 + 事件日志提供了完整的决策链条，满足了合规审计的要求。

### 3.3.2 Event Sourcing + Reducer 模式

我们采用 **Event Sourcing（事件溯源）** 模式来管理 Agent 状态。核心思想是：不直接修改状态，而是将所有的状态变更记录为一系列不可变的 **事件（Event）**。当前状态始终是对事件序列执行 **Reducer** 函数的结果。

```
事件流:  [E1] -> [E2] -> [E3] -> [E4] -> ... -> [En]
                    |
                    v
Reducer:  state = events.reduce(reducer, initialState)
                    |
                    v
当前状态:  { phase: ..., messages: [...], metrics: { ... } }
```

以下是完整实现，覆盖了 12 种事件类型：

```typescript
// ============================================================
// 3.3 状态管理 -- Event Sourcing + Reducer
// ============================================================

import { randomUUID } from 'crypto';

/** Agent 的生命周期阶段（与第 4 章定义一致） */
type AgentPhase =
  | 'idle'       // 空闲，等待任务
  | 'thinking'   // 正在调用 LLM 进行推理
  | 'acting'     // 正在执行 Tool
  | 'waiting'    // 等待外部回调（人类审批、异步 API）
  | 'done'       // 任务成功完成
  | 'error'      // 不可恢复的错误
  | 'stuck';     // 陷入死循环或超时

/** 单条消息 */
interface Message {
  readonly role: 'user' | 'assistant' | 'system' | 'tool';
  readonly content: string;
  readonly timestamp: number;
}

/** Tool 调用记录 */
interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
  readonly output?: unknown;
  readonly startedAt: number;
  readonly completedAt?: number;
  readonly error?: string;
  readonly durationMs?: number;
}

/** 性能指标 */
interface PerformanceMetrics {
  readonly totalTokensUsed: number;
  readonly totalToolCalls: number;
  readonly totalDurationMs: number;
  readonly llmLatencyMs: number[];
  readonly toolLatencyMs: number[];
  readonly avgTokensPerStep: number;
}

/**
 * Agent 状态（不可变）
 *
 * 本接口与第 4 章的完整定义保持一致。此处作为概览呈现核心字段，
 * 第 4 章将在此基础上展开检查点、Reducer 中间件等工程实现细节。
 *
 * 注意：Agent 的高层概念（如 goal、plan）存储在 metadata 中，
 * 由具体的 Agent 实现根据需要读写，不作为接口的顶层字段。
 */
interface AgentState {
  readonly id: string;
  readonly phase: AgentPhase;
  readonly messages: readonly Message[];
  readonly toolCalls: readonly ToolCall[];
  readonly currentStep: number;
  readonly maxSteps: number;
  readonly error: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly version: number;
  readonly metrics: PerformanceMetrics;
  readonly parentCheckpointId: string | null;
}

/** ---- 事件类型定义（12 种） ---- */

type AgentEvent =
  | { type: 'TASK_STARTED';     task: string; timestamp: number }
  | { type: 'LLM_CALL_START';   prompt: string; timestamp: number }
  | { type: 'LLM_CALL_END';     response: string; tokensUsed: number;
      latencyMs: number; timestamp: number }
  | { type: 'LLM_CALL_ERROR';   error: string; timestamp: number }
  | { type: 'TOOL_CALL_START';  toolName: string; input: Record<string, unknown>;
      callId: string; timestamp: number }
  | { type: 'TOOL_CALL_END';    callId: string; output: unknown;
      durationMs: number; timestamp: number }
  | { type: 'TOOL_CALL_ERROR';  callId: string; error: string; timestamp: number }
  | { type: 'HUMAN_FEEDBACK';   feedback: string; approved: boolean;
      timestamp: number }
  | { type: 'STEP_COMPLETED';   timestamp: number }
  | { type: 'TASK_COMPLETED';   summary: string; timestamp: number }
  | { type: 'ERROR_OCCURRED';   error: string; recoverable: boolean;
      timestamp: number }
  | { type: 'STATE_RESET';      timestamp: number };

/** 初始状态 */
const INITIAL_STATE: AgentState = {
  id: randomUUID(),
  phase: 'idle',
  messages: [],
  toolCalls: [],
  currentStep: 0,
  maxSteps: 20,
  error: null,
  metadata: {},
  createdAt: Date.now(),
  updatedAt: Date.now(),
  version: 0,
  metrics: {
    totalTokensUsed: 0,
    totalToolCalls: 0,
    totalDurationMs: 0,
    llmLatencyMs: [],
    toolLatencyMs: [],
    avgTokensPerStep: 0,
  },
  parentCheckpointId: null,
};

/**
 * agentReducer -- 纯函数状态转换器
 *
 * 给定当前状态和一个事件，返回新的状态。
 * 纯函数保证：相同输入 -> 相同输出，无副作用。
 * 此处展示核心事件的处理逻辑；第 4 章将在此基础上增加
 * 状态转换守卫（assertTransition）和中间件机制。
 */
function agentReducer(state: AgentState, event: AgentEvent): AgentState {
  const base = { ...state, updatedAt: event.timestamp, version: state.version + 1 };

  switch (event.type) {
    case 'TASK_STARTED':
      return {
        ...base,
        phase: 'thinking',
        messages: [
          ...state.messages,
          { role: 'user', content: event.task, timestamp: event.timestamp },
        ],
        currentStep: 0,
      };

    case 'LLM_CALL_START':
      return {
        ...base,
        phase: 'thinking',
        metadata: {
          ...state.metadata,
          lastPromptLength: event.prompt.length,
          llmCallPending: true,
        },
      };

    case 'LLM_CALL_END':
      return {
        ...base,
        phase: 'acting',
        messages: [
          ...state.messages,
          { role: 'assistant', content: event.response, timestamp: event.timestamp },
        ],
        metadata: { ...state.metadata, llmCallPending: false },
        metrics: {
          ...state.metrics,
          totalTokensUsed: state.metrics.totalTokensUsed + event.tokensUsed,
          llmLatencyMs: [...state.metrics.llmLatencyMs, event.latencyMs],
          avgTokensPerStep: state.currentStep > 0
            ? (state.metrics.totalTokensUsed + event.tokensUsed) / state.currentStep
            : event.tokensUsed,
        },
      };

    case 'LLM_CALL_ERROR':
      return {
        ...base,
        phase: 'error',
        error: `LLM Error: ${event.error}`,
        metadata: { ...state.metadata, llmCallPending: false },
      };

    case 'TOOL_CALL_START': {
      const newToolCall: ToolCall = {
        id: event.callId,
        name: event.toolName,
        input: event.input,
        startedAt: event.timestamp,
      };
      return {
        ...base,
        phase: 'acting',
        toolCalls: [...state.toolCalls, newToolCall],
        metrics: {
          ...state.metrics,
          totalToolCalls: state.metrics.totalToolCalls + 1,
        },
      };
    }

    case 'TOOL_CALL_END': {
      const toolCalls = state.toolCalls.map((tc) =>
        tc.id === event.callId
          ? { ...tc, output: event.output, completedAt: event.timestamp, durationMs: event.durationMs }
          : tc
      );
      return {
        ...base,
        toolCalls,
        metrics: {
          ...state.metrics,
          totalDurationMs: state.metrics.totalDurationMs + event.durationMs,
          toolLatencyMs: [...state.metrics.toolLatencyMs, event.durationMs],
        },
      };
    }

    case 'TOOL_CALL_ERROR': {
      const toolCalls = state.toolCalls.map((tc) =>
        tc.id === event.callId
          ? { ...tc, error: event.error, completedAt: event.timestamp }
          : tc
      );
      return { ...base, toolCalls, error: event.error };
    }

    case 'HUMAN_FEEDBACK':
      return {
        ...base,
        phase: event.approved ? 'acting' : 'thinking',
        messages: [
          ...state.messages,
          { role: 'user', content: `[Feedback] ${event.feedback}`, timestamp: event.timestamp },
        ],
      };

    case 'STEP_COMPLETED':
      return {
        ...base,
        currentStep: state.currentStep + 1,
        phase: state.currentStep + 1 >= state.maxSteps ? 'done' : 'thinking',
      };

    case 'TASK_COMPLETED':
      return {
        ...base,
        phase: 'done',
        messages: [
          ...state.messages,
          { role: 'assistant', content: event.summary, timestamp: event.timestamp },
        ],
      };

    case 'ERROR_OCCURRED':
      return {
        ...base,
        phase: event.recoverable ? state.phase : 'error',
        error: event.error,
      };

    case 'STATE_RESET': {
      const now = event.timestamp;
      return {
        ...INITIAL_STATE,
        id: state.id,          // 保留同一 Agent 标识
        createdAt: state.createdAt,
        updatedAt: now,
        version: state.version + 1,
      };
    }

    default:
      console.warn(`[Reducer] 未知事件类型: ${(event as any).type}`);
      return state;
  }
}
```

### 3.3.3 EventStore：事件持久化

**EventStore** 负责事件的持久化存储和检索。通过保存完整的事件流，我们可以在任何时候重建 Agent 的状态，也可以进行"time-travel debugging"——回到任意历史时刻查看当时的状态。

```typescript
// ============================================================
// EventStore -- 事件持久化存储
// ============================================================

/**
 * EventStore -- 事件存储
 *
 * 支持事件追加、按会话检索、状态重放。
 * 生产环境应替换为持久化存储（如 PostgreSQL、EventStoreDB）。
 */
class EventStore {
  private events: Map<string, AgentEvent[]> = new Map();

  /** append -- 追加事件（不可变操作） */
  append(conversationId: string, event: AgentEvent): void {
    const existing = this.events.get(conversationId) || [];
    this.events.set(conversationId, [...existing, event]);
  }

  /** getEvents -- 获取指定会话的事件流 */
  getEvents(
    conversationId: string,
    filter?: { since?: number; types?: AgentEvent["type"][] }
  ): AgentEvent[] {
    let events = this.events.get(conversationId) || [];
    if (filter?.since) {
      events = events.filter((e) => e.timestamp >= filter.since!);
    }
    if (filter?.types?.length) {
      events = events.filter((e) => filter.types!.includes(e.type));
    }
    return events;
  }

  /** replay -- 重放事件流，重建任意时刻的状态 */
  replay(conversationId: string, upToIndex?: number): AgentState {
    const events = this.events.get(conversationId) || [];
    const target = upToIndex !== undefined ? events.slice(0, upToIndex + 1) : events;
    return target.reduce(agentReducer, INITIAL_STATE);
  }

  /** getSnapshot -- 获取当前状态快照 */
  getSnapshot(conversationId: string): AgentState {
    return this.replay(conversationId);
  }

  /** getEventCount -- 获取事件数量 */
  getEventCount(conversationId: string): number {
    return (this.events.get(conversationId) || []).length;
  }
}
```

### 3.3.4 状态选择器：安全访问状态

**状态选择器（State Selectors）** 提供了一种类型安全且语义清晰的方式来访问状态的特定部分。选择器函数可以被组合和缓存（memoization），避免在频繁的状态访问中进行重复计算。

```typescript
// ============================================================
// State Selectors -- 状态选择器
// ============================================================

/** 获取当前阶段 */
function getPhase(state: AgentState): AgentPhase {
  return state.phase;
}

/** 获取性能指标 */
function getMetrics(state: AgentState): PerformanceMetrics {
  return state.metrics;
}

/** 获取最近一条 Tool 调用 */
function getLatestToolCall(state: AgentState): ToolCall | null {
  return state.toolCalls.length > 0
    ? state.toolCalls[state.toolCalls.length - 1]
    : null;
}

/** 获取所有失败的 Tool 调用 */
function getFailedToolCalls(state: AgentState): readonly ToolCall[] {
  return state.toolCalls.filter((tc) => tc.error !== undefined);
}

/** 计算 Token 使用效率（每步平均 Token） */
function getTokenEfficiency(state: AgentState): number {
  const { totalTokensUsed } = state.metrics;
  if (state.currentStep === 0) return 0;
  return totalTokensUsed / state.currentStep;
}

/** 计算工具成功率 */
function getToolSuccessRate(state: AgentState): number {
  const { totalToolCalls } = state.metrics;
  if (totalToolCalls === 0) return 1;
  const failedCount = state.toolCalls.filter((tc) => tc.error !== undefined).length;
  return (totalToolCalls - failedCount) / totalToolCalls;
}

/** 判断 Agent 是否处于活跃状态 */
function isActive(state: AgentState): boolean {
  return ['thinking', 'acting', 'waiting'].includes(state.phase);
}

/** 获取执行进度百分比 */
function getProgress(state: AgentState): number {
  if (state.maxSteps === 0) return 0;
  return (state.currentStep / state.maxSteps) * 100;
}

/** 获取运行时长 */
function getElapsedTime(state: AgentState): number {
  if (!state.createdAt) return 0;
  const end = state.phase === 'done' || state.phase === 'error'
    ? state.updatedAt
    : Date.now();
  return end - state.createdAt;
}

/** 组合选择器：获取完整的状态摘要 */
function getStateSummary(state: AgentState): {
  phase: AgentPhase;
  progress: number;
  metrics: PerformanceMetrics;
  failedTools: number;
  elapsed: number;
  isHealthy: boolean;
} {
  const failedTools = getFailedToolCalls(state).length;
  return {
    phase: state.phase,
    progress: getProgress(state),
    metrics: getMetrics(state),
    failedTools,
    elapsed: getElapsedTime(state),
    isHealthy: state.error === null && getToolSuccessRate(state) > 0.8,
  };
}
```


---

## 3.4 Agent 生命周期管理

在生产环境中，Agent 不是一个简单的函数调用——它是一个有状态的、长时间运行的实体。理解和管理 Agent 的生命周期，对于构建可靠的系统至关重要。

### 3.4.1 生命周期状态机

Agent 的生命周期可以用以下状态机表示：

```
                   +----------+
            +----->| Created  |
            |      +----+-----+
            |           |  initialize()
            |           v
            |      +----------+
            |      | Initialized |
            |      +----+-----+
            |           |  start()
            |           v
     reset()|      +----------+     pause()    +----------+
            |      | Running  |<-------------->| Paused   |
            |      +----+-----+   resume()     +----------+
            |           |
            |     +-----+------+
            |     |            |
            |     v            v
            | +----------+ +----------+
            +-| Completed| | Failed   |
              +----------+ +----+-----+
                                |
                                | retry()
                                v
                           +----------+
                           | Running  |
                           +----------+
```

### 3.4.2 AgentLifecycleManager 实现

```typescript
// ============================================================
// 3.4 Agent 生命周期管理
// ============================================================

/** 生命周期状态 */
type LifecycleState =
  | "created"
  | "initialized"
  | "running"
  | "paused"
  | "completed"
  | "failed";

/** 生命周期事件 */
type LifecycleTransition =
  | "initialize"
  | "start"
  | "pause"
  | "resume"
  | "complete"
  | "fail"
  | "retry"
  | "reset";

/** 健康检查结果 */
interface HealthCheckResult {
  healthy: boolean;
  state: LifecycleState;
  uptime: number;
  lastHeartbeat: number;
  metrics: {
    memoryUsageMB: number;
    activeConnections: number;
    pendingTasks: number;
  };
  issues: string[];
}

/** 生命周期钩子 */
interface LifecycleHooks {
  onInitialize?: () => Promise<void>;
  onStart?: () => Promise<void>;
  onPause?: () => Promise<void>;
  onResume?: () => Promise<void>;
  onComplete?: (result: string) => Promise<void>;
  onFail?: (error: Error) => Promise<void>;
  onHealthCheck?: () => Promise<HealthCheckResult>;
}

/**
 * AgentLifecycleManager -- Agent 生命周期管理器
 *
 * 提供完整的生命周期管理：
 * - 状态机驱动的状态转换
 * - 生命周期钩子回调
 * - 优雅关闭与资源清理
 * - 健康检查与心跳机制
 */
class AgentLifecycleManager {
  private state: LifecycleState = "created";
  private hooks: LifecycleHooks;
  private startedAt: number = 0;
  private lastHeartbeat: number = 0;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private cleanupFns: Array<() => Promise<void>> = [];

  // 状态转换表：定义合法的状态迁移
  private static readonly TRANSITIONS: Record<LifecycleTransition, {
    from: LifecycleState[];
    to: LifecycleState;
  }> = {
    initialize: { from: ["created"], to: "initialized" },
    start:      { from: ["initialized"], to: "running" },
    pause:      { from: ["running"], to: "paused" },
    resume:     { from: ["paused"], to: "running" },
    complete:   { from: ["running"], to: "completed" },
    fail:       { from: ["running", "paused", "initialized"], to: "failed" },
    retry:      { from: ["failed"], to: "running" },
    reset:      { from: ["completed", "failed"], to: "created" },
  };

  constructor(hooks: LifecycleHooks = {}) {
    this.hooks = hooks;
  }

  /** 获取当前状态 */
  getState(): LifecycleState {
    return this.state;
  }

  /** 执行状态转换 */
  async transition(action: LifecycleTransition): Promise<void> {
    const rule = AgentLifecycleManager.TRANSITIONS[action];
    if (!rule) throw new Error(`未知的生命周期操作: ${action}`);
    if (!rule.from.includes(this.state)) {
      throw new Error(
        `非法状态转换: 不能从 "${this.state}" 执行 "${action}"` +
        `（允许的源状态: ${rule.from.join(", ")}）`
      );
    }

    const oldState = this.state;
    this.state = rule.to;
    console.log(`[Lifecycle] ${oldState} --${action}--> ${this.state}`);

    // 执行生命周期钩子
    try {
      switch (action) {
        case "initialize":
          await this.hooks.onInitialize?.();
          break;
        case "start":
          this.startedAt = Date.now();
          this.startHeartbeat();
          await this.hooks.onStart?.();
          break;
        case "pause":
          this.stopHeartbeat();
          await this.hooks.onPause?.();
          break;
        case "resume":
          this.startHeartbeat();
          await this.hooks.onResume?.();
          break;
        case "complete":
          this.stopHeartbeat();
          await this.cleanup();
          await this.hooks.onComplete?.("");
          break;
        case "fail":
          this.stopHeartbeat();
          await this.cleanup();
          await this.hooks.onFail?.(new Error("Agent failed"));
          break;
        case "reset":
          this.startedAt = 0;
          break;
      }
    } catch (error) {
      console.error(`[Lifecycle] 钩子执行失败: ${(error as Error).message}`);
      // 钩子失败不应影响状态转换
    }
  }

  /** 注册清理函数（在完成或失败时执行） */
  registerCleanup(fn: () => Promise<void>): void {
    this.cleanupFns.push(fn);
  }

  /** 健康检查 */
  async healthCheck(): Promise<HealthCheckResult> {
    if (this.hooks.onHealthCheck) {
      return this.hooks.onHealthCheck();
    }

    const issues: string[] = [];
    const now = Date.now();

    // 检查心跳超时
    if (this.state === "running" && this.lastHeartbeat > 0) {
      const sinceLastHeartbeat = now - this.lastHeartbeat;
      if (sinceLastHeartbeat > 60_000) {
        issues.push(`心跳超时: ${Math.round(sinceLastHeartbeat / 1000)}s`);
      }
    }

    // 检查运行时长
    if (this.startedAt > 0) {
      const uptime = now - this.startedAt;
      if (uptime > 3600_000) {
        issues.push(`运行时间过长: ${Math.round(uptime / 60_000)}min`);
      }
    }

    return {
      healthy: issues.length === 0,
      state: this.state,
      uptime: this.startedAt > 0 ? now - this.startedAt : 0,
      lastHeartbeat: this.lastHeartbeat,
      metrics: {
        memoryUsageMB: 0,  // 实际实现应读取进程内存
        activeConnections: 0,
        pendingTasks: 0,
      },
      issues,
    };
  }

  /** 优雅关闭 */
  async gracefulShutdown(timeoutMs: number = 30_000): Promise<void> {
    console.log("[Lifecycle] 开始优雅关闭...");

    if (this.state === "running") {
      // 先暂停，等待当前步骤完成
      await this.transition("pause");

      // 等待一段时间让正在执行的操作完成
      await new Promise((resolve) => setTimeout(resolve, Math.min(5000, timeoutMs)));

      // 标记为完成
      try {
        await this.transition("complete");
      } catch {
        await this.transition("fail");
      }
    }

    this.stopHeartbeat();
    await this.cleanup();
    console.log("[Lifecycle] 优雅关闭完成");
  }

  // ---- 私有方法 ----

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastHeartbeat = Date.now();
    this.heartbeatInterval = setInterval(() => {
      this.lastHeartbeat = Date.now();
    }, 10_000);  // 每 10 秒一次心跳
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private async cleanup(): Promise<void> {
    console.log(`[Lifecycle] 执行 ${this.cleanupFns.length} 个清理函数...`);
    for (const fn of this.cleanupFns) {
      try {
        await fn();
      } catch (error) {
        console.error(`[Lifecycle] 清理函数失败: ${(error as Error).message}`);
      }
    }
    this.cleanupFns = [];
  }
}
```

### 3.4.3 使用示例

```typescript
// 创建生命周期管理器
const lifecycle = new AgentLifecycleManager({
  onInitialize: async () => {
    console.log("初始化资源连接...");
    // 建立数据库连接、加载模型配置等
  },
  onStart: async () => {
    console.log("Agent 开始运行");
  },
  onComplete: async (result) => {
    console.log("Agent 完成，保存结果...");
    // 持久化结果、发送通知等
  },
  onFail: async (error) => {
    console.error("Agent 失败，发送告警...");
    // 发送告警通知、记录错误日志等
  },
});

// 注册清理函数
lifecycle.registerCleanup(async () => {
  console.log("关闭数据库连接...");
});
lifecycle.registerCleanup(async () => {
  console.log("释放模型资源...");
});

// 状态流转
await lifecycle.transition("initialize");
await lifecycle.transition("start");
// ... Agent 执行过程 ...
await lifecycle.transition("complete");

// 优雅关闭（用于进程退出时）
process.on("SIGTERM", async () => {
  await lifecycle.gracefulShutdown(30_000);
  process.exit(0);
});
```

---

## 3.5 架构决策矩阵

在实际项目中，选择合适的架构模式需要综合考虑多种因素。本节提供系统化的决策指导。

### 3.5.1 决策矩阵表

| 决策维度 | 单步直答 | ReAct Agent | Plan-Execute | Reflective | Multi-Agent |
|---------|----------|-------------|--------------|------------|-------------|
| **任务类型** | 简单问答 | 需工具的通用任务 | 复杂多步任务 | 高质量输出 | 跨领域协作 |
| **延迟要求** | <1s | 3-15s | 10-60s | 15-120s | 30-300s |
| **Token 预算** | <1K | 2-10K | 5-20K | 10-30K | 20-100K |
| **可靠性需求** | 低 | 中 | 高 | 最高 | 高 |
| **可解释性** | 无 | 高 | 高 | 最高 | 中 |
| **实现复杂度** | 极低 | 低 | 中 | 中高 | 高 |
| **运维成本** | 无 | 低 | 中 | 中 | 高 |
| **适用团队规模** | 1人 | 2-3人 | 3-5人 | 3-5人 | 5+人 |
| **典型应用** | FAQ Bot | 客服Agent | 数据分析 | 代码生成 | 企业助手 |

### 3.5.2 架构反模式

在 Agent 系统设计中，以下是需要避免的常见反模式：

**1. God Agent（上帝 Agent）反模式**

将所有能力塞入一个巨大的 Agent 中，导致系统 Prompt 过长、上下文窗口拥挤、行为不可预测。

```
// 反模式：一个 Agent 承担所有职责
"你是一个全能助手，可以写代码、做数据分析、写文章、
翻译文档、做数学题、查天气、订餐厅、管理日程..."
// 结果：Prompt 占据了大量上下文窗口，每种能力的表现都很平庸
```

**解决方案**：采用多 Agent 架构，每个 Agent 专注于一个领域，通过编排层协调。

**2. Chatty Agents（话痨 Agent）反模式**

Agent 之间的通信过于频繁，每一个小决策都需要跨 Agent 协商，导致延迟爆炸和 Token 浪费。

**解决方案**：明确 Agent 之间的接口边界，使用异步消息传递而非同步 RPC，减少不必要的通信。

**3. Tight Coupling（紧耦合）反模式**

Agent 的实现与特定的 LLM 提供商、工具接口或数据格式紧密绑定，导致无法灵活替换。

**解决方案**：使用本章定义的七层架构，通过接口抽象实现层间解耦。例如 Tool 层通过 ToolDefinition 接口与 Agent Core 交互，而非直接调用具体的 API。

**4. No Budget Guard（无预算守卫）反模式**

没有设置 Token 预算或最大迭代次数限制，导致 Agent 在复杂任务上无限循环，产生巨额费用。

**解决方案**：在 Agent Core 中始终设置 `maxIterations` 和 `maxTokenBudget`，并在评估层中监控异常消耗。

### 3.5.3 单体 Agent vs 微服务 Agent

| 维度 | 单体 Agent | 微服务 Agent |
|------|-----------|-------------|
| **部署复杂度** | 低（单一进程） | 高（多服务编排） |
| **扩展性** | 垂直扩展 | 水平扩展 |
| **故障隔离** | 差（一个组件挂全挂） | 好（独立失败域） |
| **开发速度** | 快（早期） | 慢（早期），快（后期） |
| **适用阶段** | MVP、概念验证 | 生产环境、高可用需求 |
| **团队要求** | 1-3 人 | 5+ 人 |

**选择建议**：

- **MVP 阶段**：从单体 Agent 开始，快速验证产品方向。
- **生产阶段**：当流量超过单机承载能力，或需要独立的故障隔离和扩展策略时，逐步拆分为微服务 Agent。
- **混合方案**：核心 Agent Loop 保持单体，将工具执行、记忆存储等无状态组件拆分为独立服务。

---

## 3.6 本章小结

本章建立了 AI Agent 系统的完整架构视图。以下是关键要点的回顾：

**七层参考架构** 将 Agent 系统的复杂性分解为七个清晰的层次：核心循环层负责感知-推理-行动的基本循环；上下文引擎层管理有限的上下文窗口；工具层提供外部交互能力；记忆层实现跨会话的知识积累；安全层保障全链路安全；评估层确保输出质量；编排层协调多 Agent 协作。每一层都有明确的接口定义和职责边界。

**Agent Loop 模式** 提供了五种不同的执行策略：ReAct 以其灵活性和可解释性成为默认选择；Plan-and-Execute 适合需要全局视角的复杂任务；Adaptive 模式通过复杂度评估自动选择最优策略；Reflective Loop 通过自我评估提升输出质量；Hybrid 模式结合了规划和灵活执行的优点。

**状态管理** 采用 Event Sourcing + Reducer 的不可变模式，确保了可测试性、可调试性和可审计性。EventStore 提供了事件持久化和状态重放能力。

**生命周期管理** 通过状态机驱动的 AgentLifecycleManager，提供了从创建到销毁的完整生命周期控制。

**架构决策矩阵** 为实际项目中的技术选型提供了系统化的指导框架。

> **预告**：第四章将深入探讨 **状态管理与数据流**——如何用 Reducer 模式实现确定性状态变迁、中间件链、分布式状态同步与弹性引擎设计。第五章将聚焦 **Context Engineering（上下文工程）**——包括 WSCIPO 六大原则、上下文健康检测、三层压缩策略和长对话管理。

---

## 延伸阅读

1. **Yao, S. et al. (2022).** *ReAct: Synergizing Reasoning and Acting in Language Models.* arXiv:2210.03629. -- ReAct 模式的原始论文，提出了将推理链和工具使用交织的方法。

2. **Wang, L. et al. (2023).** *Plan-and-Solve Prompting: Improving Zero-Shot Chain-of-Thought Reasoning by Large Language Models.* ACL 2023. -- Plan-and-Execute 模式的理论基础。

3. **Shinn, N. et al. (2023).** *Reflexion: Language Agents with Verbal Reinforcement Learning.* NeurIPS 2023. -- Reflective Loop 的核心论文，展示了语言 Agent 如何通过自我反思来改进性能。

4. **Xi, Z. et al. (2023).** *The Rise and Potential of Large Language Model Based Agents: A Survey.* arXiv:2309.07864. -- 一篇全面的 LLM Agent 综述，覆盖了架构、能力和应用场景。

5. **Wu, Q. et al. (2023).** *AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation.* arXiv:2308.08155. -- 微软 AutoGen 框架论文，展示了多 Agent 对话编排的实践。

6. **Anthropic. (2024).** *Building Effective Agents.* Anthropic Research Blog. -- Anthropic 关于构建高效 Agent 的实践指南，包含架构设计和 Prompt 策略。

7. **Fowler, M. (2005).** *Event Sourcing.* martinfowler.com. -- Event Sourcing 模式的经典描述，本章状态管理设计的理论基础。

---

> **下一章**：第四章 状态管理与数据流
