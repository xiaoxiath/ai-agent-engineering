# 第 3 章 架构总览 — Agent 的七层模型

本章提出一个七层参考架构，作为**本书用于组织 Agent 工程知识的参考模型**。它不是行业唯一标准，也不是所有团队都必须逐层照搬的固定模板；它的作用是帮助你在面对复杂 Agent 系统时，把状态、上下文、工具、记忆、安全、评估和编排等问题放到统一视角中理解。生产级 Agent 不能只有 LLM 调用而没有状态管理、上下文控制、安全防护和可观测性——缺乏系统性架构设计，是大多数 Agent 项目失败的根源。

本章还会讨论 Agent 控制循环的多种经典模式，帮助你根据任务复杂度和系统约束选择合适的架构。阅读本章前，建议先了解第 1–2 章的基础概念。

## 本章你将学到什么

1. 为什么需要一个统一的 Agent 架构视角，而不仅仅是"能调用模型和工具"
2. 七层参考架构分别解决什么问题，以及它们之间如何协作
3. 如何从单 Agent 原型逐步演进到更完整的工程系统
4. 什么时候应该采用更复杂的控制循环，什么时候应保持简单

## 本章建议阅读方式

- 如果你是第一次做 Agent：先关注"七层分别解决什么问题"
- 如果你已经有可运行原型：重点关注"状态、上下文、安全、评估、编排"如何补齐
- 如果你在做团队架构设计：把本章当作后续章节的导航图，而不是一次性定型的标准答案

---

## 3.1 七层参考架构

```mermaid
flowchart TB
    subgraph Agent 七层参考架构
        L7[Layer 7 — 编排层 Orchestration<br/>多 Agent 路由 / 任务分发 / 结果聚合]
        L6[Layer 6 — 评估层 Evaluation ← 横切关注点<br/>指标采集 / 基准测试 / 回归检测]
        L5[Layer 5 — 安全层 Security ← 横切关注点<br/>输入校验 / 权限管控 / 输出净化]
        L4[Layer 4 — 记忆层 Memory<br/>工作记忆 / 短期记忆 / 长期记忆]
        L3[Layer 3 — 工具层 Tool System<br/>注册发现 / 参数校验 / 沙箱执行]
        L2[Layer 2 — 上下文引擎 Context Engine<br/>上下文组装 / 压缩 / 注入]
        L1[Layer 1 — 核心循环层 Agent Core<br/>感知-推理-行动循环 / 模型调用]
    end
    L7 --> L4
    L7 --> L3
    L4 --> L2
    L3 --> L2
    L2 --> L1
    L5 -.->|横切| L7
    L5 -.->|横切| L4
    L5 -.->|横切| L3
    L5 -.->|横切| L2
    L5 -.->|横切| L1
    L6 -.->|横切| L7
    L6 -.->|横切| L4
    L6 -.->|横切| L1
```
**图 3-1 Agent 七层参考架构**——每一层的职责必须清晰分离。实线箭头表示层间数据流向：编排层通过工具层和记忆层进行任务处理，上下文引擎为核心循环层组装上下文。虚线箭头表示安全层和评估层是**横切关注点**，它们贯穿所有其他层而非固定位于某一层之上。

在构建生产级 AI Agent 系统时，我们需要一个清晰的分层模型来组织复杂性。类似于 OSI 七层网络模型将网络通信分解为可独立演进的层次，我们在本书中提出 **Agent 七层参考架构**，将 Agent 系统的关键关注点分离到七个明确定义的层次中。它更适合作为"分析框架"和"设计清单"，而不是僵化的落地模板。

> **与 OSI 类比的限定说明**：本书的七层模型借鉴了 OSI 模型"职责分层、接口隔离"的思想，但**并非严格的上下层调用关系**。具体而言：安全层（L5）和评估层（L6）是**横切关注点（Cross-cutting Concerns）**——它们不是"安全层调用记忆层、记忆层再调用工具层"这样的线性依赖，而是贯穿整个 Agent 执行流程的守卫和度量机制。这更类似于企业架构中的日志、认证等横切服务，而非 OSI 中物理层到应用层的逐层封装。

每一层都有明确的职责边界、对外接口和对内实现。层与层之间通过定义良好的接口通信，上层依赖下层提供的能力，而下层对上层保持无感知。这种分层设计带来三大好处：**可替换性**（任意一层的实现可以独立替换）、**可测试性**（每层可独立进行单元测试）、**可演进性**（新的模型或工具可以在不影响其他层的情况下接入）。

```mermaid
flowchart TB
    subgraph L7["Layer 7 — 编排层 (Orchestration)"]
        L7D["多 Agent 路由 / 任务分发 / 结果聚合 / 工作流编排"]
    end
    subgraph L6["Layer 6 — 评估层 (Evaluation) ← 横切关注点"]
        L6D["指标采集 / 基准测试 / 回归检测 / 质量守门"]
    end
    subgraph L5["Layer 5 — 安全层 (Security) ← 横切关注点"]
        L5D["输入校验 / Prompt 注入检测 / 权限管控 / 输出净化"]
    end
    subgraph L4["Layer 4 — 记忆层 (Memory)"]
        L4D["工作记忆 / 短期记忆 / 长期记忆 / 语义检索"]
    end
    subgraph L3["Layer 3 — 工具层 (Tool System)"]
        L3D["工具注册与发现 / 参数校验 / 沙箱执行 / 结果标准化"]
    end
    subgraph L2["Layer 2 — 上下文引擎 (Context Engine)"]
        L2D["上下文组装 / Token 预算管理 / 压缩 / 动态注入"]
    end
    subgraph L1["Layer 1 — 核心循环层 (Agent Core)"]
        L1D["感知-推理-行动循环 / 模型调用 / 流式处理 / Token 追踪"]
    end

    L7 --> L6 --> L5 --> L4 --> L3 --> L2 --> L1
```
**图 3-1b 七层架构分层总览（简化视图）**——自顶向下的分层结构。注意：L5 安全层和 L6 评估层是横切关注点，此处的线性排列仅为展示层次顺序，实际运行中它们贯穿所有层。

#### 七层模型与经典 Agent 架构的关系

本书的七层模型并非凭空提出，它与 AI 领域几个经典的 Agent 架构有深层的思想关联。

**与 BDI（Belief-Desire-Intention）架构的对比。** BDI 是多 Agent 系统领域最有影响力的理论架构之一，它将 Agent 的内部状态分为信念（Belief，对世界的认知）、愿望（Desire，想要达成的目标）和意图（Intention，已承诺执行的计划）。在七层模型中，BDI 的核心概念被分散到不同层中：**信念**对应记忆层（L4）和上下文引擎（L2）——Agent 通过记忆和上下文来维护对世界的认知；**愿望**对应编排层（L7）中的任务目标分解；**意图**对应核心循环层（L1）中的当前执行计划。BDI 的关键贡献——将认知状态显式化——在七层模型中通过层间接口被进一步工程化了。

**与认知架构（Soar/ACT-R）的对比。** Soar 和 ACT-R 是认知科学领域的经典架构，它们试图模拟人类的认知过程。Soar 的核心概念包括工作记忆（Working Memory）、长期记忆（Long-term Memory）和问题空间搜索（Problem Space Search）。这些概念在七层模型中有直接对应：Soar 的工作记忆对应上下文引擎（L2）中的当前会话上下文；长期记忆对应记忆层（L4）的向量数据库；问题空间搜索则被 LLM 的推理能力（L1）所替代——这正是 LLM Agent 相比传统符号 AI Agent 最大的范式转变。传统认知架构需要手工编写大量的产生式规则（Production Rules）来驱动推理，而 LLM Agent 的核心循环层通过自然语言交互实现了隐式的规则推理。

**七层模型的独特定位。** 与 BDI 和认知架构不同，七层模型不是一个认知理论模型，而是一个**工程参考架构**。它的目标不是解释 Agent "如何思考"，而是指导工程团队"如何构建"。因此，七层模型增加了 BDI 和认知架构中缺失的工程关注点：安全层（L5）、评估层（L6）和显式的编排层（L7）。这些层在理论架构中通常被忽略，但在生产系统中是不可或缺的。

#### 确定性外壳与概率性内核的映射

第 2 章提出了"确定性外壳/概率性内核"这一核心概念——Agent 系统需要用确定性的工程机制来包裹概率性的 LLM 推理。七层模型为这一概念提供了具体的落地框架：

```mermaid
flowchart LR
    subgraph 确定性层["确定性外壳 (Deterministic Shell)"]
        direction TB
        DL7["L7 编排层<br/>确定性路由规则"]
        DL6["L6 评估层<br/>确定性指标计算"]
        DL5["L5 安全层<br/>确定性校验规则"]
        DL3["L3 工具层<br/>确定性参数校验与执行"]
    end
    subgraph 概率性层["概率性内核 (Probabilistic Core)"]
        direction TB
        PL1["L1 核心循环层<br/>LLM 推理 — 概率性"]
        PL4["L4 记忆层<br/>语义检索 — 概率性"]
    end
    subgraph 混合层["混合层"]
        direction TB
        ML2["L2 上下文引擎<br/>组装逻辑确定性 + 压缩策略概率性"]
    end

    确定性层 --> 混合层 --> 概率性层
```
**图 3-2 七层模型中的确定性/概率性属性分布**——明确标识哪些层属于确定性外壳、哪些包含概率性组件，帮助团队在设计时有意识地控制不确定性边界。

具体而言：

- **确定性层**（L3 工具层、L5 安全层、L6 评估层、L7 编排层）：这些层的行为应当是完全可预测的。给定相同的输入，必然产生相同的输出。安全校验规则不应因"模型心情"而改变，工具调用的参数校验不应有随机性，编排层的路由逻辑应当是确定性的策略匹配。
- **概率性层**（L1 核心循环层、L4 记忆层的语义检索部分）：LLM 的推理本质上是概率性的——相同的 prompt 可能产生不同的输出。记忆层中的向量相似度检索同样涉及近似匹配。这是系统中不确定性的核心来源。
- **混合层**（L2 上下文引擎）：上下文的组装逻辑（优先级排序、Token 预算分配）是确定性的，但上下文压缩策略如果使用 LLM 进行摘要则引入了概率性。

这种映射的工程意义在于：**确定性层应当用传统软件工程的方法（单元测试、集成测试、形式化验证）来保障质量；概率性层则需要统计性的评估方法（基准测试、A/B 测试、回归检测）来度量质量**。这也是为什么安全层和评估层被设计为横切关注点——它们需要同时覆盖确定性和概率性两类组件。

下面我们逐层深入分析。

---

### 3.1.1 Layer 1 -- 核心循环层（Agent Core）

**核心循环层**是整个 Agent 系统的心脏。它实现了经典的 **感知-推理-行动（Perceive-Reason-Act）** 循环，负责与大语言模型（LLM）进行交互，并根据模型的响应决定下一步行动。

核心循环层的职责包括：（1）接收用户输入或上层编排层的指令；（2）组装 prompt 并调用 LLM；（3）解析模型响应，判断是需要调用工具、返回结果还是继续推理；（4）管理循环的终止条件，包括最大迭代次数、Token 预算、超时等。

在生产环境中，核心循环层还需要处理大量的非功能性需求：**错误恢复**（模型调用失败时的指数退避重试）、**流式输出**（实时将生成内容传递给用户）、**Token 追踪**（记录每次调用的 Token 消耗，用于成本控制和性能分析）、以及 **可观测性**（通过结构化日志和 Trace 为调试和监控提供支持）。

下面先给出一个**最小但工程上有意义**的核心循环骨架。阅读时请把注意力放在接口职责和控制边界上，而不要把它当作唯一实现方式：

```typescript
// Layer 1: 核心循环层 -- 最小可运行骨架
// 类型定义见 code-examples/shared/types.ts
interface LLMResponse {
  content: string;
  toolCalls?: { name: string; args: Record<string, unknown> }[];
  tokenUsage: { prompt: number; completion: number };
}
interface AgentCoreConfig { maxIterations: number; tokenBudget: number; retryAttempts: number; }

async function agentCoreLoop(
  input: string, tools: Map<string, (args: any) => Promise<string>>, config: AgentCoreConfig
): Promise<string> {
  const messages: { role: string; content: string }[] = [{ role: "user", content: input }];
  let totalTokens = 0;

  for (let i = 0; i < config.maxIterations; i++) {
    const response = await callLLMWithRetry(messages, config.retryAttempts); // 定义见 code-examples/shared/llm-client.ts
    totalTokens += response.tokenUsage.prompt + response.tokenUsage.completion;
    if (totalTokens > config.tokenBudget) return "[Token 预算耗尽] " + response.content;
    if (!response.toolCalls?.length) return response.content; // 终止：模型给出最终回答
    for (const call of response.toolCalls) {
      const toolFn = tools.get(call.name);
      messages.push({ role: "tool", content: toolFn ? await toolFn(call.args) : `错误：工具 ${call.name} 未注册` });
    }
  }
  return "[达到最大迭代次数] 未能完成任务";
}
// 完整实现（含流式输出、结构化日志、Trace 埋点）见 code-examples/ch03/agent-core.ts
```

**设计权衡讨论。** 上述骨架刻意省略了流式输出和结构化日志，因为这些非功能性需求的实现高度依赖具体部署环境（Node.js Stream vs Web ReadableStream vs SSE）。核心循环的关键设计决策是**终止条件的优先级**：Token 预算耗尽优先于最大迭代次数，因为成本失控的后果通常比任务未完成更严重。另一个值得注意的权衡是工具调用的串行执行——这里为了简化采用了 `for...of` 顺序执行，但在生产环境中，无依赖的工具调用应当并行执行以降低延迟（见 code-examples 中的并行版本）。

---

### 3.1.2 Layer 2 -- 上下文引擎（Context Engine）

**上下文引擎**是 Agent 系统中最容易被忽视但最影响实际效果的一层。LLM 的上下文窗口是有限的——即使是最新的模型也存在 Token 上限，而真实的 Agent 任务往往需要处理大量的历史对话、工具返回结果、外部文档等信息。上下文引擎的核心使命是：**在有限的窗口中，放入对当前决策最有价值的信息**。

上下文引擎需要处理三个关键问题：（1）**上下文组装**——将系统 prompt、用户目标、历史消息、工具定义、记忆检索结果等按照优先级和格式要求组装成完整的消息列表；（2）**上下文压缩**——当累积的消息长度接近窗口上限时，智能地压缩或裁剪内容，同时保留关键信息；（3）**上下文注入**——在运行时动态地向上下文中注入新的信息片段（如 RAG 检索结果、实时数据等），而不破坏已有的结构。

一个优秀的上下文引擎还需要考虑 Token 计数的精确性、不同消息类型的优先级排序、以及多轮对话中的信息衰减策略。

```typescript
// Layer 2: 上下文引擎 -- 组装与压缩
// 类型定义见 code-examples/shared/types.ts
interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  priority?: number; // 越高越不容易被压缩
}

class ContextEngine {
  private tokenLimit: number;
  constructor(tokenLimit: number = 8192) { this.tokenLimit = tokenLimit; }

  /** 组装完整上下文，按优先级裁剪以适应 Token 窗口 */
  assemble(systemPrompt: string, history: Message[], injections: Message[] = []): Message[] {
    const system: Message = { role: "system", content: systemPrompt, priority: 100 };
    const all = [system, ...injections, ...history];
    let totalTokens = all.reduce((s, m) => s + this.estimateTokens(m.content), 0);

    // 按优先级从低到高移除，直到满足 Token 限制
    const sorted = [...all].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    const removed = new Set<Message>();
    while (totalTokens > this.tokenLimit && sorted.length > 0) {
      const victim = sorted.shift()!;
      totalTokens -= this.estimateTokens(victim.content);
      removed.add(victim);
    }
    return all.filter((m) => !removed.has(m));
  }

  // Token 估算、压缩策略等完整实现见 code-examples/ch03/context-engine.ts
}
```

**设计权衡讨论。** 上下文引擎的核心权衡在于**精确性 vs 性能**。精确的 Token 计数需要调用 tokenizer（如 tiktoken），但这会引入额外的计算开销；上述实现使用的字符级估算虽然快但误差可达 20-30%。生产系统通常采用折中方案：使用精确 tokenizer 计算系统 prompt 和工具定义（这些内容不频繁变化），对历史消息使用近似估算。另一个关键决策是**裁剪策略**：按优先级裁剪是最简单的方案，但更高级的策略包括摘要压缩（用 LLM 将多轮对话压缩为摘要）和分段缓存（将不同类型的上下文分别缓存，按需加载）。

---

### 3.1.3 Layer 3 -- 工具层（Tool System）

**工具层**赋予 Agent 与外部世界交互的能力。如果说 LLM 是 Agent 的"大脑"，那么工具层就是它的"双手"。一个没有工具的 Agent 只能进行纯文本推理；而有了工具层，Agent 可以搜索互联网、查询数据库、调用 API、执行代码等。

工具层的设计需要解决四个核心问题：（1）**注册与发现**——如何让 Agent 知道有哪些工具可用及其功能；（2）**参数校验**——确保 LLM 生成的工具调用参数符合 Schema；（3）**安全执行**——在沙箱中执行工具，防止恶意操作；（4）**结果标准化**——将不同工具的异构返回结果转换为 LLM 可理解的统一格式。

```typescript
// Layer 3: 工具层 -- 核心接口定义
// 类型定义见 code-examples/shared/types.ts
interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void { this.tools.set(tool.name, tool); }

  getSchemas(): { name: string; description: string; parameters: object }[] {
    return [...this.tools.values()].map(({ name, description, parameters }) =>
      ({ name, description, parameters }));
  }

  /** 校验参数并执行工具 */
  async invoke(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) return JSON.stringify({ error: `工具 "${name}" 未注册` });
    for (const [key, schema] of Object.entries(tool.parameters)) {
      if (schema.required && !(key in args))
        return JSON.stringify({ error: `缺少必填参数: ${key}` });
    }
    try { return await tool.execute(args); }
    catch (err: any) { return JSON.stringify({ error: err.message }); }
  }
  // 沙箱执行、结果标准化、超时控制等完整实现见 code-examples/ch03/tool-registry.ts
}
```

**设计权衡讨论。** 工具层最关键的设计决策是**校验粒度 vs 容错性**。严格的 JSON Schema 校验可以在执行前拦截错误参数，但 LLM 的输出格式往往不够稳定——过于严格的校验会导致大量合理意图的调用被拒绝。生产系统通常采用"宽进严出"策略：对参数做类型转换和默认值填充（如将字符串 `"42"` 自动转为数字 `42`），而非直接拒绝。另一个权衡是工具描述的详细程度：过于详细的描述消耗上下文窗口，过于简略则导致 LLM 误用工具。经验法则是每个工具描述控制在 50-100 个 Token。

---

> **知识层（Knowledge Layer）：Skill**
>
> 在工具层之上，Skill 提供了一个知识抽象层——将领域知识、执行策略和工具组合封装为可复用的能力单元。当工具数量超过 15 个时，Skill 路由机制可以显著提升 Agent 的决策准确率。详见第 6 章 §6.8。

### 3.1.4 Layer 4 -- 记忆层（Memory）

**记忆层**使 Agent 能够跨越单次对话的边界，积累和利用历史经验。记忆系统通常分为三个层次：（1）**工作记忆**——当前对话的上下文，对应上下文引擎中的消息列表；（2）**短期记忆**——最近几次对话的关键信息，存储在内存或缓存中；（3）**长期记忆**——持久化的知识，使用向量数据库实现语义检索。

记忆层的核心挑战是 **检索相关性**——如何从海量历史中快速找到与当前任务最相关的信息。这需要结合语义向量搜索和结构化过滤（时间、标签、重要性等元数据）。

```typescript
// Layer 4: 记忆层 -- 核心接口与语义检索
// 类型定义见 code-examples/shared/types.ts
interface MemoryEntry {
  id: string;
  content: string;
  embedding?: number[];
  metadata: { timestamp: number; tags: string[]; importance: number };
}

class MemorySystem {
  private shortTerm: MemoryEntry[] = [];
  private longTerm: MemoryEntry[] = []; // 生产中应使用向量数据库（如 Pinecone、Milvus）

  store(entry: MemoryEntry, tier: "short" | "long" = "short"): void {
    (tier === "short" ? this.shortTerm : this.longTerm).push(entry);
  }

  async retrieve(queryEmbedding: number[], k: number = 5): Promise<MemoryEntry[]> {
    return this.longTerm
      .filter((e) => e.embedding)
      .map((e) => ({ entry: e, score: cosineSimilarity(queryEmbedding, e.embedding!) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((s) => s.entry);
  }
  // cosineSimilarity 工具函数、记忆淘汰策略、向量数据库适配器
  // 完整实现见 code-examples/ch03/memory-system.ts
}
```

**设计权衡讨论。** 记忆层的设计面临两个根本性权衡。其一是**检索召回率 vs 延迟**：使用纯向量检索速度快但可能遗漏结构化约束（如"只检索最近一周的记忆"）；结合元数据过滤可以提升精度但增加查询复杂度。其二是**记忆粒度**：是存储完整的对话轮次，还是提取关键事实后存储？前者保留了完整上下文但检索噪声大，后者精简但可能丢失推理所需的微妙信息。生产系统通常同时维护两种粒度的记忆存储。

---

### 3.1.5 Layer 5 -- 安全层（Security）

**安全层**是生产级 Agent 系统中不可或缺的防护网。Agent 不仅要防范传统的注入攻击和越权访问，还要应对 **Prompt Injection**、**工具滥用**、**信息泄露**等 LLM 特有的安全风险。

安全层的职责贯穿 Agent 处理的全生命周期：（1）**输入校验**——检测 Prompt Injection、恶意指令；（2）**工具调用审核**——检查调用是否符合权限策略；（3）**输出净化**——过滤内部信息、隐私数据；（4）**审计日志**——记录所有关键操作。

安全层是**横切关注点**——它不只保护某一层，而是贯穿从输入到输出的完整链路。

```typescript
// Layer 5: 安全层 -- 核心接口定义
// 类型定义见 code-examples/shared/types.ts
interface SecurityCheckResult {
  passed: boolean;
  riskLevel: "none" | "low" | "medium" | "high" | "critical";
  reason?: string;
}

class SecurityGuard {
  /** 输入校验：检测 Prompt Injection（基于规则 + 分类模型） */
  checkInput(input: string): SecurityCheckResult {
    // 正则规则检测已知攻击模式
    // 生产环境应结合专用分类模型进行深度检测
    // 完整实现见 code-examples/ch03/security-guard.ts
    return { passed: true, riskLevel: "none" };
  }

  /** 输出净化：移除内部信息泄露 */
  sanitizeOutput(output: string, sensitiveKeys: string[]): string {
    let sanitized = output;
    for (const key of sensitiveKeys) sanitized = sanitized.replaceAll(key, "[REDACTED]");
    return sanitized;
  }

  /** 工具调用审计 */
  auditToolCall(agent: string, tool: string, args: object): void {
    console.log(JSON.stringify({ event: "tool_call_audit", agent, tool, args, timestamp: Date.now() }));
  }
}
```

**设计权衡讨论。** 安全层的核心权衡是**安全性 vs 可用性**。过于严格的 Prompt Injection 检测会产生大量误报，拒绝合法的用户请求；过于宽松则可能放过真正的攻击。上述代码仅展示了基于正则的规则检测，这是最快但最容易被绕过的方案。生产系统通常采用多层防御：规则层（快速拦截已知模式）+ 分类模型层（检测未知变体）+ LLM 自审查层（利用另一个 LLM 判断请求意图）。每增加一层都会增加延迟，因此需要根据应用的安全敏感度来决定防御深度。

---

### 3.1.6 Layer 6 -- 评估层（Evaluation）

**评估层**是 Agent 系统从"能用"走向"好用"的关键保障。Agent 的行为具有非确定性，评估层需要建立系统化的质量度量和基准测试体系。

评估层覆盖三个维度：（1）**实时指标采集**——追踪延迟、Token 消耗、工具成功率等；（2）**离线基准测试**——在标准数据集上运行对比；（3）**回归检测**——模型升级或 Prompt 修改时自动检测质量退化。

评估层也是**横切关注点**——它不仅评估核心循环层的推理质量，还监控编排层的路由准确率、记忆层的检索命中率等。

```typescript
// Layer 6: 评估层 -- 核心接口
// 类型定义见 code-examples/shared/types.ts
interface Metric {
  name: string; value: number; timestamp: number; tags?: Record<string, string>;
}

class EvaluationFramework {
  private metrics: Metric[] = [];

  record(name: string, value: number, tags?: Record<string, string>): void {
    this.metrics.push({ name, value, timestamp: Date.now(), tags });
  }

  /** 回归检测：对比当前指标与基线 */
  detectRegression(baselineAvg: number, metricName: string, threshold = 0.1):
    { regressed: boolean; currentAvg: number; delta: number } {
    const recent = this.metrics.filter((m) => m.name === metricName);
    const currentAvg = recent.length > 0
      ? recent.reduce((s, m) => s + m.value, 0) / recent.length : 0;
    const delta = (baselineAvg - currentAvg) / (baselineAvg || 1);
    return { regressed: delta > threshold, currentAvg, delta };
  }
  // 导出、可视化仪表盘集成、统计显著性检验等完整实现
  // 见 code-examples/ch03/evaluation-framework.ts
}
```

**设计权衡讨论。** 评估层的主要权衡是**指标粒度 vs 存储成本**。细粒度的追踪（如每个 Token 的生成延迟）提供了最丰富的诊断信息，但会产生巨大的存储和计算开销。生产系统通常采用分层采样策略：核心业务指标（如任务成功率、用户满意度）100% 采集；性能指标（如 P99 延迟）采样采集；调试级别指标（如每步推理内容）仅在问题调查时开启。

---

### 3.1.7 Layer 7 -- 编排层（Orchestration）

**编排层**负责协调多个 Agent 之间的协作。在复杂任务中，单个 Agent 往往难以胜任。编排层通过 **路由、分发和聚合** 机制，将复杂任务分解给多个专业 Agent，并将结果整合为最终输出。

编排层的三个核心能力：（1）**路由（Route）**——根据任务特征选择最合适的 Agent；（2）**委派（Delegate）**——分配子任务，管理依赖关系和并行执行；（3）**聚合（Aggregate）**——整合各 Agent 的结果。

编排模式的变体包括：**串行管道**（Pipeline）、**并行扇出**（Fan-out/Fan-in）、**层级委派**（Hierarchical）。

```typescript
// Layer 7: 编排层 -- 核心接口与路由逻辑
// 类型定义见 code-examples/shared/types.ts
interface AgentDescriptor {
  id: string;
  name: string;
  capabilities: string[];
  execute: (input: string) => Promise<string>;
}

class Orchestrator {
  private agents: AgentDescriptor[] = [];
  register(agent: AgentDescriptor): void { this.agents.push(agent); }

  /** 路由：根据任务关键词选择最匹配的 Agent */
  route(task: string): AgentDescriptor | undefined {
    return this.agents.find((a) =>
      a.capabilities.some((cap) => task.toLowerCase().includes(cap)));
  }

  /** 扇出：将子任务并行委派给多个 Agent */
  async fanOut(subtasks: { agentId: string; input: string }[]): Promise<string[]> {
    return Promise.all(subtasks.map(async (st) => {
      const agent = this.agents.find((a) => a.id === st.agentId);
      return agent ? agent.execute(st.input) : `错误: Agent ${st.agentId} 未注册`;
    }));
  }
  // 串行管道(pipeline)、层级委派、动态路由等完整实现
  // 见 code-examples/ch03/orchestrator.ts
}
```

**设计权衡讨论。** 编排层的核心权衡是**静态路由 vs 动态路由**。上述关键词匹配是最简单的静态路由，适用于 Agent 数量少且领域边界清晰的场景。当 Agent 数量增加或任务边界模糊时，需要引入动态路由——使用 LLM 根据任务描述选择最合适的 Agent。动态路由的准确率更高，但引入了额外的 LLM 调用延迟和成本。更高级的方案是混合路由：先用规则匹配处理明确的情况，仅对模糊任务调用 LLM 路由。

---

### 3.1.8 跨层交互：数据流全景

理解了每一层的职责后，让我们来看它们之间的数据流动。以下图展示了一次完整的 Agent 执行过程中数据的流转路径：

```mermaid
sequenceDiagram
    participant U as 用户
    participant L7 as L7 编排层
    participant L5 as L5 安全层
    participant L2 as L2 上下文引擎
    participant L4 as L4 记忆层
    participant L1 as L1 核心循环层
    participant L3 as L3 工具层
    participant L6 as L6 评估层

    U->>L7: 用户请求
    L7->>L7: route(task) → 选择目标 Agent
    L7->>L5: 请求入站
    L5->>L5: 输入校验（Prompt Injection 检测）
    L5->>L2: 校验通过
    L2->>L4: 检索相关历史记忆
    L4-->>L2: 返回相关记忆
    L2->>L2: 组装完整上下文
    L2->>L1: 传递组装后的上下文

    loop 核心推理循环
        L1->>L1: 调用 LLM → 推理
        L1->>L3: 工具调用请求
        L3->>L5: 工具调用审计
        L3-->>L1: 工具执行结果
        L1->>L4: 写入关键推理步骤
    end

    L1-->>L5: 初步答案
    L5->>L5: 输出净化
    L5-->>L7: 净化后的答案
    L7->>L6: 提交质量评估
    L6->>L6: 质量评分 & 回归检测
    L7->>L7: aggregate() → 聚合结果
    L7-->>U: 最终响应
```
**图 3-3 七层架构数据流全景（时序视图）**——展示一次完整 Agent 执行中请求如何从用户经编排层流经各层，最终返回响应。安全层在入站和出站两个阶段均参与处理。

**关键数据流说明：**

1. **请求入站**：用户请求首先到达 **编排层**（L7），编排层决定路由策略。
2. **安全前置**：在进入核心循环层前，请求经过 **安全层**（L5）的输入校验。
3. **上下文组装**：**上下文引擎**（L2）从 **记忆层**（L4）检索相关历史，组装完整上下文。
4. **推理与执行**：**核心循环层**（L1）调用 LLM，如需工具则交由 **工具层**（L3）执行。
5. **记忆沉淀**：工具结果和关键推理步骤被写入 **记忆层**（L4）。
6. **输出净化**：最终答案经过 **安全层**（L5）的输出净化后返回。
7. **质量评估**：完成后，**评估层**（L6）对本次执行进行质量评分和回归检测。
8. **结果聚合**：多 Agent 场景下，**编排层**（L7）聚合各 Agent 的结果。

### 3.1.9 七层-章节映射表

下表将七层模型映射到本书的后续章节，供读者作为导航索引使用：

| 层 | 名称 | 主要章节 |
|---|---|---|
| L1 | 核心循环层（Agent Core） | 第 3 章（本章） |
| L2 | 上下文引擎（Context Engine） | 第 5 章 |
| L3 | 工具层（Tool System） | 第 6 章 |
| L4 | 记忆层（Memory） | 第 7–8 章 |
| L5 | 安全层（Security） | 第 12–14 章 |
| L6 | 评估层（Evaluation） | 第 15–16 章 |
| L7 | 编排层（Orchestration） | 第 9–10 章 |

> 状态管理作为贯穿各层的基础机制，在第 4 章独立展开。

---

## 3.2 Agent Loop 模式

Agent Loop（Agent 循环）是 Agent 系统的行为模式——它定义了 Agent 如何组织推理和行动过程。不同的 Loop 模式适用于不同类型的任务，选择合适的模式对效率、可靠性和成本有决定性影响。

本节将深入分析三种经典模式（ReAct、Plan-and-Execute、Adaptive），并扩展引入 Reflective Loop 和 Hybrid 模式。

```mermaid
flowchart LR
    subgraph 演进路线["Agent Loop 演进路线"]
        direction LR
        D["Direct<br/>单步直答"] -->|"增加推理链"| R["ReAct<br/>思考-行动-观察"]
        R -->|"增加全局规划"| PE["Plan-and-Execute<br/>先规划后执行"]
        R -->|"增加自我评估"| RF["Reflective<br/>反思修正"]
        PE -->|"步骤内灵活执行"| HY["Hybrid<br/>规划+ReAct"]
        RF -->|"结合规划"| HY
        HY -->|"跨Agent协作"| MA["Multi-Agent<br/>Delegation/Handoff"]
    end

    style D fill:#e8f5e9
    style R fill:#fff3e0
    style PE fill:#fff3e0
    style RF fill:#fce4ec
    style HY fill:#e3f2fd
    style MA fill:#f3e5f5
```
**图 3-4 Agent Loop 演进路线图**——从最简单的单步直答到多 Agent 协作，展示各模式之间的递进关系。箭头标注说明了从一种模式演进到下一种模式的核心动机。

---

### 3.2.1 ReAct 模式：思考-行动-观察

**ReAct（Reasoning + Acting）** 是最经典的 Agent Loop 模式，由 Yao et al. 于 2022 年提出。其核心思想是让 LLM 在每一步中显式输出 **思考过程（Thought）**，然后决定一个 **行动（Action）**，最后观察行动的 **结果（Observation）**，再基于观察进行下一轮思考。

```mermaid
flowchart LR
    subgraph ReAct 循环
        A[思考 Thought<br/>分析当前状态] --> B[行动 Action<br/>选择工具调用]
        B --> C[观察 Observation<br/>获取执行结果]
        C --> D{目标达成?}
        D -->|否| A
        D -->|是| E[输出最终答案]
    end
```
**图 3-5 ReAct 推理-行动循环**——ReAct 是最基础的 Agent 循环模式：思考-行动-观察-再思考。它的优势在于简单透明，每一步决策都有可解释的推理链。但缺点也很明显：循环次数不可控，容易陷入死循环。

ReAct 模式的优势在于：（1）**可解释性强**——每一步思考过程都被记录；（2）**灵活性高**——可根据每步观察动态调整策略；（3）**实现简单**——不需要预先制定完整计划。

但 ReAct 也有缺点：（1）**贪心决策**——每一步只看当前状态，缺乏全局规划；（2）**Token 消耗高**——每步都需完整上下文；（3）**容易陷入循环**——在缺乏进展时可能反复执行相同动作。

以下实现展示了带步骤追踪的 ReAct 核心结构：

```typescript
// ReAct 模式 -- 核心结构（带步骤追踪）
// 类型定义见 code-examples/shared/types.ts
interface ReActTrace {
  step: number; thought: string;
  action?: { tool: string; args: Record<string, unknown> };
  observation?: string; tokenUsage: number;
}

class ReActAgent {
  private traces: ReActTrace[] = [];
  constructor(private maxSteps: number = 8) {}

  async run(input: string, tools: Map<string, (args: any) => Promise<string>>):
    Promise<{ answer: string; traces: ReActTrace[] }> {
    const messages = [{ role: "user", content: input }];
    for (let step = 1; step <= this.maxSteps; step++) {
      const response = await callLLM(messages); // 定义见 code-examples/shared/llm-client.ts
      const parsed = JSON.parse(response.content);
      const trace: ReActTrace = { step, thought: parsed.thought, tokenUsage: response.tokenUsage.completion };
      if (parsed.answer) { this.traces.push(trace); return { answer: parsed.answer, traces: this.traces }; }
      trace.action = parsed.action;
      trace.observation = tools.get(parsed.action.tool)
        ? await tools.get(parsed.action.tool)!(parsed.action.args) : "工具未找到";
      this.traces.push(trace);
      messages.push({ role: "assistant", content: JSON.stringify(trace) });
    }
    return { answer: "[达到最大步数]", traces: this.traces };
  }
}
// 完整实现（含死循环检测、步骤去重）见 code-examples/ch03/react-agent.ts
```

---

### 3.2.2 Plan-and-Execute 模式：先规划后执行

**Plan-and-Execute** 模式将工作分为两个阶段：**Planner（规划器）** 制定完整计划，**Executor（执行器）** 逐步执行。这种模式借鉴了传统 AI 规划的思想，用 LLM 替代形式化规划算法。

优势：（1）**全局视角**——执行前就考虑了任务完整结构；（2）**Token 效率高**——执行阶段不需每次传入完整任务描述；（3）**可预测性强**——用户可在执行前审查计划。

局限：（1）**计划可能过时**——执行过程中环境可能变化；（2）**规划开销**——简单任务中制定计划反而增加延迟。

为解决计划过时问题，我们引入 **动态重规划** 机制：当执行结果与预期严重偏离时，触发重新规划。

```typescript
// Plan-and-Execute -- 核心结构（含动态重规划）
// 类型定义见 code-examples/shared/types.ts
interface PlanStep {
  id: number; description: string; status: "pending" | "running" | "done" | "failed"; result?: string;
}

class PlanAndExecuteAgent {
  async run(task: string): Promise<{ answer: string; plan: PlanStep[] }> {
    let plan = await this.generatePlan(task); // 阶段 1：LLM 生成计划（callLLM 定义见 code-examples/shared/llm-client.ts）
    for (const step of plan) {
      step.status = "running";
      step.result = await this.executeStep(step.description);
      step.status = "done";
      if (await this.shouldReplan(plan, step)) { // 偏离检测 → 动态重规划
        plan = [...plan.filter((s) => s.status === "done"), ...await this.replan(task, plan, step)];
      }
    }
    return { answer: await this.synthesize(plan), plan };
  }
  // generatePlan, executeStep, shouldReplan, replan, synthesize 完整实现见 code-examples/ch03/plan-execute-agent.ts
}
```

**设计权衡讨论。** 动态重规划引入了一个微妙的权衡：**重规划频率 vs 执行效率**。如果每个步骤失败都触发重规划，可能导致"规划震荡"——Agent 反复修改计划而无法推进。生产系统通常设置重规划阈值（如连续 2 次步骤失败才触发）和最大重规划次数（如最多 3 次）。另一个设计决策是计划粒度：粗粒度计划（3-5 步）更灵活但可能遗漏步骤，细粒度计划（10+ 步）更完整但更容易过时。

---

### 3.2.3 Adaptive 模式：自适应选择

**Adaptive 模式**是一种元模式——它根据任务特征动态选择最合适的执行模式。通过 **复杂度评估**（基于 Token 数量、工具需求、领域检测、问句类型等 heuristic）在 Direct、ReAct、Plan-and-Execute 之间做出最优选择。

```typescript
// Adaptive 模式 -- 复杂度评估与智能路由
// 类型定义见 code-examples/shared/types.ts
type ComplexityLevel = "trivial" | "simple" | "moderate" | "complex" | "expert";

class AdaptiveAgent {
  assess(input: string, availableTools: string[]): { level: ComplexityLevel; score: number } {
    let score = 0;
    if (input.length > 500) score += 20;
    if (input.includes("步骤") || input.includes("分析")) score += 25;
    if (availableTools.length > 5) score += 15;
    if (/\b(比较|对比|评估)\b/.test(input)) score += 20;
    const level: ComplexityLevel =
      score < 15 ? "trivial" : score < 30 ? "simple" :
      score < 55 ? "moderate" : score < 75 ? "complex" : "expert";
    return { level, score };
  }

  async run(input: string, tools: Map<string, (a: any) => Promise<string>>): Promise<string> {
    const { level } = this.assess(input, [...tools.keys()]);
    switch (level) {
      case "trivial": case "simple":
        return (await callLLM([{ role: "user", content: input }])).content; // 定义见 code-examples/shared/llm-client.ts
      case "moderate":
        return (await new ReActAgent(5).run(input, tools)).answer;
      case "complex": case "expert":
        return (await new PlanAndExecuteAgent().run(input)).answer;
    }
  }
}
```

---

### 3.2.4 Reflective Loop 模式：自我评估与修正

**Reflective Loop（反思循环）** 是在 ReAct 基础上增加了一个 **自我评估** 环节的高级模式。Agent 在生成初步答案后，不会立即返回，而是先对自己的输出进行质量评估。如果评估结果低于阈值，Agent 会进入修正循环，根据评估反馈改进答案。

这种模式特别适用于对输出质量要求高的场景：代码生成（需要检查语法和逻辑）、报告撰写（需要检查完整性和准确性）、数学推理（需要验证计算结果）。

Reflective Loop 的代价是额外的 LLM 调用（每次反思需要一次评估 + 一次修正），因此需要在质量提升和成本之间取得平衡。通常设置 2-3 次最大反思次数。

```typescript
// Reflective Loop -- 核心结构
// 类型定义见 code-examples/shared/types.ts
interface ReflectionResult {
  score: number; critique: string; // score: 0-1，低于阈值触发修正
  aspects: { completeness: number; accuracy: number; clarity: number };
}

class ReflectiveAgent {
  private qualityThreshold = 0.8;
  private maxReflections = 3;

  async run(input: string): Promise<{ answer: string; reflections: ReflectionResult[] }> {
    let answer = (await callLLM([{ role: "user", content: input }])).content; // 定义见 code-examples/shared/llm-client.ts
    const reflections: ReflectionResult[] = [];
    for (let i = 0; i < this.maxReflections; i++) {
      const eval_ = await this.evaluate(input, answer); // evaluate 见 code-examples/ch03/reflective-agent.ts
      reflections.push(eval_);
      if (eval_.score >= this.qualityThreshold) break;
      answer = (await callLLM([ // 定义见 code-examples/shared/llm-client.ts
        { role: "user", content: input }, { role: "assistant", content: answer },
        { role: "user", content: `请根据以下反馈改进你的回答：\n${eval_.critique}` },
      ])).content;
    }
    return { answer, reflections };
  }
}
```

---

### 3.2.5 模式对比表

在选择 Agent Loop 模式时，以下对比表提供了快速决策参考：

| 维度 | Direct | ReAct | Plan-and-Execute | Reflective | Hybrid |
|------|--------|-------|-------------------|------------|--------|
| **延迟** | 极低 (1 次 LLM) | 中等 (N 次) | 中高 (规划+执行) | 高 (N+评估) | 可变 |
| **Token 成本** | 最低 | 中等 | 中等偏低 | 高（含评估） | 中等 |
| **可靠性** | 低（无纠错） | 中等 | 较高（有计划） | 最高（自纠错） | 高 |
| **可解释性** | 无 | 高（Thought 链） | 高（计划可见） | 最高（含评估） | 高 |
| **最佳场景** | 简单问答 | 通用任务 | 复杂多步任务 | 高质量输出 | 混合场景 |
| **最差场景** | 需工具任务 | 需全局规划 | 简单任务（浪费） | 低延迟要求 | 过度工程 |
| **典型步数** | 1 | 3-8 | 规划1+执行N | (3-8)*2 | 自适应 |
| **适用复杂度** | 0-15 | 15-60 | 60-80 | 80-100 | 全范围 |

---

### 3.2.6 Hybrid 模式：ReAct + Plan-and-Execute 混合

在实际生产环境中，纯粹的单一模式往往不够灵活。**Hybrid 模式**将 Plan-and-Execute 的全局视角与 ReAct 的灵活执行结合起来：先用 Planner 制定高层计划，然后每个计划步骤内部用 ReAct 循环来执行，允许在步骤级别进行灵活的探索和调整。

这种模式的优势在于既有宏观的任务分解，又保留了微观的执行灵活性。Planner 不需要预测每一个细节，而 ReAct 执行器可以在每个步骤中根据实际情况自主决策。

```typescript
// Hybrid 模式 -- 核心结构（Plan + ReAct）
// 依赖 PlanAndExecuteAgent 和 ReActAgent（定义见上文）
class HybridAgent {
  private planner = new PlanAndExecuteAgent();
  private reactExecutor = new ReActAgent(5);

  async run(task: string, tools: Map<string, (a: any) => Promise<string>>):
    Promise<{ answer: string; plan: PlanStep[]; stepTraces: ReActTrace[][] }> {
    const { plan } = await this.planner.run(task);       // 阶段 1：高层规划
    const stepTraces: ReActTrace[][] = [];
    for (const step of plan) {                            // 阶段 2：ReAct 执行每步
      const { answer, traces } = await this.reactExecutor.run(step.description, tools);
      step.result = answer; step.status = "done";
      stepTraces.push(traces);
    }
    // 定义见 code-examples/shared/llm-client.ts
    const summary = plan.map((s) => `[${s.id}] ${s.description}: ${s.result}`).join("\n");
    const synthesis = await callLLM([ // 定义见 code-examples/shared/llm-client.ts
      { role: "user", content: `基于以下步骤结果回答原始问题:\n${summary}\n\n原始问题: ${task}` },
    ]);
    return { answer: synthesis.content, plan, stepTraces };
  }
}
```

### 3.2.7 Delegation/Handoff 模式：控制权转移

前面介绍的所有 Agent Loop 模式——从 Direct 到 Hybrid——都有一个共同特征：**控制权始终留在同一个 Agent 内部**。无论是 ReAct 的思考-行动循环还是 Plan-and-Execute 的规划-执行循环，驱动循环的始终是同一个 LLM 实例。但在真实的生产系统中，我们经常需要一种不同的控制流模式：**将循环本身转移给另一个 Agent**。

这就是 **Delegation/Handoff 模式**的核心思想——它不是在循环内部增加一个步骤，而是将整个执行循环的控制权转移。

#### 控制流的本质区别

在第二章 2.3.5 节中，我们从理论角度定义了 Delegation 和 Handoff。这里我们关注其**控制流层面的工程含义**：

- **Delegation**：当前 Agent 的循环**暂停**，启动目标 Agent 的循环来处理子任务，子任务完成后控制权**返回**原 Agent，原 Agent 继续自己的循环。这本质上是一次**同步调用**（或带回调的异步调用）。
- **Handoff**：当前 Agent 的循环**终止**，目标 Agent 的循环**接管**整个会话。控制权**不会返回**。这本质上是一次**控制流跳转**（类似于尾调用优化中的 tail call）。

这两种模式在 OpenAI Agents SDK 和 Anthropic 的多 Agent 架构中都有明确体现：

- **OpenAI Agents SDK** 引入了 `Handoff` 原语，允许 Agent 声明式地定义"在什么条件下将对话转交给哪个 Agent"，并支持 `input_filter` 和 `output_filter` 来控制上下文传递。
- **Anthropic 的 Orchestrator-Workers 模式**中，Orchestrator 实质上在对每个 Worker 执行 Delegation——将子任务分发给 Worker，等待结果汇总后继续。

#### 核心接口

以下展示 Delegation 和 Handoff 的核心控制流接口：

```typescript
// Delegation/Handoff -- 核心接口
// AgentDescriptor 类型定义见上文 3.1.7 节
interface DelegationResult { success: boolean; output: string; delegatedTo: string; durationMs: number; }

class DelegationHandler {
  private agents: Map<string, AgentDescriptor>;
  constructor(agents: AgentDescriptor[]) { this.agents = new Map(agents.map((a) => [a.id, a])); }

  /** Delegation：委派子任务，等待结果返回（带超时） */
  async delegate(targetId: string, input: string, timeoutMs = 30_000): Promise<DelegationResult> {
    const agent = this.agents.get(targetId);
    if (!agent) return { success: false, output: `未找到`, delegatedTo: targetId, durationMs: 0 };
    const start = Date.now();
    try {
      const output = await Promise.race([
        agent.execute(input),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("超时")), timeoutMs)),
      ]);
      return { success: true, output, delegatedTo: targetId, durationMs: Date.now() - start };
    } catch (err: any) {
      return { success: false, output: err.message, delegatedTo: targetId, durationMs: Date.now() - start };
    }
  }

  /** Handoff：终止当前循环，将会话完全移交 */
  async handoff(targetId: string, sessionContext: string): Promise<string> {
    const agent = this.agents.get(targetId);
    if (!agent) throw new Error(`Handoff 失败: Agent ${targetId} 未注册`);
    return agent.execute(sessionContext);
  }
}
// 完整实现见 code-examples/ch03/delegation-handler.ts
```

#### 何时使用 Delegation vs Handoff

选择 Delegation 还是 Handoff，取决于任务的**边界清晰度**和**领域专业性**：

| 判断维度 | 选择 Delegation | 选择 Handoff |
|---------|----------------|-------------|
| 子任务边界 | 明确定义、输入输出可序列化 | 模糊、需要多轮交互探索 |
| 领域专业性 | 当前 Agent 理解全局，只是需要帮手 | 目标 Agent 在该领域远优于当前 Agent |
| 控制需求 | 需要对结果做后处理、汇总或验证 | 信任目标 Agent 全权处理 |
| 会话连续性 | 用户不感知 Agent 切换 | 用户可感知且期望与专家对话 |
| 错误恢复 | Delegator 可重试或降级 | 移交后原 Agent 无法干预 |

**典型 Delegation 场景**：Orchestrator Agent 将"根据用户描述生成 SQL 查询"委派给 SQL 专家 Agent，拿到结果后继续执行查询并格式化输出。

**典型 Handoff 场景**：电商客服 Agent 识别到用户要求退款且情绪激动，将会话移交给专业的退款处理 Agent（该 Agent 拥有退款权限和话术模板）。

#### 与其他模式的关系

Delegation/Handoff 并非独立存在——它通常与其他 Agent Loop 模式**组合使用**：

- **Hybrid + Delegation**：Hybrid Agent 的 Planner 生成计划后，将某些步骤 delegate 给专业 Agent 执行，而非全部由内置 ReAct 执行器处理。
- **ReAct + Handoff**：ReAct Agent 在 Thought 阶段判断当前任务超出自身能力，触发 Handoff 将会话转交。
- **Orchestrator-Workers 即 Delegation**：第二章讨论的 Orchestrator-Workers 模式本质上就是结构化的多重 Delegation——Orchestrator 将任务分解后，对每个 Worker 执行一次 Delegation。

> **更新的模式对比**：在 3.2.5 节的模式对比表基础上，Delegation/Handoff 模式的关键特征为——延迟取决于目标 Agent（可变），Token 成本包含上下文传递开销（中等偏高），可靠性取决于目标 Agent 质量与回退策略（中到高），可解释性较高（委派链可追踪），最佳场景为跨领域专业协作，最差场景为简单任务（委派开销大于收益）。

---

## 3.3 状态管理基础

Agent 系统的状态管理是一个被严重低估的工程挑战。一个正在执行的 Agent 包含大量的运行时状态：当前执行到哪一步、已经调用了哪些工具、累计消耗了多少 Token、当前的计划是什么、是否遇到了错误等。如何组织和管理这些状态，直接影响系统的可测试性、可调试性和可恢复性。

本节提供状态管理的核心概念预览，帮助读者建立整体认知。

### 3.3.1 为什么需要不可变状态

在 Agent 系统中采用 **不可变状态（Immutable State）** 模式有三个核心理由：

**1. 可测试性**——不可变状态使得每一次状态转换都是纯函数：给定相同的旧状态和事件，必然产生相同的新状态。这意味着我们可以在不依赖外部环境的情况下，对状态转换逻辑进行完整的单元测试。

**2. 可调试性（Time-travel Debugging）**——由于每次状态变更都产生新的状态快照，我们可以保留完整的状态变更历史。当出现问题时，开发者可以"回到过去"，逐步检查每一次状态变更，精确定位问题发生的位置。

**3. 可审计性**——在生产环境中，我们需要能够回答"Agent 为什么做出这个决定"这样的问题。不可变状态 + 事件日志提供了完整的决策链条，满足了合规审计的要求。

### 3.3.2 Event Sourcing + Reducer 模式

我们采用 **Event Sourcing（事件溯源）** 模式来管理 Agent 状态。核心思想是：不直接修改状态，而是将所有的状态变更记录为一系列不可变的 **事件（Event）**。当前状态始终是对事件序列执行 **Reducer** 函数的结果。

以下是核心类型定义和 Reducer 模式的简化实现，展示 TASK_STARTED 和 LLM_CALL_END 两个代表性事件的处理逻辑：

```typescript
// 状态管理 -- Event Sourcing + Reducer（概念示例）
// 类型定义见 code-examples/shared/types.ts
type AgentPhase = "idle" | "thinking" | "acting" | "reflecting" | "done" | "error";
interface AgentState {
  conversationId: string; phase: AgentPhase;
  messages: { role: string; content: string }[];
  metrics: { totalTokens: number; llmCalls: number; toolCalls: number };
  error: string | null;
}
type AgentEvent =
  | { type: "TASK_STARTED"; conversationId: string; input: string }
  | { type: "LLM_CALL_END"; tokens: number; content: string }
  | { type: "TOOL_CALL_END"; toolName: string; result: string }
  | { type: "TASK_COMPLETED"; finalAnswer: string }
  | { type: "ERROR_OCCURRED"; error: string };

function agentReducer(state: AgentState, event: AgentEvent): AgentState {
  switch (event.type) {
    case "TASK_STARTED":
      return { ...state, conversationId: event.conversationId, phase: "thinking",
        messages: [...state.messages, { role: "user", content: event.input }] };
    case "LLM_CALL_END":
      return { ...state, phase: "acting",
        messages: [...state.messages, { role: "assistant", content: event.content }],
        metrics: { ...state.metrics, totalTokens: state.metrics.totalTokens + event.tokens, llmCalls: state.metrics.llmCalls + 1 } };
    case "TASK_COMPLETED": return { ...state, phase: "done" };
    case "ERROR_OCCURRED": return { ...state, phase: "error", error: event.error };
    default: return state;
  }
}
// Reducer 中间件、EventStore 持久化、检查点等完整实现见 code-examples/ch04/
```

完整的状态管理实现，包括 Reducer 中间件、状态转换守卫（`assertTransition`）、EventStore 事件持久化、检查点与时间旅行调试、以及分布式状态同步，将在**第 4 章**详细展开。

---

## 3.4 Agent 生命周期管理

在生产环境中，Agent 不是一个简单的函数调用——它是一个有状态的、长时间运行的实体。理解和管理 Agent 的生命周期，对于构建可靠的系统至关重要。

### 3.4.1 生命周期状态机

Agent 的生命周期可以用以下状态机表示：

```mermaid
stateDiagram-v2
    [*] --> Created
    Created --> Ready : initialize()
    Ready --> Running : start()
    Running --> Paused : pause()
    Running --> Error : error
    Paused --> Running : resume()
    Error --> Ready : recover()
    Ready --> Terminated : shutdown()
    Paused --> Terminated : shutdown()
    Error --> Terminated : shutdown()
    Terminated --> Created : reset()
    Terminated --> [*]
```
**图 3-6 Agent 生命周期状态机**——展示 Agent 从创建到终止的完整状态转换。注意 Error 状态可以通过 recover() 恢复到 Ready，而 Terminated 可以通过 reset() 回到 Created，支持 Agent 的重新初始化。

- **Created**：Agent 实例已创建，但尚未初始化资源（数据库连接、模型客户端等）。
- **Ready**：资源已就绪，等待接收任务。
- **Running**：正在执行任务（核心循环层运行中）。
- **Paused**：执行暂停（等待人工审批、外部回调等）。
- **Error**：遇到不可恢复的错误，需要介入处理。
- **Terminated**：生命周期结束，所有资源已释放。

### 3.4.2 关键工程要点

生命周期管理的核心挑战在于 **优雅关闭（Graceful Shutdown）** 和 **资源回收**：

1. **优雅关闭**——收到终止信号时，Agent 应完成当前正在执行的步骤（而非立即中断），将中间状态持久化到检查点，然后有序释放资源。
2. **资源回收**——注册清理函数（cleanup handlers），确保数据库连接、临时文件、事件监听器等在任何退出路径下都能被正确释放。
3. **暂停与恢复**——长时间任务中的暂停需求（如等待人工审批），要求 Agent 能将当前状态序列化并在恢复时还原执行上下文。

```typescript
// Agent 生命周期管理 -- 核心骨架
// 类型定义见 code-examples/shared/types.ts
type LifecycleState = "created" | "ready" | "running" | "paused" | "error" | "terminated";

class AgentLifecycleManager {
  private state: LifecycleState = "created";
  private cleanupFns: (() => Promise<void>)[] = [];

  onCleanup(fn: () => Promise<void>): void { this.cleanupFns.push(fn); }
  async initialize(): Promise<void> { this.assertState("created"); this.state = "ready"; }
  async start(): Promise<void> { this.assertState("ready"); this.state = "running"; }

  async gracefulShutdown(): Promise<void> {
    this.state = "terminated";
    for (const fn of [...this.cleanupFns].reverse()) {
      try { await fn(); } catch (e) { console.error("清理失败:", e); }
    }
  }

  private assertState(expected: LifecycleState): void {
    if (this.state !== expected) throw new Error(`期望 ${expected}，当前 ${this.state}`);
  }
}
// 暂停/恢复、检查点序列化、信号处理等完整实现见 code-examples/ch04/
```

完整的生命周期管理实现（包括暂停/恢复、检查点序列化、信号处理）同样在**第 4 章**中详细展开。

---

## 3.5 端到端请求生命周期

在理解了七层架构和各种 Agent Loop 模式后，让我们从一个完整请求的视角，用时序图展示端到端的处理过程——从用户提问到最终响应的全链路：

```mermaid
sequenceDiagram
    actor User as 用户
    participant GW as API Gateway
    participant Orch as L7 编排层
    participant Sec as L5 安全层
    participant Ctx as L2 上下文引擎
    participant Mem as L4 记忆层
    participant Core as L1 核心循环层
    participant LLM as LLM Provider
    participant Tool as L3 工具层
    participant Eval as L6 评估层

    User->>GW: HTTP POST /chat
    GW->>Orch: 路由请求
    Orch->>Sec: 输入安全检查
    Sec-->>Orch: 检查通过

    Orch->>Ctx: 组装上下文
    Ctx->>Mem: 语义检索历史记忆
    Mem-->>Ctx: Top-K 相关记忆
    Ctx-->>Orch: 完整上下文（system + history + injections）

    Orch->>Core: 启动核心循环
    Core->>LLM: prompt（含上下文）
    LLM-->>Core: 响应（含 tool_calls）

    Core->>Sec: 工具调用审计
    Core->>Tool: 执行工具
    Tool-->>Core: 工具结果
    Core->>Mem: 存储关键中间结果

    Core->>LLM: prompt（含工具结果）
    LLM-->>Core: 最终答案

    Core-->>Orch: 答案
    Orch->>Sec: 输出净化
    Sec-->>Orch: 净化后答案
    Orch->>Eval: 异步质量评估
    Orch-->>GW: 响应
    GW-->>User: HTTP 200 + 答案
```
**图 3-7 端到端请求生命周期时序图**——展示一次典型 Agent 请求从 API Gateway 入口到最终响应返回的完整链路。注意安全层在输入和输出两个阶段均参与处理，评估层采用异步方式避免增加响应延迟。

---

## 3.6 架构决策矩阵

在实际项目中，选择合适的架构模式需要综合考虑多种因素。本节提供系统化的决策指导。

### 3.6.1 决策矩阵表

| 决策维度 | 单步直答 | ReAct Agent | Plan-Execute | Reflective | Multi-Agent |
|---------|----------|-------------|--------------|------------|-------------|
| **任务类型** | 简单问答 | 需工具的通用任务 | 复杂多步任务 | 高质量输出 | 跨领域协作 |
| **延迟要求** | <1s | 3-15s | 10-60s | 15-120s | 30-300s |
| **Token 预算** | <1K | 2-10K | 5-20K | 10-30K | 20-100K |
| **可靠性需求** | 低 | 中 | 高 | 最高 | 高 |
| **可解释性** | 无 | 高 | 高 | 最高 | 中 |
| **实现复杂度** | 极低 | 低 | 中 | 中高 | 高 |
| **运维成本** | 无 | 低 | 中 | 中 | 高 |
| **适用团队规模** | 1人 | 2-3人 | 3-5人 | 3-5人 | 5+人 |
| **典型应用** | FAQ Bot | 客服Agent | 数据分析 | 代码生成 | 企业助手 |

### 3.6.2 架构反模式

在 Agent 系统设计中，以下是需要避免的常见反模式：

**1. God Agent（上帝 Agent）反模式**

将所有能力塞入一个巨大的 Agent 中，导致系统 Prompt 过长、上下文窗口拥挤、行为不可预测。

**解决方案**：采用多 Agent 架构，每个 Agent 专注于一个领域，通过编排层协调。

**2. Chatty Agents（话痨 Agent）反模式**

Agent 之间的通信过于频繁，每一个小决策都需要跨 Agent 协商，导致延迟爆炸和 Token 浪费。

**解决方案**：明确 Agent 之间的接口边界，使用异步消息传递而非同步 RPC，减少不必要的通信。

**3. Tight Coupling（紧耦合）反模式**

Agent 的实现与特定的 LLM 提供商、工具接口或数据格式紧密绑定，导致无法灵活替换。

**解决方案**：使用本章定义的七层架构，通过接口抽象实现层间解耦。例如工具层通过 ToolDefinition 接口与核心循环层交互，而非直接调用具体的 API。

**4. No Budget Guard（无预算守卫）反模式**

没有设置 Token 预算或最大迭代次数限制，导致 Agent 在复杂任务上无限循环，产生巨额费用。

**解决方案**：在核心循环层中始终设置 `maxIterations` 和 `tokenBudget`，并在评估层中监控异常消耗。

### 3.6.3 单体 Agent vs 微服务 Agent

| 维度 | 单体 Agent | 微服务 Agent |
|------|-----------|-------------|
| **部署复杂度** | 低（单一进程） | 高（多服务编排） |
| **扩展性** | 垂直扩展 | 水平扩展 |
| **故障隔离** | 差（一个组件挂全挂） | 好（独立失败域） |
| **开发速度** | 快（早期） | 慢（早期），快（后期） |
| **适用阶段** | MVP、概念验证 | 生产环境、高可用需求 |
| **团队要求** | 1-3 人 | 5+ 人 |

**选择建议**：

- **MVP 阶段**：从单体 Agent 开始，快速验证产品方向。
- **生产阶段**：当流量超过单机承载能力，或需要独立的故障隔离和扩展策略时，逐步拆分为微服务 Agent。
- **混合方案**：核心 Agent Loop 保持单体，将工具执行、记忆存储等无状态组件拆分为独立服务。

---

## 3.7 主流框架与七层模型的映射

不同的 Agent 框架在实现方式上各有侧重，但都可以映射到本章提出的七层参考架构上。下表以三个代表性框架为例，展示它们如何覆盖各层的关键能力：

| 框架 | L1 核心循环层 | L2 上下文引擎 | L3 工具层 | L4 记忆层 | L5 安全层 | L6 评估层 | L7 编排层 |
|-----|-----------|---------|--------|--------|--------|--------|--------|
| **LangGraph** | StateGraph + Nodes | State channels | Tools + ToolNode | Checkpointer | 需自行实现 | LangSmith | Graph 编排 |
| **OpenAI Agents SDK** | Agent Loop (Runner) | Instructions + context | function_calling | 需自行实现 | Guardrails | Tracing | Handoff 原语 |
| **Google ADK** | Agent 基类 | Context / Session | Tools + MCP | Session State | 需自行实现 | Eval 模块 | Multi-Agent Pipeline |

**解读要点**：

- **没有框架完整覆盖全部七层**。安全层和评估层通常需要团队自行补齐，这也是本书在第 12-16 章单独展开这两个主题的原因。
- **核心循环层和工具层**是所有框架的最强项——这是 Agent 框架的"最小可用集"。
- **编排层**的实现差异最大：LangGraph 使用显式的图结构，OpenAI Agents SDK 使用声明式的 Handoff，Google ADK 则倾向于管道式组合。
- 选择框架时，应评估它在你最薄弱的层上提供了多少开箱即用的支持，而非只看核心循环层的便利性。

---

## 3.8 架构设计决策检查清单

在开始构建 Agent 系统前，团队应逐项审视以下检查清单，确保关键决策已被显式讨论而非隐式忽略：

| 序号 | 决策领域 | 检查问题 | 典型选项 | 推荐阶段 |
|------|---------|---------|---------|---------|
| 1 | Agent Loop 模式 | 任务复杂度是否需要多步推理？ | Direct / ReAct / Plan-Execute / Hybrid | MVP |
| 2 | 终止条件 | 是否设置了 Token 预算和最大迭代次数？ | maxIterations + tokenBudget | MVP |
| 3 | 状态管理 | 状态是否采用不可变模式？是否支持 time-travel debug？ | Event Sourcing + Reducer | MVP |
| 4 | 上下文策略 | 上下文窗口用尽时的降级策略是什么？ | 优先级裁剪 / 摘要压缩 / 分段缓存 | MVP |
| 5 | 工具校验 | 工具参数校验的严格程度如何？误拒率是否可接受？ | 严格 JSON Schema / 宽进严出 | MVP |
| 6 | 错误恢复 | LLM 调用失败时的重试策略？指数退避参数？ | 固定重试 / 指数退避 / 熔断 | MVP |
| 7 | 安全防护 | Prompt Injection 检测深度？输出净化策略？ | 规则层 / 分类模型 / LLM 自审查 | 生产 |
| 8 | 评估体系 | 核心质量指标是什么？回归检测阈值？ | 任务成功率 / 用户满意度 / P99 延迟 | 生产 |
| 9 | 记忆策略 | 记忆粒度？检索方式？淘汰策略？ | 完整对话 / 关键事实 / 向量 + 元数据 | 生产 |
| 10 | 编排模式 | 单 Agent 还是多 Agent？路由策略？ | 单体 / Delegation / Handoff / Fan-out | 扩展 |
| 11 | 部署架构 | 单体还是微服务？故障隔离边界在哪？ | 单体 / 混合 / 完全微服务 | 扩展 |
| 12 | 确定性边界 | 哪些组件是确定性的？哪些包含概率性？测试策略是否匹配？ | 确定性层用单元测试 / 概率性层用统计评估 | 全阶段 |
| 13 | 成本控制 | Token 消耗的监控和告警阈值？单次请求的成本上限？ | 预算守卫 + 异常检测 | 生产 |
| 14 | 可观测性 | Trace 覆盖率？日志级别？仪表盘指标？ | OpenTelemetry / 自定义 Trace | 生产 |

> **使用建议**：在 MVP 阶段至少完成序号 1-6 的决策；进入生产前补齐 7-9；扩展阶段审视 10-14。每项决策应当被记录在架构决策记录（ADR）中，确保团队共识。

---

## 本章小结

本章建立了 AI Agent 系统的完整架构视图。第 3 章的任务不是让读者一次性掌握全部实现细节，而是先建立 Agent 工程的总地图：核心循环层、上下文引擎、工具层、记忆层、安全层、评估层与编排层并不是彼此孤立的主题，而是一个系统的不同侧面。后续主干章节，都会回到这张地图上继续展开。

以下是关键要点的回顾：

**七层参考架构** 将 Agent 系统的复杂性分解为七个清晰的层次：核心循环层负责感知-推理-行动的基本循环；上下文引擎管理有限的上下文窗口；工具层提供外部交互能力；记忆层实现跨会话的知识积累；安全层和评估层作为横切关注点保障全链路安全与输出质量；编排层协调多 Agent 协作。每一层都有明确的接口定义和职责边界。

**Agent Loop 模式** 提供了多种不同的执行策略：ReAct 以其灵活性和可解释性成为默认选择；Plan-and-Execute 适合需要全局视角的复杂任务；Adaptive 模式通过复杂度评估自动选择最优策略；Reflective Loop 通过自我评估提升输出质量；Hybrid 模式结合了规划和灵活执行的优点；Delegation/Handoff 则实现了跨 Agent 的控制权转移。

**状态管理** 采用 Event Sourcing + Reducer 的不可变模式，确保了可测试性、可调试性和可审计性。

**架构决策矩阵** 为实际项目中的技术选型提供了系统化的指导框架。

> **预告**：第四章将深入探讨 **状态管理与数据流**——如何用 Reducer 模式实现确定性状态变迁、中间件链、分布式状态同步与弹性引擎设计。第五章将聚焦 **Context Engineering（上下文工程）**——包括 WSCIPO（参见第 2 章：理论基础）六大原则、上下文健康检测、三层压缩策略和长对话管理。

## 建议接着读

如果你希望沿着本书的主干继续推进，建议下一步阅读**第 4 章《状态管理 — 确定性的基石》**。这样可以把本章中关于 Event Sourcing + Reducer 的概念预览，连接到完整的工程实现，包括中间件、检查点、时间旅行和分布式同步。

---

## 延伸阅读

1. **Yao, S. et al. (2022).** *ReAct: Synergizing Reasoning and Acting in Language Models.* arXiv:2210.03629. -- ReAct 模式的原始论文，提出了将推理链和工具使用交织的方法。

2. **Wang, L. et al. (2023).** *Plan-and-Solve Prompting: Improving Zero-Shot Chain-of-Thought Reasoning by Large Language Models.* ACL 2023. -- Plan-and-Execute 模式的理论基础。

3. **Shinn, N. et al. (2023).** *Reflexion: Language Agents with Verbal Reinforcement Learning.* NeurIPS 2023. -- Reflective Loop 的核心论文，展示了语言 Agent 如何通过自我反思来改进性能。

4. **Xi, Z. et al. (2023).** *The Rise and Potential of Large Language Model Based Agents: A Survey.* arXiv:2309.07864. -- 一篇全面的 LLM Agent 综述，覆盖了架构、能力和应用场景。

5. **Wu, Q. et al. (2023).** *AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation.* arXiv:2308.08155. -- 微软 AutoGen 框架论文，展示了多 Agent 对话编排的实践。

6. **Anthropic. (2024).** *Building Effective Agents.* Anthropic Research Blog. -- Anthropic 关于构建高效 Agent 的实践指南，包含架构设计和 Prompt 策略。

7. **Fowler, M. (2005).** *Event Sourcing.* martinfowler.com. -- Event Sourcing 模式的经典描述，本章状态管理设计的理论基础。

8. **Rao, A. S. & Georgeff, M. P. (1995).** *BDI Agents: From Theory to Practice.* ICMAS-95. -- BDI 架构的奠基论文，本章七层模型与经典 Agent 架构对比的理论基础。

9. **Laird, J. E. (2012).** *The Soar Cognitive Architecture.* MIT Press. -- Soar 认知架构的全面介绍，帮助理解七层模型中记忆层和核心循环层的认知科学渊源。

---

> **下一章**：第四章 状态管理与数据流
