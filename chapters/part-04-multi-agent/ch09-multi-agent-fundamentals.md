# 第 9 章 Multi-Agent 基础

> **"一个人可以走得很快，但一群人可以走得更远。"**
> —— 非洲谚语，同样适用于 AI Agent

在前面的章节中，我们深入探讨了如何构建一个功能强大的单体 Agent——它能理解意图、调用工具、管理记忆、规划任务。然而，随着业务场景的复杂度不断攀升，单一 Agent 不可避免地会面临能力瓶颈。本章将带你走进 **Multi-Agent（多智能体）** 的世界，学习如何让多个 Agent 协同工作，共同完成复杂任务。

我们将从"为什么"出发，深入理解 Multi-Agent 的核心原语、通信机制、身份管理、状态协调和容错策略，最后通过一个完整的客服系统实战案例将所有知识串联起来。

---

## 9.1 为什么需要 Multi-Agent

### 9.1.1 单体 Agent 的天花板

一个典型的单体 Agent 架构如下：用户输入 → LLM 推理 → 工具调用 → 输出结果。这个模式在简单场景下运行良好，但当面对以下挑战时就会力不从心：

1. **Prompt 膨胀**：当 Agent 需要处理客服、订单、退款、技术支持等多种场景时，System Prompt 会变得极其冗长，导致 LLM 性能下降。
2. **工具冲突**：不同领域的工具可能有命名冲突或语义重叠，LLM 难以正确选择。
3. **上下文窗口限制**：即使最先进的模型也有上下文长度限制，单个 Agent 无法承载所有信息。
4. **单点故障**：一个 Agent 出错，整个系统崩溃，没有降级方案。
5. **难以扩展**：新增能力意味着修改已有的复杂 Prompt，回归测试成本极高。

### 9.1.2 Single Agent vs Multi-Agent 对比

下表从多个维度对比了两种架构：

| 维度 | Single Agent | Multi-Agent |
|------|-------------|-------------|
| **复杂度管理** | 所有逻辑集中在一个 Prompt，复杂度 O(n²) 增长 | 每个 Agent 职责单一，复杂度 O(n) 线性增长 |
| **可扩展性** | 新增能力需修改核心 Prompt，牵一发而动全身 | 新增 Agent 即可，对现有系统零侵入 |
| **可靠性** | 单点故障，一处出错全盘崩溃 | 故障隔离，单个 Agent 失败不影响整体 |
| **成本** | 每次调用都携带完整上下文，Token 消耗大 | 各 Agent 仅携带必要上下文，Token 更节省 |
| **开发效率** | 团队无法并行开发，互相阻塞 | 不同团队负责不同 Agent，并行开发 |
| **调试难度** | 日志集中但混杂，定位问题如大海捞针 | 各 Agent 日志独立，但链路追踪更复杂 |
| **一致性** | 天然一致，同一 LLM 调用 | 需要显式协调机制保证一致性 |
| **延迟** | 单次 LLM 调用 | 可能涉及多次 LLM 调用，但可并行化 |

### 9.1.3 什么时候不需要 Multi-Agent

Multi-Agent 并非银弹。以下场景中，单体 Agent 可能是更好的选择：

- **简单任务**：如果任务流程固定、工具数量少于 5 个，单体 Agent 足矣。
- **低延迟要求**：Multi-Agent 的协调开销可能无法满足实时性要求。
- **预算有限**：多个 Agent 意味着更多的 LLM 调用，成本成倍增加。
- **团队规模小**：如果只有 1-2 个开发者，维护多个 Agent 的开销可能得不偿失。
- **原型阶段**：先用单体 Agent 验证想法，确认可行后再拆分。

> **设计原则**：遵循 YAGNI（You Aren't Gonna Need It）。在单体 Agent 确实遇到瓶颈时再考虑拆分，不要过早优化。

### 9.1.4 Multi-Agent 设计原则

当确定需要 Multi-Agent 架构时，请遵循以下设计原则：

**原则一：单一职责（Single Responsibility）**

每个 Agent 只负责一个明确的领域。一个处理订单的 Agent 不应该同时处理用户认证。

**原则二：松耦合（Loose Coupling）**

Agent 之间通过消息通信，不直接引用彼此的内部状态。更换或升级某个 Agent 不应影响其他 Agent。

**原则三：清晰接口（Clear Interfaces）**

每个 Agent 对外暴露明确的能力描述（AgentCard）和消息协议，就像微服务的 API 契约一样。

**原则四：容错设计（Fail-Safe）**

假设任何 Agent 都可能失败，系统必须有降级方案。永远不要让一个 Agent 的故障拖垮整个系统。

### 9.1.5 架构演进路径

Agent 架构的演进通常经历四个阶段：

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Monolith   │    │   Modular    │    │   Multi-     │    │    Agent     │
│    Agent     │ →  │    Agent     │ →  │   Agent      │ →  │    Swarm     │
│             │    │             │    │   System     │    │             │
│ 所有逻辑集中  │    │ 内部模块拆分  │    │ 独立Agent协作 │    │ 自组织Agent群 │
│ 在单一Prompt │    │ 但同一进程   │    │ 消息通信     │    │ 动态涌现行为  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
    阶段1              阶段2              阶段3              阶段4
  适合MVP验证       适合中等复杂度       适合企业级应用       适合研究/前沿场景
```

下面我们用 TypeScript 定义一个基础的 Agent 接口，后续所有代码都将基于此接口构建：

```typescript
/**
 * Agent 的基础接口定义
 * 所有 Agent 都必须实现该接口，确保统一的交互协议
 */
interface AgentConfig {
  /** Agent 唯一标识 */
  id: string;
  /** Agent 名称，用于日志和调试 */
  name: string;
  /** Agent 能力描述，用于路由决策 */
  description: string;
  /** 使用的 LLM 模型标识 */
  model: string;
  /** Agent 可用的工具列表 */
  tools: Tool[];
  /** 最大重试次数 */
  maxRetries: number;
  /** 单次执行超时时间（毫秒） */
  timeoutMs: number;
}

interface AgentInput {
  /** 任务唯一标识，用于链路追踪 */
  taskId: string;
  /** 用户原始消息或上游 Agent 传递的消息 */
  message: string;
  /** 上下文信息，包含历史对话、共享状态等 */
  context: Record<string, unknown>;
  /** 来源 Agent 的 ID，用于追踪调用链 */
  sourceAgentId?: string;
}

interface AgentOutput {
  /** 任务唯一标识 */
  taskId: string;
  /** Agent 处理结果 */
  result: string;
  /** 结构化数据输出 */
  data?: Record<string, unknown>;
  /** 执行状态 */
  status: "success" | "partial" | "error";
  /** 执行耗时（毫秒） */
  durationMs: number;
  /** 消耗的 Token 数量 */
  tokensUsed: number;
  /** 如果需要交接给其他 Agent */
  handoff?: { targetAgentId: string; reason: string };
}

interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}

/**
 * 所有 Agent 的抽象基类
 */
abstract class BaseAgent {
  protected config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  /** 获取 Agent 唯一标识 */
  get id(): string {
    return this.config.id;
  }

  /** 获取 Agent 名称 */
  get name(): string {
    return this.config.name;
  }

  /**
   * 执行任务的核心方法，子类必须实现
   * @param input - Agent 输入
   * @returns Agent 输出
   */
  abstract execute(input: AgentInput): Promise<AgentOutput>;

  /**
   * 带重试的执行方法
   */
  async executeWithRetry(input: AgentInput): Promise<AgentOutput> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this.executeWithTimeout(input);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(
          `[${this.config.name}] 第 ${attempt + 1} 次执行失败: ${lastError.message}`
        );

        if (attempt < this.config.maxRetries) {
          // 指数退避等待
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
          await this.sleep(backoffMs);
        }
      }
    }

    return {
      taskId: input.taskId,
      result: `Agent ${this.config.name} 执行失败: ${lastError?.message}`,
      status: "error",
      durationMs: 0,
      tokensUsed: 0,
    };
  }

  /** 带超时的执行方法 */
  private async executeWithTimeout(input: AgentInput): Promise<AgentOutput> {
    return Promise.race([
      this.execute(input),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Agent ${this.config.name} 执行超时`)),
          this.config.timeoutMs
        )
      ),
    ]);
  }

  /** 辅助睡眠函数 */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

---

## 9.2 Google ADK 三原语：Sequential、Parallel、Loop

Google 的 Agent Development Kit（ADK）提出了三种基础的 Agent 编排原语。这三种原语像乐高积木一样，可以组合出几乎所有的 Multi-Agent 工作流。我们将在本节深入实现每一种原语，并探讨其高级用法。

### 9.2.1 SequentialAgent：流水线编排

SequentialAgent 将多个 Agent 按顺序串联，前一个 Agent 的输出作为下一个 Agent 的输入，形成一条处理流水线。

**核心概念：**

```
输入 → [Agent A] → [Agent B] → [Agent C] → 输出
         ↓上下文传递↓    ↓上下文传递↓
```

#### 基础实现

```typescript
/**
 * 错误处理策略枚举
 * 定义当某个步骤失败时的处理方式
 */
enum ErrorHandlingPolicy {
  /** 立即停止流水线，返回错误 */
  STOP = "stop",
  /** 跳过失败步骤，继续执行下一步 */
  SKIP = "skip",
  /** 重试失败步骤（使用 Agent 自身的重试逻辑） */
  RETRY = "retry",
  /** 使用备用 Agent 替代失败的 Agent */
  FALLBACK = "fallback",
}

/**
 * 流水线步骤定义
 */
interface PipelineStep {
  /** 主要执行的 Agent */
  agent: BaseAgent;
  /** 备用 Agent（当 policy 为 FALLBACK 时使用） */
  fallbackAgent?: BaseAgent;
  /** 该步骤的错误处理策略 */
  errorPolicy: ErrorHandlingPolicy;
  /** 是否为必要步骤（如果是可选步骤，跳过不影响结果） */
  required: boolean;
  /**
   * 上下文转换函数：将当前步骤的输出转换为下一步骤的输入
   * 如果不提供，默认将上一步的 result 作为下一步的 message
   */
  contextTransform?: (
    currentOutput: AgentOutput,
    accumulatedState: Record<string, unknown>
  ) => AgentInput;
}

/**
 * SequentialAgent：流水线编排
 *
 * 将多个 Agent 按顺序串联执行，支持：
 * - 灵活的错误处理策略（停止/跳过/重试/备用）
 * - 上下文在步骤间的传递和累积
 * - 详细的执行日志和性能统计
 */
class SequentialAgent extends BaseAgent {
  private steps: PipelineStep[];

  constructor(config: AgentConfig, steps: PipelineStep[]) {
    super(config);
    this.steps = steps;
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    let totalTokens = 0;

    // 累积状态：在整个流水线中共享
    const accumulatedState: Record<string, unknown> = {
      ...input.context,
      originalMessage: input.message,
    };

    // 当前步骤的输入（初始为外部输入）
    let currentInput: AgentInput = { ...input };

    // 记录每个步骤的执行结果
    const stepResults: Array<{
      agentName: string;
      status: string;
      durationMs: number;
    }> = [];

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      const stepStartTime = Date.now();

      console.log(
        `[SequentialAgent] 执行步骤 ${i + 1}/${this.steps.length}: ${step.agent.name}`
      );

      try {
        // 尝试执行当前步骤
        let output = await this.executeStep(step, currentInput);

        // 如果主 Agent 失败且有备用策略
        if (
          output.status === "error" &&
          step.errorPolicy === ErrorHandlingPolicy.FALLBACK
        ) {
          if (step.fallbackAgent) {
            console.log(
              `[SequentialAgent] 主 Agent 失败，切换到备用: ${step.fallbackAgent.name}`
            );
            output = await step.fallbackAgent.executeWithRetry(currentInput);
          }
        }

        // 处理失败情况
        if (output.status === "error") {
          switch (step.errorPolicy) {
            case ErrorHandlingPolicy.STOP:
              return {
                taskId: input.taskId,
                result: `流水线在步骤 ${i + 1}(${step.agent.name}) 失败: ${output.result}`,
                status: "error",
                durationMs: Date.now() - startTime,
                tokensUsed: totalTokens,
              };

            case ErrorHandlingPolicy.SKIP:
              console.warn(
                `[SequentialAgent] 跳过失败步骤: ${step.agent.name}`
              );
              stepResults.push({
                agentName: step.agent.name,
                status: "skipped",
                durationMs: Date.now() - stepStartTime,
              });
              continue;

            case ErrorHandlingPolicy.RETRY:
              if (step.required) {
                return {
                  taskId: input.taskId,
                  result: `必要步骤 ${step.agent.name} 重试后仍然失败`,
                  status: "error",
                  durationMs: Date.now() - startTime,
                  tokensUsed: totalTokens,
                };
              }
              continue;

            default:
              continue;
          }
        }

        // 步骤成功：更新累积状态
        totalTokens += output.tokensUsed;
        accumulatedState[`step_${i}_result`] = output.result;
        accumulatedState[`step_${i}_data`] = output.data;

        // 构建下一步的输入
        if (step.contextTransform) {
          currentInput = step.contextTransform(output, accumulatedState);
        } else {
          currentInput = {
            taskId: input.taskId,
            message: output.result,
            context: accumulatedState,
            sourceAgentId: step.agent.id,
          };
        }

        stepResults.push({
          agentName: step.agent.name,
          status: "success",
          durationMs: Date.now() - stepStartTime,
        });

        // 检查是否需要 handoff（提前终止流水线）
        if (output.handoff) {
          console.log(
            `[SequentialAgent] Agent ${step.agent.name} 请求 handoff 到 ` +
            `${output.handoff.targetAgentId}`
          );
          return {
            ...output,
            data: { ...output.data, stepResults, accumulatedState },
          };
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(
          `[SequentialAgent] 步骤 ${step.agent.name} 异常: ${errMsg}`
        );

        if (step.required) {
          return {
            taskId: input.taskId,
            result: `流水线异常中断: ${errMsg}`,
            status: "error",
            durationMs: Date.now() - startTime,
            tokensUsed: totalTokens,
          };
        }
      }
    }

    // 所有步骤执行完毕
    return {
      taskId: input.taskId,
      result:
        (accumulatedState[`step_${this.steps.length - 1}_result`] as string) ??
        "流水线执行完毕",
      data: { stepResults, accumulatedState },
      status: stepResults.some((r) => r.status === "skipped")
        ? "partial"
        : "success",
      durationMs: Date.now() - startTime,
      tokensUsed: totalTokens,
    };
  }

  /** 执行单个步骤 */
  private async executeStep(
    step: PipelineStep,
    input: AgentInput
  ): Promise<AgentOutput> {
    if (step.errorPolicy === ErrorHandlingPolicy.RETRY) {
      return step.agent.executeWithRetry(input);
    }
    return step.agent.execute(input);
  }
}
```

#### SequentialAgentWithState：带状态累积的流水线

在许多实际场景中，后续步骤需要访问前面所有步骤的中间结果。以下是增强版本，支持类型安全的状态传递：

```typescript
/**
 * 类型安全的流水线状态
 */
interface PipelineState<T extends Record<string, unknown> = Record<string, unknown>> {
  originalInput: AgentInput;
  intermediateResults: Map<string, AgentOutput>;
  customData: T;
  metadata: {
    startTime: number;
    currentStep: number;
    totalSteps: number;
    totalTokens: number;
  };
}

/**
 * 状态感知的流水线步骤
 */
interface StatefulPipelineStep<T extends Record<string, unknown>> {
  agent: BaseAgent;
  inputSelector: (state: PipelineState<T>) => AgentInput;
  stateUpdater: (state: PipelineState<T>, output: AgentOutput) => void;
  errorPolicy: ErrorHandlingPolicy;
  required: boolean;
}

/**
 * 带类型安全状态的 SequentialAgent
 *
 * 适用场景：
 * - 文档处理流水线：提取 → 翻译 → 校对 → 排版
 * - 数据分析流水线：采集 → 清洗 → 分析 → 可视化
 */
class SequentialAgentWithState<
  T extends Record<string, unknown>
> extends BaseAgent {
  private steps: StatefulPipelineStep<T>[];
  private initialState: T;

  constructor(
    config: AgentConfig,
    steps: StatefulPipelineStep<T>[],
    initialState: T
  ) {
    super(config);
    this.steps = steps;
    this.initialState = initialState;
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const state: PipelineState<T> = {
      originalInput: input,
      intermediateResults: new Map(),
      customData: { ...this.initialState },
      metadata: {
        startTime: Date.now(),
        currentStep: 0,
        totalSteps: this.steps.length,
        totalTokens: 0,
      },
    };

    for (let i = 0; i < this.steps.length; i++) {
      state.metadata.currentStep = i;
      const step = this.steps[i];

      console.log(
        `[StatefulPipeline] 步骤 ${i + 1}/${this.steps.length}: ${step.agent.name}`
      );

      try {
        const stepInput = step.inputSelector(state);
        const output = await step.agent.executeWithRetry(stepInput);

        if (output.status === "error" && step.required) {
          return {
            taskId: input.taskId,
            result: `必要步骤 ${step.agent.name} 失败: ${output.result}`,
            status: "error",
            durationMs: Date.now() - state.metadata.startTime,
            tokensUsed: state.metadata.totalTokens,
          };
        }

        state.intermediateResults.set(step.agent.id, output);
        state.metadata.totalTokens += output.tokensUsed;
        step.stateUpdater(state, output);
      } catch (error) {
        if (step.required) throw error;
        console.warn(
          `[StatefulPipeline] 可选步骤 ${step.agent.name} 失败，已跳过`
        );
      }
    }

    return {
      taskId: input.taskId,
      result: JSON.stringify(state.customData),
      data: { pipelineState: state.customData },
      status: "success",
      durationMs: Date.now() - state.metadata.startTime,
      tokensUsed: state.metadata.totalTokens,
    };
  }
}

// ── 使用示例：文档翻译流水线 ──

interface TranslationState extends Record<string, unknown> {
  extractedText: string;
  translatedText: string;
  proofreadText: string;
  qualityScore: number;
}

/*
const translationPipeline = new SequentialAgentWithState<TranslationState>(
  {
    id: "translation-pipeline",
    name: "文档翻译流水线",
    description: "从文档中提取文本、翻译、校对的完整流水线",
    model: "gpt-4", tools: [], maxRetries: 2, timeoutMs: 60000,
  },
  [
    {
      agent: textExtractorAgent,
      inputSelector: (state) => state.originalInput,
      stateUpdater: (state, output) => {
        state.customData.extractedText = output.result;
      },
      errorPolicy: ErrorHandlingPolicy.STOP,
      required: true,
    },
    {
      agent: translatorAgent,
      inputSelector: (state) => ({
        taskId: state.originalInput.taskId,
        message: state.customData.extractedText,
        context: { targetLanguage: "zh-CN" },
      }),
      stateUpdater: (state, output) => {
        state.customData.translatedText = output.result;
      },
      errorPolicy: ErrorHandlingPolicy.RETRY,
      required: true,
    },
    {
      agent: proofreaderAgent,
      inputSelector: (state) => ({
        taskId: state.originalInput.taskId,
        message: state.customData.translatedText,
        context: { original: state.customData.extractedText },
      }),
      stateUpdater: (state, output) => {
        state.customData.proofreadText = output.result;
        state.customData.qualityScore = (output.data?.score as number) ?? 0;
      },
      errorPolicy: ErrorHandlingPolicy.SKIP,
      required: false,
    },
  ],
  { extractedText: "", translatedText: "", proofreadText: "", qualityScore: 0 }
);
*/
```

### 9.2.2 ParallelAgent：并行执行

ParallelAgent 让多个 Agent 同时执行任务，最后将结果合并。这在需要多视角分析、数据并行处理等场景中非常有用。

**核心概念：**

```
         ┌→ [Agent A] →┐
输入 ──→ ├→ [Agent B] →├──→ 结果合并 → 输出
         └→ [Agent C] →┘
```

#### 结果合并策略与完整实现

```typescript
/**
 * 并行执行的结果合并策略
 */
enum MergeStrategy {
  /** 取第一个完成的结果（适合速度优先场景） */
  FIRST_WINS = "first_wins",
  /** 等所有完成，取多数一致的结果（适合准确性优先） */
  MAJORITY_VOTE = "majority_vote",
  /** 等所有完成，按质量评分选最佳（需要评估函数） */
  QUALITY_SCORE = "quality_score",
  /** 将所有结果合并为一个综合结果 */
  MERGE_ALL = "merge_all",
  /** 自定义合并逻辑 */
  CUSTOM = "custom",
}

/**
 * 并行 Agent 配置
 */
interface ParallelAgentOptions {
  agents: BaseAgent[];
  mergeStrategy: MergeStrategy;
  /** 全局超时时间（毫秒），超时后返回已完成的部分结果 */
  timeoutMs: number;
  /** 最大并发数，用于控制 API 速率限制 */
  maxConcurrency: number;
  /** 最少需要几个 Agent 返回结果才算成功 */
  minResults: number;
  customMerger?: (results: AgentOutput[]) => AgentOutput;
  qualityScorer?: (output: AgentOutput) => number;
}

/**
 * 信号量实现：控制并发数量
 *
 * 在并行执行多个 Agent 时，避免同时发起过多 API 请求
 * 导致速率限制（Rate Limit）错误
 */
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    const next = this.waitQueue.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }
}

/**
 * ParallelAgent：并行编排
 *
 * 支持特性：
 * - 多种结果合并策略（首胜/多数投票/质量评分/全合并/自定义）
 * - 超时控制与部分结果返回
 * - 基于信号量的并发限制
 * - 资源感知的并行度控制
 */
class ParallelAgent extends BaseAgent {
  private options: ParallelAgentOptions;

  constructor(config: AgentConfig, options: ParallelAgentOptions) {
    super(config);
    this.options = options;
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    const semaphore = new Semaphore(this.options.maxConcurrency);

    const agentPromises = this.options.agents.map((agent) =>
      this.executeWithSemaphore(semaphore, agent, input)
    );

    let results: AgentOutput[];

    if (this.options.mergeStrategy === MergeStrategy.FIRST_WINS) {
      const firstResult = await this.raceWithTimeout(agentPromises);
      results = firstResult ? [firstResult] : [];
    } else {
      results = await this.allWithTimeout(agentPromises);
    }

    const successResults = results.filter((r) => r.status !== "error");

    if (successResults.length < this.options.minResults) {
      return {
        taskId: input.taskId,
        result: `并行执行未达到最少结果要求: 需要 ${this.options.minResults}，实际 ${successResults.length}`,
        status: "error",
        durationMs: Date.now() - startTime,
        tokensUsed: results.reduce((sum, r) => sum + r.tokensUsed, 0),
      };
    }

    const merged = this.mergeResults(input, successResults, results);
    merged.durationMs = Date.now() - startTime;
    return merged;
  }

  private async executeWithSemaphore(
    semaphore: Semaphore,
    agent: BaseAgent,
    input: AgentInput
  ): Promise<AgentOutput> {
    await semaphore.acquire();
    try {
      return await agent.executeWithRetry(input);
    } finally {
      semaphore.release();
    }
  }

  /** 竞速模式：返回第一个成功的结果 */
  private async raceWithTimeout(
    promises: Promise<AgentOutput>[]
  ): Promise<AgentOutput | null> {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; resolve(null); }
      }, this.options.timeoutMs);

      promises.forEach((p) =>
        p.then((result) => {
            if (!settled && result.status !== "error") {
              settled = true;
              clearTimeout(timer);
              resolve(result);
            }
          }).catch(() => {})
      );
    });
  }

  /** 全部等待模式：带超时收集所有结果 */
  private async allWithTimeout(
    promises: Promise<AgentOutput>[]
  ): Promise<AgentOutput[]> {
    const results: AgentOutput[] = [];
    const wrapped = promises.map((p) =>
      p.then((r) => { results.push(r); }).catch(() => {})
    );
    await Promise.race([
      Promise.allSettled(wrapped),
      new Promise<void>((resolve) =>
        setTimeout(resolve, this.options.timeoutMs)
      ),
    ]);
    return results;
  }

  /** 根据策略合并结果 */
  private mergeResults(
    input: AgentInput,
    successResults: AgentOutput[],
    allResults: AgentOutput[]
  ): AgentOutput {
    const totalTokens = allResults.reduce((sum, r) => sum + r.tokensUsed, 0);

    switch (this.options.mergeStrategy) {
      case MergeStrategy.FIRST_WINS:
        return { ...successResults[0], tokensUsed: totalTokens };

      case MergeStrategy.MAJORITY_VOTE:
        return this.majorityVote(input, successResults, totalTokens);

      case MergeStrategy.QUALITY_SCORE:
        return this.qualityScoreSelect(successResults, totalTokens);

      case MergeStrategy.MERGE_ALL:
        return {
          taskId: input.taskId,
          result: successResults.map((r) => r.result).join("\n\n---\n\n"),
          status: "success",
          durationMs: 0,
          tokensUsed: totalTokens,
          data: { mergeStrategy: "merge_all", individualResults: successResults.map((r) => r.result) },
        };

      case MergeStrategy.CUSTOM:
        if (this.options.customMerger) return this.options.customMerger(successResults);
        return successResults[0];

      default:
        return successResults[0];
    }
  }

  /** 多数投票合并 */
  private majorityVote(
    input: AgentInput, results: AgentOutput[], totalTokens: number
  ): AgentOutput {
    const voteMap = new Map<string, { count: number; output: AgentOutput }>();
    for (const result of results) {
      const fp = result.result.substring(0, 200).trim();
      const existing = voteMap.get(fp);
      if (existing) existing.count++;
      else voteMap.set(fp, { count: 1, output: result });
    }
    let maxVotes = 0;
    let winner: AgentOutput = results[0];
    for (const [, entry] of voteMap) {
      if (entry.count > maxVotes) { maxVotes = entry.count; winner = entry.output; }
    }
    return { ...winner, tokensUsed: totalTokens, data: { ...winner.data, mergeStrategy: "majority_vote", votes: maxVotes } };
  }

  /** 质量评分选择 */
  private qualityScoreSelect(results: AgentOutput[], totalTokens: number): AgentOutput {
    const scorer = this.options.qualityScorer ?? (() => 0);
    let bestScore = -Infinity;
    let bestResult: AgentOutput = results[0];
    for (const result of results) {
      const score = scorer(result);
      if (score > bestScore) { bestScore = score; bestResult = result; }
    }
    return { ...bestResult, tokensUsed: totalTokens, data: { ...bestResult.data, mergeStrategy: "quality_score", bestScore } };
  }
}
```

### 9.2.3 LoopAgent：迭代优化

LoopAgent 让一个或多个 Agent 反复执行，直到满足某个终止条件。这在需要迭代优化的场景中非常常见，比如写作→评审→修改、代码→测试→修复等。

**核心概念：**

```
        ┌─────────────────────────┐
        ↓                         │
输入 → [Agent] → 评估 → 满足? ──否──┘
                          │
                         是
                          ↓
                        输出
```

#### 完整实现

```typescript
/**
 * 循环终止条件
 */
interface LoopTermination {
  maxIterations: number;
  maxTokens: number;
  maxTimeMs: number;
  shouldStop: (
    output: AgentOutput,
    iteration: number,
    history: AgentOutput[]
  ) => boolean;
}

/**
 * 收敛检测配置
 */
interface ConvergenceConfig {
  scoreFunction: (output: AgentOutput) => number;
  minImprovement: number;
  patience: number;
}

/**
 * LoopAgent：迭代优化编排
 *
 * 支持特性：
 * - 多维度终止条件（次数/Token/时间）
 * - 收敛检测（自动判断何时停止迭代）
 * - 可选的评审 Agent（每轮迭代后评估）
 * - 详细的迭代历史记录
 */
class LoopAgent extends BaseAgent {
  private innerAgent: BaseAgent;
  private termination: LoopTermination;
  private convergence?: ConvergenceConfig;
  private reviewerAgent?: BaseAgent;

  constructor(
    config: AgentConfig,
    innerAgent: BaseAgent,
    termination: LoopTermination,
    convergence?: ConvergenceConfig,
    reviewerAgent?: BaseAgent
  ) {
    super(config);
    this.innerAgent = innerAgent;
    this.termination = termination;
    this.convergence = convergence;
    this.reviewerAgent = reviewerAgent;
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    let totalTokens = 0;
    const history: AgentOutput[] = [];
    let currentInput = { ...input };
    let bestScore = -Infinity;
    let stagnationCount = 0;

    for (let iter = 1; iter <= this.termination.maxIterations; iter++) {
      console.log(`[LoopAgent] 迭代 ${iter}/${this.termination.maxIterations}`);

      // 检查时间预算
      if (Date.now() - startTime > this.termination.maxTimeMs) {
        console.log(`[LoopAgent] 达到时间限制，终止迭代`);
        break;
      }

      // 检查 Token 预算
      if (totalTokens >= this.termination.maxTokens) {
        console.log(`[LoopAgent] 达到 Token 预算限制，终止迭代`);
        break;
      }

      // 注入迭代上下文
      currentInput.context = {
        ...currentInput.context,
        iteration: iter,
        maxIterations: this.termination.maxIterations,
        previousAttempts: history.map((h) => h.result),
        remainingTokenBudget: this.termination.maxTokens - totalTokens,
      };

      const output = await this.innerAgent.executeWithRetry(currentInput);
      totalTokens += output.tokensUsed;
      history.push(output);

      if (output.status === "error") {
        console.warn(`[LoopAgent] 迭代 ${iter} 执行出错，终止`);
        break;
      }

      // 如果有评审 Agent，进行评审
      if (this.reviewerAgent) {
        const reviewInput: AgentInput = {
          taskId: input.taskId,
          message: `请评审以下结果:\n\n${output.result}`,
          context: {
            originalTask: input.message,
            iteration: iter,
            previousResults: history.slice(0, -1).map((h) => h.result),
          },
          sourceAgentId: this.innerAgent.id,
        };
        const review = await this.reviewerAgent.executeWithRetry(reviewInput);
        totalTokens += review.tokensUsed;

        currentInput = {
          taskId: input.taskId,
          message: input.message,
          context: { ...currentInput.context, lastResult: output.result, reviewFeedback: review.result },
          sourceAgentId: this.id,
        };
      } else {
        currentInput = {
          taskId: input.taskId,
          message: input.message,
          context: { ...currentInput.context, lastResult: output.result },
          sourceAgentId: this.id,
        };
      }

      // 检查自定义终止条件
      if (this.termination.shouldStop(output, iter, history)) {
        console.log(`[LoopAgent] 满足终止条件，停止迭代`);
        break;
      }

      // 收敛检测
      if (this.convergence) {
        const currentScore = this.convergence.scoreFunction(output);
        const improvement = currentScore - bestScore;
        console.log(
          `[LoopAgent] 迭代 ${iter} 评分: ${currentScore.toFixed(3)}, 改善: ${improvement.toFixed(3)}`
        );
        if (improvement < this.convergence.minImprovement) {
          stagnationCount++;
          if (stagnationCount >= this.convergence.patience) {
            console.log(`[LoopAgent] 连续 ${stagnationCount} 次改善不足，判定已收敛`);
            break;
          }
        } else {
          stagnationCount = 0;
          bestScore = currentScore;
        }
      }
    }

    const finalResult = history[history.length - 1];
    return {
      taskId: input.taskId,
      result: finalResult?.result ?? "循环未产生结果",
      data: {
        totalIterations: history.length,
        iterationHistory: history.map((h, i) => ({
          iteration: i + 1,
          status: h.status,
          resultPreview: h.result.substring(0, 100),
          tokensUsed: h.tokensUsed,
        })),
        converged: this.convergence ? stagnationCount >= (this.convergence.patience ?? 3) : undefined,
      },
      status: finalResult?.status ?? "error",
      durationMs: Date.now() - startTime,
      tokensUsed: totalTokens,
    };
  }
}
```

#### ProgressiveLoopAgent：渐进式质量要求

每次迭代提出更高的质量标准，让 Agent 逐步完善输出：

```typescript
interface QualityLevel {
  name: string;
  requirement: string;
  minScore: number;
}

/**
 * ProgressiveLoopAgent：渐进式迭代优化
 *
 * 典型应用：
 * - 第一轮：生成初稿（关注完整性）
 * - 第二轮：优化结构（关注逻辑性）
 * - 第三轮：润色文字（关注可读性）
 * - 第四轮：最终检查（关注准确性）
 */
class ProgressiveLoopAgent extends BaseAgent {
  private innerAgent: BaseAgent;
  private qualityLevels: QualityLevel[];
  private scorer: (output: AgentOutput) => number;

  constructor(
    config: AgentConfig,
    innerAgent: BaseAgent,
    qualityLevels: QualityLevel[],
    scorer: (output: AgentOutput) => number
  ) {
    super(config);
    this.innerAgent = innerAgent;
    this.qualityLevels = qualityLevels;
    this.scorer = scorer;
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    let totalTokens = 0;
    let lastOutput: AgentOutput | null = null;

    for (let i = 0; i < this.qualityLevels.length; i++) {
      const level = this.qualityLevels[i];
      console.log(
        `[ProgressiveLoop] 阶段 ${i + 1}/${this.qualityLevels.length}: ${level.name}`
      );

      const stepInput: AgentInput = {
        taskId: input.taskId,
        message: input.message,
        context: {
          ...input.context,
          qualityRequirement: level.requirement,
          currentPhase: level.name,
          previousResult: lastOutput?.result,
          phaseIndex: i,
          totalPhases: this.qualityLevels.length,
        },
        sourceAgentId: this.id,
      };

      const output = await this.innerAgent.executeWithRetry(stepInput);
      totalTokens += output.tokensUsed;

      const score = this.scorer(output);
      console.log(
        `[ProgressiveLoop] ${level.name} 评分: ${score.toFixed(3)}, 要求: ${level.minScore}`
      );

      lastOutput = output;
    }

    return {
      taskId: input.taskId,
      result: lastOutput?.result ?? "渐进式迭代未产生结果",
      data: { totalPhases: this.qualityLevels.length },
      status: lastOutput?.status ?? "error",
      durationMs: Date.now() - startTime,
      tokensUsed: totalTokens,
    };
  }
}
```

---

## 9.3 通信机制

Multi-Agent 系统中，Agent 之间如何高效、可靠地传递信息是核心问题。本节介绍三种基础通信模式：**Direct Message（直接消息）**、**Blackboard（黑板）** 和 **Event Stream（事件流）**。

### 9.3.1 Direct Message：点对点通信

Direct Message 是最简单直观的通信方式：Agent A 直接向 Agent B 发送消息，并等待回复。

#### 类型化消息协议

```typescript
enum MessagePriority {
  LOW = 0, NORMAL = 1, HIGH = 2, CRITICAL = 3,
}

interface BaseMessage {
  messageId: string;
  senderId: string;
  receiverId: string;
  timestamp: number;
  correlationId: string;
  priority: MessagePriority;
}

/** 任务消息：请求某个 Agent 执行任务 */
interface TaskMessage extends BaseMessage {
  type: "task";
  task: string;
  context: Record<string, unknown>;
  expectedResponseFormat?: string;
  deadline?: number;
}

/** 结果消息：返回任务执行结果 */
interface ResultMessage extends BaseMessage {
  type: "result";
  inReplyTo: string;
  result: string;
  data?: Record<string, unknown>;
  status: "success" | "partial" | "error";
}

/** 反馈消息：对结果的评价或修改建议 */
interface FeedbackMessage extends BaseMessage {
  type: "feedback";
  inReplyTo: string;
  feedbackType: "approval" | "revision" | "rejection";
  content: string;
  suggestions?: string[];
}

/** 错误消息 */
interface ErrorMessage extends BaseMessage {
  type: "error";
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
  originalMessageId?: string;
}

type AgentMessage = TaskMessage | ResultMessage | FeedbackMessage | ErrorMessage;

/**
 * 消息验证器：确保消息格式正确
 */
class MessageValidator {
  static validate(message: AgentMessage): void {
    if (!message.messageId || !message.senderId || !message.receiverId) {
      throw new Error("消息缺少必要的标识字段");
    }
    if (!message.timestamp || message.timestamp <= 0) {
      throw new Error("消息时间戳无效");
    }
    switch (message.type) {
      case "task":
        if (!message.task?.trim()) throw new Error("TaskMessage 必须包含非空的 task 字段");
        break;
      case "result":
        if (!message.inReplyTo) throw new Error("ResultMessage 必须指定 inReplyTo");
        break;
      case "feedback":
        if (!message.inReplyTo || !message.feedbackType) throw new Error("FeedbackMessage 缺少必要字段");
        break;
      case "error":
        if (!message.errorCode || !message.errorMessage) throw new Error("ErrorMessage 缺少错误信息");
        break;
    }
  }

  static serialize(message: AgentMessage): string {
    MessageValidator.validate(message);
    return JSON.stringify(message);
  }

  static deserialize(json: string): AgentMessage {
    const message = JSON.parse(json) as AgentMessage;
    MessageValidator.validate(message);
    return message;
  }
}
```

#### DirectMessageBus：消息总线

```typescript
type MessageHandler = (message: AgentMessage) => Promise<AgentMessage | void>;

/**
 * DirectMessageBus：点对点消息总线
 *
 * 提供 Agent 之间的直接通信能力：
 * - 请求-响应模式（send + wait for reply）
 * - 单向通知模式（fire and forget）
 * - 未送达消息的死信处理
 */
class DirectMessageBus {
  private handlers = new Map<string, MessageHandler>();
  private pendingResponses = new Map<
    string,
    {
      resolve: (msg: AgentMessage) => void;
      reject: (err: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private deadLetterQueue: AgentMessage[] = [];

  register(agentId: string, handler: MessageHandler): void {
    this.handlers.set(agentId, handler);
    console.log(`[MessageBus] Agent ${agentId} 已注册`);
  }

  unregister(agentId: string): void {
    this.handlers.delete(agentId);
  }

  /** 发送消息并等待响应 */
  async sendAndWait(message: AgentMessage, timeoutMs: number = 30000): Promise<AgentMessage> {
    MessageValidator.validate(message);
    const handler = this.handlers.get(message.receiverId);
    if (!handler) {
      this.deadLetterQueue.push(message);
      throw new Error(`目标 Agent ${message.receiverId} 未注册，消息已放入死信队列`);
    }

    return new Promise<AgentMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResponses.delete(message.messageId);
        reject(new Error(`等待 Agent ${message.receiverId} 响应超时 (${timeoutMs}ms)`));
      }, timeoutMs);

      this.pendingResponses.set(message.messageId, { resolve, reject, timer });

      handler(message)
        .then((response) => {
          const pending = this.pendingResponses.get(message.messageId);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingResponses.delete(message.messageId);
            response ? pending.resolve(response) : pending.reject(new Error("未返回响应"));
          }
        })
        .catch((error) => {
          const pending = this.pendingResponses.get(message.messageId);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingResponses.delete(message.messageId);
            pending.reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
    });
  }

  /** 发送消息但不等待响应（通知模式） */
  async fireAndForget(message: AgentMessage): Promise<void> {
    MessageValidator.validate(message);
    const handler = this.handlers.get(message.receiverId);
    if (!handler) {
      this.deadLetterQueue.push(message);
      return;
    }
    handler(message).catch((err) =>
      console.error(`[MessageBus] 消息处理失败: ${err}`)
    );
  }

  getDeadLetters(): AgentMessage[] { return [...this.deadLetterQueue]; }
  clearDeadLetters(): void { this.deadLetterQueue = []; }
  get registeredAgentCount(): number { return this.handlers.size; }
}
```

### 9.3.2 Blackboard：共享黑板

Blackboard 模式让多个 Agent 通过读写一个共享的数据结构来协作。就像一群专家围绕一块白板工作：每个人把自己的发现写上去，其他人读取后做进一步分析。

```typescript
interface BlackboardEntry<T = unknown> {
  id: string;
  section: BlackboardSection;
  authorId: string;
  data: T;
  confidence: number;
  createdAt: number;
  updatedAt: number;
  version: number;
  tags: string[];
}

enum BlackboardSection {
  FACTS = "facts",
  HYPOTHESES = "hypotheses",
  SOLUTIONS = "solutions",
  CONSTRAINTS = "constraints",
}

/**
 * 读写锁：支持并发读、独占写
 */
class ReadWriteLock {
  private readers = 0;
  private writer = false;
  private readWaiters: Array<() => void> = [];
  private writeWaiters: Array<() => void> = [];

  async acquireRead(): Promise<void> {
    if (!this.writer && this.writeWaiters.length === 0) { this.readers++; return; }
    return new Promise<void>((resolve) => {
      this.readWaiters.push(() => { this.readers++; resolve(); });
    });
  }

  releaseRead(): void {
    this.readers--;
    if (this.readers === 0 && this.writeWaiters.length > 0) {
      this.writer = true;
      this.writeWaiters.shift()!();
    }
  }

  async acquireWrite(): Promise<void> {
    if (!this.writer && this.readers === 0) { this.writer = true; return; }
    return new Promise<void>((resolve) => {
      this.writeWaiters.push(() => { this.writer = true; resolve(); });
    });
  }

  releaseWrite(): void {
    this.writer = false;
    if (this.writeWaiters.length > 0) {
      this.writer = true;
      this.writeWaiters.shift()!();
    } else {
      this.readWaiters.splice(0).forEach((w) => w());
    }
  }
}

interface BlackboardChangeEvent {
  type: "created" | "updated" | "deleted";
  entry: BlackboardEntry;
  previousVersion?: number;
}

type BlackboardWatcher = (event: BlackboardChangeEvent) => void;

/**
 * Blackboard：共享黑板
 *
 * - 分区存储（事实/假设/方案/约束）
 * - 读写锁保证并发安全
 * - 观察者模式支持响应式更新
 * - 乐观并发控制防止数据冲突
 */
class Blackboard {
  private entries = new Map<string, BlackboardEntry>();
  private lock = new ReadWriteLock();
  private watchers: BlackboardWatcher[] = [];
  private changeLog: BlackboardChangeEvent[] = [];

  async write<T>(
    entry: Omit<BlackboardEntry<T>, "version" | "updatedAt">
  ): Promise<BlackboardEntry<T>> {
    await this.lock.acquireWrite();
    try {
      const existing = this.entries.get(entry.id);
      const fullEntry: BlackboardEntry<T> = {
        ...entry,
        version: existing ? existing.version + 1 : 1,
        updatedAt: Date.now(),
      };
      this.entries.set(entry.id, fullEntry as BlackboardEntry);
      const event: BlackboardChangeEvent = {
        type: existing ? "updated" : "created",
        entry: fullEntry as BlackboardEntry,
        previousVersion: existing?.version,
      };
      this.changeLog.push(event);
      this.notifyWatchers(event);
      return fullEntry;
    } finally {
      this.lock.releaseWrite();
    }
  }

  async compareAndWrite<T>(
    entry: Omit<BlackboardEntry<T>, "version" | "updatedAt">,
    expectedVersion: number
  ): Promise<{ success: boolean; entry?: BlackboardEntry<T> }> {
    await this.lock.acquireWrite();
    try {
      const existing = this.entries.get(entry.id);
      if ((existing?.version ?? 0) !== expectedVersion) return { success: false };
      const fullEntry: BlackboardEntry<T> = {
        ...entry, version: expectedVersion + 1, updatedAt: Date.now(),
      };
      this.entries.set(entry.id, fullEntry as BlackboardEntry);
      this.notifyWatchers({ type: existing ? "updated" : "created", entry: fullEntry as BlackboardEntry });
      return { success: true, entry: fullEntry };
    } finally {
      this.lock.releaseWrite();
    }
  }

  async read<T>(id: string): Promise<BlackboardEntry<T> | undefined> {
    await this.lock.acquireRead();
    try { return this.entries.get(id) as BlackboardEntry<T> | undefined; }
    finally { this.lock.releaseRead(); }
  }

  async queryBySection(section: BlackboardSection): Promise<BlackboardEntry[]> {
    await this.lock.acquireRead();
    try { return Array.from(this.entries.values()).filter((e) => e.section === section); }
    finally { this.lock.releaseRead(); }
  }

  async queryByConfidence(minConfidence: number, section?: BlackboardSection): Promise<BlackboardEntry[]> {
    await this.lock.acquireRead();
    try {
      return Array.from(this.entries.values()).filter(
        (e) => e.confidence >= minConfidence && (section === undefined || e.section === section)
      );
    } finally { this.lock.releaseRead(); }
  }

  watch(watcher: BlackboardWatcher): () => void {
    this.watchers.push(watcher);
    return () => { const i = this.watchers.indexOf(watcher); if (i !== -1) this.watchers.splice(i, 1); };
  }

  watchSection(section: BlackboardSection, handler: BlackboardWatcher): () => void {
    return this.watch((event) => { if (event.entry.section === section) handler(event); });
  }

  private notifyWatchers(event: BlackboardChangeEvent): void {
    for (const w of this.watchers) { try { w(event); } catch (e) { console.error(`[Blackboard] 观察者回调出错: ${e}`); } }
  }

  getChangeLog(): BlackboardChangeEvent[] { return [...this.changeLog]; }
  getSummary(): Record<string, number> {
    const s: Record<string, number> = {};
    for (const sec of Object.values(BlackboardSection)) {
      s[sec] = Array.from(this.entries.values()).filter((e) => e.section === sec).length;
    }
    return s;
  }
}
```

### 9.3.3 Event Stream：事件流

Event Stream 模式让 Agent 通过发布/订阅事件来通信。发布者不需要知道谁会处理事件，实现更松散的耦合。

> **接口演化说明**：第 4 章的 `AgentEvent` 使用 12 种判别联合类型（discriminated union），适合单 Agent 内部的强类型状态变迁。本章的 `AgentEvent` 采用泛型结构（`eventType: string + payload: Record<string, unknown>`），因为 Multi-Agent 场景中事件类型需要跨 Agent 边界动态扩展，强类型联合在此场景下过于僵硬。

```typescript
interface AgentEvent {
  eventId: string;
  eventType: string;
  sourceAgentId: string;
  timestamp: number;
  payload: Record<string, unknown>;
  metadata?: { correlationId?: string; causationId?: string; tags?: string[] };
}

interface EventFilter {
  eventTypes?: string[];
  sourceAgentIds?: string[];
  contentFilter?: (event: AgentEvent) => boolean;
}

type EventHandler = (event: AgentEvent) => Promise<void>;

interface Subscription {
  id: string;
  subscriberId: string;
  filter: EventFilter;
  handler: EventHandler;
}

/**
 * EventStream：事件流通信
 *
 * - 基于 Topic 的事件路由（支持通配符 "order.*"）
 * - 有序事件日志（可回放）
 * - 死信队列处理未消费的事件
 */
class EventStream {
  private eventLog: AgentEvent[] = [];
  private subscriptions: Subscription[] = [];
  private deadLetterQueue: AgentEvent[] = [];
  private maxLogSize: number;

  constructor(maxLogSize: number = 10000) { this.maxLogSize = maxLogSize; }

  async publish(event: AgentEvent): Promise<void> {
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog = this.eventLog.slice(-this.maxLogSize);
    }

    const matching = this.subscriptions.filter((s) => this.matchesFilter(event, s.filter));
    if (matching.length === 0) {
      this.deadLetterQueue.push(event);
      return;
    }
    await Promise.allSettled(
      matching.map((s) => s.handler(event).catch((e) =>
        console.error(`[EventStream] 订阅者 ${s.subscriberId} 处理失败: ${e}`)
      ))
    );
  }

  subscribe(subscriberId: string, filter: EventFilter, handler: EventHandler): () => void {
    const sub: Subscription = {
      id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      subscriberId, filter, handler,
    };
    this.subscriptions.push(sub);
    return () => { const i = this.subscriptions.findIndex((s) => s.id === sub.id); if (i !== -1) this.subscriptions.splice(i, 1); };
  }

  queryHistory(filter: EventFilter, limit: number = 100): AgentEvent[] {
    return this.eventLog.filter((e) => this.matchesFilter(e, filter)).slice(-limit);
  }

  async replay(fromIndex: number, handler: EventHandler, filter?: EventFilter): Promise<number> {
    let count = 0;
    for (const event of this.eventLog.slice(fromIndex)) {
      if (!filter || this.matchesFilter(event, filter)) { await handler(event); count++; }
    }
    return count;
  }

  private matchesFilter(event: AgentEvent, filter: EventFilter): boolean {
    if (filter.eventTypes?.length) {
      if (!filter.eventTypes.some((p) => p.endsWith(".*") ? event.eventType.startsWith(p.slice(0, -2)) : event.eventType === p)) return false;
    }
    if (filter.sourceAgentIds?.length && !filter.sourceAgentIds.includes(event.sourceAgentId)) return false;
    if (filter.contentFilter && !filter.contentFilter(event)) return false;
    return true;
  }

  getDeadLetters(): AgentEvent[] { return [...this.deadLetterQueue]; }
  clearDeadLetters(): void { this.deadLetterQueue = []; }
  get logSize(): number { return this.eventLog.length; }
  get subscriberCount(): number { return this.subscriptions.length; }
}
```

#### EventRouter：高级事件路由

```typescript
interface RoutingRule {
  name: string;
  priority: number;
  condition: (event: AgentEvent) => boolean;
  targetHandlers: EventHandler[];
  stopOnMatch: boolean;
}

/**
 * EventRouter：支持基于优先级的多条件路由
 */
class EventRouter {
  private rules: RoutingRule[] = [];
  private defaultHandler?: EventHandler;
  private eventStream: EventStream;

  constructor(eventStream: EventStream) { this.eventStream = eventStream; }

  addRule(rule: RoutingRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  setDefaultHandler(handler: EventHandler): void { this.defaultHandler = handler; }

  start(): () => void {
    return this.eventStream.subscribe("event-router", {}, async (event) => {
      let handled = false;
      for (const rule of this.rules) {
        if (rule.condition(event)) {
          handled = true;
          await Promise.allSettled(rule.targetHandlers.map((h) => h(event)));
          if (rule.stopOnMatch) break;
        }
      }
      if (!handled && this.defaultHandler) await this.defaultHandler(event);
    });
  }
}
```

---

## 9.4 Agent 身份与能力

在包含多个 Agent 的系统中，每个 Agent 需要有清晰的"身份证"——描述它是谁、能做什么、擅长什么。这就是 **AgentCard** 的作用。

### 9.4.1 AgentCard：Agent 的名片

```typescript
interface AgentCapability {
  name: string;
  description: string;
  proficiency: number;
  inputFormats: string[];
  outputFormats: string[];
}

/**
 * AgentCard：Agent 元数据描述
 * 类似于 A2A 协议中的 AgentCard
 */
interface AgentCard {
  id: string;
  name: string;
  description: string;
  version: string;
  model: string;
  capabilities: AgentCapability[];
  supportedProtocols: string[];
  status: "active" | "inactive" | "maintenance" | "deprecated";
  metrics: {
    avgResponseTimeMs: number;
    successRate: number;
    totalTasksProcessed: number;
  };
  createdAt: number;
  lastActiveAt: number;
  endpoint?: string;
  tags: string[];
}

function createAgentCard(
  partial: Pick<AgentCard, "id" | "name" | "description" | "model" | "capabilities"> & Partial<AgentCard>
): AgentCard {
  return {
    version: "1.0.0",
    supportedProtocols: ["direct-message", "event-stream"],
    status: "active",
    metrics: { avgResponseTimeMs: 0, successRate: 1.0, totalTasksProcessed: 0 },
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    tags: [],
    ...partial,
  };
}
```

### 9.4.2 AgentRegistry：Agent 注册与发现

```typescript
interface CapabilityMatch {
  agent: AgentCard;
  score: number;
  matchedCapabilities: string[];
}

/**
 * AgentRegistry：Agent 注册中心
 *
 * - 注册和注销 Agent
 * - 按能力搜索，智能路由
 * - 健康检查和自动下线
 */
class AgentRegistry {
  private agents = new Map<string, AgentCard>();
  private capabilityIndex = new Map<string, Set<string>>();

  register(card: AgentCard): void {
    this.agents.set(card.id, card);
    for (const cap of card.capabilities) {
      if (!this.capabilityIndex.has(cap.name)) this.capabilityIndex.set(cap.name, new Set());
      this.capabilityIndex.get(cap.name)!.add(card.id);
    }
    console.log(`[Registry] Agent ${card.name} 注册成功，能力: [${card.capabilities.map((c) => c.name).join(", ")}]`);
  }

  unregister(agentId: string): void {
    const card = this.agents.get(agentId);
    if (!card) return;
    for (const cap of card.capabilities) this.capabilityIndex.get(cap.name)?.delete(agentId);
    this.agents.delete(agentId);
  }

  findByCapabilities(requiredCapabilities: string[]): CapabilityMatch[] {
    const candidateIds = new Set<string>();
    for (const capName of requiredCapabilities) {
      this.capabilityIndex.get(capName)?.forEach((id) => candidateIds.add(id));
    }

    const matches: CapabilityMatch[] = [];
    for (const agentId of candidateIds) {
      const card = this.agents.get(agentId)!;
      if (card.status !== "active") continue;

      const matchedCaps: string[] = [];
      let totalProf = 0;
      for (const req of requiredCapabilities) {
        const agentCap = card.capabilities.find((c) => c.name === req);
        if (agentCap) { matchedCaps.push(req); totalProf += agentCap.proficiency; }
      }
      if (matchedCaps.length === 0) continue;

      const score =
        (matchedCaps.length / requiredCapabilities.length) * 0.4 +
        (totalProf / matchedCaps.length) * 0.35 +
        card.metrics.successRate * 0.25;

      matches.push({ agent: card, score, matchedCapabilities: matchedCaps });
    }
    return matches.sort((a, b) => b.score - a.score);
  }

  findBestMatch(requiredCapabilities: string[]): AgentCard | null {
    const matches = this.findByCapabilities(requiredCapabilities);
    return matches.length > 0 ? matches[0].agent : null;
  }

  getAgent(agentId: string): AgentCard | undefined { return this.agents.get(agentId); }
  listAll(): AgentCard[] { return Array.from(this.agents.values()); }

  updateMetrics(agentId: string, update: Partial<AgentCard["metrics"]>): void {
    const card = this.agents.get(agentId);
    if (card) { card.metrics = { ...card.metrics, ...update }; card.lastActiveAt = Date.now(); }
  }

  healthCheck(inactiveThresholdMs: number = 300000): string[] {
    const now = Date.now();
    const inactive: string[] = [];
    for (const [id, card] of this.agents) {
      if (card.status === "active" && now - card.lastActiveAt > inactiveThresholdMs) {
        card.status = "inactive";
        inactive.push(id);
      }
    }
    return inactive;
  }

  getStats() {
    const all = Array.from(this.agents.values());
    return {
      total: all.length,
      active: all.filter((a) => a.status === "active").length,
      inactive: all.filter((a) => a.status === "inactive").length,
      capabilities: this.capabilityIndex.size,
    };
  }
}
```

### 9.4.3 CapabilityRouter：基于能力的任务路由

```typescript
interface TaskCapabilityMapping {
  taskPattern: RegExp;
  requiredCapabilities: string[];
  priority: number;
}

class CapabilityRouter {
  private registry: AgentRegistry;
  private mappings: TaskCapabilityMapping[] = [];

  constructor(registry: AgentRegistry) { this.registry = registry; }

  addMapping(mapping: TaskCapabilityMapping): void {
    this.mappings.push(mapping);
    this.mappings.sort((a, b) => b.priority - a.priority);
  }

  route(taskDescription: string): { agent: AgentCard | null; capabilities: string[]; reason: string } {
    for (const m of this.mappings) {
      if (m.taskPattern.test(taskDescription)) {
        const agent = this.registry.findBestMatch(m.requiredCapabilities);
        return {
          agent,
          capabilities: m.requiredCapabilities,
          reason: agent
            ? `路由到 "${agent.name}"`
            : `匹配到能力 [${m.requiredCapabilities.join(", ")}]，但无可用 Agent`,
        };
      }
    }
    return { agent: null, capabilities: [], reason: "未匹配到任何路由规则" };
  }
}
```

---

## 9.5 共享状态与协调

当多个 Agent 需要协作完成同一个任务时，不可避免地需要共享某些状态。如何安全、高效地管理共享状态是 Multi-Agent 系统的关键挑战。

### 9.5.1 SharedStateManager：共享状态管理器

```typescript
interface StateChange {
  changeId: string;
  agentId: string;
  path: string;
  oldValue: unknown;
  newValue: unknown;
  timestamp: number;
  version: number;
}

/**
 * SharedStateManager：使用乐观并发控制（OCC）管理 Agent 间的共享状态
 *
 * 工作原理：
 * 1. Agent 读取状态时获得当前版本号
 * 2. Agent 修改后提交时，携带读取时的版本号
 * 3. 版本号匹配则更新成功，否则失败需重新读取
 */
class SharedStateManager {
  private state: Record<string, unknown> = {};
  private version = 0;
  private changeHistory: StateChange[] = [];
  private locks = new Map<string, { agentId: string; expiresAt: number }>();
  private maxHistorySize: number;

  constructor(initialState: Record<string, unknown> = {}, maxHistorySize = 1000) {
    this.state = { ...initialState };
    this.maxHistorySize = maxHistorySize;
  }

  read(): { state: Record<string, unknown>; version: number } {
    return { state: structuredClone(this.state), version: this.version };
  }

  readPath(path: string): { value: unknown; version: number } {
    return { value: structuredClone(this.getNestedValue(this.state, path)), version: this.version };
  }

  compareAndSet(
    agentId: string, path: string, newValue: unknown, expectedVersion: number
  ): { success: boolean; currentVersion: number } {
    if (this.version !== expectedVersion) {
      console.warn(`[SharedState] 版本冲突: Agent ${agentId} 期望 v${expectedVersion}，当前 v${this.version}`);
      return { success: false, currentVersion: this.version };
    }

    const lockInfo = this.locks.get(path);
    if (lockInfo && lockInfo.agentId !== agentId && lockInfo.expiresAt > Date.now()) {
      return { success: false, currentVersion: this.version };
    }

    const oldValue = this.getNestedValue(this.state, path);
    this.setNestedValue(this.state, path, newValue);
    this.version++;

    this.changeHistory.push({
      changeId: `chg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      agentId, path,
      oldValue: structuredClone(oldValue),
      newValue: structuredClone(newValue),
      timestamp: Date.now(),
      version: this.version,
    });
    if (this.changeHistory.length > this.maxHistorySize) {
      this.changeHistory = this.changeHistory.slice(-this.maxHistorySize);
    }
    return { success: true, currentVersion: this.version };
  }

  acquireLock(agentId: string, path: string, ttlMs = 30000): boolean {
    const existing = this.locks.get(path);
    if (existing && existing.expiresAt > Date.now() && existing.agentId !== agentId) return false;
    this.locks.set(path, { agentId, expiresAt: Date.now() + ttlMs });
    return true;
  }

  releaseLock(agentId: string, path: string): boolean {
    const existing = this.locks.get(path);
    if (existing && existing.agentId === agentId) { this.locks.delete(path); return true; }
    return false;
  }

  getHistory(sinceVersion?: number): StateChange[] {
    if (sinceVersion !== undefined) return this.changeHistory.filter((c) => c.version > sinceVersion);
    return [...this.changeHistory];
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    let cur: unknown = obj;
    for (const key of path.split(".")) {
      if (cur == null) return undefined;
      cur = (cur as Record<string, unknown>)[key];
    }
    return cur;
  }

  private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split(".");
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in cur) || typeof cur[keys[i]] !== "object") cur[keys[i]] = {};
      cur = cur[keys[i]] as Record<string, unknown>;
    }
    cur[keys[keys.length - 1]] = value;
  }
}
```

### 9.5.2 简化共识协议：多 Agent 决策

```typescript
enum ProposalStatus { PENDING = "pending", ACCEPTED = "accepted", REJECTED = "rejected", TIMEOUT = "timeout" }

interface Proposal<T = unknown> {
  id: string;
  proposerId: string;
  content: T;
  description: string;
  votes: Map<string, { approve: boolean; reason: string }>;
  status: ProposalStatus;
  createdAt: number;
  deadline: number;
}

/**
 * ConsensusManager：多 Agent 民主决策
 * - 提案-投票-裁决流程
 * - 支持多数决和全票通过
 */
class ConsensusManager {
  private proposals = new Map<string, Proposal>();
  private participantIds: Set<string>;
  private approvalThreshold: number;

  constructor(participantIds: string[], approvalThreshold = 0.5) {
    this.participantIds = new Set(participantIds);
    this.approvalThreshold = approvalThreshold;
  }

  createProposal<T>(proposerId: string, content: T, description: string, deadlineMs = 30000): Proposal<T> {
    const p: Proposal<T> = {
      id: `prop_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      proposerId, content, description,
      votes: new Map(), status: ProposalStatus.PENDING,
      createdAt: Date.now(), deadline: Date.now() + deadlineMs,
    };
    this.proposals.set(p.id, p as Proposal);
    return p;
  }

  vote(proposalId: string, voterId: string, approve: boolean, reason: string): { accepted: boolean; status: ProposalStatus } {
    const p = this.proposals.get(proposalId);
    if (!p) throw new Error(`提案 ${proposalId} 不存在`);
    if (p.status !== ProposalStatus.PENDING) throw new Error(`提案已结束`);
    if (!this.participantIds.has(voterId)) throw new Error(`${voterId} 不是参与者`);
    if (Date.now() > p.deadline) { p.status = ProposalStatus.TIMEOUT; return { accepted: false, status: ProposalStatus.TIMEOUT }; }

    p.votes.set(voterId, { approve, reason });
    return this.checkDecision(p);
  }

  private checkDecision(p: Proposal): { accepted: boolean; status: ProposalStatus } {
    const total = this.participantIds.size;
    const approves = Array.from(p.votes.values()).filter((v) => v.approve).length;
    const remaining = total - p.votes.size;

    if (approves / total >= this.approvalThreshold) {
      p.status = ProposalStatus.ACCEPTED;
      return { accepted: true, status: ProposalStatus.ACCEPTED };
    }
    if ((approves + remaining) / total < this.approvalThreshold) {
      p.status = ProposalStatus.REJECTED;
      return { accepted: false, status: ProposalStatus.REJECTED };
    }
    return { accepted: false, status: ProposalStatus.PENDING };
  }
}
```

### 9.5.3 冲突解决策略

```typescript
enum ConflictResolutionStrategy {
  LAST_WRITER_WINS = "last_writer_wins",
  PRIORITY_BASED = "priority_based",
  MERGE = "merge",
  ARBITRATION = "arbitration",
}

class ConflictResolver {
  private agentPriorities = new Map<string, number>();
  private strategy: ConflictResolutionStrategy;

  constructor(strategy = ConflictResolutionStrategy.LAST_WRITER_WINS) {
    this.strategy = strategy;
  }

  setAgentPriority(agentId: string, priority: number): void {
    this.agentPriorities.set(agentId, priority);
  }

  resolve(conflicts: StateChange[]): StateChange {
    if (conflicts.length <= 1) return conflicts[0];
    switch (this.strategy) {
      case ConflictResolutionStrategy.LAST_WRITER_WINS:
        return conflicts.sort((a, b) => b.timestamp - a.timestamp)[0];
      case ConflictResolutionStrategy.PRIORITY_BASED:
        return conflicts.sort((a, b) =>
          (this.agentPriorities.get(b.agentId) ?? 0) - (this.agentPriorities.get(a.agentId) ?? 0)
        )[0];
      case ConflictResolutionStrategy.MERGE:
        return this.mergeChanges(conflicts);
      default:
        return conflicts.sort((a, b) => b.timestamp - a.timestamp)[0];
    }
  }

  private mergeChanges(conflicts: StateChange[]): StateChange {
    const base = conflicts[0];
    if (typeof base.newValue === "object" && base.newValue !== null) {
      let merged = { ...(base.newValue as Record<string, unknown>) };
      for (let i = 1; i < conflicts.length; i++) {
        if (typeof conflicts[i].newValue === "object" && conflicts[i].newValue !== null) {
          merged = { ...merged, ...(conflicts[i].newValue as Record<string, unknown>) };
        }
      }
      return { ...base, newValue: merged };
    }
    return conflicts.sort((a, b) => b.timestamp - a.timestamp)[0];
  }
}
```

---


## 9.6 容错与恢复

在多 Agent 协作中，单点故障是不可避免的。与单体架构中的错误处理不同，Multi-Agent 系统需要**系统级**的容错机制——当某个 Agent 失败时，整个系统应该能够优雅地降级而非完全崩溃。

本节介绍三个核心容错模式：**熔断器（Circuit Breaker）**、**监督者（Supervisor）** 和 **优雅降级（Graceful Degradation）**。

### 9.6.1 熔断器模式（Circuit Breaker）

熔断器模式源自电气工程，当检测到下游服务异常时自动"断开"请求，防止级联故障。在 Multi-Agent 系统中，熔断器保护调用链不受单个 Agent 故障的拖累。

**状态机模型：**

```
     成功         失败次数 >= 阈值
  ┌────────┐    ┌──────────────┐
  │        ▼    │              ▼
  │     CLOSED ─┘           OPEN
  │        ▲                  │
  │        │                  │ 超时后允许一次尝试
  │     成功│                  ▼
  │        │             HALF_OPEN
  │        └──────────────────┘
  │                失败时回到 OPEN
  └────────────────────────────┘
```

```typescript
// ========================================
// 9.6.1 CircuitBreaker 实现
// ========================================

enum CircuitState {
  CLOSED = "CLOSED",         // 正常通行
  OPEN = "OPEN",             // 熔断，拒绝所有请求
  HALF_OPEN = "HALF_OPEN",   // 探测阶段，允许单个请求通过
}

interface CircuitBreakerConfig {
  failureThreshold: number;   // 触发熔断的连续失败次数
  resetTimeout: number;       // OPEN → HALF_OPEN 的等待时间（ms）
  halfOpenMaxAttempts: number; // HALF_OPEN 状态允许的最大尝试数
  monitorInterval?: number;   // 健康检查间隔（ms）
}

interface CircuitBreakerStats {
  state: CircuitState;
  consecutiveFailures: number;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  stateChangedAt: number;
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private consecutiveFailures = 0;
  private halfOpenAttempts = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private stateChangedAt: number = Date.now();
  private totalRequests = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private stateListeners: Array<(oldState: CircuitState, newState: CircuitState) => void> = [];

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig
  ) {}

  /** 注册状态变更监听器 */
  onStateChange(listener: (oldState: CircuitState, newState: CircuitState) => void): void {
    this.stateListeners.push(listener);
  }

  /** 通过熔断器执行操作 */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new CircuitOpenError(
        `Circuit breaker [${this.name}] is OPEN. ` +
        `Retry after ${this.remainingResetTime()}ms.`
      );
    }

    this.totalRequests++;

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /** 检查是否允许执行 */
  private canExecute(): boolean {
    switch (this.state) {
      case CircuitState.CLOSED:
        return true;

      case CircuitState.OPEN: {
        const elapsed = Date.now() - this.stateChangedAt;
        if (elapsed >= this.config.resetTimeout) {
          this.transitionTo(CircuitState.HALF_OPEN);
          return true;
        }
        return false;
      }

      case CircuitState.HALF_OPEN:
        return this.halfOpenAttempts < this.config.halfOpenMaxAttempts;
    }
  }

  /** 处理成功 */
  private onSuccess(): void {
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();
    this.consecutiveFailures = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.CLOSED);
      this.halfOpenAttempts = 0;
    }
  }

  /** 处理失败 */
  private onFailure(): void {
    this.totalFailures++;
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
      this.halfOpenAttempts = 0;
    } else if (this.consecutiveFailures >= this.config.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  /** 状态转换 */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    if (oldState === newState) return;

    console.log(
      `[CircuitBreaker:${this.name}] ${oldState} → ${newState} ` +
      `(failures: ${this.consecutiveFailures})`
    );

    this.state = newState;
    this.stateChangedAt = Date.now();

    for (const listener of this.stateListeners) {
      try { listener(oldState, newState); } catch {}
    }
  }

  /** 获取剩余重置时间 */
  private remainingResetTime(): number {
    if (this.state !== CircuitState.OPEN) return 0;
    return Math.max(0, this.config.resetTimeout - (Date.now() - this.stateChangedAt));
  }

  /** 获取统计信息 */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      stateChangedAt: this.stateChangedAt,
    };
  }

  /** 手动重置熔断器 */
  reset(): void {
    this.consecutiveFailures = 0;
    this.halfOpenAttempts = 0;
    this.transitionTo(CircuitState.CLOSED);
  }
}

class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitOpenError";
  }
}
```

> **设计要点：** 熔断器的 `resetTimeout` 应根据 Agent 的平均恢复时间设置。对于 LLM Agent，建议 30-60 秒；对于工具调用 Agent，5-10 秒即可。`failureThreshold` 通常设为 3-5 次。

### 9.6.2 监督者模式（Supervisor Agent）

监督者模式借鉴了 Erlang/OTP 的 Supervisor Tree 思想：每个 Agent 都由一个 Supervisor 管理，Supervisor 负责监控 Agent 健康、在故障时执行替换或重启策略。

```typescript
// ========================================
// 9.6.2 SupervisorAgent 实现
// ========================================

/** 重启策略 */
enum RestartStrategy {
  ONE_FOR_ONE = "ONE_FOR_ONE",     // 只重启失败的 Agent
  ONE_FOR_ALL = "ONE_FOR_ALL",     // 所有 Agent 一起重启
  REST_FOR_ONE = "REST_FOR_ONE",   // 重启失败的及之后注册的 Agent
}

/** 被监督 Agent 的配置 */
interface SupervisedAgentConfig {
  agent: BaseAgent;
  circuitBreaker: CircuitBreaker;
  substitutes: BaseAgent[];           // 替代 Agent 列表（优先级递减）
  maxRestarts: number;                // 允许的最大重启次数
  restartWindow: number;             // 重启窗口时间（ms）
  critical: boolean;                  // 是否为关键 Agent（故障导致系统停止）
}

/** Agent 运行时状态 */
interface AgentRuntimeState {
  config: SupervisedAgentConfig;
  activeAgent: BaseAgent;              // 当前活跃的 Agent（可能是替代品）
  restartCount: number;
  restartTimestamps: number[];
  isHealthy: boolean;
}

class SupervisorAgent {
  private agents = new Map<string, AgentRuntimeState>();
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly name: string,
    private readonly strategy: RestartStrategy = RestartStrategy.ONE_FOR_ONE,
    private readonly healthCheckInterval: number = 10000
  ) {}

  /** 注册被监督的 Agent */
  register(id: string, config: SupervisedAgentConfig): void {
    const state: AgentRuntimeState = {
      config,
      activeAgent: config.agent,
      restartCount: 0,
      restartTimestamps: [],
      isHealthy: true,
    };

    // 当熔断器打开时触发替换逻辑
    config.circuitBreaker.onStateChange((oldState, newState) => {
      if (newState === CircuitState.OPEN) {
        console.warn(`[Supervisor:${this.name}] Agent [${id}] circuit opened, attempting recovery.`);
        this.handleAgentFailure(id);
      }
    });

    this.agents.set(id, state);
  }

  /** 启动监督器 */
  start(): void {
    this.healthCheckTimer = setInterval(() => this.runHealthChecks(), this.healthCheckInterval);
    console.log(`[Supervisor:${this.name}] Started with strategy: ${this.strategy}`);
  }

  /** 停止监督器 */
  stop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    console.log(`[Supervisor:${this.name}] Stopped.`);
  }

  /** 通过监督器执行 Agent 任务 */
  async executeAgent<T>(agentId: string, task: (agent: BaseAgent) => Promise<T>): Promise<T> {
    const state = this.agents.get(agentId);
    if (!state) throw new Error(`Agent [${agentId}] not registered with supervisor.`);

    return state.config.circuitBreaker.execute(() => task(state.activeAgent));
  }

  /** 处理 Agent 故障 */
  private handleAgentFailure(agentId: string): void {
    switch (this.strategy) {
      case RestartStrategy.ONE_FOR_ONE:
        this.recoverAgent(agentId);
        break;

      case RestartStrategy.ONE_FOR_ALL:
        for (const id of this.agents.keys()) {
          this.recoverAgent(id);
        }
        break;

      case RestartStrategy.REST_FOR_ONE: {
        const ids = Array.from(this.agents.keys());
        const failedIndex = ids.indexOf(agentId);
        for (let i = failedIndex; i < ids.length; i++) {
          this.recoverAgent(ids[i]);
        }
        break;
      }
    }
  }

  /** 恢复单个 Agent */
  private recoverAgent(agentId: string): void {
    const state = this.agents.get(agentId);
    if (!state) return;

    // 检查是否超过重启频率限制
    const now = Date.now();
    state.restartTimestamps = state.restartTimestamps.filter(
      (t) => now - t < state.config.restartWindow
    );

    if (state.restartTimestamps.length >= state.config.maxRestarts) {
      console.error(
        `[Supervisor:${this.name}] Agent [${agentId}] exceeded max restarts ` +
        `(${state.config.maxRestarts} in ${state.config.restartWindow}ms). ` +
        `Attempting substitution.`
      );
      this.substituteAgent(agentId, state);
      return;
    }

    // 重启：重置熔断器
    state.restartCount++;
    state.restartTimestamps.push(now);
    state.config.circuitBreaker.reset();
    console.log(
      `[Supervisor:${this.name}] Agent [${agentId}] restarted ` +
      `(count: ${state.restartCount}).`
    );
  }

  /** 替换 Agent */
  private substituteAgent(agentId: string, state: AgentRuntimeState): void {
    const currentActive = state.activeAgent;
    const substituteIndex = state.config.substitutes.indexOf(currentActive);
    const nextIndex = currentActive === state.config.agent ? 0 : substituteIndex + 1;

    if (nextIndex < state.config.substitutes.length) {
      const substitute = state.config.substitutes[nextIndex];
      state.activeAgent = substitute;
      state.restartCount = 0;
      state.restartTimestamps = [];
      state.config.circuitBreaker.reset();

      console.log(
        `[Supervisor:${this.name}] Agent [${agentId}] substituted: ` +
        `${currentActive.constructor.name} → ${substitute.constructor.name}`
      );
    } else {
      state.isHealthy = false;
      console.error(
        `[Supervisor:${this.name}] Agent [${agentId}] all substitutes exhausted. ` +
        `Agent marked as unhealthy.`
      );

      if (state.config.critical) {
        console.error(`[Supervisor:${this.name}] CRITICAL agent failed. System degraded.`);
        this.emitCriticalFailure(agentId);
      }
    }
  }

  /** 健康检查 */
  private runHealthChecks(): void {
    for (const [id, state] of this.agents) {
      const stats = state.config.circuitBreaker.getStats();
      const wasHealthy = state.isHealthy;

      // 基于熔断器状态判断健康
      state.isHealthy = stats.state !== CircuitState.OPEN || stats.consecutiveFailures === 0;

      if (wasHealthy && !state.isHealthy) {
        console.warn(`[Supervisor:${this.name}] Agent [${id}] health check: UNHEALTHY`);
      } else if (!wasHealthy && state.isHealthy) {
        console.log(`[Supervisor:${this.name}] Agent [${id}] health check: RECOVERED`);
      }
    }
  }

  /** 触发关键故障事件 */
  private emitCriticalFailure(agentId: string): void {
    // 在实际系统中，这里会触发告警、通知运维团队等
    console.error(`!!! CRITICAL FAILURE: Agent [${agentId}] in supervisor [${this.name}] !!!`);
  }

  /** 获取所有 Agent 状态概览 */
  getStatus(): Map<string, { healthy: boolean; activeAgent: string; restarts: number; circuit: CircuitBreakerStats }> {
    const status = new Map();
    for (const [id, state] of this.agents) {
      status.set(id, {
        healthy: state.isHealthy,
        activeAgent: state.activeAgent.constructor.name,
        restarts: state.restartCount,
        circuit: state.config.circuitBreaker.getStats(),
      });
    }
    return status;
  }
}
```

### 9.6.3 优雅降级（Graceful Degradation）

当系统部分功能不可用时，优雅降级确保核心功能继续运行，而非全面停机。

```typescript
// ========================================
// 9.6.3 GracefulDegradationManager
// ========================================

enum ServiceLevel {
  FULL = "FULL",           // 全功能
  DEGRADED = "DEGRADED",   // 部分功能降级
  MINIMAL = "MINIMAL",     // 最小功能集
  EMERGENCY = "EMERGENCY", // 紧急模式
}

interface DegradationRule {
  condition: () => boolean;              // 触发条件
  targetLevel: ServiceLevel;             // 降级目标
  disabledFeatures: string[];            // 禁用的功能列表
  fallbackBehavior: Map<string, () => Promise<unknown>>; // 功能降级替代方案
  message: string;                       // 降级原因描述
}

class GracefulDegradationManager {
  private currentLevel: ServiceLevel = ServiceLevel.FULL;
  private rules: DegradationRule[] = [];
  private disabledFeatures = new Set<string>();
  private fallbacks = new Map<string, () => Promise<unknown>>();
  private levelListeners: Array<(oldLevel: ServiceLevel, newLevel: ServiceLevel) => void> = [];

  constructor(private readonly evaluationInterval: number = 5000) {}

  /** 注册降级规则 */
  addRule(rule: DegradationRule): void {
    this.rules.push(rule);
    // 按降级严重程度排序（EMERGENCY > MINIMAL > DEGRADED > FULL）
    const order = { EMERGENCY: 3, MINIMAL: 2, DEGRADED: 1, FULL: 0 };
    this.rules.sort((a, b) => order[b.targetLevel] - order[a.targetLevel]);
  }

  /** 注册服务等级变更监听器 */
  onLevelChange(listener: (oldLevel: ServiceLevel, newLevel: ServiceLevel) => void): void {
    this.levelListeners.push(listener);
  }

  /** 评估当前系统状态并执行降级 */
  evaluate(): ServiceLevel {
    let targetLevel = ServiceLevel.FULL;
    const newDisabled = new Set<string>();
    const newFallbacks = new Map<string, () => Promise<unknown>>();

    for (const rule of this.rules) {
      if (rule.condition()) {
        // 取最严重的降级等级
        const order = { EMERGENCY: 3, MINIMAL: 2, DEGRADED: 1, FULL: 0 };
        if (order[rule.targetLevel] > order[targetLevel]) {
          targetLevel = rule.targetLevel;
        }

        for (const feature of rule.disabledFeatures) {
          newDisabled.add(feature);
        }

        for (const [feature, fallback] of rule.fallbackBehavior) {
          newFallbacks.set(feature, fallback);
        }

        console.log(`[Degradation] Rule triggered: ${rule.message} → ${rule.targetLevel}`);
      }
    }

    // 更新状态
    const oldLevel = this.currentLevel;
    this.currentLevel = targetLevel;
    this.disabledFeatures = newDisabled;
    this.fallbacks = newFallbacks;

    if (oldLevel !== targetLevel) {
      console.log(`[Degradation] Service level changed: ${oldLevel} → ${targetLevel}`);
      for (const listener of this.levelListeners) {
        try { listener(oldLevel, targetLevel); } catch {}
      }
    }

    return targetLevel;
  }

  /** 检查功能是否可用 */
  isFeatureEnabled(feature: string): boolean {
    return !this.disabledFeatures.has(feature);
  }

  /** 执行功能（自动使用 fallback） */
  async executeFeature<T>(
    feature: string,
    primary: () => Promise<T>,
    defaultValue?: T
  ): Promise<T> {
    if (this.isFeatureEnabled(feature)) {
      return primary();
    }

    const fallback = this.fallbacks.get(feature);
    if (fallback) {
      console.log(`[Degradation] Using fallback for feature: ${feature}`);
      return fallback() as Promise<T>;
    }

    if (defaultValue !== undefined) {
      console.log(`[Degradation] Using default value for disabled feature: ${feature}`);
      return defaultValue;
    }

    throw new FeatureDisabledError(
      `Feature [${feature}] is disabled at service level [${this.currentLevel}] with no fallback.`
    );
  }

  /** 获取当前服务等级 */
  getCurrentLevel(): ServiceLevel {
    return this.currentLevel;
  }

  /** 获取禁用功能列表 */
  getDisabledFeatures(): string[] {
    return Array.from(this.disabledFeatures);
  }
}

class FeatureDisabledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeatureDisabledError";
  }
}
```

**使用示例：配置降级规则**

```typescript
const degradation = new GracefulDegradationManager();
const supervisor = new SupervisorAgent("main-supervisor");

// 规则 1：当 LLM Agent 不可用时，降级到关键词匹配
degradation.addRule({
  condition: () => {
    const status = supervisor.getStatus();
    const llmStatus = status.get("llm-agent");
    return llmStatus ? !llmStatus.healthy : false;
  },
  targetLevel: ServiceLevel.DEGRADED,
  disabledFeatures: ["natural-language-understanding", "sentiment-analysis"],
  fallbackBehavior: new Map([
    ["natural-language-understanding", async () => ({ intent: "unknown", confidence: 0.0 })],
    ["sentiment-analysis", async () => ({ sentiment: "neutral", score: 0.5 })],
  ]),
  message: "LLM Agent unhealthy, falling back to keyword matching",
});

// 规则 2：当数据库 Agent 不可用时，进入最小功能模式
degradation.addRule({
  condition: () => {
    const status = supervisor.getStatus();
    const dbStatus = status.get("db-agent");
    return dbStatus ? !dbStatus.healthy : false;
  },
  targetLevel: ServiceLevel.MINIMAL,
  disabledFeatures: ["order-query", "order-cancel", "user-profile"],
  fallbackBehavior: new Map([
    ["order-query", async () => ({ message: "订单查询暂时不可用，请稍后重试。" })],
  ]),
  message: "Database Agent unhealthy, disabling data-dependent features",
});
```

> **关键洞察：** 容错设计的核心原则是"失败是常态，而非例外"。在 Multi-Agent 系统中，永远假设任何 Agent 都可能在任何时刻失败，并为此做好准备。三层防护体系：熔断器（防止级联）→ 监督者（自动恢复）→ 优雅降级（保底服务）。

---



## 9.7 实战：客服 Multi-Agent 系统

本节将前面介绍的所有概念整合为一个完整的客服 Multi-Agent 系统。该系统处理客户咨询，包括 FAQ 问答、订单查询、工单升级和满意度反馈，展示 Multi-Agent 架构在真实场景中的应用。

### 9.7.1 系统架构

```
                         ┌──────────────┐
                         │   Customer   │
                         └──────┬───────┘
                                │
                         ┌──────▼───────┐
                         │  RouterAgent │  意图识别 + 路由
                         └──────┬───────┘
                   ┌────────────┼────────────┐
                   │            │            │
            ┌──────▼──────┐ ┌──▼─────────┐ ┌▼────────────┐
            │  FAQAgent   │ │ OrderAgent  │ │EscalationAgt│
            │  FAQ 问答   │ │ 订单处理    │ │  工单升级    │
            └──────┬──────┘ └──┬─────────┘ └┬────────────┘
                   │            │            │
                   └────────────┼────────────┘
                                │
                         ┌──────▼───────┐
                         │FeedbackAgent │  满意度收集
                         └──────────────┘
```

### 9.7.2 共享上下文定义

```typescript
// ========================================
// 9.7.2 客服系统共享上下文
// ========================================

interface CustomerServiceContext {
  sessionId: string;
  customerId: string;
  customerName: string;
  query: string;
  intent: CustomerIntent | null;
  history: ConversationTurn[];
  metadata: {
    channel: "web" | "app" | "phone";
    language: string;
    vipLevel: number;
    previousTickets: number;
  };
}

enum CustomerIntent {
  FAQ = "FAQ",
  ORDER_QUERY = "ORDER_QUERY",
  ORDER_CANCEL = "ORDER_CANCEL",
  COMPLAINT = "COMPLAINT",
  FEEDBACK = "FEEDBACK",
  UNKNOWN = "UNKNOWN",
}

interface ConversationTurn {
  role: "customer" | "agent";
  agentId?: string;
  content: string;
  timestamp: number;
}

interface AgentResponse {
  agentId: string;
  content: string;
  confidence: number;
  suggestedNextAgent?: string;
  metadata?: Record<string, unknown>;
}
```

### 9.7.3 FAQAgent — 知识库问答

```typescript
// ========================================
// 9.7.3 FAQAgent 实现
// ========================================

interface FAQEntry {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  category: string;
  priority: number;
}

class FAQAgent implements BaseAgent {
  readonly name = "FAQAgent";
  private knowledgeBase: FAQEntry[] = [];

  constructor(entries: FAQEntry[]) {
    this.knowledgeBase = entries;
  }

  /** 加载知识库 */
  loadKnowledgeBase(entries: FAQEntry[]): void {
    this.knowledgeBase = entries;
    console.log(`[FAQAgent] Loaded ${entries.length} FAQ entries.`);
  }

  /** 处理 FAQ 查询 */
  async handle(context: CustomerServiceContext): Promise<AgentResponse> {
    const query = context.query.toLowerCase();

    // 1. 关键词匹配
    const scored = this.knowledgeBase.map((entry) => ({
      entry,
      score: this.calculateRelevance(query, entry),
    }));

    // 2. 按相关性排序
    scored.sort((a, b) => b.score - a.score);
    const bestMatch = scored[0];

    if (bestMatch && bestMatch.score > 0.3) {
      return {
        agentId: this.name,
        content: bestMatch.entry.answer,
        confidence: Math.min(bestMatch.score, 1.0),
        metadata: {
          matchedFaqId: bestMatch.entry.id,
          category: bestMatch.entry.category,
          score: bestMatch.score,
        },
      };
    }

    // 3. 无匹配，建议升级
    return {
      agentId: this.name,
      content: "抱歉，我暂时无法回答这个问题。正在为您转接人工客服。",
      confidence: 0.1,
      suggestedNextAgent: "EscalationAgent",
    };
  }

  /** 计算查询与 FAQ 条目的相关性 */
  private calculateRelevance(query: string, entry: FAQEntry): number {
    let score = 0;
    const queryWords = this.tokenize(query);

    // 关键词精确匹配（权重最高）
    for (const keyword of entry.keywords) {
      if (query.includes(keyword.toLowerCase())) {
        score += 0.4;
      }
    }

    // 问题文本模糊匹配
    const questionWords = this.tokenize(entry.question.toLowerCase());
    const overlap = queryWords.filter((w) => questionWords.includes(w));
    if (questionWords.length > 0) {
      score += (overlap.length / questionWords.length) * 0.4;
    }

    // 类别加权
    if (query.includes(entry.category.toLowerCase())) {
      score += 0.2;
    }

    return score;
  }

  /** 简单分词（生产环境应使用 NLP 分词器） */
  private tokenize(text: string): string[] {
    return text
      .replace(/[^\w\u4e00-\u9fff]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 0);
  }
}
```

### 9.7.4 OrderAgent — 订单处理

```typescript
// ========================================
// 9.7.4 OrderAgent 实现
// ========================================

interface Order {
  orderId: string;
  customerId: string;
  status: "pending" | "shipped" | "delivered" | "cancelled" | "refunding";
  items: Array<{ name: string; quantity: number; price: number }>;
  totalAmount: number;
  createdAt: number;
  updatedAt: number;
  trackingNumber?: string;
}

class OrderAgent implements BaseAgent {
  readonly name = "OrderAgent";

  // 模拟订单数据库
  private orders = new Map<string, Order>();

  constructor(mockOrders?: Order[]) {
    if (mockOrders) {
      for (const order of mockOrders) {
        this.orders.set(order.orderId, order);
      }
    }
  }

  /** 处理订单相关查询 */
  async handle(context: CustomerServiceContext): Promise<AgentResponse> {
    const intent = context.intent;

    switch (intent) {
      case CustomerIntent.ORDER_QUERY:
        return this.handleOrderQuery(context);
      case CustomerIntent.ORDER_CANCEL:
        return this.handleOrderCancel(context);
      default:
        return {
          agentId: this.name,
          content: "请问您需要查询订单还是取消订单？",
          confidence: 0.5,
        };
    }
  }

  /** 查询订单 */
  private async handleOrderQuery(context: CustomerServiceContext): Promise<AgentResponse> {
    // 从用户查询中提取订单号
    const orderIdMatch = context.query.match(/[A-Z]{2,3}-\d{6,}/i);

    if (orderIdMatch) {
      const orderId = orderIdMatch[0].toUpperCase();
      const order = this.orders.get(orderId);

      if (order) {
        return {
          agentId: this.name,
          content: this.formatOrderInfo(order),
          confidence: 0.95,
          metadata: { orderId, orderStatus: order.status },
        };
      }

      return {
        agentId: this.name,
        content: `未找到订单号 ${orderId}，请确认订单号是否正确。`,
        confidence: 0.7,
      };
    }

    // 查询该客户的所有订单
    const customerOrders = Array.from(this.orders.values())
      .filter((o) => o.customerId === context.customerId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5);

    if (customerOrders.length > 0) {
      const summary = customerOrders
        .map((o) => `  - ${o.orderId}: ${this.statusToText(o.status)}，金额 ¥${o.totalAmount}`)
        .join("\n");

      return {
        agentId: this.name,
        content: `您最近的订单如下：\n${summary}\n\n请问需要查询哪个订单的详细信息？`,
        confidence: 0.8,
        metadata: { orderCount: customerOrders.length },
      };
    }

    return {
      agentId: this.name,
      content: "未找到您的订单记录。如有疑问，请提供订单号以便查询。",
      confidence: 0.6,
    };
  }

  /** 取消订单 */
  private async handleOrderCancel(context: CustomerServiceContext): Promise<AgentResponse> {
    const orderIdMatch = context.query.match(/[A-Z]{2,3}-\d{6,}/i);

    if (!orderIdMatch) {
      return {
        agentId: this.name,
        content: "请提供您要取消的订单号。",
        confidence: 0.6,
      };
    }

    const orderId = orderIdMatch[0].toUpperCase();
    const order = this.orders.get(orderId);

    if (!order) {
      return {
        agentId: this.name,
        content: `未找到订单号 ${orderId}。`,
        confidence: 0.7,
      };
    }

    if (order.status === "pending") {
      order.status = "cancelled";
      order.updatedAt = Date.now();

      return {
        agentId: this.name,
        content: `订单 ${orderId} 已成功取消。退款将在 3-5 个工作日内退回原支付方式。`,
        confidence: 0.95,
        metadata: { orderId, action: "cancelled" },
      };
    }

    if (order.status === "shipped") {
      return {
        agentId: this.name,
        content: `订单 ${orderId} 已发货，无法直接取消。需要为您申请退货退款吗？`,
        confidence: 0.8,
        suggestedNextAgent: "EscalationAgent",
      };
    }

    return {
      agentId: this.name,
      content: `订单 ${orderId} 当前状态为「${this.statusToText(order.status)}」，无法取消。`,
      confidence: 0.8,
    };
  }

  /** 格式化订单信息 */
  private formatOrderInfo(order: Order): string {
    const items = order.items
      .map((item) => `  - ${item.name} × ${item.quantity}  ¥${item.price}`)
      .join("\n");

    let info = `📦 订单 ${order.orderId}\n`;
    info += `状态：${this.statusToText(order.status)}\n`;
    info += `商品：\n${items}\n`;
    info += `总金额：¥${order.totalAmount}\n`;
    info += `下单时间：${new Date(order.createdAt).toLocaleString("zh-CN")}`;

    if (order.trackingNumber) {
      info += `\n物流单号：${order.trackingNumber}`;
    }

    return info;
  }

  /** 状态映射 */
  private statusToText(status: Order["status"]): string {
    const map: Record<Order["status"], string> = {
      pending: "待发货",
      shipped: "已发货",
      delivered: "已送达",
      cancelled: "已取消",
      refunding: "退款中",
    };
    return map[status] ?? status;
  }
}
```

### 9.7.5 EscalationAgent — 工单升级

```typescript
// ========================================
// 9.7.5 EscalationAgent 实现
// ========================================

interface Ticket {
  ticketId: string;
  customerId: string;
  customerName: string;
  summary: string;
  detail: string;
  priority: "low" | "medium" | "high" | "urgent";
  category: string;
  status: "open" | "assigned" | "in_progress" | "resolved" | "closed";
  assignedTo: string | null;
  createdAt: number;
  conversationHistory: ConversationTurn[];
}

class EscalationAgent implements BaseAgent {
  readonly name = "EscalationAgent";

  private tickets: Ticket[] = [];
  private ticketCounter = 0;

  /** 处理升级请求 */
  async handle(context: CustomerServiceContext): Promise<AgentResponse> {
    // 分析对话历史确定问题严重度
    const severity = this.analyzeSeverity(context);
    const category = this.categorizeIssue(context);

    // 创建工单
    const ticket = this.createTicket(context, severity, category);

    // 生成回复
    const waitTime = this.estimateWaitTime(severity);

    return {
      agentId: this.name,
      content:
        `已为您创建工单 ${ticket.ticketId}。\n` +
        `优先级：${this.priorityToText(severity)}\n` +
        `预计处理时间：${waitTime}\n\n` +
        `我们的专业客服团队会尽快与您联系。如需补充信息，请随时回复。`,
      confidence: 0.9,
      metadata: {
        ticketId: ticket.ticketId,
        priority: severity,
        category,
      },
    };
  }

  /** 分析问题严重程度 */
  private analyzeSeverity(context: CustomerServiceContext): Ticket["priority"] {
    const query = context.query.toLowerCase();
    const history = context.history.map((t) => t.content.toLowerCase()).join(" ");
    const fullText = `${query} ${history}`;

    // 紧急关键词
    if (/投诉|举报|法律|律师|消费者协会|欺诈|骗/.test(fullText)) {
      return "urgent";
    }

    // 高优先级关键词
    if (/退款|损坏|破损|丢失|延迟超过|差评/.test(fullText)) {
      return "high";
    }

    // 中优先级
    if (/换货|修改|变更|不满意|问题/.test(fullText)) {
      return "medium";
    }

    // VIP 客户自动提升
    if (context.metadata.vipLevel >= 3) {
      return "high";
    }

    return "low";
  }

  /** 问题分类 */
  private categorizeIssue(context: CustomerServiceContext): string {
    const query = context.query.toLowerCase();

    if (/退款|退货/.test(query)) return "refund";
    if (/物流|快递|配送/.test(query)) return "logistics";
    if (/质量|损坏|破损/.test(query)) return "quality";
    if (/账户|密码|登录/.test(query)) return "account";
    if (/发票|报销/.test(query)) return "invoice";

    return "general";
  }

  /** 创建工单 */
  private createTicket(
    context: CustomerServiceContext,
    priority: Ticket["priority"],
    category: string
  ): Ticket {
    this.ticketCounter++;
    const ticket: Ticket = {
      ticketId: `TK-${String(this.ticketCounter).padStart(6, "0")}`,
      customerId: context.customerId,
      customerName: context.customerName,
      summary: context.query.slice(0, 100),
      detail: context.query,
      priority,
      category,
      status: "open",
      assignedTo: null,
      createdAt: Date.now(),
      conversationHistory: [...context.history],
    };

    this.tickets.push(ticket);
    console.log(`[EscalationAgent] Created ticket ${ticket.ticketId} (${priority}/${category})`);
    return ticket;
  }

  /** 估算等待时间 */
  private estimateWaitTime(priority: Ticket["priority"]): string {
    const times: Record<Ticket["priority"], string> = {
      urgent: "30 分钟内",
      high: "2 小时内",
      medium: "24 小时内",
      low: "48 小时内",
    };
    return times[priority];
  }

  /** 优先级文本 */
  private priorityToText(priority: Ticket["priority"]): string {
    const map: Record<Ticket["priority"], string> = {
      urgent: "🔴 紧急",
      high: "🟠 高",
      medium: "🟡 中",
      low: "🟢 低",
    };
    return map[priority];
  }
}
```

### 9.7.6 FeedbackAgent — 满意度收集

```typescript
// ========================================
// 9.7.6 FeedbackAgent 实现
// ========================================

interface FeedbackRecord {
  sessionId: string;
  customerId: string;
  rating: number;              // 1-5
  tags: string[];
  comment: string;
  handlingAgents: string[];   // 参与处理的 Agent 列表
  timestamp: number;
}

class FeedbackAgent implements BaseAgent {
  readonly name = "FeedbackAgent";

  private feedbackRecords: FeedbackRecord[] = [];

  /** 收集反馈 */
  async handle(context: CustomerServiceContext): Promise<AgentResponse> {
    // 分析对话情感
    const sentiment = this.analyzeSentiment(context);

    // 提取参与的 Agent
    const agents = [...new Set(context.history.filter((t) => t.agentId).map((t) => t.agentId!))];

    // 自动评分（基于情感分析 + 对话轮次）
    const autoRating = this.calculateAutoRating(sentiment, context);

    const record: FeedbackRecord = {
      sessionId: context.sessionId,
      customerId: context.customerId,
      rating: autoRating,
      tags: this.extractTags(context),
      comment: context.query,
      handlingAgents: agents,
      timestamp: Date.now(),
    };

    this.feedbackRecords.push(record);

    if (autoRating <= 2) {
      return {
        agentId: this.name,
        content:
          "非常抱歉给您带来了不好的体验。我们已记录您的反馈，" +
          "管理团队会重点跟进改善。感谢您的宝贵意见！",
        confidence: 0.85,
        metadata: { rating: autoRating, sentiment },
      };
    }

    return {
      agentId: this.name,
      content:
        "感谢您的反馈！您的意见对我们非常重要，" +
        "我们会持续改进服务质量。祝您生活愉快！",
      confidence: 0.85,
      metadata: { rating: autoRating, sentiment },
    };
  }

  /** 情感分析（简化版） */
  private analyzeSentiment(context: CustomerServiceContext): number {
    const text = context.history.map((t) => t.content).join(" ");

    let score = 0.5; // 中性基线

    // 积极词汇
    const positiveWords = ["谢谢", "感谢", "满意", "很好", "不错", "棒", "赞", "解决了"];
    for (const word of positiveWords) {
      if (text.includes(word)) score += 0.1;
    }

    // 消极词汇
    const negativeWords = ["差", "烂", "垃圾", "投诉", "不满", "失望", "生气", "恼火", "太慢"];
    for (const word of negativeWords) {
      if (text.includes(word)) score -= 0.15;
    }

    return Math.max(0, Math.min(1, score));
  }

  /** 自动评分 */
  private calculateAutoRating(sentiment: number, context: CustomerServiceContext): number {
    // 基于情感分数
    let rating = Math.round(sentiment * 4) + 1; // 1-5

    // 对话轮次过多意味着解决效率低
    if (context.history.length > 10) rating = Math.max(1, rating - 1);

    // VIP 客户的反馈权重更高（用于内部分析，不影响显示评分）
    return Math.max(1, Math.min(5, rating));
  }

  /** 提取标签 */
  private extractTags(context: CustomerServiceContext): string[] {
    const tags: string[] = [];
    const text = context.query.toLowerCase();

    if (/速度|快|慢|效率/.test(text)) tags.push("response-speed");
    if (/态度|礼貌|耐心/.test(text)) tags.push("service-attitude");
    if (/专业|准确|正确/.test(text)) tags.push("professionalism");
    if (/方便|简单|复杂/.test(text)) tags.push("ease-of-use");

    return tags;
  }

  /** 获取统计报告 */
  getStatistics(): {
    averageRating: number;
    totalFeedbacks: number;
    ratingDistribution: Record<number, number>;
    topTags: Array<{ tag: string; count: number }>;
  } {
    const total = this.feedbackRecords.length;
    if (total === 0) {
      return { averageRating: 0, totalFeedbacks: 0, ratingDistribution: {}, topTags: [] };
    }

    const avg = this.feedbackRecords.reduce((sum, r) => sum + r.rating, 0) / total;

    const distribution: Record<number, number> = {};
    for (const r of this.feedbackRecords) {
      distribution[r.rating] = (distribution[r.rating] ?? 0) + 1;
    }

    const tagCounts = new Map<string, number>();
    for (const r of this.feedbackRecords) {
      for (const tag of r.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }

    const topTags = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return { averageRating: avg, totalFeedbacks: total, ratingDistribution: distribution, topTags };
  }
}
```

### 9.7.7 RouterAgent — 意图识别与路由

```typescript
// ========================================
// 9.7.7 RouterAgent 实现
// ========================================

interface RoutingRule {
  intent: CustomerIntent;
  targetAgent: string;
  priority: number;
  condition?: (context: CustomerServiceContext) => boolean;
}

class RouterAgent implements BaseAgent {
  readonly name = "RouterAgent";

  private rules: RoutingRule[] = [];
  private agents = new Map<string, BaseAgent>();
  private defaultAgent: string = "FAQAgent";

  /** 注册路由规则 */
  addRule(rule: RoutingRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  /** 注册处理 Agent */
  registerAgent(name: string, agent: BaseAgent): void {
    this.agents.set(name, agent);
  }

  /** 设置默认 Agent */
  setDefaultAgent(name: string): void {
    this.defaultAgent = name;
  }

  /** 主路由逻辑 */
  async handle(context: CustomerServiceContext): Promise<AgentResponse> {
    // 1. 意图识别
    const intent = this.detectIntent(context);
    context.intent = intent;

    console.log(`[RouterAgent] Detected intent: ${intent} for query: "${context.query.slice(0, 50)}..."`);

    // 2. 查找匹配的路由规则
    const targetAgentName = this.findTargetAgent(intent, context);
    const targetAgent = this.agents.get(targetAgentName);

    if (!targetAgent) {
      console.error(`[RouterAgent] Target agent [${targetAgentName}] not found.`);
      return {
        agentId: this.name,
        content: "系统暂时无法处理您的请求，请稍后重试。",
        confidence: 0.1,
      };
    }

    // 3. 记录路由到对话历史
    context.history.push({
      role: "agent",
      agentId: this.name,
      content: `[路由] 意图: ${intent} → ${targetAgentName}`,
      timestamp: Date.now(),
    });

    // 4. 转发给目标 Agent
    console.log(`[RouterAgent] Routing to: ${targetAgentName}`);
    const response = await (targetAgent as any).handle(context);

    // 5. 检查是否需要二次路由（Agent 建议转交）
    if (response.suggestedNextAgent) {
      const nextAgent = this.agents.get(response.suggestedNextAgent);
      if (nextAgent) {
        console.log(`[RouterAgent] Handoff: ${targetAgentName} → ${response.suggestedNextAgent}`);

        context.history.push({
          role: "agent",
          agentId: targetAgentName,
          content: response.content,
          timestamp: Date.now(),
        });

        return (nextAgent as any).handle(context);
      }
    }

    return response;
  }

  /** 意图识别（基于规则，生产环境应使用 NLU 模型） */
  private detectIntent(context: CustomerServiceContext): CustomerIntent {
    const query = context.query.toLowerCase();

    // 订单取消意图
    if (/取消.{0,5}订单|退单|不要了/.test(query)) {
      return CustomerIntent.ORDER_CANCEL;
    }

    // 订单查询意图
    if (/订单|物流|快递|发货|到货|配送|追踪/.test(query)) {
      return CustomerIntent.ORDER_QUERY;
    }

    // 投诉意图
    if (/投诉|举报|不满意|差评|垃圾|骗/.test(query)) {
      return CustomerIntent.COMPLAINT;
    }

    // 反馈意图
    if (/反馈|建议|评价|感谢|表扬/.test(query)) {
      return CustomerIntent.FEEDBACK;
    }

    // 默认为 FAQ
    return CustomerIntent.FAQ;
  }

  /** 查找目标 Agent */
  private findTargetAgent(intent: CustomerIntent, context: CustomerServiceContext): string {
    for (const rule of this.rules) {
      if (rule.intent === intent) {
        if (!rule.condition || rule.condition(context)) {
          return rule.targetAgent;
        }
      }
    }
    return this.defaultAgent;
  }
}
```

### 9.7.8 系统组装与运行

```typescript
// ========================================
// 9.7.8 CustomerServiceSystem 完整组装
// ========================================

class CustomerServiceSystem {
  private router: RouterAgent;
  private supervisor: SupervisorAgent;
  private degradation: GracefulDegradationManager;
  private messageBus: DirectMessageBus;
  private eventStream: EventStream;
  private sharedState: SharedStateManager;

  constructor() {
    // 1. 初始化基础设施
    this.messageBus = new DirectMessageBus();
    this.eventStream = new EventStream();
    this.sharedState = new SharedStateManager();
    this.degradation = new GracefulDegradationManager();

    // 2. 创建 Agent 实例
    const faqAgent = new FAQAgent([
      {
        id: "faq-001", question: "如何退货？",
        answer: "您可以在收货后7天内申请退货。请进入「我的订单」选择对应订单，点击「申请退货」按钮，填写退货原因后提交即可。我们会在1-3个工作日内审核。",
        keywords: ["退货", "退货流程", "怎么退货", "退货方法"],
        category: "售后", priority: 10,
      },
      {
        id: "faq-002", question: "运费多少？",
        answer: "订单满99元免运费。未满99元收取8元运费。偏远地区（新疆、西藏等）运费另计。会员用户享受免运费特权。",
        keywords: ["运费", "邮费", "快递费", "包邮"],
        category: "物流", priority: 8,
      },
      {
        id: "faq-003", question: "如何修改收货地址？",
        answer: "订单未发货前，您可以在「我的订单」中点击「修改地址」。如果订单已发货，请联系客服协助处理。",
        keywords: ["修改地址", "改地址", "收货地址", "更换地址"],
        category: "订单", priority: 7,
      },
      {
        id: "faq-004", question: "支持哪些支付方式？",
        answer: "我们支持微信支付、支付宝、银联卡、信用卡（Visa/MasterCard）以及货到付款（部分地区）。",
        keywords: ["支付", "付款", "怎么付", "支付方式"],
        category: "支付", priority: 6,
      },
    ]);

    const orderAgent = new OrderAgent([
      {
        orderId: "ORD-202401001", customerId: "C001", status: "shipped",
        items: [{ name: "无线蓝牙耳机", quantity: 1, price: 299 }],
        totalAmount: 299, createdAt: Date.now() - 86400000 * 3, updatedAt: Date.now() - 86400000,
        trackingNumber: "SF1234567890",
      },
      {
        orderId: "ORD-202401002", customerId: "C001", status: "pending",
        items: [
          { name: "手机壳", quantity: 2, price: 39 },
          { name: "钢化膜", quantity: 1, price: 19 },
        ],
        totalAmount: 97, createdAt: Date.now() - 3600000, updatedAt: Date.now() - 3600000,
      },
    ]);

    const escalationAgent = new EscalationAgent();
    const feedbackAgent = new FeedbackAgent();

    // 3. 配置路由器
    this.router = new RouterAgent();
    this.router.registerAgent("FAQAgent", faqAgent);
    this.router.registerAgent("OrderAgent", orderAgent);
    this.router.registerAgent("EscalationAgent", escalationAgent);
    this.router.registerAgent("FeedbackAgent", feedbackAgent);

    this.router.addRule({ intent: CustomerIntent.FAQ, targetAgent: "FAQAgent", priority: 10 });
    this.router.addRule({ intent: CustomerIntent.ORDER_QUERY, targetAgent: "OrderAgent", priority: 10 });
    this.router.addRule({ intent: CustomerIntent.ORDER_CANCEL, targetAgent: "OrderAgent", priority: 10 });
    this.router.addRule({ intent: CustomerIntent.COMPLAINT, targetAgent: "EscalationAgent", priority: 20 });
    this.router.addRule({ intent: CustomerIntent.FEEDBACK, targetAgent: "FeedbackAgent", priority: 5 });
    this.router.addRule({ intent: CustomerIntent.UNKNOWN, targetAgent: "FAQAgent", priority: 1 });

    // 4. 配置监督器
    this.supervisor = new SupervisorAgent("cs-supervisor", RestartStrategy.ONE_FOR_ONE);
    this.supervisor.register("faq", {
      agent: faqAgent,
      circuitBreaker: new CircuitBreaker("faq-cb", {
        failureThreshold: 3, resetTimeout: 30000, halfOpenMaxAttempts: 1,
      }),
      substitutes: [],
      maxRestarts: 5,
      restartWindow: 60000,
      critical: false,
    });
    this.supervisor.register("order", {
      agent: orderAgent,
      circuitBreaker: new CircuitBreaker("order-cb", {
        failureThreshold: 2, resetTimeout: 15000, halfOpenMaxAttempts: 1,
      }),
      substitutes: [],
      maxRestarts: 3,
      restartWindow: 60000,
      critical: true,
    });

    // 5. 配置降级规则
    this.degradation.addRule({
      condition: () => {
        const status = this.supervisor.getStatus();
        const faqStatus = status.get("faq");
        return faqStatus ? !faqStatus.healthy : false;
      },
      targetLevel: ServiceLevel.DEGRADED,
      disabledFeatures: ["smart-faq"],
      fallbackBehavior: new Map([
        ["smart-faq", async () => "暂时无法提供智能问答，请拨打客服热线 400-XXX-XXXX。"],
      ]),
      message: "FAQ Agent degraded",
    });

    // 6. 配置事件流监听
    this.eventStream.subscribe("customer-service.*", {
      id: "analytics-listener",
      topic: "customer-service.*",
      handler: async (event) => {
        console.log(`[Analytics] Event: ${event.type}`, JSON.stringify(event.data).slice(0, 200));
      },
    });

    // 7. 启动监督器
    this.supervisor.start();

    console.log("[CustomerServiceSystem] Initialized and ready.");
  }

  /** 处理客户消息 */
  async handleMessage(
    customerId: string,
    customerName: string,
    message: string,
    metadata?: Partial<CustomerServiceContext["metadata"]>
  ): Promise<string> {
    const context: CustomerServiceContext = {
      sessionId: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      customerId,
      customerName,
      query: message,
      intent: null,
      history: [
        {
          role: "customer",
          content: message,
          timestamp: Date.now(),
        },
      ],
      metadata: {
        channel: metadata?.channel ?? "web",
        language: metadata?.language ?? "zh-CN",
        vipLevel: metadata?.vipLevel ?? 0,
        previousTickets: metadata?.previousTickets ?? 0,
      },
    };

    // 发布事件
    this.eventStream.publish({
      id: `evt-${Date.now()}`,
      type: "customer-service.message.received",
      source: "system",
      data: { customerId, message: message.slice(0, 100) },
      timestamp: Date.now(),
    });

    // 评估降级状态
    this.degradation.evaluate();

    try {
      const response = await this.router.handle(context);

      // 发布处理完成事件
      this.eventStream.publish({
        id: `evt-${Date.now()}`,
        type: "customer-service.message.handled",
        source: response.agentId,
        data: {
          customerId,
          intent: context.intent,
          confidence: response.confidence,
          agentId: response.agentId,
        },
        timestamp: Date.now(),
      });

      return response.content;
    } catch (error) {
      console.error("[CustomerServiceSystem] Error handling message:", error);

      // 降级响应
      return "非常抱歉，系统暂时出现问题。请稍后重试或拨打客服热线 400-XXX-XXXX。";
    }
  }

  /** 关闭系统 */
  shutdown(): void {
    this.supervisor.stop();
    console.log("[CustomerServiceSystem] Shutdown complete.");
  }
}
```

**运行示例：**

```typescript
async function demo() {
  const system = new CustomerServiceSystem();

  // 场景 1: FAQ 查询
  console.log("\n--- 场景 1: FAQ 查询 ---");
  const r1 = await system.handleMessage("C001", "张三", "请问怎么退货？");
  console.log("回复:", r1);

  // 场景 2: 订单查询
  console.log("\n--- 场景 2: 订单查询 ---");
  const r2 = await system.handleMessage("C001", "张三", "我想查一下订单 ORD-202401001 的物流信息");
  console.log("回复:", r2);

  // 场景 3: 订单取消
  console.log("\n--- 场景 3: 订单取消 ---");
  const r3 = await system.handleMessage("C001", "张三", "帮我取消订单 ORD-202401002");
  console.log("回复:", r3);

  // 场景 4: 投诉升级
  console.log("\n--- 场景 4: 投诉升级 ---");
  const r4 = await system.handleMessage("C001", "张三", "我要投诉！收到的耳机是坏的，质量太差了！");
  console.log("回复:", r4);

  // 场景 5: 反馈
  console.log("\n--- 场景 5: 满意度反馈 ---");
  const r5 = await system.handleMessage("C001", "张三", "谢谢你们的帮助，问题解决了，服务态度很好！");
  console.log("回复:", r5);

  system.shutdown();
}

demo().catch(console.error);
```

**预期输出（简化）：**

```
[CustomerServiceSystem] Initialized and ready.

--- 场景 1: FAQ 查询 ---
[RouterAgent] Detected intent: FAQ for query: "请问怎么退货？..."
[RouterAgent] Routing to: FAQAgent
回复: 您可以在收货后7天内申请退货。请进入「我的订单」选择对应订单...

--- 场景 2: 订单查询 ---
[RouterAgent] Detected intent: ORDER_QUERY for query: "我想查一下订单 ORD-202401001..."
[RouterAgent] Routing to: OrderAgent
回复: 📦 订单 ORD-202401001
状态：已发货
物流单号：SF1234567890...

--- 场景 3: 订单取消 ---
[RouterAgent] Detected intent: ORDER_CANCEL for query: "帮我取消订单 ORD-202401002..."
[RouterAgent] Routing to: OrderAgent
回复: 订单 ORD-202401002 已成功取消。退款将在 3-5 个工作日内退回原支付方式。

--- 场景 4: 投诉升级 ---
[RouterAgent] Detected intent: COMPLAINT for query: "我要投诉！收到的耳机是坏的..."
[RouterAgent] Routing to: EscalationAgent
[EscalationAgent] Created ticket TK-000001 (high/quality)
回复: 已为您创建工单 TK-000001。
优先级：🟠 高
预计处理时间：2 小时内...

--- 场景 5: 满意度反馈 ---
[RouterAgent] Detected intent: FEEDBACK for query: "谢谢你们的帮助..."
[RouterAgent] Routing to: FeedbackAgent
回复: 感谢您的反馈！您的意见对我们非常重要...

[CustomerServiceSystem] Shutdown complete.
```

> **架构复盘：** 这个客服系统虽然代码量不大，但完整展示了 Multi-Agent 的核心要素：
> 1. **路由器模式**（RouterAgent）— 集中式任务分发
> 2. **专业化 Agent**（FAQ/Order/Escalation/Feedback）— 职责单一
> 3. **监督与容错**（SupervisorAgent + CircuitBreaker）— 故障自愈
> 4. **优雅降级**（GracefulDegradationManager）— 保底服务
> 5. **事件驱动**（EventStream）— 异步解耦
> 6. **共享状态**（SharedStateManager）— 上下文传递

---



## 9.8 本章小结

本章系统性地介绍了 Multi-Agent 系统的设计与实现。从基础概念到完整实战，我们覆盖了构建生产级 Multi-Agent 系统所需的全部核心知识。

### 核心概念速查表

| 概念 | 类/模式 | 核心职责 | 适用场景 |
|------|---------|---------|---------|
| 编排原语 | `SequentialAgent` | 顺序执行 Agent 管线 | 有依赖的多步任务 |
| 编排原语 | `ParallelAgent` | 并行执行 + 结果合并 | 独立子任务加速 |
| 编排原语 | `LoopAgent` | 迭代优化直到收敛 | 质量渐进提升 |
| 通信机制 | `DirectMessageBus` | 点对点类型化消息 | Agent 间直接协作 |
| 通信机制 | `Blackboard` | 共享读写空间 | 多 Agent 知识共建 |
| 通信机制 | `EventStream` | 发布-订阅事件流 | 松耦合异步通知 |
| 服务发现 | `AgentRegistry` | Agent 注册与发现 | 动态 Agent 管理 |
| 服务发现 | `CapabilityRouter` | 基于能力路由 | 自动任务分发 |
| 状态管理 | `SharedStateManager` | 乐观并发控制 | 共享数据一致性 |
| 状态管理 | `DistributedLock` | 分布式互斥锁 | 临界区保护 |
| 状态管理 | `ConsensusManager` | 投票共识协议 | 多 Agent 集体决策 |
| 状态管理 | `ConflictResolver` | 冲突检测与解决 | 并发写入冲突 |
| 容错机制 | `CircuitBreaker` | 熔断保护 | 防止级联故障 |
| 容错机制 | `SupervisorAgent` | 监督与恢复 | Agent 生命周期管理 |
| 容错机制 | `GracefulDegradation` | 优雅降级 | 部分故障下保底服务 |

### Multi-Agent 架构决策树

在实际项目中选择架构时，可以参照以下决策路径：

```
任务是否可以由单个 Agent 完成？
├── 是 → 使用 Single Agent（不要过度设计）
└── 否 → 任务之间是否存在依赖？
    ├── 是 → 是否为线性依赖（A→B→C）？
    │   ├── 是 → SequentialAgent
    │   └── 否 → 混合编排（Sequential + Parallel）
    └── 否 → 是否需要结果合并？
        ├── 是 → ParallelAgent + 合并策略
        └── 否 → 是否需要迭代优化？
            ├── 是 → LoopAgent + 收敛检测
            └── 否 → 独立 Agent + EventStream

通信方式选择：
├── Agent 数量 ≤ 5，交互频繁 → DirectMessageBus
├── Agent 需要共享知识库 → Blackboard
└── Agent 数量大，松耦合 → EventStream

是否需要动态发现 Agent？
├── 是 → AgentRegistry + CapabilityRouter
└── 否 → 硬编码路由表

容错级别选择：
├── 开发/测试环境 → 基本错误处理即可
├── 生产环境（非关键） → CircuitBreaker + 重试
└── 生产环境（关键业务） → SupervisorAgent + GracefulDegradation
```

### 设计原则回顾

1. **单一职责**：每个 Agent 只做一件事，做到最好。
2. **松耦合**：Agent 之间通过消息通信，避免直接依赖。
3. **故障隔离**：单个 Agent 的失败不应导致整个系统崩溃。
4. **可观测性**：所有 Agent 交互都应该可追踪、可审计。
5. **渐进复杂度**：从简单架构开始，按需演进。

### 从 Single Agent 到 Multi-Agent 的迁移清单

当你考虑将 Single Agent 重构为 Multi-Agent 时，请逐项确认：

- [ ] 已识别出 3 个以上独立的功能模块
- [ ] 至少 2 个模块可以并行执行
- [ ] 模块之间的接口（输入/输出）已明确定义
- [ ] 已选择合适的通信机制（Direct / Blackboard / Event）
- [ ] 已设计错误处理策略（每个 Agent 的故障影响范围）
- [ ] 已考虑状态管理方案（共享 vs 独立）
- [ ] 已建立监控和日志体系
- [ ] 已进行性能基准测试（Multi-Agent 开销 vs Single Agent）
- [ ] 团队具备维护多服务架构的能力

### 常见反模式

| 反模式 | 描述 | 正确做法 |
|--------|------|---------|
| **过度拆分** | 将简单任务拆成 10+ 个 Agent | 遵循"不需要就不拆"原则 |
| **God Router** | 路由器承担过多业务逻辑 | 路由器只做路由，业务逻辑下沉到专业 Agent |
| **共享一切** | 所有 Agent 共享同一个巨大状态对象 | 最小化共享，明确数据所有权 |
| **同步阻塞** | 所有通信都是同步请求-响应 | 区分同步和异步场景，合理使用事件驱动 |
| **忽略容错** | 假设 Agent 永不失败 | 始终设计熔断、重试和降级策略 |
| **消息洪水** | Agent 之间无节制地发送消息 | 设置消息速率限制，使用批处理 |

### 性能考量

```typescript
// Multi-Agent 系统性能监控要点

interface MultiAgentMetrics {
  // 延迟指标
  routingLatency: number;        // 路由决策耗时
  agentExecutionLatency: number; // Agent 执行耗时
  communicationOverhead: number; // 通信开销

  // 吞吐指标
  messagesPerSecond: number;     // 消息吞吐量
  tasksCompletedPerMinute: number; // 任务完成率

  // 可靠性指标
  agentFailureRate: number;      // Agent 故障率
  circuitBreakerTrips: number;   // 熔断触发次数
  degradationEvents: number;     // 降级事件数

  // 资源指标
  activeAgentCount: number;      // 活跃 Agent 数
  pendingMessages: number;       // 待处理消息数
  sharedStateSize: number;       // 共享状态大小
}
```

> **经验法则：**
> - 2-5 个 Agent 的系统，通信开销通常 < 5% 总延迟
> - 5-15 个 Agent 的系统，通信开销可能达到 10-20%
> - 超过 15 个 Agent，必须引入消息队列和异步处理
> - 始终对比 Multi-Agent 与 Single Agent 的端到端延迟

### 下一章预告

在第 10 章中，我们将深入探讨 **Multi-Agent 进阶模式**，包括：

- **Agent-as-a-Service**：将 Agent 部署为独立微服务
- **动态 Agent 编排**：基于 LLM 的运行时编排决策
- **Agent 间学习**：Agent 如何从彼此的经验中学习
- **安全与权限**：Multi-Agent 系统中的认证、授权与审计
- **大规模部署**：从实验到生产的工程化最佳实践

---

*"Multi-Agent 系统的本质不是让更多 Agent 一起工作，而是让正确的 Agent 在正确的时机做正确的事。"*

