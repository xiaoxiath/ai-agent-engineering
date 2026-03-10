# 第十六章：Benchmark — 行业标准评测

> "Benchmark 是 Agent 能力的标尺，帮助我们客观衡量进步。"

---

## 16.1 主流 Benchmark 概览

| Benchmark | 评测维度 | 数据规模 | 发布年份 |
|-----------|---------|---------|---------|
| GAIA | 通用 AI 助手 | 466 题 | 2023 |
| SWE-bench | 代码修复 | 2,294 题 | 2023 |
| AgentBench | 多环境 Agent | 8 环境 | 2023 |
| BrowseComp | 网页浏览检索 | 1,266 题 | 2025 |
| WebArena | 真实网站交互 | 812 任务 | 2023 |
| τ-bench | 工具使用 Agent | 多场景 | 2024 |

---

## 16.2 GAIA Runner

```typescript
class GAIARunner {
  async runBenchmark(agent: any, dataset: GAIAQuestion[]): Promise<GAIAResult> {
    const results = { level1: { correct: 0, total: 0 }, level2: { correct: 0, total: 0 }, level3: { correct: 0, total: 0 } };

    for (const question of dataset) {
      const answer = await agent.run(question.text);
      const isCorrect = this.exactMatch(answer, question.expectedAnswer);
      const level = `level${question.level}` as keyof typeof results;
      results[level].total++;
      if (isCorrect) results[level].correct++;
    }

    return {
      overall: (results.level1.correct + results.level2.correct + results.level3.correct) /
               (results.level1.total + results.level2.total + results.level3.total),
      perLevel: {
        level1: results.level1.correct / (results.level1.total || 1),
        level2: results.level2.correct / (results.level2.total || 1),
        level3: results.level3.correct / (results.level3.total || 1),
      },
    };
  }

  private exactMatch(predicted: string, expected: string): boolean {
    return predicted.trim().toLowerCase() === expected.trim().toLowerCase();
  }
}

interface GAIAQuestion { text: string; level: 1|2|3; expectedAnswer: string; }
interface GAIAResult { overall: number; perLevel: Record<string, number>; }
```

---

## 16.3 SWE-bench Runner

```typescript
class SWEBenchRunner {
  async evaluate(agent: any, instances: SWEInstance[]): Promise<{
    resolved: number; total: number; resolveRate: number;
  }> {
    let resolved = 0;
    for (const instance of instances) {
      // 1. Agent 生成 patch
      const patch = await agent.run(
        `修复以下 GitHub Issue:\n${instance.issueDescription}\n\n代码库: ${instance.repo}`
      );

      // 2. 应用 patch 并运行测试
      const testResult = await this.applyAndTest(patch, instance);
      if (testResult.allPassed) resolved++;
    }

    return { resolved, total: instances.length, resolveRate: resolved / instances.length };
  }

  private async applyAndTest(patch: string, instance: SWEInstance): Promise<{ allPassed: boolean }> {
    return { allPassed: false };
  }
}

interface SWEInstance { repo: string; issueDescription: string; testCommand: string; }
```

---

## 16.4 综合评测套件

```typescript
class BenchmarkSuite {
  async runAll(agent: any): Promise<Record<string, number>> {
    const results: Record<string, number> = {};
    const benchmarks = [
      { name: 'gaia', runner: new GAIARunner() },
      { name: 'swe-bench', runner: new SWEBenchRunner() },
    ];

    for (const bm of benchmarks) {
      console.log(`Running ${bm.name}...`);
      // 简化：实际需要加载对应数据集
      results[bm.name] = 0;
    }

    return results;
  }
}
```

---

## 16.5 本章小结

1. **GAIA** 评测通用 Agent 能力，分三个难度级别
2. **SWE-bench** 是编码 Agent 的黄金标准
3. **WebArena** 评测真实 Web 交互能力
4. 组合多个 Benchmark 进行综合评估
5. 关注失败案例分析比追求最高分更有价值
