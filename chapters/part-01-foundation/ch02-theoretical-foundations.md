# 第二章：理论基础 — 从经典 AI 到 LLM Agent
任何工程实践如果缺乏理论根基，最终都会沦为试错法。AI Agent 工程也不例外。

当你的 Agent 在第 47 步突然偏离正轨时，理解"POMDP 中的信念状态更新"能帮你定位问题；当你在选择 ReAct 还是 Plan-and-Execute 循环时，了解经典规划理论中 STRIPS 与 HTN 的取舍能给你决策依据；当你设计记忆系统时，认知科学中 ACT-R 的激活衰减模型能启发你的缓存淘汰策略。

本章的组织逻辑是**从实用到基础**：先讲 LLM 作为推理引擎的核心能力和局限（这是大多数读者最迫切需要的知识），再引入"确定性外壳 / 概率性内核"的设计哲学（这是全书的架构基石），最后追溯经典 AI 理论作为深层基础。你不需要掌握每一个公式才能构建 Agent——但理解这些理论的工程含义，能让你在架构决策时多一份笃定。

```mermaid
graph LR
    A[LLM 推理引擎] --> B[确定性外壳 / 概率性内核]
    B --> C[Agent 循环模式]
    C --> D[规划与决策理论]
    D --> E[认知架构启示]
    style A fill:#4CAF50,color:#fff
    style B fill:#2196F3,color:#fff
```


> "LLM 不是数据库，不是搜索引擎，而是一个概率推理引擎。理解这一点是构建优秀 Agent 的前提。"
> 
> "要真正理解今天的 AI Agent，你需要站在六十年人工智能研究的肩膀上。"

---

本章是全书的理论地基。我们将从经典人工智能的 Agent 形式化定义出发，经过决策理论、规划理论、多智能体理论和认知架构，最终落到大语言模型（LLM）作为推理引擎的理论分析。每个理论板块既自成体系，又与后续工程实践章节紧密关联——理论不是装饰，而是你在工程决策时最可靠的指南针。

---

## 2.1 Agent 的形式化定义

在开始构建任何 Agent 系统之前，我们需要回答一个根本问题：**什么是 Agent？** 这个问题看似简单，实则贯穿了人工智能六十余年的研究历程。本节将建立严格的形式化定义，并将经典理论与当今 LLM-based Agent 进行映射。

### 2.1.1 经典 AI 中的 Agent 定义

Stuart Russell 和 Peter Norvig 在其经典教材《Artificial Intelligence: A Modern Approach》中给出的定义至今仍是 AI 领域的标准起点：

> **Agent** 是任何能通过**传感器（Sensors）**感知其**环境（Environment）**，并通过**执行器（Actuators）**作用于环境的实体。

用数学语言表达，一个 Agent 可以被描述为一个函数：

```
f: P* → A
```

其中 `P*` 是感知序列（percept sequence）的集合——即 Agent 从诞生到当前时刻所接收到的全部感知历史；`A` 是动作（action）的集合。这个函数 `f` 被称为 **Agent 函数（Agent Function）**，它定义了 Agent 在任何给定感知历史下应当采取的动作。

在 TypeScript 中，我们可以这样形式化：

```typescript
// Agent 的形式化定义
interface Percept {
  timestamp: number;
  source: string;
  data: unknown;
}

type PerceptSequence = Percept[];
type Action = { type: string; params: Record<string, unknown> };

// Agent 函数：从感知历史到动作的映射
type AgentFunction = (percepts: PerceptSequence) => Action;

// Agent 程序：Agent 函数的具体实现
interface AgentProgram {
  // 接收一个新的感知，返回一个动作
  execute(percept: Percept): Action;
}
```

注意 Agent 函数与 Agent 程序的区别：**Agent 函数**是数学抽象——它定义了一张无限大的表格，列出每种感知历史对应的动作；**Agent 程序**是具体实现——它运行在物理计算机上，必须在有限时间和资源内产生动作。这个区别在工程实践中极为重要：我们永远无法实现完美的 Agent 函数，只能构建足够好的 Agent 程序。

### 2.1.2 理性 Agent

仅仅定义"什么是 Agent"还不够，我们更关心"什么是**好的** Agent"。Russell 和 Norvig 引入了**理性（Rationality）**的概念：

> **理性 Agent** 在给定感知序列和内置知识的条件下，选择能**最大化期望性能度量（Expected Performance Measure）**的动作。

这里有四个关键要素需要明确：

1. **性能度量（Performance Measure）**：评价 Agent 行为好坏的标准，由设计者外部定义
2. **先验知识（Prior Knowledge）**：Agent 在开始之前已经具备的知识
3. **可执行动作（Available Actions）**：Agent 能够采取的动作集合
4. **感知序列（Percept Sequence）**：Agent 到当前为止接收到的全部感知

```typescript
// 理性 Agent 的定义
interface RationalAgent extends AgentProgram {
  // 性能度量函数
  performanceMeasure: (state: EnvironmentState) => number;

  // 先验知识
  priorKnowledge: KnowledgeBase;

  // 可执行的动作集合
  availableActions: Action[];

  // 选择使期望性能度量最大化的动作
  execute(percept: Percept): Action;
}

// 理性不等于全知
// 理性也不等于完美
// 理性 = 基于已知信息做出最优选择
```

**理性不等于全知（Omniscience）**——全知的 Agent 知道其动作的实际结果，而理性的 Agent 只能基于已知信息做出最优选择。这个区别在 LLM Agent 系统中尤为重要：当 LLM 产生了一个幻觉（Hallucination），它并非"不理性"，而是在其"知识"范围内做出了它认为最优的回答。问题出在知识本身，而非推理过程。

### 2.1.3 Agent 类型分类

Russell 和 Norvig 定义了五种 Agent 类型，复杂度依次递增：

| Agent 类型 | 核心机制 | 典型特征 | LLM Agent 对应 |
|-----------|---------|---------|---------------|
| 简单反射型（Simple Reflex） | 条件-动作规则 | 无状态，只看当前感知 | 单轮 Prompt + 固定规则 |
| 基于模型的反射型（Model-Based Reflex） | 内部状态 + 规则 | 维护环境模型 | 带对话历史的 Chat |
| 基于目标的（Goal-Based） | 目标 + 搜索/规划 | 主动追求目标 | ReAct Agent |
| 基于效用的（Utility-Based） | 效用函数 + 优化 | 在多个目标间权衡 | 带评分的 Agent 路由 |
| 学习型（Learning） | 学习元素 + 性能元素 | 从经验中改进 | 带记忆和反思的 Agent |

```typescript
// 五种 Agent 类型的 TypeScript 建模

// 1. 简单反射型 Agent
class SimpleReflexAgent implements AgentProgram {
  private rules: Map<string, Action>;

  constructor(rules: Map<string, Action>) {
    this.rules = rules;
  // ... 省略 114 行，完整实现见 code-examples/ 对应目录
  query(question: string): unknown;
}

interface EnvironmentState {
  [key: string]: unknown;
}
```

### 2.1.4 环境类型分类

Agent 的设计高度依赖于它所处的环境特征。Russell 和 Norvig 定义了多个维度来分类环境：

| 维度 | 类型 A | 类型 B | 对 Agent 设计的影响 |
|------|--------|--------|-------------------|
| 可观测性 | 完全可观测（Fully Observable） | 部分可观测（Partially Observable） | 是否需要维护内部状态 |
| 确定性 | 确定性（Deterministic） | 随机性（Stochastic） | 是否需要概率推理 |
| 时序性 | 片段式（Episodic） | 序贯式（Sequential） | 当前决策是否影响未来 |
| 动态性 | 静态（Static） | 动态（Dynamic） | 是否需要实时感知 |
| 连续性 | 离散（Discrete） | 连续（Continuous） | 状态/动作空间的大小 |
| Agent 数量 | 单 Agent（Single） | 多 Agent（Multi） | 是否需要博弈思维 |

**LLM Agent 的典型环境特征**：

大多数 LLM Agent 系统运行在以下环境中：

- **部分可观测**：Agent 无法看到用户的全部意图，工具返回可能不完整
- **随机性**：LLM 本身是随机的（即使 temperature=0 也不完全确定），外部 API 可能失败
- **序贯式**：每一步的行动都会影响后续上下文和可用选项
- **动态**：外部世界在 Agent 思考时可能发生变化
- **离散**：动作空间通常是有限的工具集合
- **可能多 Agent**：复杂系统中常有多个 Agent 协作

```typescript
// 环境特征的形式化描述
interface EnvironmentProperties {
  observability: 'full' | 'partial';
  determinism: 'deterministic' | 'stochastic';
  episodic: boolean;     // true = 片段式, false = 序贯式
  dynamic: boolean;      // true = 动态, false = 静态
  discrete: boolean;     // true = 离散, false = 连续
  multiAgent: boolean;   // true = 多 Agent, false = 单 Agent
}

  // ... 完整实现见 code-examples/ 对应目录
    }
    return '带记忆和信念维护的 BDI Agent（见 2.5 节）';
  }
  if (env.multiAgent) {
    return '需要博弈论框架的多 Agent 系统（见 2.4 节）';
  }
  return '基于效用的 Agent，配合不确定性推理';
}
```

### 2.1.5 从经典 Agent 到 LLM Agent 的映射

经典 AI Agent 和当代 LLM-based Agent 之间存在深刻的对应关系：

| 经典 Agent 概念 | LLM Agent 对应 | 说明 |
|----------------|---------------|------|
| 传感器（Sensors） | 用户输入 + 工具返回值 + RAG 检索结果 | 感知通道从物理传感器变为信息接口 |
| 执行器（Actuators） | 工具调用（Tool Use） | 通过 Function Calling 作用于环境 |
| Agent 函数 | System Prompt + LLM + 上下文 | LLM 充当从感知到动作的映射函数 |
| 内部状态 | 对话历史 + 记忆系统 | 短期记忆（上下文窗口）+ 长期记忆（向量数据库） |
| 环境模型 | LLM 的世界知识 | 预训练获得的关于世界的概率模型 |
| 性能度量 | 任务成功率 + 用户满意度 + 成本 | 多维评估，不再是单一指标 |
| 先验知识 | 预训练知识 + System Prompt 中的指令 | 参数化知识 + 显式指令 |

这个映射关系揭示了一个关键洞察：**LLM Agent 本质上是经典 Agent 理论的一个特化实例**，其中 LLM 同时扮演了环境模型、推理引擎和（部分的）知识库三重角色。理解这一点有助于我们在设计 Agent 系统时避免重复发明轮子——经典 AI 中许多已被充分研究的问题（如规划、不确定性推理、多 Agent 协调）在 LLM Agent 领域同样适用。

> **前向引用**：Agent 的形式化定义将在第三章"Agent 架构模式"中具体化为可实现的工程架构，在第八章"评估体系"中转化为可度量的性能指标。

---

## 2.2 决策理论基础

Agent 的核心任务是**做决策**——在每个时间步选择一个动作。决策理论（Decision Theory）为这一过程提供了数学框架。本节将从马尔可夫决策过程（MDP）出发，扩展到部分可观测情形（POMDP），建立效用函数和理性决策的理论基础，并展示这些理论如何映射到 LLM Agent 的工程实践。

### 2.2.1 马尔可夫决策过程（MDP）

**马尔可夫决策过程（Markov Decision Process, MDP）**是描述序贯决策问题的标准数学框架。一个 MDP 由以下四元组定义：

```
MDP = (S, A, T, R)
```

- **S**：状态集合（State Space）——环境可能处于的所有状态
- **A**：动作集合（Action Space）——Agent 可以执行的所有动作
- **T**：转移函数（Transition Function）——T(s, a, s') = P(s' | s, a)，在状态 s 执行动作 a 后转移到状态 s' 的概率
- **R**：奖励函数（Reward Function）——R(s, a) 或 R(s, a, s')，执行某动作获得的即时回报

**马尔可夫性质（Markov Property）**是这一框架的核心假设：未来状态只依赖于当前状态和当前动作，与历史无关。即：

```
P(s_{t+1} | s_t, a_t, s_{t-1}, a_{t-1}, ..., s_0, a_0) = P(s_{t+1} | s_t, a_t)
```

MDP 的求解目标是找到一个**策略（Policy）** π: S → A，使得从任意初始状态出发的**期望累积折扣回报（Expected Cumulative Discounted Reward）**最大化：

```
V^π(s) = E[∑_{t=0}^{∞} γ^t R(s_t, π(s_t)) | s_0 = s]
```

其中 γ ∈ [0, 1) 是折扣因子（Discount Factor），控制 Agent 对远期回报的重视程度。

```typescript
// MDP 的 TypeScript 形式化定义
interface MDP<S, A> {
  states: S[];
  actions: A[];
  // 转移概率：给定状态和动作，返回下一状态的概率分布
  transition: (state: S, action: A) => Map<S, number>;
  // 奖励函数
  reward: (state: S, action: A, nextState?: S) => number;
  // ... 省略 66 行，完整实现见 code-examples/ 对应目录

    return bestAction;
  };

  return { values: V, policy };
}
```

### 2.2.2 MDP 在 LLM Agent 中的映射

虽然 LLM Agent 的状态空间远比经典 MDP 复杂，但 MDP 框架提供了有价值的思维模型：

| MDP 概念 | LLM Agent 对应 | 工程体现 |
|----------|---------------|---------|
| 状态 S | 当前对话上下文 + 工具调用结果 + 环境状态 | ConversationState 对象 |
| 动作 A | 工具调用 / 直接回复 / 请求澄清 / 委托子 Agent | AgentAction 联合类型 |
| 转移函数 T | LLM 生成 + 工具执行结果 | 不可精确建模，由 LLM 隐式处理 |
| 奖励函数 R | 任务完成度 + 用户满意度 - 成本 | 评估指标体系（见第八章） |
| 策略 π | System Prompt + LLM 参数 + 路由逻辑 | Agent 的核心配置 |
| 折扣因子 γ | Agent 对长远目标 vs 即时响应的权衡 | maxIterations / 超时设置 |

```typescript
// LLM Agent 决策过程的 MDP 视角
interface AgentDecisionState {
  conversationHistory: Message[];
  toolResults: ToolResult[];
  currentGoal: string;
  remainingBudget: { tokens: number; time: number; iterations: number };
}

type AgentDecisionAction =
  | { type: 'call_tool'; tool: string; params: Record<string, unknown> }
  // ... 完整实现见 code-examples/ 对应目录

  if (response.toolCalls && response.toolCalls.length > 0) {
    const tc = response.toolCalls[0];
    return { type: 'call_tool', tool: tc.name, params: tc.arguments };
  }

  return { type: 'respond', content: response.content };
}
```

### 2.2.3 POMDP：部分可观测马尔可夫决策过程

现实中的 LLM Agent 几乎总是面对**部分可观测**环境——Agent 无法直接观察到完整的环境状态。**POMDP（Partially Observable MDP）**在 MDP 基础上增加了两个要素：

```
POMDP = (S, A, T, R, Ω, O)
```

- **Ω**：观测集合（Observation Space）——Agent 能实际观察到的信号
- **O**：观测函数（Observation Function）——O(s', a, o) = P(o | s', a)，在执行动作 a 并转移到状态 s' 后观察到 o 的概率

在 POMDP 中，Agent 无法直接知道当前状态，必须维护一个**信念状态（Belief State）**——对当前状态的概率分布 b(s) = P(s | history)。

```typescript
// POMDP 在 LLM Agent 中的体现
interface BeliefState {
  // Agent 对用户真实意图的概率分布
  intentDistribution: Map<string, number>;

  // Agent 对环境状态的不确定性
  stateUncertainty: {
    known: Record<string, unknown>;      // 确定知道的
    uncertain: Record<string, {          // 不确定的
      possibleValues: unknown[];
  // ... 完整实现见 code-examples/ 对应目录

  // 归一化
  for (const [state, prob] of newBelief) {
    newBelief.set(state, prob / totalProb);
  }

  return newBelief;
}
```

**POMDP 视角对 Agent 工程的启示**：

1. **信息收集动作的价值**：在 POMDP 中，"收集更多信息"本身就是有价值的动作。这解释了为什么好的 Agent 会在不确定时主动提问或调用工具验证。

2. **信念维护的成本**：维护精确的信念状态计算复杂度极高（POMDP 求解是 PSPACE-hard 的）。LLM Agent 通过对话历史隐式维护信念状态，这是一种近似但实用的方法。

3. **探索与利用的权衡（Exploration vs Exploitation）**：Agent 应该继续收集信息（探索）还是基于当前信念直接行动（利用）？这个经典权衡在 LLM Agent 的迭代次数限制中直接体现。

### 2.2.4 效用函数与理性决策

**效用理论（Utility Theory）**为 Agent 的偏好提供了公理化基础。von Neumann 和 Morgenstern 证明，如果 Agent 的偏好满足以下公理，就存在一个效用函数 U 能表示这些偏好：

1. **完备性（Completeness）**：对任意两个结果，Agent 能判断偏好或无差异
2. **传递性（Transitivity）**：如果 A 优于 B 且 B 优于 C，则 A 优于 C
3. **连续性（Continuity）**：偏好关系是连续的
4. **独立性（Independence）**：无关选项不影响偏好

```typescript
// 效用函数在 Agent 决策中的应用
interface AgentUtility {
  // 多维效用函数
  evaluate(outcome: AgentOutcome): number;
}

interface AgentOutcome {
  taskCompleted: boolean;
  accuracy: number;          // 任务完成的准确度
  tokenCost: number;         // 消耗的 Token 数
  // ... 完整实现见 code-examples/ 对应目录
  completion: 50, accuracy: 30, costPenalty: 0.001,
  latencyPenalty: 0.01, satisfaction: 40,
};

const codeGenerationWeights = {
  completion: 30, accuracy: 60, costPenalty: 0.0005,
  latencyPenalty: 0.001, satisfaction: 20,
};
```

### 2.2.5 不确定性下的决策：期望效用理论

**期望效用理论（Expected Utility Theory）**告诉我们：理性 Agent 应当选择能**最大化期望效用**的动作。

```
a* = argmax_a ∑_s P(s|evidence) × U(outcome(s, a))
```

在 LLM Agent 中，这一理论体现为：

```typescript
// 期望效用最大化的 Agent 决策
async function expectedUtilityDecision(
  state: AgentDecisionState,
  actions: AgentDecisionAction[],
  utilityFn: AgentUtility,
  outcomePredictor: OutcomePredictor
): Promise<AgentDecisionAction> {
  let bestAction = actions[0];
  let bestExpectedUtility = -Infinity;

  // ... 完整实现见 code-examples/ 对应目录
}

interface OutcomePredictor {
  predict(
    state: AgentDecisionState,
    action: AgentDecisionAction
  ): Promise<{ outcome: AgentOutcome; probability: number }[]>;
}
```

**期望效用理论的局限与补充**：

期望效用理论假设 Agent 能精确估计概率和效用，但现实中 LLM Agent 面临多重不确定性：

- **模型不确定性**：LLM 的输出概率分布是否准确？
- **环境不确定性**：工具调用是否会成功？外部状态是否已变化？
- **用户意图不确定性**：用户真正想要什么？

面对这些不确定性，工程实践中常采用以下策略：

1. **保守策略（Minimax）**：在最坏情况下最大化效用——体现为 Agent 的 Guardrails
2. **满意策略（Satisficing）**：不追求最优，达到"足够好"即可——体现为设定成功阈值
3. **信息价值策略（Value of Information）**：先收集信息再决策——体现为 Agent 的澄清提问

> **前向引用**：决策理论将在第四章"工具系统设计"中指导工具选择策略，在第八章"评估与优化"中构建效用度量体系，在第九章"安全与对齐"中设计 Guardrail 系统。

---

## 2.3 规划理论

Agent 不仅需要做单步决策，还需要**规划**——构造从当前状态到目标状态的动作序列。规划（Planning）是 AI 中最核心的能力之一，也是 LLM Agent 区别于简单聊天机器人的关键特征。

### 2.3.1 经典规划：STRIPS 与 PDDL

**STRIPS（Stanford Research Institute Problem Solver）**是最早的自动规划系统之一（1971 年），它将规划问题形式化为：

- **状态（State）**：用逻辑命题集合描述世界的当前情况
- **动作（Action）**：包含前置条件（Preconditions）和效果（Effects）
- **目标（Goal）**：期望达到的状态条件

```typescript
// STRIPS 规划器的 TypeScript 实现
interface STRIPSState {
  predicates: Set<string>;  // 当前为真的谓词集合
}

interface STRIPSAction {
  name: string;
  parameters: string[];
  // ... 省略 70 行，完整实现见 code-examples/ 对应目录
  return null; // 无解
}

function serializeState(state: STRIPSState): string {
  return [...state.predicates].sort().join(',');
}
```

**PDDL（Planning Domain Definition Language）**是 STRIPS 的现代标准化继承者，它提供了更丰富的表达能力，包括类型系统、条件效果、持续动作等。PDDL 将规划问题分为**领域文件（Domain File）**和**问题文件（Problem File）**两部分，实现了规划知识的复用。

### 2.3.2 层次任务网络（HTN）

**层次任务网络（Hierarchical Task Network, HTN）**规划是一种自顶向下的规划方法，更接近人类解决问题的方式——先确定高层策略，再逐步分解为具体步骤。

HTN 的核心概念：

- **原始任务（Primitive Task）**：可以直接执行的动作
- **复合任务（Compound Task）**：需要分解为子任务的高级任务
- **方法（Method）**：将复合任务分解为子任务序列的规则
- **任务网络（Task Network）**：任务及其排序约束的集合

```typescript
// HTN 规划器的简化 TypeScript 实现
type TaskType = 'primitive' | 'compound';

interface Task {
  name: string;
  type: TaskType;
  params: Record<string, string>;
}

interface Method {
  // ... 完整实现见 code-examples/ 对应目录
      const allTasks = [...subtasks, ...remainingTasks];
      const plan = htnPlan(domain, state, allTasks);
      if (plan !== null) return plan;
    }

    return null; // 无法分解
  }
}
```

**HTN 与 LLM Agent 的深层联系**：

HTN 规划的层次分解思想与 LLM Agent 中的多种技术高度对应：

| HTN 概念 | LLM Agent 对应 |
|----------|---------------|
| 复合任务 | 用户的高级需求（如"帮我写一篇报告"） |
| 方法（分解规则） | LLM 的任务分解能力 |
| 原始任务 | 单次工具调用或直接回复 |
| 任务网络 | Agent 的执行计划 |
| 层次分解 | Plan-and-Execute 模式 |

### 2.3.3 LLM Agent 中的规划范式

LLM Agent 将经典规划理论与大语言模型的能力结合，形成了多种现代规划范式：

#### ReAct（Reasoning + Acting）

ReAct 将推理和行动交织在一起，Agent 在每一步都进行思考（Thought）、决定动作（Action）、观察结果（Observation），形成 T-A-O 循环：

```typescript
// ReAct 模式的形式化描述
interface ReActStep {
  thought: string;    // Agent 的推理过程
  action: string;     // 选择执行的动作
  actionInput: Record<string, unknown>;
  observation: string; // 动作执行后的观察
}

  // ... 省略 67 行，完整实现见 code-examples/ 对应目录
}

interface ToolResult {
  tool: string;
  result: unknown;
}
```

从规划理论视角看，ReAct 是一种**在线规划（Online Planning）**——Agent 不预先生成完整计划，而是在每一步根据当前观察动态决策。这对应于经典规划中的**交错规划与执行（Interleaved Planning and Execution）**。

#### Plan-and-Execute

与 ReAct 的逐步规划不同，Plan-and-Execute 模式先生成完整计划再逐步执行，更接近经典 HTN 规划的思想：

```typescript
// Plan-and-Execute 模式
interface ExecutionPlan {
  steps: PlanStep[];
  contingencies: Map<string, PlanStep[]>; // 应急计划
}

interface PlanStep {
  id: string;
  // ... 省略 65 行，完整实现见 code-examples/ 对应目录

async function synthesizeResult(
  llm: LLM, task: string, results: Map<string, unknown>
): Promise<string> {
  return '';
}
```

#### Tree-of-Thoughts（ToT）

**思维树（Tree-of-Thoughts, ToT）**将推理过程建模为一棵搜索树，Agent 可以探索多条推理路径并进行评估和回溯。这本质上是将经典搜索算法（BFS/DFS）应用于 LLM 的推理过程：

```typescript
// Tree-of-Thoughts 的简化实现
interface ThoughtNode {
  thought: string;
  score: number;        // 由 LLM 评估的质量分数
  children: ThoughtNode[];
  parent: ThoughtNode | null;
  depth: number;
}

async function treeOfThoughts(
  // ... 完整实现见 code-examples/ 对应目录
  const path: string[] = [];
  let current: ThoughtNode | null = leaf;
  while (current !== null) {
    path.unshift(current.thought);
    current = current.parent;
  }
  return path.join('\n→ ');
}
```

### 2.3.4 规划与执行的交错

在真实环境中，纯粹的"先规划后执行"往往不可行，因为：

1. **环境是动态的**：执行过程中环境可能变化
2. **信息是不完整的**：只有执行后才能获得新信息
3. **模型是不准确的**：LLM 的规划可能基于错误假设

**交错规划与执行（Interleaved Planning and Execution）**是解决这些问题的经典方法——Agent 在执行每一步后重新评估局势，必要时修改计划：

```typescript
// 交错规划与执行的框架
interface AdaptivePlanner {
  // 初始规划
  plan(goal: string, state: AgentDecisionState): Promise<PlanStep[]>;
  // 基于执行结果的重新规划
  replan(
    goal: string,
    state: AgentDecisionState,
    completedSteps: PlanStep[],
    currentPlan: PlanStep[],
  // ... 完整实现见 code-examples/ 对应目录
      );
    } else {
      plan = remainingPlan;
    }
  }

  return { completedSteps };
}
```

**各种规划范式的比较**：

| 范式 | 规划时机 | 优势 | 劣势 | 适用场景 |
|------|---------|------|------|---------|
| ReAct | 每步规划 | 灵活、适应性强 | 缺乏全局视野、效率低 | 探索性任务 |
| Plan-and-Execute | 先规划后执行 | 全局最优、高效 | 不适应环境变化 | 结构化任务 |
| Tree-of-Thoughts | 搜索式规划 | 推理质量高 | 计算成本高 | 复杂推理问题 |
| 交错式 | 边执行边修正 | 平衡全局与局部 | 实现复杂 | 动态环境任务 |

> **前向引用**：规划理论将在第三章"架构模式"中具体化为 Orchestrator-Worker 和 Plan-and-Execute 模式的工程实现，在第五章"复杂任务编排"中深入讨论长期规划和错误恢复策略。


### 2.3.5 Delegation 与 Handoff 模式

在前面的章节中，我们讨论了 Agent 自身如何进行推理和规划。然而，在真实系统中，一个 Agent 往往无法独立完成所有任务——它需要将部分工作**委派（Delegate）**给其他 Agent，或者将整个会话**移交（Handoff）**给更专业的 Agent 或人类操作员。这两种模式在 Anthropic 于 2024 年底发布的 *"Building Effective Agents"* 中被明确识别为核心 Agentic 模式，与 Prompt Chaining、Routing、Parallelization、Orchestrator-Workers、Evaluator-Optimizer 并列。

#### 定义与区分

**Delegation（委派）**指一个 Agent（delegator）将某个**子任务的执行权**转交给另一个 Agent（delegatee），但保留对整体任务的控制权。Delegator 发起任务、传递上下文、等待结果，并对最终输出负责。这类似于经理将具体工作交给下属，但经理仍然拥有项目的所有权。

**Handoff（移交）**则指一个 Agent 将**整个会话或会话控制权**完全移交给另一个 Agent 或人类。移交完成后，原 Agent 不再参与决策——目标 Agent 成为新的会话所有者。这类似于客服场景中的"转接"：一线客服发现问题超出能力范围，将客户转接给技术专家。

两者的核心区别在于**控制权的归属**：

| 维度 | Delegation | Handoff |
|------|-----------|---------|
| 控制权 | Delegator 保留 | 完全转移给目标 Agent |
| 任务范围 | 明确定义的子任务 | 整个会话/对话 |
| 回调 | Delegator 等待结果并继续 | 原 Agent 退出循环 |
| 错误处理 | Delegator 负责兜底 | 目标 Agent 全权负责 |
| 典型场景 | 代码生成 Agent 委派测试 Agent 运行单测 | 通用客服 Agent 转接给退款专员 |

#### 形式化模型

我们可以将 Delegation 形式化定义为一个五元组 $(D_{or}, D_{ee}, \tau, C, f_{cb})$，其中：

- $D_{or}$（delegator）：发起委派的 Agent
- $D_{ee}$（delegatee）：接受委派的 Agent
- $\tau$（task_spec）：对子任务的精确描述
- $C$（context）：执行任务所需的上下文信息
- $f_{cb}$（callback）：委派完成后的回调处理函数

Handoff 则可以定义为三元组 $(H_{src}, H_{tgt}, S)$，其中 $S$ 代表被移交的完整会话状态。

用 TypeScript 接口表达这两种模式的核心结构：

```typescript
// Delegation 的形式化定义
interface DelegationSpec<TInput = unknown, TOutput = unknown> {
  /** 委派的唯一标识 */
  delegationId: string;
  /** 发起方 Agent 标识 */
  delegatorId: string;
  /** 目标方 Agent 标识 */
  delegateeId: string;
  /** 子任务描述——对 delegatee 来说就是它的"goal" */
  taskSpec: {
  // ... 完整实现见 code-examples/ 对应目录
    currentGoal: string;
    metadata: Record<string, unknown>;
  };
  /** 移交原因——帮助目标 Agent 理解为何接手 */
  reason: string;
  /** 可选的输入过滤器：决定哪些上下文传递给目标 */
  inputFilter?: (state: Record<string, unknown>) => Record<string, unknown>;
}
```

#### 设计考量

**上下文保真度（Context Fidelity）**：Delegation 和 Handoff 的首要挑战是上下文在传递过程中的信息损失。Delegator 必须精确筛选哪些上下文对 delegatee 有价值——传递过多会导致 Token 浪费和注意力稀释，传递过少则 delegatee 无法正确完成任务。实际工程中，通常需要一个 `contextFilter` 函数来做这种裁剪。

**失败回滚（Rollback on Failure）**：当 Delegation 失败时，delegator 需要有明确的降级策略——是重试、换一个 delegatee、还是自己尝试完成？这与第五章将讨论的错误恢复策略密切相关。

**信任边界（Trust Boundaries）**：在多 Agent 系统中，不同 Agent 可能有不同的权限级别。Delegation 应遵循**最小权限原则**——delegatee 只应获得完成子任务所必需的最小权限集。例如，一个"数据分析 Agent"被委派查询任务时，不应获得写入数据库的权限。

> **前向引用**：Delegation 与 Handoff 的工程实现将在第三章 3.2.7 节中以 `DelegationHandler` 类的形式具体展开，包括超时处理、错误类型和完整的控制流实现。第五章将进一步讨论在复杂编排场景中如何组合使用 Delegation 链和 Handoff 逃逸。
---

## 2.4 Multi-Agent 理论基础

当系统中存在多个 Agent 时，问题的复杂度发生了质的变化。每个 Agent 的决策不仅取决于环境，还取决于其他 Agent 的行为。**多智能体系统（Multi-Agent Systems, MAS）**理论为理解和设计这类系统提供了数学基础。

### 2.4.1 博弈论基础

**博弈论（Game Theory）**研究多个理性决策者之间的策略互动。对于 Multi-Agent 系统设计者来说，以下概念是基础中的基础。

#### 博弈的形式化定义

一个**标准式博弈（Normal-Form Game）**由三元组 (N, A, u) 定义：

- **N**：参与者（Agent）集合 {1, 2, ..., n}
- **A**：策略组合的集合，A = A₁ × A₂ × ... × Aₙ，其中 Aᵢ 是 Agent i 的策略集合
- **u**：效用函数组合，uᵢ: A → ℝ 给出每个策略组合下 Agent i 的收益

```typescript
// 博弈的 TypeScript 建模
interface NormalFormGame<A> {
  players: string[];
  // 每个玩家的可用策略
  strategies: Map<string, A[]>;
  // 效用函数：给定所有玩家的策略组合，返回每个玩家的收益
  utility: (strategyProfile: Map<string, A>) => Map<string, number>;
}

// 经典案例：囚徒困境
  // ... 完整实现见 code-examples/ 对应目录
      }
      if (a1 === 'defect' && a2 === 'cooperate') {
        return new Map([['agent_1', 5], ['agent_2', 0]]);  // 背叛对方
      }
      return new Map([['agent_1', 1], ['agent_2', 1]]);    // 双方背叛
    },
  };
}
```

#### 纳什均衡

**纳什均衡（Nash Equilibrium）**是博弈论的核心解概念：在纳什均衡下，没有任何单个 Agent 能通过单方面改变策略来提高自己的收益。

形式化地：策略组合 a* = (a₁*, a₂*, ..., aₙ*) 是纳什均衡，当且仅当对每个 Agent i：

```
uᵢ(aᵢ*, a₋ᵢ*) ≥ uᵢ(aᵢ, a₋ᵢ*)  对所有 aᵢ ∈ Aᵢ
```

其中 a₋ᵢ* 表示除 Agent i 之外所有 Agent 的策略。

**纳什均衡在 Multi-Agent LLM 系统中的意义**：

在多个 LLM Agent 协作的系统中，纳什均衡帮助我们理解：
- 各 Agent 是否有"偷懒"的动机（搭便车问题）
- 系统是否会陷入次优的稳定状态（如囚徒困境）
- 如何设计激励机制使均衡结果接近全局最优

#### 合作博弈

与非合作博弈关注个体理性不同，**合作博弈（Cooperative Game）**研究 Agent 如何通过结盟来获得更好的集体结果。核心概念包括：

- **联盟（Coalition）**：Agent 的子集
- **特征函数 v(S)**：联盟 S 能获得的最大收益
- **Shapley 值**：公平分配联盟收益的唯一满足公理化条件的方法

```typescript
// Shapley 值的计算（简化版）
function shapleyValue(
  players: string[],
  characteristicFunction: (coalition: Set<string>) => number
): Map<string, number> {
  const n = players.length;
  const result = new Map<string, number>();

  for (const player of players) {
    let totalContribution = 0;
  // ... 完整实现见 code-examples/ 对应目录
  }
  return result;
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
```

**Shapley 值在 Multi-Agent LLM 系统中的应用**：当多个 Agent 协作完成任务时，Shapley 值可以用来评估每个 Agent 的贡献度，从而指导资源分配和架构优化。例如，如果一个 Agent 的 Shapley 值始终很低，说明它在协作中可能是冗余的。

### 2.4.2 通信协议理论

Multi-Agent 系统中，Agent 之间的通信是协调的基础。**言语行为理论（Speech Act Theory）**为 Agent 通信提供了理论框架。

John Searle 将言语行为分为五类，每一类在 Agent 通信协议中都有对应：

| 言语行为类型 | 含义 | Agent 通信对应 |
|-------------|------|---------------|
| 断言式（Assertive） | 描述世界状态 | Agent 汇报工具调用结果 |
| 指令式（Directive） | 请求对方做某事 | Orchestrator 向 Worker 分发任务 |
| 承诺式（Commissive） | 承诺将要做某事 | Agent 接受任务并承诺执行 |
| 表达式（Expressive） | 表达态度 | Agent 表达对结果的信心度 |
| 宣告式（Declarative） | 改变世界状态 | Agent 宣布任务完成/失败 |

```typescript
// 基于言语行为理论的 Agent 通信协议
type SpeechActType =
  | 'inform'       // 断言：提供信息
  | 'request'      // 指令：请求执行
  | 'agree'        // 承诺：同意执行
  | 'refuse'       // 承诺（否定）：拒绝执行
  | 'propose'      // 建议：提出方案
  | 'confirm'      // 宣告：确认完成
  | 'failure'      // 宣告：报告失败
  | 'query';       // 请求信息
  // ... 完整实现见 code-examples/ 对应目录
    if (msg.sender === bestProposal.sender &&
        (msg.performative === 'confirm' || msg.performative === 'failure')) {
      return { winner: bestProposal.sender, result: msg.content };
    }
  }

  throw new Error('协议超时');
}
```

### 2.4.3 共识机制与协调

当多个 Agent 需要就某个决策达成一致时，就需要**共识机制（Consensus Mechanism）**。这在以下场景中尤为重要：

- 多个 Agent 对同一问题给出不同答案，需要合并
- 需要多个 Agent 投票决定下一步行动
- 多个 Agent 的信念需要同步

```typescript
// 多 Agent 共识机制
interface ConsensusProtocol<T> {
  propose(agentId: string, value: T): void;
  resolve(): Promise<T>;
}

// 多数投票共识
class MajorityVoteConsensus<T> implements ConsensusProtocol<T> {
  // ... 省略 71 行，完整实现见 code-examples/ 对应目录
      }
    }

    return bestValue;
  }
}
```

> **前向引用**：Multi-Agent 理论将在第六章"Multi-Agent 架构"中转化为具体的工程模式（Supervisor、Swarm、Debate），在第七章"通信协议"中实现生产级的 Agent 间通信系统。

---

## 2.5 认知架构

**认知架构（Cognitive Architecture）**是对智能系统内部结构和工作机制的理论模型。它试图回答一个根本问题：智能体的"心智"应该如何组织？本节介绍三种经典认知架构——BDI、ACT-R 和 SOAR——并分析它们与现代 LLM Agent 架构的深层对应关系。

### 2.5.1 BDI 模型：信念-愿望-意图

**BDI（Belief-Desire-Intention）模型**由哲学家 Michael Bratman 提出，后由 Anand Rao 和 Michael Georgeff 形式化为 Agent 架构。BDI 是目前在 Agent 领域影响最为深远的认知架构之一。

三个核心组件：

- **信念（Belief）**：Agent 对世界状态的认知——可能不完整、可能错误
- **愿望（Desire）**：Agent 希望达成的状态——可以同时持有多个、甚至相互矛盾的愿望
- **意图（Intention）**：Agent 已承诺要执行的计划——从愿望中选出、已分配资源去执行的目标

BDI 模型的核心洞察在于**意图的承诺（Commitment）**：一旦 Agent 采纳了某个意图，它不会轻易放弃，除非有充分理由重新审议。这种"适度固执"避免了 Agent 在每一步都重新评估所有选项的计算开销。

```typescript
// BDI Agent 的 TypeScript 实现
interface Belief {
  key: string;
  value: unknown;
  confidence: number;  // 信念的置信度 [0, 1]
  source: string;      // 信念的来源
  timestamp: number;
}
  // ... 省略 130 行，完整实现见 code-examples/ 对应目录
      } catch {
        intention.status = 'failed';
      }
    }
  }
}
```

### 2.5.2 ACT-R 认知架构

**ACT-R（Adaptive Control of Thought—Rational）**由 John Anderson 在卡内基梅隆大学开发，是一种基于认知心理学实验数据的认知架构。ACT-R 的核心思想是将认知建模为多个**模块（Modules）**通过**缓冲区（Buffers）**交互。

ACT-R 的关键模块：

| 模块 | 功能 | LLM Agent 对应 |
|------|------|---------------|
| 声明性记忆（Declarative Memory） | 存储事实知识 | RAG 知识库 + 向量数据库 |
| 程序性记忆（Procedural Memory） | 存储 if-then 产生式规则 | System Prompt 中的行为规则 |
| 目标模块（Goal Module） | 维护当前目标和子目标 | Agent 的任务栈 |
| 视觉模块（Visual Module） | 处理视觉输入 | 多模态输入处理 |
| 运动模块（Motor Module） | 控制动作输出 | 工具调用执行 |

ACT-R 最有价值的工程启示是其**记忆激活模型**：每个记忆块（chunk）有一个激活值，决定了它被检索到的概率。激活值由基础水平（使用频率和新近度）与关联强度共同决定：

```
Activation(i) = Base-Level(i) + Σⱼ Strength(j,i) + noise
```

```typescript
// ACT-R 风格的记忆激活模型
interface MemoryChunk {
  id: string;
  content: unknown;
  createdAt: number;
  accessHistory: number[];  // 每次访问的时间戳
}

class ACTRMemory {
  private chunks: Map<string, MemoryChunk> = new Map();
  // ... 完整实现见 code-examples/ 对应目录
    return bestChunk;
  }

  private logisticNoise(scale: number): number {
    const u = Math.random();
    return scale * Math.log(u / (1 - u));
  }
}
```

这个激活模型对 LLM Agent 的记忆系统设计有直接指导意义：记忆不应该简单地按时间或相似度排序，而应综合考虑**使用频率**（常用的记忆更容易被检索）、**新近度**（最近使用的记忆更活跃）和**关联强度**（与当前任务上下文相关的记忆更容易被激活）。

### 2.5.3 SOAR 架构

**SOAR（State, Operator And Result）**由 Allen Newell 和 John Laird 在密歇根大学开发，是另一种经典认知架构，其核心思想是**问题空间假说（Problem Space Hypothesis）**：所有有目标的行为都可以被建模为在问题空间中的搜索。

SOAR 的三个关键机制：

1. **决策周期（Decision Cycle）**：类似于 Agent 的主循环——感知、提出候选操作符、决策、应用操作符
2. **子目标与困境（Impasse）**：当 Agent 无法在多个操作符之间选择时，自动创建子目标来解决困境
3. **学习（Chunking）**：当子目标被解决后，SOAR 自动学习一条新的产生式规则，避免未来再遇到相同困境

```typescript
// SOAR 风格的问题求解框架
interface SOARState {
  attributes: Record<string, unknown>;
  operators: Operator[];
}

interface Operator {
  name: string;
  // ... 省略 80 行，完整实现见 code-examples/ 对应目录
        return true;
      },
      production: () => resolvedOperator,
    });
  }
}
```

### 2.5.4 与现代 LLM Agent 架构的对比分析

| 维度 | BDI | ACT-R | SOAR | 现代 LLM Agent |
|------|-----|-------|------|---------------|
| 核心理念 | 信念-愿望-意图 | 模块化认知 | 问题空间搜索 | 上下文驱动推理 |
| 知识表示 | 逻辑命题 | 声明性块 | 产生式规则 | 自然语言 + 嵌入向量 |
| 推理机制 | 手段-目的分析 | 产生式匹配 | 操作符选择 | LLM 补全 |
| 学习方式 | 信念更新 | 激活调整 | Chunking | In-Context Learning + Fine-tuning |
| 记忆模型 | 信念库 | 声明性+程序性 | 工作记忆+长期记忆 | 上下文窗口+向量数据库 |
| 目标管理 | 愿望-意图层次 | 目标栈 | 子目标 | Prompt 中的目标描述 |
| 处理不确定性 | 信念概率 | 激活噪声 | 困境机制 | 概率采样 + 温度参数 |
| 可解释性 | 高 | 高 | 高 | 低（黑箱推理） |

**关键洞察**：现代 LLM Agent 在某种程度上"统一"了这三种架构的优点——LLM 的世界知识对应信念库和声明性记忆，System Prompt 中的规则对应产生式知识，思维链推理对应 SOAR 的问题空间搜索，对话历史管理对应工作记忆。但 LLM Agent 也继承了经典架构未曾有过的挑战：**不可解释性**和**不确定性**远超传统系统。

理解这些经典架构不是学术考古，而是为了：
1. 从中借鉴经过验证的设计模式（如 BDI 的承诺机制、ACT-R 的记忆激活）
2. 理解 LLM Agent 的理论局限（如缺少显式的意图管理）
3. 为混合架构设计（LLM + 符号系统）提供理论指导

> **前向引用**：认知架构的思想将在第三章"Agent 架构模式"中指导具体架构选择，在第五章"记忆系统"中设计长短期记忆方案，BDI 模型的意图管理思想将在第九章"安全与对齐"中用于设计 Agent 的目标对齐机制。

---

## 2.6 LLM 作为推理引擎的理论分析

前几节建立了经典 AI 的理论基础，本节将焦点转向当代 LLM Agent 的核心——大语言模型本身。我们将从理论角度分析 LLM 为何能（以及为何不能）充当 Agent 的推理引擎。

### 2.6.1 从补全到推理：涌现能力与 Scaling Laws

大语言模型的训练目标是"下一个 token 预测"（Next Token Prediction），但涌现出的能力远超简单的文本补全。当模型规模足够大时，它展现出了：

- **逻辑推理**：能够进行多步逻辑推导
- **类比思维**：能够从已知模式迁移到新场景
- **工具使用**：能够理解何时以及如何调用外部工具
- **规划能力**：能够将复杂任务分解为子步骤

**Scaling Laws（缩放定律）**揭示了模型能力与规模之间的幂律关系。Kaplan et al. (2020) 发现，模型的交叉熵损失与以下三个因素呈幂律关系：

- **参数量 N**：L(N) ∝ N^(-0.076)
- **数据量 D**：L(D) ∝ D^(-0.095)
- **计算量 C**：L(C) ∝ C^(-0.050)

**涌现能力（Emergent Abilities）**指的是在模型规模低于某个阈值时几乎不存在，但超过阈值后突然出现的能力。Wei et al. (2022) 在多项基准测试中观察到了这一现象。涌现能力对 Agent 工程有重要影响：

```typescript
// 涌现能力对 Agent 设计的影响
interface ModelCapabilityProfile {
  model: string;
  parameterCount: string;

  // 各项能力评分（0-100）
  capabilities: {
    basicCompletion: number;      // 基础补全
  // ... 省略 65 行，完整实现见 code-examples/ 对应目录
  }
  if (caps.instructionFollowing >= 80) {
    return 'Structured workflow with LLM as decision point';
  }
  return 'Rule-based system with LLM for NLU only';
}
```

### 2.6.2 In-Context Learning 的理论解释

**In-Context Learning（上下文学习，ICL）**是 LLM 最令人惊讶的能力之一：模型无需更新参数，仅通过在提示中提供少量示例就能学习新任务。这一能力是 Agent 系统中 Few-Shot Prompting 和 Context Engineering 的理论基础。

目前对 ICL 有多种理论解释：

**1. 隐式贝叶斯推断假说**

Xie et al. (2022) 提出，ICL 可以被理解为隐式的贝叶斯推断：LLM 在预训练中学习了关于"概念"的先验分布 P(concept)，在遇到上下文示例时进行贝叶斯更新：

```
P(concept | examples) ∝ P(examples | concept) × P(concept)
```

**2. 梯度下降模拟假说**

Akyürek et al. (2023) 和 von Oswald et al. (2023) 发现，Transformer 的前向传播过程在数学上等价于对上下文示例执行隐式的梯度下降。即：LLM 在进行 ICL 时，其注意力层实际上在"训练"一个内部的临时模型。

**3. 任务识别假说**

更务实的解释是：LLM 在预训练中见过海量的"输入-输出"模式，ICL 中的示例帮助模型识别当前任务属于哪种已知模式，从而激活正确的"子程序"。

```typescript
// ICL 的工程启示
interface ICLStrategy {
  // 示例选择策略
  exampleSelection: 'random' | 'similar' | 'diverse' | 'curriculum';
  // 示例数量
  numExamples: number;
  // 示例格式
  format: 'input-output' | 'step-by-step' | 'explanation-first';
}

  // ... 完整实现见 code-examples/ 对应目录
    default:
      return {
        exampleSelection: 'similar',
        numExamples: 3,
        format: 'input-output',
      };
  }
}
```

### 2.6.3 Chain-of-Thought 推理的原理

**思维链（Chain-of-Thought, CoT）**推理是让 LLM 在给出最终答案前"展示思考过程"的技术。Wei et al. (2022) 证明，CoT 能显著提升 LLM 在数学推理、逻辑推理和常识推理任务上的表现。

CoT 有效的理论解释：

1. **计算复杂度提升**：直接从问题到答案可能需要的计算复杂度超过了 Transformer 单次前向传播的表达能力。通过生成中间步骤，LLM 实际上增加了可用的计算量（每个生成的 token 相当于一次额外的前向传播）。

2. **工作记忆外化**：人类在解决复杂问题时会使用草稿纸，CoT 是 LLM 的"草稿纸"——将中间结果外化到文本中，避免了在有限的隐层维度中保持所有中间状态的压力。

3. **推理路径约束**：CoT 中的每一步都约束了下一步的可能空间，降低了推理出错的概率。这类似于在搜索树中进行剪枝。

```typescript
// CoT 在 Agent 中的应用模式
type CoTMode =
  | 'zero-shot-cot'    // "让我们一步步思考"
  | 'few-shot-cot'     // 提供带推理过程的示例
  | 'self-consistency' // 多次 CoT 后投票
  | 'structured-cot';  // 结构化推理框架

interface CoTConfig {
  mode: CoTMode;
  // Self-consistency 参数
  // ... 完整实现见 code-examples/ 对应目录
  };
}

function extractFinalAnswer(response: string): string {
  // 从 CoT 响应中提取最终答案
  const match = response.match(/最终答案[是为：:\s]+(.+)/);
  return match?.[1]?.trim() ?? response.trim().split('\n').pop() ?? '';
}
```

### 2.6.4 LLM 的能力边界与理论局限

理解 LLM 能做什么固然重要，但理解 LLM **不能做什么**对 Agent 工程师来说可能更加重要。以下是已知的理论局限：

**1. 计算复杂度限制**

标准 Transformer 的单次前向传播是一个固定深度的计算图。Merrill 和 Sabharwal (2023) 证明，固定精度的 Transformer 在不使用 CoT 的情况下只能解决 TC⁰（常数深度阈值电路）类的问题。这意味着某些需要深度递归计算的问题（如判断长字符串是否为某语言的合法成员）理论上超出了单次推理的能力。

**2. 忠实推理问题（Faithful Reasoning）**

Turpin et al. (2023) 发现，CoT 中展示的推理过程并不总是反映模型内部的实际决策过程。模型可能给出正确答案但错误的推理，或正确的推理但受到提示偏见的影响。对于 Agent 系统，这意味着不能完全信任 LLM 的"思考过程"来判断其可靠性。

**3. 幻觉问题（Hallucination）**

LLM 会生成看似合理但事实错误的内容。从理论上看，这是因为 LLM 的训练目标（最大化下一个 token 的似然）与"生成真实信息"之间存在根本性的不对齐。Agent 系统必须通过工具调用验证和 Guardrails 来缓解这一问题。

**4. 上下文窗口限制**

尽管上下文窗口不断扩大（从 4K 到 128K 到 1M+），但 Liu et al. (2024) 的"Lost in the Middle"研究表明，LLM 对上下文窗口中间位置的信息利用效率远低于首尾位置。这意味着简单地将更多信息塞入上下文并不等于 Agent 能有效利用这些信息。

```typescript
// LLM 局限性的工程应对策略
interface LLMCapabilityGuardrails {
  // 计算复杂度限制的应对
  computeDepthLimit: {
    strategy: 'enable-cot' | 'decompose-task' | 'use-external-solver';
    maxReasoningSteps: number;
  };

  // 忠实推理问题的应对
  faithfulnessCheck: {
  // ... 完整实现见 code-examples/ 对应目录
          strategy: 'hierarchical-summary', maxContextLength: 16000,
          importantInfoPlacement: 'both-ends',
        },
      };
    default:
      return configureGuardrails('low');
  }
}
```

> **前向引用**：LLM 的理论分析将在第三章"模型选择与评估"中转化为具体的模型选型指南，在第四章"工具系统"中指导工具设计以弥补 LLM 的能力短板，在第八章"评估体系"中构建覆盖这些局限性的测试框架。

---

## 2.7 确定性外壳与概率性内核

在理解了 LLM 的理论能力与局限之后，我们可以提出 Agent 架构的核心设计哲学：**确定性外壳包裹概率性内核（Deterministic Shell, Probabilistic Core）**。

### 2.7.1 设计哲学

LLM 是概率性的——给定相同输入，它可能产生不同输出。但 Agent 系统的外部行为必须是可预测、可审计、可测试的。解决这一矛盾的方法是将系统分为两层：

- **确定性外壳**：输入验证、输出校验、状态管理、错误处理、审计日志——这些用传统软件工程方法实现，行为完全确定
- **概率性内核**：推理、决策、文本生成——这些由 LLM 处理，结果具有随机性

```typescript
// 确定性外壳：可预测、可测试、可审计
class DeterministicShell {
  private state: AgentState;
  private tools: ToolRegistry;
  private guardrails: GuardrailSystem;

  async processAction(action: AgentAction): Promise<ActionResult> {
    // 1. 验证 action 合法性（确定性）
  // ... 省略 67 行，完整实现见 code-examples/ 对应目录
  validate(action: AgentAction): { passed: boolean; reason?: string };
}

function agentReducer(state: AgentState, action: { type: string; payload: unknown }): AgentState {
  return state;
}
```

### 2.7.2 Token 经济学

理解 Token 消耗对 Agent 系统至关重要——它直接影响运营成本和架构决策：

```typescript
class TokenEconomicsAnalyzer {
  // 各模型定价（USD per 1M tokens, 2026Q1）
  private pricing: Record<string, { input: number; output: number }> = {
    'gpt-4o':            { input: 2.50, output: 10.00 },
    'gpt-4o-mini':       { input: 0.15, output: 0.60 },
    'claude-opus-4':   { input: 15.00, output: 75.00 },
    'claude-sonnet-4': { input: 3.00, output: 15.00 },
    'claude-haiku-3.5':  { input: 0.80, output: 4.00 },
    'gemini-3-pro':      { input: 1.25, output: 5.00 },
    'gemini-3-flash':    { input: 0.075, output: 0.30 },
  // ... 完整实现见 code-examples/ 对应目录
    totalCost += iterationCost;

    // 下次迭代的输入会增长（累积之前的工具调用和回复）
    currentInputTokens += outputTokensPerIteration + 100; // +100 为工具结果
  }

  return totalCost;
}
```

### 2.7.3 System 1 vs System 2 思维

借鉴 Daniel Kahneman 的双系统理论，Agent 系统可以设计两种"思维速度"：

| 维度 | System 1（快思考） | System 2（慢思考） |
|------|-------------------|-------------------|
| 速度 | 快（<1s） | 慢（数秒到数分钟） |
| 消耗 | 低 Token | 高 Token |
| 适用 | 简单分类、路由、缓存命中 | 复杂推理、规划、多步问题 |
| Agent 实现 | 直接响应/规则匹配/小模型 | ReAct / ToT / 多步推理 |
| 典型模型 | Flash/Mini/Haiku 模型 | Pro/Opus/Sonnet 模型 |

```typescript
class CognitiveAgent {
  private fastModel: LLM;  // System 1
  private slowModel: LLM;  // System 2

  constructor(fastModel: LLM, slowModel: LLM) {
    this.fastModel = fastModel;
    this.slowModel = slowModel;
  }

  async process(input: string): Promise<string> {
  // ... 完整实现见 code-examples/ 对应目录
  }

  private async executeTool(toolCall: any): Promise<any> {
    return {};
  }

  private tools: ToolDefinition[] = [];
}
```

---

## 2.8 从 Prompt Engineering 到 Context Engineering

### 2.8.1 Prompt Engineering 的局限

Prompt Engineering 关注的是"如何写出更好的提示词"，但在 Agent 系统中，这远远不够。Agent 需要管理的上下文包括：

- 系统提示词（System Prompt）
- 对话历史（Conversation History）
- 工具定义和返回值（Tool Definitions & Results）
- 检索到的知识（RAG Context）
- Agent 的记忆和笔记（Memory & Notes）
- 其他 Agent 的消息（Multi-Agent Messages）

一个 Agent 的单次 LLM 调用，其上下文可能由六七个不同来源的信息组装而成。手动管理这种复杂度是不可行的。

### 2.8.2 Context Engineering 的定义

"Context Engineering" 这一概念最早由 Shopify CEO **Tobi Lutke** 于 2025 年 6 月 18 日提出，他在一篇公开帖子中写道："I now think 'Context Engineering' is a more useful frame"，主张将关注焦点从"如何写提示词"转向"如何系统性地构建送入模型的上下文"。随后，**Andrej Karpathy** 进一步推广了这一理念，提出了广为流传的论断："Prompt Engineering is dead; Context Engineering is the new game。" 此后，越来越多的从业者将 Context Engineering 从一个概念发展为一套系统化的工程方法论。


Anthropic 的 Zack Witten 将其定义为：

> **Context Engineering** 是一门构建动态系统的学科，它在恰当的时间以恰当的格式提供恰当的信息和工具。

这不是关于"写更好的提示词"，而是关于"构建更好的上下文供给系统"。

### 2.8.3 五大 Context Engineering 原则

1. **信息密度最大化**：每个 token 都应该有价值。冗余信息不仅浪费成本，还会稀释有用信息
2. **时序相关性**：最相关的信息放在最近的位置（利用 LLM 对上下文首尾的高注意力）
3. **结构化组织**：使用 XML 标签、Markdown 标题等结构化标记明确信息边界
4. **动态裁剪**：根据任务动态调整上下文内容——不同任务需要不同的知识
5. **隔离与封装**：不同来源的信息明确标记来源和可信度

```typescript
// Context Engineering 系统的抽象接口
interface ContextEngineer {
  // 为一次 LLM 调用组装最优上下文
  assembleContext(params: {
    task: string;
    conversationHistory: Message[];
    availableTools: ToolDefinition[];
    memoryStore: MemoryStore;
  // ... 省略 87 行，完整实现见 code-examples/ 对应目录

  private estimateTokens(text: string): number {
    // 粗略估计：英文约 4 字符/token，中文约 1.5 字符/token
    return Math.ceil(text.length / 3);
  }
}
```

---

## 2.9 Inference-Time Compute Scaling

2024-2025 年，AI 领域出现了一个重要的范式转变：从关注训练阶段的计算扩展（Training-Time Compute Scaling），转向关注推理阶段的计算扩展（Inference-Time Compute Scaling）。以 OpenAI o1/o3、DeepSeek-R1 为代表的推理模型，通过在推理阶段投入更多计算资源来提升输出质量，深刻改变了 Agent 系统的能力边界和架构设计。

### 2.9.1 从 Training Scaling Laws 到 Inference Scaling

**Training-Time Scaling Laws**（Kaplan et al., 2020；Hoffmann et al., 2022）揭示了一个规律：模型性能随训练数据量、参数规模和训练计算量的增加而可预测地提升。但这条曲线的边际收益在递减——持续加大训练规模的成本越来越高，而回报越来越小。

**Inference-Time Compute Scaling** 提供了另一条提升路径：在模型参数固定的前提下，通过在推理阶段消耗更多计算资源（更多的 "thinking tokens"），来提升复杂任务的表现。

```
Training Scaling (传统路径):
  性能 ∝ C_train^α         (C_train = 训练计算量, α ≈ 0.05-0.1)

Inference Scaling (新路径):
  性能 ∝ C_inference^β     (C_inference = 推理计算量, β 随任务变化)
  
关键洞察：对于推理密集型任务（数学、代码、规划），
β > α，即推理阶段的计算投入回报更高。
```

### 2.9.2 Thinking Tokens 与推理模型

推理模型（如 o1、o3、DeepSeek-R1）的核心创新是引入了 **Thinking Tokens**——模型在生成最终答案之前，先生成一段内部推理过程（对用户可见或不可见），然后基于该推理过程产出结果。

```typescript
/**
 * 推理模型输出结构
 * 区分"思考过程"和"最终回答"两个阶段
 */
interface ReasoningModelOutput {
  /** 内部推理链（thinking tokens） */
  reasoning: {
    /** 推理内容（可能对用户隐藏） */
    content: string;
    /** 推理消耗的 token 数 */
  // ... 完整实现见 code-examples/ 对应目录
  } else if (taskComplexity < 0.7) {
    // 中等任务：适度推理
    return { maxThinkingTokens: 8192, strategy: 'medium' };
  } else {
    // 复杂任务（数学、多步规划）：深度推理
    return { maxThinkingTokens: 32768, strategy: 'high' };
  }
}
```

### 2.9.3 主要推理模型详解

上述 Thinking Tokens 范式在多个模型家族中得到了不同方向的探索。以下逐一分析对 Agent 工程影响最大的几个推理模型。

#### OpenAI o3 与 o4-mini

OpenAI 的推理模型经历了 o1 → o3 → o4-mini 的快速迭代。[[Introducing OpenAI o3 and o4-mini]](https://openai.com/index/introducing-o3-and-o4-mini/)

- **o3（2025 年初）**：在 o1 基础上大幅提升了推理效率和准确率。o3 在 ARC-AGI 基准、竞赛级数学和复杂软件工程任务上展现了显著进步，同时优化了推理链——减少了冗余推理步骤，在保持准确率的前提下降低了 thinking token 消耗。
- **o4-mini（2025 年）**：面向高吞吐 Agent 工作负载设计的小型推理模型。o4-mini 保留了核心推理能力，但成本大幅降低，使其在生产级 Agent 系统中可被频繁调用。它代表了 OpenAI 在推理能力上提供多层次性价比选择的策略——Agent 的简单决策步骤可以使用 o4-mini，而复杂规划步骤使用 o3。

```typescript
/**
 * 根据步骤类型选择推理模型
 * 生产系统中的典型模式：不同步骤使用不同推理预算
 */
function selectReasoningModel(step: AgentStep): { model: string; budget: ReasoningBudget } {
  switch (step.type) {
    case 'planning':
      // 复杂规划使用 o3，高推理预算
      return { model: 'o3', budget: { maxThinkingTokens: 32768, strategy: 'high' } };
    case 'tool_selection':
      // 工具选择使用 o4-mini，中等预算
      return { model: 'o4-mini', budget: { maxThinkingTokens: 4096, strategy: 'medium' } };
    case 'formatting':
      // 格式化输出无需推理模型
      return { model: 'gpt-4o-mini', budget: { maxThinkingTokens: 0, strategy: 'low' } };
    default:
      return { model: 'o4-mini', budget: { maxThinkingTokens: 8192, strategy: 'medium' } };
  }
}
```

#### DeepSeek-R1：基于强化学习的开源推理模型

**DeepSeek-R1** 是开源推理模型的里程碑。它证明了强大的推理能力可以通过 **强化学习（RL）** 而非仅依赖人工标注的推理示例来实现。[[DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning]](https://arxiv.org/abs/2501.12948)

DeepSeek-R1 的核心创新包括：

1. **RL 驱动的推理训练**：使用 Group Relative Policy Optimization（GRPO）算法，模型以正确的最终答案作为奖励信号，通过 RL 自主学习产生有效的 Chain-of-Thought 推理——推理能力是“涌现”出来的，而非从人工示例中模仿的。

2. **蒸馏技术（Distillation）**：DeepSeek-R1 最具影响力的贡献之一是展示了推理能力的**知识蒸馏**路径。具体做法是：先用完整的 R1 模型生成大量高质量推理 trace，再用这些 trace 对较小的模型（如 Qwen-2.5、Llama-3 的 1.5B 到 70B 参数变体）进行微调。蒸馏后的小模型获得了与其参数规模不成比例的强大推理能力。这一技术已成为业界广泛采用的范式。

3. **开放权重**：R1 系列以开放权重形式发布，使得开发者可以在本地部署推理模型并针对特定领域的 Agent 应用进行微调——这对受监管行业中的 Agent 部署尤其重要。

```typescript
/**
 * DeepSeek-R1 蒸馏模型选择器
 * 根据部署约束选择合适的蒸馏变体
 */
interface DistilledModelSpec {
  name: string;
  parameterSize: string;
  reasoningQuality: 'high' | 'medium' | 'moderate';
  memoryRequirement: string;
  useCase: string;
  // ... 完整实现见 code-examples/ 对应目录
  {
    name: 'DeepSeek-R1-Distill-Qwen-1.5B',
    parameterSize: '1.5B',
    reasoningQuality: 'moderate',
    memoryRequirement: '~3GB (FP16)',
    useCase: '边缘设备，低延迟场景',
  },
];
```

#### GPT-5：“推理即默认”

2025 年发布的 **GPT-5** 模糊了推理模型与标准模型的界限。GPT-5 将 Chain-of-Thought 推理**内置为默认行为**——模型根据查询复杂度自动调节推理深度，无需开发者在“快速模型”（如 GPT-4o）和“推理模型”（如 o3）之间手动切换。

这一设计对 Agent 工程的影响：

- **统一模型体验**：Agent 不再需要维护“简单问题→快速模型”和“复杂问题→推理模型”的路由逻辑，GPT-5 自动适配。
- **模型边界模糊化**：“推理模型”与“标准模型”的区分正在失去意义。行业趋势指向推理能力成为模型的内建特性而非独立的产品类别。
- **简化 Agent 架构**：单一模型端点即可同时处理快速工具调用和深度多步规划，降低了系统复杂度。

#### Claude 的 Extended Thinking

Anthropic 通过 **extended thinking**（扩展思考）提供了另一种推理架构。启用后，Claude 在生成最终回复之前使用一个专门的思考阶段来推理复杂问题。[[Extended thinking - Anthropic]](https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking)

关键特性：

- **可配置的推理预算**：开发者可以设定最大 thinking token 数，精确控制推理深度与延迟/成本之间的权衡。
- **流式思考过程**：思考过程可以流式传输到应用层，允许 Agent 编排器实时监控推理状态并在必要时介入。
- **与工具调用的结合**：Extended thinking 可以与 Claude 的工具调用能力结合，模型可以先深度推理应该调用哪些工具、如何解读工具结果，再执行动作。

Extended thinking 对涉及复杂规划、多约束优化、或需要在不确定性和边界情况之间进行推理的 Agent 应用尤为有价值。

#### 推理模型格局总结

| 模型 | 提供者 | 开放性 | 核心机制 | Agent 典型用途 |
|------|--------|--------|---------|--------------|
| o3 | OpenAI | 闭源 API | 内部 CoT，可配置推理预算 | 复杂规划、数学推理 |
| o4-mini | OpenAI | 闭源 API | 轻量级内部 CoT | 高频工具选择、中等推理 |
| GPT-5 | OpenAI | 闭源 API | 推理即默认，自动适配 | 通用 Agent（统一端点） |
| DeepSeek-R1 | DeepSeek | 开放权重 | RL 训练 + 蒸馏 | 本地部署、领域定制 |
| Claude (Extended Thinking) | Anthropic | 闭源 API | 可配置 thinking phase | 长链推理、安全关键场景 |

### 2.9.4 对 Agent 架构的影响

Inference-Time Compute Scaling 对 Agent 系统设计产生了深远影响：

**1. 动态计算分配**

Agent 不再需要对所有步骤使用同一模型和参数。推理密集步骤（规划、代码生成、复杂推理）可以分配更多 thinking tokens，而简单步骤（格式转换、信息提取）使用快速推理模式。

**2. System 2 思维的工程化实现**

第 2.7 节讨论的 System 1 / System 2 双系统思维，在推理模型中获得了具体的工程实现。System 1 对应快速的直接推理（低 thinking token 预算），System 2 对应深度思考（高 thinking token 预算）。Agent 的控制循环可以根据任务类型在两种模式间切换。

**3. 成本-质量权衡的新维度**

推理时计算扩展引入了新的成本维度。Thinking tokens 通常按与 output tokens 相同或更高的费率计费，深度推理可能使单次调用成本增加 10-50 倍。Agent 系统需要建立推理预算管理机制，在回答质量和成本之间取得平衡。

**4. 与传统 Agent 推理模式的融合**

推理模型的内部 Chain-of-Thought 并不能替代 Agent 的外部推理循环（ReAct、Plan-and-Execute 等）。两者是互补关系：

```
外部推理循环（Agent 控制流）:
  Think → Act → Observe → Think → ...
  
内部推理链（模型 thinking tokens）:
  每个 "Think" 步骤内部：
    分析问题 → 考虑方案 → 评估风险 → 生成决策

最佳实践：外部循环负责任务分解和工具编排，
内部推理负责每步决策的深度思考。
```


---

## 2.10 不可靠性税

### 2.10.1 概念定义

**不可靠性税（Unreliability Tax）**是指 Agent 系统为应对 LLM 的不确定性而付出的额外工程成本。这是每个 Agent 工程师都必须正视的"隐性税收"。

```typescript
interface UnreliabilityTax {
  // 重试成本：LLM 输出格式错误需要重试
  retryOverhead: number;
  // 验证成本：需要额外的输出验证逻辑
  validationOverhead: number;
  // 降级成本：需要维护备用处理路径
  fallbackOverhead: number;
  // 监控成本：需要更多的日志和告警
  monitoringOverhead: number;
  // 人工介入成本：需要 HITL 审批机制
  humanReviewOverhead: number;
}
```

从决策理论的视角看，不可靠性税是 Agent 系统在**随机性环境**（2.2 节）中运行的固有成本。POMDP 理论告诉我们，部分可观测性必然增加决策成本——不可靠性税就是这一理论预测的工程现实。

### 2.10.2 降低不可靠性税的策略

| 策略 | 方法 | 效果 | 理论基础 |
|------|------|------|---------|
| 结构化输出 | JSON Schema / Zod 约束 | 消除格式错误 | 约束动作空间（MDP） |
| 工具约束 | 限定可选工具集 | 减少错误调用 | 减小动作空间 |
| 温度控制 | temperature=0 | 提高一致性 | 降低随机性 |
| 少样本示例 | 提供成功案例 | 引导正确行为 | ICL 理论 |
| 输出验证 | 运行时类型检查 | 捕获异常输出 | 确定性外壳 |
| 重试机制 | 指数退避重试 | 容忍临时失败 | 随机过程多次采样 |
| Self-Consistency | 多次采样取共识 | 提高准确度 | CoT 理论 |
| 人工审核 | HITL 关键节点 | 兜底安全网 | 效用理论风险管理 |

---

## 2.11 本章小结

本章从六个理论维度为 Agent 工程奠定了基础：

1. **Agent 的形式化定义**（2.1 节）：Agent 是从感知序列到动作的映射函数，理性 Agent 最大化期望性能度量。LLM Agent 是经典 Agent 理论的特化实例。

2. **决策理论**（2.2 节）：MDP/POMDP 框架描述了 Agent 的序贯决策问题，效用理论为"好的决策"提供了公理化标准，期望效用最大化是理性 Agent 的行为准则。

3. **规划理论**（2.3 节）：从经典 STRIPS/PDDL 到层次任务网络（HTN），再到现代 LLM Agent 的 ReAct、Plan-and-Execute 和 Tree-of-Thoughts，规划能力是 Agent 处理复杂任务的关键。

4. **Multi-Agent 理论**（2.4 节）：博弈论（纳什均衡、合作博弈）为多 Agent 交互提供数学框架，言语行为理论指导 Agent 通信协议设计，共识机制解决集体决策问题。

5. **认知架构**（2.5 节）：BDI 的信念-愿望-意图管理、ACT-R 的记忆激活模型、SOAR 的问题空间搜索，这些经典架构中的设计模式至今仍对 LLM Agent 有直接指导价值。

6. **LLM 作为推理引擎**（2.6-2.8 节）：涌现能力与 Scaling Laws 决定了 LLM 的能力边界，ICL 和 CoT 是 Agent 利用 LLM 的核心机制，Context Engineering 是管理复杂上下文的系统方法论。

7. **推理时计算扩展**（2.9 节）：从 OpenAI o1/o3/o4-mini 到 DeepSeek-R1 的开源 RL 路径，从 GPT-5 的“推理即默认”到 Claude 的 Extended Thinking，推理模型深刻改变了 Agent 的规划质量、错误恢复能力和成本结构。

这些理论不是抽象的学术知识，而是你在后续章节中进行每一个工程决策的理论依据。当你在第三章选择架构模式时、在第四章设计工具系统时、在第六章构建多 Agent 系统时，请回来翻阅本章——理论会告诉你为什么某些设计是好的，而另一些注定会失败。

---

> **延伸阅读**
>
> - Stuart Russell & Peter Norvig, *Artificial Intelligence: A Modern Approach* (4th ed., 2020) — Agent 理论的经典教材
> - Richard Bellman, *Dynamic Programming* (1957) — MDP 和值迭代的理论源头
> - Michael Bratman, *Intention, Plans, and Practical Reason* (1987) — BDI 模型的哲学基础
> - John Anderson, *The Architecture of Cognition* (1983) — ACT-R 认知架构
> - Allen Newell, *Unified Theories of Cognition* (1990) — SOAR 架构
> - Jared Kaplan et al., "Scaling Laws for Neural Language Models" (2020) — Scaling Laws
> - Jason Wei et al., "Chain-of-Thought Prompting Elicits Reasoning" (2022) — CoT 推理
> - Jason Wei et al., "Emergent Abilities of Large Language Models" (2022) — 涌现能力
> - Shunyu Yao et al., "ReAct: Synergizing Reasoning and Acting" (2023) — ReAct 框架
> - Yao et al., "Tree of Thoughts: Deliberate Problem Solving with LLMs" (2023) — ToT 推理
> - Anthropic, "Context Engineering for AI Agents" (2025) — Context Engineering
> - Daniel Kahneman, *Thinking, Fast and Slow* (2011) — 双系统理论
> - Andrej Karpathy, "State of GPT" (2023) — LLM 能力分析

