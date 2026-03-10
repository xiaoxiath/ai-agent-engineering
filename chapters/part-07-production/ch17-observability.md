# 第十七章：可观测性 — 追踪、指标与日志

> "你无法改进你看不见的东西。可观测性是 Agent 生产化的眼睛。"

---

## 17.1 三大支柱

Agent 可观测性建立在三大支柱之上：

| 支柱 | 说明 | 工具 |
|------|------|------|
| **Traces** | 追踪请求的完整路径 | OpenTelemetry, LangSmith |
| **Metrics** | 量化系统健康状况 | Prometheus, Grafana |
| **Logs** | 记录详细事件信息 | 结构化日志 |

---

## 17.2 OpenTelemetry for AI Agents

```typescript
// GenAI 语义约定
const GEN_AI_ATTRIBUTES = {
  SYSTEM: 'gen_ai.system',
  MODEL: 'gen_ai.request.model',
  TEMPERATURE: 'gen_ai.request.temperature',
  MAX_TOKENS: 'gen_ai.request.max_tokens',
  INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
  FINISH_REASON: 'gen_ai.response.finish_reasons',
} as const;

class AgentTracer {
  private tracer: any; // OpenTelemetry Tracer

  async traceLLMCall<T>(
    model: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.tracer.startActiveSpan(`llm.${model}`, async (span: any) => {
      span.setAttribute(GEN_AI_ATTRIBUTES.MODEL, model);
      try {
        const result = await fn();
        span.setAttribute(GEN_AI_ATTRIBUTES.FINISH_REASON, 'stop');
        span.setStatus({ code: 0 });
        return result;
      } catch (error) {
        span.setStatus({ code: 2, message: String(error) });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async traceToolCall<T>(
    toolName: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.tracer.startActiveSpan(`tool.${toolName}`, async (span: any) => {
      span.setAttribute('tool.name', toolName);
      try {
        const result = await fn();
        span.setStatus({ code: 0 });
        return result;
      } catch (error) {
        span.setStatus({ code: 2, message: String(error) });
        throw error;
      } finally {
        span.end();
      }
    });
  }
}
```

---

## 17.3 Agent 指标

```typescript
class AgentMetrics {
  // 计数器
  taskCompleted = 0;
  taskFailed = 0;
  toolCallsTotal = 0;

  // 直方图
  taskDurations: number[] = [];
  tokenUsages: number[] = [];
  iterationsPerTask: number[] = [];

  // 仪表盘
  activeAgents = 0;
  queuedTasks = 0;

  recordTaskCompletion(duration: number, tokens: number, iterations: number, success: boolean): void {
    if (success) this.taskCompleted++; else this.taskFailed++;
    this.taskDurations.push(duration);
    this.tokenUsages.push(tokens);
    this.iterationsPerTask.push(iterations);
  }

  getSuccessRate(): number {
    const total = this.taskCompleted + this.taskFailed;
    return total > 0 ? this.taskCompleted / total : 0;
  }

  getP99Duration(): number {
    const sorted = [...this.taskDurations].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.99)] ?? 0;
  }
}
```

---

## 17.4 结构化日志

```typescript
class StructuredLogger {
  log(entry: {
    level: 'debug' | 'info' | 'warn' | 'error';
    agentId: string;
    event: string;
    data?: Record<string, unknown>;
    traceId?: string;
  }): void {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      ...entry,
    }));
  }
}
```

---

## 17.5 本章小结

1. **Traces** 追踪 Agent 的完整执行路径
2. **Metrics** 量化成功率、延迟、Token 消耗等关键指标
3. **Logs** 提供详细的事件级别信息
4. **OpenTelemetry GenAI 语义约定**提供标准化的 AI 可观测性
