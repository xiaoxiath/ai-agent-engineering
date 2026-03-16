# 第24章：实战案例——企业客服系统

> "Customer service is not a department, it's everyone's job." —— Anonymous

## 24.1 项目背景与挑战

企业客服是 AI Agent 最早落地、规模最大的应用场景。与简单的 FAQ 机器人不同，现代智能客服需要处理复杂的多轮对话、跨系统操作和情感关怀。

### 24.1.1 核心挑战

| 挑战维度 | 具体问题 | 解决策略 |
|---------|---------|---------|
| 意图理解 | 用户表述模糊、多意图混合 | 层级意图分类 + 澄清对话 |
| 知识管理 | 产品信息频繁更新 | RAG + 知识图谱 + 自动同步 |
| 系统集成 | 跨多个后端系统操作 | MCP 工具标准化 + 事务管理 |
| 情感处理 | 用户情绪化、投诉升级 | 情感分析 + 动态升级策略 |
| 合规要求 | 金融/医疗等行业监管 | 输出过滤 + 审计追踪 |

## 24.2 系统架构设计

### 24.2.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│                  Omni-Channel Gateway                │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────────┐│
│  │  Web   │ │  App   │ │ WeChat │ │   Phone/IVR  ││
│  └────────┘ └────────┘ └────────┘ └──────────────┘│
├─────────────────────────────────────────────────────┤
│                  Agent Orchestrator                  │
│  ┌──────────────────────────────────────────────┐  │
│  │  Router → Classifier → Handler → Validator   │  │
│  └──────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│         Domain Agents          │    Support Layer    │
│  ┌──────────┐ ┌──────────┐   │ ┌────────────────┐ │
│  │Order Agent│ │Tech Agent│   │ │ Knowledge Base │ │
│  ├──────────┤ ├──────────┤   │ ├────────────────┤ │
│  │Billing   │ │Complaint │   │ │ User Profile   │ │
│  │Agent     │ │Agent     │   │ ├────────────────┤ │
│  └──────────┘ └──────────┘   │ │ Audit Logger   │ │
└─────────────────────────────────────────────────────┘
```

## 24.3 意图分类与路由

### 24.3.1 层级意图分类器

```typescript
interface IntentResult {
  primaryIntent: string;
  secondaryIntent?: string;
  confidence: number;
  entities: Record<string, string>;
  sentiment: 'positive' | 'neutral' | 'negative' | 'angry';
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

class IntentClassifier {
  private model: LLMClient;
  private intentSchema: IntentSchema;
  
  async classify(
    message: string,
    conversationHistory: Message[]
  ): Promise<IntentResult> {
    const prompt = `
## Role
You are a customer service intent classifier.

## Intent Categories
${this.formatIntentSchema()}

## Conversation History
${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}

## Current Message
${message}

## Task
Classify the intent. Output JSON with: primaryIntent, secondaryIntent, confidence, entities, sentiment, urgency.
`;

    const response = await this.model.generate(prompt, {
      responseFormat: { type: 'json_object' }
    });
    
    return JSON.parse(response);
  }
  
  private formatIntentSchema(): string {
    return Object.entries(this.intentSchema)
      .map(([category, intents]) => {
        return `### ${category}\n${intents.map(i => `- ${i.name}: ${i.description}`).join('\n')}`;
      }).join('\n\n');
  }
}

class ConversationRouter {
  private classifier: IntentClassifier;
  private agents: Map<string, DomainAgent>;
  
  async route(session: CustomerSession, message: string): Promise<Response> {
    const intent = await this.classifier.classify(message, session.history);
    
    // 情感升级检查
    if (intent.sentiment === 'angry' || intent.urgency === 'critical') {
      return this.escalateToHuman(session, intent);
    }
    
    // 路由到对应领域 Agent
    const agent = this.agents.get(intent.primaryIntent);
    if (!agent) {
      return this.handleUnknownIntent(session, intent);
    }
    
    // 执行并验证回复
    const response = await agent.handle(session, message, intent);
    return this.validateResponse(response, session);
  }
  
  private async escalateToHuman(session: CustomerSession, intent: IntentResult): Promise<Response> {
    return {
      content: '非常抱歉给您带来不好的体验，我正在为您转接人工客服，请稍候。',
      action: { type: 'transfer_to_human', priority: intent.urgency, context: session.summary() }
    };
  }
  
  private async handleUnknownIntent(session: CustomerSession, intent: IntentResult): Promise<Response> {
    return { content: '请问您能更详细地描述一下您的问题吗？我可以帮您查询订单、解决技术问题或处理账单相关的事务。' };
  }
  
  private async validateResponse(response: Response, session: CustomerSession): Promise<Response> {
    // PII 脱敏：替换身份证号、手机号、银行卡号
    let sanitized = response.content
      .replace(/\b\d{18}\b/g, '****')                    // 身份证号
      .replace(/\b1[3-9]\d{9}\b/g, '****/****/****')     // 手机号
      .replace(/\b\d{16,19}\b/g, '****-****-****-****');  // 银行卡号
    // 合规检查：禁止承诺未经授权的退款或赔偿
    const prohibitedPatterns = ['保证退款', '一定赔偿', '承诺解决'];
    for (const pattern of prohibitedPatterns) {
      if (sanitized.includes(pattern)) {
        sanitized = sanitized.replace(pattern, '我们会根据政策处理');
      }
    }
    return { ...response, content: sanitized };
  }
```

## 24.4 工单管理系统

### 24.4.1 智能工单处理

```typescript
interface Ticket {
  id: string;
  customerId: string;
  category: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  status: 'open' | 'in_progress' | 'pending_customer' | 'resolved' | 'closed';
  assignee?: string;
  history: TicketEvent[];
  sla: { responseTime: number; resolutionTime: number };
}

class TicketManager {
  async createFromConversation(session: CustomerSession): Promise<Ticket> {
    // 从对话中提取结构化信息
    const extraction = await this.extractTicketInfo(session);
    
    const ticket: Ticket = {
      id: generateId(),
      customerId: session.customerId,
      category: extraction.category,
      priority: this.calculatePriority(extraction),
      status: 'open',
      history: [{
        type: 'created',
        timestamp: Date.now(),
        content: extraction.summary,
        metadata: { sessionId: session.id, messages: session.history.length }
      }],
      sla: this.getSLAConfig(extraction.category, extraction.priority)
    };
    
    // 自动分配
    ticket.assignee = await this.autoAssign(ticket);
    
    return ticket;
  }
  
  private calculatePriority(extraction: TicketExtraction): Ticket['priority'] {
    // 基于影响范围、紧急程度、客户等级综合计算
    let score = 0;
    if (extraction.sentiment === 'angry') score += 3;
    if (extraction.businessImpact === 'high') score += 3;
    if (extraction.customerTier === 'vip') score += 2;
    if (extraction.isRecurring) score += 1;
    
    if (score >= 7) return 'P0';
    if (score >= 5) return 'P1';
    if (score >= 3) return 'P2';
    return 'P3';
  }
  
  private async autoAssign(ticket: Ticket): Promise<string> {
    const categoryAgentMap: Record<string, string[]> = {
      billing: ['billing-team-1', 'billing-team-2'],
      technical: ['tech-support-1', 'tech-support-2', 'tech-support-3'],
      general: ['general-pool'],
    };
    const candidates = categoryAgentMap[ticket.category] ?? categoryAgentMap.general;
    // 简单轮询分配，生产环境应考虑负载均衡
    const idx = Math.floor(Math.random() * candidates.length);
    return candidates[idx];
  }
  private async extractTicketInfo(session: CustomerSession): Promise<TicketExtraction> {
    const messages = session.messages.map(m => m.content).join('\n');
    const prompt = `Extract structured ticket information from this conversation:\n${messages}\n\nReturn JSON with: category, priority, summary, keyEntities`;
    const response = await this.llm.complete(prompt);
    try {
      return JSON.parse(response);
    } catch {
      return { category: 'general', priority: 'medium', summary: messages.slice(0, 200), keyEntities: [] };
    }
  }
  private getSLAConfig(category: string, priority: string): Ticket['sla'] {
    const slaMatrix: Record<string, Record<string, { responseTime: number; resolutionTime: number }>> = {
      billing:   { critical: { responseTime: 900, resolutionTime: 14400 }, high: { responseTime: 1800, resolutionTime: 28800 }, medium: { responseTime: 3600, resolutionTime: 86400 }, low: { responseTime: 7200, resolutionTime: 172800 } },
      technical: { critical: { responseTime: 600, resolutionTime: 7200 }, high: { responseTime: 1800, resolutionTime: 28800 }, medium: { responseTime: 3600, resolutionTime: 86400 }, low: { responseTime: 7200, resolutionTime: 172800 } },
      general:   { critical: { responseTime: 1800, resolutionTime: 28800 }, high: { responseTime: 3600, resolutionTime: 86400 }, medium: { responseTime: 7200, resolutionTime: 172800 }, low: { responseTime: 14400, resolutionTime: 259200 } },
    };
    return slaMatrix[category]?.[priority] ?? slaMatrix.general.medium;
  }
}
```

## 24.5 质量保障体系

### 24.5.1 输出质量守卫

```typescript
class QualityGuard {
  private rules: QualityRule[];
  
  async validate(response: AgentResponse, context: CustomerSession): Promise<ValidationResult> {
    const results: RuleResult[] = [];
    
    for (const rule of this.rules) {
      const result = await rule.check(response, context);
      results.push(result);
      
      if (result.severity === 'block' && !result.passed) {
        return {
          passed: false,
          blockedBy: rule.name,
          suggestion: result.suggestion,
          results
        };
      }
    }
    
    return { passed: true, results };
  }
}

// 具体质量规则示例
const qualityRules: QualityRule[] = [
  {
    name: 'no_hallucinated_policy',
    check: async (response, context) => {
      // 验证引用的政策是否真实存在于知识库
      const citations = extractCitations(response.content);
      for (const citation of citations) {
        const exists = await knowledgeBase.verify(citation);
        if (!exists) {
          return { passed: false, severity: 'block', suggestion: '回复中引用了不存在的政策，请核实' };
        }
      }
      return { passed: true, severity: 'info' };
    }
  },
  {
    name: 'pii_protection',
    check: async (response, context) => {
      // 检查是否泄露敏感信息
      const piiPatterns = [/\b\d{16,19}\b/, /\b\d{3}-\d{2}-\d{4}\b/, /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/];
      for (const pattern of piiPatterns) {
        if (pattern.test(response.content)) {
          return { passed: false, severity: 'block', suggestion: '回复中包含敏感信息，请脱敏处理' };
        }
      }
      return { passed: true, severity: 'info' };
    }
  },
  {
    name: 'tone_consistency',
    check: async (response, context) => {
      // 确保回复语气与品牌一致
      const toneScore = await analyzeTone(response.content);
      if (toneScore.formality < 0.5 || toneScore.empathy < 0.3) {
        return { passed: false, severity: 'warn', suggestion: '回复语气需要更专业和具有同理心' };
      }
      return { passed: true, severity: 'info' };
    }
  }
];
```

## 24.6 关键度量与运营

### 24.6.1 运营指标看板

| 指标类别 | 指标名称 | 目标值 | 计算方式 |
|---------|---------|--------|---------|
| 效率 | 自动解决率 | > 70% | 无人工介入的已解决会话占比 |
| 效率 | 平均处理时长 | < 3min | 从首条消息到解决的时长 |
| 质量 | 客户满意度 | > 4.5/5 | 会话后满意度评分 |
| 质量 | 首次解决率 | > 85% | 一次交互解决问题的比例 |
| 安全 | 幻觉率 | < 1% | 引用错误信息的回复占比 |
| 安全 | 升级准确率 | > 95% | 正确升级到人工的比例 |

## 24.7 小结

企业客服 Agent 的成功关键：

1. **精确的意图理解**：多层级分类 + 实体抽取 + 情感分析
2. **可靠的知识管理**：RAG 确保回答有据可查，质量守卫防止幻觉
3. **灵活的升级机制**：AI 处理常规问题，人工处理复杂情况
4. **完善的运营体系**：持续监控、A/B 测试、反馈驱动改进


## 24.8 知识库与 RAG 集成

### 24.8.1 企业知识库架构

企业客服的核心能力是基于准确的知识回答问题。RAG（检索增强生成）是实现这一目标的关键技术。与通用 RAG 不同，客服场景的 RAG 需要处理多源、多格式、频繁更新的企业知识：

```typescript
interface KnowledgeSource {
  id: string;
  type: 'faq' | 'product_doc' | 'policy' | 'announcement' | 'training_script';
  name: string;
  updateFrequency: 'realtime' | 'daily' | 'weekly' | 'manual';
  priority: number;  // 检索优先级
}

interface KnowledgeChunk {
  id: string;
  sourceId: string;
  content: string;
  metadata: {
    title: string;
    category: string;
    lastUpdated: Date;
    version: string;
    confidence: number;  // 内容可信度
    expiresAt?: Date;    // 过期时间（如促销活动）
  };
  embedding: number[];
}

class EnterpriseKnowledgeBase {
  private vectorStore: VectorStore;
  private fullTextIndex: FullTextSearchEngine;
  private sources: Map<string, KnowledgeSource> = new Map();
  private updateQueue: UpdateQueue;

  async search(
    query: string,
    context: SearchContext
  ): Promise<KnowledgeSearchResult> {
    // 1. 混合检索：向量 + 全文 + 结构化
    const [semanticResults, keywordResults, structuredResults] = await Promise.all([
      this.semanticSearch(query, context),
      this.keywordSearch(query, context),
      this.structuredSearch(query, context),
    ]);

    // 2. 结果融合（Reciprocal Rank Fusion）
    const fusedResults = this.reciprocalRankFusion([
      { results: semanticResults, weight: 0.5 },
      { results: keywordResults, weight: 0.3 },
      { results: structuredResults, weight: 0.2 },
    ]);

    // 3. 过滤过期内容
    const validResults = fusedResults.filter(r => {
      if (r.metadata.expiresAt && new Date() > r.metadata.expiresAt) return false;
      return true;
    });

    // 4. 权限过滤（某些知识仅限特定客户等级）
    const authorizedResults = await this.filterByPermission(validResults, context);

    return {
      results: authorizedResults.slice(0, 5),
      totalFound: authorizedResults.length,
      searchStrategy: 'hybrid',
    };
  }

  // 知识同步管线
  async syncSource(source: KnowledgeSource): Promise<SyncResult> {
    const connector = this.getConnector(source.type);
    const rawDocuments = await connector.fetch(source);

    let added = 0, updated = 0, deleted = 0;

    for (const doc of rawDocuments) {
      const existingChunks = await this.getChunksForDocument(doc.id);

      if (doc.isDeleted) {
        await this.deleteChunks(existingChunks);
        deleted += existingChunks.length;
        continue;
      }

      // 分块
      const newChunks = await this.chunkDocument(doc, source);

      // 计算差异
      const { toAdd, toUpdate, toRemove } = this.diffChunks(existingChunks, newChunks);

      // 批量更新向量存储
      if (toAdd.length > 0) {
        const embeddings = await this.generateEmbeddings(toAdd.map(c => c.content));
        for (let i = 0; i < toAdd.length; i++) {
          toAdd[i].embedding = embeddings[i];
        }
        await this.vectorStore.upsert(toAdd);
        added += toAdd.length;
      }

      if (toUpdate.length > 0) {
        const embeddings = await this.generateEmbeddings(toUpdate.map(c => c.content));
        for (let i = 0; i < toUpdate.length; i++) {
          toUpdate[i].embedding = embeddings[i];
        }
        await this.vectorStore.upsert(toUpdate);
        updated += toUpdate.length;
      }

      if (toRemove.length > 0) {
        await this.deleteChunks(toRemove);
        deleted += toRemove.length;
      }
    }

    return { added, updated, deleted, source: source.id };
  }

  private reciprocalRankFusion(
    rankedLists: { results: KnowledgeChunk[]; weight: number }[]
  ): KnowledgeChunk[] {
    const k = 60; // RRF 常数
    const scores: Map<string, { chunk: KnowledgeChunk; score: number }> = new Map();

    for (const { results, weight } of rankedLists) {
      results.forEach((chunk, rank) => {
        const existing = scores.get(chunk.id);
        const rrfScore = weight / (k + rank + 1);
        if (existing) {
          existing.score += rrfScore;
        } else {
          scores.set(chunk.id, { chunk, score: rrfScore });
        }
      });
    }

    return [...scores.values()]
      .sort((a, b) => b.score - a.score)
      .map(item => item.chunk);
  }

  private async semanticSearch(query: string, context: SearchContext): Promise<KnowledgeChunk[]> {
    const embedding = await this.generateEmbeddings([query]);
    return this.vectorStore.search(embedding[0], { topK: 20, filter: context.filters });
  }

  private async keywordSearch(query: string, context: SearchContext): Promise<KnowledgeChunk[]> {
    return this.fullTextIndex.search(query, { limit: 20, filter: context.filters });
  }

  private async structuredSearch(query: string, context: SearchContext): Promise<KnowledgeChunk[]> {
    // 基于已知实体（产品名、订单号等）的结构化查询
    const entities = context.extractedEntities || {};
    if (entities.productName) {
      return this.vectorStore.filter({ 'metadata.category': entities.productName });
    }
    return [];
  }

  private async filterByPermission(
    results: KnowledgeChunk[], context: SearchContext
  ): Promise<KnowledgeChunk[]> {
    // 根据客户等级过滤知识
    return results.filter(r => {
      if (r.metadata.accessLevel === 'internal') return false;
      if (r.metadata.accessLevel === 'vip' && context.customerTier !== 'vip') return false;
      return true;
    });
  }

  private async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // 批量生成文本嵌入
    return texts.map(() => new Array(768).fill(0).map(() => Math.random()));
  }

  private async chunkDocument(doc: any, source: KnowledgeSource): Promise<KnowledgeChunk[]> {
    const chunks: KnowledgeChunk[] = [];
    const paragraphs = doc.content.split(/\n\n+/);
    let chunkIndex = 0;

    for (const para of paragraphs) {
      if (para.trim().length < 20) continue;
      chunks.push({
        id: `${doc.id}_chunk_${chunkIndex++}`,
        sourceId: source.id,
        content: para.trim(),
        metadata: {
          title: doc.title,
          category: doc.category || source.type,
          lastUpdated: new Date(),
          version: doc.version || '1.0',
          confidence: 1.0,
        },
        embedding: [],
      });
    }
    return chunks;
  }

  private getConnector(type: string): any {
    return { fetch: async () => [] };
  }

  private async getChunksForDocument(docId: string): Promise<KnowledgeChunk[]> {
    return [];
  }

  private async deleteChunks(chunks: KnowledgeChunk[]): Promise<void> {}

  private diffChunks(existing: KnowledgeChunk[], incoming: KnowledgeChunk[]) {
    return { toAdd: incoming, toUpdate: [], toRemove: [] };
  }
}
```

### 24.8.2 回答生成与引用标注

客服系统生成的每个回答都必须有据可查，避免幻觉：

```typescript
class AnswerGenerator {
  private model: LLMClient;
  private knowledgeBase: EnterpriseKnowledgeBase;

  async generateAnswer(
    question: string,
    conversationHistory: Message[],
    context: CustomerContext
  ): Promise<AnswerResult> {
    // 1. 检索相关知识
    const searchResult = await this.knowledgeBase.search(question, {
      filters: { customerTier: context.tier },
      extractedEntities: context.entities,
    });

    if (searchResult.results.length === 0) {
      return {
        answer: '抱歉，我暂时无法找到相关信息。让我为您转接专业客服。',
        citations: [],
        confidence: 0,
        shouldEscalate: true,
      };
    }

    // 2. 构建 prompt
    const prompt = this.buildAnswerPrompt(question, conversationHistory, searchResult.results, context);

    // 3. 生成回答
    const response = await this.model.generate(prompt, {
      temperature: 0.3,  // 低温度保证一致性
      maxTokens: 500,
    });

    // 4. 验证引用
    const citations = this.extractAndValidateCitations(response, searchResult.results);

    // 5. 计算置信度
    const confidence = this.calculateConfidence(searchResult.results, citations);

    return {
      answer: response,
      citations,
      confidence,
      shouldEscalate: confidence < 0.5,
      knowledgeSources: searchResult.results.map(r => r.sourceId),
    };
  }

  private buildAnswerPrompt(
    question: string,
    history: Message[],
    knowledge: KnowledgeChunk[],
    context: CustomerContext
  ): string {
    return `你是一名专业的客服代表。请基于以下知识库内容回答客户问题。

## 重要规则
1. 只基于提供的知识库内容回答，不得编造信息
2. 如果知识库中没有相关信息，明确告知客户并建议转人工
3. 回答要简洁、专业、有同理心
4. 涉及具体政策时，引用知识库来源编号 [1] [2] 等
5. 不要透露内部系统信息或折扣权限

## 客户信息
- 客户等级：${context.tier}
- 客户情绪：${context.sentiment}
- 历史工单数：${context.ticketCount}

## 对话历史
${history.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n')}

## 知识库内容
${knowledge.map((k, i) => `[${i + 1}] ${k.metadata.title}\n${k.content}`).join('\n\n')}

## 客户问题
${question}

## 回答要求
请用中文回答，保持专业和友好的语气。`;
  }

  private extractAndValidateCitations(
    answer: string, sources: KnowledgeChunk[]
  ): Citation[] {
    const citationPattern = /\[(\d+)\]/g;
    const citations: Citation[] = [];
    let match: RegExpExecArray | null;

    while ((match = citationPattern.exec(answer)) !== null) {
      const index = parseInt(match[1]) - 1;
      if (index >= 0 && index < sources.length) {
        citations.push({
          index: index + 1,
          sourceId: sources[index].sourceId,
          title: sources[index].metadata.title,
          content: sources[index].content.slice(0, 100),
        });
      }
    }

    return citations;
  }

  private calculateConfidence(
    searchResults: KnowledgeChunk[], citations: Citation[]
  ): number {
    if (searchResults.length === 0) return 0;
    if (citations.length === 0) return 0.3;

    // 基于检索相关性和引用完整性计算置信度
    const avgRelevance = searchResults
      .slice(0, 3)
      .reduce((sum, r) => sum + (r.metadata.confidence || 0.5), 0) / 3;

    const citationCoverage = Math.min(citations.length / 2, 1.0);

    return avgRelevance * 0.6 + citationCoverage * 0.4;
  }
}
```

## 24.9 多轮对话管理

### 24.9.1 对话状态机

复杂客服场景需要管理多轮对话的状态，确保在上下文切换时不丢失信息：

```typescript
type ConversationState =
  | 'greeting'
  | 'intent_identification'
  | 'information_gathering'
  | 'solution_providing'
  | 'confirmation'
  | 'follow_up'
  | 'escalation'
  | 'closing';

interface ConversationContext {
  sessionId: string;
  customerId: string;
  state: ConversationState;
  intent: IntentResult | null;
  entities: Map<string, string>;
  slots: Map<string, SlotValue>;   // 待收集的信息槽位
  history: Message[];
  metadata: {
    startTime: number;
    turnCount: number;
    sentiment: string;
    escalationAttempts: number;
    resolvedTopics: string[];
  };
}

interface SlotValue {
  name: string;
  required: boolean;
  value: string | null;
  prompt: string;       // 询问用户该信息的提示语
  validation: (value: string) => boolean;
}

class ConversationManager {
  private stateHandlers: Map<ConversationState, StateHandler> = new Map();

  constructor() {
    this.registerStateHandlers();
  }

  async processMessage(
    ctx: ConversationContext,
    message: string
  ): Promise<{ response: string; newState: ConversationState; actions: Action[] }> {
    // 更新对话历史
    ctx.history.push({ role: 'user', content: message, timestamp: Date.now() });
    ctx.metadata.turnCount++;

    // 检查是否需要状态切换
    const stateTransition = await this.checkStateTransition(ctx, message);
    if (stateTransition) {
      ctx.state = stateTransition;
    }

    // 执行当前状态的处理器
    const handler = this.stateHandlers.get(ctx.state);
    if (!handler) {
      throw new Error(`No handler for state: ${ctx.state}`);
    }

    const result = await handler.handle(ctx, message);

    // 更新上下文
    ctx.state = result.newState;
    ctx.history.push({ role: 'assistant', content: result.response, timestamp: Date.now() });

    return result;
  }

  private async checkStateTransition(
    ctx: ConversationContext, message: string
  ): ConversationState | null {
    // 紧急升级检测
    const urgentPatterns = [
      /投诉.*领导/, /法律.*诉讼/, /消费者协会/, /工商/, /媒体.*曝光/,
      /要求.*赔偿/, /已经.*多次/, /再不解决/,
    ];
    if (urgentPatterns.some(p => p.test(message))) {
      return 'escalation';
    }

    // 情感急剧恶化检测
    if (ctx.metadata.sentiment === 'angry' && ctx.metadata.turnCount > 3) {
      return 'escalation';
    }

    // 话题切换检测
    const topicShift = await this.detectTopicShift(ctx, message);
    if (topicShift) {
      return 'intent_identification';
    }

    return null;
  }

  private async detectTopicShift(ctx: ConversationContext, message: string): Promise<boolean> {
    if (!ctx.intent) return true;

    // 简单的话题切换检测：检查新消息是否与当前意图相关
    const currentTopic = ctx.intent.primaryIntent;
    const topicKeywords: Record<string, string[]> = {
      'order': ['订单', '物流', '发货', '快递', '收货'],
      'refund': ['退款', '退货', '退费', '返还'],
      'billing': ['账单', '扣费', '费用', '充值', '余额'],
      'technical': ['故障', '无法使用', '报错', '系统', '登录'],
    };

    const currentKeywords = topicKeywords[currentTopic] || [];
    const isRelated = currentKeywords.some(k => message.includes(k));

    // 如果消息中没有当前话题的关键词，且包含其他话题的关键词，判定为话题切换
    if (!isRelated) {
      for (const [topic, keywords] of Object.entries(topicKeywords)) {
        if (topic !== currentTopic && keywords.some(k => message.includes(k))) {
          return true;
        }
      }
    }

    return false;
  }

  private registerStateHandlers(): void {
    this.stateHandlers.set('greeting', new GreetingHandler());
    this.stateHandlers.set('intent_identification', new IntentIdentificationHandler());
    this.stateHandlers.set('information_gathering', new InformationGatheringHandler());
    this.stateHandlers.set('solution_providing', new SolutionProvidingHandler());
    this.stateHandlers.set('confirmation', new ConfirmationHandler());
    this.stateHandlers.set('follow_up', new FollowUpHandler());
    this.stateHandlers.set('escalation', new EscalationHandler());
    this.stateHandlers.set('closing', new ClosingHandler());
  }
}

// 信息收集处理器——展示槽位填充模式
class InformationGatheringHandler implements StateHandler {
  async handle(ctx: ConversationContext, message: string): Promise<StateHandlerResult> {
    // 尝试从用户消息中提取槽位信息
    const extractedSlots = await this.extractSlots(ctx, message);

    for (const [slotName, value] of Object.entries(extractedSlots)) {
      const slot = ctx.slots.get(slotName);
      if (slot && slot.validation(value)) {
        slot.value = value;
      }
    }

    // 检查是否所有必填槽位都已填充
    const missingSlots = [...ctx.slots.values()].filter(s => s.required && !s.value);

    if (missingSlots.length === 0) {
      // 所有信息已收集，进入解决方案提供阶段
      return {
        response: '好的，信息已确认完毕。正在为您查询处理方案，请稍候。',
        newState: 'solution_providing',
        actions: [{ type: 'lookup_solution', params: Object.fromEntries(ctx.slots) }],
      };
    }

    // 询问下一个缺失的槽位
    const nextSlot = missingSlots[0];
    return {
      response: nextSlot.prompt,
      newState: 'information_gathering',
      actions: [],
    };
  }

  private async extractSlots(
    ctx: ConversationContext, message: string
  ): Promise<Record<string, string>> {
    const extracted: Record<string, string> = {};

    // 订单号提取
    const orderMatch = message.match(/(?:订单号?|order)\s*[:：]?\s*([A-Z0-9]{10,20})/i);
    if (orderMatch) extracted.orderId = orderMatch[1];

    // 手机号提取
    const phoneMatch = message.match(/1[3-9]\d{9}/);
    if (phoneMatch) extracted.phone = phoneMatch[0];

    // 日期提取
    const dateMatch = message.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
    if (dateMatch) extracted.date = dateMatch[1];

    // 金额提取
    const amountMatch = message.match(/(\d+(?:\.\d{1,2})?)\s*(?:元|块|¥)/);
    if (amountMatch) extracted.amount = amountMatch[1];

    return extracted;
  }
}
```

### 24.9.2 对话摘要与上下文压缩

长对话需要定期压缩历史消息，避免超出 token 限制：

```typescript
class ConversationSummarizer {
  private model: LLMClient;

  async summarize(messages: Message[]): Promise<ConversationSummary> {
    if (messages.length <= 6) {
      // 短对话无需压缩
      return { summary: null, preserveFrom: 0 };
    }

    // 保留最近 4 轮对话的原文，压缩之前的内容
    const toSummarize = messages.slice(0, -8);
    const toPreserve = messages.slice(-8);

    const prompt = `请将以下客服对话历史压缩为一段简要摘要，保留关键信息（客户问题、已确认的信息、已尝试的解决方案）：

${toSummarize.map(m => `${m.role === 'user' ? '客户' : '客服'}: ${m.content}`).join('\n')}

摘要要求：
1. 保留客户的核心诉求
2. 保留已确认的订单号、金额等关键实体
3. 保留已尝试但失败的解决方案
4. 不超过 200 字`;

    const summary = await this.model.generate(prompt, { maxTokens: 300 });

    return {
      summary,
      preserveFrom: toSummarize.length,
      preservedMessages: toPreserve,
    };
  }

  // 基于摘要重建上下文
  buildContextFromSummary(summary: ConversationSummary): string {
    if (!summary.summary) return '';

    return `[对话摘要] ${summary.summary}\n\n[以下为近期对话]`;
  }
}
```

## 24.10 情感分析与升级策略

### 24.10.1 实时情感监测

```typescript
interface SentimentSignal {
  score: number;        // -1 (极度负面) 到 +1 (极度正面)
  emotion: 'happy' | 'neutral' | 'frustrated' | 'angry' | 'anxious' | 'disappointed';
  trend: 'improving' | 'stable' | 'deteriorating';
  urgency: 'low' | 'medium' | 'high' | 'critical';
  triggers: string[];   // 触发情绪变化的关键词或事件
}

class SentimentAnalyzer {
  private model: LLMClient;
  private sentimentHistory: SentimentSignal[] = [];

  async analyze(
    message: string,
    conversationContext: ConversationContext
  ): Promise<SentimentSignal> {
    // 基于关键词的快速预判
    const quickScore = this.quickSentimentCheck(message);

    // 如果快速检查发现强烈负面情绪，直接返回
    if (quickScore < -0.7) {
      const signal: SentimentSignal = {
        score: quickScore,
        emotion: 'angry',
        trend: this.calculateTrend(),
        urgency: 'critical',
        triggers: this.extractTriggers(message),
      };
      this.sentimentHistory.push(signal);
      return signal;
    }

    // LLM 精确分析
    const prompt = `分析以下客户消息的情感。
    
消息: "${message}"
对话轮次: ${conversationContext.metadata.turnCount}
之前情绪: ${this.sentimentHistory.slice(-1)[0]?.emotion ?? 'unknown'}

返回 JSON: {"score": -1到1, "emotion": "happy|neutral|frustrated|angry|anxious|disappointed", "triggers": ["关键词"]}`;

    const response = await this.model.generate(prompt, {
      responseFormat: { type: 'json_object' },
      maxTokens: 100,
    });

    const parsed = JSON.parse(response);
    const signal: SentimentSignal = {
      score: parsed.score,
      emotion: parsed.emotion,
      trend: this.calculateTrend(),
      urgency: this.calculateUrgency(parsed.score, conversationContext),
      triggers: parsed.triggers || [],
    };

    this.sentimentHistory.push(signal);
    return signal;
  }

  private quickSentimentCheck(message: string): number {
    const negativePatterns: { pattern: RegExp; weight: number }[] = [
      { pattern: /垃圾|骗子|骗人|诈骗/, weight: -0.9 },
      { pattern: /投诉|举报|曝光|差评/, weight: -0.8 },
      { pattern: /愤怒|生气|恼火|气死/, weight: -0.7 },
      { pattern: /失望|不满|不行|太差/, weight: -0.5 },
      { pattern: /等了很久|催促|着急|快点/, weight: -0.4 },
      { pattern: /不理解|搞不懂|复杂/, weight: -0.3 },
    ];

    const positivePatterns: { pattern: RegExp; weight: number }[] = [
      { pattern: /感谢|谢谢|辛苦|好的/, weight: 0.5 },
      { pattern: /解决了|满意|不错/, weight: 0.7 },
      { pattern: /太棒了|优秀|赞/, weight: 0.8 },
    ];

    let score = 0;
    let matched = false;

    for (const { pattern, weight } of negativePatterns) {
      if (pattern.test(message)) { score += weight; matched = true; }
    }
    for (const { pattern, weight } of positivePatterns) {
      if (pattern.test(message)) { score += weight; matched = true; }
    }

    return matched ? Math.max(-1, Math.min(1, score)) : 0;
  }

  private calculateTrend(): SentimentSignal['trend'] {
    if (this.sentimentHistory.length < 2) return 'stable';
    const recent = this.sentimentHistory.slice(-3).map(s => s.score);
    const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
    const prevAvg = this.sentimentHistory.slice(-6, -3).map(s => s.score);
    const avgPrev = prevAvg.length > 0 ? prevAvg.reduce((a, b) => a + b, 0) / prevAvg.length : 0;

    if (avgRecent - avgPrev > 0.2) return 'improving';
    if (avgPrev - avgRecent > 0.2) return 'deteriorating';
    return 'stable';
  }

  private calculateUrgency(score: number, ctx: ConversationContext): SentimentSignal['urgency'] {
    if (score < -0.7) return 'critical';
    if (score < -0.4 && ctx.metadata.turnCount > 5) return 'high';
    if (score < -0.2) return 'medium';
    return 'low';
  }

  private extractTriggers(message: string): string[] {
    const triggers: string[] = [];
    const patterns = [
      { pattern: /等了(\d+)(天|小时|分钟)/, name: '等待时间长' },
      { pattern: /第(\d+)次/, name: '重复联系' },
      { pattern: /(退款|退货).*失败/, name: '退款失败' },
      { pattern: /(系统|功能).*故障/, name: '系统故障' },
    ];

    for (const { pattern, name } of patterns) {
      if (pattern.test(message)) triggers.push(name);
    }
    return triggers;
  }
}
```

### 24.10.2 智能升级决策引擎

```typescript
interface EscalationDecision {
  shouldEscalate: boolean;
  reason: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  targetTeam: string;
  contextSummary: string;
  suggestedActions: string[];
}

class EscalationManager {
  private sentimentAnalyzer: SentimentAnalyzer;
  private rules: EscalationRule[];

  constructor() {
    this.rules = this.buildEscalationRules();
  }

  async evaluate(
    ctx: ConversationContext,
    sentiment: SentimentSignal,
    currentResponse: AnswerResult
  ): Promise<EscalationDecision> {
    const signals: EscalationSignal[] = [];

    // 收集升级信号
    for (const rule of this.rules) {
      const signal = await rule.evaluate(ctx, sentiment, currentResponse);
      if (signal.triggered) signals.push(signal);
    }

    if (signals.length === 0) {
      return { shouldEscalate: false, reason: '', priority: 'P3', targetTeam: '', contextSummary: '', suggestedActions: [] };
    }

    // 确定最高优先级
    const highestPriority = signals.reduce((max, s) =>
      this.priorityOrder(s.priority) < this.priorityOrder(max.priority) ? s : max
    );

    // 生成上下文摘要给人工客服
    const summary = await this.generateHandoverSummary(ctx, signals);

    return {
      shouldEscalate: true,
      reason: signals.map(s => s.reason).join('; '),
      priority: highestPriority.priority,
      targetTeam: highestPriority.targetTeam,
      contextSummary: summary,
      suggestedActions: this.generateSuggestedActions(signals, ctx),
    };
  }

  private buildEscalationRules(): EscalationRule[] {
    return [
      // 规则 1: 情感恶化
      {
        name: 'sentiment_critical',
        evaluate: async (ctx, sentiment) => ({
          triggered: sentiment.urgency === 'critical',
          reason: '客户情绪达到临界点',
          priority: 'P0' as const,
          targetTeam: 'senior-support',
        }),
      },
      // 规则 2: 持续负面趋势
      {
        name: 'sentiment_deteriorating',
        evaluate: async (ctx, sentiment) => ({
          triggered: sentiment.trend === 'deteriorating' && ctx.metadata.turnCount > 5,
          reason: '客户情绪持续恶化',
          priority: 'P1' as const,
          targetTeam: 'escalation-team',
        }),
      },
      // 规则 3: Agent 置信度低
      {
        name: 'low_confidence',
        evaluate: async (ctx, sentiment, response) => ({
          triggered: (response?.confidence ?? 1) < 0.3,
          reason: 'AI 回答置信度过低',
          priority: 'P2' as const,
          targetTeam: 'subject-matter-expert',
        }),
      },
      // 规则 4: 超轮次未解决
      {
        name: 'max_turns_exceeded',
        evaluate: async (ctx) => ({
          triggered: ctx.metadata.turnCount > 10 && ctx.metadata.resolvedTopics.length === 0,
          reason: '超过 10 轮对话仍未解决',
          priority: 'P1' as const,
          targetTeam: 'escalation-team',
        }),
      },
      // 规则 5: 涉及赔偿/退款超权限
      {
        name: 'authority_exceeded',
        evaluate: async (ctx) => {
          const amount = ctx.entities.get('requestedAmount');
          const threshold = 500; // 超过 500 元需要人工审批
          return {
            triggered: amount !== undefined && parseFloat(amount) > threshold,
            reason: `赔偿金额 ${amount} 元超过自动处理权限`,
            priority: 'P1' as const,
            targetTeam: 'billing-authority',
          };
        },
      },
      // 规则 6: 客户明确要求人工
      {
        name: 'explicit_request',
        evaluate: async (ctx, sentiment, response) => {
          const lastMessage = ctx.history[ctx.history.length - 1]?.content ?? '';
          const humanRequestPatterns = [/转人工/, /人工客服/, /真人/, /你是机器人/, /找你们经理/];
          return {
            triggered: humanRequestPatterns.some(p => p.test(lastMessage)),
            reason: '客户明确要求人工服务',
            priority: 'P1' as const,
            targetTeam: 'human-support',
          };
        },
      },
    ];
  }

  private async generateHandoverSummary(
    ctx: ConversationContext, signals: EscalationSignal[]
  ): Promise<string> {
    const parts: string[] = [
      `客户 ID: ${ctx.customerId}`,
      `会话时长: ${Math.floor((Date.now() - ctx.metadata.startTime) / 60000)} 分钟`,
      `对话轮次: ${ctx.metadata.turnCount}`,
      `客户诉求: ${ctx.intent?.primaryIntent ?? '未识别'}`,
      `升级原因: ${signals.map(s => s.reason).join(', ')}`,
      `已收集信息: ${JSON.stringify(Object.fromEntries(ctx.entities))}`,
      `已尝试方案: ${ctx.metadata.resolvedTopics.join(', ') || '无'}`,
    ];

    return parts.join('\n');
  }

  private generateSuggestedActions(signals: EscalationSignal[], ctx: ConversationContext): string[] {
    const actions: string[] = [];
    if (signals.some(s => s.name === 'sentiment_critical')) {
      actions.push('优先安抚客户情绪');
      actions.push('查看客户历史工单是否有反复投诉');
    }
    if (signals.some(s => s.name === 'authority_exceeded')) {
      actions.push('核实退款/赔偿请求的合理性');
      actions.push('按照权限审批流程处理');
    }
    if (ctx.metadata.turnCount > 8) {
      actions.push('回顾完整对话记录，避免客户重复陈述');
    }
    return actions;
  }

  private priorityOrder(priority: string): number {
    const order: Record<string, number> = { 'P0': 0, 'P1': 1, 'P2': 2, 'P3': 3 };
    return order[priority] ?? 99;
  }
}
```

## 24.11 多渠道支持

### 24.11.1 全渠道消息适配

```typescript
interface ChannelAdapter {
  name: string;
  capabilities: ChannelCapability[];
  normalize(rawMessage: any): StandardMessage;
  format(response: AgentResponse): ChannelSpecificMessage;
}

interface ChannelCapability {
  type: 'text' | 'rich_text' | 'image' | 'button' | 'card' | 'carousel' | 'quick_reply' | 'voice';
  supported: boolean;
  maxLength?: number;
}

class OmniChannelGateway {
  private adapters: Map<string, ChannelAdapter> = new Map();
  private agent: CustomerServiceAgent;

  constructor(agent: CustomerServiceAgent) {
    this.agent = agent;
    this.registerDefaultAdapters();
  }

  private registerDefaultAdapters(): void {
    // Web Chat 适配器
    this.adapters.set('web', {
      name: 'Web Chat',
      capabilities: [
        { type: 'text', supported: true, maxLength: 10000 },
        { type: 'rich_text', supported: true },
        { type: 'image', supported: true },
        { type: 'button', supported: true },
        { type: 'card', supported: true },
        { type: 'quick_reply', supported: true },
      ],
      normalize: (raw) => ({
        text: raw.message,
        attachments: raw.files || [],
        metadata: { channel: 'web', sessionId: raw.sessionId },
      }),
      format: (response) => ({
        html: this.markdownToHtml(response.content),
        quickReplies: response.suggestedReplies,
        buttons: response.actions?.map(a => ({ label: a.label, action: a.type })),
      }),
    });

    // 微信适配器
    this.adapters.set('wechat', {
      name: 'WeChat',
      capabilities: [
        { type: 'text', supported: true, maxLength: 2048 },
        { type: 'image', supported: true },
        { type: 'card', supported: true },
        { type: 'quick_reply', supported: false },
      ],
      normalize: (raw) => ({
        text: raw.Content,
        attachments: raw.PicUrl ? [{ type: 'image', url: raw.PicUrl }] : [],
        metadata: { channel: 'wechat', openId: raw.FromUserName },
      }),
      format: (response) => {
        // 微信文本消息限制 2048 字符
        let text = response.content;
        if (text.length > 2048) {
          text = text.slice(0, 2000) + '\n\n[消息过长，请回复"继续"查看完整内容]';
        }
        return { MsgType: 'text', Content: text };
      },
    });

    // 企业微信适配器
    this.adapters.set('wecom', {
      name: 'WeCom',
      capabilities: [
        { type: 'text', supported: true, maxLength: 4096 },
        { type: 'rich_text', supported: true },
        { type: 'image', supported: true },
        { type: 'card', supported: true },
        { type: 'button', supported: true },
      ],
      normalize: (raw) => ({
        text: raw.Content || raw.content,
        attachments: [],
        metadata: { channel: 'wecom', userId: raw.FromUserName },
      }),
      format: (response) => ({
        msgtype: response.actions ? 'interactive' : 'text',
        text: { content: response.content },
      }),
    });

    // 电话/IVR 适配器
    this.adapters.set('phone', {
      name: 'Phone/IVR',
      capabilities: [
        { type: 'text', supported: true, maxLength: 500 },
        { type: 'voice', supported: true },
      ],
      normalize: (raw) => ({
        text: raw.transcription,
        attachments: [],
        metadata: {
          channel: 'phone',
          callId: raw.callId,
          callerNumber: raw.callerNumber,
          speechConfidence: raw.confidence,
        },
      }),
      format: (response) => {
        // 电话渠道需要简短、口语化的回答
        let text = response.content;
        // 移除 Markdown 格式
        text = text.replace(/[*#`\[\]]/g, '');
        // 限制长度
        if (text.length > 500) {
          text = text.slice(0, 450) + '。如需了解更多详情，我可以将详细信息发送到您的手机。';
        }
        return {
          ttsText: text,
          ssml: this.textToSSML(text),
        };
      },
    });

    // 邮件适配器
    this.adapters.set('email', {
      name: 'Email',
      capabilities: [
        { type: 'text', supported: true, maxLength: 50000 },
        { type: 'rich_text', supported: true },
        { type: 'image', supported: true },
      ],
      normalize: (raw) => ({
        text: raw.body,
        attachments: raw.attachments || [],
        metadata: {
          channel: 'email',
          from: raw.from,
          subject: raw.subject,
          threadId: raw.threadId,
        },
      }),
      format: (response) => ({
        subject: `Re: ${response.metadata?.originalSubject || '客服回复'}`,
        html: this.markdownToHtml(response.content),
        text: response.content,
      }),
    });
  }

  async handleMessage(channel: string, rawMessage: any): Promise<any> {
    const adapter = this.adapters.get(channel);
    if (!adapter) throw new Error(`Unknown channel: ${channel}`);

    // 1. 标准化输入
    const standardMessage = adapter.normalize(rawMessage);

    // 2. Agent 处理
    const agentResponse = await this.agent.handle(standardMessage);

    // 3. 适配输出
    const channelMessage = adapter.format(agentResponse);

    return channelMessage;
  }

  private markdownToHtml(markdown: string): string {
    // 简化的 Markdown → HTML 转换
    return markdown
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\*(.+?)\*/g, '<i>$1</i>')
      .replace(/\n/g, '<br>');
  }

  private textToSSML(text: string): string {
    return `<speak>${text.replace(/。/g, '<break time="300ms"/>。')}</speak>`;
  }
}
```

## 24.12 合规与审计

### 24.12.1 审计日志系统

```typescript
interface AuditEntry {
  id: string;
  timestamp: number;
  sessionId: string;
  customerId: string;
  agentId: string;
  event: AuditEvent;
  details: Record<string, any>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

type AuditEvent =
  | 'session_started'
  | 'intent_classified'
  | 'knowledge_retrieved'
  | 'response_generated'
  | 'response_filtered'
  | 'human_escalated'
  | 'ticket_created'
  | 'data_accessed'
  | 'action_executed'
  | 'session_ended';

class AuditLogger {
  private buffer: AuditEntry[] = [];
  private readonly FLUSH_INTERVAL = 5000;  // 5秒
  private readonly BUFFER_SIZE = 100;

  constructor(private storage: AuditStorage) {
    // 定期刷新缓冲区
    setInterval(() => this.flush(), this.FLUSH_INTERVAL);
  }

  log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): void {
    this.buffer.push({
      ...entry,
      id: this.generateId(),
      timestamp: Date.now(),
    });

    // 高风险事件立即写入
    if (entry.riskLevel === 'critical' || entry.riskLevel === 'high') {
      this.flush();
    }

    // 缓冲区满时刷新
    if (this.buffer.length >= this.BUFFER_SIZE) {
      this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const entries = [...this.buffer];
    this.buffer = [];
    await this.storage.batchWrite(entries);
  }

  // 合规查询接口
  async queryAuditTrail(
    filters: AuditQueryFilters
  ): Promise<AuditEntry[]> {
    return this.storage.query(filters);
  }

  // 生成合规报告
  async generateComplianceReport(
    period: { start: Date; end: Date }
  ): Promise<ComplianceReport> {
    const entries = await this.storage.query({
      startTime: period.start.getTime(),
      endTime: period.end.getTime(),
    });

    return {
      period,
      totalSessions: new Set(entries.map(e => e.sessionId)).size,
      escalationRate: entries.filter(e => e.event === 'human_escalated').length /
                      entries.filter(e => e.event === 'session_started').length,
      dataAccessEvents: entries.filter(e => e.event === 'data_accessed').length,
      highRiskEvents: entries.filter(e => e.riskLevel === 'high' || e.riskLevel === 'critical').length,
      responseFilterEvents: entries.filter(e => e.event === 'response_filtered').length,
      averageSessionLength: this.calculateAverageSessionLength(entries),
    };
  }

  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private calculateAverageSessionLength(entries: AuditEntry[]): number {
    const sessions: Map<string, { start: number; end: number }> = new Map();
    for (const entry of entries) {
      const existing = sessions.get(entry.sessionId);
      if (!existing) {
        sessions.set(entry.sessionId, { start: entry.timestamp, end: entry.timestamp });
      } else {
        existing.end = Math.max(existing.end, entry.timestamp);
      }
    }
    const durations = [...sessions.values()].map(s => s.end - s.start);
    return durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  }
}
```

### 24.12.2 PII 检测与脱敏

```typescript
class PIIDetector {
  private patterns: { name: string; regex: RegExp; replacement: string }[] = [
    { name: '手机号', regex: /1[3-9]\d{9}/g, replacement: '1**********' },
    { name: '身份证号', regex: /[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g, replacement: '******************' },
    { name: '银行卡号', regex: /\b\d{16,19}\b/g, replacement: '****-****-****-****' },
    { name: '邮箱', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '***@***.***' },
    { name: '信用卡CVV', regex: /\bCVV\s*[:：]?\s*\d{3,4}\b/gi, replacement: 'CVV: ***' },
  ];

  detect(text: string): PIIDetectionResult {
    const findings: PIIFinding[] = [];

    for (const { name, regex, replacement } of this.patterns) {
      const matches = text.matchAll(new RegExp(regex));
      for (const match of matches) {
        findings.push({
          type: name,
          value: match[0],
          position: match.index!,
          length: match[0].length,
          replacement,
        });
      }
    }

    return {
      hasPII: findings.length > 0,
      findings,
    };
  }

  sanitize(text: string): string {
    let sanitized = text;
    for (const { regex, replacement } of this.patterns) {
      sanitized = sanitized.replace(regex, replacement);
    }
    return sanitized;
  }
}
```

## 24.13 成本分析与 ROI

### 24.13.1 AI 客服 vs 传统客服成本对比

| 成本项 | 传统呼叫中心 | AI 客服 Agent | 混合模式 |
|--------|-------------|--------------|---------|
| **座席人力成本** | ¥8,000-15,000/人/月 | ¥0 | ¥8,000-15,000 (减少 60-70%) |
| **LLM API 成本** | ¥0 | ¥0.5-2/会话 | ¥0.5-2/会话 |
| **向量数据库** | ¥0 | ¥2,000-5,000/月 | ¥2,000-5,000/月 |
| **基础设施** | ¥50,000+/月 | ¥15,000-30,000/月 | ¥40,000-60,000/月 |
| **培训成本** | ¥3,000-5,000/人 | ¥0 (知识库更新) | ¥1,000-2,000/人 |
| **扩容边际成本** | 线性增长 | 近零边际成本 | 较低增长 |
| **7×24 覆盖** | 3倍人力成本 | 无额外成本 | 仅夜间 AI 覆盖 |
| **多语言支持** | 每语言额外团队 | LLM 原生支持 | 混合 |

### 24.13.2 ROI 计算模型

```typescript
interface CostModel {
  monthly: {
    humanAgents: number;          // 人工座席数量
    humanCostPerAgent: number;    // 每位座席月成本
    aiApiCostPerSession: number;  // AI 每会话 API 成本
    infrastructureCost: number;   // 基础设施月成本
    maintenanceCost: number;      // 运维月成本
  };
  volume: {
    dailySessions: number;        // 日均会话数
    aiResolutionRate: number;     // AI 自动解决率
    averageHandleTime: {
      human: number;              // 人工平均处理时间（分钟）
      ai: number;                 // AI 平均处理时间（分钟）
    };
  };
}

class ROICalculator {
  calculate(before: CostModel, after: CostModel): ROIReport {
    // 月会话量
    const monthlySessions = after.volume.dailySessions * 30;

    // AI 处理的会话数
    const aiHandledSessions = monthlySessions * after.volume.aiResolutionRate;
    const humanHandledSessions = monthlySessions * (1 - after.volume.aiResolutionRate);

    // 之前的月度成本
    const previousMonthly = before.monthly.humanAgents * before.monthly.humanCostPerAgent
      + before.monthly.infrastructureCost;

    // 之后的月度成本
    const aiApiCost = aiHandledSessions * after.monthly.aiApiCostPerSession;
    const newHumanCost = after.monthly.humanAgents * after.monthly.humanCostPerAgent;
    const currentMonthly = aiApiCost + newHumanCost
      + after.monthly.infrastructureCost + after.monthly.maintenanceCost;

    // 月节省
    const monthlySaving = previousMonthly - currentMonthly;

    // 效率提升
    const previousCapacity = before.monthly.humanAgents * 8 * 60 / before.volume.averageHandleTime.human * 22;
    const currentCapacity = aiHandledSessions + humanHandledSessions;
    const capacityIncrease = (currentCapacity / previousCapacity - 1) * 100;

    return {
      monthlyCostBefore: previousMonthly,
      monthlyCostAfter: currentMonthly,
      monthlySaving,
      annualSaving: monthlySaving * 12,
      roiPercentage: (monthlySaving / currentMonthly) * 100,
      capacityIncrease: `${capacityIncrease.toFixed(0)}%`,
      breakdownAfter: {
        aiApiCost,
        humanAgentCost: newHumanCost,
        infrastructure: after.monthly.infrastructureCost,
        maintenance: after.monthly.maintenanceCost,
      },
      paybackPeriodMonths: this.calculatePaybackPeriod(currentMonthly, monthlySaving),
    };
  }

  private calculatePaybackPeriod(initialInvestment: number, monthlySaving: number): number {
    if (monthlySaving <= 0) return Infinity;
    // 假设初始建设成本约为 3 个月运营成本
    const buildCost = initialInvestment * 3;
    return Math.ceil(buildCost / monthlySaving);
  }
}
```

## 24.14 运营指标监控系统

### 24.14.1 实时监控仪表盘

```typescript
interface DashboardMetrics {
  realtime: {
    activeSessions: number;
    queueLength: number;
    averageWaitTime: number;     // 秒
    aiResolutionRate: number;    // 实时自动解决率
    sentimentDistribution: Record<string, number>;
    escalationRate: number;
  };
  daily: {
    totalSessions: number;
    resolvedSessions: number;
    csatScore: number;           // 客户满意度 (1-5)
    firstContactResolution: number;  // 首次解决率
    averageHandleTime: number;   // 秒
    peakHour: number;            // 峰值小时
    topIntents: { intent: string; count: number }[];
    topEscalationReasons: { reason: string; count: number }[];
  };
  weekly: {
    trend: {
      sessions: number[];
      csat: number[];
      resolutionRate: number[];
      escalationRate: number[];
    };
    knowledgeGaps: {            // 知识库未覆盖的问题
      question: string;
      frequency: number;
      suggestedAnswer: string;
    }[];
  };
}

class MetricsCollector {
  private counters: Map<string, number> = new Map();
  private timeSeries: Map<string, { timestamp: number; value: number }[]> = new Map();

  recordSession(session: CompletedSession): void {
    this.increment('total_sessions');
    
    if (session.resolvedByAI) {
      this.increment('ai_resolved_sessions');
    }
    
    if (session.escalated) {
      this.increment('escalated_sessions');
    }

    if (session.csatScore) {
      this.addTimeSeries('csat_score', session.csatScore);
    }

    this.addTimeSeries('handle_time', session.duration);

    // 记录意图分布
    if (session.intent) {
      this.increment(`intent_${session.intent}`);
    }
  }

  getDashboard(): DashboardMetrics {
    const totalSessions = this.getCount('total_sessions');
    const aiResolved = this.getCount('ai_resolved_sessions');
    const escalated = this.getCount('escalated_sessions');

    return {
      realtime: {
        activeSessions: this.getCount('active_sessions'),
        queueLength: this.getCount('queue_length'),
        averageWaitTime: this.getAverage('wait_time'),
        aiResolutionRate: totalSessions > 0 ? aiResolved / totalSessions : 0,
        sentimentDistribution: {
          positive: this.getCount('sentiment_positive'),
          neutral: this.getCount('sentiment_neutral'),
          negative: this.getCount('sentiment_negative'),
        },
        escalationRate: totalSessions > 0 ? escalated / totalSessions : 0,
      },
      daily: {
        totalSessions,
        resolvedSessions: aiResolved,
        csatScore: this.getAverage('csat_score'),
        firstContactResolution: this.getCount('first_contact_resolution') / Math.max(totalSessions, 1),
        averageHandleTime: this.getAverage('handle_time'),
        peakHour: this.calculatePeakHour(),
        topIntents: this.getTopIntents(10),
        topEscalationReasons: this.getTopEscalationReasons(5),
      },
      weekly: {
        trend: {
          sessions: this.getWeeklyTrend('total_sessions'),
          csat: this.getWeeklyTrend('csat_score'),
          resolutionRate: this.getWeeklyTrend('resolution_rate'),
          escalationRate: this.getWeeklyTrend('escalation_rate'),
        },
        knowledgeGaps: [],
      },
    };
  }

  private increment(key: string): void {
    this.counters.set(key, (this.counters.get(key) || 0) + 1);
  }

  private getCount(key: string): number {
    return this.counters.get(key) || 0;
  }

  private addTimeSeries(key: string, value: number): void {
    const series = this.timeSeries.get(key) || [];
    series.push({ timestamp: Date.now(), value });
    this.timeSeries.set(key, series);
  }

  private getAverage(key: string): number {
    const series = this.timeSeries.get(key) || [];
    if (series.length === 0) return 0;
    return series.reduce((sum, s) => sum + s.value, 0) / series.length;
  }

  private calculatePeakHour(): number {
    // 简化实现
    return 14; // 下午 2 点
  }

  private getTopIntents(limit: number): { intent: string; count: number }[] {
    const intents: { intent: string; count: number }[] = [];
    for (const [key, count] of this.counters) {
      if (key.startsWith('intent_')) {
        intents.push({ intent: key.replace('intent_', ''), count });
      }
    }
    return intents.sort((a, b) => b.count - a.count).slice(0, limit);
  }

  private getTopEscalationReasons(limit: number): { reason: string; count: number }[] {
    return []; // 简化实现
  }

  private getWeeklyTrend(key: string): number[] {
    return [0, 0, 0, 0, 0, 0, 0]; // 简化实现
  }
}
```

## 24.15 完整系统集成

### 24.15.1 企业客服 Agent 主流程

```typescript
class EnterpriseCustomerServiceAgent {
  private conversationManager: ConversationManager;
  private knowledgeBase: EnterpriseKnowledgeBase;
  private answerGenerator: AnswerGenerator;
  private sentimentAnalyzer: SentimentAnalyzer;
  private escalationManager: EscalationManager;
  private ticketManager: TicketManager;
  private qualityGuard: QualityGuard;
  private piiDetector: PIIDetector;
  private auditLogger: AuditLogger;
  private metricsCollector: MetricsCollector;

  async handleMessage(
    channel: string,
    message: StandardMessage,
    session: CustomerSession
  ): Promise<AgentResponse> {
    // 1. PII 检测与脱敏（日志中脱敏，处理中保留原文）
    const piiResult = this.piiDetector.detect(message.text);
    const sanitizedForLog = piiResult.hasPII
      ? this.piiDetector.sanitize(message.text)
      : message.text;

    this.auditLogger.log({
      sessionId: session.id,
      customerId: session.customerId,
      agentId: 'ai-agent',
      event: 'message_received',
      details: { message: sanitizedForLog, channel },
      riskLevel: piiResult.hasPII ? 'medium' : 'low',
    });

    // 2. 情感分析
    const sentiment = await this.sentimentAnalyzer.analyze(
      message.text, session.context
    );

    // 3. 对话状态管理
    const stateResult = await this.conversationManager.processMessage(
      session.context, message.text
    );

    // 4. 检查是否需要升级
    const answerResult = await this.answerGenerator.generateAnswer(
      message.text, session.context.history, session.customerContext
    );

    const escalation = await this.escalationManager.evaluate(
      session.context, sentiment, answerResult
    );

    if (escalation.shouldEscalate) {
      this.auditLogger.log({
        sessionId: session.id,
        customerId: session.customerId,
        agentId: 'ai-agent',
        event: 'human_escalated',
        details: { reason: escalation.reason, priority: escalation.priority },
        riskLevel: 'high',
      });

      // 创建工单
      const ticket = await this.ticketManager.createFromConversation(session);

      return {
        content: this.generateEscalationMessage(escalation, sentiment),
        actions: [{
          type: 'transfer_to_human',
          priority: escalation.priority,
          targetTeam: escalation.targetTeam,
          contextSummary: escalation.contextSummary,
          ticketId: ticket.id,
        }],
      };
    }

    // 5. 质量守卫
    const qualityResult = await this.qualityGuard.validate(
      { content: answerResult.answer } as any, session
    );

    let finalAnswer = answerResult.answer;
    if (!qualityResult.passed) {
      finalAnswer = qualityResult.suggestion || '抱歉，让我重新确认一下相关信息。';
    }

    // 6. 输出 PII 脱敏
    finalAnswer = this.piiDetector.sanitize(finalAnswer);

    // 7. 记录审计日志
    this.auditLogger.log({
      sessionId: session.id,
      customerId: session.customerId,
      agentId: 'ai-agent',
      event: 'response_generated',
      details: {
        confidence: answerResult.confidence,
        citations: answerResult.citations,
        qualityPassed: qualityResult.passed,
      },
      riskLevel: answerResult.confidence < 0.5 ? 'medium' : 'low',
    });

    // 8. 记录指标
    this.metricsCollector.recordSession({
      ...session,
      sentiment: sentiment.emotion,
      confidence: answerResult.confidence,
    } as any);

    return {
      content: finalAnswer,
      citations: answerResult.citations,
      suggestedReplies: this.generateQuickReplies(session.context),
    };
  }

  private generateEscalationMessage(
    escalation: EscalationDecision,
    sentiment: SentimentSignal
  ): string {
    if (sentiment.emotion === 'angry' || sentiment.emotion === 'frustrated') {
      return '非常抱歉给您带来了不好的体验，我完全理解您的感受。我正在为您转接资深客服专员，他们将优先为您处理这个问题。请您稍候片刻。';
    }
    return '为了更好地帮助您解决问题，我正在为您转接专业客服人员。请您稍候，专员将很快与您联系。';
  }

  private generateQuickReplies(ctx: ConversationContext): string[] {
    const replies: string[] = [];
    
    if (ctx.state === 'solution_providing') {
      replies.push('已经解决了，谢谢');
      replies.push('还没有解决，需要其他帮助');
      replies.push('转人工客服');
    } else if (ctx.state === 'information_gathering') {
      replies.push('我查一下再告诉你');
      replies.push('不记得了');
    } else {
      replies.push('查询订单');
      replies.push('退款问题');
      replies.push('转人工');
    }

    return replies;
  }
}
```

## 24.16 小结

企业客服 Agent 是 AI Agent 技术在商业场景中最成熟的应用之一。本章从架构到实现、从技术到运营，完整呈现了一个生产级客服系统的设计要点：

1. **知识库是基石**——RAG 架构确保回答有据可查。混合检索（向量 + 关键词 + 结构化）、引用标注、过期内容过滤、权限控制，每一层都是防止幻觉的屏障

2. **多轮对话管理是核心**——状态机驱动的对话管理、槽位填充、话题切换检测、上下文压缩，确保长对话中信息不丢失

3. **情感分析驱动服务质量**——实时情感监测不仅用于升级决策，更用于调整回答语气和风格。趋势分析比单点分析更有价值

4. **智能升级是安全网**——多规则并行评估确保关键场景不被遗漏。升级不是失败，而是系统设计的重要组成部分。高质量的交接摘要让人工客服能够无缝接手

5. **全渠道适配是标配**——同一个 Agent 核心通过适配器模式服务于 Web、微信、电话、邮件等多个渠道，每个渠道有其特定的能力约束和格式要求

6. **合规审计贯穿始终**——PII 脱敏、审计日志、合规报告不是事后补充，而是架构的一部分。特别是金融和医疗行业，合规是上线的前提

7. **成本可控是前提**——AI 客服的核心价值在于大幅降低边际成本。清晰的 ROI 模型帮助团队做出正确的投资决策

8. **数据驱动持续改进**——通过指标监控发现知识库盲区、优化意图分类、调整升级阈值，形成持续改进的飞轮

> **设计决策：渐进式 AI 接管**
>
> 部署企业客服 Agent 时，建议采用渐进式策略而非一次性全量替换：
>
> - **第一阶段（月 1-2）**：AI 仅处理 FAQ 类简单问题（约占总量 30-40%），所有非确定性回答转人工
> - **第二阶段（月 3-4）**：AI 扩展到订单查询、状态跟踪等需要工具调用的场景（约占总量 50-60%）
> - **第三阶段（月 5-6）**：AI 处理投诉初筛、退款审核等复杂场景（约占总量 70-80%）
> - **第四阶段（持续）**：基于数据分析持续优化，AI 自动识别新的可自动化场景
>
> 每个阶段都应有明确的质量指标（CSAT > 4.2、幻觉率 < 1%、升级准确率 > 95%）作为晋级条件。这与第 14 章信任架构中讨论的渐进信任模型一脉相承。

### 24.16.1 生产部署清单

```markdown
## 企业客服 Agent 上线清单

### 知识库
- [ ] FAQ 知识库已导入并经过人工审核
- [ ] 产品文档已分块索引并设置更新频率
- [ ] 业务政策文档已标注有效期和适用范围
- [ ] 知识库 A/B 检索测试通过（准确率 > 90%）

### 对话管理
- [ ] 核心意图分类器测试通过（准确率 > 85%）
- [ ] 槽位填充完整性测试通过
- [ ] 多轮对话回归测试通过（50+ 场景）
- [ ] 话题切换检测测试通过

### 安全合规
- [ ] PII 检测覆盖所有敏感字段
- [ ] 审计日志存储已配置（保留期限 >= 法规要求）
- [ ] 输出过滤规则已配置（禁止承诺、PII 脱敏）
- [ ] 数据访问权限已按客户等级配置

### 升级机制
- [ ] 人工客服接口已联调
- [ ] 升级规则已配置并经过压力测试
- [ ] 交接摘要生成质量已验证
- [ ] 人工客服已完成 AI 协作培训

### 监控运营
- [ ] 实时监控仪表盘已部署
- [ ] 告警规则已配置（升级率突增、CSAT 下降等）
- [ ] 每日质量审核流程已建立
- [ ] 知识库缺口分析管线已就位

### 渠道集成
- [ ] 各渠道适配器已联调
- [ ] 渠道特定限制已处理（字数限制、格式限制）
- [ ] 跨渠道会话连续性已测试
- [ ] 高并发压力测试通过
```

企业客服 Agent 的核心价值不仅在于降低成本，更在于**标准化和一致性**——AI 不会因为情绪波动、知识盲区或疲劳而提供不一致的服务。当然，这种一致性必须建立在准确的知识库、可靠的质量守卫和完善的升级机制之上。正如本书反复强调的：**确定性外壳包裹概率性内核**——在客服场景中，这个外壳就是知识库验证、PII 脱敏、合规过滤和升级规则；内核则是 LLM 的自然语言理解和生成能力。
