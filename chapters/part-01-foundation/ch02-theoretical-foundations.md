# 第二章：理论基础 — LLM 作为推理引擎

> "LLM 不是数据库，不是搜索引擎，而是一个概率推理引擎。理解这一点是构建优秀 Agent 的前提。"

---

## 2.1 LLM 的本质：概率推理引擎

### 2.1.1 从补全到推理

大语言模型的训练目标是"下一个 token 预测"，但涌现出的能力远超简单的文本补全。当模型规模足够大时，它展现出了：

- **逻辑推理**：能够进行多步逻辑推导
- **类比思维**：能够从已知模式迁移到新场景
- **工具使用**：能够理解何时以及如何调用外部工具
- **规划能力**：能够将复杂任务分解为子步骤

### 2.1.2 确定性外壳与概率性内核

Agent 架构的核心哲学是**确定性外壳包裹概率性内核**：

```typescript
// 确定性外壳：可预测、可测试、可审计
class DeterministicShell {
  private state: AgentState;
  private tools: ToolRegistry;
  private guardrails: GuardrailSystem;

  async processAction(action: AgentAction): Promise<ActionResult> {
    // 1. 验证 action 合法性（确定性）
    const validation = this.guardrails.validate(action);
    if (!validation.passed) {
      return { success: false, error: validation.reason };
    }

    // 2. 执行工具调用（确定性）
    const result = await this.tools.execute(action.tool, action.params);

    // 3. 更新状态（确定性，使用 reducer）
    this.state = agentReducer(this.state, {
      type: 'TOOL_RESULT',
      payload: result
    });

    return { success: true, data: result };
  }
}

// 概率性内核：LLM 推理决策
class ProbabilisticCore {
  async decide(context: AgentContext): Promise<AgentAction> {
    const response = await this.llm.chat({
      messages: context.messages,
      tools: context.availableTools,
      temperature: 0, // 降低随机性
    });
    return this.parseAction(response);
  }
}
```

### 2.1.3 Token 经济学

理解 Token 消耗对 Agent 系统至关重要：

```typescript
class TokenEconomicsAnalyzer {
  // 各模型定价（USD per 1M tokens, 2025Q1）
  private pricing: Record<string, { input: number; output: number }> = {
    'gpt-4o':          { input: 2.50, output: 10.00 },
    'gpt-4o-mini':     { input: 0.15, output: 0.60 },
    'claude-sonnet-4': { input: 3.00, output: 15.00 },
    'claude-haiku-3.5':{ input: 0.80, output: 4.00 },
    'gemini-2.5-pro':  { input: 1.25, output: 10.00 },
    'gemini-2.5-flash':{ input: 0.15, output: 0.60 },
  };

  estimateAgentCost(params: {
    model: string;
    avgInputTokens: number;
    avgOutputTokens: number;
    avgIterations: number;
    dailyTasks: number;
  }): { perTask: number; daily: number; monthly: number } {
    const price = this.pricing[params.model];
    const perIteration =
      (params.avgInputTokens * price.input +
        params.avgOutputTokens * price.output) / 1_000_000;
    const perTask = perIteration * params.avgIterations;
    const daily = perTask * params.dailyTasks;
    return { perTask, daily, monthly: daily * 30 };
  }
}
```

---

## 2.2 Agent 的认知架构

### 2.2.1 感知-推理-行动循环

Agent 的认知过程可以抽象为经典的 **Perception-Reasoning-Action** 循环：

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│  感知    │ ──► │  推理    │ ──► │  行动    │
│ Perceive│     │ Reason  │     │  Act    │
└────┬────┘     └─────────┘     └────┬────┘
     │                                │
     └────────── 反馈 ◄───────────────┘
```

### 2.2.2 System 1 vs System 2 思维

借鉴 Daniel Kahneman 的双系统理论：

| 维度 | System 1（快思考） | System 2（慢思考） |
|------|-------------------|-------------------|
| 速度 | 快 | 慢 |
| 消耗 | 低 Token | 高 Token |
| 适用 | 简单分类、路由 | 复杂推理、规划 |
| Agent 实现 | 直接响应/缓存命中 | ReAct / ToT / 多步推理 |
| 典型模型 | Flash/Mini 模型 | Pro/Opus 模型 |

### 2.2.3 认知 Agent 实现

```typescript
class CognitiveAgent {
  private fastModel: LLM;  // System 1
  private slowModel: LLM;  // System 2

  async process(input: string): Promise<string> {
    // 先用 System 1 快速评估复杂度
    const complexity = await this.fastModel.classify(input, {
      categories: ['simple', 'moderate', 'complex']
    });

    switch (complexity) {
      case 'simple':
        // System 1 直接回答
        return this.fastModel.generate(input);

      case 'moderate':
        // System 1 + 工具调用
        return this.reactLoop(this.fastModel, input, 3);

      case 'complex':
        // System 2 深度推理
        return this.reactLoop(this.slowModel, input, 10);
    }
  }

  private async reactLoop(
    model: LLM, input: string, maxIter: number
  ): Promise<string> {
    const messages = [{ role: 'user' as const, content: input }];
    for (let i = 0; i < maxIter; i++) {
      const resp = await model.chat({ messages, tools: this.tools });
      if (resp.finishReason === 'stop') return resp.content;
      for (const tc of resp.toolCalls ?? []) {
        const result = await this.executeTool(tc);
        messages.push({ role: 'tool', content: JSON.stringify(result) });
      }
    }
    return '任务未在限定步数内完成';
  }

  private async executeTool(toolCall: any): Promise<any> {
    // 工具执行逻辑
    return {};
  }

  private tools: any[] = [];
}
```

---

## 2.3 从 Prompt Engineering 到 Context Engineering

### 2.3.1 Prompt Engineering 的局限

Prompt Engineering 关注的是"如何写出更好的提示词"，但在 Agent 系统中，这远远不够。Agent 需要管理的上下文包括：

- 系统提示词（System Prompt）
- 对话历史（Conversation History）
- 工具定义和返回值（Tool Definitions & Results）
- 检索到的知识（RAG Context）
- Agent 的记忆和笔记（Memory & Notes）
- 其他 Agent 的消息（Multi-Agent Messages）

### 2.3.2 Context Engineering 的定义

Anthropic 的 Zack Witten 将其定义为：

> **Context Engineering** 是一门构建动态系统的学科，它在恰当的时间以恰当的格式提供恰当的信息和工具。

这不是关于"写更好的提示词"，而是关于"构建更好的上下文供给系统"。

### 2.3.3 五大 Context Engineering 原则

1. **信息密度最大化**：每个 token 都应该有价值
2. **时序相关性**：最相关的信息放在最近的位置
3. **结构化组织**：使用 XML 标签等结构化信息
4. **动态裁剪**：根据任务动态调整上下文内容
5. **隔离与封装**：不同来源的信息明确标记边界

---

## 2.4 不可靠性税

### 2.4.1 概念定义

**不可靠性税（Unreliability Tax）**是指 Agent 系统为应对 LLM 的不确定性而付出的额外工程成本：

```typescript
interface UnreliabilityTax {
  // 重试成本：LLM 输出格式错误需要重试
  retryOverhead: number;
  // 验证成本：需要额外的输出验证逻辑
  validationOverhead: number;
  // 降级成本：需要维护备用处理路径
  fallbackOverhead: number;
  // 监控成本：需要更多的日志和告警
  monitoringOverhead: number;
  // 人工介入成本：需要 HITL 审批机制
  humanReviewOverhead: number;
}
```

### 2.4.2 降低不可靠性税的策略

| 策略 | 方法 | 效果 |
|------|------|------|
| 结构化输出 | JSON Schema / Zod 约束 | 消除格式错误 |
| 工具约束 | 限定可选工具集 | 减少错误调用 |
| 温度控制 | temperature=0 | 提高一致性 |
| 少样本示例 | 提供成功案例 | 引导正确行为 |
| 输出验证 | 运行时类型检查 | 捕获异常输出 |
| 重试机制 | 指数退避重试 | 容忍临时失败 |

---

## 2.5 本章小结

1. **LLM 是概率推理引擎**：理解其本质才能正确使用
2. **确定性外壳 + 概率性内核**：Agent 架构的核心设计哲学
3. **Token 经济学**：成本意识是 Agent 工程化的基础
4. **Context Engineering > Prompt Engineering**：从单一提示到系统性的上下文工程
5. **不可靠性税**：Agent 工程师必须面对的隐性成本

---

> **延伸阅读**
> - Anthropic, "Context Engineering for AI Agents" (2025)
> - Daniel Kahneman, "Thinking, Fast and Slow" (2011)
> - Andrej Karpathy, "State of GPT" (2023)
