# 第二十一章：生态系统与平台集成

> "Agent 的价值在于与现有系统和服务的无缝集成。"

---

## 21.1 平台适配器模式

```typescript
interface PlatformAdapter {
  name: string;
  connect(config: Record<string, string>): Promise<void>;
  listTools(): Promise<ToolDefinition[]>;
  executeTool(name: string, args: unknown): Promise<unknown>;
  disconnect(): Promise<void>;
}

class SlackAdapter implements PlatformAdapter {
  name = 'slack';
  async connect(config: Record<string, string>): Promise<void> {
    console.log('Connected to Slack');
  }
  async listTools(): Promise<ToolDefinition[]> {
    return [
      { name: 'slack_message_send', description: '发送 Slack 消息', parameters: {} },
      { name: 'slack_channel_list', description: '列出 Slack 频道', parameters: {} },
    ];
  }
  async executeTool(name: string, args: unknown): Promise<unknown> { return {}; }
  async disconnect(): Promise<void> {}
}

interface ToolDefinition { name: string; description: string; parameters: Record<string, unknown>; }
```

---

## 21.2 模型路由

```typescript
class ModelRouter {
  private models = new Map<string, { endpoint: string; apiKey: string }>();

  register(name: string, config: { endpoint: string; apiKey: string }): void {
    this.models.set(name, config);
  }

  async route(task: string): Promise<string> {
    const complexity = await this.assessComplexity(task);
    if (complexity === 'simple') return 'gemini-flash';
    if (complexity === 'moderate') return 'claude-haiku';
    return 'claude-sonnet';
  }

  private async assessComplexity(task: string): Promise<string> { return 'moderate'; }
}
```

---

## 21.3 Agent 注册中心

```typescript
class AgentRegistry {
  private agents = new Map<string, {
    id: string;
    name: string;
    capabilities: string[];
    endpoint: string;
    status: 'active' | 'inactive';
  }>();

  register(agent: { id: string; name: string; capabilities: string[]; endpoint: string }): void {
    this.agents.set(agent.id, { ...agent, status: 'active' });
  }

  discover(capability: string): Array<{ id: string; name: string; endpoint: string }> {
    return Array.from(this.agents.values())
      .filter(a => a.status === 'active' && a.capabilities.includes(capability))
      .map(({ id, name, endpoint }) => ({ id, name, endpoint }));
  }
}
```

---

## 21.4 Agent Mesh 架构

```
┌─────────────────────────────────────────────┐
│              Agent Mesh                      │
│                                              │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐   │
│  │Agent1│  │Agent2│  │Agent3│  │Agent4│   │
│  └──┬───┘  └──┬───┘  └──┬───┘  └──┬───┘   │
│     │         │         │         │         │
│  ┌──┴─────────┴─────────┴─────────┴──┐     │
│  │       Service Mesh (Sidecar)       │     │
│  │  - 服务发现  - 负载均衡  - 熔断    │     │
│  │  - 认证授权  - 可观测性  - 限流    │     │
│  └───────────────────────────────────┘     │
└─────────────────────────────────────────────┘
```

---

## 21.5 本章小结

1. **平台适配器**模式统一不同平台的集成接口
2. **模型路由**根据任务复杂度选择最优模型
3. **Agent 注册中心**实现动态服务发现
4. **Agent Mesh** 提供企业级的服务治理能力
