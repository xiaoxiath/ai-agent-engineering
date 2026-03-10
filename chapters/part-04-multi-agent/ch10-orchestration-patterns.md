# 第十章：编排模式 — 七种经典 Multi-Agent 架构

> "选择正确的编排模式，就像选择正确的数据结构一样重要。"

---

## 10.1 模式总览

| 模式 | 适用场景 | 复杂度 | 通信方式 |
|------|---------|--------|---------|
| Coordinator（协调者） | 通用任务分配 | 中 | 星型 |
| Sequential Pipeline（流水线） | 数据处理链 | 低 | 链式 |
| Fan-Out/Gather（扇出聚合） | 并行搜索/分析 | 中 | 树形 |
| Hierarchical（层级式） | 大型复杂项目 | 高 | 树形 |
| Generator-Critic（生成-批评） | 质量迭代优化 | 中 | 双向 |
| Debate（辩论） | 决策/验证 | 中 | 全连接 |
| Mixture of Agents（混合） | 最优结果融合 | 高 | 分层 |

---

## 10.2 Coordinator（协调者模式）

```typescript
class CoordinatorAgent {
  private specialists = new Map<string, Agent>();

  registerSpecialist(domain: string, agent: Agent): void {
    this.specialists.set(domain, agent);
  }

  async execute(task: string): Promise<string> {
    // 1. 分析任务，决定分配给哪个专家
    const analysis = await this.analyzeTask(task);

    // 2. 分配子任务
    const results: string[] = [];
    for (const subtask of analysis.subtasks) {
      const specialist = this.specialists.get(subtask.domain);
      if (specialist) {
        const result = await specialist.run(subtask.description);
        results.push(result);
      }
    }

    // 3. 汇总结果
    return this.synthesize(task, results);
  }

  private async analyzeTask(task: string): Promise<{ subtasks: Array<{ domain: string; description: string }> }> {
    return { subtasks: [] };
  }
  private async synthesize(task: string, results: string[]): Promise<string> { return results.join('\n'); }
}
```

---

## 10.3 Sequential Pipeline（流水线模式）

```typescript
class PipelineBuilder {
  private stages: Array<{ name: string; agent: Agent }> = [];

  addStage(name: string, agent: Agent): PipelineBuilder {
    this.stages.push({ name, agent });
    return this;
  }

  async execute(input: string): Promise<{ finalResult: string; stageResults: Record<string, string> }> {
    let current = input;
    const stageResults: Record<string, string> = {};

    for (const stage of this.stages) {
      console.log(`[Pipeline] 执行阶段: ${stage.name}`);
      current = await stage.agent.run(current);
      stageResults[stage.name] = current;
    }

    return { finalResult: current, stageResults };
  }
}

// 使用
const pipeline = new PipelineBuilder()
  .addStage('extract', extractAgent)
  .addStage('transform', transformAgent)
  .addStage('validate', validateAgent)
  .addStage('load', loadAgent);
```

---

## 10.4 Fan-Out/Gather（扇出聚合模式）

```typescript
class FanOutGatherAgent {
  constructor(
    private workers: Agent[],
    private aggregator: Agent,
  ) {}

  async execute(task: string): Promise<string> {
    // Fan-Out: 并行分发给所有 worker
    const results = await Promise.all(
      this.workers.map(w => w.run(task))
    );

    // Gather: 聚合结果
    const aggregationPrompt = `以下是多个专家对同一任务的分析结果，请综合得出最佳答案：
${results.map((r, i) => `## 专家 ${i + 1}\n${r}`).join('\n\n')}`;

    return this.aggregator.run(aggregationPrompt);
  }
}
```

---

## 10.5 Generator-Critic（生成-批评模式）

```typescript
class GeneratorCriticLoop {
  constructor(
    private generator: Agent,
    private critic: Agent,
    private maxRounds: number = 3,
    private qualityThreshold: number = 0.8,
  ) {}

  async execute(task: string): Promise<string> {
    let draft = await this.generator.run(task);

    for (let round = 0; round < this.maxRounds; round++) {
      // 批评者评估
      const feedback = await this.critic.run(
        `请评估以下内容的质量并给出改进建议：\n${draft}\n\n返回 JSON: { "score": 0-1, "feedback": "..." }`
      );

      const evaluation = JSON.parse(feedback);
      if (evaluation.score >= this.qualityThreshold) {
        console.log(`质量达标 (${evaluation.score}), 第 ${round + 1} 轮结束`);
        return draft;
      }

      // 生成者根据反馈改进
      draft = await this.generator.run(
        `基于以下反馈改进你的输出：\n反馈: ${evaluation.feedback}\n\n原始输出:\n${draft}`
      );
    }

    return draft;
  }
}
```

---

## 10.6 Debate（辩论模式）

```typescript
class DebateOrchestrator {
  constructor(
    private debaters: Agent[],
    private judge: Agent,
    private rounds: number = 2,
  ) {}

  async execute(question: string): Promise<string> {
    // 各方初始观点
    let positions = await Promise.all(
      this.debaters.map(d => d.run(`请就以下问题给出你的观点：${question}`))
    );

    // 多轮辩论
    for (let round = 0; round < this.rounds; round++) {
      const newPositions: string[] = [];
      for (let i = 0; i < this.debaters.length; i++) {
        const otherPositions = positions.filter((_, j) => j !== i);
        const refined = await this.debaters[i].run(
          `其他专家的观点：\n${otherPositions.join('\n---\n')}\n\n请回应并完善你的观点。`
        );
        newPositions.push(refined);
      }
      positions = newPositions;
    }

    // 裁判裁决
    return this.judge.run(
      `基于以下辩论内容，给出最终结论：\n${positions.map((p, i) => `## 观点 ${i+1}\n${p}`).join('\n')}`
    );
  }
}
```

---

## 10.7 模式选择决策树

```
任务是否可以分解为独立子任务？
├─ 是 → 子任务之间有顺序依赖？
│        ├─ 是 → Sequential Pipeline
│        └─ 否 → Fan-Out/Gather
└─ 否 → 需要多轮迭代改进？
          ├─ 是 → 需要多视角？
          │        ├─ 是 → Debate
          │        └─ 否 → Generator-Critic
          └─ 否 → 任务复杂度高？
                   ├─ 是 → Hierarchical
                   └─ 否 → Coordinator
```

---

## 10.8 本章小结

1. **七种编排模式**覆盖了绝大多数 Multi-Agent 场景
2. **Coordinator** 是最通用的模式，适合入门
3. **Pipeline** 最简单，适合线性数据处理流程
4. **Fan-Out/Gather** 适合需要并行搜索/分析的场景
5. **Generator-Critic** 和 **Debate** 通过对抗提升质量
6. 使用决策树帮助选择合适的模式
