# 第 6.5 章：Skill 工程 —— 从工具调用到知识驱动的范式跃迁
当你的 Agent 接入了 165 个 MCP 工具后，一件反直觉的事情发生了：**Agent 的决策准确率不升反降**。这不是 LLM 能力的问题，而是信息过载的问题——165 个工具的描述占用了约 36,300 个 token，吞掉了 GPT-4 上下文窗口的 28%。LLM 被迫在海量的工具描述中搜索匹配项，而不是专注于理解用户的意图。

这就是**工具泛滥问题**（Tool Proliferation Problem）。Claude Code 的解决方案极具启发性：它只暴露了 4 个通用工具（Read、Write、Bash、Search），但通过丰富的指令（Instructions）赋予每个工具远超其名称的能力。这告诉我们：**工具数量和能力之间不是正相关关系——更少的工具 + 更好的指令 > 更多的专用工具**。

本章引入 **Skill** 的概念作为解决方案：Skill 是工具（Tool）之上的知识层，它将"做什么"（工具调用）和"怎么做"（领域知识、执行策略、质量标准）打包为一个可复用的单元。如果说 MCP 工具是"螺丝刀"，那 Skill 就是"如何组装一台电脑的完整指南"。

> **设计决策：Skill vs 动态工具加载** 一种替代方案是动态工具加载——根据当前对话上下文按需加载相关工具，而非一次性加载全部。这确实能缓解 token 占用问题，但它无法解决更深层的问题：单个工具缺乏"怎么做"的领域知识。Skill 的核心价值不在于减少工具数量（虽然它也做到了这一点），而在于将碎片化的工具调用组织为有目的、有策略、有质量标准的行动方案。当你的工具数量少于 20 个时，动态加载可能就够了；超过这个阈值，Skill 层的投入产出比开始显现。


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
  // ... 省略 80 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 7 行
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

  // ... 省略 101 行，完整实现见 code-examples/ 对应目录
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

  // ... 省略 7 行
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
  // ... 省略 7 行
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
  // ... 省略 7 行
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
  // ... 省略 7 行
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
  // ... 省略 7 行
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
  // ... 省略 7 行
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
  // ... 省略 7 行
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

  // ... 省略 7 行
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
  // ... 省略 7 行
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
  // ... 省略 7 行
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

  // ... 省略 327 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 116 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 194 行，完整实现见 code-examples/ 对应目录
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

  // ... 省略 203 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 277 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 181 行，完整实现见 code-examples/ 对应目录

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
  // ... 省略 7 行
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
  // ... 省略 311 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 7 行
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
  // ... 省略 130 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 166 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 159 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 7 行
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
  // ... 省略 106 行，完整实现见 code-examples/ 对应目录

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
  // ... 省略 205 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 7 行
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
  // ... 省略 7 行
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
  // ... 省略 136 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 89 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 84 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 7 行
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
  // ... 省略 198 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 115 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 70 行，完整实现见 code-examples/ 对应目录
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
