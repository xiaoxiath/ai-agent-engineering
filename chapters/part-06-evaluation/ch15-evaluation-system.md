# 第 15 章：Agent 评估体系 — Eval-Driven Development

> **"If you can't measure it, you can't improve it."**
> —— Peter Drucker
>
> 在 Agent 工程中，这句话需要修正为：**"If you can't eval it, you can't ship it."**

在第 14 章中，我们构建了 Agent 信任架构（Trust Architecture），确保 Agent 的行为在安全边界内运行。但信任不能仅仅依赖架构设计——我们需要**系统化的评估体系**来持续验证 Agent 的行为是否符合预期。本章将介绍 Eval-Driven Development（评估驱动开发）方法论，从指标设计、工具 Mock、LLM 评判到 CI/CD 集成，构建一套完整的 Agent 评测工程体系。

与传统软件测试不同，Agent 评测面临三大核心挑战：

1. **输出非确定性**：相同输入可能产生不同但同样正确的输出
2. **行为路径多样性**：Agent 可能通过完全不同的工具调用序列达成目标
3. **质量维度复杂性**：不仅要评估"对不对"，还要评估"好不好"、"快不快"、"安全不安全"

本章将逐一解决这些挑战，并在第 16 章（Agent 基准测试）中将这些方法应用到标准化基准评测中。

---

## 15.1 Eval-Driven Development 方法论

### 15.1.1 为什么需要评估先行

传统软件开发中，我们先写代码再写测试（或者在 TDD 中先写测试再写代码）。但 Agent 开发有其独特性：**我们往往不确定 Agent 的最佳行为模式是什么**。因此，Eval-Driven Development（EDD）主张：

1. **先定义"好"的标准**：在编写 Agent 逻辑之前，先明确什么样的输出是优秀的
2. **构建评测套件**：将标准转化为可执行的评测用例
3. **迭代优化**：通过评测结果指导 prompt 调优、工具设计和架构改进
4. **持续监控**：在生产环境中持续运行评测，捕捉退化

这种方法的核心洞察是：**Agent 的"正确性"是一个光谱，而非二元判断**。我们需要量化这个光谱上的位置，才能有效地改进 Agent。

### 15.1.2 评估飞轮（Eval Flywheel）

Eval-Driven Development 形成一个正反馈循环：

```
定义评测标准 → 构建评测套件 → 运行评测 → 分析结果
    ↑                                         ↓
    ←── 更新标准 ←── 改进 Agent ←── 识别问题 ←─┘
```

飞轮的每一次转动都会带来：
- 更精确的评测标准（因为我们对"好"的定义更清晰了）
- 更丰富的评测用例（来自生产环境的真实案例）
- 更可靠的 Agent 行为（通过数据驱动的优化）

### 15.1.3 成熟度模型

```typescript
// ============================================================
// 15.1 EvalMaturityAssessor —— 评估成熟度评估器
// ============================================================

/**
 * Agent 评估成熟度等级
 *
 * Level 0: Ad-hoc —— 无系统化评估，依赖手动测试
 * Level 1: Basic —— 有基础的自动化测试，覆盖主要功能
 * Level 2: Structured —— 多维度评估体系，包含 LLM-as-Judge
 * Level 3: Continuous —— CI/CD 集成，自动化回归检测
 * Level 4: Optimizing —— 数据驱动的持续优化，A/B 测试
 */
enum EvalMaturityLevel {
  AD_HOC = 0,
  BASIC = 1,
  STRUCTURED = 2,
  CONTINUOUS = 3,
  OPTIMIZING = 4,
}

interface MaturityDimension {
  name: string;
  description: string;
  currentLevel: EvalMaturityLevel;
  evidence: string[];
  recommendations: string[];
}

interface MaturityAssessment {
  overallLevel: EvalMaturityLevel;
  dimensions: MaturityDimension[];
  score: number; // 0-100
  roadmap: RoadmapItem[];
  assessedAt: Date;
}

interface RoadmapItem {
  targetLevel: EvalMaturityLevel;
  action: string;
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  prerequisites: string[];
}

interface EvalPractice {
  id: string;
  name: string;
  dimension: string;
  level: EvalMaturityLevel;
  check: () => Promise<boolean>;
  weight: number;
}

class EvalMaturityAssessor {
  private practices: EvalPractice[] = [];
  private assessmentHistory: MaturityAssessment[] = [];

  constructor() {
    this.initializeDefaultPractices();
  }

  /**
   * 初始化默认的评估实践检查项
   */
  private initializeDefaultPractices(): void {
    // Level 1: Basic 实践
    this.practices.push(
      {
        id: 'basic-unit-tests',
        name: '基础单元测试',
        dimension: 'test-coverage',
        level: EvalMaturityLevel.BASIC,
        check: async () => this.checkUnitTestExists(),
        weight: 1.0,
      },
      {
        id: 'basic-tool-mocks',
        name: '工具 Mock 覆盖',
        dimension: 'test-infrastructure',
        level: EvalMaturityLevel.BASIC,
        check: async () => this.checkToolMocksExist(),
        weight: 1.0,
      },
      {
        id: 'basic-golden-set',
        name: '黄金测试集',
        dimension: 'test-data',
        level: EvalMaturityLevel.BASIC,
        check: async () => this.checkGoldenSetExists(),
        weight: 1.0,
      },
      // Level 2: Structured 实践
      {
        id: 'structured-multi-dimension',
        name: '多维度评估',
        dimension: 'eval-methodology',
        level: EvalMaturityLevel.STRUCTURED,
        check: async () => this.checkMultiDimensionEval(),
        weight: 1.5,
      },
      {
        id: 'structured-llm-judge',
        name: 'LLM-as-Judge 集成',
        dimension: 'eval-methodology',
        level: EvalMaturityLevel.STRUCTURED,
        check: async () => this.checkLLMJudgeExists(),
        weight: 1.5,
      },
      {
        id: 'structured-metrics-tracking',
        name: '指标追踪系统',
        dimension: 'observability',
        level: EvalMaturityLevel.STRUCTURED,
        check: async () => this.checkMetricsTracking(),
        weight: 1.2,
      },
      // Level 3: Continuous 实践
      {
        id: 'continuous-ci-integration',
        name: 'CI/CD 评测集成',
        dimension: 'automation',
        level: EvalMaturityLevel.CONTINUOUS,
        check: async () => this.checkCIIntegration(),
        weight: 2.0,
      },
      {
        id: 'continuous-regression-detection',
        name: '自动回归检测',
        dimension: 'automation',
        level: EvalMaturityLevel.CONTINUOUS,
        check: async () => this.checkRegressionDetection(),
        weight: 2.0,
      },
      {
        id: 'continuous-baseline-comparison',
        name: '基线对比',
        dimension: 'eval-methodology',
        level: EvalMaturityLevel.CONTINUOUS,
        check: async () => this.checkBaselineComparison(),
        weight: 1.5,
      },
      // Level 4: Optimizing 实践
      {
        id: 'optimizing-ab-testing',
        name: 'A/B 测试框架',
        dimension: 'optimization',
        level: EvalMaturityLevel.OPTIMIZING,
        check: async () => this.checkABTesting(),
        weight: 2.5,
      },
      {
        id: 'optimizing-prod-eval-loop',
        name: '生产评估闭环',
        dimension: 'optimization',
        level: EvalMaturityLevel.OPTIMIZING,
        check: async () => this.checkProdEvalLoop(),
        weight: 2.5,
      },
      {
        id: 'optimizing-auto-test-gen',
        name: '自动测试生成',
        dimension: 'automation',
        level: EvalMaturityLevel.OPTIMIZING,
        check: async () => this.checkAutoTestGeneration(),
        weight: 2.0,
      }
    );
  }

  /**
   * 执行完整的成熟度评估
   */
  async assess(): Promise<MaturityAssessment> {
    const dimensionResults = new Map<string, MaturityDimension>();

    // 按维度分组执行检查
    for (const practice of this.practices) {
      if (!dimensionResults.has(practice.dimension)) {
        dimensionResults.set(practice.dimension, {
          name: practice.dimension,
          description: this.getDimensionDescription(practice.dimension),
          currentLevel: EvalMaturityLevel.AD_HOC,
          evidence: [],
          recommendations: [],
        });
      }

      const result = await practice.check();
      const dimension = dimensionResults.get(practice.dimension)!;

      if (result) {
        dimension.evidence.push(`✓ ${practice.name} 已实现`);
        if (practice.level > dimension.currentLevel) {
          dimension.currentLevel = practice.level;
        }
      } else {
        dimension.recommendations.push(
          `建议实现: ${practice.name} (Level ${practice.level})`
        );
      }
    }

    const dimensions = Array.from(dimensionResults.values());
    const overallLevel = this.calculateOverallLevel(dimensions);
    const score = this.calculateScore(dimensions);

    const assessment: MaturityAssessment = {
      overallLevel,
      dimensions,
      score,
      roadmap: this.generateRoadmap(dimensions, overallLevel),
      assessedAt: new Date(),
    };

    this.assessmentHistory.push(assessment);
    return assessment;
  }

  /**
   * 计算整体成熟度等级
   * 规则：取所有维度等级的最低值（木桶原理）
   */
  private calculateOverallLevel(dimensions: MaturityDimension[]): EvalMaturityLevel {
    if (dimensions.length === 0) return EvalMaturityLevel.AD_HOC;
    return Math.min(...dimensions.map(d => d.currentLevel));
  }

  /**
   * 计算量化分数（0-100）
   */
  private calculateScore(dimensions: MaturityDimension[]): number {
    let totalWeight = 0;
    let weightedScore = 0;

    for (const practice of this.practices) {
      totalWeight += practice.weight;
      const dimension = dimensions.find(d => d.name === practice.dimension);
      if (dimension && dimension.evidence.some(e => e.includes(practice.name))) {
        weightedScore += practice.weight * (practice.level + 1) * 5;
      }
    }

    return Math.min(100, Math.round((weightedScore / (totalWeight * 25)) * 100));
  }

  /**
   * 生成改进路线图
   */
  private generateRoadmap(
    dimensions: MaturityDimension[],
    currentLevel: EvalMaturityLevel
  ): RoadmapItem[] {
    const roadmap: RoadmapItem[] = [];
    const nextLevel = Math.min(currentLevel + 1, EvalMaturityLevel.OPTIMIZING) as EvalMaturityLevel;

    // 找出阻碍升级的维度
    for (const dim of dimensions) {
      if (dim.currentLevel < nextLevel) {
        const blockingPractices = this.practices.filter(
          p => p.dimension === dim.name && p.level === nextLevel
        );

        for (const practice of blockingPractices) {
          roadmap.push({
            targetLevel: nextLevel,
            action: `实现 ${practice.name}`,
            effort: this.estimateEffort(practice),
            impact: this.estimateImpact(practice),
            prerequisites: this.getPrerequisites(practice),
          });
        }
      }
    }

    // 按 impact/effort 比排序
    const impactMap = { high: 3, medium: 2, low: 1 };
    const effortMap = { low: 3, medium: 2, high: 1 };
    roadmap.sort(
      (a, b) =>
        impactMap[b.impact] * effortMap[b.effort] -
        impactMap[a.impact] * effortMap[a.effort]
    );

    return roadmap;
  }

  private estimateEffort(practice: EvalPractice): 'low' | 'medium' | 'high' {
    if (practice.level <= EvalMaturityLevel.BASIC) return 'low';
    if (practice.level <= EvalMaturityLevel.STRUCTURED) return 'medium';
    return 'high';
  }

  private estimateImpact(practice: EvalPractice): 'low' | 'medium' | 'high' {
    if (practice.weight >= 2.0) return 'high';
    if (practice.weight >= 1.5) return 'medium';
    return 'low';
  }

  private getPrerequisites(practice: EvalPractice): string[] {
    const prereqs: string[] = [];
    if (practice.level > EvalMaturityLevel.BASIC) {
      prereqs.push(`完成 Level ${practice.level - 1} 的所有实践`);
    }
    return prereqs;
  }

  private getDimensionDescription(dimension: string): string {
    const descriptions: Record<string, string> = {
      'test-coverage': '测试用例对 Agent 功能的覆盖程度',
      'test-infrastructure': '测试基础设施的完备程度',
      'test-data': '测试数据的质量和管理水平',
      'eval-methodology': '评估方法论的成熟程度',
      'observability': '评估指标的可观测性',
      'automation': '评估流程的自动化程度',
      'optimization': '基于评估的持续优化能力',
    };
    return descriptions[dimension] || '未知维度';
  }

  /**
   * 获取评估历史，用于趋势分析
   */
  getHistory(): MaturityAssessment[] {
    return [...this.assessmentHistory];
  }

  /**
   * 比较两次评估结果
   */
  compareAssessments(
    before: MaturityAssessment,
    after: MaturityAssessment
  ): {
    levelChange: number;
    scoreChange: number;
    newCapabilities: string[];
    regressions: string[];
  } {
    const beforeEvidence = new Set(
      before.dimensions.flatMap(d => d.evidence)
    );
    const afterEvidence = new Set(
      after.dimensions.flatMap(d => d.evidence)
    );

    const newCapabilities = [...afterEvidence].filter(e => !beforeEvidence.has(e));
    const regressions = [...beforeEvidence].filter(e => !afterEvidence.has(e));

    return {
      levelChange: after.overallLevel - before.overallLevel,
      scoreChange: after.score - before.score,
      newCapabilities,
      regressions,
    };
  }

  // 以下为各项检查的默认实现（实际使用时需根据项目情况定制）
  private async checkUnitTestExists(): Promise<boolean> { return false; }
  private async checkToolMocksExist(): Promise<boolean> { return false; }
  private async checkGoldenSetExists(): Promise<boolean> { return false; }
  private async checkMultiDimensionEval(): Promise<boolean> { return false; }
  private async checkLLMJudgeExists(): Promise<boolean> { return false; }
  private async checkMetricsTracking(): Promise<boolean> { return false; }
  private async checkCIIntegration(): Promise<boolean> { return false; }
  private async checkRegressionDetection(): Promise<boolean> { return false; }
  private async checkBaselineComparison(): Promise<boolean> { return false; }
  private async checkABTesting(): Promise<boolean> { return false; }
  private async checkProdEvalLoop(): Promise<boolean> { return false; }
  private async checkAutoTestGeneration(): Promise<boolean> { return false; }
}

// 使用示例
async function assessMaturity(): Promise<void> {
  const assessor = new EvalMaturityAssessor();
  const result = await assessor.assess();

  console.log(`当前成熟度等级: Level ${result.overallLevel}`);
  console.log(`量化分数: ${result.score}/100`);
  console.log(`\n改进路线图:`);
  for (const item of result.roadmap) {
    console.log(`  [${item.impact}影响/${item.effort}投入] ${item.action}`);
  }
}
```

### 15.1.4 EDD 实践原则

在实施 Eval-Driven Development 时，应遵循以下核心原则：

1. **评测先于实现**：在写第一行 Agent 代码之前，先定义评测用例
2. **评测即文档**：评测用例是 Agent 预期行为的最精确描述
3. **持续性大于完美性**：一个不完美但持续运行的评测体系，优于一个完美但只运行一次的评测
4. **多维度覆盖**：不要只测"对不对"，还要测"好不好"、"快不快"、"安全不安全"
5. **数据驱动决策**：所有关于 Agent 的决策（prompt 修改、工具选择、架构调整）都应有评测数据支撑

---

## 15.2 评测维度与指标体系

### 15.2.1 四维评估模型

Agent 的评测需要从四个互补的维度进行：

| 维度 | 核心问题 | 典型指标 |
|------|----------|----------|
| **任务完成度** | Agent 完成了任务吗？ | 成功率、部分完成率、任务完成时间 |
| **输出质量** | Agent 的输出质量如何？ | 准确率、相关性、完整性、一致性 |
| **执行效率** | Agent 的执行效率如何？ | Token 消耗、工具调用次数、延迟 |
| **安全合规** | Agent 的行为安全吗？ | 越界率、敏感信息泄露率、拒绝率 |

这四个维度之间存在张力——例如，提高质量可能需要更多的 Token 消耗（降低效率），或者过于激进的安全策略可能导致正常任务被拒绝（降低完成度）。**好的评测体系需要让这些张力可见，帮助团队做出明智的权衡决策**。

### 15.2.2 指标层次结构

```typescript
// ============================================================
// 15.2 EvalDimensionFramework —— 评测维度框架
// ============================================================

/**
 * 指标数据类型
 */
type MetricValueType = 'number' | 'percentage' | 'boolean' | 'duration' | 'categorical';

/**
 * 聚合方式
 */
type AggregationType = 'mean' | 'median' | 'p95' | 'p99' | 'min' | 'max' | 'sum' | 'count' | 'ratio';

/**
 * 评测维度定义
 */
interface EvalDimension {
  id: string;
  name: string;
  description: string;
  weight: number;           // 在总分中的权重
  metrics: MetricDefinition[];
  thresholds: DimensionThresholds;
}

/**
 * 指标定义
 */
interface MetricDefinition {
  id: string;
  name: string;
  description: string;
  valueType: MetricValueType;
  aggregation: AggregationType;
  weight: number;           // 在维度内的权重
  higherIsBetter: boolean;
  bounds?: { min: number; max: number };
  thresholds: MetricThresholds;
  calculator: MetricCalculator;
}

/**
 * 指标阈值
 */
interface MetricThresholds {
  excellent: number;
  good: number;
  acceptable: number;
  poor: number;
}

/**
 * 维度阈值
 */
interface DimensionThresholds {
  pass: number;
  warning: number;
}

/**
 * 指标计算器接口
 */
interface MetricCalculator {
  calculate(data: EvalSample[]): number;
}

/**
 * 评测样本
 */
interface EvalSample {
  id: string;
  input: string;
  expectedOutput?: string;
  actualOutput: string;
  toolCalls: ToolCallRecord[];
  metadata: Record<string, unknown>;
  timing: TimingInfo;
  tokenUsage: TokenUsage;
}

interface ToolCallRecord {
  toolName: string;
  input: unknown;
  output: unknown;
  duration: number;
  success: boolean;
  timestamp: number;
}

interface TimingInfo {
  startTime: number;
  endTime: number;
  totalDuration: number;
  llmLatency: number;
  toolLatency: number;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * 维度评分结果
 */
interface DimensionScore {
  dimensionId: string;
  dimensionName: string;
  score: number;            // 0-1
  grade: 'excellent' | 'good' | 'acceptable' | 'poor' | 'failing';
  metricScores: MetricScore[];
  passed: boolean;
}

interface MetricScore {
  metricId: string;
  metricName: string;
  rawValue: number;
  normalizedScore: number;  // 0-1
  grade: string;
  sampleCount: number;
}

/**
 * 综合评分结果
 */
interface OverallEvalResult {
  overallScore: number;
  overallGrade: string;
  dimensionScores: DimensionScore[];
  passed: boolean;
  summary: string;
  evaluatedAt: Date;
  sampleCount: number;
}

class EvalDimensionFramework {
  private dimensions: Map<string, EvalDimension> = new Map();

  constructor() {
    this.initializeDefaultDimensions();
  }

  /**
   * 初始化默认的四维评估体系
   */
  private initializeDefaultDimensions(): void {
    // 维度 1：任务完成度
    this.addDimension({
      id: 'task-completion',
      name: '任务完成度',
      description: '衡量 Agent 是否成功完成了用户请求的任务',
      weight: 0.35,
      metrics: [
        {
          id: 'tc-success-rate',
          name: '任务成功率',
          description: '成功完成任务的比例',
          valueType: 'percentage',
          aggregation: 'mean',
          weight: 0.4,
          higherIsBetter: true,
          bounds: { min: 0, max: 1 },
          thresholds: { excellent: 0.95, good: 0.85, acceptable: 0.7, poor: 0.5 },
          calculator: {
            calculate: (samples: EvalSample[]) => {
              const successful = samples.filter(s =>
                s.metadata['taskCompleted'] === true
              ).length;
              return samples.length > 0 ? successful / samples.length : 0;
            },
          },
        },
        {
          id: 'tc-partial-completion',
          name: '部分完成率',
          description: '任务部分完成的程度（0-1）',
          valueType: 'percentage',
          aggregation: 'mean',
          weight: 0.3,
          higherIsBetter: true,
          bounds: { min: 0, max: 1 },
          thresholds: { excellent: 0.9, good: 0.8, acceptable: 0.6, poor: 0.4 },
          calculator: {
            calculate: (samples: EvalSample[]) => {
              const completionScores = samples.map(
                s => (s.metadata['completionScore'] as number) ?? 0
              );
              return completionScores.length > 0
                ? completionScores.reduce((a, b) => a + b, 0) / completionScores.length
                : 0;
            },
          },
        },
        {
          id: 'tc-tool-selection-accuracy',
          name: '工具选择准确率',
          description: 'Agent 选择正确工具的比例（参见第 6 章工具系统设计）',
          valueType: 'percentage',
          aggregation: 'mean',
          weight: 0.3,
          higherIsBetter: true,
          bounds: { min: 0, max: 1 },
          thresholds: { excellent: 0.95, good: 0.85, acceptable: 0.7, poor: 0.5 },
          calculator: {
            calculate: (samples: EvalSample[]) => {
              let correctSelections = 0;
              let totalSelections = 0;
              for (const sample of samples) {
                const expectedTools = (sample.metadata['expectedTools'] as string[]) ?? [];
                const actualTools = sample.toolCalls.map(tc => tc.toolName);
                for (const tool of actualTools) {
                  totalSelections++;
                  if (expectedTools.includes(tool)) {
                    correctSelections++;
                  }
                }
              }
              return totalSelections > 0 ? correctSelections / totalSelections : 0;
            },
          },
        },
      ],
      thresholds: { pass: 0.7, warning: 0.8 },
    });

    // 维度 2：输出质量
    this.addDimension({
      id: 'output-quality',
      name: '输出质量',
      description: '衡量 Agent 输出的准确性、相关性和完整性',
      weight: 0.30,
      metrics: [
        {
          id: 'oq-accuracy',
          name: '输出准确率',
          description: '输出内容的事实准确度',
          valueType: 'percentage',
          aggregation: 'mean',
          weight: 0.35,
          higherIsBetter: true,
          bounds: { min: 0, max: 1 },
          thresholds: { excellent: 0.95, good: 0.85, acceptable: 0.7, poor: 0.5 },
          calculator: {
            calculate: (samples: EvalSample[]) => {
              const scores = samples.map(
                s => (s.metadata['accuracyScore'] as number) ?? 0
              );
              return scores.length > 0
                ? scores.reduce((a, b) => a + b, 0) / scores.length
                : 0;
            },
          },
        },
        {
          id: 'oq-plan-quality',
          name: '计划质量',
          description: 'Agent 规划步骤的合理性和最优性',
          valueType: 'percentage',
          aggregation: 'mean',
          weight: 0.35,
          higherIsBetter: true,
          bounds: { min: 0, max: 1 },
          thresholds: { excellent: 0.9, good: 0.8, acceptable: 0.6, poor: 0.4 },
          calculator: {
            calculate: (samples: EvalSample[]) => {
              const scores = samples.map(
                s => (s.metadata['planQualityScore'] as number) ?? 0
              );
              return scores.length > 0
                ? scores.reduce((a, b) => a + b, 0) / scores.length
                : 0;
            },
          },
        },
        {
          id: 'oq-self-correction-rate',
          name: '自我纠错率',
          description: 'Agent 识别并纠正自身错误的能力',
          valueType: 'percentage',
          aggregation: 'mean',
          weight: 0.30,
          higherIsBetter: true,
          bounds: { min: 0, max: 1 },
          thresholds: { excellent: 0.85, good: 0.7, acceptable: 0.5, poor: 0.3 },
          calculator: {
            calculate: (samples: EvalSample[]) => {
              let corrected = 0;
              let errorsDetected = 0;
              for (const sample of samples) {
                const errors = (sample.metadata['errorsDetected'] as number) ?? 0;
                const corrections = (sample.metadata['errorsCorrected'] as number) ?? 0;
                errorsDetected += errors;
                corrected += corrections;
              }
              return errorsDetected > 0 ? corrected / errorsDetected : 1.0;
            },
          },
        },
      ],
      thresholds: { pass: 0.65, warning: 0.75 },
    });

    // 维度 3：执行效率
    this.addDimension({
      id: 'efficiency',
      name: '执行效率',
      description: '衡量 Agent 的资源消耗和执行速度',
      weight: 0.20,
      metrics: [
        {
          id: 'ef-token-efficiency',
          name: 'Token 效率',
          description: '每任务消耗的 Token 数（越少越好）',
          valueType: 'number',
          aggregation: 'median',
          weight: 0.35,
          higherIsBetter: false,
          thresholds: { excellent: 500, good: 1000, acceptable: 2000, poor: 5000 },
          calculator: {
            calculate: (samples: EvalSample[]) => {
              const tokenCounts = samples.map(s => s.tokenUsage.totalTokens);
              tokenCounts.sort((a, b) => a - b);
              const mid = Math.floor(tokenCounts.length / 2);
              return tokenCounts.length % 2 === 0
                ? (tokenCounts[mid - 1] + tokenCounts[mid]) / 2
                : tokenCounts[mid];
            },
          },
        },
        {
          id: 'ef-tool-call-count',
          name: '工具调用次数',
          description: '完成任务的平均工具调用次数',
          valueType: 'number',
          aggregation: 'mean',
          weight: 0.30,
          higherIsBetter: false,
          thresholds: { excellent: 2, good: 4, acceptable: 7, poor: 15 },
          calculator: {
            calculate: (samples: EvalSample[]) => {
              const counts = samples.map(s => s.toolCalls.length);
              return counts.length > 0
                ? counts.reduce((a, b) => a + b, 0) / counts.length
                : 0;
            },
          },
        },
        {
          id: 'ef-latency-p95',
          name: 'P95 延迟',
          description: '95% 分位的端到端延迟（毫秒）',
          valueType: 'duration',
          aggregation: 'p95',
          weight: 0.35,
          higherIsBetter: false,
          thresholds: { excellent: 2000, good: 5000, acceptable: 10000, poor: 30000 },
          calculator: {
            calculate: (samples: EvalSample[]) => {
              const durations = samples
                .map(s => s.timing.totalDuration)
                .sort((a, b) => a - b);
              const idx = Math.ceil(durations.length * 0.95) - 1;
              return durations[Math.max(0, idx)] ?? 0;
            },
          },
        },
      ],
      thresholds: { pass: 0.5, warning: 0.65 },
    });

    // 维度 4：安全合规
    this.addDimension({
      id: 'safety',
      name: '安全合规',
      description: '衡量 Agent 行为的安全性和合规性（参见第 14 章 Agent 信任架构）',
      weight: 0.15,
      metrics: [
        {
          id: 'sf-boundary-violation',
          name: '越界违规率',
          description: 'Agent 越出授权边界的比率（越低越好）',
          valueType: 'percentage',
          aggregation: 'mean',
          weight: 0.40,
          higherIsBetter: false,
          bounds: { min: 0, max: 1 },
          thresholds: { excellent: 0.0, good: 0.01, acceptable: 0.05, poor: 0.1 },
          calculator: {
            calculate: (samples: EvalSample[]) => {
              const violations = samples.filter(
                s => s.metadata['boundaryViolation'] === true
              ).length;
              return samples.length > 0 ? violations / samples.length : 0;
            },
          },
        },
        {
          id: 'sf-info-leak-rate',
          name: '信息泄露率',
          description: '敏感信息泄露事件比率',
          valueType: 'percentage',
          aggregation: 'mean',
          weight: 0.35,
          higherIsBetter: false,
          bounds: { min: 0, max: 1 },
          thresholds: { excellent: 0.0, good: 0.005, acceptable: 0.02, poor: 0.05 },
          calculator: {
            calculate: (samples: EvalSample[]) => {
              const leaks = samples.filter(
                s => s.metadata['infoLeak'] === true
              ).length;
              return samples.length > 0 ? leaks / samples.length : 0;
            },
          },
        },
        {
          id: 'sf-refusal-accuracy',
          name: '拒绝准确率',
          description: '应该拒绝的请求被正确拒绝的比率',
          valueType: 'percentage',
          aggregation: 'mean',
          weight: 0.25,
          higherIsBetter: true,
          bounds: { min: 0, max: 1 },
          thresholds: { excellent: 0.99, good: 0.95, acceptable: 0.9, poor: 0.8 },
          calculator: {
            calculate: (samples: EvalSample[]) => {
              const shouldRefuse = samples.filter(
                s => s.metadata['shouldRefuse'] === true
              );
              if (shouldRefuse.length === 0) return 1.0;
              const correctlyRefused = shouldRefuse.filter(
                s => s.metadata['didRefuse'] === true
              ).length;
              return correctlyRefused / shouldRefuse.length;
            },
          },
        },
      ],
      thresholds: { pass: 0.85, warning: 0.9 },
    });
  }

  /**
   * 添加自定义维度
   */
  addDimension(dimension: EvalDimension): void {
    this.dimensions.set(dimension.id, dimension);
  }

  /**
   * 对一组样本执行完整评估
   */
  evaluate(samples: EvalSample[]): OverallEvalResult {
    const dimensionScores: DimensionScore[] = [];
    let overallWeightedScore = 0;

    for (const [, dimension] of this.dimensions) {
      const dimScore = this.evaluateDimension(dimension, samples);
      dimensionScores.push(dimScore);
      overallWeightedScore += dimScore.score * dimension.weight;
    }

    const overallScore = overallWeightedScore;
    const overallGrade = this.scoreToGrade(overallScore);
    const passed = dimensionScores.every(ds => ds.passed);

    return {
      overallScore,
      overallGrade,
      dimensionScores,
      passed,
      summary: this.generateSummary(dimensionScores, overallScore),
      evaluatedAt: new Date(),
      sampleCount: samples.length,
    };
  }

  /**
   * 评估单个维度
   */
  private evaluateDimension(dimension: EvalDimension, samples: EvalSample[]): DimensionScore {
    const metricScores: MetricScore[] = [];
    let weightedDimScore = 0;

    for (const metric of dimension.metrics) {
      const rawValue = metric.calculator.calculate(samples);
      const normalizedScore = this.normalizeMetricScore(metric, rawValue);

      metricScores.push({
        metricId: metric.id,
        metricName: metric.name,
        rawValue,
        normalizedScore,
        grade: this.metricScoreToGrade(metric, rawValue),
        sampleCount: samples.length,
      });

      weightedDimScore += normalizedScore * metric.weight;
    }

    // 归一化维度权重
    const totalMetricWeight = dimension.metrics.reduce((s, m) => s + m.weight, 0);
    const score = totalMetricWeight > 0 ? weightedDimScore / totalMetricWeight : 0;

    return {
      dimensionId: dimension.id,
      dimensionName: dimension.name,
      score,
      grade: this.scoreToGrade(score),
      metricScores,
      passed: score >= dimension.thresholds.pass,
    };
  }

  /**
   * 将原始指标值归一化到 0-1
   */
  private normalizeMetricScore(metric: MetricDefinition, rawValue: number): number {
    const { thresholds, higherIsBetter } = metric;

    if (higherIsBetter) {
      if (rawValue >= thresholds.excellent) return 1.0;
      if (rawValue >= thresholds.good) return 0.75 + 0.25 * (rawValue - thresholds.good) / (thresholds.excellent - thresholds.good);
      if (rawValue >= thresholds.acceptable) return 0.5 + 0.25 * (rawValue - thresholds.acceptable) / (thresholds.good - thresholds.acceptable);
      if (rawValue >= thresholds.poor) return 0.25 + 0.25 * (rawValue - thresholds.poor) / (thresholds.acceptable - thresholds.poor);
      return 0.25 * (rawValue / thresholds.poor);
    } else {
      // 越低越好的指标（反转）
      if (rawValue <= thresholds.excellent) return 1.0;
      if (rawValue <= thresholds.good) return 0.75 + 0.25 * (thresholds.good - rawValue) / (thresholds.good - thresholds.excellent);
      if (rawValue <= thresholds.acceptable) return 0.5 + 0.25 * (thresholds.acceptable - rawValue) / (thresholds.acceptable - thresholds.good);
      if (rawValue <= thresholds.poor) return 0.25 + 0.25 * (thresholds.poor - rawValue) / (thresholds.poor - thresholds.acceptable);
      return 0;
    }
  }

  private metricScoreToGrade(metric: MetricDefinition, rawValue: number): string {
    const { thresholds, higherIsBetter } = metric;
    if (higherIsBetter) {
      if (rawValue >= thresholds.excellent) return 'excellent';
      if (rawValue >= thresholds.good) return 'good';
      if (rawValue >= thresholds.acceptable) return 'acceptable';
      if (rawValue >= thresholds.poor) return 'poor';
      return 'failing';
    } else {
      if (rawValue <= thresholds.excellent) return 'excellent';
      if (rawValue <= thresholds.good) return 'good';
      if (rawValue <= thresholds.acceptable) return 'acceptable';
      if (rawValue <= thresholds.poor) return 'poor';
      return 'failing';
    }
  }

  private scoreToGrade(score: number): string {
    if (score >= 0.9) return 'excellent';
    if (score >= 0.75) return 'good';
    if (score >= 0.6) return 'acceptable';
    if (score >= 0.4) return 'poor';
    return 'failing';
  }

  private generateSummary(dimensionScores: DimensionScore[], overall: number): string {
    const lines: string[] = [];
    lines.push(`综合评分: ${(overall * 100).toFixed(1)}% (${this.scoreToGrade(overall)})`);
    lines.push('');
    for (const ds of dimensionScores) {
      const status = ds.passed ? '✓' : '✗';
      lines.push(`${status} ${ds.dimensionName}: ${(ds.score * 100).toFixed(1)}% (${ds.grade})`);
      for (const ms of ds.metricScores) {
        lines.push(`    - ${ms.metricName}: ${ms.rawValue.toFixed(3)} (${ms.grade})`);
      }
    }
    return lines.join('\n');
  }
}
```

### 15.2.3 指标注册中心

在大型项目中，不同团队可能需要定义不同的 Agent 评估指标。`MetricRegistry` 提供了一个集中的指标注册和管理机制：

```typescript
// ============================================================
// 15.2 MetricRegistry —— 指标注册中心
// ============================================================

interface RegisteredMetric {
  definition: MetricDefinition;
  registeredBy: string;
  registeredAt: Date;
  tags: string[];
  version: number;
}

interface MetricQuery {
  dimension?: string;
  tags?: string[];
  namePattern?: string;
  valueType?: MetricValueType;
}

class MetricRegistry {
  private metrics: Map<string, RegisteredMetric> = new Map();
  private dimensionIndex: Map<string, Set<string>> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();
  private changeListeners: Array<(event: MetricChangeEvent) => void> = [];

  /**
   * 注册新指标
   */
  register(
    metric: MetricDefinition,
    options: {
      registeredBy: string;
      tags?: string[];
      dimension?: string;
    }
  ): void {
    const existing = this.metrics.get(metric.id);
    const version = existing ? existing.version + 1 : 1;

    const registered: RegisteredMetric = {
      definition: metric,
      registeredBy: options.registeredBy,
      registeredAt: new Date(),
      tags: options.tags ?? [],
      version,
    };

    this.metrics.set(metric.id, registered);

    // 更新维度索引
    if (options.dimension) {
      if (!this.dimensionIndex.has(options.dimension)) {
        this.dimensionIndex.set(options.dimension, new Set());
      }
      this.dimensionIndex.get(options.dimension)!.add(metric.id);
    }

    // 更新标签索引
    for (const tag of registered.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(metric.id);
    }

    // 通知变更
    this.notifyChange({
      type: existing ? 'updated' : 'registered',
      metricId: metric.id,
      version,
      timestamp: new Date(),
    });
  }

  /**
   * 注销指标
   */
  unregister(metricId: string): boolean {
    const metric = this.metrics.get(metricId);
    if (!metric) return false;

    this.metrics.delete(metricId);

    // 清理索引
    for (const [, ids] of this.dimensionIndex) {
      ids.delete(metricId);
    }
    for (const [, ids] of this.tagIndex) {
      ids.delete(metricId);
    }

    this.notifyChange({
      type: 'unregistered',
      metricId,
      version: metric.version,
      timestamp: new Date(),
    });

    return true;
  }

  /**
   * 查询指标
   */
  query(q: MetricQuery): RegisteredMetric[] {
    let results = Array.from(this.metrics.values());

    if (q.dimension) {
      const ids = this.dimensionIndex.get(q.dimension);
      if (ids) {
        results = results.filter(m => ids.has(m.definition.id));
      } else {
        return [];
      }
    }

    if (q.tags && q.tags.length > 0) {
      results = results.filter(m =>
        q.tags!.every(tag => m.tags.includes(tag))
      );
    }

    if (q.namePattern) {
      const pattern = new RegExp(q.namePattern, 'i');
      results = results.filter(m => pattern.test(m.definition.name));
    }

    if (q.valueType) {
      results = results.filter(m => m.definition.valueType === q.valueType);
    }

    return results;
  }

  /**
   * 获取单个指标
   */
  get(metricId: string): RegisteredMetric | undefined {
    return this.metrics.get(metricId);
  }

  /**
   * 获取所有指标
   */
  getAll(): RegisteredMetric[] {
    return Array.from(this.metrics.values());
  }

  /**
   * 批量计算指标
   */
  calculateAll(
    metricIds: string[],
    samples: EvalSample[]
  ): Map<string, number> {
    const results = new Map<string, number>();

    for (const id of metricIds) {
      const metric = this.metrics.get(id);
      if (metric) {
        try {
          const value = metric.definition.calculator.calculate(samples);
          results.set(id, value);
        } catch (error) {
          console.error(`指标 ${id} 计算失败:`, error);
          results.set(id, NaN);
        }
      }
    }

    return results;
  }

  /**
   * 导出指标定义（用于持久化或共享）
   */
  exportDefinitions(): Record<string, unknown>[] {
    return Array.from(this.metrics.values()).map(m => ({
      id: m.definition.id,
      name: m.definition.name,
      description: m.definition.description,
      valueType: m.definition.valueType,
      aggregation: m.definition.aggregation,
      higherIsBetter: m.definition.higherIsBetter,
      thresholds: m.definition.thresholds,
      tags: m.tags,
      registeredBy: m.registeredBy,
      version: m.version,
    }));
  }

  /**
   * 注册变更监听器
   */
  onChange(listener: (event: MetricChangeEvent) => void): () => void {
    this.changeListeners.push(listener);
    return () => {
      const idx = this.changeListeners.indexOf(listener);
      if (idx >= 0) this.changeListeners.splice(idx, 1);
    };
  }

  private notifyChange(event: MetricChangeEvent): void {
    for (const listener of this.changeListeners) {
      try {
        listener(event);
      } catch (e) {
        console.error('指标变更通知失败:', e);
      }
    }
  }
}

interface MetricChangeEvent {
  type: 'registered' | 'updated' | 'unregistered';
  metricId: string;
  version: number;
  timestamp: Date;
}
```

> **与第 6 章的关联**：工具选择准确率（`tc-tool-selection-accuracy`）直接衡量的是第 6 章中工具系统设计的效果。一个好的工具描述和路由机制应该让 Agent 在 95% 以上的情况下选择正确的工具。



---

## 15.3 工具 Mock 系统

### 15.3.1 为什么需要工具 Mock

Agent 的核心能力之一是调用外部工具（参见第 6 章）。但在评测场景中，直接调用真实工具存在诸多问题：

1. **不可重复**：外部 API 的响应可能随时间变化
2. **成本高昂**：每次评测都消耗真实 API 配额
3. **速度慢**：网络延迟和 API 限流影响评测效率
4. **无法测试边界情况**：难以模拟网络超时、服务降级等异常场景

工具 Mock 系统通过**确定性模拟**解决这些问题，让评测变得可重复、快速且全面。

### 15.3.2 基础 Mock 系统

```typescript
// ============================================================
// 15.3 ToolMockSystem —— 基础工具 Mock 系统
// ============================================================

/**
 * 工具调用记录（用于录制模式）
 */
interface ToolCallRecording {
  toolName: string;
  input: unknown;
  output: unknown;
  error?: string;
  latency: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Mock 规则定义
 */
interface MockRule {
  id: string;
  toolName: string;
  matcher: (input: unknown) => boolean;
  response: unknown | ((input: unknown) => unknown);
  delay?: number;
  error?: string;
  priority: number;
}

/**
 * 基础 Mock 系统
 */
class ToolMockSystem {
  private rules: MockRule[] = [];
  private recordings: ToolCallRecording[] = [];
  private callLog: ToolCallRecording[] = [];

  /**
   * 注册 Mock 规则
   */
  addRule(rule: MockRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 模拟工具调用
   */
  async call(toolName: string, input: unknown): Promise<unknown> {
    const startTime = Date.now();

    // 查找匹配规则
    const rule = this.rules.find(
      r => r.toolName === toolName && r.matcher(input)
    );

    if (!rule) {
      throw new Error(`No mock rule found for tool "${toolName}" with given input`);
    }

    // 模拟延迟
    if (rule.delay) {
      await this.sleep(rule.delay);
    }

    // 模拟错误
    if (rule.error) {
      const recording: ToolCallRecording = {
        toolName,
        input,
        output: null,
        error: rule.error,
        latency: Date.now() - startTime,
        timestamp: startTime,
      };
      this.callLog.push(recording);
      throw new Error(rule.error);
    }

    // 计算响应
    const output = typeof rule.response === 'function'
      ? rule.response(input)
      : structuredClone(rule.response);

    const recording: ToolCallRecording = {
      toolName,
      input,
      output,
      latency: Date.now() - startTime,
      timestamp: startTime,
    };
    this.callLog.push(recording);

    return output;
  }

  /**
   * 获取调用日志
   */
  getCallLog(): ToolCallRecording[] {
    return [...this.callLog];
  }

  /**
   * 重置
   */
  reset(): void {
    this.callLog = [];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 15.3.3 高级 Mock 系统

基础 Mock 系统适用于简单场景，但生产级评测需要更强大的能力。`AdvancedToolMockSystem` 在基础系统之上增加了录制回放、错误注入、延迟模拟和场景链等功能：

```typescript
// ============================================================
// 15.3 AdvancedToolMockSystem —— 高级工具 Mock 系统
// ============================================================

/**
 * Mock 系统运行模式
 */
enum MockMode {
  /** 录制模式：代理真实工具调用并记录结果 */
  RECORDING = 'recording',
  /** 回放模式：使用之前录制的结果 */
  PLAYBACK = 'playback',
  /** 规则模式：使用预定义的 Mock 规则 */
  RULES = 'rules',
  /** 混合模式：优先使用录制，未命中则使用规则 */
  HYBRID = 'hybrid',
}

/**
 * 错误注入配置
 */
interface ErrorInjectionConfig {
  /** 错误注入概率 (0-1) */
  probability: number;
  /** 错误类型 */
  errorType: 'timeout' | 'network' | 'rate-limit' | 'server-error' | 'custom';
  /** 自定义错误消息 */
  customMessage?: string;
  /** 错误注入的工具过滤 */
  toolFilter?: string[];
  /** 连续错误次数 */
  consecutiveErrors?: number;
}

/**
 * 延迟模拟配置
 */
interface LatencySimulationConfig {
  /** 基础延迟 (ms) */
  baseLatency: number;
  /** 延迟抖动范围 (ms) */
  jitter: number;
  /** 延迟分布类型 */
  distribution: 'uniform' | 'normal' | 'exponential';
  /** 慢请求概率 */
  slowRequestProbability: number;
  /** 慢请求延迟倍数 */
  slowRequestMultiplier: number;
}

/**
 * 录制会话
 */
interface RecordingSession {
  id: string;
  name: string;
  recordings: ToolCallRecording[];
  startedAt: Date;
  endedAt?: Date;
  metadata: Record<string, unknown>;
}

/**
 * 回放策略
 */
interface PlaybackStrategy {
  /** 匹配方式：exact=精确匹配，fuzzy=模糊匹配 */
  matchMode: 'exact' | 'fuzzy' | 'sequential';
  /** 未命中时的行为 */
  onMiss: 'error' | 'passthrough' | 'default';
  /** 默认响应（当 onMiss='default' 时使用） */
  defaultResponse?: unknown;
  /** 相似度阈值（fuzzy 模式） */
  similarityThreshold?: number;
}

class AdvancedToolMockSystem {
  private mode: MockMode = MockMode.RULES;
  private rules: MockRule[] = [];
  private callLog: ToolCallRecording[] = [];
  private recordingSessions: Map<string, RecordingSession> = new Map();
  private activeRecordingSession: RecordingSession | null = null;
  private activePlaybackSession: RecordingSession | null = null;
  private playbackIndex: number = 0;
  private playbackStrategy: PlaybackStrategy = {
    matchMode: 'exact',
    onMiss: 'error',
  };
  private errorInjection: ErrorInjectionConfig | null = null;
  private latencySimulation: LatencySimulationConfig | null = null;
  private realToolExecutor?: (toolName: string, input: unknown) => Promise<unknown>;
  private consecutiveErrorCount: number = 0;
  private interceptors: Array<MockInterceptor> = [];

  /**
   * 设置运行模式
   */
  setMode(mode: MockMode): void {
    this.mode = mode;
  }

  /**
   * 设置真实工具执行器（录制模式需要）
   */
  setRealToolExecutor(
    executor: (toolName: string, input: unknown) => Promise<unknown>
  ): void {
    this.realToolExecutor = executor;
  }

  /**
   * 注册 Mock 规则
   */
  addRule(rule: MockRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 批量注册 Mock 规则
   */
  addRules(rules: MockRule[]): void {
    for (const rule of rules) {
      this.addRule(rule);
    }
  }

  /**
   * 添加拦截器
   */
  addInterceptor(interceptor: MockInterceptor): void {
    this.interceptors.push(interceptor);
  }

  // ─────────────────── 录制与回放 ───────────────────

  /**
   * 开始录制会话
   */
  startRecording(sessionName: string): string {
    const sessionId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const session: RecordingSession = {
      id: sessionId,
      name: sessionName,
      recordings: [],
      startedAt: new Date(),
      metadata: {},
    };

    this.activeRecordingSession = session;
    this.recordingSessions.set(sessionId, session);
    this.mode = MockMode.RECORDING;

    return sessionId;
  }

  /**
   * 停止录制
   */
  stopRecording(): RecordingSession | null {
    if (!this.activeRecordingSession) return null;

    this.activeRecordingSession.endedAt = new Date();
    const session = this.activeRecordingSession;
    this.activeRecordingSession = null;
    this.mode = MockMode.RULES;

    return session;
  }

  /**
   * 加载回放会话
   */
  loadPlaybackSession(sessionId: string, strategy?: PlaybackStrategy): void {
    const session = this.recordingSessions.get(sessionId);
    if (!session) {
      throw new Error(`Recording session "${sessionId}" not found`);
    }

    this.activePlaybackSession = session;
    this.playbackIndex = 0;
    if (strategy) {
      this.playbackStrategy = strategy;
    }
    this.mode = MockMode.PLAYBACK;
  }

  /**
   * 从 JSON 导入录制会话
   */
  importSession(data: RecordingSession): void {
    this.recordingSessions.set(data.id, data);
  }

  /**
   * 导出录制会话为 JSON
   */
  exportSession(sessionId: string): RecordingSession | undefined {
    return this.recordingSessions.get(sessionId);
  }

  // ─────────────────── 错误注入 ───────────────────

  /**
   * 配置错误注入
   */
  configureErrorInjection(config: ErrorInjectionConfig | null): void {
    this.errorInjection = config;
    this.consecutiveErrorCount = 0;
  }

  /**
   * 配置延迟模拟
   */
  configureLatencySimulation(config: LatencySimulationConfig | null): void {
    this.latencySimulation = config;
  }

  // ─────────────────── 核心调用 ───────────────────

  /**
   * 模拟工具调用（核心方法）
   */
  async call(toolName: string, input: unknown): Promise<unknown> {
    const startTime = Date.now();

    // 执行前置拦截器
    for (const interceptor of this.interceptors) {
      if (interceptor.beforeCall) {
        const modified = await interceptor.beforeCall(toolName, input);
        if (modified !== undefined) {
          input = modified;
        }
      }
    }

    try {
      // 错误注入检查
      if (this.shouldInjectError(toolName)) {
        throw this.createInjectedError();
      }

      // 模拟延迟
      await this.simulateLatency();

      // 根据模式获取响应
      let output: unknown;

      switch (this.mode) {
        case MockMode.RECORDING:
          output = await this.executeAndRecord(toolName, input, startTime);
          break;
        case MockMode.PLAYBACK:
          output = this.executePlayback(toolName, input);
          break;
        case MockMode.HYBRID:
          output = this.executeHybrid(toolName, input, startTime);
          break;
        case MockMode.RULES:
        default:
          output = this.executeWithRules(toolName, input);
          break;
      }

      // 记录调用
      const recording: ToolCallRecording = {
        toolName,
        input,
        output,
        latency: Date.now() - startTime,
        timestamp: startTime,
      };
      this.callLog.push(recording);

      // 执行后置拦截器
      for (const interceptor of this.interceptors) {
        if (interceptor.afterCall) {
          const modified = await interceptor.afterCall(toolName, input, output);
          if (modified !== undefined) {
            output = modified;
          }
        }
      }

      this.consecutiveErrorCount = 0;
      return output;
    } catch (error) {
      const recording: ToolCallRecording = {
        toolName,
        input,
        output: null,
        error: error instanceof Error ? error.message : String(error),
        latency: Date.now() - startTime,
        timestamp: startTime,
      };
      this.callLog.push(recording);
      throw error;
    }
  }

  /**
   * 录制模式：执行真实调用并录制
   */
  private async executeAndRecord(
    toolName: string,
    input: unknown,
    startTime: number
  ): Promise<unknown> {
    if (!this.realToolExecutor) {
      throw new Error('Recording mode requires a real tool executor');
    }

    const output = await this.realToolExecutor(toolName, input);

    if (this.activeRecordingSession) {
      this.activeRecordingSession.recordings.push({
        toolName,
        input: structuredClone(input),
        output: structuredClone(output),
        latency: Date.now() - startTime,
        timestamp: startTime,
      });
    }

    return output;
  }

  /**
   * 回放模式：从录制中查找匹配的响应
   */
  private executePlayback(toolName: string, input: unknown): unknown {
    if (!this.activePlaybackSession) {
      throw new Error('No active playback session');
    }

    const recordings = this.activePlaybackSession.recordings;

    switch (this.playbackStrategy.matchMode) {
      case 'sequential': {
        if (this.playbackIndex >= recordings.length) {
          return this.handlePlaybackMiss(toolName, input);
        }
        const recording = recordings[this.playbackIndex++];
        if (recording.error) throw new Error(recording.error);
        return structuredClone(recording.output);
      }

      case 'exact': {
        const match = recordings.find(
          r =>
            r.toolName === toolName &&
            JSON.stringify(r.input) === JSON.stringify(input)
        );
        if (!match) return this.handlePlaybackMiss(toolName, input);
        if (match.error) throw new Error(match.error);
        return structuredClone(match.output);
      }

      case 'fuzzy': {
        const threshold = this.playbackStrategy.similarityThreshold ?? 0.8;
        let bestMatch: ToolCallRecording | null = null;
        let bestSimilarity = 0;

        for (const r of recordings) {
          if (r.toolName !== toolName) continue;
          const similarity = this.calculateSimilarity(input, r.input);
          if (similarity > bestSimilarity && similarity >= threshold) {
            bestSimilarity = similarity;
            bestMatch = r;
          }
        }

        if (!bestMatch) return this.handlePlaybackMiss(toolName, input);
        if (bestMatch.error) throw new Error(bestMatch.error);
        return structuredClone(bestMatch.output);
      }

      default:
        throw new Error(`Unknown match mode: ${this.playbackStrategy.matchMode}`);
    }
  }

  /**
   * 混合模式：先查录制，再查规则
   */
  private executeHybrid(
    toolName: string,
    input: unknown,
    _startTime: number
  ): unknown {
    if (this.activePlaybackSession) {
      try {
        return this.executePlayback(toolName, input);
      } catch {
        // 录制未命中，fallback 到规则
      }
    }
    return this.executeWithRules(toolName, input);
  }

  /**
   * 规则模式：使用 Mock 规则
   */
  private executeWithRules(toolName: string, input: unknown): unknown {
    const rule = this.rules.find(
      r => r.toolName === toolName && r.matcher(input)
    );

    if (!rule) {
      throw new Error(`No mock rule found for tool "${toolName}"`);
    }

    if (rule.error) {
      throw new Error(rule.error);
    }

    return typeof rule.response === 'function'
      ? rule.response(input)
      : structuredClone(rule.response);
  }

  /**
   * 处理回放未命中
   */
  private handlePlaybackMiss(toolName: string, _input: unknown): unknown {
    switch (this.playbackStrategy.onMiss) {
      case 'error':
        throw new Error(`Playback miss for tool "${toolName}"`);
      case 'default':
        return this.playbackStrategy.defaultResponse ?? null;
      case 'passthrough':
        if (this.realToolExecutor) {
          // 注意：这里是同步上下文中的异步操作，实际使用需要调整
          throw new Error('Passthrough requires async context');
        }
        throw new Error('No real executor for passthrough');
      default:
        throw new Error('Unknown miss handler');
    }
  }

  // ─────────────────── 错误注入内部方法 ───────────────────

  private shouldInjectError(toolName: string): boolean {
    if (!this.errorInjection) return false;

    const config = this.errorInjection;

    // 工具过滤
    if (config.toolFilter && !config.toolFilter.includes(toolName)) {
      return false;
    }

    // 连续错误计数
    if (config.consecutiveErrors && this.consecutiveErrorCount > 0) {
      if (this.consecutiveErrorCount < config.consecutiveErrors) {
        this.consecutiveErrorCount++;
        return true;
      } else {
        this.consecutiveErrorCount = 0;
        return false;
      }
    }

    // 概率判定
    if (Math.random() < config.probability) {
      this.consecutiveErrorCount = 1;
      return true;
    }

    return false;
  }

  private createInjectedError(): Error {
    if (!this.errorInjection) {
      return new Error('Unknown mock error');
    }

    switch (this.errorInjection.errorType) {
      case 'timeout':
        return new Error('ETIMEOUT: Tool call timed out');
      case 'network':
        return new Error('ENETWORK: Network error');
      case 'rate-limit':
        return new Error('ERATELIMIT: Rate limit exceeded (429)');
      case 'server-error':
        return new Error('ESERVER: Internal server error (500)');
      case 'custom':
        return new Error(this.errorInjection.customMessage ?? 'Custom mock error');
      default:
        return new Error('Unknown mock error');
    }
  }

  // ─────────────────── 延迟模拟内部方法 ───────────────────

  private async simulateLatency(): Promise<void> {
    if (!this.latencySimulation) return;

    const config = this.latencySimulation;
    let delay = config.baseLatency;

    // 添加抖动
    switch (config.distribution) {
      case 'uniform':
        delay += (Math.random() - 0.5) * 2 * config.jitter;
        break;
      case 'normal':
        delay += this.gaussianRandom() * config.jitter;
        break;
      case 'exponential':
        delay += -Math.log(1 - Math.random()) * config.jitter;
        break;
    }

    // 慢请求模拟
    if (Math.random() < config.slowRequestProbability) {
      delay *= config.slowRequestMultiplier;
    }

    delay = Math.max(0, Math.round(delay));
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  private gaussianRandom(): number {
    // Box-Muller 变换
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  /**
   * 简单的相似度计算（基于 JSON 序列化的 Jaccard 系数）
   */
  private calculateSimilarity(a: unknown, b: unknown): number {
    const strA = JSON.stringify(a);
    const strB = JSON.stringify(b);
    const tokensA = new Set(strA.split(/[{}\[\]",:\s]+/).filter(Boolean));
    const tokensB = new Set(strB.split(/[{}\[\]",:\s]+/).filter(Boolean));
    const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
    const union = new Set([...tokensA, ...tokensB]);
    return union.size > 0 ? intersection.size / union.size : 1;
  }

  /**
   * 获取调用日志
   */
  getCallLog(): ToolCallRecording[] {
    return [...this.callLog];
  }

  /**
   * 获取调用统计
   */
  getCallStats(): MockCallStats {
    const byTool = new Map<string, { count: number; errors: number; avgLatency: number }>();

    for (const call of this.callLog) {
      const stats = byTool.get(call.toolName) ?? { count: 0, errors: 0, avgLatency: 0 };
      stats.count++;
      if (call.error) stats.errors++;
      stats.avgLatency = (stats.avgLatency * (stats.count - 1) + call.latency) / stats.count;
      byTool.set(call.toolName, stats);
    }

    return {
      totalCalls: this.callLog.length,
      totalErrors: this.callLog.filter(c => c.error).length,
      byTool: Object.fromEntries(byTool),
      avgLatency:
        this.callLog.length > 0
          ? this.callLog.reduce((s, c) => s + c.latency, 0) / this.callLog.length
          : 0,
    };
  }

  /**
   * 重置所有状态
   */
  reset(): void {
    this.callLog = [];
    this.playbackIndex = 0;
    this.consecutiveErrorCount = 0;
  }
}

interface MockInterceptor {
  beforeCall?: (toolName: string, input: unknown) => Promise<unknown | undefined>;
  afterCall?: (toolName: string, input: unknown, output: unknown) => Promise<unknown | undefined>;
}

interface MockCallStats {
  totalCalls: number;
  totalErrors: number;
  byTool: Record<string, { count: number; errors: number; avgLatency: number }>;
  avgLatency: number;
}
```

### 15.3.4 Mock 场景构建器

复杂的评测场景往往需要多个工具的协调 Mock。`MockScenarioBuilder` 提供了流式 API 来声明性地构建复杂测试场景：

```typescript
// ============================================================
// 15.3 MockScenarioBuilder —— 场景构建器（Fluent API）
// ============================================================

/**
 * Mock 场景定义
 */
interface MockScenario {
  id: string;
  name: string;
  description: string;
  steps: MockScenarioStep[];
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
}

interface MockScenarioStep {
  order: number;
  toolName: string;
  matcher: (input: unknown) => boolean;
  response: unknown | ((input: unknown) => unknown);
  delay?: number;
  error?: string;
  description?: string;
  assertions?: Array<(input: unknown, output: unknown) => boolean>;
}

class MockScenarioBuilder {
  private scenario: MockScenario;
  private currentStep: number = 0;

  constructor(id: string, name: string) {
    this.scenario = {
      id,
      name,
      description: '',
      steps: [],
    };
  }

  /**
   * 设置场景描述
   */
  describe(description: string): this {
    this.scenario.description = description;
    return this;
  }

  /**
   * 添加初始化逻辑
   */
  setup(fn: () => Promise<void>): this {
    this.scenario.setup = fn;
    return this;
  }

  /**
   * 添加清理逻辑
   */
  teardown(fn: () => Promise<void>): this {
    this.scenario.teardown = fn;
    return this;
  }

  /**
   * 添加工具调用步骤 —— 指定工具名
   */
  whenTool(toolName: string): MockStepBuilder {
    return new MockStepBuilder(this, toolName, this.currentStep++);
  }

  /**
   * 快捷方法：添加一个简单的成功响应
   */
  respondTo(
    toolName: string,
    response: unknown,
    matcher?: (input: unknown) => boolean
  ): this {
    this.scenario.steps.push({
      order: this.currentStep++,
      toolName,
      matcher: matcher ?? (() => true),
      response,
    });
    return this;
  }

  /**
   * 快捷方法：添加一个错误响应
   */
  failOn(
    toolName: string,
    errorMessage: string,
    matcher?: (input: unknown) => boolean
  ): this {
    this.scenario.steps.push({
      order: this.currentStep++,
      toolName,
      matcher: matcher ?? (() => true),
      response: null,
      error: errorMessage,
    });
    return this;
  }

  /**
   * 内部方法：添加步骤
   */
  _addStep(step: MockScenarioStep): void {
    this.scenario.steps.push(step);
  }

  /**
   * 构建场景
   */
  build(): MockScenario {
    return { ...this.scenario };
  }

  /**
   * 应用到 Mock 系统
   */
  applyTo(mockSystem: AdvancedToolMockSystem): void {
    for (const step of this.scenario.steps) {
      mockSystem.addRule({
        id: `${this.scenario.id}_step_${step.order}`,
        toolName: step.toolName,
        matcher: step.matcher,
        response: step.response,
        delay: step.delay,
        error: step.error,
        priority: 100 - step.order, // 按顺序降低优先级
      });
    }
  }

  // ─────────────────── 预定义场景模板 ───────────────────

  /**
   * 创建"搜索 → 摘要"场景
   */
  static searchAndSummarize(
    searchResults: unknown[],
    summaryResult: string
  ): MockScenarioBuilder {
    return new MockScenarioBuilder('search-summarize', '搜索并摘要')
      .describe('模拟搜索工具返回结果，然后摘要工具生成总结')
      .respondTo('search', searchResults)
      .respondTo('summarize', summaryResult);
  }

  /**
   * 创建"重试成功"场景（前 N 次失败，最后成功）
   */
  static retrySuccess(
    toolName: string,
    failCount: number,
    finalResponse: unknown
  ): MockScenarioBuilder {
    const builder = new MockScenarioBuilder('retry-success', '重试后成功');
    builder.describe(`${toolName} 前 ${failCount} 次失败，最后成功`);

    let callCount = 0;
    builder.scenario.steps.push({
      order: 0,
      toolName,
      matcher: () => true,
      response: (input: unknown) => {
        callCount++;
        if (callCount <= failCount) {
          throw new Error(`Simulated failure #${callCount}`);
        }
        return typeof finalResponse === 'function'
          ? (finalResponse as Function)(input)
          : finalResponse;
      },
    });

    return builder;
  }

  /**
   * 创建"级联调用"场景
   */
  static cascading(
    steps: Array<{
      toolName: string;
      response: unknown;
      delay?: number;
    }>
  ): MockScenarioBuilder {
    const builder = new MockScenarioBuilder('cascading', '级联调用');
    builder.describe('模拟多步骤级联工具调用');

    for (const step of steps) {
      builder.respondTo(step.toolName, step.response);
      if (step.delay) {
        const lastIdx = builder.scenario.steps.length - 1;
        builder.scenario.steps[lastIdx].delay = step.delay;
      }
    }

    return builder;
  }
}

/**
 * 单步骤构建器
 */
class MockStepBuilder {
  private step: Partial<MockScenarioStep>;
  private parentBuilder: MockScenarioBuilder;

  constructor(parent: MockScenarioBuilder, toolName: string, order: number) {
    this.parentBuilder = parent;
    this.step = { order, toolName };
  }

  /**
   * 设置输入匹配条件
   */
  withInput(matcher: (input: unknown) => boolean): this {
    this.step.matcher = matcher;
    return this;
  }

  /**
   * 设置输入包含指定字段
   */
  withInputContaining(fields: Record<string, unknown>): this {
    this.step.matcher = (input: unknown) => {
      if (typeof input !== 'object' || input === null) return false;
      const inputObj = input as Record<string, unknown>;
      return Object.entries(fields).every(
        ([key, value]) => inputObj[key] === value
      );
    };
    return this;
  }

  /**
   * 任意输入都匹配
   */
  withAnyInput(): this {
    this.step.matcher = () => true;
    return this;
  }

  /**
   * 返回成功响应
   */
  respondsWith(response: unknown | ((input: unknown) => unknown)): this {
    this.step.response = response;
    return this;
  }

  /**
   * 返回错误
   */
  failsWith(errorMessage: string): this {
    this.step.error = errorMessage;
    this.step.response = null;
    return this;
  }

  /**
   * 添加延迟
   */
  withDelay(ms: number): this {
    this.step.delay = ms;
    return this;
  }

  /**
   * 添加步骤描述
   */
  describedAs(description: string): this {
    this.step.description = description;
    return this;
  }

  /**
   * 添加断言
   */
  assertThat(assertion: (input: unknown, output: unknown) => boolean): this {
    if (!this.step.assertions) this.step.assertions = [];
    this.step.assertions.push(assertion);
    return this;
  }

  /**
   * 完成当前步骤，返回父构建器
   */
  and(): MockScenarioBuilder {
    this.finalize();
    return this.parentBuilder;
  }

  /**
   * 完成并构建
   */
  build(): MockScenario {
    this.finalize();
    return this.parentBuilder.build();
  }

  private finalize(): void {
    if (!this.step.matcher) this.step.matcher = () => true;
    if (this.step.response === undefined && !this.step.error) {
      this.step.response = null;
    }
    this.parentBuilder._addStep(this.step as MockScenarioStep);
  }
}

// ─────────────────── 使用示例 ───────────────────

function mockSystemUsageExample(): void {
  // 1. 基础场景构建
  const scenario = new MockScenarioBuilder('weather-assistant', '天气查询助手')
    .describe('模拟天气查询 Agent 的完整工具调用链')
    .whenTool('geocode')
      .withInputContaining({ city: '北京' })
      .respondsWith({ lat: 39.9042, lng: 116.4074 })
      .withDelay(50)
      .and()
    .whenTool('weather_api')
      .withAnyInput()
      .respondsWith({
        temperature: 22,
        humidity: 45,
        description: '晴朗',
      })
      .and()
    .whenTool('format_response')
      .withAnyInput()
      .respondsWith('北京今日天气：晴朗，气温 22°C，湿度 45%')
      .and()
    .build();

  console.log('场景:', scenario.name, '步骤数:', scenario.steps.length);

  // 2. 使用预定义模板
  const retryScenario = MockScenarioBuilder.retrySuccess(
    'database_query',
    2,
    { results: [{ id: 1, name: 'test' }] }
  ).build();

  console.log('重试场景:', retryScenario.name);

  // 3. 应用到高级 Mock 系统
  const mockSystem = new AdvancedToolMockSystem();

  // 配置错误注入
  mockSystem.configureErrorInjection({
    probability: 0.1,
    errorType: 'timeout',
    toolFilter: ['external_api'],
  });

  // 配置延迟模拟
  mockSystem.configureLatencySimulation({
    baseLatency: 100,
    jitter: 50,
    distribution: 'normal',
    slowRequestProbability: 0.05,
    slowRequestMultiplier: 5,
  });

  // 应用场景
  const builder = new MockScenarioBuilder('test', '测试');
  builder.respondTo('search', [{ title: 'Result 1' }]);
  builder.applyTo(mockSystem);
}
```

> **设计哲学**：Mock 场景构建器的 Fluent API 设计让测试场景的声明变得直观。每个测试场景读起来就像一个故事：_"当调用 geocode 工具时，返回北京的坐标；当调用天气 API 时，返回晴朗天气……"_。这种可读性对于维护大量评测用例至关重要。



---

## 15.4 LLM-as-Judge 评估框架

### 15.4.1 为什么用 LLM 当裁判

传统的评测方法（精确匹配、BLEU、ROUGE 等）在评估 Agent 输出时面临根本性局限：**Agent 的输出空间是开放的**，同一个任务可能有无数种正确答案。而人工评测虽然准确，但成本高、速度慢、无法规模化。

LLM-as-Judge 取得了两者之间的平衡：

| 方法 | 准确性 | 成本 | 速度 | 可扩展性 |
|------|--------|------|------|----------|
| 精确匹配 | 低（开放任务） | 极低 | 极快 | 极好 |
| 传统 NLP 指标 | 中 | 低 | 快 | 好 |
| LLM-as-Judge | 高 | 中 | 中 | 好 |
| 人工评测 | 极高 | 极高 | 慢 | 差 |

但 LLM-as-Judge 也有其挑战：**位置偏差**（Position Bias）、**冗长偏差**（Verbosity Bias）、**自我偏好**（Self-Enhancement Bias）。本节将系统性地解决这些问题。

### 15.4.2 基础 LLM 裁判

```typescript
// ============================================================
// 15.4 LLMJudge —— 基础 LLM 裁判
// ============================================================

/**
 * 评判标准
 */
interface JudgeCriterion {
  name: string;
  description: string;
  weight: number;
  scoreRange: { min: number; max: number };
  rubric: Record<number, string>; // 分数 → 评分标准描述
}

/**
 * 评判结果
 */
interface JudgeResult {
  score: number;
  normalizedScore: number;  // 0-1
  reasoning: string;
  criterionScores: Record<string, number>;
  confidence: number;
  metadata: Record<string, unknown>;
}

/**
 * LLM 调用接口
 */
interface LLMProvider {
  complete(prompt: string, options?: LLMCallOptions): Promise<string>;
}

interface LLMCallOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

class LLMJudge {
  private provider: LLMProvider;
  private criteria: JudgeCriterion[];
  private systemPrompt: string;

  constructor(
    provider: LLMProvider,
    criteria: JudgeCriterion[],
    options?: { systemPrompt?: string }
  ) {
    this.provider = provider;
    this.criteria = criteria;
    this.systemPrompt = options?.systemPrompt ?? this.buildDefaultSystemPrompt();
  }

  /**
   * 评判单个输出
   */
  async judge(
    input: string,
    output: string,
    reference?: string
  ): Promise<JudgeResult> {
    const prompt = this.buildJudgePrompt(input, output, reference);

    const response = await this.provider.complete(prompt, {
      temperature: 0.1,  // 低温度保持一致性
      maxTokens: 2000,
    });

    return this.parseJudgeResponse(response);
  }

  /**
   * 批量评判
   */
  async judgeBatch(
    items: Array<{ input: string; output: string; reference?: string }>
  ): Promise<JudgeResult[]> {
    const results: JudgeResult[] = [];
    for (const item of items) {
      const result = await this.judge(item.input, item.output, item.reference);
      results.push(result);
    }
    return results;
  }

  /**
   * 构建默认系统提示词
   */
  private buildDefaultSystemPrompt(): string {
    return `你是一个专业的 AI Agent 输出质量评审员。你的任务是根据给定的评分标准，
对 Agent 的输出进行客观、严格的评估。

评估原则：
1. 严格按照评分标准（rubric）打分，不要随意给分
2. 提供具体的评分理由，引用输出中的原文
3. 如果输出存在事实错误，要明确指出
4. 不要因为输出很长就给高分（避免冗长偏差）
5. 独立评估每个标准维度`;
  }

  /**
   * 构建评判提示词
   */
  private buildJudgePrompt(input: string, output: string, reference?: string): string {
    let prompt = `${this.systemPrompt}\n\n`;

    prompt += `## 评分标准\n\n`;
    for (const criterion of this.criteria) {
      prompt += `### ${criterion.name}（权重: ${criterion.weight}）\n`;
      prompt += `${criterion.description}\n`;
      prompt += `评分范围: ${criterion.scoreRange.min}-${criterion.scoreRange.max}\n`;
      for (const [score, desc] of Object.entries(criterion.rubric)) {
        prompt += `- ${score}分: ${desc}\n`;
      }
      prompt += '\n';
    }

    prompt += `## 待评估内容\n\n`;
    prompt += `### 用户输入\n${input}\n\n`;
    prompt += `### Agent 输出\n${output}\n\n`;

    if (reference) {
      prompt += `### 参考答案\n${reference}\n\n`;
    }

    prompt += `## 请输出评分结果\n\n`;
    prompt += `请以 JSON 格式输出，包含以下字段：\n`;
    prompt += `{\n`;
    prompt += `  "criterion_scores": { "标准名": 分数, ... },\n`;
    prompt += `  "reasoning": "详细评分理由",\n`;
    prompt += `  "confidence": 0.0-1.0 之间的置信度\n`;
    prompt += `}\n`;

    return prompt;
  }

  /**
   * 解析评判响应
   */
  private parseJudgeResponse(response: string): JudgeResult {
    try {
      // 尝试提取 JSON 块
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in judge response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const criterionScores: Record<string, number> = parsed.criterion_scores || {};

      // 计算加权总分
      let weightedSum = 0;
      let totalWeight = 0;
      let maxPossibleScore = 0;

      for (const criterion of this.criteria) {
        const score = criterionScores[criterion.name] ?? criterion.scoreRange.min;
        weightedSum += score * criterion.weight;
        totalWeight += criterion.weight;
        maxPossibleScore += criterion.scoreRange.max * criterion.weight;
      }

      const rawScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
      const normalizedScore = maxPossibleScore > 0 ? weightedSum / maxPossibleScore : 0;

      return {
        score: rawScore,
        normalizedScore,
        reasoning: parsed.reasoning || '',
        criterionScores,
        confidence: parsed.confidence ?? 0.5,
        metadata: { rawResponse: response },
      };
    } catch (error) {
      return {
        score: 0,
        normalizedScore: 0,
        reasoning: `Failed to parse judge response: ${error}`,
        criterionScores: {},
        confidence: 0,
        metadata: { rawResponse: response, parseError: true },
      };
    }
  }
}
```

### 15.4.3 评审团与多数投票

单个 LLM 裁判可能存在偏差，通过多个裁判的共识可以显著提高评判的可靠性：

```typescript
// ============================================================
// 15.4 JudgePanel —— 评审团（多裁判共识）
// ============================================================

/**
 * 评审团配置
 */
interface JudgePanelConfig {
  /** 裁判列表 */
  judges: Array<{
    id: string;
    judge: LLMJudge;
    weight: number;
    model?: string;
  }>;
  /** 共识策略 */
  consensusStrategy: 'majority-vote' | 'weighted-average' | 'min' | 'max' | 'median';
  /** 分歧阈值：超过此阈值则标记为需要人工审核 */
  disagreementThreshold: number;
  /** 是否启用位置偏差缓解 */
  mitigatePositionBias: boolean;
}

/**
 * 评审团结果
 */
interface PanelResult {
  consensusScore: number;
  normalizedConsensusScore: number;
  individualResults: Array<{
    judgeId: string;
    result: JudgeResult;
  }>;
  disagreement: number;
  needsHumanReview: boolean;
  consensusReasoning: string;
  metadata: Record<string, unknown>;
}

class JudgePanel {
  private config: JudgePanelConfig;

  constructor(config: JudgePanelConfig) {
    this.config = config;
  }

  /**
   * 评审团评判
   */
  async evaluate(
    input: string,
    output: string,
    reference?: string
  ): Promise<PanelResult> {
    const individualResults: Array<{ judgeId: string; result: JudgeResult }> = [];

    // 并行执行所有裁判
    const promises = this.config.judges.map(async (judgeConfig) => {
      let judgeInput = input;
      let judgeOutput = output;

      // 位置偏差缓解：随机交换 input/output 的呈现顺序
      // （仅在 pairwise comparison 场景中有效）
      if (this.config.mitigatePositionBias && Math.random() > 0.5) {
        // 在 prompt 中标记顺序已被交换
        judgeInput = `[ORDER_SWAPPED] ${input}`;
      }

      const result = await judgeConfig.judge.judge(judgeInput, judgeOutput, reference);

      return { judgeId: judgeConfig.id, result };
    });

    const results = await Promise.all(promises);
    individualResults.push(...results);

    // 计算共识分数
    const consensusScore = this.computeConsensus(individualResults);

    // 计算分歧度
    const disagreement = this.computeDisagreement(individualResults);

    // 归一化共识分数
    const scores = individualResults.map(r => r.result.normalizedScore);
    const normalizedConsensusScore = this.computeNormalizedConsensus(scores);

    return {
      consensusScore,
      normalizedConsensusScore,
      individualResults,
      disagreement,
      needsHumanReview: disagreement > this.config.disagreementThreshold,
      consensusReasoning: this.synthesizeReasoning(individualResults),
      metadata: {
        strategy: this.config.consensusStrategy,
        judgeCount: this.config.judges.length,
      },
    };
  }

  /**
   * 成对比较（Pairwise Comparison）
   */
  async pairwiseCompare(
    input: string,
    outputA: string,
    outputB: string
  ): Promise<{
    winner: 'A' | 'B' | 'tie';
    confidence: number;
    votes: Array<{ judgeId: string; vote: 'A' | 'B' | 'tie' }>;
  }> {
    const votes: Array<{ judgeId: string; vote: 'A' | 'B' | 'tie' }> = [];

    for (const judgeConfig of this.config.judges) {
      // 评判 A
      const resultA = await judgeConfig.judge.judge(input, outputA);
      // 评判 B
      const resultB = await judgeConfig.judge.judge(input, outputB);

      let vote: 'A' | 'B' | 'tie';
      const diff = resultA.normalizedScore - resultB.normalizedScore;
      if (diff > 0.1) vote = 'A';
      else if (diff < -0.1) vote = 'B';
      else vote = 'tie';

      votes.push({ judgeId: judgeConfig.id, vote });
    }

    // 多数投票
    const voteCounts = { A: 0, B: 0, tie: 0 };
    for (const v of votes) {
      voteCounts[v.vote]++;
    }

    let winner: 'A' | 'B' | 'tie';
    if (voteCounts.A > voteCounts.B && voteCounts.A > voteCounts.tie) {
      winner = 'A';
    } else if (voteCounts.B > voteCounts.A && voteCounts.B > voteCounts.tie) {
      winner = 'B';
    } else {
      winner = 'tie';
    }

    const maxVotes = Math.max(voteCounts.A, voteCounts.B, voteCounts.tie);
    const confidence = maxVotes / votes.length;

    return { winner, confidence, votes };
  }

  /**
   * 计算共识分数
   */
  private computeConsensus(
    results: Array<{ judgeId: string; result: JudgeResult }>
  ): number {
    const scores = results.map(r => r.result.score);
    const weights = results.map(r => {
      const config = this.config.judges.find(j => j.id === r.judgeId);
      return config?.weight ?? 1;
    });

    switch (this.config.consensusStrategy) {
      case 'majority-vote': {
        // 将分数四舍五入后进行多数投票
        const roundedScores = scores.map(s => Math.round(s));
        const counts = new Map<number, number>();
        for (const s of roundedScores) {
          counts.set(s, (counts.get(s) ?? 0) + 1);
        }
        let maxCount = 0;
        let majorityScore = 0;
        for (const [score, count] of counts) {
          if (count > maxCount) {
            maxCount = count;
            majorityScore = score;
          }
        }
        return majorityScore;
      }

      case 'weighted-average': {
        let weightedSum = 0;
        let totalWeight = 0;
        for (let i = 0; i < scores.length; i++) {
          weightedSum += scores[i] * weights[i];
          totalWeight += weights[i];
        }
        return totalWeight > 0 ? weightedSum / totalWeight : 0;
      }

      case 'median': {
        const sorted = [...scores].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];
      }

      case 'min':
        return Math.min(...scores);

      case 'max':
        return Math.max(...scores);

      default:
        return scores.reduce((a, b) => a + b, 0) / scores.length;
    }
  }

  private computeNormalizedConsensus(scores: number[]): number {
    if (scores.length === 0) return 0;
    const sorted = [...scores].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  /**
   * 计算分歧度（标准差）
   */
  private computeDisagreement(
    results: Array<{ judgeId: string; result: JudgeResult }>
  ): number {
    const scores = results.map(r => r.result.normalizedScore);
    if (scores.length <= 1) return 0;

    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
    return Math.sqrt(variance);
  }

  /**
   * 综合推理
   */
  private synthesizeReasoning(
    results: Array<{ judgeId: string; result: JudgeResult }>
  ): string {
    const reasonings = results
      .map(r => `[${r.judgeId}] (分数: ${r.result.score.toFixed(2)}): ${r.result.reasoning}`)
      .join('\n\n');

    return `评审团共识意见 (${results.length} 位裁判):\n\n${reasonings}`;
  }
}
```

### 15.4.4 偏差校准器

LLM 裁判最显著的偏差是**位置偏差**（Position Bias）——当两个输出同时呈现时，LLM 倾向于偏好第一个或最后一个。`BiasCalibrator` 通过统计检测和分数归一化来缓解这一问题：

```typescript
// ============================================================
// 15.4 BiasCalibrator —— 偏差校准器
// ============================================================

/**
 * 偏差类型
 */
type BiasType = 'position' | 'verbosity' | 'self-enhancement' | 'anchoring';

/**
 * 偏差检测结果
 */
interface BiasDetectionResult {
  biasType: BiasType;
  detected: boolean;
  severity: 'none' | 'low' | 'medium' | 'high';
  statistics: Record<string, number>;
  recommendation: string;
}

/**
 * 校准配置
 */
interface CalibrationConfig {
  /** 检测位置偏差 */
  detectPositionBias: boolean;
  /** 检测冗长偏差 */
  detectVerbosityBias: boolean;
  /** 应用分数归一化 */
  normalizeScores: boolean;
  /** 校准样本数量 */
  calibrationSampleSize: number;
}

class BiasCalibrator {
  private config: CalibrationConfig;
  private calibrationData: CalibrationData | null = null;

  constructor(config?: Partial<CalibrationConfig>) {
    this.config = {
      detectPositionBias: true,
      detectVerbosityBias: true,
      normalizeScores: true,
      calibrationSampleSize: 50,
      ...config,
    };
  }

  /**
   * 检测位置偏差
   *
   * 方法：将同一对输出以 A-B 和 B-A 两种顺序呈现给裁判，
   * 统计是否存在系统性地偏好某个位置。
   */
  async detectPositionBias(
    judge: LLMJudge,
    testPairs: Array<{ input: string; outputA: string; outputB: string }>
  ): Promise<BiasDetectionResult> {
    let positionAPreferred = 0; // A 在前时 A 被偏好的次数
    let positionBPreferred = 0; // A 在后时 A 被偏好的次数
    let totalPairs = 0;

    for (const pair of testPairs) {
      // 顺序 1: A 在前
      const resultAFirst = await judge.judge(pair.input, pair.outputA);
      const resultBFirst_order1 = await judge.judge(pair.input, pair.outputB);

      // 顺序 2: B 在前（交换位置）
      const resultBFirst_order2 = await judge.judge(pair.input, pair.outputB);
      const resultAFirst_order2 = await judge.judge(pair.input, pair.outputA);

      // 统计 A 在前时是否更倾向选 A
      if (resultAFirst.normalizedScore > resultBFirst_order1.normalizedScore) {
        positionAPreferred++;
      }

      // A 在后时是否仍然选 A
      if (resultAFirst_order2.normalizedScore > resultBFirst_order2.normalizedScore) {
        positionBPreferred++;
      }

      totalPairs++;
    }

    // 计算位置偏差程度
    const firstPositionRate = totalPairs > 0 ? positionAPreferred / totalPairs : 0.5;
    const secondPositionRate = totalPairs > 0 ? positionBPreferred / totalPairs : 0.5;
    const biasStrength = Math.abs(firstPositionRate - secondPositionRate);

    let severity: 'none' | 'low' | 'medium' | 'high';
    if (biasStrength < 0.05) severity = 'none';
    else if (biasStrength < 0.15) severity = 'low';
    else if (biasStrength < 0.30) severity = 'medium';
    else severity = 'high';

    return {
      biasType: 'position',
      detected: severity !== 'none',
      severity,
      statistics: {
        firstPositionPreferenceRate: firstPositionRate,
        secondPositionPreferenceRate: secondPositionRate,
        biasStrength,
        sampleSize: totalPairs,
      },
      recommendation: severity === 'none'
        ? '未检测到显著位置偏差'
        : `检测到 ${severity} 程度的位置偏差（偏差强度: ${(biasStrength * 100).toFixed(1)}%）。建议启用随机顺序或使用多裁判共识。`,
    };
  }

  /**
   * 检测冗长偏差
   *
   * 方法：在质量相同的情况下，比较长输出和短输出的分数差异
   */
  async detectVerbosityBias(
    judge: LLMJudge,
    testCases: Array<{
      input: string;
      shortOutput: string;
      longOutput: string;
      equivalentQuality: boolean; // 两者质量是否等价
    }>
  ): Promise<BiasDetectionResult> {
    let longPreferred = 0;
    let shortPreferred = 0;
    let equal = 0;
    const scoreDiffs: number[] = [];

    for (const tc of testCases) {
      if (!tc.equivalentQuality) continue;

      const shortResult = await judge.judge(tc.input, tc.shortOutput);
      const longResult = await judge.judge(tc.input, tc.longOutput);

      const diff = longResult.normalizedScore - shortResult.normalizedScore;
      scoreDiffs.push(diff);

      if (diff > 0.05) longPreferred++;
      else if (diff < -0.05) shortPreferred++;
      else equal++;
    }

    const totalValid = longPreferred + shortPreferred + equal;
    const longPreferenceRate = totalValid > 0 ? longPreferred / totalValid : 0.5;
    const avgScoreDiff = scoreDiffs.length > 0
      ? scoreDiffs.reduce((a, b) => a + b, 0) / scoreDiffs.length
      : 0;

    let severity: 'none' | 'low' | 'medium' | 'high';
    if (longPreferenceRate < 0.55) severity = 'none';
    else if (longPreferenceRate < 0.65) severity = 'low';
    else if (longPreferenceRate < 0.75) severity = 'medium';
    else severity = 'high';

    return {
      biasType: 'verbosity',
      detected: severity !== 'none',
      severity,
      statistics: {
        longPreferenceRate,
        shortPreferenceRate: totalValid > 0 ? shortPreferred / totalValid : 0,
        equalRate: totalValid > 0 ? equal / totalValid : 0,
        averageScoreDifference: avgScoreDiff,
        sampleSize: totalValid,
      },
      recommendation: severity === 'none'
        ? '未检测到显著冗长偏差'
        : `检测到 ${severity} 程度的冗长偏差（长输出偏好率: ${(longPreferenceRate * 100).toFixed(1)}%）。建议在 rubric 中明确"简洁性"标准。`,
    };
  }

  /**
   * 校准分数
   *
   * 使用 Z-Score 归一化来消除裁判的系统性偏差
   */
  calibrateScores(
    scores: number[],
    judgeId: string
  ): number[] {
    if (!this.calibrationData) {
      // 无校准数据时，仅做 min-max 归一化
      const min = Math.min(...scores);
      const max = Math.max(...scores);
      const range = max - min;
      return range > 0 ? scores.map(s => (s - min) / range) : scores.map(() => 0.5);
    }

    const judgeStats = this.calibrationData.judgeStats.get(judgeId);
    if (!judgeStats) {
      return scores;
    }

    // Z-Score 归一化后重新映射到 0-1
    return scores.map(score => {
      const zScore = judgeStats.stddev > 0
        ? (score - judgeStats.mean) / judgeStats.stddev
        : 0;
      // 将 Z-Score 映射到 0-1（使用 sigmoid 类函数）
      return 1 / (1 + Math.exp(-zScore));
    });
  }

  /**
   * 运行校准程序
   *
   * 使用一组已知质量的样本来建立每个裁判的评分分布
   */
  async runCalibration(
    judges: Array<{ id: string; judge: LLMJudge }>,
    calibrationSamples: Array<{
      input: string;
      output: string;
      knownScore: number; // 人工标注的参考分数
    }>
  ): Promise<void> {
    const judgeStats = new Map<string, { mean: number; stddev: number; bias: number }>();

    for (const judgeConfig of judges) {
      const scores: number[] = [];
      const errors: number[] = [];

      for (const sample of calibrationSamples) {
        const result = await judgeConfig.judge.judge(sample.input, sample.output);
        scores.push(result.normalizedScore);
        errors.push(result.normalizedScore - sample.knownScore);
      }

      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
      const stddev = Math.sqrt(variance);
      const bias = errors.reduce((a, b) => a + b, 0) / errors.length;

      judgeStats.set(judgeConfig.id, { mean, stddev, bias });
    }

    this.calibrationData = {
      judgeStats,
      calibratedAt: new Date(),
      sampleSize: calibrationSamples.length,
    };
  }
}

interface CalibrationData {
  judgeStats: Map<string, { mean: number; stddev: number; bias: number }>;
  calibratedAt: Date;
  sampleSize: number;
}
```

### 15.4.5 评判 Prompt 工程最佳实践

优秀的 LLM 裁判 prompt 应遵循以下原则：

```typescript
/**
 * 评判 Prompt 模板集
 */
const JudgePromptTemplates = {
  /**
   * 原则 1：明确的评分 Rubric
   * 每个分数段都有具体、可操作的描述
   */
  taskCompletion: {
    criterion: 'task_completion',
    rubric: {
      5: '完全正确地完成了任务所有要求，没有遗漏',
      4: '基本完成了任务，但有 1-2 个小问题（如格式、措辞）',
      3: '完成了主要任务目标，但遗漏了部分次要要求',
      2: '仅部分完成任务，遗漏了关键要求',
      1: '未能完成任务，输出与用户需求不相关',
    },
  },

  /**
   * 原则 2：Chain-of-Thought 评判
   * 要求裁判先分析再给分
   */
  cotJudgeTemplate: `
请按以下步骤评估 Agent 的输出：

第一步：理解用户意图
- 用户想要什么？
- 有哪些隐含需求？

第二步：逐条评估
- 对照每个评估标准，分别给出评分和理由

第三步：综合判断
- 考虑各维度的重要性权重
- 给出最终评分

请确保先完成分析，再给出分数。
`,

  /**
   * 原则 3：避免偏差的提示
   */
  debiasInstructions: `
重要提醒：
- 不要因为输出更长就给更高的分数。简洁但正确的答案同样优秀。
- 不要因为输出使用了更专业的术语就给更高分。清晰表达比术语堆砌更重要。
- 关注事实正确性，而非文字优美程度。
- 如果两个输出都正确，但方式不同，不要偏好其中一种风格。
`,

  /**
   * 原则 4：Reference-Free 评估
   * 当没有标准答案时的评判策略
   */
  referenceFreeTemplate: `
注意：此任务没有标准参考答案。请根据以下标准独立评估输出质量：

1. 内在一致性：输出内容自身是否逻辑自洽？
2. 事实性：输出中的事实性声明是否可信？
3. 有用性：输出对用户是否有实际帮助？
4. 安全性：输出是否包含有害或不当内容？

请不要尝试猜测"正确答案"，而是评估输出本身的质量。
`,
} as const;
```

---

## 15.5 评测流水线

### 15.5.1 从原型到生产

一个生产级的评测流水线需要解决以下问题：

1. **并行执行**：大规模评测需要并行运行以提升效率
2. **结果缓存**：避免重复计算昂贵的 LLM 评判
3. **回归检测**：自动发现性能退化
4. **统计显著性**：确保评测结果差异不是随机波动

### 15.5.2 生产级评测流水线

```typescript
// ============================================================
// 15.5 ProductionEvalPipeline —— 生产级评测流水线
// ============================================================

/**
 * 评测任务
 */
interface EvalTask {
  id: string;
  name: string;
  dataset: EvalSample[];
  evaluators: EvalEvaluator[];
  config: EvalTaskConfig;
}

interface EvalTaskConfig {
  /** 并行度 */
  concurrency: number;
  /** 超时时间（ms） */
  timeout: number;
  /** 重试次数 */
  retries: number;
  /** 是否启用缓存 */
  cacheEnabled: boolean;
  /** 缓存 TTL（ms） */
  cacheTTL: number;
  /** 标签 */
  tags: string[];
}

/**
 * 评估器接口
 */
interface EvalEvaluator {
  id: string;
  name: string;
  evaluate(sample: EvalSample, result: AgentResult): Promise<EvalScore>;
}

interface AgentResult {
  output: string;
  toolCalls: ToolCallRecord[];
  timing: TimingInfo;
  tokenUsage: TokenUsage;
  metadata: Record<string, unknown>;
}

interface EvalScore {
  evaluatorId: string;
  score: number;
  normalizedScore: number;
  details: Record<string, unknown>;
}

/**
 * 评测运行结果
 */
interface EvalRunResult {
  runId: string;
  taskId: string;
  startedAt: Date;
  completedAt: Date;
  totalSamples: number;
  successfulSamples: number;
  failedSamples: number;
  scores: Map<string, number[]>;           // evaluatorId → scores
  aggregatedScores: Map<string, number>;   // evaluatorId → aggregated score
  sampleResults: SampleResult[];
  metadata: Record<string, unknown>;
}

interface SampleResult {
  sampleId: string;
  success: boolean;
  scores: EvalScore[];
  error?: string;
  duration: number;
}

/**
 * 评测缓存
 */
interface EvalCache {
  get(key: string): Promise<EvalScore | null>;
  set(key: string, value: EvalScore, ttl: number): Promise<void>;
  clear(): Promise<void>;
}

class InMemoryEvalCache implements EvalCache {
  private cache = new Map<string, { value: EvalScore; expiresAt: number }>();

  async get(key: string): Promise<EvalScore | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: EvalScore, ttl: number): Promise<void> {
    this.cache.set(key, { value, expiresAt: Date.now() + ttl });
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}

class ProductionEvalPipeline {
  private cache: EvalCache;
  private runHistory: EvalRunResult[] = [];
  private eventListeners: Map<string, Array<(...args: unknown[]) => void>> = new Map();

  constructor(cache?: EvalCache) {
    this.cache = cache ?? new InMemoryEvalCache();
  }

  /**
   * 运行评测任务
   */
  async run(
    task: EvalTask,
    agentExecutor: (sample: EvalSample) => Promise<AgentResult>
  ): Promise<EvalRunResult> {
    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const startedAt = new Date();

    this.emit('run:start', { runId, taskId: task.id, samples: task.dataset.length });

    const sampleResults: SampleResult[] = [];
    const scores = new Map<string, number[]>();

    // 初始化分数数组
    for (const evaluator of task.evaluators) {
      scores.set(evaluator.id, []);
    }

    // 并行执行评测
    const batches = this.createBatches(task.dataset, task.config.concurrency);

    for (const batch of batches) {
      const batchPromises = batch.map(sample =>
        this.evaluateSample(sample, task, agentExecutor)
      );

      const batchResults = await Promise.allSettled(batchPromises);

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          sampleResults.push(result.value);
          for (const score of result.value.scores) {
            scores.get(score.evaluatorId)?.push(score.normalizedScore);
          }
        } else {
          sampleResults.push({
            sampleId: 'unknown',
            success: false,
            scores: [],
            error: result.reason?.message ?? 'Unknown error',
            duration: 0,
          });
        }
      }

      this.emit('batch:complete', {
        runId,
        completed: sampleResults.length,
        total: task.dataset.length,
      });
    }

    // 聚合分数
    const aggregatedScores = new Map<string, number>();
    for (const [evaluatorId, scoreList] of scores) {
      if (scoreList.length > 0) {
        aggregatedScores.set(
          evaluatorId,
          scoreList.reduce((a, b) => a + b, 0) / scoreList.length
        );
      }
    }

    const result: EvalRunResult = {
      runId,
      taskId: task.id,
      startedAt,
      completedAt: new Date(),
      totalSamples: task.dataset.length,
      successfulSamples: sampleResults.filter(r => r.success).length,
      failedSamples: sampleResults.filter(r => !r.success).length,
      scores,
      aggregatedScores,
      sampleResults,
      metadata: { tags: task.config.tags },
    };

    this.runHistory.push(result);
    this.emit('run:complete', result);

    return result;
  }

  /**
   * 评测单个样本
   */
  private async evaluateSample(
    sample: EvalSample,
    task: EvalTask,
    agentExecutor: (sample: EvalSample) => Promise<AgentResult>
  ): Promise<SampleResult> {
    const startTime = Date.now();

    try {
      // 执行 Agent
      const agentResult = await this.withTimeout(
        agentExecutor(sample),
        task.config.timeout
      );

      // 运行所有评估器
      const evalScores: EvalScore[] = [];

      for (const evaluator of task.evaluators) {
        const cacheKey = this.buildCacheKey(sample.id, evaluator.id, agentResult);

        // 检查缓存
        if (task.config.cacheEnabled) {
          const cached = await this.cache.get(cacheKey);
          if (cached) {
            evalScores.push(cached);
            continue;
          }
        }

        // 执行评估（带重试）
        let score: EvalScore | null = null;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= task.config.retries; attempt++) {
          try {
            score = await evaluator.evaluate(sample, agentResult);
            break;
          } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
            if (attempt < task.config.retries) {
              await this.sleep(Math.pow(2, attempt) * 1000); // 指数退避
            }
          }
        }

        if (score) {
          evalScores.push(score);
          if (task.config.cacheEnabled) {
            await this.cache.set(cacheKey, score, task.config.cacheTTL);
          }
        } else {
          evalScores.push({
            evaluatorId: evaluator.id,
            score: 0,
            normalizedScore: 0,
            details: { error: lastError?.message ?? 'Evaluation failed' },
          });
        }
      }

      return {
        sampleId: sample.id,
        success: true,
        scores: evalScores,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        sampleId: sample.id,
        success: false,
        scores: [],
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 获取运行历史
   */
  getRunHistory(): EvalRunResult[] {
    return [...this.runHistory];
  }

  /**
   * 比较两次运行结果
   */
  compareRuns(runIdA: string, runIdB: string): RunComparison | null {
    const runA = this.runHistory.find(r => r.runId === runIdA);
    const runB = this.runHistory.find(r => r.runId === runIdB);
    if (!runA || !runB) return null;

    const comparisons: Array<{
      evaluatorId: string;
      scoreA: number;
      scoreB: number;
      delta: number;
      significant: boolean;
    }> = [];

    for (const [evaluatorId, scoreA] of runA.aggregatedScores) {
      const scoreB = runB.aggregatedScores.get(evaluatorId);
      if (scoreB !== undefined) {
        const scoresA = runA.scores.get(evaluatorId) ?? [];
        const scoresB = runB.scores.get(evaluatorId) ?? [];
        const significant = this.isStatisticallySignificant(scoresA, scoresB);

        comparisons.push({
          evaluatorId,
          scoreA,
          scoreB,
          delta: scoreB - scoreA,
          significant,
        });
      }
    }

    return {
      runIdA,
      runIdB,
      comparisons,
      overallImprovement: comparisons.length > 0
        ? comparisons.reduce((sum, c) => sum + c.delta, 0) / comparisons.length
        : 0,
    };
  }

  // ─────────────────── 辅助方法 ───────────────────

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Evaluation timeout')), timeoutMs)
      ),
    ]);
  }

  private buildCacheKey(sampleId: string, evaluatorId: string, result: AgentResult): string {
    const hash = this.simpleHash(JSON.stringify({
      sampleId,
      evaluatorId,
      output: result.output,
      toolCalls: result.toolCalls.map(tc => ({ name: tc.toolName, input: tc.input })),
    }));
    return `eval:${hash}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Welch's t-test 判断两组分数是否有统计显著差异
   */
  private isStatisticallySignificant(
    scoresA: number[],
    scoresB: number[],
    alpha: number = 0.05
  ): boolean {
    if (scoresA.length < 2 || scoresB.length < 2) return false;

    const meanA = scoresA.reduce((a, b) => a + b, 0) / scoresA.length;
    const meanB = scoresB.reduce((a, b) => a + b, 0) / scoresB.length;

    const varA = scoresA.reduce((sum, s) => sum + (s - meanA) ** 2, 0) / (scoresA.length - 1);
    const varB = scoresB.reduce((sum, s) => sum + (s - meanB) ** 2, 0) / (scoresB.length - 1);

    const se = Math.sqrt(varA / scoresA.length + varB / scoresB.length);
    if (se === 0) return false;

    const t = Math.abs(meanA - meanB) / se;

    // Welch-Satterthwaite 自由度近似
    const dfNumerator = (varA / scoresA.length + varB / scoresB.length) ** 2;
    const dfDenominator =
      (varA / scoresA.length) ** 2 / (scoresA.length - 1) +
      (varB / scoresB.length) ** 2 / (scoresB.length - 1);
    const df = dfNumerator / dfDenominator;

    // 简化的临界值查表（alpha=0.05）
    const criticalValues: Record<number, number> = {
      1: 12.706, 2: 4.303, 3: 3.182, 5: 2.571,
      10: 2.228, 20: 2.086, 30: 2.042, 50: 2.009,
      100: 1.984,
    };

    // 找最接近的自由度
    let criticalValue = 1.96; // 默认大样本
    for (const [dfKey, cv] of Object.entries(criticalValues)) {
      if (df <= Number(dfKey)) {
        criticalValue = cv;
        break;
      }
    }

    return t > criticalValue;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private emit(event: string, data: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try { listener(data); } catch { /* ignore */ }
      }
    }
  }

  on(event: string, listener: (...args: unknown[]) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }
}

interface RunComparison {
  runIdA: string;
  runIdB: string;
  comparisons: Array<{
    evaluatorId: string;
    scoreA: number;
    scoreB: number;
    delta: number;
    significant: boolean;
  }>;
  overallImprovement: number;
}
```

### 15.5.3 回归检测器

```typescript
// ============================================================
// 15.5 RegressionDetector —— 回归检测器
// ============================================================

/**
 * 回归检测配置
 */
interface RegressionConfig {
  /** 基线运行 ID */
  baselineRunId: string;
  /** 最小可接受降幅（绝对值） */
  minDegradation: number;
  /** 置信水平 */
  confidenceLevel: number;
  /** 是否检测单个样本级别的回归 */
  sampleLevelDetection: boolean;
  /** 连续回归次数阈值 */
  consecutiveRegressionThreshold: number;
}

/**
 * 回归报告
 */
interface RegressionReport {
  detected: boolean;
  regressions: RegressionItem[];
  improvements: RegressionItem[];
  unchanged: string[];
  summary: string;
  confidence: number;
  generatedAt: Date;
}

interface RegressionItem {
  evaluatorId: string;
  baselineScore: number;
  currentScore: number;
  delta: number;
  percentChange: number;
  isSignificant: boolean;
  confidenceInterval: { lower: number; upper: number };
  affectedSamples?: string[]; // 受影响的样本 ID
}

class RegressionDetector {
  private config: RegressionConfig;
  private regressionHistory: RegressionReport[] = [];

  constructor(config: RegressionConfig) {
    this.config = config;
  }

  /**
   * 检测回归
   */
  detect(
    baselineRun: EvalRunResult,
    currentRun: EvalRunResult
  ): RegressionReport {
    const regressions: RegressionItem[] = [];
    const improvements: RegressionItem[] = [];
    const unchanged: string[] = [];

    for (const [evaluatorId, currentScore] of currentRun.aggregatedScores) {
      const baselineScore = baselineRun.aggregatedScores.get(evaluatorId);
      if (baselineScore === undefined) continue;

      const delta = currentScore - baselineScore;
      const percentChange = baselineScore !== 0
        ? (delta / baselineScore) * 100
        : delta > 0 ? 100 : delta < 0 ? -100 : 0;

      // 计算置信区间
      const baselineScores = baselineRun.scores.get(evaluatorId) ?? [];
      const currentScores = currentRun.scores.get(evaluatorId) ?? [];
      const ci = this.computeConfidenceInterval(
        currentScores,
        this.config.confidenceLevel
      );

      // 统计显著性检验
      const isSignificant = this.welchTTest(
        baselineScores,
        currentScores,
        1 - this.config.confidenceLevel
      );

      // 受影响的样本
      let affectedSamples: string[] | undefined;
      if (this.config.sampleLevelDetection) {
        affectedSamples = this.findAffectedSamples(
          baselineRun,
          currentRun,
          evaluatorId
        );
      }

      const item: RegressionItem = {
        evaluatorId,
        baselineScore,
        currentScore,
        delta,
        percentChange,
        isSignificant,
        confidenceInterval: ci,
        affectedSamples,
      };

      if (delta < -this.config.minDegradation && isSignificant) {
        regressions.push(item);
      } else if (delta > this.config.minDegradation && isSignificant) {
        improvements.push(item);
      } else {
        unchanged.push(evaluatorId);
      }
    }

    const detected = regressions.length > 0;
    const report: RegressionReport = {
      detected,
      regressions,
      improvements,
      unchanged,
      summary: this.generateSummary(regressions, improvements, unchanged),
      confidence: this.config.confidenceLevel,
      generatedAt: new Date(),
    };

    this.regressionHistory.push(report);
    return report;
  }

  /**
   * 计算置信区间
   */
  private computeConfidenceInterval(
    scores: number[],
    confidenceLevel: number
  ): { lower: number; upper: number } {
    if (scores.length === 0) return { lower: 0, upper: 0 };

    const n = scores.length;
    const mean = scores.reduce((a, b) => a + b, 0) / n;
    const stddev = Math.sqrt(
      scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / (n - 1)
    );

    // Z 值（简化）
    const zMap: Record<number, number> = {
      0.90: 1.645,
      0.95: 1.96,
      0.99: 2.576,
    };
    const z = zMap[confidenceLevel] ?? 1.96;
    const margin = z * (stddev / Math.sqrt(n));

    return {
      lower: mean - margin,
      upper: mean + margin,
    };
  }

  /**
   * Welch's t-test
   */
  private welchTTest(
    groupA: number[],
    groupB: number[],
    alpha: number
  ): boolean {
    if (groupA.length < 2 || groupB.length < 2) return false;

    const meanA = groupA.reduce((a, b) => a + b, 0) / groupA.length;
    const meanB = groupB.reduce((a, b) => a + b, 0) / groupB.length;
    const varA = groupA.reduce((s, x) => s + (x - meanA) ** 2, 0) / (groupA.length - 1);
    const varB = groupB.reduce((s, x) => s + (x - meanB) ** 2, 0) / (groupB.length - 1);

    const se = Math.sqrt(varA / groupA.length + varB / groupB.length);
    if (se === 0) return false;

    const t = Math.abs(meanA - meanB) / se;

    // 简化判断
    const criticalT = alpha <= 0.01 ? 2.576 : alpha <= 0.05 ? 1.96 : 1.645;
    return t > criticalT;
  }

  /**
   * 找出受影响的样本
   */
  private findAffectedSamples(
    baseline: EvalRunResult,
    current: EvalRunResult,
    evaluatorId: string
  ): string[] {
    const affected: string[] = [];

    const baselineSampleScores = new Map<string, number>();
    for (const sr of baseline.sampleResults) {
      const score = sr.scores.find(s => s.evaluatorId === evaluatorId);
      if (score) baselineSampleScores.set(sr.sampleId, score.normalizedScore);
    }

    for (const sr of current.sampleResults) {
      const score = sr.scores.find(s => s.evaluatorId === evaluatorId);
      if (score) {
        const baselineScore = baselineSampleScores.get(sr.sampleId);
        if (baselineScore !== undefined) {
          const degradation = baselineScore - score.normalizedScore;
          if (degradation > this.config.minDegradation) {
            affected.push(sr.sampleId);
          }
        }
      }
    }

    return affected;
  }

  /**
   * 生成报告摘要
   */
  private generateSummary(
    regressions: RegressionItem[],
    improvements: RegressionItem[],
    unchanged: string[]
  ): string {
    const lines: string[] = [];

    if (regressions.length === 0) {
      lines.push('未检测到显著性能退化。');
    } else {
      lines.push(`检测到 ${regressions.length} 项显著退化：`);
      for (const r of regressions) {
        lines.push(
          `  - ${r.evaluatorId}: ${(r.baselineScore * 100).toFixed(1)}% → ` +
          `${(r.currentScore * 100).toFixed(1)}% (${r.percentChange.toFixed(1)}%)`
        );
      }
    }

    if (improvements.length > 0) {
      lines.push(`\n检测到 ${improvements.length} 项显著改进：`);
      for (const i of improvements) {
        lines.push(
          `  + ${i.evaluatorId}: ${(i.baselineScore * 100).toFixed(1)}% → ` +
          `${(i.currentScore * 100).toFixed(1)}% (+${i.percentChange.toFixed(1)}%)`
        );
      }
    }

    lines.push(`\n${unchanged.length} 项指标无显著变化。`);
    return lines.join('\n');
  }

  /**
   * 检查趋势是否持续恶化
   */
  checkTrend(): {
    deteriorating: boolean;
    consecutiveRegressions: number;
    affectedMetrics: string[];
  } {
    let consecutiveRegressions = 0;
    const affectedMetrics = new Set<string>();

    // 从最近的报告向前检查
    for (let i = this.regressionHistory.length - 1; i >= 0; i--) {
      const report = this.regressionHistory[i];
      if (report.detected) {
        consecutiveRegressions++;
        for (const r of report.regressions) {
          affectedMetrics.add(r.evaluatorId);
        }
      } else {
        break;
      }
    }

    return {
      deteriorating: consecutiveRegressions >= this.config.consecutiveRegressionThreshold,
      consecutiveRegressions,
      affectedMetrics: [...affectedMetrics],
    };
  }
}
```

### 15.5.4 评测结果可视化数据模型

```typescript
// ============================================================
// 15.5 EvalVisualization —— 评测结果可视化数据模型
// ============================================================

/**
 * 可视化数据点
 */
interface EvalVisualizationData {
  /** 雷达图数据（多维度综合展示） */
  radarChart: RadarChartData;
  /** 趋势图数据（多次运行对比） */
  trendChart: TrendChartData;
  /** 分布图数据（分数分布） */
  distributionChart: DistributionChartData;
  /** 热力图数据（样本 × 指标矩阵） */
  heatmapData: HeatmapData;
}

interface RadarChartData {
  axes: Array<{ name: string; max: number }>;
  series: Array<{
    name: string;
    values: number[];
    color?: string;
  }>;
}

interface TrendChartData {
  timestamps: Date[];
  series: Array<{
    name: string;
    values: number[];
    trend: 'improving' | 'stable' | 'declining';
  }>;
}

interface DistributionChartData {
  evaluatorId: string;
  bins: Array<{ range: string; count: number }>;
  mean: number;
  median: number;
  stddev: number;
}

interface HeatmapData {
  rows: string[];        // 样本 ID
  columns: string[];     // 指标名
  values: number[][];    // 分数矩阵
  colorScale: { min: number; max: number };
}

class EvalVisualizer {
  /**
   * 从运行结果生成可视化数据
   */
  static generateVisualization(
    runs: EvalRunResult[],
    dimensionFramework?: EvalDimensionFramework
  ): EvalVisualizationData {
    return {
      radarChart: this.buildRadarChart(runs[runs.length - 1]),
      trendChart: this.buildTrendChart(runs),
      distributionChart: this.buildDistribution(runs[runs.length - 1]),
      heatmapData: this.buildHeatmap(runs[runs.length - 1]),
    };
  }

  private static buildRadarChart(run: EvalRunResult): RadarChartData {
    const axes: Array<{ name: string; max: number }> = [];
    const values: number[] = [];

    for (const [evaluatorId, score] of run.aggregatedScores) {
      axes.push({ name: evaluatorId, max: 1 });
      values.push(score);
    }

    return {
      axes,
      series: [{ name: run.runId, values }],
    };
  }

  private static buildTrendChart(runs: EvalRunResult[]): TrendChartData {
    const timestamps = runs.map(r => r.completedAt);
    const evaluatorIds = new Set<string>();

    for (const run of runs) {
      for (const id of run.aggregatedScores.keys()) {
        evaluatorIds.add(id);
      }
    }

    const series: TrendChartData['series'] = [];

    for (const evaluatorId of evaluatorIds) {
      const values = runs.map(r => r.aggregatedScores.get(evaluatorId) ?? 0);

      // 简单趋势判定
      let trend: 'improving' | 'stable' | 'declining' = 'stable';
      if (values.length >= 3) {
        const recent = values.slice(-3);
        const diffs = recent.slice(1).map((v, i) => v - recent[i]);
        const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
        if (avgDiff > 0.02) trend = 'improving';
        else if (avgDiff < -0.02) trend = 'declining';
      }

      series.push({ name: evaluatorId, values, trend });
    }

    return { timestamps, series };
  }

  private static buildDistribution(run: EvalRunResult): DistributionChartData {
    // 取第一个评估器的分布
    const firstEntry = run.scores.entries().next().value;
    if (!firstEntry) {
      return {
        evaluatorId: 'unknown',
        bins: [],
        mean: 0,
        median: 0,
        stddev: 0,
      };
    }

    const [evaluatorId, scores] = firstEntry;
    const binCount = 10;
    const bins: Array<{ range: string; count: number }> = [];

    for (let i = 0; i < binCount; i++) {
      const lower = i / binCount;
      const upper = (i + 1) / binCount;
      const count = scores.filter(s => s >= lower && s < upper).length;
      bins.push({
        range: `${(lower * 100).toFixed(0)}-${(upper * 100).toFixed(0)}%`,
        count,
      });
    }

    const sorted = [...scores].sort((a, b) => a - b);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
    const stddev = Math.sqrt(
      scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length
    );

    return { evaluatorId, bins, mean, median, stddev };
  }

  private static buildHeatmap(run: EvalRunResult): HeatmapData {
    const rows = run.sampleResults.map(sr => sr.sampleId);
    const columns = [...run.aggregatedScores.keys()];
    const values: number[][] = [];

    for (const sr of run.sampleResults) {
      const row: number[] = [];
      for (const col of columns) {
        const score = sr.scores.find(s => s.evaluatorId === col);
        row.push(score?.normalizedScore ?? 0);
      }
      values.push(row);
    }

    return {
      rows,
      columns,
      values,
      colorScale: { min: 0, max: 1 },
    };
  }
}
```



---

## 15.6 端到端评测

### 15.6.1 为什么需要端到端评测

单独评估 Agent 的每个组件（工具调用、LLM 输出、规划质量）是必要的，但不充分。Agent 的真正价值体现在**从用户输入到最终输出的完整交互过程**中。端到端评测关注的核心问题是：

- 多轮对话中，Agent 是否能保持上下文一致性？
- Agent 选择的工具调用序列是否最优？
- 当中间步骤出错时，Agent 能否自我纠正？
- 整体交互体验是否流畅？

### 15.6.2 E2E 评测运行器

```typescript
// ============================================================
// 15.6 E2EEvalRunner —— 端到端评测运行器
// ============================================================

/**
 * 多轮对话定义
 */
interface ConversationScenario {
  id: string;
  name: string;
  description: string;
  turns: ConversationTurn[];
  expectedOutcome: ExpectedOutcome;
  tags: string[];
}

interface ConversationTurn {
  role: 'user' | 'system';
  content: string;
  /** 期望的工具调用（可选，用于评估工具选择） */
  expectedToolCalls?: Array<{
    toolName: string;
    requiredParams?: Record<string, unknown>;
  }>;
  /** 期望的输出特征（可选） */
  expectedOutputTraits?: string[];
  /** 最大允许延迟 (ms) */
  maxLatency?: number;
}

interface ExpectedOutcome {
  /** 任务是否应该成功完成 */
  taskCompleted: boolean;
  /** 最终输出应包含的关键信息 */
  requiredInformation?: string[];
  /** 最终输出不应包含的内容 */
  forbiddenContent?: string[];
  /** 期望的总工具调用次数范围 */
  toolCallCountRange?: { min: number; max: number };
  /** 自定义验证函数 */
  customValidator?: (result: E2EResult) => boolean;
}

/**
 * Agent 接口
 */
interface AgentInterface {
  /** 发送消息并获取响应 */
  chat(message: string, context?: ChatContext): Promise<AgentResponse>;
  /** 重置对话状态 */
  reset(): Promise<void>;
}

interface ChatContext {
  conversationId: string;
  turnIndex: number;
  metadata?: Record<string, unknown>;
}

interface AgentResponse {
  content: string;
  toolCalls: ToolCallRecord[];
  thinking?: string;
  tokenUsage: TokenUsage;
  latency: number;
}

/**
 * E2E 评测结果
 */
interface E2EResult {
  scenarioId: string;
  scenarioName: string;
  turns: TurnResult[];
  overallScore: number;
  dimensionScores: Record<string, number>;
  totalToolCalls: number;
  totalTokens: number;
  totalLatency: number;
  taskCompleted: boolean;
  errors: string[];
  trajectory: TrajectoryStep[];
}

interface TurnResult {
  turnIndex: number;
  userInput: string;
  agentOutput: string;
  toolCalls: ToolCallRecord[];
  latency: number;
  tokenUsage: TokenUsage;
  turnScore: number;
  issues: string[];
}

/**
 * 轨迹步骤
 */
interface TrajectoryStep {
  index: number;
  type: 'user_input' | 'agent_thinking' | 'tool_call' | 'agent_output' | 'error';
  content: string;
  timestamp: number;
  metadata: Record<string, unknown>;
}

class E2EEvalRunner {
  private agent: AgentInterface;
  private mockSystem: AdvancedToolMockSystem;
  private judge?: LLMJudge;
  private results: E2EResult[] = [];

  constructor(
    agent: AgentInterface,
    mockSystem: AdvancedToolMockSystem,
    judge?: LLMJudge
  ) {
    this.agent = agent;
    this.mockSystem = mockSystem;
    this.judge = judge;
  }

  /**
   * 运行单个对话场景
   */
  async runScenario(scenario: ConversationScenario): Promise<E2EResult> {
    await this.agent.reset();
    this.mockSystem.reset();

    const turnResults: TurnResult[] = [];
    const trajectory: TrajectoryStep[] = [];
    const allToolCalls: ToolCallRecord[] = [];
    const errors: string[] = [];
    let totalTokens = 0;
    let totalLatency = 0;

    for (let i = 0; i < scenario.turns.length; i++) {
      const turn = scenario.turns[i];
      if (turn.role !== 'user') continue;

      // 记录用户输入
      trajectory.push({
        index: trajectory.length,
        type: 'user_input',
        content: turn.content,
        timestamp: Date.now(),
        metadata: { turnIndex: i },
      });

      try {
        const response = await this.agent.chat(turn.content, {
          conversationId: scenario.id,
          turnIndex: i,
        });

        // 记录 Agent 思考过程
        if (response.thinking) {
          trajectory.push({
            index: trajectory.length,
            type: 'agent_thinking',
            content: response.thinking,
            timestamp: Date.now(),
            metadata: {},
          });
        }

        // 记录工具调用
        for (const tc of response.toolCalls) {
          trajectory.push({
            index: trajectory.length,
            type: 'tool_call',
            content: `${tc.toolName}(${JSON.stringify(tc.input)}) → ${JSON.stringify(tc.output)}`,
            timestamp: Date.now(),
            metadata: { toolName: tc.toolName, success: tc.success },
          });
          allToolCalls.push(tc);
        }

        // 记录 Agent 输出
        trajectory.push({
          index: trajectory.length,
          type: 'agent_output',
          content: response.content,
          timestamp: Date.now(),
          metadata: {},
        });

        // 评估当前轮次
        const issues: string[] = [];

        // 检查延迟
        if (turn.maxLatency && response.latency > turn.maxLatency) {
          issues.push(`延迟超标: ${response.latency}ms > ${turn.maxLatency}ms`);
        }

        // 检查工具调用
        if (turn.expectedToolCalls) {
          for (const expected of turn.expectedToolCalls) {
            const found = response.toolCalls.some(
              tc => tc.toolName === expected.toolName
            );
            if (!found) {
              issues.push(`缺少预期工具调用: ${expected.toolName}`);
            }
          }
        }

        // 检查输出特征
        if (turn.expectedOutputTraits) {
          for (const trait of turn.expectedOutputTraits) {
            if (!response.content.toLowerCase().includes(trait.toLowerCase())) {
              issues.push(`输出缺少预期特征: ${trait}`);
            }
          }
        }

        // 计算轮次分数
        const turnScore = issues.length === 0
          ? 1.0
          : Math.max(0, 1 - issues.length * 0.2);

        turnResults.push({
          turnIndex: i,
          userInput: turn.content,
          agentOutput: response.content,
          toolCalls: response.toolCalls,
          latency: response.latency,
          tokenUsage: response.tokenUsage,
          turnScore,
          issues,
        });

        totalTokens += response.tokenUsage.totalTokens;
        totalLatency += response.latency;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Turn ${i} failed: ${errorMsg}`);

        trajectory.push({
          index: trajectory.length,
          type: 'error',
          content: errorMsg,
          timestamp: Date.now(),
          metadata: { turnIndex: i },
        });

        turnResults.push({
          turnIndex: i,
          userInput: turn.content,
          agentOutput: '',
          toolCalls: [],
          latency: 0,
          tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          turnScore: 0,
          issues: [errorMsg],
        });
      }
    }

    // 评估最终结果
    const taskCompleted = this.checkOutcome(scenario.expectedOutcome, turnResults, allToolCalls);

    // 计算维度分数
    const dimensionScores = this.calculateDimensionScores(
      turnResults,
      allToolCalls,
      scenario,
      taskCompleted
    );

    // 计算总分
    const overallScore = this.calculateOverallScore(dimensionScores, turnResults);

    const result: E2EResult = {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      turns: turnResults,
      overallScore,
      dimensionScores,
      totalToolCalls: allToolCalls.length,
      totalTokens,
      totalLatency,
      taskCompleted,
      errors,
      trajectory,
    };

    this.results.push(result);
    return result;
  }

  /**
   * 批量运行场景
   */
  async runScenarios(scenarios: ConversationScenario[]): Promise<E2EResult[]> {
    const results: E2EResult[] = [];
    for (const scenario of scenarios) {
      const result = await this.runScenario(scenario);
      results.push(result);
    }
    return results;
  }

  /**
   * 检查最终结果是否符合预期
   */
  private checkOutcome(
    expected: ExpectedOutcome,
    turnResults: TurnResult[],
    allToolCalls: ToolCallRecord[]
  ): boolean {
    // 检查必需信息
    if (expected.requiredInformation) {
      const lastOutput = turnResults[turnResults.length - 1]?.agentOutput ?? '';
      for (const info of expected.requiredInformation) {
        if (!lastOutput.toLowerCase().includes(info.toLowerCase())) {
          return false;
        }
      }
    }

    // 检查禁止内容
    if (expected.forbiddenContent) {
      const allOutputs = turnResults.map(tr => tr.agentOutput).join(' ');
      for (const forbidden of expected.forbiddenContent) {
        if (allOutputs.toLowerCase().includes(forbidden.toLowerCase())) {
          return false;
        }
      }
    }

    // 检查工具调用次数范围
    if (expected.toolCallCountRange) {
      const count = allToolCalls.length;
      if (count < expected.toolCallCountRange.min ||
          count > expected.toolCallCountRange.max) {
        return false;
      }
    }

    return expected.taskCompleted;
  }

  /**
   * 计算各维度分数
   */
  private calculateDimensionScores(
    turnResults: TurnResult[],
    allToolCalls: ToolCallRecord[],
    scenario: ConversationScenario,
    taskCompleted: boolean
  ): Record<string, number> {
    const scores: Record<string, number> = {};

    // 任务完成度
    scores['task_completion'] = taskCompleted ? 1.0 : 0.0;

    // 轮次质量平均
    if (turnResults.length > 0) {
      scores['turn_quality'] =
        turnResults.reduce((sum, tr) => sum + tr.turnScore, 0) / turnResults.length;
    }

    // 工具选择准确率
    let expectedToolCalls = 0;
    let correctToolCalls = 0;
    for (const turn of scenario.turns) {
      if (turn.expectedToolCalls) {
        for (const expected of turn.expectedToolCalls) {
          expectedToolCalls++;
          const turnResult = turnResults.find(
            tr => tr.turnIndex === scenario.turns.indexOf(turn)
          );
          if (turnResult?.toolCalls.some(tc => tc.toolName === expected.toolName)) {
            correctToolCalls++;
          }
        }
      }
    }
    scores['tool_selection'] = expectedToolCalls > 0
      ? correctToolCalls / expectedToolCalls
      : 1.0;

    // 效率分数（基于工具调用次数与预期的对比）
    if (scenario.expectedOutcome.toolCallCountRange) {
      const { min, max } = scenario.expectedOutcome.toolCallCountRange;
      const optimal = (min + max) / 2;
      const actual = allToolCalls.length;
      scores['efficiency'] = actual <= max && actual >= min
        ? 1.0 - Math.abs(actual - optimal) / (max - min + 1) * 0.5
        : Math.max(0, 0.5 - Math.abs(actual - optimal) / optimal * 0.5);
    }

    // 错误恢复能力
    const toolErrors = allToolCalls.filter(tc => !tc.success).length;
    const recoveredErrors = turnResults.filter(
      tr => tr.issues.length > 0 && tr.turnScore > 0.5
    ).length;
    scores['error_recovery'] = toolErrors > 0
      ? recoveredErrors / toolErrors
      : 1.0;

    return scores;
  }

  private calculateOverallScore(
    dimensionScores: Record<string, number>,
    turnResults: TurnResult[]
  ): number {
    const weights: Record<string, number> = {
      task_completion: 0.35,
      turn_quality: 0.25,
      tool_selection: 0.20,
      efficiency: 0.10,
      error_recovery: 0.10,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const [dim, score] of Object.entries(dimensionScores)) {
      const weight = weights[dim] ?? 0.1;
      weightedSum += score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * 获取所有结果
   */
  getResults(): E2EResult[] {
    return [...this.results];
  }
}
```

### 15.6.3 轨迹评估器

`TrajectoryEvaluator` 不仅评估 Agent 的最终输出，还评估到达该输出的**完整行动路径**。这对于理解 Agent 的决策质量至关重要。

```typescript
// ============================================================
// 15.6 TrajectoryEvaluator —— 轨迹评估器
// ============================================================

/**
 * 参考轨迹（最优路径）
 */
interface ReferenceTrajectory {
  id: string;
  description: string;
  steps: Array<{
    type: 'tool_call' | 'reasoning' | 'output';
    content: string;
    isRequired: boolean;
    isOrdered: boolean;  // 是否必须按此顺序执行
    alternatives?: string[];  // 可替代的步骤
  }>;
}

/**
 * 轨迹评估结果
 */
interface TrajectoryEvalResult {
  /** 路径效率分数 (0-1): 是否采用了最优路径 */
  pathEfficiency: number;
  /** 步骤覆盖率 (0-1): 关键步骤完成比例 */
  stepCoverage: number;
  /** 顺序正确性 (0-1): 步骤执行顺序是否合理 */
  orderCorrectness: number;
  /** 冗余度 (0-1, 越低越好): 不必要步骤的比例 */
  redundancy: number;
  /** 自纠错能力 (0-1): 识别并纠正错误的能力 */
  selfCorrectionAbility: number;
  /** 回退效率 (0-1): 遇到错误时回退到正确路径的效率 */
  backtrackingEfficiency: number;
  /** 综合分数 */
  overallScore: number;
  /** 详细分析 */
  analysis: TrajectoryAnalysis;
}

interface TrajectoryAnalysis {
  coveredRequiredSteps: string[];
  missedRequiredSteps: string[];
  redundantSteps: string[];
  errorSteps: string[];
  correctedErrors: string[];
  optimalPathLength: number;
  actualPathLength: number;
  detailedNotes: string[];
}

class TrajectoryEvaluator {
  /**
   * 基于参考轨迹评估实际轨迹
   */
  evaluate(
    actual: TrajectoryStep[],
    reference: ReferenceTrajectory
  ): TrajectoryEvalResult {
    const analysis = this.analyzeTrajectory(actual, reference);

    const pathEfficiency = this.calculatePathEfficiency(analysis);
    const stepCoverage = this.calculateStepCoverage(analysis);
    const orderCorrectness = this.calculateOrderCorrectness(actual, reference);
    const redundancy = this.calculateRedundancy(analysis);
    const selfCorrectionAbility = this.calculateSelfCorrection(actual);
    const backtrackingEfficiency = this.calculateBacktracking(actual);

    // 加权综合分数
    const overallScore =
      pathEfficiency * 0.20 +
      stepCoverage * 0.30 +
      orderCorrectness * 0.15 +
      (1 - redundancy) * 0.15 +
      selfCorrectionAbility * 0.10 +
      backtrackingEfficiency * 0.10;

    return {
      pathEfficiency,
      stepCoverage,
      orderCorrectness,
      redundancy,
      selfCorrectionAbility,
      backtrackingEfficiency,
      overallScore,
      analysis,
    };
  }

  /**
   * 无参考轨迹评估（Reference-Free）
   *
   * 当没有标准答案时，基于轨迹的内在特征进行评估
   */
  evaluateReferenceFree(
    actual: TrajectoryStep[]
  ): {
    coherence: number;       // 步骤间的连贯性
    progressivity: number;   // 是否朝目标推进
    efficiency: number;      // 无冗余步骤
    recoverability: number;  // 错误恢复能力
    overallScore: number;
  } {
    const coherence = this.assessCoherence(actual);
    const progressivity = this.assessProgressivity(actual);
    const efficiency = this.assessEfficiency(actual);
    const recoverability = this.assessRecoverability(actual);

    const overallScore =
      coherence * 0.25 +
      progressivity * 0.35 +
      efficiency * 0.25 +
      recoverability * 0.15;

    return { coherence, progressivity, efficiency, recoverability, overallScore };
  }

  // ─────────────────── 分析方法 ───────────────────

  private analyzeTrajectory(
    actual: TrajectoryStep[],
    reference: ReferenceTrajectory
  ): TrajectoryAnalysis {
    const requiredSteps = reference.steps.filter(s => s.isRequired);
    const coveredRequiredSteps: string[] = [];
    const missedRequiredSteps: string[] = [];
    const redundantSteps: string[] = [];
    const errorSteps: string[] = [];
    const correctedErrors: string[] = [];

    // 检查必需步骤覆盖
    for (const required of requiredSteps) {
      const found = actual.some(a => {
        if (a.type === 'tool_call' && required.type === 'tool_call') {
          return a.content.includes(required.content) ||
                 (required.alternatives?.some(alt => a.content.includes(alt)) ?? false);
        }
        return a.content.includes(required.content);
      });

      if (found) {
        coveredRequiredSteps.push(required.content);
      } else {
        missedRequiredSteps.push(required.content);
      }
    }

    // 识别冗余步骤
    const referenceContents = new Set(
      reference.steps.flatMap(s => [s.content, ...(s.alternatives ?? [])])
    );
    for (const step of actual) {
      if (step.type === 'tool_call') {
        const isRelevant = [...referenceContents].some(c => step.content.includes(c));
        if (!isRelevant) {
          redundantSteps.push(step.content);
        }
      }
    }

    // 识别错误和纠正
    for (let i = 0; i < actual.length; i++) {
      if (actual[i].type === 'error') {
        errorSteps.push(actual[i].content);
        // 检查后续是否有纠正行为
        if (i + 1 < actual.length && actual[i + 1].type !== 'error') {
          correctedErrors.push(actual[i].content);
        }
      }
    }

    return {
      coveredRequiredSteps,
      missedRequiredSteps,
      redundantSteps,
      errorSteps,
      correctedErrors,
      optimalPathLength: reference.steps.filter(s => s.isRequired).length,
      actualPathLength: actual.filter(a => a.type === 'tool_call').length,
      detailedNotes: [],
    };
  }

  private calculatePathEfficiency(analysis: TrajectoryAnalysis): number {
    if (analysis.optimalPathLength === 0) return 1.0;
    const ratio = analysis.optimalPathLength / Math.max(analysis.actualPathLength, 1);
    return Math.min(1.0, ratio);
  }

  private calculateStepCoverage(analysis: TrajectoryAnalysis): number {
    const totalRequired = analysis.coveredRequiredSteps.length + analysis.missedRequiredSteps.length;
    if (totalRequired === 0) return 1.0;
    return analysis.coveredRequiredSteps.length / totalRequired;
  }

  private calculateOrderCorrectness(
    actual: TrajectoryStep[],
    reference: ReferenceTrajectory
  ): number {
    const orderedRefSteps = reference.steps.filter(s => s.isOrdered);
    if (orderedRefSteps.length <= 1) return 1.0;

    let correctOrder = 0;
    let totalChecked = 0;

    for (let i = 0; i < orderedRefSteps.length - 1; i++) {
      const currentRef = orderedRefSteps[i];
      const nextRef = orderedRefSteps[i + 1];

      const currentActualIdx = actual.findIndex(a => a.content.includes(currentRef.content));
      const nextActualIdx = actual.findIndex(a => a.content.includes(nextRef.content));

      if (currentActualIdx >= 0 && nextActualIdx >= 0) {
        totalChecked++;
        if (currentActualIdx < nextActualIdx) {
          correctOrder++;
        }
      }
    }

    return totalChecked > 0 ? correctOrder / totalChecked : 1.0;
  }

  private calculateRedundancy(analysis: TrajectoryAnalysis): number {
    if (analysis.actualPathLength === 0) return 0;
    return analysis.redundantSteps.length / analysis.actualPathLength;
  }

  private calculateSelfCorrection(actual: TrajectoryStep[]): number {
    const errors = actual.filter(s => s.type === 'error');
    if (errors.length === 0) return 1.0;

    let corrections = 0;
    for (let i = 0; i < actual.length; i++) {
      if (actual[i].type === 'error') {
        // 在错误之后是否有成功的步骤
        const recovered = actual.slice(i + 1).some(
          s => s.type === 'tool_call' && s.metadata['success'] !== false
        );
        if (recovered) corrections++;
      }
    }

    return corrections / errors.length;
  }

  private calculateBacktracking(actual: TrajectoryStep[]): number {
    const toolCalls = actual.filter(s => s.type === 'tool_call');
    if (toolCalls.length <= 1) return 1.0;

    // 检测是否有重复的工具调用（可能是回退重试）
    const seen = new Set<string>();
    let duplicates = 0;
    for (const tc of toolCalls) {
      const key = tc.content.split('(')[0]; // 工具名部分
      if (seen.has(key)) {
        duplicates++;
      }
      seen.add(key);
    }

    return 1 - (duplicates / toolCalls.length);
  }

  // ─────────────────── Reference-Free 评估方法 ───────────────────

  private assessCoherence(actual: TrajectoryStep[]): number {
    if (actual.length <= 1) return 1.0;

    let coherentTransitions = 0;
    let totalTransitions = 0;

    for (let i = 1; i < actual.length; i++) {
      totalTransitions++;
      const prev = actual[i - 1];
      const curr = actual[i];

      // 合理的转换模式
      const coherentPatterns = [
        ['user_input', 'agent_thinking'],
        ['agent_thinking', 'tool_call'],
        ['tool_call', 'tool_call'],
        ['tool_call', 'agent_thinking'],
        ['tool_call', 'agent_output'],
        ['agent_thinking', 'agent_output'],
        ['error', 'agent_thinking'],
        ['error', 'tool_call'],
      ];

      const isCoherent = coherentPatterns.some(
        ([a, b]) => prev.type === a && curr.type === b
      );

      if (isCoherent) coherentTransitions++;
    }

    return totalTransitions > 0 ? coherentTransitions / totalTransitions : 1.0;
  }

  private assessProgressivity(actual: TrajectoryStep[]): number {
    // 基于工具调用是否越来越接近最终输出来评估
    const toolCalls = actual.filter(s => s.type === 'tool_call');
    const hasOutput = actual.some(s => s.type === 'agent_output');

    if (!hasOutput) return 0;
    if (toolCalls.length === 0) return 0.5;

    // 检查是否有"卡在循环"的模式
    const toolNames = toolCalls.map(tc => tc.content.split('(')[0]);
    const uniqueTools = new Set(toolNames).size;
    const diversityRatio = uniqueTools / toolNames.length;

    return diversityRatio;
  }

  private assessEfficiency(actual: TrajectoryStep[]): number {
    const totalSteps = actual.length;
    const meaningfulSteps = actual.filter(
      s => s.type !== 'error' && s.content.length > 0
    ).length;

    return totalSteps > 0 ? meaningfulSteps / totalSteps : 1.0;
  }

  private assessRecoverability(actual: TrajectoryStep[]): number {
    return this.calculateSelfCorrection(actual);
  }
}
```

> **与轨迹评估的实践提示**：在实际项目中，参考轨迹（Reference Trajectory）往往需要人工标注。一种高效的做法是：先让 Agent 运行一批任务，由人工从成功案例中筛选最优轨迹作为参考。随着评测数据的积累，参考轨迹库会自然增长。



---

## 15.7 人工评测

### 15.7.1 何时需要人工评测

自动化评测不是万能的。以下场景仍然需要人工评测：

1. **建立评测基线**：当首次构建评测体系时，需要人工标注来校准自动化评测
2. **主观质量判断**：语言流畅度、创意性等难以自动化评估的维度
3. **偏差审计**：定期检查 LLM-as-Judge 是否引入了系统性偏差
4. **安全审查**：高风险场景需要人工确认 Agent 行为的安全性
5. **边缘案例分析**：自动化评测中分歧较大的样本需要人工仲裁

### 15.7.2 人工评测管理器

```typescript
// ============================================================
// 15.7 HumanEvalManager —— 人工评测管理器
// ============================================================

/**
 * 标注任务状态
 */
enum AnnotationStatus {
  PENDING = 'pending',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  DISPUTED = 'disputed',
  QUALITY_FAILED = 'quality_failed',
}

/**
 * 标注者信息
 */
interface Annotator {
  id: string;
  name: string;
  expertise: string[];
  qualityScore: number;  // 历史标注质量分 (0-1)
  completedTasks: number;
  activeTaskCount: number;
  maxConcurrentTasks: number;
}

/**
 * 标注任务
 */
interface AnnotationTask {
  id: string;
  sampleId: string;
  input: string;
  output: string;
  reference?: string;
  criteria: AnnotationCriterion[];
  status: AnnotationStatus;
  assignedTo: string[];
  annotations: Annotation[];
  goldStandard?: Annotation; // 黄金标准（用于质量控制）
  createdAt: Date;
  deadline?: Date;
  metadata: Record<string, unknown>;
}

/**
 * 标注标准
 */
interface AnnotationCriterion {
  id: string;
  name: string;
  description: string;
  type: 'likert' | 'binary' | 'categorical' | 'freetext' | 'ranking';
  options?: string[];
  scaleRange?: { min: number; max: number };
  required: boolean;
}

/**
 * 单条标注
 */
interface Annotation {
  annotatorId: string;
  taskId: string;
  scores: Record<string, number | string>;
  reasoning?: string;
  flagged: boolean;
  flagReason?: string;
  timestamp: Date;
  duration: number; // 标注耗时（秒）
}

/**
 * 标注 UI 数据模型
 */
interface AnnotationUIModel {
  task: AnnotationTask;
  annotator: Annotator;
  guidelines: string;
  previousAnnotations?: Annotation[];  // 其他标注者的标注（用于审核）
  goldStandardFeedback?: string;       // 黄金标准反馈
}

/**
 * 质量控制配置
 */
interface QualityControlConfig {
  /** 每个任务的最少标注者数量 */
  minAnnotatorsPerTask: number;
  /** 黄金标准题的插入比例 */
  goldStandardRatio: number;
  /** 黄金标准题的最低正确率 */
  goldStandardMinAccuracy: number;
  /** 最低标注者间一致性 (Cohen's Kappa) */
  minInterAnnotatorAgreement: number;
  /** 标注速度异常阈值（秒，低于此值视为可疑） */
  suspiciouslyFastThreshold: number;
}

class HumanEvalManager {
  private tasks: Map<string, AnnotationTask> = new Map();
  private annotators: Map<string, Annotator> = new Map();
  private goldStandards: Map<string, Annotation> = new Map();
  private qcConfig: QualityControlConfig;
  private agreementCalculator: AnnotationAgreementCalculator;

  constructor(qcConfig?: Partial<QualityControlConfig>) {
    this.qcConfig = {
      minAnnotatorsPerTask: 3,
      goldStandardRatio: 0.1,
      goldStandardMinAccuracy: 0.8,
      minInterAnnotatorAgreement: 0.6,
      suspiciouslyFastThreshold: 10,
      ...qcConfig,
    };
    this.agreementCalculator = new AnnotationAgreementCalculator();
  }

  // ─────────────────── 标注者管理 ───────────────────

  /**
   * 注册标注者
   */
  registerAnnotator(annotator: Annotator): void {
    this.annotators.set(annotator.id, annotator);
  }

  /**
   * 获取可用标注者
   */
  getAvailableAnnotators(
    requiredExpertise?: string[]
  ): Annotator[] {
    return Array.from(this.annotators.values()).filter(a => {
      if (a.activeTaskCount >= a.maxConcurrentTasks) return false;
      if (requiredExpertise) {
        return requiredExpertise.every(e => a.expertise.includes(e));
      }
      return true;
    });
  }

  // ─────────────────── 任务管理 ───────────────────

  /**
   * 创建标注任务批次
   */
  createBatch(
    samples: Array<{ id: string; input: string; output: string; reference?: string }>,
    criteria: AnnotationCriterion[],
    options?: { deadline?: Date; metadata?: Record<string, unknown> }
  ): string[] {
    const taskIds: string[] = [];

    for (const sample of samples) {
      const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const task: AnnotationTask = {
        id: taskId,
        sampleId: sample.id,
        input: sample.input,
        output: sample.output,
        reference: sample.reference,
        criteria,
        status: AnnotationStatus.PENDING,
        assignedTo: [],
        annotations: [],
        createdAt: new Date(),
        deadline: options?.deadline,
        metadata: options?.metadata ?? {},
      };

      this.tasks.set(taskId, task);
      taskIds.push(taskId);
    }

    // 插入黄金标准题
    this.insertGoldStandards(taskIds, criteria);

    return taskIds;
  }

  /**
   * 自动分配任务给标注者
   */
  assignTasks(taskIds: string[]): Map<string, string[]> {
    const assignments = new Map<string, string[]>();

    for (const taskId of taskIds) {
      const task = this.tasks.get(taskId);
      if (!task || task.status !== AnnotationStatus.PENDING) continue;

      const availableAnnotators = this.getAvailableAnnotators();

      // 按质量分数排序，选取最优的标注者
      const selectedAnnotators = availableAnnotators
        .sort((a, b) => b.qualityScore - a.qualityScore)
        .slice(0, this.qcConfig.minAnnotatorsPerTask);

      if (selectedAnnotators.length < this.qcConfig.minAnnotatorsPerTask) {
        // 可用标注者不足，跳过
        continue;
      }

      task.assignedTo = selectedAnnotators.map(a => a.id);
      task.status = AnnotationStatus.ASSIGNED;

      for (const annotator of selectedAnnotators) {
        annotator.activeTaskCount++;
        if (!assignments.has(annotator.id)) {
          assignments.set(annotator.id, []);
        }
        assignments.get(annotator.id)!.push(taskId);
      }
    }

    return assignments;
  }

  /**
   * 提交标注
   */
  submitAnnotation(annotation: Annotation): AnnotationSubmitResult {
    const task = this.tasks.get(annotation.taskId);
    if (!task) {
      return { success: false, error: '任务不存在' };
    }

    // 质量检查
    const qcResult = this.performQualityCheck(annotation, task);
    if (!qcResult.passed) {
      return {
        success: false,
        error: `质量检查未通过: ${qcResult.reason}`,
        feedback: qcResult.feedback,
      };
    }

    task.annotations.push(annotation);

    // 更新标注者状态
    const annotator = this.annotators.get(annotation.annotatorId);
    if (annotator) {
      annotator.activeTaskCount = Math.max(0, annotator.activeTaskCount - 1);
      annotator.completedTasks++;
    }

    // 检查是否所有标注者都已完成
    if (task.annotations.length >= this.qcConfig.minAnnotatorsPerTask) {
      task.status = AnnotationStatus.COMPLETED;

      // 检查一致性
      const agreement = this.agreementCalculator.computeCohenKappa(
        task.annotations,
        task.criteria
      );

      if (agreement < this.qcConfig.minInterAnnotatorAgreement) {
        task.status = AnnotationStatus.DISPUTED;
      }
    }

    return { success: true, taskStatus: task.status };
  }

  /**
   * 获取标注任务的最终聚合结果
   */
  getAggregatedResult(taskId: string): AggregatedAnnotation | null {
    const task = this.tasks.get(taskId);
    if (!task || task.annotations.length === 0) return null;

    const aggregatedScores: Record<string, number> = {};
    const allReasonings: string[] = [];

    for (const criterion of task.criteria) {
      const scores = task.annotations
        .map(a => a.scores[criterion.id])
        .filter((s): s is number => typeof s === 'number');

      if (scores.length > 0) {
        // 去掉最高和最低后取平均（trimmed mean）
        if (scores.length >= 4) {
          scores.sort((a, b) => a - b);
          const trimmed = scores.slice(1, -1);
          aggregatedScores[criterion.id] =
            trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
        } else {
          aggregatedScores[criterion.id] =
            scores.reduce((a, b) => a + b, 0) / scores.length;
        }
      }
    }

    for (const annotation of task.annotations) {
      if (annotation.reasoning) {
        allReasonings.push(
          `[${annotation.annotatorId}]: ${annotation.reasoning}`
        );
      }
    }

    return {
      taskId,
      sampleId: task.sampleId,
      scores: aggregatedScores,
      reasonings: allReasonings,
      annotatorCount: task.annotations.length,
      agreement: this.agreementCalculator.computeCohenKappa(
        task.annotations,
        task.criteria
      ),
      status: task.status,
    };
  }

  // ─────────────────── 质量控制 ───────────────────

  /**
   * 插入黄金标准题
   */
  private insertGoldStandards(
    taskIds: string[],
    criteria: AnnotationCriterion[]
  ): void {
    const goldCount = Math.ceil(taskIds.length * this.qcConfig.goldStandardRatio);
    const existingGolds = Array.from(this.goldStandards.values());

    if (existingGolds.length === 0) return;

    for (let i = 0; i < goldCount && i < existingGolds.length; i++) {
      const goldAnnotation = existingGolds[i % existingGolds.length];
      const goldTask = this.tasks.get(goldAnnotation.taskId);
      if (goldTask) {
        goldTask.goldStandard = goldAnnotation;
        goldTask.metadata['isGoldStandard'] = true;
      }
    }
  }

  /**
   * 添加黄金标准
   */
  addGoldStandard(taskId: string, goldAnnotation: Annotation): void {
    this.goldStandards.set(taskId, goldAnnotation);
  }

  /**
   * 执行质量检查
   */
  private performQualityCheck(
    annotation: Annotation,
    task: AnnotationTask
  ): QualityCheckResult {
    // 检查标注速度
    if (annotation.duration < this.qcConfig.suspiciouslyFastThreshold) {
      return {
        passed: false,
        reason: '标注时间过短',
        feedback: '请仔细阅读内容后再进行标注',
      };
    }

    // 检查是否所有必选项都已填写
    for (const criterion of task.criteria) {
      if (criterion.required && !(criterion.id in annotation.scores)) {
        return {
          passed: false,
          reason: `缺少必选标注项: ${criterion.name}`,
          feedback: `请完成 "${criterion.name}" 的标注`,
        };
      }
    }

    // 黄金标准检查
    if (task.goldStandard) {
      const goldScores = task.goldStandard.scores;
      let correctCount = 0;
      let totalChecked = 0;

      for (const criterion of task.criteria) {
        if (criterion.id in goldScores && criterion.id in annotation.scores) {
          totalChecked++;
          const goldScore = goldScores[criterion.id];
          const userScore = annotation.scores[criterion.id];

          if (typeof goldScore === 'number' && typeof userScore === 'number') {
            // 数值型：允许 1 分误差
            if (Math.abs(goldScore - userScore) <= 1) {
              correctCount++;
            }
          } else if (goldScore === userScore) {
            correctCount++;
          }
        }
      }

      const accuracy = totalChecked > 0 ? correctCount / totalChecked : 1;
      if (accuracy < this.qcConfig.goldStandardMinAccuracy) {
        return {
          passed: false,
          reason: '黄金标准题答错',
          feedback: '此题为质量检查题，请重新标注',
        };
      }
    }

    return { passed: true };
  }

  /**
   * 获取标注者质量报告
   */
  getAnnotatorQualityReport(annotatorId: string): AnnotatorQualityReport {
    const annotator = this.annotators.get(annotatorId);
    if (!annotator) {
      throw new Error(`Annotator ${annotatorId} not found`);
    }

    const completedTasks = Array.from(this.tasks.values()).filter(
      t => t.annotations.some(a => a.annotatorId === annotatorId)
    );

    let goldStandardAccuracy = 0;
    let goldStandardCount = 0;
    let totalAgreement = 0;
    let agreementCount = 0;
    const annotationTimes: number[] = [];

    for (const task of completedTasks) {
      const annotation = task.annotations.find(a => a.annotatorId === annotatorId);
      if (!annotation) continue;

      annotationTimes.push(annotation.duration);

      // 黄金标准准确率
      if (task.goldStandard) {
        goldStandardCount++;
        let correct = 0;
        let total = 0;
        for (const criterion of task.criteria) {
          if (criterion.id in task.goldStandard.scores && criterion.id in annotation.scores) {
            total++;
            const gold = task.goldStandard.scores[criterion.id];
            const user = annotation.scores[criterion.id];
            if (typeof gold === 'number' && typeof user === 'number') {
              if (Math.abs(gold - user) <= 1) correct++;
            } else if (gold === user) correct++;
          }
        }
        if (total > 0) goldStandardAccuracy += correct / total;
      }

      // 与其他标注者的一致性
      const otherAnnotations = task.annotations.filter(
        a => a.annotatorId !== annotatorId
      );
      if (otherAnnotations.length > 0) {
        const pairAgreement = this.agreementCalculator.computePairwiseAgreement(
          annotation,
          otherAnnotations[0],
          task.criteria
        );
        totalAgreement += pairAgreement;
        agreementCount++;
      }
    }

    return {
      annotatorId,
      completedTasks: completedTasks.length,
      goldStandardAccuracy: goldStandardCount > 0
        ? goldStandardAccuracy / goldStandardCount
        : NaN,
      averageAgreement: agreementCount > 0 ? totalAgreement / agreementCount : NaN,
      averageAnnotationTime: annotationTimes.length > 0
        ? annotationTimes.reduce((a, b) => a + b, 0) / annotationTimes.length
        : 0,
      qualityScore: annotator.qualityScore,
    };
  }
}

interface AnnotationSubmitResult {
  success: boolean;
  error?: string;
  feedback?: string;
  taskStatus?: AnnotationStatus;
}

interface QualityCheckResult {
  passed: boolean;
  reason?: string;
  feedback?: string;
}

interface AggregatedAnnotation {
  taskId: string;
  sampleId: string;
  scores: Record<string, number>;
  reasonings: string[];
  annotatorCount: number;
  agreement: number;
  status: AnnotationStatus;
}

interface AnnotatorQualityReport {
  annotatorId: string;
  completedTasks: number;
  goldStandardAccuracy: number;
  averageAgreement: number;
  averageAnnotationTime: number;
  qualityScore: number;
}
```

### 15.7.3 标注一致性计算器

标注者间一致性（Inter-Annotator Agreement, IAA）是人工评测质量的核心指标。Cohen's Kappa 是最常用的衡量方法，它在考虑了偶然一致性（Chance Agreement）的基础上衡量实际一致性：

```typescript
// ============================================================
// 15.7 AnnotationAgreementCalculator —— 标注一致性计算器
// ============================================================

class AnnotationAgreementCalculator {
  /**
   * 计算 Cohen's Kappa（两位标注者间的一致性）
   *
   * Kappa = (Po - Pe) / (1 - Pe)
   *
   * Po = 观察到的一致比例
   * Pe = 偶然一致的期望比例
   *
   * 解释：
   *   κ < 0     差于偶然
   *   κ = 0     等于偶然
   *   0.01-0.20 轻微一致
   *   0.21-0.40 公平一致
   *   0.41-0.60 中等一致
   *   0.61-0.80 高度一致
   *   0.81-1.00 几乎完全一致
   */
  computeCohenKappa(
    annotations: Annotation[],
    criteria: AnnotationCriterion[]
  ): number {
    if (annotations.length < 2) return 1.0;

    // 对每对标注者计算 kappa，然后取平均
    const kappas: number[] = [];

    for (let i = 0; i < annotations.length; i++) {
      for (let j = i + 1; j < annotations.length; j++) {
        const kappa = this.computePairwiseKappa(
          annotations[i],
          annotations[j],
          criteria
        );
        kappas.push(kappa);
      }
    }

    return kappas.length > 0
      ? kappas.reduce((a, b) => a + b, 0) / kappas.length
      : 0;
  }

  /**
   * 计算两位标注者之间的 Kappa
   */
  private computePairwiseKappa(
    a: Annotation,
    b: Annotation,
    criteria: AnnotationCriterion[]
  ): number {
    let agreements = 0;
    let totalItems = 0;
    const labelsA: number[] = [];
    const labelsB: number[] = [];

    for (const criterion of criteria) {
      const scoreA = a.scores[criterion.id];
      const scoreB = b.scores[criterion.id];

      if (scoreA === undefined || scoreB === undefined) continue;

      totalItems++;

      // 将分数离散化为类别标签
      const labelA = this.discretize(scoreA, criterion);
      const labelB = this.discretize(scoreB, criterion);

      labelsA.push(labelA);
      labelsB.push(labelB);

      if (labelA === labelB) {
        agreements++;
      }
    }

    if (totalItems === 0) return 0;

    // 观察一致率
    const po = agreements / totalItems;

    // 偶然一致率
    const pe = this.computeExpectedAgreement(labelsA, labelsB);

    // Cohen's Kappa
    if (pe === 1) return 1; // 避免除零
    return (po - pe) / (1 - pe);
  }

  /**
   * 计算偶然一致的期望比例
   */
  private computeExpectedAgreement(labelsA: number[], labelsB: number[]): number {
    const n = labelsA.length;
    if (n === 0) return 0;

    // 统计每个类别的分布
    const countsA = new Map<number, number>();
    const countsB = new Map<number, number>();
    const allLabels = new Set([...labelsA, ...labelsB]);

    for (const label of labelsA) {
      countsA.set(label, (countsA.get(label) ?? 0) + 1);
    }
    for (const label of labelsB) {
      countsB.set(label, (countsB.get(label) ?? 0) + 1);
    }

    let pe = 0;
    for (const label of allLabels) {
      const pA = (countsA.get(label) ?? 0) / n;
      const pB = (countsB.get(label) ?? 0) / n;
      pe += pA * pB;
    }

    return pe;
  }

  /**
   * 计算两位标注者的简单一致率
   */
  computePairwiseAgreement(
    a: Annotation,
    b: Annotation,
    criteria: AnnotationCriterion[]
  ): number {
    let agreements = 0;
    let total = 0;

    for (const criterion of criteria) {
      const scoreA = a.scores[criterion.id];
      const scoreB = b.scores[criterion.id];
      if (scoreA === undefined || scoreB === undefined) continue;

      total++;
      if (typeof scoreA === 'number' && typeof scoreB === 'number') {
        if (Math.abs(scoreA - scoreB) <= 1) agreements++;
      } else if (scoreA === scoreB) {
        agreements++;
      }
    }

    return total > 0 ? agreements / total : 0;
  }

  /**
   * 计算 Fleiss' Kappa（多位标注者间的一致性）
   *
   * 适用于固定的一组标注者对同一批样本进行标注
   */
  computeFleissKappa(
    allAnnotations: Annotation[][],  // 每个内数组包含同一任务的多个标注
    criteria: AnnotationCriterion[]
  ): number {
    // 对每个标注标准分别计算 Fleiss' Kappa
    const kappas: number[] = [];

    for (const criterion of criteria) {
      const matrix: number[][] = []; // subjects × categories
      const categories = new Set<number>();

      // 构建标注矩阵
      for (const taskAnnotations of allAnnotations) {
        const row: number[] = [];
        for (const annotation of taskAnnotations) {
          const score = annotation.scores[criterion.id];
          if (typeof score === 'number') {
            const discrete = this.discretize(score, criterion);
            categories.add(discrete);
            row.push(discrete);
          }
        }
        if (row.length > 0) matrix.push(row);
      }

      if (matrix.length < 2) continue;

      const kappa = this.fleissKappaFromMatrix(matrix, [...categories]);
      kappas.push(kappa);
    }

    return kappas.length > 0
      ? kappas.reduce((a, b) => a + b, 0) / kappas.length
      : 0;
  }

  /**
   * 从标注矩阵计算 Fleiss' Kappa
   */
  private fleissKappaFromMatrix(matrix: number[][], categories: number[]): number {
    const N = matrix.length;    // 样本数
    const n = matrix[0]?.length ?? 0; // 每个样本的标注者数
    const k = categories.length; // 类别数

    if (N === 0 || n < 2 || k === 0) return 0;

    // 构建 N × k 的计数矩阵
    const counts: number[][] = Array.from({ length: N }, () =>
      Array.from({ length: k }, () => 0)
    );

    for (let i = 0; i < N; i++) {
      for (const label of matrix[i]) {
        const catIdx = categories.indexOf(label);
        if (catIdx >= 0) counts[i][catIdx]++;
      }
    }

    // 计算 Pi（每个样本的一致度）
    let sumPi = 0;
    for (let i = 0; i < N; i++) {
      let sumSquares = 0;
      for (let j = 0; j < k; j++) {
        sumSquares += counts[i][j] * counts[i][j];
      }
      sumPi += (sumSquares - n) / (n * (n - 1));
    }
    const Pbar = sumPi / N;

    // 计算 Pe（偶然一致度）
    let PeBar = 0;
    for (let j = 0; j < k; j++) {
      let colSum = 0;
      for (let i = 0; i < N; i++) {
        colSum += counts[i][j];
      }
      const pj = colSum / (N * n);
      PeBar += pj * pj;
    }

    if (PeBar === 1) return 1;
    return (Pbar - PeBar) / (1 - PeBar);
  }

  /**
   * 将分数离散化为类别
   */
  private discretize(score: number | string, criterion: AnnotationCriterion): number {
    if (typeof score === 'string') {
      return criterion.options?.indexOf(score) ?? 0;
    }

    // 将连续分数离散化为 5 个桶
    if (criterion.scaleRange) {
      const { min, max } = criterion.scaleRange;
      const range = max - min;
      if (range === 0) return 0;
      const bucket = Math.floor(((score - min) / range) * 5);
      return Math.min(4, Math.max(0, bucket));
    }

    return Math.round(score);
  }

  /**
   * 解释 Kappa 值
   */
  static interpretKappa(kappa: number): string {
    if (kappa < 0) return '差于偶然一致 (Poor)';
    if (kappa < 0.21) return '轻微一致 (Slight)';
    if (kappa < 0.41) return '公平一致 (Fair)';
    if (kappa < 0.61) return '中等一致 (Moderate)';
    if (kappa < 0.81) return '高度一致 (Substantial)';
    return '几乎完全一致 (Almost Perfect)';
  }
}
```

---

## 15.8 CI/CD 集成

### 15.8.1 评测即门禁

在传统软件开发中，单元测试作为 CI/CD 的门禁（Gate）确保代码质量。对于 Agent 系统，**评测是更高层次的门禁**。任何可能影响 Agent 行为的变更——无论是 prompt 修改、工具更新还是模型升级——都应该通过评测门禁。

### 15.8.2 CI 评测运行器

```typescript
// ============================================================
// 15.8 CIEvalRunner —— CI/CD 评测运行器
// ============================================================

/**
 * CI 评测配置
 */
interface CIEvalConfig {
  /** 评测套件 */
  suites: EvalSuite[];
  /** 基线标识 */
  baselineRef: string;
  /** 是否阻断部署 */
  blockDeployment: boolean;
  /** 超时（分钟） */
  timeoutMinutes: number;
  /** 报告格式 */
  reportFormat: 'json' | 'markdown' | 'html';
  /** 通知渠道 */
  notificationChannels: string[];
  /** 并行度 */
  parallelism: number;
}

interface EvalSuite {
  id: string;
  name: string;
  tests: EvalTestCase[];
  weight: number;
  gatekeeper: EvalGatekeeper;
}

interface EvalTestCase {
  id: string;
  name: string;
  input: string;
  expectedOutput?: string;
  evaluators: string[];
  tags: string[];
  timeout: number;
}

/**
 * CI 运行报告
 */
interface CIEvalReport {
  runId: string;
  commitSha: string;
  branch: string;
  timestamp: Date;
  duration: number;
  suiteResults: SuiteResult[];
  overallPassed: boolean;
  regressions: RegressionItem[];
  summary: string;
  artifacts: string[];
}

interface SuiteResult {
  suiteId: string;
  suiteName: string;
  passed: boolean;
  score: number;
  testResults: TestResult[];
  gateResult: GateResult;
}

interface TestResult {
  testId: string;
  testName: string;
  passed: boolean;
  score: number;
  details: Record<string, unknown>;
  duration: number;
}

interface GateResult {
  passed: boolean;
  criteria: Array<{
    name: string;
    expected: number;
    actual: number;
    passed: boolean;
  }>;
  overrideReason?: string;
}

class CIEvalRunner {
  private config: CIEvalConfig;
  private pipeline: ProductionEvalPipeline;
  private baselineStore: Map<string, EvalRunResult> = new Map();

  constructor(config: CIEvalConfig, pipeline: ProductionEvalPipeline) {
    this.config = config;
    this.pipeline = pipeline;
  }

  /**
   * 运行 CI 评测
   */
  async run(context: CIContext): Promise<CIEvalReport> {
    const startTime = Date.now();
    const suiteResults: SuiteResult[] = [];
    const allRegressions: RegressionItem[] = [];

    console.log(`[CI Eval] 开始评测 commit: ${context.commitSha}`);
    console.log(`[CI Eval] 分支: ${context.branch}`);
    console.log(`[CI Eval] 评测套件数: ${this.config.suites.length}`);

    for (const suite of this.config.suites) {
      console.log(`[CI Eval] 运行套件: ${suite.name}`);

      try {
        const suiteResult = await this.runSuite(suite, context);
        suiteResults.push(suiteResult);

        if (!suiteResult.passed) {
          console.log(`[CI Eval] ✗ 套件 "${suite.name}" 未通过`);
        } else {
          console.log(`[CI Eval] ✓ 套件 "${suite.name}" 通过 (分数: ${suiteResult.score.toFixed(2)})`);
        }
      } catch (error) {
        console.error(`[CI Eval] 套件 "${suite.name}" 执行失败:`, error);
        suiteResults.push({
          suiteId: suite.id,
          suiteName: suite.name,
          passed: false,
          score: 0,
          testResults: [],
          gateResult: {
            passed: false,
            criteria: [{ name: 'execution', expected: 1, actual: 0, passed: false }],
          },
        });
      }
    }

    // 加载基线并检测回归
    const baseline = this.baselineStore.get(this.config.baselineRef);
    if (baseline) {
      // 构建当前运行结果进行比较
      const regressionDetector = new RegressionDetector({
        baselineRunId: this.config.baselineRef,
        minDegradation: 0.05,
        confidenceLevel: 0.95,
        sampleLevelDetection: true,
        consecutiveRegressionThreshold: 3,
      });

      // 这里简化处理，实际实现需要合并所有套件结果
    }

    const overallPassed = suiteResults.every(sr => sr.passed);
    const duration = Date.now() - startTime;

    const report: CIEvalReport = {
      runId: `ci_${context.commitSha.substring(0, 8)}_${Date.now()}`,
      commitSha: context.commitSha,
      branch: context.branch,
      timestamp: new Date(),
      duration,
      suiteResults,
      overallPassed,
      regressions: allRegressions,
      summary: this.generateReport(suiteResults, overallPassed, duration),
      artifacts: [],
    };

    // 输出到 CI 系统
    await this.outputReport(report, context);

    return report;
  }

  /**
   * 运行单个评测套件
   */
  private async runSuite(suite: EvalSuite, context: CIContext): Promise<SuiteResult> {
    const testResults: TestResult[] = [];

    // 将测试用例分批并行执行
    const batches = this.createBatches(suite.tests, this.config.parallelism);

    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map(test => this.runTest(test, context))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          testResults.push(result.value);
        } else {
          testResults.push({
            testId: 'unknown',
            testName: 'unknown',
            passed: false,
            score: 0,
            details: { error: result.reason?.message },
            duration: 0,
          });
        }
      }
    }

    // 计算套件分数
    const score = testResults.length > 0
      ? testResults.reduce((sum, tr) => sum + tr.score, 0) / testResults.length
      : 0;

    // 通过门禁检查
    const gateResult = suite.gatekeeper.check(testResults, score);

    return {
      suiteId: suite.id,
      suiteName: suite.name,
      passed: gateResult.passed,
      score,
      testResults,
      gateResult,
    };
  }

  /**
   * 运行单个测试
   */
  private async runTest(test: EvalTestCase, _context: CIContext): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // 实际的测试执行逻辑
      // 这里模拟一个评估结果
      const score = Math.random() * 0.5 + 0.5; // 模拟分数

      return {
        testId: test.id,
        testName: test.name,
        passed: score >= 0.7,
        score,
        details: { tags: test.tags },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        testId: test.id,
        testName: test.name,
        passed: false,
        score: 0,
        details: { error: error instanceof Error ? error.message : String(error) },
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 设置基线
   */
  setBaseline(ref: string, run: EvalRunResult): void {
    this.baselineStore.set(ref, run);
  }

  /**
   * 生成报告
   */
  private generateReport(
    suiteResults: SuiteResult[],
    overallPassed: boolean,
    duration: number
  ): string {
    const lines: string[] = [];

    lines.push(`# Agent 评测报告`);
    lines.push(`状态: ${overallPassed ? '✓ 通过' : '✗ 未通过'}`);
    lines.push(`耗时: ${(duration / 1000).toFixed(1)}s`);
    lines.push('');

    for (const sr of suiteResults) {
      const icon = sr.passed ? '✓' : '✗';
      lines.push(`## ${icon} ${sr.suiteName} (${(sr.score * 100).toFixed(1)}%)`);

      for (const tr of sr.testResults) {
        const testIcon = tr.passed ? '  ✓' : '  ✗';
        lines.push(`${testIcon} ${tr.testName}: ${(tr.score * 100).toFixed(1)}%`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 输出报告到 CI 系统
   */
  private async outputReport(report: CIEvalReport, context: CIContext): Promise<void> {
    // 输出到 stdout（CI 系统可以捕获）
    console.log(report.summary);

    // 如果未通过且配置了阻断部署，设置退出码
    if (!report.overallPassed && this.config.blockDeployment) {
      console.error('[CI Eval] 评测未通过，部署已阻断');
      // 在实际 CI 中：process.exit(1);
    }
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
}

interface CIContext {
  commitSha: string;
  branch: string;
  pullRequestId?: string;
  triggeredBy: string;
  environment: Record<string, string>;
}
```

### 15.8.3 评测门禁

```typescript
// ============================================================
// 15.8 EvalGatekeeper —— 评测门禁
// ============================================================

/**
 * 门禁标准
 */
interface GateCriterion {
  id: string;
  name: string;
  description: string;
  type: 'minimum-score' | 'maximum-regression' | 'minimum-pass-rate' | 'custom';
  threshold: number;
  weight: number;
  /** 是否为硬性要求（不满足则直接失败） */
  isHardRequirement: boolean;
}

class EvalGatekeeper {
  private criteria: GateCriterion[] = [];
  private overrideEnabled: boolean = false;
  private overrideReason: string = '';

  constructor(criteria: GateCriterion[]) {
    this.criteria = criteria;
  }

  /**
   * 创建默认门禁（常用配置）
   */
  static createDefault(): EvalGatekeeper {
    return new EvalGatekeeper([
      {
        id: 'min-overall-score',
        name: '最低总分',
        description: '评测总分不低于 70%',
        type: 'minimum-score',
        threshold: 0.7,
        weight: 1.0,
        isHardRequirement: true,
      },
      {
        id: 'max-regression',
        name: '最大回归幅度',
        description: '相比基线，任何指标退化不超过 5%',
        type: 'maximum-regression',
        threshold: 0.05,
        weight: 1.0,
        isHardRequirement: true,
      },
      {
        id: 'min-pass-rate',
        name: '最低通过率',
        description: '至少 80% 的测试用例通过',
        type: 'minimum-pass-rate',
        threshold: 0.8,
        weight: 0.8,
        isHardRequirement: false,
      },
    ]);
  }

  /**
   * 创建严格门禁（用于生产环境发布）
   */
  static createStrict(): EvalGatekeeper {
    return new EvalGatekeeper([
      {
        id: 'strict-min-score',
        name: '严格最低总分',
        description: '评测总分不低于 85%',
        type: 'minimum-score',
        threshold: 0.85,
        weight: 1.0,
        isHardRequirement: true,
      },
      {
        id: 'strict-max-regression',
        name: '严格最大回归',
        description: '相比基线退化不超过 2%',
        type: 'maximum-regression',
        threshold: 0.02,
        weight: 1.0,
        isHardRequirement: true,
      },
      {
        id: 'strict-pass-rate',
        name: '严格通过率',
        description: '至少 95% 的测试用例通过',
        type: 'minimum-pass-rate',
        threshold: 0.95,
        weight: 1.0,
        isHardRequirement: true,
      },
      {
        id: 'strict-safety',
        name: '安全零容忍',
        description: '安全相关测试 100% 通过',
        type: 'custom',
        threshold: 1.0,
        weight: 2.0,
        isHardRequirement: true,
      },
    ]);
  }

  /**
   * 执行门禁检查
   */
  check(testResults: TestResult[], overallScore: number): GateResult {
    const criteriaResults: GateResult['criteria'] = [];
    let allPassed = true;

    for (const criterion of this.criteria) {
      let actual: number;
      let passed: boolean;

      switch (criterion.type) {
        case 'minimum-score':
          actual = overallScore;
          passed = actual >= criterion.threshold;
          break;

        case 'maximum-regression':
          // 需要基线数据，这里使用 0 作为占位
          actual = 0;
          passed = actual <= criterion.threshold;
          break;

        case 'minimum-pass-rate':
          const passedTests = testResults.filter(tr => tr.passed).length;
          actual = testResults.length > 0 ? passedTests / testResults.length : 0;
          passed = actual >= criterion.threshold;
          break;

        case 'custom':
          // 安全测试特殊处理
          if (criterion.id.includes('safety')) {
            const safetyTests = testResults.filter(
              tr => (tr.details['tags'] as string[])?.includes('safety')
            );
            const safetyPassed = safetyTests.filter(tr => tr.passed).length;
            actual = safetyTests.length > 0 ? safetyPassed / safetyTests.length : 1;
            passed = actual >= criterion.threshold;
          } else {
            actual = overallScore;
            passed = actual >= criterion.threshold;
          }
          break;

        default:
          actual = 0;
          passed = false;
      }

      criteriaResults.push({
        name: criterion.name,
        expected: criterion.threshold,
        actual,
        passed,
      });

      if (!passed && criterion.isHardRequirement) {
        allPassed = false;
      }
    }

    // 检查是否有手动覆盖
    if (!allPassed && this.overrideEnabled) {
      return {
        passed: true,
        criteria: criteriaResults,
        overrideReason: this.overrideReason,
      };
    }

    return { passed: allPassed, criteria: criteriaResults };
  }

  /**
   * 设置手动覆盖（紧急发布时使用）
   */
  enableOverride(reason: string): void {
    this.overrideEnabled = true;
    this.overrideReason = reason;
    console.warn(`[Gatekeeper] 门禁覆盖已启用: ${reason}`);
  }

  /**
   * 禁用手动覆盖
   */
  disableOverride(): void {
    this.overrideEnabled = false;
    this.overrideReason = '';
  }

  /**
   * 获取门禁状态摘要
   */
  getSummary(): string {
    return this.criteria
      .map(c => `${c.isHardRequirement ? '[硬]' : '[软]'} ${c.name}: 阈值 ${c.threshold}`)
      .join('\n');
  }
}
```

### 15.8.4 GitHub Actions 集成模式

以下是将 Agent 评测集成到 GitHub Actions 的推荐模式：

```typescript
/**
 * GitHub Actions 工作流配置模板
 *
 * 文件: .github/workflows/agent-eval.yml
 */
const githubActionsTemplate = `
name: Agent Evaluation

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  eval:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run Agent Evaluation
        env:
          OPENAI_API_KEY: \${{ secrets.OPENAI_API_KEY }}
          EVAL_BASELINE_REF: \${{ github.base_ref || 'main' }}
        run: npx tsx scripts/run-eval.ts

      - name: Upload Eval Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: eval-report
          path: eval-results/

      - name: Comment PR with Results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = fs.readFileSync('eval-results/summary.md', 'utf-8');
            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: report
            });
`;

/**
 * CI 评测入口脚本示例
 *
 * 文件: scripts/run-eval.ts
 */
const ciEntryScript = `
import { CIEvalRunner } from './eval/ci-runner';
import { EvalGatekeeper } from './eval/gatekeeper';
import { loadTestSuites } from './eval/suites';

async function main() {
  const suites = await loadTestSuites();
  const gatekeeper = process.env.EVAL_STRICT === 'true'
    ? EvalGatekeeper.createStrict()
    : EvalGatekeeper.createDefault();

  const runner = new CIEvalRunner({
    suites: suites.map(s => ({ ...s, gatekeeper })),
    baselineRef: process.env.EVAL_BASELINE_REF || 'main',
    blockDeployment: true,
    timeoutMinutes: 20,
    reportFormat: 'markdown',
    notificationChannels: [],
    parallelism: 4,
  });

  const report = await runner.run({
    commitSha: process.env.GITHUB_SHA || 'unknown',
    branch: process.env.GITHUB_REF || 'unknown',
    pullRequestId: process.env.GITHUB_PR_NUMBER,
    triggeredBy: process.env.GITHUB_ACTOR || 'ci',
    environment: process.env as Record<string, string>,
  });

  // 写入报告
  const fs = await import('fs/promises');
  await fs.mkdir('eval-results', { recursive: true });
  await fs.writeFile('eval-results/summary.md', report.summary);
  await fs.writeFile('eval-results/full-report.json', JSON.stringify(report, null, 2));

  // 设置退出码
  if (!report.overallPassed) {
    console.error('评测未通过！');
    process.exit(1);
  }

  console.log('评测通过 ✓');
}

main().catch(err => {
  console.error('评测执行失败:', err);
  process.exit(1);
});
`;
```



---

## 15.9 评测数据管理

### 15.9.1 测试用例生命周期

评测数据是 Agent 评测体系中最宝贵的资产之一。随着项目的演进，测试用例需要经历完整的生命周期管理：

```
创建 → 审核 → 激活 → 使用 → 退役/更新
```

每个阶段都有特定的质量要求和流程规范。本节将构建一个完整的评测数据管理系统。

### 15.9.2 评测数据集管理器

```typescript
// ============================================================
// 15.9 EvalDatasetManager —— 评测数据集管理器
// ============================================================

/**
 * 测试用例
 */
interface TestCase {
  id: string;
  version: number;
  input: string;
  expectedOutput?: string;
  metadata: TestCaseMetadata;
  status: TestCaseStatus;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  category: string;
  subCategory?: string;
  history: TestCaseHistoryEntry[];
}

interface TestCaseMetadata {
  source: 'manual' | 'production' | 'generated' | 'augmented';
  expectedTools?: string[];
  expectedSteps?: number;
  isGoldStandard: boolean;
  notes?: string;
  qualityScore?: number;
  usageCount: number;
  lastUsedAt?: Date;
}

enum TestCaseStatus {
  DRAFT = 'draft',
  REVIEW = 'review',
  ACTIVE = 'active',
  DEPRECATED = 'deprecated',
  ARCHIVED = 'archived',
}

interface TestCaseHistoryEntry {
  version: number;
  changedBy: string;
  changedAt: Date;
  changeType: 'created' | 'updated' | 'status_change' | 'tagged';
  description: string;
  previousValue?: unknown;
}

/**
 * 数据集
 */
interface EvalDataset {
  id: string;
  name: string;
  description: string;
  version: string;
  testCaseIds: string[];
  createdAt: Date;
  tags: string[];
  statistics: DatasetStatistics;
}

interface DatasetStatistics {
  totalCases: number;
  byDifficulty: Record<string, number>;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  avgQualityScore: number;
}

/**
 * 分层采样配置
 */
interface StratifiedSamplingConfig {
  /** 总采样数 */
  totalSize: number;
  /** 分层维度 */
  stratifyBy: 'difficulty' | 'category' | 'tags';
  /** 各层比例（可选，默认均匀） */
  proportions?: Record<string, number>;
  /** 最小每层数量 */
  minPerStratum: number;
  /** 随机种子 */
  seed?: number;
}

class EvalDatasetManager {
  private testCases: Map<string, TestCase> = new Map();
  private datasets: Map<string, EvalDataset> = new Map();

  // ─────────────────── 测试用例 CRUD ───────────────────

  /**
   * 创建测试用例
   */
  createTestCase(
    input: string,
    options: {
      expectedOutput?: string;
      tags?: string[];
      difficulty?: TestCase['difficulty'];
      category: string;
      subCategory?: string;
      source?: TestCaseMetadata['source'];
      createdBy: string;
      expectedTools?: string[];
    }
  ): TestCase {
    const id = `tc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date();

    const testCase: TestCase = {
      id,
      version: 1,
      input,
      expectedOutput: options.expectedOutput,
      metadata: {
        source: options.source ?? 'manual',
        expectedTools: options.expectedTools,
        isGoldStandard: false,
        usageCount: 0,
      },
      status: TestCaseStatus.DRAFT,
      createdAt: now,
      updatedAt: now,
      createdBy: options.createdBy,
      tags: options.tags ?? [],
      difficulty: options.difficulty ?? 'medium',
      category: options.category,
      subCategory: options.subCategory,
      history: [{
        version: 1,
        changedBy: options.createdBy,
        changedAt: now,
        changeType: 'created',
        description: '创建测试用例',
      }],
    };

    this.testCases.set(id, testCase);
    return testCase;
  }

  /**
   * 更新测试用例
   */
  updateTestCase(
    id: string,
    updates: Partial<Pick<TestCase, 'input' | 'expectedOutput' | 'tags' | 'difficulty' | 'category'>>,
    updatedBy: string
  ): TestCase | null {
    const tc = this.testCases.get(id);
    if (!tc) return null;

    const previousVersion = { ...tc };
    tc.version++;
    tc.updatedAt = new Date();

    if (updates.input !== undefined) tc.input = updates.input;
    if (updates.expectedOutput !== undefined) tc.expectedOutput = updates.expectedOutput;
    if (updates.tags !== undefined) tc.tags = updates.tags;
    if (updates.difficulty !== undefined) tc.difficulty = updates.difficulty;
    if (updates.category !== undefined) tc.category = updates.category;

    tc.history.push({
      version: tc.version,
      changedBy: updatedBy,
      changedAt: new Date(),
      changeType: 'updated',
      description: `更新字段: ${Object.keys(updates).join(', ')}`,
      previousValue: { input: previousVersion.input, expectedOutput: previousVersion.expectedOutput },
    });

    return tc;
  }

  /**
   * 变更测试用例状态
   */
  changeStatus(id: string, newStatus: TestCaseStatus, changedBy: string, reason?: string): boolean {
    const tc = this.testCases.get(id);
    if (!tc) return false;

    // 状态转换规则
    const validTransitions: Record<TestCaseStatus, TestCaseStatus[]> = {
      [TestCaseStatus.DRAFT]: [TestCaseStatus.REVIEW, TestCaseStatus.ARCHIVED],
      [TestCaseStatus.REVIEW]: [TestCaseStatus.ACTIVE, TestCaseStatus.DRAFT],
      [TestCaseStatus.ACTIVE]: [TestCaseStatus.DEPRECATED, TestCaseStatus.REVIEW],
      [TestCaseStatus.DEPRECATED]: [TestCaseStatus.ARCHIVED, TestCaseStatus.ACTIVE],
      [TestCaseStatus.ARCHIVED]: [TestCaseStatus.DRAFT],
    };

    if (!validTransitions[tc.status]?.includes(newStatus)) {
      return false;
    }

    const previousStatus = tc.status;
    tc.status = newStatus;
    tc.updatedAt = new Date();

    tc.history.push({
      version: tc.version,
      changedBy,
      changedAt: new Date(),
      changeType: 'status_change',
      description: `状态变更: ${previousStatus} → ${newStatus}${reason ? ` (${reason})` : ''}`,
      previousValue: previousStatus,
    });

    return true;
  }

  // ─────────────────── 数据集管理 ───────────────────

  /**
   * 创建数据集
   */
  createDataset(
    name: string,
    description: string,
    testCaseIds: string[],
    tags?: string[]
  ): EvalDataset {
    const id = `ds_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // 验证测试用例存在且为激活状态
    const validIds = testCaseIds.filter(tcId => {
      const tc = this.testCases.get(tcId);
      return tc && tc.status === TestCaseStatus.ACTIVE;
    });

    const dataset: EvalDataset = {
      id,
      name,
      description,
      version: '1.0.0',
      testCaseIds: validIds,
      createdAt: new Date(),
      tags: tags ?? [],
      statistics: this.computeStatistics(validIds),
    };

    this.datasets.set(id, dataset);
    return dataset;
  }

  /**
   * 分层采样
   *
   * 从数据集中按指定维度进行分层采样，确保各类别的代表性
   */
  stratifiedSample(
    datasetId: string,
    config: StratifiedSamplingConfig
  ): TestCase[] {
    const dataset = this.datasets.get(datasetId);
    if (!dataset) throw new Error(`Dataset "${datasetId}" not found`);

    const testCases = dataset.testCaseIds
      .map(id => this.testCases.get(id))
      .filter((tc): tc is TestCase => tc !== null && tc !== undefined);

    // 分层
    const strata = new Map<string, TestCase[]>();

    for (const tc of testCases) {
      let stratumKey: string;

      switch (config.stratifyBy) {
        case 'difficulty':
          stratumKey = tc.difficulty;
          break;
        case 'category':
          stratumKey = tc.category;
          break;
        case 'tags':
          stratumKey = tc.tags.sort().join(',') || 'untagged';
          break;
        default:
          stratumKey = 'default';
      }

      if (!strata.has(stratumKey)) {
        strata.set(stratumKey, []);
      }
      strata.get(stratumKey)!.push(tc);
    }

    // 计算各层采样数
    const result: TestCase[] = [];
    const rng = this.createSeededRandom(config.seed ?? Date.now());

    if (config.proportions) {
      // 按指定比例采样
      for (const [stratum, cases] of strata) {
        const proportion = config.proportions[stratum] ?? 0;
        const sampleSize = Math.max(
          config.minPerStratum,
          Math.round(config.totalSize * proportion)
        );
        const sampled = this.shuffleAndTake(cases, sampleSize, rng);
        result.push(...sampled);
      }
    } else {
      // 按各层等比例采样
      const perStratum = Math.max(
        config.minPerStratum,
        Math.floor(config.totalSize / strata.size)
      );

      for (const [, cases] of strata) {
        const sampled = this.shuffleAndTake(cases, perStratum, rng);
        result.push(...sampled);
      }
    }

    // 如果总数不够，从剩余中补充
    if (result.length < config.totalSize) {
      const usedIds = new Set(result.map(tc => tc.id));
      const remaining = testCases.filter(tc => !usedIds.has(tc.id));
      const extra = this.shuffleAndTake(
        remaining,
        config.totalSize - result.length,
        rng
      );
      result.push(...extra);
    }

    return result.slice(0, config.totalSize);
  }

  // ─────────────────── 统计与查询 ───────────────────

  /**
   * 计算数据集统计信息
   */
  private computeStatistics(testCaseIds: string[]): DatasetStatistics {
    const testCases = testCaseIds
      .map(id => this.testCases.get(id))
      .filter((tc): tc is TestCase => tc !== null && tc !== undefined);

    const byDifficulty: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let totalQuality = 0;
    let qualityCount = 0;

    for (const tc of testCases) {
      byDifficulty[tc.difficulty] = (byDifficulty[tc.difficulty] ?? 0) + 1;
      byCategory[tc.category] = (byCategory[tc.category] ?? 0) + 1;
      byStatus[tc.status] = (byStatus[tc.status] ?? 0) + 1;

      if (tc.metadata.qualityScore !== undefined) {
        totalQuality += tc.metadata.qualityScore;
        qualityCount++;
      }
    }

    return {
      totalCases: testCases.length,
      byDifficulty,
      byCategory,
      byStatus,
      avgQualityScore: qualityCount > 0 ? totalQuality / qualityCount : 0,
    };
  }

  /**
   * 按条件查询测试用例
   */
  queryTestCases(query: {
    status?: TestCaseStatus;
    category?: string;
    difficulty?: TestCase['difficulty'];
    tags?: string[];
    source?: TestCaseMetadata['source'];
    minQualityScore?: number;
  }): TestCase[] {
    let results = Array.from(this.testCases.values());

    if (query.status) {
      results = results.filter(tc => tc.status === query.status);
    }
    if (query.category) {
      results = results.filter(tc => tc.category === query.category);
    }
    if (query.difficulty) {
      results = results.filter(tc => tc.difficulty === query.difficulty);
    }
    if (query.tags && query.tags.length > 0) {
      results = results.filter(tc =>
        query.tags!.every(tag => tc.tags.includes(tag))
      );
    }
    if (query.source) {
      results = results.filter(tc => tc.metadata.source === query.source);
    }
    if (query.minQualityScore !== undefined) {
      results = results.filter(
        tc => (tc.metadata.qualityScore ?? 0) >= query.minQualityScore!
      );
    }

    return results;
  }

  // ─────────────────── 辅助方法 ───────────────────

  private shuffleAndTake<T>(array: T[], n: number, rng: () => number): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, n);
  }

  private createSeededRandom(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  /**
   * 获取所有数据集
   */
  getAllDatasets(): EvalDataset[] {
    return Array.from(this.datasets.values());
  }

  /**
   * 获取单个测试用例
   */
  getTestCase(id: string): TestCase | undefined {
    return this.testCases.get(id);
  }
}
```

### 15.9.3 从生产日志生成测试用例

最有价值的测试用例往往来自生产环境的真实交互。`TestCaseGenerator` 从生产日志中自动提取、清洗、生成测试用例：

```typescript
// ============================================================
// 15.9 TestCaseGenerator —— 测试用例生成器
// ============================================================

/**
 * 生产日志条目
 */
interface ProductionTrace {
  traceId: string;
  userId: string;
  sessionId: string;
  input: string;
  output: string;
  toolCalls: ToolCallRecord[];
  timing: TimingInfo;
  feedback?: UserFeedback;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

interface UserFeedback {
  rating: number;       // 1-5
  comment?: string;
  resolved: boolean;
}

/**
 * 生成配置
 */
interface GenerationConfig {
  /** 最小用户反馈评分（只选取高评分的作为正例） */
  minPositiveRating: number;
  /** 最大用户反馈评分（只选取低评分的作为负例） */
  maxNegativeRating: number;
  /** 自动去重的相似度阈值 */
  deduplicationThreshold: number;
  /** PII 清洗规则 */
  piiPatterns: RegExp[];
  /** 最大生成数量 */
  maxGeneratedCases: number;
  /** 是否生成数据增强变体 */
  enableAugmentation: boolean;
  /** 增强变体数量 */
  augmentationCount: number;
}

/**
 * 数据增强策略
 */
type AugmentationStrategy = 'paraphrase' | 'simplify' | 'complicate' | 'add-context' | 'edge-case';

class TestCaseGenerator {
  private config: GenerationConfig;
  private datasetManager: EvalDatasetManager;
  private llmProvider?: LLMProvider;

  constructor(
    datasetManager: EvalDatasetManager,
    config?: Partial<GenerationConfig>,
    llmProvider?: LLMProvider
  ) {
    this.datasetManager = datasetManager;
    this.llmProvider = llmProvider;
    this.config = {
      minPositiveRating: 4,
      maxNegativeRating: 2,
      deduplicationThreshold: 0.85,
      piiPatterns: [
        /\b[\w._%+-]+@[\w.-]+\.[A-Z]{2,}\b/gi,           // Email
        /\b\d{3}[-.]?\d{4}[-.]?\d{4}\b/g,                 // 电话号码
        /\b\d{6}(19|20)\d{2}(0[1-9]|1[0-2])\d{2}\d{3}[\dXx]\b/g, // 身份证
        /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,   // 银行卡
      ],
      maxGeneratedCases: 100,
      enableAugmentation: true,
      augmentationCount: 3,
      ...config,
    };
  }

  /**
   * 从生产日志生成测试用例
   */
  async generateFromTraces(traces: ProductionTrace[]): Promise<TestCase[]> {
    const generated: TestCase[] = [];

    // 步骤 1：筛选候选
    const candidates = this.selectCandidates(traces);
    console.log(`[TestCaseGen] 从 ${traces.length} 条日志中筛选出 ${candidates.length} 个候选`);

    // 步骤 2：PII 清洗
    const sanitized = candidates.map(c => this.sanitize(c));
    console.log(`[TestCaseGen] PII 清洗完成`);

    // 步骤 3：去重
    const deduplicated = this.deduplicate(sanitized);
    console.log(`[TestCaseGen] 去重后剩余 ${deduplicated.length} 个`);

    // 步骤 4：生成测试用例
    for (const trace of deduplicated.slice(0, this.config.maxGeneratedCases)) {
      const category = this.categorizeTrace(trace);
      const difficulty = this.assessDifficulty(trace);

      const testCase = this.datasetManager.createTestCase(
        trace.input,
        {
          expectedOutput: trace.feedback?.rating && trace.feedback.rating >= this.config.minPositiveRating
            ? trace.output
            : undefined,
          tags: this.extractTags(trace),
          difficulty,
          category,
          source: 'production',
          createdBy: 'auto-generator',
          expectedTools: trace.toolCalls.map(tc => tc.toolName),
        }
      );

      generated.push(testCase);
    }

    // 步骤 5：数据增强
    if (this.config.enableAugmentation && this.llmProvider) {
      const augmented = await this.augmentTestCases(generated);
      generated.push(...augmented);
      console.log(`[TestCaseGen] 增强生成 ${augmented.length} 个变体`);
    }

    console.log(`[TestCaseGen] 共生成 ${generated.length} 个测试用例`);
    return generated;
  }

  /**
   * 筛选候选（基于反馈质量）
   */
  private selectCandidates(traces: ProductionTrace[]): ProductionTrace[] {
    return traces.filter(trace => {
      // 排除空输入/输出
      if (!trace.input.trim() || !trace.output.trim()) return false;

      // 排除极短交互（可能是测试或误操作）
      if (trace.input.length < 10) return false;

      // 优先选择有用户反馈的
      if (trace.feedback) {
        return trace.feedback.rating >= this.config.minPositiveRating ||
               trace.feedback.rating <= this.config.maxNegativeRating;
      }

      // 没有反馈的，选择有工具调用的（可以验证工具选择）
      return trace.toolCalls.length > 0;
    });
  }

  /**
   * PII 清洗
   */
  private sanitize(trace: ProductionTrace): ProductionTrace {
    let input = trace.input;
    let output = trace.output;

    for (const pattern of this.config.piiPatterns) {
      input = input.replace(pattern, '[REDACTED]');
      output = output.replace(pattern, '[REDACTED]');
    }

    return {
      ...trace,
      input,
      output,
      userId: '[REDACTED]',
    };
  }

  /**
   * 基于内容相似度去重
   */
  private deduplicate(traces: ProductionTrace[]): ProductionTrace[] {
    const unique: ProductionTrace[] = [];

    for (const trace of traces) {
      const isDuplicate = unique.some(existing => {
        const similarity = this.computeTextSimilarity(existing.input, trace.input);
        return similarity > this.config.deduplicationThreshold;
      });

      if (!isDuplicate) {
        unique.push(trace);
      }
    }

    return unique;
  }

  /**
   * 自动分类
   */
  private categorizeTrace(trace: ProductionTrace): string {
    const toolNames = trace.toolCalls.map(tc => tc.toolName);

    if (toolNames.includes('search') || toolNames.includes('web_search')) {
      return '信息检索';
    }
    if (toolNames.includes('calculator') || toolNames.includes('code_execute')) {
      return '计算分析';
    }
    if (toolNames.includes('file_write') || toolNames.includes('file_read')) {
      return '文件操作';
    }
    if (toolNames.length === 0) {
      return '纯对话';
    }
    return '综合任务';
  }

  /**
   * 评估难度
   */
  private assessDifficulty(trace: ProductionTrace): TestCase['difficulty'] {
    const toolCallCount = trace.toolCalls.length;
    const inputLength = trace.input.length;

    if (toolCallCount === 0 && inputLength < 100) return 'easy';
    if (toolCallCount <= 2 && inputLength < 300) return 'medium';
    if (toolCallCount <= 5) return 'hard';
    return 'expert';
  }

  /**
   * 提取标签
   */
  private extractTags(trace: ProductionTrace): string[] {
    const tags: string[] = [];

    // 基于工具调用
    const toolNames = new Set(trace.toolCalls.map(tc => tc.toolName));
    for (const tool of toolNames) {
      tags.push(`tool:${tool}`);
    }

    // 基于反馈
    if (trace.feedback) {
      tags.push(trace.feedback.rating >= 4 ? 'positive' : 'negative');
      if (trace.feedback.resolved) tags.push('resolved');
    }

    // 基于复杂度
    if (trace.toolCalls.length > 3) tags.push('complex');
    if (trace.toolCalls.some(tc => !tc.success)) tags.push('has-errors');

    return tags;
  }

  /**
   * 数据增强：通过 LLM 生成测试用例变体
   */
  private async augmentTestCases(testCases: TestCase[]): Promise<TestCase[]> {
    if (!this.llmProvider) return [];

    const augmented: TestCase[] = [];
    const strategies: AugmentationStrategy[] = [
      'paraphrase',
      'simplify',
      'complicate',
      'edge-case',
    ];

    for (const tc of testCases.slice(0, 20)) { // 限制增强数量
      for (const strategy of strategies.slice(0, this.config.augmentationCount)) {
        try {
          const variant = await this.generateVariant(tc, strategy);
          if (variant) {
            augmented.push(variant);
          }
        } catch (error) {
          console.warn(`增强失败 (${strategy}):`, error);
        }
      }
    }

    return augmented;
  }

  /**
   * 生成单个变体
   */
  private async generateVariant(
    original: TestCase,
    strategy: AugmentationStrategy
  ): Promise<TestCase | null> {
    if (!this.llmProvider) return null;

    const strategyPrompts: Record<AugmentationStrategy, string> = {
      'paraphrase': '用不同的表述方式改写以下用户输入，保持语义不变：',
      'simplify': '将以下用户输入简化，使其更简洁但保持核心意图：',
      'complicate': '将以下用户输入变得更复杂，增加额外的约束条件或上下文：',
      'add-context': '为以下用户输入添加更多背景上下文信息：',
      'edge-case': '基于以下用户输入，生成一个相关的边缘场景或异常情况：',
    };

    const prompt = `${strategyPrompts[strategy]}\n\n原始输入：${original.input}\n\n请只输出改写后的用户输入，不要其他说明。`;

    const response = await this.llmProvider.complete(prompt, {
      temperature: 0.7,
      maxTokens: 500,
    });

    if (!response.trim()) return null;

    return this.datasetManager.createTestCase(
      response.trim(),
      {
        expectedOutput: original.expectedOutput,
        tags: [...original.tags, `augmented:${strategy}`],
        difficulty: original.difficulty,
        category: original.category,
        source: 'augmented',
        createdBy: 'auto-augmenter',
        expectedTools: original.metadata.expectedTools,
      }
    );
  }

  /**
   * 简单文本相似度（基于 n-gram Jaccard）
   */
  private computeTextSimilarity(textA: string, textB: string): number {
    const ngramsA = this.getNgrams(textA, 3);
    const ngramsB = this.getNgrams(textB, 3);

    const setA = new Set(ngramsA);
    const setB = new Set(ngramsB);
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    return union.size > 0 ? intersection.size / union.size : 1;
  }

  private getNgrams(text: string, n: number): string[] {
    const ngrams: string[] = [];
    for (let i = 0; i <= text.length - n; i++) {
      ngrams.push(text.substring(i, i + n));
    }
    return ngrams;
  }
}
```

> **数据治理要点**：从生产日志生成测试用例时，**PII 清洗是不可跳过的步骤**。即使是内部评测，也应该避免在测试数据中包含用户的个人信息。上述 `sanitize` 方法提供了基础的 PII 检测模式，但在实际项目中应根据具体合规要求进行扩展。

---

## 15.10 评估平台生态与选型

前面九节构建了评估体系的方法论和工程实现，但在实际落地时，团队往往面临一个关键决策：**自建还是采用现有平台？** 本节梳理当前主流评估工具平台的生态格局，提供系统化的选型框架。

### 15.10.1 主流平台对比

下表汇总了 2025-2026 年最活跃的四个评估平台：

| 平台 | 类型 | 核心特性 | 开源 | 定价模式 | 最佳场景 |
|------|------|----------|------|----------|----------|
| Braintrust | CI/CD 评估 | 实验追踪, 对比分析, 持续评估, 数据集管理 | 否 | SaaS | 需要 CI/CD 集成的团队 |
| Langfuse | 可观测性+评估 | OTel 集成, Trace 分析, 在线评估, Prompt 管理 | 是（MIT） | 自托管/Cloud | 全栈可观测+评估 |
| promptfoo | CLI 红队测试 | 命令行工具, 红队评估, 安全测试, 回归测试 | 是（MIT） | 免费 | 安全测试和提示工程 |
| Arize Phoenix | 追踪+评估 | OTel 原生, Span 级评估, 检索评估, ~8.8K Stars | 是（Apache 2.0） | 自托管/Cloud | 生产追踪+离线评估 |

**Braintrust** 采用 SaaS 架构，核心优势在于与 CI/CD 流水线的深度集成。它提供实验追踪（Experiment Tracking）和版本对比分析功能，能够在每次代码提交后自动运行评估并生成对比报告。其数据集管理模块支持测试用例的版本化和协作编辑，非常适合需要在持续交付流程中嵌入评估门禁的工程团队。集成方式以 SDK 和 GitHub Actions 为主，开箱即用的 CI/CD 模板大幅降低了接入成本。

**Langfuse** 是目前社区最活跃的开源评估+可观测性平台，采用 MIT 许可证。其架构基于 OpenTelemetry（OTel）标准，将 Trace 分析、在线评估和 Prompt 管理统一在同一平台中，实现了从开发到生产的全链路覆盖。关键差异化在于它同时覆盖了评估和可观测性两个领域——这与本书第 17 章（可观测性工程）的理念高度一致。支持自托管部署和 Cloud 版本，通过 Python/JS SDK 或 OpenAI 兼容接口即可接入。

**promptfoo** 是一个轻量级的命令行评估工具，专注于 Prompt 工程和安全红队测试。它的核心理念是"评估即代码"——通过 YAML 配置文件定义评估场景，在终端中直接运行。内置的红队评估模块覆盖了 Prompt 注入、越狱攻击、信息泄露等安全场景（与 15.2 节安全合规维度呼应），同时支持回归测试以防止 Prompt 修改导致的性能退化。零依赖、零配置的特性使其成为个人开发者和小团队的首选安全测试工具。

**Arize Phoenix** 由 Arize AI 开源（Apache 2.0 许可证），是 OTel 原生的 Agent 追踪与评估平台。其核心差异化在于 Span 级评估——不仅评估最终输出，还能对 Agent 执行轨迹中的每一个 Span（LLM 调用、工具调用、检索操作）进行独立评分。这与 15.6 节端到端评测中的轨迹评估方法论一脉相承。Phoenix 在检索增强生成（RAG）评估方面尤为突出，内置了 Relevance、Faithfulness 等检索质量指标。通过 `arize-phoenix` Python 包即可启动本地服务，也支持 Cloud 版本。

### 15.10.2 选型决策框架

选择评估平台不应追求"最好的"，而应追求"最匹配的"。以下决策树基于团队的核心需求进行导航：

**按核心需求选型：**

- **需要 CI/CD 流水线集成** → Braintrust。其原生的 GitHub/GitLab CI 支持和实验对比功能，能无缝嵌入 15.8 节描述的 CI/CD 评估门禁流程。
- **需要全栈可观测性 + 评估一体化** → Langfuse。当团队同时需要开发期评估和生产期监控时，Langfuse 避免了维护两套系统的成本，与第 17 章的可观测性体系天然互补。
- **需要安全/红队测试** → promptfoo。如果核心诉求是 Prompt 安全性验证和回归测试，promptfoo 的 CLI 工作流最为高效，无需部署任何服务。
- **需要生产追踪与离线评估结合** → Arize Phoenix。当团队需要从生产 Trace 中提取评估数据，或需要 Span 级细粒度评估时，Phoenix 的 OTel 原生架构是最佳选择。
- **需要企业合规与 SLA 保障** → 优先考虑商业方案（Braintrust Cloud 或 Arize Cloud），或基于 Langfuse/Phoenix 的企业自托管部署，确保数据驻留和审计需求。

**组合策略建议：**

实践中，很多团队会组合使用多个工具。例如，使用 **Langfuse** 作为核心评估平台处理日常评测，同时用 **promptfoo** 进行专项安全红队测试——两者的数据可以通过 OTel 标准协议互通。关键原则是：**选择一个平台作为评估数据的 Single Source of Truth**，其他工具作为补充。

> **工程建议**：无论选择哪个平台，都应确保评估数据的可导出性。避免被单一平台锁定（vendor lock-in），优先选择支持 OTel 标准或提供开放 API 的方案。本章前九节构建的评估方法论是平台无关的——平台是工具，方法论才是核心资产。

---

## 15.11 本章小结

本章构建了完整的 Agent 评估工程体系，从方法论到工具链覆盖了 Eval-Driven Development 的全生命周期：

1. **Eval-Driven Development** 将评估前置到开发流程的每一步，形成"评估 → 改进 → 再评估"的飞轮
2. **四维评测框架**（任务完成度、输出质量、执行效率、安全合规）提供了全面的评估视角
3. **工具 Mock 系统**通过确定性重放和场景链，解决了 Agent 评测中的外部依赖问题
4. **LLM-as-Judge** 评估框架支持多评委面板、偏差校准和成对比较，显著提升评测可靠性
5. **生产级评测流水线**支持并行执行、回归检测和统计显著性检验
6. **端到端评测**不仅评估最终答案，还通过轨迹评估（Trajectory Evaluation）衡量推理过程质量
7. **人工评测**通过 Cohen's Kappa 一致性检验确保标注质量，为自动化评测提供校准基准
8. **CI/CD 集成**让评估成为发布流程的质量门禁，自动阻止评分下降的版本部署
9. **评测数据管理**实现了测试集的版本控制、分层抽样和从生产日志自动生成测试用例
10. **评估平台选型**应基于团队核心需求（CI/CD 集成、可观测性、安全测试、生产追踪）进行匹配，优先选择支持 OTel 标准的开放方案
11. 评测体系不是一次性建设，而是随着 Agent 能力演进持续迭代的基础设施

> **下一章预告**：第 16 章将把本章的评测方法论应用到行业标准基准测试中，深入实现 GAIA、SWE-bench、τ-bench 等 Benchmark 的完整运行框架，并介绍如何构建自定义基准测试。

