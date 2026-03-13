# 第 7 章 记忆架构 — Agent 的大脑

> "记忆是智慧的根基。没有记忆的 Agent 就像一条金鱼——每一次对话都从零开始。"

## 7.1 概览与认知科学基础

### 7.1.1 为什么 Agent 需要记忆？

在传统的 LLM 应用中，每次 API 调用都是无状态的：模型收到 prompt，生成回复，然后"忘记"一切。这种架构对于简单的问答足够，但对于需要持续交互的 Agent 系统来说远远不够。

考虑一个个人助理 Agent 的场景：

- **第 1 天**：用户说"我对 TypeScript 和系统架构很感兴趣"
- **第 30 天**：用户问"帮我推荐一本好书"
- **无记忆的 Agent**：推荐了一本畅销小说
- **有记忆的 Agent**：推荐了《Designing Data-Intensive Applications》，因为它记得用户的技术偏好

记忆赋予 Agent 三个核心能力：

| 能力 | 描述 | 示例 |
|------|------|------|
| **连续性** | 跨轮次维持上下文 | 记住用户 5 分钟前提到的需求 |
| **个性化** | 积累用户偏好和习惯 | 知道用户喜欢简洁的代码风格 |
| **学习** | 从历史交互中提取经验 | 记住上次部署失败的原因 |

### 7.1.2 认知科学中的记忆模型

Agent 的记忆架构并非凭空设计，而是深度借鉴了认知科学的研究成果。理解这些理论基础有助于我们做出更好的工程决策。

**Atkinson-Shiffrin 多存储模型 (1968)**

```
感觉输入 → [感觉记忆] → 注意 → [短期记忆] → 编码 → [长期记忆]
                ↓ 衰减           ↓ 遗忘              ↓ 检索
               丢失             丢失              提取回短期记忆
```

这个经典模型将记忆分为三个存储：
- **感觉记忆 (Sensory Memory)**：极短暂（<1秒），对应 Agent 接收到但未处理的原始输入
- **短期记忆 (Short-term Memory)**：容量有限（7±2 项），对应 Agent 的工作记忆 / context window
- **长期记忆 (Long-term Memory)**：容量几乎无限，对应 Agent 的持久化存储

**Baddeley 工作记忆模型 (1974, 2000)**

Baddeley 将短期记忆细化为多组件系统：

| 组件 | 功能 | Agent 对应 |
|------|------|-----------|
| 中央执行系统 | 注意力分配与协调 | Planner / Orchestrator |
| 语音回路 | 语言信息的临时存储 | 对话历史 buffer |
| 视觉空间画板 | 视觉信息处理 | 多模态上下文 |
| 情景缓冲区 | 整合多源信息 | 跨模块融合层 |

**Ebbinghaus 遗忘曲线 (1885)**

遗忘不是线性的，而是遵循指数衰减：

```
R(t) = e^(-t/S)
```

其中 `R(t)` 是时间 `t` 后的记忆保留率，`S` 是记忆强度。这意味着：
- 新记忆最容易遗忘（1 小时后忘记 56%）
- 复习可以显著增强 `S`（间隔重复的理论基础）
- Agent 的记忆衰减策略应模拟这一曲线

### 7.1.3 四层记忆架构总览

基于认知科学的启发，我们设计了 Agent 的四层记忆架构：

```
┌──────────────────────────────────────────────────────────┐
│                    Agent 记忆系统                          │
├──────────────────────────────────────────────────────────┤
│  Layer 1: Working Memory (工作记忆)                       │
│  ├─ 容量: 受 context window 限制 (4K - 200K tokens)       │
│  ├─ 时效: 当前推理步骤                                    │
│  └─ 类比: CPU 寄存器 + L1 Cache                           │
├──────────────────────────────────────────────────────────┤
│  Layer 2: Conversation Memory (对话记忆)                  │
│  ├─ 容量: 当前会话的全部对话                               │
│  ├─ 时效: 单次会话                                        │
│  └─ 类比: RAM                                             │
├──────────────────────────────────────────────────────────┤
│  Layer 3: Task Memory (任务记忆)                          │
│  ├─ 容量: 单个任务的全部状态                               │
│  ├─ 时效: 任务生命周期                                    │
│  └─ 类比: 进程内存空间                                    │
├──────────────────────────────────────────────────────────┤
│  Layer 4: Long-term Memory (长期记忆)                     │
│  ├─ 容量: 理论上无限                                      │
│  ├─ 时效: 持久化存储                                      │
│  └─ 类比: 磁盘 / 数据库                                   │
└──────────────────────────────────────────────────────────┘
```

每一层的设计理念：

```typescript
/**
 * 四层记忆抽象接口
 * 每一层实现不同的存储语义和生命周期管理
 */
interface MemoryLayer<T> {
  /** 层级名称 */
  readonly name: string;
  /** 最大容量（语义单位，非字节） */
  readonly capacity: number;
  /** 写入记忆条目 */
  store(entry: T): Promise<void>;
  /** 根据查询检索相关记忆 */
  retrieve(query: string, limit: number): Promise<T[]>;
  /** 清除过期或低优先级的条目 */
  evict(): Promise<number>;
  /** 获取当前使用统计 */
  stats(): MemoryLayerStats;
}

interface MemoryLayerStats {
  /** 当前条目数量 */
  entryCount: number;
  /** 当前使用的 token 数量 */
  tokenUsage: number;
  /** 命中率（检索成功/总检索次数） */
  hitRate: number;
  /** 平均检索延迟（毫秒） */
  avgRetrievalLatencyMs: number;
}
```

### 7.1.4 层间数据流动

记忆在各层之间的流动遵循明确的规则：

```
用户输入
   ↓
[Working Memory] ← 从其他层检索相关记忆
   ↓ 推理完成
[Conversation Memory] ← 存储本轮对话
   ↓ 重要信息提取
[Task Memory] ← 存储任务状态和步骤
   ↓ 任务结束 / 定期巩固
[Long-term Memory] ← 持久化关键知识
```

关键的流动机制：
- **上提 (Promotion)**：重要的短期记忆被提升到长期存储
- **下放 (Retrieval)**：长期记忆被检索回工作记忆用于当前推理
- **压缩 (Compression)**：对话记忆通过摘要压缩后存入长期记忆
- **淘汰 (Eviction)**：低价值记忆被主动清除以释放容量

### 7.1.5 Token 预算规划器

在 LLM 的 context window 中，token 是最宝贵的资源。我们需要一个预算规划器来在各层记忆之间动态分配 token：

```typescript
/**
 * Token 预算配置
 * 定义各记忆层在 context window 中的份额
 */
interface TokenBudgetConfig {
  /** context window 总 token 上限 */
  totalContextWindow: number;
  /** 系统提示词预留 */
  systemPromptReserved: number;
  /** 用户最新消息预留 */
  userMessageReserved: number;
  /** 模型输出预留 */
  outputReserved: number;
  /** 各记忆层的权重配比 */
  layerWeights: {
    working: number;
    conversation: number;
    task: number;
    longTerm: number;
  };
}

/**
 * Token 预算规划器
 * 根据当前上下文动态计算各层记忆可用的 token 额度
 */
class TokenBudgetPlanner {
  private config: TokenBudgetConfig;
  /** 各层实际使用量追踪 */
  private actualUsage: Map<string, number> = new Map();

  constructor(config: TokenBudgetConfig) {
    this.config = config;
    for (const layer of ['working', 'conversation', 'task', 'longTerm']) {
      this.actualUsage.set(layer, 0);
    }
  }

  /**
   * 计算各层的 token 配额
   * 可用 token = 总窗口 - 系统预留 - 用户消息 - 输出预留
   */
  computeBudgets(): Record<string, number> {
    const available = this.config.totalContextWindow
      - this.config.systemPromptReserved
      - this.config.userMessageReserved
      - this.config.outputReserved;

    if (available <= 0) {
      throw new Error(`Token 预算不足: 可用=${available}, 总窗口=${this.config.totalContextWindow}`);
    }

    const weights = this.config.layerWeights;
    const totalWeight = weights.working + weights.conversation
      + weights.task + weights.longTerm;

    return {
      working: Math.floor(available * weights.working / totalWeight),
      conversation: Math.floor(available * weights.conversation / totalWeight),
      task: Math.floor(available * weights.task / totalWeight),
      longTerm: Math.floor(available * weights.longTerm / totalWeight),
    };
  }

  /**
   * 动态再平衡 — 当某层使用率低时，将多余配额分配给需求高的层
   */
  rebalance(): Record<string, number> {
    const baseBudgets = this.computeBudgets();
    const result = { ...baseBudgets };

    let surplus = 0;
    const deficitLayers: string[] = [];

    for (const [layer, budget] of Object.entries(baseBudgets)) {
      const used = this.actualUsage.get(layer) || 0;
      if (used < budget * 0.5) {
        const reclaimable = Math.floor((budget - used) * 0.7);
        surplus += reclaimable;
        result[layer] = budget - reclaimable;
      } else if (used >= budget * 0.9) {
        deficitLayers.push(layer);
      }
    }

    if (deficitLayers.length > 0 && surplus > 0) {
      const bonus = Math.floor(surplus / deficitLayers.length);
      for (const layer of deficitLayers) {
        result[layer] = (result[layer] || 0) + bonus;
      }
    }

    return result;
  }

  /** 报告某层的实际 token 使用量 */
  reportUsage(layer: string, tokens: number): void {
    this.actualUsage.set(layer, tokens);
  }

  /** 获取预算使用概览 */
  getSummary(): string {
    const budgets = this.computeBudgets();
    const lines: string[] = ['Token 预算概览:'];
    for (const [layer, budget] of Object.entries(budgets)) {
      const used = this.actualUsage.get(layer) || 0;
      const pct = budget > 0 ? ((used / budget) * 100).toFixed(1) : '0.0';
      lines.push(`  ${layer}: ${used}/${budget} tokens (${pct}%)`);
    }
    return lines.join('\n');
  }
}
```


---

## 7.2 四层记忆详解

### 7.2.1 工作记忆 (Working Memory)

工作记忆是 Agent 在单次推理步骤中使用的"思维空间"。它对应 LLM 的 context window，是所有记忆最终注入的汇聚点。

**核心挑战**：context window 的 token 有限，但需要注入的信息（系统提示、对话历史、任务状态、检索到的长期记忆）往往超过容量。因此，工作记忆的核心职责是**优先级管理**和**智能淘汰**。

```typescript
/** 记忆优先级枚举 — 数值越高，保留优先级越高 */
enum MemoryPriority {
  LOW = 1,       // 背景知识 — 可被淘汰
  NORMAL = 2,    // 一般上下文 — 默认级别
  HIGH = 3,      // 重要信息 — 优先保留
  CRITICAL = 4,  // 关键指令 — 绝不淘汰
}

/** 工作记忆条目 — 注入 context window 的一段信息 */
interface WorkingMemoryEntry {
  id: string;
  content: string;
  priority: MemoryPriority;
  sourceLayer: string;      // 来源层（conversation / task / longTerm）
  tokenCount: number;       // 预估 token 数
  lastAccessedAt: number;   // 最后访问时间戳
  relevanceScore: number;   // 与当前查询的相关性 (0-1)
  referenceCount: number;   // 被引用次数
}

/** 工作记忆性能指标 */
interface WorkingMemoryMetrics {
  totalCapacity: number;
  usedTokens: number;
  evictionCount: number;
  lastEvictionSize: number;
  hitRate: number;
}

/**
 * 优先级工作记忆管理器
 * 实现基于优先级 + 相关性 + 时效性的复合淘汰策略
 */
class PriorityWorkingMemory {
  private entries: Map<string, WorkingMemoryEntry> = new Map();
  private maxTokens: number;
  private currentTokens: number = 0;
  private metrics: WorkingMemoryMetrics;

  constructor(maxTokens: number) {
    this.maxTokens = maxTokens;
    this.metrics = {
      totalCapacity: maxTokens,
      usedTokens: 0,
      evictionCount: 0,
      lastEvictionSize: 0,
      hitRate: 0,
    };
  }

  /** 向工作记忆注入条目，空间不足时自动触发淘汰 */
  async inject(entry: WorkingMemoryEntry): Promise<boolean> {
    // 已存在则先移除旧版本
    if (this.entries.has(entry.id)) {
      const existing = this.entries.get(entry.id)!;
      this.currentTokens -= existing.tokenCount;
      this.entries.delete(entry.id);
    }

    // 腾出空间
    while (this.currentTokens + entry.tokenCount > this.maxTokens) {
      const evicted = this.evictOne();
      if (!evicted) {
        if (entry.priority < MemoryPriority.CRITICAL) return false;
        break;
      }
    }

    this.entries.set(entry.id, { ...entry, lastAccessedAt: Date.now() });
    this.currentTokens += entry.tokenCount;
    this.metrics.usedTokens = this.currentTokens;
    return true;
  }

  /**
   * 淘汰一个最低综合得分的条目
   * 保留得分 = priority * 100 + relevanceScore * 50 + recencyScore * 30 + referenceBonus
   */
  private evictOne(): WorkingMemoryEntry | null {
    let lowestScore = Infinity;
    let candidate: WorkingMemoryEntry | null = null;
    const now = Date.now();

    for (const entry of this.entries.values()) {
      if (entry.priority === MemoryPriority.CRITICAL) continue;

      const recencyScore = Math.exp(-(now - entry.lastAccessedAt) / (5 * 60 * 1000));
      const referenceBonus = Math.min(entry.referenceCount * 5, 20);
      const score = entry.priority * 100
        + entry.relevanceScore * 50
        + recencyScore * 30
        + referenceBonus;

      if (score < lowestScore) {
        lowestScore = score;
        candidate = entry;
      }
    }

    if (candidate) {
      this.entries.delete(candidate.id);
      this.currentTokens -= candidate.tokenCount;
      this.metrics.evictionCount++;
      this.metrics.lastEvictionSize = candidate.tokenCount;
      this.metrics.usedTokens = this.currentTokens;
    }
    return candidate;
  }

  /** 检索最相关的条目，按优先级和相关性排序 */
  retrieve(query: string, limit: number = 10): WorkingMemoryEntry[] {
    const results = Array.from(this.entries.values())
      .sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return b.relevanceScore - a.relevanceScore;
      })
      .slice(0, limit);

    for (const entry of results) {
      entry.lastAccessedAt = Date.now();
      entry.referenceCount++;
    }
    return results;
  }

  /** 构建最终 context window 内容，按来源层分组排序 */
  buildContext(): string {
    const sections: Map<string, WorkingMemoryEntry[]> = new Map();
    for (const entry of this.entries.values()) {
      const group = sections.get(entry.sourceLayer) || [];
      group.push(entry);
      sections.set(entry.sourceLayer, group);
    }

    const parts: string[] = [];
    const layerOrder = ['system', 'longTerm', 'task', 'conversation', 'working'];
    for (const layer of layerOrder) {
      const entries = sections.get(layer);
      if (!entries || entries.length === 0) continue;
      entries.sort((a, b) => b.priority - a.priority || b.relevanceScore - a.relevanceScore);
      for (const entry of entries) {
        parts.push(entry.content);
      }
    }
    return parts.join('\n\n');
  }

  getMetrics(): WorkingMemoryMetrics { return { ...this.metrics }; }
  getUtilization(): number { return this.maxTokens > 0 ? this.currentTokens / this.maxTokens : 0; }
  clear(): void { this.entries.clear(); this.currentTokens = 0; this.metrics.usedTokens = 0; }
}
```

**工作记忆性能分析器**：在生产环境中监控工作记忆的健康状况。

```typescript
/**
 * 工作记忆分析器 — 收集使用模式并生成优化建议
 */
class WorkingMemoryProfiler {
  private snapshots: Array<{
    timestamp: number;
    utilization: number;
    evictionCount: number;
    entryBreakdown: Record<string, number>;
  }> = [];

  /** 采集快照 */
  capture(memory: PriorityWorkingMemory, entryBreakdown: Record<string, number>): void {
    this.snapshots.push({
      timestamp: Date.now(),
      utilization: memory.getUtilization(),
      evictionCount: memory.getMetrics().evictionCount,
      entryBreakdown,
    });
  }

  /** 分析趋势并返回优化建议 */
  analyze(): string[] {
    if (this.snapshots.length < 5) return ['数据不足，需要至少 5 次快照'];
    const suggestions: string[] = [];
    const recent = this.snapshots.slice(-10);

    const avgUtil = recent.reduce((s, snap) => s + snap.utilization, 0) / recent.length;
    if (avgUtil > 0.95) {
      suggestions.push('使用率持续 >95%，建议增大 context window 或优化摘要策略');
    } else if (avgUtil < 0.3) {
      suggestions.push('使用率 <30%，可注入更多长期记忆以提升回复质量');
    }

    const evictionRate = recent.length > 1
      ? (recent[recent.length - 1].evictionCount - recent[0].evictionCount) / recent.length
      : 0;
    if (evictionRate > 5) {
      suggestions.push(`平均每步淘汰 ${evictionRate.toFixed(1)} 条目，频率过高`);
    }

    return suggestions.length > 0 ? suggestions : ['工作记忆状况良好'];
  }
}
```

### 7.2.2 对话记忆 (Conversation Memory)

对话记忆管理单次会话中的完整对话历史。当对话轮次增多时，原始历史可能超出 context window 容量，因此需要智能的窗口管理和摘要策略。

**三种常见策略对比**：

| 策略 | 优点 | 缺点 | 适用场景 |
|------|------|------|---------|
| 滑动窗口 | 实现简单 | 丢失早期上下文 | 闲聊、短对话 |
| 摘要压缩 | 保留全局信息 | 摘要可能丢失细节 | 长对话、复杂任务 |
| 混合策略 | 兼顾两者 | 实现复杂 | 生产环境推荐 |

```typescript
/** 对话消息结构 */
interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  tokenCount: number;
  /** 话题标签 — 用于话题边界检测 */
  topicTag?: string;
  /** 重要性评分 (0-1) — 高分消息在压缩时被优先保留 */
  importance?: number;
}

/** 对话摘要结构 */
interface ConversationSummary {
  /** 摘要文本 */
  text: string;
  /** 摘要覆盖的消息 ID 范围 */
  coveredMessageIds: string[];
  /** 摘要的 token 数 */
  tokenCount: number;
  /** 生成时间 */
  createdAt: number;
  /** 覆盖的话题列表 */
  topics: string[];
}

/**
 * 智能窗口对话记忆
 * 结合滑动窗口 + 摘要压缩 + 话题感知的混合策略
 */
class SmartWindowConversationMemory {
  private messages: ConversationMessage[] = [];
  private summaries: ConversationSummary[] = [];
  private maxTokenBudget: number;
  private recentWindowSize: number;
  private llmClient: LLMClient;

  constructor(config: {
    maxTokenBudget: number;
    recentWindowSize: number;
    llmClient: LLMClient;
  }) {
    this.maxTokenBudget = config.maxTokenBudget;
    this.recentWindowSize = config.recentWindowSize;
    this.llmClient = config.llmClient;
  }

  /** 添加新消息，必要时触发压缩 */
  async addMessage(message: ConversationMessage): Promise<void> {
    this.messages.push(message);
    const totalTokens = this.calculateTotalTokens();
    if (totalTokens > this.maxTokenBudget) {
      await this.compress();
    }
  }

  /**
   * 压缩策略：保留最近 N 轮完整消息，将更早的消息生成摘要
   * 话题边界感知：尽量在话题切换处进行切割
   */
  private async compress(): Promise<void> {
    // 保留最近的消息窗口
    const recentMessages = this.messages.slice(-this.recentWindowSize);
    const oldMessages = this.messages.slice(0, -this.recentWindowSize);

    if (oldMessages.length === 0) return;

    // 按话题分组旧消息
    const topicGroups = this.groupByTopic(oldMessages);

    // 对每个话题组生成摘要
    for (const group of topicGroups) {
      const summary = await this.summarizeGroup(group);
      this.summaries.push(summary);
    }

    // 替换消息列表为只保留最近窗口
    this.messages = recentMessages;
  }

  /** 按话题标签对消息分组 */
  private groupByTopic(messages: ConversationMessage[]): ConversationMessage[][] {
    const groups: ConversationMessage[][] = [];
    let currentGroup: ConversationMessage[] = [];
    let currentTopic = messages[0]?.topicTag || 'default';

    for (const msg of messages) {
      const topic = msg.topicTag || 'default';
      if (topic !== currentTopic && currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
        currentTopic = topic;
      }
      currentGroup.push(msg);
    }
    if (currentGroup.length > 0) groups.push(currentGroup);
    return groups;
  }

  /** 使用 LLM 对一组消息生成摘要 */
  private async summarizeGroup(messages: ConversationMessage[]): Promise<ConversationSummary> {
    const dialogue = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    const prompt = `请将以下对话片段总结为简洁的摘要，保留关键事实、决策和待办事项：\n\n${dialogue}\n\n摘要：`;

    const response = await this.llmClient.chat([{ role: 'user', content: prompt }]);

    return {
      text: response.content,
      coveredMessageIds: messages.map(m => m.id),
      tokenCount: Math.ceil(response.content.length / 3), // 粗略估算
      createdAt: Date.now(),
      topics: [...new Set(messages.map(m => m.topicTag || 'default'))],
    };
  }

  /** 构建注入 context window 的对话历史 */
  buildHistory(): string {
    const parts: string[] = [];

    // 先注入历史摘要
    if (this.summaries.length > 0) {
      parts.push('[历史对话摘要]');
      for (const summary of this.summaries) {
        parts.push(`[话题: ${summary.topics.join(', ')}] ${summary.text}`);
      }
      parts.push('');
    }

    // 再注入最近的完整消息
    parts.push('[最近对话]');
    for (const msg of this.messages) {
      const roleLabel = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? '助理' : '系统';
      parts.push(`${roleLabel}: ${msg.content}`);
    }

    return parts.join('\n');
  }

  /** 计算当前总 token 使用量 */
  private calculateTotalTokens(): number {
    const msgTokens = this.messages.reduce((sum, m) => sum + m.tokenCount, 0);
    const sumTokens = this.summaries.reduce((sum, s) => sum + s.tokenCount, 0);
    return msgTokens + sumTokens;
  }
}
```

**话题边界检测器**：自动识别对话中的话题切换点，提升摘要质量。


> **复用说明**：`TopicBoundaryDetector` 在第 5 章（上下文工程）中首次出现，用于检测上下文中的话题漂移。本章从记忆分层管理的角度重新实现，增加了 `extractKeywords` 和关键词重叠率检测，使其更适用于会话记忆的自动分段场景。
```typescript
/**
 * 话题边界检测器
 * 使用 embedding 相似度 + 关键词变化来检测话题切换
 */
class TopicBoundaryDetector {
  private embeddingService: EmbeddingService;
  /** 相似度低于此阈值则判定为话题切换 */
  private similarityThreshold: number;

  constructor(embeddingService: EmbeddingService, similarityThreshold: number = 0.65) {
    this.embeddingService = embeddingService;
    this.similarityThreshold = similarityThreshold;
  }

  /**
   * 检测消息序列中的话题边界
   * 返回边界索引数组（每个索引表示新话题从该位置开始）
   */
  async detectBoundaries(messages: ConversationMessage[]): Promise<number[]> {
    if (messages.length < 2) return [0];

    const boundaries: number[] = [0]; // 第一条消息总是一个话题的开始
    const embeddings = await this.embeddingService.embedBatch(
      messages.map(m => m.content)
    );

    for (let i = 1; i < messages.length; i++) {
      const similarity = this.cosineSimilarity(embeddings[i - 1], embeddings[i]);

      // 时间间隔也是重要信号：长时间无交互后的消息很可能是新话题
      const timeDelta = messages[i].timestamp - messages[i - 1].timestamp;
      const timeGapMinutes = timeDelta / (60 * 1000);

      if (similarity < this.similarityThreshold || timeGapMinutes > 30) {
        boundaries.push(i);
      }
    }

    return boundaries;
  }

  // cosineSimilarity 实现见第 5 章 Context Engineering 的工具函数定义
  // 此处为简化展示，完整实现请参考 code-examples/shared/utils.ts
  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
    return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0;
  }
}
```

**对话索引**：为长对话建立快速检索索引。

```typescript
/**
 * 对话索引 — 支持按时间、话题、关键词快速定位历史消息
 */
class ConversationIndex {
  /** 话题到消息 ID 的映射 */
  private topicIndex: Map<string, string[]> = new Map();
  /** 时间桶索引（按小时分桶） */
  private timeIndex: Map<number, string[]> = new Map();
  /** 关键词倒排索引 */
  private keywordIndex: Map<string, Set<string>> = new Map();

  /** 索引一条消息 */
  index(message: ConversationMessage): void {
    // 话题索引
    const topic = message.topicTag || 'default';
    const topicList = this.topicIndex.get(topic) || [];
    topicList.push(message.id);
    this.topicIndex.set(topic, topicList);

    // 时间索引（按小时分桶）
    const hourBucket = Math.floor(message.timestamp / (3600 * 1000));
    const timeBucket = this.timeIndex.get(hourBucket) || [];
    timeBucket.push(message.id);
    this.timeIndex.set(hourBucket, timeBucket);

    // 关键词索引 — 简单的空格分词
    const keywords = message.content.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    for (const kw of keywords) {
      const set = this.keywordIndex.get(kw) || new Set();
      set.add(message.id);
      this.keywordIndex.set(kw, set);
    }
  }

  /** 按话题检索消息 ID */
  findByTopic(topic: string): string[] {
    return this.topicIndex.get(topic) || [];
  }

  /** 按关键词检索，返回包含所有关键词的消息 ID */
  findByKeywords(keywords: string[]): string[] {
    const sets = keywords
      .map(kw => this.keywordIndex.get(kw.toLowerCase()))
      .filter((s): s is Set<string> => s !== undefined);

    if (sets.length === 0) return [];

    // 求交集
    let result = new Set(sets[0]);
    for (let i = 1; i < sets.length; i++) {
      result = new Set([...result].filter(id => sets[i].has(id)));
    }
    return [...result];
  }

  /** 按时间范围检索 */
  findByTimeRange(startMs: number, endMs: number): string[] {
    const startBucket = Math.floor(startMs / (3600 * 1000));
    const endBucket = Math.floor(endMs / (3600 * 1000));
    const results: string[] = [];
    for (let b = startBucket; b <= endBucket; b++) {
      results.push(...(this.timeIndex.get(b) || []));
    }
    return results;
  }
}
```

### 7.2.3 任务记忆 (Task Memory)

任务记忆跟踪多步骤任务的执行状态。与对话记忆关注"说了什么"不同，任务记忆关注"做了什么、做到哪了、下一步是什么"。

**任务记忆的独特需求**：
- **结构化**：任务有明确的步骤、依赖关系和状态
- **可恢复**：Agent 崩溃后能从断点恢复
- **可审计**：每个步骤的输入输出都可回溯
- **层级化**：复杂任务包含子任务

```typescript
/** 任务步骤状态 */
enum TaskStepStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  BLOCKED = 'blocked',
}

/** 步骤依赖关系 */
interface StepDependency {
  /** 被依赖的步骤 ID */
  stepId: string;
  /** 依赖类型 */
  type: 'hard' | 'soft'; // hard: 必须完成; soft: 可选
}

/** 任务步骤 */
interface TaskStep {
  id: string;
  name: string;
  description: string;
  status: TaskStepStatus;
  /** 依赖的其他步骤 */
  dependencies: StepDependency[];
  /** 步骤输入 */
  input?: Record<string, unknown>;
  /** 步骤输出 */
  output?: Record<string, unknown>;
  /** 错误信息（仅 FAILED 状态） */
  error?: string;
  /** 重试次数 */
  retryCount: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 开始时间 */
  startedAt?: number;
  /** 完成时间 */
  completedAt?: number;
}

/** 任务记忆记录 */
interface TaskMemoryRecord {
  taskId: string;
  taskName: string;
  createdAt: number;
  updatedAt: number;
  steps: TaskStep[];
  /** 全局任务上下文 — 所有步骤共享的变量 */
  context: Record<string, unknown>;
  /** 任务级别的 checkpoint 数据 */
  checkpoint?: string;
}

/**
 * 任务记忆管理器
 * 管理多步骤任务的状态追踪、依赖解析和断点恢复
 */
class TaskMemoryManager {
  private tasks: Map<string, TaskMemoryRecord> = new Map();

  /** 创建新任务 */
  createTask(taskId: string, name: string, steps: Omit<TaskStep, 'status' | 'retryCount'>[]): TaskMemoryRecord {
    const record: TaskMemoryRecord = {
      taskId,
      taskName: name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      steps: steps.map(s => ({
        ...s,
        status: TaskStepStatus.PENDING,
        retryCount: 0,
        maxRetries: s.maxRetries ?? 3,
      })),
      context: {},
    };
    this.tasks.set(taskId, record);
    return record;
  }

  /** 获取下一个可执行的步骤（所有硬依赖已完成） */
  getNextExecutableStep(taskId: string): TaskStep | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    for (const step of task.steps) {
      if (step.status !== TaskStepStatus.PENDING) continue;

      // 检查所有硬依赖是否已完成
      const hardDepsReady = step.dependencies
        .filter(d => d.type === 'hard')
        .every(dep => {
          const depStep = task.steps.find(s => s.id === dep.stepId);
          return depStep?.status === TaskStepStatus.COMPLETED;
        });

      // 检查软依赖（完成或被跳过都算满足）
      const softDepsReady = step.dependencies
        .filter(d => d.type === 'soft')
        .every(dep => {
          const depStep = task.steps.find(s => s.id === dep.stepId);
          return depStep?.status === TaskStepStatus.COMPLETED
            || depStep?.status === TaskStepStatus.SKIPPED;
        });

      if (hardDepsReady && softDepsReady) return step;
    }

    return null;
  }

  /** 更新步骤状态 */
  updateStepStatus(
    taskId: string,
    stepId: string,
    status: TaskStepStatus,
    output?: Record<string, unknown>,
    error?: string
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`任务 ${taskId} 不存在`);

    const step = task.steps.find(s => s.id === stepId);
    if (!step) throw new Error(`步骤 ${stepId} 不存在于任务 ${taskId} 中`);

    step.status = status;
    if (output) step.output = output;
    if (error) step.error = error;

    if (status === TaskStepStatus.IN_PROGRESS) {
      step.startedAt = Date.now();
    } else if (status === TaskStepStatus.COMPLETED || status === TaskStepStatus.FAILED) {
      step.completedAt = Date.now();
    }

    // 失败时检查是否可重试
    if (status === TaskStepStatus.FAILED && step.retryCount < step.maxRetries) {
      step.retryCount++;
      step.status = TaskStepStatus.PENDING; // 重置为待执行
      step.error = `第 ${step.retryCount} 次重试: ${error}`;
    }

    task.updatedAt = Date.now();
  }

  /** 计算任务完成进度 */
  getProgress(taskId: string): { completed: number; total: number; percentage: number } {
    const task = this.tasks.get(taskId);
    if (!task) return { completed: 0, total: 0, percentage: 0 };

    const completed = task.steps.filter(
      s => s.status === TaskStepStatus.COMPLETED || s.status === TaskStepStatus.SKIPPED
    ).length;
    const total = task.steps.length;
    return { completed, total, percentage: total > 0 ? (completed / total) * 100 : 0 };
  }

  /** 创建 checkpoint — 序列化当前任务状态用于崩溃恢复 */
  createCheckpoint(taskId: string): string {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`任务 ${taskId} 不存在`);

    const checkpoint = JSON.stringify({
      ...task,
      checkpointAt: Date.now(),
    });
    task.checkpoint = checkpoint;
    return checkpoint;
  }

  /** 从 checkpoint 恢复任务 */
  restoreFromCheckpoint(checkpoint: string): TaskMemoryRecord {
    const data = JSON.parse(checkpoint) as TaskMemoryRecord;

    // 将所有 IN_PROGRESS 的步骤重置为 PENDING（崩溃时正在执行的步骤）
    for (const step of data.steps) {
      if (step.status === TaskStepStatus.IN_PROGRESS) {
        step.status = TaskStepStatus.PENDING;
      }
    }

    this.tasks.set(data.taskId, data);
    return data;
  }

  /** 生成人类可读的任务状态报告 */
  getStatusReport(taskId: string): string {
    const task = this.tasks.get(taskId);
    if (!task) return '任务不存在';

    const progress = this.getProgress(taskId);
    const lines: string[] = [
      `📋 任务: ${task.taskName} (${progress.percentage.toFixed(0)}%)`,
      `   创建于: ${new Date(task.createdAt).toLocaleString()}`,
      '',
    ];

    const statusEmoji: Record<string, string> = {
      [TaskStepStatus.COMPLETED]: '✅',
      [TaskStepStatus.IN_PROGRESS]: '🔄',
      [TaskStepStatus.PENDING]: '⏳',
      [TaskStepStatus.FAILED]: '❌',
      [TaskStepStatus.SKIPPED]: '⏭️',
      [TaskStepStatus.BLOCKED]: '🚫',
    };

    for (const step of task.steps) {
      const emoji = statusEmoji[step.status] || '❓';
      lines.push(`   ${emoji} ${step.name}: ${step.status}`);
      if (step.error) lines.push(`      错误: ${step.error}`);
    }

    return lines.join('\n');
  }
}
```

### 7.2.4 长期记忆 (Long-term Memory)

长期记忆是 Agent 最持久的知识存储。它保存跨会话、跨任务的知识，使 Agent 能够真正"学习"和"成长"。

**存储后端选择**：

| 后端 | 优势 | 劣势 | 最佳场景 |
|------|------|------|---------|
| 向量数据库 | 语义检索强 | 无结构关系 | 知识片段检索 |
| 图数据库 | 关系推理强 | 查询复杂 | 实体关系网络 |
| 关系数据库 | 结构化查询强 | 语义检索弱 | 结构化元数据 |
| 混合存储 | 兼顾各方 | 维护成本高 | 生产系统推荐 |

```typescript
/** 通用记忆条目 — 所有存储后端的统一数据模型 */
interface MemoryEntry {
  id: string;
  /** 记忆内容文本 */
  content: string;
  /** 嵌入向量（用于语义检索） */
  embedding?: number[];
  /** 结构化元数据 */
  metadata: {
    source: string;        // 来源（对话/任务/外部导入）
    createdAt: number;
    lastAccessedAt: number;
    accessCount: number;
    importance: number;    // 重要性评分 (0-1)
    tags: string[];
    /** 关联实体 */
    entities?: string[];
  };
}

/** 存储后端抽象接口 */
interface MemoryStorageBackend {
  store(entry: MemoryEntry): Promise<void>;
  retrieve(query: MemorySearchQuery): Promise<MemorySearchResult[]>;
  update(id: string, updates: Partial<MemoryEntry>): Promise<void>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
}

interface MemorySearchQuery {
  /** 文本查询 */
  text?: string;
  /** 向量查询 */
  embedding?: number[];
  /** 标签过滤 */
  tags?: string[];
  /** 时间范围过滤 */
  timeRange?: { start: number; end: number };
  /** 最小重要性 */
  minImportance?: number;
  /** 返回数量限制 */
  limit: number;
}

interface MemorySearchResult {
  entry: MemoryEntry;
  /** 相关性得分 */
  score: number;
  /** 匹配方式（vector / keyword / hybrid） */
  matchType: string;
}

/**
 * 向量记忆存储 — 基于 embedding 的语义检索
 * 生产环境中对接 Pinecone / Milvus / Qdrant 等向量数据库
 */
class VectorMemoryStore implements MemoryStorageBackend {
  private entries: Map<string, MemoryEntry> = new Map();
  private embeddingService: EmbeddingService;

  constructor(embeddingService: EmbeddingService) {
    this.embeddingService = embeddingService;
  }

  async store(entry: MemoryEntry): Promise<void> {
    // 如果没有 embedding，自动生成
    if (!entry.embedding) {
      entry.embedding = await this.embeddingService.embed(entry.content);
    }
    this.entries.set(entry.id, entry);
  }

  async retrieve(query: MemorySearchQuery): Promise<MemorySearchResult[]> {
    let queryEmbedding = query.embedding;
    if (!queryEmbedding && query.text) {
      queryEmbedding = await this.embeddingService.embed(query.text);
    }
    if (!queryEmbedding) return [];

    const results: MemorySearchResult[] = [];
    for (const entry of this.entries.values()) {
      if (!entry.embedding) continue;

      // 应用过滤条件
      if (query.tags && query.tags.length > 0) {
        const hasTag = query.tags.some(t => entry.metadata.tags.includes(t));
        if (!hasTag) continue;
      }
      if (query.minImportance && entry.metadata.importance < query.minImportance) continue;
      if (query.timeRange) {
        if (entry.metadata.createdAt < query.timeRange.start
          || entry.metadata.createdAt > query.timeRange.end) continue;
      }

      const score = this.cosineSimilarity(queryEmbedding, entry.embedding);
      results.push({ entry, score, matchType: 'vector' });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, query.limit);
  }

  async update(id: string, updates: Partial<MemoryEntry>): Promise<void> {
    const existing = this.entries.get(id);
    if (!existing) throw new Error(`记忆条目 ${id} 不存在`);
    Object.assign(existing, updates);
    // 如果内容变更，重新生成 embedding
    if (updates.content) {
      existing.embedding = await this.embeddingService.embed(updates.content);
    }
  }

  async delete(id: string): Promise<void> { this.entries.delete(id); }
  async count(): Promise<number> { return this.entries.size; }

  // cosineSimilarity 实现见第 5 章 Context Engineering 的工具函数定义
  // 此处为简化展示，完整实现请参考 code-examples/shared/utils.ts
  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
    return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0;
  }
}

/**
 * 图记忆存储 — 维护实体之间的关系网络
 * 适合需要关系推理的场景（如"用户的同事提到过的项目"）
 */
interface GraphNode {
  id: string;
  label: string;
  type: string; // person / project / concept / event
  properties: Record<string, unknown>;
}

interface GraphEdge {
  source: string;
  target: string;
  relation: string; // works_on / knows / mentioned / related_to
  weight: number;
  createdAt: number;
}

class GraphMemoryStore {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: GraphEdge[] = [];

  /** 添加或更新节点 */
  upsertNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  /** 添加边（关系） */
  addEdge(edge: GraphEdge): void {
    // 去重检查
    const exists = this.edges.some(
      e => e.source === edge.source && e.target === edge.target && e.relation === edge.relation
    );
    if (!exists) {
      this.edges.push(edge);
    } else {
      // 更新权重
      const existing = this.edges.find(
        e => e.source === edge.source && e.target === edge.target && e.relation === edge.relation
      )!;
      existing.weight = Math.min(existing.weight + 0.1, 1.0);
    }
  }

  /** 查找与实体相关的所有节点（一跳邻居） */
  findRelated(entityId: string, maxDepth: number = 1): GraphNode[] {
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [{ id: entityId, depth: 0 }];
    const results: GraphNode[] = [];

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (visited.has(id) || depth > maxDepth) continue;
      visited.add(id);

      const node = this.nodes.get(id);
      if (node && id !== entityId) results.push(node);

      // 查找所有相连的边
      for (const edge of this.edges) {
        if (edge.source === id && !visited.has(edge.target)) {
          queue.push({ id: edge.target, depth: depth + 1 });
        }
        if (edge.target === id && !visited.has(edge.source)) {
          queue.push({ id: edge.source, depth: depth + 1 });
        }
      }
    }

    return results;
  }

  /** 查找两个实体之间的最短路径 */
  findPath(fromId: string, toId: string): GraphNode[] | null {
    const visited = new Set<string>();
    const parent = new Map<string, string>();
    const queue: string[] = [fromId];
    visited.add(fromId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === toId) {
        // 回溯路径
        const path: GraphNode[] = [];
        let node = toId;
        while (node !== fromId) {
          const n = this.nodes.get(node);
          if (n) path.unshift(n);
          node = parent.get(node)!;
        }
        const startNode = this.nodes.get(fromId);
        if (startNode) path.unshift(startNode);
        return path;
      }

      for (const edge of this.edges) {
        const neighbor = edge.source === current ? edge.target
          : edge.target === current ? edge.source : null;
        if (neighbor && !visited.has(neighbor)) {
          visited.add(neighbor);
          parent.set(neighbor, current);
          queue.push(neighbor);
        }
      }
    }

    return null; // 不可达
  }
}
```

**记忆重要性评分器**：决定哪些信息值得长期保存。

```typescript
/**
 * 记忆重要性评分器
 * 综合多维度信号计算记忆的长期保存价值
 */
class MemoryImportanceScorer {
  /**
   * 计算重要性得分 (0-1)
   * 综合以下维度：
   * - 信息密度（实体和数字的数量）
   * - 情感强度（包含强烈情感词汇）
   * - 行动导向（包含决策或待办事项）
   * - 时间相关性（提到具体时间/截止日期）
   */
  score(content: string, context?: { role?: string; isExplicitSave?: boolean }): number {
    let score = 0.3; // 基础分

    // 1. 信息密度 — 包含实体和数字的内容更重要
    const entityPatterns = /[A-Z][a-z]+(?:\s[A-Z][a-z]+)+|https?:\/\/\S+|\S+@\S+/g;
    const entityCount = (content.match(entityPatterns) || []).length;
    score += Math.min(entityCount * 0.05, 0.15);

    // 2. 行动导向 — 包含决策或待办的内容更重要
    const actionKeywords = ['决定', '必须', '需要', '计划', '截止', 'TODO', 'deadline',
      '记住', '重要', '关键', '确认', '安排'];
    const actionCount = actionKeywords.filter(k => content.includes(k)).length;
    score += Math.min(actionCount * 0.08, 0.2);

    // 3. 用户显式标记 — 用户说"记住这个"
    if (context?.isExplicitSave) {
      score += 0.3;
    }

    // 4. 内容长度加成 — 较长的、有实质内容的消息更重要
    if (content.length > 200) score += 0.05;
    if (content.length > 500) score += 0.05;

    // 5. 数值/日期密度 — 包含具体数据的内容更重要
    const numberCount = (content.match(/\d+/g) || []).length;
    score += Math.min(numberCount * 0.02, 0.1);

    return Math.min(score, 1.0);
  }
}

/**
 * 语义去重器 — 避免存储语义重复的记忆条目
 */
class SemanticDeduplicator {
  private embeddingService: EmbeddingService;
  /** 相似度超过此阈值视为重复 */
  private threshold: number;

  constructor(embeddingService: EmbeddingService, threshold: number = 0.92) {
    this.embeddingService = embeddingService;
    this.threshold = threshold;
  }

  /** 检查新条目是否与已有条目重复 */
  async isDuplicate(
    newContent: string,
    existingEntries: MemoryEntry[]
  ): Promise<{ isDuplicate: boolean; similarEntry?: MemoryEntry; similarity: number }> {
    const newEmbedding = await this.embeddingService.embed(newContent);

    let maxSimilarity = 0;
    let mostSimilar: MemoryEntry | undefined;

    for (const entry of existingEntries) {
      if (!entry.embedding) continue;
      const sim = this.cosineSimilarity(newEmbedding, entry.embedding);
      if (sim > maxSimilarity) {
        maxSimilarity = sim;
        mostSimilar = entry;
      }
    }

    return {
      isDuplicate: maxSimilarity >= this.threshold,
      similarEntry: mostSimilar,
      similarity: maxSimilarity,
    };
  }

  /** 合并两条语义相似的记忆 — 保留两者的独特信息 */
  async merge(entry1: MemoryEntry, entry2: MemoryEntry, llmClient: LLMClient): Promise<string> {
    const prompt = `请将以下两段相似的信息合并为一段，保留所有独特的细节：\n\n信息1: ${entry1.content}\n\n信息2: ${entry2.content}\n\n合并后:`;
    const response = await llmClient.chat([{ role: 'user', content: prompt }]);
    return response.content;
  }

  // cosineSimilarity 实现见第 5 章 Context Engineering 的工具函数定义
  // 此处为简化展示，完整实现请参考 code-examples/shared/utils.ts
  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
    return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0;
  }
}
```

---

## 7.3 记忆巩固与遗忘

### 7.3.1 记忆巩固流水线

记忆巩固是将短期记忆转化为长期记忆的过程。在认知科学中，这个过程发生在睡眠期间；在 Agent 系统中，我们通过定时批处理实现类似的功能。

```typescript
/** 巩固策略 */
enum ConsolidationStrategy {
  /** 直接存储 — 不做任何处理 */
  RAW = 'raw',
  /** 摘要后存储 — 压缩信息 */
  SUMMARIZE = 'summarize',
  /** 提取知识三元组 — 结构化存储 */
  EXTRACT_TRIPLES = 'extract_triples',
  /** 合并到已有记忆 — 增量更新 */
  MERGE = 'merge',
}

interface ConsolidationResult {
  /** 处理的记忆条数 */
  processed: number;
  /** 成功巩固的条数 */
  consolidated: number;
  /** 被丢弃的条数（重要性太低） */
  discarded: number;
  /** 合并到已有记忆的条数 */
  merged: number;
}

/**
 * 记忆巩固器
 * 定期从短期存储中筛选有价值的记忆，经过处理后写入长期存储
 */
class MemoryConsolidator {
  private longTermStore: VectorMemoryStore;
  private importanceScorer: MemoryImportanceScorer;
  private deduplicator: SemanticDeduplicator;
  private llmClient: LLMClient;
  /** 重要性低于此阈值的记忆将被丢弃 */
  private importanceThreshold: number;

  constructor(config: {
    longTermStore: VectorMemoryStore;
    importanceScorer: MemoryImportanceScorer;
    deduplicator: SemanticDeduplicator;
    llmClient: LLMClient;
    importanceThreshold?: number;
  }) {
    this.longTermStore = config.longTermStore;
    this.importanceScorer = config.importanceScorer;
    this.deduplicator = config.deduplicator;
    this.llmClient = config.llmClient;
    this.importanceThreshold = config.importanceThreshold ?? 0.4;
  }

  /**
   * 执行巩固流水线
   * 输入：待巩固的记忆候选列表
   * 流程：评分 → 过滤 → 去重 → 选择策略 → 写入长期存储
   */
  async consolidate(candidates: MemoryEntry[]): Promise<ConsolidationResult> {
    const result: ConsolidationResult = { processed: 0, consolidated: 0, discarded: 0, merged: 0 };

    for (const candidate of candidates) {
      result.processed++;

      // Step 1: 评估重要性
      const importance = this.importanceScorer.score(candidate.content);
      if (importance < this.importanceThreshold) {
        result.discarded++;
        continue;
      }
      candidate.metadata.importance = importance;

      // Step 2: 检查是否与已有记忆重复
      const existing = await this.longTermStore.retrieve({
        text: candidate.content,
        limit: 5,
      });
      const dupCheck = await this.deduplicator.isDuplicate(
        candidate.content,
        existing.map(r => r.entry)
      );

      if (dupCheck.isDuplicate && dupCheck.similarEntry) {
        // 合并到已有记忆
        const mergedContent = await this.deduplicator.merge(
          dupCheck.similarEntry, candidate, this.llmClient
        );
        await this.longTermStore.update(dupCheck.similarEntry.id, {
          content: mergedContent,
          metadata: {
            ...dupCheck.similarEntry.metadata,
            lastAccessedAt: Date.now(),
            accessCount: dupCheck.similarEntry.metadata.accessCount + 1,
          },
        });
        result.merged++;
      } else {
        // 作为新记忆存储
        await this.longTermStore.store(candidate);
        result.consolidated++;
      }
    }

    return result;
  }
}
```

### 7.3.2 间隔重复调度器

基于 Ebbinghaus 遗忘曲线，我们实现 SM-2 算法的 Agent 适配版本：重要的记忆会被定期"复习"（重新检索和强化），而不重要的记忆逐渐衰减。

```typescript
/** 间隔重复调度记录 */
interface RepetitionSchedule {
  memoryId: string;
  /** 下次复习时间 */
  nextReviewAt: number;
  /** 当前间隔（天） */
  intervalDays: number;
  /** 难度因子 (>= 1.3) */
  easeFactor: number;
  /** 复习次数 */
  reviewCount: number;
  /** 连续正确次数 */
  consecutiveCorrect: number;
}

/**
 * 间隔重复调度器 — SM-2 算法的 Agent 适配版
 * 原始 SM-2 使用用户评分(0-5)，我们用"检索命中"代替：
 * - 被检索到并使用 → 高质量回忆（评分 4-5）
 * - 被检索但未使用 → 中等回忆（评分 3）
 * - 未被检索但仍相关 → 遗忘风险（评分 1-2）
 */
class SpacedRepetitionScheduler {
  private schedules: Map<string, RepetitionSchedule> = new Map();

  /** 为新记忆创建初始调度 */
  initSchedule(memoryId: string): RepetitionSchedule {
    const schedule: RepetitionSchedule = {
      memoryId,
      nextReviewAt: Date.now() + 24 * 60 * 60 * 1000, // 1 天后
      intervalDays: 1,
      easeFactor: 2.5,
      reviewCount: 0,
      consecutiveCorrect: 0,
    };
    this.schedules.set(memoryId, schedule);
    return schedule;
  }

  /**
   * 基于 SM-2 算法更新调度
   * @param memoryId 记忆 ID
   * @param quality 质量评分 (0-5)
   *   5: 完美回忆 — 被检索并在回复中使用
   *   4: 正确但犹豫 — 被检索但排名靠后
   *   3: 勉强记起 — 相关但未被选中
   *   2: 严重困难 — 检索失败但手动找到
   *   1: 几乎遗忘 — 需要重新学习
   *   0: 完全遗忘
   */
  review(memoryId: string, quality: number): RepetitionSchedule {
    let schedule = this.schedules.get(memoryId);
    if (!schedule) {
      schedule = this.initSchedule(memoryId);
    }

    schedule.reviewCount++;

    // SM-2 核心算法
    if (quality >= 3) {
      schedule.consecutiveCorrect++;
      if (schedule.consecutiveCorrect === 1) {
        schedule.intervalDays = 1;
      } else if (schedule.consecutiveCorrect === 2) {
        schedule.intervalDays = 6;
      } else {
        schedule.intervalDays = Math.round(schedule.intervalDays * schedule.easeFactor);
      }
    } else {
      // 低质量回忆 — 重置间隔
      schedule.consecutiveCorrect = 0;
      schedule.intervalDays = 1;
    }

    // 更新难度因子
    schedule.easeFactor = Math.max(1.3,
      schedule.easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
    );

    // 计算下次复习时间
    schedule.nextReviewAt = Date.now() + schedule.intervalDays * 24 * 60 * 60 * 1000;
    this.schedules.set(memoryId, schedule);
    return schedule;
  }

  /** 获取当前需要复习的记忆 ID 列表 */
  getDueForReview(): string[] {
    const now = Date.now();
    return Array.from(this.schedules.values())
      .filter(s => s.nextReviewAt <= now)
      .sort((a, b) => a.nextReviewAt - b.nextReviewAt)
      .map(s => s.memoryId);
  }
}
```

### 7.3.3 睡眠式巩固

模拟人类睡眠期间的记忆巩固过程——在 Agent 空闲时执行批量处理：

```typescript
/**
 * 睡眠式巩固 — Agent 空闲时的批量记忆处理
 * 灵感来自神经科学中的"记忆重放"理论：
 * 睡眠时大脑会"重放"白天的经历，强化重要记忆并建立关联
 */
class SleepConsolidation {
  private consolidator: MemoryConsolidator;
  private scheduler: SpacedRepetitionScheduler;
  private isRunning: boolean = false;

  constructor(
    consolidator: MemoryConsolidator,
    scheduler: SpacedRepetitionScheduler
  ) {
    this.consolidator = consolidator;
    this.scheduler = scheduler;
  }

  /**
   * 执行"睡眠"巩固
   * 在 Agent 空闲时调用，处理积压的记忆巩固任务
   */
  async sleep(pendingMemories: MemoryEntry[]): Promise<{
    consolidation: ConsolidationResult;
    reviewedCount: number;
    newConnectionsFound: number;
  }> {
    if (this.isRunning) throw new Error('巩固过程正在运行中');
    this.isRunning = true;

    try {
      // Phase 1: 巩固新记忆
      const consolidationResult = await this.consolidator.consolidate(pendingMemories);

      // Phase 2: 复习到期的记忆
      const dueIds = this.scheduler.getDueForReview();
      let reviewedCount = 0;
      for (const id of dueIds) {
        // 模拟"检索测试"— 尝试检索该记忆
        // 实际系统中会用 LLM 生成相关问题并测试检索效果
        this.scheduler.review(id, 4); // 简化：假设复习质量为 4
        reviewedCount++;
      }

      // Phase 3: 发现新关联（跨记忆的语义连接）
      // 实际实现中会用 LLM 分析记忆对之间的隐含关系
      const newConnectionsFound = 0; // 简化

      return { consolidation: consolidationResult, reviewedCount, newConnectionsFound };
    } finally {
      this.isRunning = false;
    }
  }
}
```

### 7.3.4 记忆垃圾回收

长期运行的 Agent 会积累大量记忆，需要定期清理低价值条目：

```typescript
/** GC 配置 */
interface GCConfig {
  /** 最大记忆条目数 */
  maxEntries: number;
  /** 最大存储大小（字节） */
  maxStorageBytes: number;
  /** 最小重要性阈值 — 低于此值的记忆可被回收 */
  minImportance: number;
  /** 最大不活跃天数 — 超过此天数未被访问的记忆可被回收 */
  maxInactiveDays: number;
}

interface GCResult {
  /** 扫描的总条目数 */
  scanned: number;
  /** 回收的条目数 */
  collected: number;
  /** 释放的存储空间（字节） */
  freedBytes: number;
  /** 耗时（毫秒） */
  durationMs: number;
}

/**
 * 记忆垃圾回收器
 * 定期清理低价值、过期的记忆条目
 */
class MemoryGarbageCollector {
  private config: GCConfig;

  constructor(config: GCConfig) {
    this.config = config;
  }

  /**
   * 执行 GC — 标记-清除策略
   * Phase 1 (标记): 扫描所有记忆，标记可回收的条目
   * Phase 2 (清除): 删除被标记的条目
   */
  async collect(store: MemoryStorageBackend): Promise<GCResult> {
    const startTime = Date.now();
    const allEntries = await store.retrieve({ limit: 100000 }); // 获取全部
    const toDelete: string[] = [];
    let freedBytes = 0;
    const now = Date.now();

    for (const { entry } of allEntries) {
      const inactiveDays = (now - entry.metadata.lastAccessedAt) / (24 * 60 * 60 * 1000);
      const shouldCollect =
        // 条件1: 重要性低于阈值且超过不活跃天数
        (entry.metadata.importance < this.config.minImportance
          && inactiveDays > this.config.maxInactiveDays)
        // 条件2: 从未被访问过且已超过 7 天
        || (entry.metadata.accessCount === 0 && inactiveDays > 7);

      if (shouldCollect) {
        toDelete.push(entry.id);
        freedBytes += new TextEncoder().encode(entry.content).length;
      }
    }

    // 执行删除
    for (const id of toDelete) {
      await store.delete(id);
    }

    return {
      scanned: allEntries.length,
      collected: toDelete.length,
      freedBytes,
      durationMs: Date.now() - startTime,
    };
  }
}
```

### 7.3.5 遗忘曲线管理器

```typescript
/** 遗忘曲线配置 */
interface ForgettingCurveConfig {
  /** 基础衰减速率 */
  baseDecayRate: number;
  /** 每次访问增加的强度 */
  accessStrengthBoost: number;
  /** 最小保留概率 — 低于此值视为"已遗忘" */
  minRetention: number;
}

/**
 * 遗忘曲线管理器
 * 基于 Ebbinghaus 遗忘曲线模型管理记忆衰减
 * R(t) = e^(-t/S)  其中 S = strength（记忆强度）
 */
class ForgettingCurveManager {
  private config: ForgettingCurveConfig;
  /** 每条记忆的强度值 */
  private strengths: Map<string, number> = new Map();

  constructor(config: ForgettingCurveConfig) {
    this.config = config;
  }

  /** 注册新记忆，初始强度由重要性决定 */
  register(memoryId: string, importance: number): void {
    // 初始强度 = 基础值 + 重要性加成
    const initialStrength = 1.0 + importance * 2.0;
    this.strengths.set(memoryId, initialStrength);
  }

  /** 记录一次访问，增强记忆强度 */
  recordAccess(memoryId: string): void {
    const current = this.strengths.get(memoryId) || 1.0;
    this.strengths.set(memoryId, current + this.config.accessStrengthBoost);
  }

  /** 计算记忆在当前时刻的保留概率 */
  getRetention(memoryId: string, elapsedHours: number): number {
    const strength = this.strengths.get(memoryId) || 1.0;
    return Math.exp(-elapsedHours * this.config.baseDecayRate / strength);
  }

  /** 获取所有"已遗忘"的记忆 ID（保留概率低于阈值） */
  getForgotten(elapsedHoursMap: Map<string, number>): string[] {
    const forgotten: string[] = [];
    for (const [id, hours] of elapsedHoursMap) {
      if (this.getRetention(id, hours) < this.config.minRetention) {
        forgotten.push(id);
      }
    }
    return forgotten;
  }
}
```

---

## 7.4 语义记忆与知识提取

### 7.4.1 从对话中提取结构化知识

Agent 与用户的每次对话都蕴含着可提取的知识。语义记忆提取器将非结构化对话转化为结构化的知识条目。

```typescript
/** 提取的知识条目 */
interface ExtractedKnowledge {
  /** 知识类型 */
  type: 'fact' | 'preference' | 'relationship' | 'event' | 'skill';
  /** 主语（通常是用户或某个实体） */
  subject: string;
  /** 谓语（关系或属性） */
  predicate: string;
  /** 宾语 */
  object: string;
  /** 置信度 (0-1) */
  confidence: number;
  /** 来源对话 ID */
  sourceMessageId: string;
  /** 提取时间 */
  extractedAt: number;
}

/**
 * 语义记忆提取器
 * 使用 LLM 从对话中提取结构化知识三元组
 */
class SemanticMemoryExtractor {
  private llmClient: LLMClient;

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
  }

  /**
   * 从对话消息中提取知识
   * 使用 few-shot prompting 引导 LLM 输出结构化知识
   */
  async extract(messages: ConversationMessage[]): Promise<ExtractedKnowledge[]> {
    const dialogue = messages.map(m => `${m.role}: ${m.content}`).join('\n');

    const prompt = `分析以下对话，提取所有有价值的知识条目。每个条目用 JSON 格式输出。

知识类型说明：
- fact: 客观事实（如"用户在字节跳动工作"）
- preference: 用户偏好（如"用户喜欢使用 TypeScript"）
- relationship: 实体关系（如"张三是用户的经理"）
- event: 事件记录（如"用户明天有产品评审会"）
- skill: 技能/能力（如"用户擅长分布式系统设计"）

对话内容:
${dialogue}

请以 JSON 数组格式输出提取的知识，每项包含 type、subject、predicate、object、confidence 字段。
仅输出 JSON，不要其他文本。`;

    const response = await this.llmClient.chat([{ role: 'user', content: prompt }]);

    try {
      const raw = JSON.parse(response.content) as Array<{
        type: string; subject: string; predicate: string; object: string; confidence: number;
      }>;

      return raw.map(item => ({
        ...item,
        type: item.type as ExtractedKnowledge['type'],
        confidence: Math.min(Math.max(item.confidence, 0), 1),
        sourceMessageId: messages[messages.length - 1]?.id || '',
        extractedAt: Date.now(),
      }));
    } catch {
      // LLM 输出解析失败 — 返回空数组而非崩溃
      console.warn('知识提取解析失败:', response.content.slice(0, 200));
      return [];
    }
  }
}
```

### 7.4.2 实体中心记忆

将记忆围绕实体（人、项目、概念）组织，而非简单的时间线：

```typescript
/** 实体定义 */
interface Entity {
  id: string;
  name: string;
  type: 'person' | 'project' | 'concept' | 'organization' | 'location';
  /** 实体别名（用于匹配不同称呼） */
  aliases: string[];
  /** 实体属性 */
  attributes: Record<string, string>;
  /** 关联的记忆 ID 列表 */
  memoryIds: string[];
  /** 首次出现时间 */
  firstSeenAt: number;
  /** 最后提及时间 */
  lastMentionedAt: number;
  /** 提及频次 */
  mentionCount: number;
}

/**
 * 实体中心记忆管理
 * 以实体为索引组织记忆，支持"关于张三的所有记忆"这类查询
 */
class EntityCentricMemory {
  private entities: Map<string, Entity> = new Map();
  /** 名称/别名到实体 ID 的映射 */
  private nameIndex: Map<string, string> = new Map();

  /** 注册或更新实体 */
  upsertEntity(entity: Omit<Entity, 'firstSeenAt' | 'lastMentionedAt' | 'mentionCount'>): Entity {
    const existing = this.entities.get(entity.id);
    if (existing) {
      // 合并属性和别名
      Object.assign(existing.attributes, entity.attributes);
      existing.aliases = [...new Set([...existing.aliases, ...entity.aliases])];
      existing.lastMentionedAt = Date.now();
      existing.mentionCount++;
      // 更新名称索引
      for (const alias of entity.aliases) {
        this.nameIndex.set(alias.toLowerCase(), entity.id);
      }
      return existing;
    }

    const newEntity: Entity = {
      ...entity,
      firstSeenAt: Date.now(),
      lastMentionedAt: Date.now(),
      mentionCount: 1,
    };
    this.entities.set(entity.id, newEntity);
    this.nameIndex.set(entity.name.toLowerCase(), entity.id);
    for (const alias of entity.aliases) {
      this.nameIndex.set(alias.toLowerCase(), entity.id);
    }
    return newEntity;
  }

  /** 通过名称或别名查找实体 */
  findByName(name: string): Entity | null {
    const id = this.nameIndex.get(name.toLowerCase());
    return id ? this.entities.get(id) || null : null;
  }

  /** 将记忆关联到实体 */
  linkMemory(entityId: string, memoryId: string): void {
    const entity = this.entities.get(entityId);
    if (entity && !entity.memoryIds.includes(memoryId)) {
      entity.memoryIds.push(memoryId);
      entity.lastMentionedAt = Date.now();
      entity.mentionCount++;
    }
  }

  /** 获取关于某实体的所有记忆 ID */
  getMemoriesForEntity(entityId: string): string[] {
    return this.entities.get(entityId)?.memoryIds || [];
  }

  /** 获取最近最活跃的实体 */
  getActiveEntities(limit: number = 10): Entity[] {
    return Array.from(this.entities.values())
      .sort((a, b) => b.lastMentionedAt - a.lastMentionedAt)
      .slice(0, limit);
  }

  /** 从文本中检测提及的实体 */
  detectEntities(text: string): Entity[] {
    const detected: Entity[] = [];
    const lowerText = text.toLowerCase();

    for (const entity of this.entities.values()) {
      const allNames = [entity.name, ...entity.aliases];
      for (const name of allNames) {
        if (lowerText.includes(name.toLowerCase())) {
          detected.push(entity);
          break;
        }
      }
    }

    return detected;
  }
}
```

### 7.4.3 记忆冲突解决

当新信息与已有记忆矛盾时（例如用户更改了偏好），需要冲突检测和解决机制：

```typescript
/** 冲突类型 */
enum ConflictType {
  /** 直接矛盾 — "用户喜欢Java" vs "用户不喜欢Java" */
  CONTRADICTION = 'contradiction',
  /** 信息更新 — "用户住在北京" vs "用户住在上海"（搬家了） */
  UPDATE = 'update',
  /** 精度提升 — "用户是工程师" vs "用户是高级后端工程师" */
  REFINEMENT = 'refinement',
}

interface MemoryConflict {
  existingMemory: MemoryEntry;
  newContent: string;
  conflictType: ConflictType;
  confidence: number;
}

/**
 * 记忆冲突检测与解决器
 */
class MemoryConflictResolver {
  private llmClient: LLMClient;

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
  }

  /** 检测新内容是否与已有记忆存在冲突 */
  async detectConflicts(
    newContent: string,
    existingMemories: MemoryEntry[]
  ): Promise<MemoryConflict[]> {
    if (existingMemories.length === 0) return [];

    const existingTexts = existingMemories
      .map((m, i) => `[${i}] ${m.content}`)
      .join('\n');

    const prompt = `判断新信息是否与已有记忆存在冲突。

已有记忆:
${existingTexts}

新信息: ${newContent}

对于每个冲突，输出 JSON 数组，每项包含:
- index: 冲突的已有记忆编号
- type: "contradiction"(矛盾) / "update"(信息更新) / "refinement"(精度提升)
- confidence: 冲突确信度 (0-1)

如无冲突，输出空数组 []。仅输出 JSON。`;

    const response = await this.llmClient.chat([{ role: 'user', content: prompt }]);

    try {
      const conflicts = JSON.parse(response.content) as Array<{
        index: number; type: string; confidence: number;
      }>;

      return conflicts
        .filter(c => c.index >= 0 && c.index < existingMemories.length)
        .map(c => ({
          existingMemory: existingMemories[c.index],
          newContent,
          conflictType: c.type as ConflictType,
          confidence: c.confidence,
        }));
    } catch {
      return [];
    }
  }

  /** 解决冲突 — 根据冲突类型采取不同策略 */
  async resolve(conflict: MemoryConflict): Promise<{
    action: 'replace' | 'merge' | 'keep_both' | 'ignore';
    resolvedContent?: string;
  }> {
    switch (conflict.conflictType) {
      case ConflictType.UPDATE:
        // 信息更新 — 用新信息替换旧信息
        return { action: 'replace', resolvedContent: conflict.newContent };

      case ConflictType.REFINEMENT:
        // 精度提升 — 合并为更精确的版本
        return { action: 'merge', resolvedContent: conflict.newContent };

      case ConflictType.CONTRADICTION:
        // 矛盾 — 保留两者并标记，让用户决定
        if (conflict.confidence > 0.8) {
          return { action: 'replace', resolvedContent: conflict.newContent };
        }
        return { action: 'keep_both' };

      default:
        return { action: 'ignore' };
    }
  }
}
```

### 7.4.4 用户画像构建

通过长期记忆积累，自动构建用户画像：

```typescript
/** 用户画像数据结构 */
interface UserProfile {
  userId: string;
  /** 基本信息 */
  demographics: {
    name?: string;
    role?: string;
    organization?: string;
    timezone?: string;
  };
  /** 偏好设置 */
  preferences: {
    language: string;
    responseStyle: 'concise' | 'detailed' | 'balanced';
    technicalLevel: 'beginner' | 'intermediate' | 'expert';
    topics: Array<{ topic: string; interest: number }>;
  };
  /** 行为模式 */
  patterns: {
    activeHours: number[];     // 活跃时段 (0-23)
    avgSessionLength: number;  // 平均会话时长（分钟）
    commonTaskTypes: string[]; // 常见任务类型
  };
  /** 画像更新历史 */
  lastUpdatedAt: number;
  updateCount: number;
}

/**
 * 用户画像构建器
 * 从交互历史中提取并维护用户画像
 */
class UserProfileBuilder {
  private llmClient: LLMClient;

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
  }

  /** 从记忆集合中构建/更新用户画像 */
  async buildProfile(
    existingProfile: UserProfile | null,
    recentMemories: MemoryEntry[]
  ): Promise<UserProfile> {
    const memorySummary = recentMemories
      .map(m => m.content)
      .join('\n---\n');

    const prompt = `基于以下用户相关的记忆，提取/更新用户画像。

${existingProfile ? `当前画像:\n${JSON.stringify(existingProfile, null, 2)}\n\n` : ''}
最近记忆:
${memorySummary}

请输出更新后的用户画像 JSON，包含:
- demographics: { name?, role?, organization?, timezone? }
- preferences: { language, responseStyle, technicalLevel, topics: [{topic, interest}] }
- patterns: { commonTaskTypes: string[] }

仅输出 JSON。`;

    const response = await this.llmClient.chat([{ role: 'user', content: prompt }]);

    try {
      const extracted = JSON.parse(response.content);
      return {
        userId: existingProfile?.userId || 'default',
        demographics: { ...existingProfile?.demographics, ...extracted.demographics },
        preferences: {
          language: extracted.preferences?.language || existingProfile?.preferences?.language || 'zh-CN',
          responseStyle: extracted.preferences?.responseStyle || 'balanced',
          technicalLevel: extracted.preferences?.technicalLevel || 'intermediate',
          topics: extracted.preferences?.topics || [],
        },
        patterns: {
          activeHours: existingProfile?.patterns?.activeHours || [],
          avgSessionLength: existingProfile?.patterns?.avgSessionLength || 0,
          commonTaskTypes: extracted.patterns?.commonTaskTypes || [],
        },
        lastUpdatedAt: Date.now(),
        updateCount: (existingProfile?.updateCount || 0) + 1,
      };
    } catch {
      return existingProfile || this.createDefaultProfile();
    }
  }

  private createDefaultProfile(): UserProfile {
    return {
      userId: 'default',
      demographics: {},
      preferences: {
        language: 'zh-CN',
        responseStyle: 'balanced',
        technicalLevel: 'intermediate',
        topics: [],
      },
      patterns: { activeHours: [], avgSessionLength: 0, commonTaskTypes: [] },
      lastUpdatedAt: Date.now(),
      updateCount: 0,
    };
  }
}
```

---

## 7.5 记忆检索优化

### 7.5.1 混合检索策略

单一的向量检索或关键词检索都有局限性。混合检索结合多种策略的优势：

```typescript
/** 检索权重配置 */
interface RetrievalWeights {
  /** 向量相似度权重 */
  vectorSimilarity: number;
  /** 关键词匹配权重 */
  keywordMatch: number;
  /** 时间衰减权重 — 越新的记忆得分越高 */
  recency: number;
  /** 重要性权重 */
  importance: number;
  /** 访问频率权重 */
  accessFrequency: number;
}

/** 带综合评分的检索结果 */
interface RankedMemoryResult {
  entry: MemoryEntry;
  /** 各维度得分明细 */
  scores: {
    vector: number;
    keyword: number;
    recency: number;
    importance: number;
    frequency: number;
  };
  /** 加权综合得分 */
  finalScore: number;
}

/**
 * 混合记忆检索器
 * 结合向量检索 + 关键词匹配 + 时间衰减 + 重要性加权
 */
class HybridMemoryRetriever {
  private vectorStore: VectorMemoryStore;
  private embeddingService: EmbeddingService;
  private weights: RetrievalWeights;

  constructor(config: {
    vectorStore: VectorMemoryStore;
    embeddingService: EmbeddingService;
    weights?: Partial<RetrievalWeights>;
  }) {
    this.vectorStore = config.vectorStore;
    this.embeddingService = config.embeddingService;
    this.weights = {
      vectorSimilarity: 0.4,
      keywordMatch: 0.2,
      recency: 0.15,
      importance: 0.15,
      accessFrequency: 0.1,
      ...config.weights,
    };
  }

  /** 执行混合检索 */
  async search(query: string, limit: number = 10): Promise<RankedMemoryResult[]> {
    // Step 1: 向量检索 — 获取语义相关的候选集
    const vectorResults = await this.vectorStore.retrieve({
      text: query,
      limit: limit * 3, // 多检索一些用于后续重排
    });

    // Step 2: 关键词匹配增强
    const queryKeywords = this.extractKeywords(query);
    const now = Date.now();

    // Step 3: 综合评分
    const ranked: RankedMemoryResult[] = vectorResults.map(vr => {
      // 关键词匹配得分
      const keywordScore = this.computeKeywordScore(vr.entry.content, queryKeywords);

      // 时间衰减得分 — 使用对数衰减
      const ageHours = (now - vr.entry.metadata.lastAccessedAt) / (3600 * 1000);
      const recencyScore = 1 / (1 + Math.log1p(ageHours / 24));

      // 重要性得分
      const importanceScore = vr.entry.metadata.importance;

      // 访问频率得分 — 对数归一化
      const freqScore = Math.log1p(vr.entry.metadata.accessCount) / 10;

      // 加权综合
      const finalScore =
        this.weights.vectorSimilarity * vr.score +
        this.weights.keywordMatch * keywordScore +
        this.weights.recency * recencyScore +
        this.weights.importance * importanceScore +
        this.weights.accessFrequency * Math.min(freqScore, 1);

      return {
        entry: vr.entry,
        scores: {
          vector: vr.score,
          keyword: keywordScore,
          recency: recencyScore,
          importance: importanceScore,
          frequency: freqScore,
        },
        finalScore,
      };
    });

    // 按综合得分排序
    ranked.sort((a, b) => b.finalScore - a.finalScore);

    // 更新被检索到的记忆的访问时间
    for (const result of ranked.slice(0, limit)) {
      result.entry.metadata.lastAccessedAt = now;
      result.entry.metadata.accessCount++;
    }

    return ranked.slice(0, limit);
  }

  /** 提取查询关键词 */
  private extractKeywords(text: string): string[] {
    // 简单实现：按空格分词，过滤停用词和短词
    const stopWords = new Set(['的', '了', '是', '在', '和', '有', '这', '那', 'the', 'a', 'an', 'is', 'are']);
    return text.toLowerCase()
      .split(/[\s,，。.!！?？]+/)
      .filter(w => w.length > 1 && !stopWords.has(w));
  }

  /** 计算关键词匹配得分 */
  private computeKeywordScore(content: string, keywords: string[]): number {
    if (keywords.length === 0) return 0;
    const lowerContent = content.toLowerCase();
    const matched = keywords.filter(kw => lowerContent.includes(kw)).length;
    return matched / keywords.length;
  }
}
```

### 7.5.2 查询分解与规划

复杂查询需要先分解为子查询，然后分别检索再合并结果：

```typescript
/** 查询计划 */
interface QueryPlan {
  /** 原始查询 */
  originalQuery: string;
  /** 分解后的子查询 */
  subQueries: Array<{
    query: string;
    intent: 'factual' | 'temporal' | 'relational' | 'preference';
    /** 期望的检索策略 */
    strategy: 'vector' | 'keyword' | 'graph' | 'time_range';
  }>;
}

/**
 * 记忆查询规划器
 * 将复杂查询分解为可独立检索的子查询
 */
class MemoryQueryPlanner {
  private llmClient: LLMClient;

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
  }

  /** 分析查询并生成检索计划 */
  async plan(query: string): Promise<QueryPlan> {
    const prompt = `分析以下查询，将其分解为可独立检索的子查询。

查询: "${query}"

对每个子查询，指定:
- query: 子查询文本
- intent: factual(事实) / temporal(时间相关) / relational(关系) / preference(偏好)
- strategy: vector(语义检索) / keyword(关键词) / graph(图检索) / time_range(时间范围)

输出 JSON 数组。如果查询足够简单不需要分解，返回包含单个元素的数组。`;

    const response = await this.llmClient.chat([{ role: 'user', content: prompt }]);

    try {
      const subQueries = JSON.parse(response.content);
      return { originalQuery: query, subQueries };
    } catch {
      // 解析失败时使用默认计划
      return {
        originalQuery: query,
        subQueries: [{ query, intent: 'factual' as const, strategy: 'vector' as const }],
      };
    }
  }
}
```

### 7.5.3 上下文感知重排

检索结果需要根据当前对话上下文进行重排，确保最相关的记忆被优先注入工作记忆：

```typescript
/**
 * 上下文感知重排器
 * 根据当前对话上下文对检索结果进行二次排序
 */
class ContextualReranker {
  private llmClient: LLMClient;

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
  }

  /**
   * 对检索结果进行上下文感知重排
   * 考虑因素：
   * - 与当前对话话题的相关性
   * - 与用户最近意图的对齐度
   * - 信息的时效性和准确性
   */
  async rerank(
    results: RankedMemoryResult[],
    currentContext: { recentMessages: string[]; currentQuery: string }
  ): Promise<RankedMemoryResult[]> {
    if (results.length <= 1) return results;

    // 构建 LLM 重排提示
    const contextSummary = currentContext.recentMessages.slice(-3).join('\n');
    const candidates = results.map((r, i) =>
      `[${i}] ${r.entry.content.slice(0, 200)}`
    ).join('\n');

    const prompt = `基于当前对话上下文，对以下记忆候选按相关性排序。

当前对话:
${contextSummary}

当前问题: ${currentContext.currentQuery}

候选记忆:
${candidates}

请输出按相关性降序排列的候选编号数组（如 [2, 0, 1, 3]）。仅输出 JSON 数组。`;

    try {
      const response = await this.llmClient.chat([{ role: 'user', content: prompt }]);
      const order = JSON.parse(response.content) as number[];

      // 按新排序重组结果
      const reranked: RankedMemoryResult[] = [];
      for (const idx of order) {
        if (idx >= 0 && idx < results.length) {
          reranked.push(results[idx]);
        }
      }
      // 追加未被排序的结果
      for (let i = 0; i < results.length; i++) {
        if (!order.includes(i)) reranked.push(results[i]);
      }
      return reranked;
    } catch {
      return results; // 重排失败时返回原始排序
    }
  }
}
```

### 7.5.4 检索质量评估

```typescript
/** 检索评估用例 */
interface EvaluationCase {
  query: string;
  /** 期望被检索到的记忆 ID 集合 */
  expectedIds: Set<string>;
  /** 可选的记忆 ID（检索到更好，但不是必须） */
  optionalIds?: Set<string>;
}

/** 评估结果 */
interface EvaluationResult {
  /** 精确率 */
  precision: number;
  /** 召回率 */
  recall: number;
  /** F1 分数 */
  f1: number;
  /** 平均排名位置 */
  meanReciprocalRank: number;
  /** 检索延迟（毫秒） */
  latencyMs: number;
}

/**
 * 检索质量评估器
 * 使用标注的测试集评估检索系统的表现
 */
class RetrievalEvaluator {
  private retriever: HybridMemoryRetriever;

  constructor(retriever: HybridMemoryRetriever) {
    this.retriever = retriever;
  }

  /** 运行评估 */
  async evaluate(cases: EvaluationCase[], k: number = 10): Promise<EvaluationResult> {
    let totalPrecision = 0;
    let totalRecall = 0;
    let totalMRR = 0;
    let totalLatency = 0;

    for (const testCase of cases) {
      const startTime = Date.now();
      const results = await this.retriever.search(testCase.query, k);
      const latency = Date.now() - startTime;
      totalLatency += latency;

      const retrievedIds = new Set(results.map(r => r.entry.id));

      // 精确率 — 检索到的中有多少是相关的
      const relevantRetrieved = [...retrievedIds].filter(
        id => testCase.expectedIds.has(id)
      ).length;
      const precision = retrievedIds.size > 0 ? relevantRetrieved / retrievedIds.size : 0;
      totalPrecision += precision;

      // 召回率 — 相关的中有多少被检索到了
      const recall = testCase.expectedIds.size > 0
        ? relevantRetrieved / testCase.expectedIds.size : 0;
      totalRecall += recall;

      // MRR — 第一个相关结果的排名倒数
      let mrr = 0;
      for (let i = 0; i < results.length; i++) {
        if (testCase.expectedIds.has(results[i].entry.id)) {
          mrr = 1 / (i + 1);
          break;
        }
      }
      totalMRR += mrr;
    }

    const n = cases.length;
    const avgPrecision = n > 0 ? totalPrecision / n : 0;
    const avgRecall = n > 0 ? totalRecall / n : 0;
    const f1 = avgPrecision + avgRecall > 0
      ? 2 * avgPrecision * avgRecall / (avgPrecision + avgRecall) : 0;

    return {
      precision: avgPrecision,
      recall: avgRecall,
      f1,
      meanReciprocalRank: n > 0 ? totalMRR / n : 0,
      latencyMs: n > 0 ? totalLatency / n : 0,
    };
  }
}
```

---

## 7.6 跨会话记忆持久化

### 7.6.1 分层存储策略

类似 CPU 缓存层级，记忆存储也采用分层策略：热数据放在高速存储，冷数据放在低成本存储。

```typescript
/** 存储层级 */
enum StorageTier {
  /** 热存储 — 内存/Redis，毫秒级访问 */
  HOT = 'hot',
  /** 温存储 — SSD/数据库，十毫秒级访问 */
  WARM = 'warm',
  /** 冷存储 — 对象存储/归档，秒级访问 */
  COLD = 'cold',
}

/** 分层存储后端接口 */
interface TieredStorageBackend {
  tier: StorageTier;
  read(id: string): Promise<MemoryEntry | null>;
  write(entry: MemoryEntry): Promise<void>;
  delete(id: string): Promise<void>;
  list(options?: { limit?: number; offset?: number }): Promise<MemoryEntry[]>;
}

/**
 * 分层记忆存储管理器
 * 自动在热/温/冷存储之间迁移记忆条目
 */
class TieredMemoryStorage {
  private tiers: Map<StorageTier, TieredStorageBackend> = new Map();
  /** 记录每条记忆的当前层级 */
  private locationIndex: Map<string, StorageTier> = new Map();

  constructor(backends: TieredStorageBackend[]) {
    for (const backend of backends) {
      this.tiers.set(backend.tier, backend);
    }
  }

  /** 智能读取 — 从最可能的层级开始查找 */
  async read(id: string): Promise<MemoryEntry | null> {
    // 先查位置索引
    const knownTier = this.locationIndex.get(id);
    if (knownTier) {
      const backend = this.tiers.get(knownTier);
      const entry = await backend?.read(id);
      if (entry) {
        // 被访问的记忆提升到热存储
        if (knownTier !== StorageTier.HOT) {
          await this.promote(id, entry);
        }
        return entry;
      }
    }

    // 位置索引未命中，逐层查找
    for (const tier of [StorageTier.HOT, StorageTier.WARM, StorageTier.COLD]) {
      const backend = this.tiers.get(tier);
      if (!backend) continue;
      const entry = await backend.read(id);
      if (entry) {
        this.locationIndex.set(id, tier);
        if (tier !== StorageTier.HOT) await this.promote(id, entry);
        return entry;
      }
    }

    return null;
  }

  /** 写入 — 默认写入热存储 */
  async write(entry: MemoryEntry): Promise<void> {
    const hotBackend = this.tiers.get(StorageTier.HOT);
    if (!hotBackend) throw new Error('热存储后端未配置');
    await hotBackend.write(entry);
    this.locationIndex.set(entry.id, StorageTier.HOT);
  }

  /** 提升到热存储 */
  private async promote(id: string, entry: MemoryEntry): Promise<void> {
    const hotBackend = this.tiers.get(StorageTier.HOT);
    if (hotBackend) {
      await hotBackend.write(entry);
      this.locationIndex.set(id, StorageTier.HOT);
    }
  }

  /**
   * 执行层级迁移 — 定期调用
   * 将不活跃的热数据降级到温存储，将长期不访问的温数据降级到冷存储
   */
  async runTierMigration(config: {
    hotToWarmAfterHours: number;
    warmToColdAfterDays: number;
  }): Promise<{ demoted: number }> {
    let demoted = 0;
    const now = Date.now();

    // Hot → Warm
    const hotBackend = this.tiers.get(StorageTier.HOT);
    const warmBackend = this.tiers.get(StorageTier.WARM);
    if (hotBackend && warmBackend) {
      const hotEntries = await hotBackend.list();
      for (const entry of hotEntries) {
        const ageHours = (now - entry.metadata.lastAccessedAt) / (3600 * 1000);
        if (ageHours > config.hotToWarmAfterHours) {
          await warmBackend.write(entry);
          await hotBackend.delete(entry.id);
          this.locationIndex.set(entry.id, StorageTier.WARM);
          demoted++;
        }
      }
    }

    // Warm → Cold
    const coldBackend = this.tiers.get(StorageTier.COLD);
    if (warmBackend && coldBackend) {
      const warmEntries = await warmBackend.list();
      for (const entry of warmEntries) {
        const ageDays = (now - entry.metadata.lastAccessedAt) / (24 * 3600 * 1000);
        if (ageDays > config.warmToColdAfterDays) {
          await coldBackend.write(entry);
          await warmBackend.delete(entry.id);
          this.locationIndex.set(entry.id, StorageTier.COLD);
          demoted++;
        }
      }
    }

    return { demoted };
  }
}
```

### 7.6.2 序列化与反序列化

记忆的持久化需要可靠的序列化方案：

```typescript
/**
 * 记忆序列化器接口
 */
interface MemorySerializer {
  serialize(entry: MemoryEntry): string;
  deserialize(data: string): MemoryEntry;
  /** 格式标识符（用于版本兼容） */
  readonly format: string;
}

/** JSON 序列化器 — 可读性好，用于调试 */
class JsonMemorySerializer implements MemorySerializer {
  readonly format = 'json-v1';

  serialize(entry: MemoryEntry): string {
    return JSON.stringify({
      _format: this.format,
      _version: 1,
      ...entry,
    }, null, 2);
  }

  deserialize(data: string): MemoryEntry {
    const parsed = JSON.parse(data);
    // 移除序列化元数据
    const { _format, _version, ...entry } = parsed;
    return entry as MemoryEntry;
  }
}

/** 紧凑序列化器 — 省空间，适合大量存储 */
class CompactJsonSerializer implements MemorySerializer {
  readonly format = 'compact-v1';

  serialize(entry: MemoryEntry): string {
    // 省略 embedding 的完整精度，截断到 4 位小数
    const compact = {
      ...entry,
      embedding: entry.embedding?.map(v => Math.round(v * 10000) / 10000),
    };
    return JSON.stringify(compact);
  }

  deserialize(data: string): MemoryEntry {
    return JSON.parse(data) as MemoryEntry;
  }
}
```

### 7.6.3 隐私与合规

Agent 的长期记忆可能包含用户的敏感信息，必须遵守隐私法规：

```typescript
/** PII 类型 */
enum PIIType {
  EMAIL = 'email',
  PHONE = 'phone',
  ID_NUMBER = 'id_number',
  ADDRESS = 'address',
  NAME = 'name',
  FINANCIAL = 'financial',
}

/** PII 检测结果 */
interface PIIDetection {
  type: PIIType;
  value: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
}

/**
 * PII 检测器 — 识别文本中的个人敏感信息
 */
class PIIDetector {
  private patterns: Map<PIIType, RegExp> = new Map([\w.-]+@[\w.-]+\.\w{2,}/g],
    [-.\s][-.\s][-.\s][PIIType.PHONE, /(?:\+?\d{1,3}?)?\(?\d{3}\)??\d{3,4}?\d{4}/g],
    [1-9][0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g],
  ]);

  /** 检测文本中的 PII */
  detect(text: string): PIIDetection[] {
    const detections: PIIDetection[] = [];
    for (const [type, pattern] of this.patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        detections.push({
          type,
          value: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          confidence: 0.9,
        });
      }
    }
    return detections;
  }

  /** 匿名化处理 — 将 PII 替换为占位符 */
  anonymize(text: string): { anonymized: string; detections: PIIDetection[] } {
    const detections = this.detect(text);
    let anonymized = text;

    // 从后往前替换，避免索引偏移
    const sorted = detections.sort((a, b) => b.startIndex - a.startIndex);
    for (const det of sorted) {
      const placeholder = `[${det.type.toUpperCase()}_REDACTED]`;
      anonymized = anonymized.slice(0, det.startIndex) + placeholder + anonymized.slice(det.endIndex);
    }

    return { anonymized, detections };
  }
}

/**
 * 隐私合规存储包装器
 * 在记忆写入前自动检测并处理 PII
 */
class PrivacyCompliantStorage {
  private backend: MemoryStorageBackend;
  private piiDetector: PIIDetector;
  /** 是否匿名化（true）还是拒绝存储包含 PII 的记忆（false） */
  private anonymizeMode: boolean;

  constructor(backend: MemoryStorageBackend, piiDetector: PIIDetector, anonymizeMode: boolean = true) {
    this.backend = backend;
    this.piiDetector = piiDetector;
    this.anonymizeMode = anonymizeMode;
  }

  async store(entry: MemoryEntry): Promise<void> {
    const detections = this.piiDetector.detect(entry.content);

    if (detections.length === 0) {
      await this.backend.store(entry);
      return;
    }

    if (this.anonymizeMode) {
      const { anonymized } = this.piiDetector.anonymize(entry.content);
      await this.backend.store({ ...entry, content: anonymized });
    } else {
      throw new Error(
        `记忆包含 ${detections.length} 个 PII 项目 (${detections.map(d => d.type).join(', ')})，拒绝存储`
      );
    }
  }

  async retrieve(query: MemorySearchQuery): Promise<MemorySearchResult[]> {
    return this.backend.retrieve(query);
  }
}
```

### 7.6.4 Schema 迁移

随着系统演进，记忆的数据结构可能需要升级：

```typescript
/** 迁移定义 */
interface MemoryMigration {
  /** 迁移版本号 */
  version: number;
  /** 迁移描述 */
  description: string;
  /** 向前迁移 */
  up(entry: Record<string, unknown>): Record<string, unknown>;
  /** 向后回滚 */
  down(entry: Record<string, unknown>): Record<string, unknown>;
}

/**
 * 记忆 Schema 迁移管理器
 * 管理记忆数据结构的版本升级
 */
class MemoryMigrationManager {
  private migrations: MemoryMigration[] = [];
  private currentVersion: number = 0;

  /** 注册迁移 */
  register(migration: MemoryMigration): void {
    this.migrations.push(migration);
    this.migrations.sort((a, b) => a.version - b.version);
  }

  /** 将记忆条目迁移到最新版本 */
  migrateToLatest(entry: Record<string, unknown>): Record<string, unknown> {
    const entryVersion = (entry._schemaVersion as number) || 0;
    let result = { ...entry };

    for (const migration of this.migrations) {
      if (migration.version > entryVersion) {
        result = migration.up(result);
        result._schemaVersion = migration.version;
      }
    }

    return result;
  }

  /** 批量迁移 */
  async migrateBatch(
    entries: Record<string, unknown>[],
    onProgress?: (processed: number, total: number) => void
  ): Promise<{ migrated: number; failed: number; errors: string[] }> {
    let migrated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      try {
        entries[i] = this.migrateToLatest(entries[i]);
        migrated++;
      } catch (err) {
        failed++;
        errors.push(`条目 ${i}: ${err instanceof Error ? err.message : String(err)}`);
      }
      onProgress?.(i + 1, entries.length);
    }

    return { migrated, failed, errors };
  }
}

// 迁移示例
const migrationManager = new MemoryMigrationManager();

migrationManager.register({
  version: 1,
  description: '添加 tags 字段',
  up(entry) {
    return { ...entry, metadata: { ...(entry.metadata as object), tags: [] } };
  },
  down(entry) {
    const { tags, ...rest } = entry.metadata as Record<string, unknown>;
    return { ...entry, metadata: rest };
  },
});

migrationManager.register({
  version: 2,
  description: '将 importance 从字符串改为数字',
  up(entry) {
    const meta = entry.metadata as Record<string, unknown>;
    if (typeof meta.importance === 'string') {
      meta.importance = parseFloat(meta.importance as string) || 0.5;
    }
    return { ...entry, metadata: meta };
  },
  down(entry) {
    const meta = entry.metadata as Record<string, unknown>;
    meta.importance = String(meta.importance);
    return { ...entry, metadata: meta };
  },
});
```

---


---

## 7.7 实战：个人助理记忆系统

现在，让我们将前面所有的组件整合为一个完整的、可运行的个人助理记忆系统。这个系统展示了四层记忆如何协同工作，以及记忆如何随着时间积累而提升 Agent 的响应质量。

### 7.7.1 辅助类型与接口

首先定义我们在完整系统中需要的辅助接口，这些接口在前面各节中已被引用但尚未集中定义：

```typescript
/**
 * LLM 客户端接口 — 抽象 LLM 调用
 * 实际生产中可对接 OpenAI, Anthropic, 或其他 LLM 服务
 */
interface LLMClient {
  chat(messages: Array<{ role: string; content: string }>): Promise<{ content: string }>;
}

/**
 * Embedding 服务接口 — 将文本转换为向量嵌入
 * 实际生产中可对接 OpenAI Embeddings, Cohere, 或本地模型
 */
interface EmbeddingService {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  readonly dimensions: number;
}

/**
 * 任务记忆持久化接口
 */
interface TaskMemoryStorage {
  save(record: TaskMemoryRecord): Promise<void>;
  load(taskId: string): Promise<TaskMemoryRecord | null>;
  listByUser(userId: string, limit?: number): Promise<TaskMemoryRecord[]>;
}

/**
 * 检查点系统接口（参见第四章）
 */
interface CheckpointSystem {
  save(data: Record<string, unknown>): Promise<string>;
  load(checkpointId: string): Promise<Record<string, unknown>>;
}
```

### 7.7.2 完整的个人助理记忆系统

```typescript
/**
 * PersonalAssistantMemory — 完整的个人助理记忆系统
 *
 * 整合四层记忆 + 语义提取 + 混合检索 + 隐私保护：
 *
 * 生命周期：
 * 1. 会话开始 → 从长期记忆加载用户画像和相关记忆
 * 2. 每轮对话 → 更新工作记忆和对话记忆
 * 3. 任务执行 → 记录到任务记忆
 * 4. 会话结束 → 巩固重要记忆到长期存储
 *
 * 使用方式：
 *   const memory = new PersonalAssistantMemory(config);
 *   await memory.startSession(userId, sessionId);
 *   const context = await memory.prepareContext(userMessage);
 *   // ... Agent 推理 ...
 *   await memory.recordTurn(userMessage, assistantResponse);
 *   await memory.endSession();
 */
class PersonalAssistantMemory {
  // 四层记忆
  private workingMemory: PriorityWorkingMemory;
  private conversationMemory: SmartWindowConversationMemory;
  private taskMemory: TaskMemoryManager;
  private longTermStore: LongTermMemoryStore;

  // 辅助组件
  private retriever: HybridMemoryRetriever;
  private extractor: SemanticMemoryExtractor;
  private consolidator: MemoryConsolidator;
  private profileBuilder: UserProfileBuilder;
  private entityMemory: EntityCentricMemory;
  private reranker: ContextualReranker;
  private privacyStorage: PrivacyCompliantStorage;
  private forgettingCurve: ForgettingCurveManager;
  private gc: MemoryGarbageCollector;

  // 会话状态
  private userId: string | null = null;
  private sessionId: string | null = null;
  private turnCount: number = 0;
  private sessionMessages: ConversationMessage[] = [];

  // 配置
  private tokenCounter: (text: string) => number;

  constructor(config: {
    llmClient: LLMClient;
    embeddingService: EmbeddingService;
    tokenCounter: (text: string) => number;
    tieredStorage: TieredMemoryStorage;
    taskStorage: TaskMemoryStorage;
    workingMemoryTokens?: number;
    conversationMemoryTokens?: number;
  }) {
    this.tokenCounter = config.tokenCounter;

    // 初始化存储层
    const vectorStore = new VectorMemoryStore(config.embeddingService);
    const graphStore = new GraphMemoryStore();
    const scorer = new MemoryImportanceScorer();
    const deduplicator = new SemanticDeduplicator(config.embeddingService);

    // L1: 工作记忆
    this.workingMemory = new PriorityWorkingMemory(
      config.workingMemoryTokens ?? 8000,
      config.tokenCounter
    );

    // L2: 对话记忆
    const summarizer = new ConversationSummarizer(config.llmClient);
    const topicDetector = new TopicBoundaryDetector();
    this.conversationMemory = new SmartWindowConversationMemory(
      config.conversationMemoryTokens ?? 32000,
      summarizer,
      topicDetector
    );

    // L3: 任务记忆
    this.taskMemory = new TaskMemoryManager(config.taskStorage);

    // L4: 长期记忆
    this.longTermStore = new LongTermMemoryStore(
      vectorStore, graphStore, scorer, deduplicator
    );

    // 辅助组件初始化
    this.entityMemory = new EntityCentricMemory(graphStore);

    this.retriever = new HybridMemoryRetriever({
      vectorStore,
      graphStore,
      scorer,
      embeddingService: config.embeddingService,
    });

    this.extractor = new SemanticMemoryExtractor(config.llmClient);

    this.consolidator = new MemoryConsolidator({
      longTermStore: this.longTermStore,
      scorer,
      deduplicator,
      strategies: [
        ConsolidationStrategy.IMPORTANCE_THRESHOLD,
        ConsolidationStrategy.ACCESS_FREQUENCY,
        ConsolidationStrategy.CONNECTIVITY,
      ],
    });

    const conflictResolver = new MemoryConflictResolver(config.llmClient);
    this.profileBuilder = new UserProfileBuilder(config.llmClient, conflictResolver);

    this.reranker = new ContextualReranker(config.embeddingService);

    const piiDetector = new PIIDetector();
    this.privacyStorage = new PrivacyCompliantStorage(
      config.tieredStorage, piiDetector, true
    );

    this.forgettingCurve = new ForgettingCurveManager();

    this.gc = new MemoryGarbageCollector(
      {
        intervalMs: 60 * 60 * 1000,  // 每小时一次
        importanceThreshold: 0.05,
        staleAfterDays: 30,
        batchSize: 500,
        enableCompaction: true,
      },
      scorer,
      deduplicator
    );
  }

  /**
   * 开始新会话
   * 从长期记忆中加载用户画像和相关上下文
   */
  async startSession(userId: string, sessionId: string): Promise<{
    userProfile: string;
    preloadedMemories: number;
  }> {
    this.userId = userId;
    this.sessionId = sessionId;
    this.turnCount = 0;
    this.sessionMessages = [];

    // 重置工作记忆（保留 CRITICAL 条目如系统提示）
    this.workingMemory.reset();

    // 加载用户画像
    const profile = this.profileBuilder.getOrCreate(userId);
    const profilePrompt = this.profileBuilder.formatAsSystemPrompt(userId);

    if (profilePrompt) {
      this.workingMemory.add(
        profilePrompt,
        'system',
        MemoryPriority.HIGH,
        'user_profile',
        0
      );
    }

    // 预加载可能相关的记忆（基于用户历史高频话题）
    const preloaded = await this.longTermStore.recall(
      `用户 ${profile.demographics.name ?? userId} 的常见问题和偏好`,
      { entityIds: [userId] },
      5
    );

    if (preloaded.length > 0) {
      const preloadSummary = preloaded
        .map(r => `- ${r.entry.content}`)
        .join('\n');
      this.workingMemory.add(
        `[相关历史记忆]\n${preloadSummary}`,
        'system',
        MemoryPriority.MEDIUM,
        'preloaded_memory',
        0
      );
    }

    // 启动 GC（如果尚未启动）
    this.gc.start();

    return {
      userProfile: profilePrompt || '(新用户，暂无画像)',
      preloadedMemories: preloaded.length,
    };
  }

  /**
   * 为当前用户输入准备完整的上下文
   * 这是每轮对话中最关键的方法——它决定了 Agent "看到" 什么
   */
  async prepareContext(
    userMessage: string
  ): Promise<Array<{ role: string; content: string }>> {
    this.turnCount++;

    // 将用户消息添加到对话记忆
    const message: ConversationMessage = {
      id: randomUUID(),
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
      tokenCount: this.tokenCounter(userMessage),
      metadata: {
        turnIndex: this.turnCount,
        hasToolCall: false,
        isTopicBoundary: false,
        importance: 0.7, // 用户消息默认较高重要度
      },
    };
    await this.conversationMemory.addMessage(message);
    this.sessionMessages.push(message);

    // 从长期记忆检索相关内容
    const retrieved = await this.retriever.retrieve(userMessage, {
      limit: 5,
      contextEntityIds: this.userId ? [this.userId] : undefined,
    });

    // 上下文感知重排序
    const reranked = await this.reranker.rerank(retrieved, {
      recentMessages: this.sessionMessages.slice(-3).map(m => m.content),
      mentionedEntities: this.userId ? [this.userId] : [],
    });

    // 构建工作记忆
    // 1. 添加用户最新输入
    this.workingMemory.add(
      userMessage, 'user', MemoryPriority.HIGH, 'user_input', this.turnCount
    );

    // 2. 添加检索到的相关记忆
    if (reranked.length > 0) {
      const memoryContext = reranked
        .map(r => `- ${r.entry.content} (相关度: ${r.scores.finalScore.toFixed(2)})`)
        .join('\n');
      this.workingMemory.add(
        `[与当前问题相关的历史记忆]\n${memoryContext}`,
        'system',
        MemoryPriority.MEDIUM,
        'retrieved_memory',
        this.turnCount
      );
    }

    // 3. 构建完整上下文：工作记忆 + 对话记忆
    const workingCtx = this.workingMemory.buildContext();
    const conversationCtx = this.conversationMemory.buildContext();

    // 合并，去重系统消息
    const seen = new Set<string>();
    const fullContext: Array<{ role: string; content: string }> = [];

    for (const msg of workingCtx) {
      if (msg.role === 'system') {
        const key = msg.content.slice(0, 100);
        if (!seen.has(key)) {
          seen.add(key);
          fullContext.push(msg);
        }
      } else {
        fullContext.push(msg);
      }
    }

    // 添加对话历史（避免与工作记忆中的重复）
    for (const msg of conversationCtx) {
      if (msg.role !== 'system') {
        fullContext.push(msg);
      }
    }

    return fullContext;
  }

  /**
   * 记录一轮对话的助手回复
   */
  async recordTurn(
    userMessage: string,
    assistantResponse: string,
    toolCalls?: Array<{ tool: string; result: string }>
  ): Promise<void> {
    // 记录助手回复到对话记忆
    const assistantMsg: ConversationMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: assistantResponse,
      timestamp: Date.now(),
      tokenCount: this.tokenCounter(assistantResponse),
      metadata: {
        turnIndex: this.turnCount,
        hasToolCall: Boolean(toolCalls?.length),
        isTopicBoundary: false,
        importance: 0.5,
      },
    };
    await this.conversationMemory.addMessage(assistantMsg);
    this.sessionMessages.push(assistantMsg);

    // 添加到工作记忆
    this.workingMemory.add(
      assistantResponse,
      'assistant',
      MemoryPriority.MEDIUM,
      'assistant_response',
      this.turnCount
    );

    // 如果有工具调用，也记录到工作记忆
    if (toolCalls) {
      for (const tc of toolCalls) {
        this.workingMemory.add(
          `[工具调用: ${tc.tool}]\n${tc.result}`,
          'tool',
          MemoryPriority.MEDIUM,
          'tool_result',
          this.turnCount
        );
      }
    }
  }

  /**
   * 结束会话
   * 触发记忆巩固和用户画像更新
   */
  async endSession(): Promise<{
    consolidationResult: ConsolidationResult;
    profileUpdates: string[];
    extractedKnowledge: number;
  }> {
    if (!this.sessionId) {
      throw new Error('没有活跃的会话');
    }

    // 1. 从会话中提取知识
    const knowledge = await this.extractor.extractFromConversation(
      this.sessionMessages,
      this.sessionId
    );

    // 2. 更新用户画像
    const profileResult = await this.profileBuilder.updateFromKnowledge(
      this.userId!,
      knowledge
    );

    // 3. 将提取的知识转换为记忆条目
    const memoryEntries: MemoryEntry[] = knowledge.map(k => ({
      id: randomUUID(),
      content: k.content,
      category: k.type as MemoryEntry['category'],
      importance: k.confidence * 0.8, // 置信度映射为重要度
      accessCount: 0,
      lastAccessedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: {
        sessionId: this.sessionId!,
      },
      tags: [],
      relatedEntityIds: k.entities
        .map(name => this.entityMemory.findEntity(name)?.id)
        .filter((id): id is string => id !== null && id !== undefined),
      decayFactor: k.type === 'preference' ? 3.0 : 1.0,
    }));

    // 4. 执行记忆巩固
    const consolidationResult = await this.consolidator.consolidate(memoryEntries);

    // 5. 清理会话状态
    this.workingMemory.reset();
    this.sessionMessages = [];
    this.turnCount = 0;

    const previousSessionId = this.sessionId;
    this.sessionId = null;

    console.log(
      `[PersonalAssistant] 会话 ${previousSessionId} 结束: ` +
      `提取 ${knowledge.length} 条知识, ` +
      `巩固 ${consolidationResult.consolidatedCount} 条, ` +
      `合并 ${consolidationResult.mergedCount} 条, ` +
      `丢弃 ${consolidationResult.discardedCount} 条, ` +
      `更新画像字段 ${profileResult.updatedFields.length} 个`
    );

    return {
      consolidationResult,
      profileUpdates: profileResult.updatedFields,
      extractedKnowledge: knowledge.length,
    };
  }

  /**
   * 获取系统状态（用于监控和调试）
   */
  getSystemStatus(): Record<string, unknown> {
    return {
      session: {
        userId: this.userId,
        sessionId: this.sessionId,
        turnCount: this.turnCount,
        messageCount: this.sessionMessages.length,
      },
      workingMemory: this.workingMemory.getMetrics(),
      conversationMemory: this.conversationMemory.getStats(),
    };
  }
}
```

### 7.7.3 使用示例：多会话记忆积累

以下示例展示了记忆系统如何在多次会话中积累和利用知识：

```typescript
/**
 * 示例：三次会话展示记忆积累效果
 *
 * 会话 1: 用户表达技术偏好
 * 会话 2: 用户执行编码任务
 * 会话 3: 验证 Agent 已记住之前的信息
 */
async function demonstrateMemoryAccumulation(): Promise<void> {
  // 初始化（使用 mock 实现）
  const llmClient: LLMClient = {
    async chat(messages) {
      // 实际生产中对接真实 LLM
      return { content: '这是一个 mock 响应' };
    },
  };

  const embeddingService: EmbeddingService = {
    dimensions: 256,
    async embed(text) {
      // 实际生产中对接真实 Embedding 服务
      return new Array(256).fill(0).map(() => Math.random() - 0.5);
    },
    async embedBatch(texts) {
      return Promise.all(texts.map(t => this.embed(t)));
    },
  };

  const tokenCounter = (text: string) => Math.ceil(text.length * 0.4);

  // 使用 mock 的分层存储（实际生产中使用 Redis + PostgreSQL）
  const mockBackend: TieredStorageBackend = {
    stores: new Map<string, Map<string, string>>([
      ['hot', new Map()], ['warm', new Map()], ['cold', new Map()],
    ]),
    async get(tier, key) { return this.stores.get(tier)?.get(key) ?? null; },
    async set(tier, key, value) { this.stores.get(tier)?.set(key, value); },
    async delete(tier, key) { this.stores.get(tier)?.delete(key); },
    async scan(tier, pattern, limit) {
      const keys = Array.from(this.stores.get(tier)?.keys() ?? []);
      return keys.slice(0, limit);
    },
  } as TieredStorageBackend;

  const tieredStorage = new TieredMemoryStorage(
    mockBackend,
    new JsonMemorySerializer()
  );

  const taskStorage: TaskMemoryStorage = {
    async save() {},
    async load() { return null; },
    async listByUser() { return []; },
  };

  const memory = new PersonalAssistantMemory({
    llmClient,
    embeddingService,
    tokenCounter,
    tieredStorage,
    taskStorage,
  });

  // ============== 会话 1: 建立用户偏好 ==============
  console.log('=== 会话 1: 用户表达技术偏好 ===');

  const session1 = await memory.startSession('user-alice', 'session-001');
  console.log('用户画像:', session1.userProfile);

  // 模拟对话
  const ctx1 = await memory.prepareContext(
    '我是一名后端开发工程师，主要使用 TypeScript 和 Go。我喜欢简洁的代码风格，请回答问题时直接给出要点。'
  );
  console.log('上下文消息数:', ctx1.length);

  await memory.recordTurn(
    '我是一名后端开发工程师，主要使用 TypeScript 和 Go。我喜欢简洁的代码风格，请回答问题时直接给出要点。',
    '收到！我记住了你的偏好。作为后端开发工程师，你使用 TypeScript 和 Go，偏好简洁的代码风格。以后我会直接给出要点，避免冗余内容。'
  );

  const endResult1 = await memory.endSession();
  console.log('会话 1 结束:', {
    extractedKnowledge: endResult1.extractedKnowledge,
    consolidated: endResult1.consolidationResult.consolidatedCount,
    profileUpdates: endResult1.profileUpdates,
  });

  // ============== 会话 2: 执行编码任务 ==============
  console.log('\n=== 会话 2: 用户请求编码帮助 ===');

  const session2 = await memory.startSession('user-alice', 'session-002');
  console.log('用户画像:', session2.userProfile);
  console.log('预加载记忆数:', session2.preloadedMemories);
  // 此时 Agent 应该已经知道用户偏好 TypeScript 和简洁风格

  const ctx2 = await memory.prepareContext(
    '帮我写一个函数，实现 LRU 缓存'
  );
  console.log('上下文消息数:', ctx2.length);
  // 上下文中应包含从会话 1 中提取的偏好信息

  await memory.recordTurn(
    '帮我写一个函数，实现 LRU 缓存',
    '这是一个简洁的 TypeScript LRU 缓存实现... （因为记忆中知道用户偏好 TypeScript 和简洁风格）'
  );

  const endResult2 = await memory.endSession();
  console.log('会话 2 结束:', {
    extractedKnowledge: endResult2.extractedKnowledge,
    consolidated: endResult2.consolidationResult.consolidatedCount,
  });

  // ============== 会话 3: 验证记忆保持 ==============
  console.log('\n=== 会话 3: 验证 Agent 的记忆 ===');

  const session3 = await memory.startSession('user-alice', 'session-003');
  console.log('用户画像:', session3.userProfile);
  console.log('预加载记忆数:', session3.preloadedMemories);

  const ctx3 = await memory.prepareContext(
    '你还记得我使用什么编程语言吗？'
  );

  // ctx3 中应包含:
  // 1. 从长期记忆检索到的 "用户主要使用 TypeScript 和 Go"
  // 2. 用户画像中的 technicalPreferences.programmingLanguages
  console.log('上下文中包含检索到的记忆 ✓');

  await memory.recordTurn(
    '你还记得我使用什么编程语言吗？',
    '当然记得！你主要使用 TypeScript 和 Go，是一名后端开发工程师。你喜欢简洁的代码风格。'
  );

  // 查看系统状态
  console.log('\n系统状态:', JSON.stringify(memory.getSystemStatus(), null, 2));

  await memory.endSession();
  console.log('\n示例完成：Agent 成功在跨会话间保持了用户记忆。');
}
```

> **关键观察**：在会话 3 中，即使用户没有重复自己的偏好，Agent 依然能够回忆起会话 1 中建立的信息。这就是长期记忆系统的价值——它让 Agent 从"每次重新开始的工具"变成了"了解你的助手"。

---

### 7.7.4 MemGPT 与 Letta：虚拟上下文管理范式

在前面的章节中，我们构建了一套完整的四层记忆架构。然而，业界还有另一种极具影响力的记忆管理范式——将 LLM 的上下文窗口视为**虚拟内存**，由模型自主决定何时换入换出信息。这一思想源自 MemGPT 论文（Packer et al., 2023），后来演化为开源框架 Letta。

#### 起源：从操作系统到 LLM 记忆

MemGPT 论文 *"MemGPT: Towards LLMs as Operating Systems"* 提出了一个关键洞察：LLM 的上下文窗口限制与计算机物理内存限制本质上是同一类问题。操作系统通过虚拟内存机制解决了物理内存不足的问题——同样的思路可以应用于 LLM：

```
┌─────────────────────────────────────────────────────┐
│              MemGPT 虚拟上下文架构                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│   操作系统类比              MemGPT 对应              │
│   ─────────────            ──────────               │
│   物理内存 (RAM)    ←→     主上下文 (Main Context)    │
│   ├─ 容量有限               ├─ 受 context window 限制 │
│   ├─ 访问速度快             ├─ 每次推理直接可见        │
│   └─ 需要换页管理           └─ 需要信息换入换出        │
│                                                     │
│   磁盘存储 (Disk)   ←→     外部存储 (External)       │
│   ├─ 容量无限               ├─ 向量数据库 / 持久存储   │
│   ├─ 访问较慢               ├─ 需要检索操作           │
│   └─ 持久化                 └─ 跨会话持久化           │
│                                                     │
│   页面调度器        ←→     LLM 自身（通过函数调用）    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

这一类比的精妙之处在于：传统操作系统由内核管理页面调度，而在 MemGPT 中，**LLM 自身就是调度器**——它通过函数调用（tool calls）来决定何时从外部存储读取信息、何时将信息写入持久化存储。

#### 三层记忆结构

MemGPT 将记忆组织为三个层次，每层具有不同的持久性和访问模式：

| 层次 | 位置 | 内容 | 访问方式 |
|------|------|------|----------|
| **Core Memory** | 始终在上下文中 | persona（Agent 人格）+ human（用户信息）块 | 直接读写，每次推理可见 |
| **Recall Memory** | 外部向量数据库 | 完整对话历史，按时间索引 | 通过 `conversation_search` 检索 |
| **Archival Memory** | 外部向量数据库 | 长期知识、文档、用户档案 | 通过 `archival_memory_search` 检索 |

**Core Memory** 是最关键的创新——它是一段始终存在于系统提示中的可编辑文本块。Agent 可以通过 `core_memory_append` 和 `core_memory_replace` 函数实时修改这段文本，相当于 Agent 拥有了一块"随身便签"。

#### 自主式记忆管理

与传统的 RAG 检索不同，MemGPT 的核心理念是**让 LLM 自主管理记忆**。系统为 LLM 提供一组记忆操作函数，LLM 在每次推理时决定是否调用：

```typescript
/**
 * MemGPT 风格的记忆管理器
 * 核心思想：LLM 通过 tool calls 自主管理三层记忆
 */
interface MemGPTStyleMemoryManager {
  // ===== Core Memory：始终在上下文中的可编辑块 =====

  /** 向 core memory 的指定块追加内容 */
  core_memory_append(params: {
    block: 'persona' | 'human';
    content: string;
  }): Promise<{ success: boolean; newLength: number }>;

  /** 替换 core memory 中的指定内容 */
  core_memory_replace(params: {
    block: 'persona' | 'human';
    oldContent: string;
    newContent: string;
  }): Promise<{ success: boolean }>;

  // ===== Recall Memory：对话历史搜索 =====

  /** 搜索历史对话记录 */
  conversation_search(params: {
    query: string;
    page?: number;
  }): Promise<{ results: ConversationEntry[]; totalPages: number }>;

  /** 按时间范围搜索对话 */
  conversation_search_date(params: {
    startDate: string;
    endDate: string;
    page?: number;
  }): Promise<{ results: ConversationEntry[]; totalPages: number }>;

  // ===== Archival Memory：长期知识存储 =====

  /** 向归档记忆中插入知识 */
  archival_memory_insert(params: {
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string }>;

  /** 搜索归档记忆 */
  archival_memory_search(params: {
    query: string;
    page?: number;
  }): Promise<{ results: ArchivalEntry[]; totalPages: number }>;
}

/** 对话记录条目 */
interface ConversationEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

/** 归档记忆条目 */
interface ArchivalEntry {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
```

在实际运行中，LLM 的每次响应都可以包含多个函数调用。例如，当用户提到自己换了新工作时，LLM 可能会：

1. 调用 `core_memory_replace` 更新 human 块中的职业信息
2. 调用 `archival_memory_insert` 将旧职业信息归档
3. 调用 `conversation_search` 查找之前关于工作的讨论
4. 最后生成回复

这种"先管理记忆，再回复用户"的模式让 Agent 能够主动维护自己的知识状态。

#### Letta 框架：从论文到生产

Letta（前身为 MemGPT 开源项目）是 MemGPT 思想的生产级实现，提供了完整的开发框架：

- **服务端架构**：提供 REST API 和 Python/TypeScript SDK，支持多用户多 Agent 部署
- **工具执行沙箱**：Agent 的函数调用在安全沙箱中执行，支持自定义工具
- **多 Agent 支持**：支持 Agent 间通信和协作，共享记忆空间
- **ADE（Agent Development Environment）**：可视化开发环境，便于调试记忆状态

#### 与本书四层记忆模型的对照

MemGPT 的三层结构与本书的四层架构存在清晰的映射关系，也有值得注意的差异：

| MemGPT 层次 | 本书对应层次 | 相似点 | 差异点 |
|-------------|-------------|--------|--------|
| Core Memory | L1 工作记忆 | 都在当前上下文中、容量受限 | MemGPT 允许 LLM 直接编辑；本书侧重优先级淘汰 |
| Recall Memory | L2 对话记忆 | 都存储对话历史、支持搜索 | MemGPT 强调分页检索；本书实现话题感知窗口 |
| Archival Memory | L4 长期记忆 | 都是持久化知识存储 | MemGPT 由 LLM 自主写入；本书通过巩固流水线自动提取 |
| （无直接对应） | L3 任务记忆 | — | 本书独有的任务执行轨迹层 |

两种范式各有优势：MemGPT 的自主管理方式赋予 Agent 更大的灵活性，适合需要深度个性化的长期对话场景；本书的四层架构则提供了更精细的工程控制，适合需要可观测性和可调试性的生产环境。在实践中，两种思路完全可以融合——例如在本书的 L1 工作记忆中引入 MemGPT 风格的可编辑 core memory 块，同时保留 L3 任务记忆的结构化追踪能力。

### 7.7.5 记忆管理平台对比

了解了记忆架构的设计原理和 MemGPT 的创新范式后，让我们看看当前主流的记忆管理平台。这些平台将记忆管理能力封装为开箱即用的服务，可以显著降低 Agent 记忆系统的开发成本。

#### 主流平台概览

| 平台 | 类型 | 核心特性 | 记忆层次 | 开源协议 | 适用场景 |
|------|------|----------|----------|----------|----------|
| **Mem0** | 记忆层 | 多级记忆（User/Session/Agent）、自动提取、Graph Memory | User + Session + Agent | MIT | 个性化助手、跨会话记忆 |
| **Zep** | 知识图谱 | Temporal Knowledge Graph、Graphiti 引擎、双时间建模 | Entity + Relation + Temporal | Apache 2.0 | 企业级 Agent、时间敏感记忆 |
| **Letta** | 虚拟上下文 | 自主内存管理、OS 级抽象、REST API | Core + Recall + Archival | Apache 2.0 | 长期对话、复杂人格 Agent |
| **LangMem** | 记忆工具 | 与 LangGraph 集成、记忆提取工具 | Semantic + Episodic | MIT | LangGraph 生态用户 |

#### 各平台深度解析

**Mem0** 是目前最受关注的记忆管理平台之一（GitHub 约 48K stars），由 Y Combinator S24 孵化。它的核心价值在于提供了开箱即用的多级记忆抽象——User 级记忆跨越所有会话持久存在，Session 级记忆跟踪单次对话上下文，Agent 级记忆维护 Agent 自身的知识和行为模式。Mem0 的 Graph Memory 功能基于知识图谱自动从对话中提取实体和关系，相比纯向量存储能更好地处理结构化知识和多跳推理。

**Zep** 的独特优势在于其 Graphiti 时序知识图谱引擎。传统记忆系统往往忽略信息的时间维度——当用户说"我搬到了上海"时，系统需要知道这是最新事实，而之前"住在北京"的记录应被标记为历史状态而非删除。Zep 通过双时间建模（事实有效时间 + 系统记录时间）优雅地解决了这一问题。这使得 Zep 特别适合企业场景中需要追踪事实变迁的 Agent 应用。

**Letta** 如上一节所述，是 MemGPT 论文的生产级演进。它的独特之处在于 OS 风格的内存管理抽象——让 LLM 自主决定记忆的读写和调度，而非依赖预设的检索规则。这种设计在需要深度个性化和长期角色扮演的场景中表现出色，Agent 能够像人类一样主动"记住"和"回忆"信息。

**LangMem** 是 LangChain 生态中的记忆解决方案，与 LangGraph 状态管理深度集成。它将记忆能力封装为可组合的工具节点，支持语义记忆（事实和知识）和情景记忆（具体经历）的提取与检索。对于已经在使用 LangGraph 构建 Agent 的团队，LangMem 提供了最低摩擦的记忆集成路径。

#### 如何选择记忆管理方案

在选择具体方案时，建议基于以下维度进行评估：

1. **记忆复杂度需求**：如果只需简单的用户偏好记忆，Mem0 的多级抽象足够优雅；如果涉及复杂的事实变迁和时间推理，Zep 的时序图谱更为合适；如果需要 Agent 具备深度自主记忆能力，Letta 的虚拟上下文范式值得考虑。

2. **技术栈匹配**：已使用 LangGraph 的团队可优先评估 LangMem；追求框架无关性的团队可选择 Mem0 或 Zep 的独立 API；需要完整 Agent 框架的团队可考虑 Letta 的全栈方案。

3. **部署与合规要求**：上述平台均为开源，支持私有化部署。但在企业级场景中需关注数据隔离、审计日志、GDPR 合规等能力的成熟度。Zep 和 Mem0 在企业功能上相对完善。

4. **自建 vs 采用**：本章所构建的四层记忆架构提供了完整的自建方案，适合对记忆行为有精细控制需求的团队。而上述平台提供了更快的启动速度和更低的维护成本。在实际工程中，混合方案往往是最佳选择——使用平台处理通用记忆能力，同时自建特定领域的记忆逻辑。


## 7.8 本章小结

本章系统地构建了 Agent 的记忆架构——从认知科学的启发到工程实现的每一个细节。让我们回顾核心要点：

### 架构层次

| 层级 | 组件 | 核心职责 | 关键技术 |
|------|------|----------|----------|
| L1 | PriorityWorkingMemory | 当前推理上下文管理 | 优先级淘汰、注意力权重、利用率监控 |
| L2 | SmartWindowConversationMemory | 会话历史管理 | 话题感知滑动窗口、多策略摘要、搜索索引 |
| L3 | TaskMemoryManager | 任务执行轨迹记录 | 依赖管理、检查点集成、报告导出 |
| L4 | LongTermMemoryStore | 跨会话知识持久化 | 多后端存储、语义去重、重要度衰减 |

### 关键设计原则

1. **层次化管理**：不同类型的信息有不同的生命周期和访问模式，用分层架构匹配不同需求。

2. **主动巩固**：记忆不应只是被动存储——需要主动提取知识、发现关联、解决冲突。MemoryConsolidator 和 SleepConsolidation 实现了类人的记忆整理过程。

3. **智能遗忘**：无限增长的记忆库终将不可维护。基于 Ebbinghaus 遗忘曲线和间隔重复的遗忘机制确保记忆库保持精简高效。

4. **混合检索**：单一的检索方式都有盲区。HybridMemoryRetriever 结合向量相似度、关键词匹配、时间近因和重要度评分，实现全面精准的记忆检索。

5. **隐私优先**：记忆中不可避免地包含用户个人信息。PIIDetector 和 PrivacyCompliantStorage 从设计上保证数据隐私合规。

6. **渐进式画像**：UserProfileBuilder 不要求用户主动告知偏好，而是从每次交互中自动学习和更新，让 Agent 越用越懂你。

### 性能基准参考

| 操作 | 目标延迟 | 关键优化手段 |
|------|----------|------------|
| 工作记忆构建 | < 5ms | 内存操作，预计算注意力权重 |
| 对话记忆添加 | < 10ms | 增量索引更新 |
| 长期记忆检索 (10条) | < 100ms | 向量索引 + 缓存预热 |
| 记忆巩固（单次会话） | < 5s | 批量处理，异步写入 |
| GC 单次运行 | < 30s | 分批扫描，后台运行 |

### 与其他章节的关联

```
第四章 (状态与检查点)  ─────────→  L3 任务记忆的检查点集成
第五章 (上下文工程)    ─────────→  上下文组装过程与 L1 工作记忆交互
第六章 (工具系统设计)  ─────────→  工具调用结果进入 L1 工作记忆，L3 缓存工具输出
第八章 (RAG 知识工程)  ←─────────  RAG 检索结果注入 L4 长期语义记忆
第九章 (Multi-Agent)   ←─────────  共享记忆层实现多 Agent 间信息共享
```

> **下一步**：在第八章中，我们将探讨 RAG 与知识工程——如何通过检索增强生成为 Agent 提供外部知识访问能力。RAG 检索的结果将注入本章的记忆体系，而 MemoryConflictResolver 和 EntityCentricMemory 将为知识去重与冲突解决提供基础。

---

**本章核心代码清单**

| 类/接口 | 所在章节 | 用途 |
|---------|---------|------|
| `TokenBudgetPlanner` | 7.1.5 | Token 预算规划 |
| `PriorityWorkingMemory` | 7.2.1 | 优先级工作记忆管理 |
| `WorkingMemoryProfiler` | 7.2.1 | 工作记忆性能分析 |
| `SmartWindowConversationMemory` | 7.2.2 | 智能窗口对话记忆 |
| `TopicBoundaryDetector` | 7.2.2 | 话题边界检测 |
| `ConversationSummarizer` | 7.2.2 | 多策略对话摘要 |
| `ConversationIndex` | 7.2.2 | 对话搜索索引 |
| `TaskMemoryManager` | 7.2.3 | 任务记忆管理 |
| `TaskMemoryExporter` | 7.2.3 | 任务报告导出 |
| `VectorMemoryStore` | 7.2.4 | 向量存储后端 |
| `GraphMemoryStore` | 7.2.4 | 图存储后端 |
| `MemoryImportanceScorer` | 7.2.4 | 重要度评分 |
| `SemanticDeduplicator` | 7.2.4 | 语义去重 |
| `LongTermMemoryStore` | 7.2.4 | 长期记忆门面 |
| `MemoryConsolidator` | 7.3.1 | 记忆巩固 |
| `SpacedRepetitionScheduler` | 7.3.2 | 间隔重复调度 |
| `SleepConsolidation` | 7.3.3 | 睡眠式批量巩固 |
| `MemoryGarbageCollector` | 7.3.4 | 记忆垃圾回收 |
| `ForgettingCurveManager` | 7.3.5 | 遗忘曲线管理 |
| `SemanticMemoryExtractor` | 7.4.1 | 语义知识提取 |
| `EntityCentricMemory` | 7.4.2 | 实体中心记忆 |
| `MemoryConflictResolver` | 7.4.3 | 记忆冲突解决 |
| `UserProfileBuilder` | 7.4.4 | 用户画像构建 |
| `HybridMemoryRetriever` | 7.5.1 | 混合记忆检索 |
| `MemoryQueryPlanner` | 7.5.2 | 查询规划 |
| `ContextualReranker` | 7.5.3 | 上下文重排序 |
| `RetrievalEvaluator` | 7.5.4 | 检索质量评估 |
| `TieredMemoryStorage` | 7.6.1 | 分层记忆存储 |
| `PIIDetector` | 7.6.3 | PII 检测 |
| `PrivacyCompliantStorage` | 7.6.3 | 隐私合规存储 |
| `MemoryMigrationManager` | 7.6.4 | 记忆 Schema 迁移 |
| `PersonalAssistantMemory` | 7.7.2 | 完整个人助理记忆系统 |
