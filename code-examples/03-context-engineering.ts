/**
 * 示例 03: 上下文工程
 * 对应章节: 第5章 - Context Engineering
 *
 * 演示上下文窗口管理、压缩和 NOTES.md 模式
 */

// ============================================================
// 上下文窗口管理
// ============================================================

interface ContextConfig {
  maxTokens: number;       // 模型最大 token 数
  reserveForOutput: number; // 为输出保留的 token
  systemPromptTokens: number;
}

interface ContextSlot {
  name: string;
  priority: number;  // 越高越优先保留
  content: string;
  tokens: number;
  compressible: boolean;
}

class ContextWindowManager {
  private config: ContextConfig;

  constructor(config: ContextConfig) {
    this.config = config;
  }

  /**
   * 在有限的 token 预算内组装最优上下文
   */
  assemble(slots: ContextSlot[]): ContextSlot[] {
    const budget = this.config.maxTokens
      - this.config.reserveForOutput
      - this.config.systemPromptTokens;

    // 按优先级排序
    const sorted = [...slots].sort((a, b) => b.priority - a.priority);

    const selected: ContextSlot[] = [];
    let usedTokens = 0;

    for (const slot of sorted) {
      if (usedTokens + slot.tokens <= budget) {
        selected.push(slot);
        usedTokens += slot.tokens;
      } else if (slot.compressible) {
        // 尝试压缩
        const compressed = this.compress(slot, budget - usedTokens);
        if (compressed) {
          selected.push(compressed);
          usedTokens += compressed.tokens;
        }
      }
      // 如果不可压缩且超预算，则跳过
    }

    console.log(`Context assembled: ${selected.length}/${slots.length} slots, ${usedTokens}/${budget} tokens`);
    return selected;
  }

  private compress(slot: ContextSlot, availableTokens: number): ContextSlot | null {
    if (availableTokens < 50) return null;

    // 简单截断策略（实际应用中可用 LLM 摘要）
    const ratio = availableTokens / slot.tokens;
    const truncatedContent = slot.content.slice(0, Math.floor(slot.content.length * ratio));

    return {
      ...slot,
      content: truncatedContent + '\n... [truncated]',
      tokens: availableTokens
    };
  }
}

// ============================================================
// Context Rot 检测
// ============================================================

interface ContextHealth {
  totalTokens: number;
  uniqueInformationRatio: number;  // 不重复信息的比例
  staleness: number;               // 过时信息的比例
  relevance: number;               // 与当前任务的相关性
  score: number;                   // 综合健康分
}

class ContextRotDetector {
  /**
   * 检测上下文质量退化
   */
  assess(messages: { role: string; content: string; timestamp: number }[]): ContextHealth {
    const totalTokens = messages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);
    const uniqueRatio = this.calculateUniqueRatio(messages);
    const staleness = this.calculateStaleness(messages);
    const relevance = this.calculateRelevance(messages);

    const score = (uniqueRatio * 0.3 + (1 - staleness) * 0.3 + relevance * 0.4);

    return { totalTokens, uniqueInformationRatio: uniqueRatio, staleness, relevance, score };
  }

  shouldCompact(health: ContextHealth): boolean {
    return health.score < 0.6 || health.uniqueInformationRatio < 0.5;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private calculateUniqueRatio(messages: { content: string }[]): number {
    // 简化实现：基于 n-gram 重复度
    const allText = messages.map(m => m.content).join(' ');
    const words = allText.split(/\s+/);
    const uniqueWords = new Set(words);
    return uniqueWords.size / words.length;
  }

  private calculateStaleness(messages: { timestamp: number }[]): number {
    if (messages.length === 0) return 0;
    const now = Date.now();
    const avgAge = messages.reduce((sum, m) => sum + (now - m.timestamp), 0) / messages.length;
    const maxAge = 3600000; // 1 hour
    return Math.min(avgAge / maxAge, 1);
  }

  private calculateRelevance(messages: { content: string }[]): number {
    // 简化实现：最近消息权重更高
    return 0.8;
  }
}

// ============================================================
// NOTES.md 模式
// ============================================================

class NotesManager {
  private notes: string[] = [];

  /**
   * Agent 主动记录关键信息到 "笔记本"
   */
  addNote(note: string): void {
    this.notes.push(`[${new Date().toISOString()}] ${note}`);
  }

  /**
   * 获取当前笔记作为上下文
   */
  getContext(): string {
    if (this.notes.length === 0) return '';

    return `## Agent Notes (IMPORTANT - refer to these for context)
${this.notes.map((n, i) => `${i + 1}. ${n}`).join('\n')}
`;
  }

  /**
   * 紧凑笔记（合并重复、删除过时信息）
   */
  compact(): void {
    // 去重
    const unique = [...new Set(this.notes)];
    // 保留最近的 20 条
    this.notes = unique.slice(-20);
  }
}

// ============================================================
// 演示
// ============================================================

function main() {
  console.log('=== Context Engineering Demo ===\n');

  // 1. 上下文窗口管理
  console.log('--- Context Window Management ---');
  const manager = new ContextWindowManager({
    maxTokens: 4096,
    reserveForOutput: 1024,
    systemPromptTokens: 200
  });

  const slots: ContextSlot[] = [
    { name: 'system_prompt', priority: 10, content: 'You are a helpful assistant...', tokens: 200, compressible: false },
    { name: 'user_query', priority: 9, content: 'Help me analyze this data', tokens: 50, compressible: false },
    { name: 'conversation_history', priority: 5, content: 'Previous messages...'.repeat(100), tokens: 2000, compressible: true },
    { name: 'tool_results', priority: 7, content: 'Search result: ...'.repeat(50), tokens: 800, compressible: true },
    { name: 'knowledge_base', priority: 3, content: 'Reference docs...'.repeat(200), tokens: 3000, compressible: true },
  ];

  const selected = manager.assemble(slots);
  selected.forEach(s => console.log(`  ✓ ${s.name}: ${s.tokens} tokens`));

  // 2. Context Rot 检测
  console.log('\n--- Context Rot Detection ---');
  const detector = new ContextRotDetector();
  const messages = [
    { role: 'user', content: 'What is the weather?', timestamp: Date.now() - 1800000 },
    { role: 'assistant', content: 'The weather is sunny.', timestamp: Date.now() - 1700000 },
    { role: 'user', content: 'What is the weather again?', timestamp: Date.now() - 100000 },
    { role: 'assistant', content: 'The weather is still sunny.', timestamp: Date.now() },
  ];

  const health = detector.assess(messages);
  console.log(`  Health score: ${health.score.toFixed(2)}`);
  console.log(`  Unique info ratio: ${health.uniqueInformationRatio.toFixed(2)}`);
  console.log(`  Should compact: ${detector.shouldCompact(health)}`);

  // 3. NOTES.md 模式
  console.log('\n--- NOTES.md Pattern ---');
  const notes = new NotesManager();
  notes.addNote('User prefers Python code examples');
  notes.addNote('Project uses PostgreSQL database');
  notes.addNote('Deadline is next Friday');
  console.log(notes.getContext());
}

main();
