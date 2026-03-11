# 第6章 工具系统设计 — Agent 的手和脚

> **"An agent without tools is just a chatbot with ambitions."**
> — Andrej Karpathy

大语言模型（LLM）本身是一个"纯思维"的存在——它能推理、规划、生成文本，但无法直接与外部世界交互。工具系统（Tool System）赋予了 Agent "手和脚"，让它能够读取数据库、调用 API、操作文件系统、执行代码，乃至控制物理设备。

本章将从设计哲学出发，系统性地讲解如何构建一个**安全、可扩展、可测试**的工具系统。我们将覆盖以下核心主题：

- **ACI 设计哲学**：如何让 LLM "读懂"工具定义，减少 token 浪费
- **三段式工具描述**：标准化的工具描述框架
- **Poka-Yoke 防错设计**：从权限、速率、成本多维度保护工具执行
- **MCP 深度集成**：与 Model Context Protocol 的完整对接
- **工具编排**：依赖解析、熔断、缓存、重试的完整编排方案
- **工具测试与质量保证**：Mock、Schema 快照测试、性能基准
- **实战：DevOps 工具生态系统**：完整的部署工作流示例

---

## 6.1 ACI 设计哲学

### 6.1.1 什么是 ACI？

ACI（Agent-Computer Interface）是 Agent 与外部工具交互的界面设计范式。正如优秀的 GUI 设计让人类用户能直觉地操作计算机，优秀的 ACI 设计让 LLM 能准确地理解和调用工具。

ACI 设计的三大原则：

1. **命名即文档**（Naming as Documentation）：工具名和参数名本身就应传达足够信息
2. **最小认知负荷**（Minimal Cognitive Load）：LLM 无需复杂推理即可正确使用工具
3. **防错优于纠错**（Prevention over Correction）：通过设计消除误用可能性

### 6.1.2 命名规范与验证

工具命名是 ACI 的第一道关卡。一个好的工具名应当是**自描述的**——LLM 看到名字就知道这个工具做什么。

```typescript
/**
 * 工具命名验证器
 * 强制执行 <领域>_<动词>_<宾语> 的命名规范
 * 例如：github_create_issue, k8s_scale_deployment
 */
class ToolNameValidator {
  // 允许的动词白名单——限制动词集合可降低 LLM 歧义
  private static readonly ALLOWED_VERBS: ReadonlySet<string> = new Set([
    // 读取类
    'get', 'list', 'search', 'query', 'count', 'check', 'validate',
    // 写入类
    'create', 'update', 'set', 'add', 'remove', 'delete',
    // 执行类
    'run', 'execute', 'trigger', 'start', 'stop', 'restart',
    // 转换类
    'convert', 'format', 'parse', 'encode', 'decode',
    // 传输类
    'send', 'upload', 'download', 'sync', 'push', 'pull',
  ]);

  // 命名格式：<namespace>_<verb>_<object>，全小写，下划线分隔
  private static readonly NAME_PATTERN = /^[a-z][a-z0-9]*(_[a-z][a-z0-9]*){2,4}$/;

  /**
   * 验证工具名是否合规
   * @returns 验证结果，包含错误信息和修正建议
   */
  static validate(name: string): ValidationResult {
    const errors: string[] = [];
    const suggestions: string[] = [];

    // 规则 1：格式检查
    if (!this.NAME_PATTERN.test(name)) {
      errors.push(`命名格式不合规: "${name}"，要求 <namespace>_<verb>_<object>`);
      suggestions.push(this.suggestFixedName(name));
    }

    // 规则 2：动词检查
    const parts = name.split('_');
    if (parts.length >= 2) {
      const verb = parts[1];
      if (!this.ALLOWED_VERBS.has(verb)) {
        errors.push(`动词 "${verb}" 不在白名单中`);
        suggestions.push(`建议使用: ${this.findClosestVerb(verb)}`);
      }
    }

    // 规则 3：长度检查（过长的名字浪费 token）
    if (name.length > 40) {
      errors.push(`工具名过长 (${name.length} 字符)，建议不超过 40 字符`);
    }

    // 规则 4：禁止缩写歧义
    const ambiguousAbbrevs = this.detectAmbiguousAbbreviations(name);
    if (ambiguousAbbrevs.length > 0) {
      errors.push(`存在歧义缩写: ${ambiguousAbbrevs.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      suggestions,
      tokenCost: this.estimateTokenCost(name),
    };
  }

  /** 估算工具名的 token 开销 */
  private static estimateTokenCost(name: string): number {
    // 下划线分隔的命名通常每个词段 1 token
    return name.split('_').length;
  }

  /** 查找最接近的合法动词 */
  private static findClosestVerb(verb: string): string {
    let bestMatch = '';
    let bestDistance = Infinity;
    for (const allowed of this.ALLOWED_VERBS) {
      const distance = this.levenshtein(verb, allowed);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = allowed;
      }
    }
    return bestMatch;
  }

  /** 尝试修正不合规的名字 */
  private static suggestFixedName(name: string): string {
    const cleaned = name
      .replace(/([A-Z])/g, '_$1')  // camelCase → snake_case
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_') // 非法字符替换
      .replace(/_+/g, '_')         // 合并连续下划线
      .replace(/^_|_$/g, '');      // 去掉首尾下划线
    return cleaned;
  }

  /** 检测可能引起歧义的缩写 */
  private static detectAmbiguousAbbreviations(name: string): string[] {
    const ambiguous: Record<string, string[]> = {
      'del': ['delete', 'deliver', 'delegate'],
      'rm': ['remove', 'remote'],
      'cfg': ['config', 'configure'],
      'msg': ['message', 'messaging'],
    };
    const parts = name.split('_');
    return parts.filter(p => p in ambiguous);
  }

  /** Levenshtein 编辑距离 */
  private static levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  suggestions: string[];
  tokenCost: number;
}
```

### 6.1.3 Tool Context Cost 分析

每一个注册到 Agent 的工具，其定义（名称 + 描述 + 参数 Schema）都会被注入到 system prompt 中，消耗宝贵的 context window。当工具数量增长到 50+ 时，仅工具定义就可能占据数千 token，严重挤压用户消息和推理空间。

```typescript
/**
 * 工具 Token 成本分析器
 * 精确计算每个工具定义在 context window 中的 token 开销
 */
class ToolContextCostAnalyzer {
  // 近似 token 计算：英文约 4 字符/token，中文约 1.5 字符/token
  private static readonly CHARS_PER_TOKEN_EN = 4;
  private static readonly CHARS_PER_TOKEN_ZH = 1.5;

  /** 分析单个工具的 token 开销 */
  static analyzeToolCost(tool: ToolDefinition): ToolCostReport {
    const nameCost = this.estimateTokens(tool.name);
    const descCost = this.estimateTokens(tool.description);
    const paramsCost = this.estimateSchemaTokens(tool.parameters);
    const returnCost = tool.returnSchema
      ? this.estimateSchemaTokens(tool.returnSchema)
      : 0;

    // JSON Schema 序列化的额外结构开销（大括号、关键字等）
    const structuralOverhead = Math.ceil((paramsCost + returnCost) * 0.15);

    const totalCost = nameCost + descCost + paramsCost + returnCost + structuralOverhead;

    return {
      toolName: tool.name,
      breakdown: { nameCost, descCost, paramsCost, returnCost, structuralOverhead },
      totalTokens: totalCost,
      optimizationSuggestions: this.generateSuggestions(tool, {
        nameCost, descCost, paramsCost, returnCost, structuralOverhead,
      }),
    };
  }

  /** 分析整个工具集的 token 开销 */
  static analyzeToolSetCost(tools: ToolDefinition[]): ToolSetCostReport {
    const reports = tools.map(t => this.analyzeToolCost(t));
    const totalTokens = reports.reduce((sum, r) => sum + r.totalTokens, 0);

    // 按开销降序排列，找出"胖工具"
    const sorted = [...reports].sort((a, b) => b.totalTokens - a.totalTokens);

    return {
      totalTokens,
      toolCount: tools.length,
      averageTokensPerTool: Math.round(totalTokens / tools.length),
      costBreakdown: reports,
      topCostlyTools: sorted.slice(0, 5),
      contextBudgetUsage: {
        gpt4: totalTokens / 128_000,        // GPT-4 Turbo: 128K
        claude3: totalTokens / 200_000,      // Claude 3: 200K
        recommendation: totalTokens > 4000
          ? '建议启用动态工具加载，仅注入当前任务相关的工具'
          : '工具集大小合理',
      },
    };
  }

  /** 生成优化建议 */
  private static generateSuggestions(
    tool: ToolDefinition,
    costs: Record<string, number>,
  ): string[] {
    const suggestions: string[] = [];

    if (costs.descCost > 50) {
      suggestions.push('描述过长，建议精简至 100 字以内，将详细说明移至参数级别');
    }
    if (costs.paramsCost > 80) {
      suggestions.push('参数 Schema 过于复杂，考虑拆分为多个简单工具');
    }
    if (tool.parameters.properties) {
      const paramCount = Object.keys(tool.parameters.properties).length;
      if (paramCount > 5) {
        suggestions.push(`参数过多 (${paramCount} 个)，LLM 可能遗漏必填项`);
      }
    }
    return suggestions;
  }

  /** 估算文本的 token 数 */
  private static estimateTokens(text: string): number {
    let enChars = 0, zhChars = 0;
    for (const ch of text) {
      if (/[\u4e00-\u9fff]/.test(ch)) zhChars++;
      else enChars++;
    }
    return Math.ceil(
      enChars / this.CHARS_PER_TOKEN_EN + zhChars / this.CHARS_PER_TOKEN_ZH
    );
  }

  /** 估算 JSON Schema 的 token 数 */
  private static estimateSchemaTokens(schema: Record<string, unknown>): number {
    const serialized = JSON.stringify(schema);
    return this.estimateTokens(serialized);
  }
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
  returnSchema?: Record<string, unknown>;
}

interface ToolCostReport {
  toolName: string;
  breakdown: Record<string, number>;
  totalTokens: number;
  optimizationSuggestions: string[];
}

interface ToolSetCostReport {
  totalTokens: number;
  toolCount: number;
  averageTokensPerTool: number;
  costBreakdown: ToolCostReport[];
  topCostlyTools: ToolCostReport[];
  contextBudgetUsage: Record<string, number | string>;
}
```

### 6.1.4 自动描述生成器

手动撰写工具描述既耗时又容易不一致。`AutoDescriptionGenerator` 利用 LLM 从代码签名自动生成最优描述。

```typescript
/**
 * 自动工具描述生成器
 * 从 TypeScript 函数签名和 JSDoc 自动生成 LLM-friendly 的工具描述
 */
class AutoDescriptionGenerator {
  constructor(private readonly llmClient: LLMClient) {}

  /**
   * 从函数元信息生成工具描述
   * 使用 few-shot prompting 确保输出格式一致
   */
  async generateDescription(meta: FunctionMeta): Promise<GeneratedDescription> {
    const prompt = `你是一个 AI Agent 工具描述专家。请根据以下函数签名生成规范的工具描述。

要求：
1. 第一行：一句话说明功能（不超过 15 个词）
2. 第二段：关键行为说明（何时用、何时不用）
3. 第三段：返回值说明

示例输入：
函数名: searchUsers
参数: { query: string, limit?: number, includeInactive?: boolean }
JSDoc: 在用户数据库中搜索匹配的用户记录

示例输出：
在用户数据库中按关键词搜索用户。

使用场景：当需要查找特定用户信息时调用。支持模糊匹配用户名和邮箱。
不要用于：获取单个已知 ID 的用户（请用 get_user）。
注意：返回结果上限由 limit 控制，默认 10 条。

返回 UserSearchResult 对象，包含匹配用户列表和总数。

---

现在请为以下函数生成描述：
函数名: ${meta.name}
参数: ${JSON.stringify(meta.parameters)}
JSDoc: ${meta.jsdoc || '无'}
函数体摘要: ${meta.bodySummary || '无'}`;

    const response = await this.llmClient.complete({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3, // 低温度确保稳定输出
      maxTokens: 300,
    });

    const description = response.content.trim();

    // 验证生成的描述质量
    const quality = this.assessQuality(description, meta);

    return {
      description,
      quality,
      tokenCost: Math.ceil(description.length / 4),
    };
  }

  /**
   * 批量生成并优化工具描述集合
   * 确保同一工具集内的描述风格一致、无歧义
   */
  async generateConsistentDescriptions(
    tools: FunctionMeta[],
  ): Promise<Map<string, GeneratedDescription>> {
    // 第一轮：独立生成每个工具的描述
    const firstPass = new Map<string, GeneratedDescription>();
    for (const tool of tools) {
      const desc = await this.generateDescription(tool);
      firstPass.set(tool.name, desc);
    }

    // 第二轮：交叉检查，消除歧义和重叠
    const allDescriptions = Array.from(firstPass.entries())
      .map(([name, d]) => `${name}: ${d.description}`)
      .join('\n---\n');

    const dedupePrompt = `以下是同一 Agent 的工具描述集合。请检查是否存在：
1. 功能描述重叠或模糊不清的工具对
2. 使用场景没有明确边界的工具
3. 命名和描述不一致的情况

工具集：
${allDescriptions}

请列出需要修改的工具名及修改建议（JSON 格式）。如果都没有问题返回空数组 []。`;

    const review = await this.llmClient.complete({
      messages: [{ role: 'user', content: dedupePrompt }],
      temperature: 0.2,
    });

    // 解析审查结果并应用修正
    try {
      const fixes = JSON.parse(review.content) as Array<{
        toolName: string;
        suggestion: string;
      }>;
      for (const fix of fixes) {
        const existing = firstPass.get(fix.toolName);
        if (existing) {
          existing.quality.warnings.push(`审查建议: ${fix.suggestion}`);
        }
      }
    } catch {
      // 解析失败不影响主流程
    }

    return firstPass;
  }

  /** 评估描述质量 */
  private assessQuality(description: string, meta: FunctionMeta): DescriptionQuality {
    const warnings: string[] = [];
    let score = 100;

    // 检查长度
    if (description.length < 20) {
      warnings.push('描述过短，可能信息不足');
      score -= 20;
    }
    if (description.length > 500) {
      warnings.push('描述过长，浪费 token');
      score -= 10;
    }

    // 检查是否包含参数说明
    const paramNames = Object.keys(meta.parameters || {});
    const mentionedParams = paramNames.filter(p => description.includes(p));
    if (mentionedParams.length < paramNames.length * 0.5) {
      warnings.push('描述中未提及半数以上参数');
      score -= 15;
    }

    // 检查是否有使用场景说明
    if (!description.includes('使用') && !description.includes('调用') && !description.includes('when')) {
      warnings.push('缺少使用场景说明');
      score -= 10;
    }

    return { score: Math.max(0, score), warnings };
  }
}

interface FunctionMeta {
  name: string;
  parameters: Record<string, unknown>;
  jsdoc?: string;
  bodySummary?: string;
}

interface GeneratedDescription {
  description: string;
  quality: DescriptionQuality;
  tokenCost: number;
}

interface DescriptionQuality {
  score: number;       // 0-100
  warnings: string[];
}

interface LLMClient {
  complete(request: {
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ content: string }>;
}
```

### 6.1.5 工具复杂度分级

不同复杂度的工具需要不同的设计策略。我们将工具分为三个层级：

| 层级 | 类型 | 特征 | 示例 |
|------|------|------|------|
| L1 | Simple（简单工具） | 单次 API 调用，无状态 | `weather_get_current` |
| L2 | Compound（复合工具） | 多步骤，有内部状态 | `git_create_pull_request` |
| L3 | Composite（组合工具） | 编排其他工具 | `deploy_full_stack` |

```typescript
/**
 * 工具复杂度评分系统
 * 帮助开发者理解工具的复杂程度，指导设计决策
 */
enum ToolComplexityLevel {
  Simple = 'L1_SIMPLE',       // 单次调用，无副作用或可控副作用
  Compound = 'L2_COMPOUND',   // 多步骤，有条件逻辑
  Composite = 'L3_COMPOSITE', // 编排多个子工具
}

interface ComplexityScore {
  level: ToolComplexityLevel;
  score: number;                    // 0-100
  factors: ComplexityFactor[];
  designGuidelines: string[];       // 针对该复杂度的设计建议
}

interface ComplexityFactor {
  factor: string;
  weight: number;
  value: number;
  explanation: string;
}

class ToolComplexityScorer {
  /**
   * 评估工具复杂度
   * 综合考虑参数数量、副作用、依赖关系等因素
   */
  static score(analysis: ToolAnalysis): ComplexityScore {
    const factors: ComplexityFactor[] = [
      {
        factor: '参数数量',
        weight: 0.15,
        value: Math.min(analysis.paramCount / 10, 1),
        explanation: `${analysis.paramCount} 个参数`,
      },
      {
        factor: '副作用等级',
        weight: 0.25,
        value: analysis.sideEffectLevel / 3,  // 0=无, 1=读, 2=写, 3=破坏性
        explanation: ['无', '只读', '可写', '破坏性'][analysis.sideEffectLevel],
      },
      {
        factor: '外部依赖数',
        weight: 0.2,
        value: Math.min(analysis.externalDependencies / 5, 1),
        explanation: `依赖 ${analysis.externalDependencies} 个外部服务`,
      },
      {
        factor: '错误路径数',
        weight: 0.15,
        value: Math.min(analysis.errorPathCount / 8, 1),
        explanation: `${analysis.errorPathCount} 种可能的错误路径`,
      },
      {
        factor: '执行时间预期',
        weight: 0.15,
        value: Math.min(analysis.expectedDurationMs / 30_000, 1),
        explanation: `预期执行时间 ${analysis.expectedDurationMs}ms`,
      },
      {
        factor: '子工具调用数',
        weight: 0.1,
        value: Math.min(analysis.subToolCount / 5, 1),
        explanation: `编排 ${analysis.subToolCount} 个子工具`,
      },
    ];

    const score = factors.reduce((sum, f) => sum + f.weight * f.value, 0) * 100;

    const level = score < 25
      ? ToolComplexityLevel.Simple
      : score < 60
        ? ToolComplexityLevel.Compound
        : ToolComplexityLevel.Composite;

    return {
      level,
      score: Math.round(score),
      factors,
      designGuidelines: this.getGuidelines(level),
    };
  }

  /** 根据复杂度级别给出设计建议 */
  private static getGuidelines(level: ToolComplexityLevel): string[] {
    switch (level) {
      case ToolComplexityLevel.Simple:
        return [
          '可直接实现，无需额外抽象层',
          '建议同步执行，超时设置 5-10 秒',
          '错误信息直接返回即可',
        ];
      case ToolComplexityLevel.Compound:
        return [
          '建议引入 retry 机制和中间状态日志',
          '考虑添加 dry-run 模式供 LLM 预检',
          '拆分为 check + execute 两步操作可降低风险',
          '超时设置 30-60 秒，配合 progress callback',
        ];
      case ToolComplexityLevel.Composite:
        return [
          '必须使用 DAG 编排，明确子工具依赖关系',
          '实现 rollback 机制，任一步骤失败可回滚',
          '添加 circuit breaker 保护下游服务',
          '必须有完整的 audit trail 记录',
          '建议提供 plan 预览，让用户/LLM 确认后再执行',
        ];
    }
  }
}

interface ToolAnalysis {
  paramCount: number;
  sideEffectLevel: number;       // 0=无 1=读 2=写 3=破坏
  externalDependencies: number;
  errorPathCount: number;
  expectedDurationMs: number;
  subToolCount: number;
}
```

---

## 6.2 三段式工具描述

### 6.2.1 描述框架

优质的工具描述是 Agent 正确使用工具的基础。我们提出**三段式描述框架**：

```
第一段（WHAT）：一句话说明工具功能
第二段（WHEN）：使用场景、限制条件、与相似工具的区别
第三段（RETURNS）：返回值说明和可能的错误
```

这个框架源自一个关键洞察：**LLM 选择工具时的推理路径是 "我需要做什么 -> 哪个工具能做 -> 它会返回什么"**。三段式描述精确匹配了这个推理路径。

### 6.2.2 不同类型工具的描述示例

**只读工具（Read-only）**

```typescript
const searchDocsTool: ToolDefinition = {
  name: 'knowledge_search_docs',
  description: `在知识库中搜索与查询相关的文档片段。

使用场景：当用户提问涉及公司内部知识、产品文档、技术规范时调用。
支持语义搜索，无需精确关键词。每次最多返回 10 条结果。
不要用于：搜索用户个人数据（用 user_search_data）或实时新闻（用 web_search）。

返回 SearchResult 数组，每条包含 content（文档片段）、score（相关度 0-1）、
source（来源文档标题和链接）。无匹配结果时返回空数组。`,
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索查询文本，建议使用自然语言而非关键词',
      },
      filters: {
        type: 'object',
        description: '可选过滤条件',
        properties: {
          category: {
            type: 'string',
            enum: ['product', 'engineering', 'hr', 'finance'],
            description: '文档类别，不确定时不要设置此项',
          },
          dateAfter: {
            type: 'string',
            description: '仅返回此日期之后的文档，格式 YYYY-MM-DD',
          },
        },
      },
      limit: {
        type: 'number',
        description: '返回结果上限，默认 5，最大 10',
        default: 5,
      },
    },
    required: ['query'],
  },
};
```

**写入工具（Write）**

```typescript
const createIssueTool: ToolDefinition = {
  name: 'github_create_issue',
  description: `在 GitHub 仓库中创建新的 Issue。

使用场景：当用户要求报告 bug、提出需求或创建任务时调用。
调用前必须确认：仓库名（owner/repo 格式）、标题和正文内容。
如果用户未指定 labels 和 assignees，可以不填。
注意：创建后不可撤销，请在调用前确认用户意图。

返回新创建的 Issue 对象，包含 issueNumber（编号）、htmlUrl（链接）。
如果仓库不存在或无权限，返回 error 字段说明原因。`,
  parameters: {
    type: 'object',
    properties: {
      repo: {
        type: 'string',
        description: '仓库全名，格式: owner/repo（如 "facebook/react"）',
      },
      title: {
        type: 'string',
        description: 'Issue 标题，简洁明确，不超过 100 字符',
      },
      body: {
        type: 'string',
        description: 'Issue 正文，支持 Markdown 格式',
      },
      labels: {
        type: 'array',
        items: { type: 'string' },
        description: '标签列表（如 ["bug", "priority:high"]），可选',
      },
      assignees: {
        type: 'array',
        items: { type: 'string' },
        description: '指派人的 GitHub 用户名列表，可选',
      },
    },
    required: ['repo', 'title', 'body'],
  },
};
```

**破坏性工具（Destructive）**

```typescript
const deleteDatabaseTool: ToolDefinition = {
  name: 'db_delete_records',
  description: `【危险操作】从数据库中永久删除匹配条件的记录。

使用场景：仅在用户明确要求删除数据时调用。
必须先调用 db_query_records 确认将要删除的记录数量和内容。
如果匹配记录超过 100 条，将拒绝执行并要求用户缩小范围。
此操作不可逆。调用前必须向用户确认。

返回 DeleteResult，包含 deletedCount（实际删除数量）。
如果条件不安全（如空 where 子句），返回 error: "UNSAFE_DELETE"。`,
  parameters: {
    type: 'object',
    properties: {
      table: {
        type: 'string',
        description: '表名',
      },
      where: {
        type: 'object',
        description: '删除条件，不可为空对象。格式: { column: value }',
      },
      dryRun: {
        type: 'boolean',
        description: '设为 true 时仅返回将要删除的记录数，不实际执行。建议先用 dryRun 确认。',
        default: false,
      },
    },
    required: ['table', 'where'],
  },
};
```

**长时间运行工具（Long-running）**

```typescript
const deployServiceTool: ToolDefinition = {
  name: 'k8s_deploy_service',
  description: `部署或更新 Kubernetes 服务，这是一个长时间运行的操作（通常 2-10 分钟）。

使用场景：当用户要求部署新版本或更新服务配置时调用。
调用后返回 deploymentId，可通过 k8s_get_deployment_status 轮询进度。
不要等待部署完成后才回复用户——先告知 deploymentId，然后按需轮询。

返回 DeploymentInitResult，包含 deploymentId（部署 ID）、estimatedDuration（预计耗时）。
常见错误: IMAGE_NOT_FOUND（镜像不存在）、QUOTA_EXCEEDED（资源配额不足）。`,
  parameters: {
    type: 'object',
    properties: {
      service: {
        type: 'string',
        description: '服务名称',
      },
      image: {
        type: 'string',
        description: '容器镜像地址，含 tag（如 "myapp:v2.1.0"）',
      },
      replicas: {
        type: 'number',
        description: '副本数量，默认维持当前值不变',
      },
      environment: {
        type: 'string',
        enum: ['staging', 'production'],
        description: '目标环境。生产环境部署需要额外确认',
      },
    },
    required: ['service', 'image', 'environment'],
  },
};
```

### 6.2.3 参数描述最佳实践

参数描述的质量直接影响 LLM 填参的准确率。以下是关键原则：

```typescript
/**
 * 参数描述质量检查器
 * 确保每个参数的描述满足 LLM-friendly 标准
 */
class ParameterDescriptionChecker {
  /** 检查参数描述质量 */
  static check(
    toolName: string,
    params: Record<string, ParameterSchema>,
  ): ParameterCheckResult[] {
    const results: ParameterCheckResult[] = [];

    for (const [name, schema] of Object.entries(params)) {
      const issues: string[] = [];

      // 规则 1：必须有描述
      if (!schema.description) {
        issues.push('缺少 description 字段');
      }

      // 规则 2：枚举类型必须列出所有选项
      if (schema.enum && !schema.description?.includes(schema.enum[0])) {
        issues.push('enum 类型建议在 description 中说明每个选项的含义');
      }

      // 规则 3：格式约束必须明确
      if (schema.type === 'string' && !schema.pattern && !schema.enum) {
        if (name.includes('date') || name.includes('time')) {
          issues.push('日期/时间字段建议指定格式（如 "YYYY-MM-DD"）');
        }
        if (name.includes('id') || name.includes('Id')) {
          issues.push('ID 字段建议给出示例值');
        }
      }

      // 规则 4：数值类型应有范围
      if (schema.type === 'number' || schema.type === 'integer') {
        if (schema.minimum === undefined && schema.maximum === undefined) {
          issues.push('数值类型建议指定 minimum/maximum 范围');
        }
      }

      // 规则 5：可选参数应说明默认行为
      if (schema.default === undefined && !schema.description?.includes('默认')) {
        issues.push('可选参数建议说明不传时的默认行为');
      }

      // 规则 6：描述不应太短
      if (schema.description && schema.description.length < 10) {
        issues.push('描述过短，建议至少 10 个字符');
      }

      results.push({
        paramName: name,
        issues,
        quality: issues.length === 0 ? 'good' : issues.length <= 2 ? 'fair' : 'poor',
      });
    }

    return results;
  }
}

interface ParameterSchema {
  type: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  pattern?: string;
  minimum?: number;
  maximum?: number;
}

interface ParameterCheckResult {
  paramName: string;
  issues: string[];
  quality: 'good' | 'fair' | 'poor';
}
```

### 6.2.4 LLM-Friendly 错误消息设计

工具执行失败时返回的错误信息同样重要。LLM 需要理解错误原因才能决定下一步行动。

```typescript
/**
 * LLM 友好的错误消息构建器
 * 生成结构化的错误信息，帮助 LLM 理解错误并采取正确行动
 */
class ToolErrorBuilder {
  /**
   * 构建标准化错误响应
   * 包含：错误类型 + 原因 + LLM 应采取的行动建议
   */
  static build(params: ErrorBuildParams): ToolError {
    return {
      error: true,
      errorCode: params.code,
      errorType: params.type,
      message: params.message,
      // 关键：告诉 LLM 该怎么处理这个错误
      suggestedAction: this.getSuggestedAction(params.type, params.context),
      // 帮助 LLM 理解是否需要重试
      retryable: this.isRetryable(params.type),
      // 如果是参数错误，指出哪个参数有问题
      invalidParams: params.invalidParams,
    };
  }

  /** 根据错误类型给出行动建议 */
  private static getSuggestedAction(
    type: ToolErrorType,
    context?: Record<string, unknown>,
  ): string {
    switch (type) {
      case 'INVALID_PARAMS':
        return '请检查参数格式并修正后重试';
      case 'NOT_FOUND':
        return '目标资源不存在，请向用户确认名称或 ID 是否正确';
      case 'PERMISSION_DENIED':
        return '当前用户无权限执行此操作，请告知用户需要申请权限';
      case 'RATE_LIMITED':
        return `已触发速率限制，请等待 ${context?.['retryAfter'] || 60} 秒后重试`;
      case 'CONFLICT':
        return '资源状态冲突，请先用查询工具获取最新状态';
      case 'TIMEOUT':
        return '操作超时，可以稍后用查询工具检查操作是否已完成';
      case 'INTERNAL_ERROR':
        return '服务内部错误，请告知用户稍后重试。如果反复出现请上报';
      default:
        return '请将此错误信息告知用户';
    }
  }

  /** 判断错误是否可重试 */
  private static isRetryable(type: ToolErrorType): boolean {
    return ['RATE_LIMITED', 'TIMEOUT', 'INTERNAL_ERROR'].includes(type);
  }
}

type ToolErrorType =
  | 'INVALID_PARAMS'
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'CONFLICT'
  | 'TIMEOUT'
  | 'INTERNAL_ERROR';

interface ErrorBuildParams {
  code: string;
  type: ToolErrorType;
  message: string;
  context?: Record<string, unknown>;
  invalidParams?: Array<{ param: string; reason: string }>;
}

interface ToolError {
  error: true;
  errorCode: string;
  errorType: ToolErrorType;
  message: string;
  suggestedAction: string;
  retryable: boolean;
  invalidParams?: Array<{ param: string; reason: string }>;
}
```

---

## 6.3 Poka-Yoke 防错设计

Poka-Yoke（ポカヨケ）是丰田生产系统中的防错理念——**通过设计使错误不可能发生，而非依赖人的注意力**。在 Agent 工具系统中，LLM 就是那个"可能犯错的操作员"，我们需要通过多层防护让危险操作无法被误触发。

### 6.3.1 核心防护验证器

```typescript
/**
 * Poka-Yoke 防错验证器
 * 在工具执行前进行多维度安全检查
 */
class PokayokeValidator {
  private readonly guards: ToolGuard[] = [];

  /** 注册防护规则 */
  use(guard: ToolGuard): this {
    this.guards.push(guard);
    return this;
  }

  /**
   * 执行所有防护检查
   * 任一 guard 拒绝则整个调用被阻止
   */
  async validate(invocation: ToolInvocation): Promise<ValidationOutcome> {
    const results: GuardResult[] = [];

    for (const guard of this.guards) {
      const result = await guard.check(invocation);
      results.push(result);

      // 快速失败：遇到 DENY 立即返回
      if (result.decision === 'DENY') {
        return {
          allowed: false,
          reason: result.reason,
          guardName: guard.name,
          allResults: results,
        };
      }
    }

    return {
      allowed: true,
      reason: 'all guards passed',
      allResults: results,
    };
  }
}

interface ToolInvocation {
  toolName: string;
  args: Record<string, unknown>;
  userId: string;
  sessionId: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface GuardResult {
  guardName: string;
  decision: 'ALLOW' | 'DENY' | 'WARN';
  reason: string;
  metadata?: Record<string, unknown>;
}

interface ValidationOutcome {
  allowed: boolean;
  reason: string;
  guardName?: string;
  allResults: GuardResult[];
}

interface ToolGuard {
  name: string;
  check(invocation: ToolInvocation): Promise<GuardResult>;
}
```

### 6.3.2 基础防护：参数安全守卫

```typescript
/**
 * 参数安全守卫
 * 检测危险参数模式，防止 SQL 注入、路径遍历等
 */
class ParameterSafetyGuard implements ToolGuard {
  readonly name = 'ParameterSafetyGuard';

  // 危险模式正则库
  private readonly dangerousPatterns: Array<{
    name: string;
    pattern: RegExp;
    severity: 'high' | 'medium';
  }> = [
    { name: 'SQL 注入', pattern: /(['";]|--|\bDROP\b|\bDELETE\b|\bUPDATE\b.*\bSET\b)/i, severity: 'high' },
    { name: '路径遍历', pattern: /\.\.[/\\]/, severity: 'high' },
    { name: '命令注入', pattern: /[;&|`$()]/, severity: 'high' },
    { name: '过长参数', pattern: /.{10000,}/, severity: 'medium' },
  ];

  async check(invocation: ToolInvocation): Promise<GuardResult> {
    const violations: string[] = [];

    // 递归检查所有字符串参数
    this.inspectValues(invocation.args, (key, value) => {
      if (typeof value !== 'string') return;
      for (const dp of this.dangerousPatterns) {
        if (dp.pattern.test(value)) {
          violations.push(`参数 "${key}" 匹配危险模式: ${dp.name}`);
        }
      }
    });

    if (violations.length > 0) {
      return {
        guardName: this.name,
        decision: 'DENY',
        reason: `检测到危险参数: ${violations.join('; ')}`,
      };
    }

    return { guardName: this.name, decision: 'ALLOW', reason: 'safe' };
  }

  /** 递归遍历对象中的所有值 */
  private inspectValues(
    obj: Record<string, unknown>,
    callback: (key: string, value: unknown) => void,
    prefix = '',
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      callback(fullKey, value);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        this.inspectValues(value as Record<string, unknown>, callback, fullKey);
      }
    }
  }
}
```

### 6.3.3 速率限制守卫

```typescript
/**
 * 速率限制守卫
 * 使用滑动窗口算法限制工具调用频率
 */
class RateLimitGuard implements ToolGuard {
  readonly name = 'RateLimitGuard';

  // 存储调用时间戳的滑动窗口
  private readonly callWindows: Map<string, number[]> = new Map();

  constructor(
    private readonly config: RateLimitConfig = {
      global: { maxCalls: 100, windowMs: 60_000 },
      perTool: { maxCalls: 20, windowMs: 60_000 },
      perUser: { maxCalls: 50, windowMs: 60_000 },
    },
  ) {}

  async check(invocation: ToolInvocation): Promise<GuardResult> {
    const now = Date.now();

    // 检查三个维度的速率限制
    const checks: Array<{ key: string; limit: RateLimit; label: string }> = [
      { key: 'global', limit: this.config.global, label: '全局' },
      { key: `tool:${invocation.toolName}`, limit: this.config.perTool, label: `工具 ${invocation.toolName}` },
      { key: `user:${invocation.userId}`, limit: this.config.perUser, label: `用户 ${invocation.userId}` },
    ];

    for (const { key, limit, label } of checks) {
      const window = this.getWindow(key);
      // 清理过期记录
      const validCalls = window.filter(t => now - t < limit.windowMs);
      this.callWindows.set(key, validCalls);

      if (validCalls.length >= limit.maxCalls) {
        const oldestCall = validCalls[0];
        const retryAfterMs = limit.windowMs - (now - oldestCall);

        return {
          guardName: this.name,
          decision: 'DENY',
          reason: `${label}速率限制: ${validCalls.length}/${limit.maxCalls} 次/` +
            `${limit.windowMs / 1000}秒，请等待 ${Math.ceil(retryAfterMs / 1000)} 秒`,
          metadata: { retryAfterMs },
        };
      }

      // 记录本次调用
      validCalls.push(now);
      this.callWindows.set(key, validCalls);
    }

    return { guardName: this.name, decision: 'ALLOW', reason: 'within rate limit' };
  }

  private getWindow(key: string): number[] {
    return this.callWindows.get(key) || [];
  }
}

interface RateLimit {
  maxCalls: number;
  windowMs: number;
}

interface RateLimitConfig {
  global: RateLimit;
  perTool: RateLimit;
  perUser: RateLimit;
}
```

### 6.3.4 输出大小守卫

```typescript
/**
 * 输出大小守卫
 * 防止工具返回过大的结果撑爆 context window
 */
class OutputSizeGuard implements ToolGuard {
  readonly name = 'OutputSizeGuard';

  constructor(
    private readonly maxOutputTokens: number = 4000,
    private readonly truncationStrategy: 'head' | 'tail' | 'middle' = 'tail',
  ) {}

  async check(_invocation: ToolInvocation): Promise<GuardResult> {
    // 此 guard 在执行前仅做预检（基于工具历史统计）
    // 主要截断逻辑在 ToolExecutionWrapper 中
    return { guardName: this.name, decision: 'ALLOW', reason: 'pre-check passed' };
  }

  /**
   * 对工具执行结果进行截断
   * 在 ToolExecutionWrapper 中调用
   */
  truncateOutput(output: string): TruncationResult {
    const estimatedTokens = Math.ceil(output.length / 3); // 粗略估算

    if (estimatedTokens <= this.maxOutputTokens) {
      return { output, truncated: false, originalTokens: estimatedTokens };
    }

    const maxChars = this.maxOutputTokens * 3;
    let truncated: string;

    switch (this.truncationStrategy) {
      case 'head':
        truncated = output.slice(0, maxChars) +
          `\n\n[... 输出被截断，原始长度约 ${estimatedTokens} tokens，已保留前 ${this.maxOutputTokens} tokens]`;
        break;
      case 'tail':
        truncated = `[输出被截断，显示最后 ${this.maxOutputTokens} tokens ...]\n\n` +
          output.slice(-maxChars);
        break;
      case 'middle': {
        const halfChars = Math.floor(maxChars / 2);
        truncated = output.slice(0, halfChars) +
          `\n\n[... 省略中间 ${estimatedTokens - this.maxOutputTokens} tokens ...]\n\n` +
          output.slice(-halfChars);
        break;
      }
    }

    return { output: truncated, truncated: true, originalTokens: estimatedTokens };
  }
}

interface TruncationResult {
  output: string;
  truncated: boolean;
  originalTokens: number;
}
```

### 6.3.5 成本守卫

```typescript
/**
 * 成本守卫
 * 跟踪和限制工具调用产生的费用
 */
class CostGuard implements ToolGuard {
  readonly name = 'CostGuard';

  // 记录累计成本（内存中，生产环境应持久化）
  private readonly sessionCosts: Map<string, number> = new Map();
  private readonly dailyCosts: Map<string, number> = new Map();

  constructor(
    private readonly limits: CostLimits = {
      perCallMax: 1.0,        // 单次调用最大 $1
      perSessionMax: 10.0,    // 单会话最大 $10
      perDayMax: 100.0,       // 每日最大 $100
    },
    private readonly costEstimator: ToolCostEstimator,
  ) {}

  async check(invocation: ToolInvocation): Promise<GuardResult> {
    const estimatedCost = this.costEstimator.estimate(
      invocation.toolName,
      invocation.args,
    );

    // 检查单次调用成本
    if (estimatedCost > this.limits.perCallMax) {
      return {
        guardName: this.name,
        decision: 'DENY',
        reason: `预估成本 $${estimatedCost.toFixed(2)} 超过单次上限 $${this.limits.perCallMax}`,
        metadata: { estimatedCost },
      };
    }

    // 检查会话累计成本
    const sessionKey = invocation.sessionId;
    const sessionTotal = (this.sessionCosts.get(sessionKey) || 0) + estimatedCost;
    if (sessionTotal > this.limits.perSessionMax) {
      return {
        guardName: this.name,
        decision: 'DENY',
        reason: `会话累计成本 $${sessionTotal.toFixed(2)} 将超过上限 $${this.limits.perSessionMax}`,
        metadata: { sessionTotal, estimatedCost },
      };
    }

    // 检查日累计成本
    const dailyKey = `${invocation.userId}:${new Date().toISOString().slice(0, 10)}`;
    const dailyTotal = (this.dailyCosts.get(dailyKey) || 0) + estimatedCost;
    if (dailyTotal > this.limits.perDayMax) {
      return {
        guardName: this.name,
        decision: 'DENY',
        reason: `今日累计成本 $${dailyTotal.toFixed(2)} 将超过上限 $${this.limits.perDayMax}`,
        metadata: { dailyTotal, estimatedCost },
      };
    }

    // 更新累计成本
    this.sessionCosts.set(sessionKey, sessionTotal);
    this.dailyCosts.set(dailyKey, dailyTotal);

    return {
      guardName: this.name,
      decision: estimatedCost > this.limits.perCallMax * 0.5 ? 'WARN' : 'ALLOW',
      reason: `预估成本 $${estimatedCost.toFixed(4)}`,
      metadata: { estimatedCost, sessionTotal, dailyTotal },
    };
  }
}

interface CostLimits {
  perCallMax: number;
  perSessionMax: number;
  perDayMax: number;
}

interface ToolCostEstimator {
  estimate(toolName: string, args: Record<string, unknown>): number;
}
```

### 6.3.6 超时守卫

```typescript
/**
 * 超时守卫
 * 根据工具类型动态设置执行超时时间
 */
class TimeoutGuard implements ToolGuard {
  readonly name = 'TimeoutGuard';

  // 工具类型与默认超时映射
  private readonly defaultTimeouts: Record<string, number> = {
    'query': 10_000,    // 查询类 10 秒
    'create': 15_000,   // 创建类 15 秒
    'update': 15_000,   // 更新类 15 秒
    'delete': 10_000,   // 删除类 10 秒
    'deploy': 300_000,  // 部署类 5 分钟
    'build': 600_000,   // 构建类 10 分钟
  };

  private readonly customTimeouts: Map<string, number> = new Map();

  /** 为特定工具设置自定义超时 */
  setToolTimeout(toolName: string, timeoutMs: number): void {
    this.customTimeouts.set(toolName, timeoutMs);
  }

  async check(invocation: ToolInvocation): Promise<GuardResult> {
    const timeout = this.getTimeout(invocation.toolName);

    // 将超时信息注入到 invocation 的 metadata 中
    // 供 ToolExecutionWrapper 使用
    if (!invocation.metadata) invocation.metadata = {};
    invocation.metadata['timeoutMs'] = timeout;

    return {
      guardName: this.name,
      decision: 'ALLOW',
      reason: `超时设置: ${timeout}ms`,
      metadata: { timeoutMs: timeout },
    };
  }

  private getTimeout(toolName: string): number {
    // 优先使用自定义超时
    if (this.customTimeouts.has(toolName)) {
      return this.customTimeouts.get(toolName)!;
    }

    // 根据工具名中的动词推断类型
    const parts = toolName.split('_');
    const verb = parts.length >= 2 ? parts[1] : '';
    return this.defaultTimeouts[verb] || 30_000; // 默认 30 秒
  }
}
```

### 6.3.7 工具执行沙箱

```typescript
/**
 * 工具执行沙箱
 * 在隔离环境中执行工具，限制资源使用
 */
class ToolExecutionSandbox {
  constructor(
    private readonly resourceLimits: ResourceLimits = {
      maxMemoryMB: 256,
      maxCpuTimeMs: 30_000,
      maxOutputSizeBytes: 1_048_576,  // 1MB
      maxNetworkRequests: 10,
    },
  ) {}

  /**
   * 在沙箱中执行工具
   * 使用 AbortController 实现超时控制
   */
  async execute<T>(
    toolFn: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
  ): Promise<SandboxResult<T>> {
    const controller = new AbortController();
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    // 设置超时定时器
    const timeoutHandle = setTimeout(() => {
      controller.abort(new Error(`工具执行超时 (${timeoutMs}ms)`));
    }, timeoutMs);

    try {
      const result = await toolFn(controller.signal);
      const duration = Date.now() - startTime;
      const memoryDelta = process.memoryUsage().heapUsed - startMemory;

      // 检查资源使用是否超限
      if (memoryDelta > this.resourceLimits.maxMemoryMB * 1024 * 1024) {
        return {
          success: false,
          error: `内存使用超限: ${(memoryDelta / 1024 / 1024).toFixed(1)}MB > ${this.resourceLimits.maxMemoryMB}MB`,
          metrics: { duration, memoryDeltaBytes: memoryDelta },
        };
      }

      return {
        success: true,
        data: result,
        metrics: { duration, memoryDeltaBytes: memoryDelta },
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: `执行超时 (${timeoutMs}ms)`,
          metrics: { duration, memoryDeltaBytes: 0 },
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metrics: { duration, memoryDeltaBytes: 0 },
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

interface ResourceLimits {
  maxMemoryMB: number;
  maxCpuTimeMs: number;
  maxOutputSizeBytes: number;
  maxNetworkRequests: number;
}

interface SandboxResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  metrics: {
    duration: number;
    memoryDeltaBytes: number;
  };
}
```

### 6.3.8 基于角色的权限模型

```typescript
/**
 * 工具权限管理器
 * 基于 RBAC（Role-Based Access Control）控制工具访问
 */
class ToolPermissionManager {
  // 角色 -> 权限映射
  private readonly rolePermissions: Map<string, Set<ToolPermission>> = new Map();
  // 用户 -> 角色映射
  private readonly userRoles: Map<string, Set<string>> = new Map();
  // 工具 -> 所需权限映射
  private readonly toolRequirements: Map<string, ToolPermission[]> = new Map();

  constructor() {
    // 初始化默认角色
    this.defineRole('viewer', [
      { action: 'read', resource: '*' },
    ]);
    this.defineRole('editor', [
      { action: 'read', resource: '*' },
      { action: 'write', resource: '*' },
    ]);
    this.defineRole('owner', [
      { action: 'read', resource: '*' },
      { action: 'write', resource: '*' },
      { action: 'delete', resource: '*' },
      { action: 'admin', resource: '*' },
    ]);
  }

  /** 定义角色及其权限 */
  defineRole(roleName: string, permissions: ToolPermission[]): void {
    this.rolePermissions.set(roleName, new Set(permissions));
  }

  /** 为用户分配角色 */
  assignRole(userId: string, roleName: string): void {
    if (!this.rolePermissions.has(roleName)) {
      throw new Error(`角色 "${roleName}" 未定义`);
    }
    const roles = this.userRoles.get(userId) || new Set();
    roles.add(roleName);
    this.userRoles.set(userId, roles);
  }

  /** 为工具设置所需权限 */
  setToolRequirement(toolName: string, permissions: ToolPermission[]): void {
    this.toolRequirements.set(toolName, permissions);
  }

  /** 检查用户是否有权调用指定工具 */
  checkPermission(userId: string, toolName: string): PermissionCheckResult {
    const userRoleSet = this.userRoles.get(userId);
    if (!userRoleSet || userRoleSet.size === 0) {
      return {
        allowed: false,
        reason: `用户 "${userId}" 未分配任何角色`,
        requiredPermissions: this.toolRequirements.get(toolName) || [],
        userPermissions: [],
      };
    }

    // 收集用户所有权限
    const userPermissions: ToolPermission[] = [];
    for (const role of userRoleSet) {
      const perms = this.rolePermissions.get(role);
      if (perms) userPermissions.push(...perms);
    }

    // 检查工具所需的每个权限
    const required = this.toolRequirements.get(toolName) || [];
    const missing = required.filter(req =>
      !userPermissions.some(up =>
        (up.action === req.action || up.action === 'admin') &&
        (up.resource === '*' || up.resource === req.resource)
      )
    );

    return {
      allowed: missing.length === 0,
      reason: missing.length === 0
        ? '权限检查通过'
        : `缺少权限: ${missing.map(m => `${m.action}:${m.resource}`).join(', ')}`,
      requiredPermissions: required,
      userPermissions,
    };
  }

  /** 创建 ToolGuard 实例，集成到 PokayokeValidator */
  createGuard(): ToolGuard {
    const manager = this;
    return {
      name: 'PermissionGuard',
      async check(invocation: ToolInvocation): Promise<GuardResult> {
        const result = manager.checkPermission(invocation.userId, invocation.toolName);
        return {
          guardName: 'PermissionGuard',
          decision: result.allowed ? 'ALLOW' : 'DENY',
          reason: result.reason,
        };
      },
    };
  }
}

interface ToolPermission {
  action: 'read' | 'write' | 'delete' | 'admin';
  resource: string;  // 资源标识符，'*' 表示所有
}

interface PermissionCheckResult {
  allowed: boolean;
  reason: string;
  requiredPermissions: ToolPermission[];
  userPermissions: ToolPermission[];
}
```

### 6.3.9 审计日志

```typescript
/**
 * 工具调用审计日志
 * 记录每次工具调用的完整信息，用于审计和调试
 */
class ToolAuditLogger {
  private readonly logEntries: AuditLogEntry[] = [];
  private readonly sinks: AuditSink[] = [];

  /** 注册日志输出目标（控制台、文件、数据库等） */
  addSink(sink: AuditSink): void {
    this.sinks.push(sink);
  }

  /**
   * 记录工具调用
   * 使用高阶函数包装工具执行，自动记录所有信息
   */
  wrap<T>(
    invocation: ToolInvocation,
    executeFn: () => Promise<T>,
  ): Promise<T> {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      toolName: invocation.toolName,
      userId: invocation.userId,
      sessionId: invocation.sessionId,
      args: this.sanitizeArgs(invocation.args),
      timestamp: new Date().toISOString(),
      startTime: Date.now(),
      endTime: 0,
      durationMs: 0,
      status: 'running',
    };

    this.logEntries.push(entry);

    return executeFn()
      .then((result) => {
        entry.endTime = Date.now();
        entry.durationMs = entry.endTime - entry.startTime;
        entry.status = 'success';
        entry.resultSummary = this.summarizeResult(result);
        this.emit(entry);
        return result;
      })
      .catch((error) => {
        entry.endTime = Date.now();
        entry.durationMs = entry.endTime - entry.startTime;
        entry.status = 'error';
        entry.error = error instanceof Error ? error.message : String(error);
        this.emit(entry);
        throw error;
      });
  }

  /** 查询审计日志 */
  query(filter: AuditQueryFilter): AuditLogEntry[] {
    return this.logEntries.filter(entry => {
      if (filter.userId && entry.userId !== filter.userId) return false;
      if (filter.toolName && entry.toolName !== filter.toolName) return false;
      if (filter.status && entry.status !== filter.status) return false;
      if (filter.since && new Date(entry.timestamp) < filter.since) return false;
      if (filter.until && new Date(entry.timestamp) > filter.until) return false;
      return true;
    });
  }

  /** 生成调用统计报告 */
  generateReport(since: Date): AuditReport {
    const entries = this.query({ since });
    const byTool = new Map<string, number>();
    const byUser = new Map<string, number>();
    let totalDuration = 0;
    let errorCount = 0;

    for (const entry of entries) {
      byTool.set(entry.toolName, (byTool.get(entry.toolName) || 0) + 1);
      byUser.set(entry.userId, (byUser.get(entry.userId) || 0) + 1);
      totalDuration += entry.durationMs;
      if (entry.status === 'error') errorCount++;
    }

    return {
      period: { since, until: new Date() },
      totalCalls: entries.length,
      uniqueTools: byTool.size,
      uniqueUsers: byUser.size,
      errorRate: entries.length > 0 ? errorCount / entries.length : 0,
      averageDurationMs: entries.length > 0 ? totalDuration / entries.length : 0,
      topTools: [...byTool.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count })),
      topUsers: [...byUser.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([id, count]) => ({ id, count })),
    };
  }

  /** 脱敏处理敏感参数 */
  private sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'credential', 'apiKey'];
    const sanitized = { ...args };
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        sanitized[key] = '***REDACTED***';
      }
    }
    return sanitized;
  }

  /** 摘要化结果（避免日志过大） */
  private summarizeResult(result: unknown): string {
    const str = JSON.stringify(result);
    return str.length > 500 ? str.slice(0, 500) + '...' : str;
  }

  /** 向所有 sink 发送日志 */
  private emit(entry: AuditLogEntry): void {
    for (const sink of this.sinks) {
      sink.write(entry).catch(console.error);
    }
  }

  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

interface AuditLogEntry {
  id: string;
  toolName: string;
  userId: string;
  sessionId: string;
  args: Record<string, unknown>;
  timestamp: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  status: 'running' | 'success' | 'error';
  resultSummary?: string;
  error?: string;
}

interface AuditQueryFilter {
  userId?: string;
  toolName?: string;
  status?: string;
  since?: Date;
  until?: Date;
}

interface AuditReport {
  period: { since: Date; until: Date };
  totalCalls: number;
  uniqueTools: number;
  uniqueUsers: number;
  errorRate: number;
  averageDurationMs: number;
  topTools: Array<{ name: string; count: number }>;
  topUsers: Array<{ id: string; count: number }>;
}

interface AuditSink {
  write(entry: AuditLogEntry): Promise<void>;
}
```

### 6.3.10 防护体系集成

将所有守卫组合成完整的防护链：

```typescript
/**
 * 创建完整的防护体系
 * 按照检查优先级排列守卫
 */
function createProductionValidator(): PokayokeValidator {
  const permissionManager = new ToolPermissionManager();
  const costEstimator: ToolCostEstimator = {
    estimate: (toolName: string, _args: Record<string, unknown>) => {
      // 简化的成本估算逻辑
      const baseCosts: Record<string, number> = {
        'search': 0.01, 'query': 0.005, 'create': 0.02,
        'deploy': 0.50, 'build': 0.30,
      };
      const verb = toolName.split('_')[1] || '';
      return baseCosts[verb] || 0.01;
    },
  };

  const validator = new PokayokeValidator();

  // 按优先级注册守卫（短路机制：前面的守卫拒绝后不再检查后续）
  validator
    .use(permissionManager.createGuard())    // 1. 权限检查（最先）
    .use(new RateLimitGuard())               // 2. 速率限制
    .use(new CostGuard(undefined, costEstimator)) // 3. 成本控制
    .use(new ParameterSafetyGuard())         // 4. 参数安全
    .use(new TimeoutGuard())                 // 5. 超时设置
    .use(new OutputSizeGuard());             // 6. 输出大小

  return validator;
}
```

---

## 6.4 MCP 深度集成

### 6.4.1 MCP 协议概述

Model Context Protocol（MCP）是 Anthropic 于 2024 年发布的开放协议，旨在标准化 LLM 应用与外部工具/数据源之间的交互方式。MCP 之于 Agent 工具系统，正如 HTTP 之于 Web——它定义了一套通用的通信规范，使得工具提供方和消费方可以解耦开发。

**MCP 的核心价值：**

| 特性 | 描述 |
|------|------|
| 标准化 | 统一的工具描述、调用、响应格式 |
| 可发现性 | 客户端可以动态发现服务端提供的工具 |
| 传输无关 | 支持 stdio 和 HTTP SSE 两种传输方式 |
| 双向通信 | 服务端可以向客户端请求上下文（Sampling） |

**MCP 架构：**

```
Host (LLM 应用)
  +-- MCP Client
        |-- MCP Server A (via stdio)  -> 本地工具
        |-- MCP Server B (via SSE)    -> 远程服务
        +-- MCP Server C (via SSE)    -> 第三方 API
```

### 6.4.2 MCP 核心类型定义

```typescript
/**
 * MCP 协议核心类型定义
 * 基于 MCP 规范 2024-11-05 版本
 */

/** JSON-RPC 2.0 消息基础类型 */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/** MCP 工具定义 */
interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, MCPParameterSchema>;
    required?: string[];
  };
}

interface MCPParameterSchema {
  type: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  items?: MCPParameterSchema;
  properties?: Record<string, MCPParameterSchema>;
}

/** MCP 工具调用请求和响应 */
interface MCPToolCallRequest {
  method: 'tools/call';
  params: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface MCPToolCallResponse {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;      // base64 for image
    mimeType?: string;
    resource?: { uri: string; text?: string };
  }>;
  isError?: boolean;
}

/** MCP 能力协商 */
interface MCPCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  sampling?: Record<string, never>;
}

interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: MCPCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
}
```

### 6.4.3 Stdio 传输模式实现

Stdio 传输模式适用于本地 MCP Server——通过子进程的标准输入/输出进行通信。

```typescript
import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as readline from 'readline';

/**
 * MCP Stdio 传输层
 * 通过子进程的 stdin/stdout 与 MCP Server 通信
 */
class StdioTransport extends EventEmitter {
  private process: ChildProcess | null = null;
  private lineReader: readline.Interface | null = null;
  private requestId = 0;
  private pendingRequests: Map<string | number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }> = new Map();

  constructor(
    private readonly command: string,
    private readonly args: string[] = [],
    private readonly env?: Record<string, string>,
    private readonly timeoutMs: number = 30_000,
  ) {
    super();
  }

  /** 启动 MCP Server 子进程 */
  async start(): Promise<void> {
    this.process = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.env },
    });

    // 监听 stdout 逐行读取 JSON-RPC 消息
    this.lineReader = readline.createInterface({
      input: this.process.stdout!,
    });

    this.lineReader.on('line', (line: string) => {
      try {
        const message = JSON.parse(line);
        this.handleMessage(message);
      } catch {
        // 忽略非 JSON 输出（如日志信息）
      }
    });

    // 监听 stderr 用于调试
    this.process.stderr?.on('data', (data: Buffer) => {
      this.emit('log', data.toString());
    });

    // 监听进程退出
    this.process.on('exit', (code: number | null) => {
      this.emit('close', code);
      this.rejectAllPending(new Error(`MCP Server 进程退出，退出码: ${code}`));
    });

    this.process.on('error', (err: Error) => {
      this.emit('error', err);
    });
  }

  /** 发送 JSON-RPC 请求并等待响应 */
  async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.process || !this.process.stdin) {
      throw new Error('传输层未启动');
    }

    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`请求超时 (${this.timeoutMs}ms): ${method}`));
      }, this.timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });

      // 写入 stdin，每条消息以换行符分隔
      const message = JSON.stringify(request) + '\n';
      this.process!.stdin!.write(message);
    });
  }

  /** 关闭传输层 */
  async close(): Promise<void> {
    this.rejectAllPending(new Error('传输层关闭'));
    this.lineReader?.close();
    this.process?.kill('SIGTERM');

    // 给进程 5 秒优雅退出时间
    await new Promise<void>((resolve) => {
      const forceKillTimer = setTimeout(() => {
        this.process?.kill('SIGKILL');
        resolve();
      }, 5_000);

      this.process?.on('exit', () => {
        clearTimeout(forceKillTimer);
        resolve();
      });
    });
  }

  /** 处理收到的 JSON-RPC 消息 */
  private handleMessage(message: JsonRpcResponse): void {
    if (message.id !== undefined) {
      // 这是对我们请求的响应
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(`MCP 错误 [${message.error.code}]: ${message.error.message}`));
        } else {
          pending.resolve(message.result);
        }
      }
    } else {
      // 这是服务端发起的通知
      this.emit('notification', message);
    }
  }

  /** 拒绝所有待处理的请求 */
  private rejectAllPending(error: Error): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}
```

### 6.4.4 SSE 传输模式实现

SSE（Server-Sent Events）传输适用于远程 MCP Server，通过 HTTP 进行通信。

```typescript
/**
 * MCP SSE 传输层
 * 使用 HTTP POST 发送请求，通过 SSE 接收响应
 */
class SSETransport extends EventEmitter {
  private sessionUrl: string | null = null;
  private requestId = 0;
  private pendingRequests: Map<string | number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }> = new Map();

  constructor(
    private readonly serverUrl: string,
    private readonly headers: Record<string, string> = {},
    private readonly timeoutMs: number = 30_000,
  ) {
    super();
  }

  /** 连接到 MCP Server 的 SSE 端点 */
  async connect(): Promise<void> {
    const sseUrl = `${this.serverUrl}/sse`;
    await this.startSSEListener(sseUrl);
  }

  /** 启动 SSE 监听 */
  private async startSSEListener(url: string): Promise<void> {
    const response = await fetch(url, {
      headers: {
        ...this.headers,
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      throw new Error(`SSE 连接失败: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('无法获取响应流');

    const decoder = new TextDecoder();
    let buffer = '';

    // 持续读取 SSE 流
    const readLoop = async (): Promise<void> => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          this.emit('close');
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留不完整的行

        let eventType = '';
        let eventData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6);
          } else if (line === '' && eventData) {
            // 空行表示事件结束
            this.handleSSEEvent(eventType, eventData);
            eventType = '';
            eventData = '';
          }
        }
      }
    };

    // 不 await readLoop，让它在后台运行
    readLoop().catch(err => this.emit('error', err));
  }

  /** 处理 SSE 事件 */
  private handleSSEEvent(eventType: string, data: string): void {
    if (eventType === 'endpoint') {
      // 收到会话 URL，后续请求发往此 URL
      this.sessionUrl = data.trim();
      this.emit('connected', this.sessionUrl);
      return;
    }

    if (eventType === 'message') {
      try {
        const message = JSON.parse(data);
        this.handleMessage(message);
      } catch {
        // 忽略解析错误
      }
    }
  }

  /** 发送 JSON-RPC 请求 */
  async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.sessionUrl) {
      throw new Error('尚未建立会话连接');
    }

    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`请求超时 (${this.timeoutMs}ms): ${method}`));
      }, this.timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });

      try {
        const response = await fetch(this.sessionUrl!, {
          method: 'POST',
          headers: {
            ...this.headers,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          clearTimeout(timer);
          this.pendingRequests.delete(id);
          reject(new Error(`HTTP 错误: ${response.status}`));
        }
        // 响应通过 SSE 流返回，此处不需要处理 response body
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(err);
      }
    });
  }

  /** 处理收到的响应消息 */
  private handleMessage(message: JsonRpcResponse): void {
    if (message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(`MCP 错误 [${message.error.code}]: ${message.error.message}`));
        } else {
          pending.resolve(message.result);
        }
      }
    } else {
      this.emit('notification', message);
    }
  }

  async close(): Promise<void> {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('连接关闭'));
    }
    this.pendingRequests.clear();
  }
}
```

### 6.4.5 MCP 客户端实现

```typescript
/**
 * MCP 客户端
 * 封装与单个 MCP Server 的完整交互逻辑
 */
class MCPClient {
  private transport: StdioTransport | SSETransport;
  private serverCapabilities: MCPCapabilities | null = null;
  private cachedTools: MCPToolDefinition[] | null = null;

  constructor(
    private readonly config: MCPServerConfig,
  ) {
    if (config.transport === 'stdio') {
      this.transport = new StdioTransport(
        config.command!,
        config.args,
        config.env,
      );
    } else {
      this.transport = new SSETransport(
        config.url!,
        config.headers,
      );
    }
  }

  /** 初始化连接并协商能力 */
  async connect(): Promise<MCPInitializeResult> {
    // 启动传输层
    if (this.transport instanceof StdioTransport) {
      await this.transport.start();
    } else {
      await (this.transport as SSETransport).connect();
    }

    // 发送 initialize 请求
    const result = await this.transport.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        sampling: {},
      },
      clientInfo: {
        name: 'AgentToolSystem',
        version: '1.0.0',
      },
    }) as MCPInitializeResult;

    this.serverCapabilities = result.capabilities;

    // 发送 initialized 通知
    await this.transport.request('notifications/initialized', {});

    // 监听工具变更通知
    this.transport.on('notification', (msg: { method: string }) => {
      if (msg.method === 'notifications/tools/list_changed') {
        this.cachedTools = null; // 清除缓存，下次重新获取
      }
    });

    return result;
  }

  /** 获取服务端提供的工具列表 */
  async listTools(): Promise<MCPToolDefinition[]> {
    if (this.cachedTools) return this.cachedTools;

    const result = await this.transport.request('tools/list', {}) as {
      tools: MCPToolDefinition[];
    };

    this.cachedTools = result.tools;
    return result.tools;
  }

  /** 调用工具 */
  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolCallResponse> {
    return await this.transport.request('tools/call', {
      name,
      arguments: args,
    }) as MCPToolCallResponse;
  }

  /** 断开连接 */
  async disconnect(): Promise<void> {
    await this.transport.close();
  }

  /** 获取服务端能力 */
  getCapabilities(): MCPCapabilities | null {
    return this.serverCapabilities;
  }
}

interface MCPServerConfig {
  /** 服务器唯一标识 */
  id: string;
  /** 服务器显示名称 */
  name: string;
  /** 传输模式 */
  transport: 'stdio' | 'sse';
  /** stdio 模式：启动命令 */
  command?: string;
  /** stdio 模式：命令参数 */
  args?: string[];
  /** stdio 模式：环境变量 */
  env?: Record<string, string>;
  /** SSE 模式：服务器 URL */
  url?: string;
  /** SSE 模式：HTTP 头 */
  headers?: Record<string, string>;
}
```

### 6.4.6 多 MCP Server 管理器

在实际应用中，一个 Agent 可能同时连接多个 MCP Server（文件系统、数据库、Web 搜索等）。MCPServerManager 统一管理这些连接。

```typescript
/**
 * MCP Server 管理器
 * 管理多个 MCP Server 连接，提供统一的工具发现和调用接口
 */
class MCPServerManager {
  private readonly clients: Map<string, MCPClient> = new Map();
  private readonly toolToServer: Map<string, string> = new Map();

  /** 添加并连接一个 MCP Server */
  async addServer(config: MCPServerConfig): Promise<void> {
    if (this.clients.has(config.id)) {
      throw new Error(`服务器 "${config.id}" 已存在`);
    }

    const client = new MCPClient(config);

    try {
      const initResult = await client.connect();
      console.log(`已连接到 MCP Server "${config.name}" ` +
        `(protocol: ${initResult.protocolVersion})`);

      this.clients.set(config.id, client);

      // 发现并注册工具
      await this.discoverTools(config.id);
    } catch (error) {
      console.error(`连接 MCP Server "${config.name}" 失败:`, error);
      throw error;
    }
  }

  /** 发现指定服务器的工具并建立映射 */
  private async discoverTools(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (!client) return;

    const tools = await client.listTools();

    for (const tool of tools) {
      if (this.toolToServer.has(tool.name)) {
        const existingServer = this.toolToServer.get(tool.name);
        console.warn(
          `工具名冲突: "${tool.name}" 同时存在于 ` +
          `"${existingServer}" 和 "${serverId}"。` +
          `将使用 "${serverId}" 的版本。`
        );
      }
      this.toolToServer.set(tool.name, serverId);
    }

    console.log(`从服务器 "${serverId}" 发现 ${tools.length} 个工具`);
  }

  /** 获取所有可用工具 */
  async getAllTools(): Promise<MCPToolDefinition[]> {
    const allTools: MCPToolDefinition[] = [];
    for (const [, client] of this.clients) {
      const tools = await client.listTools();
      allTools.push(...tools);
    }
    return allTools;
  }

  /** 调用工具（自动路由到正确的服务器） */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolCallResponse> {
    const serverId = this.toolToServer.get(toolName);
    if (!serverId) {
      throw new Error(`未知工具: "${toolName}"。可用工具: ${[...this.toolToServer.keys()].join(', ')}`);
    }

    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`服务器 "${serverId}" 未连接`);
    }

    return client.callTool(toolName, args);
  }

  /** 移除并断开一个 MCP Server */
  async removeServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (!client) return;

    await client.disconnect();
    this.clients.delete(serverId);

    // 清理该服务器的工具映射
    for (const [toolName, sid] of this.toolToServer) {
      if (sid === serverId) {
        this.toolToServer.delete(toolName);
      }
    }
  }

  /** 关闭所有连接 */
  async shutdown(): Promise<void> {
    const disconnects = [...this.clients.keys()].map(id => this.removeServer(id));
    await Promise.allSettled(disconnects);
  }

  /** 获取连接状态摘要 */
  getStatus(): ServerManagerStatus {
    const servers: ServerStatus[] = [];
    for (const [id, client] of this.clients) {
      servers.push({
        id,
        capabilities: client.getCapabilities(),
        toolCount: [...this.toolToServer.values()].filter(sid => sid === id).length,
      });
    }
    return {
      totalServers: this.clients.size,
      totalTools: this.toolToServer.size,
      servers,
    };
  }
}

interface ServerManagerStatus {
  totalServers: number;
  totalTools: number;
  servers: ServerStatus[];
}

interface ServerStatus {
  id: string;
  capabilities: MCPCapabilities | null;
  toolCount: number;
}
```

### 6.4.7 MCP 错误处理与重连

```typescript
/**
 * 带自动重连功能的 MCP 客户端包装器
 * 处理连接断开、超时、协议错误等异常
 */
class ResilientMCPClient {
  private client: MCPClient;
  private connected = false;
  private reconnectAttempts = 0;

  constructor(
    private readonly config: MCPServerConfig,
    private readonly options: ResilienceOptions = {
      maxReconnectAttempts: 5,
      baseReconnectDelayMs: 1_000,
      maxReconnectDelayMs: 30_000,
      healthCheckIntervalMs: 60_000,
    },
  ) {
    this.client = new MCPClient(config);
  }

  /** 连接并启动健康检查 */
  async connect(): Promise<void> {
    await this.doConnect();
    this.startHealthCheck();
  }

  /** 执行连接 */
  private async doConnect(): Promise<void> {
    try {
      await this.client.connect();
      this.connected = true;
      this.reconnectAttempts = 0;
      console.log(`MCP Server "${this.config.name}" 连接成功`);
    } catch (error) {
      this.connected = false;
      throw error;
    }
  }

  /** 带重连的工具调用 */
  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolCallResponse> {
    if (!this.connected) {
      await this.reconnect();
    }

    try {
      return await this.client.callTool(name, args);
    } catch (error) {
      // 如果是连接错误，尝试重连后重试
      if (this.isConnectionError(error)) {
        this.connected = false;
        await this.reconnect();
        return await this.client.callTool(name, args);
      }
      throw error;
    }
  }

  /** 执行重连 */
  private async reconnect(): Promise<void> {
    while (this.reconnectAttempts < this.options.maxReconnectAttempts) {
      this.reconnectAttempts++;

      // 指数退避 + 随机抖动
      const delay = Math.min(
        this.options.baseReconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1),
        this.options.maxReconnectDelayMs,
      );
      const jitter = delay * 0.2 * Math.random();

      console.log(
        `MCP Server "${this.config.name}" 重连中... ` +
        `(第 ${this.reconnectAttempts}/${this.options.maxReconnectAttempts} 次，` +
        `等待 ${Math.round(delay + jitter)}ms)`
      );

      await this.sleep(delay + jitter);

      try {
        this.client = new MCPClient(this.config);
        await this.doConnect();
        return;
      } catch {
        console.error(`重连失败 (第 ${this.reconnectAttempts} 次)`);
      }
    }

    throw new Error(
      `MCP Server "${this.config.name}" 重连失败，` +
      `已尝试 ${this.options.maxReconnectAttempts} 次`
    );
  }

  /** 定期健康检查 */
  private startHealthCheck(): void {
    setInterval(async () => {
      if (!this.connected) return;
      try {
        await this.client.listTools();
      } catch {
        console.warn(`MCP Server "${this.config.name}" 健康检查失败`);
        this.connected = false;
      }
    }, this.options.healthCheckIntervalMs);
  }

  /** 判断是否为连接类错误 */
  private isConnectionError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return msg.includes('connect') ||
        msg.includes('timeout') ||
        msg.includes('econnrefused') ||
        msg.includes('进程退出');
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

interface ResilienceOptions {
  maxReconnectAttempts: number;
  baseReconnectDelayMs: number;
  maxReconnectDelayMs: number;
  healthCheckIntervalMs: number;
}
```

### 6.4.8 动态工具注册

将 MCP 发现的工具动态注册到 Agent 的工具系统中：

```typescript
/**
 * 动态工具注册表
 * 将 MCP 工具和本地工具统一管理
 */
class DynamicToolRegistry {
  private readonly tools: Map<string, RegisteredTool> = new Map();
  private readonly mcpManager: MCPServerManager;
  private readonly validator: PokayokeValidator;

  constructor(mcpManager: MCPServerManager, validator: PokayokeValidator) {
    this.mcpManager = mcpManager;
    this.validator = validator;
  }

  /** 注册本地工具 */
  registerLocal(tool: LocalToolConfig): void {
    const validation = ToolNameValidator.validate(tool.name);
    if (!validation.valid) {
      throw new Error(`工具名不合规: ${validation.errors.join('; ')}`);
    }

    this.tools.set(tool.name, {
      type: 'local',
      definition: {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.parameters,
      },
      handler: tool.handler,
    });
  }

  /** 从 MCP 服务器同步工具 */
  async syncMCPTools(): Promise<number> {
    const mcpTools = await this.mcpManager.getAllTools();
    let registered = 0;

    for (const tool of mcpTools) {
      this.tools.set(tool.name, {
        type: 'mcp',
        definition: tool,
      });
      registered++;
    }

    return registered;
  }

  /** 执行工具调用（统一入口） */
  async execute(invocation: ToolInvocation): Promise<ToolExecutionResult> {
    // 1. 查找工具
    const tool = this.tools.get(invocation.toolName);
    if (!tool) {
      return {
        success: false,
        error: `未知工具: "${invocation.toolName}"`,
        duration: 0,
      };
    }

    // 2. 防错验证
    const validation = await this.validator.validate(invocation);
    if (!validation.allowed) {
      return {
        success: false,
        error: `安全检查未通过 [${validation.guardName}]: ${validation.reason}`,
        duration: 0,
      };
    }

    // 3. 执行
    const startTime = Date.now();
    try {
      let result: unknown;

      if (tool.type === 'local') {
        result = await tool.handler!(invocation.args);
      } else {
        const response = await this.mcpManager.callTool(
          invocation.toolName,
          invocation.args,
        );
        if (response.isError) {
          const errorText = response.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('\n');
          return {
            success: false,
            error: errorText || 'MCP 工具返回错误',
            duration: Date.now() - startTime,
          };
        }
        result = response.content;
      }

      return {
        success: true,
        data: result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /** 获取所有工具定义（供 LLM system prompt 使用） */
  getToolDefinitions(): MCPToolDefinition[] {
    return [...this.tools.values()].map(t => t.definition);
  }
}

interface RegisteredTool {
  type: 'local' | 'mcp';
  definition: MCPToolDefinition;
  handler?: (args: Record<string, unknown>) => Promise<unknown>;
}

interface LocalToolConfig {
  name: string;
  description: string;
  parameters: MCPToolDefinition['inputSchema'];
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration: number;
}
```

## 6.5 工具编排 — 从单兵作战到协同作战

真实的 Agent 任务很少只调用一个工具。部署一个服务可能需要：拉取代码 → 构建镜像 → 推送仓库 → 更新 K8s → 验证健康检查。这就是**工具编排**要解决的问题。

### 6.5.1 编排模式总览

```
┌─────────────────────────────────────────────────┐
│              工具编排模式                          │
├────────────┬──────────────┬─────────────────────┤
│   串行链    │   并行扇出    │     DAG 编排         │
│  A → B → C │  A ─┬→ B    │    A → B ─→ D       │
│            │    ├→ C    │    A → C ─→ D       │
│            │    └→ D    │                     │
├────────────┼──────────────┼─────────────────────┤
│ 最简单      │ 提升吞吐      │ 最灵活，处理复杂依赖   │
│ 前一步输出   │ 无依赖任务    │ 自动拓扑排序          │
│ 作为下一步输入│ 并行执行      │ 支持条件分支          │
└────────────┴──────────────┴─────────────────────┘
```

### 6.5.2 工具编排器：链式与并行

```typescript
// ---- 工具编排器：支持链式、并行、条件分支 ----

/** 编排步骤定义 */
interface OrchestrationStep {
  id: string;
  toolName: string;
  /** 参数生成函数，接收前序步骤结果 */
  paramsFn: (context: StepContext) => Record<string, unknown>;
  /** 可选的条件判断，返回 false 则跳过 */
  condition?: (context: StepContext) => boolean;
  /** 失败时的回退工具 */
  fallbackTool?: string;
  /** 超时（毫秒） */
  timeout?: number;
}

/** 步骤执行上下文 */
interface StepContext {
  /** 所有已完成步骤的结果，按 stepId 索引 */
  results: Map<string, StepResult>;
  /** 全局变量，可跨步骤传递 */
  globals: Record<string, unknown>;
}

interface StepResult {
  stepId: string;
  toolName: string;
  output: unknown;
  durationMs: number;
  status: 'success' | 'skipped' | 'failed' | 'fallback';
}

/** 工具执行器接口 */
interface ToolExecutor {
  call(toolName: string, params: Record<string, unknown>): Promise<unknown>;
}

class ToolOrchestrator {
  constructor(private executor: ToolExecutor) {}

  /**
   * 串行链式执行 —— 每一步的输出自动传给下一步
   * 适用场景：有严格先后依赖的流程
   */
  async chain(
    steps: OrchestrationStep[],
    initialContext?: Partial<StepContext>
  ): Promise<StepResult[]> {
    const context: StepContext = {
      results: new Map(),
      globals: initialContext?.globals ?? {},
    };
    const results: StepResult[] = [];

    for (const step of steps) {
      const result = await this.executeStep(step, context);
      results.push(result);
      context.results.set(step.id, result);

      // 链式执行中，任何一步失败（且无回退）则中断
      if (result.status === 'failed') {
        console.error(`[链式编排] 步骤 ${step.id} 失败，中断后续执行`);
        break;
      }
    }

    return results;
  }

  /**
   * 并行扇出执行 —— 所有步骤同时执行
   * 适用场景：步骤之间无依赖关系
   */
  async parallel(
    steps: OrchestrationStep[],
    options: { maxConcurrency?: number; failFast?: boolean } = {}
  ): Promise<StepResult[]> {
    const { maxConcurrency = 5, failFast = false } = options;
    const context: StepContext = {
      results: new Map(),
      globals: {},
    };

    // 使用信号量控制并发度
    const semaphore = new Semaphore(maxConcurrency);
    const controller = new AbortController();

    const promises = steps.map(async (step) => {
      await semaphore.acquire();
      try {
        if (controller.signal.aborted) {
          return this.createSkippedResult(step.id, step.toolName);
        }
        const result = await this.executeStep(step, context);
        if (result.status === 'failed' && failFast) {
          controller.abort(); // 快速失败：取消其他任务
        }
        return result;
      } finally {
        semaphore.release();
      }
    });

    return Promise.all(promises);
  }

  /**
   * 混合编排 —— 先并行执行一组，再串行执行下一组
   */
  async pipeline(
    stages: OrchestrationStep[][],
    context?: Partial<StepContext>
  ): Promise<StepResult[][]> {
    const allResults: StepResult[][] = [];
    const sharedContext: StepContext = {
      results: new Map(),
      globals: context?.globals ?? {},
    };

    for (const stage of stages) {
      // 每个 stage 内部并行
      const stageResults = await this.parallel(stage);
      allResults.push(stageResults);

      // 将结果注入共享上下文
      for (const result of stageResults) {
        sharedContext.results.set(result.stepId, result);
      }

      // 如果任意步骤失败，中断 pipeline
      const hasFailed = stageResults.some(r => r.status === 'failed');
      if (hasFailed) {
        console.error('[Pipeline] 阶段存在失败步骤，中断后续阶段');
        break;
      }
    }

    return allResults;
  }

  /** 执行单个步骤，处理条件跳过、超时、回退 */
  private async executeStep(
    step: OrchestrationStep,
    context: StepContext
  ): Promise<StepResult> {
    const startTime = Date.now();

    // 条件判断
    if (step.condition && !step.condition(context)) {
      return {
        stepId: step.id,
        toolName: step.toolName,
        output: null,
        durationMs: 0,
        status: 'skipped',
      };
    }

    try {
      const params = step.paramsFn(context);
      const output = await this.withTimeout(
        this.executor.call(step.toolName, params),
        step.timeout ?? 30_000
      );

      return {
        stepId: step.id,
        toolName: step.toolName,
        output,
        durationMs: Date.now() - startTime,
        status: 'success',
      };
    } catch (error) {
      // 尝试回退工具
      if (step.fallbackTool) {
        try {
          const params = step.paramsFn(context);
          const output = await this.executor.call(step.fallbackTool, params);
          return {
            stepId: step.id,
            toolName: step.fallbackTool,
            output,
            durationMs: Date.now() - startTime,
            status: 'fallback',
          };
        } catch {
          // 回退也失败，返回失败
        }
      }

      return {
        stepId: step.id,
        toolName: step.toolName,
        output: { error: String(error) },
        durationMs: Date.now() - startTime,
        status: 'failed',
      };
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`步骤超时: ${ms}ms`)), ms)
      ),
    ]);
  }

  private createSkippedResult(stepId: string, toolName: string): StepResult {
    return { stepId, toolName, output: null, durationMs: 0, status: 'skipped' };
  }
}

/** 简单信号量，控制并发度 */
class Semaphore {
  private current = 0;
  private queue: (() => void)[] = [];

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise<void>((resolve) => this.queue.push(resolve));
  }

  release(): void {
    this.current--;
    const next = this.queue.shift();
    if (next) {
      this.current++;
      next();
    }
  }
}
```

### 6.5.3 DAG 执行器：复杂依赖编排

当步骤之间存在任意依赖关系时，我们需要 DAG（有向无环图）执行器。它会自动进行拓扑排序，找出可以并行的步骤批次。

```typescript
// ---- DAG 执行器：基于拓扑排序的依赖编排 ----

interface DAGNode {
  id: string;
  toolName: string;
  paramsFn: (context: StepContext) => Record<string, unknown>;
  /** 依赖的节点 ID 列表 */
  dependencies: string[];
  /** 条件执行 */
  condition?: (context: StepContext) => boolean;
  timeout?: number;
}

class ToolDAGExecutor {
  private executor: ToolExecutor;

  constructor(executor: ToolExecutor) {
    this.executor = executor;
  }

  /**
   * 执行 DAG
   * 1. 验证无环
   * 2. 拓扑排序，按层并行执行
   * 3. 每层内的节点并发运行
   */
  async execute(nodes: DAGNode[]): Promise<Map<string, StepResult>> {
    // 第一步：验证无环
    this.validateNoCycles(nodes);

    // 第二步：拓扑排序，得到分层结果
    const layers = this.topologicalSort(nodes);
    console.log(
      `[DAG] 共 ${nodes.length} 个节点，分为 ${layers.length} 层执行`
    );

    // 第三步：逐层执行
    const context: StepContext = {
      results: new Map(),
      globals: {},
    };
    const allResults = new Map<string, StepResult>();

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      console.log(
        `[DAG] 执行第 ${i + 1} 层: [${layer.map(n => n.id).join(', ')}]`
      );

      // 层内并行执行
      const layerPromises = layer.map(async (node) => {
        // 检查依赖是否全部成功
        const depsOk = node.dependencies.every((depId) => {
          const depResult = allResults.get(depId);
          return depResult && depResult.status === 'success';
        });

        if (!depsOk) {
          return {
            stepId: node.id,
            toolName: node.toolName,
            output: { error: '依赖节点未成功完成' },
            durationMs: 0,
            status: 'skipped' as const,
          };
        }

        // 条件检查
        if (node.condition && !node.condition(context)) {
          return {
            stepId: node.id,
            toolName: node.toolName,
            output: null,
            durationMs: 0,
            status: 'skipped' as const,
          };
        }

        const startTime = Date.now();
        try {
          const params = node.paramsFn(context);
          const output = await this.executor.call(node.toolName, params);
          return {
            stepId: node.id,
            toolName: node.toolName,
            output,
            durationMs: Date.now() - startTime,
            status: 'success' as const,
          };
        } catch (error) {
          return {
            stepId: node.id,
            toolName: node.toolName,
            output: { error: String(error) },
            durationMs: Date.now() - startTime,
            status: 'failed' as const,
          };
        }
      });

      const layerResults = await Promise.all(layerPromises);
      for (const result of layerResults) {
        allResults.set(result.stepId, result);
        context.results.set(result.stepId, result);
      }
    }

    return allResults;
  }

  /** Kahn 算法拓扑排序，返回分层结果 */
  private topologicalSort(nodes: DAGNode[]): DAGNode[][] {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // 初始化
    for (const node of nodes) {
      inDegree.set(node.id, node.dependencies.length);
      for (const dep of node.dependencies) {
        const edges = adjacency.get(dep) ?? [];
        edges.push(node.id);
        adjacency.set(dep, edges);
      }
    }

    const layers: DAGNode[][] = [];
    let remaining = nodes.length;

    while (remaining > 0) {
      // 找出所有入度为 0 的节点
      const layer: DAGNode[] = [];
      for (const [id, degree] of inDegree) {
        if (degree === 0) {
          layer.push(nodeMap.get(id)!);
        }
      }

      if (layer.length === 0) {
        throw new Error('[DAG] 拓扑排序失败：存在循环依赖');
      }

      // 移除当前层节点，更新入度
      for (const node of layer) {
        inDegree.delete(node.id);
        const outEdges = adjacency.get(node.id) ?? [];
        for (const targetId of outEdges) {
          inDegree.set(targetId, (inDegree.get(targetId) ?? 1) - 1);
        }
      }

      layers.push(layer);
      remaining -= layer.length;
    }

    return layers;
  }

  /** DFS 检测环 */
  private validateNoCycles(nodes: DAGNode[]): void {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const node of nodes) color.set(node.id, WHITE);

    const depsMap = new Map(nodes.map(n => [n.id, n.dependencies]));

    const dfs = (nodeId: string, path: string[]): void => {
      color.set(nodeId, GRAY);
      const deps = depsMap.get(nodeId) ?? [];
      for (const dep of deps) {
        if (color.get(dep) === GRAY) {
          throw new Error(
            `[DAG] 检测到循环依赖: ${[...path, nodeId, dep].join(' → ')}`
          );
        }
        if (color.get(dep) === WHITE) {
          dfs(dep, [...path, nodeId]);
        }
      }
      color.set(nodeId, BLACK);
    };

    for (const node of nodes) {
      if (color.get(node.id) === WHITE) {
        dfs(node.id, []);
      }
    }
  }
}
```

**使用示例：部署流水线**

```typescript
// 定义部署流水线的 DAG 节点
const deploymentDAG: DAGNode[] = [
  {
    id: 'pull-code',
    toolName: 'github_pull_repo',
    dependencies: [],
    paramsFn: () => ({ repo: 'myapp', branch: 'main' }),
  },
  {
    id: 'run-tests',
    toolName: 'ci_run_tests',
    dependencies: ['pull-code'],
    paramsFn: (ctx) => ({
      codeDir: (ctx.results.get('pull-code')?.output as any)?.dir,
    }),
  },
  {
    id: 'build-image',
    toolName: 'docker_build_image',
    dependencies: ['run-tests'],
    paramsFn: (ctx) => ({
      codeDir: (ctx.results.get('pull-code')?.output as any)?.dir,
      tag: `myapp:${Date.now()}`,
    }),
  },
  {
    id: 'push-image',
    toolName: 'docker_push_image',
    dependencies: ['build-image'],
    paramsFn: (ctx) => ({
      image: (ctx.results.get('build-image')?.output as any)?.imageTag,
    }),
  },
  {
    id: 'deploy-staging',
    toolName: 'k8s_deploy_service',
    dependencies: ['push-image'],
    paramsFn: (ctx) => ({
      image: (ctx.results.get('push-image')?.output as any)?.fullTag,
      env: 'staging',
    }),
  },
  {
    id: 'smoke-test',
    toolName: 'ci_smoke_test',
    dependencies: ['deploy-staging'],
    paramsFn: () => ({ endpoint: 'https://staging.myapp.com/health' }),
  },
  {
    id: 'deploy-production',
    toolName: 'k8s_deploy_service',
    dependencies: ['smoke-test'],
    paramsFn: (ctx) => ({
      image: (ctx.results.get('push-image')?.output as any)?.fullTag,
      env: 'production',
    }),
    // 只有 smoke test 通过才部署生产
    condition: (ctx) =>
      ctx.results.get('smoke-test')?.status === 'success',
  },
];

// 执行 DAG
const dagExecutor = new ToolDAGExecutor(toolExecutor);
const results = await dagExecutor.execute(deploymentDAG);
```

### 6.5.4 熔断器模式

当某个工具持续失败时，继续调用只会浪费时间和 token。熔断器在连续失败达到阈值后自动"断路"，快速返回错误，并定期探测恢复。

```typescript
// ---- 熔断器：保护不稳定的外部工具 ----

enum CircuitState {
  CLOSED = 'CLOSED',       // 正常状态，允许调用
  OPEN = 'OPEN',           // 熔断状态，拒绝调用
  HALF_OPEN = 'HALF_OPEN', // 探测状态，允许有限调用
}

interface CircuitBreakerConfig {
  /** 触发熔断的连续失败次数 */
  failureThreshold: number;
  /** 熔断持续时间（毫秒） */
  resetTimeoutMs: number;
  /** 半开状态允许的探测次数 */
  halfOpenMaxAttempts: number;
  /** 判断是否应该计为失败的函数 */
  isFailure?: (error: unknown) => boolean;
}

class ToolCircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;
  private successCount = 0;

  // 统计信息
  private stats = {
    totalCalls: 0,
    totalSuccess: 0,
    totalFailures: 0,
    totalRejected: 0,
    stateChanges: [] as Array<{
      from: CircuitState;
      to: CircuitState;
      timestamp: number;
    }>,
  };

  constructor(
    private toolName: string,
    private config: CircuitBreakerConfig
  ) {}

  /**
   * 通过熔断器执行工具调用
   * @throws 当熔断器打开时抛出错误
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.stats.totalCalls++;

    // 检查是否应该从 OPEN 转为 HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.resetTimeoutMs) {
        this.transitionTo(CircuitState.HALF_OPEN);
      }
    }

    // OPEN 状态直接拒绝
    if (this.state === CircuitState.OPEN) {
      this.stats.totalRejected++;
      throw new Error(
        `[熔断器] 工具 "${this.toolName}" 已熔断，` +
        `将在 ${this.remainingResetTime()}ms 后尝试恢复。` +
        `连续失败 ${this.failureCount} 次。`
      );
    }

    // HALF_OPEN 状态限制探测次数
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
        this.stats.totalRejected++;
        throw new Error(
          `[熔断器] 工具 "${this.toolName}" 探测中，已达最大探测次数`
        );
      }
      this.halfOpenAttempts++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      const shouldCount = this.config.isFailure
        ? this.config.isFailure(error)
        : true;
      if (shouldCount) {
        this.onFailure();
      }
      throw error;
    }
  }

  private onSuccess(): void {
    this.stats.totalSuccess++;
    this.successCount++;

    if (this.state === CircuitState.HALF_OPEN) {
      // 半开状态成功，恢复为关闭
      console.log(`[熔断器] 工具 "${this.toolName}" 探测成功，恢复正常`);
      this.transitionTo(CircuitState.CLOSED);
    }

    // 重置失败计数
    this.failureCount = 0;
  }

  private onFailure(): void {
    this.stats.totalFailures++;
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // 半开状态失败，重新熔断
      console.log(`[熔断器] 工具 "${this.toolName}" 探测失败，重新熔断`);
      this.transitionTo(CircuitState.OPEN);
    } else if (this.failureCount >= this.config.failureThreshold) {
      // 达到阈值，触发熔断
      console.warn(
        `[熔断器] 工具 "${this.toolName}" 连续失败 ${this.failureCount} 次，触发熔断`
      );
      this.transitionTo(CircuitState.OPEN);
    }
  }

  private transitionTo(newState: CircuitState): void {
    const from = this.state;
    this.state = newState;
    this.stats.stateChanges.push({
      from,
      to: newState,
      timestamp: Date.now(),
    });

    if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.halfOpenAttempts = 0;
      this.successCount = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.halfOpenAttempts = 0;
    }
  }

  private remainingResetTime(): number {
    const elapsed = Date.now() - this.lastFailureTime;
    return Math.max(0, this.config.resetTimeoutMs - elapsed);
  }

  /** 获取熔断器统计信息 */
  getStats() {
    return {
      toolName: this.toolName,
      currentState: this.state,
      ...this.stats,
    };
  }
}
```

### 6.5.5 工具结果缓存

对于幂等的只读工具（如搜索、查询），缓存结果可以显著减少 API 调用和延迟。

```typescript
// ---- 工具结果缓存：TTL + LRU 淘汰 ----

interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  createdAt: number;
  ttlMs: number;
  accessCount: number;
  lastAccessedAt: number;
}

interface ToolCacheConfig {
  /** 最大缓存条目数 */
  maxEntries: number;
  /** 默认 TTL（毫秒） */
  defaultTtlMs: number;
  /** 工具级别 TTL 覆盖 */
  toolTtlOverrides?: Record<string, number>;
  /** 是否缓存失败结果（防止重复失败调用） */
  cacheErrors?: boolean;
  /** 错误缓存 TTL（通常较短） */
  errorTtlMs?: number;
}

class ToolCache {
  private cache = new Map<string, CacheEntry>();
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(private config: ToolCacheConfig) {}

  /**
   * 生成缓存键
   * 将工具名和参数做确定性序列化
   */
  private generateKey(
    toolName: string,
    params: Record<string, unknown>
  ): string {
    // 对参数键排序，确保相同参数生成相同的键
    const sortedParams = this.sortObject(params);
    return `${toolName}:${JSON.stringify(sortedParams)}`;
  }

  private sortObject(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.sortObject(item));
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = this.sortObject((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }

  /** 查询缓存 */
  get<T>(toolName: string, params: Record<string, unknown>): T | undefined {
    const key = this.generateKey(toolName, params);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // 检查是否过期
    if (Date.now() - entry.createdAt > entry.ttlMs) {
      this.cache.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // 更新访问信息（LRU）
    entry.accessCount++;
    entry.lastAccessedAt = Date.now();
    this.stats.hits++;

    return entry.value as T;
  }

  /** 写入缓存 */
  set(
    toolName: string,
    params: Record<string, unknown>,
    value: unknown,
    ttlMs?: number
  ): void {
    const key = this.generateKey(toolName, params);
    const effectiveTtl =
      ttlMs ??
      this.config.toolTtlOverrides?.[toolName] ??
      this.config.defaultTtlMs;

    // 容量检查，必要时淘汰
    if (this.cache.size >= this.config.maxEntries && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      key,
      value,
      createdAt: Date.now(),
      ttlMs: effectiveTtl,
      accessCount: 0,
      lastAccessedAt: Date.now(),
    });
  }

  /** LRU 淘汰策略 */
  private evictLRU(): void {
    let oldest: CacheEntry | null = null;
    for (const entry of this.cache.values()) {
      if (!oldest || entry.lastAccessedAt < oldest.lastAccessedAt) {
        oldest = entry;
      }
    }
    if (oldest) {
      this.cache.delete(oldest.key);
      this.stats.evictions++;
    }
  }

  /** 使特定工具的所有缓存失效 */
  invalidateTool(toolName: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${toolName}:`)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /** 清空全部缓存 */
  clear(): void {
    this.cache.clear();
  }

  /** 获取缓存统计 */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(1)
      : '0.0';
    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      size: this.cache.size,
      maxSize: this.config.maxEntries,
    };
  }
}
```

### 6.5.6 重试策略

不同的失败场景需要不同的重试策略。临时网络问题可以立即重试，而限流错误则需要指数退避。

```typescript
// ---- 重试策略：为不同失败场景选择合适的重试方式 ----

type RetryStrategy = 'immediate' | 'fixed' | 'exponential' | 'exponential_jitter';

interface RetryConfig {
  strategy: RetryStrategy;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** 判断是否值得重试的函数 */
  retryable?: (error: unknown) => boolean;
}

/** 预定义的常用重试配置 */
const RETRY_PRESETS: Record<string, RetryConfig> = {
  /** 网络抖动：快速重试 */
  network: {
    strategy: 'exponential_jitter',
    maxAttempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 5_000,
    retryable: (err) => {
      const msg = String(err).toLowerCase();
      return msg.includes('timeout') ||
             msg.includes('econnrefused') ||
             msg.includes('network');
    },
  },
  /** 限流：慢速退避 */
  rateLimit: {
    strategy: 'exponential',
    maxAttempts: 5,
    baseDelayMs: 2_000,
    maxDelayMs: 60_000,
    retryable: (err) => {
      const msg = String(err);
      return msg.includes('429') || msg.includes('rate limit');
    },
  },
  /** 幂等操作：固定间隔 */
  idempotent: {
    strategy: 'fixed',
    maxAttempts: 3,
    baseDelayMs: 1_000,
    maxDelayMs: 1_000,
  },
};

class ToolRetryPolicy {
  constructor(private config: RetryConfig) {}

  /**
   * 带重试逻辑执行函数
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // 检查是否值得重试
        if (this.config.retryable && !this.config.retryable(error)) {
          throw error; // 不可重试的错误，直接抛出
        }

        if (attempt < this.config.maxAttempts) {
          const delay = this.calculateDelay(attempt);
          console.log(
            `[重试] 第 ${attempt}/${this.config.maxAttempts} 次失败，` +
            `${delay}ms 后重试。错误: ${String(error)}`
          );
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /** 根据策略计算延迟时间 */
  private calculateDelay(attempt: number): number {
    let delay: number;

    switch (this.config.strategy) {
      case 'immediate':
        delay = 0;
        break;

      case 'fixed':
        delay = this.config.baseDelayMs;
        break;

      case 'exponential':
        // 2^(attempt-1) * baseDelay
        delay = Math.pow(2, attempt - 1) * this.config.baseDelayMs;
        break;

      case 'exponential_jitter':
        // 指数退避 + 随机抖动，避免惊群效应
        const expDelay = Math.pow(2, attempt - 1) * this.config.baseDelayMs;
        delay = expDelay * (0.5 + Math.random() * 0.5);
        break;

      default:
        delay = this.config.baseDelayMs;
    }

    return Math.min(delay, this.config.maxDelayMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

> **编排组合实践**：在生产环境中，熔断器、缓存和重试通常组合使用。典型的调用链路为：`缓存查询 → 重试包装 → 熔断器保护 → 实际工具调用`。这种分层设计让每一层专注于自己的职责，组合后提供了强大的容错能力。


## 6.6 工具测试与质量保障

工具是 Agent 与外部世界交互的桥梁，一个有 bug 的工具可能导致 Agent 执行整条链路的失败。本节介绍如何系统性地测试工具。

### 6.6.1 工具 Mock 框架

测试 Agent 工具链时，我们不希望真正调用外部 API。Mock 框架让我们可以模拟各种响应场景。

```typescript
// ---- 工具 Mock 框架：模拟工具行为用于测试 ----

/** Mock 响应定义 */
interface MockResponse {
  output: unknown;
  /** 模拟延迟（毫秒） */
  delayMs?: number;
  /** 模拟错误 */
  error?: string;
  /** 调用次数限制，超过后回退到默认行为 */
  times?: number;
}

/** Mock 调用记录 */
interface MockCallRecord {
  toolName: string;
  params: Record<string, unknown>;
  timestamp: number;
  responseIndex: number;
}

class ToolMocker {
  private mocks = new Map<string, MockResponse[]>();
  private callCounts = new Map<string, number>();
  private callRecords: MockCallRecord[] = [];

  /** 注册 mock 响应 */
  when(toolName: string): MockBuilder {
    return new MockBuilder(this, toolName);
  }

  /** 内部方法：添加 mock 定义 */
  addMock(toolName: string, response: MockResponse): void {
    const existing = this.mocks.get(toolName) ?? [];
    existing.push(response);
    this.mocks.set(toolName, existing);
  }

  /** 执行 mock 调用 */
  async call(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const count = this.callCounts.get(toolName) ?? 0;
    this.callCounts.set(toolName, count + 1);

    const responses = this.mocks.get(toolName);
    if (!responses || responses.length === 0) {
      throw new Error(
        `[ToolMocker] 未找到工具 "${toolName}" 的 mock 定义。` +
        `已注册的工具: [${[...this.mocks.keys()].join(', ')}]`
      );
    }

    // 选择响应：按序消费，超过 times 则使用最后一个
    let responseIndex = Math.min(count, responses.length - 1);
    let response = responses[responseIndex];

    // 检查 times 限制
    if (response.times !== undefined && count >= response.times) {
      responseIndex = Math.min(responseIndex + 1, responses.length - 1);
      response = responses[responseIndex];
    }

    // 记录调用
    this.callRecords.push({
      toolName,
      params: structuredClone(params),
      timestamp: Date.now(),
      responseIndex,
    });

    // 模拟延迟
    if (response.delayMs) {
      await new Promise((r) => setTimeout(r, response.delayMs));
    }

    // 模拟错误
    if (response.error) {
      throw new Error(response.error);
    }

    return structuredClone(response.output);
  }

  /** 验证工具被调用的情况 */
  verify(toolName: string): MockVerifier {
    return new MockVerifier(this.callRecords, toolName);
  }

  /** 重置所有 mock */
  reset(): void {
    this.mocks.clear();
    this.callCounts.clear();
    this.callRecords.length = 0;
  }

  /** 获取所有调用记录 */
  getCallRecords(): readonly MockCallRecord[] {
    return this.callRecords;
  }
}

/** 链式 API 构建 mock 响应 */
class MockBuilder {
  private response: Partial<MockResponse> = {};

  constructor(
    private mocker: ToolMocker,
    private toolName: string
  ) {}

  /** 设定返回值 */
  thenReturn(output: unknown): MockBuilder {
    this.response.output = output;
    return this;
  }

  /** 设定抛出错误 */
  thenThrow(error: string): MockBuilder {
    this.response.error = error;
    return this;
  }

  /** 设定模拟延迟 */
  withDelay(ms: number): MockBuilder {
    this.response.delayMs = ms;
    return this;
  }

  /** 限制此响应的使用次数 */
  times(n: number): MockBuilder {
    this.response.times = n;
    return this;
  }

  /** 完成构建，注册到 mocker */
  build(): ToolMocker {
    this.mocker.addMock(this.toolName, this.response as MockResponse);
    return this.mocker;
  }
}

/** 验证工具调用情况 */
class MockVerifier {
  private relevantRecords: MockCallRecord[];

  constructor(allRecords: MockCallRecord[], toolName: string) {
    this.relevantRecords = allRecords.filter(r => r.toolName === toolName);
  }

  /** 验证调用次数 */
  calledTimes(expected: number): MockVerifier {
    const actual = this.relevantRecords.length;
    if (actual !== expected) {
      throw new Error(
        `[MockVerifier] 期望调用 ${expected} 次，实际 ${actual} 次`
      );
    }
    return this;
  }

  /** 验证至少调用了一次 */
  calledAtLeastOnce(): MockVerifier {
    if (this.relevantRecords.length === 0) {
      throw new Error('[MockVerifier] 期望至少调用 1 次，实际 0 次');
    }
    return this;
  }

  /** 验证从未调用 */
  neverCalled(): MockVerifier {
    if (this.relevantRecords.length > 0) {
      throw new Error(
        `[MockVerifier] 期望从未调用，实际调用了 ${this.relevantRecords.length} 次`
      );
    }
    return this;
  }

  /** 验证第 N 次调用的参数 */
  calledWith(
    callIndex: number,
    matcher: (params: Record<string, unknown>) => boolean
  ): MockVerifier {
    if (callIndex >= this.relevantRecords.length) {
      throw new Error(
        `[MockVerifier] 无法验证第 ${callIndex} 次调用，` +
        `总共只调用了 ${this.relevantRecords.length} 次`
      );
    }
    const record = this.relevantRecords[callIndex];
    if (!matcher(record.params)) {
      throw new Error(
        `[MockVerifier] 第 ${callIndex} 次调用参数不匹配: ` +
        JSON.stringify(record.params)
      );
    }
    return this;
  }
}
```

**使用示例**

```typescript
// 设置 mock
const mocker = new ToolMocker();

mocker.when('github_search_issues')
  .thenReturn({ issues: [{ id: 1, title: 'Bug report' }] })
  .build();

mocker.when('github_create_comment')
  .thenReturn({ commentId: 42 })
  .withDelay(100) // 模拟网络延迟
  .build();

// 第一次调用成功，第二次模拟限流
mocker.when('slack_send_message')
  .thenReturn({ ok: true })
  .times(1) // 只对前 1 次调用有效
  .build();

mocker.when('slack_send_message')
  .thenThrow('429 Rate Limited')
  .build();

// 执行被测试的 Agent 逻辑
await agentWorkflow(mocker); // mocker 作为 ToolExecutor 注入

// 验证行为
mocker.verify('github_search_issues').calledTimes(1);
mocker.verify('github_create_comment').calledAtLeastOnce();
mocker.verify('slack_send_message').calledTimes(2);
```

### 6.6.2 Schema 快照测试

工具的 JSON Schema 是 Agent 的"API 契约"。任何不经意的 Schema 变更都可能导致 Agent 行为异常。快照测试可以在 CI 中自动捕获这些变更。

```typescript
// ---- Schema 快照测试：捕获不经意的契约变更 ----

interface SchemaSnapshot {
  toolName: string;
  schema: Record<string, unknown>;
  hash: string;
  timestamp: number;
}

class SchemaSnapshotTester {
  private snapshots = new Map<string, SchemaSnapshot>();

  constructor(private snapshotDir: string) {}

  /**
   * 对比当前 Schema 与快照
   * @returns 差异列表，空数组表示无变更
   */
  async testTool(
    toolName: string,
    currentSchema: Record<string, unknown>
  ): Promise<SchemaDiff[]> {
    const currentHash = this.hashSchema(currentSchema);
    const snapshot = this.snapshots.get(toolName);

    if (!snapshot) {
      // 新工具，创建初始快照
      this.snapshots.set(toolName, {
        toolName,
        schema: currentSchema,
        hash: currentHash,
        timestamp: Date.now(),
      });
      return [{ type: 'new_tool', toolName, details: '首次快照' }];
    }

    if (snapshot.hash === currentHash) {
      return []; // 无变更
    }

    // 检测具体差异
    return this.diffSchemas(toolName, snapshot.schema, currentSchema);
  }

  /** 深度对比两个 Schema，返回结构化差异 */
  private diffSchemas(
    toolName: string,
    old: Record<string, unknown>,
    current: Record<string, unknown>,
    path: string = ''
  ): SchemaDiff[] {
    const diffs: SchemaDiff[] = [];
    const allKeys = new Set([
      ...Object.keys(old),
      ...Object.keys(current),
    ]);

    for (const key of allKeys) {
      const fullPath = path ? `${path}.${key}` : key;
      const oldVal = old[key];
      const curVal = current[key];

      if (oldVal === undefined) {
        diffs.push({
          type: 'added',
          toolName,
          details: `新增字段: ${fullPath}`,
          severity: this.assessSeverity('added', fullPath),
        });
      } else if (curVal === undefined) {
        diffs.push({
          type: 'removed',
          toolName,
          details: `移除字段: ${fullPath}`,
          severity: this.assessSeverity('removed', fullPath),
        });
      } else if (typeof oldVal !== typeof curVal) {
        diffs.push({
          type: 'type_changed',
          toolName,
          details: `类型变更: ${fullPath} (${typeof oldVal} → ${typeof curVal})`,
          severity: 'breaking',
        });
      } else if (
        typeof oldVal === 'object' &&
        oldVal !== null &&
        typeof curVal === 'object' &&
        curVal !== null
      ) {
        // 递归对比嵌套对象
        diffs.push(
          ...this.diffSchemas(
            toolName,
            oldVal as Record<string, unknown>,
            curVal as Record<string, unknown>,
            fullPath
          )
        );
      } else if (oldVal !== curVal) {
        diffs.push({
          type: 'value_changed',
          toolName,
          details: `值变更: ${fullPath}`,
          severity: this.assessSeverity('value_changed', fullPath),
        });
      }
    }

    return diffs;
  }

  /** 评估变更的严重程度 */
  private assessSeverity(
    changeType: string,
    path: string
  ): 'breaking' | 'warning' | 'info' {
    // 必填参数被移除 → 破坏性变更
    if (changeType === 'removed' && path.includes('required')) {
      return 'breaking';
    }
    // 参数类型变更 → 破坏性
    if (changeType === 'type_changed') return 'breaking';
    // 新增必填参数 → 警告
    if (changeType === 'added' && path.includes('required')) {
      return 'warning';
    }
    return 'info';
  }

  /** 更新快照（在确认变更合理后调用） */
  updateSnapshot(toolName: string, schema: Record<string, unknown>): void {
    this.snapshots.set(toolName, {
      toolName,
      schema,
      hash: this.hashSchema(schema),
      timestamp: Date.now(),
    });
  }

  private hashSchema(schema: Record<string, unknown>): string {
    // 简化的哈希实现，生产环境使用 crypto
    const str = JSON.stringify(schema, Object.keys(schema).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转为 32 位整数
    }
    return hash.toString(16);
  }
}

interface SchemaDiff {
  type: 'new_tool' | 'added' | 'removed' | 'type_changed' | 'value_changed';
  toolName: string;
  details: string;
  severity?: 'breaking' | 'warning' | 'info';
}
```

### 6.6.3 工具链集成测试

单个工具测试通过不代表工具链能正常工作。集成测试验证多个工具按预期顺序和数据流协作。

```typescript
// ---- 工具链集成测试运行器 ----

interface ChainTestCase {
  name: string;
  description: string;
  /** 测试步骤 */
  steps: ChainTestStep[];
  /** 全局断言：在所有步骤完成后执行 */
  globalAssertions?: (context: StepContext) => void;
}

interface ChainTestStep {
  toolName: string;
  params: Record<string, unknown> | ((ctx: StepContext) => Record<string, unknown>);
  /** 单步断言 */
  assertions?: (output: unknown, ctx: StepContext) => void;
  /** 期望失败（测试错误处理路径） */
  expectError?: boolean | string;
}

interface ChainTestResult {
  testName: string;
  passed: boolean;
  duration: number;
  stepResults: Array<{
    toolName: string;
    passed: boolean;
    error?: string;
  }>;
}

class ToolChainTestRunner {
  constructor(private executor: ToolExecutor) {}

  /** 运行单个测试用例 */
  async runTest(testCase: ChainTestCase): Promise<ChainTestResult> {
    const startTime = Date.now();
    const context: StepContext = {
      results: new Map(),
      globals: {},
    };
    const stepResults: ChainTestResult['stepResults'] = [];

    console.log(`\n[测试] 运行: ${testCase.name}`);
    console.log(`  描述: ${testCase.description}`);

    for (const step of testCase.steps) {
      const params = typeof step.params === 'function'
        ? step.params(context)
        : step.params;

      try {
        const output = await this.executor.call(step.toolName, params);

        if (step.expectError) {
          // 期望失败但成功了
          stepResults.push({
            toolName: step.toolName,
            passed: false,
            error: '期望抛出错误但执行成功',
          });
          break;
        }

        // 执行单步断言
        if (step.assertions) {
          try {
            step.assertions(output, context);
          } catch (assertionError) {
            stepResults.push({
              toolName: step.toolName,
              passed: false,
              error: `断言失败: ${String(assertionError)}`,
            });
            break;
          }
        }

        context.results.set(step.toolName, {
          stepId: step.toolName,
          toolName: step.toolName,
          output,
          durationMs: 0,
          status: 'success',
        });

        stepResults.push({ toolName: step.toolName, passed: true });
      } catch (error) {
        if (step.expectError) {
          // 期望的错误
          if (typeof step.expectError === 'string' &&
              !String(error).includes(step.expectError)) {
            stepResults.push({
              toolName: step.toolName,
              passed: false,
              error: `错误信息不匹配: 期望包含 "${step.expectError}"，实际: "${String(error)}"`,
            });
            break;
          }
          stepResults.push({ toolName: step.toolName, passed: true });
        } else {
          stepResults.push({
            toolName: step.toolName,
            passed: false,
            error: String(error),
          });
          break;
        }
      }
    }

    // 全局断言
    let globalPassed = true;
    if (testCase.globalAssertions) {
      try {
        testCase.globalAssertions(context);
      } catch (error) {
        globalPassed = false;
        stepResults.push({
          toolName: '[全局断言]',
          passed: false,
          error: String(error),
        });
      }
    }

    const allPassed = globalPassed && stepResults.every((r) => r.passed);
    const result: ChainTestResult = {
      testName: testCase.name,
      passed: allPassed,
      duration: Date.now() - startTime,
      stepResults,
    };

    // 输出结果
    const icon = allPassed ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${testCase.name} (${result.duration}ms)`);
    if (!allPassed) {
      for (const sr of stepResults.filter(r => !r.passed)) {
        console.log(`    - ${sr.toolName}: ${sr.error}`);
      }
    }

    return result;
  }

  /** 批量运行测试套件 */
  async runSuite(
    tests: ChainTestCase[]
  ): Promise<{ passed: number; failed: number; results: ChainTestResult[] }> {
    const results: ChainTestResult[] = [];
    let passed = 0;
    let failed = 0;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`工具链集成测试 — 共 ${tests.length} 个用例`);
    console.log('='.repeat(60));

    for (const test of tests) {
      const result = await this.runTest(test);
      results.push(result);
      if (result.passed) passed++;
      else failed++;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
    console.log('='.repeat(60));

    return { passed, failed, results };
  }
}
```

### 6.6.4 工具性能基准测试

```typescript
// ---- 工具性能基准测试 ----

interface BenchmarkResult {
  toolName: string;
  iterations: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  errorRate: number;
}

class ToolBenchmark {
  /**
   * 对指定工具进行性能基准测试
   * @param executor - 工具执行器
   * @param toolName - 工具名称
   * @param params - 测试参数
   * @param iterations - 迭代次数
   * @param warmup - 预热次数（不计入统计）
   */
  async run(
    executor: ToolExecutor,
    toolName: string,
    params: Record<string, unknown>,
    iterations: number = 100,
    warmup: number = 10
  ): Promise<BenchmarkResult> {
    // 预热
    for (let i = 0; i < warmup; i++) {
      try { await executor.call(toolName, params); } catch {}
    }

    // 正式测试
    const durations: number[] = [];
    let errors = 0;

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      try {
        await executor.call(toolName, params);
      } catch {
        errors++;
      }
      durations.push(performance.now() - start);
    }

    // 计算统计数据
    durations.sort((a, b) => a - b);
    const sum = durations.reduce((s, d) => s + d, 0);

    return {
      toolName,
      iterations,
      avgMs: Math.round(sum / durations.length * 100) / 100,
      minMs: Math.round(durations[0] * 100) / 100,
      maxMs: Math.round(durations[durations.length - 1] * 100) / 100,
      p50Ms: Math.round(this.percentile(durations, 50) * 100) / 100,
      p95Ms: Math.round(this.percentile(durations, 95) * 100) / 100,
      p99Ms: Math.round(this.percentile(durations, 99) * 100) / 100,
      errorRate: Math.round(errors / iterations * 10000) / 100,
    };
  }

  /** 格式化输出基准测试结果 */
  formatReport(results: BenchmarkResult[]): string {
    const header = [
      '工具名称'.padEnd(30),
      'avg(ms)'.padStart(10),
      'p50(ms)'.padStart(10),
      'p95(ms)'.padStart(10),
      'p99(ms)'.padStart(10),
      '错误率'.padStart(8),
    ].join(' | ');

    const separator = '-'.repeat(header.length);

    const rows = results.map((r) =>
      [
        r.toolName.padEnd(30),
        r.avgMs.toFixed(2).padStart(10),
        r.p50Ms.toFixed(2).padStart(10),
        r.p95Ms.toFixed(2).padStart(10),
        r.p99Ms.toFixed(2).padStart(10),
        `${r.errorRate}%`.padStart(8),
      ].join(' | ')
    );

    return [header, separator, ...rows].join('\n');
  }

  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}
```


## 6.7 实战：DevOps Agent 工具集

本节将前面所有概念融合为一个完整的实战案例——构建一个 DevOps Agent 的工具集。该 Agent 能够自动化处理从代码管理到部署监控的完整流程。

### 6.7.1 GitHub 工具集

```typescript
// ---- DevOps 实战：GitHub 工具集 ----

interface GitHubConfig {
  token: string;
  baseUrl: string;
  defaultOwner: string;
}

/**
 * GitHub 工具集
 * 遵循 ACI 命名：github_<verb>_<object>
 * 工具复杂度均为 L1 或 L2
 */
class GitHubToolkit {
  constructor(private config: GitHubConfig) {}

  /** 获取工具定义列表，用于注册到工具注册表 */
  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'github_search_issues',
        description: [
          'WHAT: 在 GitHub 仓库中搜索 Issue 和 PR。',
          'WHEN: 需要查找特定问题、了解项目状态、检索历史讨论时使用。',
          'RETURNS: Issue 列表，包含标题、状态、标签、负责人。最多返回 30 条。',
        ].join('\n'),
        parameters: {
          type: 'object' as const,
          properties: {
            repo: {
              type: 'string',
              description: '仓库名称，格式: owner/repo（如省略 owner 则使用默认）',
            },
            query: {
              type: 'string',
              description: '搜索关键词，支持 GitHub 搜索语法（如 "is:open label:bug"）',
            },
            state: {
              type: 'string',
              enum: ['open', 'closed', 'all'],
              description: 'Issue 状态过滤，默认 open',
            },
            limit: {
              type: 'number',
              description: '返回数量上限，默认 10，最大 30',
            },
          },
          required: ['repo', 'query'],
        },
      },
      {
        name: 'github_create_issue',
        description: [
          'WHAT: 在 GitHub 仓库中创建新 Issue。此操作会写入数据。',
          'WHEN: 需要记录 bug、提出功能请求、创建任务跟踪时使用。',
          'RETURNS: 新 Issue 的编号、URL 和创建状态。',
        ].join('\n'),
        parameters: {
          type: 'object' as const,
          properties: {
            repo: { type: 'string', description: '仓库名称（owner/repo）' },
            title: { type: 'string', description: 'Issue 标题（5-200 字符）' },
            body: { type: 'string', description: 'Issue 正文，支持 Markdown' },
            labels: {
              type: 'array',
              items: { type: 'string' },
              description: '标签列表（如 ["bug", "priority:high"]）',
            },
            assignees: {
              type: 'array',
              items: { type: 'string' },
              description: '负责人 GitHub 用户名列表',
            },
          },
          required: ['repo', 'title'],
        },
      },
      {
        name: 'github_get_pr_diff',
        description: [
          'WHAT: 获取 Pull Request 的代码变更摘要。只读操作。',
          'WHEN: 需要审查代码变更、了解 PR 影响范围时使用。',
          'RETURNS: 变更文件列表、新增/删除行数、核心 diff 片段。大型 PR 会自动截断。',
        ].join('\n'),
        parameters: {
          type: 'object' as const,
          properties: {
            repo: { type: 'string', description: '仓库名称（owner/repo）' },
            pr_number: { type: 'number', description: 'PR 编号' },
            max_files: {
              type: 'number',
              description: '最多返回的文件数，默认 20',
            },
          },
          required: ['repo', 'pr_number'],
        },
      },
    ];
  }

  /** 搜索 Issues */
  async searchIssues(params: {
    repo: string;
    query: string;
    state?: string;
    limit?: number;
  }) {
    const { repo, query, state = 'open', limit = 10 } = params;
    const fullRepo = repo.includes('/') ? repo : `${this.config.defaultOwner}/${repo}`;
    const searchQuery = `repo:${fullRepo} ${query} state:${state}`;

    const response = await fetch(
      `${this.config.baseUrl}/search/issues?q=${encodeURIComponent(searchQuery)}&per_page=${Math.min(limit, 30)}`,
      { headers: this.getHeaders() }
    );

    if (!response.ok) {
      throw new Error(`GitHub API 错误: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as any;
    return {
      total_count: data.total_count,
      issues: (data.items ?? []).map((item: any) => ({
        number: item.number,
        title: item.title,
        state: item.state,
        labels: item.labels.map((l: any) => l.name),
        assignee: item.assignee?.login ?? null,
        created_at: item.created_at,
        url: item.html_url,
      })),
    };
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.token}`,
      Accept: 'application/vnd.github.v3+json',
    };
  }
}
```

### 6.7.2 Docker 工具集

```typescript
// ---- DevOps 实战：Docker 工具集 ----

interface DockerConfig {
  socketPath?: string;
  host?: string;
  registry?: string;
}

class DockerToolkit {
  constructor(private config: DockerConfig) {}

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'docker_build_image',
        description: [
          'WHAT: 构建 Docker 镜像。耗时操作，通常需要 1-10 分钟。',
          'WHEN: 代码变更后需要构建新镜像时使用。前置条件：代码已拉取到本地。',
          'RETURNS: 构建结果，包含镜像 ID、标签和构建耗时。构建失败时返回错误日志的最后 50 行。',
        ].join('\n'),
        parameters: {
          type: 'object' as const,
          properties: {
            context_path: {
              type: 'string',
              description: '构建上下文路径（包含 Dockerfile 的目录）',
            },
            tag: {
              type: 'string',
              description: '镜像标签，格式: name:version（如 "myapp:v1.2.3"）',
            },
            dockerfile: {
              type: 'string',
              description: 'Dockerfile 路径（相对于 context_path），默认 "Dockerfile"',
            },
            build_args: {
              type: 'object',
              description: '构建参数键值对（如 {"NODE_ENV": "production"}）',
            },
            no_cache: {
              type: 'boolean',
              description: '是否禁用构建缓存，默认 false',
            },
          },
          required: ['context_path', 'tag'],
        },
      },
      {
        name: 'docker_push_image',
        description: [
          'WHAT: 推送 Docker 镜像到远程仓库。需要仓库写入权限。',
          'WHEN: 镜像构建完成后，需要发布到 registry 供部署使用。',
          'RETURNS: 推送结果，包含完整的镜像地址（含 registry 前缀）和摘要。',
        ].join('\n'),
        parameters: {
          type: 'object' as const,
          properties: {
            image: { type: 'string', description: '本地镜像标签' },
            registry: {
              type: 'string',
              description: '目标 registry 地址（如省略则使用默认配置）',
            },
          },
          required: ['image'],
        },
      },
      {
        name: 'docker_list_containers',
        description: [
          'WHAT: 列出 Docker 容器及其状态。只读操作。',
          'WHEN: 需要查看运行中的服务、排查容器状态时使用。',
          'RETURNS: 容器列表，包含 ID、名称、镜像、状态、端口映射。',
        ].join('\n'),
        parameters: {
          type: 'object' as const,
          properties: {
            all: {
              type: 'boolean',
              description: '是否包含已停止的容器，默认 false',
            },
            filter_name: {
              type: 'string',
              description: '按名称过滤（支持通配符）',
            },
          },
          required: [],
        },
      },
    ];
  }
}
```

### 6.7.3 Kubernetes 工具集

```typescript
// ---- DevOps 实战：Kubernetes 工具集 ----

interface K8sConfig {
  kubeconfig?: string;
  context?: string;
  namespace?: string;
}

class K8sToolkit {
  constructor(private config: K8sConfig) {}

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'k8s_deploy_service',
        description: [
          'WHAT: 部署或更新 Kubernetes 服务。这是一个写入操作，会修改集群状态。',
          '执行滚动更新，整个过程可能需要 2-15 分钟。',
          'WHEN: 新版本镜像就绪后，需要部署到 K8s 集群时使用。',
          '前置条件：镜像已推送到 registry。',
          'RETURNS: 部署状态，包含 Deployment 名称、副本数、滚动更新进度。',
          '如果部署超时（默认 10 分钟），返回当前进度和 Pod 事件日志。',
        ].join('\n'),
        parameters: {
          type: 'object' as const,
          properties: {
            deployment: { type: 'string', description: 'Deployment 名称' },
            image: {
              type: 'string',
              description: '完整镜像地址（含 registry 和 tag）',
            },
            namespace: {
              type: 'string',
              description: '目标命名空间，默认使用配置中的命名空间',
            },
            replicas: {
              type: 'number',
              description: '副本数量（不指定则保持当前值）',
            },
            env_vars: {
              type: 'object',
              description: '环境变量键值对',
            },
            timeout_seconds: {
              type: 'number',
              description: '部署超时时间（秒），默认 600',
            },
          },
          required: ['deployment', 'image'],
        },
      },
      {
        name: 'k8s_get_pod_status',
        description: [
          'WHAT: 查看 Pod 运行状态和最近事件。只读操作。',
          'WHEN: 部署后验证服务健康、排查故障时使用。',
          'RETURNS: Pod 列表及其状态（Running/Pending/CrashLoopBackOff 等），',
          '每个 Pod 附带最近 10 条事件和容器重启次数。',
        ].join('\n'),
        parameters: {
          type: 'object' as const,
          properties: {
            selector: {
              type: 'string',
              description: '标签选择器（如 "app=myservice"）',
            },
            namespace: { type: 'string', description: '命名空间' },
          },
          required: ['selector'],
        },
      },
      {
        name: 'k8s_get_logs',
        description: [
          'WHAT: 获取 Pod 的容器日志。只读操作。',
          'WHEN: 排查应用错误、查看运行日志时使用。',
          'RETURNS: 日志文本（最多 500 行）。多容器 Pod 需指定容器名。',
        ].join('\n'),
        parameters: {
          type: 'object' as const,
          properties: {
            pod_name: { type: 'string', description: 'Pod 名称' },
            container: { type: 'string', description: '容器名称（多容器时必填）' },
            namespace: { type: 'string', description: '命名空间' },
            tail_lines: {
              type: 'number',
              description: '返回最后 N 行日志，默认 100',
            },
            since_seconds: {
              type: 'number',
              description: '只返回最近 N 秒的日志',
            },
          },
          required: ['pod_name'],
        },
      },
    ];
  }
}
```

### 6.7.4 监控告警工具集

```typescript
// ---- DevOps 实战：监控告警工具集 ----

class MonitoringToolkit {
  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'monitor_query_metrics',
        description: [
          'WHAT: 查询 Prometheus 格式的监控指标。只读操作。',
          'WHEN: 需要查看系统性能指标（CPU/内存/QPS/延迟等）时使用。',
          'RETURNS: 时间序列数据点列表，每个数据点包含时间戳和值。',
          '查询时间范围过大时会自动降采样。',
        ].join('\n'),
        parameters: {
          type: 'object' as const,
          properties: {
            query: {
              type: 'string',
              description: 'PromQL 查询表达式（如 "rate(http_requests_total[5m])"）',
            },
            start: { type: 'string', description: '起始时间（ISO 8601 或相对时间如 "-1h"）' },
            end: { type: 'string', description: '结束时间，默认为当前时间' },
            step: { type: 'string', description: '数据点间隔（如 "15s", "1m", "5m"）' },
          },
          required: ['query'],
        },
      },
      {
        name: 'monitor_list_alerts',
        description: [
          'WHAT: 获取当前活跃的告警列表。只读操作。',
          'WHEN: 巡检系统状态、响应告警通知时使用。',
          'RETURNS: 活跃告警列表，按严重程度排序（critical > warning > info）。',
          '每条告警包含名称、级别、触发时间、影响的服务。',
        ].join('\n'),
        parameters: {
          type: 'object' as const,
          properties: {
            severity: {
              type: 'string',
              enum: ['critical', 'warning', 'info', 'all'],
              description: '严重程度过滤，默认 all',
            },
            service: {
              type: 'string',
              description: '服务名称过滤',
            },
          },
          required: [],
        },
      },
    ];
  }
}
```

### 6.7.5 完整部署工作流

将所有工具集组合为一个完整的部署工作流：

```typescript
// ---- 完整部署工作流：集成所有工具集 ----

class DeploymentWorkflow {
  private orchestrator: ToolOrchestrator;
  private circuitBreakers = new Map<string, ToolCircuitBreaker>();
  private cache: ToolCache;

  constructor(executor: ToolExecutor) {
    this.orchestrator = new ToolOrchestrator(executor);
    this.cache = new ToolCache({
      maxEntries: 100,
      defaultTtlMs: 60_000,
      toolTtlOverrides: {
        'monitor_query_metrics': 30_000,   // 监控数据缓存 30s
        'github_search_issues': 120_000,   // Issue 搜索缓存 2min
      },
    });

    // 为外部工具配置熔断器
    const breakerConfig: CircuitBreakerConfig = {
      failureThreshold: 3,
      resetTimeoutMs: 30_000,
      halfOpenMaxAttempts: 1,
    };
    this.circuitBreakers.set('github', new ToolCircuitBreaker('github', breakerConfig));
    this.circuitBreakers.set('docker', new ToolCircuitBreaker('docker', breakerConfig));
    this.circuitBreakers.set('k8s', new ToolCircuitBreaker('k8s', breakerConfig));
  }

  /**
   * 执行完整部署流程
   * 1. 拉取代码并运行测试（串行）
   * 2. 构建并推送镜像（串行）
   * 3. 部署到 staging + 通知（并行）
   * 4. Smoke test
   * 5. 部署到 production
   * 6. 监控验证 + 通知（并行）
   */
  async deploy(params: {
    repo: string;
    branch: string;
    version: string;
  }) {
    const { repo, branch, version } = params;
    const imageTag = `${repo}:${version}`;

    console.log(`[部署] 开始部署 ${repo}@${branch} -> ${version}`);

    const steps: OrchestrationStep[][] = [
      // Stage 1: 代码 + 测试
      [{
        id: 'pull-code',
        toolName: 'github_pull_repo',
        paramsFn: () => ({ repo, branch }),
      }],
      [{
        id: 'run-tests',
        toolName: 'ci_run_tests',
        paramsFn: (ctx) => ({
          codeDir: (ctx.results.get('pull-code')?.output as any)?.dir,
        }),
      }],
      // Stage 2: 构建 + 推送
      [{
        id: 'build-image',
        toolName: 'docker_build_image',
        paramsFn: (ctx) => ({
          context_path: (ctx.results.get('pull-code')?.output as any)?.dir,
          tag: imageTag,
          build_args: { VERSION: version },
        }),
        timeout: 600_000, // 构建可能需要较长时间
      }],
      [{
        id: 'push-image',
        toolName: 'docker_push_image',
        paramsFn: () => ({ image: imageTag }),
      }],
      // Stage 3: 部署 staging + 通知（并行）
      [
        {
          id: 'deploy-staging',
          toolName: 'k8s_deploy_service',
          paramsFn: () => ({
            deployment: repo,
            image: imageTag,
            namespace: 'staging',
          }),
          timeout: 300_000,
        },
        {
          id: 'notify-staging',
          toolName: 'slack_send_message',
          paramsFn: () => ({
            channel: '#deployments',
            text: `🚀 部署 ${repo} ${version} 到 staging 中...`,
          }),
        },
      ],
      // Stage 4: Smoke test
      [{
        id: 'smoke-test',
        toolName: 'ci_smoke_test',
        paramsFn: () => ({
          endpoint: `https://staging.${repo}.internal/health`,
          timeout: 30,
        }),
      }],
      // Stage 5: 部署 production
      [{
        id: 'deploy-prod',
        toolName: 'k8s_deploy_service',
        paramsFn: () => ({
          deployment: repo,
          image: imageTag,
          namespace: 'production',
        }),
        timeout: 600_000,
        // 只有 smoke test 通过才继续
        condition: (ctx) => ctx.results.get('smoke-test')?.status === 'success',
      }],
      // Stage 6: 监控验证 + 通知（并行）
      [
        {
          id: 'verify-health',
          toolName: 'monitor_query_metrics',
          paramsFn: () => ({
            query: `up{app="${repo}", env="production"}`,
            start: '-5m',
          }),
        },
        {
          id: 'notify-complete',
          toolName: 'slack_send_message',
          paramsFn: (ctx) => {
            const success = ctx.results.get('deploy-prod')?.status === 'success';
            return {
              channel: '#deployments',
              text: success
                ? `✅ ${repo} ${version} 部署成功！`
                : `❌ ${repo} ${version} 部署失败，请检查。`,
            };
          },
        },
      ],
    ];

    const results = await this.orchestrator.pipeline(steps);
    return this.formatDeploymentReport(results, params);
  }

  /** 生成部署报告 */
  private formatDeploymentReport(
    stageResults: StepResult[][],
    params: { repo: string; branch: string; version: string }
  ): string {
    const lines: string[] = [
      `# 部署报告`,
      `- 仓库: ${params.repo}`,
      `- 分支: ${params.branch}`,
      `- 版本: ${params.version}`,
      `- 时间: ${new Date().toISOString()}`,
      '',
      '## 执行阶段',
    ];

    const stageNames = [
      '拉取代码', '运行测试', '构建镜像',
      '推送镜像', '部署 Staging', 'Smoke 测试',
      '部署 Production', '验证 & 通知',
    ];

    let stageIdx = 0;
    for (const stage of stageResults) {
      for (const result of stage) {
        const icon = result.status === 'success' ? '[OK]'
          : result.status === 'skipped' ? '[SKIP]'
          : '[FAIL]';
        lines.push(
          `${icon} ${stageNames[stageIdx] ?? result.stepId} ` +
          `(${result.toolName}, ${result.durationMs}ms)`
        );
        stageIdx++;
      }
    }

    const allResults = stageResults.flat();
    const success = allResults.every(
      r => r.status === 'success' || r.status === 'skipped'
    );
    lines.push('', `## 最终状态: ${success ? '部署成功' : '部署失败'}`);

    return lines.join('\n');
  }
}
```

---

## 6.8 本章小结

本章系统性地介绍了 Agent 工具系统的设计方法论。以下是核心要点回顾：

### 设计原则速查表

| 原则 | 核心思想 | 关键实践 |
|------|---------|---------|
| ACI 优先 | 工具接口为 LLM 设计，而非为人类设计 | 限制名称长度、控制参数数量、优化 token 成本 |
| 三段式描述 | WHAT + WHEN + RETURNS | 每个描述回答三个关键问题，消除歧义 |
| 防呆设计 | 预防错误而非事后补救 | 参数校验、速率限制、输出截断、成本控制 |
| 最小权限 | 工具只拥有必要的权限 | RBAC 模型、操作审计、沙箱执行 |

### 技术栈选型建议

| 场景 | 推荐方案 | 理由 |
|------|---------|------|
| 工具协议 | MCP (Model Context Protocol) | 标准化、跨语言、支持动态发现 |
| 进程内工具 | 直接函数调用 + Schema 验证 | 低延迟、类型安全 |
| 远程工具 | MCP over SSE/WebSocket | 支持流式、重连、多路复用 |
| 工具编排 | DAG 执行器 | 自动并行化、依赖管理、可视化 |
| 容错处理 | 熔断器 + 指数退避重试 | 保护下游服务、避免级联故障 |
| 测试策略 | Mock 框架 + Schema 快照 | 隔离外部依赖、捕获契约变更 |

### 复杂度管理矩阵

| 工具复杂度 | 参数数量 | 嵌套层数 | 建议 |
|-----------|---------|---------|------|
| L1 简单 | 1-3 | 0 | 直接使用 |
| L2 复合 | 4-8 | 1 | 提供参数默认值和示例 |
| L3 组合 | 8+ | 2+ | 拆分为多个 L1/L2 工具 |

### 下一步建议

1. **从小处开始**：先为最高频的 3-5 个工具应用 ACI 规范，观察 Agent 准确率提升
2. **逐步引入防呆**：从参数校验开始，逐步添加速率限制和成本控制
3. **标准化协议**：采用 MCP 作为工具集成的统一协议，降低接入成本
4. **持续测试**：将 Schema 快照测试集成到 CI/CD，防止无意的契约破坏
5. **监控先行**：为工具调用添加审计日志和性能指标，用数据驱动优化

> **核心理念**：工具系统的质量直接决定了 Agent 的能力上限。好的工具设计不是让工具"能用"，而是让 Agent "好用"——减少歧义、预防错误、优雅容错。这就是 ACI 设计哲学的精髓。

