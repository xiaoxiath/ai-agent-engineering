# 第25章：实战案例——数据分析 Agent

> "The goal is to turn data into information, and information into insight." —— Carly Fiorina

## 25.1 项目概述

数据分析 Agent 让非技术用户能够通过自然语言查询和分析数据。它需要理解用户意图、生成正确的查询语句、执行分析并以直观的方式呈现结果。

### 25.1.1 核心能力

```
用户输入: "上个月华北区销售额同比增长了多少？环比呢？"
    ↓
┌─────────────────────────────┐
│  1. 意图解析                │ → 同比/环比计算
│  2. 时间范围推断             │ → 上个月 = 2024-12
│  3. SQL 生成                │ → 生成2条查询
│  4. 结果计算                │ → 同比+18%, 环比-5%
│  5. 可视化推荐              │ → 柱状对比图
│  6. 洞察总结                │ → 自然语言解释
└─────────────────────────────┘
```

## 25.2 Text-to-SQL 引擎

### 25.2.1 Schema 感知的 SQL 生成

```typescript
interface DatabaseSchema {
  tables: TableDefinition[];
  relationships: Relationship[];
  commonQueries: QueryTemplate[];
  businessGlossary: Record<string, string>;
}

class TextToSQLEngine {
  private model: LLMClient;
  private schema: DatabaseSchema;
  private queryValidator: SQLValidator;
  
  async generateSQL(
    question: string,
    context?: AnalysisContext
  ): Promise<SQLResult> {
    // 1. 业务术语映射
    const normalizedQuestion = this.mapBusinessTerms(question);
    
    // 2. 识别相关表
    const relevantTables = await this.identifyRelevantTables(normalizedQuestion);
    
    // 3. 生成 SQL
    const prompt = `
## Database Schema
${this.formatSchemaForPrompt(relevantTables)}

## Business Glossary
${Object.entries(this.schema.businessGlossary).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## Similar Query Examples
${this.findSimilarQueries(normalizedQuestion).map(q => `Q: ${q.question}\nSQL: ${q.sql}`).join('\n\n')}

## Question
${normalizedQuestion}

## Rules
- Use only tables and columns from the schema above
- Always include appropriate JOINs based on foreign keys
- Handle NULL values with COALESCE where needed
- Use CTEs for complex queries to improve readability
- Add meaningful column aliases

Generate the SQL query:
`;

    const sql = await this.model.generate(prompt);
    
    // 4. 验证和修正
    const validated = await this.queryValidator.validate(sql, relevantTables);
    if (!validated.isValid) {
      return this.retryWithFeedback(question, sql, validated.errors);
    }
    
    return { sql: validated.sql, explanation: validated.explanation, tables: relevantTables.map(t => t.name) };
  }
  
  private mapBusinessTerms(question: string): string {
    let mapped = question;
    for (const [term, definition] of Object.entries(this.schema.businessGlossary)) {
      mapped = mapped.replace(new RegExp(term, 'g'), `${term}(${definition})`);
    }
    return mapped;
  }
  
  private async identifyRelevantTables(question: string): Promise<TableDefinition[]> {
    const prompt = `Given these tables:\n${this.schema.tables.map(t => `${t.name}: ${t.columns.map(c => c.name).join(', ')}`).join('\n')}\n\nWhich tables are needed to answer: "${question}"?\nReturn table names as JSON array.`;
    const response = await this.llm.complete(prompt);
    try {
      const tableNames: string[] = JSON.parse(response);
      return this.schema.tables.filter(t => tableNames.includes(t.name));
    } catch {
      return this.schema.tables.slice(0, 3); // 回退：返回前 3 张表
    }
  }
  private formatSchemaForPrompt(tables: TableDefinition[]): string {
    return tables.map(t => {
      const cols = t.columns.map(c => `  ${c.name} ${c.type}${c.nullable ? ' NULL' : ' NOT NULL'} -- ${c.description}`);
      return `CREATE TABLE ${t.name} (\n${cols.join(',\n')}\n);`;
    }).join('\n\n');
  }
  
  private findSimilarQueries(question: string): QueryTemplate[] {
    const keywords = question.toLowerCase().split(/\s+/);
    return this.queryTemplates
      .map(t => ({ ...t, score: keywords.filter(k => t.description.toLowerCase().includes(k)).length }))
      .filter(t => t.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }
  private async retryWithFeedback(question: string, sql: string, errors: string[]): Promise<SQLResult> {
    const prompt = `The following SQL query failed:\n\`\`\`sql\n${sql}\n\`\`\`\nErrors: ${errors.join('; ')}\n\nOriginal question: "${question}"\n\nGenerate a corrected SQL query:`;
    const correctedSQL = await this.llm.complete(prompt);
    const cleanSQL = correctedSQL.replace(/\`\`\`sql\n?|\`\`\`/g, '').trim();
    return this.db.execute(cleanSQL);
  }
}
```

## 25.3 可视化推荐引擎

### 25.3.1 智能图表选择

```typescript
interface ChartRecommendation {
  chartType: 'bar' | 'line' | 'pie' | 'scatter' | 'heatmap' | 'table' | 'kpi_card';
  config: ChartConfig;
  reasoning: string;
}

class ChartRecommender {
  recommend(data: QueryResult, intent: AnalysisIntent): ChartRecommendation {
    const dataProfile = this.profileData(data);
    
    // 基于数据特征和分析意图推荐图表类型
    if (intent.type === 'comparison') {
      if (dataProfile.categoricalColumns === 1 && dataProfile.numericColumns === 1) {
        return { chartType: 'bar', config: this.configureBar(data, dataProfile), reasoning: '单维度对比适合柱状图' };
      }
      if (dataProfile.categoricalColumns === 1 && dataProfile.numericColumns >= 2) {
        return { chartType: 'bar', config: this.configureGroupedBar(data, dataProfile), reasoning: '多指标对比适合分组柱状图' };
      }
    }
    
    if (intent.type === 'trend') {
      if (dataProfile.hasTimeSeries) {
        return { chartType: 'line', config: this.configureLine(data, dataProfile), reasoning: '时间序列数据适合折线图' };
      }
    }
    
    if (intent.type === 'distribution') {
      if (dataProfile.numericColumns === 1) {
        return { chartType: 'bar', config: this.configureHistogram(data, dataProfile), reasoning: '单变量分布适合直方图' };
      }
      if (dataProfile.numericColumns === 2) {
        return { chartType: 'scatter', config: this.configureScatter(data, dataProfile), reasoning: '双变量关系适合散点图' };
      }
    }
    
    if (intent.type === 'composition') {
      if (dataProfile.rowCount <= 7) {
        return { chartType: 'pie', config: this.configurePie(data, dataProfile), reasoning: '少量类别的占比分析适合饼图' };
      }
    }
    
    if (dataProfile.rowCount === 1 && dataProfile.numericColumns <= 4) {
      return { chartType: 'kpi_card', config: this.configureKPI(data, dataProfile), reasoning: '单行少量指标适合KPI卡片' };
    }
    
    // 默认表格展示
    return { chartType: 'table', config: this.configureTable(data, dataProfile), reasoning: '复杂数据默认使用表格' };
  }
  
  private profileData(data: QueryResult): DataProfile {
    return {
      rowCount: data.rows.length,
      categoricalColumns: data.columns.filter(c => c.type === 'string').length,
      numericColumns: data.columns.filter(c => ['number', 'float'].includes(c.type)).length,
      hasTimeSeries: data.columns.some(c => c.type === 'date' || c.type === 'datetime'),
      uniqueValues: {} // 各列唯一值数量
    };
  }
  
  private configureBar(data: QueryResult, profile: DataProfile): ChartConfig {
    const xField = profile.categoricalColumns[0] ?? data.columns[0];
    const yField = profile.numericColumns[0] ?? data.columns[1];
    return { type: 'bar', data: data.rows, xField, yField, title: `${yField} by ${xField}`, color: '#5B8FF9' };
  }
  private configureGroupedBar(data: QueryResult, profile: DataProfile): ChartConfig {
    const xField = profile.categoricalColumns[0] ?? data.columns[0];
    const yField = profile.numericColumns[0] ?? data.columns[1];
    const groupField = profile.categoricalColumns[1] ?? data.columns[2];
    return { type: 'grouped-bar', data: data.rows, xField, yField, seriesField: groupField, title: `${yField} by ${xField} (grouped by ${groupField})` };
  }
  private configureLine(data: QueryResult, profile: DataProfile): ChartConfig {
    const xField = profile.temporalColumns[0] ?? profile.categoricalColumns[0] ?? data.columns[0];
    const yField = profile.numericColumns[0] ?? data.columns[1];
    return { type: 'line', data: data.rows.sort((a, b) => String(a[xField]).localeCompare(String(b[xField]))), xField, yField, title: `${yField} over ${xField}` };
  }
  private configureHistogram(data: QueryResult, profile: DataProfile): ChartConfig {
    const field = profile.numericColumns[0] ?? data.columns[0];
    return { type: 'histogram', data: data.rows, binField: field, binWidth: (profile.stats[field]?.max - profile.stats[field]?.min) / 20, title: `Distribution of ${field}` };
  }
  private configureScatter(data: QueryResult, profile: DataProfile): ChartConfig {
    const xField = profile.numericColumns[0] ?? data.columns[0];
    const yField = profile.numericColumns[1] ?? data.columns[1];
    return { type: 'scatter', data: data.rows, xField, yField, title: `${yField} vs ${xField}`, pointSize: 3 };
  }
  private configurePie(data: QueryResult, profile: DataProfile): ChartConfig {
    const angleField = profile.numericColumns[0] ?? data.columns[1];
    const colorField = profile.categoricalColumns[0] ?? data.columns[0];
    return { type: 'pie', data: data.rows, angleField, colorField, title: `${angleField} composition` };
  }
  private configureKPI(data: QueryResult, profile: DataProfile): ChartConfig {
    const valueField = profile.numericColumns[0] ?? data.columns[0];
    const value = data.rows[0]?.[valueField] ?? 0;
    return { type: 'kpi', data: [{ value, label: valueField }], title: valueField, value: Number(value) };
  }
  private configureTable(data: QueryResult, profile: DataProfile): ChartConfig {
    return { type: 'table', data: data.rows, columns: data.columns.map(c => ({ field: c, title: c })), title: 'Query Results' };
  }
}
```

## 25.4 洞察生成器

### 25.4.1 自动数据洞察

```typescript
class InsightGenerator {
  private model: LLMClient;
  
  async generateInsights(
    question: string,
    sql: string,
    data: QueryResult,
    chart: ChartRecommendation
  ): Promise<InsightReport> {
    const prompt = `
## Original Question
${question}

## SQL Query
\`\`\`sql
${sql}
\`\`\`

## Query Result (Summary)
${this.summarizeData(data)}

## Chart Type
${chart.chartType}: ${chart.reasoning}

## Task
Based on the data, provide:
1. **Direct Answer**: Answer the user's original question concisely
2. **Key Findings**: 2-3 notable patterns or anomalies in the data
3. **Context**: Compare with industry benchmarks or historical norms if applicable
4. **Follow-up Questions**: 2 suggested follow-up analyses

Use natural, conversational Chinese. Cite specific numbers.
`;

    const insights = await this.model.generate(prompt);
    
    return {
      answer: insights,
      data,
      chart,
      suggestedFollowups: this.extractFollowups(insights)
    };
  }
  
  private summarizeData(data: QueryResult): string {
    if (data.rows.length <= 20) {
      return this.formatAsTable(data);
    }
    // 对大数据集提供统计摘要
    return this.formatStatistics(data);
  }
  
  private formatAsTable(data: QueryResult): string {
    if (data.rows.length === 0) return '(No data)';
    const headers = data.columns.join(' | ');
    const separator = data.columns.map(() => '---').join(' | ');
    const rows = data.rows.slice(0, 20).map(r => data.columns.map(c => String(r[c] ?? '')).join(' | '));
    return `| ${headers} |\n| ${separator} |\n${rows.map(r => `| ${r} |`).join('\n')}`;
  }
  private formatStatistics(data: QueryResult): string {
    const numericCols = data.columns.filter(c => typeof data.rows[0]?.[c] === 'number');
    return numericCols.map(col => {
      const values = data.rows.map(r => Number(r[col])).filter(v => !isNaN(v));
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);
      return `${col}: avg=${avg.toFixed(2)}, min=${min}, max=${max}, sum=${sum.toFixed(2)}`;
    }).join('\n');
  }
  private extractFollowups(text: string): string[] {
    const followupPatterns = [/further\s+(?:analyze|investigate|explore)\s+(.+?)(?:\.|$)/gi, /可以进一步(.+?)(?:\.|。|$)/g, /建议.*?(?:分析|查看|对比)(.+?)(?:\.|。|$)/g];
    const followups: string[] = [];
    for (const pattern of followupPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) { followups.push(match[1].trim()); }
    }
    return followups.length > 0 ? followups : ['按时间维度细分分析', '与历史同期数据对比', '分析主要影响因素'];
  }
}
```

## 25.5 完整分析流程

### 25.5.1 分析 Agent 编排

```typescript
class DataAnalysisAgent {
  private sqlEngine: TextToSQLEngine;
  private executor: SQLExecutor;
  private chartRecommender: ChartRecommender;
  private insightGenerator: InsightGenerator;
  
  async analyze(question: string, context?: AnalysisContext): Promise<AnalysisResult> {
    // 步骤1: 生成 SQL
    const sqlResult = await this.sqlEngine.generateSQL(question, context);
    
    // 步骤2: 执行查询（安全沙箱）
    const data = await this.executor.execute(sqlResult.sql, {
      timeout: 30000,
      maxRows: 10000,
      readOnly: true
    });
    
    // 步骤3: 推荐可视化
    const intent = this.inferIntent(question);
    const chart = this.chartRecommender.recommend(data, intent);
    
    // 步骤4: 生成洞察
    const insights = await this.insightGenerator.generateInsights(
      question, sqlResult.sql, data, chart
    );
    
    return {
      sql: sqlResult.sql,
      data,
      visualization: chart,
      insights: insights.answer,
      followups: insights.suggestedFollowups
    };
  }
  
  private inferIntent(question: string): AnalysisIntent {
    const comparisonKeywords = ['对比', '比较', '同比', '环比', '差异', 'vs'];
    const trendKeywords = ['趋势', '变化', '走势', '增长', '下降'];
    const distributionKeywords = ['分布', '占比', '构成', '比例'];
    
    if (comparisonKeywords.some(k => question.includes(k))) return { type: 'comparison' };
    if (trendKeywords.some(k => question.includes(k))) return { type: 'trend' };
    if (distributionKeywords.some(k => question.includes(k))) return { type: 'distribution' };
    return { type: 'exploration' };
  }
}
```

## 25.6 安全与权限控制

### 25.6.1 查询安全层

```typescript
// ✅ 检查 SQL 语句类型，而非全文搜索关键字
// 避免误报：例如 "SELECT * FROM order_updates" 不会因包含 UPDATE 而被拦截
const DANGEROUS_STATEMENT_PATTERNS = [
  /^\s*(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE)\b/i,
];

function validateSQL(sql: string): { safe: boolean; reason?: string } {
  const normalized = sql.trim();
  for (const pattern of DANGEROUS_STATEMENT_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        safe: false,
        reason: `Detected dangerous SQL statement type: ${normalized.split(/\s/)[0]}`,
      };
    }
  }
  // 仅允许 SELECT / WITH ... SELECT 语句
  if (!/^\s*(SELECT|WITH)\b/i.test(normalized)) {
    return { safe: false, reason: 'Only SELECT queries are allowed' };
  }
  return { safe: true };
}

class SQLValidator {
  async validate(sql: string, tables: TableDefinition[]): Promise<ValidationResult> {
    // 1. 语法检查
    const parseResult = this.parseSQL(sql);
    if (!parseResult.valid) {
      return { isValid: false, errors: [parseResult.error!] };
    }

    // 2. 只读检查 - 基于语句类型检测，而非全文关键字搜索
    const safety = validateSQL(sql);
    if (!safety.safe) {
      return { isValid: false, errors: [safety.reason!] };
    }

    // 3. 表权限检查
    const usedTables = this.extractTableNames(sql);
    const allowedTables = tables.map(t => t.name);
    const unauthorized = usedTables.filter(t => !allowedTables.includes(t));
    if (unauthorized.length > 0) {
      return { isValid: false, errors: [`无权访问表: ${unauthorized.join(', ')}`] };
    }

    // 4. 结果集大小限制
    if (!sql.toUpperCase().includes('LIMIT')) {
      return { isValid: true, sql: sql + ' LIMIT 10000', explanation: '已自动添加结果集限制' };
    }

    return { isValid: true, sql, explanation: '验证通过' };
  }

  private parseSQL(sql: string): { valid: boolean; error?: string } {
    const dangerousKeywords = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'INSERT', 'UPDATE', 'EXEC', 'EXECUTE'];
    const upperSQL = sql.toUpperCase().trim();
    for (const keyword of dangerousKeywords) {
      if (upperSQL.includes(keyword)) return { valid: false, error: `Dangerous keyword "${keyword}" detected. Only SELECT queries are allowed.` };
    }
    if (!upperSQL.startsWith('SELECT') && !upperSQL.startsWith('WITH')) {
      return { valid: false, error: 'Only SELECT and WITH (CTE) queries are allowed.' };
    }
    const openParens = (sql.match(/\(/g) || []).length;
    const closeParens = (sql.match(/\)/g) || []).length;
    if (openParens !== closeParens) return { valid: false, error: 'Unbalanced parentheses.' };
    return { valid: true };
  }
  private extractTableNames(sql: string): string[] {
    const tablePattern = /(?:FROM|JOIN)\s+([a-zA-Z_][\w.]*)/gi;
    const tables: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = tablePattern.exec(sql)) !== null) {
      const tableName = match[1].toLowerCase();
      if (!tables.includes(tableName)) tables.push(tableName);
    }
    return tables;
  }
}
```

> **生产环境建议：** 上述基于正则表达式的语句类型检查适用于教学演示和简单场景。在生产环境中，应使用成熟的 SQL AST（抽象语法树）解析库——例如 [`node-sql-parser`](https://github.com/taozhi8833998/node-sql-parser)——对 SQL 进行完整解析，精确识别语句类型、子查询和嵌套结构，从而彻底杜绝各类绕过手段（如 `; DROP TABLE ...` 拼接注入、CTE 内嵌写操作等）。

## 25.7 小结

数据分析 Agent 的核心设计原则：

1. **Schema 感知**：深度理解数据库结构，生成准确的 SQL
2. **业务语义映射**：将业务术语正确映射到数据库概念
3. **安全第一**：只读沙箱、权限控制、结果集限制
4. **自然交互**：数据洞察用自然语言呈现，可视化直观易懂
5. **迭代分析**：通过 follow-up 问题支持深度探索


## 25.8 迭代分析工作流

### 25.8.1 会话式 BI 交互模式

数据分析 Agent 与传统 BI 工具的核心差异在于其**会话式、迭代式**的交互模式。用户不需要一次性精确描述需求，而是通过多轮对话逐步深入：

```
用户: 上个月各产品线的收入情况
Agent: [生成 SQL → 执行 → 柱状图] 上月收入排名前三的产品线是...
用户: 为什么 B 产品线下降了这么多？
Agent: [识别为深入分析 → 生成同比/环比 SQL → 折线图] B 产品线下降主要集中在...
用户: 是不是华东区的问题？按区域拆分看看
Agent: [识别为维度下钻 → 交叉分析 → 热力图] 确实，华东区贡献了 B 产品线 70% 的降幅...
用户: 华东区 B 产品线的客户流失情况呢？
Agent: [跨主题跳转 → 关联客户表 → 漏斗图] 过去三个月客户流失率...
```

```typescript
interface AnalysisSession {
  id: string;
  userId: string;
  history: AnalysisTurn[];
  context: {
    currentTables: string[];       // 当前涉及的表
    currentFilters: Filter[];      // 当前有效的筛选条件
    currentTimeRange: TimeRange;   // 当前时间范围
    previousResults: QueryResult[]; // 之前查询的结果
    knownEntities: Map<string, string>; // 已识别的实体
  };
}

interface AnalysisTurn {
  question: string;
  analysisType: 'initial' | 'drill_down' | 'comparison' | 'cross_topic' | 'what_if';
  sql: string;
  result: QueryResult;
  visualization: ChartRecommendation;
  insights: string;
  followups: string[];
}

class ConversationalBIAgent {
  private sqlEngine: TextToSQLEngine;
  private chartRecommender: ChartRecommender;
  private insightGenerator: InsightGenerator;
  private model: LLMClient;

  async handleTurn(
    session: AnalysisSession,
    question: string
  ): Promise<AnalysisTurn> {
    // 1. 分析当前问题与上下文的关系
    const analysisType = await this.classifyTurnType(question, session);

    // 2. 根据分析类型调整上下文
    const enrichedQuestion = await this.enrichQuestion(question, session, analysisType);

    // 3. 生成 SQL（利用会话上下文）
    const sqlResult = await this.sqlEngine.generateSQL(enrichedQuestion, {
      previousQueries: session.history.map(t => t.sql),
      currentFilters: session.context.currentFilters,
      currentTimeRange: session.context.currentTimeRange,
    });

    // 4. 执行查询
    const data = await this.executeQuery(sqlResult.sql);

    // 5. 推荐可视化
    const intent = this.inferIntent(question);
    const chart = this.chartRecommender.recommend(data, intent);

    // 6. 生成洞察
    const insights = await this.insightGenerator.generateInsights(
      question, sqlResult.sql, data, chart
    );

    // 7. 更新会话上下文
    this.updateSessionContext(session, sqlResult, data);

    const turn: AnalysisTurn = {
      question,
      analysisType,
      sql: sqlResult.sql,
      result: data,
      visualization: chart,
      insights: insights.answer,
      followups: insights.suggestedFollowups,
    };

    session.history.push(turn);
    return turn;
  }

  private async classifyTurnType(
    question: string, session: AnalysisSession
  ): Promise<AnalysisTurn['analysisType']> {
    if (session.history.length === 0) return 'initial';

    const patterns: Record<string, RegExp[]> = {
      drill_down: [/为什么/, /具体看看/, /拆分/, /按.*看/, /下钻/, /细分/],
      comparison: [/对比/, /同比/, /环比/, /比较/, /vs/, /差异/],
      cross_topic: [/另外/, /还想看/, /切换到/, /关于.*的/],
      what_if: [/如果/, /假设/, /预测/, /会怎样/],
    };

    for (const [type, regexes] of Object.entries(patterns)) {
      if (regexes.some(r => r.test(question))) {
        return type as AnalysisTurn['analysisType'];
      }
    }

    // LLM 判断
    const prompt = `上一个问题是: "${session.history.slice(-1)[0]?.question}"
当前问题是: "${question}"
这是哪种分析类型? 回复: drill_down / comparison / cross_topic / what_if / initial`;
    
    const response = await this.model.generate(prompt, { maxTokens: 20 });
    return response.trim() as AnalysisTurn['analysisType'];
  }

  private async enrichQuestion(
    question: string,
    session: AnalysisSession,
    type: AnalysisTurn['analysisType']
  ): Promise<string> {
    // 对于下钻和对比，需要补充上下文
    switch (type) {
      case 'drill_down': {
        const lastTurn = session.history.slice(-1)[0];
        return `在之前的查询（${lastTurn.question}）结果基础上，${question}。之前查询涉及的表: ${session.context.currentTables.join(', ')}。当前筛选条件: ${JSON.stringify(session.context.currentFilters)}`;
      }
      case 'comparison': {
        const timeRange = session.context.currentTimeRange;
        return `${question}（参考时间范围: ${timeRange.start} ~ ${timeRange.end}）`;
      }
      case 'cross_topic': {
        // 跨主题时保留筛选条件但可能切换表
        return `${question}（保持筛选条件: ${JSON.stringify(session.context.currentFilters)}）`;
      }
      default:
        return question;
    }
  }

  private updateSessionContext(
    session: AnalysisSession,
    sqlResult: SQLResult,
    data: QueryResult
  ): void {
    // 更新涉及的表
    if (sqlResult.tables) {
      session.context.currentTables = sqlResult.tables;
    }

    // 更新结果缓存
    session.context.previousResults.push(data);
    if (session.context.previousResults.length > 5) {
      session.context.previousResults.shift();
    }
  }

  private async executeQuery(sql: string): Promise<QueryResult> {
    // 安全沙箱执行
    return { columns: [], rows: [], executionTime: 0 } as any;
  }

  private inferIntent(question: string): AnalysisIntent {
    const comparisonKeywords = ['对比', '比较', '同比', '环比', '差异', 'vs'];
    const trendKeywords = ['趋势', '变化', '走势', '增长', '下降'];
    const distributionKeywords = ['分布', '占比', '构成', '比例'];
    const correlationKeywords = ['相关', '关系', '影响', '因素'];

    if (comparisonKeywords.some(k => question.includes(k))) return { type: 'comparison' };
    if (trendKeywords.some(k => question.includes(k))) return { type: 'trend' };
    if (distributionKeywords.some(k => question.includes(k))) return { type: 'distribution' };
    if (correlationKeywords.some(k => question.includes(k))) return { type: 'correlation' };
    return { type: 'exploration' };
  }
}
```

### 25.8.2 分析记忆与上下文管理

```typescript
class AnalysisContextManager {
  // 从对话历史中提取和维护分析上下文
  extractFilters(history: AnalysisTurn[]): Filter[] {
    const filters: Filter[] = [];

    for (const turn of history) {
      // 从 SQL 中提取 WHERE 条件
      const whereMatch = turn.sql.match(/WHERE\s+(.*?)(?:GROUP|ORDER|LIMIT|$)/is);
      if (whereMatch) {
        const conditions = this.parseWhereClause(whereMatch[1]);
        filters.push(...conditions);
      }
    }

    // 去重，保留最新的筛选条件
    return this.deduplicateFilters(filters);
  }

  // 推断时间范围
  inferTimeRange(question: string, currentDate: Date = new Date()): TimeRange {
    const patterns: { pattern: RegExp; resolver: (match: RegExpMatchArray) => TimeRange }[] = [
      {
        pattern: /上个月|上月/,
        resolver: () => {
          const start = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
          const end = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);
          return { start: this.formatDate(start), end: this.formatDate(end) };
        },
      },
      {
        pattern: /最近(\d+)(天|周|月|年)/,
        resolver: (match) => {
          const amount = parseInt(match[1]);
          const unit = match[2];
          const start = new Date(currentDate);
          switch (unit) {
            case '天': start.setDate(start.getDate() - amount); break;
            case '周': start.setDate(start.getDate() - amount * 7); break;
            case '月': start.setMonth(start.getMonth() - amount); break;
            case '年': start.setFullYear(start.getFullYear() - amount); break;
          }
          return { start: this.formatDate(start), end: this.formatDate(currentDate) };
        },
      },
      {
        pattern: /(\d{4})年(\d{1,2})月/,
        resolver: (match) => {
          const year = parseInt(match[1]);
          const month = parseInt(match[2]);
          const start = new Date(year, month - 1, 1);
          const end = new Date(year, month, 0);
          return { start: this.formatDate(start), end: this.formatDate(end) };
        },
      },
      {
        pattern: /今年|本年/,
        resolver: () => {
          const start = new Date(currentDate.getFullYear(), 0, 1);
          return { start: this.formatDate(start), end: this.formatDate(currentDate) };
        },
      },
      {
        pattern: /Q([1-4])/,
        resolver: (match) => {
          const quarter = parseInt(match[1]);
          const year = currentDate.getFullYear();
          const startMonth = (quarter - 1) * 3;
          const start = new Date(year, startMonth, 1);
          const end = new Date(year, startMonth + 3, 0);
          return { start: this.formatDate(start), end: this.formatDate(end) };
        },
      },
    ];

    for (const { pattern, resolver } of patterns) {
      const match = question.match(pattern);
      if (match) return resolver(match);
    }

    // 默认：最近 30 天
    const start = new Date(currentDate);
    start.setDate(start.getDate() - 30);
    return { start: this.formatDate(start), end: this.formatDate(currentDate) };
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private parseWhereClause(clause: string): Filter[] {
    // 简化实现：提取基本的等式和范围条件
    const filters: Filter[] = [];
    const eqPattern = /(\w+)\s*=\s*'([^']+)'/g;
    let match: RegExpExecArray | null;
    while ((match = eqPattern.exec(clause)) !== null) {
      filters.push({ column: match[1], operator: '=', value: match[2] });
    }
    return filters;
  }

  private deduplicateFilters(filters: Filter[]): Filter[] {
    const seen = new Map<string, Filter>();
    for (const filter of filters) {
      seen.set(`${filter.column}_${filter.operator}`, filter);
    }
    return [...seen.values()];
  }
}
```

## 25.9 数据可视化引擎

### 25.9.1 图表配置生成器

```typescript
interface ChartConfig {
  type: string;
  title: string;
  data: any[];
  xField?: string;
  yField?: string;
  seriesField?: string;
  colorField?: string;
  angleField?: string;
  style: ChartStyle;
  annotations?: ChartAnnotation[];
}

interface ChartStyle {
  colorPalette: string[];
  fontSize: number;
  showDataLabels: boolean;
  showLegend: boolean;
  axisFormat: {
    x?: { type: 'category' | 'time' | 'linear'; format?: string };
    y?: { type: 'linear' | 'log'; format?: string; unit?: string };
  };
}

class ChartRenderer {
  // 生成完整的图表配置（可直接传给前端图表库如 ECharts / AntV G2）
  generateConfig(
    data: QueryResult,
    recommendation: ChartRecommendation
  ): ChartConfig {
    const baseConfig = this.getBaseConfig(recommendation.chartType);
    const dataFormatted = this.formatData(data, recommendation);
    const style = this.inferStyle(data, recommendation);
    const annotations = this.generateAnnotations(data, recommendation);

    return {
      ...baseConfig,
      title: this.generateTitle(recommendation),
      data: dataFormatted,
      style,
      annotations,
    };
  }

  private getBaseConfig(chartType: string): Partial<ChartConfig> {
    const configs: Record<string, Partial<ChartConfig>> = {
      bar: {
        type: 'bar',
        style: {
          colorPalette: ['#5B8FF9', '#5AD8A6', '#5D7092', '#F6BD16', '#E86452'],
          fontSize: 12,
          showDataLabels: true,
          showLegend: false,
          axisFormat: { y: { type: 'linear' } },
        },
      },
      line: {
        type: 'line',
        style: {
          colorPalette: ['#5B8FF9', '#E86452', '#5AD8A6'],
          fontSize: 12,
          showDataLabels: false,
          showLegend: true,
          axisFormat: { x: { type: 'time' }, y: { type: 'linear' } },
        },
      },
      pie: {
        type: 'pie',
        style: {
          colorPalette: ['#5B8FF9', '#5AD8A6', '#5D7092', '#F6BD16', '#E86452', '#6DC8EC', '#945FB9'],
          fontSize: 12,
          showDataLabels: true,
          showLegend: true,
          axisFormat: {},
        },
      },
      scatter: {
        type: 'scatter',
        style: {
          colorPalette: ['#5B8FF9'],
          fontSize: 12,
          showDataLabels: false,
          showLegend: false,
          axisFormat: { x: { type: 'linear' }, y: { type: 'linear' } },
        },
      },
      heatmap: {
        type: 'heatmap',
        style: {
          colorPalette: ['#BAE7FF', '#1890FF', '#0050B3'],
          fontSize: 10,
          showDataLabels: true,
          showLegend: true,
          axisFormat: {},
        },
      },
      kpi_card: {
        type: 'kpi_card',
        style: {
          colorPalette: ['#5B8FF9'],
          fontSize: 24,
          showDataLabels: true,
          showLegend: false,
          axisFormat: {},
        },
      },
    };

    return configs[chartType] || configs.bar;
  }

  private formatData(data: QueryResult, recommendation: ChartRecommendation): any[] {
    // 根据图表类型格式化数据
    return data.rows.map(row => {
      const formatted: Record<string, any> = {};
      for (const col of data.columns) {
        let value = row[col.name];
        // 数值格式化
        if (col.type === 'number' || col.type === 'float') {
          value = typeof value === 'number' ? value : parseFloat(value);
          if (isNaN(value)) value = 0;
        }
        // 日期格式化
        if (col.type === 'date' || col.type === 'datetime') {
          value = new Date(value).toLocaleDateString('zh-CN');
        }
        formatted[col.name] = value;
      }
      return formatted;
    });
  }

  private inferStyle(data: QueryResult, recommendation: ChartRecommendation): ChartStyle {
    const base = this.getBaseConfig(recommendation.chartType).style!;

    // 根据数据特征调整样式
    if (data.rows.length > 20) {
      base.showDataLabels = false;  // 数据点多时隐藏标签
    }

    // 数值格式
    const numericCols = data.columns.filter(c => c.type === 'number' || c.type === 'float');
    if (numericCols.length > 0) {
      const maxValue = Math.max(...data.rows.map(r => Math.abs(Number(r[numericCols[0].name]) || 0)));
      if (maxValue > 1_000_000) {
        base.axisFormat.y = { ...base.axisFormat.y, type: 'linear', format: '万', unit: '万' };
      } else if (maxValue > 1_000) {
        base.axisFormat.y = { ...base.axisFormat.y, type: 'linear', format: 'k', unit: 'K' };
      }
    }

    return base;
  }

  private generateAnnotations(data: QueryResult, recommendation: ChartRecommendation): ChartAnnotation[] {
    const annotations: ChartAnnotation[] = [];

    if (recommendation.chartType === 'line' || recommendation.chartType === 'bar') {
      // 标注最大值和最小值
      const numericCol = data.columns.find(c => c.type === 'number' || c.type === 'float');
      if (numericCol) {
        const values = data.rows.map(r => ({ value: Number(r[numericCol.name]), row: r }));
        const max = values.reduce((a, b) => b.value > a.value ? b : a);
        const min = values.reduce((a, b) => b.value < a.value ? b : a);

        annotations.push({
          type: 'dataMarker',
          position: max.row,
          text: `最高: ${this.formatNumber(max.value)}`,
          style: 'highlight',
        });

        annotations.push({
          type: 'dataMarker',
          position: min.row,
          text: `最低: ${this.formatNumber(min.value)}`,
          style: 'warning',
        });
      }
    }

    return annotations;
  }

  private generateTitle(recommendation: ChartRecommendation): string {
    return recommendation.reasoning || '数据分析结果';
  }

  private formatNumber(value: number): string {
    if (Math.abs(value) >= 1_000_000) return `${(value / 10_000).toFixed(1)}万`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toFixed(value % 1 === 0 ? 0 : 2);
  }
}
```

## 25.10 数据访问控制与安全

### 25.10.1 行列级权限控制

```typescript
interface DataAccessPolicy {
  userId: string;
  role: 'analyst' | 'manager' | 'director' | 'admin';
  allowedDatabases: string[];
  allowedTables: TablePermission[];
  rowFilters: RowFilter[];      // 行级过滤（如只能看自己部门的数据）
  columnMasks: ColumnMask[];    // 列级脱敏（如薪资列只显示范围）
  queryLimits: {
    maxRowsPerQuery: number;
    maxQueriesPerHour: number;
    maxConcurrentQueries: number;
    allowedOperations: ('SELECT' | 'WITH')[];
  };
}

interface TablePermission {
  database: string;
  table: string;
  columns: string[] | '*';      // 允许访问的列
  access: 'full' | 'read' | 'aggregate_only'; // aggregate_only = 只允许聚合查询
}

interface RowFilter {
  table: string;
  condition: string;            // WHERE 条件，如 "department_id = ${user.department}"
}

interface ColumnMask {
  table: string;
  column: string;
  maskType: 'hide' | 'range' | 'hash' | 'partial';
  maskConfig?: Record<string, any>;
}

class DataAccessController {
  async enforcePolicy(
    sql: string,
    policy: DataAccessPolicy
  ): Promise<EnforcedQuery> {
    // 1. 解析 SQL 中涉及的表和列
    const parsed = this.parseSQL(sql);

    // 2. 检查表访问权限
    for (const table of parsed.tables) {
      const permission = policy.allowedTables.find(
        t => t.table === table.name && t.database === (table.database || 'default')
      );

      if (!permission) {
        return {
          allowed: false,
          reason: `无权访问表 ${table.name}`,
          originalSQL: sql,
        };
      }

      // 检查列权限
      if (permission.columns !== '*') {
        const unauthorizedCols = table.columns.filter(
          c => !permission.columns.includes(c)
        );
        if (unauthorizedCols.length > 0) {
          return {
            allowed: false,
            reason: `无权访问列 ${unauthorizedCols.join(', ')}`,
            originalSQL: sql,
          };
        }
      }

      // 聚合限制
      if (permission.access === 'aggregate_only') {
        if (!this.isAggregateOnly(sql, table.name)) {
          return {
            allowed: false,
            reason: `表 ${table.name} 仅允许聚合查询`,
            originalSQL: sql,
          };
        }
      }
    }

    // 3. 注入行级过滤条件
    let modifiedSQL = sql;
    for (const filter of policy.rowFilters) {
      if (parsed.tables.some(t => t.name === filter.table)) {
        modifiedSQL = this.injectRowFilter(modifiedSQL, filter);
      }
    }

    // 4. 应用列级脱敏
    for (const mask of policy.columnMasks) {
      if (parsed.tables.some(t => t.name === mask.table)) {
        modifiedSQL = this.applyColumnMask(modifiedSQL, mask);
      }
    }

    // 5. 添加 LIMIT
    if (!modifiedSQL.toUpperCase().includes('LIMIT')) {
      modifiedSQL += ` LIMIT ${policy.queryLimits.maxRowsPerQuery}`;
    }

    return {
      allowed: true,
      modifiedSQL,
      originalSQL: sql,
      appliedFilters: policy.rowFilters.filter(f => parsed.tables.some(t => t.name === f.table)),
      appliedMasks: policy.columnMasks.filter(m => parsed.tables.some(t => t.name === m.table)),
    };
  }

  private parseSQL(sql: string): ParsedQuery {
    const tables: { name: string; database?: string; columns: string[] }[] = [];
    
    // 提取表名
    const tablePattern = /(?:FROM|JOIN)\s+(?:(\w+)\.)?(\w+)(?:\s+(?:AS\s+)?(\w+))?/gi;
    let match: RegExpExecArray | null;
    while ((match = tablePattern.exec(sql)) !== null) {
      tables.push({
        database: match[1],
        name: match[2],
        columns: [], // 需要进一步分析 SELECT 子句
      });
    }

    // 提取列名
    const selectMatch = sql.match(/SELECT\s+(.*?)\s+FROM/is);
    if (selectMatch) {
      const columns = selectMatch[1].split(',').map(c => {
        const col = c.trim().split(/\s+AS\s+/i)[0].trim();
        const parts = col.split('.');
        return parts.length > 1 ? parts[1] : parts[0];
      });
      if (tables.length > 0) {
        tables[0].columns = columns.filter(c => c !== '*');
      }
    }

    return { tables };
  }

  private isAggregateOnly(sql: string, tableName: string): boolean {
    // 检查是否所有列引用都在聚合函数内
    const aggregateFunctions = ['COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'GROUP_CONCAT'];
    const selectMatch = sql.match(/SELECT\s+(.*?)\s+FROM/is);
    if (!selectMatch) return false;

    const selectClause = selectMatch[1];
    // 简化检查：SELECT 子句中每个非函数列必须在 GROUP BY 中
    return selectClause.includes('COUNT') || selectClause.includes('SUM') || selectClause.includes('AVG');
  }

  private injectRowFilter(sql: string, filter: RowFilter): string {
    // 在 WHERE 子句中添加行过滤条件
    if (sql.toUpperCase().includes('WHERE')) {
      return sql.replace(/WHERE/i, `WHERE (${filter.condition}) AND`);
    } else {
      // 在 FROM ... 之后添加 WHERE
      return sql.replace(
        new RegExp(`(FROM\\s+.*?${filter.table}.*?)(?=GROUP|ORDER|LIMIT|$)`, 'is'),
        `$1 WHERE ${filter.condition} `
      );
    }
  }

  private applyColumnMask(sql: string, mask: ColumnMask): string {
    const { column, maskType } = mask;
    let replacement: string;

    switch (maskType) {
      case 'hide':
        replacement = `'***' AS ${column}`;
        break;
      case 'range':
        replacement = `CASE WHEN ${column} < 10000 THEN '< 1万' WHEN ${column} < 50000 THEN '1-5万' WHEN ${column} < 100000 THEN '5-10万' ELSE '> 10万' END AS ${column}`;
        break;
      case 'hash':
        replacement = `MD5(${column}) AS ${column}`;
        break;
      case 'partial':
        replacement = `CONCAT(LEFT(${column}, 3), '***') AS ${column}`;
        break;
      default:
        return sql;
    }

    // 替换 SELECT 子句中的列引用
    return sql.replace(new RegExp(`\\b${column}\\b`, 'g'), replacement);
  }
}
```

### 25.10.2 SQL 注入防御

```typescript
class SQLInjectionDefender {
  private readonly DANGEROUS_PATTERNS: { pattern: RegExp; description: string }[] = [
    { pattern: /;\s*(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE)/i, description: '多语句注入' },
    { pattern: /UNION\s+SELECT/i, description: 'UNION 注入' },
    { pattern: /--\s*$|#\s*$/m, description: '注释注入' },
    { pattern: /'\s*OR\s+'?\d*'?\s*=\s*'?\d*'?/i, description: '经典 OR 注入' },
    { pattern: /SLEEP\s*\(/i, description: '时间盲注' },
    { pattern: /BENCHMARK\s*\(/i, description: '性能攻击' },
    { pattern: /LOAD_FILE\s*\(/i, description: '文件读取' },
    { pattern: /INTO\s+(OUTFILE|DUMPFILE)/i, description: '文件写入' },
    { pattern: /INFORMATION_SCHEMA/i, description: '元数据泄露' },
    { pattern: /CHAR\s*\(\s*\d+/i, description: '字符编码绕过' },
  ];

  validate(sql: string): SQLValidationResult {
    const issues: SQLSecurityIssue[] = [];

    // 1. 模式匹配检测
    for (const { pattern, description } of this.DANGEROUS_PATTERNS) {
      if (pattern.test(sql)) {
        issues.push({
          severity: 'critical',
          description,
          pattern: pattern.source,
        });
      }
    }

    // 2. 参数化检查——确保没有未转义的用户输入
    const stringLiterals = sql.match(/'[^']*'/g) || [];
    for (const literal of stringLiterals) {
      if (literal.includes('${') || literal.includes('`')) {
        issues.push({
          severity: 'high',
          description: '检测到模板字符串注入风险',
          pattern: literal,
        });
      }
    }

    // 3. 嵌套查询深度检查
    const nestingDepth = this.calculateNestingDepth(sql);
    if (nestingDepth > 3) {
      issues.push({
        severity: 'medium',
        description: `查询嵌套深度过高 (${nestingDepth})，可能是注入尝试`,
        pattern: `depth=${nestingDepth}`,
      });
    }

    return {
      safe: issues.filter(i => i.severity === 'critical').length === 0,
      issues,
    };
  }

  // 参数化查询构建器——推荐的安全方式
  buildParameterizedQuery(
    template: string,
    params: Record<string, any>
  ): { sql: string; parameters: any[] } {
    let paramIndex = 0;
    const parameters: any[] = [];

    const sql = template.replace(/\$\{(\w+)\}/g, (_, key) => {
      if (key in params) {
        parameters.push(params[key]);
        return `$${++paramIndex}`;
      }
      throw new Error(`Missing parameter: ${key}`);
    });

    return { sql, parameters };
  }

  private calculateNestingDepth(sql: string): number {
    let maxDepth = 0;
    let currentDepth = 0;
    for (const char of sql) {
      if (char === '(') { currentDepth++; maxDepth = Math.max(maxDepth, currentDepth); }
      if (char === ')') currentDepth--;
    }
    return maxDepth;
  }
}
```

## 25.11 与 BI 工具集成

### 25.11.1 连接器架构

```typescript
interface BIConnector {
  name: string;
  type: 'tableau' | 'metabase' | 'superset' | 'grafana' | 'custom';
  
  // 导出分析结果到 BI 工具
  export(result: AnalysisResult): Promise<ExportResult>;
  
  // 从 BI 工具导入仪表盘定义
  importDashboard(dashboardId: string): Promise<DashboardDefinition>;
  
  // 同步数据源配置
  syncDataSources(): Promise<DataSourceConfig[]>;
}

class MetabaseConnector implements BIConnector {
  name = 'Metabase';
  type = 'metabase' as const;
  private apiUrl: string;
  private sessionToken: string;

  constructor(config: { url: string; username: string; password: string }) {
    this.apiUrl = config.url;
    this.sessionToken = '';
  }

  async export(result: AnalysisResult): Promise<ExportResult> {
    // 1. 创建 Metabase 问题（Saved Question）
    const question = {
      name: `AI Analysis: ${result.insights.slice(0, 50)}...`,
      dataset_query: {
        type: 'native',
        native: { query: result.sql },
        database: 1, // 需要配置
      },
      display: this.mapChartType(result.visualization.chartType),
      visualization_settings: this.mapVisualizationSettings(result.visualization),
    };

    const response = await this.apiCall('POST', '/api/card', question);
    return {
      url: `${this.apiUrl}/question/${response.id}`,
      id: response.id.toString(),
      platform: 'metabase',
    };
  }

  async importDashboard(dashboardId: string): Promise<DashboardDefinition> {
    const response = await this.apiCall('GET', `/api/dashboard/${dashboardId}`);
    return {
      id: dashboardId,
      name: response.name,
      cards: response.ordered_cards.map((card: any) => ({
        id: card.id,
        query: card.card?.dataset_query?.native?.query,
        type: card.card?.display,
      })),
    };
  }

  async syncDataSources(): Promise<DataSourceConfig[]> {
    const response = await this.apiCall('GET', '/api/database');
    return response.data.map((db: any) => ({
      id: db.id.toString(),
      name: db.name,
      engine: db.engine,
      tables: [], // 需要另外请求
    }));
  }

  private mapChartType(type: string): string {
    const mapping: Record<string, string> = {
      bar: 'bar',
      line: 'line',
      pie: 'pie',
      scatter: 'scatter',
      table: 'table',
      kpi_card: 'scalar',
      heatmap: 'heatmap',
    };
    return mapping[type] || 'table';
  }

  private mapVisualizationSettings(viz: ChartRecommendation): Record<string, any> {
    return {
      'graph.x_axis.title_text': viz.config?.xField,
      'graph.y_axis.title_text': viz.config?.yField,
    };
  }

  private async apiCall(method: string, path: string, body?: any): Promise<any> {
    // HTTP API 调用封装
    return {};
  }
}
```

## 25.12 评估体系

### 25.12.1 数据分析 Agent 评估维度

| 评估维度 | 指标 | 描述 | 目标值 |
|---------|------|------|--------|
| **SQL 正确性** | Execution Accuracy | SQL 能否正确执行不报错 | > 95% |
| **结果正确性** | Result Accuracy | 查询结果与标准答案的匹配度 | > 85% |
| **语义理解** | Intent Match | 是否正确理解用户意图 | > 90% |
| **时间推断** | Temporal Accuracy | 时间表达的解析准确率 | > 95% |
| **可视化** | Chart Appropriateness | 推荐的图表类型是否合适 | > 80% |
| **洞察质量** | Insight Relevance | 生成的洞察是否有价值 | 人工评分 > 4/5 |
| **安全性** | Injection Prevention | SQL 注入防御有效率 | 100% |
| **延迟** | E2E Latency | 从问题到结果的端到端延迟 | < 5s (P95) |

### 25.12.2 自动化评估管线

```typescript
interface TextToSQLBenchmark {
  id: string;
  question: string;             // 自然语言问题
  expectedSQL: string;          // 参考 SQL
  expectedResult: any[];        // 期望结果（前 N 行）
  difficulty: 'easy' | 'medium' | 'hard' | 'extra_hard';
  tags: string[];               // 标签：JOIN, 子查询, 聚合, 时间计算等
}

class DataAnalysisEvaluator {
  async evaluate(
    agent: DataAnalysisAgent,
    benchmarks: TextToSQLBenchmark[]
  ): Promise<EvaluationReport> {
    const results: BenchmarkResult[] = [];

    for (const benchmark of benchmarks) {
      try {
        // 运行 Agent
        const startTime = Date.now();
        const analysis = await agent.analyze(benchmark.question);
        const latency = Date.now() - startTime;

        // 评估 SQL 执行正确性
        const execCorrect = analysis.data !== null && analysis.data.rows.length >= 0;

        // 评估结果正确性
        const resultCorrect = benchmark.expectedResult
          ? this.compareResults(analysis.data.rows, benchmark.expectedResult)
          : null;

        // 评估 SQL 语义等价性（使用 LLM 判断）
        const semanticMatch = await this.checkSemanticEquivalence(
          analysis.sql, benchmark.expectedSQL
        );

        // 评估可视化合理性
        const chartAppropriate = await this.evaluateChart(
          benchmark.question, analysis.visualization
        );

        results.push({
          benchmarkId: benchmark.id,
          difficulty: benchmark.difficulty,
          executionCorrect: execCorrect,
          resultCorrect: resultCorrect?.correct ?? false,
          semanticMatch: semanticMatch.equivalent,
          chartAppropriate,
          latencyMs: latency,
          generatedSQL: analysis.sql,
          error: null,
        });
      } catch (error: any) {
        results.push({
          benchmarkId: benchmark.id,
          difficulty: benchmark.difficulty,
          executionCorrect: false,
          resultCorrect: false,
          semanticMatch: false,
          chartAppropriate: false,
          latencyMs: 0,
          generatedSQL: '',
          error: error.message,
        });
      }
    }

    return this.generateReport(results, benchmarks);
  }

  private compareResults(actual: any[], expected: any[]): { correct: boolean; similarity: number } {
    if (actual.length === 0 && expected.length === 0) return { correct: true, similarity: 1.0 };
    if (actual.length === 0 || expected.length === 0) return { correct: false, similarity: 0 };

    // 比较前 N 行
    const n = Math.min(actual.length, expected.length, 10);
    let matchCount = 0;

    for (let i = 0; i < n; i++) {
      const actualRow = actual[i];
      const expectedRow = expected[i];
      
      // 比较每个字段
      const keys = Object.keys(expectedRow);
      const rowMatch = keys.every(key => {
        const aVal = String(actualRow[key] ?? '');
        const eVal = String(expectedRow[key] ?? '');
        // 数值近似比较
        if (!isNaN(Number(aVal)) && !isNaN(Number(eVal))) {
          return Math.abs(Number(aVal) - Number(eVal)) / Math.max(Math.abs(Number(eVal)), 1) < 0.01;
        }
        return aVal === eVal;
      });

      if (rowMatch) matchCount++;
    }

    const similarity = matchCount / n;
    return { correct: similarity > 0.9, similarity };
  }

  private async checkSemanticEquivalence(
    generatedSQL: string, referenceSQL: string
  ): Promise<{ equivalent: boolean; explanation: string }> {
    // 使用 LLM 判断两个 SQL 是否语义等价
    const prompt = `判断以下两个 SQL 查询是否语义等价（返回相同结果）：

SQL A: ${generatedSQL}
SQL B: ${referenceSQL}

回答 JSON: {"equivalent": true/false, "explanation": "..."}`;

    // 简化实现
    return { equivalent: true, explanation: '语义等价' };
  }

  private async evaluateChart(
    question: string, chart: ChartRecommendation
  ): Promise<boolean> {
    // 基于规则的图表合理性评估
    const questionLower = question.toLowerCase();
    
    if (questionLower.includes('趋势') || questionLower.includes('走势')) {
      return chart.chartType === 'line';
    }
    if (questionLower.includes('占比') || questionLower.includes('比例')) {
      return chart.chartType === 'pie' || chart.chartType === 'bar';
    }
    if (questionLower.includes('对比') || questionLower.includes('比较')) {
      return chart.chartType === 'bar';
    }
    
    return true; // 默认通过
  }

  private generateReport(
    results: BenchmarkResult[], benchmarks: TextToSQLBenchmark[]
  ): EvaluationReport {
    const total = results.length;
    const execCorrect = results.filter(r => r.executionCorrect).length;
    const resultCorrect = results.filter(r => r.resultCorrect).length;
    const semanticMatch = results.filter(r => r.semanticMatch).length;
    const chartCorrect = results.filter(r => r.chartAppropriate).length;

    // 按难度分层统计
    const byDifficulty: Record<string, { total: number; correct: number }> = {};
    for (const r of results) {
      if (!byDifficulty[r.difficulty]) byDifficulty[r.difficulty] = { total: 0, correct: 0 };
      byDifficulty[r.difficulty].total++;
      if (r.resultCorrect) byDifficulty[r.difficulty].correct++;
    }

    return {
      summary: {
        executionAccuracy: execCorrect / total,
        resultAccuracy: resultCorrect / total,
        semanticAccuracy: semanticMatch / total,
        chartAccuracy: chartCorrect / total,
        averageLatency: results.reduce((sum, r) => sum + r.latencyMs, 0) / total,
      },
      byDifficulty: Object.fromEntries(
        Object.entries(byDifficulty).map(([k, v]) => [k, v.correct / v.total])
      ),
      failedCases: results.filter(r => !r.resultCorrect).map(r => ({
        id: r.benchmarkId,
        generatedSQL: r.generatedSQL,
        error: r.error,
      })),
    };
  }
}
```

## 25.13 案例：构建对话式 BI Agent

### 25.13.1 端到端完整实现

```typescript
class ConversationalBISystem {
  private agent: ConversationalBIAgent;
  private accessController: DataAccessController;
  private injectionDefender: SQLInjectionDefender;
  private chartRenderer: ChartRenderer;
  private contextManager: AnalysisContextManager;
  private biConnector: MetabaseConnector;

  constructor(config: BISystemConfig) {
    this.agent = new ConversationalBIAgent();
    this.accessController = new DataAccessController();
    this.injectionDefender = new SQLInjectionDefender();
    this.chartRenderer = new ChartRenderer();
    this.contextManager = new AnalysisContextManager();
    this.biConnector = new MetabaseConnector(config.metabase);
  }

  async query(
    question: string,
    session: AnalysisSession,
    user: UserContext
  ): Promise<BIResponse> {
    // 1. 获取用户的数据访问策略
    const policy = await this.getUserPolicy(user);

    // 2. Agent 分析（生成 SQL + 可视化 + 洞察）
    const turn = await this.agent.handleTurn(session, question);

    // 3. 安全检查
    const securityCheck = this.injectionDefender.validate(turn.sql);
    if (!securityCheck.safe) {
      return {
        error: '检测到安全风险，查询已被拦截',
        securityIssues: securityCheck.issues,
      };
    }

    // 4. 权限强制执行
    const enforced = await this.accessController.enforcePolicy(turn.sql, policy);
    if (!enforced.allowed) {
      return {
        error: `权限不足: ${enforced.reason}`,
        suggestion: '请联系管理员申请相应数据权限',
      };
    }

    // 5. 渲染图表配置
    const chartConfig = this.chartRenderer.generateConfig(
      turn.result, turn.visualization
    );

    // 6. 构建响应
    return {
      answer: turn.insights,
      sql: enforced.modifiedSQL || turn.sql,
      data: turn.result,
      chart: chartConfig,
      followups: turn.followups,
      exportOptions: [
        { label: '保存到 Metabase', action: 'export_metabase' },
        { label: '导出 CSV', action: 'export_csv' },
        { label: '导出 Excel', action: 'export_excel' },
      ],
    };
  }

  async exportToBI(
    result: AnalysisResult,
    platform: string
  ): Promise<ExportResult> {
    switch (platform) {
      case 'metabase':
        return this.biConnector.export(result);
      case 'csv':
        return this.exportCSV(result);
      case 'excel':
        return this.exportExcel(result);
      default:
        throw new Error(`Unsupported export platform: ${platform}`);
    }
  }

  private async getUserPolicy(user: UserContext): Promise<DataAccessPolicy> {
    // 从权限系统获取用户的数据访问策略
    return {
      userId: user.id,
      role: user.role as any,
      allowedDatabases: ['analytics', 'reporting'],
      allowedTables: [
        { database: 'analytics', table: 'sales', columns: '*', access: 'full' },
        { database: 'analytics', table: 'customers', columns: ['id', 'name', 'region', 'tier'], access: 'read' },
        { database: 'analytics', table: 'employees', columns: '*', access: 'aggregate_only' },
      ],
      rowFilters: [
        { table: 'sales', condition: `region IN ('${user.regions.join("', '")}')` },
      ],
      columnMasks: [
        { table: 'customers', column: 'phone', maskType: 'partial' },
        { table: 'employees', column: 'salary', maskType: 'range' },
      ],
      queryLimits: {
        maxRowsPerQuery: 10000,
        maxQueriesPerHour: 100,
        maxConcurrentQueries: 3,
        allowedOperations: ['SELECT', 'WITH'],
      },
    };
  }

  private async exportCSV(result: AnalysisResult): Promise<ExportResult> {
    const headers = result.data.columns.map(c => c.name).join(',');
    const rows = result.data.rows.map(row =>
      result.data.columns.map(c => String(row[c.name] ?? '')).join(',')
    );
    const csv = [headers, ...rows].join('\n');
    return { url: `data:text/csv;base64,${Buffer.from(csv).toString('base64')}`, id: 'csv', platform: 'csv' };
  }

  private async exportExcel(result: AnalysisResult): Promise<ExportResult> {
    // 使用 ExcelJS 等库生成 Excel 文件
    return { url: '/downloads/analysis.xlsx', id: 'excel', platform: 'excel' };
  }
}
```

## 25.14 小结

数据分析 Agent 将自然语言与数据查询之间的鸿沟架起了一座桥梁。本章从核心引擎到完整系统，全面呈现了生产级数据分析 Agent 的设计：

1. **Text-to-SQL 是基础能力**——Schema 感知、业务术语映射、相似查询示例是提升生成准确率的三大支柱

2. **会话式分析是核心体验**——支持下钻、对比、跨主题切换的多轮分析会话，让非技术用户也能进行复杂数据探索

3. **智能可视化提升理解效率**——基于数据特征和分析意图自动推荐最合适的图表类型，配合自动标注最大值、最小值等关键点

4. **安全是不可妥协的底线**——SQL 注入防御、行列级权限控制、查询参数化、结果集限制，多层防御确保数据安全

5. **洞察生成增加分析价值**——不只是展示数据，更要解读数据。自动发现异常、趋势和关联，提供可操作的商业建议

6. **与 BI 生态集成扩大价值**——分析结果可以一键导出到 Metabase、Tableau 等现有 BI 工具，避免信息孤岛

7. **评估体系确保质量**——从 SQL 执行正确性到结果语义等价性，多维度自动化评估确保 Agent 持续改进

> **设计决策：数据分析 Agent 的信任建设**
>
> 数据分析场景对准确性要求极高——错误的数据洞察可能导致错误的商业决策。因此，本章实现了多层信任建设机制：
>
> - **SQL 可审查**：每次查询都展示生成的 SQL，让分析师可以验证查询逻辑
> - **引用标注**：洞察中的每个数据点都可追溯到原始查询结果
> - **置信度标注**：对不确定的分析结果明确标注置信度
> - **渐进复杂度**：从简单查询开始建立信任，再逐步处理复杂分析
>
> 这与第 14 章信任架构中讨论的渐进信任模型一脉相承——让用户先在低风险场景中验证 Agent 的能力，再逐步授予更高的自主权。

## 25.15 高级分析能力

### 25.15.1 异常检测与归因分析

数据分析 Agent 的高级能力之一是自动检测数据中的异常，并推断其可能的原因：

```typescript
interface AnomalyDetectionResult {
  anomalies: Anomaly[];
  overallHealthScore: number;  // 0-1，数据整体健康度
}

interface Anomaly {
  dimension: string;        // 异常所在维度
  value: any;               // 异常值
  expectedRange: { min: number; max: number };
  severity: 'info' | 'warning' | 'critical';
  possibleCauses: string[];
  affectedMetrics: string[];
}

class AnomalyDetector {
  async detect(
    data: QueryResult,
    historicalData: QueryResult[],
    businessRules: BusinessRule[]
  ): Promise<AnomalyDetectionResult> {
    const anomalies: Anomaly[] = [];

    // 1. 统计异常检测（Z-score 方法）
    const statisticalAnomalies = this.detectStatisticalAnomalies(data, historicalData);
    anomalies.push(...statisticalAnomalies);

    // 2. 业务规则异常检测
    const ruleAnomalies = this.detectRuleViolations(data, businessRules);
    anomalies.push(...ruleAnomalies);

    // 3. 趋势异常检测
    const trendAnomalies = this.detectTrendBreaks(data, historicalData);
    anomalies.push(...trendAnomalies);

    // 4. 为异常生成归因分析
    for (const anomaly of anomalies) {
      anomaly.possibleCauses = await this.generateAttribution(anomaly, data, historicalData);
    }

    const criticalCount = anomalies.filter(a => a.severity === 'critical').length;
    const warningCount = anomalies.filter(a => a.severity === 'warning').length;
    const healthScore = Math.max(0, 1 - criticalCount * 0.3 - warningCount * 0.1);

    return { anomalies, overallHealthScore: healthScore };
  }

  private detectStatisticalAnomalies(
    current: QueryResult, historical: QueryResult[]
  ): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const numericColumns = current.columns.filter(c => c.type === 'number' || c.type === 'float');

    for (const col of numericColumns) {
      // 计算历史均值和标准差
      const historicalValues = historical.flatMap(h =>
        h.rows.map(r => Number(r[col.name])).filter(v => !isNaN(v))
      );

      if (historicalValues.length < 5) continue;

      const mean = historicalValues.reduce((a, b) => a + b, 0) / historicalValues.length;
      const stdDev = Math.sqrt(
        historicalValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / historicalValues.length
      );

      if (stdDev === 0) continue;

      // 检查当前数据中的异常值
      for (const row of current.rows) {
        const value = Number(row[col.name]);
        if (isNaN(value)) continue;

        const zScore = Math.abs((value - mean) / stdDev);
        if (zScore > 3) {
          anomalies.push({
            dimension: col.name,
            value,
            expectedRange: { min: mean - 2 * stdDev, max: mean + 2 * stdDev },
            severity: zScore > 4 ? 'critical' : 'warning',
            possibleCauses: [],
            affectedMetrics: [col.name],
          });
        }
      }
    }

    return anomalies;
  }

  private detectRuleViolations(data: QueryResult, rules: BusinessRule[]): Anomaly[] {
    const anomalies: Anomaly[] = [];

    for (const rule of rules) {
      for (const row of data.rows) {
        const value = Number(row[rule.metric]);
        if (isNaN(value)) continue;

        if (rule.type === 'threshold') {
          if (value > rule.max! || value < rule.min!) {
            anomalies.push({
              dimension: rule.metric,
              value,
              expectedRange: { min: rule.min ?? -Infinity, max: rule.max ?? Infinity },
              severity: rule.severity,
              possibleCauses: [rule.description],
              affectedMetrics: [rule.metric],
            });
          }
        }

        if (rule.type === 'ratio') {
          const denominator = Number(row[rule.denominator!]);
          if (denominator === 0) continue;
          const ratio = value / denominator;
          if (ratio > rule.maxRatio! || ratio < rule.minRatio!) {
            anomalies.push({
              dimension: `${rule.metric}/${rule.denominator}`,
              value: ratio,
              expectedRange: { min: rule.minRatio ?? 0, max: rule.maxRatio ?? 1 },
              severity: rule.severity,
              possibleCauses: [rule.description],
              affectedMetrics: [rule.metric, rule.denominator!],
            });
          }
        }
      }
    }

    return anomalies;
  }

  private detectTrendBreaks(current: QueryResult, historical: QueryResult[]): Anomaly[] {
    // 检测趋势突变
    return [];
  }

  private async generateAttribution(
    anomaly: Anomaly, current: QueryResult, historical: QueryResult[]
  ): Promise<string[]> {
    const causes: string[] = [];

    // 基于维度分析的简单归因
    if (anomaly.severity === 'critical') {
      causes.push('建议检查数据采集管道是否正常');
      causes.push('可能存在异常数据录入');
    }
    if (anomaly.value > anomaly.expectedRange.max) {
      causes.push('该指标显著高于历史水平，可能受到季节性因素或一次性事件影响');
    }
    if (anomaly.value < anomaly.expectedRange.min) {
      causes.push('该指标显著低于历史水平，建议排查是否存在系统故障或业务异常');
    }

    return causes;
  }
}
```

### 25.15.2 预测分析

```typescript
class ForecastEngine {
  // 简单的时间序列预测（移动平均 + 季节性分解）
  forecast(
    historicalData: TimeSeriesPoint[],
    periods: number
  ): ForecastResult {
    if (historicalData.length < 7) {
      return { predictions: [], confidence: 0, method: 'insufficient_data' };
    }

    // 计算移动平均
    const windowSize = Math.min(7, Math.floor(historicalData.length / 3));
    const movingAvg = this.calculateMovingAverage(historicalData, windowSize);

    // 计算趋势
    const trend = this.calculateTrend(movingAvg);

    // 生成预测
    const predictions: ForecastPoint[] = [];
    const lastValue = historicalData[historicalData.length - 1].value;
    const lastTimestamp = historicalData[historicalData.length - 1].timestamp;

    for (let i = 1; i <= periods; i++) {
      const predicted = lastValue + trend * i;
      const uncertainty = this.calculateUncertainty(historicalData, i);

      predictions.push({
        timestamp: this.addDays(lastTimestamp, i),
        predicted,
        lowerBound: predicted - uncertainty,
        upperBound: predicted + uncertainty,
      });
    }

    return {
      predictions,
      confidence: this.calculateOverallConfidence(historicalData),
      method: 'moving_average_with_trend',
    };
  }

  private calculateMovingAverage(data: TimeSeriesPoint[], window: number): number[] {
    const result: number[] = [];
    for (let i = window - 1; i < data.length; i++) {
      const sum = data.slice(i - window + 1, i + 1).reduce((s, p) => s + p.value, 0);
      result.push(sum / window);
    }
    return result;
  }

  private calculateTrend(movingAvg: number[]): number {
    if (movingAvg.length < 2) return 0;
    const n = movingAvg.length;
    const recent = movingAvg.slice(-Math.min(n, 7));
    const trend = (recent[recent.length - 1] - recent[0]) / recent.length;
    return trend;
  }

  private calculateUncertainty(data: TimeSeriesPoint[], stepsAhead: number): number {
    const values = data.map(d => d.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
    );
    return stdDev * Math.sqrt(stepsAhead) * 1.96; // 95% 置信区间
  }

  private calculateOverallConfidence(data: TimeSeriesPoint[]): number {
    if (data.length < 14) return 0.5;
    if (data.length < 30) return 0.65;
    if (data.length < 90) return 0.75;
    return 0.85;
  }

  private addDays(date: Date | string, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }
}
```

### 25.15.3 自然语言报告生成

```typescript
class ReportGenerator {
  private model: LLMClient;

  async generateReport(
    analyses: AnalysisTurn[],
    anomalies: AnomalyDetectionResult,
    forecasts: ForecastResult[],
    audience: 'executive' | 'analyst' | 'technical'
  ): Promise<string> {
    const prompt = this.buildReportPrompt(analyses, anomalies, forecasts, audience);
    
    const report = await this.model.generate(prompt, {
      temperature: 0.3,
      maxTokens: 2000,
    });

    return report;
  }

  private buildReportPrompt(
    analyses: AnalysisTurn[],
    anomalies: AnomalyDetectionResult,
    forecasts: ForecastResult[],
    audience: string
  ): string {
    const audienceInstruction: Record<string, string> = {
      executive: '使用简洁的商业语言，聚焦关键结论和建议行动。避免技术细节。使用"同比增长X%"等量化表述。',
      analyst: '包含详细的数据分析、趋势解读和方法说明。可以使用专业术语。',
      technical: '包含完整的技术细节：SQL 查询、统计方法、置信区间等。',
    };

    return `请基于以下分析数据生成一份${audience === 'executive' ? '高管' : audience === 'analyst' ? '分析师' : '技术'}报告。

## 报告风格要求
${audienceInstruction[audience]}

## 分析数据
${analyses.map((a, i) => `### 分析 ${i + 1}: ${a.question}\n结果摘要: ${a.insights}`).join('\n\n')}

## 异常检测结果
健康评分: ${anomalies.overallHealthScore.toFixed(2)}
发现的异常:
${anomalies.anomalies.map(a => `- [${a.severity}] ${a.dimension}: ${a.value} (预期范围: ${a.expectedRange.min.toFixed(0)}-${a.expectedRange.max.toFixed(0)})`).join('\n')}

## 预测结果
${forecasts.map(f => `预测方法: ${f.method}, 置信度: ${f.confidence.toFixed(2)}`).join('\n')}

## 输出格式
1. 摘要（3-5 句话概括核心发现）
2. 关键指标表现
3. 异常与风险提示
4. 趋势预判
5. 建议行动（2-3 条可执行的建议）

请用中文输出。`;
  }
}
```

## 25.16 生产部署清单

```markdown
## 数据分析 Agent 上线清单

### 数据层
- [ ] 数据源连接配置（读写分离，使用只读副本）
- [ ] Schema 元数据已导入并定期同步
- [ ] 业务术语词典已配置
- [ ] 示例查询库已准备（> 100 条覆盖常见场景）
- [ ] 数据字典文档已关联

### 安全层
- [ ] SQL 注入防御已启用
- [ ] 行列级权限策略已配置
- [ ] 查询超时限制已设置（默认 30s）
- [ ] 结果集大小限制已设置（默认 10000 行）
- [ ] 查询审计日志已启用

### 分析层
- [ ] Text-to-SQL 引擎测试通过（准确率 > 85%）
- [ ] 时间推断逻辑测试通过
- [ ] 可视化推荐逻辑测试通过
- [ ] 异常检测规则已配置
- [ ] 洞察生成质量已人工验证

### 集成层
- [ ] BI 工具连接器已配置
- [ ] CSV/Excel 导出功能已测试
- [ ] API 接口已发布并设置限流

### 监控运营
- [ ] 查询成功率监控已部署
- [ ] 延迟监控已部署（P50/P95/P99）
- [ ] 用户查询日志分析管线已就位
- [ ] 知识库缺口自动发现已启用
```

数据分析 Agent 的最终目标是让每一位业务人员都拥有自己的"数据分析师"——他们只需要用自然语言提出问题，Agent 就能提供有深度、有洞察、可操作的分析结果。从 Text-to-SQL 到智能可视化，从异常检测到预测分析，本章展示的技术栈为实现这一目标提供了完整的工程蓝图。
