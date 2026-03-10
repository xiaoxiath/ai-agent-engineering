# 第十五章：评测体系 — Eval-Driven Development

> "如果你不能评测它，你就不能改进它。"

---

## 15.1 为什么 Agent 评测如此困难

Agent 评测的独特挑战：
- **非确定性**：相同输入可能产生不同输出
- **多步依赖**：后续步骤的正确性依赖前序步骤
- **工具交互**：需要模拟或沙箱化外部工具
- **主观质量**：输出质量难以用简单指标衡量

---

## 15.2 工具 Mock 系统

```typescript
class ToolMockSystem {
  private mocks = new Map<string, (args: unknown) => unknown>();

  // 注册工具 mock
  mock(toolName: string, handler: (args: unknown) => unknown): void {
    this.mocks.set(toolName, handler);
  }

  // 基于场景的 mock
  mockWithScenarios(toolName: string, scenarios: Array<{
    when: (args: unknown) => boolean;
    then: unknown;
  }>): void {
    this.mocks.set(toolName, (args) => {
      for (const scenario of scenarios) {
        if (scenario.when(args)) return scenario.then;
      }
      return { error: 'No matching scenario' };
    });
  }

  execute(toolName: string, args: unknown): unknown {
    const mock = this.mocks.get(toolName);
    if (!mock) throw new Error(`No mock for tool: ${toolName}`);
    return mock(args);
  }
}

// 使用示例
const mocks = new ToolMockSystem();
mocks.mockWithScenarios('database_user_query', [
  {
    when: (args: any) => args.user_id === 'USR-001',
    then: { name: '张三', email: 'zhang@example.com', orders: 5 },
  },
  {
    when: (args: any) => args.user_id === 'USR-999',
    then: { error: '用户不存在' },
  },
]);
```

---

## 15.3 LLM-as-Judge

```typescript
class LLMJudge {
  async evaluate(params: {
    task: string;
    agentOutput: string;
    criteria: string[];
    referenceAnswer?: string;
  }): Promise<{
    scores: Record<string, number>;
    overallScore: number;
    reasoning: string;
  }> {
    const prompt = `你是一个严格的评测专家。请评估 AI Agent 的输出质量。

## 任务
${params.task}

## Agent 输出
${params.agentOutput}

${params.referenceAnswer ? `## 参考答案\n${params.referenceAnswer}` : ''}

## 评估维度
${params.criteria.map(c => `- ${c}`).join('\n')}

请对每个维度打分（1-10），并给出总体评分和详细推理。
返回 JSON: { "scores": {...}, "overallScore": number, "reasoning": "..." }`;

    const response = await llm.chat({
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    return JSON.parse(response.content);
  }
}
```

---

## 15.4 评测流水线

```typescript
class EvalPipeline {
  constructor(
    private testCases: TestCase[],
    private agent: any,
    private judge: LLMJudge,
  ) {}

  async run(): Promise<EvalReport> {
    const results: TestResult[] = [];

    for (const tc of this.testCases) {
      const start = Date.now();
      const output = await this.agent.run(tc.input);
      const duration = Date.now() - start;

      const evaluation = await this.judge.evaluate({
        task: tc.input,
        agentOutput: output,
        criteria: ['准确性', '完整性', '相关性'],
        referenceAnswer: tc.expectedOutput,
      });

      results.push({
        testCase: tc,
        output,
        evaluation,
        duration,
      });
    }

    return this.generateReport(results);
  }

  private generateReport(results: TestResult[]): EvalReport {
    const avgScore = results.reduce((s, r) => s + r.evaluation.overallScore, 0) / results.length;
    return {
      totalTests: results.length,
      averageScore: avgScore,
      passRate: results.filter(r => r.evaluation.overallScore >= 7).length / results.length,
      results,
    };
  }
}

interface TestCase { id: string; input: string; expectedOutput?: string; }
interface TestResult { testCase: TestCase; output: string; evaluation: any; duration: number; }
interface EvalReport { totalTests: number; averageScore: number; passRate: number; results: TestResult[]; }
