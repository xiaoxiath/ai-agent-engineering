# 第 11 章 框架对比与选型

> **本章导读**
>
> 随着 AI Agent 技术的快速发展，市场上涌现出众多 Agent 开发框架。从 Google 的 ADK 到 LangChain 生态的 LangGraph v1.0，从微软的 AutoGen 0.4（及其 AG2 分叉）到 OpenAI 的 Agents SDK，从 TypeScript 生态的 Mastra 1.0 和 Vercel AI SDK v5 到角色驱动的 CrewAI，每个框架都有其独特的设计哲学和适用场景。本章将从工程实践的角度出发，深入分析十大主流框架的架构设计、核心抽象、性能表现和适用场景，并提供一套系统化的选型方法论和迁移策略，帮助团队做出最优的技术决策。

---

## 11.1 主流框架概览

### 11.1.1 框架全景图

当前 AI Agent 开发框架可以从多个维度进行分类和比较。下表从版本、语言支持、许可证、状态管理、工具支持、多 Agent 协作、流式处理、检查点机制、可观测性和社区活跃度等维度，对十大主流框架进行全面对比：

| 维度 | Google ADK | LangGraph | CrewAI | AutoGen / AG2 | OpenAI Agents SDK | OpenClaw | Mastra | Vercel AI SDK | Claude Agent SDK | Agno |
|------|-----------|-----------|--------|---------------|-------------------|----------|--------|---------------|-----------------|------|
| **最新版本** | 1.x (2025) | 1.0 (GA, 2025 Q4) | 1.9+ | 0.4 (MS) / 0.4+ (AG2) | 0.x (持续迭代) | 最新稳定 | 1.0 (2026 Q1) | 5.x (2025) | 0.x (2025 Q3) | 最新稳定 |
| **主要语言** | Python/TS | Python/TS | Python | Python/.NET | Python/TS | TypeScript/JS | TypeScript | TypeScript | Python (TS社区版) | Python |
| **许可证** | Apache 2.0 | MIT | MIT | MIT(已更改) | MIT | MIT | Apache 2.0 | Apache 2.0 | MIT | Apache 2.0 |
| **状态管理** | Session-based | Annotated State + Reducer | 内置 Memory | Event-driven Runtime | RunContext + Sessions | Plugin Memory Backends | Workflow Engine | Server State (AI SDK UI) | Agent Loop Context | Session-based |
| **工具支持** | FunctionTool, ToolSet | ToolNode, ToolExecutor | @tool 装饰器 | function_map / FunctionTool | function_tool + MCP | 134 MCP 内置工具 | Tools + MCP 原生 | Tools + MCP 原生 | Tools + MCP | Tools + Toolkits |
| **多 Agent** | A2A Protocol | Multi-graph Composition | Crew + Process | AgentChat GroupChat | Handoff 机制 | Gateway 路由分发 | Workflow 编排 | Subagent 组合 | Handoff + Subagents | Router/Coordinator/Team |
| **流式处理** | Runner.stream() | .astream_events() | Callback-based | 原生 Streaming | Runner.run_streamed() | 平台原生 Streaming | Stream API | SSE 原生 Streaming | Streaming Events | 原生 Streaming |
| **检查点** | Session Store | MemorySaver/PostgresSaver | 无原生支持 | 无原生支持 | 无原生支持 | 插件式持久化 | Workflow 持久化 | 无原生支持 | 无原生支持 | 无原生支持 |
| **可观测性** | 基础追踪 | LangSmith 全链路追踪 | 基本日志 | 内置追踪 | OpenAI Tracing 面板 | 插件级监控 | OpenTelemetry 集成 | Vercel 原生监控 | 基础追踪 | 内置仪表盘 |
| **社区活跃度** | ★★★☆☆ (新兴) | ★★★★★ (最活跃) | ★★★★☆ | ★★★★☆ (分裂后) | ★★★★☆ (快速增长) | ★★★★★ (爆发式增长) | ★★★★☆ (快速增长) | ★★★★★ (Web 生态) | ★★★☆☆ (新兴) | ★★★★☆ (活跃) |
| **首次发布** | 2024 Q4 | 2024 Q1 | 2023 Q4 | 2023 Q3 | 2025 Q1 | 2023 Q2 | 2024 Q3 | 2023 Q3 | 2025 Q3 | 2023 Q4 |
| **GitHub Stars** | ~10k | ~18k | ~27k | ~40k(含AG2) | ~15k | ~100k | ~25k | ~18k | ~7k | ~18k |
| **适合场景** | Google 生态集成 | 复杂状态工作流 | 快速原型开发 | 研究与分布式 Agent | OpenAI 生态应用 | 多平台部署与连接 | TS 全栈 Agent 开发 | Web/前端 Agent 开发 | Anthropic 生态深度集成 | 快速多 Agent 原型 |

### 11.1.2 框架演进历史

**Google ADK (Agent Development Kit)**

Google ADK 于 2024 年末正式发布，是 Google 在 Agent 领域的重要布局。它从 Google 内部的 Vertex AI Agent Builder 演化而来，融合了 Google 在大规模分布式系统方面的经验。ADK 的核心设计理念是"组合优于继承"，通过 SequentialAgent、ParallelAgent 和 LoopAgent 三种原语，实现灵活的 Agent 编排。2025 年初，Google 进一步引入了 A2A (Agent-to-Agent) 协议，使得不同框架构建的 Agent 可以标准化地互相通信。

**LangGraph**

LangGraph 是 LangChain 团队于 2024 年初推出的有状态工作流编排框架，并于 2025 年 Q4 达到 **v1.0 GA (Generally Available)** 里程碑 [[LangGraph 1.0 is now generally available]](https://changelog.langchain.com/announcements/langgraph-1-0-is-now-generally-available)。它从 LangChain 早期的 AgentExecutor 演化而来，解决了前者在复杂工作流中的局限性。LangGraph 的核心创新在于将 Agent 的执行流程建模为有向图 (Directed Graph)，其中节点是计算步骤，边是状态转移条件。这种图模型使得复杂的分支、循环和并行逻辑变得直观可控。

LangGraph v1.0 带来了三大核心能力：**持久化状态 (Durable State)**——Agent 执行状态自动持久化；**内置检查点 (Built-in Persistence)**——无需手写数据库逻辑即可保存和恢复工作流，支持跨会话的多日审批流程和后台任务；**Human-in-the-loop 一等支持**——在高风险决策节点暂停执行等待人工审批。此外，LangGraph v1.0 标志着 LangChain 生态的明确分工：**LangChain** 本身聚焦于高层 LCEL (LangChain Expression Language) 链式组合层和 `create_agent` 快速构建接口，而 **LangGraph** 作为底层编排运行时负责持久执行、状态管理和复杂工作流控制 [[LangChain and LangGraph 1.0 Milestones]](https://blog.langchain.com/langchain-langgraph-1dot0/)。可观测性方面，**LangSmith** 提供全链路追踪、调试和评估能力，是 LangGraph 推荐的生产监控方案。

**CrewAI**

CrewAI 于 2023 年末发布，以其直观的"角色扮演"隐喻迅速获得开发者青睐。它借鉴了现实世界中团队协作的模式，让开发者可以定义具有特定角色 (Role)、目标 (Goal) 和背景故事 (Backstory) 的 Agent，然后组织它们成为一个"团队" (Crew) 来完成复杂任务。CrewAI 在 2024-2025 年经历了多次重大更新，引入了层级化流程、知识库集成和企业版功能。截至 2026 年 Q1，CrewAI 已迭代至 **1.9+ 版本** [[CrewAI Changelog]](https://docs.crewai.com/en/changelog)，新增了结构化输出 (structured outputs)、流式响应、改进的 Agent 委派机制，并持续聚焦于**角色驱动的多 Agent 编排 (role-based multi-agent orchestration)**——这仍然是其核心差异化定位。

**AutoGen / AG2**

AutoGen 源自微软研究院，于 2023 年中期发布，是最早的多 Agent 对话框架之一。其核心设计理念是"对话驱动的 Agent 协作"——Agent 之间通过自然语言对话来协调任务。AutoGen 在学术研究中获得了广泛认可，GitHub Stars 数量在所有 Agent 框架中排名前列。

2025 年 1 月，微软发布了 **AutoGen 0.4**，这是一次**完全的异步重写 (breaking change)** [[AutoGen v0.4: Reimagining the foundation of agentic AI]](https://www.microsoft.com/en-us/research/articles/autogen-v0-4-reimagining-the-foundation-of-agentic-ai-for-scale-extensibility-and-robustness/)。0.4 版本引入了基于异步 Actor 模型的事件驱动架构，提供分层 API：**AgentChat** 用于快速多 Agent 应用原型开发，**Core** 用于事件管道和分布式扩展，**Extensions** 用于模型和工具集成。微软将继续在此新架构上投入，并计划与 Semantic Kernel 进行运行时融合。

值得注意的是，AutoGen 的原始核心创建者从微软官方仓库中分离出来，以 **AG2** (ag2.ai) 的名义独立运营 [[What's going on with AutoGen and AG2?]](https://www.gettingstarted.ai/autogen-vs-ag2/)。AG2 保持了与 AutoGen 0.2 API 的兼容性并持续社区驱动的开发。因此目前存在两条路径：**Microsoft AutoGen 0.4+**（全新异步架构，面向企业级分布式场景）和 **AG2**（社区维护，延续 0.2 API 风格，快速迭代）。选型时需要明确选择哪条路径。

**OpenAI Agents SDK**

OpenAI Agents SDK 是 OpenAI 于 2025 年初发布的官方 Agent 开发框架（开源，Python 优先），作为此前 Swarm 实验项目的生产级替代品 [[OpenAI Agents SDK GitHub]](https://github.com/openai/openai-agents-python)。它的设计哲学是"极简主义"——用最少的原语实现最常见的 Agent 模式。核心概念包括 **Agent**（绑定指令、工具和 Handoff 的 LLM 执行体）、**Handoff**（Agent 之间的任务委派）、**Guardrail**（输入/输出护栏）、**Runner**（执行引擎）和 **Tracing**（内置追踪，可在 OpenAI Dashboard 中可视化调试） [[OpenAI Agents SDK Docs]](https://openai.github.io/openai-agents-python/)。Agents SDK 深度整合了 OpenAI 的模型能力，包括结构化输出、视觉理解、MCP 连接器和内置工具（Web Search、File Search、Code Interpreter 等）。作为重量级框架的轻量替代，Agents SDK 凭借极低的学习曲线和优秀的开发体验在社区中快速增长。


**OpenClaw**

OpenClaw（前身为 Clawdbot / Moltbot）由 Peter Steinberger 于 2025 年 11 月发布，最初是一个基于 LLM 的个人 AI 助手项目。其核心设计理念是"Gateway 架构"——通过一个中心化的 Gateway 守护进程连接消息平台与 AI 能力。这种架构使得 OpenClaw 能够适配 20+ 消息平台（WhatsApp、Telegram、Slack、Discord、Signal、iMessage、Teams 等），2026 年 1 月底因社交网络 Moltbook 的病毒式传播而爆发式增长。截至 2026 年 3 月，OpenClaw 的 GitHub Stars 突破 250K，超越 React 成为 GitHub 上星标数最高的软件项目之一。OpenClaw 采用 Skills 系统实现工具集成（每个 Skill 由 SKILL.md 文件定义），并全面支持 MCP 协议。其成功的关键在于定位差异化——不追求复杂的编排逻辑，而是专注于"让 Agent 触达每一个用户渠道"，同时保持本地运行和开源的特性。值得注意的是，OpenClaw 的安全问题也引发了广泛关注（Cisco 安全团队发现第三方 Skill 存在数据泄露和注入风险），这为 Agent 安全研究提供了重要的现实案例。

### 11.1.3 架构核心抽象对比

以下用 TypeScript 类型定义来表达各框架的核心抽象模型：

```typescript
// ============================================================
// 各框架核心抽象的 TypeScript 类型映射
// 这些类型定义帮助理解不同框架的设计哲学
// ============================================================

/** Google ADK 核心抽象 */
namespace ADKAbstraction {
  // Agent 是核心执行单元，通过组合原语编排
  interface Agent {
    name: string;
    model: string;
    instruction: string;
    tools: Tool[];
    subAgents?: Agent[]; // 支持嵌套的子 Agent
  }

  // 三种编排原语
  type OrchestrationType = 'sequential' | 'parallel' | 'loop';

  // Session 管理对话状态
  interface Session {
    id: string;
    state: Record<string, unknown>;
    history: Message[];
  }

  // Runner 负责执行 Agent
  interface Runner {
    run(agent: Agent, session: Session, input: string): AsyncIterable<Event>;
  }
}

/** LangGraph 核心抽象 */
namespace LangGraphAbstraction {
  // 状态图是核心编排结构
  interface StateGraph<TState> {
    addNode(name: string, fn: (state: TState) => Promise<Partial<TState>>): void;
    addEdge(from: string, to: string): void;
    addConditionalEdges(
      source: string,
      router: (state: TState) => string,
      pathMap: Record<string, string>
    ): void;
    compile(checkpointer?: Checkpointer): CompiledGraph<TState>;
  }

  // 带 Reducer 的注解状态
  interface AnnotatedState {
    messages: { value: Message[]; reducer: 'append' };
    currentStep: { value: string; reducer: 'overwrite' };
  }

  // 检查点持久化接口
  interface Checkpointer {
    put(config: RunnableConfig, checkpoint: Checkpoint): Promise<void>;
    get(config: RunnableConfig): Promise<Checkpoint | undefined>;
    list(config: RunnableConfig): AsyncIterable<Checkpoint>;
  }
}

/** CrewAI 核心抽象 */
namespace CrewAIAbstraction {
  interface Agent {
    role: string;
    goal: string;
    backstory: string;
    tools: Tool[];
    llm: string;
    allowDelegation: boolean;
  }

  interface Task {
    description: string;
    expectedOutput: string;
    agent: Agent;
    context?: Task[];
  }

  interface Crew {
    agents: Agent[];
    tasks: Task[];
    process: 'sequential' | 'hierarchical';
    verbose: boolean;
  }
}

/** AutoGen 核心抽象 */
namespace AutoGenAbstraction {
  interface ConversableAgent {
    name: string;
    systemMessage: string;
    llmConfig: LLMConfig;
    humanInputMode: 'ALWAYS' | 'NEVER' | 'TERMINATE';
    functionMap: Record<string, Function>;
  }

  interface GroupChat {
    agents: ConversableAgent[];
    maxRound: number;
    speakerSelectionMethod: 'auto' | 'round_robin' | 'random';
  }

  interface GroupChatManager extends ConversableAgent {
    groupChat: GroupChat;
  }
}

/** OpenAI Agents SDK 核心抽象 */
namespace OpenAIAgentsAbstraction {
  interface Agent {
    name: string;
    instructions: string;
    model: string;
    tools: Tool[];
    handoffs: Handoff[];
    guardrails: Guardrail[];
  }

  interface Handoff {
    targetAgent: Agent;
    toolName: string;
    toolDescription: string;
    inputFilter?: (input: HandoffInput) => HandoffInput;
  }

  interface Guardrail {
    type: 'input' | 'output';
    validate(data: unknown): Promise<GuardrailResult>;
  }

  interface Runner {
    run(agent: Agent, input: string): Promise<RunResult>;
    runStreamed(agent: Agent, input: string): AsyncIterable<StreamEvent>;
  }
}

/** Vercel AI SDK 核心抽象 */
namespace VercelAIAbstraction {
  // generateText / streamText 是核心调用函数
  interface GenerateTextOptions {
    model: LanguageModel;
    prompt?: string;
    messages?: Message[];
    tools?: Record<string, Tool>;
    maxSteps?: number;       // 多步工具调用循环上限
    stopWhen?: StopCondition;
    prepareStep?: (step: StepInfo) => StepConfig;
  }

  // Tool 定义（基于 Zod schema）
  interface Tool {
    description: string;
    parameters: ZodSchema;
    execute: (args: unknown) => Promise<unknown>;
  }

  // Agent 抽象（v5 新增）
  interface AgentConfig {
    model: LanguageModel;
    tools: Record<string, Tool>;
    system?: string;
    maxSteps?: number;
  }

  // useChat hook（前端集成）
  interface UseChatReturn {
    messages: Message[];
    input: string;
    handleSubmit: () => void;
    isLoading: boolean;
    data: unknown[];
  }
}

/** OpenClaw 核心抽象 */
namespace OpenClawAbstraction {
  // Gateway 是中心化的消息路由和 AI 能力枢纽
  interface Gateway {
    adapters: PlatformAdapter[];
    plugins: Plugin[];
    config: GatewayConfig;
    start(): Promise<void>;
    stop(): Promise<void>;
  }

  // 插件是所有能力的基本单元——LLM、工具、平台适配、记忆
  interface Plugin {
    name: string;
    type: 'llm' | 'tool' | 'adapter' | 'memory' | 'middleware';
    initialize(gateway: Gateway): Promise<void>;
    destroy(): Promise<void>;
  }

  // 平台适配器将外部消息平台接入 Gateway
  interface PlatformAdapter extends Plugin {
    platform: string; // 'slack' | 'discord' | 'teams' | 'wechat' | ...
    sendMessage(channelId: string, message: Message): Promise<void>;
    onMessage(handler: (message: Message) => Promise<void>): void;
  }

  // MCP 兼容工具接口
  interface MCPTool extends Plugin {
    schema: MCPToolSchema;
    execute(params: Record<string, unknown>): Promise<unknown>;
  }
}
```

---

## 11.2 各框架深度分析

本节将对每个框架进行深度剖析，包括核心概念、设计模式、优缺点分析，以及完整的 TypeScript 代码示例。

### 11.2.1 Google ADK 深度分析

#### 核心概念

Google ADK 的设计围绕四个核心概念：

1. **Agent**：执行单元，可以是 LLM Agent 或编排 Agent（SequentialAgent/ParallelAgent/LoopAgent）
2. **Tool**：Agent 可调用的外部能力（函数、API、甚至其他 Agent）
3. **Runner**：Agent 的执行引擎，负责管理执行循环和事件流
4. **Session**：会话状态管理器，持久化对话历史和中间状态

#### 三种编排原语

ADK 提供了三种强大的编排原语，可以通过组合构建任意复杂的工作流：

- **SequentialAgent**：按顺序依次执行子 Agent，前一个的输出作为后一个的上下文
- **ParallelAgent**：并行执行多个子 Agent，收集所有结果后继续
- **LoopAgent**：循环执行子 Agent，直到满足终止条件

#### A2A 协议集成

A2A (Agent-to-Agent) 是 Google 提出的开放协议，使不同框架构建的 Agent 可以通过标准化的 HTTP 接口互相通信。每个 Agent 通过 Agent Card（类似 OpenAPI spec）描述自己的能力，其他 Agent 可以发现并调用它。

#### 完整代码示例

```typescript
// ============================================================
// Google ADK 风格的 Agent 实现
// 演示：构建一个研究助手，使用三种编排原语
// ============================================================

import { EventEmitter } from 'events';

// ---- 基础类型定义 ----

interface ADKToolContext {
  sessionState: Record<string, unknown>;
}

interface ADKTool {
  name: string;
  description: string;
  parameters: Record<string, ParameterDef>;
  execute: (args: Record<string, unknown>, ctx: ADKToolContext) => Promise<string>;
}

interface ParameterDef {
  type: string;
  description: string;
  required?: boolean;
}

interface ADKMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
}

interface ADKEvent {
  type: 'message' | 'tool_call' | 'tool_result' | 'state_update' | 'agent_transfer';
  agentName: string;
  data: unknown;
  timestamp: number;
}

interface ADKSession {
  id: string;
  state: Record<string, unknown>;
  history: ADKMessage[];
  createdAt: Date;
  updatedAt: Date;
}

// ---- LLM 调用接口 ----

interface LLMResponse {
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  finishReason: 'stop' | 'tool_calls';
}

interface LLMProvider {
  chat(messages: ADKMessage[], tools: ADKTool[]): Promise<LLMResponse>;
}

// ---- Agent 基类 ----

abstract class BaseADKAgent {
  constructor(
    public readonly name: string,
    public readonly description: string
  ) {}

  /** 执行 Agent 逻辑，返回事件流 */
  abstract execute(session: ADKSession, input: string): AsyncGenerator<ADKEvent>;
}

// ---- LLM Agent：基于大模型的智能 Agent ----

class LLMAgent extends BaseADKAgent {
  private tools: ADKTool[];
  private instruction: string;
  private llm: LLMProvider;
  private maxIterations: number;

  constructor(config: {
    name: string;
    description: string;
    instruction: string;
    tools: ADKTool[];
    llm: LLMProvider;
    maxIterations?: number;
  }) {
    super(config.name, config.description);
    this.instruction = config.instruction;
    this.tools = config.tools;
    this.llm = config.llm;
    this.maxIterations = config.maxIterations ?? 10;
  }

  async *execute(session: ADKSession, input: string): AsyncGenerator<ADKEvent> {
    // 构建消息列表：系统指令 + 历史消息 + 用户输入
    const messages: ADKMessage[] = [
      { role: 'assistant', content: this.instruction },
      ...session.history,
      { role: 'user', content: input }
    ];

    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;
      const response = await this.llm.chat(messages, this.tools);

      // 如果 LLM 直接返回文本，结束循环
      if (response.finishReason === 'stop') {
        yield {
          type: 'message',
          agentName: this.name,
          data: { content: response.content },
          timestamp: Date.now()
        };
        session.history.push(
          { role: 'user', content: input },
          { role: 'assistant', content: response.content }
        );
        break;
      }

      // 如果需要调用工具
      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          yield {
            type: 'tool_call',
            agentName: this.name,
            data: { toolName: toolCall.name, arguments: toolCall.arguments },
            timestamp: Date.now()
          };

          const tool = this.tools.find(t => t.name === toolCall.name);
          if (!tool) {
            const errorResult = `错误：未找到工具 "${toolCall.name}"`;
            messages.push({ role: 'tool', content: errorResult, toolCallId: toolCall.id });
            continue;
          }

          try {
            const result = await tool.execute(
              toolCall.arguments,
              { sessionState: session.state }
            );
            yield {
              type: 'tool_result',
              agentName: this.name,
              data: { toolName: toolCall.name, result },
              timestamp: Date.now()
            };
            messages.push({ role: 'tool', content: result, toolCallId: toolCall.id });
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            messages.push({
              role: 'tool',
              content: `工具执行失败：${errorMsg}`,
              toolCallId: toolCall.id
            });
          }
        }
      }
    }
    session.updatedAt = new Date();
  }
}

// ---- 三种编排原语 ----

/** 顺序执行 Agent：按定义顺序依次执行子 Agent */
class SequentialAgent extends BaseADKAgent {
  private subAgents: BaseADKAgent[];

  constructor(config: {
    name: string;
    description: string;
    subAgents: BaseADKAgent[];
  }) {
    super(config.name, config.description);
    this.subAgents = config.subAgents;
  }

  async *execute(session: ADKSession, input: string): AsyncGenerator<ADKEvent> {
    let currentInput = input;
    for (const agent of this.subAgents) {
      let lastOutput = '';
      for await (const event of agent.execute(session, currentInput)) {
        yield event;
        if (event.type === 'message') {
          lastOutput = (event.data as { content: string }).content;
        }
      }
      currentInput = lastOutput || currentInput;
    }
  }
}

/** 并行执行 Agent：同时执行所有子 Agent */
class ParallelAgent extends BaseADKAgent {
  private subAgents: BaseADKAgent[];

  constructor(config: {
    name: string;
    description: string;
    subAgents: BaseADKAgent[];
  }) {
    super(config.name, config.description);
    this.subAgents = config.subAgents;
  }

  async *execute(session: ADKSession, input: string): AsyncGenerator<ADKEvent> {
    const allEvents: ADKEvent[][] = [];
    const results: string[] = [];

    const executions = this.subAgents.map(async (agent, index) => {
      const events: ADKEvent[] = [];
      let output = '';
      const sessionCopy: ADKSession = {
        ...session,
        state: { ...session.state },
        history: [...session.history]
      };
      for await (const event of agent.execute(sessionCopy, input)) {
        events.push(event);
        if (event.type === 'message') {
          output = (event.data as { content: string }).content;
        }
      }
      allEvents[index] = events;
      results[index] = output;
    });

    await Promise.all(executions);

    for (const events of allEvents) {
      for (const event of events) {
        yield event;
      }
    }

    session.state['parallelResults'] = results;
    yield {
      type: 'state_update',
      agentName: this.name,
      data: { parallelResults: results },
      timestamp: Date.now()
    };
  }
}

/** 循环执行 Agent：重复执行直到满足终止条件 */
class LoopAgent extends BaseADKAgent {
  private subAgents: BaseADKAgent[];
  private maxIterations: number;
  private shouldTerminate: (session: ADKSession) => boolean;

  constructor(config: {
    name: string;
    description: string;
    subAgents: BaseADKAgent[];
    maxIterations?: number;
    shouldTerminate: (session: ADKSession) => boolean;
  }) {
    super(config.name, config.description);
    this.subAgents = config.subAgents;
    this.maxIterations = config.maxIterations ?? 5;
    this.shouldTerminate = config.shouldTerminate;
  }

  async *execute(session: ADKSession, input: string): AsyncGenerator<ADKEvent> {
    let iteration = 0;
    let currentInput = input;

    while (iteration < this.maxIterations) {
      iteration++;
      session.state['loopIteration'] = iteration;

      for (const agent of this.subAgents) {
        let lastOutput = '';
        for await (const event of agent.execute(session, currentInput)) {
          yield event;
          if (event.type === 'message') {
            lastOutput = (event.data as { content: string }).content;
          }
        }
        currentInput = lastOutput || currentInput;
      }

      if (this.shouldTerminate(session)) {
        break;
      }
    }
  }
}

// ---- Runner：Agent 执行引擎 ----

class ADKRunner {
  async run(agent: BaseADKAgent, session: ADKSession, input: string): Promise<string> {
    let finalOutput = '';
    for await (const event of agent.execute(session, input)) {
      if (event.type === 'message') {
        finalOutput = (event.data as { content: string }).content;
      }
    }
    return finalOutput;
  }

  async *stream(
    agent: BaseADKAgent,
    session: ADKSession,
    input: string
  ): AsyncGenerator<ADKEvent> {
    yield* agent.execute(session, input);
  }
}

// ---- 使用示例：构建研究助手 ----

const searchTool: ADKTool = {
  name: 'web_search',
  description: '在互联网上搜索信息',
  parameters: {
    query: { type: 'string', description: '搜索关键词', required: true }
  },
  execute: async (args) => {
    const query = args.query as string;
    return JSON.stringify({
      results: [
        { title: `关于 ${query} 的最新研究`, snippet: '...' },
        { title: `${query} 实践指南`, snippet: '...' }
      ]
    });
  }
};

const qualityCheckTool: ADKTool = {
  name: 'quality_check',
  description: '评估分析质量，返回通过或需要改进',
  parameters: {
    analysis: { type: 'string', description: '待评估的分析内容', required: true }
  },
  execute: async (args, ctx) => {
    const iteration = (ctx.sessionState['loopIteration'] as number) || 1;
    if (iteration >= 2) {
      ctx.sessionState['qualityPassed'] = true;
      return '质量通过：分析内容完整且准确';
    }
    return '需要改进：缺少数据支撑，请补充更多证据';
  }
};

// 组装完整的研究助手（需要实际 LLM Provider）
function createResearchAssistant(llm: LLMProvider): BaseADKAgent {
  const searchAgent = new LLMAgent({
    name: 'search_agent',
    description: '负责搜索相关信息',
    instruction: '你是一个搜索助手，使用 web_search 工具查找用户需要的信息。',
    tools: [searchTool],
    llm
  });

  const analysisAgent = new LLMAgent({
    name: 'analysis_agent',
    description: '负责分析搜索结果',
    instruction: '你是一个分析师，分析提供的搜索结果，提取关键信息和洞察。',
    tools: [qualityCheckTool],
    llm
  });

  const refinementLoop = new LoopAgent({
    name: 'refinement_loop',
    description: '循环改进分析质量',
    subAgents: [searchAgent, analysisAgent],
    maxIterations: 3,
    shouldTerminate: (session) => session.state['qualityPassed'] === true
  });

  const writingAgent = new LLMAgent({
    name: 'writing_agent',
    description: '负责撰写最终报告',
    instruction: '你是一个技术写手，基于分析结果撰写结构化的研究报告。',
    tools: [],
    llm
  });

  return new SequentialAgent({
    name: 'research_assistant',
    description: '完整的研究助手，自动搜索、分析和撰写报告',
    subAgents: [refinementLoop, writingAgent]
  });
}

// 优势：Google 生态深度整合、三种编排原语简洁强大、A2A 协议跨框架互操作、Session 管理内置
// 劣势：社区较新、文档和示例相对较少、对非 Google 模型支持不够完善
```

### 11.2.2 LangGraph 深度分析

> **版本说明**：本节基于 LangGraph v1.0 (GA) 稳定版。LangGraph 现在是 LangChain 生态中**推荐的 Agent 编排框架**，LangChain 本身聚焦于 LCEL 链式组合层，而 LangGraph 负责底层持久化运行时 [[LangGraph 1.0 GA]](https://changelog.langchain.com/announcements/langgraph-1-0-is-now-generally-available)。生产环境可观测性推荐使用 **LangSmith** 进行全链路追踪和调试。

#### 核心概念

LangGraph 将 Agent 的执行流程建模为有向图 (StateGraph)，其核心概念包括：

1. **StateGraph**：有向状态图，定义整个工作流结构
2. **Node（节点）**：图中的计算单元，每个节点接收状态、执行逻辑、返回状态更新
3. **Edge（边）**：节点之间的连接，定义执行顺序
4. **Conditional Edge（条件边）**：基于状态动态决定下一个节点的路由逻辑
5. **Annotated State（注解状态）**：带有 Reducer 函数的状态定义，控制状态的更新方式

#### 状态管理：Reducer 模式

LangGraph 的状态管理借鉴了 Redux 的 Reducer 模式。每个状态字段可以定义自己的 Reducer 函数，决定新值如何与旧值合并：

- **overwrite**：直接覆盖旧值
- **append**：追加到列表末尾
- **自定义 Reducer**：完全控制合并逻辑

#### 检查点与持久化

LangGraph 提供了业界最完善的检查点机制，支持：
- 将每一步的状态快照持久化到存储后端
- 从任意检查点恢复执行
- "时间旅行"调试：回溯到过去的任意状态
- 人工介入 (Human-in-the-loop)：在指定节点暂停等待人工输入

#### 完整代码示例

```typescript
// ============================================================
// LangGraph 风格的状态图 Agent 实现
// 演示：构建一个多步骤客户服务 Agent
// ============================================================

// ---- 状态定义与 Reducer 系统 ----

type Reducer<T> = (current: T, update: T) => T;

const Reducers = {
  overwrite: <T>(): Reducer<T> => (_current, update) => update,
  append: <T>(): Reducer<T[]> => (current, update) => [...current, ...update],
  coalesce: <T>(): Reducer<T | null> => (current, update) => update ?? current,
  accumulate: (): Reducer<number> => (current, update) => current + update,
};

interface AnnotatedField<T> {
  value: T;
  reducer: Reducer<T>;
}

/** 客户服务 Agent 的状态定义 */
interface CustomerServiceState {
  messages: AnnotatedField<ChatMessage[]>;
  currentIntent: AnnotatedField<string | null>;
  customerInfo: AnnotatedField<CustomerInfo | null>;
  toolResults: AnnotatedField<ToolResult[]>;
  responseReady: AnnotatedField<boolean>;
  requiresHuman: AnnotatedField<boolean>;
  iterationCount: AnnotatedField<number>;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  metadata?: Record<string, unknown>;
}

interface CustomerInfo {
  id: string;
  name: string;
  tier: 'standard' | 'premium' | 'enterprise';
  openTickets: number;
}

interface ToolResult {
  toolName: string;
  result: unknown;
  timestamp: number;
}

// ---- 状态图核心实现 ----

type NodeFunction<TState> = (state: TState) => Promise<Partial<TState>>;
type RouterFunction<TState> = (state: TState) => string;

interface Checkpoint<TState> {
  id: string;
  threadId: string;
  state: TState;
  parentId: string | null;
  nodeName: string;
  timestamp: number;
}

interface CheckpointSaver<TState> {
  save(checkpoint: Checkpoint<TState>): Promise<void>;
  load(threadId: string, checkpointId?: string): Promise<Checkpoint<TState> | null>;
  list(threadId: string): Promise<Checkpoint<TState>[]>;
}

class MemorySaver<TState> implements CheckpointSaver<TState> {
  private store = new Map<string, Checkpoint<TState>[]>();

  async save(checkpoint: Checkpoint<TState>): Promise<void> {
    const thread = this.store.get(checkpoint.threadId) ?? [];
    thread.push(checkpoint);
    this.store.set(checkpoint.threadId, thread);
  }

  async load(threadId: string, checkpointId?: string): Promise<Checkpoint<TState> | null> {
    const thread = this.store.get(threadId) ?? [];
    if (checkpointId) return thread.find(c => c.id === checkpointId) ?? null;
    return thread[thread.length - 1] ?? null;
  }

  async list(threadId: string): Promise<Checkpoint<TState>[]> {
    return this.store.get(threadId) ?? [];
  }
}

interface GraphEdge { from: string; to: string; }
interface ConditionalEdge<TState> {
  source: string;
  router: RouterFunction<TState>;
  pathMap: Record<string, string>;
}

interface GraphEvent<TState> {
  type: 'node_start' | 'node_end' | 'state_update' | 'checkpoint' | 'interrupt';
  nodeName: string;
  state: TState;
  timestamp: number;
}

class StateGraph<TState extends Record<string, AnnotatedField<unknown>>> {
  private nodes = new Map<string, NodeFunction<TState>>();
  private edges: GraphEdge[] = [];
  private conditionalEdges: ConditionalEdge<TState>[] = [];
  private entryPoint: string = '';
  private interruptBefore: Set<string> = new Set();

  constructor(private initialState: TState) {}

  addNode(name: string, fn: NodeFunction<TState>): this {
    if (this.nodes.has(name)) throw new Error(`节点 "${name}" 已存在`);
    this.nodes.set(name, fn);
    return this;
  }

  addEdge(from: string, to: string): this {
    this.edges.push({ from, to });
    return this;
  }

  addConditionalEdges(
    source: string,
    router: RouterFunction<TState>,
    pathMap: Record<string, string>
  ): this {
    this.conditionalEdges.push({ source, router, pathMap });
    return this;
  }

  setEntryPoint(nodeName: string): this {
    this.entryPoint = nodeName;
    return this;
  }

  setInterruptBefore(nodeNames: string[]): this {
    nodeNames.forEach(n => this.interruptBefore.add(n));
    return this;
  }

  compile(checkpointer?: CheckpointSaver<TState>): CompiledGraph<TState> {
    if (!this.entryPoint) throw new Error('必须设置入口节点');
    return new CompiledGraph(
      this.initialState, this.nodes, this.edges,
      this.conditionalEdges, this.entryPoint,
      this.interruptBefore, checkpointer
    );
  }
}

class CompiledGraph<TState extends Record<string, AnnotatedField<unknown>>> {
  private static readonly END = '__end__';

  constructor(
    private initialState: TState,
    private nodes: Map<string, NodeFunction<TState>>,
    private edges: GraphEdge[],
    private conditionalEdges: ConditionalEdge<TState>[],
    private entryPoint: string,
    private interruptBefore: Set<string>,
    private checkpointer?: CheckpointSaver<TState>
  ) {}

  private getNextNode(currentNode: string, state: TState): string {
    const conditionalEdge = this.conditionalEdges.find(e => e.source === currentNode);
    if (conditionalEdge) {
      const routeKey = conditionalEdge.router(state);
      const nextNode = conditionalEdge.pathMap[routeKey];
      if (!nextNode) throw new Error(`路由 "${routeKey}" 未在 pathMap 中找到`);
      return nextNode;
    }
    const edge = this.edges.find(e => e.from === currentNode);
    return edge ? edge.to : CompiledGraph.END;
  }

  private mergeState(current: TState, update: Partial<TState>): TState {
    const merged = { ...current };
    for (const [key, value] of Object.entries(update)) {
      if (key in current) {
        const field = current[key] as AnnotatedField<unknown>;
        const updateField = value as AnnotatedField<unknown>;
        (merged as Record<string, AnnotatedField<unknown>>)[key] = {
          value: field.reducer(field.value, updateField.value),
          reducer: field.reducer
        };
      }
    }
    return merged;
  }

  async *stream(
    input: Partial<TState>,
    config?: { threadId?: string; checkpointId?: string }
  ): AsyncGenerator<GraphEvent<TState>> {
    const threadId = config?.threadId ?? crypto.randomUUID();
    let state = this.mergeState(this.initialState, input);
    let currentNode = this.entryPoint;
    let parentCheckpointId: string | null = config?.checkpointId ?? null;

    while (currentNode !== CompiledGraph.END) {
      if (this.interruptBefore.has(currentNode) && this.checkpointer) {
        const cp: Checkpoint<TState> = {
          id: crypto.randomUUID(), threadId, state,
          parentId: parentCheckpointId, nodeName: currentNode, timestamp: Date.now()
        };
        await this.checkpointer.save(cp);
        yield { type: 'interrupt', nodeName: currentNode, state, timestamp: Date.now() };
        return;
      }

      const nodeFn = this.nodes.get(currentNode);
      if (!nodeFn) throw new Error(`未找到节点 "${currentNode}"`);

      yield { type: 'node_start', nodeName: currentNode, state, timestamp: Date.now() };

      const stateUpdate = await nodeFn(state);
      state = this.mergeState(state, stateUpdate);

      if (this.checkpointer) {
        const cp: Checkpoint<TState> = {
          id: crypto.randomUUID(), threadId, state,
          parentId: parentCheckpointId, nodeName: currentNode, timestamp: Date.now()
        };
        await this.checkpointer.save(cp);
        parentCheckpointId = cp.id;
      }

      yield { type: 'node_end', nodeName: currentNode, state, timestamp: Date.now() };
      currentNode = this.getNextNode(currentNode, state);
    }
  }

  async invoke(input: Partial<TState>, config?: { threadId?: string }): Promise<TState> {
    let finalState = this.initialState;
    for await (const event of this.stream(input, config)) {
      if (event.type === 'node_end' || event.type === 'interrupt') {
        finalState = event.state;
      }
    }
    return finalState;
  }
}

// ---- 使用示例：构建客户服务图 ----

const initialState: CustomerServiceState = {
  messages: { value: [], reducer: Reducers.append<ChatMessage>() },
  currentIntent: { value: null, reducer: Reducers.overwrite<string | null>() },
  customerInfo: { value: null, reducer: Reducers.overwrite<CustomerInfo | null>() },
  toolResults: { value: [], reducer: Reducers.append<ToolResult>() },
  responseReady: { value: false, reducer: Reducers.overwrite<boolean>() },
  requiresHuman: { value: false, reducer: Reducers.overwrite<boolean>() },
  iterationCount: { value: 0, reducer: Reducers.accumulate() }
};

async function classifyIntent(state: CustomerServiceState): Promise<Partial<CustomerServiceState>> {
  const lastMessage = state.messages.value[state.messages.value.length - 1];
  if (!lastMessage) return { currentIntent: { value: 'unknown', reducer: Reducers.overwrite() } };
  const content = lastMessage.content.toLowerCase();
  let intent = 'general';
  if (content.includes('退款') || content.includes('refund')) intent = 'refund';
  else if (content.includes('查询') || content.includes('状态')) intent = 'status_query';
  else if (content.includes('投诉')) intent = 'complaint';
  return {
    currentIntent: { value: intent, reducer: Reducers.overwrite() },
    iterationCount: { value: 1, reducer: Reducers.accumulate() }
  };
}

async function fetchCustomerInfo(state: CustomerServiceState): Promise<Partial<CustomerServiceState>> {
  return {
    customerInfo: {
      value: { id: 'CUST-12345', name: '张三', tier: 'premium', openTickets: 2 },
      reducer: Reducers.overwrite()
    }
  };
}

async function handleRefund(state: CustomerServiceState): Promise<Partial<CustomerServiceState>> {
  const customer = state.customerInfo.value;
  const isAutoApproved = customer?.tier === 'premium' || customer?.tier === 'enterprise';
  if (isAutoApproved) {
    return {
      toolResults: { value: [{ toolName: 'refund_processor', result: { approved: true }, timestamp: Date.now() }], reducer: Reducers.append() },
      responseReady: { value: true, reducer: Reducers.overwrite() }
    };
  }
  return { requiresHuman: { value: true, reducer: Reducers.overwrite() } };
}

async function handleGeneralQuery(state: CustomerServiceState): Promise<Partial<CustomerServiceState>> {
  return { responseReady: { value: true, reducer: Reducers.overwrite() } };
}

async function generateResponse(state: CustomerServiceState): Promise<Partial<CustomerServiceState>> {
  const customer = state.customerInfo.value;
  let responseContent = `尊敬的${customer?.name}，感谢您的查询。`;
  if (state.currentIntent.value === 'refund' && state.toolResults.value.length > 0) {
    responseContent = `尊敬的${customer?.name}，您的退款已自动批准，预计 3 个工作日内到账。`;
  } else if (state.requiresHuman.value) {
    responseContent = `尊敬的${customer?.name}，您的请求需要人工处理，已转接至专属客服。`;
  }
  return { messages: { value: [{ role: 'assistant', content: responseContent }], reducer: Reducers.append() } };
}

function routeByIntent(state: CustomerServiceState): string {
  switch (state.currentIntent.value) {
    case 'refund': return 'handle_refund';
    case 'complaint': return 'handle_complaint';
    case 'status_query': return 'handle_query';
    default: return 'handle_general';
  }
}

function checkHumanRequired(state: CustomerServiceState): string {
  return state.requiresHuman.value ? 'human_review' : 'generate_response';
}

function buildCustomerServiceGraph(): CompiledGraph<CustomerServiceState> {
  return new StateGraph(initialState)
    .addNode('classify_intent', classifyIntent)
    .addNode('fetch_customer', fetchCustomerInfo)
    .addNode('handle_refund', handleRefund)
    .addNode('handle_query', handleGeneralQuery)
    .addNode('handle_general', handleGeneralQuery)
    .addNode('handle_complaint', handleGeneralQuery)
    .addNode('generate_response', generateResponse)
    .setEntryPoint('classify_intent')
    .addEdge('classify_intent', 'fetch_customer')
    .addConditionalEdges('fetch_customer', routeByIntent, {
      handle_refund: 'handle_refund', handle_complaint: 'handle_complaint',
      handle_query: 'handle_query', handle_general: 'handle_general'
    })
    .addConditionalEdges('handle_refund', checkHumanRequired, {
      human_review: 'generate_response', generate_response: 'generate_response'
    })
    .addEdge('handle_query', 'generate_response')
    .addEdge('handle_general', 'generate_response')
    .addEdge('handle_complaint', 'generate_response')
    .compile(new MemorySaver<CustomerServiceState>());
}

// 优势：v1.0 生产稳定、灵活的图结构、业界最强状态管理与检查点、Human-in-the-loop 原生支持、LangSmith 全链路可观测
// 劣势：学习曲线陡峭、简单任务过于重量级、状态类型定义繁琐
```

### 11.2.3 CrewAI 深度分析

#### 核心概念

CrewAI 的设计灵感来自现实世界的团队协作模式，核心概念包括：

1. **Agent**：具有特定角色、目标和背景故事的智能体
2. **Task**：分配给 Agent 的具体工作单元，包含描述和期望输出
3. **Crew**：Agent 和 Task 的集合，代表一个完整的工作团队
4. **Process**：任务执行方式——顺序执行 (Sequential) 或层级化执行 (Hierarchical)

#### 完整代码示例

```typescript
// ============================================================
// CrewAI 风格的角色驱动 Agent 实现
// 演示：构建一个内容创作团队
// ============================================================

interface CrewTool {
  name: string;
  description: string;
  execute: (input: string) => Promise<string>;
}

interface CrewAgentConfig {
  role: string;
  goal: string;
  backstory: string;
  tools: CrewTool[];
  llm: string;
  allowDelegation: boolean;
  verbose: boolean;
  maxIterations?: number;
}

interface TaskResult {
  taskDescription: string;
  agentRole: string;
  output: string;
  rawOutput: string;
  timestamp: number;
  tokenUsage: { prompt: number; completion: number; total: number };
}

interface CrewLLMProvider {
  generate(
    systemPrompt: string,
    userPrompt: string,
    tools?: CrewTool[]
  ): Promise<{ content: string; tokensUsed: { prompt: number; completion: number } }>;
}

class CrewAgent {
  readonly role: string;
  readonly goal: string;
  readonly backstory: string;
  readonly tools: CrewTool[];
  readonly llm: string;
  readonly allowDelegation: boolean;
  readonly maxIterations: number;
  private verbose: boolean;
  private memory: string[] = [];

  constructor(config: CrewAgentConfig) {
    this.role = config.role;
    this.goal = config.goal;
    this.backstory = config.backstory;
    this.tools = config.tools;
    this.llm = config.llm;
    this.allowDelegation = config.allowDelegation;
    this.verbose = config.verbose;
    this.maxIterations = config.maxIterations ?? 10;
  }

  /** 构建系统提示词，融入角色信息 */
  buildSystemPrompt(): string {
    let prompt = `你是一个 ${this.role}。\n\n`;
    prompt += `## 你的目标\n${this.goal}\n\n`;
    prompt += `## 你的背景\n${this.backstory}\n\n`;
    if (this.tools.length > 0) {
      prompt += `## 可用工具\n`;
      for (const tool of this.tools) {
        prompt += `- **${tool.name}**: ${tool.description}\n`;
      }
    }
    if (this.allowDelegation) {
      prompt += `\n## 委派能力\n你可以将子任务委派给团队中的其他成员。\n`;
    }
    return prompt;
  }

  /** 执行任务 */
  async execute(
    taskDescription: string,
    context: string,
    llmProvider: CrewLLMProvider
  ): Promise<TaskResult> {
    const systemPrompt = this.buildSystemPrompt();
    let userPrompt = `## 当前任务\n${taskDescription}\n\n`;
    if (context) userPrompt += `## 上下文信息\n${context}\n\n`;
    userPrompt += `请认真完成以上任务，输出应该详细、专业且可操作。`;

    if (this.verbose) {
      console.log(`[${this.role}] 开始执行任务...`);
    }

    let iteration = 0;
    let currentPrompt = userPrompt;
    let finalOutput = '';
    let totalTokens = { prompt: 0, completion: 0 };

    while (iteration < this.maxIterations) {
      iteration++;
      const response = await llmProvider.generate(systemPrompt, currentPrompt, this.tools);
      totalTokens.prompt += response.tokensUsed.prompt;
      totalTokens.completion += response.tokensUsed.completion;

      // 检查工具调用
      const toolCallMatch = response.content.match(
        /\[TOOL_CALL\]\s*name:\s*(.+?)\s*input:\s*(.+?)(?:\[\/TOOL_CALL\]|$)/s
      );

      if (toolCallMatch) {
        const tool = this.tools.find(t => t.name === toolCallMatch[1].trim());
        if (tool) {
          const toolResult = await tool.execute(toolCallMatch[2].trim());
          currentPrompt = `工具 "${tool.name}" 的执行结果:\n${toolResult}\n\n请继续处理任务。`;
          continue;
        }
      }

      finalOutput = response.content;
      break;
    }

    this.memory.push(`完成任务: ${taskDescription.substring(0, 80)}`);
    return {
      taskDescription, agentRole: this.role,
      output: finalOutput, rawOutput: finalOutput, timestamp: Date.now(),
      tokenUsage: { prompt: totalTokens.prompt, completion: totalTokens.completion, total: totalTokens.prompt + totalTokens.completion }
    };
  }
}

class CrewTask {
  readonly description: string;
  readonly expectedOutput: string;
  readonly agent: CrewAgent;
  readonly context: CrewTask[];
  result: TaskResult | null = null;

  constructor(config: { description: string; expectedOutput: string; agent: CrewAgent; context?: CrewTask[] }) {
    this.description = config.description;
    this.expectedOutput = config.expectedOutput;
    this.agent = config.agent;
    this.context = config.context ?? [];
  }

  gatherContext(): string {
    return this.context
      .filter(t => t.result !== null)
      .map(t => `### ${t.agent.role} 的输出\n${t.result!.output}`)
      .join('\n\n---\n\n');
  }
}

class Crew {
  private agents: CrewAgent[];
  private tasks: CrewTask[];
  private process: 'sequential' | 'hierarchical';
  private verbose: boolean;
  private llmProvider: CrewLLMProvider;

  constructor(config: {
    agents: CrewAgent[];
    tasks: CrewTask[];
    process: 'sequential' | 'hierarchical';
    verbose: boolean;
    llmProvider: CrewLLMProvider;
  }) {
    this.agents = config.agents;
    this.tasks = config.tasks;
    this.process = config.process;
    this.verbose = config.verbose;
    this.llmProvider = config.llmProvider;
  }

  async kickoff(): Promise<TaskResult[]> {
    if (this.verbose) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`团队启动 | 流程: ${this.process} | 成员: ${this.agents.length} | 任务: ${this.tasks.length}`);
      console.log(`${'='.repeat(60)}\n`);
    }
    return this.runSequential();
  }

  private async runSequential(): Promise<TaskResult[]> {
    const results: TaskResult[] = [];
    for (let i = 0; i < this.tasks.length; i++) {
      const task = this.tasks[i];
      const context = task.gatherContext();
      if (this.verbose) {
        console.log(`\n--- 任务 ${i + 1}/${this.tasks.length} | 执行者: ${task.agent.role} ---`);
      }
      const result = await task.agent.execute(task.description, context, this.llmProvider);
      task.result = result;
      results.push(result);
    }
    return results;
  }
}

// ---- 使用示例：内容创作团队 ----

function createContentCrew(llmProvider: CrewLLMProvider): Crew {
  const searchTool: CrewTool = {
    name: 'internet_search',
    description: '搜索最新信息和趋势',
    execute: async (input) => `搜索 "${input}" 的结果：1. 相关文章... 2. 行业报告...`
  };

  const researcher = new CrewAgent({
    role: '高级研究员', goal: '深入研究指定主题，收集全面信息',
    backstory: '你是一位拥有 10 年研究经验的行业分析师。',
    tools: [searchTool], llm: 'gpt-4', allowDelegation: false, verbose: true
  });

  const writer = new CrewAgent({
    role: '资深技术作家', goal: '撰写高质量技术文章',
    backstory: '你是技术写作专家，擅长将复杂概念转化为清晰文章。',
    tools: [], llm: 'gpt-4', allowDelegation: false, verbose: true
  });

  const editor = new CrewAgent({
    role: '主编', goal: '审校文章质量，确保内容准确',
    backstory: '你是资深出版人，拥有敏锐的文字洞察力。',
    tools: [], llm: 'gpt-4', allowDelegation: true, verbose: true
  });

  const researchTask = new CrewTask({
    description: '研究 AI Agent 框架的最新发展趋势',
    expectedOutput: '结构化研究报告', agent: researcher
  });

  const writingTask = new CrewTask({
    description: '基于研究报告撰写深度技术文章',
    expectedOutput: '完整技术文章', agent: writer, context: [researchTask]
  });

  const editingTask = new CrewTask({
    description: '审校文章并进行 SEO 优化',
    expectedOutput: '最终发布版本', agent: editor, context: [writingTask]
  });

  return new Crew({
    agents: [researcher, writer, editor],
    tasks: [researchTask, writingTask, editingTask],
    process: 'sequential', verbose: true, llmProvider
  });
}

// 优势：角色隐喻直观、快速原型开发、Task 依赖自动管理
// 劣势：状态管理有限、缺少检查点、复杂控制流支持不足
```

### 11.2.4 AutoGen 深度分析

#### 核心概念

AutoGen 的核心理念是"对话即协作"——Agent 之间通过自然语言对话来协调工作。

> **重要版本说明**：以下代码示例基于 AutoGen 0.2 (经典 API) 风格。AutoGen 0.4 采用了全新的异步事件驱动架构（基于 Actor 模型），API 不兼容 0.2。同时，AutoGen 原始创建者已分叉为 **AG2** (ag2.ai)，保持 0.2 API 兼容。选型时请注意区分 Microsoft AutoGen 0.4+ 和 AG2 两条技术路径 [[AutoGen vs AG2]](https://www.gettingstarted.ai/autogen-vs-ag2/)。

#### 完整代码示例

```typescript
// ============================================================
// AutoGen 风格的对话驱动多 Agent 实现
// 演示：构建一个代码开发群聊
// ============================================================

interface AutoGenMessage {
  sender: string;
  recipient: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: number;
}

type HumanInputMode = 'ALWAYS' | 'NEVER' | 'TERMINATE';
type SpeakerSelectionMethod = 'auto' | 'round_robin' | 'random';

interface AutoGenLLMConfig {
  model: string;
  temperature: number;
  maxTokens: number;
}

interface AutoGenLLMProvider {
  generate(messages: AutoGenMessage[], config: AutoGenLLMConfig): Promise<AutoGenMessage>;
}

class ConversableAgent {
  readonly name: string;
  readonly systemMessage: string;
  readonly llmConfig: AutoGenLLMConfig | null;
  readonly humanInputMode: HumanInputMode;
  protected conversationHistory: AutoGenMessage[] = [];
  private terminationCondition: (msg: AutoGenMessage) => boolean;

  constructor(config: {
    name: string;
    systemMessage: string;
    llmConfig?: AutoGenLLMConfig;
    humanInputMode?: HumanInputMode;
    isTerminationMsg?: (msg: AutoGenMessage) => boolean;
  }) {
    this.name = config.name;
    this.systemMessage = config.systemMessage;
    this.llmConfig = config.llmConfig ?? null;
    this.humanInputMode = config.humanInputMode ?? 'NEVER';
    this.terminationCondition = config.isTerminationMsg ?? ((msg) => msg.content.includes('TERMINATE'));
  }

  async receiveMessage(
    message: AutoGenMessage,
    llmProvider?: AutoGenLLMProvider
  ): Promise<AutoGenMessage | null> {
    this.conversationHistory.push(message);
    if (this.terminationCondition(message)) return null;

    if (!this.llmConfig || !llmProvider) {
      return {
        sender: this.name, recipient: message.sender,
        content: '无法生成回复：未配置 LLM', role: 'assistant', timestamp: Date.now()
      };
    }

    const contextMessages: AutoGenMessage[] = [
      { sender: 'system', recipient: this.name, content: this.systemMessage, role: 'system', timestamp: 0 },
      ...this.conversationHistory
    ];

    const response = await llmProvider.generate(contextMessages, this.llmConfig);
    const reply: AutoGenMessage = {
      sender: this.name, recipient: message.sender,
      content: response.content, role: 'assistant', timestamp: Date.now()
    };
    this.conversationHistory.push(reply);
    return reply;
  }

  clearHistory(): void { this.conversationHistory = []; }
}

class GroupChat {
  readonly agents: ConversableAgent[];
  readonly maxRound: number;
  readonly speakerSelectionMethod: SpeakerSelectionMethod;
  private messages: AutoGenMessage[] = [];

  constructor(config: {
    agents: ConversableAgent[];
    maxRound?: number;
    speakerSelectionMethod?: SpeakerSelectionMethod;
  }) {
    this.agents = config.agents;
    this.maxRound = config.maxRound ?? 10;
    this.speakerSelectionMethod = config.speakerSelectionMethod ?? 'auto';
  }

  selectSpeaker(lastSpeaker: ConversableAgent): ConversableAgent {
    const currentIndex = this.agents.indexOf(lastSpeaker);
    return this.agents[(currentIndex + 1) % this.agents.length];
  }

  addMessage(message: AutoGenMessage): void { this.messages.push(message); }
  getMessages(): AutoGenMessage[] { return [...this.messages]; }
}

class GroupChatManager {
  private groupChat: GroupChat;
  private llmProvider: AutoGenLLMProvider;

  constructor(config: { groupChat: GroupChat; llmProvider: AutoGenLLMProvider }) {
    this.groupChat = config.groupChat;
    this.llmProvider = config.llmProvider;
  }

  async run(initiator: ConversableAgent, initialMessage: string): Promise<AutoGenMessage[]> {
    const startMessage: AutoGenMessage = {
      sender: initiator.name, recipient: 'group',
      content: initialMessage, role: 'user', timestamp: Date.now()
    };
    this.groupChat.addMessage(startMessage);

    let currentSpeaker = initiator;
    let round = 0;

    while (round < this.groupChat.maxRound) {
      round++;
      const nextSpeaker = this.groupChat.selectSpeaker(currentSpeaker);
      const messages = this.groupChat.getMessages();
      const lastMessage = messages[messages.length - 1];

      const reply = await nextSpeaker.receiveMessage(lastMessage, this.llmProvider);
      if (!reply) { console.log(`[GroupChat] 对话在第 ${round} 轮终止`); break; }

      this.groupChat.addMessage(reply);
      currentSpeaker = nextSpeaker;
      console.log(`[Round ${round}] ${nextSpeaker.name}: ${reply.content.substring(0, 80)}...`);
    }

    return this.groupChat.getMessages();
  }
}

// 使用示例
function createCodingGroupChat(llmProvider: AutoGenLLMProvider): GroupChatManager {
  const architect = new ConversableAgent({
    name: 'architect',
    systemMessage: '你是软件架构师，负责设计技术方案。',
    llmConfig: { model: 'gpt-4', temperature: 0.2, maxTokens: 3000 }
  });

  const developer = new ConversableAgent({
    name: 'developer',
    systemMessage: '你是高级 TypeScript 开发者，负责编写代码。完成时输出 TERMINATE。',
    llmConfig: { model: 'gpt-4', temperature: 0.1, maxTokens: 4000 },
    isTerminationMsg: (msg) => msg.content.includes('TERMINATE')
  });

  const reviewer = new ConversableAgent({
    name: 'reviewer',
    systemMessage: '你是代码审查专家，检查类型安全、错误处理和最佳实践。',
    llmConfig: { model: 'gpt-4', temperature: 0.1, maxTokens: 2000 }
  });

  const groupChat = new GroupChat({ agents: [architect, developer, reviewer], maxRound: 15 });
  return new GroupChatManager({ groupChat, llmProvider });
}

// 优势：对话驱动自然直观、群聊机制灵活、内置代码执行
// 劣势：0.4 与 0.2 API 不兼容(breaking change)、AG2 分叉导致社区分裂、对话轮数不可控
// 注意：AutoGen 0.4 (Microsoft) 采用全新异步 Actor 模型；AG2 (ag2.ai) 延续 0.2 经典 API
```

### 11.2.5 OpenAI Agents SDK 深度分析

#### 核心概念

OpenAI Agents SDK 追求极简设计，仅有四个核心原语：Agent、Handoff、Guardrail、Runner。

#### 完整代码示例

```typescript
// ============================================================
// OpenAI Agents SDK 风格的 Agent 实现
// 演示：多 Agent 客服系统（Handoff + Guardrail）
// ============================================================

interface AgentSDKTool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

interface HandoffConfig {
  targetAgent: SDKAgent;
  toolName: string;
  toolDescription: string;
}

interface GuardrailConfig {
  type: 'input' | 'output';
  name: string;
  validate: (data: string, context: RunContext) => Promise<GuardrailResult>;
}

interface GuardrailResult {
  passed: boolean;
  reason?: string;
  transformedData?: string;
}

interface SDKMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  refusal?: string;
}

interface RunContext {
  agentName: string;
  turnCount: number;
  metadata: Record<string, unknown>;
}

interface RunResult {
  finalAgent: string;
  messages: SDKMessage[];
  guardrailResults: GuardrailResult[];
  handoffHistory: string[];
  tokenUsage: { total: number };
}

interface AgentSDKLLMProvider {
  chat(
    messages: SDKMessage[],
    tools: AgentSDKTool[],
    model: string
  ): Promise<{
    content: string;
    toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
    refusal?: string;
  }>;
}

class SDKAgent {
  readonly name: string;
  readonly instructions: string;
  readonly model: string;
  readonly tools: AgentSDKTool[];
  readonly handoffs: HandoffConfig[];
  readonly inputGuardrails: GuardrailConfig[];
  readonly outputGuardrails: GuardrailConfig[];

  constructor(config: {
    name: string;
    instructions: string;
    model?: string;
    tools?: AgentSDKTool[];
    handoffs?: HandoffConfig[];
    inputGuardrails?: GuardrailConfig[];
    outputGuardrails?: GuardrailConfig[];
  }) {
    this.name = config.name;
    this.instructions = config.instructions;
    this.model = config.model ?? 'gpt-4';
    this.tools = config.tools ?? [];
    this.handoffs = config.handoffs ?? [];
    this.inputGuardrails = config.inputGuardrails ?? [];
    this.outputGuardrails = config.outputGuardrails ?? [];
  }

  getAllTools(): AgentSDKTool[] {
    const handoffTools: AgentSDKTool[] = this.handoffs.map(h => ({
      type: 'function' as const, name: h.toolName, description: h.toolDescription,
      parameters: { type: 'object', properties: { reason: { type: 'string' } } },
      execute: async () => `HANDOFF:${h.targetAgent.name}`
    }));
    return [...this.tools, ...handoffTools];
  }
}

class SDKRunner {
  private llmProvider: AgentSDKLLMProvider;
  private maxTurns: number;

  constructor(config: { llmProvider: AgentSDKLLMProvider; maxTurns?: number }) {
    this.llmProvider = config.llmProvider;
    this.maxTurns = config.maxTurns ?? 10;
  }

  async run(agent: SDKAgent, input: string): Promise<RunResult> {
    const messages: SDKMessage[] = [];
    const guardrailResults: GuardrailResult[] = [];
    const handoffHistory: string[] = [agent.name];
    let currentAgent = agent;
    let turnCount = 0;

    messages.push({ role: 'user', content: input });

    while (turnCount < this.maxTurns) {
      turnCount++;
      const context: RunContext = { agentName: currentAgent.name, turnCount, metadata: {} };

      // 输入防护
      for (const guardrail of currentAgent.inputGuardrails) {
        const lastUserMsg = messages.filter(m => m.role === 'user').pop();
        if (lastUserMsg) {
          const result = await guardrail.validate(lastUserMsg.content, context);
          guardrailResults.push(result);
          if (!result.passed) {
            messages.push({ role: 'assistant', content: `输入未通过安全检查：${result.reason}` });
            return { finalAgent: currentAgent.name, messages, guardrailResults, handoffHistory, tokenUsage: { total: 0 } };
          }
        }
      }

      // 调用 LLM
      const systemMessages: SDKMessage[] = [{ role: 'system', content: currentAgent.instructions }];
      const response = await this.llmProvider.chat(
        [...systemMessages, ...messages], currentAgent.getAllTools(), currentAgent.model
      );

      // 处理工具调用
      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          const tool = currentAgent.getAllTools().find(t => t.name === toolCall.name);
          if (!tool) continue;
          const toolResult = await tool.execute(toolCall.arguments);

          // 检查 Handoff
          if (toolResult.startsWith('HANDOFF:')) {
            const targetName = toolResult.replace('HANDOFF:', '');
            const handoff = currentAgent.handoffs.find(h => h.targetAgent.name === targetName);
            if (handoff) {
              currentAgent = handoff.targetAgent;
              handoffHistory.push(currentAgent.name);
              messages.push({ role: 'system', content: `[对话已转交给 ${currentAgent.name}]` });
              continue;
            }
          }
          messages.push({ role: 'tool', content: toolResult });
        }
        continue;
      }

      // 输出防护
      let finalContent = response.content;
      for (const guardrail of currentAgent.outputGuardrails) {
        const result = await guardrail.validate(finalContent, context);
        guardrailResults.push(result);
        if (result.transformedData) finalContent = result.transformedData;
      }

      messages.push({ role: 'assistant', content: finalContent });
      break;
    }

    return { finalAgent: currentAgent.name, messages, guardrailResults, handoffHistory, tokenUsage: { total: turnCount * 100 } };
  }
}

// ---- 使用示例：多 Agent 客服 ----

function createCustomerServiceSystem(llmProvider: AgentSDKLLMProvider): { runner: SDKRunner; frontDesk: SDKAgent } {
  const piiGuardrail: GuardrailConfig = {
    type: 'output', name: 'pii_filter',
    validate: async (data) => {
      const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
      return { passed: true, transformedData: ssnRegex.test(data) ? data.replace(ssnRegex, '***-**-****') : undefined };
    }
  };

  const orderLookupTool: AgentSDKTool = {
    type: 'function', name: 'lookup_order', description: '查询订单状态',
    parameters: { type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'] },
    execute: async (args) => JSON.stringify({ orderId: args.orderId, status: '已发货', trackingNumber: 'SF1234567890' })
  };

  const technicalSupport = new SDKAgent({
    name: 'technical_support',
    instructions: '你是技术支持专家，帮助用户解决技术问题。',
    outputGuardrails: [piiGuardrail]
  });

  const financialAgent = new SDKAgent({
    name: 'financial_agent',
    instructions: '你是财务专员，处理退款和支付问题。',
    outputGuardrails: [piiGuardrail]
  });

  const frontDesk = new SDKAgent({
    name: 'front_desk',
    instructions: '你是前台客服，负责迎接客户、处理订单查询、转接技术或财务问题。',
    tools: [orderLookupTool],
    handoffs: [
      { targetAgent: technicalSupport, toolName: 'transfer_to_tech', toolDescription: '转交技术问题' },
      { targetAgent: financialAgent, toolName: 'transfer_to_finance', toolDescription: '转交财务问题' }
    ],
    outputGuardrails: [piiGuardrail]
  });

  return { runner: new SDKRunner({ llmProvider, maxTurns: 15 }), frontDesk };
}

// 优势：API 极简、Handoff 优雅、内置 Guardrail、深度整合 OpenAI
// 劣势：供应商锁定、状态管理弱、框架较新
```


### 11.2.6 OpenClaw 深度分析

#### 核心概念

OpenClaw 的设计围绕"Gateway + Plugin"架构，核心概念包括：

1. **Gateway**：中心化的守护进程，负责消息路由、插件管理和生命周期控制
2. **Plugin**：所有能力的基本单元——LLM 提供商、工具、消息平台适配器、记忆后端都是插件
3. **Adapter**：消息平台适配器，将 Slack、Discord、Teams、WeChat 等平台的消息格式归一化
4. **MCP Tool**：内置 134 个 MCP 兼容工具，支持标准化的工具互操作

#### Gateway 架构

OpenClaw 的 Gateway 架构与其他框架的"编排器"思路截然不同。它不关注 Agent 之间的复杂协作流程，而是充当用户消息与 AI 能力之间的"交换机"：

- **消息入站**：来自 20+ 平台的消息统一进入 Gateway
- **插件处理**：Gateway 按配置将消息路由到对应的 LLM 插件和工具插件
- **消息出站**：处理结果通过平台适配器原路返回

#### MCP 原生支持

OpenClaw 是最早全面支持 MCP (Model Context Protocol) 的框架之一。134 个内置工具涵盖文件操作、数据库查询、API 调用、代码执行等常见场景，且全部遵循 MCP 标准，可与其他 MCP 兼容框架互操作。

#### 完整代码示例

```typescript
// ============================================================
// OpenClaw 风格的 Gateway + Plugin Agent 实现
// 演示：构建一个多平台客服 Bot
// ============================================================

// ---- 核心类型定义 ----

interface OpenClawMessage {
  id: string;
  platform: string;        // 来源平台: 'slack' | 'discord' | 'teams' | 'wechat' | ...
  channelId: string;
  userId: string;
  content: string;
  attachments?: Attachment[];
  metadata: Record<string, unknown>;
  timestamp: number;
}

interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  url: string;
  name: string;
  mimeType: string;
}

interface GatewayConfig {
  name: string;
  defaultLLM: string;
  plugins: PluginConfig[];
  routing: RoutingRule[];
  logging: { level: 'debug' | 'info' | 'warn' | 'error' };
}

interface PluginConfig {
  name: string;
  type: 'llm' | 'tool' | 'adapter' | 'memory' | 'middleware';
  enabled: boolean;
  config: Record<string, unknown>;
}

interface RoutingRule {
  platform?: string;
  channelPattern?: string;
  contentPattern?: string;
  targetPlugin: string;
}

// ---- Plugin 基类 ----

abstract class OpenClawPlugin {
  abstract readonly name: string;
  abstract readonly type: 'llm' | 'tool' | 'adapter' | 'memory' | 'middleware';
  protected gateway: OpenClawGateway | null = null;

  async initialize(gateway: OpenClawGateway): Promise<void> {
    this.gateway = gateway;
    console.log(`[Plugin:${this.name}] 初始化完成`);
  }

  async destroy(): Promise<void> {
    this.gateway = null;
    console.log(`[Plugin:${this.name}] 已销毁`);
  }
}

// ---- LLM Plugin ----

abstract class LLMPlugin extends OpenClawPlugin {
  readonly type = 'llm' as const;
  abstract complete(
    messages: Array<{ role: string; content: string }>,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string>;
}

class OpenAILLMPlugin extends LLMPlugin {
  readonly name = 'openai';
  private model: string;
  private apiKey: string;

  constructor(config: { model: string; apiKey: string }) {
    super();
    this.model = config.model;
    this.apiKey = config.apiKey;
  }

  async complete(
    messages: Array<{ role: string; content: string }>,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    // 实际实现中调用 OpenAI API
    console.log(`[OpenAI] 调用 ${this.model}，消息数: ${messages.length}`);
    return `[${this.model}] 模拟响应`;
  }
}

class AnthropicLLMPlugin extends LLMPlugin {
  readonly name = 'anthropic';
  private model: string;

  constructor(config: { model: string; apiKey: string }) {
    super();
    this.model = config.model;
  }

  async complete(
    messages: Array<{ role: string; content: string }>,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    console.log(`[Anthropic] 调用 ${this.model}，消息数: ${messages.length}`);
    return `[${this.model}] 模拟响应`;
  }
}

// ---- Platform Adapter Plugin ----

abstract class PlatformAdapterPlugin extends OpenClawPlugin {
  readonly type = 'adapter' as const;
  abstract readonly platform: string;
  private messageHandler: ((msg: OpenClawMessage) => Promise<void>) | null = null;

  onMessage(handler: (msg: OpenClawMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  protected async emitMessage(msg: OpenClawMessage): Promise<void> {
    if (this.messageHandler) {
      await this.messageHandler(msg);
    }
  }

  abstract sendMessage(channelId: string, content: string): Promise<void>;
  abstract startListening(): Promise<void>;
  abstract stopListening(): Promise<void>;
}

class SlackAdapterPlugin extends PlatformAdapterPlugin {
  readonly name = 'slack-adapter';
  readonly platform = 'slack';
  private botToken: string;

  constructor(config: { botToken: string }) {
    super();
    this.botToken = config.botToken;
  }

  async sendMessage(channelId: string, content: string): Promise<void> {
    console.log(`[Slack] 发送到 ${channelId}: ${content.substring(0, 60)}...`);
    // 实际实现中调用 Slack Web API
  }

  async startListening(): Promise<void> {
    console.log('[Slack] 开始监听消息（Socket Mode）');
    // 实际实现中启动 Slack Socket Mode
  }

  async stopListening(): Promise<void> {
    console.log('[Slack] 停止监听');
  }
}

class DiscordAdapterPlugin extends PlatformAdapterPlugin {
  readonly name = 'discord-adapter';
  readonly platform = 'discord';

  constructor(config: { botToken: string }) {
    super();
  }

  async sendMessage(channelId: string, content: string): Promise<void> {
    console.log(`[Discord] 发送到 ${channelId}: ${content.substring(0, 60)}...`);
  }

  async startListening(): Promise<void> {
    console.log('[Discord] 开始监听消息');
  }

  async stopListening(): Promise<void> {
    console.log('[Discord] 停止监听');
  }
}

// ---- MCP Tool Plugin ----

interface MCPToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

abstract class MCPToolPlugin extends OpenClawPlugin {
  readonly type = 'tool' as const;
  abstract readonly schema: MCPToolSchema;
  abstract execute(params: Record<string, unknown>): Promise<unknown>;
}

class WebSearchTool extends MCPToolPlugin {
  readonly name = 'web-search';
  readonly schema: MCPToolSchema = {
    name: 'web_search',
    description: '搜索互联网获取最新信息',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        maxResults: { type: 'number', description: '最大结果数' },
      },
      required: ['query'],
    },
  };

  async execute(params: Record<string, unknown>): Promise<unknown> {
    const query = params.query as string;
    return { results: [{ title: `关于 ${query} 的结果`, url: 'https://...' }] };
  }
}

// ---- Gateway 核心 ----

class OpenClawGateway {
  private config: GatewayConfig;
  private plugins = new Map<string, OpenClawPlugin>();
  private llmPlugins = new Map<string, LLMPlugin>();
  private adapters = new Map<string, PlatformAdapterPlugin>();
  private tools = new Map<string, MCPToolPlugin>();
  private running = false;

  constructor(config: GatewayConfig) {
    this.config = config;
  }

  /** 注册插件 */
  use(plugin: OpenClawPlugin): this {
    this.plugins.set(plugin.name, plugin);
    if (plugin instanceof LLMPlugin) {
      this.llmPlugins.set(plugin.name, plugin);
    } else if (plugin instanceof PlatformAdapterPlugin) {
      this.adapters.set(plugin.platform, plugin);
    } else if (plugin instanceof MCPToolPlugin) {
      this.tools.set(plugin.name, plugin);
    }
    return this;
  }

  /** 启动 Gateway */
  async start(): Promise<void> {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`OpenClaw Gateway "${this.config.name}" 启动中...`);
    console.log(`${'='.repeat(50)}\n`);

    // 1. 初始化所有插件
    for (const [name, plugin] of this.plugins) {
      await plugin.initialize(this);
    }

    // 2. 为所有适配器注册消息处理器
    for (const [platform, adapter] of this.adapters) {
      adapter.onMessage(async (msg) => {
        await this.handleIncomingMessage(msg);
      });
      await adapter.startListening();
      console.log(`[Gateway] 平台 ${platform} 已连接`);
    }

    this.running = true;
    console.log(
      `\n[Gateway] 启动完成 | ` +
      `LLM: ${this.llmPlugins.size} | ` +
      `适配器: ${this.adapters.size} | ` +
      `工具: ${this.tools.size}`
    );
  }

  /** 处理入站消息 */
  private async handleIncomingMessage(msg: OpenClawMessage): Promise<void> {
    console.log(`[Gateway] 收到消息 | 平台: ${msg.platform} | 用户: ${msg.userId}`);

    // 1. 路由选择 LLM
    const llmName = this.routeToLLM(msg);
    const llm = this.llmPlugins.get(llmName);
    if (!llm) {
      console.error(`[Gateway] 未找到 LLM 插件: ${llmName}`);
      return;
    }

    // 2. 构建工具描述
    const toolDescriptions = Array.from(this.tools.values())
      .map(t => `- ${t.schema.name}: ${t.schema.description}`)
      .join('\n');

    // 3. 调用 LLM
    const systemPrompt =
      `你是一个多平台 AI 助手。用户来自 ${msg.platform} 平台。\n` +
      `可用工具:\n${toolDescriptions}`;

    const response = await llm.complete([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: msg.content },
    ]);

    // 4. 通过原平台适配器回复
    const adapter = this.adapters.get(msg.platform);
    if (adapter) {
      await adapter.sendMessage(msg.channelId, response);
    }
  }

  /** 路由：根据规则选择 LLM 插件 */
  private routeToLLM(msg: OpenClawMessage): string {
    for (const rule of this.config.routing) {
      if (rule.platform && rule.platform !== msg.platform) continue;
      if (rule.contentPattern) {
        const regex = new RegExp(rule.contentPattern, 'i');
        if (!regex.test(msg.content)) continue;
      }
      return rule.targetPlugin;
    }
    return this.config.defaultLLM;
  }

  /** 停止 Gateway */
  async stop(): Promise<void> {
    console.log('[Gateway] 正在停止...');
    for (const [, adapter] of this.adapters) {
      await adapter.stopListening();
    }
    for (const [, plugin] of this.plugins) {
      await plugin.destroy();
    }
    this.running = false;
    console.log('[Gateway] 已停止');
  }

  /** 获取已注册工具列表（MCP 兼容） */
  listMCPTools(): MCPToolSchema[] {
    return Array.from(this.tools.values()).map(t => t.schema);
  }
}

// ---- 使用示例：多平台客服 Bot ----

function createMultiPlatformBot(): OpenClawGateway {
  const gateway = new OpenClawGateway({
    name: 'customer-service-bot',
    defaultLLM: 'openai',
    plugins: [],
    routing: [
      // 技术问题路由到 Claude（更擅长代码和技术分析）
      { contentPattern: '(代码|bug|错误|技术|API)', targetPlugin: 'anthropic' },
      // 其他问题使用 OpenAI
      { targetPlugin: 'openai' },
    ],
    logging: { level: 'info' },
  });

  // 注册 LLM 插件
  gateway
    .use(new OpenAILLMPlugin({ model: 'gpt-4o', apiKey: 'sk-xxx' }))
    .use(new AnthropicLLMPlugin({ model: 'claude-sonnet-4-20250514', apiKey: 'sk-ant-xxx' }));

  // 注册平台适配器
  gateway
    .use(new SlackAdapterPlugin({ botToken: 'xoxb-xxx' }))
    .use(new DiscordAdapterPlugin({ botToken: 'discord-xxx' }));

  // 注册 MCP 工具
  gateway.use(new WebSearchTool());

  return gateway;
}

// 优势：20+ 平台开箱即用、134 MCP 工具生态、插件架构极度灵活、社区活跃（100K+ Stars）
// 劣势：复杂编排能力弱、状态管理依赖插件、不适合深度多 Agent 协作场景
```



### 11.2.7 Mastra 深度分析

#### 核心概念

Mastra 是一个 **TypeScript 原生**的 AI Agent 框架，由 Gatsby.js 背后的团队创建（~25K GitHub Stars，Apache 2.0 许可）[[Mastra GitHub]](https://github.com/mastra-ai/mastra)。2026 年 2 月正式发布 **Mastra 1.0** [[Announcing Mastra 1.0]](https://mastra.ai/categories/announcements)，标志着框架进入生产稳定阶段。其设计哲学是将 Agent 开发体验做到与现代 Web 开发同样流畅：类型安全、声明式配置、开箱即用的集成生态。Mastra 1.0 同时新增了 Agent Studio（可视化调试工具）、Datasets（评估数据集管理）、Workspaces（安全沙箱环境）等功能，并与 **Vercel AI SDK v5** 深度集成。

核心概念包括：

1. **Agent**：绑定 LLM、指令和工具集的执行单元
2. **Workflow**：类似 Temporal 的持久化工作流引擎，支持步骤编排、条件分支、重试和暂停/恢复
3. **Tools + Memory + RAG Pipeline**：内置 RAG 管道、向量搜索和对话记忆
4. **MCP 一等公民支持**：Mastra 是最早原生支持 Model Context Protocol 的 TypeScript 框架之一，内置 MCP Server 支持和 MCP Registry [[MCP Server Support in Mastra]](https://mastra.ai/categories/announcements)
5. **50+ 集成**：内置 GitHub、Slack、Notion、Google 等主流服务连接器
6. **Evals & Scoring**：内置评估框架，支持 model-graded、rule-based 和统计方法的 Agent 输出质量评估

#### 代码示例

```typescript
import { Agent, Mastra } from '@mastra/core';

const researchAgent = new Agent({
  name: 'Research Assistant',
  instructions: '你是一个研究助手，帮助用户查找和总结信息。',
  model: { provider: 'ANTHROPIC', name: 'claude-sonnet-4-20250514' },
  tools: { webSearch, readUrl, summarize },
});

const mastra = new Mastra({ agents: { researchAgent } });
const result = await mastra.getAgent('researchAgent').generate(
  '总结 2024 年 AI Agent 框架的发展趋势'
);

// 优势：TypeScript 原生类型安全、Temporal 风格工作流引擎、内置 RAG、50+ 集成、MCP 一等公民支持、Mastra 1.0 生产就绪
// 劣势：Python 开发者需要切换技术栈、相比 LangGraph 图编排灵活性稍弱
```

### 11.2.8 Claude Agent SDK 深度分析

#### 核心概念

Claude Agent SDK 是 Anthropic 于 2025 年 9 月发布的官方 Agent 框架，与驱动 Claude Code 的底层原语相同。其核心设计理念是"**少即是多**"——用最小的抽象集合覆盖大多数 Agent 场景。

核心概念包括：

1. **Agent Loop**：核心执行循环——LLM 生成 → 工具调用 → 结果反馈 → 继续生成，直到任务完成
2. **Tools**：函数工具、MCP 服务器工具、子 Agent 作为工具
3. **Handoff / Subagents**：Agent 之间的任务委派和控制权转移
4. **Hooks**：生命周期钩子，在工具调用前后、消息生成后等节点插入自定义逻辑
5. **Guardrails**：输入/输出护栏，防止 Agent 越界或产生不安全内容

Python 优先（同时有社区维护的 TypeScript 移植版本）。

#### 代码示例

```typescript
// TypeScript 社区移植版示例（概念与 Python 版一致）
import { Agent, tool, handoff } from '@anthropic/agent-sdk';

const codeReviewer = new Agent({
  name: 'Code Reviewer',
  model: 'claude-sonnet-4-20250514',
  instructions: '你是一个代码审查专家，检查代码质量和安全性。',
  tools: [readFile, searchCode, runTests],
});

const mainAgent = new Agent({
  name: 'Dev Assistant',
  model: 'claude-sonnet-4-20250514',
  instructions: '你是一个开发助手，帮助用户完成编程任务。',
  tools: [editFile, terminal],
  handoffs: [handoff(codeReviewer, '当需要代码审查时委派给审查专家')],
  guardrails: [noSecretLeakage, safeCommandExecution],
});

const result = await mainAgent.run('重构 src/utils.ts 中的错误处理逻辑');

// 优势：与 Claude Code 同源、Agent Loop 设计简洁强大、Handoff 机制优雅、Guardrails 一等支持
// 劣势：Anthropic 生态绑定、框架较新、TypeScript 版为社区维护
```

### 11.2.9 Agno 深度分析

#### 核心概念

Agno（前身为 Phidata）是一个轻量级的多模态 Agent 框架，强调**快速创建 Agent**和**灵活的多 Agent 协作**。模型无关设计，支持所有主流 LLM 提供商。

三种多 Agent 协作模式：

1. **Router（路由模式）**：根据输入分类将任务路由到最合适的专家 Agent
2. **Coordinator（协调模式）**：协调者 Agent 制定计划，按计划委派子任务给专家 Agent
3. **Team（团队模式）**：多个 Agent 并行执行各自擅长的任务，结果汇总

其他特性：
- **多模态**：原生支持文本、图像、音频、视频输入
- **监控仪表盘**：内置 Agent 运行监控和调试界面
- **Python 优先**：API 极简，几行代码即可创建生产级 Agent

#### 代码示例

```python
from agno.agent import Agent
from agno.team import Team
from agno.models.openai import OpenAIChat

web_agent = Agent(
    name="Web Agent",
    role="搜索网络信息",
    model=OpenAIChat(id="gpt-4o"),
    tools=[DuckDuckGoTools()],
    instructions=["始终附上信息来源链接"],
)

analyst_agent = Agent(
    name="Analyst",
    role="数据分析和总结",
    model=OpenAIChat(id="gpt-4o"),
    tools=[PythonTools()],
    instructions=["用数据支撑结论"],
)

team = Team(
    agents=[web_agent, analyst_agent],
    mode="coordinator",  # 或 "router" / "team"
    instructions=["协调两位专家完成研究任务"],
)

team.print_response("分析 2024 年全球 AI 投资趋势")

# 优势：API 极简上手快、三种协作模式灵活切换、多模态原生支持、内置监控仪表盘
# 劣势：深度定制能力有限、状态管理较简单、大规模编排场景支撑不足
```

---

### 11.2.10 Vercel AI SDK 深度分析

#### 核心概念

Vercel AI SDK（原名 AI SDK by Vercel）是面向 **Web 开发者**的 TypeScript AI 框架，专注于将 AI 能力无缝嵌入现代 Web 应用 [[AI SDK by Vercel]](https://ai-sdk.dev/docs/introduction)。2025 年发布的 **AI SDK v5** 带来了重大升级 [[AI SDK 5 Announcement]](https://vercel.com/blog/ai-sdk-5)，新增了 Agent 抽象层、Agentic Loop 控制、增强的工具系统和 SSE 流式协议。

核心概念包括：

1. **AI SDK Core**：底层模型调用层，提供 `generateText`、`streamText`、`generateObject` 等函数，支持 25+ 模型提供商（OpenAI、Anthropic、Google、Mistral、Llama 等）
2. **AI SDK UI**：前端集成层，提供 React/Vue/Svelte/Nuxt hooks（如 `useChat`、`useCompletion`），实现流式 UI 和类型安全的工具调用渲染
3. **Agent 抽象 (v5+)**：`agent()` 函数和 `stopWhen`/`prepareStep` 控制器，将多步工具调用循环封装为可复用的 Agent 单元
4. **Tool 系统 (v5+)**：Dynamic Tools、Tool Lifecycle Hooks、Provider-Executed Tools，支持运行时动态注册和生命周期管理
5. **MCP 原生支持**：一等公民级别的 Model Context Protocol 工具集成

#### 适用场景

Vercel AI SDK 的核心优势在于 **Web 应用场景**——当你的 Agent 需要一个精美的前端界面、实时流式响应、或嵌入到 Next.js/Nuxt 应用中时，它是最自然的选择。它不追求复杂的多 Agent 编排（这方面不如 LangGraph），而是让单 Agent 或简单多步工具调用在 Web 环境中达到最佳体验。

#### 代码示例

```typescript
import { openai } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { z } from 'zod';

// 定义工具
const weatherTool = tool({
  description: '获取指定城市的天气信息',
  parameters: z.object({
    city: z.string().describe('城市名称'),
  }),
  execute: async ({ city }) => {
    return { city, temperature: 22, condition: '晴' };
  },
});

// 多步 Agent 调用（AI SDK v5 风格）
const result = await generateText({
  model: openai('gpt-4o'),
  tools: { weather: weatherTool },
  maxSteps: 5, // 允许多步工具调用循环
  prompt: '北京和上海今天哪个更热？',
});

console.log(result.text);
// AI SDK 会自动执行多步：调用天气工具获取两城市温度 → 比较 → 生成自然语言回答

// 优势：Web 生态最佳集成、25+ 模型提供商、流式 UI 原生支持、TypeScript 类型安全、Agent/Tool 抽象优雅
// 劣势：复杂多 Agent 编排能力有限、无内置检查点持久化、主要面向 Web 场景
```

## 11.3 框架抽象层

在实际项目中，直接绑定某个特定框架会带来巨大的迁移风险。本节介绍如何构建一个框架无关的抽象层，使得业务逻辑与底层框架解耦。

### 11.3.1 完整的框架抽象接口

```typescript
// ============================================================
// 框架无关的 Agent 抽象层
// ============================================================

interface AgentConfig {
  name: string;
  instructions: string;
  model: string;
  tools: ToolDefinition[];
  maxIterations?: number;
  temperature?: number;
  metadata?: Record<string, unknown>;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema & { description?: string }>;
  required?: string[];
}

interface ExecutionResult {
  success: boolean;
  output: string;
  messages: AbstractMessage[];
  tokenUsage: TokenUsage;
  metadata: { framework: string; executionTime: number; iterationCount: number; toolCallCount: number };
}

interface AbstractMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

interface CheckpointData {
  id: string;
  threadId: string;
  state: Record<string, unknown>;
  messages: AbstractMessage[];
  timestamp: number;
  agentName: string;
}

interface StreamEvent {
  type: 'start' | 'delta' | 'tool_call' | 'tool_result' | 'end' | 'error';
  content?: string;
  agentName: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/** 框架抽象接口：所有框架适配器必须实现此接口 */
interface IFrameworkAbstraction {
  readonly frameworkName: string;
  readonly version: string;
  createAgent(config: AgentConfig): Promise<string>;
  execute(agentId: string, input: string, threadId?: string): Promise<ExecutionResult>;
  stream(agentId: string, input: string, threadId?: string): AsyncIterable<StreamEvent>;
  saveCheckpoint(threadId: string): Promise<CheckpointData>;
  restoreCheckpoint(checkpoint: CheckpointData): Promise<void>;
  registerTool(agentId: string, tool: ToolDefinition): Promise<void>;
  removeTool(agentId: string, toolName: string): Promise<void>;
  listTools(agentId: string): Promise<ToolDefinition[]>;
  destroyAgent(agentId: string): Promise<void>;
  healthCheck(): Promise<{ healthy: boolean; details: Record<string, unknown> }>;
}
```

### 11.3.2 Agent 工厂模式与插件系统

```typescript
// ============================================================
// Agent 工厂 + 插件系统
// ============================================================

type FrameworkType = 'google-adk' | 'langgraph' | 'crewai' | 'autogen' | 'ag2' | 'openai-agents' | 'openclaw' | 'mastra' | 'vercel-ai-sdk';

class FrameworkRegistry {
  private static instance: FrameworkRegistry;
  private adapters = new Map<FrameworkType, IFrameworkAbstraction>();

  private constructor() {}

  static getInstance(): FrameworkRegistry {
    if (!FrameworkRegistry.instance) FrameworkRegistry.instance = new FrameworkRegistry();
    return FrameworkRegistry.instance;
  }

  register(type: FrameworkType, adapter: IFrameworkAbstraction): void {
    this.adapters.set(type, adapter);
  }

  get(type: FrameworkType): IFrameworkAbstraction {
    const adapter = this.adapters.get(type);
    if (!adapter) throw new Error(`框架 "${type}" 未注册`);
    return adapter;
  }

  listFrameworks(): FrameworkType[] {
    return Array.from(this.adapters.keys());
  }
}

/** 插件接口 */
interface FrameworkPlugin {
  name: string;
  version: string;
  beforeCreate?(config: AgentConfig): AgentConfig;
  beforeExecute?(agentId: string, input: string): string;
  afterExecute?(result: ExecutionResult): ExecutionResult;
  onError?(error: Error, context: { agentId: string; input: string }): void;
}

/** 带插件支持的 Agent 工厂 */
class PluggableAgentFactory {
  private plugins: FrameworkPlugin[] = [];
  private registry = FrameworkRegistry.getInstance();
  private activeAgents = new Map<string, { framework: FrameworkType; agentId: string }>();

  use(plugin: FrameworkPlugin): this {
    this.plugins.push(plugin);
    console.log(`已加载插件: ${plugin.name} v${plugin.version}`);
    return this;
  }

  async create(config: AgentConfig, framework: FrameworkType): Promise<{ agentId: string; framework: FrameworkType }> {
    let processedConfig = { ...config };
    for (const plugin of this.plugins) {
      if (plugin.beforeCreate) processedConfig = plugin.beforeCreate(processedConfig);
    }

    const adapter = this.registry.get(framework);
    const agentId = await adapter.createAgent(processedConfig);
    this.activeAgents.set(agentId, { framework, agentId });
    return { agentId, framework };
  }

  async execute(agentId: string, input: string, threadId?: string): Promise<ExecutionResult> {
    const info = this.activeAgents.get(agentId);
    if (!info) throw new Error(`Agent ${agentId} 不存在`);

    let processedInput = input;
    for (const plugin of this.plugins) {
      if (plugin.beforeExecute) processedInput = plugin.beforeExecute(agentId, processedInput);
    }

    try {
      const adapter = this.registry.get(info.framework);
      let result = await adapter.execute(agentId, processedInput, threadId);
      for (const plugin of this.plugins) {
        if (plugin.afterExecute) result = plugin.afterExecute(result);
      }
      return result;
    } catch (error) {
      for (const plugin of this.plugins) {
        if (plugin.onError) plugin.onError(error instanceof Error ? error : new Error(String(error)), { agentId, input: processedInput });
      }
      throw error;
    }
  }

  async destroy(agentId: string): Promise<void> {
    const info = this.activeAgents.get(agentId);
    if (!info) return;
    const adapter = this.registry.get(info.framework);
    await adapter.destroyAgent(agentId);
    this.activeAgents.delete(agentId);
  }
}

// ---- 示例插件 ----

const loggingPlugin: FrameworkPlugin = {
  name: 'logging', version: '1.0.0',
  beforeExecute(agentId: string, input: string): string {
    console.log(`[LOG] Agent ${agentId} 接收输入: ${input.substring(0, 100)}`);
    return input;
  },
  afterExecute(result: ExecutionResult): ExecutionResult {
    console.log(`[LOG] 完成 | 框架: ${result.metadata.framework} | 耗时: ${result.metadata.executionTime}ms`);
    return result;
  }
};

const metricsPlugin: FrameworkPlugin = {
  name: 'metrics', version: '1.0.0',
  afterExecute(result: ExecutionResult): ExecutionResult {
    console.log('[METRICS]', JSON.stringify({
      framework: result.metadata.framework,
      latency: result.metadata.executionTime,
      tokens: result.tokenUsage.totalTokens,
      cost: result.tokenUsage.estimatedCost
    }));
    return result;
  }
};
```

---

## 11.4 基准测试对比

选型决策不应仅依赖定性分析，还需要定量的基准测试数据。

### 11.4.1 基准测试框架

```typescript
// ============================================================
// Agent 框架基准测试工具
// ============================================================

interface BenchmarkScenario {
  name: string;
  description: string;
  category: 'simple_qa' | 'multi_tool' | 'multi_agent' | 'long_running';
  input: string;
  expectedBehavior: string;
  maxTimeMs: number;
  requiredTools: string[];
  complexityScore: number;
}

interface BenchmarkRun {
  scenarioName: string;
  framework: string;
  latencyMs: number;
  firstTokenMs: number;
  tokensUsed: TokenUsage;
  success: boolean;
  output: string;
  toolCallCount: number;
  iterationCount: number;
  errorMessage?: string;
}

interface BenchmarkAggregation {
  framework: string;
  scenario: string;
  runs: number;
  successRate: number;
  latency: { p50: number; p90: number; p99: number; mean: number; stdDev: number };
  tokenEfficiency: { meanTotalTokens: number; tokensPerToolCall: number };
  cost: { meanCostPerRun: number; costPer1000Runs: number };
}

class BenchmarkRunner {
  private scenarios: BenchmarkScenario[] = [];
  private factory: PluggableAgentFactory;

  constructor(factory: PluggableAgentFactory) { this.factory = factory; }

  addScenario(scenario: BenchmarkScenario): this {
    this.scenarios.push(scenario);
    return this;
  }

  async runAll(frameworks: FrameworkType[], runsPerScenario: number = 5): Promise<Map<string, BenchmarkAggregation[]>> {
    const allResults = new Map<string, BenchmarkAggregation[]>();
    for (const framework of frameworks) {
      const frameworkResults: BenchmarkAggregation[] = [];
      for (const scenario of this.scenarios) {
        console.log(`测试: ${framework} | 场景: ${scenario.name}`);
        const runs: BenchmarkRun[] = [];
        for (let i = 0; i < runsPerScenario; i++) {
          const startTime = Date.now();
          try {
            const config: AgentConfig = {
              name: `bench_${scenario.name}`, instructions: '你是一个通用助手。', model: 'gpt-4',
              tools: scenario.requiredTools.map(name => ({
                name, description: `模拟工具: ${name}`,
                parameters: { type: 'object', properties: { input: { type: 'string' } } },
                execute: async (args) => `结果: ${JSON.stringify(args)}`
              }))
            };
            const { agentId } = await this.factory.create(config, framework);
            const result = await this.factory.execute(agentId, scenario.input);
            await this.factory.destroy(agentId);
            runs.push({
              scenarioName: scenario.name, framework, latencyMs: Date.now() - startTime,
              firstTokenMs: (Date.now() - startTime) * 0.3, tokensUsed: result.tokenUsage,
              success: result.success, output: result.output,
              toolCallCount: result.metadata.toolCallCount, iterationCount: result.metadata.iterationCount
            });
          } catch (error) {
            runs.push({
              scenarioName: scenario.name, framework, latencyMs: Date.now() - startTime,
              firstTokenMs: 0, tokensUsed: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 },
              success: false, output: '', toolCallCount: 0, iterationCount: 0,
              errorMessage: error instanceof Error ? error.message : String(error)
            });
          }
        }
        // 简化聚合
        const successRuns = runs.filter(r => r.success);
        const latencies = successRuns.map(r => r.latencyMs).sort((a, b) => a - b);
        const mean = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
        const percentile = (arr: number[], p: number) => arr.length > 0 ? arr[Math.ceil((p / 100) * arr.length) - 1] : 0;

        frameworkResults.push({
          framework, scenario: scenario.name, runs: runs.length,
          successRate: successRuns.length / runs.length,
          latency: { p50: percentile(latencies, 50), p90: percentile(latencies, 90), p99: percentile(latencies, 99), mean: mean(latencies), stdDev: 0 },
          tokenEfficiency: { meanTotalTokens: mean(successRuns.map(r => r.tokensUsed.totalTokens)), tokensPerToolCall: 0 },
          cost: { meanCostPerRun: mean(successRuns.map(r => r.tokensUsed.estimatedCost)), costPer1000Runs: mean(successRuns.map(r => r.tokensUsed.estimatedCost)) * 1000 }
        });
      }
      allResults.set(framework, frameworkResults);
    }
    return allResults;
  }
}
```

### 11.4.2 测试结果对比（示意数据，基于 2025-2026 公开信息估算）

| 框架 | 场景 | 成功率 | P50 延迟 | P90 延迟 | 平均 Token | 千次成本 |
|------|------|--------|----------|----------|-----------|---------|
| **Google ADK** | 简单问答 | 98% | 1.2s | 1.8s | 450 | $1.35 |
| **Google ADK** | 多工具任务 | 92% | 8.5s | 15.2s | 2,800 | $8.40 |
| **Google ADK** | 多 Agent | 85% | 35s | 62s | 8,500 | $25.50 |
| **LangGraph** | 简单问答 | 99% | 1.5s | 2.2s | 520 | $1.56 |
| **LangGraph** | 多工具任务 | 95% | 7.8s | 12.5s | 2,600 | $7.80 |
| **LangGraph** | 多 Agent | 92% | 28s | 48s | 7,200 | $21.60 |
| **CrewAI** | 简单问答 | 97% | 1.8s | 2.8s | 580 | $1.74 |
| **CrewAI** | 多工具任务 | 88% | 12s | 22s | 3,200 | $9.60 |
| **CrewAI** | 多 Agent | 82% | 45s | 78s | 12,000 | $36.00 |
| **AutoGen** | 简单问答 | 96% | 2.0s | 3.5s | 620 | $1.86 |
| **AutoGen** | 多工具任务 | 85% | 15s | 28s | 3,800 | $11.40 |
| **AutoGen** | 多 Agent | 88% | 38s | 65s | 10,500 | $31.50 |
| **OpenAI Agents** | 简单问答 | 99% | 1.0s | 1.5s | 400 | $1.20 |
| **OpenAI Agents** | 多工具任务 | 93% | 6.5s | 11s | 2,400 | $7.20 |
| **OpenAI Agents** | 多 Agent | 88% | 25s | 45s | 7,800 | $23.40 |
| **OpenClaw** | 简单问答 | 97% | 1.3s | 2.0s | 480 | $1.44 |
| **OpenClaw** | 多工具任务 | 91% | 9.0s | 16s | 2,900 | $8.70 |
| **OpenClaw** | 多 Agent | 78% | 50s | 85s | 11,000 | $33.00 |
| **Mastra** | 简单问答 | 98% | 1.1s | 1.7s | 430 | $1.29 |
| **Mastra** | 多工具任务 | 93% | 7.5s | 13s | 2,500 | $7.50 |
| **Mastra** | 多 Agent | 85% | 32s | 55s | 8,200 | $24.60 |
| **Vercel AI SDK** | 简单问答 | 99% | 0.9s | 1.4s | 390 | $1.17 |
| **Vercel AI SDK** | 多工具任务 | 94% | 6.0s | 10s | 2,300 | $6.90 |
| **Vercel AI SDK** | 多 Agent | 80% | 40s | 70s | 9,500 | $28.50 |

### 11.4.3 各框架优化建议

| 框架 | 优化方向 | 建议 | 预期效果 |
|------|---------|------|---------|
| Google ADK | 延迟 | 使用 Gemini Flash 替代 Pro | 降低 40-60% |
| LangGraph | 可靠性 | 使用 PostgresSaver 实现持久化检查点 | 成功率 +15-20% |
| CrewAI | Token 效率 | 精简 Agent backstory | 消耗降低 15-25% |
| AutoGen | 成本 | 设置合理的 max_consecutive_auto_reply | 成本降低 30-50% |
| OpenAI Agents | 延迟 | 使用 run_streamed 替代 run | 感知延迟降低 50-70% |
| OpenClaw | 多 Agent | 配合 LangGraph 插件处理复杂编排 | 成功率 +10-15% |
| Mastra | 工作流效率 | 利用 Workflow 持久化 + MCP 工具池 | 端到端延迟降低 20-30% |
| Vercel AI SDK | 前端体验 | 使用 SSE Streaming + useChat hooks | 感知延迟降低 60-80% |

## 11.5 选型决策方法论

> **核心原则**: 框架选型不是技术审美活动，而是工程决策过程。好的选型方法应该量化、可重复、可追溯。

### 11.5.1 多维决策矩阵

选型决策需要综合考虑技术、团队、业务三个维度。以下实现一个加权评分的决策矩阵：

```typescript
// ============================================================
// 决策矩阵：量化框架选型过程
// ============================================================

/** 评估维度定义 */
interface EvaluationDimension {
  readonly name: string;           // 维度名称
  readonly weight: number;         // 权重 (0-1)
  readonly description: string;    // 维度说明
  readonly category: 'technical' | 'team' | 'business'; // 分类
}

/** 单个框架的评分 */
interface FrameworkScore {
  readonly framework: string;
  readonly scores: Map<string, number>;  // 维度名 -> 分数 (1-10)
  readonly notes: Map<string, string>;   // 维度名 -> 备注
}

/** 决策结果 */
interface DecisionResult {
  readonly framework: string;
  readonly totalScore: number;
  readonly categoryScores: Record<string, number>;
  readonly strengths: string[];
  readonly weaknesses: string[];
  readonly rank: number;
}

class DecisionMatrix {
  private dimensions: EvaluationDimension[] = [];
  private frameworkScores: FrameworkScore[] = [];

  /** 添加评估维度 */
  addDimension(dim: EvaluationDimension): void {
    // 验证权重范围
    if (dim.weight < 0 || dim.weight > 1) {
      throw new Error(`权重必须在 0-1 之间: ${dim.name} = ${dim.weight}`);
    }
    this.dimensions.push(dim);
  }

  /** 为框架添加评分 */
  addFrameworkScore(score: FrameworkScore): void {
    // 验证所有维度都有评分
    for (const dim of this.dimensions) {
      if (!score.scores.has(dim.name)) {
        throw new Error(
          `框架 ${score.framework} 缺少维度 ${dim.name} 的评分`
        );
      }
      const val = score.scores.get(dim.name)!;
      if (val < 1 || val > 10) {
        throw new Error(
          `评分必须在 1-10 之间: ${score.framework}.${dim.name} = ${val}`
        );
      }
    }
    this.frameworkScores.push(score);
  }

  /** 计算决策结果 */
  evaluate(): DecisionResult[] {
    // 权重归一化
    const totalWeight = this.dimensions.reduce(
      (sum, d) => sum + d.weight, 0
    );

    const results: DecisionResult[] = this.frameworkScores.map(fs => {
      // 计算总分
      let totalScore = 0;
      const categoryTotals: Record<string, { score: number; weight: number }> = {};

      for (const dim of this.dimensions) {
        const normalizedWeight = dim.weight / totalWeight;
        const score = fs.scores.get(dim.name) ?? 0;
        totalScore += score * normalizedWeight;

        // 按分类聚合
        if (!categoryTotals[dim.category]) {
          categoryTotals[dim.category] = { score: 0, weight: 0 };
        }
        categoryTotals[dim.category].score += score * dim.weight;
        categoryTotals[dim.category].weight += dim.weight;
      }

      // 计算分类平均分
      const categoryScores: Record<string, number> = {};
      for (const [cat, data] of Object.entries(categoryTotals)) {
        categoryScores[cat] = data.weight > 0
          ? data.score / data.weight
          : 0;
      }

      // 识别优势和劣势
      const strengths: string[] = [];
      const weaknesses: string[] = [];
      for (const dim of this.dimensions) {
        const score = fs.scores.get(dim.name) ?? 0;
        if (score >= 8) strengths.push(`${dim.name}(${score}/10)`);
        if (score <= 4) weaknesses.push(`${dim.name}(${score}/10)`);
      }

      return {
        framework: fs.framework,
        totalScore: Math.round(totalScore * 100) / 100,
        categoryScores,
        strengths,
        weaknesses,
        rank: 0, // 稍后填充
      };
    });

    // 排名
    results.sort((a, b) => b.totalScore - a.totalScore);
    return results.map((r, i) => ({ ...r, rank: i + 1 }));
  }

  /** 生成报告 */
  generateReport(): string {
    const results = this.evaluate();
    const lines: string[] = ['# 框架选型决策报告\n'];

    // 总览表格
    lines.push('## 综合排名\n');
    lines.push('| 排名 | 框架 | 总分 | 技术 | 团队 | 业务 |');
    lines.push('|------|------|------|------|------|------|');
    for (const r of results) {
      lines.push(
        `| ${r.rank} | ${r.framework} | ${r.totalScore.toFixed(2)} ` +
        `| ${(r.categoryScores['technical'] ?? 0).toFixed(1)} ` +
        `| ${(r.categoryScores['team'] ?? 0).toFixed(1)} ` +
        `| ${(r.categoryScores['business'] ?? 0).toFixed(1)} |`
      );
    }

    // 各框架详情
    lines.push('\n## 详细分析\n');
    for (const r of results) {
      lines.push(`### ${r.rank}. ${r.framework} (${r.totalScore.toFixed(2)}分)`);
      if (r.strengths.length > 0) {
        lines.push(`- **优势**: ${r.strengths.join(', ')}`);
      }
      if (r.weaknesses.length > 0) {
        lines.push(`- **劣势**: ${r.weaknesses.join(', ')}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
```

### 11.5.2 标准化决策矩阵示例

以下展示如何为六大框架构建标准化的评估矩阵：

```typescript
// ============================================================
// 标准化评估模板：覆盖技术、团队、业务三个维度
// ============================================================

function createStandardMatrix(): DecisionMatrix {
  const matrix = new DecisionMatrix();

  // === 技术维度 ===
  matrix.addDimension({
    name: '架构灵活性',
    weight: 0.15,
    description: '支持不同 Agent 拓扑结构的能力',
    category: 'technical',
  });
  matrix.addDimension({
    name: '状态管理',
    weight: 0.12,
    description: '状态持久化、恢复、快照等能力',
    category: 'technical',
  });
  matrix.addDimension({
    name: '工具集成',
    weight: 0.10,
    description: '外部工具接入的便利程度',
    category: 'technical',
  });
  matrix.addDimension({
    name: '可观测性',
    weight: 0.08,
    description: '调试、追踪、日志支持',
    category: 'technical',
  });

  // === 团队维度 ===
  matrix.addDimension({
    name: '学习曲线',
    weight: 0.12,
    description: '团队上手所需时间和成本',
    category: 'team',
  });
  matrix.addDimension({
    name: '社区生态',
    weight: 0.08,
    description: '文档、社区活跃度、第三方支持',
    category: 'team',
  });
  matrix.addDimension({
    name: '类型安全',
    weight: 0.05,
    description: 'TypeScript / 静态类型支持程度',
    category: 'team',
  });

  // === 业务维度 ===
  matrix.addDimension({
    name: '生产就绪',
    weight: 0.10,
    description: '错误处理、重试、监控等生产级特性',
    category: 'business',
  });
  matrix.addDimension({
    name: '供应商锁定',
    weight: 0.10,
    description: '对特定厂商的依赖程度（越低越好）',
    category: 'business',
  });
  matrix.addDimension({
    name: '运营成本',
    weight: 0.10,
    description: 'Token 消耗、基础设施成本',
    category: 'business',
  });

  return matrix;
}

/**
 * 基于 2025 年 Q1 的实际评测数据，为六大框架评分
 *
 * 说明：评分基于以下标准
 * - 10: 业界领先，远超其他
 * - 8-9: 优秀，明显优势
 * - 6-7: 良好，满足需求
 * - 4-5: 一般，有明显短板
 * - 1-3: 不足，难以满足需求
 */
function scoreAllFrameworks(matrix: DecisionMatrix): void {
  // Google ADK 评分
  const adkScores = new Map<string, number>([
    ['架构灵活性', 8],   // 内置 Sequential/Parallel/Loop，灵活组合
    ['状态管理', 9],     // Session + State 机制完善
    ['工具集成', 8],     // FunctionTool 封装良好
    ['可观测性', 7],     // 基本追踪支持，社区工具较少
    ['学习曲线', 7],     // 概念清晰但文档仍在完善中
    ['社区生态', 6],     // 较新，社区规模有限
    ['类型安全', 6],     // Python 优先，TS SDK 仍在发展
    ['生产就绪', 7],     // Google 背书但案例偏少
    ['供应商锁定', 4],   // 强绑定 Gemini / Vertex AI
    ['运营成本', 7],     // Gemini 定价有竞争力
  ]);
  matrix.addFrameworkScore({
    framework: 'Google ADK',
    scores: adkScores,
    notes: new Map([
      ['供应商锁定', '需 Vertex AI 或 Gemini API，迁移成本高'],
    ]),
  });

  // LangGraph 评分
  const langGraphScores = new Map<string, number>([
    ['架构灵活性', 9],   // 完全自定义图拓扑
    ['状态管理', 10],    // Reducer + Checkpoint 业界最强
    ['工具集成', 8],     // 继承 LangChain 丰富工具生态
    ['可观测性', 9],     // LangSmith 提供完整追踪
    ['学习曲线', 5],     // 概念抽象度高，图编程范式需适应
    ['社区生态', 9],     // LangChain 生态成熟
    ['类型安全', 5],     // Python 为主，TS 支持有限
    ['生产就绪', 10],    // LangGraph v1.0 GA + LangSmith 可观测性，Uber/LinkedIn/Klarna 等大规模生产验证
    ['供应商锁定', 7],   // 开源核心，可替换 LLM
    ['运营成本', 6],     // Reducer 机制可能增加 Token 消耗
  ]);
  matrix.addFrameworkScore({
    framework: 'LangGraph',
    scores: langGraphScores,
    notes: new Map([
      ['学习曲线', '图编程范式对传统开发者有较高门槛'],
    ]),
  });

  // CrewAI 评分
  const crewAIScores = new Map<string, number>([
    ['架构灵活性', 6],   // Role-based 模式，灵活性中等
    ['状态管理', 5],     // 基础共享内存
    ['工具集成', 7],     // 内置常用工具
    ['可观测性', 6],     // 基本日志
    ['学习曲线', 9],     // 最简单易上手
    ['社区生态', 7],     // 增长快速
    ['类型安全', 4],     // Python 专属
    ['生产就绪', 6],     // 适合中小规模
    ['供应商锁定', 8],   // 支持多种 LLM
    ['运营成本', 5],     // backstory 消耗较多 Token
  ]);
  matrix.addFrameworkScore({
    framework: 'CrewAI',
    scores: crewAIScores,
    notes: new Map([
      ['学习曲线', '角色比喻直觉化，非技术人员也能理解'],
    ]),
  });

  // AutoGen 评分
  const autoGenScores = new Map<string, number>([
    ['架构灵活性', 7],   // GroupChat 灵活但有边界
    ['状态管理', 6],     // 对话历史管理
    ['工具集成', 7],     // 代码执行是独特优势
    ['可观测性', 5],     // 调试工具有限
    ['学习曲线', 6],     // 对话范式需要适应
    ['社区生态', 8],     // 微软背书，学术社区活跃
    ['类型安全', 5],     // Python 为主
    ['生产就绪', 7],     // 企业案例逐步增多
    ['供应商锁定', 7],   // 支持多种 LLM
    ['运营成本', 5],     // 多轮对话消耗较高
  ]);
  matrix.addFrameworkScore({
    framework: 'AutoGen',
    scores: autoGenScores,
    notes: new Map([
      ['工具集成', '代码执行沙箱是独特竞争优势'],
    ]),
  });

  // OpenAI Agents SDK 评分
  const openAIScores = new Map<string, number>([
    ['架构灵活性', 7],   // Handoff 机制清晰
    ['状态管理', 6],     // 基础 context 传递
    ['工具集成', 8],     // function calling 原生支持
    ['可观测性', 8],     // 原生追踪 + OpenAI Dashboard
    ['学习曲线', 8],     // API 简洁直观
    ['社区生态', 8],     // OpenAI 生态强大
    ['类型安全', 7],     // Python SDK 类型标注完善
    ['生产就绪', 8],     // OpenAI 基础设施可靠
    ['供应商锁定', 3],   // 强绑定 OpenAI API
    ['运营成本', 6],     // GPT-4 定价较高
  ]);
  matrix.addFrameworkScore({
    framework: 'OpenAI Agents SDK',
    scores: openAIScores,
    notes: new Map([
      ['供应商锁定', '完全依赖 OpenAI API，无法使用其他模型'],
    ]),
  });

  // OpenClaw 评分
  const openClawScores = new Map<string, number>([
    ['架构灵活性', 6],   // Gateway 架构简洁但编排能力有限
    ['状态管理', 5],     // 依赖插件实现，无内置高级状态管理
    ['工具集成', 10],    // 134 MCP 工具，业界最强工具生态
    ['可观测性', 7],     // 内置日志和插件级监控
    ['学习曲线', 8],     // 插件配置直观，上手快
    ['社区生态', 10],    // 100K+ Stars，社区贡献活跃
    ['类型安全', 8],     // TypeScript 原生，类型支持好
    ['生产就绪', 8],     // 大量生产部署案例
    ['供应商锁定', 9],   // 插件化支持任意 LLM 提供商
    ['运营成本', 7],     // 取决于所选 LLM 和平台数量
  ]);
  matrix.addFrameworkScore({
    framework: 'OpenClaw',
    scores: openClawScores,
    notes: new Map([
      ['工具集成', '134 个 MCP 兼容内置工具，工具互操作性业界领先'],
    ]),
  });

  // Mastra 评分
  const mastraScores = new Map<string, number>([
    ['架构灵活性', 7],   // Workflow 引擎 + Agent 编排
    ['状态管理', 8],     // Temporal 风格持久化工作流
    ['工具集成', 9],     // MCP 一等公民 + 50+ 内置集成
    ['可观测性', 8],     // OpenTelemetry + Mastra Studio
    ['学习曲线', 8],     // TypeScript 开发者友好，文档优秀
    ['社区生态', 7],     // 快速增长（25K+ Stars），Mastra 1.0 刚发布
    ['类型安全', 10],    // TypeScript 原生，端到端类型安全
    ['生产就绪', 8],     // 1.0 GA 发布，企业案例增加中
    ['供应商锁定', 8],   // 支持多种 LLM 提供商
    ['运营成本', 7],     // 取决于所选 LLM
  ]);
  matrix.addFrameworkScore({
    framework: 'Mastra',
    scores: mastraScores,
    notes: new Map([
      ['类型安全', 'TypeScript 原生框架，端到端类型安全是核心竞争力'],
    ]),
  });

  // Vercel AI SDK 评分
  const vercelScores = new Map<string, number>([
    ['架构灵活性', 6],   // 聚焦 Web 场景，复杂编排需配合其他框架
    ['状态管理', 5],     // 基础 Server State，无内置持久化
    ['工具集成', 8],     // MCP 原生 + 动态工具 + 25+ 模型提供商
    ['可观测性', 8],     // Vercel 平台原生监控 + Telemetry
    ['学习曲线', 9],     // Web 开发者无缝上手
    ['社区生态', 9],     // Vercel 生态庞大，Next.js 社区支持
    ['类型安全', 10],    // TypeScript + Zod，类型安全业界标杆
    ['生产就绪', 8],     // Vercel 平台大规模验证
    ['供应商锁定', 7],   // 支持 25+ 提供商，但 Vercel 部署有优势
    ['运营成本', 7],     // 取决于所选 LLM 和 Vercel 计划
  ]);
  matrix.addFrameworkScore({
    framework: 'Vercel AI SDK',
    scores: vercelScores,
    notes: new Map([
      ['学习曲线', 'Web 开发者最友好的 AI 框架，useChat hook 即用即走'],
    ]),
  });
}

// 使用示例
function runFrameworkEvaluation(): void {
  const matrix = createStandardMatrix();
  scoreAllFrameworks(matrix);

  const report = matrix.generateReport();
  console.log(report);

  // 输出决策结果
  const results = matrix.evaluate();
  console.log('\n===== 最终推荐 =====');
  console.log(`第一推荐: ${results[0].framework} (${results[0].totalScore})`);
  console.log(`第二推荐: ${results[1].framework} (${results[1].totalScore})`);
  console.log(`优势: ${results[0].strengths.join(', ')}`);
  console.log(`注意: ${results[0].weaknesses.join(', ')}`);
}
```

### 11.5.3 团队技术栈适配评估

选框架不能只看框架本身，还需要评估团队的技术储备和学习能力：

```typescript
// ============================================================
// 团队技术适配度评估器
// ============================================================

interface TeamProfile {
  readonly size: number;                     // 团队规模
  readonly primaryLanguage: string;          // 主力语言
  readonly experienceLevel: 'junior' | 'mid' | 'senior';  // 平均经验水平
  readonly hasMLExperience: boolean;         // 是否有 ML 经验
  readonly hasGraphDBExperience: boolean;    // 是否有图数据库经验
  readonly currentFrameworks: string[];      // 当前在用框架
  readonly availableTrainingWeeks: number;   // 可用培训时间(周)
}

interface CompatibilityResult {
  readonly framework: string;
  readonly overallFit: number;         // 总适配度 0-100
  readonly estimatedOnboardingWeeks: number;  // 预计上手周数
  readonly riskFactors: string[];      // 风险因素
  readonly recommendations: string[];  // 建议
}

class TeamSkillAssessor {
  /** 评估团队与框架的适配度 */
  assess(
    team: TeamProfile,
    framework: string,
  ): CompatibilityResult {
    let fitScore = 50; // 基础分
    const risks: string[] = [];
    const recs: string[] = [];
    let onboardingWeeks = 4; // 基础学习周期

    // --- 语言适配度 ---
    const langMap: Record<string, string[]> = {
      'Google ADK': ['python', 'typescript'],
      'LangGraph': ['python', 'typescript'],
      'CrewAI': ['python'],
      'AutoGen': ['python'],
      'OpenAI Agents SDK': ['python'],
      'OpenClaw': ['typescript', 'javascript'],
      'Mastra': ['typescript'],
      'Vercel AI SDK': ['typescript', 'javascript'],
    };
    const supportedLangs = langMap[framework] ?? [];
    if (supportedLangs.includes(team.primaryLanguage.toLowerCase())) {
      fitScore += 15;
    } else {
      fitScore -= 10;
      risks.push(`团队主力语言 ${team.primaryLanguage} 非框架首选语言`);
      recs.push('建议安排语言培训或指定语言桥梁角色');
      onboardingWeeks += 2;
    }

    // --- 经验水平调整 ---
    switch (team.experienceLevel) {
      case 'senior':
        fitScore += 10;
        onboardingWeeks -= 1;
        break;
      case 'junior':
        fitScore -= 10;
        onboardingWeeks += 2;
        if (['LangGraph', 'AutoGen'].includes(framework)) {
          risks.push('该框架抽象层次较高，初级开发者学习曲线陡峭');
          recs.push('建议配备资深开发者担任 Tech Lead');
        }
        break;
    }

    // --- 框架特定适配 ---
    if (framework === 'LangGraph') {
      if (team.hasGraphDBExperience) {
        fitScore += 10;
        recs.push('团队图数据库经验有助于理解 Graph 编程范式');
      } else {
        fitScore -= 5;
        onboardingWeeks += 1;
        risks.push('LangGraph 的图编程范式需要额外学习时间');
      }
    }

    if (framework === 'Google ADK') {
      if (team.hasMLExperience) {
        fitScore += 8;
        recs.push('ML 经验有助于理解 ADK 的模型集成部分');
      }
    }

    if (framework === 'CrewAI') {
      fitScore += 8; // CrewAI 学习曲线最平缓
      onboardingWeeks -= 1;
      recs.push('CrewAI 角色模型直观，适合快速原型验证');
    }

    if (framework === 'OpenClaw') {
      fitScore += 6; // 插件架构上手较快
      recs.push('OpenClaw 插件配置直观，TypeScript 开发体验好');
      if (team.primaryLanguage.toLowerCase() === 'typescript' ||
          team.primaryLanguage.toLowerCase() === 'javascript') {
        fitScore += 10;
        recs.push('团队 TS/JS 技术栈与 OpenClaw 完美匹配');
      }
    }

    // --- 团队规模调整 ---
    if (team.size <= 3 && ['LangGraph', 'AutoGen'].includes(framework)) {
      risks.push('小团队使用复杂框架可能缺乏足够人力维护');
      recs.push('考虑从简单框架切入，后期按需迁移');
    }

    // --- 培训时间约束 ---
    if (team.availableTrainingWeeks < onboardingWeeks) {
      fitScore -= 15;
      risks.push(
        `预计需要 ${onboardingWeeks} 周上手, ` +
        `但只有 ${team.availableTrainingWeeks} 周培训时间`
      );
      recs.push('压缩上手时间可能导致技术债，建议协商延长培训期');
    }

    // 归一化
    fitScore = Math.max(0, Math.min(100, fitScore));

    return {
      framework,
      overallFit: fitScore,
      estimatedOnboardingWeeks: Math.max(1, onboardingWeeks),
      riskFactors: risks,
      recommendations: recs,
    };
  }
}
```

### 11.5.4 场景匹配引擎

不同业务场景天然适合不同框架。以下实现一个场景到框架的匹配引擎：

```typescript
// ============================================================
// 场景匹配引擎：根据业务需求推荐框架
// ============================================================

interface ProjectRequirements {
  readonly agentCount: number;             // 预期 Agent 数量
  readonly needsHumanInLoop: boolean;      // 是否需要人工介入
  readonly needsCodeExecution: boolean;    // 是否需要代码执行
  readonly needsStreaming: boolean;        // 是否需要流式输出
  readonly maxLatencyMs: number;           // 最大可接受延迟
  readonly expectedDailyRequests: number;  // 预计日请求量
  readonly budgetPerMonth: number;         // 月预算(美元)
  readonly mustSupportModels: string[];    // 必须支持的模型
  readonly complianceRequirements: string[]; // 合规要求
}

interface ScenarioMatch {
  readonly framework: string;
  readonly matchScore: number;     // 0-100
  readonly matchReasons: string[];
  readonly mismatchReasons: string[];
  readonly estimatedMonthlyCost: number;
}

class ScenarioMatcher {
  /** 匹配项目需求到框架 */
  match(req: ProjectRequirements): ScenarioMatch[] {
    const frameworks = [
      'Google ADK', 'LangGraph', 'CrewAI', 'AutoGen', 'OpenAI Agents SDK', 'OpenClaw', 'Mastra', 'Vercel AI SDK',
    ];

    const matches = frameworks.map(fw => this.scoreFramework(fw, req));
    matches.sort((a, b) => b.matchScore - a.matchScore);
    return matches;
  }

  private scoreFramework(
    fw: string,
    req: ProjectRequirements,
  ): ScenarioMatch {
    let score = 50;
    const matchReasons: string[] = [];
    const mismatchReasons: string[] = [];

    // --- Agent 数量适配 ---
    if (req.agentCount === 1) {
      if (['OpenAI Agents SDK', 'Google ADK'].includes(fw)) {
        score += 10;
        matchReasons.push('单 Agent 场景下接口简洁高效');
      }
    } else if (req.agentCount > 5) {
      if (['LangGraph', 'AutoGen'].includes(fw)) {
        score += 15;
        matchReasons.push('多 Agent 编排能力强大');
      }
      if (fw === 'CrewAI') {
        score -= 5;
        mismatchReasons.push('超过 5 个 Agent 时性能和管理复杂度上升');
      }
    }

    // --- Human-in-the-loop ---
    if (req.needsHumanInLoop) {
      if (fw === 'LangGraph') {
        score += 15;
        matchReasons.push('内置 interrupt_before/after 支持人工审批');
      } else if (fw === 'Google ADK') {
        score += 8;
        matchReasons.push('支持通过 Session 注入人工输入');
      } else {
        score -= 5;
        mismatchReasons.push('人工介入需要额外自定义实现');
      }
    }

    // --- 代码执行 ---
    if (req.needsCodeExecution) {
      if (fw === 'AutoGen') {
        score += 20;
        matchReasons.push('内置代码执行沙箱，原生支持');
      } else {
        score -= 3;
      }
    }

    // --- 延迟要求 ---
    if (req.maxLatencyMs < 3000) {
      if (fw === 'OpenAI Agents SDK') {
        score += 10;
        matchReasons.push('API 直连延迟最低');
      }
      if (['AutoGen', 'CrewAI'].includes(fw)) {
        score -= 10;
        mismatchReasons.push('框架开销可能导致延迟超标');
      }
    }

    // --- 模型支持 ---
    const modelSupport: Record<string, string[]> = {
      'Google ADK': ['gemini'],
      'LangGraph': ['openai', 'anthropic', 'gemini', 'llama', 'mistral'],
      'CrewAI': ['openai', 'anthropic', 'gemini', 'llama'],
      'AutoGen': ['openai', 'anthropic', 'gemini', 'llama'],
      'OpenAI Agents SDK': ['openai'],
      'OpenClaw': ['openai', 'anthropic', 'gemini', 'llama', 'mistral', 'deepseek'],
      'Mastra': ['openai', 'anthropic', 'gemini', 'llama', 'mistral', 'deepseek'],
      'Vercel AI SDK': ['openai', 'anthropic', 'gemini', 'llama', 'mistral', 'deepseek'],
    };

    const supported = modelSupport[fw] ?? [];
    const unsupported = req.mustSupportModels.filter(
      m => !supported.some(s => m.toLowerCase().includes(s))
    );
    if (unsupported.length > 0) {
      score -= 20;
      mismatchReasons.push(
        `不支持必要模型: ${unsupported.join(', ')}`
      );
    }

    // --- 合规要求 ---
    if (req.complianceRequirements.includes('数据不出境')) {
      if (['OpenAI Agents SDK'].includes(fw)) {
        score -= 25;
        mismatchReasons.push('OpenAI API 数据需出境至美国');
      }
      if (fw === 'Google ADK') {
        score -= 10;
        mismatchReasons.push('Vertex AI 需确认区域部署');
      }
    }

    // --- 成本估算 ---
    const costPerRequest: Record<string, number> = {
      'Google ADK': 0.008,
      'LangGraph': 0.012,
      'CrewAI': 0.015,
      'AutoGen': 0.018,
      'OpenAI Agents SDK': 0.010,
      'OpenClaw': 0.011,
      'Mastra': 0.009,
      'Vercel AI SDK': 0.008,
    };
    const estimatedMonthlyCost =
      (costPerRequest[fw] ?? 0.01) * req.expectedDailyRequests * 30;

    if (estimatedMonthlyCost > req.budgetPerMonth) {
      score -= 15;
      mismatchReasons.push(
        `预计月成本 $${estimatedMonthlyCost.toFixed(0)} ` +
        `超出预算 $${req.budgetPerMonth}`
      );
    }

    return {
      framework: fw,
      matchScore: Math.max(0, Math.min(100, score)),
      matchReasons,
      mismatchReasons,
      estimatedMonthlyCost,
    };
  }
}
```

### 11.5.5 TCO (总拥有成本) 分析

选框架还需要计算长期的总拥有成本，包括开发、运营、维护的全部支出：

```typescript
// ============================================================
// TCO 分析工具：计算框架全生命周期成本
// ============================================================

interface TCOParameters {
  readonly framework: string;
  readonly teamSize: number;              // 开发人数
  readonly avgSalaryPerMonth: number;     // 人均月薪 (USD)
  readonly developmentMonths: number;     // 开发周期
  readonly operationMonths: number;       // 运营周期
  readonly dailyRequests: number;         // 日请求量
  readonly avgTokensPerRequest: number;   // 平均每请求 Token 数
}

interface TCOBreakdown {
  readonly framework: string;
  readonly development: {
    readonly training: number;       // 培训成本
    readonly implementation: number; // 开发成本
    readonly testing: number;        // 测试成本
    readonly subtotal: number;
  };
  readonly operation: {
    readonly apiCalls: number;       // API 调用费
    readonly infrastructure: number; // 基础设施
    readonly monitoring: number;     // 监控工具
    readonly subtotal: number;
  };
  readonly maintenance: {
    readonly bugFix: number;         // 修复成本
    readonly upgrade: number;        // 升级成本
    readonly documentation: number;  // 文档维护
    readonly subtotal: number;
  };
  readonly totalTCO: number;
  readonly costPerRequest: number;
}

function calculateTCO(params: TCOParameters): TCOBreakdown {
  // 框架特定参数
  const frameworkFactors: Record<string, {
    trainingWeeks: number;
    devEfficiency: number;   // 开发效率系数(越高越好)
    testComplexity: number;  // 测试复杂度系数
    infraCostPerMonth: number;
    bugRate: number;         // 每月 bug 率
    tokenOverhead: number;   // Token 额外开销比例
  }> = {
    'Google ADK': {
      trainingWeeks: 3, devEfficiency: 0.85, testComplexity: 1.0,
      infraCostPerMonth: 200, bugRate: 0.05, tokenOverhead: 0.10,
    },
    'LangGraph': {
      trainingWeeks: 5, devEfficiency: 0.95, testComplexity: 1.3,
      infraCostPerMonth: 300, bugRate: 0.04, tokenOverhead: 0.15,
    },
    'CrewAI': {
      trainingWeeks: 2, devEfficiency: 0.75, testComplexity: 0.8,
      infraCostPerMonth: 150, bugRate: 0.07, tokenOverhead: 0.25,
    },
    'AutoGen': {
      trainingWeeks: 4, devEfficiency: 0.80, testComplexity: 1.1,
      infraCostPerMonth: 250, bugRate: 0.06, tokenOverhead: 0.20,
    },
    'OpenAI Agents SDK': {
      trainingWeeks: 2, devEfficiency: 0.90, testComplexity: 0.9,
      infraCostPerMonth: 100, bugRate: 0.03, tokenOverhead: 0.05,
    },
    'OpenClaw': {
      trainingWeeks: 2, devEfficiency: 0.85, testComplexity: 0.9,
      infraCostPerMonth: 180, bugRate: 0.04, tokenOverhead: 0.10,
    },
    'Mastra': {
      trainingWeeks: 2, devEfficiency: 0.88, testComplexity: 0.9,
      infraCostPerMonth: 160, bugRate: 0.04, tokenOverhead: 0.08,
    },
    'Vercel AI SDK': {
      trainingWeeks: 1, devEfficiency: 0.92, testComplexity: 0.8,
      infraCostPerMonth: 120, bugRate: 0.03, tokenOverhead: 0.05,
    },
  };

  const factors = frameworkFactors[params.framework]
    ?? frameworkFactors['OpenAI Agents SDK']!;
  const weeklyRate = params.avgSalaryPerMonth / 4;

  // === 开发成本 ===
  const training = factors.trainingWeeks * weeklyRate * params.teamSize;
  const implementation =
    params.developmentMonths * params.avgSalaryPerMonth *
    params.teamSize / factors.devEfficiency;
  const testing =
    params.developmentMonths * 0.3 * params.avgSalaryPerMonth *
    params.teamSize * factors.testComplexity;

  // === 运营成本 ===
  const tokenCostPer1K = 0.003; // 平均每 1K Token 成本
  const totalTokensPerMonth =
    params.dailyRequests * 30 *
    params.avgTokensPerRequest * (1 + factors.tokenOverhead);
  const apiCalls =
    (totalTokensPerMonth / 1000) * tokenCostPer1K * params.operationMonths;
  const infrastructure =
    factors.infraCostPerMonth * params.operationMonths;
  const monitoring = 50 * params.operationMonths; // 基础监控

  // === 维护成本 ===
  const bugFix =
    factors.bugRate * params.avgSalaryPerMonth *
    params.operationMonths * 0.5;
  const upgrade =
    params.operationMonths * weeklyRate * 0.5; // 每月半周升级
  const documentation =
    params.operationMonths * weeklyRate * 0.2; // 每月 0.2 周文档

  const devSubtotal = training + implementation + testing;
  const opsSubtotal = apiCalls + infrastructure + monitoring;
  const maintSubtotal = bugFix + upgrade + documentation;
  const totalTCO = devSubtotal + opsSubtotal + maintSubtotal;
  const totalRequests =
    params.dailyRequests * 30 * params.operationMonths;

  return {
    framework: params.framework,
    development: {
      training: Math.round(training),
      implementation: Math.round(implementation),
      testing: Math.round(testing),
      subtotal: Math.round(devSubtotal),
    },
    operation: {
      apiCalls: Math.round(apiCalls),
      infrastructure: Math.round(infrastructure),
      monitoring: Math.round(monitoring),
      subtotal: Math.round(opsSubtotal),
    },
    maintenance: {
      bugFix: Math.round(bugFix),
      upgrade: Math.round(upgrade),
      documentation: Math.round(documentation),
      subtotal: Math.round(maintSubtotal),
    },
    totalTCO: Math.round(totalTCO),
    costPerRequest:
      totalRequests > 0
        ? Math.round((totalTCO / totalRequests) * 10000) / 10000
        : 0,
  };
}
```

### 11.5.6 选型决策速查表

| 如果你的场景是… | 推荐框架 | 核心理由 |
|----------------|---------|---------|
| 快速 MVP 验证 | CrewAI | 上手快，2 周内可出原型 |
| 复杂工作流编排 | LangGraph | 图结构灵活，Checkpoint 可靠 |
| 多 Agent 代码协作 | AutoGen | 内置代码沙箱，对话驱动 |
| OpenAI 全家桶 | OpenAI Agents SDK | 无缝集成，延迟最低 |
| Google Cloud 生态 | Google ADK | 原生 Vertex AI + A2A |
| 需要人工审批流 | LangGraph | interrupt_before/after 原生支持 |
| 数据不出境要求 | LangGraph + 本地模型 | 支持 Ollama 等本地部署 |
| 预算极度有限 | CrewAI + GPT-3.5 | 框架开销低 + 廉价模型 |
| 企业级生产系统 | LangGraph / ADK | 状态管理和错误恢复最完善 |
| 多平台渠道部署 | OpenClaw | 20+ 平台开箱即用，134 MCP 工具 |
| 快速对接消息平台 | OpenClaw | Gateway 架构，插件化平台适配 |
| TypeScript 全栈 Agent | Mastra | TS 原生、MCP 一等支持、Workflow 引擎 |
| Web 前端 Agent 集成 | Vercel AI SDK | 流式 UI、React hooks、25+ 模型提供商 |
| 最快上手体验 | OpenAI Agents SDK | 极简 API、内置 Tracing、几行代码即可运行 |


## 11.6 框架迁移策略

> **迁移第一定律**: 永远不要做大爆炸式迁移。渐进式、可回滚的灰度迁移是唯一靠谱的路线。

### 11.6.1 迁移六阶段方法论

框架迁移是高风险工程活动。以下基于实际项目经验总结的六阶段迁移方法：

```
┌─────────────────────────────────────────────────────────┐
│                    迁移六阶段                             │
│                                                         │
│  阶段 1: 评估  →  阶段 2: 抽象  →  阶段 3: 并行        │
│                                                         │
│  阶段 4: 灰度  →  阶段 5: 切换  →  阶段 6: 清理        │
│                                                         │
│  每个阶段都有明确的入口条件、退出条件和回滚策略          │
└─────────────────────────────────────────────────────────┘
```

| 阶段 | 名称 | 核心活动 | 持续时间 | 成功标准 |
|------|------|---------|---------|---------|
| 1 | 评估 | 梳理现有系统、识别依赖、评估目标框架 | 1-2 周 | 完成依赖图和风险清单 |
| 2 | 抽象 | 引入 11.3 节的抽象层，隔离框架 API | 2-4 周 | 现有功能通过抽象层运行且测试全通过 |
| 3 | 并行 | 新框架实现抽象层接口，两套同时运行 | 2-4 周 | 新实现通过 100% 回归测试 |
| 4 | 灰度 | 按流量百分比切换，从 1% 开始 | 2-4 周 | P99 延迟 < 旧系统 120%，错误率 < 0.1% |
| 5 | 切换 | 全量切到新框架，旧框架作为 fallback | 1-2 周 | 连续 7 天无回退 |
| 6 | 清理 | 移除旧代码、抽象层简化、文档更新 | 1-2 周 | 代码覆盖率恢复，文档更新完毕 |

### 11.6.2 灰度迁移执行器

以下实现一个支持灰度发布、自动回滚的框架迁移执行器：

```typescript
// ============================================================
// 框架迁移执行器：灰度发布 + 自动回滚
// ============================================================

/** 迁移配置 */
interface MigrationConfig {
  readonly sourceFramework: string;
  readonly targetFramework: string;
  readonly initialTrafficPercent: number;   // 初始灰度比例 (0-100)
  readonly maxTrafficPercent: number;       // 最大灰度比例
  readonly incrementStep: number;           // 每次增加的百分比
  readonly rollbackThreshold: {
    readonly errorRatePercent: number;      // 错误率阈值
    readonly latencyIncreasePercent: number; // 延迟增加阈值
    readonly minSampleSize: number;         // 最小样本量
  };
}

/** 迁移状态 */
interface MigrationState {
  currentTrafficPercent: number;
  totalSourceRequests: number;
  totalTargetRequests: number;
  sourceErrors: number;
  targetErrors: number;
  sourceLatencySum: number;
  targetLatencySum: number;
  rollbackCount: number;
  lastIncreaseTime: number;
  phase: 'gray' | 'full' | 'rolled_back';
}

/** 执行结果 */
interface ExecutionResult {
  readonly framework: string;
  readonly success: boolean;
  readonly latencyMs: number;
  readonly response: unknown;
  readonly error?: string;
}

class FrameworkMigrator {
  private config: MigrationConfig;
  private state: MigrationState;

  constructor(config: MigrationConfig) {
    this.config = config;
    this.state = {
      currentTrafficPercent: config.initialTrafficPercent,
      totalSourceRequests: 0,
      totalTargetRequests: 0,
      sourceErrors: 0,
      targetErrors: 0,
      sourceLatencySum: 0,
      targetLatencySum: 0,
      rollbackCount: 0,
      lastIncreaseTime: Date.now(),
      phase: 'gray',
    };
  }

  /**
   * 执行请求并对比新旧框架
   * 灰度期间：按比例路由到新旧框架
   * 对照模式：两个框架同时执行，但只返回主框架结果
   */
  async executeWithComparison(
    input: unknown,
    sourceExecutor: (input: unknown) => Promise<unknown>,
    targetExecutor: (input: unknown) => Promise<unknown>,
  ): Promise<ExecutionResult> {
    // 判断该请求是否路由到新框架
    const useTarget =
      this.state.phase === 'full' ||
      (this.state.phase === 'gray' &&
       Math.random() * 100 < this.state.currentTrafficPercent);

    if (useTarget) {
      // 路由到新框架，旧框架作为影子执行
      const result = await this.executeTarget(input, targetExecutor);

      // 影子执行旧框架（不阻塞主流程）
      this.executeShadow(input, sourceExecutor).catch(() => {
        /* 影子执行的错误不影响主流程 */
      });

      // 检查是否需要回滚
      if (this.shouldRollback()) {
        await this.rollback();
        // 回滚后用旧框架重新执行
        return this.executeSource(input, sourceExecutor);
      }

      return result;
    } else {
      return this.executeSource(input, sourceExecutor);
    }
  }

  /** 执行旧框架 */
  private async executeSource(
    input: unknown,
    executor: (input: unknown) => Promise<unknown>,
  ): Promise<ExecutionResult> {
    const start = Date.now();
    try {
      const response = await executor(input);
      const latencyMs = Date.now() - start;
      this.state.totalSourceRequests++;
      this.state.sourceLatencySum += latencyMs;
      return {
        framework: this.config.sourceFramework,
        success: true,
        latencyMs,
        response,
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      this.state.totalSourceRequests++;
      this.state.sourceErrors++;
      this.state.sourceLatencySum += latencyMs;
      return {
        framework: this.config.sourceFramework,
        success: false,
        latencyMs,
        response: null,
        error: String(err),
      };
    }
  }

  /** 执行新框架 */
  private async executeTarget(
    input: unknown,
    executor: (input: unknown) => Promise<unknown>,
  ): Promise<ExecutionResult> {
    const start = Date.now();
    try {
      const response = await executor(input);
      const latencyMs = Date.now() - start;
      this.state.totalTargetRequests++;
      this.state.targetLatencySum += latencyMs;
      return {
        framework: this.config.targetFramework,
        success: true,
        latencyMs,
        response,
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      this.state.totalTargetRequests++;
      this.state.targetErrors++;
      this.state.targetLatencySum += latencyMs;
      return {
        framework: this.config.targetFramework,
        success: false,
        latencyMs,
        response: null,
        error: String(err),
      };
    }
  }

  /** 影子执行（用于对比，不影响返回） */
  private async executeShadow(
    input: unknown,
    executor: (input: unknown) => Promise<unknown>,
  ): Promise<void> {
    const start = Date.now();
    try {
      await executor(input);
      this.state.totalSourceRequests++;
      this.state.sourceLatencySum += Date.now() - start;
    } catch {
      this.state.totalSourceRequests++;
      this.state.sourceErrors++;
      this.state.sourceLatencySum += Date.now() - start;
    }
  }

  /** 判断是否需要回滚 */
  private shouldRollback(): boolean {
    const { rollbackThreshold } = this.config;

    // 样本量不足时不做判断
    if (this.state.totalTargetRequests < rollbackThreshold.minSampleSize) {
      return false;
    }

    // 检查错误率
    const targetErrorRate =
      this.state.targetErrors / this.state.totalTargetRequests;
    const sourceErrorRate =
      this.state.totalSourceRequests > 0
        ? this.state.sourceErrors / this.state.totalSourceRequests
        : 0;

    if (
      targetErrorRate >
      sourceErrorRate + rollbackThreshold.errorRatePercent / 100
    ) {
      console.error(
        `[迁移回滚] 错误率超标: 目标 ${(targetErrorRate * 100).toFixed(2)}% ` +
        `vs 源 ${(sourceErrorRate * 100).toFixed(2)}%`
      );
      return true;
    }

    // 检查延迟
    const avgTargetLatency =
      this.state.totalTargetRequests > 0
        ? this.state.targetLatencySum / this.state.totalTargetRequests
        : 0;
    const avgSourceLatency =
      this.state.totalSourceRequests > 0
        ? this.state.sourceLatencySum / this.state.totalSourceRequests
        : 1;
    const latencyIncrease =
      ((avgTargetLatency - avgSourceLatency) / avgSourceLatency) * 100;

    if (latencyIncrease > rollbackThreshold.latencyIncreasePercent) {
      console.error(
        `[迁移回滚] 延迟超标: 增加 ${latencyIncrease.toFixed(1)}% ` +
        `(阈值 ${rollbackThreshold.latencyIncreasePercent}%)`
      );
      return true;
    }

    return false;
  }

  /** 执行回滚 */
  private async rollback(): Promise<void> {
    this.state.phase = 'rolled_back';
    this.state.rollbackCount++;
    console.warn(
      `[迁移] 已回滚到 ${this.config.sourceFramework}, ` +
      `第 ${this.state.rollbackCount} 次回滚`
    );
  }

  /** 尝试增加灰度比例 */
  increaseTrafficSplit(): boolean {
    if (this.state.phase !== 'gray') return false;

    const timeSinceLastIncrease =
      Date.now() - this.state.lastIncreaseTime;
    const minInterval = 30 * 60 * 1000; // 至少 30 分钟

    if (timeSinceLastIncrease < minInterval) {
      console.log('[迁移] 距上次调整不足 30 分钟，跳过');
      return false;
    }

    if (this.shouldRollback()) {
      console.warn('[迁移] 当前指标异常，暂不增加流量');
      return false;
    }

    const newPercent = Math.min(
      this.state.currentTrafficPercent + this.config.incrementStep,
      this.config.maxTrafficPercent,
    );

    console.log(
      `[迁移] 灰度比例: ` +
      `${this.state.currentTrafficPercent}% → ${newPercent}%`
    );

    this.state.currentTrafficPercent = newPercent;
    this.state.lastIncreaseTime = Date.now();

    // 达到 100% 时切换到全量
    if (newPercent >= 100) {
      this.state.phase = 'full';
      console.log('[迁移] 已切换到全量模式');
    }

    return true;
  }

  /** 获取迁移报告 */
  getReport(): string {
    const avgSourceLatency =
      this.state.totalSourceRequests > 0
        ? (this.state.sourceLatencySum / this.state.totalSourceRequests).toFixed(1)
        : 'N/A';
    const avgTargetLatency =
      this.state.totalTargetRequests > 0
        ? (this.state.targetLatencySum / this.state.totalTargetRequests).toFixed(1)
        : 'N/A';

    return [
      '===== 迁移状态报告 =====',
      `阶段: ${this.state.phase}`,
      `灰度比例: ${this.state.currentTrafficPercent}%`,
      `回滚次数: ${this.state.rollbackCount}`,
      '',
      `--- ${this.config.sourceFramework} (源) ---`,
      `请求数: ${this.state.totalSourceRequests}`,
      `错误数: ${this.state.sourceErrors}`,
      `平均延迟: ${avgSourceLatency}ms`,
      '',
      `--- ${this.config.targetFramework} (目标) ---`,
      `请求数: ${this.state.totalTargetRequests}`,
      `错误数: ${this.state.targetErrors}`,
      `平均延迟: ${avgTargetLatency}ms`,
    ].join('\n');
  }
}
```

### 11.6.3 使用示例：从 CrewAI 迁移到 LangGraph

```typescript
// ============================================================
// 实战：从 CrewAI 迁移到 LangGraph 的完整示例
// ============================================================

async function migrationExample(): Promise<void> {
  // 创建迁移器
  const migrator = new FrameworkMigrator({
    sourceFramework: 'CrewAI',
    targetFramework: 'LangGraph',
    initialTrafficPercent: 5,     // 从 5% 开始
    maxTrafficPercent: 100,
    incrementStep: 10,            // 每次增加 10%
    rollbackThreshold: {
      errorRatePercent: 2,        // 错误率超过源 2% 就回滚
      latencyIncreasePercent: 50, // 延迟增加超过 50% 就回滚
      minSampleSize: 100,         // 至少 100 个样本
    },
  });

  // 模拟旧框架执行器
  const crewAIExecutor = async (input: unknown): Promise<unknown> => {
    // 实际项目中这里调用 CrewAI 的 crew.kickoff()
    await new Promise(r => setTimeout(r, 100));
    return { source: 'crewai', result: 'ok' };
  };

  // 模拟新框架执行器
  const langGraphExecutor = async (input: unknown): Promise<unknown> => {
    // 实际项目中这里调用 LangGraph 的 graph.invoke()
    await new Promise(r => setTimeout(r, 80));
    return { source: 'langgraph', result: 'ok' };
  };

  // 模拟请求处理
  for (let i = 0; i < 500; i++) {
    const result = await migrator.executeWithComparison(
      { query: `用户请求 #${i}` },
      crewAIExecutor,
      langGraphExecutor,
    );

    // 每 100 个请求尝试增加灰度比例
    if (i % 100 === 99) {
      migrator.increaseTrafficSplit();
      console.log(migrator.getReport());
    }
  }

  console.log('\n===== 最终报告 =====');
  console.log(migrator.getReport());
}
```

### 11.6.4 迁移常见陷阱与应对

| 陷阱 | 说明 | 应对策略 |
|------|------|---------|
| 状态格式不兼容 | 旧框架的状态序列化格式与新框架不同 | 编写 StateTransformer 做状态格式转换 |
| 工具签名差异 | 同一工具在不同框架中的注册方式不同 | 通过 11.3 节的抽象层统一工具接口 |
| 隐式行为依赖 | 代码依赖了旧框架的未文档化行为 | 对照测试发现差异，补充适配代码 |
| 并发模型不同 | 旧框架单线程，新框架异步并发 | 添加并发控制，逐步放开限制 |
| 错误码映射 | 不同框架的错误类型和码值不同 | 建立统一错误分类和映射表 |
| Token 消耗变化 | 新框架的 prompt 模板不同导致消耗变化 | 灰度期监控 Token 消耗趋势 |

```typescript
// ============================================================
// 状态格式转换器示例
// ============================================================

interface StateTransformerConfig {
  readonly sourceFormat: string;   // 源框架状态格式标识
  readonly targetFormat: string;   // 目标框架状态格式标识
}

/** 通用状态转换器 */
class StateTransformer {
  private transformers = new Map<
    string,
    (state: unknown) => unknown
  >();

  /** 注册转换规则 */
  register(
    sourceFormat: string,
    targetFormat: string,
    transformer: (state: unknown) => unknown,
  ): void {
    const key = `${sourceFormat}->${targetFormat}`;
    this.transformers.set(key, transformer);
  }

  /** 执行转换 */
  transform(
    state: unknown,
    config: StateTransformerConfig,
  ): unknown {
    const key = `${config.sourceFormat}->${config.targetFormat}`;
    const transformer = this.transformers.get(key);
    if (!transformer) {
      throw new Error(`未找到转换规则: ${key}`);
    }
    return transformer(state);
  }
}

// 示例：CrewAI 状态 -> LangGraph 状态转换
const transformer = new StateTransformer();

transformer.register(
  'crewai-memory',
  'langgraph-state',
  (crewState: unknown) => {
    const state = crewState as {
      short_term: Array<{ role: string; content: string }>;
      long_term: Record<string, string>;
      entity: Record<string, unknown>;
    };

    // 转换为 LangGraph 的 MessageGraph 格式
    return {
      messages: state.short_term.map(msg => ({
        role: msg.role === 'assistant' ? 'ai' : 'human',
        content: msg.content,
      })),
      metadata: {
        ...state.long_term,
        entities: state.entity,
        migratedFrom: 'crewai',
        migratedAt: new Date().toISOString(),
      },
    };
  },
);
```

### 11.6.5 迁移检查清单

迁移前后需要逐项检查以下清单：

**迁移前：**
- [ ] 完成依赖关系图（所有模块对旧框架的调用点）
- [ ] 编写完整的回归测试套件（覆盖率 > 80%）
- [ ] 建立性能基线（延迟 P50/P95/P99、错误率、Token 消耗）
- [ ] 引入抽象层并确认现有功能正常
- [ ] 评估新框架的 API 变更风险（roadmap、breaking changes）
- [ ] 准备回滚方案和应急预案

**迁移中：**
- [ ] 灰度比例按计划递增（5% → 10% → 25% → 50% → 100%）
- [ ] 每次递增前确认指标正常（延迟、错误率、成本）
- [ ] 监控用户反馈和异常报告
- [ ] 记录所有不兼容问题和解决方案

**迁移后：**
- [ ] 清理旧框架代码和依赖
- [ ] 更新技术文档和运维手册
- [ ] 简化抽象层（如果只保留一个框架）
- [ ] 输出迁移复盘报告


## 11.7 自建 vs 采用：何时造轮子

> **核心问题**: 是基于现有框架构建，还是从零打造自己的 Agent 框架？这是每个团队最终都会面对的灵魂拷问。

### 11.7.1 最小可行 Agent 框架

先看看从零构建一个最小可行的 Agent 框架需要多少代码。以下实现一个约 150 行的核心框架：

```typescript
// ============================================================
// 最小可行 Agent 框架：证明核心并不复杂
// ============================================================

/** 消息类型 */
interface Message {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string;
  readonly toolCallId?: string;
  readonly toolCalls?: ToolCall[];
}

/** 工具调用 */
interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
}

/** 工具定义 */
interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly execute: (args: Record<string, unknown>) => Promise<string>;
}

/** LLM 接口 */
interface LLMProvider {
  chat(
    messages: Message[],
    tools?: ToolDefinition[],
  ): Promise<Message>;
}

/** Agent 配置 */
interface MinimalAgentConfig {
  readonly name: string;
  readonly systemPrompt: string;
  readonly tools: ToolDefinition[];
  readonly llm: LLMProvider;
  readonly maxIterations: number;
}

/**
 * MinimalAgent: 核心循环只有 ~50 行
 * 证明 Agent 框架的本质就是 "LLM + 工具循环"
 */
class MinimalAgent {
  private config: MinimalAgentConfig;
  private history: Message[] = [];

  constructor(config: MinimalAgentConfig) {
    this.config = config;
    this.history.push({
      role: 'system',
      content: config.systemPrompt,
    });
  }

  /** 核心运行循环 */
  async run(userInput: string): Promise<string> {
    // 添加用户输入
    this.history.push({ role: 'user', content: userInput });

    for (let i = 0; i < this.config.maxIterations; i++) {
      // 调用 LLM
      const response = await this.config.llm.chat(
        this.history,
        this.config.tools,
      );

      this.history.push(response);

      // 如果没有工具调用，返回文本回复
      if (!response.toolCalls || response.toolCalls.length === 0) {
        return response.content;
      }

      // 执行工具调用
      for (const call of response.toolCalls) {
        const tool = this.config.tools.find(
          t => t.name === call.name,
        );
        if (!tool) {
          this.history.push({
            role: 'tool',
            toolCallId: call.id,
            content: `错误: 未知工具 "${call.name}"`,
          });
          continue;
        }

        try {
          const args = JSON.parse(call.arguments);
          const result = await tool.execute(args);
          this.history.push({
            role: 'tool',
            toolCallId: call.id,
            content: result,
          });
        } catch (err) {
          this.history.push({
            role: 'tool',
            toolCallId: call.id,
            content: `工具执行错误: ${String(err)}`,
          });
        }
      }
    }

    return '达到最大迭代次数，停止执行';
  }

  /** 获取对话历史 */
  getHistory(): readonly Message[] {
    return this.history;
  }

  /** 重置对话 */
  reset(): void {
    this.history = [{
      role: 'system',
      content: this.config.systemPrompt,
    }];
  }
}
```

### 11.7.2 最小可行编排器

除了单 Agent，还需要一个简单的编排器来支持多 Agent 协作：

```typescript
// ============================================================
// 最小编排器：支持顺序和路由两种模式
// ============================================================

type OrchestrationType = 'sequential' | 'router';

interface OrchestrationConfig {
  readonly type: OrchestrationType;
  readonly agents: MinimalAgent[];
  readonly router?: (
    input: string,
    agentNames: string[]
  ) => Promise<string>;  // 返回被选中的 Agent name
}

class MinimalOrchestrator {
  private config: OrchestrationConfig;

  constructor(config: OrchestrationConfig) {
    this.config = config;
  }

  /** 顺序执行所有 Agent */
  private async executeSequential(input: string): Promise<string> {
    let currentInput = input;
    const results: string[] = [];

    for (const agent of this.config.agents) {
      const result = await agent.run(currentInput);
      results.push(result);
      // 下一个 Agent 的输入是上一个的输出
      currentInput = result;
    }

    return results[results.length - 1] ?? '';
  }

  /** 路由到合适的 Agent */
  private async executeRouter(input: string): Promise<string> {
    if (!this.config.router) {
      throw new Error('路由模式需要提供 router 函数');
    }

    const agentNames = this.config.agents.map(
      (_, i) => `agent_${i}`
    );
    const selectedName = await this.config.router(input, agentNames);
    const selectedIndex = agentNames.indexOf(selectedName);

    if (selectedIndex < 0) {
      throw new Error(`路由返回了未知 Agent: ${selectedName}`);
    }

    return this.config.agents[selectedIndex].run(input);
  }

  /** 执行编排 */
  async execute(input: string): Promise<string> {
    switch (this.config.type) {
      case 'sequential':
        return this.executeSequential(input);
      case 'router':
        return this.executeRouter(input);
      default:
        throw new Error(`未知编排类型: ${this.config.type}`);
    }
  }
}
```

### 11.7.3 自建 vs 采用的量化分析

```typescript
// ============================================================
// Build vs Buy 量化决策模型
// ============================================================

interface BuildVsBuyFactors {
  // === 项目因素 ===
  readonly projectComplexity: 1 | 2 | 3 | 4 | 5;  // 1=简单 5=极复杂
  readonly uniqueRequirements: number;    // 独特需求数量 (0-10)
  readonly performanceCritical: boolean;  // 是否性能敏感
  readonly teamSize: number;

  // === 技术因素 ===
  readonly needCustomStateManagement: boolean;
  readonly needCustomToolProtocol: boolean;
  readonly needCustomLLMIntegration: boolean;
  readonly existingInfrastructureFit: number;  // 0-10 与现有基础设施契合度

  // === 业务因素 ===
  readonly timeToMarketWeeks: number;     // 上市时间要求
  readonly longTermMaintenance: boolean;  // 是否长期维护
  readonly regulatoryConstraints: boolean; // 是否有合规约束
}

interface BuildVsBuyResult {
  readonly recommendation: 'build' | 'adopt' | 'hybrid';
  readonly buildScore: number;    // 0-100
  readonly adoptScore: number;    // 0-100
  readonly reasoning: string[];
  readonly hybridStrategy?: string;
}

function analyzeBuildVsBuy(
  factors: BuildVsBuyFactors,
): BuildVsBuyResult {
  let buildScore = 0;
  let adoptScore = 0;
  const reasoning: string[] = [];

  // --- 项目复杂度 ---
  if (factors.projectComplexity <= 2) {
    adoptScore += 20;
    reasoning.push('项目复杂度低，现有框架足以应对');
  } else if (factors.projectComplexity >= 4) {
    buildScore += 15;
    reasoning.push('项目复杂度高，可能需要深度定制');
  }

  // --- 独特需求 ---
  if (factors.uniqueRequirements >= 5) {
    buildScore += 20;
    reasoning.push(
      `${factors.uniqueRequirements} 个独特需求，框架可能无法覆盖`
    );
  } else {
    adoptScore += 15;
    reasoning.push('需求较标准，框架能覆盖大部分场景');
  }

  // --- 性能要求 ---
  if (factors.performanceCritical) {
    buildScore += 15;
    reasoning.push('性能敏感场景，自建可精细优化');
  } else {
    adoptScore += 10;
  }

  // --- 团队规模 ---
  if (factors.teamSize <= 3) {
    adoptScore += 20;
    reasoning.push('小团队自建框架维护负担过重');
  } else if (factors.teamSize >= 8) {
    buildScore += 10;
    reasoning.push('团队规模支撑自建框架的持续维护');
  }

  // --- 定制化需求 ---
  const customNeeds = [
    factors.needCustomStateManagement,
    factors.needCustomToolProtocol,
    factors.needCustomLLMIntegration,
  ].filter(Boolean).length;

  if (customNeeds >= 2) {
    buildScore += 20;
    reasoning.push(
      `需要 ${customNeeds} 项核心定制，框架扩展可能力不从心`
    );
  } else {
    adoptScore += 15;
    reasoning.push('定制需求少，框架的插件机制可满足');
  }

  // --- 基础设施契合 ---
  if (factors.existingInfrastructureFit >= 7) {
    adoptScore += 10;
    reasoning.push('现有基础设施与主流框架兼容良好');
  } else if (factors.existingInfrastructureFit <= 3) {
    buildScore += 10;
    reasoning.push('基础设施差异大，框架集成成本高');
  }

  // --- 时间压力 ---
  if (factors.timeToMarketWeeks <= 4) {
    adoptScore += 25;
    reasoning.push('时间紧迫，自建来不及');
  } else if (factors.timeToMarketWeeks >= 16) {
    buildScore += 10;
    reasoning.push('时间充裕，可以投入自建');
  }

  // --- 长期维护 ---
  if (factors.longTermMaintenance) {
    buildScore += 10;
    reasoning.push('长期维护项目，自建可避免框架升级的被动');
  } else {
    adoptScore += 10;
    reasoning.push('短期项目，框架的稳定性更有价值');
  }

  // --- 合规约束 ---
  if (factors.regulatoryConstraints) {
    buildScore += 15;
    reasoning.push('合规约束可能需要对框架做深度修改');
  }

  // 归一化
  const total = buildScore + adoptScore;
  buildScore = total > 0 ? Math.round((buildScore / total) * 100) : 50;
  adoptScore = total > 0 ? Math.round((adoptScore / total) * 100) : 50;

  // 判定
  let recommendation: 'build' | 'adopt' | 'hybrid';
  let hybridStrategy: string | undefined;

  if (buildScore >= 65) {
    recommendation = 'build';
  } else if (adoptScore >= 65) {
    recommendation = 'adopt';
  } else {
    recommendation = 'hybrid';
    hybridStrategy =
      '建议采用现有框架作为基础，对核心差异化模块自建实现。' +
      '通过 11.3 节的抽象层将自建模块与框架解耦，' +
      '保留未来全面自建或换框架的灵活性。';
  }

  return { recommendation, buildScore, adoptScore, reasoning, hybridStrategy };
}
```

### 11.7.4 自建决策参考矩阵

| 因素 | 倾向自建 | 倾向采用 |
|------|---------|---------|
| 团队规模 | >= 8 人 | <= 3 人 |
| 独特需求 | >= 5 个核心差异点 | <= 2 个 |
| 时间窗口 | >= 16 周 | <= 4 周 |
| 维护周期 | > 2 年 | < 6 个月 |
| 性能要求 | P99 < 500ms | P99 < 5s |
| 合规约束 | 有数据主权要求 | 无特殊要求 |
| 基础设施 | 高度定制化 | 标准云环境 |

### 11.7.5 混合方案：最佳实践

在多数实际项目中，"混合"是最现实的选择。推荐的混合策略：

```
┌──────────────────────────────────────────────────┐
│                 应用层 (自建)                      │
│  ┌─────────────────────────────────────────────┐ │
│  │ 业务逻辑 │ 自定义编排 │ 领域特化工具        │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│              抽象层 (自建, 参考 11.3)              │
│  ┌─────────────────────────────────────────────┐ │
│  │ IFrameworkAbstraction │ PluggableFactory     │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│              框架层 (采用)                         │
│  ┌──────┬─────────┬────────┬────────┬────────┬─────────┬────────┬──────────┐│
│  │ ADK  │LangGraph│ CrewAI │AutoGen │ OpenAI │OpenClaw │ Mastra │Vercel AI ││
│  └──────┴─────────┴────────┴────────┴────────┴─────────┴────────┴──────────┘│
│                                                  │
│              基础设施层 (自建/采用)                │
│  ┌─────────────────────────────────────────────┐ │
│  │ LLM 网关 │ 监控 │ 日志 │ 配置中心            │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

**混合策略的关键原则：**

1. **框架层可替换**: 通过抽象层隔离，底层框架可以按需切换
2. **业务逻辑自主**: 核心业务编排逻辑自己掌控，不受框架版本约束
3. **基础设施复用**: LLM 网关、监控等通用基础设施独立于框架
4. **渐进式演进**: 从采用开始，按需将关键模块替换为自建实现

---


## 11.8 学术基础与延伸阅读

AI Agent 框架的设计并非凭空而来，而是建立在近年来大量学术研究成果之上。以下论文构成了当前 Agent 框架的理论基石，理解它们有助于更深入地把握框架设计背后的"为什么"。

| 论文 | 作者 | 年份/会议 | 核心贡献 |
|------|------|-----------|----------|
| ReAct: Synergizing Reasoning and Acting | Yao et al. | ICLR 2023 | 思考-行动-观察循环，Agent 推理框架基石 |
| Toolformer: Language Models Can Teach Themselves to Use Tools | Schick et al. | NeurIPS 2023 | 自监督工具使用学习 |
| Generative Agents: Interactive Simulacra of Human Behavior | Park et al. | UIST 2023 | 25 个 AI Agent 模拟人类社区，记忆-反思-规划架构 |
| Reflexion: Language Agents with Verbal Reinforcement Learning | Shinn et al. | NeurIPS 2023 | 语言反馈驱动的 Agent 自我改进 |
| Language Agent Tree Search (LATS) | Zhou et al. | NeurIPS 2023 | 将 MCTS 引入 Agent 决策，结合推理、行动、规划 |
| AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation | Wu et al. | 2023 | 多 Agent 对话框架，直接催生了 AutoGen 项目 |
| AgentBench: Evaluating LLMs as Agents | Liu et al. | ICLR 2024 | Agent 能力评估基准，8 个环境的系统性测试 |

**论文与框架的对应关系**：

- **ReAct** → 几乎所有框架的 Agent Loop 都实现了 ReAct 的"思考-行动-观察"循环（LangGraph 的节点图、ADK 的 Agent.run、Claude Agent SDK 的 Agent Loop）
- **Toolformer** → 框架中 Tool/Function Calling 机制的学术基础
- **Generative Agents** → CrewAI 的角色扮演和记忆系统、Agno 的多 Agent 协作设计
- **Reflexion** → Generator-Critic 模式（§10.5）、Evaluator-Optimizer 模式（§10.11.5）的理论来源
- **LATS** → LangGraph 的图搜索和条件分支、Mastra 的 Workflow 分支逻辑
- **AutoGen 论文** → AutoGen 框架的直接理论基础，多 Agent 对话范式的开创性工作
- **AgentBench** → §11.4 基准测试方法论的学术参考

> **延伸阅读建议**：如果你只有时间读一篇，推荐从 **ReAct** 开始——它定义了当前几乎所有 Agent 框架的核心执行范式。如果你要构建多 Agent 系统，**Generative Agents** 和 **AutoGen 论文**提供了两种截然不同但都极具影响力的设计思路。

---

## 11.9 本章小结

### 11.9.1 核心要点回顾

本章深入对比了十大主流 AI Agent 框架（含 Vercel AI SDK v5），从架构设计到实际选型，覆盖了框架选择的完整决策链条。

| 章节 | 核心内容 | 关键收获 |
|------|---------|---------|
| 11.1 | 框架全景 | 了解十大框架的定位和适用场景 |
| 11.2 | 深度分析 | 掌握每个框架的核心 API 和编程范式 |
| 11.3 | 抽象层 | 学会构建框架无关的可移植代码 |
| 11.4 | 性能基准 | 用数据而非直觉评估框架表现 |
| 11.5 | 选型决策 | 掌握量化决策方法论和工具 |
| 11.6 | 迁移策略 | 具备安全迁移框架的实操能力 |
| 11.7 | 自建评估 | 理性评判自建与采用的边界 |

### 11.9.2 决策流程图

选型决策可以精简为以下流程：

```
开始
  │
  ├── 是否有强制供应商要求？
  │     ├── 是 → Google Cloud → ADK
  │     ├── 是 → OpenAI 生态 → OpenAI Agents SDK
  │     └── 否 ↓
  │
  ├── 主力技术栈是什么？
  │     ├── TypeScript/Web → Mastra 或 Vercel AI SDK
  │     └── Python ↓
  │
  ├── 项目复杂度如何？
  │     ├── 简单(1-2 Agent) → CrewAI 或 OpenAI Agents SDK
  │     ├── 中等(需要工作流) → LangGraph
  │     └── 复杂(多 Agent 协作) ↓
  │
  ├── 需要多平台渠道部署？
  │     └── 是 → OpenClaw
  │
  ├── 核心场景是什么？
  │     ├── 代码生成/执行 → AutoGen (0.4) 或 AG2
  │     ├── 人工审批流 → LangGraph (v1.0 原生支持)
  │     ├── 角色扮演 → CrewAI
  │     ├── Web 前端集成 → Vercel AI SDK
  │     └── 通用编排 → LangGraph
  │
  └── 用决策矩阵验证
        └── 输出最终推荐
```

### 11.9.3 未来趋势展望

AI Agent 框架领域正在快速演进，以下趋势值得关注（截至 2026 年 3 月）：

1. **协议标准化加速**: A2A (Agent-to-Agent) 和 MCP (Model Context Protocol) 已成为事实标准。Mastra、OpenClaw、Vercel AI SDK 等新生框架均原生支持 MCP，LangGraph 和 OpenAI Agents SDK 也已全面集成。框架的差异化正从"能做什么"转向"做得多好"。

2. **框架分层明确化**: 行业正在形成清晰的分层格局——**高层快速构建**（CrewAI、OpenAI Agents SDK）、**中层编排引擎**（LangGraph v1.0、Mastra Workflow）、**底层运行时**（AutoGen 0.4 Core、Semantic Kernel）。LangChain 1.0 与 LangGraph 1.0 的分工就是这一趋势的典型案例。

3. **编排层下沉**: Agent 编排能力正在从应用层下沉到基础设施层。云厂商（AWS Bedrock Agents, Google Vertex AI Agent Builder）开始提供原生的 Agent 编排服务。

4. **TypeScript 生态崛起**: Mastra 1.0 和 Vercel AI SDK v5 的成功证明 TypeScript 在 Agent 开发中不再是二等公民。Web 开发者可以直接用熟悉的技术栈构建生产级 Agent，无需切换到 Python。

5. **端到端可观测**: LangSmith、OpenAI Tracing、Mastra 的 OpenTelemetry 集成——从 Prompt 构造到工具调用再到最终输出，全链路的可观测性已成为框架的标配能力。

6. **社区分叉与融合并存**: AutoGen 的 AG2 分叉展示了开源 Agent 框架治理的挑战。同时，框架之间也在融合——AutoGen 0.4 计划与 Semantic Kernel 运行时融合，Mastra 与 Vercel AI SDK v5 深度集成。

7. **平台连接成为标配**: OpenClaw 的成功（100K+ Stars）证明了"Agent 触达用户"与"Agent 编排逻辑"同等重要。未来越来越多的框架将内置多平台适配能力，或通过 MCP 协议实现跨框架的工具和平台共享。

### 11.9.4 综合选型函数

最后，将本章所有方法串联为一个综合选型函数：

```typescript
// ============================================================
// 综合选型入口：串联所有决策工具
// ============================================================

interface ComprehensiveSelectionInput {
  readonly team: TeamProfile;
  readonly project: ProjectRequirements;
  readonly tcoParams: Omit<TCOParameters, 'framework'>;
  readonly buildFactors: BuildVsBuyFactors;
}

interface ComprehensiveSelectionResult {
  readonly topRecommendation: string;
  readonly buildOrAdopt: 'build' | 'adopt' | 'hybrid';
  readonly detailedScores: Array<{
    framework: string;
    matrixScore: number;
    scenarioMatch: number;
    teamFit: number;
    tco: number;
    compositeScore: number;
  }>;
  readonly summary: string;
}

async function comprehensiveFrameworkSelection(
  input: ComprehensiveSelectionInput,
): Promise<ComprehensiveSelectionResult> {
  // Step 1: Build vs Buy 决策
  const buildVsBuy = analyzeBuildVsBuy(input.buildFactors);
  if (buildVsBuy.recommendation === 'build') {
    return {
      topRecommendation: '自建框架',
      buildOrAdopt: 'build',
      detailedScores: [],
      summary:
        `建议自建框架。Build 得分: ${buildVsBuy.buildScore}。` +
        `原因: ${buildVsBuy.reasoning.join('; ')}`,
    };
  }

  // Step 2: 决策矩阵评估
  const matrix = createStandardMatrix();
  scoreAllFrameworks(matrix);
  const matrixResults = matrix.evaluate();

  // Step 3: 场景匹配
  const scenarioMatcher = new ScenarioMatcher();
  const scenarioResults = scenarioMatcher.match(input.project);

  // Step 4: 团队适配度
  const teamAssessor = new TeamSkillAssessor();
  const frameworks = [
    'Google ADK', 'LangGraph', 'CrewAI', 'AutoGen', 'OpenAI Agents SDK', 'OpenClaw', 'Mastra', 'Vercel AI SDK',
  ];
  const teamResults = frameworks.map(
    fw => teamAssessor.assess(input.team, fw)
  );

  // Step 5: TCO 计算
  const tcoResults = frameworks.map(fw =>
    calculateTCO({ ...input.tcoParams, framework: fw })
  );

  // Step 6: 综合评分
  const maxTCO = Math.max(...tcoResults.map(t => t.totalTCO));

  const detailedScores = frameworks.map((fw, i) => {
    const matrixScore =
      (matrixResults.find(r => r.framework === fw)?.totalScore ?? 0) * 10;
    const scenarioMatch =
      scenarioResults.find(r => r.framework === fw)?.matchScore ?? 0;
    const teamFit =
      teamResults[i]?.overallFit ?? 0;
    const tcoScore =
      maxTCO > 0
        ? ((maxTCO - tcoResults[i].totalTCO) / maxTCO) * 100
        : 50;

    // 加权综合分 (权重可根据项目调整)
    const compositeScore =
      matrixScore * 0.25 +
      scenarioMatch * 0.30 +
      teamFit * 0.25 +
      tcoScore * 0.20;

    return {
      framework: fw,
      matrixScore: Math.round(matrixScore * 10) / 10,
      scenarioMatch: Math.round(scenarioMatch * 10) / 10,
      teamFit: Math.round(teamFit * 10) / 10,
      tco: Math.round(tcoScore * 10) / 10,
      compositeScore: Math.round(compositeScore * 10) / 10,
    };
  });

  // 排序
  detailedScores.sort((a, b) => b.compositeScore - a.compositeScore);

  const top = detailedScores[0];
  const summary =
    `综合评估推荐 ${top.framework} ` +
    `(综合分 ${top.compositeScore})。` +
    `矩阵评分 ${top.matrixScore}, ` +
    `场景匹配 ${top.scenarioMatch}, ` +
    `团队适配 ${top.teamFit}, ` +
    `成本优势 ${top.tco}。` +
    (buildVsBuy.recommendation === 'hybrid'
      ? ` 建议采用混合策略: ${buildVsBuy.hybridStrategy}`
      : '');

  return {
    topRecommendation: top.framework,
    buildOrAdopt: buildVsBuy.recommendation,
    detailedScores,
    summary,
  };
}
```

### 11.9.5 写在最后

框架选型没有银弹。今天的"最佳选择"可能因为团队变化、业务转型、或框架自身的演进而不再适用。重要的不是选到完美的框架，而是建立一套可以持续评估和调整的选型机制。

本章提供的决策矩阵、场景匹配器、TCO 计算器和迁移工具不是一次性使用的——它们应该成为团队技术决策的基础设施，在每次重大技术选型时复用和迭代。

**最后的建议**: 把时间花在抽象层上。好的抽象层让你在框架之间自由切换，把选型风险从"不可逆的架构决策"降级为"可随时调整的配置变更"。

