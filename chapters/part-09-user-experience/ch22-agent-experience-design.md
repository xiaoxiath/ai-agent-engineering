# 第 22 章 Agent Experience（AX）设计

本章讲解 Agent 用户体验设计——如何让 Agent 不仅"能用"而且"好用"。Agent 的交互模式从传统的 GUI 操作转变为自然语言对话，这需要一套全新的用户体验设计方法论。本章覆盖 Agent 对话设计、透明度与可解释性、错误恢复体验、渐进式信任建立和多模态交互设计。前置依赖：第 14 章信任架构（人机协作设计）。

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
| **错误类型** | 明确的错误码和状态 | 模糊的幻觉（Hallucination）、遗漏和偏差 |
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
  // ... 省略 92 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 7 行
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
  // ... 省略 262 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 398 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 258 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 220 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 166 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 120 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 333 行，完整实现见 code-examples/ 对应目录

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
  // ... 省略 239 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 212 行，完整实现见 code-examples/ 对应目录

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
  // ... 省略 456 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 299 行，完整实现见 code-examples/ 对应目录

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
  // ... 省略 269 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 190 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 256 行，完整实现见 code-examples/ 对应目录
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

  // ... 省略 322 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 141 行，完整实现见 code-examples/ 对应目录

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
  // ... 省略 316 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 127 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 108 行，完整实现见 code-examples/ 对应目录

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
  // ... 省略 99 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 297 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 183 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 326 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 315 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 112 行，完整实现见 code-examples/ 对应目录
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
  // ... 省略 7 行
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
  // ... 省略 108 行，完整实现见 code-examples/ 对应目录

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
  // ... 省略 7 行
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

传统 UX 关注"用户如何使用工具"，AX 关注"用户如何与自主Agent协作"。Agent 具有概率性、自主性和不可预测性，这要求全新的设计思维。我们通过 UX vs AX 对比表清晰展示了这种范式转变。

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
  // ... 省略 7 行
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

> **本章完整代码仓库：** 所有 TypeScript 实现均可在配套代码仓库的 `ch22-Agent-experience/` 目录中找到，包含完整的类型定义、单元测试和集成示例。
