# 第二章：理论基础 — 从经典 AI 到 LLM Agent

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
  }

  execute(percept: Percept): Action {
    // 仅根据当前感知匹配规则
    const key = this.interpretPercept(percept);
    return this.rules.get(key) ?? { type: 'noop', params: {} };
  }

  private interpretPercept(p: Percept): string {
    return String(p.data);
  }
}

// 2. 基于模型的反射型 Agent
class ModelBasedReflexAgent implements AgentProgram {
  private state: AgentState;
  private model: EnvironmentModel;
  private rules: Map<string, Action>;

  constructor(model: EnvironmentModel, rules: Map<string, Action>) {
    this.state = { history: [], beliefs: {} };
    this.model = model;
    this.rules = rules;
  }

  execute(percept: Percept): Action {
    // 更新内部状态（维护对环境的信念）
    this.state = this.model.update(this.state, percept);
    // 基于内部状态匹配规则
    const key = this.interpretState(this.state);
    return this.rules.get(key) ?? { type: 'noop', params: {} };
  }

  private interpretState(s: AgentState): string {
    return JSON.stringify(s.beliefs);
  }
}

// 3. 基于目标的 Agent
class GoalBasedAgent implements AgentProgram {
  private state: AgentState;
  private model: EnvironmentModel;
  private goal: Goal;

  constructor(model: EnvironmentModel, goal: Goal) {
    this.state = { history: [], beliefs: {} };
    this.model = model;
    this.goal = goal;
  }

  execute(percept: Percept): Action {
    this.state = this.model.update(this.state, percept);

    // 搜索能达成目标的动作序列
    const plan = this.search(this.state, this.goal);
    return plan[0] ?? { type: 'noop', params: {} };
  }

  private search(state: AgentState, goal: Goal): Action[] {
    // 规划算法——在第 2.3 节详细讨论
    return [];
  }
}

// 4. 基于效用的 Agent
class UtilityBasedAgent implements AgentProgram {
  private state: AgentState;
  private model: EnvironmentModel;
  private utilityFn: (state: AgentState) => number;

  constructor(model: EnvironmentModel, utilityFn: (s: AgentState) => number) {
    this.state = { history: [], beliefs: {} };
    this.model = model;
    this.utilityFn = utilityFn;
  }

  execute(percept: Percept): Action {
    this.state = this.model.update(this.state, percept);

    // 评估每个动作的期望效用，选择最优
    let bestAction: Action = { type: 'noop', params: {} };
    let bestUtility = -Infinity;

    for (const action of this.getAvailableActions()) {
      const expectedState = this.model.predict(this.state, action);
      const utility = this.utilityFn(expectedState);
      if (utility > bestUtility) {
        bestUtility = utility;
        bestAction = action;
      }
    }

    return bestAction;
  }

  private getAvailableActions(): Action[] {
    return [];
  }
}

// 辅助类型定义
interface AgentState {
  history: Percept[];
  beliefs: Record<string, unknown>;
}

interface EnvironmentModel {
  update(state: AgentState, percept: Percept): AgentState;
  predict(state: AgentState, action: Action): AgentState;
}

interface Goal {
  test(state: AgentState): boolean;
}

interface KnowledgeBase {
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

// 典型 LLM Agent 环境
const typicalLLMAgentEnv: EnvironmentProperties = {
  observability: 'partial',
  determinism: 'stochastic',
  episodic: false,       // 序贯式——历史影响未来
  dynamic: true,         // 外部世界实时变化
  discrete: true,        // 有限工具集
  multiAgent: false,     // 单 Agent 为主（多 Agent 见 2.4 节）
};

// 根据环境特征选择 Agent 架构
function recommendArchitecture(env: EnvironmentProperties): string {
  if (env.observability === 'full' && env.determinism === 'deterministic') {
    return '简单反射型或基于目标的 Agent 即可';
  }
  if (env.observability === 'partial') {
    if (env.episodic) {
      return '带状态追踪的 ReAct Agent';
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
  // 折扣因子
  gamma: number;
}

// 策略：从状态到动作的映射
type Policy<S, A> = (state: S) => A;

// 值函数：每个状态的期望累积回报
type ValueFunction<S> = Map<S, number>;

// 值迭代算法（Value Iteration）
function valueIteration<S, A>(mdp: MDP<S, A>, epsilon: number = 0.001): {
  values: ValueFunction<S>;
  policy: Policy<S, A>;
} {
  // 初始化值函数
  const V: Map<S, number> = new Map();
  for (const s of mdp.states) {
    V.set(s, 0);
  }

  // 迭代直到收敛
  let delta: number;
  do {
    delta = 0;
    for (const s of mdp.states) {
      const oldV = V.get(s) ?? 0;

      // 找到使期望值最大的动作
      let bestValue = -Infinity;
      for (const a of mdp.actions) {
        let expectedValue = 0;
        const transitions = mdp.transition(s, a);

        for (const [nextState, prob] of transitions) {
          const reward = mdp.reward(s, a, nextState);
          const futureValue = V.get(nextState) ?? 0;
          expectedValue += prob * (reward + mdp.gamma * futureValue);
        }

        bestValue = Math.max(bestValue, expectedValue);
      }

      V.set(s, bestValue);
      delta = Math.max(delta, Math.abs(oldV - bestValue));
    }
  } while (delta > epsilon);

  // 从值函数中提取最优策略
  const policy: Policy<S, A> = (state: S) => {
    let bestAction = mdp.actions[0];
    let bestValue = -Infinity;

    for (const a of mdp.actions) {
      let expectedValue = 0;
      const transitions = mdp.transition(state, a);

      for (const [nextState, prob] of transitions) {
        const reward = mdp.reward(state, a, nextState);
        const futureValue = V.get(nextState) ?? 0;
        expectedValue += prob * (reward + mdp.gamma * futureValue);
      }

      if (expectedValue > bestValue) {
        bestValue = expectedValue;
        bestAction = a;
      }
    }

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
  | { type: 'respond'; content: string }
  | { type: 'ask_clarification'; question: string }
  | { type: 'delegate'; agent: string; task: string };

// Agent 的策略函数（由 LLM 隐式实现）
async function agentPolicy(
  state: AgentDecisionState,
  llm: LLM,
  tools: ToolDefinition[]
): Promise<AgentDecisionAction> {
  const response = await llm.chat({
    messages: state.conversationHistory,
    tools,
    temperature: 0,
  });

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
      probabilities: number[];
    }>;
    unknown: string[];                   // 完全未知的
  };

  // 信息增益追踪
  informationGap: string[];  // 需要通过工具调用或提问来填补的信息缺口
}

// 信念更新：贝叶斯规则
function updateBelief(
  currentBelief: Map<string, number>,
  observation: string,
  observationModel: (state: string, obs: string) => number
): Map<string, number> {
  const newBelief = new Map<string, number>();
  let totalProb = 0;

  for (const [state, prior] of currentBelief) {
    const likelihood = observationModel(state, observation);
    const posterior = prior * likelihood;
    newBelief.set(state, posterior);
    totalProb += posterior;
  }

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
  latency: number;           // 耗时（毫秒）
  userSatisfaction: number;  // 用户满意度估计
  sideEffects: string[];     // 副作用
}

class WeightedUtilityFunction implements AgentUtility {
  constructor(private weights: {
    completion: number;    // 任务完成权重
    accuracy: number;      // 准确度权重
    costPenalty: number;   // 成本惩罚权重
    latencyPenalty: number; // 延迟惩罚权重
    satisfaction: number;  // 满意度权重
  }) {}

  evaluate(outcome: AgentOutcome): number {
    let utility = 0;

    if (outcome.taskCompleted) {
      utility += this.weights.completion;
    }
    utility += outcome.accuracy * this.weights.accuracy;
    utility -= outcome.tokenCost * this.weights.costPenalty;
    utility -= outcome.latency * this.weights.latencyPenalty;
    utility += outcome.userSatisfaction * this.weights.satisfaction;

    // 副作用严重惩罚
    utility -= outcome.sideEffects.length * 10;

    return utility;
  }
}

// 示例：不同场景下的效用权重配置
const customerServiceWeights = {
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

  for (const action of actions) {
    // 预测可能的结果及其概率
    const outcomes = await outcomePredictor.predict(state, action);

    // 计算期望效用
    let expectedUtility = 0;
    for (const { outcome, probability } of outcomes) {
      expectedUtility += probability * utilityFn.evaluate(outcome);
    }

    if (expectedUtility > bestExpectedUtility) {
      bestExpectedUtility = expectedUtility;
      bestAction = action;
    }
  }

  return bestAction;
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
  preconditions: Set<string>;  // 执行该动作的前提条件
  addEffects: Set<string>;     // 执行后添加的谓词
  deleteEffects: Set<string>;  // 执行后删除的谓词
}

interface STRIPSProblem {
  initialState: STRIPSState;
  goalConditions: Set<string>;
  actions: STRIPSAction[];
}

// 检查一个状态是否满足目标
function isGoalSatisfied(state: STRIPSState, goal: Set<string>): boolean {
  for (const condition of goal) {
    if (!state.predicates.has(condition)) return false;
  }
  return true;
}

// 检查一个动作是否可执行
function isApplicable(state: STRIPSState, action: STRIPSAction): boolean {
  for (const pre of action.preconditions) {
    if (!state.predicates.has(pre)) return false;
  }
  return true;
}

// 执行一个动作，返回新状态
function applyAction(state: STRIPSState, action: STRIPSAction): STRIPSState {
  const newPredicates = new Set(state.predicates);
  for (const del of action.deleteEffects) {
    newPredicates.delete(del);
  }
  for (const add of action.addEffects) {
    newPredicates.add(add);
  }
  return { predicates: newPredicates };
}

// 前向搜索规划器（Forward State-Space Search）
function forwardPlanner(problem: STRIPSProblem): STRIPSAction[] | null {
  interface SearchNode {
    state: STRIPSState;
    plan: STRIPSAction[];
  }

  const queue: SearchNode[] = [{ state: problem.initialState, plan: [] }];
  const visited = new Set<string>();
  visited.add(serializeState(problem.initialState));

  while (queue.length > 0) {
    const node = queue.shift()!;

    if (isGoalSatisfied(node.state, problem.goalConditions)) {
      return node.plan;
    }

    for (const action of problem.actions) {
      if (isApplicable(node.state, action)) {
        const newState = applyAction(node.state, action);
        const key = serializeState(newState);
        if (!visited.has(key)) {
          visited.add(key);
          queue.push({
            state: newState,
            plan: [...node.plan, action],
          });
        }
      }
    }
  }

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
  name: string;
  // 该方法适用于哪种复合任务
  taskName: string;
  // 前置条件
  preconditions: (state: STRIPSState, params: Record<string, string>) => boolean;
  // 将复合任务分解为子任务列表
  decompose: (params: Record<string, string>) => Task[];
}

interface HTNDomain {
  primitiveActions: STRIPSAction[];
  methods: Method[];
}

// HTN 规划器
function htnPlanner(
  domain: HTNDomain,
  initialState: STRIPSState,
  tasks: Task[]
): STRIPSAction[] | null {
  return htnPlan(domain, initialState, [...tasks]);
}

function htnPlan(
  domain: HTNDomain,
  state: STRIPSState,
  tasks: Task[]
): STRIPSAction[] | null {
  // 基础情况：没有剩余任务
  if (tasks.length === 0) return [];

  const currentTask = tasks[0];
  const remainingTasks = tasks.slice(1);

  if (currentTask.type === 'primitive') {
    // 原始任务：直接查找并执行对应动作
    const action = domain.primitiveActions.find(
      a => a.name === currentTask.name
    );
    if (!action || !isApplicable(state, action)) return null;

    const newState = applyAction(state, action);
    const restPlan = htnPlan(domain, newState, remainingTasks);
    if (restPlan === null) return null;

    return [action, ...restPlan];
  } else {
    // 复合任务：尝试用各种方法分解
    const applicableMethods = domain.methods.filter(
      m => m.taskName === currentTask.name &&
           m.preconditions(state, currentTask.params)
    );

    for (const method of applicableMethods) {
      const subtasks = method.decompose(currentTask.params);
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

async function reactLoop(
  llm: LLM,
  question: string,
  tools: ToolDefinition[],
  maxSteps: number = 10
): Promise<string> {
  const steps: ReActStep[] = [];
  let currentContext = question;

  for (let i = 0; i < maxSteps; i++) {
    // 构造包含历史步骤的提示
    const prompt = buildReActPrompt(question, steps, tools);

    // LLM 生成 Thought + Action
    const response = await llm.generate(prompt);
    const parsed = parseReActResponse(response);

    if (parsed.action === 'finish') {
      return parsed.actionInput['answer'] as string;
    }

    // 执行动作并获取观察
    const observation = await executeTool(parsed.action, parsed.actionInput);

    steps.push({
      thought: parsed.thought,
      action: parsed.action,
      actionInput: parsed.actionInput,
      observation,
    });
  }

  return '达到最大步数限制，任务未完成';
}

function buildReActPrompt(
  question: string, steps: ReActStep[], tools: ToolDefinition[]
): string {
  // 构造 ReAct 格式的提示
  return '';
}

function parseReActResponse(response: string): {
  thought: string; action: string; actionInput: Record<string, unknown>;
} {
  return { thought: '', action: '', actionInput: {} };
}

async function executeTool(
  name: string, input: Record<string, unknown>
): Promise<string> {
  return '';
}

interface LLM {
  generate(prompt: string): Promise<string>;
  chat(params: { messages: Message[]; tools?: ToolDefinition[]; temperature?: number }): Promise<any>;
  classify(input: string, options: { categories: string[] }): Promise<string>;
}

interface Message {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
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
  description: string;
  tool?: string;
  params?: Record<string, unknown>;
  dependsOn: string[];  // 依赖的前置步骤
}

async function planAndExecute(
  llm: LLM,
  task: string,
  tools: ToolDefinition[]
): Promise<string> {
  // 阶段一：规划
  const plan = await generatePlan(llm, task, tools);

  // 阶段二：执行
  const results = new Map<string, unknown>();

  for (const step of topologicalSort(plan.steps)) {
    // 检查前置步骤是否完成
    const depsReady = step.dependsOn.every(dep => results.has(dep));
    if (!depsReady) {
      throw new Error(`步骤 ${step.id} 的依赖未满足`);
    }

    // 执行步骤
    try {
      const result = await executeStep(step, results);
      results.set(step.id, result);
    } catch (error) {
      // 检查是否有应急计划
      const fallback = plan.contingencies.get(step.id);
      if (fallback) {
        // 执行应急计划...
      } else {
        // 请求 LLM 重新规划
        const revisedPlan = await replan(llm, task, tools, results, error);
        // 继续执行修订后的计划...
      }
    }
  }

  // 阶段三：综合结果
  return await synthesizeResult(llm, task, results);
}

async function generatePlan(
  llm: LLM, task: string, tools: ToolDefinition[]
): Promise<ExecutionPlan> {
  return { steps: [], contingencies: new Map() };
}

function topologicalSort(steps: PlanStep[]): PlanStep[] {
  return steps; // 简化实现
}

async function executeStep(
  step: PlanStep, context: Map<string, unknown>
): Promise<unknown> {
  return {};
}

async function replan(
  llm: LLM, task: string, tools: ToolDefinition[],
  results: Map<string, unknown>, error: unknown
): Promise<ExecutionPlan> {
  return { steps: [], contingencies: new Map() };
}

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
  llm: LLM,
  problem: string,
  maxDepth: number = 3,
  branchingFactor: number = 3,
  beamWidth: number = 2
): Promise<string> {
  // 根节点
  const root: ThoughtNode = {
    thought: problem,
    score: 0,
    children: [],
    parent: null,
    depth: 0,
  };

  let currentLevel: ThoughtNode[] = [root];

  for (let depth = 0; depth < maxDepth; depth++) {
    const nextLevel: ThoughtNode[] = [];

    for (const node of currentLevel) {
      // 生成多个候选思维
      const candidates = await generateThoughts(
        llm, node, branchingFactor
      );

      // 评估每个候选思维
      for (const candidate of candidates) {
        candidate.score = await evaluateThought(llm, problem, candidate);
        node.children.push(candidate);
        nextLevel.push(candidate);
      }
    }

    // Beam Search：只保留最好的 beamWidth 个节点
    nextLevel.sort((a, b) => b.score - a.score);
    currentLevel = nextLevel.slice(0, beamWidth);
  }

  // 选择最佳叶子节点，回溯构造完整推理链
  const bestLeaf = currentLevel[0];
  return reconstructReasoning(bestLeaf);
}

async function generateThoughts(
  llm: LLM, parent: ThoughtNode, n: number
): Promise<ThoughtNode[]> {
  // 让 LLM 从当前思维出发生成 n 个下一步推理
  return [];
}

async function evaluateThought(
  llm: LLM, problem: string, node: ThoughtNode
): Promise<number> {
  // 让 LLM 评估该推理路径的质量（0-1）
  return 0;
}

function reconstructReasoning(leaf: ThoughtNode): string {
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
    lastResult: unknown
  ): Promise<PlanStep[]>;
  // 判断是否需要重新规划
  needsReplanning(
    plan: PlanStep[],
    lastResult: unknown,
    state: AgentDecisionState
  ): Promise<boolean>;
}

async function interleavedExecution(
  planner: AdaptivePlanner,
  goal: string,
  initialState: AgentDecisionState
): Promise<unknown> {
  let state = initialState;
  let plan = await planner.plan(goal, state);
  const completedSteps: PlanStep[] = [];

  while (plan.length > 0) {
    const currentStep = plan[0];
    const remainingPlan = plan.slice(1);

    // 执行当前步骤
    const result = await executeStep(currentStep, new Map());

    completedSteps.push(currentStep);

    // 判断是否需要重新规划
    const shouldReplan = await planner.needsReplanning(
      remainingPlan, result, state
    );

    if (shouldReplan) {
      plan = await planner.replan(
        goal, state, completedSteps, remainingPlan, result
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
function prisonersDilemma(): NormalFormGame<'cooperate' | 'defect'> {
  return {
    players: ['agent_1', 'agent_2'],
    strategies: new Map([
      ['agent_1', ['cooperate', 'defect']],
      ['agent_2', ['cooperate', 'defect']],
    ]),
    utility: (profile) => {
      const a1 = profile.get('agent_1')!;
      const a2 = profile.get('agent_2')!;

      // 经典收益矩阵
      if (a1 === 'cooperate' && a2 === 'cooperate') {
        return new Map([['agent_1', 3], ['agent_2', 3]]);  // 双方合作
      }
      if (a1 === 'cooperate' && a2 === 'defect') {
        return new Map([['agent_1', 0], ['agent_2', 5]]);  // 被背叛
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

    // 遍历所有不包含 player 的子集
    const otherPlayers = players.filter(p => p !== player);
    const subsets = getAllSubsets(otherPlayers);

    for (const subset of subsets) {
      const s = subset.length;
      // 权重：|S|! × (n - |S| - 1)! / n!
      const weight = (factorial(s) * factorial(n - s - 1)) / factorial(n);

      // player 对联盟 subset 的边际贡献
      const withPlayer = new Set([...subset, player]);
      const withoutPlayer = new Set(subset);
      const marginalContribution =
        characteristicFunction(withPlayer) -
        characteristicFunction(withoutPlayer);

      totalContribution += weight * marginalContribution;
    }

    result.set(player, totalContribution);
  }

  return result;
}

function getAllSubsets(arr: string[]): string[][] {
  const result: string[][] = [[]];
  for (const item of arr) {
    const newSubsets = result.map(subset => [...subset, item]);
    result.push(...newSubsets);
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

interface AgentMessage {
  id: string;
  sender: string;
  receiver: string;
  performative: SpeechActType;  // 言语行为类型
  content: unknown;
  replyTo?: string;              // 回复哪条消息
  timestamp: number;
}

// Agent 通信管道
interface CommunicationChannel {
  send(message: AgentMessage): Promise<void>;
  receive(agentId: string): AsyncIterable<AgentMessage>;
  broadcast(message: Omit<AgentMessage, 'receiver'>): Promise<void>;
}

// 任务委托协议（Contract Net Protocol 的简化版）
async function contractNetProtocol(
  manager: string,
  workers: string[],
  task: string,
  channel: CommunicationChannel
): Promise<{ winner: string; result: unknown }> {
  // 1. Manager 发布任务公告（Call for Proposals）
  await channel.broadcast({
    id: crypto.randomUUID(),
    sender: manager,
    performative: 'request',
    content: { task, type: 'call_for_proposals' },
    timestamp: Date.now(),
  });

  // 2. 收集 Worker 的提案
  const proposals: AgentMessage[] = [];
  for await (const msg of channel.receive(manager)) {
    if (msg.performative === 'propose') {
      proposals.push(msg);
    }
    if (proposals.length >= workers.length) break;
  }

  // 3. 评估提案并选择最佳 Worker
  const bestProposal = proposals.sort(
    (a, b) => (b.content as any).confidence - (a.content as any).confidence
  )[0];

  // 4. 向获胜者发送接受通知
  await channel.send({
    id: crypto.randomUUID(),
    sender: manager,
    receiver: bestProposal.sender,
    performative: 'request',
    content: { task, type: 'execute' },
    timestamp: Date.now(),
  });

  // 5. 等待执行结果
  for await (const msg of channel.receive(manager)) {
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
  private proposals: Map<string, T> = new Map();
  private requiredVotes: number;

  constructor(totalAgents: number) {
    this.requiredVotes = Math.floor(totalAgents / 2) + 1;
  }

  propose(agentId: string, value: T): void {
    this.proposals.set(agentId, value);
  }

  async resolve(): Promise<T> {
    // 统计每个值的票数
    const votes = new Map<string, { value: T; count: number }>();

    for (const [, value] of this.proposals) {
      const key = JSON.stringify(value);
      const existing = votes.get(key);
      if (existing) {
        existing.count++;
      } else {
        votes.set(key, { value, count: 1 });
      }
    }

    // 找到票数最多的值
    let winner: T | null = null;
    let maxVotes = 0;
    for (const [, { value, count }] of votes) {
      if (count > maxVotes) {
        maxVotes = count;
        winner = value;
      }
    }

    if (winner === null || maxVotes < this.requiredVotes) {
      throw new Error('未能达成共识');
    }

    return winner;
  }
}

// 加权共识（基于 Agent 置信度）
class WeightedConsensus implements ConsensusProtocol<string> {
  private proposals: { agentId: string; value: string; confidence: number }[] = [];

  propose(agentId: string, value: string): void {
    // 此处 confidence 需通过其他方式传入，简化处理
    this.proposals.push({ agentId, value, confidence: 1.0 });
  }

  proposeWithConfidence(
    agentId: string, value: string, confidence: number
  ): void {
    this.proposals.push({ agentId, value, confidence });
  }

  async resolve(): Promise<string> {
    // 按值分组，计算加权总分
    const scores = new Map<string, number>();

    for (const { value, confidence } of this.proposals) {
      scores.set(value, (scores.get(value) ?? 0) + confidence);
    }

    // 选择加权分数最高的值
    let bestValue = '';
    let bestScore = -Infinity;
    for (const [value, score] of scores) {
      if (score > bestScore) {
        bestScore = score;
        bestValue = value;
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

interface Desire {
  id: string;
  description: string;
  priority: number;         // 优先级
  achievementCondition: (beliefs: Belief[]) => boolean;  // 达成条件
  incompatibleWith?: string[];  // 与哪些愿望冲突
}

interface Intention {
  desireId: string;
  plan: PlanStep[];
  currentStep: number;
  status: 'active' | 'suspended' | 'completed' | 'failed';
  commitmentLevel: 'blind' | 'single-minded' | 'open-minded';
}

class BDIAgent {
  private beliefs: Map<string, Belief> = new Map();
  private desires: Desire[] = [];
  private intentions: Intention[] = [];

  // BDI 推理循环
  async reasoningCycle(): Promise<void> {
    // 1. 信念修正（Belief Revision）
    await this.updateBeliefs();

    // 2. 愿望生成（Desire Generation / Option Generation）
    this.generateOptions();

    // 3. 慎思（Deliberation）：从愿望中选择意图
    this.deliberate();

    // 4. 手段-目的推理（Means-Ends Reasoning）：为意图制定计划
    await this.planIntentions();

    // 5. 执行（Execution）：执行当前意图的下一步
    await this.executeIntentions();
  }

  private async updateBeliefs(): Promise<void> {
    // 从环境感知中更新信念
    // 可能涉及：传感器数据、工具调用结果、其他 Agent 的消息
  }

  private generateOptions(): void {
    // 基于当前信念生成新的愿望
    // 也会移除不再相关的愿望
  }

  private deliberate(): void {
    // 选择要承诺的意图
    // 考虑：优先级、资源约束、愿望之间的兼容性

    // 检查现有意图是否仍然有效
    this.intentions = this.intentions.filter(intention => {
      const desire = this.desires.find(d => d.id === intention.desireId);
      if (!desire) return false;

      switch (intention.commitmentLevel) {
        case 'blind':
          // 盲目承诺：无论如何都继续
          return true;
        case 'single-minded':
          // 专注承诺：只要目标仍可能达成就继续
          return !desire.achievementCondition([...this.beliefs.values()]);
        case 'open-minded':
          // 开放承诺：定期重新评估
          return this.isStillWorthPursuing(intention);
      }
    });

    // 从未被采纳的愿望中选择新的意图
    for (const desire of this.desires) {
      const alreadyIntended = this.intentions.some(
        i => i.desireId === desire.id
      );
      if (alreadyIntended) continue;

      // 检查资源约束和兼容性
      if (this.canAdopt(desire)) {
        this.intentions.push({
          desireId: desire.id,
          plan: [],
          currentStep: 0,
          status: 'active',
          commitmentLevel: 'single-minded',
        });
      }
    }
  }

  private isStillWorthPursuing(intention: Intention): boolean {
    // 评估继续执行该意图的价值是否超过成本
    return true;
  }

  private canAdopt(desire: Desire): boolean {
    // 检查是否与现有意图冲突
    for (const intention of this.intentions) {
      const existingDesire = this.desires.find(
        d => d.id === intention.desireId
      );
      if (existingDesire?.incompatibleWith?.includes(desire.id)) {
        return false;
      }
    }
    return true;
  }

  private async planIntentions(): Promise<void> {
    for (const intention of this.intentions) {
      if (intention.plan.length === 0 || intention.status === 'active') {
        // 为意图生成或修订计划
        // 在 LLM Agent 中，这一步由 LLM 完成
      }
    }
  }

  private async executeIntentions(): Promise<void> {
    for (const intention of this.intentions) {
      if (intention.status !== 'active') continue;

      const step = intention.plan[intention.currentStep];
      if (!step) {
        intention.status = 'completed';
        continue;
      }

      try {
        await executeStep(step, new Map());
        intention.currentStep++;
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
  private decayRate: number = 0.5;  // 记忆衰减率

  // 计算基础激活水平
  private baseLevelActivation(chunk: MemoryChunk, now: number): number {
    // B_i = ln(Σ_j t_j^(-d))
    // t_j 是自第 j 次访问以来的时间，d 是衰减率
    let sum = 0;
    for (const accessTime of chunk.accessHistory) {
      const timeSince = (now - accessTime) / 1000; // 秒
      if (timeSince > 0) {
        sum += Math.pow(timeSince, -this.decayRate);
      }
    }
    return sum > 0 ? Math.log(sum) : -Infinity;
  }

  // 检索最相关的记忆块
  retrieve(
    cue: Record<string, unknown>,
    associationStrengths: Map<string, Map<string, number>>,
    threshold: number = 0
  ): MemoryChunk | null {
    const now = Date.now();
    let bestChunk: MemoryChunk | null = null;
    let bestActivation = -Infinity;

    for (const [id, chunk] of this.chunks) {
      // 基础激活
      let activation = this.baseLevelActivation(chunk, now);

      // 关联激活（spreading activation）
      for (const [cueKey] of Object.entries(cue)) {
        const strengths = associationStrengths.get(cueKey);
        if (strengths?.has(id)) {
          activation += strengths.get(id)!;
        }
      }

      // 添加噪声（模拟人类记忆的随机性）
      activation += this.logisticNoise(0.25);

      if (activation > bestActivation && activation > threshold) {
        bestActivation = activation;
        bestChunk = chunk;
      }
    }

    // 记录访问
    if (bestChunk) {
      bestChunk.accessHistory.push(now);
    }

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
  preconditions: (state: SOARState) => boolean;
  apply: (state: SOARState) => SOARState;
  preference: number;  // 偏好值，用于选择
}

interface LearnedRule {
  condition: (state: SOARState) => boolean;
  production: (state: SOARState) => Operator;
}

class SOARAgent {
  private workingMemory: SOARState;
  private learnedRules: LearnedRule[] = [];

  constructor(initialState: SOARState) {
    this.workingMemory = initialState;
  }

  // SOAR 决策周期
  async decisionCycle(): Promise<void> {
    // 1. 输入阶段：感知并更新工作记忆
    await this.inputPhase();

    // 2. 提议阶段：提出候选操作符
    const candidates = this.proposePhase();

    // 3. 决策阶段：选择一个操作符
    const selected = this.decisionPhase(candidates);

    if (selected === null) {
      // 困境（Impasse）！无法选择操作符
      await this.handleImpasse(candidates);
      return;
    }

    // 4. 应用阶段：执行选定的操作符
    this.workingMemory = selected.apply(this.workingMemory);
  }

  private async inputPhase(): Promise<void> {
    // 从环境中感知并更新工作记忆
  }

  private proposePhase(): Operator[] {
    // 首先检查已学习的规则
    for (const rule of this.learnedRules) {
      if (rule.condition(this.workingMemory)) {
        return [rule.production(this.workingMemory)];
      }
    }

    // 返回所有满足前置条件的操作符
    return this.workingMemory.operators.filter(
      op => op.preconditions(this.workingMemory)
    );
  }

  private decisionPhase(candidates: Operator[]): Operator | null {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // 根据偏好值选择
    candidates.sort((a, b) => b.preference - a.preference);

    // 如果最高偏好不明显优于第二高，触发困境
    if (candidates.length > 1 &&
        candidates[0].preference - candidates[1].preference < 0.1) {
      return null; // 困境
    }

    return candidates[0];
  }

  private async handleImpasse(candidates: Operator[]): Promise<void> {
    // 创建子目标来解决困境
    // 在 LLM Agent 中：请求 LLM 深入分析来做出选择

    // 解决困境后，学习新规则（chunking）
    const resolvedOperator = candidates[0]; // 简化
    this.learnedRules.push({
      condition: (state) => {
        // 学习到的条件
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
    instructionFollowing: number; // 指令遵循
    fewShotLearning: number;     // 少样本学习
    chainOfThought: number;      // 思维链推理
    toolUse: number;             // 工具使用
    complexPlanning: number;     // 复杂规划
    selfCorrection: number;     // 自我纠错
    multiStepReasoning: number;  // 多步推理
  };
}

// 不同规模模型的能力对比（概念性示例）
const capabilityProfiles: ModelCapabilityProfile[] = [
  {
    model: 'small (~7B)',
    parameterCount: '7B',
    capabilities: {
      basicCompletion: 85,
      instructionFollowing: 70,
      fewShotLearning: 60,
      chainOfThought: 40,
      toolUse: 30,
      complexPlanning: 15,
      selfCorrection: 10,
      multiStepReasoning: 20,
    },
  },
  {
    model: 'medium (~70B)',
    parameterCount: '70B',
    capabilities: {
      basicCompletion: 95,
      instructionFollowing: 90,
      fewShotLearning: 85,
      chainOfThought: 75,
      toolUse: 70,
      complexPlanning: 55,
      selfCorrection: 45,
      multiStepReasoning: 60,
    },
  },
  {
    model: 'frontier (>200B)',
    parameterCount: '>200B',
    capabilities: {
      basicCompletion: 98,
      instructionFollowing: 97,
      fewShotLearning: 95,
      chainOfThought: 92,
      toolUse: 90,
      complexPlanning: 80,
      selfCorrection: 75,
      multiStepReasoning: 85,
    },
  },
];

// 根据模型能力选择 Agent 架构
function selectAgentArchitecture(
  profile: ModelCapabilityProfile
): string {
  const caps = profile.capabilities;

  if (caps.complexPlanning >= 75 && caps.toolUse >= 85) {
    return 'Full autonomous agent (ReAct / Plan-and-Execute)';
  }
  if (caps.toolUse >= 60 && caps.chainOfThought >= 60) {
    return 'Tool-augmented agent with guardrails';
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

// 根据任务类型选择 ICL 策略
function selectICLStrategy(
  taskType: string,
  contextBudget: number
): ICLStrategy {
  switch (taskType) {
    case 'classification':
      return {
        exampleSelection: 'diverse',  // 每个类别至少一个示例
        numExamples: Math.min(8, Math.floor(contextBudget / 200)),
        format: 'input-output',
      };
    case 'reasoning':
      return {
        exampleSelection: 'similar',  // 选择相似问题
        numExamples: Math.min(3, Math.floor(contextBudget / 500)),
        format: 'step-by-step',       // 展示推理过程
      };
    case 'tool-use':
      return {
        exampleSelection: 'curriculum', // 从简单到复杂
        numExamples: Math.min(5, Math.floor(contextBudget / 300)),
        format: 'step-by-step',
      };
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
  numSamples?: number;
  temperature?: number;
  // 结构化 CoT 的框架
  framework?: string[];
}

// Self-Consistency 实现
async function selfConsistencyCoT(
  llm: LLM,
  question: string,
  config: { numSamples: number; temperature: number }
): Promise<{ answer: string; confidence: number }> {
  const answers: string[] = [];

  // 采样多条推理路径
  for (let i = 0; i < config.numSamples; i++) {
    const response = await llm.generate(
      `让我们一步步思考这个问题：\n${question}\n\n推理过程：`
    );
    const answer = extractFinalAnswer(response);
    answers.push(answer);
  }

  // 投票选择最一致的答案
  const counts = new Map<string, number>();
  for (const ans of answers) {
    counts.set(ans, (counts.get(ans) ?? 0) + 1);
  }

  let bestAnswer = '';
  let bestCount = 0;
  for (const [ans, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestAnswer = ans;
    }
  }

  return {
    answer: bestAnswer,
    confidence: bestCount / config.numSamples,
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
    strategy: 'self-consistency' | 'cross-model-verification' | 'tool-validation';
    minConsistency: number;
  };

  // 幻觉问题的应对
  hallucinationMitigation: {
    strategy: 'rag-grounding' | 'tool-verification' | 'citation-required';
    factCheckTools: string[];
  };

  // 上下文利用的优化
  contextOptimization: {
    strategy: 'recency-prioritized' | 'relevance-sorted' | 'hierarchical-summary';
    maxContextLength: number;
    importantInfoPlacement: 'start' | 'end' | 'both-ends';
  };
}

// 根据任务风险等级配置 Guardrails
function configureGuardrails(
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
): LLMCapabilityGuardrails {
  switch (riskLevel) {
    case 'low':
      return {
        computeDepthLimit: { strategy: 'enable-cot', maxReasoningSteps: 5 },
        faithfulnessCheck: { strategy: 'self-consistency', minConsistency: 0.5 },
        hallucinationMitigation: { strategy: 'rag-grounding', factCheckTools: [] },
        contextOptimization: {
          strategy: 'recency-prioritized', maxContextLength: 8000,
          importantInfoPlacement: 'end',
        },
      };
    case 'critical':
      return {
        computeDepthLimit: { strategy: 'use-external-solver', maxReasoningSteps: 20 },
        faithfulnessCheck: { strategy: 'cross-model-verification', minConsistency: 0.9 },
        hallucinationMitigation: {
          strategy: 'citation-required',
          factCheckTools: ['web_search', 'database_lookup', 'human_review'],
        },
        contextOptimization: {
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
    const validation = this.guardrails.validate(action);
    if (!validation.passed) {
      return { success: false, error: validation.reason };
    }

    // 2. 执行工具调用（确定性）
    const result = await this.tools.execute(action.tool, action.params);

    // 3. 更新状态（确定性，使用 reducer 模式）
    this.state = agentReducer(this.state, {
      type: 'TOOL_RESULT',
      payload: result
    });

    return { success: true, data: result };
  }

  constructor(tools: ToolRegistry, guardrails: GuardrailSystem) {
    this.state = { history: [], beliefs: {} };
    this.tools = tools;
    this.guardrails = guardrails;
  }
}

// 概率性内核：LLM 推理决策
class ProbabilisticCore {
  private llm: LLM;

  constructor(llm: LLM) {
    this.llm = llm;
  }

  async decide(context: AgentContext): Promise<AgentAction> {
    const response = await this.llm.chat({
      messages: context.messages,
      tools: context.availableTools,
      temperature: 0, // 降低随机性，但不能完全消除
    });
    return this.parseAction(response);
  }

  private parseAction(response: any): AgentAction {
    return { type: 'respond', tool: '', params: {} };
  }
}

// 类型定义
interface AgentAction {
  type: string;
  tool: string;
  params: Record<string, unknown>;
}

interface ActionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

interface AgentContext {
  messages: Message[];
  availableTools: ToolDefinition[];
}

interface ToolRegistry {
  execute(tool: string, params: Record<string, unknown>): Promise<unknown>;
}

interface GuardrailSystem {
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
    'claude-opus-4.6':   { input: 15.00, output: 75.00 },
    'claude-sonnet-4.6': { input: 3.00, output: 15.00 },
    'claude-haiku-3.5':  { input: 0.80, output: 4.00 },
    'gemini-3-pro':      { input: 1.25, output: 5.00 },
    'gemini-3-flash':    { input: 0.075, output: 0.30 },
    'glm-5':             { input: 0, output: 0 },       // 开源（自部署）
    'o3-mini':           { input: 1.10, output: 4.40 },
    'deepseek-r1':       { input: 0.55, output: 2.19 },
  };

  estimateAgentCost(params: {
    model: string;
    avgInputTokens: number;
    avgOutputTokens: number;
    avgIterations: number;
    dailyTasks: number;
  }): { perTask: number; daily: number; monthly: number } {
    const price = this.pricing[params.model];
    const perIteration =
      (params.avgInputTokens * price.input +
        params.avgOutputTokens * price.output) / 1_000_000;
    const perTask = perIteration * params.avgIterations;
    const daily = perTask * params.dailyTasks;
    return { perTask, daily, monthly: daily * 30 };
  }
}

// 迭代式 Agent 的成本增长特征
// 注意：每次迭代中上下文长度会增长，导致成本加速增长
function estimateIterativeCost(
  baseInputTokens: number,
  outputTokensPerIteration: number,
  iterations: number,
  inputPricePerMillion: number,
  outputPricePerMillion: number
): number {
  let totalCost = 0;
  let currentInputTokens = baseInputTokens;

  for (let i = 0; i < iterations; i++) {
    // 每次迭代的输入 = 基础上下文 + 之前所有迭代的输出
    const iterationCost =
      (currentInputTokens * inputPricePerMillion +
        outputTokensPerIteration * outputPricePerMillion) / 1_000_000;
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
    // 先用 System 1 快速评估复杂度
    const complexity = await this.fastModel.classify(input, {
      categories: ['simple', 'moderate', 'complex']
    });

    switch (complexity) {
      case 'simple':
        // System 1 直接回答
        return this.fastModel.generate(input);

      case 'moderate':
        // System 1 + 工具调用
        return this.reactLoop(this.fastModel, input, 3);

      case 'complex':
        // System 2 深度推理
        return this.reactLoop(this.slowModel, input, 10);
    }

    return this.reactLoop(this.fastModel, input, 3);
  }

  private async reactLoop(
    model: LLM, input: string, maxIter: number
  ): Promise<string> {
    const messages: Message[] = [{ role: 'user', content: input }];
    for (let i = 0; i < maxIter; i++) {
      const resp = await model.chat({ messages, tools: this.tools });
      if (resp.finishReason === 'stop') return resp.content;
      for (const tc of resp.toolCalls ?? []) {
        const result = await this.executeTool(tc);
        messages.push({ role: 'tool', content: JSON.stringify(result) });
      }
    }
    return '任务未在限定步数内完成';
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
    knowledgeBase: KnowledgeBase;
    tokenBudget: number;
  }): Promise<Message[]>;
}

interface MemoryStore {
  retrieve(query: string, limit: number): Promise<MemoryItem[]>;
}

interface MemoryItem {
  content: string;
  relevance: number;
  recency: number;
}

// 优先级驱动的上下文组装器
class PriorityContextAssembler implements ContextEngineer {
  async assembleContext(params: {
    task: string;
    conversationHistory: Message[];
    availableTools: ToolDefinition[];
    memoryStore: MemoryStore;
    knowledgeBase: KnowledgeBase;
    tokenBudget: number;
  }): Promise<Message[]> {
    let remainingBudget = params.tokenBudget;
    const result: Message[] = [];

    // 1. System Prompt（最高优先级，固定开销）
    const systemPrompt = this.buildSystemPrompt(params.task);
    remainingBudget -= this.estimateTokens(systemPrompt);
    result.push({ role: 'system', content: systemPrompt });

    // 2. 最近的对话轮次（高优先级）
    const recentHistory = this.trimHistory(
      params.conversationHistory,
      Math.floor(remainingBudget * 0.4)
    );
    remainingBudget -= this.estimateTokens(recentHistory.map(m => m.content).join(''));
    result.push(...recentHistory);

    // 3. 相关记忆（中优先级）
    const memories = await params.memoryStore.retrieve(
      params.task,
      5
    );
    const memoryContent = this.formatMemories(memories);
    remainingBudget -= this.estimateTokens(memoryContent);
    if (remainingBudget > 0) {
      result.splice(1, 0, { role: 'system', content: memoryContent });
    }

    // 4. RAG 知识（按需）
    if (remainingBudget > 500) {
      const knowledge = params.knowledgeBase.query(params.task);
      const knowledgeStr = String(knowledge);
      if (this.estimateTokens(knowledgeStr) <= remainingBudget) {
        result.splice(1, 0, {
          role: 'system',
          content: `<knowledge>\n${knowledgeStr}\n</knowledge>`,
        });
      }
    }

    return result;
  }

  private buildSystemPrompt(task: string): string {
    return `你是一个专业的 AI 助手。当前任务：${task}`;
  }

  private trimHistory(history: Message[], tokenBudget: number): Message[] {
    // 从最新到最旧选择，直到超出预算
    const result: Message[] = [];
    let used = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const tokens = this.estimateTokens(history[i].content);
      if (used + tokens > tokenBudget) break;
      result.unshift(history[i]);
      used += tokens;
    }
    return result;
  }

  private formatMemories(memories: MemoryItem[]): string {
    if (memories.length === 0) return '';
    const lines = memories.map(m => `- ${m.content}`).join('\n');
    return `<relevant_memories>\n${lines}\n</relevant_memories>`;
  }

  private estimateTokens(text: string): number {
    // 粗略估计：英文约 4 字符/token，中文约 1.5 字符/token
    return Math.ceil(text.length / 3);
  }
}
```

---

## 2.9 不可靠性税

### 2.9.1 概念定义

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

### 2.9.2 降低不可靠性税的策略

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

## 2.10 本章小结

本章从六个理论维度为 Agent 工程奠定了基础：

1. **Agent 的形式化定义**（2.1 节）：Agent 是从感知序列到动作的映射函数，理性 Agent 最大化期望性能度量。LLM Agent 是经典 Agent 理论的特化实例。

2. **决策理论**（2.2 节）：MDP/POMDP 框架描述了 Agent 的序贯决策问题，效用理论为"好的决策"提供了公理化标准，期望效用最大化是理性 Agent 的行为准则。

3. **规划理论**（2.3 节）：从经典 STRIPS/PDDL 到层次任务网络（HTN），再到现代 LLM Agent 的 ReAct、Plan-and-Execute 和 Tree-of-Thoughts，规划能力是 Agent 处理复杂任务的关键。

4. **Multi-Agent 理论**（2.4 节）：博弈论（纳什均衡、合作博弈）为多 Agent 交互提供数学框架，言语行为理论指导 Agent 通信协议设计，共识机制解决集体决策问题。

5. **认知架构**（2.5 节）：BDI 的信念-愿望-意图管理、ACT-R 的记忆激活模型、SOAR 的问题空间搜索，这些经典架构中的设计模式至今仍对 LLM Agent 有直接指导价值。

6. **LLM 作为推理引擎**（2.6-2.8 节）：涌现能力与 Scaling Laws 决定了 LLM 的能力边界，ICL 和 CoT 是 Agent 利用 LLM 的核心机制，Context Engineering 是管理复杂上下文的系统方法论。

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
