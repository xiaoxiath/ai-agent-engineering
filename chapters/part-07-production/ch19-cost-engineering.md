# 第十九章：成本工程 — Agent 经济学

> "最好的 Agent 不是最贵的，而是在预算内效果最好的。"

---

## 19.1 成本计算器

```typescript
class CostCalculator {
  private pricing: Record<string, { input: number; output: number }> = {
    'gpt-4o':           { input: 2.50, output: 10.00 },
    'gpt-4o-mini':      { input: 0.15, output: 0.60 },
    'claude-sonnet-4':  { input: 3.00, output: 15.00 },
    'claude-haiku-3.5': { input: 0.80, output: 4.00 },
    'gemini-2.5-pro':   { input: 1.25, output: 10.00 },
    'gemini-2.5-flash': { input: 0.15, output: 0.60 },
  };

  calculate(model: string, inputTokens: number, outputTokens: number): number {
    const price = this.pricing[model];
    if (!price) return 0;
    return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
  }

  estimateAgentTask(params: {
    model: string;
    avgInputTokens: number;
    avgOutputTokens: number;
    avgIterations: number;
  }): number {
    return this.calculate(
      params.model,
      params.avgInputTokens * params.avgIterations,
      params.avgOutputTokens * params.avgIterations,
    );
  }
}
```

---

## 19.2 不可靠性税分析

```typescript
class UnreliabilityTaxAnalyzer {
  analyze(logs: ExecutionLog[]): {
    retryRate: number;
    avgRetryCost: number;
    validationOverhead: number;
    totalTax: number;
  } {
    const retries = logs.filter(l => l.wasRetry);
    const retryRate = retries.length / logs.length;
    const avgRetryCost = retries.reduce((s, l) => s + l.cost, 0) / (retries.length || 1);

    return {
      retryRate,
      avgRetryCost,
      validationOverhead: logs.reduce((s, l) => s + (l.validationCost ?? 0), 0),
      totalTax: retries.reduce((s, l) => s + l.cost, 0),
    };
  }
}

interface ExecutionLog { cost: number; wasRetry: boolean; validationCost?: number; }
```

---

## 19.3 四层成本优化

```typescript
class CostOptimizer {
  // 层 1: 模型路由 — 简单任务用便宜模型
  async routeModel(task: string): Promise<string> {
    const complexity = await this.assessComplexity(task);
    if (complexity === 'simple') return 'gpt-4o-mini';
    if (complexity === 'moderate') return 'claude-haiku-3.5';
    return 'claude-sonnet-4';
  }

  // 层 2: 提示压缩 — 减少输入 token
  compressPrompt(prompt: string): string {
    // 移除多余空白
    let compressed = prompt.replace(/\n{3,}/g, '\n\n');
    // 移除注释
    compressed = compressed.replace(/<!--[\s\S]*?-->/g, '');
    return compressed;
  }

  // 层 3: 缓存策略 — 避免重复计算
  private cache = new Map<string, string>();
  async withCache(key: string, fn: () => Promise<string>): Promise<string> {
    if (this.cache.has(key)) return this.cache.get(key)!;
    const result = await fn();
    this.cache.set(key, result);
    return result;
  }

  // 层 4: 批处理 — 合并多个请求
  async batchProcess(tasks: string[], model: string): Promise<string[]> {
    // 将多个小任务合并为一个批次请求
    return tasks.map(() => '');
  }

  private async assessComplexity(task: string): Promise<string> { return 'moderate'; }
}
```

---

## 19.4 预算管理

```typescript
class CostGovernor {
  private spent = 0;

  constructor(
    private dailyBudget: number,
    private alertThreshold: number = 0.8,
  ) {}

  async approve(estimatedCost: number): Promise<boolean> {
    if (this.spent + estimatedCost > this.dailyBudget) {
      console.warn(`预算超限！已花费 $${this.spent}，预算 $${this.dailyBudget}`);
      return false;
    }
    if (this.spent + estimatedCost > this.dailyBudget * this.alertThreshold) {
      console.warn(`预算告警：已使用 ${((this.spent / this.dailyBudget) * 100).toFixed(1)}%`);
    }
    return true;
  }

  record(cost: number): void { this.spent += cost; }
  getRemaining(): number { return this.dailyBudget - this.spent; }
}
```

---

## 19.5 本章小结

1. **成本计算器**：精确计算每次 Agent 任务的成本
2. **不可靠性税**：量化重试和验证的隐性成本
3. **四层优化**：模型路由 → 提示压缩 → 缓存 → 批处理
4. **预算管理**：设定预算上限和告警阈值
