/**
 * 示例 06: MCP Server 实现
 * 对应章节: 第20章 - 协议与互操作
 *
 * 演示一个简单的 MCP (Model Context Protocol) 服务端
 */

import { z } from 'zod';

// ============================================================
// MCP Server 简化实现
// ============================================================

interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: (params: any) => Promise<MCPContent[]>;
}

interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  handler: (uri: string) => Promise<MCPContent[]>;
}

interface MCPContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

class SimpleMCPServer {
  private name: string;
  private version: string;
  private tools: Map<string, MCPTool> = new Map();
  private resources: Map<string, MCPResource> = new Map();

  constructor(name: string, version: string) {
    this.name = name;
    this.version = version;
  }

  // 注册工具
  tool(
    name: string,
    description: string,
    schema: Record<string, any>,
    handler: (params: any) => Promise<MCPContent[]>
  ): void {
    this.tools.set(name, { name, description, inputSchema: schema, handler });
    console.log(`[MCP] Registered tool: ${name}`);
  }

  // 注册资源
  resource(
    uriTemplate: string,
    name: string,
    description: string,
    handler: (uri: string) => Promise<MCPContent[]>
  ): void {
    this.resources.set(uriTemplate, {
      uri: uriTemplate,
      name,
      description,
      mimeType: 'application/json',
      handler
    });
    console.log(`[MCP] Registered resource: ${uriTemplate}`);
  }

  // 处理 JSON-RPC 请求
  async handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    try {
      switch (request.method) {
        case 'initialize':
          return this.handleInitialize(request);
        case 'tools/list':
          return this.handleToolsList(request);
        case 'tools/call':
          return this.handleToolsCall(request);
        case 'resources/list':
          return this.handleResourcesList(request);
        case 'resources/read':
          return this.handleResourcesRead(request);
        default:
          return { jsonrpc: '2.0', id: request.id, error: { code: -32601, message: `Unknown method: ${request.method}` } };
      }
    } catch (error) {
      return { jsonrpc: '2.0', id: request.id, error: { code: -32603, message: (error as Error).message } };
    }
  }

  private handleInitialize(req: JSONRPCRequest): JSONRPCResponse {
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: true }, resources: { subscribe: false } },
        serverInfo: { name: this.name, version: this.version }
      }
    };
  }

  private handleToolsList(req: JSONRPCRequest): JSONRPCResponse {
    const tools = Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
    }));
    return { jsonrpc: '2.0', id: req.id, result: { tools } };
  }

  private async handleToolsCall(req: JSONRPCRequest): Promise<JSONRPCResponse> {
    const { name, arguments: args } = req.params!;
    const tool = this.tools.get(name);
    if (!tool) {
      return { jsonrpc: '2.0', id: req.id, error: { code: -32602, message: `Unknown tool: ${name}` } };
    }

    const content = await tool.handler(args);
    return { jsonrpc: '2.0', id: req.id, result: { content } };
  }

  private handleResourcesList(req: JSONRPCRequest): JSONRPCResponse {
    const resources = Array.from(this.resources.values()).map(r => ({
      uri: r.uri, name: r.name, description: r.description, mimeType: r.mimeType
    }));
    return { jsonrpc: '2.0', id: req.id, result: { resources } };
  }

  private async handleResourcesRead(req: JSONRPCRequest): Promise<JSONRPCResponse> {
    const { uri } = req.params!;
    const resource = this.findMatchingResource(uri);
    if (!resource) {
      return { jsonrpc: '2.0', id: req.id, error: { code: -32602, message: `Resource not found: ${uri}` } };
    }

    const contents = await resource.handler(uri);
    return { jsonrpc: '2.0', id: req.id, result: { contents } };
  }

  private findMatchingResource(uri: string): MCPResource | undefined {
    return Array.from(this.resources.values()).find(r => {
      const pattern = r.uri.replace(/\{[^}]+\}/g, '[^/]+');
      return new RegExp(`^${pattern}$`).test(uri);
    });
  }
}

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: { code: number; message: string };
}

// ============================================================
// 创建示例 MCP Server: 天气服务
// ============================================================

function createWeatherServer(): SimpleMCPServer {
  const server = new SimpleMCPServer('weather-service', '1.0.0');

  // 注册天气查询工具
  server.tool(
    'weather_current_get',
    `Get the current weather for a city.
Use this when the user asks about current weather conditions.
Returns temperature, humidity, and condition description.`,
    {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name, e.g., "Beijing"' },
        units: { type: 'string', enum: ['celsius', 'fahrenheit'], default: 'celsius' }
      },
      required: ['city']
    },
    async (params: { city: string; units?: string }) => {
      // 模拟天气 API
      const weather = {
        city: params.city,
        temperature: 25,
        units: params.units || 'celsius',
        humidity: 65,
        condition: 'Sunny',
        wind: '10 km/h NE'
      };
      return [{ type: 'text', text: JSON.stringify(weather, null, 2) }];
    }
  );

  // 注册天气预报工具
  server.tool(
    'weather_forecast_get',
    `Get weather forecast for the next N days.
Use this when the user asks about future weather.
Returns an array of daily forecasts.`,
    {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' },
        days: { type: 'number', minimum: 1, maximum: 7, default: 3 }
      },
      required: ['city']
    },
    async (params: { city: string; days?: number }) => {
      const days = params.days || 3;
      const forecast = Array.from({ length: days }, (_, i) => ({
        date: new Date(Date.now() + (i + 1) * 86400000).toISOString().split('T')[0],
        high: 25 + Math.floor(Math.random() * 10),
        low: 15 + Math.floor(Math.random() * 5),
        condition: ['Sunny', 'Cloudy', 'Rain'][Math.floor(Math.random() * 3)]
      }));
      return [{ type: 'text', text: JSON.stringify(forecast, null, 2) }];
    }
  );

  // 注册天气资源
  server.resource(
    'weather://{city}/current',
    'Current Weather',
    'Current weather data for a specific city',
    async (uri: string) => {
      const city = uri.split('/')[2];
      return [{ type: 'text', text: JSON.stringify({ city, temp: 25, condition: 'Sunny' }) }];
    }
  );

  return server;
}

// ============================================================
// 演示
// ============================================================

async function main() {
  console.log('=== MCP Server Demo ===\n');

  const server = createWeatherServer();

  // 1. 初始化
  console.log('--- Initialize ---');
  const initResp = await server.handleRequest({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2024-11-05', clientInfo: { name: 'demo', version: '1.0' } }
  });
  console.log('Server:', JSON.stringify(initResp.result?.serverInfo));

  // 2. 列出工具
  console.log('\n--- List Tools ---');
  const toolsResp = await server.handleRequest({
    jsonrpc: '2.0', id: 2, method: 'tools/list'
  });
  const tools = toolsResp.result?.tools || [];
  tools.forEach((t: any) => console.log(`  - ${t.name}: ${t.description.split('\n')[0]}`));

  // 3. 调用工具
  console.log('\n--- Call Tool: weather_current_get ---');
  const callResp = await server.handleRequest({
    jsonrpc: '2.0', id: 3, method: 'tools/call',
    params: { name: 'weather_current_get', arguments: { city: 'Beijing', units: 'celsius' } }
  });
  console.log('Result:', callResp.result?.content[0]?.text);

  // 4. 读取资源
  console.log('\n--- Read Resource ---');
  const resourceResp = await server.handleRequest({
    jsonrpc: '2.0', id: 4, method: 'resources/read',
    params: { uri: 'weather://Shanghai/current' }
  });
  console.log('Result:', resourceResp.result?.contents[0]?.text);
}

main().catch(console.error);
