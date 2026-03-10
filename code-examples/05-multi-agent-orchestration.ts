/**
 * 示例 05: 多 Agent 编排
 * 对应章节: 第9-10章 - Multi-Agent 编排
 *
 * 演示 Coordinator、Pipeline 和 Fan-Out/Gather 模式
 */

// ============================================================
// 基础接口
// ============================================================

interface AgentMessage {
  from: string;
  to: string;
  content: string;
  metadata?: Record<string, any>;
}

interface AgentResult {
  agent: string;
  output: string;
  duration: number;
}

type AgentFunction = (input: string, context?: any) => Promise<string>;

// ============================================================
// 模式 1: Coordinator（协调者）
// ============================================================

class CoordinatorPattern {
  private agents: Map<string, AgentFunction> = new Map();

  register(name: string, fn: AgentFunction): void {
    this.agents.set(name, fn);
  }

  async run(task: string): Promise<string> {
    console.log('[Coordinator] Analyzing task...');

    // 路由决策
    const selectedAgent = this.route(task);
    console.log(`[Coordinator] Routing to: ${selectedAgent}`);

    const agent = this.agents.get(selectedAgent);
    if (!agent) throw new Error(`Agent ${selectedAgent} not found`);

    const result = await agent(task);
    console.log(`[Coordinator] ${selectedAgent} completed`);

    return result;
  }

  private route(task: string): string {
    // 简单的关键词路由（实际中用 LLM）
    if (task.includes('代码') || task.includes('code')) return 'coder';
    if (task.includes('搜索') || task.includes('search')) return 'researcher';
    if (task.includes('写') || task.includes('write')) return 'writer';
    return 'general';
  }
}

// ============================================================
// 模式 2: Pipeline（流水线）
// ============================================================

class PipelinePattern {
  private stages: { name: string; fn: AgentFunction }[] = [];

  addStage(name: string, fn: AgentFunction): PipelinePattern {
    this.stages.push({ name, fn });
    return this;
  }

  async run(input: string): Promise<string> {
    let current = input;

    for (const stage of this.stages) {
      console.log(`[Pipeline] Stage: ${stage.name}`);
      const start = Date.now();
      current = await stage.fn(current);
      console.log(`[Pipeline] ${stage.name} completed in ${Date.now() - start}ms`);
    }

    return current;
  }
}

// ============================================================
// 模式 3: Fan-Out / Gather
// ============================================================

class FanOutGatherPattern {
  async run(
    task: string,
    workers: { name: string; fn: AgentFunction }[],
    aggregator: (results: AgentResult[]) => Promise<string>
  ): Promise<string> {
    console.log(`[FanOut] Dispatching to ${workers.length} workers...`);

    // 并行执行所有 worker
    const results = await Promise.all(
      workers.map(async worker => {
        const start = Date.now();
        console.log(`[FanOut] ${worker.name} starting...`);
        const output = await worker.fn(task);
        const duration = Date.now() - start;
        console.log(`[FanOut] ${worker.name} completed in ${duration}ms`);
        return { agent: worker.name, output, duration };
      })
    );

    // 聚合结果
    console.log('[Gather] Aggregating results...');
    return aggregator(results);
  }
}

// ============================================================
// 模拟 Agent 函数
// ============================================================

const mockAgents = {
  researcher: async (input: string): Promise<string> => {
    await sleep(100); // 模拟 API 调用
    return `[Research] Found 3 relevant sources about: ${input.slice(0, 50)}`;
  },

  writer: async (input: string): Promise<string> => {
    await sleep(150);
    return `[Draft] Based on the input, here is a well-structured article about ${input.slice(0, 30)}...`;
  },

  reviewer: async (input: string): Promise<string> => {
    await sleep(80);
    return `[Review] The content is well-written. Suggestions: add more examples, fix minor grammar.`;
  },

  coder: async (input: string): Promise<string> => {
    await sleep(120);
    return `[Code] Implementation: function solve() { /* solution */ }`;
  },

  general: async (input: string): Promise<string> => {
    await sleep(50);
    return `[General] Here is my response to: ${input.slice(0, 50)}`;
  },

  factChecker: async (input: string): Promise<string> => {
    await sleep(90);
    return `[FactCheck] Verified: 2 claims confirmed, 0 disputed.`;
  }
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// 演示
// ============================================================

async function main() {
  console.log('=== Multi-Agent Orchestration Demo ===\n');

  // 1. Coordinator 模式
  console.log('--- Pattern 1: Coordinator ---');
  const coordinator = new CoordinatorPattern();
  coordinator.register('coder', mockAgents.coder);
  coordinator.register('researcher', mockAgents.researcher);
  coordinator.register('writer', mockAgents.writer);
  coordinator.register('general', mockAgents.general);

  const r1 = await coordinator.run('帮我写一段代码实现排序算法');
  console.log(`Result: ${r1}\n`);

  // 2. Pipeline 模式
  console.log('--- Pattern 2: Pipeline ---');
  const pipeline = new PipelinePattern()
    .addStage('research', mockAgents.researcher)
    .addStage('write', mockAgents.writer)
    .addStage('review', mockAgents.reviewer);

  const r2 = await pipeline.run('AI Agent 的发展趋势');
  console.log(`Result: ${r2}\n`);

  // 3. Fan-Out / Gather 模式
  console.log('--- Pattern 3: Fan-Out / Gather ---');
  const fanout = new FanOutGatherPattern();
  const r3 = await fanout.run(
    'AI Agent 安全性分析',
    [
      { name: 'researcher', fn: mockAgents.researcher },
      { name: 'factChecker', fn: mockAgents.factChecker },
      { name: 'coder', fn: mockAgents.coder }
    ],
    async (results) => {
      const combined = results.map(r => `${r.agent}: ${r.output}`).join('\n');
      return `[Aggregated]\n${combined}\n\nTotal time: ${Math.max(...results.map(r => r.duration))}ms (parallel)`;
    }
  );
  console.log(`Result:\n${r3}\n`);
}

main().catch(console.error);
