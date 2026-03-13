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
