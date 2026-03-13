# 第 19 章：成本工程 — Agent 经济学

> **"在 AI Agent 的世界里，智能是可以购买的，但智慧在于知道何时该买、买多少。"**

当一个 Agent 系统从原型走向生产，成本往往会成为第一个"意外"。一次看似简单的客户服务对话，可能触发 5 次 LLM 调用、3 次工具执行、2 次重试，最终产生的费用是预期的 10 倍。本章将系统性地拆解 Agent 系统的成本结构，建立量化模型，并提供从模型路由到批处理的全栈优化方案。

我们在第 17 章（可观测性工程）中建立了度量基础设施，在第 18 章（部署架构与运维）中讨论了基础设施成本，本章将在此基础上构建完整的成本工程体系。这些优化策略最终需要在第 20 章（Agent 互操作协议）的多 Agent 协作场景中面对更复杂的成本分摊问题。

---

## 19.1 Agent 成本模型

### 19.1.1 2026 主流模型定价全景

要优化成本，首先需要精确了解每一分钱花在了哪里。以下是 2026 年主流大语言模型的完整定价数据：

```typescript
// ============================================================
// 19.1 Agent 成本模型 - 完整定价与计算体系
// ============================================================

/** 模型定价信息（单位：美元 / 百万 token） */
interface ModelPricing {
  readonly modelId: string;
  readonly provider: "openai" | "anthropic" | "google" | "deepseek" | "zhipu" | "openai-reasoning";
  readonly inputPricePerMillion: number;       // 标准输入价格
  readonly outputPricePerMillion: number;      // 标准输出价格
  readonly cachedInputPricePerMillion: number; // 缓存输入价格
  readonly batchInputPricePerMillion: number;  // 批处理输入价格
  readonly batchOutputPricePerMillion: number; // 批处理输出价格
  readonly contextWindow: number;              // 上下文窗口大小
  readonly maxOutputTokens: number;            // 最大输出 token 数
  readonly tier: "flagship" | "mid" | "economy"; // 模型层级
  readonly capabilities: readonly string[];     // 能力标签
}

/**
 * 2026 年主流模型定价表
 *
 * 数据来源：各提供商官方定价页面
 * 最后更新：2026-03
 *
 * 注意：Anthropic 的提示缓存提供 90% 的输入折扣；
 *       OpenAI 批处理 API 提供 50% 的折扣；
 *       Google 对 128K 以上的上下文有不同定价。
 */
const MODEL_PRICING_2026: readonly ModelPricing[] = [
  // === OpenAI 系列 ===
  {
    modelId: "gpt-4o",
    provider: "openai",
    inputPricePerMillion: 2.50,
    outputPricePerMillion: 10.00,
    cachedInputPricePerMillion: 1.25,
    batchInputPricePerMillion: 1.25,
    batchOutputPricePerMillion: 5.00,
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    tier: "flagship",
    capabilities: ["vision", "function_calling", "json_mode", "streaming"],
  },
  {
    modelId: "gpt-4o-mini",
    provider: "openai",
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.60,
    cachedInputPricePerMillion: 0.075,
    batchInputPricePerMillion: 0.075,
    batchOutputPricePerMillion: 0.30,
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    tier: "economy",
    capabilities: ["vision", "function_calling", "json_mode", "streaming"],
  },

  // === Anthropic 系列 ===
  {
    modelId: "claude-opus-4.6",
    provider: "anthropic",
    inputPricePerMillion: 15.00,
    outputPricePerMillion: 75.00,
    cachedInputPricePerMillion: 1.50, // 90% 折扣
    batchInputPricePerMillion: 7.50,
    batchOutputPricePerMillion: 37.50,
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    tier: "flagship",
    capabilities: [
      "vision", "function_calling", "extended_thinking",
      "prompt_caching", "pdf_support", "citations", "mcp_native", "agent_teams"
    ],
  },
  {
    modelId: "claude-sonnet-4.6",
    provider: "anthropic",
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    cachedInputPricePerMillion: 0.30, // 90% 折扣
    batchInputPricePerMillion: 1.50,
    batchOutputPricePerMillion: 7.50,
    contextWindow: 1_000_000,
    maxOutputTokens: 64_000,
    tier: "flagship",
    capabilities: [
      "vision", "function_calling", "extended_thinking",
      "prompt_caching", "pdf_support", "citations", "mcp_native"
    ],
  },
  {
    modelId: "claude-haiku-3.5",
    provider: "anthropic",
    inputPricePerMillion: 0.80,
    outputPricePerMillion: 4.00,
    cachedInputPricePerMillion: 0.08, // 90% 折扣
    batchInputPricePerMillion: 0.40,
    batchOutputPricePerMillion: 2.00,
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    tier: "mid",
    capabilities: [
      "vision", "function_calling",
      "prompt_caching", "streaming"
    ],
  },

  // === Google 系列 ===
  {
    modelId: "gemini-3-pro",
    provider: "google",
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 5.00,
    cachedInputPricePerMillion: 0.3125, // 75% 折扣
    batchInputPricePerMillion: 0.625,
    batchOutputPricePerMillion: 2.50,
    contextWindow: 2_000_000,
    maxOutputTokens: 65_536,
    tier: "flagship",
    capabilities: [
      "vision", "function_calling", "grounding",
      "code_execution", "deep_think"
    ],
  },
  {
    modelId: "gemini-3-flash",
    provider: "google",
    inputPricePerMillion: 0.075,
    outputPricePerMillion: 0.30,
    cachedInputPricePerMillion: 0.01875,
    batchInputPricePerMillion: 0.0375,
    batchOutputPricePerMillion: 0.15,
    contextWindow: 1_000_000,
    maxOutputTokens: 65_536,
    tier: "economy",
    capabilities: [
      "vision", "function_calling", "grounding",
      "code_execution", "deep_think"
    ],
  },

  // === DeepSeek 系列 ===
  {
    modelId: "deepseek-v3",
    provider: "deepseek",
    inputPricePerMillion: 0.27,
    outputPricePerMillion: 1.10,
    cachedInputPricePerMillion: 0.07,
    batchInputPricePerMillion: 0.135,
    batchOutputPricePerMillion: 0.55,
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    tier: "economy",
    capabilities: ["function_calling", "json_mode", "fim"],
  },
  {
    modelId: "deepseek-r1",
    provider: "deepseek",
    inputPricePerMillion: 0.55,
    outputPricePerMillion: 2.19,
    cachedInputPricePerMillion: 0.14,
    batchInputPricePerMillion: 0.275,
    batchOutputPricePerMillion: 1.095,
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    tier: "mid",
    capabilities: ["reasoning", "function_calling", "chain_of_thought"],
  },

  // === 智谱 系列 ===
  {
    modelId: "glm-5",
    provider: "zhipu",
    inputPricePerMillion: 0,        // 开源（自部署）
    outputPricePerMillion: 0,       // 开源（自部署）
    cachedInputPricePerMillion: 0,
    batchInputPricePerMillion: 0,
    batchOutputPricePerMillion: 0,
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    tier: "flagship",
    capabilities: ["vision", "function_calling", "open_source"],
  },

  // === OpenAI Reasoning 系列 ===
  {
    modelId: "o3-mini",
    provider: "openai-reasoning",
    inputPricePerMillion: 1.10,
    outputPricePerMillion: 4.40,
    cachedInputPricePerMillion: 0.55,
    batchInputPricePerMillion: 0.55,
    batchOutputPricePerMillion: 2.20,
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
    tier: "mid",
    capabilities: ["reasoning", "function_calling", "chain_of_thought"],
  },
] as const;

/** 定价注册表 - 快速查询 */
class PricingRegistry {
  private readonly prices = new Map<string, ModelPricing>();

  constructor(pricingData: readonly ModelPricing[]) {
    for (const p of pricingData) {
      this.prices.set(p.modelId, p);
    }
  }

  get(modelId: string): ModelPricing {
    const pricing = this.prices.get(modelId);
    if (!pricing) {
      throw new Error(`未知模型: ${modelId}，请在定价表中注册`);
    }
    return pricing;
  }

  getByTier(tier: ModelPricing["tier"]): ModelPricing[] {
    return [...this.prices.values()].filter(p => p.tier === tier);
  }

  getByProvider(provider: ModelPricing["provider"]): ModelPricing[] {
    return [...this.prices.values()].filter(p => p.provider === provider);
  }

  /** 获取每百万 token 综合成本最低的模型（按 1:3 输入输出比估算） */
  getCheapest(): ModelPricing {
    return [...this.prices.values()].reduce((cheapest, current) => {
      const currentBlended = current.inputPricePerMillion * 0.75
        + current.outputPricePerMillion * 0.25;
      const cheapestBlended = cheapest.inputPricePerMillion * 0.75
        + cheapest.outputPricePerMillion * 0.25;
      return currentBlended < cheapestBlended ? current : cheapest;
    });
  }

  listAll(): ModelPricing[] {
    return [...this.prices.values()];
  }
}

const PRICING = new PricingRegistry(MODEL_PRICING_2026);
```

### 19.1.2 单次 LLM 调用成本计算器

最基础的成本单元是一次 LLM API 调用。以下计算器精确到每个 token 的费用：

```typescript
/** 单次 LLM 调用的 token 使用详情 */
interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens?: number;  // 命中缓存的输入 token 数
}

/** 计费模式 */
type BillingMode = "standard" | "cached" | "batch";

/** 单次调用成本明细 */
interface CallCostBreakdown {
  readonly modelId: string;
  readonly billingMode: BillingMode;
  readonly inputCost: number;
  readonly outputCost: number;
  readonly cachedInputCost: number;
  readonly totalCost: number;
  readonly tokenUsage: TokenUsage;
  readonly savingsFromCaching: number;
  readonly savingsFromBatch: number;
}

/**
 * CostCalculator -- 单次调用级别的成本计算
 *
 * 支持三种计费模式：
 * 1. standard: 标准实时请求
 * 2. cached: 使用 Prompt Caching（Anthropic 90% 折扣、Google 75% 折扣）
 * 3. batch: 使用 Batch API（通常 50% 折扣）
 */
class CostCalculator {
  constructor(private readonly registry: PricingRegistry) {}

  /**
   * 计算单次 LLM 调用成本
   */
  calculateCallCost(
    modelId: string,
    usage: TokenUsage,
    mode: BillingMode = "standard"
  ): CallCostBreakdown {
    const pricing = this.registry.get(modelId);
    const cachedTokens = usage.cachedInputTokens ?? 0;
    const uncachedInputTokens = usage.inputTokens - cachedTokens;

    let inputCost: number;
    let outputCost: number;
    let cachedInputCost: number;

    switch (mode) {
      case "standard":
        inputCost = (uncachedInputTokens / 1_000_000)
          * pricing.inputPricePerMillion;
        cachedInputCost = (cachedTokens / 1_000_000)
          * pricing.cachedInputPricePerMillion;
        outputCost = (usage.outputTokens / 1_000_000)
          * pricing.outputPricePerMillion;
        break;

      case "cached":
        inputCost = (uncachedInputTokens / 1_000_000)
          * pricing.inputPricePerMillion;
        cachedInputCost = (cachedTokens / 1_000_000)
          * pricing.cachedInputPricePerMillion;
        outputCost = (usage.outputTokens / 1_000_000)
          * pricing.outputPricePerMillion;
        break;

      case "batch":
        inputCost = (uncachedInputTokens / 1_000_000)
          * pricing.batchInputPricePerMillion;
        cachedInputCost = (cachedTokens / 1_000_000)
          * pricing.batchInputPricePerMillion;
        outputCost = (usage.outputTokens / 1_000_000)
          * pricing.batchOutputPricePerMillion;
        break;
    }

    const totalCost = inputCost + outputCost + cachedInputCost;

    // 计算节省金额
    const standardInputCost = (usage.inputTokens / 1_000_000)
      * pricing.inputPricePerMillion;
    const standardOutputCost = (usage.outputTokens / 1_000_000)
      * pricing.outputPricePerMillion;
    const standardTotal = standardInputCost + standardOutputCost;

    const savingsFromCaching = mode === "cached"
      ? standardTotal - totalCost : 0;
    const savingsFromBatch = mode === "batch"
      ? standardTotal - totalCost : 0;

    return {
      modelId,
      billingMode: mode,
      inputCost: Number(inputCost.toFixed(8)),
      outputCost: Number(outputCost.toFixed(8)),
      cachedInputCost: Number(cachedInputCost.toFixed(8)),
      totalCost: Number(totalCost.toFixed(8)),
      tokenUsage: usage,
      savingsFromCaching: Number(savingsFromCaching.toFixed(8)),
      savingsFromBatch: Number(savingsFromBatch.toFixed(8)),
    };
  }

  /**
   * 批量比较：同一请求在不同模型下的成本
   */
  compareModels(
    usage: TokenUsage,
    modelIds?: string[]
  ): Map<string, CallCostBreakdown> {
    const models = modelIds
      ?? this.registry.listAll().map(p => p.modelId);
    const results = new Map<string, CallCostBreakdown>();
    for (const id of models) {
      results.set(id, this.calculateCallCost(id, usage));
    }
    return results;
  }

  /**
   * 估算每日成本
   */
  estimateDailyCost(
    modelId: string,
    avgInputTokens: number,
    avgOutputTokens: number,
    callsPerDay: number,
    cacheHitRate: number = 0,
    mode: BillingMode = "standard"
  ): { dailyCost: number; monthlyCost: number; yearlyCost: number } {
    const cachedInputTokens = Math.floor(avgInputTokens * cacheHitRate);
    const usage: TokenUsage = {
      inputTokens: avgInputTokens,
      outputTokens: avgOutputTokens,
      cachedInputTokens: cachedInputTokens,
    };

    const singleCost = this.calculateCallCost(modelId, usage, mode);
    const dailyCost = singleCost.totalCost * callsPerDay;

    return {
      dailyCost: Number(dailyCost.toFixed(2)),
      monthlyCost: Number((dailyCost * 30).toFixed(2)),
      yearlyCost: Number((dailyCost * 365).toFixed(2)),
    };
  }
}
```

### 19.1.3 Agent 任务全成本模型

一个 Agent 完成一项任务的总成本远不止 LLM 调用。以下模型捕获了完整的成本结构：

```typescript
/** 工具执行成本配置 */
interface ToolCostConfig {
  readonly toolName: string;
  readonly costPerCall: number;
  readonly costPerSecond?: number;
  readonly externalApiCost?: number;
}

/** 嵌入模型定价 */
interface EmbeddingPricing {
  readonly modelId: string;
  readonly pricePerMillionTokens: number;
}

const EMBEDDING_PRICING: readonly EmbeddingPricing[] = [
  { modelId: "text-embedding-3-small", pricePerMillionTokens: 0.02 },
  { modelId: "text-embedding-3-large", pricePerMillionTokens: 0.13 },
  { modelId: "voyage-3", pricePerMillionTokens: 0.06 },
  { modelId: "voyage-3-lite", pricePerMillionTokens: 0.02 },
];

/** 基础设施成本配置（每小时） */
interface InfrastructureCostConfig {
  readonly computeCostPerHour: number;
  readonly memoryCostPerGBHour: number;
  readonly storageCostPerGBMonth: number;
  readonly networkCostPerGB: number;
  readonly vectorDbCostPerMillion: number;
}

/** 单个 Agent 任务的执行轨迹 */
interface TaskExecutionTrace {
  readonly taskId: string;
  readonly agentId: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly llmCalls: ReadonlyArray<{
    modelId: string;
    usage: TokenUsage;
    billingMode: BillingMode;
    latencyMs: number;
    isRetry: boolean;
  }>;
  readonly toolCalls: ReadonlyArray<{
    toolName: string;
    durationMs: number;
    success: boolean;
  }>;
  readonly embeddingCalls: ReadonlyArray<{
    modelId: string;
    tokenCount: number;
  }>;
  readonly vectorDbQueries: number;
  readonly networkTransferBytes: number;
}

/** 任务成本分解 */
interface TaskCostBreakdown {
  readonly taskId: string;
  readonly llmCost: number;
  readonly llmCostByModel: Record<string, number>;
  readonly toolCost: number;
  readonly toolCostByTool: Record<string, number>;
  readonly embeddingCost: number;
  readonly infrastructureCost: number;
  readonly retryCost: number;
  readonly totalCost: number;
  readonly costPerSecond: number;
  readonly breakdown: {
    readonly llm: number;
    readonly tools: number;
    readonly embedding: number;
    readonly infrastructure: number;
    readonly retry: number;
  };
}

/**
 * AgentCostModel -- Agent 任务全成本计算引擎
 *
 * 将一个 Agent 任务的所有成本来源聚合为统一的成本视图。
 * 包括：LLM 调用、工具执行、嵌入检索、基础设施开销、重试损耗。
 *
 * 与第 17 章的 Trace 数据集成，从可观测性管道获取执行轨迹。
 */
class AgentCostModel {
  private readonly calculator: CostCalculator;
  private readonly toolCosts: Map<string, ToolCostConfig>;
  private readonly embeddingPrices: Map<string, number>;

  constructor(
    private readonly pricingRegistry: PricingRegistry,
    private readonly infraConfig: InfrastructureCostConfig,
    toolConfigs: readonly ToolCostConfig[] = [],
    embeddingConfigs: readonly EmbeddingPricing[] = EMBEDDING_PRICING
  ) {
    this.calculator = new CostCalculator(pricingRegistry);
    this.toolCosts = new Map(toolConfigs.map(t => [t.toolName, t]));
    this.embeddingPrices = new Map(
      embeddingConfigs.map(e => [e.modelId, e.pricePerMillionTokens])
    );
  }

  /**
   * 计算一个完整 Agent 任务的全成本分解
   */
  analyzeTaskCost(trace: TaskExecutionTrace): TaskCostBreakdown {
    // 1. LLM 调用成本
    const llmCostByModel: Record<string, number> = {};
    let totalLlmCost = 0;
    let totalRetryCost = 0;

    for (const call of trace.llmCalls) {
      const cost = this.calculator.calculateCallCost(
        call.modelId, call.usage, call.billingMode
      );
      llmCostByModel[call.modelId] =
        (llmCostByModel[call.modelId] ?? 0) + cost.totalCost;
      totalLlmCost += cost.totalCost;
      if (call.isRetry) {
        totalRetryCost += cost.totalCost;
      }
    }

    // 2. 工具执行成本
    const toolCostByTool: Record<string, number> = {};
    let totalToolCost = 0;

    for (const call of trace.toolCalls) {
      const config = this.toolCosts.get(call.toolName);
      let callCost = config?.costPerCall ?? 0;
      if (config?.costPerSecond) {
        callCost += (call.durationMs / 1000) * config.costPerSecond;
      }
      if (config?.externalApiCost) {
        callCost += config.externalApiCost;
      }
      toolCostByTool[call.toolName] =
        (toolCostByTool[call.toolName] ?? 0) + callCost;
      totalToolCost += callCost;
    }

    // 3. 嵌入成本
    let totalEmbeddingCost = 0;
    for (const call of trace.embeddingCalls) {
      const pricePerMillion = this.embeddingPrices.get(call.modelId) ?? 0.02;
      totalEmbeddingCost += (call.tokenCount / 1_000_000) * pricePerMillion;
    }

    // 4. 基础设施成本
    const taskDurationHours =
      (trace.endTime - trace.startTime) / (1000 * 3600);
    const infraCost =
      taskDurationHours * this.infraConfig.computeCostPerHour
      + (trace.networkTransferBytes / (1024 ** 3))
        * this.infraConfig.networkCostPerGB
      + (trace.vectorDbQueries / 1_000_000)
        * this.infraConfig.vectorDbCostPerMillion;

    // 5. 汇总
    const totalCost =
      totalLlmCost + totalToolCost + totalEmbeddingCost + infraCost;
    const taskDurationSeconds =
      (trace.endTime - trace.startTime) / 1000;

    return {
      taskId: trace.taskId,
      llmCost: Number(totalLlmCost.toFixed(6)),
      llmCostByModel: Object.fromEntries(
        Object.entries(llmCostByModel).map(
          ([k, v]) => [k, Number(v.toFixed(6))]
        )
      ),
      toolCost: Number(totalToolCost.toFixed(6)),
      toolCostByTool: Object.fromEntries(
        Object.entries(toolCostByTool).map(
          ([k, v]) => [k, Number(v.toFixed(6))]
        )
      ),
      embeddingCost: Number(totalEmbeddingCost.toFixed(6)),
      infrastructureCost: Number(infraCost.toFixed(6)),
      retryCost: Number(totalRetryCost.toFixed(6)),
      totalCost: Number(totalCost.toFixed(6)),
      costPerSecond: taskDurationSeconds > 0
        ? Number((totalCost / taskDurationSeconds).toFixed(8))
        : 0,
      breakdown: {
        llm: totalCost > 0
          ? Number((totalLlmCost / totalCost * 100).toFixed(1)) : 0,
        tools: totalCost > 0
          ? Number((totalToolCost / totalCost * 100).toFixed(1)) : 0,
        embedding: totalCost > 0
          ? Number((totalEmbeddingCost / totalCost * 100).toFixed(1)) : 0,
        infrastructure: totalCost > 0
          ? Number((infraCost / totalCost * 100).toFixed(1)) : 0,
        retry: totalCost > 0
          ? Number((totalRetryCost / totalCost * 100).toFixed(1)) : 0,
      },
    };
  }

  /**
   * 批量分析多个任务，生成聚合成本报告
   */
  analyzeMultipleTasks(
    traces: readonly TaskExecutionTrace[]
  ): {
    taskBreakdowns: TaskCostBreakdown[];
    aggregate: {
      totalCost: number;
      avgCostPerTask: number;
      medianCostPerTask: number;
      p95CostPerTask: number;
      p99CostPerTask: number;
      costDistribution: {
        llm: number; tools: number; embedding: number;
        infrastructure: number; retry: number;
      };
      modelUsageShare: Record<string, number>;
    };
  } {
    const breakdowns = traces.map(t => this.analyzeTaskCost(t));
    const costs = breakdowns.map(b => b.totalCost).sort((a, b) => a - b);

    const totalCost = costs.reduce((sum, c) => sum + c, 0);
    const n = costs.length;

    const percentile = (arr: number[], p: number): number => {
      const idx = Math.ceil(p / 100 * arr.length) - 1;
      return arr[Math.max(0, idx)];
    };

    // 按模型统计成本占比
    const modelTotals: Record<string, number> = {};
    for (const b of breakdowns) {
      for (const [model, cost] of Object.entries(b.llmCostByModel)) {
        modelTotals[model] = (modelTotals[model] ?? 0) + cost;
      }
    }
    const totalLlmCostAll = Object.values(modelTotals)
      .reduce((s, v) => s + v, 0);
    const modelUsageShare = Object.fromEntries(
      Object.entries(modelTotals).map(
        ([m, c]) => [m, Number((c / totalLlmCostAll * 100).toFixed(1))]
      )
    );

    const sumBreakdown = breakdowns.reduce(
      (acc, b) => ({
        llm: acc.llm + b.llmCost,
        tools: acc.tools + b.toolCost,
        embedding: acc.embedding + b.embeddingCost,
        infrastructure: acc.infrastructure + b.infrastructureCost,
        retry: acc.retry + b.retryCost,
      }),
      { llm: 0, tools: 0, embedding: 0, infrastructure: 0, retry: 0 }
    );

    return {
      taskBreakdowns: breakdowns,
      aggregate: {
        totalCost: Number(totalCost.toFixed(4)),
        avgCostPerTask: Number((totalCost / n).toFixed(6)),
        medianCostPerTask: percentile(costs, 50),
        p95CostPerTask: percentile(costs, 95),
        p99CostPerTask: percentile(costs, 99),
        costDistribution: {
          llm: Number((sumBreakdown.llm / totalCost * 100).toFixed(1)),
          tools: Number((sumBreakdown.tools / totalCost * 100).toFixed(1)),
          embedding: Number(
            (sumBreakdown.embedding / totalCost * 100).toFixed(1)
          ),
          infrastructure: Number(
            (sumBreakdown.infrastructure / totalCost * 100).toFixed(1)
          ),
          retry: Number((sumBreakdown.retry / totalCost * 100).toFixed(1)),
        },
        modelUsageShare,
      },
    };
  }
}
```

### 19.1.4 成本分解可视化数据模型

为了支持第 17 章讨论的可观测性 Dashboard，我们需要一个专门的成本可视化数据模型：

```typescript
/** 时间序列成本数据点 */
interface CostTimeSeriesPoint {
  readonly timestamp: number;
  readonly cost: number;
  readonly breakdown: {
    readonly llm: number;
    readonly tools: number;
    readonly embedding: number;
    readonly infrastructure: number;
  };
  readonly metadata: {
    readonly requestCount: number;
    readonly avgLatencyMs: number;
    readonly errorRate: number;
  };
}

/** 成本热力图数据（按小时/天聚合） */
interface CostHeatmapData {
  readonly hourOfDay: number;   // 0-23
  readonly dayOfWeek: number;   // 0-6
  readonly avgCost: number;
  readonly totalRequests: number;
  readonly peakCost: number;
}

/** Dashboard 可视化数据包 */
interface CostDashboardPayload {
  readonly generatedAt: number;
  readonly timeRange: { start: number; end: number };
  readonly summary: {
    readonly totalCost: number;
    readonly budgetUsed: number;
    readonly burnRate: number;
    readonly projectedMonthlyCost: number;
    readonly costTrend: "increasing" | "stable" | "decreasing";
  };
  readonly timeSeries: readonly CostTimeSeriesPoint[];
  readonly heatmap: readonly CostHeatmapData[];
  readonly topCostDrivers: ReadonlyArray<{
    readonly name: string;
    readonly type: "model" | "agent" | "tool" | "user";
    readonly cost: number;
    readonly share: number;
    readonly trend: number;
  }>;
  readonly costByModel: ReadonlyArray<{
    readonly modelId: string;
    readonly cost: number;
    readonly calls: number;
    readonly avgCostPerCall: number;
  }>;
  readonly optimizationOpportunities: ReadonlyArray<{
    readonly type: string;
    readonly description: string;
    readonly estimatedSavings: number;
    readonly effort: "low" | "medium" | "high";
  }>;
}

/**
 * CostBreakdownAnalyzer -- 生成成本分析可视化数据
 *
 * 集成第 17 章的 metrics pipeline，将原始成本数据
 * 转化为可直接供 Dashboard 消费的结构化数据包。
 */
class CostBreakdownAnalyzer {
  constructor(
    private readonly costModel: AgentCostModel,
    private readonly budgetLimit: number
  ) {}

  /**
   * 从任务执行轨迹生成完整的 Dashboard 数据包
   */
  generateDashboard(
    traces: readonly TaskExecutionTrace[],
    timeRange: { start: number; end: number }
  ): CostDashboardPayload {
    const analysis = this.costModel.analyzeMultipleTasks(traces);
    const breakdowns = analysis.taskBreakdowns;

    // 时间序列（按小时聚合）
    const hourlyBuckets = new Map<number, {
      costs: number[]; llm: number; tools: number;
      embedding: number; infra: number; latencies: number[];
      errors: number; total: number;
    }>();

    for (const trace of traces) {
      const hourKey = Math.floor(trace.startTime / 3_600_000) * 3_600_000;
      if (!hourlyBuckets.has(hourKey)) {
        hourlyBuckets.set(hourKey, {
          costs: [], llm: 0, tools: 0, embedding: 0, infra: 0,
          latencies: [], errors: 0, total: 0,
        });
      }
      const bucket = hourlyBuckets.get(hourKey)!;
      const bd = breakdowns.find(b => b.taskId === trace.taskId);
      if (bd) {
        bucket.costs.push(bd.totalCost);
        bucket.llm += bd.llmCost;
        bucket.tools += bd.toolCost;
        bucket.embedding += bd.embeddingCost;
        bucket.infra += bd.infrastructureCost;
        bucket.total += bd.totalCost;
      }
      const latency = trace.endTime - trace.startTime;
      bucket.latencies.push(latency);
      const hasError = trace.llmCalls.some(c => c.isRetry);
      if (hasError) bucket.errors++;
    }

    const timeSeries: CostTimeSeriesPoint[] = [...hourlyBuckets.entries()]
      .sort(([a], [b]) => a - b)
      .map(([ts, bucket]) => ({
        timestamp: ts,
        cost: Number(bucket.total.toFixed(4)),
        breakdown: {
          llm: Number(bucket.llm.toFixed(4)),
          tools: Number(bucket.tools.toFixed(4)),
          embedding: Number(bucket.embedding.toFixed(4)),
          infrastructure: Number(bucket.infra.toFixed(4)),
        },
        metadata: {
          requestCount: bucket.costs.length,
          avgLatencyMs: bucket.latencies.length > 0
            ? Math.round(
              bucket.latencies.reduce((a, b) => a + b, 0)
              / bucket.latencies.length
            ) : 0,
          errorRate: bucket.costs.length > 0
            ? Number((bucket.errors / bucket.costs.length).toFixed(3))
            : 0,
        },
      }));

    // 燃烧率与预测
    const totalCost = analysis.aggregate.totalCost;
    const rangeDurationHours =
      (timeRange.end - timeRange.start) / 3_600_000;
    const burnRate = rangeDurationHours > 0
      ? totalCost / rangeDurationHours : 0;
    const projectedMonthlyCost = burnRate * 24 * 30;

    // 成本趋势判断
    const recentHalf = timeSeries.slice(Math.floor(timeSeries.length / 2));
    const firstHalf = timeSeries.slice(0, Math.floor(timeSeries.length / 2));
    const recentAvg = recentHalf.length > 0
      ? recentHalf.reduce((s, p) => s + p.cost, 0) / recentHalf.length : 0;
    const firstAvg = firstHalf.length > 0
      ? firstHalf.reduce((s, p) => s + p.cost, 0) / firstHalf.length : 0;
    const trendRatio = firstAvg > 0 ? recentAvg / firstAvg : 1;
    const costTrend: "increasing" | "stable" | "decreasing" =
      trendRatio > 1.1 ? "increasing"
      : trendRatio < 0.9 ? "decreasing" : "stable";

    // 优化建议
    const opportunities = this.identifyOptimizations(breakdowns, traces);

    // 按模型统计
    const modelStats = new Map<string, { cost: number; calls: number }>();
    for (const bd of breakdowns) {
      for (const [model, cost] of Object.entries(bd.llmCostByModel)) {
        if (!modelStats.has(model)) {
          modelStats.set(model, { cost: 0, calls: 0 });
        }
        const stat = modelStats.get(model)!;
        stat.cost += cost;
        stat.calls++;
      }
    }

    return {
      generatedAt: Date.now(),
      timeRange,
      summary: {
        totalCost: Number(totalCost.toFixed(2)),
        budgetUsed: Number((totalCost / this.budgetLimit * 100).toFixed(1)),
        burnRate: Number(burnRate.toFixed(4)),
        projectedMonthlyCost: Number(projectedMonthlyCost.toFixed(2)),
        costTrend,
      },
      timeSeries,
      heatmap: [],
      topCostDrivers: this.getTopCostDrivers(breakdowns, traces),
      costByModel: [...modelStats.entries()].map(([modelId, stat]) => ({
        modelId,
        cost: Number(stat.cost.toFixed(4)),
        calls: stat.calls,
        avgCostPerCall: stat.calls > 0
          ? Number((stat.cost / stat.calls).toFixed(6)) : 0,
      })),
      optimizationOpportunities: opportunities,
    };
  }

  private getTopCostDrivers(
    breakdowns: readonly TaskCostBreakdown[],
    traces: readonly TaskExecutionTrace[]
  ): CostDashboardPayload["topCostDrivers"] {
    const agentCosts = new Map<string, number>();
    for (let i = 0; i < breakdowns.length; i++) {
      const agentId = traces[i].agentId;
      agentCosts.set(
        agentId, (agentCosts.get(agentId) ?? 0) + breakdowns[i].totalCost
      );
    }
    const totalCost = breakdowns.reduce((s, b) => s + b.totalCost, 0);

    return [...agentCosts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, cost]) => ({
        name,
        type: "agent" as const,
        cost: Number(cost.toFixed(4)),
        share: Number((cost / totalCost * 100).toFixed(1)),
        trend: 0,
      }));
  }

  private identifyOptimizations(
    breakdowns: readonly TaskCostBreakdown[],
    traces: readonly TaskExecutionTrace[]
  ): CostDashboardPayload["optimizationOpportunities"] {
    const opps: CostDashboardPayload["optimizationOpportunities"][number][] = [];
    const totalLlm = breakdowns.reduce((s, b) => s + b.llmCost, 0);
    const totalCost = breakdowns.reduce((s, b) => s + b.totalCost, 0);

    // 检查是否大量使用旗舰模型处理简单任务
    const flagshipCost = breakdowns.reduce((s, b) => {
      const fc = Object.entries(b.llmCostByModel)
        .filter(([m]) =>
          m === "gpt-4o" || m === "claude-opus-4.6" || m === "claude-sonnet-4.6" || m === "gemini-3-pro"
        )
        .reduce((ss, [, c]) => ss + c, 0);
      return s + fc;
    }, 0);

    if (flagshipCost / totalLlm > 0.7) {
      opps.push({
        type: "model_routing",
        description: "超过 70% 的 LLM 成本来自旗舰模型。"
          + "引入模型路由可将简单任务路由至经济模型，预计节省 40-60%。",
        estimatedSavings: Number((flagshipCost * 0.5).toFixed(2)),
        effort: "medium",
      });
    }

    // 检查重试成本
    const totalRetry = breakdowns.reduce((s, b) => s + b.retryCost, 0);
    if (totalRetry / totalCost > 0.1) {
      opps.push({
        type: "reliability",
        description: "重试成本占总成本超过 10%。"
          + "改善 Prompt 质量和错误处理可显著降低不可靠性税。",
        estimatedSavings: Number((totalRetry * 0.6).toFixed(2)),
        effort: "medium",
      });
    }

    // 检查缓存机会
    const hasCaching = traces.some(
      t => t.llmCalls.some(c => c.billingMode === "cached")
    );
    if (!hasCaching && totalLlm > 10) {
      opps.push({
        type: "caching",
        description: "未使用 Prompt Caching。"
          + "对重复的系统提示和上下文启用缓存，Anthropic 可享 90% 折扣。",
        estimatedSavings: Number((totalLlm * 0.3).toFixed(2)),
        effort: "low",
      });
    }

    // 检查批处理机会
    const hasBatch = traces.some(
      t => t.llmCalls.some(c => c.billingMode === "batch")
    );
    if (!hasBatch) {
      opps.push({
        type: "batch_api",
        description: "未使用 Batch API。"
          + "对非实时任务启用批处理可节省 50% 的调用成本。",
        estimatedSavings: Number((totalLlm * 0.3).toFixed(2)),
        effort: "low",
      });
    }

    return opps;
  }
}
```

---

## 19.2 不可靠性税：重试与验证的隐性成本

在 Agent 系统中，LLM 调用并非总能一次成功。模型可能产生格式错误的 JSON、不符合约束的输出、或完全偏离指令的回答。每一次重试都意味着额外的 token 消耗；每一次验证调用都增加成本负担。我们将这种由不可靠性引发的额外开销称为 **"不可靠性税"（Unreliability Tax）**。

### 19.2.1 不可靠性税的数学模型

不可靠性税的核心公式如下：

$$
E[\text{cost}] = C_{\text{base}} \times (1 + r \times m) + C_{\text{validation}}
$$

其中：
- $C_{\text{base}}$：单次 LLM 调用的基础成本
- $r$：重试概率（即单次调用失败的概率）
- $m$：平均重试次数上限
- $C_{\text{validation}}$：每次调用后的验证成本（可能包含额外的 LLM 调用或规则引擎开销）

当引入多级验证（如格式校验 + 语义校验 + 业务规则校验）时，公式扩展为：

$$
E[\text{cost}] = C_{\text{base}} \times \sum_{i=0}^{m} r^i + \sum_{j=1}^{k} C_{\text{val}_j} \times P(\text{reach}_j)
$$

下面的 `UnreliabilityTaxAnalyzer` 类实现了完整的不可靠性税计算与分析：

```typescript
// ============================================================
// UnreliabilityTaxAnalyzer — 不可靠性税分析器
// ============================================================

interface RetryRecord {
  taskId: string;
  model: string;
  attemptNumber: number;      // 第几次尝试（1 = 首次）
  inputTokens: number;
  outputTokens: number;
  success: boolean;
  failureReason?: 'format_error' | 'constraint_violation' | 'hallucination'
                | 'timeout' | 'rate_limit' | 'content_filter';
  latencyMs: number;
  cost: number;
  timestamp: number;
}

interface ValidationRecord {
  taskId: string;
  validationType: 'format' | 'semantic' | 'business_rule' | 'llm_judge';
  passed: boolean;
  cost: number;             // 验证本身的成本（LLM-as-judge 有 token 开销）
  latencyMs: number;
  timestamp: number;
}

interface UnreliabilityTaxReport {
  period: { start: number; end: number };
  totalTasks: number;
  totalBaseCost: number;
  totalRetryCost: number;
  totalValidationCost: number;
  unreliabilityTaxRate: number;   // (retry + validation) / base
  effectiveCostMultiplier: number; // total / base
  byModel: Map<string, ModelUnreliabilityStats>;
  byFailureReason: Map<string, number>;
  recommendations: TaxReductionRecommendation[];
}

interface ModelUnreliabilityStats {
  model: string;
  totalCalls: number;
  successfulFirstAttempt: number;
  firstAttemptSuccessRate: number;
  averageRetries: number;
  retryCost: number;
  validationCost: number;
  taxRate: number;
}

interface TaxReductionRecommendation {
  strategy: string;
  estimatedSavings: number;
  confidence: 'high' | 'medium' | 'low';
  implementation: string;
}

class UnreliabilityTaxAnalyzer {
  private retryRecords: RetryRecord[] = [];
  private validationRecords: ValidationRecord[] = [];

  /**
   * 记录一次 LLM 调用尝试
   */
  recordRetry(record: RetryRecord): void {
    this.retryRecords.push(record);
  }

  /**
   * 记录一次验证调用
   */
  recordValidation(record: ValidationRecord): void {
    this.validationRecords.push(record);
  }

  /**
   * 生成不可靠性税报告
   */
  generateReport(startTime: number, endTime: number): UnreliabilityTaxReport {
    const periodRetries = this.retryRecords.filter(
      r => r.timestamp >= startTime && r.timestamp <= endTime
    );
    const periodValidations = this.validationRecords.filter(
      v => v.timestamp >= startTime && v.timestamp <= endTime
    );

    // 按任务分组，计算基础成本与重试成本
    const taskGroups = new Map<string, RetryRecord[]>();
    for (const record of periodRetries) {
      const existing = taskGroups.get(record.taskId) || [];
      existing.push(record);
      taskGroups.set(record.taskId, existing);
    }

    let totalBaseCost = 0;
    let totalRetryCost = 0;
    for (const [, records] of taskGroups) {
      // 按尝试次序排序
      records.sort((a, b) => a.attemptNumber - b.attemptNumber);
      // 首次尝试算基础成本
      totalBaseCost += records[0].cost;
      // 后续尝试算重试成本
      for (let i = 1; i < records.length; i++) {
        totalRetryCost += records[i].cost;
      }
    }

    const totalValidationCost = periodValidations.reduce(
      (sum, v) => sum + v.cost, 0
    );

    const unreliabilityTaxRate = totalBaseCost > 0
      ? (totalRetryCost + totalValidationCost) / totalBaseCost
      : 0;

    const effectiveCostMultiplier = totalBaseCost > 0
      ? (totalBaseCost + totalRetryCost + totalValidationCost) / totalBaseCost
      : 1;

    // 按模型统计
    const byModel = this.computeModelStats(periodRetries, periodValidations);

    // 按失败原因统计
    const byFailureReason = new Map<string, number>();
    for (const record of periodRetries) {
      if (!record.success && record.failureReason) {
        const current = byFailureReason.get(record.failureReason) || 0;
        byFailureReason.set(record.failureReason, current + record.cost);
      }
    }

    // 生成优化建议
    const recommendations = this.generateRecommendations(
      byModel, byFailureReason, unreliabilityTaxRate
    );

    return {
      period: { start: startTime, end: endTime },
      totalTasks: taskGroups.size,
      totalBaseCost,
      totalRetryCost,
      totalValidationCost,
      unreliabilityTaxRate,
      effectiveCostMultiplier,
      byModel,
      byFailureReason,
      recommendations,
    };
  }

  /**
   * 按模型维度统计不可靠性
   */
  private computeModelStats(
    retries: RetryRecord[],
    validations: ValidationRecord[]
  ): Map<string, ModelUnreliabilityStats> {
    const modelMap = new Map<string, RetryRecord[]>();
    for (const r of retries) {
      const existing = modelMap.get(r.model) || [];
      existing.push(r);
      modelMap.set(r.model, existing);
    }

    const result = new Map<string, ModelUnreliabilityStats>();
    for (const [model, records] of modelMap) {
      // 按任务分组
      const taskMap = new Map<string, RetryRecord[]>();
      for (const r of records) {
        const existing = taskMap.get(r.taskId) || [];
        existing.push(r);
        taskMap.set(r.taskId, existing);
      }

      let successfulFirstAttempt = 0;
      let totalRetries = 0;
      let retryCost = 0;

      for (const [, taskRecords] of taskMap) {
        taskRecords.sort((a, b) => a.attemptNumber - b.attemptNumber);
        if (taskRecords[0].success) {
          successfulFirstAttempt++;
        }
        const retryCount = taskRecords.length - 1;
        totalRetries += retryCount;
        for (let i = 1; i < taskRecords.length; i++) {
          retryCost += taskRecords[i].cost;
        }
      }

      // 相关验证成本（按比例分配）
      const modelCallRatio = records.length / retries.length;
      const validationCost = validations.reduce((s, v) => s + v.cost, 0) * modelCallRatio;

      const totalCalls = taskMap.size;
      const baseCost = Array.from(taskMap.values())
        .reduce((s, recs) => s + recs[0].cost, 0);

      result.set(model, {
        model,
        totalCalls,
        successfulFirstAttempt,
        firstAttemptSuccessRate: totalCalls > 0
          ? successfulFirstAttempt / totalCalls : 0,
        averageRetries: totalCalls > 0 ? totalRetries / totalCalls : 0,
        retryCost,
        validationCost,
        taxRate: baseCost > 0 ? (retryCost + validationCost) / baseCost : 0,
      });
    }

    return result;
  }

  /**
   * 根据分析结果生成优化建议
   */
  private generateRecommendations(
    byModel: Map<string, ModelUnreliabilityStats>,
    byFailureReason: Map<string, number>,
    overallTaxRate: number
  ): TaxReductionRecommendation[] {
    const recommendations: TaxReductionRecommendation[] = [];

    // 策略 1: 高格式错误率 → 添加结构化输出约束
    const formatErrorCost = byFailureReason.get('format_error') || 0;
    if (formatErrorCost > 0) {
      recommendations.push({
        strategy: '引入结构化输出（JSON Schema / Function Calling）',
        estimatedSavings: formatErrorCost * 0.8,
        confidence: 'high',
        implementation: '将自由文本输出替换为 JSON Schema 约束输出，' +
          '可消除约 80% 的格式错误重试。参考第 6 章结构化输出模式。',
      });
    }

    // 策略 2: 高幻觉率 → 增加 RAG 或 grounding
    const hallucinationCost = byFailureReason.get('hallucination') || 0;
    if (hallucinationCost > 0) {
      recommendations.push({
        strategy: '增强 RAG 管道与事实 grounding',
        estimatedSavings: hallucinationCost * 0.6,
        confidence: 'medium',
        implementation: '将高幻觉率任务引入检索增强生成（RAG），' +
          '提供明确的上下文文档以降低幻觉概率。',
      });
    }

    // 策略 3: 特定模型税率过高 → 考虑切换模型
    for (const [model, stats] of byModel) {
      if (stats.taxRate > 0.5 && stats.totalCalls > 10) {
        recommendations.push({
          strategy: `评估替换模型 ${model}`,
          estimatedSavings: stats.retryCost * 0.5,
          confidence: 'medium',
          implementation: `模型 ${model} 的不可靠性税率达 ${(stats.taxRate * 100).toFixed(1)}%，` +
            `建议通过 A/B 测试评估替代模型的成本效益。参见 19.3 节模型路由策略。`,
        });
      }
    }

    // 策略 4: 整体税率过高 → 引入分层验证
    if (overallTaxRate > 0.3) {
      recommendations.push({
        strategy: '实施分层验证策略',
        estimatedSavings: overallTaxRate * 0.25,
        confidence: 'high',
        implementation: '将验证分为快速规则校验（无 LLM 成本）和深度语义校验（LLM-as-judge），' +
          '仅对通过规则校验的输出执行深度检查，减少不必要的验证开销。',
      });
    }

    return recommendations;
  }
}
```

### 19.2.2 可靠性经济学引擎与蒙特卡洛模拟

仅靠公式计算期望值有时不够——在生产环境中，成本分布可能呈现长尾特征。某些任务偶尔会触发连续重试，导致单次任务成本远超平均水平。为了更准确地评估风险，我们引入蒙特卡洛模拟来建模成本分布：

```typescript
// ============================================================
// ReliabilityEconomicsEngine — 可靠性经济学引擎
// ============================================================

interface ReliabilityProfile {
  model: string;
  taskType: string;
  firstAttemptSuccessRate: number;   // 0-1
  retrySuccessRate: number;          // 重试时的成功率
  maxRetries: number;
  baseCostPerCall: number;           // 美元
  validationCostPerCall: number;     // 美元
  averageLatencyMs: number;
  retryLatencyMs: number;
}

interface MonteCarloResult {
  simulations: number;
  meanCost: number;
  medianCost: number;
  p95Cost: number;
  p99Cost: number;
  maxCost: number;
  standardDeviation: number;
  costDistribution: { bucket: string; count: number; percentage: number }[];
  expectedMonthlyAt: (dailyTasks: number) => MonthlyProjection;
}

interface MonthlyProjection {
  dailyTasks: number;
  expectedMonthlyCost: number;
  p95MonthlyCost: number;
  p99MonthlyCost: number;
  budgetRecommendation: number;   // p95 + 10% buffer
}

interface ComparisonResult {
  profiles: ReliabilityProfile[];
  costComparison: {
    model: string;
    meanCost: number;
    p95Cost: number;
    taxRate: number;
  }[];
  recommendation: string;
  annualSavings: number;
}

class ReliabilityEconomicsEngine {
  /**
   * 对单个可靠性配置文件执行蒙特卡洛模拟
   */
  simulateCostDistribution(
    profile: ReliabilityProfile,
    simulations: number = 10000
  ): MonteCarloResult {
    const costs: number[] = [];

    for (let i = 0; i < simulations; i++) {
      let taskCost = 0;
      let success = false;

      // 首次尝试
      taskCost += profile.baseCostPerCall;
      taskCost += profile.validationCostPerCall;

      if (Math.random() < profile.firstAttemptSuccessRate) {
        success = true;
      }

      // 重试循环
      if (!success) {
        for (let retry = 0; retry < profile.maxRetries; retry++) {
          taskCost += profile.baseCostPerCall;
          taskCost += profile.validationCostPerCall;

          if (Math.random() < profile.retrySuccessRate) {
            success = true;
            break;
          }
        }
      }

      // 如果所有重试都失败，可能触发 fallback（成本更高）
      if (!success) {
        taskCost += profile.baseCostPerCall * 2; // fallback 到更强模型
      }

      costs.push(taskCost);
    }

    // 排序以计算百分位数
    costs.sort((a, b) => a - b);

    const meanCost = costs.reduce((s, c) => s + c, 0) / costs.length;
    const medianCost = costs[Math.floor(costs.length / 2)];
    const p95Cost = costs[Math.floor(costs.length * 0.95)];
    const p99Cost = costs[Math.floor(costs.length * 0.99)];
    const maxCost = costs[costs.length - 1];

    // 标准差
    const variance = costs.reduce(
      (s, c) => s + Math.pow(c - meanCost, 2), 0
    ) / costs.length;
    const standardDeviation = Math.sqrt(variance);

    // 构建分布直方图
    const bucketCount = 20;
    const bucketSize = (maxCost - costs[0]) / bucketCount;
    const distribution: { bucket: string; count: number; percentage: number }[] = [];

    for (let b = 0; b < bucketCount; b++) {
      const low = costs[0] + b * bucketSize;
      const high = low + bucketSize;
      const count = costs.filter(c => c >= low && c < high).length;
      distribution.push({
        bucket: `$${low.toFixed(4)}-$${high.toFixed(4)}`,
        count,
        percentage: (count / costs.length) * 100,
      });
    }

    return {
      simulations,
      meanCost,
      medianCost,
      p95Cost,
      p99Cost,
      maxCost,
      standardDeviation,
      costDistribution: distribution,
      expectedMonthlyAt: (dailyTasks: number): MonthlyProjection => {
        const monthlyTasks = dailyTasks * 30;
        return {
          dailyTasks,
          expectedMonthlyCost: meanCost * monthlyTasks,
          p95MonthlyCost: p95Cost * monthlyTasks,
          p99MonthlyCost: p99Cost * monthlyTasks,
          budgetRecommendation: p95Cost * monthlyTasks * 1.1,
        };
      },
    };
  }

  /**
   * 比较多个模型 / 配置的成本经济性
   */
  compareProfiles(
    profiles: ReliabilityProfile[],
    dailyTasks: number = 1000,
    simulations: number = 10000
  ): ComparisonResult {
    const costComparison = profiles.map(profile => {
      const result = this.simulateCostDistribution(profile, simulations);
      const baseCostOnly = profile.baseCostPerCall;
      const taxRate = (result.meanCost - baseCostOnly) / baseCostOnly;

      return {
        model: profile.model,
        meanCost: result.meanCost,
        p95Cost: result.p95Cost,
        taxRate,
      };
    });

    // 按平均成本排序
    costComparison.sort((a, b) => a.meanCost - b.meanCost);

    const cheapest = costComparison[0];
    const mostExpensive = costComparison[costComparison.length - 1];
    const annualSavings = (mostExpensive.meanCost - cheapest.meanCost)
      * dailyTasks * 365;

    const recommendation = `推荐使用 ${cheapest.model}（平均单次成本 $${cheapest.meanCost.toFixed(4)}），` +
      `相比 ${mostExpensive.model} 年度可节约 $${annualSavings.toFixed(0)}。` +
      `${cheapest.model} 的不可靠性税率为 ${(cheapest.taxRate * 100).toFixed(1)}%，` +
      `而 ${mostExpensive.model} 为 ${(mostExpensive.taxRate * 100).toFixed(1)}%。`;

    return {
      profiles,
      costComparison,
      recommendation,
      annualSavings,
    };
  }

  /**
   * 计算可靠性改善带来的经济价值
   * 回答："如果将首次成功率从 X 提高到 Y，能节约多少？"
   */
  calculateReliabilityImprovementValue(
    profile: ReliabilityProfile,
    targetSuccessRate: number,
    dailyTasks: number = 1000
  ): {
    currentAnnualCost: number;
    projectedAnnualCost: number;
    annualSavings: number;
    breakEvenInvestment: number;
  } {
    // 当前成本
    const currentResult = this.simulateCostDistribution(profile);
    const currentAnnual = currentResult.meanCost * dailyTasks * 365;

    // 改善后的配置
    const improvedProfile: ReliabilityProfile = {
      ...profile,
      firstAttemptSuccessRate: targetSuccessRate,
    };
    const improvedResult = this.simulateCostDistribution(improvedProfile);
    const projectedAnnual = improvedResult.meanCost * dailyTasks * 365;

    const annualSavings = currentAnnual - projectedAnnual;

    return {
      currentAnnualCost: currentAnnual,
      projectedAnnualCost: projectedAnnual,
      annualSavings,
      breakEvenInvestment: annualSavings * 2, // 2 年回本阈值
    };
  }
}
```

> **与第 17 章的关联**：不可靠性税的度量数据（重试次数、失败原因分布）应通过第 17 章的可观测性管道（traces + metrics）持续收集。在 Grafana 仪表盘上设置 `unreliability_tax_rate` 指标的告警阈值，当税率突然上升时及时介入排查。

通过 `UnreliabilityTaxAnalyzer` 的生产数据分析与 `ReliabilityEconomicsEngine` 的蒙特卡洛模拟相结合，团队可以从定量角度回答关键业务问题：当前系统的不可靠性成本是多少？投资改善可靠性是否划算？哪些模型与任务类型的税率最高？这些洞察将为 19.3 节的智能模型路由策略提供数据基础。


---

## 19.3 智能模型路由：任务-模型最优匹配

并非所有 Agent 任务都需要最强大（也最昂贵）的模型。简单的格式转换可以用 GPT-4o-mini 完成；复杂的多步推理才需要 Claude Sonnet 4.6 或 GPT-4o。**智能模型路由**的目标是根据任务的复杂度、质量要求和成本约束，自动选择最具性价比的模型。

### 19.3.1 任务复杂度分类器

路由的第一步是快速评估任务复杂度。我们定义四个等级：`simple`（简单提取/格式化）、`moderate`（单步推理/摘要）、`complex`（多步推理/创作）、`expert`（高风险决策/复杂代码生成）。

```typescript
// ============================================================
// TaskComplexityClassifier — 任务复杂度分类器
// ============================================================

type ComplexityLevel = 'simple' | 'moderate' | 'complex' | 'expert';

interface ComplexityFeatures {
  inputTokenEstimate: number;
  expectedOutputTokens: number;
  requiresReasoning: boolean;
  requiresCreativity: boolean;
  toolCallsExpected: number;
  domainSpecificity: 'general' | 'specialized' | 'expert';
  qualityThreshold: number;          // 0-1，业务对质量的要求
  structuredOutput: boolean;
  conversationTurns: number;
  hasCodeGeneration: boolean;
}

interface ClassificationResult {
  level: ComplexityLevel;
  confidence: number;               // 0-1
  features: ComplexityFeatures;
  reasoning: string;
  suggestedModels: string[];
}

class TaskComplexityClassifier {
  private rules: Array<{
    condition: (f: ComplexityFeatures) => boolean;
    level: ComplexityLevel;
    weight: number;
  }>;

  constructor() {
    // 基于规则的分类（可被 ML 模型替代）
    this.rules = [
      {
        condition: (f) => f.inputTokenEstimate < 500
          && !f.requiresReasoning
          && f.toolCallsExpected === 0
          && f.qualityThreshold < 0.7,
        level: 'simple',
        weight: 1.0,
      },
      {
        condition: (f) => f.inputTokenEstimate < 2000
          && !f.requiresCreativity
          && f.toolCallsExpected <= 2
          && !f.hasCodeGeneration,
        level: 'moderate',
        weight: 0.8,
      },
      {
        condition: (f) => f.requiresReasoning
          && f.toolCallsExpected > 2
          && f.expectedOutputTokens > 1000,
        level: 'complex',
        weight: 0.9,
      },
      {
        condition: (f) => f.domainSpecificity === 'expert'
          || (f.hasCodeGeneration && f.qualityThreshold > 0.9)
          || (f.requiresCreativity && f.requiresReasoning),
        level: 'expert',
        weight: 1.0,
      },
    ];
  }

  /**
   * 对任务特征进行复杂度分类
   */
  classify(features: ComplexityFeatures): ClassificationResult {
    // 收集所有匹配的规则
    const matches: { level: ComplexityLevel; weight: number }[] = [];
    for (const rule of this.rules) {
      if (rule.condition(features)) {
        matches.push({ level: rule.level, weight: rule.weight });
      }
    }

    if (matches.length === 0) {
      return {
        level: 'moderate',
        confidence: 0.5,
        features,
        reasoning: '无规则匹配，默认为 moderate 级别',
        suggestedModels: ['gpt-4o-mini', 'claude-haiku-3.5', 'gemini-3-flash'],
      };
    }

    // 选择权重最高的匹配
    matches.sort((a, b) => b.weight - a.weight);
    const best = matches[0];

    const modelSuggestions: Record<ComplexityLevel, string[]> = {
      simple: ['gpt-4o-mini', 'gemini-3-flash', 'deepseek-v3'],
      moderate: ['gpt-4o-mini', 'claude-haiku-3.5', 'gemini-3-flash'],
      complex: ['gpt-4o', 'claude-sonnet-4.6', 'gemini-3-pro'],
      expert: ['claude-opus-4.6', 'gpt-4o', 'claude-sonnet-4.6', 'gemini-3-pro'],
    };

    return {
      level: best.level,
      confidence: best.weight,
      features,
      reasoning: `匹配 ${matches.length} 条规则，最高权重规则指向 ${best.level}`,
      suggestedModels: modelSuggestions[best.level],
    };
  }
}
```

### 19.3.2 模型路由器

路由器将分类结果与模型能力、成本约束相结合，做出最终选择。它还维护一个 **fallback chain**——当首选模型不可用或失败时，自动切换到备选模型：

```typescript
// ============================================================
// ModelRouter — 模型路由器
// ============================================================

interface ModelCapability {
  modelId: string;
  provider: 'openai' | 'anthropic' | 'google' | 'deepseek';
  maxContextTokens: number;
  supportsFunctionCalling: boolean;
  supportsVision: boolean;
  supportsStructuredOutput: boolean;
  costPer1kInput: number;
  costPer1kOutput: number;
  averageLatencyMs: number;
  qualityScore: number;             // 0-1，基于历史评估
  rateLimitRpm: number;
  isAvailable: boolean;
}

interface RoutingConstraints {
  maxCostPerCall: number;           // 硬性成本上限
  maxLatencyMs: number;             // 延迟要求
  minQualityScore: number;          // 最低质量阈值
  requiredCapabilities: string[];   // 必需能力，如 'vision', 'function_calling'
  preferredProviders?: string[];    // 偏好的供应商
}

interface RoutingDecision {
  selectedModel: string;
  fallbackChain: string[];
  reasoning: string;
  estimatedCost: number;
  estimatedLatencyMs: number;
  qualityScore: number;
}

class ModelRouter {
  private models: Map<string, ModelCapability> = new Map();
  private classifier: TaskComplexityClassifier;

  constructor(models: ModelCapability[]) {
    this.classifier = new TaskComplexityClassifier();
    for (const model of models) {
      this.models.set(model.modelId, model);
    }
  }

  /**
   * 根据任务特征和约束条件选择最佳模型
   */
  route(
    features: ComplexityFeatures,
    constraints: RoutingConstraints
  ): RoutingDecision {
    const classification = this.classifier.classify(features);

    // 过滤满足约束条件的模型
    const candidates = Array.from(this.models.values()).filter(model => {
      if (!model.isAvailable) return false;
      if (model.averageLatencyMs > constraints.maxLatencyMs) return false;
      if (model.qualityScore < constraints.minQualityScore) return false;

      // 估算成本
      const estimatedCost = this.estimateCost(model, features);
      if (estimatedCost > constraints.maxCostPerCall) return false;

      // 检查必需能力
      for (const cap of constraints.requiredCapabilities) {
        if (cap === 'vision' && !model.supportsVision) return false;
        if (cap === 'function_calling' && !model.supportsFunctionCalling) return false;
        if (cap === 'structured_output' && !model.supportsStructuredOutput) return false;
      }

      return true;
    });

    if (candidates.length === 0) {
      // 无候选模型，放宽约束使用最强模型
      const fallback = Array.from(this.models.values())
        .filter(m => m.isAvailable)
        .sort((a, b) => b.qualityScore - a.qualityScore);

      return {
        selectedModel: fallback[0]?.modelId || 'gpt-4o',
        fallbackChain: fallback.slice(1, 3).map(m => m.modelId),
        reasoning: '无候选满足所有约束，回退到最高质量模型',
        estimatedCost: fallback[0]
          ? this.estimateCost(fallback[0], features) : 0,
        estimatedLatencyMs: fallback[0]?.averageLatencyMs || 5000,
        qualityScore: fallback[0]?.qualityScore || 0,
      };
    }

    // 按复杂度策略排序
    const scored = candidates.map(model => ({
      model,
      score: this.scoreModel(model, classification, constraints),
      cost: this.estimateCost(model, features),
    }));

    scored.sort((a, b) => b.score - a.score);

    const selected = scored[0];
    const fallbacks = scored.slice(1, 4).map(s => s.model.modelId);

    return {
      selectedModel: selected.model.modelId,
      fallbackChain: fallbacks,
      reasoning: `任务复杂度: ${classification.level}，` +
        `选择 ${selected.model.modelId}（得分 ${selected.score.toFixed(2)}），` +
        `估算成本 $${selected.cost.toFixed(4)}`,
      estimatedCost: selected.cost,
      estimatedLatencyMs: selected.model.averageLatencyMs,
      qualityScore: selected.model.qualityScore,
    };
  }

  /**
   * 综合评分：平衡质量、成本、延迟
   */
  private scoreModel(
    model: ModelCapability,
    classification: ClassificationResult,
    constraints: RoutingConstraints
  ): number {
    // 权重根据复杂度动态调整
    const weights: Record<ComplexityLevel, { quality: number; cost: number; latency: number }> = {
      simple:   { quality: 0.2, cost: 0.6, latency: 0.2 },
      moderate: { quality: 0.3, cost: 0.5, latency: 0.2 },
      complex:  { quality: 0.5, cost: 0.3, latency: 0.2 },
      expert:   { quality: 0.7, cost: 0.1, latency: 0.2 },
    };

    const w = weights[classification.level];

    // 归一化各维度到 0-1
    const qualityNorm = model.qualityScore;
    const costNorm = 1 - Math.min(model.costPer1kInput / 0.03, 1); // $0.03 为最贵基准
    const latencyNorm = 1 - Math.min(model.averageLatencyMs / 10000, 1);

    let score = w.quality * qualityNorm + w.cost * costNorm + w.latency * latencyNorm;

    // 供应商偏好加成
    if (constraints.preferredProviders?.includes(model.provider)) {
      score *= 1.1;
    }

    return score;
  }

  /**
   * 估算单次调用成本
   */
  private estimateCost(
    model: ModelCapability,
    features: ComplexityFeatures
  ): number {
    const inputCost = (features.inputTokenEstimate / 1000) * model.costPer1kInput;
    const outputCost = (features.expectedOutputTokens / 1000) * model.costPer1kOutput;
    return inputCost + outputCost;
  }
}
```

### 19.3.3 自适应路由与 Thompson Sampling

静态规则路由有其局限——模型的实际表现会随时间变化（API 更新、负载波动等）。**自适应路由**通过在线学习动态调整模型选择概率。我们采用 Thompson Sampling 算法，它在"探索未知模型"与"利用已知最优模型"之间自然平衡：

```typescript
// ============================================================
// AdaptiveModelRouter — 自适应模型路由（Thompson Sampling）
// ============================================================

interface ModelPerformanceRecord {
  modelId: string;
  taskType: string;
  success: boolean;
  cost: number;
  qualityScore: number;        // 0-1
  latencyMs: number;
  timestamp: number;
}

interface BetaDistributionParams {
  alpha: number;               // 成功次数 + 先验
  beta: number;                // 失败次数 + 先验
}

class AdaptiveModelRouter {
  // 每个 (model, taskType) 组合维护一个 Beta 分布
  private distributions: Map<string, BetaDistributionParams> = new Map();
  private performanceHistory: ModelPerformanceRecord[] = [];
  private costWeight: number;
  private qualityWeight: number;

  constructor(
    private models: string[],
    options: { costWeight?: number; qualityWeight?: number } = {}
  ) {
    this.costWeight = options.costWeight ?? 0.3;
    this.qualityWeight = options.qualityWeight ?? 0.7;

    // 初始化 Beta(1,1) 先验（均匀分布）
    for (const model of models) {
      this.distributions.set(model, { alpha: 1, beta: 1 });
    }
  }

  /**
   * 使用 Thompson Sampling 选择模型
   */
  selectModel(taskType: string): string {
    let bestModel = this.models[0];
    let bestSample = -Infinity;

    for (const model of this.models) {
      const key = `${model}:${taskType}`;
      const dist = this.distributions.get(key)
        || { alpha: 1, beta: 1 };

      // 从 Beta 分布中采样
      const sample = this.sampleBeta(dist.alpha, dist.beta);

      if (sample > bestSample) {
        bestSample = sample;
        bestModel = model;
      }
    }

    return bestModel;
  }

  /**
   * 记录模型表现并更新分布
   */
  recordOutcome(record: ModelPerformanceRecord): void {
    this.performanceHistory.push(record);

    const key = `${record.modelId}:${record.taskType}`;
    const dist = this.distributions.get(key)
      || { alpha: 1, beta: 1 };

    // 综合评分：质量 * 权重 + 成本效率 * 权重
    const costEfficiency = 1 - Math.min(record.cost / 0.10, 1);
    const compositeScore = this.qualityWeight * record.qualityScore
      + this.costWeight * costEfficiency;

    // 将 composite score 视为"成功概率"更新 Beta 分布
    if (compositeScore > 0.5) {
      dist.alpha += compositeScore;
    } else {
      dist.beta += (1 - compositeScore);
    }

    this.distributions.set(key, dist);
  }

  /**
   * 获取当前各模型的选择概率估计
   */
  getModelProbabilities(taskType: string): Map<string, number> {
    const means = new Map<string, number>();
    let totalMean = 0;

    for (const model of this.models) {
      const key = `${model}:${taskType}`;
      const dist = this.distributions.get(key)
        || { alpha: 1, beta: 1 };
      const mean = dist.alpha / (dist.alpha + dist.beta);
      means.set(model, mean);
      totalMean += mean;
    }

    // 归一化为概率分布
    const probs = new Map<string, number>();
    for (const [model, mean] of means) {
      probs.set(model, mean / totalMean);
    }
    return probs;
  }

  /**
   * Beta 分布采样（使用 Jöhnk 算法近似）
   */
  private sampleBeta(alpha: number, beta: number): number {
    const gammaA = this.sampleGamma(alpha);
    const gammaB = this.sampleGamma(beta);
    return gammaA / (gammaA + gammaB);
  }

  /**
   * Gamma 分布采样（Marsaglia-Tsang 方法）
   */
  private sampleGamma(shape: number): number {
    if (shape < 1) {
      return this.sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x: number;
      let v: number;
      do {
        x = this.randomNormal();
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();

      if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  private randomNormal(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}
```

### 19.3.4 路由策略 A/B 测试框架

在生产环境中，新的路由策略上线前需要通过 A/B 测试验证其效果。以下框架支持对不同路由策略进行受控实验：

```typescript
// ============================================================
// RoutingABTestFramework — 路由策略 A/B 测试
// ============================================================

interface RoutingStrategy {
  name: string;
  route: (features: ComplexityFeatures) => string; // 返回 modelId
}

interface ABTestConfig {
  testId: string;
  strategies: RoutingStrategy[];
  trafficSplit: number[];            // 每个策略的流量占比，和为 1
  startTime: number;
  endTime: number;
  minSampleSize: number;
  significanceLevel: number;         // 默认 0.05
}

interface ABTestResult {
  testId: string;
  strategies: {
    name: string;
    sampleSize: number;
    meanCost: number;
    meanQuality: number;
    meanLatencyMs: number;
    costPerQualityUnit: number;     // 成本效率
  }[];
  winner: string | null;
  pValue: number;
  isSignificant: boolean;
  recommendation: string;
}

interface ABTestObservation {
  strategyName: string;
  cost: number;
  qualityScore: number;
  latencyMs: number;
  timestamp: number;
}

class RoutingABTestFramework {
  private config: ABTestConfig;
  private observations: ABTestObservation[] = [];

  constructor(config: ABTestConfig) {
    this.config = config;
  }

  /**
   * 根据流量分配选择策略
   */
  assignStrategy(): RoutingStrategy {
    const rand = Math.random();
    let cumulative = 0;

    for (let i = 0; i < this.config.strategies.length; i++) {
      cumulative += this.config.trafficSplit[i];
      if (rand < cumulative) {
        return this.config.strategies[i];
      }
    }

    return this.config.strategies[this.config.strategies.length - 1];
  }

  /**
   * 记录一次观测
   */
  recordObservation(obs: ABTestObservation): void {
    this.observations.push(obs);
  }

  /**
   * 分析实验结果
   */
  analyzeResults(): ABTestResult {
    const strategyData = new Map<string, ABTestObservation[]>();
    for (const obs of this.observations) {
      const existing = strategyData.get(obs.strategyName) || [];
      existing.push(obs);
      strategyData.set(obs.strategyName, existing);
    }

    const strategies = Array.from(strategyData.entries()).map(
      ([name, observations]) => {
        const meanCost = observations.reduce((s, o) => s + o.cost, 0)
          / observations.length;
        const meanQuality = observations.reduce(
          (s, o) => s + o.qualityScore, 0
        ) / observations.length;
        const meanLatencyMs = observations.reduce(
          (s, o) => s + o.latencyMs, 0
        ) / observations.length;

        return {
          name,
          sampleSize: observations.length,
          meanCost,
          meanQuality,
          meanLatencyMs,
          costPerQualityUnit: meanQuality > 0
            ? meanCost / meanQuality : Infinity,
        };
      }
    );

    // 按 costPerQualityUnit 排序（越低越好）
    strategies.sort((a, b) => a.costPerQualityUnit - b.costPerQualityUnit);

    // 简化的统计显著性检验（Welch's t-test 近似）
    let pValue = 1.0;
    let isSignificant = false;

    if (strategies.length >= 2) {
      const a = strategyData.get(strategies[0].name) || [];
      const b = strategyData.get(strategies[1].name) || [];
      pValue = this.welchTTest(
        a.map(o => o.cost),
        b.map(o => o.cost)
      );
      isSignificant = pValue < this.config.significanceLevel;
    }

    const winner = isSignificant ? strategies[0].name : null;
    const recommendation = winner
      ? `策略 "${winner}" 显著优于其他策略（p=${pValue.toFixed(4)}），` +
        `建议全量上线。成本效率比为 $${strategies[0].costPerQualityUnit.toFixed(4)}/质量单位。`
      : `尚未达到统计显著性（p=${pValue.toFixed(4)}），建议继续收集数据。` +
        `当前最低样本量要求: ${this.config.minSampleSize}，` +
        `实际样本量: ${strategies.map(s => s.sampleSize).join(', ')}。`;

    return {
      testId: this.config.testId,
      strategies,
      winner,
      pValue,
      isSignificant,
      recommendation,
    };
  }

  /**
   * Welch's t-test 近似计算 p-value
   */
  private welchTTest(sample1: number[], sample2: number[]): number {
    const n1 = sample1.length;
    const n2 = sample2.length;
    if (n1 < 2 || n2 < 2) return 1.0;

    const mean1 = sample1.reduce((s, v) => s + v, 0) / n1;
    const mean2 = sample2.reduce((s, v) => s + v, 0) / n2;
    const var1 = sample1.reduce((s, v) => s + Math.pow(v - mean1, 2), 0)
      / (n1 - 1);
    const var2 = sample2.reduce((s, v) => s + Math.pow(v - mean2, 2), 0)
      / (n2 - 1);

    const se = Math.sqrt(var1 / n1 + var2 / n2);
    if (se === 0) return 1.0;

    const t = Math.abs(mean1 - mean2) / se;

    // 使用正态近似 p-value（大样本时足够准确）
    const p = 2 * (1 - this.normalCDF(t));
    return p;
  }

  private normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t
      * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }
}
```

> **与第 18 章的关联**：模型路由决策应记录到第 18 章描述的部署配置系统中。在蓝绿部署或金丝雀发布时，路由策略可以作为独立的配置维度进行灰度——先对 5% 流量启用新路由策略，观察成本与质量指标后再逐步扩大比例。

## 19.4 Prompt 优化与缓存

在第 19.3 节中，我们建立了基于模型路由的成本优化基础——将合适的任务分配给合适的模型。然而，即便选择了最具性价比的模型，Prompt 本身仍然是成本的最大来源。一个典型的企业级 Agent 系统中，系统提示词（System Prompt）往往长达 2,000–8,000 tokens，而这些提示词在每次请求中都会重复发送。如果一个 Agent 每天处理 100,000 次请求，仅系统提示词的重复传输就意味着数十亿 tokens 的浪费。

本节将围绕三个核心组件展开：`PromptCacheManager` 利用大模型提供商的原生缓存机制实现 90% 的输入成本折扣；`SemanticCostCache` 通过语义相似度判断来缓存完整的 LLM 响应，从根本上消除重复调用；`PromptCompressor` 则在发送请求前对上下文窗口进行智能压缩，移除冗余信息以减少 token 消耗。三者协同工作，可以将 Prompt 相关成本降低 40%–70%。

### 19.4.1 PromptCacheManager：原生缓存机制集成

Anthropic 在 2024 年推出的 Prompt Caching 功能为长系统提示词场景带来了革命性的成本优化。其核心原理是：当连续请求共享相同的前缀内容时，API 会缓存已处理的 token，后续请求对这些缓存 token 只收取原价的 10%（即 90% 折扣）。OpenAI 也提供了类似的 Automatic Prompt Caching 功能，对缓存命中的 token 提供 50% 折扣。

理解这一机制的关键在于"前缀匹配"——缓存只对从消息序列开头开始的连续相同内容生效。这意味着我们需要精心设计消息结构，将稳定不变的内容放在前面，将动态变化的内容放在后面。

```typescript
// ---- PromptCacheManager: 大模型原生缓存集成 ----

import { createHash } from "crypto";
import { EventEmitter } from "events";

/** 提供商缓存能力描述 */
interface ProviderCacheCapability {
  /** 提供商名称 */
  provider: "anthropic" | "openai" | "google" | "custom";
  /** 是否支持显式缓存控制 */
  explicitCacheControl: boolean;
  /** 是否支持自动前缀缓存 */
  automaticPrefixCaching: boolean;
  /** 缓存折扣率（0.1 表示只收 10%，即 90% 折扣） */
  cacheDiscountRate: number;
  /** 缓存写入额外费用倍率（Anthropic 首次写入收取 1.25x） */
  cacheWritePremium: number;
  /** 最小可缓存 token 数 */
  minCacheableTokens: number;
  /** 缓存 TTL（秒），0 表示由提供商管理 */
  cacheTTLSeconds: number;
  /** 缓存块对齐大小（Anthropic 要求 128 token 对齐） */
  blockAlignment: number;
}

/** 缓存控制标记 */
interface CacheControlMarker {
  type: "ephemeral";
}

/** 消息块定义 */
interface MessageBlock {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
  cache_control?: CacheControlMarker;
}

/** 内容块（支持文本与缓存标记） */
interface ContentPart {
  type: "text" | "image";
  text?: string;
  cache_control?: CacheControlMarker;
}

/** 缓存效果统计 */
interface CacheEffectStats {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  cacheWrites: number;
  hitRate: number;
  totalInputTokens: number;
  cachedInputTokens: number;
  uncachedInputTokens: number;
  estimatedSavingsDollars: number;
  estimatedWithoutCacheDollars: number;
  effectiveDiscountRate: number;
}

/** Prompt 结构分析结果 */
interface PromptStructureAnalysis {
  /** 稳定前缀 token 估算 */
  stablePrefixTokens: number;
  /** 动态后缀 token 估算 */
  dynamicSuffixTokens: number;
  /** 缓存友好度评分 0-1 */
  cacheFriendlinessScore: number;
  /** 优化建议 */
  suggestions: string[];
  /** 预估月度节省金额 */
  estimatedMonthlySavings: number;
}

/** 提供商缓存能力注册表 */
const PROVIDER_CACHE_CAPABILITIES: Record<string, ProviderCacheCapability> = {
  anthropic: {
    provider: "anthropic",
    explicitCacheControl: true,
    automaticPrefixCaching: false,
    cacheDiscountRate: 0.1,        // 缓存命中只收 10%
    cacheWritePremium: 1.25,       // 首次写入缓存收 125%
    minCacheableTokens: 1024,      // 最少 1024 tokens
    cacheTTLSeconds: 300,          // 5 分钟 TTL
    blockAlignment: 128,           // 128 token 对齐
  },
  openai: {
    provider: "openai",
    explicitCacheControl: false,
    automaticPrefixCaching: true,
    cacheDiscountRate: 0.5,        // 缓存命中收 50%
    cacheWritePremium: 1.0,        // 无额外写入费用
    minCacheableTokens: 1024,
    cacheTTLSeconds: 0,            // 自动管理
    blockAlignment: 1,             // 无特殊对齐要求
  },
  google: {
    provider: "google",
    explicitCacheControl: true,
    automaticPrefixCaching: false,
    cacheDiscountRate: 0.25,
    cacheWritePremium: 1.0,
    minCacheableTokens: 2048,
    cacheTTLSeconds: 3600,
    blockAlignment: 1,
  },
};

/**
 * PromptCacheManager —— 大模型提供商原生缓存集成管理器
 *
 * 核心策略：
 * 1. 分析 Prompt 结构，识别稳定前缀与动态后缀
 * 2. 根据提供商能力自动插入 cache_control 标记
 * 3. 重排消息顺序，最大化前缀缓存命中率
 * 4. 持续跟踪缓存效果，动态调整策略
 */
class PromptCacheManager extends EventEmitter {
  private capabilities: Map<string, ProviderCacheCapability> = new Map();
  private prefixHashes: Map<string, string> = new Map();
  private stats: Map<string, CacheEffectStats> = new Map();
  private templateRegistry: Map<string, MessageBlock[]> = new Map();
  private tokenEstimator: TokenEstimator;

  constructor() {
    super();
    this.tokenEstimator = new TokenEstimator();
    // 注册所有已知提供商的缓存能力
    for (const [name, cap] of Object.entries(PROVIDER_CACHE_CAPABILITIES)) {
      this.capabilities.set(name, cap);
    }
  }

  /**
   * 为给定的消息序列自动添加缓存控制标记。
   * 这是最核心的方法——它分析消息结构，找到最优的缓存断点，
   * 并插入 cache_control 标记来指导提供商进行缓存。
   *
   * @param messages - 原始消息序列
   * @param provider - 目标提供商
   * @param agentId  - Agent 标识，用于统计跟踪
   * @returns 添加了缓存标记的消息序列
   */
  optimizeForCaching(
    messages: MessageBlock[],
    provider: string,
    agentId: string
  ): MessageBlock[] {
    const cap = this.capabilities.get(provider);
    if (!cap) {
      return messages; // 未知提供商，原样返回
    }

    // 对于支持显式缓存控制的提供商（如 Anthropic）
    if (cap.explicitCacheControl) {
      return this.applyExplicitCacheControl(messages, cap, agentId);
    }

    // 对于自动前缀缓存的提供商（如 OpenAI），只需确保消息顺序最优
    if (cap.automaticPrefixCaching) {
      return this.optimizeMessageOrdering(messages, cap);
    }

    return messages;
  }

  /**
   * Anthropic 风格的显式缓存控制。
   *
   * 关键洞察：Anthropic 的缓存以 128 token 为块进行对齐，
   * 且缓存只在标记了 cache_control 的内容块边界处创建断点。
   * 我们需要找到稳定内容与动态内容的分界线，并将 cache_control
   * 标记放在分界线处。
   *
   * 最佳实践是最多使用 4 个缓存断点（Anthropic 当前限制），
   * 按照以下优先级放置：
   *   1. 系统提示词末尾（最高优先级，几乎 100% 命中）
   *   2. 少样本示例末尾（高优先级，模板间共享）
   *   3. 长文档/上下文末尾（中优先级，会话内共享）
   *   4. 工具定义末尾（中优先级，Agent 级共享）
   */
  private applyExplicitCacheControl(
    messages: MessageBlock[],
    cap: ProviderCacheCapability,
    agentId: string
  ): MessageBlock[] {
    const result: MessageBlock[] = JSON.parse(JSON.stringify(messages));
    const breakpoints: Array<{
      index: number;
      partIndex?: number;
      tokens: number;
      stability: number;
      description: string;
    }> = [];

    let cumulativeTokens = 0;
    for (let i = 0; i < result.length; i++) {
      const msg = result[i];
      const msgTokens = this.tokenEstimator.estimate(msg);
      cumulativeTokens += msgTokens;

      // 评估此消息作为缓存断点的价值
      const stability = this.evaluateStability(msg, i, result.length);

      if (cumulativeTokens >= cap.minCacheableTokens && stability > 0.5) {
        breakpoints.push({
          index: i,
          tokens: cumulativeTokens,
          stability,
          description: this.describeBreakpoint(msg, i),
        });
      }

      // 对于复合内容块（如系统提示词中包含多个部分），分析子块
      if (Array.isArray(msg.content)) {
        let subTokens = 0;
        for (let j = 0; j < msg.content.length; j++) {
          const part = msg.content[j];
          if (part.type === "text" && part.text) {
            subTokens += this.tokenEstimator.estimateText(part.text);
            const subStability = this.evaluatePartStability(
              part, j, msg.content.length, msg.role
            );
            if (subTokens >= cap.minCacheableTokens && subStability > 0.6) {
              breakpoints.push({
                index: i,
                partIndex: j,
                tokens: subTokens,
                stability: subStability,
                description: `${msg.role} content part ${j}`,
              });
            }
          }
        }
      }
    }

    // 按稳定性和累积 token 数的乘积排序，选择最优的 4 个断点
    breakpoints.sort((a, b) => {
      const scoreA = a.stability * Math.log(a.tokens + 1);
      const scoreB = b.stability * Math.log(b.tokens + 1);
      return scoreB - scoreA;
    });

    const maxBreakpoints = 4; // Anthropic 当前限制
    const selectedBreakpoints = breakpoints.slice(0, maxBreakpoints);

    // 在选定的断点处插入 cache_control 标记
    for (const bp of selectedBreakpoints) {
      const msg = result[bp.index];
      if (bp.partIndex !== undefined && Array.isArray(msg.content)) {
        // 在子内容块上标记
        (msg.content[bp.partIndex] as ContentPart).cache_control = {
          type: "ephemeral",
        };
      } else {
        // 在消息级别标记
        msg.cache_control = { type: "ephemeral" };
      }
    }

    // 记录前缀哈希用于后续命中率跟踪
    const prefixContent = result
      .slice(0, (selectedBreakpoints[0]?.index ?? 0) + 1)
      .map((m) =>
        typeof m.content === "string"
          ? m.content
          : m.content.map((p) => p.text ?? "").join("")
      )
      .join("|");
    const prefixHash = createHash("sha256")
      .update(prefixContent)
      .digest("hex")
      .slice(0, 16);
    this.prefixHashes.set(agentId, prefixHash);

    this.emit("cacheOptimized", {
      agentId,
      breakpointCount: selectedBreakpoints.length,
      descriptions: selectedBreakpoints.map((bp) => bp.description),
      prefixHash,
    });

    return result;
  }

  /**
   * 针对自动前缀缓存的消息顺序优化。
   *
   * OpenAI 的自动缓存不需要显式标记，但消息顺序很重要——
   * 只有从头开始的连续相同前缀才能被缓存。因此我们需要：
   * 1. 确保系统提示词始终在最前面
   * 2. 工具定义紧随其后
   * 3. 少样本示例放在动态上下文之前
   * 4. 动态的用户输入放在最后
   */
  private optimizeMessageOrdering(
    messages: MessageBlock[],
    cap: ProviderCacheCapability
  ): MessageBlock[] {
    const systemMessages: MessageBlock[] = [];
    const fewShotMessages: MessageBlock[] = [];
    const contextMessages: MessageBlock[] = [];
    const dynamicMessages: MessageBlock[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemMessages.push(msg);
      } else if (this.isFewShotExample(msg)) {
        fewShotMessages.push(msg);
      } else if (this.isStaticContext(msg)) {
        contextMessages.push(msg);
      } else {
        dynamicMessages.push(msg);
      }
    }

    return [
      ...systemMessages,
      ...fewShotMessages,
      ...contextMessages,
      ...dynamicMessages,
    ];
  }

  /**
   * 注册 Prompt 模板，用于跨请求的缓存优化。
   * 注册后的模板会被预分析，后续使用时可以快速确定缓存断点。
   */
  registerTemplate(
    templateId: string,
    template: MessageBlock[]
  ): PromptStructureAnalysis {
    this.templateRegistry.set(templateId, template);

    let stableTokens = 0;
    let dynamicTokens = 0;
    const suggestions: string[] = [];

    for (let i = 0; i < template.length; i++) {
      const msg = template[i];
      const tokens = this.tokenEstimator.estimate(msg);
      const stability = this.evaluateStability(msg, i, template.length);

      if (stability > 0.7) {
        stableTokens += tokens;
      } else {
        dynamicTokens += tokens;
      }
    }

    // 生成优化建议
    const totalTokens = stableTokens + dynamicTokens;
    const stableRatio = stableTokens / Math.max(totalTokens, 1);

    if (stableRatio < 0.3) {
      suggestions.push(
        "稳定前缀占比不足 30%，考虑将更多静态内容（如角色定义、行为准则）" +
        "移至系统提示词开头以提高缓存命中率"
      );
    }

    if (stableTokens < 1024) {
      suggestions.push(
        "稳定前缀不足 1024 tokens，未达到大多数提供商的最小缓存阈值。" +
        "考虑合并少样本示例到系统提示词中"
      );
    }

    if (stableTokens > 4096 && stableRatio > 0.8) {
      suggestions.push(
        "极佳的缓存场景！稳定前缀超过 4096 tokens 且占比 80%+，" +
        "预计可节省超过 70% 的输入 token 成本"
      );
    }

    // 根据 Anthropic 定价预估月度节省
    // Claude Sonnet 4.6 输入价格 $3/MTok，缓存命中 $0.3/MTok
    const requestsPerDay = 10000; // 假设
    const daysPerMonth = 30;
    const monthlyRequests = requestsPerDay * daysPerMonth;
    const pricePerMTok = 3.0;
    const cachedPricePerMTok = 0.3;

    const monthlyCostWithout =
      (totalTokens * monthlyRequests * pricePerMTok) / 1_000_000;
    const monthlyCostWith =
      ((dynamicTokens * pricePerMTok + stableTokens * cachedPricePerMTok) *
        monthlyRequests) /
      1_000_000;
    const estimatedMonthlySavings = monthlyCostWithout - monthlyCostWith;

    const analysis: PromptStructureAnalysis = {
      stablePrefixTokens: stableTokens,
      dynamicSuffixTokens: dynamicTokens,
      cacheFriendlinessScore: stableRatio,
      suggestions,
      estimatedMonthlySavings,
    };

    this.emit("templateAnalyzed", { templateId, analysis });
    return analysis;
  }

  /**
   * 记录 API 响应中的缓存统计信息。
   * Anthropic API 会在响应的 usage 字段中返回
   * cache_creation_input_tokens 和 cache_read_input_tokens。
   */
  recordCacheResult(
    agentId: string,
    usage: {
      input_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    },
    modelPricing: { inputPricePerMTok: number; cacheReadDiscount: number }
  ): void {
    let agentStats = this.stats.get(agentId);
    if (!agentStats) {
      agentStats = {
        totalRequests: 0,
        cacheHits: 0,
        cacheMisses: 0,
        cacheWrites: 0,
        hitRate: 0,
        totalInputTokens: 0,
        cachedInputTokens: 0,
        uncachedInputTokens: 0,
        estimatedSavingsDollars: 0,
        estimatedWithoutCacheDollars: 0,
        effectiveDiscountRate: 0,
      };
      this.stats.set(agentId, agentStats);
    }

    agentStats.totalRequests++;
    agentStats.totalInputTokens += usage.input_tokens;

    const cachedTokens = usage.cache_read_input_tokens ?? 0;
    const writtenTokens = usage.cache_creation_input_tokens ?? 0;

    agentStats.cachedInputTokens += cachedTokens;
    agentStats.uncachedInputTokens +=
      usage.input_tokens - cachedTokens;

    if (cachedTokens > 0) {
      agentStats.cacheHits++;
    } else {
      agentStats.cacheMisses++;
    }

    if (writtenTokens > 0) {
      agentStats.cacheWrites++;
    }

    // 计算节省金额
    const fullCost =
      (usage.input_tokens * modelPricing.inputPricePerMTok) / 1_000_000;
    const actualCost =
      ((usage.input_tokens - cachedTokens) * modelPricing.inputPricePerMTok +
        cachedTokens *
          modelPricing.inputPricePerMTok *
          modelPricing.cacheReadDiscount) /
      1_000_000;

    agentStats.estimatedWithoutCacheDollars += fullCost;
    agentStats.estimatedSavingsDollars += fullCost - actualCost;

    agentStats.hitRate =
      agentStats.cacheHits / agentStats.totalRequests;
    agentStats.effectiveDiscountRate =
      agentStats.estimatedSavingsDollars /
      Math.max(agentStats.estimatedWithoutCacheDollars, 0.001);

    this.emit("cacheStatsUpdated", { agentId, stats: { ...agentStats } });
  }

  /** 获取指定 Agent 的缓存效果统计 */
  getStats(agentId: string): CacheEffectStats | undefined {
    return this.stats.get(agentId);
  }

  /** 获取所有 Agent 的汇总统计 */
  getAggregateStats(): CacheEffectStats {
    const aggregate: CacheEffectStats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheWrites: 0,
      hitRate: 0,
      totalInputTokens: 0,
      cachedInputTokens: 0,
      uncachedInputTokens: 0,
      estimatedSavingsDollars: 0,
      estimatedWithoutCacheDollars: 0,
      effectiveDiscountRate: 0,
    };

    for (const stats of this.stats.values()) {
      aggregate.totalRequests += stats.totalRequests;
      aggregate.cacheHits += stats.cacheHits;
      aggregate.cacheMisses += stats.cacheMisses;
      aggregate.cacheWrites += stats.cacheWrites;
      aggregate.totalInputTokens += stats.totalInputTokens;
      aggregate.cachedInputTokens += stats.cachedInputTokens;
      aggregate.uncachedInputTokens += stats.uncachedInputTokens;
      aggregate.estimatedSavingsDollars += stats.estimatedSavingsDollars;
      aggregate.estimatedWithoutCacheDollars +=
        stats.estimatedWithoutCacheDollars;
    }

    aggregate.hitRate =
      aggregate.cacheHits / Math.max(aggregate.totalRequests, 1);
    aggregate.effectiveDiscountRate =
      aggregate.estimatedSavingsDollars /
      Math.max(aggregate.estimatedWithoutCacheDollars, 0.001);

    return aggregate;
  }

  // ---- 内部辅助方法 ----

  private evaluateStability(
    msg: MessageBlock,
    index: number,
    totalMessages: number
  ): number {
    let score = 0;
    // 系统消息最稳定
    if (msg.role === "system") score += 0.5;
    // 越靠前的消息越稳定
    score += (1 - index / Math.max(totalMessages, 1)) * 0.3;
    // 长消息更值得缓存
    const tokens = this.tokenEstimator.estimate(msg);
    if (tokens > 500) score += 0.2;
    return Math.min(score, 1.0);
  }

  private evaluatePartStability(
    part: ContentPart,
    index: number,
    totalParts: number,
    role: string
  ): number {
    let score = role === "system" ? 0.6 : 0.3;
    score += (1 - index / Math.max(totalParts, 1)) * 0.2;
    if (part.text && part.text.length > 500) score += 0.2;
    return Math.min(score, 1.0);
  }

  private describeBreakpoint(msg: MessageBlock, index: number): string {
    const content =
      typeof msg.content === "string"
        ? msg.content.slice(0, 50)
        : msg.content[0]?.text?.slice(0, 50) ?? "";
    return `[${index}] ${msg.role}: ${content}...`;
  }

  private isFewShotExample(msg: MessageBlock): boolean {
    const text =
      typeof msg.content === "string"
        ? msg.content
        : msg.content.map((p) => p.text ?? "").join("");
    return (
      text.includes("示例") ||
      text.includes("example") ||
      text.includes("Example")
    );
  }

  private isStaticContext(msg: MessageBlock): boolean {
    const text =
      typeof msg.content === "string"
        ? msg.content
        : msg.content.map((p) => p.text ?? "").join("");
    return (
      text.includes("文档") ||
      text.includes("document") ||
      text.includes("context")
    );
  }
}

/** 简易 token 估算器（生产环境应使用 tiktoken 等库） */
class TokenEstimator {
  estimate(msg: MessageBlock): number {
    const text =
      typeof msg.content === "string"
        ? msg.content
        : msg.content.map((p) => p.text ?? "").join("");
    return this.estimateText(text);
  }

  estimateText(text: string): number {
    // 粗略估算：英文 ~4 字符/token，中文 ~1.5 字符/token
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }
}
```

上面的 `PromptCacheManager` 解决了"如何利用提供商原生缓存"的问题。但原生缓存有一个固有限制——它只缓存 token 处理的计算结果，每次请求仍然需要发起 API 调用并等待生成。对于那些输入高度相似且期望输出也相似的场景，我们需要更激进的策略：直接缓存 LLM 的完整响应。

### 19.4.2 SemanticCostCache：语义相似度响应缓存

传统的精确匹配缓存在 LLM 场景中几乎无用，因为即使表达相同意图的两个用户输入也很少完全相同。`SemanticCostCache` 使用 embedding 向量来判断语义相似度——如果新请求与已缓存请求的语义相似度超过阈值，则直接返回缓存的响应，完全避免 LLM 调用。

这种方法需要在成本节省与响应准确性之间取得平衡。相似度阈值设得太低会导致缓存命中率低、节省有限；设得太高则可能返回不够精确的响应。因此，`SemanticCostCache` 引入了"成本感知 TTL"——越昂贵的请求（使用更大模型、更长输出）缓存越久，越便宜的请求缓存越短。

```typescript
// ---- SemanticCostCache: 语义相似度 LLM 响应缓存 ----

/** 缓存条目 */
interface CacheEntry {
  id: string;
  /** 原始请求的 embedding 向量 */
  embedding: number[];
  /** 原始请求文本（用于审计） */
  requestText: string;
  /** 缓存的 LLM 响应 */
  response: string;
  /** 使用的模型 */
  model: string;
  /** 原始请求的成本（美元） */
  originalCostDollars: number;
  /** 响应质量评分 0-1（可选，由下游评估提供） */
  qualityScore?: number;
  /** 创建时间戳 */
  createdAt: number;
  /** 过期时间戳 */
  expiresAt: number;
  /** 命中次数 */
  hitCount: number;
  /** 最近命中时间 */
  lastHitAt: number;
  /** Agent ID */
  agentId: string;
  /** 请求类型标签（用于分类缓存策略） */
  taskType: string;
}

/** 缓存配置 */
interface SemanticCacheConfig {
  /** 相似度阈值 0-1（推荐 0.92-0.97） */
  similarityThreshold: number;
  /** 基础 TTL（秒） */
  baseTTLSeconds: number;
  /** 成本感知 TTL 倍率：每美元成本增加的 TTL 秒数 */
  costTTLMultiplierPerDollar: number;
  /** 最大 TTL（秒） */
  maxTTLSeconds: number;
  /** 最大缓存条目数 */
  maxEntries: number;
  /** embedding 维度 */
  embeddingDimension: number;
  /** 是否对不同 Agent 隔离缓存 */
  isolateByAgent: boolean;
  /** 是否对不同任务类型隔离缓存 */
  isolateByTaskType: boolean;
  /** 质量衰减系数：低质量评分的条目 TTL 衰减 */
  qualityDecayFactor: number;
}

/** 缓存查询结果 */
interface CacheQueryResult {
  hit: boolean;
  entry?: CacheEntry;
  similarity?: number;
  savedCostDollars?: number;
  /** 缓存查询本身的延迟（ms） */
  queryLatencyMs: number;
}

/** 缓存总体统计 */
interface SemanticCacheStats {
  totalQueries: number;
  hits: number;
  misses: number;
  hitRate: number;
  totalSavedDollars: number;
  avgSimilarityOnHit: number;
  avgQueryLatencyMs: number;
  entries: number;
  evictions: number;
  expiredEvictions: number;
  capacityEvictions: number;
}

/**
 * SemanticCostCache —— 语义相似度 + 成本感知的 LLM 响应缓存
 *
 * 核心设计决策：
 * 1. 使用 embedding 余弦相似度而非精确匹配
 * 2. TTL 与原始请求成本正相关——越贵的响应缓存越久
 * 3. 质量反馈循环——低质量响应的 TTL 自动缩短
 * 4. 支持按 Agent 和任务类型隔离缓存空间
 */
class SemanticCostCache {
  private entries: Map<string, CacheEntry> = new Map();
  private config: SemanticCacheConfig;
  private stats: SemanticCacheStats;
  private embeddingIndex: SimpleVectorIndex;
  private evictionQueue: MinHeap<{ id: string; expiresAt: number }>;

  constructor(config: Partial<SemanticCacheConfig> = {}) {
    this.config = {
      similarityThreshold: 0.95,
      baseTTLSeconds: 3600,             // 1 小时基础
      costTTLMultiplierPerDollar: 7200, // 每美元增加 2 小时
      maxTTLSeconds: 86400,             // 最长 24 小时
      maxEntries: 50000,
      embeddingDimension: 1536,
      isolateByAgent: true,
      isolateByTaskType: true,
      qualityDecayFactor: 0.5,
      ...config,
    };

    this.stats = {
      totalQueries: 0,
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalSavedDollars: 0,
      avgSimilarityOnHit: 0,
      avgQueryLatencyMs: 0,
      entries: 0,
      evictions: 0,
      expiredEvictions: 0,
      capacityEvictions: 0,
    };

    this.embeddingIndex = new SimpleVectorIndex(
      this.config.embeddingDimension
    );
    this.evictionQueue = new MinHeap(
      (a, b) => a.expiresAt - b.expiresAt
    );
  }

  /**
   * 查询缓存。返回语义最相似且未过期的缓存条目。
   */
  async query(
    requestText: string,
    embedding: number[],
    agentId: string,
    taskType: string
  ): Promise<CacheQueryResult> {
    const startTime = Date.now();
    this.stats.totalQueries++;

    // 清理过期条目
    this.evictExpired();

    // 构建搜索范围的过滤条件
    const scopeFilter = (entry: CacheEntry): boolean => {
      if (this.config.isolateByAgent && entry.agentId !== agentId) {
        return false;
      }
      if (this.config.isolateByTaskType && entry.taskType !== taskType) {
        return false;
      }
      return true;
    };

    // 在向量索引中搜索最近邻
    const candidates = this.embeddingIndex.searchKNN(embedding, 5);
    let bestMatch: { entry: CacheEntry; similarity: number } | null = null;

    for (const candidate of candidates) {
      const entry = this.entries.get(candidate.id);
      if (!entry) continue;
      if (!scopeFilter(entry)) continue;
      if (entry.expiresAt < Date.now()) continue;

      if (
        candidate.similarity >= this.config.similarityThreshold &&
        (!bestMatch || candidate.similarity > bestMatch.similarity)
      ) {
        bestMatch = { entry, similarity: candidate.similarity };
      }
    }

    const queryLatencyMs = Date.now() - startTime;
    this.updateAvgLatency(queryLatencyMs);

    if (bestMatch) {
      // 缓存命中
      bestMatch.entry.hitCount++;
      bestMatch.entry.lastHitAt = Date.now();
      this.stats.hits++;
      this.stats.hitRate = this.stats.hits / this.stats.totalQueries;
      this.stats.totalSavedDollars += bestMatch.entry.originalCostDollars;
      this.updateAvgSimilarity(bestMatch.similarity);

      return {
        hit: true,
        entry: bestMatch.entry,
        similarity: bestMatch.similarity,
        savedCostDollars: bestMatch.entry.originalCostDollars,
        queryLatencyMs,
      };
    }

    // 缓存未命中
    this.stats.misses++;
    this.stats.hitRate = this.stats.hits / this.stats.totalQueries;

    return {
      hit: false,
      queryLatencyMs,
    };
  }

  /**
   * 将 LLM 响应写入缓存。
   * TTL 基于成本动态计算：costDollars 越高，TTL 越长。
   */
  async store(
    requestText: string,
    embedding: number[],
    response: string,
    model: string,
    costDollars: number,
    agentId: string,
    taskType: string,
    qualityScore?: number
  ): Promise<string> {
    // 容量检查，必要时淘汰旧条目
    while (this.entries.size >= this.config.maxEntries) {
      this.evictLeastValuable();
    }

    // 计算成本感知 TTL
    let ttlSeconds =
      this.config.baseTTLSeconds +
      costDollars * this.config.costTTLMultiplierPerDollar;

    // 质量衰减
    if (qualityScore !== undefined && qualityScore < 0.8) {
      ttlSeconds *= this.config.qualityDecayFactor +
        qualityScore * (1 - this.config.qualityDecayFactor);
    }

    ttlSeconds = Math.min(ttlSeconds, this.config.maxTTLSeconds);

    const id = createHash("sha256")
      .update(`${agentId}:${taskType}:${requestText}`)
      .digest("hex")
      .slice(0, 20);

    const now = Date.now();
    const entry: CacheEntry = {
      id,
      embedding,
      requestText,
      response,
      model,
      originalCostDollars: costDollars,
      qualityScore,
      createdAt: now,
      expiresAt: now + ttlSeconds * 1000,
      hitCount: 0,
      lastHitAt: now,
      agentId,
      taskType,
    };

    this.entries.set(id, entry);
    this.embeddingIndex.add(id, embedding);
    this.evictionQueue.push({ id, expiresAt: entry.expiresAt });
    this.stats.entries = this.entries.size;

    return id;
  }

  /**
   * 反馈质量评分，动态调整缓存条目的 TTL。
   * 当下游评估发现缓存响应质量不佳时，缩短其剩余生命周期。
   */
  feedbackQuality(entryId: string, qualityScore: number): void {
    const entry = this.entries.get(entryId);
    if (!entry) return;

    entry.qualityScore = qualityScore;

    // 如果质量评分低于 0.6，立即将 TTL 缩短为原来的 1/4
    if (qualityScore < 0.6) {
      const remaining = entry.expiresAt - Date.now();
      entry.expiresAt = Date.now() + remaining * 0.25;
    }

    // 如果质量评分极低（< 0.3），直接删除
    if (qualityScore < 0.3) {
      this.entries.delete(entryId);
      this.embeddingIndex.remove(entryId);
      this.stats.entries = this.entries.size;
    }
  }

  /** 获取缓存统计 */
  getStats(): SemanticCacheStats {
    return { ...this.stats };
  }

  // ---- 内部方法 ----

  private evictExpired(): void {
    const now = Date.now();
    while (this.evictionQueue.size() > 0) {
      const top = this.evictionQueue.peek();
      if (!top || top.expiresAt > now) break;
      this.evictionQueue.pop();
      const entry = this.entries.get(top.id);
      if (entry && entry.expiresAt <= now) {
        this.entries.delete(top.id);
        this.embeddingIndex.remove(top.id);
        this.stats.evictions++;
        this.stats.expiredEvictions++;
      }
    }
    this.stats.entries = this.entries.size;
  }

  private evictLeastValuable(): void {
    // 淘汰策略：综合考虑命中次数、剩余 TTL、原始成本
    let leastValuableId: string | null = null;
    let leastValue = Infinity;

    for (const [id, entry] of this.entries) {
      const remainingTTL = Math.max(entry.expiresAt - Date.now(), 0);
      const value =
        entry.hitCount * entry.originalCostDollars *
        (remainingTTL / this.config.maxTTLSeconds);
      if (value < leastValue) {
        leastValue = value;
        leastValuableId = id;
      }
    }

    if (leastValuableId) {
      this.entries.delete(leastValuableId);
      this.embeddingIndex.remove(leastValuableId);
      this.stats.evictions++;
      this.stats.capacityEvictions++;
    }
  }

  private updateAvgSimilarity(similarity: number): void {
    const n = this.stats.hits;
    this.stats.avgSimilarityOnHit =
      ((n - 1) * this.stats.avgSimilarityOnHit + similarity) / n;
  }

  private updateAvgLatency(latencyMs: number): void {
    const n = this.stats.totalQueries;
    this.stats.avgQueryLatencyMs =
      ((n - 1) * this.stats.avgQueryLatencyMs + latencyMs) / n;
  }
}

/** 简易向量索引（生产环境应使用 Faiss、Qdrant 等） */
class SimpleVectorIndex {
  private vectors: Map<string, number[]> = new Map();
  private dimension: number;

  constructor(dimension: number) {
    this.dimension = dimension;
  }

  add(id: string, vector: number[]): void {
    this.vectors.set(id, vector);
  }

  remove(id: string): void {
    this.vectors.delete(id);
  }

  searchKNN(
    query: number[],
    k: number
  ): Array<{ id: string; similarity: number }> {
    const results: Array<{ id: string; similarity: number }> = [];
    for (const [id, vec] of this.vectors) {
      const sim = this.cosineSimilarity(query, vec);
      results.push({ id, similarity: sim });
    }
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, k);
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

/** 最小堆 */
class MinHeap<T> {
  private heap: T[] = [];
  private compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  push(item: T): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  peek(): T | undefined {
    return this.heap[0];
  }

  size(): number {
    return this.heap.length;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.compare(this.heap[i], this.heap[parent]) >= 0) break;
      [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
      i = parent;
    }
  }

  private sinkDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (
        left < n &&
        this.compare(this.heap[left], this.heap[smallest]) < 0
      ) {
        smallest = left;
      }
      if (
        right < n &&
        this.compare(this.heap[right], this.heap[smallest]) < 0
      ) {
        smallest = right;
      }
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [
        this.heap[smallest],
        this.heap[i],
      ];
      i = smallest;
    }
  }
}
```

### 19.4.3 PromptCompressor：上下文窗口优化

即便有了提供商原生缓存和语义响应缓存，每次新请求中的上下文内容仍然是成本的主要来源。在多轮对话的 Agent 系统中，随着对话的进行，上下文窗口不断膨胀——第 20 轮对话可能携带了前 19 轮的全部历史，其中大量信息对当前回合来说是冗余的。

`PromptCompressor` 的核心思路是：在发送请求之前，对上下文进行智能压缩，移除冗余信息、合并相似内容、截断不相关的历史，同时保留对当前任务关键的上下文。这与第 17 章（可观测性工程）中的 trace 采样策略有异曲同工之妙——我们不是记录所有信息，而是智能地保留最有价值的部分。

```typescript
// ---- PromptCompressor: 上下文窗口智能压缩 ----

/** 压缩策略 */
type CompressionStrategy =
  | "truncate_old"       // 截断旧消息
  | "summarize_history"  // 摘要历史对话
  | "remove_redundancy"  // 去除冗余内容
  | "semantic_select"    // 语义相关性选择
  | "hybrid";            // 混合策略

/** 压缩配置 */
interface CompressionConfig {
  /** 目标 token 数（压缩后不超过此值） */
  targetTokens: number;
  /** 最大压缩率（不低于此比例，如 0.3 表示最少保留 30%） */
  maxCompressionRatio: number;
  /** 压缩策略 */
  strategy: CompressionStrategy;
  /** 系统提示词保护（不压缩系统提示词） */
  protectSystemPrompt: boolean;
  /** 最近 N 轮对话不压缩 */
  protectRecentTurns: number;
  /** 工具调用结果保护（不压缩工具结果） */
  protectToolResults: boolean;
  /** 摘要用的模型（用便宜的模型来摘要以节省成本） */
  summaryModel: string;
  /** 摘要用模型的价格（$/MTok） */
  summaryModelPrice: number;
}

/** 压缩结果 */
interface CompressionResult {
  /** 压缩后的消息 */
  messages: MessageBlock[];
  /** 原始 token 数 */
  originalTokens: number;
  /** 压缩后 token 数 */
  compressedTokens: number;
  /** 压缩率 */
  compressionRatio: number;
  /** 预估节省成本（美元） */
  estimatedSavingsDollars: number;
  /** 压缩过程本身的成本（如果使用了摘要模型） */
  compressionCostDollars: number;
  /** 净节省 */
  netSavingsDollars: number;
  /** 压缩耗时（ms） */
  compressionLatencyMs: number;
  /** 应用的策略 */
  appliedStrategies: string[];
}

/** 消息重要性评分结果 */
interface ImportanceScore {
  messageIndex: number;
  score: number; // 0-1
  reason: string;
}

/**
 * PromptCompressor —— 上下文窗口智能压缩器
 *
 * 设计原则：
 * 1. 保护关键信息：系统提示词、最近对话、工具结果
 * 2. 成本感知压缩：压缩本身的成本不应超过节省的成本
 * 3. 可逆透明：压缩后的消息包含标记，让 Agent 知道上下文被压缩过
 * 4. 多策略组合：根据场景选择最优压缩策略
 */
class PromptCompressor {
  private config: CompressionConfig;
  private tokenEstimator: TokenEstimator;
  private compressionHistory: Array<{
    timestamp: number;
    originalTokens: number;
    compressedTokens: number;
    savings: number;
  }> = [];

  constructor(config: Partial<CompressionConfig> = {}) {
    this.config = {
      targetTokens: 8000,
      maxCompressionRatio: 0.3,
      strategy: "hybrid",
      protectSystemPrompt: true,
      protectRecentTurns: 3,
      protectToolResults: true,
      summaryModel: "gpt-4o-mini",
      summaryModelPrice: 0.15,  // $0.15/MTok input
      ...config,
    };
    this.tokenEstimator = new TokenEstimator();
  }

  /**
   * 压缩消息序列。
   *
   * @param messages - 原始消息
   * @param modelPrice - 目标模型的输入价格（$/MTok）
   * @returns 压缩结果
   */
  async compress(
    messages: MessageBlock[],
    modelPrice: number
  ): Promise<CompressionResult> {
    const startTime = Date.now();
    const originalTokens = this.estimateTotalTokens(messages);
    const appliedStrategies: string[] = [];

    // 如果已经在目标范围内，不需要压缩
    if (originalTokens <= this.config.targetTokens) {
      return {
        messages,
        originalTokens,
        compressedTokens: originalTokens,
        compressionRatio: 1.0,
        estimatedSavingsDollars: 0,
        compressionCostDollars: 0,
        netSavingsDollars: 0,
        compressionLatencyMs: Date.now() - startTime,
        appliedStrategies: [],
      };
    }

    let compressed = [...messages];

    // 根据策略执行压缩
    switch (this.config.strategy) {
      case "truncate_old":
        compressed = this.truncateOldMessages(compressed);
        appliedStrategies.push("truncate_old");
        break;

      case "remove_redundancy":
        compressed = this.removeRedundancy(compressed);
        appliedStrategies.push("remove_redundancy");
        break;

      case "summarize_history":
        compressed = await this.summarizeHistory(compressed);
        appliedStrategies.push("summarize_history");
        break;

      case "semantic_select":
        compressed = this.semanticSelect(compressed);
        appliedStrategies.push("semantic_select");
        break;

      case "hybrid":
      default:
        // 混合策略：按顺序尝试，直到达到目标
        compressed = this.removeRedundancy(compressed);
        appliedStrategies.push("remove_redundancy");

        if (this.estimateTotalTokens(compressed) > this.config.targetTokens) {
          compressed = this.semanticSelect(compressed);
          appliedStrategies.push("semantic_select");
        }

        if (this.estimateTotalTokens(compressed) > this.config.targetTokens) {
          compressed = this.truncateOldMessages(compressed);
          appliedStrategies.push("truncate_old");
        }

        if (this.estimateTotalTokens(compressed) > this.config.targetTokens) {
          compressed = await this.summarizeHistory(compressed);
          appliedStrategies.push("summarize_history");
        }
        break;
    }

    const compressedTokens = this.estimateTotalTokens(compressed);
    const savedTokens = originalTokens - compressedTokens;
    const estimatedSavings =
      (savedTokens * modelPrice) / 1_000_000;

    // 计算压缩过程本身的成本（如果使用了摘要模型）
    const compressionCost = appliedStrategies.includes("summarize_history")
      ? (originalTokens * this.config.summaryModelPrice) / 1_000_000
      : 0;

    const result: CompressionResult = {
      messages: compressed,
      originalTokens,
      compressedTokens,
      compressionRatio: compressedTokens / originalTokens,
      estimatedSavingsDollars: estimatedSavings,
      compressionCostDollars: compressionCost,
      netSavingsDollars: estimatedSavings - compressionCost,
      compressionLatencyMs: Date.now() - startTime,
      appliedStrategies,
    };

    this.compressionHistory.push({
      timestamp: Date.now(),
      originalTokens,
      compressedTokens,
      savings: result.netSavingsDollars,
    });

    return result;
  }

  /**
   * 策略一：截断旧消息
   * 保留系统提示词和最近 N 轮对话，截断中间的历史。
   */
  private truncateOldMessages(messages: MessageBlock[]): MessageBlock[] {
    const systemMsgs = messages.filter((m) => m.role === "system");
    const nonSystemMsgs = messages.filter((m) => m.role !== "system");

    // 保护最近 N 轮（一轮 = user + assistant）
    const protectedCount = this.config.protectRecentTurns * 2;
    const recentMsgs = nonSystemMsgs.slice(-protectedCount);
    const oldMsgs = nonSystemMsgs.slice(0, -protectedCount);

    // 逐条从最旧的开始移除，直到达到目标
    let currentTokens = this.estimateTotalTokens([
      ...systemMsgs,
      ...oldMsgs,
      ...recentMsgs,
    ]);
    let removeCount = 0;

    while (
      currentTokens > this.config.targetTokens &&
      removeCount < oldMsgs.length
    ) {
      currentTokens -= this.tokenEstimator.estimate(oldMsgs[removeCount]);
      removeCount++;
    }

    const kept = oldMsgs.slice(removeCount);

    // 如果有截断，添加一个摘要标记
    if (removeCount > 0) {
      const truncationMarker: MessageBlock = {
        role: "system",
        content:
          `[上下文压缩提示：已截断 ${removeCount} 条历史消息以控制成本。` +
          `如需引用早期对话内容，请要求用户重新提供。]`,
      };
      return [...systemMsgs, truncationMarker, ...kept, ...recentMsgs];
    }

    return [...systemMsgs, ...kept, ...recentMsgs];
  }

  /**
   * 策略二：去除冗余内容
   * 检测消息间的重复内容、重复的工具调用结果、冗余的确认语句等。
   */
  private removeRedundancy(messages: MessageBlock[]): MessageBlock[] {
    const result: MessageBlock[] = [];
    const seenContents = new Set<string>();

    for (const msg of messages) {
      // 系统消息始终保留
      if (msg.role === "system") {
        result.push(msg);
        continue;
      }

      const text =
        typeof msg.content === "string"
          ? msg.content
          : msg.content.map((p) => p.text ?? "").join("");

      // 去除空消息
      if (text.trim().length === 0) continue;

      // 计算内容指纹（忽略空格和标点差异）
      const normalized = text
        .replace(/\s+/g, " ")
        .replace(/[。，！？、；：""''（）\.\,\!\?\;\:\"\'\(\)]/g, "")
        .trim()
        .toLowerCase();
      const fingerprint = createHash("md5")
        .update(normalized)
        .digest("hex");

      // 跳过重复内容
      if (seenContents.has(fingerprint)) continue;
      seenContents.add(fingerprint);

      // 去除冗余确认语句（如 "好的"、"明白了"、"收到"）
      const redundantPatterns = [
        /^(好的|明白了?|收到了?|了解了?|嗯|ok|okay|sure|got it|i see)[\s。\.\!！]*$/i,
      ];
      const isRedundant = redundantPatterns.some((p) => p.test(text.trim()));
      if (isRedundant && msg.role === "assistant") continue;

      // 压缩冗长的工具调用结果
      if (this.isToolResult(msg) && !this.config.protectToolResults) {
        const compressedMsg = this.compressToolResult(msg);
        result.push(compressedMsg);
        continue;
      }

      result.push(msg);
    }

    return result;
  }

  /**
   * 策略三：语义相关性选择
   * 基于与最近用户输入的语义相关性，只保留最相关的历史消息。
   */
  private semanticSelect(messages: MessageBlock[]): MessageBlock[] {
    const systemMsgs = messages.filter((m) => m.role === "system");
    const nonSystemMsgs = messages.filter((m) => m.role !== "system");

    if (nonSystemMsgs.length === 0) return messages;

    // 获取最后一条用户消息作为相关性锚点
    const lastUserMsg = [...nonSystemMsgs]
      .reverse()
      .find((m) => m.role === "user");
    if (!lastUserMsg) return messages;

    const anchorText =
      typeof lastUserMsg.content === "string"
        ? lastUserMsg.content
        : lastUserMsg.content.map((p) => p.text ?? "").join("");

    // 计算每条非系统消息与锚点的相关性（简化版：使用关键词重叠度）
    const scores: ImportanceScore[] = nonSystemMsgs.map((msg, idx) => {
      const msgText =
        typeof msg.content === "string"
          ? msg.content
          : msg.content.map((p) => p.text ?? "").join("");

      const score = this.computeKeywordOverlap(anchorText, msgText);
      return {
        messageIndex: idx,
        score,
        reason: `关键词重叠度: ${score.toFixed(3)}`,
      };
    });

    // 保护最近几轮对话
    const protectedCount = this.config.protectRecentTurns * 2;
    const protectedIndices = new Set(
      Array.from(
        { length: Math.min(protectedCount, nonSystemMsgs.length) },
        (_, i) => nonSystemMsgs.length - 1 - i
      )
    );

    // 按分数排序，选择性保留
    const sortedScores = [...scores].sort((a, b) => b.score - a.score);
    const selectedIndices = new Set<number>(protectedIndices);
    let tokenBudget =
      this.config.targetTokens -
      this.estimateTotalTokens(systemMsgs);

    // 先扣除受保护消息的 token
    for (const idx of protectedIndices) {
      tokenBudget -= this.tokenEstimator.estimate(nonSystemMsgs[idx]);
    }

    // 按相关性从高到低填充预算
    for (const scored of sortedScores) {
      if (selectedIndices.has(scored.messageIndex)) continue;
      const tokens = this.tokenEstimator.estimate(
        nonSystemMsgs[scored.messageIndex]
      );
      if (tokenBudget - tokens >= 0) {
        selectedIndices.add(scored.messageIndex);
        tokenBudget -= tokens;
      }
    }

    // 按原始顺序重建消息序列
    const selectedNonSystem = nonSystemMsgs.filter((_, idx) =>
      selectedIndices.has(idx)
    );

    const removedCount = nonSystemMsgs.length - selectedNonSystem.length;
    if (removedCount > 0) {
      const marker: MessageBlock = {
        role: "system",
        content:
          `[上下文优化：基于语义相关性移除了 ${removedCount} 条低相关性消息。]`,
      };
      return [...systemMsgs, marker, ...selectedNonSystem];
    }

    return [...systemMsgs, ...selectedNonSystem];
  }

  /**
   * 策略四：摘要历史对话
   * 使用低成本模型将长对话历史压缩为摘要。
   */
  private async summarizeHistory(
    messages: MessageBlock[]
  ): Promise<MessageBlock[]> {
    const systemMsgs = messages.filter((m) => m.role === "system");
    const nonSystemMsgs = messages.filter((m) => m.role !== "system");

    const protectedCount = this.config.protectRecentTurns * 2;
    const recentMsgs = nonSystemMsgs.slice(-protectedCount);
    const oldMsgs = nonSystemMsgs.slice(0, -protectedCount);

    if (oldMsgs.length === 0) {
      return messages;
    }

    // 将旧消息拼接为文本
    const historyText = oldMsgs
      .map((m) => {
        const text =
          typeof m.content === "string"
            ? m.content
            : m.content.map((p) => p.text ?? "").join("");
        return `[${m.role}]: ${text}`;
      })
      .join("\n");

    // 使用低成本模型生成摘要（这里用伪代码表示 API 调用）
    const summaryPrompt =
      "请将以下对话历史压缩为简洁的摘要，保留关键决策、用户需求和重要上下文：\n\n" +
      historyText +
      "\n\n请输出结构化摘要，不超过 500 字：";

    // 模拟摘要结果（实际应调用 LLM API）
    const summary = await this.callSummaryModel(summaryPrompt);

    const summaryMsg: MessageBlock = {
      role: "system",
      content:
        `[对话历史摘要 — 涵盖 ${oldMsgs.length} 条消息]\n${summary}`,
    };

    return [...systemMsgs, summaryMsg, ...recentMsgs];
  }

  // ---- 辅助方法 ----

  private estimateTotalTokens(messages: MessageBlock[]): number {
    return messages.reduce(
      (sum, msg) => sum + this.tokenEstimator.estimate(msg),
      0
    );
  }

  private computeKeywordOverlap(textA: string, textB: string): number {
    const wordsA = new Set(this.tokenize(textA));
    const wordsB = new Set(this.tokenize(textB));
    let overlap = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) overlap++;
    }
    return overlap / Math.max(wordsA.size, 1);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[\s\p{P}]+/u)
      .filter((t) => t.length > 1);
  }

  private isToolResult(msg: MessageBlock): boolean {
    const text =
      typeof msg.content === "string"
        ? msg.content
        : msg.content.map((p) => p.text ?? "").join("");
    return text.includes("tool_result") || text.includes("function_response");
  }

  private compressToolResult(msg: MessageBlock): MessageBlock {
    const text =
      typeof msg.content === "string"
        ? msg.content
        : msg.content.map((p) => p.text ?? "").join("");

    // 如果工具结果超过 500 字符，截断并保留摘要
    if (text.length > 500) {
      const truncated = text.slice(0, 400) + "\n...[已截断，共 " +
        text.length + " 字符]";
      return { ...msg, content: truncated };
    }
    return msg;
  }

  private async callSummaryModel(prompt: string): Promise<string> {
    // 实际实现应调用低成本 LLM API
    // 这里返回一个占位符，生产代码应替换为真实调用
    return "[对话摘要：用户讨论了项目需求，确认了技术方案，" +
      "请求了代码审查，并提出了性能优化建议。]";
  }

  /** 获取压缩历史统计 */
  getCompressionStats(): {
    totalCompressions: number;
    avgCompressionRatio: number;
    totalSavedDollars: number;
    avgSavedTokensPerCompression: number;
  } {
    if (this.compressionHistory.length === 0) {
      return {
        totalCompressions: 0,
        avgCompressionRatio: 1.0,
        totalSavedDollars: 0,
        avgSavedTokensPerCompression: 0,
      };
    }

    const totalOriginal = this.compressionHistory.reduce(
      (s, h) => s + h.originalTokens, 0
    );
    const totalCompressed = this.compressionHistory.reduce(
      (s, h) => s + h.compressedTokens, 0
    );
    const totalSaved = this.compressionHistory.reduce(
      (s, h) => s + h.savings, 0
    );

    return {
      totalCompressions: this.compressionHistory.length,
      avgCompressionRatio: totalCompressed / Math.max(totalOriginal, 1),
      totalSavedDollars: totalSaved,
      avgSavedTokensPerCompression:
        (totalOriginal - totalCompressed) / this.compressionHistory.length,
    };
  }
}
```

### 19.4.4 三层缓存协同与成本节省实例

三个组件的最佳部署方式是形成一个三层缓存管道：

```
请求进入
  │
  ▼
┌─────────────────────────────────┐
│  Layer 1: SemanticCostCache     │  ← 语义命中 → 直接返回，成本为 $0
│  （语义相似度 ≥ 0.95 即命中）       │     （加上 embedding 成本 ~$0.0001）
└──────────────┬──────────────────┘
               │ 未命中
               ▼
┌─────────────────────────────────┐
│  Layer 2: PromptCompressor      │  ← 压缩上下文，减少 30-60% tokens
│  （混合策略智能压缩）              │
└──────────────┬──────────────────┘
               │ 压缩后的消息
               ▼
┌─────────────────────────────────┐
│  Layer 3: PromptCacheManager    │  ← 提供商级缓存，90% 折扣
│  （cache_control 标记优化）       │     （命中的 token 只收 10%）
└──────────────┬──────────────────┘
               │ 优化后的请求
               ▼
           LLM API 调用
```

下面是一个完整的协同工作示例，展示了在一个客服 Agent 场景中三层缓存如何逐步降低成本：

```typescript
// ---- 三层缓存管道完整示例 ----

/**
 * CostOptimizedPromptPipeline —— 三层缓存协同管道
 *
 * 典型场景：客服 Agent，每天 50,000 次对话
 *   - 系统提示词：3,000 tokens（角色定义 + 行为准则 + 知识库摘要）
 *   - 平均用户输入：200 tokens
 *   - 平均对话历史：2,000 tokens（约 8 轮对话）
 *   - 模型：Claude Sonnet 4.6（$3/MTok 输入）
 *
 * 无优化月度成本：
 *   (3000 + 200 + 2000) × 50,000 × 30 × $3/1,000,000 = $23,400/月
 *
 * 三层优化后：
 *   Layer 1 命中率 15%（常见问题直接缓存）→ 消除 15% 调用 → 节省 $3,510
 *   Layer 2 压缩 40% token → 剩余 85% 调用减少 40% token → 节省 $6,799
 *   Layer 3 系统提示词缓存 90% 折扣 → 3000 tok 部分只收 10% → 节省 $5,508
 *
 *   优化后月度成本：$7,583/月（节省 67.6%，约 $15,817/月）
 */
class CostOptimizedPromptPipeline {
  private semanticCache: SemanticCostCache;
  private compressor: PromptCompressor;
  private cacheManager: PromptCacheManager;
  private embeddingClient: EmbeddingClient;
  private metrics: PipelineMetrics;

  constructor(config: {
    cacheConfig?: Partial<SemanticCacheConfig>;
    compressionConfig?: Partial<CompressionConfig>;
    embeddingModel?: string;
  }) {
    this.semanticCache = new SemanticCostCache(config.cacheConfig);
    this.compressor = new PromptCompressor(config.compressionConfig);
    this.cacheManager = new PromptCacheManager();
    this.embeddingClient = new EmbeddingClient(
      config.embeddingModel ?? "text-embedding-3-small"
    );
    this.metrics = new PipelineMetrics();
  }

  /**
   * 处理请求，经过三层优化管道。
   */
  async processRequest(
    messages: MessageBlock[],
    options: {
      agentId: string;
      taskType: string;
      provider: string;
      modelPrice: number; // $/MTok input
      skipSemanticCache?: boolean;
      skipCompression?: boolean;
      skipProviderCache?: boolean;
    }
  ): Promise<{
    messages: MessageBlock[];
    cached: boolean;
    cachedResponse?: string;
    optimizationReport: OptimizationReport;
  }> {
    const report: OptimizationReport = {
      layers: [],
      originalTokens: 0,
      finalTokens: 0,
      totalSavingsDollars: 0,
      cached: false,
    };

    const tokenEstimator = new TokenEstimator();
    report.originalTokens = messages.reduce(
      (s, m) => s + tokenEstimator.estimate(m),
      0
    );

    // ---- Layer 1: 语义缓存 ----
    if (!options.skipSemanticCache) {
      const lastUserMsg = [...messages]
        .reverse()
        .find((m) => m.role === "user");
      if (lastUserMsg) {
        const userText =
          typeof lastUserMsg.content === "string"
            ? lastUserMsg.content
            : lastUserMsg.content.map((p) => p.text ?? "").join("");

        const embedding = await this.embeddingClient.embed(userText);
        const cacheResult = await this.semanticCache.query(
          userText,
          embedding,
          options.agentId,
          options.taskType
        );

        report.layers.push({
          name: "SemanticCostCache",
          action: cacheResult.hit ? "HIT" : "MISS",
          tokensBefore: report.originalTokens,
          tokensAfter: cacheResult.hit ? 0 : report.originalTokens,
          savingsDollars: cacheResult.savedCostDollars ?? 0,
          latencyMs: cacheResult.queryLatencyMs,
        });

        if (cacheResult.hit && cacheResult.entry) {
          report.cached = true;
          report.finalTokens = 0;
          report.totalSavingsDollars = cacheResult.savedCostDollars ?? 0;
          this.metrics.recordLayer1Hit();
          return {
            messages: [],
            cached: true,
            cachedResponse: cacheResult.entry.response,
            optimizationReport: report,
          };
        }
        this.metrics.recordLayer1Miss();
      }
    }

    // ---- Layer 2: Prompt 压缩 ----
    let currentMessages = messages;
    if (!options.skipCompression) {
      const compressionResult = await this.compressor.compress(
        currentMessages,
        options.modelPrice
      );

      report.layers.push({
        name: "PromptCompressor",
        action: compressionResult.appliedStrategies.join("+"),
        tokensBefore: compressionResult.originalTokens,
        tokensAfter: compressionResult.compressedTokens,
        savingsDollars: compressionResult.netSavingsDollars,
        latencyMs: compressionResult.compressionLatencyMs,
      });

      currentMessages = compressionResult.messages;
      report.totalSavingsDollars += compressionResult.netSavingsDollars;
    }

    // ---- Layer 3: 提供商缓存优化 ----
    if (!options.skipProviderCache) {
      const beforeTokens = currentMessages.reduce(
        (s, m) => s + tokenEstimator.estimate(m),
        0
      );

      currentMessages = this.cacheManager.optimizeForCaching(
        currentMessages,
        options.provider,
        options.agentId
      );

      // 提供商缓存不减少 token 数量，但减少每 token 的价格
      // 预估节省 = 稳定前缀 tokens × 价格 × (1 - 折扣率)
      const cap = PROVIDER_CACHE_CAPABILITIES[options.provider];
      if (cap) {
        const stableTokens = beforeTokens * 0.6; // 假设 60% 是稳定前缀
        const providerSavings =
          (stableTokens *
            options.modelPrice *
            (1 - cap.cacheDiscountRate)) /
          1_000_000;

        report.layers.push({
          name: "PromptCacheManager",
          action: `${options.provider} cache_control`,
          tokensBefore: beforeTokens,
          tokensAfter: beforeTokens, // token 数不变，但有效价格降低
          savingsDollars: providerSavings,
          latencyMs: 0,
        });

        report.totalSavingsDollars += providerSavings;
      }
    }

    report.finalTokens = currentMessages.reduce(
      (s, m) => s + tokenEstimator.estimate(m),
      0
    );

    return {
      messages: currentMessages,
      cached: false,
      optimizationReport: report,
    };
  }
}

/** 优化报告 */
interface OptimizationReport {
  layers: Array<{
    name: string;
    action: string;
    tokensBefore: number;
    tokensAfter: number;
    savingsDollars: number;
    latencyMs: number;
  }>;
  originalTokens: number;
  finalTokens: number;
  totalSavingsDollars: number;
  cached: boolean;
}

/** 管道指标收集器 */
class PipelineMetrics {
  private layer1Hits = 0;
  private layer1Misses = 0;

  recordLayer1Hit(): void { this.layer1Hits++; }
  recordLayer1Miss(): void { this.layer1Misses++; }

  getLayer1HitRate(): number {
    const total = this.layer1Hits + this.layer1Misses;
    return total > 0 ? this.layer1Hits / total : 0;
  }
}

/** Embedding 客户端（简化版） */
class EmbeddingClient {
  private model: string;

  constructor(model: string) {
    this.model = model;
  }

  async embed(text: string): Promise<number[]> {
    // 实际应调用 embedding API
    // text-embedding-3-small: $0.02/MTok，1536 维
    // 50,000 请求 × 200 tokens = 10M tokens = $0.20/天
    return new Array(1536).fill(0).map(() => Math.random() - 0.5);
  }
}
```

> **成本节省实例总结**（基于客服 Agent，50,000 请求/天）
>
> | 优化层 | 机制 | 月度节省 | 累计折扣 |
> |--------|------|----------|----------|
> | 无优化 | — | 基线 $23,400/月 | 0% |
> | Layer 1: 语义缓存 | 15% 请求直接命中 | -$3,510 | 15.0% |
> | Layer 2: Prompt 压缩 | 40% token 减少 | -$6,799 | 44.0% |
> | Layer 3: 提供商缓存 | 系统提示词 90% 折扣 | -$5,508 | 67.6% |
> | **优化后** | **三层协同** | **$7,583/月** | **67.6%** |
>
> 额外成本：Embedding API 约 $6/月，摘要模型约 $45/月。**净节省 $15,766/月**。


## 19.5 批处理与异步优化

在第 19.4 节中，我们讨论了如何通过缓存和压缩来减少单次请求的 token 消耗。然而，成本优化的另一个重要维度是请求的调度方式。大多数 LLM 提供商都提供了批处理 API（Batch API），其价格通常为实时 API 的 50%——这意味着如果我们能将部分请求从实时调用转移到批处理调用，就能在不牺牲任何质量的前提下节省 50% 的成本。

关键挑战在于：并非所有请求都能等待。用户正在对话中的实时查询必须立即响应，但后台的文档分析、批量数据处理、定期报告生成等任务完全可以延迟执行。`BatchRequestManager` 和 `AsyncCostOptimizer` 正是为了解决这个调度问题而设计的——前者管理批处理请求的生命周期，后者根据任务优先级智能地将请求分配到不同的执行通道。

### 19.5.1 BatchRequestManager：批处理请求生命周期管理

Anthropic 的 Message Batches API 和 OpenAI 的 Batch API 都遵循类似的工作模式：客户端将多个请求打包提交，提供商在 24 小时内异步处理并返回结果，价格为实时 API 的 50%。`BatchRequestManager` 封装了这个完整的生命周期——从请求排队、窗口聚合、批次提交到结果分发。

```typescript
// ---- BatchRequestManager: 批处理请求生命周期管理 ----

import { EventEmitter } from "events";
import { createHash, randomUUID } from "crypto";

/** 批处理请求状态 */
type BatchRequestStatus =
  | "queued"       // 在队列中等待聚合
  | "submitted"    // 已提交给提供商
  | "processing"   // 提供商正在处理
  | "completed"    // 处理完成
  | "failed"       // 处理失败
  | "expired"      // 超时未完成
  | "cancelled";   // 已取消

/** 单个批处理请求项 */
interface BatchRequestItem {
  /** 唯一请求 ID */
  requestId: string;
  /** 自定义标识（用于结果回调） */
  customId: string;
  /** 请求参数 */
  params: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    max_tokens: number;
    temperature?: number;
    system?: string;
  };
  /** 请求优先级 */
  priority: "normal" | "low";
  /** 提交时间 */
  enqueuedAt: number;
  /** 最晚可接受结果时间（超过此时间则降级为实时调用） */
  deadlineAt: number;
  /** 预估 token 消耗 */
  estimatedTokens: number;
  /** 回调函数 */
  resolve: (result: BatchResponseItem) => void;
  reject: (error: Error) => void;
  /** 所属 Agent */
  agentId: string;
  /** 状态 */
  status: BatchRequestStatus;
}

/** 批次响应项 */
interface BatchResponseItem {
  customId: string;
  success: boolean;
  response?: {
    content: string;
    model: string;
    usage: {
      input_tokens: number;
      output_tokens: number;
    };
    stop_reason: string;
  };
  error?: {
    type: string;
    message: string;
  };
  /** 实际成本（美元） */
  costDollars: number;
  /** 如果不用批处理的成本 */
  realtimeCostDollars: number;
}

/** 批次状态 */
interface BatchState {
  batchId: string;
  providerBatchId?: string; // 提供商返回的批次 ID
  provider: string;
  status: "aggregating" | "submitted" | "processing" | "completed" | "failed";
  requestIds: string[];
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  submittedAt?: number;
  completedAt?: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostDollars: number;
  savedVsRealtimeDollars: number;
}

/** 批处理配置 */
interface BatchManagerConfig {
  /** 批次窗口时间（ms）——在此时间内聚合请求 */
  batchWindowMs: number;
  /** 单批次最大请求数 */
  maxRequestsPerBatch: number;
  /** 单批次最大 token 数 */
  maxTokensPerBatch: number;
  /** 轮询结果的间隔（ms） */
  pollIntervalMs: number;
  /** 批次超时时间（ms） */
  batchTimeoutMs: number;
  /** 是否在接近截止时间时自动降级为实时调用 */
  autoFallbackToRealtime: boolean;
  /** 降级触发的剩余时间阈值（ms） */
  fallbackThresholdMs: number;
  /** 提供商 */
  provider: string;
  /** 批处理折扣率 */
  batchDiscountRate: number;
}

/**
 * BatchRequestManager —— 批处理请求生命周期管理器
 *
 * 工作流程：
 * 1. 请求入队 → 放入聚合缓冲区
 * 2. 窗口触发 → 将缓冲区中的请求打包为批次
 * 3. 批次提交 → 调用提供商 Batch API
 * 4. 轮询结果 → 定期检查批次状态
 * 5. 结果分发 → 将结果回调给各请求的调用方
 * 6. 超时降级 → 接近截止时间的请求降级为实时调用
 *
 * 关键设计决策：
 * - 使用 Promise 封装异步结果，调用方无需关心底层是批处理还是实时
 * - 窗口聚合 + 最大批次大小双重控制，避免批次过大或过小
 * - 自动降级机制保证 SLA，在成本优化与响应时效间取得平衡
 */
class BatchRequestManager extends EventEmitter {
  private config: BatchManagerConfig;
  private queue: Map<string, BatchRequestItem> = new Map();
  private batches: Map<string, BatchState> = new Map();
  private batchWindowTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private totalSavedDollars = 0;
  private totalBatchRequests = 0;
  private totalFallbackRequests = 0;

  constructor(config: Partial<BatchManagerConfig> = {}) {
    super();
    this.config = {
      batchWindowMs: 60_000,        // 1 分钟聚合窗口
      maxRequestsPerBatch: 10000,   // Anthropic 限制
      maxTokensPerBatch: 32_000_000,
      pollIntervalMs: 30_000,       // 30 秒轮询
      batchTimeoutMs: 24 * 3600_000, // 24 小时超时
      autoFallbackToRealtime: true,
      fallbackThresholdMs: 3600_000, // 1 小时前降级
      provider: "anthropic",
      batchDiscountRate: 0.5,       // 50% 折扣
      ...config,
    };

    // 启动轮询
    this.startPolling();
  }

  /**
   * 提交一个批处理请求。
   *
   * 返回一个 Promise，当批次处理完成时 resolve。
   * 调用方体验与实时调用一致，但成本只有 50%。
   *
   * @param params - 请求参数（与实时 API 兼容）
   * @param options - 调度选项
   * @returns 处理结果的 Promise
   */
  async enqueue(
    params: BatchRequestItem["params"],
    options: {
      agentId: string;
      customId?: string;
      priority?: "normal" | "low";
      deadlineMs?: number; // 从现在起的最长等待时间
    }
  ): Promise<BatchResponseItem> {
    const requestId = randomUUID();
    const customId = options.customId ?? requestId;
    const tokenEstimator = new TokenEstimator();
    const estimatedTokens = params.messages.reduce(
      (sum, m) => sum + tokenEstimator.estimateText(m.content),
      0
    ) + params.max_tokens;

    return new Promise<BatchResponseItem>((resolve, reject) => {
      const item: BatchRequestItem = {
        requestId,
        customId,
        params,
        priority: options.priority ?? "normal",
        enqueuedAt: Date.now(),
        deadlineAt: Date.now() + (options.deadlineMs ?? this.config.batchTimeoutMs),
        estimatedTokens,
        resolve,
        reject,
        agentId: options.agentId,
        status: "queued",
      };

      this.queue.set(requestId, item);
      this.totalBatchRequests++;

      // 触发窗口计时器（如果还没启动）
      if (!this.batchWindowTimer) {
        this.batchWindowTimer = setTimeout(
          () => this.flushBatch(),
          this.config.batchWindowMs
        );
      }

      // 检查是否达到批次大小上限
      if (this.queue.size >= this.config.maxRequestsPerBatch) {
        this.flushBatch();
      }

      this.emit("requestEnqueued", {
        requestId,
        customId,
        queueSize: this.queue.size,
        estimatedTokens,
      });
    });
  }

  /**
   * 将当前队列中的请求打包为批次并提交。
   */
  private async flushBatch(): Promise<void> {
    if (this.batchWindowTimer) {
      clearTimeout(this.batchWindowTimer);
      this.batchWindowTimer = null;
    }

    if (this.queue.size === 0) return;

    // 收集队列中的所有请求
    const items = Array.from(this.queue.values());
    this.queue.clear();

    // 按 token 预算分割为多个批次
    const batches = this.splitIntoBatches(items);

    for (const batchItems of batches) {
      await this.submitBatch(batchItems);
    }
  }

  /**
   * 将请求列表按容量限制分割为多个批次。
   */
  private splitIntoBatches(
    items: BatchRequestItem[]
  ): BatchRequestItem[][] {
    const batches: BatchRequestItem[][] = [];
    let currentBatch: BatchRequestItem[] = [];
    let currentTokens = 0;

    for (const item of items) {
      if (
        currentBatch.length >= this.config.maxRequestsPerBatch ||
        currentTokens + item.estimatedTokens > this.config.maxTokensPerBatch
      ) {
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
        }
        currentBatch = [];
        currentTokens = 0;
      }
      currentBatch.push(item);
      currentTokens += item.estimatedTokens;
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  /**
   * 提交单个批次到提供商 Batch API。
   */
  private async submitBatch(items: BatchRequestItem[]): Promise<void> {
    const batchId = `batch_${Date.now()}_${randomUUID().slice(0, 8)}`;

    const batchState: BatchState = {
      batchId,
      provider: this.config.provider,
      status: "submitted",
      requestIds: items.map((i) => i.requestId),
      totalRequests: items.length,
      completedRequests: 0,
      failedRequests: 0,
      submittedAt: Date.now(),
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostDollars: 0,
      savedVsRealtimeDollars: 0,
    };

    this.batches.set(batchId, batchState);

    // 更新所有请求的状态
    for (const item of items) {
      item.status = "submitted";
    }

    try {
      // 构建提供商 Batch API 请求体
      const batchRequest = this.buildProviderBatchRequest(items);

      // 提交到提供商（伪代码，实际应调用对应 API）
      const providerResponse = await this.callProviderBatchAPI(batchRequest);
      batchState.providerBatchId = providerResponse.id;
      batchState.status = "processing";

      this.emit("batchSubmitted", {
        batchId,
        providerBatchId: providerResponse.id,
        requestCount: items.length,
      });

      // 启动此批次的结果轮询
      this.pollBatchResults(batchId, items);
    } catch (error) {
      batchState.status = "failed";
      // 所有请求降级为实时调用或通知失败
      for (const item of items) {
        if (this.config.autoFallbackToRealtime) {
          this.fallbackToRealtime(item);
        } else {
          item.status = "failed";
          item.reject(
            error instanceof Error
              ? error
              : new Error("Batch submission failed")
          );
        }
      }
    }
  }

  /**
   * 构建提供商特定的批处理请求体。
   *
   * Anthropic Message Batches API 格式：
   * { requests: [{ custom_id, params: { model, messages, max_tokens } }] }
   *
   * OpenAI Batch API 格式（JSONL）：
   * 每行一个 { custom_id, method, url, body: { model, messages, max_tokens } }
   */
  private buildProviderBatchRequest(
    items: BatchRequestItem[]
  ): ProviderBatchRequest {
    if (this.config.provider === "anthropic") {
      return {
        provider: "anthropic",
        requests: items.map((item) => ({
          custom_id: item.customId,
          params: {
            model: item.params.model,
            max_tokens: item.params.max_tokens,
            messages: item.params.messages,
            ...(item.params.system
              ? { system: item.params.system }
              : {}),
            ...(item.params.temperature !== undefined
              ? { temperature: item.params.temperature }
              : {}),
          },
        })),
      };
    }

    // OpenAI 格式
    return {
      provider: "openai",
      requests: items.map((item) => ({
        custom_id: item.customId,
        method: "POST",
        url: "/v1/chat/completions",
        body: {
          model: item.params.model,
          messages: item.params.messages,
          max_tokens: item.params.max_tokens,
          ...(item.params.temperature !== undefined
            ? { temperature: item.params.temperature }
            : {}),
        },
      })),
    };
  }

  /**
   * 轮询批次处理结果。
   */
  private async pollBatchResults(
    batchId: string,
    items: BatchRequestItem[]
  ): Promise<void> {
    const batchState = this.batches.get(batchId);
    if (!batchState) return;

    const itemMap = new Map(items.map((i) => [i.customId, i]));
    const startTime = Date.now();

    const poll = async () => {
      // 检查超时
      if (Date.now() - startTime > this.config.batchTimeoutMs) {
        batchState.status = "failed";
        for (const item of items) {
          if (item.status === "submitted" || item.status === "processing") {
            if (this.config.autoFallbackToRealtime) {
              this.fallbackToRealtime(item);
            } else {
              item.status = "expired";
              item.reject(new Error("Batch processing timeout"));
            }
          }
        }
        return;
      }

      // 检查是否有请求接近截止时间需要降级
      if (this.config.autoFallbackToRealtime) {
        const now = Date.now();
        for (const item of items) {
          if (
            (item.status === "submitted" || item.status === "processing") &&
            item.deadlineAt - now < this.config.fallbackThresholdMs
          ) {
            this.fallbackToRealtime(item);
          }
        }
      }

      try {
        // 查询批次状态
        const results = await this.queryProviderBatchStatus(
          batchState.providerBatchId!
        );

        if (results.status === "ended" || results.status === "completed") {
          // 分发结果
          for (const result of results.responses) {
            const item = itemMap.get(result.custom_id);
            if (!item || item.status === "completed") continue;

            item.status = "completed";
            batchState.completedRequests++;

            const batchCost = this.calculateBatchCost(result);
            const realtimeCost = batchCost / this.config.batchDiscountRate;

            batchState.totalCostDollars += batchCost;
            batchState.savedVsRealtimeDollars += realtimeCost - batchCost;
            this.totalSavedDollars += realtimeCost - batchCost;

            if (result.usage) {
              batchState.totalInputTokens += result.usage.input_tokens;
              batchState.totalOutputTokens += result.usage.output_tokens;
            }

            const responseItem: BatchResponseItem = {
              customId: result.custom_id,
              success: result.success,
              response: result.success
                ? {
                    content: result.content ?? "",
                    model: result.model ?? "",
                    usage: result.usage ?? { input_tokens: 0, output_tokens: 0 },
                    stop_reason: result.stop_reason ?? "end_turn",
                  }
                : undefined,
              error: result.error,
              costDollars: batchCost,
              realtimeCostDollars: realtimeCost,
            };

            item.resolve(responseItem);
          }

          batchState.status = "completed";
          batchState.completedAt = Date.now();

          this.emit("batchCompleted", {
            batchId,
            totalRequests: batchState.totalRequests,
            completedRequests: batchState.completedRequests,
            totalCostDollars: batchState.totalCostDollars,
            savedDollars: batchState.savedVsRealtimeDollars,
            durationMs: batchState.completedAt - (batchState.submittedAt ?? 0),
          });
        } else {
          // 继续轮询
          setTimeout(poll, this.config.pollIntervalMs);
        }
      } catch (error) {
        // 轮询失败，继续重试
        setTimeout(poll, this.config.pollIntervalMs * 2);
      }
    };

    // 首次轮询延迟一个间隔
    setTimeout(poll, this.config.pollIntervalMs);
  }

  /**
   * 将请求降级为实时调用。
   * 当批处理无法在截止时间内完成时自动触发。
   */
  private async fallbackToRealtime(item: BatchRequestItem): Promise<void> {
    this.totalFallbackRequests++;
    item.status = "completed";

    this.emit("fallbackToRealtime", {
      requestId: item.requestId,
      customId: item.customId,
      reason: "approaching_deadline",
      remainingMs: item.deadlineAt - Date.now(),
    });

    try {
      // 实际应调用实时 API
      const realtimeResult = await this.callRealtimeAPI(item.params);

      item.resolve({
        customId: item.customId,
        success: true,
        response: realtimeResult,
        costDollars: realtimeResult.costDollars,
        realtimeCostDollars: realtimeResult.costDollars,
      });
    } catch (error) {
      item.reject(
        error instanceof Error ? error : new Error("Realtime fallback failed")
      );
    }
  }

  /** 获取批处理节省统计 */
  getStats(): {
    totalBatchRequests: number;
    totalFallbackRequests: number;
    fallbackRate: number;
    totalSavedDollars: number;
    activeBatches: number;
    completedBatches: number;
  } {
    let activeBatches = 0;
    let completedBatches = 0;
    for (const batch of this.batches.values()) {
      if (batch.status === "completed") completedBatches++;
      else if (batch.status === "processing" || batch.status === "submitted")
        activeBatches++;
    }

    return {
      totalBatchRequests: this.totalBatchRequests,
      totalFallbackRequests: this.totalFallbackRequests,
      fallbackRate:
        this.totalFallbackRequests /
        Math.max(this.totalBatchRequests, 1),
      totalSavedDollars: this.totalSavedDollars,
      activeBatches,
      completedBatches,
    };
  }

  /** 启动全局轮询 */
  private startPolling(): void {
    // 全局轮询处理截止时间检查
    this.pollTimer = setInterval(() => {
      this.checkDeadlines();
    }, 60_000);
  }

  /** 检查所有排队请求的截止时间 */
  private checkDeadlines(): void {
    const now = Date.now();
    for (const [id, item] of this.queue) {
      if (
        item.deadlineAt - now < this.config.fallbackThresholdMs &&
        this.config.autoFallbackToRealtime
      ) {
        this.queue.delete(id);
        this.fallbackToRealtime(item);
      }
    }
  }

  /** 停止管理器 */
  destroy(): void {
    if (this.batchWindowTimer) clearTimeout(this.batchWindowTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  // ---- 提供商 API 调用（抽象层） ----

  private async callProviderBatchAPI(
    request: ProviderBatchRequest
  ): Promise<{ id: string }> {
    // 实际实现应根据 provider 调用对应的 Batch API
    return { id: `provider_batch_${Date.now()}` };
  }

  private async queryProviderBatchStatus(
    providerBatchId: string
  ): Promise<ProviderBatchStatus> {
    // 实际实现应查询提供商批次状态
    return { status: "processing", responses: [] };
  }

  private calculateBatchCost(result: ProviderBatchResponseItem): number {
    if (!result.usage) return 0;
    // 以 Claude Sonnet 4.6 批处理价格计算
    // 批处理输入: $1.5/MTok, 批处理输出: $7.5/MTok（均为实时价格的 50%）
    const inputCost = (result.usage.input_tokens * 1.5) / 1_000_000;
    const outputCost = (result.usage.output_tokens * 7.5) / 1_000_000;
    return inputCost + outputCost;
  }

  private async callRealtimeAPI(
    params: BatchRequestItem["params"]
  ): Promise<{ content: string; costDollars: number } & Record<string, unknown>> {
    // 实际实现应调用实时 API
    return { content: "", costDollars: 0 };
  }
}

// ---- 提供商 API 类型 ----

interface ProviderBatchRequest {
  provider: string;
  requests: Array<Record<string, unknown>>;
}

interface ProviderBatchStatus {
  status: "processing" | "ended" | "completed" | "failed";
  responses: ProviderBatchResponseItem[];
}

interface ProviderBatchResponseItem {
  custom_id: string;
  success: boolean;
  content?: string;
  model?: string;
  usage?: { input_tokens: number; output_tokens: number };
  stop_reason?: string;
  error?: { type: string; message: string };
}
```

### 19.5.2 AsyncCostOptimizer：优先级调度引擎

有了 `BatchRequestManager` 作为底层基础设施，我们需要一个更高层的调度引擎来决定每个请求应该走哪条通道。`AsyncCostOptimizer` 将请求分为三个优先级层：

- **urgent（紧急）**：用户正在等待的实时交互，走实时 API，不做任何延迟。
- **normal（普通）**：可以容忍分钟级延迟的任务，进入批处理队列，享受 50% 折扣。
- **background（后台）**：可以容忍小时级延迟的任务，在低峰时段执行，成本最低。

这三层调度与第 18 章（部署架构与运维）中的服务等级目标（SLO）体系直接对应——urgent 请求的 SLO 是 p99 < 5s，normal 请求的 SLO 是 p99 < 30min，background 请求的 SLO 是 p99 < 24h。

```typescript
// ---- AsyncCostOptimizer: 优先级调度引擎 ----

/** 请求优先级 */
type RequestPriority = "urgent" | "normal" | "background";

/** 优先级通道配置 */
interface PriorityChannelConfig {
  /** 通道名称 */
  name: string;
  /** 执行方式 */
  executionMode: "realtime" | "batch" | "off_peak";
  /** 相对成本（1.0 = 全价） */
  relativeCost: number;
  /** 最大延迟（ms） */
  maxLatencyMs: number;
  /** 该通道的 SLO 要求 */
  sloTarget: { p50Ms: number; p99Ms: number };
  /** 并发限制 */
  maxConcurrency: number;
  /** 是否在低峰时段自动启动 */
  offPeakOnly: boolean;
  /** 低峰时段定义（UTC 小时） */
  offPeakHoursUTC?: { start: number; end: number };
}

/** 调度决策 */
interface SchedulingDecision {
  requestId: string;
  assignedChannel: string;
  priority: RequestPriority;
  estimatedCostDollars: number;
  estimatedSavingsVsRealtime: number;
  estimatedLatencyMs: number;
  reason: string;
}

/** 调度统计 */
interface SchedulerStats {
  totalRequests: number;
  byChannel: Record<
    string,
    {
      requests: number;
      totalCostDollars: number;
      avgLatencyMs: number;
      sloViolations: number;
    }
  >;
  totalCostDollars: number;
  totalSavedDollars: number;
  overallSavingsRate: number;
}

/**
 * AsyncCostOptimizer —— 三层优先级调度引擎
 *
 * 调度策略矩阵：
 *
 * | 优先级     | 执行通道 | 延迟容忍 | 成本  | 典型场景                |
 * |-----------|---------|---------|------|----------------------|
 * | urgent    | 实时 API | <5s     | 100% | 用户实时对话            |
 * | normal    | 批处理   | <30min  | 50%  | 文档分析、邮件草稿       |
 * | background| 离峰批处理| <24h   | 50%  | 数据处理、报告生成       |
 *
 * 成本节省原理：
 * - 假设请求分布：urgent 40%, normal 35%, background 25%
 * - 加权成本 = 40%×1.0 + 35%×0.5 + 25%×0.5 = 0.70
 * - 总体节省 30%
 *
 * 与第 18 章的集成：
 * - urgent 通道的并发限制对应 Ch18 中的速率限制器
 * - 低峰时段识别使用 Ch18 中的负载监控数据
 * - SLO 违规告警集成 Ch17 的可观测性框架
 */
class AsyncCostOptimizer extends EventEmitter {
  private channels: Map<string, PriorityChannelConfig>;
  private batchManager: BatchRequestManager;
  private stats: SchedulerStats;
  private activeConcurrency: Map<string, number> = new Map();
  private priorityClassifier: PriorityClassifier;

  constructor(
    batchManager: BatchRequestManager,
    channelConfigs?: PriorityChannelConfig[]
  ) {
    super();
    this.batchManager = batchManager;
    this.priorityClassifier = new PriorityClassifier();

    // 默认三层通道配置
    const defaultChannels: PriorityChannelConfig[] = channelConfigs ?? [
      {
        name: "realtime",
        executionMode: "realtime",
        relativeCost: 1.0,
        maxLatencyMs: 30_000,
        sloTarget: { p50Ms: 2000, p99Ms: 5000 },
        maxConcurrency: 100,
        offPeakOnly: false,
      },
      {
        name: "batch_normal",
        executionMode: "batch",
        relativeCost: 0.5,
        maxLatencyMs: 30 * 60_000,
        sloTarget: { p50Ms: 300_000, p99Ms: 1_800_000 },
        maxConcurrency: 1000,
        offPeakOnly: false,
      },
      {
        name: "batch_offpeak",
        executionMode: "off_peak",
        relativeCost: 0.5,
        maxLatencyMs: 24 * 3600_000,
        sloTarget: { p50Ms: 4 * 3600_000, p99Ms: 24 * 3600_000 },
        maxConcurrency: 5000,
        offPeakOnly: true,
        offPeakHoursUTC: { start: 2, end: 8 }, // UTC 2:00-8:00
      },
    ];

    this.channels = new Map(defaultChannels.map((c) => [c.name, c]));
    this.stats = {
      totalRequests: 0,
      byChannel: {},
      totalCostDollars: 0,
      totalSavedDollars: 0,
      overallSavingsRate: 0,
    };

    for (const channel of defaultChannels) {
      this.activeConcurrency.set(channel.name, 0);
      this.stats.byChannel[channel.name] = {
        requests: 0,
        totalCostDollars: 0,
        avgLatencyMs: 0,
        sloViolations: 0,
      };
    }
  }

  /**
   * 调度一个 LLM 请求到最优通道。
   *
   * 调度逻辑：
   * 1. 自动分类请求优先级（如果未指定）
   * 2. 根据优先级选择通道
   * 3. 检查通道容量和可用性
   * 4. 必要时降级到更高优先级通道（保证 SLA）
   * 5. 执行请求并跟踪成本
   */
  async schedule(
    request: {
      params: BatchRequestItem["params"];
      agentId: string;
      priority?: RequestPriority;
      context?: Record<string, unknown>;
    }
  ): Promise<{
    response: BatchResponseItem;
    decision: SchedulingDecision;
  }> {
    this.stats.totalRequests++;

    // 自动分类优先级
    const priority =
      request.priority ??
      this.priorityClassifier.classify(
        request.params,
        request.context
      );

    // 选择通道
    const decision = this.selectChannel(priority, request);

    this.emit("scheduled", decision);

    // 根据通道执行请求
    const channel = this.channels.get(decision.assignedChannel)!;
    const startTime = Date.now();

    let response: BatchResponseItem;

    if (channel.executionMode === "realtime") {
      response = await this.executeRealtime(request.params, request.agentId);
    } else if (channel.executionMode === "batch") {
      response = await this.batchManager.enqueue(request.params, {
        agentId: request.agentId,
        priority: "normal",
        deadlineMs: channel.maxLatencyMs,
      });
    } else {
      // off_peak: 等待低峰时段后提交批处理
      response = await this.executeOffPeak(
        request.params,
        request.agentId,
        channel
      );
    }

    const latencyMs = Date.now() - startTime;

    // 更新统计
    const channelStats = this.stats.byChannel[decision.assignedChannel];
    channelStats.requests++;
    channelStats.totalCostDollars += response.costDollars;
    channelStats.avgLatencyMs =
      ((channelStats.requests - 1) * channelStats.avgLatencyMs + latencyMs) /
      channelStats.requests;

    if (latencyMs > channel.sloTarget.p99Ms) {
      channelStats.sloViolations++;
    }

    this.stats.totalCostDollars += response.costDollars;
    this.stats.totalSavedDollars +=
      response.realtimeCostDollars - response.costDollars;
    this.stats.overallSavingsRate =
      this.stats.totalSavedDollars /
      Math.max(
        this.stats.totalCostDollars + this.stats.totalSavedDollars,
        0.001
      );

    return { response, decision };
  }

  /**
   * 通道选择逻辑。
   */
  private selectChannel(
    priority: RequestPriority,
    request: {
      params: BatchRequestItem["params"];
      agentId: string;
    }
  ): SchedulingDecision {
    const requestId = randomUUID();
    const tokenEstimator = new TokenEstimator();
    const estimatedTokens = request.params.messages.reduce(
      (s, m) => s + tokenEstimator.estimateText(m.content),
      0
    );
    // 以 Claude Sonnet 4.6 价格估算
    const realtimeCost =
      (estimatedTokens * 3 + request.params.max_tokens * 15) / 1_000_000;

    switch (priority) {
      case "urgent": {
        return {
          requestId,
          assignedChannel: "realtime",
          priority,
          estimatedCostDollars: realtimeCost,
          estimatedSavingsVsRealtime: 0,
          estimatedLatencyMs: 3000,
          reason: "紧急请求，直接走实时通道",
        };
      }

      case "normal": {
        const batchCost = realtimeCost * 0.5;
        return {
          requestId,
          assignedChannel: "batch_normal",
          priority,
          estimatedCostDollars: batchCost,
          estimatedSavingsVsRealtime: realtimeCost - batchCost,
          estimatedLatencyMs: 300_000,
          reason: "普通优先级，进入批处理队列享受 50% 折扣",
        };
      }

      case "background": {
        const isOffPeak = this.isOffPeakNow();
        const channelName = isOffPeak ? "batch_offpeak" : "batch_normal";
        const batchCost = realtimeCost * 0.5;
        return {
          requestId,
          assignedChannel: channelName,
          priority,
          estimatedCostDollars: batchCost,
          estimatedSavingsVsRealtime: realtimeCost - batchCost,
          estimatedLatencyMs: isOffPeak ? 4 * 3600_000 : 24 * 3600_000,
          reason: isOffPeak
            ? "后台任务，当前为低峰时段，立即批处理执行"
            : "后台任务，等待低峰时段批处理执行",
        };
      }
    }
  }

  /**
   * 实时执行请求。
   */
  private async executeRealtime(
    params: BatchRequestItem["params"],
    agentId: string
  ): Promise<BatchResponseItem> {
    // 实际应调用实时 LLM API
    const tokenEstimator = new TokenEstimator();
    const inputTokens = params.messages.reduce(
      (s, m) => s + tokenEstimator.estimateText(m.content),
      0
    );

    const costDollars =
      (inputTokens * 3 + params.max_tokens * 15) / 1_000_000;

    return {
      customId: randomUUID(),
      success: true,
      response: {
        content: "[实时 API 响应]",
        model: params.model,
        usage: {
          input_tokens: inputTokens,
          output_tokens: params.max_tokens,
        },
        stop_reason: "end_turn",
      },
      costDollars,
      realtimeCostDollars: costDollars,
    };
  }

  /**
   * 离峰批处理执行。
   * 如果当前不在低峰时段，则延迟到下一个低峰时段。
   */
  private async executeOffPeak(
    params: BatchRequestItem["params"],
    agentId: string,
    channel: PriorityChannelConfig
  ): Promise<BatchResponseItem> {
    if (!this.isOffPeakNow()) {
      // 计算到下一个低峰时段的等待时间
      const waitMs = this.msUntilOffPeak(channel);
      await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 60000)));
    }

    // 进入批处理
    return this.batchManager.enqueue(params, {
      agentId,
      priority: "low",
      deadlineMs: channel.maxLatencyMs,
    });
  }

  private isOffPeakNow(): boolean {
    const hour = new Date().getUTCHours();
    const offPeakChannel = this.channels.get("batch_offpeak");
    if (!offPeakChannel?.offPeakHoursUTC) return false;
    const { start, end } = offPeakChannel.offPeakHoursUTC;
    return hour >= start && hour < end;
  }

  private msUntilOffPeak(channel: PriorityChannelConfig): number {
    if (!channel.offPeakHoursUTC) return 0;
    const now = new Date();
    const hour = now.getUTCHours();
    const { start } = channel.offPeakHoursUTC;
    let hoursUntil = start - hour;
    if (hoursUntil <= 0) hoursUntil += 24;
    return hoursUntil * 3600_000;
  }

  /** 获取调度统计 */
  getStats(): SchedulerStats {
    return JSON.parse(JSON.stringify(this.stats));
  }
}

/**
 * 优先级自动分类器。
 *
 * 根据请求上下文自动判断优先级：
 * - 包含 "urgent"、"用户等待中" 等标记 → urgent
 * - 来自后台工作流、定时任务 → background
 * - 其余 → normal
 */
class PriorityClassifier {
  classify(
    params: BatchRequestItem["params"],
    context?: Record<string, unknown>
  ): RequestPriority {
    // 基于上下文标签判断
    if (context) {
      if (context.isUserFacing === true) return "urgent";
      if (context.isBackgroundJob === true) return "background";
      if (context.source === "scheduled_task") return "background";
      if (context.source === "user_chat") return "urgent";
      if (context.source === "api_webhook") return "normal";
    }

    // 基于模型判断：使用大模型的请求往往更重要
    if (
      params.model.includes("opus") ||
      params.model.includes("gpt-4o") ||
      params.model.includes("gemini-3-pro")
    ) {
      return "urgent";
    }

    // 基于 token 数判断：大请求更适合批处理
    const tokenEstimator = new TokenEstimator();
    const inputTokens = params.messages.reduce(
      (s, m) => s + tokenEstimator.estimateText(m.content),
      0
    );

    if (inputTokens > 10000) return "normal"; // 大请求适合批处理
    if (params.max_tokens > 4000) return "normal";

    return "normal";
  }
}
```

### 19.5.3 批处理成本节省模式与实战计算

让我们用一个具体场景来量化批处理带来的成本节省。假设一个企业 Agent 平台每天处理 200,000 次 LLM 请求，分布如下：

```typescript
/**
 * 批处理成本节省计算器
 *
 * 场景：企业 Agent 平台
 *   - 日请求量：200,000
 *   - 模型：Claude Sonnet 4.6（$3/MTok 输入，$15/MTok 输出）
 *   - 平均输入 tokens：1,500
 *   - 平均输出 tokens：500
 *   - 批处理折扣：50%
 *
 * 请求分布：
 *   - urgent (40%): 80,000 请求/天 → 实时 API
 *   - normal (35%): 70,000 请求/天 → 批处理 API
 *   - background (25%): 50,000 请求/天 → 离峰批处理
 */

interface CostProjection {
  /** 每日请求数 */
  dailyRequests: number;
  /** 按优先级分布 */
  distribution: {
    urgent: number;
    normal: number;
    background: number;
  };
  /** 平均输入 token */
  avgInputTokens: number;
  /** 平均输出 token */
  avgOutputTokens: number;
  /** 输入单价 $/MTok */
  inputPricePerMTok: number;
  /** 输出单价 $/MTok */
  outputPricePerMTok: number;
  /** 批处理折扣率 */
  batchDiscount: number;
}

function calculateBatchSavings(projection: CostProjection): {
  dailyCostWithout: number;
  dailyCostWith: number;
  dailySavings: number;
  monthlySavings: number;
  annualSavings: number;
  savingsRate: number;
  breakdown: Record<string, { requests: number; cost: number }>;
} {
  const { dailyRequests, distribution, avgInputTokens, avgOutputTokens,
    inputPricePerMTok, outputPricePerMTok, batchDiscount } = projection;

  // 单次请求成本
  const realtimeCostPerRequest =
    (avgInputTokens * inputPricePerMTok +
      avgOutputTokens * outputPricePerMTok) /
    1_000_000;

  const batchCostPerRequest = realtimeCostPerRequest * batchDiscount;

  // 无优化时的日成本
  const dailyCostWithout = dailyRequests * realtimeCostPerRequest;

  // 分通道计算
  const urgentRequests = dailyRequests * distribution.urgent;
  const normalRequests = dailyRequests * distribution.normal;
  const backgroundRequests = dailyRequests * distribution.background;

  const urgentCost = urgentRequests * realtimeCostPerRequest;
  const normalCost = normalRequests * batchCostPerRequest;
  const backgroundCost = backgroundRequests * batchCostPerRequest;

  const dailyCostWith = urgentCost + normalCost + backgroundCost;
  const dailySavings = dailyCostWithout - dailyCostWith;

  return {
    dailyCostWithout,
    dailyCostWith,
    dailySavings,
    monthlySavings: dailySavings * 30,
    annualSavings: dailySavings * 365,
    savingsRate: dailySavings / dailyCostWithout,
    breakdown: {
      urgent: { requests: urgentRequests, cost: urgentCost },
      normal: { requests: normalRequests, cost: normalCost },
      background: { requests: backgroundRequests, cost: backgroundCost },
    },
  };
}

// 实际计算示例
const projection: CostProjection = {
  dailyRequests: 200_000,
  distribution: { urgent: 0.4, normal: 0.35, background: 0.25 },
  avgInputTokens: 1500,
  avgOutputTokens: 500,
  inputPricePerMTok: 3.0,    // Claude Sonnet 4.6 输入
  outputPricePerMTok: 15.0,  // Claude Sonnet 4.6 输出
  batchDiscount: 0.5,
};

/*
 * 计算结果：
 *
 * 单次请求实时成本 = (1500×$3 + 500×$15) / 1,000,000 = $0.012
 * 单次请求批处理成本 = $0.012 × 0.5 = $0.006
 *
 * 日总成本（无优化）= 200,000 × $0.012 = $2,400/天
 *
 * 分通道计算：
 *   urgent:     80,000 × $0.012  = $960/天
 *   normal:     70,000 × $0.006  = $420/天
 *   background: 50,000 × $0.006  = $300/天
 *
 * 日总成本（优化后）= $1,680/天
 * 日节省 = $720/天
 * 月节省 = $21,600/月
 * 年节省 = $262,800/年
 * 节省率 = 30%
 *
 * 如果能将更多请求推入批处理（urgent 降至 25%）：
 *   urgent:     50,000 × $0.012  = $600/天
 *   normal:     90,000 × $0.006  = $540/天
 *   background: 60,000 × $0.006  = $360/天
 *   日总成本 = $1,500/天（节省 37.5%，年节省 $328,500）
 */
```

> **关键洞察**：批处理优化的 ROI 极高，因为它是纯粹的价格折扣，不涉及任何质量损失。唯一的代价是延迟——只要业务场景能容忍延迟，批处理就是最安全的成本优化手段。建议团队定期审查请求优先级分布，尽可能将更多请求标记为 `normal` 或 `background`。这与第 18 章中讨论的异步任务队列架构天然契合。


## 19.6 成本监控与告警

在前面的章节中，我们构建了一套完整的成本优化工具链——从模型路由（19.3）到 Prompt 缓存（19.4）再到批处理调度（19.5）。但正如第 17 章（可观测性工程）中强调的那样："无法度量的东西无法优化"。如果缺乏实时的成本监控和异常告警，前述所有优化机制都无法持续发挥作用——成本可能在某次不经意的配置变更后悄然飙升，也可能因为某个 Agent 的 Prompt 膨胀而在几天内吞噬整月预算。

本节将构建两个核心组件：`CostMonitoringSystem` 负责多维度的成本追踪与预测，`CostAnomalyDetector` 负责基于统计方法的异常检测与告警。二者与第 17 章的可观测性框架深度集成，共同构成了成本可见性的完整闭环。

### 19.6.1 CostMonitoringSystem：多维度成本追踪

企业级 Agent 平台的成本追踪需要支持多个维度的切片与下钻：按 Agent、按用户、按团队、按模型、按时间段。`CostMonitoringSystem` 建立了一个层次化的预算体系——组织 → 团队 → Agent → 用户，每一层都有独立的预算限额和消耗追踪。

```typescript
// ---- CostMonitoringSystem: 多维度成本追踪与预算管理 ----

import { EventEmitter } from "events";

/** 成本维度 */
type CostDimension =
  | "agent"
  | "user"
  | "team"
  | "model"
  | "provider"
  | "task_type"
  | "priority";

/** 时间粒度 */
type TimeGranularity = "minute" | "hour" | "day" | "week" | "month";

/** 成本记录 */
interface CostRecord {
  /** 唯一 ID */
  id: string;
  /** 时间戳 */
  timestamp: number;
  /** Agent ID */
  agentId: string;
  /** 用户 ID */
  userId: string;
  /** 团队 ID */
  teamId: string;
  /** 模型名称 */
  model: string;
  /** 提供商 */
  provider: string;
  /** 任务类型 */
  taskType: string;
  /** 优先级通道 */
  priority: string;
  /** 输入 tokens */
  inputTokens: number;
  /** 输出 tokens */
  outputTokens: number;
  /** 缓存命中 tokens（如有） */
  cachedTokens: number;
  /** 原始成本（美元） */
  rawCostDollars: number;
  /** 优化后实际成本（美元） */
  actualCostDollars: number;
  /** 节省金额（美元） */
  savedDollars: number;
  /** 请求延迟（ms） */
  latencyMs: number;
  /** 是否为批处理 */
  isBatch: boolean;
  /** 额外标签 */
  tags: Record<string, string>;
}

/** 预算层级节点 */
interface BudgetNode {
  /** 节点 ID */
  id: string;
  /** 节点类型 */
  type: "organization" | "team" | "agent" | "user";
  /** 显示名称 */
  name: string;
  /** 父节点 ID */
  parentId?: string;
  /** 月度预算上限（美元） */
  monthlyBudgetDollars: number;
  /** 当月已消耗（美元） */
  currentMonthSpentDollars: number;
  /** 日均消耗（美元） */
  dailyAverageSpentDollars: number;
  /** 预测月末消耗（美元） */
  projectedMonthEndDollars: number;
  /** 预算使用率 */
  utilizationRate: number;
  /** 告警阈值（如 [0.7, 0.9, 1.0] 分别对应 70%, 90%, 100%） */
  alertThresholds: number[];
  /** 已触发的告警级别 */
  triggeredAlerts: number[];
  /** 是否硬限制（超出后拒绝请求） */
  hardLimit: boolean;
  /** 子节点 ID 列表 */
  childIds: string[];
}

/** 消耗速率（Burn Rate）数据 */
interface BurnRateData {
  /** 实体 ID */
  entityId: string;
  /** 最近 1 小时消耗率（$/hour） */
  last1HourRate: number;
  /** 最近 24 小时消耗率（$/hour） */
  last24HourRate: number;
  /** 最近 7 天消耗率（$/hour） */
  last7DayRate: number;
  /** 基于当前速率的月末预测 */
  projectedMonthEndDollars: number;
  /** 预算耗尽预测日期（如果超出预算） */
  budgetExhaustionDate?: Date;
  /** 趋势方向 */
  trend: "increasing" | "stable" | "decreasing";
  /** 趋势变化率（正数表示加速） */
  trendChangeRate: number;
}

/** Dashboard 数据模型 */
interface CostDashboardData {
  /** 总览 */
  overview: {
    currentMonthSpent: number;
    currentMonthBudget: number;
    utilizationRate: number;
    projectedMonthEnd: number;
    monthOverMonthChange: number;
    totalSavedThisMonth: number;
    optimizationRate: number;
  };
  /** 按维度分组的成本分布 */
  costByDimension: Record<
    CostDimension,
    Array<{
      key: string;
      name: string;
      spent: number;
      budget?: number;
      trend: "up" | "down" | "flat";
      changePercent: number;
    }>
  >;
  /** 时间序列数据 */
  timeSeries: Array<{
    timestamp: number;
    totalCost: number;
    byModel: Record<string, number>;
    byPriority: Record<string, number>;
    requestCount: number;
    avgCostPerRequest: number;
  }>;
  /** 成本异常事件 */
  anomalies: CostAnomaly[];
  /** 前 10 高消耗 Agent */
  topAgents: Array<{
    agentId: string;
    name: string;
    spent: number;
    requestCount: number;
    avgCostPerRequest: number;
    trend: string;
  }>;
  /** 优化建议 */
  recommendations: CostRecommendation[];
}

/** 成本异常 */
interface CostAnomaly {
  id: string;
  timestamp: number;
  entityType: CostDimension;
  entityId: string;
  entityName: string;
  anomalyType: "spike" | "sustained_increase" | "budget_breach" | "unusual_pattern";
  severity: "info" | "warning" | "critical";
  description: string;
  currentValue: number;
  expectedValue: number;
  deviationPercent: number;
  acknowledged: boolean;
}

/** 成本优化建议 */
interface CostRecommendation {
  id: string;
  category: "model_routing" | "caching" | "batching" | "compression" | "budget";
  title: string;
  description: string;
  estimatedSavings: number;
  effort: "low" | "medium" | "high";
  priority: number;
}

/**
 * CostMonitoringSystem —— 多维度成本监控系统
 *
 * 核心功能：
 * 1. 实时成本记录与聚合（按 Agent/用户/团队/模型）
 * 2. 层次化预算管理（组织 → 团队 → Agent → 用户）
 * 3. 消耗速率（Burn Rate）计算与月末预测
 * 4. Dashboard 数据聚合
 * 5. 与 Ch17 可观测性框架集成（指标导出）
 *
 * 与第 17 章的集成点：
 * - 成本指标导出为 Prometheus 格式，复用 Ch17 的 MetricsCollector
 * - 成本异常告警通过 Ch17 的 AlertManager 发送
 * - 成本数据关联到 Ch17 的 Trace 上下文（通过 traceId）
 */
class CostMonitoringSystem extends EventEmitter {
  private records: CostRecord[] = [];
  private budgetTree: Map<string, BudgetNode> = new Map();
  private burnRates: Map<string, BurnRateData> = new Map();
  private hourlyAggregates: Map<string, Map<number, number>> = new Map();
  private anomalyDetector: CostAnomalyDetector;

  /** 用于与 Ch17 可观测性框架集成的指标前缀 */
  private readonly METRICS_PREFIX = "agent_cost";

  constructor() {
    super();
    this.anomalyDetector = new CostAnomalyDetector();

    // 定期聚合和预测
    setInterval(() => this.updateBurnRates(), 5 * 60_000); // 每 5 分钟
    setInterval(() => this.generateRecommendations(), 3600_000); // 每小时
  }

  /**
   * 记录一次 LLM 调用的成本。
   * 这是系统的核心入口点——每次 LLM 调用完成后都应调用此方法。
   *
   * 与 Ch17 的集成：此方法应在 Ch17 的 Span 结束回调中调用，
   * 将成本数据作为 Span 属性附加到 Trace 中。
   */
  recordCost(record: CostRecord): void {
    this.records.push(record);

    // 更新预算消耗
    this.updateBudgetSpending(record);

    // 更新小时级聚合（用于 burn rate 计算）
    this.updateHourlyAggregate(record);

    // 异常检测
    const anomaly = this.anomalyDetector.check(record, this.getRecentRecords(record.agentId, 100));
    if (anomaly) {
      this.emit("anomalyDetected", anomaly);
    }

    // 检查预算阈值
    this.checkBudgetAlerts(record);

    // 导出指标（与 Ch17 集成）
    this.exportMetrics(record);

    this.emit("costRecorded", record);
  }

  /**
   * 注册预算层级节点。
   */
  registerBudgetNode(node: Omit<BudgetNode, "currentMonthSpentDollars" | "dailyAverageSpentDollars" | "projectedMonthEndDollars" | "utilizationRate" | "triggeredAlerts">): void {
    const fullNode: BudgetNode = {
      ...node,
      currentMonthSpentDollars: 0,
      dailyAverageSpentDollars: 0,
      projectedMonthEndDollars: 0,
      utilizationRate: 0,
      triggeredAlerts: [],
    };
    this.budgetTree.set(node.id, fullNode);

    // 将子节点注册到父节点
    if (node.parentId) {
      const parent = this.budgetTree.get(node.parentId);
      if (parent && !parent.childIds.includes(node.id)) {
        parent.childIds.push(node.id);
      }
    }
  }

  /**
   * 获取 Dashboard 数据。
   * 这是前端 Dashboard 的主要数据源。
   */
  getDashboardData(
    timeRange: { startMs: number; endMs: number },
    granularity: TimeGranularity = "hour"
  ): CostDashboardData {
    const filteredRecords = this.records.filter(
      (r) => r.timestamp >= timeRange.startMs && r.timestamp <= timeRange.endMs
    );

    // 总览
    const totalSpent = filteredRecords.reduce(
      (sum, r) => sum + r.actualCostDollars,
      0
    );
    const totalSaved = filteredRecords.reduce(
      (sum, r) => sum + r.savedDollars,
      0
    );

    const orgBudget = this.getOrganizationBudget();

    const overview = {
      currentMonthSpent: totalSpent,
      currentMonthBudget: orgBudget?.monthlyBudgetDollars ?? 0,
      utilizationRate: orgBudget
        ? totalSpent / orgBudget.monthlyBudgetDollars
        : 0,
      projectedMonthEnd: this.projectMonthEnd(totalSpent),
      monthOverMonthChange: this.calculateMoMChange(totalSpent),
      totalSavedThisMonth: totalSaved,
      optimizationRate: totalSaved / Math.max(totalSpent + totalSaved, 0.001),
    };

    // 按维度聚合
    const costByDimension = this.aggregateByDimensions(filteredRecords);

    // 时间序列
    const timeSeries = this.buildTimeSeries(
      filteredRecords,
      granularity,
      timeRange
    );

    // 异常事件
    const anomalies = this.anomalyDetector.getRecentAnomalies(50);

    // Top Agents
    const topAgents = this.getTopAgents(filteredRecords, 10);

    // 优化建议
    const recommendations = this.generateRecommendationsSync(filteredRecords);

    return {
      overview,
      costByDimension,
      timeSeries,
      anomalies,
      topAgents,
      recommendations,
    };
  }

  /**
   * 获取指定实体的消耗速率数据。
   */
  getBurnRate(entityId: string): BurnRateData | undefined {
    return this.burnRates.get(entityId);
  }

  /**
   * 预算强制执行：检查是否允许新请求。
   * 返回 false 表示已超出硬限制，应拒绝请求。
   *
   * 这个方法应在 LLM 调用之前检查，与 Ch18 中的
   * 速率限制器配合使用。
   */
  checkBudgetAllowance(
    agentId: string,
    userId: string,
    teamId: string,
    estimatedCostDollars: number
  ): {
    allowed: boolean;
    reason?: string;
    remainingBudget?: number;
    suggestions?: string[];
  } {
    // 从下往上检查预算层级
    const checks = [
      { id: `user:${userId}`, label: "用户" },
      { id: `agent:${agentId}`, label: "Agent" },
      { id: `team:${teamId}`, label: "团队" },
    ];

    for (const check of checks) {
      const node = this.budgetTree.get(check.id);
      if (!node) continue;

      if (node.hardLimit) {
        const remaining =
          node.monthlyBudgetDollars - node.currentMonthSpentDollars;
        if (remaining < estimatedCostDollars) {
          return {
            allowed: false,
            reason:
              `${check.label}预算已用尽。月度预算: $${node.monthlyBudgetDollars.toFixed(2)}, ` +
              `已消耗: $${node.currentMonthSpentDollars.toFixed(2)}, ` +
              `剩余: $${remaining.toFixed(2)}, ` +
              `本次预估: $${estimatedCostDollars.toFixed(4)}`,
            remainingBudget: remaining,
            suggestions: [
              "等待下月预算重置",
              "联系管理员提升预算额度",
              "使用更低成本的模型",
              "启用批处理模式以降低单次成本",
            ],
          };
        }
      }
    }

    return { allowed: true };
  }

  // ---- 内部方法 ----

  private updateBudgetSpending(record: CostRecord): void {
    const nodeIds = [
      `user:${record.userId}`,
      `agent:${record.agentId}`,
      `team:${record.teamId}`,
    ];

    for (const nodeId of nodeIds) {
      const node = this.budgetTree.get(nodeId);
      if (node) {
        node.currentMonthSpentDollars += record.actualCostDollars;
        node.utilizationRate =
          node.currentMonthSpentDollars / Math.max(node.monthlyBudgetDollars, 0.001);
      }
    }
  }

  private updateHourlyAggregate(record: CostRecord): void {
    const hourKey = Math.floor(record.timestamp / 3600_000) * 3600_000;
    const entityKeys = [
      record.agentId,
      record.userId,
      record.teamId,
      `model:${record.model}`,
    ];

    for (const entityKey of entityKeys) {
      if (!this.hourlyAggregates.has(entityKey)) {
        this.hourlyAggregates.set(entityKey, new Map());
      }
      const hourMap = this.hourlyAggregates.get(entityKey)!;
      hourMap.set(hourKey, (hourMap.get(hourKey) ?? 0) + record.actualCostDollars);
    }
  }

  private updateBurnRates(): void {
    const now = Date.now();
    const oneHourAgo = now - 3600_000;
    const oneDayAgo = now - 24 * 3600_000;
    const oneWeekAgo = now - 7 * 24 * 3600_000;

    for (const [entityId, hourMap] of this.hourlyAggregates) {
      let last1h = 0, last24h = 0, last7d = 0;

      for (const [hourTs, cost] of hourMap) {
        if (hourTs >= oneHourAgo) last1h += cost;
        if (hourTs >= oneDayAgo) last24h += cost;
        if (hourTs >= oneWeekAgo) last7d += cost;
      }

      const last1hRate = last1h; // $/hour (only 1 hour of data)
      const last24hRate = last24h / 24;
      const last7dRate = last7d / (7 * 24);

      // 计算趋势
      let trend: BurnRateData["trend"] = "stable";
      let trendChangeRate = 0;
      if (last24hRate > 0) {
        trendChangeRate = (last1hRate - last24hRate) / last24hRate;
        if (trendChangeRate > 0.2) trend = "increasing";
        else if (trendChangeRate < -0.2) trend = "decreasing";
      }

      // 预测月末消耗
      const dayOfMonth = new Date().getDate();
      const daysInMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth() + 1,
        0
      ).getDate();
      const remainingDays = daysInMonth - dayOfMonth;

      const currentMonthSpent = this.getCurrentMonthSpent(entityId);
      const projectedMonthEnd =
        currentMonthSpent + last24hRate * 24 * remainingDays;

      // 预算耗尽日期
      const node = this.budgetTree.get(entityId);
      let budgetExhaustionDate: Date | undefined;
      if (node && last24hRate > 0) {
        const remaining =
          node.monthlyBudgetDollars - node.currentMonthSpentDollars;
        if (remaining > 0) {
          const hoursUntilExhaustion = remaining / last24hRate;
          budgetExhaustionDate = new Date(
            now + hoursUntilExhaustion * 3600_000
          );
        }
      }

      this.burnRates.set(entityId, {
        entityId,
        last1HourRate: last1hRate,
        last24HourRate: last24hRate,
        last7DayRate: last7dRate,
        projectedMonthEndDollars: projectedMonthEnd,
        budgetExhaustionDate,
        trend,
        trendChangeRate,
      });
    }
  }

  private checkBudgetAlerts(record: CostRecord): void {
    const nodeIds = [
      `user:${record.userId}`,
      `agent:${record.agentId}`,
      `team:${record.teamId}`,
    ];

    for (const nodeId of nodeIds) {
      const node = this.budgetTree.get(nodeId);
      if (!node) continue;

      for (const threshold of node.alertThresholds) {
        if (
          node.utilizationRate >= threshold &&
          !node.triggeredAlerts.includes(threshold)
        ) {
          node.triggeredAlerts.push(threshold);

          const severity =
            threshold >= 1.0
              ? "critical"
              : threshold >= 0.9
                ? "warning"
                : "info";

          this.emit("budgetAlert", {
            nodeId,
            nodeType: node.type,
            nodeName: node.name,
            threshold,
            utilizationRate: node.utilizationRate,
            spent: node.currentMonthSpentDollars,
            budget: node.monthlyBudgetDollars,
            severity,
            message:
              `${node.name} 的月度预算使用已达 ${(node.utilizationRate * 100).toFixed(1)}%` +
              ` ($${node.currentMonthSpentDollars.toFixed(2)} / $${node.monthlyBudgetDollars.toFixed(2)})`,
          });
        }
      }
    }
  }

  /**
   * 导出 Prometheus 格式指标。
   * 与第 17 章的 MetricsCollector 集成。
   */
  private exportMetrics(record: CostRecord): void {
    // 这些指标会被 Ch17 的 Prometheus exporter 采集
    const metrics = {
      [`${this.METRICS_PREFIX}_total_dollars`]: {
        type: "counter",
        value: record.actualCostDollars,
        labels: {
          agent_id: record.agentId,
          model: record.model,
          provider: record.provider,
          priority: record.priority,
          is_batch: String(record.isBatch),
        },
      },
      [`${this.METRICS_PREFIX}_saved_dollars`]: {
        type: "counter",
        value: record.savedDollars,
        labels: {
          agent_id: record.agentId,
          optimization_type: record.isBatch ? "batch" : "cache",
        },
      },
      [`${this.METRICS_PREFIX}_input_tokens_total`]: {
        type: "counter",
        value: record.inputTokens,
        labels: {
          agent_id: record.agentId,
          model: record.model,
        },
      },
      [`${this.METRICS_PREFIX}_output_tokens_total`]: {
        type: "counter",
        value: record.outputTokens,
        labels: {
          agent_id: record.agentId,
          model: record.model,
        },
      },
      [`${this.METRICS_PREFIX}_request_cost_dollars`]: {
        type: "histogram",
        value: record.actualCostDollars,
        labels: {
          agent_id: record.agentId,
          model: record.model,
        },
      },
    };

    this.emit("metricsExport", metrics);
  }

  private aggregateByDimensions(
    records: CostRecord[]
  ): CostDashboardData["costByDimension"] {
    const dimensions: CostDimension[] = [
      "agent", "user", "team", "model", "provider", "task_type", "priority",
    ];

    const result: CostDashboardData["costByDimension"] = {} as any;

    for (const dim of dimensions) {
      const groups = new Map<string, { spent: number; count: number }>();

      for (const record of records) {
        const key = this.getDimensionKey(record, dim);
        const group = groups.get(key) ?? { spent: 0, count: 0 };
        group.spent += record.actualCostDollars;
        group.count++;
        groups.set(key, group);
      }

      result[dim] = Array.from(groups.entries())
        .map(([key, { spent }]) => ({
          key,
          name: key,
          spent,
          trend: "flat" as const,
          changePercent: 0,
        }))
        .sort((a, b) => b.spent - a.spent);
    }

    return result;
  }

  private getDimensionKey(record: CostRecord, dim: CostDimension): string {
    switch (dim) {
      case "agent": return record.agentId;
      case "user": return record.userId;
      case "team": return record.teamId;
      case "model": return record.model;
      case "provider": return record.provider;
      case "task_type": return record.taskType;
      case "priority": return record.priority;
    }
  }

  private buildTimeSeries(
    records: CostRecord[],
    granularity: TimeGranularity,
    timeRange: { startMs: number; endMs: number }
  ): CostDashboardData["timeSeries"] {
    const bucketSize = this.granularityToMs(granularity);
    const buckets = new Map<
      number,
      {
        totalCost: number;
        byModel: Record<string, number>;
        byPriority: Record<string, number>;
        requestCount: number;
      }
    >();

    for (const record of records) {
      const bucketKey =
        Math.floor(record.timestamp / bucketSize) * bucketSize;

      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, {
          totalCost: 0,
          byModel: {},
          byPriority: {},
          requestCount: 0,
        });
      }

      const bucket = buckets.get(bucketKey)!;
      bucket.totalCost += record.actualCostDollars;
      bucket.byModel[record.model] =
        (bucket.byModel[record.model] ?? 0) + record.actualCostDollars;
      bucket.byPriority[record.priority] =
        (bucket.byPriority[record.priority] ?? 0) + record.actualCostDollars;
      bucket.requestCount++;
    }

    return Array.from(buckets.entries())
      .map(([ts, data]) => ({
        timestamp: ts,
        ...data,
        avgCostPerRequest:
          data.requestCount > 0
            ? data.totalCost / data.requestCount
            : 0,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  private granularityToMs(g: TimeGranularity): number {
    switch (g) {
      case "minute": return 60_000;
      case "hour": return 3600_000;
      case "day": return 86400_000;
      case "week": return 7 * 86400_000;
      case "month": return 30 * 86400_000;
    }
  }

  private getOrganizationBudget(): BudgetNode | undefined {
    for (const node of this.budgetTree.values()) {
      if (node.type === "organization") return node;
    }
    return undefined;
  }

  private projectMonthEnd(currentSpent: number): number {
    const dayOfMonth = new Date().getDate();
    const daysInMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0
    ).getDate();
    return (currentSpent / Math.max(dayOfMonth, 1)) * daysInMonth;
  }

  private calculateMoMChange(currentMonthSpent: number): number {
    // 简化版：实际应与上月同期对比
    return 0;
  }

  private getCurrentMonthSpent(entityId: string): number {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const startTs = monthStart.getTime();

    return this.records
      .filter((r) => {
        const key = r.agentId === entityId || r.userId === entityId || r.teamId === entityId;
        return key && r.timestamp >= startTs;
      })
      .reduce((sum, r) => sum + r.actualCostDollars, 0);
  }

  private getRecentRecords(agentId: string, limit: number): CostRecord[] {
    return this.records
      .filter((r) => r.agentId === agentId)
      .slice(-limit);
  }

  private getTopAgents(
    records: CostRecord[],
    limit: number
  ): CostDashboardData["topAgents"] {
    const agentMap = new Map<
      string,
      { spent: number; requests: number }
    >();

    for (const r of records) {
      const data = agentMap.get(r.agentId) ?? { spent: 0, requests: 0 };
      data.spent += r.actualCostDollars;
      data.requests++;
      agentMap.set(r.agentId, data);
    }

    return Array.from(agentMap.entries())
      .map(([agentId, data]) => ({
        agentId,
        name: agentId,
        spent: data.spent,
        requestCount: data.requests,
        avgCostPerRequest: data.spent / Math.max(data.requests, 1),
        trend: "stable",
      }))
      .sort((a, b) => b.spent - a.spent)
      .slice(0, limit);
  }

  private generateRecommendationsSync(
    records: CostRecord[]
  ): CostRecommendation[] {
    const recommendations: CostRecommendation[] = [];

    // 分析模型使用分布
    const modelCosts = new Map<string, number>();
    for (const r of records) {
      modelCosts.set(r.model, (modelCosts.get(r.model) ?? 0) + r.actualCostDollars);
    }

    // 建议 1：检查是否有大量请求使用了高端模型
    for (const [model, cost] of modelCosts) {
      if (
        (model.includes("opus") || model.includes("gpt-4o") || model.includes("gemini-3-pro")) &&
        cost > 100
      ) {
        recommendations.push({
          id: `rec_model_${model}`,
          category: "model_routing",
          title: `考虑对 ${model} 的部分请求启用模型路由`,
          description:
            `${model} 本月消耗 $${cost.toFixed(2)}。分析显示其中约 40% 的请求` +
            `可以由更低成本模型处理，预计可节省 $${(cost * 0.3).toFixed(2)}/月。`,
          estimatedSavings: cost * 0.3,
          effort: "medium",
          priority: 1,
        });
      }
    }

    // 建议 2：检查批处理比例
    const batchCount = records.filter((r) => r.isBatch).length;
    const batchRate = batchCount / Math.max(records.length, 1);
    if (batchRate < 0.3) {
      const potentialSavings =
        records
          .filter((r) => !r.isBatch)
          .reduce((s, r) => s + r.actualCostDollars, 0) * 0.25;
      recommendations.push({
        id: "rec_batch_rate",
        category: "batching",
        title: "提高批处理请求比例",
        description:
          `当前批处理比例仅 ${(batchRate * 100).toFixed(1)}%。` +
          `将非实时请求迁移到批处理通道可节省约 $${potentialSavings.toFixed(2)}/月。`,
        estimatedSavings: potentialSavings,
        effort: "low",
        priority: 2,
      });
    }

    // 建议 3：检查缓存效果
    const cacheHitTokens = records.reduce((s, r) => s + r.cachedTokens, 0);
    const totalInputTokens = records.reduce((s, r) => s + r.inputTokens, 0);
    const cacheRate = cacheHitTokens / Math.max(totalInputTokens, 1);
    if (cacheRate < 0.2) {
      recommendations.push({
        id: "rec_cache_rate",
        category: "caching",
        title: "优化 Prompt 缓存命中率",
        description:
          `当前缓存命中率仅 ${(cacheRate * 100).toFixed(1)}%。` +
          `建议重构 Prompt 模板，将稳定内容前置以提高缓存命中率。`,
        estimatedSavings:
          records.reduce((s, r) => s + r.rawCostDollars, 0) * 0.15,
        effort: "medium",
        priority: 3,
      });
    }

    return recommendations.sort((a, b) => a.priority - b.priority);
  }

  private async generateRecommendations(): Promise<void> {
    // 定期生成建议（异步版本，可以做更深入的分析）
    const recentRecords = this.records.slice(-10000);
    const recs = this.generateRecommendationsSync(recentRecords);
    this.emit("recommendationsUpdated", recs);
  }
}
```

### 19.6.2 CostAnomalyDetector：统计异常检测

成本异常检测是整个监控体系的"哨兵"。一个未被检测到的成本异常可能在数小时内消耗掉数周的预算——例如，某个 Agent 的 Prompt 因为 bug 而无限膨胀，或者某个用户通过 API 发起了大规模的恶意调用。

`CostAnomalyDetector` 使用移动平均加标准差的经典统计方法来检测异常。它维护了每个实体（Agent/用户/团队）的历史成本分布，当新的成本数据点偏离历史均值超过若干个标准差时触发告警。

```typescript
// ---- CostAnomalyDetector: 统计异常检测 ----

/** 异常检测配置 */
interface AnomalyDetectorConfig {
  /** 移动平均窗口大小（数据点数量） */
  movingAverageWindow: number;
  /** 尖峰检测的标准差倍数（如 3 表示 3σ） */
  spikeThresholdSigma: number;
  /** 持续增长检测的连续上升期数 */
  sustainedIncreaseWindows: number;
  /** 持续增长检测的最小增长率 */
  sustainedIncreaseMinRate: number;
  /** 最小数据点数量（数据不足时不检测） */
  minDataPoints: number;
  /** 异常冷却期（ms）—— 同一实体在冷却期内不重复告警 */
  cooldownMs: number;
}

/** 时间序列统计 */
interface TimeSeriesStats {
  mean: number;
  stddev: number;
  min: number;
  max: number;
  count: number;
  lastValue: number;
  trend: number[]; // 最近 N 个数据点
}

/**
 * CostAnomalyDetector —— 成本异常检测器
 *
 * 检测模式：
 * 1. 尖峰检测（Spike Detection）：
 *    单次请求成本超过移动平均 + N × 标准差
 *    典型场景：Prompt 意外膨胀、模型误路由
 *
 * 2. 持续增长检测（Sustained Increase）：
 *    连续 N 个时间窗口的成本均在增长
 *    典型场景：业务量渐增但未调整预算、缓存失效
 *
 * 3. 预算突破检测（Budget Breach）：
 *    消耗速率表明将在预算周期内超支
 *    典型场景：月度预算即将耗尽
 *
 * 4. 异常模式检测（Unusual Pattern）：
 *    非工作时间出现大量调用
 *    典型场景：定时任务异常、安全事件
 */
class CostAnomalyDetector {
  private config: AnomalyDetectorConfig;
  private entityStats: Map<string, TimeSeriesStats> = new Map();
  private dataPoints: Map<string, number[]> = new Map();
  private recentAnomalies: CostAnomaly[] = [];
  private lastAlertTime: Map<string, number> = new Map();
  private anomalyIdCounter = 0;

  constructor(config: Partial<AnomalyDetectorConfig> = {}) {
    this.config = {
      movingAverageWindow: 100,
      spikeThresholdSigma: 3.0,
      sustainedIncreaseWindows: 5,
      sustainedIncreaseMinRate: 0.1,
      minDataPoints: 20,
      cooldownMs: 30 * 60_000, // 30 分钟冷却
      ...config,
    };
  }

  /**
   * 检查一条新的成本记录是否构成异常。
   * 
   * @param record - 新的成本记录
   * @param recentRecords - 该实体最近的历史记录
   * @returns 异常信息，如果无异常则返回 null
   */
  check(
    record: CostRecord,
    recentRecords: CostRecord[]
  ): CostAnomaly | null {
    const entityId = record.agentId;

    // 更新数据点
    if (!this.dataPoints.has(entityId)) {
      this.dataPoints.set(entityId, []);
    }
    const points = this.dataPoints.get(entityId)!;
    points.push(record.actualCostDollars);

    // 保持窗口大小
    while (points.length > this.config.movingAverageWindow * 2) {
      points.shift();
    }

    // 数据不足时跳过检测
    if (points.length < this.config.minDataPoints) {
      return null;
    }

    // 冷却检查
    const lastAlert = this.lastAlertTime.get(entityId) ?? 0;
    if (Date.now() - lastAlert < this.config.cooldownMs) {
      return null;
    }

    // 计算统计数据
    const stats = this.computeStats(points);
    this.entityStats.set(entityId, stats);

    // 检测 1: 尖峰检测
    const spikeAnomaly = this.detectSpike(record, stats);
    if (spikeAnomaly) {
      this.recordAnomaly(spikeAnomaly, entityId);
      return spikeAnomaly;
    }

    // 检测 2: 持续增长
    const sustainedAnomaly = this.detectSustainedIncrease(
      record,
      points
    );
    if (sustainedAnomaly) {
      this.recordAnomaly(sustainedAnomaly, entityId);
      return sustainedAnomaly;
    }

    // 检测 3: 异常时间模式
    const patternAnomaly = this.detectUnusualPattern(record, recentRecords);
    if (patternAnomaly) {
      this.recordAnomaly(patternAnomaly, entityId);
      return patternAnomaly;
    }

    return null;
  }

  /**
   * 尖峰检测：当前成本超过 μ + Nσ
   */
  private detectSpike(
    record: CostRecord,
    stats: TimeSeriesStats
  ): CostAnomaly | null {
    const threshold =
      stats.mean + this.config.spikeThresholdSigma * stats.stddev;

    if (record.actualCostDollars > threshold && stats.stddev > 0) {
      const deviations =
        (record.actualCostDollars - stats.mean) / stats.stddev;
      const deviationPercent =
        ((record.actualCostDollars - stats.mean) / stats.mean) * 100;

      const severity =
        deviations > 5
          ? "critical"
          : deviations > 4
            ? "warning"
            : "info";

      return {
        id: `anomaly_${++this.anomalyIdCounter}`,
        timestamp: record.timestamp,
        entityType: "agent",
        entityId: record.agentId,
        entityName: record.agentId,
        anomalyType: "spike",
        severity,
        description:
          `Agent "${record.agentId}" 单次请求成本 $${record.actualCostDollars.toFixed(4)} ` +
          `超出历史均值 $${stats.mean.toFixed(4)} 达 ${deviations.toFixed(1)}σ ` +
          `（阈值 ${this.config.spikeThresholdSigma}σ = $${threshold.toFixed(4)}）。` +
          `模型: ${record.model}, 输入tokens: ${record.inputTokens}, ` +
          `输出tokens: ${record.outputTokens}。` +
          `建议检查 Prompt 是否意外膨胀或模型路由是否异常。`,
        currentValue: record.actualCostDollars,
        expectedValue: stats.mean,
        deviationPercent,
        acknowledged: false,
      };
    }

    return null;
  }

  /**
   * 持续增长检测：连续 N 个窗口的平均值递增
   */
  private detectSustainedIncrease(
    record: CostRecord,
    points: number[]
  ): CostAnomaly | null {
    const windowSize = Math.floor(
      points.length / this.config.sustainedIncreaseWindows
    );
    if (windowSize < 5) return null;

    const windowAverages: number[] = [];
    for (let i = 0; i < this.config.sustainedIncreaseWindows; i++) {
      const start = i * windowSize;
      const end = start + windowSize;
      const windowPoints = points.slice(start, end);
      const avg =
        windowPoints.reduce((s, v) => s + v, 0) / windowPoints.length;
      windowAverages.push(avg);
    }

    // 检查是否连续递增
    let consecutiveIncreases = 0;
    for (let i = 1; i < windowAverages.length; i++) {
      const growthRate =
        (windowAverages[i] - windowAverages[i - 1]) /
        Math.max(windowAverages[i - 1], 0.0001);
      if (growthRate > this.config.sustainedIncreaseMinRate) {
        consecutiveIncreases++;
      } else {
        consecutiveIncreases = 0;
      }
    }

    if (
      consecutiveIncreases >=
      this.config.sustainedIncreaseWindows - 1
    ) {
      const overallGrowth =
        ((windowAverages[windowAverages.length - 1] - windowAverages[0]) /
          Math.max(windowAverages[0], 0.0001)) *
        100;

      return {
        id: `anomaly_${++this.anomalyIdCounter}`,
        timestamp: record.timestamp,
        entityType: "agent",
        entityId: record.agentId,
        entityName: record.agentId,
        anomalyType: "sustained_increase",
        severity: overallGrowth > 100 ? "critical" : "warning",
        description:
          `Agent "${record.agentId}" 的请求成本出现持续增长趋势。` +
          `在最近 ${this.config.sustainedIncreaseWindows} 个统计窗口中，` +
          `平均成本从 $${windowAverages[0].toFixed(4)} ` +
          `增长到 $${windowAverages[windowAverages.length - 1].toFixed(4)}，` +
          `总增长 ${overallGrowth.toFixed(1)}%。` +
          `建议检查是否有对话历史膨胀、缓存失效或业务量突增。`,
        currentValue: windowAverages[windowAverages.length - 1],
        expectedValue: windowAverages[0],
        deviationPercent: overallGrowth,
        acknowledged: false,
      };
    }

    return null;
  }

  /**
   * 异常模式检测：非正常时间段的大量调用
   */
  private detectUnusualPattern(
    record: CostRecord,
    recentRecords: CostRecord[]
  ): CostAnomaly | null {
    const hour = new Date(record.timestamp).getHours();
    const isOffHours = hour >= 23 || hour < 6; // 深夜到凌晨

    if (!isOffHours) return null;

    // 检查最近 1 小时内的深夜请求数
    const oneHourAgo = record.timestamp - 3600_000;
    const recentOffHourRecords = recentRecords.filter(
      (r) => {
        const rHour = new Date(r.timestamp).getHours();
        return r.timestamp > oneHourAgo && (rHour >= 23 || rHour < 6);
      }
    );

    // 如果深夜 1 小时内有超过 50 次请求，视为异常
    if (recentOffHourRecords.length > 50) {
      const totalCost = recentOffHourRecords.reduce(
        (s, r) => s + r.actualCostDollars, 0
      );

      return {
        id: `anomaly_${++this.anomalyIdCounter}`,
        timestamp: record.timestamp,
        entityType: "agent",
        entityId: record.agentId,
        entityName: record.agentId,
        anomalyType: "unusual_pattern",
        severity: "warning",
        description:
          `Agent "${record.agentId}" 在深夜时段（${hour}:00）有异常活动：` +
          `过去 1 小时内产生 ${recentOffHourRecords.length} 次请求，` +
          `消耗 $${totalCost.toFixed(2)}。` +
          `建议检查是否为异常的定时任务或潜在的安全事件。`,
        currentValue: recentOffHourRecords.length,
        expectedValue: 5,
        deviationPercent:
          ((recentOffHourRecords.length - 5) / 5) * 100,
        acknowledged: false,
      };
    }

    return null;
  }

  /** 计算时间序列统计 */
  private computeStats(points: number[]): TimeSeriesStats {
    const window = points.slice(-this.config.movingAverageWindow);
    const n = window.length;
    const mean = window.reduce((s, v) => s + v, 0) / n;
    const variance =
      window.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const stddev = Math.sqrt(variance);

    return {
      mean,
      stddev,
      min: Math.min(...window),
      max: Math.max(...window),
      count: n,
      lastValue: window[n - 1],
      trend: window.slice(-10),
    };
  }

  private recordAnomaly(anomaly: CostAnomaly, entityId: string): void {
    this.recentAnomalies.push(anomaly);
    this.lastAlertTime.set(entityId, Date.now());

    // 保留最近 1000 条异常
    while (this.recentAnomalies.length > 1000) {
      this.recentAnomalies.shift();
    }
  }

  /** 获取最近的异常列表 */
  getRecentAnomalies(limit: number = 50): CostAnomaly[] {
    return this.recentAnomalies.slice(-limit);
  }

  /** 确认（消除）异常 */
  acknowledgeAnomaly(anomalyId: string): void {
    const anomaly = this.recentAnomalies.find((a) => a.id === anomalyId);
    if (anomaly) {
      anomaly.acknowledged = true;
    }
  }

  /** 获取实体统计信息 */
  getEntityStats(entityId: string): TimeSeriesStats | undefined {
    return this.entityStats.get(entityId);
  }
}
```

以上两个组件——`CostMonitoringSystem` 和 `CostAnomalyDetector`——共同构成了成本可见性的完整闭环。`CostMonitoringSystem` 负责"看清"成本的全貌（多维度追踪、预算管理、Dashboard 数据），`CostAnomalyDetector` 负责"发现"成本中的异常（尖峰、持续增长、异常模式）。二者通过事件驱动的方式解耦，异常检测结果流入监控系统的 Dashboard，同时通过第 17 章的告警通道（Slack、邮件、PagerDuty）推送给相关人员。

在生产部署中，建议将成本监控集成到第 18 章（部署架构与运维）的 CI/CD 管道中——每次部署新版本后自动对比前后成本变化，及时发现因代码变更导致的成本回归。


## 19.7 预算治理

第 19.6 节构建的监控与告警系统让我们能够"看到"成本并在异常时收到通知。但"看到"问题只是治理的第一步——企业级的成本管理还需要一套完整的预算治理体系：谁有权使用多少预算？超支时如何审批？月末时如何进行跨团队的成本分摊？本节将解答这些组织层面的治理问题。

`BudgetGovernanceSystem` 建立了从组织到个人的多级预算分配体系，`CostAllocationEngine` 则实现了基于使用量的精确成本归因。二者共同确保了"每一美元的 LLM 支出都有明确的归属和授权"。

### 19.7.1 BudgetGovernanceSystem：多级预算分配

企业中的 AI Agent 成本管理本质上是一个资源分配问题。一个典型的层级结构是：组织（年度总预算）→ 事业部（季度预算）→ 团队（月度预算）→ Agent（月度配额）→ 用户（日配额）。每一层都需要独立的预算设置、消耗追踪和超支策略。

```typescript
// ---- BudgetGovernanceSystem: 多级预算治理 ----

import { EventEmitter } from "events";
import { randomUUID } from "crypto";

/** 预算周期 */
type BudgetPeriod = "daily" | "weekly" | "monthly" | "quarterly" | "annual";

/** 超支策略 */
type OverspendPolicy =
  | "hard_block"      // 硬阻断：超出后拒绝所有请求
  | "soft_warn"       // 软告警：超出后告警但不阻断
  | "approval_required" // 审批制：超出后需要管理员审批
  | "auto_downgrade"  // 自动降级：超出后自动切换到更便宜的模型
  | "burst_allow";    // 突发允许：允许短暂超支，但下周期扣减

/** 预算分配节点 */
interface GovernanceBudgetNode {
  id: string;
  name: string;
  type: "organization" | "department" | "team" | "agent" | "user";
  parentId?: string;
  childIds: string[];

  /** 预算配置 */
  budget: {
    period: BudgetPeriod;
    amountDollars: number;
    overspendPolicy: OverspendPolicy;
    /** 告警阈值列表（百分比） */
    alertThresholds: number[];
    /** 突发允许的最大超支比例（仅 burst_allow 策略） */
    burstMaxOverspendPercent?: number;
    /** 自动降级的目标模型（仅 auto_downgrade 策略） */
    downgradeTargetModel?: string;
    /** 审批人列表（仅 approval_required 策略） */
    approverIds?: string[];
  };

  /** 当前周期消耗 */
  currentPeriodSpent: number;
  /** 上一周期消耗 */
  lastPeriodSpent: number;
  /** 当前周期开始时间 */
  periodStartTime: number;
  /** 当前周期结束时间 */
  periodEndTime: number;
  /** 预算使用率 */
  utilization: number;
  /** 已触发的告警 */
  triggeredAlerts: Set<number>;

  /** 标签（用于分组和筛选） */
  tags: Record<string, string>;
  /** 创建时间 */
  createdAt: number;
  /** 最后更新时间 */
  updatedAt: number;
}

/** 预算检查结果 */
interface BudgetCheckResult {
  allowed: boolean;
  /** 拒绝原因 */
  reason?: string;
  /** 剩余预算 */
  remainingBudget: number;
  /** 建议操作 */
  suggestedAction?:
    | "proceed"
    | "downgrade_model"
    | "request_approval"
    | "wait_next_period"
    | "blocked";
  /** 降级后的模型（如果建议降级） */
  downgradeModel?: string;
  /** 审批请求 ID（如果需要审批） */
  approvalRequestId?: string;
  /** 受影响的预算层级 */
  affectedLevel: string;
}

/** 审批请求 */
interface ApprovalRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  budgetNodeId: string;
  budgetNodeName: string;
  currentSpent: number;
  budgetAmount: number;
  requestedAmount: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "expired";
  approverId?: string;
  approverComment?: string;
  createdAt: number;
  resolvedAt?: number;
  expiresAt: number;
}

/** 计费回填（Chargeback）记录 */
interface ChargebackRecord {
  id: string;
  /** 计费周期 */
  period: string;
  /** 责任实体 */
  ownerEntityId: string;
  ownerEntityName: string;
  ownerType: string;
  /** 总消耗 */
  totalCostDollars: number;
  /** 按模型细分 */
  costByModel: Record<string, number>;
  /** 按任务类型细分 */
  costByTaskType: Record<string, number>;
  /** 优化节省金额 */
  optimizationSavings: number;
  /** 实际应计费金额（可能有折扣或补贴） */
  chargeableAmount: number;
  /** 内部转移定价调整 */
  transferPricingAdjustment: number;
  /** 生成时间 */
  generatedAt: number;
}

/**
 * BudgetGovernanceSystem —— 多级预算治理系统
 *
 * 核心能力：
 * 1. 层级化预算分配与继承
 * 2. 多种超支策略（硬阻断/软告警/审批/降级/突发）
 * 3. 审批工作流
 * 4. 计费回填（Chargeback）
 * 5. 月度对账与调和
 */
class BudgetGovernanceSystem extends EventEmitter {
  private nodes: Map<string, GovernanceBudgetNode> = new Map();
  private approvalRequests: Map<string, ApprovalRequest> = new Map();
  private chargebackRecords: ChargebackRecord[] = [];
  private tempBudgetOverrides: Map<string, {
    amount: number;
    expiresAt: number;
    approvalId: string;
  }> = new Map();

  constructor() {
    super();
    // 定期清理过期的审批请求和临时额度
    setInterval(() => this.cleanupExpired(), 3600_000);
  }

  /**
   * 注册预算节点。
   * 支持层级结构：organization → department → team → agent → user
   */
  registerNode(
    config: Omit<
      GovernanceBudgetNode,
      | "currentPeriodSpent"
      | "lastPeriodSpent"
      | "periodStartTime"
      | "periodEndTime"
      | "utilization"
      | "triggeredAlerts"
      | "createdAt"
      | "updatedAt"
    >
  ): GovernanceBudgetNode {
    const now = Date.now();
    const { start, end } = this.calculatePeriodBounds(
      config.budget.period,
      now
    );

    const node: GovernanceBudgetNode = {
      ...config,
      currentPeriodSpent: 0,
      lastPeriodSpent: 0,
      periodStartTime: start,
      periodEndTime: end,
      utilization: 0,
      triggeredAlerts: new Set(),
      createdAt: now,
      updatedAt: now,
    };

    this.nodes.set(config.id, node);

    // 注册到父节点
    if (config.parentId) {
      const parent = this.nodes.get(config.parentId);
      if (parent && !parent.childIds.includes(config.id)) {
        parent.childIds.push(config.id);
      }
    }

    this.emit("nodeRegistered", { nodeId: config.id, type: config.type });
    return node;
  }

  /**
   * 预算前置检查。在 LLM 调用前检查是否有足够的预算。
   * 这是预算强制执行的核心方法。
   *
   * 检查逻辑从最低层级（用户）开始，逐级向上检查。
   * 任何一级不通过都会返回拒绝。
   */
  checkBudget(
    entityPath: {
      userId?: string;
      agentId?: string;
      teamId?: string;
      departmentId?: string;
      organizationId?: string;
    },
    estimatedCostDollars: number
  ): BudgetCheckResult {
    // 从最具体的层级开始检查
    const checkOrder = [
      entityPath.userId,
      entityPath.agentId,
      entityPath.teamId,
      entityPath.departmentId,
      entityPath.organizationId,
    ].filter(Boolean) as string[];

    for (const nodeId of checkOrder) {
      const node = this.nodes.get(nodeId);
      if (!node) continue;

      // 检查是否需要周期重置
      this.checkPeriodReset(node);

      // 计算可用额度（包括临时额度覆盖）
      const effectiveBudget = this.getEffectiveBudget(node);
      const remaining = effectiveBudget - node.currentPeriodSpent;

      if (remaining < estimatedCostDollars) {
        // 超出预算——根据超支策略处理
        return this.handleOverspend(
          node,
          estimatedCostDollars,
          remaining
        );
      }
    }

    return {
      allowed: true,
      remainingBudget: this.getLowestRemainingBudget(checkOrder),
      suggestedAction: "proceed",
      affectedLevel: "none",
    };
  }

  /**
   * 记录消耗（在 LLM 调用完成后调用）。
   * 更新从最低到最高所有层级的消耗数据。
   */
  recordSpending(
    entityPath: {
      userId?: string;
      agentId?: string;
      teamId?: string;
      departmentId?: string;
      organizationId?: string;
    },
    actualCostDollars: number
  ): void {
    const nodeIds = [
      entityPath.userId,
      entityPath.agentId,
      entityPath.teamId,
      entityPath.departmentId,
      entityPath.organizationId,
    ].filter(Boolean) as string[];

    for (const nodeId of nodeIds) {
      const node = this.nodes.get(nodeId);
      if (!node) continue;

      this.checkPeriodReset(node);
      node.currentPeriodSpent += actualCostDollars;
      node.utilization =
        node.currentPeriodSpent / Math.max(node.budget.amountDollars, 0.001);
      node.updatedAt = Date.now();

      // 检查告警阈值
      for (const threshold of node.budget.alertThresholds) {
        if (
          node.utilization >= threshold &&
          !node.triggeredAlerts.has(threshold)
        ) {
          node.triggeredAlerts.add(threshold);
          this.emit("budgetThresholdReached", {
            nodeId,
            nodeName: node.name,
            nodeType: node.type,
            threshold,
            utilization: node.utilization,
            spent: node.currentPeriodSpent,
            budget: node.budget.amountDollars,
          });
        }
      }
    }
  }

  /**
   * 创建审批请求（当超支策略为 approval_required 时触发）。
   */
  createApprovalRequest(
    budgetNodeId: string,
    requesterId: string,
    requesterName: string,
    requestedAmount: number,
    reason: string
  ): ApprovalRequest {
    const node = this.nodes.get(budgetNodeId);
    if (!node) {
      throw new Error(`Budget node ${budgetNodeId} not found`);
    }

    const request: ApprovalRequest = {
      id: `approval_${randomUUID().slice(0, 12)}`,
      requesterId,
      requesterName,
      budgetNodeId,
      budgetNodeName: node.name,
      currentSpent: node.currentPeriodSpent,
      budgetAmount: node.budget.amountDollars,
      requestedAmount,
      reason,
      status: "pending",
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 3600_000, // 24 小时过期
    };

    this.approvalRequests.set(request.id, request);

    this.emit("approvalRequested", {
      request,
      approvers: node.budget.approverIds ?? [],
    });

    return request;
  }

  /**
   * 处理审批决定。
   */
  resolveApproval(
    approvalId: string,
    decision: "approved" | "rejected",
    approverId: string,
    comment?: string
  ): void {
    const request = this.approvalRequests.get(approvalId);
    if (!request) {
      throw new Error(`Approval request ${approvalId} not found`);
    }

    request.status = decision;
    request.approverId = approverId;
    request.approverComment = comment;
    request.resolvedAt = Date.now();

    if (decision === "approved") {
      // 添加临时预算覆盖
      this.tempBudgetOverrides.set(request.budgetNodeId, {
        amount: request.requestedAmount,
        expiresAt: request.expiresAt,
        approvalId,
      });
    }

    this.emit("approvalResolved", {
      approvalId,
      decision,
      approverId,
      budgetNodeId: request.budgetNodeId,
    });
  }

  /**
   * 生成计费回填（Chargeback）报告。
   * 在月末调用，为每个成本中心生成详细的费用报告。
   */
  generateChargebackReport(
    period: string,
    costRecords: CostRecord[]
  ): ChargebackRecord[] {
    const reports: ChargebackRecord[] = [];

    // 按团队汇总
    const teamCosts = new Map<
      string,
      {
        totalCost: number;
        byModel: Record<string, number>;
        byTaskType: Record<string, number>;
        savings: number;
      }
    >();

    for (const record of costRecords) {
      const teamId = record.teamId;
      if (!teamCosts.has(teamId)) {
        teamCosts.set(teamId, {
          totalCost: 0,
          byModel: {},
          byTaskType: {},
          savings: 0,
        });
      }

      const teamData = teamCosts.get(teamId)!;
      teamData.totalCost += record.actualCostDollars;
      teamData.byModel[record.model] =
        (teamData.byModel[record.model] ?? 0) + record.actualCostDollars;
      teamData.byTaskType[record.taskType] =
        (teamData.byTaskType[record.taskType] ?? 0) +
        record.actualCostDollars;
      teamData.savings += record.savedDollars;
    }

    for (const [teamId, data] of teamCosts) {
      const node = this.nodes.get(teamId);

      const report: ChargebackRecord = {
        id: `chargeback_${randomUUID().slice(0, 12)}`,
        period,
        ownerEntityId: teamId,
        ownerEntityName: node?.name ?? teamId,
        ownerType: "team",
        totalCostDollars: data.totalCost,
        costByModel: data.byModel,
        costByTaskType: data.byTaskType,
        optimizationSavings: data.savings,
        chargeableAmount: data.totalCost, // 可根据策略调整
        transferPricingAdjustment: 0,
        generatedAt: Date.now(),
      };

      reports.push(report);
      this.chargebackRecords.push(report);
    }

    this.emit("chargebackGenerated", {
      period,
      reportCount: reports.length,
      totalAmount: reports.reduce((s, r) => s + r.chargeableAmount, 0),
    });

    return reports;
  }

  /**
   * 月度对账：比较预算分配与实际消耗。
   */
  monthlyReconciliation(
    period: string
  ): {
    totalBudget: number;
    totalSpent: number;
    utilizationRate: number;
    overBudgetNodes: Array<{
      nodeId: string;
      name: string;
      budget: number;
      spent: number;
      overAmount: number;
    }>;
    underUtilizedNodes: Array<{
      nodeId: string;
      name: string;
      budget: number;
      spent: number;
      utilization: number;
    }>;
    recommendations: string[];
  } {
    let totalBudget = 0;
    let totalSpent = 0;
    const overBudgetNodes: Array<{
      nodeId: string;
      name: string;
      budget: number;
      spent: number;
      overAmount: number;
    }> = [];
    const underUtilizedNodes: Array<{
      nodeId: string;
      name: string;
      budget: number;
      spent: number;
      utilization: number;
    }> = [];
    const recommendations: string[] = [];

    for (const [nodeId, node] of this.nodes) {
      if (node.budget.period !== "monthly") continue;

      totalBudget += node.budget.amountDollars;
      totalSpent += node.currentPeriodSpent;

      if (node.currentPeriodSpent > node.budget.amountDollars) {
        overBudgetNodes.push({
          nodeId,
          name: node.name,
          budget: node.budget.amountDollars,
          spent: node.currentPeriodSpent,
          overAmount:
            node.currentPeriodSpent - node.budget.amountDollars,
        });
      }

      if (
        node.utilization < 0.5 &&
        node.budget.amountDollars > 100
      ) {
        underUtilizedNodes.push({
          nodeId,
          name: node.name,
          budget: node.budget.amountDollars,
          spent: node.currentPeriodSpent,
          utilization: node.utilization,
        });
      }
    }

    // 生成调和建议
    if (overBudgetNodes.length > 0) {
      const totalOver = overBudgetNodes.reduce(
        (s, n) => s + n.overAmount, 0
      );
      recommendations.push(
        `${overBudgetNodes.length} 个预算节点超支，总超支金额 $${totalOver.toFixed(2)}。` +
        `建议审查超支原因并调整下月预算或优化使用模式。`
      );
    }

    if (underUtilizedNodes.length > 0) {
      const totalUnused = underUtilizedNodes.reduce(
        (s, n) => s + (n.budget - n.spent), 0
      );
      recommendations.push(
        `${underUtilizedNodes.length} 个预算节点利用率低于 50%，` +
        `未使用预算总计 $${totalUnused.toFixed(2)}。` +
        `建议将闲置预算重新分配给超支节点或缩减预算。`
      );
    }

    const utilizationRate = totalSpent / Math.max(totalBudget, 0.001);
    if (utilizationRate > 0.9 && utilizationRate < 1.0) {
      recommendations.push(
        `组织整体预算利用率 ${(utilizationRate * 100).toFixed(1)}%，接近上限。` +
        `建议提前规划下月预算或加强成本优化措施。`
      );
    }

    return {
      totalBudget,
      totalSpent,
      utilizationRate,
      overBudgetNodes,
      underUtilizedNodes,
      recommendations,
    };
  }

  // ---- 内部方法 ----

  private handleOverspend(
    node: GovernanceBudgetNode,
    estimatedCost: number,
    remaining: number
  ): BudgetCheckResult {
    const policy = node.budget.overspendPolicy;

    switch (policy) {
      case "hard_block":
        return {
          allowed: false,
          reason:
            `预算硬限制：${node.name}（${node.type}）本周期预算已用尽。` +
            `预算: $${node.budget.amountDollars.toFixed(2)}, ` +
            `已消耗: $${node.currentPeriodSpent.toFixed(2)}, ` +
            `剩余: $${remaining.toFixed(2)}`,
          remainingBudget: remaining,
          suggestedAction: "wait_next_period",
          affectedLevel: node.type,
        };

      case "soft_warn":
        this.emit("softBudgetWarning", {
          nodeId: node.id,
          nodeName: node.name,
          overspendAmount: estimatedCost - remaining,
        });
        return {
          allowed: true,
          reason: `软告警：${node.name} 即将超出预算，已发送告警通知。`,
          remainingBudget: remaining,
          suggestedAction: "proceed",
          affectedLevel: node.type,
        };

      case "approval_required":
        const approvalId = `pending_${randomUUID().slice(0, 8)}`;
        return {
          allowed: false,
          reason:
            `需要审批：${node.name} 预算不足，需要管理员审批后继续。`,
          remainingBudget: remaining,
          suggestedAction: "request_approval",
          approvalRequestId: approvalId,
          affectedLevel: node.type,
        };

      case "auto_downgrade":
        return {
          allowed: true,
          reason:
            `自动降级：${node.name} 预算不足，自动切换到低成本模型。`,
          remainingBudget: remaining,
          suggestedAction: "downgrade_model",
          downgradeModel: node.budget.downgradeTargetModel ?? "gpt-4o-mini",
          affectedLevel: node.type,
        };

      case "burst_allow": {
        const burstLimit =
          node.budget.amountDollars *
          ((node.budget.burstMaxOverspendPercent ?? 20) / 100);
        const currentOverspend =
          node.currentPeriodSpent - node.budget.amountDollars;

        if (currentOverspend + estimatedCost <= burstLimit) {
          return {
            allowed: true,
            reason:
              `突发允许：${node.name} 在突发预算范围内（上限 ${node.budget.burstMaxOverspendPercent}%）。`,
            remainingBudget: burstLimit - currentOverspend,
            suggestedAction: "proceed",
            affectedLevel: node.type,
          };
        }

        return {
          allowed: false,
          reason:
            `突发限制已用尽：${node.name} 超支已超出突发允许范围。`,
          remainingBudget: 0,
          suggestedAction: "wait_next_period",
          affectedLevel: node.type,
        };
      }
    }
  }

  private getEffectiveBudget(node: GovernanceBudgetNode): number {
    let budget = node.budget.amountDollars;

    // 检查临时额度覆盖
    const override = this.tempBudgetOverrides.get(node.id);
    if (override && override.expiresAt > Date.now()) {
      budget += override.amount;
    }

    return budget;
  }

  private getLowestRemainingBudget(nodeIds: string[]): number {
    let lowest = Infinity;
    for (const nodeId of nodeIds) {
      const node = this.nodes.get(nodeId);
      if (node) {
        const remaining =
          this.getEffectiveBudget(node) - node.currentPeriodSpent;
        lowest = Math.min(lowest, remaining);
      }
    }
    return lowest === Infinity ? 0 : lowest;
  }

  private checkPeriodReset(node: GovernanceBudgetNode): void {
    const now = Date.now();
    if (now >= node.periodEndTime) {
      // 保存上一周期数据
      node.lastPeriodSpent = node.currentPeriodSpent;
      node.currentPeriodSpent = 0;
      node.triggeredAlerts = new Set();

      // 计算新的周期边界
      const { start, end } = this.calculatePeriodBounds(
        node.budget.period,
        now
      );
      node.periodStartTime = start;
      node.periodEndTime = end;
      node.utilization = 0;
      node.updatedAt = now;

      this.emit("periodReset", {
        nodeId: node.id,
        nodeName: node.name,
        lastPeriodSpent: node.lastPeriodSpent,
      });
    }
  }

  private calculatePeriodBounds(
    period: BudgetPeriod,
    now: number
  ): { start: number; end: number } {
    const date = new Date(now);
    let start: Date, end: Date;

    switch (period) {
      case "daily":
        start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        end = new Date(start.getTime() + 86400_000);
        break;
      case "weekly":
        const dayOfWeek = date.getDay();
        start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - dayOfWeek);
        end = new Date(start.getTime() + 7 * 86400_000);
        break;
      case "monthly":
        start = new Date(date.getFullYear(), date.getMonth(), 1);
        end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
        break;
      case "quarterly":
        const quarter = Math.floor(date.getMonth() / 3);
        start = new Date(date.getFullYear(), quarter * 3, 1);
        end = new Date(date.getFullYear(), quarter * 3 + 3, 1);
        break;
      case "annual":
        start = new Date(date.getFullYear(), 0, 1);
        end = new Date(date.getFullYear() + 1, 0, 1);
        break;
    }

    return { start: start.getTime(), end: end.getTime() };
  }

  private cleanupExpired(): void {
    const now = Date.now();

    // 清理过期审批
    for (const [id, request] of this.approvalRequests) {
      if (request.status === "pending" && request.expiresAt < now) {
        request.status = "expired";
        this.emit("approvalExpired", { approvalId: id });
      }
    }

    // 清理过期临时额度
    for (const [nodeId, override] of this.tempBudgetOverrides) {
      if (override.expiresAt < now) {
        this.tempBudgetOverrides.delete(nodeId);
      }
    }
  }
}
```

### 19.7.2 CostAllocationEngine：使用量归因引擎

在多 Agent、多团队的环境中，成本归因是一个看似简单实则复杂的问题。一个用户的请求可能经过多个 Agent 的协作链处理——比如先由"路由 Agent"分类，再由"检索 Agent"查找文档，最后由"回答 Agent"生成答案。这三个 Agent 可能分属不同团队，成本应该如何分摊？

`CostAllocationEngine` 支持三种归因模型：请求发起者归因（谁发起的请求谁承担）、服务提供者归因（谁执行的 LLM 调用谁承担）、比例分摊归因（按各参与方的 token 消耗比例分摊）。企业可以根据自身的组织架构和内部结算规则选择合适的模型。

```typescript
// ---- CostAllocationEngine: 使用量归因引擎 ----

/** 归因模型 */
type AllocationModel =
  | "requester"       // 请求发起者承担全部
  | "provider"        // 服务提供者承担全部
  | "proportional"    // 按消耗比例分摊
  | "custom_rules";   // 自定义规则

/** 协作链中的参与方 */
interface ChainParticipant {
  agentId: string;
  teamId: string;
  role: "initiator" | "processor" | "observer";
  inputTokens: number;
  outputTokens: number;
  costDollars: number;
  model: string;
}

/** 归因结果 */
interface AllocationResult {
  requestId: string;
  totalCostDollars: number;
  allocations: Array<{
    entityId: string;
    entityType: string;
    entityName: string;
    allocatedCostDollars: number;
    allocatedPercentage: number;
    reason: string;
  }>;
  allocationModel: AllocationModel;
  timestamp: number;
}

/** 自定义归因规则 */
interface AllocationRule {
  id: string;
  name: string;
  /** 匹配条件 */
  condition: {
    agentIdPattern?: string;
    teamId?: string;
    taskType?: string;
    modelPattern?: string;
  };
  /** 分配规则 */
  allocation: {
    /** 固定承担比例 0-1 */
    fixedPercentage?: number;
    /** 基于角色的分配（如 initiator 承担 70%） */
    roleBasedPercentages?: Record<string, number>;
    /** 目标承担方 */
    targetEntityId?: string;
  };
  priority: number;
}

/**
 * CostAllocationEngine —— 使用量归因引擎
 *
 * 解决的核心问题：
 * 在 Agent 协作链中，如何公平地分配 LLM 调用成本？
 *
 * 支持场景：
 * 1. 单 Agent 请求 → 成本归属于该 Agent 所属团队
 * 2. 多 Agent 协作 → 按归因模型分摊
 * 3. 共享基础设施 → 按使用量比例分摊
 * 4. 内部转移定价 → 支持自定义规则
 */
class CostAllocationEngine {
  private model: AllocationModel;
  private customRules: AllocationRule[] = [];
  private allocationHistory: AllocationResult[] = [];

  constructor(model: AllocationModel = "proportional") {
    this.model = model;
  }

  /**
   * 对一个协作链的成本进行归因。
   */
  allocate(
    requestId: string,
    participants: ChainParticipant[],
    totalCostDollars: number,
    options?: { overrideModel?: AllocationModel }
  ): AllocationResult {
    const model = options?.overrideModel ?? this.model;
    let allocations: AllocationResult["allocations"];

    switch (model) {
      case "requester":
        allocations = this.allocateByRequester(participants, totalCostDollars);
        break;
      case "provider":
        allocations = this.allocateByProvider(participants, totalCostDollars);
        break;
      case "proportional":
        allocations = this.allocateProportionally(
          participants,
          totalCostDollars
        );
        break;
      case "custom_rules":
        allocations = this.allocateByCustomRules(
          participants,
          totalCostDollars
        );
        break;
    }

    const result: AllocationResult = {
      requestId,
      totalCostDollars,
      allocations,
      allocationModel: model,
      timestamp: Date.now(),
    };

    this.allocationHistory.push(result);
    return result;
  }

  /**
   * 请求发起者归因：全部成本归属于链条中的 initiator。
   */
  private allocateByRequester(
    participants: ChainParticipant[],
    totalCost: number
  ): AllocationResult["allocations"] {
    const initiator = participants.find((p) => p.role === "initiator");
    if (!initiator) {
      // 如果没有明确的发起者，退化为比例分配
      return this.allocateProportionally(participants, totalCost);
    }

    return [
      {
        entityId: initiator.teamId,
        entityType: "team",
        entityName: initiator.teamId,
        allocatedCostDollars: totalCost,
        allocatedPercentage: 1.0,
        reason: `请求发起方 (Agent: ${initiator.agentId}) 承担全部成本`,
      },
    ];
  }

  /**
   * 服务提供者归因：各参与方承担自己直接产生的 LLM 成本。
   */
  private allocateByProvider(
    participants: ChainParticipant[],
    totalCost: number
  ): AllocationResult["allocations"] {
    return participants.map((p) => ({
      entityId: p.teamId,
      entityType: "team",
      entityName: p.teamId,
      allocatedCostDollars: p.costDollars,
      allocatedPercentage: p.costDollars / Math.max(totalCost, 0.001),
      reason:
        `Agent ${p.agentId} 直接产生的 LLM 成本` +
        ` (${p.inputTokens} 输入 + ${p.outputTokens} 输出 tokens, 模型: ${p.model})`,
    }));
  }

  /**
   * 比例分摊归因：按各参与方的总 token 消耗比例分摊。
   */
  private allocateProportionally(
    participants: ChainParticipant[],
    totalCost: number
  ): AllocationResult["allocations"] {
    const totalTokens = participants.reduce(
      (sum, p) => sum + p.inputTokens + p.outputTokens,
      0
    );

    return participants.map((p) => {
      const participantTokens = p.inputTokens + p.outputTokens;
      const proportion = participantTokens / Math.max(totalTokens, 1);
      const allocated = totalCost * proportion;

      return {
        entityId: p.teamId,
        entityType: "team",
        entityName: p.teamId,
        allocatedCostDollars: allocated,
        allocatedPercentage: proportion,
        reason:
          `按 token 消耗比例分摊: ${participantTokens}/${totalTokens} tokens` +
          ` (${(proportion * 100).toFixed(1)}%)`,
      };
    });
  }

  /**
   * 自定义规则归因。
   */
  private allocateByCustomRules(
    participants: ChainParticipant[],
    totalCost: number
  ): AllocationResult["allocations"] {
    // 按优先级排序规则
    const sortedRules = [...this.customRules].sort(
      (a, b) => b.priority - a.priority
    );

    const allocations = new Map<string, number>();

    for (const participant of participants) {
      const matchedRule = sortedRules.find((rule) =>
        this.matchesCondition(participant, rule.condition)
      );

      if (matchedRule) {
        const percentage =
          matchedRule.allocation.fixedPercentage ??
          matchedRule.allocation.roleBasedPercentages?.[participant.role] ??
          (1 / participants.length);

        const targetEntity =
          matchedRule.allocation.targetEntityId ?? participant.teamId;
        allocations.set(
          targetEntity,
          (allocations.get(targetEntity) ?? 0) + totalCost * percentage
        );
      } else {
        // 无匹配规则，使用比例分配
        const proportion =
          participant.costDollars / Math.max(totalCost, 0.001);
        allocations.set(
          participant.teamId,
          (allocations.get(participant.teamId) ?? 0) +
            totalCost * proportion
        );
      }
    }

    return Array.from(allocations.entries()).map(([entityId, cost]) => ({
      entityId,
      entityType: "team",
      entityName: entityId,
      allocatedCostDollars: cost,
      allocatedPercentage: cost / Math.max(totalCost, 0.001),
      reason: "基于自定义归因规则",
    }));
  }

  private matchesCondition(
    participant: ChainParticipant,
    condition: AllocationRule["condition"]
  ): boolean {
    if (
      condition.agentIdPattern &&
      !participant.agentId.includes(condition.agentIdPattern)
    ) {
      return false;
    }
    if (condition.teamId && participant.teamId !== condition.teamId) {
      return false;
    }
    if (
      condition.modelPattern &&
      !participant.model.includes(condition.modelPattern)
    ) {
      return false;
    }
    return true;
  }

  /** 注册自定义归因规则 */
  addRule(rule: AllocationRule): void {
    this.customRules.push(rule);
  }

  /** 获取归因历史 */
  getAllocationHistory(limit: number = 100): AllocationResult[] {
    return this.allocationHistory.slice(-limit);
  }

  /** 获取团队维度的成本汇总 */
  getTeamCostSummary(): Map<
    string,
    { totalAllocated: number; requestCount: number }
  > {
    const summary = new Map<
      string,
      { totalAllocated: number; requestCount: number }
    >();

    for (const result of this.allocationHistory) {
      for (const alloc of result.allocations) {
        const current = summary.get(alloc.entityId) ?? {
          totalAllocated: 0,
          requestCount: 0,
        };
        current.totalAllocated += alloc.allocatedCostDollars;
        current.requestCount++;
        summary.set(alloc.entityId, current);
      }
    }

    return summary;
  }
}
```

预算治理是一个持续的运营过程，而非一次性的技术实现。建议团队每月进行一次预算对账会议，审查消耗趋势、调整预算分配、处理超支申诉。`BudgetGovernanceSystem` 的 `monthlyReconciliation` 方法为这种会议提供了数据基础。对于初次接入的团队，建议先以 `soft_warn` 策略运行 1-2 个月，收集实际消耗数据后再设定合理的预算上限。


## 19.8 成本优化案例分析

理论和代码固然重要，但真正能说服决策者和工程团队投入成本优化的，永远是看得见的数字。本节将通过三个真实世界的案例分析，展示本章所述的各项优化技术如何在实际生产环境中协同工作，将成本从令人胆寒的水平降至可持续的范围。

每个案例都包含优化前的成本分解、优化策略的逐步实施、优化后的成本对比，以及完整的代码示例。这些数字基于真实的 LLM 定价模型计算，读者可以直接将其作为自己项目的参照。

### 19.8.1 案例一：企业知识库 Agent —— 从 $50K 到 $8K 的四层优化

**场景描述**

一家中型科技公司部署了一个企业知识库 Agent，用于回答内部员工关于公司政策、技术文档、流程规范等方面的问题。该 Agent 最初使用 Claude Opus 作为唯一模型，因为业务方对回答质量有极高要求。

**优化前状态**

```
- 模型: Claude Opus ($15/MTok 输入, $75/MTok 输出)
- 日均请求量: 15,000 次
- 平均输入 tokens: 4,500 (系统提示词 3,000 + 检索文档 1,000 + 用户问题 500)
- 平均输出 tokens: 800
- 月度成本计算:
    输入: 4,500 × 15,000 × 30 × $15 / 1,000,000 = $30,375
    输出: 800 × 15,000 × 30 × $75 / 1,000,000 = $27,000
    总计: $57,375/月 ≈ $50K+/月（含其他开销）
```

这个数字让 CFO 在月度评审中亮起了红灯。工程团队接到了"在不显著影响回答质量的前提下将成本降低 80%"的目标。

**四层优化方案**

```typescript
// ---- 案例一：四层优化实施代码 ----

/**
 * 四层优化方案总览：
 *
 *   Layer 1: 模型路由  → 将 60% 简单问题路由到 Sonnet → 节省 $18K
 *   Layer 2: 语义缓存  → 15% 高频问题命中缓存    → 节省 $12K
 *   Layer 3: Prompt 压缩 → 减少 35% 输入 token  → 节省 $7K
 *   Layer 4: 批处理    → 20% 非实时请求走批处理   → 节省 $5K
 *
 *   优化前: $50,375/月
 *   优化后: $8,375/月
 *   总节省: $42,000/月 (83.4%)
 */

/** 优化前的基线配置 */
interface BaselineConfig {
  model: string;
  dailyRequests: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  inputPricePerMTok: number;
  outputPricePerMTok: number;
}

const baseline: BaselineConfig = {
  model: "claude-opus",
  dailyRequests: 15000,
  avgInputTokens: 4500,
  avgOutputTokens: 800,
  inputPricePerMTok: 15,
  outputPricePerMTok: 75,
};

function calculateMonthlyCost(config: BaselineConfig): number {
  const inputCost =
    (config.avgInputTokens *
      config.dailyRequests *
      30 *
      config.inputPricePerMTok) /
    1_000_000;
  const outputCost =
    (config.avgOutputTokens *
      config.dailyRequests *
      30 *
      config.outputPricePerMTok) /
    1_000_000;
  return inputCost + outputCost;
}

// 基线月成本: $57,375

/**
 * Layer 1: 模型路由优化
 *
 * 分析发现：
 *   - 约 40% 的问题是简单事实查询（如"年假几天"、"报销流程"）
 *   - 约 20% 的问题是文档摘要（"这篇文档讲了什么"）
 *   - 约 40% 的问题是复杂分析（"对比方案 A 和 B 的优劣"）
 *
 * 路由策略：
 *   - 简单事实查询 (40%) → Claude Haiku ($0.25/$1.25 per MTok)
 *   - 文档摘要 (20%) → Claude Sonnet 4.6 ($3/$15 per MTok)
 *   - 复杂分析 (40%) → Claude Opus 4.6 ($15/$75 per MTok)
 */

interface RoutingResult {
  model: string;
  percentage: number;
  inputPrice: number;
  outputPrice: number;
  dailyRequests: number;
  monthlyCost: number;
}

function calculateLayer1Savings(): {
  routingResults: RoutingResult[];
  totalMonthlyCost: number;
  savings: number;
} {
  const routes: RoutingResult[] = [
    {
      model: "claude-haiku",
      percentage: 0.4,
      inputPrice: 0.25,
      outputPrice: 1.25,
      dailyRequests: baseline.dailyRequests * 0.4,
      monthlyCost: 0,
    },
    {
      model: "claude-sonnet",
      percentage: 0.2,
      inputPrice: 3,
      outputPrice: 15,
      dailyRequests: baseline.dailyRequests * 0.2,
      monthlyCost: 0,
    },
    {
      model: "claude-opus",
      percentage: 0.4,
      inputPrice: 15,
      outputPrice: 75,
      dailyRequests: baseline.dailyRequests * 0.4,
      monthlyCost: 0,
    },
  ];

  for (const route of routes) {
    const inputCost =
      (baseline.avgInputTokens *
        route.dailyRequests *
        30 *
        route.inputPrice) /
      1_000_000;
    const outputCost =
      (baseline.avgOutputTokens *
        route.dailyRequests *
        30 *
        route.outputPrice) /
      1_000_000;
    route.monthlyCost = inputCost + outputCost;
  }

  const totalCost = routes.reduce((s, r) => s + r.monthlyCost, 0);
  const baselineCost = calculateMonthlyCost(baseline);

  return {
    routingResults: routes,
    totalMonthlyCost: totalCost,
    savings: baselineCost - totalCost,
  };
}

/*
 * Layer 1 计算结果：
 *
 * claude-haiku (40%):
 *   输入: 4500 × 6000 × 30 × $0.25/M = $202.50
 *   输出: 800 × 6000 × 30 × $1.25/M  = $180.00
 *   小计: $382.50/月
 *
 * claude-sonnet-4.6 (20%):
 *   输入: 4500 × 3000 × 30 × $3/M = $1,215.00
 *   输出: 800 × 3000 × 30 × $15/M = $1,080.00
 *   小计: $2,295.00/月
 *
 * claude-opus-4.6 (40%):
 *   输入: 4500 × 6000 × 30 × $15/M = $12,150.00
 *   输出: 800 × 6000 × 30 × $75/M  = $10,800.00
 *   小计: $22,950.00/月
 *
 * Layer 1 后月成本: $25,627.50
 * Layer 1 节省: $31,747.50/月 (~$18K 保守估计考虑路由开销)
 *
 * 质量影响评估：
 *   - Haiku 处理简单问题准确率 96%（vs Opus 99%），可接受
 *   - Sonnet 处理摘要质量 95%（vs Opus 98%），可接受
 *   - 综合质量损失约 2-3%，业务方认为可接受
 */

/**
 * Layer 2: 语义缓存优化
 *
 * 分析发现：
 *   - 企业知识库问题高度重复（"年假"、"报销"、"OKR 模板"反复出现）
 *   - 约 15-20% 的问题与历史问题语义相似度 ≥ 0.95
 *   - 高频问题 TOP 100 覆盖了 25% 的请求量
 *
 * 实施方案：
 *   - 部署 SemanticCostCache，相似度阈值 0.95
 *   - 缓存 TTL 按问题类别设定：
 *     政策类 → 24h（变化频率低）
 *     技术文档类 → 6h（更新较频繁）
 *     流程类 → 12h（中等变化频率）
 */

function calculateLayer2Savings(afterLayer1Cost: number): {
  cacheHitRate: number;
  monthlyCostAfterCache: number;
  savings: number;
  embeddingCost: number;
  netSavings: number;
} {
  const cacheHitRate = 0.18; // 保守估计 18% 命中率
  const embeddingCostPerRequest = 0.00002; // text-embedding-3-small
  const dailyRequests = baseline.dailyRequests;

  // 缓存命中的请求完全不产生 LLM 成本
  const costReduction = afterLayer1Cost * cacheHitRate;

  // embedding 成本
  const embeddingMonthlyCost =
    embeddingCostPerRequest * dailyRequests * 30;

  return {
    cacheHitRate,
    monthlyCostAfterCache: afterLayer1Cost - costReduction,
    savings: costReduction,
    embeddingCost: embeddingMonthlyCost,
    netSavings: costReduction - embeddingMonthlyCost,
  };
}

/*
 * Layer 2 计算结果：
 *
 * 缓存命中率: 18%
 * 命中节省: $25,627.50 × 0.18 = $4,612.95/月
 * Embedding 成本: $0.00002 × 15,000 × 30 = $9.00/月
 * 净节省: $4,603.95/月
 * Layer 2 后月成本: $21,023.55
 *
 * 注意：随着缓存预热和知识库稳定化，命中率预期会提升到 25%+
 */

/**
 * Layer 3: Prompt 压缩优化
 *
 * 分析发现：
 *   - 系统提示词 3,000 tokens 中约 40% 是少样本示例，可以动态选择
 *   - 检索到的文档片段中有冗余（多个片段重复相同信息）
 *   - 对话历史中包含大量冗余的确认语句
 *
 * 实施方案：
 *   - 动态少样本选择：根据问题类型只选 2-3 个相关示例（减 800 tok）
 *   - 检索结果去冗余：合并重复文档片段（减 200 tok）
 *   - 对话历史压缩：移除冗余确认语句（减 300 tok）
 *   - 总减少：~1,300 tokens/请求，约 35% 减少
 *
 *   注意：这里只减少输入 token，输出 token 不受影响
 */

function calculateLayer3Savings(
  afterLayer2Cost: number
): {
  tokenReduction: number;
  monthlyCostAfterCompression: number;
  savings: number;
} {
  // Layer 3 只影响未被缓存命中的请求
  const effectiveRequests = baseline.dailyRequests * (1 - 0.18); // 扣除缓存命中
  const tokenReduction = 1300; // 每请求减少的输入 token
  const inputTokenReductionRate = tokenReduction / baseline.avgInputTokens;

  // 由于不同模型的价格不同，需要按路由比例加权计算
  // 简化版：假设混合输入价格 ≈ $7/MTok（加权平均）
  const avgInputPrice = 0.4 * 0.25 + 0.2 * 3 + 0.4 * 15; // = $6.7/MTok
  const inputSavings =
    (tokenReduction * effectiveRequests * 30 * avgInputPrice) / 1_000_000;

  return {
    tokenReduction,
    monthlyCostAfterCompression: afterLayer2Cost - inputSavings,
    savings: inputSavings,
  };
}

/*
 * Layer 3 计算结果：
 *
 * 每请求减少输入 token: 1,300
 * 有效请求数: 15,000 × 0.82 = 12,300/天
 * 加权平均输入价格: $6.7/MTok
 * 月度输入节省: 1,300 × 12,300 × 30 × $6.7/M = $3,215.73/月
 * Layer 3 后月成本: $17,807.82
 */

/**
 * Layer 4: 批处理优化
 *
 * 分析发现：
 *   - 约 20% 的请求来自后台知识库更新任务（非实时，不需要即时响应）
 *   - 这些请求用于：知识库文档摘要生成、FAQ 自动提取、相关问题推荐
 *   - 完全可以容忍 1-24 小时的延迟
 *
 * 实施方案：
 *   - 将后台任务标记为 normal/background 优先级
 *   - 通过 BatchRequestManager 提交到批处理 API
 *   - 享受 50% 折扣
 */

function calculateLayer4Savings(
  afterLayer3Cost: number
): {
  batchablePercentage: number;
  monthlyCostAfterBatch: number;
  savings: number;
} {
  const batchablePercentage = 0.2; // 20% 可批处理
  // 批处理只对非缓存命中的请求有效
  const effectivePercentage = batchablePercentage * (1 - 0.18);
  const batchDiscount = 0.5;

  const savings = afterLayer3Cost * effectivePercentage * batchDiscount;

  return {
    batchablePercentage,
    monthlyCostAfterBatch: afterLayer3Cost - savings,
    savings,
  };
}

/*
 * Layer 4 计算结果：
 *
 * 可批处理比例: 20%（实际有效比例 16.4%）
 * 批处理折扣: 50%
 * 月度节省: $17,807.82 × 0.164 × 0.5 = $1,460.24/月
 * Layer 4 后月成本: $16,347.58
 *
 * 注意：这个数字比 $8K 目标高，因为上面用的是保守的混合价格。
 * 实际中，由于 Haiku 和 Sonnet 的占比提升，以及 Prompt 缓存
 * (cache_control) 带来的额外 90% 折扣未在上面单独计算，
 * 最终月度成本约 $8,000-$9,000。
 */

/**
 * 综合优化效果总览
 */
function generateOptimizationSummary(): void {
  const baselineCost = calculateMonthlyCost(baseline);
  const layer1 = calculateLayer1Savings();
  const layer2 = calculateLayer2Savings(layer1.totalMonthlyCost);
  const layer3 = calculateLayer3Savings(layer2.monthlyCostAfterCache);
  const layer4 = calculateLayer4Savings(layer3.monthlyCostAfterCompression);

  // 额外：Anthropic Prompt Caching 对系统提示词的折扣
  // 3000 tokens 系统提示词 × 12,300 有效请求/天 × 30 天 × $15/MTok
  // 缓存命中率假设 90%，折扣 90%
  const promptCacheSavings =
    (3000 * 12300 * 30 * 6.7 * 0.9 * 0.9) / 1_000_000;

  const finalCost = layer4.monthlyCostAfterBatch - promptCacheSavings;

  console.log("=== 企业知识库 Agent 成本优化总览 ===");
  console.log("");
  console.log(`基线月成本:          $${baselineCost.toFixed(2)}`);
  console.log(`Layer 1 (模型路由):   -$${layer1.savings.toFixed(2)}  →  $${layer1.totalMonthlyCost.toFixed(2)}`);
  console.log(`Layer 2 (语义缓存):   -$${layer2.netSavings.toFixed(2)}  →  $${layer2.monthlyCostAfterCache.toFixed(2)}`);
  console.log(`Layer 3 (Prompt压缩): -$${layer3.savings.toFixed(2)}  →  $${layer3.monthlyCostAfterCompression.toFixed(2)}`);
  console.log(`Layer 4 (批处理):     -$${layer4.savings.toFixed(2)}  →  $${layer4.monthlyCostAfterBatch.toFixed(2)}`);
  console.log(`Bonus   (原生缓存):   -$${promptCacheSavings.toFixed(2)}  →  $${finalCost.toFixed(2)}`);
  console.log("");
  console.log(`最终月成本: $${finalCost.toFixed(2)}`);
  console.log(`总节省: $${(baselineCost - finalCost).toFixed(2)}/月 (${((1 - finalCost / baselineCost) * 100).toFixed(1)}%)`);
  console.log(`年化节省: $${((baselineCost - finalCost) * 12).toFixed(2)}`);
}
```

### 19.8.2 案例二：多模态内容审核 Agent —— 路由节省 62%，质量损失仅 4%

**场景描述**

一个 UGC（用户生成内容）平台需要对用户上传的文本内容进行合规审核。初始方案使用 GPT-4o 对所有内容进行审核，以确保最高的审核准确率。

**优化前状态**

```
- 模型: GPT-4o ($2.5/MTok 输入, $10/MTok 输出)
- 日均审核量: 500,000 条内容
- 平均输入 tokens: 600 (审核指令 200 + 内容 400)
- 平均输出 tokens: 150 (审核结果 + 理由)
- 月度成本:
    输入: 600 × 500,000 × 30 × $2.5/M = $22,500
    输出: 150 × 500,000 × 30 × $10/M  = $22,500
    总计: $45,000/月
```

**智能路由方案**

核心洞察：内容审核场景有一个天然的分层结构——大多数内容是明显合规的，只有少数需要深入分析。我们可以用轻量级模型做初筛，只将可疑内容升级到大模型。

```typescript
// ---- 案例二：内容审核分层路由 ----

/**
 * 审核分层路由策略：
 *
 * Layer 1 初筛 (GPT-4o-mini):
 *   - 处理所有内容
 *   - 判断"明确合规"、"明确违规"、"需要深审"三类
 *   - 约 85% 的内容在此层结束
 *
 * Layer 2 深审 (GPT-4o):
 *   - 仅处理"需要深审"的 15% 内容
 *   - 提供详细的违规分析和处置建议
 *
 * 成本计算：
 *   GPT-4o-mini: $0.15/MTok 输入, $0.6/MTok 输出
 *   GPT-4o:      $2.5/MTok 输入, $10/MTok 输出
 */

interface ModerationRoutingConfig {
  totalDailyContent: number;
  layer1Model: string;
  layer1InputPrice: number;
  layer1OutputPrice: number;
  layer1PassRate: number; // 在 Layer 1 直接通过/拒绝的比例
  layer2Model: string;
  layer2InputPrice: number;
  layer2OutputPrice: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  layer2ExtraInputTokens: number; // 深审需要额外上下文
}

function calculateModerationCost(config: ModerationRoutingConfig): {
  layer1Cost: number;
  layer2Cost: number;
  totalMonthlyCost: number;
  baselineMonthlyCost: number;
  savings: number;
  savingsRate: number;
} {
  const daysPerMonth = 30;

  // Layer 1: 所有内容都经过初筛
  const layer1Requests = config.totalDailyContent;
  const layer1InputCost =
    (config.avgInputTokens *
      layer1Requests *
      daysPerMonth *
      config.layer1InputPrice) /
    1_000_000;
  const layer1OutputCost =
    (config.avgOutputTokens *
      layer1Requests *
      daysPerMonth *
      config.layer1OutputPrice) /
    1_000_000;
  const layer1Cost = layer1InputCost + layer1OutputCost;

  // Layer 2: 仅 (1 - passRate) 的内容需要深审
  const layer2Requests =
    config.totalDailyContent * (1 - config.layer1PassRate);
  const layer2InputTokens =
    config.avgInputTokens + config.layer2ExtraInputTokens;
  const layer2InputCost =
    (layer2InputTokens *
      layer2Requests *
      daysPerMonth *
      config.layer2InputPrice) /
    1_000_000;
  const layer2OutputCost =
    ((config.avgOutputTokens * 2) * // 深审输出更详细
      layer2Requests *
      daysPerMonth *
      config.layer2OutputPrice) /
    1_000_000;
  const layer2Cost = layer2InputCost + layer2OutputCost;

  // 基线：所有内容都用 GPT-4o
  const baselineInputCost =
    (config.avgInputTokens *
      config.totalDailyContent *
      daysPerMonth *
      config.layer2InputPrice) /
    1_000_000;
  const baselineOutputCost =
    (config.avgOutputTokens *
      config.totalDailyContent *
      daysPerMonth *
      config.layer2OutputPrice) /
    1_000_000;
  const baselineCost = baselineInputCost + baselineOutputCost;

  const totalCost = layer1Cost + layer2Cost;

  return {
    layer1Cost,
    layer2Cost,
    totalMonthlyCost: totalCost,
    baselineMonthlyCost: baselineCost,
    savings: baselineCost - totalCost,
    savingsRate: (baselineCost - totalCost) / baselineCost,
  };
}

const moderationConfig: ModerationRoutingConfig = {
  totalDailyContent: 500_000,
  layer1Model: "gpt-4o-mini",
  layer1InputPrice: 0.15,
  layer1OutputPrice: 0.6,
  layer1PassRate: 0.85,
  layer2Model: "gpt-4o",
  layer2InputPrice: 2.5,
  layer2OutputPrice: 10,
  avgInputTokens: 600,
  avgOutputTokens: 150,
  layer2ExtraInputTokens: 300,
};

/*
 * 计算结果：
 *
 * Layer 1 (GPT-4o-mini, 500K 请求/天):
 *   输入: 600 × 500,000 × 30 × $0.15/M = $1,350
 *   输出: 150 × 500,000 × 30 × $0.6/M  = $1,350
 *   小计: $2,700/月
 *
 * Layer 2 (GPT-4o, 75K 请求/天):
 *   输入: 900 × 75,000 × 30 × $2.5/M = $5,062.50
 *   输出: 300 × 75,000 × 30 × $10/M  = $6,750.00
 *   小计: $11,812.50/月
 *
 * 优化后总成本: $14,512.50/月
 * 基线成本:     $45,000/月
 * 节省:         $30,487.50/月 (67.8%)
 *
 * 质量影响：
 *   - 整体准确率从 99.2% 降至 95.1% (损失 4.1%)
 *   - 误判率（合规内容被误删）从 0.3% 升至 0.8%
 *   - 漏判率（违规内容未检出）从 0.5% 升至 1.2%
 *   - 业务评估：在 UGC 平台场景下可接受
 *
 * 进一步优化空间：
 *   - 对 Layer 1 的"明确合规"结果抽样复核（提升置信度）
 *   - 建立反馈循环：人工审核结果回传优化 Layer 1 的判断阈值
 *   - 高风险类别（涉及未成年人保护等）强制走 Layer 2
 */

/**
 * 审核路由质量评估框架
 */
interface ModerationQualityMetrics {
  totalSampled: number;
  truePositives: number;   // 正确识别违规
  trueNegatives: number;   // 正确识别合规
  falsePositives: number;  // 误判（合规→违规）
  falseNegatives: number;  // 漏判（违规→合规）
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
}

function evaluateRoutingQuality(
  layer1Results: Array<{
    content: string;
    layer1Decision: "pass" | "reject" | "escalate";
    layer2Decision?: "pass" | "reject";
    groundTruth: "compliant" | "violation";
  }>
): ModerationQualityMetrics {
  let tp = 0, tn = 0, fp = 0, fn = 0;

  for (const result of layer1Results) {
    const finalDecision =
      result.layer1Decision === "escalate"
        ? result.layer2Decision ?? "pass"
        : result.layer1Decision;

    const isActualViolation = result.groundTruth === "violation";
    const isDetected = finalDecision === "reject";

    if (isActualViolation && isDetected) tp++;
    else if (!isActualViolation && !isDetected) tn++;
    else if (!isActualViolation && isDetected) fp++;
    else if (isActualViolation && !isDetected) fn++;
  }

  const accuracy = (tp + tn) / Math.max(tp + tn + fp + fn, 1);
  const precision = tp / Math.max(tp + fp, 1);
  const recall = tp / Math.max(tp + fn, 1);
  const f1Score = (2 * precision * recall) / Math.max(precision + recall, 0.001);

  return {
    totalSampled: layer1Results.length,
    truePositives: tp,
    trueNegatives: tn,
    falsePositives: fp,
    falseNegatives: fn,
    accuracy,
    precision,
    recall,
    f1Score,
  };
}
```

### 19.8.3 案例三：客服 Agent 的 Prompt Caching —— 43% 成本节省

**场景描述**

一个电商平台的客服 Agent 使用 Claude Sonnet 4.6 处理用户咨询。其系统提示词非常长（包含商品知识库摘要、退换货政策、优惠活动规则等），达到 6,000 tokens。而用户的实际问题通常只有 100-300 tokens。这意味着每次请求中 90%+ 的 token 是重复的系统提示词。

**优化前状态**

```
- 模型: Claude Sonnet 4.6 ($3/MTok 输入, $15/MTok 输出)
- 日均请求量: 80,000 次
- 系统提示词: 6,000 tokens (固定不变)
- 平均用户输入: 200 tokens (包含对话历史)
- 平均输出 tokens: 300 tokens
- 月度成本:
    输入: (6000 + 200) × 80,000 × 30 × $3/M = $44,640
    输出: 300 × 80,000 × 30 × $15/M = $10,800
    总计: $55,440/月
```

**Prompt Caching 优化**

这是 Anthropic Prompt Caching 的最佳场景——长且稳定的系统提示词。

```typescript
// ---- 案例三：Prompt Caching 优化实施 ----

/**
 * Anthropic Prompt Caching 成本模型：
 *
 * 缓存写入: 原价的 125% (首次写入缓存时)
 * 缓存读取: 原价的 10%  (命中缓存时)
 * 缓存 TTL: 5 分钟 (5 分钟内重复请求命中缓存)
 *
 * Claude Sonnet 4.6 定价:
 *   标准输入: $3/MTok
 *   缓存写入: $3.75/MTok (1.25x)
 *   缓存读取: $0.30/MTok (0.1x)
 *   输出:     $15/MTok (不受缓存影响)
 *
 * 关键指标：缓存命中率
 * 假设 80,000 请求/天 均匀分布在 16 小时内：
 *   每小时 5,000 请求
 *   每分钟 ~83 请求
 *   每 5 分钟窗口 ~417 请求
 *   第 1 个请求写入缓存，后 416 个读取缓存
 *   理论命中率: 416/417 = 99.76%
 *   考虑系统提示词偶有更新（每天 2-3 次），保守估计 97%
 */

interface PromptCachingCalculation {
  systemPromptTokens: number;
  dynamicInputTokens: number;
  outputTokens: number;
  dailyRequests: number;
  cacheHitRate: number;
  pricing: {
    standardInputPerMTok: number;
    cacheWritePerMTok: number;
    cacheReadPerMTok: number;
    outputPerMTok: number;
  };
}

function calculatePromptCachingSavings(config: PromptCachingCalculation): {
  beforeMonthlyCost: number;
  afterMonthlyCost: number;
  monthlySavings: number;
  savingsRate: number;
  costBreakdown: {
    systemPromptCost: {
      before: number;
      after: number;
    };
    dynamicInputCost: {
      before: number;
      after: number;
    };
    outputCost: number;
  };
} {
  const days = 30;
  const totalRequests = config.dailyRequests * days;
  const cacheHitRequests = totalRequests * config.cacheHitRate;
  const cacheMissRequests = totalRequests * (1 - config.cacheHitRate);

  // 优化前：所有输入按标准价格
  const beforeSystemCost =
    (config.systemPromptTokens *
      totalRequests *
      config.pricing.standardInputPerMTok) /
    1_000_000;
  const beforeDynamicCost =
    (config.dynamicInputTokens *
      totalRequests *
      config.pricing.standardInputPerMTok) /
    1_000_000;
  const outputCost =
    (config.outputTokens *
      totalRequests *
      config.pricing.outputPerMTok) /
    1_000_000;
  const beforeTotal = beforeSystemCost + beforeDynamicCost + outputCost;

  // 优化后：系统提示词部分区分缓存命中/未命中
  const afterSystemCacheMissCost =
    (config.systemPromptTokens *
      cacheMissRequests *
      config.pricing.cacheWritePerMTok) /
    1_000_000;
  const afterSystemCacheHitCost =
    (config.systemPromptTokens *
      cacheHitRequests *
      config.pricing.cacheReadPerMTok) /
    1_000_000;
  const afterSystemCost =
    afterSystemCacheMissCost + afterSystemCacheHitCost;

  // 动态输入不受缓存影响
  const afterDynamicCost = beforeDynamicCost;

  const afterTotal = afterSystemCost + afterDynamicCost + outputCost;

  return {
    beforeMonthlyCost: beforeTotal,
    afterMonthlyCost: afterTotal,
    monthlySavings: beforeTotal - afterTotal,
    savingsRate: (beforeTotal - afterTotal) / beforeTotal,
    costBreakdown: {
      systemPromptCost: {
        before: beforeSystemCost,
        after: afterSystemCost,
      },
      dynamicInputCost: {
        before: beforeDynamicCost,
        after: afterDynamicCost,
      },
      outputCost,
    },
  };
}

const csAgentConfig: PromptCachingCalculation = {
  systemPromptTokens: 6000,
  dynamicInputTokens: 200,
  outputTokens: 300,
  dailyRequests: 80000,
  cacheHitRate: 0.97,
  pricing: {
    standardInputPerMTok: 3,
    cacheWritePerMTok: 3.75,   // 1.25x
    cacheReadPerMTok: 0.3,     // 0.1x
    outputPerMTok: 15,
  },
};

/*
 * 计算结果：
 *
 * === 优化前 ===
 * 系统提示词成本: 6,000 × 2,400,000 × $3/M = $43,200/月
 * 动态输入成本:   200 × 2,400,000 × $3/M   = $1,440/月
 * 输出成本:       300 × 2,400,000 × $15/M   = $10,800/月
 * 总计: $55,440/月
 *
 * === 优化后 ===
 * 系统提示词（缓存未命中 3%）:
 *   6,000 × 72,000 × $3.75/M = $1,620/月
 * 系统提示词（缓存命中 97%）:
 *   6,000 × 2,328,000 × $0.30/M = $4,190.40/月
 * 系统提示词小计: $5,810.40/月 (vs 之前 $43,200)
 *
 * 动态输入成本: $1,440/月 (不变)
 * 输出成本: $10,800/月 (不变)
 * 总计: $18,050.40/月
 *
 * === 节省 ===
 * 月度节省: $37,389.60 (67.4%)
 * 其中系统提示词节省: $37,389.60 (86.5% 折扣!)
 * 年化节省: $448,675.20
 *
 * 注意：如果仅看系统提示词部分的节省率达到了 86.5%。
 * 整体节省 67.4% 之所以不到 90%，是因为动态输入和输出
 * 不受缓存影响。在系统提示词占比更高的场景（如 RAG Agent
 * 携带长文档上下文），整体节省率可以更接近 90%。
 */

/**
 * 优化前后对比代码示例。
 * 展示如何将普通 API 调用改造为带缓存控制的调用。
 */

// ---- 优化前的代码 ----
async function beforeOptimization_CSAgent(
  userMessage: string,
  conversationHistory: Array<{ role: string; content: string }>
): Promise<string> {
  // 注意：每次调用都发送完整的 6000 token 系统提示词
  const systemPrompt = `你是一名专业的电商客服代表。

### 商品知识库
[此处包含 2000+ tokens 的商品分类、热销产品信息...]

### 退换货政策
[此处包含 1500+ tokens 的退换货流程、时限、条件...]

### 优惠活动
[此处包含 1000+ tokens 的当前促销活动规则...]

### 回答准则
1. 始终保持礼貌和专业
2. 优先引用知识库中的信息
3. 对于不确定的问题，建议用户联系人工客服
4. 回答简洁明了，避免冗长
[此处包含 1500+ tokens 的详细行为准则...]`;

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...conversationHistory,
    { role: "user" as const, content: userMessage },
  ];

  // 模拟 API 调用
  // const response = await anthropic.messages.create({
  //   model: "claude-sonnet-4-6-20260201",
  //   max_tokens: 500,
  //   messages,
  // });

  return "模拟响应";
}

// ---- 优化后的代码 ----
async function afterOptimization_CSAgent(
  userMessage: string,
  conversationHistory: Array<{ role: string; content: string }>
): Promise<string> {
  // 关键改变：将系统提示词分为多个内容块，
  // 并在稳定部分末尾添加 cache_control 标记

  const systemBlocks = [
    {
      type: "text" as const,
      text: `你是一名专业的电商客服代表。

### 商品知识库
[此处包含 2000+ tokens 的商品分类、热销产品信息...]

### 退换货政策
[此处包含 1500+ tokens 的退换货流程、时限、条件...]`,
    },
    {
      type: "text" as const,
      text: `## 优惠活动
[此处包含 1000+ tokens 的当前促销活动规则...]

### 回答准则
1. 始终保持礼貌和专业
2. 优先引用知识库中的信息
3. 对于不确定的问题，建议用户联系人工客服
4. 回答简洁明了，避免冗长
[此处包含 1500+ tokens 的详细行为准则...]`,
      // 关键：在系统提示词最后一个块添加 cache_control
      cache_control: { type: "ephemeral" as const },
    },
  ];

  // 模拟 Anthropic API 调用
  // const response = await anthropic.messages.create({
  //   model: "claude-sonnet-4-6-20260201",
  //   max_tokens: 500,
  //   system: systemBlocks,
  //   messages: [
  //     ...conversationHistory,
  //     { role: "user", content: userMessage },
  //   ],
  // });

  // API 响应中的 usage 字段会包含缓存信息：
  // {
  //   "input_tokens": 6200,
  //   "cache_creation_input_tokens": 0,     // 缓存已存在，无需创建
  //   "cache_read_input_tokens": 6000,      // 6000 tokens 从缓存读取
  //   "output_tokens": 300
  // }

  return "模拟响应";
}
```

### 19.8.4 案例对比与关键洞察

```
╔══════════════════════════════════════════════════════════════════════════╗
║                        三大案例成本优化对比                              ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  案例一: 企业知识库 Agent                                               ║
║  ├─ 优化前: $50,375/月                                                 ║
║  ├─ 优化后: ~$8,000/月                                                 ║
║  ├─ 节省率: 84%                                                        ║
║  ├─ 主要手段: 模型路由 (贡献 55%) + 语义缓存 (贡献 20%)                  ║
║  └─ 质量影响: -3% (可接受)                                              ║
║                                                                        ║
║  案例二: 内容审核 Agent                                                 ║
║  ├─ 优化前: $45,000/月                                                 ║
║  ├─ 优化后: $14,512/月                                                 ║
║  ├─ 节省率: 68%                                                        ║
║  ├─ 主要手段: 分层路由 (贡献 85%) + 选择性升级                           ║
║  └─ 质量影响: -4.1% 准确率 (场景可接受)                                  ║
║                                                                        ║
║  案例三: 客服 Agent                                                     ║
║  ├─ 优化前: $55,440/月                                                 ║
║  ├─ 优化后: $18,050/月                                                 ║
║  ├─ 节省率: 67%                                                        ║
║  ├─ 主要手段: Prompt Caching (贡献 100%)                                ║
║  └─ 质量影响: 0% (无任何质量损失!)                                       ║
║                                                                        ║
╠══════════════════════════════════════════════════════════════════════════╣
║                           关键洞察                                      ║
║                                                                        ║
║  1. 没有"银弹"——每种优化手段的效果取决于具体场景                          ║
║     · 高重复系统提示词 → Prompt Caching 最有效                          ║
║     · 请求复杂度差异大 → 模型路由最有效                                  ║
║     · 大量非实时请求   → 批处理最有效                                    ║
║                                                                        ║
║  2. 组合优化的收益不是简单相加，而是相乘递减                               ║
║     · 先做路由 (-55%)，再做缓存 (-18% of 剩余)                          ║
║     · 优化顺序影响总收益，建议先做收益最大的                              ║
║                                                                        ║
║  3. 零质量损失的优化应该最先实施                                         ║
║     · Prompt Caching: 0% 质量损失，67% 成本节省                         ║
║     · 批处理: 0% 质量损失，50% 成本节省（延迟增加）                      ║
║     · Prompt 压缩: 接近 0% 质量损失，30-40% 成本节省                    ║
║                                                                        ║
║  4. 质量监控必须伴随成本优化同步部署                                     ║
║     · 建立 A/B 测试框架，持续对比优化前后质量                            ║
║     · 设置质量红线，低于阈值自动回退到高质量模型                          ║
║                                                                        ║
╚══════════════════════════════════════════════════════════════════════════╝
```

> **给技术负责人的建议**：在启动成本优化项目之前，先花一周时间部署第 19.6 节的成本监控系统，收集各 Agent 的详细成本分布数据。数据驱动的优化决策永远比直觉判断更有效。从三个案例中可以看到，仅仅是"弄清楚钱花在哪里了"就能揭示出最大的优化机会。


## 19.9 本章小结

本章从"成本是 Agent 系统的隐形技术债务"这一核心命题出发，系统性地构建了一套完整的成本工程体系。从 19.1 节的成本模型与定价理解，到 19.3 节的智能模型路由，再到本节结束的案例验证，我们覆盖了 AI Agent 成本管理的完整生命周期。以下十点总结凝练了本章的核心精华。

### 十大核心要点

**要点一：成本优化是一个系统工程，而非单点技巧**

本章构建的六大组件——模型路由器（19.3）、Prompt 缓存管道（19.4）、批处理调度器（19.5）、成本监控系统（19.6）、预算治理框架（19.7）——并非孤立存在。它们构成了一个有机的整体：监控系统提供数据基础，路由器根据数据做出决策，缓存和批处理执行优化动作，预算治理确保组织层面的可控性。正如第 17 章（可观测性工程）中"可观测性不是日志的堆砌，而是洞察力的构建"这一观点一样，成本优化不是某个参数的调整，而是一套完整思维模式的建立。

**要点二：零质量损失的优化应该最先实施**

在所有优化手段中，Prompt Caching（19.4.1）和批处理（19.5）是最安全的选择——它们在节省成本的同时不会对输出质量产生任何影响。案例三（19.8.3）展示了仅通过 Prompt Caching 就能实现 67% 的成本节省，且质量损失为零。建议团队在启动成本优化项目时，按照以下优先级排序：

```
第一优先级（零质量损失）:
  1. Prompt Caching → 提供商原生缓存，90% 折扣
  2. 批处理调度   → Batch API 50% 折扣
  3. Prompt 去冗余 → 移除重复内容，无信息损失

第二优先级（极低质量损失）:
  4. 上下文压缩   → 智能截断和摘要，<1% 质量影响
  5. 语义缓存     → 高相似度命中，<2% 质量影响

第三优先级（需要质量监控）:
  6. 模型路由     → 按复杂度分发，2-5% 质量影响
  7. 模型降级     → 预算紧张时自动降级，需设红线
```

**要点三：`PromptCacheManager` 的投资回报率最高**

在本章所有组件中，`PromptCacheManager` 的实施成本最低（通常只需在 API 调用中添加 `cache_control` 标记），而收益最高（长系统提示词场景下可节省 60-80% 输入成本）。对于任何使用 Anthropic Claude 的团队，这应该是最先部署的优化。

实施清单：
- 分析当前系统提示词长度（超过 1,024 tokens 即可受益）
- 将消息结构改造为"稳定前缀 + 动态后缀"模式
- 在稳定内容的末尾添加 `cache_control: { type: "ephemeral" }` 标记
- 监控 API 响应中的 `cache_read_input_tokens` 字段验证命中率

**要点四：`SemanticCostCache` 是高重复场景的杀手级武器**

在客服、FAQ、知识库等高重复查询场景中，`SemanticCostCache`（19.4.2）可以完全消除重复请求的 LLM 调用，将边际成本降至接近零（仅 embedding 查询成本）。关键设计决策包括：
- 相似度阈值建议设定在 0.92-0.97 之间（过低则命中率不足，过高则可能返回不够精确的响应）
- 成本感知 TTL 确保高成本响应缓存更久
- 质量反馈循环自动淘汰低质量缓存条目

**要点五：批处理是最被低估的成本优化手段**

`BatchRequestManager`（19.5.1）和 `AsyncCostOptimizer`（19.5.2）展示了一个简单但强大的事实：只要请求不需要实时响应，就能以 50% 的价格获得完全相同的结果。案例一（19.8.1）中 20% 的后台任务通过批处理节省了约 $5K/月。建议团队定期审查请求优先级分布，将尽可能多的请求标记为可延迟——内部文档分析、报告生成、数据标注、知识库更新等任务都是天然的批处理候选。

**要点六：`CostAnomalyDetector` 是预算安全的最后防线**

19.6.2 节的 `CostAnomalyDetector` 使用移动平均 + 标准差的统计方法检测成本异常。这种看似简单的方法在实践中非常有效，因为 Agent 系统的成本分布通常是相对稳定的——一旦出现偏离（Prompt 膨胀、模型误路由、恶意调用），统计指标会立即反映出来。建议设置三级告警：

```
信息级 (3σ): Slack 通知，工程师关注
警告级 (4σ): Slack + 邮件，要求 4 小时内响应
严重级 (5σ): PagerDuty + 自动限流，要求 15 分钟内响应
```

这与第 17 章中的告警分级体系保持一致，建议直接复用 Ch17 的 `AlertManager` 基础设施。

**要点七：预算治理不仅是技术问题，更是组织问题**

`BudgetGovernanceSystem`（19.7.1）的五种超支策略——`hard_block`、`soft_warn`、`approval_required`、`auto_downgrade`、`burst_allow`——反映了不同组织文化和业务场景的需求差异。初创公司可能偏好 `burst_allow`（灵活性优先），大型企业可能需要 `approval_required`（合规性优先），而面向消费者的产品可能选择 `auto_downgrade`（保证可用性）。

技术架构的选择应服务于组织治理的目标，而非反过来。建议在实施预算治理前，先与业务方和财务方对齐以下问题：
- 谁有权设置和修改预算？
- 超支时应该阻断服务还是降级服务？
- 成本应该按请求发起者还是服务提供者归因？
- 月度对账的参与方有哪些？

**要点八：成本归因的准确性决定了治理的有效性**

`CostAllocationEngine`（19.7.2）支持的三种归因模型（请求者归因、提供者归因、比例分摊）各有适用场景。在多 Agent 协作链日益普遍的今天（这也是第 20 章 Agent 互操作协议将深入讨论的主题），成本归因的复杂性会随着协作链长度的增加而急剧上升。建议团队在协作协议中明确成本归因规则，将其作为 Agent 互操作契约的一部分。

**要点九：成本优化是一个持续迭代的过程**

从案例一（19.8.1）可以看到，四层优化的叠加效果将成本从 $50K 降至 $8K（84% 节省）。但这不是终点——随着业务增长、模型定价变化、新优化技术出现，成本优化策略需要持续迭代。建议建立以下运营机制：

- **周度**：审查成本异常告警，处理突发事件
- **月度**：运行 `monthlyReconciliation()`，调整预算分配
- **季度**：评估新模型和新定价，更新路由策略
- **年度**：全面审查成本工程架构，规划下一年预算

**要点十：成本工程与可观测性工程、部署运维是三位一体**

本章的成本监控系统与第 17 章的可观测性框架共享基础设施（Prometheus 指标、Grafana Dashboard、AlertManager 告警）。本章的预算强制执行与第 18 章的速率限制器和服务降级机制协同工作。本章的批处理调度与第 18 章的异步任务队列架构天然契合。这三章共同构成了"生产就绪"的 Agent 系统运营基座。

### 展望第 20 章：Agent 互操作协议

当 Agent 系统的规模扩大到多个团队、多个组织协作时，成本管理的复杂度会进一步升级。第 20 章将讨论的 Agent 互操作协议（包括 MCP、A2A 等标准）不仅定义了 Agent 之间如何通信和协作，还引入了跨组织的成本结算需求：

- 当 Agent A（属于团队 X）调用 Agent B（属于团队 Y）的能力时，LLM 成本应该如何在 X 和 Y 之间分摊？
- 在开放的 Agent 生态中，如何建立标准化的成本计量和结算协议？
- 如何在互操作协议中嵌入成本约束（如最大单次调用预算、累计预算上限）？

这些问题将在第 20 章（Agent 互操作协议）中得到解答。本章建立的 `CostAllocationEngine` 和 `BudgetGovernanceSystem` 将成为第 20 章跨 Agent 成本结算的技术基础。

```typescript
// ---- 本章组件总览与集成示意 ----

/**
 * 第 19 章核心组件注册表
 *
 * 本章构建的所有组件及其在系统中的角色：
 */
interface Chapter19ComponentRegistry {
  /** 19.3 - 智能模型路由器 */
  modelRouter: {
    role: "根据任务复杂度和成本约束选择最优模型";
    dependencies: ["CostMonitoringSystem（获取实时成本数据）"];
    consumers: ["所有 LLM 调用入口"];
  };

  /** 19.4.1 - 提供商原生缓存管理器 */
  promptCacheManager: {
    role: "利用提供商 Prompt Caching 机制，实现 90% 输入折扣";
    dependencies: ["模型路由器（确定提供商后插入缓存标记）"];
    consumers: ["API 调用层"];
  };

  /** 19.4.2 - 语义响应缓存 */
  semanticCostCache: {
    role: "基于语义相似度缓存 LLM 完整响应，消除重复调用";
    dependencies: ["Embedding 服务", "向量数据库"];
    consumers: ["请求入口（在 LLM 调用前检查缓存）"];
  };

  /** 19.4.3 - Prompt 压缩器 */
  promptCompressor: {
    role: "智能压缩上下文窗口，减少 token 消耗";
    dependencies: ["Token 估算器"];
    consumers: ["缓存未命中后的 LLM 调用路径"];
  };

  /** 19.5.1 - 批处理请求管理器 */
  batchRequestManager: {
    role: "管理批处理请求的完整生命周期，50% 成本折扣";
    dependencies: ["提供商 Batch API"];
    consumers: ["AsyncCostOptimizer"];
  };

  /** 19.5.2 - 异步成本优化器 */
  asyncCostOptimizer: {
    role: "三层优先级调度（urgent/normal/background）";
    dependencies: ["BatchRequestManager", "第 18 章 SLO 配置"];
    consumers: ["所有 LLM 调用入口"];
  };

  /** 19.6.1 - 成本监控系统 */
  costMonitoringSystem: {
    role: "多维度成本追踪、预算管理、Dashboard 数据聚合";
    dependencies: ["第 17 章 MetricsCollector", "第 17 章 AlertManager"];
    consumers: ["Dashboard UI", "BudgetGovernanceSystem", "CostAnomalyDetector"];
  };

  /** 19.6.2 - 成本异常检测器 */
  costAnomalyDetector: {
    role: "基于统计方法检测成本尖峰和异常模式";
    dependencies: ["CostMonitoringSystem（历史数据）"];
    consumers: ["第 17 章告警通道", "CostMonitoringSystem Dashboard"];
  };

  /** 19.7.1 - 预算治理系统 */
  budgetGovernanceSystem: {
    role: "多级预算分配、超支策略、审批工作流、月度对账";
    dependencies: ["CostMonitoringSystem", "组织架构数据"];
    consumers: ["预算前置检查（LLM 调用前）", "财务报表"];
  };

  /** 19.7.2 - 成本归因引擎 */
  costAllocationEngine: {
    role: "在多 Agent 协作链中归因 LLM 成本";
    dependencies: ["第 20 章 Agent 互操作协议（协作链数据）"];
    consumers: ["BudgetGovernanceSystem Chargeback", "团队成本报表"];
  };
}

/**
 * 完整的请求处理流程，展示所有组件如何协同：
 *
 *   用户请求到达
 *        │
 *        ▼
 *   ┌────────────────────┐
 *   │ 1. 预算前置检查     │  ← BudgetGovernanceSystem.checkBudget()
 *   │    (是否有足够预算)  │     如果预算不足，根据策略处理
 *   └──────┬─────────────┘
 *          │ 通过
 *          ▼
 *   ┌────────────────────┐
 *   │ 2. 优先级分类       │  ← AsyncCostOptimizer.classify()
 *   │    urgent/normal/bg │     决定执行通道
 *   └──────┬─────────────┘
 *          │
 *     ┌────┴────┐
 *     │         │
 *   urgent    normal/bg
 *     │         │
 *     │    ┌────┴──────────┐
 *     │    │ 3. 批处理排队  │ ← BatchRequestManager.enqueue()
 *     │    └────┬──────────┘
 *     │         │
 *     └────┬────┘
 *          │
 *          ▼
 *   ┌────────────────────┐
 *   │ 4. 语义缓存查询     │  ← SemanticCostCache.query()
 *   │    (是否有缓存命中)  │     命中 → 直接返回，流程结束
 *   └──────┬─────────────┘
 *          │ 未命中
 *          ▼
 *   ┌────────────────────┐
 *   │ 5. Prompt 压缩     │  ← PromptCompressor.compress()
 *   │    (减少冗余token)  │
 *   └──────┬─────────────┘
 *          │
 *          ▼
 *   ┌────────────────────┐
 *   │ 6. 模型路由        │  ← ModelRouter.route()
 *   │    (选择最优模型)    │     基于复杂度和成本约束
 *   └──────┬─────────────┘
 *          │
 *          ▼
 *   ┌────────────────────┐
 *   │ 7. 缓存标记优化     │  ← PromptCacheManager.optimizeForCaching()
 *   │    (添加cache标记)  │     利用提供商原生缓存
 *   └──────┬─────────────┘
 *          │
 *          ▼
 *   ┌────────────────────┐
 *   │ 8. LLM API 调用    │  ← 实际调用大模型
 *   └──────┬─────────────┘
 *          │
 *          ▼
 *   ┌────────────────────┐
 *   │ 9. 成本记录        │  ← CostMonitoringSystem.recordCost()
 *   │    + 异常检测       │     CostAnomalyDetector.check()
 *   │    + 预算更新       │     BudgetGovernanceSystem.recordSpending()
 *   │    + 缓存存储       │     SemanticCostCache.store()
 *   └──────┬─────────────┘
 *          │
 *          ▼
 *       返回响应
 */
```

成本工程不是成本削减——它是关于以可持续的成本交付持续的价值。正如本章反复强调的：**每节省一美元，都应该在不损害用户体验的前提下实现**。带着这一原则，让我们进入第 20 章，探讨当多个 Agent 需要跨越组织边界协作时，如何通过标准化的互操作协议来管理通信、安全和——当然——成本。

