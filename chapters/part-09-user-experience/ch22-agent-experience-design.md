# 第 22 章：Agent Experience（AX）设计

> **"用户不关心你的 Agent 多么智能——他们关心自己是否感觉到被理解、被赋能、被尊重。"**

在前面的章节中，我们讨论了 Agent 的架构（第 3 章）、信任与安全（第 14 章）以及生态系统与平台（第 21 章）。然而，一个架构精妙、安全可靠、生态完整的 Agent，如果在交互体验上让用户感到困惑、焦虑或失控，依然会遭遇用户流失。**Agent Experience（AX）** 是一个比传统 UX 更丰富、更复杂的设计领域——它不仅关注界面布局和视觉美感，还需要处理 **不确定性**、**异步长任务**、**多轮推理** 和 **可控自主性** 等全新挑战。

本章将系统性地介绍 AX 设计的核心原则、关键模式和工程实现。我们会从设计原则出发，逐步深入到渐进式信息披露、对话控制、进度透明度、信任信号、失败体验、多模态交互、流式输出、个性化和自适应等领域，并为每一个主题提供完整的 TypeScript 实现。

---

## 22.1 AX 设计原则

### 22.1.1 从 UX 到 AX：范式转移

传统 UX 设计建立在 **确定性** 基础上——用户点击按钮，系统返回结果，行为可预测、耗时可控。但 Agent 交互引入了根本性的不同：

| 维度 | 传统 UX | Agent Experience（AX） |
|------|---------|----------------------|
| **确定性** | 高：相同输入产生相同输出 | 低：LLM 输出具有随机性 |
| **响应时间** | 毫秒级，可预测 | 秒到分钟级，不可预测 |
| **交互模式** | 请求-响应，同步为主 | 多轮对话，异步长任务 |
| **控制感** | 用户完全控制流程 | Agent 拥有部分自主权 |
| **错误类型** | 明确的错误码和状态 | 模糊的幻觉、遗漏和偏差 |
| **个性化** | 基于配置和偏好设置 | 基于上下文和交互历史推断 |
| **信任建立** | 功能正确即可 | 需要持续的能力校准 |

这张对比表揭示了 AX 设计的核心挑战：我们需要在 **不确定性** 中创造 **确定感**，在 **自主行为** 中保持 **可控性**，在 **复杂推理** 中维持 **透明度**。

### 22.1.2 CLEAR 框架

经过对数十个 Agent 产品的研究和实践，我们提炼出 AX 设计的五大原则——**CLEAR** 框架：

| 原则 | 全称 | 含义 | 典型实践 |
|------|------|------|----------|
| **C** | Controllable（可控） | 用户始终拥有最终控制权 | 暂停/恢复/取消、审批节点、自主级别选择 |
| **L** | Legible（可读） | Agent 的行为和推理可被理解 | 思维链展示、步骤分解、决策解释 |
| **E** | Efficient（高效） | 最少操作达成目标 | 渐进式披露、智能默认值、批量操作 |
| **A** | Adaptive（自适应） | 根据用户和情境动态调整 | 专家/新手模式、个性化、情境感知 |
| **R** | Recoverable（可恢复） | 错误可撤销，失败可恢复 | 操作撤销、优雅降级、断点续传 |

CLEAR 框架与第 14 章的信任架构形成互补——信任架构关注 "Agent 是否值得信任"，而 CLEAR 框架关注 "用户是否感受到可信赖"。

### 22.1.3 AX 成熟度模型

类似于第 21 章讨论的平台成熟度，AX 也有清晰的演进阶段：

```typescript
// AX 成熟度等级定义
enum AXMaturityLevel {
  /** 第 1 级：基础响应 —— Agent 能完成任务并返回结果 */
  BasicResponse = 1,
  /** 第 2 级：透明交互 —— 用户能理解 Agent 在做什么以及为什么 */
  TransparentInteraction = 2,
  /** 第 3 级：自适应体验 —— 体验根据用户特征和情境动态调整 */
  AdaptiveExperience = 3,
  /** 第 4 级：协作智能 —— 用户和 Agent 形成高效的协作默契 */
  CollaborativeIntelligence = 4,
}

// 每个成熟度等级的详细描述和评估标准
interface MaturityLevelDescriptor {
  level: AXMaturityLevel;
  name: string;
  description: string;
  keyCapabilities: string[];
  metrics: Record<string, { target: number; unit: string }>;
  prerequisites: AXMaturityLevel[];
}

const AX_MATURITY_MODEL: MaturityLevelDescriptor[] = [
  {
    level: AXMaturityLevel.BasicResponse,
    name: "基础响应",
    description:
      "Agent 能正确理解请求、执行任务并返回结构化结果。" +
      "交互以请求-响应为主，错误处理覆盖常见场景。",
    keyCapabilities: [
      "自然语言请求解析",
      "任务执行与结果返回",
      "基本错误信息展示",
      "请求历史记录",
    ],
    metrics: {
      taskCompletionRate: { target: 0.8, unit: "ratio" },
      avgResponseTime: { target: 10, unit: "seconds" },
      errorRecoveryRate: { target: 0.5, unit: "ratio" },
    },
    prerequisites: [],
  },
  {
    level: AXMaturityLevel.TransparentInteraction,
    name: "透明交互",
    description:
      "用户能看到 Agent 的推理过程、执行步骤和决策依据。" +
      "支持进度追踪、中间结果查看和基本的流程控制。",
    keyCapabilities: [
      "推理过程可视化",
      "多步骤进度追踪",
      "中间结果实时展示",
      "暂停与取消操作",
      "置信度显示",
    ],
    metrics: {
      taskCompletionRate: { target: 0.85, unit: "ratio" },
      avgResponseTime: { target: 8, unit: "seconds" },
      userTrustScore: { target: 0.7, unit: "ratio" },
      transparencyScore: { target: 0.75, unit: "ratio" },
    },
    prerequisites: [AXMaturityLevel.BasicResponse],
  },
  {
    level: AXMaturityLevel.AdaptiveExperience,
    name: "自适应体验",
    description:
      "体验能根据用户的专业水平、使用习惯和当前情境动态调整。" +
      "包括渐进式披露、个性化界面和智能默认值。",
    keyCapabilities: [
      "用户专业度检测",
      "渐进式信息披露",
      "个性化交互模式",
      "情境感知的信息密度调整",
      "智能默认值推断",
      "A/B 实验框架",
    ],
    metrics: {
      taskCompletionRate: { target: 0.9, unit: "ratio" },
      userSatisfactionScore: { target: 0.8, unit: "ratio" },
      personalizationAccuracy: { target: 0.75, unit: "ratio" },
      adaptationLatency: { target: 2, unit: "seconds" },
    },
    prerequisites: [AXMaturityLevel.TransparentInteraction],
  },
  {
    level: AXMaturityLevel.CollaborativeIntelligence,
    name: "协作智能",
    description:
      "用户和 Agent 之间形成高效的协作关系。Agent 能主动提出建议、" +
      "预测用户意图、在适当时候主动介入或退让。",
    keyCapabilities: [
      "主动建议与意图预测",
      "协作模式自动切换",
      "长期记忆与偏好学习",
      "跨会话上下文保持",
      "多 Agent 协作体验编排",
      "信任关系动态校准",
    ],
    metrics: {
      taskCompletionRate: { target: 0.95, unit: "ratio" },
      userSatisfactionScore: { target: 0.9, unit: "ratio" },
      proactiveSuggestionAcceptRate: { target: 0.6, unit: "ratio" },
      collaborationEfficiency: { target: 0.85, unit: "ratio" },
    },
    prerequisites: [AXMaturityLevel.AdaptiveExperience],
  },
];
```

### 22.1.4 信任校准：AX 的核心挑战

第 14 章详细讨论了 Agent 信任架构的技术实现。在 AX 层面，信任校准体现为三种失调模式：

- **过度信任（Over-trust）**：用户盲目接受 Agent 输出，不进行验证。常见于 Agent 表现出过高置信度或权威感的场景。解决方案包括在关键决策点强制展示置信度、添加 "你确定要采用这个建议吗？" 等确认节点。
- **信任不足（Under-trust）**：用户不相信 Agent 的能力，过度干预或完全不使用自动化功能。常见于 Agent 早期出过错误、或交互体验不透明的场景。解决方案包括展示 Agent 的历史准确率、提供 "试一试" 的低风险体验入口。
- **校准信任（Calibrated trust）**：用户对 Agent 的信任程度与 Agent 的实际能力相匹配。这是 AX 设计的终极目标——让用户 "恰如其分" 地信任 Agent。

```typescript
// 信任校准的量化模型
interface TrustCalibrationMetrics {
  /** Agent 在该任务类型上的实际准确率 */
  actualAccuracy: number;
  /** 用户感知的 Agent 准确率（通过调查或行为推断） */
  perceivedAccuracy: number;
  /** 校准差距 = 感知 - 实际，正值表示过度信任 */
  calibrationGap: number;
  /** 用户对 Agent 输出的验证频率 */
  verificationRate: number;
  /** 用户接受 Agent 建议的比率 */
  acceptanceRate: number;
}

// 信任校准状态判定
type TrustCalibrationState = "over_trust" | "under_trust" | "calibrated";

function assessCalibrationState(
  metrics: TrustCalibrationMetrics
): TrustCalibrationState {
  const gap = metrics.calibrationGap;
  const threshold = 0.15; // 15% 以内视为校准

  if (gap > threshold) {
    return "over_trust";
  } else if (gap < -threshold) {
    return "under_trust";
  }
  return "calibrated";
}
```

### 22.1.5 AXDesignSystem 与 AXAuditor

下面实现两个核心基础类：`AXDesignSystem` 用于在开发时验证 AX 设计是否符合 CLEAR 原则；`AXAuditor` 用于在运行时持续审计交互体验质量。

```typescript
// CLEAR 原则的规则定义
interface CLEARRule {
  id: string;
  principle: "C" | "L" | "E" | "A" | "R";
  description: string;
  severity: "error" | "warning" | "info";
  validate: (context: AXValidationContext) => CLEARViolation | null;
}

interface CLEARViolation {
  ruleId: string;
  principle: string;
  severity: "error" | "warning" | "info";
  message: string;
  suggestion: string;
  component?: string;
}

// AX 验证上下文
interface AXValidationContext {
  /** 当前交互是否提供了取消或暂停机制 */
  hasCancelMechanism: boolean;
  /** 当前交互是否展示了 Agent 的推理过程 */
  showsReasoning: boolean;
  /** 完成当前任务所需的用户操作步数 */
  requiredUserActions: number;
  /** 是否根据用户特征进行了适配 */
  isAdaptive: boolean;
  /** 是否提供了撤销或回退机制 */
  hasUndoMechanism: boolean;
  /** 预计任务耗时（秒） */
  estimatedDuration: number;
  /** 是否展示了进度信息 */
  showsProgress: boolean;
  /** 是否展示了置信度信息 */
  showsConfidence: boolean;
  /** 错误场景是否有恢复建议 */
  hasRecoverySuggestions: boolean;
  /** 是否支持多模态输出 */
  supportsMultimodal: boolean;
}

/**
 * AXDesignSystem —— AX 设计系统
 *
 * 在开发阶段对 Agent 的交互设计进行 CLEAR 原则合规检查。
 * 参见第 3 章 Agent 架构总览中的分层模型，AX 位于最上层的体验层。
 */
class AXDesignSystem {
  private rules: CLEARRule[] = [];
  private violationHistory: CLEARViolation[][] = [];

  constructor() {
    this.registerDefaultRules();
  }

  /** 注册默认的 CLEAR 规则集 */
  private registerDefaultRules(): void {
    // ---- C: Controllable（可控）----
    this.rules.push({
      id: "C-001",
      principle: "C",
      description: "长时间任务必须提供取消机制",
      severity: "error",
      validate: (ctx) => {
        if (ctx.estimatedDuration > 10 && !ctx.hasCancelMechanism) {
          return {
            ruleId: "C-001",
            principle: "Controllable",
            severity: "error",
            message: `预计耗时 ${ctx.estimatedDuration}s 但未提供取消机制`,
            suggestion:
              "为超过 10 秒的任务添加取消按钮或 Ctrl+C 快捷键支持",
          };
        }
        return null;
      },
    });

    this.rules.push({
      id: "C-002",
      principle: "C",
      description: "自主操作前应获得用户确认",
      severity: "warning",
      validate: (ctx) => {
        if (ctx.estimatedDuration > 30 && !ctx.hasCancelMechanism) {
          return {
            ruleId: "C-002",
            principle: "Controllable",
            severity: "warning",
            message: "长时间自主操作缺少审批节点",
            suggestion:
              "在执行破坏性或不可逆操作前添加确认对话框",
          };
        }
        return null;
      },
    });

    // ---- L: Legible（可读）----
    this.rules.push({
      id: "L-001",
      principle: "L",
      description: "Agent 应展示推理过程",
      severity: "warning",
      validate: (ctx) => {
        if (!ctx.showsReasoning) {
          return {
            ruleId: "L-001",
            principle: "Legible",
            severity: "warning",
            message: "未展示 Agent 的推理过程",
            suggestion:
              "添加可展开的推理步骤面板，让用户理解 Agent 的决策依据",
          };
        }
        return null;
      },
    });

    this.rules.push({
      id: "L-002",
      principle: "L",
      description: "应展示置信度信息",
      severity: "info",
      validate: (ctx) => {
        if (!ctx.showsConfidence) {
          return {
            ruleId: "L-002",
            principle: "Legible",
            severity: "info",
            message: "未展示置信度信息",
            suggestion:
              "在 Agent 输出旁展示置信度指示器（如进度条、颜色编码等）",
          };
        }
        return null;
      },
    });

    // ---- E: Efficient（高效）----
    this.rules.push({
      id: "E-001",
      principle: "E",
      description: "完成任务的用户操作步数应尽量少",
      severity: "warning",
      validate: (ctx) => {
        if (ctx.requiredUserActions > 5) {
          return {
            ruleId: "E-001",
            principle: "Efficient",
            severity: "warning",
            message: `完成任务需要 ${ctx.requiredUserActions} 步用户操作`,
            suggestion:
              "考虑合并步骤、提供智能默认值或支持批量操作以减少操作次数",
          };
        }
        return null;
      },
    });

    // ---- A: Adaptive（自适应）----
    this.rules.push({
      id: "A-001",
      principle: "A",
      description: "交互应根据用户特征进行适配",
      severity: "info",
      validate: (ctx) => {
        if (!ctx.isAdaptive) {
          return {
            ruleId: "A-001",
            principle: "Adaptive",
            severity: "info",
            message: "交互未根据用户特征进行适配",
            suggestion:
              "基于用户的专业水平和使用频率调整信息密度和交互复杂度",
          };
        }
        return null;
      },
    });

    // ---- R: Recoverable（可恢复）----
    this.rules.push({
      id: "R-001",
      principle: "R",
      description: "应提供撤销机制",
      severity: "warning",
      validate: (ctx) => {
        if (!ctx.hasUndoMechanism) {
          return {
            ruleId: "R-001",
            principle: "Recoverable",
            severity: "warning",
            message: "未提供撤销机制",
            suggestion:
              "添加操作撤销功能，至少支持最近一步操作的回退",
          };
        }
        return null;
      },
    });

    this.rules.push({
      id: "R-002",
      principle: "R",
      description: "错误场景应提供恢复建议",
      severity: "error",
      validate: (ctx) => {
        if (!ctx.hasRecoverySuggestions) {
          return {
            ruleId: "R-002",
            principle: "Recoverable",
            severity: "error",
            message: "错误场景缺少恢复建议",
            suggestion:
              "为每种错误类型提供至少一个恢复操作建议",
          };
        }
        return null;
      },
    });
  }

  /** 添加自定义规则 */
  addRule(rule: CLEARRule): void {
    this.rules.push(rule);
  }

  /** 对给定上下文执行全部规则验证 */
  validate(context: AXValidationContext): CLEARViolation[] {
    const violations: CLEARViolation[] = [];
    for (const rule of this.rules) {
      const violation = rule.validate(context);
      if (violation !== null) {
        violations.push(violation);
      }
    }
    this.violationHistory.push(violations);
    return violations;
  }

  /** 获取指定原则的违规统计 */
  getViolationStats(): Record<string, number> {
    const stats: Record<string, number> = {
      C: 0,
      L: 0,
      E: 0,
      A: 0,
      R: 0,
    };
    const allViolations = this.violationHistory.flat();
    for (const v of allViolations) {
      const key = v.principle.charAt(0).toUpperCase();
      if (key in stats) {
        stats[key]++;
      }
    }
    return stats;
  }

  /** 生成 CLEAR 合规报告 */
  generateReport(): string {
    const stats = this.getViolationStats();
    const total = Object.values(stats).reduce((a, b) => a + b, 0);
    const lines: string[] = [
      "=== CLEAR Compliance Report ===",
      `Total validations: ${this.violationHistory.length}`,
      `Total violations: ${total}`,
      "",
    ];
    for (const [principle, count] of Object.entries(stats)) {
      const bar = "█".repeat(count) + "░".repeat(Math.max(0, 10 - count));
      lines.push(`  ${principle}: ${bar} (${count})`);
    }
    return lines.join("\n");
  }
}
```

接下来实现 `AXAuditor`——运行时体验质量审计器。它持续监控 Agent 交互的各项体验指标，并在发现体验质量下降时触发告警。

```typescript
// AX 审计事件类型
interface AXAuditEvent {
  timestamp: number;
  sessionId: string;
  eventType:
    | "response_delivered"
    | "user_action"
    | "error_occurred"
    | "task_completed"
    | "task_abandoned"
    | "undo_triggered"
    | "clarification_requested"
    | "confidence_displayed"
    | "progress_updated";
  payload: Record<string, unknown>;
}

// AX 质量指标快照
interface AXQualitySnapshot {
  /** 采样时间窗口的起止时间 */
  windowStart: number;
  windowEnd: number;
  /** 该窗口内的会话总数 */
  sessionCount: number;
  /** 任务完成率 */
  taskCompletionRate: number;
  /** 平均首次响应时间（毫秒） */
  avgFirstResponseMs: number;
  /** 用户主动放弃率 */
  abandonmentRate: number;
  /** 澄清请求率（每次会话平均澄清次数） */
  clarificationRate: number;
  /** 撤销操作率（每次会话平均撤销次数） */
  undoRate: number;
  /** 错误恢复成功率 */
  errorRecoveryRate: number;
  /** 置信度校准误差（ECE） */
  calibrationError: number;
}

// 审计告警定义
interface AXAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  metric: string;
  currentValue: number;
  threshold: number;
  message: string;
  suggestedAction: string;
  timestamp: number;
}

/**
 * AXAuditor —— 运行时体验质量审计器
 *
 * 持续收集 Agent 交互过程中的体验事件，聚合为质量指标，
 * 并在指标偏离阈值时生成告警。与第 14 章的信任度量系统
 * 形成互补：信任度量关注 Agent 行为的可靠性，AX 审计关注
 * 用户感受到的体验质量。
 */
class AXAuditor {
  private events: AXAuditEvent[] = [];
  private alerts: AXAlert[] = [];
  private snapshots: AXQualitySnapshot[] = [];
  private alertListeners: Array<(alert: AXAlert) => void> = [];

  /** 阈值配置 */
  private thresholds = {
    maxFirstResponseMs: 3000,
    minTaskCompletionRate: 0.75,
    maxAbandonmentRate: 0.3,
    maxClarificationRate: 3.0,
    maxUndoRate: 2.0,
    minErrorRecoveryRate: 0.6,
    maxCalibrationError: 0.15,
  };

  constructor(
    customThresholds?: Partial<typeof AXAuditor.prototype.thresholds>
  ) {
    if (customThresholds) {
      Object.assign(this.thresholds, customThresholds);
    }
  }

  /** 注册告警监听器 */
  onAlert(listener: (alert: AXAlert) => void): void {
    this.alertListeners.push(listener);
  }

  /** 记录审计事件 */
  recordEvent(event: AXAuditEvent): void {
    this.events.push(event);
  }

  /** 对指定时间窗口生成质量快照 */
  generateSnapshot(windowStart: number, windowEnd: number): AXQualitySnapshot {
    const windowEvents = this.events.filter(
      (e) => e.timestamp >= windowStart && e.timestamp <= windowEnd
    );

    // 按会话分组
    const sessionMap = new Map<string, AXAuditEvent[]>();
    for (const event of windowEvents) {
      const existing = sessionMap.get(event.sessionId) ?? [];
      existing.push(event);
      sessionMap.set(event.sessionId, existing);
    }

    const sessionCount = sessionMap.size;
    if (sessionCount === 0) {
      const emptySnapshot: AXQualitySnapshot = {
        windowStart,
        windowEnd,
        sessionCount: 0,
        taskCompletionRate: 0,
        avgFirstResponseMs: 0,
        abandonmentRate: 0,
        clarificationRate: 0,
        undoRate: 0,
        errorRecoveryRate: 0,
        calibrationError: 0,
      };
      this.snapshots.push(emptySnapshot);
      return emptySnapshot;
    }

    // 计算各项指标
    let completedTasks = 0;
    let abandonedTasks = 0;
    let totalFirstResponseMs = 0;
    let responseCount = 0;
    let totalClarifications = 0;
    let totalUndos = 0;
    let errorEvents = 0;
    let recoveredErrors = 0;

    for (const [, events] of sessionMap) {
      const hasCompletion = events.some(
        (e) => e.eventType === "task_completed"
      );
      const hasAbandonment = events.some(
        (e) => e.eventType === "task_abandoned"
      );

      if (hasCompletion) completedTasks++;
      if (hasAbandonment) abandonedTasks++;

      // 首次响应时间：第一个 user_action 到第一个 response_delivered
      const firstAction = events.find((e) => e.eventType === "user_action");
      const firstResponse = events.find(
        (e) => e.eventType === "response_delivered"
      );
      if (firstAction && firstResponse) {
        totalFirstResponseMs +=
          firstResponse.timestamp - firstAction.timestamp;
        responseCount++;
      }

      // 澄清与撤销次数
      totalClarifications += events.filter(
        (e) => e.eventType === "clarification_requested"
      ).length;
      totalUndos += events.filter(
        (e) => e.eventType === "undo_triggered"
      ).length;

      // 错误与恢复
      const sessionErrors = events.filter(
        (e) => e.eventType === "error_occurred"
      );
      errorEvents += sessionErrors.length;
      for (const errEvent of sessionErrors) {
        const errorTime = errEvent.timestamp;
        const hasRecovery = events.some(
          (e) =>
            e.eventType === "task_completed" && e.timestamp > errorTime
        );
        if (hasRecovery) recoveredErrors++;
      }
    }

    const snapshot: AXQualitySnapshot = {
      windowStart,
      windowEnd,
      sessionCount,
      taskCompletionRate: completedTasks / sessionCount,
      avgFirstResponseMs:
        responseCount > 0 ? totalFirstResponseMs / responseCount : 0,
      abandonmentRate: abandonedTasks / sessionCount,
      clarificationRate: totalClarifications / sessionCount,
      undoRate: totalUndos / sessionCount,
      errorRecoveryRate:
        errorEvents > 0 ? recoveredErrors / errorEvents : 1.0,
      calibrationError: this.computeCalibrationError(windowEvents),
    };

    this.snapshots.push(snapshot);
    this.checkThresholds(snapshot);
    return snapshot;
  }

  /** 计算置信度校准误差（简化版 ECE） */
  private computeCalibrationError(events: AXAuditEvent[]): number {
    const confidenceEvents = events.filter(
      (e) =>
        e.eventType === "confidence_displayed" &&
        typeof e.payload["confidence"] === "number" &&
        typeof e.payload["wasCorrect"] === "boolean"
    );

    if (confidenceEvents.length === 0) return 0;

    // 将置信度分为 10 个桶
    const bucketCount = 10;
    const buckets: Array<{ totalConfidence: number; totalCorrect: number; count: number }> =
      Array.from({ length: bucketCount }, () => ({
        totalConfidence: 0,
        totalCorrect: 0,
        count: 0,
      }));

    for (const event of confidenceEvents) {
      const conf = event.payload["confidence"] as number;
      const correct = event.payload["wasCorrect"] as boolean;
      const bucketIdx = Math.min(
        Math.floor(conf * bucketCount),
        bucketCount - 1
      );
      buckets[bucketIdx].totalConfidence += conf;
      buckets[bucketIdx].totalCorrect += correct ? 1 : 0;
      buckets[bucketIdx].count++;
    }

    // ECE = Σ (|bucket_count / total| * |avg_confidence - accuracy|)
    let ece = 0;
    const total = confidenceEvents.length;
    for (const bucket of buckets) {
      if (bucket.count === 0) continue;
      const avgConf = bucket.totalConfidence / bucket.count;
      const accuracy = bucket.totalCorrect / bucket.count;
      ece += (bucket.count / total) * Math.abs(avgConf - accuracy);
    }

    return ece;
  }

  /** 检查质量快照是否触发告警 */
  private checkThresholds(snapshot: AXQualitySnapshot): void {
    const checks: Array<{
      metric: string;
      value: number;
      threshold: number;
      isUpperBound: boolean;
      message: string;
      action: string;
    }> = [
      {
        metric: "avgFirstResponseMs",
        value: snapshot.avgFirstResponseMs,
        threshold: this.thresholds.maxFirstResponseMs,
        isUpperBound: true,
        message: `平均首次响应时间 ${snapshot.avgFirstResponseMs.toFixed(0)}ms 超过阈值 ${this.thresholds.maxFirstResponseMs}ms`,
        action: "优化 LLM 调用链路，考虑添加流式输出或占位符响应",
      },
      {
        metric: "taskCompletionRate",
        value: snapshot.taskCompletionRate,
        threshold: this.thresholds.minTaskCompletionRate,
        isUpperBound: false,
        message: `任务完成率 ${(snapshot.taskCompletionRate * 100).toFixed(1)}% 低于阈值 ${(this.thresholds.minTaskCompletionRate * 100).toFixed(1)}%`,
        action: "分析未完成任务的原因，改善澄清机制和错误恢复流程",
      },
      {
        metric: "abandonmentRate",
        value: snapshot.abandonmentRate,
        threshold: this.thresholds.maxAbandonmentRate,
        isUpperBound: true,
        message: `用户放弃率 ${(snapshot.abandonmentRate * 100).toFixed(1)}% 超过阈值`,
        action: "检查是否存在长时间无响应、信息不透明或缺少控制选项的场景",
      },
      {
        metric: "clarificationRate",
        value: snapshot.clarificationRate,
        threshold: this.thresholds.maxClarificationRate,
        isUpperBound: true,
        message: `平均澄清次数 ${snapshot.clarificationRate.toFixed(1)} 超过阈值`,
        action: "优化 Agent 的意图理解能力，改善提示词或添加上下文推断",
      },
      {
        metric: "undoRate",
        value: snapshot.undoRate,
        threshold: this.thresholds.maxUndoRate,
        isUpperBound: true,
        message: `平均撤销次数 ${snapshot.undoRate.toFixed(1)} 超过阈值`,
        action: "分析撤销的原因，改善 Agent 的首次输出质量或添加确认节点",
      },
      {
        metric: "errorRecoveryRate",
        value: snapshot.errorRecoveryRate,
        threshold: this.thresholds.minErrorRecoveryRate,
        isUpperBound: false,
        message: `错误恢复率 ${(snapshot.errorRecoveryRate * 100).toFixed(1)}% 低于阈值`,
        action: "增强错误恢复建议的质量，确保每种错误类型都有清晰的恢复路径",
      },
      {
        metric: "calibrationError",
        value: snapshot.calibrationError,
        threshold: this.thresholds.maxCalibrationError,
        isUpperBound: true,
        message: `置信度校准误差 ${snapshot.calibrationError.toFixed(3)} 超过阈值`,
        action: "调整置信度显示策略，参考第 14 章信任校准机制进行修正",
      },
    ];

    for (const check of checks) {
      const isViolation = check.isUpperBound
        ? check.value > check.threshold
        : check.value < check.threshold;

      if (isViolation) {
        const alert: AXAlert = {
          id: `ax-alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          severity: this.determineSeverity(
            check.value,
            check.threshold,
            check.isUpperBound
          ),
          metric: check.metric,
          currentValue: check.value,
          threshold: check.threshold,
          message: check.message,
          suggestedAction: check.action,
          timestamp: Date.now(),
        };
        this.alerts.push(alert);
        for (const listener of this.alertListeners) {
          listener(alert);
        }
      }
    }
  }

  /** 根据偏离程度决定告警严重性 */
  private determineSeverity(
    value: number,
    threshold: number,
    isUpperBound: boolean
  ): "critical" | "warning" | "info" {
    const deviation = isUpperBound
      ? (value - threshold) / threshold
      : (threshold - value) / threshold;

    if (deviation > 0.5) return "critical";
    if (deviation > 0.2) return "warning";
    return "info";
  }

  /** 获取最近的告警列表 */
  getRecentAlerts(limit: number = 10): AXAlert[] {
    return this.alerts.slice(-limit);
  }

  /** 获取质量趋势（最近 N 个快照） */
  getQualityTrend(
    metric: keyof AXQualitySnapshot,
    limit: number = 10
  ): Array<{ timestamp: number; value: number }> {
    return this.snapshots.slice(-limit).map((s) => ({
      timestamp: s.windowEnd,
      value: s[metric] as number,
    }));
  }

  /** 生成综合体验质量评分（0-100） */
  computeOverallScore(snapshot: AXQualitySnapshot): number {
    const weights = {
      taskCompletionRate: 0.25,
      responseTime: 0.15,
      abandonmentRate: 0.15,
      clarificationRate: 0.1,
      undoRate: 0.1,
      errorRecoveryRate: 0.15,
      calibrationError: 0.1,
    };

    // 归一化各项指标到 0-1（越高越好）
    const normalized = {
      taskCompletionRate: snapshot.taskCompletionRate,
      responseTime: Math.max(
        0,
        1 - snapshot.avgFirstResponseMs / this.thresholds.maxFirstResponseMs
      ),
      abandonmentRate: Math.max(0, 1 - snapshot.abandonmentRate),
      clarificationRate: Math.max(
        0,
        1 - snapshot.clarificationRate / this.thresholds.maxClarificationRate
      ),
      undoRate: Math.max(
        0,
        1 - snapshot.undoRate / this.thresholds.maxUndoRate
      ),
      errorRecoveryRate: snapshot.errorRecoveryRate,
      calibrationError: Math.max(0, 1 - snapshot.calibrationError * 5),
    };

    let score = 0;
    for (const [key, weight] of Object.entries(weights)) {
      score += (normalized[key as keyof typeof normalized] ?? 0) * weight;
    }

    return Math.round(score * 100);
  }
}
```

> **与其他章节的联系**：`AXDesignSystem` 中的 CLEAR 原则验证为第 3 章 Agent 架构总览中的体验层提供了质量门禁；`AXAuditor` 的置信度校准误差计算与第 14 章信任架构中的可信度量形成闭环。在第 21 章的平台上下文中，AX 审计数据还可以作为平台级的体验 SLA 指标。

---


## 22.2 渐进式信息披露

### 22.2.1 信息过载问题

Agent 系统天然产生大量信息：推理步骤、工具调用记录、中间结果、来源引用、置信度评估等。如果将所有信息一次性呈现给用户，会导致严重的认知过载（Cognitive Overload）。反之，如果隐藏过多信息，用户又会感到 Agent 像一个不透明的黑盒。

**渐进式信息披露（Progressive Disclosure）** 是解决这一矛盾的核心策略：按需提供不同粒度的信息，让用户在"概览"和"深入"之间自由切换。

### 22.2.2 四层披露模型

我们定义四个披露层级，对应不同的用户需求：

| 层级 | 名称 | 用户需求 | 信息粒度 | 示例 |
|------|------|---------|---------|------|
| L1 | **标题（Headline）** | 发生了什么？ | 一句话结果摘要 | "已完成代码审查，发现 3 个问题" |
| L2 | **详情（Detail）** | 怎么做的？ | 关键步骤和决策 | "分析了 5 个文件，重点检查了安全性和性能" |
| L3 | **依据（Evidence）** | 为什么这样做？ | 来源、推理链、置信度 | "根据 OWASP Top 10，SQL 注入风险评分 0.85" |
| L4 | **原始（Raw）** | 完整数据 | 原始日志和数据 | 完整的 LLM 提示词、API 响应、工具输出 |

### 22.2.3 ProgressiveDisclosureManager 实现

```typescript
// ============================================================
// 渐进式信息披露管理器
// ============================================================

/** 披露层级 */
enum DisclosureLevel {
  HEADLINE = 1, // 一句话摘要
  DETAIL = 2,   // 关键步骤和决策
  EVIDENCE = 3, // 来源和推理依据
  RAW = 4,      // 完整原始数据
}

/** 单条可披露信息 */
interface DisclosableItem {
  id: string;
  category: "action" | "reasoning" | "tool_call" | "result" | "error";
  headline: string;
  detail: string;
  evidence?: EvidenceData;
  raw?: Record<string, unknown>;
  timestamp: number;
  importance: "critical" | "high" | "medium" | "low";
}

/** 依据数据 */
interface EvidenceData {
  sources: Array<{
    type: "document" | "api" | "database" | "web" | "user_input";
    reference: string;
    relevanceScore: number;
  }>;
  reasoningChain: string[];
  confidence: number;
  alternativesConsidered?: string[];
}

/** 披露渲染配置 */
interface DisclosureRenderConfig {
  defaultLevel: DisclosureLevel;
  maxItemsPerLevel: Record<DisclosureLevel, number>;
  autoExpandThreshold: "critical" | "high" | "medium" | "low";
  collapseAfterMs: number;
  showLevelToggle: boolean;
}

/** 渲染后的披露内容 */
interface RenderedDisclosure {
  items: Array<{
    id: string;
    renderedContent: string;
    currentLevel: DisclosureLevel;
    hasMoreLevels: boolean;
    expandable: boolean;
  }>;
  summary: string;
  totalItems: number;
  visibleItems: number;
}

class ProgressiveDisclosureManager {
  private items: Map<string, DisclosableItem> = new Map();
  private userLevelOverrides: Map<string, DisclosureLevel> = new Map();
  private config: DisclosureRenderConfig;
  private onRender?: (rendered: RenderedDisclosure) => void;

  constructor(config?: Partial<DisclosureRenderConfig>) {
    this.config = {
      defaultLevel: DisclosureLevel.HEADLINE,
      maxItemsPerLevel: {
        [DisclosureLevel.HEADLINE]: 20,
        [DisclosureLevel.DETAIL]: 10,
        [DisclosureLevel.EVIDENCE]: 5,
        [DisclosureLevel.RAW]: 3,
      },
      autoExpandThreshold: "high",
      collapseAfterMs: 30000,
      showLevelToggle: true,
      ...config,
    };
  }

  /** 注册渲染回调 */
  onRendered(callback: (rendered: RenderedDisclosure) => void): void {
    this.onRender = callback;
  }

  /** 添加可披露信息 */
  addItem(item: DisclosableItem): void {
    this.items.set(item.id, item);
    this.autoExpandIfNeeded(item);
    this.triggerRender();
  }

  /** 批量添加信息 */
  addItems(items: DisclosableItem[]): void {
    for (const item of items) {
      this.items.set(item.id, item);
      this.autoExpandIfNeeded(item);
    }
    this.triggerRender();
  }

  /** 用户请求展开某项到指定层级 */
  expandItem(itemId: string, level: DisclosureLevel): void {
    if (this.items.has(itemId)) {
      this.userLevelOverrides.set(itemId, level);
      this.triggerRender();
    }
  }

  /** 用户请求折叠某项 */
  collapseItem(itemId: string): void {
    this.userLevelOverrides.delete(itemId);
    this.triggerRender();
  }

  /** 展开所有项到指定层级 */
  expandAll(level: DisclosureLevel): void {
    for (const id of this.items.keys()) {
      this.userLevelOverrides.set(id, level);
    }
    this.triggerRender();
  }

  /** 折叠所有项到默认层级 */
  collapseAll(): void {
    this.userLevelOverrides.clear();
    this.triggerRender();
  }

  /** 根据重要性自动展开 */
  private autoExpandIfNeeded(item: DisclosableItem): void {
    const importanceRank: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };
    const threshold = importanceRank[this.config.autoExpandThreshold];
    const itemRank = importanceRank[item.importance];

    if (itemRank >= threshold) {
      this.userLevelOverrides.set(item.id, DisclosureLevel.DETAIL);
    }
  }

  /** 获取某项的当前显示层级 */
  private getEffectiveLevel(itemId: string): DisclosureLevel {
    return this.userLevelOverrides.get(itemId) ?? this.config.defaultLevel;
  }

  /** 渲染单个项到指定层级 */
  private renderItem(
    item: DisclosableItem,
    level: DisclosureLevel
  ): string {
    const parts: string[] = [];

    // L1: 标题
    parts.push(item.headline);

    if (level >= DisclosureLevel.DETAIL) {
      parts.push("");
      parts.push(item.detail);
    }

    if (level >= DisclosureLevel.EVIDENCE && item.evidence) {
      parts.push("");
      parts.push("**推理链：**");
      for (const step of item.evidence.reasoningChain) {
        parts.push(`  → ${step}`);
      }
      parts.push(`**置信度：** ${(item.evidence.confidence * 100).toFixed(0)}%`);
      if (item.evidence.sources.length > 0) {
        parts.push("**来源：**");
        for (const src of item.evidence.sources) {
          parts.push(
            `  - [${src.type}] ${src.reference} (相关性: ${(src.relevanceScore * 100).toFixed(0)}%)`
          );
        }
      }
      if (
        item.evidence.alternativesConsidered &&
        item.evidence.alternativesConsidered.length > 0
      ) {
        parts.push("**已考虑的替代方案：**");
        for (const alt of item.evidence.alternativesConsidered) {
          parts.push(`  - ${alt}`);
        }
      }
    }

    if (level >= DisclosureLevel.RAW && item.raw) {
      parts.push("");
      parts.push("```json");
      parts.push(JSON.stringify(item.raw, null, 2));
      parts.push("```");
    }

    return parts.join("\n");
  }

  /** 计算最大可用层级 */
  private getMaxAvailableLevel(item: DisclosableItem): DisclosureLevel {
    if (item.raw) return DisclosureLevel.RAW;
    if (item.evidence) return DisclosureLevel.EVIDENCE;
    if (item.detail) return DisclosureLevel.DETAIL;
    return DisclosureLevel.HEADLINE;
  }

  /** 触发渲染 */
  private triggerRender(): void {
    if (!this.onRender) return;

    const sortedItems = Array.from(this.items.values()).sort((a, b) => {
      const importanceOrder: Record<string, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      };
      const impDiff = importanceOrder[a.importance] - importanceOrder[b.importance];
      if (impDiff !== 0) return impDiff;
      return b.timestamp - a.timestamp;
    });

    const renderedItems = sortedItems.map((item) => {
      const currentLevel = this.getEffectiveLevel(item.id);
      const maxLevel = this.getMaxAvailableLevel(item);
      return {
        id: item.id,
        renderedContent: this.renderItem(item, currentLevel),
        currentLevel,
        hasMoreLevels: currentLevel < maxLevel,
        expandable: maxLevel > DisclosureLevel.HEADLINE,
      };
    });

    const visibleCount = Math.min(
      renderedItems.length,
      this.config.maxItemsPerLevel[this.config.defaultLevel]
    );

    const rendered: RenderedDisclosure = {
      items: renderedItems.slice(0, visibleCount),
      summary: this.generateSummary(sortedItems),
      totalItems: sortedItems.length,
      visibleItems: visibleCount,
    };

    this.onRender(rendered);
  }

  /** 生成总体摘要 */
  private generateSummary(items: DisclosableItem[]): string {
    const categoryCounts: Record<string, number> = {};
    for (const item of items) {
      categoryCounts[item.category] =
        (categoryCounts[item.category] ?? 0) + 1;
    }

    const parts: string[] = [];
    if (categoryCounts["action"])
      parts.push(`${categoryCounts["action"]} 个操作`);
    if (categoryCounts["tool_call"])
      parts.push(`${categoryCounts["tool_call"]} 次工具调用`);
    if (categoryCounts["result"])
      parts.push(`${categoryCounts["result"]} 个结果`);
    if (categoryCounts["error"])
      parts.push(`${categoryCounts["error"]} 个错误`);

    return `共 ${items.length} 条信息：${parts.join("，")}`;
  }
}
```

### 22.2.4 InformationHierarchy 类

`InformationHierarchy` 将 Agent 输出的扁平信息流组织为层级结构，支持 UI 以树形或分组方式展示：

```typescript
// ============================================================
// 信息层级组织器
// ============================================================

interface HierarchyNode {
  id: string;
  parentId: string | null;
  label: string;
  type: "phase" | "step" | "detail" | "evidence";
  content: string;
  children: HierarchyNode[];
  metadata: {
    startTime: number;
    endTime?: number;
    status: "pending" | "active" | "completed" | "failed";
    importance: "critical" | "high" | "medium" | "low";
  };
}

interface HierarchyRenderOptions {
  maxDepth: number;
  expandedIds: Set<string>;
  filterStatus?: HierarchyNode["metadata"]["status"];
  indentSize: number;
}

class InformationHierarchy {
  private root: HierarchyNode;
  private nodeIndex: Map<string, HierarchyNode> = new Map();

  constructor(rootLabel: string) {
    this.root = {
      id: "root",
      parentId: null,
      label: rootLabel,
      type: "phase",
      content: "",
      children: [],
      metadata: {
        startTime: Date.now(),
        status: "active",
        importance: "high",
      },
    };
    this.nodeIndex.set("root", this.root);
  }

  /** 添加节点 */
  addNode(
    id: string,
    parentId: string,
    label: string,
    type: HierarchyNode["type"],
    content: string = "",
    importance: HierarchyNode["metadata"]["importance"] = "medium"
  ): HierarchyNode {
    const parent = this.nodeIndex.get(parentId);
    if (!parent) {
      throw new Error(`父节点 ${parentId} 不存在`);
    }

    const node: HierarchyNode = {
      id,
      parentId,
      label,
      type,
      content,
      children: [],
      metadata: {
        startTime: Date.now(),
        status: "pending",
        importance,
      },
    };

    parent.children.push(node);
    this.nodeIndex.set(id, node);
    return node;
  }

  /** 更新节点状态 */
  updateStatus(
    nodeId: string,
    status: HierarchyNode["metadata"]["status"]
  ): void {
    const node = this.nodeIndex.get(nodeId);
    if (!node) return;

    node.metadata.status = status;
    if (status === "completed" || status === "failed") {
      node.metadata.endTime = Date.now();
    }
  }

  /** 更新节点内容 */
  updateContent(nodeId: string, content: string): void {
    const node = this.nodeIndex.get(nodeId);
    if (node) {
      node.content = content;
    }
  }

  /** 获取节点 */
  getNode(nodeId: string): HierarchyNode | undefined {
    return this.nodeIndex.get(nodeId);
  }

  /** 获取节点路径（从根到目标节点） */
  getPath(nodeId: string): HierarchyNode[] {
    const path: HierarchyNode[] = [];
    let current = this.nodeIndex.get(nodeId);
    while (current) {
      path.unshift(current);
      current = current.parentId
        ? this.nodeIndex.get(current.parentId)
        : undefined;
    }
    return path;
  }

  /** 渲染为缩进文本 */
  renderAsText(options?: Partial<HierarchyRenderOptions>): string {
    const opts: HierarchyRenderOptions = {
      maxDepth: 4,
      expandedIds: new Set(),
      indentSize: 2,
      ...options,
    };

    const lines: string[] = [];
    this.renderNode(this.root, 0, opts, lines);
    return lines.join("\n");
  }

  private renderNode(
    node: HierarchyNode,
    depth: number,
    options: HierarchyRenderOptions,
    lines: string[]
  ): void {
    if (depth > options.maxDepth) return;
    if (
      options.filterStatus &&
      node.metadata.status !== options.filterStatus
    ) {
      return;
    }

    const indent = " ".repeat(depth * options.indentSize);
    const statusIcon = this.getStatusIcon(node.metadata.status);
    const durationStr = this.formatDuration(node);

    lines.push(`${indent}${statusIcon} ${node.label}${durationStr}`);

    if (node.content && (depth === 0 || options.expandedIds.has(node.id))) {
      const contentIndent = " ".repeat((depth + 1) * options.indentSize);
      for (const line of node.content.split("\n")) {
        lines.push(`${contentIndent}${line}`);
      }
    }

    for (const child of node.children) {
      this.renderNode(child, depth + 1, options, lines);
    }
  }

  private getStatusIcon(
    status: HierarchyNode["metadata"]["status"]
  ): string {
    switch (status) {
      case "pending":
        return "○";
      case "active":
        return "◉";
      case "completed":
        return "✓";
      case "failed":
        return "✗";
    }
  }

  private formatDuration(node: HierarchyNode): string {
    if (!node.metadata.endTime) return "";
    const ms = node.metadata.endTime - node.metadata.startTime;
    if (ms < 1000) return ` (${ms}ms)`;
    return ` (${(ms / 1000).toFixed(1)}s)`;
  }

  /** 获取整棵树的统计信息 */
  getStats(): {
    totalNodes: number;
    completedNodes: number;
    failedNodes: number;
    activeNodes: number;
    pendingNodes: number;
    maxDepth: number;
  } {
    let completed = 0;
    let failed = 0;
    let active = 0;
    let pending = 0;
    let maxDepth = 0;

    const walk = (node: HierarchyNode, depth: number): void => {
      maxDepth = Math.max(maxDepth, depth);
      switch (node.metadata.status) {
        case "completed":
          completed++;
          break;
        case "failed":
          failed++;
          break;
        case "active":
          active++;
          break;
        case "pending":
          pending++;
          break;
      }
      for (const child of node.children) {
        walk(child, depth + 1);
      }
    };

    walk(this.root, 0);

    return {
      totalNodes: this.nodeIndex.size,
      completedNodes: completed,
      failedNodes: failed,
      activeNodes: active,
      pendingNodes: pending,
      maxDepth,
    };
  }
}
```

### 22.2.5 UserExpertiseTracker：用户专业度追踪

不同用户对信息的需求深度不同。一个资深开发者可能希望看到完整的推理链和原始 API 响应，而一个业务用户可能只需要结果摘要。`UserExpertiseTracker` 通过分析用户的交互模式，自动识别其专业度级别：

```typescript
// ============================================================
// 用户专业度追踪器
// ============================================================

/** 专业度级别 */
enum ExpertiseLevel {
  NOVICE = 1,      // 新手：需要引导和简化
  INTERMEDIATE = 2, // 中级：能理解关键概念
  ADVANCED = 3,     // 高级：需要详细信息
  EXPERT = 4,       // 专家：需要原始数据和完全控制
}

/** 专业度信号 */
interface ExpertiseSignal {
  type:
    | "expanded_details"
    | "collapsed_details"
    | "used_technical_term"
    | "asked_basic_question"
    | "modified_config"
    | "viewed_raw_data"
    | "skipped_explanation"
    | "requested_explanation"
    | "used_shortcut"
    | "interaction_speed";
  weight: number; // 正值=专家倾向，负值=新手倾向
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/** 用户专业度画像 */
interface ExpertiseProfile {
  userId: string;
  currentLevel: ExpertiseLevel;
  confidence: number; // 对当前判断的置信度
  signalHistory: ExpertiseSignal[];
  domainScores: Record<string, number>; // 领域 → 专业度分数
  preferredDisclosureLevel: DisclosureLevel;
  lastUpdated: number;
}

class UserExpertiseTracker {
  private profiles: Map<string, ExpertiseProfile> = new Map();
  private readonly signalDecayHalfLifeMs = 7 * 24 * 3600 * 1000; // 7天半衰期
  private readonly maxSignalHistory = 500;

  /** 获取或创建用户画像 */
  getProfile(userId: string): ExpertiseProfile {
    let profile = this.profiles.get(userId);
    if (!profile) {
      profile = {
        userId,
        currentLevel: ExpertiseLevel.INTERMEDIATE, // 默认中级
        confidence: 0.3,
        signalHistory: [],
        domainScores: {},
        preferredDisclosureLevel: DisclosureLevel.DETAIL,
        lastUpdated: Date.now(),
      };
      this.profiles.set(userId, profile);
    }
    return profile;
  }

  /** 记录专业度信号 */
  recordSignal(
    userId: string,
    signalType: ExpertiseSignal["type"],
    domain?: string,
    metadata?: Record<string, unknown>
  ): ExpertiseLevel {
    const profile = this.getProfile(userId);

    const weight = this.getSignalWeight(signalType);
    const signal: ExpertiseSignal = {
      type: signalType,
      weight,
      timestamp: Date.now(),
      metadata,
    };

    profile.signalHistory.push(signal);
    if (profile.signalHistory.length > this.maxSignalHistory) {
      profile.signalHistory = profile.signalHistory.slice(-this.maxSignalHistory);
    }

    if (domain) {
      const currentDomainScore = profile.domainScores[domain] ?? 0;
      profile.domainScores[domain] = this.clamp(
        currentDomainScore + weight * 0.1,
        -1,
        1
      );
    }

    this.recalculateLevel(profile);
    return profile.currentLevel;
  }

  /** 获取推荐的披露层级 */
  getRecommendedDisclosureLevel(userId: string): DisclosureLevel {
    const profile = this.getProfile(userId);
    return profile.preferredDisclosureLevel;
  }

  /** 获取信号权重 */
  private getSignalWeight(signalType: ExpertiseSignal["type"]): number {
    const weights: Record<ExpertiseSignal["type"], number> = {
      expanded_details: 0.3,
      collapsed_details: -0.2,
      used_technical_term: 0.4,
      asked_basic_question: -0.5,
      modified_config: 0.5,
      viewed_raw_data: 0.6,
      skipped_explanation: 0.3,
      requested_explanation: -0.4,
      used_shortcut: 0.4,
      interaction_speed: 0.0, // 动态计算
    };
    return weights[signalType];
  }

  /** 重新计算专业度级别 */
  private recalculateLevel(profile: ExpertiseProfile): void {
    const now = Date.now();
    let weightedSum = 0;
    let totalWeight = 0;

    for (const signal of profile.signalHistory) {
      const age = now - signal.timestamp;
      const decayFactor = Math.pow(0.5, age / this.signalDecayHalfLifeMs);
      const effectiveWeight = Math.abs(signal.weight) * decayFactor;

      weightedSum += signal.weight * decayFactor;
      totalWeight += effectiveWeight;
    }

    if (totalWeight === 0) {
      profile.confidence = 0.3;
      return;
    }

    const normalizedScore = weightedSum / totalWeight; // -1 到 1
    profile.confidence = Math.min(
      0.95,
      0.3 + totalWeight * 0.01
    );

    if (normalizedScore >= 0.5) {
      profile.currentLevel = ExpertiseLevel.EXPERT;
      profile.preferredDisclosureLevel = DisclosureLevel.EVIDENCE;
    } else if (normalizedScore >= 0.15) {
      profile.currentLevel = ExpertiseLevel.ADVANCED;
      profile.preferredDisclosureLevel = DisclosureLevel.DETAIL;
    } else if (normalizedScore >= -0.15) {
      profile.currentLevel = ExpertiseLevel.INTERMEDIATE;
      profile.preferredDisclosureLevel = DisclosureLevel.DETAIL;
    } else {
      profile.currentLevel = ExpertiseLevel.NOVICE;
      profile.preferredDisclosureLevel = DisclosureLevel.HEADLINE;
    }

    profile.lastUpdated = now;
  }

  /** 工具函数：数值钳制 */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /** 导出用户画像（用于持久化） */
  exportProfile(userId: string): string {
    const profile = this.getProfile(userId);
    return JSON.stringify(profile, null, 2);
  }

  /** 导入用户画像 */
  importProfile(data: string): void {
    const profile: ExpertiseProfile = JSON.parse(data);
    this.profiles.set(profile.userId, profile);
  }
}
```

### 22.2.6 使用示例

将以上组件组合，实现一个完整的渐进式披露流程：

```typescript
// ============================================================
// 渐进式披露完整使用示例
// ============================================================

function demonstrateProgressiveDisclosure(): void {
  // 1. 初始化组件
  const disclosureManager = new ProgressiveDisclosureManager({
    defaultLevel: DisclosureLevel.HEADLINE,
    autoExpandThreshold: "high",
  });

  const expertiseTracker = new UserExpertiseTracker();
  const hierarchy = new InformationHierarchy("代码审查任务");
  const userId = "user-001";

  // 2. 模拟用户行为，建立专业度画像
  expertiseTracker.recordSignal(userId, "used_technical_term", "programming");
  expertiseTracker.recordSignal(userId, "expanded_details");
  expertiseTracker.recordSignal(userId, "viewed_raw_data", "programming");
  const recommendedLevel =
    expertiseTracker.getRecommendedDisclosureLevel(userId);

  console.log(`用户推荐披露层级: ${DisclosureLevel[recommendedLevel]}`);

  // 3. 构建信息层级
  const analysisPhase = hierarchy.addNode(
    "phase-1",
    "root",
    "代码分析阶段",
    "phase",
    "",
    "high"
  );
  hierarchy.updateStatus("phase-1", "active");

  hierarchy.addNode(
    "step-1-1",
    "phase-1",
    "解析 TypeScript AST",
    "step",
    "使用 ts-morph 解析了 12 个源文件",
    "medium"
  );
  hierarchy.updateStatus("step-1-1", "completed");

  hierarchy.addNode(
    "step-1-2",
    "phase-1",
    "检测安全漏洞",
    "step",
    "基于 OWASP Top 10 规则集执行静态分析",
    "high"
  );
  hierarchy.updateStatus("step-1-2", "completed");

  hierarchy.updateStatus("phase-1", "completed");

  // 4. 添加可披露信息
  disclosureManager.addItems([
    {
      id: "result-1",
      category: "result",
      headline: "发现 2 个高危安全漏洞和 1 个性能问题",
      detail:
        "在 auth.ts 中发现 SQL 注入风险，在 api.ts 中发现未验证的用户输入。" +
        "在 data-loader.ts 中发现 N+1 查询问题。",
      evidence: {
        sources: [
          {
            type: "document",
            reference: "OWASP Top 10 2021 - A03:Injection",
            relevanceScore: 0.95,
          },
          {
            type: "document",
            reference: "TypeScript Security Best Practices",
            relevanceScore: 0.78,
          },
        ],
        reasoningChain: [
          "识别到用户输入直接拼接到 SQL 查询字符串中",
          "未使用参数化查询或 ORM 的安全查询方法",
          "该模式匹配 CWE-89: SQL Injection 特征",
          "根据 CVSS 评分标准，该漏洞属于高危级别",
        ],
        confidence: 0.92,
        alternativesConsidered: [
          "该拼接可能已被上层中间件过滤（检查后排除）",
          "可能使用了自定义转义函数（未发现相关代码）",
        ],
      },
      raw: {
        vulnerabilities: [
          {
            file: "src/auth.ts",
            line: 47,
            column: 12,
            rule: "sql-injection",
            severity: "high",
            snippet: "const query = `SELECT * FROM users WHERE id = ${userId}`",
          },
        ],
      },
      timestamp: Date.now(),
      importance: "critical",
    },
    {
      id: "action-1",
      category: "action",
      headline: "已生成修复建议补丁",
      detail:
        "为每个漏洞生成了具体的修复代码，使用参数化查询替换字符串拼接，" +
        "添加输入验证中间件。",
      timestamp: Date.now(),
      importance: "high",
    },
  ]);

  // 5. 根据用户专业度调整默认展示层级
  const profile = expertiseTracker.getProfile(userId);
  console.log(
    `用户 ${userId} 专业度: ${ExpertiseLevel[profile.currentLevel]}，` +
    `置信度: ${(profile.confidence * 100).toFixed(0)}%`
  );

  // 6. 展示信息层级
  console.log("\n--- 信息层级 ---");
  console.log(hierarchy.renderAsText({ maxDepth: 3 }));

  const stats = hierarchy.getStats();
  console.log(
    `\n统计: 总节点 ${stats.totalNodes}, ` +
    `完成 ${stats.completedNodes}, ` +
    `失败 ${stats.failedNodes}`
  );
}
```

> **设计要点：** 渐进式披露不是简单的"折叠/展开"——它需要根据信息的重要性、用户的专业度和当前上下文，智能选择默认展示的信息量。关键原则是 **"概览优先，详情按需"**：用户应该能一眼看到最重要的结论，然后选择性地深入了解细节。

---


## 22.3 对话控制与中断

### 22.3.1 控制权的平衡

在 Agent 系统中，用户面临一个独特的控制权困境：委托太少，Agent 无法发挥自主性；委托太多，用户失去掌控感。优秀的 AX 设计需要在这两者之间找到动态平衡点。

控制模式可分为三类：

1. **完全监督（Full Supervision）**：Agent 每一步都请求确认。安全但低效。
2. **自主执行（Autonomous Execution）**：Agent 独立完成全部任务。高效但风险高。
3. **弹性控制（Elastic Control）**：根据任务风险级别动态调整确认频率。这是推荐的模式。

### 22.3.2 ConversationStateMachine

对话状态机是控制 Agent 交互流程的核心组件。它定义了 Agent 在不同状态之间的合法转换，确保对话始终处于可控状态：

```typescript
// ============================================================
// 对话状态机：管理 Agent 交互生命周期
// ============================================================

/** 对话状态 */
enum ConversationState {
  IDLE = "idle",               // 空闲，等待用户输入
  THINKING = "thinking",       // 正在推理/规划
  EXECUTING = "executing",     // 正在执行工具调用
  WAITING_INPUT = "waiting_input", // 等待用户提供额外信息
  PAUSED = "paused",          // 被用户暂停
  ERROR = "error",            // 发生错误
  COMPLETED = "completed",    // 任务完成
}

/** 状态转换事件 */
type StateEvent =
  | "user_message"
  | "start_thinking"
  | "start_executing"
  | "need_input"
  | "user_pause"
  | "user_resume"
  | "user_cancel"
  | "error_occurred"
  | "task_completed"
  | "retry"
  | "user_input_received";

/** 状态转换定义 */
interface StateTransition {
  from: ConversationState;
  event: StateEvent;
  to: ConversationState;
  guard?: (context: StateMachineContext) => boolean;
  action?: (context: StateMachineContext) => void;
}

/** 状态机上下文 */
interface StateMachineContext {
  sessionId: string;
  currentState: ConversationState;
  previousStates: ConversationState[];
  pausedState?: ConversationState; // 暂停前的状态，用于恢复
  taskProgress: number; // 0-100
  errorCount: number;
  maxRetries: number;
  savedCheckpoint?: ExecutionCheckpoint;
  metadata: Record<string, unknown>;
}

/** 执行检查点（用于暂停恢复） */
interface ExecutionCheckpoint {
  stepIndex: number;
  totalSteps: number;
  completedActions: string[];
  pendingActions: string[];
  intermediateResults: Record<string, unknown>;
  savedAt: number;
}

/** 状态变更通知 */
interface StateChangeNotification {
  from: ConversationState;
  to: ConversationState;
  event: StateEvent;
  timestamp: number;
  context: StateMachineContext;
}

class ConversationStateMachine {
  private context: StateMachineContext;
  private transitions: StateTransition[] = [];
  private listeners: Array<(notification: StateChangeNotification) => void> = [];

  constructor(sessionId: string) {
    this.context = {
      sessionId,
      currentState: ConversationState.IDLE,
      previousStates: [],
      taskProgress: 0,
      errorCount: 0,
      maxRetries: 3,
      metadata: {},
    };

    this.registerDefaultTransitions();
  }

  /** 注册默认状态转换规则 */
  private registerDefaultTransitions(): void {
    const transitions: StateTransition[] = [
      // IDLE → 接收用户消息开始思考
      {
        from: ConversationState.IDLE,
        event: "user_message",
        to: ConversationState.THINKING,
        action: (ctx) => {
          ctx.errorCount = 0;
          ctx.taskProgress = 0;
        },
      },

      // THINKING → 开始执行
      {
        from: ConversationState.THINKING,
        event: "start_executing",
        to: ConversationState.EXECUTING,
        action: (ctx) => {
          ctx.taskProgress = 10;
        },
      },

      // THINKING → 需要更多信息
      {
        from: ConversationState.THINKING,
        event: "need_input",
        to: ConversationState.WAITING_INPUT,
      },

      // EXECUTING → 需要用户输入（如确认危险操作）
      {
        from: ConversationState.EXECUTING,
        event: "need_input",
        to: ConversationState.WAITING_INPUT,
        action: (ctx) => {
          // 保存当前执行状态作为检查点
          ctx.savedCheckpoint = {
            stepIndex: (ctx.metadata["currentStep"] as number) ?? 0,
            totalSteps: (ctx.metadata["totalSteps"] as number) ?? 1,
            completedActions: (ctx.metadata["completedActions"] as string[]) ?? [],
            pendingActions: (ctx.metadata["pendingActions"] as string[]) ?? [],
            intermediateResults:
              (ctx.metadata["intermediateResults"] as Record<string, unknown>) ?? {},
            savedAt: Date.now(),
          };
        },
      },

      // WAITING_INPUT → 收到用户输入，继续思考
      {
        from: ConversationState.WAITING_INPUT,
        event: "user_input_received",
        to: ConversationState.THINKING,
      },

      // EXECUTING → 任务完成
      {
        from: ConversationState.EXECUTING,
        event: "task_completed",
        to: ConversationState.COMPLETED,
        action: (ctx) => {
          ctx.taskProgress = 100;
        },
      },

      // 任何活跃状态 → 用户暂停
      {
        from: ConversationState.THINKING,
        event: "user_pause",
        to: ConversationState.PAUSED,
        action: (ctx) => {
          ctx.pausedState = ConversationState.THINKING;
        },
      },
      {
        from: ConversationState.EXECUTING,
        event: "user_pause",
        to: ConversationState.PAUSED,
        action: (ctx) => {
          ctx.pausedState = ConversationState.EXECUTING;
        },
      },

      // PAUSED → 恢复
      {
        from: ConversationState.PAUSED,
        event: "user_resume",
        to: ConversationState.THINKING, // 默认回到思考状态
        action: (ctx) => {
          // 如果有检查点，恢复到暂停前的执行位置
          if (ctx.savedCheckpoint) {
            ctx.metadata["resumeFromCheckpoint"] = true;
          }
        },
      },

      // 任何状态 → 用户取消（回到 IDLE）
      ...([
        ConversationState.THINKING,
        ConversationState.EXECUTING,
        ConversationState.WAITING_INPUT,
        ConversationState.PAUSED,
      ] as ConversationState[]).map(
        (state): StateTransition => ({
          from: state,
          event: "user_cancel",
          to: ConversationState.IDLE,
          action: (ctx) => {
            ctx.taskProgress = 0;
            ctx.savedCheckpoint = undefined;
            ctx.pausedState = undefined;
          },
        })
      ),

      // 活跃状态 → 错误
      {
        from: ConversationState.THINKING,
        event: "error_occurred",
        to: ConversationState.ERROR,
        action: (ctx) => {
          ctx.errorCount++;
        },
      },
      {
        from: ConversationState.EXECUTING,
        event: "error_occurred",
        to: ConversationState.ERROR,
        action: (ctx) => {
          ctx.errorCount++;
        },
      },

      // ERROR → 重试（如果未超过最大重试次数）
      {
        from: ConversationState.ERROR,
        event: "retry",
        to: ConversationState.THINKING,
        guard: (ctx) => ctx.errorCount < ctx.maxRetries,
      },

      // ERROR → 用户取消
      {
        from: ConversationState.ERROR,
        event: "user_cancel",
        to: ConversationState.IDLE,
        action: (ctx) => {
          ctx.taskProgress = 0;
        },
      },

      // COMPLETED → 新消息（新一轮对话）
      {
        from: ConversationState.COMPLETED,
        event: "user_message",
        to: ConversationState.THINKING,
        action: (ctx) => {
          ctx.errorCount = 0;
          ctx.taskProgress = 0;
          ctx.savedCheckpoint = undefined;
        },
      },
    ];

    this.transitions = transitions;
  }

  /** 触发状态转换事件 */
  dispatch(event: StateEvent): boolean {
    const transition = this.transitions.find(
      (t) =>
        t.from === this.context.currentState &&
        t.event === event &&
        (!t.guard || t.guard(this.context))
    );

    if (!transition) {
      console.warn(
        `无效状态转换: ${this.context.currentState} + ${event}`
      );
      return false;
    }

    const previousState = this.context.currentState;
    this.context.previousStates.push(previousState);
    this.context.currentState = transition.to;

    if (transition.action) {
      transition.action(this.context);
    }

    const notification: StateChangeNotification = {
      from: previousState,
      to: transition.to,
      event,
      timestamp: Date.now(),
      context: { ...this.context },
    };

    for (const listener of this.listeners) {
      listener(notification);
    }

    return true;
  }

  /** 获取当前状态 */
  getCurrentState(): ConversationState {
    return this.context.currentState;
  }

  /** 获取当前状态下可用的事件 */
  getAvailableEvents(): StateEvent[] {
    return this.transitions
      .filter(
        (t) =>
          t.from === this.context.currentState &&
          (!t.guard || t.guard(this.context))
      )
      .map((t) => t.event);
  }

  /** 检查某个事件是否可触发 */
  canDispatch(event: StateEvent): boolean {
    return this.transitions.some(
      (t) =>
        t.from === this.context.currentState &&
        t.event === event &&
        (!t.guard || t.guard(this.context))
    );
  }

  /** 注册状态变更监听器 */
  onStateChange(
    listener: (notification: StateChangeNotification) => void
  ): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  /** 获取上下文 */
  getContext(): Readonly<StateMachineContext> {
    return this.context;
  }

  /** 更新进度 */
  updateProgress(progress: number): void {
    this.context.taskProgress = Math.max(0, Math.min(100, progress));
  }

  /** 更新元数据 */
  updateMetadata(key: string, value: unknown): void {
    this.context.metadata[key] = value;
  }
}
```

### 22.3.3 ActionUndoManager：操作撤销管理

Agent 执行的操作可能产生副作用（如创建文件、发送消息、修改数据库）。`ActionUndoManager` 维护一个操作栈，支持撤销和重做，为用户提供"后悔药"：

```typescript
// ============================================================
// 操作撤销/重做管理器
// ============================================================

/** 可逆操作 */
interface ReversibleAction {
  id: string;
  type: string;
  description: string;
  timestamp: number;
  forward: () => Promise<ActionResult>;  // 执行操作
  backward: () => Promise<ActionResult>; // 撤销操作
  isReversible: boolean; // 是否可逆
  riskLevel: "low" | "medium" | "high" | "critical";
  affectedResources: string[];
}

/** 操作结果 */
interface ActionResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  sideEffects?: string[];
}

/** 操作组（将多个操作作为一个原子单元撤销） */
interface ActionGroup {
  id: string;
  label: string;
  actions: ReversibleAction[];
  timestamp: number;
}

/** 撤销管理器状态 */
interface UndoManagerState {
  undoStackSize: number;
  redoStackSize: number;
  canUndo: boolean;
  canRedo: boolean;
  lastAction?: { description: string; timestamp: number };
  irreversibleActions: number; // 不可逆操作数量
}

class ActionUndoManager {
  private undoStack: ActionGroup[] = [];
  private redoStack: ActionGroup[] = [];
  private readonly maxStackSize: number;
  private activeGroup: ReversibleAction[] | null = null;
  private activeGroupLabel: string = "";
  private onStateChange?: (state: UndoManagerState) => void;

  constructor(maxStackSize: number = 50) {
    this.maxStackSize = maxStackSize;
  }

  /** 设置状态变更回调 */
  setOnStateChange(callback: (state: UndoManagerState) => void): void {
    this.onStateChange = callback;
  }

  /** 开始一个操作组 */
  beginGroup(label: string): void {
    if (this.activeGroup) {
      throw new Error("已有活跃的操作组，请先提交或丢弃");
    }
    this.activeGroup = [];
    this.activeGroupLabel = label;
  }

  /** 在当前操作组中执行一个操作 */
  async execute(action: ReversibleAction): Promise<ActionResult> {
    const result = await action.forward();

    if (result.success) {
      if (this.activeGroup) {
        this.activeGroup.push(action);
      } else {
        // 单操作直接入栈
        this.pushToUndoStack({
          id: `group-${Date.now()}`,
          label: action.description,
          actions: [action],
          timestamp: Date.now(),
        });
      }
      // 新操作会清除 redo 栈
      this.redoStack = [];
    }

    this.notifyStateChange();
    return result;
  }

  /** 提交当前操作组 */
  commitGroup(): void {
    if (!this.activeGroup || this.activeGroup.length === 0) {
      this.activeGroup = null;
      return;
    }

    this.pushToUndoStack({
      id: `group-${Date.now()}`,
      label: this.activeGroupLabel,
      actions: [...this.activeGroup],
      timestamp: Date.now(),
    });

    this.activeGroup = null;
    this.activeGroupLabel = "";
    this.notifyStateChange();
  }

  /** 丢弃当前操作组（回滚已执行的操作） */
  async discardGroup(): Promise<void> {
    if (!this.activeGroup) return;

    // 逆序撤销已执行的操作
    for (let i = this.activeGroup.length - 1; i >= 0; i--) {
      const action = this.activeGroup[i];
      if (action.isReversible) {
        await action.backward();
      }
    }

    this.activeGroup = null;
    this.activeGroupLabel = "";
    this.notifyStateChange();
  }

  /** 撤销最近一组操作 */
  async undo(): Promise<ActionResult> {
    if (this.undoStack.length === 0) {
      return { success: false, message: "没有可撤销的操作" };
    }

    const group = this.undoStack.pop()!;

    // 检查是否所有操作都可逆
    const irreversibleActions = group.actions.filter((a) => !a.isReversible);
    if (irreversibleActions.length > 0) {
      // 将不可逆操作放回栈中
      this.undoStack.push(group);
      return {
        success: false,
        message: `无法撤销：包含 ${irreversibleActions.length} 个不可逆操作（${irreversibleActions.map((a) => a.description).join("、")}）`,
      };
    }

    // 逆序撤销所有操作
    const errors: string[] = [];
    for (let i = group.actions.length - 1; i >= 0; i--) {
      const action = group.actions[i];
      const result = await action.backward();
      if (!result.success) {
        errors.push(`撤销 "${action.description}" 失败: ${result.message}`);
      }
    }

    if (errors.length === 0) {
      this.redoStack.push(group);
      this.notifyStateChange();
      return {
        success: true,
        message: `已撤销: ${group.label}`,
      };
    } else {
      return {
        success: false,
        message: `部分撤销失败:\n${errors.join("\n")}`,
      };
    }
  }

  /** 重做最近一次撤销 */
  async redo(): Promise<ActionResult> {
    if (this.redoStack.length === 0) {
      return { success: false, message: "没有可重做的操作" };
    }

    const group = this.redoStack.pop()!;
    const errors: string[] = [];

    for (const action of group.actions) {
      const result = await action.forward();
      if (!result.success) {
        errors.push(`重做 "${action.description}" 失败: ${result.message}`);
      }
    }

    if (errors.length === 0) {
      this.undoStack.push(group);
      this.notifyStateChange();
      return {
        success: true,
        message: `已重做: ${group.label}`,
      };
    } else {
      return {
        success: false,
        message: `部分重做失败:\n${errors.join("\n")}`,
      };
    }
  }

  /** 获取撤销/重做状态 */
  getState(): UndoManagerState {
    const lastGroup =
      this.undoStack.length > 0
        ? this.undoStack[this.undoStack.length - 1]
        : undefined;

    return {
      undoStackSize: this.undoStack.length,
      redoStackSize: this.redoStack.length,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      lastAction: lastGroup
        ? { description: lastGroup.label, timestamp: lastGroup.timestamp }
        : undefined,
      irreversibleActions: this.undoStack.reduce(
        (count, group) =>
          count + group.actions.filter((a) => !a.isReversible).length,
        0
      ),
    };
  }

  /** 获取操作历史摘要 */
  getHistory(): Array<{
    label: string;
    timestamp: number;
    actionCount: number;
    reversible: boolean;
  }> {
    return this.undoStack.map((group) => ({
      label: group.label,
      timestamp: group.timestamp,
      actionCount: group.actions.length,
      reversible: group.actions.every((a) => a.isReversible),
    }));
  }

  private pushToUndoStack(group: ActionGroup): void {
    this.undoStack.push(group);
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }
  }

  private notifyStateChange(): void {
    if (this.onStateChange) {
      this.onStateChange(this.getState());
    }
  }
}
```

### 22.3.4 多轮澄清与确认模式

Agent 经常需要处理模糊的用户意图。以下是一套完整的多轮澄清（Clarification）和确认（Confirmation）模式：

```typescript
// ============================================================
// 多轮澄清与确认模式
// ============================================================

/** 澄清类型 */
type ClarificationType =
  | "ambiguity"     // 歧义消解："你说的X是A还是B？"
  | "missing_info"  // 信息补全："请提供Y的具体值"
  | "confirmation"  // 操作确认："即将执行Z，确认吗？"
  | "preference"    // 偏好选择："可以用方案A或B，你倾向哪个？"
  | "risk_warning"; // 风险提示："此操作不可逆，确定继续？"

interface ClarificationRequest {
  id: string;
  type: ClarificationType;
  question: string;
  options?: ClarificationOption[];
  defaultOption?: string;
  required: boolean;
  timeout?: number; // 超时自动选择默认值
  context: string;  // 触发澄清的上下文
  riskLevel: "low" | "medium" | "high" | "critical";
}

interface ClarificationOption {
  id: string;
  label: string;
  description?: string;
  isRecommended: boolean;
  riskLevel?: "low" | "medium" | "high" | "critical";
}

interface ClarificationResponse {
  requestId: string;
  selectedOptionId?: string;
  freeTextResponse?: string;
  timestamp: number;
  wasTimeout: boolean;
}

/** 确认策略：根据风险级别决定是否需要确认 */
interface ConfirmationPolicy {
  alwaysConfirm: ClarificationType[];
  confirmOnRisk: Record<string, "low" | "medium" | "high" | "critical">;
  autoApproveTimeout: Record<string, number>; // 类型→超时毫秒
  skipConfirmForExpert: boolean;
}

class ClarificationManager {
  private pendingRequests: Map<string, ClarificationRequest> = new Map();
  private responseHistory: ClarificationResponse[] = [];
  private policy: ConfirmationPolicy;
  private userExpertise: ExpertiseLevel;
  private onRequestCreated?: (request: ClarificationRequest) => void;
  private onAutoResolved?: (
    requestId: string,
    resolution: string
  ) => void;

  constructor(
    policy?: Partial<ConfirmationPolicy>,
    userExpertise: ExpertiseLevel = ExpertiseLevel.INTERMEDIATE
  ) {
    this.policy = {
      alwaysConfirm: ["risk_warning", "confirmation"],
      confirmOnRisk: {
        ambiguity: "low",
        missing_info: "low",
        confirmation: "medium",
        preference: "low",
        risk_warning: "low",
      },
      autoApproveTimeout: {
        ambiguity: 30000,
        preference: 30000,
      },
      skipConfirmForExpert: false,
      ...policy,
    };
    this.userExpertise = userExpertise;
  }

  /** 设置回调 */
  onRequest(callback: (request: ClarificationRequest) => void): void {
    this.onRequestCreated = callback;
  }

  onAutoResolve(
    callback: (requestId: string, resolution: string) => void
  ): void {
    this.onAutoResolved = callback;
  }

  /** 判断是否需要用户确认 */
  needsConfirmation(
    type: ClarificationType,
    riskLevel: ClarificationRequest["riskLevel"]
  ): boolean {
    // 高风险操作始终需要确认
    if (riskLevel === "critical" || riskLevel === "high") {
      return true;
    }

    // 策略中标记为始终确认的类型
    if (this.policy.alwaysConfirm.includes(type)) {
      return true;
    }

    // 专家用户可以跳过低风险确认
    if (
      this.policy.skipConfirmForExpert &&
      this.userExpertise >= ExpertiseLevel.EXPERT &&
      riskLevel === "low"
    ) {
      return false;
    }

    // 根据风险阈值判断
    const threshold = this.policy.confirmOnRisk[type];
    if (!threshold) return true;

    const riskRank: Record<string, number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };
    return riskRank[riskLevel] >= riskRank[threshold];
  }

  /** 创建澄清请求 */
  createRequest(
    type: ClarificationType,
    question: string,
    options?: ClarificationOption[],
    riskLevel: ClarificationRequest["riskLevel"] = "low"
  ): ClarificationRequest | null {
    if (!this.needsConfirmation(type, riskLevel)) {
      return null; // 不需要确认，Agent 自行决策
    }

    const request: ClarificationRequest = {
      id: `clarify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      question,
      options,
      defaultOption: options?.find((o) => o.isRecommended)?.id,
      required: riskLevel === "critical" || riskLevel === "high",
      timeout: this.policy.autoApproveTimeout[type],
      context: "",
      riskLevel,
    };

    this.pendingRequests.set(request.id, request);

    if (this.onRequestCreated) {
      this.onRequestCreated(request);
    }

    // 设置超时自动解决
    if (request.timeout && request.defaultOption && !request.required) {
      setTimeout(() => {
        if (this.pendingRequests.has(request.id)) {
          this.resolveWithDefault(request.id);
        }
      }, request.timeout);
    }

    return request;
  }

  /** 用户响应澄清请求 */
  respond(
    requestId: string,
    optionId?: string,
    freeText?: string
  ): boolean {
    const request = this.pendingRequests.get(requestId);
    if (!request) return false;

    const response: ClarificationResponse = {
      requestId,
      selectedOptionId: optionId,
      freeTextResponse: freeText,
      timestamp: Date.now(),
      wasTimeout: false,
    };

    this.responseHistory.push(response);
    this.pendingRequests.delete(requestId);
    return true;
  }

  /** 使用默认值自动解决 */
  private resolveWithDefault(requestId: string): void {
    const request = this.pendingRequests.get(requestId);
    if (!request || !request.defaultOption) return;

    const response: ClarificationResponse = {
      requestId,
      selectedOptionId: request.defaultOption,
      timestamp: Date.now(),
      wasTimeout: true,
    };

    this.responseHistory.push(response);
    this.pendingRequests.delete(requestId);

    if (this.onAutoResolved) {
      this.onAutoResolved(requestId, `自动选择默认值: ${request.defaultOption}`);
    }
  }

  /** 获取待处理请求数 */
  getPendingCount(): number {
    return this.pendingRequests.size;
  }

  /** 获取所有待处理请求 */
  getPendingRequests(): ClarificationRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  /** 更新用户专业度（影响确认策略） */
  updateUserExpertise(level: ExpertiseLevel): void {
    this.userExpertise = level;
  }
}
```

> **与第 3 章的联系：** 对话状态机的设计与第 3 章 Agent 架构总览中的"控制循环（Control Loop）"模式紧密对应。架构层的 ReAct/Plan-and-Execute 循环在体验层表现为状态机的状态转换，而用户的暂停、中断和撤销操作本质上是对控制循环的外部干预。

---


## 22.4 进度与透明度

### 22.4.1 为什么进度反馈至关重要

心理学研究表明，当用户不知道操作需要多长时间时，等待的感知时长会显著增加。在 Agent 系统中，一个任务可能涉及多次 LLM 调用、工具执行和中间推理——如果没有进度反馈，用户很快会失去耐心或误以为系统卡住了。

优秀的进度反馈应满足三个条件：
1. **层级化**：整体进度 → 当前阶段 → 当前步骤
2. **可预测**：基于历史数据的 ETA 估算
3. **信息丰富**：不仅展示"进行到哪了"，还展示"正在做什么"

### 22.4.2 EnhancedProgressTracker 实现

```typescript
// ============================================================
// 增强型进度追踪器：支持嵌套进度和动态 ETA
// ============================================================

/** 进度节点 */
interface ProgressNode {
  id: string;
  parentId: string | null;
  label: string;
  description: string;
  weight: number;      // 相对权重（用于计算父节点的加权进度）
  progress: number;    // 0-100
  status: "pending" | "active" | "completed" | "failed" | "skipped";
  startTime?: number;
  endTime?: number;
  estimatedDurationMs?: number;
  children: string[];  // 子节点 ID 列表
  metadata: Record<string, unknown>;
}

/** ETA 估算结果 */
interface ETAEstimation {
  estimatedRemainingMs: number;
  estimatedCompletionTime: Date;
  confidence: number; // 对 ETA 估算的置信度
  method: "moving_average" | "weighted_recent" | "historical" | "fallback";
}

/** 进度快照（用于 UI 渲染） */
interface ProgressSnapshot {
  overallProgress: number;   // 0-100
  currentPhase: string;
  currentStep: string;
  eta: ETAEstimation | null;
  phases: Array<{
    id: string;
    label: string;
    progress: number;
    status: ProgressNode["status"];
    stepCount: number;
    completedSteps: number;
  }>;
  activeSteps: Array<{
    id: string;
    label: string;
    description: string;
    progress: number;
    durationMs: number;
  }>;
  elapsedMs: number;
}

class EnhancedProgressTracker {
  private nodes: Map<string, ProgressNode> = new Map();
  private rootId: string;
  private startTime: number;
  private completionTimes: number[] = []; // 历史完成时间（用于 ETA）
  private onUpdate?: (snapshot: ProgressSnapshot) => void;

  constructor(rootLabel: string) {
    this.rootId = "root";
    this.startTime = Date.now();
    this.nodes.set(this.rootId, {
      id: this.rootId,
      parentId: null,
      label: rootLabel,
      description: "",
      weight: 1,
      progress: 0,
      status: "active",
      startTime: this.startTime,
      children: [],
      metadata: {},
    });
  }

  /** 设置更新回调 */
  onProgressUpdate(callback: (snapshot: ProgressSnapshot) => void): void {
    this.onUpdate = callback;
  }

  /** 添加阶段（顶层子节点） */
  addPhase(
    id: string,
    label: string,
    description: string = "",
    weight: number = 1,
    estimatedDurationMs?: number
  ): void {
    this.addNode(id, this.rootId, label, description, weight, estimatedDurationMs);
  }

  /** 添加步骤（阶段的子节点） */
  addStep(
    id: string,
    phaseId: string,
    label: string,
    description: string = "",
    weight: number = 1,
    estimatedDurationMs?: number
  ): void {
    this.addNode(id, phaseId, label, description, weight, estimatedDurationMs);
  }

  /** 添加节点 */
  private addNode(
    id: string,
    parentId: string,
    label: string,
    description: string,
    weight: number,
    estimatedDurationMs?: number
  ): void {
    const parent = this.nodes.get(parentId);
    if (!parent) {
      throw new Error(`父节点 ${parentId} 不存在`);
    }

    const node: ProgressNode = {
      id,
      parentId,
      label,
      description,
      weight,
      progress: 0,
      status: "pending",
      estimatedDurationMs,
      children: [],
      metadata: {},
    };

    this.nodes.set(id, node);
    parent.children.push(id);
  }

  /** 开始一个节点 */
  startNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    node.status = "active";
    node.startTime = Date.now();
    this.propagateProgress();
    this.notifyUpdate();
  }

  /** 更新节点进度 */
  updateNodeProgress(nodeId: string, progress: number): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    node.progress = Math.max(0, Math.min(100, progress));
    if (node.status === "pending") {
      node.status = "active";
      node.startTime = node.startTime ?? Date.now();
    }

    this.propagateProgress();
    this.notifyUpdate();
  }

  /** 完成一个节点 */
  completeNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    node.progress = 100;
    node.status = "completed";
    node.endTime = Date.now();

    if (node.startTime) {
      this.completionTimes.push(node.endTime - node.startTime);
      if (this.completionTimes.length > 100) {
        this.completionTimes = this.completionTimes.slice(-100);
      }
    }

    this.propagateProgress();
    this.notifyUpdate();
  }

  /** 标记节点失败 */
  failNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    node.status = "failed";
    node.endTime = Date.now();
    this.propagateProgress();
    this.notifyUpdate();
  }

  /** 跳过节点 */
  skipNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    node.status = "skipped";
    node.progress = 100; // 跳过视为完成
    node.endTime = Date.now();
    this.propagateProgress();
    this.notifyUpdate();
  }

  /** 自底向上传播进度 */
  private propagateProgress(): void {
    // 从叶子节点向上传播
    const visited = new Set<string>();

    const propagate = (nodeId: string): number => {
      if (visited.has(nodeId)) return this.nodes.get(nodeId)?.progress ?? 0;
      visited.add(nodeId);

      const node = this.nodes.get(nodeId);
      if (!node) return 0;

      if (node.children.length === 0) {
        return node.progress;
      }

      let totalWeight = 0;
      let weightedProgress = 0;

      for (const childId of node.children) {
        const child = this.nodes.get(childId);
        if (!child) continue;

        const childProgress = propagate(childId);
        totalWeight += child.weight;
        weightedProgress += childProgress * child.weight;
      }

      if (totalWeight > 0) {
        node.progress = weightedProgress / totalWeight;
      }

      return node.progress;
    };

    propagate(this.rootId);
  }

  /** 估算剩余时间 */
  estimateETA(): ETAEstimation | null {
    const root = this.nodes.get(this.rootId);
    if (!root || root.progress <= 0) return null;

    const elapsed = Date.now() - this.startTime;
    const progress = root.progress / 100;

    if (progress >= 1.0) {
      return {
        estimatedRemainingMs: 0,
        estimatedCompletionTime: new Date(),
        confidence: 1.0,
        method: "moving_average",
      };
    }

    // 方法1：基于整体进度线性外推
    const linearEstimate = (elapsed / progress) * (1 - progress);

    // 方法2：基于最近完成步骤的移动平均
    let movingAvgEstimate: number | null = null;
    if (this.completionTimes.length >= 3) {
      const recentTimes = this.completionTimes.slice(-5);
      const avgTime =
        recentTimes.reduce((a, b) => a + b, 0) / recentTimes.length;
      const remainingNodes = this.countRemainingNodes();
      movingAvgEstimate = avgTime * remainingNodes;
    }

    // 方法3：基于预估时长
    const estimateFromDurations = this.estimateFromNodeDurations();

    // 综合多种估算方法
    let finalEstimate: number;
    let confidence: number;
    let method: ETAEstimation["method"];

    if (movingAvgEstimate !== null && estimateFromDurations !== null) {
      finalEstimate =
        movingAvgEstimate * 0.4 +
        linearEstimate * 0.3 +
        estimateFromDurations * 0.3;
      confidence = 0.7;
      method = "moving_average";
    } else if (movingAvgEstimate !== null) {
      finalEstimate = movingAvgEstimate * 0.6 + linearEstimate * 0.4;
      confidence = 0.5;
      method = "weighted_recent";
    } else if (estimateFromDurations !== null) {
      finalEstimate = estimateFromDurations * 0.6 + linearEstimate * 0.4;
      confidence = 0.4;
      method = "historical";
    } else {
      finalEstimate = linearEstimate;
      confidence = 0.3;
      method = "fallback";
    }

    return {
      estimatedRemainingMs: Math.max(0, Math.round(finalEstimate)),
      estimatedCompletionTime: new Date(Date.now() + finalEstimate),
      confidence,
      method,
    };
  }

  /** 统计剩余未完成节点数 */
  private countRemainingNodes(): number {
    let count = 0;
    for (const node of this.nodes.values()) {
      if (
        node.children.length === 0 &&
        node.status !== "completed" &&
        node.status !== "skipped" &&
        node.status !== "failed"
      ) {
        count++;
      }
    }
    return count;
  }

  /** 基于预估时长估算 */
  private estimateFromNodeDurations(): number | null {
    let totalRemaining = 0;
    let hasEstimates = false;

    for (const node of this.nodes.values()) {
      if (
        node.children.length === 0 &&
        node.status !== "completed" &&
        node.status !== "skipped" &&
        node.estimatedDurationMs
      ) {
        const remaining =
          node.status === "active" && node.startTime
            ? Math.max(
                0,
                node.estimatedDurationMs - (Date.now() - node.startTime)
              )
            : node.estimatedDurationMs;
        totalRemaining += remaining;
        hasEstimates = true;
      }
    }

    return hasEstimates ? totalRemaining : null;
  }

  /** 生成进度快照 */
  getSnapshot(): ProgressSnapshot {
    const root = this.nodes.get(this.rootId)!;

    const phases: ProgressSnapshot["phases"] = [];
    const activeSteps: ProgressSnapshot["activeSteps"] = [];
    let currentPhase = "";
    let currentStep = "";

    for (const phaseId of root.children) {
      const phase = this.nodes.get(phaseId);
      if (!phase) continue;

      const completedSteps = phase.children.filter((cId) => {
        const c = this.nodes.get(cId);
        return c && (c.status === "completed" || c.status === "skipped");
      }).length;

      phases.push({
        id: phase.id,
        label: phase.label,
        progress: phase.progress,
        status: phase.status,
        stepCount: phase.children.length,
        completedSteps,
      });

      if (phase.status === "active") {
        currentPhase = phase.label;

        for (const stepId of phase.children) {
          const step = this.nodes.get(stepId);
          if (step && step.status === "active") {
            currentStep = step.label;
            activeSteps.push({
              id: step.id,
              label: step.label,
              description: step.description,
              progress: step.progress,
              durationMs: step.startTime ? Date.now() - step.startTime : 0,
            });
          }
        }
      }
    }

    return {
      overallProgress: root.progress,
      currentPhase,
      currentStep,
      eta: this.estimateETA(),
      phases,
      activeSteps,
      elapsedMs: Date.now() - this.startTime,
    };
  }

  /** 格式化进度为文本 */
  formatProgress(): string {
    const snapshot = this.getSnapshot();
    const lines: string[] = [];

    lines.push(
      `总进度: ${snapshot.overallProgress.toFixed(1)}% | ` +
      `耗时: ${this.formatDuration(snapshot.elapsedMs)}`
    );

    if (snapshot.eta) {
      lines.push(
        `预计剩余: ${this.formatDuration(snapshot.eta.estimatedRemainingMs)} ` +
        `(置信度: ${(snapshot.eta.confidence * 100).toFixed(0)}%)`
      );
    }

    lines.push("");

    for (const phase of snapshot.phases) {
      const icon =
        phase.status === "completed"
          ? "✓"
          : phase.status === "active"
            ? "▶"
            : phase.status === "failed"
              ? "✗"
              : "○";
      lines.push(
        `${icon} ${phase.label} [${phase.progress.toFixed(0)}%] ` +
        `(${phase.completedSteps}/${phase.stepCount} 步)`
      );
    }

    if (snapshot.activeSteps.length > 0) {
      lines.push("");
      lines.push("当前执行:");
      for (const step of snapshot.activeSteps) {
        lines.push(
          `  ▶ ${step.label}: ${step.description} ` +
          `[${step.progress.toFixed(0)}%] ` +
          `(${this.formatDuration(step.durationMs)})`
        );
      }
    }

    return lines.join("\n");
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  private notifyUpdate(): void {
    if (this.onUpdate) {
      this.onUpdate(this.getSnapshot());
    }
  }
}
```

### 22.4.3 TransparencyEngine：推理透明度引擎

用户不仅想知道 Agent "做了什么"，还想理解"为什么这样做"。`TransparencyEngine` 将 Agent 的内部推理过程以用户可理解的方式展示出来：

```typescript
// ============================================================
// 推理透明度引擎
// ============================================================

/** 推理步骤 */
interface ReasoningStep {
  id: string;
  type:
    | "observation"  // 观察到的事实
    | "inference"    // 推理/推断
    | "decision"     // 决策
    | "tool_use"     // 工具使用
    | "verification" // 验证
    | "revision";    // 修正
  content: string;
  shortSummary: string;
  confidence: number;
  evidence?: string[];
  timestamp: number;
  durationMs: number;
  parentStepId?: string;
}

/** 透明度级别 */
enum TransparencyLevel {
  MINIMAL = 1,   // 仅展示最终结论
  SUMMARY = 2,   // 展示关键决策摘要
  DETAILED = 3,  // 展示完整推理链
  DEBUG = 4,     // 展示原始推理数据
}

/** 推理链可视化输出 */
interface ReasoningChainView {
  summary: string;
  keyDecisions: Array<{
    decision: string;
    rationale: string;
    confidence: number;
    alternatives: string[];
  }>;
  steps: ReasoningStep[];
  totalSteps: number;
  displayedSteps: number;
}

class TransparencyEngine {
  private steps: ReasoningStep[] = [];
  private level: TransparencyLevel;
  private onStepAdded?: (step: ReasoningStep, view: ReasoningChainView) => void;

  constructor(level: TransparencyLevel = TransparencyLevel.SUMMARY) {
    this.level = level;
  }

  /** 设置透明度级别 */
  setLevel(level: TransparencyLevel): void {
    this.level = level;
  }

  /** 设置步骤回调 */
  onStep(
    callback: (step: ReasoningStep, view: ReasoningChainView) => void
  ): void {
    this.onStepAdded = callback;
  }

  /** 记录观察 */
  recordObservation(
    content: string,
    summary: string,
    evidence?: string[]
  ): ReasoningStep {
    return this.addStep("observation", content, summary, 1.0, evidence);
  }

  /** 记录推理 */
  recordInference(
    content: string,
    summary: string,
    confidence: number,
    evidence?: string[]
  ): ReasoningStep {
    return this.addStep("inference", content, summary, confidence, evidence);
  }

  /** 记录决策 */
  recordDecision(
    content: string,
    summary: string,
    confidence: number,
    evidence?: string[]
  ): ReasoningStep {
    return this.addStep("decision", content, summary, confidence, evidence);
  }

  /** 记录工具使用 */
  recordToolUse(
    content: string,
    summary: string,
    parentStepId?: string
  ): ReasoningStep {
    return this.addStep("tool_use", content, summary, 1.0, undefined, parentStepId);
  }

  /** 记录验证 */
  recordVerification(
    content: string,
    summary: string,
    confidence: number
  ): ReasoningStep {
    return this.addStep("verification", content, summary, confidence);
  }

  /** 记录修正 */
  recordRevision(
    content: string,
    summary: string,
    parentStepId: string
  ): ReasoningStep {
    return this.addStep("revision", content, summary, 0.8, undefined, parentStepId);
  }

  /** 添加步骤 */
  private addStep(
    type: ReasoningStep["type"],
    content: string,
    shortSummary: string,
    confidence: number,
    evidence?: string[],
    parentStepId?: string
  ): ReasoningStep {
    const step: ReasoningStep = {
      id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      content,
      shortSummary,
      confidence,
      evidence,
      timestamp: Date.now(),
      durationMs: 0,
      parentStepId,
    };

    this.steps.push(step);

    if (this.onStepAdded) {
      this.onStepAdded(step, this.getView());
    }

    return step;
  }

  /** 更新步骤耗时 */
  completeStep(stepId: string, durationMs: number): void {
    const step = this.steps.find((s) => s.id === stepId);
    if (step) {
      step.durationMs = durationMs;
    }
  }

  /** 获取推理链视图（根据当前透明度级别） */
  getView(): ReasoningChainView {
    const decisions = this.steps.filter((s) => s.type === "decision");

    const keyDecisions = decisions.map((d) => ({
      decision: d.shortSummary,
      rationale: d.content,
      confidence: d.confidence,
      alternatives: d.evidence ?? [],
    }));

    let displayedSteps: ReasoningStep[];
    let summary: string;

    switch (this.level) {
      case TransparencyLevel.MINIMAL:
        displayedSteps = [];
        summary = this.generateMinimalSummary();
        break;

      case TransparencyLevel.SUMMARY:
        displayedSteps = this.steps.filter(
          (s) => s.type === "decision" || s.type === "revision"
        );
        summary = this.generateSummarySummary();
        break;

      case TransparencyLevel.DETAILED:
        displayedSteps = [...this.steps];
        summary = this.generateDetailedSummary();
        break;

      case TransparencyLevel.DEBUG:
        displayedSteps = [...this.steps];
        summary = this.generateDebugSummary();
        break;
    }

    return {
      summary,
      keyDecisions,
      steps: displayedSteps,
      totalSteps: this.steps.length,
      displayedSteps: displayedSteps.length,
    };
  }

  /** 渲染推理链为文本 */
  renderAsText(): string {
    const view = this.getView();
    const lines: string[] = [];

    lines.push(`📋 ${view.summary}`);
    lines.push("");

    if (this.level >= TransparencyLevel.SUMMARY && view.keyDecisions.length > 0) {
      lines.push("关键决策:");
      for (const decision of view.keyDecisions) {
        const confidenceBar = this.renderConfidenceBar(decision.confidence);
        lines.push(`  → ${decision.decision} ${confidenceBar}`);
        if (this.level >= TransparencyLevel.DETAILED) {
          lines.push(`    原因: ${decision.rationale}`);
          if (decision.alternatives.length > 0) {
            lines.push(`    参考: ${decision.alternatives.join(", ")}`);
          }
        }
      }
    }

    if (this.level >= TransparencyLevel.DETAILED && view.steps.length > 0) {
      lines.push("");
      lines.push("推理步骤:");
      for (const step of view.steps) {
        const icon = this.getStepIcon(step.type);
        const duration =
          step.durationMs > 0 ? ` (${step.durationMs}ms)` : "";
        lines.push(`  ${icon} ${step.shortSummary}${duration}`);
        if (this.level >= TransparencyLevel.DEBUG) {
          lines.push(`     ${step.content}`);
        }
      }
    }

    return lines.join("\n");
  }

  private generateMinimalSummary(): string {
    const decisions = this.steps.filter((s) => s.type === "decision");
    if (decisions.length === 0) return "正在处理...";
    return decisions[decisions.length - 1].shortSummary;
  }

  private generateSummarySummary(): string {
    const total = this.steps.length;
    const decisions = this.steps.filter((s) => s.type === "decision").length;
    const tools = this.steps.filter((s) => s.type === "tool_use").length;
    return `经过 ${total} 步推理，做出 ${decisions} 个决策，使用 ${tools} 次工具`;
  }

  private generateDetailedSummary(): string {
    const typeCounts: Record<string, number> = {};
    for (const step of this.steps) {
      typeCounts[step.type] = (typeCounts[step.type] ?? 0) + 1;
    }

    const avgConfidence =
      this.steps.length > 0
        ? this.steps.reduce((sum, s) => sum + s.confidence, 0) /
          this.steps.length
        : 0;

    return (
      `推理过程: 观察 ${typeCounts["observation"] ?? 0} 次，` +
      `推理 ${typeCounts["inference"] ?? 0} 次，` +
      `决策 ${typeCounts["decision"] ?? 0} 次，` +
      `工具调用 ${typeCounts["tool_use"] ?? 0} 次，` +
      `验证 ${typeCounts["verification"] ?? 0} 次，` +
      `修正 ${typeCounts["revision"] ?? 0} 次 | ` +
      `平均置信度: ${(avgConfidence * 100).toFixed(0)}%`
    );
  }

  private generateDebugSummary(): string {
    const totalDuration = this.steps.reduce((s, st) => s + st.durationMs, 0);
    return `${this.generateDetailedSummary()} | 总耗时: ${totalDuration}ms`;
  }

  private renderConfidenceBar(confidence: number): string {
    const filled = Math.round(confidence * 5);
    const empty = 5 - filled;
    return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${(confidence * 100).toFixed(0)}%`;
  }

  private getStepIcon(type: ReasoningStep["type"]): string {
    switch (type) {
      case "observation":
        return "👁";
      case "inference":
        return "💭";
      case "decision":
        return "⚡";
      case "tool_use":
        return "🔧";
      case "verification":
        return "✅";
      case "revision":
        return "🔄";
    }
  }

  /** 清空推理历史 */
  clear(): void {
    this.steps = [];
  }
}
```

---


## 22.5 信任信号设计

### 22.5.1 多维度置信度

传统系统给出"置信度 85%"这样的单一数字，但 Agent 的输出通常包含多个可独立评估的维度。一个回答可能事实准确但不完整，或者信息全面但时效性存疑。我们需要将置信度分解为多个可感知的维度：

- **事实置信度（Factual Confidence）**：回答内容的事实准确性
- **完整度（Completeness）**：回答是否涵盖了用户问题的所有方面
- **时效性（Freshness）**：信息的时效性和更新状态
- **一致性（Consistency）**：与已知事实和上下文的一致程度

### 22.5.2 TrustSignalSystem 实现

```typescript
// ============================================================
// 信任信号系统：多维度置信度和来源管理
// ============================================================

/** 置信度维度 */
interface ConfidenceDimensions {
  factual: number;       // 0-1，事实准确性
  completeness: number;  // 0-1，完整度
  freshness: number;     // 0-1，时效性
  consistency: number;   // 0-1，一致性
}

/** 来源信息 */
interface SourceInfo {
  id: string;
  type: "authoritative" | "peer_reviewed" | "web" | "user_provided" | "generated" | "cached";
  title: string;
  url?: string;
  author?: string;
  publishDate?: Date;
  accessDate: Date;
  qualityScore: number;  // 0-1
  relevanceScore: number; // 0-1
  excerpt?: string;
}

/** 不确定性标记 */
interface UncertaintyMarker {
  spanStart: number;    // 在输出文本中的起始位置
  spanEnd: number;      // 结束位置
  uncertaintyLevel: "low" | "medium" | "high";
  reason: string;
  suggestedAction?: string;
}

/** 信任信号包 */
interface TrustSignalBundle {
  overallConfidence: number;
  dimensions: ConfidenceDimensions;
  sources: SourceInfo[];
  uncertaintyMarkers: UncertaintyMarker[];
  calibrationNote?: string; // 如"该领域历史准确率 78%"
  generatedAt: number;
}

/** 信任信号展示配置 */
interface TrustDisplayConfig {
  showOverallConfidence: boolean;
  showDimensionBreakdown: boolean;
  showSources: boolean;
  showUncertaintyHighlights: boolean;
  showCalibrationNote: boolean;
  confidenceFormat: "percentage" | "bar" | "verbal" | "color";
  minSourceQuality: number; // 只展示质量高于此阈值的来源
}

class TrustSignalSystem {
  private config: TrustDisplayConfig;
  private calibrator: ConfidenceCalibrator;
  private sourceRegistry: Map<string, SourceInfo> = new Map();

  constructor(
    config?: Partial<TrustDisplayConfig>,
    calibrator?: ConfidenceCalibrator
  ) {
    this.config = {
      showOverallConfidence: true,
      showDimensionBreakdown: false,
      showSources: true,
      showUncertaintyHighlights: true,
      showCalibrationNote: true,
      confidenceFormat: "verbal",
      minSourceQuality: 0.3,
      ...config,
    };

    this.calibrator = calibrator ?? new ConfidenceCalibrator();
  }

  /** 构建信任信号包 */
  buildTrustBundle(
    rawDimensions: ConfidenceDimensions,
    sources: SourceInfo[],
    responseText: string,
    domain?: string
  ): TrustSignalBundle {
    // 注册来源
    for (const source of sources) {
      this.sourceRegistry.set(source.id, source);
    }

    // 校准置信度
    const calibratedDimensions = this.calibrator.calibrate(
      rawDimensions,
      domain
    );

    // 计算整体置信度（加权平均）
    const overallConfidence =
      calibratedDimensions.factual * 0.35 +
      calibratedDimensions.completeness * 0.25 +
      calibratedDimensions.freshness * 0.2 +
      calibratedDimensions.consistency * 0.2;

    // 检测不确定性标记
    const uncertaintyMarkers = this.detectUncertaintyMarkers(
      responseText,
      calibratedDimensions
    );

    // 生成校准注释
    const calibrationNote = this.calibrator.getCalibrationNote(domain);

    return {
      overallConfidence,
      dimensions: calibratedDimensions,
      sources: sources.filter(
        (s) => s.qualityScore >= this.config.minSourceQuality
      ),
      uncertaintyMarkers,
      calibrationNote,
      generatedAt: Date.now(),
    };
  }

  /** 渲染信任信号为用户可见的文本 */
  renderTrustSignals(bundle: TrustSignalBundle): string {
    const parts: string[] = [];

    if (this.config.showOverallConfidence) {
      const formatted = this.formatConfidence(
        bundle.overallConfidence,
        this.config.confidenceFormat
      );
      parts.push(`置信度: ${formatted}`);
    }

    if (this.config.showDimensionBreakdown) {
      parts.push("");
      parts.push("置信度详情:");
      parts.push(
        `  事实准确性: ${this.formatConfidence(bundle.dimensions.factual, "bar")}`
      );
      parts.push(
        `  信息完整度: ${this.formatConfidence(bundle.dimensions.completeness, "bar")}`
      );
      parts.push(
        `  信息时效性: ${this.formatConfidence(bundle.dimensions.freshness, "bar")}`
      );
      parts.push(
        `  内部一致性: ${this.formatConfidence(bundle.dimensions.consistency, "bar")}`
      );
    }

    if (this.config.showSources && bundle.sources.length > 0) {
      parts.push("");
      parts.push(`参考来源 (${bundle.sources.length}):`);
      const sortedSources = [...bundle.sources].sort(
        (a, b) => b.qualityScore - a.qualityScore
      );
      for (const source of sortedSources.slice(0, 5)) {
        const qualityLabel = this.getSourceQualityLabel(source.qualityScore);
        const urlStr = source.url ? ` - ${source.url}` : "";
        parts.push(`  [${qualityLabel}] ${source.title}${urlStr}`);
      }
      if (sortedSources.length > 5) {
        parts.push(`  ... 及其他 ${sortedSources.length - 5} 个来源`);
      }
    }

    if (
      this.config.showUncertaintyHighlights &&
      bundle.uncertaintyMarkers.length > 0
    ) {
      const highUncertainty = bundle.uncertaintyMarkers.filter(
        (m) => m.uncertaintyLevel === "high"
      );
      if (highUncertainty.length > 0) {
        parts.push("");
        parts.push("⚠ 以下内容不确定性较高:");
        for (const marker of highUncertainty) {
          parts.push(`  - ${marker.reason}`);
          if (marker.suggestedAction) {
            parts.push(`    建议: ${marker.suggestedAction}`);
          }
        }
      }
    }

    if (this.config.showCalibrationNote && bundle.calibrationNote) {
      parts.push("");
      parts.push(`📊 ${bundle.calibrationNote}`);
    }

    return parts.join("\n");
  }

  /** 格式化置信度 */
  private formatConfidence(
    confidence: number,
    format: TrustDisplayConfig["confidenceFormat"]
  ): string {
    switch (format) {
      case "percentage":
        return `${(confidence * 100).toFixed(0)}%`;

      case "bar": {
        const filled = Math.round(confidence * 10);
        const empty = 10 - filled;
        return `${"█".repeat(filled)}${"░".repeat(empty)} ${(confidence * 100).toFixed(0)}%`;
      }

      case "verbal":
        if (confidence >= 0.9) return "非常确信";
        if (confidence >= 0.75) return "较为确信";
        if (confidence >= 0.6) return "有一定把握";
        if (confidence >= 0.4) return "不太确定";
        return "高度不确定";

      case "color":
        if (confidence >= 0.8) return `🟢 ${(confidence * 100).toFixed(0)}%`;
        if (confidence >= 0.6) return `🟡 ${(confidence * 100).toFixed(0)}%`;
        return `🔴 ${(confidence * 100).toFixed(0)}%`;
    }
  }

  /** 检测不确定性标记 */
  private detectUncertaintyMarkers(
    text: string,
    dimensions: ConfidenceDimensions
  ): UncertaintyMarker[] {
    const markers: UncertaintyMarker[] = [];

    // 检测模糊语言
    const hedgePatterns = [
      { pattern: /可能|也许|大概|似乎|或许/g, level: "medium" as const },
      { pattern: /不确定|不清楚|尚未确认|待验证/g, level: "high" as const },
      { pattern: /据说|有人认为|一般认为/g, level: "medium" as const },
    ];

    for (const { pattern, level } of hedgePatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        markers.push({
          spanStart: match.index,
          spanEnd: match.index + match[0].length,
          uncertaintyLevel: level,
          reason: `使用了不确定表述"${match[0]}"`,
          suggestedAction: "建议通过权威来源验证此信息",
        });
      }
    }

    // 基于维度评分添加全局不确定性标记
    if (dimensions.freshness < 0.5) {
      markers.push({
        spanStart: 0,
        spanEnd: 0,
        uncertaintyLevel: "medium",
        reason: "信息时效性较低，可能已过时",
        suggestedAction: "建议查阅最新资料确认",
      });
    }

    if (dimensions.completeness < 0.5) {
      markers.push({
        spanStart: 0,
        spanEnd: 0,
        uncertaintyLevel: "medium",
        reason: "回答可能不够完整，未覆盖所有相关方面",
        suggestedAction: "可以追问具体方面以获取更详细信息",
      });
    }

    return markers;
  }

  /** 获取来源质量标签 */
  private getSourceQualityLabel(quality: number): string {
    if (quality >= 0.9) return "权威";
    if (quality >= 0.7) return "可靠";
    if (quality >= 0.5) return "一般";
    return "参考";
  }
}
```

### 22.5.3 ConfidenceCalibrator：置信度校准器

LLM 通常存在 **过度自信（Overconfidence）** 问题——它声称 90% 确信的内容，实际准确率可能只有 70%。`ConfidenceCalibrator` 基于历史数据对原始置信度进行校准：

```typescript
// ============================================================
// 置信度校准器：基于历史准确率校准 Agent 置信度
// ============================================================

/** 校准数据点 */
interface CalibrationDataPoint {
  predictedConfidence: number;  // Agent 声称的置信度
  actualCorrectness: boolean;   // 实际是否正确
  domain: string;
  timestamp: number;
}

/** 校准曲线（分箱统计） */
interface CalibrationCurve {
  bins: Array<{
    predictedRange: [number, number]; // 预测置信度范围
    actualAccuracy: number;           // 实际准确率
    sampleCount: number;
  }>;
  expectedCalibrationError: number;   // ECE 指标
  maxCalibrationError: number;        // MCE 指标
}

class ConfidenceCalibrator {
  private dataPoints: CalibrationDataPoint[] = [];
  private domainCurves: Map<string, CalibrationCurve> = new Map();
  private readonly binCount = 10;
  private readonly minSamplesForCalibration = 20;

  /** 添加校准数据点 */
  addDataPoint(
    predictedConfidence: number,
    actualCorrectness: boolean,
    domain: string = "general"
  ): void {
    this.dataPoints.push({
      predictedConfidence,
      actualCorrectness,
      domain,
      timestamp: Date.now(),
    });

    // 每 50 个数据点重新计算校准曲线
    const domainPoints = this.dataPoints.filter((d) => d.domain === domain);
    if (domainPoints.length % 50 === 0) {
      this.recalibrate(domain);
    }
  }

  /** 校准置信度维度 */
  calibrate(
    raw: ConfidenceDimensions,
    domain?: string
  ): ConfidenceDimensions {
    const curve = domain ? this.domainCurves.get(domain) : undefined;

    if (!curve) {
      // 没有足够数据，使用保守校准（降低过高置信度）
      return {
        factual: this.conservativeCalibrate(raw.factual),
        completeness: this.conservativeCalibrate(raw.completeness),
        freshness: raw.freshness, // 时效性不需要校准
        consistency: this.conservativeCalibrate(raw.consistency),
      };
    }

    return {
      factual: this.applyCalibrationCurve(raw.factual, curve),
      completeness: this.applyCalibrationCurve(raw.completeness, curve),
      freshness: raw.freshness,
      consistency: this.applyCalibrationCurve(raw.consistency, curve),
    };
  }

  /** 保守校准：拉向中间值 */
  private conservativeCalibrate(raw: number): number {
    // Platt scaling 的简化版本：向 0.5 收缩
    const shrinkFactor = 0.3;
    return raw * (1 - shrinkFactor) + 0.5 * shrinkFactor;
  }

  /** 应用校准曲线 */
  private applyCalibrationCurve(
    predicted: number,
    curve: CalibrationCurve
  ): number {
    // 找到预测值所在的分箱
    for (const bin of curve.bins) {
      if (
        predicted >= bin.predictedRange[0] &&
        predicted < bin.predictedRange[1]
      ) {
        if (bin.sampleCount >= 5) {
          return bin.actualAccuracy;
        }
        break;
      }
    }

    // 分箱样本不足，使用线性插值
    return this.conservativeCalibrate(predicted);
  }

  /** 重新计算校准曲线 */
  private recalibrate(domain: string): void {
    const points = this.dataPoints.filter((d) => d.domain === domain);
    if (points.length < this.minSamplesForCalibration) return;

    const binSize = 1.0 / this.binCount;
    const bins: CalibrationCurve["bins"] = [];

    for (let i = 0; i < this.binCount; i++) {
      const lower = i * binSize;
      const upper = (i + 1) * binSize;
      const binPoints = points.filter(
        (p) =>
          p.predictedConfidence >= lower && p.predictedConfidence < upper
      );

      const correctCount = binPoints.filter(
        (p) => p.actualCorrectness
      ).length;
      const accuracy =
        binPoints.length > 0 ? correctCount / binPoints.length : 0;

      bins.push({
        predictedRange: [lower, upper],
        actualAccuracy: accuracy,
        sampleCount: binPoints.length,
      });
    }

    // 计算 ECE（Expected Calibration Error）
    let ece = 0;
    let mce = 0;
    for (const bin of bins) {
      if (bin.sampleCount > 0) {
        const midpoint =
          (bin.predictedRange[0] + bin.predictedRange[1]) / 2;
        const error = Math.abs(bin.actualAccuracy - midpoint);
        ece += error * (bin.sampleCount / points.length);
        mce = Math.max(mce, error);
      }
    }

    this.domainCurves.set(domain, {
      bins,
      expectedCalibrationError: ece,
      maxCalibrationError: mce,
    });
  }

  /** 获取校准注释 */
  getCalibrationNote(domain?: string): string | undefined {
    if (!domain) return undefined;

    const curve = this.domainCurves.get(domain);
    if (!curve) return undefined;

    const totalSamples = curve.bins.reduce(
      (sum, b) => sum + b.sampleCount,
      0
    );

    if (curve.expectedCalibrationError < 0.05) {
      return `该领域的置信度校准良好（ECE=${(curve.expectedCalibrationError * 100).toFixed(1)}%，基于 ${totalSamples} 条历史数据）`;
    }

    if (curve.expectedCalibrationError < 0.15) {
      return `该领域的置信度略有偏差（ECE=${(curve.expectedCalibrationError * 100).toFixed(1)}%），建议对高置信度结果也保持审慎`;
    }

    return `该领域的置信度偏差较大（ECE=${(curve.expectedCalibrationError * 100).toFixed(1)}%），建议独立验证重要结论`;
  }

  /** 获取校准曲线（用于可视化） */
  getCalibrationCurve(domain: string): CalibrationCurve | undefined {
    return this.domainCurves.get(domain);
  }

  /** 获取所有领域的校准统计 */
  getAllDomainStats(): Array<{
    domain: string;
    ece: number;
    mce: number;
    sampleCount: number;
  }> {
    const stats: Array<{
      domain: string;
      ece: number;
      mce: number;
      sampleCount: number;
    }> = [];

    for (const [domain, curve] of this.domainCurves.entries()) {
      stats.push({
        domain,
        ece: curve.expectedCalibrationError,
        mce: curve.maxCalibrationError,
        sampleCount: curve.bins.reduce((s, b) => s + b.sampleCount, 0),
      });
    }

    return stats.sort((a, b) => b.ece - a.ece);
  }
}
```

> **与第 14 章的联系：** 信任信号设计是第 14 章"Agent 信任架构"在交互层的具体实现。第 14 章定义了信任的评估维度和计算框架，本节则关注如何将这些技术指标转换为用户可感知、可理解的信任信号。置信度校准器确保 Agent 传递给用户的信任信号是经过校准的、负责任的——既不过度夸大能力，也不过度保守。

---


## 22.6 失败体验设计

### 22.6.1 Agent 错误分类

Agent 系统的错误模式比传统软件复杂得多。我们将 Agent 错误分为六大类：

| 错误类别 | 典型场景 | 用户感知 | 恢复难度 |
|---------|---------|---------|---------|
| **LLM 错误** | 幻觉、逻辑谬误、指令不遵循 | 输出看似合理但实际错误 | 高（需人工验证） |
| **工具失败** | API 超时、权限不足、服务不可用 | 明确的操作失败 | 中（通常可重试） |
| **超时** | LLM 响应慢、复杂任务耗时过长 | 长时间无响应 | 低（重试即可） |
| **歧义** | 用户意图不明、多义词、上下文不足 | Agent 做了不符合期望的事 | 中（需要澄清） |
| **预算耗尽** | Token 用量超限、API 调用次数到上限 | 任务中途停止 | 高（需付费或等待） |
| **安全拒绝** | 触发内容策略、越权操作被拦截 | 请求被拒绝 | 中（需调整请求） |

### 22.6.2 ErrorExperienceManager 实现

```typescript
// ============================================================
// 错误体验管理器
// ============================================================

/** 错误类别 */
type AgentErrorCategory =
  | "llm_error"
  | "tool_failure"
  | "timeout"
  | "ambiguity"
  | "budget_exhausted"
  | "safety_rejection"
  | "network_error"
  | "permission_denied"
  | "rate_limited"
  | "unknown";

/** Agent 错误 */
interface AgentError {
  id: string;
  category: AgentErrorCategory;
  originalError: Error | string;
  context: {
    taskDescription: string;
    currentStep: string;
    attemptNumber: number;
    elapsedMs: number;
  };
  timestamp: number;
}

/** 用户友好的错误信息 */
interface UserFriendlyError {
  title: string;
  description: string;
  icon: string;
  severity: "info" | "warning" | "error" | "critical";
  recoveryActions: RecoveryAction[];
  technicalDetail?: string; // 展开可见
  relatedDocs?: string[];
}

/** 恢复操作 */
interface RecoveryAction {
  id: string;
  label: string;
  description: string;
  type: "retry" | "modify" | "alternative" | "escalate" | "wait";
  isPrimary: boolean;
  action: () => Promise<void>;
  estimatedWaitMs?: number;
}

/** 错误模板 */
interface ErrorTemplate {
  category: AgentErrorCategory;
  titleTemplate: string;
  descriptionTemplate: string;
  icon: string;
  severity: UserFriendlyError["severity"];
  defaultRecoveryTypes: RecoveryAction["type"][];
}

class ErrorExperienceManager {
  private templates: Map<AgentErrorCategory, ErrorTemplate> = new Map();
  private errorHistory: AgentError[] = [];
  private recoveryEngine: RecoverySuggestionEngine;
  private onError?: (error: UserFriendlyError) => void;

  constructor(recoveryEngine?: RecoverySuggestionEngine) {
    this.recoveryEngine =
      recoveryEngine ?? new RecoverySuggestionEngine();
    this.registerDefaultTemplates();
  }

  /** 设置错误回调 */
  setOnError(callback: (error: UserFriendlyError) => void): void {
    this.onError = callback;
  }

  /** 注册默认错误模板 */
  private registerDefaultTemplates(): void {
    const templates: ErrorTemplate[] = [
      {
        category: "llm_error",
        titleTemplate: "AI 理解出现偏差",
        descriptionTemplate:
          "在处理您的请求时，AI 的理解可能与您的期望不完全一致。" +
          "这通常发生在复杂或多义性的指令中。",
        icon: "🤔",
        severity: "warning",
        defaultRecoveryTypes: ["modify", "retry", "alternative"],
      },
      {
        category: "tool_failure",
        titleTemplate: "外部服务调用失败",
        descriptionTemplate:
          "在执行 {step} 时，依赖的外部服务返回了错误。" +
          "这可能是暂时性的问题。",
        icon: "🔧",
        severity: "error",
        defaultRecoveryTypes: ["retry", "alternative", "wait"],
      },
      {
        category: "timeout",
        titleTemplate: "处理时间过长",
        descriptionTemplate:
          "您的请求处理时间超过了预期。这可能因为任务复杂度较高" +
          "或服务负载较大。已完成的部分结果已保存。",
        icon: "⏱",
        severity: "warning",
        defaultRecoveryTypes: ["retry", "modify", "wait"],
      },
      {
        category: "ambiguity",
        titleTemplate: "需要更多信息",
        descriptionTemplate:
          "您的请求存在多种理解方式，我需要更多信息来准确执行。" +
          "请查看下方选项或提供更具体的描述。",
        icon: "❓",
        severity: "info",
        defaultRecoveryTypes: ["modify"],
      },
      {
        category: "budget_exhausted",
        titleTemplate: "使用额度已达上限",
        descriptionTemplate:
          "本次任务的处理资源已达到上限。" +
          "已完成的结果已保存，您可以稍后继续或调整任务范围。",
        icon: "📊",
        severity: "warning",
        defaultRecoveryTypes: ["modify", "wait", "escalate"],
      },
      {
        category: "safety_rejection",
        titleTemplate: "请求无法处理",
        descriptionTemplate:
          "出于安全策略限制，部分请求内容无法处理。" +
          "请调整您的请求内容后重试。",
        icon: "🛡",
        severity: "error",
        defaultRecoveryTypes: ["modify"],
      },
      {
        category: "network_error",
        titleTemplate: "网络连接问题",
        descriptionTemplate:
          "无法连接到所需的服务。请检查网络连接后重试。",
        icon: "🌐",
        severity: "error",
        defaultRecoveryTypes: ["retry", "wait"],
      },
      {
        category: "permission_denied",
        titleTemplate: "权限不足",
        descriptionTemplate:
          "执行此操作需要额外的权限。" +
          "请确认已授权必要的访问权限。",
        icon: "🔒",
        severity: "error",
        defaultRecoveryTypes: ["escalate", "modify"],
      },
      {
        category: "rate_limited",
        titleTemplate: "请求频率受限",
        descriptionTemplate:
          "请求频率超过了服务限制。系统将在短暂等待后自动重试。",
        icon: "🚦",
        severity: "warning",
        defaultRecoveryTypes: ["wait", "retry"],
      },
      {
        category: "unknown",
        titleTemplate: "遇到了意外问题",
        descriptionTemplate:
          "处理过程中遇到了未预期的错误。" +
          "我们已记录此问题，您可以重试或联系支持团队。",
        icon: "⚠",
        severity: "error",
        defaultRecoveryTypes: ["retry", "escalate"],
      },
    ];

    for (const template of templates) {
      this.templates.set(template.category, template);
    }
  }

  /** 处理错误并生成用户友好信息 */
  handleError(error: AgentError): UserFriendlyError {
    this.errorHistory.push(error);

    const template =
      this.templates.get(error.category) ??
      this.templates.get("unknown")!;

    // 生成恢复建议
    const recoveryActions = this.recoveryEngine.suggestRecovery(
      error,
      this.errorHistory
    );

    const description = template.descriptionTemplate.replace(
      "{step}",
      error.context.currentStep
    );

    const userError: UserFriendlyError = {
      title: template.titleTemplate,
      description,
      icon: template.icon,
      severity: template.severity,
      recoveryActions,
      technicalDetail: this.formatTechnicalDetail(error),
      relatedDocs: this.getRelatedDocs(error.category),
    };

    if (this.onError) {
      this.onError(userError);
    }

    return userError;
  }

  /** 格式化技术详情（给高级用户看） */
  private formatTechnicalDetail(error: AgentError): string {
    const original =
      error.originalError instanceof Error
        ? error.originalError.message
        : String(error.originalError);

    return (
      `错误类别: ${error.category}\n` +
      `当前步骤: ${error.context.currentStep}\n` +
      `尝试次数: ${error.context.attemptNumber}\n` +
      `已耗时: ${error.context.elapsedMs}ms\n` +
      `原始错误: ${original}\n` +
      `时间戳: ${new Date(error.timestamp).toISOString()}`
    );
  }

  /** 获取相关文档链接 */
  private getRelatedDocs(category: AgentErrorCategory): string[] {
    const docs: Record<AgentErrorCategory, string[]> = {
      llm_error: ["如何编写更清晰的指令", "Agent 输出验证最佳实践"],
      tool_failure: ["工具配置指南", "API 故障排查手册"],
      timeout: ["任务复杂度管理", "分步执行策略"],
      ambiguity: ["有效的 Agent 交互技巧", "意图表达最佳实践"],
      budget_exhausted: ["资源用量管理", "任务优化建议"],
      safety_rejection: ["安全策略说明", "合规使用指南"],
      network_error: ["网络配置指南"],
      permission_denied: ["权限管理手册", "OAuth 配置指南"],
      rate_limited: ["API 限流策略说明"],
      unknown: ["常见问题排查", "联系技术支持"],
    };
    return docs[category] ?? [];
  }

  /** 获取错误统计 */
  getErrorStats(windowMs: number = 3600000): Record<AgentErrorCategory, number> {
    const cutoff = Date.now() - windowMs;
    const recentErrors = this.errorHistory.filter(
      (e) => e.timestamp >= cutoff
    );

    const stats: Record<string, number> = {};
    for (const error of recentErrors) {
      stats[error.category] = (stats[error.category] ?? 0) + 1;
    }
    return stats as Record<AgentErrorCategory, number>;
  }
}
```

### 22.6.3 RecoverySuggestionEngine：恢复建议引擎

```typescript
// ============================================================
// 恢复建议引擎：根据错误上下文提出替代方案
// ============================================================

class RecoverySuggestionEngine {
  private retryDelays: Map<string, number> = new Map();
  private readonly maxAutoRetries = 3;

  /** 根据错误生成恢复建议 */
  suggestRecovery(
    error: AgentError,
    errorHistory: AgentError[]
  ): RecoveryAction[] {
    const actions: RecoveryAction[] = [];

    switch (error.category) {
      case "llm_error":
        actions.push(
          this.createRetryWithModification(error),
          this.createRephrase(error),
          this.createBreakdownTask(error)
        );
        break;

      case "tool_failure":
        actions.push(
          ...this.createToolFailureRecovery(error, errorHistory)
        );
        break;

      case "timeout":
        actions.push(
          this.createRetryAction(error, "重试（使用更长超时）"),
          this.createSimplifyAction(error),
          this.createBreakdownTask(error)
        );
        break;

      case "ambiguity":
        actions.push(this.createClarifyAction(error));
        break;

      case "budget_exhausted":
        actions.push(
          this.createScopeReductionAction(error),
          this.createWaitAction(error, "等待额度重置"),
          this.createEscalateAction(error)
        );
        break;

      case "safety_rejection":
        actions.push(this.createModifyRequestAction(error));
        break;

      case "network_error":
      case "rate_limited":
        actions.push(
          this.createAutoRetryAction(error, errorHistory),
          this.createWaitAction(error, "稍后重试")
        );
        break;

      case "permission_denied":
        actions.push(
          this.createRequestPermissionAction(error),
          this.createAlternativeApproachAction(error)
        );
        break;

      default:
        actions.push(
          this.createRetryAction(error, "重试"),
          this.createEscalateAction(error)
        );
    }

    // 标记主要操作
    if (actions.length > 0) {
      actions[0].isPrimary = true;
    }

    return actions;
  }

  /** 创建带修改的重试 */
  private createRetryWithModification(error: AgentError): RecoveryAction {
    return {
      id: `retry-mod-${error.id}`,
      label: "使用更详细指令重试",
      description: "提供更具体的指令和约束条件，帮助 AI 更准确地理解您的需求",
      type: "modify",
      isPrimary: false,
      action: async () => {
        console.log("等待用户提供更详细的指令...");
      },
    };
  }

  /** 创建重新表述 */
  private createRephrase(error: AgentError): RecoveryAction {
    return {
      id: `rephrase-${error.id}`,
      label: "换一种方式描述",
      description: "用不同的措辞重新表达您的需求",
      type: "modify",
      isPrimary: false,
      action: async () => {
        console.log("提示用户用不同方式描述需求...");
      },
    };
  }

  /** 创建任务拆分 */
  private createBreakdownTask(error: AgentError): RecoveryAction {
    return {
      id: `breakdown-${error.id}`,
      label: "将任务分解为更小的步骤",
      description:
        "将复杂任务拆分为多个简单步骤逐个执行，" +
        "每步完成后确认再继续",
      type: "alternative",
      isPrimary: false,
      action: async () => {
        console.log("开始任务拆分引导...");
      },
    };
  }

  /** 创建工具失败恢复 */
  private createToolFailureRecovery(
    error: AgentError,
    history: AgentError[]
  ): RecoveryAction[] {
    const actions: RecoveryAction[] = [];

    // 检查是否频繁失败（可能需要换工具）
    const recentToolFailures = history.filter(
      (e) =>
        e.category === "tool_failure" &&
        e.timestamp > Date.now() - 300000
    );

    if (recentToolFailures.length < 3) {
      actions.push(this.createAutoRetryAction(error, history));
    }

    actions.push({
      id: `alt-tool-${error.id}`,
      label: "使用替代方案",
      description: "尝试使用不同的工具或方法完成相同的任务",
      type: "alternative",
      isPrimary: false,
      action: async () => {
        console.log("切换到替代工具...");
      },
    });

    actions.push({
      id: `skip-${error.id}`,
      label: "跳过此步骤",
      description: "跳过失败的步骤，继续执行后续任务（可能影响结果完整性）",
      type: "alternative",
      isPrimary: false,
      action: async () => {
        console.log("跳过当前步骤...");
      },
    });

    return actions;
  }

  /** 创建自动重试（带退避） */
  private createAutoRetryAction(
    error: AgentError,
    history: AgentError[]
  ): RecoveryAction {
    const key = `${error.category}-${error.context.currentStep}`;
    const currentDelay = this.retryDelays.get(key) ?? 1000;
    const nextDelay = Math.min(currentDelay * 2, 30000);
    this.retryDelays.set(key, nextDelay);

    const canAutoRetry = error.context.attemptNumber < this.maxAutoRetries;

    return {
      id: `auto-retry-${error.id}`,
      label: canAutoRetry
        ? `自动重试（${(currentDelay / 1000).toFixed(0)}s 后）`
        : "手动重试",
      description: canAutoRetry
        ? `系统将在 ${(currentDelay / 1000).toFixed(0)} 秒后自动重试`
        : `已超过自动重试次数(${this.maxAutoRetries})，请手动触发重试`,
      type: "retry",
      isPrimary: true,
      estimatedWaitMs: currentDelay,
      action: async () => {
        if (canAutoRetry) {
          await new Promise((resolve) => setTimeout(resolve, currentDelay));
        }
        console.log("执行重试...");
      },
    };
  }

  /** 创建重试操作 */
  private createRetryAction(
    error: AgentError,
    label: string
  ): RecoveryAction {
    return {
      id: `retry-${error.id}`,
      label,
      description: "使用相同参数重新执行该操作",
      type: "retry",
      isPrimary: false,
      action: async () => {
        console.log("执行重试...");
      },
    };
  }

  /** 创建简化操作 */
  private createSimplifyAction(error: AgentError): RecoveryAction {
    return {
      id: `simplify-${error.id}`,
      label: "简化任务",
      description: "减少任务的复杂度和范围，以缩短处理时间",
      type: "modify",
      isPrimary: false,
      action: async () => {
        console.log("引导用户简化任务...");
      },
    };
  }

  /** 创建等待操作 */
  private createWaitAction(
    error: AgentError,
    label: string
  ): RecoveryAction {
    return {
      id: `wait-${error.id}`,
      label,
      description: "等待一段时间后重试",
      type: "wait",
      isPrimary: false,
      estimatedWaitMs: 60000,
      action: async () => {
        console.log("设置定时重试提醒...");
      },
    };
  }

  /** 创建升级操作 */
  private createEscalateAction(error: AgentError): RecoveryAction {
    return {
      id: `escalate-${error.id}`,
      label: "联系支持团队",
      description: "将问题升级给人工支持团队处理",
      type: "escalate",
      isPrimary: false,
      action: async () => {
        console.log("创建支持工单...");
      },
    };
  }

  /** 创建澄清操作 */
  private createClarifyAction(error: AgentError): RecoveryAction {
    return {
      id: `clarify-${error.id}`,
      label: "提供更多细节",
      description: "补充关键信息以消除歧义",
      type: "modify",
      isPrimary: true,
      action: async () => {
        console.log("请求用户提供更多上下文...");
      },
    };
  }

  /** 创建缩小范围操作 */
  private createScopeReductionAction(error: AgentError): RecoveryAction {
    return {
      id: `reduce-scope-${error.id}`,
      label: "缩小任务范围",
      description: "减少任务的处理范围以节省资源",
      type: "modify",
      isPrimary: true,
      action: async () => {
        console.log("引导用户缩小范围...");
      },
    };
  }

  /** 创建请求权限操作 */
  private createRequestPermissionAction(error: AgentError): RecoveryAction {
    return {
      id: `req-perm-${error.id}`,
      label: "请求所需权限",
      description: "引导您完成必要的权限授权",
      type: "escalate",
      isPrimary: true,
      action: async () => {
        console.log("引导权限授权流程...");
      },
    };
  }

  /** 创建修改请求操作 */
  private createModifyRequestAction(error: AgentError): RecoveryAction {
    return {
      id: `modify-req-${error.id}`,
      label: "调整请求内容",
      description: "修改请求中的敏感部分后重新提交",
      type: "modify",
      isPrimary: true,
      action: async () => {
        console.log("引导用户修改请求...");
      },
    };
  }

  /** 创建替代方案操作 */
  private createAlternativeApproachAction(
    error: AgentError
  ): RecoveryAction {
    return {
      id: `alt-approach-${error.id}`,
      label: "使用替代方法",
      description: "使用不需要额外权限的替代方法完成任务",
      type: "alternative",
      isPrimary: false,
      action: async () => {
        console.log("切换到替代方案...");
      },
    };
  }
}
```

### 22.6.4 优雅降级策略

当核心服务（如 LLM API）完全不可用时，Agent 不应完全瘫痪。以下是优雅降级的分层策略：

```typescript
// ============================================================
// 优雅降级策略管理器
// ============================================================

/** 降级级别 */
enum DegradationLevel {
  FULL_SERVICE = 0,       // 全功能可用
  REDUCED_CAPABILITY = 1, // 部分功能降级
  CACHED_RESPONSES = 2,   // 使用缓存响应
  STATIC_FALLBACK = 3,    // 静态兜底
  HUMAN_HANDOFF = 4,      // 人工接管
}

/** 服务健康状态 */
interface ServiceHealth {
  serviceName: string;
  isAvailable: boolean;
  latencyMs: number;
  errorRate: number;
  lastChecked: number;
}

class GracefulDegradationManager {
  private currentLevel: DegradationLevel = DegradationLevel.FULL_SERVICE;
  private serviceHealth: Map<string, ServiceHealth> = new Map();
  private degradationHandlers: Map<DegradationLevel, () => void> = new Map();
  private onDegradation?: (
    level: DegradationLevel,
    message: string
  ) => void;

  constructor() {
    this.registerDefaultHandlers();
  }

  /** 设置降级通知回调 */
  setOnDegradation(
    callback: (level: DegradationLevel, message: string) => void
  ): void {
    this.onDegradation = callback;
  }

  /** 更新服务健康状态 */
  updateServiceHealth(health: ServiceHealth): void {
    this.serviceHealth.set(health.serviceName, health);
    this.evaluateDegradation();
  }

  /** 评估是否需要降级 */
  private evaluateDegradation(): void {
    const services = Array.from(this.serviceHealth.values());
    const unavailable = services.filter((s) => !s.isAvailable);
    const highLatency = services.filter((s) => s.latencyMs > 10000);
    const highErrorRate = services.filter((s) => s.errorRate > 0.5);

    let newLevel: DegradationLevel;

    if (unavailable.length === 0 && highLatency.length === 0) {
      newLevel = DegradationLevel.FULL_SERVICE;
    } else if (
      unavailable.some((s) => s.serviceName === "llm") &&
      unavailable.some((s) => s.serviceName === "tools")
    ) {
      newLevel = DegradationLevel.HUMAN_HANDOFF;
    } else if (unavailable.some((s) => s.serviceName === "llm")) {
      newLevel = DegradationLevel.CACHED_RESPONSES;
    } else if (highErrorRate.length > 0 || highLatency.length > 0) {
      newLevel = DegradationLevel.REDUCED_CAPABILITY;
    } else {
      newLevel = DegradationLevel.STATIC_FALLBACK;
    }

    if (newLevel !== this.currentLevel) {
      this.currentLevel = newLevel;
      const handler = this.degradationHandlers.get(newLevel);
      if (handler) handler();
      this.notifyDegradation(newLevel);
    }
  }

  /** 注册默认降级处理器 */
  private registerDefaultHandlers(): void {
    this.degradationHandlers.set(
      DegradationLevel.FULL_SERVICE,
      () => {
        console.log("[降级] 服务已完全恢复");
      }
    );

    this.degradationHandlers.set(
      DegradationLevel.REDUCED_CAPABILITY,
      () => {
        console.log("[降级] 部分功能降级，禁用非核心工具调用");
      }
    );

    this.degradationHandlers.set(
      DegradationLevel.CACHED_RESPONSES,
      () => {
        console.log("[降级] 使用缓存响应，新请求可能无法处理");
      }
    );

    this.degradationHandlers.set(
      DegradationLevel.STATIC_FALLBACK,
      () => {
        console.log("[降级] 使用静态兜底响应");
      }
    );

    this.degradationHandlers.set(
      DegradationLevel.HUMAN_HANDOFF,
      () => {
        console.log("[降级] 转接人工客服");
      }
    );
  }

  /** 发送降级通知 */
  private notifyDegradation(level: DegradationLevel): void {
    if (!this.onDegradation) return;

    const messages: Record<DegradationLevel, string> = {
      [DegradationLevel.FULL_SERVICE]: "所有服务已恢复正常运行",
      [DegradationLevel.REDUCED_CAPABILITY]:
        "部分高级功能暂时不可用，核心功能正常",
      [DegradationLevel.CACHED_RESPONSES]:
        "正在使用缓存数据，部分回答可能不是最新的",
      [DegradationLevel.STATIC_FALLBACK]:
        "AI 服务暂时不可用，提供基础帮助信息",
      [DegradationLevel.HUMAN_HANDOFF]:
        "AI 服务暂不可用，正在为您转接人工支持",
    };

    this.onDegradation(level, messages[level]);
  }

  /** 获取当前降级级别 */
  getCurrentLevel(): DegradationLevel {
    return this.currentLevel;
  }

  /** 检查某个能力是否可用 */
  isCapabilityAvailable(capability: string): boolean {
    const capabilityRequirements: Record<string, DegradationLevel> = {
      llm_generation: DegradationLevel.FULL_SERVICE,
      tool_execution: DegradationLevel.FULL_SERVICE,
      cached_qa: DegradationLevel.CACHED_RESPONSES,
      static_help: DegradationLevel.STATIC_FALLBACK,
      basic_routing: DegradationLevel.HUMAN_HANDOFF,
    };

    const required = capabilityRequirements[capability];
    if (required === undefined) return false;
    return this.currentLevel <= required;
  }
}
```

---


## 22.7 多模态交互

### 22.7.1 超越纯文本

Agent 的输出不应局限于纯文本。不同类型的信息有其最佳表达形式：

| 信息类型 | 最佳表达形式 | 纯文本的问题 |
|---------|------------|------------|
| 代码 | 语法高亮代码块 | 无高亮，难以阅读 |
| 对比数据 | 表格 | 文字描述冗长且难以比较 |
| 流程/关系 | 图表/流程图 | 复杂关系难以用文字表达 |
| 趋势 | 折线图/柱状图 | 无法直观感知数据变化 |
| 操作确认 | 交互按钮 | 需要用户额外输入文字 |
| 文件 | 文件预览卡片 | 只有文件名，缺乏上下文 |

### 22.7.2 MultimodalRenderer 实现

```typescript
// ============================================================
// 多模态渲染器
// ============================================================

/** 内容块类型 */
type ContentBlockType =
  | "text"
  | "code"
  | "table"
  | "chart"
  | "image"
  | "file_preview"
  | "interactive"
  | "mermaid_diagram"
  | "diff"
  | "key_value"
  | "progress_bar"
  | "citation";

/** 内容块基础接口 */
interface ContentBlock {
  id: string;
  type: ContentBlockType;
  priority: number; // 渲染优先级
}

/** 文本块 */
interface TextBlock extends ContentBlock {
  type: "text";
  content: string;
  format: "plain" | "markdown" | "html";
}

/** 代码块 */
interface CodeBlock extends ContentBlock {
  type: "code";
  code: string;
  language: string;
  filename?: string;
  highlightLines?: number[];
  showLineNumbers: boolean;
  collapsible: boolean;
  maxVisibleLines: number;
}

/** 表格块 */
interface TableBlock extends ContentBlock {
  type: "table";
  headers: string[];
  rows: string[][];
  sortable: boolean;
  searchable: boolean;
  maxVisibleRows: number;
  caption?: string;
}

/** 图表块 */
interface ChartBlock extends ContentBlock {
  type: "chart";
  chartType: "bar" | "line" | "pie" | "scatter";
  data: {
    labels: string[];
    datasets: Array<{
      label: string;
      values: number[];
      color?: string;
    }>;
  };
  title?: string;
}

/** 交互块（按钮组、审批等） */
interface InteractiveBlock extends ContentBlock {
  type: "interactive";
  interactionType: "buttons" | "approval" | "form" | "toggle";
  elements: InteractiveElement[];
}

/** 交互元素 */
interface InteractiveElement {
  id: string;
  type: "button" | "select" | "input" | "checkbox";
  label: string;
  value: string;
  style: "primary" | "secondary" | "danger" | "ghost";
  disabled: boolean;
  tooltip?: string;
}

/** Diff 块 */
interface DiffBlock extends ContentBlock {
  type: "diff";
  filename: string;
  language: string;
  hunks: Array<{
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    changes: Array<{
      type: "add" | "remove" | "context";
      content: string;
    }>;
  }>;
}

/** 文件预览块 */
interface FilePreviewBlock extends ContentBlock {
  type: "file_preview";
  filename: string;
  fileType: string;
  fileSize: number;
  previewUrl?: string;
  downloadUrl?: string;
  metadata: Record<string, string>;
}

/** 键值对块 */
interface KeyValueBlock extends ContentBlock {
  type: "key_value";
  pairs: Array<{ key: string; value: string; copyable?: boolean }>;
  layout: "horizontal" | "vertical";
}

/** 引用块 */
interface CitationBlock extends ContentBlock {
  type: "citation";
  citations: Array<{
    index: number;
    title: string;
    url?: string;
    excerpt: string;
    source: string;
  }>;
}

type AnyContentBlock =
  | TextBlock
  | CodeBlock
  | TableBlock
  | ChartBlock
  | InteractiveBlock
  | DiffBlock
  | FilePreviewBlock
  | KeyValueBlock
  | CitationBlock;

/** 渲染后的输出 */
interface RenderedOutput {
  blocks: AnyContentBlock[];
  layout: "vertical" | "grid" | "tabs";
  totalBlocks: number;
}

class MultimodalRenderer {
  private formatSelector: ResponseFormatSelector;
  private layoutEngine: AdaptiveLayoutEngine;

  constructor() {
    this.formatSelector = new ResponseFormatSelector();
    this.layoutEngine = new AdaptiveLayoutEngine();
  }

  /** 将原始 Agent 输出转换为多模态内容块 */
  render(rawOutput: string, metadata?: Record<string, unknown>): RenderedOutput {
    const blocks: AnyContentBlock[] = [];
    let blockIndex = 0;

    // 解析 markdown 内容，提取不同类型的内容块
    const segments = this.parseSegments(rawOutput);

    for (const segment of segments) {
      const block = this.segmentToBlock(segment, blockIndex++);
      if (block) {
        blocks.push(block);
      }
    }

    // 确定布局
    const layout = this.layoutEngine.selectLayout(blocks);

    return {
      blocks,
      layout,
      totalBlocks: blocks.length,
    };
  }

  /** 解析原始输出为片段 */
  private parseSegments(
    raw: string
  ): Array<{ type: string; content: string; meta?: Record<string, string> }> {
    const segments: Array<{
      type: string;
      content: string;
      meta?: Record<string, string>;
    }> = [];

    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const tableRegex = /\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n)*)/g;

    let lastIndex = 0;
    const allMatches: Array<{
      index: number;
      length: number;
      type: string;
      content: string;
      meta?: Record<string, string>;
    }> = [];

    // 提取代码块
    let match: RegExpExecArray | null;
    while ((match = codeBlockRegex.exec(raw)) !== null) {
      allMatches.push({
        index: match.index,
        length: match[0].length,
        type: "code",
        content: match[2],
        meta: { language: match[1] ?? "text" },
      });
    }

    // 提取表格
    while ((match = tableRegex.exec(raw)) !== null) {
      allMatches.push({
        index: match.index,
        length: match[0].length,
        type: "table",
        content: match[0],
      });
    }

    // 按位置排序
    allMatches.sort((a, b) => a.index - b.index);

    // 填充文本片段
    for (const m of allMatches) {
      if (m.index > lastIndex) {
        const text = raw.slice(lastIndex, m.index).trim();
        if (text) {
          segments.push({ type: "text", content: text });
        }
      }
      segments.push({ type: m.type, content: m.content, meta: m.meta });
      lastIndex = m.index + m.length;
    }

    // 尾部文本
    if (lastIndex < raw.length) {
      const text = raw.slice(lastIndex).trim();
      if (text) {
        segments.push({ type: "text", content: text });
      }
    }

    return segments;
  }

  /** 将片段转换为内容块 */
  private segmentToBlock(
    segment: { type: string; content: string; meta?: Record<string, string> },
    index: number
  ): AnyContentBlock | null {
    const id = `block-${index}`;

    switch (segment.type) {
      case "text":
        return {
          id,
          type: "text",
          priority: index,
          content: segment.content,
          format: "markdown",
        } as TextBlock;

      case "code":
        return {
          id,
          type: "code",
          priority: index,
          code: segment.content,
          language: segment.meta?.language ?? "text",
          showLineNumbers: segment.content.split("\n").length > 5,
          collapsible: segment.content.split("\n").length > 20,
          maxVisibleLines: 30,
        } as CodeBlock;

      case "table":
        return this.parseTableBlock(id, segment.content, index);

      default:
        return null;
    }
  }

  /** 解析表格块 */
  private parseTableBlock(
    id: string,
    content: string,
    index: number
  ): TableBlock | null {
    const lines = content.trim().split("\n");
    if (lines.length < 3) return null;

    const parseRow = (line: string): string[] =>
      line
        .split("|")
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0);

    const headers = parseRow(lines[0]);
    const rows: string[][] = [];

    for (let i = 2; i < lines.length; i++) {
      const row = parseRow(lines[i]);
      if (row.length > 0) {
        rows.push(row);
      }
    }

    return {
      id,
      type: "table",
      priority: index,
      headers,
      rows,
      sortable: rows.length > 5,
      searchable: rows.length > 10,
      maxVisibleRows: 20,
    };
  }
}
```

### 22.7.3 ResponseFormatSelector：响应格式选择器

```typescript
// ============================================================
// 响应格式选择器：根据数据类型选择最佳展示格式
// ============================================================

/** 数据特征 */
interface DataCharacteristics {
  hasNumericData: boolean;
  hasTimeSeries: boolean;
  hasComparisons: boolean;
  hasCode: boolean;
  hasStructuredData: boolean;
  hasFileReferences: boolean;
  hasDiffs: boolean;
  requiresUserAction: boolean;
  textLength: number;
  itemCount: number;
}

/** 格式推荐 */
interface FormatRecommendation {
  format: ContentBlockType;
  confidence: number;
  reason: string;
}

class ResponseFormatSelector {
  /** 分析数据并推荐最佳格式 */
  recommend(data: unknown, hint?: string): FormatRecommendation[] {
    const characteristics = this.analyzeData(data);
    const recommendations: FormatRecommendation[] = [];

    if (characteristics.hasTimeSeries && characteristics.hasNumericData) {
      recommendations.push({
        format: "chart",
        confidence: 0.9,
        reason: "时间序列数值数据适合图表展示",
      });
    }

    if (characteristics.hasComparisons && characteristics.itemCount <= 20) {
      recommendations.push({
        format: "table",
        confidence: 0.85,
        reason: "对比数据适合表格展示",
      });
    }

    if (characteristics.hasCode) {
      recommendations.push({
        format: "code",
        confidence: 0.95,
        reason: "代码内容使用语法高亮代码块",
      });
    }

    if (characteristics.hasDiffs) {
      recommendations.push({
        format: "diff",
        confidence: 0.9,
        reason: "变更内容使用 Diff 视图展示",
      });
    }

    if (characteristics.hasStructuredData && !characteristics.hasComparisons) {
      recommendations.push({
        format: "key_value",
        confidence: 0.7,
        reason: "结构化键值数据适合键值对展示",
      });
    }

    if (characteristics.hasFileReferences) {
      recommendations.push({
        format: "file_preview",
        confidence: 0.8,
        reason: "文件引用使用预览卡片",
      });
    }

    if (characteristics.requiresUserAction) {
      recommendations.push({
        format: "interactive",
        confidence: 0.85,
        reason: "需要用户操作时使用交互组件",
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        format: "text",
        confidence: 1.0,
        reason: "默认使用文本展示",
      });
    }

    return recommendations.sort((a, b) => b.confidence - a.confidence);
  }

  /** 分析数据特征 */
  private analyzeData(data: unknown): DataCharacteristics {
    const str = typeof data === "string" ? data : JSON.stringify(data);

    return {
      hasNumericData: /\d+(\.\d+)?/.test(str) && this.countNumbers(str) > 3,
      hasTimeSeries: /\d{4}[-/]\d{2}[-/]\d{2}/.test(str),
      hasComparisons: this.detectComparisons(str),
      hasCode: /```\w*\n/.test(str) || /function |const |class |import /.test(str),
      hasStructuredData: this.detectStructuredData(data),
      hasFileReferences: /\.(ts|js|py|go|rs|java|md|json|yaml|yml|csv|pdf)\b/.test(str),
      hasDiffs: /^[+-]{3} /.test(str) || /^@@.*@@$/m.test(str),
      requiresUserAction: /确认|approve|选择|choose|同意/i.test(str),
      textLength: str.length,
      itemCount: this.countItems(data),
    };
  }

  private countNumbers(str: string): number {
    const matches = str.match(/\b\d+(\.\d+)?\b/g);
    return matches ? matches.length : 0;
  }

  private detectComparisons(str: string): boolean {
    return (
      /vs\.?|对比|比较|差异|区别/.test(str) ||
      (str.includes("|") && str.split("\n").filter((l) => l.includes("|")).length > 2)
    );
  }

  private detectStructuredData(data: unknown): boolean {
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      return Object.keys(data).length > 2;
    }
    return false;
  }

  private countItems(data: unknown): number {
    if (Array.isArray(data)) return data.length;
    if (typeof data === "object" && data !== null) {
      return Object.keys(data).length;
    }
    return 1;
  }
}
```

### 22.7.4 AdaptiveLayoutEngine：自适应布局引擎

```typescript
// ============================================================
// 自适应布局引擎
// ============================================================

/** 布局约束 */
interface LayoutConstraints {
  maxWidth: number;         // 最大宽度（像素）
  maxBlocksPerRow: number;  // 每行最多内容块数
  preferCompact: boolean;   // 是否偏好紧凑布局
}

class AdaptiveLayoutEngine {
  private constraints: LayoutConstraints;

  constructor(constraints?: Partial<LayoutConstraints>) {
    this.constraints = {
      maxWidth: 800,
      maxBlocksPerRow: 2,
      preferCompact: false,
      ...constraints,
    };
  }

  /** 根据内容块选择最佳布局 */
  selectLayout(blocks: AnyContentBlock[]): "vertical" | "grid" | "tabs" {
    if (blocks.length <= 2) {
      return "vertical";
    }

    // 如果有多个同类型块且适合并排展示
    const typeCounts = this.countBlockTypes(blocks);
    const hasMultipleSameType = Object.values(typeCounts).some((c) => c >= 2);

    if (
      hasMultipleSameType &&
      blocks.length <= 6 &&
      this.allBlocksCompact(blocks)
    ) {
      return "grid";
    }

    // 如果块数量多且类型多样，使用标签页
    if (blocks.length > 5 && Object.keys(typeCounts).length >= 3) {
      return "tabs";
    }

    return "vertical";
  }

  /** 计算内容块的布局尺寸 */
  calculateBlockSizes(
    blocks: AnyContentBlock[]
  ): Array<{ id: string; width: string; height: string }> {
    return blocks.map((block) => {
      const size = this.estimateBlockSize(block);
      return {
        id: block.id,
        width: size.fullWidth ? "100%" : "48%",
        height: size.estimatedHeight,
      };
    });
  }

  /** 统计块类型 */
  private countBlockTypes(
    blocks: AnyContentBlock[]
  ): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const block of blocks) {
      counts[block.type] = (counts[block.type] ?? 0) + 1;
    }
    return counts;
  }

  /** 检查所有块是否适合紧凑显示 */
  private allBlocksCompact(blocks: AnyContentBlock[]): boolean {
    return blocks.every((block) => {
      const size = this.estimateBlockSize(block);
      return !size.fullWidth;
    });
  }

  /** 估算块尺寸 */
  private estimateBlockSize(
    block: AnyContentBlock
  ): { fullWidth: boolean; estimatedHeight: string } {
    switch (block.type) {
      case "code": {
        const codeBlock = block as CodeBlock;
        const lines = codeBlock.code.split("\n").length;
        return {
          fullWidth: true,
          estimatedHeight: `${Math.min(lines * 20 + 40, 600)}px`,
        };
      }

      case "table": {
        const tableBlock = block as TableBlock;
        return {
          fullWidth: tableBlock.headers.length > 4,
          estimatedHeight: `${Math.min(tableBlock.rows.length * 32 + 60, 500)}px`,
        };
      }

      case "chart":
        return { fullWidth: false, estimatedHeight: "300px" };

      case "key_value":
        return { fullWidth: false, estimatedHeight: "auto" };

      case "interactive":
        return { fullWidth: true, estimatedHeight: "auto" };

      case "diff":
        return { fullWidth: true, estimatedHeight: "400px" };

      case "file_preview":
        return { fullWidth: false, estimatedHeight: "120px" };

      default:
        return { fullWidth: true, estimatedHeight: "auto" };
    }
  }
}
```

---


## 22.8 流式输出

### 22.8.1 为什么需要流式输出

LLM 的响应生成是逐 token 进行的——如果等待完整响应再展示，用户可能需要等待数十秒。流式输出让用户在 Agent "思考"的过程中就能看到结果逐步形成，显著提升感知速度和交互体验。

但流式输出远不止"把字一个个显示出来"那么简单。在 Agent 系统中，流式输出需要处理：
- **Markdown 增量解析**：部分 markdown 语法在完整之前无法正确渲染
- **工具调用指示**：Agent 调用工具时需要展示加载状态
- **结构化数据流**：JSON、表格等结构化数据的流式渲染
- **回压控制**：慢客户端不应拖慢 Agent 的执行速度

### 22.8.2 StreamingProtocol：流式事件协议

```typescript
// ============================================================
// 流式输出事件协议
// ============================================================

/** 流式事件类型 */
type StreamEventType =
  | "text_delta"        // 文本增量
  | "tool_start"        // 工具调用开始
  | "tool_progress"     // 工具执行进度
  | "tool_end"          // 工具调用结束
  | "thinking_start"    // 开始思考
  | "thinking_delta"    // 思考内容增量
  | "thinking_end"      // 思考结束
  | "code_block_start"  // 代码块开始
  | "code_block_delta"  // 代码块内容增量
  | "code_block_end"    // 代码块结束
  | "progress_update"   // 进度更新
  | "metadata"          // 元数据
  | "error"             // 错误
  | "done";             // 完成

/** 流式事件基础接口 */
interface StreamEvent {
  type: StreamEventType;
  timestamp: number;
  sequenceId: number;
}

/** 文本增量事件 */
interface TextDeltaEvent extends StreamEvent {
  type: "text_delta";
  delta: string;
  accumulatedLength: number;
}

/** 工具调用开始事件 */
interface ToolStartEvent extends StreamEvent {
  type: "tool_start";
  toolName: string;
  toolId: string;
  description: string;
  estimatedDurationMs?: number;
}

/** 工具进度事件 */
interface ToolProgressEvent extends StreamEvent {
  type: "tool_progress";
  toolId: string;
  progress: number;
  statusMessage?: string;
}

/** 工具调用结束事件 */
interface ToolEndEvent extends StreamEvent {
  type: "tool_end";
  toolId: string;
  success: boolean;
  resultSummary: string;
  durationMs: number;
}

/** 代码块开始事件 */
interface CodeBlockStartEvent extends StreamEvent {
  type: "code_block_start";
  language: string;
  filename?: string;
}

/** 代码块增量事件 */
interface CodeBlockDeltaEvent extends StreamEvent {
  type: "code_block_delta";
  delta: string;
}

/** 代码块结束事件 */
interface CodeBlockEndEvent extends StreamEvent {
  type: "code_block_end";
  totalLines: number;
}

/** 进度更新事件 */
interface ProgressUpdateEvent extends StreamEvent {
  type: "progress_update";
  overallProgress: number;
  currentPhase: string;
  currentStep: string;
  eta?: { remainingMs: number; confidence: number };
}

/** 元数据事件 */
interface MetadataEvent extends StreamEvent {
  type: "metadata";
  key: string;
  value: unknown;
}

/** 完成事件 */
interface DoneEvent extends StreamEvent {
  type: "done";
  totalTokens: number;
  totalDurationMs: number;
  toolCallCount: number;
}

type AnyStreamEvent =
  | TextDeltaEvent
  | ToolStartEvent
  | ToolProgressEvent
  | ToolEndEvent
  | CodeBlockStartEvent
  | CodeBlockDeltaEvent
  | CodeBlockEndEvent
  | ProgressUpdateEvent
  | MetadataEvent
  | DoneEvent;
```

### 22.8.3 ProductionStreamingRenderer 实现

```typescript
// ============================================================
// 生产级流式渲染器
// ============================================================

/** 渲染器状态 */
interface RendererState {
  accumulatedText: string;
  inCodeBlock: boolean;
  codeBlockLanguage: string;
  codeBlockContent: string;
  activeToolCalls: Map<string, { name: string; startTime: number }>;
  renderedOutput: string;
  pendingFlush: string;
  lastFlushTime: number;
}

/** 回压策略 */
interface BackPressureConfig {
  maxBufferSize: number;       // 最大缓冲区大小（字符数）
  flushIntervalMs: number;     // 最小刷新间隔
  pauseThreshold: number;      // 暂停阈值
  resumeThreshold: number;     // 恢复阈值
}

/** 流式渲染回调 */
interface StreamCallbacks {
  onTextChunk: (chunk: string, accumulated: string) => void;
  onToolCallStart: (toolName: string, description: string) => void;
  onToolCallEnd: (toolName: string, success: boolean, summary: string) => void;
  onCodeBlockStart: (language: string) => void;
  onCodeBlockLine: (line: string) => void;
  onCodeBlockEnd: () => void;
  onProgress: (progress: number, phase: string, step: string) => void;
  onComplete: (summary: { tokens: number; duration: number; tools: number }) => void;
  onError: (message: string) => void;
}

class ProductionStreamingRenderer {
  private state: RendererState;
  private callbacks: Partial<StreamCallbacks>;
  private backPressure: BackPressureConfig;
  private sequenceCounter: number = 0;
  private isPaused: boolean = false;
  private eventBuffer: AnyStreamEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private markdownParser: IncrementalMarkdownParser;

  constructor(
    callbacks: Partial<StreamCallbacks>,
    backPressure?: Partial<BackPressureConfig>
  ) {
    this.callbacks = callbacks;
    this.backPressure = {
      maxBufferSize: 4096,
      flushIntervalMs: 50,
      pauseThreshold: 0.8,
      resumeThreshold: 0.3,
      ...backPressure,
    };

    this.state = {
      accumulatedText: "",
      inCodeBlock: false,
      codeBlockLanguage: "",
      codeBlockContent: "",
      activeToolCalls: new Map(),
      renderedOutput: "",
      pendingFlush: "",
      lastFlushTime: 0,
    };

    this.markdownParser = new IncrementalMarkdownParser();
  }

  /** 处理流式事件 */
  processEvent(event: AnyStreamEvent): void {
    // 回压检查
    if (this.isPaused) {
      this.eventBuffer.push(event);
      if (
        this.eventBuffer.length >
        this.backPressure.maxBufferSize * this.backPressure.pauseThreshold
      ) {
        console.warn(
          `[流式渲染] 缓冲区接近上限: ${this.eventBuffer.length}/${this.backPressure.maxBufferSize}`
        );
      }
      return;
    }

    this.handleEvent(event);
  }

  /** 处理单个事件 */
  private handleEvent(event: AnyStreamEvent): void {
    switch (event.type) {
      case "text_delta":
        this.handleTextDelta(event as TextDeltaEvent);
        break;

      case "tool_start":
        this.handleToolStart(event as ToolStartEvent);
        break;

      case "tool_progress":
        this.handleToolProgress(event as ToolProgressEvent);
        break;

      case "tool_end":
        this.handleToolEnd(event as ToolEndEvent);
        break;

      case "code_block_start":
        this.handleCodeBlockStart(event as CodeBlockStartEvent);
        break;

      case "code_block_delta":
        this.handleCodeBlockDelta(event as CodeBlockDeltaEvent);
        break;

      case "code_block_end":
        this.handleCodeBlockEnd(event as CodeBlockEndEvent);
        break;

      case "progress_update":
        this.handleProgressUpdate(event as ProgressUpdateEvent);
        break;

      case "done":
        this.handleDone(event as DoneEvent);
        break;
    }
  }

  /** 处理文本增量 */
  private handleTextDelta(event: TextDeltaEvent): void {
    this.state.accumulatedText += event.delta;
    this.state.pendingFlush += event.delta;

    // 增量 Markdown 解析
    const parsedChunk = this.markdownParser.feed(event.delta);

    // 节流：不是每个 delta 都立即刷新
    const now = Date.now();
    if (now - this.state.lastFlushTime >= this.backPressure.flushIntervalMs) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flush();
        this.flushTimer = null;
      }, this.backPressure.flushIntervalMs);
    }
  }

  /** 刷新待渲染内容 */
  private flush(): void {
    if (this.state.pendingFlush.length === 0) return;

    if (this.callbacks.onTextChunk) {
      this.callbacks.onTextChunk(
        this.state.pendingFlush,
        this.state.accumulatedText
      );
    }

    this.state.pendingFlush = "";
    this.state.lastFlushTime = Date.now();
  }

  /** 处理工具调用开始 */
  private handleToolStart(event: ToolStartEvent): void {
    this.state.activeToolCalls.set(event.toolId, {
      name: event.toolName,
      startTime: event.timestamp,
    });

    if (this.callbacks.onToolCallStart) {
      this.callbacks.onToolCallStart(event.toolName, event.description);
    }
  }

  /** 处理工具调用进度 */
  private handleToolProgress(event: ToolProgressEvent): void {
    // 工具进度通过 onProgress 回调传递
    const tool = this.state.activeToolCalls.get(event.toolId);
    if (tool && this.callbacks.onProgress) {
      this.callbacks.onProgress(
        event.progress,
        "工具执行",
        `${tool.name}: ${event.statusMessage ?? ""}`
      );
    }
  }

  /** 处理工具调用结束 */
  private handleToolEnd(event: ToolEndEvent): void {
    this.state.activeToolCalls.delete(event.toolId);

    if (this.callbacks.onToolCallEnd) {
      this.callbacks.onToolCallEnd(
        event.toolId,
        event.success,
        event.resultSummary
      );
    }
  }

  /** 处理代码块开始 */
  private handleCodeBlockStart(event: CodeBlockStartEvent): void {
    this.state.inCodeBlock = true;
    this.state.codeBlockLanguage = event.language;
    this.state.codeBlockContent = "";

    if (this.callbacks.onCodeBlockStart) {
      this.callbacks.onCodeBlockStart(event.language);
    }
  }

  /** 处理代码块增量 */
  private handleCodeBlockDelta(event: CodeBlockDeltaEvent): void {
    this.state.codeBlockContent += event.delta;

    // 按行输出代码
    const lines = event.delta.split("\n");
    if (this.callbacks.onCodeBlockLine) {
      for (const line of lines) {
        if (line.length > 0) {
          this.callbacks.onCodeBlockLine(line);
        }
      }
    }
  }

  /** 处理代码块结束 */
  private handleCodeBlockEnd(event: CodeBlockEndEvent): void {
    this.state.inCodeBlock = false;

    if (this.callbacks.onCodeBlockEnd) {
      this.callbacks.onCodeBlockEnd();
    }
  }

  /** 处理进度更新 */
  private handleProgressUpdate(event: ProgressUpdateEvent): void {
    if (this.callbacks.onProgress) {
      this.callbacks.onProgress(
        event.overallProgress,
        event.currentPhase,
        event.currentStep
      );
    }
  }

  /** 处理完成 */
  private handleDone(event: DoneEvent): void {
    // 刷新所有待渲染内容
    this.flush();

    if (this.callbacks.onComplete) {
      this.callbacks.onComplete({
        tokens: event.totalTokens,
        duration: event.totalDurationMs,
        tools: event.toolCallCount,
      });
    }
  }

  /** 暂停渲染（回压） */
  pause(): void {
    this.isPaused = true;
  }

  /** 恢复渲染 */
  resume(): void {
    this.isPaused = false;

    // 处理缓冲区中的事件
    const buffered = [...this.eventBuffer];
    this.eventBuffer = [];

    for (const event of buffered) {
      this.handleEvent(event);

      // 检查是否需要再次暂停
      if (this.isPaused) break;
    }
  }

  /** 获取当前状态 */
  getState(): {
    totalChars: number;
    activeToolCalls: number;
    inCodeBlock: boolean;
    isPaused: boolean;
    bufferSize: number;
  } {
    return {
      totalChars: this.state.accumulatedText.length,
      activeToolCalls: this.state.activeToolCalls.size,
      inCodeBlock: this.state.inCodeBlock,
      isPaused: this.isPaused,
      bufferSize: this.eventBuffer.length,
    };
  }

  /** 销毁渲染器 */
  destroy(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.eventBuffer = [];
  }
}
```

### 22.8.4 IncrementalMarkdownParser：增量 Markdown 解析

流式输出最棘手的问题之一是 Markdown 的增量解析——一个 `**` 可能是加粗的开始，也可能还没写完。以下解析器维护状态机，在安全的边界处输出已确认的渲染内容：

```typescript
// ============================================================
// 增量 Markdown 解析器
// ============================================================

/** 解析器状态 */
interface ParserState {
  buffer: string;
  inBold: boolean;
  inItalic: boolean;
  inCode: boolean;
  inCodeBlock: boolean;
  inLink: boolean;
  inHeading: number; // 0=不在标题中, 1-6=标题级别
  lineBuffer: string;
}

/** 解析输出片段 */
interface ParsedFragment {
  type: "text" | "bold" | "italic" | "code" | "heading" | "link" | "raw";
  content: string;
  isComplete: boolean;
}

class IncrementalMarkdownParser {
  private state: ParserState;
  private outputBuffer: ParsedFragment[] = [];

  constructor() {
    this.state = {
      buffer: "",
      inBold: false,
      inItalic: false,
      inCode: false,
      inCodeBlock: false,
      inLink: false,
      inHeading: 0,
      lineBuffer: "",
    };
  }

  /** 输入新的文本增量，返回可安全渲染的片段 */
  feed(delta: string): ParsedFragment[] {
    this.state.buffer += delta;
    const fragments: ParsedFragment[] = [];

    while (this.state.buffer.length > 0) {
      const fragment = this.tryParseNext();
      if (!fragment) break;
      fragments.push(fragment);
    }

    return fragments;
  }

  /** 尝试从缓冲区解析下一个片段 */
  private tryParseNext(): ParsedFragment | null {
    const buf = this.state.buffer;

    // 代码块标记
    if (buf.startsWith("```")) {
      if (this.state.inCodeBlock) {
        this.state.inCodeBlock = false;
        this.state.buffer = buf.slice(3);
        return { type: "raw", content: "```", isComplete: true };
      }
      // 检查是否有足够内容确认代码块开始
      const newlineIndex = buf.indexOf("\n");
      if (newlineIndex > 0) {
        this.state.inCodeBlock = true;
        const header = buf.slice(0, newlineIndex + 1);
        this.state.buffer = buf.slice(newlineIndex + 1);
        return { type: "raw", content: header, isComplete: false };
      }
      return null; // 等待更多内容
    }

    // 在代码块中，原样输出
    if (this.state.inCodeBlock) {
      const endIndex = buf.indexOf("```");
      if (endIndex >= 0) {
        const content = buf.slice(0, endIndex);
        this.state.buffer = buf.slice(endIndex);
        return { type: "code", content, isComplete: false };
      }
      // 输出到最后一个换行符（保留不完整的行）
      const lastNewline = buf.lastIndexOf("\n");
      if (lastNewline >= 0) {
        const content = buf.slice(0, lastNewline + 1);
        this.state.buffer = buf.slice(lastNewline + 1);
        return { type: "code", content, isComplete: false };
      }
      return null;
    }

    // 行内代码
    if (buf.startsWith("`") && !buf.startsWith("```")) {
      const endIndex = buf.indexOf("`", 1);
      if (endIndex > 0) {
        const content = buf.slice(1, endIndex);
        this.state.buffer = buf.slice(endIndex + 1);
        return { type: "code", content, isComplete: true };
      }
      return null; // 等待关闭反引号
    }

    // 加粗
    if (buf.startsWith("**")) {
      if (this.state.inBold) {
        this.state.inBold = false;
        this.state.buffer = buf.slice(2);
        return { type: "bold", content: "", isComplete: true };
      }
      const endIndex = buf.indexOf("**", 2);
      if (endIndex > 0) {
        const content = buf.slice(2, endIndex);
        this.state.buffer = buf.slice(endIndex + 2);
        this.state.inBold = false;
        return { type: "bold", content, isComplete: true };
      }
      // 不确定是否会关闭，先标记进入加粗状态
      this.state.inBold = true;
      this.state.buffer = buf.slice(2);
      return { type: "bold", content: "", isComplete: false };
    }

    // 标题（行首 #）
    if (
      buf.length > 0 &&
      buf[0] === "#" &&
      this.state.lineBuffer.length === 0
    ) {
      const match = buf.match(/^(#{1,6})\s/);
      if (match) {
        const level = match[1].length;
        const newlineIndex = buf.indexOf("\n");
        if (newlineIndex > 0) {
          const content = buf.slice(match[0].length, newlineIndex);
          this.state.buffer = buf.slice(newlineIndex + 1);
          this.state.lineBuffer = "";
          return { type: "heading", content: `${"#".repeat(level)} ${content}`, isComplete: true };
        }
        return null; // 等待行结束
      }
    }

    // 普通文本：输出到下一个特殊字符或换行
    const specialChars = /[`*#\[\]!\n]/;
    const nextSpecial = buf.slice(1).search(specialChars);

    if (nextSpecial >= 0) {
      const content = buf.slice(0, nextSpecial + 1);
      this.state.buffer = buf.slice(nextSpecial + 1);
      this.state.lineBuffer += content;
      if (content.includes("\n")) {
        this.state.lineBuffer = "";
      }
      return { type: "text", content, isComplete: true };
    }

    // 缓冲区中只有普通文本，保留最后几个字符以防是特殊标记的开始
    if (buf.length > 3) {
      const safe = buf.slice(0, -3);
      this.state.buffer = buf.slice(-3);
      this.state.lineBuffer += safe;
      return { type: "text", content: safe, isComplete: true };
    }

    return null; // 缓冲区太小，等待更多内容
  }

  /** 强制刷新所有缓冲内容 */
  flush(): ParsedFragment[] {
    const fragments: ParsedFragment[] = [];
    if (this.state.buffer.length > 0) {
      fragments.push({
        type: "text",
        content: this.state.buffer,
        isComplete: true,
      });
      this.state.buffer = "";
    }
    return fragments;
  }

  /** 重置解析器状态 */
  reset(): void {
    this.state = {
      buffer: "",
      inBold: false,
      inItalic: false,
      inCode: false,
      inCodeBlock: false,
      inLink: false,
      inHeading: 0,
      lineBuffer: "",
    };
    this.outputBuffer = [];
  }
}
```

---


## 22.9 个性化与自适应

### 22.9.1 为什么 Agent 需要个性化

不同用户在以下方面有着显著差异：

- **交互风格偏好**：有人喜欢详细解释，有人偏好简洁直接
- **技术深度**：专家用户和新手用户需要完全不同的信息层级
- **响应格式**：有人偏好表格，有人喜欢自然语言
- **确认频率**：谨慎的用户希望每步确认，果断的用户希望自动执行
- **语言习惯**：专业术语 vs 通俗用语

一个优秀的 Agent 应该像一个有经验的助手，逐渐了解用户的偏好并主动适应。

### 22.9.2 PersonalizationEngine 实现

```typescript
// ============================================================
// 个性化引擎
// ============================================================

/** 偏好类别 */
type PreferenceCategory =
  | "verbosity"        // 详细度：verbose | balanced | concise
  | "response_format"  // 响应格式偏好
  | "confirmation"     // 确认频率偏好
  | "technical_depth"  // 技术深度偏好
  | "language_style"   // 语言风格偏好
  | "interaction_pace" // 交互节奏偏好
  | "error_detail"     // 错误信息详细度
  | "proactiveness";   // 主动性偏好

/** 偏好值 */
interface PreferenceValue {
  value: string;
  confidence: number;    // 对此偏好判断的置信度
  sampleCount: number;   // 基于多少次观察
  lastUpdated: number;
  decayRate: number;     // 衰减速率 (0-1, 越高越快衰减)
}

/** 用户偏好画像 */
interface UserPreferenceProfile {
  userId: string;
  preferences: Record<PreferenceCategory, PreferenceValue>;
  interactionCount: number;
  firstSeenAt: number;
  lastActiveAt: number;
}

class UserPreferenceStore {
  private profiles: Map<string, UserPreferenceProfile> = new Map();

  /** 获取或创建用户画像 */
  getProfile(userId: string): UserPreferenceProfile {
    let profile = this.profiles.get(userId);
    if (!profile) {
      profile = this.createDefaultProfile(userId);
      this.profiles.set(userId, profile);
    }
    return profile;
  }

  /** 创建默认画像 */
  private createDefaultProfile(userId: string): UserPreferenceProfile {
    const now = Date.now();
    const defaultPref = (value: string): PreferenceValue => ({
      value,
      confidence: 0.3,
      sampleCount: 0,
      lastUpdated: now,
      decayRate: 0.1,
    });

    return {
      userId,
      preferences: {
        verbosity: defaultPref("balanced"),
        response_format: defaultPref("markdown"),
        confirmation: defaultPref("moderate"),
        technical_depth: defaultPref("intermediate"),
        language_style: defaultPref("professional"),
        interaction_pace: defaultPref("normal"),
        error_detail: defaultPref("standard"),
        proactiveness: defaultPref("moderate"),
      },
      interactionCount: 0,
      firstSeenAt: now,
      lastActiveAt: now,
    };
  }

  /** 更新偏好 */
  updatePreference(
    userId: string,
    category: PreferenceCategory,
    observedValue: string,
    signalStrength: number = 0.5
  ): void {
    const profile = this.getProfile(userId);
    const pref = profile.preferences[category];

    pref.sampleCount++;
    profile.interactionCount++;
    profile.lastActiveAt = Date.now();

    // 如果观察到的值与当前值相同，增加置信度
    if (pref.value === observedValue) {
      pref.confidence = Math.min(
        0.95,
        pref.confidence + signalStrength * 0.1
      );
    } else {
      // 值不同，考虑是否更新
      const newConfidence = signalStrength * 0.5;
      if (newConfidence > pref.confidence || pref.sampleCount > 10) {
        // 在多次观察到不同值后，切换偏好
        pref.value = observedValue;
        pref.confidence = newConfidence;
      } else {
        // 偶尔的偏差，略微降低当前置信度
        pref.confidence = Math.max(0.1, pref.confidence - 0.05);
      }
    }

    pref.lastUpdated = Date.now();
  }

  /** 获取偏好值 */
  getPreference(
    userId: string,
    category: PreferenceCategory
  ): { value: string; confidence: number } {
    const profile = this.getProfile(userId);
    const pref = profile.preferences[category];

    // 应用时间衰减
    const age = Date.now() - pref.lastUpdated;
    const daysSinceUpdate = age / (24 * 3600 * 1000);
    const decayedConfidence =
      pref.confidence * Math.pow(1 - pref.decayRate, daysSinceUpdate / 30);

    return {
      value: pref.value,
      confidence: Math.max(0.1, decayedConfidence),
    };
  }

  /** 序列化画像 */
  serialize(userId: string): string {
    const profile = this.getProfile(userId);
    return JSON.stringify(profile, null, 2);
  }

  /** 反序列化画像 */
  deserialize(data: string): void {
    const profile: UserPreferenceProfile = JSON.parse(data);
    this.profiles.set(profile.userId, profile);
  }
}

class PersonalizationEngine {
  private preferenceStore: UserPreferenceStore;
  private expertiseTracker: UserExpertiseTracker;

  constructor(
    preferenceStore?: UserPreferenceStore,
    expertiseTracker?: UserExpertiseTracker
  ) {
    this.preferenceStore = preferenceStore ?? new UserPreferenceStore();
    this.expertiseTracker = expertiseTracker ?? new UserExpertiseTracker();
  }

  /** 根据用户偏好调整响应 */
  personalizeResponse(
    userId: string,
    rawResponse: string,
    metadata?: Record<string, unknown>
  ): PersonalizedResponse {
    const verbosity = this.preferenceStore.getPreference(userId, "verbosity");
    const techDepth = this.preferenceStore.getPreference(userId, "technical_depth");
    const format = this.preferenceStore.getPreference(userId, "response_format");
    const expertise = this.expertiseTracker.getProfile(userId);

    const adjustments: ResponseAdjustment[] = [];

    // 调整详细度
    if (verbosity.value === "concise" && verbosity.confidence > 0.5) {
      adjustments.push({
        type: "trim",
        rule: "移除解释性文字，保留核心信息",
        applied: true,
      });
    } else if (verbosity.value === "verbose" && verbosity.confidence > 0.5) {
      adjustments.push({
        type: "expand",
        rule: "添加更多上下文和解释",
        applied: true,
      });
    }

    // 调整技术深度
    if (
      techDepth.value === "expert" &&
      expertise.currentLevel >= ExpertiseLevel.ADVANCED
    ) {
      adjustments.push({
        type: "deepen",
        rule: "使用专业术语，展示技术细节",
        applied: true,
      });
    } else if (
      techDepth.value === "beginner" ||
      expertise.currentLevel === ExpertiseLevel.NOVICE
    ) {
      adjustments.push({
        type: "simplify",
        rule: "使用通俗语言，添加概念解释",
        applied: true,
      });
    }

    return {
      originalResponse: rawResponse,
      adjustedResponse: rawResponse, // 实际生产中会根据 adjustments 调整
      adjustments,
      userProfile: {
        verbosity: verbosity.value,
        technicalDepth: techDepth.value,
        expertiseLevel: ExpertiseLevel[expertise.currentLevel],
        responseFormat: format.value,
      },
    };
  }

  /** 从用户交互中学习偏好 */
  learnFromInteraction(
    userId: string,
    interaction: UserInteraction
  ): void {
    // 根据消息长度推断详细度偏好
    if (interaction.userMessageLength < 20) {
      this.preferenceStore.updatePreference(
        userId,
        "verbosity",
        "concise",
        0.3
      );
    } else if (interaction.userMessageLength > 200) {
      this.preferenceStore.updatePreference(
        userId,
        "verbosity",
        "verbose",
        0.3
      );
    }

    // 根据是否展开详情推断技术深度
    if (interaction.expandedDetails) {
      this.preferenceStore.updatePreference(
        userId,
        "technical_depth",
        "expert",
        0.4
      );
      this.expertiseTracker.recordSignal(userId, "expanded_details");
    }

    // 根据确认行为推断确认偏好
    if (interaction.skippedConfirmation) {
      this.preferenceStore.updatePreference(
        userId,
        "confirmation",
        "minimal",
        0.5
      );
    } else if (interaction.requestedConfirmation) {
      this.preferenceStore.updatePreference(
        userId,
        "confirmation",
        "frequent",
        0.5
      );
    }

    // 根据使用的技术术语推断
    if (interaction.usedTechnicalTerms) {
      this.expertiseTracker.recordSignal(userId, "used_technical_term");
      this.preferenceStore.updatePreference(
        userId,
        "language_style",
        "technical",
        0.4
      );
    }
  }

  /** 获取个性化配置（供其他组件使用） */
  getPersonalizationConfig(userId: string): PersonalizationConfig {
    const profile = this.preferenceStore.getProfile(userId);
    const expertise = this.expertiseTracker.getProfile(userId);

    return {
      disclosureLevel: expertise.preferredDisclosureLevel,
      verbosity: profile.preferences.verbosity.value as
        | "verbose"
        | "balanced"
        | "concise",
      confirmationFrequency: profile.preferences.confirmation.value as
        | "minimal"
        | "moderate"
        | "frequent",
      showReasoningSteps:
        expertise.currentLevel >= ExpertiseLevel.ADVANCED,
      showConfidenceScores:
        expertise.currentLevel >= ExpertiseLevel.INTERMEDIATE,
      autoExpandErrors:
        profile.preferences.error_detail.value === "detailed",
      preferredResponseFormat: profile.preferences.response_format.value,
    };
  }
}

/** 个性化响应 */
interface PersonalizedResponse {
  originalResponse: string;
  adjustedResponse: string;
  adjustments: ResponseAdjustment[];
  userProfile: Record<string, string>;
}

/** 响应调整 */
interface ResponseAdjustment {
  type: "trim" | "expand" | "deepen" | "simplify" | "reformat";
  rule: string;
  applied: boolean;
}

/** 用户交互数据 */
interface UserInteraction {
  userMessageLength: number;
  expandedDetails: boolean;
  skippedConfirmation: boolean;
  requestedConfirmation: boolean;
  usedTechnicalTerms: boolean;
  responseRating?: number;
  interactionDurationMs: number;
}

/** 个性化配置 */
interface PersonalizationConfig {
  disclosureLevel: DisclosureLevel;
  verbosity: "verbose" | "balanced" | "concise";
  confirmationFrequency: "minimal" | "moderate" | "frequent";
  showReasoningSteps: boolean;
  showConfidenceScores: boolean;
  autoExpandErrors: boolean;
  preferredResponseFormat: string;
}
```

### 22.9.3 AXExperimentManager：A/B 测试管理

优秀的 AX 设计需要数据驱动。`AXExperimentManager` 支持对不同的交互策略进行 A/B 测试，基于用户反馈指标选择最优方案：

```typescript
// ============================================================
// AX 实验（A/B 测试）管理器
// ============================================================

/** 实验定义 */
interface Experiment {
  id: string;
  name: string;
  description: string;
  variants: ExperimentVariant[];
  targetMetric: string;
  secondaryMetrics: string[];
  status: "draft" | "running" | "paused" | "completed";
  startTime?: number;
  endTime?: number;
  minSampleSize: number;
  confidenceThreshold: number; // 统计显著性阈值
}

/** 实验变体 */
interface ExperimentVariant {
  id: string;
  name: string;
  description: string;
  weight: number; // 流量权重 (0-1)
  config: Record<string, unknown>;
}

/** 实验结果 */
interface ExperimentResult {
  variantId: string;
  sampleCount: number;
  metrics: Record<string, MetricSummary>;
}

/** 指标摘要 */
interface MetricSummary {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  sampleCount: number;
}

/** 实验分析 */
interface ExperimentAnalysis {
  experimentId: string;
  results: ExperimentResult[];
  winner?: string;
  isStatisticallySignificant: boolean;
  pValue: number;
  recommendation: string;
}

class AXExperimentManager {
  private experiments: Map<string, Experiment> = new Map();
  private userAssignments: Map<string, Map<string, string>> = new Map();
  private metricData: Map<
    string,
    Map<string, number[]>
  > = new Map(); // experimentId → variantId → metric values

  /** 创建实验 */
  createExperiment(experiment: Experiment): void {
    // 验证权重总和
    const totalWeight = experiment.variants.reduce(
      (sum, v) => sum + v.weight,
      0
    );
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      throw new Error(
        `变体权重之和必须为 1.0，当前为 ${totalWeight}`
      );
    }

    experiment.status = "draft";
    this.experiments.set(experiment.id, experiment);
    this.metricData.set(experiment.id, new Map());
  }

  /** 启动实验 */
  startExperiment(experimentId: string): void {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) throw new Error(`实验 ${experimentId} 不存在`);

    experiment.status = "running";
    experiment.startTime = Date.now();
  }

  /** 为用户分配变体 */
  assignVariant(userId: string, experimentId: string): ExperimentVariant {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status !== "running") {
      throw new Error(`实验 ${experimentId} 不存在或未运行`);
    }

    // 检查是否已分配
    let userExps = this.userAssignments.get(userId);
    if (!userExps) {
      userExps = new Map();
      this.userAssignments.set(userId, userExps);
    }

    const existingVariant = userExps.get(experimentId);
    if (existingVariant) {
      return experiment.variants.find((v) => v.id === existingVariant)!;
    }

    // 基于权重随机分配
    const rand = this.deterministicHash(userId + experimentId);
    let cumWeight = 0;
    for (const variant of experiment.variants) {
      cumWeight += variant.weight;
      if (rand < cumWeight) {
        userExps.set(experimentId, variant.id);
        return variant;
      }
    }

    // 兜底
    const lastVariant = experiment.variants[experiment.variants.length - 1];
    userExps.set(experimentId, lastVariant.id);
    return lastVariant;
  }

  /** 记录实验指标 */
  recordMetric(
    experimentId: string,
    userId: string,
    metricName: string,
    value: number
  ): void {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status !== "running") return;

    const userExps = this.userAssignments.get(userId);
    if (!userExps) return;

    const variantId = userExps.get(experimentId);
    if (!variantId) return;

    const expMetrics = this.metricData.get(experimentId)!;
    const key = `${variantId}:${metricName}`;
    if (!expMetrics.has(key)) {
      expMetrics.set(key, []);
    }
    expMetrics.get(key)!.push(value);
  }

  /** 分析实验结果 */
  analyzeExperiment(experimentId: string): ExperimentAnalysis {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) throw new Error(`实验 ${experimentId} 不存在`);

    const expMetrics = this.metricData.get(experimentId)!;
    const results: ExperimentResult[] = [];

    for (const variant of experiment.variants) {
      const metrics: Record<string, MetricSummary> = {};

      const allMetricNames = [
        experiment.targetMetric,
        ...experiment.secondaryMetrics,
      ];

      for (const metricName of allMetricNames) {
        const key = `${variant.id}:${metricName}`;
        const values = expMetrics.get(key) ?? [];
        metrics[metricName] = this.calculateMetricSummary(values);
      }

      results.push({
        variantId: variant.id,
        sampleCount: Object.values(metrics)[0]?.sampleCount ?? 0,
        metrics,
      });
    }

    // 统计显著性检验（简化版 Welch's t-test）
    const { pValue, isSignificant, winner } = this.performSignificanceTest(
      experiment,
      results
    );

    let recommendation: string;
    if (!isSignificant) {
      recommendation = "尚无统计显著差异，建议继续收集数据";
    } else if (winner) {
      const winnerVariant = experiment.variants.find(
        (v) => v.id === winner
      );
      recommendation = `建议采用变体 "${winnerVariant?.name}"，在目标指标上有显著优势`;
    } else {
      recommendation = "各变体表现相近，可根据其他因素决策";
    }

    return {
      experimentId,
      results,
      winner: isSignificant ? winner : undefined,
      isStatisticallySignificant: isSignificant,
      pValue,
      recommendation,
    };
  }

  /** 计算指标摘要 */
  private calculateMetricSummary(values: number[]): MetricSummary {
    if (values.length === 0) {
      return {
        mean: 0,
        stdDev: 0,
        min: 0,
        max: 0,
        p50: 0,
        p95: 0,
        sampleCount: 0,
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;
    const variance =
      values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) /
      values.length;

    return {
      mean,
      stdDev: Math.sqrt(variance),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      sampleCount: values.length,
    };
  }

  /** 显著性检验 */
  private performSignificanceTest(
    experiment: Experiment,
    results: ExperimentResult[]
  ): {
    pValue: number;
    isSignificant: boolean;
    winner: string | undefined;
  } {
    if (results.length < 2) {
      return { pValue: 1.0, isSignificant: false, winner: undefined };
    }

    const targetMetric = experiment.targetMetric;
    const metricsA = results[0].metrics[targetMetric];
    const metricsB = results[1].metrics[targetMetric];

    if (!metricsA || !metricsB || metricsA.sampleCount < 5 || metricsB.sampleCount < 5) {
      return { pValue: 1.0, isSignificant: false, winner: undefined };
    }

    // Welch's t-test 简化实现
    const seA = metricsA.stdDev / Math.sqrt(metricsA.sampleCount);
    const seB = metricsB.stdDev / Math.sqrt(metricsB.sampleCount);
    const seDiff = Math.sqrt(seA * seA + seB * seB);

    if (seDiff === 0) {
      return { pValue: 1.0, isSignificant: false, winner: undefined };
    }

    const tStat = Math.abs(metricsA.mean - metricsB.mean) / seDiff;

    // 简化 p-value 估算（使用正态近似）
    const pValue = 2 * (1 - this.normalCDF(tStat));

    const isSignificant = pValue < experiment.confidenceThreshold;
    let winner: string | undefined;
    if (isSignificant) {
      winner =
        metricsA.mean > metricsB.mean
          ? results[0].variantId
          : results[1].variantId;
    }

    return { pValue, isSignificant, winner };
  }

  /** 标准正态分布 CDF（近似） */
  private normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y =
      1.0 -
      ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
        t *
        Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  /** 确定性哈希（用于一致性分配） */
  private deterministicHash(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash) / 2147483647; // Normalize to 0-1
  }

  /** 停止实验 */
  stopExperiment(experimentId: string): ExperimentAnalysis {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) throw new Error(`实验 ${experimentId} 不存在`);

    experiment.status = "completed";
    experiment.endTime = Date.now();

    return this.analyzeExperiment(experimentId);
  }
}
```

---



## 22.10 Artifact 与 Canvas：从对话到工作区

传统的 AI 交互范式是**线性对话**：用户提问，AI 在聊天窗口中回复文本，用户手动复制结果到目标应用。这种模式在简单问答场景下运作良好，但当任务涉及代码编写、文档创作或数据可视化时，"一切都在聊天气泡里"的限制就变得尤为突出。2024 年，Claude Artifacts 和 ChatGPT Canvas 的相继推出，标志着 AI 交互从**对话范式**向**工作区范式**的重要跃迁。

### 22.10.1 范式转换：从线性对话到并排创作

**传统对话模式的痛点：**

```
用户: "帮我写一个 React 登录表单"
AI:   "好的，以下是代码：```tsx ... ``` "     ← 代码嵌在聊天气泡中
用户: "把密码字段改成支持显示/隐藏"
AI:   "已修改：```tsx ... ``` "                 ← 完整代码再次出现在新气泡中
用户: (需要手动对比两次回复，找出差异，复制最新版本)
```

**工作区模式的改进：**

```
用户: "帮我写一个 React 登录表单"
AI:   [聊天区] "我来创建一个登录表单"
      [工作区] ← 实时渲染可交互的登录组件

用户: "把密码字段改成支持显示/隐藏"
AI:   [聊天区] "已添加密码可见性切换"
      [工作区] ← 原地更新，高亮显示变更部分，可回退到上一版本
```

这一转变的核心是**关注点分离**：聊天区负责意图沟通与决策对话，工作区负责内容呈现与协作编辑。

### 22.10.2 Claude Artifacts：侧边栏渲染与版本管理

Claude 的 Artifacts 功能在对话窗口右侧打开一个**独立的渲染面板**，将代码、文档、SVG 图形和交互式组件从聊天流中提取出来，赋予它们独立的生命周期。

**关键设计特征：**

- **类型化 Artifact**：每个 Artifact 有明确的类型（代码、文档、HTML 应用、SVG、Mermaid 图表），系统根据类型选择渲染方式
- **版本链**：每次修改创建新版本，用户可以浏览完整的版本历史并回退到任意版本
- **交互式渲染**：HTML/React 类型的 Artifact 直接在沙箱中运行，用户可以与渲染结果交互（点击按钮、输入数据、查看动画）
- **引用对话**：Artifact 与生成它的对话轮次保持关联，用户可以追溯"为什么是这个版本"

```typescript
// ============================================================
// Artifact 系统核心类型定义
// ============================================================

/** Artifact 类型枚举 */
type ArtifactType =
  | 'code'           // 源代码（语法高亮，可复制）
  | 'document'       // 长文档（Markdown 渲染）
  | 'html-app'       // 可交互的 HTML/React 应用
  | 'svg'            // SVG 矢量图
  | 'mermaid'        // Mermaid 图表
  | 'spreadsheet';   // 表格数据

/** Artifact 规格定义 */
interface ArtifactSpec {
  /** 唯一标识 */
  id: string;
  /** Artifact 类型 */
  type: ArtifactType;
  /** 显示标题 */
  title: string;
  /** 内容主体 */
  content: string;
  /** 编程语言（type 为 'code' 时） */
  language?: string;
  /** 当前版本号 */
  version: number;
  /** 是否可渲染为交互式预览 */
  renderable: boolean;
  /** 创建此版本的对话轮次 ID */
  sourceMessageId: string;
  /** 创建时间 */
  createdAt: number;
}

/** Artifact 版本管理器 */
class ArtifactVersionManager {
  /** artifact ID → 版本历史 */
  private history = new Map<string, ArtifactSpec[]>();

  /** 创建新 Artifact */
  create(spec: Omit<ArtifactSpec, 'version' | 'createdAt'>): ArtifactSpec {
    const artifact: ArtifactSpec = {
      ...spec,
      version: 1,
      createdAt: Date.now(),
    };
    this.history.set(spec.id, [artifact]);
    return artifact;
  }

  /** 更新 Artifact（创建新版本） */
  update(
    id: string,
    changes: Partial<Pick<ArtifactSpec, 'title' | 'content' | 'language'>>,
    sourceMessageId: string
  ): ArtifactSpec {
    const versions = this.history.get(id);
    if (!versions || versions.length === 0) {
      throw new Error(`Artifact '${id}' not found`);
    }

    const current = versions[versions.length - 1];
    const newVersion: ArtifactSpec = {
      ...current,
      ...changes,
      version: current.version + 1,
      sourceMessageId,
      createdAt: Date.now(),
    };

    versions.push(newVersion);
    return newVersion;
  }

  /** 回退到指定版本 */
  rollback(id: string, targetVersion: number): ArtifactSpec {
    const versions = this.history.get(id);
    if (!versions) throw new Error(`Artifact '${id}' not found`);

    const target = versions.find(v => v.version === targetVersion);
    if (!target) throw new Error(`Version ${targetVersion} not found`);

    // 创建一个新版本，内容来自目标版本
    const rollbackVersion: ArtifactSpec = {
      ...target,
      version: versions[versions.length - 1].version + 1,
      sourceMessageId: `rollback-to-v${targetVersion}`,
      createdAt: Date.now(),
    };

    versions.push(rollbackVersion);
    return rollbackVersion;
  }

  /** 获取版本差异摘要 */
  getVersionDiff(id: string, fromVersion: number, toVersion: number): VersionDiff {
    const versions = this.history.get(id);
    if (!versions) throw new Error(`Artifact '${id}' not found`);

    const from = versions.find(v => v.version === fromVersion);
    const to = versions.find(v => v.version === toVersion);
    if (!from || !to) throw new Error('Version not found');

    return {
      artifactId: id,
      from: fromVersion,
      to: toVersion,
      titleChanged: from.title !== to.title,
      contentLengthDelta: to.content.length - from.content.length,
      timestamp: to.createdAt,
    };
  }

  /** 获取完整版本历史 */
  getHistory(id: string): ArtifactSpec[] {
    return [...(this.history.get(id) || [])];
  }
}

interface VersionDiff {
  artifactId: string;
  from: number;
  to: number;
  titleChanged: boolean;
  contentLengthDelta: number;
  timestamp: number;
}
```

### 22.10.3 ChatGPT Canvas：协作式文档编辑

与 Claude Artifacts 的"侧边渲染面板"不同，ChatGPT Canvas 采用了更激进的设计——**直接用协作编辑器替换聊天窗口**。当用户开始一个写作或编码任务时，对话界面切换为类似 Google Docs 的编辑器，用户和 AI 在同一文档上协作。

**关键设计特征：**

- **内联编辑**：AI 的修改直接出现在文档中，以高亮标注。用户也可以选中文本让 AI 修改特定段落
- **双模式**：写作模式（文章、报告、邮件）和编码模式（代码编辑、调试、重构），各自提供不同的上下文快捷操作
- **快捷操作栏**：写作模式提供"调整长度"、"调整阅读水平"、"添加 Emoji"等操作；编码模式提供"添加注释"、"修复 Bug"、"添加日志"等操作
- **全文感知**：AI 始终感知完整文档上下文，而非仅回复最近一条消息

```typescript
// ============================================================
// Canvas 协作编辑模型
// ============================================================

/** Canvas 文档状态 */
interface CanvasDocument {
  id: string;
  mode: 'writing' | 'coding';
  content: string;
  language?: string;
  /** AI 编辑的区域标记 */
  aiEdits: InlineEdit[];
  /** 用户选区（用于指示 AI 编辑特定部分） */
  userSelection?: TextSelection;
}

/** 内联编辑标记 */
interface InlineEdit {
  /** 编辑区域的起始偏移 */
  startOffset: number;
  /** 编辑区域的结束偏移 */
  endOffset: number;
  /** 原始文本 */
  originalText: string;
  /** 替换文本 */
  newText: string;
  /** 编辑类型 */
  editType: 'insertion' | 'deletion' | 'replacement';
  /** 是否已被用户接受 */
  accepted: boolean;
}

/** 用户文本选区 */
interface TextSelection {
  start: number;
  end: number;
  /** 用户对选中文本的指令 */
  instruction?: string;
}

/** Canvas 快捷操作定义 */
interface CanvasShortcut {
  id: string;
  label: string;
  mode: 'writing' | 'coding' | 'both';
  /** 快捷操作对应的 Prompt 模板 */
  promptTemplate: string;
  /** 图标 */
  icon: string;
}

/** 预置快捷操作 */
const CANVAS_SHORTCUTS: CanvasShortcut[] = [
  // 写作模式
  { id: 'adjust-length', label: '调整长度', mode: 'writing',
    promptTemplate: '将选中内容的长度调整为{{target}}', icon: '↔️' },
  { id: 'reading-level', label: '调整阅读水平', mode: 'writing',
    promptTemplate: '将选中内容调整为{{level}}的阅读水平', icon: '📊' },
  { id: 'polish', label: '润色', mode: 'writing',
    promptTemplate: '润色选中内容，保持原意但提升表达质量', icon: '✨' },
  // 编码模式
  { id: 'add-comments', label: '添加注释', mode: 'coding',
    promptTemplate: '为选中的代码添加详细的行内注释', icon: '💬' },
  { id: 'fix-bugs', label: '修复 Bug', mode: 'coding',
    promptTemplate: '检查并修复选中代码中的潜在 Bug', icon: '🔧' },
  { id: 'add-logging', label: '添加日志', mode: 'coding',
    promptTemplate: '在关键位置添加结构化日志输出', icon: '📝' },
  { id: 'port-language', label: '转换语言', mode: 'coding',
    promptTemplate: '将选中代码转换为{{targetLanguage}}', icon: '🔄' },
];
```

### 22.10.4 构建 Artifact 风格 UX 的设计原则

如果你在自己的 Agent 产品中实现类似的 Artifact/Canvas 体验，以下是关键的设计原则和工程考量：

**原则 1：内容与对话分离**

将 Agent 的输出分为两类：**对话性内容**（解释、确认、提问）留在聊天区，**创作性内容**（代码、文档、图表）提取到工作区。这种分离减少聊天区的信息过载，同时让创作内容获得更好的渲染和交互空间。

**原则 2：版本化一切可编辑内容**

每次 AI 修改都应创建新版本而非覆盖。用户需要能浏览历史、对比差异和回退。这不仅是功能需求，更是**信任基础**——用户不会担心 AI 的修改破坏了之前满意的结果。

**原则 3：渐进式渲染**

对于复杂的 Artifact（如可交互的 React 应用），采用**增量渲染**策略：先展示代码骨架 → 语法高亮 → 类型检查通过 → 编译成功 → 渲染交互式预览。每一步都给用户反馈，避免长时间白屏。

```typescript
// ============================================================
// Artifact 渲染管道
// ============================================================

/** 渲染阶段 */
type RenderStage =
  | 'raw'           // 原始文本
  | 'highlighted'   // 语法高亮
  | 'validated'     // 类型/语法检查通过
  | 'compiled'      // 编译成功
  | 'interactive';  // 可交互预览

/** 渲染管道 */
class ArtifactRenderPipeline {
  private stageListeners = new Map<RenderStage, ((artifact: ArtifactSpec) => void)[]>();

  /** 注册阶段完成回调 */
  onStage(stage: RenderStage, callback: (artifact: ArtifactSpec) => void): void {
    const listeners = this.stageListeners.get(stage) || [];
    listeners.push(callback);
    this.stageListeners.set(stage, listeners);
  }

  /** 执行渲染管道 */
  async render(artifact: ArtifactSpec): Promise<RenderResult> {
    const stages: RenderStage[] = this.getStagesForType(artifact.type);
    const results: StageResult[] = [];

    for (const stage of stages) {
      try {
        const result = await this.executeStage(stage, artifact);
        results.push({ stage, success: true, output: result });
        // 每完成一个阶段就通知 UI 更新
        this.notifyListeners(stage, artifact);
      } catch (error) {
        results.push({ stage, success: false, error: String(error) });
        // 渲染失败时降级到上一个成功阶段
        break;
      }
    }

    const lastSuccess = results.filter(r => r.success).pop();
    return {
      artifactId: artifact.id,
      finalStage: lastSuccess?.stage || 'raw',
      stages: results,
    };
  }

  private getStagesForType(type: ArtifactType): RenderStage[] {
    switch (type) {
      case 'html-app':
        return ['raw', 'highlighted', 'validated', 'compiled', 'interactive'];
      case 'code':
        return ['raw', 'highlighted', 'validated'];
      case 'document':
        return ['raw', 'highlighted']; // Markdown 渲染
      case 'svg':
      case 'mermaid':
        return ['raw', 'validated', 'interactive'];
      default:
        return ['raw'];
    }
  }

  private async executeStage(
    stage: RenderStage,
    artifact: ArtifactSpec
  ): Promise<string> {
    // 各阶段的具体渲染逻辑
    switch (stage) {
      case 'highlighted':
        return this.applySyntaxHighlighting(artifact);
      case 'validated':
        return this.validateSyntax(artifact);
      case 'compiled':
        return this.compileToExecutable(artifact);
      case 'interactive':
        return this.createInteractivePreview(artifact);
      default:
        return artifact.content;
    }
  }

  private applySyntaxHighlighting(artifact: ArtifactSpec): string {
    // 基于语言类型应用语法高亮
    return `<highlighted lang="${artifact.language}">${artifact.content}</highlighted>`;
  }

  private validateSyntax(artifact: ArtifactSpec): string {
    // 基础语法检查
    return artifact.content;
  }

  private compileToExecutable(artifact: ArtifactSpec): string {
    // 编译为可执行代码（沙箱环境）
    return artifact.content;
  }

  private createInteractivePreview(artifact: ArtifactSpec): string {
    // 在隔离的 iframe/sandbox 中渲染
    return `<sandbox>${artifact.content}</sandbox>`;
  }

  private notifyListeners(stage: RenderStage, artifact: ArtifactSpec): void {
    const listeners = this.stageListeners.get(stage) || [];
    for (const listener of listeners) {
      listener(artifact);
    }
  }
}

interface StageResult {
  stage: RenderStage;
  success: boolean;
  output?: string;
  error?: string;
}

interface RenderResult {
  artifactId: string;
  finalStage: RenderStage;
  stages: StageResult[];
}
```

### 22.10.5 对 Agent 架构的影响

Artifact/Canvas 范式不仅是 UI 层的变化，它对 Agent 的底层架构提出了新的要求：

**1. 结构化输出格式感知**

Agent 不再仅仅输出自然语言文本，还需要理解何时应创建 Artifact、何时应更新已有 Artifact、何时应在对话中直接回复。这要求 Agent 具备**输出路由**能力。

**2. 扩展的工具调用模式**

传统 Agent 的工具是外部 API 调用（搜索、计算、数据库查询）。在 Artifact 范式下，Agent 需要新的**内部工具**来操作工作区：

```typescript
// ============================================================
// Artifact 相关的 Agent 工具定义
// ============================================================

/** Artifact 工具集 */
interface ArtifactTools {
  /** 创建新 Artifact */
  create_artifact: {
    params: {
      type: ArtifactType;
      title: string;
      content: string;
      language?: string;
    };
    returns: { artifactId: string; version: number };
  };

  /** 更新已有 Artifact */
  update_artifact: {
    params: {
      artifactId: string;
      /** 完整替换或增量编辑 */
      updateMode: 'full-replace' | 'patch';
      content: string;
      /** patch 模式下的编辑操作 */
      patches?: Array<{
        operation: 'insert' | 'delete' | 'replace';
        offset: number;
        length?: number;
        text?: string;
      }>;
    };
    returns: { version: number; changesSummary: string };
  };

  /** 渲染 Artifact 为可交互预览 */
  render_artifact: {
    params: {
      artifactId: string;
      /** 渲染目标 */
      target: 'preview' | 'fullscreen' | 'export';
    };
    returns: { rendered: boolean; previewUrl?: string };
  };
}
```

**3. 更长的上下文需求**

每个 Artifact 的完整版本历史都可能被纳入上下文。一个经过 10 次迭代的代码 Artifact 意味着 Agent 需要感知完整的修改历史。这对上下文窗口管理提出了更高要求——需要智能地摘要历史版本、只保留最近的完整版本和变更差异。

**4. 协作状态同步**

当用户直接在工作区编辑内容（而非通过对话指令），Agent 需要感知这些"带外修改"并更新自己的内部状态。这要求建立双向的状态同步机制，类似于实时协作编辑中的 Operational Transformation（OT）或 CRDT。

> **与 22.3 的联系：** Artifact/Canvas 交互本质上是本章 `ConversationStateMachine` 的扩展——对话状态机需要新增 `editing` 状态和 `artifact_created`、`artifact_updated` 等事件，以支持在对话与工作区之间的流畅切换。

---

## 22.11 本章小结

### 核心要点

本章系统性地探讨了 Agent Experience（AX）设计的理论框架与工程实践。从 CLEAR 原则到具体的 TypeScript 实现，我们构建了一套完整的 AX 工具链。以下是十个核心要点：

**1. AX 不等于 UX——范式已经改变**

传统 UX 关注"用户如何使用工具"，AX 关注"用户如何与自主智能体协作"。Agent 具有概率性、自主性和不可预测性，这要求全新的设计思维。我们通过 UX vs AX 对比表清晰展示了这种范式转变。

**2. CLEAR 框架是 AX 设计的基石**

Controllable（可控）、Legible（可读）、Efficient（高效）、Adaptive（自适应）、Recoverable（可恢复）——这五个维度构成了评估 Agent 交互质量的完整框架。`AXDesignSystem` 将这些原则转化为可验证的规则集，而 `AXAuditor` 在运行时持续监控体验质量。

**3. 渐进式信息披露解决了信息过载与透明度的矛盾**

Agent 天然产生大量中间信息。`ProgressiveDisclosureManager` 的四层披露模型（标题→详情→依据→原始）让用户按需获取信息。结合 `UserExpertiseTracker` 的自动专业度识别，系统能智能调整默认展示粒度。

**4. 对话控制需要状态机级的严谨设计**

`ConversationStateMachine` 定义了 Agent 交互的完整生命周期：idle → thinking → executing → completed，以及暂停、中断、错误等分支路径。`ActionUndoManager` 为用户提供了操作撤销能力。多轮澄清模式（`ClarificationManager`）让 Agent 在模糊场景下能优雅地请求更多信息。

> **与第 3 章的联系：** 对话状态机的设计直接对应第 3 章中 Agent 架构的"控制循环"模式。体验层的状态转换是架构层 ReAct/Plan-and-Execute 循环的用户可见映射。

**5. 嵌套进度和动态 ETA 是长任务的必备体验**

`EnhancedProgressTracker` 支持三级嵌套进度（整体→阶段→步骤），通过移动平均、历史数据和预估时长多方法融合来计算 ETA。`TransparencyEngine` 在四个透明度级别（最小→摘要→详细→调试）之间灵活切换，让不同用户看到合适的推理过程。

**6. 信任需要校准，而不只是展示**

LLM 通常过度自信——声称 90% 确信的内容实际准确率可能只有 70%。`ConfidenceCalibrator` 基于历史数据对原始置信度进行校准，使用 ECE（Expected Calibration Error）指标量化校准质量。`TrustSignalSystem` 将置信度分解为事实性、完整度、时效性、一致性四个维度，帮助用户做出校准的信任决策。

> **与第 14 章的联系：** 本章的信任信号设计是第 14 章"Agent 信任架构"在交互层的具体落地。技术层的信任评估通过 AX 层的信号设计传递给用户，形成完整的信任链路。

**7. 失败体验是 Agent 成熟度的试金石**

Agent 系统有六大类独特的错误模式（LLM 错误、工具失败、超时、歧义、预算耗尽、安全拒绝）。`ErrorExperienceManager` 为每种错误提供用户友好的信息模板，`RecoverySuggestionEngine` 基于错误上下文自动生成恢复建议（重试、修改、替代、升级）。`GracefulDegradationManager` 定义了五级降级策略，确保核心服务不可用时系统仍能提供有限但有用的服务。

**8. 多模态输出让 Agent 沟通更高效**

不同类型的信息有最佳表达形式：代码需要语法高亮，对比数据适合表格，趋势适合图表，操作确认适合按钮。`MultimodalRenderer` 解析 Agent 输出并自动选择最优渲染方式，`ResponseFormatSelector` 基于数据特征推荐格式，`AdaptiveLayoutEngine` 处理响应式布局。

**9. 流式输出远比"逐字显示"复杂**

生产级流式渲染需要处理增量 Markdown 解析、工具调用状态指示、结构化数据流和回压控制。`ProductionStreamingRenderer` 基于 `StreamingProtocol` 事件协议处理 11 种事件类型，`IncrementalMarkdownParser` 在不完整语法的情况下安全渲染已确认内容。

**10. 个性化是 AX 的长期竞争力**

`PersonalizationEngine` 从用户交互中持续学习偏好（详细度、技术深度、确认频率、语言风格），`UserPreferenceStore` 以带衰减的置信度模型管理偏好数据。`AXExperimentManager` 支持对不同交互策略进行 A/B 测试，通过 Welch's t-test 统计检验驱动数据化决策。

> **与第 21 章的联系：** 个性化引擎的偏好数据和实验结果是 Agent 生态平台（第 21 章）中用户画像系统的重要输入。在多 Agent 协作生态中，统一的偏好系统让用户在不同 Agent 之间获得一致的个性化体验。

### 本章组件关系图

```
                    ┌─────────────────────────────────┐
                    │        AXDesignSystem            │
                    │   (CLEAR 原则验证 + AXAuditor)    │
                    └──────────┬──────────────────────┘
                               │ 验证和审计
        ┌──────────┬───────────┼───────────┬──────────┐
        ▼          ▼           ▼           ▼          ▼
   ┌─────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌─────────┐
   │Progressive│ │Conver- │ │Enhanced│ │ Trust  │ │ Error   │
   │Disclosure │ │sation  │ │Progress│ │Signal  │ │Experience│
   │Manager   │ │State   │ │Tracker │ │System  │ │Manager  │
   │(22.2)    │ │Machine │ │(22.4)  │ │(22.5)  │ │(22.6)   │
   └────┬─────┘ │(22.3)  │ └───┬────┘ └───┬────┘ └────┬────┘
        │       └───┬────┘     │           │           │
        ▼           ▼          ▼           ▼           ▼
   ┌─────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌─────────┐
   │UserExper-│ │Action  │ │Transpa-│ │Confide-│ │Recovery │
   │tiseTrack-│ │Undo    │ │rency   │ │nce     │ │Suggest  │
   │er        │ │Manager │ │Engine  │ │Calibra-│ │Engine   │
   └─────┬────┘ └────────┘ └────────┘ │tor     │ └─────────┘
         │                             └────────┘
         ▼
   ┌──────────────────────────────────────────────────────┐
   │              PersonalizationEngine (22.9)             │
   │  UserPreferenceStore + AXExperimentManager            │
   └───────────────────────┬──────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │Multimodal│ │Production│ │ Graceful │
        │Renderer  │ │Streaming │ │Degradat- │
        │(22.7)    │ │Renderer  │ │ion Mgr   │
        └──────────┘ │(22.8)    │ └──────────┘
                     └──────────┘
```

### 展望：Part 10 实战案例

在接下来的 Part 10 中，我们将把本章介绍的 AX 设计原则和组件应用到真实的 Agent 系统中。你将看到：

- 如何在一个完整的编码助手 Agent 中集成 `ConversationStateMachine`、`EnhancedProgressTracker` 和 `TrustSignalSystem`，实现从用户提问到代码生成全流程的优质体验。
- 如何利用 `PersonalizationEngine` 让客服 Agent 根据不同客户的沟通风格自动调整交互策略。
- 如何通过 `AXExperimentManager` 进行数据驱动的体验优化，并用 `AXAuditor` 持续监控体验质量。

AX 设计不是一次性工程，而是持续迭代的过程。正如软件架构需要持续演进（第 3 章），信任需要持续维护（第 14 章），生态需要持续培育（第 21 章）——Agent 体验也需要通过数据驱动、用户反馈和技术创新持续提升。最终目标是让人与 Agent 的协作变得自然、高效、令人信赖。

---

> **本章完整代码仓库：** 所有 TypeScript 实现均可在配套代码仓库的 `ch22-agent-experience/` 目录中找到，包含完整的类型定义、单元测试和集成示例。

