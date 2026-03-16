# 第 21 章：Agent 生态与平台

> **"单个 Agent 是工具，Agent 平台是基础设施，Agent 生态是护城河。"**

在前面的章节中，我们深入探讨了 Agent 的核心能力——从记忆、规划到工具调用。第 20 章介绍了 Agent 互操作协议，为 Agent 之间的通信奠定了基础。本章将视角拉高到**平台级别**，探讨如何构建一个完整的 Agent 生态系统：从平台架构、注册发现、应用市场，到企业级集成模式。

本章的核心问题是：**如何让成百上千个 Agent 在一个统一的平台上协同运作，同时满足企业级的安全、合规和可扩展性要求？**

我们将构建以下关键组件：

- **Agent 平台架构**：运行时、注册中心、网关、监控的完整生命周期管理
- **注册与发现**：企业级的 Agent 注册、健康检查和能力发现机制
- **Agent Marketplace**：包含安全审查、依赖管理和计费模型的应用市场
- **平台适配器**：连接 Slack、Teams、Email 等多个外部平台的统一适配层
- **Agent Mesh**：借鉴服务网格思想的 Agent 通信基础设施
- **模型网关**：统一多模型提供商访问的中心化网关
- **编排平台**：低代码/无代码的 Agent 工作流引擎
- **企业集成**：SSO、数据治理、合规审计的企业级集成模式

---

## 21.1 Agent 平台架构

### 21.1.1 平台全景

一个生产级 Agent 平台由以下核心组件构成：

```
┌─────────────────────────────────────────────────────────────────┐
│                      Agent 平台全景图                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Web 控制台│  │ CLI 工具 │  │  SDK     │  │ REST API │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       └──────────────┴──────────────┴──────────────┘            │
│                          │                                      │
│  ┌───────────────────────▼───────────────────────────┐         │
│  │              API Gateway / 负载均衡                 │         │
│  └───────────────────────┬───────────────────────────┘         │
│                          │                                      │
│  ┌───────────┬───────────┼───────────┬───────────┐             │
│  ▼           ▼           ▼           ▼           ▼             │
│ ┌─────┐  ┌─────┐  ┌──────────┐ ┌─────┐  ┌──────────┐        │
│ │注册  │  │编排  │  │模型网关  │ │Mesh │  │Marketplace│        │
│ │中心  │  │引擎  │  │         │ │控制面│  │          │        │
│ └──┬──┘  └──┬──┘  └────┬─────┘ └──┬──┘  └────┬─────┘        │
│    │        │          │          │           │               │
│  ┌─▼────────▼──────────▼──────────▼───────────▼─────┐        │
│  │              Agent 运行时 (Runtime)                │        │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   │        │
│  │  │Agent │ │Agent │ │Agent │ │Agent │ │Agent │   │        │
│  │  │  A   │ │  B   │ │  C   │ │  D   │ │  E   │   │        │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘   │        │
│  └───────────────────────┬───────────────────────────┘        │
│                          │                                     │
│  ┌───────────────────────▼───────────────────────────┐        │
│  │           监控 / 日志 / 审计 / 告警                 │        │
│  └───────────────────────────────────────────────────┘        │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 21.1.2 平台核心类型定义

```typescript
// ============================================================
// 平台核心类型定义
// ============================================================

/** 平台组件的统一生命周期接口 */
interface Lifecycle {
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
  getStatus(): ComponentStatus;
}

/** 组件状态枚举 */
enum ComponentStatus {
  CREATED = 'created',
  INITIALIZING = 'initializing',
  INITIALIZED = 'initialized',
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  ERROR = 'error',
  DESTROYED = 'destroyed',
}

/** 平台配置接口 */
interface PlatformConfig {
  name: string;
  version: string;
  environment: 'development' | 'staging' | 'production';
  region: string;
  components: ComponentConfig[];
  multiTenancy: MultiTenancyConfig;
  monitoring: MonitoringConfig;
  security: SecurityConfig;
}

/** 组件配置 */
interface ComponentConfig {
  name: string;
  type: ComponentType;
  enabled: boolean;
  config: Record<string, unknown>;
  dependencies: string[];
  healthCheck: HealthCheckConfig;
}

/** 组件类型枚举 */
enum ComponentType {
  RUNTIME = 'runtime',
  REGISTRY = 'registry',
  GATEWAY = 'gateway',
  MESH = 'mesh',
  MARKETPLACE = 'marketplace',
  ORCHESTRATOR = 'orchestrator',
  MONITOR = 'monitor',
  ADAPTER = 'adapter',
}

/** 健康检查配置 */
interface HealthCheckConfig {
  enabled: boolean;
  intervalMs: number;
  timeoutMs: number;
  unhealthyThreshold: number;
  healthyThreshold: number;
}

/** 多租户配置 */
interface MultiTenancyConfig {
  enabled: boolean;
  isolationLevel: 'namespace' | 'process' | 'container';
  resourceQuotas: ResourceQuotas;
  defaultTenantConfig: TenantConfig;
}

/** 资源配额 */
interface ResourceQuotas {
  maxAgentsPerTenant: number;
  maxRequestsPerMinute: number;
  maxConcurrentExecutions: number;
  maxStorageMB: number;
  maxModelCallsPerDay: number;
}

/** 租户配置 */
interface TenantConfig {
  tenantId: string;
  name: string;
  tier: 'free' | 'pro' | 'enterprise';
  quotas: ResourceQuotas;
  allowedModels: string[];
  allowedCapabilities: string[];
  dataResidency: string;
  encryptionKey?: string;
}

/** 监控配置 */
interface MonitoringConfig {
  metricsEnabled: boolean;
  tracingEnabled: boolean;
  loggingLevel: 'debug' | 'info' | 'warn' | 'error';
  metricsExporter: 'prometheus' | 'datadog' | 'cloudwatch';
  tracingExporter: 'jaeger' | 'zipkin' | 'otel';
  alertRules: AlertRule[];
}

/** 告警规则 */
interface AlertRule {
  name: string;
  metric: string;
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  windowSeconds: number;
  severity: 'info' | 'warning' | 'critical';
  channels: string[];
}

/** 安全配置 */
interface SecurityConfig {
  authProvider: 'oauth2' | 'saml' | 'oidc' | 'apikey';
  encryptionAtRest: boolean;
  encryptionInTransit: boolean;
  auditLogging: boolean;
  rateLimiting: RateLimitConfig;
  dlp: DLPConfig;
}

/** 限流配置 */
interface RateLimitConfig {
  enabled: boolean;
  defaultRpm: number;
  burstSize: number;
  perTenantLimits: Map<string, number>;
}

/** 数据防泄漏配置 */
interface DLPConfig {
  enabled: boolean;
  patterns: DLPPattern[];
  action: 'block' | 'mask' | 'log';
}

/** DLP 模式 */
interface DLPPattern {
  name: string;
  regex: string;
  category: 'pii' | 'credentials' | 'financial' | 'health';
  severity: 'low' | 'medium' | 'high' | 'critical';
}
```

### 21.1.3 AgentPlatform 核心实现

```typescript
// ============================================================
// AgentPlatform：平台核心，管理所有组件的生命周期
// ============================================================

import { EventEmitter } from 'events';

type PlatformEventType =
  | 'component:registered'
  | 'component:started'
  | 'component:stopped'
  | 'component:error'
  | 'platform:ready'
  | 'platform:shutdown'
  | 'tenant:created'
  | 'tenant:removed';

interface PlatformEvent {
  type: PlatformEventType;
  component?: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

class AgentPlatform implements Lifecycle {
  private config: PlatformConfig;
  private components = new Map<string, ManagedComponent>();
  private status: ComponentStatus = ComponentStatus.CREATED;
  private eventBus = new EventEmitter();
  private tenantManager: TenantManager;
  private healthChecker: PlatformHealthChecker;
  private startOrder: string[] = [];

  constructor(config: PlatformConfig) {
    this.config = config;
    this.tenantManager = new TenantManager(config.multiTenancy);
    this.healthChecker = new PlatformHealthChecker(this.components);
  }

  /** 注册平台组件 */
  registerComponent(name: string, component: Lifecycle, config: ComponentConfig): void {
    if (this.components.has(name)) {
      throw new Error(`组件 '${name}' 已注册`);
    }

    const managed: ManagedComponent = {
      name,
      component,
      config,
      status: ComponentStatus.CREATED,
      startedAt: null,
      metrics: { requestCount: 0, errorCount: 0, avgLatencyMs: 0 },
    };

    this.components.set(name, managed);
    this.emit({ type: 'component:registered', component: name, timestamp: Date.now() });
  }

  /** 初始化平台：解析依赖、确定启动顺序 */
  async initialize(): Promise<void> {
    this.status = ComponentStatus.INITIALIZING;
    console.log(`[Platform] 初始化平台 "${this.config.name}" v${this.config.version}`);

    // 拓扑排序，解析组件启动顺序
    this.startOrder = this.resolveStartOrder();
    console.log(`[Platform] 组件启动顺序: ${this.startOrder.join(' → ')}`);

    // 按顺序初始化每个组件
    for (const name of this.startOrder) {
      const managed = this.components.get(name)!;
      if (!managed.config.enabled) {
        console.log(`[Platform] 跳过禁用组件: ${name}`);
        continue;
      }
      try {
        console.log(`[Platform] 初始化组件: ${name}`);
        await managed.component.initialize();
        managed.status = ComponentStatus.INITIALIZED;
      } catch (error) {
        managed.status = ComponentStatus.ERROR;
        this.emit({
          type: 'component:error',
          component: name,
          timestamp: Date.now(),
          data: { error: String(error) },
        });
        throw new Error(`组件 '${name}' 初始化失败: ${error}`);
      }
    }

    // 初始化租户管理器
    await this.tenantManager.initialize();

    this.status = ComponentStatus.INITIALIZED;
    console.log('[Platform] 所有组件初始化完成');
  }

  /** 启动平台 */
  async start(): Promise<void> {
    this.status = ComponentStatus.STARTING;
    console.log('[Platform] 启动平台...');

    for (const name of this.startOrder) {
      const managed = this.components.get(name)!;
      if (!managed.config.enabled) continue;

      try {
        console.log(`[Platform] 启动组件: ${name}`);
        await managed.component.start();
        managed.status = ComponentStatus.RUNNING;
        managed.startedAt = Date.now();
        this.emit({ type: 'component:started', component: name, timestamp: Date.now() });
      } catch (error) {
        managed.status = ComponentStatus.ERROR;
        this.emit({
          type: 'component:error',
          component: name,
          timestamp: Date.now(),
          data: { error: String(error) },
        });
        // 启动失败时回滚已启动的组件
        await this.rollbackStart(name);
        throw new Error(`组件 '${name}' 启动失败: ${error}`);
      }
    }

    // 启动健康检查
    this.healthChecker.start();

    this.status = ComponentStatus.RUNNING;
    this.emit({ type: 'platform:ready', timestamp: Date.now() });
    console.log('[Platform] 平台启动完成，所有组件运行中');
  }

  /** 停止平台（逆序关闭组件） */
  async stop(): Promise<void> {
    this.status = ComponentStatus.STOPPING;
    console.log('[Platform] 停止平台...');

    this.healthChecker.stop();

    const reverseOrder = [...this.startOrder].reverse();
    for (const name of reverseOrder) {
      const managed = this.components.get(name)!;
      if (managed.status !== ComponentStatus.RUNNING) continue;

      try {
        console.log(`[Platform] 停止组件: ${name}`);
        await managed.component.stop();
        managed.status = ComponentStatus.STOPPED;
        this.emit({ type: 'component:stopped', component: name, timestamp: Date.now() });
      } catch (error) {
        console.error(`[Platform] 停止组件 '${name}' 失败: ${error}`);
        managed.status = ComponentStatus.ERROR;
      }
    }

    this.status = ComponentStatus.STOPPED;
    this.emit({ type: 'platform:shutdown', timestamp: Date.now() });
    console.log('[Platform] 平台已停止');
  }

  /** 销毁平台，释放所有资源 */
  async destroy(): Promise<void> {
    if (this.status === ComponentStatus.RUNNING) {
      await this.stop();
    }

    for (const [name, managed] of this.components) {
      try {
        await managed.component.destroy();
        managed.status = ComponentStatus.DESTROYED;
      } catch (error) {
        console.error(`[Platform] 销毁组件 '${name}' 失败: ${error}`);
      }
    }

    this.components.clear();
    this.eventBus.removeAllListeners();
    this.status = ComponentStatus.DESTROYED;
  }

  getStatus(): ComponentStatus {
    return this.status;
  }

  /** 获取所有组件的健康状态 */
  getHealthReport(): PlatformHealthReport {
    const componentReports: ComponentHealthReport[] = [];

    for (const [name, managed] of this.components) {
      componentReports.push({
        name,
        status: managed.status,
        uptime: managed.startedAt ? Date.now() - managed.startedAt : 0,
        metrics: { ...managed.metrics },
      });
    }

    return {
      platform: this.config.name,
      version: this.config.version,
      status: this.status,
      environment: this.config.environment,
      components: componentReports,
      timestamp: Date.now(),
    };
  }

  /** 获取租户管理器 */
  getTenantManager(): TenantManager {
    return this.tenantManager;
  }

  /** 注册事件监听 */
  on(event: PlatformEventType, handler: (e: PlatformEvent) => void): void {
    this.eventBus.on(event, handler);
  }

  // ---- 私有方法 ----

  private emit(event: PlatformEvent): void {
    this.eventBus.emit(event.type, event);
  }

  /** 拓扑排序解析启动顺序 */
  private resolveStartOrder(): string[] {
    const visited = new Set<string>();
    const order: string[] = [];
    const visiting = new Set<string>();

    const visit = (name: string) => {
      if (visited.has(name)) return;
      if (visiting.has(name)) {
        throw new Error(`检测到循环依赖，涉及组件: ${name}`);
      }

      visiting.add(name);

      const managed = this.components.get(name);
      if (!managed) throw new Error(`未知组件: ${name}`);

      for (const dep of managed.config.dependencies) {
        visit(dep);
      }

      visiting.delete(name);
      visited.add(name);
      order.push(name);
    };

    for (const name of this.components.keys()) {
      visit(name);
    }

    return order;
  }

  /** 回滚：停止已经启动的组件 */
  private async rollbackStart(failedComponent: string): Promise<void> {
    console.log(`[Platform] 回滚启动，原因: 组件 '${failedComponent}' 失败`);

    const idx = this.startOrder.indexOf(failedComponent);
    const toRollback = this.startOrder.slice(0, idx).reverse();

    for (const name of toRollback) {
      const managed = this.components.get(name)!;
      if (managed.status === ComponentStatus.RUNNING) {
        try {
          await managed.component.stop();
          managed.status = ComponentStatus.STOPPED;
        } catch (e) {
          console.error(`[Platform] 回滚停止 '${name}' 失败: ${e}`);
        }
      }
    }
  }
}

/** 被管理的组件包装 */
interface ManagedComponent {
  name: string;
  component: Lifecycle;
  config: ComponentConfig;
  status: ComponentStatus;
  startedAt: number | null;
  metrics: ComponentMetrics;
}

interface ComponentMetrics {
  requestCount: number;
  errorCount: number;
  avgLatencyMs: number;
}

interface PlatformHealthReport {
  platform: string;
  version: string;
  status: ComponentStatus;
  environment: string;
  components: ComponentHealthReport[];
  timestamp: number;
}

interface ComponentHealthReport {
  name: string;
  status: ComponentStatus;
  uptime: number;
  metrics: ComponentMetrics;
}
```

### 21.1.4 平台健康检查器

```typescript
// ============================================================
// 平台健康检查器：定期检查所有组件的健康状态
// ============================================================

class PlatformHealthChecker {
  private components: Map<string, ManagedComponent>;
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private healthHistory = new Map<string, HealthCheckResult[]>();

  constructor(components: Map<string, ManagedComponent>) {
    this.components = components;
  }

  start(): void {
    for (const [name, managed] of this.components) {
      if (!managed.config.healthCheck.enabled) continue;

      const interval = managed.config.healthCheck.intervalMs;
      const timer = setInterval(() => this.checkComponent(name), interval);
      this.timers.set(name, timer);

      // 初始化历史记录
      this.healthHistory.set(name, []);
    }
    console.log(`[HealthChecker] 启动，监控 ${this.timers.size} 个组件`);
  }

  stop(): void {
    for (const [name, timer] of this.timers) {
      clearInterval(timer);
    }
    this.timers.clear();
    console.log('[HealthChecker] 已停止');
  }

  private async checkComponent(name: string): Promise<void> {
    const managed = this.components.get(name);
    if (!managed) return;

    const result: HealthCheckResult = {
      component: name,
      timestamp: Date.now(),
      healthy: false,
      latencyMs: 0,
      details: {},
    };

    const startTime = Date.now();

    try {
      const status = managed.component.getStatus();
      result.healthy = status === ComponentStatus.RUNNING;
      result.latencyMs = Date.now() - startTime;
      result.details = { status };
    } catch (error) {
      result.healthy = false;
      result.latencyMs = Date.now() - startTime;
      result.details = { error: String(error) };
    }

    // 维护健康检查历史（保留最近 100 条）
    const history = this.healthHistory.get(name) || [];
    history.push(result);
    if (history.length > 100) history.shift();
    this.healthHistory.set(name, history);

    // 判断是否需要标记为不健康
    this.evaluateHealth(name, managed);
  }

  private evaluateHealth(name: string, managed: ManagedComponent): void {
    const history = this.healthHistory.get(name) || [];
    const threshold = managed.config.healthCheck.unhealthyThreshold;

    // 检查最近 N 次检查是否都失败
    const recentChecks = history.slice(-threshold);
    if (recentChecks.length >= threshold && recentChecks.every(r => !r.healthy)) {
      console.warn(`[HealthChecker] 组件 '${name}' 连续 ${threshold} 次健康检查失败`);
      managed.status = ComponentStatus.ERROR;
    }
  }

  /** 获取组件的健康历史 */
  getHistory(name: string): HealthCheckResult[] {
    return this.healthHistory.get(name) || [];
  }

  /** 获取全局健康摘要 */
  getSummary(): HealthSummary {
    const components: Record<string, { healthy: boolean; lastCheck: number }> = {};

    for (const [name, history] of this.healthHistory) {
      const last = history[history.length - 1];
      components[name] = {
        healthy: last?.healthy ?? false,
        lastCheck: last?.timestamp ?? 0,
      };
    }

    const allHealthy = Object.values(components).every(c => c.healthy);

    return {
      overallHealthy: allHealthy,
      components,
      timestamp: Date.now(),
    };
  }
}

interface HealthCheckResult {
  component: string;
  timestamp: number;
  healthy: boolean;
  latencyMs: number;
  details: Record<string, unknown>;
}

interface HealthSummary {
  overallHealthy: boolean;
  components: Record<string, { healthy: boolean; lastCheck: number }>;
  timestamp: number;
}
```

### 21.1.5 多租户管理

多租户是企业级 Agent 平台的核心能力。不同的租户（组织、团队、客户）需要在共享基础设施上获得**资源隔离**、**数据隔离**和**配置隔离**。

```typescript
// ============================================================
// TenantManager：多租户管理器，实现资源隔离与配额控制
// ============================================================

class TenantManager implements Lifecycle {
  private config: MultiTenancyConfig;
  private tenants = new Map<string, TenantContext>();
  private status: ComponentStatus = ComponentStatus.CREATED;

  constructor(config: MultiTenancyConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    this.status = ComponentStatus.INITIALIZED;
  }

  async start(): Promise<void> {
    this.status = ComponentStatus.RUNNING;
    // 启动资源配额监控定时器
    this.startQuotaMonitor();
  }

  async stop(): Promise<void> {
    this.status = ComponentStatus.STOPPED;
  }

  async destroy(): Promise<void> {
    this.tenants.clear();
    this.status = ComponentStatus.DESTROYED;
  }

  getStatus(): ComponentStatus {
    return this.status;
  }

  /** 创建租户 */
  async createTenant(config: TenantConfig): Promise<TenantContext> {
    if (this.tenants.has(config.tenantId)) {
      throw new Error(`租户 '${config.tenantId}' 已存在`);
    }

    // 验证配额不超过平台限制
    this.validateQuotas(config.quotas);

    const context: TenantContext = {
      config,
      createdAt: Date.now(),
      usage: {
        activeAgents: 0,
        requestsThisMinute: 0,
        concurrentExecutions: 0,
        storageMB: 0,
        modelCallsToday: 0,
      },
      namespace: `tenant-${config.tenantId}`,
      isolated: this.config.isolationLevel !== 'namespace',
      rateLimiter: new TokenBucketRateLimiter(
        config.quotas.maxRequestsPerMinute,
        config.quotas.maxRequestsPerMinute
      ),
    };

    this.tenants.set(config.tenantId, context);
    console.log(
      `[TenantManager] 创建租户: ${config.tenantId} (${config.tier}), ` +
      `隔离级别: ${this.config.isolationLevel}`
    );
    return context;
  }

  /** 删除租户 */
  async removeTenant(tenantId: string): Promise<void> {
    const context = this.tenants.get(tenantId);
    if (!context) throw new Error(`租户 '${tenantId}' 不存在`);

    if (context.usage.activeAgents > 0) {
      throw new Error(
        `租户 '${tenantId}' 仍有 ${context.usage.activeAgents} 个活跃 Agent，请先停止`
      );
    }

    this.tenants.delete(tenantId);
    console.log(`[TenantManager] 删除租户: ${tenantId}`);
  }

  /** 检查租户是否有可用配额执行操作 */
  async checkQuota(tenantId: string, resource: keyof ResourceQuotas): Promise<boolean> {
    const context = this.tenants.get(tenantId);
    if (!context) throw new Error(`租户 '${tenantId}' 不存在`);

    const quota = context.config.quotas;
    const usage = context.usage;

    switch (resource) {
      case 'maxAgentsPerTenant':
        return usage.activeAgents < quota.maxAgentsPerTenant;
      case 'maxRequestsPerMinute':
        return context.rateLimiter.tryAcquire();
      case 'maxConcurrentExecutions':
        return usage.concurrentExecutions < quota.maxConcurrentExecutions;
      case 'maxStorageMB':
        return usage.storageMB < quota.maxStorageMB;
      case 'maxModelCallsPerDay':
        return usage.modelCallsToday < quota.maxModelCallsPerDay;
      default:
        return false;
    }
  }

  /** 记录资源使用 */
  recordUsage(
    tenantId: string,
    resource: keyof TenantUsage,
    delta: number
  ): void {
    const context = this.tenants.get(tenantId);
    if (!context) return;
    (context.usage[resource] as number) += delta;
  }

  /** 获取租户上下文 */
  getTenantContext(tenantId: string): TenantContext | undefined {
    return this.tenants.get(tenantId);
  }

  /** 列出所有租户 */
  listTenants(): TenantInfo[] {
    return Array.from(this.tenants.values()).map(ctx => ({
      tenantId: ctx.config.tenantId,
      name: ctx.config.name,
      tier: ctx.config.tier,
      usage: { ...ctx.usage },
      createdAt: ctx.createdAt,
    }));
  }

  // ---- 私有方法 ----

  private validateQuotas(quotas: ResourceQuotas): void {
    const defaults = this.config.resourceQuotas;
    if (quotas.maxAgentsPerTenant > defaults.maxAgentsPerTenant) {
      throw new Error(
        `Agent 数量限制 (${quotas.maxAgentsPerTenant}) 超过平台上限 (${defaults.maxAgentsPerTenant})`
      );
    }
  }

  /** 定期重置分钟级和日级计数器 */
  private startQuotaMonitor(): void {
    // 每分钟重置请求计数
    setInterval(() => {
      for (const context of this.tenants.values()) {
        context.usage.requestsThisMinute = 0;
      }
    }, 60_000);

    // 每天重置模型调用计数
    setInterval(() => {
      for (const context of this.tenants.values()) {
        context.usage.modelCallsToday = 0;
      }
    }, 86_400_000);
  }
}

/** 租户运行时上下文 */
interface TenantContext {
  config: TenantConfig;
  createdAt: number;
  usage: TenantUsage;
  namespace: string;
  isolated: boolean;
  rateLimiter: TokenBucketRateLimiter;
}

/** 租户资源使用量 */
interface TenantUsage {
  activeAgents: number;
  requestsThisMinute: number;
  concurrentExecutions: number;
  storageMB: number;
  modelCallsToday: number;
}

/** 租户信息（对外暴露） */
interface TenantInfo {
  tenantId: string;
  name: string;
  tier: string;
  usage: TenantUsage;
  createdAt: number;
}

// ============================================================
// 令牌桶限流器
// ============================================================

class TokenBucketRateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // 每秒补充 token 数
  private lastRefillTime: number;

  constructor(maxTokens: number, refillPerMinute: number) {
    this.tokens = maxTokens;
    this.maxTokens = maxTokens;
    this.refillRate = refillPerMinute / 60;
    this.lastRefillTime = Date.now();
  }

  tryAcquire(count: number = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefillTime) / 1000;
    const tokensToAdd = elapsed * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefillTime = now;
  }

  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}
```

### 21.1.6 平台启动示例

```typescript
// ============================================================
// 平台启动示例：展示完整的组件注册与启动流程
// ============================================================

async function bootstrapPlatform(): Promise<AgentPlatform> {
  const config: PlatformConfig = {
    name: 'AgentCloud',
    version: '2.0.0',
    environment: 'production',
    region: 'cn-beijing',
    components: [],
    multiTenancy: {
      enabled: true,
      isolationLevel: 'namespace',
      resourceQuotas: {
        maxAgentsPerTenant: 100,
        maxRequestsPerMinute: 1000,
        maxConcurrentExecutions: 50,
        maxStorageMB: 10240,
        maxModelCallsPerDay: 100000,
      },
      defaultTenantConfig: {
        tenantId: 'default',
        name: 'Default Tenant',
        tier: 'free',
        quotas: {
          maxAgentsPerTenant: 10,
          maxRequestsPerMinute: 100,
          maxConcurrentExecutions: 5,
          maxStorageMB: 1024,
          maxModelCallsPerDay: 1000,
        },
        allowedModels: ['gpt-4o-mini'],
        allowedCapabilities: ['text-generation', 'summarization'],
        dataResidency: 'cn',
      },
    },
    monitoring: {
      metricsEnabled: true,
      tracingEnabled: true,
      loggingLevel: 'info',
      metricsExporter: 'prometheus',
      tracingExporter: 'otel',
      alertRules: [
        {
          name: '高错误率',
          metric: 'error_rate',
          condition: 'gt',
          threshold: 0.05,
          windowSeconds: 300,
          severity: 'critical',
          channels: ['slack', 'pagerduty'],
        },
      ],
    },
    security: {
      authProvider: 'oidc',
      encryptionAtRest: true,
      encryptionInTransit: true,
      auditLogging: true,
      rateLimiting: {
        enabled: true,
        defaultRpm: 100,
        burstSize: 20,
        perTenantLimits: new Map(),
      },
      dlp: {
        enabled: true,
        patterns: [
          {
            name: '身份证号',
            regex: '\\d{17}[\\dXx]',
            category: 'pii',
            severity: 'high',
          },
          {
            name: '银行卡号',
            regex: '\\d{16,19}',
            category: 'financial',
            severity: 'high',
          },
        ],
        action: 'mask',
      },
    },
  };

  const platform = new AgentPlatform(config);

  // 注册各组件（后续章节会详细实现每个组件）
  // 注意依赖顺序：registry → gateway → mesh → marketplace → orchestrator
  platform.registerComponent('registry', new AgentRegistryService(), {
    name: 'registry',
    type: ComponentType.REGISTRY,
    enabled: true,
    config: {},
    dependencies: [],
    healthCheck: { enabled: true, intervalMs: 10000, timeoutMs: 3000,
                   unhealthyThreshold: 3, healthyThreshold: 2 },
  });

  platform.registerComponent('gateway', new ModelGateway(), {
    name: 'gateway',
    type: ComponentType.GATEWAY,
    enabled: true,
    config: {},
    dependencies: ['registry'],
    healthCheck: { enabled: true, intervalMs: 5000, timeoutMs: 2000,
                   unhealthyThreshold: 3, healthyThreshold: 2 },
  });

  platform.registerComponent('mesh', new AgentMesh(), {
    name: 'mesh',
    type: ComponentType.MESH,
    enabled: true,
    config: {},
    dependencies: ['registry'],
    healthCheck: { enabled: true, intervalMs: 10000, timeoutMs: 3000,
                   unhealthyThreshold: 3, healthyThreshold: 2 },
  });

  // 初始化并启动
  await platform.initialize();
  await platform.start();

  // 创建示例租户
  const tm = platform.getTenantManager();
  await tm.createTenant({
    tenantId: 'acme-corp',
    name: 'ACME 公司',
    tier: 'enterprise',
    quotas: {
      maxAgentsPerTenant: 50,
      maxRequestsPerMinute: 500,
      maxConcurrentExecutions: 20,
      maxStorageMB: 5120,
      maxModelCallsPerDay: 50000,
    },
    allowedModels: ['gpt-4o', 'o3-mini', 'claude-sonnet-4-20250514', 'claude-sonnet-4', 'deepseek-r1', 'glm-5'],
    allowedCapabilities: ['*'],
    dataResidency: 'cn',
  });

  console.log('[Bootstrap] 平台启动完成');
  console.log('[Bootstrap] 健康报告:', JSON.stringify(platform.getHealthReport(), null, 2));

  return platform;
}
```

> **与第 20 章的衔接**：第 20 章定义的 Agent 互操作协议（A2A、MCP 等）是 Agent 之间通信的**语言**；本章的 AgentPlatform 则是这些 Agent 运行和通信的**场地**。平台提供运行时环境、资源管理和生命周期控制，而互操作协议提供消息格式和通信规范。

---

## 21.2 Agent 注册与发现

### 21.2.1 从简单注册表到企业级服务

在生产环境中，Agent 注册系统需要远超简单 `Map<string, Agent>` 的能力：

- **健康检查**：持续监控 Agent 是否可用
- **能力发现**：根据所需能力动态查找合适的 Agent
- **版本管理**：支持同一 Agent 的多版本并存
- **依赖追踪**：理解 Agent 之间的依赖关系
- **Agent Card**：结构化描述 Agent 的元数据（参见第 20 章 A2A 协议中的 Agent Card 概念）

### 21.2.2 Agent Manifest 规范

Agent Manifest 是描述 Agent 能力、依赖和运行需求的结构化文档，类似 `package.json` 之于 Node.js 包。

```typescript
// ============================================================
// Agent Manifest：Agent 的结构化元数据描述
// ============================================================

/** Agent Manifest —— Agent 的"身份证" */
interface AgentManifest {
  /** 基本信息 */
  id: string;
  name: string;
  version: string;
  description: string;
  author: AgentAuthor;
  license: string;
  repository?: string;

  /** 能力声明 */
  capabilities: AgentCapability[];

  /** Agent Card 信息（符合 A2A 协议） */
  agentCard: AgentCard;

  /** 运行时要求 */
  runtime: RuntimeRequirements;

  /** 依赖声明 */
  dependencies: AgentDependency[];

  /** 接口定义 */
  interfaces: AgentInterface;

  /** 安全信息 */
  security: AgentSecurityInfo;

  /** 定价信息（可选，用于 Marketplace） */
  pricing?: PricingModel;

  /** 元数据 */
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface AgentAuthor {
  name: string;
  email: string;
  organization?: string;
  verified: boolean;
}

/** Agent 能力描述 */
interface AgentCapability {
  name: string;
  category: CapabilityCategory;
  description: string;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  latencyClass: 'realtime' | 'fast' | 'standard' | 'slow' | 'batch';
  qualityScore?: number; // 0-100
  supportedLanguages?: string[];
}

type CapabilityCategory =
  | 'text-generation'
  | 'text-analysis'
  | 'code-generation'
  | 'code-review'
  | 'data-analysis'
  | 'image-generation'
  | 'search'
  | 'conversation'
  | 'translation'
  | 'summarization'
  | 'classification'
  | 'extraction'
  | 'reasoning'
  | 'planning'
  | 'tool-use'
  | 'custom';

/** 简化版 JSON Schema */
interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
}

/** Agent Card（A2A 兼容） */
interface AgentCard {
  name: string;
  description: string;
  url: string;
  provider: { organization: string; url: string };
  version: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    multiTurn: boolean;
    statefulness: boolean;
  };
  authentication: {
    schemes: string[];
    credentials?: string;
  };
  skills: AgentSkill[];
}

interface AgentSkill {
  id: string;
  name: string;
  description: string;
  inputModes: string[];
  outputModes: string[];
  tags: string[];
}

/** 运行时要求 */
interface RuntimeRequirements {
  minMemoryMB: number;
  recommendedMemoryMB: number;
  requiresGPU: boolean;
  gpuMemoryMB?: number;
  maxConcurrency: number;
  startupTimeMs: number;
  models: ModelRequirement[];
  environment: Record<string, string>;
}

interface ModelRequirement {
  provider: string;
  model: string;
  purpose: string;
  required: boolean;
  fallback?: string;
}

/** Agent 依赖 */
interface AgentDependency {
  agentId: string;
  versionRange: string; // semver range, 如 "^1.0.0"
  required: boolean;
  purpose: string;
}

/** Agent 接口定义 */
interface AgentInterface {
  input: InterfaceEndpoint[];
  output: InterfaceEndpoint[];
  events: EventDefinition[];
}

interface InterfaceEndpoint {
  name: string;
  protocol: 'http' | 'grpc' | 'websocket' | 'a2a';
  schema: JSONSchema;
  description: string;
}

interface EventDefinition {
  name: string;
  schema: JSONSchema;
  description: string;
}

/** 安全信息 */
interface AgentSecurityInfo {
  dataClassification: 'public' | 'internal' | 'confidential' | 'restricted';
  requiresAuth: boolean;
  scopes: string[];
  dataRetention: string;
  auditLevel: 'none' | 'basic' | 'detailed' | 'full';
}

/** 定价模型 */
interface PricingModel {
  type: 'free' | 'per-call' | 'subscription' | 'freemium';
  currency: string;
  perCallPrice?: number;
  monthlyPrice?: number;
  freeTierLimits?: {
    callsPerMonth: number;
    features: string[];
  };
  tiers?: PricingTier[];
}

interface PricingTier {
  name: string;
  price: number;
  period: 'monthly' | 'yearly';
  limits: Record<string, number>;
  features: string[];
}
```

### 21.2.3 Manifest 验证器

```typescript
// ============================================================
// ManifestValidator：验证 Agent Manifest 的完整性和合规性
// ============================================================

class ManifestValidator {
  private rules: ValidationRule[] = [];

  constructor() {
    this.registerBuiltinRules();
  }

  /** 注册自定义验证规则 */
  registerRule(rule: ValidationRule): void {
    this.rules.push(rule);
  }

  /** 验证 Manifest */
  validate(manifest: AgentManifest): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 运行所有规则
    for (const rule of this.rules) {
      try {
        const result = rule.check(manifest);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      } catch (e) {
        errors.push({
          rule: rule.name,
          field: 'unknown',
          message: `规则执行异常: ${e}`,
          severity: 'error',
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      score: this.calculateScore(errors, warnings),
    };
  }

  private registerBuiltinRules(): void {
    // 规则 1：必填字段检查
    this.rules.push({
      name: 'required-fields',
      check: (m: AgentManifest) => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        if (!m.id || m.id.trim() === '') {
          errors.push({
            rule: 'required-fields', field: 'id',
            message: 'Agent ID 不能为空', severity: 'error',
          });
        }
        if (!m.name || m.name.trim() === '') {
          errors.push({
            rule: 'required-fields', field: 'name',
            message: 'Agent 名称不能为空', severity: 'error',
          });
        }
        if (!m.version) {
          errors.push({
            rule: 'required-fields', field: 'version',
            message: '版本号不能为空', severity: 'error',
          });
        }
        if (!m.capabilities || m.capabilities.length === 0) {
          errors.push({
            rule: 'required-fields', field: 'capabilities',
            message: '至少声明一个能力', severity: 'error',
          });
        }

        return { errors, warnings };
      },
    });

    // 规则 2：版本号格式（语义化版本）
    this.rules.push({
      name: 'semver-version',
      check: (m: AgentManifest) => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];
        const semverRegex = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;

        if (m.version && !semverRegex.test(m.version)) {
          errors.push({
            rule: 'semver-version', field: 'version',
            message: `版本号 '${m.version}' 不符合语义化版本规范`, severity: 'error',
          });
        }

        return { errors, warnings };
      },
    });

    // 规则 3：能力声明质量
    this.rules.push({
      name: 'capability-quality',
      check: (m: AgentManifest) => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        for (const cap of m.capabilities) {
          if (!cap.description || cap.description.length < 10) {
            warnings.push({
              rule: 'capability-quality', field: `capabilities.${cap.name}`,
              message: `能力 '${cap.name}' 的描述过短，建议至少 10 个字符`,
              severity: 'warning',
            });
          }
          if (!cap.inputSchema || !cap.outputSchema) {
            warnings.push({
              rule: 'capability-quality', field: `capabilities.${cap.name}`,
              message: `能力 '${cap.name}' 缺少输入或输出 Schema 定义`,
              severity: 'warning',
            });
          }
        }

        return { errors, warnings };
      },
    });

    // 规则 4：安全要求检查
    this.rules.push({
      name: 'security-requirements',
      check: (m: AgentManifest) => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        if (m.security.dataClassification === 'restricted' && !m.security.requiresAuth) {
          errors.push({
            rule: 'security-requirements', field: 'security',
            message: '受限级数据分类的 Agent 必须启用身份认证', severity: 'error',
          });
        }
        if (m.security.auditLevel === 'none') {
          warnings.push({
            rule: 'security-requirements', field: 'security.auditLevel',
            message: '建议开启审计日志', severity: 'warning',
          });
        }

        return { errors, warnings };
      },
    });

    // 规则 5：依赖循环检测
    this.rules.push({
      name: 'no-self-dependency',
      check: (m: AgentManifest) => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        for (const dep of m.dependencies) {
          if (dep.agentId === m.id) {
            errors.push({
              rule: 'no-self-dependency', field: 'dependencies',
              message: `Agent 不能依赖自身`, severity: 'error',
            });
          }
        }

        return { errors, warnings };
      },
    });
  }

  private calculateScore(errors: ValidationError[], warnings: ValidationWarning[]): number {
    let score = 100;
    score -= errors.length * 20;
    score -= warnings.length * 5;
    return Math.max(0, Math.min(100, score));
  }
}

interface ValidationRule {
  name: string;
  check: (manifest: AgentManifest) => {
    errors: ValidationError[];
    warnings: ValidationWarning[];
  };
}

interface ValidationError {
  rule: string;
  field: string;
  message: string;
  severity: 'error';
}

interface ValidationWarning {
  rule: string;
  field: string;
  message: string;
  severity: 'warning';
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  score: number; // 0-100
}
```

### 21.2.4 AgentRegistryService 企业级实现

```typescript
// ============================================================
// AgentRegistryService：企业级 Agent 注册与发现服务
// ============================================================

interface RegisteredAgent {
  manifest: AgentManifest;
  registeredAt: number;
  lastHeartbeat: number;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  instances: AgentInstance[];
  metrics: AgentRegistryMetrics;
}

interface AgentInstance {
  instanceId: string;
  endpoint: string;
  region: string;
  status: 'running' | 'starting' | 'stopping' | 'stopped';
  load: number; // 0.0 - 1.0
  startedAt: number;
}

interface AgentRegistryMetrics {
  totalRequests: number;
  successRate: number;
  avgLatencyMs: number;
  p99LatencyMs: number;
}

/** 发现查询条件 */
interface DiscoveryQuery {
  capability?: string;
  category?: CapabilityCategory;
  minQualityScore?: number;
  latencyClass?: string;
  version?: string;
  author?: string;
  tags?: string[];
  maxResults?: number;
  sortBy?: 'quality' | 'latency' | 'popularity';
}

class AgentRegistryService implements Lifecycle {
  private agents = new Map<string, Map<string, RegisteredAgent>>(); // id -> version -> agent
  private capabilityIndex = new Map<string, Set<string>>(); // capability -> agent ids
  private categoryIndex = new Map<CapabilityCategory, Set<string>>();
  private validator = new ManifestValidator();
  private status: ComponentStatus = ComponentStatus.CREATED;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  async initialize(): Promise<void> {
    this.status = ComponentStatus.INITIALIZED;
  }

  async start(): Promise<void> {
    this.status = ComponentStatus.RUNNING;
    // 启动 Agent 健康检查轮询
    this.healthCheckTimer = setInterval(() => this.performHealthChecks(), 15000);
    console.log('[Registry] Agent 注册服务已启动');
  }

  async stop(): Promise<void> {
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    this.status = ComponentStatus.STOPPED;
  }

  async destroy(): Promise<void> {
    this.agents.clear();
    this.capabilityIndex.clear();
    this.categoryIndex.clear();
    this.status = ComponentStatus.DESTROYED;
  }

  getStatus(): ComponentStatus {
    return this.status;
  }

  /** 注册 Agent */
  async register(manifest: AgentManifest): Promise<RegistrationResult> {
    // 1. 验证 Manifest
    const validation = this.validator.validate(manifest);
    if (!validation.valid) {
      return {
        success: false,
        agentId: manifest.id,
        errors: validation.errors.map(e => e.message),
      };
    }

    // 2. 检查版本冲突
    const versions = this.agents.get(manifest.id) || new Map();
    if (versions.has(manifest.version)) {
      return {
        success: false,
        agentId: manifest.id,
        errors: [`版本 ${manifest.version} 已存在，请使用新版本号`],
      };
    }

    // 3. 验证依赖是否可满足
    const depErrors = this.validateDependencies(manifest);
    if (depErrors.length > 0) {
      return { success: false, agentId: manifest.id, errors: depErrors };
    }

    // 4. 注册
    const registered: RegisteredAgent = {
      manifest,
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
      healthStatus: 'unknown',
      instances: [],
      metrics: { totalRequests: 0, successRate: 1.0, avgLatencyMs: 0, p99LatencyMs: 0 },
    };

    versions.set(manifest.version, registered);
    this.agents.set(manifest.id, versions);

    // 5. 更新索引
    this.updateIndexes(manifest);

    console.log(`[Registry] 注册 Agent: ${manifest.id}@${manifest.version}`);

    return {
      success: true,
      agentId: manifest.id,
      version: manifest.version,
      warnings: validation.warnings.map(w => w.message),
    };
  }

  /** 注销 Agent */
  async deregister(agentId: string, version?: string): Promise<void> {
    const versions = this.agents.get(agentId);
    if (!versions) throw new Error(`Agent '${agentId}' 未注册`);

    if (version) {
      versions.delete(version);
      if (versions.size === 0) this.agents.delete(agentId);
    } else {
      this.agents.delete(agentId);
    }

    this.rebuildIndexes();
    console.log(`[Registry] 注销 Agent: ${agentId}${version ? '@' + version : ' (所有版本)'}`);
  }

  /** 基于能力发现 Agent */
  async discover(query: DiscoveryQuery): Promise<DiscoveryResult[]> {
    let candidates: RegisteredAgent[] = [];

    if (query.capability) {
      const agentIds = this.capabilityIndex.get(query.capability) || new Set();
      for (const id of agentIds) {
        const latest = this.getLatestVersion(id);
        if (latest) candidates.push(latest);
      }
    } else if (query.category) {
      const agentIds = this.categoryIndex.get(query.category) || new Set();
      for (const id of agentIds) {
        const latest = this.getLatestVersion(id);
        if (latest) candidates.push(latest);
      }
    } else {
      // 返回所有 Agent 的最新版本
      for (const [id] of this.agents) {
        const latest = this.getLatestVersion(id);
        if (latest) candidates.push(latest);
      }
    }

    // 过滤
    candidates = candidates.filter(agent => {
      if (query.minQualityScore) {
        const maxScore = Math.max(
          ...agent.manifest.capabilities.map(c => c.qualityScore || 0)
        );
        if (maxScore < query.minQualityScore) return false;
      }
      if (query.latencyClass) {
        const hasLatencyClass = agent.manifest.capabilities.some(
          c => c.latencyClass === query.latencyClass
        );
        if (!hasLatencyClass) return false;
      }
      if (query.author) {
        if (agent.manifest.author.name !== query.author) return false;
      }
      // 只返回健康的 Agent
      if (agent.healthStatus === 'unhealthy') return false;
      return true;
    });

    // 排序
    candidates.sort((a, b) => {
      switch (query.sortBy) {
        case 'quality':
          return this.getMaxQuality(b) - this.getMaxQuality(a);
        case 'latency':
          return a.metrics.avgLatencyMs - b.metrics.avgLatencyMs;
        case 'popularity':
          return b.metrics.totalRequests - a.metrics.totalRequests;
        default:
          return this.getMaxQuality(b) - this.getMaxQuality(a);
      }
    });

    // 限制结果数量
    const maxResults = query.maxResults || 20;
    candidates = candidates.slice(0, maxResults);

    return candidates.map(agent => ({
      agentId: agent.manifest.id,
      name: agent.manifest.name,
      version: agent.manifest.version,
      description: agent.manifest.description,
      capabilities: agent.manifest.capabilities.map(c => c.name),
      healthStatus: agent.healthStatus,
      instances: agent.instances.filter(i => i.status === 'running').length,
      metrics: { ...agent.metrics },
      agentCard: agent.manifest.agentCard,
    }));
  }

  /** 获取 Agent 的可用实例（用于负载均衡） */
  async resolveEndpoint(
    agentId: string,
    strategy: 'round-robin' | 'least-load' | 'random' = 'least-load'
  ): Promise<string | null> {
    const latest = this.getLatestVersion(agentId);
    if (!latest) return null;

    const running = latest.instances.filter(i => i.status === 'running');
    if (running.length === 0) return null;

    switch (strategy) {
      case 'least-load':
        running.sort((a, b) => a.load - b.load);
        return running[0].endpoint;
      case 'random':
        return running[Math.floor(Math.random() * running.length)].endpoint;
      case 'round-robin':
      default:
        // 简单轮询（基于请求总数取模）
        const idx = latest.metrics.totalRequests % running.length;
        return running[idx].endpoint;
    }
  }

  /** 接收心跳 */
  async heartbeat(
    agentId: string,
    instanceId: string,
    load: number
  ): Promise<void> {
    const latest = this.getLatestVersion(agentId);
    if (!latest) return;

    latest.lastHeartbeat = Date.now();
    const instance = latest.instances.find(i => i.instanceId === instanceId);
    if (instance) {
      instance.load = load;
    }
  }

  /** 添加 Agent 实例 */
  addInstance(agentId: string, instance: AgentInstance): void {
    const latest = this.getLatestVersion(agentId);
    if (!latest) throw new Error(`Agent '${agentId}' 未注册`);
    latest.instances.push(instance);
    console.log(`[Registry] Agent '${agentId}' 添加实例: ${instance.instanceId}`);
  }

  /** 获取注册统计 */
  getStats(): RegistryStats {
    let totalAgents = 0;
    let totalVersions = 0;
    let totalInstances = 0;
    let healthyAgents = 0;

    for (const [, versions] of this.agents) {
      totalAgents++;
      totalVersions += versions.size;
      for (const [, agent] of versions) {
        totalInstances += agent.instances.length;
        if (agent.healthStatus === 'healthy') healthyAgents++;
      }
    }

    return {
      totalAgents,
      totalVersions,
      totalInstances,
      healthyAgents,
      capabilityCount: this.capabilityIndex.size,
      categoryCount: this.categoryIndex.size,
    };
  }

  // ---- 私有方法 ----

  private getLatestVersion(agentId: string): RegisteredAgent | null {
    const versions = this.agents.get(agentId);
    if (!versions || versions.size === 0) return null;

    // 取最新的版本号
    let latest: RegisteredAgent | null = null;
    let latestVersion = '';
    for (const [ver, agent] of versions) {
      if (!latest || this.compareVersions(ver, latestVersion) > 0) {
        latest = agent;
        latestVersion = ver;
      }
    }
    return latest;
  }

  private compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) > (pb[i] || 0)) return 1;
      if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    }
    return 0;
  }

  private validateDependencies(manifest: AgentManifest): string[] {
    const errors: string[] = [];
    for (const dep of manifest.dependencies) {
      if (dep.required && !this.agents.has(dep.agentId)) {
        errors.push(`必需依赖 '${dep.agentId}' 未注册`);
      }
    }
    return errors;
  }

  private updateIndexes(manifest: AgentManifest): void {
    for (const cap of manifest.capabilities) {
      // 能力索引
      if (!this.capabilityIndex.has(cap.name)) {
        this.capabilityIndex.set(cap.name, new Set());
      }
      this.capabilityIndex.get(cap.name)!.add(manifest.id);

      // 分类索引
      if (!this.categoryIndex.has(cap.category)) {
        this.categoryIndex.set(cap.category, new Set());
      }
      this.categoryIndex.get(cap.category)!.add(manifest.id);
    }
  }

  private rebuildIndexes(): void {
    this.capabilityIndex.clear();
    this.categoryIndex.clear();
    for (const [, versions] of this.agents) {
      for (const [, agent] of versions) {
        this.updateIndexes(agent.manifest);
      }
    }
  }

  private async performHealthChecks(): Promise<void> {
    for (const [agentId, versions] of this.agents) {
      for (const [, agent] of versions) {
        const timeSinceHeartbeat = Date.now() - agent.lastHeartbeat;
        if (timeSinceHeartbeat > 60000) {
          agent.healthStatus = 'unhealthy';
        } else if (timeSinceHeartbeat > 30000) {
          agent.healthStatus = 'degraded';
        } else {
          agent.healthStatus = 'healthy';
        }
      }
    }
  }

  private getMaxQuality(agent: RegisteredAgent): number {
    return Math.max(...agent.manifest.capabilities.map(c => c.qualityScore || 0));
  }
}

interface RegistrationResult {
  success: boolean;
  agentId: string;
  version?: string;
  errors?: string[];
  warnings?: string[];
}

interface DiscoveryResult {
  agentId: string;
  name: string;
  version: string;
  description: string;
  capabilities: string[];
  healthStatus: string;
  instances: number;
  metrics: AgentRegistryMetrics;
  agentCard: AgentCard;
}

interface RegistryStats {
  totalAgents: number;
  totalVersions: number;
  totalInstances: number;
  healthyAgents: number;
  capabilityCount: number;
  categoryCount: number;
}
```

### 21.2.5 注册与发现使用示例

```typescript
// ============================================================
// 使用示例：注册、发现和解析 Agent
// ============================================================

async function registryDemo(): Promise<void> {
  const registry = new AgentRegistryService();
  await registry.initialize();
  await registry.start();

  // 注册一个翻译 Agent
  const translationManifest: AgentManifest = {
    id: 'translation-agent',
    name: '多语言翻译 Agent',
    version: '1.2.0',
    description: '支持 100+ 语言的高质量翻译服务，基于大模型微调',
    author: {
      name: 'AI Lab',
      email: 'ailab@example.com',
      organization: 'ACME Corp',
      verified: true,
    },
    license: 'MIT',
    capabilities: [
      {
        name: 'text-translation',
        category: 'translation',
        description: '高质量文本翻译，支持 100+ 语言对',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: '待翻译文本' },
            sourceLang: { type: 'string', description: '源语言代码' },
            targetLang: { type: 'string', description: '目标语言代码' },
          },
          required: ['text', 'targetLang'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            translatedText: { type: 'string' },
            confidence: { type: 'number' },
          },
        },
        latencyClass: 'fast',
        qualityScore: 92,
        supportedLanguages: ['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es'],
      },
    ],
    agentCard: {
      name: '多语言翻译 Agent',
      description: '基于大模型的多语言翻译服务',
      url: 'https://agents.example.com/translation',
      provider: { organization: 'ACME Corp', url: 'https://acme.com' },
      version: '1.2.0',
      capabilities: {
        streaming: true,
        pushNotifications: false,
        multiTurn: false,
        statefulness: false,
      },
      authentication: { schemes: ['bearer'] },
      skills: [
        {
          id: 'translate',
          name: '文本翻译',
          description: '翻译文本到目标语言',
          inputModes: ['text/plain'],
          outputModes: ['text/plain'],
          tags: ['translation', 'nlp'],
        },
      ],
    },
    runtime: {
      minMemoryMB: 512,
      recommendedMemoryMB: 1024,
      requiresGPU: false,
      maxConcurrency: 100,
      startupTimeMs: 5000,
      models: [
        {
          provider: 'openai',
          model: 'gpt-4o-mini',
          purpose: '翻译主模型',
          required: true,
          fallback: 'gpt-4o-mini',
        },
      ],
      environment: {},
    },
    dependencies: [],
    interfaces: {
      input: [
        {
          name: 'translate',
          protocol: 'http',
          schema: { type: 'object' },
          description: 'HTTP 翻译接口',
        },
      ],
      output: [],
      events: [],
    },
    security: {
      dataClassification: 'internal',
      requiresAuth: true,
      scopes: ['translate:read'],
      dataRetention: '30d',
      auditLevel: 'basic',
    },
    metadata: {},
    createdAt: '2025-01-15T00:00:00Z',
    updatedAt: '2025-03-01T00:00:00Z',
  };

  const result = await registry.register(translationManifest);
  console.log('注册结果:', result);
  // => { success: true, agentId: 'translation-agent', version: '1.2.0' }

  // 添加实例
  registry.addInstance('translation-agent', {
    instanceId: 'trans-inst-001',
    endpoint: 'https://agent-cluster-1.internal:8080',
    region: 'cn-beijing',
    status: 'running',
    load: 0.3,
    startedAt: Date.now(),
  });

  registry.addInstance('translation-agent', {
    instanceId: 'trans-inst-002',
    endpoint: 'https://agent-cluster-2.internal:8080',
    region: 'cn-shanghai',
    status: 'running',
    load: 0.7,
    startedAt: Date.now(),
  });

  // 按能力发现
  const discovered = await registry.discover({
    capability: 'text-translation',
    minQualityScore: 80,
    sortBy: 'quality',
  });
  console.log('发现的翻译 Agent:', discovered);

  // 解析最佳实例端点
  const endpoint = await registry.resolveEndpoint('translation-agent', 'least-load');
  console.log('最佳实例:', endpoint);
  // => 'https://agent-cluster-1.internal:8080' (负载最低)

  console.log('注册表统计:', registry.getStats());

  await registry.stop();
}
```

> **与第 11 章的关联**：第 11 章在框架对比与选型中讨论了不同 Agent 框架的能力差异。本节的 Agent Manifest 和能力发现机制，可以作为统一描述和比较不同框架所构建 Agent 的标准化方式。无论使用 LangChain、AutoGen 还是自研框架，Agent 都可以通过 Manifest 注册到统一的注册中心。

---
## 21.3 Agent Marketplace

### 21.3.1 Marketplace 架构概述

Agent Marketplace（应用市场）是 Agent 生态系统的**商业枢纽**。它让 Agent 开发者能够发布、分发和变现自己的 Agent，同时让用户能够方便地发现、试用和部署所需的 Agent。

```
┌─────────────────────────────────────────────────────────────┐
│                   Agent Marketplace 架构                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────┐      │
│  │              前端层 (Web / CLI / SDK)              │      │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐ │      │
│  │  │ 浏览搜索│ │ Agent  │ │ 评价评论│ │ 计费  │ │      │
│  │  │         │ │ 详情   │ │         │ │ 管理  │ │      │
│  │  └─────────┘ └─────────┘ └─────────┘ └────────┘ │      │
│  └──────────────────────┬───────────────────────────┘      │
│                         │                                   │
│  ┌──────────────────────▼───────────────────────────┐      │
│  │                 API 网关层                         │      │
│  └──────────────────────┬───────────────────────────┘      │
│                         │                                   │
│  ┌─────────┬────────────┼────────────┬──────────┐          │
│  ▼         ▼            ▼            ▼          ▼          │
│ ┌────┐  ┌─────┐  ┌───────────┐  ┌──────┐  ┌───────┐     │
│ │搜索│  │包管理│  │安全审查    │  │评价  │  │计费   │     │
│ │服务│  │服务  │  │Pipeline   │  │服务  │  │服务   │     │
│ └────┘  └─────┘  └───────────┘  └──────┘  └───────┘     │
│                                                            │
│  ┌─────────────────────────────────────────────────┐      │
│  │            存储层 (数据库 / 对象存储)              │      │
│  │  Agent包 │ 元数据 │ 评价数据 │ 计费记录 │ 审计日志│      │
│  └─────────────────────────────────────────────────┘      │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 21.3.2 Marketplace 核心类型

```typescript
// ============================================================
// Agent Marketplace 核心类型定义
// ============================================================

/** Marketplace 中的 Agent 列表项 */
interface MarketplaceListing {
  agentId: string;
  manifest: AgentManifest;
  publisher: PublisherInfo;
  status: ListingStatus;
  stats: ListingStats;
  reviews: ReviewSummary;
  securityReview: SecurityReviewResult;
  publishedAt: number;
  lastUpdatedAt: number;
  featuredRank?: number;
  tags: string[];
  screenshots: string[];
  documentation: string;
  changelog: ChangelogEntry[];
}

type ListingStatus =
  | 'draft'
  | 'pending_review'
  | 'in_review'
  | 'approved'
  | 'published'
  | 'suspended'
  | 'deprecated';

interface PublisherInfo {
  publisherId: string;
  name: string;
  organization: string;
  verified: boolean;
  trustScore: number; // 0-100
  publishedAgents: number;
  joinedAt: number;
}

interface ListingStats {
  totalInstalls: number;
  activeInstalls: number;
  totalCalls: number;
  avgRating: number;
  reviewCount: number;
  weeklyGrowth: number;
}

interface ReviewSummary {
  averageRating: number;
  totalReviews: number;
  distribution: { [stars: number]: number }; // 1-5
  recentReviews: Review[];
}

interface Review {
  reviewId: string;
  userId: string;
  userName: string;
  rating: number; // 1-5
  title: string;
  content: string;
  helpful: number;
  createdAt: number;
  reply?: PublisherReply;
}

interface PublisherReply {
  content: string;
  createdAt: number;
}

interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
  breaking: boolean;
}
```

### 21.3.3 AgentMarketplace 实现

```typescript
// ============================================================
// AgentMarketplace：应用市场核心服务
// ============================================================

class AgentMarketplace implements Lifecycle {
  private listings = new Map<string, MarketplaceListing>();
  private reviewStore = new Map<string, Review[]>();
  private securityPipeline: SecurityReviewPipeline;
  private packageManager: AgentPackageManager;
  private searchIndex: MarketplaceSearchIndex;
  private status: ComponentStatus = ComponentStatus.CREATED;

  constructor() {
    this.securityPipeline = new SecurityReviewPipeline();
    this.packageManager = new AgentPackageManager();
    this.searchIndex = new MarketplaceSearchIndex();
  }

  async initialize(): Promise<void> {
    await this.securityPipeline.initialize();
    await this.packageManager.initialize();
    this.status = ComponentStatus.INITIALIZED;
  }

  async start(): Promise<void> {
    this.status = ComponentStatus.RUNNING;
    console.log('[Marketplace] Agent 应用市场已启动');
  }

  async stop(): Promise<void> {
    this.status = ComponentStatus.STOPPED;
  }

  async destroy(): Promise<void> {
    this.listings.clear();
    this.reviewStore.clear();
    this.status = ComponentStatus.DESTROYED;
  }

  getStatus(): ComponentStatus {
    return this.status;
  }

  /** 提交 Agent 到市场（开始审查流程） */
  async submitAgent(
    manifest: AgentManifest,
    publisher: PublisherInfo,
    metadata: {
      tags: string[];
      screenshots: string[];
      documentation: string;
    }
  ): Promise<SubmissionResult> {
    // 1. 基础验证
    const validator = new ManifestValidator();
    const validation = validator.validate(manifest);
    if (!validation.valid) {
      return {
        success: false,
        submissionId: '',
        errors: validation.errors.map(e => e.message),
      };
    }

    // 2. 创建 listing
    const listing: MarketplaceListing = {
      agentId: manifest.id,
      manifest,
      publisher,
      status: 'pending_review',
      stats: {
        totalInstalls: 0, activeInstalls: 0, totalCalls: 0,
        avgRating: 0, reviewCount: 0, weeklyGrowth: 0,
      },
      reviews: {
        averageRating: 0, totalReviews: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        recentReviews: [],
      },
      securityReview: { passed: false, score: 0, findings: [], reviewedAt: 0, reviewer: '' },
      publishedAt: 0,
      lastUpdatedAt: Date.now(),
      tags: metadata.tags,
      screenshots: metadata.screenshots,
      documentation: metadata.documentation,
      changelog: [{
        version: manifest.version,
        date: new Date().toISOString(),
        changes: ['初始发布'],
        breaking: false,
      }],
    };

    this.listings.set(manifest.id, listing);

    // 3. 触发安全审查
    const reviewPromise = this.securityPipeline.review(manifest, publisher);
    reviewPromise.then(result => {
      listing.securityReview = result;
      if (result.passed) {
        listing.status = 'approved';
        console.log(`[Marketplace] Agent '${manifest.id}' 审查通过`);
      } else {
        listing.status = 'suspended';
        console.log(`[Marketplace] Agent '${manifest.id}' 审查未通过`);
      }
    });

    return {
      success: true,
      submissionId: `sub-${manifest.id}-${Date.now()}`,
      status: 'pending_review',
    };
  }

  /** 发布已审核通过的 Agent */
  async publishAgent(agentId: string): Promise<void> {
    const listing = this.listings.get(agentId);
    if (!listing) throw new Error(`Agent '${agentId}' 未找到`);
    if (listing.status !== 'approved') {
      throw new Error(`Agent '${agentId}' 状态为 '${listing.status}'，只有 approved 状态才能发布`);
    }

    listing.status = 'published';
    listing.publishedAt = Date.now();

    // 更新搜索索引
    this.searchIndex.index(listing);

    console.log(`[Marketplace] Agent '${agentId}' 已发布到市场`);
  }

  /** 搜索市场中的 Agent */
  async search(query: MarketplaceSearchQuery): Promise<MarketplaceSearchResult> {
    let results = Array.from(this.listings.values())
      .filter(l => l.status === 'published');

    // 关键词搜索
    if (query.keyword) {
      const kw = query.keyword.toLowerCase();
      results = results.filter(l =>
        l.manifest.name.toLowerCase().includes(kw) ||
        l.manifest.description.toLowerCase().includes(kw) ||
        l.tags.some(t => t.toLowerCase().includes(kw))
      );
    }

    // 分类过滤
    if (query.category) {
      results = results.filter(l =>
        l.manifest.capabilities.some(c => c.category === query.category)
      );
    }

    // 最低评分过滤
    if (query.minRating) {
      results = results.filter(l => l.stats.avgRating >= query.minRating!);
    }

    // 价格模型过滤
    if (query.pricingType) {
      results = results.filter(l => l.manifest.pricing?.type === query.pricingType);
    }

    // 排序
    switch (query.sortBy) {
      case 'rating':
        results.sort((a, b) => b.stats.avgRating - a.stats.avgRating);
        break;
      case 'installs':
        results.sort((a, b) => b.stats.totalInstalls - a.stats.totalInstalls);
        break;
      case 'newest':
        results.sort((a, b) => b.publishedAt - a.publishedAt);
        break;
      case 'trending':
        results.sort((a, b) => b.stats.weeklyGrowth - a.stats.weeklyGrowth);
        break;
      default:
        // 综合排序：评分 * 0.4 + 安装量归一化 * 0.3 + 增长率归一化 * 0.3
        results.sort((a, b) => this.computeRelevance(b) - this.computeRelevance(a));
    }

    // 分页
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const start = (page - 1) * pageSize;
    const paged = results.slice(start, start + pageSize);

    return {
      items: paged.map(l => this.toSearchItem(l)),
      total: results.length,
      page,
      pageSize,
      totalPages: Math.ceil(results.length / pageSize),
    };
  }

  /** 安装 Agent */
  async installAgent(
    agentId: string,
    tenantId: string,
    version?: string
  ): Promise<InstallationResult> {
    const listing = this.listings.get(agentId);
    if (!listing) throw new Error(`Agent '${agentId}' 未找到`);
    if (listing.status !== 'published') {
      throw new Error(`Agent '${agentId}' 未发布`);
    }

    // 通过包管理器解析依赖并安装
    const installResult = await this.packageManager.install(
      listing.manifest,
      tenantId,
      version
    );

    if (installResult.success) {
      listing.stats.totalInstalls++;
      listing.stats.activeInstalls++;
    }

    return installResult;
  }

  /** 提交评价 */
  async submitReview(agentId: string, review: Omit<Review, 'reviewId'>): Promise<void> {
    const listing = this.listings.get(agentId);
    if (!listing) throw new Error(`Agent '${agentId}' 未找到`);

    const fullReview: Review = {
      ...review,
      reviewId: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };

    // 存储评价
    const reviews = this.reviewStore.get(agentId) || [];
    reviews.push(fullReview);
    this.reviewStore.set(agentId, reviews);

    // 更新统计
    this.updateReviewStats(agentId);
  }

  /** 获取 Agent 详情 */
  getListing(agentId: string): MarketplaceListing | undefined {
    return this.listings.get(agentId);
  }

  /** 获取推荐 Agent */
  getFeatured(limit: number = 10): MarketplaceListing[] {
    return Array.from(this.listings.values())
      .filter(l => l.status === 'published' && l.featuredRank !== undefined)
      .sort((a, b) => (a.featuredRank || 0) - (b.featuredRank || 0))
      .slice(0, limit);
  }

  // ---- 私有方法 ----

  private computeRelevance(listing: MarketplaceListing): number {
    const rating = listing.stats.avgRating / 5;
    const installs = Math.min(listing.stats.totalInstalls / 10000, 1);
    const growth = Math.min(listing.stats.weeklyGrowth / 100, 1);
    return rating * 0.4 + installs * 0.3 + growth * 0.3;
  }

  private toSearchItem(listing: MarketplaceListing): MarketplaceSearchItem {
    return {
      agentId: listing.agentId,
      name: listing.manifest.name,
      description: listing.manifest.description,
      version: listing.manifest.version,
      author: listing.publisher.name,
      verified: listing.publisher.verified,
      rating: listing.stats.avgRating,
      installs: listing.stats.totalInstalls,
      pricing: listing.manifest.pricing?.type || 'free',
      capabilities: listing.manifest.capabilities.map(c => c.name),
      tags: listing.tags,
    };
  }

  private updateReviewStats(agentId: string): void {
    const listing = this.listings.get(agentId);
    const reviews = this.reviewStore.get(agentId);
    if (!listing || !reviews || reviews.length === 0) return;

    const total = reviews.length;
    const sum = reviews.reduce((s, r) => s + r.rating, 0);
    const avg = sum / total;

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of reviews) {
      distribution[r.rating] = (distribution[r.rating] || 0) + 1;
    }

    listing.stats.avgRating = Math.round(avg * 10) / 10;
    listing.stats.reviewCount = total;
    listing.reviews = {
      averageRating: avg,
      totalReviews: total,
      distribution,
      recentReviews: reviews.slice(-5).reverse(),
    };
  }
}

interface MarketplaceSearchQuery {
  keyword?: string;
  category?: CapabilityCategory;
  minRating?: number;
  pricingType?: string;
  sortBy?: 'relevance' | 'rating' | 'installs' | 'newest' | 'trending';
  page?: number;
  pageSize?: number;
}

interface MarketplaceSearchResult {
  items: MarketplaceSearchItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface MarketplaceSearchItem {
  agentId: string;
  name: string;
  description: string;
  version: string;
  author: string;
  verified: boolean;
  rating: number;
  installs: number;
  pricing: string;
  capabilities: string[];
  tags: string[];
}

interface SubmissionResult {
  success: boolean;
  submissionId: string;
  status?: string;
  errors?: string[];
}

interface InstallationResult {
  success: boolean;
  installedVersion: string;
  dependencies: string[];
  errors?: string[];
}

/** 简化的搜索索引（生产环境应使用 Elasticsearch 等） */
class MarketplaceSearchIndex {
  private documents = new Map<string, { text: string; listing: MarketplaceListing }>();

  index(listing: MarketplaceListing): void {
    const text = [
      listing.manifest.name,
      listing.manifest.description,
      ...listing.tags,
      ...listing.manifest.capabilities.map(c => `${c.name} ${c.description}`),
    ].join(' ').toLowerCase();

    this.documents.set(listing.agentId, { text, listing });
  }

  search(query: string): MarketplaceListing[] {
    const terms = query.toLowerCase().split(/\s+/);
    const results: { listing: MarketplaceListing; score: number }[] = [];

    for (const [, doc] of this.documents) {
      let score = 0;
      for (const term of terms) {
        if (doc.text.includes(term)) score++;
      }
      if (score > 0) {
        results.push({ listing: doc.listing, score });
      }
    }

    return results.sort((a, b) => b.score - a.score).map(r => r.listing);
  }

  remove(agentId: string): void {
    this.documents.delete(agentId);
  }
}
```

### 21.3.4 Agent 包管理器

Agent 包管理器负责依赖解析、版本兼容性检查和安装编排。

```typescript
// ============================================================
// AgentPackageManager：依赖解析与安装编排
// ============================================================

class AgentPackageManager {
  private installed = new Map<string, Map<string, InstalledPackage>>(); // tenantId -> agentId -> package
  private registry: AgentRegistryService | null = null;

  async initialize(): Promise<void> {
    console.log('[PackageManager] 初始化完成');
  }

  setRegistry(registry: AgentRegistryService): void {
    this.registry = registry;
  }

  /** 安装 Agent（含依赖解析） */
  async install(
    manifest: AgentManifest,
    tenantId: string,
    targetVersion?: string
  ): Promise<InstallationResult> {
    const version = targetVersion || manifest.version;
    console.log(`[PackageManager] 安装 ${manifest.id}@${version} 到租户 ${tenantId}`);

    // 1. 解析依赖树
    const depTree = this.resolveDependencies(manifest);
    if (depTree.conflicts.length > 0) {
      return {
        success: false,
        installedVersion: version,
        dependencies: [],
        errors: depTree.conflicts.map(c =>
          `依赖冲突: ${c.agentId} 需要 ${c.required} 但已安装 ${c.installed}`
        ),
      };
    }

    // 2. 按拓扑顺序安装依赖
    const installOrder = depTree.order;
    const installedDeps: string[] = [];

    for (const dep of installOrder) {
      if (dep === manifest.id) continue; // 主包最后安装

      const tenantPackages = this.installed.get(tenantId) || new Map();
      if (!tenantPackages.has(dep)) {
        // 模拟安装依赖
        tenantPackages.set(dep, {
          agentId: dep,
          version: 'latest',
          installedAt: Date.now(),
          tenantId,
          status: 'active',
        });
        this.installed.set(tenantId, tenantPackages);
        installedDeps.push(dep);
      }
    }

    // 3. 安装主包
    const tenantPackages = this.installed.get(tenantId) || new Map();
    tenantPackages.set(manifest.id, {
      agentId: manifest.id,
      version,
      installedAt: Date.now(),
      tenantId,
      status: 'active',
    });
    this.installed.set(tenantId, tenantPackages);

    console.log(
      `[PackageManager] 安装完成: ${manifest.id}@${version}，` +
      `依赖: [${installedDeps.join(', ')}]`
    );

    return {
      success: true,
      installedVersion: version,
      dependencies: installedDeps,
    };
  }

  /** 卸载 Agent */
  async uninstall(agentId: string, tenantId: string): Promise<void> {
    const tenantPackages = this.installed.get(tenantId);
    if (!tenantPackages) return;

    // 检查是否有其他包依赖此 Agent
    const dependents = this.findDependents(agentId, tenantId);
    if (dependents.length > 0) {
      throw new Error(
        `无法卸载 '${agentId}'，以下 Agent 依赖它: ${dependents.join(', ')}`
      );
    }

    tenantPackages.delete(agentId);
    console.log(`[PackageManager] 已卸载 ${agentId} 从租户 ${tenantId}`);
  }

  /** 更新 Agent */
  async update(
    agentId: string,
    tenantId: string,
    newManifest: AgentManifest
  ): Promise<InstallationResult> {
    const tenantPackages = this.installed.get(tenantId);
    const existing = tenantPackages?.get(agentId);

    if (!existing) {
      throw new Error(`Agent '${agentId}' 未安装在租户 '${tenantId}'`);
    }

    console.log(
      `[PackageManager] 更新 ${agentId}: ${existing.version} → ${newManifest.version}`
    );

    // 重新安装（会自动处理依赖更新）
    return this.install(newManifest, tenantId, newManifest.version);
  }

  /** 列出租户已安装的 Agent */
  listInstalled(tenantId: string): InstalledPackage[] {
    const tenantPackages = this.installed.get(tenantId);
    if (!tenantPackages) return [];
    return Array.from(tenantPackages.values());
  }

  // ---- 私有方法 ----

  /** 解析依赖树 */
  private resolveDependencies(manifest: AgentManifest): DependencyTree {
    const visited = new Set<string>();
    const order: string[] = [];
    const conflicts: DependencyConflict[] = [];

    const resolve = (m: AgentManifest) => {
      if (visited.has(m.id)) return;
      visited.add(m.id);

      for (const dep of m.dependencies) {
        if (!visited.has(dep.agentId)) {
          // 在实际实现中，这里会从注册中心获取依赖的 Manifest
          // 此处简化处理
          order.push(dep.agentId);
        }
      }

      order.push(m.id);
    };

    resolve(manifest);

    return { order, conflicts };
  }

  /** 查找依赖某 Agent 的其他 Agent */
  private findDependents(agentId: string, tenantId: string): string[] {
    // 简化实现：在实际系统中需要维护反向依赖图
    return [];
  }
}

interface InstalledPackage {
  agentId: string;
  version: string;
  installedAt: number;
  tenantId: string;
  status: 'active' | 'disabled' | 'updating' | 'error';
}

interface DependencyTree {
  order: string[];
  conflicts: DependencyConflict[];
}

interface DependencyConflict {
  agentId: string;
  required: string;
  installed: string;
}
```

### 21.3.5 安全审查流水线

所有提交到 Marketplace 的 Agent 必须经过多阶段的安全审查。

```typescript
// ============================================================
// SecurityReviewPipeline：多阶段安全审查流水线
// ============================================================

interface SecurityReviewResult {
  passed: boolean;
  score: number; // 0-100
  findings: SecurityFinding[];
  reviewedAt: number;
  reviewer: string;
}

interface SecurityFinding {
  stage: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  category: string;
  description: string;
  remediation?: string;
}

/** 审查阶段接口 */
interface ReviewStage {
  name: string;
  execute(manifest: AgentManifest, context: ReviewContext): Promise<StageResult>;
}

interface ReviewContext {
  publisher: PublisherInfo;
  previousFindings: SecurityFinding[];
}

interface StageResult {
  passed: boolean;
  findings: SecurityFinding[];
}

class SecurityReviewPipeline {
  private stages: ReviewStage[] = [];

  async initialize(): Promise<void> {
    // 注册默认审查阶段
    this.stages = [
      new ManifestIntegrityStage(),
      new PermissionScopeStage(),
      new DependencyVulnerabilityStage(),
      new DataHandlingStage(),
      new CodeStaticAnalysisStage(),
      new PublisherTrustStage(),
    ];
    console.log(`[SecurityPipeline] 初始化，${this.stages.length} 个审查阶段`);
  }

  /** 执行完整审查流水线 */
  async review(
    manifest: AgentManifest,
    publisher: PublisherInfo
  ): Promise<SecurityReviewResult> {
    console.log(`[SecurityPipeline] 开始审查 Agent: ${manifest.id}`);

    const allFindings: SecurityFinding[] = [];
    let allPassed = true;

    const context: ReviewContext = {
      publisher,
      previousFindings: [],
    };

    for (const stage of this.stages) {
      console.log(`[SecurityPipeline]   阶段: ${stage.name}`);
      try {
        const result = await stage.execute(manifest, context);
        allFindings.push(...result.findings);
        context.previousFindings = allFindings;

        if (!result.passed) {
          allPassed = false;
          // 关键阶段失败时可以提前终止
          const hasCritical = result.findings.some(f => f.severity === 'critical');
          if (hasCritical) {
            console.log(`[SecurityPipeline]   发现严重问题，终止审查`);
            break;
          }
        }
      } catch (error) {
        allFindings.push({
          stage: stage.name,
          severity: 'high',
          category: 'review-error',
          description: `审查阶段执行异常: ${error}`,
        });
        allPassed = false;
      }
    }

    // 计算安全分数
    const score = this.calculateSecurityScore(allFindings);

    const result: SecurityReviewResult = {
      passed: allPassed && score >= 60,
      score,
      findings: allFindings,
      reviewedAt: Date.now(),
      reviewer: 'automated-pipeline',
    };

    console.log(
      `[SecurityPipeline] 审查完成: ${manifest.id}, ` +
      `通过: ${result.passed}, 分数: ${score}, ` +
      `发现: ${allFindings.length} 项`
    );

    return result;
  }

  private calculateSecurityScore(findings: SecurityFinding[]): number {
    let score = 100;
    for (const f of findings) {
      switch (f.severity) {
        case 'critical': score -= 30; break;
        case 'high': score -= 20; break;
        case 'medium': score -= 10; break;
        case 'low': score -= 5; break;
        case 'info': score -= 1; break;
      }
    }
    return Math.max(0, Math.min(100, score));
  }
}

// ---- 具体审查阶段 ----

/** 阶段 1：Manifest 完整性检查 */
class ManifestIntegrityStage implements ReviewStage {
  name = 'manifest-integrity';

  async execute(manifest: AgentManifest, _ctx: ReviewContext): Promise<StageResult> {
    const findings: SecurityFinding[] = [];

    // 检查必填安全字段
    if (!manifest.security) {
      findings.push({
        stage: this.name, severity: 'high', category: 'missing-security',
        description: 'Manifest 缺少安全信息声明',
        remediation: '添加 security 字段，声明数据分类、认证要求和审计级别',
      });
    }

    // 检查版本是否已知存在漏洞（模拟）
    const deprecatedModels = ['gpt-3.5-turbo-0301', 'gpt-3.5-turbo', 'gemini-2.0-flash'];
    if (manifest.runtime.models.some(m => deprecatedModels.includes(m.model))) {
      findings.push({
        stage: this.name, severity: 'medium', category: 'deprecated-model',
        description: '使用了已弃用的模型版本（gpt-3.5-turbo 系列已停用，gemini-2.0-flash 已升级为 gemini-3-flash）',
        remediation: '升级到最新版本的模型：gpt-4o-mini、gemini-3-flash 等',
      });
    }

    return { passed: !findings.some(f => f.severity === 'critical' || f.severity === 'high'), findings };
  }
}

/** 阶段 2：权限范围检查 */
class PermissionScopeStage implements ReviewStage {
  name = 'permission-scope';

  async execute(manifest: AgentManifest, _ctx: ReviewContext): Promise<StageResult> {
    const findings: SecurityFinding[] = [];
    const dangerousScopes = ['admin:*', 'system:*', 'data:delete:*'];

    for (const scope of manifest.security.scopes) {
      if (dangerousScopes.some(ds => scope.includes(ds.replace('*', '')))) {
        findings.push({
          stage: this.name, severity: 'high', category: 'excessive-permission',
          description: `请求了高危权限: ${scope}`,
          remediation: '遵循最小权限原则，只申请必要的权限范围',
        });
      }

      // 检查通配符权限
      if (scope.endsWith(':*')) {
        findings.push({
          stage: this.name, severity: 'medium', category: 'wildcard-permission',
          description: `使用了通配符权限: ${scope}`,
          remediation: '明确列出所需的具体权限，避免使用通配符',
        });
      }
    }

    return {
      passed: !findings.some(f => f.severity === 'critical' || f.severity === 'high'),
      findings,
    };
  }
}

/** 阶段 3：依赖漏洞扫描 */
class DependencyVulnerabilityStage implements ReviewStage {
  name = 'dependency-vulnerability';

  // 模拟的已知漏洞数据库
  private knownVulnerabilities: Map<string, string[]> = new Map([
    ['insecure-agent-v1', ['CVE-2025-1234: 存在注入漏洞']],
  ]);

  async execute(manifest: AgentManifest, _ctx: ReviewContext): Promise<StageResult> {
    const findings: SecurityFinding[] = [];

    for (const dep of manifest.dependencies) {
      const vulns = this.knownVulnerabilities.get(dep.agentId);
      if (vulns) {
        for (const vuln of vulns) {
          findings.push({
            stage: this.name, severity: 'critical', category: 'known-vulnerability',
            description: `依赖 '${dep.agentId}' 存在已知漏洞: ${vuln}`,
            remediation: '更新依赖到不受影响的版本，或替换为安全的替代方案',
          });
        }
      }
    }

    return {
      passed: !findings.some(f => f.severity === 'critical'),
      findings,
    };
  }
}

/** 阶段 4：数据处理合规检查 */
class DataHandlingStage implements ReviewStage {
  name = 'data-handling';

  async execute(manifest: AgentManifest, _ctx: ReviewContext): Promise<StageResult> {
    const findings: SecurityFinding[] = [];

    // 检查敏感数据处理的 Agent 是否有足够的安全措施
    if (manifest.security.dataClassification === 'restricted' ||
        manifest.security.dataClassification === 'confidential') {
      if (manifest.security.auditLevel === 'none' || manifest.security.auditLevel === 'basic') {
        findings.push({
          stage: this.name, severity: 'high', category: 'insufficient-audit',
          description: `处理 ${manifest.security.dataClassification} 级别数据但审计级别不足`,
          remediation: '对于受限/机密数据，审计级别应设置为 detailed 或 full',
        });
      }
    }

    // 检查数据保留策略
    if (!manifest.security.dataRetention) {
      findings.push({
        stage: this.name, severity: 'medium', category: 'missing-retention',
        description: '未声明数据保留策略',
        remediation: '明确声明数据保留期限，如 "30d"、"90d" 或 "none"',
      });
    }

    return {
      passed: !findings.some(f => f.severity === 'critical' || f.severity === 'high'),
      findings,
    };
  }
}

/** 阶段 5：静态分析（模拟） */
class CodeStaticAnalysisStage implements ReviewStage {
  name = 'static-analysis';

  async execute(manifest: AgentManifest, _ctx: ReviewContext): Promise<StageResult> {
    const findings: SecurityFinding[] = [];
    // 在实际实现中，这里会对 Agent 的代码包进行静态分析
    // 检查常见的安全问题：SQL 注入、XSS、不安全的反序列化等
    // 此处仅模拟基本检查

    // 检查是否声明了不安全的环境变量
    const unsafeEnvVars = ['DATABASE_PASSWORD', 'SECRET_KEY', 'PRIVATE_KEY'];
    for (const [key] of Object.entries(manifest.runtime.environment)) {
      if (unsafeEnvVars.some(uv => key.toUpperCase().includes(uv))) {
        findings.push({
          stage: this.name, severity: 'high', category: 'hardcoded-secret',
          description: `环境变量 '${key}' 可能包含硬编码的密钥`,
          remediation: '使用密钥管理服务（如 Vault）管理敏感配置',
        });
      }
    }

    return {
      passed: !findings.some(f => f.severity === 'critical' || f.severity === 'high'),
      findings,
    };
  }
}

/** 阶段 6：发布者信任度评估 */
class PublisherTrustStage implements ReviewStage {
  name = 'publisher-trust';

  async execute(_manifest: AgentManifest, ctx: ReviewContext): Promise<StageResult> {
    const findings: SecurityFinding[] = [];
    const publisher = ctx.publisher;

    if (!publisher.verified) {
      findings.push({
        stage: this.name, severity: 'medium', category: 'unverified-publisher',
        description: '发布者身份未经验证',
        remediation: '完成发布者身份验证流程',
      });
    }

    if (publisher.trustScore < 50) {
      findings.push({
        stage: this.name, severity: 'medium', category: 'low-trust',
        description: `发布者信任分偏低 (${publisher.trustScore}/100)`,
      });
    }

    return {
      passed: !findings.some(f => f.severity === 'critical' || f.severity === 'high'),
      findings,
    };
  }
}
```

### 21.3.6 计费模型

```typescript
// ============================================================
// 计费模型：支持多种变现方式
// ============================================================

interface BillingRecord {
  recordId: string;
  tenantId: string;
  agentId: string;
  type: 'api-call' | 'subscription' | 'overage';
  amount: number;
  currency: string;
  timestamp: number;
  metadata: Record<string, unknown>;
}

class BillingService {
  private records: BillingRecord[] = [];
  private subscriptions = new Map<string, SubscriptionInfo>();

  /** 记录 API 调用计费 */
  recordApiCall(
    tenantId: string,
    agentId: string,
    pricing: PricingModel,
    callMetadata: Record<string, unknown>
  ): BillingRecord | null {
    if (pricing.type === 'free') return null;

    // 检查免费额度
    if (pricing.type === 'freemium') {
      const monthlyUsage = this.getMonthlyUsage(tenantId, agentId);
      if (monthlyUsage < (pricing.freeTierLimits?.callsPerMonth || 0)) {
        return null; // 在免费额度内
      }
    }

    if (pricing.type === 'per-call' && pricing.perCallPrice) {
      const record: BillingRecord = {
        recordId: `bill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        tenantId,
        agentId,
        type: 'api-call',
        amount: pricing.perCallPrice,
        currency: pricing.currency,
        timestamp: Date.now(),
        metadata: callMetadata,
      };
      this.records.push(record);
      return record;
    }

    return null;
  }

  /** 创建订阅 */
  createSubscription(
    tenantId: string,
    agentId: string,
    tier: PricingTier
  ): SubscriptionInfo {
    const subscription: SubscriptionInfo = {
      subscriptionId: `sub-${Date.now()}`,
      tenantId,
      agentId,
      tier: tier.name,
      price: tier.price,
      period: tier.period,
      startedAt: Date.now(),
      expiresAt: Date.now() + (tier.period === 'monthly' ? 30 * 86400000 : 365 * 86400000),
      status: 'active',
    };

    const key = `${tenantId}:${agentId}`;
    this.subscriptions.set(key, subscription);
    return subscription;
  }

  /** 获取租户的月度账单摘要 */
  getMonthlyBillingSummary(tenantId: string): BillingSummary {
    const now = Date.now();
    const monthStart = now - (30 * 86400000); // 简化：过去 30 天

    const monthlyRecords = this.records.filter(
      r => r.tenantId === tenantId && r.timestamp >= monthStart
    );

    const byAgent = new Map<string, number>();
    let totalAmount = 0;

    for (const record of monthlyRecords) {
      totalAmount += record.amount;
      byAgent.set(record.agentId, (byAgent.get(record.agentId) || 0) + record.amount);
    }

    return {
      tenantId,
      period: { start: monthStart, end: now },
      totalAmount,
      currency: monthlyRecords[0]?.currency || 'CNY',
      byAgent: Object.fromEntries(byAgent),
      totalCalls: monthlyRecords.length,
    };
  }

  private getMonthlyUsage(tenantId: string, agentId: string): number {
    const monthStart = Date.now() - (30 * 86400000);
    return this.records.filter(
      r => r.tenantId === tenantId && r.agentId === agentId && r.timestamp >= monthStart
    ).length;
  }
}

interface SubscriptionInfo {
  subscriptionId: string;
  tenantId: string;
  agentId: string;
  tier: string;
  price: number;
  period: 'monthly' | 'yearly';
  startedAt: number;
  expiresAt: number;
  status: 'active' | 'cancelled' | 'expired';
}

interface BillingSummary {
  tenantId: string;
  period: { start: number; end: number };
  totalAmount: number;
  currency: string;
  byAgent: Record<string, number>;
  totalCalls: number;
}
```


### 21.3.7 实战案例：Smithery.ai — MCP Server 注册中心

在第 20 章中我们深入探讨了 MCP（Model Context Protocol）协议的技术细节。随着 MCP 生态的爆发式增长，一个关键问题浮出水面：**如何发现和管理数以千计的 MCP Server？** Smithery.ai 正是解决这一问题的事实标准（de facto）注册中心，其角色类似于 npm 之于 Node.js 包、Docker Hub 之于容器镜像。

**平台定位与规模**

截至 2025 年中，Smithery 已收录 **3,000+ MCP Server**，涵盖数据库连接器、API 集成、文件系统工具、搜索引擎等各类能力。开发者可以通过 Web 界面浏览、搜索和评估 MCP Server，也可以通过 CLI 直接安装。

**CLI 驱动的安装体验**

Smithery 提供了类似 npm 的命令行工具，实现一键安装和配置：

```bash
# 安装 MCP Server 到本地开发环境
npx @smithery/cli install @anthropic/filesystem-server

# 安装并指定运行模式
npx @smithery/cli install @database/postgres-server --mode hosted

# 列出已安装的 MCP Server
npx @smithery/cli list

# 更新所有已安装的 Server
npx @smithery/cli update --all
```

**部署模式**

Smithery 支持两种部署模式，适应不同的安全和性能需求：

```typescript
// ============================================================
// Smithery MCP Server 部署模式
// ============================================================

/** Smithery 部署配置 */
interface SmitheryDeploymentConfig {
  /** 服务器标识，如 "@anthropic/filesystem-server" */
  serverName: string;
  /** 部署模式 */
  mode: 'hosted' | 'local';
  /** hosted 模式：Smithery 云端托管，零运维 */
  hostedConfig?: {
    region: 'us-east' | 'eu-west' | 'ap-southeast';
    /** 自动扩缩容 */
    autoScale: boolean;
    maxInstances: number;
  };
  /** local 模式：本地运行，数据不出域 */
  localConfig?: {
    /** 本地端口 */
    port: number;
    /** 环境变量（数据库连接串、API 密钥等） */
    envVars: Record<string, string>;
    /** 沙箱隔离级别 */
    isolation: 'none' | 'process' | 'container';
  };
}

/** Smithery 注册表条目 */
interface SmitheryRegistryEntry {
  name: string;
  description: string;
  version: string;
  author: string;
  /** 下载量 */
  downloads: number;
  /** 安全评分（0-100） */
  securityScore: number;
  /** 支持的传输协议 */
  transports: ('stdio' | 'sse' | 'streamable-http')[];
  /** 所需权限 */
  permissions: string[];
  /** 最后更新时间 */
  lastUpdated: string;
  /** 兼容的 MCP 协议版本 */
  mcpVersion: string;
}
```

**安全考量**

作为开放的注册中心，Smithery 面临与 npm 类似的供应链安全挑战。社区已报告过部分 MCP Server 存在**路径遍历漏洞**（path traversal），攻击者可能通过恶意 Server 读取宿主机的敏感文件。安全建议：

- **最小权限原则**：仅授予 MCP Server 必要的文件系统和网络权限
- **沙箱运行**：在容器或受限进程中运行第三方 Server
- **审查源码**：安装前检查 Server 的权限声明和代码实现
- **关注安全评分**：优先选择 Smithery 安全评分较高的 Server
- **锁定版本**：避免自动更新引入未审查的变更

> **与 21.3.5 的联系：** Smithery 的安全挑战正是本节 `SecurityReviewPipeline` 要解决的问题。企业如果要大规模采用 MCP Server，建议在 Smithery 之上叠加自建的安全审查流程。

---
## 21.4 平台适配器

### 21.4.1 为什么需要平台适配器

Agent 最终需要通过具体的**渠道**与用户交互。不同的渠道（Slack、Teams、Email、Web 等）有着完全不同的消息格式、认证方式和交互模型。平台适配器的核心职责是：

1. **消息规范化**：将各平台的消息格式转换为统一的内部格式
2. **事件路由**：将平台事件路由到正确的 Agent
3. **生命周期管理**：统一管理多个适配器的启停
4. **Webhook 管理**：处理各平台的 Webhook 注册和验证

```
┌─────────────────────────────────────────────────────────────┐
│                   平台适配器架构                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  外部平台            适配器层              内部统一格式       │
│  ┌────────┐    ┌──────────────┐    ┌──────────────────┐    │
│  │ Slack  │───▶│SlackAdapter  │───▶│                  │    │
│  └────────┘    └──────────────┘    │                  │    │
│  ┌────────┐    ┌──────────────┐    │                  │    │
│  │ Teams  │───▶│TeamsAdapter  │───▶│ MessageNormalizer│    │
│  └────────┘    └──────────────┘    │                  │    │
│  ┌────────┐    ┌──────────────┐    │        │         │    │
│  │ Email  │───▶│EmailAdapter  │───▶│        ▼         │    │
│  └────────┘    └──────────────┘    │ NormalizedMessage│    │
│  ┌────────┐    ┌──────────────┐    │        │         │    │
│  │REST API│───▶│RESTAdapter   │───▶│        ▼         │    │
│  └────────┘    └──────────────┘    │  EventRouter     │    │
│  ┌────────┐    ┌──────────────┐    │        │         │    │
│  │WebSocket│──▶│WSAdapter     │───▶│        ▼         │    │
│  └────────┘    └──────────────┘    │  Agent Runtime   │    │
│  ┌────────┐    ┌──────────────┐    │                  │    │
│  │OpenClaw│──▶│OpenClawBridge│───▶│  (20+ 平台)      │    │
│  └────────┘    └──────────────┘    │                  │    │
│                                    └──────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

> **OpenClaw 的启示**：OpenClaw（GitHub 100K+ Stars）将"平台适配"做到了极致——通过 Gateway 守护进程 + Plugin 架构，开箱即用地支持 20+ 消息平台（Slack、Discord、Teams、WeChat、Telegram 等）。其 134 个 MCP 兼容工具使 Agent 可以通过统一的 Plugin 接口连接任意渠道。如果你的 Agent 需要快速对接大量消息平台，OpenClaw 的 Gateway 架构是值得参考的模式——甚至可以直接将 OpenClaw 作为平台适配层集成到你的 Agent 系统中。

### 21.4.2 统一消息模型

```typescript
// ============================================================
// 统一消息模型：所有平台适配器输出的规范化格式
// ============================================================

/** 规范化消息：所有平台消息转换后的统一格式 */
interface NormalizedMessage {
  /** 消息唯一 ID */
  messageId: string;
  /** 来源平台 */
  platform: PlatformType;
  /** 消息方向 */
  direction: 'inbound' | 'outbound';
  /** 发送者信息 */
  sender: NormalizedUser;
  /** 接收者/频道 */
  recipient: NormalizedRecipient;
  /** 消息内容 */
  content: MessageContent;
  /** 会话上下文 */
  conversation: ConversationContext;
  /** 元数据 */
  metadata: MessageMetadata;
  /** 时间戳 */
  timestamp: number;
}

type PlatformType = 'slack' | 'teams' | 'email' | 'rest' | 'websocket' | 'web' | 'openclaw' | 'custom';

interface NormalizedUser {
  userId: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  platformUserId: string;
  roles: string[];
}

interface NormalizedRecipient {
  type: 'user' | 'channel' | 'group' | 'broadcast';
  id: string;
  name: string;
}

interface MessageContent {
  /** 纯文本内容 */
  text: string;
  /** 富文本内容（Markdown） */
  richText?: string;
  /** 附件列表 */
  attachments: Attachment[];
  /** 交互组件（按钮、下拉菜单等） */
  interactiveElements?: InteractiveElement[];
  /** 引用消息 */
  replyTo?: string;
}

interface Attachment {
  type: 'file' | 'image' | 'video' | 'audio' | 'link';
  name: string;
  url: string;
  mimeType: string;
  size?: number;
}

interface InteractiveElement {
  type: 'button' | 'select' | 'input' | 'datepicker';
  id: string;
  label: string;
  value?: string;
  options?: { label: string; value: string }[];
}

interface ConversationContext {
  conversationId: string;
  threadId?: string;
  isThread: boolean;
  participantCount: number;
}

interface MessageMetadata {
  platformMessageId: string;
  platformThreadId?: string;
  rawPayload?: Record<string, unknown>;
  deliveredAt?: number;
  editedAt?: number;
}
```

### 21.4.3 PlatformAdapter 接口与基础类

```typescript
// ============================================================
// PlatformAdapter 接口与 AbstractAdapter 基础类
// ============================================================

/** 平台适配器接口 */
interface PlatformAdapter extends Lifecycle {
  readonly platform: PlatformType;

  /** 发送消息到平台 */
  sendMessage(message: NormalizedMessage): Promise<SendResult>;

  /** 发送带交互组件的消息 */
  sendInteractiveMessage(
    recipient: NormalizedRecipient,
    content: MessageContent
  ): Promise<SendResult>;

  /** 更新已发送的消息 */
  updateMessage(messageId: string, content: MessageContent): Promise<void>;

  /** 删除消息 */
  deleteMessage(messageId: string): Promise<void>;

  /** 注册消息处理器 */
  onMessage(handler: MessageHandler): void;

  /** 注册事件处理器 */
  onEvent(event: string, handler: EventHandler): void;

  /** 获取适配器信息 */
  getAdapterInfo(): AdapterInfo;
}

type MessageHandler = (message: NormalizedMessage) => Promise<void>;
type EventHandler = (event: PlatformEvent) => Promise<void>;

interface PlatformEvent {
  type: string;
  platform: PlatformType;
  data: Record<string, unknown>;
  timestamp: number;
}

interface SendResult {
  success: boolean;
  platformMessageId?: string;
  error?: string;
}

interface AdapterInfo {
  platform: PlatformType;
  version: string;
  connected: boolean;
  features: string[];
  rateLimits: { requestsPerMinute: number; messagesPerSecond: number };
}

/** 适配器配置基础类型 */
interface BaseAdapterConfig {
  enabled: boolean;
  retryAttempts: number;
  retryDelayMs: number;
  timeoutMs: number;
}

/** 抽象适配器基类：提供通用的重试和错误处理逻辑 */
abstract class AbstractAdapter implements PlatformAdapter {
  abstract readonly platform: PlatformType;
  protected messageHandlers: MessageHandler[] = [];
  protected eventHandlers = new Map<string, EventHandler[]>();
  protected status: ComponentStatus = ComponentStatus.CREATED;
  protected config: BaseAdapterConfig;

  constructor(config: BaseAdapterConfig) {
    this.config = config;
  }

  abstract sendMessage(message: NormalizedMessage): Promise<SendResult>;
  abstract sendInteractiveMessage(
    recipient: NormalizedRecipient,
    content: MessageContent
  ): Promise<SendResult>;
  abstract updateMessage(messageId: string, content: MessageContent): Promise<void>;
  abstract deleteMessage(messageId: string): Promise<void>;
  abstract getAdapterInfo(): AdapterInfo;

  async initialize(): Promise<void> {
    this.status = ComponentStatus.INITIALIZED;
  }

  async start(): Promise<void> {
    this.status = ComponentStatus.RUNNING;
  }

  async stop(): Promise<void> {
    this.status = ComponentStatus.STOPPED;
  }

  async destroy(): Promise<void> {
    this.messageHandlers = [];
    this.eventHandlers.clear();
    this.status = ComponentStatus.DESTROYED;
  }

  getStatus(): ComponentStatus {
    return this.status;
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onEvent(event: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  /** 分发消息给所有注册的处理器 */
  protected async dispatchMessage(message: NormalizedMessage): Promise<void> {
    for (const handler of this.messageHandlers) {
      try {
        await handler(message);
      } catch (error) {
        console.error(`[${this.platform}] 消息处理器错误:`, error);
      }
    }
  }

  /** 分发事件给所有注册的处理器 */
  protected async dispatchEvent(event: PlatformEvent): Promise<void> {
    const handlers = this.eventHandlers.get(event.type) || [];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`[${this.platform}] 事件处理器错误:`, error);
      }
    }
  }

  /** 带重试的执行 */
  protected async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.config.retryAttempts) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          console.warn(
            `[${this.platform}] ${operationName} 失败 (尝试 ${attempt + 1}/${this.config.retryAttempts + 1})，` +
            `${delay}ms 后重试: ${error}`
          );
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 21.4.4 Slack 适配器

```typescript
// ============================================================
// SlackAdapter：Slack 平台适配器
// ============================================================

interface SlackAdapterConfig extends BaseAdapterConfig {
  botToken: string;
  signingSecret: string;
  appToken?: string;
  defaultChannel?: string;
}

class SlackAdapter extends AbstractAdapter {
  readonly platform: PlatformType = 'slack';
  private slackConfig: SlackAdapterConfig;

  constructor(config: SlackAdapterConfig) {
    super(config);
    this.slackConfig = config;
  }

  async initialize(): Promise<void> {
    await super.initialize();
    // 验证 token 有效性
    console.log('[Slack] 初始化，验证 Bot Token...');
    // 实际实现中调用 Slack API auth.test
  }

  async start(): Promise<void> {
    await super.start();
    // 建立 WebSocket 连接（Socket Mode）或注册 Webhook
    console.log('[Slack] 适配器已启动');
  }

  async sendMessage(message: NormalizedMessage): Promise<SendResult> {
    return this.withRetry(async () => {
      // 将统一消息转换为 Slack 格式
      const slackPayload = this.toSlackMessage(message);

      // 实际实现中调用 Slack Web API: chat.postMessage
      console.log(`[Slack] 发送消息到 ${message.recipient.id}`);

      return {
        success: true,
        platformMessageId: `slack-msg-${Date.now()}`,
      };
    }, 'sendMessage');
  }

  async sendInteractiveMessage(
    recipient: NormalizedRecipient,
    content: MessageContent
  ): Promise<SendResult> {
    return this.withRetry(async () => {
      const blocks = this.toSlackBlocks(content);
      console.log(`[Slack] 发送交互消息到 ${recipient.id}，${blocks.length} 个 Block`);

      return {
        success: true,
        platformMessageId: `slack-interactive-${Date.now()}`,
      };
    }, 'sendInteractiveMessage');
  }

  async updateMessage(messageId: string, content: MessageContent): Promise<void> {
    await this.withRetry(async () => {
      // Slack API: chat.update
      console.log(`[Slack] 更新消息 ${messageId}`);
    }, 'updateMessage');
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.withRetry(async () => {
      // Slack API: chat.delete
      console.log(`[Slack] 删除消息 ${messageId}`);
    }, 'deleteMessage');
  }

  getAdapterInfo(): AdapterInfo {
    return {
      platform: 'slack',
      version: '2.0.0',
      connected: this.status === ComponentStatus.RUNNING,
      features: ['threads', 'reactions', 'files', 'interactive-blocks', 'modals'],
      rateLimits: { requestsPerMinute: 50, messagesPerSecond: 1 },
    };
  }

  /** 处理来自 Slack 的 Webhook 事件 */
  async handleSlackEvent(payload: Record<string, unknown>): Promise<void> {
    const eventType = payload.type as string;

    if (eventType === 'url_verification') {
      // Slack URL 验证 challenge
      return;
    }

    if (eventType === 'event_callback') {
      const event = payload.event as Record<string, unknown>;
      const innerType = event.type as string;

      if (innerType === 'message' || innerType === 'app_mention') {
        const normalized = this.fromSlackMessage(event);
        await this.dispatchMessage(normalized);
      }
    }

    if (eventType === 'block_actions') {
      await this.dispatchEvent({
        type: 'interaction',
        platform: 'slack',
        data: payload,
        timestamp: Date.now(),
      });
    }
  }

  // ---- 私有转换方法 ----

  private toSlackMessage(message: NormalizedMessage): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      channel: message.recipient.id,
      text: message.content.text,
    };

    if (message.content.richText) {
      payload.blocks = [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: message.content.richText },
        },
      ];
    }

    if (message.conversation.threadId) {
      payload.thread_ts = message.conversation.threadId;
    }

    return payload;
  }

  private toSlackBlocks(content: MessageContent): Record<string, unknown>[] {
    const blocks: Record<string, unknown>[] = [];

    if (content.text || content.richText) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: content.richText || content.text },
      });
    }

    if (content.interactiveElements) {
      const elements = content.interactiveElements.map(el => {
        if (el.type === 'button') {
          return {
            type: 'button',
            text: { type: 'plain_text', text: el.label },
            action_id: el.id,
            value: el.value,
          };
        }
        if (el.type === 'select') {
          return {
            type: 'static_select',
            placeholder: { type: 'plain_text', text: el.label },
            action_id: el.id,
            options: (el.options || []).map(opt => ({
              text: { type: 'plain_text', text: opt.label },
              value: opt.value,
            })),
          };
        }
        return null;
      }).filter(Boolean);

      if (elements.length > 0) {
        blocks.push({ type: 'actions', elements });
      }
    }

    return blocks;
  }

  private fromSlackMessage(event: Record<string, unknown>): NormalizedMessage {
    return {
      messageId: `norm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      platform: 'slack',
      direction: 'inbound',
      sender: {
        userId: event.user as string,
        displayName: event.user as string,
        platformUserId: event.user as string,
        roles: [],
      },
      recipient: {
        type: 'channel',
        id: event.channel as string,
        name: event.channel as string,
      },
      content: {
        text: event.text as string,
        attachments: [],
      },
      conversation: {
        conversationId: event.channel as string,
        threadId: event.thread_ts as string | undefined,
        isThread: !!event.thread_ts,
        participantCount: 1,
      },
      metadata: {
        platformMessageId: event.ts as string,
        platformThreadId: event.thread_ts as string | undefined,
        rawPayload: event,
      },
      timestamp: Date.now(),
    };
  }
}
```

### 21.4.5 Microsoft Teams 适配器

```typescript
// ============================================================
// TeamsAdapter：Microsoft Teams 适配器
// ============================================================

interface TeamsAdapterConfig extends BaseAdapterConfig {
  appId: string;
  appPassword: string;
  tenantId: string;
}

class TeamsAdapter extends AbstractAdapter {
  readonly platform: PlatformType = 'teams';
  private teamsConfig: TeamsAdapterConfig;

  constructor(config: TeamsAdapterConfig) {
    super(config);
    this.teamsConfig = config;
  }

  async initialize(): Promise<void> {
    await super.initialize();
    console.log('[Teams] 初始化，验证 App 凭据...');
  }

  async start(): Promise<void> {
    await super.start();
    console.log('[Teams] 适配器已启动');
  }

  async sendMessage(message: NormalizedMessage): Promise<SendResult> {
    return this.withRetry(async () => {
      const teamsPayload = this.toTeamsActivity(message);
      console.log(`[Teams] 发送消息到 ${message.recipient.id}`);

      return {
        success: true,
        platformMessageId: `teams-msg-${Date.now()}`,
      };
    }, 'sendMessage');
  }

  async sendInteractiveMessage(
    recipient: NormalizedRecipient,
    content: MessageContent
  ): Promise<SendResult> {
    return this.withRetry(async () => {
      const card = this.toAdaptiveCard(content);
      console.log(`[Teams] 发送自适应卡片到 ${recipient.id}`);

      return {
        success: true,
        platformMessageId: `teams-card-${Date.now()}`,
      };
    }, 'sendInteractiveMessage');
  }

  async updateMessage(messageId: string, content: MessageContent): Promise<void> {
    await this.withRetry(async () => {
      console.log(`[Teams] 更新消息 ${messageId}`);
    }, 'updateMessage');
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.withRetry(async () => {
      console.log(`[Teams] 删除消息 ${messageId}`);
    }, 'deleteMessage');
  }

  getAdapterInfo(): AdapterInfo {
    return {
      platform: 'teams',
      version: '2.0.0',
      connected: this.status === ComponentStatus.RUNNING,
      features: ['adaptive-cards', 'mentions', 'files', 'tabs', 'task-modules'],
      rateLimits: { requestsPerMinute: 30, messagesPerSecond: 1 },
    };
  }

  /** 处理 Teams Bot Framework 回调 */
  async handleTeamsActivity(activity: Record<string, unknown>): Promise<void> {
    const type = activity.type as string;

    if (type === 'message') {
      const normalized = this.fromTeamsActivity(activity);
      await this.dispatchMessage(normalized);
    } else if (type === 'invoke') {
      await this.dispatchEvent({
        type: 'interaction',
        platform: 'teams',
        data: activity,
        timestamp: Date.now(),
      });
    }
  }

  private toTeamsActivity(message: NormalizedMessage): Record<string, unknown> {
    return {
      type: 'message',
      text: message.content.text,
      textFormat: message.content.richText ? 'markdown' : 'plain',
      conversation: { id: message.recipient.id },
    };
  }

  private toAdaptiveCard(content: MessageContent): Record<string, unknown> {
    const card: Record<string, unknown> = {
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: content.richText || content.text,
          wrap: true,
        },
      ],
      actions: [],
    };

    if (content.interactiveElements) {
      const actions = content.interactiveElements
        .filter(el => el.type === 'button')
        .map(el => ({
          type: 'Action.Submit',
          title: el.label,
          data: { actionId: el.id, value: el.value },
        }));
      (card.actions as unknown[]).push(...actions);
    }

    return {
      type: 'message',
      attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: card,
      }],
    };
  }

  private fromTeamsActivity(activity: Record<string, unknown>): NormalizedMessage {
    const from = activity.from as Record<string, string>;
    const conversation = activity.conversation as Record<string, string>;

    return {
      messageId: `norm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      platform: 'teams',
      direction: 'inbound',
      sender: {
        userId: from?.id || 'unknown',
        displayName: from?.name || 'Unknown User',
        platformUserId: from?.aadObjectId || from?.id || 'unknown',
        roles: [],
      },
      recipient: {
        type: 'channel',
        id: conversation?.id || '',
        name: conversation?.name || '',
      },
      content: {
        text: activity.text as string || '',
        attachments: [],
      },
      conversation: {
        conversationId: conversation?.id || '',
        isThread: false,
        participantCount: 1,
      },
      metadata: {
        platformMessageId: activity.id as string || '',
        rawPayload: activity,
      },
      timestamp: Date.now(),
    };
  }
}
```

### 21.4.6 Email 适配器

```typescript
// ============================================================
// EmailAdapter：Email 适配器
// ============================================================

interface EmailAdapterConfig extends BaseAdapterConfig {
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
  username: string;
  password: string;
  fromAddress: string;
  pollingIntervalMs: number;
}

class EmailAdapter extends AbstractAdapter {
  readonly platform: PlatformType = 'email';
  private emailConfig: EmailAdapterConfig;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: EmailAdapterConfig) {
    super(config);
    this.emailConfig = config;
  }

  async initialize(): Promise<void> {
    await super.initialize();
    console.log('[Email] 初始化，配置 SMTP/IMAP 连接...');
  }

  async start(): Promise<void> {
    await super.start();
    // 启动邮件轮询
    this.pollTimer = setInterval(
      () => this.pollInbox(),
      this.emailConfig.pollingIntervalMs
    );
    console.log('[Email] 适配器已启动，轮询间隔:', this.emailConfig.pollingIntervalMs, 'ms');
  }

  async stop(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    await super.stop();
  }

  async sendMessage(message: NormalizedMessage): Promise<SendResult> {
    return this.withRetry(async () => {
      const email = this.toEmail(message);
      // 实际实现中通过 SMTP 发送邮件
      console.log(`[Email] 发送邮件到 ${message.recipient.id}: ${email.subject}`);

      return {
        success: true,
        platformMessageId: `email-${Date.now()}`,
      };
    }, 'sendMessage');
  }

  async sendInteractiveMessage(
    recipient: NormalizedRecipient,
    content: MessageContent
  ): Promise<SendResult> {
    // Email 不支持真正的交互组件，转换为 HTML 链接
    const htmlContent = this.toHtmlWithLinks(content);
    const enrichedMessage: NormalizedMessage = {
      messageId: `email-interactive-${Date.now()}`,
      platform: 'email',
      direction: 'outbound',
      sender: {
        userId: 'agent', displayName: 'Agent',
        platformUserId: this.emailConfig.fromAddress, roles: [],
      },
      recipient,
      content: { text: content.text, richText: htmlContent, attachments: [] },
      conversation: { conversationId: recipient.id, isThread: false, participantCount: 2 },
      metadata: { platformMessageId: '' },
      timestamp: Date.now(),
    };

    return this.sendMessage(enrichedMessage);
  }

  async updateMessage(_messageId: string, _content: MessageContent): Promise<void> {
    // Email 不支持更新已发送的邮件
    console.warn('[Email] 不支持更新已发送的邮件');
  }

  async deleteMessage(_messageId: string): Promise<void> {
    console.warn('[Email] 不支持撤回已发送的邮件');
  }

  getAdapterInfo(): AdapterInfo {
    return {
      platform: 'email',
      version: '1.0.0',
      connected: this.status === ComponentStatus.RUNNING,
      features: ['html-content', 'attachments', 'threading'],
      rateLimits: { requestsPerMinute: 60, messagesPerSecond: 2 },
    };
  }

  // ---- 私有方法 ----

  private async pollInbox(): Promise<void> {
    // 实际实现中通过 IMAP 检查新邮件
    // 此处模拟
    try {
      // const newEmails = await imapClient.fetchUnread();
      // for (const email of newEmails) {
      //   const normalized = this.fromEmail(email);
      //   await this.dispatchMessage(normalized);
      // }
    } catch (error) {
      console.error('[Email] 轮询收件箱失败:', error);
    }
  }

  private toEmail(message: NormalizedMessage): { subject: string; body: string; to: string } {
    return {
      subject: this.extractSubject(message.content.text),
      body: message.content.richText || message.content.text,
      to: message.recipient.id,
    };
  }

  private extractSubject(text: string): string {
    // 取第一行作为主题，最多 100 字符
    const firstLine = text.split('\n')[0];
    return firstLine.length > 100 ? firstLine.slice(0, 97) + '...' : firstLine;
  }

  private toHtmlWithLinks(content: MessageContent): string {
    let html = `<div>${content.richText || content.text}</div>`;

    if (content.interactiveElements) {
      html += '<div style="margin-top: 16px;">';
      for (const el of content.interactiveElements) {
        if (el.type === 'button') {
          html += `<a href="${el.value}" style="display:inline-block;padding:8px 16px;` +
                  `background:#007bff;color:white;text-decoration:none;border-radius:4px;` +
                  `margin-right:8px;">${el.label}</a>`;
        }
      }
      html += '</div>';
    }

    return html;
  }
}
```

### 21.4.7 WebSocket 适配器

```typescript
// ============================================================
// WebSocketAdapter：WebSocket 实时通信适配器
// ============================================================

interface WebSocketAdapterConfig extends BaseAdapterConfig {
  port: number;
  path: string;
  maxConnections: number;
  heartbeatIntervalMs: number;
  authRequired: boolean;
}

interface WebSocketConnection {
  connectionId: string;
  userId: string;
  connectedAt: number;
  lastActivity: number;
  metadata: Record<string, unknown>;
}

class WebSocketAdapter extends AbstractAdapter {
  readonly platform: PlatformType = 'websocket';
  private wsConfig: WebSocketAdapterConfig;
  private connections = new Map<string, WebSocketConnection>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: WebSocketAdapterConfig) {
    super(config);
    this.wsConfig = config;
  }

  async initialize(): Promise<void> {
    await super.initialize();
    console.log(`[WebSocket] 初始化，端口: ${this.wsConfig.port}`);
  }

  async start(): Promise<void> {
    await super.start();
    // 启动 WebSocket 服务器
    // 实际实现中使用 ws 或 socket.io 库
    console.log(`[WebSocket] 服务器启动在 ws://0.0.0.0:${this.wsConfig.port}${this.wsConfig.path}`);

    // 启动心跳检测
    this.heartbeatTimer = setInterval(
      () => this.checkHeartbeats(),
      this.wsConfig.heartbeatIntervalMs
    );
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    // 关闭所有连接
    for (const [id] of this.connections) {
      this.disconnectClient(id);
    }
    await super.stop();
  }

  async sendMessage(message: NormalizedMessage): Promise<SendResult> {
    const conn = this.connections.get(message.recipient.id);
    if (!conn) {
      return { success: false, error: `用户 ${message.recipient.id} 未连接` };
    }

    // 实际实现中通过 WebSocket 发送
    const payload = JSON.stringify({
      type: 'message',
      data: {
        messageId: message.messageId,
        text: message.content.text,
        richText: message.content.richText,
        attachments: message.content.attachments,
        timestamp: message.timestamp,
      },
    });

    console.log(`[WebSocket] 发送消息到连接 ${conn.connectionId}`);
    return { success: true, platformMessageId: message.messageId };
  }

  async sendInteractiveMessage(
    recipient: NormalizedRecipient,
    content: MessageContent
  ): Promise<SendResult> {
    const conn = this.connections.get(recipient.id);
    if (!conn) {
      return { success: false, error: `用户 ${recipient.id} 未连接` };
    }

    const payload = JSON.stringify({
      type: 'interactive',
      data: {
        text: content.text,
        elements: content.interactiveElements,
      },
    });

    console.log(`[WebSocket] 发送交互消息到连接 ${conn.connectionId}`);
    return { success: true, platformMessageId: `ws-${Date.now()}` };
  }

  async updateMessage(messageId: string, content: MessageContent): Promise<void> {
    // 广播更新到所有相关连接
    const payload = JSON.stringify({
      type: 'message_update',
      data: { messageId, content: { text: content.text, richText: content.richText } },
    });
    console.log(`[WebSocket] 广播消息更新: ${messageId}`);
  }

  async deleteMessage(messageId: string): Promise<void> {
    const payload = JSON.stringify({
      type: 'message_delete',
      data: { messageId },
    });
    console.log(`[WebSocket] 广播消息删除: ${messageId}`);
  }

  getAdapterInfo(): AdapterInfo {
    return {
      platform: 'websocket',
      version: '1.0.0',
      connected: this.status === ComponentStatus.RUNNING,
      features: ['realtime', 'bidirectional', 'streaming', 'interactive'],
      rateLimits: { requestsPerMinute: 600, messagesPerSecond: 10 },
    };
  }

  /** 处理新的 WebSocket 连接 */
  handleConnection(connectionId: string, userId: string): void {
    if (this.connections.size >= this.wsConfig.maxConnections) {
      console.warn('[WebSocket] 达到最大连接数，拒绝新连接');
      return;
    }

    this.connections.set(userId, {
      connectionId,
      userId,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      metadata: {},
    });

    console.log(
      `[WebSocket] 新连接: ${connectionId} (用户: ${userId})，` +
      `当前连接数: ${this.connections.size}`
    );
  }

  /** 处理收到的 WebSocket 消息 */
  async handleIncomingMessage(userId: string, rawData: string): Promise<void> {
    const conn = this.connections.get(userId);
    if (!conn) return;

    conn.lastActivity = Date.now();

    try {
      const parsed = JSON.parse(rawData);
      const normalized: NormalizedMessage = {
        messageId: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        platform: 'websocket',
        direction: 'inbound',
        sender: {
          userId, displayName: userId, platformUserId: userId, roles: [],
        },
        recipient: { type: 'user', id: 'agent', name: 'Agent' },
        content: {
          text: parsed.text || '',
          richText: parsed.richText,
          attachments: parsed.attachments || [],
        },
        conversation: {
          conversationId: conn.connectionId,
          isThread: false,
          participantCount: 2,
        },
        metadata: {
          platformMessageId: parsed.messageId || '',
          rawPayload: parsed,
        },
        timestamp: Date.now(),
      };

      await this.dispatchMessage(normalized);
    } catch (error) {
      console.error('[WebSocket] 解析消息失败:', error);
    }
  }

  /** 获取活跃连接数 */
  getActiveConnectionCount(): number {
    return this.connections.size;
  }

  private disconnectClient(userId: string): void {
    this.connections.delete(userId);
  }

  private checkHeartbeats(): void {
    const now = Date.now();
    const timeout = this.wsConfig.heartbeatIntervalMs * 3;

    for (const [userId, conn] of this.connections) {
      if (now - conn.lastActivity > timeout) {
        console.log(`[WebSocket] 连接超时，断开: ${conn.connectionId}`);
        this.disconnectClient(userId);
      }
    }
  }
}
```

### 21.4.8 AdapterManager：统一管理所有适配器

```typescript
// ============================================================
// AdapterManager：统一管理所有平台适配器
// ============================================================

class AdapterManager implements Lifecycle {
  private adapters = new Map<PlatformType, PlatformAdapter>();
  private normalizer: MessageNormalizer;
  private eventRouter: EventRouter;
  private status: ComponentStatus = ComponentStatus.CREATED;

  constructor() {
    this.normalizer = new MessageNormalizer();
    this.eventRouter = new EventRouter();
  }

  async initialize(): Promise<void> {
    for (const [platform, adapter] of this.adapters) {
      console.log(`[AdapterManager] 初始化适配器: ${platform}`);
      await adapter.initialize();
    }
    this.status = ComponentStatus.INITIALIZED;
  }

  async start(): Promise<void> {
    for (const [platform, adapter] of this.adapters) {
      console.log(`[AdapterManager] 启动适配器: ${platform}`);
      await adapter.start();
    }
    this.status = ComponentStatus.RUNNING;
    console.log(`[AdapterManager] 已启动 ${this.adapters.size} 个适配器`);
  }

  async stop(): Promise<void> {
    for (const [platform, adapter] of this.adapters) {
      console.log(`[AdapterManager] 停止适配器: ${platform}`);
      await adapter.stop();
    }
    this.status = ComponentStatus.STOPPED;
  }

  async destroy(): Promise<void> {
    for (const [, adapter] of this.adapters) {
      await adapter.destroy();
    }
    this.adapters.clear();
    this.status = ComponentStatus.DESTROYED;
  }

  getStatus(): ComponentStatus {
    return this.status;
  }

  /** 注册适配器 */
  registerAdapter(adapter: PlatformAdapter): void {
    this.adapters.set(adapter.platform, adapter);

    // 为适配器注册统一消息处理器
    adapter.onMessage(async (message: NormalizedMessage) => {
      // 通过事件路由器分发
      await this.eventRouter.routeMessage(message);
    });

    console.log(`[AdapterManager] 注册适配器: ${adapter.platform}`);
  }

  /** 通过任意平台发送消息 */
  async sendMessage(
    platform: PlatformType,
    message: NormalizedMessage
  ): Promise<SendResult> {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      return { success: false, error: `平台 '${platform}' 无可用适配器` };
    }

    return adapter.sendMessage(message);
  }

  /** 广播消息到所有平台 */
  async broadcast(message: NormalizedMessage): Promise<Map<PlatformType, SendResult>> {
    const results = new Map<PlatformType, SendResult>();

    const promises = Array.from(this.adapters.entries()).map(
      async ([platform, adapter]) => {
        try {
          const result = await adapter.sendMessage(message);
          results.set(platform, result);
        } catch (error) {
          results.set(platform, { success: false, error: String(error) });
        }
      }
    );

    await Promise.all(promises);
    return results;
  }

  /** 获取适配器 */
  getAdapter(platform: PlatformType): PlatformAdapter | undefined {
    return this.adapters.get(platform);
  }

  /** 获取所有适配器的状态 */
  getAdaptersStatus(): Map<PlatformType, AdapterInfo> {
    const status = new Map<PlatformType, AdapterInfo>();
    for (const [platform, adapter] of this.adapters) {
      status.set(platform, adapter.getAdapterInfo());
    }
    return status;
  }

  /** 注册消息路由规则 */
  addRoute(rule: RoutingRule): void {
    this.eventRouter.addRule(rule);
  }
}

// ============================================================
// MessageNormalizer：消息规范化器
// ============================================================

class MessageNormalizer {
  private sanitizers: ContentSanitizer[] = [];

  constructor() {
    this.sanitizers = [
      new HtmlSanitizer(),
      new UrlSanitizer(),
      new MentionNormalizer(),
    ];
  }

  /** 规范化消息内容 */
  normalize(message: NormalizedMessage): NormalizedMessage {
    let content = { ...message.content };

    for (const sanitizer of this.sanitizers) {
      content = sanitizer.sanitize(content);
    }

    return { ...message, content };
  }
}

interface ContentSanitizer {
  sanitize(content: MessageContent): MessageContent;
}

class HtmlSanitizer implements ContentSanitizer {
  sanitize(content: MessageContent): MessageContent {
    // 移除潜在危险的 HTML 标签
    const cleaned = content.text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    return { ...content, text: cleaned };
  }
}

class UrlSanitizer implements ContentSanitizer {
  sanitize(content: MessageContent): MessageContent {
    // 验证附件 URL 是否安全
    const safeAttachments = content.attachments.filter(
      att => att.url.startsWith('https://') || att.url.startsWith('http://')
    );
    return { ...content, attachments: safeAttachments };
  }
}

class MentionNormalizer implements ContentSanitizer {
  sanitize(content: MessageContent): MessageContent {
    // 统一 @ 提及的格式
    // Slack: <@U12345>, Teams: <at>Name</at>, 统一为 @{userId}
    let text = content.text;
    text = text.replace(/<@(\w+)>/g, '@$1');
    text = text.replace(/<at>([^<]+)<\/at>/g, '@$1');
    return { ...content, text };
  }
}

// ============================================================
// EventRouter：事件路由器
// ============================================================

interface RoutingRule {
  name: string;
  condition: (message: NormalizedMessage) => boolean;
  target: string; // Agent ID 或 handler 名称
  priority: number;
}

class EventRouter {
  private rules: RoutingRule[] = [];
  private handlers = new Map<string, (message: NormalizedMessage) => Promise<void>>();

  addRule(rule: RoutingRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  registerHandler(
    target: string,
    handler: (message: NormalizedMessage) => Promise<void>
  ): void {
    this.handlers.set(target, handler);
  }

  async routeMessage(message: NormalizedMessage): Promise<void> {
    for (const rule of this.rules) {
      if (rule.condition(message)) {
        const handler = this.handlers.get(rule.target);
        if (handler) {
          console.log(
            `[EventRouter] 路由消息 ${message.messageId} → ${rule.target} (规则: ${rule.name})`
          );
          await handler(message);
          return;
        }
      }
    }

    console.warn(`[EventRouter] 消息 ${message.messageId} 未匹配任何路由规则`);
  }
}
```

---

## 21.5 Agent Mesh

### 21.5.1 从服务网格到 Agent 网格

服务网格（Service Mesh）是微服务架构中的基础设施层，负责处理服务间通信。Agent Mesh 将这一理念引入 Agent 系统：

- **Sidecar 模式**：每个 Agent 旁附加一个代理，拦截所有出入流量
- **流量管理**：金丝雀发布、A/B 测试、负载均衡
- **可观测性**：自动注入追踪、指标收集
- **策略执行**：认证、授权、限流

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Mesh 架构                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────┐       │
│  │              控制面 (Control Plane)               │       │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐ │       │
│  │  │服务发现│ │流量策略│ │安全策略│ │可观测配置│ │       │
│  │  └───┬────┘ └───┬────┘ └───┬────┘ └────┬─────┘ │       │
│  └──────┼──────────┼──────────┼────────────┼───────┘       │
│         │配置下发   │          │            │               │
│  ┌──────▼──────────▼──────────▼────────────▼───────┐       │
│  │              数据面 (Data Plane)                  │       │
│  │                                                   │       │
│  │  ┌──────────────┐     ┌──────────────┐           │       │
│  │  │ ┌──────────┐ │     │ ┌──────────┐ │           │       │
│  │  │ │ Agent A  │ │────▶│ │ Agent B  │ │           │       │
│  │  │ └──────────┘ │     │ └──────────┘ │           │       │
│  │  │ ┌──────────┐ │     │ ┌──────────┐ │           │       │
│  │  │ │ Sidecar  │ │◀───▶│ │ Sidecar  │ │           │       │
│  │  │ │  Proxy   │ │     │ │  Proxy   │ │           │       │
│  │  │ └──────────┘ │     │ └──────────┘ │           │       │
│  │  └──────────────┘     └──────────────┘           │       │
│  │         │                      │                  │       │
│  │  ┌──────────────┐     ┌──────────────┐           │       │
│  │  │ ┌──────────┐ │     │ ┌──────────┐ │           │       │
│  │  │ │ Agent C  │ │◀───▶│ │ Agent D  │ │           │       │
│  │  │ └──────────┘ │     │ └──────────┘ │           │       │
│  │  │ ┌──────────┐ │     │ ┌──────────┐ │           │       │
│  │  │ │ Sidecar  │ │     │ │ Sidecar  │ │           │       │
│  │  │ │  Proxy   │ │     │ │  Proxy   │ │           │       │
│  │  │ └──────────┘ │     │ └──────────┘ │           │       │
│  │  └──────────────┘     └──────────────┘           │       │
│  │                                                   │       │
│  └───────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 21.5.2 AgentMesh 核心实现

```typescript
// ============================================================
// AgentMesh：Agent 网格核心
// 断路器实现（CircuitBreaker）来自第 18 章 §18.2.2
// ============================================================

/** Mesh 中的 Agent 节点 */
interface MeshNode {
  agentId: string;
  endpoint: string;
  sidecar: AgentSidecar;
  metadata: Record<string, unknown>;
  joinedAt: number;
}

/** Mesh 配置 */
interface MeshConfig {
  loadBalancingStrategy: 'round-robin' | 'least-connections' | 'weighted' | 'random';
  circuitBreaker: CircuitBreakerConfig;
  retryPolicy: MeshRetryPolicy;
  timeout: number;
  tracing: boolean;
  mtls: boolean;
}

interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenRequests: number;
}

interface MeshRetryPolicy {
  maxRetries: number;
  backoffMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

class AgentMesh implements Lifecycle {
  private nodes = new Map<string, MeshNode>();
  private config: MeshConfig;
  private trafficManager: AgentTrafficManager;
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private status: ComponentStatus = ComponentStatus.CREATED;

  constructor(config?: Partial<MeshConfig>) {
    this.config = {
      loadBalancingStrategy: 'least-connections',
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        resetTimeoutMs: 30000,
        halfOpenRequests: 3,
      },
      retryPolicy: {
        maxRetries: 3,
        backoffMs: 1000,
        backoffMultiplier: 2,
        retryableErrors: ['TIMEOUT', 'SERVICE_UNAVAILABLE', 'RATE_LIMITED'],
      },
      timeout: 30000,
      tracing: true,
      mtls: true,
      ...config,
    };
    this.trafficManager = new AgentTrafficManager();
  }

  async initialize(): Promise<void> {
    this.status = ComponentStatus.INITIALIZED;
  }

  async start(): Promise<void> {
    this.status = ComponentStatus.RUNNING;
    console.log('[Mesh] Agent Mesh 已启动');
  }

  async stop(): Promise<void> {
    for (const [, node] of this.nodes) {
      await node.sidecar.stop();
    }
    this.status = ComponentStatus.STOPPED;
  }

  async destroy(): Promise<void> {
    this.nodes.clear();
    this.circuitBreakers.clear();
    this.status = ComponentStatus.DESTROYED;
  }

  getStatus(): ComponentStatus {
    return this.status;
  }

  /** 将 Agent 加入 Mesh */
  async joinMesh(agentId: string, endpoint: string): Promise<MeshNode> {
    // 创建 Sidecar
    const sidecar = new AgentSidecar(agentId, {
      tracing: this.config.tracing,
      circuitBreaker: this.config.circuitBreaker,
      retryPolicy: this.config.retryPolicy,
    });

    await sidecar.initialize();
    await sidecar.start();

    const node: MeshNode = {
      agentId,
      endpoint,
      sidecar,
      metadata: {},
      joinedAt: Date.now(),
    };

    this.nodes.set(agentId, node);

    // 初始化断路器
    if (this.config.circuitBreaker.enabled) {
      this.circuitBreakers.set(agentId, new CircuitBreaker(this.config.circuitBreaker));
    }

    console.log(`[Mesh] Agent '${agentId}' 加入 Mesh，端点: ${endpoint}`);
    return node;
  }

  /** 将 Agent 移出 Mesh */
  async leaveMesh(agentId: string): Promise<void> {
    const node = this.nodes.get(agentId);
    if (!node) return;

    await node.sidecar.stop();
    this.nodes.delete(agentId);
    this.circuitBreakers.delete(agentId);

    console.log(`[Mesh] Agent '${agentId}' 离开 Mesh`);
  }

  /** 通过 Mesh 发送请求（经过 Sidecar） */
  async sendRequest(
    fromAgentId: string,
    toAgentId: string,
    request: MeshRequest
  ): Promise<MeshResponse> {
    const fromNode = this.nodes.get(fromAgentId);
    const toNode = this.nodes.get(toAgentId);

    if (!fromNode) throw new Error(`发送方 Agent '${fromAgentId}' 不在 Mesh 中`);
    if (!toNode) throw new Error(`接收方 Agent '${toAgentId}' 不在 Mesh 中`);

    // 检查流量策略（金丝雀、A/B 测试等）
    const targetAgent = this.trafficManager.resolveTarget(toAgentId, request);

    // 检查断路器
    const cb = this.circuitBreakers.get(targetAgent);
    if (cb && !cb.allowRequest()) {
      return {
        requestId: request.requestId,
        status: 'circuit_open',
        error: `断路器开启，Agent '${targetAgent}' 暂时不可用`,
        latencyMs: 0,
        timestamp: Date.now(),
      };
    }

    // 通过发送方 Sidecar 拦截出站请求
    const intercepted = await fromNode.sidecar.interceptOutbound(request);

    // 通过接收方 Sidecar 拦截入站请求
    const startTime = Date.now();
    try {
      const result = await toNode.sidecar.interceptInbound(intercepted);

      const response: MeshResponse = {
        requestId: request.requestId,
        status: 'success',
        data: result,
        latencyMs: Date.now() - startTime,
        timestamp: Date.now(),
      };

      // 记录成功
      cb?.recordSuccess();
      return response;
    } catch (error) {
      // 记录失败
      cb?.recordFailure();

      return {
        requestId: request.requestId,
        status: 'error',
        error: String(error),
        latencyMs: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }
  }

  /** 获取 Mesh 拓扑 */
  getTopology(): MeshTopology {
    const nodes: MeshNodeInfo[] = [];
    for (const [, node] of this.nodes) {
      const cb = this.circuitBreakers.get(node.agentId);
      nodes.push({
        agentId: node.agentId,
        endpoint: node.endpoint,
        sidecarStatus: node.sidecar.getStatus(),
        circuitBreakerState: cb?.getState() || 'closed',
        joinedAt: node.joinedAt,
      });
    }

    return {
      totalNodes: nodes.length,
      nodes,
      trafficRules: this.trafficManager.getRules(),
    };
  }

  /** 获取流量管理器 */
  getTrafficManager(): AgentTrafficManager {
    return this.trafficManager;
  }
}

interface MeshRequest {
  requestId: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  metadata: Record<string, unknown>;
}

interface MeshResponse {
  requestId: string;
  status: 'success' | 'error' | 'circuit_open' | 'timeout';
  data?: unknown;
  error?: string;
  latencyMs: number;
  timestamp: number;
}

interface MeshTopology {
  totalNodes: number;
  nodes: MeshNodeInfo[];
  trafficRules: TrafficRule[];
}

interface MeshNodeInfo {
  agentId: string;
  endpoint: string;
  sidecarStatus: ComponentStatus;
  circuitBreakerState: string;
  joinedAt: number;
}
```

### 21.5.3 AgentSidecar 实现

```typescript
// ============================================================
// AgentSidecar：Agent 侧车代理
// ============================================================

interface SidecarConfig {
  tracing: boolean;
  circuitBreaker: CircuitBreakerConfig;
  retryPolicy: MeshRetryPolicy;
}

class AgentSidecar implements Lifecycle {
  private agentId: string;
  private config: SidecarConfig;
  private status: ComponentStatus = ComponentStatus.CREATED;
  private metrics: SidecarMetrics;
  private policies: SidecarPolicy[] = [];

  constructor(agentId: string, config: SidecarConfig) {
    this.agentId = agentId;
    this.config = config;
    this.metrics = {
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      activeRequests: 0,
      latencies: [],
    };
  }

  async initialize(): Promise<void> {
    // 注册默认策略
    this.policies = [
      new AuthenticationPolicy(this.agentId),
      new RateLimitPolicy(100), // 100 req/min
      new LoggingPolicy(this.agentId),
    ];
    this.status = ComponentStatus.INITIALIZED;
  }

  async start(): Promise<void> {
    this.status = ComponentStatus.RUNNING;
  }

  async stop(): Promise<void> {
    this.status = ComponentStatus.STOPPED;
  }

  async destroy(): Promise<void> {
    this.status = ComponentStatus.DESTROYED;
  }

  getStatus(): ComponentStatus {
    return this.status;
  }

  /** 拦截出站请求 */
  async interceptOutbound(request: MeshRequest): Promise<MeshRequest> {
    this.metrics.totalRequests++;
    this.metrics.activeRequests++;

    let enriched = { ...request };

    // 注入追踪信息
    if (this.config.tracing) {
      enriched.headers = {
        ...enriched.headers,
        'x-trace-id': enriched.headers['x-trace-id'] || this.generateTraceId(),
        'x-span-id': this.generateSpanId(),
        'x-source-agent': this.agentId,
      };
    }

    // 执行出站策略
    for (const policy of this.policies) {
      enriched = await policy.applyOutbound(enriched);
    }

    return enriched;
  }

  /** 拦截入站请求 */
  async interceptInbound(request: MeshRequest): Promise<unknown> {
    const startTime = Date.now();

    try {
      // 执行入站策略
      let processed = { ...request };
      for (const policy of this.policies) {
        processed = await policy.applyInbound(processed);
      }

      // 模拟转发到实际 Agent 处理
      const result = await this.forwardToAgent(processed);

      // 记录指标
      const latency = Date.now() - startTime;
      this.recordLatency(latency);
      this.metrics.successCount++;
      this.metrics.activeRequests--;

      return result;
    } catch (error) {
      this.metrics.failureCount++;
      this.metrics.activeRequests--;
      throw error;
    }
  }

  /** 添加自定义策略 */
  addPolicy(policy: SidecarPolicy): void {
    this.policies.push(policy);
  }

  /** 获取指标 */
  getMetrics(): SidecarMetrics {
    return { ...this.metrics, latencies: [] }; // 不暴露原始延迟数据
  }

  // ---- 私有方法 ----

  private async forwardToAgent(request: MeshRequest): Promise<unknown> {
    // 实际实现中转发到 Agent 进程
    return { processed: true, agentId: this.agentId, method: request.method };
  }

  private recordLatency(latencyMs: number): void {
    this.metrics.latencies.push(latencyMs);
    // 保留最近 1000 条记录
    if (this.metrics.latencies.length > 1000) {
      this.metrics.latencies.shift();
    }

    // 更新统计指标
    const sorted = [...this.metrics.latencies].sort((a, b) => a - b);
    const len = sorted.length;
    this.metrics.avgLatencyMs = sorted.reduce((s, v) => s + v, 0) / len;
    this.metrics.p95LatencyMs = sorted[Math.floor(len * 0.95)] || 0;
    this.metrics.p99LatencyMs = sorted[Math.floor(len * 0.99)] || 0;
  }

  private generateTraceId(): string {
    return `trace-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private generateSpanId(): string {
    return `span-${Math.random().toString(36).slice(2, 10)}`;
  }
}

interface SidecarMetrics {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  activeRequests: number;
  latencies: number[];
}

// ============================================================
// Sidecar 策略接口及实现
// ============================================================

interface SidecarPolicy {
  name: string;
  applyOutbound(request: MeshRequest): Promise<MeshRequest>;
  applyInbound(request: MeshRequest): Promise<MeshRequest>;
}

class AuthenticationPolicy implements SidecarPolicy {
  name = 'authentication';
  private agentId: string;

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  async applyOutbound(request: MeshRequest): Promise<MeshRequest> {
    // 注入认证 token
    return {
      ...request,
      headers: {
        ...request.headers,
        'x-agent-auth': `Bearer mesh-token-${this.agentId}`,
      },
    };
  }

  async applyInbound(request: MeshRequest): Promise<MeshRequest> {
    // 验证认证 token
    const authHeader = request.headers['x-agent-auth'];
    if (!authHeader || !authHeader.startsWith('Bearer mesh-token-')) {
      throw new Error('Mesh 认证失败：无效的 Agent Token');
    }
    return request;
  }
}

class RateLimitPolicy implements SidecarPolicy {
  name = 'rate-limit';
  private limiter: TokenBucketRateLimiter;

  constructor(requestsPerMinute: number) {
    this.limiter = new TokenBucketRateLimiter(requestsPerMinute, requestsPerMinute);
  }

  async applyOutbound(request: MeshRequest): Promise<MeshRequest> {
    return request; // 出站不限流
  }

  async applyInbound(request: MeshRequest): Promise<MeshRequest> {
    if (!this.limiter.tryAcquire()) {
      throw new Error('RATE_LIMITED: 请求频率超限');
    }
    return request;
  }
}

class LoggingPolicy implements SidecarPolicy {
  name = 'logging';
  private agentId: string;

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  async applyOutbound(request: MeshRequest): Promise<MeshRequest> {
    console.log(
      `[Sidecar:${this.agentId}] 出站 → ${request.method} ${request.path} ` +
      `[trace:${request.headers['x-trace-id']}]`
    );
    return request;
  }

  async applyInbound(request: MeshRequest): Promise<MeshRequest> {
    console.log(
      `[Sidecar:${this.agentId}] 入站 ← ${request.method} ${request.path} ` +
      `来自 ${request.headers['x-source-agent']} [trace:${request.headers['x-trace-id']}]`
    );
    return request;
  }
}
```

### 21.5.4 断路器

> **断路器（Circuit Breaker）**是保护 Agent 系统免受下游服务故障级联影响的核心弹性模式。在 Agent Mesh 中，每个节点通过断路器监控对其他节点的调用成功率：当失败率超过阈值时断路器"打开"，拒绝后续请求以防止雪崩；经过冷却期后进入"半开"状态，允许少量探测请求通过以检测服务是否恢复。`AgentMesh` 中使用的 `CircuitBreakerConfig`（`failureThreshold`、`resetTimeoutMs`、`halfOpenRequests`）定义了断路器的核心参数。完整的生产级分层断路器实现（含父子层级级联熔断、慢调用率检测、滑动窗口统计）详见 **第 18 章 §18.2.2 分层熔断器（`HierarchicalCircuitBreaker`）**。

### 21.5.5 流量管理器

```typescript
// ============================================================
// AgentTrafficManager：流量管理（金丝雀、A/B 测试）
// ============================================================

interface TrafficRule {
  name: string;
  type: 'canary' | 'ab-test' | 'weighted' | 'header-based';
  sourceAgent: string;
  targetAgent: string;
  config: TrafficRuleConfig;
  enabled: boolean;
}

interface TrafficRuleConfig {
  /** 金丝雀发布：新版本流量百分比 */
  canaryPercentage?: number;
  canaryVersion?: string;
  /** A/B 测试：各版本权重 */
  variants?: { agentId: string; weight: number }[];
  /** 基于 Header 的路由 */
  headerMatch?: { header: string; value: string; target: string };
}

class AgentTrafficManager {
  private rules: TrafficRule[] = [];
  private abTestResults = new Map<string, ABTestResult>();

  /** 添加流量规则 */
  addRule(rule: TrafficRule): void {
    this.rules.push(rule);
    console.log(
      `[TrafficManager] 添加规则: ${rule.name} (${rule.type}), ` +
      `${rule.sourceAgent} → ${rule.targetAgent}`
    );
  }

  /** 移除流量规则 */
  removeRule(name: string): void {
    this.rules = this.rules.filter(r => r.name !== name);
  }

  /** 获取所有规则 */
  getRules(): TrafficRule[] {
    return [...this.rules];
  }

  /** 解析目标 Agent（应用流量规则） */
  resolveTarget(originalTarget: string, request: MeshRequest): string {
    for (const rule of this.rules) {
      if (!rule.enabled || rule.targetAgent !== originalTarget) continue;

      switch (rule.type) {
        case 'canary':
          return this.applyCanary(rule, request);
        case 'ab-test':
          return this.applyABTest(rule, request);
        case 'weighted':
          return this.applyWeighted(rule);
        case 'header-based':
          return this.applyHeaderBased(rule, request);
      }
    }

    return originalTarget;
  }

  /** 配置金丝雀发布 */
  setupCanary(
    targetAgent: string,
    canaryAgent: string,
    percentage: number
  ): void {
    this.addRule({
      name: `canary-${targetAgent}-${canaryAgent}`,
      type: 'canary',
      sourceAgent: '*',
      targetAgent,
      config: { canaryPercentage: percentage, canaryVersion: canaryAgent },
      enabled: true,
    });
    console.log(
      `[TrafficManager] 金丝雀发布: ${percentage}% 流量 → ${canaryAgent}`
    );
  }

  /** 配置 A/B 测试 */
  setupABTest(
    testName: string,
    targetAgent: string,
    variants: { agentId: string; weight: number }[]
  ): void {
    this.addRule({
      name: `ab-${testName}`,
      type: 'ab-test',
      sourceAgent: '*',
      targetAgent,
      config: { variants },
      enabled: true,
    });

    this.abTestResults.set(testName, {
      testName,
      variants: variants.map(v => ({
        agentId: v.agentId,
        requests: 0,
        successes: 0,
        avgLatencyMs: 0,
})),
      startedAt: Date.now(),
    });

    console.log(
      `[TrafficManager] A/B 测试 '${testName}': ` +
      variants.map(v => `${v.agentId}(${v.weight}%)`).join(' vs ')
    );
  }

  /** 获取 A/B 测试结果 */
  getABTestResults(testName: string): ABTestResult | undefined {
    return this.abTestResults.get(testName);
  }

  // ---- 私有方法 ----

  private applyCanary(rule: TrafficRule, _request: MeshRequest): string {
    const percentage = rule.config.canaryPercentage || 0;
    if (Math.random() * 100 < percentage) {
      return rule.config.canaryVersion || rule.targetAgent;
    }
    return rule.targetAgent;
  }

  private applyABTest(rule: TrafficRule, _request: MeshRequest): string {
    const variants = rule.config.variants || [];
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    let random = Math.random() * totalWeight;

    for (const variant of variants) {
      random -= variant.weight;
      if (random <= 0) return variant.agentId;
    }

    return rule.targetAgent;
  }

  private applyWeighted(rule: TrafficRule): string {
    return this.applyABTest(rule, {} as MeshRequest);
  }

  private applyHeaderBased(rule: TrafficRule, request: MeshRequest): string {
    const match = rule.config.headerMatch;
    if (match && request.headers[match.header] === match.value) {
      return match.target;
    }
    return rule.targetAgent;
  }
}

interface ABTestResult {
  testName: string;
  variants: ABTestVariant[];
  startedAt: number;
}

interface ABTestVariant {
  agentId: string;
  requests: number;
  successes: number;
  avgLatencyMs: number;
}
```

---
## 21.6 模型网关

### 21.6.1 为什么需要统一模型网关

在一个 Agent 平台中，不同的 Agent 可能使用不同的模型提供商（OpenAI、Anthropic、Google、本地部署模型等）。直接对接每个提供商会导致：

- **接口碎片化**：每个提供商的 API 格式不同
- **运维复杂度**：密钥管理、限流策略分散
- **成本失控**：无法统一追踪和控制模型调用费用
- **可靠性风险**：单点故障无法自动切换

模型网关（Model Gateway）是一个中心化的模型访问层，对上层 Agent 提供统一 API，对下层管理多个模型提供商。

```
┌─────────────────────────────────────────────────────────────┐
│                    模型网关架构                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Agent A    Agent B    Agent C    Agent D    Agent E        │
│    │          │          │          │          │            │
│    └──────────┴──────────┴──────────┴──────────┘            │
│                       │                                     │
│              ┌────────▼────────┐                            │
│              │   统一 API 层    │                            │
│              └────────┬────────┘                            │
│                       │                                     │
│  ┌────────────────────▼─────────────────────┐              │
│  │            Model Gateway                  │              │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌─────────┐ │              │
│  │  │路由器│ │限流器│ │缓存  │ │成本追踪 │ │              │
│  │  └──┬───┘ └──┬───┘ └──┬───┘ └────┬────┘ │              │
│  │     └────────┴────────┴──────────┘       │              │
│  │                   │                       │              │
│  │  ┌────────────────▼──────────────────┐   │              │
│  │  │        Fallback Chain Engine       │   │              │
│  │  └────────────────┬──────────────────┘   │              │
│  └───────────────────┼──────────────────────┘              │
│                      │                                      │
│  ┌─────────┬─────────┼─────────┬─────────┐                │
│  ▼         ▼         ▼         ▼         ▼                │
│ OpenAI  Anthropic  Google    Local    DeepSeek             │
│ Adapter  Adapter   Adapter  Adapter   Adapter              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 21.6.2 模型网关类型定义

```typescript
// ============================================================
// 模型网关类型定义
// ============================================================

/** 模型提供商标识 */
type ModelProvider = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'zhipu' | 'local' | 'azure';

/** 统一的模型请求 */
interface UnifiedModelRequest {
  requestId: string;
  /** 请求的 Agent */
  agentId: string;
  /** 租户 ID */
  tenantId: string;
  /** 指定模型或让网关自动选择 */
  model?: string;
  /** 模型选择偏好 */
  preferences?: ModelPreferences;
  /** 消息列表 */
  messages: ChatMessage[];
  /** 生成参数 */
  parameters: GenerationParameters;
  /** 工具定义（Function Calling） */
  tools?: ToolDefinition[];
  /** 流式响应 */
  stream?: boolean;
  /** 请求标签（用于路由和计费） */
  tags?: Record<string, string>;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

interface GenerationParameters {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
}

interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

interface ModelPreferences {
  /** 偏好的提供商 */
  preferredProvider?: ModelProvider;
  /** 质量要求 */
  qualityLevel: 'economy' | 'standard' | 'premium';
  /** 最大延迟要求 */
  maxLatencyMs?: number;
  /** 最大成本限制（每次调用） */
  maxCostPerCall?: number;
  /** 是否需要 Function Calling 支持 */
  requiresFunctionCalling?: boolean;
  /** 是否需要视觉能力 */
  requiresVision?: boolean;
  /** 最小上下文窗口 */
  minContextWindow?: number;
}

/** 统一的模型响应 */
interface UnifiedModelResponse {
  requestId: string;
  provider: ModelProvider;
  model: string;
  content: string;
  toolCalls?: ToolCall[];
  usage: TokenUsage;
  cost: CostInfo;
  latencyMs: number;
  cached: boolean;
  metadata: ResponseMetadata;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface CostInfo {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
}

interface ResponseMetadata {
  provider: ModelProvider;
  model: string;
  finishReason: string;
  retries: number;
  fallbackUsed: boolean;
  originalProvider?: ModelProvider;
}
```

### 21.6.3 ProviderAdapter 接口与实现

```typescript
// ============================================================
// ProviderAdapter：模型提供商适配器
// ============================================================

/** 模型提供商适配器接口 */
interface ProviderAdapter {
  readonly provider: ModelProvider;

  /** 获取可用模型列表 */
  listModels(): ModelInfo[];

  /** 发送补全请求 */
  complete(request: ProviderRequest): Promise<ProviderResponse>;

  /** 发送流式补全请求 */
  completeStream(request: ProviderRequest): AsyncIterable<ProviderStreamChunk>;

  /** 检查提供商是否可用 */
  healthCheck(): Promise<boolean>;

  /** 获取当前速率限制状态 */
  getRateLimitStatus(): RateLimitStatus;
}

interface ModelInfo {
  id: string;
  provider: ModelProvider;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsToolCalling: boolean;
  supportsVision: boolean;
  supportsStreaming: boolean;
  inputPricePer1kTokens: number;
  outputPricePer1kTokens: number;
  qualityTier: 'economy' | 'standard' | 'premium';
}

interface ProviderRequest {
  model: string;
  messages: ChatMessage[];
  parameters: GenerationParameters;
  tools?: ToolDefinition[];
  stream?: boolean;
}

interface ProviderResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: TokenUsage;
  finishReason: string;
  latencyMs: number;
}

interface ProviderStreamChunk {
  content?: string;
  toolCall?: Partial<ToolCall>;
  done: boolean;
  usage?: TokenUsage;
}

interface RateLimitStatus {
  remainingRequests: number;
  remainingTokens: number;
  resetAt: number;
}

// ---- OpenAI 适配器 ----

class OpenAIAdapter implements ProviderAdapter {
  readonly provider: ModelProvider = 'openai';
  private apiKey: string;
  private baseUrl: string;
  private rateLimitState: RateLimitStatus;

  constructor(config: { apiKey: string; baseUrl?: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.rateLimitState = { remainingRequests: 10000, remainingTokens: 1000000, resetAt: 0 };
  }

  listModels(): ModelInfo[] {
    return [
      {
        id: 'gpt-4o', provider: 'openai', displayName: 'GPT-4o',
        contextWindow: 128000, maxOutputTokens: 16384,
        supportsToolCalling: true, supportsVision: true, supportsStreaming: true,
        inputPricePer1kTokens: 0.0025, outputPricePer1kTokens: 0.01,
        qualityTier: 'premium',
      },
      {
        id: 'gpt-4o-mini', provider: 'openai', displayName: 'GPT-4o Mini',
        contextWindow: 128000, maxOutputTokens: 16384,
        supportsToolCalling: true, supportsVision: true, supportsStreaming: true,
        inputPricePer1kTokens: 0.00015, outputPricePer1kTokens: 0.0006,
        qualityTier: 'economy',
      },
      {
        id: 'o1', provider: 'openai', displayName: 'o1',
        contextWindow: 200000, maxOutputTokens: 100000,
        supportsToolCalling: true, supportsVision: true, supportsStreaming: true,
        inputPricePer1kTokens: 0.015, outputPricePer1kTokens: 0.06,
        qualityTier: 'premium',
      },
      {
        id: 'o3-mini', provider: 'openai', displayName: 'o3 Mini',
        contextWindow: 200000, maxOutputTokens: 100000,
        supportsToolCalling: true, supportsVision: true, supportsStreaming: true,
        inputPricePer1kTokens: 0.0011, outputPricePer1kTokens: 0.0044,
        qualityTier: 'standard',
      },
    ];
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const startTime = Date.now();

    // 转换为 OpenAI API 格式
    const openaiPayload = {
      model: request.model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.name ? { name: m.name } : {}),
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
        ...(m.toolCalls ? { tool_calls: m.toolCalls.map(tc => ({
          id: tc.id, type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })) } : {}),
      })),
      temperature: request.parameters.temperature,
      max_tokens: request.parameters.maxTokens,
      top_p: request.parameters.topP,
      frequency_penalty: request.parameters.frequencyPenalty,
      presence_penalty: request.parameters.presencePenalty,
      stop: request.parameters.stop,
      ...(request.tools ? {
        tools: request.tools.map(t => ({
          type: 'function' as const,
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
      } : {}),
    };

    // 实际实现中调用 OpenAI API
    // const response = await fetch(`${this.baseUrl}/chat/completions`, { ... });

    // 模拟响应
    const latencyMs = Date.now() - startTime;
    return {
      content: `[OpenAI ${request.model}] 模拟响应`,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      finishReason: 'stop',
      latencyMs,
    };
  }

  async *completeStream(request: ProviderRequest): AsyncIterable<ProviderStreamChunk> {
    // 实际实现中使用 SSE 流式读取
    yield { content: '[OpenAI Stream] ', done: false };
    yield { content: '模拟流式', done: false };
    yield { content: '响应', done: false };
    yield {
      done: true,
      usage: { promptTokens: 100, completionTokens: 30, totalTokens: 130 },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      // 实际实现中调用 /models 端点
      return true;
    } catch {
      return false;
    }
  }

  getRateLimitStatus(): RateLimitStatus {
    return { ...this.rateLimitState };
  }
}

// ---- Anthropic 适配器 ----

class AnthropicAdapter implements ProviderAdapter {
  readonly provider: ModelProvider = 'anthropic';
  private apiKey: string;

  constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey;
  }

  listModels(): ModelInfo[] {
    return [
      {
        id: 'claude-sonnet-4-20250514', provider: 'anthropic', displayName: 'Claude Sonnet 4',
        contextWindow: 200000, maxOutputTokens: 64000,
        supportsToolCalling: true, supportsVision: true, supportsStreaming: true,
        inputPricePer1kTokens: 0.003, outputPricePer1kTokens: 0.015,
        qualityTier: 'standard',
      },
      {
        id: 'claude-sonnet-4', provider: 'anthropic', displayName: 'Claude Sonnet 4',
        contextWindow: 200000, maxOutputTokens: 64000,
        supportsToolCalling: true, supportsVision: true, supportsStreaming: true,
        inputPricePer1kTokens: 0.003, outputPricePer1kTokens: 0.015,
        qualityTier: 'standard',
      },
      {
        id: 'claude-opus-4-20250514', provider: 'anthropic', displayName: 'Claude Opus 4',
        contextWindow: 200000, maxOutputTokens: 64000,
        supportsToolCalling: true, supportsVision: true, supportsStreaming: true,
        inputPricePer1kTokens: 0.015, outputPricePer1kTokens: 0.075,
        qualityTier: 'premium',
      },
      {
        id: 'claude-opus-4', provider: 'anthropic', displayName: 'Claude Opus 4',
        contextWindow: 200000, maxOutputTokens: 128000,
        supportsToolCalling: true, supportsVision: true, supportsStreaming: true,
        inputPricePer1kTokens: 0.015, outputPricePer1kTokens: 0.075,
        qualityTier: 'premium',
      },
      {
        id: 'claude-haiku-3-5', provider: 'anthropic', displayName: 'Claude 3.5 Haiku',
        contextWindow: 200000, maxOutputTokens: 8192,
        supportsToolCalling: true, supportsVision: true, supportsStreaming: true,
        inputPricePer1kTokens: 0.0008, outputPricePer1kTokens: 0.004,
        qualityTier: 'economy',
      },
    ];
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const startTime = Date.now();

    // 转换为 Anthropic Messages API 格式
    const systemMessage = request.messages.find(m => m.role === 'system');
    const nonSystemMessages = request.messages.filter(m => m.role !== 'system');

    const anthropicPayload = {
      model: request.model,
      max_tokens: request.parameters.maxTokens || 4096,
      system: systemMessage?.content,
      messages: nonSystemMessages.map(m => ({
        role: m.role === 'tool' ? 'user' as const : m.role as 'user' | 'assistant',
        content: m.content,
      })),
      temperature: request.parameters.temperature,
      top_p: request.parameters.topP,
      ...(request.tools ? {
        tools: request.tools.map(t => ({
          name: t.name, description: t.description, input_schema: t.parameters,
        })),
      } : {}),
    };

    // 模拟响应
    return {
      content: `[Anthropic ${request.model}] 模拟响应`,
      usage: { promptTokens: 120, completionTokens: 60, totalTokens: 180 },
      finishReason: 'end_turn',
      latencyMs: Date.now() - startTime,
    };
  }

  async *completeStream(request: ProviderRequest): AsyncIterable<ProviderStreamChunk> {
    yield { content: '[Anthropic Stream] ', done: false };
    yield { content: '模拟流式响应', done: false };
    yield {
      done: true,
      usage: { promptTokens: 120, completionTokens: 40, totalTokens: 160 },
    };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  getRateLimitStatus(): RateLimitStatus {
    return { remainingRequests: 5000, remainingTokens: 500000, resetAt: 0 };
  }
}

// ---- Google 适配器 ----

class GoogleAdapter implements ProviderAdapter {
  readonly provider: ModelProvider = 'google';
  private apiKey: string;

  constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey;
  }

  listModels(): ModelInfo[] {
    return [
      {
        id: 'gemini-3-flash', provider: 'google', displayName: 'Gemini 3 Flash',
        contextWindow: 1000000, maxOutputTokens: 16384,
        supportsToolCalling: true, supportsVision: true, supportsStreaming: true,
        inputPricePer1kTokens: 0.0001, outputPricePer1kTokens: 0.0004,
        qualityTier: 'economy',
      },
      {
        id: 'gemini-3-pro', provider: 'google', displayName: 'Gemini 3 Pro',
        contextWindow: 1000000, maxOutputTokens: 65536,
        supportsToolCalling: true, supportsVision: true, supportsStreaming: true,
        inputPricePer1kTokens: 0.00125, outputPricePer1kTokens: 0.01,
        qualityTier: 'premium',
      },
    ];
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const startTime = Date.now();
    // 转换为 Google Generative AI 格式
    return {
      content: `[Google ${request.model}] 模拟响应`,
      usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120 },
      finishReason: 'STOP',
      latencyMs: Date.now() - startTime,
    };
  }

  async *completeStream(request: ProviderRequest): AsyncIterable<ProviderStreamChunk> {
    yield { content: '[Google Stream] 模拟', done: false };
    yield { done: true, usage: { promptTokens: 80, completionTokens: 20, totalTokens: 100 } };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  getRateLimitStatus(): RateLimitStatus {
    return { remainingRequests: 15000, remainingTokens: 2000000, resetAt: 0 };
  }
}

// ---- DeepSeek 适配器 ----

class DeepSeekAdapter implements ProviderAdapter {
  readonly provider: ModelProvider = 'deepseek';
  private apiKey: string;

  constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey;
  }

  listModels(): ModelInfo[] {
    return [
      {
        id: 'deepseek-chat', provider: 'deepseek', displayName: 'DeepSeek Chat',
        contextWindow: 64000, maxOutputTokens: 8192,
        supportsToolCalling: true, supportsVision: false, supportsStreaming: true,
        inputPricePer1kTokens: 0.00014, outputPricePer1kTokens: 0.00028,
        qualityTier: 'economy',
      },
      {
        id: 'deepseek-reasoner', provider: 'deepseek', displayName: 'DeepSeek Reasoner',
        contextWindow: 64000, maxOutputTokens: 8192,
        supportsToolCalling: false, supportsVision: false, supportsStreaming: true,
        inputPricePer1kTokens: 0.00055, outputPricePer1kTokens: 0.0022,
        qualityTier: 'standard',
      },
      {
        id: 'deepseek-r1', provider: 'deepseek', displayName: 'DeepSeek R1',
        contextWindow: 128000, maxOutputTokens: 16384,
        supportsToolCalling: true, supportsVision: false, supportsStreaming: true,
        inputPricePer1kTokens: 0.00055, outputPricePer1kTokens: 0.0022,
        qualityTier: 'premium',
      },
    ];
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const startTime = Date.now();
    return {
      content: `[DeepSeek ${request.model}] 模拟响应`,
      usage: { promptTokens: 90, completionTokens: 45, totalTokens: 135 },
      finishReason: 'stop',
      latencyMs: Date.now() - startTime,
    };
  }

  async *completeStream(request: ProviderRequest): AsyncIterable<ProviderStreamChunk> {
    yield { content: '[DeepSeek Stream] 模拟', done: false };
    yield { done: true, usage: { promptTokens: 90, completionTokens: 25, totalTokens: 115 } };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  getRateLimitStatus(): RateLimitStatus {
    return { remainingRequests: 20000, remainingTokens: 3000000, resetAt: 0 };
  }
}

// ---- GLM (智谱) 适配器 ----

class GLMAdapter implements ProviderAdapter {
  readonly provider: ModelProvider = 'zhipu';
  private apiKey: string;

  constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey;
  }

  listModels(): ModelInfo[] {
    return [
      {
        id: 'glm-5', provider: 'zhipu', displayName: 'GLM-5',
        contextWindow: 128000, maxOutputTokens: 16384,
        supportsToolCalling: true, supportsVision: true, supportsStreaming: true,
        inputPricePer1kTokens: 0.001, outputPricePer1kTokens: 0.002,
        qualityTier: 'standard',
      },
    ];
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const startTime = Date.now();
    return {
      content: `[GLM ${request.model}] 模拟响应`,
      usage: { promptTokens: 85, completionTokens: 42, totalTokens: 127 },
      finishReason: 'stop',
      latencyMs: Date.now() - startTime,
    };
  }

  async *completeStream(request: ProviderRequest): AsyncIterable<ProviderStreamChunk> {
    yield { content: '[GLM Stream] 模拟', done: false };
    yield { content: '流式响应', done: true };
  }

  getRateLimitStatus(): RateLimitStatus {
    return { remainingRequests: 10000, remainingTokens: 1500000, resetAt: 0 };
  }
}
```

### 21.6.4 FallbackChainExecutor

```typescript
// ============================================================
// FallbackChainExecutor：降级链执行器
// ============================================================

interface FallbackChain {
  name: string;
  steps: FallbackStep[];
}

interface FallbackStep {
  provider: ModelProvider;
  model: string;
  /** 在何种条件下降级 */
  failoverOn: ('error' | 'timeout' | 'rate_limit' | 'quality')[];
  /** 超时时间 */
  timeoutMs: number;
}

class FallbackChainExecutor {
  private providers = new Map<ModelProvider, ProviderAdapter>();
  private chains = new Map<string, FallbackChain>();

  registerProvider(adapter: ProviderAdapter): void {
    this.providers.set(adapter.provider, adapter);
  }

  registerChain(chain: FallbackChain): void {
    this.chains.set(chain.name, chain);
    console.log(
      `[FallbackChain] 注册降级链 '${chain.name}': ` +
      chain.steps.map(s => `${s.provider}/${s.model}`).join(' → ')
    );
  }

  /** 执行降级链 */
  async execute(
    chainName: string,
    request: ProviderRequest
  ): Promise<FallbackExecutionResult> {
    const chain = this.chains.get(chainName);
    if (!chain) throw new Error(`降级链 '${chainName}' 未注册`);

    const attempts: FallbackAttempt[] = [];

    for (let i = 0; i < chain.steps.length; i++) {
      const step = chain.steps[i];
      const provider = this.providers.get(step.provider);

      if (!provider) {
        attempts.push({
          stepIndex: i,
          provider: step.provider,
          model: step.model,
          success: false,
          error: `提供商 '${step.provider}' 未注册`,
          latencyMs: 0,
        });
        continue;
      }

      // 检查提供商健康状态
      const healthy = await provider.healthCheck();
      if (!healthy) {
        attempts.push({
          stepIndex: i,
          provider: step.provider,
          model: step.model,
          success: false,
          error: '提供商健康检查失败',
          latencyMs: 0,
        });
        continue;
      }

      // 检查速率限制
      const rateStatus = provider.getRateLimitStatus();
      if (rateStatus.remainingRequests <= 0) {
        attempts.push({
          stepIndex: i,
          provider: step.provider,
          model: step.model,
          success: false,
          error: '速率限制已满',
          latencyMs: 0,
        });
        if (step.failoverOn.includes('rate_limit')) continue;
      }

      const startTime = Date.now();
      try {
        // 设置超时
        const response = await this.withTimeout(
          provider.complete({ ...request, model: step.model }),
          step.timeoutMs
        );

        attempts.push({
          stepIndex: i,
          provider: step.provider,
          model: step.model,
          success: true,
          latencyMs: Date.now() - startTime,
          response,
        });

        // 成功，返回结果
        return {
          success: true,
          response,
          provider: step.provider,
          model: step.model,
          attempts,
          fallbackUsed: i > 0,
        };
      } catch (error) {
        const latencyMs = Date.now() - startTime;
        const errorType = this.classifyError(error);

        attempts.push({
          stepIndex: i,
          provider: step.provider,
          model: step.model,
          success: false,
          error: String(error),
          errorType,
          latencyMs,
        });

        console.warn(
          `[FallbackChain] 步骤 ${i} 失败 (${step.provider}/${step.model}): ` +
          `${errorType} - ${error}`
        );

        // 检查是否应该降级
        if (!step.failoverOn.includes(errorType as any)) {
          // 不在降级条件中，直接失败
          break;
        }
      }
    }

    // 所有步骤都失败
    return {
      success: false,
      attempts,
      fallbackUsed: true,
      error: '所有降级步骤均失败',
    };
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
      ),
    ]);
  }

  private classifyError(error: unknown): string {
    const msg = String(error);
    if (msg.includes('TIMEOUT')) return 'timeout';
    if (msg.includes('429') || msg.includes('RATE')) return 'rate_limit';
    if (msg.includes('503') || msg.includes('UNAVAILABLE')) return 'error';
    return 'error';
  }
}

interface FallbackAttempt {
  stepIndex: number;
  provider: ModelProvider;
  model: string;
  success: boolean;
  error?: string;
  errorType?: string;
  latencyMs: number;
  response?: ProviderResponse;
}

interface FallbackExecutionResult {
  success: boolean;
  response?: ProviderResponse;
  provider?: ModelProvider;
  model?: string;
  attempts: FallbackAttempt[];
  fallbackUsed: boolean;
  error?: string;
}
```

### 21.6.5 ModelGateway 完整实现

```typescript
// ============================================================
// ModelGateway：统一模型网关
// ============================================================

class ModelGateway implements Lifecycle {
  private providers = new Map<ModelProvider, ProviderAdapter>();
  private allModels: ModelInfo[] = [];
  private fallbackExecutor: FallbackChainExecutor;
  private costTracker: CostTracker;
  private cache: ResponseCache;
  private status: ComponentStatus = ComponentStatus.CREATED;

  constructor() {
    this.fallbackExecutor = new FallbackChainExecutor();
    this.costTracker = new CostTracker();
    this.cache = new ResponseCache(1000); // 最多缓存 1000 条
  }

  async initialize(): Promise<void> {
    this.status = ComponentStatus.INITIALIZED;
  }

  async start(): Promise<void> {
    // 收集所有模型信息
    this.allModels = [];
    for (const [, provider] of this.providers) {
      this.allModels.push(...provider.listModels());
    }
    this.status = ComponentStatus.RUNNING;
    console.log(
      `[ModelGateway] 已启动，${this.providers.size} 个提供商，${this.allModels.length} 个模型`
    );
  }

  async stop(): Promise<void> {
    this.status = ComponentStatus.STOPPED;
  }

  async destroy(): Promise<void> {
    this.providers.clear();
    this.allModels = [];
    this.status = ComponentStatus.DESTROYED;
  }

  getStatus(): ComponentStatus {
    return this.status;
  }

  /** 注册模型提供商 */
  registerProvider(adapter: ProviderAdapter): void {
    this.providers.set(adapter.provider, adapter);
    this.fallbackExecutor.registerProvider(adapter);
    console.log(`[ModelGateway] 注册提供商: ${adapter.provider}`);
  }

  /** 注册降级链 */
  registerFallbackChain(chain: FallbackChain): void {
    this.fallbackExecutor.registerChain(chain);
  }

  /** 统一模型调用入口 */
  async complete(request: UnifiedModelRequest): Promise<UnifiedModelResponse> {
    const startTime = Date.now();

    // 1. 选择模型
    const selectedModel = request.model
      ? this.findModel(request.model)
      : this.selectModel(request.preferences);

    if (!selectedModel) {
      throw new Error('无法找到满足条件的模型');
    }

    // 2. 检查缓存
    const cacheKey = this.buildCacheKey(request);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        requestId: request.requestId,
        cached: true,
        latencyMs: Date.now() - startTime,
      };
    }

    // 3. 构建提供商请求
    const providerRequest: ProviderRequest = {
      model: selectedModel.id,
      messages: request.messages,
      parameters: request.parameters,
      tools: request.tools,
      stream: request.stream,
    };

    // 4. 执行请求（带降级）
    const chainName = this.getChainForQuality(request.preferences?.qualityLevel || 'standard');
    let response: ProviderResponse;
    let provider = selectedModel.provider;
    let fallbackUsed = false;

    try {
      const adapter = this.providers.get(selectedModel.provider);
      if (!adapter) throw new Error(`提供商 '${selectedModel.provider}' 未注册`);
      response = await adapter.complete(providerRequest);
    } catch (error) {
      // 尝试降级链
      if (chainName) {
        const fallbackResult = await this.fallbackExecutor.execute(chainName, providerRequest);
        if (!fallbackResult.success) {
          throw new Error(`模型调用失败且降级链耗尽: ${fallbackResult.error}`);
        }
        response = fallbackResult.response!;
        provider = fallbackResult.provider!;
        fallbackUsed = true;
      } else {
        throw error;
      }
    }

    // 5. 计算成本
    const cost = this.calculateCost(selectedModel, response.usage);

    // 6. 记录成本
    this.costTracker.record({
      requestId: request.requestId,
      tenantId: request.tenantId,
      agentId: request.agentId,
      provider,
      model: selectedModel.id,
      usage: response.usage,
      cost,
      timestamp: Date.now(),
    });

    // 7. 构建统一响应
    const unifiedResponse: UnifiedModelResponse = {
      requestId: request.requestId,
      provider,
      model: selectedModel.id,
      content: response.content,
      toolCalls: response.toolCalls,
      usage: response.usage,
      cost,
      latencyMs: Date.now() - startTime,
      cached: false,
      metadata: {
        provider,
        model: selectedModel.id,
        finishReason: response.finishReason,
        retries: 0,
        fallbackUsed,
        originalProvider: fallbackUsed ? selectedModel.provider : undefined,
      },
    };

    // 8. 缓存响应（非流式且非工具调用）
    if (!request.stream && !response.toolCalls) {
      this.cache.set(cacheKey, unifiedResponse);
    }

    return unifiedResponse;
  }

  /** 列出所有可用模型 */
  listAllModels(): ModelInfo[] {
    return [...this.allModels];
  }

  /** 获取成本报告 */
  getCostReport(tenantId: string, period?: { start: number; end: number }): CostReport {
    return this.costTracker.getReport(tenantId, period);
  }

  // ---- 私有方法 ----

  private findModel(modelId: string): ModelInfo | undefined {
    return this.allModels.find(m => m.id === modelId);
  }

  /**
   * 根据偏好自动选择模型（简化版）
   *
   * 此处实现基础的偏好过滤与排序。如需基于任务复杂度的智能路由、
   * Thompson Sampling 自适应选择、A/B 测试等高级模型路由能力，
   * 详见第 19 章 §19.3 智能模型路由。
   */
  private selectModel(preferences?: ModelPreferences): ModelInfo | undefined {
    let candidates = [...this.allModels];

    if (preferences) {
      // 按提供商过滤
      if (preferences.preferredProvider) {
        const preferred = candidates.filter(m => m.provider === preferences.preferredProvider);
        if (preferred.length > 0) candidates = preferred;
      }

      // 按质量层级过滤
      candidates = candidates.filter(m => m.qualityTier === preferences.qualityLevel);

      // 按功能要求过滤
      if (preferences.requiresFunctionCalling) {
        candidates = candidates.filter(m => m.supportsToolCalling);
      }
      if (preferences.requiresVision) {
        candidates = candidates.filter(m => m.supportsVision);
      }
      if (preferences.minContextWindow) {
        candidates = candidates.filter(m => m.contextWindow >= preferences.minContextWindow!);
      }

      // 按成本过滤
      if (preferences.maxCostPerCall) {
        candidates = candidates.filter(m =>
          m.inputPricePer1kTokens * 4 + m.outputPricePer1kTokens * 1 <
          preferences.maxCostPerCall! * 1000
        );
      }
    }

    // 如果没有匹配的偏好候选，回退到所有模型
    if (candidates.length === 0) {
      candidates = this.allModels.filter(m => m.qualityTier === 'standard');
    }

    // 按性价比排序：质量/价格
    candidates.sort((a, b) => {
      const costA = a.inputPricePer1kTokens + a.outputPricePer1kTokens;
      const costB = b.inputPricePer1kTokens + b.outputPricePer1kTokens;
      return costA - costB;
    });

    return candidates[0];
  }

  private calculateCost(model: ModelInfo, usage: TokenUsage): CostInfo {
    const inputCost = (usage.promptTokens / 1000) * model.inputPricePer1kTokens;
    const outputCost = (usage.completionTokens / 1000) * model.outputPricePer1kTokens;
    return {
      inputCost: Math.round(inputCost * 1000000) / 1000000,
      outputCost: Math.round(outputCost * 1000000) / 1000000,
      totalCost: Math.round((inputCost + outputCost) * 1000000) / 1000000,
      currency: 'USD',
    };
  }

  private getChainForQuality(quality: string): string | null {
    switch (quality) {
      case 'premium': return 'premium-chain';
      case 'standard': return 'standard-chain';
      case 'economy': return 'economy-chain';
      default: return null;
    }
  }

  private buildCacheKey(request: UnifiedModelRequest): string {
    const msgHash = request.messages.map(m => `${m.role}:${m.content}`).join('|');
    return `${request.model || 'auto'}:${msgHash}:${JSON.stringify(request.parameters)}`;
  }
}

// ============================================================
// CostTracker：成本追踪器
// ============================================================

interface CostRecord {
  requestId: string;
  tenantId: string;
  agentId: string;
  provider: ModelProvider;
  model: string;
  usage: TokenUsage;
  cost: CostInfo;
  timestamp: number;
}

interface CostReport {
  tenantId: string;
  period: { start: number; end: number };
  totalCost: number;
  currency: string;
  byProvider: Record<string, number>;
  byModel: Record<string, number>;
  byAgent: Record<string, number>;
  totalTokens: number;
  totalRequests: number;
}

class CostTracker {
  private records: CostRecord[] = [];

  record(entry: CostRecord): void {
    this.records.push(entry);
  }

  getReport(tenantId: string, period?: { start: number; end: number }): CostReport {
    const now = Date.now();
    const start = period?.start || now - 30 * 86400000;
    const end = period?.end || now;

    const filtered = this.records.filter(
      r => r.tenantId === tenantId && r.timestamp >= start && r.timestamp <= end
    );

    const byProvider: Record<string, number> = {};
    const byModel: Record<string, number> = {};
    const byAgent: Record<string, number> = {};
    let totalCost = 0;
    let totalTokens = 0;

    for (const r of filtered) {
      totalCost += r.cost.totalCost;
      totalTokens += r.usage.totalTokens;
      byProvider[r.provider] = (byProvider[r.provider] || 0) + r.cost.totalCost;
      byModel[r.model] = (byModel[r.model] || 0) + r.cost.totalCost;
      byAgent[r.agentId] = (byAgent[r.agentId] || 0) + r.cost.totalCost;
    }

    return {
      tenantId,
      period: { start, end },
      totalCost: Math.round(totalCost * 1000000) / 1000000,
      currency: 'USD',
      byProvider,
      byModel,
      byAgent,
      totalTokens,
      totalRequests: filtered.length,
    };
  }
}

// ============================================================
// ResponseCache：简单 LRU 缓存
// ============================================================

class ResponseCache {
  private cache = new Map<string, { response: UnifiedModelResponse; expiresAt: number }>();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize: number, ttlMs: number = 300000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): UnifiedModelResponse | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.response;
  }

  set(key: string, response: UnifiedModelResponse): void {
    // LRU 驱逐
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { response, expiresAt: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.cache.clear();
  }
}
```

### 21.6.6 模型网关使用示例

```typescript
// ============================================================
// 模型网关使用示例
// ============================================================

async function modelGatewayDemo(): Promise<void> {
  const gateway = new ModelGateway();

  // 注册提供商
  gateway.registerProvider(new OpenAIAdapter({ apiKey: 'sk-xxx' }));
  gateway.registerProvider(new AnthropicAdapter({ apiKey: 'sk-ant-xxx' }));
  gateway.registerProvider(new GoogleAdapter({ apiKey: 'AIza-xxx' }));
  gateway.registerProvider(new DeepSeekAdapter({ apiKey: 'sk-ds-xxx' }));
  gateway.registerProvider(new GLMAdapter({ apiKey: 'zhipu-xxx' }));

  // 注册降级链
  gateway.registerFallbackChain({
    name: 'premium-chain',
    steps: [
      { provider: 'anthropic', model: 'claude-opus-4-20250514',
        failoverOn: ['error', 'timeout', 'rate_limit'], timeoutMs: 60000 },
      { provider: 'openai', model: 'o1',
        failoverOn: ['error', 'timeout', 'rate_limit'], timeoutMs: 60000 },
      { provider: 'google', model: 'gemini-3-pro',
        failoverOn: ['error', 'timeout'], timeoutMs: 60000 },
    ],
  });

  gateway.registerFallbackChain({
    name: 'standard-chain',
    steps: [
      { provider: 'anthropic', model: 'claude-sonnet-4-20250514',
        failoverOn: ['error', 'timeout', 'rate_limit'], timeoutMs: 30000 },
      { provider: 'openai', model: 'gpt-4o',
        failoverOn: ['error', 'timeout', 'rate_limit'], timeoutMs: 30000 },
      { provider: 'deepseek', model: 'deepseek-reasoner',
        failoverOn: ['error', 'timeout'], timeoutMs: 30000 },
    ],
  });

  gateway.registerFallbackChain({
    name: 'economy-chain',
    steps: [
      { provider: 'deepseek', model: 'deepseek-chat',
        failoverOn: ['error', 'timeout', 'rate_limit'], timeoutMs: 15000 },
      { provider: 'openai', model: 'gpt-4o-mini',
        failoverOn: ['error', 'timeout', 'rate_limit'], timeoutMs: 15000 },
      { provider: 'google', model: 'gemini-3-flash',
        failoverOn: ['error', 'timeout'], timeoutMs: 15000 },
    ],
  });

  await gateway.initialize();
  await gateway.start();

  // 示例调用 1：自动选择模型
  const response1 = await gateway.complete({
    requestId: 'req-001',
    agentId: 'translation-agent',
    tenantId: 'acme-corp',
    preferences: {
      qualityLevel: 'standard',
      requiresFunctionCalling: true,
    },
    messages: [
      { role: 'system', content: '你是一个专业翻译助手。' },
      { role: 'user', content: '将以下文本翻译成英文：人工智能正在改变世界。' },
    ],
    parameters: { temperature: 0.3, maxTokens: 1000 },
  });

  console.log('响应 1:', response1.content);
  console.log('使用模型:', response1.provider, response1.model);
  console.log('成本:', response1.cost);

  // 示例调用 2：指定模型
  const response2 = await gateway.complete({
    requestId: 'req-002',
    agentId: 'code-agent',
    tenantId: 'acme-corp',
    model: 'claude-sonnet-4-20250514',
    messages: [
      { role: 'user', content: '写一个 TypeScript 快速排序函数' },
    ],
    parameters: { temperature: 0, maxTokens: 2000 },
  });

  console.log('响应 2:', response2.content);

  // 查看成本报告
  const costReport = gateway.getCostReport('acme-corp');
  console.log('成本报告:', JSON.stringify(costReport, null, 2));

  await gateway.stop();
}
```

---

## 21.7 Agent 编排平台

### 21.7.1 低代码编排的价值

对于非技术用户或快速原型场景，通过代码编排 Agent 工作流门槛过高。Agent 编排平台提供**可视化、声明式**的工作流定义方式：

- **DAG 工作流**：有向无环图定义任务依赖
- **条件分支**：根据中间结果动态选择路径
- **并行执行**：无依赖的任务自动并行
- **错误处理**：重试、超时、降级的统一配置
- **模板库**：常用模式的预置模板

### 21.7.2 工作流定义类型

```typescript
// ============================================================
// 工作流定义类型系统
// ============================================================

/** 工作流定义 */
interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  /** 输入 Schema */
  inputSchema: JSONSchema;
  /** 输出 Schema */
  outputSchema: JSONSchema;
  /** 节点定义 */
  nodes: WorkflowNode[];
  /** 边定义（连接关系） */
  edges: WorkflowEdge[];
  /** 全局配置 */
  config: WorkflowConfig;
  /** 变量定义 */
  variables: WorkflowVariable[];
  /** 元数据 */
  metadata: Record<string, unknown>;
}

/** 工作流节点 */
interface WorkflowNode {
  id: string;
  name: string;
  type: NodeType;
  /** 节点配置 */
  config: NodeConfig;
  /** 位置（用于可视化） */
  position: { x: number; y: number };
  /** 错误处理 */
  errorHandling: ErrorHandling;
}

type NodeType =
  | 'agent-call'      // 调用 Agent
  | 'model-call'      // 直接调用模型
  | 'condition'        // 条件分支
  | 'parallel'         // 并行网关
  | 'merge'            // 合并网关
  | 'transform'        // 数据转换
  | 'human-review'     // 人工审核
  | 'webhook'          // Webhook 调用
  | 'delay'            // 延时
  | 'sub-workflow'     // 子工作流
  | 'start'            // 起始节点
  | 'end';             // 结束节点

interface NodeConfig {
  /** Agent 调用配置 */
  agentId?: string;
  agentInput?: Record<string, string>; // 支持模板表达式，如 "{{nodes.step1.output.text}}"
  /** 模型调用配置 */
  model?: string;
  prompt?: string;
  /** 条件分支配置 */
  condition?: ConditionExpression;
  /** 数据转换配置 */
  transformExpression?: string;
  /** 延时配置 */
  delayMs?: number;
  /** 子工作流配置 */
  subWorkflowId?: string;
  /** 人工审核配置 */
  reviewers?: string[];
  reviewTimeout?: number;
  /** 通用超时 */
  timeoutMs?: number;
}

interface ConditionExpression {
  type: 'simple' | 'javascript' | 'jsonpath';
  expression: string;
  branches: { condition: string; targetNodeId: string }[];
  defaultBranch: string;
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: string;
}

interface WorkflowConfig {
  maxExecutionTimeMs: number;
  maxRetries: number;
  retryDelayMs: number;
  parallelismLimit: number;
  enableTracing: boolean;
  enableCaching: boolean;
}

interface ErrorHandling {
  strategy: 'retry' | 'skip' | 'fail' | 'fallback';
  maxRetries: number;
  retryDelayMs: number;
  fallbackNodeId?: string;
}

interface WorkflowVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  defaultValue?: unknown;
  description: string;
}
```

### 21.7.3 WorkflowExecutor 实现

```typescript
// ============================================================
// WorkflowExecutor：工作流执行引擎
// ============================================================

/** 工作流执行状态 */
interface WorkflowExecution {
  executionId: string;
  workflowId: string;
  status: ExecutionStatus;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  nodeStates: Map<string, NodeExecutionState>;
  variables: Map<string, unknown>;
  startedAt: number;
  completedAt?: number;
  error?: string;
  trace: ExecutionTrace[];
}

type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';

interface NodeExecutionState {
  nodeId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  input?: unknown;
  output?: unknown;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  retryCount: number;
}

interface ExecutionTrace {
  timestamp: number;
  nodeId: string;
  event: string;
  details?: Record<string, unknown>;
}

class WorkflowExecutor {
  private executions = new Map<string, WorkflowExecution>();
  private nodeExecutors = new Map<NodeType, NodeExecutorFn>();

  constructor() {
    this.registerDefaultExecutors();
  }

  /** 执行工作流 */
  async execute(
    workflow: WorkflowDefinition,
    input: Record<string, unknown>
  ): Promise<WorkflowExecution> {
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const execution: WorkflowExecution = {
      executionId,
      workflowId: workflow.id,
      status: 'running',
      input,
      nodeStates: new Map(),
      variables: new Map(),
      startedAt: Date.now(),
      trace: [],
    };

    // 初始化变量
    for (const v of workflow.variables) {
      execution.variables.set(v.name, input[v.name] ?? v.defaultValue);
    }

    // 初始化节点状态
    for (const node of workflow.nodes) {
      execution.nodeStates.set(node.id, {
        nodeId: node.id,
        status: 'pending',
        retryCount: 0,
      });
    }

    this.executions.set(executionId, execution);
    this.addTrace(execution, 'start', 'workflow-start', { input });

    try {
      // 找到起始节点
      const startNode = workflow.nodes.find(n => n.type === 'start');
      if (!startNode) throw new Error('工作流缺少起始节点');

      // 执行 DAG
      await this.executeDAG(workflow, execution, startNode.id);

      // 找到结束节点获取输出
      const endNode = workflow.nodes.find(n => n.type === 'end');
      if (endNode) {
        const endState = execution.nodeStates.get(endNode.id);
        execution.output = endState?.output as Record<string, unknown>;
      }

      execution.status = 'completed';
      execution.completedAt = Date.now();
      this.addTrace(execution, 'end', 'workflow-complete', { output: execution.output });

    } catch (error) {
      execution.status = 'failed';
      execution.error = String(error);
      execution.completedAt = Date.now();
      this.addTrace(execution, 'error', 'workflow-failed', { error: String(error) });
    }

    return execution;
  }

  /** 获取执行状态 */
  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  // ---- 私有方法 ----

  private async executeDAG(
    workflow: WorkflowDefinition,
    execution: WorkflowExecution,
    startNodeId: string
  ): Promise<void> {
    const adjacency = this.buildAdjacencyList(workflow);
    const inDegree = this.buildInDegreeMap(workflow);
    const completed = new Set<string>();
    const queue: string[] = [startNodeId];

    while (queue.length > 0) {
      // 检查超时
      if (Date.now() - execution.startedAt > workflow.config.maxExecutionTimeMs) {
        throw new Error(`工作流执行超时 (${workflow.config.maxExecutionTimeMs}ms)`);
      }

      // 收集可并行执行的节点
      const parallelBatch: string[] = [];
      while (queue.length > 0) {
        parallelBatch.push(queue.shift()!);
      }

      // 限制并行度
      const batchSize = Math.min(parallelBatch.length, workflow.config.parallelismLimit);
      const batches: string[][] = [];
      for (let i = 0; i < parallelBatch.length; i += batchSize) {
        batches.push(parallelBatch.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        await Promise.all(
          batch.map(nodeId => this.executeNode(workflow, execution, nodeId))
        );

        for (const nodeId of batch) {
          completed.add(nodeId);

          // 更新后继节点的入度
          const successors = adjacency.get(nodeId) || [];
          for (const succ of successors) {
            // 检查条件边
            const edge = workflow.edges.find(e => e.source === nodeId && e.target === succ);
            if (edge?.condition) {
              const nodeOutput = execution.nodeStates.get(nodeId)?.output;
              if (!this.evaluateCondition(edge.condition, nodeOutput, execution)) {
                continue;
              }
            }

            const remaining = (inDegree.get(succ) || 1) - 1;
            inDegree.set(succ, remaining);
            if (remaining <= 0 && !completed.has(succ)) {
              queue.push(succ);
            }
          }
        }
      }
    }
  }

  private async executeNode(
    workflow: WorkflowDefinition,
    execution: WorkflowExecution,
    nodeId: string
  ): Promise<void> {
    const node = workflow.nodes.find(n => n.id === nodeId);
    if (!node) throw new Error(`节点 '${nodeId}' 不存在`);

    const state = execution.nodeStates.get(nodeId)!;
    state.status = 'running';
    state.startedAt = Date.now();

    this.addTrace(execution, nodeId, 'node-start', { type: node.type });

    // 解析输入（支持模板表达式）
    const resolvedInput = this.resolveInput(node, execution);
    state.input = resolvedInput;

    const executor = this.nodeExecutors.get(node.type);
    if (!executor) {
      throw new Error(`未知节点类型: ${node.type}`);
    }

    // 带重试的执行
    let lastError: Error | null = null;
    const maxRetries = node.errorHandling.maxRetries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const output = await executor(node, resolvedInput, execution);
        state.output = output;
        state.status = 'completed';
        state.completedAt = Date.now();

        this.addTrace(execution, nodeId, 'node-complete', {
          latencyMs: state.completedAt - state.startedAt!,
        });
        return;
      } catch (error) {
        lastError = error as Error;
        state.retryCount = attempt + 1;

        if (attempt < maxRetries) {
          this.addTrace(execution, nodeId, 'node-retry', {
            attempt: attempt + 1,
            error: String(error),
          });
          await new Promise(r => setTimeout(r, node.errorHandling.retryDelayMs));
        }
      }
    }

    // 所有重试都失败
    state.status = 'failed';
    state.error = String(lastError);
    state.completedAt = Date.now();
    this.addTrace(execution, nodeId, 'node-failed', { error: state.error });

    if (node.errorHandling.strategy === 'fail') {
      throw lastError;
    }
    // skip 策略：继续执行
  }

  private resolveInput(
    node: WorkflowNode,
    execution: WorkflowExecution
  ): Record<string, unknown> {
    const input: Record<string, unknown> = {};
    const agentInput = node.config.agentInput || {};

    for (const [key, template] of Object.entries(agentInput)) {
      input[key] = this.resolveTemplate(template, execution);
    }

    return input;
  }

  /** 解析模板表达式，如 {{nodes.step1.output.text}} */
  private resolveTemplate(template: string, execution: WorkflowExecution): unknown {
    const regex = /\{\{([\w.]+)\}\}/g;
    let result: unknown = template;

    const match = regex.exec(template);
    if (match) {
      const path = match[1].split('.');
      if (path[0] === 'nodes' && path.length >= 3) {
        const nodeId = path[1];
        const field = path[2]; // 'output' or 'input'
        const nodeState = execution.nodeStates.get(nodeId);
        if (nodeState) {
          let value: unknown = field === 'output' ? nodeState.output : nodeState.input;
          for (let i = 3; i < path.length; i++) {
            if (value && typeof value === 'object') {
              value = (value as Record<string, unknown>)[path[i]];
            }
          }
          result = value;
        }
      } else if (path[0] === 'variables') {
        result = execution.variables.get(path[1]);
      } else if (path[0] === 'input') {
        result = execution.input[path[1]];
      }
    }

    return result;
  }

  private evaluateCondition(
    condition: string,
    nodeOutput: unknown,
    execution: WorkflowExecution
  ): boolean {
    try {
      // 简单的条件评估
      // 实际实现中可用安全的表达式求值器
      if (condition === 'true') return true;
      if (condition === 'false') return false;

      // 支持简单比较：output.field == value
      const parts = condition.split(/\s*(==|!=|>|<|>=|<=)\s*/);
      if (parts.length === 3) {
        const left = this.resolveTemplate(`{{${parts[0]}}}`, execution);
        const op = parts[1];
        const right = parts[2].replace(/['"]/g, '');

        switch (op) {
          case '==': return String(left) === right;
          case '!=': return String(left) !== right;
          case '>': return Number(left) > Number(right);
          case '<': return Number(left) < Number(right);
          default: return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  private registerDefaultExecutors(): void {
    // 起始节点
    this.nodeExecutors.set('start', async (_node, input) => input);

    // 结束节点
    this.nodeExecutors.set('end', async (_node, input) => input);

    // Agent 调用节点
    this.nodeExecutors.set('agent-call', async (node, input) => {
      console.log(`[Workflow] 调用 Agent: ${node.config.agentId}`);
      // 实际实现中通过 Registry 解析 Agent 并发送请求
      return { result: `Agent ${node.config.agentId} 处理完成`, input };
    });

    // 模型调用节点
    this.nodeExecutors.set('model-call', async (node, input) => {
      console.log(`[Workflow] 调用模型: ${node.config.model}`);
      // 实际实现中通过 ModelGateway 调用
      return { result: `模型 ${node.config.model} 响应`, input };
    });

    // 数据转换节点
    this.nodeExecutors.set('transform', async (node, input) => {
      const expr = node.config.transformExpression;
      // 简化实现：实际应使用 JSONata 或类似表达式引擎
      return { transformed: true, input, expression: expr };
    });

    // 条件分支节点
    this.nodeExecutors.set('condition', async (node, input) => {
      return { conditionEvaluated: true, input };
    });

    // 并行网关节点
    this.nodeExecutors.set('parallel', async (_node, input) => input);

    // 合并网关节点
    this.nodeExecutors.set('merge', async (_node, input) => input);

    // 延时节点
    this.nodeExecutors.set('delay', async (node) => {
      const delayMs = node.config.delayMs || 1000;
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return { delayed: true, delayMs };
    });

    // 人工审核节点
    this.nodeExecutors.set('human-review', async (node, input) => {
      console.log(`[Workflow] 等待人工审核: ${node.config.reviewers?.join(', ')}`);
      // 实际实现中会暂停工作流并发送通知
      return { reviewed: true, approved: true, input };
    });
  }

  private buildAdjacencyList(workflow: WorkflowDefinition): Map<string, string[]> {
    const adj = new Map<string, string[]>();
    for (const node of workflow.nodes) {
      adj.set(node.id, []);
    }
    for (const edge of workflow.edges) {
      const list = adj.get(edge.source) || [];
      list.push(edge.target);
      adj.set(edge.source, list);
    }
    return adj;
  }

  private buildInDegreeMap(workflow: WorkflowDefinition): Map<string, number> {
    const inDegree = new Map<string, number>();
    for (const node of workflow.nodes) {
      inDegree.set(node.id, 0);
    }
    for (const edge of workflow.edges) {
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }
    return inDegree;
  }

  private addTrace(
    execution: WorkflowExecution,
    nodeId: string,
    event: string,
    details?: Record<string, unknown>
  ): void {
    execution.trace.push({ timestamp: Date.now(), nodeId, event, details });
  }
}

type NodeExecutorFn = (
  node: WorkflowNode,
  input: Record<string, unknown>,
  execution: WorkflowExecution
) => Promise<unknown>;
```

### 21.7.4 工作流模板库

```typescript
// ============================================================
// 工作流模板库：常用 Agent 编排模式
// ============================================================

class WorkflowTemplateLibrary {
  private templates = new Map<string, WorkflowDefinition>();

  constructor() {
    this.registerBuiltinTemplates();
  }

  get(name: string): WorkflowDefinition | undefined {
    return this.templates.get(name);
  }

  list(): { name: string; description: string }[] {
    return Array.from(this.templates.values()).map(t => ({
      name: t.name,
      description: t.description,
    }));
  }

  private registerBuiltinTemplates(): void {
    // 模板 1：顺序处理流水线
    this.templates.set('sequential-pipeline', {
      id: 'tpl-sequential',
      name: '顺序处理流水线',
      description: '依次调用多个 Agent 处理数据，每个 Agent 的输出作为下一个的输入',
      version: '1.0.0',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
      nodes: [
        { id: 'start', name: '开始', type: 'start', config: {},
          position: { x: 0, y: 0 }, errorHandling: { strategy: 'fail', maxRetries: 0, retryDelayMs: 0 } },
        { id: 'extract', name: '信息提取', type: 'agent-call',
          config: { agentId: 'extraction-agent', agentInput: { text: '{{input.text}}' } },
          position: { x: 200, y: 0 }, errorHandling: { strategy: 'retry', maxRetries: 2, retryDelayMs: 1000 } },
        { id: 'analyze', name: '分析处理', type: 'agent-call',
          config: { agentId: 'analysis-agent', agentInput: { data: '{{nodes.extract.output.result}}' } },
          position: { x: 400, y: 0 }, errorHandling: { strategy: 'retry', maxRetries: 2, retryDelayMs: 1000 } },
        { id: 'summarize', name: '总结输出', type: 'agent-call',
          config: { agentId: 'summarization-agent', agentInput: { analysis: '{{nodes.analyze.output.result}}' } },
          position: { x: 600, y: 0 }, errorHandling: { strategy: 'retry', maxRetries: 2, retryDelayMs: 1000 } },
        { id: 'end', name: '结束', type: 'end', config: {},
          position: { x: 800, y: 0 }, errorHandling: { strategy: 'fail', maxRetries: 0, retryDelayMs: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'extract' },
        { id: 'e2', source: 'extract', target: 'analyze' },
        { id: 'e3', source: 'analyze', target: 'summarize' },
        { id: 'e4', source: 'summarize', target: 'end' },
      ],
      config: {
        maxExecutionTimeMs: 120000, maxRetries: 3, retryDelayMs: 1000,
        parallelismLimit: 1, enableTracing: true, enableCaching: false,
      },
      variables: [],
      metadata: { category: 'pipeline', difficulty: 'beginner' },
    });

    // 模板 2：并行扇出-扇入
    this.templates.set('fan-out-fan-in', {
      id: 'tpl-fan-out',
      name: '并行扇出-扇入',
      description: '将任务拆分到多个 Agent 并行处理，然后合并结果',
      version: '1.0.0',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
      outputSchema: { type: 'object', properties: { combined: { type: 'object' } } },
      nodes: [
        { id: 'start', name: '开始', type: 'start', config: {},
          position: { x: 0, y: 200 }, errorHandling: { strategy: 'fail', maxRetries: 0, retryDelayMs: 0 } },
        { id: 'fan-out', name: '扇出', type: 'parallel', config: {},
          position: { x: 200, y: 200 }, errorHandling: { strategy: 'fail', maxRetries: 0, retryDelayMs: 0 } },
        { id: 'search-web', name: 'Web 搜索', type: 'agent-call',
          config: { agentId: 'web-search-agent', agentInput: { query: '{{input.query}}' } },
          position: { x: 400, y: 0 }, errorHandling: { strategy: 'skip', maxRetries: 1, retryDelayMs: 1000 } },
        { id: 'search-db', name: '数据库搜索', type: 'agent-call',
          config: { agentId: 'db-search-agent', agentInput: { query: '{{input.query}}' } },
          position: { x: 400, y: 200 }, errorHandling: { strategy: 'skip', maxRetries: 1, retryDelayMs: 1000 } },
        { id: 'search-docs', name: '文档搜索', type: 'agent-call',
          config: { agentId: 'doc-search-agent', agentInput: { query: '{{input.query}}' } },
          position: { x: 400, y: 400 }, errorHandling: { strategy: 'skip', maxRetries: 1, retryDelayMs: 1000 } },
        { id: 'merge', name: '合并结果', type: 'merge', config: {},
          position: { x: 600, y: 200 }, errorHandling: { strategy: 'fail', maxRetries: 0, retryDelayMs: 0 } },
        { id: 'synthesize', name: '综合分析', type: 'agent-call',
          config: { agentId: 'synthesis-agent' },
          position: { x: 800, y: 200 }, errorHandling: { strategy: 'retry', maxRetries: 2, retryDelayMs: 1000 } },
        { id: 'end', name: '结束', type: 'end', config: {},
          position: { x: 1000, y: 200 }, errorHandling: { strategy: 'fail', maxRetries: 0, retryDelayMs: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'fan-out' },
        { id: 'e2', source: 'fan-out', target: 'search-web' },
        { id: 'e3', source: 'fan-out', target: 'search-db' },
        { id: 'e4', source: 'fan-out', target: 'search-docs' },
        { id: 'e5', source: 'search-web', target: 'merge' },
        { id: 'e6', source: 'search-db', target: 'merge' },
        { id: 'e7', source: 'search-docs', target: 'merge' },
        { id: 'e8', source: 'merge', target: 'synthesize' },
        { id: 'e9', source: 'synthesize', target: 'end' },
      ],
      config: {
        maxExecutionTimeMs: 60000, maxRetries: 2, retryDelayMs: 1000,
        parallelismLimit: 3, enableTracing: true, enableCaching: true,
      },
      variables: [],
      metadata: { category: 'parallel', difficulty: 'intermediate' },
    });

    // 模板 3：人工审核环
    this.templates.set('human-in-the-loop', {
      id: 'tpl-hitl',
      name: '人工审核环',
      description: 'Agent 生成内容后需要人工审核通过才能继续',
      version: '1.0.0',
      inputSchema: { type: 'object', properties: { task: { type: 'string' } } },
      outputSchema: { type: 'object', properties: { approved_result: { type: 'string' } } },
      nodes: [
        { id: 'start', name: '开始', type: 'start', config: {},
          position: { x: 0, y: 0 }, errorHandling: { strategy: 'fail', maxRetries: 0, retryDelayMs: 0 } },
        { id: 'generate', name: 'AI 生成', type: 'agent-call',
          config: { agentId: 'content-generator', agentInput: { task: '{{input.task}}' } },
          position: { x: 200, y: 0 }, errorHandling: { strategy: 'retry', maxRetries: 2, retryDelayMs: 1000 } },
        { id: 'review', name: '人工审核', type: 'human-review',
          config: { reviewers: ['reviewer-1', 'reviewer-2'], reviewTimeout: 86400000 },
          position: { x: 400, y: 0 }, errorHandling: { strategy: 'fail', maxRetries: 0, retryDelayMs: 0 } },
        { id: 'check', name: '审核结果', type: 'condition',
          config: { condition: {
            type: 'simple', expression: 'nodes.review.output.approved',
            branches: [
              { condition: 'nodes.review.output.approved == true', targetNodeId: 'publish' },
              { condition: 'nodes.review.output.approved == false', targetNodeId: 'revise' },
            ],
            defaultBranch: 'revise',
          }},
          position: { x: 600, y: 0 }, errorHandling: { strategy: 'fail', maxRetries: 0, retryDelayMs: 0 } },
        { id: 'revise', name: '修改重试', type: 'agent-call',
          config: { agentId: 'content-generator',
            agentInput: { task: '{{input.task}}', feedback: '{{nodes.review.output.feedback}}' } },
          position: { x: 400, y: 200 }, errorHandling: { strategy: 'retry', maxRetries: 2, retryDelayMs: 1000 } },
        { id: 'publish', name: '发布', type: 'agent-call',
          config: { agentId: 'publisher-agent' },
          position: { x: 800, y: 0 }, errorHandling: { strategy: 'retry', maxRetries: 2, retryDelayMs: 1000 } },
        { id: 'end', name: '结束', type: 'end', config: {},
          position: { x: 1000, y: 0 }, errorHandling: { strategy: 'fail', maxRetries: 0, retryDelayMs: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'generate' },
        { id: 'e2', source: 'generate', target: 'review' },
        { id: 'e3', source: 'review', target: 'check' },
        { id: 'e4', source: 'check', target: 'publish', condition: 'approved' },
        { id: 'e5', source: 'check', target: 'revise', condition: 'rejected' },
        { id: 'e6', source: 'revise', target: 'review' },
        { id: 'e7', source: 'publish', target: 'end' },
      ],
      config: {
        maxExecutionTimeMs: 172800000, maxRetries: 1, retryDelayMs: 1000,
        parallelismLimit: 1, enableTracing: true, enableCaching: false,
      },
      variables: [],
      metadata: { category: 'human-in-the-loop', difficulty: 'intermediate' },
    });
  }
}
```


### 21.7.5 商业平台：Microsoft Copilot Studio

除了自建编排平台，企业也可以选择商业化的 Agent 构建平台。**Microsoft Copilot Studio**（原 Power Virtual Agents 的演进）是目前企业级 Agent 构建领域最成熟的低代码平台之一。

**平台定位**

Copilot Studio 面向**企业 IT 团队和业务分析师**，提供无代码/低代码的 Agent 构建界面。其核心优势在于与 Microsoft 365 生态的深度集成——Agent 可以直接访问 SharePoint 文档、Outlook 邮件、Teams 对话和 Dynamics 365 数据。

**核心能力**

```typescript
// ============================================================
// Microsoft Copilot Studio 能力模型
// ============================================================

/** Copilot Studio Agent 定义 */
interface CopilotStudioAgent {
  /** Agent 名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 知识源：Agent 的 RAG 数据来源 */
  knowledgeSources: CopilotKnowledgeSource[];
  /** 触发器：何时激活 Agent */
  triggers: CopilotTrigger[];
  /** 插件：扩展 Agent 能力 */
  plugins: CopilotPlugin[];
  /** 部署目标 */
  deploymentTargets: ('teams' | 'web' | 'dynamics365' | 'power-apps')[];
}

interface CopilotKnowledgeSource {
  type: 'sharepoint' | 'website' | 'dataverse' | 'file-upload' | 'custom-api';
  /** SharePoint 站点 URL 或网站地址 */
  uri: string;
  /** 数据刷新频率 */
  refreshInterval: 'realtime' | 'hourly' | 'daily';
}

interface CopilotPlugin {
  type: 'prebuilt' | 'custom-connector' | 'power-automate-flow' | 'openai-plugin';
  name: string;
  /** Power Platform connector 可直接复用 1,400+ 企业连接器 */
  connectorId?: string;
}

interface CopilotTrigger {
  type: 'keyword' | 'intent' | 'event' | 'scheduled';
  condition: string;
  /** Teams 中的 @mention 触发 */
  teamsAtMention?: boolean;
}
```

**核心特性：**

- **Custom Copilots**：基于企业私有知识库构建的定制化 AI 助手
- **Plugin 生态**：复用 Power Platform 1,400+ 企业连接器（SAP、ServiceNow、Salesforce 等）
- **Teams 深度集成**：Agent 作为 Teams App 直接嵌入协作流程
- **Generative AI 编排**：内置 GPT 模型支持，支持 Orchestrator 自动路由到合适的知识源或插件
- **安全与治理**：继承 Azure AD 权限体系，DLP 策略自动生效

**定价模型**

Copilot Studio 采用**按用户/月**的订阅模式，约 **$200/用户/月**（包含 25,000 条消息）。对于已经大量投资 Microsoft 生态的企业，这一价格在减少自建成本的同时提供了快速上线的路径。

> **适用场景：** 企业内部 IT 帮助台、HR 自助服务、知识库问答、审批流程自动化。如果你的组织已深度使用 Microsoft 365，Copilot Studio 是 Agent 落地的低阻力路径。

### 21.7.6 商业平台：Salesforce Agentforce

**Salesforce Agentforce**（2024 年 9 月发布）是 CRM 巨头 Salesforce 推出的 AI Agent 平台，目标是将 Agent 嵌入客户关系管理的每个环节。

**平台架构**

Agentforce 的核心是 **Atlas Reasoning Engine**——一个结合了链式推理（chain-of-thought）与 CRM 数据上下文的推理引擎。Agent 在回答客户问题或执行操作时，会自动关联客户的历史订单、服务记录、偏好等结构化数据。

```typescript
// ============================================================
// Salesforce Agentforce 架构模型
// ============================================================

/** Agentforce Agent 配置 */
interface AgentforceConfig {
  /** Agent 类型 */
  agentType: 'service' | 'sales' | 'commerce' | 'marketing' | 'custom';
  /** Atlas Reasoning Engine 配置 */
  reasoningConfig: {
    /** 启用链式推理 */
    chainOfThought: boolean;
    /** CRM 数据上下文：自动注入相关客户数据 */
    crmGrounding: boolean;
    /** 可访问的 Salesforce 对象 */
    allowedObjects: ('Account' | 'Contact' | 'Case' | 'Opportunity' | 'Order')[];
    /** 信任层：Data Cloud 数据掩码和权限控制 */
    trustLayer: {
      piiMasking: boolean;
      fieldLevelSecurity: boolean;
      auditTrail: boolean;
    };
  };
  /** 预置 Action 库 */
  actions: AgentforceAction[];
  /** 护栏 */
  guardrails: {
    maxTurns: number;
    escalationPolicy: 'auto' | 'manual';
    /** 禁止操作（如：不允许 Agent 自行退款超过 $100） */
    restrictions: string[];
  };
}

interface AgentforceAction {
  type: 'flow' | 'apex' | 'prompt-template' | 'mulesoft-api';
  name: string;
  description: string;
  /** Agent 触发此 Action 时需要的参数 */
  inputSchema: Record<string, unknown>;
}
```

**预置 Agent 类型：**

- **Service Agent**：替代传统 Chatbot，处理客户服务请求，支持自动退款、订单查询、预约变更
- **Sales Agent**：辅助销售团队，自动生成客户画像、推荐跟进策略、撰写个性化邮件
- **Commerce Agent**：电商场景下的购物助手，基于浏览历史和购买记录推荐商品
- **Marketing Agent**：自动生成营销活动内容、优化投放策略

**定价演进**

Agentforce 的定价策略经历了一次重要转型：
- **2024 年 9 月**（发布时）：按对话计费，**$2/次对话**
- **2025 年 5 月**：转向 **Flex Credits 消费模型**，统一积分兑换各类 AI 服务

这一转变反映了 Agent 平台定价的行业趋势——从简单的按次计费转向更灵活的消费式计费，让客户能在不同 AI 功能之间灵活分配预算。

> **适用场景：** 已部署 Salesforce CRM 的企业，需要在客户服务、销售和电商环节引入 AI Agent。Agentforce 的最大优势在于与 CRM 数据的原生集成——Agent 天然理解客户上下文，无需额外的数据管道。

---
## 21.8 企业集成模式

### 21.8.1 企业级 Agent 系统的特殊要求

将 Agent 系统部署到企业环境，需要满足一系列额外的非功能性要求：

- **身份认证与授权**：SSO/SAML/OIDC 集成，基于角色的访问控制
- **数据治理**：数据分类、数据防泄漏（DLP）、数据驻留
- **审计合规**：完整的操作审计日志，满足 SOC 2、GDPR 等合规要求
- **密钥管理**：安全的 API 密钥和凭据管理
- **网络安全**：VPC 隔离、TLS 加密、IP 白名单

### 21.8.2 企业集成管理器

```typescript
// ============================================================
// EnterpriseIntegrationManager：企业集成统一管理
// ============================================================

interface EnterpriseConfig {
  auth: AuthConfig;
  dataGovernance: DataGovernanceConfig;
  audit: AuditConfig;
  compliance: ComplianceConfig;
  secrets: SecretsConfig;
}

interface AuthConfig {
  provider: 'oauth2' | 'saml' | 'oidc';
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  roleMapping: Record<string, string[]>; // IdP role → platform permissions
  mfaRequired: boolean;
  sessionTimeoutMs: number;
}

interface DataGovernanceConfig {
  classification: DataClassificationConfig;
  dlp: DLPConfig;
  retention: DataRetentionConfig;
  residency: DataResidencyConfig;
}

interface DataClassificationConfig {
  enabled: boolean;
  defaultLevel: 'public' | 'internal' | 'confidential' | 'restricted';
  autoClassification: boolean;
  customPatterns: ClassificationPattern[];
}

interface ClassificationPattern {
  name: string;
  regex: string;
  classification: string;
  confidence: number;
}

interface DataRetentionConfig {
  defaultRetentionDays: number;
  perClassification: Record<string, number>;
  purgeStrategy: 'soft-delete' | 'hard-delete' | 'archive';
}

interface DataResidencyConfig {
  enabled: boolean;
  allowedRegions: string[];
  defaultRegion: string;
  crossRegionTransferPolicy: 'allow' | 'encrypt' | 'deny';
}

interface AuditConfig {
  enabled: boolean;
  level: 'basic' | 'detailed' | 'full';
  retentionDays: number;
  realTimeExport: boolean;
  exportTargets: AuditExportTarget[];
}

interface AuditExportTarget {
  type: 'siem' | 'log-analytics' | 'storage';
  endpoint: string;
  format: 'json' | 'cef' | 'syslog';
}

interface ComplianceConfig {
  frameworks: ComplianceFramework[];
  autoCheck: boolean;
  checkIntervalHours: number;
}

interface ComplianceFramework {
  name: 'soc2' | 'gdpr' | 'hipaa' | 'iso27001' | 'pci-dss';
  enabled: boolean;
  controls: ComplianceControl[];
}

interface ComplianceControl {
  id: string;
  name: string;
  description: string;
  automated: boolean;
  checker?: () => Promise<ComplianceCheckResult>;
}

interface ComplianceCheckResult {
  controlId: string;
  passed: boolean;
  evidence: string;
  checkedAt: number;
  details?: Record<string, unknown>;
}

interface SecretsConfig {
  provider: 'vault' | 'aws-secrets' | 'azure-keyvault' | 'local';
  endpoint?: string;
  namespace?: string;
  rotationEnabled: boolean;
  rotationIntervalDays: number;
}

class EnterpriseIntegrationManager implements Lifecycle {
  private config: EnterpriseConfig;
  private authProvider: AuthProvider;
  private classificationEngine: DataClassificationEngine;
  private auditLogger: AuditLogger;
  private complianceChecker: ComplianceChecker;
  private status: ComponentStatus = ComponentStatus.CREATED;

  constructor(config: EnterpriseConfig) {
    this.config = config;
    this.authProvider = new AuthProvider(config.auth);
    this.classificationEngine = new DataClassificationEngine(config.dataGovernance.classification);
    this.auditLogger = new AuditLogger(config.audit);
    this.complianceChecker = new ComplianceChecker(config.compliance);
  }

  async initialize(): Promise<void> {
    await this.authProvider.initialize();
    await this.classificationEngine.initialize();
    await this.auditLogger.initialize();
    this.status = ComponentStatus.INITIALIZED;
  }

  async start(): Promise<void> {
    await this.auditLogger.start();
    if (this.config.compliance.autoCheck) {
      this.complianceChecker.startPeriodicChecks();
    }
    this.status = ComponentStatus.RUNNING;
    console.log('[Enterprise] 企业集成管理器已启动');
  }

  async stop(): Promise<void> {
    this.complianceChecker.stopPeriodicChecks();
    await this.auditLogger.stop();
    this.status = ComponentStatus.STOPPED;
  }

  async destroy(): Promise<void> {
    this.status = ComponentStatus.DESTROYED;
  }

  getStatus(): ComponentStatus {
    return this.status;
  }

  /** 获取认证提供者 */
  getAuthProvider(): AuthProvider {
    return this.authProvider;
  }

  /** 获取数据分类引擎 */
  getClassificationEngine(): DataClassificationEngine {
    return this.classificationEngine;
  }

  /** 获取审计日志器 */
  getAuditLogger(): AuditLogger {
    return this.auditLogger;
  }

  /** 运行合规检查 */
  async runComplianceCheck(): Promise<ComplianceReport> {
    return this.complianceChecker.runFullCheck();
  }
}
```

### 21.8.3 认证提供者

```typescript
// ============================================================
// AuthProvider：统一身份认证
// ============================================================

interface AuthSession {
  sessionId: string;
  userId: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  tenantId: string;
  expiresAt: number;
  mfaVerified: boolean;
  metadata: Record<string, unknown>;
}

interface AuthResult {
  success: boolean;
  session?: AuthSession;
  error?: string;
  requiresMFA?: boolean;
}

class AuthProvider {
  private config: AuthConfig;
  private sessions = new Map<string, AuthSession>();

  constructor(config: AuthConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    console.log(`[Auth] 初始化 ${this.config.provider} 认证提供者`);
    // 验证 IdP 配置
    // 实际实现中连接 IdP 并获取公钥等
  }

  /** 验证令牌并创建会话 */
  async authenticateToken(token: string): Promise<AuthResult> {
    try {
      // 实际实现中验证 JWT/SAML 断言
      const decoded = this.decodeToken(token);

      // 检查是否需要 MFA
      if (this.config.mfaRequired && !decoded.mfaVerified) {
        return { success: false, requiresMFA: true, error: '需要多因素认证' };
      }

      // 映射角色到平台权限
      const permissions = this.mapRolesToPermissions(decoded.roles);

      const session: AuthSession = {
        sessionId: `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId: decoded.sub,
        email: decoded.email,
        displayName: decoded.name,
        roles: decoded.roles,
        permissions,
        tenantId: decoded.tenantId || 'default',
        expiresAt: Date.now() + this.config.sessionTimeoutMs,
        mfaVerified: decoded.mfaVerified || false,
        metadata: {},
      };

      this.sessions.set(session.sessionId, session);
      return { success: true, session };
    } catch (error) {
      return { success: false, error: `认证失败: ${error}` };
    }
  }

  /** 验证会话是否有效 */
  validateSession(sessionId: string): AuthSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return null;
    }

    return session;
  }

  /** 检查权限 */
  checkPermission(sessionId: string, requiredPermission: string): boolean {
    const session = this.validateSession(sessionId);
    if (!session) return false;

    return session.permissions.includes(requiredPermission) ||
           session.permissions.includes('*');
  }

  /** 登出 */
  logout(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  // ---- 私有方法 ----

  private decodeToken(token: string): {
    sub: string; email: string; name: string;
    roles: string[]; tenantId: string; mfaVerified: boolean;
  } {
    // 简化实现：实际中使用 JWT 库验证签名和过期时间
    // 此处模拟解码
    return {
      sub: 'user-001',
      email: 'user@example.com',
      name: '示例用户',
      roles: ['admin', 'agent-developer'],
      tenantId: 'acme-corp',
      mfaVerified: true,
    };
  }

  private mapRolesToPermissions(roles: string[]): string[] {
    const permissions = new Set<string>();

    for (const role of roles) {
      const mapped = this.config.roleMapping[role] || [];
      for (const perm of mapped) {
        permissions.add(perm);
      }
    }

    return Array.from(permissions);
  }
}
```

### 21.8.4 数据分类引擎

```typescript
// ============================================================
// DataClassificationEngine：自动数据分类与 DLP
// ============================================================

type DataClassificationLevel = 'public' | 'internal' | 'confidential' | 'restricted';

interface ClassificationResult {
  level: DataClassificationLevel;
  confidence: number;
  matches: ClassificationMatch[];
  timestamp: number;
}

interface ClassificationMatch {
  pattern: string;
  category: string;
  offset: number;
  length: number;
  maskedValue: string;
}

class DataClassificationEngine {
  private config: DataClassificationConfig;
  private patterns: CompiledPattern[] = [];

  constructor(config: DataClassificationConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    // 编译内置和自定义的检测模式
    this.patterns = [
      ...this.getBuiltinPatterns(),
      ...this.config.customPatterns.map(p => ({
        name: p.name,
        regex: new RegExp(p.regex, 'g'),
        classification: p.classification as DataClassificationLevel,
        category: 'custom',
        confidence: p.confidence,
      })),
    ];
    console.log(`[Classification] 初始化完成，${this.patterns.length} 个检测模式`);
  }

  /** 分类文本数据 */
  classify(text: string): ClassificationResult {
    const matches: ClassificationMatch[] = [];
    let highestLevel: DataClassificationLevel = this.config.defaultLevel;
    let highestConfidence = 0;

    for (const pattern of this.patterns) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match;
      while ((match = regex.exec(text)) !== null) {
        const classified: ClassificationMatch = {
          pattern: pattern.name,
          category: pattern.category,
          offset: match.index,
          length: match[0].length,
          maskedValue: this.mask(match[0]),
        };
        matches.push(classified);

        // 更新最高分类级别
        if (this.levelPriority(pattern.classification) > this.levelPriority(highestLevel)) {
          highestLevel = pattern.classification;
          highestConfidence = pattern.confidence;
        }
      }
    }

    return {
      level: matches.length > 0 ? highestLevel : this.config.defaultLevel,
      confidence: matches.length > 0 ? highestConfidence : 1.0,
      matches,
      timestamp: Date.now(),
    };
  }

  /** 执行 DLP 处理：遮蔽或阻止敏感数据 */
  applyDLP(text: string, action: 'block' | 'mask' | 'log'): DLPResult {
    const classification = this.classify(text);

    if (classification.matches.length === 0) {
      return { action: 'allow', processedText: text, classification };
    }

    switch (action) {
      case 'block':
        return {
          action: 'blocked',
          processedText: '',
          classification,
          reason: `检测到 ${classification.matches.length} 处敏感数据 (${classification.level} 级别)`,
        };

      case 'mask': {
        let masked = text;
        // 从后往前替换，避免索引偏移
        const sortedMatches = [...classification.matches].sort((a, b) => b.offset - a.offset);
        for (const m of sortedMatches) {
          masked = masked.slice(0, m.offset) + m.maskedValue + masked.slice(m.offset + m.length);
        }
        return { action: 'masked', processedText: masked, classification };
      }

      case 'log':
        console.warn(
          `[DLP] 检测到敏感数据: ${classification.matches.length} 处 ` +
          `(${classification.level} 级别)`
        );
        return { action: 'logged', processedText: text, classification };

      default:
        return { action: 'allow', processedText: text, classification };
    }
  }

  // ---- 私有方法 ----

  private getBuiltinPatterns(): CompiledPattern[] {
    return [
      {
        name: '中国身份证号',
        regex: /\b\d{17}[\dXx]\b/g,
        classification: 'restricted',
        category: 'pii',
        confidence: 0.95,
      },
      {
        name: '手机号码',
        regex: /\b1[3-9]\d{9}\b/g,
        classification: 'confidential',
        category: 'pii',
        confidence: 0.9,
      },
      {
        name: '电子邮箱',
        regex: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,
        classification: 'internal',
        category: 'pii',
        confidence: 0.85,
      },
      {
        name: '银行卡号',
        regex: /\b\d{16,19}\b/g,
        classification: 'restricted',
        category: 'financial',
        confidence: 0.7,
      },
      {
        name: 'API 密钥',
        regex: /\b(sk-[a-zA-Z0-9]{20,}|AIza[a-zA-Z0-9_-]{35}|ghp_[a-zA-Z0-9]{36})\b/g,
        classification: 'restricted',
        category: 'credentials',
        confidence: 0.95,
      },
      {
        name: 'IP 地址',
        regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
        classification: 'internal',
        category: 'infrastructure',
        confidence: 0.8,
      },
    ];
  }

  private mask(value: string): string {
    if (value.length <= 4) return '****';
    return value.slice(0, 2) + '*'.repeat(value.length - 4) + value.slice(-2);
  }

  private levelPriority(level: DataClassificationLevel): number {
    switch (level) {
      case 'public': return 0;
      case 'internal': return 1;
      case 'confidential': return 2;
      case 'restricted': return 3;
      default: return 0;
    }
  }
}

interface CompiledPattern {
  name: string;
  regex: RegExp;
  classification: DataClassificationLevel;
  category: string;
  confidence: number;
}

interface DLPResult {
  action: 'allow' | 'blocked' | 'masked' | 'logged';
  processedText: string;
  classification: ClassificationResult;
  reason?: string;
}
```

### 21.8.5 审计日志系统

```typescript
// ============================================================
// AuditLogger：审计日志系统
// ============================================================

interface AuditEvent {
  eventId: string;
  timestamp: number;
  /** 事件类型 */
  eventType: AuditEventType;
  /** 操作者 */
  actor: AuditActor;
  /** 操作对象 */
  resource: AuditResource;
  /** 操作 */
  action: string;
  /** 操作结果 */
  outcome: 'success' | 'failure' | 'denied';
  /** 详细信息 */
  details: Record<string, unknown>;
  /** 来源 IP */
  sourceIp?: string;
  /** 数据分类级别 */
  dataClassification?: DataClassificationLevel;
  /** 关联的租户 */
  tenantId: string;
}

type AuditEventType =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.mfa'
  | 'agent.register'
  | 'agent.deregister'
  | 'agent.invoke'
  | 'agent.install'
  | 'model.call'
  | 'data.access'
  | 'data.export'
  | 'data.delete'
  | 'config.change'
  | 'policy.update'
  | 'admin.action';

interface AuditActor {
  type: 'user' | 'agent' | 'system' | 'service';
  id: string;
  name: string;
  sessionId?: string;
}

interface AuditResource {
  type: 'agent' | 'model' | 'data' | 'config' | 'tenant' | 'user';
  id: string;
  name: string;
}

class AuditLogger {
  private config: AuditConfig;
  private buffer: AuditEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private eventLog: AuditEvent[] = []; // 内存存储（生产环境用持久化存储）

  constructor(config: AuditConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    console.log(`[Audit] 初始化审计日志，级别: ${this.config.level}`);
  }

  async start(): Promise<void> {
    if (!this.config.enabled) return;

    // 定期刷新缓冲区
    this.flushTimer = setInterval(() => this.flush(), 5000);
    console.log('[Audit] 审计日志已启动');
  }

  async stop(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.flush(); // 最后一次刷新
  }

  /** 记录审计事件 */
  log(event: Omit<AuditEvent, 'eventId' | 'timestamp'>): void {
    if (!this.config.enabled) return;

    // 检查审计级别
    if (!this.shouldLog(event.eventType)) return;

    const fullEvent: AuditEvent = {
      ...event,
      eventId: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      timestamp: Date.now(),
    };

    this.buffer.push(fullEvent);

    // 实时导出模式
    if (this.config.realTimeExport) {
      this.exportEvent(fullEvent);
    }

    // 缓冲区满时自动刷新
    if (this.buffer.length >= 100) {
      this.flush();
    }
  }

  /** 查询审计日志 */
  query(filter: AuditQueryFilter): AuditEvent[] {
    let results = [...this.eventLog];

    if (filter.eventType) {
      results = results.filter(e => e.eventType === filter.eventType);
    }
    if (filter.actorId) {
      results = results.filter(e => e.actor.id === filter.actorId);
    }
    if (filter.tenantId) {
      results = results.filter(e => e.tenantId === filter.tenantId);
    }
    if (filter.startTime) {
      results = results.filter(e => e.timestamp >= filter.startTime!);
    }
    if (filter.endTime) {
      results = results.filter(e => e.timestamp <= filter.endTime!);
    }
    if (filter.outcome) {
      results = results.filter(e => e.outcome === filter.outcome);
    }

    // 按时间倒序
    results.sort((a, b) => b.timestamp - a.timestamp);

    // 分页
    const offset = filter.offset || 0;
    const limit = filter.limit || 100;
    return results.slice(offset, offset + limit);
  }

  /** 生成审计报告 */
  generateReport(
    tenantId: string,
    period: { start: number; end: number }
  ): AuditReport {
    const events = this.eventLog.filter(
      e => e.tenantId === tenantId &&
           e.timestamp >= period.start &&
           e.timestamp <= period.end
    );

    const byType: Record<string, number> = {};
    const byOutcome: Record<string, number> = {};
    const byActor: Record<string, number> = {};
    let deniedCount = 0;

    for (const event of events) {
      byType[event.eventType] = (byType[event.eventType] || 0) + 1;
      byOutcome[event.outcome] = (byOutcome[event.outcome] || 0) + 1;
      byActor[event.actor.id] = (byActor[event.actor.id] || 0) + 1;
      if (event.outcome === 'denied') deniedCount++;
    }

    // 识别异常行为
    const anomalies: string[] = [];
    if (deniedCount > events.length * 0.1) {
      anomalies.push(`拒绝访问比例偏高: ${deniedCount}/${events.length} (${(deniedCount/events.length*100).toFixed(1)}%)`);
    }

    // 检查高频操作
    for (const [actorId, count] of Object.entries(byActor)) {
      if (count > 1000) {
        anomalies.push(`用户 ${actorId} 操作频率异常: ${count} 次`);
      }
    }

    return {
      tenantId,
      period,
      totalEvents: events.length,
      byType,
      byOutcome,
      topActors: Object.entries(byActor)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([id, count]) => ({ actorId: id, eventCount: count })),
      anomalies,
      generatedAt: Date.now(),
    };
  }

  // ---- 私有方法 ----

  private shouldLog(eventType: AuditEventType): boolean {
    switch (this.config.level) {
      case 'basic':
        return ['auth.login', 'auth.logout', 'config.change', 'admin.action',
                'data.delete', 'data.export'].includes(eventType);
      case 'detailed':
        return eventType !== 'model.call'; // 除模型调用外都记录
      case 'full':
        return true;
      default:
        return true;
    }
  }

  private flush(): void {
    if (this.buffer.length === 0) return;
    this.eventLog.push(...this.buffer);
    this.buffer = [];

    // 执行数据保留策略
    const cutoff = Date.now() - (this.config.retentionDays * 86400000);
    this.eventLog = this.eventLog.filter(e => e.timestamp >= cutoff);
  }

  private exportEvent(event: AuditEvent): void {
    for (const target of this.config.exportTargets) {
      // 实际实现中发送到 SIEM/日志分析系统
      console.log(`[Audit:Export] → ${target.type}: ${event.eventType} by ${event.actor.id}`);
    }
  }
}

interface AuditQueryFilter {
  eventType?: AuditEventType;
  actorId?: string;
  tenantId?: string;
  startTime?: number;
  endTime?: number;
  outcome?: string;
  offset?: number;
  limit?: number;
}

interface AuditReport {
  tenantId: string;
  period: { start: number; end: number };
  totalEvents: number;
  byType: Record<string, number>;
  byOutcome: Record<string, number>;
  topActors: { actorId: string; eventCount: number }[];
  anomalies: string[];
  generatedAt: number;
}
```

### 21.8.6 合规检查器

```typescript
// ============================================================
// ComplianceChecker：合规检查器
// ============================================================

interface ComplianceReport {
  frameworks: FrameworkReport[];
  overallScore: number;
  passedControls: number;
  totalControls: number;
  checkedAt: number;
}

interface FrameworkReport {
  framework: string;
  enabled: boolean;
  score: number;
  controlResults: ComplianceCheckResult[];
}

class ComplianceChecker {
  private config: ComplianceConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastReport: ComplianceReport | null = null;

  constructor(config: ComplianceConfig) {
    this.config = config;
    this.registerBuiltinControls();
  }

  startPeriodicChecks(): void {
    const intervalMs = this.config.checkIntervalHours * 3600000;
    this.timer = setInterval(() => this.runFullCheck(), intervalMs);
    console.log(`[Compliance] 启动定期检查，间隔: ${this.config.checkIntervalHours} 小时`);
  }

  stopPeriodicChecks(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** 运行完整合规检查 */
  async runFullCheck(): Promise<ComplianceReport> {
    console.log('[Compliance] 开始合规检查...');

    const frameworkReports: FrameworkReport[] = [];
    let totalPassed = 0;
    let totalControls = 0;

    for (const framework of this.config.frameworks) {
      if (!framework.enabled) continue;

      const controlResults: ComplianceCheckResult[] = [];

      for (const control of framework.controls) {
        totalControls++;

        if (control.automated && control.checker) {
          try {
            const result = await control.checker();
            controlResults.push(result);
            if (result.passed) totalPassed++;
          } catch (error) {
            controlResults.push({
              controlId: control.id,
              passed: false,
              evidence: `检查执行失败: ${error}`,
              checkedAt: Date.now(),
            });
          }
        } else {
          // 非自动化控制需要人工确认
          controlResults.push({
            controlId: control.id,
            passed: false,
            evidence: '需要人工审核',
            checkedAt: Date.now(),
            details: { requiresManualReview: true },
          });
        }
      }

      const passed = controlResults.filter(r => r.passed).length;
      frameworkReports.push({
        framework: framework.name,
        enabled: framework.enabled,
        score: controlResults.length > 0 ? (passed / controlResults.length) * 100 : 0,
        controlResults,
      });
    }

    const report: ComplianceReport = {
      frameworks: frameworkReports,
      overallScore: totalControls > 0 ? (totalPassed / totalControls) * 100 : 0,
      passedControls: totalPassed,
      totalControls,
      checkedAt: Date.now(),
    };

    this.lastReport = report;
    console.log(
      `[Compliance] 检查完成: ${totalPassed}/${totalControls} 通过 ` +
      `(${report.overallScore.toFixed(1)}%)`
    );

    return report;
  }

  getLastReport(): ComplianceReport | null {
    return this.lastReport;
  }

  private registerBuiltinControls(): void {
    for (const framework of this.config.frameworks) {
      if (framework.name === 'soc2') {
        framework.controls.push(
          {
            id: 'soc2-cc6.1', name: '访问控制', description: '实施逻辑访问安全措施',
            automated: true,
            checker: async () => ({
              controlId: 'soc2-cc6.1', passed: true,
              evidence: 'OIDC 认证已启用，RBAC 已配置', checkedAt: Date.now(),
            }),
          },
          {
            id: 'soc2-cc6.2', name: '身份认证', description: '用户身份认证机制',
            automated: true,
            checker: async () => ({
              controlId: 'soc2-cc6.2', passed: true,
              evidence: 'MFA 已启用，会话超时配置正确', checkedAt: Date.now(),
            }),
          },
          {
            id: 'soc2-cc7.2', name: '监控', description: '系统监控和异常检测',
            automated: true,
            checker: async () => ({
              controlId: 'soc2-cc7.2', passed: true,
              evidence: '审计日志已启用，告警规则已配置', checkedAt: Date.now(),
            }),
          },
          {
            id: 'soc2-cc8.1', name: '变更管理', description: '系统变更的正式流程',
            automated: false,
          },
        );
      }

      if (framework.name === 'gdpr') {
        framework.controls.push(
          {
            id: 'gdpr-art5', name: '数据处理原则', description: '合法、公正、透明的数据处理',
            automated: true,
            checker: async () => ({
              controlId: 'gdpr-art5', passed: true,
              evidence: '数据分类已启用，DLP 策略已配置', checkedAt: Date.now(),
            }),
          },
          {
            id: 'gdpr-art17', name: '被遗忘权', description: '数据主体请求删除个人数据的权利',
            automated: true,
            checker: async () => ({
              controlId: 'gdpr-art17', passed: true,
              evidence: '数据保留策略已配置，支持数据删除请求', checkedAt: Date.now(),
            }),
          },
          {
            id: 'gdpr-art25', name: '隐私设计', description: '在设计阶段融入数据保护',
            automated: false,
          },
          {
            id: 'gdpr-art30', name: '处理记录', description: '维护数据处理活动的记录',
            automated: true,
            checker: async () => ({
              controlId: 'gdpr-art30', passed: true,
              evidence: '审计日志级别为 detailed，数据访问均有记录', checkedAt: Date.now(),
            }),
          },
        );
      }
    }
  }
}
```

### 21.8.7 企业集成使用示例

```typescript
// ============================================================
// 企业集成使用示例
// ============================================================

async function enterpriseIntegrationDemo(): Promise<void> {
  const manager = new EnterpriseIntegrationManager({
    auth: {
      provider: 'oidc',
      issuerUrl: 'https://auth.example.com',
      clientId: 'agent-platform',
      clientSecret: 'secret-xxx',
      scopes: ['openid', 'profile', 'email'],
      roleMapping: {
        'admin': ['*'],
        'agent-developer': [
          'agent:create', 'agent:update', 'agent:delete',
          'model:call', 'workflow:manage',
        ],
        'agent-user': ['agent:invoke', 'model:call:economy'],
        'viewer': ['agent:list', 'dashboard:view'],
      },
      mfaRequired: true,
      sessionTimeoutMs: 3600000, // 1 小时
    },
    dataGovernance: {
      classification: {
        enabled: true,
        defaultLevel: 'internal',
        autoClassification: true,
        customPatterns: [
          { name: '内部项目代号', regex: 'Project-[A-Z]{3}-\\d{4}',
            classification: 'confidential', confidence: 0.9 },
        ],
      },
      dlp: {
        enabled: true,
        patterns: [],
        action: 'mask',
      },
      retention: {
        defaultRetentionDays: 90,
        perClassification: {
          'public': 365,
          'internal': 180,
          'confidential': 90,
          'restricted': 30,
        },
        purgeStrategy: 'soft-delete',
      },
      residency: {
        enabled: true,
        allowedRegions: ['cn-beijing', 'cn-shanghai'],
        defaultRegion: 'cn-beijing',
        crossRegionTransferPolicy: 'encrypt',
      },
    },
    audit: {
      enabled: true,
      level: 'detailed',
      retentionDays: 365,
      realTimeExport: true,
      exportTargets: [
        { type: 'siem', endpoint: 'https://siem.internal/api/events', format: 'json' },
      ],
    },
    compliance: {
      frameworks: [
        { name: 'soc2', enabled: true, controls: [] },
        { name: 'gdpr', enabled: true, controls: [] },
      ],
      autoCheck: true,
      checkIntervalHours: 24,
    },
    secrets: {
      provider: 'vault',
      endpoint: 'https://vault.internal:8200',
      namespace: 'agent-platform',
      rotationEnabled: true,
      rotationIntervalDays: 90,
    },
  });

  await manager.initialize();
  await manager.start();

  // 1. 认证
  const auth = manager.getAuthProvider();
  const authResult = await auth.authenticateToken('mock-jwt-token');
  console.log('认证结果:', authResult.success ? '成功' : '失败');

  if (authResult.session) {
    // 检查权限
    const canCreate = auth.checkPermission(authResult.session.sessionId, 'agent:create');
    console.log('是否有创建 Agent 权限:', canCreate);

    // 记录审计日志
    manager.getAuditLogger().log({
      eventType: 'auth.login',
      actor: { type: 'user', id: authResult.session.userId,
               name: authResult.session.displayName, sessionId: authResult.session.sessionId },
      resource: { type: 'user', id: authResult.session.userId,
                  name: authResult.session.displayName },
      action: 'login',
      outcome: 'success',
      details: { mfaVerified: authResult.session.mfaVerified },
      tenantId: authResult.session.tenantId,
    });
  }

  // 2. 数据分类与 DLP
  const classifier = manager.getClassificationEngine();
  const sampleText = '用户张三的身份证号是 110101199001011234，手机号 13800138000';
  const dlpResult = classifier.applyDLP(sampleText, 'mask');
  console.log('DLP 处理结果:', dlpResult.action);
  console.log('处理后文本:', dlpResult.processedText);
  console.log('分类级别:', dlpResult.classification.level);
  console.log('匹配项:', dlpResult.classification.matches.length, '处');

  // 3. 合规检查
  const complianceReport = await manager.runComplianceCheck();
  console.log('合规分数:', complianceReport.overallScore.toFixed(1), '%');
  console.log('通过/总数:', complianceReport.passedControls, '/', complianceReport.totalControls);

  await manager.stop();
}
```

> **与第 22 章的衔接**：本节讨论的企业集成模式从**系统层面**保障了 Agent 平台的安全和合规。第 22 章"Agent Experience 设计"将从**用户体验层面**探讨如何让 Agent 在满足这些企业约束的同时，依然提供流畅、直觉的交互体验。好的 AX 设计需要在安全控制与用户便利之间找到平衡——例如，DLP 拦截不应让用户感到困惑，权限不足时应给出清晰的引导。

---

## 21.9 新兴 Agent 产品与平台

除了上述通用平台架构和企业集成模式，2025–2026 年涌现了一批值得关注的 Agent 产品和平台特性。它们代表了 Agent 技术从基础设施走向终端用户的关键趋势。

### 21.9.1 OpenAI Codex

**[[OpenAI Codex]](https://openai.com/index/introducing-codex/)** 是 OpenAI 推出的全自主编码 Agent 平台。与早期的代码补全工具不同，Codex 是一个完整的 Agent 系统：

- **云端沙箱执行**：每个任务在隔离的云端沙箱中运行，Agent 可以自主读写文件、运行测试、安装依赖
- **后台自主运行**：用户提交任务后，Codex 在后台独立工作，完成后通知用户审查结果
- **端到端软件工程**：支持从需求理解、代码编写、测试验证到 PR 创建的完整开发流程
- **多文件协调修改**：能够理解项目结构，跨多个文件进行协调一致的修改

Codex 的架构设计体现了 Agent 系统的一个关键理念：**将 Agent 放入受控的执行环境中，赋予其足够的工具和权限来自主完成复杂任务，同时通过沙箱隔离确保安全性**。这与本章 21.1 节讨论的平台运行时管理思路一致。

### 21.9.2 Claude CoWork

**Claude CoWork** 是 Anthropic 推出的多 Agent 协作工作区功能。它允许用户在与 Claude 的对话中，将子任务委派给多个并行运行的子 Agent：

- **任务委派**：主 Agent（Claude）可以根据用户请求，自动将子任务分配给专门的子 Agent
- **并行执行**：多个子 Agent 可以同时工作，各自负责不同的子任务（如分别研究不同主题、分析不同数据源）
- **结果汇总**：子 Agent 完成后，主 Agent 汇总各子 Agent 的结果，生成统一的最终输出
- **用户可见性**：用户可以实时观察各子 Agent 的工作进度和中间结果

CoWork 是第 9–10 章讨论的多 Agent 架构模式在商业产品中的直接体现——特别是 **Orchestrator-Worker 模式**的落地实现。它降低了多 Agent 协作的使用门槛，让非技术用户也能受益于并行化的 Agent 工作流。

### 21.9.3 Microsoft Connected Agents

**[[Microsoft Connected Agents]](https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/introducing-connected-agents-for-copilot-studio/)** 是 Azure AI Foundry 推出的 Agent 互操作特性，旨在解决企业中不同团队、不同平台构建的 Agent 之间的协作问题：

- **跨平台互操作**：允许在 Copilot Studio 中构建的 Agent 与其他框架（如 LangChain、Semantic Kernel）构建的 Agent 相互发现和调用
- **统一注册与发现**：通过 Azure AI Foundry 的 Agent 注册中心，企业内所有 Agent 可被统一管理和发现
- **安全委派**：Agent 之间的调用遵循企业安全策略，包括身份验证、权限控制和审计日志
- **生态连接**：支持将第三方 Agent 接入 Microsoft 365 Copilot 生态，扩展 Copilot 的能力边界

这一特性与本章 21.5 节讨论的 Agent Mesh 概念高度契合，也与第 20 章的 Agent 互操作协议形成互补——Connected Agents 提供了协议的商业化落地方案。

### 21.9.4 Manus

**[[Manus]](https://manus.im/)** 是 2025 年创立的 AI Agent 产品，以其面向消费者的通用 Agent 能力引发了广泛关注：

- **通用任务执行**：Manus 定位为"通用 AI Agent"，能够处理从信息研究、数据分析到内容创作的多种任务
- **自主浏览与操作**：Agent 可以自主浏览网页、填写表单、与在线服务交互
- **端到端交付物**：不只是给出建议或文本回复，而是直接生成可用的交付物（文档、表格、报告等）
- **异步任务模式**：支持提交任务后在后台运行，完成后通知用户——类似 Codex 的异步模式

Manus 的意义在于展示了 **Agent 作为消费级产品**的可能性。相比面向开发者的 Agent 框架和面向企业的 Agent 平台，Manus 证明了 Agent 技术可以直接服务于终端用户，这一趋势值得所有 Agent 工程团队关注。

> **新兴平台启示**：上述四个产品/特性共同指向 Agent 技术的两大趋势：（1）**自主性增强**——Agent 从辅助工具进化为能独立完成复杂任务的自主系统；（2）**协作成为标配**——多 Agent 协作不再是研究课题，而是商业产品的核心卖点。这也预示着本书第 9–10 章讨论的多 Agent 模式将在未来几年变得更加重要。

---

## 21.10 本章小结

本章从**平台架构**到**企业集成**，全面探讨了构建生产级 Agent 生态系统所需的各个层面。让我们回顾核心要点：

### 十大要点

**1. 平台即基础设施**

Agent 平台不是简单的 Agent 运行容器，而是一套完整的基础设施——涵盖运行时管理、组件生命周期、多租户隔离和资源配额。`AgentPlatform` 类通过拓扑排序确保组件按正确顺序启动，通过回滚机制保证启动失败时的安全回退。

**2. 注册与发现是生态的神经系统**

企业级 `AgentRegistryService` 远超简单的 `Map` 注册表。它需要：Agent Manifest 验证、能力索引、版本管理、健康检查、负载均衡式的实例解析。`AgentManifest` 作为 Agent 的"身份证"，标准化描述了能力、依赖、安全要求和运行时需求。

**3. Marketplace 是生态的商业引擎**

应用市场不仅是分发渠道，还是质量和安全的把关者。`SecurityReviewPipeline` 的多阶段审查（完整性检查 → 权限审查 → 漏洞扫描 → 数据合规 → 静态分析 → 信任评估）确保只有安全的 Agent 才能进入生态。`AgentPackageManager` 的依赖解析则保证安装的一致性。

**4. 适配器模式统一多平台差异**

`PlatformAdapter` 接口和 `MessageNormalizer` 将 Slack、Teams、Email、WebSocket 等平台的消息格式归一化为统一的 `NormalizedMessage`。`AdapterManager` 统一管理所有适配器的生命周期，`EventRouter` 基于规则将消息路由到正确的 Agent。值得关注的是 OpenClaw 等开源项目已实现 20+ 平台的开箱即用适配，可作为平台适配层的参考实现或直接集成方案。

**5. Agent Mesh 借鉴服务网格的成熟模式**

将 Sidecar 模式引入 Agent 系统，`AgentSidecar` 自动注入认证、限流、日志和追踪。断路器（详见第 18 章 §18.2.2 `HierarchicalCircuitBreaker`）防止级联失败。这种基础设施级的关注点分离让 Agent 开发者专注于业务逻辑。

**6. 流量管理支撑灰度发布**

`AgentTrafficManager` 支持金丝雀发布（按百分比分流）、A/B 测试（多版本对比）和基于 Header 的路由。这让新版本 Agent 能够安全地逐步上线，出现问题时快速回滚。

**7. 模型网关统一多提供商访问**

`ModelGateway` 对上提供统一 API，对下管理 OpenAI、Anthropic、Google、DeepSeek、智谱（GLM）等多个提供商。`FallbackChainExecutor` 实现自动降级，单一提供商故障不会影响整体可用性。`CostTracker` 实现精确到请求级别的成本追踪。

**8. 编排平台降低使用门槛**

`WorkflowExecutor` 支持 DAG 工作流的声明式定义和自动执行。支持顺序、并行、条件分支和人工审核环等常见编排模式。模板库 (`WorkflowTemplateLibrary`) 提供开箱即用的最佳实践。

**9. 企业集成不是可选项**

SSO/OIDC 认证、数据分类与 DLP、审计日志、合规检查——这些在企业部署中都是**必须**的。`DataClassificationEngine` 自动识别身份证号、手机号、API 密钥等敏感信息。`AuditLogger` 记录每一次关键操作。`ComplianceChecker` 持续验证 SOC 2、GDPR 等合规要求。

**10. 生态构建是飞轮效应**

平台提供基础设施 → 开发者构建 Agent → Marketplace 分发 Agent → 用户使用 Agent → 更多用户吸引更多开发者 → 生态壮大。本章构建的各个组件共同支撑这个飞轮：Registry 让 Agent 可发现，Marketplace 让 Agent 可分发，Gateway 让 Agent 可靠运行，Enterprise Integration 让 Agent 可信赖。

### 各组件协作关系

```
┌────────────────────────────────────────────────────────────┐
│                   协作关系总览                               │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  开发者                                                    │
│    │                                                       │
│    ├──▶ ManifestValidator ──▶ AgentRegistryService         │
│    │                              │                        │
│    └──▶ SecurityReviewPipeline ──▶ AgentMarketplace        │
│                                       │                    │
│  用户                                 │                    │
│    │                                  ▼                    │
│    ├──▶ PlatformAdapters ──▶ AdapterManager                │
│    │                              │                        │
│    │       ┌──────────────────────┘                        │
│    │       ▼                                               │
│    │   EventRouter ──▶ WorkflowExecutor                    │
│    │                       │                               │
│    │                       ▼                               │
│    │               AgentMesh (Sidecar)                     │
│    │                       │                               │
│    │                       ▼                               │
│    │               ModelGateway                            │
│    │                  │        │                           │
│    │                  ▼        ▼                           │
│    │           FallbackChain  CostTracker                  │
│    │                                                       │
│    └──▶ EnterpriseIntegrationManager                      │
│              │         │          │                        │
│              ▼         ▼          ▼                        │
│         AuthProvider  DLP     AuditLogger                  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 下一章预告

第 22 章"Agent Experience 设计"将聚焦于 Agent 系统的用户体验层面。我们将探讨：

- **AX（Agent Experience）设计原则**：如何设计直觉、可信赖的 Agent 交互
- **对话设计模式**：多轮对话、主动推送、错误恢复的最佳实践
- **反馈与控制**：如何让用户理解和控制 Agent 的行为
- **可解释性**：让 Agent 的决策过程透明
- **渐进式信任建立**：从辅助工具到自主代理的信任阶梯

在本章构建的坚实平台基础之上，第 22 章将赋予这些 Agent 以"温度"——让技术能力转化为优秀的用户体验。

---
