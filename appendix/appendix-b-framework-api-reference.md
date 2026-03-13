# 附录 B：主流框架 API 速查

## B.1 LangGraph

> **版本：** v1.0+（Python `langgraph>=1.0`，TypeScript `@langchain/langgraph>=1.0`）  
> **定位：** 低级别编排框架，将 Agent 工作流建模为有状态的图（StateGraph）。

### B.1.1 核心概念

| 概念 | 说明 |
|------|------|
| **StateGraph** | 核心图对象，节点读写共享状态 |
| **Node** | 图中的计算单元（普通函数或异步函数） |
| **Edge** | 节点之间的连接，支持普通边和条件边 |
| **Conditional Edge** | 根据状态动态选择下一个节点 |
| **Checkpointer** | 持久化图状态，支持中断/恢复和 time-travel |

### B.1.2 Python API

```python
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.messages import HumanMessage, BaseMessage
from typing import Annotated, TypedDict
from operator import add

# 1) 定义状态
class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add]
    next: str

# 2) 定义节点函数
async def agent_node(state: AgentState) -> dict:
    response = await llm.ainvoke(state["messages"])
    return {"messages": [response]}

async def tool_node(state: AgentState) -> dict:
    # 执行工具调用
    results = await execute_tools(state["messages"][-1].tool_calls)
    return {"messages": results}

# 3) 路由函数
def should_continue(state: AgentState) -> str:
    last = state["messages"][-1]
    if last.tool_calls:
        return "tools"
    return END

# 4) 构建图
graph = StateGraph(AgentState)
graph.add_node("agent", agent_node)
graph.add_node("tools", tool_node)

graph.add_edge(START, "agent")
graph.add_conditional_edges("agent", should_continue, {
    "tools": "tools",
    END: END,
})
graph.add_edge("tools", "agent")

# 5) 编译（带 checkpointer）
app = graph.compile(checkpointer=MemorySaver())

# 6) 调用
result = await app.ainvoke(
    {"messages": [HumanMessage(content="Hello")]},
    config={"configurable": {"thread_id": "session-1"}},
)
```

### B.1.3 TypeScript API

```typescript
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph';
import { HumanMessage, BaseMessage } from '@langchain/core/messages';

// 状态定义
const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
});

const graph = new StateGraph(StateAnnotation)
  .addNode('agent', agentFunction)
  .addNode('tools', toolExecutor)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', routingFunction, {
    tools: 'tools',
    [END]: END,
  })
  .addEdge('tools', 'agent');

const app = graph.compile({ checkpointer: new MemorySaver() });
const result = await app.invoke(
  { messages: [new HumanMessage('Hello')] },
  { configurable: { thread_id: 'session-1' } },
);
```

---

## B.2 AutoGen

> **版本：** v0.4+（`pip install autogen-agentchat autogen-ext`）  
> **定位：** 微软出品，基于异步事件驱动 Actor 模型的多 Agent 框架。v0.4 是完全重写版本，分为 **Core**（底层 actor 运行时）、**AgentChat**（高级多 Agent API）和 **Extensions** 三层。  
> **注意：** 社区维护了 v0.2 的分支 **AG2**（`pip install ag2`，官网 [ag2.ai](https://docs.ag2.ai)），保留了旧版 API。新项目推荐使用 v0.4。

### B.2.1 AgentChat API（推荐入口）

```python
import asyncio
from autogen_agentchat.agents import AssistantAgent, UserProxyAgent
from autogen_agentchat.teams import RoundRobinGroupChat
from autogen_agentchat.conditions import TextMentionTermination
from autogen_ext.models.openai import OpenAIChatCompletionClient
from autogen_core.tools import FunctionTool

# 1) 模型客户端
model_client = OpenAIChatCompletionClient(
    model="gpt-4o",
    # api_key 从环境变量 OPENAI_API_KEY 读取
)

# 2) 工具定义
def search_web(query: str) -> str:
    """Search the web for information."""
    return f"Results for: {query}"

search_tool = FunctionTool(name="search_web", func=search_web)

# 3) Agent 定义
researcher = AssistantAgent(
    name="researcher",
    system_message="You are a research assistant. Search the web to find information.",
    model_client=model_client,
    tools=[search_tool],
)

writer = AssistantAgent(
    name="writer",
    system_message="You are a writer. Compose a report based on the research.",
    model_client=model_client,
)

# 4) 终止条件
termination = TextMentionTermination("TERMINATE")

# 5) 团队编排
team = RoundRobinGroupChat(
    participants=[researcher, writer],
    termination_condition=termination,
)

# 6) 异步运行
async def main():
    result = await team.run(task="Research the latest AI agent frameworks and write a summary.")
    print(result)

asyncio.run(main())
```

### B.2.2 v0.4 架构分层

| 层 | 包名 | 用途 |
|-----|------|------|
| **Core** | `autogen-core` | 事件驱动 Actor 运行时，可分布式扩展 |
| **AgentChat** | `autogen-agentchat` | 高级 API：AssistantAgent, GroupChat, Teams |
| **Extensions** | `autogen-ext` | 模型客户端、工具集成（OpenAI, Azure 等） |

---

## B.3 CrewAI

> **版本：** v0.100+（`pip install crewai`）  
> **定位：** 角色扮演式多 Agent 编排框架，低学习曲线，适合快速原型。

### B.3.1 核心 API

```python
from crewai import Agent, Task, Crew, Process

# Agent 定义
researcher = Agent(
    role='Senior Researcher',
    goal='Find the latest AI trends',
    backstory='Expert in AI research with 10 years of experience...',
    tools=[search_tool, scrape_tool],
    llm='gpt-4o',
    verbose=True,
)

writer = Agent(
    role='Technical Writer',
    goal='Write clear technical reports',
    backstory='Experienced tech writer...',
    llm='gpt-4o',
)

# Task 定义
research_task = Task(
    description='Research AI agent frameworks released in 2025-2026',
    expected_output='Detailed comparison report in markdown',
    agent=researcher,
)

write_task = Task(
    description='Write a summary blog post based on the research',
    expected_output='Blog post of ~800 words',
    agent=writer,
)

# Crew 编排
crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, write_task],
    process=Process.sequential,   # 或 Process.hierarchical
    verbose=True,
)

result = crew.kickoff()
print(result.raw)
```

---

## B.4 Mastra

> **版本：** v1.0+（`npm create mastra`）  
> **定位：** TypeScript 原生 AI 框架，提供 Agent、Tool、Workflow、RAG、Eval 等全栈能力，内置 MCP 支持。

### B.4.1 Agent 创建

```typescript
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';

const researchAgent = new Agent({
  id: 'research-agent',
  name: 'Research Agent',
  instructions: 'You are a helpful research assistant. Use tools to find information.',
  model: openai('gpt-4o'),
  tools: { webSearch, summarize },    // 工具以对象形式传入
});

// 生成文本
const response = await researchAgent.generate('What are the latest AI trends?');
console.log(response.text);

// 流式输出
const stream = await researchAgent.stream('Explain quantum computing');
for await (const chunk of stream) {
  process.stdout.write(chunk);
}
```

### B.4.2 工具定义

```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const weatherTool = createTool({
  id: 'weather-lookup',
  description: 'Get current weather for a city',
  inputSchema: z.object({
    city: z.string().describe('City name'),
  }),
  execute: async ({ context }) => {
    const data = await fetchWeather(context.city);
    return { temperature: data.temp, condition: data.condition };
  },
});
```

### B.4.3 Workflow

```typescript
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

const analyzeStep = createStep({
  id: 'analyze',
  inputSchema: z.object({ text: z.string() }),
  outputSchema: z.object({ summary: z.string() }),
  execute: async ({ inputData }) => {
    return { summary: `Analysis of: ${inputData.text}` };
  },
});

const myWorkflow = createWorkflow({
  id: 'analysis-workflow',
  inputSchema: z.object({ text: z.string() }),
  outputSchema: z.object({ summary: z.string() }),
})
  .then(analyzeStep);

myWorkflow.commit();
```

### B.4.4 MCP 集成

```typescript
import { MCPClient } from '@mastra/mcp';

// 作为 MCP 客户端连接外部工具服务器
const mcpClient = new MCPClient({
  servers: {
    filesystem: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', './data'],
    },
  },
});

const tools = await mcpClient.getTools();

const agent = new Agent({
  id: 'mcp-agent',
  name: 'MCP Agent',
  instructions: 'Use MCP tools to interact with the filesystem.',
  model: openai('gpt-4o'),
  tools,
});
```

---

## B.5 OpenAI Agents SDK

> **版本：** Python `openai-agents`，TypeScript `@openai/agents`  
> **定位：** 轻量级多 Agent 编排框架，核心原语为 Agent、Handoff、Guardrail、Tracing。

### B.5.1 Python API

```python
from agents import Agent, Runner, function_tool, handoff, guardrail, RunContextWrapper
from agents.tool import FileSearchTool, CodeInterpreterTool

# 1) 工具定义
@function_tool
def get_weather(city: str) -> str:
    """Get the current weather for a city."""
    return f"Sunny, 22°C in {city}"

# 2) Guardrail（输入/输出校验）
@guardrail
async def no_pii_guardrail(ctx: RunContextWrapper, agent: Agent, input: str):
    if "SSN" in input:
        return guardrail.tripwire("PII detected in input")

# 3) Agent 定义
assistant = Agent(
    name='assistant',
    instructions='You are a helpful weather assistant.',
    model='gpt-4o',
    tools=[get_weather, FileSearchTool(), CodeInterpreterTool()],
    input_guardrails=[no_pii_guardrail],
)

# 4) Handoff（Agent 间转接）
billing_agent = Agent(name='billing', instructions='Handle billing questions.', model='gpt-4o')
tech_agent = Agent(name='tech', instructions='Handle technical questions.', model='gpt-4o')

triage_agent = Agent(
    name='triage',
    instructions='Route the user to the right specialist.',
    handoffs=[
        handoff(billing_agent),
        handoff(tech_agent),
    ],
)

# 5) 运行
result = await Runner.run(triage_agent, 'I have a billing question about my last invoice.')
print(result.final_output)
```

### B.5.2 Tracing

内置追踪自动收集：LLM 调用、工具执行、Handoff、Guardrail 事件。可通过 OpenAI Dashboard 查看，也支持导出到自定义后端。

```python
from agents import trace

# 自定义 trace span
with trace("my-workflow"):
    result = await Runner.run(agent, "Hello")
```

### B.5.3 TypeScript API

```typescript
import { Agent, run } from '@openai/agents';

const agent = new Agent({
  name: 'assistant',
  instructions: 'You are a helpful assistant.',
  model: 'gpt-4o',
  tools: [getWeatherTool],
});

const result = await run(agent, 'What is the weather in Tokyo?');
console.log(result.finalOutput);
```

---

## B.6 Vercel AI SDK

> **版本：** `ai@4.x`+（`npm install ai @ai-sdk/openai`）  
> **定位：** TypeScript AI 工具包，提供统一 LLM 调用接口，流式优先，Next.js 深度集成。通过 `maxSteps` 实现多步 Agent 循环。

### B.6.1 基础：generateText / streamText

```typescript
import { generateText, streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

// 单次生成
const { text } = await generateText({
  model: openai('gpt-4o'),
  prompt: 'Explain quantum computing in one paragraph.',
});

// 流式生成
const result = streamText({
  model: openai('gpt-4o'),
  prompt: 'Write a haiku about coding.',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

### B.6.2 工具定义

```typescript
import { tool } from 'ai';
import { z } from 'zod';

const weatherTool = tool({
  description: 'Get the current weather for a location',
  parameters: z.object({
    city: z.string().describe('The city name'),
  }),
  execute: async ({ city }) => {
    const data = await fetchWeather(city);
    return { temperature: data.temp, condition: data.condition };
  },
});
```

### B.6.3 多步 Agent 循环（maxSteps）

`maxSteps` 是 Vercel AI SDK 实现 Agent 循环的关键参数。当模型返回工具调用时，SDK 自动执行工具、将结果追加到对话，然后触发下一轮生成，直到达到最大步数或模型返回文本响应。

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const { text, steps } = await generateText({
  model: openai('gpt-4o'),
  tools: { weather: weatherTool, search: searchTool },
  maxSteps: 10,     // 最多 10 轮工具调用循环
  system: 'You are a helpful assistant. Use tools when needed.',
  prompt: 'What should I wear in Tokyo today?',
});

console.log(text);                    // 最终文本回复
console.log(`Steps taken: ${steps.length}`);
```

### B.6.4 聊天路由（Next.js App Router）

```typescript
// app/api/chat/route.ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    system: 'You are a helpful assistant.',
    messages,
    tools: { weather: weatherTool },
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}
```

---

## B.7 MCP (Model Context Protocol)

> **定位：** 开放协议，为 LLM 应用提供标准化的工具/资源/提示接入方式。

### B.7.1 服务端 API

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const server = new McpServer({ name: 'my-server', version: '1.0.0' });

// 注册工具
server.tool('search', { query: z.string() }, async ({ query }) => {
  const results = await performSearch(query);
  return { content: [{ type: 'text', text: JSON.stringify(results) }] };
});

// 注册资源
server.resource('config://{key}', async (uri) => {
  return { contents: [{ uri, mimeType: 'application/json', text: '...' }] };
});

// 注册提示
server.prompt('summarize', { text: z.string() }, ({ text }) => ({
  messages: [{ role: 'user', content: `Summarize: ${text}` }],
}));
```

---

## B.8 框架选型决策矩阵

| 特性 | LangGraph | AutoGen 0.4 | CrewAI | OpenAI Agents SDK | Mastra | Vercel AI SDK |
|------|-----------|-------------|--------|-------------------|--------|---------------|
| 语言 | Python/TS | Python | Python | Python/TS | TypeScript | TypeScript |
| 学习曲线 | 中-高 | 中 | 低 | 低 | 低-中 | 低 |
| 灵活性 | 高 | 高 | 低 | 中 | 中-高 | 中 |
| Multi-Agent | 手动编排 | 原生（Teams） | 原生（Crew） | Handoff | Sub-agent | 手动 |
| 状态管理 | Checkpoint | 事件驱动 Session | 隐式 | 隐式 | Workflow State | 隐式 |
| 流式支持 | 支持 | 支持 | 有限 | 支持 | 原生 | 原生（核心优势） |
| MCP 支持 | 社区 | 社区 | 社区 | 原生 | 原生 | 社区 |
| 生产就绪 | 高 | 中-高 | 低-中 | 中 | 中-高 | 高 |
| 最佳场景 | 复杂有状态工作流 | 分布式多 Agent | 快速角色扮演原型 | OpenAI 生态 Agent | TS 全栈 AI 应用 | Next.js AI 功能 |
