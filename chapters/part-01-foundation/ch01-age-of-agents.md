# 第一章：Agent 的时代

> "The long-term goal has always been to build general AI systems that can help us with almost anything, including acting as expert assistants."  
> — Demis Hassabis, Google DeepMind CEO（出处：2024 年诺贝尔化学奖获奖演讲及后续媒体采访中的公开发言）

---

## 1.1 从 Chatbot 到 Agent：范式转变

### 1.1.1 对话系统的局限性

自 2022 年 ChatGPT 发布以来，大语言模型（LLM）以惊人的速度渗透到各行各业。然而，纯对话式的交互模式很快暴露出根本性的局限：

- **无法执行操作**：用户说"帮我订一张明天去上海的机票"，Chatbot 只能回复"您可以在携程上搜索…"，而不能真正完成预订
- **缺乏持续性**：每次对话都是独立的，没有跨会话的记忆和状态管理
- **单一模态**：只能处理文本，无法操作文件、调用 API、浏览网页
- **被动响应**：只能回答用户的问题，不能主动发现问题并采取行动

这些局限性催生了一个根本性的认知转变：**我们需要的不是更好的对话系统，而是能够理解意图、规划步骤、调用工具、完成任务的自主系统。**

### 1.1.2 Agent 的定义

在本书的语境中，**AI Agent** 的定义是：

> 一个以大语言模型为核心推理引擎，能够自主感知环境、制定计划、调用工具、执行操作，并根据反馈迭代改进的软件系统。

关键特征包括：

| 特征 | Chatbot | AI Agent |
|------|---------|----------|
| 交互模式 | 问答式 | 任务式 |
| 工具使用 | 无 | 多工具集成 |
| 状态管理 | 无状态 | 有状态、持久化 |
| 决策能力 | 单步响应 | 多步规划与执行 |
| 自主性 | 被动 | 主动 |
| 错误处理 | 无 | 自动重试与恢复 |
| 环境交互 | 仅文本 | 文件、API、浏览器、数据库等 |

### 1.1.3 Agent 生态爆发

2024-2025 年，Agent 生态呈现爆发式增长：

- **Google** 发布 Agent Development Kit（ADK）和 Agent2Agent（A2A）协议
- **Anthropic** 发布 Model Context Protocol（MCP）和 Claude Agent
- **OpenAI** 发布 Agents SDK 和 Codex Agent
- **Microsoft** 推出 Azure AI Agent Service
- **开源社区**涌现 LangGraph、CrewAI、AutoGen 等框架

Gartner 预测，到 2028 年，至少 15% 的日常工作决策将由 Agentic AI 自主完成，而 2024 年这一数字几乎为零（来源：Gartner, *Predicts 2025: AI Agents*, 2024 年 10 月发布）。

---

## 1.2 Agent 能力光谱

Agent 并非非黑即白的概念，而是存在一个连续的能力光谱。我们定义 5 个级别（L1-L5），帮助团队明确自己正在构建什么级别的 Agent。

### 1.2.1 L1-L5 能力分级

```
L1: 简单路由器     →  根据关键词分发到预设流程
L2: 工具调用者     →  根据意图选择并调用合适的工具
L3: 推理执行者     →  多步推理 + 工具调用 + 状态管理
L4: 自主 Agent    →  自主规划、执行、反思、迭代
L5: 协作网络      →  多 Agent 协作，自组织完成复杂任务
```

### 1.2.2 各级别详解

**L1: 简单路由器 (Router)**

```typescript
// L1 示例：基于意图分类的路由器
interface L1Router {
  classify(input: string): 'faq' | 'ticket' | 'transfer';
  route(intent: string): string;
}

class SimpleRouter implements L1Router {
  private patterns = new Map<RegExp, string>([
    [/退款|退货/, 'refund_flow'],
    [/投诉|不满/, 'complaint_flow'],
    [/查询|查看/, 'query_flow'],
  ]);

  classify(input: string): 'faq' | 'ticket' | 'transfer' {
    for (const [pattern, _flow] of this.patterns) {
      if (pattern.test(input)) return 'ticket';
    }
    return 'faq';
  }

  route(intent: string): string {
    return `路由到 ${intent} 处理流程`;
  }
}
```

特点：确定性逻辑、无 LLM 推理、响应快速、可预测

**L2: 工具调用者 (Tool User)**

```typescript
// L2 示例：LLM 驱动的工具选择
interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

async function toolUser(
  query: string,
  tools: ToolDefinition[]
): Promise<string> {
  // LLM 决定使用哪个工具
  const toolChoice = await llm.chat({
    messages: [
      { role: 'system', content: `可用工具: ${JSON.stringify(tools)}` },
      { role: 'user', content: query }
    ],
    tool_choice: 'auto'
  });

  // 执行工具调用
  const result = await executeTool(toolChoice);
  return result;
}
```

特点：LLM 决策工具选择、单次工具调用、无状态

**L3: 推理执行者 (Reasoner)**

```typescript
// L3 示例：ReAct 循环
async function reactAgent(task: string): Promise<string> {
  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: task }
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // Reasoning: LLM 思考下一步
    const response = await llm.chat({ messages, tools });

    // 检查是否完成
    if (response.finishReason === 'stop') {
      return response.content;
    }

    // Acting: 执行工具调用
    for (const toolCall of response.toolCalls) {
      const result = await executeTool(toolCall);
      messages.push({ role: 'tool', content: result });
    }
  }

  return '达到最大迭代次数';
}
```

特点：多步推理、状态管理、工具链、错误恢复

**L4: 自主 Agent (Autonomous Agent)**

```typescript
// L4 示例：具有规划和反思能力的自主 Agent
class AutonomousAgent {
  private memory: MemoryStore;
  private planner: Planner;
  private reflector: Reflector;

  async execute(goal: string): Promise<Result> {
    // 1. 从记忆中检索相关经验
    const context = await this.memory.recall(goal);

    // 2. 制定执行计划
    const plan = await this.planner.createPlan(goal, context);

    // 3. 逐步执行计划
    for (const step of plan.steps) {
      const result = await this.executeStep(step);

      // 4. 反思执行结果
      const reflection = await this.reflector.analyze(step, result);

      if (reflection.needsReplan) {
        // 5. 动态调整计划
        await this.planner.revisePlan(plan, reflection);
      }

      // 6. 存入记忆
      await this.memory.store({ step, result, reflection });
    }

    return plan.getFinalResult();
  }
}
```

特点：长期记忆、自主规划、反思改进、持续学习

**L5: 协作网络 (Agent Network)**

在 L5 级别，多个专精的 Agent 通过协议互联，形成类似人类组织的协作网络。每个 Agent 有独立的角色和能力，通过消息传递协作完成复杂任务。

```typescript
// L5 示例：Agent 协作网络
class AgentNetwork {
  private agents: Map<string, Agent>;
  private messageRouter: MessageRouter;

  async solveComplex(task: string): Promise<Result> {
    // 协调者分解任务
    const coordinator = this.agents.get('coordinator')!;
    const subtasks = await coordinator.decompose(task);

    // 并行分配给专家 Agent
    const results = await Promise.all(
      subtasks.map(st => {
        const expert = this.findExpert(st.requiredCapability);
        return expert.execute(st);
      })
    );

    // 汇总结果
    return coordinator.synthesize(results);
  }
}
```

### 1.2.3 能力评估模型

```typescript
// Agent 能力评估器
enum AgentCapabilityLevel {
  L1_ROUTER = 1,
  L2_TOOL_USER = 2,
  L3_REASONER = 3,
  L4_AUTONOMOUS = 4,
  L5_NETWORK = 5,
}

interface AgentCapabilityAssessment {
  level: AgentCapabilityLevel;
  dimensions: {
    reasoning: number;    // 推理能力 (1-10)
    toolUse: number;      // 工具使用 (1-10)
    memory: number;       // 记忆能力 (1-10)
    planning: number;     // 规划能力 (1-10)
    collaboration: number; // 协作能力 (1-10)
    autonomy: number;     // 自主性 (1-10)
  };
  recommendations: string[];
}

class AgentCapabilityAssessor {
  assess(agent: {
    hasToolCalling: boolean;
    hasMemory: boolean;
    hasPlanning: boolean;
    hasReflection: boolean;
    hasMultiAgent: boolean;
    maxIterations: number;
    toolCount: number;
  }): AgentCapabilityAssessment {
    let level = AgentCapabilityLevel.L1_ROUTER;
    const dimensions = {
      reasoning: 2,
      toolUse: 0,
      memory: 0,
      planning: 0,
      collaboration: 0,
      autonomy: 1,
    };

    if (agent.hasToolCalling) {
      level = AgentCapabilityLevel.L2_TOOL_USER;
      dimensions.toolUse = Math.min(agent.toolCount, 10);
      dimensions.reasoning = 4;
    }

    if (agent.maxIterations > 1 && agent.hasToolCalling) {
      level = AgentCapabilityLevel.L3_REASONER;
      dimensions.reasoning = 6;
      dimensions.autonomy = 4;
    }

    if (agent.hasMemory && agent.hasPlanning && agent.hasReflection) {
      level = AgentCapabilityLevel.L4_AUTONOMOUS;
      dimensions.memory = 7;
      dimensions.planning = 7;
      dimensions.reasoning = 8;
      dimensions.autonomy = 7;
    }

    if (agent.hasMultiAgent) {
      level = AgentCapabilityLevel.L5_NETWORK;
      dimensions.collaboration = 8;
      dimensions.autonomy = 9;
    }

    return {
      level,
      dimensions,
      recommendations: this.generateRecommendations(level, dimensions),
    };
  }

  private generateRecommendations(
    level: AgentCapabilityLevel,
    dims: AgentCapabilityAssessment['dimensions']
  ): string[] {
    const recs: string[] = [];

    if (dims.toolUse < 5) recs.push('增加工具集成数量和多样性');
    if (dims.memory < 5) recs.push('实现对话和长期记忆系统');
    if (dims.planning < 5) recs.push('引入任务分解和规划能力');
    if (dims.reasoning < 5) recs.push('增强多步推理和 Chain-of-Thought');
    if (dims.collaboration < 5 && level >= 4) {
      recs.push('考虑引入 Multi-Agent 协作');
    }

    return recs;
  }
}
```

---

## 1.3 为什么是现在？

三个关键因素的交汇使得 2024-2026 年成为 Agent 的引爆点：

### 1.3.1 模型能力的飞跃

| 模型 | 上下文窗口 | 多模态 | 工具调用 | Agent能力 | 发布时间 |
|------|-----------|--------|---------|----------|---------|
| GPT-4o | 128K | ✅ 文本/图像/音频 | ✅ 并行调用 | ⭐⭐⭐ | 2024-05 |
| Claude Opus 4.6 | 1M | ✅ 文本/图像/PDF | ✅ 并行+MCP | ⭐⭐⭐⭐⭐ | 2026-02 |
| Claude Sonnet 4.6 | 1M | ✅ 文本/图像/PDF | ✅ 并行+MCP | ⭐⭐⭐⭐ | 2026-02 |
| Gemini 3 | 2M | ✅ 文本/图像/音频/视频 | ✅ 原生调用 | ⭐⭐⭐⭐ | 2025-12 |
| GLM-5 | 128K | ✅ 文本/图像 | ✅ 工具调用 | ⭐⭐⭐⭐ | 2026-02 |
| o3 | 200K | ✅ 文本/图像 | ✅ 并行调用 | ⭐⭐⭐⭐ | 2025-04 |

关键进步：
- 上下文窗口从 4K 扩展到 2M tokens（Gemini 3），Claude Opus 4.6 支持 1M 上下文并原生支持 Agent 团队协作
- 原生工具使用能力（不再需要 hack），MCP 协议成为行业标准
- 结构化输出保证（JSON Schema 约束）
- 推理能力质的飞跃（o3 推理链、Gemini 3 Deep Think 模式）
- 开源模型崛起：GLM-5 在 SWE-bench 上达到 77.8%，接近闭源前沿水平

### 1.3.2 标准协议的诞生

2024-2025 年，Agent 领域出现了三大标准化协议：

**MCP (Model Context Protocol)** — Anthropic 于 2024 年底推出
- Agent 与工具/数据源之间的标准接口
- 类比：AI 时代的 USB-C
- 解决了工具集成的碎片化问题

**A2A (Agent2Agent Protocol)** — Google 于 2025 年推出
- Agent 与 Agent 之间的通信标准
- 支持跨组织的 Agent 协作
- 基于 Agent Card 发现和 Task 生命周期

**ACP (Agent Communication Protocol)** — IBM 等企业联盟推动
- 企业级的 Agent 通信协议
- 强调安全性和可审计性

### 1.3.3 工程化工具链的成熟

框架和工具链的成熟大幅降低了 Agent 开发门槛：

```
开发框架    ：LangGraph, Google ADK, CrewAI, AutoGen
协议工具    ：MCP SDK, A2A SDK
可观测性    ：LangSmith, LangFuse, Phoenix
向量数据库  ：Qdrant, ChromaDB, Weaviate, Pinecone
评测工具    ：promptfoo, Braintrust, GAIA
部署平台    ：Vercel AI SDK, AWS Bedrock Agents
```

---

## 1.4 本书的定位与结构

### 1.4.1 这本书为谁而写

本书面向以下读者：

- **AI 工程师**：希望系统掌握 Agent 架构设计和工程化实践
- **后端/全栈工程师**：计划在产品中集成 Agent 能力
- **技术管理者**：需要理解 Agent 的能力边界和技术选型
- **AI 产品经理**：希望深入理解 Agent 的技术原理以做出更好的产品决策

### 1.4.2 前置知识

- 熟悉 TypeScript / JavaScript
- 了解 HTTP / REST API 基础
- 对 LLM 有基本认知（Transformer 架构、Prompt Engineering）
- 无需深度学习或机器学习背景

### 1.4.3 全书结构

本书分为 11 个部分，27 章 + 6 个附录，从基础理论到生产实践，覆盖 Agent 工程化的完整知识体系：

| 部分 | 章节 | 核心主题 |
|------|------|---------|
| 一：基础与愿景 | 1-2 | Agent 定义、理论基础 |
| 二：核心架构 | 3-6 | 架构设计、状态、上下文、工具 |
| 三：记忆与知识 | 7-8 | 记忆系统、RAG |
| 四：Multi-Agent | 9-11 | 多 Agent 协作、编排、框架 |
| 五：安全与信任 | 12-14 | 威胁模型、注入防御、信任架构 |
| 六：评测 | 15-16 | 评测体系、Benchmark |
| 七：生产化 | 17-19 | 可观测性、部署、成本 |
| 八：互操作性 | 20-21 | MCP/A2A 协议、平台集成 |
| 九：用户体验 | 22 | AX 设计 |
| 十：案例研究 | 23-25 | 编码助手、客服、数据分析 |
| 十一：未来展望 | 26-27 | 前沿趋势、负责任开发 |

---

## 1.5 本章小结

本章建立了全书的核心概念框架：

1. **AI Agent 是范式转变**：从被动问答到主动执行任务的系统
2. **能力光谱 L1-L5**：Agent 不是二元概念，而是分级的能力体系
3. **三大驱动力**：模型能力飞跃 + 标准协议诞生 + 工具链成熟
4. **2025-2026 年是关键节点**：Agent 从实验室走向生产环境

下一章，我们将深入 Agent 的理论基础，理解 LLM 作为推理引擎的本质，以及确定性与概率性组件如何协同工作。

---

> **延伸阅读**
> - Lilian Weng, "LLM Powered Autonomous Agents" (2023)
> - Anthropic, "Building effective agents" (2024)
> - Chip Huyen, "What are AI Agents?" (2025)
> - Google, "Agent Development Kit Documentation" (2025)
