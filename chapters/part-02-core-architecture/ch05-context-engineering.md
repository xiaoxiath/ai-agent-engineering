# 第五章：Context Engineering — 上下文工程

> "Context Engineering 是构建动态系统的学科，它在恰当的时间以恰当的格式提供恰当的信息和工具。" — Zack Witten, Anthropic

---

## 5.1 Context Engineering 五大原则

### 原则一：信息密度最大化

每个 token 都应该有价值。Agent 的上下文窗口是稀缺资源，必须精心管理。

### 原则二：时序相关性

最相关的信息放在最近的位置，因为 LLM 对近期上下文的注意力更强。

### 原则三：结构化组织

使用 XML 标签等结构化方式组织信息，帮助 LLM 理解信息的类别和优先级。

### 原则四：动态裁剪

根据当前任务动态调整上下文内容，移除不相关的信息。

### 原则五：隔离与封装

不同来源的信息（用户输入、工具返回、RAG 检索结果）明确标记边界。

---

## 5.2 Context Rot（上下文腐化）检测

```typescript
class ContextRotDetector {
  /**
   * 检测上下文是否出现"腐化"——
   * 随着对话增长，早期信息被遗忘或产生矛盾
   */
  analyze(messages: Message[]): ContextHealthReport {
    const totalTokens = this.countTokens(messages);
    const uniqueTopics = this.extractTopics(messages);
    const contradictions = this.findContradictions(messages);
    const redundancy = this.measureRedundancy(messages);

    return {
      totalTokens,
      topicCount: uniqueTopics.length,
      contradictionCount: contradictions.length,
      redundancyScore: redundancy,
      healthScore: this.calculateHealth(totalTokens, contradictions.length, redundancy),
      recommendation: this.getRecommendation(totalTokens, contradictions.length),
    };
  }

  private calculateHealth(tokens: number, contradictions: number, redundancy: number): number {
    let score = 100;
    if (tokens > 50000) score -= 20;
    if (tokens > 100000) score -= 30;
    score -= contradictions * 10;
    score -= redundancy * 20;
    return Math.max(0, score);
  }

  private getRecommendation(tokens: number, contradictions: number): string {
    if (tokens > 100000) return 'COMPACT_NOW';
    if (contradictions > 2) return 'RESOLVE_CONTRADICTIONS';
    if (tokens > 50000) return 'COMPACT_SOON';
    return 'HEALTHY';
  }

  private countTokens(msgs: Message[]): number { return msgs.reduce((s, m) => s + m.content.length / 4, 0); }
  private extractTopics(msgs: Message[]): string[] { return []; }
  private findContradictions(msgs: Message[]): string[] { return []; }
  private measureRedundancy(msgs: Message[]): number { return 0; }
}

interface ContextHealthReport {
  totalTokens: number;
  topicCount: number;
  contradictionCount: number;
  redundancyScore: number;
  healthScore: number;
  recommendation: string;
}
```

---

## 5.3 Compaction（上下文压缩）

当上下文接近窗口上限时，需要进行智能压缩：

```typescript
class ContextCompactor {
  async compact(messages: Message[], budget: number): Promise<Message[]> {
    const totalTokens = this.countTokens(messages);
    if (totalTokens <= budget) return messages;

    // 策略 1: 保留 system prompt 和最近的消息
    const systemMsgs = messages.filter(m => m.role === 'system');
    const recentMsgs = messages.slice(-10);

    // 策略 2: 对中间的消息进行摘要
    const middleMsgs = messages.slice(systemMsgs.length, -10);
    const summary = await this.summarize(middleMsgs);

    return [
      ...systemMsgs,
      { role: 'system', content: `<conversation_summary>\n${summary}\n</conversation_summary>` },
      ...recentMsgs,
    ];
  }

  private async summarize(messages: Message[]): Promise<string> {
    // 使用 LLM 生成摘要
    const resp = await llm.chat({
      messages: [
        { role: 'system', content: '请将以下对话精炼为结构化摘要，保留关键决策和事实。' },
        { role: 'user', content: messages.map(m => `${m.role}: ${m.content}`).join('\n') },
      ],
      model: 'fast', // 使用快速模型
    });
    return resp.content;
  }

  private countTokens(msgs: Message[]): number {
    return msgs.reduce((s, m) => s + Math.ceil(m.content.length / 4), 0);
  }
}
```

---

## 5.4 结构化笔记 (NOTES.md Pattern)

Anthropic 推荐的 Agent 笔记管理模式：

```typescript
class NotesManager {
  private notes: string = '';

  constructor(private systemPromptAddition: string =
    `你有一个持久化的笔记本 <notes>。
每当你发现重要信息（用户偏好、关键决策、已完成的步骤），
请使用 update_notes 工具更新笔记。`) {}

  getNotesContext(): string {
    if (!this.notes) return '<notes>\n（空）\n</notes>';
    return `<notes>\n${this.notes}\n</notes>`;
  }

  update(newNotes: string): void {
    this.notes = newNotes;
  }

  getToolDefinition() {
    return {
      name: 'update_notes',
      description: '更新你的持久化笔记本。传入完整的新笔记内容（而非增量更新）。',
      parameters: {
        type: 'object',
        properties: {
          notes: { type: 'string', description: '完整的笔记内容（Markdown 格式）' },
        },
        required: ['notes'],
      },
    };
  }
}
```

---

## 5.5 Sub-Agent 上下文隔离

```typescript
class SubAgentLauncher {
  /**
   * 为子 Agent 创建干净的上下文窗口
   * 只传递任务所需的最少信息
   */
  async launch(params: {
    task: string;
    relevantContext: string;
    tools: Tool[];
    parentNotes?: string;
  }): Promise<string> {
    const subAgentMessages: Message[] = [
      {
        role: 'system',
        content: `你是一个专注于特定任务的子 Agent。
<task_context>
${params.relevantContext}
</task_context>
${params.parentNotes ? `<parent_notes>\n${params.parentNotes}\n</parent_notes>` : ''}`,
      },
      { role: 'user', content: params.task },
    ];

    // 子 Agent 有独立的上下文窗口
    return agentLoop(subAgentMessages, params.tools);
  }
}
```

---

## 5.6 本章小结

1. **Context Engineering** 是超越 Prompt Engineering 的系统性工程
2. **Context Rot** 是长对话场景中的主要风险
3. **Compaction** 策略帮助在有限窗口内保持信息质量
4. **NOTES.md Pattern** 提供持久化的结构化笔记
5. **Sub-Agent 上下文隔离**确保子任务有干净的推理空间
