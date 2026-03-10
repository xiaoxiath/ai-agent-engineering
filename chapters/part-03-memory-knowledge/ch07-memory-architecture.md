# 第七章：记忆架构 — Agent 的大脑

> "没有记忆的 Agent 只是一个高级的函数调用器。有了记忆，Agent 才能积累经验、持续改进。"

---

## 7.1 四层记忆模型

借鉴人类认知科学，我们设计了 Agent 的四层记忆架构：

```
┌─────────────────────────────┐
│  Layer 4: Long-term Memory  │  长期记忆（跨会话）
│  用户偏好、历史经验、知识库   │
├─────────────────────────────┤
│  Layer 3: Task Memory       │  任务记忆（单任务生命周期）
│  当前任务的计划、进度、笔记   │
├─────────────────────────────┤
│  Layer 2: Conversation      │  对话记忆（单会话）
│  当前会话的对话历史           │
├─────────────────────────────┤
│  Layer 1: Working Memory    │  工作记忆（当前步骤）
│  当前 LLM 调用的上下文窗口   │
└─────────────────────────────┘
```

---

## 7.2 各层实现

### 7.2.1 工作记忆（Working Memory）

```typescript
class WorkingMemoryManager {
  private contextWindow: Message[] = [];
  private maxTokens: number;

  constructor(maxTokens: number = 128000) {
    this.maxTokens = maxTokens;
  }

  addMessage(msg: Message): void {
    this.contextWindow.push(msg);
    this.ensureWithinBudget();
  }

  private ensureWithinBudget(): void {
    while (this.estimateTokens() > this.maxTokens * 0.9) {
      // 移除最早的非 system 消息
      const idx = this.contextWindow.findIndex(m => m.role !== 'system');
      if (idx >= 0) this.contextWindow.splice(idx, 1);
      else break;
    }
  }

  getContext(): Message[] { return [...this.contextWindow]; }
  private estimateTokens(): number {
    return this.contextWindow.reduce((s, m) => s + Math.ceil(m.content.length / 4), 0);
  }
}
```

### 7.2.2 对话记忆（Conversation Memory）

```typescript
class ConversationMemoryManager {
  private history: Message[] = [];
  private summaries: string[] = [];

  addTurn(userMsg: string, assistantMsg: string): void {
    this.history.push(
      { role: 'user', content: userMsg },
      { role: 'assistant', content: assistantMsg }
    );
  }

  async getContextWindow(budget: number): Promise<Message[]> {
    const totalTokens = this.estimateTokens(this.history);
    if (totalTokens <= budget) return [...this.history];

    // 压缩早期对话
    const recent = this.history.slice(-20);
    const older = this.history.slice(0, -20);
    const summary = await this.summarizeConversation(older);
    this.summaries.push(summary);

    return [
      { role: 'system', content: `<conversation_history_summary>\n${summary}\n</conversation_history_summary>` },
      ...recent,
    ];
  }

  private async summarizeConversation(msgs: Message[]): Promise<string> {
    return '对话摘要...'; // LLM 摘要
  }

  private estimateTokens(msgs: Message[]): number {
    return msgs.reduce((s, m) => s + Math.ceil(m.content.length / 4), 0);
  }
}
```

### 7.2.3 任务记忆（Task Memory）

```typescript
class TaskMemoryManager {
  private taskState: {
    plan: string[];
    completedSteps: string[];
    notes: string;
    keyDecisions: Array<{ decision: string; reason: string; timestamp: number }>;
  } = { plan: [], completedSteps: [], notes: '', keyDecisions: [] };

  updatePlan(steps: string[]): void { this.taskState.plan = steps; }
  completeStep(step: string): void { this.taskState.completedSteps.push(step); }
  addNote(note: string): void { this.taskState.notes += '\n' + note; }
  recordDecision(decision: string, reason: string): void {
    this.taskState.keyDecisions.push({ decision, reason, timestamp: Date.now() });
  }

  getTaskContext(): string {
    return `## 任务进度
已完成: ${this.taskState.completedSteps.length}/${this.taskState.plan.length} 步
当前步骤: ${this.taskState.plan[this.taskState.completedSteps.length] ?? '全部完成'}

## 关键决策
${this.taskState.keyDecisions.map(d => `- ${d.decision}: ${d.reason}`).join('\n')}

## 笔记
${this.taskState.notes}`;
  }
}
```

### 7.2.4 长期记忆（Long-term Memory）

```typescript
class LongTermMemoryStore {
  private memories: Array<{
    id: string;
    content: string;
    embedding: number[];
    metadata: { type: string; timestamp: number; importance: number };
  }> = [];

  async store(content: string, type: string, importance: number): Promise<void> {
    const embedding = await this.getEmbedding(content);
    this.memories.push({
      id: crypto.randomUUID(),
      content,
      embedding,
      metadata: { type, timestamp: Date.now(), importance },
    });
  }

  async recall(query: string, topK: number = 5): Promise<string[]> {
    const queryEmb = await this.getEmbedding(query);
    return this.memories
      .map(m => ({ ...m, score: this.cosineSimilarity(queryEmb, m.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(m => m.content);
  }

  private async getEmbedding(text: string): Promise<number[]> { return []; }
  private cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((s, v, i) => s + v * b[i], 0);
    const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
    return dot / (magA * magB || 1);
  }
}
```

---

## 7.3 记忆巩固与遗忘

```typescript
class MemoryConsolidator {
  // 三种遗忘策略
  static readonly STRATEGIES = {
    // 基于时间衰减
    timeDecay: (memory: any, now: number) => {
      const ageHours = (now - memory.metadata.timestamp) / 3600000;
      return memory.metadata.importance * Math.exp(-ageHours / 720);
    },
    // 基于访问频率
    accessFrequency: (memory: any) => {
      return memory.metadata.accessCount * memory.metadata.importance;
    },
    // 基于相关性
    relevance: (memory: any, currentContext: string) => {
      return memory.metadata.importance; // 简化版
    },
  };

  async consolidate(memories: any[], strategy: string = 'timeDecay'): Promise<any[]> {
    const now = Date.now();
    const scored = memories.map(m => ({
      ...m,
      retentionScore: MemoryConsolidator.STRATEGIES[strategy](m, now),
    }));
    // 保留得分高于阈值的记忆
    return scored.filter(m => m.retentionScore > 0.3);
  }
}
```

---

## 7.4 本章小结

1. **四层记忆模型**覆盖了 Agent 从短期到长期的全部记忆需求
2. **工作记忆**是当前 LLM 上下文窗口，需要精心管理
3. **对话记忆**通过摘要压缩保持跨轮次连贯性
4. **任务记忆**跟踪当前任务的计划、进度和关键决策
5. **长期记忆**通过向量检索实现跨会话的经验积累
6. **记忆巩固**机制确保重要信息保留，不重要信息自然遗忘
