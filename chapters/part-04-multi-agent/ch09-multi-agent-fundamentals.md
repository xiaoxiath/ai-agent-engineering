# 第九章：Multi-Agent 基础

> "单个 Agent 的能力终有上限，Multi-Agent 系统让 AI 具备了团队协作的可能。"

---

## 9.1 为什么需要 Multi-Agent

单 Agent 面临的瓶颈：
- **上下文窗口有限**：复杂任务的信息量超出单个 LLM 的处理能力
- **能力单一**：一个 Agent 难以精通所有领域
- **可靠性风险**：单点故障导致整个任务失败
- **效率低下**：串行处理无法利用并行性

Multi-Agent 的优势：
- **专业分工**：每个 Agent 专注于自己擅长的领域
- **并行执行**：独立子任务可以同时进行
- **上下文隔离**：每个 Agent 有干净的上下文窗口
- **容错性**：单个 Agent 失败不影响整体

---

## 9.2 Google ADK 三原语

Google Agent Development Kit 提供了三个基础编排原语：

### 9.2.1 SequentialAgent

```typescript
// 顺序执行：A → B → C
class SequentialAgent {
  constructor(private agents: Agent[]) {}

  async execute(input: string): Promise<string> {
    let result = input;
    for (const agent of this.agents) {
      result = await agent.run(result);
    }
    return result;
  }
}

// 示例：研究报告生成流水线
const reportPipeline = new SequentialAgent([
  new ResearchAgent(),      // 1. 搜索收集信息
  new AnalysisAgent(),      // 2. 分析整理
  new WritingAgent(),       // 3. 撰写报告
  new ReviewAgent(),        // 4. 审阅修改
]);
```

### 9.2.2 ParallelAgent

```typescript
// 并行执行：A, B, C 同时运行
class ParallelAgent {
  constructor(private agents: Agent[]) {}

  async execute(input: string): Promise<string[]> {
    return Promise.all(
      this.agents.map(agent => agent.run(input))
    );
  }
}

// 示例：多源信息并行收集
const infoGatherer = new ParallelAgent([
  new WebSearchAgent(),     // 搜索网页
  new DatabaseAgent(),      // 查询数据库
  new DocumentAgent(),      // 搜索文档库
]);
```

### 9.2.3 LoopAgent

```typescript
// 循环执行直到满足条件
class LoopAgent {
  constructor(
    private agent: Agent,
    private maxIterations: number = 5,
    private shouldStop: (result: string) => boolean,
  ) {}

  async execute(input: string): Promise<string> {
    let result = input;
    for (let i = 0; i < this.maxIterations; i++) {
      result = await this.agent.run(result);
      if (this.shouldStop(result)) break;
    }
    return result;
  }
}

// 示例：代码质量迭代改进
const codeRefiner = new LoopAgent(
  new CodeReviewAgent(),
  3,
  (result) => JSON.parse(result).qualityScore > 0.9,
);
```

---

## 9.3 通信机制

### 9.3.1 直接消息传递

```typescript
interface AgentMessage {
  from: string;
  to: string;
  content: string;
  type: 'task' | 'result' | 'feedback' | 'status';
}

class DirectMessageBus {
  private handlers = new Map<string, (msg: AgentMessage) => void>();

  register(agentId: string, handler: (msg: AgentMessage) => void): void {
    this.handlers.set(agentId, handler);
  }

  send(msg: AgentMessage): void {
    const handler = this.handlers.get(msg.to);
    if (handler) handler(msg);
  }
}
```

### 9.3.2 共享黑板

```typescript
class Blackboard {
  private data = new Map<string, { value: unknown; author: string; timestamp: number }>();

  write(key: string, value: unknown, author: string): void {
    this.data.set(key, { value, author, timestamp: Date.now() });
  }

  read(key: string): unknown {
    return this.data.get(key)?.value;
  }

  subscribe(pattern: string, callback: (key: string, value: unknown) => void): void {
    // 实现发布-订阅模式
  }
}
```

### 9.3.3 事件流

```typescript
class EventStream {
  private subscribers = new Map<string, Array<(event: any) => void>>();

  publish(topic: string, event: any): void {
    const subs = this.subscribers.get(topic) ?? [];
    subs.forEach(cb => cb(event));
  }

  subscribe(topic: string, callback: (event: any) => void): void {
    const subs = this.subscribers.get(topic) ?? [];
    subs.push(callback);
    this.subscribers.set(topic, subs);
  }
}
```

---

## 9.4 本章小结

1. Multi-Agent 通过**专业分工**和**并行执行**突破单 Agent 瓶颈
2. ADK 三原语（Sequential/Parallel/Loop）是构建复杂编排的基础
3. 三种通信机制各有适用场景：直接消息（点对点）、黑板（共享状态）、事件流（发布订阅）

---

> **延伸阅读**
> - Google, "Agent Development Kit Documentation" (2025)
> - Yoav Shoham, "Multi-Agent Systems" (Cambridge Press)

interface Agent { run(input: string): Promise<string>; }
class ResearchAgent implements Agent { async run(i: string) { return i; } }
class AnalysisAgent implements Agent { async run(i: string) { return i; } }
class WritingAgent implements Agent { async run(i: string) { return i; } }
class ReviewAgent implements Agent { async run(i: string) { return i; } }
class WebSearchAgent implements Agent { async run(i: string) { return i; } }
class DatabaseAgent implements Agent { async run(i: string) { return i; } }
class DocumentAgent implements Agent { async run(i: string) { return i; } }
class CodeReviewAgent implements Agent { async run(i: string) { return i; } }
