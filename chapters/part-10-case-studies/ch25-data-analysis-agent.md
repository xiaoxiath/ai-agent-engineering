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
