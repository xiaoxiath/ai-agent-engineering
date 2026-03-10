/**
 * 示例 02: Agent 状态管理
 * 对应章节: 第4章 - 状态管理的艺术
 *
 * 演示 Reducer 模式的 Agent 状态管理
 */

// ============================================================
// 类型定义
// ============================================================

interface AgentState {
  status: 'idle' | 'thinking' | 'acting' | 'waiting' | 'completed' | 'error';
  messages: Message[];
  toolResults: ToolResult[];
  plan: PlanStep[];
  currentStep: number;
  metadata: Record<string, any>;
  error?: string;
}

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
}

interface ToolResult {
  toolName: string;
  input: any;
  output: string;
  duration: number;
  success: boolean;
}

interface PlanStep {
  id: number;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  toolName?: string;
}

// ============================================================
// Event 定义
// ============================================================

type AgentEvent =
  | { type: 'USER_MESSAGE'; payload: { content: string } }
  | { type: 'PLAN_CREATED'; payload: { steps: PlanStep[] } }
  | { type: 'STEP_STARTED'; payload: { stepId: number } }
  | { type: 'TOOL_CALLED'; payload: { toolName: string; input: any } }
  | { type: 'TOOL_RESULT'; payload: { toolName: string; output: string; duration: number; success: boolean } }
  | { type: 'STEP_COMPLETED'; payload: { stepId: number } }
  | { type: 'STEP_FAILED'; payload: { stepId: number; error: string } }
  | { type: 'LLM_RESPONSE'; payload: { content: string } }
  | { type: 'TASK_COMPLETED'; payload: { summary: string } }
  | { type: 'ERROR'; payload: { message: string } };

// ============================================================
// Reducer (纯函数)
// ============================================================

function agentReducer(state: AgentState, event: AgentEvent): AgentState {
  switch (event.type) {
    case 'USER_MESSAGE':
      return {
        ...state,
        status: 'thinking',
        messages: [...state.messages, {
          role: 'user',
          content: event.payload.content,
          timestamp: Date.now()
        }]
      };

    case 'PLAN_CREATED':
      return {
        ...state,
        plan: event.payload.steps,
        currentStep: 0
      };

    case 'STEP_STARTED':
      return {
        ...state,
        status: 'acting',
        plan: state.plan.map(s =>
          s.id === event.payload.stepId
            ? { ...s, status: 'in_progress' as const }
            : s
        )
      };

    case 'TOOL_CALLED':
      return {
        ...state,
        status: 'waiting',
        metadata: {
          ...state.metadata,
          pendingTool: event.payload.toolName
        }
      };

    case 'TOOL_RESULT':
      return {
        ...state,
        status: 'thinking',
        toolResults: [...state.toolResults, {
          toolName: event.payload.toolName,
          input: state.metadata.pendingTool,
          output: event.payload.output,
          duration: event.payload.duration,
          success: event.payload.success
        }],
        metadata: { ...state.metadata, pendingTool: undefined }
      };

    case 'STEP_COMPLETED':
      return {
        ...state,
        currentStep: state.currentStep + 1,
        plan: state.plan.map(s =>
          s.id === event.payload.stepId
            ? { ...s, status: 'completed' as const }
            : s
        )
      };

    case 'STEP_FAILED':
      return {
        ...state,
        plan: state.plan.map(s =>
          s.id === event.payload.stepId
            ? { ...s, status: 'failed' as const }
            : s
        ),
        error: event.payload.error
      };

    case 'LLM_RESPONSE':
      return {
        ...state,
        messages: [...state.messages, {
          role: 'assistant',
          content: event.payload.content,
          timestamp: Date.now()
        }]
      };

    case 'TASK_COMPLETED':
      return {
        ...state,
        status: 'completed',
        messages: [...state.messages, {
          role: 'assistant',
          content: event.payload.summary,
          timestamp: Date.now()
        }]
      };

    case 'ERROR':
      return {
        ...state,
        status: 'error',
        error: event.payload.message
      };

    default:
      return state;
  }
}

// ============================================================
// Event Store (支持时间旅行调试)
// ============================================================

class EventStore {
  private events: { event: AgentEvent; state: AgentState; timestamp: number }[] = [];
  private currentState: AgentState;

  constructor(initialState: AgentState) {
    this.currentState = initialState;
  }

  dispatch(event: AgentEvent): AgentState {
    const newState = agentReducer(this.currentState, event);
    this.events.push({
      event,
      state: newState,
      timestamp: Date.now()
    });
    this.currentState = newState;
    return newState;
  }

  getState(): AgentState {
    return this.currentState;
  }

  // 时间旅行：回到某个时间点
  travelTo(index: number): AgentState {
    if (index < 0 || index >= this.events.length) {
      throw new Error(`Invalid index: ${index}`);
    }
    return this.events[index].state;
  }

  // 获取完整事件历史
  getHistory(): { event: AgentEvent; timestamp: number }[] {
    return this.events.map(e => ({
      event: e.event,
      timestamp: e.timestamp
    }));
  }

  // 重放事件序列
  replay(): AgentState[] {
    return this.events.map(e => e.state);
  }
}

// ============================================================
// 演示
// ============================================================

function main() {
  console.log('=== Agent State Management Demo ===\n');

  const initialState: AgentState = {
    status: 'idle',
    messages: [],
    toolResults: [],
    plan: [],
    currentStep: 0,
    metadata: {}
  };

  const store = new EventStore(initialState);

  // 模拟 Agent 执行流程
  console.log('1. User sends message');
  let state = store.dispatch({
    type: 'USER_MESSAGE',
    payload: { content: '帮我查一下北京今天的天气，然后计算华氏温度' }
  });
  console.log(`   Status: ${state.status}, Messages: ${state.messages.length}`);

  console.log('\n2. Plan created');
  state = store.dispatch({
    type: 'PLAN_CREATED',
    payload: {
      steps: [
        { id: 1, description: '查询北京天气', status: 'pending', toolName: 'weather' },
        { id: 2, description: '转换为华氏温度', status: 'pending', toolName: 'calculator' }
      ]
    }
  });
  console.log(`   Plan: ${state.plan.map(s => s.description).join(' → ')}`);

  console.log('\n3. Execute step 1: weather query');
  state = store.dispatch({ type: 'STEP_STARTED', payload: { stepId: 1 } });
  state = store.dispatch({ type: 'TOOL_CALLED', payload: { toolName: 'weather', input: { city: '北京' } } });
  state = store.dispatch({ type: 'TOOL_RESULT', payload: { toolName: 'weather', output: '25°C, 晴', duration: 500, success: true } });
  state = store.dispatch({ type: 'STEP_COMPLETED', payload: { stepId: 1 } });
  console.log(`   Status: ${state.status}, Tool results: ${state.toolResults.length}`);

  console.log('\n4. Execute step 2: temperature conversion');
  state = store.dispatch({ type: 'STEP_STARTED', payload: { stepId: 2 } });
  state = store.dispatch({ type: 'TOOL_CALLED', payload: { toolName: 'calculator', input: { expression: '25 * 9/5 + 32' } } });
  state = store.dispatch({ type: 'TOOL_RESULT', payload: { toolName: 'calculator', output: '77°F', duration: 10, success: true } });
  state = store.dispatch({ type: 'STEP_COMPLETED', payload: { stepId: 2 } });

  console.log('\n5. Task completed');
  state = store.dispatch({
    type: 'TASK_COMPLETED',
    payload: { summary: '北京今天天气晴朗，温度25°C（77°F）。' }
  });
  console.log(`   Final status: ${state.status}`);
  console.log(`   Final message: ${state.messages[state.messages.length - 1].content}`);

  // 事件历史
  console.log('\n=== Event History ===');
  const history = store.getHistory();
  history.forEach((entry, i) => {
    console.log(`  [${i}] ${entry.event.type}`);
  });

  // 时间旅行
  console.log('\n=== Time Travel: State at step 3 ===');
  const pastState = store.travelTo(3);
  console.log(`  Status: ${pastState.status}`);
  console.log(`  Current step: ${pastState.currentStep}`);
}

main();
