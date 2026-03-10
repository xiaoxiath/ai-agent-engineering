# 第十一章：框架对比与选型

> "没有最好的框架，只有最适合你场景的框架。"

---

## 11.1 主流框架概览

| 框架 | 开发商 | 语言 | 核心特色 | Star |
|------|--------|------|---------|------|
| Google ADK | Google | Python | 三原语编排、A2A 原生 | 新发布 |
| LangGraph | LangChain | Python/JS | 图驱动状态机 | 7k+ |
| CrewAI | CrewAI | Python | 角色扮演、流程模板 | 22k+ |
| AutoGen | Microsoft | Python | 多 Agent 对话 | 35k+ |
| OpenAI Agents SDK | OpenAI | Python | Handoffs、Guardrails | 新发布 |

---

## 11.2 框架抽象层

```typescript
// 统一的框架抽象接口
interface IFrameworkAbstraction {
  // 创建 Agent
  createAgent(config: AgentConfig): Promise<AgentInstance>;
  // 创建编排
  createOrchestration(pattern: string, agents: AgentInstance[]): Promise<Orchestration>;
  // 执行任务
  execute(orchestration: Orchestration, input: string): Promise<ExecutionResult>;
}

interface AgentConfig {
  name: string;
  role: string;
  model: string;
  tools: ToolDefinition[];
  systemPrompt: string;
}

interface AgentInstance { id: string; config: AgentConfig; }
interface Orchestration { id: string; pattern: string; agents: AgentInstance[]; }
interface ExecutionResult { output: string; metrics: { tokens: number; duration: number }; }
```

---

## 11.3 各框架适配器

### 11.3.1 Google ADK

```typescript
class ADKAdapter implements IFrameworkAbstraction {
  async createAgent(config: AgentConfig): Promise<AgentInstance> {
    // ADK Agent 创建
    return { id: `adk-${config.name}`, config };
  }

  async createOrchestration(pattern: string, agents: AgentInstance[]): Promise<Orchestration> {
    // 使用 ADK 原语
    return { id: `orch-${pattern}`, pattern, agents };
  }

  async execute(orch: Orchestration, input: string): Promise<ExecutionResult> {
    const start = Date.now();
    // 执行 ADK 编排
    return { output: '', metrics: { tokens: 0, duration: Date.now() - start } };
  }
}
```

### 11.3.2 LangGraph

```typescript
class LangGraphAdapter implements IFrameworkAbstraction {
  async createAgent(config: AgentConfig): Promise<AgentInstance> {
    // LangGraph 使用 StateGraph
    return { id: `lg-${config.name}`, config };
  }

  async createOrchestration(pattern: string, agents: AgentInstance[]): Promise<Orchestration> {
    // 构建 StateGraph with nodes and edges
    return { id: `orch-${pattern}`, pattern, agents };
  }

  async execute(orch: Orchestration, input: string): Promise<ExecutionResult> {
    const start = Date.now();
    return { output: '', metrics: { tokens: 0, duration: Date.now() - start } };
  }
}
```

---

## 11.4 选型决策函数

```typescript
function selectFramework(requirements: {
  language: 'python' | 'typescript' | 'both';
  complexity: 'simple' | 'moderate' | 'complex';
  teamSize: number;
  needsStreaming: boolean;
  needsCheckpointing: boolean;
  needsMultiAgent: boolean;
  preferredVendor?: string;
}): string {
  // TypeScript 项目
  if (requirements.language === 'typescript') {
    if (requirements.needsCheckpointing) return 'LangGraph.js';
    return 'Vercel AI SDK + 自定义编排';
  }

  // 简单场景
  if (requirements.complexity === 'simple') {
    return 'OpenAI Agents SDK';
  }

  // 需要复杂状态机
  if (requirements.needsCheckpointing || requirements.complexity === 'complex') {
    return 'LangGraph';
  }

  // 多 Agent 角色扮演
  if (requirements.needsMultiAgent && requirements.teamSize <= 3) {
    return 'CrewAI';
  }

  // Google 生态
  if (requirements.preferredVendor === 'google') {
    return 'Google ADK';
  }

  // 默认
  return 'LangGraph';
}
```

---

## 11.5 迁移策略

当需要从一个框架迁移到另一个时：

1. **抽象业务逻辑**：将 Agent 的核心逻辑与框架解耦
2. **统一接口**：使用上述 `IFrameworkAbstraction` 接口
3. **渐进迁移**：先迁移最简单的 Agent，再处理复杂编排
4. **双运行**：新旧框架并行运行，对比结果一致性

---

## 11.6 本章小结

1. 五大框架各有特色，没有绝对的优劣
2. **抽象层**帮助隔离业务逻辑与框架依赖
3. 选型应考虑语言、复杂度、团队规模等多个维度
4. 迁移时优先保证业务逻辑的独立性
