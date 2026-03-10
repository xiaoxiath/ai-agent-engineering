# 第十四章：信任架构 — 最小权限与人机协作

> "信任不是二元的，而是需要动态评估和细粒度管理的连续谱。"

---

## 14.1 动态权限管理

```typescript
class DynamicPermissionManager {
  private permissions = new Map<string, PermissionPolicy>();

  getPolicy(agentId: string, context: ExecutionContext): PermissionPolicy {
    const base = this.permissions.get(agentId) ?? DEFAULT_POLICY;

    // 根据上下文动态调整
    return {
      ...base,
      // 高风险时段限制权限
      maxToolCallsPerMinute: context.isHighRisk
        ? Math.floor(base.maxToolCallsPerMinute / 2)
        : base.maxToolCallsPerMinute,
      // 异常检测触发降权
      allowedTools: context.anomalyDetected
        ? base.allowedTools.filter(t => !t.includes('write') && !t.includes('delete'))
        : base.allowedTools,
    };
  }
}

interface PermissionPolicy {
  allowedTools: string[];
  maxToolCallsPerMinute: number;
  requireApprovalFor: string[];
  autonomyLevel: 'restricted' | 'supervised' | 'autonomous';
}

interface ExecutionContext { isHighRisk: boolean; anomalyDetected: boolean; }
const DEFAULT_POLICY: PermissionPolicy = {
  allowedTools: [], maxToolCallsPerMinute: 10,
  requireApprovalFor: [], autonomyLevel: 'supervised',
};
```

---

## 14.2 Human-in-the-Loop (HITL)

```typescript
class ApprovalWorkflow {
  async requestApproval(request: {
    agentId: string;
    action: string;
    params: unknown;
    reason: string;
    urgency: 'low' | 'medium' | 'high';
  }): Promise<{ approved: boolean; comment?: string }> {
    // 根据紧急程度选择审批路径
    switch (request.urgency) {
      case 'high':
        // 实时推送到审批人
        return this.pushNotification(request);
      case 'medium':
        // 排队等待审批（超时自动拒绝）
        return this.queueForApproval(request, 300_000); // 5 分钟超时
      case 'low':
        // 批量审批
        return this.batchApproval(request);
    }
  }

  private async pushNotification(req: any): Promise<{ approved: boolean }> { return { approved: false }; }
  private async queueForApproval(req: any, timeout: number): Promise<{ approved: boolean }> { return { approved: false }; }
  private async batchApproval(req: any): Promise<{ approved: boolean }> { return { approved: false }; }
}
```

---

## 14.3 沙箱执行

```typescript
class SandboxExecutor {
  async execute(code: string, options: {
    timeout: number;
    memoryLimit: number;
    networkAccess: boolean;
    fileSystemAccess: 'none' | 'read' | 'readwrite';
  }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // 使用 Docker 容器执行
    const container = await this.createContainer({
      image: 'sandbox:latest',
      memoryLimit: options.memoryLimit,
      networkDisabled: !options.networkAccess,
      readonlyRootfs: options.fileSystemAccess === 'none',
    });

    try {
      return await Promise.race([
        container.exec(code),
        this.timeout(options.timeout),
      ]);
    } finally {
      await container.destroy();
    }
  }

  private async createContainer(opts: any): Promise<any> { return {}; }
  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms));
  }
}
```

---

## 14.4 审计日志

```typescript
class AuditLogger {
  async log(entry: {
    timestamp: number;
    agentId: string;
    action: string;
    input: unknown;
    output: unknown;
    approved: boolean;
    approver?: string;
  }): Promise<void> {
    // 写入不可变审计日志
    console.log(JSON.stringify(entry));
  }

  async query(filter: {
    agentId?: string;
    startTime?: number;
    endTime?: number;
    action?: string;
  }): Promise<any[]> {
    return [];
  }
}
```

---

## 14.5 信任分数

```typescript
class TrustScoreCalculator {
  calculate(agent: {
    successRate: number;
    errorRate: number;
    securityIncidents: number;
    uptimeHours: number;
  }): { score: number; level: 'untrusted' | 'limited' | 'trusted' | 'autonomous' } {
    let score = 50; // 基础分
    score += agent.successRate * 30;
    score -= agent.errorRate * 20;
    score -= agent.securityIncidents * 15;
    score += Math.min(agent.uptimeHours / 1000, 10);
    score = Math.max(0, Math.min(100, score));

    const level = score > 80 ? 'autonomous' : score > 60 ? 'trusted' : score > 40 ? 'limited' : 'untrusted';
    return { score, level };
  }
}
```

---

## 14.6 本章小结

1. **动态权限管理**根据上下文实时调整 Agent 权限
2. **HITL 审批**在关键操作前引入人工确认
3. **沙箱执行**隔离不受信任的代码执行
4. **审计日志**提供完整的操作追溯能力
5. **信任分数**量化 Agent 的可信度，支撑自动化决策
