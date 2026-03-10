# 第二十章：协议 — MCP, A2A, ACP

> "标准协议让 Agent 生态从孤岛走向互联。"

---

## 20.1 MCP (Model Context Protocol)

### 20.1.1 核心概念

MCP 是 Anthropic 于 2024 年底推出的开放标准，定义了 AI 模型与外部工具/数据源之间的通信协议。

```
┌──────────────┐     MCP      ┌──────────────┐
│  LLM / Agent │ ◄──────────► │  MCP Server  │
│  (MCP Client)│              │  (工具提供方)  │
└──────────────┘              └──────────────┘
```

三大原语：
- **Tools**: Agent 可以调用的操作
- **Resources**: Agent 可以读取的数据
- **Prompts**: 预定义的提示词模板

### 20.1.2 MCP Server 示例

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const server = new McpServer({ name: 'weather-server', version: '1.0.0' });

// 注册工具
server.tool(
  'get_weather',
  '获取指定城市的天气信息',
  { city: z.string().describe('城市名称') },
  async ({ city }) => {
    const weather = await fetchWeather(city);
    return { content: [{ type: 'text', text: JSON.stringify(weather) }] };
  }
);

// 注册资源
server.resource(
  'weather://forecast/{city}',
  '城市天气预报',
  async (uri) => {
    const city = uri.pathname.split('/').pop()!;
    return { contents: [{ uri, text: await getForecast(city), mimeType: 'application/json' }] };
  }
);

async function fetchWeather(city: string) { return { city, temp: 25, condition: 'sunny' }; }
async function getForecast(city: string) { return JSON.stringify({ city, forecast: [] }); }
```

---

## 20.2 A2A (Agent2Agent Protocol)

Google 于 2025 年推出的 Agent 间通信标准：

### 20.2.1 Agent Card

```json
{
  "name": "DataAnalyst",
  "description": "专业数据分析 Agent",
  "url": "https://agent.example.com",
  "capabilities": {
    "streaming": true,
    "pushNotifications": true
  },
  "skills": [
    { "id": "sql_analysis", "name": "SQL 数据分析" },
    { "id": "chart_generation", "name": "图表生成" }
  ],
  "authentication": {
    "type": "oauth2",
    "authorizationUrl": "https://auth.example.com/authorize"
  }
}
```

### 20.2.2 Task 生命周期

```
submitted → working → completed
                   ↘ failed
                   ↘ input-needed (等待更多输入)
```

---

## 20.3 ACP (Agent Communication Protocol)

IBM 等企业推动的 Agent 通信协议，强调企业级安全和可审计性。

---

## 20.4 三协议对比

| 维度 | MCP | A2A | ACP |
|------|-----|-----|-----|
| 主导方 | Anthropic | Google | IBM 联盟 |
| 定位 | Agent ↔ 工具 | Agent ↔ Agent | Agent ↔ Agent |
| 类比 | USB-C | HTTP | Enterprise Service Bus |
| 传输 | JSON-RPC / stdio / HTTP+SSE | HTTP + JSON | HTTP + JSON |
| 流式支持 | SSE | SSE | 是 |
| 安全模型 | 基础 | OAuth2 + Agent Card | 企业级 |
| 成熟度 | 高（广泛采用） | 中（新发布） | 低（早期） |

---

## 20.5 本章小结

1. **MCP** 解决 Agent 与工具的集成问题（Agent ↔ Tool）
2. **A2A** 解决 Agent 之间的互发现和通信（Agent ↔ Agent）
3. **ACP** 面向企业级场景，强调安全与合规
4. 三者互补而非竞争，可以在同一系统中组合使用
