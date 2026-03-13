/**
 * 示例 01: 基本 Agent 循环
 * 对应章节: 第3章 - 架构全景
 *
 * 演示最基础的 ReAct Agent Loop 实现
 */

import OpenAI from 'openai';
import { evaluate } from 'mathjs';

// ============================================================
// 类型定义
// ============================================================

interface Tool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (params: any) => Promise<string>;
}

interface AgentConfig {
  model: string;
  systemPrompt: string;
  tools: Tool[];
  maxIterations: number;
}

interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: any[];
}

// ============================================================
// 工具定义
// ============================================================

const calculatorTool: Tool = {
  name: 'calculator',
  description: 'Perform mathematical calculations. Input should be a valid math expression.',
  parameters: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'Math expression to evaluate, e.g., "2 + 3 * 4"' }
    },
    required: ['expression']
  },
  execute: async (params: { expression: string }) => {
    try {
      // 安全的数学表达式求值 —— 使用 mathjs，仅支持数学运算，无法执行任意 JS
      const result = evaluate(params.expression);
      return `Result: ${result}`;
    } catch (error) {
      return `Error: Invalid expression "${params.expression}"`;
    }
  }
};

const searchTool: Tool = {
  name: 'search',
  description: 'Search for information on a given topic. Returns relevant snippets.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' }
    },
    required: ['query']
  },
  execute: async (params: { query: string }) => {
    // 模拟搜索结果
    return `Search results for "${params.query}":\n1. [Simulated] Relevant information about ${params.query}.\n2. [Simulated] Additional details on the topic.`;
  }
};

// ============================================================
// Agent 核心循环
// ============================================================

class BasicAgent {
  private client: OpenAI;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.client = new OpenAI();
    this.config = config;
  }

  async run(userMessage: string): Promise<string> {
    const messages: Message[] = [
      { role: 'system', content: this.config.systemPrompt },
      { role: 'user', content: userMessage }
    ];

    // Agent Loop: 最多迭代 maxIterations 次
    for (let i = 0; i < this.config.maxIterations; i++) {
      console.log(`\n--- Iteration ${i + 1} ---`);

      // 1. 调用 LLM
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: messages as any,
        tools: this.config.tools.map(t => ({
          type: 'function' as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters
          }
        })),
        tool_choice: 'auto'
      });

      const choice = response.choices[0];
      const assistantMessage = choice.message;

      // 将 assistant 消息加入历史
      messages.push({
        role: 'assistant',
        content: assistantMessage.content || '',
        tool_calls: assistantMessage.tool_calls
      });

      // 2. 检查是否需要调用工具
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        // 没有工具调用 = Agent 认为任务完成
        console.log('Agent completed (no more tool calls)');
        return assistantMessage.content || '';
      }

      // 3. 执行工具调用
      for (const toolCall of assistantMessage.tool_calls) {
        const tool = this.config.tools.find(t => t.name === toolCall.function.name);
        if (!tool) {
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `Error: Unknown tool "${toolCall.function.name}"`
          });
          continue;
        }

        console.log(`Calling tool: ${tool.name}(${toolCall.function.arguments})`);
        const params = JSON.parse(toolCall.function.arguments);
        const result = await tool.execute(params);
        console.log(`Tool result: ${result}`);

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result
        });
      }
    }

    return 'Agent reached maximum iterations without completing the task.';
  }
}

// ============================================================
// 主程序
// ============================================================

async function main() {
  const agent = new BasicAgent({
    model: 'gpt-4o-mini',
    systemPrompt: `You are a helpful assistant. Use the provided tools when needed.
Think step by step and use tools to gather information before answering.`,
    tools: [calculatorTool, searchTool],
    maxIterations: 5
  });

  console.log('=== Basic Agent Loop Demo ===\n');

  const question = 'What is 15% of 2847, rounded to the nearest integer?';
  console.log(`User: ${question}`);

  const answer = await agent.run(question);
  console.log(`\nAgent: ${answer}`);
}

main().catch(console.error);
