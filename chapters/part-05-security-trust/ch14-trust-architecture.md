# 第 14 章：Agent 信任架构 — 最小权限与人机协作

> **核心命题**：当 AI Agent 获得调用外部工具、访问敏感数据、甚至执行不可逆操作的能力时，我们如何确保它"不会做不该做的事"？答案不在于"相信它不会犯错"，而在于构建一套完整的信任架构——从零信任原则出发，用权限模型约束行为边界，用人机协作把关关键决策，用沙箱隔离风险操作，用审计追踪每一次行为，最终用信任评分量化可信程度。

在第 12 章中，我们系统梳理了 Agent 面临的安全威胁模型；在第 13 章中，我们深入探讨了 Prompt 注入的防御策略。本章将把视角从"防御攻击"提升到"架构设计"层面——构建一套可以在生产环境中持续运行的信任架构体系。

本章涵盖以下核心主题：

- **零信任原则**：将网络安全领域的零信任理念移植到 Agent 系统中
- **动态权限管理**：基于上下文的权限状态机，支持自动升降级
- **Human-in-the-Loop**：多层级审批系统，平衡效率与安全
- **沙箱执行**：多级隔离环境，限制 Agent 操作的爆炸半径
- **审计与合规**：满足 GDPR、网络安全法等法规要求的审计体系
- **信任评分**：多维度量化评估 Agent 可信度
- **委托与授权链**：多 Agent 场景下的权限传递与约束
- **架构集成**：将上述组件整合为统一的信任架构

---

## 14.1 零信任原则与权限模型

### 14.1.1 零信任在 Agent 系统中的应用

传统软件系统中，我们倾向于在网络边界建立信任——内网被认为是安全的，外网是不可信的。这种"城堡与护城河"模型在 Agent 系统中完全不适用，原因有三：

1. **Agent 行为不可完全预测**：即使是同一段 Prompt，在不同上下文中 Agent 的行为也可能截然不同
2. **工具调用具有副作用**：Agent 调用的 API 可能修改数据库、发送邮件、执行交易
3. **攻击面动态变化**：Prompt 注入（参见第 13 章）可能在运行时改变 Agent 的意图

零信任原则要求我们：**永不默认信任，始终验证**。具体到 Agent 系统，这意味着：

| 零信任原则 | Agent 系统中的实践 |
|-----------|------------------|
| 永不信任，始终验证 | 每次工具调用都需要权限检查 |
| 最小权限原则 | Agent 只获得完成当前任务所需的最小权限集 |
| 假设已被攻破 | 设计时假设 Agent 可能被 Prompt 注入攻击 |
| 微分段 | 不同 Agent 的权限域严格隔离 |
| 持续监控 | 实时监控 Agent 行为并动态调整信任级别 |

### 14.1.2 RBAC + ABAC 混合权限模型

在传统 RBAC（基于角色的访问控制）中，权限通过角色分配；在 ABAC（基于属性的访问控制）中，权限通过属性条件动态计算。对于 Agent 系统，我们需要将两者结合——用 RBAC 定义基线权限，用 ABAC 在运行时动态调整。

首先定义核心类型体系：

```typescript
// types/permission.ts —— 权限系统核心类型定义

/** Agent 角色枚举 */
export enum AgentRole {
  /** 只读角色：只能查询，不能修改任何数据 */
  Reader = "reader",
  /** 写入角色：可以创建和修改数据，但不能删除或执行敏感操作 */
  Writer = "writer",
  /** 管理员角色：拥有大部分权限，但仍受审计约束 */
  Admin = "admin",
  /** 自治角色：最高权限，可以独立执行操作，但受信任评分约束 */
  Autonomous = "autonomous",
}

/** 权限动作枚举 */
export enum PermissionAction {
  Read = "read",
  Write = "write",
  Delete = "delete",
  Execute = "execute",
  Approve = "approve",
  Delegate = "delegate",
}

/** 资源类型枚举 */
export enum ResourceType {
  Database = "database",
  FileSystem = "file_system",
  API = "api",
  Email = "email",
  Payment = "payment",
  UserData = "user_data",
  SystemConfig = "system_config",
  AuditLog = "audit_log",
}

/** 数据敏感度级别 */
export enum DataSensitivity {
  Public = "public",
  Internal = "internal",
  Confidential = "confidential",
  Restricted = "restricted",
}

/** 权限定义接口 */
export interface Permission {
  action: PermissionAction;
  resource: ResourceType;
  constraints?: PermissionConstraint;
}

/** 权限约束条件 */
export interface PermissionConstraint {
  /** 允许操作的时间窗口（24小时制） */
  timeWindow?: { start: number; end: number };
  /** 最大数据敏感度级别 */
  maxSensitivity?: DataSensitivity;
  /** 最大风险评分（0-100），超过此值需要人工审批 */
  maxRiskScore?: number;
  /** 是否需要人工审批 */
  requireApproval?: boolean;
  /** 操作频率限制（每分钟最大次数） */
  rateLimit?: number;
  /** IP 白名单 */
  allowedIPs?: string[];
}

/** 角色定义接口 */
export interface RoleDefinition {
  role: AgentRole;
  permissions: Permission[];
  inheritsFrom?: AgentRole;
  description: string;
}

/** ABAC 策略规则 */
export interface ABACPolicy {
  id: string;
  name: string;
  description: string;
  /** 匹配条件 */
  conditions: PolicyCondition[];
  /** 策略效果：允许或拒绝 */
  effect: "allow" | "deny";
  /** 优先级（数值越高优先级越高） */
  priority: number;
}

/** 策略条件 */
export interface PolicyCondition {
  attribute: string;
  operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "in" | "contains";
  value: unknown;
}

/** 权限请求上下文 */
export interface PermissionContext {
  agentId: string;
  role: AgentRole;
  action: PermissionAction;
  resource: ResourceType;
  /** 当前时间（小时，0-23） */
  currentHour: number;
  /** 当前风险评分 */
  riskScore: number;
  /** 数据敏感度 */
  dataSensitivity: DataSensitivity;
  /** Agent 信任评分 */
  trustScore: number;
  /** 请求来源 IP */
  sourceIP?: string;
  /** 会话 ID */
  sessionId: string;
  /** 额外属性 */
  attributes: Record<string, unknown>;
}

/** 权限检查结果 */
export interface PermissionDecision {
  allowed: boolean;
  reason: string;
  /** 匹配的策略 ID */
  matchedPolicyId?: string;
  /** 是否需要额外审批 */
  requiresApproval: boolean;
  /** 建议的审批级别 */
  approvalLevel?: "low" | "medium" | "high" | "critical";
  /** 审计追踪信息 */
  auditInfo: {
    timestamp: number;
    context: PermissionContext;
    decision: boolean;
    policyChain: string[];
  };
}
```

### 14.1.3 AgentPermissionSystem 实现

接下来实现完整的 Agent 权限系统，将 RBAC 和 ABAC 整合到一个统一的决策引擎中：

```typescript
// core/agent-permission-system.ts —— Agent 权限系统核心实现

import {
  AgentRole,
  PermissionAction,
  ResourceType,
  DataSensitivity,
  Permission,
  PermissionConstraint,
  RoleDefinition,
  ABACPolicy,
  PolicyCondition,
  PermissionContext,
  PermissionDecision,
} from "../types/permission";

/**
 * Agent 权限系统
 *
 * 实现 RBAC + ABAC 混合模型，支持：
 * - 基于角色的基线权限分配
 * - 基于属性的动态权限调整
 * - 权限继承与覆盖
 * - 实时权限决策与审计
 */
export class AgentPermissionSystem {
  private roleDefinitions: Map<AgentRole, RoleDefinition> = new Map();
  private abacPolicies: ABACPolicy[] = [];
  private decisionLog: PermissionDecision[] = [];
  private readonly maxLogSize = 10000;

  constructor() {
    this.initializeDefaultRoles();
    this.initializeDefaultPolicies();
  }

  /**
   * 初始化默认角色定义
   * 角色权限遵循最小权限原则，从 Reader 到 Autonomous 逐级递增
   */
  private initializeDefaultRoles(): void {
    // Reader：只读角色
    this.roleDefinitions.set(AgentRole.Reader, {
      role: AgentRole.Reader,
      description: "只读角色，只能查询公开和内部数据",
      permissions: [
        {
          action: PermissionAction.Read,
          resource: ResourceType.Database,
          constraints: {
            maxSensitivity: DataSensitivity.Internal,
            rateLimit: 100,
          },
        },
        {
          action: PermissionAction.Read,
          resource: ResourceType.FileSystem,
          constraints: {
            maxSensitivity: DataSensitivity.Internal,
            rateLimit: 50,
          },
        },
        {
          action: PermissionAction.Read,
          resource: ResourceType.API,
          constraints: {
            maxSensitivity: DataSensitivity.Public,
            rateLimit: 200,
          },
        },
      ],
    });

    // Writer：写入角色，继承 Reader 权限
    this.roleDefinitions.set(AgentRole.Writer, {
      role: AgentRole.Writer,
      inheritsFrom: AgentRole.Reader,
      description: "写入角色，可以创建和修改数据",
      permissions: [
        {
          action: PermissionAction.Write,
          resource: ResourceType.Database,
          constraints: {
            maxSensitivity: DataSensitivity.Internal,
            maxRiskScore: 50,
            rateLimit: 30,
          },
        },
        {
          action: PermissionAction.Write,
          resource: ResourceType.FileSystem,
          constraints: {
            maxSensitivity: DataSensitivity.Internal,
            maxRiskScore: 40,
            rateLimit: 20,
          },
        },
        {
          action: PermissionAction.Execute,
          resource: ResourceType.API,
          constraints: {
            maxSensitivity: DataSensitivity.Internal,
            maxRiskScore: 60,
            requireApproval: false,
            rateLimit: 50,
          },
        },
      ],
    });

    // Admin：管理员角色，继承 Writer 权限
    this.roleDefinitions.set(AgentRole.Admin, {
      role: AgentRole.Admin,
      inheritsFrom: AgentRole.Writer,
      description: "管理员角色，可以执行敏感操作，但需要审批",
      permissions: [
        {
          action: PermissionAction.Delete,
          resource: ResourceType.Database,
          constraints: {
            maxSensitivity: DataSensitivity.Confidential,
            requireApproval: true,
            rateLimit: 10,
          },
        },
        {
          action: PermissionAction.Execute,
          resource: ResourceType.Payment,
          constraints: {
            maxRiskScore: 70,
            requireApproval: true,
            rateLimit: 5,
          },
        },
        {
          action: PermissionAction.Write,
          resource: ResourceType.UserData,
          constraints: {
            maxSensitivity: DataSensitivity.Confidential,
            requireApproval: true,
            rateLimit: 15,
          },
        },
        {
          action: PermissionAction.Read,
          resource: ResourceType.AuditLog,
          constraints: { rateLimit: 50 },
        },
      ],
    });

    // Autonomous：自治角色，最高权限
    this.roleDefinitions.set(AgentRole.Autonomous, {
      role: AgentRole.Autonomous,
      inheritsFrom: AgentRole.Admin,
      description: "自治角色，可以独立执行大部分操作，受信任评分约束",
      permissions: [
        {
          action: PermissionAction.Execute,
          resource: ResourceType.SystemConfig,
          constraints: {
            maxRiskScore: 80,
            requireApproval: true,
            rateLimit: 3,
          },
        },
        {
          action: PermissionAction.Delegate,
          resource: ResourceType.API,
          constraints: {
            maxRiskScore: 50,
            requireApproval: false,
            rateLimit: 10,
          },
        },
        {
          action: PermissionAction.Approve,
          resource: ResourceType.API,
          constraints: {
            maxRiskScore: 40,
            rateLimit: 20,
          },
        },
      ],
    });
  }

  /**
   * 初始化默认 ABAC 策略
   * 这些策略在 RBAC 基础权限之上进行动态调整
   */
  private initializeDefaultPolicies(): void {
    // 策略1：工作时间外限制写操作
    this.abacPolicies.push({
      id: "policy-after-hours-restrict",
      name: "非工作时间写操作限制",
      description: "工作时间（9-18点）外的写操作需要额外审批",
      conditions: [
        { attribute: "currentHour", operator: "lt", value: 9 },
        { attribute: "action", operator: "eq", value: PermissionAction.Write },
      ],
      effect: "deny",
      priority: 80,
    });

    this.abacPolicies.push({
      id: "policy-after-hours-restrict-evening",
      name: "非工作时间写操作限制（晚间）",
      description: "18点后的写操作需要额外审批",
      conditions: [
        { attribute: "currentHour", operator: "gte", value: 18 },
        { attribute: "action", operator: "eq", value: PermissionAction.Write },
      ],
      effect: "deny",
      priority: 80,
    });

    // 策略2：高风险操作在低信任时拒绝
    this.abacPolicies.push({
      id: "policy-high-risk-low-trust",
      name: "高风险低信任拒绝",
      description: "当 Agent 信任评分低于 60 且操作风险高于 70 时拒绝",
      conditions: [
        { attribute: "trustScore", operator: "lt", value: 60 },
        { attribute: "riskScore", operator: "gt", value: 70 },
      ],
      effect: "deny",
      priority: 100,
    });

    // 策略3：敏感数据访问需要高信任评分
    this.abacPolicies.push({
      id: "policy-sensitive-data-trust",
      name: "敏感数据高信任要求",
      description: "访问机密或受限数据需要信任评分 80 以上",
      conditions: [
        {
          attribute: "dataSensitivity",
          operator: "in",
          value: [DataSensitivity.Confidential, DataSensitivity.Restricted],
        },
        { attribute: "trustScore", operator: "lt", value: 80 },
      ],
      effect: "deny",
      priority: 90,
    });

    // 策略4：删除操作始终需要审批
    this.abacPolicies.push({
      id: "policy-delete-always-approve",
      name: "删除操作强制审批",
      description: "任何删除操作都需要人工审批",
      conditions: [
        { attribute: "action", operator: "eq", value: PermissionAction.Delete },
      ],
      effect: "deny",
      priority: 95,
    });

    // 按优先级降序排列
    this.abacPolicies.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 获取角色的完整权限列表（包含继承权限）
   */
  public resolveRolePermissions(role: AgentRole): Permission[] {
    const roleDef = this.roleDefinitions.get(role);
    if (!roleDef) return [];

    const permissions = [...roleDef.permissions];

    // 递归解析继承权限
    if (roleDef.inheritsFrom) {
      const inheritedPermissions = this.resolveRolePermissions(
        roleDef.inheritsFrom
      );
      // 继承的权限优先级低于自身定义的权限
      for (const inherited of inheritedPermissions) {
        const hasOverride = permissions.some(
          (p) => p.action === inherited.action && p.resource === inherited.resource
        );
        if (!hasOverride) {
          permissions.push(inherited);
        }
      }
    }

    return permissions;
  }

  /**
   * 检查 RBAC 基线权限
   */
  private checkRBACPermission(
    context: PermissionContext
  ): { allowed: boolean; permission?: Permission; reason: string } {
    const permissions = this.resolveRolePermissions(context.role);
    const matchedPermission = permissions.find(
      (p) => p.action === context.action && p.resource === context.resource
    );

    if (!matchedPermission) {
      return {
        allowed: false,
        reason: `角色 ${context.role} 没有对资源 ${context.resource} 执行 ${context.action} 的权限`,
      };
    }

    // 检查约束条件
    if (matchedPermission.constraints) {
      const constraintResult = this.checkConstraints(
        matchedPermission.constraints,
        context
      );
      if (!constraintResult.passed) {
        return {
          allowed: false,
          permission: matchedPermission,
          reason: constraintResult.reason,
        };
      }
    }

    return {
      allowed: true,
      permission: matchedPermission,
      reason: "RBAC 权限检查通过",
    };
  }

  /**
   * 检查权限约束条件
   */
  private checkConstraints(
    constraints: PermissionConstraint,
    context: PermissionContext
  ): { passed: boolean; reason: string } {
    // 时间窗口检查
    if (constraints.timeWindow) {
      const { start, end } = constraints.timeWindow;
      if (context.currentHour < start || context.currentHour > end) {
        return {
          passed: false,
          reason: `操作不在允许的时间窗口内（${start}:00 - ${end}:00），当前时间：${context.currentHour}:00`,
        };
      }
    }

    // 数据敏感度检查
    if (constraints.maxSensitivity) {
      const sensitivityOrder = [
        DataSensitivity.Public,
        DataSensitivity.Internal,
        DataSensitivity.Confidential,
        DataSensitivity.Restricted,
      ];
      const maxLevel = sensitivityOrder.indexOf(constraints.maxSensitivity);
      const currentLevel = sensitivityOrder.indexOf(context.dataSensitivity);
      if (currentLevel > maxLevel) {
        return {
          passed: false,
          reason: `数据敏感度 ${context.dataSensitivity} 超过角色允许的最大级别 ${constraints.maxSensitivity}`,
        };
      }
    }

    // 风险评分检查
    if (
      constraints.maxRiskScore !== undefined &&
      context.riskScore > constraints.maxRiskScore
    ) {
      return {
        passed: false,
        reason: `风险评分 ${context.riskScore} 超过阈值 ${constraints.maxRiskScore}`,
      };
    }

    // IP 白名单检查
    if (constraints.allowedIPs && context.sourceIP) {
      if (!constraints.allowedIPs.includes(context.sourceIP)) {
        return {
          passed: false,
          reason: `来源 IP ${context.sourceIP} 不在白名单中`,
        };
      }
    }

    return { passed: true, reason: "约束条件检查通过" };
  }

  /**
   * 评估 ABAC 策略
   */
  private evaluateABACPolicies(
    context: PermissionContext
  ): { allowed: boolean; matchedPolicyId?: string; reason: string } {
    for (const policy of this.abacPolicies) {
      const allConditionsMet = policy.conditions.every((condition) =>
        this.evaluateCondition(condition, context)
      );

      if (allConditionsMet) {
        if (policy.effect === "deny") {
          return {
            allowed: false,
            matchedPolicyId: policy.id,
            reason: `ABAC 策略 [${policy.name}] 拒绝: ${policy.description}`,
          };
        }
      }
    }

    return { allowed: true, reason: "所有 ABAC 策略检查通过" };
  }

  /**
   * 评估单个策略条件
   */
  private evaluateCondition(
    condition: PolicyCondition,
    context: PermissionContext
  ): boolean {
    const contextValue =
      (context as unknown as Record<string, unknown>)[condition.attribute] ??
      context.attributes[condition.attribute];

    if (contextValue === undefined) return false;

    switch (condition.operator) {
      case "eq":
        return contextValue === condition.value;
      case "neq":
        return contextValue !== condition.value;
      case "gt":
        return (contextValue as number) > (condition.value as number);
      case "lt":
        return (contextValue as number) < (condition.value as number);
      case "gte":
        return (contextValue as number) >= (condition.value as number);
      case "lte":
        return (contextValue as number) <= (condition.value as number);
      case "in":
        return (condition.value as unknown[]).includes(contextValue);
      case "contains":
        return String(contextValue).includes(String(condition.value));
      default:
        return false;
    }
  }

  /**
   * 执行完整的权限检查（RBAC + ABAC）
   *
   * 决策流程：
   * 1. 先检查 RBAC 基线权限
   * 2. 如果 RBAC 允许，再检查 ABAC 策略
   * 3. 记录完整的决策审计信息
   */
  public checkPermission(context: PermissionContext): PermissionDecision {
    const policyChain: string[] = [];

    // 第一步：RBAC 检查
    const rbacResult = this.checkRBACPermission(context);
    policyChain.push(`RBAC: ${rbacResult.reason}`);

    if (!rbacResult.allowed) {
      const decision: PermissionDecision = {
        allowed: false,
        reason: rbacResult.reason,
        requiresApproval: false,
        auditInfo: {
          timestamp: Date.now(),
          context,
          decision: false,
          policyChain,
        },
      };
      this.logDecision(decision);
      return decision;
    }

    // 第二步：ABAC 策略检查
    const abacResult = this.evaluateABACPolicies(context);
    policyChain.push(`ABAC: ${abacResult.reason}`);

    if (!abacResult.allowed) {
      // ABAC 拒绝但可能允许通过审批通过
      const approvalLevel = this.determineApprovalLevel(context);
      const decision: PermissionDecision = {
        allowed: false,
        reason: abacResult.reason,
        matchedPolicyId: abacResult.matchedPolicyId,
        requiresApproval: true,
        approvalLevel,
        auditInfo: {
          timestamp: Date.now(),
          context,
          decision: false,
          policyChain,
        },
      };
      this.logDecision(decision);
      return decision;
    }

    // 第三步：检查是否需要强制审批
    const needsApproval =
      rbacResult.permission?.constraints?.requireApproval ?? false;
    const approvalLevel = needsApproval
      ? this.determineApprovalLevel(context)
      : undefined;

    const decision: PermissionDecision = {
      allowed: !needsApproval,
      reason: needsApproval
        ? "权限检查通过，但需要人工审批"
        : "权限检查通过，允许执行",
      requiresApproval: needsApproval,
      approvalLevel,
      auditInfo: {
        timestamp: Date.now(),
        context,
        decision: !needsApproval,
        policyChain,
      },
    };

    this.logDecision(decision);
    return decision;
  }

  /**
   * 确定审批级别
   */
  private determineApprovalLevel(
    context: PermissionContext
  ): "low" | "medium" | "high" | "critical" {
    const { riskScore, dataSensitivity, action } = context;

    if (
      action === PermissionAction.Delete &&
      dataSensitivity === DataSensitivity.Restricted
    ) {
      return "critical";
    }
    if (riskScore > 80 || dataSensitivity === DataSensitivity.Restricted) {
      return "high";
    }
    if (riskScore > 50 || dataSensitivity === DataSensitivity.Confidential) {
      return "medium";
    }
    return "low";
  }

  /**
   * 添加自定义 ABAC 策略
   */
  public addPolicy(policy: ABACPolicy): void {
    this.abacPolicies.push(policy);
    this.abacPolicies.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 移除 ABAC 策略
   */
  public removePolicy(policyId: string): boolean {
    const index = this.abacPolicies.findIndex((p) => p.id === policyId);
    if (index === -1) return false;
    this.abacPolicies.splice(index, 1);
    return true;
  }

  /**
   * 记录权限决策日志
   */
  private logDecision(decision: PermissionDecision): void {
    this.decisionLog.push(decision);
    if (this.decisionLog.length > this.maxLogSize) {
      this.decisionLog = this.decisionLog.slice(-this.maxLogSize / 2);
    }
  }

  /**
   * 查询权限决策历史
   */
  public queryDecisionLog(filter?: {
    agentId?: string;
    action?: PermissionAction;
    allowed?: boolean;
    startTime?: number;
    endTime?: number;
  }): PermissionDecision[] {
    let results = [...this.decisionLog];

    if (filter?.agentId) {
      results = results.filter(
        (d) => d.auditInfo.context.agentId === filter.agentId
      );
    }
    if (filter?.action) {
      results = results.filter(
        (d) => d.auditInfo.context.action === filter.action
      );
    }
    if (filter?.allowed !== undefined) {
      results = results.filter((d) => d.allowed === filter.allowed);
    }
    if (filter?.startTime) {
      results = results.filter(
        (d) => d.auditInfo.timestamp >= filter.startTime!
      );
    }
    if (filter?.endTime) {
      results = results.filter(
        (d) => d.auditInfo.timestamp <= filter.endTime!
      );
    }

    return results;
  }
}
```

### 14.1.4 OAuth 2.0 集成：Agent 到服务的身份认证

在生产环境中，Agent 需要访问各种外部服务（数据库、第三方 API、内部微服务）。我们不能在代码中硬编码凭证，也不能让 Agent 直接使用用户的身份——Agent 需要自己的身份体系。OAuth 2.0 的 Client Credentials Grant 是最适合 Agent-to-Service 认证的模式。

```typescript
// auth/agent-oauth-client.ts —— Agent OAuth 2.0 客户端

/** OAuth Token 响应结构 */
interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
}

/** 缓存的 Token 信息 */
interface CachedToken {
  accessToken: string;
  expiresAt: number;
  scopes: string[];
  refreshToken?: string;
}

/** OAuth 客户端配置 */
interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
  scopes: string[];
  /** Token 过期前多少秒刷新（默认 300 秒） */
  refreshBufferSeconds?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试间隔（毫秒） */
  retryDelayMs?: number;
}

/**
 * Agent OAuth 2.0 客户端
 *
 * 为 Agent 提供安全的服务认证能力：
 * - 自动管理 Token 生命周期（获取、缓存、刷新）
 * - 支持多作用域 Token 管理
 * - 内置重试和错误处理
 * - Token 使用审计
 */
export class AgentOAuthClient {
  private tokenCache: Map<string, CachedToken> = new Map();
  private config: Required<OAuthClientConfig>;
  private tokenUsageLog: Array<{
    timestamp: number;
    scope: string;
    action: string;
  }> = [];

  constructor(config: OAuthClientConfig) {
    this.config = {
      refreshBufferSeconds: 300,
      maxRetries: 3,
      retryDelayMs: 1000,
      ...config,
    };
  }

  /**
   * 获取指定作用域的 Access Token
   * 自动处理缓存和刷新逻辑
   */
  public async getAccessToken(scopes: string[]): Promise<string> {
    const cacheKey = scopes.sort().join(",");
    const cached = this.tokenCache.get(cacheKey);

    // 检查缓存的 Token 是否仍然有效
    if (cached && !this.isTokenExpiringSoon(cached)) {
      this.logTokenUsage(cacheKey, "cache_hit");
      return cached.accessToken;
    }

    // 尝试刷新 Token
    if (cached?.refreshToken) {
      try {
        const newToken = await this.refreshToken(cached.refreshToken, scopes);
        this.tokenCache.set(cacheKey, newToken);
        this.logTokenUsage(cacheKey, "refresh");
        return newToken.accessToken;
      } catch (error) {
        console.warn("Token 刷新失败，尝试重新获取:", error);
      }
    }

    // 获取新 Token
    const newToken = await this.requestNewToken(scopes);
    this.tokenCache.set(cacheKey, newToken);
    this.logTokenUsage(cacheKey, "new_request");
    return newToken.accessToken;
  }

  /**
   * 请求新的 Access Token（Client Credentials Grant）
   */
  private async requestNewToken(scopes: string[]): Promise<CachedToken> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const response = await fetch(this.config.tokenEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(
              `${this.config.clientId}:${this.config.clientSecret}`
            ).toString("base64")}`,
          },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            scope: scopes.join(" "),
          }).toString(),
        });

        if (!response.ok) {
          throw new Error(
            `OAuth Token 请求失败: ${response.status} ${response.statusText}`
          );
        }

        const tokenData: OAuthTokenResponse = await response.json();
        return {
          accessToken: tokenData.access_token,
          expiresAt: Date.now() + tokenData.expires_in * 1000,
          scopes: tokenData.scope.split(" "),
          refreshToken: tokenData.refresh_token,
        };
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.config.maxRetries - 1) {
          await this.delay(this.config.retryDelayMs * Math.pow(2, attempt));
        }
      }
    }

    throw new Error(
      `OAuth Token 请求在 ${this.config.maxRetries} 次尝试后失败: ${lastError?.message}`
    );
  }

  /**
   * 使用 Refresh Token 刷新 Access Token
   */
  private async refreshToken(
    refreshToken: string,
    scopes: string[]
  ): Promise<CachedToken> {
    const response = await fetch(this.config.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${this.config.clientId}:${this.config.clientSecret}`
        ).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: scopes.join(" "),
      }).toString(),
    });

    if (!response.ok) {
      throw new Error(`Token 刷新失败: ${response.status}`);
    }

    const tokenData: OAuthTokenResponse = await response.json();
    return {
      accessToken: tokenData.access_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
      scopes: tokenData.scope.split(" "),
      refreshToken: tokenData.refresh_token ?? refreshToken,
    };
  }

  /**
   * 检查 Token 是否即将过期
   */
  private isTokenExpiringSoon(token: CachedToken): boolean {
    const bufferMs = this.config.refreshBufferSeconds * 1000;
    return Date.now() + bufferMs >= token.expiresAt;
  }

  /**
   * 撤销指定作用域的 Token
   */
  public revokeToken(scopes: string[]): void {
    const cacheKey = scopes.sort().join(",");
    this.tokenCache.delete(cacheKey);
    this.logTokenUsage(cacheKey, "revoke");
  }

  /**
   * 撤销所有缓存的 Token
   */
  public revokeAllTokens(): void {
    this.tokenCache.clear();
    this.logTokenUsage("*", "revoke_all");
  }

  /**
   * 记录 Token 使用日志
   */
  private logTokenUsage(scope: string, action: string): void {
    this.tokenUsageLog.push({
      timestamp: Date.now(),
      scope,
      action,
    });
    // 保留最近 1000 条日志
    if (this.tokenUsageLog.length > 1000) {
      this.tokenUsageLog = this.tokenUsageLog.slice(-500);
    }
  }

  /**
   * 获取 Token 使用统计
   */
  public getUsageStats(): {
    totalRequests: number;
    cacheHits: number;
    refreshes: number;
    newRequests: number;
    revocations: number;
  } {
    const stats = {
      totalRequests: this.tokenUsageLog.length,
      cacheHits: 0,
      refreshes: 0,
      newRequests: 0,
      revocations: 0,
    };

    for (const entry of this.tokenUsageLog) {
      switch (entry.action) {
        case "cache_hit":
          stats.cacheHits++;
          break;
        case "refresh":
          stats.refreshes++;
          break;
        case "new_request":
          stats.newRequests++;
          break;
        case "revoke":
        case "revoke_all":
          stats.revocations++;
          break;
      }
    }

    return stats;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

> **架构要点**：`AgentOAuthClient` 的 Token 缓存策略模仿了企业级 OAuth 客户端的最佳实践——在 Token 过期前预刷新，避免请求因 Token 过期而失败。`refreshBufferSeconds` 默认 300 秒，意味着 Token 在过期前 5 分钟就会被刷新。

---


## 14.2 动态权限管理

### 14.2.1 权限状态机模型

静态的权限分配无法应对 Agent 系统的动态需求。一个 Agent 在正常运行时可能表现良好，但一旦检测到异常行为（如 Prompt 注入攻击，参见第 13 章），我们需要立即降低其权限。反之，一个持续稳定运行的 Agent 应该可以逐步获得更高的自治权。

我们定义四种权限状态，形成一个完整的状态机：

| 状态 | 描述 | 权限范围 | 进入条件 |
|------|------|---------|---------|
| `autonomous` | 完全自治 | 可独立执行所有已授权操作 | 信任评分 > 90，连续 30 天无安全事件 |
| `supervised` | 受监督 | 高风险操作需要人工确认 | 默认状态，或从自治/受限恢复 |
| `restricted` | 受限制 | 只能执行只读操作 | 检测到异常行为，或信任评分 < 60 |
| `frozen` | 冻结 | 所有操作被禁止 | 确认安全事件，或管理员手动冻结 |

```typescript
// core/permission-state-machine.ts —— 权限状态机

import { EventEmitter } from "events";

/** 权限状态枚举 */
export enum PermissionState {
  Autonomous = "autonomous",
  Supervised = "supervised",
  Restricted = "restricted",
  Frozen = "frozen",
}

/** 状态转换触发器 */
export enum TransitionTrigger {
  TrustScoreIncrease = "trust_score_increase",
  TrustScoreDecrease = "trust_score_decrease",
  AnomalyDetected = "anomaly_detected",
  SecurityIncident = "security_incident",
  AdminOverride = "admin_override",
  HumanReviewPassed = "human_review_passed",
  AutoRecoveryTimer = "auto_recovery_timer",
  SustainedGoodBehavior = "sustained_good_behavior",
}

/** 状态转换规则 */
interface TransitionRule {
  from: PermissionState;
  to: PermissionState;
  trigger: TransitionTrigger;
  guard: (context: TransitionContext) => boolean;
  onTransition?: (context: TransitionContext) => void;
}

/** 转换上下文 */
interface TransitionContext {
  agentId: string;
  currentTrustScore: number;
  previousTrustScore: number;
  anomalyCount: number;
  lastIncidentTime?: number;
  adminId?: string;
  reason: string;
  metadata: Record<string, unknown>;
}

/** 状态历史记录 */
interface StateHistoryEntry {
  timestamp: number;
  agentId: string;
  fromState: PermissionState;
  toState: PermissionState;
  trigger: TransitionTrigger;
  reason: string;
  trustScore: number;
}

/**
 * 权限状态机
 *
 * 管理 Agent 权限状态的生命周期，支持：
 * - 基于规则的自动状态转换
 * - 异常触发的紧急降级
 * - 人工审核后的权限恢复
 * - 完整的状态转换审计追踪
 */
export class PermissionStateMachine extends EventEmitter {
  private agentStates: Map<string, PermissionState> = new Map();
  private transitionRules: TransitionRule[] = [];
  private stateHistory: StateHistoryEntry[] = [];
  private autoRecoveryTimers: Map<string, ReturnType<typeof setTimeout>> =
    new Map();

  constructor() {
    super();
    this.initializeTransitionRules();
  }

  /**
   * 初始化状态转换规则
   */
  private initializeTransitionRules(): void {
    // === 升级路径 ===

    // supervised -> autonomous：信任评分高且持续良好表现
    this.transitionRules.push({
      from: PermissionState.Supervised,
      to: PermissionState.Autonomous,
      trigger: TransitionTrigger.SustainedGoodBehavior,
      guard: (ctx) => {
        return (
          ctx.currentTrustScore > 90 &&
          ctx.anomalyCount === 0 &&
          (!ctx.lastIncidentTime ||
            Date.now() - ctx.lastIncidentTime > 30 * 24 * 60 * 60 * 1000)
        );
      },
      onTransition: (ctx) => {
        console.log(
          `[权限升级] Agent ${ctx.agentId} 升级为自治模式，` +
          `信任评分: ${ctx.currentTrustScore}`
        );
      },
    });

    // restricted -> supervised：人工审核通过
    this.transitionRules.push({
      from: PermissionState.Restricted,
      to: PermissionState.Supervised,
      trigger: TransitionTrigger.HumanReviewPassed,
      guard: (ctx) => {
        return ctx.currentTrustScore >= 50 && ctx.adminId !== undefined;
      },
      onTransition: (ctx) => {
        console.log(
          `[权限恢复] Agent ${ctx.agentId} 经人工审核恢复为监督模式，` +
          `审核人: ${ctx.adminId}`
        );
      },
    });

    // frozen -> restricted：管理员解冻
    this.transitionRules.push({
      from: PermissionState.Frozen,
      to: PermissionState.Restricted,
      trigger: TransitionTrigger.AdminOverride,
      guard: (ctx) => ctx.adminId !== undefined,
      onTransition: (ctx) => {
        console.log(
          `[解冻] Agent ${ctx.agentId} 被管理员 ${ctx.adminId} 解冻为受限模式`
        );
      },
    });

    // restricted -> supervised：自动恢复（72小时无异常后）
    this.transitionRules.push({
      from: PermissionState.Restricted,
      to: PermissionState.Supervised,
      trigger: TransitionTrigger.AutoRecoveryTimer,
      guard: (ctx) => ctx.currentTrustScore >= 60 && ctx.anomalyCount === 0,
      onTransition: (ctx) => {
        console.log(
          `[自动恢复] Agent ${ctx.agentId} 自动恢复为监督模式，` +
          `信任评分: ${ctx.currentTrustScore}`
        );
      },
    });

    // === 降级路径 ===

    // autonomous -> supervised：信任评分下降
    this.transitionRules.push({
      from: PermissionState.Autonomous,
      to: PermissionState.Supervised,
      trigger: TransitionTrigger.TrustScoreDecrease,
      guard: (ctx) => ctx.currentTrustScore <= 85,
      onTransition: (ctx) => {
        console.log(
          `[权限降级] Agent ${ctx.agentId} 从自治降级为监督模式，` +
          `信任评分: ${ctx.currentTrustScore}`
        );
      },
    });

    // supervised -> restricted：异常行为检测
    this.transitionRules.push({
      from: PermissionState.Supervised,
      to: PermissionState.Restricted,
      trigger: TransitionTrigger.AnomalyDetected,
      guard: (ctx) => ctx.anomalyCount >= 3 || ctx.currentTrustScore < 40,
      onTransition: (ctx) => {
        console.log(
          `[异常降级] Agent ${ctx.agentId} 因异常行为降级为受限模式，` +
          `异常次数: ${ctx.anomalyCount}`
        );
        this.scheduleAutoRecovery(ctx.agentId, 72 * 60 * 60 * 1000);
      },
    });

    // autonomous -> restricted：异常行为检测（跳过 supervised）
    this.transitionRules.push({
      from: PermissionState.Autonomous,
      to: PermissionState.Restricted,
      trigger: TransitionTrigger.AnomalyDetected,
      guard: (ctx) => ctx.anomalyCount >= 1,
      onTransition: (ctx) => {
        console.log(
          `[紧急降级] Agent ${ctx.agentId} 从自治模式紧急降级为受限模式`
        );
        this.scheduleAutoRecovery(ctx.agentId, 72 * 60 * 60 * 1000);
      },
    });

    // 任意状态 -> frozen：安全事件确认
    for (const fromState of [
      PermissionState.Autonomous,
      PermissionState.Supervised,
      PermissionState.Restricted,
    ]) {
      this.transitionRules.push({
        from: fromState,
        to: PermissionState.Frozen,
        trigger: TransitionTrigger.SecurityIncident,
        guard: () => true,
        onTransition: (ctx) => {
          console.log(
            `[紧急冻结] Agent ${ctx.agentId} 因安全事件被冻结，` +
            `原因: ${ctx.reason}`
          );
          this.cancelAutoRecovery(ctx.agentId);
        },
      });
    }
  }

  /** 注册新 Agent，默认状态为 supervised */
  public registerAgent(
    agentId: string,
    initialState: PermissionState = PermissionState.Supervised
  ): void {
    this.agentStates.set(agentId, initialState);
    this.stateHistory.push({
      timestamp: Date.now(),
      agentId,
      fromState: initialState,
      toState: initialState,
      trigger: TransitionTrigger.AdminOverride,
      reason: "初始注册",
      trustScore: 70,
    });
  }

  /** 获取 Agent 当前状态 */
  public getState(agentId: string): PermissionState | undefined {
    return this.agentStates.get(agentId);
  }

  /** 尝试执行状态转换，返回是否转换成功 */
  public transition(
    agentId: string,
    trigger: TransitionTrigger,
    context: Omit<TransitionContext, "agentId">
  ): boolean {
    const currentState = this.agentStates.get(agentId);
    if (currentState === undefined) {
      console.error(`Agent ${agentId} 未注册`);
      return false;
    }

    const fullContext: TransitionContext = { ...context, agentId };

    const applicableRules = this.transitionRules.filter(
      (rule) => rule.from === currentState && rule.trigger === trigger
    );

    for (const rule of applicableRules) {
      if (rule.guard(fullContext)) {
        const previousState = currentState;
        this.agentStates.set(agentId, rule.to);

        this.stateHistory.push({
          timestamp: Date.now(),
          agentId,
          fromState: previousState,
          toState: rule.to,
          trigger,
          reason: context.reason,
          trustScore: context.currentTrustScore,
        });

        rule.onTransition?.(fullContext);

        this.emit("stateChanged", {
          agentId,
          from: previousState,
          to: rule.to,
          trigger,
          reason: context.reason,
        });

        return true;
      }
    }

    return false;
  }

  /** 调度自动恢复计时器 */
  private scheduleAutoRecovery(agentId: string, delayMs: number): void {
    this.cancelAutoRecovery(agentId);
    const timer = setTimeout(() => {
      this.emit("autoRecoveryDue", { agentId });
      this.autoRecoveryTimers.delete(agentId);
    }, delayMs);
    this.autoRecoveryTimers.set(agentId, timer);
  }

  /** 取消自动恢复计时器 */
  private cancelAutoRecovery(agentId: string): void {
    const timer = this.autoRecoveryTimers.get(agentId);
    if (timer) {
      clearTimeout(timer);
      this.autoRecoveryTimers.delete(agentId);
    }
  }

  /** 查询状态转换历史 */
  public getStateHistory(agentId?: string): StateHistoryEntry[] {
    if (agentId) {
      return this.stateHistory.filter((e) => e.agentId === agentId);
    }
    return [...this.stateHistory];
  }

  /** 获取所有 Agent 当前状态摘要 */
  public getStateSummary(): Record<PermissionState, string[]> {
    const summary: Record<PermissionState, string[]> = {
      [PermissionState.Autonomous]: [],
      [PermissionState.Supervised]: [],
      [PermissionState.Restricted]: [],
      [PermissionState.Frozen]: [],
    };
    for (const [agentId, state] of this.agentStates) {
      summary[state].push(agentId);
    }
    return summary;
  }

  /** 销毁状态机，清理所有计时器 */
  public destroy(): void {
    for (const timer of this.autoRecoveryTimers.values()) {
      clearTimeout(timer);
    }
    this.autoRecoveryTimers.clear();
    this.removeAllListeners();
  }
}
```

### 14.2.2 动态权限管理器

有了权限状态机后，我们需要一个管理器来协调状态机、权限系统和外部信号（如异常检测系统），实现动态权限管理：

```typescript
// core/dynamic-permission-manager.ts —— 动态权限管理器

import { AgentPermissionSystem } from "./agent-permission-system";
import {
  PermissionStateMachine,
  PermissionState,
  TransitionTrigger,
} from "./permission-state-machine";
import {
  AgentRole,
  PermissionAction,
  ResourceType,
  DataSensitivity,
  PermissionContext,
  PermissionDecision,
} from "../types/permission";

/** Agent 运行时信息 */
interface AgentRuntimeInfo {
  agentId: string;
  baseRole: AgentRole;
  trustScore: number;
  anomalyCount: number;
  lastIncidentTime?: number;
  sessionStartTime: number;
  totalOperations: number;
  failedOperations: number;
}

/** 异常报告 */
interface AnomalyReport {
  agentId: string;
  type:
    | "prompt_injection"
    | "rate_abuse"
    | "data_exfiltration"
    | "unauthorized_access"
    | "unusual_pattern";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  evidence: Record<string, unknown>;
  timestamp: number;
}

/** 权限变更事件 */
interface PermissionChangeEvent {
  agentId: string;
  previousRole: AgentRole;
  newRole: AgentRole;
  previousState: PermissionState;
  newState: PermissionState;
  reason: string;
  timestamp: number;
}

/**
 * 动态权限管理器
 *
 * 在 AgentPermissionSystem（静态权限）和 PermissionStateMachine（状态管理）
 * 之上建立动态权限管理层，实现：
 * - 基于运行时上下文的权限调整
 * - 异常驱动的自动降级
 * - 权限变更的完整审计
 */
export class DynamicPermissionManager {
  private permissionSystem: AgentPermissionSystem;
  private stateMachine: PermissionStateMachine;
  private agentRuntimeInfoMap: Map<string, AgentRuntimeInfo> = new Map();
  private changeLog: PermissionChangeEvent[] = [];

  /** 状态到角色的映射 */
  private static readonly STATE_ROLE_MAP: Record<PermissionState, AgentRole> = {
    [PermissionState.Autonomous]: AgentRole.Autonomous,
    [PermissionState.Supervised]: AgentRole.Writer,
    [PermissionState.Restricted]: AgentRole.Reader,
    [PermissionState.Frozen]: AgentRole.Reader,
  };

  constructor() {
    this.permissionSystem = new AgentPermissionSystem();
    this.stateMachine = new PermissionStateMachine();

    this.stateMachine.on("stateChanged", (event) => {
      this.handleStateChange(event);
    });
    this.stateMachine.on("autoRecoveryDue", (event) => {
      this.handleAutoRecovery(event.agentId);
    });
  }

  /** 注册 Agent */
  public registerAgent(agentId: string, baseRole: AgentRole): void {
    this.agentRuntimeInfoMap.set(agentId, {
      agentId,
      baseRole,
      trustScore: 70,
      anomalyCount: 0,
      sessionStartTime: Date.now(),
      totalOperations: 0,
      failedOperations: 0,
    });
    this.stateMachine.registerAgent(agentId, PermissionState.Supervised);
  }

  /**
   * 执行权限检查
   *
   * 综合考虑：
   * 1. Agent 的当前权限状态（状态机）
   * 2. 运行时上下文（信任评分、异常数据等）
   * 3. RBAC + ABAC 策略（权限系统）
   */
  public checkPermission(
    agentId: string,
    action: PermissionAction,
    resource: ResourceType,
    dataSensitivity: DataSensitivity,
    riskScore: number
  ): PermissionDecision {
    const runtimeInfo = this.agentRuntimeInfoMap.get(agentId);
    if (!runtimeInfo) {
      return {
        allowed: false,
        reason: `Agent ${agentId} 未注册`,
        requiresApproval: false,
        auditInfo: {
          timestamp: Date.now(),
          context: {} as PermissionContext,
          decision: false,
          policyChain: ["未注册的 Agent"],
        },
      };
    }

    const currentState = this.stateMachine.getState(agentId);

    // 冻结状态：拒绝所有操作
    if (currentState === PermissionState.Frozen) {
      return {
        allowed: false,
        reason: "Agent 处于冻结状态，所有操作被禁止",
        requiresApproval: false,
        auditInfo: {
          timestamp: Date.now(),
          context: {} as PermissionContext,
          decision: false,
          policyChain: ["冻结状态拒绝"],
        },
      };
    }

    // 根据状态确定有效角色
    const effectiveRole =
      currentState !== undefined
        ? DynamicPermissionManager.STATE_ROLE_MAP[currentState]
        : runtimeInfo.baseRole;

    const context: PermissionContext = {
      agentId,
      role: effectiveRole,
      action,
      resource,
      currentHour: new Date().getHours(),
      riskScore,
      dataSensitivity,
      trustScore: runtimeInfo.trustScore,
      sessionId: `session-${agentId}-${runtimeInfo.sessionStartTime}`,
      attributes: {
        anomalyCount: runtimeInfo.anomalyCount,
        totalOperations: runtimeInfo.totalOperations,
        failureRate:
          runtimeInfo.totalOperations > 0
            ? runtimeInfo.failedOperations / runtimeInfo.totalOperations
            : 0,
        permissionState: currentState,
      },
    };

    const decision = this.permissionSystem.checkPermission(context);

    runtimeInfo.totalOperations++;
    if (!decision.allowed) {
      runtimeInfo.failedOperations++;
    }

    return decision;
  }

  /**
   * 报告异常行为
   * 接收来自异常检测系统的报告，触发相应的权限调整
   */
  public reportAnomaly(report: AnomalyReport): void {
    const runtimeInfo = this.agentRuntimeInfoMap.get(report.agentId);
    if (!runtimeInfo) return;

    runtimeInfo.anomalyCount++;

    switch (report.severity) {
      case "critical":
        this.stateMachine.transition(
          report.agentId,
          TransitionTrigger.SecurityIncident,
          {
            currentTrustScore: runtimeInfo.trustScore,
            previousTrustScore: runtimeInfo.trustScore,
            anomalyCount: runtimeInfo.anomalyCount,
            reason: `严重安全事件: ${report.description}`,
            metadata: report.evidence,
          }
        );
        runtimeInfo.trustScore = Math.max(0, runtimeInfo.trustScore - 40);
        break;

      case "high":
        runtimeInfo.trustScore = Math.max(0, runtimeInfo.trustScore - 25);
        this.stateMachine.transition(
          report.agentId,
          TransitionTrigger.AnomalyDetected,
          {
            currentTrustScore: runtimeInfo.trustScore,
            previousTrustScore: runtimeInfo.trustScore + 25,
            anomalyCount: runtimeInfo.anomalyCount,
            reason: `高风险异常: ${report.description}`,
            metadata: report.evidence,
          }
        );
        break;

      case "medium":
        runtimeInfo.trustScore = Math.max(0, runtimeInfo.trustScore - 15);
        if (runtimeInfo.anomalyCount >= 3) {
          this.stateMachine.transition(
            report.agentId,
            TransitionTrigger.AnomalyDetected,
            {
              currentTrustScore: runtimeInfo.trustScore,
              previousTrustScore: runtimeInfo.trustScore + 15,
              anomalyCount: runtimeInfo.anomalyCount,
              reason: `累计异常达到阈值: ${report.description}`,
              metadata: report.evidence,
            }
          );
        }
        break;

      case "low":
        runtimeInfo.trustScore = Math.max(0, runtimeInfo.trustScore - 5);
        break;
    }

    runtimeInfo.lastIncidentTime = Date.now();
  }

  /** 报告良好行为（用于信任评分恢复） */
  public reportGoodBehavior(agentId: string, amount: number = 1): void {
    const runtimeInfo = this.agentRuntimeInfoMap.get(agentId);
    if (!runtimeInfo) return;

    runtimeInfo.trustScore = Math.min(100, runtimeInfo.trustScore + amount);

    if (runtimeInfo.trustScore > 90 && runtimeInfo.anomalyCount === 0) {
      this.stateMachine.transition(
        agentId,
        TransitionTrigger.SustainedGoodBehavior,
        {
          currentTrustScore: runtimeInfo.trustScore,
          previousTrustScore: runtimeInfo.trustScore - amount,
          anomalyCount: runtimeInfo.anomalyCount,
          lastIncidentTime: runtimeInfo.lastIncidentTime,
          reason: "持续良好表现",
          metadata: {},
        }
      );
    }
  }

  /** 处理状态变更事件 */
  private handleStateChange(event: {
    agentId: string;
    from: PermissionState;
    to: PermissionState;
    trigger: TransitionTrigger;
    reason: string;
  }): void {
    const runtimeInfo = this.agentRuntimeInfoMap.get(event.agentId);
    if (!runtimeInfo) return;

    this.changeLog.push({
      agentId: event.agentId,
      previousRole: DynamicPermissionManager.STATE_ROLE_MAP[event.from],
      newRole: DynamicPermissionManager.STATE_ROLE_MAP[event.to],
      previousState: event.from,
      newState: event.to,
      reason: event.reason,
      timestamp: Date.now(),
    });
  }

  /** 处理自动恢复 */
  private handleAutoRecovery(agentId: string): void {
    const runtimeInfo = this.agentRuntimeInfoMap.get(agentId);
    if (!runtimeInfo) return;

    runtimeInfo.anomalyCount = 0;

    this.stateMachine.transition(
      agentId,
      TransitionTrigger.AutoRecoveryTimer,
      {
        currentTrustScore: runtimeInfo.trustScore,
        previousTrustScore: runtimeInfo.trustScore,
        anomalyCount: 0,
        reason: "自动恢复计时器触发",
        metadata: {},
      }
    );
  }

  /** 获取 Agent 运行时信息 */
  public getAgentInfo(agentId: string): AgentRuntimeInfo | undefined {
    return this.agentRuntimeInfoMap.get(agentId);
  }

  /** 获取权限变更日志 */
  public getChangeLog(agentId?: string): PermissionChangeEvent[] {
    if (agentId) {
      return this.changeLog.filter((e) => e.agentId === agentId);
    }
    return [...this.changeLog];
  }

  /** 销毁管理器 */
  public destroy(): void {
    this.stateMachine.destroy();
  }
}
```

> **与第 12 章的联系**：动态权限管理器的 `reportAnomaly` 方法是连接安全威胁检测（第 12 章）和权限控制的桥梁。当威胁检测系统发现可疑行为时，它通过此方法通知权限系统进行降级，形成"检测-响应"闭环。

---

## 14.3 Human-in-the-Loop 审批系统

### 14.3.1 审批系统设计原则

Human-in-the-Loop（HITL）不是简单地在每个操作前弹出确认框——那样会导致"审批疲劳"（Approval Fatigue），最终审批人会不假思索地点击"同意"，使整个机制形同虚设。好的 HITL 系统应该遵循以下原则：

1. **分级审批**：根据操作的风险级别决定是否需要审批，以及需要多高级别的审批
2. **多审批模式**：支持顺序审批、并行审批和仲裁审批（Quorum）
3. **时间约束**：审批超时后自动执行预设动作（拒绝、升级或有条件通过）
4. **审批分析**：追踪审批瓶颈，优化审批效率

### 14.3.2 HITL 编排器实现

```typescript
// hitl/hitl-orchestrator.ts —— Human-in-the-Loop 编排器

import { EventEmitter } from "events";
import crypto from "crypto";

/** 审批请求状态 */
export enum ApprovalStatus {
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected",
  Escalated = "escalated",
  TimedOut = "timed_out",
  Cancelled = "cancelled",
}

/** 审批模式 */
export enum ApprovalMode {
  /** 顺序审批：按顺序依次审批 */
  Sequential = "sequential",
  /** 并行审批：所有审批人同时审批，全部通过才算通过 */
  Parallel = "parallel",
  /** 仲裁审批：达到指定比例即通过 */
  Quorum = "quorum",
}

/** 紧急级别 */
export enum UrgencyLevel {
  Low = "low",
  Medium = "medium",
  High = "high",
  Critical = "critical",
}

/** 审批人信息 */
interface Approver {
  id: string;
  name: string;
  email: string;
  role: string;
  /** 审批权限级别（数值越高权限越大） */
  level: number;
}

/** 审批链配置 */
interface ApprovalChainConfig {
  mode: ApprovalMode;
  approvers: Approver[];
  /** 仲裁模式下的通过比例（0-1） */
  quorumRatio?: number;
  /** 超时时间（毫秒） */
  timeoutMs: number;
  /** 超时后的默认动作 */
  timeoutAction: "reject" | "escalate" | "auto_approve";
  /** 升级审批人（超时或升级时使用） */
  escalationApprover?: Approver;
}

/** 审批请求 */
interface ApprovalRequest {
  id: string;
  agentId: string;
  action: string;
  resource: string;
  description: string;
  urgency: UrgencyLevel;
  riskScore: number;
  chain: ApprovalChainConfig;
  status: ApprovalStatus;
  createdAt: number;
  updatedAt: number;
  /** 各审批人的决策记录 */
  decisions: ApprovalDecisionRecord[];
  /** 附加的上下文信息 */
  context: Record<string, unknown>;
  /** 最终结果 */
  finalDecision?: {
    status: ApprovalStatus;
    decidedBy: string;
    reason: string;
    timestamp: number;
  };
}

/** 审批决策记录 */
interface ApprovalDecisionRecord {
  approverId: string;
  approverName: string;
  decision: "approved" | "rejected" | "abstained";
  reason: string;
  timestamp: number;
}

/** 审批通知 */
interface ApprovalNotification {
  type: "new_request" | "decision_made" | "timeout_warning" | "escalated";
  requestId: string;
  targetUserId: string;
  title: string;
  body: string;
  urgency: UrgencyLevel;
  actionUrl: string;
}

/**
 * HITL 编排器
 *
 * 负责管理完整的 Human-in-the-Loop 审批流程：
 * - 创建和跟踪审批请求
 * - 协调多种审批模式
 * - 处理审批超时和升级
 * - 发送审批通知
 * - 记录完整的审批审计追踪
 */
export class HITLOrchestrator extends EventEmitter {
  private requests: Map<string, ApprovalRequest> = new Map();
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private notificationHandlers: Array<
    (notification: ApprovalNotification) => Promise<void>
  > = [];

  /** 默认审批链配置（按紧急级别） */
  private defaultChains: Map<UrgencyLevel, ApprovalChainConfig> = new Map();

  constructor() {
    super();
  }

  /**
   * 配置默认审批链
   */
  public configureDefaultChain(
    urgency: UrgencyLevel,
    config: ApprovalChainConfig
  ): void {
    this.defaultChains.set(urgency, config);
  }

  /**
   * 注册通知处理器
   */
  public registerNotificationHandler(
    handler: (notification: ApprovalNotification) => Promise<void>
  ): void {
    this.notificationHandlers.push(handler);
  }

  /**
   * 创建审批请求
   */
  public async createRequest(params: {
    agentId: string;
    action: string;
    resource: string;
    description: string;
    urgency: UrgencyLevel;
    riskScore: number;
    context?: Record<string, unknown>;
    chain?: ApprovalChainConfig;
  }): Promise<ApprovalRequest> {
    const chain =
      params.chain ?? this.defaultChains.get(params.urgency);
    if (!chain) {
      throw new Error(
        `未配置紧急级别 ${params.urgency} 的审批链`
      );
    }

    const request: ApprovalRequest = {
      id: crypto.randomUUID(),
      agentId: params.agentId,
      action: params.action,
      resource: params.resource,
      description: params.description,
      urgency: params.urgency,
      riskScore: params.riskScore,
      chain,
      status: ApprovalStatus.Pending,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      decisions: [],
      context: params.context ?? {},
    };

    this.requests.set(request.id, request);

    // 设置超时计时器
    this.setTimeoutTimer(request);

    // 发送通知给审批人
    await this.notifyApprovers(request);

    this.emit("requestCreated", request);
    return request;
  }

  /**
   * 提交审批决策
   */
  public async submitDecision(
    requestId: string,
    approverId: string,
    decision: "approved" | "rejected" | "abstained",
    reason: string
  ): Promise<ApprovalRequest> {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`审批请求 ${requestId} 不存在`);
    }
    if (request.status !== ApprovalStatus.Pending) {
      throw new Error(
        `审批请求 ${requestId} 已处于终态: ${request.status}`
      );
    }

    // 验证审批人身份
    const approver = request.chain.approvers.find(
      (a) => a.id === approverId
    );
    if (!approver) {
      throw new Error(`${approverId} 不是此审批请求的审批人`);
    }

    // 检查是否已经提交过决策
    const existingDecision = request.decisions.find(
      (d) => d.approverId === approverId
    );
    if (existingDecision) {
      throw new Error(`审批人 ${approverId} 已提交过决策`);
    }

    // 记录决策
    request.decisions.push({
      approverId,
      approverName: approver.name,
      decision,
      reason,
      timestamp: Date.now(),
    });
    request.updatedAt = Date.now();

    // 根据审批模式评估结果
    const result = this.evaluateDecisions(request);
    if (result !== null) {
      this.finalizeRequest(request, result.status, result.decidedBy, result.reason);
    }

    this.emit("decisionSubmitted", {
      requestId,
      approverId,
      decision,
      reason,
    });

    return request;
  }

  /**
   * 根据审批模式评估当前决策
   */
  private evaluateDecisions(
    request: ApprovalRequest
  ): { status: ApprovalStatus; decidedBy: string; reason: string } | null {
    const { mode, approvers, quorumRatio } = request.chain;
    const { decisions } = request;

    switch (mode) {
      case ApprovalMode.Sequential: {
        // 顺序模式：按顺序检查，遇到第一个 rejected 即终止
        const currentIndex = decisions.length - 1;
        const latestDecision = decisions[currentIndex];

        if (latestDecision.decision === "rejected") {
          return {
            status: ApprovalStatus.Rejected,
            decidedBy: latestDecision.approverId,
            reason: `顺序审批被 ${latestDecision.approverName} 拒绝: ${latestDecision.reason}`,
          };
        }

        if (latestDecision.decision === "approved") {
          // 检查是否所有审批人都已通过
          const approvedCount = decisions.filter(
            (d) => d.decision === "approved"
          ).length;
          if (approvedCount >= approvers.length) {
            return {
              status: ApprovalStatus.Approved,
              decidedBy: "all",
              reason: "所有审批人已按顺序通过",
            };
          }
          // 还需要下一位审批人
          return null;
        }

        return null;
      }

      case ApprovalMode.Parallel: {
        // 并行模式：所有人都通过才算通过，有一个拒绝就拒绝
        const rejectedDecision = decisions.find(
          (d) => d.decision === "rejected"
        );
        if (rejectedDecision) {
          return {
            status: ApprovalStatus.Rejected,
            decidedBy: rejectedDecision.approverId,
            reason: `并行审批被 ${rejectedDecision.approverName} 拒绝: ${rejectedDecision.reason}`,
          };
        }

        const approvedCount = decisions.filter(
          (d) => d.decision === "approved"
        ).length;
        if (approvedCount >= approvers.length) {
          return {
            status: ApprovalStatus.Approved,
            decidedBy: "all",
            reason: "所有审批人已通过",
          };
        }

        return null;
      }

      case ApprovalMode.Quorum: {
        // 仲裁模式：达到指定比例即通过
        const ratio = quorumRatio ?? 0.5;
        const requiredApprovals = Math.ceil(approvers.length * ratio);

        const approvedCount = decisions.filter(
          (d) => d.decision === "approved"
        ).length;
        const rejectedCount = decisions.filter(
          (d) => d.decision === "rejected"
        ).length;

        if (approvedCount >= requiredApprovals) {
          return {
            status: ApprovalStatus.Approved,
            decidedBy: "quorum",
            reason: `仲裁通过: ${approvedCount}/${approvers.length} ` +
                    `(需要 ${requiredApprovals})`,
          };
        }

        // 检查是否已经不可能达到法定人数
        const remaining = approvers.length - decisions.length;
        if (approvedCount + remaining < requiredApprovals) {
          return {
            status: ApprovalStatus.Rejected,
            decidedBy: "quorum",
            reason: `仲裁未通过: 即使剩余全部同意也无法达到法定人数。` +
                    `已通过 ${approvedCount}, 已拒绝 ${rejectedCount}, ` +
                    `需要 ${requiredApprovals}`,
          };
        }

        return null;
      }

      default:
        return null;
    }
  }

  /**
   * 完成审批请求
   */
  private finalizeRequest(
    request: ApprovalRequest,
    status: ApprovalStatus,
    decidedBy: string,
    reason: string
  ): void {
    request.status = status;
    request.updatedAt = Date.now();
    request.finalDecision = {
      status,
      decidedBy,
      reason,
      timestamp: Date.now(),
    };

    // 清除超时计时器
    const timer = this.timers.get(request.id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(request.id);
    }

    this.emit("requestFinalized", request);
  }

  /**
   * 设置超时计时器
   */
  private setTimeoutTimer(request: ApprovalRequest): void {
    const timer = setTimeout(() => {
      this.handleTimeout(request.id);
    }, request.chain.timeoutMs);

    this.timers.set(request.id, timer);

    // 在超时前 5 分钟发送警告
    const warningDelay = request.chain.timeoutMs - 5 * 60 * 1000;
    if (warningDelay > 0) {
      setTimeout(() => {
        const currentRequest = this.requests.get(request.id);
        if (currentRequest?.status === ApprovalStatus.Pending) {
          this.sendTimeoutWarning(currentRequest);
        }
      }, warningDelay);
    }
  }

  /**
   * 处理超时
   */
  private handleTimeout(requestId: string): void {
    const request = this.requests.get(requestId);
    if (!request || request.status !== ApprovalStatus.Pending) return;

    this.timers.delete(requestId);

    switch (request.chain.timeoutAction) {
      case "reject":
        this.finalizeRequest(
          request,
          ApprovalStatus.TimedOut,
          "system",
          "审批超时，自动拒绝"
        );
        break;

      case "escalate":
        this.escalateRequest(request);
        break;

      case "auto_approve":
        // 仅当风险评分低于阈值时才自动通过
        if (request.riskScore < 30) {
          this.finalizeRequest(
            request,
            ApprovalStatus.Approved,
            "system",
            `审批超时，风险评分 ${request.riskScore} 低于阈值，自动通过`
          );
        } else {
          this.finalizeRequest(
            request,
            ApprovalStatus.TimedOut,
            "system",
            `审批超时，风险评分 ${request.riskScore} 过高，拒绝自动通过`
          );
        }
        break;
    }
  }

  /**
   * 升级审批请求
   */
  private async escalateRequest(
    request: ApprovalRequest
  ): Promise<void> {
    const escalationApprover = request.chain.escalationApprover;
    if (!escalationApprover) {
      this.finalizeRequest(
        request,
        ApprovalStatus.TimedOut,
        "system",
        "审批超时，无升级审批人，自动拒绝"
      );
      return;
    }

    request.status = ApprovalStatus.Escalated;
    request.updatedAt = Date.now();
    request.chain.approvers = [escalationApprover];
    request.chain.timeoutMs = request.chain.timeoutMs * 2;
    request.chain.timeoutAction = "reject";

    this.setTimeoutTimer(request);

    await this.sendNotification({
      type: "escalated",
      requestId: request.id,
      targetUserId: escalationApprover.id,
      title: `[紧急升级] Agent 操作审批请求`,
      body: `Agent ${request.agentId} 请求执行 ${request.action}，` +
            `原审批已超时，需要您紧急处理。`,
      urgency: UrgencyLevel.Critical,
      actionUrl: `/approvals/${request.id}`,
    });

    this.emit("requestEscalated", request);
  }

  /**
   * 通知审批人
   */
  private async notifyApprovers(
    request: ApprovalRequest
  ): Promise<void> {
    const { mode, approvers } = request.chain;

    if (mode === ApprovalMode.Sequential) {
      // 顺序模式：只通知第一个审批人
      if (approvers.length > 0) {
        await this.sendNotification({
          type: "new_request",
          requestId: request.id,
          targetUserId: approvers[0].id,
          title: `Agent 操作审批请求 [${request.urgency}]`,
          body: `Agent ${request.agentId} 请求对 ${request.resource} ` +
                `执行 ${request.action}: ${request.description}`,
          urgency: request.urgency,
          actionUrl: `/approvals/${request.id}`,
        });
      }
    } else {
      // 并行和仲裁模式：通知所有审批人
      for (const approver of approvers) {
        await this.sendNotification({
          type: "new_request",
          requestId: request.id,
          targetUserId: approver.id,
          title: `Agent 操作审批请求 [${request.urgency}]`,
          body: `Agent ${request.agentId} 请求对 ${request.resource} ` +
                `执行 ${request.action}: ${request.description}`,
          urgency: request.urgency,
          actionUrl: `/approvals/${request.id}`,
        });
      }
    }
  }

  /**
   * 发送超时警告
   */
  private async sendTimeoutWarning(
    request: ApprovalRequest
  ): Promise<void> {
    const pendingApprovers = request.chain.approvers.filter(
      (a) => !request.decisions.some((d) => d.approverId === a.id)
    );

    for (const approver of pendingApprovers) {
      await this.sendNotification({
        type: "timeout_warning",
        requestId: request.id,
        targetUserId: approver.id,
        title: `[即将超时] Agent 操作审批请求`,
        body: `审批请求将在 5 分钟后超时，请尽快处理。` +
              `Agent ${request.agentId}: ${request.description}`,
        urgency: UrgencyLevel.High,
        actionUrl: `/approvals/${request.id}`,
      });
    }
  }

  /**
   * 发送通知
   */
  private async sendNotification(
    notification: ApprovalNotification
  ): Promise<void> {
    for (const handler of this.notificationHandlers) {
      try {
        await handler(notification);
      } catch (error) {
        console.error("通知发送失败:", error);
      }
    }
  }

  /** 获取审批请求 */
  public getRequest(requestId: string): ApprovalRequest | undefined {
    return this.requests.get(requestId);
  }

  /** 获取 Agent 的所有审批请求 */
  public getRequestsByAgent(agentId: string): ApprovalRequest[] {
    return Array.from(this.requests.values()).filter(
      (r) => r.agentId === agentId
    );
  }

  /** 获取待处理的审批请求 */
  public getPendingRequests(approverId?: string): ApprovalRequest[] {
    let pending = Array.from(this.requests.values()).filter(
      (r) =>
        r.status === ApprovalStatus.Pending ||
        r.status === ApprovalStatus.Escalated
    );

    if (approverId) {
      pending = pending.filter((r) =>
        r.chain.approvers.some((a) => a.id === approverId) &&
        !r.decisions.some((d) => d.approverId === approverId)
      );
    }

    return pending;
  }

  /** 销毁编排器 */
  public destroy(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.removeAllListeners();
  }
}
```

### 14.3.3 审批分析引擎

审批系统积累了大量数据，通过分析这些数据可以发现瓶颈、优化流程：

```typescript
// hitl/approval-analytics.ts —— 审批分析引擎

/** 审批效率统计 */
interface ApprovalEfficiencyStats {
  /** 统计周期 */
  period: { start: number; end: number };
  /** 总请求数 */
  totalRequests: number;
  /** 各状态的请求数 */
  statusBreakdown: Record<string, number>;
  /** 平均审批时间（毫秒） */
  averageApprovalTimeMs: number;
  /** 中位审批时间（毫秒） */
  medianApprovalTimeMs: number;
  /** P95 审批时间（毫秒） */
  p95ApprovalTimeMs: number;
  /** 超时率 */
  timeoutRate: number;
  /** 自动通过率 */
  autoApproveRate: number;
  /** 审批通过率 */
  approvalRate: number;
}

/** 审批人效率指标 */
interface ApproverMetrics {
  approverId: string;
  approverName: string;
  /** 已处理的请求数 */
  totalDecisions: number;
  /** 平均响应时间（毫秒） */
  averageResponseTimeMs: number;
  /** 通过率 */
  approvalRate: number;
  /** 拒绝率 */
  rejectionRate: number;
  /** 弃权率 */
  abstainRate: number;
  /** 是否是瓶颈审批人 */
  isBottleneck: boolean;
}

/** 瓶颈报告 */
interface BottleneckReport {
  /** 瓶颈审批人列表 */
  bottleneckApprovers: ApproverMetrics[];
  /** 最慢的审批链 */
  slowestChains: Array<{
    requestId: string;
    duration: number;
    description: string;
  }>;
  /** 建议的优化措施 */
  recommendations: string[];
}

/** 审批记录（简化接口，用于分析） */
interface ApprovalRecord {
  id: string;
  agentId: string;
  status: string;
  urgency: string;
  createdAt: number;
  updatedAt: number;
  decisions: Array<{
    approverId: string;
    approverName: string;
    decision: string;
    timestamp: number;
  }>;
  finalDecision?: {
    status: string;
    timestamp: number;
  };
}

/**
 * 审批分析引擎
 *
 * 对审批历史数据进行多维度分析：
 * - 效率统计（平均时间、超时率等）
 * - 审批人绩效评估
 * - 瓶颈识别和优化建议
 * - 趋势分析
 */
export class ApprovalAnalytics {
  private records: ApprovalRecord[] = [];

  /** 添加审批记录 */
  public addRecord(record: ApprovalRecord): void {
    this.records.push(record);
  }

  /** 批量导入记录 */
  public importRecords(records: ApprovalRecord[]): void {
    this.records.push(...records);
  }

  /**
   * 计算审批效率统计
   */
  public getEfficiencyStats(
    startTime?: number,
    endTime?: number
  ): ApprovalEfficiencyStats {
    const start = startTime ?? 0;
    const end = endTime ?? Date.now();

    const filteredRecords = this.records.filter(
      (r) => r.createdAt >= start && r.createdAt <= end
    );

    if (filteredRecords.length === 0) {
      return {
        period: { start, end },
        totalRequests: 0,
        statusBreakdown: {},
        averageApprovalTimeMs: 0,
        medianApprovalTimeMs: 0,
        p95ApprovalTimeMs: 0,
        timeoutRate: 0,
        autoApproveRate: 0,
        approvalRate: 0,
      };
    }

    // 状态分布
    const statusBreakdown: Record<string, number> = {};
    for (const record of filteredRecords) {
      statusBreakdown[record.status] =
        (statusBreakdown[record.status] ?? 0) + 1;
    }

    // 计算审批时间
    const completedRecords = filteredRecords.filter(
      (r) => r.finalDecision !== undefined
    );
    const approvalTimes = completedRecords.map(
      (r) => r.finalDecision!.timestamp - r.createdAt
    );
    approvalTimes.sort((a, b) => a - b);

    const avgTime =
      approvalTimes.length > 0
        ? approvalTimes.reduce((sum, t) => sum + t, 0) / approvalTimes.length
        : 0;

    const medianTime =
      approvalTimes.length > 0
        ? approvalTimes[Math.floor(approvalTimes.length / 2)]
        : 0;

    const p95Index = Math.floor(approvalTimes.length * 0.95);
    const p95Time =
      approvalTimes.length > 0 ? approvalTimes[p95Index] ?? 0 : 0;

    // 计算各种比率
    const total = filteredRecords.length;
    const timedOut = statusBreakdown["timed_out"] ?? 0;
    const approved = statusBreakdown["approved"] ?? 0;

    // 自动通过的请求标记
    const autoApproved = completedRecords.filter(
      (r) =>
        r.finalDecision?.status === "approved" && r.decisions.length === 0
    ).length;

    return {
      period: { start, end },
      totalRequests: total,
      statusBreakdown,
      averageApprovalTimeMs: avgTime,
      medianApprovalTimeMs: medianTime,
      p95ApprovalTimeMs: p95Time,
      timeoutRate: total > 0 ? timedOut / total : 0,
      autoApproveRate: total > 0 ? autoApproved / total : 0,
      approvalRate: total > 0 ? approved / total : 0,
    };
  }

  /**
   * 分析审批人绩效
   */
  public getApproverMetrics(): ApproverMetrics[] {
    const approverStats: Map<
      string,
      {
        name: string;
        decisions: Array<{ decision: string; responseTime: number }>;
      }
    > = new Map();

    for (const record of this.records) {
      for (const decision of record.decisions) {
        let stats = approverStats.get(decision.approverId);
        if (!stats) {
          stats = { name: decision.approverName, decisions: [] };
          approverStats.set(decision.approverId, stats);
        }
        stats.decisions.push({
          decision: decision.decision,
          responseTime: decision.timestamp - record.createdAt,
        });
      }
    }

    const metrics: ApproverMetrics[] = [];
    const allAvgTimes: number[] = [];

    for (const [approverId, stats] of approverStats) {
      const total = stats.decisions.length;
      const approved = stats.decisions.filter(
        (d) => d.decision === "approved"
      ).length;
      const rejected = stats.decisions.filter(
        (d) => d.decision === "rejected"
      ).length;
      const abstained = stats.decisions.filter(
        (d) => d.decision === "abstained"
      ).length;

      const avgResponseTime =
        stats.decisions.reduce((sum, d) => sum + d.responseTime, 0) / total;

      allAvgTimes.push(avgResponseTime);

      metrics.push({
        approverId,
        approverName: stats.name,
        totalDecisions: total,
        averageResponseTimeMs: avgResponseTime,
        approvalRate: total > 0 ? approved / total : 0,
        rejectionRate: total > 0 ? rejected / total : 0,
        abstainRate: total > 0 ? abstained / total : 0,
        isBottleneck: false, // 稍后更新
      });
    }

    // 识别瓶颈审批人：响应时间超过平均值 2 倍的
    if (allAvgTimes.length > 0) {
      const overallAvg =
        allAvgTimes.reduce((sum, t) => sum + t, 0) / allAvgTimes.length;
      for (const metric of metrics) {
        metric.isBottleneck = metric.averageResponseTimeMs > overallAvg * 2;
      }
    }

    return metrics;
  }

  /**
   * 生成瓶颈报告
   */
  public generateBottleneckReport(): BottleneckReport {
    const approverMetrics = this.getApproverMetrics();
    const bottleneckApprovers = approverMetrics.filter(
      (m) => m.isBottleneck
    );

    // 找出最慢的审批链
    const completedRecords = this.records
      .filter((r) => r.finalDecision !== undefined)
      .map((r) => ({
        requestId: r.id,
        duration: r.finalDecision!.timestamp - r.createdAt,
        description: `Agent ${r.agentId} - ${r.status}`,
      }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    // 生成优化建议
    const recommendations: string[] = [];

    if (bottleneckApprovers.length > 0) {
      recommendations.push(
        `发现 ${bottleneckApprovers.length} 个瓶颈审批人，` +
        `建议增加代理审批人或启用自动升级机制`
      );
    }

    const stats = this.getEfficiencyStats();
    if (stats.timeoutRate > 0.1) {
      recommendations.push(
        `超时率 ${(stats.timeoutRate * 100).toFixed(1)}% 偏高，` +
        `建议延长超时时间或减少需要审批的操作`
      );
    }

    if (stats.approvalRate > 0.95) {
      recommendations.push(
        `通过率高达 ${(stats.approvalRate * 100).toFixed(1)}%，` +
        `可能存在审批疲劳，建议提高审批触发阈值`
      );
    }

    if (stats.p95ApprovalTimeMs > 30 * 60 * 1000) {
      recommendations.push(
        `P95 审批时间超过 30 分钟，建议为低风险操作启用仲裁模式`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push("审批系统运行正常，暂无优化建议");
    }

    return {
      bottleneckApprovers,
      slowestChains: completedRecords,
      recommendations,
    };
  }
}
```

> **最佳实践**：审批分析应定期执行（建议每周一次），并将结果发送给安全运营团队。当通过率持续高于 95% 时，很可能意味着审批人没有认真审核，此时应该考虑提高触发审批的阈值，或者改用更轻量级的确认方式。

---

## 14.4 沙箱执行环境

### 14.4.1 多级隔离模型

沙箱执行是"纵深防御"的关键一环。即使 Agent 的权限检查通过、审批流程合规，实际执行时仍然可能产生意料之外的副作用。沙箱通过限制执行环境的资源和网络访问，将可能的损害控制在最小范围内。

我们定义四种隔离级别，适用于不同风险等级的操作：

| 隔离级别 | 实现方式 | 适用场景 | 启动时间 | 开销 |
|---------|---------|---------|---------|------|
| Process | 子进程 + seccomp | 低风险计算任务 | < 100ms | 低 |
| Container | Docker 容器 | 中风险 API 调用和数据处理 | 1-5s | 中 |
| VM | 轻量级虚拟机 | 高风险代码执行 | 10-30s | 高 |
| CloudFunction | 云函数（FaaS） | 不可信代码执行 | 冷启动 1-5s | 按量计费 |

### 14.4.2 沙箱管理器实现

```typescript
// sandbox/sandbox-manager.ts —— 沙箱管理器

import { EventEmitter } from "events";
import crypto from "crypto";

/** 隔离级别 */
export enum IsolationLevel {
  Process = "process",
  Container = "container",
  VM = "vm",
  CloudFunction = "cloud_function",
}

/** 网络策略 */
interface NetworkPolicy {
  /** 允许的出站域名/IP 列表 */
  allowedOutbound: string[];
  /** 允许的出站端口 */
  allowedPorts: number[];
  /** 是否允许 DNS 解析 */
  allowDNS: boolean;
  /** 最大并发连接数 */
  maxConnections: number;
  /** 出站带宽限制（bytes/s） */
  bandwidthLimitBps?: number;
}

/** 文件系统策略 */
interface FileSystemPolicy {
  /** 只读挂载路径 */
  readOnlyMounts: string[];
  /** 读写临时目录（沙箱销毁后自动清理） */
  tempDirectories: string[];
  /** 最大磁盘使用量（bytes） */
  maxDiskBytes: number;
  /** 禁止访问的路径模式 */
  blockedPaths: string[];
}

/** 资源配额 */
export interface ResourceQuota {
  /** CPU 限制（核数，如 0.5 表示半核） */
  cpuCores: number;
  /** 内存限制（bytes） */
  memoryBytes: number;
  /** 磁盘 I/O 限制（bytes/s） */
  diskIOBps?: number;
  /** 网络带宽限制（bytes/s） */
  networkBandwidthBps?: number;
  /** 最大执行时间（毫秒） */
  maxExecutionTimeMs: number;
  /** 最大进程数 */
  maxProcesses: number;
}

/** 沙箱配置 */
interface SandboxConfig {
  isolationLevel: IsolationLevel;
  networkPolicy: NetworkPolicy;
  fileSystemPolicy: FileSystemPolicy;
  resourceQuota: ResourceQuota;
  /** 环境变量（过滤后的安全变量） */
  environmentVariables: Record<string, string>;
  /** 自定义标签 */
  labels: Record<string, string>;
}

/** 沙箱实例状态 */
enum SandboxStatus {
  Creating = "creating",
  Ready = "ready",
  Running = "running",
  Completed = "completed",
  Failed = "failed",
  TimedOut = "timed_out",
  Destroyed = "destroyed",
}

/** 沙箱执行结果 */
interface SandboxResult {
  sandboxId: string;
  status: SandboxStatus;
  exitCode: number;
  stdout: string;
  stderr: string;
  /** 资源使用情况 */
  resourceUsage: {
    cpuTimeMs: number;
    peakMemoryBytes: number;
    networkBytesIn: number;
    networkBytesOut: number;
    diskBytesWritten: number;
  };
  /** 执行时间（毫秒） */
  durationMs: number;
  /** 是否因超时终止 */
  timedOut: boolean;
}

/** 沙箱实例 */
interface SandboxInstance {
  id: string;
  config: SandboxConfig;
  status: SandboxStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: SandboxResult;
  /** 与之关联的进程/容器 ID */
  runtimeId?: string;
}

/**
 * 沙箱管理器
 *
 * 管理不同隔离级别的沙箱实例，提供：
 * - 自动选择合适的隔离级别
 * - 资源配额管理
 * - 网络和文件系统策略
 * - 沙箱生命周期管理
 * - 执行结果收集
 */
export class SandboxManager extends EventEmitter {
  private instances: Map<string, SandboxInstance> = new Map();
  private presetConfigs: Map<string, SandboxConfig> = new Map();

  constructor() {
    super();
    this.initializePresets();
  }

  /**
   * 初始化预设沙箱配置
   */
  private initializePresets(): void {
    // 低风险预设：宽松限制
    this.presetConfigs.set("low_risk", {
      isolationLevel: IsolationLevel.Process,
      networkPolicy: {
        allowedOutbound: ["*"],
        allowedPorts: [80, 443],
        allowDNS: true,
        maxConnections: 10,
      },
      fileSystemPolicy: {
        readOnlyMounts: ["/usr/lib", "/usr/share"],
        tempDirectories: ["/tmp/sandbox"],
        maxDiskBytes: 100 * 1024 * 1024, // 100MB
        blockedPaths: ["/etc/shadow", "/root", "/home"],
      },
      resourceQuota: {
        cpuCores: 1,
        memoryBytes: 512 * 1024 * 1024, // 512MB
        maxExecutionTimeMs: 30000, // 30秒
        maxProcesses: 10,
      },
      environmentVariables: {},
      labels: { preset: "low_risk" },
    });

    // 中风险预设：标准限制
    this.presetConfigs.set("medium_risk", {
      isolationLevel: IsolationLevel.Container,
      networkPolicy: {
        allowedOutbound: [], // 需要显式添加
        allowedPorts: [443],
        allowDNS: true,
        maxConnections: 5,
        bandwidthLimitBps: 1024 * 1024, // 1MB/s
      },
      fileSystemPolicy: {
        readOnlyMounts: [],
        tempDirectories: ["/tmp/sandbox"],
        maxDiskBytes: 50 * 1024 * 1024, // 50MB
        blockedPaths: ["*"], // 默认阻止所有，只允许 temp
      },
      resourceQuota: {
        cpuCores: 0.5,
        memoryBytes: 256 * 1024 * 1024, // 256MB
        diskIOBps: 10 * 1024 * 1024, // 10MB/s
        maxExecutionTimeMs: 60000, // 60秒
        maxProcesses: 5,
      },
      environmentVariables: {},
      labels: { preset: "medium_risk" },
    });

    // 高风险预设：严格限制
    this.presetConfigs.set("high_risk", {
      isolationLevel: IsolationLevel.VM,
      networkPolicy: {
        allowedOutbound: [], // 默认无网络
        allowedPorts: [],
        allowDNS: false,
        maxConnections: 0,
      },
      fileSystemPolicy: {
        readOnlyMounts: [],
        tempDirectories: ["/tmp/sandbox"],
        maxDiskBytes: 20 * 1024 * 1024, // 20MB
        blockedPaths: ["*"],
      },
      resourceQuota: {
        cpuCores: 0.25,
        memoryBytes: 128 * 1024 * 1024, // 128MB
        diskIOBps: 5 * 1024 * 1024, // 5MB/s
        maxExecutionTimeMs: 30000, // 30秒
        maxProcesses: 3,
      },
      environmentVariables: {},
      labels: { preset: "high_risk" },
    });
  }

  /**
   * 根据风险评分自动选择隔离级别
   */
  public selectIsolationLevel(riskScore: number): IsolationLevel {
    if (riskScore <= 30) return IsolationLevel.Process;
    if (riskScore <= 60) return IsolationLevel.Container;
    if (riskScore <= 85) return IsolationLevel.VM;
    return IsolationLevel.CloudFunction;
  }

  /**
   * 创建沙箱实例
   */
  public async createSandbox(
    config?: Partial<SandboxConfig>,
    presetName?: string
  ): Promise<SandboxInstance> {
    // 获取预设配置
    const preset = presetName
      ? this.presetConfigs.get(presetName)
      : undefined;

    const finalConfig: SandboxConfig = {
      ...(preset ?? this.presetConfigs.get("medium_risk")!),
      ...config,
      networkPolicy: {
        ...(preset?.networkPolicy ??
          this.presetConfigs.get("medium_risk")!.networkPolicy),
        ...config?.networkPolicy,
      },
      fileSystemPolicy: {
        ...(preset?.fileSystemPolicy ??
          this.presetConfigs.get("medium_risk")!.fileSystemPolicy),
        ...config?.fileSystemPolicy,
      },
      resourceQuota: {
        ...(preset?.resourceQuota ??
          this.presetConfigs.get("medium_risk")!.resourceQuota),
        ...config?.resourceQuota,
      },
    };

    const instance: SandboxInstance = {
      id: crypto.randomUUID(),
      config: finalConfig,
      status: SandboxStatus.Creating,
      createdAt: Date.now(),
    };

    this.instances.set(instance.id, instance);

    // 根据隔离级别创建运行时环境
    try {
      const runtimeId = await this.createRuntime(finalConfig);
      instance.runtimeId = runtimeId;
      instance.status = SandboxStatus.Ready;
      this.emit("sandboxReady", { sandboxId: instance.id });
    } catch (error) {
      instance.status = SandboxStatus.Failed;
      this.emit("sandboxFailed", {
        sandboxId: instance.id,
        error,
      });
    }

    return instance;
  }

  /**
   * 在沙箱中执行代码
   */
  public async execute(
    sandboxId: string,
    code: string,
    args: string[] = []
  ): Promise<SandboxResult> {
    const instance = this.instances.get(sandboxId);
    if (!instance) {
      throw new Error(`沙箱 ${sandboxId} 不存在`);
    }
    if (instance.status !== SandboxStatus.Ready) {
      throw new Error(`沙箱 ${sandboxId} 状态不正确: ${instance.status}`);
    }

    instance.status = SandboxStatus.Running;
    instance.startedAt = Date.now();

    try {
      const result = await this.executeInRuntime(instance, code, args);
      instance.status = result.timedOut
        ? SandboxStatus.TimedOut
        : SandboxStatus.Completed;
      instance.completedAt = Date.now();
      instance.result = result;

      this.emit("executionCompleted", {
        sandboxId,
        result,
      });

      return result;
    } catch (error) {
      instance.status = SandboxStatus.Failed;
      instance.completedAt = Date.now();

      const failResult: SandboxResult = {
        sandboxId,
        status: SandboxStatus.Failed,
        exitCode: -1,
        stdout: "",
        stderr: String(error),
        resourceUsage: {
          cpuTimeMs: 0,
          peakMemoryBytes: 0,
          networkBytesIn: 0,
          networkBytesOut: 0,
          diskBytesWritten: 0,
        },
        durationMs: Date.now() - instance.startedAt,
        timedOut: false,
      };

      instance.result = failResult;
      this.emit("executionFailed", { sandboxId, error });
      return failResult;
    }
  }

  /**
   * 创建运行时环境（模拟不同隔离级别的创建过程）
   */
  private async createRuntime(config: SandboxConfig): Promise<string> {
    const runtimeId = `runtime-${crypto.randomUUID().slice(0, 8)}`;

    switch (config.isolationLevel) {
      case IsolationLevel.Process:
        // 进程级隔离：使用 child_process + 系统调用过滤
        console.log(`[沙箱] 创建进程级隔离环境 ${runtimeId}`);
        console.log(
          `  CPU: ${config.resourceQuota.cpuCores} 核, ` +
          `内存: ${config.resourceQuota.memoryBytes / 1024 / 1024}MB`
        );
        break;

      case IsolationLevel.Container:
        // 容器级隔离：生成 Docker 配置
        console.log(`[沙箱] 创建容器级隔离环境 ${runtimeId}`);
        const dockerConfig = this.generateDockerConfig(config);
        console.log(`  Docker 配置: ${JSON.stringify(dockerConfig, null, 2)}`);
        break;

      case IsolationLevel.VM:
        // 虚拟机级隔离
        console.log(`[沙箱] 创建虚拟机级隔离环境 ${runtimeId}`);
        break;

      case IsolationLevel.CloudFunction:
        // 云函数隔离
        console.log(`[沙箱] 创建云函数隔离环境 ${runtimeId}`);
        break;
    }

    return runtimeId;
  }

  /**
   * 生成 Docker 运行配置
   */
  private generateDockerConfig(config: SandboxConfig): Record<string, unknown> {
    const { resourceQuota, networkPolicy, fileSystemPolicy } = config;

    return {
      Image: "node:20-slim",
      HostConfig: {
        // CPU 限制
        NanoCpus: Math.floor(resourceQuota.cpuCores * 1e9),
        // 内存限制
        Memory: resourceQuota.memoryBytes,
        MemorySwap: resourceQuota.memoryBytes, // 禁止 swap
        // 进程数限制
        PidsLimit: resourceQuota.maxProcesses,
        // 磁盘 I/O 限制
        BlkioDeviceWriteBps: resourceQuota.diskIOBps
          ? [{ Path: "/dev/sda", Rate: resourceQuota.diskIOBps }]
          : undefined,
        // 网络模式
        NetworkMode:
          networkPolicy.allowedOutbound.length === 0 ? "none" : "bridge",
        // 文件系统挂载
        Binds: [
          ...fileSystemPolicy.readOnlyMounts.map((m) => `${m}:${m}:ro`),
          ...fileSystemPolicy.tempDirectories.map((d) => `${d}:${d}:rw`),
        ],
        // 安全配置
        SecurityOpt: ["no-new-privileges:true"],
        ReadonlyRootfs: true,
        // 丢弃所有 Linux capabilities
        CapDrop: ["ALL"],
        // 只添加最小必需的 capabilities
        CapAdd: ["NET_BIND_SERVICE"],
      },
      // 环境变量
      Env: Object.entries(config.environmentVariables).map(
        ([k, v]) => `${k}=${v}`
      ),
      // 工作目录
      WorkingDir: fileSystemPolicy.tempDirectories[0] ?? "/tmp",
      // 用户（非 root）
      User: "1000:1000",
    };
  }

  /**
   * 在运行时环境中执行代码
   */
  private async executeInRuntime(
    instance: SandboxInstance,
    code: string,
    args: string[]
  ): Promise<SandboxResult> {
    const startTime = Date.now();
    const { maxExecutionTimeMs } = instance.config.resourceQuota;

    return new Promise<SandboxResult>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          sandboxId: instance.id,
          status: SandboxStatus.TimedOut,
          exitCode: 124, // 标准超时退出码
          stdout: "",
          stderr: `执行超时: 超过 ${maxExecutionTimeMs}ms 限制`,
          resourceUsage: {
            cpuTimeMs: maxExecutionTimeMs,
            peakMemoryBytes: 0,
            networkBytesIn: 0,
            networkBytesOut: 0,
            diskBytesWritten: 0,
          },
          durationMs: maxExecutionTimeMs,
          timedOut: true,
        });
      }, maxExecutionTimeMs);

      // 模拟执行（实际环境中会调用 Docker API 或云函数 API）
      try {
        // 这里是模拟逻辑，实际实现需要调用对应的运行时 API
        const simulatedDuration = Math.min(
          Math.random() * 5000,
          maxExecutionTimeMs
        );

        setTimeout(() => {
          clearTimeout(timeout);
          resolve({
            sandboxId: instance.id,
            status: SandboxStatus.Completed,
            exitCode: 0,
            stdout: `[沙箱执行结果] 代码长度: ${code.length}, 参数: ${args.join(", ")}`,
            stderr: "",
            resourceUsage: {
              cpuTimeMs: simulatedDuration * 0.8,
              peakMemoryBytes: Math.floor(Math.random() * 100 * 1024 * 1024),
              networkBytesIn: 0,
              networkBytesOut: 0,
              diskBytesWritten: Math.floor(Math.random() * 1024 * 1024),
            },
            durationMs: simulatedDuration,
            timedOut: false,
          });
        }, simulatedDuration);
      } catch (error) {
        clearTimeout(timeout);
        resolve({
          sandboxId: instance.id,
          status: SandboxStatus.Failed,
          exitCode: 1,
          stdout: "",
          stderr: String(error),
          resourceUsage: {
            cpuTimeMs: Date.now() - startTime,
            peakMemoryBytes: 0,
            networkBytesIn: 0,
            networkBytesOut: 0,
            diskBytesWritten: 0,
          },
          durationMs: Date.now() - startTime,
          timedOut: false,
        });
      }
    });
  }

  /** 销毁沙箱实例 */
  public async destroySandbox(sandboxId: string): Promise<void> {
    const instance = this.instances.get(sandboxId);
    if (!instance) return;

    instance.status = SandboxStatus.Destroyed;
    console.log(
      `[沙箱] 销毁沙箱 ${sandboxId} (隔离级别: ${instance.config.isolationLevel})`
    );
    this.instances.delete(sandboxId);
    this.emit("sandboxDestroyed", { sandboxId });
  }

  /** 获取所有活跃沙箱 */
  public getActiveSandboxes(): SandboxInstance[] {
    return Array.from(this.instances.values()).filter(
      (i) =>
        i.status !== SandboxStatus.Destroyed &&
        i.status !== SandboxStatus.Completed &&
        i.status !== SandboxStatus.Failed
    );
  }

  /** 获取沙箱实例 */
  public getSandbox(sandboxId: string): SandboxInstance | undefined {
    return this.instances.get(sandboxId);
  }
}
```

### 14.4.3 资源配额管理器

在多 Agent 并发执行的场景下，需要一个全局的资源配额管理器来防止资源争抢：

```typescript
// sandbox/resource-quota-manager.ts —— 资源配额管理器

import { ResourceQuota } from "./sandbox-manager";

/** 全局资源池 */
interface ResourcePool {
  /** 总 CPU 核数 */
  totalCpuCores: number;
  /** 已分配 CPU 核数 */
  allocatedCpuCores: number;
  /** 总内存（bytes） */
  totalMemoryBytes: number;
  /** 已分配内存（bytes） */
  allocatedMemoryBytes: number;
  /** 最大并发沙箱数 */
  maxConcurrentSandboxes: number;
  /** 当前活跃沙箱数 */
  activeSandboxes: number;
}

/** 资源分配记录 */
interface ResourceAllocation {
  sandboxId: string;
  agentId: string;
  quota: ResourceQuota;
  allocatedAt: number;
  releasedAt?: number;
}

/**
 * 资源配额管理器
 *
 * 管理全局资源池，确保：
 * - 资源分配不超过总量限制
 * - 公平调度多个 Agent 的资源请求
 * - 自动回收超时沙箱的资源
 * - 资源使用统计和告警
 */
export class ResourceQuotaManager {
  private pool: ResourcePool;
  private allocations: Map<string, ResourceAllocation> = new Map();
  private waitQueue: Array<{
    sandboxId: string;
    agentId: string;
    quota: ResourceQuota;
    resolve: (allocated: boolean) => void;
    timestamp: number;
  }> = [];

  constructor(
    totalCpuCores: number = 8,
    totalMemoryBytes: number = 16 * 1024 * 1024 * 1024, // 16GB
    maxConcurrentSandboxes: number = 20
  ) {
    this.pool = {
      totalCpuCores,
      allocatedCpuCores: 0,
      totalMemoryBytes,
      allocatedMemoryBytes: 0,
      maxConcurrentSandboxes,
      activeSandboxes: 0,
    };
  }

  /**
   * 请求资源分配
   *
   * 如果资源充足则立即分配，否则加入等待队列
   */
  public async requestAllocation(
    sandboxId: string,
    agentId: string,
    quota: ResourceQuota
  ): Promise<boolean> {
    // 检查是否可以立即分配
    if (this.canAllocate(quota)) {
      this.allocate(sandboxId, agentId, quota);
      return true;
    }

    // 加入等待队列
    return new Promise<boolean>((resolve) => {
      this.waitQueue.push({
        sandboxId,
        agentId,
        quota,
        resolve,
        timestamp: Date.now(),
      });

      // 设置等待超时（30秒）
      setTimeout(() => {
        const index = this.waitQueue.findIndex(
          (w) => w.sandboxId === sandboxId
        );
        if (index !== -1) {
          this.waitQueue.splice(index, 1);
          resolve(false);
        }
      }, 30000);
    });
  }

  /**
   * 检查是否有足够的资源
   */
  private canAllocate(quota: ResourceQuota): boolean {
    return (
      this.pool.allocatedCpuCores + quota.cpuCores <=
        this.pool.totalCpuCores &&
      this.pool.allocatedMemoryBytes + quota.memoryBytes <=
        this.pool.totalMemoryBytes &&
      this.pool.activeSandboxes < this.pool.maxConcurrentSandboxes
    );
  }

  /**
   * 执行资源分配
   */
  private allocate(
    sandboxId: string,
    agentId: string,
    quota: ResourceQuota
  ): void {
    this.pool.allocatedCpuCores += quota.cpuCores;
    this.pool.allocatedMemoryBytes += quota.memoryBytes;
    this.pool.activeSandboxes++;

    this.allocations.set(sandboxId, {
      sandboxId,
      agentId,
      quota,
      allocatedAt: Date.now(),
    });
  }

  /**
   * 释放资源
   */
  public releaseAllocation(sandboxId: string): void {
    const allocation = this.allocations.get(sandboxId);
    if (!allocation) return;

    this.pool.allocatedCpuCores -= allocation.quota.cpuCores;
    this.pool.allocatedMemoryBytes -= allocation.quota.memoryBytes;
    this.pool.activeSandboxes--;

    allocation.releasedAt = Date.now();

    // 检查等待队列中是否有可以分配的请求
    this.processWaitQueue();
  }

  /**
   * 处理等待队列
   */
  private processWaitQueue(): void {
    const pendingItems = [...this.waitQueue];
    this.waitQueue = [];

    for (const item of pendingItems) {
      if (this.canAllocate(item.quota)) {
        this.allocate(item.sandboxId, item.agentId, item.quota);
        item.resolve(true);
      } else {
        this.waitQueue.push(item);
      }
    }
  }

  /** 获取资源池状态 */
  public getPoolStatus(): ResourcePool {
    return { ...this.pool };
  }

  /** 获取资源使用率 */
  public getUtilization(): {
    cpuUtilization: number;
    memoryUtilization: number;
    sandboxUtilization: number;
  } {
    return {
      cpuUtilization: this.pool.allocatedCpuCores / this.pool.totalCpuCores,
      memoryUtilization:
        this.pool.allocatedMemoryBytes / this.pool.totalMemoryBytes,
      sandboxUtilization:
        this.pool.activeSandboxes / this.pool.maxConcurrentSandboxes,
    };
  }

  /** 获取 Agent 的资源使用情况 */
  public getAgentAllocations(agentId: string): ResourceAllocation[] {
    return Array.from(this.allocations.values()).filter(
      (a) => a.agentId === agentId && !a.releasedAt
    );
  }
}
```

> **设计决策**：资源配额管理器使用等待队列而非直接拒绝的策略。这是因为沙箱的生命周期通常很短（几秒到几分钟），等待一小段时间通常比拒绝后重试更高效。30 秒的等待超时是一个折中——足够等待大多数短期沙箱释放资源，又不会让请求者等待太久。

---

## 14.5 审计与合规

### 14.5.1 防篡改审计日志

在生产环境中，审计日志是安全事故调查和合规审查的生命线。普通的日志文件容易被篡改或删除——一个被攻破的 Agent 可能尝试清除自己的行为痕迹。因此我们需要实现**防篡改审计日志**，使用哈希链（Hash Chain）确保任何篡改都可以被检测到。

```typescript
// audit/compliance-audit-system.ts —— 合规审计系统

import crypto from "crypto";

/** 审计事件类型 */
export enum AuditEventType {
  /** 权限检查 */
  PermissionCheck = "permission_check",
  /** 权限变更 */
  PermissionChange = "permission_change",
  /** 数据访问 */
  DataAccess = "data_access",
  /** 数据修改 */
  DataModification = "data_modification",
  /** 数据删除 */
  DataDeletion = "data_deletion",
  /** 审批操作 */
  ApprovalAction = "approval_action",
  /** 沙箱执行 */
  SandboxExecution = "sandbox_execution",
  /** 身份认证 */
  Authentication = "authentication",
  /** 安全事件 */
  SecurityIncident = "security_incident",
  /** 配置变更 */
  ConfigChange = "config_change",
  /** 委托授权 */
  DelegationAction = "delegation_action",
  /** 用户数据操作（GDPR 相关） */
  UserDataOperation = "user_data_operation",
}

/** 审计事件严重级别 */
export enum AuditSeverity {
  Info = "info",
  Warning = "warning",
  Error = "error",
  Critical = "critical",
}

/** 审计日志条目 */
export interface AuditLogEntry {
  /** 唯一 ID */
  id: string;
  /** 事件序号（递增） */
  sequenceNumber: number;
  /** 时间戳 */
  timestamp: number;
  /** 事件类型 */
  eventType: AuditEventType;
  /** 严重级别 */
  severity: AuditSeverity;
  /** 执行者 ID（Agent 或用户） */
  actorId: string;
  /** 执行者类型 */
  actorType: "agent" | "user" | "system";
  /** 操作描述 */
  action: string;
  /** 操作对象 */
  target: {
    type: string;
    id: string;
    name?: string;
  };
  /** 操作结果 */
  outcome: "success" | "failure" | "denied" | "error";
  /** 详细信息 */
  details: Record<string, unknown>;
  /** 关联的会话 ID */
  sessionId?: string;
  /** 来源 IP */
  sourceIP?: string;
  /** 当前条目的哈希值 */
  hash: string;
  /** 前一条目的哈希值（形成哈希链） */
  previousHash: string;
  /** 合规标签 */
  complianceTags: string[];
}

/** 合规检查结果 */
interface ComplianceCheckResult {
  framework: string;
  checkName: string;
  passed: boolean;
  details: string;
  evidence: AuditLogEntry[];
  timestamp: number;
}

/** 合规报告 */
interface ComplianceReport {
  generatedAt: number;
  period: { start: number; end: number };
  framework: string;
  overallStatus: "compliant" | "non_compliant" | "partially_compliant";
  checks: ComplianceCheckResult[];
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    complianceRate: number;
  };
  recommendations: string[];
}

/** 数据保留策略 */
interface RetentionPolicy {
  /** 策略名称 */
  name: string;
  /** 事件类型匹配规则 */
  eventTypes: AuditEventType[];
  /** 保留天数 */
  retentionDays: number;
  /** 过期后的处理方式 */
  expirationAction: "delete" | "archive" | "anonymize";
  /** 是否有法规要求 */
  regulatoryRequirement?: string;
}

/**
 * 合规审计系统
 *
 * 提供企业级审计能力：
 * - 防篡改哈希链日志
 * - GDPR 合规检查
 * - 中国《网络安全法》合规检查
 * - SOC 2 审计追踪
 * - 自动化合规报告生成
 * - 数据保留策略管理
 */
export class ComplianceAuditSystem {
  private logs: AuditLogEntry[] = [];
  private sequenceCounter: number = 0;
  private lastHash: string = "GENESIS_BLOCK_0000000000";
  private retentionPolicies: RetentionPolicy[] = [];
  private consentRecords: Map<
    string,
    { userId: string; purposes: string[]; grantedAt: number; revokedAt?: number }
  > = new Map();

  constructor() {
    this.initializeRetentionPolicies();
  }

  /**
   * 初始化默认数据保留策略
   */
  private initializeRetentionPolicies(): void {
    // 安全事件日志：保留 7 年（SOC 2 要求）
    this.retentionPolicies.push({
      name: "安全事件长期保留",
      eventTypes: [
        AuditEventType.SecurityIncident,
        AuditEventType.Authentication,
      ],
      retentionDays: 2555, // 约 7 年
      expirationAction: "archive",
      regulatoryRequirement: "SOC 2 Type II",
    });

    // 数据访问日志：保留 3 年（GDPR 要求）
    this.retentionPolicies.push({
      name: "数据访问日志",
      eventTypes: [
        AuditEventType.DataAccess,
        AuditEventType.DataModification,
        AuditEventType.DataDeletion,
        AuditEventType.UserDataOperation,
      ],
      retentionDays: 1095, // 3 年
      expirationAction: "anonymize",
      regulatoryRequirement: "GDPR Article 30",
    });

    // 一般操作日志：保留 1 年
    this.retentionPolicies.push({
      name: "一般操作日志",
      eventTypes: [
        AuditEventType.PermissionCheck,
        AuditEventType.ApprovalAction,
        AuditEventType.SandboxExecution,
      ],
      retentionDays: 365,
      expirationAction: "delete",
    });

    // 配置变更日志：保留 5 年（《网络安全法》要求）
    this.retentionPolicies.push({
      name: "配置变更长期保留",
      eventTypes: [
        AuditEventType.ConfigChange,
        AuditEventType.PermissionChange,
      ],
      retentionDays: 1825, // 5 年
      expirationAction: "archive",
      regulatoryRequirement: "中国《网络安全法》第二十一条",
    });
  }

  /**
   * 记录审计事件
   * 每条记录包含前一条的哈希值，形成不可篡改的哈希链
   */
  public log(
    params: Omit<AuditLogEntry, "id" | "sequenceNumber" | "hash" | "previousHash" | "timestamp">
  ): AuditLogEntry {
    this.sequenceCounter++;

    const entry: AuditLogEntry = {
      ...params,
      id: crypto.randomUUID(),
      sequenceNumber: this.sequenceCounter,
      timestamp: Date.now(),
      hash: "", // 将在下面计算
      previousHash: this.lastHash,
    };

    // 计算当前条目的哈希值
    entry.hash = this.computeHash(entry);
    this.lastHash = entry.hash;

    this.logs.push(entry);
    return entry;
  }

  /**
   * 计算审计日志条目的哈希值
   */
  private computeHash(entry: AuditLogEntry): string {
    const content = JSON.stringify({
      sequenceNumber: entry.sequenceNumber,
      timestamp: entry.timestamp,
      eventType: entry.eventType,
      actorId: entry.actorId,
      action: entry.action,
      target: entry.target,
      outcome: entry.outcome,
      details: entry.details,
      previousHash: entry.previousHash,
    });

    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /**
   * 验证审计日志完整性
   *
   * 通过重新计算哈希链来检测是否有篡改
   */
  public verifyIntegrity(): {
    valid: boolean;
    brokenAt?: number;
    details: string;
  } {
    if (this.logs.length === 0) {
      return { valid: true, details: "审计日志为空" };
    }

    // 检查第一条记录的 previousHash
    if (this.logs[0].previousHash !== "GENESIS_BLOCK_0000000000") {
      return {
        valid: false,
        brokenAt: 0,
        details: "创世块哈希不匹配",
      };
    }

    for (let i = 0; i < this.logs.length; i++) {
      const entry = this.logs[i];

      // 重新计算哈希
      const expectedHash = this.computeHash(entry);
      if (entry.hash !== expectedHash) {
        return {
          valid: false,
          brokenAt: i,
          details: `序号 ${entry.sequenceNumber} 的哈希值不匹配，` +
                   `可能被篡改`,
        };
      }

      // 检查哈希链连续性
      if (i > 0 && entry.previousHash !== this.logs[i - 1].hash) {
        return {
          valid: false,
          brokenAt: i,
          details: `序号 ${entry.sequenceNumber} 的前向哈希不匹配，` +
                   `哈希链断裂`,
        };
      }
    }

    return {
      valid: true,
      details: `审计日志完整性验证通过，共 ${this.logs.length} 条记录`,
    };
  }

  /**
   * 记录用户数据处理同意（GDPR 合规）
   */
  public recordConsent(
    userId: string,
    purposes: string[]
  ): void {
    const consentId = `consent-${userId}-${Date.now()}`;
    this.consentRecords.set(consentId, {
      userId,
      purposes,
      grantedAt: Date.now(),
    });

    this.log({
      eventType: AuditEventType.UserDataOperation,
      severity: AuditSeverity.Info,
      actorId: userId,
      actorType: "user",
      action: "consent_granted",
      target: { type: "consent", id: consentId },
      outcome: "success",
      details: { purposes },
      complianceTags: ["GDPR", "consent"],
    });
  }

  /**
   * 撤销用户数据处理同意（GDPR 合规）
   */
  public revokeConsent(userId: string): void {
    for (const [consentId, record] of this.consentRecords) {
      if (record.userId === userId && !record.revokedAt) {
        record.revokedAt = Date.now();

        this.log({
          eventType: AuditEventType.UserDataOperation,
          severity: AuditSeverity.Warning,
          actorId: userId,
          actorType: "user",
          action: "consent_revoked",
          target: { type: "consent", id: consentId },
          outcome: "success",
          details: { previousPurposes: record.purposes },
          complianceTags: ["GDPR", "consent_revocation"],
        });
      }
    }
  }

  /**
   * GDPR 合规检查
   */
  public checkGDPRCompliance(
    startTime: number,
    endTime: number
  ): ComplianceCheckResult[] {
    const results: ComplianceCheckResult[] = [];
    const periodLogs = this.logs.filter(
      (l) => l.timestamp >= startTime && l.timestamp <= endTime
    );

    // 检查1：所有数据访问都有记录
    const dataAccessLogs = periodLogs.filter(
      (l) =>
        l.eventType === AuditEventType.DataAccess ||
        l.eventType === AuditEventType.UserDataOperation
    );
    results.push({
      framework: "GDPR",
      checkName: "数据访问日志完整性 (Article 30)",
      passed: dataAccessLogs.length > 0,
      details: `期间共记录 ${dataAccessLogs.length} 次数据访问操作`,
      evidence: dataAccessLogs.slice(0, 5),
      timestamp: Date.now(),
    });

    // 检查2：数据删除操作都有合法依据
    const deletionLogs = periodLogs.filter(
      (l) => l.eventType === AuditEventType.DataDeletion
    );
    const unauthorizedDeletions = deletionLogs.filter(
      (l) => l.outcome === "denied"
    );
    results.push({
      framework: "GDPR",
      checkName: "数据删除合规性 (Article 17)",
      passed: unauthorizedDeletions.length === 0,
      details: unauthorizedDeletions.length === 0
        ? "所有数据删除操作均已授权"
        : `发现 ${unauthorizedDeletions.length} 次未授权的删除尝试`,
      evidence: unauthorizedDeletions.slice(0, 5),
      timestamp: Date.now(),
    });

    // 检查3：用户同意记录完整
    const consentLogs = periodLogs.filter(
      (l) =>
        l.complianceTags.includes("consent") ||
        l.complianceTags.includes("consent_revocation")
    );
    results.push({
      framework: "GDPR",
      checkName: "用户同意管理 (Article 7)",
      passed: true,
      details: `期间共记录 ${consentLogs.length} 次同意相关操作`,
      evidence: consentLogs.slice(0, 5),
      timestamp: Date.now(),
    });

    // 检查4：安全事件响应及时性
    const securityLogs = periodLogs.filter(
      (l) => l.eventType === AuditEventType.SecurityIncident
    );
    results.push({
      framework: "GDPR",
      checkName: "安全事件响应 (Article 33)",
      passed: true,
      details: `期间共发生 ${securityLogs.length} 次安全事件`,
      evidence: securityLogs.slice(0, 5),
      timestamp: Date.now(),
    });

    return results;
  }

  /**
   * 中国《网络安全法》合规检查
   */
  public checkChinaCyberSecurityCompliance(
    startTime: number,
    endTime: number
  ): ComplianceCheckResult[] {
    const results: ComplianceCheckResult[] = [];
    const periodLogs = this.logs.filter(
      (l) => l.timestamp >= startTime && l.timestamp <= endTime
    );

    // 检查1：网络日志留存不少于六个月（第二十一条）
    const oldestLog = periodLogs.length > 0 ? periodLogs[0].timestamp : Date.now();
    const logRetentionDays =
      (Date.now() - oldestLog) / (24 * 60 * 60 * 1000);
    results.push({
      framework: "中国《网络安全法》",
      checkName: "网络日志留存 (第二十一条)",
      passed: logRetentionDays >= 180 || periodLogs.length === 0,
      details: logRetentionDays >= 180
        ? `日志保留 ${Math.floor(logRetentionDays)} 天，满足 180 天要求`
        : `日志保留 ${Math.floor(logRetentionDays)} 天，不满足 180 天最低要求`,
      evidence: [],
      timestamp: Date.now(),
    });

    // 检查2：安全等级保护（第二十一条）
    const authLogs = periodLogs.filter(
      (l) => l.eventType === AuditEventType.Authentication
    );
    const failedAuth = authLogs.filter((l) => l.outcome === "failure");
    results.push({
      framework: "中国《网络安全法》",
      checkName: "身份认证安全 (第二十一条)",
      passed: failedAuth.length < authLogs.length * 0.1,
      details: `认证失败率: ${authLogs.length > 0
        ? ((failedAuth.length / authLogs.length) * 100).toFixed(1)
        : 0}%`,
      evidence: failedAuth.slice(0, 5),
      timestamp: Date.now(),
    });

    // 检查3：个人信息保护（第四十一条）
    const userDataLogs = periodLogs.filter(
      (l) => l.eventType === AuditEventType.UserDataOperation
    );
    results.push({
      framework: "中国《网络安全法》",
      checkName: "个人信息保护 (第四十一条)",
      passed: true,
      details: `期间共 ${userDataLogs.length} 次个人信息操作，均有记录`,
      evidence: userDataLogs.slice(0, 5),
      timestamp: Date.now(),
    });

    // 检查4：安全事件报告（第二十五条）
    const incidentLogs = periodLogs.filter(
      (l) => l.eventType === AuditEventType.SecurityIncident
    );
    results.push({
      framework: "中国《网络安全法》",
      checkName: "安全事件报告 (第二十五条)",
      passed: true,
      details: `期间共 ${incidentLogs.length} 次安全事件，均已记录`,
      evidence: incidentLogs.slice(0, 5),
      timestamp: Date.now(),
    });

    return results;
  }

  /**
   * 生成合规报告
   */
  public generateComplianceReport(
    framework: "GDPR" | "中国《网络安全法》" | "SOC2",
    startTime: number,
    endTime: number
  ): ComplianceReport {
    let checks: ComplianceCheckResult[];

    switch (framework) {
      case "GDPR":
        checks = this.checkGDPRCompliance(startTime, endTime);
        break;
      case "中国《网络安全法》":
        checks = this.checkChinaCyberSecurityCompliance(startTime, endTime);
        break;
      case "SOC2":
        checks = this.checkSOC2Compliance(startTime, endTime);
        break;
    }

    const passed = checks.filter((c) => c.passed).length;
    const failed = checks.filter((c) => !c.passed).length;
    const complianceRate = checks.length > 0 ? passed / checks.length : 1;

    let overallStatus: "compliant" | "non_compliant" | "partially_compliant";
    if (complianceRate === 1) {
      overallStatus = "compliant";
    } else if (complianceRate >= 0.8) {
      overallStatus = "partially_compliant";
    } else {
      overallStatus = "non_compliant";
    }

    const recommendations: string[] = [];
    for (const check of checks) {
      if (!check.passed) {
        recommendations.push(
          `[${check.checkName}] ${check.details} — 需要立即修复`
        );
      }
    }

    return {
      generatedAt: Date.now(),
      period: { start: startTime, end: endTime },
      framework,
      overallStatus,
      checks,
      summary: {
        totalChecks: checks.length,
        passed,
        failed,
        complianceRate,
      },
      recommendations,
    };
  }

  /**
   * SOC 2 合规检查
   */
  private checkSOC2Compliance(
    startTime: number,
    endTime: number
  ): ComplianceCheckResult[] {
    const results: ComplianceCheckResult[] = [];
    const periodLogs = this.logs.filter(
      (l) => l.timestamp >= startTime && l.timestamp <= endTime
    );

    // CC6.1: 逻辑和物理访问控制
    const accessLogs = periodLogs.filter(
      (l) =>
        l.eventType === AuditEventType.PermissionCheck ||
        l.eventType === AuditEventType.Authentication
    );
    results.push({
      framework: "SOC 2",
      checkName: "访问控制审计 (CC6.1)",
      passed: accessLogs.length > 0,
      details: `期间共记录 ${accessLogs.length} 次访问控制事件`,
      evidence: accessLogs.slice(0, 5),
      timestamp: Date.now(),
    });

    // CC7.2: 系统监控
    const configChangeLogs = periodLogs.filter(
      (l) => l.eventType === AuditEventType.ConfigChange
    );
    results.push({
      framework: "SOC 2",
      checkName: "系统变更监控 (CC7.2)",
      passed: true,
      details: `期间共 ${configChangeLogs.length} 次配置变更，均已记录`,
      evidence: configChangeLogs.slice(0, 5),
      timestamp: Date.now(),
    });

    // CC8.1: 变更管理
    const approvalLogs = periodLogs.filter(
      (l) => l.eventType === AuditEventType.ApprovalAction
    );
    results.push({
      framework: "SOC 2",
      checkName: "变更审批追踪 (CC8.1)",
      passed: approvalLogs.length > 0,
      details: `期间共 ${approvalLogs.length} 次审批操作`,
      evidence: approvalLogs.slice(0, 5),
      timestamp: Date.now(),
    });

    // 日志完整性验证
    const integrityCheck = this.verifyIntegrity();
    results.push({
      framework: "SOC 2",
      checkName: "审计日志完整性 (CC7.3)",
      passed: integrityCheck.valid,
      details: integrityCheck.details,
      evidence: [],
      timestamp: Date.now(),
    });

    return results;
  }

  /**
   * 执行数据保留策略
   */
  public enforceRetentionPolicies(): {
    deleted: number;
    archived: number;
    anonymized: number;
  } {
    const stats = { deleted: 0, archived: 0, anonymized: 0 };
    const now = Date.now();

    for (const policy of this.retentionPolicies) {
      const cutoffTime = now - policy.retentionDays * 24 * 60 * 60 * 1000;

      const expiredLogs = this.logs.filter(
        (l) =>
          policy.eventTypes.includes(l.eventType) &&
          l.timestamp < cutoffTime
      );

      for (const log of expiredLogs) {
        switch (policy.expirationAction) {
          case "delete":
            stats.deleted++;
            break;
          case "archive":
            stats.archived++;
            break;
          case "anonymize":
            // 匿名化：移除可识别信息但保留统计值
            log.actorId = "anonymized";
            log.sourceIP = undefined;
            log.details = { anonymized: true };
            stats.anonymized++;
            break;
        }
      }

      if (policy.expirationAction === "delete") {
        this.logs = this.logs.filter(
          (l) =>
            !policy.eventTypes.includes(l.eventType) ||
            l.timestamp >= cutoffTime
        );
      }
    }

    return stats;
  }

  /**
   * 查询审计日志
   */
  public queryLogs(filter: {
    eventType?: AuditEventType;
    actorId?: string;
    startTime?: number;
    endTime?: number;
    severity?: AuditSeverity;
    outcome?: string;
    complianceTag?: string;
    limit?: number;
  }): AuditLogEntry[] {
    let results = [...this.logs];

    if (filter.eventType) {
      results = results.filter((l) => l.eventType === filter.eventType);
    }
    if (filter.actorId) {
      results = results.filter((l) => l.actorId === filter.actorId);
    }
    if (filter.startTime) {
      results = results.filter((l) => l.timestamp >= filter.startTime!);
    }
    if (filter.endTime) {
      results = results.filter((l) => l.timestamp <= filter.endTime!);
    }
    if (filter.severity) {
      results = results.filter((l) => l.severity === filter.severity);
    }
    if (filter.outcome) {
      results = results.filter((l) => l.outcome === filter.outcome);
    }
    if (filter.complianceTag) {
      results = results.filter((l) =>
        l.complianceTags.includes(filter.complianceTag!)
      );
    }
    if (filter.limit) {
      results = results.slice(-filter.limit);
    }

    return results;
  }

  /** 获取日志总数 */
  public getLogCount(): number {
    return this.logs.length;
  }

  /** 获取保留策略列表 */
  public getRetentionPolicies(): RetentionPolicy[] {
    return [...this.retentionPolicies];
  }
}
```

> **实现细节**：哈希链的核心思想借鉴了区块链——每条日志记录包含前一条记录的 SHA-256 哈希值。如果攻击者试图修改中间的某条记录，其哈希值会改变，导致后续所有记录的 `previousHash` 校验失败。`verifyIntegrity()` 方法通过遍历整条链来检测篡改。

---

## 14.6 信任评分体系

### 14.6.1 多维度信任评估模型

简单的单一信任分数无法捕捉 Agent 可信度的全部维度。一个 Agent 可能在安全方面表现优秀（从未触发安全告警），但在合规方面存在问题（偶尔访问未经授权的数据）。因此，我们需要一个多维度的信任评分体系。

信任评分由四个维度组成：

| 维度 | 权重 | 评估内容 | 数据来源 |
|------|------|---------|---------|
| 历史表现 | 30% | 任务成功率、操作准确性 | 操作日志 |
| 安全记录 | 30% | 安全事件数、异常行为频率 | 安全监控系统 |
| 合规表现 | 20% | 合规检查通过率、违规次数 | 审计系统 |
| 用户反馈 | 20% | 用户满意度、投诉次数 | 反馈系统 |

### 14.6.2 信任评分引擎实现

```typescript
// trust/trust-score-engine.ts —— 信任评分引擎

/** 信任维度 */
export enum TrustDimension {
  HistoricalPerformance = "historical_performance",
  SecurityRecord = "security_record",
  ComplianceRecord = "compliance_record",
  UserFeedback = "user_feedback",
}

/** 维度评分数据 */
interface DimensionScore {
  dimension: TrustDimension;
  rawScore: number; // 0-100
  weight: number; // 0-1
  weightedScore: number;
  factors: DimensionFactor[];
  lastUpdated: number;
}

/** 维度评分因子 */
interface DimensionFactor {
  name: string;
  value: number;
  impact: "positive" | "negative" | "neutral";
  description: string;
}

/** 信任级别 */
export enum TrustLevel {
  Untrusted = "untrusted",       // 0-20
  Low = "low",                   // 21-40
  Medium = "medium",             // 41-60
  High = "high",                 // 61-80
  VeryHigh = "very_high",        // 81-100
}

/** Agent 信任评分快照 */
interface TrustScoreSnapshot {
  agentId: string;
  overallScore: number;
  trustLevel: TrustLevel;
  dimensions: DimensionScore[];
  timestamp: number;
  trend: "improving" | "stable" | "declining";
}

/** 信任评分历史记录 */
interface TrustScoreHistory {
  agentId: string;
  snapshots: TrustScoreSnapshot[];
}

/** 信任级别转换规则 */
interface TrustLevelTransition {
  from: TrustLevel;
  to: TrustLevel;
  consequences: string[];
  timestamp: number;
}

/** 维度输入数据 */
interface PerformanceData {
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  averageExecutionTimeMs: number;
  errorRate: number;
}

interface SecurityData {
  totalIncidents: number;
  criticalIncidents: number;
  highIncidents: number;
  mediumIncidents: number;
  lowIncidents: number;
  daysSinceLastIncident: number;
  anomalyDetections: number;
}

interface ComplianceData {
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  violations: number;
  dataAccessViolations: number;
}

interface FeedbackData {
  totalFeedback: number;
  positiveFeedback: number;
  negativeFeedback: number;
  complaints: number;
  averageSatisfaction: number; // 1-5
}

/**
 * 信任评分引擎
 *
 * 多维度评估 Agent 可信度：
 * - 四个独立评分维度
 * - 时间衰减机制（近期数据权重更高）
 * - 信任级别自动转换
 * - 评分历史追踪和趋势分析
 * - 可视化数据输出
 */
export class TrustScoreEngine {
  private agentScores: Map<string, DimensionScore[]> = new Map();
  private scoreHistory: Map<string, TrustScoreSnapshot[]> = new Map();
  private levelTransitions: TrustLevelTransition[] = [];

  /** 维度权重配置 */
  private dimensionWeights: Record<TrustDimension, number> = {
    [TrustDimension.HistoricalPerformance]: 0.30,
    [TrustDimension.SecurityRecord]: 0.30,
    [TrustDimension.ComplianceRecord]: 0.20,
    [TrustDimension.UserFeedback]: 0.20,
  };

  /** 时间衰减系数（半衰期，天数） */
  private decayHalfLifeDays: number = 30;

  /**
   * 更新历史表现维度评分
   */
  public updatePerformanceScore(
    agentId: string,
    data: PerformanceData
  ): DimensionScore {
    const factors: DimensionFactor[] = [];

    // 因子1：任务成功率
    const successRate =
      data.totalTasks > 0
        ? data.successfulTasks / data.totalTasks
        : 0;
    factors.push({
      name: "任务成功率",
      value: successRate * 100,
      impact: successRate >= 0.95 ? "positive" : successRate >= 0.8 ? "neutral" : "negative",
      description: `${(successRate * 100).toFixed(1)}% (${data.successfulTasks}/${data.totalTasks})`,
    });

    // 因子2：错误率
    factors.push({
      name: "错误率",
      value: data.errorRate * 100,
      impact: data.errorRate <= 0.02 ? "positive" : data.errorRate <= 0.05 ? "neutral" : "negative",
      description: `${(data.errorRate * 100).toFixed(2)}%`,
    });

    // 因子3：执行效率（与基准比较）
    const efficiencyScore = Math.max(0, 100 - (data.averageExecutionTimeMs / 1000));
    factors.push({
      name: "执行效率",
      value: efficiencyScore,
      impact: efficiencyScore >= 80 ? "positive" : efficiencyScore >= 50 ? "neutral" : "negative",
      description: `平均执行时间 ${(data.averageExecutionTimeMs / 1000).toFixed(1)}s`,
    });

    // 计算维度分数
    const rawScore = Math.min(100, Math.max(0,
      successRate * 60 +                  // 成功率占 60%
      (1 - data.errorRate) * 25 +         // 错误率占 25%
      (efficiencyScore / 100) * 15        // 效率占 15%
    ));

    const dimensionScore: DimensionScore = {
      dimension: TrustDimension.HistoricalPerformance,
      rawScore,
      weight: this.dimensionWeights[TrustDimension.HistoricalPerformance],
      weightedScore: rawScore * this.dimensionWeights[TrustDimension.HistoricalPerformance],
      factors,
      lastUpdated: Date.now(),
    };

    this.updateDimensionScore(agentId, dimensionScore);
    return dimensionScore;
  }

  /**
   * 更新安全记录维度评分
   */
  public updateSecurityScore(
    agentId: string,
    data: SecurityData
  ): DimensionScore {
    const factors: DimensionFactor[] = [];

    // 因子1：安全事件严重程度加权
    const weightedIncidents =
      data.criticalIncidents * 40 +
      data.highIncidents * 20 +
      data.mediumIncidents * 10 +
      data.lowIncidents * 3;

    const incidentPenalty = Math.min(100, weightedIncidents);
    factors.push({
      name: "安全事件评分",
      value: 100 - incidentPenalty,
      impact: incidentPenalty === 0 ? "positive" : incidentPenalty > 50 ? "negative" : "neutral",
      description: `加权安全事件分: ${weightedIncidents} (严重:${data.criticalIncidents}, ` +
                   `高:${data.highIncidents}, 中:${data.mediumIncidents}, 低:${data.lowIncidents})`,
    });

    // 因子2：距上次事件的天数（时间衰减）
    const daysSafe = data.daysSinceLastIncident;
    const recencyBonus = Math.min(30, daysSafe * 0.5);
    factors.push({
      name: "无事件持续天数",
      value: recencyBonus,
      impact: daysSafe >= 30 ? "positive" : daysSafe >= 7 ? "neutral" : "negative",
      description: `距上次安全事件 ${daysSafe} 天`,
    });

    // 因子3：异常检测频率
    const anomalyPenalty = Math.min(30, data.anomalyDetections * 5);
    factors.push({
      name: "异常行为频率",
      value: 30 - anomalyPenalty,
      impact: data.anomalyDetections === 0 ? "positive" : "negative",
      description: `检测到 ${data.anomalyDetections} 次异常行为`,
    });

    const rawScore = Math.min(100, Math.max(0,
      (100 - incidentPenalty) * 0.5 +
      recencyBonus +
      (30 - anomalyPenalty)
    ));

    const dimensionScore: DimensionScore = {
      dimension: TrustDimension.SecurityRecord,
      rawScore,
      weight: this.dimensionWeights[TrustDimension.SecurityRecord],
      weightedScore: rawScore * this.dimensionWeights[TrustDimension.SecurityRecord],
      factors,
      lastUpdated: Date.now(),
    };

    this.updateDimensionScore(agentId, dimensionScore);
    return dimensionScore;
  }

  /**
   * 更新合规记录维度评分
   */
  public updateComplianceScore(
    agentId: string,
    data: ComplianceData
  ): DimensionScore {
    const factors: DimensionFactor[] = [];

    // 因子1：合规检查通过率
    const complianceRate =
      data.totalChecks > 0
        ? data.passedChecks / data.totalChecks
        : 1;
    factors.push({
      name: "合规检查通过率",
      value: complianceRate * 100,
      impact: complianceRate >= 0.95 ? "positive" : complianceRate >= 0.8 ? "neutral" : "negative",
      description: `${(complianceRate * 100).toFixed(1)}% (${data.passedChecks}/${data.totalChecks})`,
    });

    // 因子2：违规次数
    const violationPenalty = Math.min(50, data.violations * 10);
    factors.push({
      name: "违规记录",
      value: 50 - violationPenalty,
      impact: data.violations === 0 ? "positive" : "negative",
      description: `${data.violations} 次违规`,
    });

    // 因子3：数据访问违规
    const dataViolationPenalty = Math.min(30, data.dataAccessViolations * 15);
    factors.push({
      name: "数据访问违规",
      value: 30 - dataViolationPenalty,
      impact: data.dataAccessViolations === 0 ? "positive" : "negative",
      description: `${data.dataAccessViolations} 次数据访问违规`,
    });

    const rawScore = Math.min(100, Math.max(0,
      complianceRate * 50 +
      (50 - violationPenalty) +
      (30 - dataViolationPenalty) - 30
    ));

    const dimensionScore: DimensionScore = {
      dimension: TrustDimension.ComplianceRecord,
      rawScore,
      weight: this.dimensionWeights[TrustDimension.ComplianceRecord],
      weightedScore: rawScore * this.dimensionWeights[TrustDimension.ComplianceRecord],
      factors,
      lastUpdated: Date.now(),
    };

    this.updateDimensionScore(agentId, dimensionScore);
    return dimensionScore;
  }

  /**
   * 更新用户反馈维度评分
   */
  public updateFeedbackScore(
    agentId: string,
    data: FeedbackData
  ): DimensionScore {
    const factors: DimensionFactor[] = [];

    // 因子1：正面反馈比例
    const positiveRate =
      data.totalFeedback > 0
        ? data.positiveFeedback / data.totalFeedback
        : 0.5;
    factors.push({
      name: "正面反馈率",
      value: positiveRate * 100,
      impact: positiveRate >= 0.8 ? "positive" : positiveRate >= 0.5 ? "neutral" : "negative",
      description: `${(positiveRate * 100).toFixed(1)}%`,
    });

    // 因子2：满意度评分
    const satisfactionScore = ((data.averageSatisfaction - 1) / 4) * 100;
    factors.push({
      name: "满意度评分",
      value: satisfactionScore,
      impact: data.averageSatisfaction >= 4 ? "positive" :
              data.averageSatisfaction >= 3 ? "neutral" : "negative",
      description: `${data.averageSatisfaction.toFixed(1)} / 5.0`,
    });

    // 因子3：投诉率
    const complaintRate =
      data.totalFeedback > 0
        ? data.complaints / data.totalFeedback
        : 0;
    const complaintPenalty = Math.min(30, complaintRate * 300);
    factors.push({
      name: "投诉率",
      value: 30 - complaintPenalty,
      impact: complaintRate === 0 ? "positive" : "negative",
      description: `${(complaintRate * 100).toFixed(2)}% (${data.complaints} 次投诉)`,
    });

    const rawScore = Math.min(100, Math.max(0,
      positiveRate * 40 +
      satisfactionScore * 0.3 +
      (30 - complaintPenalty)
    ));

    const dimensionScore: DimensionScore = {
      dimension: TrustDimension.UserFeedback,
      rawScore,
      weight: this.dimensionWeights[TrustDimension.UserFeedback],
      weightedScore: rawScore * this.dimensionWeights[TrustDimension.UserFeedback],
      factors,
      lastUpdated: Date.now(),
    };

    this.updateDimensionScore(agentId, dimensionScore);
    return dimensionScore;
  }

  /**
   * 更新维度评分（内部方法）
   */
  private updateDimensionScore(
    agentId: string,
    newScore: DimensionScore
  ): void {
    let scores = this.agentScores.get(agentId);
    if (!scores) {
      scores = [];
      this.agentScores.set(agentId, scores);
    }

    const existingIndex = scores.findIndex(
      (s) => s.dimension === newScore.dimension
    );

    if (existingIndex >= 0) {
      // 应用时间衰减：新数据和旧数据的混合
      const existing = scores[existingIndex];
      const ageDays = (Date.now() - existing.lastUpdated) / (24 * 60 * 60 * 1000);
      const decayFactor = Math.pow(0.5, ageDays / this.decayHalfLifeDays);

      // 混合评分：新数据 * (1 - decay) + 旧数据 * decay
      newScore.rawScore = newScore.rawScore * (1 - decayFactor * 0.3) +
                          existing.rawScore * decayFactor * 0.3;
      newScore.weightedScore = newScore.rawScore * newScore.weight;

      scores[existingIndex] = newScore;
    } else {
      scores.push(newScore);
    }

    // 记录快照
    this.recordSnapshot(agentId);
  }

  /**
   * 计算 Agent 的综合信任评分
   */
  public calculateOverallScore(agentId: string): TrustScoreSnapshot | null {
    const scores = this.agentScores.get(agentId);
    if (!scores || scores.length === 0) return null;

    const overallScore = scores.reduce(
      (sum, s) => sum + s.weightedScore,
      0
    );

    const trustLevel = this.scoreToLevel(overallScore);

    // 计算趋势
    const history = this.scoreHistory.get(agentId) ?? [];
    let trend: "improving" | "stable" | "declining" = "stable";
    if (history.length >= 3) {
      const recent = history.slice(-3);
      const avgRecent =
        recent.reduce((s, h) => s + h.overallScore, 0) / recent.length;
      if (overallScore > avgRecent + 2) trend = "improving";
      else if (overallScore < avgRecent - 2) trend = "declining";
    }

    return {
      agentId,
      overallScore: Math.round(overallScore * 100) / 100,
      trustLevel,
      dimensions: [...scores],
      timestamp: Date.now(),
      trend,
    };
  }

  /**
   * 将评分转换为信任级别
   */
  private scoreToLevel(score: number): TrustLevel {
    if (score <= 20) return TrustLevel.Untrusted;
    if (score <= 40) return TrustLevel.Low;
    if (score <= 60) return TrustLevel.Medium;
    if (score <= 80) return TrustLevel.High;
    return TrustLevel.VeryHigh;
  }

  /**
   * 记录评分快照
   */
  private recordSnapshot(agentId: string): void {
    const snapshot = this.calculateOverallScore(agentId);
    if (!snapshot) return;

    let history = this.scoreHistory.get(agentId);
    if (!history) {
      history = [];
      this.scoreHistory.set(agentId, history);
    }

    // 检查信任级别是否变化
    if (history.length > 0) {
      const previousLevel = history[history.length - 1].trustLevel;
      if (previousLevel !== snapshot.trustLevel) {
        this.levelTransitions.push({
          from: previousLevel,
          to: snapshot.trustLevel,
          consequences: this.getLevelTransitionConsequences(
            previousLevel,
            snapshot.trustLevel
          ),
          timestamp: Date.now(),
        });
      }
    }

    history.push(snapshot);

    // 保留最近 1000 条快照
    if (history.length > 1000) {
      this.scoreHistory.set(agentId, history.slice(-500));
    }
  }

  /**
   * 获取信任级别变化的后果
   */
  private getLevelTransitionConsequences(
    from: TrustLevel,
    to: TrustLevel
  ): string[] {
    const consequences: string[] = [];
    const levels = [
      TrustLevel.Untrusted,
      TrustLevel.Low,
      TrustLevel.Medium,
      TrustLevel.High,
      TrustLevel.VeryHigh,
    ];

    const fromIndex = levels.indexOf(from);
    const toIndex = levels.indexOf(to);

    if (toIndex < fromIndex) {
      // 降级
      consequences.push("触发权限降级评估");
      if (toIndex <= 1) {
        consequences.push("所有操作需要人工审批");
        consequences.push("限制 API 调用频率");
      }
      if (toIndex === 0) {
        consequences.push("冻结所有自主操作能力");
        consequences.push("启动安全审查流程");
      }
    } else {
      // 升级
      consequences.push("触发权限升级评估");
      if (toIndex >= 3) {
        consequences.push("放宽低风险操作的审批要求");
      }
      if (toIndex === 4) {
        consequences.push("启用自治模式候选评估");
      }
    }

    return consequences;
  }

  /**
   * 获取评分历史（用于可视化）
   */
  public getScoreHistory(
    agentId: string,
    limit?: number
  ): TrustScoreSnapshot[] {
    const history = this.scoreHistory.get(agentId) ?? [];
    return limit ? history.slice(-limit) : [...history];
  }

  /**
   * 获取信任级别转换记录
   */
  public getLevelTransitions(): TrustLevelTransition[] {
    return [...this.levelTransitions];
  }

  /**
   * 生成信任评分仪表板数据
   */
  public generateDashboardData(agentId: string): {
    current: TrustScoreSnapshot | null;
    history: Array<{ timestamp: number; score: number }>;
    dimensionBreakdown: Array<{
      dimension: string;
      score: number;
      weight: number;
      trend: string;
    }>;
    recentTransitions: TrustLevelTransition[];
  } {
    const current = this.calculateOverallScore(agentId);
    const history = (this.scoreHistory.get(agentId) ?? []).map((s) => ({
      timestamp: s.timestamp,
      score: s.overallScore,
    }));

    const dimensionBreakdown = (this.agentScores.get(agentId) ?? []).map((d) => ({
      dimension: d.dimension,
      score: d.rawScore,
      weight: d.weight,
      trend: "stable",
    }));

    const recentTransitions = this.levelTransitions
      .filter((t) => Date.now() - t.timestamp < 30 * 24 * 60 * 60 * 1000)
      .slice(-10);

    return {
      current,
      history,
      dimensionBreakdown,
      recentTransitions,
    };
  }
}
```

> **设计哲学**：信任评分引擎的时间衰减机制（`decayHalfLifeDays = 30`）确保了"近期行为比历史行为更重要"。一个 Agent 在 60 天前犯的错误不应该永远惩罚它——但恢复应该是渐进的。这种衰减函数 `0.5^(age/halfLife)` 借鉴了放射性衰变模型，在安全领域被广泛使用。

---

## 14.7 委托与授权链

### 14.7.1 多 Agent 授权委托模型

在第 9 章讨论的 Multi-Agent 编排架构中，一个协调器 Agent 可能需要将任务委托给专门的子 Agent。这引出了一个关键问题：**子 Agent 应该拥有什么权限？**

简单的做法是让子 Agent 继承协调器的全部权限，但这违反了最小权限原则——一个专门处理数据分析的子 Agent 不应该拥有发送邮件的权限。我们需要一个**授权委托系统**来管理权限的传递和约束。

核心概念：

- **委托**（Delegation）：一个 Agent 将自己权限的子集授予另一个 Agent
- **授权链**（Delegation Chain）：委托可以传递，形成 A → B → C 的链条
- **范围限制**（Scope Restriction）：每次委托都必须缩小（或等于）权限范围
- **链深度限制**：防止无限委托导致的权限追踪困难
- **撤销传播**：撤销委托时，所有下游委托也自动撤销

### 14.7.2 授权链管理器

```typescript
// delegation/delegation-chain-manager.ts —— 授权链管理器

import crypto from "crypto";
import { EventEmitter } from "events";

/** 委托权限范围 */
interface DelegationScope {
  /** 允许的操作类型 */
  allowedActions: string[];
  /** 允许的资源类型 */
  allowedResources: string[];
  /** 最大风险等级 */
  maxRiskLevel: number;
  /** 最大数据敏感度 */
  maxSensitivity: string;
  /** 时间限制（过期时间戳） */
  expiresAt: number;
  /** 最大操作次数 */
  maxOperations?: number;
  /** 自定义约束 */
  customConstraints?: Record<string, unknown>;
}

/** 委托记录 */
interface DelegationRecord {
  id: string;
  /** 委托方（授权者） */
  delegatorId: string;
  /** 被委托方（接收者） */
  delegateeId: string;
  /** 委托的权限范围 */
  scope: DelegationScope;
  /** 父委托 ID（如果是链式委托） */
  parentDelegationId?: string;
  /** 链深度（从根委托开始计数） */
  chainDepth: number;
  /** 状态 */
  status: "active" | "revoked" | "expired" | "exhausted";
  /** 已使用的操作次数 */
  operationsUsed: number;
  /** 创建时间 */
  createdAt: number;
  /** 撤销时间 */
  revokedAt?: number;
  /** 撤销原因 */
  revokedReason?: string;
}

/** 混淆代理检查上下文 */
interface DeputyCheckContext {
  /** 请求方 Agent ID */
  requestingAgentId: string;
  /** 操作目标 */
  targetAction: string;
  /** 目标资源 */
  targetResource: string;
  /** 声称的委托链 */
  claimedDelegationChain: string[];
  /** 操作的风险评分 */
  riskScore: number;
}

/**
 * 授权链管理器
 *
 * 管理 Multi-Agent 系统中的权限委托：
 * - 创建带范围限制的委托
 * - 链式委托（带深度限制）
 * - 撤销传播
 * - 权限验证
 * - 混淆代理检测
 */
export class DelegationChainManager extends EventEmitter {
  private delegations: Map<string, DelegationRecord> = new Map();
  /** 被委托方到委托记录的索引 */
  private delegateeIndex: Map<string, string[]> = new Map();
  /** 委托方到委托记录的索引 */
  private delegatorIndex: Map<string, string[]> = new Map();
  /** 最大链深度 */
  private maxChainDepth: number;

  constructor(maxChainDepth: number = 3) {
    super();
    this.maxChainDepth = maxChainDepth;
  }

  /**
   * 创建委托
   *
   * 验证：
   * 1. 委托方必须拥有要委托的权限
   * 2. 委托范围必须是委托方权限的子集
   * 3. 链深度不能超过限制
   * 4. 委托方不能委托给自己
   */
  public createDelegation(
    delegatorId: string,
    delegateeId: string,
    scope: DelegationScope,
    parentDelegationId?: string
  ): DelegationRecord {
    // 验证1：不能委托给自己
    if (delegatorId === delegateeId) {
      throw new Error("不能将权限委托给自身");
    }

    // 验证2：检查链深度
    let chainDepth = 0;
    if (parentDelegationId) {
      const parentDelegation = this.delegations.get(parentDelegationId);
      if (!parentDelegation) {
        throw new Error(`父委托 ${parentDelegationId} 不存在`);
      }
      if (parentDelegation.status !== "active") {
        throw new Error(`父委托 ${parentDelegationId} 不处于活跃状态`);
      }
      if (parentDelegation.delegateeId !== delegatorId) {
        throw new Error("只能基于自己被授予的委托进行再委托");
      }

      chainDepth = parentDelegation.chainDepth + 1;

      if (chainDepth > this.maxChainDepth) {
        throw new Error(
          `委托链深度 ${chainDepth} 超过最大限制 ${this.maxChainDepth}`
        );
      }

      // 验证3：子委托范围必须是父委托的子集
      this.validateScopeSubset(scope, parentDelegation.scope);
    }

    const record: DelegationRecord = {
      id: crypto.randomUUID(),
      delegatorId,
      delegateeId,
      scope,
      parentDelegationId,
      chainDepth,
      status: "active",
      operationsUsed: 0,
      createdAt: Date.now(),
    };

    // 存储并建立索引
    this.delegations.set(record.id, record);

    const delegateeList = this.delegateeIndex.get(delegateeId) ?? [];
    delegateeList.push(record.id);
    this.delegateeIndex.set(delegateeId, delegateeList);

    const delegatorList = this.delegatorIndex.get(delegatorId) ?? [];
    delegatorList.push(record.id);
    this.delegatorIndex.set(delegatorId, delegatorList);

    this.emit("delegationCreated", record);
    return record;
  }

  /**
   * 验证子委托范围是否是父委托的子集
   */
  private validateScopeSubset(
    childScope: DelegationScope,
    parentScope: DelegationScope
  ): void {
    // 检查操作类型子集
    for (const action of childScope.allowedActions) {
      if (!parentScope.allowedActions.includes(action)) {
        throw new Error(
          `操作 ${action} 不在父委托的允许范围内`
        );
      }
    }

    // 检查资源类型子集
    for (const resource of childScope.allowedResources) {
      if (!parentScope.allowedResources.includes(resource)) {
        throw new Error(
          `资源 ${resource} 不在父委托的允许范围内`
        );
      }
    }

    // 检查风险等级
    if (childScope.maxRiskLevel > parentScope.maxRiskLevel) {
      throw new Error(
        `风险等级 ${childScope.maxRiskLevel} 超过父委托限制 ${parentScope.maxRiskLevel}`
      );
    }

    // 检查过期时间
    if (childScope.expiresAt > parentScope.expiresAt) {
      throw new Error("子委托的过期时间不能晚于父委托");
    }
  }

  /**
   * 验证委托权限
   *
   * 检查某个 Agent 是否通过委托链拥有执行特定操作的权限
   */
  public validateDelegation(
    agentId: string,
    action: string,
    resource: string,
    riskLevel: number
  ): { valid: boolean; delegationId?: string; reason: string } {
    const delegationIds = this.delegateeIndex.get(agentId) ?? [];

    for (const delegationId of delegationIds) {
      const delegation = this.delegations.get(delegationId);
      if (!delegation || delegation.status !== "active") continue;

      // 检查是否过期
      if (Date.now() > delegation.scope.expiresAt) {
        delegation.status = "expired";
        continue;
      }

      // 检查操作次数
      if (
        delegation.scope.maxOperations !== undefined &&
        delegation.operationsUsed >= delegation.scope.maxOperations
      ) {
        delegation.status = "exhausted";
        continue;
      }

      // 检查操作和资源是否在范围内
      if (
        delegation.scope.allowedActions.includes(action) &&
        delegation.scope.allowedResources.includes(resource) &&
        riskLevel <= delegation.scope.maxRiskLevel
      ) {
        // 验证整条委托链
        if (this.validateChain(delegation)) {
          delegation.operationsUsed++;
          return {
            valid: true,
            delegationId: delegation.id,
            reason: `委托链验证通过 (深度: ${delegation.chainDepth})`,
          };
        }
      }
    }

    return {
      valid: false,
      reason: `Agent ${agentId} 没有通过委托获得执行 ${action} 的权限`,
    };
  }

  /**
   * 验证整条委托链的有效性
   */
  private validateChain(delegation: DelegationRecord): boolean {
    let current: DelegationRecord | undefined = delegation;

    while (current) {
      if (current.status !== "active") return false;
      if (Date.now() > current.scope.expiresAt) {
        current.status = "expired";
        return false;
      }

      if (!current.parentDelegationId) break;
      current = this.delegations.get(current.parentDelegationId);
    }

    return true;
  }

  /**
   * 撤销委托（包括所有下游委托）
   */
  public revokeDelegation(
    delegationId: string,
    reason: string
  ): number {
    const delegation = this.delegations.get(delegationId);
    if (!delegation) return 0;

    let revokedCount = 0;

    // 递归撤销所有子委托
    const revokeRecursive = (id: string): void => {
      const record = this.delegations.get(id);
      if (!record || record.status === "revoked") return;

      record.status = "revoked";
      record.revokedAt = Date.now();
      record.revokedReason = reason;
      revokedCount++;

      this.emit("delegationRevoked", record);

      // 查找并撤销所有子委托
      for (const [childId, childRecord] of this.delegations) {
        if (childRecord.parentDelegationId === id) {
          revokeRecursive(childId);
        }
      }
    };

    revokeRecursive(delegationId);
    return revokedCount;
  }

  /**
   * 撤销某个 Agent 的所有委托（出站和入站）
   */
  public revokeAllDelegations(agentId: string, reason: string): number {
    let revokedCount = 0;

    // 撤销作为委托方的所有委托
    const delegatorIds = this.delegatorIndex.get(agentId) ?? [];
    for (const id of delegatorIds) {
      revokedCount += this.revokeDelegation(id, reason);
    }

    // 撤销作为被委托方的所有委托
    const delegateeIds = this.delegateeIndex.get(agentId) ?? [];
    for (const id of delegateeIds) {
      const delegation = this.delegations.get(id);
      if (delegation && delegation.status === "active") {
        delegation.status = "revoked";
        delegation.revokedAt = Date.now();
        delegation.revokedReason = reason;
        revokedCount++;
      }
    }

    return revokedCount;
  }

  /**
   * 获取 Agent 的完整委托链路
   */
  public getDelegationChain(
    delegationId: string
  ): DelegationRecord[] {
    const chain: DelegationRecord[] = [];
    let current = this.delegations.get(delegationId);

    while (current) {
      chain.unshift(current); // 添加到链头
      if (!current.parentDelegationId) break;
      current = this.delegations.get(current.parentDelegationId);
    }

    return chain;
  }

  /**
   * 获取 Agent 被授予的所有活跃委托
   */
  public getActiveDelegationsFor(agentId: string): DelegationRecord[] {
    const delegationIds = this.delegateeIndex.get(agentId) ?? [];
    return delegationIds
      .map((id) => this.delegations.get(id)!)
      .filter((d) => d && d.status === "active");
  }
}
```

### 14.7.3 混淆代理防护

"混淆代理"（Confused Deputy）是一个经典的安全问题：一个拥有高权限的 Agent（代理）被低权限的调用方欺骗，使用自己的权限去执行调用方本不应该能执行的操作。

```typescript
// delegation/confused-deputy-guard.ts —— 混淆代理防护

/**
 * 权限来源标记
 *
 * 每个操作请求都必须携带权限来源标记，
 * 说明"这个权限是谁给我的，用于什么目的"
 */
interface CapabilityToken {
  /** Token ID */
  id: string;
  /** 授权者 */
  issuedBy: string;
  /** 被授权者 */
  issuedTo: string;
  /** 允许的操作 */
  allowedAction: string;
  /** 允许的资源 */
  allowedResource: string;
  /** 过期时间 */
  expiresAt: number;
  /** 用途说明 */
  purpose: string;
  /** 创建时间 */
  createdAt: number;
  /** 签名（防篡改） */
  signature: string;
}

/** 混淆代理检测结果 */
interface ConfusedDeputyCheckResult {
  safe: boolean;
  risk: "none" | "low" | "medium" | "high";
  details: string;
  recommendations: string[];
}

/**
 * 混淆代理防护
 *
 * 通过 Capability Token 机制防止混淆代理攻击：
 * - 每个操作必须携带明确的权限来源
 * - 权限不能被隐式传递
 * - 代理操作必须明确标记为"代理执行"
 */
export class ConfusedDeputyGuard {
  private activeTokens: Map<string, CapabilityToken> = new Map();
  private signingSecret: string;
  private detectionLog: Array<{
    timestamp: number;
    check: ConfusedDeputyCheckResult;
    context: Record<string, unknown>;
  }> = [];

  constructor(signingSecret: string) {
    this.signingSecret = signingSecret;
  }

  /**
   * 创建 Capability Token
   *
   * 明确授予某个 Agent 执行特定操作的权限
   */
  public issueToken(params: {
    issuedBy: string;
    issuedTo: string;
    allowedAction: string;
    allowedResource: string;
    purpose: string;
    ttlMs: number;
  }): CapabilityToken {
    const crypto = require("crypto");
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const expiresAt = createdAt + params.ttlMs;

    const tokenData = {
      id,
      ...params,
      createdAt,
      expiresAt,
    };

    // 计算签名
    const signature = crypto
      .createHmac("sha256", this.signingSecret)
      .update(JSON.stringify(tokenData))
      .digest("hex");

    const token: CapabilityToken = {
      ...tokenData,
      expiresAt,
      signature,
    };

    this.activeTokens.set(id, token);
    return token;
  }

  /**
   * 验证 Capability Token
   */
  public validateToken(
    token: CapabilityToken,
    requestingAgentId: string,
    action: string,
    resource: string
  ): ConfusedDeputyCheckResult {
    const result: ConfusedDeputyCheckResult = {
      safe: false,
      risk: "none",
      details: "",
      recommendations: [],
    };

    // 检查1：Token 是否存在
    const storedToken = this.activeTokens.get(token.id);
    if (!storedToken) {
      result.risk = "high";
      result.details = "Token 不存在或已被撤销";
      result.recommendations.push("检查 Token 来源是否合法");
      this.logDetection(result, { tokenId: token.id, requestingAgentId });
      return result;
    }

    // 检查2：签名验证
    const crypto = require("crypto");
    const { signature, ...tokenData } = storedToken;
    const expectedSignature = crypto
      .createHmac("sha256", this.signingSecret)
      .update(JSON.stringify({ ...tokenData, signature: undefined }))
      .digest("hex");

    if (token.signature !== expectedSignature) {
      result.risk = "high";
      result.details = "Token 签名验证失败，可能被篡改";
      result.recommendations.push("立即撤销此 Token 并调查来源");
      this.logDetection(result, { tokenId: token.id, requestingAgentId });
      return result;
    }

    // 检查3：Token 是否过期
    if (Date.now() > storedToken.expiresAt) {
      result.risk = "medium";
      result.details = "Token 已过期";
      result.recommendations.push("请求新的 Token");
      this.activeTokens.delete(token.id);
      this.logDetection(result, { tokenId: token.id, requestingAgentId });
      return result;
    }

    // 检查4：使用者是否是 Token 的授权对象
    if (storedToken.issuedTo !== requestingAgentId) {
      result.risk = "high";
      result.details =
        `混淆代理检测: Token 签发给 ${storedToken.issuedTo}，` +
        `但 ${requestingAgentId} 试图使用`;
      result.recommendations.push(
        "这可能是混淆代理攻击，需要立即调查",
        "检查请求方是否通过合法委托链获得授权"
      );
      this.logDetection(result, { tokenId: token.id, requestingAgentId });
      return result;
    }

    // 检查5：操作和资源是否匹配
    if (
      storedToken.allowedAction !== action ||
      storedToken.allowedResource !== resource
    ) {
      result.risk = "medium";
      result.details =
        `Token 授权的操作是 ${storedToken.allowedAction} ` +
        `对 ${storedToken.allowedResource}，` +
        `但请求的是 ${action} 对 ${resource}`;
      result.recommendations.push("请求与 Token 授权范围匹配的操作");
      this.logDetection(result, {
        tokenId: token.id,
        requestingAgentId,
        requestedAction: action,
        requestedResource: resource,
      });
      return result;
    }

    // 所有检查通过
    result.safe = true;
    result.risk = "none";
    result.details = "Capability Token 验证通过";
    return result;
  }

  /**
   * 撤销 Token
   */
  public revokeToken(tokenId: string): boolean {
    return this.activeTokens.delete(tokenId);
  }

  /**
   * 撤销某个 Agent 的所有 Token
   */
  public revokeAllTokensFor(agentId: string): number {
    let count = 0;
    for (const [id, token] of this.activeTokens) {
      if (token.issuedTo === agentId || token.issuedBy === agentId) {
        this.activeTokens.delete(id);
        count++;
      }
    }
    return count;
  }

  /**
   * 记录混淆代理检测日志
   */
  private logDetection(
    result: ConfusedDeputyCheckResult,
    context: Record<string, unknown>
  ): void {
    this.detectionLog.push({
      timestamp: Date.now(),
      check: result,
      context,
    });
  }

  /**
   * 获取检测日志
   */
  public getDetectionLog(): typeof this.detectionLog {
    return [...this.detectionLog];
  }
}
```

> **安全警示**：混淆代理攻击在 Multi-Agent 系统中特别危险。想象一个场景：用户 Agent A 向工具 Agent B 发送请求"帮我查询数据库"，但恶意构造请求让 Agent B 用自己的高权限去删除数据。Capability Token 机制要求每个操作都必须携带明确的、不可伪造的权限凭证，从根本上防止了这类攻击。

---

## 14.8 信任架构集成

### 14.8.1 统一信任架构

前面各节分别实现了权限系统、状态机、审批系统、沙箱、审计、信任评分和委托管理。在生产环境中，这些组件不是独立运行的——它们需要被整合到一个统一的信任架构中，通过配置驱动策略，形成一个完整的信任评估和执行管道。

```typescript
// integration/trust-architecture.ts —— 统一信任架构

import { EventEmitter } from "events";
import {
  AgentPermissionSystem,
} from "../core/agent-permission-system";
import {
  DynamicPermissionManager,
} from "../core/dynamic-permission-manager";
import {
  PermissionStateMachine,
  PermissionState,
} from "../core/permission-state-machine";
import {
  HITLOrchestrator,
  ApprovalMode,
  UrgencyLevel,
  ApprovalStatus,
} from "../hitl/hitl-orchestrator";
import { ApprovalAnalytics } from "../hitl/approval-analytics";
import {
  SandboxManager,
  IsolationLevel,
} from "../sandbox/sandbox-manager";
import { ResourceQuotaManager } from "../sandbox/resource-quota-manager";
import {
  ComplianceAuditSystem,
  AuditEventType,
  AuditSeverity,
} from "../audit/compliance-audit-system";
import {
  TrustScoreEngine,
  TrustLevel,
} from "../trust/trust-score-engine";
import { DelegationChainManager } from "../delegation/delegation-chain-manager";
import { ConfusedDeputyGuard } from "../delegation/confused-deputy-guard";

/** 信任架构配置 */
interface TrustArchitectureConfig {
  /** 是否启用动态权限管理 */
  enableDynamicPermissions: boolean;
  /** 是否启用 HITL 审批 */
  enableHITL: boolean;
  /** 是否启用沙箱执行 */
  enableSandbox: boolean;
  /** 是否启用合规审计 */
  enableComplianceAudit: boolean;
  /** 是否启用信任评分 */
  enableTrustScoring: boolean;
  /** 是否启用委托管理 */
  enableDelegation: boolean;
  /** 全局风险阈值（超过此值需要额外审批） */
  globalRiskThreshold: number;
  /** 沙箱风险阈值（超过此值强制沙箱执行） */
  sandboxRiskThreshold: number;
  /** 最大委托链深度 */
  maxDelegationDepth: number;
  /** 审批超时时间（毫秒） */
  defaultApprovalTimeoutMs: number;
  /** 合规框架列表 */
  complianceFrameworks: Array<"GDPR" | "中国《网络安全法》" | "SOC2">;
}

/** 操作执行请求 */
interface ExecutionRequest {
  agentId: string;
  action: string;
  resource: string;
  riskScore: number;
  dataSensitivity: string;
  code?: string;
  delegationTokenId?: string;
  metadata: Record<string, unknown>;
}

/** 操作执行结果 */
interface ExecutionResult {
  requestId: string;
  status: "approved" | "rejected" | "pending_approval" | "executed" | "failed";
  /** 决策管道中各阶段的结果 */
  pipeline: PipelineStageResult[];
  /** 最终输出（如果执行成功） */
  output?: unknown;
  /** 错误信息（如果执行失败） */
  error?: string;
  /** 审计追踪 ID */
  auditTraceId: string;
  /** 总耗时（毫秒） */
  totalDurationMs: number;
}

/** 管道阶段结果 */
interface PipelineStageResult {
  stage: string;
  passed: boolean;
  durationMs: number;
  details: string;
}

/** 信任仪表板数据 */
interface TrustDashboardData {
  /** 系统整体健康度 */
  systemHealth: {
    status: "healthy" | "degraded" | "critical";
    activeAgents: number;
    frozenAgents: number;
    pendingApprovals: number;
    activeSandboxes: number;
    recentIncidents: number;
  };
  /** Agent 信任分布 */
  trustDistribution: Record<TrustLevel, number>;
  /** 权限状态分布 */
  permissionStateDistribution: Record<PermissionState, number>;
  /** 最近 24 小时的操作统计 */
  recentOperations: {
    total: number;
    approved: number;
    rejected: number;
    pendingApproval: number;
  };
  /** 合规状态 */
  complianceStatus: Record<string, "compliant" | "non_compliant" | "partially_compliant">;
  /** 资源使用率 */
  resourceUtilization: {
    cpuUtilization: number;
    memoryUtilization: number;
    sandboxUtilization: number;
  };
}

/**
 * 统一信任架构
 *
 * 整合所有信任相关组件，提供：
 * - 配置驱动的信任策略
 * - 统一的操作执行管道
 * - 运行时信任评估
 * - 信任仪表板数据
 * - 与可观测性系统的集成接口
 */
export class TrustArchitecture extends EventEmitter {
  private config: TrustArchitectureConfig;
  private permissionManager: DynamicPermissionManager;
  private hitlOrchestrator: HITLOrchestrator;
  private approvalAnalytics: ApprovalAnalytics;
  private sandboxManager: SandboxManager;
  private resourceQuotaManager: ResourceQuotaManager;
  private auditSystem: ComplianceAuditSystem;
  private trustScoreEngine: TrustScoreEngine;
  private delegationManager: DelegationChainManager;
  private deputyGuard: ConfusedDeputyGuard;
  private executionCounter: number = 0;

  constructor(config: TrustArchitectureConfig) {
    super();
    this.config = config;

    // 初始化各组件
    this.permissionManager = new DynamicPermissionManager();
    this.hitlOrchestrator = new HITLOrchestrator();
    this.approvalAnalytics = new ApprovalAnalytics();
    this.sandboxManager = new SandboxManager();
    this.resourceQuotaManager = new ResourceQuotaManager();
    this.auditSystem = new ComplianceAuditSystem();
    this.trustScoreEngine = new TrustScoreEngine();
    this.delegationManager = new DelegationChainManager(
      config.maxDelegationDepth
    );
    this.deputyGuard = new ConfusedDeputyGuard(
      process.env.DEPUTY_SIGNING_SECRET ?? "default-secret-change-in-production"
    );

    this.setupEventHandlers();
  }

  /**
   * 设置组件间事件处理器
   */
  private setupEventHandlers(): void {
    // 审批完成后的处理
    this.hitlOrchestrator.on("requestFinalized", (request) => {
      this.auditSystem.log({
        eventType: AuditEventType.ApprovalAction,
        severity:
          request.status === ApprovalStatus.Approved
            ? AuditSeverity.Info
            : AuditSeverity.Warning,
        actorId: request.finalDecision?.decidedBy ?? "system",
        actorType: "user",
        action: `approval_${request.status}`,
        target: {
          type: "approval_request",
          id: request.id,
          name: request.description,
        },
        outcome: request.status === ApprovalStatus.Approved ? "success" : "denied",
        details: {
          agentId: request.agentId,
          action: request.action,
          resource: request.resource,
          decisions: request.decisions,
        },
        complianceTags: ["SOC2", "access_control"],
      });
    });
  }

  /**
   * 执行操作请求
   *
   * 这是信任架构的核心方法——操作请求通过多阶段管道：
   *
   * 1. 审计记录（开始）
   * 2. 委托验证（如果有委托 Token）
   * 3. 权限检查
   * 4. 信任评分评估
   * 5. HITL 审批（如果需要）
   * 6. 沙箱执行（如果需要）
   * 7. 审计记录（结束）
   */
  public async executeRequest(
    request: ExecutionRequest
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    this.executionCounter++;
    const requestId = `req-${this.executionCounter}-${Date.now()}`;
    const pipeline: PipelineStageResult[] = [];
    let auditTraceId = "";

    // 阶段 1：审计记录（开始）
    const auditEntry = this.auditSystem.log({
      eventType: AuditEventType.PermissionCheck,
      severity: AuditSeverity.Info,
      actorId: request.agentId,
      actorType: "agent",
      action: request.action,
      target: {
        type: "resource",
        id: request.resource,
        name: request.resource,
      },
      outcome: "success",
      details: {
        requestId,
        riskScore: request.riskScore,
        dataSensitivity: request.dataSensitivity,
      },
      complianceTags: ["access_control"],
    });
    auditTraceId = auditEntry.id;

    // 阶段 2：委托验证（如果有委托 Token）
    if (request.delegationTokenId && this.config.enableDelegation) {
      const stageStart = Date.now();
      const delegationResult = this.delegationManager.validateDelegation(
        request.agentId,
        request.action,
        request.resource,
        request.riskScore
      );

      pipeline.push({
        stage: "delegation_validation",
        passed: delegationResult.valid,
        durationMs: Date.now() - stageStart,
        details: delegationResult.reason,
      });

      if (!delegationResult.valid) {
        return this.buildResult(
          requestId,
          "rejected",
          pipeline,
          auditTraceId,
          startTime,
          undefined,
          delegationResult.reason
        );
      }
    }

    // 阶段 3：权限检查
    if (this.config.enableDynamicPermissions) {
      const stageStart = Date.now();
      const permResult = this.permissionManager.checkPermission(
        request.agentId,
        request.action as any,
        request.resource as any,
        request.dataSensitivity as any,
        request.riskScore
      );

      pipeline.push({
        stage: "permission_check",
        passed: permResult.allowed || permResult.requiresApproval,
        durationMs: Date.now() - stageStart,
        details: permResult.reason,
      });

      if (!permResult.allowed && !permResult.requiresApproval) {
        this.auditSystem.log({
          eventType: AuditEventType.PermissionCheck,
          severity: AuditSeverity.Warning,
          actorId: request.agentId,
          actorType: "agent",
          action: request.action,
          target: { type: "resource", id: request.resource },
          outcome: "denied",
          details: { reason: permResult.reason, requestId },
          complianceTags: ["access_control"],
        });

        return this.buildResult(
          requestId,
          "rejected",
          pipeline,
          auditTraceId,
          startTime,
          undefined,
          permResult.reason
        );
      }

      // 如果需要审批
      if (permResult.requiresApproval && this.config.enableHITL) {
        const approvalStageStart = Date.now();

        try {
          const approvalRequest =
            await this.hitlOrchestrator.createRequest({
              agentId: request.agentId,
              action: request.action,
              resource: request.resource,
              description: `Agent ${request.agentId} 请求执行 ` +
                          `${request.action} 操作（风险评分: ${request.riskScore}）`,
              urgency: this.riskToUrgency(request.riskScore),
              riskScore: request.riskScore,
              context: request.metadata,
            });

          pipeline.push({
            stage: "hitl_approval",
            passed: false, // 等待审批
            durationMs: Date.now() - approvalStageStart,
            details: `审批请求已创建: ${approvalRequest.id}`,
          });

          return this.buildResult(
            requestId,
            "pending_approval",
            pipeline,
            auditTraceId,
            startTime,
            { approvalRequestId: approvalRequest.id }
          );
        } catch (error) {
          pipeline.push({
            stage: "hitl_approval",
            passed: false,
            durationMs: Date.now() - approvalStageStart,
            details: `审批请求创建失败: ${error}`,
          });

          return this.buildResult(
            requestId,
            "failed",
            pipeline,
            auditTraceId,
            startTime,
            undefined,
            String(error)
          );
        }
      }
    }

    // 阶段 4：信任评分检查
    if (this.config.enableTrustScoring) {
      const stageStart = Date.now();
      const trustSnapshot = this.trustScoreEngine.calculateOverallScore(
        request.agentId
      );

      if (trustSnapshot) {
        const trustOk =
          request.riskScore <= 30 ||
          trustSnapshot.trustLevel !== TrustLevel.Untrusted;

        pipeline.push({
          stage: "trust_score_check",
          passed: trustOk,
          durationMs: Date.now() - stageStart,
          details: `信任评分: ${trustSnapshot.overallScore}, ` +
                   `级别: ${trustSnapshot.trustLevel}`,
        });

        if (!trustOk) {
          return this.buildResult(
            requestId,
            "rejected",
            pipeline,
            auditTraceId,
            startTime,
            undefined,
            "信任评分过低，拒绝执行高风险操作"
          );
        }
      } else {
        pipeline.push({
          stage: "trust_score_check",
          passed: true,
          durationMs: Date.now() - stageStart,
          details: "未找到信任评分记录，跳过检查",
        });
      }
    }

    // 阶段 5：沙箱执行
    if (
      this.config.enableSandbox &&
      request.code &&
      request.riskScore >= this.config.sandboxRiskThreshold
    ) {
      const stageStart = Date.now();

      try {
        const isolationLevel =
          this.sandboxManager.selectIsolationLevel(request.riskScore);
        const sandbox = await this.sandboxManager.createSandbox({
          isolationLevel,
        });

        const result = await this.sandboxManager.execute(
          sandbox.id,
          request.code
        );

        pipeline.push({
          stage: "sandbox_execution",
          passed: result.exitCode === 0,
          durationMs: Date.now() - stageStart,
          details: `沙箱 ${sandbox.id} 执行完成，` +
                   `隔离级别: ${isolationLevel}, ` +
                   `退出码: ${result.exitCode}`,
        });

        await this.sandboxManager.destroySandbox(sandbox.id);

        if (result.exitCode !== 0) {
          return this.buildResult(
            requestId,
            "failed",
            pipeline,
            auditTraceId,
            startTime,
            undefined,
            `沙箱执行失败: ${result.stderr}`
          );
        }

        // 记录审计
        this.auditSystem.log({
          eventType: AuditEventType.SandboxExecution,
          severity: AuditSeverity.Info,
          actorId: request.agentId,
          actorType: "agent",
          action: "sandbox_execute",
          target: { type: "sandbox", id: sandbox.id },
          outcome: "success",
          details: {
            isolationLevel,
            exitCode: result.exitCode,
            durationMs: result.durationMs,
            resourceUsage: result.resourceUsage,
          },
          complianceTags: ["execution_audit"],
        });

        return this.buildResult(
          requestId,
          "executed",
          pipeline,
          auditTraceId,
          startTime,
          { sandboxResult: result }
        );
      } catch (error) {
        pipeline.push({
          stage: "sandbox_execution",
          passed: false,
          durationMs: Date.now() - stageStart,
          details: `沙箱执行异常: ${error}`,
        });

        return this.buildResult(
          requestId,
          "failed",
          pipeline,
          auditTraceId,
          startTime,
          undefined,
          String(error)
        );
      }
    }

    // 所有检查通过，非沙箱操作直接批准
    pipeline.push({
      stage: "final_approval",
      passed: true,
      durationMs: 0,
      details: "所有管道阶段通过，操作已批准",
    });

    // 报告良好行为
    this.permissionManager.reportGoodBehavior(request.agentId, 0.5);

    return this.buildResult(
      requestId,
      "approved",
      pipeline,
      auditTraceId,
      startTime,
      { approved: true }
    );
  }

  /**
   * 构建执行结果
   */
  private buildResult(
    requestId: string,
    status: ExecutionResult["status"],
    pipeline: PipelineStageResult[],
    auditTraceId: string,
    startTime: number,
    output?: unknown,
    error?: string
  ): ExecutionResult {
    return {
      requestId,
      status,
      pipeline,
      output,
      error,
      auditTraceId,
      totalDurationMs: Date.now() - startTime,
    };
  }

  /**
   * 将风险评分转换为紧急级别
   */
  private riskToUrgency(riskScore: number): UrgencyLevel {
    if (riskScore >= 80) return UrgencyLevel.Critical;
    if (riskScore >= 60) return UrgencyLevel.High;
    if (riskScore >= 30) return UrgencyLevel.Medium;
    return UrgencyLevel.Low;
  }

  /**
   * 生成信任仪表板数据
   */
  public generateDashboardData(): TrustDashboardData {
    const activeSandboxes = this.sandboxManager.getActiveSandboxes();
    const pendingApprovals = this.hitlOrchestrator.getPendingRequests();
    const utilization = this.resourceQuotaManager.getUtilization();

    // 合规状态检查
    const now = Date.now();
    const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;
    const complianceStatus: Record<string, "compliant" | "non_compliant" | "partially_compliant"> = {};

    for (const framework of this.config.complianceFrameworks) {
      const report = this.auditSystem.generateComplianceReport(
        framework,
        oneMonthAgo,
        now
      );
      complianceStatus[framework] = report.overallStatus;
    }

    // 最近安全事件
    const recentIncidents = this.auditSystem.queryLogs({
      eventType: AuditEventType.SecurityIncident,
      startTime: now - 24 * 60 * 60 * 1000,
    });

    return {
      systemHealth: {
        status: recentIncidents.length > 5 ? "critical" :
                recentIncidents.length > 0 ? "degraded" : "healthy",
        activeAgents: 0, // 从权限管理器获取
        frozenAgents: 0,
        pendingApprovals: pendingApprovals.length,
        activeSandboxes: activeSandboxes.length,
        recentIncidents: recentIncidents.length,
      },
      trustDistribution: {
        [TrustLevel.Untrusted]: 0,
        [TrustLevel.Low]: 0,
        [TrustLevel.Medium]: 0,
        [TrustLevel.High]: 0,
        [TrustLevel.VeryHigh]: 0,
      },
      permissionStateDistribution: {
        [PermissionState.Autonomous]: 0,
        [PermissionState.Supervised]: 0,
        [PermissionState.Restricted]: 0,
        [PermissionState.Frozen]: 0,
      },
      recentOperations: {
        total: this.executionCounter,
        approved: 0,
        rejected: 0,
        pendingApproval: pendingApprovals.length,
      },
      complianceStatus,
      resourceUtilization: utilization,
    };
  }

  /**
   * 获取各子系统的引用（用于直接配置和高级操作）
   */
  public getSubsystems(): {
    permissionManager: DynamicPermissionManager;
    hitlOrchestrator: HITLOrchestrator;
    approvalAnalytics: ApprovalAnalytics;
    sandboxManager: SandboxManager;
    resourceQuotaManager: ResourceQuotaManager;
    auditSystem: ComplianceAuditSystem;
    trustScoreEngine: TrustScoreEngine;
    delegationManager: DelegationChainManager;
    deputyGuard: ConfusedDeputyGuard;
  } {
    return {
      permissionManager: this.permissionManager,
      hitlOrchestrator: this.hitlOrchestrator,
      approvalAnalytics: this.approvalAnalytics,
      sandboxManager: this.sandboxManager,
      resourceQuotaManager: this.resourceQuotaManager,
      auditSystem: this.auditSystem,
      trustScoreEngine: this.trustScoreEngine,
      delegationManager: this.delegationManager,
      deputyGuard: this.deputyGuard,
    };
  }

  /** 销毁架构（释放所有资源） */
  public destroy(): void {
    this.permissionManager.destroy();
    this.hitlOrchestrator.destroy();
    this.removeAllListeners();
  }
}
```

### 14.8.2 使用示例

以下是一个完整的信任架构使用示例，展示了从初始化到执行操作的完整流程：

```typescript
// examples/trust-architecture-usage.ts —— 信任架构使用示例

import { TrustArchitecture } from "../integration/trust-architecture";
import { AgentRole } from "../types/permission";
import { UrgencyLevel, ApprovalMode } from "../hitl/hitl-orchestrator";

async function main(): Promise<void> {
  // 1. 创建信任架构实例
  const trustArch = new TrustArchitecture({
    enableDynamicPermissions: true,
    enableHITL: true,
    enableSandbox: true,
    enableComplianceAudit: true,
    enableTrustScoring: true,
    enableDelegation: true,
    globalRiskThreshold: 50,
    sandboxRiskThreshold: 40,
    maxDelegationDepth: 3,
    defaultApprovalTimeoutMs: 30 * 60 * 1000, // 30分钟
    complianceFrameworks: ["GDPR", "中国《网络安全法》", "SOC2"],
  });

  const subsystems = trustArch.getSubsystems();

  // 2. 注册 Agent
  subsystems.permissionManager.registerAgent(
    "data-analyst-agent",
    AgentRole.Writer
  );
  subsystems.permissionManager.registerAgent(
    "email-agent",
    AgentRole.Writer
  );

  // 3. 初始化信任评分
  subsystems.trustScoreEngine.updatePerformanceScore(
    "data-analyst-agent",
    {
      totalTasks: 150,
      successfulTasks: 145,
      failedTasks: 5,
      averageExecutionTimeMs: 2500,
      errorRate: 0.033,
    }
  );

  subsystems.trustScoreEngine.updateSecurityScore(
    "data-analyst-agent",
    {
      totalIncidents: 1,
      criticalIncidents: 0,
      highIncidents: 0,
      mediumIncidents: 1,
      lowIncidents: 0,
      daysSinceLastIncident: 45,
      anomalyDetections: 2,
    }
  );

  // 4. 配置 HITL 审批链
  subsystems.hitlOrchestrator.configureDefaultChain(
    UrgencyLevel.Medium,
    {
      mode: ApprovalMode.Quorum,
      approvers: [
        {
          id: "reviewer-1",
          name: "张安全",
          email: "zhang@example.com",
          role: "security_reviewer",
          level: 2,
        },
        {
          id: "reviewer-2",
          name: "李合规",
          email: "li@example.com",
          role: "compliance_reviewer",
          level: 2,
        },
        {
          id: "reviewer-3",
          name: "王运维",
          email: "wang@example.com",
          role: "ops_reviewer",
          level: 1,
        },
      ],
      quorumRatio: 0.67, // 2/3 通过即可
      timeoutMs: 30 * 60 * 1000,
      timeoutAction: "escalate",
      escalationApprover: {
        id: "admin-1",
        name: "赵管理",
        email: "zhao@example.com",
        role: "admin",
        level: 5,
      },
    }
  );

  // 5. 执行低风险操作（直接通过）
  console.log("=== 低风险操作 ===");
  const lowRiskResult = await trustArch.executeRequest({
    agentId: "data-analyst-agent",
    action: "read",
    resource: "database",
    riskScore: 15,
    dataSensitivity: "internal",
    metadata: { query: "SELECT count(*) FROM orders" },
  });
  console.log(`状态: ${lowRiskResult.status}`);
  console.log(`管道: ${lowRiskResult.pipeline.map(
    (p) => `${p.stage}:${p.passed ? "通过" : "未通过"}`
  ).join(" -> ")}`);

  // 6. 执行中风险操作（可能需要审批）
  console.log("\n=== 中风险操作 ===");
  const medRiskResult = await trustArch.executeRequest({
    agentId: "data-analyst-agent",
    action: "write",
    resource: "database",
    riskScore: 55,
    dataSensitivity: "confidential",
    metadata: { operation: "UPDATE user SET status = 'inactive'" },
  });
  console.log(`状态: ${medRiskResult.status}`);

  // 7. 执行需要沙箱的操作
  console.log("\n=== 沙箱执行 ===");
  const sandboxResult = await trustArch.executeRequest({
    agentId: "data-analyst-agent",
    action: "execute",
    resource: "api",
    riskScore: 45,
    dataSensitivity: "internal",
    code: `
      const result = await fetch("https://api.example.com/data");
      return result.json();
    `,
    metadata: { purpose: "获取外部数据" },
  });
  console.log(`状态: ${sandboxResult.status}`);

  // 8. 生成仪表板数据
  console.log("\n=== 仪表板数据 ===");
  const dashboard = trustArch.generateDashboardData();
  console.log(`系统健康状态: ${dashboard.systemHealth.status}`);
  console.log(`待审批数: ${dashboard.systemHealth.pendingApprovals}`);
  console.log(`资源使用率: CPU ${(dashboard.resourceUtilization.cpuUtilization * 100).toFixed(1)}%`);

  // 9. 生成合规报告
  console.log("\n=== 合规报告 ===");
  const now = Date.now();
  const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;
  const gdprReport = subsystems.auditSystem.generateComplianceReport(
    "GDPR",
    oneMonthAgo,
    now
  );
  console.log(`GDPR 合规状态: ${gdprReport.overallStatus}`);
  console.log(`检查项: ${gdprReport.summary.passed}/${gdprReport.summary.totalChecks} 通过`);

  // 10. 验证审计日志完整性
  const integrity = subsystems.auditSystem.verifyIntegrity();
  console.log(`\n审计日志完整性: ${integrity.valid ? "通过" : "失败"}`);
  console.log(integrity.details);

  // 清理
  trustArch.destroy();
}

main().catch(console.error);
```

> **与第 17 章的预告**：`TrustArchitecture` 的 `generateDashboardData()` 方法输出的数据模型，将在第 17 章"可观测性与监控"中被可视化——接入 Grafana 或自定义仪表板，让运维团队能够实时监控 Agent 系统的信任状态。

---

## 14.9 本章小结

本章构建了一套完整的 Agent 信任架构体系，从零信任原则出发，覆盖了权限管理、人机协作、沙箱隔离、合规审计、信任评分和委托授权六大领域。以下是本章的十个核心要点：

### 核心要点

**1. 零信任是 Agent 安全的基石**

传统的"信任边界"模型不适用于 Agent 系统。Agent 的行为不可完全预测，工具调用具有真实的副作用，攻击面随时可能因 Prompt 注入而变化。零信任原则要求我们"永不默认信任，始终验证"——每次操作都需要经过权限检查，而不是基于"这个 Agent 已经通过了初始认证"就放行所有请求。

**2. RBAC + ABAC 混合模型提供灵活的权限控制**

单纯的角色权限无法应对 Agent 系统的动态需求。`AgentPermissionSystem` 通过 RBAC 定义基线权限（角色四级：Reader → Writer → Admin → Autonomous），通过 ABAC 在运行时根据上下文动态调整（时间窗口、风险评分、数据敏感度、信任评分）。这种混合模型既保证了可管理性，又提供了细粒度的控制能力。

**3. 权限状态机实现动态升降级**

`PermissionStateMachine` 定义了四种权限状态（autonomous → supervised → restricted → frozen），支持基于规则的自动状态转换。关键设计是**升级困难、降级容易**——升级到自治模式需要连续 30 天无事件且信任评分 90 以上，但一次异常就能触发从自治到受限的紧急降级。这种非对称性体现了"安全优先"的设计理念。

**4. HITL 系统需要避免审批疲劳**

`HITLOrchestrator` 支持三种审批模式（顺序、并行、仲裁），配合超时处理和自动升级机制。`ApprovalAnalytics` 通过分析审批数据来检测瓶颈——当通过率持续高于 95% 时，这通常意味着审批人没有认真审核，需要提高审批触发阈值而非增加更多审批。好的 HITL 系统应该让审批人专注于真正需要判断的高风险决策。

**5. 多级沙箱隔离匹配不同风险等级**

`SandboxManager` 提供四种隔离级别（Process → Container → VM → CloudFunction），根据操作风险自动选择。`ResourceQuotaManager` 通过全局资源池和等待队列确保多 Agent 并发时的资源公平分配。核心原则是**隔离越强、开销越大**，因此只有真正的高风险操作才使用 VM 或云函数隔离。

**6. 防篡改审计日志是合规的生命线**

`ComplianceAuditSystem` 使用 SHA-256 哈希链确保审计日志不可篡改。任何对中间记录的修改都会导致后续所有记录的哈希校验失败。系统内置了 GDPR、中国《网络安全法》和 SOC 2 三套合规检查框架，并支持自动化报告生成和数据保留策略管理。

**7. 多维度信任评分比单一分数更有价值**

`TrustScoreEngine` 从四个维度（历史表现、安全记录、合规表现、用户反馈）评估 Agent 可信度，每个维度由多个因子加权计算。时间衰减机制（半衰期 30 天）确保近期表现比历史数据更重要，支持 Agent 在改正错误后逐步恢复信任。

**8. 委托授权必须遵循"只能缩小"原则**

在 Multi-Agent 系统中（参见第 9 章），权限委托不可避免。`DelegationChainManager` 确保每次再委托都只能缩小或等于原有权限范围，并通过链深度限制（默认 3 层）防止权限追踪困难。撤销操作会沿委托链向下传播，确保安全事件发生时能快速切断所有相关权限。

**9. 混淆代理防护是 Multi-Agent 安全的关键**

`ConfusedDeputyGuard` 通过 Capability Token 机制防止"借刀杀人"攻击——每个操作请求都必须携带不可伪造的、由授权者签发的凭证，明确标记"谁授权了这个操作、用于什么目的"。这从根本上防止了低权限 Agent 通过高权限 Agent 间接执行未授权操作。

**10. 统一信任架构提供端到端的信任管道**

`TrustArchitecture` 将所有组件整合为一个统一的执行管道：委托验证 → 权限检查 → 信任评分 → HITL 审批 → 沙箱执行，每个阶段都有独立的通过/拒绝判定。配置驱动的策略允许根据业务场景灵活启用或禁用各个阶段。仪表板数据模型为后续的可观测性集成（第 17 章）打下基础。

### 与后续章节的关系

本章构建的信任架构是 Part 7"生产部署"的前置基础：

- **第 15 章（Agent 测试策略）**：信任架构中的各组件（权限检查、审批流程、沙箱执行）都需要完善的测试覆盖，第 15 章将介绍如何对这些安全关键组件进行有效测试
- **第 16 章（性能优化）**：信任管道的多阶段检查会引入延迟，第 16 章将讨论如何在安全和性能之间取得平衡
- **第 17 章（可观测性与监控）**：`TrustArchitecture.generateDashboardData()` 输出的数据将在第 17 章中被接入可观测性平台，实现实时的信任状态监控
- **第 18 章（CI/CD 与部署）**：信任架构的配置管理和更新将作为持续部署流水线的一部分

信任架构不是一次性构建的静态系统，它需要随着业务发展和威胁变化持续演进。最重要的原则始终是：**在不确定的世界中，用确定的架构约束不确定的行为**。
