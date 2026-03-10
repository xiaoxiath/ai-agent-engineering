# 第二十二章：Agent Experience (AX) 设计

> "AX 是 UX 在 Agent 时代的演进。用户与 Agent 的交互体验决定了产品的成败。"

---

## 22.1 CLEAR 框架

Agent Experience 设计的五大原则：

| 原则 | 说明 |
|------|------|
| **C** - Controllable | 用户始终保持对 Agent 的控制权 |
| **L** - Legible | Agent 的思考和行动过程清晰可读 |
| **E** - Efficient | 减少不必要的确认和等待 |
| **A** - Adaptive | 根据用户偏好和场景自适应 |
| **R** - Recoverable | 错误可恢复，操作可撤销 |

---

## 22.2 对话控制

```typescript
class ConversationController {
  // 允许用户中断 Agent 的执行
  async handleInterrupt(agentTask: Promise<string>): Promise<string> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve('任务超时'), 120_000);

      agentTask.then(result => {
        clearTimeout(timeout);
        resolve(result);
      });

      // 监听用户中断信号
      process.on('SIGINT', () => {
        clearTimeout(timeout);
        resolve('用户中断');
      });
    });
  }

  // 确认高风险操作
  async confirmAction(action: {
    description: string;
    risk: 'low' | 'medium' | 'high';
  }): Promise<boolean> {
    if (action.risk === 'low') return true;
    // 展示确认对话框
    console.log(`⚠️ 确认操作: ${action.description}`);
    return true; // 简化
  }
}
```

---

## 22.3 进度追踪

```typescript
class ProgressTracker {
  private steps: Array<{
    name: string;
    status: 'pending' | 'running' | 'done' | 'error';
    startTime?: number;
    endTime?: number;
  }> = [];

  addStep(name: string): void {
    this.steps.push({ name, status: 'pending' });
  }

  startStep(name: string): void {
    const step = this.steps.find(s => s.name === name);
    if (step) {
      step.status = 'running';
      step.startTime = Date.now();
    }
  }

  completeStep(name: string): void {
    const step = this.steps.find(s => s.name === name);
    if (step) {
      step.status = 'done';
      step.endTime = Date.now();
    }
  }

  getProgressDisplay(): string {
    return this.steps.map(s => {
      const icon = s.status === 'done' ? '✅' : s.status === 'running' ? '🔄' : s.status === 'error' ? '❌' : '⏳';
      const time = s.startTime && s.endTime ? ` (${((s.endTime - s.startTime) / 1000).toFixed(1)}s)` : '';
      return `${icon} ${s.name}${time}`;
    }).join('\n');
  }
}
```

---

## 22.4 信任信号

```typescript
class TrustSignalManager {
  // 展示 Agent 的思考过程
  showThinking(thought: string): void {
    console.log(`💭 ${thought}`);
  }

  // 展示置信度
  showConfidence(score: number): string {
    if (score > 0.9) return '🟢 高置信度';
    if (score > 0.7) return '🟡 中等置信度';
    return '🔴 低置信度，建议验证';
  }

  // 展示信息来源
  showSources(sources: Array<{ title: string; url: string }>): string {
    return sources.map(s => `📄 [${s.title}](${s.url})`).join('\n');
  }
}
```

---

## 22.5 流式输出

```typescript
class StreamingRenderer {
  async *streamResponse(agentStream: AsyncIterable<string>): AsyncIterable<string> {
    let buffer = '';

    for await (const chunk of agentStream) {
      buffer += chunk;

      // 检测工具调用标记
      if (buffer.includes('[TOOL_CALL:')) {
        yield '\n🔧 正在调用工具...\n';
        buffer = '';
        continue;
      }

      // 逐字符输出
      yield chunk;
    }
  }
}
```

---

## 22.6 本章小结

1. **CLEAR 框架**：Controllable, Legible, Efficient, Adaptive, Recoverable
2. **进度追踪**让用户了解 Agent 的执行状态
3. **信任信号**通过展示思考过程和置信度建立信任
4. **流式输出**降低用户的等待焦虑
