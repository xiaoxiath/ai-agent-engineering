# 第25章：实战案例——数据分析 Agent
数据分析是一个看似适合 Agent 但实际充满陷阱的场景。适合之处在于：分析流程（加载数据→清洗→探索→建模→可视化）天然是多步骤的，Agent 可以自主规划和执行。陷阱在于：数据分析的"正确性"很难自动验证——Agent 可能生成一张看起来合理但统计学上有严重问题的图表，而非专业用户很难发现。

本章以构建一个数据分析 Agent 为案例，重点讨论**代码生成的安全沙箱**（Agent 生成的 Python/SQL 代码如何安全执行）和**结果验证机制**（如何自动检测常见的统计错误和可视化误导）。

> **项目背景**：一个产品团队需要日常分析用户行为数据（DAU、留存率、转化漏斗等）。分析师团队人手不足，简单查询的响应时间需从 2 天缩短至 10 分钟。


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
  // ... 省略 81 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 82 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 7 行
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
  // ... 省略 7 行
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
  // ... 省略 7 行
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
  // ... 省略 145 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 92 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 178 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 174 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 69 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 78 行，完整实现见 code-examples/ 对应目录

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
  // ... 省略 155 行，完整实现见 code-examples/ 对应目录
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

  // ... 省略 107 行，完整实现见 code-examples/ 对应目录

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
  // ... 省略 140 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 7 行
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
  // ... 省略 7 行
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
  // ... 省略 7 行
### 监控运营
- [ ] 查询成功率监控已部署
- [ ] 延迟监控已部署（P50/P95/P99）
- [ ] 用户查询日志分析管线已就位
- [ ] 知识库缺口自动发现已启用
```

数据分析 Agent 的最终目标是让每一位业务人员都拥有自己的"数据分析师"——他们只需要用自然语言提出问题，Agent 就能提供有深度、有洞察、可操作的分析结果。从 Text-to-SQL 到智能可视化，从异常检测到预测分析，本章展示的技术栈为实现这一目标提供了完整的工程蓝图。
