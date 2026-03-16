/**
 * shared/llm-client.ts — LLM 客户端接口与 Mock 实现
 *
 * 本书代码通过 LLMClient 接口抽象对 LLM 的调用，使示例代码与具体
 * 模型提供商解耦。MockLLMClient 用于离线运行示例代码。
 *
 * @see 附录 G.2.1 LLMClient
 */

import type {
  Message,
  ToolDefinition,
  ToolCall,
} from './types.js';

// ============================================================
// G.2.1 LLMClient — 大语言模型客户端接口
// ============================================================

/** LLM 响应结构 */
export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: 'stop' | 'tool_calls' | 'length' | 'content_filter';
}

/**
 * LLM 客户端接口
 *
 * 三种调用粒度：
 * - complete: 简单文本补全（提示 -> 文本）
 * - chat:     结构化对话（消息数组 -> 响应，支持工具调用）
 * - classify: 分类快捷方法（基于 LLM 的零样本分类）
 *
 * 框架映射：
 * - Vercel AI SDK: generateText / streamText
 * - LangChain:     BaseChatModel
 * - Mastra:        Agent.generate
 */
export interface LLMClient {
  /** 简单文本补全 */
  complete(prompt: string, maxTokens?: number): Promise<string>;

  /** 结构化对话 */
  chat(params: {
    messages: Message[];
    tools?: ToolDefinition[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<LLMResponse>;

  /** 零样本分类（便捷方法，可选实现） */
  classify?(
    input: string,
    options: { categories: string[] }
  ): Promise<string>;
}

// ============================================================
// MockLLMClient — 离线测试用 Mock 实现
// ============================================================

/**
 * Mock LLM 客户端 — 用于代码示例的离线运行和单元测试
 *
 * 行为说明：
 * - complete(): 返回对 prompt 的模板化回复
 * - chat():     若提供了 tools 且消息中包含触发关键词，模拟工具调用；
 *               否则返回普通文本回复
 * - classify(): 返回 categories 中第一个匹配项
 *
 * 生产环境中替换为 OpenAI / Anthropic SDK 的真实实现。
 */
export class MockLLMClient implements LLMClient {
  private callCount = 0;
  private toolCallResponses: Map<string, (messages: Message[]) => ToolCall[]>;

  constructor() {
    this.toolCallResponses = new Map();
  }

  /**
   * 注册自定义工具调用响应
   * 当 chat() 检测到对应关键词时返回预设的 ToolCall
   */
  registerToolCallPattern(
    keyword: string,
    generator: (messages: Message[]) => ToolCall[]
  ): void {
    this.toolCallResponses.set(keyword.toLowerCase(), generator);
  }

  async complete(prompt: string, maxTokens?: number): Promise<string> {
    this.callCount++;
    const truncated = prompt.slice(0, 100);
    return `[MockLLM] Response to: "${truncated}..." (call #${this.callCount}, maxTokens=${maxTokens ?? 'default'})`;
  }

  async chat(params: {
    messages: Message[];
    tools?: ToolDefinition[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<LLMResponse> {
    this.callCount++;

    const lastUserMessage = [...params.messages]
      .reverse()
      .find((m) => m.role === 'user');
    const userContent = lastUserMessage?.content?.toLowerCase() ?? '';

    // 估算 usage
    const promptTokens = params.messages.reduce(
      (sum, m) => sum + Math.ceil(m.content.length / 4),
      0
    );

    // 检查是否应触发工具调用
    if (params.tools && params.tools.length > 0) {
      // 检查自定义模式
      for (const [keyword, generator] of this.toolCallResponses) {
        if (userContent.includes(keyword)) {
          const toolCalls = generator(params.messages);
          return {
            content: '',
            toolCalls,
            usage: {
              promptTokens,
              completionTokens: 20,
              totalTokens: promptTokens + 20,
            },
            finishReason: 'tool_calls',
          };
        }
      }

      // 默认行为：如果有工具且是第一轮对话，模拟调用第一个工具
      const hasToolResults = params.messages.some(
        (m) => m.role === 'tool'
      );
      if (!hasToolResults && params.tools.length > 0) {
        const tool = params.tools[0];
        const mockArgs: Record<string, unknown> = {};
        for (const [key, schema] of Object.entries(
          tool.parameters.properties
        )) {
          mockArgs[key] =
            schema.type === 'number'
              ? 42
              : schema.type === 'boolean'
                ? true
                : `mock_${key}`;
        }

        return {
          content: '',
          toolCalls: [
            {
              id: `call_mock_${this.callCount}`,
              name: tool.name,
              arguments: mockArgs,
            },
          ],
          usage: {
            promptTokens,
            completionTokens: 30,
            totalTokens: promptTokens + 30,
          },
          finishReason: 'tool_calls',
        };
      }
    }

    // 普通文本回复
    const completionContent = `[MockLLM] Based on the conversation (${params.messages.length} messages), here is my response. (call #${this.callCount})`;
    const completionTokens = Math.ceil(completionContent.length / 4);

    return {
      content: completionContent,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      finishReason: 'stop',
    };
  }

  async classify(
    input: string,
    options: { categories: string[] }
  ): Promise<string> {
    this.callCount++;
    // 简单模拟：基于输入长度选择类别
    const index = input.length % options.categories.length;
    return options.categories[index];
  }

  /** 获取累计调用次数（测试/调试用） */
  getCallCount(): number {
    return this.callCount;
  }

  /** 重置调用计数 */
  resetCallCount(): void {
    this.callCount = 0;
  }
}
