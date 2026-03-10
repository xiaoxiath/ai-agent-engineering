# 第六章：工具系统设计 — Agent 的手和脚

> "工具是 Agent 与真实世界的接口。好的工具设计让 Agent 如虎添翼，差的工具设计让 Agent 举步维艰。"

---

## 6.1 Agent-Computer Interface (ACI) 设计哲学

Anthropic 提出的 ACI 概念强调：设计工具接口时，要像设计人机界面（HCI）一样仔细。

### 6.1.1 工具设计三原则

1. **直觉性**：工具名和参数名应该自解释
2. **安全性**：内置 Poka-Yoke（防错设计）
3. **简洁性**：合并相关操作，减少工具数量

### 6.1.2 命名规范

```typescript
// ✅ 好的命名: service_resource_action
const goodNames = [
  'github_repo_search',
  'slack_message_send',
  'database_user_query',
  'file_content_read',
];

// ❌ 差的命名
const badNames = [
  'doSearch',      // 太模糊
  'api_call',      // 没有语义
  'process_data',  // 不具体
  'helper',        // 毫无意义
];

// 命名验证器
class ToolNameValidator {
  private static PATTERN = /^[a-z]+_[a-z]+_[a-z]+$/;

  static validate(name: string): { valid: boolean; suggestion?: string } {
    if (!this.PATTERN.test(name)) {
      return {
        valid: false,
        suggestion: `命名应遵循 service_resource_action 格式，例如: github_repo_search`,
      };
    }
    return { valid: true };
  }
}
```

---

## 6.2 三段式工具描述

每个工具应该有三段式的描述：

```typescript
const toolDefinition = {
  name: 'database_user_query',
  description: `查询用户数据库中的用户信息。

何时使用：当需要查找用户的注册信息、订单历史或账户状态时。
何时不用：查找产品信息请用 catalog_product_search。

返回包含用户基本信息和最近 10 条订单的 JSON 对象。`,
  parameters: {
    type: 'object',
    properties: {
      user_id: {
        type: 'string',
        description: '用户 ID（格式: USR-XXXXX）。可从对话上下文或 auth_session_verify 获取。',
      },
      include_orders: {
        type: 'boolean',
        description: '是否包含订单历史，默认 true',
        default: true,
      },
    },
    required: ['user_id'],
  },
};
```

---

## 6.3 Poka-Yoke 防错设计

```typescript
import { z } from 'zod';

class PokayokeValidator {
  private rules: Array<{
    name: string;
    check: (toolName: string, args: Record<string, unknown>) => string | null;
  }> = [
    {
      name: 'destructive_operation_guard',
      check: (name, args) => {
        const destructive = ['delete', 'remove', 'drop', 'truncate'];
        if (destructive.some(d => name.includes(d)) && !args.confirm) {
          return `破坏性操作 "${name}" 需要 confirm=true 参数`;
        }
        return null;
      },
    },
    {
      name: 'path_traversal_guard',
      check: (_name, args) => {
        const path = args.path || args.file_path;
        if (typeof path === 'string' && path.includes('..')) {
          return `路径参数不允许包含 ".." (路径遍历风险)`;
        }
        return null;
      },
    },
    {
      name: 'sql_injection_guard',
      check: (_name, args) => {
        const query = args.query;
        if (typeof query === 'string') {
          const dangerous = ['; DROP', '; DELETE', 'UNION SELECT', '1=1'];
          for (const pattern of dangerous) {
            if (query.toUpperCase().includes(pattern)) {
              return `SQL 查询包含可疑模式: "${pattern}"`;
            }
          }
        }
        return null;
      },
    },
  ];

  validate(toolName: string, args: Record<string, unknown>): {
    passed: boolean;
    violations: string[];
  } {
    const violations: string[] = [];
    for (const rule of this.rules) {
      const error = rule.check(toolName, args);
      if (error) violations.push(`[${rule.name}] ${error}`);
    }
    return { passed: violations.length === 0, violations };
  }
}
```

---

## 6.4 动态工具注册与 MCP

```typescript
class DynamicToolRegistry {
  private tools = new Map<string, ToolHandler>();

  register(name: string, handler: ToolHandler): void {
    this.tools.set(name, handler);
  }

  // 从 MCP Server 动态加载工具
  async loadFromMCP(serverUrl: string): Promise<void> {
    const mcpClient = new MCPClient(serverUrl);
    const toolList = await mcpClient.listTools();
    for (const tool of toolList) {
      this.register(tool.name, {
        definition: tool,
        execute: (args: unknown) => mcpClient.callTool(tool.name, args),
      });
    }
    console.log(`从 MCP Server 加载了 ${toolList.length} 个工具`);
  }

  getAvailableTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(h => h.definition);
  }

  async execute(name: string, args: unknown): Promise<unknown> {
    const handler = this.tools.get(name);
    if (!handler) throw new Error(`未知工具: ${name}`);
    return handler.execute(args);
  }
}

interface ToolHandler {
  definition: ToolDefinition;
  execute: (args: unknown) => Promise<unknown>;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

class MCPClient {
  constructor(private serverUrl: string) {}
  async listTools(): Promise<ToolDefinition[]> { return []; }
  async callTool(name: string, args: unknown): Promise<unknown> { return {}; }
}
```

---

## 6.5 工具编排

```typescript
class ToolOrchestrator {
  constructor(private registry: DynamicToolRegistry) {}

  // 顺序执行工具链
  async executeChain(steps: Array<{ tool: string; args: unknown }>): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const step of steps) {
      const result = await this.registry.execute(step.tool, step.args);
      results.push(result);
    }
    return results;
  }

  // 并行执行无依赖的工具调用
  async executeParallel(calls: Array<{ tool: string; args: unknown }>): Promise<unknown[]> {
    return Promise.all(
      calls.map(call => this.registry.execute(call.tool, call.args))
    );
  }
}
```

---

## 6.6 本章小结

1. **ACI 设计哲学**：像设计 UI 一样设计工具接口
2. **service_resource_action 命名**：清晰、一致、可预测
3. **三段式描述**：做什么 + 何时用/不用 + 返回什么
4. **Poka-Yoke 防错**：在工具层面内置安全检查
5. **MCP 集成**：通过标准协议动态加载外部工具
6. **工具编排**：支持顺序和并行的工具链执行
