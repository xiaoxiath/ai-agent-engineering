/**
 * shared/types.ts — 全书共享核心类型定义
 *
 * 本文件汇集附录 G 中定义的所有核心接口与类型，作为各章节代码示例的
 * 权威类型来源。各章节通过 `import { ... } from '../shared'` 引用。
 *
 * @see 附录 G.2 核心接口
 */

// ============================================================
// G.2.2 Message — 对话消息
// ============================================================

/** 对话消息 — 构成 Agent 上下文窗口的基本单元 */
export interface Message {
  /** 角色标识 */
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** 消息文本内容 */
  content: string;
  /** 工具调用结果的关联 ID（role='tool' 时必填） */
  toolCallId?: string;
  /** 消息元数据：token 计数、时间戳等 */
  metadata?: {
    tokenCount?: number;
    timestamp?: number;
    [key: string]: unknown;
  };
}

// ============================================================
// G.2.3 ToolDefinition / ToolCall / ToolResult — 工具体系
// ============================================================

/** 工具定义 — 描述一个可被 Agent 调用的工具 */
export interface ToolDefinition {
  /** 工具唯一名称（英文、下划线命名） */
  name: string;
  /** 自然语言描述（供 LLM 理解工具用途） */
  description: string;
  /** JSON Schema 格式的参数定义 */
  parameters: {
    type: 'object';
    properties: Record<
      string,
      {
        type: string;
        description: string;
        enum?: string[];
      }
    >;
    required: string[];
  };
  /** 工具分类（可选，用于 Registry 过滤） */
  category?: string;
  /** 预估延迟（ms，可选，用于规划器决策） */
  estimatedLatencyMs?: number;
}

/** 工具调用请求（LLM 输出） */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** 工具执行结果 */
export interface ToolResult {
  /** 对应的工具名称 */
  tool: string;
  /** 对应的 toolCall ID */
  callId?: string;
  /** 执行结果（成功时） */
  result: unknown;
  /** 错误信息（失败时） */
  error?: string;
  /** 执行耗时（ms） */
  durationMs?: number;
}

/** 工具执行器函数签名 */
export type ToolExecutor = (
  args: Record<string, unknown>
) => Promise<unknown>;

// ============================================================
// G.2.4 AgentState — Agent 状态
// ============================================================

/** Agent 运行阶段 */
export type AgentPhase =
  | 'idle'        // 空闲
  | 'thinking'    // LLM 推理中
  | 'acting'      // 执行工具中
  | 'observing'   // 处理工具结果
  | 'reflecting'  // 自我反思
  | 'completed'   // 正常完成
  | 'error';      // 异常终止

/** 性能指标 */
export interface PerformanceMetrics {
  totalTokens: number;
  totalLatencyMs: number;
  llmCalls: number;
  toolCalls: number;
  retries: number;
}

/** Agent 完整状态（不可变结构） */
export interface AgentState {
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

/** 创建初始状态的工厂函数 */
export function createInitialState(maxSteps: number = 20): AgentState {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    phase: 'idle',
    messages: [],
    toolCalls: [],
    currentStep: 0,
    maxSteps,
    error: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    version: 0,
    metrics: {
      totalTokens: 0,
      totalLatencyMs: 0,
      llmCalls: 0,
      toolCalls: 0,
      retries: 0,
    },
    parentCheckpointId: null,
  };
}

// ============================================================
// G.2.5 AgentEvent — Agent 事件
// ============================================================

/** Agent 事件 — Multi-Agent 通信的基本单元 */
export interface AgentEvent {
  /** 事件唯一 ID */
  eventId: string;
  /** 事件类型（如 "task.assigned", "result.ready"） */
  eventType: string;
  /** 发送方 Agent ID */
  sourceAgentId: string;
  /** 事件时间戳 */
  timestamp: number;
  /** 事件负载 */
  payload: Record<string, unknown>;
  /** 追踪元数据 */
  metadata?: {
    correlationId?: string;
    causationId?: string;
    tags?: string[];
  };
}

/** 事件过滤器 */
export interface EventFilter {
  eventTypes?: string[];
  sourceAgentIds?: string[];
  contentFilter?: (event: AgentEvent) => boolean;
}

/** 事件处理器 */
export type EventHandler = (event: AgentEvent) => Promise<void>;

// ============================================================
// G.3.1 Registry — 泛型注册中心
// ============================================================

/**
 * 泛型注册中心
 *
 * 提供注册、注销、查找、列举等基本操作。
 * 具体的 ToolRegistry / SkillRegistry / AgentRegistry 在此基础上
 * 扩展领域特定的发现、校验和监控逻辑。
 */
export class Registry<T extends { name: string }> {
  protected items = new Map<string, T>();

  /** 注册项目 */
  register(item: T): void {
    if (this.items.has(item.name)) {
      console.warn(`[Registry] "${item.name}" 已存在，将被覆盖`);
    }
    this.items.set(item.name, item);
  }

  /** 注销项目 */
  unregister(name: string): boolean {
    return this.items.delete(name);
  }

  /** 按名称精确查找 */
  get(name: string): T | undefined {
    return this.items.get(name);
  }

  /** 列举全部 */
  listAll(): T[] {
    return Array.from(this.items.values());
  }

  /** 按条件过滤 */
  find(predicate: (item: T) => boolean): T[] {
    return this.listAll().filter(predicate);
  }

  /** 当前注册数量 */
  get size(): number {
    return this.items.size;
  }
}

// ============================================================
// G.3.2 SemanticCache 相关类型
// ============================================================

/** 语义缓存配置 */
export interface SemanticCacheConfig {
  /** 相似度阈值 0-1（推荐 0.92-0.97） */
  similarityThreshold: number;
  /** 缓存条目 TTL（秒） */
  baseTTLSeconds: number;
  /** 最大缓存条目数 */
  maxEntries: number;
  /** embedding 维度 */
  embeddingDimension: number;
}

/** 缓存条目 */
export interface CacheEntry<T = unknown> {
  key: string;
  embedding: number[];
  value: T;
  createdAt: number;
  expiresAt: number;
  hitCount: number;
}

/** 缓存查询结果 */
export interface CacheQueryResult<T = unknown> {
  hit: boolean;
  entry?: CacheEntry<T>;
  similarity?: number;
  queryLatencyMs: number;
}
