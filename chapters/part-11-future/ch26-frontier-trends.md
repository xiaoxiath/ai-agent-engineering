# 第26章：前沿趋势与未来方向

> "The future is already here — it's just not very evenly distributed." —— William Gibson

## 26.1 推理型 Agent

### 26.1.1 从 Fast Thinking 到 Deep Reasoning

随着 OpenAI o1/o3、DeepSeek-R1 等推理模型的出现，Agent 的推理能力正在发生质变：

```typescript
interface ReasoningAgent {
  // 传统模式：快速反应
  fastThink(input: string): Promise<string>;
  
  // 推理模式：深度思考
  deepReason(input: string, config: ReasoningConfig): Promise<ReasoningResult>;
}

interface ReasoningConfig {
  // 思考预算（token 或时间）
  thinkingBudget: number;
  // 验证策略
  verification: 'none' | 'self_check' | 'formal_verify';
  // 是否展示思考过程
  showThinking: boolean;
}

interface ReasoningResult {
  answer: string;
  thinking: ThinkingStep[];  // 思考链
  confidence: number;
  tokensUsed: { thinking: number; output: number };
}

class AdaptiveReasoningAgent {
  // 根据问题复杂度自适应选择推理深度
  async solve(problem: string): Promise<ReasoningResult> {
    const complexity = await this.assessComplexity(problem);
    
    if (complexity < 0.3) {
      // 简单问题：快速回答
      return this.fastThink(problem);
    } else if (complexity < 0.7) {
      // 中等问题：标准推理
      return this.deepReason(problem, {
        thinkingBudget: 2000,
        verification: 'self_check',
        showThinking: false
      });
    } else {
      // 复杂问题：深度推理
      return this.deepReason(problem, {
        thinkingBudget: 10000,
        verification: 'formal_verify',
        showThinking: true
      });
    }
  }
  
  private async assessComplexity(problem: string): Promise<number> { return 0.5; }
  private async fastThink(problem: string): Promise<ReasoningResult> { return {} as ReasoningResult; }
  private async deepReason(problem: string, config: ReasoningConfig): Promise<ReasoningResult> { return {} as ReasoningResult; }
}
```

### 26.1.2 推理能力的工程化应用

| 场景 | 快速模式 | 推理模式 | 提升幅度 |
|------|---------|---------|---------|
| 代码生成 | 模板匹配 | 架构设计→分步实现 | +40% 正确率 |
| 数据分析 | 直接查询 | 假设→验证→迭代 | +35% 洞察深度 |
| 问题诊断 | 关键词匹配 | 根因分析→方案推演 | +50% 首次解决率 |
| 规划任务 | 线性分解 | 多路径评估→最优选择 | +30% 效率 |

## 26.2 Harness Engineering：Agent 工程的新范式

### 26.2.1 从模型竞赛到系统工程

2025 年，OpenAI 在其 Agent 部署最佳实践中正式提出了 **Harness Engineering**（约束工程）这一概念，其核心论断是：

> **"The new moat is your agent harness, not model quality."**
> ——新的护城河不是模型质量，而是你的 Agent 约束系统。

这一论断的背景是 2025-2026 年间模型能力的快速同质化。当 Claude Opus 4.6、Gemini 3、GLM-5 等模型在推理、编码、长上下文等核心指标上趋于接近（参见 26.5 节），团队很难再通过「选一个更好的模型」来获得持久的竞争优势。真正拉开差距的，是围绕模型构建的**约束系统、反馈回路、文档规范和生命周期管理**——即 Harness。

这与本书第 2 章提出的**「确定性外壳 + 概率性内核」**架构哲学高度一致。如果说那是一个架构原则，那 Harness Engineering 就是将这个原则落地为一套完整工程纪律的方法论。确定性外壳的职责——输入验证、输出校验、状态管理、错误处理、审计日志——正是 Harness 的核心组成部分。

### 26.2.2 Harness 的四大支柱

Harness Engineering 由四个相互支撑的工程支柱构成：

**一、约束设计（Constraint Design）**

约束设计是 Harness 的第一道防线。它不是限制 Agent 的能力，而是为 Agent 的行为划定安全、可预测的边界。正如第 14 章信任架构中讨论的权限控制体系，约束设计将信任原则工程化：

```typescript
interface HarnessConfig {
  constraints: {
    // 输出格式约束：强制 Agent 返回结构化数据
    outputSchema: JSONSchema;
    // 行为边界：Agent 不能执行的操作
    forbiddenActions: string[];
    // 资源限制：单次调用的 token / 时间 / 成本上限
    resourceLimits: {
      maxTokens: number;
      maxLatencyMs: number;
      maxCostUSD: number;
    };
    // 作用域限制：Agent 可访问的数据和工具范围
    scope: {
      allowedTools: string[];
      dataAccessPolicy: DataAccessPolicy;
    };
  };

  validation: {
    // 输入净化
    inputSanitizer: (input: string) => string;
    // 输出验证管线
    outputValidators: OutputValidator[];
    // 幻觉检测
    hallucinationChecker: HallucinationDetector;
  };
}
```

**二、反馈回路（Feedback Loops）**

Agent 系统与传统软件最大的区别在于其行为的概率性——相同的输入可能产生不同的输出。因此 Harness 必须内建持续反馈机制，将每一次 Agent 交互转化为系统改进的信号：

- **人工审核回路（Human-in-the-Loop）**：高风险操作需经人工确认，审核结果反馈至提示词优化管线
- **自动化评估（Automated Evaluation）**：正如第 15 章评估体系中所讨论的，对 Agent 输出进行多维度自动评分
- **持续改进管线（Continuous Improvement）**：将失败案例、边缘情况自动归档为测试用例，驱动提示词和约束的迭代

**三、文档即接口（Documentation as Interface）**

在 Harness Engineering 的理念中，文档不是事后补充的说明书，而是系统行为的正式契约：

- **工具 Schema 文档化**：每个 MCP 工具的输入输出、副作用、错误码都必须有机器可读的规范。正如第 6 章工具系统设计中强调的，良好的工具描述直接决定了 Agent 的调用准确率
- **系统提示词即合同**：System Prompt 不是随手写的提示语，而是 Agent 行为的正式规约，需要版本控制和变更审核
- **行为规格说明（Behavioral Specification）**：Agent 在各类场景下「应该做什么」和「绝不能做什么」的明确声明

**四、生命周期管理（Lifecycle Management）**

生产环境中的 Agent 不是部署完就结束的静态系统，而是需要持续运维的活体：

```typescript
interface AgentLifecycleManager {
  // 版本管理：每个 Agent 配置（提示词 + 约束 + 工具集）都是一个不可变版本
  versioning: {
    createVersion(config: HarnessConfig): AgentVersion;
    rollback(targetVersion: string): Promise<void>;
    diff(v1: string, v2: string): ConfigDiff;
  };

  // A/B 测试：新旧版本并行运行，基于评估指标决定是否全量切换
  experiment: {
    createExperiment(control: string, treatment: string, trafficSplit: number): Experiment;
    evaluateExperiment(id: string): ExperimentResult;
  };

  // 优雅降级：当 Agent 不可用或表现异常时，自动切换到安全回退策略
  degradation: {
    fallbackChain: FallbackStrategy[];
    healthCheck: () => Promise<HealthStatus>;
    circuitBreaker: CircuitBreakerConfig;
  };
}
```

### 26.2.3 实践启示

Harness Engineering 给团队带来的最重要认知转变是**投资重心的迁移**：与其花 80% 的精力在模型选型和提示词调优上，不如将至少 50% 的工程投入放在约束系统、评估管线、版本管理和反馈回路上。模型可以替换，Harness 才是沉淀组织知识和工程能力的载体。

正如第 18 章部署运维和第 19 章成本工程中讨论的，生产级 Agent 系统的复杂性远超模型本身——而 Harness Engineering 正是对这种复杂性的系统性回应。

## 26.3 Agentic Engineering：从 Vibe Coding 到工程纪律

### 26.3.1 Vibe Coding 的兴起与局限

2024-2025 年，随着 AI 编码助手（GitHub Copilot、Cursor、Windsurf 等）的全面普及，一种被称为 **Vibe Coding** 的开发模式迅速蔓延：开发者通过自然语言提示让 AI 生成代码，凭直觉和感觉（vibe）验收结果，甚至不完全理解生成的代码就直接提交。

Vibe Coding 在原型阶段效率惊人，但在生产系统中暴露出严重问题：

- **质量不可控**：生成的代码缺乏一致的架构风格和错误处理
- **调试困难**：开发者无法有效排查自己不完全理解的代码
- **安全隐患**：AI 生成的代码可能包含未被察觉的漏洞或反模式
- **知识断层**：团队对自身系统的理解逐渐退化

### 26.3.2 Agentic Engineering 的定义

2025 年下半年，Z.ai 等团队开始系统性地提出 **Agentic Engineering**（Agent 化工程）的概念——一种专业化的、以 AI Agent 为协作对象的软件开发方法论。它不是排斥 AI 辅助，而是将 AI 辅助纳入严格的工程框架中：

> Agentic Engineering 是与 AI Agent 系统性协作的专业纪律，强调规约先行、评估驱动、人机协同的开发模式。

其四大核心原则：

**一、规约先行（Specification-First）**

在让 Agent 生成任何代码之前，先定义清晰的行为规约：

```typescript
// 规约先行的 Agent 开发流程
interface AgentDevelopmentSpec {
  // 1. 行为规约：Agent 应该做什么
  behaviorSpec: {
    capabilities: string[];       // 核心能力列表
    inputConstraints: Schema;     // 输入约束
    outputContract: Schema;       // 输出契约
    invariants: string[];         // 不变量（任何时候都必须成立的条件）
    prohibitions: string[];       // 禁止行为
  };

  // 2. 交互协议：Agent 如何与外部交互
  interactionProtocol: {
    escalationRules: EscalationRule[];  // 何时升级给人类
    confirmationRequired: string[];     // 哪些操作需要人工确认
    errorRecovery: ErrorRecoveryPlan;   // 错误恢复策略
  };

  // 3. 质量标准：如何衡量 Agent 表现
  qualityCriteria: {
    accuracyThreshold: number;
    latencyBudget: number;
    costBudget: number;
    safetyChecklist: string[];
  };
}
```

**二、测试驱动 Agent 开发（Test-Driven Agent Development）**

正如第 15-16 章讨论的评估体系，Agentic Engineering 要求为 Agent 行为编写自动化评估套件，且评估先于实现：

- **行为测试**：给定输入，Agent 的输出是否满足规约
- **边界测试**：Agent 在模糊输入、对抗性输入下是否安全退化
- **回归测试**：配置变更后，Agent 在已知场景下表现是否稳定
- **性能基准**：延迟、成本、token 消耗是否在预算内

**三、人类监督架构（Human Oversight Architecture）**

Agentic Engineering 不追求完全自治，而是设计精细的人机协作拓扑，正如第 14 章信任架构中提出的分级信任模型：

- **审批工作流**：高风险操作进入人工审批队列
- **升级路径**：Agent 在置信度不足时主动升级给人类
- **审计追踪**：所有 Agent 决策都有完整的可追溯记录
- **紧急制停**：人类随时可以中断 Agent 执行并接管

**四、可组合性（Composability）**

Agent 应该从定义良好的、可复用的组件构建，而非每次都从零开始。正如第 9-10 章讨论的 Multi-Agent 架构和编排模式：

- **标准化接口**：每个 Agent 组件遵循统一的输入输出协议
- **关注点分离**：规划、执行、评估、监控各司其职
- **配置化组装**：通过声明式配置组合 Agent 能力，而非硬编码

### 26.3.3 Agentic Engineering 与 Harness Engineering 的关系

Agentic Engineering 和 Harness Engineering 是互补而非竞争的概念。Harness Engineering 聚焦于 Agent 的**运行时约束系统**——如何让已部署的 Agent 可靠运行；Agentic Engineering 聚焦于 Agent 的**开发方法论**——如何从开发阶段就确保质量。二者结合，覆盖了 Agent 从开发到运维的完整生命周期。

## 26.4 OpenClaw 与平台连接革命

### 26.4.1 从「构建 Agent」到「部署 Agent 到任何地方」

2025 年，Agent 框架领域经历了一次重要的分化。早期框架（如 LangChain）试图做「一站式 Agent 开发平台」，而到了 2026 年，框架开始明确分工：

| 框架类别 | 代表 | 核心职责 |
|---------|------|---------|
| 编排框架 | LangGraph | Agent 内部推理和工具调用的流程编排 |
| 协作框架 | CrewAI, AutoGen | Multi-Agent 团队的任务分配和协作 |
| 部署框架 | OpenClaw | Agent 到各类平台和渠道的无缝部署 |

**OpenClaw** 是这一趋势中的典型代表。这个在 GitHub 上获得超过 100K 星标的开源项目，采用 **Gateway 守护进程架构**，解决了一个被长期忽视的工程问题：你精心构建的 Agent，如何高效地部署到微信、Slack、Discord、Web、API 等各种渠道？

### 26.4.2 Gateway + Plugin 架构

OpenClaw 的核心创新是其 Gateway + Plugin 架构。Gateway 作为常驻守护进程，统一处理 Agent 与外部平台之间的协议转换、认证管理、消息路由和状态同步：

```typescript
// OpenClaw 风格的 Gateway + Plugin 架构示意
interface OpenClawGateway {
  // Gateway 核心：统一的 Agent 入口/出口
  router: {
    // 将不同平台的消息统一为标准格式
    normalizeInbound(platform: string, rawMessage: any): StandardMessage;
    // 将 Agent 输出适配到目标平台格式
    adaptOutbound(platform: string, response: AgentResponse): PlatformMessage;
  };

  // 插件注册：每个平台是一个插件
  plugins: Map<string, PlatformPlugin>;
  
  // MCP 工具集成
  mcpTools: MCPToolRegistry;
}

interface PlatformPlugin {
  name: string;
  // 平台连接管理
  connect(credentials: PlatformCredentials): Promise<Connection>;
  // 消息接收
  onMessage(handler: MessageHandler): void;
  // 消息发送（适配平台特定能力：富文本、按钮、卡片等）
  send(connection: Connection, message: PlatformMessage): Promise<void>;
  // 平台特有能力声明
  capabilities: PlatformCapability[];
}

// 示例：通过 OpenClaw 将同一个 Agent 部署到多个平台
const gateway = new OpenClawGateway();

// 注册平台插件
gateway.registerPlugin(new SlackPlugin({ token: SLACK_TOKEN }));
gateway.registerPlugin(new WeChatPlugin({ appId: WECHAT_APP_ID }));
gateway.registerPlugin(new WebPlugin({ port: 3000 }));

// 注册 Agent —— 一次编写，多处部署
gateway.registerAgent('customer-service', myAgent, {
  platforms: ['slack', 'wechat', 'web'],
  mcpTools: ['database-query', 'ticket-create', 'knowledge-search'],
});
```

### 26.4.3 MCP 工具生态的成熟

OpenClaw 集成了 **134 个 MCP 工具**，这一数字本身就反映了 MCP 生态的高速成熟。正如第 20 章互操作协议中讨论的，MCP 协议已经从 2024 年底 Anthropic 发布时的「有前景的提案」，发展为 2026 年 Agent 工具集成的事实标准。

工具生态的成熟带来了两个重要影响：

1. **Agent 能力的民主化**：开发者不再需要为每个 API 编写适配层，MCP 工具即插即用
2. **关注点上移**：工程师的精力从「如何连接工具」转向「如何编排工具」——这正是第 10 章编排模式讨论的核心议题

### 26.4.4 趋势：Agent 框架的专业化分工

OpenClaw 的成功印证了一个更大的趋势——Agent 框架正在从「全栈式」走向「专业化」。这与传统软件工程的演进路径一致：早期的 Web 框架试图包揽一切，最终让位于专注路由的、专注 ORM 的、专注前端的各类库。Agent 领域正在经历相同的解耦过程。

对工程师而言，这意味着 Agent 技术选型不再是「选一个框架」，而是「组合一套框架栈」——正如你会组合 React + Express + PostgreSQL 而非寻找一个包办一切的框架。

## 26.5 模型格局 2026：同质化加速

### 26.5.1 新一代模型能力对比

2026 年初，几款标志性模型的发布让模型格局发生了显著变化：

| 模型 | 发布时间 | 上下文窗口 | 核心特点 | 代表性基准 |
|------|---------|-----------|---------|-----------|
| **Claude Opus 4.6** | 2026.02 | 1M tokens | 原生 Agent 团队、MCP 原生支持、业界领先编码能力 | SWE-bench 80%+ |
| **Gemini 3** | 2025.12 | 2M tokens | Deep Think 模式、Google Antigravity 项目集成 | MMLU-Pro 92% |
| **GLM-5** | 2026.02 | 256K tokens | 开源、SWE-bench 77.8%、与闭源模型竞争力相当 | SWE-bench 77.8% |
| **DeepSeek-V3.2** | 2025.11 | 128K tokens | 开源推理模型、成本极低 | MATH-500 96% |

几个值得注意的趋势：

**一、上下文窗口的实用化**

1M-2M token 的上下文窗口意味着 Agent 可以在单次会话中「看到」整个中型代码库或数十份文档。这直接改变了第 7 章记忆架构和第 8 章 RAG 的工程权衡——部分过去必须依赖检索增强的场景，现在可以直接「塞入上下文」。但这并不意味着 RAG 过时了：成本控制（第 19 章）和信息新鲜度仍然是 RAG 的核心价值。

**二、Agent 能力的原生化**

Claude Opus 4.6 引入的「原生 Agent 团队」功能标志着一个重要转变：多 Agent 协作不再仅仅是框架层的编排（如第 9 章讨论的模式），而是开始下沉到模型层面。模型提供商正在将 Agent 设计模式内化为模型能力，这为开发者提供了开箱即用的多 Agent 支持，同时也引发了框架层与模型层职责边界的重新思考。

**三、开源模型的崛起**

GLM-5 在 SWE-bench 上达到 77.8% 的成绩，与闭源模型的差距缩小到历史最低。开源模型的竞争力提升加速了模型同质化趋势——这进一步验证了 26.2 节 Harness Engineering 的核心论断：当模型不再是稀缺资源时，约束系统才是真正的护城河。

### 26.5.2 模型同质化与工程策略

模型同质化对 Agent 工程实践有深刻影响：

```typescript
// 面向模型同质化时代的 Agent 架构
interface ModelAgnosticAgent {
  // 模型抽象层：Agent 逻辑不绑定特定模型
  modelProvider: {
    primary: ModelConfig;
    fallbacks: ModelConfig[];    // 多模型回退链
    router: (task: Task) => ModelConfig;  // 基于任务路由到最优模型
  };

  // 约束系统（Harness）：这才是核心竞争力
  harness: HarnessConfig;

  // 评估管线：模型无关的质量保障
  evaluation: EvaluationPipeline;
}

// 策略：构建模型无关的 Agent，投资约束系统而非模型绑定
class ModelAgnosticStrategy {
  // 模型选择成为运行时决策而非架构决策
  selectModel(task: Task, constraints: ResourceConstraints): ModelConfig {
    const candidates = this.availableModels.filter(m => 
      m.contextWindow >= task.requiredContext &&
      m.costPerToken <= constraints.maxCostPerToken
    );
    
    // 按性价比排序，而非绝对能力
    return candidates.sort((a, b) => 
      (a.benchmarkScore / a.costPerToken) - (b.benchmarkScore / b.costPerToken)
    )[candidates.length - 1];
  }
}
```

这种模型无关的架构设计意味着：团队可以在不修改核心逻辑的前提下，随时切换到性价比更优的模型——而这恰恰需要强健的 Harness 作为保障。

## 26.6 具身智能与世界模型

### 26.6.1 物理世界交互

```typescript
interface EmbodiedAgent {
  // 感知
  perceive(sensors: SensorData): Promise<WorldState>;
  // 规划
  plan(goal: string, worldState: WorldState): Promise<ActionSequence>;
  // 执行
  execute(action: Action): Promise<ActionResult>;
  // 学习
  learn(experience: Experience): Promise<void>;
}

interface WorldModel {
  // 状态预测
  predict(currentState: WorldState, action: Action): Promise<WorldState>;
  // 可行性评估
  isFeasible(action: Action, state: WorldState): Promise<boolean>;
  // 安全检查
  isSafe(action: Action, state: WorldState): Promise<boolean>;
}

class RoboticAgent implements EmbodiedAgent {
  private worldModel: WorldModel;
  private safetyChecker: SafetyChecker;
  
  async plan(goal: string, worldState: WorldState): Promise<ActionSequence> {
    const candidates = await this.generateCandidatePlans(goal, worldState);
    
    // 使用世界模型模拟每个计划
    const evaluated = await Promise.all(
      candidates.map(async plan => {
        let state = worldState;
        let totalReward = 0;
        
        for (const action of plan.actions) {
          // 安全检查
          const safe = await this.worldModel.isSafe(action, state);
          if (!safe) return { plan, reward: -Infinity, safe: false };
          
          // 预测下一状态
          state = await this.worldModel.predict(state, action);
          totalReward += this.calculateReward(state, goal);
        }
        
        return { plan, reward: totalReward, safe: true };
      })
    );
    
    // 选择最优安全计划
    const best = evaluated
      .filter(e => e.safe)
      .sort((a, b) => b.reward - a.reward)[0];
    
    return best.plan;
  }
  
  async perceive(sensors: SensorData): Promise<WorldState> { return {} as WorldState; }
  async execute(action: Action): Promise<ActionResult> { return {} as ActionResult; }
  async learn(experience: Experience): Promise<void> {}
  private async generateCandidatePlans(goal: string, state: WorldState): Promise<ActionSequence[]> { return []; }
  private calculateReward(state: WorldState, goal: string): number { return 0; }
}
```

## 26.7 Agent 市场与经济系统

### 26.7.1 Agent 即服务

```typescript
interface AgentMarketplace {
  // 发布 Agent
  publish(agent: AgentManifest): Promise<string>;
  // 发现 Agent
  discover(query: string, filters?: DiscoverFilters): Promise<AgentListing[]>;
  // 组合 Agent
  compose(agents: string[], workflow: WorkflowDefinition): Promise<CompositeAgent>;
  // 计费
  billing: BillingEngine;
}

interface AgentManifest {
  name: string;
  description: string;
  capabilities: string[];
  pricing: PricingModel;
  sla: ServiceLevelAgreement;
  protocols: ('MCP' | 'A2A' | 'ACP')[];
  trustScore: number;
  auditLog: boolean;
}

interface PricingModel {
  type: 'per_call' | 'per_token' | 'subscription' | 'outcome_based';
  basePrice: number;
  currency: string;
  volumeDiscounts?: VolumeDiscount[];
}
```

### 26.7.2 Agent 经济模型

```
┌──────────────────────────────────────────────┐
│              Agent Marketplace                │
│                                              │
│  ┌──────────┐    ┌──────────┐               │
│  │ Provider │───→│ Registry │               │
│  │  Agents  │    │ & Rating │               │
│  └──────────┘    └──────────┘               │
│       ↑               │                      │
│       │          ┌────↓─────┐               │
│  ┌────┴───┐     │ Consumer │               │
│  │Billing │←────│  Agents  │               │
│  │Engine  │     └──────────┘               │
│  └────────┘                                  │
│                                              │
│  Trust Layer: Reputation + Audit + SLA       │
└──────────────────────────────────────────────┘
```

## 26.8 长时运行 Agent

### 26.8.1 持久化执行架构

传统 Agent 是会话级的——用户请求来了处理完就结束。未来的 Agent 将是持久运行的，能够跨越小时、天甚至周的时间跨度完成复杂任务：

```typescript
interface LongRunningAgent {
  // 启动长期任务
  startTask(task: LongTermTask): Promise<TaskHandle>;
  // 暂停/恢复
  suspend(handle: TaskHandle): Promise<Checkpoint>;
  resume(checkpoint: Checkpoint): Promise<TaskHandle>;
  // 进度报告
  getProgress(handle: TaskHandle): Promise<ProgressReport>;
  // 中断处理
  onInterrupt(handle: TaskHandle, handler: InterruptHandler): void;
}

class PersistentAgent implements LongRunningAgent {
  private checkpointStore: CheckpointStore;
  
  async startTask(task: LongTermTask): Promise<TaskHandle> {
    const handle = { id: generateId(), task, startedAt: Date.now() };
    
    // 异步执行
    this.executeAsync(handle).catch(async (error) => {
      // 失败时保存检查点，支持恢复
      const checkpoint = await this.createCheckpoint(handle);
      await this.checkpointStore.save(checkpoint);
      this.notifyFailure(handle, error);
    });
    
    return handle;
  }
  
  private async executeAsync(handle: TaskHandle): Promise<void> {
    const steps = await this.decompose(handle.task);
    
    for (let i = 0; i < steps.length; i++) {
      // 定期创建检查点
      if (i % 5 === 0) {
        await this.createCheckpoint(handle, i);
      }
      
      // 检查是否需要暂停
      if (await this.shouldSuspend(handle)) {
        await this.suspend(handle);
        return;
      }
      
      await this.executeStep(steps[i], handle);
      await this.reportProgress(handle, i, steps.length);
    }
  }
  
  async suspend(handle: TaskHandle): Promise<Checkpoint> {
    return this.createCheckpoint(handle);
  }
  
  async resume(checkpoint: Checkpoint): Promise<TaskHandle> {
    const handle = checkpoint.handle;
    const remainingSteps = checkpoint.remainingSteps;
    // 从检查点恢复执行
    this.executeAsync(handle);
    return handle;
  }
  
  async getProgress(handle: TaskHandle): Promise<ProgressReport> { return {} as ProgressReport; }
  onInterrupt(handle: TaskHandle, handler: InterruptHandler): void {}
  private async decompose(task: LongTermTask): Promise<TaskStep[]> { return []; }
  private async createCheckpoint(handle: TaskHandle, step?: number): Promise<Checkpoint> { return {} as Checkpoint; }
  private async shouldSuspend(handle: TaskHandle): Promise<boolean> { return false; }
  private async executeStep(step: TaskStep, handle: TaskHandle): Promise<void> {}
  private async reportProgress(handle: TaskHandle, current: number, total: number): Promise<void> {}
  private notifyFailure(handle: TaskHandle, error: Error): void {}
}
```

## 26.9 多模态 Agent

| 模态 | 输入能力 | 输出能力 | 代表场景 |
|------|---------|---------|---------|
| 视觉 | 图片理解、OCR、视频分析 | 图像生成、UI 设计 | 设计助手 |
| 语音 | 语音识别、情感分析 | 语音合成、音乐生成 | 语音助手 |
| 代码 | 代码理解、AST 分析 | 代码生成、重构 | 编程助手 |
| 数据 | 表格理解、图表分析 | 可视化、报表 | 数据分析 |
| 3D | 场景理解、物体识别 | 3D 建模、场景生成 | 空间计算 |

## 26.10 Agent 基础设施趋势

### 26.10.1 未来技术栈

```
2024-2025:
  ├── 推理模型成为标配 (o1/o3, DeepSeek-R1)
  ├── MCP 协议标准化
  ├── Agent 可观测性成熟
  ├── 单 Agent 产品爆发
  └── Vibe Coding 流行，暴露质量隐患

2025-2026:
  ├── Harness Engineering 方法论确立
  ├── Agentic Engineering 成为专业纪律
  ├── Multi-Agent 框架成熟 (CrewAI, AutoGen)
  ├── A2A/ACP 协议落地
  ├── Agent 框架专业化分工 (LangGraph / CrewAI / OpenClaw)
  ├── MCP 工具生态爆发 (134+ 工具)
  ├── 模型同质化加速 (Claude Opus 4.6, Gemini 3, GLM-5)
  └── 长时运行 Agent 普及

2026+:
  ├── Agent 经济体系形成
  ├── 具身智能突破
  ├── 模型无关架构成为默认选择
  ├── Agent-Agent 自主协作
  └── 通用 Agent 雏形
```

## 26.11 小结

AI Agent 领域正在从「能用」走向「好用」，从「单一任务」走向「通用能力」。2026 年的前沿趋势清晰地指向一个核心主题：**工程胜过模型**。

Harness Engineering 的提出标志着行业共识的形成——在模型同质化的时代，约束系统、反馈回路和生命周期管理才是真正的竞争壁垒。Agentic Engineering 则从开发方法论层面回应了 Vibe Coding 泛滥带来的质量危机，为 Agent 开发建立了专业纪律。OpenClaw 等框架的兴起证明了 Agent 基础设施正在走向专业化分工，MCP 工具生态的成熟则大幅降低了 Agent 能力扩展的门槛。

与此同时，推理能力的持续提升、上下文窗口的跨越式增长、开源模型的崛起，都在从底层推动 Agent 能力的普惠化。这些趋势共同指向本书贯穿始终的核心理念：**确定性外壳包裹概率性内核**——模型越强大、越普及，我们越需要严谨的工程方法来驾驭它。

工程师需要保持技术敏锐度，但更重要的是建立系统性的工程思维——投资于约束系统、评估管线、部署基础设施和开发纪律，在实战中积累组织级的 Agent 工程能力，为已经到来的 Agent 时代做好准备。
