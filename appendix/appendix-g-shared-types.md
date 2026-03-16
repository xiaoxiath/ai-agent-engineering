# 附录 G：共享类型与工具函数参考

本书各章节的代码示例中，有若干工具函数、接口和类型被反复使用。为保持各章代码的自包含性，它们在首次出现时给出了完整实现，在后续章节中以简化形式重复出现。本附录将这些**全书共享的类型定义和工具函数**统一汇总，作为权威参考。

> **引用约定**：后续章节代码中出现 `// → 附录 G.x` 或 `// 实现见附录 G` 的注释时，均指向本附录对应小节。读者在阅读任何章节的代码示例时，如遇到未在当前章节定义的类型或函数，可在此处找到其规范定义。

---

## G.1 工具函数

### G.1.1 `estimateTokens` — Token 数量估算

**出现频率**：全书 30+ 处（第 2、3、5、6、7、8、19 章等）

在上下文窗口管理、压缩策略、成本计算等场景中，需要快速估算一段文本消耗多少 token。精确的 tokenization 依赖具体模型的分词器（如 OpenAI 的 `tiktoken`），但在架构演示和粗略预算中，基于字符长度的启发式估算已足够。

```typescript
/**
 * 估算文本的 token 数量
 *
 * 启发式规则：
 * - 纯英文约 4 字符/token（GPT 系列的经验值）
 * - 中文约 1.5-2 字符/token
 * - 混合文本取折中值 ~3 字符/token
 *
 * 生产环境建议替换为 tiktoken 等精确分词器：
 *   import { encoding_for_model } from 'tiktoken';
 *   const enc = encoding_for_model('gpt-4o');
 *   return enc.encode(text).length;
 *
 * @param text - 待估算的文本
 * @returns 估算的 token 数（向上取整）
 */
function estimateTokens(text: string): number {
  // 检测中文字符占比，动态调整除数
  const cjkPattern = /[\u4e00-\u9fff\u3400-\u4dbf]/g;
  const cjkCount = (text.match(cjkPattern) || []).length;
  const cjkRatio = text.length > 0 ? cjkCount / text.length : 0;

  // 纯英文 ~4 字符/token，纯中文 ~1.5 字符/token，线性插值
  const charsPerToken = 4 - cjkRatio * 2.5;
  return Math.ceil(text.length / charsPerToken);
}
```

> **精度说明**：上述启发式在英文文本上误差约 10-20%，在中文文本上误差约 20-30%。对于成本计算等精确场景，请使用 `tiktoken`（OpenAI 模型）或对应提供商的分词库。

---

### G.1.2 `cosineSimilarity` — 余弦相似度

**出现频率**：全书 10+ 处（第 5、6、7、8、19 章等）

余弦相似度是语义搜索、记忆检索、缓存匹配等向量操作的基础度量。它衡量两个向量在方向上的相似程度，返回值域为 `[-1, 1]`，其中 1 表示方向完全相同，0 表示正交，-1 表示完全相反。对于 embedding 向量（通常已归一化），返回值集中在 `[0, 1]` 区间。

```typescript
/**
 * 计算两个向量的余弦相似度
 *
 * cosine_similarity(a, b) = (a · b) / (|a| × |b|)
 *
 * @param a - 向量 a
 * @param b - 向量 b（长度必须与 a 相同）
 * @returns 相似度值 [-1, 1]；若任一向量为零向量则返回 0
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  return magnitudeA && magnitudeB
    ? dotProduct / (magnitudeA * magnitudeB)
    : 0;
}
```

> **性能提示**：当需要在大规模向量集合中执行 top-K 搜索时，不应遍历式调用此函数，而应使用向量数据库（Qdrant、Pinecone 等）或近似最近邻索引（HNSW、IVF）。此函数适用于小规模比对（<1000 条）或验证场景。

---

### G.1.3 `EmbeddingService` 接口与 `embed` 占位实现

**出现频率**：全书 20+ 处（第 5、6、7、8、19、26 章等）

文本转向量（embedding）是语义搜索、记忆存储、缓存匹配的前置步骤。本书代码示例通过统一的 `EmbeddingService` 接口隔离具体实现，使架构演示不依赖特定 embedding 提供商。

```typescript
/**
 * Embedding 服务接口 — 将文本转换为向量嵌入
 *
 * 实际生产中可对接：
 * - OpenAI: text-embedding-3-small / text-embedding-3-large
 * - Cohere: embed-v3
 * - 本地模型: nomic-embed-text via Ollama
 */
interface EmbeddingService {
  /** 单文本嵌入 */
  embed(text: string): Promise<number[]>;
  /** 批量嵌入（减少网络往返） */
  embedBatch(texts: string[]): Promise<number[][]>;
  /** 向量维度 */
  readonly dimensions: number;
}

/** 占位实现 — 仅用于代码示例演示，返回随机向量 */
class MockEmbeddingService implements EmbeddingService {
  readonly dimensions: number;

  constructor(dimensions: number = 1536) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    // 基于文本哈希生成确定性伪向量，确保相同输入得到相同输出
    const hash = this.simpleHash(text);
    const rng = this.seededRandom(hash);
    return Array.from({ length: this.dimensions }, () => rng() * 2 - 1);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  private seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) | 0;
      return (s >>> 0) / 0xffffffff;
    };
  }
}
```

> **生产替换**：将 `MockEmbeddingService` 替换为真实实现时，只需实现同一接口。例如使用 OpenAI：
> ```typescript
> class OpenAIEmbeddingService implements EmbeddingService {
>   readonly dimensions = 1536;
>   async embed(text: string): Promise<number[]> {
>     const res = await openai.embeddings.create({
>       model: 'text-embedding-3-small', input: text,
>     });
>     return res.data[0].embedding;
>   }
>   async embedBatch(texts: string[]): Promise<number[][]> { /* 批量调用 */ }
> }
> ```

---

## G.2 核心接口

### G.2.1 `LLMClient` — 大语言模型客户端接口

**出现频率**：全书 15+ 处（第 2、3、5、6、7、19 章等）

本书代码通过 `LLMClient` 接口抽象对 LLM 的调用，使示例代码与具体模型提供商解耦。不同章节根据演示需要使用了不同粒度的接口签名；以下是覆盖全书主要用法的统一定义。

```typescript
/**
 * LLM 客户端接口
 *
 * 三种调用粒度：
 * - complete: 简单文本补全（提示 → 文本）
 * - chat:     结构化对话（消息数组 → 响应，支持工具调用）
 * - classify: 分类快捷方法（基于 LLM 的零样本分类）
 */
interface LLMClient {
  /** 简单文本补全 */
  complete(prompt: string, maxTokens?: number): Promise<string>;

  /** 结构化对话 */
  chat(params: {
    messages: Message[];
    tools?: ToolDefinition[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<LLMResponse>;

  /** 零样本分类（便捷方法） */
  classify?(input: string, options: { categories: string[] }): Promise<string>;
}

/** LLM 响应结构 */
interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  finishReason?: 'stop' | 'tool_calls' | 'length' | 'content_filter';
}
```

> **框架映射**：在实际项目中，`LLMClient` 通常由框架提供：Vercel AI SDK 的 `generateText` / `streamText`、LangChain 的 `BaseChatModel`、Mastra 的 `Agent.generate` 等均可适配此接口。

---

### G.2.2 `Message` — 对话消息

**出现频率**：全书 15+ 处（第 2、3、4、5、9、11 章等）

```typescript
/** 对话消息 — 构成 Agent 上下文窗口的基本单元 */
interface Message {
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
```

---

### G.2.3 `ToolDefinition` 与 `ToolResult` — 工具定义与执行结果

**出现频率**：全书 10+ 处（第 2、3、6、11 章等）

```typescript
/** 工具定义 — 描述一个可被 Agent 调用的工具 */
interface ToolDefinition {
  /** 工具唯一名称（英文、下划线命名） */
  name: string;
  /** 自然语言描述（供 LLM 理解工具用途） */
  description: string;
  /** JSON Schema 格式的参数定义 */
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
  /** 工具分类（可选，用于 Registry 过滤） */
  category?: string;
  /** 预估延迟（ms，可选，用于规划器决策） */
  estimatedLatencyMs?: number;
}

/** 工具调用请求（LLM 输出） */
interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** 工具执行结果 */
interface ToolResult {
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
type ToolExecutor = (
  args: Record<string, unknown>
) => Promise<unknown>;
```

---

### G.2.4 `AgentState` — Agent 状态

**出现频率**：全书 8+ 处（第 2、3、4、9 章等）

`AgentState` 是贯穿全书的核心类型。第 2 章从理论视角引入简化版本，第 3 章给出架构概览，第 4 章补充完整的状态管理工程细节。以下是第 4 章定义的完整版本。

```typescript
/** Agent 运行阶段 */
type AgentPhase =
  | 'idle'        // 空闲
  | 'thinking'    // LLM 推理中
  | 'acting'      // 执行工具中
  | 'observing'   // 处理工具结果
  | 'reflecting'  // 自我反思
  | 'completed'   // 正常完成
  | 'error';      // 异常终止

/** Agent 完整状态（不可变结构） */
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

/** 性能指标 */
interface PerformanceMetrics {
  totalTokens: number;
  totalLatencyMs: number;
  llmCalls: number;
  toolCalls: number;
  retries: number;
}

/** 创建初始状态的工厂函数 */
function createInitialState(maxSteps: number = 20): AgentState {
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
      totalTokens: 0, totalLatencyMs: 0,
      llmCalls: 0, toolCalls: 0, retries: 0,
    },
    parentCheckpointId: null,
  };
}
```

---

### G.2.5 `AgentEvent` — Agent 事件

**出现频率**：全书 5+ 处（第 4、9、17 章等）

本书使用两种风格的 `AgentEvent`：第 4 章的判别联合类型（强类型，适合单 Agent 内部状态机）和第 9 章的泛型结构（适合 Multi-Agent 跨边界通信）。以下给出 Multi-Agent 场景的通用版本。

```typescript
/** Agent 事件 — Multi-Agent 通信的基本单元 */
interface AgentEvent {
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
interface EventFilter {
  eventTypes?: string[];
  sourceAgentIds?: string[];
  contentFilter?: (event: AgentEvent) => boolean;
}

/** 事件处理器 */
type EventHandler = (event: AgentEvent) => Promise<void>;
```

---

## G.3 通用模式

### G.3.1 `Registry` — 注册中心模式

**出现频率**：全书 4+ 处（第 3、6、9 章：`ToolRegistry`、`SkillRegistry`、`AgentRegistry`）

Registry 模式是全书反复出现的架构模式，用于管理工具、技能、Agent 等可注册组件的生命周期。以下提取其通用骨架。

```typescript
/**
 * 泛型注册中心
 *
 * 提供注册、注销、查找、列举等基本操作。
 * 具体的 ToolRegistry / SkillRegistry / AgentRegistry 在此基础上
 * 扩展领域特定的发现、校验和监控逻辑。
 */
class Registry<T extends { name: string }> {
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

// ---- 领域特化示例 ----

/** ToolRegistry 在通用 Registry 基础上增加校验和执行监控 */
// class ToolRegistry extends Registry<ToolRegistryEntry> { ... }
// 完整实现见第 3 章 §3.5 和第 6 章 §6.1

/** SkillRegistry 增加语义搜索和动态加载 */
// class SkillRegistry extends Registry<SkillDefinition> { ... }
// 完整实现见第 6.5 章 §6.5.4

/** AgentRegistry 增加能力索引和健康检查 */
// class AgentRegistry extends Registry<AgentCard> { ... }
// 完整实现见第 9 章 §9.3
```

---

### G.3.2 `SemanticCache` — 语义缓存模式

**出现频率**：全书 3 处（第 18、19 章）

语义缓存通过向量相似度匹配实现"近似命中"，相比精确匹配缓存能获得更高的命中率。以下是其核心接口与简化骨架，完整的成本感知实现见第 19 章。

```typescript
/** 语义缓存配置 */
interface SemanticCacheConfig {
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
interface CacheEntry<T = unknown> {
  key: string;
  embedding: number[];
  value: T;
  createdAt: number;
  expiresAt: number;
  hitCount: number;
}

/** 缓存查询结果 */
interface CacheQueryResult<T = unknown> {
  hit: boolean;
  entry?: CacheEntry<T>;
  similarity?: number;
  queryLatencyMs: number;
}

/**
 * 语义缓存基类
 *
 * 核心流程：query embedding → 向量近邻搜索 → 相似度阈值过滤 → 命中/未命中
 * 第 19 章的 SemanticCostCache 在此基础上增加了：
 * - 成本感知 TTL（越贵的响应缓存越久）
 * - 质量反馈循环（低质量响应的 TTL 自动缩短）
 * - 按 Agent / 任务类型隔离缓存空间
 */
class SemanticCache<T = unknown> {
  protected entries = new Map<string, CacheEntry<T>>();
  protected config: SemanticCacheConfig;
  protected embeddingService: EmbeddingService;

  constructor(config: Partial<SemanticCacheConfig>, embedding: EmbeddingService) {
    this.config = {
      similarityThreshold: 0.95,
      baseTTLSeconds: 3600,
      maxEntries: 10000,
      embeddingDimension: embedding.dimensions,
      ...config,
    };
    this.embeddingService = embedding;
  }

  async get(query: string): Promise<CacheQueryResult<T>> {
    const start = Date.now();
    const queryEmbedding = await this.embeddingService.embed(query);
    let bestMatch: CacheEntry<T> | undefined;
    let bestSimilarity = -1;

    for (const entry of this.entries.values()) {
      if (entry.expiresAt < Date.now()) { this.entries.delete(entry.key); continue; }
      const sim = cosineSimilarity(queryEmbedding, entry.embedding);
      if (sim > bestSimilarity) { bestSimilarity = sim; bestMatch = entry; }
    }

    const hit = bestMatch !== undefined
      && bestSimilarity >= this.config.similarityThreshold;

    if (hit) bestMatch!.hitCount++;

    return {
      hit,
      entry: hit ? bestMatch : undefined,
      similarity: hit ? bestSimilarity : undefined,
      queryLatencyMs: Date.now() - start,
    };
  }

  async set(key: string, value: T): Promise<void> {
    if (this.entries.size >= this.config.maxEntries) this.evict();
    const embedding = await this.embeddingService.embed(key);
    this.entries.set(key, {
      key, embedding, value,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.baseTTLSeconds * 1000,
      hitCount: 0,
    });
  }

  protected evict(): void {
    // LRU 策略：淘汰最久未命中的条目
    let oldest: string | undefined;
    let oldestTime = Infinity;
    for (const [k, v] of this.entries) {
      if (v.createdAt < oldestTime) { oldestTime = v.createdAt; oldest = k; }
    }
    if (oldest) this.entries.delete(oldest);
  }
}
```

---

## G.4 章节引用方式

在本书的代码示例中，共享类型和工具函数通过以下约定引用：

### 方式一：注释引用（本书主要采用）

各章节代码块中以注释标注来源，读者按需查阅本附录：

```typescript
// estimateTokens, cosineSimilarity 实现见附录 G.1
// LLMClient, Message 类型定义见附录 G.2

class ContextManager {
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 3); // 简化版，完整版见附录 G.1.1
  }
}
```

### 方式二：模块导入（配套代码仓库）

在配套的 `code-examples/` 仓库中，共享代码被提取为独立模块：

```typescript
// code-examples/shared/index.ts 导出全部共享类型和工具函数
import {
  estimateTokens,
  cosineSimilarity,
  type EmbeddingService,
  MockEmbeddingService,
  type LLMClient,
  type LLMResponse,
  type Message,
  type ToolDefinition,
  type ToolCall,
  type ToolResult,
  type AgentState,
  type AgentEvent,
  Registry,
  SemanticCache,
} from '../shared';
```

配套代码仓库的目录结构：

```
code-examples/
├── shared/
│   ├── index.ts           # 统一导出
│   ├── estimate-tokens.ts # G.1.1
│   ├── cosine-similarity.ts # G.1.2
│   ├── embedding.ts       # G.1.3 EmbeddingService + MockEmbeddingService
│   ├── llm-client.ts      # G.2.1 LLMClient + LLMResponse
│   ├── message.ts         # G.2.2 Message
│   ├── tool.ts            # G.2.3 ToolDefinition + ToolCall + ToolResult
│   ├── agent-state.ts     # G.2.4 AgentState + AgentPhase
│   ├── agent-event.ts     # G.2.5 AgentEvent + EventFilter
│   ├── registry.ts        # G.3.1 Registry<T>
│   └── semantic-cache.ts  # G.3.2 SemanticCache<T>
├── ch03-architecture/
├── ch05-context/
├── ...
```

---

## G.5 类型关系总览

以下展示本附录各类型之间的依赖关系：

```
┌─────────────────────────────────────────────────────────┐
│                    工具函数层                              │
│  estimateTokens()    cosineSimilarity()                  │
└──────────┬──────────────────┬────────────────────────────┘
           │                  │
           ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│                    服务接口层                              │
│  EmbeddingService          LLMClient                     │
│    ├ embed()                 ├ complete()                 │
│    ├ embedBatch()            ├ chat() ◄── Message         │
│    └ dimensions              │       ◄── ToolDefinition   │
│                              └ classify()                 │
└──────────┬──────────────────┬────────────────────────────┘
           │                  │
           ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│                    状态与事件层                            │
│  AgentState                 AgentEvent                    │
│    ├ messages: Message[]      ├ eventType                 │
│    ├ toolCalls: ToolCall[]    ├ payload                   │
│    └ phase: AgentPhase        └ metadata                  │
│                                                          │
│  ToolResult                                              │
│    ├ tool, callId                                        │
│    └ result / error                                      │
└──────────┬──────────────────┬────────────────────────────┘
           │                  │
           ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│                    通用模式层                              │
│  Registry<T>               SemanticCache<T>              │
│    ├ register()              ├ get() ◄── EmbeddingService │
│    ├ get()                   ├ set()  ◄── cosineSimilarity│
│    ├ find()                  └ evict()                    │
│    └ listAll()                                           │
└─────────────────────────────────────────────────────────┘
```

---

## G.6 版本与兼容性说明

| 项目 | 最低 TypeScript 版本 | 依赖 |
|------|---------------------|------|
| `estimateTokens` | TS 4.0+ | 无 |
| `cosineSimilarity` | TS 4.0+ | 无 |
| `EmbeddingService` | TS 4.0+ | 无 |
| `LLMClient` | TS 4.0+ | `Message`, `ToolDefinition` |
| `AgentState` | TS 4.5+ (`readonly` 数组) | `Message`, `ToolCall` |
| `Registry<T>` | TS 4.7+ (泛型约束) | 无 |
| `SemanticCache<T>` | TS 4.7+ | `EmbeddingService`, `cosineSimilarity` |

全部类型均为**零外部依赖**的纯 TypeScript 定义，可在任何 Node.js 18+ 运行时中使用。
