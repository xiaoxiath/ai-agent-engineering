# 第 6.5 章：Skill 工程 —— 从工具调用到知识驱动的范式跃迁

> **"The future of agents isn't more tools — it's better instructions."**
> — Angie Jones, Block (formerly Square), 2025

| 上一章 | 目录 | 下一章 |
|--------|------|--------|
| [第 6 章 工具系统设计](./ch06-tool-system-design.md) | [目录](../../SUMMARY.md) | [第 7 章 记忆架构](../part-03-memory-knowledge/ch07-memory-architecture.md) |

第 6 章从 ACI 设计哲学到 MCP 深度集成，系统性地讲解了如何构建 Agent 的工具系统。工具是 Agent 的"手和脚"，但随着 MCP 生态爆发式增长——社区贡献的 MCP Server 超过 10,000 个——一个深刻的问题浮出水面：**当 Agent 面对 100+ 工具时，它反而不知道该用哪个了。**

本章提出的 **Skill（技能）** 概念，是对"工具优先"范式的一次根本性升级。如果说工具赋予 Agent"做事的能力"，那么 Skill 赋予的是"做事的智慧"——何时做、怎么做、注意什么、如何组合。这不是对 MCP 的替代，而是在 MCP 能力层之上构建了一个**知识层（Knowledge Layer）**，让 Agent 从"工具操作员"进化为"领域专家"。

---

## 6.5.1 引言：为什么需要 Skill

### 6.5.1.1 MCP 工具泛滥：一个真实的困境

回顾第 6 章的核心洞察：第 6.1.3 节的 `ToolContextCostAnalyzer` 精确计算了每个工具定义在 context window 中的 token 开销。当时我们给出的建议是"工具集总 token 超过 4000 时应启用动态加载"。但这个阈值在实际生产环境中轻而易举就会被突破。

让我们量化这个问题：

```typescript
/**
 * MCP 工具膨胀问题的量化分析
 * 模拟一个真实的全栈开发 Agent 所面临的工具规模
 */

// 典型的全栈开发 Agent 可能接入的 MCP Server 列表
const TYPICAL_MCP_SERVERS = [
  { name: 'filesystem',     toolCount: 12 },  // 文件读写、搜索、监控
  { name: 'git',            toolCount: 15 },  // clone, commit, push, diff, log...
  { name: 'github',         toolCount: 25 },  // issues, PRs, reviews, actions...
  { name: 'postgres',       toolCount: 8  },  // query, schema, migrations...
  { name: 'docker',         toolCount: 10 },  // build, run, push, logs...
  { name: 'kubernetes',     toolCount: 20 },  // pods, deployments, services...
  { name: 'slack',          toolCount: 8  },  // send, channel, thread...
  { name: 'jira',           toolCount: 12 },  // issues, sprints, boards...
  { name: 'confluence',     toolCount: 6  },  // pages, spaces, search...
  { name: 'datadog',        toolCount: 10 },  // metrics, logs, alerts...
  { name: 'aws-s3',         toolCount: 8  },  // upload, download, list...
  { name: 'redis',          toolCount: 6  },  // get, set, keys, pub/sub...
  { name: 'elasticsearch',  toolCount: 8  },  // search, index, aggregate...
  { name: 'browser',        toolCount: 12 },  // navigate, click, extract...
  { name: 'email',          toolCount: 5  },  // send, search, draft...
];

interface ToolProliferationReport {
  totalTools: number;
  estimatedTokens: number;
  contextWindowUsage: Record<string, string>;
  problems: string[];
}

/**
 * 分析 MCP 工具泛滥对 Agent 性能的影响
 */
function analyzeToolProliferation(
  servers: Array<{ name: string; toolCount: number }>
): ToolProliferationReport {
  const totalTools = servers.reduce((sum, s) => sum + s.toolCount, 0);

  // 每个工具定义平均约 150-300 token（名称 + 描述 + 参数 Schema）
  // 这与第 6 章 ToolContextCostAnalyzer 的经验数据一致
  const AVG_TOKENS_PER_TOOL = 220;
  const estimatedTokens = totalTools * AVG_TOKENS_PER_TOOL;

  const problems: string[] = [];

  // 问题 1：Context Window 占用
  if (estimatedTokens > 4000) {
    problems.push(
      `工具定义占用 ${estimatedTokens} token，` +
      `挤占了 ${Math.round(estimatedTokens / 128_000 * 100)}% 的 GPT-4 Turbo 上下文窗口`
    );
  }

  // 问题 2：工具选择混乱
  // 研究表明，当候选工具超过 20 个时，LLM 的工具选择准确率显著下降
  if (totalTools > 20) {
    problems.push(
      `${totalTools} 个候选工具远超 LLM 的最优选择范围（<20），` +
      `预计工具选择准确率下降 ${Math.min(60, (totalTools - 20) * 1.5).toFixed(0)}%`
    );
  }

  // 问题 3：同义工具冲突
  // 例如 filesystem_search_files vs. git_grep vs. elasticsearch_search
  problems.push(
    '存在语义重叠的工具（如 filesystem.search / git.grep / elasticsearch.search），' +
    'LLM 无法判断在特定场景下应使用哪个'
  );

  // 问题 4：Token 成本
  // 每次对话都要发送完整工具列表，每轮交互浪费大量 token
  const monthlyWaste = estimatedTokens * 50 * 30; // 每天 50 次对话，30 天
  problems.push(
    `每月仅工具定义就消耗约 ${(monthlyWaste / 1_000_000).toFixed(1)}M token，` +
    `按 GPT-4 价格约 $${(monthlyWaste * 0.00001).toFixed(0)}`
  );

  return {
    totalTools,
    estimatedTokens,
    contextWindowUsage: {
      'GPT-4 Turbo (128K)': `${(estimatedTokens / 128_000 * 100).toFixed(1)}%`,
      'Claude 3.5 (200K)':  `${(estimatedTokens / 200_000 * 100).toFixed(1)}%`,
      'Gemini Pro (1M)':    `${(estimatedTokens / 1_000_000 * 100).toFixed(1)}%`,
    },
    problems,
  };
}

// 运行分析
const report = analyzeToolProliferation(TYPICAL_MCP_SERVERS);
console.log(`总工具数: ${report.totalTools}`);          // 165
console.log(`估计 Token: ${report.estimatedTokens}`);    // 36,300
console.log('问题清单:');
report.problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
```

上述分析揭示了一个残酷的现实：一个配置齐全的全栈 Agent 可能面对 **165 个工具**，仅工具定义就消耗超过 **36,000 token**——相当于 GPT-4 Turbo 上下文窗口的 28%。这还没计算用户消息、系统提示和对话历史。

### 6.5.1.2 Claude Code 的启示：更少的工具，更丰富的指令

2025 年，Anthropic 的 Claude Code 项目提供了一个关键洞察。Claude Code 作为一个极其强大的编码 Agent，其核心工具集却出奇地精简：

| 工具 | 功能 | 说明 |
|------|------|------|
| `bash` | 执行 shell 命令 | 万能工具，替代了数十个文件/git/docker 专用工具 |
| `read_file` | 读取文件 | 带行号，支持范围读取 |
| `write_file` | 写入文件 | 创建或覆盖 |
| `edit_file` | 编辑文件 | 基于搜索/替换的精确编辑 |

仅 4 个核心工具，Claude Code 就能完成绝大多数软件工程任务。它的秘密不在于工具数量，而在于**指令质量**——每个任务都配有精心编写的 System Prompt，告诉模型在什么场景下使用什么工具、按什么步骤操作、需要注意什么。

> **设计决策：为什么更少的工具 + 更好的指令 > 更多的工具？**
>
> 这与认知科学中的 **"选择过载"（Choice Overload）** 理论一致：当选项过多时，决策质量反而下降（Iyengar & Lepper, 2000）。对于 LLM 而言，过多的工具定义不仅浪费 token，还会导致：
>
> 1. **选择困难**：语义相近的工具（如 `search_files` vs `grep_codebase`）让模型犹豫
> 2. **参数遗漏**：工具越多，模型越容易忘记某个工具的必填参数
> 3. **组合爆炸**：N 个工具的潜在调用序列是 O(N!)，搜索空间急剧膨胀
>
> Claude Code 的解决方案：用**丰富的指令**代替**冗余的工具**。一个 bash 工具配合详细的使用指南，比 20 个专用工具更高效。

```typescript
/**
 * Claude Code 工具哲学的量化对比
 * 对比"多工具"方案和"少工具+丰富指令"方案
 */

interface ApproachComparison {
  approach: string;
  toolCount: number;
  toolTokens: number;
  instructionTokens: number;
  totalContextTokens: number;
  selectionAccuracy: number;  // 工具选择准确率（%）
  taskCompletionRate: number; // 任务完成率（%）
}

const APPROACH_A: ApproachComparison = {
  approach: '传统方案：每个功能一个 MCP 工具',
  toolCount: 45,               // 文件(12) + Git(15) + Docker(10) + K8s(8)
  toolTokens: 45 * 220,        // 9,900 token 的工具定义
  instructionTokens: 200,      // 简短的通用指令
  totalContextTokens: 10_100,
  selectionAccuracy: 62,       // 工具太多，选择准确率下降
  taskCompletionRate: 71,      // 经常选错工具导致任务失败
};

const APPROACH_B: ApproachComparison = {
  approach: 'Skill 方案：少量工具 + 场景化指令',
  toolCount: 4,                // bash, read_file, write_file, edit_file
  toolTokens: 4 * 220,        // 880 token 的工具定义
  instructionTokens: 2_000,   // 丰富的场景化指令（Skill 注入）
  totalContextTokens: 2_880,
  selectionAccuracy: 94,      // 工具少且指令明确，几乎不会选错
  taskCompletionRate: 89,     // 更高的任务完成率
};

/**
 * 对比两种方案
 */
function compareApproaches(a: ApproachComparison, b: ApproachComparison): void {
  console.log('=== 工具方案对比 ===\n');
  console.log(`| 指标 | ${a.approach} | ${b.approach} |`);
  console.log(`|------|------|------|`);
  console.log(`| 工具数量 | ${a.toolCount} | ${b.toolCount} |`);
  console.log(`| 工具定义 Token | ${a.toolTokens} | ${b.toolTokens} |`);
  console.log(`| 指令 Token | ${a.instructionTokens} | ${b.instructionTokens} |`);
  console.log(`| 总上下文 Token | ${a.totalContextTokens} | ${b.totalContextTokens} |`);
  console.log(`| 工具选择准确率 | ${a.selectionAccuracy}% | ${b.selectionAccuracy}% |`);
  console.log(`| 任务完成率 | ${a.taskCompletionRate}% | ${b.taskCompletionRate}% |`);

  const tokenSaving = ((a.totalContextTokens - b.totalContextTokens)
    / a.totalContextTokens * 100).toFixed(1);
  console.log(`\nToken 节省: ${tokenSaving}%`);
  console.log(`准确率提升: +${b.selectionAccuracy - a.selectionAccuracy}%`);
  console.log(`完成率提升: +${b.taskCompletionRate - a.taskCompletionRate}%`);
}

compareApproaches(APPROACH_A, APPROACH_B);
```

### 6.5.1.3 "MCP 已死"论争的技术本质

2025 年中，技术社区出现了 "MCP 已死"（MCP is Dead）的激烈讨论。这一论断看似极端，但其背后的技术洞察值得深思。

**论争的核心论点：**

| 论点 | 支持方观点 | 反对方观点 |
|------|-----------|-----------|
| 工具泛滥 | 10,000+ MCP Server 导致选择困难 | 动态发现和智能路由可以解决 |
| Token 浪费 | 工具定义占据大量 context window | 服务端工具过滤可以缓解 |
| 质量参差 | 社区 Server 质量不一，描述不规范 | 标准化审核流程在推进中 |
| 安全风险 | 第三方 Server 可能包含恶意代码 | OAuth 2.1 + 权限审批机制 |
| 组合困难 | 单个工具无法表达复杂工作流 | 工具编排层（见 6.7 节）可解决 |

**我们的观点：MCP 没有死，但"工具优先"的思维已死。**

```
旧范式：用户意图 → 从 100+ 工具中选择 → 调用工具 → 返回结果
                     ↑ 这里是瓶颈

新范式：用户意图 → 匹配 Skill → 注入知识和指令 → 使用少量工具执行 → 返回结果
                   ↑ 知识驱动                      ↑ 工具只是执行层
```

MCP 作为工具协议（Capability Layer）仍然是必要的基础设施——它标准化了 Agent 与外部世界的交互方式。但 MCP 不应该是 Agent 决策的起点。决策的起点应该是 **Skill**——告诉 Agent "在这个场景下你应该做什么、怎么做"的知识封装。

### 6.5.1.4 Skill = 知识层，MCP = 能力层

用一个类比来理解 Skill 与 MCP 的关系：

- **MCP** 好比人类的**肌肉和骨骼**——提供基础的运动能力
- **Skill** 好比人类的**运动技能和经验**——知道何时发力、如何配合、怎样避免受伤

一个拥有强壮肌肉但没有运动技能的人，和一个掌握精湛技术但力量不足的人，都无法在竞技中胜出。Agent 也是如此：

```typescript
/**
 * Agent 能力分层模型
 * 从底层到顶层：传输 → 协议 → 工具 → 知识 → 智能
 */

// 第一层：传输层（Transport）——如何通信
type TransportLayer = 'stdio' | 'streamable-http' | 'websocket';

// 第二层：协议层（Protocol）——通信格式
// MCP 协议定义了标准化的工具描述、调用、响应格式
interface ProtocolLayer {
  protocol: 'MCP';
  version: string;
  primitives: ['tools', 'resources', 'prompts'];
}

// 第三层：能力层（Capability）——能做什么
// MCP Server 提供的具体工具能力
interface CapabilityLayer {
  tools: MCPToolDefinition[];      // 可调用的工具
  resources: MCPResource[];        // 可访问的资源
  prompts: MCPPromptTemplate[];    // 可用的提示模板
}

// 第四层：知识层（Knowledge）——该怎么做 ⭐ 这就是 Skill
interface KnowledgeLayer {
  skills: SkillDefinition[];        // 技能定义
  triggers: TriggerRule[];          // 触发规则
  instructions: string[];           // 执行指令
  bestPractices: string[];          // 最佳实践
  guardrails: SafetyConstraint[];   // 安全护栏
}

// 第五层：智能层（Intelligence）——自主决策
interface IntelligenceLayer {
  planner: TaskPlanner;             // 任务规划
  reasoner: ChainOfThought;        // 链式推理
  reflector: SelfReflection;       // 自我反思
}

/**
 * Skill 的核心定义
 * Skill 是知识层的基本单元——对 Agent 能力的知识封装
 */
interface SkillDefinition {
  /** 技能唯一标识 */
  name: string;
  /** 语义化版本号 */
  version: string;
  /** 技能描述——何时应该使用这个技能 */
  description: string;
  /** 触发条件——用户意图的匹配规则 */
  triggers: TriggerRule[];
  /** 执行指令——分步骤的操作指南 */
  instructions: string[];
  /** 工具依赖——这个技能需要哪些 MCP 工具 */
  toolDependencies: string[];
  /** 上下文需求——执行此技能需要哪些信息 */
  contextRequirements: string[];
  /** 示例——few-shot 演示 */
  examples: SkillExample[];
  /** 安全护栏——限制和约束 */
  guardrails: string[];
}

interface TriggerRule {
  /** 触发类型：关键词匹配、意图分类、正则表达式 */
  type: 'keyword' | 'intent' | 'regex' | 'semantic';
  /** 匹配模式 */
  pattern: string;
  /** 置信度阈值（0-1） */
  confidence: number;
}

interface SkillExample {
  /** 用户输入 */
  userInput: string;
  /** 期望的 Agent 行为 */
  expectedBehavior: string;
  /** 使用的工具序列 */
  toolSequence: string[];
}

interface SafetyConstraint {
  type: 'must' | 'must_not' | 'should' | 'should_not';
  description: string;
}

interface MCPResource {
  uri: string;
  name: string;
  mimeType?: string;
}

interface MCPPromptTemplate {
  name: string;
  description: string;
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
}

interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface TaskPlanner {
  plan(goal: string): Promise<string[]>;
}

interface ChainOfThought {
  reason(context: string): Promise<string>;
}

interface SelfReflection {
  reflect(action: string, result: string): Promise<string>;
}
```

---

## 6.5.2 Skill 核心概念与设计哲学

### 6.5.2.1 Skill 的精确定义

**Skill 是对 Agent 能力的知识封装（Knowledge Encapsulation）。** 它包含四个核心要素：

1. **何时使用**（When）：触发条件和适用场景
2. **如何使用**（How）：分步骤的操作指令
3. **注意什么**（What to watch）：约束、限制、边界条件
4. **最佳实践**（Best practices）：经验知识和优化技巧

与传统的工具定义不同，Skill 不直接执行任何操作——它是一份"操作手册"，指导 Agent 在特定场景下如何高效地组合使用底层工具。

```typescript
/**
 * Skill 与 Tool 的概念对比
 * 通过同一个场景展示两种范式的差异
 */

// ===== 传统 Tool 方式：定义大量细粒度工具 =====

// 需要定义的工具列表（仅 PR Review 场景就需要 8 个）
const PR_REVIEW_TOOLS = [
  'github_get_pull_request',     // 获取 PR 详情
  'github_list_pr_files',        // 列出 PR 改动文件
  'github_get_file_diff',        // 获取文件 diff
  'github_list_pr_comments',     // 获取已有评论
  'github_create_pr_review',     // 创建审查
  'github_add_review_comment',   // 添加行级评论
  'git_blame',                   // 查看代码历史
  'filesystem_read_file',        // 读取文件内容
];
// 每个工具约 220 token，8 个工具 = 1,760 token
// Agent 需要自己决定使用哪些工具、以什么顺序调用

// ===== Skill 方式：一份知识文档 + 少量通用工具 =====

const CODE_REVIEW_SKILL: SkillDefinition = {
  name: 'code-review',
  version: '1.0.0',
  description: '对 Pull Request 进行全面的代码审查，包括代码质量、安全性、性能、可维护性评估',

  triggers: [
    { type: 'keyword', pattern: 'review PR|审查代码|code review', confidence: 0.9 },
    { type: 'intent',  pattern: 'code_review', confidence: 0.85 },
    { type: 'regex',   pattern: 'PR\\s*#?\\d+', confidence: 0.7 },
    { type: 'semantic', pattern: '帮我看看这个拉取请求有没有问题', confidence: 0.8 },
  ],

  instructions: [
    '1. 获取 PR 基本信息：使用 bash 执行 `gh pr view <number> --json title,body,files`',
    '2. 获取改动文件列表：使用 bash 执行 `gh pr diff <number> --name-only`',
    '3. 逐文件审查 diff：使用 bash 执行 `gh pr diff <number>` 并分析每个文件的改动',
    '4. 检查代码上下文：使用 read_file 读取改动文件的完整内容，理解改动的上下文',
    '5. 运行静态分析：使用 bash 执行项目的 lint 和 type-check 命令',
    '6. 生成审查报告：按照以下维度输出审查结果——',
    '   - 代码正确性：逻辑错误、边界条件、空指针',
    '   - 安全性：SQL 注入、XSS、敏感信息泄露',
    '   - 性能：N+1 查询、内存泄漏、不必要的重渲染',
    '   - 可维护性：命名规范、代码重复、过度复杂',
    '   - 测试覆盖：新代码是否有对应测试',
    '7. 提交审查：使用 bash 执行 `gh pr review <number> --body <review>`',
  ],

  toolDependencies: ['bash', 'read_file'],  // 仅需 2 个通用工具！

  contextRequirements: [
    'PR 编号或链接',
    '项目的编码规范（如有）',
    '项目的技术栈信息',
  ],

  examples: [
    {
      userInput: '帮我 review 一下 PR #42',
      expectedBehavior: '按照 instructions 中的步骤逐一执行，最终输出结构化的审查报告',
      toolSequence: ['bash(gh pr view)', 'bash(gh pr diff)', 'read_file', 'bash(lint)', 'bash(gh pr review)'],
    },
  ],

  guardrails: [
    '不要自动 approve 或 merge PR，只提供审查意见',
    '对安全相关的问题必须标记为 blocking',
    '审查意见应该具体指出代码位置（文件名 + 行号）',
    '如果 PR 改动超过 1000 行，建议分批审查并告知用户',
  ],
};

// Skill 指令约 800 token，远少于 8 个工具定义的 1,760 token
// 且 Agent 获得了明确的执行路径，无需自己推理该用哪个工具
```

### 6.5.2.2 Angie Jones 的 GitHub Actions 类比

Block（原 Square）工程副总裁 Angie Jones 在 2025 年提出了一个精妙的类比：

> "Skill 之于 Agent，正如 Reusable Workflow 之于 CI/CD。"

这个类比揭示了 Skill 的本质——它是一种**可复用的工作流抽象**：

| 维度 | GitHub Actions Workflow | Agent Skill |
|------|------------------------|-------------|
| 定义文件 | `.github/workflows/deploy.yml` | `skills/deploy/SKILL.md` |
| 触发条件 | `on: push to main` | `triggers: ['deploy', '部署', 'ship it']` |
| 执行步骤 | `steps:` 数组 | `instructions:` 数组 |
| 依赖 | `uses: actions/checkout@v4` | `toolDependencies: ['bash', 'git']` |
| 输入参数 | `inputs:` | `contextRequirements:` |
| 复用方式 | `uses: org/workflow@v1` | `extends: 'base-deploy-skill'` |
| 分享生态 | GitHub Marketplace | Skill Registry / Marketplace |

```typescript
/**
 * Skill 即 "Agent 的 Reusable Workflow"
 * 用 TypeScript 展示这个类比
 */

// GitHub Actions Workflow 的等价物——一个 YAML 配置
interface GitHubWorkflow {
  name: string;
  on: Record<string, unknown>;  // 触发条件
  jobs: Record<string, {
    'runs-on': string;
    steps: Array<{
      name: string;
      uses?: string;
      run?: string;
      with?: Record<string, string>;
    }>;
  }>;
}

// Agent Skill——功能等价但面向 LLM 设计
interface AgentSkill {
  name: string;
  triggers: TriggerRule[];        // 触发条件（等价于 `on:`）
  instructions: string[];          // 执行步骤（等价于 `steps:`）
  toolDependencies: string[];      // 工具依赖（等价于 `uses:`）
  contextRequirements: string[];   // 输入参数（等价于 `inputs:`）
}

/**
 * 将 GitHub Actions Workflow 概念映射到 Agent Skill
 * 展示两者的结构同构性
 */
function workflowToSkillAnalogy(workflow: GitHubWorkflow): AgentSkill {
  // 提取所有步骤
  const allSteps: string[] = [];
  const toolDeps = new Set<string>();

  for (const [_jobName, job] of Object.entries(workflow.jobs)) {
    for (const step of job.steps) {
      if (step.run) {
        allSteps.push(`使用 bash 执行: ${step.run}`);
        toolDeps.add('bash');
      } else if (step.uses) {
        allSteps.push(`调用 ${step.uses}`);
        toolDeps.add(step.uses.split('@')[0]);
      }
    }
  }

  return {
    name: workflow.name,
    triggers: [{ type: 'keyword', pattern: workflow.name, confidence: 0.9 }],
    instructions: allSteps,
    toolDependencies: Array.from(toolDeps),
    contextRequirements: [],
  };
}
```

### 6.5.2.3 Skill 与 MCP Tool 的本质区别

以下对比表是理解 Skill 设计哲学的核心参考：

| 对比维度 | MCP Tool | Skill |
|---------|----------|-------|
| **粒度** | 原子操作（读取文件、发送消息） | 业务场景（代码审查、部署上线） |
| **触发方式** | LLM 根据工具描述自主选择 | 基于意图匹配 + 规则引擎精确触发 |
| **知识含量** | 仅有参数 Schema 和简短描述 | 包含完整的执行指南、最佳实践、安全约束 |
| **组合性** | 单工具，组合逻辑完全依赖 LLM | 内置工具编排，预定义最优执行路径 |
| **版本管理** | Server 级别版本控制 | Skill 级别独立版本（semver） |
| **Token 效率** | 每个工具 ~220 token，N 个工具线性增长 | 按需注入，仅当前场景的 Skill ~500-1000 token |
| **错误处理** | 依赖 LLM 自行处理错误 | Skill 内置异常处理指令和回退策略 |
| **可测试性** | 测试单个工具的输入输出 | 测试端到端的场景完成度 |
| **共享方式** | 发布 MCP Server | 发布 SKILL.md 文件 |
| **学习曲线** | 需理解 JSON Schema + MCP 协议 | 写 Markdown 文档即可 |

```typescript
/**
 * Token 效率对比的定量分析
 * 展示 Skill 如何实现"按需注入"以节省 token
 */

interface TokenEfficiencyAnalysis {
  scenario: string;
  toolApproach: {
    activeTools: number;
    tokenCost: number;
    description: string;
  };
  skillApproach: {
    injectedSkills: number;
    tokenCost: number;
    description: string;
  };
  savings: string;
}

function analyzeTokenEfficiency(): TokenEfficiencyAnalysis[] {
  return [
    {
      scenario: '用户问: "帮我写个 README"',
      toolApproach: {
        activeTools: 165,  // 所有工具都在 context 中
        tokenCost: 36_300,
        description: '所有 165 个工具定义都发送给 LLM，即使只需要 filesystem 工具',
      },
      skillApproach: {
        injectedSkills: 1,  // 仅注入 "文档编写" Skill
        tokenCost: 800,
        description: '仅注入 "文档编写" Skill 的指令 + 2 个工具(read_file, write_file)',
      },
      savings: '97.8%',
    },
    {
      scenario: '用户问: "部署 v2.1.0 到生产环境"',
      toolApproach: {
        activeTools: 165,
        tokenCost: 36_300,
        description: '所有工具都在，LLM 需要从 165 个中选出正确的 7-8 个',
      },
      skillApproach: {
        injectedSkills: 1,  // 注入 "生产部署" Skill
        tokenCost: 1_200,
        description: '注入 "生产部署" Skill，指令中已包含最优工具序列和安全检查',
      },
      savings: '96.7%',
    },
    {
      scenario: '用户问: "分析一下最近的报错日志"',
      toolApproach: {
        activeTools: 165,
        tokenCost: 36_300,
        description: '所有工具都在，LLM 可能在 elasticsearch/datadog/filesystem 间犹豫',
      },
      skillApproach: {
        injectedSkills: 1,  // 注入 "日志分析" Skill
        tokenCost: 900,
        description: '注入 "日志分析" Skill，明确指示使用 bash + grep 优先，必要时再用 ES',
      },
      savings: '97.5%',
    },
  ];
}
```

### 6.5.2.4 Agent 能力模型的演进

Agent 能力扩展机制经历了五个代际的演进：

```
Generation 1: Function Call（2023）
  └─ 固定的函数列表，硬编码在 System Prompt 中
  └─ 代表：早期的 GPT-4 Function Calling

Generation 2: Tool（2024 早期）
  └─ 结构化的工具定义（JSON Schema），支持动态注册
  └─ 代表：LangChain Tools, AutoGPT

Generation 3: MCP Server（2024 中期）
  └─ 标准化协议，跨平台互操作，工具发现
  └─ 代表：MCP 生态系统

Generation 4: Skill（2025）
  └─ 知识封装，场景化指令，按需注入
  └─ 代表：Claude Code SKILL.md, Goose Skills, Mira Skills

Generation 5: Skill Network（未来）
  └─ 跨组织技能共享，自动组合，联邦学习
  └─ 代表：构想中的 Agent Skill Marketplace
```

```typescript
/**
 * Agent 能力扩展的代际演进
 * 每一代的核心接口定义
 */

// Generation 1: Function Call — 最原始的能力扩展
interface FunctionCallGen1 {
  name: string;
  parameters: Record<string, unknown>;
  // 缺点：没有描述、没有版本、没有发现机制
}

// Generation 2: Tool — 结构化工具定义
interface ToolGen2 {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  // 改进：有描述和参数 Schema
  // 缺点：无标准协议、无互操作性
}

// Generation 3: MCP Server — 标准化协议
interface MCPServerGen3 {
  serverInfo: { name: string; version: string };
  capabilities: { tools?: object; resources?: object; prompts?: object };
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
  // 改进：标准协议、动态发现、跨平台
  // 缺点：工具膨胀、缺乏场景知识
}

// Generation 4: Skill — 知识封装 ⭐ 本章重点
interface SkillGen4 {
  name: string;
  version: string;
  description: string;
  triggers: TriggerRule[];           // 何时使用
  instructions: string[];            // 如何操作
  toolDependencies: string[];        // 需要什么工具
  contextRequirements: string[];     // 需要什么信息
  examples: SkillExample[];          // 示例演示
  guardrails: string[];              // 安全约束
  // 改进：知识驱动、按需注入、高 Token 效率
  // 本章将深入讲解
}

// Generation 5: Skill Network — 跨组织技能网络（6.5.11 节展望）
interface SkillNetworkGen5 extends SkillGen4 {
  publisher: { org: string; verified: boolean };
  dependencies: Array<{ skillName: string; version: string }>;
  metrics: { usageCount: number; successRate: number; avgLatency: number };
  permissions: string[];
  federation: { sharedWith: string[]; accessPolicy: string };
}
```

---

## 6.5.3 SKILL.md 规范详解

### 6.5.3.1 SKILL.md 文件格式

SKILL.md 是 Skill 系统的核心载体——一个标准化的 Markdown 文件，包含 Skill 的完整定义。它的设计灵感来自多个先驱项目：

- **Claude Code** 的 `.claude/` 配置目录和 CLAUDE.md 项目规范
- **Goose**（Block 开源的 AI 开发 Agent）的 Skill 规范
- **Mira** 的 SKILL.md 格式

SKILL.md 选择 Markdown 而非 JSON/YAML 的原因在于：LLM 天然擅长理解和生成 Markdown，且 Markdown 对人类同样具有极佳的可读性。这实现了 **"Human-readable AND Machine-readable"** 的双重目标。

以下是完整的 SKILL.md 文件格式规范：

```markdown
---
name: code-review
version: 1.2.0
author: engineering-team
description: 对 Pull Request 进行全面代码审查
category: development
tags: [code-review, github, quality]
---

# Code Review Skill

## Description
对 GitHub Pull Request 进行全面的代码审查，涵盖代码正确性、安全性、
性能和可维护性四个维度。支持多种编程语言，遵循项目编码规范。

## Triggers
- 用户提到 "review PR"、"审查代码"、"code review"
- 用户分享了一个 GitHub PR 链接
- 用户说 "看看这个 PR 有没有问题"
- 用户提到 PR 编号（如 "PR #42"）

## Instructions
1. **获取 PR 信息**: 使用 `bash` 运行 `gh pr view <number> --json`
2. **获取改动文件**: 使用 `bash` 运行 `gh pr diff <number> --name-only`
3. **逐文件分析 diff**: 对每个改动文件，读取 diff 并分析
4. **检查代码上下文**: 使用 `read_file` 读取相关文件的完整内容
5. **运行静态分析**: 使用 `bash` 执行 `npm run lint` 和 `npm run typecheck`
6. **生成审查报告**: 按正确性/安全性/性能/可维护性四维度输出
7. **提交审查**: 使用 `bash` 运行 `gh pr review <number>`

## Context Requirements
- PR 编号或 GitHub PR URL
- 项目的编码规范文件路径（可选）
- 审查关注的重点领域（可选）

## Tool Dependencies
- bash（必需）: 执行 gh CLI 命令和静态分析
- read_file（必需）: 读取源代码文件
- write_file（可选）: 保存审查报告

## Examples

### Example 1: 基本 PR 审查
**用户输入**: 帮我 review 一下 PR #42
**Agent 行为**:
1. 执行 `gh pr view 42 --json title,body,files,additions,deletions`
2. 执行 `gh pr diff 42` 获取完整 diff
3. 分析每个文件的改动，识别潜在问题
4. 输出结构化审查报告

### Example 2: 聚焦安全审查
**用户输入**: 这个 PR 有安全问题吗？PR #88
**Agent 行为**:
1. 获取 PR diff
2. 重点扫描：SQL 拼接、用户输入未校验、敏感信息硬编码
3. 输出安全专项审查报告

## Guardrails
- MUST NOT 自动 approve 或 merge PR，只提供审查意见
- MUST 对安全问题标记为 blocking（阻断性问题）
- MUST 在审查意见中标明文件名和行号
- SHOULD 当 PR 改动超过 500 行时，建议用户分批审查
- SHOULD NOT 对代码风格问题给出过于严厉的评价
```

### 6.5.3.2 SKILL.md 各字段详解

让我们逐一解析 SKILL.md 的各个组成部分：

**1. Metadata（元数据头）**

SKILL.md 使用 YAML front matter（前置元数据）来定义基本属性：

```typescript
/**
 * SKILL.md 元数据定义
 * 对应 YAML front matter 中的字段
 */
interface SkillMetadata {
  /** 技能唯一名称，建议使用 kebab-case */
  name: string;

  /** 语义化版本号，遵循 semver 规范 */
  version: string;

  /** 作者或团队 */
  author: string;

  /** 简短描述（一句话） */
  description: string;

  /** 分类标签 */
  category: SkillCategory;

  /** 搜索标签 */
  tags: string[];

  /** 可选：技能的上游依赖 */
  extends?: string;

  /** 可选：最低 Agent 运行时版本要求 */
  minRuntimeVersion?: string;

  /** 可选：适用的编程语言 */
  languages?: string[];
}

type SkillCategory =
  | 'development'      // 软件开发
  | 'devops'           // 运维部署
  | 'data-analysis'    // 数据分析
  | 'documentation'    // 文档编写
  | 'communication'    // 沟通协作
  | 'security'         // 安全审计
  | 'testing'          // 测试质量
  | 'general';         // 通用技能
```

**2. Description（描述）**

描述部分要回答三个核心问题：这个 Skill 做什么？适用于什么场景？有什么特点？

**3. Triggers（触发条件）**

触发条件是 Skill 发现机制的核心——它定义了"什么样的用户输入应该激活这个 Skill"。

```typescript
/**
 * Trigger 规则的完整定义
 */
interface TriggerDefinition {
  /** 触发规则列表（OR 关系——任一匹配即触发） */
  rules: TriggerRule[];

  /** 否定规则列表（AND NOT 关系——任一匹配则排除） */
  excludeRules?: TriggerRule[];

  /** 优先级（多个 Skill 同时匹配时的排序依据，数字越大优先级越高） */
  priority?: number;
}

/**
 * 单条触发规则
 */
interface TriggerRule {
  /** 匹配类型 */
  type: 'keyword' | 'intent' | 'regex' | 'semantic' | 'context';

  /** 匹配模式（取决于 type） */
  pattern: string;

  /** 置信度阈值 (0.0 - 1.0) */
  confidence: number;
}

// 各类型触发规则说明
const TRIGGER_TYPE_GUIDE = {
  keyword: {
    description: '关键词匹配，支持 | 分隔的多个关键词',
    example: 'review PR|审查代码|code review',
    pros: '简单高效，零延迟',
    cons: '无法处理同义词和近义表达',
  },
  intent: {
    description: '意图分类，基于预训练的意图分类模型',
    example: 'code_review_intent',
    pros: '能理解多样化的表达方式',
    cons: '需要意图分类模型，有推理延迟',
  },
  regex: {
    description: '正则表达式匹配',
    example: 'PR\\s*#?\\d+|pull\\s*request\\s*\\d+',
    pros: '精确匹配结构化模式（如 PR 编号）',
    cons: '维护困难，容易过于严格或过于宽松',
  },
  semantic: {
    description: '语义相似度匹配，基于 embedding 向量',
    example: '帮我检查代码质量（向量化后与技能描述计算余弦相似度）',
    pros: '能处理完全未见过的表达方式',
    cons: '需要 embedding 模型，有延迟和计算成本',
  },
  context: {
    description: '上下文条件匹配，基于当前会话的元信息',
    example: 'current_file.endsWith(".py") && git.hasStagedChanges()',
    pros: '可实现基于环境的智能触发',
    cons: '需要额外的上下文收集机制',
  },
};
```

**4. Instructions（执行指令）**

指令是 Skill 的核心内容——分步骤的操作指南。好的指令应该像"资深工程师写的操作手册"：

```typescript
/**
 * Instruction 设计的最佳实践
 */
interface InstructionDesignGuide {
  /** 每条指令应该包含 */
  mustHave: {
    stepNumber: '明确的步骤编号';
    action: '具体的操作动词（获取/执行/分析/输出）';
    tool: '使用的工具名称';
    command: '具体的命令或操作';
  };

  /** 可选但推荐的内容 */
  recommended: {
    condition: '条件分支（如果...则...）';
    errorHandling: '异常处理（如果执行失败，则...）';
    validation: '结果验证（确认...之后再继续）';
  };

  /** 应该避免的写法 */
  avoid: {
    vague: '"检查代码" — 太模糊，应指明检查什么、用什么工具';
    tooDetailed: '"按下 Ctrl+Shift+P" — 这是 GUI 操作，Agent 无法执行';
    assumption: '"打开浏览器" — 不应假设 Agent 有浏览器工具';
  };
}

/**
 * 将 Instruction 列表转换为结构化的执行计划
 */
interface ParsedInstruction {
  step: number;
  action: string;
  tool: string;
  command: string;
  conditions?: string[];
  errorHandling?: string;
  validation?: string;
}

function parseInstructions(raw: string[]): ParsedInstruction[] {
  return raw.map((instruction, index) => {
    // 解析步骤号
    const stepMatch = instruction.match(/^(\d+)\.\s*/);
    const step = stepMatch ? parseInt(stepMatch[1]) : index + 1;

    // 解析工具引用（反引号包裹的工具名）
    const toolMatch = instruction.match(/`(\w+)`/);
    const tool = toolMatch ? toolMatch[1] : 'unknown';

    // 解析命令（反引号包裹的命令）
    const cmdMatch = instruction.match(/`([^`]+)`/g);
    const command = cmdMatch ? cmdMatch[cmdMatch.length - 1].replace(/`/g, '') : '';

    // 解析条件
    const conditions: string[] = [];
    if (instruction.includes('如果') || instruction.includes('当')) {
      conditions.push(instruction);
    }

    return { step, action: instruction, tool, command, conditions };
  });
}
```

**5. Context Requirements（上下文需求）**

上下文需求定义了"执行此 Skill 前需要收集哪些信息"。这与第 5 章上下文工程中的 Select（选择）策略直接对应。

**6. Tool Dependencies（工具依赖）**

```typescript
/**
 * 工具依赖声明
 * 区分必需依赖和可选依赖
 */
interface ToolDependency {
  /** 工具名称 */
  name: string;
  /** 是否必需 */
  required: boolean;
  /** 用途说明 */
  purpose: string;
  /** 最低版本要求（可选） */
  minVersion?: string;
  /** 替代方案（当此工具不可用时） */
  fallback?: string;
}

// 示例：Code Review Skill 的工具依赖
const CODE_REVIEW_DEPS: ToolDependency[] = [
  {
    name: 'bash',
    required: true,
    purpose: '执行 gh CLI 命令和静态分析工具',
    fallback: undefined,  // bash 没有替代品
  },
  {
    name: 'read_file',
    required: true,
    purpose: '读取源代码文件以理解改动上下文',
    fallback: 'bash',  // 可用 bash cat 命令替代
  },
  {
    name: 'write_file',
    required: false,
    purpose: '保存审查报告到本地文件',
    fallback: 'bash',  // 可用 bash echo/tee 替代
  },
];
```

**7. Examples（示例）**

Few-shot 示例是 Skill 中最有价值的部分之一。研究表明，高质量的示例比冗长的指令更能帮助 LLM 理解预期行为。

**8. Guardrails（安全护栏）**

安全护栏使用 RFC 2119 的关键词（MUST, MUST NOT, SHOULD, SHOULD NOT, MAY）来定义约束的强度级别。

### 6.5.3.3 SkillManifest 接口与 SkillParser 实现

```typescript
/**
 * SkillManifest：SKILL.md 解析后的完整数据结构
 * 这是 Skill 系统内部使用的核心类型
 */
interface SkillManifest {
  /** 元数据（来自 YAML front matter） */
  metadata: SkillMetadata;

  /** 描述文本 */
  description: string;

  /** 触发规则 */
  triggers: TriggerDefinition;

  /** 执行指令 */
  instructions: ParsedInstruction[];

  /** 上下文需求 */
  contextRequirements: string[];

  /** 工具依赖 */
  toolDependencies: ToolDependency[];

  /** 示例 */
  examples: SkillExample[];

  /** 安全护栏 */
  guardrails: GuardrailRule[];

  /** 原始 Markdown 文本（用于直接注入到 Agent 上下文） */
  rawMarkdown: string;

  /** 解析时间戳 */
  parsedAt: Date;
}

interface GuardrailRule {
  level: 'MUST' | 'MUST_NOT' | 'SHOULD' | 'SHOULD_NOT' | 'MAY';
  description: string;
}

/**
 * SkillParser：将 SKILL.md 文件解析为 SkillManifest
 *
 * 解析流程：
 * 1. 提取 YAML front matter → metadata
 * 2. 按 ## 标题分割 Markdown → 各 section
 * 3. 解析每个 section 的内容 → 结构化数据
 */
class SkillParser {
  /**
   * 解析 SKILL.md 文件内容
   * @param markdown - SKILL.md 的完整文本
   * @returns 解析后的 SkillManifest
   * @throws SkillParseError 当必需字段缺失时
   */
  parse(markdown: string): SkillManifest {
    // 步骤 1：提取 YAML front matter
    const metadata = this.extractFrontMatter(markdown);

    // 步骤 2：按 ## 标题分割内容
    const sections = this.splitSections(markdown);

    // 步骤 3：解析各 section
    const description = sections.get('Description') || sections.get('描述') || '';
    const triggers = this.parseTriggers(
      sections.get('Triggers') || sections.get('触发条件') || ''
    );
    const instructions = this.parseInstructions(
      sections.get('Instructions') || sections.get('执行指令') || ''
    );
    const contextRequirements = this.parseList(
      sections.get('Context Requirements') || sections.get('上下文需求') || ''
    );
    const toolDependencies = this.parseToolDependencies(
      sections.get('Tool Dependencies') || sections.get('工具依赖') || ''
    );
    const examples = this.parseExamples(
      sections.get('Examples') || sections.get('示例') || ''
    );
    const guardrails = this.parseGuardrails(
      sections.get('Guardrails') || sections.get('安全护栏') || ''
    );

    // 步骤 4：验证必需字段
    this.validate(metadata, triggers, instructions);

    return {
      metadata,
      description,
      triggers,
      instructions,
      contextRequirements,
      toolDependencies,
      examples,
      guardrails,
      rawMarkdown: markdown,
      parsedAt: new Date(),
    };
  }

  /**
   * 提取 YAML front matter
   * 支持 --- 分隔的标准 YAML 前置块
   */
  private extractFrontMatter(markdown: string): SkillMetadata {
    const frontMatterMatch = markdown.match(
      /^---\n([\s\S]*?)\n---/
    );

    if (!frontMatterMatch) {
      throw new SkillParseError(
        'SKILL.md 必须包含 YAML front matter（以 --- 开头和结尾）'
      );
    }

    const yamlContent = frontMatterMatch[1];
    // 简单的 YAML 解析（生产环境建议使用 yaml 库）
    const metadata: Record<string, unknown> = {};

    for (const line of yamlContent.split('\n')) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        // 处理数组值：[tag1, tag2, tag3]
        if (value.startsWith('[') && value.endsWith(']')) {
          metadata[key] = value
            .slice(1, -1)
            .split(',')
            .map(s => s.trim());
        } else {
          metadata[key] = value.trim();
        }
      }
    }

    return {
      name: metadata.name as string || 'unnamed-skill',
      version: metadata.version as string || '0.1.0',
      author: metadata.author as string || 'unknown',
      description: metadata.description as string || '',
      category: (metadata.category as SkillCategory) || 'general',
      tags: (metadata.tags as string[]) || [],
    };
  }

  /**
   * 按 ## 标题分割 Markdown 内容为 section map
   */
  private splitSections(markdown: string): Map<string, string> {
    const sections = new Map<string, string>();
    // 移除 front matter
    const content = markdown.replace(/^---\n[\s\S]*?\n---\n/, '');

    // 按 ## 分割（不包括 # 一级标题）
    const sectionRegex = /^## (.+)$/gm;
    const titles: Array<{ title: string; index: number }> = [];

    let match: RegExpExecArray | null;
    while ((match = sectionRegex.exec(content)) !== null) {
      titles.push({ title: match[1].trim(), index: match.index });
    }

    for (let i = 0; i < titles.length; i++) {
      const start = titles[i].index + titles[i].title.length + 4; // "## " + title + "\n"
      const end = i < titles.length - 1 ? titles[i + 1].index : content.length;
      sections.set(titles[i].title, content.slice(start, end).trim());
    }

    return sections;
  }

  /**
   * 解析 Triggers section
   */
  private parseTriggers(content: string): TriggerDefinition {
    const rules: TriggerRule[] = [];

    // 解析 Markdown 列表项
    const lines = content.split('\n').filter(l => l.startsWith('- '));

    for (const line of lines) {
      const text = line.slice(2).trim();

      // 尝试识别触发类型
      if (text.includes('正则') || text.includes('regex')) {
        const regexMatch = text.match(/`([^`]+)`/);
        if (regexMatch) {
          rules.push({ type: 'regex', pattern: regexMatch[1], confidence: 0.8 });
        }
      } else {
        // 默认为关键词触发
        // 提取引号或关键词
        const keywords = text.match(/"([^"]+)"/g)?.map(k => k.replace(/"/g, ''));
        if (keywords && keywords.length > 0) {
          rules.push({
            type: 'keyword',
            pattern: keywords.join('|'),
            confidence: 0.9,
          });
        } else {
          // 整行作为语义匹配模式
          rules.push({
            type: 'semantic',
            pattern: text,
            confidence: 0.7,
          });
        }
      }
    }

    return { rules };
  }

  /**
   * 解析 Instructions section
   */
  private parseInstructions(content: string): ParsedInstruction[] {
    const lines = content.split('\n').filter(l => /^\d+\./.test(l.trim()));
    return parseInstructions(lines.map(l => l.trim()));
  }

  /**
   * 解析 Markdown 无序列表
   */
  private parseList(content: string): string[] {
    return content
      .split('\n')
      .filter(l => l.startsWith('- '))
      .map(l => l.slice(2).trim());
  }

  /**
   * 解析工具依赖
   */
  private parseToolDependencies(content: string): ToolDependency[] {
    const lines = content.split('\n').filter(l => l.startsWith('- '));
    return lines.map(line => {
      const text = line.slice(2).trim();
      const nameMatch = text.match(/^(\w+)/);
      const required = text.includes('必需') || text.includes('required');
      const purposeMatch = text.match(/[:：]\s*(.+)$/);

      return {
        name: nameMatch ? nameMatch[1] : 'unknown',
        required,
        purpose: purposeMatch ? purposeMatch[1] : text,
      };
    });
  }

  /**
   * 解析 Examples section
   */
  private parseExamples(content: string): SkillExample[] {
    const examples: SkillExample[] = [];

    // 按 ### 分割子示例
    const exampleBlocks = content.split(/^### /m).filter(Boolean);

    for (const block of exampleBlocks) {
      const userInputMatch = block.match(
        /\*\*用户输入\*\*[:：]\s*(.+)/
      );
      const behaviorMatch = block.match(
        /\*\*Agent 行为\*\*[:：]?\s*([\s\S]*?)(?=\n\n|\n###|$)/
      );

      if (userInputMatch) {
        examples.push({
          userInput: userInputMatch[1].trim(),
          expectedBehavior: behaviorMatch
            ? behaviorMatch[1].trim()
            : '',
          toolSequence: [],
        });
      }
    }

    return examples;
  }

  /**
   * 解析 Guardrails section
   */
  private parseGuardrails(content: string): GuardrailRule[] {
    const lines = content.split('\n').filter(l => l.startsWith('- '));
    return lines.map(line => {
      const text = line.slice(2).trim();

      // 识别 RFC 2119 关键词
      let level: GuardrailRule['level'] = 'SHOULD';
      if (text.startsWith('MUST NOT') || text.startsWith('禁止')) {
        level = 'MUST_NOT';
      } else if (text.startsWith('MUST') || text.startsWith('必须')) {
        level = 'MUST';
      } else if (text.startsWith('SHOULD NOT') || text.startsWith('不应')) {
        level = 'SHOULD_NOT';
      } else if (text.startsWith('MAY') || text.startsWith('可以')) {
        level = 'MAY';
      }

      return { level, description: text };
    });
  }

  /**
   * 验证解析结果的完整性
   */
  private validate(
    metadata: SkillMetadata,
    triggers: TriggerDefinition,
    instructions: ParsedInstruction[],
  ): void {
    const errors: string[] = [];

    if (!metadata.name) {
      errors.push('缺少必需字段: metadata.name');
    }
    if (!metadata.version) {
      errors.push('缺少必需字段: metadata.version');
    }
    if (triggers.rules.length === 0) {
      errors.push('至少需要一条触发规则');
    }
    if (instructions.length === 0) {
      errors.push('至少需要一条执行指令');
    }

    if (errors.length > 0) {
      throw new SkillParseError(
        `SKILL.md 验证失败:\n${errors.map(e => `  - ${e}`).join('\n')}`
      );
    }
  }
}

class SkillParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillParseError';
  }
}
```

### 6.5.3.4 编写有效 SKILL.md 的最佳实践

> **设计决策：为什么 SKILL.md 强调"写给 LLM 看"而非"写给人看"？**
>
> SKILL.md 的首要读者是 LLM，而非人类开发者（尽管人类可读性也很重要）。这意味着：
> - 用**具体的工具名和命令**代替抽象的描述
> - 用**步骤化的指令**代替段落式的解释
> - 用**示例**代替概念性的说明
> - 用**RFC 2119 关键词**明确约束的强度

```typescript
/**
 * SKILL.md 质量评估器
 * 自动检查 SKILL.md 是否遵循最佳实践
 */
class SkillQualityAssessor {
  /**
   * 评估 SKILL.md 的质量分数（0-100）
   */
  assess(manifest: SkillManifest): SkillQualityReport {
    const scores: Record<string, number> = {};

    // 维度 1：触发覆盖度（是否有多种触发方式）
    scores['triggerCoverage'] = this.assessTriggerCoverage(manifest.triggers);

    // 维度 2：指令明确性（指令是否具体、可执行）
    scores['instructionClarity'] = this.assessInstructionClarity(manifest.instructions);

    // 维度 3：示例丰富度（是否有足够多的 few-shot 示例）
    scores['exampleRichness'] = this.assessExampleRichness(manifest.examples);

    // 维度 4：护栏完整性（安全约束是否充分）
    scores['guardrailCompleteness'] = this.assessGuardrails(manifest.guardrails);

    // 维度 5：工具依赖清晰度
    scores['dependencyClarity'] = this.assessDependencyClarity(manifest.toolDependencies);

    // 维度 6：Token 效率（在信息密度和简洁性之间取平衡）
    scores['tokenEfficiency'] = this.assessTokenEfficiency(manifest.rawMarkdown);

    const totalScore = Math.round(
      Object.values(scores).reduce((sum, s) => sum + s, 0) / Object.keys(scores).length
    );

    return {
      totalScore,
      dimensionScores: scores,
      suggestions: this.generateSuggestions(scores, manifest),
      grade: totalScore >= 90 ? 'A' : totalScore >= 75 ? 'B' :
             totalScore >= 60 ? 'C' : totalScore >= 40 ? 'D' : 'F',
    };
  }

  private assessTriggerCoverage(triggers: TriggerDefinition): number {
    const types = new Set(triggers.rules.map(r => r.type));
    // 覆盖 2+ 种触发类型得满分
    if (types.size >= 3) return 100;
    if (types.size >= 2) return 80;
    if (types.size >= 1 && triggers.rules.length >= 3) return 70;
    return 40;
  }

  private assessInstructionClarity(instructions: ParsedInstruction[]): number {
    if (instructions.length === 0) return 0;
    let score = 0;
    for (const inst of instructions) {
      // 有明确的工具引用 +20
      if (inst.tool !== 'unknown') score += 20;
      // 有具体命令 +20
      if (inst.command) score += 20;
      // 有条件分支 +10
      if (inst.conditions && inst.conditions.length > 0) score += 10;
    }
    return Math.min(100, Math.round(score / instructions.length));
  }

  private assessExampleRichness(examples: SkillExample[]): number {
    if (examples.length === 0) return 0;
    if (examples.length >= 3) return 100;
    if (examples.length >= 2) return 75;
    return 50;
  }

  private assessGuardrails(guardrails: GuardrailRule[]): number {
    if (guardrails.length === 0) return 20; // 没有护栏扣分严重
    const hasMust = guardrails.some(g => g.level === 'MUST' || g.level === 'MUST_NOT');
    const hasShould = guardrails.some(g => g.level === 'SHOULD' || g.level === 'SHOULD_NOT');
    let score = guardrails.length * 15;
    if (hasMust) score += 20;
    if (hasShould) score += 10;
    return Math.min(100, score);
  }

  private assessDependencyClarity(deps: ToolDependency[]): number {
    if (deps.length === 0) return 30;
    let score = 0;
    for (const dep of deps) {
      if (dep.name) score += 15;
      if (dep.purpose) score += 15;
      if (dep.required !== undefined) score += 10;
    }
    return Math.min(100, Math.round(score / deps.length));
  }

  private assessTokenEfficiency(rawMarkdown: string): number {
    // 理想的 SKILL.md 长度在 500-2000 token 之间
    const estimatedTokens = Math.ceil(rawMarkdown.length / 3); // 粗略估算
    if (estimatedTokens >= 500 && estimatedTokens <= 2000) return 100;
    if (estimatedTokens < 500) return 60; // 太短，可能信息不足
    if (estimatedTokens <= 3000) return 80;
    return 50; // 太长，可能浪费 token
  }

  private generateSuggestions(
    scores: Record<string, number>,
    manifest: SkillManifest,
  ): string[] {
    const suggestions: string[] = [];
    if (scores['triggerCoverage'] < 70) {
      suggestions.push('建议增加更多触发方式（关键词 + 语义 + 正则的组合）');
    }
    if (scores['instructionClarity'] < 70) {
      suggestions.push('指令应包含具体的工具名称和命令，避免模糊描述');
    }
    if (scores['exampleRichness'] < 70) {
      suggestions.push('建议至少提供 2-3 个 few-shot 示例');
    }
    if (scores['guardrailCompleteness'] < 50) {
      suggestions.push('缺少安全护栏，建议至少添加 MUST NOT 类约束');
    }
    if (manifest.instructions.length > 10) {
      suggestions.push('指令步骤过多（>10），考虑拆分为多个子 Skill');
    }
    return suggestions;
  }
}

interface SkillQualityReport {
  totalScore: number;
  dimensionScores: Record<string, number>;
  suggestions: string[];
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}
```

---

## 6.5.4 Skill 加载与发现机制

### 6.5.4.1 SkillLoader：多源技能加载

Skill 可以来自多种来源：本地文件系统、远程 Registry、内联定义、甚至由 Agent 在运行时动态生成。`SkillLoader` 提供了统一的加载接口：

```typescript
/**
 * SkillLoader：统一的 Skill 加载器
 * 支持文件系统、远程 Registry、内联定义三种来源
 */
class SkillLoader {
  private readonly parser = new SkillParser();
  private readonly cache = new Map<string, CachedSkill>();
  private readonly cacheTTL: number; // 缓存过期时间（ms）

  constructor(options: { cacheTTL?: number } = {}) {
    this.cacheTTL = options.cacheTTL || 5 * 60 * 1000; // 默认 5 分钟
  }

  /**
   * 从文件系统加载 Skill
   * 扫描指定目录下的所有 SKILL.md 文件
   */
  async loadFromFilesystem(skillsDir: string): Promise<SkillManifest[]> {
    const skills: SkillManifest[] = [];

    // 递归扫描目录
    const entries = await this.scanDirectory(skillsDir);

    for (const entry of entries) {
      if (entry.endsWith('SKILL.md') || entry.endsWith('skill.md')) {
        try {
          const content = await this.readFile(entry);
          const manifest = this.parser.parse(content);

          // 设置文件来源信息
          (manifest as SkillManifestWithSource).source = {
            type: 'filesystem',
            path: entry,
            loadedAt: new Date(),
          };

          skills.push(manifest);
        } catch (error) {
          console.error(`加载 Skill 失败: ${entry}`, error);
        }
      }
    }

    return skills;
  }

  /**
   * 从远程 Registry 加载 Skill
   * 支持 HTTP/HTTPS 端点
   */
  async loadFromRegistry(
    registryUrl: string,
    filter?: SkillFilter,
  ): Promise<SkillManifest[]> {
    const cacheKey = `registry:${registryUrl}:${JSON.stringify(filter)}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const queryParams = new URLSearchParams();
    if (filter?.category) queryParams.set('category', filter.category);
    if (filter?.tags) queryParams.set('tags', filter.tags.join(','));
    if (filter?.minVersion) queryParams.set('minVersion', filter.minVersion);

    const response = await fetch(
      `${registryUrl}/skills?${queryParams.toString()}`
    );

    if (!response.ok) {
      throw new Error(`Registry 请求失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { skills: Array<{ markdown: string }> };
    const skills = data.skills.map(s => this.parser.parse(s.markdown));

    this.setCache(cacheKey, skills);
    return skills;
  }

  /**
   * 从内联 Markdown 字符串加载 Skill
   * 适用于动态生成的 Skill 或测试场景
   */
  loadFromInline(markdown: string): SkillManifest {
    return this.parser.parse(markdown);
  }

  /**
   * 统一加载入口：同时从多个来源加载并去重
   */
  async loadAll(sources: SkillSource[]): Promise<SkillManifest[]> {
    const allSkills: SkillManifest[] = [];

    for (const source of sources) {
      switch (source.type) {
        case 'filesystem':
          allSkills.push(...await this.loadFromFilesystem(source.path!));
          break;
        case 'registry':
          allSkills.push(...await this.loadFromRegistry(source.url!, source.filter));
          break;
        case 'inline':
          allSkills.push(this.loadFromInline(source.markdown!));
          break;
      }
    }

    // 去重：同名 Skill 保留版本号最高的
    return this.deduplicateSkills(allSkills);
  }

  /**
   * 去重逻辑：同名 Skill 保留最新版本
   */
  private deduplicateSkills(skills: SkillManifest[]): SkillManifest[] {
    const byName = new Map<string, SkillManifest>();

    for (const skill of skills) {
      const existing = byName.get(skill.metadata.name);
      if (!existing || this.isNewerVersion(skill.metadata.version, existing.metadata.version)) {
        byName.set(skill.metadata.name, skill);
      }
    }

    return Array.from(byName.values());
  }

  /**
   * 简化版语义化版本比较
   */
  private isNewerVersion(a: string, b: string): boolean {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) > (pb[i] || 0)) return true;
      if ((pa[i] || 0) < (pb[i] || 0)) return false;
    }
    return false;
  }

  // ===== 缓存管理 =====

  private getFromCache(key: string): SkillManifest[] | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.skills;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache(key: string, skills: SkillManifest[]): void {
    this.cache.set(key, { skills, timestamp: Date.now() });
  }

  // ===== 文件系统操作（抽象，可替换为 Node.js fs 模块） =====

  private async scanDirectory(dir: string): Promise<string[]> {
    // 实际实现使用 fs.readdir + recursive
    // 这里提供接口签名
    const { readdir } = await import('fs/promises');
    const { join } = await import('path');

    const entries: string[] = [];
    const items = await readdir(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = join(dir, item.name);
      if (item.isDirectory()) {
        entries.push(...await this.scanDirectory(fullPath));
      } else if (item.isFile()) {
        entries.push(fullPath);
      }
    }

    return entries;
  }

  private async readFile(path: string): Promise<string> {
    const { readFile } = await import('fs/promises');
    return readFile(path, 'utf-8');
  }
}

interface SkillFilter {
  category?: string;
  tags?: string[];
  minVersion?: string;
}

interface SkillSource {
  type: 'filesystem' | 'registry' | 'inline';
  path?: string;
  url?: string;
  markdown?: string;
  filter?: SkillFilter;
}

interface CachedSkill {
  skills: SkillManifest[];
  timestamp: number;
}

interface SkillManifestWithSource extends SkillManifest {
  source: {
    type: 'filesystem' | 'registry' | 'inline';
    path?: string;
    url?: string;
    loadedAt: Date;
  };
}
```

### 6.5.4.2 SkillRegistry：技能注册中心

```typescript
/**
 * SkillRegistry：技能注册中心
 * 管理所有已加载的 Skill，提供查询和索引功能
 */
class SkillRegistry {
  /** 主存储：name → SkillManifest */
  private readonly skills = new Map<string, SkillManifest>();

  /** 分类索引：category → skill names */
  private readonly categoryIndex = new Map<string, Set<string>>();

  /** 标签索引：tag → skill names */
  private readonly tagIndex = new Map<string, Set<string>>();

  /** 触发词索引：keyword → skill names */
  private readonly triggerIndex = new Map<string, Set<string>>();

  /** 注册事件监听器 */
  private readonly listeners: RegistryEventListener[] = [];

  /**
   * 注册一个 Skill
   * 自动建立索引和触发通知
   */
  register(manifest: SkillManifest): void {
    const name = manifest.metadata.name;

    // 检查是否为更新
    const existing = this.skills.get(name);
    const eventType = existing ? 'updated' : 'registered';

    // 如果已有旧版本，先清理索引
    if (existing) {
      this.removeFromIndices(existing);
    }

    // 存储 Skill
    this.skills.set(name, manifest);

    // 建立索引
    this.buildIndices(manifest);

    // 触发事件
    this.emit({ type: eventType, skillName: name, timestamp: new Date() });
  }

  /**
   * 批量注册
   */
  registerAll(manifests: SkillManifest[]): void {
    for (const manifest of manifests) {
      this.register(manifest);
    }
  }

  /**
   * 注销一个 Skill
   */
  unregister(name: string): boolean {
    const manifest = this.skills.get(name);
    if (!manifest) return false;

    this.removeFromIndices(manifest);
    this.skills.delete(name);
    this.emit({ type: 'unregistered', skillName: name, timestamp: new Date() });
    return true;
  }

  /**
   * 按名称获取 Skill
   */
  get(name: string): SkillManifest | undefined {
    return this.skills.get(name);
  }

  /**
   * 获取所有已注册的 Skill
   */
  getAll(): SkillManifest[] {
    return Array.from(this.skills.values());
  }

  /**
   * 按分类查询
   */
  getByCategory(category: string): SkillManifest[] {
    const names = this.categoryIndex.get(category);
    if (!names) return [];
    return Array.from(names)
      .map(n => this.skills.get(n)!)
      .filter(Boolean);
  }

  /**
   * 按标签查询
   */
  getByTag(tag: string): SkillManifest[] {
    const names = this.tagIndex.get(tag);
    if (!names) return [];
    return Array.from(names)
      .map(n => this.skills.get(n)!)
      .filter(Boolean);
  }

  /**
   * 按触发关键词快速查找候选 Skill
   * 这是 SkillMatcher 的底层支撑
   */
  findByTriggerKeyword(keyword: string): SkillManifest[] {
    const matchedNames = new Set<string>();
    const lowerKeyword = keyword.toLowerCase();

    for (const [triggerWord, names] of this.triggerIndex) {
      if (lowerKeyword.includes(triggerWord) || triggerWord.includes(lowerKeyword)) {
        for (const name of names) {
          matchedNames.add(name);
        }
      }
    }

    return Array.from(matchedNames)
      .map(n => this.skills.get(n)!)
      .filter(Boolean);
  }

  /**
   * 获取注册统计信息
   */
  getStats(): RegistryStats {
    return {
      totalSkills: this.skills.size,
      byCategory: Object.fromEntries(
        Array.from(this.categoryIndex.entries())
.map(([cat, names]) => [cat, names.size])
      ),
      totalTriggers: this.triggerIndex.size,
      totalTags: this.tagIndex.size,
    };
  }

  // ===== 索引管理 =====

  private buildIndices(manifest: SkillManifest): void {
    const name = manifest.metadata.name;

    // 分类索引
    const cat = manifest.metadata.category;
    if (!this.categoryIndex.has(cat)) {
      this.categoryIndex.set(cat, new Set());
    }
    this.categoryIndex.get(cat)!.add(name);

    // 标签索引
    for (const tag of manifest.metadata.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(name);
    }

    // 触发词索引
    for (const rule of manifest.triggers.rules) {
      if (rule.type === 'keyword') {
        const keywords = rule.pattern.split('|');
        for (const kw of keywords) {
          const normalizedKw = kw.trim().toLowerCase();
          if (!this.triggerIndex.has(normalizedKw)) {
            this.triggerIndex.set(normalizedKw, new Set());
          }
          this.triggerIndex.get(normalizedKw)!.add(name);
        }
      }
    }
  }

  private removeFromIndices(manifest: SkillManifest): void {
    const name = manifest.metadata.name;

    // 从分类索引移除
    this.categoryIndex.get(manifest.metadata.category)?.delete(name);

    // 从标签索引移除
    for (const tag of manifest.metadata.tags) {
      this.tagIndex.get(tag)?.delete(name);
    }

    // 从触发词索引移除
    for (const [, names] of this.triggerIndex) {
      names.delete(name);
    }
  }

  // ===== 事件系统 =====

  onEvent(listener: RegistryEventListener): void {
    this.listeners.push(listener);
  }

  private emit(event: RegistryEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

interface RegistryEvent {
  type: 'registered' | 'updated' | 'unregistered';
  skillName: string;
  timestamp: Date;
}

type RegistryEventListener = (event: RegistryEvent) => void;

interface RegistryStats {
  totalSkills: number;
  byCategory: Record<string, number>;
  totalTriggers: number;
  totalTags: number;
}
```

### 6.5.4.3 SkillMatcher：意图匹配引擎

SkillMatcher 是 Skill 发现机制的核心——它接收用户输入，返回最匹配的 Skill。

```typescript
/**
 * SkillMatcher：基于多策略的 Skill 匹配引擎
 *
 * 匹配流程（优先级从高到低）：
 * 1. 精确关键词匹配（最快）
 * 2. 正则表达式匹配
 * 3. 语义相似度匹配（最慢但最灵活）
 * 4. 上下文条件匹配
 *
 * 多个策略的结果会进行加权融合，返回排序后的候选列表
 */
class SkillMatcher {
  private readonly registry: SkillRegistry;
  private readonly embeddingProvider?: EmbeddingProvider;

  /** 各策略的权重配置 */
  private readonly weights: MatchWeights = {
    keyword: 0.35,    // 关键词匹配权重
    regex: 0.25,      // 正则匹配权重
    semantic: 0.30,   // 语义匹配权重
    context: 0.10,    // 上下文匹配权重
  };

  constructor(
    registry: SkillRegistry,
    embeddingProvider?: EmbeddingProvider,
  ) {
    this.registry = registry;
    this.embeddingProvider = embeddingProvider;
  }

  /**
   * 匹配用户输入，返回排序后的候选 Skill 列表
   * @param userInput - 用户输入文本
   * @param context - 当前会话上下文（可选）
   * @returns 按匹配分数排序的候选列表
   */
  async match(
    userInput: string,
    context?: MatchContext,
  ): Promise<SkillMatchResult[]> {
    const candidates: Map<string, SkillMatchScore> = new Map();
    const allSkills = this.registry.getAll();

    // 策略 1：关键词匹配（同步，最快）
    for (const skill of allSkills) {
      const keywordScore = this.matchKeyword(userInput, skill);
      if (keywordScore > 0) {
        this.mergeScore(candidates, skill.metadata.name, 'keyword', keywordScore);
      }
    }

    // 策略 2：正则匹配（同步）
    for (const skill of allSkills) {
      const regexScore = this.matchRegex(userInput, skill);
      if (regexScore > 0) {
        this.mergeScore(candidates, skill.metadata.name, 'regex', regexScore);
      }
    }

    // 策略 3：语义匹配（异步，需要 embedding）
    if (this.embeddingProvider) {
      const semanticScores = await this.matchSemantic(userInput, allSkills);
      for (const [skillName, score] of semanticScores) {
        this.mergeScore(candidates, skillName, 'semantic', score);
      }
    }

    // 策略 4：上下文匹配（可选）
    if (context) {
      for (const skill of allSkills) {
        const contextScore = this.matchContext(context, skill);
        if (contextScore > 0) {
          this.mergeScore(candidates, skill.metadata.name, 'context', contextScore);
        }
      }
    }

    // 计算加权总分并排序
    const results: SkillMatchResult[] = Array.from(candidates.entries())
      .map(([skillName, scores]) => {
        const totalScore =
          (scores.keyword || 0) * this.weights.keyword +
          (scores.regex || 0) * this.weights.regex +
          (scores.semantic || 0) * this.weights.semantic +
          (scores.context || 0) * this.weights.context;

        return {
          skillName,
          skill: this.registry.get(skillName)!,
          totalScore,
          breakdown: scores,
        };
      })
      .filter(r => r.totalScore > 0.3)  // 过滤低分候选
      .sort((a, b) => b.totalScore - a.totalScore);

    return results;
  }

  /**
   * 快速匹配：仅使用关键词和正则，适用于低延迟场景
   */
  matchSync(userInput: string): SkillMatchResult[] {
    const candidates: Map<string, SkillMatchScore> = new Map();
    const allSkills = this.registry.getAll();

    for (const skill of allSkills) {
      const keywordScore = this.matchKeyword(userInput, skill);
      const regexScore = this.matchRegex(userInput, skill);

      if (keywordScore > 0) {
        this.mergeScore(candidates, skill.metadata.name, 'keyword', keywordScore);
      }
      if (regexScore > 0) {
        this.mergeScore(candidates, skill.metadata.name, 'regex', regexScore);
      }
    }

    return Array.from(candidates.entries())
      .map(([skillName, scores]) => ({
        skillName,
        skill: this.registry.get(skillName)!,
        totalScore: (scores.keyword || 0) * 0.6 + (scores.regex || 0) * 0.4,
        breakdown: scores,
      }))
      .filter(r => r.totalScore > 0.3)
      .sort((a, b) => b.totalScore - a.totalScore);
  }

  // ===== 匹配策略实现 =====

  /**
   * 关键词匹配
   */
  private matchKeyword(input: string, skill: SkillManifest): number {
    const lowerInput = input.toLowerCase();
    let bestScore = 0;

    for (const rule of skill.triggers.rules) {
      if (rule.type !== 'keyword') continue;

      const keywords = rule.pattern.split('|').map(k => k.trim().toLowerCase());
      for (const keyword of keywords) {
        if (lowerInput.includes(keyword)) {
          // 关键词越长、与输入的覆盖率越高，分数越高
          const coverage = keyword.length / lowerInput.length;
          const score = Math.min(1.0, rule.confidence * (0.5 + coverage * 0.5));
          bestScore = Math.max(bestScore, score);
        }
      }
    }

    return bestScore;
  }

  /**
   * 正则匹配
   */
  private matchRegex(input: string, skill: SkillManifest): number {
    for (const rule of skill.triggers.rules) {
      if (rule.type !== 'regex') continue;

      try {
        const regex = new RegExp(rule.pattern, 'i');
        if (regex.test(input)) {
          return rule.confidence;
        }
      } catch {
        // 正则无效，跳过
      }
    }

    return 0;
  }

  /**
   * 语义匹配：基于 embedding 向量的余弦相似度
   */
  private async matchSemantic(
    input: string,
    skills: SkillManifest[],
  ): Promise<Map<string, number>> {
    const results = new Map<string, number>();

    if (!this.embeddingProvider) return results;

    // 获取用户输入的 embedding
    const inputEmbedding = await this.embeddingProvider.embed(input);

    // 对每个 Skill 的描述和语义触发器计算相似度
    for (const skill of skills) {
      const skillText = [
        skill.description,
        ...skill.triggers.rules
          .filter(r => r.type === 'semantic')
          .map(r => r.pattern),
      ].join(' ');

      const skillEmbedding = await this.embeddingProvider.embed(skillText);
      const similarity = this.cosineSimilarity(inputEmbedding, skillEmbedding);

      if (similarity > 0.5) {
        results.set(skill.metadata.name, similarity);
      }
    }

    return results;
  }

  /**
   * 上下文匹配：基于当前会话状态
   */
  private matchContext(context: MatchContext, skill: SkillManifest): number {
    let score = 0;

    for (const rule of skill.triggers.rules) {
      if (rule.type !== 'context') continue;

      // 简单的上下文条件评估
      // 生产环境应使用更完善的表达式求值器
      if (rule.pattern.includes('current_file') && context.currentFile) {
        score = Math.max(score, rule.confidence);
      }
      if (rule.pattern.includes('git') && context.gitStatus) {
        score = Math.max(score, rule.confidence);
      }
    }

    return score;
  }

  // ===== 辅助方法 =====

  private mergeScore(
    candidates: Map<string, SkillMatchScore>,
    skillName: string,
    strategy: keyof MatchWeights,
    score: number,
  ): void {
    if (!candidates.has(skillName)) {
      candidates.set(skillName, {});
    }
    const existing = candidates.get(skillName)!;
    existing[strategy] = Math.max(existing[strategy] || 0, score);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}

interface MatchWeights {
  keyword: number;
  regex: number;
  semantic: number;
  context: number;
}

interface SkillMatchScore {
  keyword?: number;
  regex?: number;
  semantic?: number;
  context?: number;
}

interface SkillMatchResult {
  skillName: string;
  skill: SkillManifest;
  totalScore: number;
  breakdown: SkillMatchScore;
}

interface MatchContext {
  currentFile?: string;
  gitStatus?: string;
  recentTools?: string[];
  conversationHistory?: string[];
}

interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}
```

### 6.5.4.4 SkillInjector：将 Skill 注入 Agent 上下文

SkillInjector 是连接 Skill 系统和 Agent 运行时的桥梁——它将匹配到的 Skill 转换为 Agent 可以理解的上下文信息。

```typescript
/**
 * SkillInjector：将 Skill 注入 Agent 上下文
 *
 * 注入策略：
 * 1. 全量注入：将 SKILL.md 完整内容注入 System Prompt（适用于重要场景）
 * 2. 精简注入：仅注入 Instructions 和 Guardrails（适用于 token 敏感场景）
 * 3. 引用注入：注入 Skill 摘要 + 按需展开（适用于多 Skill 并存场景）
 */
class SkillInjector {
  /** 最大允许注入的 token 数（保护 context window） */
  private readonly maxInjectionTokens: number;

  constructor(options: { maxInjectionTokens?: number } = {}) {
    this.maxInjectionTokens = options.maxInjectionTokens || 4000;
  }

  /**
   * 根据匹配结果生成注入内容
   * @param matchResults - SkillMatcher 返回的匹配结果
   * @param strategy - 注入策略
   * @returns 格式化后的注入文本
   */
  inject(
    matchResults: SkillMatchResult[],
    strategy: InjectionStrategy = 'adaptive',
  ): InjectionResult {
    if (matchResults.length === 0) {
      return { content: '', tokenEstimate: 0, injectedSkills: [] };
    }

    // 根据策略选择注入方式
    switch (strategy) {
      case 'full':
        return this.injectFull(matchResults);
      case 'compact':
        return this.injectCompact(matchResults);
      case 'reference':
        return this.injectReference(matchResults);
      case 'adaptive':
      default:
        return this.injectAdaptive(matchResults);
    }
  }

  /**
   * 全量注入：适用于单个高匹配度 Skill
   */
  private injectFull(results: SkillMatchResult[]): InjectionResult {
    // 仅注入最匹配的 Skill 的完整内容
    const topSkill = results[0];
    const content = this.formatFullSkill(topSkill.skill);
    const tokenEstimate = this.estimateTokens(content);

    return {
      content,
      tokenEstimate,
      injectedSkills: [topSkill.skillName],
    };
  }

  /**
   * 精简注入：仅包含 Instructions 和 Guardrails
   */
  private injectCompact(results: SkillMatchResult[]): InjectionResult {
    const parts: string[] = ['<active-skills>'];
    const injectedSkills: string[] = [];
    let totalTokens = 0;

    for (const result of results) {
      const compact = this.formatCompactSkill(result.skill);
      const tokens = this.estimateTokens(compact);

      if (totalTokens + tokens > this.maxInjectionTokens) break;

      parts.push(compact);
      injectedSkills.push(result.skillName);
      totalTokens += tokens;
    }

    parts.push('</active-skills>');
    const content = parts.join('\n\n');

    return { content, tokenEstimate: totalTokens, injectedSkills };
  }

  /**
   * 引用注入：摘要形式，节省 token
   */
  private injectReference(results: SkillMatchResult[]): InjectionResult {
    const parts: string[] = [
      '<active-skills>',
      '以下技能已激活，请按照对应的指令执行：\n',
    ];
    const injectedSkills: string[] = [];

    for (const result of results.slice(0, 3)) {
      const skill = result.skill;
      parts.push(`### ${skill.metadata.name} (v${skill.metadata.version})`);
      parts.push(`${skill.description}\n`);
      parts.push('**执行步骤：**');
      for (const inst of skill.instructions) {
        parts.push(`${inst.step}. ${inst.action}`);
      }
      if (skill.guardrails.length > 0) {
        parts.push('\n**约束：**');
        for (const guard of skill.guardrails) {
          parts.push(`- [${guard.level}] ${guard.description}`);
        }
      }
      parts.push('');
      injectedSkills.push(result.skillName);
    }

    parts.push('</active-skills>');
    const content = parts.join('\n');
    const tokenEstimate = this.estimateTokens(content);

    return { content, tokenEstimate, injectedSkills };
  }

  /**
   * 自适应注入：根据匹配结果和 token 预算自动选择最优策略
   */
  private injectAdaptive(results: SkillMatchResult[]): InjectionResult {
    // 规则 1：只有一个高分匹配 → 全量注入
    if (results.length === 1 && results[0].totalScore > 0.8) {
      const fullResult = this.injectFull(results);
      if (fullResult.tokenEstimate <= this.maxInjectionTokens) {
        return fullResult;
      }
    }

    // 规则 2：多个候选但 token 充足 → 精简注入
    const compactResult = this.injectCompact(results);
    if (compactResult.tokenEstimate <= this.maxInjectionTokens) {
      return compactResult;
    }

    // 规则 3：token 紧张 → 引用注入
    return this.injectReference(results);
  }

  // ===== 格式化方法 =====

  private formatFullSkill(skill: SkillManifest): string {
    return [
      '<active-skill>',
      `# ${skill.metadata.name} (v${skill.metadata.version})`,
      '',
      skill.rawMarkdown.replace(/^---\n[\s\S]*?\n---\n/, ''), // 移除 front matter
      '</active-skill>',
    ].join('\n');
  }

  private formatCompactSkill(skill: SkillManifest): string {
    const parts: string[] = [
      `<skill name="${skill.metadata.name}">`,
      `**描述**: ${skill.description}\n`,
      '**执行步骤：**',
    ];

    for (const inst of skill.instructions) {
      parts.push(`${inst.step}. ${inst.action}`);
    }

    if (skill.guardrails.length > 0) {
      parts.push('\n**约束：**');
      for (const guard of skill.guardrails) {
        parts.push(`- [${guard.level}] ${guard.description}`);
      }
    }

    if (skill.examples.length > 0) {
      parts.push('\n**示例：**');
      parts.push(`用户: ${skill.examples[0].userInput}`);
      parts.push(`行为: ${skill.examples[0].expectedBehavior}`);
    }

    parts.push('</skill>');
    return parts.join('\n');
  }

  private estimateTokens(text: string): number {
    // 与第 5 章和第 6 章保持一致的双语估算逻辑
    const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const other = text.length - chinese;
    return Math.ceil(chinese / 1.5 + other / 4);
  }
}

type InjectionStrategy = 'full' | 'compact' | 'reference' | 'adaptive';

interface InjectionResult {
  content: string;
  tokenEstimate: number;
  injectedSkills: string[];
}
```



---

## 6.5.5 Skill 与 MCP 的协同架构

### 6.5.5.1 Skill-MCP Bridge 模式

Skill 和 MCP 并非替代关系，而是协同关系。Skill 提供"知识和决策"，MCP 提供"执行能力"。`SkillMCPBridge` 是连接这两层的核心组件。

```
┌─────────────────────────────────────────────────────────┐
│                    用户意图（User Intent）                │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│               SkillMatcher（技能匹配器）                  │
│         基于关键词/语义/上下文匹配最佳 Skill               │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│               SkillInjector（技能注入器）                  │
│         将 Skill 指令注入 Agent 上下文                     │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│                   LLM 推理引擎                            │
│      根据注入的 Skill 指令，规划工具调用序列                 │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│            SkillMCPBridge（Skill-MCP 桥接器）              │
│       将 Skill 指令中的工具引用解析为 MCP 工具调用           │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│              MCP Client（MCP 客户端）                     │
│          执行具体的工具调用，返回结果                        │
│     （见第 6 章 6.4 节 MCP 深度集成）                      │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│             结果处理与格式化                               │
│       根据 Skill 要求格式化输出，检查护栏约束               │
└──────────────────────────────────────────────────────────┘
```

```typescript
/**
 * SkillMCPBridge：Skill 与 MCP 的桥接层
 *
 * 职责：
 * 1. 将 Skill 的工具依赖解析为具体的 MCP Server + Tool
 * 2. 管理 Skill 执行过程中的工具调用序列
 * 3. 处理工具调用结果并反馈给 Skill 执行流程
 * 4. 检查 Guardrail 约束
 */
class SkillMCPBridge {
  /** MCP 客户端管理器（来自第 6 章） */
  private readonly mcpManager: MCPClientManager;

  /** 工具名到 MCP Server 的映射 */
  private readonly toolServerMap: Map<string, string>;

  /** Guardrail 检查器 */
  private readonly guardrailChecker: GuardrailChecker;

  constructor(
    mcpManager: MCPClientManager,
    guardrailChecker?: GuardrailChecker,
  ) {
    this.mcpManager = mcpManager;
    this.toolServerMap = new Map();
    this.guardrailChecker = guardrailChecker || new DefaultGuardrailChecker();
  }

  /**
   * 初始化：发现所有 MCP Server 提供的工具并建立映射
   */
  async initialize(): Promise<void> {
    const servers = this.mcpManager.getConnectedServers();

    for (const server of servers) {
      const tools = await this.mcpManager.listTools(server.name);
      for (const tool of tools) {
        this.toolServerMap.set(tool.name, server.name);
      }
    }

    console.log(
      `SkillMCPBridge 初始化完成: 发现 ${this.toolServerMap.size} 个工具，` +
      `来自 ${servers.length} 个 MCP Server`
    );
  }

  /**
   * 执行 Skill：协调 Skill 指令和 MCP 工具调用
   *
   * @param skill - 要执行的 Skill
   * @param userInput - 用户原始输入
   * @param agentContext - Agent 上下文
   * @returns 执行结果
   */
  async executeSkill(
    skill: SkillManifest,
    userInput: string,
    agentContext: AgentContext,
  ): Promise<SkillExecutionResult> {
    const startTime = Date.now();
    const stepResults: StepExecutionResult[] = [];
    let overallStatus: 'success' | 'partial' | 'failed' = 'success';

    // 步骤 0：检查工具依赖是否满足
    const depCheck = this.checkDependencies(skill);
    if (!depCheck.satisfied) {
      return {
        skillName: skill.metadata.name,
        status: 'failed',
        error: `工具依赖不满足: ${depCheck.missing.join(', ')}`,
        stepResults: [],
        durationMs: Date.now() - startTime,
      };
    }

    // 步骤 1：逐条执行 Skill 指令
    for (const instruction of skill.instructions) {
      const stepStart = Date.now();

      try {
        // 解析指令中的工具调用
        const toolCall = this.resolveToolCall(instruction, userInput, agentContext);

        if (toolCall) {
          // 执行前：检查 Guardrail
          const guardResult = this.guardrailChecker.check(
            skill.guardrails,
            toolCall,
          );
          if (!guardResult.allowed) {
            stepResults.push({
              step: instruction.step,
              status: 'blocked',
              reason: guardResult.reason,
              durationMs: Date.now() - stepStart,
            });
            overallStatus = 'partial';
            continue;
          }

          // 执行 MCP 工具调用
          const serverName = this.toolServerMap.get(toolCall.toolName);
          if (!serverName) {
            // 如果工具名是 bash，直接映射到 bash MCP Server
            // 这是最常见的场景
            stepResults.push({
              step: instruction.step,
              status: 'skipped',
              reason: `工具 ${toolCall.toolName} 未找到对应的 MCP Server`,
              durationMs: Date.now() - stepStart,
            });
            continue;
          }

          const result = await this.mcpManager.callTool(
            serverName,
            toolCall.toolName,
            toolCall.arguments,
          );

          stepResults.push({
            step: instruction.step,
            status: result.isError ? 'error' : 'success',
            toolName: toolCall.toolName,
            result: result.content,
            durationMs: Date.now() - stepStart,
          });

          if (result.isError) {
            overallStatus = 'partial';
          }

          // 将结果存入上下文，供后续步骤使用
          agentContext.stepResults = agentContext.stepResults || {};
          agentContext.stepResults[`step_${instruction.step}`] = result.content;
        } else {
          // 纯知识/推理步骤，无需工具调用
          stepResults.push({
            step: instruction.step,
            status: 'success',
            reason: '纯指令步骤，无需工具调用',
            durationMs: Date.now() - stepStart,
          });
        }
      } catch (error) {
        stepResults.push({
          step: instruction.step,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - stepStart,
        });
        overallStatus = 'partial';
      }
    }

    // 判断最终状态
    const failedSteps = stepResults.filter(
      r => r.status === 'error' || r.status === 'blocked'
    );
    if (failedSteps.length === stepResults.length) {
      overallStatus = 'failed';
    }

    return {
      skillName: skill.metadata.name,
      status: overallStatus,
      stepResults,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * 检查 Skill 的工具依赖是否都已连接
   */
  private checkDependencies(skill: SkillManifest): DependencyCheckResult {
    const missing: string[] = [];

    for (const dep of skill.toolDependencies) {
      if (dep.required && !this.toolServerMap.has(dep.name)) {
        // bash 通常作为内置工具存在
        if (dep.name !== 'bash' && dep.name !== 'read_file' &&
            dep.name !== 'write_file' && dep.name !== 'edit_file') {
          missing.push(dep.name);
        }
      }
    }

    return { satisfied: missing.length === 0, missing };
  }

  /**
   * 从 Skill 指令中解析工具调用信息
   */
  private resolveToolCall(
    instruction: ParsedInstruction,
    userInput: string,
    context: AgentContext,
  ): ResolvedToolCall | null {
    // 如果指令中有明确的工具引用
    if (instruction.tool && instruction.tool !== 'unknown') {
      return {
        toolName: instruction.tool,
        arguments: this.resolveArguments(instruction.command, userInput, context),
      };
    }
    return null;
  }

  /**
   * 解析工具调用参数
   * 将指令中的占位符替换为实际值
   */
  private resolveArguments(
    command: string,
    userInput: string,
    context: AgentContext,
  ): Record<string, unknown> {
    // 简单的占位符替换
    let resolved = command;

    // 替换 <number> 占位符（如 PR 编号）
    const numberMatch = userInput.match(/#?(\d+)/);
    if (numberMatch) {
      resolved = resolved.replace('<number>', numberMatch[1]);
    }

    // 替换 <file> 占位符
    if (context.currentFile) {
      resolved = resolved.replace('<file>', context.currentFile);
    }

    return { command: resolved };
  }
}

// ===== 辅助类型和接口 =====

interface MCPClientManager {
  getConnectedServers(): Array<{ name: string }>;
  listTools(serverName: string): Promise<MCPToolDefinition[]>;
  callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolCallResponse>;
}

interface AgentContext {
  currentFile?: string;
  workingDirectory?: string;
  conversationHistory?: string[];
  stepResults?: Record<string, unknown>;
}

interface MCPToolCallResponse {
  content: unknown;
  isError: boolean;
}

interface SkillExecutionResult {
  skillName: string;
  status: 'success' | 'partial' | 'failed';
  error?: string;
  stepResults: StepExecutionResult[];
  durationMs: number;
}

interface StepExecutionResult {
  step: number;
  status: 'success' | 'error' | 'skipped' | 'blocked';
  toolName?: string;
  result?: unknown;
  reason?: string;
  error?: string;
  durationMs: number;
}

interface DependencyCheckResult {
  satisfied: boolean;
  missing: string[];
}

interface ResolvedToolCall {
  toolName: string;
  arguments: Record<string, unknown>;
}

/**
 * Guardrail 检查器接口
 */
interface GuardrailChecker {
  check(
    rules: GuardrailRule[],
    toolCall: ResolvedToolCall,
  ): { allowed: boolean; reason?: string };
}

class DefaultGuardrailChecker implements GuardrailChecker {
  check(rules: GuardrailRule[], toolCall: ResolvedToolCall): {
    allowed: boolean;
    reason?: string;
  } {
    for (const rule of rules) {
      if (rule.level === 'MUST_NOT') {
        // 检查是否违反 MUST_NOT 约束
        // 例如：MUST_NOT 自动 approve PR
        if (this.violatesMustNot(rule, toolCall)) {
          return { allowed: false, reason: rule.description };
        }
      }
    }
    return { allowed: true };
  }

  private violatesMustNot(rule: GuardrailRule, toolCall: ResolvedToolCall): boolean {
    const desc = rule.description.toLowerCase();
    const cmd = JSON.stringify(toolCall.arguments).toLowerCase();

    // 简单的关键词匹配检查
    if (desc.includes('approve') && cmd.includes('approve')) return true;
    if (desc.includes('merge') && cmd.includes('merge')) return true;
    if (desc.includes('delete') && cmd.includes('rm -rf')) return true;

    return false;
  }
}
```

### 6.5.5.2 三种协同模式

根据任务性质的不同，Skill 和 MCP 有三种协同模式：

| 模式 | 适用场景 | 示例 | 特点 |
|------|---------|------|------|
| **Skill Only** | 纯知识/指令任务 | 编码风格指南、架构决策建议 | 无需工具调用，Skill 直接指导 LLM 输出 |
| **MCP Only** | 简单确定性操作 | 读取文件、查询数据库 | 无需场景知识，直接调用工具即可 |
| **Skill + MCP** | 复杂工作流 | 代码审查、部署上线、故障排查 | Skill 提供决策知识，MCP 提供执行能力 |

```typescript
/**
 * 协同模式选择器
 * 自动判断应使用哪种模式
 */
class CollaborationModeSelector {
  /**
   * 根据 Skill 匹配结果和用户输入，决定使用哪种协同模式
   */
  selectMode(
    matchResults: SkillMatchResult[],
    userInput: string,
    availableTools: string[],
  ): CollaborationMode {
    const hasSkillMatch = matchResults.length > 0 && matchResults[0].totalScore > 0.5;
    const isSimpleToolCall = this.isSimpleToolRequest(userInput, availableTools);

    // 规则 1：高分 Skill 匹配且有工具依赖 → Skill + MCP
    if (hasSkillMatch && matchResults[0].skill.toolDependencies.length > 0) {
      return {
        mode: 'skill-mcp',
        skill: matchResults[0].skill,
        reason: `匹配到 Skill "${matchResults[0].skillName}" (分数: ${matchResults[0].totalScore.toFixed(2)})，需要工具执行`,
      };
    }

    // 规则 2：高分 Skill 匹配但无工具依赖 → Skill Only
    if (hasSkillMatch && matchResults[0].skill.toolDependencies.length === 0) {
      return {
        mode: 'skill-only',
        skill: matchResults[0].skill,
        reason: `匹配到纯知识 Skill "${matchResults[0].skillName}"，无需工具调用`,
      };
    }

    // 规则 3：简单工具调用请求 → MCP Only
    if (isSimpleToolCall) {
      return {
        mode: 'mcp-only',
        reason: '简单工具调用请求，直接使用 MCP',
      };
    }

    // 规则 4：没有匹配的 Skill → 回退到通用模式
    return {
      mode: 'mcp-only',
      reason: '未匹配到 Skill，使用通用工具调用模式',
    };
  }

  /**
   * 判断是否为简单的工具调用请求
   */
  private isSimpleToolRequest(input: string, tools: string[]): boolean {
    // 简单请求的特征：
    // 1. 输入短小（< 50 字符）
    // 2. 直接提到工具名或明确的操作动词
    if (input.length > 100) return false;

    const simplePatterns = [
      /^(读取|读|打开|查看|cat)\s+.+/,     // 读取文件
      /^(搜索|查找|grep|find)\s+.+/,       // 搜索
      /^(执行|运行|run)\s+.+/,             // 执行命令
      /^(列出|ls|list)\s+.+/,              // 列出
    ];

    return simplePatterns.some(p => p.test(input));
  }
}

interface CollaborationMode {
  mode: 'skill-only' | 'mcp-only' | 'skill-mcp';
  skill?: SkillManifest;
  reason: string;
}
```

---

## 6.5.6 Skill 生命周期管理

### 6.5.6.1 Skill 版本管理

Skill 采用语义化版本号（Semantic Versioning, semver），与 npm 包管理一致：

```typescript
/**
 * Skill 版本管理器
 * 遵循 semver 规范：MAJOR.MINOR.PATCH
 *
 * - MAJOR：破坏性变更（指令结构改变、触发规则不兼容）
 * - MINOR：向后兼容的新功能（新增指令步骤、新增触发规则）
 * - PATCH：向后兼容的修复（修正描述、优化指令措辞）
 */
class SkillVersionManager {
  /**
   * 检查两个版本是否兼容
   * @param required - 依赖方要求的版本范围（如 "^1.2.0"）
   * @param actual - 实际安装的版本（如 "1.3.1"）
   */
  isCompatible(required: string, actual: string): boolean {
    // 解析版本范围
    const range = this.parseRange(required);
    const version = this.parseVersion(actual);

    if (!range || !version) return false;

    switch (range.operator) {
      case '^': // 兼容同一 major 版本
        return version.major === range.version.major &&
          this.compareVersions(version, range.version) >= 0;
      case '~': // 兼容同一 minor 版本
        return version.major === range.version.major &&
          version.minor === range.version.minor &&
          version.patch >= range.version.patch;
      case '>=':
        return this.compareVersions(version, range.version) >= 0;
      case '=':
      default:
        return this.compareVersions(version, range.version) === 0;
    }
  }

  /**
   * 生成变更日志
   */
  generateChangelog(
    oldManifest: SkillManifest,
    newManifest: SkillManifest,
  ): SkillChangelog {
    const changes: ChangeEntry[] = [];

    // 比较触发规则
    const oldTriggers = new Set(oldManifest.triggers.rules.map(r => r.pattern));
    const newTriggers = new Set(newManifest.triggers.rules.map(r => r.pattern));

    for (const t of newTriggers) {
      if (!oldTriggers.has(t)) {
        changes.push({ type: 'added', category: 'trigger', description: `新增触发规则: ${t}` });
      }
    }
    for (const t of oldTriggers) {
      if (!newTriggers.has(t)) {
        changes.push({ type: 'removed', category: 'trigger', description: `移除触发规则: ${t}` });
      }
    }

    // 比较指令
    if (oldManifest.instructions.length !== newManifest.instructions.length) {
      changes.push({
        type: 'changed',
        category: 'instruction',
        description: `指令步骤从 ${oldManifest.instructions.length} 步变为 ${newManifest.instructions.length} 步`,
      });
    }

    // 比较工具依赖
    const oldDeps = new Set(oldManifest.toolDependencies.map(d => d.name));
    const newDeps = new Set(newManifest.toolDependencies.map(d => d.name));

    for (const d of newDeps) {
      if (!oldDeps.has(d)) {
        changes.push({ type: 'added', category: 'dependency', description: `新增工具依赖: ${d}` });
      }
    }

    // 建议版本号变更类型
    const hasBreaking = changes.some(
      c => c.type === 'removed' || (c.type === 'changed' && c.category === 'instruction')
    );
    const hasFeature = changes.some(c => c.type === 'added');

    const suggestedBump: 'major' | 'minor' | 'patch' =
      hasBreaking ? 'major' : hasFeature ? 'minor' : 'patch';

    return {
      fromVersion: oldManifest.metadata.version,
      toVersion: newManifest.metadata.version,
      suggestedBump,
      changes,
    };
  }

  private parseVersion(v: string): ParsedVersion | null {
    const match = v.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) return null;
    return {
      major: parseInt(match[1]),
      minor: parseInt(match[2]),
      patch: parseInt(match[3]),
    };
  }

  private parseRange(range: string): VersionRange | null {
    const match = range.match(/^(\^|~|>=|=)?(\d+\.\d+\.\d+)/);
    if (!match) return null;
    return {
      operator: (match[1] || '=') as VersionRange['operator'],
      version: this.parseVersion(match[2])!,
    };
  }

  private compareVersions(a: ParsedVersion, b: ParsedVersion): number {
    if (a.major !== b.major) return a.major - b.major;
    if (a.minor !== b.minor) return a.minor - b.minor;
    return a.patch - b.patch;
  }
}

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

interface VersionRange {
  operator: '^' | '~' | '>=' | '=';
  version: ParsedVersion;
}

interface ChangeEntry {
  type: 'added' | 'removed' | 'changed';
  category: 'trigger' | 'instruction' | 'dependency' | 'guardrail' | 'example';
  description: string;
}

interface SkillChangelog {
  fromVersion: string;
  toVersion: string;
  suggestedBump: 'major' | 'minor' | 'patch';
  changes: ChangeEntry[];
}
```

### 6.5.6.2 Skill 测试框架

```typescript
/**
 * SkillTestRunner：Skill 测试框架
 *
 * 支持三种测试类型：
 * 1. 触发测试（Trigger Tests）：验证用户输入是否正确触发 Skill
 * 2. 指令测试（Instruction Tests）：验证指令解析是否正确
 * 3. 集成测试（Integration Tests）：端到端执行验证
 */
class SkillTestRunner {
  private readonly matcher: SkillMatcher;
  private readonly parser: SkillParser;

  constructor(matcher: SkillMatcher, parser: SkillParser) {
    this.matcher = matcher;
    this.parser = parser;
  }

  /**
   * 运行完整的测试套件
   */
  async runTestSuite(testSuite: SkillTestSuite): Promise<TestSuiteResult> {
    const results: TestResult[] = [];
    let passed = 0;
    let failed = 0;

    for (const testCase of testSuite.testCases) {
      const result = await this.runTestCase(testCase);
      results.push(result);
      if (result.passed) passed++;
      else failed++;
    }

    return {
      suiteName: testSuite.name,
      totalTests: results.length,
      passed,
      failed,
      results,
      passRate: passed / results.length,
    };
  }

  /**
   * 运行单个测试用例
   */
  private async runTestCase(testCase: SkillTestCase): Promise<TestResult> {
    const startTime = Date.now();

    try {
      switch (testCase.type) {
        case 'trigger': {
          const matchResults = await this.matcher.match(testCase.input);
          const matched = matchResults.some(
            r => r.skillName === testCase.expectedSkill
          );
          const topMatch = matchResults[0];

          return {
            testName: testCase.name,
            type: 'trigger',
            passed: matched === testCase.shouldMatch,
            expected: testCase.shouldMatch
              ? `应匹配 ${testCase.expectedSkill}`
              : '不应匹配任何 Skill',
            actual: topMatch
              ? `匹配到 ${topMatch.skillName} (分数: ${topMatch.totalScore.toFixed(3)})`
              : '未匹配到任何 Skill',
            durationMs: Date.now() - startTime,
          };
        }

        case 'instruction': {
          const manifest = this.parser.parse(testCase.skillMarkdown!);
          const instruction = manifest.instructions[testCase.stepIndex!];

          return {
            testName: testCase.name,
            type: 'instruction',
            passed: instruction.tool === testCase.expectedTool,
            expected: `步骤 ${testCase.stepIndex} 使用工具 ${testCase.expectedTool}`,
            actual: `步骤 ${testCase.stepIndex} 使用工具 ${instruction.tool}`,
            durationMs: Date.now() - startTime,
          };
        }

        case 'integration': {
          // 集成测试需要完整的执行环境
          // 这里提供框架，具体实现依赖注入的 bridge
          return {
            testName: testCase.name,
            type: 'integration',
            passed: true,
            expected: testCase.expectedOutput || '',
            actual: '(集成测试需要运行环境)',
            durationMs: Date.now() - startTime,
          };
        }

        default:
          return {
            testName: testCase.name,
            type: 'unknown',
            passed: false,
            expected: '',
            actual: `未知测试类型: ${testCase.type}`,
            durationMs: Date.now() - startTime,
          };
      }
    } catch (error) {
      return {
        testName: testCase.name,
        type: testCase.type,
        passed: false,
        expected: '',
        actual: `异常: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * 生成测试报告
   */
  formatReport(result: TestSuiteResult): string {
    const lines: string[] = [
      `\n${'='.repeat(60)}`,
      `Skill 测试报告: ${result.suiteName}`,
      `${'='.repeat(60)}\n`,
      `总测试数: ${result.totalTests}`,
      `通过: ${result.passed}  失败: ${result.failed}`,
      `通过率: ${(result.passRate * 100).toFixed(1)}%\n`,
    ];

    for (const test of result.results) {
      const icon = test.passed ? '[PASS]' : '[FAIL]';
      lines.push(`${icon} ${test.testName} (${test.durationMs}ms)`);
      if (!test.passed) {
        lines.push(`  期望: ${test.expected}`);
        lines.push(`  实际: ${test.actual}`);
      }
    }

    lines.push(`\n${'='.repeat(60)}`);
    return lines.join('\n');
  }
}

interface SkillTestSuite {
  name: string;
  skillName: string;
  testCases: SkillTestCase[];
}

interface SkillTestCase {
  name: string;
  type: 'trigger' | 'instruction' | 'integration';
  input: string;
  expectedSkill?: string;
  shouldMatch?: boolean;
  skillMarkdown?: string;
  stepIndex?: number;
  expectedTool?: string;
  expectedOutput?: string;
}

interface TestResult {
  testName: string;
  type: string;
  passed: boolean;
  expected: string;
  actual: string;
  durationMs: number;
}

interface TestSuiteResult {
  suiteName: string;
  totalTests: number;
  passed: number;
  failed: number;
  results: TestResult[];
  passRate: number;
}
```

### 6.5.6.3 Skill 组合

```typescript
/**
 * SkillComposer：Skill 组合器
 * 将多个基础 Skill 组合成复杂的工作流 Skill
 */
class SkillComposer {
  private readonly registry: SkillRegistry;

  constructor(registry: SkillRegistry) {
    this.registry = registry;
  }

  /**
   * 组合多个 Skill 为一个复合 Skill
   *
   * @param name - 新 Skill 的名称
   * @param components - 组件 Skill 列表（按执行顺序）
   * @param options - 组合选项
   */
  compose(
    name: string,
    components: SkillComponentRef[],
    options: ComposeOptions = {},
  ): SkillManifest {
    // 解析所有组件 Skill
    const resolvedSkills = components.map(ref => {
      const skill = this.registry.get(ref.skillName);
      if (!skill) {
        throw new Error(`组件 Skill 不存在: ${ref.skillName}`);
      }
      return { ref, skill };
    });

    // 合并触发规则
    const mergedTriggers: TriggerDefinition = {
      rules: options.triggers?.rules || [
        {
          type: 'keyword' as const,
          pattern: name.replace(/-/g, ' '),
          confidence: 0.9,
        },
      ],
    };

    // 合并指令（按组件顺序串联）
    const mergedInstructions: ParsedInstruction[] = [];
    let stepCounter = 1;

    for (const { ref, skill } of resolvedSkills) {
      // 添加阶段标题
      mergedInstructions.push({
        step: stepCounter++,
        action: `## 阶段: ${ref.alias || skill.metadata.name}`,
        tool: 'none',
        command: '',
      });

      // 添加该 Skill 的所有指令
      for (const inst of skill.instructions) {
        mergedInstructions.push({
          ...inst,
          step: stepCounter++,
        });
      }

      // 如果有阶段间条件
      if (ref.condition) {
        mergedInstructions.push({
          step: stepCounter++,
          action: `检查条件: ${ref.condition}，如果不满足则跳过后续步骤`,
          tool: 'none',
          command: '',
        });
      }
    }

    // 合并工具依赖（去重）
    const toolDeps = new Map<string, ToolDependency>();
    for (const { skill } of resolvedSkills) {
      for (const dep of skill.toolDependencies) {
        if (!toolDeps.has(dep.name)) {
          toolDeps.set(dep.name, dep);
        }
      }
    }

    // 合并护栏规则（取所有组件的并集）
    const allGuardrails: GuardrailRule[] = [];
    for (const { skill } of resolvedSkills) {
      allGuardrails.push(...skill.guardrails);
    }
    // 去重
    const uniqueGuardrails = allGuardrails.filter(
      (g, i, arr) => arr.findIndex(x => x.description === g.description) === i
    );

    return {
      metadata: {
        name,
        version: options.version || '1.0.0',
        author: options.author || 'skill-composer',
        description: options.description ||
          `复合技能: ${resolvedSkills.map(s => s.skill.metadata.name).join(' → ')}`,
        category: options.category || 'general',
        tags: ['composite', ...resolvedSkills.map(s => s.skill.metadata.name)],
      },
      description: options.description || '',
      triggers: mergedTriggers,
      instructions: mergedInstructions,
      contextRequirements: resolvedSkills.flatMap(s => s.skill.contextRequirements),
      toolDependencies: Array.from(toolDeps.values()),
      examples: options.examples || [],
      guardrails: uniqueGuardrails,
      rawMarkdown: '', // 复合 Skill 的 rawMarkdown 由 serialize 方法生成
      parsedAt: new Date(),
    };
  }

  /**
   * 将 SkillManifest 序列化回 SKILL.md 格式
   */
  serialize(manifest: SkillManifest): string {
    const lines: string[] = [
      '---',
      `name: ${manifest.metadata.name}`,
      `version: ${manifest.metadata.version}`,
      `author: ${manifest.metadata.author}`,
      `description: ${manifest.metadata.description}`,
      `category: ${manifest.metadata.category}`,
      `tags: [${manifest.metadata.tags.join(', ')}]`,
      '---',
      '',
      `# ${manifest.metadata.name}`,
      '',
      '## Description',
      manifest.description,
      '',
      '## Triggers',
      ...manifest.triggers.rules.map(r => `- [${r.type}] ${r.pattern}`),
      '',
      '## Instructions',
      ...manifest.instructions.map(i => `${i.step}. ${i.action}`),
      '',
      '## Context Requirements',
      ...manifest.contextRequirements.map(c => `- ${c}`),
      '',
      '## Tool Dependencies',
      ...manifest.toolDependencies.map(d =>
        `- ${d.name}（${d.required ? '必需' : '可选'}）: ${d.purpose}`
      ),
      '',
      '## Guardrails',
      ...manifest.guardrails.map(g => `- ${g.level} ${g.description}`),
    ];

    return lines.join('\n');
  }
}

interface SkillComponentRef {
  /** 组件 Skill 名称 */
  skillName: string;
  /** 别名（在复合 Skill 中的阶段名） */
  alias?: string;
  /** 执行条件（前一阶段的结果满足条件时才执行） */
  condition?: string;
}

interface ComposeOptions {
  version?: string;
  author?: string;
  description?: string;
  category?: SkillCategory;
  triggers?: TriggerDefinition;
  examples?: SkillExample[];
}
```

---

## 6.5.7 实战：构建一个完整的 Skill 系统

### 6.5.7.1 场景定义

我们将构建一个端到端的 **Code Review Skill 系统**，完整演示从 SKILL.md 定义到实际执行的全流程。

### 6.5.7.2 步骤一：编写 SKILL.md

```markdown
---
name: comprehensive-code-review
version: 1.0.0
author: ai-agent-engineering
description: 对 GitHub Pull Request 进行全面的多维度代码审查
category: development
tags: [code-review, github, quality, security]
---

# Comprehensive Code Review

## Description
对 GitHub Pull Request 进行专业级的多维度代码审查。
涵盖代码正确性、安全性、性能、可维护性和测试覆盖五个核心维度。
支持 TypeScript、Python、Go、Java 等主流编程语言。

## Triggers
- 用户提到 "review PR"、"审查代码"、"code review"、"看看这个 PR"
- 用户分享了一个 GitHub PR 链接（如 https://github.com/org/repo/pull/42）
- 用户说 "这个 PR 有没有问题"、"帮我检查一下代码"
- 用户提到 PR 编号格式（如 "PR #42"、"#42"）

## Instructions
1. **获取 PR 基本信息**: 使用 `bash` 执行 `gh pr view <PR号> --json title,body,headRefName,baseRefName,additions,deletions,changedFiles`，了解 PR 的基本改动范围
2. **获取改动文件列表**: 使用 `bash` 执行 `gh pr diff <PR号> --name-only`，获取所有改动文件的路径
3. **评估改动规模**: 如果改动文件超过 20 个或改动行数超过 1000 行，告知用户建议分批审查，并请用户确认是否继续
4. **逐文件获取 diff**: 使用 `bash` 执行 `gh pr diff <PR号>` 获取完整的 diff 内容
5. **阅读关键文件上下文**: 对于核心改动文件，使用 `read_file` 读取完整文件内容，理解改动的上下文
6. **运行静态分析**: 使用 `bash` 执行项目的 lint 命令（如 `npm run lint` 或 `cargo clippy`），记录发现的问题
7. **运行类型检查**: 使用 `bash` 执行类型检查命令（如 `npx tsc --noEmit`），确认改动没有引入类型错误
8. **按维度分析并生成报告**: 按以下五个维度分析代码并输出结构化报告：
   - 正确性：逻辑错误、边界条件处理、空值检查、异常处理
   - 安全性：SQL 注入、XSS、敏感信息泄露、不安全的依赖
   - 性能：N+1 查询、内存泄漏、不必要的重复计算、大对象拷贝
   - 可维护性：命名规范、代码重复（DRY）、函数复杂度、注释质量
   - 测试覆盖：新增代码是否有对应测试、边界条件是否覆盖

## Context Requirements
- PR 编号或 GitHub PR URL（必需）
- 项目的编码规范文件路径（可选，如 .eslintrc、rustfmt.toml）
- 审查关注的重点领域（可选，如 "重点看安全性"）
- 项目的技术栈（可选，自动检测）

## Tool Dependencies
- bash（必需）: 执行 gh CLI 命令、静态分析和类型检查
- read_file（必需）: 读取源代码文件以理解改动上下文

## Examples

### Example 1: 基本 PR 审查
**用户输入**: 帮我 review 一下 PR #42
**Agent 行为**:
1. 执行 `gh pr view 42 --json title,body,additions,deletions,changedFiles`
2. 执行 `gh pr diff 42 --name-only` 获取文件列表
3. 执行 `gh pr diff 42` 获取完整 diff
4. 读取关键文件的完整内容
5. 运行 lint 和 type-check
6. 按五个维度输出审查报告

### Example 2: 聚焦安全审查
**用户输入**: 这个 PR 有安全问题吗？PR #88
**Agent 行为**:
1. 获取 PR diff
2. 重点扫描安全相关模式：
   - SQL 字符串拼接
   - eval() 或 Function() 调用
   - 用户输入直接用于文件路径
   - 硬编码的密钥或密码
   - HTTP（而非 HTTPS）请求
3. 输出安全专项审查报告

## Guardrails
- MUST NOT 自动 approve 或 merge PR，只提供审查意见
- MUST 对安全相关的问题标记为 Critical（严重）级别
- MUST 在审查意见中标明具体的文件名和行号
- SHOULD 当 PR 改动超过 500 行时，建议用户分批审查
- SHOULD NOT 对纯粹的代码风格偏好（如分号、缩进）给出严厉批评
- SHOULD 对每个发现的问题提供修复建议
```

### 6.5.7.3 步骤二至六：完整系统实现

```typescript
/**
 * 完整的 Code Review Skill 系统
 * 演示 Skill 从加载到执行的全流程
 */

// ===== 步骤 2：加载和注册 Skill =====

async function setupSkillSystem(): Promise<{
  registry: SkillRegistry;
  matcher: SkillMatcher;
  injector: SkillInjector;
}> {
  // 创建核心组件
  const loader = new SkillLoader({ cacheTTL: 10 * 60 * 1000 });
  const registry = new SkillRegistry();
  const matcher = new SkillMatcher(registry);
  const injector = new SkillInjector({ maxInjectionTokens: 4000 });

  // 从文件系统加载 Skill
  const skills = await loader.loadAll([
    { type: 'filesystem', path: './skills' },  // 本地 Skill 目录
  ]);

  // 注册到 Registry
  registry.registerAll(skills);

  console.log(`已加载 ${skills.length} 个 Skill:`);
  for (const skill of skills) {
    console.log(`  - ${skill.metadata.name} v${skill.metadata.version}`);
  }

  // 注册事件监听
  registry.onEvent((event) => {
    console.log(`[Registry] ${event.type}: ${event.skillName}`);
  });

  return { registry, matcher, injector };
}

// ===== 步骤 3-6：处理用户请求的完整流程 =====

async function handleUserRequest(
  userInput: string,
  system: {
    registry: SkillRegistry;
    matcher: SkillMatcher;
    injector: SkillInjector;
  },
): Promise<string> {
  console.log(`\n[用户输入] ${userInput}\n`);

  // 步骤 3：匹配用户意图到 Skill
  const matchResults = await system.matcher.match(userInput);

  if (matchResults.length === 0) {
    console.log('[匹配结果] 未匹配到任何 Skill，使用通用模式');
    return '未找到匹配的技能，将使用通用工具处理您的请求。';
  }

  const topMatch = matchResults[0];
  console.log(
    `[匹配结果] 最佳匹配: ${topMatch.skillName} ` +
    `(分数: ${topMatch.totalScore.toFixed(3)})`
  );
  console.log(
    `  分数明细: 关键词=${topMatch.breakdown.keyword?.toFixed(3) || '0'}, ` +
    `正则=${topMatch.breakdown.regex?.toFixed(3) || '0'}, ` +
    `语义=${topMatch.breakdown.semantic?.toFixed(3) || '0'}`
  );

  // 步骤 4：注入 Skill 指令到 Agent 上下文
  const injection = system.injector.inject(matchResults, 'adaptive');
  console.log(
    `[注入结果] 策略=adaptive, Token=${injection.tokenEstimate}, ` +
    `Skills=${injection.injectedSkills.join(', ')}`
  );

  // 步骤 5：构建完整的 Agent Prompt
  const agentPrompt = buildAgentPrompt(userInput, injection);
  console.log(`[Agent Prompt] 总长度: ${agentPrompt.length} 字符\n`);

  // 步骤 6：模拟 Agent 执行
  // 在实际系统中，这里会调用 LLM 并通过 SkillMCPBridge 执行工具调用
  return `[模拟执行] 已激活 Skill "${topMatch.skillName}"，` +
    `将按照 ${topMatch.skill.instructions.length} 个步骤执行代码审查。`;
}

/**
 * 构建包含 Skill 注入的完整 Agent Prompt
 */
function buildAgentPrompt(userInput: string, injection: InjectionResult): string {
  return [
    '<system>',
    '你是一个专业的 AI 编程助手。',
    '请根据以下激活的技能指令来处理用户的请求。',
    '',
    injection.content,
    '',
    '</system>',
    '',
    `<user>${userInput}</user>`,
  ].join('\n');
}

// ===== 运行演示 =====

async function demo(): Promise<void> {
  const system = await setupSkillSystem();

  // 测试不同的用户输入
  const testInputs = [
    '帮我 review 一下 PR #42',
    '这个 PR 有安全问题吗？ https://github.com/acme/app/pull/88',
    '看看 #156 的代码质量怎么样',
    '今天天气怎么样',  // 不应匹配任何 Skill
  ];

  for (const input of testInputs) {
    const result = await handleUserRequest(input, system);
    console.log(`[结果] ${result}\n${'─'.repeat(60)}`);
  }
}
```

---

## 6.5.8 Bash + 文件系统作为 Skill 的原生运行时

### 6.5.8.1 Bash：万能的 Skill 运行时

Claude Code 的一个深刻洞察是：**bash 是最强大的 Skill 运行时**。几乎所有的开发者工具（git、grep、awk、curl、docker、kubectl）都可以通过 bash 调用。这意味着一个 bash 工具就能替代数十个专用 MCP 工具。

```typescript
/**
 * BashSkillRuntime：基于 Bash 的 Skill 执行运行时
 *
 * 设计理念：
 * - Bash 是开发机器上的通用语言
 * - 一个 bash 工具 > 20 个专用工具（Token 效率更高）
 * - Skill 指令天然适合转换为 bash 命令序列
 */
class BashSkillRuntime {
  /** 命令执行超时（毫秒） */
  private readonly timeout: number;

  /** 工作目录 */
  private readonly workingDir: string;

  /** 安全沙箱模式 */
  private readonly sandboxed: boolean;

  /** 命令黑名单（安全防护） */
  private readonly bannedCommands: ReadonlySet<string> = new Set([
    'rm -rf /',
    'mkfs',
    'dd if=/dev/zero',
    ':(){:|:&};:',  // fork bomb
  ]);

  constructor(options: BashRuntimeOptions) {
    this.timeout = options.timeout || 30_000;
    this.workingDir = options.workingDir || process.cwd();
    this.sandboxed = options.sandboxed ?? true;
  }

  /**
   * 执行 Skill 指令序列
   * 将 Skill 的 Instructions 转换为 bash 命令并依次执行
   */
  async executeSkill(
    skill: SkillManifest,
    variables: Record<string, string>,
  ): Promise<BashSkillExecutionResult> {
    const results: BashStepResult[] = [];
    const startTime = Date.now();

    for (const instruction of skill.instructions) {
      // 将指令转换为 bash 命令
      const command = this.instructionToCommand(instruction, variables);

      if (!command) {
        results.push({
          step: instruction.step,
          command: '(无需 bash 执行的纯指令步骤)',
          status: 'skipped',
          stdout: '',
          stderr: '',
          exitCode: 0,
          durationMs: 0,
        });
        continue;
      }

      // 安全检查
      const safetyCheck = this.checkCommandSafety(command);
      if (!safetyCheck.safe) {
        results.push({
          step: instruction.step,
          command,
          status: 'blocked',
          stdout: '',
          stderr: `安全检查失败: ${safetyCheck.reason}`,
          exitCode: -1,
          durationMs: 0,
        });
        continue;
      }

      // 执行命令
      const result = await this.executeCommand(command);
      results.push({
        step: instruction.step,
        command,
        ...result,
      });

      // 存储步骤结果为变量，供后续步骤使用
      variables[`step_${instruction.step}_output`] = result.stdout;

      // 如果关键步骤失败，停止执行
      if (result.status === 'error' && instruction.tool !== 'unknown') {
        break;
      }
    }

    return {
      skillName: skill.metadata.name,
      totalSteps: skill.instructions.length,
      executedSteps: results.filter(r => r.status !== 'skipped').length,
      successfulSteps: results.filter(r => r.status === 'success').length,
      results,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * 将 Skill 指令转换为 bash 命令
   */
  private instructionToCommand(
    instruction: ParsedInstruction,
    variables: Record<string, string>,
  ): string | null {
    // 如果指令没有引用工具，返回 null（纯知识步骤）
    if (instruction.tool === 'none' || instruction.tool === 'unknown') {
      return null;
    }

    let command = instruction.command;

    // 替换变量
    for (const [key, value] of Object.entries(variables)) {
      command = command.replace(`<${key}>`, value);
      command = command.replace(`\${${key}}`, value);
    }

    return command;
  }

  /**
   * 命令安全检查
   */
  private checkCommandSafety(command: string): { safe: boolean; reason?: string } {
    // 检查命令黑名单
    for (const banned of this.bannedCommands) {
      if (command.includes(banned)) {
        return { safe: false, reason: `包含危险命令模式: ${banned}` };
      }
    }

    // 沙箱模式下的额外检查
    if (this.sandboxed) {
      // 禁止写入系统目录
      if (/\b(\/etc|\/usr|\/var|\/boot)\b/.test(command) &&
          /\b(write|mv|cp|rm|chmod|chown)\b/.test(command)) {
        return { safe: false, reason: '沙箱模式下禁止修改系统目录' };
      }

      // 禁止网络操作（除了 gh CLI 和 curl 到已知域名）
      if (/\b(nc|netcat|nmap|wget)\b/.test(command)) {
        return { safe: false, reason: '沙箱模式下禁止网络扫描工具' };
      }
    }

    return { safe: true };
  }

  /**
   * 执行单个 bash 命令
   */
  private async executeCommand(command: string): Promise<{
    status: 'success' | 'error';
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
  }> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const { exec } = require('child_process') as typeof import('child_process');

      const child = exec(command, {
        cwd: this.workingDir,
        timeout: this.timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB 输出上限
        env: {
          ...process.env,
          // 在 PATH 中确保 gh、git 等工具可用
          PATH: process.env.PATH,
        },
      }, (error, stdout, stderr) => {
        const durationMs = Date.now() - startTime;

        resolve({
          status: error ? 'error' : 'success',
          stdout: stdout.toString().trim(),
          stderr: stderr.toString().trim(),
          exitCode: error?.code || 0,
          durationMs,
        });
      });

      // 超时处理
      setTimeout(() => {
        child.kill('SIGKILL');
      }, this.timeout);
    });
  }
}

interface BashRuntimeOptions {
  timeout?: number;
  workingDir?: string;
  sandboxed?: boolean;
}

interface BashStepResult {
  step: number;
  command: string;
  status: 'success' | 'error' | 'skipped' | 'blocked';
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

interface BashSkillExecutionResult {
  skillName: string;
  totalSteps: number;
  executedSteps: number;
  successfulSteps: number;
  results: BashStepResult[];
  durationMs: number;
}
```

### 6.5.8.2 "grep 优于向量搜索" 的洞察

在代码仓库场景下，传统的文本搜索工具（grep、ripgrep、ag）往往比向量搜索更精确、更快速：

| 对比维度 | grep / ripgrep | 向量搜索（Embedding） |
|---------|---------------|---------------------|
| **延迟** | < 100ms（本地扫描） | 200-500ms（API 调用 + 检索） |
| **精确度** | 精确匹配，零误报 | 语义匹配，可能有不相关结果 |
| **成本** | 免费，无 API 费用 | 需要 Embedding API 费用 |
| **适用场景** | 函数名、变量名、import 语句、错误信息 | 概念搜索、文档检索、模糊查询 |
| **依赖** | 系统内置或轻量安装 | 需要向量数据库 + Embedding 模型 |
| **实时性** | 始终反映文件系统最新状态 | 需要重新索引才能反映最新变更 |

```typescript
/**
 * 运行时选择器：根据任务特征选择最优的执行运行时
 */
class RuntimeSelector {
  /**
   * 根据 Skill 特征推荐最优运行时
   */
  recommend(skill: SkillManifest, context: RuntimeContext): RuntimeRecommendation {
    const factors: Record<string, number> = {
      bash: 0,
      mcp: 0,
      api: 0,
    };

    // 因素 1：工具依赖类型
    for (const dep of skill.toolDependencies) {
      if (['bash', 'shell', 'terminal'].includes(dep.name)) {
        factors.bash += 3;
      } else if (dep.name.includes('api') || dep.name.includes('http')) {
        factors.api += 3;
      } else {
        factors.mcp += 2;
      }
    }

    // 因素 2：指令中的命令特征
    for (const inst of skill.instructions) {
      const action = inst.action.toLowerCase();
      if (action.includes('bash') || action.includes('执行') ||
          action.includes('grep') || action.includes('git')) {
        factors.bash += 2;
      }
      if (action.includes('api') || action.includes('请求') || action.includes('fetch')) {
        factors.api += 2;
      }
    }

    // 因素 3：运行环境
    if (context.hasLocalFilesystem) factors.bash += 2;
    if (context.hasNetwork) factors.api += 1;
    if (context.mcpServersAvailable > 0) factors.mcp += 1;

    // 选择得分最高的运行时
    const sorted = Object.entries(factors).sort((a, b) => b[1] - a[1]);
    const recommended = sorted[0][0] as 'bash' | 'mcp' | 'api';

    return {
      recommended,
      scores: factors,
      reason: this.generateReason(recommended, factors),
    };
  }

  private generateReason(
    recommended: string,
    scores: Record<string, number>,
  ): string {
    const reasons: Record<string, string> = {
      bash: 'Skill 依赖命令行工具，bash 运行时延迟最低、无额外依赖',
      mcp: 'Skill 需要专用 MCP Server 提供的能力（如数据库查询、云服务操作）',
      api: 'Skill 主要与远程 API 交互，API 运行时提供更好的网络管理',
    };
    return `推荐 ${recommended} 运行时 (得分: ${scores[recommended]})。` +
      `${reasons[recommended]}`;
  }
}

interface RuntimeContext {
  hasLocalFilesystem: boolean;
  hasNetwork: boolean;
  mcpServersAvailable: number;
}

interface RuntimeRecommendation {
  recommended: 'bash' | 'mcp' | 'api';
  scores: Record<string, number>;
  reason: string;
}
```

---

## 6.5.9 Skill 模式库：常见 Skill 设计模式

### 6.5.9.1 Pattern 1：Instruction Skill（纯指令技能）

**特征：** 无需任何工具调用，纯粹通过指令知识指导 LLM 输出。

**适用场景：** 写作风格指南、架构决策模板、沟通技巧指导。

```typescript
/**
 * Instruction Skill 模式实现
 * 最简单的 Skill 形态——纯知识注入，无工具依赖
 */
class InstructionSkill {
  /**
   * 创建一个纯指令 Skill
   * 常见于写作规范、回答模板等场景
   */
  static create(config: {
    name: string;
    description: string;
    triggers: string[];
    instructions: string[];
    guardrails?: string[];
  }): SkillManifest {
    return {
      metadata: {
        name: config.name,
        version: '1.0.0',
        author: 'instruction-skill-factory',
        description: config.description,
        category: 'general',
        tags: ['instruction-only', 'no-tools'],
      },
      description: config.description,
      triggers: {
        rules: config.triggers.map(t => ({
          type: 'keyword' as const,
          pattern: t,
          confidence: 0.85,
        })),
      },
      instructions: config.instructions.map((inst, i) => ({
        step: i + 1,
        action: inst,
        tool: 'none',
        command: '',
      })),
      contextRequirements: [],
      toolDependencies: [],  // 关键：无工具依赖
      examples: [],
      guardrails: (config.guardrails || []).map(g => ({
        level: 'SHOULD' as const,
        description: g,
      })),
      rawMarkdown: '',
      parsedAt: new Date(),
    };
  }
}

// 示例：创建一个"技术博客写作指南"Skill
const TECH_BLOG_SKILL = InstructionSkill.create({
  name: 'tech-blog-writing-guide',
  description: '指导 AI 按照高质量技术博客的标准写作',
  triggers: ['写博客', '写文章', 'blog post', '技术文章'],
  instructions: [
    '1. 标题应简洁有力，包含核心技术关键词，长度不超过 20 个字',
    '2. 开篇用一个真实的问题或场景吸引读者（"你是否遇到过..."）',
    '3. 正文采用"问题 → 分析 → 方案 → 代码 → 总结"的结构',
    '4. 每个代码块必须有注释说明其作用',
    '5. 使用类比和生活化例子解释抽象概念',
    '6. 每隔 3-4 段插入一个小标题，保持阅读节奏',
    '7. 结尾提供"延伸阅读"链接和"下一步行动"建议',
    '8. 全文控制在 2000-3000 字，阅读时间约 8-12 分钟',
  ],
  guardrails: [
    '不要使用 "众所周知"、"不言而喻" 等假设读者知识水平的表达',
    '代码示例必须可以直接运行，不允许伪代码',
    '避免过度使用感叹号和夸张修辞',
  ],
});
```

### 6.5.9.2 Pattern 2：Tool Orchestration Skill（工具编排技能）

**特征：** 协调多个工具按特定顺序和逻辑执行。

**适用场景：** 部署上线、环境配置、数据迁移。

```typescript
/**
 * Tool Orchestration Skill 模式
 * 核心是定义工具之间的依赖关系和执行顺序
 */
class ToolOrchestrationSkill {
  /**
   * 创建一个工具编排 Skill
   */
  static create(config: {
    name: string;
    description: string;
    triggers: string[];
    stages: OrchestrationStage[];
    rollback?: OrchestrationStage[];
    guardrails?: string[];
  }): SkillManifest {
    // 将 stages 转换为 Instructions
    const instructions: ParsedInstruction[] = [];
    let step = 1;

    for (const stage of config.stages) {
      instructions.push({
        step: step++,
        action: `[阶段: ${stage.name}] ${stage.description}`,
        tool: stage.tool,
        command: stage.command,
        conditions: stage.condition ? [stage.condition] : undefined,
      });
    }

    // 添加回滚指令
    if (config.rollback) {
      instructions.push({
        step: step++,
        action: '--- 以下为回滚步骤（仅在上述步骤失败时执行） ---',
        tool: 'none',
        command: '',
      });

      for (const stage of config.rollback) {
        instructions.push({
          step: step++,
          action: `[回滚: ${stage.name}] ${stage.description}`,
          tool: stage.tool,
          command: stage.command,
        });
      }
    }

    // 收集工具依赖
    const tools = new Set<string>();
    for (const stage of [...config.stages, ...(config.rollback || [])]) {
      if (stage.tool && stage.tool !== 'none') {
        tools.add(stage.tool);
      }
    }

    return {
      metadata: {
        name: config.name,
        version: '1.0.0',
        author: 'orchestration-skill-factory',
        description: config.description,
        category: 'devops',
        tags: ['orchestration', 'multi-tool'],
      },
      description: config.description,
      triggers: {
        rules: config.triggers.map(t => ({
          type: 'keyword' as const,
          pattern: t,
          confidence: 0.9,
        })),
      },
      instructions,
      contextRequirements: [],
      toolDependencies: Array.from(tools).map(t => ({
        name: t,
        required: true,
        purpose: `由编排阶段引用`,
      })),
      examples: [],
      guardrails: (config.guardrails || []).map(g => ({
        level: 'MUST' as const,
        description: g,
      })),
      rawMarkdown: '',
      parsedAt: new Date(),
    };
  }
}

interface OrchestrationStage {
  name: string;
  description: string;
  tool: string;
  command: string;
  condition?: string;
}

// 示例：创建 "Production Deploy" Skill
const DEPLOY_SKILL = ToolOrchestrationSkill.create({
  name: 'production-deploy',
  description: '安全地将应用部署到生产环境',
  triggers: ['部署到生产', 'deploy to production', '上线', 'ship it'],
  stages: [
    {
      name: '代码检查',
      description: '确保当前分支通过所有检查',
      tool: 'bash',
      command: 'git status && npm test && npm run lint',
    },
    {
      name: '构建镜像',
      description: '构建 Docker 镜像并打标签',
      tool: 'bash',
      command: 'docker build -t app:${VERSION} .',
    },
    {
      name: '推送镜像',
      description: '推送到容器仓库',
      tool: 'bash',
      command: 'docker push registry.example.com/app:${VERSION}',
    },
    {
      name: '灰度部署',
      description: '先部署 10% 的流量到新版本',
      tool: 'bash',
      command: 'kubectl set image deployment/app app=registry.example.com/app:${VERSION} --namespace=production',
      condition: '前一步骤成功',
    },
    {
      name: '健康检查',
      description: '等待 60 秒后检查新版本健康状态',
      tool: 'bash',
      command: 'sleep 60 && curl -f https://app.example.com/health',
    },
  ],
  rollback: [
    {
      name: '回滚部署',
      description: '回滚到上一个稳定版本',
      tool: 'bash',
      command: 'kubectl rollout undo deployment/app --namespace=production',
    },
  ],
  guardrails: [
    'MUST 在部署前确认所有测试通过',
    'MUST NOT 在周五下午 4 点后执行生产部署',
    'MUST 在部署后检查健康状态',
  ],
});
```

### 6.5.9.3 Pattern 3：Retrieval Skill（检索增强技能）

**特征：** 结合知识检索和工具调用，先获取相关信息再处理。

```typescript
/**
 * Retrieval Skill 模式
 * 先检索相关知识，再基于检索结果执行操作
 */
class RetrievalSkill {
  static create(config: {
    name: string;
    description: string;
    triggers: string[];
    retrievalStrategy: 'grep' | 'semantic' | 'hybrid';
    searchPatterns: string[];
    processingInstructions: string[];
  }): SkillManifest {
    const retrievalInstructions: ParsedInstruction[] = [];
    let step = 1;

    // 添加检索步骤
    switch (config.retrievalStrategy) {
      case 'grep':
        retrievalInstructions.push({
          step: step++,
          action: '使用 ripgrep 在代码仓库中搜索相关文件和代码段',
          tool: 'bash',
          command: config.searchPatterns
            .map(p => `rg "${p}" --type-add "code:*.{ts,js,py,go}" --type code -l`)
            .join(' && '),
        });
        break;

      case 'semantic':
        retrievalInstructions.push({
          step: step++,
          action: '使用语义搜索获取最相关的代码文件和文档',
          tool: 'bash',
          command: 'echo "语义搜索需要通过 embedding API 执行"',
        });
        break;

      case 'hybrid':
        retrievalInstructions.push({
          step: step++,
          action: '先用 grep 精确搜索关键符号，再用语义搜索补充上下文',
          tool: 'bash',
          command: config.searchPatterns
            .map(p => `rg "${p}" --context 5`)
            .join(' && '),
        });
        break;
    }

    // 添加处理步骤
    for (const proc of config.processingInstructions) {
      retrievalInstructions.push({
        step: step++,
        action: proc,
        tool: 'none',
        command: '',
      });
    }

    return {
      metadata: {
        name: config.name,
        version: '1.0.0',
        author: 'retrieval-skill-factory',
        description: config.description,
        category: 'development',
        tags: ['retrieval', 'search', config.retrievalStrategy],
      },
      description: config.description,
      triggers: {
        rules: config.triggers.map(t => ({
          type: 'keyword' as const,
          pattern: t,
          confidence: 0.85,
        })),
      },
      instructions: retrievalInstructions,
      contextRequirements: ['搜索查询或问题描述'],
      toolDependencies: [
        { name: 'bash', required: true, purpose: '执行搜索命令' },
        { name: 'read_file', required: true, purpose: '读取检索到的文件' },
      ],
      examples: [],
      guardrails: [],
      rawMarkdown: '',
      parsedAt: new Date(),
    };
  }
}

// 示例：创建 "代码库问答" Skill
const CODEBASE_QA_SKILL = RetrievalSkill.create({
  name: 'codebase-qa',
  description: '基于代码库内容回答开发者的技术问题',
  triggers: ['这个函数做什么', '找一下', '搜索代码', '代码在哪里'],
  retrievalStrategy: 'hybrid',
  searchPatterns: ['function', 'class', 'interface', 'export'],
  processingInstructions: [
    '阅读检索到的代码文件，理解其功能和上下文',
    '结合代码注释和类型定义，生成准确的回答',
    '如果涉及多个文件，说明它们之间的关系',
    '如果代码有改进空间，额外提供优化建议',
  ],
});
```

### 6.5.9.4 Pattern 4：Guard Skill（守护技能）

**特征：** 作为安全检查层，在其他 Skill 执行前/后运行。

```typescript
/**
 * Guard Skill 模式
 * 用于安全检查、合规审查、质量门禁
 */
class GuardSkill {
  static create(config: {
    name: string;
    description: string;
    checkPhase: 'pre-execution' | 'post-execution' | 'both';
    checks: SecurityCheck[];
    blockOnFailure: boolean;
  }): SkillManifest {
    const instructions: ParsedInstruction[] = [];
    let step = 1;

    for (const check of config.checks) {
      instructions.push({
        step: step++,
        action: `[${check.severity}] ${check.description}: 使用 \`${check.tool}\` 执行 \`${check.command}\``,
        tool: check.tool,
        command: check.command,
      });
    }

    // 添加汇总步骤
    instructions.push({
      step: step++,
      action: config.blockOnFailure
        ? '如果任何 CRITICAL 检查失败，立即停止并报告，不允许继续执行后续操作'
        : '汇总所有检查结果，以警告形式报告但不阻止执行',
      tool: 'none',
      command: '',
    });

    return {
      metadata: {
        name: config.name,
        version: '1.0.0',
        author: 'guard-skill-factory',
        description: config.description,
        category: 'security',
        tags: ['guard', 'security', config.checkPhase],
      },
      description: config.description,
      triggers: { rules: [] },  // Guard Skill 通常由其他 Skill 显式调用，而非用户直接触发
      instructions,
      contextRequirements: [],
      toolDependencies: [
        { name: 'bash', required: true, purpose: '执行安全检查命令' },
      ],
      examples: [],
      guardrails: config.blockOnFailure
        ? [{ level: 'MUST' as const, description: 'CRITICAL 检查失败时必须阻止后续操作' }]
        : [],
      rawMarkdown: '',
      parsedAt: new Date(),
    };
  }
}

interface SecurityCheck {
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  tool: string;
  command: string;
}

// 示例：创建 "PII 检测守护" Skill
const PII_GUARD_SKILL = GuardSkill.create({
  name: 'pii-detection-guard',
  description: '在输出内容前检测是否包含个人身份信息（PII）',
  checkPhase: 'post-execution',
  blockOnFailure: true,
  checks: [
    {
      description: '检查是否包含手机号码',
      severity: 'CRITICAL',
      tool: 'bash',
      command: 'echo "$OUTPUT" | grep -P "1[3-9]\\d{9}" && echo "FOUND_PHONE" || echo "CLEAN"',
    },
    {
      description: '检查是否包含身份证号',
      severity: 'CRITICAL',
      tool: 'bash',
      command: 'echo "$OUTPUT" | grep -P "\\d{17}[\\dXx]" && echo "FOUND_ID" || echo "CLEAN"',
    },
    {
      description: '检查是否包含邮箱地址',
      severity: 'HIGH',
      tool: 'bash',
      command: 'echo "$OUTPUT" | grep -P "[\\w.-]+@[\\w.-]+\\.\\w+" && echo "FOUND_EMAIL" || echo "CLEAN"',
    },
    {
      description: '检查是否包含 API 密钥模式',
      severity: 'CRITICAL',
      tool: 'bash',
      command: 'echo "$OUTPUT" | grep -iP "(sk-|api_key|secret_key|password\\s*=)" && echo "FOUND_SECRET" || echo "CLEAN"',
    },
  ],
});
```

### 6.5.9.5 Pattern 5：Composite Skill（复合技能）

**特征：** 由多个基础 Skill 组合而成的高级工作流。

```typescript
/**
 * Composite Skill 模式
 * 通过 SkillComposer 将多个基础 Skill 组合为端到端工作流
 */

// 示例：创建 "完整 PR 审核流程" 复合 Skill
// 组合：PII 检测 → 代码审查 → 部署检查
function createFullPRReviewSkill(composer: SkillComposer): SkillManifest {
  return composer.compose(
    'full-pr-review-pipeline',
    [
      {
        skillName: 'pii-detection-guard',
        alias: '安全预检',
        condition: '仅在 PR 包含用户数据处理逻辑时执行',
      },
      {
        skillName: 'comprehensive-code-review',
        alias: '代码审查',
      },
      {
        skillName: 'codebase-qa',
        alias: '相关代码查询',
        condition: '当审查发现需要查看相关代码时执行',
      },
    ],
    {
      version: '1.0.0',
      description: '完整的 PR 审核流水线：安全预检 → 多维度代码审查 → 相关代码查询',
      triggers: {
        rules: [
          { type: 'keyword', pattern: '完整审查|full review|全面 review', confidence: 0.95 },
        ],
      },
    },
  );
}
```

---

## 6.5.10 从 MCP Server 迁移到 Skill 的实践指南

### 6.5.10.1 迁移评估

并非所有 MCP Server 都应该迁移为 Skill。以下评估矩阵帮助你做出正确的决策：

| 维度 | 保持 MCP Server | 迁移为 Skill | 说明 |
|------|----------------|-------------|------|
| 操作类型 | 原子操作（CRUD） | 复杂工作流 | 简单的读写操作保持为 Tool |
| 知识需求 | 无需领域知识 | 需要场景化指导 | 需要"何时做/怎么做"知识的应迁移 |
| 调用频率 | 高频单次调用 | 低频多步骤调用 | 高频简单操作保持为 Tool 更高效 |
| 用户交互 | 无需用户判断 | 需要用户确认/选择 | 涉及决策的流程适合 Skill |
| 错误处理 | 简单重试即可 | 需要智能回退策略 | 复杂错误处理逻辑适合用 Skill 指令描述 |

### 6.5.10.2 迁移流程

```typescript
/**
 * MCPToSkillMigrator：MCP Server 到 Skill 的迁移工具
 *
 * 迁移流程：
 * 1. 分析 MCP Server 的工具列表
 * 2. 聚类功能相关的工具
 * 3. 为每个聚类生成 SKILL.md 草稿
 * 4. 人工审核和优化
 * 5. 注册新 Skill 并逐步替换旧 MCP Server
 */
class MCPToSkillMigrator {
  /**
   * 分析 MCP Server 并生成迁移建议
   */
  analyzeMCPServer(
    serverName: string,
    tools: MCPToolDefinition[],
  ): MigrationAnalysis {
    const clusters: ToolCluster[] = [];
    const keepAsTool: string[] = [];

    // 步骤 1：按功能聚类
    const toolsByPrefix = new Map<string, MCPToolDefinition[]>();
    for (const tool of tools) {
      // 提取工具名的功能前缀
      const prefix = tool.name.split('_').slice(0, 2).join('_');
      if (!toolsByPrefix.has(prefix)) {
        toolsByPrefix.set(prefix, []);
      }
      toolsByPrefix.get(prefix)!.push(tool);
    }

    // 步骤 2：评估每个聚类
    for (const [prefix, clusterTools] of toolsByPrefix) {
      const assessment = this.assessCluster(prefix, clusterTools);

      if (assessment.shouldMigrate) {
        clusters.push({
          name: prefix,
          tools: clusterTools,
          suggestedSkillName: this.suggestSkillName(prefix, clusterTools),
          migrationDifficulty: assessment.difficulty,
          expectedTokenSaving: assessment.tokenSaving,
        });
      } else {
        keepAsTool.push(...clusterTools.map(t => t.name));
      }
    }

    return {
      serverName,
      totalTools: tools.length,
      clustersToMigrate: clusters,
      toolsToKeep: keepAsTool,
      estimatedTokenSaving: clusters.reduce(
        (sum, c) => sum + c.expectedTokenSaving, 0
      ),
    };
  }

  /**
   * 为工具聚类生成 SKILL.md 草稿
   */
  generateSkillDraft(cluster: ToolCluster): string {
    const tools = cluster.tools;

    // 从工具描述中提取关键信息
    const allDescriptions = tools.map(t => t.description).join('\n');

    // 生成触发规则
    const triggers = this.generateTriggers(cluster);

    // 生成执行指令
    const instructions = this.generateInstructions(tools);

    // 生成 SKILL.md
    return [
      '---',
      `name: ${cluster.suggestedSkillName}`,
      'version: 1.0.0',
      'author: mcp-migrator',
      `description: ${allDescriptions.slice(0, 100)}`,
      'category: general',
      `tags: [migrated, ${cluster.name}]`,
      '---',
      '',
      `# ${cluster.suggestedSkillName}`,
      '',
      '## Description',
      `原 MCP Server 工具迁移而来。整合了以下 ${tools.length} 个工具的功能：`,
      ...tools.map(t => `- ${t.name}: ${t.description}`),
      '',
      '## Triggers',
      ...triggers.map(t => `- ${t}`),
      '',
      '## Instructions',
      ...instructions.map((inst, i) => `${i + 1}. ${inst}`),
      '',
      '## Tool Dependencies',
      '- bash（必需）: 通过 CLI 命令替代原 MCP 工具调用',
      '',
      '## Guardrails',
      '- SHOULD 迁移后需验证与原 MCP Server 行为一致',
      '- TODO: 请根据实际场景补充安全约束',
    ].join('\n');
  }

  /**
   * 计算迁移前后的 Token 对比
   */
  calculateTokenSavings(
    originalTools: MCPToolDefinition[],
    generatedSkill: string,
  ): TokenSavingReport {
    const originalTokens = originalTools.reduce((sum, tool) => {
      const toolJson = JSON.stringify(tool);
      return sum + Math.ceil(toolJson.length / 4);
    }, 0);

    const skillTokens = Math.ceil(generatedSkill.length / 3);

    return {
      originalToolCount: originalTools.length,
      originalTokens,
      skillTokens,
      savedTokens: originalTokens - skillTokens,
      savingPercentage: ((originalTokens - skillTokens) / originalTokens * 100),
    };
  }

  // ===== 私有辅助方法 =====

  private assessCluster(
    _prefix: string,
    tools: MCPToolDefinition[],
  ): {
    shouldMigrate: boolean;
    difficulty: 'easy' | 'medium' | 'hard';
    tokenSaving: number;
  } {
    // 规则：3 个以上相关工具 → 迁移
    if (tools.length >= 3) {
      return {
        shouldMigrate: true,
        difficulty: tools.length > 5 ? 'hard' : 'medium',
        tokenSaving: tools.length * 220 - 800, // 预估节省
      };
    }

    // 规则：工具描述过长（>100 字）→ 迁移（用 Skill 指令替代长描述）
    const avgDescLength = tools.reduce(
      (sum, t) => sum + t.description.length, 0
    ) / tools.length;
    if (avgDescLength > 100) {
      return { shouldMigrate: true, difficulty: 'easy', tokenSaving: tools.length * 100 };
    }

    return { shouldMigrate: false, difficulty: 'easy', tokenSaving: 0 };
  }

  private suggestSkillName(prefix: string, tools: MCPToolDefinition[]): string {
    // 从工具名前缀和描述中推断 Skill 名称
    const domain = prefix.split('_')[0];
    const action = tools[0].name.split('_').slice(1).join('-');
    return `${domain}-${action}-workflow`;
  }

  private generateTriggers(cluster: ToolCluster): string[] {
    const triggers: string[] = [];

    // 从工具名提取动词和名词作为触发关键词
    for (const tool of cluster.tools) {
      const parts = tool.name.split('_');
      if (parts.length >= 3) {
        triggers.push(`用户提到 "${parts.slice(1).join(' ')}"`);
      }
    }

    return triggers.slice(0, 5); // 最多 5 个触发规则
  }

  private generateInstructions(tools: MCPToolDefinition[]): string[] {
    return tools.map(tool => {
      const args = tool.inputSchema.properties
        ? Object.keys(tool.inputSchema.properties as Record<string, unknown>).join(', ')
        : '';
      return `使用 \`bash\` 执行等价命令以完成 "${tool.description}"（原工具: ${tool.name}，参数: ${args}）`;
    });
  }
}

interface ToolCluster {
  name: string;
  tools: MCPToolDefinition[];
  suggestedSkillName: string;
  migrationDifficulty: 'easy' | 'medium' | 'hard';
  expectedTokenSaving: number;
}

interface MigrationAnalysis {
  serverName: string;
  totalTools: number;
  clustersToMigrate: ToolCluster[];
  toolsToKeep: string[];
  estimatedTokenSaving: number;
}

interface TokenSavingReport {
  originalToolCount: number;
  originalTokens: number;
  skillTokens: number;
  savedTokens: number;
  savingPercentage: number;
}
```

### 6.5.10.3 迁移前后对比

以下表格展示了将一个 GitHub MCP Server（25 个工具）迁移为 3 个 Skill 后的效果对比：

| 指标 | 迁移前（25 个 MCP 工具） | 迁移后（3 个 Skill） | 变化 |
|------|------------------------|---------------------|------|
| 工具定义 Token | ~5,500 | ~2,400（3 个 Skill 指令） | -56% |
| 工具选择准确率 | ~65% | ~92% | +27% |
| 平均任务完成时间 | 45s | 32s | -29% |
| 每月 Token 消耗 | ~8.25M | ~3.6M | -56% |
| 维护文件数 | 25 个工具实现 | 3 个 SKILL.md + 2 个通用工具 | -80% |
| 新场景适应时间 | 开发新工具 ~2天 | 编写 SKILL.md ~2小时 | -94% |

### 6.5.10.4 常见迁移陷阱

> **设计决策：迁移的五个常见陷阱及规避方法**
>
> 1. **过度迁移**：不是所有工具都应该变成 Skill。简单的 CRUD 工具（如 `read_file`、`db_query`）保持为 Tool 更高效
>
> 2. **指令过于抽象**：Skill 指令必须具体到"用什么工具执行什么命令"，不能只写"分析代码质量"
>
> 3. **忽略回退路径**：迁移后的 Skill 应保留对原始 MCP 工具的引用，作为回退方案
>
> 4. **触发规则过宽**：避免使用过于通用的关键词（如"帮我"），否则 Skill 会被错误触发
>
> 5. **缺少测试**：迁移后必须用 SkillTestRunner 验证触发准确率和执行结果与原方案一致

---

## 6.5.11 前沿展望：Skill Network 与 Agent 技能市场

### 6.5.11.1 Skill Network Protocol（SNP）

随着组织内部的 Skill 积累到一定规模，跨团队甚至跨组织的 Skill 共享需求自然浮现。我们设想一个 **Skill Network Protocol（SNP）** 来标准化这种共享：

```typescript
/**
 * Skill Network Protocol（SNP）
 * 跨组织的 Skill 发现、共享和版本管理协议
 */

// SNP 节点：每个组织运行一个 SNP 节点
interface SNPNode {
  /** 节点标识 */
  nodeId: string;
  /** 组织名称 */
  organization: string;
  /** 节点端点 URL */
  endpoint: string;
  /** 公开的 Skill 目录 */
  publicSkills: SNPSkillEntry[];
  /** 信任的对等节点 */
  trustedPeers: string[];
}

interface SNPSkillEntry {
  /** Skill 名称 */
  name: string;
  /** 版本号 */
  version: string;
  /** 发布者 */
  publisher: {
    org: string;
    verified: boolean;
    trustLevel: 'official' | 'community' | 'experimental';
  };
  /** 使用统计 */
  metrics: {
    downloads: number;
    successRate: number;
    avgLatencyMs: number;
    lastUpdated: Date;
  };
  /** 安全审计 */
  security: {
    audited: boolean;
    lastAuditDate?: Date;
    vulnerabilities: number;
    permissions: string[];
  };
  /** Skill 内容的哈希（用于完整性验证） */
  contentHash: string;
}

/**
 * SNP 客户端：与 Skill Network 交互
 */
class SNPClient {
  private readonly nodeEndpoint: string;

  constructor(endpoint: string) {
    this.nodeEndpoint = endpoint;
  }

  /**
   * 在 Skill Network 中搜索 Skill
   */
  async search(query: SNPSearchQuery): Promise<SNPSkillEntry[]> {
    const response = await fetch(`${this.nodeEndpoint}/skills/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    });
    const data = await response.json() as { skills: SNPSkillEntry[] };
    return data.skills;
  }

  /**
   * 安装（下载）一个 Skill
   */
  async install(skillName: string, version: string): Promise<SkillManifest> {
    const response = await fetch(
      `${this.nodeEndpoint}/skills/${skillName}/versions/${version}/download`
    );

    if (!response.ok) {
      throw new Error(`安装 Skill 失败: ${response.status}`);
    }

    const data = await response.json() as { markdown: string; signature: string };

    // 验证签名
    if (!this.verifySignature(data.markdown, data.signature)) {
      throw new Error('Skill 签名验证失败，可能被篡改');
    }

    // 解析 Skill
    const parser = new SkillParser();
    return parser.parse(data.markdown);
  }

  /**
   * 发布一个 Skill 到网络
   */
  async publish(manifest: SkillManifest, authToken: string): Promise<void> {
    const response = await fetch(`${this.nodeEndpoint}/skills/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        name: manifest.metadata.name,
        version: manifest.metadata.version,
        markdown: manifest.rawMarkdown,
      }),
    });

    if (!response.ok) {
      throw new Error(`发布 Skill 失败: ${response.status}`);
    }
  }

  /** 验证 Skill 内容的数字签名 */
  private verifySignature(_content: string, _signature: string): boolean {
    // 实际实现使用 RSA/ECDSA 签名验证
    return true;
  }
}

interface SNPSearchQuery {
  keyword?: string;
  category?: string;
  minSuccessRate?: number;
  trustedOnly?: boolean;
  maxResults?: number;
}
```

### 6.5.11.2 Agent 技能市场愿景

Skill 市场的愿景类似于 npm 之于 Node.js、Docker Hub 之于容器化：

```
┌───────────────────────────────────────────────────┐
│              Skill Marketplace                     │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Official │  │Community │  │Enterprise│       │
│  │  Skills  │  │  Skills  │  │  Skills  │       │
│  │          │  │          │  │          │       │
│  │ code-    │  │ django-  │  │ internal-│       │
│  │ review   │  │ deploy   │  │ deploy   │       │
│  │          │  │          │  │          │       │
│  │ 47K ★4.8│  │ 12K ★4.2│  │ 🔒 私有  │       │
│  └──────────┘  └──────────┘  └──────────┘       │
│                                                   │
│  [安装] [发布] [搜索] [审核] [统计]               │
└───────────────────────────────────────────────────┘
```

### 6.5.11.3 第三方 Skill 的安全考量

```typescript
/**
 * Skill 安全审计框架
 * 在安装和执行第三方 Skill 前进行安全检查
 */
class SkillSecurityAuditor {
  /**
   * 审计 Skill 的安全性
   */
  audit(manifest: SkillManifest): SecurityAuditResult {
    const risks: SecurityRisk[] = [];

    // 检查 1：指令中是否包含危险命令
    for (const inst of manifest.instructions) {
      const dangerousPatterns = [
        { pattern: /rm\s+-rf/, risk: '文件删除操作', severity: 'high' as const },
        { pattern: /curl.*\|\s*sh/, risk: '远程代码执行', severity: 'critical' as const },
        { pattern: /eval\(/, risk: 'eval 执行', severity: 'critical' as const },
        { pattern: /chmod\s+777/, risk: '不安全的权限设置', severity: 'medium' as const },
        { pattern: /password|secret|token/i, risk: '可能涉及敏感信息', severity: 'medium' as const },
      ];

      for (const { pattern, risk, severity } of dangerousPatterns) {
        if (pattern.test(inst.action) || pattern.test(inst.command)) {
          risks.push({
            severity,
            description: risk,
            location: `指令步骤 ${inst.step}`,
            instruction: inst.action,
          });
        }
      }
    }

    // 检查 2：工具依赖的安全性
    for (const dep of manifest.toolDependencies) {
      if (['bash', 'shell', 'exec'].includes(dep.name)) {
        risks.push({
          severity: 'medium',
          description: `依赖 ${dep.name} 工具，可执行任意命令`,
          location: '工具依赖',
          instruction: dep.purpose,
        });
      }
    }

    // 检查 3：是否有护栏规则
    if (manifest.guardrails.length === 0) {
      risks.push({
        severity: 'medium',
        description: '缺少安全护栏规则',
        location: 'Guardrails',
        instruction: '建议添加 MUST NOT 类安全约束',
      });
    }

    // 计算综合风险等级
    const hasCritical = risks.some(r => r.severity === 'critical');
    const hasHigh = risks.some(r => r.severity === 'high');
    const overallRisk = hasCritical ? 'critical' : hasHigh ? 'high' : risks.length > 0 ? 'medium' : 'low';

    return {
      skillName: manifest.metadata.name,
      overallRisk,
      risks,
      recommendation: hasCritical
        ? '不建议安装：存在严重安全风险'
        : hasHigh
          ? '谨慎安装：需要人工审查高风险指令'
          : '可以安装：未发现严重安全问题',
    };
  }
}

interface SecurityRisk {
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  location: string;
  instruction: string;
}

interface SecurityAuditResult {
  skillName: string;
  overallRisk: 'critical' | 'high' | 'medium' | 'low';
  risks: SecurityRisk[];
  recommendation: string;
}
```

---

## 6.5.12 本章小结

本章从 MCP 工具泛滥这一现实问题出发，系统性地介绍了 **Skill 工程**——Agent 能力扩展的下一代范式。以下是核心要点回顾：

### 核心概念速查表

| 概念 | 定义 | 关键特征 |
|------|------|---------|
| **Skill** | 对 Agent 能力的知识封装 | 包含何时用、怎么用、注意什么 |
| **SKILL.md** | Skill 的标准化载体文件 | Markdown 格式，人机双可读 |
| **SkillMatcher** | 意图到 Skill 的匹配引擎 | 关键词 + 正则 + 语义 多策略融合 |
| **SkillInjector** | 将 Skill 注入 Agent 上下文 | 全量/精简/引用/自适应 四种策略 |
| **Skill-MCP Bridge** | Skill 知识层与 MCP 能力层的桥梁 | 将指令解析为工具调用序列 |
| **BashSkillRuntime** | 基于 bash 的 Skill 执行运行时 | 万能运行时，替代数十个专用工具 |

### Skill 设计模式总览

| 模式 | 适用场景 | 工具依赖 | 复杂度 |
|------|---------|---------|--------|
| Instruction Skill | 写作指南、规范模板 | 无 | 低 |
| Tool Orchestration Skill | 部署、配置、迁移 | 多工具协调 | 高 |
| Retrieval Skill | 代码问答、知识检索 | 搜索 + 读取 | 中 |
| Guard Skill | 安全检查、合规审查 | 检测工具 | 中 |
| Composite Skill | 端到端工作流 | 组合其他 Skill | 极高 |

### Skill Engineering Checklist

在发布一个 Skill 前，请确认以下清单：

- [ ] **SKILL.md 格式正确**：包含 front matter、所有必需 section
- [ ] **触发规则充分**：至少 2 种触发方式，覆盖中英文表达
- [ ] **指令具体可执行**：每条指令指明工具和命令
- [ ] **示例至少 2 个**：覆盖常见场景和边界情况
- [ ] **护栏规则完整**：至少有 MUST NOT 类硬性约束
- [ ] **工具依赖声明清晰**：区分必需/可选，标注回退方案
- [ ] **Token 预算合理**：完整 SKILL.md 控制在 500-2000 token
- [ ] **通过 SkillTestRunner 测试**：触发准确率 > 90%
- [ ] **安全审计通过**：无 critical/high 级别风险
- [ ] **版本号正确**：遵循 semver 规范

### 与其他章节的关系

| 关联章节 | 关系 |
|---------|------|
| 第 5 章 Context Engineering | Skill 注入是上下文工程的一种实现——按需选择最相关的知识注入 context |
| 第 6 章 Tool System Design | Skill 构建在 MCP 工具系统之上，是工具层的知识抽象 |
| 第 7 章 Memory Architecture | Skill 可以利用记忆系统存储执行历史，优化未来的 Skill 匹配 |
| 第 20 章 Protocols & Standards | Skill Network Protocol 是 MCP 协议在知识层的延伸 |

### 推荐阅读

1. **Claude Code 架构解析**：理解"少工具 + 丰富指令"范式的工程实践
2. **Goose（Block 开源项目）**：Skill 概念的先驱实现
3. **Angie Jones: "The Future of Agent Skills"**：Skill 设计哲学的源头
4. **MCP Specification 2025-06-18**：理解 Skill 底层的 MCP 协议
5. **第 6 章 ACI 设计哲学**：Skill 的工具描述仍需遵循 ACI 原则

---

| 上一章 | 目录 | 下一章 |
|--------|------|--------|
| [第 6 章 工具系统设计](./ch06-tool-system-design.md) | [目录](../../SUMMARY.md) | [第 7 章 记忆架构](../part-03-memory-knowledge/ch07-memory-architecture.md) |
