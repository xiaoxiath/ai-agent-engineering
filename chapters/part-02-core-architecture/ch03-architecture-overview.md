# 第三章：架构总览 — Agent 的七层模型

> "好的架构让复杂系统变得可理解、可测试、可演进。"

---

## 3.1 七层参考架构

我们提出 Agent 系统的七层参考架构模型，自底向上分别是：

```
┌─────────────────────────────────┐
│  Layer 7: Orchestration         │  编排层：多 Agent 协调
├─────────────────────────────────┤
│  Layer 6: Evaluation            │  评测层：质量保障
├─────────────────────────────────┤
│  Layer 5: Security & Trust      │  安全层：防护与审计
├─────────────────────────────────┤
│  Layer 4: Memory & Knowledge    │  记忆层：持久化与检索
├─────────────────────────────────┤
│  Layer 3: Tool System           │  工具层：外部能力集成
├─────────────────────────────────┤
│  Layer 2: Context Engine        │  上下文层：信息管理
├─────────────────────────────────┤
│  Layer 1: Agent Core            │  核心层：推理引擎
└─────────────────────────────────┘
```

### 3.1.1 Layer 1: Agent Core（核心层）

Agent 核心层是整个系统的心脏，负责接收上下文、进行推理、做出决策。

```typescript
// Agent 核心循环
async function agentLoop(task: string, tools: Tool[]): Promise<string> {
  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: task },
  ];

  while (true) {
    const response = await llm.chat({ messages, tools });

    if (response.finishReason === 'stop') {
      return response.content;
    }

    if (response.finishReason === 'tool_use') {
      for (const toolCall of response.toolCalls) {
        const result = await executeTool(toolCall);
        messages.push(
          { role: 'assistant', content: '', toolCalls: [toolCall] },
          { role: 'tool', toolCallId: toolCall.id, content: result }
        );
      }
    }
  }
}
```

### 3.1.2 Layer 2: Context Engine（上下文层）

上下文层负责管理和优化进入 LLM 的所有信息。

### 3.1.3 Layer 3: Tool System（工具层）

工具层提供 Agent 与外部世界交互的能力。

### 3.1.4 Layer 4: Memory & Knowledge（记忆层）

记忆层为 Agent 提供短期和长期记忆能力。

### 3.1.5 Layer 5: Security & Trust（安全层）

安全层保护 Agent 免受攻击，确保操作在安全边界内。

### 3.1.6 Layer 6: Evaluation（评测层）

评测层确保 Agent 的输出质量和行为一致性。

### 3.1.7 Layer 7: Orchestration（编排层）

编排层管理多个 Agent 之间的协作和通信。

---

## 3.2 Agent Loop 模式

### 3.2.1 ReAct 模式

ReAct（Reasoning + Acting）是最基础也是最广泛使用的 Agent 循环模式：

```typescript
async function reactLoop(
  task: string,
  tools: Tool[],
  maxIterations: number = 10
): Promise<string> {
  const systemPrompt = `你是一个有用的 AI 助手。
你可以使用以下工具来完成任务。
对于每一步，先思考（Thought），再决定行动（Action）。
观察结果后，决定下一步。`;

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: task },
  ];

  for (let i = 0; i < maxIterations; i++) {
    const response = await llm.chat({
      messages,
      tools: tools.map(t => t.definition),
    });

    // 完成：LLM 给出最终答案
    if (response.finishReason === 'stop') {
      return response.content;
    }

    // 行动：执行工具调用
    for (const toolCall of response.toolCalls ?? []) {
      try {
        const result = await executeTool(toolCall.name, toolCall.args);
        messages.push({
          role: 'tool',
          toolCallId: toolCall.id,
          content: JSON.stringify(result),
        });
      } catch (error) {
        messages.push({
          role: 'tool',
          toolCallId: toolCall.id,
          content: `错误: ${error.message}`,
        });
      }
    }
  }

  return '达到最大迭代次数，任务未完成';
}
```

### 3.2.2 Plan-and-Execute 模式

适用于更复杂的任务，先制定计划再逐步执行：

```typescript
interface Plan {
  steps: PlanStep[];
  currentStepIndex: number;
}

interface PlanStep {
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: string;
}

async function planAndExecute(task: string): Promise<string> {
  // Phase 1: 规划
  const plan = await createPlan(task);

  // Phase 2: 逐步执行
  for (let i = 0; i < plan.steps.length; i++) {
    plan.steps[i].status = 'in_progress';

    const result = await executeStep(plan.steps[i], plan);
    plan.steps[i].result = result;
    plan.steps[i].status = 'completed';

    // 可选：执行后重新评估计划
    const needsReplan = await evaluatePlan(plan, task);
    if (needsReplan) {
      const revisedSteps = await revisePlan(plan, task);
      plan.steps.splice(i + 1, Infinity, ...revisedSteps);
    }
  }

  // Phase 3: 汇总
  return synthesizeResults(plan);
}
```

### 3.2.3 自适应模式

根据任务复杂度动态选择策略：

```typescript
class AdaptiveAgent {
  async execute(task: string): Promise<string> {
    const complexity = await this.assessComplexity(task);

    switch (complexity) {
      case 'simple':
        return this.directAnswer(task);
      case 'moderate':
        return this.reactLoop(task, 5);
      case 'complex':
        return this.planAndExecute(task);
      case 'multi-agent':
        return this.delegateToTeam(task);
    }
  }

  private async assessComplexity(
    task: string
  ): Promise<'simple' | 'moderate' | 'complex' | 'multi-agent'> {
    const response = await this.llm.chat({
      messages: [{
        role: 'user',
        content: `评估以下任务的复杂度：${task}
返回 JSON: { "complexity": "simple|moderate|complex|multi-agent", "reason": "..." }`
      }],
      response_format: { type: 'json_object' },
    });
    return JSON.parse(response.content).complexity;
  }

  private async directAnswer(task: string): Promise<string> { return ''; }
  private async reactLoop(task: string, max: number): Promise<string> { return ''; }
  private async planAndExecute(task: string): Promise<string> { return ''; }
  private async delegateToTeam(task: string): Promise<string> { return ''; }
  private llm: any;
}
```

---

## 3.3 状态管理基础

Agent 的状态管理借鉴 Redux 的 Reducer 模式：

```typescript
interface AgentState {
  messages: Message[];
  currentPlan: Plan | null;
  toolResults: Map<string, any>;
  metadata: {
    iterationCount: number;
    totalTokens: number;
    startTime: number;
  };
}

type AgentEvent =
  | { type: 'USER_MESSAGE'; payload: string }
  | { type: 'LLM_RESPONSE'; payload: LLMResponse }
  | { type: 'TOOL_RESULT'; payload: { toolCallId: string; result: any } }
  | { type: 'PLAN_CREATED'; payload: Plan }
  | { type: 'ERROR'; payload: Error };

function agentReducer(state: AgentState, event: AgentEvent): AgentState {
  switch (event.type) {
    case 'USER_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, { role: 'user', content: event.payload }],
      };
    case 'TOOL_RESULT':
      return {
        ...state,
        toolResults: new Map(state.toolResults).set(
          event.payload.toolCallId,
          event.payload.result
        ),
        metadata: {
          ...state.metadata,
          iterationCount: state.metadata.iterationCount + 1,
        },
      };
    default:
      return state;
  }
}
```

---

## 3.4 本章小结

1. **七层参考架构**提供了理解 Agent 系统的统一框架
2. **ReAct** 是最基础的 Agent 循环模式，适合大多数场景
3. **Plan-and-Execute** 适合需要长期规划的复杂任务
4. **自适应模式**根据任务复杂度动态选择策略
5. **Reducer 模式**提供确定性的状态管理

---

> **延伸阅读**
> - Shunyu Yao et al., "ReAct: Synergizing Reasoning and Acting" (ICLR 2023)
> - Wang et al., "Plan-and-Solve Prompting" (ACL 2023)
