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
| 第 3 章 | Agent Loop（智能体主循环） | `anthropic` SDK、`asyncio`、Pydantic |
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

## G.1 Agent Loop（智能体主循环）

> **对应正文**：第 3 章 3.1.1 节 Layer 1 -- Agent Core 核心循环层

Agent Loop 是整个 Agent 系统的心脏。它实现感知-推理-行动（Perceive-Reason-Act）循环，负责与 LLM 交互并根据响应决定下一步行动。本节提供完整的 Python 异步实现。

### G.1.1 类型定义

首先定义核心数据结构。Python 版本使用 Pydantic 进行运行时校验，使用 `Enum` 替代 TypeScript 的字面量联合类型：

```python
"""
Agent Core -- 类型定义
对应 TypeScript 版本的 interface 声明
"""
from __future__ import annotations

import asyncio
import time
import uuid
import logging
from enum import Enum
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# ─── 基础枚举 ───────────────────────────────────────────

class FinishReason(str, Enum):
    """LLM 响应的终止原因"""
    STOP = "stop"
    TOOL_CALLS = "tool_calls"
    LENGTH = "length"
    CONTENT_FILTER = "content_filter"


class MessageRole(str, Enum):
    """消息角色"""
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"


# ─── Pydantic 模型：需要运行时校验的外部数据 ──────────────

class TokenUsage(BaseModel):
    """Token 用量统计"""
    prompt_tokens: int = Field(ge=0)
    completion_tokens: int = Field(ge=0)

    @property
    def total(self) -> int:
        return self.prompt_tokens + self.completion_tokens


class ToolCall(BaseModel):
    """工具调用描述"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    arguments: dict[str, Any]


class LLMResponse(BaseModel):
    """LLM 模型响应的结构化表示"""
    content: str = ""
    tool_calls: list[ToolCall] = Field(default_factory=list)
    finish_reason: FinishReason
    usage: TokenUsage


class ToolResult(BaseModel):
    """工具执行结果"""
    call_id: str
    output: str
    is_error: bool = False
    duration_ms: float = 0.0


class Message(BaseModel):
    """对话消息"""
    role: MessageRole
    content: str
    tool_call_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    timestamp: float = Field(default_factory=time.time)


# ─── dataclass：纯内部数据结构 ─────────────────────────

@dataclass(frozen=True, slots=True)
class TokenTracker:
    """Token 使用追踪器（不可变）"""
    total_prompt_tokens: int = 0
    total_completion_tokens: int = 0
    call_count: int = 0
    history: tuple[TokenRecord, ...] = ()

    @property
    def total_tokens(self) -> int:
        return self.total_prompt_tokens + self.total_completion_tokens

    def add(self, step: int, usage: TokenUsage) -> TokenTracker:
        """返回新的 TokenTracker（不可变更新）"""
        record = TokenRecord(
            step=step,
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
            timestamp=time.time(),
        )
        return TokenTracker(
            total_prompt_tokens=self.total_prompt_tokens + usage.prompt_tokens,
            total_completion_tokens=self.total_completion_tokens + usage.completion_tokens,
            call_count=self.call_count + 1,
            history=(*self.history, record),
        )


@dataclass(frozen=True, slots=True)
class TokenRecord:
    """单步 Token 使用记录"""
    step: int
    prompt_tokens: int
    completion_tokens: int
    timestamp: float


@dataclass(frozen=True, slots=True)
class AgentStep:
    """每一步循环的结构化记录"""
    index: int
    thought: str
    action: ToolAction | None = None
    observation: str | None = None
    token_usage: TokenUsage | None = None
    duration_ms: float = 0.0
    timestamp: float = field(default_factory=time.time)


@dataclass(frozen=True, slots=True)
class ToolAction:
    """工具调用动作"""
    tool: str
    args: dict[str, Any]


@dataclass(frozen=True, slots=True)
class AgentResult:
    """Agent 循环的最终结果"""
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

@runtime_checkable
class LLMProvider(Protocol):
    """LLM 调用协议 —— 对应 TypeScript 的 callLLM 接口"""

    async def call(
        self,
        messages: list[Message],
        tools: list[dict[str, Any]] | None = None,
        stream: bool = False,
    ) -> LLMResponse: ...

    async def call_stream(
        self,
        messages: list[Message],
        tools: list[dict[str, Any]] | None = None,
    ) -> AsyncIterator[str]: ...


@runtime_checkable
class ToolExecutor(Protocol):
    """工具执行协议"""

    async def execute(
        self, name: str, arguments: dict[str, Any]
    ) -> ToolResult: ...


@runtime_checkable
class ContextEngine(Protocol):
    """上下文引擎协议"""

    def assemble_context(self, goal: str) -> list[Message]: ...
    def compress_if_needed(self, messages: list[Message]) -> list[Message]: ...


@runtime_checkable
class SecurityGuard(Protocol):
    """安全守卫协议"""

    def validate_tool_call(self, call: ToolCall) -> SecurityCheckResult: ...
    def sanitize_output(self, content: str) -> str: ...


@dataclass(frozen=True, slots=True)
class SecurityCheckResult:
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
from typing import Callable

from pydantic import BaseModel, Field


class RetryConfig(BaseModel):
    """重试配置"""
    max_retries: int = Field(default=3, ge=1, le=10)
    base_delay_ms: float = Field(default=1000.0, ge=100)
    max_delay_ms: float = Field(default=30000.0, ge=1000)


class AgentCoreConfig(BaseModel):
    """Agent 循环配置"""
    max_iterations: int = Field(default=20, ge=1, le=100, description="最大循环次数")
    max_token_budget: int = Field(default=100_000, ge=1000, description="Token 预算上限")
    timeout_seconds: float = Field(default=30.0, ge=1.0, description="单次工具调用超时")
    retry_config: RetryConfig = Field(default_factory=RetryConfig)
    enable_streaming: bool = False

    class Config:
        frozen = True
```

### G.1.4 重试与超时工具函数

```python
"""
Agent Core -- 工具函数
指数退避重试 + 超时控制
"""
import asyncio
import random


async def call_with_retry[T](
    fn: Callable[[], Awaitable[T]],
    config: RetryConfig,
) -> T:
    """
    带指数退避的异步重试
    对应 TypeScript 版本的 callWithRetry 函数

    使用 Python 3.12 泛型语法 (PEP 695)
    """
    last_error: Exception | None = None

    for attempt in range(config.max_retries + 1):
        try:
            return await fn()
        except Exception as e:
            last_error = e
            if attempt == config.max_retries:
                break

            # 指数退避 + 随机抖动
            delay_ms = min(
                config.base_delay_ms * (2 ** attempt),
                config.max_delay_ms,
            )
            jitter = random.uniform(0, delay_ms * 0.1)
            wait_seconds = (delay_ms + jitter) / 1000.0

            logger.warning(
                f"[AgentCore] 第 {attempt + 1} 次重试，"
                f"等待 {wait_seconds:.1f}s，错误: {e}"
            )
            await asyncio.sleep(wait_seconds)

    raise RuntimeError(
        f"重试 {config.max_retries} 次后仍失败: {last_error}"
    ) from last_error


async def with_timeout[T](
    coro: Awaitable[T],
    timeout_seconds: float,
    error_message: str = "操作超时",
) -> T:
    """
    异步超时控制
    对应 TypeScript 版本的 withTimeout 函数
    """
    try:
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


class AgentLoop:
    """
    生产级 Agent 核心循环

    实现了完整的感知-推理-行动循环，包含：
    - 指数退避重试机制
    - Token 预算追踪与控制
    - 流式输出支持
    - 结构化步骤日志
    - 并行工具执行
    - 安全检查
    """

    def __init__(
        self,
        config: AgentCoreConfig,
        llm_provider: LLMProvider,
        tool_executor: ToolExecutor,
        context_engine: ContextEngine,
        security_guard: SecurityGuard,
        on_stream: Callable[[str], None] | None = None,
    ):
        self._config = config
        self._llm = llm_provider
        self._tools = tool_executor
        self._context = context_engine
        self._security = security_guard
        self._on_stream = on_stream

    async def run(self, goal: str) -> AgentResult:
        """
        执行 Agent 主循环

        Args:
            goal: 用户输入的目标/任务描述

        Returns:
            AgentResult 包含最终答案、步骤记录和 Token 统计
        """
        steps: list[AgentStep] = []
        token_tracker = TokenTracker()

        # 初始化消息上下文
        messages: list[Message] = self._context.assemble_context(goal)

        for i in range(self._config.max_iterations):
            step_start = time.time()

            # ── Token 预算检查 ──────────────────────────────
            if token_tracker.total_tokens >= self._config.max_token_budget:
                logger.warning(
                    f"[AgentCore] Token 预算耗尽: "
                    f"{token_tracker.total_tokens}/{self._config.max_token_budget}"
                )
                summary = (
                    "抱歉，Token 预算已用尽。以下是目前的分析结果：\n"
                    + "\n".join(s.thought for s in steps)
                )
                return AgentResult(
                    answer=summary,
                    steps=steps,
                    token_tracker=token_tracker,
                )

            # ── 带重试的 LLM 调用 ──────────────────────────
            try:
                response = await call_with_retry(
                    fn=lambda: self._llm.call(messages),
                    config=self._config.retry_config,
                )
            except Exception as e:
                error_step = AgentStep(
                    index=i,
                    thought=f"LLM 调用失败: {e}",
                    duration_ms=(time.time() - step_start) * 1000,
                )
                steps.append(error_step)
                return AgentResult(
                    answer=f"处理过程中遇到错误，已完成 {i} 步。",
                    steps=steps,
                    token_tracker=token_tracker,
                )

            # ── 更新 Token 追踪 ────────────────────────────
            token_tracker = token_tracker.add(i, response.usage)

            # ── 判断是否需要调用工具 ────────────────────────
            if (
                response.finish_reason == FinishReason.TOOL_CALLS
                and response.tool_calls
            ):
                steps, messages = await self._handle_tool_calls(
                    response=response,
                    step_index=i,
                    step_start=step_start,
                    steps=steps,
                    messages=messages,
                )
                # 上下文压缩
                messages = self._context.compress_if_needed(messages)
            else:
                # ── 模型认为任务完成 ────────────────────────
                steps.append(AgentStep(
                    index=i,
                    thought=response.content,
                    token_usage=response.usage,
                    duration_ms=(time.time() - step_start) * 1000,
                ))
                sanitized = self._security.sanitize_output(response.content)
                return AgentResult(
                    answer=sanitized,
                    steps=steps,
                    token_tracker=token_tracker,
                )

        # 达到最大步数限制
        return AgentResult(
            answer="已达到最大推理步数限制。",
            steps=steps,
            token_tracker=token_tracker,
        )

    async def _handle_tool_calls(
        self,
        response: LLMResponse,
        step_index: int,
        step_start: float,
        steps: list[AgentStep],
        messages: list[Message],
    ) -> tuple[list[AgentStep], list[Message]]:
        """
        处理工具调用：安全检查 → 并行执行 → 记录结果

        使用 asyncio.TaskGroup 实现结构化并发（PEP 654）
        """
        approved_calls: list[ToolCall] = []
        for call in response.tool_calls:
            check = self._security.validate_tool_call(call)
            if not check.allowed:
                logger.warning(f"[Security] 工具调用被拒绝: {call.name}")
                messages.append(Message(
                    role=MessageRole.TOOL,
                    content=f"工具 {call.name} 被安全策略拒绝: {check.reason}",
                    tool_call_id=call.id,
                ))
            else:
                approved_calls.append(call)

        # 并行执行所有被批准的工具调用
        results: list[ToolResult | Exception] = []
        async with asyncio.TaskGroup() as tg:
            tasks = [
                tg.create_task(
                    with_timeout(
                        self._tools.execute(call.name, call.arguments),
                        self._config.timeout_seconds,
                        f"工具 {call.name} 执行超时",
                    )
                )
                for call in approved_calls
            ]

        # 收集结果（TaskGroup 保证所有任务完成或取消）
        for idx, task in enumerate(tasks):
            try:
                results.append(task.result())
            except Exception as e:
                results.append(e)

        # 记录步骤和消息
        for call, result in zip(approved_calls, results):
            if isinstance(result, Exception):
                observation = f"工具执行失败: {result}"
            else:
                observation = result.output

            messages.append(Message(
                role=MessageRole.TOOL,
                content=observation,
                tool_call_id=call.id,
            ))
            steps.append(AgentStep(
                index=step_index,
                thought=response.content or "(模型未输出思考过程)",
                action=ToolAction(tool=call.name, args=call.arguments),
                observation=observation,
                token_usage=response.usage,
                duration_ms=(time.time() - step_start) * 1000,
            ))

        return steps, messages
```

### G.1.6 使用 Anthropic Claude SDK 的具体实现

```python
"""
LLMProvider 的 Anthropic Claude 实现
使用 anthropic Python SDK
"""
from anthropic import AsyncAnthropic


class ClaudeLLMProvider:
    """
    基于 Anthropic Claude SDK 的 LLM 提供者

    满足 LLMProvider Protocol，无需显式继承
    """

    def __init__(
        self,
        model: str = "claude-sonnet-4-20250514",
        api_key: str | None = None,
        system_prompt: str = "",
        max_tokens: int = 4096,
    ):
        self._client = AsyncAnthropic(api_key=api_key)
        self._model = model
        self._system_prompt = system_prompt
        self._max_tokens = max_tokens

    async def call(
        self,
        messages: list[Message],
        tools: list[dict[str, Any]] | None = None,
        stream: bool = False,
    ) -> LLMResponse:
        """调用 Claude API"""
        # 转换消息格式
        api_messages = [
            {"role": msg.role.value, "content": msg.content}
            for msg in messages
            if msg.role != MessageRole.SYSTEM
        ]

        kwargs: dict[str, Any] = {
            "model": self._model,
            "max_tokens": self._max_tokens,
            "messages": api_messages,
        }
        if self._system_prompt:
            kwargs["system"] = self._system_prompt

        if tools:
            kwargs["tools"] = tools

        response = await self._client.messages.create(**kwargs)

        # 解析响应
        content_text = ""
        tool_calls: list[ToolCall] = []

        for block in response.content:
            if block.type == "text":
                content_text += block.text
            elif block.type == "tool_use":
                tool_calls.append(ToolCall(
                    id=block.id,
                    name=block.name,
                    arguments=block.input,
                ))

        finish_reason = (
            FinishReason.TOOL_CALLS if response.stop_reason == "tool_use"
            else FinishReason.STOP
        )

        return LLMResponse(
            content=content_text,
            tool_calls=tool_calls,
            finish_reason=finish_reason,
            usage=TokenUsage(
                prompt_tokens=response.usage.input_tokens,
                completion_tokens=response.usage.output_tokens,
            ),
        )

    async def call_stream(
        self,
        messages: list[Message],
        tools: list[dict[str, Any]] | None = None,
    ):
        """流式调用 Claude API"""
        api_messages = [
            {"role": msg.role.value, "content": msg.content}
            for msg in messages
            if msg.role != MessageRole.SYSTEM
        ]

        async with self._client.messages.stream(
            model=self._model,
            max_tokens=self._max_tokens,
            messages=api_messages,
            system=self._system_prompt or None,
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
from openai import AsyncOpenAI


class OpenAILLMProvider:
    """基于 OpenAI SDK 的 LLM 提供者"""

    def __init__(
        self,
        model: str = "gpt-4o",
        api_key: str | None = None,
        system_prompt: str = "",
        max_tokens: int = 4096,
    ):
        self._client = AsyncOpenAI(api_key=api_key)
        self._model = model
        self._system_prompt = system_prompt
        self._max_tokens = max_tokens

    async def call(
        self,
        messages: list[Message],
        tools: list[dict[str, Any]] | None = None,
        stream: bool = False,
    ) -> LLMResponse:
        """调用 OpenAI API"""
        api_messages: list[dict[str, Any]] = []
        if self._system_prompt:
            api_messages.append({
                "role": "system",
                "content": self._system_prompt,
            })

        for msg in messages:
            api_msg: dict[str, Any] = {
                "role": msg.role.value,
                "content": msg.content,
            }
            if msg.tool_call_id:
                api_msg["tool_call_id"] = msg.tool_call_id
            api_messages.append(api_msg)

        kwargs: dict[str, Any] = {
            "model": self._model,
            "max_tokens": self._max_tokens,
            "messages": api_messages,
        }
        if tools:
            kwargs["tools"] = [
                {"type": "function", "function": t} for t in tools
            ]

        response = await self._client.chat.completions.create(**kwargs)
        choice = response.choices[0]

        tool_calls: list[ToolCall] = []
        if choice.message.tool_calls:
            import json
            for tc in choice.message.tool_calls:
                tool_calls.append(ToolCall(
                    id=tc.id,
                    name=tc.function.name,
                    arguments=json.loads(tc.function.arguments),
                ))

        finish_map = {
            "stop": FinishReason.STOP,
            "tool_calls": FinishReason.TOOL_CALLS,
            "length": FinishReason.LENGTH,
            "content_filter": FinishReason.CONTENT_FILTER,
        }

        return LLMResponse(
            content=choice.message.content or "",
            tool_calls=tool_calls,
            finish_reason=finish_map.get(choice.finish_reason, FinishReason.STOP),
            usage=TokenUsage(
                prompt_tokens=response.usage.prompt_tokens,
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


async def main():
    # 1. 配置
    config = AgentCoreConfig(
        max_iterations=15,
        max_token_budget=50_000,
        timeout_seconds=30.0,
        retry_config=RetryConfig(max_retries=3),
    )

    # 2. 选择 LLM 提供者
    llm = ClaudeLLMProvider(
        model="claude-sonnet-4-20250514",
        system_prompt="你是一个有帮助的 AI 助手，善于分析和解决问题。",
    )

    # 3. 实现工具执行器
    class SimpleToolExecutor:
        async def execute(
            self, name: str, arguments: dict[str, Any]
        ) -> ToolResult:
            start = time.time()
            match name:
                case "search":
                    output = f"搜索结果: 找到关于 '{arguments.get('query')}' 的信息"
                case "calculator":
                    expr = arguments.get("expression", "0")
                    output = f"计算结果: {eval(expr)}"  # 示例用，生产环境需沙箱
                case _:
                    output = f"未知工具: {name}"
            return ToolResult(
                call_id=str(uuid.uuid4()),
                output=output,
                duration_ms=(time.time() - start) * 1000,
            )

    # 4. 简单的上下文引擎和安全守卫
    class SimpleContextEngine:
        def assemble_context(self, goal: str) -> list[Message]:
            return [Message(role=MessageRole.USER, content=goal)]

        def compress_if_needed(self, messages: list[Message]) -> list[Message]:
            if len(messages) > 20:
                return messages[:2] + messages[-10:]
            return messages

    class SimpleSecurityGuard:
        def validate_tool_call(self, call: ToolCall) -> SecurityCheckResult:
            blocked = {"rm", "shutdown", "format"}
            if call.name in blocked:
                return SecurityCheckResult(allowed=False, reason="危险操作")
            return SecurityCheckResult(allowed=True)

        def sanitize_output(self, content: str) -> str:
            return content

    # 5. 创建 Agent 并运行
    agent = AgentLoop(
        config=config,
        llm_provider=llm,
        tool_executor=SimpleToolExecutor(),
        context_engine=SimpleContextEngine(),
        security_guard=SimpleSecurityGuard(),
    )

    result = await agent.run("帮我计算 (15 + 27) * 3 的结果")

    print(f"答案: {result.answer}")
    print(f"步骤数: {len(result.steps)}")
    print(f"Token 消耗: {result.token_tracker.total_tokens}")


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
from __future__ import annotations

import uuid
import time
from dataclasses import dataclass, field
from typing import Any, Literal, Union
from enum import Enum


# ─── Agent 阶段 ────────────────────────────────────────

class AgentPhase(str, Enum):
    """Agent 生命周期阶段"""
    IDLE = "idle"
    THINKING = "thinking"
    ACTING = "acting"
    WAITING = "waiting"
    ERROR = "error"
    STUCK = "stuck"
    DONE = "done"


# 合法的阶段转换
VALID_TRANSITIONS: dict[AgentPhase, set[AgentPhase]] = {
    AgentPhase.IDLE:     {AgentPhase.THINKING},
    AgentPhase.THINKING: {AgentPhase.ACTING, AgentPhase.DONE, AgentPhase.ERROR, AgentPhase.STUCK},
    AgentPhase.ACTING:   {AgentPhase.THINKING, AgentPhase.WAITING, AgentPhase.ERROR},
    AgentPhase.WAITING:  {AgentPhase.THINKING, AgentPhase.ACTING},
    AgentPhase.ERROR:    {AgentPhase.THINKING, AgentPhase.IDLE},
    AgentPhase.STUCK:    {AgentPhase.THINKING, AgentPhase.IDLE},
    AgentPhase.DONE:     {AgentPhase.IDLE},
}


def assert_transition(from_phase: AgentPhase, to_phase: AgentPhase) -> None:
    """验证阶段转换是否合法"""
    valid = VALID_TRANSITIONS.get(from_phase, set())
    if to_phase not in valid:
        raise InvalidTransitionError(
            f"非法状态转换: {from_phase.value} → {to_phase.value}，"
            f"允许的目标: {[p.value for p in valid]}"
        )


class InvalidTransitionError(Exception):
    """非法状态转换异常"""
    pass


# ─── 性能指标 ──────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class PerformanceMetrics:
    """性能指标（不可变）"""
    total_tokens_used: int = 0
    total_tool_calls: int = 0
    total_duration_ms: float = 0.0
    llm_latency_ms: tuple[float, ...] = ()
    tool_latency_ms: tuple[float, ...] = ()
    avg_tokens_per_step: float = 0.0


# ─── 不可变消息和工具调用 ─────────────────────────────────

@dataclass(frozen=True, slots=True)
class StateMessage:
    """状态中的消息记录"""
    role: str
    content: str
    timestamp: float
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class StateToolCall:
    """状态中的工具调用记录"""
    id: str
    name: str
    input: dict[str, Any]
    started_at: float
    output: Any = None
    completed_at: float | None = None
    duration_ms: float | None = None
    error: str | None = None


# ─── Agent 状态 ────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class AgentState:
    """
    Agent 不可变状态

    对应 TypeScript 版本的 AgentState interface。
    frozen=True 保证所有字段不可修改，等价于 TypeScript 的 readonly。
    更新状态需要创建新实例（使用 dataclasses.replace）。
    """
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    phase: AgentPhase = AgentPhase.IDLE
    messages: tuple[StateMessage, ...] = ()
    tool_calls: tuple[StateToolCall, ...] = ()
    current_step: int = 0
    max_steps: int = 20
    error: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    version: int = 0
    metrics: PerformanceMetrics = field(default_factory=PerformanceMetrics)
    parent_checkpoint_id: str | None = None


def create_initial_state(max_steps: int = 20) -> AgentState:
    """创建初始状态"""
    now = time.time()
    return AgentState(
        created_at=now,
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

TypeScript:  type AgentEvent = { type: 'TASK_STARTED'; task: string } | ...
Python:      type AgentEvent = TaskStarted | LLMCallStart | ...
"""
from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class TaskStarted:
    """任务启动事件"""
    task: str
    timestamp: float = field(default_factory=time.time)


@dataclass(frozen=True, slots=True)
class LLMCallStart:
    """LLM 调用开始"""
    prompt: str
    timestamp: float = field(default_factory=time.time)


@dataclass(frozen=True, slots=True)
class LLMCallEnd:
    """LLM 调用完成"""
    response: str
    tokens_used: int
    latency_ms: float
    timestamp: float = field(default_factory=time.time)


@dataclass(frozen=True, slots=True)
class LLMCallError:
    """LLM 调用出错"""
    error: str
    timestamp: float = field(default_factory=time.time)


@dataclass(frozen=True, slots=True)
class ToolCallStart:
    """工具调用开始"""
    tool_name: str
    input: dict[str, Any]
    call_id: str
    timestamp: float = field(default_factory=time.time)


@dataclass(frozen=True, slots=True)
class ToolCallEnd:
    """工具调用完成"""
    call_id: str
    output: Any
    duration_ms: float
    timestamp: float = field(default_factory=time.time)


@dataclass(frozen=True, slots=True)
class ToolCallError:
    """工具调用出错"""
    call_id: str
    error: str
    timestamp: float = field(default_factory=time.time)


@dataclass(frozen=True, slots=True)
class HumanFeedback:
    """人类反馈"""
    feedback: str
    approved: bool
    timestamp: float = field(default_factory=time.time)


@dataclass(frozen=True, slots=True)
class StepCompleted:
    """步骤完成"""
    timestamp: float = field(default_factory=time.time)


@dataclass(frozen=True, slots=True)
class TaskCompleted:
    """任务完成"""
    summary: str
    timestamp: float = field(default_factory=time.time)


@dataclass(frozen=True, slots=True)
class ErrorOccurred:
    """错误发生"""
    error: str
    recoverable: bool
    timestamp: float = field(default_factory=time.time)


@dataclass(frozen=True, slots=True)
class StateReset:
    """状态重置"""
    timestamp: float = field(default_factory=time.time)


# Python 3.12 类型别名 (PEP 695)
type AgentEvent = (
    TaskStarted | LLMCallStart | LLMCallEnd | LLMCallError
    | ToolCallStart | ToolCallEnd | ToolCallError
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


def create_event(event_class: type, **kwargs) -> AgentEvent:
    """
    事件创建工厂函数

    自动注入 timestamp 字段。
    对应 TypeScript 版本的 createEvent 函数。

    用法:
        event = create_event(TaskStarted, task="分析数据")
        event = create_event(LLMCallEnd, response="...", tokens_used=150, latency_ms=320)
    """
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
"""
from dataclasses import replace


def agent_reducer(state: AgentState, event: AgentEvent) -> AgentState:
    """
    Agent 核心 Reducer

    纯函数实现，对应 TypeScript 版本的 agentReducer。
    使用 dataclasses.replace() 实现不可变更新。
    使用 match/case 实现穷尽性模式匹配。
    """
    # 公共字段更新
    base_updates = {
        "updated_at": event.timestamp,
        "version": state.version + 1,
    }

    match event:
        # ─── 1. 任务启动 ────────────────────────────────
        case TaskStarted(task=task, timestamp=ts):
            assert_transition(state.phase, AgentPhase.THINKING)
            new_msg = StateMessage(role="user", content=task, timestamp=ts)
            return replace(
                state,
                **base_updates,
                phase=AgentPhase.THINKING,
                messages=(*state.messages, new_msg),
                current_step=0,
            )

        # ─── 2. LLM 调用开始 ───────────────────────────
        case LLMCallStart(prompt=prompt, timestamp=_):
            return replace(
                state,
                **base_updates,
                phase=AgentPhase.THINKING,
                metadata={
                    **state.metadata,
                    "last_prompt_length": len(prompt),
                    "llm_call_pending": True,
                },
            )

        # ─── 3. LLM 调用完成 ───────────────────────────
        case LLMCallEnd(
            response=response,
            tokens_used=tokens,
            latency_ms=latency,
            timestamp=ts,
        ):
            new_total = state.metrics.total_tokens_used + tokens
            avg = (
                new_total / state.current_step
                if state.current_step > 0
                else float(tokens)
            )
            new_metrics = replace(
                state.metrics,
                total_tokens_used=new_total,
                llm_latency_ms=(*state.metrics.llm_latency_ms, latency),
                avg_tokens_per_step=avg,
            )
            new_msg = StateMessage(
                role="assistant", content=response, timestamp=ts
            )
            return replace(
                state,
                **base_updates,
                phase=AgentPhase.ACTING,
                messages=(*state.messages, new_msg),
                metadata={**state.metadata, "llm_call_pending": False},
                metrics=new_metrics,
            )

        # ─── 4. LLM 调用出错 ───────────────────────────
        case LLMCallError(error=error):
            return replace(
                state,
                **base_updates,
                phase=AgentPhase.ERROR,
                error=f"LLM Error: {error}",
                metadata={**state.metadata, "llm_call_pending": False},
            )

        # ─── 5. 工具调用开始 ───────────────────────────
        case ToolCallStart(
            tool_name=name, input=inp, call_id=cid, timestamp=ts
        ):
            new_tool_call = StateToolCall(
                id=cid, name=name, input=inp, started_at=ts
            )
            new_metrics = replace(
                state.metrics,
                total_tool_calls=state.metrics.total_tool_calls + 1,
            )
            return replace(
                state,
                **base_updates,
                phase=AgentPhase.ACTING,
                tool_calls=(*state.tool_calls, new_tool_call),
                metrics=new_metrics,
            )

        # ─── 6. 工具调用完成 ───────────────────────────
        case ToolCallEnd(
            call_id=cid, output=output, duration_ms=dur, timestamp=ts
        ):
            updated_calls = tuple(
                replace(tc, output=output, completed_at=ts, duration_ms=dur)
                if tc.id == cid else tc
                for tc in state.tool_calls
            )
            new_msg = StateMessage(
                role="tool",
                content=str(output),
                timestamp=ts,
                metadata={"call_id": cid},
            )
            new_metrics = replace(
                state.metrics,
                tool_latency_ms=(*state.metrics.tool_latency_ms, dur),
            )
            return replace(
                state,
                **base_updates,
                phase=AgentPhase.THINKING,
                tool_calls=updated_calls,
                messages=(*state.messages, new_msg),
                metrics=new_metrics,
            )

        # ─── 7. 工具调用出错 ───────────────────────────
        case ToolCallError(call_id=cid, error=error, timestamp=ts):
            updated_calls = tuple(
                replace(tc, error=error, completed_at=ts)
                if tc.id == cid else tc
                for tc in state.tool_calls
            )
            new_msg = StateMessage(
                role="tool",
                content=f"Error: {error}",
                timestamp=ts,
                metadata={"call_id": cid, "is_error": True},
            )
            return replace(
                state,
                **base_updates,
                phase=AgentPhase.THINKING,
                tool_calls=updated_calls,
                messages=(*state.messages, new_msg),
            )

        # ─── 8. 人类反馈 ───────────────────────────────
        case HumanFeedback(feedback=fb, approved=approved, timestamp=ts):
            next_phase = (
                AgentPhase.ACTING if approved else AgentPhase.THINKING
            )
            new_msg = StateMessage(
                role="user",
                content=f"[Human Feedback] {fb}",
                timestamp=ts,
                metadata={"approved": approved},
            )
            return replace(
                state,
                **base_updates,
                phase=next_phase,
                messages=(*state.messages, new_msg),
            )

        # ─── 9. 步骤完成 ───────────────────────────────
        case StepCompleted(timestamp=ts):
            next_step = state.current_step + 1
            is_stuck = next_step >= state.max_steps
            return replace(
                state,
                **base_updates,
                phase=AgentPhase.STUCK if is_stuck else AgentPhase.THINKING,
                current_step=next_step,
                metrics=replace(
                    state.metrics,
                    total_duration_ms=ts - state.created_at,
                ),
            )

        # ─── 10. 任务完成 ──────────────────────────────
        case TaskCompleted(summary=summary, timestamp=ts):
            new_msg = StateMessage(
                role="assistant",
                content=summary,
                timestamp=ts,
                metadata={"is_summary": True},
            )
            return replace(
                state,
                **base_updates,
                phase=AgentPhase.DONE,
                messages=(*state.messages, new_msg),
                metrics=replace(
                    state.metrics,
                    total_duration_ms=ts - state.created_at,
                ),
            )

        # ─── 11. 错误发生 ──────────────────────────────
        case ErrorOccurred(error=error, recoverable=recoverable):
            return replace(
                state,
                **base_updates,
                phase=(
                    AgentPhase.THINKING if recoverable
                    else AgentPhase.ERROR
                ),
                error=error,
            )

        # ─── 12. 状态重置 ──────────────────────────────
        case StateReset():
            return create_initial_state(state.max_steps)

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

对应 TypeScript 版本的 createSelector 函数
"""
from functools import lru_cache
from typing import Callable


class Selector[TResult]:
    """
    带记忆化的 Selector

    当依赖的状态片段未变化时，返回缓存结果。
    使用 Python 3.12 泛型语法。
    """

    def __init__(
        self,
        deps_extractor: Callable[[AgentState], tuple],
        compute: Callable[..., TResult],
    ):
        self._deps_extractor = deps_extractor
        self._compute = compute
        self._last_deps: tuple | None = None
        self._cached_result: TResult | None = None

    def __call__(self, state: AgentState) -> TResult:
        deps = self._deps_extractor(state)
        if deps != self._last_deps:
            self._last_deps = deps
            self._cached_result = self._compute(*deps)
        return self._cached_result  # type: ignore


def create_selector[TResult](
    deps_extractor: Callable[[AgentState], tuple],
    compute: Callable[..., TResult],
) -> Selector[TResult]:
    """
    创建带记忆化的 Selector

    用法:
        get_recent_tools = create_selector(
            deps_extractor=lambda s: (s.tool_calls, s.current_step),
            compute=lambda calls, step: [c for c in calls if c.started_at > step - 5],
        )
        recent = get_recent_tools(state)
    """
    return Selector(deps_extractor, compute)


# ===== 预定义 Selector =====

get_total_tokens = create_selector(
    deps_extractor=lambda s: (s.metrics.total_tokens_used,),
    compute=lambda tokens: tokens,
)

get_active_tool_calls = create_selector(
    deps_extractor=lambda s: (s.tool_calls,),
    compute=lambda calls: [c for c in calls if c.completed_at is None],
)

get_recent_messages = create_selector(
    deps_extractor=lambda s: (s.messages, s.current_step),
    compute=lambda msgs, step: msgs[-10:] if len(msgs) > 10 else msgs,
)

get_error_rate = create_selector(
    deps_extractor=lambda s: (s.tool_calls,),
    compute=lambda calls: (
        sum(1 for c in calls if c.error is not None) / len(calls)
        if calls else 0.0
    ),
)

get_avg_llm_latency = create_selector(
    deps_extractor=lambda s: (s.metrics.llm_latency_ms,),
    compute=lambda latencies: (
        sum(latencies) / len(latencies) if latencies else 0.0
    ),
)
```

### G.2.6 Middleware 模式 -- 用装饰器拦截事件

```python
"""
State Management -- Middleware 模式
使用装饰器和高阶函数实现中间件链

对应 TypeScript 版本的 applyMiddleware 函数
"""
from typing import Callable
import json
import logging

logger = logging.getLogger(__name__)

# 类型别名
type Reducer = Callable[[AgentState, AgentEvent], AgentState]
type Middleware = Callable[[Reducer], Reducer]


def logging_middleware(next_reducer: Reducer) -> Reducer:
    """日志中间件 —— 记录每个事件和状态变更"""
    def reducer(state: AgentState, event: AgentEvent) -> AgentState:
        event_name = type(event).__name__
        logger.info(
            f"[Event] {event_name} | "
            f"phase: {state.phase.value} | "
            f"version: {state.version}"
        )
        new_state = next_reducer(state, event)
        logger.info(
            f"[State] phase: {state.phase.value} → {new_state.phase.value} | "
            f"version: {new_state.version}"
        )
        return new_state
    return reducer


def validation_middleware(next_reducer: Reducer) -> Reducer:
    """校验中间件 —— 在 Reducer 执行前校验事件合法性"""
    def reducer(state: AgentState, event: AgentEvent) -> AgentState:
        # 校验：非 idle 状态下不允许 TaskStarted
        if isinstance(event, TaskStarted) and state.phase != AgentPhase.IDLE:
            raise ValueError(
                f"不能在 {state.phase.value} 阶段启动新任务"
            )
        # 校验：done 状态下只允许 StateReset
        if state.phase == AgentPhase.DONE and not isinstance(event, StateReset):
            raise ValueError(
                f"任务已完成，只能重置状态，不能处理 {type(event).__name__}"
            )
        return next_reducer(state, event)
    return reducer


def metrics_middleware(next_reducer: Reducer) -> Reducer:
    """指标中间件 —— 统计事件处理耗时"""
    def reducer(state: AgentState, event: AgentEvent) -> AgentState:
        start = time.time()
        new_state = next_reducer(state, event)
        elapsed_ms = (time.time() - start) * 1000
        if elapsed_ms > 10:
            logger.warning(
                f"[Perf] Reducer 处理 {type(event).__name__} 耗时 {elapsed_ms:.1f}ms"
            )
        return new_state
    return reducer


def apply_middleware(
    base_reducer: Reducer,
    *middlewares: Middleware,
) -> Reducer:
    """
    组合多个中间件到 Reducer

    中间件按从外到内的顺序包装：
    apply_middleware(reducer, logging, validation, metrics)
    执行顺序：logging → validation → metrics → reducer

    对应 TypeScript 版本的 applyMiddleware 函数
    """
    result = base_reducer
    for middleware in reversed(middlewares):
        result = middleware(result)
    return result


# 使用示例
enhanced_reducer = apply_middleware(
    agent_reducer,
    logging_middleware,
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


class EventStore:
    """事件存储 —— 保存完整事件历史"""

    def __init__(self):
        self._events: list[AgentEvent] = []
        self._snapshots: dict[int, AgentState] = {}
        self._snapshot_interval: int = 10

    def append(self, event: AgentEvent) -> None:
        self._events.append(event)

    def snapshot(self, version: int, state: AgentState) -> None:
        self._snapshots[version] = state

    @property
    def events(self) -> list[AgentEvent]:
        return list(self._events)

    def get_nearest_snapshot(
        self, target_version: int
    ) -> tuple[int, AgentState] | None:
        """找到目标版本之前最近的快照"""
        candidates = [
            (v, s) for v, s in self._snapshots.items()
            if v <= target_version
        ]
        if not candidates:
            return None
        return max(candidates, key=lambda x: x[0])


class TimeTravelDebugger:
    """
    时间旅行调试器

    支持状态回放、前进、后退和分支
    对应 TypeScript 版本的 TimeTravelDebugger
    """

    def __init__(
        self,
        reducer: Reducer,
        initial_state: AgentState | None = None,
    ):
        self._reducer = reducer
        self._store = EventStore()
        self._initial_state = initial_state or create_initial_state()
        self._current_state = self._initial_state
        self._current_version = 0

    @property
    def state(self) -> AgentState:
        return self._current_state

    def dispatch(self, event: AgentEvent) -> AgentState:
        """分发事件并更新状态"""
        self._store.append(event)
        self._current_state = self._reducer(self._current_state, event)
        self._current_version += 1

        # 定期创建快照
        if self._current_version % 10 == 0:
            self._store.snapshot(self._current_version, self._current_state)

        return self._current_state

    def replay_to(self, target_version: int) -> AgentState:
        """
        回放到指定版本

        从最近的快照开始重放事件，避免从头回放
        """
        if target_version < 0 or target_version > len(self._store.events):
            raise ValueError(f"版本 {target_version} 超出范围")

        # 尝试从快照恢复
        snapshot = self._store.get_nearest_snapshot(target_version)
        if snapshot:
            start_version, state = snapshot
        else:
            start_version, state = 0, self._initial_state

        # 从快照开始重放事件
        for event in self._store.events[start_version:target_version]:
            state = self._reducer(state, event)

        self._current_state = state
        self._current_version = target_version
        return state

    def diff(self, version_a: int, version_b: int) -> dict[str, Any]:
        """比较两个版本之间的状态差异"""
        state_a = self.replay_to(version_a)
        state_b = self.replay_to(version_b)

        diff: dict[str, Any] = {}
        for field_name in AgentState.__dataclass_fields__:
            val_a = getattr(state_a, field_name)
            val_b = getattr(state_b, field_name)
            if val_a != val_b:
                diff[field_name] = {"before": val_a, "after": val_b}

        return diff

    def branch(self) -> TimeTravelDebugger:
        """创建当前状态的分支"""
        new_debugger = TimeTravelDebugger(
            reducer=self._reducer,
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
from __future__ import annotations

import time
import hashlib
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable
from enum import Enum


@dataclass(frozen=True, slots=True)
class MemoryLayerStats:
    """记忆层统计信息"""
    entry_count: int = 0
    token_usage: int = 0
    hit_rate: float = 0.0
    avg_retrieval_latency_ms: float = 0.0


@runtime_checkable
class MemoryLayer[T](Protocol):
    """
    记忆层协议

    对应 TypeScript 的 MemoryLayer<T> 接口。
    每层必须实现存储、检索、淘汰和统计四个核心操作。
    """

    @property
    def name(self) -> str: ...

    @property
    def capacity(self) -> int: ...

    async def store(self, entry: T) -> None: ...

    async def retrieve(self, query: str, limit: int = 5) -> list[T]: ...

    async def evict(self) -> int: ...

    def stats(self) -> MemoryLayerStats: ...
```

### G.3.2 Token 预算规划器

```python
"""
Memory Architecture -- Token 预算规划器
对应 TypeScript 的 TokenBudgetPlanner 类
"""
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class TokenBudgetConfig:
    """Token 预算配置"""
    total_context_window: int = 128_000
    system_prompt_reserved: int = 2_000
    user_message_reserved: int = 4_000
    output_reserved: int = 4_096
    layer_weights: LayerWeights = field(default_factory=lambda: LayerWeights())


@dataclass(frozen=True, slots=True)
class LayerWeights:
    """各记忆层权重"""
    working: float = 0.35
    conversation: float = 0.30
    task: float = 0.20
    long_term: float = 0.15

    @property
    def total(self) -> float:
        return self.working + self.conversation + self.task + self.long_term


class TokenBudgetPlanner:
    """
    Token 预算规划器

    根据当前上下文动态计算各层记忆可用的 Token 额度。
    支持动态再平衡 —— 将低使用率层的多余配额分配给高需求层。
    """

    def __init__(self, config: TokenBudgetConfig):
        self._config = config
        self._actual_usage: dict[str, int] = {
            "working": 0,
            "conversation": 0,
            "task": 0,
            "long_term": 0,
        }

    def compute_budgets(self) -> dict[str, int]:
        """
        计算各层的 Token 配额

        可用 Token = 总窗口 - 系统预留 - 用户消息 - 输出预留
        """
        available = (
            self._config.total_context_window
            - self._config.system_prompt_reserved
            - self._config.user_message_reserved
            - self._config.output_reserved
        )

        if available <= 0:
            raise ValueError(
                f"Token 预算不足: 可用={available}, "
                f"总窗口={self._config.total_context_window}"
            )

        weights = self._config.layer_weights
        total_weight = weights.total

        return {
            "working": int(available * weights.working / total_weight),
            "conversation": int(available * weights.conversation / total_weight),
            "task": int(available * weights.task / total_weight),
            "long_term": int(available * weights.long_term / total_weight),
        }

    def rebalance(self) -> dict[str, int]:
        """
        动态再平衡

        当某层使用率低于 50% 时，回收 70% 的多余配额
        分配给使用率超过 90% 的高需求层
        """
        base_budgets = self.compute_budgets()
        result = dict(base_budgets)

        surplus = 0
        deficit_layers: list[str] = []

        for layer, budget in base_budgets.items():
            used = self._actual_usage.get(layer, 0)
            if used < budget * 0.5:
                reclaimable = int((budget - used) * 0.7)
                surplus += reclaimable
                result[layer] = budget - reclaimable
            elif used >= budget * 0.9:
                deficit_layers.append(layer)

        if deficit_layers and surplus > 0:
            bonus = surplus // len(deficit_layers)
            for layer in deficit_layers:
                result[layer] = result.get(layer, 0) + bonus

        return result

    def update_usage(self, layer: str, token_count: int) -> None:
        """更新某层的实际使用量"""
        self._actual_usage[layer] = token_count

    def get_utilization(self) -> dict[str, float]:
        """获取各层利用率"""
        budgets = self.compute_budgets()
        return {
            layer: (
                self._actual_usage.get(layer, 0) / budget
                if budget > 0 else 0.0
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
"""
import heapq


class MemoryPriority(int, Enum):
    """记忆优先级"""
    CRITICAL = 0    # 最高优先级（数值越小越优先）
    HIGH = 1
    MEDIUM = 2
    LOW = 3
    BACKGROUND = 4


@dataclass(slots=True)
class WorkingMemoryEntry:
    """工作记忆条目"""
    id: str
    content: str
    priority: MemoryPriority
    token_count: int
    source: str          # 来源层（conversation / task / long_term）
    created_at: float = field(default_factory=time.time)
    access_count: int = 0
    last_accessed: float = field(default_factory=time.time)

    def __lt__(self, other: WorkingMemoryEntry) -> bool:
        """用于 heapq 的比较 —— 低优先级 + 旧条目排前面（先被淘汰）"""
        if self.priority != other.priority:
            return self.priority.value > other.priority.value
        return self.last_accessed < other.last_accessed


class PriorityWorkingMemory:
    """
    基于优先级的工作记忆

    使用 heapq 实现的优先级队列，当 Token 超预算时自动淘汰
    低优先级和低频访问的条目。
    """

    def __init__(self, token_budget: int):
        self._budget = token_budget
        self._entries: dict[str, WorkingMemoryEntry] = {}
        self._current_tokens: int = 0
        self._total_retrievals: int = 0
        self._successful_retrievals: int = 0

    @property
    def name(self) -> str:
        return "working_memory"

    @property
    def capacity(self) -> int:
        return self._budget

    async def store(self, entry: WorkingMemoryEntry) -> None:
        """
        存储条目到工作记忆

        如果超预算，自动淘汰低优先级条目腾出空间
        """
        # 如果已存在，先移除旧版本
        if entry.id in self._entries:
            old = self._entries[entry.id]
            self._current_tokens -= old.token_count

        # 淘汰直到有足够空间
        while (
            self._current_tokens + entry.token_count > self._budget
            and self._entries
        ):
            await self._evict_one()

        self._entries[entry.id] = entry
        self._current_tokens += entry.token_count

    async def retrieve(self, query: str, limit: int = 5) -> list[WorkingMemoryEntry]:
        """
        检索相关条目

        简单实现：按优先级排序返回。
        生产环境建议结合向量相似度。
        """
        self._total_retrievals += 1
        query_lower = query.lower()

        scored: list[tuple[float, WorkingMemoryEntry]] = []
        for entry in self._entries.values():
            # 简单文本匹配 + 优先级加权
            text_score = (
                1.0 if query_lower in entry.content.lower() else 0.0
            )
            priority_score = 1.0 - (entry.priority.value / 4.0)
            total_score = text_score * 0.6 + priority_score * 0.4

            if total_score > 0:
                scored.append((total_score, entry))

        scored.sort(key=lambda x: x[0], reverse=True)
        results = [entry for _, entry in scored[:limit]]

        # 更新访问计数
        for entry in results:
            entry.access_count += 1
            entry.last_accessed = time.time()

        if results:
            self._successful_retrievals += 1

        return results

    async def evict(self) -> int:
        """淘汰所有低优先级且长时间未访问的条目"""
        evicted = 0
        cutoff = time.time() - 300  # 5 分钟未访问

        to_remove = [
            eid for eid, entry in self._entries.items()
            if entry.priority.value >= MemoryPriority.LOW.value
            and entry.last_accessed < cutoff
        ]
        for eid in to_remove:
            entry = self._entries.pop(eid)
            self._current_tokens -= entry.token_count
            evicted += 1

        return evicted

    async def _evict_one(self) -> None:
        """淘汰优先级最低的单个条目"""
        if not self._entries:
            return
        # 找到优先级最低（数值最大）且最旧的条目
        victim = max(
            self._entries.values(),
            key=lambda e: (e.priority.value, -e.last_accessed),
        )
        self._entries.pop(victim.id)
        self._current_tokens -= victim.token_count

    def stats(self) -> MemoryLayerStats:
        return MemoryLayerStats(
            entry_count=len(self._entries),
            token_usage=self._current_tokens,
            hit_rate=(
                self._successful_retrievals / self._total_retrievals
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
"""
from collections import deque


@dataclass(slots=True)
class ConversationMessage:
    """对话消息"""
    role: str
    content: str
    timestamp: float
    token_count: int
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class ConversationSummary:
    """对话摘要"""
    content: str
    original_count: int
    token_count: int
    created_at: float


class SmartWindowConversationMemory:
    """
    智能滑动窗口对话记忆

    特点：
    - 使用 deque 实现 O(1) 的头尾操作
    - 当消息数超过窗口大小时，旧消息被压缩为摘要
    - 摘要存储在独立列表中，可被检索
    """

    def __init__(
        self,
        window_size: int = 20,
        token_budget: int = 8_000,
        summarizer: Callable[[list[ConversationMessage]], str] | None = None,
    ):
        self._window: deque[ConversationMessage] = deque(maxlen=window_size)
        self._summaries: list[ConversationSummary] = []
        self._token_budget = token_budget
        self._current_tokens = 0
        self._summarizer = summarizer or self._default_summarizer

    @property
    def name(self) -> str:
        return "conversation_memory"

    @property
    def capacity(self) -> int:
        return self._token_budget

    async def store(self, entry: ConversationMessage) -> None:
        """存储新消息，必要时触发压缩"""
        # 如果 deque 已满，溢出的旧消息需要压缩
        if len(self._window) == self._window.maxlen:
            overflow = self._window[0]  # 即将被挤出的消息
            await self._compress_messages([overflow])

        self._window.append(entry)
        self._current_tokens += entry.token_count

        # 检查 Token 预算
        while self._current_tokens > self._token_budget and len(self._window) > 2:
            oldest = self._window.popleft()
            self._current_tokens -= oldest.token_count
            await self._compress_messages([oldest])

    async def retrieve(
        self, query: str, limit: int = 10
    ) -> list[ConversationMessage]:
        """检索最近的对话消息"""
        messages = list(self._window)
        return messages[-limit:]

    async def get_context_window(self) -> list[ConversationMessage | ConversationSummary]:
        """
        获取完整的上下文窗口

        返回：摘要（如果有） + 当前窗口内的消息
        """
        result: list[ConversationMessage | ConversationSummary] = []
        if self._summaries:
            result.extend(self._summaries[-3:])  # 最近 3 个摘要
        result.extend(self._window)
        return result

    async def evict(self) -> int:
        """清除过期摘要"""
        cutoff = time.time() - 3600  # 1 小时前的摘要
        old_count = len(self._summaries)
        self._summaries = [
            s for s in self._summaries if s.created_at > cutoff
        ]
        return old_count - len(self._summaries)

    async def _compress_messages(
        self, messages: list[ConversationMessage]
    ) -> None:
        """将消息压缩为摘要"""
        if not messages:
            return
        summary_text = self._summarizer(messages)
        summary = ConversationSummary(
            content=summary_text,
            original_count=len(messages),
            token_count=len(summary_text) // 4,  # 粗估
            created_at=time.time(),
        )
        self._summaries.append(summary)

    @staticmethod
    def _default_summarizer(messages: list[ConversationMessage]) -> str:
        """默认摘要器（简单拼接，生产环境应使用 LLM）"""
        parts = [f"[{m.role}] {m.content[:100]}" for m in messages]
        return f"对话摘要（{len(messages)} 条消息）：\n" + "\n".join(parts)

    def stats(self) -> MemoryLayerStats:
        return MemoryLayerStats(
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
"""
from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class LongTermMemoryEntry:
    """长期记忆条目"""
    id: str
    content: str
    embedding: list[float] | None = None
    importance: float = 0.5
    access_count: int = 0
    created_at: float = field(default_factory=time.time)
    last_accessed: float = field(default_factory=time.time)
    metadata: dict[str, Any] = field(default_factory=dict)
    tags: list[str] = field(default_factory=list)


class ChromaLongTermMemory:
    """
    基于 ChromaDB 的长期记忆

    使用向量相似度进行语义检索，支持元数据过滤。
    ChromaDB 是嵌入式向量数据库，无需独立部署服务。

    依赖：pip install chromadb
    """

    def __init__(
        self,
        collection_name: str = "agent_long_term_memory",
        persist_directory: str | None = None,
        max_entries: int = 10_000,
    ):
        import chromadb

        if persist_directory:
            self._client = chromadb.PersistentClient(
                path=persist_directory
            )
        else:
            self._client = chromadb.Client()

        self._collection = self._client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"},
        )
        self._max_entries = max_entries
        self._total_retrievals = 0
        self._successful_retrievals = 0

    @property
    def name(self) -> str:
        return "long_term_memory"

    @property
    def capacity(self) -> int:
        return self._max_entries

    async def store(self, entry: LongTermMemoryEntry) -> None:
        """存储记忆到向量数据库"""
        metadata = {
            "importance": entry.importance,
            "access_count": entry.access_count,
            "created_at": entry.created_at,
            **{k: str(v) for k, v in entry.metadata.items()},
        }
        if entry.tags:
            metadata["tags"] = ",".join(entry.tags)

        kwargs: dict[str, Any] = {
            "ids": [entry.id],
            "documents": [entry.content],
            "metadatas": [metadata],
        }
        if entry.embedding:
            kwargs["embeddings"] = [entry.embedding]

        self._collection.upsert(**kwargs)

    async def retrieve(
        self,
        query: str,
        limit: int = 5,
        importance_threshold: float = 0.0,
    ) -> list[LongTermMemoryEntry]:
        """语义检索相关记忆"""
        self._total_retrievals += 1

        where_filter = None
        if importance_threshold > 0:
            where_filter = {
                "importance": {"$gte": importance_threshold}
            }

        results = self._collection.query(
            query_texts=[query],
            n_results=limit,
            where=where_filter,
        )

        if not results["ids"] or not results["ids"][0]:
            return []

        self._successful_retrievals += 1
        entries: list[LongTermMemoryEntry] = []

        for i, doc_id in enumerate(results["ids"][0]):
            meta = results["metadatas"][0][i] if results["metadatas"] else {}
            content = results["documents"][0][i] if results["documents"] else ""

            entry = LongTermMemoryEntry(
                id=doc_id,
                content=content,
                importance=float(meta.get("importance", 0.5)),
                access_count=int(meta.get("access_count", 0)) + 1,
                created_at=float(meta.get("created_at", 0)),
                last_accessed=time.time(),
                tags=meta.get("tags", "").split(",") if meta.get("tags") else [],
            )
            entries.append(entry)

        return entries

    async def evict(self) -> int:
        """淘汰低重要性且长时间未访问的记忆"""
        count = self._collection.count()
        if count <= self._max_entries:
            return 0

        # 查询低重要性的旧条目
        cutoff = time.time() - 86400 * 30  # 30 天未访问
        results = self._collection.get(
            where={"importance": {"$lt": 0.3}},
            limit=count - self._max_entries,
        )

        if results["ids"]:
            self._collection.delete(ids=results["ids"])
            return len(results["ids"])
        return 0

    def stats(self) -> MemoryLayerStats:
        return MemoryLayerStats(
            entry_count=self._collection.count(),
            hit_rate=(
                self._successful_retrievals / self._total_retrievals
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


class UnifiedMemoryManager:
    """
    统一记忆管理器

    协调四层记忆（Working / Conversation / Task / Long-term）的
    存储、检索和 Token 预算分配。

    职责：
    1. 根据 Token 预算为各层分配配额
    2. 在推理前从各层检索相关记忆注入工作记忆
    3. 在推理后将重要信息写入长期记忆
    """

    def __init__(
        self,
        working: PriorityWorkingMemory,
        conversation: SmartWindowConversationMemory,
        long_term: ChromaLongTermMemory,
        budget_planner: TokenBudgetPlanner,
    ):
        self._working = working
        self._conversation = conversation
        self._long_term = long_term
        self._planner = budget_planner

    async def prepare_context(self, query: str) -> list[WorkingMemoryEntry]:
        """
        为新一轮推理准备上下文

        从对话记忆和长期记忆检索相关内容，注入工作记忆
        """
        # 获取当前预算分配
        budgets = self._planner.rebalance()

        # 从对话记忆检索最近消息
        recent_msgs = await self._conversation.retrieve(query, limit=5)
        for msg in recent_msgs:
            entry = WorkingMemoryEntry(
                id=hashlib.md5(msg.content.encode()).hexdigest(),
                content=msg.content,
                priority=MemoryPriority.HIGH,
                token_count=msg.token_count,
                source="conversation",
            )
            await self._working.store(entry)

        # 从长期记忆检索相关知识
        long_term_entries = await self._long_term.retrieve(
            query, limit=3, importance_threshold=0.3
        )
        for lt_entry in long_term_entries:
            entry = WorkingMemoryEntry(
                id=lt_entry.id,
                content=lt_entry.content,
                priority=MemoryPriority.MEDIUM,
                token_count=len(lt_entry.content) // 4,
                source="long_term",
            )
            await self._working.store(entry)

        # 更新预算使用量
        self._planner.update_usage(
            "working", self._working.stats().token_usage
        )

        # 返回工作记忆中的所有条目
        return await self._working.retrieve(query, limit=20)

    async def consolidate(
        self,
        new_messages: list[ConversationMessage],
        importance_threshold: float = 0.5,
    ) -> None:
        """
        记忆巩固

        将对话中的重要信息提取并存入长期记忆。
        生产环境中应使用 LLM 提取关键知识。
        """
        for msg in new_messages:
            # 简单的重要性评估（生产环境用 LLM）
            importance = self._estimate_importance(msg.content)
            if importance >= importance_threshold:
                entry = LongTermMemoryEntry(
                    id=hashlib.md5(
                        msg.content.encode()
                    ).hexdigest(),
                    content=msg.content,
                    importance=importance,
                    metadata={"source": "conversation"},
                )
                await self._long_term.store(entry)

    @staticmethod
    def _estimate_importance(content: str) -> float:
        """
        简单的重要性评估

        生产环境建议使用 LLM 打分或训练专用分类器。
        """
        high_value_indicators = [
            "结论", "发现", "决定", "重要", "关键", "注意",
            "总结", "确认", "需要", "必须", "建议",
        ]
        score = 0.3  # 基础分
        content_lower = content.lower()
        for indicator in high_value_indicators:
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
from __future__ import annotations

import uuid
import time
import logging
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class DocumentMetadata:
    """文档元数据"""
    source: str = ""
    title: str = ""
    author: str = ""
    created_at: float = field(default_factory=time.time)
    language: str = "zh"
    tags: list[str] = field(default_factory=list)
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class Document:
    """原始文档"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    content: str = ""
    metadata: DocumentMetadata = field(default_factory=DocumentMetadata)


@dataclass(slots=True)
class ChunkMetadata:
    """分块元数据"""
    document_metadata: DocumentMetadata = field(default_factory=DocumentMetadata)
    chunk_index: int = 0
    total_chunks: int = 0
    start_char: int = 0
    end_char: int = 0
    has_code: bool = False
    has_table: bool = False
    heading_hierarchy: list[str] = field(default_factory=list)


@dataclass(slots=True)
class Chunk:
    """文档分块"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    content: str = ""
    embedding: list[float] | None = None
    metadata: ChunkMetadata = field(default_factory=ChunkMetadata)
    token_count: int = 0


@dataclass(frozen=True, slots=True)
class RetrievalResult:
    """检索结果"""
    chunk: Chunk
    score: float
    retrieval_method: str = "vector"


@dataclass(slots=True)
class StageMetrics:
    """Pipeline 阶段指标"""
    stage_name: str
    duration_ms: float
    input_count: int
    output_count: int
    error_count: int = 0


@dataclass(frozen=True, slots=True)
class RAGContext:
    """RAG 查询上下文（最终返回给调用者的结构）"""
    query: str
    retrieval_results: list[RetrievalResult]
    reranked_results: list[RetrievalResult]
    generated_answer: str
    metrics: list[StageMetrics]
    trace_id: str
```

### G.4.2 协议定义

```python
"""
RAG Pipeline -- 协议定义
"""


@runtime_checkable
class EmbeddingService(Protocol):
    """Embedding 服务协议"""
    async def embed(self, text: str) -> list[float]: ...
    async def embed_batch(self, texts: list[str]) -> list[list[float]]: ...


@runtime_checkable
class VectorStore(Protocol):
    """向量存储协议"""
    async def upsert(self, chunks: list[Chunk]) -> None: ...
    async def search(
        self,
        embedding: list[float],
        top_k: int = 10,
        filter: dict[str, Any] | None = None,
    ) -> list[RetrievalResult]: ...


@runtime_checkable
class Chunker(Protocol):
    """分块器协议"""
    async def chunk(self, document: Document) -> list[Chunk]: ...


@runtime_checkable
class Reranker(Protocol):
    """重排序器协议"""
    async def rerank(
        self, query: str, results: list[RetrievalResult]
    ) -> list[RetrievalResult]: ...


@runtime_checkable
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
from typing import Callable, Awaitable, TypeVar

T = TypeVar("T")


class PipelineObserver:
    """
    Pipeline 观测器

    追踪每个阶段的执行时间、输入/输出数量和错误
    """

    def __init__(self, log_level: str = "info"):
        self._metrics: list[StageMetrics] = []
        self._log_level = log_level

    def reset(self) -> None:
        self._metrics = []

    async def track_stage[T](
        self,
        stage_name: str,
        fn: Callable[[], Awaitable[T]],
    ) -> T:
        """
        追踪一个 Pipeline 阶段

        自动记录执行时间和结果数量
        """
        start = time.time()
        error_count = 0

        try:
            result = await fn()
        except Exception as e:
            error_count = 1
            elapsed_ms = (time.time() - start) * 1000
            self._metrics.append(StageMetrics(
                stage_name=stage_name,
                duration_ms=elapsed_ms,
                input_count=0,
                output_count=0,
                error_count=1,
            ))
            raise

        elapsed_ms = (time.time() - start) * 1000
        output_count = len(result) if isinstance(result, (list, tuple)) else 1

        metric = StageMetrics(
            stage_name=stage_name,
            duration_ms=elapsed_ms,
            input_count=0,
            output_count=output_count,
            error_count=error_count,
        )
        self._metrics.append(metric)

        logger.info(
            f"[RAG:{stage_name}] 耗时 {elapsed_ms:.1f}ms, "
            f"输出 {output_count} 条"
        )
        return result

    def get_metrics(self) -> list[StageMetrics]:
        return list(self._metrics)
```

### G.4.4 RAG Pipeline 核心实现

```python
"""
RAG Pipeline -- 核心 Pipeline 类
对应 TypeScript 的 RAGPipeline 类
"""


class RAGPipeline:
    """
    RAG Pipeline 核心实现

    包含离线索引和在线查询两条路径：
    - 离线索引：文档 → 分块 → Embedding → 向量存储
    - 在线查询：查询 → Embedding → 检索 → 重排序 → 生成
    """

    def __init__(
        self,
        embedding_service: EmbeddingService,
        vector_store: VectorStore,
        chunker: Chunker,
        llm_client: LLMClient,
        reranker: Reranker | None = None,
        log_level: str = "info",
    ):
        self._embedding = embedding_service
        self._vector_store = vector_store
        self._chunker = chunker
        self._llm = llm_client
        self._reranker = reranker
        self._observer = PipelineObserver(log_level)

    # ──── 离线索引 Pipeline ─────────────────────────────

    async def index_documents(
        self, documents: list[Document]
    ) -> dict[str, Any]:
        """
        索引一批文档

        阶段 1: 分块 → 阶段 2: 批量 Embedding → 阶段 3: 存储
        """
        self._observer.reset()

        # 阶段 1: 文档分块
        all_chunks: list[Chunk] = await self._observer.track_stage(
            "chunking",
            self._chunk_all(documents),
        )

        if not all_chunks:
            raise ValueError("所有文档分块均失败，无法继续索引")

        # 阶段 2: 批量 Embedding
        embedded_chunks: list[Chunk] = await self._observer.track_stage(
            "embedding",
            self._embed_all(all_chunks),
        )

        # 阶段 3: 存储到向量库
        await self._observer.track_stage(
            "indexing",
            self._store_all(embedded_chunks),
        )

        return {
            "total_chunks": len(embedded_chunks),
            "metrics": self._observer.get_metrics(),
        }

    async def _chunk_all(
        self, documents: list[Document]
    ) -> Callable[[], Awaitable[list[Chunk]]]:
        """分块所有文档（返回可调用对象供 track_stage 使用）"""
        async def _do() -> list[Chunk]:
            chunks: list[Chunk] = []
            for doc in documents:
                try:
                    doc_chunks = await self._chunker.chunk(doc)
                    chunks.extend(doc_chunks)
                except Exception as e:
                    logger.error(f"文档 {doc.id} 分块失败: {e}")
            return chunks
        return _do

    async def _embed_all(
        self, chunks: list[Chunk]
    ) -> Callable[[], Awaitable[list[Chunk]]]:
        """批量 Embedding"""
        async def _do() -> list[Chunk]:
            batch_size = 100
            results: list[Chunk] = []
            for i in range(0, len(chunks), batch_size):
                batch = chunks[i:i + batch_size]
                texts = [c.content for c in batch]
                try:
                    embeddings = await self._embedding.embed_batch(texts)
                    for chunk, emb in zip(batch, embeddings):
                        chunk.embedding = emb
                    results.extend(batch)
                except Exception as e:
                    logger.error(f"Embedding 批次 {i}~{i+batch_size} 失败: {e}")
            return results
        return _do

    async def _store_all(
        self, chunks: list[Chunk]
    ) -> Callable[[], Awaitable[list[Chunk]]]:
        """存储到向量库"""
        async def _do() -> list[Chunk]:
            await self._vector_store.upsert(chunks)
            return chunks
        return _do

    # ──── 在线查询 Pipeline ─────────────────────────────

    async def query(
        self,
        user_query: str,
        top_k: int = 10,
        filter: dict[str, Any] | None = None,
        include_metrics: bool = False,
    ) -> RAGContext:
        """
        执行 RAG 查询

        阶段 1: 查询 Embedding → 阶段 2: 向量检索
        → 阶段 3: 重排序（可选） → 阶段 4: 生成回答
        """
        self._observer.reset()
        trace_id = str(uuid.uuid4())

        # 阶段 1: Query Embedding
        query_embedding: list[float] = await self._observer.track_stage(
            "query_embedding",
            lambda: self._embedding.embed(user_query),
        )

        # 阶段 2: 向量检索
        retrieval_results: list[RetrievalResult] = await self._observer.track_stage(
            "retrieval",
            lambda: self._vector_store.search(query_embedding, top_k, filter),
        )

        if not retrieval_results:
            logger.warning("向量检索返回空结果，生成回答可能不准确")

        # 阶段 3: Reranking（可选）
        reranked_results: list[RetrievalResult] = await self._observer.track_stage(
            "reranking",
            lambda: (
                self._reranker.rerank(user_query, retrieval_results)
                if self._reranker and retrieval_results
                else asyncio.coroutine(lambda: retrieval_results)()
            ),
        )

        # 阶段 4: 构建上下文并生成回答
        context_str = self._build_context(reranked_results)
        generated_answer: str = await self._observer.track_stage(
            "generation",
            lambda: self._llm.generate(user_query, context_str),
        )

        return RAGContext(
            query=user_query,
            retrieval_results=retrieval_results,
            reranked_results=reranked_results,
            generated_answer=generated_answer,
            metrics=self._observer.get_metrics() if include_metrics else [],
            trace_id=trace_id,
        )

    def _build_context(self, results: list[RetrievalResult]) -> str:
        """将检索结果拼接为 LLM 上下文"""
        parts: list[str] = []
        for i, r in enumerate(results):
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


class FixedSizeChunker:
    """
    固定大小分块器

    按字符数分块，支持重叠（overlap）以避免语义断裂。
    """

    def __init__(
        self,
        chunk_size: int = 512,
        chunk_overlap: int = 50,
    ):
        if chunk_overlap >= chunk_size:
            raise ValueError("overlap 不能大于等于 chunk_size")
        self._chunk_size = chunk_size
        self._overlap = chunk_overlap

    async def chunk(self, document: Document) -> list[Chunk]:
        """将文档分割为固定大小的块"""
        text = document.content
        if not text.strip():
            return []

        chunks: list[Chunk] = []
        step = self._chunk_size - self._overlap
        positions = list(range(0, len(text), step))
        total = len(positions)

        for idx, start in enumerate(positions):
            end = min(start + self._chunk_size, len(text))
            chunk_text = text[start:end].strip()
            if not chunk_text:
                continue

            chunks.append(Chunk(
                content=chunk_text,
                token_count=len(chunk_text) // 4,  # 粗估
                metadata=ChunkMetadata(
                    document_metadata=document.metadata,
                    chunk_index=idx,
                    total_chunks=total,
                    start_char=start,
                    end_char=end,
                ),
            ))

        return chunks
```

### G.4.6 混合检索器（BM25 + 向量）

```python
"""
RAG Pipeline -- 混合检索器
结合 BM25 稀疏检索和向量稠密检索
对应 TypeScript 的 HybridRetriever 类
"""
import math
from collections import Counter


class BM25Retriever:
    """
    BM25 稀疏检索器

    经典 BM25 算法的纯 Python 实现，用于关键词精确匹配。
    适用于专有名词、代码片段等向量检索容易遗漏的场景。
    """

    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self._k1 = k1
        self._b = b
        self._documents: list[Chunk] = []
        self._doc_freqs: Counter[str] = Counter()
        self._doc_lengths: list[int] = []
        self._avg_dl: float = 0
        self._tokenized_docs: list[list[str]] = []

    def index(self, chunks: list[Chunk]) -> None:
        """建立 BM25 索引"""
        self._documents = chunks
        self._tokenized_docs = [
            self._tokenize(c.content) for c in chunks
        ]
        self._doc_lengths = [len(d) for d in self._tokenized_docs]
        self._avg_dl = (
            sum(self._doc_lengths) / len(self._doc_lengths)
            if self._doc_lengths else 0
        )

        # 计算文档频率
        self._doc_freqs = Counter()
        for tokens in self._tokenized_docs:
            unique_tokens = set(tokens)
            for token in unique_tokens:
                self._doc_freqs[token] += 1

    def search(self, query: str, top_k: int = 10) -> list[RetrievalResult]:
        """BM25 检索"""
        query_tokens = self._tokenize(query)
        n = len(self._documents)
        scores: list[tuple[float, int]] = []

        for idx, doc_tokens in enumerate(self._tokenized_docs):
            score = 0.0
            doc_len = self._doc_lengths[idx]
            tf_counter = Counter(doc_tokens)

            for qt in query_tokens:
                if qt not in tf_counter:
                    continue

                tf = tf_counter[qt]
                df = self._doc_freqs.get(qt, 0)

                # IDF
                idf = math.log(
                    (n - df + 0.5) / (df + 0.5) + 1.0
                )

                # BM25 TF 归一化
                numerator = tf * (self._k1 + 1)
                denominator = tf + self._k1 * (
                    1 - self._b + self._b * doc_len / self._avg_dl
                )
                score += idf * (numerator / denominator)

            if score > 0:
                scores.append((score, idx))

        scores.sort(key=lambda x: x[0], reverse=True)

        results: list[RetrievalResult] = []
        for score, idx in scores[:top_k]:
            results.append(RetrievalResult(
                chunk=self._documents[idx],
                score=score,
                retrieval_method="bm25",
            ))
        return results

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        """简单分词（生产环境建议使用 jieba 等分词器）"""
        import re
        # 中文按字切分 + 英文按词切分
        tokens: list[str] = []
        for char in text.lower():
            if '\u4e00' <= char <= '\u9fff':
                tokens.append(char)
            elif char.isalnum():
                if tokens and tokens[-1].isalnum():
                    tokens[-1] += char
                else:
                    tokens.append(char)
        return tokens


class HybridRetriever:
    """
    混合检索器

    结合 BM25 稀疏检索和向量稠密检索的结果，
    使用 Reciprocal Rank Fusion (RRF) 合并排序。
    """

    def __init__(
        self,
        vector_store: VectorStore,
        embedding_service: EmbeddingService,
        bm25: BM25Retriever,
        vector_weight: float = 0.6,
        bm25_weight: float = 0.4,
        rrf_k: int = 60,
    ):
        self._vector_store = vector_store
        self._embedding = embedding_service
        self._bm25 = bm25
        self._vector_weight = vector_weight
        self._bm25_weight = bm25_weight
        self._rrf_k = rrf_k

    async def search(
        self,
        query: str,
        top_k: int = 10,
        filter: dict[str, Any] | None = None,
    ) -> list[RetrievalResult]:
        """
        混合检索

        并行执行 BM25 和向量检索，使用 RRF 合并结果
        """
        # 并行执行两种检索
        query_embedding = await self._embedding.embed(query)

        vector_task = asyncio.create_task(
            self._vector_store.search(query_embedding, top_k * 2, filter)
        )
        bm25_results = self._bm25.search(query, top_k * 2)
        vector_results = await vector_task

        # Reciprocal Rank Fusion
        rrf_scores: dict[str, float] = {}
        chunk_map: dict[str, Chunk] = {}

        for rank, result in enumerate(vector_results):
            cid = result.chunk.id
            rrf_scores[cid] = rrf_scores.get(cid, 0) + (
                self._vector_weight / (self._rrf_k + rank + 1)
            )
            chunk_map[cid] = result.chunk

        for rank, result in enumerate(bm25_results):
            cid = result.chunk.id
            rrf_scores[cid] = rrf_scores.get(cid, 0) + (
                self._bm25_weight / (self._rrf_k + rank + 1)
            )
            chunk_map[cid] = result.chunk

        # 按 RRF 分数排序
        sorted_ids = sorted(
            rrf_scores.keys(),
            key=lambda cid: rrf_scores[cid],
            reverse=True,
        )

        results = [
            RetrievalResult(
                chunk=chunk_map[cid],
                score=rrf_scores[cid],
                retrieval_method="hybrid",
            )
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


class RAGPipelineBuilder:
    """
    RAG Pipeline 流畅构建器

    使用 Builder 模式链式配置 Pipeline 的各个组件，
    最终调用 build() 生成 RAGPipeline 实例。

    用法:
        pipeline = (
            RAGPipelineBuilder()
            .with_embedding(OpenAIEmbedding(model="text-embedding-3-small"))
            .with_vector_store(ChromaVectorStore("my_collection"))
            .with_chunker(FixedSizeChunker(chunk_size=512))
            .with_reranker(CrossEncoderReranker())
            .with_llm(ClaudeLLMClient())
            .build()
        )
    """

    def __init__(self):
        self._embedding: EmbeddingService | None = None
        self._vector_store: VectorStore | None = None
        self._chunker: Chunker | None = None
        self._reranker: Reranker | None = None
        self._llm: LLMClient | None = None
        self._log_level: str = "info"

    def with_embedding(self, service: EmbeddingService) -> RAGPipelineBuilder:
        self._embedding = service
        return self

    def with_vector_store(self, store: VectorStore) -> RAGPipelineBuilder:
        self._vector_store = store
        return self

    def with_chunker(self, chunker: Chunker) -> RAGPipelineBuilder:
        self._chunker = chunker
        return self

    def with_reranker(self, reranker: Reranker) -> RAGPipelineBuilder:
        self._reranker = reranker
        return self

    def with_llm(self, client: LLMClient) -> RAGPipelineBuilder:
        self._llm = client
        return self

    def with_log_level(self, level: str) -> RAGPipelineBuilder:
        self._log_level = level
        return self

    def build(self) -> RAGPipeline:
        """构建 RAGPipeline，验证必需组件"""
        missing: list[str] = []
        if not self._embedding:
            missing.append("embedding_service")
        if not self._vector_store:
            missing.append("vector_store")
        if not self._chunker:
            missing.append("chunker")
        if not self._llm:
            missing.append("llm_client")

        if missing:
            raise ValueError(
                f"缺少必需组件: {', '.join(missing)}。"
                f"请使用 with_*() 方法配置。"
            )

        return RAGPipeline(
            embedding_service=self._embedding,  # type: ignore
            vector_store=self._vector_store,     # type: ignore
            chunker=self._chunker,               # type: ignore
            llm_client=self._llm,                # type: ignore
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
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import Any, Literal
from enum import Enum


class SkillCategory(str, Enum):
    """技能分类"""
    GENERAL = "general"
    CODING = "coding"
    DATA_ANALYSIS = "data-analysis"
    WRITING = "writing"
    SEARCH = "search"
    AUTOMATION = "automation"
    COMMUNICATION = "communication"


class GuardrailLevel(str, Enum):
    """安全护栏级别"""
    MUST = "MUST"
    MUST_NOT = "MUST_NOT"
    SHOULD = "SHOULD"
    SHOULD_NOT = "SHOULD_NOT"
    MAY = "MAY"


@dataclass(frozen=True, slots=True)
class SkillMetadata:
    """技能元数据（来自 YAML front matter）"""
    name: str = "unnamed-skill"
    version: str = "0.1.0"
    author: str = "unknown"
    description: str = ""
    category: SkillCategory = SkillCategory.GENERAL
    tags: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class TriggerRule:
    """触发规则"""
    type: Literal["keyword", "regex", "semantic"]
    pattern: str
    confidence: float = 0.8


@dataclass(frozen=True, slots=True)
class TriggerDefinition:
    """触发定义"""
    rules: tuple[TriggerRule, ...] = ()
    priority: int = 0


@dataclass(frozen=True, slots=True)
class ParsedInstruction:
    """解析后的指令"""
    step: int
    content: str
    is_conditional: bool = False
    condition: str | None = None


@dataclass(frozen=True, slots=True)
class ToolDependency:
    """工具依赖"""
    name: str
    required: bool = True
    description: str = ""


@dataclass(frozen=True, slots=True)
class SkillExample:
    """技能示例"""
    user_input: str
    expected_behavior: str


@dataclass(frozen=True, slots=True)
class GuardrailRule:
    """安全护栏规则"""
    level: GuardrailLevel
    description: str


@dataclass(frozen=True, slots=True)
class SkillManifest:
    """
    技能清单 -- Skill 的完整结构化描述

    从 SKILL.md 文件解析而来，包含：
    - 元数据（名称、版本、作者）
    - 触发规则（何时激活该技能）
    - 执行指令（如何执行）
    - 上下文需求（需要哪些信息）
    - 工具依赖（需要哪些工具）
    - 示例（典型输入输出）
    - 安全护栏（约束条件）
    """
    metadata: SkillMetadata
    description: str
    triggers: TriggerDefinition
    instructions: tuple[ParsedInstruction, ...]
    context_requirements: tuple[str, ...]
    tool_dependencies: tuple[ToolDependency, ...]
    examples: tuple[SkillExample, ...]
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
import yaml


class SkillParseError(Exception):
    """技能解析错误"""
    def __init__(self, message: str, section: str = ""):
        self.section = section
        super().__init__(
            f"[SkillParser] {message}"
            + (f" (在 {section} 节)" if section else "")
        )


class SkillParser:
    """
    SKILL.md 解析器

    将 SKILL.md 文件解析为 SkillManifest 结构。

    解析流程：
    1. 提取 YAML front matter -> metadata
    2. 按 ## 标题分割 Markdown -> 各 section
    3. 解析每个 section 的内容 -> 结构化数据
    4. 验证必需字段
    """

    def parse(self, markdown: str) -> SkillManifest:
        """
        解析 SKILL.md 文件

        Args:
            markdown: SKILL.md 的完整文本

        Returns:
            SkillManifest 结构

        Raises:
            SkillParseError: 当必需字段缺失时
        """
        # 步骤 1：提取 YAML front matter
        metadata = self._extract_front_matter(markdown)

        # 步骤 2：按 ## 标题分割内容
        sections = self._split_sections(markdown)

        # 步骤 3：解析各 section
        description = (
            sections.get("Description")
            or sections.get("描述")
            or ""
        )
        triggers = self._parse_triggers(
            sections.get("Triggers")
            or sections.get("触发条件")
            or ""
        )
        instructions = self._parse_instructions(
            sections.get("Instructions")
            or sections.get("执行指令")
            or ""
        )
        context_requirements = self._parse_list(
            sections.get("Context Requirements")
            or sections.get("上下文需求")
            or ""
        )
        tool_dependencies = self._parse_tool_dependencies(
            sections.get("Tool Dependencies")
            or sections.get("工具依赖")
            or ""
        )
        examples = self._parse_examples(
            sections.get("Examples")
            or sections.get("示例")
            or ""
        )
        guardrails = self._parse_guardrails(
            sections.get("Guardrails")
            or sections.get("安全护栏")
            or ""
        )

        # 步骤 4：验证
        self._validate(metadata, triggers, instructions)

        return SkillManifest(
            metadata=metadata,
            description=description,
            triggers=triggers,
            instructions=tuple(instructions),
            context_requirements=tuple(context_requirements),
            tool_dependencies=tuple(tool_dependencies),
            examples=tuple(examples),
            guardrails=tuple(guardrails),
            raw_markdown=markdown,
        )

    def _extract_front_matter(self, markdown: str) -> SkillMetadata:
        """提取 YAML front matter"""
        match = re.match(r'^---\n(.*?)\n---', markdown, re.DOTALL)
        if not match:
            raise SkillParseError(
                "SKILL.md 必须包含 YAML front matter（以 --- 开头和结尾）"
            )

        try:
            data = yaml.safe_load(match.group(1)) or {}
        except yaml.YAMLError as e:
            raise SkillParseError(f"YAML 解析失败: {e}")

        tags_raw = data.get("tags", [])
        if isinstance(tags_raw, str):
            tags_raw = [t.strip() for t in tags_raw.split(",")]

        category_raw = data.get("category", "general")
        try:
            category = SkillCategory(category_raw)
        except ValueError:
            category = SkillCategory.GENERAL

        return SkillMetadata(
            name=data.get("name", "unnamed-skill"),
            version=data.get("version", "0.1.0"),
            author=data.get("author", "unknown"),
            description=data.get("description", ""),
            category=category,
            tags=tuple(tags_raw),
        )

    def _split_sections(self, markdown: str) -> dict[str, str]:
        """按 ## 标题分割 Markdown"""
        # 移除 front matter
        content = re.sub(r'^---\n.*?\n---\n', '', markdown, flags=re.DOTALL)

        sections: dict[str, str] = {}
        current_title: str | None = None
        current_lines: list[str] = []

        for line in content.split("\n"):
            heading_match = re.match(r'^##\s+(.+)$', line)
            if heading_match:
                if current_title is not None:
                    sections[current_title] = "\n".join(current_lines).strip()
                current_title = heading_match.group(1).strip()
                current_lines = []
            else:
                current_lines.append(line)

        if current_title is not None:
            sections[current_title] = "\n".join(current_lines).strip()

        return sections

    def _parse_triggers(self, content: str) -> TriggerDefinition:
        """解析触发条件"""
        if not content.strip():
            return TriggerDefinition()

        rules: list[TriggerRule] = []
        for line in content.split("\n"):
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            # 格式：- keyword: pattern (confidence: 0.9)
            kw_match = re.match(
                r'-\s*(keyword|regex|semantic):\s*(.+?)(?:\(confidence:\s*([\d.]+)\))?$',
                line,
            )
            if kw_match:
                rule_type = kw_match.group(1)
                pattern = kw_match.group(2).strip()
                confidence = float(kw_match.group(3) or "0.8")
                rules.append(TriggerRule(
                    type=rule_type,  # type: ignore
                    pattern=pattern,
                    confidence=confidence,
                ))

        return TriggerDefinition(rules=tuple(rules))

    def _parse_instructions(self, content: str) -> list[ParsedInstruction]:
        """解析执行指令"""
        instructions: list[ParsedInstruction] = []
        step = 0

        for line in content.split("\n"):
            line = line.strip()
            if not line:
                continue

            # 格式：1. 步骤内容 或 - 步骤内容
            step_match = re.match(r'(?:\d+\.\s*|-\s*)(.*)', line)
            if step_match:
                step += 1
                step_content = step_match.group(1).strip()

                # 检查是否有条件
                is_conditional = False
                condition = None
                cond_match = re.match(
                    r'\[如果\s*(.+?)\]\s*(.*)', step_content
                )
                if cond_match:
                    is_conditional = True
                    condition = cond_match.group(1)
                    step_content = cond_match.group(2)

                instructions.append(ParsedInstruction(
                    step=step,
                    content=step_content,
                    is_conditional=is_conditional,
                    condition=condition,
                ))

        return instructions

    def _parse_list(self, content: str) -> list[str]:
        """解析列表项"""
        items: list[str] = []
        for line in content.split("\n"):
            line = line.strip()
            match = re.match(r'[-*]\s+(.*)', line)
            if match:
                items.append(match.group(1).strip())
        return items

    def _parse_tool_dependencies(self, content: str) -> list[ToolDependency]:
        """解析工具依赖"""
        deps: list[ToolDependency] = []
        for line in content.split("\n"):
            line = line.strip()
            match = re.match(
                r'-\s*(\w+)(?:\s*\((.+?)\))?(?:\s*:\s*(.*))?', line
            )
            if match:
                name = match.group(1)
                modifier = match.group(2) or ""
                desc = match.group(3) or ""
                deps.append(ToolDependency(
                    name=name,
                    required="optional" not in modifier.lower(),
                    description=desc.strip(),
                ))
        return deps

    def _parse_examples(self, content: str) -> list[SkillExample]:
        """解析示例"""
        examples: list[SkillExample] = []
        current_input = ""
        current_output = ""
        mode = ""

        for line in content.split("\n"):
            stripped = line.strip()
            if stripped.lower().startswith("user:") or stripped.startswith("输入:"):
                if current_input and current_output:
                    examples.append(SkillExample(
                        user_input=current_input.strip(),
                        expected_behavior=current_output.strip(),
                    ))
                current_input = re.sub(r'^(user|输入):\s*', '', stripped, flags=re.I)
                current_output = ""
                mode = "input"
            elif stripped.lower().startswith("expected:") or stripped.startswith("预期:"):
                current_output = re.sub(r'^(expected|预期):\s*', '', stripped, flags=re.I)
                mode = "output"
            elif mode == "input":
                current_input += " " + stripped
            elif mode == "output":
                current_output += " " + stripped

        if current_input and current_output:
            examples.append(SkillExample(
                user_input=current_input.strip(),
                expected_behavior=current_output.strip(),
            ))

        return examples

    def _parse_guardrails(self, content: str) -> list[GuardrailRule]:
        """解析安全护栏"""
        rules: list[GuardrailRule] = []
        for line in content.split("\n"):
            line = line.strip()
            match = re.match(
                r'-\s*(MUST|MUST_NOT|SHOULD|SHOULD_NOT|MAY):\s*(.*)',
                line,
            )
            if match:
                level = GuardrailLevel(match.group(1))
                rules.append(GuardrailRule(
                    level=level,
                    description=match.group(2).strip(),
                ))
        return rules

    def _validate(
        self,
        metadata: SkillMetadata,
        triggers: TriggerDefinition,
        instructions: list[ParsedInstruction],
    ) -> None:
        """验证必需字段"""
        errors: list[str] = []
        if metadata.name == "unnamed-skill":
            errors.append("metadata.name 是必填字段")
        if not triggers.rules:
            errors.append("至少需要一条触发规则")
        if not instructions:
            errors.append("至少需要一条执行指令")
        if errors:
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
import math
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class SkillMatchScore:
    """匹配分数明细"""
    keyword: float = 0.0
    regex: float = 0.0
    semantic: float = 0.0
    context: float = 0.0


@dataclass(frozen=True, slots=True)
class SkillMatchResult:
    """匹配结果"""
    skill_name: str
    skill: SkillManifest
    total_score: float
    breakdown: SkillMatchScore


@dataclass(frozen=True, slots=True)
class MatchWeights:
    """各匹配策略权重"""
    keyword: float = 0.35
    regex: float = 0.25
    semantic: float = 0.30
    context: float = 0.10


class SkillMatcher:
    """
    技能匹配器

    综合关键词、正则、语义和上下文四种策略，
    对用户输入进行多维度匹配，返回排序后的候选技能列表。
    """

    def __init__(
        self,
        skills: list[SkillManifest],
        embedding_fn: Callable[[str], Awaitable[list[float]]] | None = None,
        weights: MatchWeights = MatchWeights(),
    ):
        self._skills = {s.metadata.name: s for s in skills}
        self._embedding_fn = embedding_fn
        self._weights = weights

    async def match(
        self,
        user_input: str,
        threshold: float = 0.3,
    ) -> list[SkillMatchResult]:
        """
        匹配用户输入，返回排序后的候选 Skill 列表

        综合四种策略的加权得分
        """
        candidates: dict[str, SkillMatchScore] = {}

        for name, skill in self._skills.items():
            kw_score = self._match_keyword(user_input, skill)
            rx_score = self._match_regex(user_input, skill)

            score = SkillMatchScore(keyword=kw_score, regex=rx_score)

            if kw_score > 0 or rx_score > 0:
                candidates[name] = score

        # 语义匹配（如果有 embedding 函数）
        if self._embedding_fn:
            semantic_scores = await self._match_semantic(user_input)
            for name, sem_score in semantic_scores.items():
                if name in candidates:
                    old = candidates[name]
                    candidates[name] = SkillMatchScore(
                        keyword=old.keyword,
                        regex=old.regex,
                        semantic=sem_score,
                        context=old.context,
                    )
                elif sem_score > 0.5:
                    candidates[name] = SkillMatchScore(semantic=sem_score)

        # 计算加权总分
        results: list[SkillMatchResult] = []
        for name, scores in candidates.items():
            total = (
                scores.keyword * self._weights.keyword
                + scores.regex * self._weights.regex
                + scores.semantic * self._weights.semantic
                + scores.context * self._weights.context
            )
            if total > threshold:
                results.append(SkillMatchResult(
                    skill_name=name,
                    skill=self._skills[name],
                    total_score=total,
                    breakdown=scores,
                ))

        results.sort(key=lambda r: r.total_score, reverse=True)
        return results

    def match_sync(
        self,
        user_input: str,
        threshold: float = 0.3,
    ) -> list[SkillMatchResult]:
        """
        快速同步匹配（仅关键词 + 正则）

        适用于低延迟场景，不需要 embedding 计算
        """
        results: list[SkillMatchResult] = []

        for name, skill in self._skills.items():
            kw = self._match_keyword(user_input, skill)
            rx = self._match_regex(user_input, skill)
            total = kw * 0.6 + rx * 0.4

            if total > threshold:
                results.append(SkillMatchResult(
                    skill_name=name,
                    skill=skill,
                    total_score=total,
                    breakdown=SkillMatchScore(keyword=kw, regex=rx),
                ))

        results.sort(key=lambda r: r.total_score, reverse=True)
        return results

    def _match_keyword(
        self, input_text: str, skill: SkillManifest
    ) -> float:
        """关键词匹配"""
        lower_input = input_text.lower()
        best_score = 0.0

        for rule in skill.triggers.rules:
            if rule.type != "keyword":
                continue
            keywords = [k.strip().lower() for k in rule.pattern.split("|")]
            for kw in keywords:
                if kw in lower_input:
                    coverage = len(kw) / len(lower_input)
                    score = min(1.0, rule.confidence * (0.5 + coverage * 0.5))
                    best_score = max(best_score, score)

        return best_score

    def _match_regex(
        self, input_text: str, skill: SkillManifest
    ) -> float:
        """正则匹配"""
        for rule in skill.triggers.rules:
            if rule.type != "regex":
                continue
            try:
                if re.search(rule.pattern, input_text, re.IGNORECASE):
                    return rule.confidence
            except re.error:
                pass
        return 0.0

    async def _match_semantic(
        self, input_text: str
    ) -> dict[str, float]:
        """语义匹配"""
        results: dict[str, float] = {}
        if not self._embedding_fn:
            return results

        input_emb = await self._embedding_fn(input_text)

        for name, skill in self._skills.items():
            skill_text = " ".join([
                skill.description,
                *(r.pattern for r in skill.triggers.rules if r.type == "semantic"),
            ])
            if not skill_text.strip():
                continue

            skill_emb = await self._embedding_fn(skill_text)
            similarity = self._cosine_similarity(input_emb, skill_emb)

            if similarity > 0.5:
                results[name] = similarity

        return results

    @staticmethod
    def _cosine_similarity(a: list[float], b: list[float]) -> float:
        """余弦相似度"""
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
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
import subprocess
import asyncio
import tempfile
import os
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class SkillExecutionResult:
    """技能执行结果"""
    success: bool
    stdout: str
    stderr: str
    exit_code: int
    duration_ms: float


class BashSkillRuntime:
    """
    Bash 技能运行时

    在受限环境中执行 Skill 的脚本，包含：
    - 超时控制
    - 工作目录隔离
    - 环境变量白名单
    - 输出大小限制
    """

    def __init__(
        self,
        timeout_seconds: float = 30.0,
        max_output_bytes: int = 1_000_000,
        working_dir: str | None = None,
        env_whitelist: set[str] | None = None,
    ):
        self._timeout = timeout_seconds
        self._max_output = max_output_bytes
        self._working_dir = working_dir or tempfile.mkdtemp(prefix="skill_")
        self._env_whitelist = env_whitelist or {
            "PATH", "HOME", "LANG", "LC_ALL", "TERM",
        }

    async def execute(
        self,
        script: str,
        env_vars: dict[str, str] | None = None,
    ) -> SkillExecutionResult:
        """
        执行 Bash 脚本

        使用 asyncio.create_subprocess_exec 实现非阻塞执行
        """
        start = time.time()

        # 构建安全的环境变量
        safe_env = {
            k: v for k, v in os.environ.items()
            if k in self._env_whitelist
        }
        if env_vars:
            safe_env.update(env_vars)

        # 写入临时脚本文件
        script_path = os.path.join(self._working_dir, "_skill_script.sh")
        with open(script_path, "w") as f:
            f.write("#!/bin/bash\nset -euo pipefail\n")
            f.write(script)
        os.chmod(script_path, 0o700)

        try:
            process = await asyncio.create_subprocess_exec(
                "/bin/bash", script_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self._working_dir,
                env=safe_env,
            )

            try:
                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    process.communicate(),
                    timeout=self._timeout,
                )
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
                return SkillExecutionResult(
                    success=False,
                    stdout="",
                    stderr=f"脚本执行超时（{self._timeout}s）",
                    exit_code=-1,
                    duration_ms=(time.time() - start) * 1000,
                )

            stdout = stdout_bytes[:self._max_output].decode(
                "utf-8", errors="replace"
            )
            stderr = stderr_bytes[:self._max_output].decode(
                "utf-8", errors="replace"
            )

            return SkillExecutionResult(
                success=process.returncode == 0,
                stdout=stdout,
                stderr=stderr,
                exit_code=process.returncode or 0,
                duration_ms=(time.time() - start) * 1000,
            )

        except Exception as e:
            return SkillExecutionResult(
                success=False,
                stdout="",
                stderr=f"执行异常: {e}",
                exit_code=-1,
                duration_ms=(time.time() - start) * 1000,
            )
        finally:
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
| **Event Sourcing** | `agentReducer(state, event)` | `agent_reducer(state, event)` |
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
| **Agent 框架** | `langchain`, `llamaindex` | 快速原型，但架构灵活性有限 |
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
