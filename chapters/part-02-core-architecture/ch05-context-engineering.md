# 第 5 章 Context Engineering — 上下文工程

> "Prompt engineering is dead; context engineering is the new game."
> — Andrej Karpathy, 2025

在 Agent 系统中，**上下文（Context）** 是模型唯一能"看见"的世界。无论你的工具链多强大、规划算法多精妙，如果送入模型的上下文窗口中信息不对、不全、或者被噪声淹没，Agent 的输出就不可能正确。**上下文工程**（Context Engineering）正是围绕这一核心问题展开的系统化方法论：它研究如何为每一次 LLM 调用精心构建最优的信息输入。

**术语溯源。**"Context Engineering" 这一概念由 Shopify CEO **Tobi Lutke** 于 2025 年 6 月率先提出，他主张用"上下文工程"替代"提示工程"作为更有用的思维框架。**Andrej Karpathy** 随即以"Prompt Engineering is dead; Context Engineering is the new game"将其推向更广泛的技术社区（见本章题词）。此后，这一概念被众多从业者发展为涵盖写入、选择、压缩、隔离、持久化与观测的系统化工程学科——这正是本章的主题。

本章将从六大原则出发，深入探讨上下文腐化检测、多层压缩、结构化笔记、上下文传递策略、长对话管理等关键主题，并给出完整的 TypeScript 实现。

---

## 5.1 上下文工程的六大原则

上下文工程不是一项单一技术，而是一套涵盖 **写入、选择、压缩、隔离、持久化、观测** 的系统工程。我们将这六大原则总结为 **WSCIPO** 框架：

| 原则 | 英文 | 核心问题 | 关键指标 |
|------|------|---------|---------|
| 写入 | **W**rite | 如何构造高质量的初始上下文？ | 信噪比、格式一致性 |
| 选择 | **S**elect | 哪些信息值得放入有限窗口？ | 召回率、精准率 |
| 压缩 | **C**ompress | 如何在保留语义的前提下缩减 token？ | 压缩率、信息保留度 |
| 隔离 | **I**solate | 多 Agent 并行时如何防止上下文污染？ | 隔离度、共享效率 |
| 持久化 | **P**ersist | 如何跨会话保存和恢复关键上下文？ | 检索准确率、存储成本 |
| 观测 | **O**bserve | 如何实时监控上下文质量并预警？ | 健康分、异常检出率 |

### 5.1.1 Write — 写入：构建高质量初始上下文

写入是上下文工程的第一步。一个好的 System Prompt 不仅仅是"角色扮演"的开场白，更是整个 Agent 行为的锚定点。

#### System Prompt 的结构化设计

我们推荐使用 **XML 标签** 来组织 System Prompt，因为：
1. XML 标签在大多数 LLM 中有良好的边界识别能力
2. 结构化格式便于程序化生成和解析
3. 层次化结构自然映射到上下文的逻辑分区

```typescript
// ===== System Prompt Builder =====
// 用 XML 标签构造结构化的 System Prompt

interface Persona {
  role: string;
  expertise: string[];
  communicationStyle: string;
  constraints: string[];
}

interface FewShotExample {
  userMessage: string;
  assistantResponse: string;
  explanation?: string;
}

interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required: boolean }>;
  exampleCall: string;
}

interface SystemPromptConfig {
  persona: Persona;
  instructions: string[];
  fewShotExamples: FewShotExample[];
  tools: ToolSpec[];
  outputFormat?: string;
  guardrails: string[];
}

class SystemPromptBuilder {
  private config: SystemPromptConfig;

  constructor(config: SystemPromptConfig) {
    this.config = config;
  }

  build(): string {
    const sections: string[] = [];

    // 1. Persona section
    sections.push(this.buildPersona());

    // 2. Instructions section
    sections.push(this.buildInstructions());

    // 3. Tools section
    if (this.config.tools.length > 0) {
      sections.push(this.buildTools());
    }

    // 4. Few-shot examples
    if (this.config.fewShotExamples.length > 0) {
      sections.push(this.buildFewShot());
    }

    // 5. Output format
    if (this.config.outputFormat) {
      sections.push(this.buildOutputFormat());
    }

    // 6. Guardrails
    sections.push(this.buildGuardrails());

    return sections.join("\n\n");
  }

  private buildPersona(): string {
    const p = this.config.persona;
    return [
      "<persona>",
      `  <role>${p.role}</role>`,
      `  <expertise>`,
      ...p.expertise.map(e => `    <skill>${e}</skill>`),
      `  </expertise>`,
      `  <style>${p.communicationStyle}</style>`,
      `  <constraints>`,
      ...p.constraints.map(c => `    <constraint>${c}</constraint>`),
      `  </constraints>`,
      "</persona>",
    ].join("\n");
  }

  private buildInstructions(): string {
    return [
      "<instructions>",
      ...this.config.instructions.map(
        (inst, i) => `  <step index="${i + 1}">${inst}</step>`
      ),
      "</instructions>",
    ].join("\n");
  }

  private buildTools(): string {
    const toolBlocks = this.config.tools.map(tool => {
      const params = Object.entries(tool.parameters)
        .map(([name, spec]) => {
          const req = spec.required ? ' required="true"' : "";
          return `      <param name="${name}" type="${spec.type}"${req}>${spec.description}</param>`;
        })
        .join("\n");
      return [
        `  <tool name="${tool.name}">`,
        `    <description>${tool.description}</description>`,
        `    <parameters>`,
        params,
        `    </parameters>`,
        `    <example>${tool.exampleCall}</example>`,
        `  </tool>`,
      ].join("\n");
    });
    return ["<tools>", ...toolBlocks, "</tools>"].join("\n");
  }

  private buildFewShot(): string {
    const examples = this.config.fewShotExamples.map((ex, i) => {
      const parts = [
        `  <example index="${i + 1}">`,
        `    <user>${ex.userMessage}</user>`,
        `    <assistant>${ex.assistantResponse}</assistant>`,
      ];
      if (ex.explanation) {
        parts.push(`    <explanation>${ex.explanation}</explanation>`);
      }
      parts.push(`  </example>`);
      return parts.join("\n");
    });
    return ["<few_shot_examples>", ...examples, "</few_shot_examples>"].join("\n");
  }

  private buildOutputFormat(): string {
    return [
      "<output_format>",
      `  ${this.config.outputFormat}`,
      "</output_format>",
    ].join("\n");
  }

  private buildGuardrails(): string {
    return [
      "<guardrails>",
      ...this.config.guardrails.map(g => `  <rule>${g}</rule>`),
      "</guardrails>",
    ].join("\n");
  }
}

// 使用示例
const config: SystemPromptConfig = {
  persona: {
    role: "高级数据分析师",
    expertise: ["SQL", "Python", "统计分析", "数据可视化"],
    communicationStyle: "专业但易懂，用数据说话",
    constraints: [
      "不编造数据，对不确定的结论明确标注",
      "所有分析结论必须附带数据来源",
    ],
  },
  instructions: [
    "理解用户的分析需求，明确指标定义和时间范围",
    "编写 SQL 查询获取所需数据",
    "执行统计分析并生成可视化图表",
    "撰写分析报告，包含关键发现和建议",
  ],
  fewShotExamples: [
    {
      userMessage: "分析上月用户留存率",
      assistantResponse: "我将从三个维度分析留存率：整体留存曲线、分群留存对比、留存影响因子...",
      explanation: "先明确分析框架再执行，避免方向偏差",
    },
  ],
  tools: [
    {
      name: "execute_sql",
      description: "在数据仓库中执行 SQL 查询",
      parameters: {
        query: { type: "string", description: "SQL 查询语句", required: true },
        database: { type: "string", description: "目标数据库名", required: true },
      },
      exampleCall: 'execute_sql(query: "SELECT ...", database: "analytics")',
    },
  ],
  outputFormat: "使用 Markdown 格式，包含表格和代码块",
  guardrails: [
    "不执行 DELETE、UPDATE、DROP 等写操作",
    "查询结果超过 1000 行时先做聚合",
    "涉及 PII 数据时自动脱敏",
  ],
};

const builder = new SystemPromptBuilder(config);
const systemPrompt = builder.build();
```

> **设计要点**：XML 标签法的一个重要优势是**可组合性**。不同模块可以独立生成自己的 XML 片段，最终由 Builder 统一拼装。这避免了字符串拼接的混乱，也让 prompt 的版本管理变得可控。

#### Dynamic Context Injection — 动态上下文注入

System Prompt 解决了"静态上下文"的构建问题，但 Agent 系统还需要处理**动态信息**的注入——用户画像、实时数据、会话历史等。

```typescript
// ===== Dynamic Context Injector =====
// 将动态信息按优先级注入上下文窗口

interface ContextSource {
  name: string;
  priority: number;           // 1-10, 越高越重要
  estimatedTokens: number;
  fetch: () => Promise<string>;
  ttl?: number;               // 缓存有效期（秒）
}

interface InjectionResult {
  includedSources: string[];
  excludedSources: string[];
  totalTokens: number;
  budgetUtilization: number;  // 0-1
}

class DynamicContextInjector {
  private sources: ContextSource[] = [];
  private cache: Map<string, { content: string; expiry: number }> = new Map();

  register(source: ContextSource): void {
    this.sources.push(source);
    // 按优先级降序排列
    this.sources.sort((a, b) => b.priority - a.priority);
  }

  async inject(tokenBudget: number): Promise<{
    context: string;
    result: InjectionResult;
  }> {
    const included: string[] = [];
    const excluded: string[] = [];
    const parts: string[] = [];
    let usedTokens = 0;

    for (const source of this.sources) {
      if (usedTokens + source.estimatedTokens > tokenBudget) {
        excluded.push(source.name);
        continue;
      }

      try {
        const content = await this.fetchWithCache(source);
        parts.push(`<context source="${source.name}">\n${content}\n</context>`);
        usedTokens += source.estimatedTokens;
        included.push(source.name);
      } catch (error) {
        console.warn(`Failed to fetch source: ${source.name}`, error);
        excluded.push(source.name);
      }
    }

    return {
      context: parts.join("\n\n"),
      result: {
        includedSources: included,
        excludedSources: excluded,
        totalTokens: usedTokens,
        budgetUtilization: usedTokens / tokenBudget,
      },
    };
  }

  private async fetchWithCache(source: ContextSource): Promise<string> {
    const now = Date.now();
    const cached = this.cache.get(source.name);

    if (cached && cached.expiry > now) {
      return cached.content;
    }

    const content = await source.fetch();

    if (source.ttl) {
      this.cache.set(source.name, {
        content,
        expiry: now + source.ttl * 1000,
      });
    }

    return content;
  }
}
```

### 5.1.2 Select — 选择：从海量信息中精准提取

当可用上下文远超模型窗口容量时，**选择** 成为关键。选择策略需要综合考虑三个维度：**相关性**（Relevance）、**时效性**（Recency）和**重要性**（Importance）。

```typescript
// ===== Context Selector =====
// 基于 RRI 三维评分的上下文选择器

interface ContextItem {
  id: string;
  content: string;
  embedding: number[];       // 语义向量
  timestamp: number;         // 创建时间戳
  importance: number;        // 0-1 业务重要性
  source: string;            // 来源标识
  tokenCount: number;
  metadata: Record<string, unknown>;
}

interface SelectionConfig {
  weights: {
    relevance: number;       // 相关性权重
    recency: number;         // 时效性权重
    importance: number;      // 重要性权重
  };
  recencyHalfLife: number;   // 时效性半衰期（小时）
  diversityPenalty: number;  // 同源惩罚系数
}

class ContextSelector {
  private config: SelectionConfig;

  constructor(config: SelectionConfig) {
    this.config = config;
  }

  /**
   * 从候选池中选择最佳上下文子集
   * @param candidates 候选上下文列表
   * @param queryEmbedding 当前查询的语义向量
   * @param tokenBudget token 预算
   * @returns 选中的上下文项（按得分降序）
   */
  select(
    candidates: ContextItem[],
    queryEmbedding: number[],
    tokenBudget: number
  ): ContextItem[] {
    // Step 1: 计算每个候选项的 RRI 综合得分
    const scored = candidates.map(item => ({
      item,
      score: this.computeScore(item, queryEmbedding),
    }));

    // Step 2: 按得分降序排列
    scored.sort((a, b) => b.score - a.score);

    // Step 3: 贪心选择，同时考虑多样性
    const selected: ContextItem[] = [];
    const sourceCount: Map<string, number> = new Map();
    let usedTokens = 0;

    for (const { item, score } of scored) {
      if (usedTokens + item.tokenCount > tokenBudget) continue;

      // 应用同源惩罚：如果同一来源已被选中多次，降低后续同源项的优先级
      const count = sourceCount.get(item.source) || 0;
      const adjustedScore = score * Math.pow(
        1 - this.config.diversityPenalty,
        count
      );

      // 只有调整后得分仍高于阈值才选入
      if (adjustedScore > 0.1) {
        selected.push(item);
        usedTokens += item.tokenCount;
        sourceCount.set(item.source, count + 1);
      }
    }

    return selected;
  }

  private computeScore(
    item: ContextItem,
    queryEmbedding: number[]
  ): number {
    const { weights } = this.config;

    // 相关性：余弦相似度
    const relevance = this.cosineSimilarity(item.embedding, queryEmbedding);

    // 时效性：指数衰减
    const ageHours = (Date.now() - item.timestamp) / (1000 * 60 * 60);
    const recency = Math.exp(
      (-Math.LN2 * ageHours) / this.config.recencyHalfLife
    );

    // 重要性：直接使用标注值
    const importance = item.importance;

    // 加权求和并归一化
    const rawScore =
      weights.relevance * relevance +
      weights.recency * recency +
      weights.importance * importance;
    const maxScore =
      weights.relevance + weights.recency + weights.importance;

    return rawScore / maxScore;
  }

  /**
   * 余弦相似度计算 — 全书标准实现
   * 衡量两个向量在方向上的相似程度，返回 [-1, 1] 区间的值
   * 完整实现请参考 code-examples/shared/utils.ts
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
    return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0;
  }
}
```

> **实践建议**：三个权重的初始值建议设为 `relevance: 0.5, recency: 0.3, importance: 0.2`，然后根据实际场景进行 A/B 测试微调。对于客服场景，时效性更重要；对于知识问答场景，相关性占主导。

### 5.1.3 Compress — 压缩：在保留语义的前提下缩减 token

压缩是上下文工程中投入产出比最高的环节。一个好的压缩策略可以在减少 50-70% token 消耗的同时，保留 90%+ 的任务相关信息。

```typescript
// ===== Compressor Interface =====
// 定义压缩器的统一接口

interface CompressResult {
  compressed: string;
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;   // 压缩率 = 1 - compressed/original
  informationRetention: number; // 估算的信息保留度 0-1
}

interface Compressor {
  compress(
    content: string,
    targetTokens: number
  ): Promise<CompressResult>;
}

// L1: 格式压缩 — 去除冗余格式，不损失语义
class FormatCompressor implements Compressor {
  async compress(
    content: string,
    targetTokens: number
  ): Promise<CompressResult> {
    const original = content;
    let result = content;

    // 去除多余空行（保留单个换行）
    result = result.replace(/\n{3,}/g, "\n\n");

    // 压缩连续空格
    result = result.replace(/ {2,}/g, " ");

    // 去除行尾空格
    result = result.replace(/[ \t]+$/gm, "");

    // 压缩 Markdown 格式冗余
    result = result.replace(/\*\*(.{1,3})\*\*/g, "$1"); // 极短粗体无意义

    // 移除空的列表项
    result = result.replace(/^[-*]\s*$/gm, "");

    // 压缩重复的分隔线
    result = result.replace(/(---\n){2,}/g, "---\n");

    const originalTokens = this.estimateTokens(original);
    const compressedTokens = this.estimateTokens(result);

    return {
      compressed: result,
      originalTokens,
      compressedTokens,
      compressionRatio: 1 - compressedTokens / originalTokens,
      informationRetention: 0.99, // 格式压缩几乎不损失信息
    };
  }

  private estimateTokens(text: string): number {
    // 粗略估算：英文约 4 字符/token，中文约 1.5 字符/token
    const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const other = text.length - chinese;
    return Math.ceil(chinese / 1.5 + other / 4);
  }
}
```

> **三层压缩架构**将在 5.3 节详细展开，此处仅展示 L1 格式压缩作为示例。

### 5.1.4 Isolate — 隔离：多 Agent 上下文沙箱

在多 Agent 协作系统中，上下文隔离至关重要。如果子 Agent 能随意修改共享上下文，系统行为将变得不可预测。

```typescript
// ===== Context Sandbox =====
// 为子 Agent 提供隔离的上下文环境

enum IsolationPolicy {
  Full = "full",                  // 完全隔离，子 Agent 看不到父上下文
  SharedReadOnly = "shared_ro",   // 共享只读，子 Agent 可读不可写父上下文
  Selective = "selective",        // 选择性共享，只共享指定 key
  SummaryOnly = "summary_only",   // 只共享摘要
}

interface SandboxConfig {
  policy: IsolationPolicy;
  sharedKeys?: string[];           // 仅 Selective 模式使用
  maxTokenBudget: number;
  allowedTools: string[];
  parentSummary?: string;          // 仅 SummaryOnly 模式使用
}

interface SandboxState {
  localContext: Map<string, string>;
  readableFromParent: Map<string, string>;
  changeLog: Array<{
    timestamp: number;
    key: string;
    action: "set" | "delete";
    value?: string;
  }>;
}

class ContextSandbox {
  private config: SandboxConfig;
  private state: SandboxState;
  private parentContext: Map<string, string>;

  constructor(
    config: SandboxConfig,
    parentContext: Map<string, string>
  ) {
    this.config = config;
    this.parentContext = parentContext;
    this.state = {
      localContext: new Map(),
      readableFromParent: this.computeReadableContext(),
      changeLog: [],
    };
  }

  /**
   * 获取子 Agent 可见的完整上下文
   */
  getVisibleContext(): Map<string, string> {
    const visible = new Map<string, string>();

    // 添加从父级可读的上下文
    for (const [key, value] of this.state.readableFromParent) {
      visible.set(`parent:${key}`, value);
    }

    // 添加本地上下文（优先级更高，可覆盖父级）
    for (const [key, value] of this.state.localContext) {
      visible.set(key, value);
    }

    return visible;
  }

  /**
   * 设置本地上下文（不影响父级）
   */
  set(key: string, value: string): void {
    this.state.localContext.set(key, value);
    this.state.changeLog.push({
      timestamp: Date.now(),
      key,
      action: "set",
      value,
    });
  }

  /**
   * 删除本地上下文
   */
  delete(key: string): boolean {
    const existed = this.state.localContext.delete(key);
    if (existed) {
      this.state.changeLog.push({
        timestamp: Date.now(),
        key,
        action: "delete",
      });
    }
    return existed;
  }

  /**
   * 将沙箱变更提交回父级（需要审核）
   */
  exportChanges(): Array<{
    key: string;
    action: "set" | "delete";
    value?: string;
  }> {
    return this.state.changeLog.map(({ key, action, value }) => ({
      key,
      action,
      value,
    }));
  }

  private computeReadableContext(): Map<string, string> {
    switch (this.config.policy) {
      case IsolationPolicy.Full:
        return new Map();

      case IsolationPolicy.SharedReadOnly:
        return new Map(this.parentContext);

      case IsolationPolicy.Selective:
        const selective = new Map<string, string>();
        for (const key of this.config.sharedKeys || []) {
          const value = this.parentContext.get(key);
          if (value !== undefined) {
            selective.set(key, value);
          }
        }
        return selective;

      case IsolationPolicy.SummaryOnly:
        const summary = new Map<string, string>();
        if (this.config.parentSummary) {
          summary.set("_parent_summary", this.config.parentSummary);
        }
        return summary;

      default:
        return new Map();
    }
  }
}
```

> **隔离策略选择指南**：
> - **Full**：用于安全敏感的子任务（如执行用户提交的代码）
> - **SharedReadOnly**：最常用，子 Agent 需要了解全局背景但不应修改
> - **Selective**：子 Agent 只需要特定信息（如只看到用户偏好设置）
> - **SummaryOnly**：子 Agent 任务独立，只需知道大致背景

### 5.1.5 Persist — 持久化：跨会话上下文管理

上下文不应随会话结束而消失。持久化机制让 Agent 能跨会话保持记忆、积累知识。

```typescript
// ===== Context Persistence Layer =====
// 跨会话的上下文存储和检索

interface NoteEntry {
  id: string;
  category: "fact" | "preference" | "decision" | "todo" | "insight";
  content: string;
  confidence: number;           // 0-1 置信度
  source: string;               // 来源标识
  createdAt: number;
  updatedAt: number;
  accessCount: number;          // 被检索到的次数
  tags: string[];
}

interface PersistenceStore {
  save(entry: NoteEntry): Promise<void>;
  query(
    filter: Partial<NoteEntry>,
    limit: number
  ): Promise<NoteEntry[]>;
  semanticSearch(
    queryEmbedding: number[],
    topK: number
  ): Promise<NoteEntry[]>;
  delete(id: string): Promise<void>;
  updateAccessCount(id: string): Promise<void>;
}

class ContextPersistenceManager {
  private store: PersistenceStore;
  private llm: LLMClient;
  private maxEntriesPerCategory: number;

  constructor(store: PersistenceStore, llm: LLMClient, maxEntries: number = 1000) {
    this.store = store;
    this.llm = llm;
    this.maxEntriesPerCategory = maxEntries;
  }

  /**
   * 从对话中提取值得持久化的信息
   */
  async extractAndSave(
    conversation: Array<{ role: string; content: string }>,
    agentId: string
  ): Promise<NoteEntry[]> {
    const newEntries: NoteEntry[] = [];

    // 提取事实类信息
    const facts = await this.extractFacts(conversation);
    for (const fact of facts) {
      const entry: NoteEntry = {
        id: `${agentId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        category: "fact",
        content: fact.content,
        confidence: fact.confidence,
        source: agentId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessCount: 0,
        tags: fact.tags,
      };
      await this.store.save(entry);
      newEntries.push(entry);
    }

    // 提取用户偏好
    const preferences = await this.extractPreferences(conversation);
    for (const pref of preferences) {
      const entry: NoteEntry = {
        id: `${agentId}_pref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        category: "preference",
        content: pref.content,
        confidence: pref.confidence,
        source: agentId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessCount: 0,
        tags: pref.tags,
      };
      await this.store.save(entry);
      newEntries.push(entry);
    }

    return newEntries;
  }

  /**
   * 为新会话加载相关上下文
   */
  async loadForSession(
    queryEmbedding: number[],
    tokenBudget: number
  ): Promise<string> {
    const entries = await this.store.semanticSearch(queryEmbedding, 50);

    // 按类别分组
    const grouped: Record<string, NoteEntry[]> = {};
    for (const entry of entries) {
      if (!grouped[entry.category]) {
        grouped[entry.category] = [];
      }
      grouped[entry.category].push(entry);
    }

    // 构建持久化上下文
    const sections: string[] = [];
    for (const [category, items] of Object.entries(grouped)) {
      const categoryContent = items
        .map(item => `- [${item.confidence.toFixed(1)}] ${item.content}`)
        .join("\n");
      sections.push(`<${category}>\n${categoryContent}\n</${category}>`);
    }

    return sections.join("\n\n");
  }

  // --- 辅助提取方法：通过 LLM 从对话中抽取结构化信息 ---

  private async extractFacts(
    conversation: Array<{ role: string; content: string }>
  ): Promise<Array<{ content: string; confidence: number; tags: string[] }>> {
    const recentMessages = conversation.slice(-10);
    const transcript = recentMessages
      .map(m => `${m.role}: ${m.content}`)
      .join("\n");

    const prompt = `从以下对话中提取关键事实信息。

要求：
1. 只提取具体的、可验证的事实（如姓名、日期、数据、决策）
2. 忽略寒暄、过渡语和主观评价
3. 为每条事实评估置信度（0-1），信息越明确置信度越高
4. 为每条事实标注分类标签

以 JSON 数组格式返回：
[{"content": "事实描述", "confidence": 0.9, "tags": ["标签1"]}]

对话内容：
${transcript}

提取结果：`;

    const response = await this.llm.complete(prompt, 1024);

    try {
      const parsed = JSON.parse(response);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return []; // JSON 解析失败时安全降级
    }
  }

  private async extractPreferences(
    conversation: Array<{ role: string; content: string }>
  ): Promise<Array<{ content: string; confidence: number; tags: string[] }>> {
    const recentMessages = conversation.slice(-10);
    const transcript = recentMessages
      .map(m => `${m.role}: ${m.content}`)
      .join("\n");

    const prompt = `从以下对话中提取用户偏好信息。

要求：
1. 关注用户的沟通风格偏好（语言、详细程度、格式）
2. 关注用户的技术偏好（工具、框架、编程语言）
3. 关注用户的工作习惯（时间、流程、协作方式）
4. 为每条偏好评估置信度（0-1），显式表达的偏好置信度更高
5. 为每条偏好标注分类标签

以 JSON 数组格式返回：
[{"content": "偏好描述", "confidence": 0.8, "tags": ["communication"]}]

对话内容：
${transcript}

提取结果：`;

    const response = await this.llm.complete(prompt, 1024);

    try {
      const parsed = JSON.parse(response);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return []; // JSON 解析失败时安全降级
    }
  }
}
```

### 5.1.6 Observe — 观测：上下文质量的实时监控

上下文质量的退化是渐进式的，如果不加以观测，往往在问题严重时才被发现。我们需要一个持续运行的"上下文健康仪表板"。

```typescript
// ===== Context Health Dashboard =====
// 上下文质量实时监控系统

interface ContextHealthMetrics {
  tokenUtilization: number;          // token 使用率 (0-1)
  informationDensity: number;        // 信息密度 (unique concepts / total tokens)
  redundancyRate: number;            // 冗余率 (0-1)
  freshnessScore: number;            // 新鲜度 (0-1)
  coherenceScore: number;            // 连贯性 (0-1)
  topicDriftDistance: number;         // 与原始话题的偏移距离
}

interface HealthAlert {
  level: "info" | "warning" | "critical";
  metric: keyof ContextHealthMetrics;
  message: string;
  currentValue: number;
  threshold: number;
  suggestedAction: string;
}

interface HealthThresholds {
  maxRedundancyRate: number;         // 默认 0.3
  minFreshnessScore: number;         // 默认 0.4
  maxTopicDriftDistance: number;      // 默认 0.7
  minInformationDensity: number;     // 默认 0.1
  maxTokenUtilization: number;       // 默认 0.9
}

class ContextHealthDashboard {
  private thresholds: HealthThresholds;
  private metricsHistory: Array<{
    timestamp: number;
    metrics: ContextHealthMetrics;
  }> = [];

  constructor(thresholds?: Partial<HealthThresholds>) {
    this.thresholds = {
      maxRedundancyRate: 0.3,
      minFreshnessScore: 0.4,
      maxTopicDriftDistance: 0.7,
      minInformationDensity: 0.1,
      maxTokenUtilization: 0.9,
      ...thresholds,
    };
  }

  /**
   * 评估当前上下文的健康状态
   */
  evaluate(
    context: string,
    originalTopicEmbedding: number[],
    currentEmbedding: number[]
  ): {
    metrics: ContextHealthMetrics;
    alerts: HealthAlert[];
    overallHealth: number;       // 0-1 综合健康分
  } {
    const metrics = this.computeMetrics(
      context,
      originalTopicEmbedding,
      currentEmbedding
    );

    this.metricsHistory.push({ timestamp: Date.now(), metrics });

    const alerts = this.checkAlerts(metrics);

    // 综合健康分 = 各指标归一化后的加权平均
    const overallHealth = this.computeOverallHealth(metrics);

    return { metrics, alerts, overallHealth };
  }

  /**
   * 获取趋势报告
   */
  getTrendReport(windowSize: number = 10): Record<string, string> {
    if (this.metricsHistory.length < 2) {
      return { status: "insufficient data" };
    }

    const recent = this.metricsHistory.slice(-windowSize);
    const trends: Record<string, string> = {};

    const keys: (keyof ContextHealthMetrics)[] = [
      "tokenUtilization",
      "redundancyRate",
      "freshnessScore",
      "topicDriftDistance",
    ];

    for (const key of keys) {
      const values = recent.map(r => r.metrics[key]);
      const slope = this.linearSlope(values);
      if (Math.abs(slope) < 0.01) {
        trends[key] = "stable";
      } else if (slope > 0) {
        trends[key] = "increasing";
      } else {
        trends[key] = "decreasing";
      }
    }

    return trends;
  }

  private computeMetrics(
    context: string,
    originalEmbedding: number[],
    currentEmbedding: number[]
  ): ContextHealthMetrics {
    // token 使用率：基于上下文长度与窗口大小的比值估算
    const estimatedTokens = Math.ceil(context.length / 4); // 简化估算，精确版本见 estimateTokens 方法
    const contextWindowSize = 128_000; // 常见模型窗口大小
    const tokenUtilization = Math.min(1.0, estimatedTokens / contextWindowSize);

    // 信息密度：使用 unique word ratio 作为近似
    const words = context.split(/\s+/).filter(w => w.length > 0);
    const uniqueWords = new Set(words);
    const informationDensity = uniqueWords.size / Math.max(words.length, 1);

    // 冗余率：基于重复 n-gram 出现频率（比简单的 1 - uniqueRatio 更准确）
    const redundancyRate = this.computeRedundancy(words);

    // 话题偏移：1 - 余弦相似度
    const similarity = this.cosineSimilarity(originalEmbedding, currentEmbedding);
    const topicDriftDistance = 1 - similarity;

    // 新鲜度：基于历史指标的变化趋势推断
    // 如果近期指标有记录，用信息密度变化趋势作为新鲜度代理指标
    const freshnessScore = this.estimateFreshness(informationDensity);

    // 连贯性：综合话题一致性和信息密度
    // 话题偏移小且信息密度合理 → 连贯性高
    const coherenceScore = Math.min(1.0, similarity * 0.7 + informationDensity * 0.3);

    return {
      tokenUtilization,
      informationDensity,
      redundancyRate,
      freshnessScore,
      coherenceScore,
      topicDriftDistance,
    };
  }

  /** 基于重复 n-gram 估算冗余率 */
  private computeRedundancy(words: string[]): number {
    if (words.length < 6) return 0;
    const trigrams = new Map<string, number>();
    let duplicateCount = 0;
    for (let i = 0; i <= words.length - 3; i++) {
      const key = words.slice(i, i + 3).join(" ");
      const count = (trigrams.get(key) || 0) + 1;
      trigrams.set(key, count);
      if (count > 1) duplicateCount++;
    }
    const totalTrigrams = words.length - 2;
    return Math.min(1.0, duplicateCount / Math.max(totalTrigrams, 1));
  }

  /** 基于历史信息密度趋势估算新鲜度 */
  private estimateFreshness(currentDensity: number): number {
    if (this.metricsHistory.length < 2) return 0.8; // 数据不足时给予合理默认值
    const recent = this.metricsHistory.slice(-5);
    const avgDensity = recent.reduce(
      (sum, r) => sum + r.metrics.informationDensity, 0
    ) / recent.length;
    // 当前密度高于历史均值 → 新内容较多 → 新鲜度高
    const delta = currentDensity - avgDensity;
    return Math.max(0, Math.min(1.0, 0.5 + delta * 5));
  }

  private checkAlerts(
    metrics: ContextHealthMetrics
  ): HealthAlert[] {
    const alerts: HealthAlert[] = [];

    if (metrics.redundancyRate > this.thresholds.maxRedundancyRate) {
      alerts.push({
        level: metrics.redundancyRate > 0.5 ? "critical" : "warning",
        metric: "redundancyRate",
        message: `冗余率 ${(metrics.redundancyRate * 100).toFixed(1)}% 超过阈值`,
        currentValue: metrics.redundancyRate,
        threshold: this.thresholds.maxRedundancyRate,
        suggestedAction: "执行 L2 压缩或移除重复段落",
      });
    }

    if (metrics.topicDriftDistance > this.thresholds.maxTopicDriftDistance) {
      alerts.push({
        level: "warning",
        metric: "topicDriftDistance",
        message: `话题偏移距离 ${metrics.topicDriftDistance.toFixed(2)} 超过阈值`,
        currentValue: metrics.topicDriftDistance,
        threshold: this.thresholds.maxTopicDriftDistance,
        suggestedAction: "重新聚焦原始话题，或开启新会话",
      });
    }

    if (metrics.tokenUtilization > this.thresholds.maxTokenUtilization) {
      alerts.push({
        level: "critical",
        metric: "tokenUtilization",
        message: `Token 使用率 ${(metrics.tokenUtilization * 100).toFixed(1)}% 接近上限`,
        currentValue: metrics.tokenUtilization,
        threshold: this.thresholds.maxTokenUtilization,
        suggestedAction: "立即执行上下文压缩，优先移除低相关性内容",
      });
    }

    return alerts;
  }

  private computeOverallHealth(
    metrics: ContextHealthMetrics
  ): number {
    const scores = [
      1 - metrics.redundancyRate,
      metrics.freshnessScore,
      metrics.coherenceScore,
      1 - metrics.topicDriftDistance,
      metrics.informationDensity,
    ];
    return scores.reduce((sum, s) => sum + s, 0) / scores.length;
  }

  // cosineSimilarity 实现见第 5 章 Context Engineering 的工具函数定义
  // 此处为简化展示，完整实现请参考 code-examples/shared/utils.ts
  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
    return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0;
  }

  private linearSlope(values: number[]): number {
    const n = values.length;
    if (n < 2) return 0;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumXX += i * i;
    }
    const denom = n * sumXX - sumX * sumX;
    return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  }
}
```

---


## 5.2 Context Rot — 上下文腐化检测

随着对话轮次增加，上下文质量不可避免地退化——我们称之为**上下文腐化**（Context Rot）。腐化有多种表现形式：信息冗余堆积、事实相互矛盾、话题逐渐偏移、陈旧数据误导决策。及早检测腐化并采取修复措施，是保持 Agent 长期有效运行的关键。

### 5.2.1 SimHash 近似去重

在长对话中，用户反复描述同一问题、Agent 反复输出类似建议，会造成严重的**信息冗余**。我们使用 SimHash 算法来高效检测近似重复内容。

SimHash 的核心思想：将文本映射为一个固定长度的二进制指纹，语义相似的文本产生相似的指纹。通过比较两个指纹的**汉明距离**（不同位数），可以快速判断文本是否为近似重复。

```typescript
// ===== SimHash 近似重复检测 =====

class SimHasher {
  private hashBits: number;

  constructor(hashBits: number = 64) {
    this.hashBits = hashBits;
  }

  /**
   * 计算文本的 SimHash 指纹
   * 步骤：
   * 1. 分词 → 2. 每个词计算 hash → 3. 加权合并 → 4. 二值化
   */
  computeHash(text: string): bigint {
    const tokens = this.tokenize(text);
    const weights = this.computeTfWeights(tokens);

    // 初始化 hashBits 维度的浮点向量
    const vector: number[] = new Array(this.hashBits).fill(0);

    for (const token of tokens) {
      const hash = this.fnv1aHash(token);
      const weight = weights.get(token) || 1;

      for (let i = 0; i < this.hashBits; i++) {
        // hash 的第 i 位为 1 则加权，为 0 则减权
        if ((hash >> BigInt(i)) & 1n) {
          vector[i] += weight;
        } else {
          vector[i] -= weight;
        }
      }
    }

    // 将浮点向量二值化为指纹
    let fingerprint = 0n;
    for (let i = 0; i < this.hashBits; i++) {
      if (vector[i] > 0) {
        fingerprint |= 1n << BigInt(i);
      }
    }

    return fingerprint;
  }

  /**
   * 计算两个 SimHash 指纹的汉明距离
   */
  hammingDistance(a: bigint, b: bigint): number {
    let xor = a ^ b;
    let distance = 0;
    while (xor > 0n) {
      distance += Number(xor & 1n);
      xor >>= 1n;
    }
    return distance;
  }

  /**
   * 判断两段文本是否为近似重复
   * 汉明距离 <= threshold 视为重复
   */
  isNearDuplicate(
    textA: string,
    textB: string,
    threshold: number = 3
  ): { isDuplicate: boolean; distance: number; similarity: number } {
    const hashA = this.computeHash(textA);
    const hashB = this.computeHash(textB);
    const distance = this.hammingDistance(hashA, hashB);
    const similarity = 1 - distance / this.hashBits;

    return {
      isDuplicate: distance <= threshold,
      distance,
      similarity,
    };
  }

  private tokenize(text: string): string[] {
    // 中文按字/词分割，英文按空格分割
    // 生成 bigram 以捕获词序信息
    const chars = text.replace(/\s+/g, " ").split("");
    const bigrams: string[] = [];
    for (let i = 0; i < chars.length - 1; i++) {
      bigrams.push(chars[i] + chars[i + 1]);
    }
    return bigrams;
  }

  private computeTfWeights(tokens: string[]): Map<string, number> {
    const freq: Map<string, number> = new Map();
    for (const token of tokens) {
      freq.set(token, (freq.get(token) || 0) + 1);
    }
    // TF 权重取对数以减弱高频词的影响
    const weights: Map<string, number> = new Map();
    for (const [token, count] of freq) {
      weights.set(token, 1 + Math.log(count));
    }
    return weights;
  }

  private fnv1aHash(str: string): bigint {
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    for (let i = 0; i < str.length; i++) {
      hash ^= BigInt(str.charCodeAt(i));
      hash = (hash * prime) & ((1n << 64n) - 1n);
    }
    return hash;
  }
}
```

### 5.2.2 多维腐化检测器

仅靠去重不足以覆盖所有腐化类型。我们构建一个**多维检测器**，同时检测五种腐化模式：

| 腐化类型 | 检测方法 | 危害等级 |
|---------|---------|---------|
| 冗余堆积 | SimHash + Jaccard 相似度 | 中 |
| 事实矛盾 | 命题提取 + 语义对比 | 高 |
| 话题偏移 | 滑动窗口 embedding 距离 | 中 |
| 信息过时 | 时间戳 + 外部验证 | 高 |
| 注意力稀释 | 关键信息占比下降 | 中 |

```typescript
// ===== Context Rot Detector =====
// 多维上下文腐化检测

interface RotSignal {
  type: "redundancy" | "contradiction" | "drift" | "staleness" | "dilution";
  severity: number;          // 0-1
  evidence: string;          // 触发检测的具体内容
  location: {
    startIndex: number;
    endIndex: number;
  };
  suggestedFix: string;
}

interface RotReport {
  overallRotScore: number;   // 0-1, 越高越腐化
  signals: RotSignal[];
  recommendation: "healthy" | "compress" | "prune" | "restart";
}

class ContextRotDetector {
  private simHasher: SimHasher;
  private driftWindow: number[];     // 存储最近 N 轮的 embedding 距离

  constructor() {
    this.simHasher = new SimHasher(64);
    this.driftWindow = [];
  }

  /**
   * 对上下文执行全面腐化扫描
   */
  async scan(
    messages: Array<{ role: string; content: string; timestamp: number }>,
    currentTopicEmbedding: number[]
  ): Promise<RotReport> {
    const signals: RotSignal[] = [];

    // 1. 冗余检测
    const redundancySignals = this.detectRedundancy(messages);
    signals.push(...redundancySignals);

    // 2. 矛盾检测
    const contradictionSignals = await this.detectContradictions(messages);
    signals.push(...contradictionSignals);

    // 3. 话题偏移检测
    const driftSignals = this.detectTopicDrift(
      messages,
      currentTopicEmbedding
    );
    signals.push(...driftSignals);

    // 4. 信息过时检测
    const stalenessSignals = this.detectStaleness(messages);
    signals.push(...stalenessSignals);

    // 5. 注意力稀释检测
    const dilutionSignals = this.detectAttentionDilution(messages);
    signals.push(...dilutionSignals);

    // 计算总体腐化分
    const overallRotScore = this.computeOverallRot(signals);

    // 生成建议
    let recommendation: RotReport["recommendation"];
    if (overallRotScore < 0.3) {
      recommendation = "healthy";
    } else if (overallRotScore < 0.5) {
      recommendation = "compress";
    } else if (overallRotScore < 0.7) {
      recommendation = "prune";
    } else {
      recommendation = "restart";
    }

    return { overallRotScore, signals, recommendation };
  }

  /**
   * 冗余检测：使用 SimHash 找出近似重复段落
   */
  private detectRedundancy(
    messages: Array<{ role: string; content: string; timestamp: number }>
  ): RotSignal[] {
    const signals: RotSignal[] = [];
    const assistantMessages = messages
      .filter(m => m.role === "assistant")
      .map((m, idx) => ({ ...m, index: idx }));

    for (let i = 0; i < assistantMessages.length; i++) {
      for (let j = i + 1; j < assistantMessages.length; j++) {
        const result = this.simHasher.isNearDuplicate(
          assistantMessages[i].content,
          assistantMessages[j].content,
          5 // 汉明距离阈值
        );

        if (result.isDuplicate) {
          signals.push({
            type: "redundancy",
            severity: result.similarity,
            evidence: `消息 #${i} 和 #${j} 相似度 ${(result.similarity * 100).toFixed(1)}%`,
            location: { startIndex: j, endIndex: j },
            suggestedFix: "移除后者或合并为单条摘要",
          });
        }
      }
    }

    return signals;
  }

  /**
   * 矛盾检测：提取命题并查找语义冲突
   */
  private async detectContradictions(
    messages: Array<{ role: string; content: string; timestamp: number }>
  ): Promise<RotSignal[]> {
    const signals: RotSignal[] = [];

    // 提取数值型断言（最容易检测的矛盾类型）
    const numericClaims: Array<{
      index: number;
      claim: string;
      value: number;
      unit: string;
    }> = [];

    for (let i = 0; i < messages.length; i++) {
      const matches = messages[i].content.matchAll(
        /(\w+[\u4e00-\u9fff]*)\s*(?:是|为|=|：|:)\s*([\d.]+)\s*(\w*[\u4e00-\u9fff]*)/g
      );
      for (const match of matches) {
        numericClaims.push({
          index: i,
          claim: match[0],
          value: parseFloat(match[2]),
          unit: match[3] || "",
        });
      }
    }

    // 检查同一实体的数值是否前后矛盾
    for (let i = 0; i < numericClaims.length; i++) {
      for (let j = i + 1; j < numericClaims.length; j++) {
        const a = numericClaims[i];
        const b = numericClaims[j];
        if (a.unit === b.unit && a.value !== b.value) {
          const diff = Math.abs(a.value - b.value) / Math.max(a.value, b.value);
          if (diff > 0.1) {
            signals.push({
              type: "contradiction",
              severity: Math.min(diff, 1),
              evidence: `"${a.claim}" vs "${b.claim}" (偏差 ${(diff * 100).toFixed(1)}%)`,
              location: { startIndex: a.index, endIndex: b.index },
              suggestedFix: "保留最新数据或向用户确认正确值",
            });
          }
        }
      }
    }

    return signals;
  }

  /**
   * 话题偏移检测：计算对话方向的变化速率
   */
  private detectTopicDrift(
    messages: Array<{ role: string; content: string; timestamp: number }>,
    originalTopicEmbedding: number[]
  ): RotSignal[] {
    const signals: RotSignal[] = [];

    // 使用滑动窗口检测话题偏移趋势
    // 每 5 轮计算一次平均 embedding，然后与原始话题比较
    const windowSize = 5;
    if (messages.length < windowSize) return signals;

    // 用最后一个窗口的 embedding 做近似
    const recentMessages = messages.slice(-windowSize);
    const recentText = recentMessages.map(m => m.content).join(" ");

    // 计算简化的"向量距离"（实际项目中应使用 embedding API）
    const driftScore = this.estimateTextDivergence(
      messages[0].content,
      recentText
    );

    this.driftWindow.push(driftScore);

    if (driftScore > 0.6) {
      signals.push({
        type: "drift",
        severity: driftScore,
        evidence: `最近 ${windowSize} 轮对话偏离原始话题，偏移分数 ${driftScore.toFixed(2)}`,
        location: {
          startIndex: messages.length - windowSize,
          endIndex: messages.length - 1,
        },
        suggestedFix: "插入话题回归提示或创建新会话分支",
      });
    }

    // 检测偏移加速（连续多个窗口偏移分增大）
    if (this.driftWindow.length >= 3) {
      const recent3 = this.driftWindow.slice(-3);
      if (recent3[2] > recent3[1] && recent3[1] > recent3[0]) {
        signals.push({
          type: "drift",
          severity: 0.8,
          evidence: "话题偏移正在加速，连续 3 个检测窗口偏移分递增",
          location: {
            startIndex: messages.length - windowSize * 3,
            endIndex: messages.length - 1,
          },
          suggestedFix: "强烈建议执行上下文重聚焦",
        });
      }
    }

    return signals;
  }

  /**
   * 信息过时检测
   */
  private detectStaleness(
    messages: Array<{ role: string; content: string; timestamp: number }>
  ): RotSignal[] {
    const signals: RotSignal[] = [];
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

    for (let i = 0; i < messages.length; i++) {
      const age = now - messages[i].timestamp;

      // 超过 2 小时的带有时间敏感关键词的消息
      if (age > 2 * ONE_HOUR) {
        const timeSensitivePatterns = [
          /当前|现在|目前|最新|实时|今天|此刻/,
          /current|now|latest|real-time|today/i,
          /价格|股价|温度|汇率|库存/,
        ];

        for (const pattern of timeSensitivePatterns) {
          if (pattern.test(messages[i].content)) {
            const hours = (age / ONE_HOUR).toFixed(1);
            signals.push({
              type: "staleness",
              severity: Math.min(age / (24 * ONE_HOUR), 1),
              evidence: `消息 #${i} 包含时间敏感信息，已过去 ${hours} 小时`,
              location: { startIndex: i, endIndex: i },
              suggestedFix: "刷新该信息或标记为"截至 X 时间"",
            });
            break;
          }
        }
      }
    }

    return signals;
  }

  /**
   * 注意力稀释检测：关键信息在上下文中的占比下降
   */
  private detectAttentionDilution(
    messages: Array<{ role: string; content: string; timestamp: number }>
  ): RotSignal[] {
    const signals: RotSignal[] = [];

    if (messages.length < 10) return signals;

    // 计算前 5 轮的信息密度 vs 最近 5 轮
    const first5 = messages.slice(0, 5).map(m => m.content).join(" ");
    const last5 = messages.slice(-5).map(m => m.content).join(" ");

    const first5Density = this.computeInformationDensity(first5);
    const last5Density = this.computeInformationDensity(last5);

    if (last5Density < first5Density * 0.6) {
      signals.push({
        type: "dilution",
        severity: 1 - last5Density / first5Density,
        evidence: `信息密度从 ${first5Density.toFixed(3)} 降至 ${last5Density.toFixed(3)}`,
        location: {
          startIndex: messages.length - 5,
          endIndex: messages.length - 1,
        },
        suggestedFix: "压缩低密度段落，保留关键信息",
      });
    }

    return signals;
  }

  private estimateTextDivergence(textA: string, textB: string): number {
    // 使用 Jaccard 距离作为简化的偏移度量
    const setA = new Set(textA.split(/\s+/));
    const setB = new Set(textB.split(/\s+/));
    let intersection = 0;
    for (const word of setA) {
      if (setB.has(word)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : 1 - intersection / union;
  }

  private computeInformationDensity(text: string): number {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return 0;
    const unique = new Set(words);
    return unique.size / words.length;
  }

  private computeOverallRot(signals: RotSignal[]): number {
    if (signals.length === 0) return 0;

    // 按类型加权
    const typeWeights: Record<string, number> = {
      contradiction: 1.0,   // 矛盾最严重
      staleness: 0.8,
      drift: 0.6,
      redundancy: 0.4,
      dilution: 0.5,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const signal of signals) {
      const weight = typeWeights[signal.type] || 0.5;
      weightedSum += signal.severity * weight;
      totalWeight += weight;
    }

    // 信号数量也影响总分（多种腐化并发更严重）
    const countFactor = Math.min(signals.length / 5, 1);
    const avgSeverity = totalWeight === 0 ? 0 : weightedSum / totalWeight;

    return Math.min(avgSeverity * 0.7 + countFactor * 0.3, 1);
  }
}
```

> **实践经验**：在生产环境中，腐化检测应在每 N 轮对话后自动触发（推荐 N=5-10），而不是等到性能明显下降才处理。检测的开销很小（SimHash O(n)，矛盾检测 O(n^2)），但带来的质量收益是巨大的。

---

## 5.3 Three-Tier Compression — 三层压缩架构

压缩是对抗上下文窗口有限性的核心武器。我们设计了一个三层压缩架构，每一层在压缩率和信息保留度之间做不同的取舍：

| 层级 | 名称 | 方法 | 压缩率 | 信息保留 | 延迟 |
|------|------|------|--------|---------|------|
| L1 | 格式压缩 | 规则引擎 | 10-30% | ~99% | <1ms |
| L2 | 提取压缩 | TF-IDF + TextRank | 30-60% | ~85% | ~10ms |
| L3 | 抽象压缩 | LLM 摘要 | 60-90% | ~70% | ~1s |

### 5.3.1 L1 格式压缩 — 零损耗瘦身

L1 压缩只移除对语义无贡献的格式冗余。它的优势是**完全无损**且极快。

```typescript
// ===== L1 Format Compressor =====
// 无损格式压缩，移除不影响语义的冗余字符

class L1FormatCompressor {
  private rules: Array<{
    name: string;
    pattern: RegExp;
    replacement: string;
    preserveIf?: (match: string) => boolean;
  }>;

  constructor() {
    this.rules = [
      {
        name: "excessive_newlines",
        pattern: /\n{3,}/g,
        replacement: "\n\n",
      },
      {
        name: "trailing_spaces",
        pattern: /[ \t]+$/gm,
        replacement: "",
      },
      {
        name: "multiple_spaces",
        pattern: / {2,}/g,
        replacement: " ",
      },
      {
        name: "empty_list_items",
        pattern: /^[-*+]\s*$/gm,
        replacement: "",
      },
      {
        name: "redundant_separators",
        pattern: /([-=]{3,}\n){2,}/g,
        replacement: "---\n",
      },
      {
        name: "verbose_timestamps",
        pattern: /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.\d{3}Z/g,
        replacement: "$1-$2-$3 $4:$5",
      },
      {
        name: "empty_code_blocks",
        pattern: /```\w*\n\s*\n```/g,
        replacement: "",
      },
      {
        name: "repeated_punctuation",
        pattern: /([。！？，；])\1+/g,
        replacement: "$1",
      },
    ];
  }

  compress(text: string): { result: string; appliedRules: string[] } {
    let result = text;
    const appliedRules: string[] = [];

    for (const rule of this.rules) {
      const before = result;
      result = result.replace(rule.pattern, rule.replacement);
      if (result !== before) {
        appliedRules.push(rule.name);
      }
    }

    return { result, appliedRules };
  }
}
```

### 5.3.2 L2 提取压缩 — 关键句提取

L2 压缩通过 **TextRank** 算法提取关键句，保留最有信息量的内容。

```typescript
// ===== L2 Extractive Compressor =====
// 基于 TextRank 的关键句提取

interface ScoredSentence {
  index: number;
  text: string;
  score: number;
}

class L2ExtractiveCompressor {
  private dampingFactor: number;
  private iterations: number;

  constructor(dampingFactor: number = 0.85, iterations: number = 30) {
    this.dampingFactor = dampingFactor;
    this.iterations = iterations;
  }

  /**
   * 提取关键句，保留 targetRatio 比例的原文
   */
  compress(text: string, targetRatio: number = 0.4): string {
    // 分句
    const sentences = this.splitSentences(text);
    if (sentences.length <= 3) return text;

    // 构建句子相似度图
    const similarityMatrix = this.buildSimilarityMatrix(sentences);

    // TextRank 迭代
    const scores = this.textRank(similarityMatrix);

    // 合并分数和句子
    const scored: ScoredSentence[] = sentences.map((text, index) => ({
      index,
      text,
      score: scores[index],
    }));

    // 按分数排序选择 top-k
    const k = Math.max(
      Math.ceil(sentences.length * targetRatio),
      1
    );
    const topSentences = [...scored]
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    // 按原文顺序输出，保持阅读连贯性
    topSentences.sort((a, b) => a.index - b.index);

    return topSentences.map(s => s.text).join(" ");
  }

  private splitSentences(text: string): string[] {
    // 支持中英文句子分割
    return text
      .split(/(?<=[。！？.!?])\s*/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  private buildSimilarityMatrix(sentences: string[]): number[][] {
    const n = sentences.length;
    const matrix: number[][] = Array.from({ length: n }, () =>
      new Array(n).fill(0)
    );

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const sim = this.sentenceSimilarity(sentences[i], sentences[j]);
        matrix[i][j] = sim;
        matrix[j][i] = sim;
      }
    }

    return matrix;
  }

  private sentenceSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.split(/\s+/));
    const wordsB = new Set(b.split(/\s+/));

    let common = 0;
    for (const word of wordsA) {
      if (wordsB.has(word)) common++;
    }

    const denominator = Math.log(wordsA.size + 1) + Math.log(wordsB.size + 1);
    return denominator === 0 ? 0 : common / denominator;
  }

  private textRank(matrix: number[][]): number[] {
    const n = matrix.length;
    let scores = new Array(n).fill(1 / n);

    for (let iter = 0; iter < this.iterations; iter++) {
      const newScores = new Array(n).fill(0);

      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const outSum = matrix[j].reduce((a, b) => a + b, 0);
          if (outSum > 0) {
            sum += (matrix[j][i] / outSum) * scores[j];
          }
        }
        newScores[i] = (1 - this.dampingFactor) / n +
          this.dampingFactor * sum;
      }

      scores = newScores;
    }

    return scores;
  }
}
```

### 5.3.3 L3 抽象压缩 — LLM 驱动的语义摘要

L3 压缩是最强力的压缩手段，通过调用 LLM 生成语义摘要。压缩率可达 60-90%，但有信息损失。

```typescript
// ===== L3 Abstractive Compressor =====
// LLM 驱动的语义摘要压缩

interface LLMClient {
  complete(prompt: string, maxTokens: number): Promise<string>;
}

class L3AbstractiveCompressor {
  private llm: LLMClient;

  constructor(llm: LLMClient) {
    this.llm = llm;
  }

  /**
   * 使用 LLM 生成语义摘要
   * @param content 待压缩内容
   * @param targetTokens 目标 token 数
   * @param preserveKeys 必须保留的关键信息
   */
  async compress(
    content: string,
    targetTokens: number,
    preserveKeys: string[] = []
  ): Promise<string> {
    const preserveSection = preserveKeys.length > 0
      ? `\n\n必须保留以下关键信息：\n${preserveKeys.map(k => `- ${k}`).join("\n")}`
      : "";

    const prompt = `请将以下内容压缩为约 ${targetTokens} 个 token 的精炼摘要。

要求：
1. 保留所有关键事实、数据和决策
2. 移除重复内容和过渡性语句
3. 使用简洁的陈述句
4. 保持时间顺序
5. 标注不确定信息为 [待确认]
${preserveSection}

原文：
${content}

压缩摘要：`;

    return await this.llm.complete(prompt, targetTokens * 2);
  }
}
```

### 5.3.4 三层压缩编排器 — TieredCompressor

三层压缩需要一个编排器来决定何时使用哪一层。

```typescript
// ===== Tiered Compression Orchestrator =====
// 智能选择压缩层级

interface CompressionPlan {
  level: "L1" | "L2" | "L3" | "L1+L2" | "L1+L2+L3";
  estimatedRatio: number;
  estimatedLatency: string;
  reason: string;
}

class TieredCompressor {
  private l1: L1FormatCompressor;
  private l2: L2ExtractiveCompressor;
  private l3: L3AbstractiveCompressor;

  constructor(llm: LLMClient) {
    this.l1 = new L1FormatCompressor();
    this.l2 = new L2ExtractiveCompressor();
    this.l3 = new L3AbstractiveCompressor(llm);
  }

  /**
   * 根据当前 token 使用率自动选择压缩策略
   */
  plan(
    currentTokens: number,
    maxTokens: number,
    targetUtilization: number = 0.75
  ): CompressionPlan {
    const utilization = currentTokens / maxTokens;
    const targetTokens = maxTokens * targetUtilization;
    const reductionNeeded = 1 - targetTokens / currentTokens;

    if (utilization < 0.7) {
      return {
        level: "L1",
        estimatedRatio: 0.15,
        estimatedLatency: "<1ms",
        reason: "Token 使用率低于 70%，L1 格式压缩即可",
      };
    }

    if (utilization < 0.85) {
      return {
        level: "L1+L2",
        estimatedRatio: 0.45,
        estimatedLatency: "~10ms",
        reason: "Token 使用率 70-85%，需要 L1+L2 组合压缩",
      };
    }

    return {
      level: "L1+L2+L3",
      estimatedRatio: 0.75,
      estimatedLatency: "~1-2s",
      reason: `Token 使用率 ${(utilization * 100).toFixed(0)}% 过高，需要全层级压缩`,
    };
  }

  /**
   * 执行压缩
   */
  async execute(
    content: string,
    plan: CompressionPlan,
    targetTokens?: number
  ): Promise<string> {
    let result = content;

    // 始终执行 L1
    const l1Result = this.l1.compress(result);
    result = l1Result.result;

    if (plan.level === "L1") return result;

    // 执行 L2
    const targetRatio = plan.level === "L1+L2" ? 0.5 : 0.4;
    result = this.l2.compress(result, targetRatio);

    if (plan.level === "L1+L2") return result;

    // 执行 L3
    result = await this.l3.compress(
      result,
      targetTokens || Math.ceil(this.estimateTokens(content) * 0.2)
    );

    return result;
  }

  private estimateTokens(text: string): number {
    const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const other = text.length - chinese;
    return Math.ceil(chinese / 1.5 + other / 4);
  }
}
```

### 5.3.5 Progressive Compaction — 渐进式压实

渐进式压实借鉴了日志系统的 **LSM-Tree 思想**：将上下文按"年龄"分层，越旧的层压缩越狠。

```typescript
// ===== Progressive Compactor =====
// 按时间层级渐进式压实上下文

interface AgeZone {
  name: string;
  maxAge: number;              // 最大年龄（轮次）
  compressionLevel: "L1" | "L2" | "L3";
  retentionRatio: number;      // 目标保留比例
}

interface CompactionResult {
  zones: Array<{
    name: string;
    originalMessages: number;
    compressedContent: string;
    compressionRatio: number;
  }>;
  totalOriginalTokens: number;
  totalCompressedTokens: number;
}

class ProgressiveCompactor {
  private zones: AgeZone[];
  private compressor: TieredCompressor;

  constructor(compressor: TieredCompressor) {
    this.compressor = compressor;

    // 定义时间层级
    this.zones = [
      {
        name: "hot",           // 最近 5 轮
        maxAge: 5,
        compressionLevel: "L1",
        retentionRatio: 0.95,
      },
      {
        name: "warm",          // 6-15 轮
        maxAge: 15,
        compressionLevel: "L1+L2" as any,
        retentionRatio: 0.5,
      },
      {
        name: "cold",          // 16-30 轮
        maxAge: 30,
        compressionLevel: "L1+L2+L3" as any,
        retentionRatio: 0.2,
      },
      {
        name: "archive",       // 31+ 轮
        maxAge: Infinity,
        compressionLevel: "L3",
        retentionRatio: 0.05,
      },
    ];
  }

  /**
   * 对消息历史执行渐进式压实
   */
  async compact(
    messages: Array<{ role: string; content: string }>,
    currentTurn: number
  ): Promise<CompactionResult> {
    const zoneResults: CompactionResult["zones"] = [];
    let totalOriginal = 0;
    let totalCompressed = 0;

    for (const zone of this.zones) {
      // 划分属于当前时间区间的消息
      const zoneMessages = messages.filter((_, idx) => {
        const age = currentTurn - idx;
        const prevMax = this.zones.indexOf(zone) === 0
          ? 0
          : this.zones[this.zones.indexOf(zone) - 1].maxAge;
        return age > prevMax && age <= zone.maxAge;
      });

      if (zoneMessages.length === 0) continue;

      const content = zoneMessages
        .map(m => `[${m.role}]: ${m.content}`)
        .join("\n");

      const originalTokens = this.estimateTokens(content);
      totalOriginal += originalTokens;

      // 构建压缩计划
      const plan: CompressionPlan = {
        level: zone.compressionLevel as any,
        estimatedRatio: 1 - zone.retentionRatio,
        estimatedLatency: zone.compressionLevel === "L3" ? "~1s" : "<10ms",
        reason: `${zone.name} zone: age > ${zone.maxAge} turns`,
      };

      const compressed = await this.compressor.execute(content, plan);
      const compressedTokens = this.estimateTokens(compressed);
      totalCompressed += compressedTokens;

      zoneResults.push({
        name: zone.name,
        originalMessages: zoneMessages.length,
        compressedContent: compressed,
        compressionRatio: 1 - compressedTokens / originalTokens,
      });
    }

    return {
      zones: zoneResults,
      totalOriginalTokens: totalOriginal,
      totalCompressedTokens: totalCompressed,
    };
  }

  private estimateTokens(text: string): number {
    const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const other = text.length - chinese;
    return Math.ceil(chinese / 1.5 + other / 4);
  }
}
```

### 5.3.6 Context Budget Allocator — 上下文预算分配器

在复杂的 Agent 系统中，上下文窗口需要在多个消费者之间分配预算。

```typescript
// ===== Context Budget Allocator =====
// 在多个上下文消费者之间智能分配 token 预算

interface BudgetConsumer {
  name: string;
  minTokens: number;          // 最低需求（不满足则不分配）
  maxTokens: number;          // 最大需求
  priority: number;           // 1-10, 越高越优先
  currentTokens: number;      // 当前实际使用
  elasticity: number;         // 弹性系数 0-1（1=可被大幅压缩，0=不可压缩）
}

interface AllocationResult {
  allocations: Map<string, number>;
  totalAllocated: number;
  remainingBudget: number;
  overBudgetConsumers: string[];    // 被削减的消费者
}

class ContextBudgetAllocator {
  private consumers: BudgetConsumer[] = [];
  private totalBudget: number;

  constructor(totalBudget: number) {
    this.totalBudget = totalBudget;
  }

  register(consumer: BudgetConsumer): void {
    this.consumers.push(consumer);
  }

  /**
   * 执行预算分配
   * 算法：优先保证高优先级消费者的最低需求，然后按优先级分配剩余预算
   */
  allocate(): AllocationResult {
    const allocations = new Map<string, number>();
    const overBudgetConsumers: string[] = [];

    // Step 1: 按优先级排序
    const sorted = [...this.consumers].sort(
      (a, b) => b.priority - a.priority
    );

    // Step 2: 先满足所有消费者的最低需求
    let remaining = this.totalBudget;
    const eligible: BudgetConsumer[] = [];

    for (const consumer of sorted) {
      if (remaining >= consumer.minTokens) {
        allocations.set(consumer.name, consumer.minTokens);
        remaining -= consumer.minTokens;
        eligible.push(consumer);
      } else {
        allocations.set(consumer.name, 0);
        overBudgetConsumers.push(consumer.name);
      }
    }

    // Step 3: 按优先级加权分配剩余预算
    if (remaining > 0 && eligible.length > 0) {
      const totalPriority = eligible.reduce(
        (sum, c) => sum + c.priority,
        0
      );

      for (const consumer of eligible) {
        const extra = Math.min(
          Math.floor(remaining * (consumer.priority / totalPriority)),
          consumer.maxTokens - consumer.minTokens
        );
        const current = allocations.get(consumer.name) || 0;
        allocations.set(consumer.name, current + extra);
      }
    }

    // 计算总分配量
    let totalAllocated = 0;
    for (const tokens of allocations.values()) {
      totalAllocated += tokens;
    }

    return {
      allocations,
      totalAllocated,
      remainingBudget: this.totalBudget - totalAllocated,
      overBudgetConsumers,
    };
  }

  /**
   * 动态再平衡：当某个消费者超支时，从低优先级的弹性消费者处借用
   */
  rebalance(
    overBudgetConsumer: string,
    extraNeeded: number
  ): Map<string, number> | null {
    const adjustments = new Map<string, number>();

    // 找出可被压缩的低优先级消费者
    const target = this.consumers.find(c => c.name === overBudgetConsumer);
    if (!target) return null;

    const donors = this.consumers
      .filter(
        c =>
          c.name !== overBudgetConsumer &&
          c.priority < target.priority &&
          c.elasticity > 0.3
      )
      .sort((a, b) => a.priority - b.priority);

    let collected = 0;
    for (const donor of donors) {
      if (collected >= extraNeeded) break;
      const canGive = Math.floor(
        (donor.currentTokens - donor.minTokens) * donor.elasticity
      );
      const give = Math.min(canGive, extraNeeded - collected);
      if (give > 0) {
        adjustments.set(donor.name, -give);
        collected += give;
      }
    }

    if (collected >= extraNeeded) {
      adjustments.set(overBudgetConsumer, collected);
      return adjustments;
    }

    return null; // 无法满足，返回 null 表示需要触发压缩
  }
}
```

> **预算分配的典型配置**：
> - System Prompt: priority=10, elasticity=0.1 (几乎不可压缩)
> - 工具结果: priority=8, elasticity=0.5
> - 对话历史: priority=6, elasticity=0.8 (最可压缩)
> - 持久化笔记: priority=7, elasticity=0.3
> - Few-shot 示例: priority=5, elasticity=0.9

---


## 5.4 Structured Notes — 结构化笔记与 Scratchpad 模式

Agent 在执行复杂任务时，需要一个**持久化的中间状态存储**——类似人类的笔记本。结构化笔记（Structured Notes）和 Scratchpad 模式为 Agent 提供了这种能力。

### 5.4.1 NOTES.md 模式 — Agent 的记事本

**NOTES.md 模式**的核心思想：在每次 LLM 调用之间，维护一份结构化的 Markdown 笔记，记录事实、决策、待办事项和洞察。

```typescript
// ===== Structured Notes Manager =====
// Agent 的结构化笔记系统

enum NoteCategory {
  Fact = "fact",                 // 确认的事实
  Hypothesis = "hypothesis",     // 假设（待验证）
  Decision = "decision",         // 已做出的决策
  Todo = "todo",                 // 待执行的任务
  Insight = "insight",           // 洞察和发现
  UserPreference = "preference", // 用户偏好
  Error = "error",               // 遇到的错误和解决方案
}

interface NoteItem {
  id: string;
  category: NoteCategory;
  content: string;
  confidence: number;            // 0-1 置信度
  createdAt: number;
  updatedAt: number;
  relatedNoteIds: string[];      // 关联笔记
  status: "active" | "archived" | "invalidated";
  source: string;                // 来源（哪个工具、哪轮对话）
  tags: string[];
}

interface NotesSnapshot {
  version: number;
  lastUpdated: number;
  items: NoteItem[];
  summary: string;               // 自动生成的笔记摘要
}

class StructuredNotesManager {
  private notes: Map<string, NoteItem> = new Map();
  private version: number = 0;
  private maxNotesPerCategory: number;

  constructor(maxNotesPerCategory: number = 50) {
    this.maxNotesPerCategory = maxNotesPerCategory;
  }

  /**
   * 添加新笔记
   */
  addNote(
    category: NoteCategory,
    content: string,
    options: {
      confidence?: number;
      source?: string;
      tags?: string[];
      relatedNoteIds?: string[];
    } = {}
  ): NoteItem {
    const id = `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const note: NoteItem = {
      id,
      category,
      content,
      confidence: options.confidence ?? 0.8,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      relatedNoteIds: options.relatedNoteIds || [],
      status: "active",
      source: options.source || "unknown",
      tags: options.tags || [],
    };

    this.notes.set(id, note);
    this.version++;

    // 自动清理：如果某类别超出限制，归档最旧的
    this.enforceLimit(category);

    return note;
  }

  /**
   * 更新已有笔记
   */
  updateNote(
    id: string,
    updates: Partial<Pick<NoteItem, "content" | "confidence" | "status" | "tags">>
  ): NoteItem | null {
    const note = this.notes.get(id);
    if (!note) return null;

    if (updates.content !== undefined) note.content = updates.content;
    if (updates.confidence !== undefined) note.confidence = updates.confidence;
    if (updates.status !== undefined) note.status = updates.status;
    if (updates.tags !== undefined) note.tags = updates.tags;

    note.updatedAt = Date.now();
    this.version++;

    return note;
  }

  /**
   * 将 todo 标记为完成
   */
  completeTodo(id: string, result: string): NoteItem | null {
    const note = this.notes.get(id);
    if (!note || note.category !== NoteCategory.Todo) return null;

    note.status = "archived";
    note.content += ` [DONE: ${result}]`;
    note.updatedAt = Date.now();
    this.version++;

    // 添加一条结果笔记
    this.addNote(NoteCategory.Fact, result, {
      source: `todo_completion:${id}`,
      relatedNoteIds: [id],
    });

    return note;
  }

  /**
   * 导出为 Markdown 格式（用于注入 LLM 上下文）
   */
  toMarkdown(): string {
    const sections: string[] = ["# Agent Notes (v" + this.version + ")"];
    const categoryOrder: NoteCategory[] = [
      NoteCategory.Todo,
      NoteCategory.Decision,
      NoteCategory.Fact,
      NoteCategory.Hypothesis,
      NoteCategory.Insight,
      NoteCategory.UserPreference,
      NoteCategory.Error,
    ];

    for (const category of categoryOrder) {
      const items = this.getByCategory(category);
      if (items.length === 0) continue;

      sections.push(`\n## ${this.categoryLabel(category)}`);

      for (const item of items) {
        const confidence = item.confidence < 0.5
          ? " [LOW CONFIDENCE]"
          : "";
        const statusIcon = item.status === "archived" ? "~~" : "";
        sections.push(
          `- ${statusIcon}${item.content}${statusIcon}${confidence}`
        );
      }
    }

    return sections.join("\n");
  }

  /**
   * 导出为紧凑格式（当 token 预算紧张时使用）
   */
  toCompactContext(maxTokens: number): string {
    const active = [...this.notes.values()]
      .filter(n => n.status === "active")
      .sort((a, b) => {
        // 优先级：todo > decision > fact > others
        const priorityMap: Record<string, number> = {
          todo: 4,
          decision: 3,
          fact: 2,
          hypothesis: 1,
          insight: 1,
          preference: 2,
          error: 1,
        };
        return (
          (priorityMap[b.category] || 0) - (priorityMap[a.category] || 0)
        );
      });

    const lines: string[] = ["[NOTES]"];
    let estimatedTokens = 5;

    for (const note of active) {
      const line = `${note.category.toUpperCase()}: ${note.content}`;
      const lineTokens = Math.ceil(line.length / 4); // 简化估算，与全书统一使用 ~4 字符/token
      if (estimatedTokens + lineTokens > maxTokens) break;
      lines.push(line);
      estimatedTokens += lineTokens;
    }

    lines.push("[/NOTES]");
    return lines.join("\n");
  }

  /**
   * 查找与给定话题相关的笔记
   */
  findRelated(query: string, topK: number = 5): NoteItem[] {
    const queryWords = new Set(
      query.toLowerCase().split(/\s+/)
    );

    const scored = [...this.notes.values()]
      .filter(n => n.status === "active")
      .map(note => {
        const noteWords = note.content.toLowerCase().split(/\s+/);
        let overlap = 0;
        for (const word of noteWords) {
          if (queryWords.has(word)) overlap++;
        }
        return {
          note,
          score: overlap / Math.max(queryWords.size, 1),
        };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map(item => item.note);
  }

  private getByCategory(category: NoteCategory): NoteItem[] {
    return [...this.notes.values()]
      .filter(n => n.category === category && n.status === "active")
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private enforceLimit(category: NoteCategory): void {
    const items = this.getByCategory(category);
    if (items.length > this.maxNotesPerCategory) {
      // 归档最旧的
      const toArchive = items.slice(this.maxNotesPerCategory);
      for (const item of toArchive) {
        item.status = "archived";
      }
    }
  }

  private categoryLabel(category: NoteCategory): string {
    const labels: Record<string, string> = {
      fact: "Facts (已确认事实)",
      hypothesis: "Hypotheses (待验证假设)",
      decision: "Decisions (已做决策)",
      todo: "TODOs (待办任务)",
      insight: "Insights (发现洞察)",
      preference: "User Preferences (用户偏好)",
      error: "Errors & Fixes (错误修复记录)",
    };
    return labels[category] || category;
  }
}
```

### 5.4.2 Scratchpad 模式 — Agent 的思维草稿

Scratchpad 模式为 Agent 提供一个**思维工作区**，让 Agent 在多步推理过程中记录中间结果、计划调整和推理链。

```typescript
// ===== Scratchpad Manager =====
// Agent 的思维草稿工作区

interface ScratchpadSection {
  name: string;
  content: string;
  maxLines: number;
  autoTruncate: boolean;      // 超出 maxLines 时是否自动截断旧内容
}

interface ScratchpadConfig {
  sections: ScratchpadSection[];
  maxTotalTokens: number;
  snapshotInterval: number;   // 每 N 次更新保存一个快照
}

class ScratchpadManager {
  private sections: Map<string, ScratchpadSection>;
  private history: Array<{
    timestamp: number;
    snapshot: Map<string, string>;
  }> = [];
  private updateCount: number = 0;
  private config: ScratchpadConfig;

  constructor(config?: Partial<ScratchpadConfig>) {
    this.config = {
      sections: [
        {
          name: "current_plan",
          content: "",
          maxLines: 20,
          autoTruncate: false,
        },
        {
          name: "working_hypothesis",
          content: "",
          maxLines: 10,
          autoTruncate: true,
        },
        {
          name: "intermediate_results",
          content: "",
          maxLines: 30,
          autoTruncate: true,
        },
        {
          name: "open_questions",
          content: "",
          maxLines: 15,
          autoTruncate: true,
        },
        {
          name: "error_log",
          content: "",
          maxLines: 20,
          autoTruncate: true,
        },
      ],
      maxTotalTokens: 2000,
      snapshotInterval: 5,
      ...config,
    };

    this.sections = new Map();
    for (const section of this.config.sections) {
      this.sections.set(section.name, { ...section });
    }
  }

  /**
   * 向指定 section 追加内容
   */
  append(sectionName: string, content: string): void {
    const section = this.sections.get(sectionName);
    if (!section) {
      throw new Error(`Unknown scratchpad section: ${sectionName}`);
    }

    section.content += (section.content ? "\n" : "") + content;

    // 自动截断
    if (section.autoTruncate) {
      const lines = section.content.split("\n");
      if (lines.length > section.maxLines) {
        section.content = lines.slice(-section.maxLines).join("\n");
      }
    }

    this.updateCount++;
    this.maybeSnapshot();
  }

  /**
   * 替换指定 section 的内容
   */
  replace(sectionName: string, content: string): void {
    const section = this.sections.get(sectionName);
    if (!section) {
      throw new Error(`Unknown scratchpad section: ${sectionName}`);
    }

    section.content = content;
    this.updateCount++;
    this.maybeSnapshot();
  }

  /**
   * 清空指定 section
   */
  clear(sectionName: string): void {
    const section = this.sections.get(sectionName);
    if (section) {
      section.content = "";
      this.updateCount++;
    }
  }

  /**
   * 导出为 LLM 可读的格式
   */
  toContext(): string {
    const parts: string[] = ["<scratchpad>"];

    for (const [name, section] of this.sections) {
      if (section.content.trim()) {
        parts.push(`  <${name}>`);
        parts.push(`    ${section.content.replace(/\n/g, "\n    ")}`);
        parts.push(`  </${name}>`);
      }
    }

    parts.push("</scratchpad>");
    return parts.join("\n");
  }

  /**
   * 获取指定 section 的内容
   */
  getSection(name: string): string | null {
    const section = this.sections.get(name);
    return section ? section.content : null;
  }

  /**
   * 获取历史快照（用于回溯 Agent 的思维过程）
   */
  getHistory(): Array<{
    timestamp: number;
    snapshot: Record<string, string>;
  }> {
    return this.history.map(h => ({
      timestamp: h.timestamp,
      snapshot: Object.fromEntries(h.snapshot),
    }));
  }

  private maybeSnapshot(): void {
    if (this.updateCount % this.config.snapshotInterval === 0) {
      const snapshot = new Map<string, string>();
      for (const [name, section] of this.sections) {
        snapshot.set(name, section.content);
      }
      this.history.push({ timestamp: Date.now(), snapshot });

      // 只保留最近 20 个快照
      if (this.history.length > 20) {
        this.history = this.history.slice(-20);
      }
    }
  }
}
```

### 5.4.3 Auto-Update Triggers — 自动更新触发器

笔记和 Scratchpad 不应仅依赖 Agent 主动更新。我们设计一套**自动触发器**，在特定事件发生时自动更新笔记。

```typescript
// ===== Auto-Update Trigger System =====
// 事件驱动的笔记自动更新

enum TriggerEvent {
  ToolCallSuccess = "tool_call_success",
  ToolCallFailure = "tool_call_failure",
  UserCorrection = "user_correction",
  PlanChange = "plan_change",
  NewFactDiscovered = "new_fact",
  ConflictDetected = "conflict",
  MilestoneReached = "milestone",
  ErrorEncountered = "error",
}

interface TriggerRule {
  event: TriggerEvent;
  condition?: (payload: Record<string, unknown>) => boolean;
  action: (
    payload: Record<string, unknown>,
    notes: StructuredNotesManager,
    scratchpad: ScratchpadManager
  ) => void;
}

class UpdateTriggerEngine {
  private rules: TriggerRule[] = [];

  constructor(
    private notes: StructuredNotesManager,
    private scratchpad: ScratchpadManager
  ) {
    this.registerDefaultRules();
  }

  /**
   * 注册自定义触发规则
   */
  registerRule(rule: TriggerRule): void {
    this.rules.push(rule);
  }

  /**
   * 触发事件
   */
  fire(event: TriggerEvent, payload: Record<string, unknown> = {}): void {
    for (const rule of this.rules) {
      if (rule.event !== event) continue;
      if (rule.condition && !rule.condition(payload)) continue;

      try {
        rule.action(payload, this.notes, this.scratchpad);
      } catch (error) {
        console.error(`Trigger rule failed for event ${event}:`, error);
      }
    }
  }

  private registerDefaultRules(): void {
    // 工具调用成功 → 记录结果
    this.rules.push({
      event: TriggerEvent.ToolCallSuccess,
      action: (payload, notes, scratchpad) => {
        const toolName = payload.toolName as string;
        const result = payload.result as string;
        notes.addNote(
          NoteCategory.Fact,
          `工具 ${toolName} 返回: ${result.slice(0, 200)}`,
          { source: `tool:${toolName}`, tags: [toolName] }
        );
        scratchpad.append(
          "intermediate_results",
          `[${toolName}] ${result.slice(0, 100)}`
        );
      },
    });

    // 工具调用失败 → 记录错误
    this.rules.push({
      event: TriggerEvent.ToolCallFailure,
      action: (payload, notes, scratchpad) => {
        const toolName = payload.toolName as string;
        const error = payload.error as string;
        notes.addNote(
          NoteCategory.Error,
          `工具 ${toolName} 失败: ${error}`,
          { source: `tool:${toolName}`, tags: [toolName, "error"] }
        );
        scratchpad.append(
          "error_log",
          `[FAIL] ${toolName}: ${error}`
        );
      },
    });

    // 用户纠正 → 更新假设
    this.rules.push({
      event: TriggerEvent.UserCorrection,
      action: (payload, notes, scratchpad) => {
        const oldValue = payload.oldValue as string;
        const newValue = payload.newValue as string;
        notes.addNote(
          NoteCategory.Fact,
          `用户纠正: "${oldValue}" → "${newValue}"`,
          { confidence: 1.0, source: "user_correction", tags: ["correction"] }
        );
        // 将被纠正的相关假设标记为失效
        const related = notes.findRelated(oldValue, 3);
        for (const note of related) {
          if (note.category === NoteCategory.Hypothesis) {
            notes.updateNote(note.id, { status: "invalidated" });
          }
        }
      },
    });

    // 计划变更 → 更新 scratchpad
    this.rules.push({
      event: TriggerEvent.PlanChange,
      action: (payload, notes, scratchpad) => {
        const newPlan = payload.newPlan as string;
        const reason = payload.reason as string;
        scratchpad.replace("current_plan", newPlan);
        notes.addNote(
          NoteCategory.Decision,
          `计划变更: ${reason}`,
          { source: "plan_change" }
        );
      },
    });

    // 发现冲突 → 记录并提问
    this.rules.push({
      event: TriggerEvent.ConflictDetected,
      action: (payload, notes, scratchpad) => {
        const description = payload.description as string;
        scratchpad.append("open_questions", `[CONFLICT] ${description}`);
        notes.addNote(
          NoteCategory.Hypothesis,
          `检测到冲突: ${description}`,
          { confidence: 0.5, tags: ["conflict"] }
        );
      },
    });
  }
}
```

> **设计哲学**：自动触发器将"记笔记"的负担从 LLM 转移到了确定性代码上。LLM 不需要在每次输出中显式地说"我现在把这个记下来"，框架会自动捕获关键事件并更新笔记。这不仅减少了 LLM 的输出 token，还保证了笔记的完整性和一致性。

---

## 5.5 Context Passing Strategies — 上下文传递策略

在多 Agent 架构中，Agent 之间如何传递上下文是一个核心设计决策。不同的传递策略在**信息保真度**、**token 开销**和**隐私保护**之间有不同的取舍。

### 5.5.1 四种传递模式对比

| 策略 | 传递内容 | Token 开销 | 信息保真度 | 延迟 | 适用场景 |
|------|---------|-----------|-----------|------|---------|
| Full Pass | 完整上下文 | 高 | 100% | 低 | 简单链式调用 |
| Summary Pass | 压缩摘要 | 低 | ~70% | 中（需LLM） | 跨 Agent 协作 |
| Selective Pass | 按需选择 | 中 | ~90% | 低 | 隐私敏感场景 |
| Pointer Pass | 引用指针 | 极低 | ~100%* | 取决于存储 | 大上下文共享 |

*Pointer Pass 的信息保真度依赖于存储系统的持久性。

```typescript
// ===== Context Passing Framework =====
// 多 Agent 间的上下文传递

enum PassingStrategy {
  FullPass = "full",
  SummaryPass = "summary",
  SelectivePass = "selective",
  PointerPass = "pointer",
}

interface ContextPassPayload {
  strategy: PassingStrategy;
  content: string | null;          // FullPass/SummaryPass/SelectivePass 使用
  pointer: string | null;          // PointerPass 使用（指向共享存储的 key）
  metadata: {
    sourceAgent: string;
    targetAgent: string;
    timestamp: number;
    originalTokens: number;
    passedTokens: number;
    compressionRatio: number;
  };
}

interface SharedContextStore {
  put(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

class ContextPasser {
  private store: SharedContextStore;
  private compressor: TieredCompressor;

  constructor(store: SharedContextStore, compressor: TieredCompressor) {
    this.store = store;
    this.compressor = compressor;
  }

  /**
   * 按指定策略传递上下文
   */
  async pass(
    context: string,
    strategy: PassingStrategy,
    options: {
      sourceAgent: string;
      targetAgent: string;
      selectKeys?: string[];         // SelectivePass 需要
      summaryTargetTokens?: number;  // SummaryPass 需要
    }
  ): Promise<ContextPassPayload> {
    const originalTokens = this.estimateTokens(context);
    let content: string | null = null;
    let pointer: string | null = null;
    let passedTokens = 0;

    switch (strategy) {
      case PassingStrategy.FullPass:
        content = context;
        passedTokens = originalTokens;
        break;

      case PassingStrategy.SummaryPass: {
        const target = options.summaryTargetTokens || Math.ceil(originalTokens * 0.3);
        const plan = this.compressor.plan(originalTokens, target * 3, 0.33);
        content = await this.compressor.execute(context, plan, target);
        passedTokens = this.estimateTokens(content);
        break;
      }

      case PassingStrategy.SelectivePass: {
        if (!options.selectKeys || options.selectKeys.length === 0) {
          throw new Error("SelectivePass requires selectKeys");
        }
        content = this.extractSelectedContext(context, options.selectKeys);
        passedTokens = this.estimateTokens(content);
        break;
      }

      case PassingStrategy.PointerPass: {
        const key = `ctx_${options.sourceAgent}_to_${options.targetAgent}_${Date.now()}`;
        await this.store.put(key, context);
        pointer = key;
        passedTokens = this.estimateTokens(key); // 几乎为 0
        break;
      }
    }

    return {
      strategy,
      content,
      pointer,
      metadata: {
        sourceAgent: options.sourceAgent,
        targetAgent: options.targetAgent,
        timestamp: Date.now(),
        originalTokens,
        passedTokens,
        compressionRatio: 1 - passedTokens / originalTokens,
      },
    };
  }

  /**
   * 接收方解析传递的上下文
   */
  async receive(payload: ContextPassPayload): Promise<string> {
    if (payload.content !== null) {
      return payload.content;
    }

    if (payload.pointer !== null) {
      const content = await this.store.get(payload.pointer);
      if (content === null) {
        throw new Error(
          `Context pointer ${payload.pointer} not found in store`
        );
      }
      return content;
    }

    throw new Error("Invalid payload: neither content nor pointer");
  }

  private extractSelectedContext(
    context: string,
    keys: string[]
  ): string {
    const sections: string[] = [];

    for (const key of keys) {
      // 尝试提取 XML 标签包裹的内容
      const xmlPattern = new RegExp(
        `<${key}[^>]*>([\\s\\S]*?)</${key}>`,
        "gi"
      );
      const xmlMatch = context.match(xmlPattern);
      if (xmlMatch) {
        sections.push(xmlMatch[0]);
        continue;
      }

      // 尝试提取 Markdown 标题下的内容
      const mdPattern = new RegExp(
        `^#+\\s*${key}[\\s\\S]*?(?=^#+\\s|$)`,
        "gim"
      );
      const mdMatch = context.match(mdPattern);
      if (mdMatch) {
        sections.push(mdMatch[0]);
      }
    }

    return sections.join("\n\n");
  }

  private estimateTokens(text: string): number {
    const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const other = text.length - chinese;
    return Math.ceil(chinese / 1.5 + other / 4);
  }
}
```

### 5.5.2 Context Assembly Pipeline — 上下文组装流水线

在实际系统中，一次 LLM 调用的上下文来自多个来源：System Prompt、用户输入、工具结果、历史摘要、笔记等。**上下文组装流水线** 将这些来源统一管理、按优先级拼装。

```typescript
// ===== Context Assembly Pipeline =====
// 多源上下文组装与优化

interface ContextPipelineStage {
  name: string;
  order: number;                     // 执行顺序（越小越先执行）
  process: (ctx: PipelineContext) => Promise<PipelineContext>;
}

interface PipelineContext {
  parts: Array<{
    source: string;
    content: string;
    priority: number;
    tokenCount: number;
    compressible: boolean;
  }>;
  tokenBudget: number;
  usedTokens: number;
  metadata: Record<string, unknown>;
}

class ContextAssemblyPipeline {
  private stages: ContextPipelineStage[] = [];

  /**
   * 注册处理阶段
   */
  addStage(stage: ContextPipelineStage): void {
    this.stages.push(stage);
    this.stages.sort((a, b) => a.order - b.order);
  }

  /**
   * 执行流水线
   */
  async assemble(
    tokenBudget: number,
    initialParts: PipelineContext["parts"] = []
  ): Promise<{ context: string; report: AssemblyReport }> {
    let ctx: PipelineContext = {
      parts: initialParts,
      tokenBudget,
      usedTokens: 0,
      metadata: {},
    };

    // 依次执行每个阶段
    for (const stage of this.stages) {
      try {
        ctx = await stage.process(ctx);
      } catch (error) {
        console.error(`Pipeline stage ${stage.name} failed:`, error);
      }
    }

    // 最终组装
    const finalParts = ctx.parts
      .sort((a, b) => b.priority - a.priority)
      .filter(p => p.content.trim().length > 0);

    // 贪心填充，直到预算用完
    const selected: typeof finalParts = [];
    let totalTokens = 0;

    for (const part of finalParts) {
      if (totalTokens + part.tokenCount <= tokenBudget) {
        selected.push(part);
        totalTokens += part.tokenCount;
      } else if (part.compressible) {
        // 尝试压缩后再放入
        const available = tokenBudget - totalTokens;
        if (available > 100) {
          // 至少 100 token 才值得压缩
          const ratio = available / part.tokenCount;
          const compressed = part.content.slice(
            0,
            Math.floor(part.content.length * ratio)
          );
          selected.push({
            ...part,
            content: compressed + "\n[...truncated]",
            tokenCount: available,
          });
          totalTokens += available;
        }
      }
    }

    const context = selected
      .map(p => `<!-- source: ${p.source} -->\n${p.content}`)
      .join("\n\n");

    const report: AssemblyReport = {
      totalTokens,
      budgetUtilization: totalTokens / tokenBudget,
      includedSources: selected.map(p => p.source),
      excludedSources: finalParts
        .filter(p => !selected.includes(p))
        .map(p => p.source),
      stagesExecuted: this.stages.map(s => s.name),
    };

    return { context, report };
  }
}

interface AssemblyReport {
  totalTokens: number;
  budgetUtilization: number;
  includedSources: string[];
  excludedSources: string[];
  stagesExecuted: string[];
}

// ===== 预置的 Pipeline 阶段 =====

/** 阶段 1: 注入 System Prompt */
function createSystemPromptStage(
  builder: SystemPromptBuilder
): ContextPipelineStage {
  return {
    name: "system_prompt",
    order: 10,
    process: async (ctx) => {
      const prompt = builder.build();
      ctx.parts.push({
        source: "system_prompt",
        content: prompt,
        priority: 100,
        tokenCount: estimateTokens(prompt),
        compressible: false,
      });
      return ctx;
    },
  };
}

/** 阶段 2: 加载持久化笔记 */
function createNotesStage(
  notes: StructuredNotesManager,
  maxTokens: number = 500
): ContextPipelineStage {
  return {
    name: "notes",
    order: 20,
    process: async (ctx) => {
      const notesContent = notes.toCompactContext(maxTokens);
      ctx.parts.push({
        source: "structured_notes",
        content: notesContent,
        priority: 70,
        tokenCount: estimateTokens(notesContent),
        compressible: true,
      });
      return ctx;
    },
  };
}

/** 阶段 3: 注入 Scratchpad */
function createScratchpadStage(
  scratchpad: ScratchpadManager
): ContextPipelineStage {
  return {
    name: "scratchpad",
    order: 30,
    process: async (ctx) => {
      const pad = scratchpad.toContext();
      ctx.parts.push({
        source: "scratchpad",
        content: pad,
        priority: 80,
        tokenCount: estimateTokens(pad),
        compressible: true,
      });
      return ctx;
    },
  };
}

/** 阶段 4: 去重与冲突消解 */
function createDeduplicationStage(): ContextPipelineStage {
  return {
    name: "deduplication",
    order: 90,
    process: async (ctx) => {
      const hasher = new SimHasher(64);
      const seen: Array<{ hash: bigint; index: number }> = [];
      const toRemove: Set<number> = new Set();

      for (let i = 0; i < ctx.parts.length; i++) {
        const hash = hasher.computeHash(ctx.parts[i].content);
        for (const prev of seen) {
          if (hasher.hammingDistance(hash, prev.hash) <= 5) {
            // 保留优先级高的
            if (ctx.parts[i].priority < ctx.parts[prev.index].priority) {
              toRemove.add(i);
            } else {
              toRemove.add(prev.index);
            }
          }
        }
        seen.push({ hash, index: i });
      }

      ctx.parts = ctx.parts.filter((_, i) => !toRemove.has(i));
      return ctx;
    },
  };
}

function estimateTokens(text: string): number {
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const other = text.length - chinese;
  return Math.ceil(chinese / 1.5 + other / 4);
}
```

> **Pipeline 的可扩展性**：开发者可以轻松添加自定义阶段——例如"注入 RAG 检索结果"、"加载用户画像"、"注入实时工具文档"等。每个阶段独立工作，通过共享的 `PipelineContext` 协作。

---


## 5.6 Long Conversation Management — 长对话管理

当对话超过 100+ 轮时，上下文管理面临质的挑战。简单的滑动窗口无法满足需求——用户可能在第 3 轮提到的一个关键约束，在第 150 轮仍然有效。本节探讨长对话的系统化管理方案。

### 5.6.1 对话阶段检测

长对话通常包含多个**自然阶段**——需求澄清、方案探讨、实施细节、问题排查等。自动检测阶段边界，有助于为每个阶段维护独立的上下文摘要。

```typescript
// ===== Conversation Phase Detector =====
// 自动检测长对话中的阶段转换

interface ConversationPhase {
  id: string;
  name: string;
  startTurn: number;
  endTurn: number | null;         // null 表示当前阶段
  summary: string;
  keyDecisions: string[];
  openQuestions: string[];
  tokenCount: number;
}

interface PhaseTransitionSignal {
  confidence: number;              // 0-1
  fromPhase: string;
  toPhase: string;
  trigger: string;                 // 触发转换的原因
}

class ConversationPhaseDetector {
  private phases: ConversationPhase[] = [];
  private turnCount: number = 0;
  private transitionPatterns: Array<{
    pattern: RegExp;
    fromPhase: string;
    toPhase: string;
  }>;

  constructor() {
    this.transitionPatterns = [
      {
        pattern: /(?:好的|那么|接下来).*(?:实现|开发|编码|写代码)/,
        fromPhase: "planning",
        toPhase: "implementation",
      },
      {
        pattern: /(?:出错|报错|bug|问题|异常|失败)/i,
        fromPhase: "implementation",
        toPhase: "debugging",
      },
      {
        pattern: /(?:测试|验证|确认|检查)/,
        fromPhase: "debugging",
        toPhase: "testing",
      },
      {
        pattern: /(?:总结|回顾|完成|上线|部署)/,
        fromPhase: "testing",
        toPhase: "review",
      },
      {
        pattern: /(?:新的需求|另外|还有一个|换个话题)/,
        fromPhase: "*",
        toPhase: "new_topic",
      },
    ];
  }

  /**
   * 分析新消息，检测是否发生阶段转换
   */
  analyzeMessage(
    message: { role: string; content: string },
    currentPhaseId: string
  ): PhaseTransitionSignal | null {
    this.turnCount++;

    for (const { pattern, fromPhase, toPhase } of this.transitionPatterns) {
      if (fromPhase !== "*" && fromPhase !== currentPhaseId) continue;
      if (!pattern.test(message.content)) continue;

      return {
        confidence: 0.7,
        fromPhase: currentPhaseId,
        toPhase,
        trigger: `Pattern match: ${pattern.source}`,
      };
    }

    // 基于话题密度变化的转换检测
    if (this.turnCount % 10 === 0) {
      const signal = this.detectDensityShift();
      if (signal) return signal;
    }

    return null;
  }

  /**
   * 开始新阶段
   */
  startPhase(name: string, initialSummary: string = ""): ConversationPhase {
    // 关闭上一个阶段
    if (this.phases.length > 0) {
      const lastPhase = this.phases[this.phases.length - 1];
      lastPhase.endTurn = this.turnCount - 1;
    }

    const phase: ConversationPhase = {
      id: `phase_${this.phases.length + 1}`,
      name,
      startTurn: this.turnCount,
      endTurn: null,
      summary: initialSummary,
      keyDecisions: [],
      openQuestions: [],
      tokenCount: 0,
    };

    this.phases.push(phase);
    return phase;
  }

  /**
   * 获取所有阶段的概要（用于上下文注入）
   */
  getPhaseSummaries(): string {
    return this.phases
      .map(phase => {
        const status = phase.endTurn === null ? "[ACTIVE]" : "[COMPLETED]";
        const turns = phase.endTurn
          ? `turns ${phase.startTurn}-${phase.endTurn}`
          : `turns ${phase.startTurn}-present`;
        const decisions = phase.keyDecisions.length > 0
          ? `\n    Decisions: ${phase.keyDecisions.join("; ")}`
          : "";
        const questions = phase.openQuestions.length > 0
          ? `\n    Open: ${phase.openQuestions.join("; ")}`
          : "";
        return `  ${status} ${phase.name} (${turns}): ${phase.summary}${decisions}${questions}`;
      })
      .join("\n");
  }

  /**
   * 获取当前阶段
   */
  getCurrentPhase(): ConversationPhase | null {
    if (this.phases.length === 0) return null;
    const last = this.phases[this.phases.length - 1];
    return last.endTurn === null ? last : null;
  }

  private detectDensityShift(): PhaseTransitionSignal | null {
    // 简化实现：实际项目中会分析 embedding 变化
    return null;
  }
}
```

### 5.6.2 Topic Boundary Detection — 话题边界检测

话题边界检测比阶段检测更细粒度，它识别对话中**每一次话题切换**。

```typescript
// ===== Topic Boundary Detector =====
// 检测对话中的话题切换边界

interface TopicSegment {
  startTurn: number;
  endTurn: number;
  mainTopic: string;
  keywords: string[];
  summary: string;
  importance: number;           // 0-1, 对最终任务的重要性
}

class TopicBoundaryDetector {
  private windowSize: number;
  private similarityThreshold: number;

  constructor(
    windowSize: number = 3,
    similarityThreshold: number = 0.3
  ) {
    this.windowSize = windowSize;
    this.similarityThreshold = similarityThreshold;
  }

  /**
   * 检测消息序列中的话题边界
   * 返回话题段列表，每段包含起止轮次和主题
   */
  detectBoundaries(
    messages: Array<{ role: string; content: string }>
  ): TopicSegment[] {
    if (messages.length < this.windowSize * 2) {
      // 消息太少，视为单一话题
      return [{
        startTurn: 0,
        endTurn: messages.length - 1,
        mainTopic: this.extractMainTopic(messages.map(m => m.content)),
        keywords: this.extractKeywords(
          messages.map(m => m.content).join(" ")
        ),
        summary: "",
        importance: 1,
      }];
    }

    const boundaries: number[] = [0]; // 第一个边界总是 0

    for (let i = this.windowSize; i < messages.length - this.windowSize; i++) {
      const leftWindow = messages
        .slice(i - this.windowSize, i)
        .map(m => m.content)
        .join(" ");
      const rightWindow = messages
        .slice(i, i + this.windowSize)
        .map(m => m.content)
        .join(" ");

      const similarity = this.computeTextSimilarity(leftWindow, rightWindow);

      if (similarity < this.similarityThreshold) {
        boundaries.push(i);
      }
    }

    boundaries.push(messages.length);

    // 构建话题段
    const segments: TopicSegment[] = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
      const start = boundaries[i];
      const end = boundaries[i + 1] - 1;
      const segmentMessages = messages.slice(start, end + 1);

      segments.push({
        startTurn: start,
        endTurn: end,
        mainTopic: this.extractMainTopic(
          segmentMessages.map(m => m.content)
        ),
        keywords: this.extractKeywords(
          segmentMessages.map(m => m.content).join(" ")
        ),
        summary: "",
        importance: this.estimateImportance(segmentMessages),
      });
    }

    return segments;
  }

  /**
   * 增量式边界检测：每收到一条新消息时调用
   */
  checkNewBoundary(
    recentMessages: Array<{ role: string; content: string }>,
    newMessage: { role: string; content: string }
  ): { isBoundary: boolean; confidence: number; newTopic?: string } {
    if (recentMessages.length < this.windowSize) {
      return { isBoundary: false, confidence: 0 };
    }

    const oldContext = recentMessages
      .slice(-this.windowSize)
      .map(m => m.content)
      .join(" ");

    const similarity = this.computeTextSimilarity(
      oldContext,
      newMessage.content
    );

    if (similarity < this.similarityThreshold) {
      return {
        isBoundary: true,
        confidence: 1 - similarity,
        newTopic: this.extractMainTopic([newMessage.content]),
      };
    }

    return { isBoundary: false, confidence: similarity };
  }

  private computeTextSimilarity(textA: string, textB: string): number {
    const wordsA = this.extractKeywords(textA);
    const wordsB = this.extractKeywords(textB);

    const setA = new Set(wordsA);
    const setB = new Set(wordsB);

    let intersection = 0;
    for (const word of setA) {
      if (setB.has(word)) intersection++;
    }

    const union = setA.size + setB.size - intersection;
    return union === 0 ? 1 : intersection / union;
  }

  private extractMainTopic(texts: string[]): string {
    const allText = texts.join(" ");
    const keywords = this.extractKeywords(allText);
    return keywords.slice(0, 3).join(" + ");
  }

  private extractKeywords(text: string): string[] {
    // 简化的关键词提取：基于词频
    const stopWords = new Set([
      "的", "了", "在", "是", "我", "有", "和", "就",
      "不", "人", "都", "一", "一个", "上", "也", "很",
      "到", "说", "要", "去", "你", "会", "着", "没有",
      "看", "好", "自己", "这", "the", "a", "an", "is",
      "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did",
      "will", "would", "could", "should", "may", "might",
      "i", "you", "he", "she", "it", "we", "they",
      "this", "that", "these", "those", "and", "or",
      "but", "in", "on", "at", "to", "for", "of",
    ]);

    const words = text
      .toLowerCase()
      .split(/[\s,;.!?，。！？；：、]+/)
      .filter(w => w.length > 1 && !stopWords.has(w));

    const freq: Map<string, number> = new Map();
    for (const word of words) {
      freq.set(word, (freq.get(word) || 0) + 1);
    }

    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  private estimateImportance(
    messages: Array<{ role: string; content: string }>
  ): number {
    // 包含决策性关键词的段落更重要
    const decisionKeywords = [
      "决定", "确定", "选择", "采用", "结论",
      "decide", "choose", "conclude", "agree", "confirm",
    ];

    const text = messages.map(m => m.content).join(" ").toLowerCase();
    let score = 0.5;

    for (const keyword of decisionKeywords) {
      if (text.includes(keyword)) {
        score += 0.1;
      }
    }

    return Math.min(score, 1);
  }
}
```

### 5.6.3 Long Conversation Manager — 长对话管理器

将上述组件整合为一个统一的长对话管理器。

```typescript
// ===== Long Conversation Manager =====
// 统一的长对话管理

interface LongConversationConfig {
  maxHistoryTokens: number;
  compactionThreshold: number;      // 超过此轮次数触发自动压实
  phaseDetection: boolean;
  topicBoundaryDetection: boolean;
  autoNotes: boolean;
}

interface ConversationState {
  totalTurns: number;
  currentPhase: ConversationPhase | null;
  phases: ConversationPhase[];
  topics: TopicSegment[];
  healthMetrics: ContextHealthMetrics | null;
  lastCompactionTurn: number;
  tokenUsage: {
    history: number;
    notes: number;
    scratchpad: number;
    system: number;
    total: number;
    budget: number;
  };
}

class LongConversationManager {
  private config: LongConversationConfig;
  private messages: Array<{
    role: string;
    content: string;
    timestamp: number;
    turn: number;
  }> = [];
  private phaseDetector: ConversationPhaseDetector;
  private topicDetector: TopicBoundaryDetector;
  private compressor: TieredCompressor;
  private notes: StructuredNotesManager;
  private scratchpad: ScratchpadManager;
  private healthDashboard: ContextHealthDashboard;
  private compactedHistory: string = "";
  private lastCompactionTurn: number = 0;

  constructor(
    config: Partial<LongConversationConfig>,
    compressor: TieredCompressor
  ) {
    this.config = {
      maxHistoryTokens: 8000,
      compactionThreshold: 20,
      phaseDetection: true,
      topicBoundaryDetection: true,
      autoNotes: true,
      ...config,
    };

    this.phaseDetector = new ConversationPhaseDetector();
    this.topicDetector = new TopicBoundaryDetector();
    this.compressor = compressor;
    this.notes = new StructuredNotesManager();
    this.scratchpad = new ScratchpadManager();
    this.healthDashboard = new ContextHealthDashboard();
  }

  /**
   * 添加新消息并触发自动管理
   */
  async addMessage(
    role: string,
    content: string
  ): Promise<{
    needsCompaction: boolean;
    phaseTransition: PhaseTransitionSignal | null;
    topicChange: boolean;
    healthAlerts: HealthAlert[];
  }> {
    const turn = this.messages.length;
    this.messages.push({
      role,
      content,
      timestamp: Date.now(),
      turn,
    });

    let phaseTransition: PhaseTransitionSignal | null = null;
    let topicChange = false;
    let healthAlerts: HealthAlert[] = [];

    // 1. 阶段检测
    if (this.config.phaseDetection) {
      const currentPhaseId = this.phaseDetector.getCurrentPhase()?.id || "initial";
      phaseTransition = this.phaseDetector.analyzeMessage(
        { role, content },
        currentPhaseId
      );
      if (phaseTransition && phaseTransition.confidence > 0.6) {
        this.phaseDetector.startPhase(
          phaseTransition.toPhase,
          `Transition from ${phaseTransition.fromPhase}`
        );
      }
    }

    // 2. 话题边界检测
    if (this.config.topicBoundaryDetection) {
      const recentMessages = this.messages.slice(-10);
      const boundaryResult = this.topicDetector.checkNewBoundary(
        recentMessages.slice(0, -1),
        { role, content }
      );
      topicChange = boundaryResult.isBoundary;
    }

    // 3. 健康检查（每 5 轮执行一次）
    if (turn % 5 === 0) {
      const dummyEmbedding = new Array(128).fill(0);
      const healthResult = this.healthDashboard.evaluate(
        this.getRecentHistoryText(),
        dummyEmbedding,
        dummyEmbedding
      );
      healthAlerts = healthResult.alerts;
    }

    // 4. 检查是否需要压实
    const turnsSinceCompaction = turn - this.lastCompactionTurn;
    const needsCompaction =
      turnsSinceCompaction >= this.config.compactionThreshold;

    if (needsCompaction) {
      await this.performCompaction();
    }

    return { needsCompaction, phaseTransition, topicChange, healthAlerts };
  }

  /**
   * 构建当前可用的上下文
   */
  buildContext(tokenBudget: number): string {
    const parts: string[] = [];

    // 1. 阶段摘要
    if (this.phaseDetector.getCurrentPhase()) {
      const phaseSummaries = this.phaseDetector.getPhaseSummaries();
      parts.push(`<conversation_phases>\n${phaseSummaries}\n</conversation_phases>`);
    }

    // 2. 压实后的历史
    if (this.compactedHistory) {
      parts.push(
        `<compacted_history>\n${this.compactedHistory}\n</compacted_history>`
      );
    }

    // 3. 最近的原始消息（保持完整）
    const recentMessages = this.messages.slice(
      this.lastCompactionTurn
    );
    const recentText = recentMessages
      .map(m => `[${m.role} @turn${m.turn}]: ${m.content}`)
      .join("\n");
    parts.push(`<recent_history>\n${recentText}\n</recent_history>`);

    // 4. 笔记
    const notesContent = this.notes.toCompactContext(500);
    parts.push(notesContent);

    // 5. Scratchpad
    const padContent = this.scratchpad.toContext();
    parts.push(padContent);

    return parts.join("\n\n");
  }

  /**
   * 获取对话状态概览
   */
  getState(): ConversationState {
    const historyTokens = this.estimateTokens(
      this.messages.map(m => m.content).join(" ")
    );

    return {
      totalTurns: this.messages.length,
      currentPhase: this.phaseDetector.getCurrentPhase(),
      phases: [],
      topics: [],
      healthMetrics: null,
      lastCompactionTurn: this.lastCompactionTurn,
      tokenUsage: {
        history: historyTokens,
        notes: this.estimateTokens(this.notes.toMarkdown()),
        scratchpad: this.estimateTokens(this.scratchpad.toContext()),
        system: 0,
        total: historyTokens,
        budget: this.config.maxHistoryTokens,
      },
    };
  }

  /**
   * 执行上下文压实
   */
  private async performCompaction(): Promise<void> {
    const messagesToCompact = this.messages.slice(
      0,
      this.messages.length - 5 // 保留最近 5 轮不压缩
    );

    if (messagesToCompact.length === 0) return;

    const content = messagesToCompact
      .map(m => `[${m.role}]: ${m.content}`)
      .join("\n");

    // 使用三层压缩
    const plan = this.compressor.plan(
      this.estimateTokens(content),
      this.config.maxHistoryTokens,
      0.5
    );

    this.compactedHistory = await this.compressor.execute(content, plan);
    this.lastCompactionTurn = messagesToCompact.length;
  }

  private getRecentHistoryText(): string {
    return this.messages
      .slice(-10)
      .map(m => m.content)
      .join(" ");
  }

  private estimateTokens(text: string): number {
    const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const other = text.length - chinese;
    return Math.ceil(chinese / 1.5 + other / 4);
  }
}
```

### 5.6.4 长对话实战模式

以下是使用 `LongConversationManager` 管理 100+ 轮对话的典型流程：

```typescript
// ===== 长对话管理实战示例 =====

async function longConversationDemo(): Promise<void> {
  // 1. 初始化（假设有一个 LLM client 实例）
  const llmClient: LLMClient = {
    complete: async (prompt: string, maxTokens: number) => {
      // 实际实现中调用 LLM API
      return "LLM response placeholder";
    },
  };

  const compressor = new TieredCompressor(llmClient);

  const manager = new LongConversationManager(
    {
      maxHistoryTokens: 8000,
      compactionThreshold: 15,
      phaseDetection: true,
      topicBoundaryDetection: true,
      autoNotes: true,
    },
    compressor
  );

  // 2. 模拟长对话
  const simulatedMessages = [
    { role: "user", content: "我需要开发一个电商推荐系统" },
    { role: "assistant", content: "好的，让我了解一下需求。你的商品目录大概有多少 SKU？" },
    { role: "user", content: "大约 10 万个 SKU，日活用户 50 万" },
    // ... 更多轮次
  ];

  for (const msg of simulatedMessages) {
    const result = await manager.addMessage(msg.role, msg.content);

    if (result.needsCompaction) {
      console.log("[COMPACTION] 触发自动上下文压实");
    }

    if (result.phaseTransition) {
      console.log(
        `[PHASE] 阶段转换: ${result.phaseTransition.fromPhase} → ${result.phaseTransition.toPhase}`
      );
    }

    if (result.topicChange) {
      console.log("[TOPIC] 检测到话题切换");
    }

    if (result.healthAlerts.length > 0) {
      for (const alert of result.healthAlerts) {
        console.log(
          `[HEALTH ${alert.level.toUpperCase()}] ${alert.message}`
        );
      }
    }
  }

  // 3. 构建 LLM 调用的上下文
  const context = manager.buildContext(8000);
  console.log(`Context length: ${context.length} chars`);

  // 4. 查看状态
  const state = manager.getState();
  console.log(`Total turns: ${state.totalTurns}`);
  console.log(`Token usage: ${state.tokenUsage.history}/${state.tokenUsage.budget}`);
}
```

---

## 5.7 Context Engineering 反模式

前面各节讨论了上下文工程的最佳实践，但在实际生产环境中，开发者更常遇到的是各种**反模式**（Anti-patterns）。这些反模式往往在小规模测试中不易暴露，却在用户量增长或对话轮次加深后造成严重的质量退化和安全风险。本节系统梳理四种高频反模式，并给出检测与缓解方案。

### 5.7.1 Context Pollution（上下文污染）

**定义**：无关或低质量的信息被注入到上下文中，稀释模型对关键信息的注意力，导致响应质量下降。

**常见成因**：
- **过度热心的工具返回**：RAG 检索返回大量低相关度片段，Tool Use 结果未经裁剪直接注入
- **冗长的 System Prompt**：把所有可能的指令堆叠在一起，而非按场景动态选择
- **未压缩的对话历史**：完整保留数百轮对话，其中大量闲聊和确认消息毫无决策价值

```typescript
// ===== Context Pollution Detector =====

interface PollutionSignal {
  source: "tool" | "history" | "system" | "retrieval";
  content: string;
  relevanceScore: number;   // 0-1, 低于阈值视为污染
  tokenCost: number;
}

class ContextPollutionDetector {
  private relevanceThreshold: number;

  constructor(relevanceThreshold: number = 0.3) {
    this.relevanceThreshold = relevanceThreshold;
  }

  /**
   * 扫描上下文窗口，标记疑似污染的片段
   */
  detect(
    contextBlocks: Array<{ source: string; content: string }>,
    currentQuery: string
  ): PollutionSignal[] {
    const signals: PollutionSignal[] = [];

    for (const block of contextBlocks) {
      const relevance = this.computeRelevance(block.content, currentQuery);
      const tokens = this.estimateTokens(block.content);

      if (relevance < this.relevanceThreshold) {
        signals.push({
          source: block.source as PollutionSignal["source"],
          content: block.content.slice(0, 100) + "...",
          relevanceScore: relevance,
          tokenCost: tokens,
        });
      }
    }

    // 按 token 成本降序——优先处理占用最多空间的污染源
    return signals.sort((a, b) => b.tokenCost - a.tokenCost);
  }

  /**
   * 计算内容与当前查询的相关度（简化的词汇重叠 + 语义估算）
   */
  private computeRelevance(content: string, query: string): number {
    const contentTerms = new Set(this.tokenize(content));
    const queryTerms = new Set(this.tokenize(query));
    const overlap = [...queryTerms].filter(t => contentTerms.has(t)).length;
    return queryTerms.size > 0 ? overlap / queryTerms.size : 0;
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().split(/[\s,.\-;:!?，。；：！？]+/).filter(Boolean);
  }

  private estimateTokens(text: string): number {
    const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const other = text.length - chinese;
    return Math.ceil(chinese / 1.5 + other / 4);
  }
}
```

**缓解策略**：采用**选择性注入**——每个上下文片段在注入前必须通过相关度评分（参考 §5.1.2 的 RRI 三维评分），低于阈值的片段直接丢弃或降级到备用缓冲区。对工具返回结果，设定最大 token 上限并执行 L1 格式压缩后再注入。

### 5.7.2 Context Leakage（上下文泄漏）

**定义**：敏感信息从一个上下文边界泄漏到另一个边界——例如用户 A 的对话内容出现在用户 B 的上下文中，或子 Agent 的内部推理暴露给终端用户。

**常见成因**：
- **共享内存存储缺乏隔离**：多租户系统中不同用户的记忆写入同一命名空间
- **Prompt Injection 导致的 System Prompt 泄漏**：恶意用户诱导模型输出系统指令
- **工具输出携带跨会话 PII**：数据库查询结果未脱敏，包含其他用户的个人信息

```typescript
// ===== Context Isolation Guard =====

interface BoundaryViolation {
  type: "cross_user" | "cross_session" | "prompt_leak" | "pii_exposure";
  severity: "critical" | "high" | "medium";
  evidence: string;
  sourceContext: string;
  targetContext: string;
}

class ContextIsolationGuard {
  private piiPatterns: RegExp[];
  private systemPromptFingerprints: Set<string>;

  constructor(systemPromptSnippets: string[]) {
    this.piiPatterns = [
      /\b\d{3}[-.]?\d{4}[-.]?\d{4}\b/,           // 电话号码
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/i, // 邮箱
      /\b\d{6}(19|20)\d{2}(0[1-9]|1[0-2])\d{6}\b/,       // 身份证片段
    ];
    // 对 System Prompt 的关键片段取指纹，用于检测泄漏
    this.systemPromptFingerprints = new Set(
      systemPromptSnippets.map(s => this.fingerprint(s))
    );
  }

  /**
   * 校验输出是否存在上下文边界违规
   */
  validate(
    output: string,
    currentUserId: string,
    currentSessionId: string,
    contextMetadata: Array<{ userId: string; sessionId: string; content: string }>
  ): BoundaryViolation[] {
    const violations: BoundaryViolation[] = [];

    // 1. 检测跨用户泄漏
    for (const meta of contextMetadata) {
      if (meta.userId !== currentUserId && output.includes(meta.content.slice(0, 50))) {
        violations.push({
          type: "cross_user",
          severity: "critical",
          evidence: meta.content.slice(0, 80),
          sourceContext: `user:${meta.userId}`,
          targetContext: `user:${currentUserId}`,
        });
      }
    }

    // 2. 检测 System Prompt 泄漏
    for (const fp of this.systemPromptFingerprints) {
      if (this.containsFingerprint(output, fp)) {
        violations.push({
          type: "prompt_leak",
          severity: "high",
          evidence: "[System Prompt content detected in output]",
          sourceContext: "system",
          targetContext: `session:${currentSessionId}`,
        });
      }
    }

    // 3. 检测 PII 泄漏
    for (const pattern of this.piiPatterns) {
      const matches = output.match(pattern);
      if (matches) {
        violations.push({
          type: "pii_exposure",
          severity: "high",
          evidence: matches[0].replace(/.(?=.{4})/g, "*"),
          sourceContext: "tool_output",
          targetContext: `session:${currentSessionId}`,
        });
      }
    }

    return violations;
  }

  private fingerprint(text: string): string {
    // 简化指纹：取文本的关键 n-gram
    return text.toLowerCase().replace(/\s+/g, "").slice(0, 32);
  }

  private containsFingerprint(text: string, fp: string): boolean {
    return text.toLowerCase().replace(/\s+/g, "").includes(fp);
  }
}
```

**缓解策略**：严格执行上下文隔离（参考 §5.1.4 的四级隔离策略），所有内存存储按 `userId + sessionId` 做命名空间隔离；工具输出在注入上下文前强制经过 PII 扫描和脱敏；System Prompt 的关键指令使用对抗性测试验证不可提取。

### 5.7.3 Token Budget Explosion（Token 预算爆炸）

**定义**：上下文窗口被以超出预期的速度消耗殆尽，通常发生在运行时而非设计时，导致关键信息被截断或 API 调用直接失败。

**常见成因**：
- **递归工具调用产生冗长输出**：Agent 循环调用搜索工具，每次结果都追加到上下文
- **无界对话历史**：缺乏压缩或裁剪策略，对话历史线性增长直至撑满窗口
- **知识库检索未截断**：RAG 返回整篇文档而非相关段落

```typescript
// ===== Token Budget Monitor =====

interface BudgetAllocation {
  system: number;     // System Prompt 预算比例
  history: number;    // 对话历史预算比例
  tools: number;      // 工具结果预算比例
  response: number;   // 预留给模型响应的比例
}

interface BudgetAlert {
  component: keyof BudgetAllocation;
  currentTokens: number;
  budgetTokens: number;
  usagePercent: number;
  action: "warn" | "compact" | "truncate" | "reject";
}

class TokenBudgetMonitor {
  private maxTokens: number;
  private allocation: BudgetAllocation;
  private usage: Record<keyof BudgetAllocation, number>;
  private warningThreshold: number;
  private criticalThreshold: number;

  constructor(
    maxTokens: number,
    allocation: BudgetAllocation = { system: 0.15, history: 0.40, tools: 0.30, response: 0.15 },
    warningThreshold: number = 0.7,
    criticalThreshold: number = 0.9
  ) {
    this.maxTokens = maxTokens;
    this.allocation = allocation;
    this.usage = { system: 0, history: 0, tools: 0, response: 0 };
    this.warningThreshold = warningThreshold;
    this.criticalThreshold = criticalThreshold;
  }

  /**
   * 记录某个组件的 token 消耗并检查是否触发告警
   */
  record(component: keyof BudgetAllocation, tokens: number): BudgetAlert | null {
    this.usage[component] = tokens;
    const budget = this.maxTokens * this.allocation[component];
    const usagePercent = tokens / budget;

    if (usagePercent >= this.criticalThreshold) {
      return {
        component,
        currentTokens: tokens,
        budgetTokens: budget,
        usagePercent,
        action: component === "response" ? "reject" : "truncate",
      };
    }

    if (usagePercent >= this.warningThreshold) {
      return {
        component,
        currentTokens: tokens,
        budgetTokens: budget,
        usagePercent,
        action: "compact",
      };
    }

    return null;
  }

  /**
   * 获取全局预算使用概览
   */
  getOverview(): { totalUsed: number; totalBudget: number; alerts: BudgetAlert[] } {
    const alerts: BudgetAlert[] = [];
    let totalUsed = 0;

    for (const comp of Object.keys(this.allocation) as (keyof BudgetAllocation)[]) {
      totalUsed += this.usage[comp];
      const alert = this.record(comp, this.usage[comp]);
      if (alert) alerts.push(alert);
    }

    return { totalUsed, totalBudget: this.maxTokens, alerts };
  }
}
```

**缓解策略**：为每个组件设定独立的 token 预算——推荐分配为 System 15%、History 40%、Tools 30%、Response 15%（参考 §5.3.6 的 Context Budget Allocator）。当任一组件达到 70% 预算时触发 L1+L2 压缩，达到 90% 时强制截断并记录告警日志。

### 5.7.4 Stale Context（过期上下文）

**定义**：上下文中包含已过时的信息——过时的工具缓存、失效的指令、不再成立的事实——导致 Agent 基于错误前提做出决策。

**常见成因**：
- **工具结果缓存未刷新**：天气、股价等实时数据的缓存 TTL 设置过长
- **System Prompt 指令过期**：节假日促销规则未及时下线，Agent 仍在引导用户参与已结束的活动
- **陈旧的记忆记录**：用户偏好已改变，但持久化的记忆仍记录旧偏好

> **交叉参考**：§5.2 的 Context Rot 检测机制中，`detectStaleness()` 方法已实现了基于时间戳的过期检测。此处在其基础上构建更完整的新鲜度验证方案。

```typescript
// ===== Context Freshness Validator =====

interface FreshnessRule {
  sourceType: string;       // 上下文来源类型标识
  maxAgeSec: number;        // 最大存活时间（秒）
  refreshStrategy: "refetch" | "invalidate" | "flag";
}

interface StaleEntry {
  source: string;
  content: string;
  ageSeconds: number;
  maxAgeSec: number;
  action: FreshnessRule["refreshStrategy"];
}

class ContextFreshnessValidator {
  private rules: Map<string, FreshnessRule>;

  constructor(rules: FreshnessRule[]) {
    this.rules = new Map(rules.map(r => [r.sourceType, r]));
  }

  /**
   * 扫描上下文中所有带时间戳的条目，标记过期内容
   */
  validate(
    entries: Array<{ source: string; content: string; timestamp: number }>
  ): StaleEntry[] {
    const now = Date.now() / 1000;
    const staleEntries: StaleEntry[] = [];

    for (const entry of entries) {
      const rule = this.rules.get(entry.source);
      if (!rule) continue;

      const age = now - entry.timestamp;
      if (age > rule.maxAgeSec) {
        staleEntries.push({
          source: entry.source,
          content: entry.content.slice(0, 80) + "...",
          ageSeconds: Math.round(age),
          maxAgeSec: rule.maxAgeSec,
          action: rule.refreshStrategy,
        });
      }
    }

    return staleEntries;
  }

  /**
   * 典型的 TTL 规则预设
   */
  static defaultRules(): FreshnessRule[] {
    return [
      { sourceType: "weather",        maxAgeSec: 1800,   refreshStrategy: "refetch" },    // 30 分钟
      { sourceType: "stock_price",    maxAgeSec: 300,    refreshStrategy: "refetch" },    // 5 分钟
      { sourceType: "web_search",     maxAgeSec: 86400,  refreshStrategy: "refetch" },    // 1 天
      { sourceType: "user_memory",    maxAgeSec: 604800, refreshStrategy: "flag" },       // 7 天
      { sourceType: "system_prompt",  maxAgeSec: 0,      refreshStrategy: "invalidate" }, // 每次验证
    ];
  }
}
```

**缓解策略**：为每类上下文来源定义明确的 TTL 规则，在 Context Assembly Pipeline（参考 §5.5.2）中增加新鲜度校验环节——过期内容根据策略选择重新获取、标记告警或直接失效。对 System Prompt 采用版本化管理，每次会话启动时校验是否为最新版本。

### 5.7.5 反模式检测清单

下表提供一个快速参考清单，帮助团队在代码评审和上线检查中识别上下文工程的常见反模式：

| 反模式 | 典型症状 | 检测方法 | 解决方案 |
|--------|---------|---------|---------|
| **Context Pollution** | 响应质量随工具调用增多而下降；无关信息出现在回复中 | `ContextPollutionDetector` 相关度评分；监控响应质量指标 | 选择性注入 + RRI 评分过滤 + 工具结果 L1 压缩 |
| **Context Leakage** | 用户反馈看到其他人的信息；System Prompt 内容出现在回复中 | `ContextIsolationGuard` 边界校验；PII 扫描告警 | 命名空间隔离 + PII 脱敏 + 对抗性 Prompt 测试 |
| **Token Budget Explosion** | API 调用频繁报 `context_length_exceeded`；响应突然被截断 | `TokenBudgetMonitor` 组件级预算监控；token 使用率趋势 | 组件级预算分配 + 渐进压缩 + 工具输出上限 |
| **Stale Context** | Agent 引用已过时的信息做决策；用户投诉"记忆"不准确 | `ContextFreshnessValidator` TTL 校验；定期腐化扫描 | TTL 规则 + 版本化 System Prompt + 记忆定期刷新 |

> **实践建议**：将上述四个检测器集成到 Context Assembly Pipeline 中，作为上下文注入前的"质量门禁"。任何未通过检测的上下文片段都不应进入最终的 LLM 调用，而是记录到可观测性系统中供事后分析。

---


## 5.8 章节总结与最佳实践

### 核心框架回顾

本章围绕上下文工程的 **WSCIPO** 六大原则，构建了一套完整的技术方案：

| 原则 | 核心实现 | 关键类/接口 |
|------|---------|------------|
| **Write** 写入 | 结构化 System Prompt + 动态注入 | `SystemPromptBuilder`, `DynamicContextInjector` |
| **Select** 选择 | RRI 三维评分 + 多样性保障 | `ContextSelector` |
| **Compress** 压缩 | 三层压缩 (L1/L2/L3) + 渐进压实 | `TieredCompressor`, `ProgressiveCompactor` |
| **Isolate** 隔离 | 四级隔离策略 + 上下文沙箱 | `ContextSandbox`, `IsolationPolicy` |
| **Persist** 持久化 | 结构化笔记 + 语义检索 | `StructuredNotesManager`, `ContextPersistenceManager` |
| **Observe** 观测 | 多维健康检测 + 腐化扫描 | `ContextHealthDashboard`, `ContextRotDetector` |

### 最佳实践清单

**System Prompt 设计**
1. 使用 XML 标签组织 System Prompt，保持结构清晰
2. 将 persona、instructions、tools、examples 分区管理
3. 保持 System Prompt 在总上下文预算的 15-25%

**上下文选择与压缩**
4. 采用 RRI (Relevance-Recency-Importance) 三维评分选择上下文
5. 始终先执行 L1 格式压缩（零成本高收益）
6. 当 token 使用率超过 70% 时启用 L2，超过 85% 启用 L3
7. 长对话使用渐进式压实，按"年龄"对消息分层压缩

**上下文质量保障**
8. 每 5-10 轮自动执行腐化检测
9. 重点监控：冗余率 < 30%，话题偏移距离 < 0.7
10. 发现矛盾信号时立即向用户确认

**多 Agent 协作**
11. 默认使用 SharedReadOnly 隔离策略
12. 跨 Agent 传递优先选择 Summary Pass（平衡成本和保真度）
13. 使用 Context Assembly Pipeline 统一管理多源上下文
14. 为每个上下文消费者设定 token 预算和优先级

**长对话管理**
15. 启用阶段检测，为每个阶段维护独立摘要
16. 话题切换时自动创建新的笔记条目
17. 超过 20 轮对话启用自动压实
18. 保留最近 5 轮消息的原始内容，更早的消息逐步压缩

### 架构决策树

在设计上下文管理方案时，可以按以下决策树选择策略：

```
对话长度预期?
├── < 10 轮: 简单滑动窗口即可
├── 10-50 轮: L1+L2 压缩 + 基础笔记
├── 50-200 轮: 三层压缩 + 结构化笔记 + 阶段检测
└── 200+ 轮: 全套方案 (渐进压实 + 阶段/话题检测 + 健康监控)

多 Agent 架构?
├── 单 Agent: 直接管理上下文
├── 链式 Agent: Summary Pass 传递
├── 并行 Agent: SharedReadOnly 隔离 + 结果合并
└── 层级 Agent: ContextSandbox + Selective/Summary Pass

Token 预算?
├── < 4K: 激进压缩 (L1+L2+L3)，仅保留最关键信息
├── 4K-16K: 标准方案，三层压缩按需启用
├── 16K-128K: 宽松方案，L1+L2 为主，L3 仅在极端情况使用
└── 128K+: 以选择为主，压缩为辅，重点防止注意力稀释
```

### 下一章预告

在第六章中，我们将深入探讨 **Tool Use — 工具使用**，这是 Agent 与外部世界交互的桥梁。我们将讨论工具描述的最佳实践、工具编排模式、错误处理策略，以及如何构建一个可扩展的工具注册表。上下文工程中学到的预算管理、优先级排序和压缩技术，将直接应用于工具结果的处理。
