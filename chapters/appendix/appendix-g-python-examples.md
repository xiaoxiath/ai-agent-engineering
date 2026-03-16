# 附录 G：Python 等价实现

> **阅读提示**
> 本书正文全部采用 TypeScript 编写示例代码。本附录为 Python 开发者提供四大核心模式的等价实现，帮助读者在 Python 生态中快速落地书中的架构思想。

---

## 前言

本书选择 TypeScript 作为主要示例语言，是因为其静态类型系统能清晰表达 Agent 系统中复杂的接口契约与状态机。然而，在 AI/ML 领域，**Python 毫无疑问是第一语言**：

- **模型框架**：PyTorch、TensorFlow、JAX 均以 Python 为首选接口
- **Agent 框架**：LangChain、LlamaIndex、AutoGen、CrewAI、Semantic Kernel 均为 Python-first
- **SDK 支持**：Anthropic Claude SDK、OpenAI SDK、Google Gemini SDK 的 Python 版本功能最完整、更新最及时
- **数据科学**：NumPy、Pandas、scikit-learn 构成了数据处理的基础设施
- **部署生态**：FastAPI、Ray Serve、vLLM、Triton 等推理部署工具均为 Python 原生

因此，本附录提供书中四大核心模式的 **完整 Python 等价实现**：

| 章节 | 核心模式 | Python 关键技术 |
|------|---------|----------------|
| 第 3 章 | Agent Loop（Agent主循环） | `anthropic` SDK、`asyncio`、Pydantic |
| 第 4 章 | State Management（状态管理） | `dataclasses`、Union 类型、纯函数 Reducer |
| 第 7 章 | Memory Architecture（记忆架构） | `deque`、`chromadb`、Token 预算规划 |
| 第 8 章 | RAG Pipeline（检索增强生成） | LangChain 风格、BM25 + 向量混合检索 |
| 第 6.5 章 | Skill System（技能系统） | YAML 解析、正则匹配、`subprocess` 运行时 |

**Python 版本要求**：所有代码基于 **Python 3.12+**，充分利用以下现代特性：
- `type` 关键字定义类型别名（PEP 695）
- `match/case` 模式匹配（PEP 634）
- 泛型语法 `class Foo[T]`（PEP 695）
- `dataclass(frozen=True, slots=True)` 提升性能和安全性
- `asyncio.TaskGroup` 结构化并发（PEP 654）

> **设计决策：为什么选择 Pydantic 而非纯 dataclass？**
>
> 在 Agent 系统中，大量数据来自 LLM 的 JSON 输出或外部 API，需要运行时校验。Pydantic v2 基于 Rust 实现的校验引擎提供了极致性能，同时兼容 dataclass 的简洁语法。本附录在需要校验的场景使用 Pydantic `BaseModel`，在纯内部数据结构中使用 `dataclass`。

---

## G.1 Agent Loop（Agent主循环）

> **对应正文**：第 3 章 3.1.1 节 Layer 1 -- Agent Core 核心循环层

Agent Loop 是整个 Agent 系统的心脏。它实现感知-推理-行动（Perceive-Reason-Act）循环，负责与 LLM 交互并根据响应决定下一步行动。本节提供完整的 Python 异步实现。

### G.1.1 类型定义

首先定义核心数据结构。Python 版本使用 Pydantic 进行运行时校验，使用 `Enum` 替代 TypeScript 的字面量联合类型：

```python
"""
Agent Core -- 类型定义
对应 TypeScript 版本的 interface 声明
"""
    # ... 完整代码见配套仓库 ...
    answer: str
    steps: list[AgentStep]
    token_tracker: TokenTracker
```

> **设计决策：`frozen=True` 的不可变数据**
>
> TypeScript 版本使用 `readonly` 修饰符。Python 等价方案是 `@dataclass(frozen=True)`，它使所有字段在创建后不可修改。这在 Agent 系统中极为重要——状态的不可变性保证了 Event Sourcing 的可靠回放。`slots=True` 则通过 `__slots__` 替代 `__dict__`，减少 40% 内存占用。

### G.1.2 协议定义（Protocol）

Python 使用 `Protocol`（结构化子类型）替代 TypeScript 的 `interface`，实现鸭子类型的静态检查：

```python
"""
Agent Core -- 协议定义
使用 Protocol 实现结构化子类型（Structural Subtyping）
"""
    # ... 完整代码见配套仓库 ...
    """安全检查结果"""
    allowed: bool
    reason: str = ""
```

> **设计决策：Protocol vs ABC**
>
> TypeScript 的 `interface` 是结构化类型——任何形状匹配的对象都自动实现接口。Python 的 `Protocol` 完美对应这一语义，无需显式继承。相比 `ABC`（抽象基类），`Protocol` 更灵活，允许第三方类无需修改即可满足协议约束。`@runtime_checkable` 装饰器使得 `isinstance()` 检查在运行时也能生效。

### G.1.3 配置类

```python
"""
Agent Core -- 配置
使用 Pydantic 提供校验和默认值
"""
    # ... 完整代码见配套仓库 ...

    class Config:
        frozen = True
```

### G.1.4 重试与超时工具函数

```python
"""
Agent Core -- 工具函数
指数退避重试 + 超时控制
"""
    # ... 完整代码见配套仓库 ...
        return await asyncio.wait_for(coro, timeout=timeout_seconds)
    except asyncio.TimeoutError:
        raise TimeoutError(error_message)
```

### G.1.5 核心循环实现

这是最核心的部分——完整的 Agent Loop，包含 Token 预算管理、重试机制、并行工具执行和安全检查：

```python
"""
Agent Core -- 生产级核心循环
对应第 3 章 agentLoop 函数的完整 Python 实现
"""
    # ... 完整代码见配套仓库 ...
            ))

        return steps, messages
```

### G.1.6 使用 Anthropic Claude SDK 的具体实现

```python
"""
LLMProvider 的 Anthropic Claude 实现
使用 anthropic Python SDK
"""
    # ... 完整代码见配套仓库 ...
        ) as stream:
            async for text in stream.text_stream:
                yield text
```

### G.1.7 使用 OpenAI SDK 的具体实现

```python
"""
LLMProvider 的 OpenAI 实现
展示同一 Protocol 的不同实现
"""
    # ... 完整代码见配套仓库 ...
                completion_tokens=response.usage.completion_tokens,
            ),
        )
```

### G.1.8 完整使用示例

```python
"""
完整使用示例 —— 将所有组件组装起来
"""
import asyncio
    # ... 完整代码见配套仓库 ...

if __name__ == "__main__":
    asyncio.run(main())
```


---

## G.2 State Management（状态管理）

> **对应正文**：第 4 章 Event Sourcing + Reducer 模式

第 4 章展示了借鉴 Redux 的 **Event Sourcing + Reducer** 模式来管理 Agent 状态。TypeScript 版本使用 Discriminated Union 和不可变对象。Python 版本使用 `match/case`、`@dataclass(frozen=True)` 和函数式 Reducer 实现完全等价的能力。

### G.2.1 状态与事件定义

```python
"""
State Management -- 状态与事件定义
对应 TypeScript 版本的 AgentState interface 和 AgentEvent union type
"""
    # ... 完整代码见配套仓库 ...
        updated_at=now,
        max_steps=max_steps,
    )
```

### G.2.2 事件类型：Discriminated Union 的 Python 等价

TypeScript 使用 Discriminated Union（带 `type` 标签的联合类型）定义事件。Python 3.12 中，我们使用 `@dataclass` + `Union` 类型别名实现同等效果：

```python
"""
State Management -- 事件类型
使用 dataclass 联合类型实现 Discriminated Union

    # ... 完整代码见配套仓库 ...
    | HumanFeedback | StepCompleted | TaskCompleted
    | ErrorOccurred | StateReset
)
```

> **设计决策：为什么不用 `Literal` 标签字段？**
>
> TypeScript 的 Discriminated Union 依赖 `type` 字段做运行时区分。Python 的 `match/case` 可以直接对类型进行模式匹配（`case TaskStarted()`），无需额外标签。这更 Pythonic，也更安全——类型信息由解释器保证，不会被篡改。

### G.2.3 事件创建辅助函数

```python
"""
State Management -- 事件创建辅助函数
"""

    # ... 完整代码见配套仓库 ...
    if "timestamp" not in kwargs:
        kwargs["timestamp"] = time.time()
    return event_class(**kwargs)
```

### G.2.4 完整 Reducer 实现

Reducer 是纯函数：给定当前状态和事件，返回新状态。使用 Python 3.10+ 的 `match/case` 实现穷尽性模式匹配：

```python
"""
State Management -- Agent 核心 Reducer
纯函数：(state, event) -> new_state
不产生副作用，不修改输入
    # ... 完整代码见配套仓库 ...
        # ─── 穷尽性检查 ────────────────────────────────
        case _:
            raise ValueError(f"未知事件类型: {type(event).__name__}")
```

> **设计决策：`match/case` 与穷尽性**
>
> TypeScript 的 `never` 类型断言可以在编译期捕获遗漏的事件分支。Python 的 `match/case` 没有内建的穷尽性检查，但可以通过以下方式补偿：（1）`case _` 兜底分支抛出异常；（2）使用 `mypy` 的 `--strict` 模式配合 `assert_never()`；（3）编写 pytest 测试覆盖所有事件类型。

### G.2.5 Selector 模式 -- 带缓存的派生状态

```python
"""
State Management -- Selector 模式
使用 functools.lru_cache 和自定义缓存实现记忆化 Selector

    # ... 完整代码见配套仓库 ...
        sum(latencies) / len(latencies) if latencies else 0.0
    ),
)
```

### G.2.6 Middleware 模式 -- 用装饰器拦截事件

```python
"""
State Management -- Middleware 模式
使用装饰器和高阶函数实现中间件链

    # ... 完整代码见配套仓库 ...
    validation_middleware,
    metrics_middleware,
)
```

### G.2.7 事件回放与时间旅行调试

```python
"""
State Management -- 事件回放与时间旅行调试
对应 TypeScript 版本的 TimeTravelDebugger
"""
    # ... 完整代码见配套仓库 ...
            initial_state=self._current_state,
        )
        return new_debugger
```


---

## G.3 Memory Architecture（记忆架构）

> **对应正文**：第 7 章 四层记忆模型

第 7 章提出了 Agent 的四层记忆模型：Working Memory、Conversation Memory、Task Memory 和 Long-term Memory。本节提供完整的 Python 实现，包括 Token 预算规划器和向量数据库集成。

### G.3.1 记忆层协议与通用接口

```python
"""
Memory Architecture -- 协议与基础类型定义
对应 TypeScript 的 MemoryLayer<T> interface
"""
    # ... 完整代码见配套仓库 ...
    async def evict(self) -> int: ...

    def stats(self) -> MemoryLayerStats: ...
```

### G.3.2 Token 预算规划器

```python
"""
Memory Architecture -- Token 预算规划器
对应 TypeScript 的 TokenBudgetPlanner 类
"""
    # ... 完整代码见配套仓库 ...
            )
            for layer, budget in budgets.items()
        }
```

### G.3.3 Working Memory -- 优先级队列实现

```python
"""
Memory Architecture -- Working Memory（工作记忆）
使用优先级队列管理当前推理步骤所需的短期记忆
对应 TypeScript 的 PriorityWorkingMemory 类
    # ... 完整代码见配套仓库 ...
                if self._total_retrievals > 0 else 0.0
            ),
        )
```

### G.3.4 Conversation Memory -- 滑动窗口 + 摘要压缩

```python
"""
Memory Architecture -- Conversation Memory（对话记忆）
使用 deque 实现滑动窗口，支持自动摘要压缩
对应 TypeScript 的 SmartWindowConversationMemory 类
    # ... 完整代码见配套仓库 ...
            entry_count=len(self._window),
            token_usage=self._current_tokens,
        )
```

### G.3.5 Long-term Memory -- 向量数据库集成

```python
"""
Memory Architecture -- Long-term Memory（长期记忆）
集成 ChromaDB 向量数据库实现语义检索
对应 TypeScript 的 VectorMemoryStore 类
    # ... 完整代码见配套仓库 ...
                if self._total_retrievals > 0 else 0.0
            ),
        )
```

### G.3.6 四层记忆统一管理器

```python
"""
Memory Architecture -- 统一记忆管理器
协调四层记忆的存储、检索和预算分配
"""
    # ... 完整代码见配套仓库 ...
            if indicator in content_lower:
                score += 0.1
        return min(score, 1.0)
```

> **设计决策：为什么使用 ChromaDB？**
>
> TypeScript 版本使用通用接口抽象向量存储。Python 生态中有更多成熟选择：ChromaDB（嵌入式，零配置）、Pinecone（托管服务）、Weaviate（自托管）、Qdrant（高性能）。本附录选择 ChromaDB 是因为它无需独立部署，`pip install chromadb` 即可使用，最适合学习和原型验证。生产环境可通过替换 `MemoryLayer` 的实现切换到其他后端。


---

## G.4 RAG Pipeline（检索增强生成）

> **对应正文**：第 8 章 RAG 知识工程

第 8 章详细介绍了 RAG Pipeline 的五个阶段：文档加载、分块、Embedding、检索和生成。本节提供完整的 Python 实现，包括混合检索（BM25 + 向量）和 Contextual Retrieval 模式。

### G.4.1 核心接口与数据模型

```python
"""
RAG Pipeline -- 核心数据模型
对应 TypeScript 版本的 Document / Chunk / RetrievalResult 等 interface
"""
    # ... 完整代码见配套仓库 ...
    generated_answer: str
    metrics: list[StageMetrics]
    trace_id: str
```

### G.4.2 协议定义

```python
"""
RAG Pipeline -- 协议定义
"""

    # ... 完整代码见配套仓库 ...
class LLMClient(Protocol):
    """LLM 客户端协议"""
    async def generate(self, query: str, context: str) -> str: ...
```

### G.4.3 Pipeline 观测器

```python
"""
RAG Pipeline -- 观测器
跟踪每个阶段的性能指标
"""
    # ... 完整代码见配套仓库 ...

    def get_metrics(self) -> list[StageMetrics]:
        return list(self._metrics)
```

### G.4.4 RAG Pipeline 核心实现

```python
"""
RAG Pipeline -- 核心 Pipeline 类
对应 TypeScript 的 RAGPipeline 类
"""
    # ... 完整代码见配套仓库 ...
            source = r.chunk.metadata.document_metadata.source
            parts.append(f"[来源 {i+1}: {source}]\n{r.chunk.content}")
        return "\n\n---\n\n".join(parts)
```

### G.4.5 固定大小分块器

```python
"""
RAG Pipeline -- 固定大小分块器
对应 TypeScript 的 FixedSizeChunker 类
"""
    # ... 完整代码见配套仓库 ...
            ))

        return chunks
```

### G.4.6 混合检索器（BM25 + 向量）

```python
"""
RAG Pipeline -- 混合检索器
结合 BM25 稀疏检索和向量稠密检索
对应 TypeScript 的 HybridRetriever 类
    # ... 完整代码见配套仓库 ...
            for cid in sorted_ids[:top_k]
        ]
        return results
```

### G.4.7 RAG Pipeline Builder

```python
"""
RAG Pipeline -- Builder 模式
对应 TypeScript 的 RAGPipelineBuilder 类
"""
    # ... 完整代码见配套仓库 ...
            reranker=self._reranker,
            log_level=self._log_level,
        )
```


---

## G.5 Skill System（技能系统）

> **对应正文**：第 6.5 章 Skill 工程

第 6.5 章提出了 Skill 作为 Agent 能力的高级抽象——将工具、指令、知识和安全护栏打包为可复用的技能单元。本节提供 SkillManifest、SkillParser、SkillMatcher 和 BashSkillRuntime 的完整 Python 实现。

### G.5.1 Skill 数据模型

```python
"""
Skill System -- 数据模型
对应 TypeScript 的 SkillManifest / SkillMetadata / TriggerDefinition 等
"""
    # ... 完整代码见配套仓库 ...
    guardrails: tuple[GuardrailRule, ...]
    raw_markdown: str
    parsed_at: float = field(default_factory=time.time)
```

### G.5.2 SkillParser -- SKILL.md 解析器

```python
"""
Skill System -- SKILL.md 解析器
对应 TypeScript 的 SkillParser 类
"""
    # ... 完整代码见配套仓库 ...
            raise SkillParseError(
                "验证失败: " + "; ".join(errors)
            )
```

### G.5.3 SkillMatcher -- 技能匹配器

```python
"""
Skill System -- 技能匹配器
对应 TypeScript 的 SkillMatcher 类
"""
    # ... 完整代码见配套仓库 ...
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)
```

### G.5.4 BashSkillRuntime -- Bash 脚本执行运行时

```python
"""
Skill System -- Bash 技能运行时
安全地执行 Skill 中定义的 Bash 脚本
"""
    # ... 完整代码见配套仓库 ...
            # 清理临时脚本
            if os.path.exists(script_path):
                os.remove(script_path)
```

---

## G.6 TypeScript 与 Python 对照表

本节提供一份全面的 TypeScript 与 Python 模式对照表，帮助读者在两种语言之间快速切换。

### G.6.1 类型系统对照

| 模式 | TypeScript | Python |
|------|-----------|--------|
| **基本类型注解** | `let x: number = 1` | `x: int = 1` |
| **接口 / 协议** | `interface Foo { bar(): void }` | `class Foo(Protocol): def bar(self) -> None: ...` |
| **不可变对象** | `interface Foo { readonly x: number }` | `@dataclass(frozen=True)` |
| **联合类型** | `type A = B \| C \| D` | `type A = B \| C \| D` (PEP 695) |
| **Discriminated Union** | `{ type: 'A'; data: string } \| ...` | 独立 dataclass + `match/case` |
| **泛型** | `function foo<T>(x: T): T` | `def foo[T](x: T) -> T` (PEP 695) |
| **枚举** | `enum Color { Red, Green }` | `class Color(Enum): RED = auto()` |
| **字面量类型** | `type Dir = 'up' \| 'down'` | `type Dir = Literal['up', 'down']` |
| **可选值** | `x?: string` / `x: string \| undefined` | `x: str \| None = None` |
| **类型守卫** | `if (isA(x)) { ... }` | `if isinstance(x, A): ...` / `match x: case A():` |
| **Record** | `Record<string, number>` | `dict[str, int]` |
| **Tuple** | `[string, number]` | `tuple[str, int]` |
| **运行时校验** | Zod / io-ts | Pydantic `BaseModel` |
| **带校验的默认值** | Zod `.default(0).min(1)` | `Field(default=0, ge=1)` |

### G.6.2 异步模式对照

| 模式 | TypeScript | Python |
|------|-----------|--------|
| **异步函数** | `async function foo(): Promise<T>` | `async def foo() -> T` |
| **等待** | `await promise` | `await coroutine` |
| **并行** | `Promise.all([a(), b()])` | `asyncio.gather(a(), b())` |
| **结构化并发** | 无原生支持 | `async with asyncio.TaskGroup() as tg` |
| **并行竞速** | `Promise.race([a(), b()])` | `asyncio.wait(tasks, return_when=FIRST_COMPLETED)` |
| **超时** | 手写 `withTimeout()` | `asyncio.wait_for(coro, timeout=N)` |
| **流式迭代** | `for await (const x of stream)` | `async for x in stream` |
| **异步生成器** | `async function* gen()` | `async def gen(): yield ...` |
| **事件循环** | 隐式（V8 event loop） | `asyncio.run(main())` 显式启动 |
| **并发容错** | `Promise.allSettled()` | `asyncio.gather(return_exceptions=True)` |

### G.6.3 设计模式对照

| 模式 | TypeScript | Python |
|------|-----------|--------|
| **不可变更新** | 展开运算符 `{...obj, key: val}` | `dataclasses.replace(obj, key=val)` |
| **Builder** | 链式 `.withX()` 方法 | 同样链式 `.with_x()` + `Self` 类型 |
| **Reducer** | `switch (event.type)` | `match event: case EventType():` |
| **Middleware** | 高阶函数嵌套 | 装饰器 `@middleware` 或高阶函数 |
| **Observer** | `EventEmitter` | `asyncio.Queue` 或回调函数 |
| **Selector** | `createSelector(deps, compute)` | 自定义 `Selector` 类 + 缓存 |
| **Protocol** | `interface` (结构化类型) | `Protocol` (结构化子类型) |
| **依赖注入** | 构造函数参数 | 构造函数参数 / `@inject` 装饰器 |
| **错误处理** | `try/catch` + 自定义 Error | `try/except` + 自定义 Exception |
| **重试** | 自定义 `callWithRetry()` | `tenacity.retry()` 或自定义 |
| **日志** | `console.log` / Winston | `logging` 标准库 |

### G.6.4 Agent 专用模式对照

| 模式 | TypeScript 实现 | Python 实现 |
|------|----------------|-------------|
| **Agent Loop** | `async function agentLoop()` | `class AgentLoop: async def run()` |
| **Token 追踪** | `interface TokenTracker` | `@dataclass(frozen=True) TokenTracker` |
| **工具调用** | `Promise.allSettled(calls)` | `async with TaskGroup() as tg` |
| **状态机** | Discriminated Union switch | dataclass + match/case |
| **Event Sourcing** | `agentReducer(state, event)` | `Agent_reducer(state, event)` |
| **记忆化 Selector** | `createSelector()` 闭包 | `Selector` 泛型类 |
| **Middleware 链** | `applyMiddleware(reducer, ...mw)` | `apply_middleware(reducer, *mw)` |
| **时间旅行** | `TimeTravelDebugger` 类 | `TimeTravelDebugger` 类 |
| **记忆层** | `MemoryLayer<T>` interface | `MemoryLayer[T]` Protocol |
| **Token 预算** | `TokenBudgetPlanner` 类 | `TokenBudgetPlanner` 类 |
| **向量存储** | 通用 interface | ChromaDB 具体实现 |
| **RAG Pipeline** | `RAGPipeline` 类 | `RAGPipeline` 类 |
| **混合检索** | `HybridRetriever` 类 | `HybridRetriever` + `BM25Retriever` |
| **Skill 解析** | `SkillParser` 正则解析 | `SkillParser` + `yaml.safe_load` |
| **Skill 匹配** | 四策略加权 | 四策略加权（同构） |
| **Bash 运行时** | `child_process.spawn` | `asyncio.create_subprocess_exec` |

### G.6.5 Python 生态推荐工具

以下是实现本书各章模式时推荐的 Python 库：

| 功能领域 | 推荐库 | 说明 |
|---------|-------|------|
| **LLM SDK** | `anthropic`, `openai` | 官方 SDK，异步支持完善 |
| **类型校验** | `pydantic>=2.0` | Rust 实现的校验引擎，性能极佳 |
| **异步框架** | `asyncio` (标准库) | Python 3.12 的 TaskGroup 非常好用 |
| **向量数据库** | `chromadb` | 嵌入式，零配置，适合原型 |
| **Embedding** | `sentence-transformers` | 本地 Embedding 模型 |
| **Web 框架** | `fastapi` | Agent API 服务部署 |
| **Agent 框架** | `LangChain`, `llamaindex` | 快速原型，但架构灵活性有限 |
| **可观测性** | `opentelemetry-api` | 分布式追踪标准 |
| **测试** | `pytest`, `pytest-asyncio` | 异步测试支持 |
| **YAML** | `pyyaml` | SKILL.md front matter 解析 |
| **重试** | `tenacity` | 比手写更健壮的重试库 |
| **分词** | `jieba`, `tiktoken` | 中文分词 / OpenAI Token 计算 |

---

## 小结

本附录提供了书中四大核心模式（Agent Loop、State Management、Memory Architecture、RAG Pipeline）加上 Skill System 的完整 Python 等价实现。总结几个关键的跨语言设计映射：

1. **TypeScript `interface`** 对应 **Python `Protocol`**——两者都是结构化类型，无需显式继承
2. **TypeScript `readonly` + 展开运算符** 对应 **Python `@dataclass(frozen=True)` + `replace()`**——不可变状态的更新方式
3. **TypeScript Discriminated Union + `switch`** 对应 **Python 独立 dataclass + `match/case`**——穷尽性模式匹配
4. **TypeScript `Promise.all/allSettled`** 对应 **Python `asyncio.TaskGroup`**——结构化并发
5. **TypeScript Zod** 对应 **Python Pydantic v2**——运行时数据校验

这些映射关系不仅适用于本书的 Agent 架构，也适用于任何需要在 TypeScript 和 Python 之间迁移的系统设计。

希望本附录能帮助 Python 开发者更顺畅地理解和应用书中的架构思想，在自己的 Agent 项目中落地实践。
