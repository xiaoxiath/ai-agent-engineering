# 第四章：状态管理 — 确定性的基石

> "在概率性的 LLM 世界中，确定性的状态管理是 Agent 可靠性的基石。"

---

## 4.1 为什么需要状态管理

Agent 与简单 Chatbot 的关键区别之一是**有状态**。Agent 在执行任务过程中需要追踪：
- 当前的对话历史和上下文
- 已执行的工具调用及结果
- 任务进度和计划
- 累计的 Token 消耗和成本
- 错误信息和重试状态

### 4.1.1 无状态的代价

```typescript
// ❌ 无状态设计：每次调用都是独立的
async function statelessAgent(query: string): Promise<string> {
  return llm.chat([{ role: 'user', content: query }]);
}
// 问题：无法追踪多步任务、无法恢复中断、无法审计
```

---

## 4.2 Reducer 模式

借鉴 Redux 的 Reducer 模式，为 Agent 提供确定性的状态转换：

```typescript
// Agent 状态定义
interface AgentState {
  status: 'idle' | 'thinking' | 'acting' | 'waiting' | 'done' | 'error';
  messages: Message[];
  plan: PlanStep[] | null;
  currentStepIndex: number;
  toolResults: Record<string, unknown>;
  memory: {
    workingMemory: string[];
    notes: string;
  };
  metrics: {
    iterationCount: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCost: number;
    startTime: number;
    toolCallCount: number;
  };
  errors: AgentError[];
}

// 事件类型（12种核心事件）
type AgentEvent =
  | { type: 'TASK_STARTED'; payload: { task: string; timestamp: number } }
  | { type: 'LLM_REQUEST_SENT'; payload: { model: string } }
  | { type: 'LLM_RESPONSE_RECEIVED'; payload: { content: string; toolCalls?: ToolCall[]; usage: TokenUsage } }
  | { type: 'TOOL_CALL_STARTED'; payload: { toolName: string; args: unknown } }
  | { type: 'TOOL_CALL_COMPLETED'; payload: { toolCallId: string; result: unknown } }
  | { type: 'TOOL_CALL_FAILED'; payload: { toolCallId: string; error: string } }
  | { type: 'PLAN_CREATED'; payload: { steps: PlanStep[] } }
  | { type: 'PLAN_STEP_COMPLETED'; payload: { stepIndex: number; result: string } }
  | { type: 'MEMORY_UPDATED'; payload: { key: string; value: string } }
  | { type: 'NOTES_UPDATED'; payload: { notes: string } }
  | { type: 'TASK_COMPLETED'; payload: { result: string } }
  | { type: 'ERROR_OCCURRED'; payload: { error: AgentError } };

// 纯函数 Reducer
function agentReducer(state: AgentState, event: AgentEvent): AgentState {
  switch (event.type) {
    case 'TASK_STARTED':
      return {
        ...state,
        status: 'thinking',
        messages: [
          ...state.messages,
          { role: 'user', content: event.payload.task },
        ],
        metrics: { ...state.metrics, startTime: event.payload.timestamp },
      };

    case 'LLM_RESPONSE_RECEIVED':
      return {
        ...state,
        status: event.payload.toolCalls?.length ? 'acting' : 'thinking',
        messages: [
          ...state.messages,
          { role: 'assistant', content: event.payload.content },
        ],
        metrics: {
          ...state.metrics,
          iterationCount: state.metrics.iterationCount + 1,
          totalInputTokens: state.metrics.totalInputTokens + event.payload.usage.input,
          totalOutputTokens: state.metrics.totalOutputTokens + event.payload.usage.output,
        },
      };

    case 'TOOL_CALL_COMPLETED':
      return {
        ...state,
        status: 'thinking',
        toolResults: {
          ...state.toolResults,
          [event.payload.toolCallId]: event.payload.result,
        },
        metrics: {
          ...state.metrics,
          toolCallCount: state.metrics.toolCallCount + 1,
        },
      };

    case 'TASK_COMPLETED':
      return { ...state, status: 'done' };

    case 'ERROR_OCCURRED':
      return {
        ...state,
        status: 'error',
        errors: [...state.errors, event.payload.error],
      };

    default:
      return state;
  }
}
```

---

## 4.3 检查点与时间旅行调试

### 4.3.1 检查点管理器

```typescript
class CheckpointManager {
  private checkpoints: Map<string, AgentState> = new Map();

  save(id: string, state: AgentState): void {
    // 深拷贝以确保不可变性
    this.checkpoints.set(id, JSON.parse(JSON.stringify(state)));
  }

  restore(id: string): AgentState | null {
    const cp = this.checkpoints.get(id);
    return cp ? JSON.parse(JSON.stringify(cp)) : null;
  }

  list(): string[] {
    return Array.from(this.checkpoints.keys());
  }
}
```

### 4.3.2 时间旅行调试器

```typescript
class TimeTravelDebugger {
  private eventLog: Array<{ timestamp: number; event: AgentEvent; stateAfter: AgentState }> = [];
  private currentState: AgentState;

  constructor(initialState: AgentState) {
    this.currentState = initialState;
  }

  dispatch(event: AgentEvent): AgentState {
    this.currentState = agentReducer(this.currentState, event);
    this.eventLog.push({
      timestamp: Date.now(),
      event,
      stateAfter: JSON.parse(JSON.stringify(this.currentState)),
    });
    return this.currentState;
  }

  // 回到第 n 步
  travelTo(stepIndex: number): AgentState {
    if (stepIndex < 0 || stepIndex >= this.eventLog.length) {
      throw new Error(`无效步骤: ${stepIndex}`);
    }
    this.currentState = JSON.parse(JSON.stringify(this.eventLog[stepIndex].stateAfter));
    return this.currentState;
  }

  // 从第 n 步重放
  replayFrom(stepIndex: number): AgentState {
    const state = this.travelTo(stepIndex);
    // 从 stepIndex+1 开始重新执行后续事件
    for (let i = stepIndex + 1; i < this.eventLog.length; i++) {
      this.currentState = agentReducer(this.currentState, this.eventLog[i].event);
    }
    return this.currentState;
  }

  getEventLog() { return this.eventLog; }
}
```

---

## 4.4 本章小结

1. **有状态管理**是 Agent 区别于 Chatbot 的核心特征
2. **Reducer 模式**提供确定性、可预测的状态转换
3. **12 种核心事件**覆盖 Agent 运行的完整生命周期
4. **检查点**和**时间旅行调试**大幅提升可观测性和问题排查效率
5. 所有状态转换应该是**纯函数**，确保可测试和可重放
