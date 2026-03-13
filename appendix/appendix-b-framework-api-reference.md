# 附录 B：主流框架 API 速查

## B.1 Google ADK (Agent Development Kit)

### B.1.1 核心 API

```typescript
// Agent 创建
const agent = new Agent({
  name: string,
  model: string,
  instruction: string,
  tools: Tool[],
  subAgents?: Agent[],
  outputKey?: string
});

// 编排原语
const sequential = new SequentialAgent({
  name: string,
  subAgents: Agent[]
});

const parallel = new ParallelAgent({
  name: string,
  subAgents: Agent[]
});

const loop = new LoopAgent({
  name: string,
  subAgent: Agent,
  maxIterations?: number
});

// 工具定义
const tool = new FunctionTool({
  name: string,
  description: string,
  parameters: JSONSchema,
  handler: (params) => Promise<any>
});

// 运行
const runner = new Runner({ agent, appName: string });
const result = await runner.run({ userId: string, sessionId: string, newMessage: Content });
```

## B.2 LangGraph

### B.2.1 核心 API

```typescript
import { StateGraph, Annotation } from '@langchain/langgraph';

// 状态定义
const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y)
  }),
  next: Annotation<string>()
});

// 图构建
const graph = new StateGraph(StateAnnotation)
  .addNode('agent', agentFunction)
  .addNode('tools', toolExecutor)
  .addEdge('__start__', 'agent')
  .addConditionalEdges('agent', routingFunction, {
    tools: 'tools',
    end: '__end__'
  })
  .addEdge('tools', 'agent');

// 编译
const app = graph.compile({ checkpointer: new MemorySaver() });

// 运行
const result = await app.invoke(
  { messages: [new HumanMessage('Hello')] },
  { configurable: { thread_id: 'session-1' } }
);
```

## B.3 CrewAI

### B.3.1 核心 API

```python
from crewai import Agent, Task, Crew, Process

# Agent 定义
researcher = Agent(
    role='Senior Researcher',
    goal='Find the latest AI trends',
    backstory='Expert in AI research...',
    tools=[search_tool, scrape_tool],
    llm='gpt-4',
    verbose=True
)

# Task 定义
task = Task(
    description='Research AI agent frameworks',
    expected_output='Detailed comparison report',
    agent=researcher
)

# Crew 编排
crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, write_task],
    process=Process.sequential,  # or Process.hierarchical
    verbose=True
)

result = crew.kickoff()
```

## B.4 OpenAI Agents SDK

### B.4.1 核心 API（Python）

> **包名：** `openai-agents`（`pip install openai-agents`）

```python
from agents import Agent, Runner, function_tool
from agents.tool import FileSearchTool, CodeInterpreterTool

# Agent 定义
agent = Agent(
    name='assistant',
    instructions='You are a helpful assistant.',
    model='gpt-4o',
    tools=[
        function_tool(my_function),
        FileSearchTool(),
        CodeInterpreterTool()
    ]
)

# Handoff（Agent 转接）
triage_agent = Agent(
    name='triage',
    instructions='Route to the right specialist.',
    handoffs=[billing_agent, tech_agent]
)

# 运行
result = await Runner.run(agent, 'Hello, help me!')
print(result.final_output)
```

### B.4.2 核心 API（TypeScript）

> **包名：** `@openai/agents`（`npm install @openai/agents`）

```typescript
import { Agent, run } from '@openai/agents';

const agent = new Agent({
  name: 'assistant',
  instructions: 'You are a helpful assistant.',
  model: 'gpt-4o',
});

const result = await run(agent, 'Hello, help me!');
console.log(result.finalOutput);
```

## B.5 MCP (Model Context Protocol)

### B.5.1 服务端 API

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

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
  messages: [{ role: 'user', content: `Summarize: ${text}` }]
}));
```

## B.6 框架选型决策矩阵

| 特性 | Google ADK | LangGraph | CrewAI | OpenAI SDK |
|------|-----------|-----------|--------|-----------|
| 语言 | Python | Python/TS | Python | Python |
| 学习曲线 | 低 | 中-高 | 低 | 低 |
| 灵活性 | 中 | 高 | 低 | 中 |
| Multi-Agent | 原生 | 手动 | 原生 | Handoff |
| 状态管理 | Session | Checkpoint | 隐式 | 隐式 |
| 生产就绪 | 中 | 高 | 低 | 中 |
| MCP 支持 | 原生 | 社区 | 无 | 无 |
| 最佳场景 | Google 生态 | 复杂工作流 | 快速原型 | OpenAI 生态 |
