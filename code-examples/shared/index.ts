/**
 * shared/index.ts — 统一导出
 *
 * 各章节代码示例通过此文件导入全部共享类型和工具函数：
 *
 *   import {
 *     estimateTokens,
 *     cosineSimilarity,
 *     type Message,
 *     type AgentState,
 *     type LLMClient,
 *     MockLLMClient,
 *     ...
 *   } from '../shared';
 *
 * @see 附录 G — 共享类型与工具函数参考
 */

// ── G.2 核心类型 ──────────────────────────────────────────────
export type {
  // G.2.2 Message
  Message,
  // G.2.3 Tool 体系
  ToolDefinition,
  ToolCall,
  ToolResult,
  ToolExecutor,
  // G.2.4 Agent 状态
  AgentPhase,
  AgentState,
  PerformanceMetrics,
  // G.2.5 Agent 事件
  AgentEvent,
  EventFilter,
  EventHandler,
  // G.3.2 SemanticCache 配置/条目类型
  SemanticCacheConfig,
  CacheEntry,
  CacheQueryResult,
} from './types.js';

// G.2.4 工厂函数
export { createInitialState } from './types.js';

// G.3.1 Registry 类
export { Registry } from './types.js';

// ── G.1 工具函数 ──────────────────────────────────────────────
export {
  // G.1.1
  estimateTokens,
  // G.1.2
  cosineSimilarity,
  // G.3.2
  SemanticCache,
} from './utils.js';

// ── G.1.3 Embedding 服务 ─────────────────────────────────────
export type { EmbeddingService } from './embedding.js';
export { MockEmbeddingService } from './embedding.js';

// ── G.2.1 LLM 客户端 ────────────────────────────────────────
export type { LLMClient, LLMResponse } from './llm-client.js';
export { MockLLMClient } from './llm-client.js';
