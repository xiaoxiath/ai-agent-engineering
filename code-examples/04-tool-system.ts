/**
 * 示例 04: 工具系统设计
 * 对应章节: 第6章 - 工具系统设计与 ACI
 *
 * 演示 ACI 设计原则和防错工具设计
 */

import { z } from 'zod';

// ============================================================
// ACI: Agent-Computer Interface 设计
// ============================================================

/** 工具命名规范: service_resource_action */
interface ToolDefinition {
  name: string;           // e.g., "github_issue_create"
  description: string;    // 三段式: 功能 + 时机 + 返回值
  parameters: z.ZodType;
  execute: (params: any) => Promise<ToolResponse>;
}

interface ToolResponse {
  success: boolean;
  data?: any;
  error?: string;
}

// ============================================================
// Poka-Yoke: 防错设计
// ============================================================

class PokayokeValidator {
  /**
   * 工具名称验证: 必须遵循 service_resource_action 格式
   */
  static validateToolName(name: string): { valid: boolean; suggestion?: string } {
    const pattern = /^[a-z]+_[a-z]+_[a-z]+$/;
    if (pattern.test(name)) {
      return { valid: true };
    }

    // 自动修正建议
    const parts = name.split(/[-_.\s]+/).filter(Boolean);
    if (parts.length >= 2) {
      const suggestion = parts.join('_').toLowerCase();
      return { valid: false, suggestion };
    }

    return { valid: false, suggestion: `${name.toLowerCase()}_resource_action` };
  }

  /**
   * 参数验证: 阻止危险操作
   */
  static validateParams(
    params: any,
    schema: z.ZodType,
    constraints?: ParameterConstraint[]
  ): ValidationResult {
    // Zod 结构验证
    const zodResult = schema.safeParse(params);
    if (!zodResult.success) {
      return {
        valid: false,
        errors: zodResult.error.issues.map(i => i.message)
      };
    }

    // 自定义约束验证
    if (constraints) {
      for (const constraint of constraints) {
        const result = constraint.check(params);
        if (!result.passed) {
          return { valid: false, errors: [result.message] };
        }
      }
    }

    return { valid: true, errors: [] };
  }
}

interface ParameterConstraint {
  name: string;
  check: (params: any) => { passed: boolean; message: string };
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================================
// 工具注册表
// ============================================================

class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    // 验证工具名称
    const nameCheck = PokayokeValidator.validateToolName(tool.name);
    if (!nameCheck.valid) {
      console.warn(`Tool name "${tool.name}" doesn't follow convention. Suggestion: ${nameCheck.suggestion}`);
    }

    this.tools.set(tool.name, tool);
    console.log(`Registered tool: ${tool.name}`);
  }

  async execute(toolName: string, params: any): Promise<ToolResponse> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${toolName}` };
    }

    // 参数验证
    const validation = PokayokeValidator.validateParams(params, tool.parameters);
    if (!validation.valid) {
      return { success: false, error: `Validation failed: ${validation.errors.join(', ')}` };
    }

    // 执行并计时
    const start = Date.now();
    try {
      const result = await tool.execute(params);
      const duration = Date.now() - start;
      console.log(`Tool ${toolName} completed in ${duration}ms`);
      return result;
    } catch (error) {
      return { success: false, error: `Execution error: ${(error as Error).message}` };
    }
  }

  // 生成 LLM 可用的工具描述
  getToolDescriptions(): any[] {
    return Array.from(this.tools.values()).map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: this.zodToJsonSchema(tool.parameters)
      }
    }));
  }

  private zodToJsonSchema(schema: z.ZodType): any {
    // 简化实现
    return { type: 'object', properties: {} };
  }
}

// ============================================================
// 具体工具实现示例
// ============================================================

const fileReadTool: ToolDefinition = {
  name: 'filesystem_file_read',
  description: `Read the contents of a file from the workspace.
Use this when you need to examine file contents for analysis or modification.
Returns the file content as a string, or an error if the file doesn't exist.`,
  parameters: z.object({
    path: z.string()
      .describe('Relative path to the file within the workspace')
      .refine(p => !p.includes('..'), 'Path traversal not allowed')
      .refine(p => !p.startsWith('/'), 'Must be a relative path'),
    encoding: z.enum(['utf-8', 'ascii', 'binary']).default('utf-8')
      .describe('File encoding, defaults to utf-8')
  }),
  execute: async (params: { path: string; encoding: string }) => {
    console.log(`[filesystem_file_read] Reading: ${params.path}`);
    // 模拟文件读取
    return {
      success: true,
      data: {
        content: `// Contents of ${params.path}\nconsole.log("Hello World");`,
        size: 42,
        encoding: params.encoding
      }
    };
  }
};

const databaseQueryTool: ToolDefinition = {
  name: 'database_query_execute',
  description: `Execute a read-only SQL query against the database.
Use this when you need to retrieve data for analysis. Only SELECT queries are allowed.
Returns query results as an array of objects.`,
  parameters: z.object({
    query: z.string()
      .describe('SQL SELECT query to execute')
      .refine(q => q.trim().toUpperCase().startsWith('SELECT'), 'Only SELECT queries allowed')
      .refine(q => !q.toUpperCase().includes('DROP'), 'DROP statements not allowed'),
    limit: z.number().min(1).max(1000).default(100)
      .describe('Maximum number of rows to return, default 100')
  }),
  execute: async (params: { query: string; limit: number }) => {
    console.log(`[database_query_execute] Query: ${params.query} (limit: ${params.limit})`);
    return {
      success: true,
      data: {
        rows: [{ id: 1, name: 'Example', value: 42 }],
        rowCount: 1,
        executionTime: 15
      }
    };
  }
};

// ============================================================
// 演示
// ============================================================

async function main() {
  console.log('=== Tool System Demo ===\n');

  const registry = new ToolRegistry();

  // 注册工具
  registry.register(fileReadTool);
  registry.register(databaseQueryTool);

  // 测试工具名称验证
  console.log('\n--- Name Validation ---');
  console.log(PokayokeValidator.validateToolName('github_issue_create'));   // valid
  console.log(PokayokeValidator.validateToolName('searchGoogle'));          // invalid
  console.log(PokayokeValidator.validateToolName('file-read'));             // invalid

  // 正常执行
  console.log('\n--- Normal Execution ---');
  const result1 = await registry.execute('filesystem_file_read', {
    path: 'src/index.ts',
    encoding: 'utf-8'
  });
  console.log('Result:', JSON.stringify(result1, null, 2));

  // 防错：路径穿越
  console.log('\n--- Safety: Path Traversal ---');
  const result2 = await registry.execute('filesystem_file_read', {
    path: '../../etc/passwd'
  });
  console.log('Result:', JSON.stringify(result2, null, 2));

  // 防错：非 SELECT 查询
  console.log('\n--- Safety: Non-SELECT Query ---');
  const result3 = await registry.execute('database_query_execute', {
    query: 'DROP TABLE users'
  });
  console.log('Result:', JSON.stringify(result3, null, 2));
}

main().catch(console.error);
