# 第 10 章 编排模式 — 九种经典 Multi-Agent 架构

> **"单个 Agent 是工匠，编排模式才是流水线。"**
>
> 当任务复杂度超越单 Agent 能力边界时，我们需要将多个 Agent 组织成协作系统。
> 本章系统介绍九种经典 Multi-Agent 编排模式，每种模式都有明确的适用场景、
> 拓扑结构和 TypeScript 生产级实现。掌握这些模式后，你可以像搭积木一样
> 组合出任意复杂度的 Agent 系统。

---

## 10.1 模式总览

### 10.1.1 九种模式对比表

| # | 模式名称 | 拓扑 | 典型 Agent 数 | 最大推荐 Agent 数 | 通信开销 | 容错性 | 实现难度 | 最佳场景 |
|---|---------|------|-------------|-----------------|---------|-------|---------|---------|
| 1 | **Coordinator** 协调者 | 星形 | 3–8 | 15 | 中 | 中 | ★★☆ | 异构子任务分发 |
| 2 | **Sequential Pipeline** 流水线 | 链式 | 3–6 | 10 | 低 | 低 | ★☆☆ | 确定性多步处理 |
| 3 | **Fan-Out/Gather** 扇出聚合 | 扇形 | 3–10 | 50 | 高 | 高 | ★★☆ | 同类任务并行化 |
| 4 | **Generator-Critic** 生成-批评 | 环形 | 2–4 | 6 | 中 | 中 | ★★☆ | 质量迭代优化 |
| 5 | **Debate** 辩论 | 全连接 | 2–5 | 8 | 高 | 高 | ★★★ | 多视角决策 |
| 6 | **Hierarchical** 层级 | 树形 | 5–20 | 100+ | 中 | 高 | ★★★ | 大规模任务分解 |
| 7 | **Mixture of Agents** 混合 | 分层 | 4–12 | 30 | 高 | 高 | ★★★ | 质量最大化 |
| 8 | **模式组合** 嵌套 | 复合 | 视具体情况 | — | — | — | ★★★★ | 复杂业务系统 |
| 9 | **自定义** | 自由 | 任意 | — | — | — | ★★★★★ | 特殊需求 |

### 10.1.2 拓扑结构图

以下 ASCII 图展示了每种模式的核心拓扑：

```
┌──────────────────────────────────────────────────────────────────────┐
│  ① Coordinator 协调者模式（星形）                                      │
│                                                                      │
│              ┌────────────┐                                          │
│              │ Coordinator │                                          │
│              └─────┬──────┘                                          │
│            ┌───────┼───────┐                                         │
│            ▼       ▼       ▼                                         │
│       ┌────────┐┌────────┐┌────────┐                                │
│       │Agent A ││Agent B ││Agent C │                                │
│       └────────┘└────────┘└────────┘                                │
│                                                                      │
│  ② Sequential Pipeline 流水线模式（链式）                              │
│                                                                      │
│   ┌─────┐   ┌─────┐   ┌─────┐   ┌─────┐                            │
│   │ S1  │──▶│ S2  │──▶│ S3  │──▶│ S4  │                            │
│   └─────┘   └─────┘   └─────┘   └─────┘                            │
│                                                                      │
│  ③ Fan-Out/Gather 扇出聚合模式（扇形）                                │
│                                                                      │
│              ┌───────────┐                                           │
│              │ Dispatcher │                                           │
│              └─────┬─────┘                                           │
│         ┌──────┬───┴───┬──────┐                                     │
│         ▼      ▼       ▼      ▼                                     │
│       ┌───┐  ┌───┐  ┌───┐  ┌───┐                                   │
│       │W1 │  │W2 │  │W3 │  │W4 │                                   │
│       └─┬─┘  └─┬─┘  └─┬─┘  └─┬─┘                                   │
│         └──────┴───┬───┴──────┘                                     │
│              ┌─────┴─────┐                                           │
│              │ Aggregator │                                           │
│              └───────────┘                                           │
│                                                                      │
│  ④ Generator-Critic 生成-批评模式（环形）                              │
│                                                                      │
│       ┌───────────┐  draft  ┌──────────┐                            │
│       │ Generator  │───────▶│  Critic   │                            │
│       └─────▲─────┘        └────┬─────┘                             │
│             │    feedback       │                                     │
│             └───────────────────┘                                    │
│                                                                      │
│  ⑤ Debate 辩论模式（全连接 + 裁判）                                    │
│                                                                      │
│       ┌────────┐◄──────▶┌────────┐                                  │
│       │Debater1│        │Debater2│                                  │
│       └───┬────┘        └───┬────┘                                  │
│           └────────┬────────┘                                        │
│              ┌─────▼─────┐                                           │
│              │   Judge    │                                           │
│              └───────────┘                                           │
│                                                                      │
│  ⑥ Hierarchical 层级模式（树形）                                       │
│                                                                      │
│              ┌──────────┐                                            │
│              │  Manager  │                                            │
│              └────┬─────┘                                            │
│           ┌───────┼───────┐                                          │
│           ▼       ▼       ▼                                          │
│     ┌─────────┐┌──────┐┌──────┐                                    │
│     │SubMgr A ││Wkr B ││Wkr C │                                    │
│     └────┬────┘└──────┘└──────┘                                    │
│      ┌───┼───┐                                                      │
│      ▼   ▼   ▼                                                      │
│   ┌───┐┌───┐┌───┐                                                  │
│   │W1 ││W2 ││W3 │                                                  │
│   └───┘└───┘└───┘                                                  │
│                                                                      │
│  ⑦ Mixture of Agents 混合模式（分层）                                  │
│                                                                      │
│   Layer 0:  [Proposer₁] [Proposer₂] [Proposer₃]                    │
│                  │            │            │                          │
│                  └────────────┼────────────┘                         │
│                         ┌────▼────┐                                  │
│   Layer 1:              │Aggregator│                                  │
│                         └────┬────┘                                  │
│                  ┌───────────┼───────────┐                           │
│   Layer 2:  [Refiner₁] [Refiner₂] [Refiner₃]                      │
│                  │            │            │                          │
│                  └────────────┼────────────┘                         │
│                     ┌────────▼────────┐                              │
│   Layer 3:          │Final Aggregator │                              │
│                     └─────────────────┘                              │
└──────────────────────────────────────────────────────────────────────┘
```

### 10.1.3 模式组合指南

在实际生产系统中，很少只使用单一模式。以下是常见的组合策略：

| 外层模式 | 内层模式 | 组合效果 | 典型应用 |
|---------|---------|---------|---------|
| Coordinator | Fan-Out/Gather | 协调者将任务分发后，每个子任务再并行处理 | 多语言翻译审校 |
| Pipeline | Generator-Critic | 流水线中某个阶段使用生成-批评循环 | 内容生产流水线 |
| Hierarchical | Pipeline | 每个子管理者内部使用流水线处理 | 企业级文档处理 |
| Fan-Out/Gather | Debate | 收集多个结果后，通过辩论决定最终方案 | 方案评选 |
| Coordinator | Hierarchical | 顶层协调，子任务内部有层级管理 | 大型项目管理 |

### 10.1.4 基础类型定义

在深入各模式之前，先定义整章通用的基础类型：

```typescript
/** 第 10 章通用类型定义 */

// Agent 基础消息结构
interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
}

// Agent 执行结果
interface AgentResult {
  success: boolean;
  output: string;
  agentId: string;
  durationMs: number;
  tokenUsage?: { prompt: number; completion: number; total: number };
  metadata?: Record<string, unknown>;
}

// Agent 能力描述
interface AgentCapability {
  name: string;            // 能力名称，如 "code_review"
  description: string;     // 能力描述
  confidence: number;      // 自信度 0-1
  tags: string[];          // 标签，用于匹配
}

// 通用 Agent 接口
interface IAgent {
  readonly id: string;
  readonly name: string;
  readonly capabilities: AgentCapability[];
  execute(input: string, context?: Record<string, unknown>): Promise<AgentResult>;
}

// LLM 调用接口（抽象层，可接入 OpenAI / Anthropic / 本地模型）
interface LLMClient {
  chat(messages: AgentMessage[], options?: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: 'text' | 'json';
  }): Promise<string>;
}

// 执行指标
interface ExecutionMetrics {
  totalDurationMs: number;
  agentDurations: Record<string, number>;
  totalTokens: number;
  retryCount: number;
  errorCount: number;
}

// 重试策略
interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

// 通用重试工具函数
async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy,
  label: string = 'operation'
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < policy.maxRetries) {
        const delay = Math.min(
          policy.baseDelayMs * Math.pow(policy.backoffMultiplier, attempt),
          policy.maxDelayMs
        );
        console.warn(
          `[${label}] 第 ${attempt + 1} 次重试，等待 ${delay}ms: ${lastError.message}`
        );
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw new Error(`[${label}] 超过最大重试次数 ${policy.maxRetries}: ${lastError?.message}`);
}
```

---

## 10.2 Coordinator 协调者模式

### 10.2.1 模式概述

Coordinator（协调者）模式是最直觉的 Multi-Agent 架构：一个中心节点接收任务，
将其分解为子任务，分配给专家 Agent 处理，最后整合结果。它类似于团队 leader
分配工作。

**核心思想**：集中式决策 + 分布式执行。

**适用场景**：
- 任务可以明确分解为若干异构子任务
- 需要一个"大脑"来决定分工策略
- 各子任务之间相对独立
- 子任务类型在设计时不完全确定

**不适用场景**：
- 任务之间有严格的顺序依赖 → 用 Pipeline
- 子任务完全同构 → 用 Fan-Out/Gather
- 需要对抗性审查 → 用 Generator-Critic 或 Debate

### 10.2.2 基础 Coordinator 实现

```typescript
/**
 * 基础协调者 Agent
 * 使用 LLM 进行任务分解，将子任务分配给专家 Agent，整合最终结果
 */
class CoordinatorAgent {
  constructor(
    private readonly llm: LLMClient,
    private readonly specialists: Map<string, IAgent>,
    private readonly config: {
      maxSubTasks: number;           // 最大子任务数
      timeoutMs: number;             // 总超时
      requireAllSuccess: boolean;    // 是否要求所有子任务成功
    } = { maxSubTasks: 10, timeoutMs: 60_000, requireAllSuccess: false }
  ) {}

  /** 主入口：接收任务，返回整合结果 */
  async orchestrate(task: string): Promise<{
    finalAnswer: string;
    subResults: AgentResult[];
    metrics: ExecutionMetrics;
  }> {
    const startTime = Date.now();
    const metrics: ExecutionMetrics = {
      totalDurationMs: 0,
      agentDurations: {},
      totalTokens: 0,
      retryCount: 0,
      errorCount: 0,
    };

    // 第 1 步：使用 LLM 分解任务
    const decomposition = await this.decomposeTask(task);
    console.log(`[Coordinator] 分解为 ${decomposition.subTasks.length} 个子任务`);

    // 第 2 步：为每个子任务匹配专家
    const assignments = this.assignSpecialists(decomposition.subTasks);

    // 第 3 步：并行执行所有子任务（带超时）
    const subResults = await this.executeWithTimeout(assignments, metrics);

    // 第 4 步：验证结果质量
    const validatedResults = await this.validateResults(
      task, decomposition.subTasks, subResults
    );

    // 第 5 步：整合最终答案
    const finalAnswer = await this.synthesize(task, validatedResults);

    metrics.totalDurationMs = Date.now() - startTime;
    return { finalAnswer, subResults: validatedResults, metrics };
  }

  /** 使用 LLM 分解任务为子任务 */
  private async decomposeTask(task: string): Promise<{
    subTasks: Array<{
      id: string;
      description: string;
      requiredCapability: string;
      priority: 'high' | 'medium' | 'low';
    }>;
    reasoning: string;
  }> {
    const specialistList = Array.from(this.specialists.entries())
      .map(([id, agent]) => ({
        id,
        name: agent.name,
        capabilities: agent.capabilities.map(c => c.name),
      }));

    const prompt = `你是一个任务分解专家。请分析以下任务并将其分解为子任务。

可用的专家 Agent：
${JSON.stringify(specialistList, null, 2)}

任务：${task}

请以 JSON 格式返回：
{
  "reasoning": "分解思路说明",
  "subTasks": [
    {
      "id": "sub_1",
      "description": "子任务描述",
      "requiredCapability": "对应的专家能力名称",
      "priority": "high | medium | low"
    }
  ]
}

规则：
1. 子任务数量不超过 ${this.config.maxSubTasks}
2. 每个子任务应该能被单个专家独立完成
3. 尽量减少子任务之间的依赖
4. requiredCapability 必须是可用专家的能力之一`;

    const response = await this.llm.chat(
      [{ role: 'user', content: prompt }],
      { responseFormat: 'json', temperature: 0.2 }
    );

    try {
      return JSON.parse(response);
    } catch {
      throw new Error(`[Coordinator] LLM 返回的任务分解结果无法解析: ${response}`);
    }
  }

  /** 为子任务分配最合适的专家 */
  private assignSpecialists(
    subTasks: Array<{ id: string; description: string; requiredCapability: string }>
  ): Array<{
    subTask: { id: string; description: string };
    specialist: IAgent;
  }> {
    return subTasks.map(sub => {
      // 在所有专家中寻找拥有匹配能力且自信度最高的
      let bestMatch: { agent: IAgent; confidence: number } | null = null;

      for (const [, agent] of this.specialists) {
        const capability = agent.capabilities.find(
          c => c.name === sub.requiredCapability
        );
        if (capability && (!bestMatch || capability.confidence > bestMatch.confidence)) {
          bestMatch = { agent, confidence: capability.confidence };
        }
      }

      if (!bestMatch) {
        throw new Error(
          `[Coordinator] 无法为子任务 "${sub.id}" 找到具备 ` +
          `"${sub.requiredCapability}" 能力的专家`
        );
      }

      return {
        subTask: { id: sub.id, description: sub.description },
        specialist: bestMatch.agent,
      };
    });
  }

  /** 带超时的并行执行 */
  private async executeWithTimeout(
    assignments: Array<{
      subTask: { id: string; description: string };
      specialist: IAgent;
    }>,
    metrics: ExecutionMetrics
  ): Promise<AgentResult[]> {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Coordinator 总超时')), this.config.timeoutMs)
    );

    const executionPromises = assignments.map(async ({ subTask, specialist }) => {
      const start = Date.now();
      try {
        const result = await specialist.execute(subTask.description);
        metrics.agentDurations[specialist.id] = Date.now() - start;
        if (result.tokenUsage) {
          metrics.totalTokens += result.tokenUsage.total;
        }
        return result;
      } catch (err) {
        metrics.errorCount++;
        return {
          success: false,
          output: `执行失败: ${err instanceof Error ? err.message : String(err)}`,
          agentId: specialist.id,
          durationMs: Date.now() - start,
        } satisfies AgentResult;
      }
    });

    const results = await Promise.race([
      Promise.all(executionPromises),
      timeoutPromise,
    ]);

    // 检查是否要求所有子任务成功
    if (this.config.requireAllSuccess) {
      const failures = results.filter(r => !r.success);
      if (failures.length > 0) {
        throw new Error(
          `[Coordinator] ${failures.length} 个子任务失败: ` +
          failures.map(f => `${f.agentId}: ${f.output}`).join('; ')
        );
      }
    }

    return results;
  }

  /** 验证子任务结果质量 */
  private async validateResults(
    originalTask: string,
    subTasks: Array<{ id: string; description: string }>,
    results: AgentResult[]
  ): Promise<AgentResult[]> {
    const validationPrompt = `请验证以下子任务执行结果是否满足原始任务要求。

原始任务：${originalTask}

子任务及其结果：
${subTasks.map((st, i) => `
子任务 ${st.id}: ${st.description}
结果: ${results[i].success ? results[i].output : '(失败)'}
`).join('\n')}

请以 JSON 返回每个子任务结果的质量评估：
{
  "validations": [
    {
      "subTaskId": "sub_1",
      "isAcceptable": true,
      "reason": "结果质量合格的原因"
    }
  ]
}`;

    const response = await this.llm.chat(
      [{ role: 'user', content: validationPrompt }],
      { responseFormat: 'json', temperature: 0.1 }
    );

    try {
      const validation = JSON.parse(response);
      // 标记不合格的结果
      for (const v of validation.validations) {
        if (!v.isAcceptable) {
          const idx = subTasks.findIndex(st => st.id === v.subTaskId);
          if (idx >= 0) {
            results[idx].metadata = {
              ...results[idx].metadata,
              validationFailed: true,
              validationReason: v.reason,
            };
          }
        }
      }
      return results;
    } catch {
      // 验证解析失败时，保守地返回原结果
      console.warn('[Coordinator] 结果验证解析失败，跳过验证');
      return results;
    }
  }

  /** 整合所有子任务结果为最终答案 */
  private async synthesize(task: string, results: AgentResult[]): Promise<string> {
    const successfulResults = results.filter(r => r.success);

    const prompt = `请基于以下子任务结果，为原始任务生成完整的最终答案。

原始任务：${task}

各子任务结果：
${successfulResults.map(r => `[${r.agentId}]: ${r.output}`).join('\n\n')}

请综合所有结果，生成一个连贯、完整的最终答案。`;

    return this.llm.chat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.3 }
    );
  }
}
```

### 10.2.3 带记忆的高级 Coordinator

在实际系统中，Coordinator 应当记住哪些专家在特定任务上表现更好，
逐步优化分配策略：

```typescript
/**
 * 带历史记忆的协调者
 * 记录每个专家在不同任务类型上的表现，优化后续分配
 */
interface SpecialistPerformanceRecord {
  agentId: string;
  capability: string;
  successRate: number;      // 成功率
  avgDurationMs: number;    // 平均耗时
  avgQualityScore: number;  // 平均质量分（0-1）
  totalExecutions: number;  // 总执行次数
}

class CoordinatorWithMemory {
  private performanceLog: Map<string, SpecialistPerformanceRecord> = new Map();

  constructor(
    private readonly llm: LLMClient,
    private readonly specialists: Map<string, IAgent>
  ) {}

  /** 记录一次执行表现 */
  recordPerformance(
    agentId: string,
    capability: string,
    success: boolean,
    durationMs: number,
    qualityScore: number
  ): void {
    const key = `${agentId}:${capability}`;
    const existing = this.performanceLog.get(key) ?? {
      agentId,
      capability,
      successRate: 0,
      avgDurationMs: 0,
      avgQualityScore: 0,
      totalExecutions: 0,
    };

    const n = existing.totalExecutions;
    const newN = n + 1;

    // 增量更新统计值（在线均值算法）
    existing.successRate = (existing.successRate * n + (success ? 1 : 0)) / newN;
    existing.avgDurationMs = (existing.avgDurationMs * n + durationMs) / newN;
    existing.avgQualityScore = (existing.avgQualityScore * n + qualityScore) / newN;
    existing.totalExecutions = newN;

    this.performanceLog.set(key, existing);
  }

  /** 基于历史表现选择最佳专家 */
  selectBestSpecialist(
    capability: string,
    candidates: IAgent[]
  ): IAgent {
    let bestScore = -1;
    let bestAgent = candidates[0];

    for (const agent of candidates) {
      const key = `${agent.id}:${capability}`;
      const record = this.performanceLog.get(key);

      if (!record) {
        // 没有历史记录的 Agent 给一个中等分数，鼓励探索
        const explorationScore = 0.5;
        if (explorationScore > bestScore) {
          bestScore = explorationScore;
          bestAgent = agent;
        }
        continue;
      }

      // 综合得分 = 成功率 * 0.4 + 质量分 * 0.4 + 速度分 * 0.2
      const speedScore = 1 - Math.min(record.avgDurationMs / 30_000, 1);
      const compositeScore =
        record.successRate * 0.4 +
        record.avgQualityScore * 0.4 +
        speedScore * 0.2;

      if (compositeScore > bestScore) {
        bestScore = compositeScore;
        bestAgent = agent;
      }
    }

    console.log(
      `[CoordinatorMemory] 为能力 "${capability}" 选择了 ${bestAgent.id}` +
      `（综合得分 ${bestScore.toFixed(3)}）`
    );
    return bestAgent;
  }

  /** 获取表现报告 */
  getPerformanceReport(): SpecialistPerformanceRecord[] {
    return Array.from(this.performanceLog.values())
      .sort((a, b) => b.avgQualityScore - a.avgQualityScore);
  }
}
```

### 10.2.4 错误处理：分解失败的应对

当 Coordinator 的任务分解出现错误时，需要有降级策略：

```typescript
/**
 * 健壮的任务分解器，带降级策略
 */
class RobustTaskDecomposer {
  constructor(
    private readonly llm: LLMClient,
    private readonly config: {
      maxDecompositionRetries: number;
      fallbackToSingleAgent: boolean;
    }
  ) {}

  async decompose(
    task: string,
    availableCapabilities: string[]
  ): Promise<{
    subTasks: Array<{ id: string; description: string; capability: string }>;
    strategy: 'decomposed' | 'single_agent_fallback';
  }> {
    // 策略 1：正常 LLM 分解
    for (let attempt = 0; attempt < this.config.maxDecompositionRetries; attempt++) {
      try {
        const result = await this.llmDecompose(task, availableCapabilities);
        // 验证分解结果的合理性
        if (this.isValidDecomposition(result, availableCapabilities)) {
          return { subTasks: result, strategy: 'decomposed' };
        }
        console.warn(`[Decomposer] 第 ${attempt + 1} 次分解结果不合理，重试`);
      } catch (err) {
        console.warn(`[Decomposer] 分解失败: ${err}`);
      }
    }

    // 策略 2：降级为单 Agent 处理
    if (this.config.fallbackToSingleAgent) {
      console.warn('[Decomposer] 分解失败，降级为单 Agent 处理');
      return {
        subTasks: [{
          id: 'fallback_single',
          description: task,  // 原任务直接发给最通用的 Agent
          capability: this.findMostGeneralCapability(availableCapabilities),
        }],
        strategy: 'single_agent_fallback',
      };
    }

    throw new Error('[Decomposer] 任务分解彻底失败且无降级策略');
  }

  /** 验证分解结果是否合理 */
  private isValidDecomposition(
    subTasks: Array<{ capability: string }>,
    available: string[]
  ): boolean {
    // 每个子任务的 capability 必须在可用列表中
    return subTasks.every(st => available.includes(st.capability))
      && subTasks.length > 0
      && subTasks.length <= 15;
  }

  /** 找到最通用的能力（用于降级） */
  private findMostGeneralCapability(capabilities: string[]): string {
    // 优先选择名称包含 "general" 或 "default" 的能力
    const general = capabilities.find(
      c => c.includes('general') || c.includes('default')
    );
    return general ?? capabilities[0];
  }

  private async llmDecompose(
    task: string,
    capabilities: string[]
  ): Promise<Array<{ id: string; description: string; capability: string }>> {
    const response = await this.llm.chat([{
      role: 'user',
      content: `将任务分解为子任务。可用能力: ${capabilities.join(', ')}。
任务: ${task}
返回 JSON 数组: [{"id":"sub_1","description":"...","capability":"..."}]`,
    }], { responseFormat: 'json', temperature: 0.2 });

    return JSON.parse(response);
  }
}
```

---

## 10.3 Sequential Pipeline 流水线模式

### 10.3.1 模式概述

Pipeline（流水线）模式将处理过程组织为一系列有序的阶段（Stage），
数据从第一个阶段流向最后一个阶段，每个阶段的输出作为下一个阶段的输入。

**核心思想**：确定性的顺序处理，关注点分离。

**适用场景**：
- 任务有明确的先后步骤（如：提取 → 翻译 → 校对 → 排版）
- 每个阶段可以独立开发和测试
- 数据在各阶段间有清晰的类型转换
- 需要监控每个阶段的性能

**不适用场景**：
- 处理步骤之间没有顺序依赖 → 用 Fan-Out/Gather
- 步骤之间需要大量反复迭代 → 用 Generator-Critic
- 处理逻辑高度动态 → 用 Coordinator

### 10.3.2 类型安全的流水线

```typescript
/**
 * 类型安全的流水线构建器
 * 利用 TypeScript 的泛型链式传递，确保阶段间类型匹配
 */

// 流水线阶段接口
interface PipelineStage<TIn, TOut> {
  readonly name: string;
  readonly retryPolicy?: RetryPolicy;
  process(input: TIn, context: PipelineContext): Promise<TOut>;
}

// 流水线上下文（跨阶段共享信息）
interface PipelineContext {
  readonly pipelineId: string;
  readonly startTime: number;
  readonly metadata: Map<string, unknown>;
  addMetric(stageName: string, key: string, value: number): void;
}

// 阶段执行报告
interface StageReport {
  stageName: string;
  durationMs: number;
  success: boolean;
  retries: number;
  error?: string;
  metrics?: Record<string, number>;
}

// 流水线执行报告
interface PipelineReport {
  pipelineId: string;
  totalDurationMs: number;
  stages: StageReport[];
  bottleneck: string;         // 耗时最长的阶段
  success: boolean;
}

/**
 * 类型安全的流水线构建器
 * 通过泛型链式调用，确保类型在编译时匹配
 */
class TypedPipeline<TInput, TCurrent> {
  private stages: Array<{
    stage: PipelineStage<any, any>;
    retryPolicy?: RetryPolicy;
  }> = [];

  private constructor(
    private readonly name: string,
    stages: Array<{ stage: PipelineStage<any, any>; retryPolicy?: RetryPolicy }>
  ) {
    this.stages = stages;
  }

  /** 创建流水线起点 */
  static create<T>(name: string): TypedPipeline<T, T> {
    return new TypedPipeline<T, T>(name, []);
  }

  /** 添加一个处理阶段——泛型确保类型衔接 */
  pipe<TNext>(
    stage: PipelineStage<TCurrent, TNext>,
    retryPolicy?: RetryPolicy
  ): TypedPipeline<TInput, TNext> {
    return new TypedPipeline<TInput, TNext>(
      this.name,
      [...this.stages, { stage, retryPolicy: retryPolicy ?? stage.retryPolicy }]
    );
  }

  /** 执行整个流水线 */
  async execute(input: TInput): Promise<{
    output: TCurrent;
    report: PipelineReport;
  }> {
    const pipelineId = `pipeline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();
    const metricsMap = new Map<string, Record<string, number>>();

    const context: PipelineContext = {
      pipelineId,
      startTime,
      metadata: new Map(),
      addMetric(stageName, key, value) {
        const stageMetrics = metricsMap.get(stageName) ?? {};
        stageMetrics[key] = value;
        metricsMap.set(stageName, stageMetrics);
      },
    };

    const stageReports: StageReport[] = [];
    let current: unknown = input;

    for (const { stage, retryPolicy } of this.stages) {
      const stageStart = Date.now();
      let retries = 0;
      let lastError: Error | undefined;

      const maxAttempts = retryPolicy ? retryPolicy.maxRetries + 1 : 1;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          current = await stage.process(current, context);
          lastError = undefined;
          break;
        } catch (err) {
          retries = attempt + 1;
          lastError = err instanceof Error ? err : new Error(String(err));
          if (retryPolicy && attempt < retryPolicy.maxRetries) {
            const delay = Math.min(
              retryPolicy.baseDelayMs * Math.pow(retryPolicy.backoffMultiplier, attempt),
              retryPolicy.maxDelayMs
            );
            console.warn(
              `[Pipeline:${stage.name}] 重试 ${retries}/${retryPolicy.maxRetries}，` +
              `等待 ${delay}ms`
            );
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }

      const stageReport: StageReport = {
        stageName: stage.name,
        durationMs: Date.now() - stageStart,
        success: !lastError,
        retries,
        error: lastError?.message,
        metrics: metricsMap.get(stage.name),
      };
      stageReports.push(stageReport);

      if (lastError) {
        // 阶段失败，整个流水线中断
        return {
          output: current as TCurrent,
          report: {
            pipelineId,
            totalDurationMs: Date.now() - startTime,
            stages: stageReports,
            bottleneck: this.findBottleneck(stageReports),
            success: false,
          },
        };
      }
    }

    return {
      output: current as TCurrent,
      report: {
        pipelineId,
        totalDurationMs: Date.now() - startTime,
        stages: stageReports,
        bottleneck: this.findBottleneck(stageReports),
        success: true,
      },
    };
  }

  /** 找出耗时最长的阶段 */
  private findBottleneck(reports: StageReport[]): string {
    if (reports.length === 0) return 'none';
    return reports.reduce((a, b) => (a.durationMs > b.durationMs ? a : b)).stageName;
  }
}
```

### 10.3.3 条件分支流水线

真实场景中，流水线不总是线性的——某些阶段需要根据条件选择不同的处理路径：

```typescript
/**
 * 条件分支阶段
 * 根据输入内容动态选择不同的处理阶段
 */
class ConditionalStage<TIn, TOut> implements PipelineStage<TIn, TOut> {
  readonly name: string;

  constructor(
    name: string,
    private readonly router: (input: TIn) => string,  // 返回分支名称
    private readonly branches: Map<string, PipelineStage<TIn, TOut>>,
    private readonly defaultBranch?: PipelineStage<TIn, TOut>
  ) {
    this.name = name;
  }

  async process(input: TIn, context: PipelineContext): Promise<TOut> {
    const branchKey = this.router(input);
    const branch = this.branches.get(branchKey) ?? this.defaultBranch;

    if (!branch) {
      throw new Error(
        `[ConditionalStage:${this.name}] 无法匹配分支 "${branchKey}"，` +
        `且没有默认分支`
      );
    }

    console.log(`[ConditionalStage:${this.name}] 选择分支: ${branchKey}`);
    return branch.process(input, context);
  }
}

// 使用示例：文档处理流水线中的语言路由
interface DocumentInput {
  text: string;
  language: string;
  format: 'markdown' | 'html' | 'plain';
}

interface TranslatedDocument {
  originalText: string;
  translatedText: string;
  targetLanguage: string;
}

// 构建带分支的流水线
const documentPipeline = TypedPipeline.create<DocumentInput>('doc-processing')
  .pipe({
    name: '格式标准化',
    async process(input: DocumentInput, ctx: PipelineContext) {
      // 统一转为 Markdown
      ctx.addMetric('格式标准化', 'inputLength', input.text.length);
      return { ...input, format: 'markdown' as const, text: input.text };
    },
  })
  .pipe(
    new ConditionalStage<DocumentInput, TranslatedDocument>(
      '语言路由翻译',
      (input) => input.language,  // 根据语言选择分支
      new Map([
        ['zh', {
          name: '中文处理',
          async process(input: DocumentInput, _ctx: PipelineContext) {
            return {
              originalText: input.text,
              translatedText: input.text,  // 中文无需翻译
              targetLanguage: 'zh',
            };
          },
        }],
        ['en', {
          name: '英文翻译',
          async process(input: DocumentInput, _ctx: PipelineContext) {
            // 调用翻译 Agent
            return {
              originalText: input.text,
              translatedText: `[翻译后] ${input.text}`,
              targetLanguage: 'zh',
            };
          },
        }],
      ])
    )
  );
```

### 10.3.4 流水线监控与瓶颈检测

```typescript
/**
 * 流水线监控器
 * 跟踪阶段耗时、检测瓶颈、生成性能报告
 */
class PipelineMonitor {
  private history: PipelineReport[] = [];
  private readonly maxHistory: number;

  constructor(maxHistory: number = 100) {
    this.maxHistory = maxHistory;
  }

  /** 记录一次执行报告 */
  record(report: PipelineReport): void {
    this.history.push(report);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  /** 检测持续性瓶颈 */
  detectBottlenecks(): Array<{
    stageName: string;
    avgDurationMs: number;
    p95DurationMs: number;
    bottleneckFrequency: number;  // 该阶段成为瓶颈的频率
  }> {
    const stageStats = new Map<string, number[]>();

    // 收集每个阶段的历史耗时
    for (const report of this.history) {
      for (const stage of report.stages) {
        const durations = stageStats.get(stage.stageName) ?? [];
        durations.push(stage.durationMs);
        stageStats.set(stage.stageName, durations);
      }
    }

    // 统计每个阶段成为瓶颈的次数
    const bottleneckCounts = new Map<string, number>();
    for (const report of this.history) {
      const bn = report.bottleneck;
      bottleneckCounts.set(bn, (bottleneckCounts.get(bn) ?? 0) + 1);
    }

    return Array.from(stageStats.entries()).map(([name, durations]) => {
      durations.sort((a, b) => a - b);
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const p95Index = Math.floor(durations.length * 0.95);

      return {
        stageName: name,
        avgDurationMs: Math.round(avg),
        p95DurationMs: durations[p95Index] ?? durations[durations.length - 1],
        bottleneckFrequency: (bottleneckCounts.get(name) ?? 0) / this.history.length,
      };
    }).sort((a, b) => b.bottleneckFrequency - a.bottleneckFrequency);
  }

  /** 生成性能摘要 */
  getSummary(): string {
    const bottlenecks = this.detectBottlenecks();
    const successRate = this.history.filter(r => r.success).length / this.history.length;
    const avgTotal = this.history.reduce(
      (sum, r) => sum + r.totalDurationMs, 0
    ) / this.history.length;

    return [
      `流水线性能报告（最近 ${this.history.length} 次执行）`,
      `成功率: ${(successRate * 100).toFixed(1)}%`,
      `平均总耗时: ${Math.round(avgTotal)}ms`,
      `瓶颈阶段排名:`,
      ...bottlenecks.slice(0, 3).map((b, i) =>
        `  ${i + 1}. ${b.stageName} - 平均 ${b.avgDurationMs}ms, ` +
        `P95 ${b.p95DurationMs}ms, 瓶颈频率 ${(b.bottleneckFrequency * 100).toFixed(0)}%`
      ),
    ].join('\n');
  }
}
```

### 10.3.5 流式流水线

当处理大量数据项时，不必等所有项完成一个阶段再进入下一阶段——
可以采用流式处理，让数据像水流一样逐项通过所有阶段：

```typescript
/**
 * 流式流水线
 * 使用 AsyncGenerator 实现逐项流式处理
 */
class StreamingPipeline<TItem> {
  private stages: Array<{
    name: string;
    transform: (item: TItem) => Promise<TItem>;
  }> = [];

  addStage(
    name: string,
    transform: (item: TItem) => Promise<TItem>
  ): this {
    this.stages.push({ name, transform });
    return this;
  }

  /**
   * 流式处理：逐项通过所有阶段
   * 使用 AsyncGenerator 实现背压控制
   */
  async *processStream(
    items: AsyncIterable<TItem>
  ): AsyncGenerator<{
    item: TItem;
    index: number;
    stageDurations: Record<string, number>;
  }> {
    let index = 0;

    for await (const rawItem of items) {
      let current = rawItem;
      const durations: Record<string, number> = {};

      for (const { name, transform } of this.stages) {
        const start = Date.now();
        current = await transform(current);
        durations[name] = Date.now() - start;
      }

      yield { item: current, index: index++, stageDurations: durations };
    }
  }

  /**
   * 带并发控制的流式处理
   * concurrency 控制同时在流水线中的最大项数
   */
  async processWithConcurrency(
    items: TItem[],
    concurrency: number,
    onItem?: (result: TItem, index: number) => void
  ): Promise<TItem[]> {
    const results: TItem[] = new Array(items.length);
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
      while (nextIndex < items.length) {
        const myIndex = nextIndex++;
        let current = items[myIndex];

        for (const { transform } of this.stages) {
          current = await transform(current);
        }

        results[myIndex] = current;
        onItem?.(current, myIndex);
      }
    };

    // 启动多个 worker 并发处理
    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker()
    );
    await Promise.all(workers);

    return results;
  }
}

// 使用示例
interface Article {
  title: string;
  body: string;
  summary?: string;
  sentiment?: string;
  tags?: string[];
}

const articlePipeline = new StreamingPipeline<Article>()
  .addStage('摘要生成', async (article) => ({
    ...article,
    summary: `[摘要] ${article.body.slice(0, 100)}...`,
  }))
  .addStage('情感分析', async (article) => ({
    ...article,
    sentiment: article.body.includes('好') ? 'positive' : 'neutral',
  }))
  .addStage('自动打标', async (article) => ({
    ...article,
    tags: ['auto-tagged', 'processed'],
  }));

// 流式处理示例
async function processArticles(articles: Article[]): Promise<void> {
  const results = await articlePipeline.processWithConcurrency(
    articles,
    3,  // 最多 3 篇文章同时在流水线中
    (result, idx) => console.log(`第 ${idx} 篇处理完成: ${result.title}`)
  );
  console.log(`共处理 ${results.length} 篇文章`);
}
```

---

## 10.4 Fan-Out/Gather 扇出聚合模式

### 10.4.1 模式概述

Fan-Out/Gather 模式将一个任务分发给多个 Worker 并行处理，
然后收集所有结果进行聚合。它是提升吞吐量和结果多样性的核心模式。

**核心思想**：并行发散 + 集中聚合。

**适用场景**：
- 同一个问题需要多个视角的回答
- 大量同构子任务可以并行处理
- 需要在多个结果中选出最佳方案
- 需要对同一数据进行多维度分析

```
      任务
       |
  +----+----+----+
  v    v    v    v
 W1   W2   W3   W4    <-- Fan-Out：并行分发
  |    |    |    |
  +----+----+----+
       v
   Aggregator          <-- Gather：聚合结果
       |
    最终结果
```

### 10.4.2 加权扇出聚合

不同 Worker 的能力有差异，应当对结果赋予不同的权重：

```typescript
/**
 * 加权扇出聚合编排器
 * 支持为每个 Worker 分配权重，聚合时考虑权重
 */
interface WorkerConfig {
  agent: IAgent;
  weight: number;          // 聚合权重，0-1
  timeoutMs?: number;      // 单 Worker 超时
  optional?: boolean;      // 是否可选（超时/失败时不阻塞）
}

interface GatherStrategy {
  type: 'weighted_merge' | 'best_of' | 'majority_vote' | 'custom';
  customAggregator?: (results: WeightedResult[]) => Promise<string>;
}

interface WeightedResult {
  agentId: string;
  output: string;
  weight: number;
  durationMs: number;
  success: boolean;
}

class WeightedFanOutGather {
  constructor(
    private readonly llm: LLMClient,
    private readonly workers: WorkerConfig[],
    private readonly strategy: GatherStrategy,
    private readonly globalTimeoutMs: number = 30_000
  ) {
    // 验证权重之和
    const totalWeight = workers.reduce((sum, w) => sum + w.weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      console.warn(
        `[FanOutGather] 权重之和为 ${totalWeight}，建议归一化为 1.0`
      );
    }
  }

  /** 执行扇出-聚合 */
  async execute(task: string): Promise<{
    finalResult: string;
    workerResults: WeightedResult[];
    aggregationMethod: string;
  }> {
    // 第 1 步：Fan-Out — 并行发送给所有 Worker
    const workerResults = await this.fanOut(task);

    // 第 2 步：过滤有效结果
    const validResults = workerResults.filter(r => r.success);
    if (validResults.length === 0) {
      throw new Error('[FanOutGather] 所有 Worker 都失败了');
    }

    // 第 3 步：Gather — 按策略聚合
    const finalResult = await this.gather(task, validResults);

    return {
      finalResult,
      workerResults,
      aggregationMethod: this.strategy.type,
    };
  }

  /** 扇出：带超时和容错的并行执行 */
  private async fanOut(task: string): Promise<WeightedResult[]> {
    const promises = this.workers.map(async (config) => {
      const start = Date.now();
      const timeout = config.timeoutMs ?? this.globalTimeoutMs;

      try {
        const result = await Promise.race([
          config.agent.execute(task),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Worker 超时')), timeout)
          ),
        ]);

        return {
          agentId: config.agent.id,
          output: result.output,
          weight: config.weight,
          durationMs: Date.now() - start,
          success: result.success,
        } satisfies WeightedResult;
      } catch (err) {
        return {
          agentId: config.agent.id,
          output: `错误: ${err instanceof Error ? err.message : String(err)}`,
          weight: config.weight,
          durationMs: Date.now() - start,
          success: false,
        } satisfies WeightedResult;
      }
    });

    // 如果有可选 Worker，用 Promise.allSettled 允许部分失败
    const hasOptional = this.workers.some(w => w.optional);
    if (hasOptional) {
      const settled = await Promise.allSettled(promises);
      return settled.map((s, i) => {
        if (s.status === 'fulfilled') return s.value;
        return {
          agentId: this.workers[i].agent.id,
          output: `Rejected: ${s.reason}`,
          weight: this.workers[i].weight,
          durationMs: 0,
          success: false,
        };
      });
    }

    return Promise.all(promises);
  }

  /** 聚合：按策略整合结果 */
  private async gather(
    task: string,
    results: WeightedResult[]
  ): Promise<string> {
    switch (this.strategy.type) {
      case 'weighted_merge':
        return this.weightedMerge(task, results);
      case 'best_of':
        return this.bestOf(task, results);
      case 'majority_vote':
        return this.majorityVote(results);
      case 'custom':
        if (!this.strategy.customAggregator) {
          throw new Error('custom 策略需要提供 customAggregator');
        }
        return this.strategy.customAggregator(results);
      default:
        throw new Error(`未知聚合策略: ${this.strategy.type}`);
    }
  }

  /** 加权合并：LLM 综合考虑权重生成最终答案 */
  private async weightedMerge(
    task: string,
    results: WeightedResult[]
  ): Promise<string> {
    const prompt = `请综合以下多个回答，生成一个最优的最终答案。
每个回答都有一个权重，权重越高表示该回答越值得信赖。

原始问题：${task}

各回答及权重：
${results
  .sort((a, b) => b.weight - a.weight)
  .map(r => `[权重 ${r.weight.toFixed(2)}] ${r.agentId}: ${r.output}`)
  .join('\n\n')}

请综合以上回答（优先参考高权重回答），生成最终答案：`;

    return this.llm.chat([{ role: 'user', content: prompt }], { temperature: 0.3 });
  }

  /** 最佳选择：LLM 从所有结果中选出最好的 */
  private async bestOf(
    task: string,
    results: WeightedResult[]
  ): Promise<string> {
    const prompt = `请从以下多个回答中选出最佳答案。

原始问题：${task}

候选回答：
${results.map((r, i) => `[选项 ${i + 1}] ${r.output}`).join('\n\n')}

请选出最佳回答并解释原因，然后直接给出该回答的改进版本：`;

    return this.llm.chat([{ role: 'user', content: prompt }], { temperature: 0.2 });
  }

  /** 多数投票：适用于有明确答案的场景 */
  private async majorityVote(results: WeightedResult[]): Promise<string> {
    // 对输出进行归一化后统计
    const votes = new Map<string, number>();
    for (const r of results) {
      const normalized = r.output.trim().toLowerCase();
      const currentWeight = votes.get(normalized) ?? 0;
      votes.set(normalized, currentWeight + r.weight);
    }

    // 选出加权票数最高的
    let bestAnswer = '';
    let bestWeight = 0;
    for (const [answer, weight] of votes) {
      if (weight > bestWeight) {
        bestWeight = weight;
        bestAnswer = answer;
      }
    }

    return bestAnswer;
  }
}
```

### 10.4.3 选择性扇出

并非所有任务都需要发给所有 Worker——智能选择性扇出可以节省成本：

```typescript
/**
 * 选择性扇出：根据任务内容，只向相关 Worker 发送请求
 */
class SelectiveFanOut {
  constructor(
    private readonly llm: LLMClient,
    private readonly workers: Map<string, { agent: IAgent; description: string }>
  ) {}

  /** 分析任务，选择相关的 Worker */
  async selectWorkers(task: string): Promise<string[]> {
    const workerDescriptions = Array.from(this.workers.entries())
      .map(([id, w]) => `  - ${id}: ${w.description}`)
      .join('\n');

    const prompt = `分析以下任务，选择最相关的处理器。

任务：${task}

可用处理器：
${workerDescriptions}

请以 JSON 数组返回需要参与处理的处理器 ID 列表：
["id1", "id2"]

规则：
1. 只选择与任务真正相关的处理器
2. 至少选择 1 个，最多选择 ${this.workers.size} 个
3. 如果不确定，宁可多选不要少选`;

    const response = await this.llm.chat(
      [{ role: 'user', content: prompt }],
      { responseFormat: 'json', temperature: 0.1 }
    );

    const selectedIds: string[] = JSON.parse(response);
    return selectedIds.filter(id => this.workers.has(id));
  }

  /** 只向选中的 Worker 发送任务 */
  async executeSelective(task: string): Promise<AgentResult[]> {
    const selectedIds = await this.selectWorkers(task);
    console.log(`[SelectiveFanOut] 选中 ${selectedIds.length}/${this.workers.size} 个 Worker`);

    const promises = selectedIds.map(id => {
      const worker = this.workers.get(id)!;
      return worker.agent.execute(task);
    });

    return Promise.all(promises);
  }
}
```

### 10.4.4 渐进式聚合（Progressive Gather）

不必等所有 Worker 完成——可以在 Worker 陆续完成时渐进式返回部分结果：

```typescript
/**
 * 渐进式聚合
 * Worker 完成即触发更新，逐步优化答案
 */
type GatherEventHandler = (event: {
  type: 'partial' | 'complete';
  completedCount: number;
  totalCount: number;
  latestResult: WeightedResult;
  currentBestAnswer: string;
}) => void;

class ProgressiveGather {
  constructor(
    private readonly llm: LLMClient,
    private readonly minResultsForPartial: number = 1
  ) {}

  /**
   * 渐进式执行
   * 每个 Worker 完成时，触发 onProgress 回调，包含当前最优结果
   */
  async execute(
    task: string,
    workers: WorkerConfig[],
    onProgress: GatherEventHandler
  ): Promise<string> {
    const results: WeightedResult[] = [];
    let currentBest = '';

    // 为每个 Worker 创建 Promise，完成时立即触发处理
    const promises = workers.map(async (config) => {
      const start = Date.now();
      try {
        const result = await config.agent.execute(task);
        const weighted: WeightedResult = {
          agentId: config.agent.id,
          output: result.output,
          weight: config.weight,
          durationMs: Date.now() - start,
          success: result.success,
        };
        results.push(weighted);

        // 已有足够的部分结果，生成中间答案
        if (results.length >= this.minResultsForPartial) {
          currentBest = await this.quickAggregate(task, results);

          onProgress({
            type: results.length === workers.length ? 'complete' : 'partial',
            completedCount: results.length,
            totalCount: workers.length,
            latestResult: weighted,
            currentBestAnswer: currentBest,
          });
        }

        return weighted;
      } catch (err) {
        const errorResult: WeightedResult = {
          agentId: config.agent.id,
          output: String(err),
          weight: 0,
          durationMs: Date.now() - start,
          success: false,
        };
        results.push(errorResult);
        return errorResult;
      }
    });

    await Promise.all(promises);
    return currentBest;
  }

  /** 快速聚合当前可用的结果 */
  private async quickAggregate(
    task: string,
    results: WeightedResult[]
  ): Promise<string> {
    const valid = results.filter(r => r.success);
    if (valid.length === 0) return '(暂无有效结果)';
    if (valid.length === 1) return valid[0].output;

    return this.llm.chat([{
      role: 'user',
      content: `综合以下回答给出最佳答案：\n问题：${task}\n回答：\n` +
        valid.map(r => `[${r.agentId}]: ${r.output}`).join('\n'),
    }], { temperature: 0.2, maxTokens: 500 });
  }
}
```

### 10.4.5 结果去重

当多个 Worker 对同一任务给出相似结果时，需要去重以避免冗余：

```typescript
/**
 * 语义去重器
 * 使用 LLM 判断结果之间的语义相似度，去除重复项
 */
class SemanticDeduplicator {
  constructor(private readonly llm: LLMClient) {}

  /** 对一组结果进行语义去重 */
  async deduplicate(
    results: WeightedResult[]
  ): Promise<WeightedResult[]> {
    if (results.length <= 1) return results;

    const prompt = `请分析以下文本列表，找出语义上重复或高度相似的项。

文本列表：
${results.map((r, i) => `[${i}] ${r.output.slice(0, 200)}`).join('\n')}

以 JSON 返回去重结果：
{
  "groups": [
    {
      "representativeIndex": 0,
      "duplicateIndices": [2, 4],
      "reason": "这些回答本质上表达了相同的观点"
    }
  ]
}`;

    const response = await this.llm.chat(
      [{ role: 'user', content: prompt }],
      { responseFormat: 'json', temperature: 0.1 }
    );

    try {
      const analysis = JSON.parse(response);
      const removedIndices = new Set<number>();

      for (const group of analysis.groups) {
        // 在重复组中，保留权重最高的结果
        const allIndices = [group.representativeIndex, ...group.duplicateIndices];
        const bestIdx = allIndices.reduce((best: number, idx: number) =>
          results[idx].weight > results[best].weight ? idx : best
        );
        for (const idx of allIndices) {
          if (idx !== bestIdx) removedIndices.add(idx);
        }
      }

      const deduped = results.filter((_, i) => !removedIndices.has(i));
      console.log(
        `[Dedup] ${results.length} 个结果去重后剩余 ${deduped.length} 个`
      );
      return deduped;
    } catch {
      console.warn('[Dedup] 去重分析解析失败，返回原始结果');
      return results;
    }
  }
}
```

---

## 10.5 Generator-Critic 生成-批评模式

### 10.5.1 模式概述

Generator-Critic 模式由两个角色组成：Generator 负责生成内容，
Critic 负责评审并提供改进建议，两者循环迭代直到质量达标。

**核心思想**：生成与评审分离，通过迭代逼近最优质量。

**适用场景**：
- 内容创作（文章、代码、设计方案）需要反复打磨
- 存在客观的质量标准可以评估
- 单次生成无法达到质量要求
- 需要从多个维度评估和改进

```
  +-----------------------------------+
  |                                   |
  |   +-----------+     draft/v(n)    |
  |   | Generator  |------------------>|
  |   +-----^-----+                   |
  |         |                   +-----v-----+
  |         |  feedback         |   Critic   |
  |         |  + score          +-----+-----+
  |         |                         |
  |         +-------------------------+
  |                                   |
  |   终止条件：score >= threshold    |
  |              OR iterations >= max |
  +-----------------------------------+
```

### 10.5.2 多维度评审面板

单个 Critic 可能无法覆盖所有质量维度——引入评审面板（Critic Panel），
每位 Critic 关注不同方面：

```typescript
/**
 * 评审维度定义
 */
interface CriticDimension {
  name: string;          // 维度名，如 "accuracy", "clarity", "completeness"
  description: string;   // 评审标准描述
  weight: number;        // 权重（0-1）
  minAcceptScore: number; // 该维度最低可接受分数
}

/**
 * 评审评分结构
 */
interface CriticScore {
  dimension: string;
  score: number;          // 0-10
  feedback: string;       // 具体反馈
  suggestions: string[];  // 改进建议
}

/**
 * 一轮迭代的完整记录
 */
interface IterationRecord {
  iteration: number;
  draft: string;
  scores: CriticScore[];
  compositeScore: number;
  timestamp: number;
}

/**
 * 多 Critic 评审面板
 */
class CriticPanel {
  constructor(
    private readonly llm: LLMClient,
    private readonly dimensions: CriticDimension[]
  ) {
    // 验证权重之和为 1
    const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      throw new Error(`评审维度权重之和应为 1.0，当前为 ${totalWeight}`);
    }
  }

  /** 对一份草稿进行多维度评审 */
  async evaluate(
    task: string,
    draft: string,
    previousFeedback?: string
  ): Promise<{
    scores: CriticScore[];
    compositeScore: number;
    overallFeedback: string;
    isAcceptable: boolean;
  }> {
    // 并行发起所有维度的评审
    const scorePromises = this.dimensions.map(dim =>
      this.evaluateDimension(task, draft, dim, previousFeedback)
    );
    const scores = await Promise.all(scorePromises);

    // 计算加权综合分
    const compositeScore = scores.reduce((sum, s, i) => {
      return sum + s.score * this.dimensions[i].weight;
    }, 0);

    // 检查是否每个维度都达标
    const isAcceptable = scores.every((s, i) =>
      s.score >= this.dimensions[i].minAcceptScore
    );

    // 生成整体反馈
    const overallFeedback = this.formatOverallFeedback(
      scores, compositeScore, isAcceptable
    );

    return { scores, compositeScore, overallFeedback, isAcceptable };
  }

  /** 单维度评审 */
  private async evaluateDimension(
    task: string,
    draft: string,
    dimension: CriticDimension,
    previousFeedback?: string
  ): Promise<CriticScore> {
    const prompt = `你是一位专注于 "${dimension.name}" 的评审专家。

评审标准：${dimension.description}

原始任务：${task}

当前草稿：
${draft}

${previousFeedback ? `上一轮反馈（供参考，判断是否有改进）：${previousFeedback}` : ''}

请以 JSON 格式评审：
{
  "dimension": "${dimension.name}",
  "score": <0-10 的整数>,
  "feedback": "对该维度的具体评价",
  "suggestions": ["改进建议1", "改进建议2"]
}

评分标准：
- 0-3：严重不达标
- 4-5：勉强可用但有明显问题
- 6-7：基本合格
- 8-9：优秀
- 10：完美`;

    const response = await this.llm.chat(
      [{ role: 'user', content: prompt }],
      { responseFormat: 'json', temperature: 0.2 }
    );

    try {
      return JSON.parse(response) as CriticScore;
    } catch {
      return {
        dimension: dimension.name,
        score: 5,
        feedback: '评审解析失败，给予中等评分',
        suggestions: [],
      };
    }
  }

  /** 生成整体反馈 */
  private formatOverallFeedback(
    scores: CriticScore[],
    composite: number,
    acceptable: boolean
  ): string {
    const summaryLines = scores.map(
      s => `- ${s.dimension}: ${s.score}/10 -- ${s.feedback}`
    );

    return [
      `综合评分: ${composite.toFixed(1)}/10 ${acceptable ? '(达标)' : '(未达标)'}`,
      '',
      '各维度评审:',
      ...summaryLines,
      '',
      '优先改进建议:',
      // 按分数排序，最低分的维度优先改进
      ...scores
        .sort((a, b) => a.score - b.score)
        .slice(0, 2)
        .flatMap(s => s.suggestions.map(sug => `  -> [${s.dimension}] ${sug}`)),
    ].join('\n');
  }
}
```

### 10.5.3 Generator-Critic 迭代循环

```typescript
/**
 * 完整的生成-批评迭代循环
 * 包含收敛检测和质量追踪
 */
class GeneratorCriticLoop {
  private iterationHistory: IterationRecord[] = [];

  constructor(
    private readonly llm: LLMClient,
    private readonly criticPanel: CriticPanel,
    private readonly config: {
      maxIterations: number;         // 最大迭代次数
      targetScore: number;           // 目标综合分
      convergenceThreshold: number;  // 收敛阈值（连续两次分差小于此值视为收敛）
      convergencePatience: number;   // 收敛容忍轮数
    }
  ) {}

  /** 运行完整的生成-批评循环 */
  async run(task: string): Promise<{
    finalDraft: string;
    finalScore: number;
    iterations: number;
    history: IterationRecord[];
    terminationReason: 'target_reached' | 'max_iterations' | 'converged';
  }> {
    let currentDraft = await this.generateInitialDraft(task);
    let convergenceCount = 0;
    let previousScore = 0;
    let terminationReason: 'target_reached' | 'max_iterations' | 'converged' =
      'max_iterations';

    for (let iter = 1; iter <= this.config.maxIterations; iter++) {
      console.log(`\n[GenCritic] ===== 第 ${iter} 轮迭代 =====`);

      // 评审当前草稿
      const evaluation = await this.criticPanel.evaluate(
        task,
        currentDraft,
        this.iterationHistory.length > 0
          ? this.iterationHistory[this.iterationHistory.length - 1].scores
              .map(s => s.feedback).join('; ')
          : undefined
      );

      // 记录历史
      const record: IterationRecord = {
        iteration: iter,
        draft: currentDraft,
        scores: evaluation.scores,
        compositeScore: evaluation.compositeScore,
        timestamp: Date.now(),
      };
      this.iterationHistory.push(record);

      console.log(
        `[GenCritic] 综合分: ${evaluation.compositeScore.toFixed(1)}/10`
      );

      // 检查终止条件 1：达到目标分数
      if (evaluation.isAcceptable && evaluation.compositeScore >= this.config.targetScore) {
        terminationReason = 'target_reached';
        console.log('[GenCritic] 达到目标分数，终止');
        break;
      }

      // 检查终止条件 2：收敛（分数不再显著提升）
      const scoreDelta = Math.abs(evaluation.compositeScore - previousScore);
      if (scoreDelta < this.config.convergenceThreshold) {
        convergenceCount++;
        if (convergenceCount >= this.config.convergencePatience) {
          terminationReason = 'converged';
          console.log('[GenCritic] 质量收敛，终止');
          break;
        }
      } else {
        convergenceCount = 0;
      }
      previousScore = evaluation.compositeScore;

      // 根据反馈改进草稿
      if (iter < this.config.maxIterations) {
        currentDraft = await this.improveDraft(
          task, currentDraft, evaluation.overallFeedback, iter
        );
      }
    }

    return {
      finalDraft: currentDraft,
      finalScore: this.iterationHistory[this.iterationHistory.length - 1].compositeScore,
      iterations: this.iterationHistory.length,
      history: this.iterationHistory,
      terminationReason,
    };
  }

  /** 生成初始草稿 */
  private async generateInitialDraft(task: string): Promise<string> {
    return this.llm.chat([{
      role: 'user',
      content: `请完成以下任务，生成高质量的初始版本：\n\n${task}`,
    }], { temperature: 0.7 });
  }

  /** 根据反馈改进草稿 */
  private async improveDraft(
    task: string,
    currentDraft: string,
    feedback: string,
    iteration: number
  ): Promise<string> {
    // 提供历史分数趋势，帮助 Generator 理解改进方向
    const scoreTrend = this.iterationHistory.map(
      h => `第${h.iteration}轮: ${h.compositeScore.toFixed(1)}`
    ).join(' -> ');

    return this.llm.chat([{
      role: 'system',
      content: '你是一位精益求精的内容改进专家。根据评审反馈改进草稿。',
    }, {
      role: 'user',
      content: `原始任务：${task}

当前草稿（第 ${iteration} 版）：
${currentDraft}

评审反馈：
${feedback}

历史分数趋势：${scoreTrend}

请根据反馈对草稿进行针对性改进。重点关注得分最低的维度。
直接输出改进后的完整草稿，不要包含任何解释。`,
    }], { temperature: 0.5 });
  }

  /** 获取质量趋势报告 */
  getQualityTrend(): string {
    if (this.iterationHistory.length === 0) return '暂无数据';

    const lines = this.iterationHistory.map(h => {
      const filled = Math.round(h.compositeScore);
      const empty = 10 - filled;
      const scoreBar = '#'.repeat(filled) + '.'.repeat(empty);
      return `  第${h.iteration}轮 [${scoreBar}] ${h.compositeScore.toFixed(1)}/10`;
    });

    return ['质量趋势:', ...lines].join('\n');
  }
}
```

### 10.5.4 带工具调用的 Critic

高级 Critic 不仅靠推理评审，还能调用工具来验证事实性声明：

```typescript
/**
 * 带工具调用能力的 Critic
 * 能够使用搜索、代码执行等工具验证 Generator 的输出
 */
interface CriticTool {
  name: string;
  description: string;
  execute(query: string): Promise<string>;
}

class ToolAugmentedCritic {
  constructor(
    private readonly llm: LLMClient,
    private readonly tools: CriticTool[],
    private readonly maxToolCalls: number = 5
  ) {}

  /** 使用工具验证草稿中的事实性声明 */
  async verifyWithTools(
    task: string,
    draft: string
  ): Promise<{
    verifiedClaims: Array<{
      claim: string;
      verified: boolean;
      evidence: string;
      toolUsed: string;
    }>;
    overallCredibility: number;  // 0-1
  }> {
    // 第 1 步：提取需要验证的声明
    const claims = await this.extractClaims(draft);

    // 第 2 步：逐个验证（限制工具调用次数）
    const verifiedClaims: Array<{
      claim: string;
      verified: boolean;
      evidence: string;
      toolUsed: string;
    }> = [];

    let toolCallsRemaining = this.maxToolCalls;

    for (const claim of claims) {
      if (toolCallsRemaining <= 0) break;

      // 选择最合适的工具
      const toolChoice = await this.selectTool(claim);
      if (!toolChoice) continue;

      try {
        const evidence = await toolChoice.tool.execute(toolChoice.query);
        toolCallsRemaining--;

        const isVerified = await this.judgeClaim(claim, evidence);
        verifiedClaims.push({
          claim,
          verified: isVerified,
          evidence: evidence.slice(0, 200),
          toolUsed: toolChoice.tool.name,
        });
      } catch (err) {
        verifiedClaims.push({
          claim,
          verified: false,
          evidence: `验证失败: ${err}`,
          toolUsed: toolChoice.tool.name,
        });
      }
    }

    const verifiedCount = verifiedClaims.filter(c => c.verified).length;
    const overallCredibility = verifiedClaims.length > 0
      ? verifiedCount / verifiedClaims.length
      : 0.5;  // 如果没有声明可验证，给中等可信度

    return { verifiedClaims, overallCredibility };
  }

  /** 从草稿中提取可验证的事实性声明 */
  private async extractClaims(draft: string): Promise<string[]> {
    const response = await this.llm.chat([{
      role: 'user',
      content: `从以下文本中提取所有可验证的事实性声明。
只提取那些可以通过搜索或计算来验证的具体声明，忽略观点性表述。

文本：${draft}

以 JSON 数组返回：["声明1", "声明2", ...]`,
    }], { responseFormat: 'json', temperature: 0.1 });

    try {
      return JSON.parse(response);
    } catch {
      return [];
    }
  }

  /** 选择最适合验证某个声明的工具 */
  private async selectTool(
    claim: string
  ): Promise<{ tool: CriticTool; query: string } | null> {
    const toolDescriptions = this.tools.map(
      t => `- ${t.name}: ${t.description}`
    ).join('\n');

    const response = await this.llm.chat([{
      role: 'user',
      content: `为验证以下声明，选择最合适的工具和查询语句。

声明：${claim}

可用工具：
${toolDescriptions}

以 JSON 返回：{"toolName": "...", "query": "..."} 或 null（如果无需验证）`,
    }], { responseFormat: 'json', temperature: 0.1 });

    try {
      const choice = JSON.parse(response);
      if (!choice) return null;
      const tool = this.tools.find(t => t.name === choice.toolName);
      return tool ? { tool, query: choice.query } : null;
    } catch {
      return null;
    }
  }

  /** 判断证据是否支持声明 */
  private async judgeClaim(claim: string, evidence: string): Promise<boolean> {
    const response = await this.llm.chat([{
      role: 'user',
      content: `声明：${claim}\n证据：${evidence}\n\n该证据是否支持此声明？回答 true 或 false。`,
    }], { temperature: 0.1 });
    return response.trim().toLowerCase().includes('true');
  }
}
```

---

## 10.6 Debate 辩论模式

### 10.6.1 模式概述

Debate 模式让多个 Agent 就同一问题进行结构化辩论，
通过对抗性讨论充分暴露各种观点和盲点，最后由 Judge 综合评判。

**核心思想**：对抗性探索 + 第三方裁决。

**适用场景**：
- 决策问题没有明确的"正确答案"
- 需要全面考虑 pros & cons
- 专家之间可能存在真正的分歧
- 避免群体思维（groupthink）

```
     Round 1: Opening        Round 2: Rebuttal       Round 3: Closing
  +------------------+   +------------------+   +------------------+
  | D1: 正方开场陈述  |   | D1: 反驳D2的论点  |   | D1: 总结陈词     |
  | D2: 反方开场陈述  |   | D2: 反驳D1的论点  |   | D2: 总结陈词     |
  +--------+---------+   +--------+---------+   +--------+---------+
           |                      |                      |
           +----------------------+----------------------+
                                  |
                           +------v------+
                           |    Judge     |
                           |  综合裁决    |
                           +-------------+
```

### 10.6.2 结构化辩论编排器

```typescript
/**
 * 辩论者角色定义
 */
interface DebaterRole {
  id: string;
  name: string;
  stance: string;          // 立场描述
  perspective: string;     // 视角（如 "技术可行性"、"商业价值"、"风险评估"）
  personality?: string;    // 性格特征（如 "保守谨慎"、"激进创新"）
}

/**
 * 辩论发言记录
 */
interface DebateStatement {
  round: number;
  phase: 'opening' | 'rebuttal' | 'closing';
  debaterId: string;
  content: string;
  referencedStatements?: string[];  // 引用的之前发言
  evidenceCited?: string[];         // 引用的证据
  argumentQuality?: number;         // Judge 评定的论点质量 0-10
}

/**
 * 辩论最终裁决
 */
interface DebateVerdict {
  winner: string | 'draw';
  reasoning: string;
  keyArguments: Array<{
    debaterId: string;
    argument: string;
    strength: number;       // 0-10
  }>;
  synthesis: string;        // 综合结论
  dissenting?: string;      // 少数意见
}

/**
 * 结构化辩论编排器
 * 支持：角色分配、多轮辩论、证据引用、质量评分
 */
class DebateOrchestrator {
  private transcript: DebateStatement[] = [];

  constructor(
    private readonly llm: LLMClient,
    private readonly config: {
      debaters: DebaterRole[];
      rounds: number;                   // 辩论轮数（不含裁决）
      enableEvidenceCitation: boolean;  // 是否允许引用证据
      scoringEnabled: boolean;          // 是否对每条论点评分
    }
  ) {
    if (config.debaters.length < 2) {
      throw new Error('辩论至少需要 2 位参与者');
    }
  }

  /** 执行完整辩论流程 */
  async conduct(topic: string): Promise<{
    transcript: DebateStatement[];
    verdict: DebateVerdict;
    roundScores: Map<string, number[]>;
  }> {
    this.transcript = [];
    const roundScores = new Map<string, number[]>();
    for (const d of this.config.debaters) {
      roundScores.set(d.id, []);
    }

    console.log(`[Debate] 辩题: ${topic}`);
    console.log(`[Debate] 参与者: ${this.config.debaters.map(d => d.name).join(' vs ')}`);

    // 第 1 阶段：开场陈述（Opening）
    console.log('\n[Debate] === 开场陈述 ===');
    await this.conductPhase(topic, 1, 'opening', roundScores);

    // 第 2 阶段：反驳（Rebuttal）— 可以有多轮
    for (let round = 2; round < this.config.rounds; round++) {
      console.log(`\n[Debate] === 第 ${round} 轮反驳 ===`);
      await this.conductPhase(topic, round, 'rebuttal', roundScores);
    }

    // 第 3 阶段：总结陈词（Closing）
    console.log('\n[Debate] === 总结陈词 ===');
    await this.conductPhase(
      topic, this.config.rounds, 'closing', roundScores
    );

    // 第 4 阶段：裁决
    console.log('\n[Debate] === 裁决 ===');
    const verdict = await this.judge(topic);

    return { transcript: this.transcript, verdict, roundScores };
  }

  /** 执行一个辩论阶段 */
  private async conductPhase(
    topic: string,
    round: number,
    phase: 'opening' | 'rebuttal' | 'closing',
    roundScores: Map<string, number[]>
  ): Promise<void> {
    for (const debater of this.config.debaters) {
      const statement = await this.generateStatement(
        topic, debater, round, phase
      );
      this.transcript.push(statement);

      // 如果启用评分，对论点质量打分
      if (this.config.scoringEnabled) {
        const score = await this.scoreArgument(topic, statement);
        statement.argumentQuality = score;
        roundScores.get(debater.id)?.push(score);
      }

      console.log(
        `  [${debater.name}] (${phase}) ` +
        `${statement.content.slice(0, 80)}...` +
        (statement.argumentQuality !== undefined
          ? ` [评分: ${statement.argumentQuality}/10]`
          : '')
      );
    }
  }

  /** 生成一条辩论发言 */
  private async generateStatement(
    topic: string,
    debater: DebaterRole,
    round: number,
    phase: 'opening' | 'rebuttal' | 'closing'
  ): Promise<DebateStatement> {
    // 收集之前的辩论历史（供参考）
    const previousStatements = this.transcript
      .map(s => `[${s.debaterId}/${s.phase}] ${s.content}`)
      .join('\n\n');

    // 对手的最近发言（反驳用）
    const opponentStatements = this.transcript
      .filter(s => s.debaterId !== debater.id)
      .slice(-2);

    const phaseInstructions: Record<string, string> = {
      opening: '请发表开场陈述，阐明你的核心立场和主要论点。要有说服力，逻辑清晰。',
      rebuttal: `请针对对手的以下论点进行反驳，同时强化你自己的立场：
${opponentStatements.map(s => `对手观点: ${s.content}`).join('\n')}`,
      closing: '请发表总结陈词。总结你的核心论点，回应对手的主要质疑，给出最后的有力论证。',
    };

    const prompt = `你是辩论参与者 "${debater.name}"。

你的立场：${debater.stance}
你的视角：${debater.perspective}
${debater.personality ? `你的风格：${debater.personality}` : ''}

辩题：${topic}

当前是第 ${round} 轮的 ${phase} 阶段。

${previousStatements ? `之前的辩论记录:\n${previousStatements}\n` : ''}

${phaseInstructions[phase]}

${this.config.enableEvidenceCitation
  ? '如果可能，请引用具体的数据、案例或研究来支持你的论点。用 [证据: ...] 格式标注引用。'
  : ''}

要求：
1. 保持你的角色立场一致
2. 论点要有逻辑性和说服力
3. 不要偏离辩题
4. 控制在 300 字以内`;

    const content = await this.llm.chat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.7 }
    );

    // 提取引用的证据
    const evidenceCited = this.config.enableEvidenceCitation
      ? this.extractEvidence(content)
      : undefined;

    return {
      round,
      phase,
      debaterId: debater.id,
      content,
      evidenceCited,
    };
  }

  /** 从发言中提取引用的证据 */
  private extractEvidence(content: string): string[] {
    const evidenceRegex = /\[证据:\s*(.+?)\]/g;
    const evidence: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = evidenceRegex.exec(content)) !== null) {
      evidence.push(match[1]);
    }
    return evidence;
  }

  /** 对单条论点评分 */
  private async scoreArgument(
    topic: string,
    statement: DebateStatement
  ): Promise<number> {
    const response = await this.llm.chat([{
      role: 'user',
      content: `作为辩论评委，请对以下发言的论点质量打分（0-10）。

辩题：${topic}
发言者立场：${this.config.debaters.find(d => d.id === statement.debaterId)?.stance}
发言阶段：${statement.phase}
发言内容：${statement.content}

评分标准：
- 逻辑性（论证结构是否严密）
- 说服力（论点是否有力）
- 相关性（是否紧扣辩题）
- 创新性（是否提出新颖视角）

只返回一个 0-10 的数字：`,
    }], { temperature: 0.1 });

    const score = parseFloat(response.trim());
    return isNaN(score) ? 5 : Math.min(10, Math.max(0, score));
  }

  /** 最终裁决 */
  private async judge(topic: string): Promise<DebateVerdict> {
    const fullTranscript = this.transcript
      .map(s => {
        const debater = this.config.debaters.find(d => d.id === s.debaterId);
        return `[${debater?.name} | ${s.phase} | R${s.round}` +
          (s.argumentQuality !== undefined ? ` | 评分:${s.argumentQuality}` : '') +
          `]\n${s.content}`;
      })
      .join('\n\n---\n\n');

    const prompt = `你是一位公正的辩论裁判。请根据完整的辩论记录做出最终裁决。

辩题：${topic}

辩论参与者：
${this.config.debaters.map(d => `- ${d.name}: ${d.stance} (${d.perspective})`).join('\n')}

完整辩论记录：
${fullTranscript}

请以 JSON 格式裁决：
{
  "winner": "获胜者ID 或 draw",
  "reasoning": "裁决理由",
  "keyArguments": [
    {
      "debaterId": "辩手ID",
      "argument": "关键论点",
      "strength": <0-10>
    }
  ],
  "synthesis": "综合结论——超越胜负的最佳答案",
  "dissenting": "值得关注的少数意见（可选）"
}

裁决原则：
1. 基于论证质量而非立场偏好
2. 综合结论应兼顾各方合理观点
3. 明确指出最有力的论点`;

    const response = await this.llm.chat(
      [{ role: 'user', content: prompt }],
      { responseFormat: 'json', temperature: 0.2 }
    );

    try {
      return JSON.parse(response) as DebateVerdict;
    } catch {
      return {
        winner: 'draw',
        reasoning: '裁决解析失败',
        keyArguments: [],
        synthesis: response,
      };
    }
  }
}

// 使用示例
async function runTechDebate(llm: LLMClient): Promise<void> {
  const orchestrator = new DebateOrchestrator(llm, {
    debaters: [
      {
        id: 'advocate',
        name: '技术倡导者',
        stance: '我们应该立即采用微服务架构重构系统',
        perspective: '技术先进性和长期可维护性',
        personality: '积极进取、富有远见',
      },
      {
        id: 'pragmatist',
        name: '务实主义者',
        stance: '应该保持单体架构并逐步优化',
        perspective: '风险控制和短期交付压力',
        personality: '谨慎务实、注重数据',
      },
    ],
    rounds: 3,
    enableEvidenceCitation: true,
    scoringEnabled: true,
  });

  const result = await orchestrator.conduct(
    '公司核心系统是否应该从单体架构迁移到微服务架构？'
  );

  console.log('\n=== 裁决结果 ===');
  console.log(`胜者: ${result.verdict.winner}`);
  console.log(`理由: ${result.verdict.reasoning}`);
  console.log(`综合结论: ${result.verdict.synthesis}`);
}
```

---

## 10.7 Hierarchical 层级模式

### 10.7.1 模式概述

Hierarchical（层级）模式模拟了企业管理层级结构：
顶层 Manager 将大任务分解为子任务，分配给 Sub-Manager 或 Worker；
Sub-Manager 可以进一步分解并向下委派，形成树形任务执行结构。

**核心思想**：递归分解 + 分层管控 + 逐级汇报。

**适用场景**：
- 超大规模任务，单层 Coordinator 无法处理
- 需要明确的权限层级和决策边界
- 子任务本身还需要进一步分解
- 需要中间层的质量把关

```
           +----------------+
           |  Top Manager   |  <-- 战略分解
           +-------+--------+
        +----------+----------+
        v          v          v
  +----------++----------++----------+
  |SubMgr: UI||SubMgr:API||SubMgr:DB |  <-- 战术分解
  +----+-----++----+-----++----+-----+
   +---+---+   +---+---+   +---+---+
   v   v   v   v   v   v   v   v   v
  W1  W2  W3  W4  W5  W6  W7  W8  W9   <-- 执行层
```

### 10.7.2 层级编排器实现

```typescript
/**
 * 层级任务节点
 */
interface TaskNode {
  id: string;
  description: string;
  parentId: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  assignedTo: string | null;   // Agent ID
  result?: string;
  children: TaskNode[];
  depth: number;
  metadata?: Record<string, unknown>;
}

/**
 * 权限级别定义
 */
interface AuthorityLevel {
  tier: number;               // 层级：0=顶层, 1=中层, 2=执行层
  canDecompose: boolean;      // 是否可以分解任务
  canDelegate: boolean;       // 是否可以向下委派
  canEscalate: boolean;       // 是否可以向上反馈
  maxSubTasks: number;        // 最大子任务数
  approvalRequired: boolean;  // 结果是否需要上级审批
}

/**
 * 层级节点 Agent
 */
interface HierarchicalAgent extends IAgent {
  tier: number;
  authority: AuthorityLevel;
  subordinates: HierarchicalAgent[];
}

/**
 * 层级编排器
 * 管理整棵任务树的分解、执行和汇总
 */
class HierarchicalOrchestrator {
  private taskTree: TaskNode | null = null;
  private agentRegistry: Map<string, HierarchicalAgent> = new Map();

  constructor(
    private readonly llm: LLMClient,
    private readonly rootManager: HierarchicalAgent,
    private readonly config: {
      maxDepth: number;              // 最大层级深度
      maxTotalNodes: number;         // 最大任务节点数（防止过度分解）
      timeoutPerLevel: number;       // 每层超时（ms）
      enableLateralCoordination: boolean;  // 是否允许同级横向协调
    }
  ) {
    this.registerAgent(rootManager);
  }

  /** 递归注册所有 Agent */
  private registerAgent(agent: HierarchicalAgent): void {
    this.agentRegistry.set(agent.id, agent);
    for (const sub of agent.subordinates) {
      this.registerAgent(sub);
    }
  }

  /** 执行层级编排 */
  async execute(task: string): Promise<{
    result: string;
    taskTree: TaskNode;
    metrics: {
      totalNodes: number;
      maxDepthReached: number;
      successRate: number;
      escalations: number;
    };
  }> {
    // 创建根任务节点
    this.taskTree = {
      id: 'root',
      description: task,
      parentId: null,
      status: 'pending',
      assignedTo: this.rootManager.id,
      children: [],
      depth: 0,
    };

    let escalations = 0;

    // 从根节点开始递归执行
    const result = await this.executeNode(
      this.taskTree,
      this.rootManager,
      (count) => { escalations += count; }
    );

    // 统计指标
    const allNodes = this.flattenTree(this.taskTree);
    const successNodes = allNodes.filter(n => n.status === 'completed');

    return {
      result,
      taskTree: this.taskTree,
      metrics: {
        totalNodes: allNodes.length,
        maxDepthReached: Math.max(...allNodes.map(n => n.depth)),
        successRate: allNodes.length > 0
          ? successNodes.length / allNodes.length
          : 0,
        escalations,
      },
    };
  }

  /** 递归执行单个任务节点 */
  private async executeNode(
    node: TaskNode,
    agent: HierarchicalAgent,
    onEscalate: (count: number) => void
  ): Promise<string> {
    node.status = 'in_progress';
    node.assignedTo = agent.id;

    console.log(
      `${'  '.repeat(node.depth)}[Tier ${agent.tier}:${agent.id}] ` +
      `处理: ${node.description.slice(0, 50)}...`
    );

    // 如果是执行层（叶子节点），直接执行
    if (!agent.authority.canDecompose || node.depth >= this.config.maxDepth) {
      return this.executeLeafTask(node, agent);
    }

    // 管理层：分解任务
    const subTasks = await this.decomposeForTier(
      node.description,
      agent,
      node.depth
    );

    // 检查总节点数限制
    const currentTotal = this.taskTree
      ? this.flattenTree(this.taskTree).length
      : 0;
    if (currentTotal + subTasks.length > this.config.maxTotalNodes) {
      console.warn(
        `[Hierarchical] 节点数 ${currentTotal + subTasks.length} ` +
        `超过限制 ${this.config.maxTotalNodes}，降级为直接执行`
      );
      return this.executeLeafTask(node, agent);
    }

    // 创建子任务节点
    const childNodes: TaskNode[] = subTasks.map((sub, idx) => ({
      id: `${node.id}_sub${idx}`,
      description: sub.description,
      parentId: node.id,
      status: 'pending' as const,
      assignedTo: null,
      children: [],
      depth: node.depth + 1,
      metadata: { requiredTier: sub.requiredTier },
    }));
    node.children = childNodes;

    // 为每个子任务分配 Agent 并执行
    const childResults: string[] = [];
    for (const child of childNodes) {
      const assignedAgent = this.findBestAgent(
        agent,
        child.metadata?.requiredTier as number | undefined
      );

      if (!assignedAgent) {
        // 无法找到合适的下属，向上 escalate
        if (agent.authority.canEscalate) {
          onEscalate(1);
          child.status = 'failed';
          child.result = '[ESCALATED] 无法找到合适的执行者';
          continue;
        }
        // 自己执行
        const result = await this.executeLeafTask(child, agent);
        childResults.push(result);
        continue;
      }

      const result = await this.executeNode(child, assignedAgent, onEscalate);
      childResults.push(result);

      // 如果启用上级审批
      if (assignedAgent.authority.approvalRequired) {
        const approved = await this.reviewResult(
          agent, child.description, result
        );
        if (!approved) {
          console.log(
            `${'  '.repeat(node.depth)}  [审批] ${agent.id} 驳回了 ` +
            `${assignedAgent.id} 的结果，重新执行`
          );
          // 重新执行一次
          child.status = 'pending';
          const retryResult = await this.executeNode(
            child, assignedAgent, onEscalate
          );
          childResults[childResults.length - 1] = retryResult;
        }
      }
    }

    // 汇总子任务结果
    const summary = await this.summarizeResults(
      node.description, childResults, agent
    );
    node.status = 'completed';
    node.result = summary;
    return summary;
  }

  /** 执行叶子节点任务 */
  private async executeLeafTask(
    node: TaskNode,
    agent: HierarchicalAgent
  ): Promise<string> {
    try {
      const result = await agent.execute(node.description);
      node.status = result.success ? 'completed' : 'failed';
      node.result = result.output;
      return result.output;
    } catch (err) {
      node.status = 'failed';
      const errorMsg = `执行失败: ${err instanceof Error ? err.message : String(err)}`;
      node.result = errorMsg;
      return errorMsg;
    }
  }

  /** 针对层级的任务分解 */
  private async decomposeForTier(
    task: string,
    manager: HierarchicalAgent,
    currentDepth: number
  ): Promise<Array<{ description: string; requiredTier: number }>> {
    const availableSubordinates = manager.subordinates.map(s => ({
      id: s.id,
      tier: s.tier,
      capabilities: s.capabilities.map(c => c.name),
    }));

    const response = await this.llm.chat([{
      role: 'user',
      content: `作为 Tier ${manager.tier} 管理者，请分解以下任务。

任务: ${task}
当前深度: ${currentDepth}/${this.config.maxDepth}
可用下属: ${JSON.stringify(availableSubordinates)}

以 JSON 数组返回: [{"description": "子任务描述", "requiredTier": <下属层级>}]
每个子任务应该可以被单个下属完成。最多 ${manager.authority.maxSubTasks} 个子任务。`,
    }], { responseFormat: 'json', temperature: 0.2 });

    try {
      return JSON.parse(response);
    } catch {
      // 分解失败，返回单个子任务（原任务）
      return [{ description: task, requiredTier: manager.tier + 1 }];
    }
  }

  /** 在下属中找到最合适的 Agent */
  private findBestAgent(
    manager: HierarchicalAgent,
    requiredTier?: number
  ): HierarchicalAgent | null {
    const candidates = requiredTier !== undefined
      ? manager.subordinates.filter(s => s.tier === requiredTier)
      : manager.subordinates;
    return candidates.length > 0 ? candidates[0] : null;
  }

  /** 上级审批结果 */
  private async reviewResult(
    reviewer: HierarchicalAgent,
    task: string,
    result: string
  ): Promise<boolean> {
    const response = await this.llm.chat([{
      role: 'user',
      content: `作为管理者，请审核下属的任务完成结果。
任务: ${task}
结果: ${result}
该结果是否可以接受？回答 "approved" 或 "rejected"（附原因）`,
    }], { temperature: 0.1 });
    return response.toLowerCase().includes('approved');
  }

  /** 汇总子任务结果 */
  private async summarizeResults(
    parentTask: string,
    childResults: string[],
    manager: HierarchicalAgent
  ): Promise<string> {
    return this.llm.chat([{
      role: 'user',
      content: `作为 ${manager.name}，请整合下属的工作成果。
总任务: ${parentTask}
各子任务成果:
${childResults.map((r, i) => `[子任务${i + 1}] ${r}`).join('\n\n')}
请生成一个完整、连贯的汇总报告。`,
    }], { temperature: 0.3 });
  }

  /** 将树结构展平为数组 */
  private flattenTree(node: TaskNode): TaskNode[] {
    const result: TaskNode[] = [node];
    for (const child of node.children) {
      result.push(...this.flattenTree(child));
    }
    return result;
  }

  /** 打印任务树（调试用） */
  printTree(node?: TaskNode): string {
    const n = node ?? this.taskTree;
    if (!n) return '(empty)';

    const indent = '  '.repeat(n.depth);
    const statusIcon =
      n.status === 'completed' ? '[OK]' :
      n.status === 'failed' ? '[FAIL]' :
      n.status === 'in_progress' ? '[...]' : '[--]';

    let output = `${indent}${statusIcon} ${n.description.slice(0, 60)}`;
    if (n.assignedTo) output += ` (@${n.assignedTo})`;
    output += '\n';

    for (const child of n.children) {
      output += this.printTree(child);
    }
    return output;
  }
}
```

### 10.7.3 横向协调

在层级模式中，同级 Agent 之间有时需要直接沟通，而不必通过共同上级中转：

```typescript
/**
 * 横向协调协议
 * 允许同一层级的 Agent 之间直接交换信息
 */
interface LateralMessage {
  fromAgentId: string;
  toAgentId: string;
  type: 'info_request' | 'info_response' | 'dependency_notification';
  content: string;
  timestamp: number;
}

class LateralCoordinator {
  private messageLog: LateralMessage[] = [];

  /** 发送横向消息 */
  async sendLateralMessage(
    from: HierarchicalAgent,
    to: HierarchicalAgent,
    content: string,
    type: LateralMessage['type'] = 'info_request'
  ): Promise<string | null> {
    // 验证是否同级
    if (from.tier !== to.tier) {
      console.warn('[Lateral] 横向协调仅限于同级 Agent');
      return null;
    }

    const message: LateralMessage = {
      fromAgentId: from.id,
      toAgentId: to.id,
      type,
      content,
      timestamp: Date.now(),
    };
    this.messageLog.push(message);

    // 对方接收并处理消息
    if (type === 'info_request') {
      const response = await to.execute(
        `你收到了来自同事 ${from.id} 的信息请求: ${content}\n请简洁回复。`
      );

      const responseMessage: LateralMessage = {
        fromAgentId: to.id,
        toAgentId: from.id,
        type: 'info_response',
        content: response.output,
        timestamp: Date.now(),
      };
      this.messageLog.push(responseMessage);

      return response.output;
    }

    return null;
  }

  /** 获取通信日志 */
  getLog(): LateralMessage[] {
    return [...this.messageLog];
  }
}
```

---

## 10.8 Mixture of Agents (MoA) 混合智能体模式

### 10.8.1 模式概述

Mixture of Agents（MoA）受 Mixture of Experts 启发，
通过多层结构组合多个 LLM/Agent 的输出来提升整体质量。
核心思路是：多个 Proposer 独立生成方案，Aggregator 综合提炼，
然后多个 Refiner 在综合基础上进一步优化，最终再次聚合。

**核心思想**：层叠聚合，每一层都在前一层基础上改进。

**论文参考**：Together AI 的 "Mixture-of-Agents Enhances Large Language Model Capabilities" (2024)

```
  Layer 0 (Proposing):
    +----------+  +----------+  +----------+
    |Proposer 1|  |Proposer 2|  |Proposer 3|
    +----+-----+  +----+-----+  +----+-----+
         +--------------+--------------+
                 +------v------+
  Layer 1:       | Aggregator  |
                 +------+------+
         +--------------+--------------+
  Layer 2 (Refining):
    +----------+  +----------+  +----------+
    |Refiner 1 |  |Refiner 2 |  |Refiner 3 |
    +----+-----+  +----+-----+  +----+-----+
         +--------------+--------------+
              +---------v---------+
  Layer 3:    | Final Aggregator  |
              +-------------------+
```

### 10.8.2 MoA 编排器实现

```typescript
/**
 * MoA 层定义
 */
interface MoALayer {
  name: string;
  agents: IAgent[];               // 本层参与的 Agent
  aggregationPrompt?: string;     // 聚合时使用的自定义 prompt
  temperature?: number;           // 本层 Agent 的 temperature
}

/**
 * MoA 层执行结果
 */
interface MoALayerResult {
  layerName: string;
  agentOutputs: AgentResult[];
  aggregatedOutput: string;
  durationMs: number;
}

/**
 * Mixture of Agents 编排器
 */
class MixtureOfAgentsOrchestrator {
  constructor(
    private readonly llm: LLMClient,
    private readonly layers: MoALayer[],
    private readonly config: {
      maxLayerTimeoutMs: number;        // 单层超时
      parallelExecution: boolean;       // 层内是否并行执行
      qualityThreshold?: number;        // 若设置，达标时提前终止
    } = { maxLayerTimeoutMs: 60_000, parallelExecution: true }
  ) {
    if (layers.length < 2) {
      throw new Error('MoA 至少需要 2 层（Proposer + Aggregator）');
    }
  }

  /** 执行 MoA 流程 */
  async execute(task: string): Promise<{
    finalOutput: string;
    layerResults: MoALayerResult[];
    totalDurationMs: number;
    costEstimate: { totalTokens: number; estimatedCost: number };
  }> {
    const startTime = Date.now();
    const layerResults: MoALayerResult[] = [];
    let currentInput = task;
    let totalTokens = 0;

    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      const layerStart = Date.now();
      const isLastLayer = i === this.layers.length - 1;

      console.log(
        `[MoA] Layer ${i}: ${layer.name} (${layer.agents.length} agents)`
      );

      // 执行本层所有 Agent
      const agentOutputs = await this.executeLayer(layer, currentInput);

      // 统计 token 用量
      for (const output of agentOutputs) {
        totalTokens += output.tokenUsage?.total ?? 0;
      }

      // 聚合本层结果
      const aggregated = await this.aggregateLayerResults(
        task,
        currentInput,
        agentOutputs,
        layer,
        isLastLayer
      );

      const layerResult: MoALayerResult = {
        layerName: layer.name,
        agentOutputs,
        aggregatedOutput: aggregated,
        durationMs: Date.now() - layerStart,
      };
      layerResults.push(layerResult);

      // 为下一层准备输入
      currentInput = aggregated;

      // 如果设置了质量阈值，检查是否可以提前终止
      if (this.config.qualityThreshold && !isLastLayer) {
        const quality = await this.assessQuality(task, aggregated);
        if (quality >= this.config.qualityThreshold) {
          console.log(
            `[MoA] 质量达标 (${quality.toFixed(2)} >= ${this.config.qualityThreshold})，` +
            `提前终止于 Layer ${i}`
          );
          break;
        }
      }
    }

    return {
      finalOutput: currentInput,
      layerResults,
      totalDurationMs: Date.now() - startTime,
      costEstimate: {
        totalTokens,
        estimatedCost: totalTokens * 0.00002,  // 估算成本（示例费率）
      },
    };
  }

  /** 执行单层所有 Agent */
  private async executeLayer(
    layer: MoALayer,
    input: string
  ): Promise<AgentResult[]> {
    const executeOne = (agent: IAgent) =>
      Promise.race([
        agent.execute(input),
        new Promise<AgentResult>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Agent ${agent.id} 超时`)),
            this.config.maxLayerTimeoutMs
          )
        ),
      ]).catch(err => ({
        success: false,
        output: `错误: ${err instanceof Error ? err.message : String(err)}`,
        agentId: agent.id,
        durationMs: 0,
      } satisfies AgentResult));

    if (this.config.parallelExecution) {
      return Promise.all(layer.agents.map(executeOne));
    }

    // 顺序执行
    const results: AgentResult[] = [];
    for (const agent of layer.agents) {
      results.push(await executeOne(agent));
    }
    return results;
  }

  /** 聚合一层的结果 */
  private async aggregateLayerResults(
    originalTask: string,
    layerInput: string,
    outputs: AgentResult[],
    layer: MoALayer,
    isFinalLayer: boolean
  ): Promise<string> {
    const validOutputs = outputs.filter(o => o.success);
    if (validOutputs.length === 0) {
      throw new Error(`[MoA:${layer.name}] 所有 Agent 都失败了`);
    }
    if (validOutputs.length === 1) {
      return validOutputs[0].output;
    }

    const customPrompt = layer.aggregationPrompt ?? (
      isFinalLayer
        ? '你是最终整合者。请综合所有回答，生成一个最优的、完整的最终答案。'
        : '你是中间层聚合者。请综合以下多个回答的优点，生成一个改进版的综合答案，供下一层继续优化。'
    );

    return this.llm.chat([{
      role: 'system',
      content: customPrompt,
    }, {
      role: 'user',
      content: `原始问题：${originalTask}

${validOutputs.map((o, i) => `=== 回答 ${i + 1} (${o.agentId}) ===\n${o.output}`).join('\n\n')}

请综合以上回答，生成最优答案：`,
    }], { temperature: layer.temperature ?? 0.3 });
  }

  /** 评估当前结果质量 */
  private async assessQuality(task: string, output: string): Promise<number> {
    const response = await this.llm.chat([{
      role: 'user',
      content: `评估以下回答的质量（0-1 的小数）。
问题: ${task}
回答: ${output}
只返回一个 0-1 之间的数字:`,
    }], { temperature: 0.1 });

    const score = parseFloat(response.trim());
    return isNaN(score) ? 0.5 : Math.min(1, Math.max(0, score));
  }
}
```

### 10.8.3 成本-质量权衡分析

MoA 模式的最大挑战是成本——每增加一层或一个 Agent，token 消耗都会倍增：

```typescript
/**
 * MoA 成本-质量分析器
 * 帮助决定最优的层数和每层 Agent 数
 */
class MoACostAnalyzer {
  /** 估算不同配置的成本 */
  static estimateCost(config: {
    layers: number;
    agentsPerLayer: number;
    avgInputTokens: number;
    avgOutputTokens: number;
    pricePerInputToken: number;    // 如 $0.01 / 1K tokens
    pricePerOutputToken: number;   // 如 $0.03 / 1K tokens
  }): {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCost: number;
    costBreakdown: Array<{
      layer: number;
      inputTokens: number;
      outputTokens: number;
      cost: number;
    }>;
  } {
    const breakdown: Array<{
      layer: number;
      inputTokens: number;
      outputTokens: number;
      cost: number;
    }> = [];

    let totalInput = 0;
    let totalOutput = 0;
    let accumulatedContext = config.avgInputTokens;

    for (let layer = 0; layer < config.layers; layer++) {
      // 每层的每个 Agent 都需要读取输入 + 之前的累积上下文
      const layerInputPerAgent = accumulatedContext;
      const layerOutputPerAgent = config.avgOutputTokens;

      const layerInput = layerInputPerAgent * config.agentsPerLayer;
      const layerOutput = layerOutputPerAgent * config.agentsPerLayer;

      // 聚合步骤的 token（读取所有输出 + 生成聚合结果）
      const aggregationInput = layerOutput + config.avgInputTokens;
      const aggregationOutput = config.avgOutputTokens;

      const layerTotalInput = layerInput + aggregationInput;
      const layerTotalOutput = layerOutput + aggregationOutput;
      const layerCost =
        (layerTotalInput / 1000) * config.pricePerInputToken +
        (layerTotalOutput / 1000) * config.pricePerOutputToken;

      breakdown.push({
        layer,
        inputTokens: layerTotalInput,
        outputTokens: layerTotalOutput,
        cost: layerCost,
      });

      totalInput += layerTotalInput;
      totalOutput += layerTotalOutput;

      // 下一层的输入会包含聚合结果
      accumulatedContext = aggregationOutput + config.avgInputTokens;
    }

    return {
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalCost: breakdown.reduce((sum, b) => sum + b.cost, 0),
      costBreakdown: breakdown,
    };
  }

  /** 打印成本对比表 */
  static printCostComparison(): string {
    const configs = [
      { name: '基线 (1x1)', layers: 1, agents: 1 },
      { name: 'MoA 2x3', layers: 2, agents: 3 },
      { name: 'MoA 3x3', layers: 3, agents: 3 },
      { name: 'MoA 3x5', layers: 3, agents: 5 },
      { name: 'MoA 4x3', layers: 4, agents: 3 },
    ];

    const baseParams = {
      avgInputTokens: 500,
      avgOutputTokens: 1000,
      pricePerInputToken: 0.01,
      pricePerOutputToken: 0.03,
    };

    const lines = [
      '| 配置 | 总 Input Tokens | 总 Output Tokens | 估算成本 | 成本倍数 |',
      '|------|----------------|-----------------|---------|---------|',
    ];

    let baseCost = 0;
    for (const cfg of configs) {
      const estimate = this.estimateCost({
        ...baseParams,
        layers: cfg.layers,
        agentsPerLayer: cfg.agents,
      });
      if (cfg.name.includes('基线')) baseCost = estimate.totalCost;
      const multiplier = baseCost > 0
        ? (estimate.totalCost / baseCost).toFixed(1)
        : '1.0';
      lines.push(
        `| ${cfg.name} | ${estimate.totalInputTokens} | ` +
        `${estimate.totalOutputTokens} | $${estimate.totalCost.toFixed(4)} | ` +
        `${multiplier}x |`
      );
    }

    return lines.join('\n');
  }
}
```

> **实践建议**：MoA 模式的质量提升通常在前 2-3 层最为显著，
> 之后边际收益递减。推荐配置为 2 层 x 3 个 Agent，在成本和质量之间取得较好平衡。

---

## 10.9 模式组合与嵌套

### 10.9.1 为什么需要组合模式？

实际生产系统中的任务往往过于复杂，无法用单一编排模式解决。
例如一个"AI 驱动的研究报告系统"可能需要：
1. **Coordinator** 分解研究主题为子课题
2. **Fan-Out/Gather** 并行搜索多个子课题
3. **Generator-Critic** 反复打磨每个章节
4. **Pipeline** 将搜索 -> 撰写 -> 校审串联起来

模式组合的关键在于：**将一种模式的某个节点替换为另一种模式的完整实例**。

### 10.9.2 组合规则

| 规则 | 说明 | 示例 |
|------|------|------|
| **嵌套深度限制** | 组合深度不超过 3 层，否则调试极其困难 | Coordinator -> Fan-Out -> Pipeline (3层已是上限) |
| **类型一致性** | 内层模式的输入/输出类型必须匹配外层的期望 | Pipeline 阶段的 TOut 必须匹配下一阶段的 TIn |
| **超时传递** | 外层超时应大于所有内层超时之和 | 如果内层 Pipeline 超时 30s，外层至少 60s |
| **错误冒泡** | 内层失败应向外层报告，而非静默吞掉 | 内层 Fan-Out 部分失败，外层 Coordinator 需知晓 |
| **可观测性** | 每层都应输出 metrics，便于定位问题 | 嵌套的 PipelineReport 应包含子模式的报告 |

### 10.9.3 组合模式：研究系统实现

以下是一个完整的组合示例——AI 研究助手系统，
使用 Coordinator + Fan-Out/Gather + Generator-Critic 三层嵌套：

```typescript
/**
 * 研究系统的数据类型
 */
interface ResearchTopic {
  title: string;
  subQuestions: string[];
}

interface SearchResult {
  query: string;
  sources: Array<{
    title: string;
    url: string;
    snippet: string;
    relevanceScore: number;
  }>;
}

interface ResearchSection {
  heading: string;
  content: string;
  sources: string[];
  qualityScore: number;
}

interface ResearchReport {
  title: string;
  abstract: string;
  sections: ResearchSection[];
  references: string[];
  metadata: {
    totalDurationMs: number;
    agentsInvolved: number;
    iterationsTotal: number;
    tokensUsed: number;
  };
}

/**
 * AI 研究助手 -- 组合编排模式
 *
 * 架构:
 *   Coordinator (顶层分解)
 *     +-- 对每个子课题:
 *         |-- Fan-Out/Gather (并行搜索)
 *         +-- Generator-Critic (撰写 + 审校)
 *     +-- 最终整合
 */
class AIResearchAssistant {
  constructor(
    private readonly llm: LLMClient,
    private readonly searchAgent: IAgent,           // 搜索 Agent
    private readonly writerAgent: IAgent,            // 撰写 Agent
    private readonly config: {
      maxSubTopics: number;
      searchWorkersPerTopic: number;
      maxWritingIterations: number;
      writingQualityTarget: number;
    } = {
      maxSubTopics: 5,
      searchWorkersPerTopic: 3,
      maxWritingIterations: 3,
      writingQualityTarget: 7.5,
    }
  ) {}

  /** 主入口：生成完整研究报告 */
  async research(topic: string): Promise<ResearchReport> {
    const startTime = Date.now();
    let totalTokens = 0;
    let totalIterations = 0;

    console.log(`\n[Research] 开始研究: "${topic}"`);

    // ========= 第 1 层：Coordinator 分解 =========
    console.log('\n[Research] Phase 1: 主题分解 (Coordinator)');
    const decomposition = await this.decomposeTopic(topic);
    console.log(
      `[Research] 分解为 ${decomposition.subQuestions.length} 个子课题`
    );

    // ========= 第 2 层：对每个子课题执行 搜索(Fan-Out) + 撰写(GenCritic) =========
    const sections: ResearchSection[] = [];

    for (let i = 0; i < decomposition.subQuestions.length; i++) {
      const question = decomposition.subQuestions[i];
      console.log(
        `\n[Research] Phase 2.${i + 1}: 处理子课题 "${question.slice(0, 40)}..."`
      );

      // 2a. Fan-Out/Gather: 并行搜索
      console.log('  [Search] 并行搜索...');
      const searchResults = await this.parallelSearch(question);

      // 2b. Generator-Critic: 撰写并打磨
      console.log('  [Write] 撰写并审校...');
      const section = await this.writeAndRefine(
        question,
        searchResults
      );
      totalIterations += section.iterations;
      sections.push({
        heading: question,
        content: section.content,
        sources: searchResults.flatMap(
          r => r.sources.map(s => s.url)
        ),
        qualityScore: section.finalScore,
      });
    }

    // ========= 第 3 层：最终整合 =========
    console.log('\n[Research] Phase 3: 最终整合');
    const report = await this.assembleReport(
      topic,
      decomposition,
      sections
    );

    report.metadata = {
      totalDurationMs: Date.now() - startTime,
      agentsInvolved: 2 + this.config.searchWorkersPerTopic,
      iterationsTotal: totalIterations,
      tokensUsed: totalTokens,
    };

    console.log(
      `\n[Research] 完成! 耗时 ${report.metadata.totalDurationMs}ms, ` +
      `${sections.length} 个章节`
    );

    return report;
  }

  /** Coordinator: 分解研究主题 */
  private async decomposeTopic(topic: string): Promise<ResearchTopic> {
    const response = await this.llm.chat([{
      role: 'user',
      content: `将以下研究主题分解为 ${this.config.maxSubTopics} 个以内的子研究问题。

主题：${topic}

以 JSON 返回：
{
  "title": "研究标题",
  "subQuestions": ["子问题1", "子问题2", ...]
}

每个子问题应该：
1. 可以通过搜索独立回答
2. 合起来覆盖主题的核心方面
3. 有明确的研究方向`,
    }], { responseFormat: 'json', temperature: 0.3 });

    return JSON.parse(response);
  }

  /** Fan-Out/Gather: 并行搜索一个子课题 */
  private async parallelSearch(question: string): Promise<SearchResult[]> {
    // 生成多个搜索查询（不同角度）
    const queriesResponse = await this.llm.chat([{
      role: 'user',
      content: `为以下研究问题生成 ${this.config.searchWorkersPerTopic} 个不同角度的搜索查询。
问题: ${question}
以 JSON 数组返回: ["query1", "query2", ...]`,
    }], { responseFormat: 'json', temperature: 0.5 });

    const queries: string[] = JSON.parse(queriesResponse);

    // Fan-Out: 并行执行所有搜索
    const searchPromises = queries.map(async (query): Promise<SearchResult> => {
      const result = await this.searchAgent.execute(query);
      return {
        query,
        sources: [{
          title: `搜索结果: ${query}`,
          url: `https://example.com/search?q=${encodeURIComponent(query)}`,
          snippet: result.output.slice(0, 200),
          relevanceScore: result.success ? 0.8 : 0.2,
        }],
      };
    });

    // Gather: 收集所有搜索结果
    const results = await Promise.all(searchPromises);

    // 过滤低质量结果
    return results.filter(
      r => r.sources.some(s => s.relevanceScore > 0.3)
    );
  }

  /** Generator-Critic: 撰写并打磨章节内容 */
  private async writeAndRefine(
    question: string,
    searchResults: SearchResult[]
  ): Promise<{
    content: string;
    finalScore: number;
    iterations: number;
  }> {
    const sourceMaterial = searchResults
      .flatMap(r => r.sources.map(s => s.snippet))
      .join('\n\n');

    // 初始生成
    let draft = await this.llm.chat([{
      role: 'user',
      content: `基于以下搜索资料，撰写一个关于 "${question}" 的研究章节。

搜索资料：
${sourceMaterial}

要求：
1. 结构清晰，有理有据
2. 引用搜索资料中的关键发现
3. 字数 300-600 字`,
    }], { temperature: 0.6 });

    let bestScore = 0;
    let iterations = 0;

    // Generator-Critic 循环
    for (let iter = 0; iter < this.config.maxWritingIterations; iter++) {
      iterations++;

      // Critic: 评审
      const evaluation = await this.llm.chat([{
        role: 'user',
        content: `评审以下研究章节的质量。

主题: ${question}
内容: ${draft}

以 JSON 返回:
{
  "score": <0-10>,
  "strengths": ["优点1"],
  "weaknesses": ["不足1"],
  "suggestions": ["建议1"]
}`,
      }], { responseFormat: 'json', temperature: 0.2 });

      const evalResult = JSON.parse(evaluation);
      bestScore = evalResult.score;

      console.log(`    迭代 ${iter + 1}: 评分 ${bestScore}/10`);

      // 达标即停
      if (bestScore >= this.config.writingQualityTarget) {
        break;
      }

      // Generator: 根据反馈改进
      if (iter < this.config.maxWritingIterations - 1) {
        draft = await this.llm.chat([{
          role: 'user',
          content: `请改进以下章节。
当前版本: ${draft}
评审反馈: ${JSON.stringify(evalResult.suggestions)}
直接输出改进后的完整章节。`,
        }], { temperature: 0.5 });
      }
    }

    return { content: draft, finalScore: bestScore, iterations };
  }

  /** 整合最终报告 */
  private async assembleReport(
    topic: string,
    decomposition: ResearchTopic,
    sections: ResearchSection[]
  ): Promise<ResearchReport> {
    // 生成摘要
    const abstract = await this.llm.chat([{
      role: 'user',
      content: `为以下研究报告写一个 100-200 字的摘要。

标题: ${decomposition.title}
章节概要:
${sections.map(s => `- ${s.heading}: ${s.content.slice(0, 100)}...`).join('\n')}`,
    }], { temperature: 0.3 });

    // 收集所有参考文献并去重
    const allSources = [...new Set(sections.flatMap(s => s.sources))];

    return {
      title: decomposition.title,
      abstract,
      sections,
      references: allSources,
      metadata: {
        totalDurationMs: 0,
        agentsInvolved: 0,
        iterationsTotal: 0,
        tokensUsed: 0,
      },
    };
  }
}
```

### 10.9.4 Anti-Patterns：组合模式的常见错误

```typescript
/**
 * 反模式示例与修正
 */

// ----- 反模式 1：过度嵌套（"洋葱架构"）-----
// 问题：5 层嵌套导致超时难以控制、错误难以追踪
//
// Coordinator
//   +-- Hierarchical
//       +-- Fan-Out
//           +-- Pipeline
//               +-- Generator-Critic
//
// 修正：扁平化，最多 3 层嵌套
// Coordinator
//   |-- Fan-Out (搜索)
//   +-- Generator-Critic (撰写)

// ----- 反模式 2：内层超时大于外层 -----
// 问题：内层还没超时，外层先超时，导致结果丢失
const BAD_TIMEOUT_CONFIG = {
  outerTimeout: 10_000,   // 外层 10s
  innerTimeout: 30_000,   // 内层 30s -- 比外层大！
};

// 修正：外层超时 = 所有内层超时之和 x 1.5（含 buffer）
const GOOD_TIMEOUT_CONFIG = {
  innerTimeout: 10_000,
  outerTimeout: 10_000 * 3 * 1.5,  // 3 个内层 x 1.5 buffer = 45s
};

// ----- 反模式 3：吞掉内层错误 -----
// 问题：内层 Fan-Out 的 3 个 Worker 有 2 个失败了，但外层不知道
async function badFanOutExample(task: string, workers: IAgent[]): Promise<string> {
  const results = await Promise.allSettled(
    workers.map(w => w.execute(task))
  );
  // 只取成功的，静默忽略失败 -- 错误被吞掉了
  const successful = results
    .filter((r): r is PromiseFulfilledResult<AgentResult> =>
      r.status === 'fulfilled'
    )
    .map(r => r.value.output);
  return successful.join('\n');
}

// 修正：报告失败信息给外层
interface FanOutResultWithErrors {
  outputs: string[];
  failedWorkers: Array<{ agentId: string; error: string }>;
  successRate: number;
}

async function goodFanOutExample(
  task: string,
  workers: IAgent[]
): Promise<FanOutResultWithErrors> {
  const results = await Promise.allSettled(
    workers.map(w => w.execute(task))
  );

  const outputs: string[] = [];
  const failures: Array<{ agentId: string; error: string }> = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value.success) {
      outputs.push(r.value.output);
    } else {
      failures.push({
        agentId: workers[i].id,
        error: r.status === 'rejected'
          ? String(r.reason)
          : (r.value as AgentResult).output,
      });
    }
  }

  return {
    outputs,
    failedWorkers: failures,
    successRate: outputs.length / workers.length,
  };
}

// ----- 反模式 4：所有模式用同一个 LLM 配置 -----
// 问题：Critic 需要低 temperature，Generator 需要高 temperature
//        搜索查询生成需要高多样性，结果聚合需要高确定性

// 修正：为不同角色定制 LLM 配置
const LLM_CONFIGS_BY_ROLE = {
  coordinator: { temperature: 0.2, maxTokens: 2000 },  // 精确分解
  generator:   { temperature: 0.7, maxTokens: 4000 },  // 创造性生成
  critic:      { temperature: 0.1, maxTokens: 1000 },  // 严格评审
  aggregator:  { temperature: 0.3, maxTokens: 3000 },  // 稳定聚合
  debater:     { temperature: 0.6, maxTokens: 2000 },  // 有创意但不过度
} as const;
```

---

## 10.10 模式选择决策树

面对一个具体的 Multi-Agent 需求，如何选择合适的编排模式？
以下决策树帮助你系统地做出选择：

```
                        开始
                         |
                    任务是否可分解？
                    +----+----+
                   否         是
                    |          |
            单 Agent 足够    子任务之间有顺序依赖？
                              +----+----+
                             是         否
                              |          |
                    +---------+    子任务是否同构？
                    |              +----+----+
              Pipeline 流水线     是         否
                                   |          |
                            Fan-Out/Gather    |
                                              |
                                   需要对抗性审查？
                                   +----+----+
                                  是         否
                                   |          |
                          +--------+     任务规模如何？
                          |              +----+----+
                   需要迭代改进？     大(>20 Agent)  小(<20)
                   +----+----+          |          |
                  是         否    Hierarchical   Coordinator
                   |          |      层级模式      协调者模式
            Generator-Critic  |
              生成-批评       |
                              |
                        需要多视角？
                        +----+----+
                       是         否
                        |          |
                   +----+          |
              需要对立立场？   需要质量最大化？
              +----+----+    +----+----+
             是         否  是         否
              |          |   |          |
           Debate    Fan-Out MoA    Coordinator
           辩论      +Gather  混合     协调者
```

### 10.10.1 快速参考卡

为了便于日常查阅，这里给出一张速查卡：

```
+-------------+------------------------------------------------------+
|                    编排模式速查卡                                     |
+-------------+------------------------------------------------------+
| 场景关键词    | 推荐模式                                            |
+-------------+------------------------------------------------------+
| "先...再..."  | Pipeline 流水线                                     |
| "同时处理"    | Fan-Out/Gather 扇出聚合                              |
| "分配给不同人"| Coordinator 协调者                                   |
| "反复修改"    | Generator-Critic 生成-批评                           |
| "正反两方面"  | Debate 辩论                                         |
| "团队分层"    | Hierarchical 层级                                    |
| "集思广益"    | MoA 混合智能体                                      |
| "先搜再写"    | Coordinator + Fan-Out + GenCritic (组合)             |
| "大规模项目"  | Hierarchical + Pipeline (组合)                       |
| "方案评选"    | Fan-Out + Debate (组合)                              |
+-------------+------------------------------------------------------+
```

### 10.10.2 性能基准参考

以下数据基于典型配置（GPT-4 class 模型，标准延迟），仅供参考：

| 模式 | 典型延迟 | Token 消耗倍数 | 质量提升 | 适合的 SLA |
|------|---------|---------------|---------|-----------|
| Pipeline (4 stages) | 8-15s | 4x | +10-20% | < 20s |
| Coordinator (5 agents) | 10-25s | 5-8x | +15-25% | < 30s |
| Fan-Out (4 workers) | 5-10s | 4x | +10-15% | < 15s |
| Generator-Critic (3 iter) | 15-30s | 6-10x | +20-40% | < 45s |
| Debate (3 rounds) | 20-40s | 8-12x | +15-30% | < 60s |
| Hierarchical (3 tiers) | 30-60s | 10-20x | +25-40% | < 90s |
| MoA (3x3) | 20-45s | 10-15x | +25-45% | < 60s |

### 10.10.3 额外决策因素

除了任务本身的特征，选择模式时还应考虑：

**预算约束**：
- Token 预算有限时，优先选 Pipeline / Coordinator（消耗可控）
- 预算充裕且追求质量时，可考虑 MoA / Debate

**响应时间要求**：
- 需要实时响应（< 5s）：Pipeline（流式）或预计算
- 允许中等延迟（5-30s）：Coordinator / Fan-Out
- 允许长时间处理（> 30s）：Hierarchical / MoA / 模式组合

**团队经验**：
- 新手团队：Pipeline / Coordinator（简单可控，便于调试）
- 有经验的团队：Hierarchical / MoA / 模式组合

**可观测性需求**：
- Pipeline 天然支持阶段级监控
- Fan-Out 可以逐 Worker 追踪
- Hierarchical 需要较完善的任务树可视化

## 10.11 Anthropic 编排模式参考

2024 年 12 月，Anthropic 发布了「Building Effective Agents」技术博客，提出了一套从简单到复杂的 Agent 编排分类体系。与前面章节介绍的多 Agent 编排模式不同，Anthropic 的框架更聚焦于**单 Agent 内部的工作流组织方式**，并明确区分了 **Workflow（预定义编排）** 和 **Agent（自主决策）** 两个层次。这套分类对理解"何时需要多 Agent、何时单 Agent 工作流就足够"具有重要参考价值。

> **术语说明**：Anthropic 将 LLM 驱动的预定义流程称为 **Workflow**，将拥有自主工具调用能力的系统称为 **Agent**。本节沿用其术语体系。

### 10.11.1 Prompt Chaining（提示链）

**核心思想**：将任务分解为固定步骤序列，每一步的 LLM 输出作为下一步的输入。步骤之间可以插入程序化的"门控"检查（gate check），确保中间结果符合质量要求后再继续。

**适用场景**：
- 任务可自然分解为固定的子步骤
- 愿意用更高延迟换取更高准确性
- 每一步需要不同的 prompt 或模型参数

**与本书模式的映射**：对应 §10.3 Sequential Pipeline 流水线模式的轻量化版本。

```typescript
/** Prompt Chaining — 带门控检查的提示链 */
class PromptChain {
  private steps: ChainStep[] = [];

  addStep(prompt: string, gate?: (output: string) => boolean): this {
    this.steps.push({ prompt, gate });
    return this;
  }

  async execute(initialInput: string, llm: LLMClient): Promise<string> {
    let currentInput = initialInput;

    for (const [i, step] of this.steps.entries()) {
      const output = await llm.generate(
        step.prompt.replace('{{input}}', currentInput)
      );

      // 门控检查：不通过则提前终止
      if (step.gate && !step.gate(output)) {
        throw new Error(`Gate check failed at step ${i}: output did not meet criteria`);
      }

      currentInput = output;
    }

    return currentInput;
  }
}

// 用法示例：生成营销文案 → 翻译 → 合规审查
const chain = new PromptChain()
  .addStep('为以下产品写一段营销文案：{{input}}')
  .addStep('将以下文案翻译为英文：{{input}}')
  .addStep(
    '审查以下营销文案是否合规，返回 PASS 或 FAIL 及原因：{{input}}',
    (output) => output.startsWith('PASS')
  );
```

### 10.11.2 Routing（路由）

**核心思想**：用一次 LLM 调用对输入进行分类，然后将请求路由到不同的专用处理流程。分类与处理分离，各分支可以独立优化 prompt。

**适用场景**：
- 输入类型多样，需要不同处理策略
- 分类准确度可通过 LLM 可靠达成
- 各类别的处理逻辑差异显著

**与本书模式的映射**：对应 §10.2 Coordinator 模式中的路由子模块，以及 §10.3 Pipeline 模式中的条件分支。

```typescript
// 路由模式核心：分类 → 分发
async function routeRequest(input: string, llm: LLMClient) {
  const category = await llm.classify(input, [
    'billing', 'technical_support', 'account_management', 'general_inquiry'
  ]);

  const handlers: Record<string, (input: string) => Promise<string>> = {
    billing: handleBilling,
    technical_support: handleTechSupport,
    account_management: handleAccount,
    general_inquiry: handleGeneral,
  };

  return handlers[category](input);
}
```

### 10.11.3 Parallelization（并行化）

**核心思想**：同时运行多个 LLM 调用，然后程序化地聚合结果。两种子模式：

- **Sectioning（分区）**：将任务拆分为独立子任务并行处理，每个子任务关注不同方面。例如：同时检查代码的安全性、性能和可读性。
- **Voting（投票）**：将同一任务交给多个 LLM 实例（或不同 prompt），通过投票机制决定最终结果。适合需要高置信度的判断场景。

**适用场景**：
- 子任务之间无依赖关系
- 需要多角度审查或高置信度判断
- 延迟预算允许但需要更高质量

**与本书模式的映射**：对应 §10.4 Fan-Out/Gather 扇出聚合模式。Sectioning 对应异构扇出，Voting 对应 §10.6 Debate 模式的简化版。

### 10.11.4 Orchestrator-Workers（编排者-工作者）

**核心思想**：中央编排者 LLM 动态分析任务，决定需要调用哪些子任务以及如何分配。与并行化的区别在于——子任务不是预定义的，而是由编排者根据输入动态规划。

**适用场景**：
- 无法提前预知需要哪些子步骤
- 不同输入需要不同的子任务组合
- 需要在运行时动态调整策略

**与本书模式的映射**：直接对应 §10.2 Coordinator 协调者模式和 §3.2.7 Delegation 委派模式。这是 Anthropic 体系中最接近本书多 Agent 编排的模式。

### 10.11.5 Evaluator-Optimizer（评估者-优化者）

**核心思想**：一个 LLM 生成输出，另一个 LLM 评估输出质量并提供反馈，生成者根据反馈迭代改进，循环直到评估者满意。

**适用场景**：
- 有明确的质量标准可以用 LLM 评估
- 迭代改进能显著提升输出质量
- 可以接受多轮 LLM 调用的延迟和成本

**与本书模式的映射**：直接对应 §10.5 Generator-Critic 生成-批评模式。

### 10.11.6 Autonomous Agent（自主智能体）

**核心思想**：当任务复杂到无法用上述任何预定义工作流模式解决时，赋予 Agent 完整的工具调用能力和自主决策循环——Agent 自行规划、执行、观察结果、调整策略，直到任务完成或达到停止条件。

**适用场景**：
- 开放式问题，无法提前规划所有步骤
- 需要根据中间结果动态调整策略
- 可以容忍较高的成本和延迟，但需要高质量的最终结果

**关键风险**：自主 Agent 的错误会在循环中累积。Anthropic 建议在沙箱环境中运行、设置适当的停止条件（最大迭代次数、超时、成本上限），并通过人机协作（human-in-the-loop）降低风险。

### 10.11.7 模式选择：从 Workflow 到 Agent

Anthropic 的核心建议是**从最简单的方案开始，只在必要时增加复杂度**。以下决策树综合了 Anthropic 的建议与本书的编排模式：

```
                 任务需求分析
                      |
            任务步骤是否固定？
            +--------+--------+
           是                  否
            |                   |
     Prompt Chaining       输入类型是否多样？
      （提示链）            +--------+--------+
                           是                  否
                            |                   |
                        Routing            子任务可否并行？
                         （路由）          +--------+--------+
                                          是                  否
                                           |                   |
                                    Parallelization      需要动态规划？
                                      （并行化）         +--------+--------+
                                                        是                  否
                                                         |                   |
                                              Orchestrator-Workers   需要迭代优化？
                                               （编排者-工作者）     +--------+--------+
                                                                    是                  否
                                                                     |                   |
                                                            Evaluator-Optimizer   Autonomous Agent
                                                             （评估者-优化者）     （自主智能体）
```

> **实践建议**：大多数实际项目中，Prompt Chaining + Routing + Parallelization 的组合就能解决 80% 的需求。只有在这些简单模式明显不够用时，才考虑引入 Orchestrator-Workers 或完全自主的 Agent。这与本书 §10.10 模式选择决策树的"从简单开始"原则完全一致。

---


---

## 10.12 本章小结

### 10.12.1 核心要点回顾

本章系统介绍了九种 Multi-Agent 编排模式，从简单到复杂依次为：

1. **Coordinator 协调者模式** -- 星形拓扑，中心化决策，最通用的起点。
   关键实现要素：LLM 任务分解、动态专家匹配、结果验证、带记忆的分配优化。

2. **Sequential Pipeline 流水线模式** -- 链式拓扑，确定性顺序处理。
   关键实现要素：类型安全的泛型链、条件分支、性能监控、流式处理。

3. **Fan-Out/Gather 扇出聚合模式** -- 扇形拓扑，并行提升吞吐。
   关键实现要素：加权聚合、选择性扇出、渐进式返回、语义去重。

4. **Generator-Critic 生成-批评模式** -- 环形拓扑，迭代质量优化。
   关键实现要素：多维度评审面板、收敛检测、工具辅助验证。

5. **Debate 辩论模式** -- 全连接拓扑，对抗性探索。
   关键实现要素：角色立场分配、结构化辩论流程、论点评分、证据引用。

6. **Hierarchical 层级模式** -- 树形拓扑，大规模分治。
   关键实现要素：递归任务分解、权限层级、上级审批、横向协调。

7. **Mixture of Agents 混合模式** -- 分层拓扑，质量最大化。
   关键实现要素：多层 Proposer-Aggregator-Refiner、成本-质量权衡、提前终止。

8. **模式组合** -- 复合拓扑，应对真实复杂系统。
   关键实现要素：嵌套规则、超时传递、错误冒泡、角色化 LLM 配置。

### 10.12.2 设计原则

在构建 Multi-Agent 系统时，始终牢记以下原则：

```typescript
/**
 * Multi-Agent 编排设计原则
 */
const ORCHESTRATION_PRINCIPLES = {
  // 1. 从简单开始，按需增加复杂度
  simplicity: '先用 Coordinator/Pipeline，只在证明不够时才引入复杂模式',

  // 2. 单一职责
  singleResponsibility: '每个 Agent 只做一件事，做到最好',

  // 3. 可观测性优先
  observability: '每个模式都必须输出 metrics，能追踪每个 Agent 的表现',

  // 4. 优雅降级
  gracefulDegradation: '部分 Agent 失败时，系统仍能给出有意义的结果',

  // 5. 成本意识
  costAwareness: '每个 LLM 调用都有成本，选择模式时考虑 token 预算',

  // 6. 类型安全
  typeSafety: '利用 TypeScript 泛型确保 Agent 间数据流的类型正确',

  // 7. 超时控制
  timeoutControl: '每层都有超时，外层 > 内层之和，避免无限等待',
} as const;
```

### 10.12.3 下一步

掌握了编排模式后，你已经具备构建 Multi-Agent 系统的架构能力。
接下来在第 11 章中，我们将探讨 **Multi-Agent 框架对比与选型**——
如何让 Agent 之间高效、可靠地传递信息，是大规模 Multi-Agent 系统的另一核心挑战。

---

> **本章完**
>
> 章节统计：9 种编排模式 | 15+ 个生产级 TypeScript 实现 |
> 1 个完整组合案例（AI 研究助手）| 1 棵决策树 | 1 张速查卡
