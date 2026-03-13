# 第 17 章：可观测性工程 — 追踪、指标与日志

> **"你无法改进你无法衡量的东西。"** —— Peter Drucker
>
> 在 Agent 系统中，这句话需要更新为：**"你无法调试你无法观测的东西。"** 当一个 Agent 在生产环境中做出了错误的决策、调用了不该调用的工具、或者消耗了异常数量的 Token 时，如果没有完善的可观测性体系，你将面对一个彻底的黑盒。

在第 14 章中，我们建立了 Agent 信任架构的基础，确保 Agent 的行为在安全边界内运行。但信任不仅仅是约束 —— 它还需要**验证**。可观测性工程正是这种验证的技术实现：通过追踪每一次决策路径、量化每一个性能指标、记录每一条关键日志，我们构建了一个能够回答"Agent 到底做了什么、为什么这么做、花了多少成本"的完整体系。

本章将从 OpenTelemetry 的三大支柱出发，深入构建一套专为 AI Agent 设计的可观测性平台。我们不仅覆盖传统的 APM（Application Performance Monitoring）能力，更要解决 Agent 系统特有的挑战：非确定性执行路径、LLM 黑盒推理、多 Agent 协作链路追踪、以及 Token 成本归因。

---

## 17.1 可观测性三大支柱

### 17.1.1 从传统 APM 到 Agent 可观测性

传统的应用性能监控（APM）专注于请求-响应模型：一个 HTTP 请求进入系统，经过一系列确定性的服务调用，最终返回响应。在这种模型中，追踪一条请求链路、统计各服务延迟、记录错误日志，已经足以支撑运维需求。

但 Agent 系统打破了这一范式。考虑一个典型的 Agent 执行过程：

1. 用户发出一个看似简单的请求："帮我分析上季度销售数据并生成报告"
2. Agent 需要**自主决策**调用哪些工具、以什么顺序调用
3. 每一次 LLM 推理的结果**不可预测** —— 相同的输入可能产生不同的执行路径
4. 执行过程可能需要**多轮迭代**，每轮都包含推理和工具调用
5. 在多 Agent 架构中，任务可能被**分发到多个子 Agent**，形成复杂的协作链路

这些特性使得传统 APM 工具在以下方面显得力不从心：

| 维度 | 传统 APM | Agent 系统需求 |
|------|---------|---------------|
| 执行路径 | 确定性、可预测 | 非确定性、每次可能不同 |
| 延迟分布 | 毫秒级、分布集中 | 秒到分钟级、分布离散 |
| 成本模型 | 按计算资源计费 | 按 Token 用量计费，且不同模型价格差异大 |
| 错误类型 | 异常、超时、HTTP 错误码 | 幻觉、推理错误、工具滥用、无限循环 |
| 因果分析 | 服务依赖图明确 | Agent 自主决策，因果链需要从推理日志重建 |
| 质量衡量 | 可用性、延迟、吞吐量 | 任务完成质量、答案准确性、决策合理性 |

### 17.1.2 三大支柱在 Agent 系统中的映射

可观测性的三大支柱 —— 追踪（Traces）、指标（Metrics）、日志（Logs）—— 在 Agent 系统中需要被重新诠释：

| 支柱 | 传统定义 | Agent 系统中的扩展 | 典型问题示例 |
|------|---------|-------------------|-------------|
| **Traces（追踪）** | 分布式请求链路追踪 | Agent 决策链路追踪：request → agent_loop → llm_call → tool_call → sub_agent | "这个任务为什么调用了 5 次搜索工具？" |
| **Metrics（指标）** | 计数器、直方图、摘要 | Token 消耗、任务成功率、决策路径分布、工具调用频率、成本归因 | "过去一小时的平均 Token 消耗为什么翻倍了？" |
| **Logs（日志）** | 应用日志、错误日志 | LLM 交互日志、Agent 推理过程日志、工具输入输出日志（含脱敏） | "Agent 在第三轮迭代中为什么选择了错误的工具？" |

这三者不是孤立的 —— 它们通过 **Trace ID** 和 **Correlation ID** 关联在一起，形成一个多维度的观测体系。当一个告警触发时，你可以：

1. 从**指标**发现异常（如 Token 消耗突增）
2. 通过**追踪**定位到具体的请求链路
3. 通过**日志**查看该链路中每一步的详细推理过程

### 17.1.3 Agent 系统的独特挑战

在深入技术实现之前，让我们明确 Agent 系统在可观测性方面的核心挑战：

**挑战一：非确定性执行路径**

同一个用户请求，在不同时间执行可能走完全不同的代码路径。传统追踪系统假设路径是稳定的，但 Agent 系统中每次 LLM 推理都可能产生不同的决策。这意味着我们不能仅仅追踪"请求经过了哪些服务"，还需要追踪"Agent 做了哪些决策以及为什么"。

**挑战二：LLM 黑盒性**

LLM 调用是 Agent 系统中最核心的组件，但它本身是一个黑盒。我们无法观测模型内部的推理过程，只能通过输入（Prompt）和输出（Completion）来推断。这要求我们在可观测性设计中特别关注 LLM 调用的上下文记录。

**挑战三：多 Agent 协作的链路追踪**

当多个 Agent 协作完成一个任务时，追踪上下文需要在 Agent 之间正确传播。这类似于微服务架构中的分布式追踪，但增加了 Agent 自主决策带来的动态路由复杂性。

**挑战四：成本归因**

每次 LLM 调用都有真金白银的成本。不同的模型（GPT-4 vs GPT-3.5）、不同的上下文长度、不同的输出长度，成本差异可能达到 10 倍以上。可观测性系统需要能够精确追踪和归因这些成本。

**挑战五：质量评估**

传统系统的"成功"是二元的 —— 请求要么成功要么失败。但 Agent 系统的质量是一个连续谱：任务可能"完成了但质量不高"、"部分完成"、"完成了但花费过多资源"。

### 17.1.4 可观测性成熟度模型

基于上述挑战，我们定义一个四级成熟度模型，帮助团队评估和改进其 Agent 可观测性体系：

| 等级 | 名称 | 描述 | 关键能力 |
|------|------|------|---------|
| L1 | 基础日志 | 有日志记录，但缺乏结构化和关联性 | 文本日志、基础错误监控 |
| L2 | 结构化观测 | 结构化日志 + 基础指标 + 简单追踪 | JSON 日志、请求级追踪、Token 计数 |
| L3 | 深度洞察 | 完整三大支柱 + Agent 专属指标 + 成本追踪 | 决策链路追踪、成本归因、告警体系 |
| L4 | 智能分析 | 行为分析 + 异常检测 + 自动修复 | 决策模式分析、异常自动检测、自愈能力 |

下面我们实现一个成熟度评估工具：

```typescript
// ============================================================
// 可观测性成熟度评估器
// ============================================================

/** 成熟度等级定义 */
enum MaturityLevel {
  L1_BASIC_LOGGING = 1,
  L2_STRUCTURED_OBSERVABILITY = 2,
  L3_DEEP_INSIGHT = 3,
  L4_INTELLIGENT_ANALYSIS = 4,
}

/** 评估维度 */
interface MaturityDimension {
  name: string;
  description: string;
  currentLevel: MaturityLevel;
  criteria: Record<MaturityLevel, string>;
  score: number; // 0-100
}

/** 评估报告 */
interface MaturityReport {
  overallLevel: MaturityLevel;
  overallScore: number;
  dimensions: MaturityDimension[];
  recommendations: string[];
  timestamp: string;
}

/** 可观测性能力清单 */
interface ObservabilityCapabilities {
  // L1 能力
  hasBasicLogging: boolean;
  hasErrorMonitoring: boolean;

  // L2 能力
  hasStructuredLogs: boolean;
  hasRequestTracing: boolean;
  hasBasicMetrics: boolean;
  hasTokenCounting: boolean;

  // L3 能力
  hasDistributedTracing: boolean;
  hasDecisionPathTracing: boolean;
  hasCostAttribution: boolean;
  hasAlertSystem: boolean;
  hasAgentSpecificMetrics: boolean;
  hasSLODefinitions: boolean;

  // L4 能力
  hasBehaviorAnalysis: boolean;
  hasAnomalyDetection: boolean;
  hasAutoRemediation: boolean;
  hasSessionReplay: boolean;
  hasPredictiveAlerts: boolean;
}

class ObservabilityMaturityAssessor {
  /** 评估维度定义 */
  private readonly dimensionDefinitions = [
    {
      name: "日志能力",
      description: "结构化日志、关联性、脱敏能力",
      criteriaKeys: {
        [MaturityLevel.L1_BASIC_LOGGING]: "hasBasicLogging",
        [MaturityLevel.L2_STRUCTURED_OBSERVABILITY]: "hasStructuredLogs",
        [MaturityLevel.L3_DEEP_INSIGHT]: "hasCostAttribution",
        [MaturityLevel.L4_INTELLIGENT_ANALYSIS]: "hasBehaviorAnalysis",
      } as Record<MaturityLevel, keyof ObservabilityCapabilities>,
      criteriaDescriptions: {
        [MaturityLevel.L1_BASIC_LOGGING]: "文本日志输出，基础错误记录",
        [MaturityLevel.L2_STRUCTURED_OBSERVABILITY]:
          "JSON 结构化日志，包含 Trace ID 关联",
        [MaturityLevel.L3_DEEP_INSIGHT]:
          "上下文丰富的日志，含 Agent 状态、成本信息、敏感数据脱敏",
        [MaturityLevel.L4_INTELLIGENT_ANALYSIS]:
          "日志驱动的行为分析，自动异常模式识别",
      } as Record<MaturityLevel, string>,
    },
    {
      name: "追踪能力",
      description: "分布式追踪、决策链路、多 Agent 协作追踪",
      criteriaKeys: {
        [MaturityLevel.L1_BASIC_LOGGING]: "hasErrorMonitoring",
        [MaturityLevel.L2_STRUCTURED_OBSERVABILITY]: "hasRequestTracing",
        [MaturityLevel.L3_DEEP_INSIGHT]: "hasDistributedTracing",
        [MaturityLevel.L4_INTELLIGENT_ANALYSIS]: "hasSessionReplay",
      } as Record<MaturityLevel, keyof ObservabilityCapabilities>,
      criteriaDescriptions: {
        [MaturityLevel.L1_BASIC_LOGGING]: "基础错误监控和请求日志",
        [MaturityLevel.L2_STRUCTURED_OBSERVABILITY]:
          "请求级追踪，包含 LLM 调用 span",
        [MaturityLevel.L3_DEEP_INSIGHT]:
          "完整决策链路追踪，多 Agent 上下文传播",
        [MaturityLevel.L4_INTELLIGENT_ANALYSIS]:
          "会话回放，决策路径可视化与分析",
      } as Record<MaturityLevel, string>,
    },
    {
      name: "指标能力",
      description: "业务指标、性能指标、成本指标、质量指标",
      criteriaKeys: {
        [MaturityLevel.L1_BASIC_LOGGING]: "hasErrorMonitoring",
        [MaturityLevel.L2_STRUCTURED_OBSERVABILITY]: "hasBasicMetrics",
        [MaturityLevel.L3_DEEP_INSIGHT]: "hasAgentSpecificMetrics",
        [MaturityLevel.L4_INTELLIGENT_ANALYSIS]: "hasAnomalyDetection",
      } as Record<MaturityLevel, keyof ObservabilityCapabilities>,
      criteriaDescriptions: {
        [MaturityLevel.L1_BASIC_LOGGING]: "基础错误计数和系统资源监控",
        [MaturityLevel.L2_STRUCTURED_OBSERVABILITY]:
          "请求量、延迟、Token 消耗基础统计",
        [MaturityLevel.L3_DEEP_INSIGHT]:
          "Agent 专属指标体系，SLO/SLI，成本归因",
        [MaturityLevel.L4_INTELLIGENT_ANALYSIS]:
          "基于时序数据的异常检测和预测性告警",
      } as Record<MaturityLevel, string>,
    },
    {
      name: "告警与响应",
      description: "告警规则、事件响应、自动修复",
      criteriaKeys: {
        [MaturityLevel.L1_BASIC_LOGGING]: "hasErrorMonitoring",
        [MaturityLevel.L2_STRUCTURED_OBSERVABILITY]: "hasTokenCounting",
        [MaturityLevel.L3_DEEP_INSIGHT]: "hasAlertSystem",
        [MaturityLevel.L4_INTELLIGENT_ANALYSIS]: "hasAutoRemediation",
      } as Record<MaturityLevel, keyof ObservabilityCapabilities>,
      criteriaDescriptions: {
        [MaturityLevel.L1_BASIC_LOGGING]: "仅在错误发生后被动发现",
        [MaturityLevel.L2_STRUCTURED_OBSERVABILITY]:
          "基础阈值告警（如 Token 超限）",
        [MaturityLevel.L3_DEEP_INSIGHT]:
          "多条件告警规则，告警分组去重，响应 Runbook",
        [MaturityLevel.L4_INTELLIGENT_ANALYSIS]:
          "自动修复能力，如自动降级模型、重试策略调整",
      } as Record<MaturityLevel, string>,
    },
  ];

  /**
   * 执行成熟度评估
   */
  assess(capabilities: ObservabilityCapabilities): MaturityReport {
    const dimensions: MaturityDimension[] = this.dimensionDefinitions.map(
      (def) => {
        let currentLevel = MaturityLevel.L1_BASIC_LOGGING;
        let score = 0;

        // 逐级检查，找到当前达到的最高等级
        const levels = [
          MaturityLevel.L1_BASIC_LOGGING,
          MaturityLevel.L2_STRUCTURED_OBSERVABILITY,
          MaturityLevel.L3_DEEP_INSIGHT,
          MaturityLevel.L4_INTELLIGENT_ANALYSIS,
        ];

        for (const level of levels) {
          const capKey = def.criteriaKeys[level];
          if (capabilities[capKey]) {
            currentLevel = level;
            score = level * 25;
          } else {
            break; // 一旦某级别不满足，不再检查更高级别
          }
        }

        return {
          name: def.name,
          description: def.description,
          currentLevel,
          criteria: def.criteriaDescriptions,
          score,
        };
      }
    );

    // 总体等级取所有维度的最低等级（木桶原理）
    const overallLevel = Math.min(
      ...dimensions.map((d) => d.currentLevel)
    ) as MaturityLevel;

    const overallScore = Math.round(
      dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length
    );

    const recommendations = this.generateRecommendations(
      dimensions,
      capabilities
    );

    return {
      overallLevel,
      overallScore,
      dimensions,
      recommendations,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 根据评估结果生成改进建议
   */
  private generateRecommendations(
    dimensions: MaturityDimension[],
    capabilities: ObservabilityCapabilities
  ): string[] {
    const recommendations: string[] = [];

    // 找出最薄弱的维度
    const weakest = dimensions.reduce((min, d) =>
      d.score < min.score ? d : min
    );

    recommendations.push(
      `优先改进「${weakest.name}」维度 —— 当前仅达到 L${weakest.currentLevel} 等级`
    );

    // 针对具体缺失能力给出建议
    if (!capabilities.hasStructuredLogs) {
      recommendations.push(
        "引入结构化日志框架（如本章 17.4 节的 AgentStructuredLogger），" +
          "将所有日志输出为 JSON 格式并包含 Trace ID"
      );
    }

    if (!capabilities.hasDistributedTracing) {
      recommendations.push(
        "部署 OpenTelemetry SDK 并实现完整的 Agent 决策链路追踪（参见 17.2 节）"
      );
    }

    if (!capabilities.hasCostAttribution) {
      recommendations.push(
        "实现 Token 成本归因系统，追踪每个任务、每个模型的 Token 消耗和费用"
      );
    }

    if (!capabilities.hasAlertSystem) {
      recommendations.push(
        "建立告警体系，至少覆盖：Token 消耗异常、任务失败率升高、" +
          "Agent 循环次数过多三个场景"
      );
    }

    if (!capabilities.hasSLODefinitions) {
      recommendations.push(
        "定义 Agent 服务的 SLO/SLI 指标，如：" +
          "任务成功率 ≥ 95%、P95 响应时间 ≤ 30s、" +
          "单任务成本 ≤ $0.50"
      );
    }

    if (!capabilities.hasBehaviorAnalysis) {
      recommendations.push(
        "引入 Agent 行为分析能力（参见 17.6 节），" +
          "识别重复决策模式和异常行为"
      );
    }

    return recommendations;
  }

  /**
   * 生成可读的评估报告
   */
  formatReport(report: MaturityReport): string {
    const levelNames: Record<MaturityLevel, string> = {
      [MaturityLevel.L1_BASIC_LOGGING]: "L1 基础日志",
      [MaturityLevel.L2_STRUCTURED_OBSERVABILITY]: "L2 结构化观测",
      [MaturityLevel.L3_DEEP_INSIGHT]: "L3 深度洞察",
      [MaturityLevel.L4_INTELLIGENT_ANALYSIS]: "L4 智能分析",
    };

    let output = `\n=== Agent 可观测性成熟度评估报告 ===\n`;
    output += `评估时间: ${report.timestamp}\n`;
    output += `总体等级: ${levelNames[report.overallLevel]}\n`;
    output += `总体得分: ${report.overallScore}/100\n\n`;

    output += `--- 各维度评估 ---\n`;
    for (const dim of report.dimensions) {
      output += `\n[${dim.name}] 得分: ${dim.score}/100 (${levelNames[dim.currentLevel]})\n`;
      output += `  说明: ${dim.description}\n`;
      output += `  当前能力: ${dim.criteria[dim.currentLevel]}\n`;

      const nextLevel = (dim.currentLevel + 1) as MaturityLevel;
      if (dim.criteria[nextLevel]) {
        output += `  下一目标: ${dim.criteria[nextLevel]}\n`;
      }
    }

    output += `\n--- 改进建议 ---\n`;
    report.recommendations.forEach((rec, i) => {
      output += `${i + 1}. ${rec}\n`;
    });

    return output;
  }
}

// ---- 使用示例 ----
const assessor = new ObservabilityMaturityAssessor();

const currentCapabilities: ObservabilityCapabilities = {
  hasBasicLogging: true,
  hasErrorMonitoring: true,
  hasStructuredLogs: true,
  hasRequestTracing: true,
  hasBasicMetrics: true,
  hasTokenCounting: true,
  hasDistributedTracing: false,
  hasDecisionPathTracing: false,
  hasCostAttribution: false,
  hasAlertSystem: false,
  hasAgentSpecificMetrics: false,
  hasSLODefinitions: false,
  hasBehaviorAnalysis: false,
  hasAnomalyDetection: false,
  hasAutoRemediation: false,
  hasSessionReplay: false,
  hasPredictiveAlerts: false,
};

const report = assessor.assess(currentCapabilities);
console.log(assessor.formatReport(report));
// 输出：总体等级 L2，并给出针对性的改进建议
```

---

## 17.2 分布式追踪

分布式追踪是理解 Agent 系统行为的最强大工具。通过为每一次用户请求建立完整的 Span 树，我们可以精确还原 Agent 的决策过程、定位性能瓶颈、分析成本构成。

### 17.2.1 OpenTelemetry GenAI 语义约定

OpenTelemetry 的 GenAI 语义约定（Semantic Conventions for GenAI）已于 2025 年达到 **stable（稳定）** 状态（[[Semantic Conventions for GenAI]](https://opentelemetry.io/docs/specs/semconv/gen-ai/)），为 LLM 调用和 Agent 操作定义了标准化的属性名称。这一里程碑意味着 `gen_ai.*` 命名空间下的核心属性——包括 `gen_ai.system`（AI 系统标识）、`gen_ai.request.model`（请求模型）、`gen_ai.usage.input_tokens`/`gen_ai.usage.output_tokens`（Token 用量）等——已被正式纳入 OpenTelemetry 规范，保证向后兼容。遵循这些约定不仅能确保跨系统的互操作性，还能让我们直接使用社区构建的分析工具和仪表板。

以下是 Agent 系统中关键的语义属性规范：

| 属性名 | 类型 | 说明 | 示例值 |
|--------|------|------|--------|
| `gen_ai.system` | string | AI 系统标识 | `"openai"`, `"anthropic"` |
| `gen_ai.request.model` | string | 请求的模型名称 | `"gpt-4-turbo"` |
| `gen_ai.response.model` | string | 实际响应的模型 | `"gpt-4-turbo-2024-04-09"` |
| `gen_ai.request.max_tokens` | int | 请求的最大 Token 数 | `4096` |
| `gen_ai.request.temperature` | float | 温度参数 | `0.7` |
| `gen_ai.request.top_p` | float | Top-P 参数 | `0.9` |
| `gen_ai.usage.input_tokens` | int | 输入 Token 数量 | `1523` |
| `gen_ai.usage.output_tokens` | int | 输出 Token 数量 | `847` |
| `gen_ai.usage.total_tokens` | int | 总 Token 数量 | `2370` |
| `gen_ai.prompt.template` | string | Prompt 模板标识 | `"agent_system_v3"` |
| `gen_ai.prompt.version` | string | Prompt 版本 | `"2024.03.15"` |
| `gen_ai.agent.name` | string | Agent 名称 | `"research-agent"` |
| `gen_ai.agent.type` | string | Agent 类型 | `"react"`, `"plan-execute"` |
| `gen_ai.agent.loop.iteration` | int | 当前循环迭代次数 | `3` |
| `gen_ai.agent.loop.max_iterations` | int | 最大迭代次数 | `10` |
| `gen_ai.tool.name` | string | 工具名称 | `"web_search"` |
| `gen_ai.tool.input_size` | int | 工具输入字节数 | `256` |
| `gen_ai.tool.output_size` | int | 工具输出字节数 | `4096` |
| `gen_ai.agent.task.type` | string | 任务类型 | `"research"`, `"coding"` |
| `gen_ai.agent.task.complexity` | string | 任务复杂度 | `"simple"`, `"complex"` |
| `gen_ai.usage.cost_usd` | float | 总成本（美元） | `0.0847` |


> **从自定义属性到 GenAI 语义约定的迁移**
>
> 在 OpenTelemetry GenAI 语义约定达到稳定状态之前（2025 年以前），社区和各厂商普遍使用自定义命名空间（如 `agent.*`、`llm.*`、`tool.*`）来标注 AI 相关的 Span 属性。这种碎片化导致了严重的互操作性问题——Langfuse、Arize Phoenix、OpenLLMetry 等可观测性工具各自期望不同的属性名称，团队不得不为每个平台编写适配层，或者在切换工具时面临大量数据迁移工作。
>
> GenAI 语义约定通过统一的 `gen_ai.*` 命名空间解决了这一问题。所有 LLM 调用相关属性归入 `gen_ai.request.*`、`gen_ai.response.*`、`gen_ai.usage.*`；Agent 行为属性归入 `gen_ai.agent.*`；工具调用属性归入 `gen_ai.tool.*`。这种层次化的命名设计不仅提升了可读性，更重要的是实现了跨平台的零配置兼容——任何遵循该约定的 Exporter 和分析工具都能自动识别和解析这些属性，无需额外映射。
>
> 本章所有代码示例均已迁移至 `gen_ai.*` 标准命名空间。如果你的系统中仍在使用旧的自定义属性名（如 `agent.name`、`llm.duration_ms`），建议尽快完成迁移。迁移过程中可以通过 OpenTelemetry Collector 的 `transform` processor 同时输出新旧两套属性名，实现平滑过渡。详细的属性映射关系和迁移指南请参考 [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) 官方文档。

> **主流 Agent 可观测性平台**
>
> 围绕 OpenTelemetry GenAI 语义约定，已涌现出多个专为 LLM/Agent 设计的可观测性平台：
>
> - **[[LangSmith]](https://docs.smith.langchain.com/)**：LangChain 官方平台，提供 Agent 链路追踪、Prompt 版本管理、在线评估和数据集管理，与 LangChain/LangGraph 生态深度集成。
> - **[[Langfuse]](https://langfuse.com/)**（开源）：开源的 LLM 可观测性平台，支持链路追踪、Prompt 管理、评估评分和成本分析。自托管友好，兼容 OpenTelemetry 导出，适合对数据主权有要求的团队。
> - **[[Arize Phoenix]](https://phoenix.arize.com/)**：Arize AI 的开源追踪与评估工具，专注于 LLM 应用的 Span 级可视化、嵌入向量分析和在线评估，支持 OpenTelemetry 原生集成。
> - **[[Braintrust]](https://www.braintrust.dev/)**：端到端的 AI 产品平台，集 Prompt Playground、在线评估、日志追踪和数据集管理于一体，以评估驱动的开发工作流（eval-driven development）为核心理念。
>
> 这些平台均支持或正在对齐 `gen_ai.*` 语义约定，选型时应重点考虑：与现有技术栈的集成度、自托管 vs 托管需求、评估与追踪的深度、以及团队规模与预算。

### 17.2.2 OpenTelemetry SDK 初始化

在实现具体的追踪逻辑之前，我们需要正确配置 OpenTelemetry SDK。以下是一个为 Agent 系统优化的完整初始化方案：

```typescript
// ============================================================
// OpenTelemetry SDK 初始化配置
// ============================================================

/**
 * OpenTelemetry 核心类型定义
 * 在实际项目中，这些类型来自 @opentelemetry/* 包
 * 此处为教学目的提供完整的类型声明
 */

/** Span 状态码 */
enum SpanStatusCode {
  UNSET = 0,
  OK = 1,
  ERROR = 2,
}

/** Span 类型 */
enum SpanKind {
  INTERNAL = 0,
  SERVER = 1,
  CLIENT = 2,
  PRODUCER = 3,
  CONSUMER = 4,
}

/** 属性值类型 */
type AttributeValue = string | number | boolean | string[] | number[] | boolean[];

/** Span 上下文 */
interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
  traceState?: string;
}

/** Span 接口 */
interface Span {
  spanContext(): SpanContext;
  setAttribute(key: string, value: AttributeValue): Span;
  setAttributes(attributes: Record<string, AttributeValue>): Span;
  setStatus(status: { code: SpanStatusCode; message?: string }): Span;
  addEvent(name: string, attributes?: Record<string, AttributeValue>): Span;
  recordException(error: Error): Span;
  end(endTime?: number): void;
  isRecording(): boolean;
}

/** Tracer 接口 */
interface Tracer {
  startSpan(
    name: string,
    options?: {
      kind?: SpanKind;
      attributes?: Record<string, AttributeValue>;
      links?: Array<{ context: SpanContext }>;
    }
  ): Span;
}

/** Context 接口 */
interface Context {
  getValue(key: symbol): unknown;
  setValue(key: symbol, value: unknown): Context;
}

/** 采样决策 */
enum SamplingDecision {
  NOT_RECORD = 0,
  RECORD = 1,
  RECORD_AND_SAMPLED = 2,
}

/** 采样结果 */
interface SamplingResult {
  decision: SamplingDecision;
  attributes?: Record<string, AttributeValue>;
}

/** 采样器接口 */
interface Sampler {
  shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Record<string, AttributeValue>
  ): SamplingResult;
  toString(): string;
}

/**
 * Agent 专用采样器
 * 策略：错误链路 100% 采样，正常链路按配置比率采样
 */
class AgentSampler implements Sampler {
  private readonly normalSamplingRate: number;
  private readonly alwaysSamplePatterns: string[];

  constructor(options: {
    normalSamplingRate?: number;
    alwaysSamplePatterns?: string[];
  } = {}) {
    this.normalSamplingRate = options.normalSamplingRate ?? 0.1; // 默认 10%
    this.alwaysSamplePatterns = options.alwaysSamplePatterns ?? [
      "error",
      "alert",
      "slow",
      "expensive",
    ];
  }

  shouldSample(
    _context: Context,
    traceId: string,
    spanName: string,
    _spanKind: SpanKind,
    attributes: Record<string, AttributeValue>
  ): SamplingResult {
    // 规则 1：错误相关的 Span 始终采样
    if (this.alwaysSamplePatterns.some((p) => spanName.toLowerCase().includes(p))) {
      return {
        decision: SamplingDecision.RECORD_AND_SAMPLED,
        attributes: { "sampling.reason": "pattern_match" },
      };
    }

    // 规则 2：高成本调用始终采样
    const cost = attributes["gen_ai.usage.cost_usd"];
    if (typeof cost === "number" && cost > 0.1) {
      return {
        decision: SamplingDecision.RECORD_AND_SAMPLED,
        attributes: { "sampling.reason": "high_cost" },
      };
    }

    // 规则 3：循环次数过多的 Agent 调用始终采样
    const iterations = attributes["gen_ai.agent.loop.iteration"];
    if (typeof iterations === "number" && iterations > 5) {
      return {
        decision: SamplingDecision.RECORD_AND_SAMPLED,
        attributes: { "sampling.reason": "many_iterations" },
      };
    }

    // 规则 4：正常链路按概率采样
    const hash = this.hashTraceId(traceId);
    if (hash < this.normalSamplingRate) {
      return {
        decision: SamplingDecision.RECORD_AND_SAMPLED,
        attributes: { "sampling.reason": "probabilistic" },
      };
    }

    return { decision: SamplingDecision.NOT_RECORD };
  }

  private hashTraceId(traceId: string): number {
    let hash = 0;
    for (let i = 0; i < traceId.length; i++) {
      const char = traceId.charCodeAt(i);
      hash = (hash * 31 + char) & 0x7fffffff;
    }
    return (hash % 10000) / 10000;
  }

  toString(): string {
    return `AgentSampler{rate=${this.normalSamplingRate}}`;
  }
}

/** Exporter 配置 */
interface ExporterConfig {
  type: "otlp" | "jaeger" | "console";
  endpoint?: string;
  headers?: Record<string, string>;
  batchSize?: number;
  flushIntervalMs?: number;
}

/** SDK 配置 */
interface OTelConfig {
  serviceName: string;
  serviceVersion: string;
  environment: string;
  exporters: ExporterConfig[];
  sampler?: Sampler;
  resourceAttributes?: Record<string, string>;
}

/**
 * OpenTelemetry SDK 初始化器
 * 封装了 Agent 系统所需的完整 SDK 配置
 */
class OTelSDKInitializer {
  private config: OTelConfig;
  private tracerCache: Map<string, Tracer> = new Map();

  constructor(config: OTelConfig) {
    this.config = config;
  }

  /**
   * 初始化 SDK
   * 在实际项目中，此处会调用 @opentelemetry/sdk-node 的 NodeSDK
   */
  initialize(): void {
    console.log(`[OTel] Initializing SDK for service: ${this.config.serviceName}`);
    console.log(`[OTel] Environment: ${this.config.environment}`);
    console.log(`[OTel] Exporters: ${this.config.exporters.map(e => e.type).join(", ")}`);

    if (this.config.sampler) {
      console.log(`[OTel] Sampler: ${this.config.sampler.toString()}`);
    }

    // 实际实现中：
    // const sdk = new NodeSDK({
    //   resource: new Resource({
    //     [ATTR_SERVICE_NAME]: this.config.serviceName,
    //     [ATTR_SERVICE_VERSION]: this.config.serviceVersion,
    //     "deployment.environment": this.config.environment,
    //     ...this.config.resourceAttributes,
    //   }),
    //   traceExporter: this.createExporter(),
    //   sampler: this.config.sampler ?? new AgentSampler(),
    // });
    // sdk.start();
  }

  /**
   * 获取指定名称的 Tracer
   */
  getTracer(name: string, version: string = "1.0.0"): Tracer {
    const key = `${name}@${version}`;
    if (!this.tracerCache.has(key)) {
      // 实际实现中：
      // const tracer = opentelemetry.trace.getTracer(name, version);
      // 此处创建一个模拟 Tracer 用于教学
      const tracer = this.createMockTracer(name);
      this.tracerCache.set(key, tracer);
    }
    return this.tracerCache.get(key)!;
  }

  /**
   * 创建模拟 Tracer（教学用途）
   * 在实际项目中使用 OpenTelemetry API 获取真实 Tracer
   */
  private createMockTracer(name: string): Tracer {
    return {
      startSpan: (
        spanName: string,
        options?: {
          kind?: SpanKind;
          attributes?: Record<string, AttributeValue>;
        }
      ): Span => {
        const traceId = this.generateId(32);
        const spanId = this.generateId(16);
        const startTime = Date.now();
        const attrs: Record<string, AttributeValue> = {
          ...options?.attributes,
        };
        const events: Array<{
          name: string;
          attributes?: Record<string, AttributeValue>;
          timestamp: number;
        }> = [];
        let status = { code: SpanStatusCode.UNSET, message: "" };
        let ended = false;

        const span: Span = {
          spanContext: () => ({ traceId, spanId, traceFlags: 1 }),
          setAttribute: (key, value) => {
            attrs[key] = value;
            return span;
          },
          setAttributes: (newAttrs) => {
            Object.assign(attrs, newAttrs);
            return span;
          },
          setStatus: (s) => {
            status = { code: s.code, message: s.message ?? "" };
            return span;
          },
          addEvent: (eventName, eventAttrs) => {
            events.push({
              name: eventName,
              attributes: eventAttrs,
              timestamp: Date.now(),
            });
            return span;
          },
          recordException: (error) => {
            events.push({
              name: "exception",
              attributes: {
                "exception.type": error.name,
                "exception.message": error.message,
              },
              timestamp: Date.now(),
            });
            return span;
          },
          end: () => {
            if (!ended) {
              ended = true;
              const duration = Date.now() - startTime;
              console.log(
                `[Span] ${name}/${spanName} ` +
                `trace=${traceId.slice(0, 8)}... ` +
                `span=${spanId.slice(0, 8)}... ` +
                `duration=${duration}ms ` +
                `status=${SpanStatusCode[status.code]}`
              );
            }
          },
          isRecording: () => !ended,
        };

        return span;
      },
    };
  }

  private generateId(length: number): string {
    const chars = "0123456789abcdef";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  /**
   * 优雅关闭 SDK
   */
  async shutdown(): Promise<void> {
    console.log("[OTel] Shutting down SDK...");
    // 实际实现中：await sdk.shutdown();
  }
}

// ---- 初始化示例 ----
const otelSDK = new OTelSDKInitializer({
  serviceName: "agent-service",
  serviceVersion: "2.1.0",
  environment: "production",
  exporters: [
    {
      type: "otlp",
      endpoint: "http://otel-collector:4318",
      batchSize: 512,
      flushIntervalMs: 5000,
    },
    {
      type: "console", // 开发环境额外输出到控制台
    },
  ],
  sampler: new AgentSampler({
    normalSamplingRate: 0.1,
    alwaysSamplePatterns: ["error", "timeout", "loop_exceeded"],
  }),
  resourceAttributes: {
    "gen_ai.agent.framework": "custom",
    "gen_ai.agent.framework.version": "2.1.0",
  },
});

otelSDK.initialize();
```

### 17.2.3 Agent 追踪器完整实现

现在我们来实现核心的 `AgentTracer` 类。这个类负责为 Agent 执行过程中的每一个关键步骤创建正确层级的 Span，并记录完整的上下文信息。

Span 层级结构如下：

```
agent_request (根 Span)
├── agent_loop_iteration_1
│   ├── llm_call (推理)
│   ├── tool_call: web_search
│   └── tool_call: calculator
├── agent_loop_iteration_2
│   ├── llm_call (推理)
│   └── sub_agent_call: data_analyst
│       ├── agent_loop_iteration_1
│       │   ├── llm_call
│       │   └── tool_call: sql_query
│       └── agent_loop_iteration_2
│           └── llm_call (最终回答)
└── agent_loop_iteration_3
    └── llm_call (汇总最终回答)
```

```typescript
// ============================================================
// Agent 追踪器 —— 完整实现
// ============================================================

/** LLM 调用信息 */
interface LLMCallInfo {
  model: string;
  provider: string;
  promptTemplate?: string;
  promptVersion?: string;
  temperature?: number;
  maxTokens?: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  finishReason: string;
  durationMs: number;
  timeToFirstTokenMs?: number;
  costUsd?: number;
}

/** 工具调用信息 */
interface ToolCallInfo {
  toolName: string;
  toolVersion?: string;
  input: unknown;
  output: unknown;
  inputSizeBytes: number;
  outputSizeBytes: number;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
}

/** Agent 循环迭代信息 */
interface LoopIterationInfo {
  iteration: number;
  maxIterations: number;
  decision: string; // Agent 在此轮的决策
  reasoning?: string; // Agent 的推理过程
}

/** Span 数据存储 */
interface SpanData {
  span: Span;
  startTime: number;
  parentSpanId?: string;
  children: string[];
}

/** Baggage 上下文 —— Agent 级别的上下文传播 */
interface AgentBaggage {
  taskId: string;
  userId?: string;
  sessionId?: string;
  agentName: string;
  parentAgentName?: string;
  requestPriority?: "low" | "normal" | "high" | "critical";
  costBudgetUsd?: number;
  costSpentUsd?: number;
  iterationCount?: number;
  maxIterations?: number;
}

class AgentTracer {
  private tracer: Tracer;
  private activeSpans: Map<string, SpanData> = new Map();
  private baggage: AgentBaggage | null = null;
  private spanStack: string[] = []; // Span ID 栈，用于维护父子关系

  constructor(
    private readonly sdk: OTelSDKInitializer,
    private readonly agentName: string,
    tracerVersion: string = "1.0.0"
  ) {
    this.tracer = sdk.getTracer(`agent-tracer-${agentName}`, tracerVersion);
  }

  /**
   * 设置 Baggage 上下文
   * Baggage 会在整个追踪链路中传播，包括跨 Agent 调用
   */
  setBaggage(baggage: AgentBaggage): void {
    this.baggage = baggage;
  }

  getBaggage(): AgentBaggage | null {
    return this.baggage;
  }

  /**
   * 开始一个 Agent 请求追踪
   * 这是整个追踪树的根 Span
   */
  startRequestSpan(params: {
    taskId: string;
    taskType: string;
    userId?: string;
    sessionId?: string;
    input: string;
    metadata?: Record<string, string>;
  }): Span {
    const span = this.tracer.startSpan("agent_request", {
      kind: SpanKind.SERVER,
      attributes: {
        "gen_ai.agent.name": this.agentName,
        "gen_ai.agent.task.id": params.taskId,
        "gen_ai.agent.task.type": params.taskType,
        "gen_ai.agent.request.input_length": params.input.length,
        ...(params.userId && { "user.id": params.userId }),
        ...(params.sessionId && { "session.id": params.sessionId }),
        ...(params.metadata ?? {}),
      },
    });

    // 初始化 Baggage
    this.setBaggage({
      taskId: params.taskId,
      userId: params.userId,
      sessionId: params.sessionId,
      agentName: this.agentName,
      costSpentUsd: 0,
      iterationCount: 0,
    });

    const spanId = span.spanContext().spanId;
    this.activeSpans.set(spanId, {
      span,
      startTime: Date.now(),
      children: [],
    });
    this.spanStack.push(spanId);

    span.addEvent("agent_request_started", {
      "input.preview": params.input.slice(0, 200),
    });

    return span;
  }

  /**
   * 开始一个 Agent 循环迭代 Span
   */
  startLoopIterationSpan(info: LoopIterationInfo): Span {
    const span = this.tracer.startSpan("agent_loop_iteration", {
      kind: SpanKind.INTERNAL,
      attributes: {
        "gen_ai.agent.name": this.agentName,
        "gen_ai.agent.loop.iteration": info.iteration,
        "gen_ai.agent.loop.max_iterations": info.maxIterations,
        "gen_ai.agent.loop.decision": info.decision,
      },
    });

    if (info.reasoning) {
      span.addEvent("agent_reasoning", {
        "reasoning.preview": info.reasoning.slice(0, 500),
      });
    }

    // 更新 Baggage 中的迭代计数
    if (this.baggage) {
      this.baggage.iterationCount = info.iteration;
      this.baggage.maxIterations = info.maxIterations;
    }

    const spanId = span.spanContext().spanId;
    this.registerChildSpan(spanId, span);
    this.spanStack.push(spanId);

    return span;
  }

  /**
   * 开始一个 LLM 调用 Span
   */
  startLLMCallSpan(params: {
    model: string;
    provider: string;
    promptTemplate?: string;
    promptVersion?: string;
    temperature?: number;
    maxTokens?: number;
    inputPreview?: string;
  }): Span {
    const span = this.tracer.startSpan("llm_call", {
      kind: SpanKind.CLIENT,
      attributes: {
        "gen_ai.system": params.provider,
        "gen_ai.request.model": params.model,
        ...(params.temperature !== undefined && {
          "gen_ai.request.temperature": params.temperature,
        }),
        ...(params.maxTokens !== undefined && {
          "gen_ai.request.max_tokens": params.maxTokens,
        }),
        ...(params.promptTemplate && {
          "gen_ai.prompt.template": params.promptTemplate,
        }),
        ...(params.promptVersion && {
          "gen_ai.prompt.version": params.promptVersion,
        }),
      },
    });

    if (params.inputPreview) {
      span.addEvent("llm_input", {
        "input.preview": params.inputPreview.slice(0, 300),
      });
    }

    const spanId = span.spanContext().spanId;
    this.registerChildSpan(spanId, span);
    this.spanStack.push(spanId);

    return span;
  }

  /**
   * 结束 LLM 调用 Span 并记录结果
   */
  endLLMCallSpan(span: Span, result: LLMCallInfo): void {
    span.setAttributes({
      "gen_ai.response.model": result.model,
      "gen_ai.usage.input_tokens": result.inputTokens,
      "gen_ai.usage.output_tokens": result.outputTokens,
      "gen_ai.usage.total_tokens": result.totalTokens,
      "gen_ai.response.finish_reason": result.finishReason,
      "gen_ai.response.duration_ms": result.durationMs,
    });

    if (result.timeToFirstTokenMs !== undefined) {
      span.setAttribute("gen_ai.response.time_to_first_token_ms", result.timeToFirstTokenMs);
    }

    if (result.costUsd !== undefined) {
      span.setAttribute("gen_ai.usage.cost_usd", result.costUsd);
      // 更新 Baggage 中的累计成本
      if (this.baggage) {
        this.baggage.costSpentUsd =
          (this.baggage.costSpentUsd ?? 0) + result.costUsd;
      }
    }

    span.addEvent("llm_response", {
      "response.finish_reason": result.finishReason,
      "response.tokens": result.totalTokens,
    });

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    this.popSpanStack();
  }

  /**
   * 开始一个工具调用 Span
   */
  startToolCallSpan(toolName: string, toolVersion?: string): Span {
    const span = this.tracer.startSpan("tool_call", {
      kind: SpanKind.CLIENT,
      attributes: {
        "gen_ai.tool.name": toolName,
        ...(toolVersion && { "gen_ai.tool.version": toolVersion }),
        "gen_ai.agent.name": this.agentName,
      },
    });

    const spanId = span.spanContext().spanId;
    this.registerChildSpan(spanId, span);
    this.spanStack.push(spanId);

    return span;
  }

  /**
   * 结束工具调用 Span
   */
  endToolCallSpan(span: Span, result: ToolCallInfo): void {
    span.setAttributes({
      "gen_ai.tool.name": result.toolName,
      "gen_ai.tool.input_size": result.inputSizeBytes,
      "gen_ai.tool.output_size": result.outputSizeBytes,
      "gen_ai.tool.duration_ms": result.durationMs,
      "gen_ai.tool.success": result.success,
    });

    if (!result.success && result.errorMessage) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: result.errorMessage,
      });
      span.addEvent("tool_error", {
        "error.message": result.errorMessage,
      });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }

    span.end();
    this.popSpanStack();
  }

  /**
   * 开始一个子 Agent 调用 Span
   * 用于多 Agent 架构中的跨 Agent 追踪
   */
  startSubAgentSpan(subAgentName: string, taskDescription: string): Span {
    const span = this.tracer.startSpan("sub_agent_call", {
      kind: SpanKind.PRODUCER,
      attributes: {
        "gen_ai.agent.name": this.agentName,
        "gen_ai.agent.sub_agent.name": subAgentName,
        "gen_ai.agent.sub_agent.task": taskDescription,
      },
    });

    const spanId = span.spanContext().spanId;
    this.registerChildSpan(spanId, span);
    this.spanStack.push(spanId);

    return span;
  }

  /**
   * 结束一个迭代或请求 Span
   */
  endSpan(span: Span, status: "ok" | "error" = "ok", message?: string): void {
    if (status === "error") {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: message ?? "Unknown error",
      });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }

    // 附加 Baggage 信息到结束的 Span
    if (this.baggage) {
      span.setAttributes({
        "gen_ai.agent.baggage.cost_spent_usd": this.baggage.costSpentUsd ?? 0,
        "gen_ai.agent.baggage.iteration_count": this.baggage.iterationCount ?? 0,
      });
    }

    span.end();
    this.popSpanStack();
  }

  /**
   * 提取当前追踪上下文，用于跨 Agent 传播
   * 返回 W3C TraceContext 格式的 headers
   */
  extractTraceContext(): Record<string, string> {
    const currentSpanId = this.spanStack[this.spanStack.length - 1];
    if (!currentSpanId) return {};

    const spanData = this.activeSpans.get(currentSpanId);
    if (!spanData) return {};

    const ctx = spanData.span.spanContext();
    // W3C TraceContext 格式: version-traceId-spanId-traceFlags
    const traceparent = `00-${ctx.traceId}-${ctx.spanId}-0${ctx.traceFlags}`;

    const headers: Record<string, string> = {
      traceparent,
    };

    // 附加 Baggage 作为 header
    if (this.baggage) {
      const baggageItems: string[] = [];
      baggageItems.push(`task_id=${this.baggage.taskId}`);
      baggageItems.push(`agent_name=${this.baggage.agentName}`);
      if (this.baggage.costSpentUsd !== undefined) {
        baggageItems.push(`cost_spent=${this.baggage.costSpentUsd}`);
      }
      headers["baggage"] = baggageItems.join(",");
    }

    return headers;
  }

  /**
   * 从传入的 headers 注入追踪上下文
   * 用于子 Agent 接收父 Agent 的追踪上下文
   */
  injectTraceContext(headers: Record<string, string>): void {
    const traceparent = headers["traceparent"];
    if (traceparent) {
      const parts = traceparent.split("-");
      if (parts.length === 4) {
        console.log(
          `[AgentTracer] Injected trace context: ` +
            `traceId=${parts[1].slice(0, 8)}... parentSpanId=${parts[2].slice(0, 8)}...`
        );
      }
    }

    // 解析 Baggage
    const baggageHeader = headers["baggage"];
    if (baggageHeader) {
      const items = baggageHeader.split(",");
      const baggageMap = new Map<string, string>();
      for (const item of items) {
        const [key, value] = item.split("=");
        if (key && value) {
          baggageMap.set(key.trim(), value.trim());
        }
      }

      this.baggage = {
        taskId: baggageMap.get("task_id") ?? "unknown",
        agentName: this.agentName,
        parentAgentName: baggageMap.get("agent_name"),
        costSpentUsd: parseFloat(baggageMap.get("cost_spent") ?? "0"),
      };
    }
  }

  /**
   * 注册子 Span 到父 Span
   */
  private registerChildSpan(spanId: string, span: Span): void {
    const parentSpanId = this.spanStack[this.spanStack.length - 1];
    this.activeSpans.set(spanId, {
      span,
      startTime: Date.now(),
      parentSpanId,
      children: [],
    });

    if (parentSpanId) {
      const parentData = this.activeSpans.get(parentSpanId);
      if (parentData) {
        parentData.children.push(spanId);
      }
    }
  }

  /**
   * 从 Span 栈中弹出当前 Span
   */
  private popSpanStack(): void {
    const spanId = this.spanStack.pop();
    if (spanId) {
      this.activeSpans.delete(spanId);
    }
  }
}

// ---- 使用示例：完整的 Agent 执行追踪 ----
async function demonstrateAgentTracing(): Promise<void> {
  const tracer = new AgentTracer(otelSDK, "research-agent");

  // 1. 开始请求追踪
  const requestSpan = tracer.startRequestSpan({
    taskId: "task-20240315-001",
    taskType: "research",
    userId: "user-123",
    sessionId: "session-456",
    input: "分析2024年Q1的AI行业投资趋势",
  });

  // 2. 第一轮迭代：决定搜索最新数据
  const iter1Span = tracer.startLoopIterationSpan({
    iteration: 1,
    maxIterations: 10,
    decision: "search_web",
    reasoning: "需要获取2024年Q1的最新AI投资数据，先进行网络搜索",
  });

  // 2.1 LLM 推理
  const llm1Span = tracer.startLLMCallSpan({
    model: "gpt-4-turbo",
    provider: "openai",
    promptTemplate: "research_agent_system_v2",
    promptVersion: "2024.03.15",
    temperature: 0.3,
  });

  // 模拟 LLM 调用延迟
  await new Promise((r) => setTimeout(r, 50));

  tracer.endLLMCallSpan(llm1Span, {
    model: "gpt-4-turbo-2024-04-09",
    provider: "openai",
    inputTokens: 1523,
    outputTokens: 247,
    totalTokens: 1770,
    finishReason: "stop",
    durationMs: 2340,
    timeToFirstTokenMs: 450,
    costUsd: 0.0236,
  });

  // 2.2 工具调用：网络搜索
  const tool1Span = tracer.startToolCallSpan("web_search", "1.2.0");
  await new Promise((r) => setTimeout(r, 30));

  tracer.endToolCallSpan(tool1Span, {
    toolName: "web_search",
    input: { query: "2024 Q1 AI investment trends" },
    output: { results: ["..."], totalResults: 42 },
    inputSizeBytes: 48,
    outputSizeBytes: 15360,
    durationMs: 1250,
    success: true,
  });

  tracer.endSpan(iter1Span);

  // 3. 第二轮迭代：分析数据并生成报告
  const iter2Span = tracer.startLoopIterationSpan({
    iteration: 2,
    maxIterations: 10,
    decision: "generate_report",
    reasoning: "已获取足够的搜索结果，现在进行分析和报告生成",
  });

  const llm2Span = tracer.startLLMCallSpan({
    model: "gpt-4-turbo",
    provider: "openai",
    promptTemplate: "research_agent_system_v2",
    temperature: 0.5,
  });

  await new Promise((r) => setTimeout(r, 80));

  tracer.endLLMCallSpan(llm2Span, {
    model: "gpt-4-turbo-2024-04-09",
    provider: "openai",
    inputTokens: 4200,
    outputTokens: 1850,
    totalTokens: 6050,
    finishReason: "stop",
    durationMs: 8520,
    timeToFirstTokenMs: 620,
    costUsd: 0.0725,
  });

  tracer.endSpan(iter2Span);

  // 4. 结束请求追踪
  tracer.endSpan(requestSpan);

  console.log("\n[Demo] Agent tracing complete.");
  console.log(
    `[Demo] Total cost: $${tracer.getBaggage()?.costSpentUsd?.toFixed(4)}`
  );
}

// 执行演示
demonstrateAgentTracing();
```

### 17.2.4 多 Agent 分布式追踪

在多 Agent 架构中，一个请求可能被路由到多个 Agent 协作处理。例如，一个"研究分析"Agent 可能将数据查询任务委托给"数据分析"Agent，将可视化任务委托给"图表生成"Agent。这种场景要求追踪上下文能够在 Agent 之间正确传播。

```typescript
// ============================================================
// 多 Agent 追踪上下文传播
// ============================================================

/** Agent 间通信消息 */
interface AgentMessage {
  fromAgent: string;
  toAgent: string;
  taskDescription: string;
  payload: unknown;
  traceHeaders: Record<string, string>;
}

/** Agent 执行结果 */
interface AgentResult {
  success: boolean;
  output: unknown;
  tokenUsage: { input: number; output: number; total: number };
  costUsd: number;
  durationMs: number;
}

class MultiAgentTraceContext {
  private agentTracers: Map<string, AgentTracer> = new Map();

  constructor(private readonly sdk: OTelSDKInitializer) {}

  /**
   * 为指定 Agent 获取或创建 Tracer
   */
  getTracerForAgent(agentName: string): AgentTracer {
    if (!this.agentTracers.has(agentName)) {
      const tracer = new AgentTracer(this.sdk, agentName);
      this.agentTracers.set(agentName, tracer);
    }
    return this.agentTracers.get(agentName)!;
  }

  /**
   * 从父 Agent 向子 Agent 传播追踪上下文
   */
  propagateContext(
    parentAgentName: string,
    childAgentName: string,
    taskDescription: string
  ): AgentMessage {
    const parentTracer = this.getTracerForAgent(parentAgentName);
    const traceHeaders = parentTracer.extractTraceContext();

    return {
      fromAgent: parentAgentName,
      toAgent: childAgentName,
      taskDescription,
      payload: {},
      traceHeaders,
    };
  }

  /**
   * 子 Agent 接收追踪上下文并开始执行
   */
  receiveAndStartTrace(
    message: AgentMessage
  ): { tracer: AgentTracer; requestSpan: Span } {
    const childTracer = this.getTracerForAgent(message.toAgent);

    // 注入父 Agent 的追踪上下文
    childTracer.injectTraceContext(message.traceHeaders);

    // 创建子 Agent 的请求 Span
    const requestSpan = childTracer.startRequestSpan({
      taskId: `sub-${Date.now()}`,
      taskType: "delegated",
      input: message.taskDescription,
      metadata: {
        "gen_ai.agent.parent": message.fromAgent,
        "gen_ai.agent.delegation.reason": "task_decomposition",
      },
    });

    return { tracer: childTracer, requestSpan };
  }

  /**
   * 演示完整的多 Agent 协作追踪
   */
  async demonstrateMultiAgentTracing(): Promise<void> {
    // 1. 主 Agent 开始处理
    const mainTracer = this.getTracerForAgent("orchestrator-agent");
    const mainSpan = mainTracer.startRequestSpan({
      taskId: "multi-agent-task-001",
      taskType: "complex_analysis",
      userId: "user-789",
      input: "分析公司过去一年的技术债务并提出改进计划",
    });

    // 2. 主 Agent 第一轮：决定分发子任务
    const mainIter1 = mainTracer.startLoopIterationSpan({
      iteration: 1,
      maxIterations: 5,
      decision: "delegate_subtasks",
      reasoning: "任务过于复杂，需要分解为代码分析和架构评审两个子任务",
    });

    // 3. 委托给代码分析 Agent
    const subAgentSpan1 = mainTracer.startSubAgentSpan(
      "code-analysis-agent",
      "分析代码库中的技术债务指标"
    );

    const message1 = this.propagateContext(
      "orchestrator-agent",
      "code-analysis-agent",
      "分析代码库中的技术债务指标：代码复杂度、重复代码率、依赖过期率"
    );

    const { tracer: codeTracer, requestSpan: codeSpan } =
      this.receiveAndStartTrace(message1);

    // 子 Agent 执行
    const codeIter = codeTracer.startLoopIterationSpan({
      iteration: 1,
      maxIterations: 3,
      decision: "analyze_codebase",
    });

    const codeLLMSpan = codeTracer.startLLMCallSpan({
      model: "gpt-4-turbo",
      provider: "openai",
    });

    await new Promise((r) => setTimeout(r, 20));

    codeTracer.endLLMCallSpan(codeLLMSpan, {
      model: "gpt-4-turbo",
      provider: "openai",
      inputTokens: 3200,
      outputTokens: 1500,
      totalTokens: 4700,
      finishReason: "stop",
      durationMs: 5400,
      costUsd: 0.058,
    });

    codeTracer.endSpan(codeIter);
    codeTracer.endSpan(codeSpan);
    mainTracer.endSpan(subAgentSpan1);

    // 4. 委托给架构评审 Agent
    const subAgentSpan2 = mainTracer.startSubAgentSpan(
      "architecture-review-agent",
      "评审系统架构并识别改进机会"
    );

    const message2 = this.propagateContext(
      "orchestrator-agent",
      "architecture-review-agent",
      "评审当前系统架构，识别扩展性瓶颈和改进机会"
    );

    const { tracer: archTracer, requestSpan: archSpan } =
      this.receiveAndStartTrace(message2);

    const archIter = archTracer.startLoopIterationSpan({
      iteration: 1,
      maxIterations: 3,
      decision: "review_architecture",
    });

    const archLLMSpan = archTracer.startLLMCallSpan({
      model: "claude-3-opus",
      provider: "anthropic",
    });

    await new Promise((r) => setTimeout(r, 20));

    archTracer.endLLMCallSpan(archLLMSpan, {
      model: "claude-3-opus-20240229",
      provider: "anthropic",
      inputTokens: 2800,
      outputTokens: 2100,
      totalTokens: 4900,
      finishReason: "end_turn",
      durationMs: 7200,
      costUsd: 0.0945,
    });

    archTracer.endSpan(archIter);
    archTracer.endSpan(archSpan);
    mainTracer.endSpan(subAgentSpan2);

    // 5. 主 Agent 汇总结果
    mainTracer.endSpan(mainIter1);

    const mainIter2 = mainTracer.startLoopIterationSpan({
      iteration: 2,
      maxIterations: 5,
      decision: "synthesize_results",
      reasoning: "两个子 Agent 均已完成，现在汇总结果并生成改进计划",
    });

    const synthLLMSpan = mainTracer.startLLMCallSpan({
      model: "gpt-4-turbo",
      provider: "openai",
    });

    await new Promise((r) => setTimeout(r, 40));

    mainTracer.endLLMCallSpan(synthLLMSpan, {
      model: "gpt-4-turbo",
      provider: "openai",
      inputTokens: 5500,
      outputTokens: 2800,
      totalTokens: 8300,
      finishReason: "stop",
      durationMs: 12000,
      costUsd: 0.0995,
    });

    mainTracer.endSpan(mainIter2);
    mainTracer.endSpan(mainSpan);

    console.log("\n[MultiAgent] Distributed tracing demo complete.");
    console.log(
      `[MultiAgent] Orchestrator cost: $${mainTracer.getBaggage()?.costSpentUsd?.toFixed(4)}`
    );
  }
}
```

### 17.2.5 追踪数据分析器

收集追踪数据只是第一步。真正的价值在于从追踪数据中提取洞察：哪些决策路径最常见？哪些工具调用最耗时？成本主要消耗在哪个环节？

```typescript
// ============================================================
// 追踪数据分析器
// ============================================================

/** 追踪记录（从存储系统导出的格式） */
interface TraceRecord {
  traceId: string;
  spans: SpanRecord[];
  startTime: number;
  endTime: number;
  totalDurationMs: number;
  totalCostUsd: number;
}

/** Span 记录 */
interface SpanRecord {
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  attributes: Record<string, AttributeValue>;
  events: Array<{
    name: string;
    timestamp: number;
    attributes?: Record<string, AttributeValue>;
  }>;
  status: { code: SpanStatusCode; message?: string };
}

/** 追踪分析洞察 */
interface TraceInsight {
  type:
    | "performance"
    | "cost"
    | "pattern"
    | "anomaly"
    | "optimization";
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  data: Record<string, unknown>;
  recommendation?: string;
}

class TraceAnalyzer {
  /**
   * 分析一批追踪记录并生成洞察
   */
  analyze(traces: TraceRecord[]): TraceInsight[] {
    const insights: TraceInsight[] = [];

    insights.push(...this.analyzePerformance(traces));
    insights.push(...this.analyzeCost(traces));
    insights.push(...this.analyzeDecisionPatterns(traces));
    insights.push(...this.detectAnomalies(traces));
    insights.push(...this.identifyOptimizations(traces));

    // 按严重性排序
    const severityOrder: Record<string, number> = {
      critical: 0,
      warning: 1,
      info: 2,
    };
    insights.sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
    );

    return insights;
  }

  /**
   * 性能分析：识别慢请求和瓶颈
   */
  private analyzePerformance(traces: TraceRecord[]): TraceInsight[] {
    const insights: TraceInsight[] = [];

    // 计算延迟分位数
    const durations = traces.map((t) => t.totalDurationMs).sort((a, b) => a - b);
    const p50 = this.percentile(durations, 50);
    const p95 = this.percentile(durations, 95);
    const p99 = this.percentile(durations, 99);

    insights.push({
      type: "performance",
      severity: "info",
      title: "请求延迟分布",
      description:
        `P50=${p50}ms, P95=${p95}ms, P99=${p99}ms ` +
        `（基于 ${traces.length} 条追踪记录）`,
      data: { p50, p95, p99, count: traces.length },
    });

    // 识别 P95 以上的慢请求
    const slowTraces = traces.filter((t) => t.totalDurationMs > p95);
    if (slowTraces.length > 0) {
      // 分析慢请求的共同特征
      const slowLLMCalls = slowTraces.flatMap((t) =>
        t.spans.filter((s) => s.operationName === "llm_call")
      );
      const avgLLMDuration =
        slowLLMCalls.length > 0
          ? slowLLMCalls.reduce((sum, s) => sum + s.durationMs, 0) /
            slowLLMCalls.length
          : 0;

      insights.push({
        type: "performance",
        severity: "warning",
        title: "慢请求分析",
        description:
          `${slowTraces.length} 条请求超过 P95 延迟阈值 (${p95}ms)。` +
          `这些慢请求中 LLM 调用的平均延迟为 ${Math.round(avgLLMDuration)}ms。`,
        data: {
          slowCount: slowTraces.length,
          threshold: p95,
          avgLLMDuration,
        },
        recommendation:
          "考虑为慢请求启用模型降级策略（如 GPT-4 → GPT-3.5），" +
          "或减少单次请求的上下文窗口大小。",
      });
    }

    // 识别 LLM 调用延迟占比
    for (const trace of traces) {
      const llmSpans = trace.spans.filter(
        (s) => s.operationName === "llm_call"
      );
      const totalLLMTime = llmSpans.reduce(
        (sum, s) => sum + s.durationMs,
        0
      );
      const llmTimeRatio = totalLLMTime / trace.totalDurationMs;

      if (llmTimeRatio > 0.9) {
        insights.push({
          type: "performance",
          severity: "info",
          title: "LLM 调用时间占比过高",
          description:
            `Trace ${trace.traceId.slice(0, 8)} 中 LLM 调用占总时间的 ` +
            `${(llmTimeRatio * 100).toFixed(1)}%，` +
            `表明性能瓶颈主要在 LLM 推理阶段。`,
          data: { traceId: trace.traceId, llmTimeRatio, totalLLMTime },
        });
      }
    }

    return insights;
  }

  /**
   * 成本分析：识别高成本请求和成本异常
   */
  private analyzeCost(traces: TraceRecord[]): TraceInsight[] {
    const insights: TraceInsight[] = [];

    const costs = traces.map((t) => t.totalCostUsd).sort((a, b) => a - b);
    const avgCost = costs.reduce((sum, c) => sum + c, 0) / costs.length;
    const maxCost = costs[costs.length - 1] ?? 0;

    insights.push({
      type: "cost",
      severity: "info",
      title: "成本概览",
      description:
        `平均请求成本: $${avgCost.toFixed(4)}, ` +
        `最高请求成本: $${maxCost.toFixed(4)}, ` +
        `总成本: $${costs.reduce((s, c) => s + c, 0).toFixed(4)}`,
      data: {
        avgCost,
        maxCost,
        totalCost: costs.reduce((s, c) => s + c, 0),
        count: traces.length,
      },
    });

    // 识别成本异常高的请求（超过平均值的 3 倍）
    const expensiveTraces = traces.filter(
      (t) => t.totalCostUsd > avgCost * 3
    );
    if (expensiveTraces.length > 0) {
      insights.push({
        type: "cost",
        severity: "warning",
        title: "高成本请求告警",
        description:
          `${expensiveTraces.length} 条请求的成本超过平均值的 3 倍。` +
          `建议检查这些请求是否存在不必要的 LLM 调用或上下文窗口过大的情况。`,
        data: {
          count: expensiveTraces.length,
          threshold: avgCost * 3,
          traceIds: expensiveTraces.map((t) => t.traceId),
        },
        recommendation:
          "分析高成本请求的 Span 树，确认是否存在不必要的迭代或重复 LLM 调用。" +
          "考虑实现成本预算机制（参见第 14 章 Agent 信任架构）。",
      });
    }

    // 按模型统计成本分布
    const costByModel = new Map<string, { cost: number; calls: number }>();
    for (const trace of traces) {
      for (const span of trace.spans) {
        if (span.operationName === "llm_call") {
          const model = String(
            span.attributes["gen_ai.request.model"] ?? "unknown"
          );
          const cost = Number(span.attributes["gen_ai.usage.cost_usd"] ?? 0);
          const existing = costByModel.get(model) ?? { cost: 0, calls: 0 };
          existing.cost += cost;
          existing.calls += 1;
          costByModel.set(model, existing);
        }
      }
    }

    if (costByModel.size > 0) {
      const modelCosts = Object.fromEntries(costByModel);
      insights.push({
        type: "cost",
        severity: "info",
        title: "按模型的成本分布",
        description: Array.from(costByModel.entries())
          .map(
            ([model, data]) =>
              `${model}: $${data.cost.toFixed(4)} (${data.calls} 次调用)`
          )
          .join("; "),
        data: { modelCosts },
      });
    }

    return insights;
  }

  /**
   * 决策模式分析：识别 Agent 的常见行为模式
   */
  private analyzeDecisionPatterns(traces: TraceRecord[]): TraceInsight[] {
    const insights: TraceInsight[] = [];

    // 统计工具使用频率
    const toolUsage = new Map<string, number>();
    for (const trace of traces) {
      for (const span of trace.spans) {
        if (span.operationName === "tool_call") {
          const toolName = String(
            span.attributes["gen_ai.tool.name"] ?? "unknown"
          );
          toolUsage.set(toolName, (toolUsage.get(toolName) ?? 0) + 1);
        }
      }
    }

    if (toolUsage.size > 0) {
      const sortedTools = Array.from(toolUsage.entries()).sort(
        (a, b) => b[1] - a[1]
      );
      insights.push({
        type: "pattern",
        severity: "info",
        title: "工具使用频率分布",
        description: sortedTools
          .slice(0, 10)
          .map(([tool, count]) => `${tool}: ${count} 次`)
          .join(", "),
        data: { toolUsage: Object.fromEntries(toolUsage) },
      });
    }

    // 统计迭代次数分布
    const iterationCounts: number[] = [];
    for (const trace of traces) {
      const maxIteration = Math.max(
        ...trace.spans
          .filter((s) => s.operationName === "agent_loop_iteration")
          .map((s) => Number(s.attributes["gen_ai.agent.loop.iteration"] ?? 0)),
        0
      );
      if (maxIteration > 0) {
        iterationCounts.push(maxIteration);
      }
    }

    if (iterationCounts.length > 0) {
      const avgIterations =
        iterationCounts.reduce((s, c) => s + c, 0) / iterationCounts.length;
      const maxIterations = Math.max(...iterationCounts);

      insights.push({
        type: "pattern",
        severity: avgIterations > 5 ? "warning" : "info",
        title: "Agent 迭代次数分布",
        description:
          `平均迭代次数: ${avgIterations.toFixed(1)}, ` +
          `最大迭代次数: ${maxIterations}。` +
          (avgIterations > 5
            ? "平均迭代次数较高，可能存在优化空间。"
            : ""),
        data: { avgIterations, maxIterations, distribution: iterationCounts },
        ...(avgIterations > 5 && {
          recommendation:
            "优化 Prompt 以减少不必要的迭代，或考虑使用 Plan-Execute 模式替代 ReAct 模式。",
        }),
      });
    }

    return insights;
  }

  /**
   * 异常检测：识别不寻常的追踪模式
   */
  private detectAnomalies(traces: TraceRecord[]): TraceInsight[] {
    const insights: TraceInsight[] = [];

    // 检测错误率
    const errorTraces = traces.filter((t) =>
      t.spans.some((s) => s.status.code === SpanStatusCode.ERROR)
    );
    const errorRate = errorTraces.length /traces.length;

    if (errorRate > 0.1) {
      insights.push({
        type: "anomaly",
        severity: errorRate > 0.3 ? "critical" : "warning",
        title: "错误率异常",
        description:
          `当前错误率为 ${(errorRate * 100).toFixed(1)}%，` +
          `共 ${errorTraces.length}/${traces.length} 条追踪包含错误。`,
        data: { errorRate, errorCount: errorTraces.length },
        recommendation:
          "立即检查错误追踪的详细信息，确认是否为系统性问题（如 API 限流、模型服务异常）。",
      });
    }

    // 检测工具调用失败模式
    const toolFailures = new Map<string, number>();
    for (const trace of traces) {
      for (const span of trace.spans) {
        if (
          span.operationName === "tool_call" &&
          span.status.code === SpanStatusCode.ERROR
        ) {
          const toolName = String(
            span.attributes["gen_ai.tool.name"] ?? "unknown"
          );
          toolFailures.set(toolName, (toolFailures.get(toolName) ?? 0) + 1);
        }
      }
    }

    for (const [tool, failCount] of toolFailures) {
      const totalUsage =
        traces.flatMap((t) => t.spans).filter(
          (s) =>
            s.operationName === "tool_call" &&
            s.attributes["gen_ai.tool.name"] === tool
        ).length;
      const failRate = failCount / totalUsage;

      if (failRate > 0.2) {
        insights.push({
          type: "anomaly",
          severity: "warning",
          title: `工具「${tool}」失败率异常`,
          description:
            `工具 ${tool} 的失败率为 ${(failRate * 100).toFixed(1)}% ` +
            `(${failCount}/${totalUsage})。`,
          data: { tool, failRate, failCount, totalUsage },
          recommendation:
            `检查工具 ${tool} 的服务状态和配置。考虑添加降级策略或重试机制。`,
        });
      }
    }

    return insights;
  }

  /**
   * 优化建议：基于追踪数据识别优化机会
   */
  private identifyOptimizations(traces: TraceRecord[]): TraceInsight[] {
    const insights: TraceInsight[] = [];

    // 识别可能的并行化机会
    for (const trace of traces) {
      const toolSpans = trace.spans.filter(
        (s) => s.operationName === "tool_call"
      );

      // 检查是否有连续的、互不依赖的工具调用
      for (let i = 0; i < toolSpans.length - 1; i++) {
        const current = toolSpans[i]!;
        const next = toolSpans[i + 1]!;

        if (
          current.parentSpanId === next.parentSpanId &&
          current.endTime <= next.startTime
        ) {
          const gap = next.startTime - current.endTime;
          if (gap < 100) {
            // 近乎连续的工具调用
            insights.push({
              type: "optimization",
              severity: "info",
              title: "并行化优化机会",
              description:
                `Trace ${trace.traceId.slice(0, 8)} 中发现连续的工具调用 ` +
                `(${current.attributes["gen_ai.tool.name"]} → ${next.attributes["gen_ai.tool.name"]})，` +
                `如果它们之间没有数据依赖，可以考虑并行执行。`,
              data: {
                traceId: trace.traceId,
                tools: [
                  current.attributes["gen_ai.tool.name"],
                  next.attributes["gen_ai.tool.name"],
                ],
              },
              recommendation: "评估工具调用之间的依赖关系，对无依赖的调用实施并行执行。",
            });
            break; // 每个 trace 只报告一次
          }
        }
      }
    }

    return insights;
  }

  /**
   * 计算分位数
   */
  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)] ?? 0;
  }
}
```

---

## 17.3 指标体系

指标是可观测性体系中最适合"持续监控"的支柱。与追踪（聚焦于单个请求的全貌）和日志（聚焦于离散事件的细节）不同，指标提供的是**聚合的、时间序列化的**系统运行状态视图。对于 Agent 系统，我们需要一套专门设计的指标体系来覆盖四个核心维度。

### 17.3.1 四大指标类别

| 类别 | 目标受众 | 核心问题 | 典型指标 |
|------|---------|---------|---------|
| **业务指标** | 产品经理、业务方 | Agent 是否完成了用户的任务？ | 任务完成率、用户满意度、任务类型分布 |
| **性能指标** | SRE、运维工程师 | Agent 的响应速度和吞吐量如何？ | 延迟分位数、吞吐量、并发数、迭代次数 |
| **资源指标** | 架构师、财务 | Agent 消耗了多少资源和成本？ | Token 消耗、API 调用次数、每任务成本 |
| **质量指标** | AI 工程师 | Agent 的推理和决策质量如何？ | 幻觉率、工具选择准确率、重试率 |

### 17.3.2 完整的 Agent 指标收集器

```typescript
// ============================================================
// Agent 指标收集器 —— 完整实现
// ============================================================

/** 指标类型 */
enum MetricType {
  COUNTER = "counter",
  GAUGE = "gauge",
  HISTOGRAM = "histogram",
}

/** 直方图桶定义 */
interface HistogramBuckets {
  boundaries: number[];
  counts: number[];
  sum: number;
  count: number;
  min: number;
  max: number;
}

/** 指标标签 */
type MetricLabels = Record<string, string>;

/** 指标数据点 */
interface MetricDataPoint {
  name: string;
  type: MetricType;
  value: number;
  labels: MetricLabels;
  timestamp: number;
}

/** Counter 指标 */
class Counter {
  private values: Map<string, number> = new Map();

  constructor(
    public readonly name: string,
    public readonly description: string
  ) {}

  increment(labels: MetricLabels = {}, value: number = 1): void {
    const key = this.labelsToKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + value);
  }

  getValue(labels: MetricLabels = {}): number {
    return this.values.get(this.labelsToKey(labels)) ?? 0;
  }

  getAllValues(): Array<{ labels: MetricLabels; value: number }> {
    const results: Array<{ labels: MetricLabels; value: number }> = [];
    for (const [key, value] of this.values) {
      results.push({ labels: this.keyToLabels(key), value });
    }
    return results;
  }

  private labelsToKey(labels: MetricLabels): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
  }

  private keyToLabels(key: string): MetricLabels {
    if (!key) return {};
    const labels: MetricLabels = {};
    for (const pair of key.split(",")) {
      const [k, v] = pair.split("=");
      if (k && v) labels[k] = v;
    }
    return labels;
  }
}

/** Gauge 指标 */
class Gauge {
  private values: Map<string, number> = new Map();

  constructor(
    public readonly name: string,
    public readonly description: string
  ) {}

  set(labels: MetricLabels, value: number): void {
    this.values.set(this.labelsToKey(labels), value);
  }

  increment(labels: MetricLabels = {}, value: number = 1): void {
    const key = this.labelsToKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + value);
  }

  decrement(labels: MetricLabels = {}, value: number = 1): void {
    const key = this.labelsToKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) - value);
  }

  getValue(labels: MetricLabels = {}): number {
    return this.values.get(this.labelsToKey(labels)) ?? 0;
  }

  private labelsToKey(labels: MetricLabels): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
  }
}

/** Histogram 指标 */
class Histogram {
  private buckets: Map<string, HistogramBuckets> = new Map();
  private readonly boundaries: number[];

  constructor(
    public readonly name: string,
    public readonly description: string,
    boundaries?: number[]
  ) {
    this.boundaries = boundaries ?? [
      5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
    ];
  }

  observe(labels: MetricLabels, value: number): void {
    const key = this.labelsToKey(labels);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        boundaries: [...this.boundaries],
        counts: new Array(this.boundaries.length + 1).fill(0),
        sum: 0,
        count: 0,
        min: Infinity,
        max: -Infinity,
      };
      this.buckets.set(key, bucket);
    }

    bucket.sum += value;
    bucket.count += 1;
    bucket.min = Math.min(bucket.min, value);
    bucket.max = Math.max(bucket.max, value);

    // 更新桶计数
    let placed = false;
    for (let i = 0; i < this.boundaries.length; i++) {
      if (value <= this.boundaries[i]!) {
        bucket.counts[i]! += 1;
        placed = true;
        break;
      }
    }
    if (!placed) {
      bucket.counts[this.boundaries.length]! += 1; // +Inf 桶
    }
  }

  /**
   * 计算分位数
   */
  getPercentile(labels: MetricLabels, percentile: number): number {
    const key = this.labelsToKey(labels);
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.count === 0) return 0;

    const targetCount = Math.ceil((percentile / 100) * bucket.count);
    let cumulativeCount = 0;

    for (let i = 0; i < bucket.counts.length; i++) {
      cumulativeCount += bucket.counts[i]!;
      if (cumulativeCount >= targetCount) {
        if (i < this.boundaries.length) {
          return this.boundaries[i]!;
        }
        return bucket.max;
      }
    }
    return bucket.max;
  }

  getStats(labels: MetricLabels): {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  } {
    const key = this.labelsToKey(labels);
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.count === 0) {
      return { count: 0, sum: 0, avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
    }

    return {
      count: bucket.count,
      sum: bucket.sum,
      avg: bucket.sum / bucket.count,
      min: bucket.min,
      max: bucket.max,
      p50: this.getPercentile(labels, 50),
      p95: this.getPercentile(labels, 95),
      p99: this.getPercentile(labels, 99),
    };
  }

  private labelsToKey(labels: MetricLabels): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
  }
}

/**
 * Agent 指标收集器
 * 整合所有 Agent 系统需要的指标
 */
class AgentMetricsCollector {
  // ---- 业务指标 ----
  readonly taskTotal: Counter;
  readonly taskSuccessTotal: Counter;
  readonly taskFailureTotal: Counter;
  readonly taskByType: Counter;

  // ---- 性能指标 ----
  readonly requestDuration: Histogram;
  readonly llmCallDuration: Histogram;
  readonly toolCallDuration: Histogram;
  readonly agentLoopIterations: Histogram;
  readonly timeToFirstToken: Histogram;
  readonly concurrentRequests: Gauge;

  // ---- 资源指标 ----
  readonly tokenUsage: Counter;
  readonly tokenCostUsd: Counter;
  readonly apiCallTotal: Counter;

  // ---- 质量指标 ----
  readonly toolCallErrors: Counter;
  readonly llmRetries: Counter;
  readonly loopExceeded: Counter;
  readonly hallucinations: Counter;

  constructor() {
    // 业务指标
    this.taskTotal = new Counter(
      "agent_task_total",
      "Agent 处理的任务总数"
    );
    this.taskSuccessTotal = new Counter(
      "agent_task_success_total",
      "成功完成的任务数"
    );
    this.taskFailureTotal = new Counter(
      "agent_task_failure_total",
      "失败的任务数"
    );
    this.taskByType = new Counter(
      "agent_task_by_type_total",
      "按类型统计的任务数"
    );

    // 性能指标 — 使用 Agent 专用的 histogram bucket
    this.requestDuration = new Histogram(
      "agent_request_duration_ms",
      "Agent 请求的端到端延迟（毫秒）",
      [100, 500, 1000, 2000, 5000, 10000, 30000, 60000, 120000] // Agent 场景延迟更高
    );
    this.llmCallDuration = new Histogram(
      "agent_llm_call_duration_ms",
      "LLM 调用延迟（毫秒）",
      [100, 250, 500, 1000, 2000, 5000, 10000, 20000]
    );
    this.toolCallDuration = new Histogram(
      "agent_tool_call_duration_ms",
      "工具调用延迟（毫秒）",
      [10, 50, 100, 250, 500, 1000, 2000, 5000, 10000]
    );
    this.agentLoopIterations = new Histogram(
      "agent_loop_iterations",
      "Agent 循环迭代次数",
      [1, 2, 3, 5, 7, 10, 15, 20]
    );
    this.timeToFirstToken = new Histogram(
      "agent_ttft_ms",
      "首个 Token 延迟（毫秒）",
      [50, 100, 200, 500, 1000, 2000, 5000]
    );
    this.concurrentRequests = new Gauge(
      "agent_concurrent_requests",
      "当前并发请求数"
    );

    // 资源指标
    this.tokenUsage = new Counter(
      "agent_token_usage_total",
      "Token 消耗总量"
    );
    this.tokenCostUsd = new Counter(
      "agent_token_cost_usd_total",
      "Token 消耗成本（美元）"
    );
    this.apiCallTotal = new Counter(
      "agent_api_call_total",
      "外部 API 调用总数"
    );

    // 质量指标
    this.toolCallErrors = new Counter(
      "agent_tool_call_errors_total",
      "工具调用错误总数"
    );
    this.llmRetries = new Counter(
      "agent_llm_retries_total",
      "LLM 调用重试次数"
    );
    this.loopExceeded = new Counter(
      "agent_loop_exceeded_total",
      "Agent 循环超出最大迭代次数的次数"
    );
    this.hallucinations = new Counter(
      "agent_hallucination_detected_total",
      "检测到的幻觉次数"
    );
  }

  /**
   * 记录一次完整的任务执行
   */
  recordTaskExecution(params: {
    taskType: string;
    agentName: string;
    success: boolean;
    durationMs: number;
    iterations: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    model: string;
    toolCalls: Array<{
      toolName: string;
      durationMs: number;
      success: boolean;
    }>;
    errorType?: string;
  }): void {
    const baseLabels = {
      agent: params.agentName,
      task_type: params.taskType,
    };

    // 业务指标
    this.taskTotal.increment(baseLabels);
    this.taskByType.increment({ task_type: params.taskType });

    if (params.success) {
      this.taskSuccessTotal.increment(baseLabels);
    } else {
      this.taskFailureTotal.increment({
        ...baseLabels,
        error_type: params.errorType ?? "unknown",
      });
    }

    // 性能指标
    this.requestDuration.observe(baseLabels, params.durationMs);
    this.agentLoopIterations.observe(baseLabels, params.iterations);

    // 资源指标
    const modelLabels = { model: params.model, agent: params.agentName };
    this.tokenUsage.increment(
      { ...modelLabels, type: "input" },
      params.inputTokens
    );
    this.tokenUsage.increment(
      { ...modelLabels, type: "output" },
      params.outputTokens
    );
    this.tokenUsage.increment(
      { ...modelLabels, type: "total" },
      params.totalTokens
    );
    this.tokenCostUsd.increment(modelLabels, params.costUsd);

    // 工具调用指标
    for (const tool of params.toolCalls) {
      const toolLabels = {
        agent: params.agentName,
        tool: tool.toolName,
      };
      this.toolCallDuration.observe(toolLabels, tool.durationMs);
      this.apiCallTotal.increment(toolLabels);

      if (!tool.success) {
        this.toolCallErrors.increment(toolLabels);
      }
    }

    // 质量指标
    if (params.iterations >= 10) {
      this.loopExceeded.increment(baseLabels);
    }
  }

  /**
   * 记录 LLM 调用
   */
  recordLLMCall(params: {
    model: string;
    provider: string;
    durationMs: number;
    timeToFirstTokenMs?: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    isRetry: boolean;
  }): void {
    const labels = { model: params.model, provider: params.provider };

    this.llmCallDuration.observe(labels, params.durationMs);

    if (params.timeToFirstTokenMs !== undefined) {
      this.timeToFirstToken.observe(labels, params.timeToFirstTokenMs);
    }

    this.tokenUsage.increment(
      { ...labels, type: "input" },
      params.inputTokens
    );
    this.tokenUsage.increment(
      { ...labels, type: "output" },
      params.outputTokens
    );
    this.tokenCostUsd.increment(labels, params.costUsd);

    if (params.isRetry) {
      this.llmRetries.increment(labels);
    }
  }

  /**
   * 生成 Prometheus 格式的指标导出
   */
  exportPrometheus(): string {
    const lines: string[] = [];

    const appendCounter = (counter: Counter): void => {
      lines.push(`# HELP ${counter.name} ${counter.description}`);
      lines.push(`# TYPE ${counter.name} counter`);
      for (const { labels, value } of counter.getAllValues()) {
        const labelStr = Object.entries(labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(",");
        lines.push(
          labelStr
            ? `${counter.name}{${labelStr}} ${value}`
            : `${counter.name} ${value}`
        );
      }
      lines.push("");
    };

    appendCounter(this.taskTotal);
    appendCounter(this.taskSuccessTotal);
    appendCounter(this.taskFailureTotal);
    appendCounter(this.tokenUsage);
    appendCounter(this.tokenCostUsd);
    appendCounter(this.apiCallTotal);
    appendCounter(this.toolCallErrors);
    appendCounter(this.llmRetries);
    appendCounter(this.loopExceeded);

    return lines.join("\n");
  }

  /**
   * 获取仪表盘摘要数据
   */
  getDashboardSummary(): Record<string, unknown> {
    return {
      taskSuccessRate: this.calculateSuccessRate(),
      requestLatency: this.requestDuration.getStats({}),
      llmLatency: this.llmCallDuration.getStats({}),
      tokenUsage: {
        input: this.tokenUsage.getValue({ type: "input" }),
        output: this.tokenUsage.getValue({ type: "output" }),
        total: this.tokenUsage.getValue({ type: "total" }),
      },
      costUsd: this.tokenCostUsd.getValue({}),
      toolErrors: this.toolCallErrors.getValue({}),
    };
  }

  private calculateSuccessRate(): number {
    const total = this.taskTotal.getValue({});
    if (total === 0) return 1;
    return this.taskSuccessTotal.getValue({}) / total;
  }
}
```

### 17.3.3 告警规则引擎

收集指标之后，下一步是建立告警体系。Agent 系统需要比传统服务更细致的告警规则，因为很多问题（如 Token 消耗突增、Agent 循环过多）在传统监控中并不存在。

```typescript
// ============================================================
// 告警规则引擎
// ============================================================

/** 告警严重级别 */
enum AlertSeverity {
  INFO = "info",
  WARNING = "warning",
  CRITICAL = "critical",
  EMERGENCY = "emergency",
}

/** 告警状态 */
enum AlertState {
  PENDING = "pending",     // 刚触发，等待确认期
  FIRING = "firing",       // 已确认触发
  RESOLVED = "resolved",   // 已恢复
}

/** 告警规则定义 */
interface AlertRule {
  id: string;
  name: string;
  description: string;
  severity: AlertSeverity;

  // 触发条件
  condition: AlertCondition;

  // 持续时间要求（避免瞬时波动触发告警）
  forDurationSeconds: number;

  // 告警通知配置
  notification: AlertNotificationConfig;

  // 标签，用于分组和路由
  labels: Record<string, string>;

  // 是否启用
  enabled: boolean;
}

/** 告警条件 */
type AlertCondition =
  | ThresholdCondition
  | RateCondition
  | AnomalyCondition
  | CompositeCondition;

interface ThresholdCondition {
  type: "threshold";
  metric: string;
  operator: "gt" | "lt" | "gte" | "lte" | "eq";
  value: number;
  labels?: MetricLabels;
}

interface RateCondition {
  type: "rate";
  metric: string;
  windowSeconds: number;
  operator: "gt" | "lt";
  value: number; // 每秒的速率阈值
  labels?: MetricLabels;
}

interface AnomalyCondition {
  type: "anomaly";
  metric: string;
  windowSize: number;    // 滑动窗口大小
  deviations: number;    // 标准差倍数
  labels?: MetricLabels;
}

interface CompositeCondition {
  type: "composite";
  operator: "and" | "or";
  conditions: AlertCondition[];
}

/** 告警通知配置 */
interface AlertNotificationConfig {
  channels: AlertChannel[];
  repeatIntervalSeconds: number;
  escalationAfterSeconds?: number;
  escalationChannels?: AlertChannel[];
}

/** 告警渠道 */
interface AlertChannel {
  type: "slack" | "pagerduty" | "email" | "webhook";
  target: string; // channel ID, email, URL 等
  template?: string;
}

/** 告警实例 */
interface AlertInstance {
  ruleId: string;
  state: AlertState;
  severity: AlertSeverity;
  message: string;
  value: number;
  labels: Record<string, string>;
  firstTriggeredAt: number;
  lastTriggeredAt: number;
  resolvedAt?: number;
  notificationsSent: number;
  fingerprint: string;
}

/** 时序数据点（用于异常检测） */
interface TimeSeriesPoint {
  timestamp: number;
  value: number;
}

class AlertRuleEngine {
  private rules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, AlertInstance> = new Map();
  private metricHistory: Map<string, TimeSeriesPoint[]> = new Map();
  private pendingAlerts: Map<string, { since: number; condition: boolean }> =
    new Map();

  /**
   * 注册告警规则
   */
  registerRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
    console.log(`[Alert] Registered rule: ${rule.id} (${rule.name})`);
  }

  /**
   * 注册 Agent 系统的默认告警规则
   */
  registerDefaultAgentRules(): void {
    // 规则 1：任务失败率过高
    this.registerRule({
      id: "agent_high_failure_rate",
      name: "Agent 任务失败率过高",
      description: "Agent 任务失败率超过 10%，可能存在系统性问题",
      severity: AlertSeverity.CRITICAL,
      condition: {
        type: "threshold",
        metric: "agent_task_failure_rate",
        operator: "gt",
        value: 0.1,
      },
      forDurationSeconds: 300, // 持续 5 分钟
      notification: {
        channels: [
          { type: "pagerduty", target: "agent-oncall" },
          { type: "slack", target: "#agent-alerts" },
        ],
        repeatIntervalSeconds: 600,
        escalationAfterSeconds: 1800,
        escalationChannels: [
          { type: "pagerduty", target: "engineering-lead" },
        ],
      },
      labels: { team: "agent", category: "reliability" },
      enabled: true,
    });

    // 规则 2：Token 消耗异常
    this.registerRule({
      id: "agent_token_cost_anomaly",
      name: "Token 成本异常",
      description: "Token 消耗成本超过移动平均值的 3 倍标准差",
      severity: AlertSeverity.WARNING,
      condition: {
        type: "anomaly",
        metric: "agent_token_cost_usd_total",
        windowSize: 60,       // 60 个数据点的滑动窗口
        deviations: 3,        // 3 个标准差
      },
      forDurationSeconds: 180, // 持续 3 分钟
      notification: {
        channels: [
          { type: "slack", target: "#agent-costs" },
          { type: "email", target: "agent-team@company.com" },
        ],
        repeatIntervalSeconds: 1800,
      },
      labels: { team: "agent", category: "cost" },
      enabled: true,
    });

    // 规则 3：Agent 循环次数过多
    this.registerRule({
      id: "agent_loop_excessive",
      name: "Agent 循环次数过多",
      description: "Agent 循环平均迭代次数超过 7 次",
      severity: AlertSeverity.WARNING,
      condition: {
        type: "threshold",
        metric: "agent_loop_iterations_avg",
        operator: "gt",
        value: 7,
      },
      forDurationSeconds: 600,
      notification: {
        channels: [{ type: "slack", target: "#agent-alerts" }],
        repeatIntervalSeconds: 3600,
      },
      labels: { team: "agent", category: "performance" },
      enabled: true,
    });

    // 规则 4：LLM 调用延迟劣化
    this.registerRule({
      id: "agent_llm_latency_degraded",
      name: "LLM 调用延迟劣化",
      description: "LLM 调用 P95 延迟超过 10 秒",
      severity: AlertSeverity.WARNING,
      condition: {
        type: "threshold",
        metric: "agent_llm_call_duration_ms_p95",
        operator: "gt",
        value: 10000,
      },
      forDurationSeconds: 300,
      notification: {
        channels: [{ type: "slack", target: "#agent-alerts" }],
        repeatIntervalSeconds: 900,
      },
      labels: { team: "agent", category: "performance" },
      enabled: true,
    });

    // 规则 5：组合条件 — 高失败率 + 高延迟（严重劣化）
    this.registerRule({
      id: "agent_severe_degradation",
      name: "Agent 服务严重劣化",
      description: "任务失败率 > 20% 且 P95 延迟 > 30s",
      severity: AlertSeverity.EMERGENCY,
      condition: {
        type: "composite",
        operator: "and",
        conditions: [
          {
            type: "threshold",
            metric: "agent_task_failure_rate",
            operator: "gt",
            value: 0.2,
          },
          {
            type: "threshold",
            metric: "agent_request_duration_ms_p95",
            operator: "gt",
            value: 30000,
          },
        ],
      },
      forDurationSeconds: 120,
      notification: {
        channels: [
          { type: "pagerduty", target: "agent-oncall" },
          { type: "slack", target: "#agent-incidents" },
        ],
        repeatIntervalSeconds: 300,
        escalationAfterSeconds: 600,
        escalationChannels: [
          { type: "pagerduty", target: "vp-engineering" },
        ],
      },
      labels: { team: "agent", category: "incident" },
      enabled: true,
    });
  }

  /**
   * 评估所有规则（定期调用）
   */
  evaluate(currentMetrics: Map<string, number>): AlertInstance[] {
    const triggeredAlerts: AlertInstance[] = [];

    for (const [ruleId, rule] of this.rules) {
      if (!rule.enabled) continue;

      const conditionMet = this.evaluateCondition(
        rule.condition,
        currentMetrics
      );
      const pendingKey = ruleId;
      const now = Date.now();

      if (conditionMet) {
        const pending = this.pendingAlerts.get(pendingKey);

        if (!pending) {
          // 首次触发，进入 pending 状态
          this.pendingAlerts.set(pendingKey, {
            since: now,
            condition: true,
          });
        } else if (
          now - pending.since >= rule.forDurationSeconds * 1000
        ) {
          // 已持续超过要求的时间，触发告警
          const fingerprint = this.generateFingerprint(rule, currentMetrics);
          const existing = this.activeAlerts.get(fingerprint);

          if (existing) {
            // 更新已有告警
            existing.lastTriggeredAt = now;
            existing.value = this.getMetricValue(
              rule.condition,
              currentMetrics
            );
            triggeredAlerts.push(existing);
          } else {
            // 创建新告警
            const alert: AlertInstance = {
              ruleId: rule.id,
              state: AlertState.FIRING,
              severity: rule.severity,
              message: this.formatAlertMessage(rule, currentMetrics),
              value: this.getMetricValue(rule.condition, currentMetrics),
              labels: { ...rule.labels },
              firstTriggeredAt: pending.since,
              lastTriggeredAt: now,
              notificationsSent: 0,
              fingerprint,
            };
            this.activeAlerts.set(fingerprint, alert);
            triggeredAlerts.push(alert);
          }
        }
      } else {
        // 条件不满足，清除 pending 状态
        this.pendingAlerts.delete(pendingKey);

        // 解决已触发的告警
        for (const [fp, alert] of this.activeAlerts) {
          if (alert.ruleId === ruleId && alert.state === AlertState.FIRING) {
            alert.state = AlertState.RESOLVED;
            alert.resolvedAt = now;
            triggeredAlerts.push(alert);
          }
        }
      }
    }

    return triggeredAlerts;
  }

  /**
   * 评估告警条件
   */
  private evaluateCondition(
    condition: AlertCondition,
    metrics: Map<string, number>
  ): boolean {
    switch (condition.type) {
      case "threshold":
        return this.evaluateThreshold(condition, metrics);
      case "rate":
        return this.evaluateRate(condition, metrics);
      case "anomaly":
        return this.evaluateAnomaly(condition, metrics);
      case "composite":
        return this.evaluateComposite(condition, metrics);
    }
  }

  private evaluateThreshold(
    condition: ThresholdCondition,
    metrics: Map<string, number>
  ): boolean {
    const value = metrics.get(condition.metric);
    if (value === undefined) return false;

    switch (condition.operator) {
      case "gt": return value > condition.value;
      case "lt": return value < condition.value;
      case "gte": return value >= condition.value;
      case "lte": return value <= condition.value;
      case "eq": return value === condition.value;
    }
  }

  private evaluateRate(
    condition: RateCondition,
    metrics: Map<string, number>
  ): boolean {
    const historyKey = condition.metric;
    const history = this.metricHistory.get(historyKey) ?? [];
    const value = metrics.get(condition.metric) ?? 0;

    // 记录当前值到历史
    history.push({ timestamp: Date.now(), value });
    this.metricHistory.set(historyKey, history);

    // 保留窗口内的数据
    const windowStart = Date.now() - condition.windowSeconds * 1000;
    const windowData = history.filter((p) => p.timestamp >= windowStart);
    this.metricHistory.set(historyKey, windowData);

    if (windowData.length < 2) return false;

    // 计算变化率
    const first = windowData[0]!;
    const last = windowData[windowData.length - 1]!;
    const timeDiffSeconds = (last.timestamp - first.timestamp) / 1000;
    if (timeDiffSeconds === 0) return false;

    const rate = (last.value - first.value) / timeDiffSeconds;

    switch (condition.operator) {
      case "gt": return rate > condition.value;
      case "lt": return rate < condition.value;
    }
  }

  private evaluateAnomaly(
    condition: AnomalyCondition,
    metrics: Map<string, number>
  ): boolean {
    const historyKey = `anomaly_${condition.metric}`;
    const history = this.metricHistory.get(historyKey) ?? [];
    const value = metrics.get(condition.metric) ?? 0;

    history.push({ timestamp: Date.now(), value });
    // 保留窗口大小的历史数据
    if (history.length > condition.windowSize) {
      history.splice(0, history.length - condition.windowSize);
    }
    this.metricHistory.set(historyKey, history);

    if (history.length < condition.windowSize / 2) {
      return false; // 数据不足
    }

    // 计算移动平均和标准差
    const values = history.map((p) => p.value);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance =
      values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // 当前值偏离移动平均超过指定标准差倍数
    return Math.abs(value - mean) > condition.deviations * stdDev;
  }

  private evaluateComposite(
    condition: CompositeCondition,
    metrics: Map<string, number>
  ): boolean {
    const results = condition.conditions.map((c) =>
      this.evaluateCondition(c, metrics)
    );
    if (condition.operator === "and") {
      return results.every((r) => r);
    }
    return results.some((r) => r);
  }

  private getMetricValue(
    condition: AlertCondition,
    metrics: Map<string, number>
  ): number {
    if (condition.type === "composite") return 0;
    return metrics.get(condition.metric) ?? 0;
  }

  private generateFingerprint(
    rule: AlertRule,
    _metrics: Map<string, number>
  ): string {
    const parts = [rule.id, ...Object.entries(rule.labels).map(([k, v]) => `${k}=${v}`)];
    return parts.join("|");
  }

  private formatAlertMessage(
    rule: AlertRule,
    metrics: Map<string, number>
  ): string {
    const value = this.getMetricValue(rule.condition, metrics);
    return `[${rule.severity.toUpperCase()}] ${rule.name}: ${rule.description} (当前值: ${value})`;
  }

  /**
   * 发送告警通知（示例实现）
   */
  async sendNotification(
    alert: AlertInstance,
    channels: AlertChannel[]
  ): Promise<void> {
    for (const channel of channels) {
      switch (channel.type) {
        case "slack":
          console.log(
            `[Notification] Slack -> ${channel.target}: ${alert.message}`
          );
          // 实际实现：await slackClient.postMessage(channel.target, alert.message);
          break;

        case "pagerduty":
          console.log(
            `[Notification] PagerDuty -> ${channel.target}: ${alert.message}`
          );
          // 实际实现：await pagerdutyClient.trigger(channel.target, alert);
          break;

        case "email":
          console.log(
            `[Notification] Email -> ${channel.target}: ${alert.message}`
          );
          // 实际实现：await emailClient.send(channel.target, alert);
          break;

        case "webhook":
          console.log(
            `[Notification] Webhook -> ${channel.target}: ${alert.message}`
          );
          // 实际实现：await fetch(channel.target, { method: 'POST', body: JSON.stringify(alert) });
          break;
      }
    }
    alert.notificationsSent += 1;
  }
}
```

### 17.3.4 SLO/SLI 定义

服务水平目标（SLO）和服务水平指标（SLI）是衡量 Agent 系统可靠性的关键框架。与传统微服务相比，Agent 系统的 SLO 需要覆盖更多维度：

```typescript
// ============================================================
// SLO/SLI 定义与追踪
// ============================================================

/** SLI 定义 */
interface SLIDefinition {
  name: string;
  description: string;
  metric: string;
  goodEventFilter: string;    // 什么算"好"的事件
  totalEventFilter: string;   // 总事件
  unit: string;
}

/** SLO 定义 */
interface SLODefinition {
  id: string;
  name: string;
  description: string;
  sli: SLIDefinition;
  target: number;             // 0-1 之间的目标值
  windowDays: number;         // 评估窗口（天）
  burnRateThresholds: {       // 错误预算消耗速率告警
    critical: number;         // 如 14.4x => 1小时耗尽
    warning: number;          // 如 6x => 6小时耗尽
  };
}

/** SLO 状态 */
interface SLOStatus {
  sloId: string;
  sloName: string;
  currentSLI: number;
  target: number;
  errorBudgetTotal: number;
  errorBudgetRemaining: number;
  errorBudgetConsumedPercent: number;
  burnRate: number;
  status: "healthy" | "warning" | "critical" | "breached";
}

class SLOTracker {
  private slos: Map<string, SLODefinition> = new Map();
  private goodEvents: Map<string, number> = new Map();
  private totalEvents: Map<string, number> = new Map();

  /**
   * 注册 Agent 系统的标准 SLO
   */
  registerDefaultSLOs(): void {
    // SLO 1：任务可用性
    this.registerSLO({
      id: "agent_task_availability",
      name: "Agent 任务可用性",
      description: "Agent 能够成功处理用户任务的比率",
      sli: {
        name: "任务成功率",
        description: "成功完成的任务占总任务的比率",
        metric: "agent_task_total",
        goodEventFilter: "status=success",
        totalEventFilter: "*",
        unit: "ratio",
      },
      target: 0.95, // 95% 的任务应该成功
      windowDays: 30,
      burnRateThresholds: {
        critical: 14.4, // 1小时内耗尽错误预算
        warning: 6.0,   // 6小时内耗尽错误预算
      },
    });

    // SLO 2：响应延迟
    this.registerSLO({
      id: "agent_latency",
      name: "Agent 响应延迟",
      description: "Agent 在合理时间内完成任务的比率",
      sli: {
        name: "延迟合规率",
        description: "P95 延迟在 30 秒以内的请求比率",
        metric: "agent_request_duration_ms",
        goodEventFilter: "duration<=30000",
        totalEventFilter: "*",
        unit: "ratio",
      },
      target: 0.90, // 90% 的请求 P95 延迟 ≤ 30s
      windowDays: 30,
      burnRateThresholds: {
        critical: 14.4,
        warning: 6.0,
      },
    });

    // SLO 3：单任务成本
    this.registerSLO({
      id: "agent_cost_efficiency",
      name: "Agent 成本效率",
      description: "单任务成本在预算范围内的比率",
      sli: {
        name: "成本合规率",
        description: "单任务成本 ≤ $0.50 的任务比率",
        metric: "agent_task_cost_usd",
        goodEventFilter: "cost<=0.50",
        totalEventFilter: "*",
        unit: "ratio",
      },
      target: 0.95, // 95% 的任务成本 ≤ $0.50
      windowDays: 30,
      burnRateThresholds: {
        critical: 14.4,
        warning: 6.0,
      },
    });
  }

  registerSLO(slo: SLODefinition): void {
    this.slos.set(slo.id, slo);
    this.goodEvents.set(slo.id, 0);
    this.totalEvents.set(slo.id, 0);
  }

  /**
   * 记录事件
   */
  recordEvent(sloId: string, isGood: boolean): void {
    const total = (this.totalEvents.get(sloId) ?? 0) + 1;
    this.totalEvents.set(sloId, total);

    if (isGood) {
      const good = (this.goodEvents.get(sloId) ?? 0) + 1;
      this.goodEvents.set(sloId, good);
    }
  }

  /**
   * 获取 SLO 当前状态
   */
  getStatus(sloId: string): SLOStatus | null {
    const slo = this.slos.get(sloId);
    if (!slo) return null;

    const good = this.goodEvents.get(sloId) ?? 0;
    const total = this.totalEvents.get(sloId) ?? 0;
    const currentSLI = total > 0 ? good / total : 1;

    const errorBudgetTotal = 1 - slo.target;
    const errorBudgetConsumed = total > 0 ? (total - good) / total : 0;
    const errorBudgetRemaining = Math.max(
      0,
      errorBudgetTotal - errorBudgetConsumed
    );
    const errorBudgetConsumedPercent =
      errorBudgetTotal > 0
        ? (errorBudgetConsumed / errorBudgetTotal) * 100
        : 0;

    // 简化的 burn rate 计算
    const burnRate =
      errorBudgetTotal > 0
        ? errorBudgetConsumed / errorBudgetTotal
        : 0;

    let status: SLOStatus["status"] = "healthy";
    if (currentSLI < slo.target) {
      status = "breached";
    } else if (burnRate >= slo.burnRateThresholds.critical) {
      status = "critical";
    } else if (burnRate >= slo.burnRateThresholds.warning) {
      status = "warning";
    }

    return {
      sloId,
      sloName: slo.name,
      currentSLI,
      target: slo.target,
      errorBudgetTotal,
      errorBudgetRemaining,
      errorBudgetConsumedPercent,
      burnRate,
      status,
    };
  }

  /**
   * 获取所有 SLO 状态摘要
   */
  getAllStatuses(): SLOStatus[] {
    const statuses: SLOStatus[] = [];
    for (const sloId of this.slos.keys()) {
      const status = this.getStatus(sloId);
      if (status) statuses.push(status);
    }
    return statuses;
  }

  /**
   * 格式化 SLO 报告
   */
  formatReport(): string {
    let output = "\n=== SLO 状态报告 ===\n";
    for (const status of this.getAllStatuses()) {
      const statusEmoji =
        status.status === "healthy" ? "[OK]" :
        status.status === "warning" ? "[WARN]" :
        status.status === "critical" ? "[CRIT]" : "[BREACH]";

      output += `\n${statusEmoji} ${status.sloName}\n`;
      output += `  当前 SLI: ${(status.currentSLI * 100).toFixed(2)}%\n`;
      output += `  目标: ${(status.target * 100).toFixed(2)}%\n`;
      output += `  错误预算剩余: ${(status.errorBudgetRemaining * 100).toFixed(2)}%\n`;
      output += `  消耗进度: ${status.errorBudgetConsumedPercent.toFixed(1)}%\n`;
    }
    return output;
  }
}
```

### 17.3.5 Grafana 仪表盘配置

以下是一个 Agent 监控仪表盘的 JSON 配置模板，可以直接导入 Grafana：

```typescript
// ============================================================
// Grafana 仪表盘配置生成器
// ============================================================

interface GrafanaPanel {
  title: string;
  type: "stat" | "timeseries" | "table" | "gauge" | "heatmap" | "barchart";
  gridPos: { x: number; y: number; w: number; h: number };
  targets: Array<{
    expr: string;           // PromQL 表达式
    legendFormat: string;
  }>;
  fieldConfig?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

interface GrafanaDashboard {
  title: string;
  uid: string;
  tags: string[];
  panels: GrafanaPanel[];
  templating: {
    list: Array<{
      name: string;
      query: string;
      type: string;
    }>;
  };
  time: { from: string; to: string };
  refresh: string;
}

class AgentDashboardGenerator {
  /**
   * 生成完整的 Agent 监控仪表盘
   */
  generate(): GrafanaDashboard {
    return {
      title: "Agent 可观测性仪表盘",
      uid: "agent-observability-v1",
      tags: ["agent", "llm", "observability"],
      templating: {
        list: [
          { name: "agent", query: "label_values(agent_task_total, agent)", type: "query" },
          { name: "model", query: "label_values(agent_token_usage_total, model)", type: "query" },
          { name: "environment", query: "label_values(agent_task_total, environment)", type: "query" },
        ],
      },
      time: { from: "now-6h", to: "now" },
      refresh: "30s",
      panels: [
        // 第一行：核心 KPI
        ...this.generateKPIPanels(),
        // 第二行：延迟分布
        ...this.generateLatencyPanels(),
        // 第三行：Token 和成本
        ...this.generateCostPanels(),
        // 第四行：工具调用
        ...this.generateToolPanels(),
        // 第五行：质量指标
        ...this.generateQualityPanels(),
      ],
    };
  }

  private generateKPIPanels(): GrafanaPanel[] {
    return [
      {
        title: "任务成功率",
        type: "gauge",
        gridPos: { x: 0, y: 0, w: 4, h: 6 },
        targets: [{
          expr:
            'sum(rate(agent_task_success_total{agent="$agent"}[5m])) / ' +
            'sum(rate(agent_task_total{agent="$agent"}[5m]))',
          legendFormat: "成功率",
        }],
        fieldConfig: {
          defaults: {
            thresholds: {
              steps: [
                { value: 0, color: "red" },
                { value: 0.9, color: "yellow" },
                { value: 0.95, color: "green" },
              ],
            },
            max: 1,
            unit: "percentunit",
          },
        },
      },
      {
        title: "请求吞吐量 (RPM)",
        type: "stat",
        gridPos: { x: 4, y: 0, w: 4, h: 6 },
        targets: [{
          expr:
            'sum(rate(agent_task_total{agent="$agent"}[5m])) * 60',
          legendFormat: "RPM",
        }],
      },
      {
        title: "P95 延迟",
        type: "stat",
        gridPos: { x: 8, y: 0, w: 4, h: 6 },
        targets: [{
          expr:
            'histogram_quantile(0.95, sum(rate(agent_request_duration_ms_bucket{agent="$agent"}[5m])) by (le))',
          legendFormat: "P95 延迟 (ms)",
        }],
      },
      {
        title: "实时成本 ($/小时)",
        type: "stat",
        gridPos: { x: 12, y: 0, w: 4, h: 6 },
        targets: [{
          expr:
            'sum(rate(agent_token_cost_usd_total{agent="$agent"}[5m])) * 3600',
          legendFormat: "$/hour",
        }],
      },
      {
        title: "并发请求数",
        type: "stat",
        gridPos: { x: 16, y: 0, w: 4, h: 6 },
        targets: [{
          expr: 'agent_concurrent_requests{agent="$agent"}',
          legendFormat: "当前并发",
        }],
      },
      {
        title: "错误预算剩余",
        type: "gauge",
        gridPos: { x: 20, y: 0, w: 4, h: 6 },
        targets: [{
          expr:
            '1 - (sum(rate(agent_task_failure_total{agent="$agent"}[30d])) / ' +
            'sum(rate(agent_task_total{agent="$agent"}[30d]))) / 0.05',
          legendFormat: "错误预算",
        }],
      },
    ];
  }

  private generateLatencyPanels(): GrafanaPanel[] {
    return [
      {
        title: "请求延迟分布",
        type: "timeseries",
        gridPos: { x: 0, y: 6, w: 12, h: 8 },
        targets: [
          {
            expr:
              'histogram_quantile(0.50, sum(rate(agent_request_duration_ms_bucket{agent="$agent"}[5m])) by (le))',
            legendFormat: "P50",
          },
          {
            expr:
              'histogram_quantile(0.95, sum(rate(agent_request_duration_ms_bucket{agent="$agent"}[5m])) by (le))',
            legendFormat: "P95",
          },
          {
            expr:
              'histogram_quantile(0.99, sum(rate(agent_request_duration_ms_bucket{agent="$agent"}[5m])) by (le))',
            legendFormat: "P99",
          },
        ],
      },
      {
        title: "LLM 调用延迟（按模型）",
        type: "timeseries",
        gridPos: { x: 12, y: 6, w: 12, h: 8 },
        targets: [{
          expr:
            'histogram_quantile(0.95, sum(rate(agent_llm_call_duration_ms_bucket{agent="$agent"}[5m])) by (le, model))',
          legendFormat: "{{model}} P95",
        }],
      },
    ];
  }

  private generateCostPanels(): GrafanaPanel[] {
    return [
      {
        title: "Token 消耗趋势",
        type: "timeseries",
        gridPos: { x: 0, y: 14, w: 8, h: 8 },
        targets: [
          {
            expr:
              'sum(rate(agent_token_usage_total{agent="$agent", type="input"}[5m])) * 60',
            legendFormat: "输入 Token/min",
          },
          {
            expr:
              'sum(rate(agent_token_usage_total{agent="$agent", type="output"}[5m])) * 60',
            legendFormat: "输出 Token/min",
          },
        ],
      },
      {
        title: "成本分布（按模型）",
        type: "barchart",
        gridPos: { x: 8, y: 14, w: 8, h: 8 },
        targets: [{
          expr:
            'sum(increase(agent_token_cost_usd_total{agent="$agent"}[1h])) by (model)',
          legendFormat: "{{model}}",
        }],
      },
      {
        title: "每任务平均成本",
        type: "timeseries",
        gridPos: { x: 16, y: 14, w: 8, h: 8 },
        targets: [{
          expr:
            'sum(rate(agent_token_cost_usd_total{agent="$agent"}[5m])) / ' +
            'sum(rate(agent_task_total{agent="$agent"}[5m]))',
          legendFormat: "平均成本 ($)",
        }],
      },
    ];
  }

  private generateToolPanels(): GrafanaPanel[] {
    return [
      {
        title: "工具调用频率 Top 10",
        type: "barchart",
        gridPos: { x: 0, y: 22, w: 12, h: 8 },
        targets: [{
          expr:
            'topk(10, sum(rate(agent_api_call_total{agent="$agent"}[5m])) by (tool)) * 60',
          legendFormat: "{{tool}}",
        }],
      },
      {
        title: "工具调用错误率",
        type: "timeseries",
        gridPos: { x: 12, y: 22, w: 12, h: 8 },
        targets: [{
          expr:
            'sum(rate(agent_tool_call_errors_total{agent="$agent"}[5m])) by (tool) / ' +
            'sum(rate(agent_api_call_total{agent="$agent"}[5m])) by (tool)',
          legendFormat: "{{tool}} 错误率",
        }],
      },
    ];
  }

  private generateQualityPanels(): GrafanaPanel[] {
    return [
      {
        title: "Agent 迭代次数分布",
        type: "heatmap",
        gridPos: { x: 0, y: 30, w: 12, h: 8 },
        targets: [{
          expr:
            'sum(rate(agent_loop_iterations_bucket{agent="$agent"}[5m])) by (le)',
          legendFormat: "{{le}}",
        }],
      },
      {
        title: "质量指标趋势",
        type: "timeseries",
        gridPos: { x: 12, y: 30, w: 12, h: 8 },
        targets: [
          {
            expr: 'sum(rate(agent_loop_exceeded_total{agent="$agent"}[5m])) * 60',
            legendFormat: "循环超限/min",
          },
          {
            expr: 'sum(rate(agent_llm_retries_total{agent="$agent"}[5m])) * 60',
            legendFormat: "LLM 重试/min",
          },
          {
            expr: 'sum(rate(agent_hallucination_detected_total{agent="$agent"}[5m])) * 60',
            legendFormat: "幻觉检测/min",
          },
        ],
      },
    ];
  }
}
```

---

## 17.4 结构化日志

日志是可观测性三大支柱中最古老也最直观的一种。但在 Agent 系统中，简单的文本日志远远不够 —— 我们需要**结构化的、关联的、可搜索的**日志体系，同时还要解决 Agent 系统特有的挑战：敏感数据脱敏、高吞吐量下的采样、以及跨 Agent 的日志关联。

### 17.4.1 Agent 结构化日志器

```typescript
// ============================================================
// Agent 结构化日志器 —— 完整实现
// ============================================================

/** 日志级别 */
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

/** Agent 日志级别语义 */
const AGENT_LOG_SEMANTICS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "Agent 决策过程细节、Prompt 完整内容、工具输入输出原文",
  [LogLevel.INFO]: "Agent 生命周期事件、工具调用摘要、任务完成通知",
  [LogLevel.WARN]: "Agent 重试、降级、接近预算限制、迭代次数偏多",
  [LogLevel.ERROR]: "工具调用失败、LLM 异常、任务失败",
  [LogLevel.FATAL]: "Agent 崩溃、不可恢复错误、安全边界违规",
};

/** 日志上下文 */
interface LogContext {
  traceId?: string;
  spanId?: string;
  correlationId?: string;
  agentName?: string;
  taskId?: string;
  userId?: string;
  sessionId?: string;
  iteration?: number;
  currentTool?: string;
  model?: string;
  [key: string]: unknown;
}

/** 结构化日志条目 */
interface StructuredLogEntry {
  timestamp: string;
  level: string;
  message: string;
  service: string;
  context: LogContext;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/** 脱敏规则 */
interface MaskingRule {
  name: string;
  pattern: RegExp;
  replacement: string;
}

/** 日志采样配置 */
interface LogSamplingConfig {
  /** 每种事件类型在采样窗口内允许的最大日志数 */
  maxPerWindow: number;
  /** 采样窗口大小（毫秒） */
  windowMs: number;
  /** 不受采样限制的事件类型 */
  alwaysLogPatterns: string[];
}

class AgentStructuredLogger {
  private minLevel: LogLevel;
  private serviceName: string;
  private globalContext: LogContext;
  private maskingRules: MaskingRule[];
  private samplingConfig: LogSamplingConfig;
  private samplingCounters: Map<string, { count: number; windowStart: number }> =
    new Map();
  private outputHandlers: Array<(entry: StructuredLogEntry) => void>;

  constructor(options: {
    serviceName: string;
    minLevel?: LogLevel;
    globalContext?: LogContext;
    maskingRules?: MaskingRule[];
    samplingConfig?: LogSamplingConfig;
    outputHandlers?: Array<(entry: StructuredLogEntry) => void>;
  }) {
    this.serviceName = options.serviceName;
    this.minLevel = options.minLevel ?? LogLevel.INFO;
    this.globalContext = options.globalContext ?? {};
    this.maskingRules = options.maskingRules ?? this.defaultMaskingRules();
    this.samplingConfig = options.samplingConfig ?? {
      maxPerWindow: 100,
      windowMs: 60000,
      alwaysLogPatterns: ["error", "fatal", "security"],
    };
    this.outputHandlers = options.outputHandlers ?? [
      (entry) => console.log(JSON.stringify(entry)),
    ];
  }

  /**
   * 创建带有 Agent 上下文的子日志器
   */
  withContext(context: LogContext): AgentStructuredLogger {
    const child = new AgentStructuredLogger({
      serviceName: this.serviceName,
      minLevel: this.minLevel,
      globalContext: { ...this.globalContext, ...context },
      maskingRules: this.maskingRules,
      samplingConfig: this.samplingConfig,
      outputHandlers: this.outputHandlers,
    });
    return child;
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, data, error);
  }

  fatal(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log(LogLevel.FATAL, message, data, error);
  }

  // ---- Agent 专用日志方法 ----

  /**
   * 记录 Agent 循环开始
   */
  logIterationStart(iteration: number, maxIterations: number): void {
    this.info("Agent 循环迭代开始", {
      event: "agent.iteration.start",
      iteration,
      maxIterations,
      progress: `${iteration}/${maxIterations}`,
    });
  }

  /**
   * 记录 Agent 决策
   */
  logDecision(decision: string, reasoning: string): void {
    this.info("Agent 决策", {
      event: "agent.decision",
      decision,
      reasoning: this.truncate(reasoning, 500),
    });
  }

  /**
   * 记录 LLM 调用
   */
  logLLMCall(params: {
    model: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    costUsd: number;
    finishReason: string;
  }): void {
    this.info("LLM 调用完成", {
      event: "agent.llm.call",
      ...params,
    });
  }

  /**
   * 记录工具调用
   */
  logToolCall(params: {
    toolName: string;
    input: unknown;
    output: unknown;
    durationMs: number;
    success: boolean;
    errorMessage?: string;
  }): void {
    const level = params.success ? LogLevel.INFO : LogLevel.ERROR;
    const maskedInput = this.maskSensitiveData(
      JSON.stringify(params.input)
    );
    const maskedOutput = this.maskSensitiveData(
      this.truncate(JSON.stringify(params.output), 1000)
    );

    this.log(level, `工具调用: ${params.toolName}`, {
      event: "agent.tool.call",
      toolName: params.toolName,
      input: maskedInput,
      output: maskedOutput,
      durationMs: params.durationMs,
      success: params.success,
      ...(params.errorMessage && { errorMessage: params.errorMessage }),
    });
  }

  /**
   * 记录安全事件
   */
  logSecurityEvent(eventType: string, details: Record<string, unknown>): void {
    this.warn(`安全事件: ${eventType}`, {
      event: "agent.security",
      securityEventType: eventType,
      ...details,
    });
  }

  /**
   * 核心日志方法
   */
  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    error?: Error
  ): void {
    if (level < this.minLevel) return;

    // 采样检查（对非关键日志）
    const eventType = data?.["event"] as string | undefined;
    if (
      level < LogLevel.ERROR &&
      eventType &&
      !this.shouldLog(eventType)
    ) {
      return;
    }

    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level]!,
      message: this.maskSensitiveData(message),
      service: this.serviceName,
      context: { ...this.globalContext },
    };

    if (data) {
      entry.data = this.maskSensitiveDataInObject(data);
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: this.maskSensitiveData(error.message),
        stack: error.stack,
      };
    }

    // 输出到所有 handler
    for (const handler of this.outputHandlers) {
      try {
        handler(entry);
      } catch (e) {
        // 日志输出不应影响主流程
        console.error("[Logger] Output handler error:", e);
      }
    }
  }

  /**
   * 采样决策：是否应该记录这条日志
   */
  private shouldLog(eventType: string): boolean {
    // 始终记录的模式
    if (
      this.samplingConfig.alwaysLogPatterns.some((p) =>
        eventType.includes(p)
      )
    ) {
      return true;
    }

    const now = Date.now();
    const counter = this.samplingCounters.get(eventType);

    if (!counter || now - counter.windowStart > this.samplingConfig.windowMs) {
      // 新窗口
      this.samplingCounters.set(eventType, { count: 1, windowStart: now });
      return true;
    }

    if (counter.count < this.samplingConfig.maxPerWindow) {
      counter.count++;
      return true;
    }

    return false; // 超过窗口内的最大数量，丢弃
  }

  /**
   * 敏感数据脱敏
   */
  private maskSensitiveData(text: string): string {
    let masked = text;
    for (const rule of this.maskingRules) {
      masked = masked.replace(rule.pattern, rule.replacement);
    }
    return masked;
  }

  private maskSensitiveDataInObject(
    obj: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string") {
        result[key] = this.maskSensitiveData(value);
      } else if (typeof value === "object" && value !== null) {
        result[key] = this.maskSensitiveDataInObject(
          value as Record<string, unknown>
        );
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * 默认脱敏规则
   */
  private defaultMaskingRules(): MaskingRule[] {
    return [
      {
        name: "API Key",
        pattern: /(?:sk-|api[_-]?key[=:]\s*)[a-zA-Z0-9_-]{20,}/gi,
        replacement: "[REDACTED_API_KEY]",
      },
      {
        name: "Email",
        pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        replacement: "[REDACTED_EMAIL]",
      },
      {
        name: "Phone (CN)",
        pattern: /1[3-9]\d{9}/g,
        replacement: "[REDACTED_PHONE]",
      },
      {
        name: "ID Card (CN)",
        pattern: /\d{17}[\dXx]/g,
        replacement: "[REDACTED_ID]",
      },
      {
        name: "Bearer Token",
        pattern: /Bearer\s+[a-zA-Z0-9._-]{20,}/gi,
        replacement: "Bearer [REDACTED_TOKEN]",
      },
      {
        name: "Credit Card",
        pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
        replacement: "[REDACTED_CARD]",
      },
    ];
  }

  /**
   * 截断长文本
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + `... [truncated, total ${text.length} chars]`;
  }
}

// ---- 使用示例 ----
const logger = new AgentStructuredLogger({
  serviceName: "agent-service",
  minLevel: LogLevel.DEBUG,
  globalContext: {
    agentName: "research-agent",
    environment: "production",
  },
});

// 为特定请求创建带上下文的子日志器
const requestLogger = logger.withContext({
  traceId: "abc123def456",
  correlationId: "req-20240315-001",
  userId: "user-789",
  taskId: "task-001",
});

requestLogger.logIterationStart(1, 10);
requestLogger.logDecision(
  "search_web",
  "用户请求包含时效性信息（2024年Q1），需要搜索最新数据"
);
requestLogger.logLLMCall({
  model: "gpt-4-turbo",
  provider: "openai",
  inputTokens: 1523,
  outputTokens: 247,
  durationMs: 2340,
  costUsd: 0.0236,
  finishReason: "stop",
});

// 脱敏示例
requestLogger.logToolCall({
  toolName: "send_email",
  input: { to: "john@example.com", subject: "Report", apiKey: "sk-abc123xyz456" },
  output: { success: true },
  durationMs: 350,
  success: true,
});
```

### 17.4.2 跨 Agent 日志聚合器

在多 Agent 架构中，一个用户请求可能产生分散在多个 Agent 实例中的日志。日志聚合器的职责是将这些分散的日志按照 Correlation ID 关联起来，形成一个完整的执行视图。

```typescript
// ============================================================
// 跨 Agent 日志聚合器
// ============================================================

/** 聚合后的日志视图 */
interface AggregatedLogView {
  correlationId: string;
  traceId?: string;
  startTime: string;
  endTime: string;
  totalDurationMs: number;
  agentsInvolved: string[];
  totalLogEntries: number;
  entries: StructuredLogEntry[];
  summary: {
    infoCount: number;
    warnCount: number;
    errorCount: number;
    fatalCount: number;
    llmCalls: number;
    toolCalls: number;
    totalTokens: number;
    totalCostUsd: number;
  };
}

class LogAggregator {
  private logBuffer: StructuredLogEntry[] = [];
  private maxBufferSize: number;

  constructor(maxBufferSize: number = 100000) {
    this.maxBufferSize = maxBufferSize;
  }

  /**
   * 接收日志条目
   */
  ingest(entry: StructuredLogEntry): void {
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.splice(0, this.logBuffer.length - this.maxBufferSize);
    }
  }

  /**
   * 按 Correlation ID 聚合日志
   */
  aggregateByCorrelationId(correlationId: string): AggregatedLogView | null {
    const entries = this.logBuffer
      .filter((e) => e.context.correlationId === correlationId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    if (entries.length === 0) return null;

    const agents = new Set<string>();
    let llmCalls = 0;
    let toolCalls = 0;
    let totalTokens = 0;
    let totalCostUsd = 0;
    let infoCount = 0;
    let warnCount = 0;
    let errorCount = 0;
    let fatalCount = 0;

    for (const entry of entries) {
      if (entry.context.agentName) {
        agents.add(entry.context.agentName);
      }

      switch (entry.level) {
        case "INFO": infoCount++; break;
        case "WARN": warnCount++; break;
        case "ERROR": errorCount++; break;
        case "FATAL": fatalCount++; break;
      }

      const event = entry.data?.["event"] as string | undefined;
      if (event === "agent.llm.call") {
        llmCalls++;
        totalTokens += (entry.data?.["inputTokens"] as number ?? 0) +
                       (entry.data?.["outputTokens"] as number ?? 0);
        totalCostUsd += entry.data?.["costUsd"] as number ?? 0;
      }
      if (event === "agent.tool.call") {
        toolCalls++;
      }
    }

    const startTime = entries[0]!.timestamp;
    const endTime = entries[entries.length - 1]!.timestamp;
    const totalDurationMs =
      new Date(endTime).getTime() - new Date(startTime).getTime();

    return {
      correlationId,
      traceId: entries[0]?.context.traceId,
      startTime,
      endTime,
      totalDurationMs,
      agentsInvolved: Array.from(agents),
      totalLogEntries: entries.length,
      entries,
      summary: {
        infoCount,
        warnCount,
        errorCount,
        fatalCount,
        llmCalls,
        toolCalls,
        totalTokens,
        totalCostUsd,
      },
    };
  }

  /**
   * 搜索日志（模拟 ELK/Loki 查询）
   */
  search(query: {
    timeRange?: { from: string; to: string };
    level?: LogLevel;
    agentName?: string;
    eventType?: string;
    keyword?: string;
    limit?: number;
  }): StructuredLogEntry[] {
    let results = [...this.logBuffer];

    if (query.timeRange) {
      const from = new Date(query.timeRange.from).getTime();
      const to = new Date(query.timeRange.to).getTime();
      results = results.filter((e) => {
        const t = new Date(e.timestamp).getTime();
        return t >= from && t <= to;
      });
    }

    if (query.level !== undefined) {
      const levelName = LogLevel[query.level];
      results = results.filter((e) => e.level === levelName);
    }

    if (query.agentName) {
      results = results.filter(
        (e) => e.context.agentName === query.agentName
      );
    }

    if (query.eventType) {
      results = results.filter(
        (e) => e.data?.["event"] === query.eventType
      );
    }

    if (query.keyword) {
      const kw = query.keyword.toLowerCase();
      results = results.filter(
        (e) =>
          e.message.toLowerCase().includes(kw) ||
          JSON.stringify(e.data ?? {}).toLowerCase().includes(kw)
      );
    }

    return results.slice(0, query.limit ?? 100);
  }
}

// ---- 常见调查场景的查询示例 ----

/*
  场景 1：查找特定请求的所有日志
  Loki 查询:
  {service="agent-service"} |= `correlation_id="req-20240315-001"`

  ELK 查询:
  {
    "query": {
      "bool": {
        "must": [
          { "match": { "context.correlationId": "req-20240315-001" } }
        ]
      }
    },
    "sort": [{ "timestamp": { "order": "asc" } }]
  }

  场景 2：查找过去 1 小时内所有工具调用失败的日志
  Loki 查询:
  {service="agent-service"} | json | data_event="agent.tool.call" | data_success="false"

  场景 3：查找 Token 消耗最高的请求
  ELK 查询（聚合）:
  {
    "size": 0,
    "aggs": {
      "by_correlation": {
        "terms": { "field": "context.correlationId.keyword", "size": 10 },
        "aggs": {
          "total_tokens": {
            "sum": { "field": "data.inputTokens" }
          }
        }
      }
    }
  }

  场景 4：查找安全事件
  Loki 查询:
  {service="agent-service"} | json | data_event="agent.security"
*/
```

---

## 17.5 LLM 调用可观测性

LLM 调用是 Agent 系统中最核心、最昂贵、也最不透明的环节。一个典型的 Agent 执行过程中，60%-90% 的延迟和成本来自 LLM 调用。因此，针对 LLM 调用的深度可观测性不是锦上添花，而是必不可少的基础设施。

### 17.5.1 LLM 调用的可观测性维度

与普通的 API 调用不同，LLM 调用需要关注以下独特维度：

| 维度 | 说明 | 为什么重要 |
|------|------|-----------|
| Token 用量 | 输入/输出 Token 数量及分布 | 直接决定成本和延迟 |
| 延迟分解 | TTFT、生成速度、总延迟 | 用户体验和系统容量规划 |
| 模型版本 | 请求模型 vs 实际响应模型 | 模型切换后的质量回归检测 |
| Prompt 版本 | 使用的 Prompt 模板和版本 | Prompt 工程迭代的效果追踪 |
| 完成原因 | stop, length, content_filter 等 | 识别截断、过滤等问题 |
| 成本归因 | 单次调用成本、按任务/用户归因 | 成本优化和预算管理 |

### 17.5.2 LLM 可观测性层实现

```typescript
// ============================================================
// LLM 可观测性层 —— 完整实现
// ============================================================

/** LLM 调用请求 */
interface LLMRequest {
  model: string;
  provider: string;
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    name?: string;
  }>;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  tools?: Array<{ name: string; description: string }>;
  promptTemplate?: string;
  promptVersion?: string;
}

/** LLM 调用响应 */
interface LLMResponse {
  content: string;
  model: string;
  finishReason: "stop" | "length" | "tool_calls" | "content_filter" | "error";
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
}

/** LLM 调用记录 */
interface LLMCallRecord {
  id: string;
  timestamp: string;
  request: {
    model: string;
    provider: string;
    promptTemplate?: string;
    promptVersion?: string;
    temperature?: number;
    maxTokens?: number;
    messageCount: number;
    inputPreview: string;    // 截断的输入预览
    inputCharCount: number;
    toolCount: number;
  };
  response: {
    model: string;
    finishReason: string;
    outputPreview: string;   // 截断的输出预览
    outputCharCount: number;
    toolCallCount: number;
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
  };
  timing: {
    totalMs: number;
    timeToFirstTokenMs?: number;
    tokensPerSecond: number;
  };
  context: {
    traceId?: string;
    agentName?: string;
    taskId?: string;
    iteration?: number;
  };
}

/** 模型价格配置（每 1000 Token 的价格，美元） */
interface ModelPricing {
  inputPer1kTokens: number;
  outputPer1kTokens: number;
}

/** LLM 性能统计 */
interface LLMPerformanceStats {
  model: string;
  callCount: number;
  totalTokens: number;
  totalCostUsd: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgDurationMs: number;
  avgTokensPerSecond: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  avgCostPerCall: number;
  finishReasonDistribution: Record<string, number>;
  errorRate: number;
}

class LLMObservabilityLayer {
  private callRecords: LLMCallRecord[] = [];
  private maxRecords: number;
  private modelPricing: Map<string, ModelPricing>;
  private logger: AgentStructuredLogger;

  constructor(options: {
    maxRecords?: number;
    modelPricing?: Map<string, ModelPricing>;
    logger: AgentStructuredLogger;
  }) {
    this.maxRecords = options.maxRecords ?? 10000;
    this.logger = options.logger;
    this.modelPricing = options.modelPricing ?? this.defaultPricing();
  }

  /**
   * 包装 LLM 调用，自动添加可观测性
   */
  async wrapLLMCall(
    callFn: (request: LLMRequest) => Promise<LLMResponse>,
    request: LLMRequest,
    context: {
      traceId?: string;
      agentName?: string;
      taskId?: string;
      iteration?: number;
    } = {}
  ): Promise<{ response: LLMResponse; record: LLMCallRecord }> {
    const startTime = Date.now();
    let timeToFirstToken: number | undefined;
    let response: LLMResponse;

    try {
      response = await callFn(request);
      timeToFirstToken = Date.now() - startTime; // 简化：实际需要流式回调
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorRecord = this.createErrorRecord(
        request,
        error as Error,
        durationMs,
        context
      );
      this.storeRecord(errorRecord);

      this.logger.error("LLM 调用失败", error as Error, {
        event: "agent.llm.error",
        model: request.model,
        provider: request.provider,
        durationMs,
      });

      throw error;
    }

    const totalMs = Date.now() - startTime;
    const costUsd = this.calculateCost(
      request.model,
      response.usage.inputTokens,
      response.usage.outputTokens
    );
    const tokensPerSecond =
      totalMs > 0 ? (response.usage.outputTokens / totalMs) * 1000 : 0;

    const inputText = request.messages.map((m) => m.content).join("\n");
    const record: LLMCallRecord = {
      id: `llm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      request: {
        model: request.model,
        provider: request.provider,
        promptTemplate: request.promptTemplate,
        promptVersion: request.promptVersion,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        messageCount: request.messages.length,
        inputPreview: inputText.slice(0, 200),
        inputCharCount: inputText.length,
        toolCount: request.tools?.length ?? 0,
      },
      response: {
        model: response.model,
        finishReason: response.finishReason,
        outputPreview: response.content.slice(0, 200),
        outputCharCount: response.content.length,
        toolCallCount: response.toolCalls?.length ?? 0,
      },
      usage: {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        totalTokens: response.usage.totalTokens,
        costUsd,
      },
      timing: {
        totalMs,
        timeToFirstTokenMs: timeToFirstToken,
        tokensPerSecond,
      },
      context,
    };

    this.storeRecord(record);

    this.logger.logLLMCall({
      model: response.model,
      provider: request.provider,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      durationMs: totalMs,
      costUsd,
      finishReason: response.finishReason,
    });

    return { response, record };
  }

  /**
   * 计算 LLM 调用成本
   */
  calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    const pricing = this.modelPricing.get(model);
    if (!pricing) {
      // 尝试模糊匹配
      for (const [key, value] of this.modelPricing) {
        if (model.startsWith(key) || model.includes(key)) {
          return (
            (inputTokens / 1000) * value.inputPer1kTokens +
            (outputTokens / 1000) * value.outputPer1kTokens
          );
        }
      }
      return 0; // 未知模型，无法计算
    }
    return (
      (inputTokens / 1000) * pricing.inputPer1kTokens +
      (outputTokens / 1000) * pricing.outputPer1kTokens
    );
  }

  /**
   * 获取指定模型的性能统计
   */
  getPerformanceStats(model?: string): LLMPerformanceStats[] {
    const recordsByModel = new Map<string, LLMCallRecord[]>();
    for (const record of this.callRecords) {
      const m = model ?? record.request.model;
      if (model && record.request.model !== model) continue;
      const existing = recordsByModel.get(record.request.model) ?? [];
      existing.push(record);
      recordsByModel.set(record.request.model, existing);
    }

    const stats: LLMPerformanceStats[] = [];
    for (const [modelName, records] of recordsByModel) {
      const durations = records
        .map((r) => r.timing.totalMs)
        .sort((a, b) => a - b);

      const finishReasons = new Map<string, number>();
      let errorCount = 0;

      for (const r of records) {
        const reason = r.response.finishReason;
        finishReasons.set(reason, (finishReasons.get(reason) ?? 0) + 1);
        if (reason === "error") errorCount++;
      }

      stats.push({
        model: modelName,
        callCount: records.length,
        totalTokens: records.reduce(
          (s, r) => s + r.usage.totalTokens,
          0
        ),
        totalCostUsd: records.reduce(
          (s, r) => s + r.usage.costUsd,
          0
        ),
        avgInputTokens: Math.round(
          records.reduce((s, r) => s + r.usage.inputTokens, 0) /
            records.length
        ),
        avgOutputTokens: Math.round(
          records.reduce((s, r) => s + r.usage.outputTokens, 0) /
            records.length
        ),
        avgDurationMs: Math.round(
          durations.reduce((s, d) => s + d, 0) / durations.length
        ),
        avgTokensPerSecond:
          Math.round(
            records.reduce((s, r) => s + r.timing.tokensPerSecond, 0) /
              records.length * 10
          ) / 10,
        p50DurationMs: this.percentile(durations, 50),
        p95DurationMs: this.percentile(durations, 95),
        p99DurationMs: this.percentile(durations, 99),
        avgCostPerCall:
          records.reduce((s, r) => s + r.usage.costUsd, 0) /
          records.length,
        finishReasonDistribution: Object.fromEntries(finishReasons),
        errorRate: errorCount / records.length,
      });
    }

    return stats;
  }

  /**
   * 查找昂贵的调用
   */
  findExpensiveCalls(topN: number = 10): LLMCallRecord[] {
    return [...this.callRecords]
      .sort((a, b) => b.usage.costUsd - a.usage.costUsd)
      .slice(0, topN);
  }

  /**
   * 查找慢速调用
   */
  findSlowCalls(topN: number = 10): LLMCallRecord[] {
    return [...this.callRecords]
      .sort((a, b) => b.timing.totalMs - a.timing.totalMs)
      .slice(0, topN);
  }

  /**
   * 按 Prompt 版本比较性能
   */
  comparePromptVersions(
    templateName: string
  ): Map<string, { count: number; avgDuration: number; avgCost: number; avgTokens: number }> {
    const byVersion = new Map<string, LLMCallRecord[]>();

    for (const record of this.callRecords) {
      if (record.request.promptTemplate === templateName) {
        const version = record.request.promptVersion ?? "unknown";
        const existing = byVersion.get(version) ?? [];
        existing.push(record);
        byVersion.set(version, existing);
      }
    }

    const result = new Map<
      string,
      { count: number; avgDuration: number; avgCost: number; avgTokens: number }
    >();

    for (const [version, records] of byVersion) {
      result.set(version, {
        count: records.length,
        avgDuration: Math.round(
          records.reduce((s, r) => s + r.timing.totalMs, 0) / records.length
        ),
        avgCost:
          records.reduce((s, r) => s + r.usage.costUsd, 0) / records.length,
        avgTokens: Math.round(
          records.reduce((s, r) => s + r.usage.totalTokens, 0) / records.length
        ),
      });
    }

    return result;
  }

  private createErrorRecord(
    request: LLMRequest,
    error: Error,
    durationMs: number,
    context: Record<string, unknown>
  ): LLMCallRecord {
    const inputText = request.messages.map((m) => m.content).join("\n");
    return {
      id: `llm-err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      request: {
        model: request.model,
        provider: request.provider,
        promptTemplate: request.promptTemplate,
        promptVersion: request.promptVersion,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        messageCount: request.messages.length,
        inputPreview: inputText.slice(0, 200),
        inputCharCount: inputText.length,
        toolCount: request.tools?.length ?? 0,
      },
      response: {
        model: request.model,
        finishReason: "error",
        outputPreview: error.message.slice(0, 200),
        outputCharCount: error.message.length,
        toolCallCount: 0,
      },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 },
      timing: { totalMs: durationMs, tokensPerSecond: 0 },
      context: context as LLMCallRecord["context"],
    };
  }

  private storeRecord(record: LLMCallRecord): void {
    this.callRecords.push(record);
    if (this.callRecords.length > this.maxRecords) {
      this.callRecords.splice(0, this.callRecords.length - this.maxRecords);
    }
  }

  private defaultPricing(): Map<string, ModelPricing> {
    return new Map([
      ["gpt-4-turbo", { inputPer1kTokens: 0.01, outputPer1kTokens: 0.03 }],
      ["gpt-4o", { inputPer1kTokens: 0.005, outputPer1kTokens: 0.015 }],
      ["gpt-4o-mini", { inputPer1kTokens: 0.00015, outputPer1kTokens: 0.0006 }],
      ["gpt-3.5-turbo", { inputPer1kTokens: 0.0005, outputPer1kTokens: 0.0015 }],
      ["claude-3-opus", { inputPer1kTokens: 0.015, outputPer1kTokens: 0.075 }],
      ["claude-3-sonnet", { inputPer1kTokens: 0.003, outputPer1kTokens: 0.015 }],
      ["claude-3-haiku", { inputPer1kTokens: 0.00025, outputPer1kTokens: 0.00125 }],
    ]);
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)] ?? 0;
  }
}
```

### 17.5.3 LLM 性能分析器

基于 `LLMObservabilityLayer` 收集的数据，我们可以构建一个更高层次的分析器，自动识别性能问题和优化机会：

```typescript
// ============================================================
// LLM 性能分析器
// ============================================================

/** 分析建议 */
interface LLMOptimizationSuggestion {
  category: "cost" | "latency" | "quality" | "reliability";
  severity: "low" | "medium" | "high";
  title: string;
  description: string;
  estimatedImpact: string;
  actionItems: string[];
}

class LLMPerformanceAnalyzer {
  constructor(private readonly observability: LLMObservabilityLayer) {}

  /**
   * 运行完整的性能分析
   */
  analyze(): LLMOptimizationSuggestion[] {
    const suggestions: LLMOptimizationSuggestion[] = [];

    suggestions.push(...this.analyzeCostOptimizations());
    suggestions.push(...this.analyzeLatencyIssues());
    suggestions.push(...this.analyzeQualityPatterns());
    suggestions.push(...this.analyzeReliability());

    // 按严重性排序
    const severityOrder: Record<string, number> = {
      high: 0,
      medium: 1,
      low: 2,
    };
    suggestions.sort(
      (a, b) => severityOrder[a.severity]! - severityOrder[b.severity]!
    );

    return suggestions;
  }

  /**
   * 成本优化分析
   */
  private analyzeCostOptimizations(): LLMOptimizationSuggestion[] {
    const suggestions: LLMOptimizationSuggestion[] = [];
    const stats = this.observability.getPerformanceStats();

    for (const stat of stats) {
      // 检查是否可以使用更便宜的模型
      if (
        stat.model.includes("gpt-4") &&
        stat.avgOutputTokens < 200 &&
        stat.callCount > 100
      ) {
        suggestions.push({
          category: "cost",
          severity: "high",
          title: `模型降级机会: ${stat.model}`,
          description:
            `${stat.model} 的平均输出仅 ${stat.avgOutputTokens} Token，` +
            `这类简单任务可能不需要使用高端模型。`,
          estimatedImpact:
            `当前 ${stat.callCount} 次调用总成本 $${stat.totalCostUsd.toFixed(2)}，` +
            `降级到 gpt-4o-mini 可节省约 90%。`,
          actionItems: [
            "分析这些调用的任务类型，确认是否为简单分类/提取任务",
            "在测试环境中使用 gpt-4o-mini 运行相同任务，比较质量",
            "实现基于任务复杂度的动态模型选择策略",
          ],
        });
      }

      // 检查输入 Token 是否过多
      if (stat.avgInputTokens > 3000 && stat.callCount > 50) {
        suggestions.push({
          category: "cost",
          severity: "medium",
          title: `输入 Token 过多: ${stat.model}`,
          description:
            `${stat.model} 的平均输入 Token 为 ${stat.avgInputTokens}，` +
            `可能包含了不必要的上下文信息。`,
          estimatedImpact:
            `减少 30% 的输入 Token 可节省约 ` +
            `$${(stat.totalCostUsd * 0.3 * (stat.avgInputTokens / (stat.avgInputTokens + stat.avgOutputTokens))).toFixed(2)}。`,
          actionItems: [
            "审查 System Prompt 长度，去除冗余指令",
            "实现上下文窗口滑动策略，只保留最近的对话历史",
            "对长文档输入使用摘要预处理",
          ],
        });
      }
    }

    // 检查最贵的调用
    const expensiveCalls = this.observability.findExpensiveCalls(5);
    if (expensiveCalls.length > 0) {
      const topCost = expensiveCalls[0]!;
      if (topCost.usage.costUsd > 0.5) {
        suggestions.push({
          category: "cost",
          severity: "high",
          title: "存在高成本单次调用",
          description:
            `最贵的单次 LLM 调用成本达 $${topCost.usage.costUsd.toFixed(4)}，` +
            `使用了 ${topCost.usage.totalTokens} Token。`,
          estimatedImpact:
            "限制单次调用的最大 Token 数可以避免意外的高成本。",
          actionItems: [
            `检查 Trace ${topCost.context.traceId} 的完整执行链路`,
            "为所有 LLM 调用设置 max_tokens 上限",
            "实现每任务的成本预算限制",
          ],
        });
      }
    }

    return suggestions;
  }

  /**
   * 延迟问题分析
   */
  private analyzeLatencyIssues(): LLMOptimizationSuggestion[] {
    const suggestions: LLMOptimizationSuggestion[] = [];
    const stats = this.observability.getPerformanceStats();

    for (const stat of stats) {
      // P95 延迟过高
      if (stat.p95DurationMs > 10000) {
        suggestions.push({
          category: "latency",
          severity: stat.p95DurationMs > 30000 ? "high" : "medium",
          title: `高延迟: ${stat.model} P95=${stat.p95DurationMs}ms`,
          description:
            `模型 ${stat.model} 的 P95 延迟为 ${stat.p95DurationMs}ms ` +
            `(平均 ${stat.avgDurationMs}ms)，` +
            `可能影响用户体验。`,
          estimatedImpact:
            "降低 P95 延迟可以显著改善用户等待时间。",
          actionItems: [
            "检查是否存在请求排队（API 限流）",
            "考虑使用流式输出降低首字延迟",
            "评估是否可以使用更快的模型处理部分请求",
            "实现请求超时和降级策略",
          ],
        });
      }

      // P99/P95 比值过大（长尾延迟）
      if (
        stat.p95DurationMs > 0 &&
        stat.p99DurationMs / stat.p95DurationMs > 3
      ) {
        suggestions.push({
          category: "latency",
          severity: "medium",
          title: `长尾延迟: ${stat.model}`,
          description:
            `P99/P95 比值为 ${(stat.p99DurationMs / stat.p95DurationMs).toFixed(1)}x，` +
            `存在严重的长尾延迟问题。`,
          estimatedImpact:
            "减少长尾延迟可以提高系统的可预测性和稳定性。",
          actionItems: [
            "分析 P99 请求的共同特征（输入长度、工具调用数）",
            "实现超时后自动重试到备用模型的策略",
            "考虑对大输入进行分批处理",
          ],
        });
      }
    }

    return suggestions;
  }

  /**
   * 质量模式分析
   */
  private analyzeQualityPatterns(): LLMOptimizationSuggestion[] {
    const suggestions: LLMOptimizationSuggestion[] = [];
    const stats = this.observability.getPerformanceStats();

    for (const stat of stats) {
      // 检查 length 完成原因的比例
      const lengthCount = stat.finishReasonDistribution["length"] ?? 0;
      const lengthRatio = lengthCount / stat.callCount;

      if (lengthRatio > 0.05) {
        suggestions.push({
          category: "quality",
          severity: lengthRatio > 0.2 ? "high" : "medium",
          title: `输出被截断: ${stat.model}`,
          description:
            `${(lengthRatio * 100).toFixed(1)}% 的调用因达到 max_tokens 限制而被截断。` +
            `这可能导致 Agent 收到不完整的响应。`,
          estimatedImpact:
            "被截断的响应可能导致 Agent 需要额外的迭代来完成任务。",
          actionItems: [
            "增加 max_tokens 参数",
            "优化 Prompt 使 LLM 生成更简洁的回复",
            "实现自动检测截断并请求继续生成的机制",
          ],
        });
      }

      // 检查 content_filter 比例
      const filterCount =
        stat.finishReasonDistribution["content_filter"] ?? 0;
      if (filterCount > 0) {
        suggestions.push({
          category: "quality",
          severity: "medium",
          title: `内容过滤触发: ${stat.model}`,
          description:
            `${filterCount} 次调用被内容安全过滤器拦截。`,
          estimatedImpact:
            "内容过滤可能导致 Agent 无法正常完成某些合法任务。",
          actionItems: [
            "审查触发内容过滤的请求内容",
            "调整 System Prompt 避免生成敏感内容",
            "实现内容过滤时的降级策略",
          ],
        });
      }
    }

    return suggestions;
  }

  /**
   * 可靠性分析
   */
  private analyzeReliability(): LLMOptimizationSuggestion[] {
    const suggestions: LLMOptimizationSuggestion[] = [];
    const stats = this.observability.getPerformanceStats();

    for (const stat of stats) {
      if (stat.errorRate > 0.01) {
        suggestions.push({
          category: "reliability",
          severity: stat.errorRate > 0.05 ? "high" : "medium",
          title: `高错误率: ${stat.model}`,
          description:
            `模型 ${stat.model} 的错误率为 ${(stat.errorRate * 100).toFixed(2)}%。`,
          estimatedImpact:
            "高错误率直接影响任务成功率和用户体验。",
          actionItems: [
            "检查错误类型分布（限流、超时、服务端错误）",
            "实现指数退避重试策略",
            "配置备用模型提供商作为故障转移",
            "监控 API 提供商的状态页面",
          ],
        });
      }
    }

    return suggestions;
  }
}
```

---

## 17.6 Agent 行为分析

收集了追踪、指标和日志之后，下一个层次是从数据中提取**行为洞察**。Agent 行为分析超越了简单的"是否成功"判断，深入理解 Agent 的决策模式、工具使用习惯、以及执行路径特征。

### 17.6.1 行为分析的核心问题

- **决策路径频率**：Agent 最常走的执行路径是什么？是否存在冗余步骤？
- **工具使用模式**：哪些工具组合最常一起使用？是否有工具被低效使用？
- **错误模式聚类**：错误是否有规律？是否集中在某些场景或输入类型？
- **会话回放**：能否完整还原 Agent 的执行过程用于事后分析？

### 17.6.2 Agent 行为分析器

```typescript
// ============================================================
// Agent 行为分析器
// ============================================================

/** Agent 执行步骤 */
interface AgentStep {
  type: "llm_call" | "tool_call" | "sub_agent" | "decision";
  name: string;
  timestamp: number;
  durationMs: number;
  input?: string;
  output?: string;
  metadata: Record<string, unknown>;
}

/** 执行路径 */
interface ExecutionPath {
  steps: string[];     // 步骤名称序列，如 ["llm", "tool:search", "llm", "tool:calc"]
  frequency: number;
  avgDurationMs: number;
  avgCostUsd: number;
  successRate: number;
}

/** 工具使用模式 */
interface ToolUsagePattern {
  toolName: string;
  frequency: number;
  avgDurationMs: number;
  successRate: number;
  commonPredecessors: Array<{ tool: string; frequency: number }>;
  commonSuccessors: Array<{ tool: string; frequency: number }>;
}

/** 错误模式 */
interface ErrorPattern {
  clusterId: string;
  errorType: string;
  frequency: number;
  commonContext: {
    tools: string[];
    iterations: number[];
    models: string[];
  };
  examples: Array<{
    traceId: string;
    errorMessage: string;
    timestamp: string;
  }>;
}

/** 会话记录 */
interface SessionRecord {
  sessionId: string;
  taskId: string;
  agentName: string;
  startTime: string;
  endTime: string;
  totalDurationMs: number;
  success: boolean;
  steps: AgentStep[];
  totalTokens: number;
  totalCostUsd: number;
  iterationCount: number;
  finalOutput?: string;
}

class AgentBehaviorAnalyzer {
  private sessions: SessionRecord[] = [];
  private maxSessions: number;

  constructor(maxSessions: number = 5000) {
    this.maxSessions = maxSessions;
  }

  /**
   * 记录一个完整的 Agent 会话
   */
  recordSession(session: SessionRecord): void {
    this.sessions.push(session);
    if (this.sessions.length > this.maxSessions) {
      this.sessions.splice(0, this.sessions.length - this.maxSessions);
    }
  }

  /**
   * 分析决策路径频率
   */
  analyzeDecisionPaths(topN: number = 20): ExecutionPath[] {
    const pathMap = new Map<
      string,
      { count: number; durations: number[]; costs: number[]; successes: number }
    >();

    for (const session of this.sessions) {
      const pathKey = session.steps
        .map((s) => {
          switch (s.type) {
            case "llm_call": return "llm";
            case "tool_call": return `tool:${s.name}`;
            case "sub_agent": return `agent:${s.name}`;
            case "decision": return `decision:${s.name}`;
          }
        })
        .join(" → ");

      const existing = pathMap.get(pathKey) ?? {
        count: 0,
        durations: [],
        costs: [],
        successes: 0,
      };
      existing.count++;
      existing.durations.push(session.totalDurationMs);
      existing.costs.push(session.totalCostUsd);
      if (session.success) existing.successes++;
      pathMap.set(pathKey, existing);
    }

    const paths: ExecutionPath[] = Array.from(pathMap.entries())
      .map(([pathStr, data]) => ({
        steps: pathStr.split(" → "),
        frequency: data.count,
        avgDurationMs: Math.round(
          data.durations.reduce((s, d) => s + d, 0) / data.durations.length
        ),
        avgCostUsd:
          data.costs.reduce((s, c) => s + c, 0) / data.costs.length,
        successRate: data.successes / data.count,
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, topN);

    return paths;
  }

  /**
   * 分析工具使用模式
   */
  analyzeToolUsagePatterns(): ToolUsagePattern[] {
    const toolStats = new Map<
      string,
      {
        count: number;
        durations: number[];
        successes: number;
        predecessors: Map<string, number>;
        successors: Map<string, number>;
      }
    >();

    for (const session of this.sessions) {
      const toolSteps = session.steps.filter(
        (s) => s.type === "tool_call"
      );

      for (let i = 0; i < toolSteps.length; i++) {
        const step = toolSteps[i]!;
        const existing = toolStats.get(step.name) ?? {
          count: 0,
          durations: [],
          successes: 0,
          predecessors: new Map(),
          successors: new Map(),
        };

        existing.count++;
        existing.durations.push(step.durationMs);
        if (!step.metadata["error"]) existing.successes++;

        // 前驱工具
        if (i > 0) {
          const pred = toolSteps[i - 1]!.name;
          existing.predecessors.set(
            pred,
            (existing.predecessors.get(pred) ?? 0) + 1
          );
        }

        // 后继工具
        if (i < toolSteps.length - 1) {
          const succ = toolSteps[i + 1]!.name;
          existing.successors.set(
            succ,
            (existing.successors.get(succ) ?? 0) + 1
          );
        }

        toolStats.set(step.name, existing);
      }
    }

    const patterns: ToolUsagePattern[] = [];
    for (const [toolName, stats] of toolStats) {
      patterns.push({
        toolName,
        frequency: stats.count,
        avgDurationMs: Math.round(
          stats.durations.reduce((s, d) => s + d, 0) / stats.durations.length
        ),
        successRate: stats.successes / stats.count,
        commonPredecessors: Array.from(stats.predecessors.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([tool, freq]) => ({ tool, frequency: freq })),
        commonSuccessors: Array.from(stats.successors.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([tool, freq]) => ({ tool, frequency: freq })),
      });
    }

    return patterns.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * 错误模式聚类
   */
  analyzeErrorPatterns(): ErrorPattern[] {
    const errorSessions = this.sessions.filter((s) => !s.success);
    const clusters = new Map<string, ErrorPattern>();

    for (const session of errorSessions) {
      const errorSteps = session.steps.filter(
        (s) => s.metadata["error"]
      );
      if (errorSteps.length === 0) continue;

      // 简化的聚类：基于错误工具和错误消息类型
      const errorTool = errorSteps[0]?.name ?? "unknown";
      const errorMsg = String(errorSteps[0]?.metadata["error"] ?? "");
      const errorType = this.classifyError(errorMsg);
      const clusterKey = `${errorTool}:${errorType}`;

      const existing = clusters.get(clusterKey) ?? {
        clusterId: clusterKey,
        errorType,
        frequency: 0,
        commonContext: {
          tools: [],
          iterations: [],
          models: [],
        },
        examples: [],
      };

      existing.frequency++;

      const tools = session.steps
        .filter((s) => s.type === "tool_call")
        .map((s) => s.name);
      existing.commonContext.tools.push(...tools);
      existing.commonContext.iterations.push(session.iterationCount);

      if (existing.examples.length < 5) {
        existing.examples.push({
          traceId: session.taskId,
          errorMessage: errorMsg.slice(0, 200),
          timestamp: session.startTime,
        });
      }

      clusters.set(clusterKey, existing);
    }

    // 去重并排序
    const patterns = Array.from(clusters.values())
      .sort((a, b) => b.frequency - a.frequency);

    for (const pattern of patterns) {
      pattern.commonContext.tools = [
        ...new Set(pattern.commonContext.tools),
      ];
      pattern.commonContext.models = [
        ...new Set(pattern.commonContext.models),
      ];
    }

    return patterns;
  }

  /**
   * 简单的错误分类
   */
  private classifyError(errorMsg: string): string {
    const lower = errorMsg.toLowerCase();
    if (lower.includes("timeout")) return "timeout";
    if (lower.includes("rate limit") || lower.includes("429"))
      return "rate_limit";
    if (lower.includes("auth") || lower.includes("401") || lower.includes("403"))
      return "auth_error";
    if (lower.includes("not found") || lower.includes("404"))
      return "not_found";
    if (lower.includes("server") || lower.includes("500") || lower.includes("503"))
      return "server_error";
    if (lower.includes("parse") || lower.includes("json"))
      return "parse_error";
    if (lower.includes("loop") || lower.includes("max iteration"))
      return "loop_exceeded";
    return "unknown";
  }
}
```

### 17.6.3 会话回放器

会话回放是 Agent 可观测性中最强大的调试工具之一。它能够完整还原一次 Agent 执行的全过程，包括每一步的推理、决策和工具交互，让开发者像观看录像回放一样理解 Agent 的行为。

```typescript
// ============================================================
// 会话回放器
// ============================================================

/** 回放事件 */
interface ReplayEvent {
  timestamp: number;
  relativeTimeMs: number;
  type: "system" | "user_input" | "agent_thinking" | "llm_call" | "llm_response" |
    "tool_call" | "tool_response" | "decision" | "output" | "error";
  actor: string;
  content: string;
  metadata?: Record<string, unknown>;
}

/** 回放视图 */
interface SessionReplayView {
  sessionId: string;
  taskId: string;
  agentName: string;
  success: boolean;
  totalDurationMs: number;
  totalCostUsd: number;
  events: ReplayEvent[];
  timeline: string; // 人类可读的时间线
}

class SessionReplayer {
  /**
   * 从会话记录生成回放视图
   */
  generateReplay(session: SessionRecord): SessionReplayView {
    const startTimestamp = new Date(session.startTime).getTime();
    const events: ReplayEvent[] = [];

    // 开始事件
    events.push({
      timestamp: startTimestamp,
      relativeTimeMs: 0,
      type: "system",
      actor: "system",
      content: `会话开始 | Agent: ${session.agentName} | 任务: ${session.taskId}`,
    });

    // 将每个步骤转换为回放事件
    for (const step of session.steps) {
      const relativeMs = step.timestamp - startTimestamp;

      switch (step.type) {
        case "llm_call":
          events.push({
            timestamp: step.timestamp,
            relativeTimeMs: relativeMs,
            type: "llm_call",
            actor: session.agentName,
            content: `调用 LLM: ${step.name}`,
            metadata: {
              inputPreview: step.input?.slice(0, 300),
              model: step.metadata["model"],
            },
          });

          events.push({
            timestamp: step.timestamp + step.durationMs,
            relativeTimeMs: relativeMs + step.durationMs,
            type: "llm_response",
            actor: step.name,
            content: step.output?.slice(0, 500) ?? "(无输出)",
            metadata: {
              tokens: step.metadata["totalTokens"],
              costUsd: step.metadata["costUsd"],
              durationMs: step.durationMs,
            },
          });
          break;

        case "tool_call":
          events.push({
            timestamp: step.timestamp,
            relativeTimeMs: relativeMs,
            type: "tool_call",
            actor: session.agentName,
            content: `调用工具: ${step.name}`,
            metadata: {
              input: step.input?.slice(0, 200),
            },
          });

          events.push({
            timestamp: step.timestamp + step.durationMs,
            relativeTimeMs: relativeMs + step.durationMs,
            type: "tool_response",
            actor: step.name,
            content: step.metadata["error"]
              ? `[错误] ${step.metadata["error"]}`
              : step.output?.slice(0, 300) ?? "(无输出)",
            metadata: {
              success: !step.metadata["error"],
              durationMs: step.durationMs,
            },
          });
          break;

        case "decision":
          events.push({
            timestamp: step.timestamp,
            relativeTimeMs: relativeMs,
            type: "decision",
            actor: session.agentName,
            content: `决策: ${step.name} | ${step.output ?? ""}`,
            metadata: step.metadata,
          });
          break;

        case "sub_agent":
          events.push({
            timestamp: step.timestamp,
            relativeTimeMs: relativeMs,
            type: "agent_thinking",
            actor: session.agentName,
            content: `委托子 Agent: ${step.name}`,
            metadata: {
              durationMs: step.durationMs,
              result: step.output?.slice(0, 200),
            },
          });
          break;
      }
    }

    // 添加结束事件
    if (session.finalOutput) {
      events.push({
        timestamp: new Date(session.endTime).getTime(),
        relativeTimeMs: session.totalDurationMs,
        type: "output",
        actor: session.agentName,
        content: session.finalOutput.slice(0, 500),
      });
    }

    events.push({
      timestamp: new Date(session.endTime).getTime(),
      relativeTimeMs: session.totalDurationMs,
      type: "system",
      actor: "system",
      content:
        `会话结束 | 状态: ${session.success ? "成功" : "失败"} | ` +
        `耗时: ${session.totalDurationMs}ms | ` +
        `成本: $${session.totalCostUsd.toFixed(4)} | ` +
        `迭代: ${session.iterationCount}`,
    });

    // 按时间排序
    events.sort((a, b) => a.timestamp - b.timestamp);

    return {
      sessionId: session.sessionId,
      taskId: session.taskId,
      agentName: session.agentName,
      success: session.success,
      totalDurationMs: session.totalDurationMs,
      totalCostUsd: session.totalCostUsd,
      events,
      timeline: this.generateTimeline(events),
    };
  }

  /**
   * 生成人类可读的时间线
   */
  private generateTimeline(events: ReplayEvent[]): string {
    const lines: string[] = [];
    lines.push("=" .repeat(80));
    lines.push("Agent 执行时间线");
    lines.push("=".repeat(80));

    for (const event of events) {
      const timeStr = this.formatRelativeTime(event.relativeTimeMs);
      const typeIcon = this.getEventIcon(event.type);
      const actorStr = event.actor.padEnd(20);

      lines.push(
        `[${timeStr}] ${typeIcon} ${actorStr} | ${event.content}`
      );

      // 添加元数据摘要
      if (event.metadata) {
        const metaItems: string[] = [];
        if (event.metadata["durationMs"]) {
          metaItems.push(`耗时: ${event.metadata["durationMs"]}ms`);
        }
        if (event.metadata["tokens"]) {
          metaItems.push(`Token: ${event.metadata["tokens"]}`);
        }
        if (event.metadata["costUsd"]) {
          metaItems.push(
            `成本: $${Number(event.metadata["costUsd"]).toFixed(4)}`
          );
        }
        if (metaItems.length > 0) {
          lines.push(
            `${"".padEnd(12)} ${"".padEnd(3)} ${"".padEnd(20)} | ↳ ${metaItems.join(" | ")}`
          );
        }
      }
    }

    lines.push("=".repeat(80));
    return lines.join("\n");
  }

  private formatRelativeTime(ms: number): string {
    if (ms < 1000) return `${ms}ms`.padStart(8);
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`.padStart(8);
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m${seconds}s`.padStart(8);
  }

  private getEventIcon(type: ReplayEvent["type"]): string {
    const icons: Record<string, string> = {
      system: "[SYS]",
      user_input: "[USR]",
      agent_thinking: "[THK]",
      llm_call: "[LLM>]",
      llm_response: "[<LLM]",
      tool_call: "[TL>]",
      tool_response: "[<TL]",
      decision: "[DEC]",
      output: "[OUT]",
      error: "[ERR]",
    };
    return (icons[type] ?? "[???]").padEnd(6);
  }
}
```

---

## 17.7 告警与事件响应

在前面的章节中，我们已经在指标体系（17.3）中实现了 `AlertRuleEngine`。本节将进一步扩展，聚焦于 Agent 系统特有的告警场景以及完整的事件响应流程。

### 17.7.1 Agent 专属告警场景

传统的告警通常围绕可用性（服务是否在线）和性能（延迟是否在阈值内）。Agent 系统引入了一系列新的告警场景：

| 告警场景 | 触发条件 | 严重性 | 建议响应 |
|---------|---------|--------|---------|
| Agent 无限循环 | 单个请求迭代次数 > max_iterations | Critical | 立即终止请求，检查 Prompt |
| Token 预算耗尽 | 单个任务 Token 消耗超过预算 | Warning | 降级模型或终止任务 |
| 工具调用风暴 | 短时间内工具调用频率异常 | Warning | 限流、检查 Agent 逻辑 |
| LLM 幻觉检测 | 输出包含已知幻觉模式 | Warning | 标记输出需人工审核 |
| 成本异常飙升 | 小时成本超过日均 3 倍标准差 | Critical | 暂停非关键请求，排查原因 |
| 多 Agent 死锁 | 多个 Agent 循环等待 | Emergency | 打断循环，人工介入 |
| 安全边界违规 | Agent 尝试执行未授权操作 | Emergency | 立即阻止，通知安全团队 |
| 模型服务降级 | LLM API 错误率 > 5% | Critical | 切换到备用模型 |

### 17.7.2 Agent 告警管理器

```typescript
// ============================================================
// Agent 告警管理器 —— 完整实现
// ============================================================

/** 告警事件 */
interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  state: AlertState;
  message: string;
  details: Record<string, unknown>;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: string;
  endsAt?: string;
  fingerprint: string;
  generatorURL?: string;
}

/** 告警分组 */
interface AlertGroup {
  groupKey: string;
  alerts: AlertEvent[];
  commonLabels: Record<string, string>;
  latestAlert: AlertEvent;
}

/** Runbook 条目 */
interface RunbookEntry {
  alertRuleId: string;
  title: string;
  description: string;
  diagnosticSteps: string[];
  remediationSteps: string[];
  escalationPolicy: string;
  automatedActions?: Array<{
    name: string;
    condition: string;
    action: () => Promise<void>;
  }>;
}

class AgentAlertManager {
  private alertHistory: AlertEvent[] = [];
  private activeAlerts: Map<string, AlertEvent> = new Map();
  private runbooks: Map<string, RunbookEntry> = new Map();
  private deduplicationWindow: Map<string, number> = new Map();
  private readonly deduplicationWindowMs: number;

  constructor(options: {
    deduplicationWindowMs?: number;
  } = {}) {
    this.deduplicationWindowMs = options.deduplicationWindowMs ?? 300000; // 5 分钟去重窗口
    this.registerDefaultRunbooks();
  }

  /**
   * 处理告警事件
   * 包含去重、分组、路由逻辑
   */
  async processAlert(event: AlertEvent): Promise<{
    action: "new" | "deduplicated" | "resolved" | "grouped";
    groupKey?: string;
  }> {
    // 1. 去重检查
    const lastSeen = this.deduplicationWindow.get(event.fingerprint);
    const now = Date.now();
    if (
      lastSeen &&
      now - lastSeen < this.deduplicationWindowMs &&
      event.state === AlertState.FIRING
    ) {
      return { action: "deduplicated" };
    }
    this.deduplicationWindow.set(event.fingerprint, now);

    // 2. 清理过期的去重记录
    for (const [fp, ts] of this.deduplicationWindow) {
      if (now - ts > this.deduplicationWindowMs * 2) {
        this.deduplicationWindow.delete(fp);
      }
    }

    // 3. 处理告警状态变更
    if (event.state === AlertState.RESOLVED) {
      this.activeAlerts.delete(event.fingerprint);
      event.endsAt = new Date().toISOString();
      this.alertHistory.push(event);

      console.log(`[AlertManager] Alert resolved: ${event.ruleName}`);
      return { action: "resolved" };
    }

    // 4. 新告警或已有告警更新
    this.activeAlerts.set(event.fingerprint, event);
    this.alertHistory.push(event);

    // 5. 尝试分组
    const groupKey = this.getGroupKey(event);

    // 6. 查找并执行自动化 Runbook
    const runbook = this.runbooks.get(event.ruleId);
    if (runbook?.automatedActions) {
      for (const action of runbook.automatedActions) {
        try {
          console.log(
            `[AlertManager] Executing automated action: ${action.name} for ${event.ruleName}`
          );
          await action.action();
        } catch (err) {
          console.error(
            `[AlertManager] Automated action failed: ${action.name}`,
            err
          );
        }
      }
    }

    return { action: "new", groupKey };
  }

  /**
   * 获取当前活跃告警（分组展示）
   */
  getActiveAlertGroups(): AlertGroup[] {
    const groups = new Map<string, AlertEvent[]>();

    for (const alert of this.activeAlerts.values()) {
      const groupKey = this.getGroupKey(alert);
      const existing = groups.get(groupKey) ?? [];
      existing.push(alert);
      groups.set(groupKey, existing);
    }

    return Array.from(groups.entries()).map(([groupKey, alerts]) => {
      const sortedAlerts = alerts.sort(
        (a, b) =>
          new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
      );

      const commonLabels: Record<string, string> = {};
      if (sortedAlerts.length > 0) {
        const firstLabels = sortedAlerts[0]!.labels;
        for (const [key, value] of Object.entries(firstLabels)) {
          if (sortedAlerts.every((a) => a.labels[key] === value)) {
            commonLabels[key] = value;
          }
        }
      }

      return {
        groupKey,
        alerts: sortedAlerts,
        commonLabels,
        latestAlert: sortedAlerts[0]!,
      };
    });
  }

  /**
   * 获取指定告警的 Runbook
   */
  getRunbook(ruleId: string): RunbookEntry | undefined {
    return this.runbooks.get(ruleId);
  }

  /**
   * 生成告警报告摘要
   */
  generateAlertSummary(windowHours: number = 24): string {
    const cutoff = Date.now() - windowHours * 3600 * 1000;
    const recentAlerts = this.alertHistory.filter(
      (a) => new Date(a.startsAt).getTime() >= cutoff
    );

    let output = `\n=== 告警摘要 (过去 ${windowHours} 小时) ===\n\n`;
    output += `总告警数: ${recentAlerts.length}\n`;
    output += `当前活跃: ${this.activeAlerts.size}\n\n`;

    // 按严重性统计
    const bySeverity = new Map<string, number>();
    for (const alert of recentAlerts) {
      bySeverity.set(
        alert.severity,
        (bySeverity.get(alert.severity) ?? 0) + 1
      );
    }
    output += "按严重性:\n";
    for (const [severity, count] of bySeverity) {
      output += `  ${severity}: ${count}\n`;
    }

    // 按规则统计
    const byRule = new Map<string, number>();
    for (const alert of recentAlerts) {
      byRule.set(
        alert.ruleName,
        (byRule.get(alert.ruleName) ?? 0) + 1
      );
    }
    output += "\n按规则 (Top 10):\n";
    const topRules = Array.from(byRule.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    for (const [rule, count] of topRules) {
      output += `  ${rule}: ${count}\n`;
    }

    // 活跃告警详情
    if (this.activeAlerts.size > 0) {
      output += "\n当前活跃告警:\n";
      for (const alert of this.activeAlerts.values()) {
        output += `  [${alert.severity}] ${alert.ruleName}: ${alert.message}\n`;
        output += `    触发时间: ${alert.startsAt}\n`;
      }
    }

    return output;
  }

  /**
   * 告警分组键生成
   */
  private getGroupKey(alert: AlertEvent): string {
    // 按 team + category 分组
    return `${alert.labels["team"] ?? "default"}:${alert.labels["category"] ?? "default"}`;
  }

  /**
   * 注册默认的 Runbook
   */
  private registerDefaultRunbooks(): void {
    this.runbooks.set("agent_high_failure_rate", {
      alertRuleId: "agent_high_failure_rate",
      title: "Agent 任务失败率过高",
      description:
        "Agent 任务失败率超过阈值，可能影响用户体验和系统可靠性。",
      diagnosticSteps: [
        "1. 检查 Grafana 仪表盘确认失败率趋势和范围",
        "2. 查看最近失败任务的追踪链路，定位失败环节",
        "3. 检查 LLM API 服务状态 (status.openai.com / status.anthropic.com)",
        "4. 检查工具服务的健康状态",
        "5. 查看日志中的错误模式聚类",
        "6. 确认是否有最近的代码或 Prompt 变更",
      ],
      remediationSteps: [
        "1. 如果是 LLM API 问题 → 切换到备用模型提供商",
        "2. 如果是特定工具失败 → 临时禁用该工具并回退到替代方案",
        "3. 如果是 Prompt 变更导致 → 回滚到上一个稳定版本",
        "4. 如果是流量突增 → 启用请求限流和排队",
        "5. 确认修复后观察 15 分钟，确保指标恢复",
      ],
      escalationPolicy:
        "5 分钟未解决 → 通知 Agent 团队负责人\n" +
        "30 分钟未解决 → 通知工程 VP\n" +
        "影响 > 50% 用户 → 启动重大事件响应流程",
    });

    this.runbooks.set("agent_token_cost_anomaly", {
      alertRuleId: "agent_token_cost_anomaly",
      title: "Token 成本异常",
      description:
        "Token 消耗成本超出正常范围，可能导致预算超支。",
      diagnosticSteps: [
        "1. 检查成本仪表盘，定位成本飙升的时间点",
        "2. 按模型查看成本分布，确认哪个模型的消耗异常",
        "3. 查找高成本请求的追踪链路",
        "4. 检查是否有 Agent 循环次数异常增多",
        "5. 检查是否有新功能上线导致上下文窗口增大",
      ],
      remediationSteps: [
        "1. 临时设置更严格的 max_tokens 限制",
        "2. 对高成本请求启用模型降级策略",
        "3. 检查并优化 System Prompt 长度",
        "4. 限制 Agent 最大迭代次数",
        "5. 如果是恶意使用 → 实施用户级别的成本限额",
      ],
      escalationPolicy:
        "小时成本超过日均 5 倍 → 通知 Agent 团队负责人\n" +
        "日成本超过月预算 10% → 通知工程 VP 和财务",
      automatedActions: [
        {
          name: "切换到经济模型",
          condition: "cost_rate > 5x_average",
          action: async () => {
            console.log(
              "[AutoRemediation] Switching non-critical requests to cheaper model"
            );
            // 实际实现：修改路由配置，将非关键请求路由到 gpt-4o-mini
          },
        },
      ],
    });

    this.runbooks.set("agent_loop_excessive", {
      alertRuleId: "agent_loop_excessive",
      title: "Agent 循环次数过多",
      description:
        "Agent 平均迭代次数异常偏高，可能存在 Prompt 问题或任务理解偏差。",
      diagnosticSteps: [
        "1. 查看高迭代次数的会话回放，理解 Agent 为什么无法在较少步骤内完成任务",
        "2. 检查 Agent 的决策日志，是否有重复的工具调用或循环决策模式",
        "3. 检查是否有 Prompt 版本变更",
        "4. 分析高迭代请求的共同特征（任务类型、输入长度等）",
      ],
      remediationSteps: [
        "1. 优化 Prompt 中的任务分解和终止条件指令",
        "2. 减少 max_iterations 限制以强制早期终止",
        "3. 增加中间结果的质量检查，在发现答案可接受时提前终止",
        "4. 考虑从 ReAct 模式切换到 Plan-Execute 模式减少迭代",
      ],
      escalationPolicy: "持续 1 小时未改善 → 通知 Agent 团队负责人",
    });

    this.runbooks.set("agent_severe_degradation", {
      alertRuleId: "agent_severe_degradation",
      title: "Agent 服务严重劣化",
      description:
        "多项指标同时劣化，系统处于严重降级状态。",
      diagnosticSteps: [
        "1. 立即检查所有外部依赖状态（LLM API、工具服务、数据库）",
        "2. 检查最近 10 分钟的部署记录",
        "3. 查看系统资源使用情况（CPU、内存、网络）",
        "4. 检查 DNS 和网络连接",
      ],
      remediationSteps: [
        "1. 如有最近部署 → 立即回滚",
        "2. 启用熔断器，暂停所有非关键 Agent 请求",
        "3. 将流量切换到灾备服务",
        "4. 通知所有相关方当前状态和预计恢复时间",
      ],
      escalationPolicy:
        "立即通知 Agent 团队全员和 SRE on-call\n" +
        "5 分钟内未解决 → 启动重大事件响应流程\n" +
        "通知工程 VP 和产品负责人",
      automatedActions: [
        {
          name: "启用熔断器",
          condition: "severity == emergency",
          action: async () => {
            console.log(
              "[AutoRemediation] Activating circuit breaker for non-critical requests"
            );
            // 实际实现：设置全局熔断标志，拒绝非关键请求
          },
        },
        {
          name: "切换到备用服务",
          condition: "severity == emergency && duration > 2min",
          action: async () => {
            console.log(
              "[AutoRemediation] Switching to backup service"
            );
            // 实际实现：修改负载均衡器配置
          },
        },
      ],
    });
  }
}
```

### 17.7.3 值班轮换模式

Agent 系统的值班需要特殊考虑。与传统服务不同，Agent 问题通常需要同时具备**系统运维**和 **AI/Prompt 工程**知识的人来响应。

```typescript
// ============================================================
// 值班轮换管理
// ============================================================

/** 值班人员 */
interface OnCallPerson {
  name: string;
  email: string;
  phone: string;
  slackId: string;
  expertise: ("sre" | "ai_engineer" | "prompt_engineer" | "backend")[];
}

/** 值班排班 */
interface OnCallSchedule {
  primary: OnCallPerson;
  secondary: OnCallPerson;
  aiExpert: OnCallPerson;      // Agent 特有：AI 工程师备班
  startTime: string;
  endTime: string;
}

/** 事件响应级别 */
interface IncidentLevel {
  level: "P1" | "P2" | "P3" | "P4";
  description: string;
  responseTimeSLA: string;
  notifyRoles: string[];
  requiresWarRoom: boolean;
}

class OnCallManager {
  private schedules: OnCallSchedule[] = [];

  /**
   * 获取当前值班人员
   */
  getCurrentOnCall(): OnCallSchedule | null {
    const now = new Date().toISOString();
    return (
      this.schedules.find(
        (s) => s.startTime <= now && s.endTime > now
      ) ?? null
    );
  }

  /**
   * 根据告警严重性确定通知对象
   */
  getNotificationTargets(severity: AlertSeverity): OnCallPerson[] {
    const current = this.getCurrentOnCall();
    if (!current) return [];

    switch (severity) {
      case AlertSeverity.INFO:
        return []; // Info 级别不需要通知人

      case AlertSeverity.WARNING:
        return [current.primary]; // 通知主值班

      case AlertSeverity.CRITICAL:
        return [current.primary, current.aiExpert]; // 通知主值班 + AI 专家

      case AlertSeverity.EMERGENCY:
        return [current.primary, current.secondary, current.aiExpert]; // 全部通知
    }
  }

  /**
   * Agent 事件响应级别定义
   */
  static readonly INCIDENT_LEVELS: IncidentLevel[] = [
    {
      level: "P1",
      description: "Agent 服务完全不可用或产生安全风险",
      responseTimeSLA: "5 分钟内响应，15 分钟内开始处理",
      notifyRoles: ["primary", "secondary", "aiExpert", "engineering_lead"],
      requiresWarRoom: true,
    },
    {
      level: "P2",
      description: "Agent 服务严重劣化，影响 > 30% 用户",
      responseTimeSLA: "15 分钟内响应，30 分钟内开始处理",
      notifyRoles: ["primary", "aiExpert"],
      requiresWarRoom: false,
    },
    {
      level: "P3",
      description: "Agent 部分功能受影响，有临时解决方案",
      responseTimeSLA: "1 小时内响应，4 小时内开始处理",
      notifyRoles: ["primary"],
      requiresWarRoom: false,
    },
    {
      level: "P4",
      description: "小范围问题，不影响核心功能",
      responseTimeSLA: "下个工作日处理",
      notifyRoles: [],
      requiresWarRoom: false,
    },
  ];
}
```

---

## 17.8 可观测性平台集成

到目前为止，我们已经构建了追踪、指标、日志、LLM 可观测性、行为分析和告警等独立组件。本节将把这些组件整合为一个统一的可观测性平台，提供一站式的配置和管理能力。

### 17.8.1 统一可观测性平台

```typescript
// ============================================================
// 统一可观测性平台
// ============================================================

/** 平台配置 */
interface ObservabilityPlatformConfig {
  serviceName: string;
  serviceVersion: string;
  environment: "development" | "staging" | "production";

  // 追踪配置
  tracing: {
    enabled: boolean;
    samplingRate: number;
    exporterEndpoint: string;
  };

  // 指标配置
  metrics: {
    enabled: boolean;
    exportIntervalSeconds: number;
    prometheusPort?: number;
  };

  // 日志配置
  logging: {
    enabled: boolean;
    minLevel: LogLevel;
    enableSampling: boolean;
    samplingMaxPerWindow: number;
  };

  // LLM 观测配置
  llmObservability: {
    enabled: boolean;
    recordFullPrompts: boolean;    // 生产环境建议关闭
    maxRecords: number;
  };

  // 告警配置
  alerting: {
    enabled: boolean;
    evaluationIntervalSeconds: number;
  };

  // 行为分析配置
  behaviorAnalysis: {
    enabled: boolean;
    maxSessions: number;
  };
}

/** 健康检查结果 */
interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  checks: Array<{
    name: string;
    status: "pass" | "fail" | "warn";
    message: string;
    durationMs: number;
  }>;
  metrics: {
    uptime: number;
    requestsTotal: number;
    errorsTotal: number;
    activeRequests: number;
  };
}

class ObservabilityPlatform {
  private config: ObservabilityPlatformConfig;
  private startTime: number;

  // 核心组件
  readonly sdk: OTelSDKInitializer;
  readonly tracer: AgentTracer;
  readonly metrics: AgentMetricsCollector;
  readonly logger: AgentStructuredLogger;
  readonly llmObservability: LLMObservabilityLayer;
  readonly alertManager: AgentAlertManager;
  readonly alertEngine: AlertRuleEngine;
  readonly behaviorAnalyzer: AgentBehaviorAnalyzer;
  readonly sessionReplayer: SessionReplayer;
  readonly sloTracker: SLOTracker;
  readonly dashboardGenerator: AgentDashboardGenerator;

  constructor(config: ObservabilityPlatformConfig) {
    this.config = config;
    this.startTime = Date.now();

    // 初始化 OpenTelemetry SDK
    this.sdk = new OTelSDKInitializer({
      serviceName: config.serviceName,
      serviceVersion: config.serviceVersion,
      environment: config.environment,
      exporters: [
        {
          type: "otlp",
          endpoint: config.tracing.exporterEndpoint,
        },
      ],
      sampler: new AgentSampler({
        normalSamplingRate: config.tracing.samplingRate,
      }),
    });

    if (config.tracing.enabled) {
      this.sdk.initialize();
    }

    // 初始化日志器
    this.logger = new AgentStructuredLogger({
      serviceName: config.serviceName,
      minLevel: config.logging.minLevel,
      globalContext: {
        environment: config.environment,
        serviceVersion: config.serviceVersion,
      },
      samplingConfig: config.logging.enableSampling
        ? {
            maxPerWindow: config.logging.samplingMaxPerWindow,
            windowMs: 60000,
            alwaysLogPatterns: ["error", "fatal", "security"],
          }
        : {
            maxPerWindow: Infinity,
            windowMs: 60000,
            alwaysLogPatterns: [],
          },
    });

    // 初始化追踪器
    this.tracer = new AgentTracer(this.sdk, config.serviceName);

    // 初始化指标收集器
    this.metrics = new AgentMetricsCollector();

    // 初始化 LLM 可观测性层
    this.llmObservability = new LLMObservabilityLayer({
      maxRecords: config.llmObservability.maxRecords,
      logger: this.logger,
    });

    // 初始化告警系统
    this.alertManager = new AgentAlertManager();
    this.alertEngine = new AlertRuleEngine();
    if (config.alerting.enabled) {
      this.alertEngine.registerDefaultAgentRules();
    }

    // 初始化行为分析
    this.behaviorAnalyzer = new AgentBehaviorAnalyzer(
      config.behaviorAnalysis.maxSessions
    );
    this.sessionReplayer = new SessionReplayer();

    // 初始化 SLO 追踪
    this.sloTracker = new SLOTracker();
    this.sloTracker.registerDefaultSLOs();

    // 仪表盘生成器
    this.dashboardGenerator = new AgentDashboardGenerator();

    this.logger.info("可观测性平台初始化完成", {
      event: "platform.initialized",
      config: {
        tracing: config.tracing.enabled,
        metrics: config.metrics.enabled,
        logging: config.logging.enabled,
        llmObservability: config.llmObservability.enabled,
        alerting: config.alerting.enabled,
        behaviorAnalysis: config.behaviorAnalysis.enabled,
      },
    });
  }

  /**
   * 为特定请求创建完整的可观测性上下文
   */
  createRequestContext(params: {
    taskId: string;
    taskType: string;
    userId?: string;
    sessionId?: string;
    input: string;
  }): RequestObservabilityContext {
    return new RequestObservabilityContext(this, params);
  }

  /**
   * 健康检查端点
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const checks: HealthCheckResult["checks"] = [];

    // 检查追踪系统
    const tracingStart = Date.now();
    try {
      // 尝试创建一个测试 Span
      const testTracer = this.sdk.getTracer("health-check");
      const span = testTracer.startSpan("health_check");
      span.end();
      checks.push({
        name: "tracing",
        status: "pass",
        message: "追踪系统正常",
        durationMs: Date.now() - tracingStart,
      });
    } catch (error) {
      checks.push({
        name: "tracing",
        status: "fail",
        message: `追踪系统异常: ${(error as Error).message}`,
        durationMs: Date.now() - tracingStart,
      });
    }

    // 检查指标系统
    const metricsStart = Date.now();
    try {
      this.metrics.taskTotal.getValue({});
      checks.push({
        name: "metrics",
        status: "pass",
        message: "指标系统正常",
        durationMs: Date.now() - metricsStart,
      });
    } catch (error) {
      checks.push({
        name: "metrics",
        status: "fail",
        message: `指标系统异常: ${(error as Error).message}`,
        durationMs: Date.now() - metricsStart,
      });
    }

    // 检查日志系统
    const loggingStart = Date.now();
    try {
      this.logger.debug("health check test");
      checks.push({
        name: "logging",
        status: "pass",
        message: "日志系统正常",
        durationMs: Date.now() - loggingStart,
      });
    } catch (error) {
      checks.push({
        name: "logging",
        status: "fail",
        message: `日志系统异常: ${(error as Error).message}`,
        durationMs: Date.now() - loggingStart,
      });
    }

    // 检查 SLO 状态
    const sloStatuses = this.sloTracker.getAllStatuses();
    const breachedSLOs = sloStatuses.filter(
      (s) => s.status === "breached"
    );
    checks.push({
      name: "slo_compliance",
      status: breachedSLOs.length > 0 ? "warn" : "pass",
      message:
        breachedSLOs.length > 0
          ? `${breachedSLOs.length} 个 SLO 已违约`
          : "所有 SLO 合规",
      durationMs: 0,
    });

    // 判定总体状态
    const hasFailures = checks.some((c) => c.status === "fail");
    const hasWarnings = checks.some((c) => c.status === "warn");
    const status = hasFailures
      ? "unhealthy"
      : hasWarnings
        ? "degraded"
        : "healthy";

    return {
      status,
      timestamp: new Date().toISOString(),
      checks,
      metrics: {
        uptime: Date.now() - this.startTime,
        requestsTotal: this.metrics.taskTotal.getValue({}),
        errorsTotal: this.metrics.taskFailureTotal.getValue({}),
        activeRequests: this.metrics.concurrentRequests.getValue({}),
      },
    };
  }

  /**
   * 导出 Grafana 仪表盘配置
   */
  exportDashboardConfig(): string {
    const dashboard = this.dashboardGenerator.generate();
    return JSON.stringify(dashboard, null, 2);
  }

  /**
   * 获取可观测性成本估算
   */
  estimateObservabilityCost(): {
    tracing: { spansPerHour: number; estimatedCostPerMonth: number };
    metrics: { timeSeriesCount: number; estimatedCostPerMonth: number };
    logging: { logsPerHour: number; gbPerMonth: number; estimatedCostPerMonth: number };
    total: number;
  } {
    // 基于典型的云服务定价估算
    const requestsPerHour = this.metrics.taskTotal.getValue({}) || 100;
    const avgSpansPerRequest = 8; // request + iterations + llm + tools
    const spansPerHour = requestsPerHour * avgSpansPerRequest;

    // 追踪成本 (假设 $0.20 / 百万 Span)
    const tracingCostPerMonth =
      (spansPerHour * 24 * 30) / 1_000_000 * 0.20 *
      this.config.tracing.samplingRate;

    // 指标成本 (假设 $0.10 / 时间序列 / 月)
    const timeSeriesCount = 50; // 预估的指标时间序列数
    const metricsCostPerMonth = timeSeriesCount * 0.10;

    // 日志成本 (假设 $0.50 / GB)
    const avgLogSizeBytes = 500;
    const logsPerHour = requestsPerHour * 15; // 每请求约 15 条日志
    const gbPerMonth = (logsPerHour * 24 * 30 * avgLogSizeBytes) / (1024 ** 3);
    const loggingCostPerMonth = gbPerMonth * 0.50;

    return {
      tracing: {
        spansPerHour,
        estimatedCostPerMonth: Math.round(tracingCostPerMonth * 100) / 100,
      },
      metrics: {
        timeSeriesCount,
        estimatedCostPerMonth: Math.round(metricsCostPerMonth * 100) / 100,
      },
      logging: {
        logsPerHour,
        gbPerMonth: Math.round(gbPerMonth * 100) / 100,
        estimatedCostPerMonth: Math.round(loggingCostPerMonth * 100) / 100,
      },
      total:
        Math.round(
          (tracingCostPerMonth + metricsCostPerMonth + loggingCostPerMonth) * 100
        ) / 100,
    };
  }

  /**
   * 优雅关闭
   */
  async shutdown(): Promise<void> {
    this.logger.info("可观测性平台正在关闭", {
      event: "platform.shutdown",
    });
    await this.sdk.shutdown();
  }
}

/**
 * 请求级别的可观测性上下文
 * 为单个请求封装所有可观测性操作
 */
class RequestObservabilityContext {
  private platform: ObservabilityPlatform;
  private requestSpan: Span;
  private requestLogger: AgentStructuredLogger;
  private startTime: number;
  private taskId: string;
  private taskType: string;
  private iterationCount: number = 0;
  private totalTokens: number = 0;
  private totalCostUsd: number = 0;
  private toolCalls: Array<{
    toolName: string;
    durationMs: number;
    success: boolean;
  }> = [];

  constructor(
    platform: ObservabilityPlatform,
    params: {
      taskId: string;
      taskType: string;
      userId?: string;
      sessionId?: string;
      input: string;
    }
  ) {
    this.platform = platform;
    this.taskId = params.taskId;
    this.taskType = params.taskType;
    this.startTime = Date.now();

    // 创建请求 Span
    this.requestSpan = platform.tracer.startRequestSpan(params);

    // 创建请求级日志器
    this.requestLogger = platform.logger.withContext({
      traceId: this.requestSpan.spanContext().traceId,
      taskId: params.taskId,
      userId: params.userId,
      sessionId: params.sessionId,
    });

    // 更新并发计数
    platform.metrics.concurrentRequests.increment({});

    this.requestLogger.info("请求开始处理", {
      event: "request.start",
      taskType: params.taskType,
      inputLength: params.input.length,
    });
  }

  /**
   * 记录一次 LLM 调用
   */
  recordLLMCall(result: LLMCallInfo): void {
    this.totalTokens += result.totalTokens;
    this.totalCostUsd += result.costUsd ?? 0;

    this.platform.metrics.recordLLMCall({
      model: result.model,
      provider: result.provider,
      durationMs: result.durationMs,
      timeToFirstTokenMs: result.timeToFirstTokenMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd ?? 0,
      isRetry: false,
    });

    this.requestLogger.logLLMCall({
      model: result.model,
      provider: result.provider,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: result.durationMs,
      costUsd: result.costUsd ?? 0,
      finishReason: result.finishReason,
    });
  }

  /**
   * 记录一次工具调用
   */
  recordToolCall(info: ToolCallInfo): void {
    this.toolCalls.push({
      toolName: info.toolName,
      durationMs: info.durationMs,
      success: info.success,
    });

    this.requestLogger.logToolCall({
      toolName: info.toolName,
      input: info.input,
      output: info.output,
      durationMs: info.durationMs,
      success: info.success,
      errorMessage: info.errorMessage,
    });
  }

  /**
   * 记录迭代
   */
  recordIteration(iteration: number, decision: string): void {
    this.iterationCount = iteration;
    this.requestLogger.logIterationStart(iteration, 10);
    this.requestLogger.logDecision(decision, "");
  }

  /**
   * 完成请求（成功）
   */
  complete(output?: string): void {
    const durationMs = Date.now() - this.startTime;

    // 记录完整的任务执行指标
    this.platform.metrics.recordTaskExecution({
      taskType: this.taskType,
      agentName: this.platform.tracer["agentName"],
      success: true,
      durationMs,
      iterations: this.iterationCount,
      totalTokens: this.totalTokens,
      inputTokens: Math.round(this.totalTokens * 0.6),
      outputTokens: Math.round(this.totalTokens * 0.4),
      costUsd: this.totalCostUsd,
      model: "mixed",
      toolCalls: this.toolCalls,
    });

    // 更新 SLO
    this.platform.sloTracker.recordEvent("agent_task_availability", true);
    this.platform.sloTracker.recordEvent(
      "agent_latency",
      durationMs <= 30000
    );
    this.platform.sloTracker.recordEvent(
      "agent_cost_efficiency",
      this.totalCostUsd <= 0.5
    );

    // 结束 Span
    this.platform.tracer.endSpan(this.requestSpan, "ok");

    // 更新并发计数
    this.platform.metrics.concurrentRequests.decrement({});

    this.requestLogger.info("请求处理完成", {
      event: "request.complete",
      durationMs,
      iterations: this.iterationCount,
      totalTokens: this.totalTokens,
      totalCostUsd: this.totalCostUsd,
      toolCallCount: this.toolCalls.length,
    });
  }

  /**
   * 完成请求（失败）
   */
  fail(error: Error): void {
    const durationMs = Date.now() - this.startTime;

    this.platform.metrics.recordTaskExecution({
      taskType: this.taskType,
      agentName: this.platform.tracer["agentName"],
      success: false,
      durationMs,
      iterations: this.iterationCount,
      totalTokens: this.totalTokens,
      inputTokens: Math.round(this.totalTokens * 0.6),
      outputTokens: Math.round(this.totalTokens * 0.4),
      costUsd: this.totalCostUsd,
      model: "mixed",
      toolCalls: this.toolCalls,
      errorType: error.name,
    });

    this.platform.sloTracker.recordEvent("agent_task_availability", false);

    this.platform.tracer.endSpan(this.requestSpan, "error", error.message);
    this.platform.metrics.concurrentRequests.decrement({});

    this.requestLogger.error("请求处理失败", error, {
      event: "request.failed",
      durationMs,
      iterations: this.iterationCount,
      totalTokens: this.totalTokens,
      totalCostUsd: this.totalCostUsd,
    });
  }
}
```

### 17.8.2 OpenTelemetry Collector 配置

以下是为 Agent 工作负载优化的 OpenTelemetry Collector 配置：

```typescript
// ============================================================
// OpenTelemetry Collector 配置生成器
// ============================================================

class OTelCollectorConfigGenerator {
  /**
   * 生成 Agent 工作负载的 Collector 配置
   */
  static generate(options: {
    jaegerEndpoint?: string;
    prometheusPort?: number;
    lokiEndpoint?: string;
    samplingRate?: number;
  }): string {
    return `
# OpenTelemetry Collector 配置 — Agent 工作负载优化
# 生成时间: ${new Date().toISOString()}

receivers:
  otlp:
    protocols:
      grpc:
        endpoint: "0.0.0.0:4317"
      http:
        endpoint: "0.0.0.0:4318"

  # Prometheus 指标接收器（接收应用程序推送的指标）
  prometheus:
    config:
      scrape_configs:
        - job_name: "agent-service"
          scrape_interval: 15s
          static_configs:
            - targets: ["agent-service:${options.prometheusPort ?? 9090}"]

processors:
  # 批处理：减少网络开销
  batch:
    send_batch_size: 512
    timeout: 5s
    send_batch_max_size: 1024

  # 内存限制：保护 Collector 不 OOM
  memory_limiter:
    check_interval: 1s
    limit_mib: 1024
    spike_limit_mib: 256

  # 属性处理器：为所有遥测数据添加通用属性
  attributes:
    actions:
      - key: "deployment.environment"
        value: "production"
        action: upsert
      - key: "service.namespace"
        value: "agent-platform"
        action: upsert

  # 尾部采样（基于完整 Trace 的智能采样）
  tail_sampling:
    decision_wait: 30s
    num_traces: 50000
    policies:
      # 错误 Trace 100% 保留
      - name: error-policy
        type: status_code
        status_code:
          status_codes: [ERROR]
      # 高延迟 Trace 100% 保留
      - name: latency-policy
        type: latency
        latency:
          threshold_ms: 10000
      # 包含特定属性的 Trace 100% 保留
      - name: high-cost-policy
        type: string_attribute
        string_attribute:
          key: "sampling.reason"
          values: ["high_cost", "many_iterations"]
      # 其余按概率采样
      - name: probabilistic-policy
        type: probabilistic
        probabilistic:
          sampling_percentage: ${(options.samplingRate ?? 0.1) * 100}

exporters:
  # Jaeger（追踪后端）
  otlp/jaeger:
    endpoint: "${options.jaegerEndpoint ?? 'jaeger:4317'}"
    tls:
      insecure: true

  # Prometheus（指标后端）
  prometheus:
    endpoint: "0.0.0.0:8889"
    namespace: "agent"
    resource_to_telemetry_conversion:
      enabled: true

  # Loki（日志后端）
  loki:
    endpoint: "${options.lokiEndpoint ?? 'http://loki:3100/loki/api/v1/push'}"
    labels:
      attributes:
        service.name: "service_name"
        agent.name: "agent_name"
        level: "log_level"

  # 调试输出（仅开发环境）
  # debug:
  #   verbosity: detailed

service:
  telemetry:
    logs:
      level: "info"
    metrics:
      address: "0.0.0.0:8888"

  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, tail_sampling, batch, attributes]
      exporters: [otlp/jaeger]

    metrics:
      receivers: [otlp, prometheus]
      processors: [memory_limiter, batch, attributes]
      exporters: [prometheus]

    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch, attributes]
      exporters: [loki]
`;
  }
}

// 使用示例
const collectorConfig = OTelCollectorConfigGenerator.generate({
  jaegerEndpoint: "jaeger-collector:4317",
  prometheusPort: 9090,
  lokiEndpoint: "http://loki:3100/loki/api/v1/push",
  samplingRate: 0.1,
});
console.log(collectorConfig);
```

### 17.8.3 完整使用示例

下面是一个端到端的使用示例，展示如何在实际的 Agent 执行中使用统一可观测性平台：

```typescript
// ============================================================
// 端到端使用示例
// ============================================================

async function runAgentWithObservability(): Promise<void> {
  // 1. 初始化可观测性平台
  const platform = new ObservabilityPlatform({
    serviceName: "my-agent-service",
    serviceVersion: "2.1.0",
    environment: "production",
    tracing: {
      enabled: true,
      samplingRate: 0.1,
      exporterEndpoint: "http://otel-collector:4318",
    },
    metrics: {
      enabled: true,
      exportIntervalSeconds: 15,
      prometheusPort: 9090,
    },
    logging: {
      enabled: true,
      minLevel: LogLevel.INFO,
      enableSampling: true,
      samplingMaxPerWindow: 100,
    },
    llmObservability: {
      enabled: true,
      recordFullPrompts: false, // 生产环境不记录完整 Prompt
      maxRecords: 10000,
    },
    alerting: {
      enabled: true,
      evaluationIntervalSeconds: 30,
    },
    behaviorAnalysis: {
      enabled: true,
      maxSessions: 5000,
    },
  });

  // 2. 处理用户请求
  const ctx = platform.createRequestContext({
    taskId: "task-demo-001",
    taskType: "research",
    userId: "user-123",
    sessionId: "session-456",
    input: "分析最近的AI行业趋势并生成简报",
  });

  try {
    // 第一轮迭代
    ctx.recordIteration(1, "search_web");

    // 模拟 LLM 调用
    ctx.recordLLMCall({
      model: "gpt-4-turbo",
      provider: "openai",
      inputTokens: 1500,
      outputTokens: 250,
      totalTokens: 1750,
      finishReason: "stop",
      durationMs: 2300,
      timeToFirstTokenMs: 400,
      costUsd: 0.0225,
    });

    // 模拟工具调用
    ctx.recordToolCall({
      toolName: "web_search",
      input: { query: "AI industry trends 2024" },
      output: { results: ["..."] },
      inputSizeBytes: 40,
      outputSizeBytes: 5000,
      durationMs: 800,
      success: true,
    });

    // 第二轮迭代
    ctx.recordIteration(2, "generate_report");

    ctx.recordLLMCall({
      model: "gpt-4-turbo",
      provider: "openai",
      inputTokens: 4000,
      outputTokens: 1800,
      totalTokens: 5800,
      finishReason: "stop",
      durationMs: 8500,
      timeToFirstTokenMs: 600,
      costUsd: 0.094,
    });

    // 完成请求
    ctx.complete("AI行业趋势简报已生成...");
  } catch (error) {
    ctx.fail(error as Error);
  }

  // 3. 运行健康检查
  const health = await platform.healthCheck();
  console.log(`\n健康状态: ${health.status}`);
  for (const check of health.checks) {
    console.log(`  [${check.status}] ${check.name}: ${check.message}`);
  }

  // 4. 查看 SLO 状态
  console.log(platform.sloTracker.formatReport());

  // 5. 获取 LLM 性能统计
  const llmStats = platform.llmObservability.getPerformanceStats();
  for (const stat of llmStats) {
    console.log(
      `\n模型 ${stat.model}: ${stat.callCount} 次调用, ` +
      `P95=${stat.p95DurationMs}ms, 总成本=$${stat.totalCostUsd.toFixed(4)}`
    );
  }

  // 6. 估算可观测性成本
  const obsCost = platform.estimateObservabilityCost();
  console.log(`\n可观测性月度成本估算: $${obsCost.total}`);

  // 7. 优雅关闭
  await platform.shutdown();
}

// 运行示例
runAgentWithObservability().catch(console.error);
```

---

## 17.9 本章小结

本章系统性地构建了一套专为 AI Agent 设计的可观测性工程体系。我们从传统 APM 的不足出发，深入 Agent 系统的特殊需求，最终实现了一个涵盖追踪、指标、日志、LLM 观测、行为分析和告警的完整平台。

### 十大核心要点

1. **Agent 可观测性 ≠ 传统 APM**。Agent 系统的非确定性执行路径、LLM 黑盒推理和 Token 成本模型，要求我们重新设计可观测性策略。传统的请求延迟和错误率监控只是起点，不是终点。

2. **三大支柱缺一不可**。追踪提供因果链路视图，指标提供聚合趋势视图，日志提供离散事件详情。三者通过 Trace ID 和 Correlation ID 关联，形成完整的多维观测能力。

3. **OpenTelemetry 是基础设施标准**。采用 OpenTelemetry GenAI 语义约定确保跨系统互操作性。完整的 Span 层级（request → loop → llm_call → tool_call → sub_agent）是 Agent 追踪的核心数据模型。

4. **智能采样至关重要**。Agent 系统的遥测数据量巨大。采用错误全采 + 高成本全采 + 正常按概率采样的分层策略，在控制成本的同时保留关键调试信息。

5. **成本追踪是 Agent 可观测性的核心维度**。不同于传统系统按计算资源计费，Agent 的成本主要来自 Token 消耗。每次 LLM 调用都需要精确计算和归因成本，从单次调用到单个任务到单个用户。

6. **Agent 指标体系需要四个维度**：业务指标（任务成功率）、性能指标（延迟分位数）、资源指标（Token 消耗和成本）、质量指标（迭代次数、工具错误率）。同时需要定义明确的 SLO/SLI 来量化服务水平。

7. **结构化日志 + 敏感数据脱敏是底线**。Agent 日志中可能包含用户输入、API 密钥等敏感信息。所有日志输出前必须经过脱敏处理。同时，高吞吐量场景需要日志采样来控制存储成本。

8. **行为分析超越简单监控**。通过分析决策路径频率、工具使用模式和错误模式聚类，我们可以深入理解 Agent 的行为规律，为 Prompt 优化和架构改进提供数据支撑。会话回放能力是事后分析最强大的工具。

9. **告警 + Runbook + 自动化 = 完整的事件响应**。Agent 系统需要专属的告警场景（循环检测、成本异常、幻觉检测等）。每条告警规则都应有配套的 Runbook，关键场景应实现自动化响应（如自动降级模型、启用熔断器）。

10. **可观测性本身也有成本**。追踪、指标和日志的存储和处理都需要资源。通过采样策略、数据保留策略和成本估算，确保可观测性投入与其带来的价值成正比。

### 与其他章节的关联

- **第 3 章（Agent 架构总览）**：本章的可观测性设计基于第 3 章定义的 Agent 执行模型（感知-推理-行动循环）构建 Span 层级和指标维度。

- **第 14 章（Agent 信任架构）**：可观测性是信任体系的验证层。追踪数据可以验证 Agent 是否在安全边界内运行，指标可以检测违规行为，日志可以提供审计证据。

- **第 18 章（部署架构与运维）**：本章构建的可观测性平台将在第 18 章的部署架构中落地。健康检查端点、Prometheus 指标导出和 Grafana 仪表盘将与 Kubernetes 部署配置深度集成，实现"部署即可观测"的目标。

> **下一章预告**：在第 18 章中，我们将把本章构建的可观测性体系与生产部署架构相结合，探讨 Agent 系统的容器化部署、自动扩缩容、蓝绿发布、灾备策略以及完整的 CI/CD 流程。可观测性将作为部署运维的"眼睛"，确保每一次发布都在监控之下。
