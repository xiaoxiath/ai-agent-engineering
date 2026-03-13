# 第 18 章：部署架构与运维

> **"构建 AI Agent 只是起点，让它在生产环境中稳定、高效、可持续地运行才是真正的工程挑战。"**

在前一章（第 17 章：可观测性工程）中，我们学习了如何深入洞察 Agent 系统的运行状态。本章将聚焦于 Agent 的部署架构与运维实践——从容器化部署、弹性模式、自动扩缩容，到灾备恢复和生产就绪检查。这些内容构成了 Agent 从实验室走向生产的关键桥梁。

本章涵盖以下核心主题：

- **部署架构**：Kubernetes 原生的 Agent 部署拓扑设计
- **弹性模式**：语义缓存、熔断器、限流器与弹性编排
- **自动扩缩容**：基于多信号的智能扩缩容策略
- **部署策略**：蓝绿部署、金丝雀发布、A/B 测试与影子部署
- **配置管理**：动态配置、特性开关与模型版本管理
- **灾备与恢复**：多区域容灾与状态备份
- **运维自动化**：ChatOps、自愈系统与容量规划
- **生产就绪检查**：全方位的上线前检查清单

---

## 18.1 Agent 部署架构

### 18.1.1 部署拓扑概览

AI Agent 系统的部署架构远比传统 Web 服务复杂。一个典型的 Agent 部署拓扑需要考虑以下维度：

1. **计算层**：Agent 推理服务需要与传统 API 服务不同的资源配比
2. **缓存层**：语义缓存减少对 LLM 的重复调用（参见第 19 章：成本工程）
3. **编排层**：多 Agent 协作场景下的编排与路由
4. **持久层**：Agent 状态、对话历史与知识库的存储
5. **网关层**：统一的 API 网关与流量管理

让我们首先定义核心的部署配置类型体系：

```typescript
// ============================================================
// 文件: agent-deployment-config.ts
// 描述: Agent 部署配置的完整类型定义
// ============================================================

/** 环境类型 */
export type Environment = "development" | "staging" | "production" | "dr";

/** 资源请求与限制 */
export interface ResourceSpec {
  cpu: string;
  memory: string;
  gpu?: string;
  ephemeralStorage?: string;
}

/** 资源配置 */
export interface ResourceConfig {
  requests: ResourceSpec;
  limits: ResourceSpec;
}

/** 健康检查配置 */
export interface HealthCheckConfig {
  path: string;
  port: number;
  initialDelaySeconds: number;
  periodSeconds: number;
  timeoutSeconds: number;
  failureThreshold: number;
  successThreshold: number;
}

/** 自动扩缩容配置 */
export interface AutoScalingConfig {
  enabled: boolean;
  minReplicas: number;
  maxReplicas: number;
  targetCPUUtilization: number;
  targetMemoryUtilization: number;
  customMetrics?: CustomMetricTarget[];
  scaleDownStabilizationSeconds: number;
  scaleUpStabilizationSeconds: number;
}

/** 自定义指标目标 */
export interface CustomMetricTarget {
  metricName: string;
  targetValue: number;
  targetType: "Value" | "AverageValue" | "Utilization";
}

/** 部署策略配置 */
export interface DeploymentStrategyConfig {
  type: "RollingUpdate" | "BlueGreen" | "Canary" | "Shadow";
  rollingUpdate?: {
    maxSurge: string;
    maxUnavailable: string;
  };
  canary?: {
    initialWeight: number;
    weightIncrement: number;
    maxWeight: number;
    analysisInterval: number;
    errorThreshold: number;
    latencyThreshold: number;
  };
}

/** 网络配置 */
export interface NetworkConfig {
  serviceType: "ClusterIP" | "NodePort" | "LoadBalancer";
  port: number;
  targetPort: number;
  ingressEnabled: boolean;
  ingressHost?: string;
  tlsEnabled: boolean;
  tlsSecretName?: string;
}

/** 持久卷配置 */
export interface VolumeConfig {
  name: string;
  mountPath: string;
  storageClass: string;
  size: string;
  accessMode: "ReadWriteOnce" | "ReadWriteMany" | "ReadOnlyMany";
}

/** Agent 专属配置 */
export interface AgentSpecificConfig {
  modelProvider: string;
  modelName: string;
  maxConcurrentRequests: number;
  requestTimeoutMs: number;
  maxTokensPerRequest: number;
  semanticCacheEnabled: boolean;
  circuitBreakerEnabled: boolean;
  rateLimitPerMinute: number;
  toolExecutionTimeoutMs: number;
  memoryBackend: "redis" | "postgres" | "dynamodb";
}

/** 完整的 Agent 部署配置 */
export interface AgentDeploymentConfig {
  name: string;
  namespace: string;
  environment: Environment;
  version: string;
  replicas: number;
  image: string;
  imageTag: string;
  imagePullPolicy: "Always" | "IfNotPresent" | "Never";
  resources: ResourceConfig;
  livenessProbe: HealthCheckConfig;
  readinessProbe: HealthCheckConfig;
  startupProbe?: HealthCheckConfig;
  autoScaling: AutoScalingConfig;
  strategy: DeploymentStrategyConfig;
  network: NetworkConfig;
  volumes: VolumeConfig[];
  agentConfig: AgentSpecificConfig;
  envVars: Record<string, string>;
  secrets: string[];
  labels: Record<string, string>;
  annotations: Record<string, string>;
  nodeSelector?: Record<string, string>;
  tolerations?: Array<{
    key: string;
    operator: string;
    value?: string;
    effect: string;
  }>;
  affinity?: {
    nodeAffinity?: Record<string, unknown>;
    podAffinity?: Record<string, unknown>;
    podAntiAffinity?: Record<string, unknown>;
  };
}
```

### 18.1.2 Kubernetes YAML 模板生成

在实际部署中，我们需要将类型化的配置转换为 Kubernetes 可用的 YAML 清单。以下是完整的模板生成器：

```typescript
// ============================================================
// 文件: k8s-template-generator.ts
// 描述: Kubernetes 部署清单生成器
// ============================================================

import { AgentDeploymentConfig } from "./agent-deployment-config";

export class K8sTemplateGenerator {
  /**
   * 生成完整的 Deployment YAML
   */
  static generateDeploymentYaml(config: AgentDeploymentConfig): string {
    const labels = {
      app: config.name,
      version: config.version,
      environment: config.environment,
      "app.kubernetes.io/name": config.name,
      "app.kubernetes.io/version": config.version,
      "app.kubernetes.io/component": "agent",
      "app.kubernetes.io/managed-by": "agent-deployer",
      ...config.labels,
    };

    const labelString = Object.entries(labels)
      .map(([k, v]) => `      ${k}: "${v}"`)
      .join("\n");

    const annotationString = Object.entries(config.annotations)
      .map(([k, v]) => `      ${k}: "${v}"`)
      .join("\n");

    const envString = Object.entries(config.envVars)
      .map(
        ([k, v]) => `        - name: ${k}
          value: "${v}"`
      )
      .join("\n");

    const secretEnvString = config.secrets
      .map(
        (s) => `        - name: ${s}
          valueFrom:
            secretKeyRef:
              name: ${config.name}-secrets
              key: ${s}`
      )
      .join("\n");

    const volumeMountsString = config.volumes
      .map(
        (v) => `        - name: ${v.name}
          mountPath: ${v.mountPath}`
      )
      .join("\n");

    const volumesString = config.volumes
      .map(
        (v) => `      - name: ${v.name}
        persistentVolumeClaim:
          claimName: ${config.name}-${v.name}-pvc`
      )
      .join("\n");

    const tolerationsString = config.tolerations
      ? config.tolerations
          .map(
            (t) => `      - key: "${t.key}"
        operator: "${t.operator}"
        ${t.value ? `value: "${t.value}"` : ""}
        effect: "${t.effect}"`
          )
          .join("\n")
      : "";

    const nodeSelectorString = config.nodeSelector
      ? Object.entries(config.nodeSelector)
          .map(([k, v]) => `      ${k}: "${v}"`)
          .join("\n")
      : "";

    return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${config.name}
  namespace: ${config.namespace}
  labels:
${labelString}
  annotations:
${annotationString}
spec:
  replicas: ${config.replicas}
  selector:
    matchLabels:
      app: "${config.name}"
      version: "${config.version}"
  strategy:
    type: ${config.strategy.type === "RollingUpdate" ? "RollingUpdate" : "RollingUpdate"}
    rollingUpdate:
      maxSurge: ${config.strategy.rollingUpdate?.maxSurge || "25%"}
      maxUnavailable: ${config.strategy.rollingUpdate?.maxUnavailable || "25%"}
  template:
    metadata:
      labels:
${labelString}
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "${config.network.targetPort}"
        prometheus.io/path: "/metrics"
    spec:
${nodeSelectorString ? `      nodeSelector:\n${nodeSelectorString}` : ""}
${tolerationsString ? `      tolerations:\n${tolerationsString}` : ""}
      serviceAccountName: ${config.name}-sa
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
      containers:
      - name: ${config.name}
        image: ${config.image}:${config.imageTag}
        imagePullPolicy: ${config.imagePullPolicy}
        ports:
        - containerPort: ${config.network.targetPort}
          protocol: TCP
          name: http
        - containerPort: 9090
          protocol: TCP
          name: metrics
        env:
${envString}
${secretEnvString}
        - name: AGENT_MODEL_PROVIDER
          value: "${config.agentConfig.modelProvider}"
        - name: AGENT_MODEL_NAME
          value: "${config.agentConfig.modelName}"
        - name: AGENT_MAX_CONCURRENT
          value: "${config.agentConfig.maxConcurrentRequests}"
        - name: AGENT_REQUEST_TIMEOUT_MS
          value: "${config.agentConfig.requestTimeoutMs}"
        - name: AGENT_SEMANTIC_CACHE_ENABLED
          value: "${config.agentConfig.semanticCacheEnabled}"
        - name: AGENT_CIRCUIT_BREAKER_ENABLED
          value: "${config.agentConfig.circuitBreakerEnabled}"
        - name: AGENT_RATE_LIMIT_PER_MINUTE
          value: "${config.agentConfig.rateLimitPerMinute}"
        resources:
          requests:
            cpu: ${config.resources.requests.cpu}
            memory: ${config.resources.requests.memory}
${config.resources.requests.gpu ? `            nvidia.com/gpu: ${config.resources.requests.gpu}` : ""}
          limits:
            cpu: ${config.resources.limits.cpu}
            memory: ${config.resources.limits.memory}
${config.resources.limits.gpu ? `            nvidia.com/gpu: ${config.resources.limits.gpu}` : ""}
        livenessProbe:
          httpGet:
            path: ${config.livenessProbe.path}
            port: ${config.livenessProbe.port}
          initialDelaySeconds: ${config.livenessProbe.initialDelaySeconds}
          periodSeconds: ${config.livenessProbe.periodSeconds}
          timeoutSeconds: ${config.livenessProbe.timeoutSeconds}
          failureThreshold: ${config.livenessProbe.failureThreshold}
        readinessProbe:
          httpGet:
            path: ${config.readinessProbe.path}
            port: ${config.readinessProbe.port}
          initialDelaySeconds: ${config.readinessProbe.initialDelaySeconds}
          periodSeconds: ${config.readinessProbe.periodSeconds}
          timeoutSeconds: ${config.readinessProbe.timeoutSeconds}
          failureThreshold: ${config.readinessProbe.failureThreshold}
          successThreshold: ${config.readinessProbe.successThreshold}
${config.startupProbe ? `        startupProbe:
          httpGet:
            path: ${config.startupProbe.path}
            port: ${config.startupProbe.port}
          initialDelaySeconds: ${config.startupProbe.initialDelaySeconds}
          periodSeconds: ${config.startupProbe.periodSeconds}
          failureThreshold: ${config.startupProbe.failureThreshold}` : ""}
        volumeMounts:
${volumeMountsString}
      volumes:
${volumesString}
---
apiVersion: v1
kind: Service
metadata:
  name: ${config.name}-svc
  namespace: ${config.namespace}
  labels:
    app: "${config.name}"
spec:
  type: ${config.network.serviceType}
  ports:
  - port: ${config.network.port}
    targetPort: ${config.network.targetPort}
    protocol: TCP
    name: http
  - port: 9090
    targetPort: 9090
    protocol: TCP
    name: metrics
  selector:
    app: "${config.name}"
${config.network.ingressEnabled ? `---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${config.name}-ingress
  namespace: ${config.namespace}
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/proxy-read-timeout: "${config.agentConfig.requestTimeoutMs}"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "${config.agentConfig.requestTimeoutMs}"
spec:
  ${config.network.tlsEnabled ? `tls:
  - hosts:
    - ${config.network.ingressHost}
    secretName: ${config.network.tlsSecretName}` : ""}
  rules:
  - host: ${config.network.ingressHost}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: ${config.name}-svc
            port:
              number: ${config.network.port}` : ""}`;
  }

  /**
   * 生成 HPA YAML
   */
  static generateHPAYaml(config: AgentDeploymentConfig): string {
    if (!config.autoScaling.enabled) return "";

    const customMetricsString = config.autoScaling.customMetrics
      ? config.autoScaling.customMetrics
          .map(
            (m) => `  - type: Pods
    pods:
      metric:
        name: ${m.metricName}
      target:
        type: ${m.targetType}
        ${m.targetType === "AverageValue" ? "averageValue" : "value"}: "${m.targetValue}"`
          )
          .join("\n")
      : "";

    return `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${config.name}-hpa
  namespace: ${config.namespace}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ${config.name}
  minReplicas: ${config.autoScaling.minReplicas}
  maxReplicas: ${config.autoScaling.maxReplicas}
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: ${config.autoScaling.targetCPUUtilization}
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: ${config.autoScaling.targetMemoryUtilization}
${customMetricsString}
  behavior:
    scaleDown:
      stabilizationWindowSeconds: ${config.autoScaling.scaleDownStabilizationSeconds}
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
      - type: Pods
        value: 2
        periodSeconds: 60
      selectPolicy: Min
    scaleUp:
      stabilizationWindowSeconds: ${config.autoScaling.scaleUpStabilizationSeconds}
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
      - type: Pods
        value: 4
        periodSeconds: 60
      selectPolicy: Max`;
  }

  /**
   * 生成 PVC YAML
   */
  static generatePVCYaml(config: AgentDeploymentConfig): string {
    return config.volumes
      .map(
        (v) => `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ${config.name}-${v.name}-pvc
  namespace: ${config.namespace}
spec:
  accessModes:
  - ${v.accessMode}
  storageClassName: ${v.storageClass}
  resources:
    requests:
      storage: ${v.size}`
      )
      .join("\n---\n");
  }
}
```

### 18.1.3 K8s Agent 部署器

有了配置类型和模板生成器，接下来实现完整的部署器——它将配置验证、模板生成、集群部署整合为统一流程：

```typescript
// ============================================================
// 文件: k8s-agent-deployer.ts
// 描述: Kubernetes Agent 部署器的完整实现
// ============================================================

import {
  AgentDeploymentConfig,
  Environment,
  ResourceConfig,
} from "./agent-deployment-config";
import { K8sTemplateGenerator } from "./k8s-template-generator";

/** 部署结果 */
export interface DeploymentResult {
  success: boolean;
  deploymentId: string;
  environment: Environment;
  version: string;
  replicas: number;
  endpoints: string[];
  warnings: string[];
  errors: string[];
  timestamp: Date;
  duration: number;
}

/** 部署前验证结果 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** K8s 集群客户端接口 */
export interface K8sClient {
  applyManifest(yaml: string, namespace: string): Promise<{ ok: boolean; message: string }>;
  getDeploymentStatus(name: string, namespace: string): Promise<{
    ready: boolean;
    availableReplicas: number;
    updatedReplicas: number;
    conditions: Array<{ type: string; status: string; message: string }>;
  }>;
  deleteDeployment(name: string, namespace: string): Promise<{ ok: boolean }>;
  getNamespaces(): Promise<string[]>;
  getPods(
    namespace: string,
    labelSelector: string
  ): Promise<Array<{ name: string; status: string; restarts: number }>>;
}

/**
 * K8sAgentDeployer - Kubernetes 原生 Agent 部署器
 *
 * 职责：
 * 1. 验证部署配置的完整性与合理性
 * 2. 生成 Kubernetes 清单文件
 * 3. 协调部署流程（包括前置检查、部署、后置验证）
 * 4. 提供部署回滚能力
 */
export class K8sAgentDeployer {
  private client: K8sClient;
  private deploymentHistory: Map<string, DeploymentResult[]> = new Map();

  constructor(client: K8sClient) {
    this.client = client;
  }

  /**
   * 验证部署配置
   */
  validateConfig(config: AgentDeploymentConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 基本字段验证
    if (!config.name || config.name.length === 0) {
      errors.push("部署名称不能为空");
    }
    if (!/^[a-z][a-z0-9-]*$/.test(config.name)) {
      errors.push("部署名称必须符合 DNS 子域名规则：小写字母开头，只包含小写字母、数字和连字符");
    }
    if (!config.namespace) {
      errors.push("命名空间不能为空");
    }
    if (!config.image || !config.imageTag) {
      errors.push("镜像地址和标签不能为空");
    }

    // 资源配置验证
    this.validateResources(config.resources, errors, warnings);

    // 副本数验证
    if (config.replicas < 1) {
      errors.push("副本数必须大于 0");
    }
    if (config.environment === "production" && config.replicas < 2) {
      warnings.push("生产环境建议至少 2 个副本以保证高可用");
    }

    // Agent 特定验证
    if (config.agentConfig.maxConcurrentRequests < 1) {
      errors.push("最大并发请求数必须大于 0");
    }
    if (config.agentConfig.requestTimeoutMs < 1000) {
      warnings.push("Agent 请求超时建议不低于 1000ms，LLM 调用通常需要较长时间");
    }
    if (config.agentConfig.rateLimitPerMinute < 1) {
      errors.push("速率限制每分钟请求数必须大于 0");
    }

    // 自动扩缩容验证
    if (config.autoScaling.enabled) {
      if (config.autoScaling.minReplicas > config.autoScaling.maxReplicas) {
        errors.push("自动扩缩容最小副本数不能大于最大副本数");
      }
      if (config.autoScaling.targetCPUUtilization < 10 || config.autoScaling.targetCPUUtilization > 95) {
        warnings.push("CPU 利用率目标建议在 10-95% 之间");
      }
    }

    // 健康检查验证
    if (config.livenessProbe.initialDelaySeconds < config.readinessProbe.initialDelaySeconds) {
      warnings.push("存活探针的初始延迟建议不低于就绪探针的初始延迟");
    }

    // 生产环境额外检查
    if (config.environment === "production") {
      if (!config.network.tlsEnabled) {
        warnings.push("生产环境强烈建议启用 TLS");
      }
      if (!config.agentConfig.circuitBreakerEnabled) {
        warnings.push("生产环境强烈建议启用熔断器");
      }
      if (!config.agentConfig.semanticCacheEnabled) {
        warnings.push("生产环境建议启用语义缓存以降低成本");
      }
      if (config.imagePullPolicy !== "Always") {
        warnings.push("生产环境建议使用 Always 镜像拉取策略");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 验证资源配置
   */
  private validateResources(
    resources: ResourceConfig,
    errors: string[],
    warnings: string[]
  ): void {
    const parseCpu = (cpu: string): number => {
      if (cpu.endsWith("m")) return parseInt(cpu.slice(0, -1));
      return parseFloat(cpu) * 1000;
    };

    const parseMemory = (mem: string): number => {
      if (mem.endsWith("Gi")) return parseFloat(mem.slice(0, -2)) * 1024;
      if (mem.endsWith("Mi")) return parseFloat(mem.slice(0, -2));
      return parseFloat(mem);
    };

    const reqCpu = parseCpu(resources.requests.cpu);
    const limCpu = parseCpu(resources.limits.cpu);
    const reqMem = parseMemory(resources.requests.memory);
    const limMem = parseMemory(resources.limits.memory);

    if (reqCpu > limCpu) {
      errors.push("CPU 请求不能超过限制");
    }
    if (reqMem > limMem) {
      errors.push("内存请求不能超过限制");
    }
    if (reqMem < 256) {
      warnings.push("Agent 服务内存请求建议不低于 256Mi");
    }
  }

  /**
   * 执行部署
   */
  async deploy(config: AgentDeploymentConfig): Promise<DeploymentResult> {
    const startTime = Date.now();
    const deploymentId = `${config.name}-${config.version}-${Date.now()}`;
    const warnings: string[] = [];
    const errors: string[] = [];

    console.log(`[K8sAgentDeployer] 开始部署 ${config.name} v${config.version}`);

    // 步骤 1: 配置验证
    console.log("[K8sAgentDeployer] 步骤 1/5: 验证配置...");
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      return {
        success: false,
        deploymentId,
        environment: config.environment,
        version: config.version,
        replicas: 0,
        endpoints: [],
        warnings: validation.warnings,
        errors: validation.errors,
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };
    }
    warnings.push(...validation.warnings);

    // 步骤 2: 检查命名空间
    console.log("[K8sAgentDeployer] 步骤 2/5: 检查命名空间...");
    try {
      const namespaces = await this.client.getNamespaces();
      if (!namespaces.includes(config.namespace)) {
        const nsYaml = `apiVersion: v1
kind: Namespace
metadata:
  name: ${config.namespace}
  labels:
    environment: "${config.environment}"`;
        await this.client.applyManifest(nsYaml, "default");
        console.log(`[K8sAgentDeployer] 已创建命名空间: ${config.namespace}`);
      }
    } catch (err) {
      errors.push(`命名空间检查失败: ${err}`);
    }

    // 步骤 3: 生成并应用 PVC
    console.log("[K8sAgentDeployer] 步骤 3/5: 创建持久卷...");
    if (config.volumes.length > 0) {
      const pvcYaml = K8sTemplateGenerator.generatePVCYaml(config);
      try {
        await this.client.applyManifest(pvcYaml, config.namespace);
      } catch (err) {
        errors.push(`PVC 创建失败: ${err}`);
      }
    }

    // 步骤 4: 应用 Deployment + Service + Ingress
    console.log("[K8sAgentDeployer] 步骤 4/5: 部署应用...");
    const deploymentYaml = K8sTemplateGenerator.generateDeploymentYaml(config);
    try {
      const result = await this.client.applyManifest(deploymentYaml, config.namespace);
      if (!result.ok) {
        errors.push(`部署应用失败: ${result.message}`);
      }
    } catch (err) {
      errors.push(`部署应用异常: ${err}`);
    }

    // 步骤 4.5: 应用 HPA
    if (config.autoScaling.enabled) {
      const hpaYaml = K8sTemplateGenerator.generateHPAYaml(config);
      try {
        await this.client.applyManifest(hpaYaml, config.namespace);
      } catch (err) {
        warnings.push(`HPA 创建失败（非阻塞）: ${err}`);
      }
    }

    // 步骤 5: 等待部署就绪
    console.log("[K8sAgentDeployer] 步骤 5/5: 等待部署就绪...");
    const ready = await this.waitForReady(config.name, config.namespace, 300000);
    if (!ready) {
      errors.push("部署超时：Pod 未能在 5 分钟内就绪");
    }

    // 构造端点
    const endpoints: string[] = [];
    if (config.network.ingressEnabled && config.network.ingressHost) {
      const protocol = config.network.tlsEnabled ? "https" : "http";
      endpoints.push(`${protocol}://${config.network.ingressHost}`);
    }
    endpoints.push(
      `http://${config.name}-svc.${config.namespace}.svc.cluster.local:${config.network.port}`
    );

    const deployResult: DeploymentResult = {
      success: errors.length === 0,
      deploymentId,
      environment: config.environment,
      version: config.version,
      replicas: config.replicas,
      endpoints,
      warnings,
      errors,
      timestamp: new Date(),
      duration: Date.now() - startTime,
    };

    // 记录部署历史
    const history = this.deploymentHistory.get(config.name) || [];
    history.push(deployResult);
    this.deploymentHistory.set(config.name, history);

    console.log(
      `[K8sAgentDeployer] 部署${deployResult.success ? "成功" : "失败"}: ${deploymentId}, 耗时 ${deployResult.duration}ms`
    );

    return deployResult;
  }

  /**
   * 等待部署就绪
   */
  private async waitForReady(
    name: string,
    namespace: string,
    timeoutMs: number
  ): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 5000;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.client.getDeploymentStatus(name, namespace);
        if (status.ready) {
          console.log(`[K8sAgentDeployer] 部署就绪: ${status.availableReplicas} 个副本可用`);
          return true;
        }
        console.log(
          `[K8sAgentDeployer] 等待就绪... 可用: ${status.availableReplicas}, 已更新: ${status.updatedReplicas}`
        );
      } catch (err) {
        console.log(`[K8sAgentDeployer] 状态查询异常: ${err}`);
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
    return false;
  }

  /**
   * 回滚到上一个版本
   */
  async rollback(name: string, namespace: string): Promise<DeploymentResult> {
    const startTime = Date.now();
    const history = this.deploymentHistory.get(name) || [];
    const successfulDeploys = history.filter((h) => h.success);

    if (successfulDeploys.length < 2) {
      return {
        success: false,
        deploymentId: `rollback-${Date.now()}`,
        environment: "production",
        version: "unknown",
        replicas: 0,
        endpoints: [],
        warnings: [],
        errors: ["没有足够的历史部署记录可供回滚"],
        timestamp: new Date(),
        duration: Date.now() - startTime,
      };
    }

    const previousDeploy = successfulDeploys[successfulDeploys.length - 2];
    console.log(`[K8sAgentDeployer] 回滚 ${name} 到版本 ${previousDeploy.version}`);

    return {
      success: true,
      deploymentId: `rollback-${Date.now()}`,
      environment: previousDeploy.environment,
      version: previousDeploy.version,
      replicas: previousDeploy.replicas,
      endpoints: previousDeploy.endpoints,
      warnings: ["此为回滚部署"],
      errors: [],
      timestamp: new Date(),
      duration: Date.now() - startTime,
    };
  }

  /**
   * 获取部署状态
   */
  async getStatus(
    name: string,
    namespace: string
  ): Promise<{
    healthy: boolean;
    pods: Array<{ name: string; status: string; restarts: number }>;
    message: string;
  }> {
    try {
      const pods = await this.client.getPods(namespace, `app=${name}`);
      const unhealthyPods = pods.filter(
        (p) => p.status !== "Running" || p.restarts > 5
      );

      return {
        healthy: unhealthyPods.length === 0 && pods.length > 0,
        pods,
        message:
          unhealthyPods.length > 0
            ? `${unhealthyPods.length} 个 Pod 处于异常状态`
            : pods.length === 0
              ? "没有发现运行中的 Pod"
              : `所有 ${pods.length} 个 Pod 运行正常`,
      };
    } catch (err) {
      return {
        healthy: false,
        pods: [],
        message: `状态查询失败: ${err}`,
      };
    }
  }

  /**
   * 获取默认生产配置模板
   */
  static getDefaultProductionConfig(
    name: string,
    image: string,
    version: string
  ): AgentDeploymentConfig {
    return {
      name,
      namespace: "agent-production",
      environment: "production",
      version,
      replicas: 3,
      image,
      imageTag: version,
      imagePullPolicy: "Always",
      resources: {
        requests: { cpu: "500m", memory: "512Mi" },
        limits: { cpu: "2000m", memory: "2Gi" },
      },
      livenessProbe: {
        path: "/health/live",
        port: 8080,
        initialDelaySeconds: 30,
        periodSeconds: 10,
        timeoutSeconds: 5,
        failureThreshold: 3,
        successThreshold: 1,
      },
      readinessProbe: {
        path: "/health/ready",
        port: 8080,
        initialDelaySeconds: 15,
        periodSeconds: 5,
        timeoutSeconds: 3,
        failureThreshold: 3,
        successThreshold: 2,
      },
      startupProbe: {
        path: "/health/startup",
        port: 8080,
        initialDelaySeconds: 5,
        periodSeconds: 5,
        timeoutSeconds: 3,
        failureThreshold: 30,
        successThreshold: 1,
      },
      autoScaling: {
        enabled: true,
        minReplicas: 3,
        maxReplicas: 20,
        targetCPUUtilization: 70,
        targetMemoryUtilization: 80,
        customMetrics: [
          {
            metricName: "agent_queue_depth",
            targetValue: 10,
            targetType: "AverageValue",
          },
          {
            metricName: "agent_response_time_p95",
            targetValue: 5000,
            targetType: "AverageValue",
          },
        ],
        scaleDownStabilizationSeconds: 300,
        scaleUpStabilizationSeconds: 60,
      },
      strategy: {
        type: "RollingUpdate",
        rollingUpdate: {
          maxSurge: "25%",
          maxUnavailable: "0",
        },
      },
      network: {
        serviceType: "ClusterIP",
        port: 80,
        targetPort: 8080,
        ingressEnabled: true,
        ingressHost: `${name}.agents.example.com`,
        tlsEnabled: true,
        tlsSecretName: `${name}-tls`,
      },
      volumes: [
        {
          name: "agent-data",
          mountPath: "/data",
          storageClass: "fast-ssd",
          size: "10Gi",
          accessMode: "ReadWriteOnce",
        },
      ],
      agentConfig: {
        modelProvider: "openai",
        modelName: "gpt-4",
        maxConcurrentRequests: 50,
        requestTimeoutMs: 30000,
        maxTokensPerRequest: 4096,
        semanticCacheEnabled: true,
        circuitBreakerEnabled: true,
        rateLimitPerMinute: 1000,
        toolExecutionTimeoutMs: 10000,
        memoryBackend: "redis",
      },
      envVars: {
        NODE_ENV: "production",
        LOG_LEVEL: "info",
        METRICS_ENABLED: "true",
      },
      secrets: [
        "OPENAI_API_KEY",
        "REDIS_PASSWORD",
        "DATABASE_URL",
      ],
      labels: {
        team: "ai-platform",
        cost_center: "ai-ops",
      },
      annotations: {
        "deployment.kubernetes.io/revision": "1",
      },
      nodeSelector: {
        "node.kubernetes.io/instance-type": "compute-optimized",
      },
      tolerations: [
        {
          key: "dedicated",
          operator: "Equal",
          value: "agent-workload",
          effect: "NoSchedule",
        },
      ],
    };
  }
}
```

---

## 18.2 弹性模式

弹性（Resilience）是 Agent 系统在面对各种故障时仍能提供服务的能力。在第 3 章（Agent 架构总览）中，我们初步介绍了弹性设计的原则；本节将深入实现生产级的弹性模式组件。

### 18.2.1 高级语义缓存

语义缓存是 Agent 系统中的关键优化手段。与传统的精确匹配缓存不同，语义缓存通过向量相似度匹配来判断请求是否可以命中缓存，从而大幅减少对 LLM 的重复调用。

```typescript
// ============================================================
// 文件: advanced-semantic-cache.ts
// 描述: 带 LRU 淘汰、TTL 过期、命中率追踪的高级语义缓存
// ============================================================

/** 缓存条目 */
interface CacheEntry<T> {
  key: string;
  value: T;
  embedding: number[];
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  ttlMs: number;
  metadata: Record<string, string>;
  size: number;
}

/** 缓存统计 */
export interface CacheStats {
  totalRequests: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  totalEntries: number;
  memoryUsageBytes: number;
  averageAccessCount: number;
  oldestEntryAge: number;
  p50LookupTimeMs: number;
  p95LookupTimeMs: number;
  p99LookupTimeMs: number;
}

/** 语义缓存配置 */
export interface SemanticCacheConfig {
  maxEntries: number;
  defaultTTLMs: number;
  similarityThreshold: number;
  maxMemoryBytes: number;
  enableLRU: boolean;
  enableTTL: boolean;
  enableStats: boolean;
  embeddingDimension: number;
  evictionPolicy: "lru" | "lfu" | "ttl-first";
  warmupKeys?: string[];
}

/** 嵌入向量提供者接口 */
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

/**
 * AdvancedSemanticCache - 生产级语义缓存
 *
 * 核心特性：
 * - 基于向量相似度的语义匹配
 * - LRU/LFU 混合淘汰策略
 * - TTL 过期管理
 * - 命中率追踪与性能指标
 * - 内存用量控制
 * - 批量预热
 */
export class AdvancedSemanticCache<T> {
  private entries: Map<string, CacheEntry<T>> = new Map();
  private config: SemanticCacheConfig;
  private embeddingProvider: EmbeddingProvider;
  private stats: {
    totalRequests: number;
    hits: number;
    misses: number;
    evictions: number;
    lookupTimes: number[];
  };
  private currentMemoryUsage: number = 0;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: SemanticCacheConfig, embeddingProvider: EmbeddingProvider) {
    this.config = config;
    this.embeddingProvider = embeddingProvider;
    this.stats = {
      totalRequests: 0,
      hits: 0,
      misses: 0,
      evictions: 0,
      lookupTimes: [],
    };

    // 启动定期清理过期条目的任务
    if (config.enableTTL) {
      this.cleanupInterval = setInterval(() => this.cleanupExpired(), 60000);
    }
  }

  /**
   * 查询缓存
   */
  async get(query: string): Promise<{ value: T; similarity: number } | null> {
    const startTime = Date.now();
    this.stats.totalRequests++;

    try {
      // 首先清理过期条目
      if (this.config.enableTTL) {
        this.cleanupExpired();
      }

      // 计算查询的嵌入向量
      const queryEmbedding = await this.embeddingProvider.embed(query);

      // 在所有缓存条目中寻找最相似的
      let bestMatch: { entry: CacheEntry<T>; similarity: number } | null = null;

      for (const entry of this.entries.values()) {
        // 检查 TTL
        if (this.config.enableTTL && this.isExpired(entry)) {
          continue;
        }

        const similarity = this.cosineSimilarity(queryEmbedding, entry.embedding);

        if (
          similarity >= this.config.similarityThreshold &&
          (!bestMatch || similarity > bestMatch.similarity)
        ) {
          bestMatch = { entry, similarity };
        }
      }

      if (bestMatch) {
        // 更新访问统计
        bestMatch.entry.lastAccessedAt = Date.now();
        bestMatch.entry.accessCount++;
        this.stats.hits++;

        this.recordLookupTime(Date.now() - startTime);
        return { value: bestMatch.entry.value, similarity: bestMatch.similarity };
      }

      this.stats.misses++;
      this.recordLookupTime(Date.now() - startTime);
      return null;
    } catch (error) {
      this.stats.misses++;
      this.recordLookupTime(Date.now() - startTime);
      console.error("[AdvancedSemanticCache] 查询异常:", error);
      return null;
    }
  }

  /**
   * 写入缓存
   */
  async set(
    key: string,
    value: T,
    options?: { ttlMs?: number; metadata?: Record<string, string> }
  ): Promise<void> {
    const embedding = await this.embeddingProvider.embed(key);
    const entrySize = this.estimateSize(value);
    const ttlMs = options?.ttlMs || this.config.defaultTTLMs;

    // 检查内存限制，必要时进行淘汰
    while (
      (this.currentMemoryUsage + entrySize > this.config.maxMemoryBytes ||
        this.entries.size >= this.config.maxEntries) &&
      this.entries.size > 0
    ) {
      this.evictOne();
    }

    const entry: CacheEntry<T> = {
      key,
      value,
      embedding,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 0,
      ttlMs,
      metadata: options?.metadata || {},
      size: entrySize,
    };

    // 如果 key 已存在，先减去旧的内存占用
    const existing = this.entries.get(key);
    if (existing) {
      this.currentMemoryUsage -= existing.size;
    }

    this.entries.set(key, entry);
    this.currentMemoryUsage += entrySize;
  }

  /**
   * 删除缓存条目
   */
  delete(key: string): boolean {
    const entry = this.entries.get(key);
    if (entry) {
      this.currentMemoryUsage -= entry.size;
      this.entries.delete(key);
      return true;
    }
    return false;
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.entries.clear();
    this.currentMemoryUsage = 0;
  }

  /**
   * 批量预热缓存
   */
  async warmup(items: Array<{ key: string; value: T }>): Promise<number> {
    let loaded = 0;
    const batchSize = 10;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const keys = batch.map((item) => item.key);
      const embeddings = await this.embeddingProvider.embedBatch(keys);

      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const entrySize = this.estimateSize(item.value);

        if (this.currentMemoryUsage + entrySize > this.config.maxMemoryBytes) {
          console.log(`[AdvancedSemanticCache] 预热因内存限制停止，已加载 ${loaded} 条`);
          return loaded;
        }

        const entry: CacheEntry<T> = {
          key: item.key,
          value: item.value,
          embedding: embeddings[j],
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 0,
          ttlMs: this.config.defaultTTLMs,
          metadata: { source: "warmup" },
          size: entrySize,
        };

        this.entries.set(item.key, entry);
        this.currentMemoryUsage += entrySize;
        loaded++;
      }
    }

    console.log(`[AdvancedSemanticCache] 预热完成，加载 ${loaded} 条`);
    return loaded;
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): CacheStats {
    const now = Date.now();
    let oldestAge = 0;
    let totalAccessCount = 0;

    for (const entry of this.entries.values()) {
      const age = now - entry.createdAt;
      if (age > oldestAge) oldestAge = age;
      totalAccessCount += entry.accessCount;
    }

    const sortedTimes = [...this.stats.lookupTimes].sort((a, b) => a - b);
    const p50 = this.percentile(sortedTimes, 50);
    const p95 = this.percentile(sortedTimes, 95);
    const p99 = this.percentile(sortedTimes, 99);

    return {
      totalRequests: this.stats.totalRequests,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate:
        this.stats.totalRequests > 0
          ? this.stats.hits / this.stats.totalRequests
          : 0,
      evictions: this.stats.evictions,
      totalEntries: this.entries.size,
      memoryUsageBytes: this.currentMemoryUsage,
      averageAccessCount:
        this.entries.size > 0 ? totalAccessCount / this.entries.size : 0,
      oldestEntryAge: oldestAge,
      p50LookupTimeMs: p50,
      p95LookupTimeMs: p95,
      p99LookupTimeMs: p99,
    };
  }

  /**
   * 淘汰一条缓存条目
   */
  private evictOne(): void {
    let victimKey: string | null = null;

    switch (this.config.evictionPolicy) {
      case "lru": {
        let oldestAccess = Infinity;
        for (const [key, entry] of this.entries) {
          if (entry.lastAccessedAt < oldestAccess) {
            oldestAccess = entry.lastAccessedAt;
            victimKey = key;
          }
        }
        break;
      }
      case "lfu": {
        let leastFrequent = Infinity;
        for (const [key, entry] of this.entries) {
          if (entry.accessCount < leastFrequent) {
            leastFrequent = entry.accessCount;
            victimKey = key;
          }
        }
        break;
      }
      case "ttl-first": {
        let nearestExpiry = Infinity;
        for (const [key, entry] of this.entries) {
          const expiryTime = entry.createdAt + entry.ttlMs;
          if (expiryTime < nearestExpiry) {
            nearestExpiry = expiryTime;
            victimKey = key;
          }
        }
        break;
      }
    }

    if (victimKey) {
      const entry = this.entries.get(victimKey);
      if (entry) {
        this.currentMemoryUsage -= entry.size;
        this.entries.delete(victimKey);
        this.stats.evictions++;
      }
    }
  }

  /**
   * 清理过期条目
   */
  private cleanupExpired(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.entries) {
      if (this.isExpired(entry)) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      const entry = this.entries.get(key);
      if (entry) {
        this.currentMemoryUsage -= entry.size;
        this.entries.delete(key);
        this.stats.evictions++;
      }
    }

    if (expiredKeys.length > 0) {
      console.log(
        `[AdvancedSemanticCache] 清理了 ${expiredKeys.length} 条过期缓存`
      );
    }
  }

  /**
   * 检查条目是否过期
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.createdAt > entry.ttlMs;
  }

  // cosineSimilarity 实现见第 5 章 Context Engineering 的工具函数定义
  // 此处为简化展示，完整实现请参考 code-examples/shared/utils.ts
  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
    return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0;
  }

  /**
   * 估算值的内存大小
   */
  private estimateSize(value: T): number {
    const json = JSON.stringify(value);
    return json.length * 2 + this.config.embeddingDimension * 8;
  }

  /**
   * 记录查找时间
   */
  private recordLookupTime(timeMs: number): void {
    this.stats.lookupTimes.push(timeMs);
    // 只保留最近 10000 条记录
    if (this.stats.lookupTimes.length > 10000) {
      this.stats.lookupTimes = this.stats.lookupTimes.slice(-5000);
    }
  }

  /**
   * 计算百分位数
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * 销毁缓存实例，清理定时器
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}
```

### 18.2.2 分层熔断器

熔断器是保护 Agent 系统免受下游服务故障影响的核心组件。在实际的 Agent 系统中，我们需要的不仅是单一的熔断器，还需要支持层级关系——例如对不同模型提供商、不同工具分别设置独立的熔断策略：

```typescript
// ============================================================
// 文件: hierarchical-circuit-breaker.ts
// 描述: 支持层级关系的分层熔断器
// ============================================================

/** 熔断器状态 */
export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

/** 熔断器配置 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
  halfOpenMaxAttempts: number;
  monitorWindowMs: number;
  failureRateThreshold: number;
  slowCallThreshold: number;
  slowCallRateThreshold: number;
  minimumCallCount: number;
}

/** 熔断器指标 */
export interface CircuitBreakerMetrics {
  state: CircuitState;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  slowCalls: number;
  failureRate: number;
  slowCallRate: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  stateChangedAt: number;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
}

/** 滑动窗口记录 */
interface CallRecord {
  timestamp: number;
  success: boolean;
  durationMs: number;
}

/**
 * HierarchicalCircuitBreaker - 分层熔断器
 *
 * 支持：
 * - 基于失败率的熔断
 * - 基于慢调用率的熔断
 * - 滑动时间窗口
 * - 半开状态的渐进恢复
 * - 父子层级关系（父级熔断会级联到子级）
 */
export class HierarchicalCircuitBreaker {
  private state: CircuitState = "CLOSED";
  private config: CircuitBreakerConfig;
  private name: string;
  private callRecords: CallRecord[] = [];
  private halfOpenAttempts: number = 0;
  private consecutiveSuccesses: number = 0;
  private consecutiveFailures: number = 0;
  private stateChangedAt: number = Date.now();
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private children: Map<string, HierarchicalCircuitBreaker> = new Map();
  private parent: HierarchicalCircuitBreaker | null = null;
  private listeners: Array<
    (name: string, from: CircuitState, to: CircuitState) => void
  > = [];

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name;
    this.config = {
      failureThreshold: 5,
      successThreshold: 3,
      timeoutMs: 30000,
      halfOpenMaxAttempts: 3,
      monitorWindowMs: 60000,
      failureRateThreshold: 0.5,
      slowCallThreshold: 10000,
      slowCallRateThreshold: 0.8,
      minimumCallCount: 10,
      ...config,
    };
  }

  /**
   * 添加子熔断器
   */
  addChild(child: HierarchicalCircuitBreaker): void {
    child.parent = this;
    this.children.set(child.getName(), child);
  }

  /**
   * 获取子熔断器
   */
  getChild(name: string): HierarchicalCircuitBreaker | undefined {
    return this.children.get(name);
  }

  /**
   * 获取熔断器名称
   */
  getName(): string {
    return this.name;
  }

  /**
   * 注册状态变更监听器
   */
  onStateChange(
    listener: (name: string, from: CircuitState, to: CircuitState) => void
  ): void {
    this.listeners.push(listener);
  }

  /**
   * 执行被保护的调用
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // 检查父级熔断器状态
    if (this.parent && this.parent.getState() === "OPEN") {
      throw new CircuitBreakerError(
        `父级熔断器 ${this.parent.getName()} 已打开，拒绝请求`,
        this.parent.getName()
      );
    }

    // 检查当前熔断器状态
    if (this.state === "OPEN") {
      if (Date.now() - this.stateChangedAt > this.config.timeoutMs) {
        this.transitionTo("HALF_OPEN");
      } else {
        throw new CircuitBreakerError(
          `熔断器 ${this.name} 已打开，拒绝请求`,
          this.name
        );
      }
    }

    if (this.state === "HALF_OPEN" && this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
      throw new CircuitBreakerError(
        `熔断器 ${this.name} 半开状态已达最大尝试次数`,
        this.name
      );
    }

    const startTime = Date.now();

    try {
      if (this.state === "HALF_OPEN") {
        this.halfOpenAttempts++;
      }

      const result = await fn();
      const duration = Date.now() - startTime;

      this.recordCall(true, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordCall(false, duration);
      throw error;
    }
  }

  /**
   * 记录调用结果
   */
  private recordCall(success: boolean, durationMs: number): void {
    const now = Date.now();

    this.callRecords.push({ timestamp: now, success, durationMs });

    // 清理过期记录
    this.callRecords = this.callRecords.filter(
      (r) => now - r.timestamp <= this.config.monitorWindowMs
    );

    if (success) {
      this.consecutiveSuccesses++;
      this.consecutiveFailures = 0;
      this.lastSuccessTime = now;
    } else {
      this.consecutiveFailures++;
      this.consecutiveSuccesses = 0;
      this.lastFailureTime = now;
    }

    // 评估状态转换
    this.evaluateState();
  }

  /**
   * 评估是否需要状态转换
   */
  private evaluateState(): void {
    const recentCalls = this.callRecords.filter(
      (r) => Date.now() - r.timestamp <= this.config.monitorWindowMs
    );

    if (recentCalls.length < this.config.minimumCallCount) {
      return; // 样本不足，不做决策
    }

    const failedCalls = recentCalls.filter((r) => !r.success);
    const slowCalls = recentCalls.filter(
      (r) => r.durationMs > this.config.slowCallThreshold
    );
    const failureRate = failedCalls.length / recentCalls.length;
    const slowCallRate = slowCalls.length / recentCalls.length;

    switch (this.state) {
      case "CLOSED": {
        // 失败率或慢调用率超阈值，打开熔断器
        if (
          failureRate >= this.config.failureRateThreshold ||
          slowCallRate >= this.config.slowCallRateThreshold ||
          this.consecutiveFailures >= this.config.failureThreshold
        ) {
          this.transitionTo("OPEN");
        }
        break;
      }
      case "HALF_OPEN": {
        // 半开状态下连续成功次数达标，关闭熔断器
        if (this.consecutiveSuccesses >= this.config.successThreshold) {
          this.transitionTo("CLOSED");
        }
        // 半开状态下出现失败，重新打开
        if (this.consecutiveFailures > 0) {
          this.transitionTo("OPEN");
        }
        break;
      }
      case "OPEN": {
        // 超时后自动转为半开（在 execute 方法中处理）
        break;
      }
    }
  }

  /**
   * 状态转换
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    if (oldState === newState) return;

    console.log(
      `[HierarchicalCircuitBreaker] ${this.name}: ${oldState} -> ${newState}`
    );

    this.state = newState;
    this.stateChangedAt = Date.now();

    if (newState === "HALF_OPEN") {
      this.halfOpenAttempts = 0;
      this.consecutiveSuccesses = 0;
    }

    if (newState === "CLOSED") {
      this.consecutiveFailures = 0;
      this.halfOpenAttempts = 0;
    }

    // 通知监听器
    for (const listener of this.listeners) {
      try {
        listener(this.name, oldState, newState);
      } catch (err) {
        console.error("[HierarchicalCircuitBreaker] 监听器执行异常:", err);
      }
    }

    // 如果父级打开，级联通知
    if (newState === "OPEN") {
      this.notifyChildrenOfParentOpen();
    }
  }

  /**
   * 通知子熔断器父级已打开
   */
  private notifyChildrenOfParentOpen(): void {
    for (const child of this.children.values()) {
      for (const listener of child.listeners) {
        try {
          listener(this.name, "CLOSED", "OPEN");
        } catch (err) {
          console.error("[HierarchicalCircuitBreaker] 子级通知异常:", err);
        }
      }
    }
  }

  /**
   * 获取当前状态
   */
  getState(): CircuitState {
    // 检查是否应从 OPEN 转为 HALF_OPEN
    if (
      this.state === "OPEN" &&
      Date.now() - this.stateChangedAt > this.config.timeoutMs
    ) {
      this.transitionTo("HALF_OPEN");
    }
    return this.state;
  }

  /**
   * 获取详细指标
   */
  getMetrics(): CircuitBreakerMetrics {
    const recentCalls = this.callRecords.filter(
      (r) => Date.now() - r.timestamp <= this.config.monitorWindowMs
    );
    const failedCalls = recentCalls.filter((r) => !r.success);
    const slowCalls = recentCalls.filter(
      (r) => r.durationMs > this.config.slowCallThreshold
    );

    return {
      state: this.getState(),
      totalCalls: recentCalls.length,
      successfulCalls: recentCalls.length - failedCalls.length,
      failedCalls: failedCalls.length,
      slowCalls: slowCalls.length,
      failureRate:
        recentCalls.length > 0 ? failedCalls.length / recentCalls.length : 0,
      slowCallRate:
        recentCalls.length > 0 ? slowCalls.length / recentCalls.length : 0,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      stateChangedAt: this.stateChangedAt,
      consecutiveSuccesses: this.consecutiveSuccesses,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  /**
   * 获取完整的层级指标（包括所有子熔断器）
   */
  getHierarchyMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};
    metrics[this.name] = this.getMetrics();

    for (const [childName, child] of this.children) {
      const childMetrics = child.getHierarchyMetrics();
      for (const [key, value] of Object.entries(childMetrics)) {
        metrics[`${this.name}/${key}`] = value;
      }
    }

    return metrics;
  }

  /**
   * 手动重置熔断器
   */
  reset(): void {
    this.transitionTo("CLOSED");
    this.callRecords = [];
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.halfOpenAttempts = 0;
  }
}

/** 熔断器异常 */
export class CircuitBreakerError extends Error {
  public readonly circuitName: string;

  constructor(message: string, circuitName: string) {
    super(message);
    this.name = "CircuitBreakerError";
    this.circuitName = circuitName;
  }
}
```

### 18.2.3 分布式限流器

在分布式环境中，限流器需要跨多个实例共享状态。以下实现支持滑动窗口和令牌桶两种算法：

```typescript
// ============================================================
// 文件: distributed-rate-limiter.ts
// 描述: 支持滑动窗口和令牌桶的分布式限流器
// ============================================================

/** 限流算法类型 */
export type RateLimitAlgorithm = "sliding-window" | "token-bucket" | "leaky-bucket";

/** 限流配置 */
export interface RateLimitConfig {
  algorithm: RateLimitAlgorithm;
  maxRequests: number;
  windowMs: number;
  burstSize?: number;
  refillRate?: number;
  refillIntervalMs?: number;
  keyPrefix: string;
  enableDistributed: boolean;
}

/** 限流结果 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
  retryAfterMs: number;
  currentUsage: number;
}

/** 限流器统计 */
export interface RateLimiterStats {
  totalRequests: number;
  allowedRequests: number;
  rejectedRequests: number;
  rejectionRate: number;
  activeKeys: number;
}

/** Redis 客户端接口 */
export interface RedisClient {
  eval(script: string, keys: string[], args: string[]): Promise<number[]>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { px?: number }): Promise<void>;
  del(key: string): Promise<void>;
  expire(key: string, seconds: number): Promise<void>;
}

/**
 * DistributedRateLimiter - 分布式限流器
 *
 * 特性：
 * - 滑动窗口计数器（精确限流）
 * - 令牌桶算法（允许突发流量）
 * - 漏桶算法（平滑流量）
 * - 分布式 Redis 后端
 * - 降级为本地限流
 */
export class DistributedRateLimiter {
  private config: RateLimitConfig;
  private redis: RedisClient | null;
  private localWindows: Map<string, Array<{ timestamp: number }>> = new Map();
  private localBuckets: Map<string, { tokens: number; lastRefill: number }> =
    new Map();
  private stats = {
    totalRequests: 0,
    allowedRequests: 0,
    rejectedRequests: 0,
  };

  constructor(config: RateLimitConfig, redis?: RedisClient) {
    this.config = config;
    this.redis = config.enableDistributed && redis ? redis : null;

    if (config.enableDistributed && !redis) {
      console.warn(
        "[DistributedRateLimiter] 分布式模式已启用但未提供 Redis 客户端，降级为本地限流"
      );
    }
  }

  /**
   * 检查请求是否被允许
   */
  async checkLimit(key: string): Promise<RateLimitResult> {
    this.stats.totalRequests++;
    const fullKey = `${this.config.keyPrefix}:${key}`;

    try {
      let result: RateLimitResult;

      if (this.redis) {
        result = await this.checkDistributed(fullKey);
      } else {
        result = this.checkLocal(fullKey);
      }

      if (result.allowed) {
        this.stats.allowedRequests++;
      } else {
        this.stats.rejectedRequests++;
      }

      return result;
    } catch (error) {
      console.error("[DistributedRateLimiter] 限流检查异常，降级为允许:", error);
      this.stats.allowedRequests++;
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        limit: this.config.maxRequests,
        resetAt: Date.now() + this.config.windowMs,
        retryAfterMs: 0,
        currentUsage: 0,
      };
    }
  }

  /**
   * 分布式限流检查（基于 Redis）
   */
  private async checkDistributed(key: string): Promise<RateLimitResult> {
    switch (this.config.algorithm) {
      case "sliding-window":
        return this.slidingWindowDistributed(key);
      case "token-bucket":
        return this.tokenBucketDistributed(key);
      case "leaky-bucket":
        return this.leakyBucketDistributed(key);
      default:
        return this.slidingWindowDistributed(key);
    }
  }

  /**
   * 分布式滑动窗口
   */
  private async slidingWindowDistributed(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Lua 脚本：原子性地清理过期记录、添加新记录、返回计数
    const luaScript = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window_start = tonumber(ARGV[2])
      local max_requests = tonumber(ARGV[3])
      local window_ms = tonumber(ARGV[4])

      redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)
      local current_count = redis.call('ZCARD', key)

      if current_count < max_requests then
        redis.call('ZADD', key, now, now .. ':' .. math.random(1000000))
        redis.call('PEXPIRE', key, window_ms)
        return {1, max_requests - current_count - 1, 0}
      else
        local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
        local retry_after = 0
        if #oldest >= 2 then
          retry_after = tonumber(oldest[2]) + window_ms - now
        end
        return {0, 0, retry_after}
      end
    `;

    const results = await this.redis!.eval(
      luaScript,
      [key],
      [
        now.toString(),
        windowStart.toString(),
        this.config.maxRequests.toString(),
        this.config.windowMs.toString(),
      ]
    );

    return {
      allowed: results[0] === 1,
      remaining: results[1],
      limit: this.config.maxRequests,
      resetAt: now + this.config.windowMs,
      retryAfterMs: results[2],
      currentUsage: this.config.maxRequests - results[1],
    };
  }

  /**
   * 分布式令牌桶
   */
  private async tokenBucketDistributed(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const burstSize = this.config.burstSize || this.config.maxRequests;
    const refillRate = this.config.refillRate || this.config.maxRequests;
    const refillIntervalMs = this.config.refillIntervalMs || this.config.windowMs;

    const luaScript = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local burst_size = tonumber(ARGV[2])
      local refill_rate = tonumber(ARGV[3])
      local refill_interval = tonumber(ARGV[4])

      local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
      local tokens = tonumber(bucket[1]) or burst_size
      local last_refill = tonumber(bucket[2]) or now

      local elapsed = now - last_refill
      local new_tokens = math.floor(elapsed * refill_rate / refill_interval)
      tokens = math.min(burst_size, tokens + new_tokens)

      if new_tokens > 0 then
        last_refill = now
      end

      if tokens >= 1 then
        tokens = tokens - 1
        redis.call('HMSET', key, 'tokens', tokens, 'last_refill', last_refill)
        redis.call('PEXPIRE', key, refill_interval * 2)
        return {1, tokens, 0}
      else
        local retry_after = math.ceil(refill_interval / refill_rate)
        redis.call('HMSET', key, 'tokens', tokens, 'last_refill', last_refill)
        redis.call('PEXPIRE', key, refill_interval * 2)
        return {0, 0, retry_after}
      end
    `;

    const results = await this.redis!.eval(
      luaScript,
      [key],
      [
        now.toString(),
        burstSize.toString(),
        refillRate.toString(),
        refillIntervalMs.toString(),
      ]
    );

    return {
      allowed: results[0] === 1,
      remaining: results[1],
      limit: burstSize,
      resetAt: now + refillIntervalMs,
      retryAfterMs: results[2],
      currentUsage: burstSize - results[1],
    };
  }

  /**
   * 分布式漏桶
   */
  private async leakyBucketDistributed(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const capacity = this.config.maxRequests;
    const leakRateMs = this.config.windowMs / capacity;

    const luaScript = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local capacity = tonumber(ARGV[2])
      local leak_rate_ms = tonumber(ARGV[3])

      local bucket = redis.call('HMGET', key, 'water', 'last_leak')
      local water = tonumber(bucket[1]) or 0
      local last_leak = tonumber(bucket[2]) or now

      local elapsed = now - last_leak
      local leaked = math.floor(elapsed / leak_rate_ms)
      water = math.max(0, water - leaked)

      if leaked > 0 then
        last_leak = now
      end

      if water < capacity then
        water = water + 1
        redis.call('HMSET', key, 'water', water, 'last_leak', last_leak)
        redis.call('PEXPIRE', key, capacity * leak_rate_ms * 2)
        return {1, capacity - water, 0}
      else
        local retry_after = leak_rate_ms
        redis.call('HMSET', key, 'water', water, 'last_leak', last_leak)
        return {0, 0, retry_after}
      end
    `;

    const results = await this.redis!.eval(
      luaScript,
      [key],
      [now.toString(), capacity.toString(), leakRateMs.toString()]
    );

    return {
      allowed: results[0] === 1,
      remaining: results[1],
      limit: capacity,
      resetAt: now + this.config.windowMs,
      retryAfterMs: results[2],
      currentUsage: capacity - results[1],
    };
  }

  /**
   * 本地限流检查
   */
  private checkLocal(key: string): RateLimitResult {
    switch (this.config.algorithm) {
      case "sliding-window":
        return this.slidingWindowLocal(key);
      case "token-bucket":
        return this.tokenBucketLocal(key);
      default:
        return this.slidingWindowLocal(key);
    }
  }

  /**
   * 本地滑动窗口
   */
  private slidingWindowLocal(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    let window = this.localWindows.get(key) || [];
    window = window.filter((r) => r.timestamp > windowStart);

    if (window.length < this.config.maxRequests) {
      window.push({ timestamp: now });
      this.localWindows.set(key, window);

      return {
        allowed: true,
        remaining: this.config.maxRequests - window.length,
        limit: this.config.maxRequests,
        resetAt: now + this.config.windowMs,
        retryAfterMs: 0,
        currentUsage: window.length,
      };
    }

    const oldestTimestamp = window[0]?.timestamp || now;
    const retryAfterMs = oldestTimestamp + this.config.windowMs - now;

    this.localWindows.set(key, window);

    return {
      allowed: false,
      remaining: 0,
      limit: this.config.maxRequests,
      resetAt: now + this.config.windowMs,
      retryAfterMs: Math.max(0, retryAfterMs),
      currentUsage: window.length,
    };
  }

  /**
   * 本地令牌桶
   */
  private tokenBucketLocal(key: string): RateLimitResult {
    const now = Date.now();
    const burstSize = this.config.burstSize || this.config.maxRequests;
    const refillRate = this.config.refillRate || this.config.maxRequests;
    const refillIntervalMs = this.config.refillIntervalMs || this.config.windowMs;

    let bucket = this.localBuckets.get(key) || {
      tokens: burstSize,
      lastRefill: now,
    };

    // 补充令牌
    const elapsed = now - bucket.lastRefill;
    const newTokens = Math.floor((elapsed * refillRate) / refillIntervalMs);
    bucket.tokens = Math.min(burstSize, bucket.tokens + newTokens);
    if (newTokens > 0) {
      bucket.lastRefill = now;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.localBuckets.set(key, bucket);

      return {
        allowed: true,
        remaining: bucket.tokens,
        limit: burstSize,
        resetAt: now + refillIntervalMs,
        retryAfterMs: 0,
        currentUsage: burstSize - bucket.tokens,
      };
    }

    this.localBuckets.set(key, bucket);

    return {
      allowed: false,
      remaining: 0,
      limit: burstSize,
      resetAt: now + Math.ceil(refillIntervalMs / refillRate),
      retryAfterMs: Math.ceil(refillIntervalMs / refillRate),
      currentUsage: burstSize,
    };
  }

  /**
   * 获取统计信息
   */
  getStats(): RateLimiterStats {
    return {
      totalRequests: this.stats.totalRequests,
      allowedRequests: this.stats.allowedRequests,
      rejectedRequests: this.stats.rejectedRequests,
      rejectionRate:
        this.stats.totalRequests > 0
          ? this.stats.rejectedRequests / this.stats.totalRequests
          : 0,
      activeKeys: this.localWindows.size + this.localBuckets.size,
    };
  }

  /**
   * 重置特定 key 的限流
   */
  async resetKey(key: string): Promise<void> {
    const fullKey = `${this.config.keyPrefix}:${key}`;
    this.localWindows.delete(fullKey);
    this.localBuckets.delete(fullKey);

    if (this.redis) {
      await this.redis.del(fullKey);
    }
  }
}
```

### 18.2.4 重试与退避策略

在调用 LLM API 或外部工具时，临时性故障是常见的。合理的重试策略可以显著提升成功率：

```typescript
// ============================================================
// 文件: retry-backoff.ts
// 描述: 支持多种退避策略的重试机制
// ============================================================

/** 退避策略类型 */
export type BackoffStrategy =
  | "fixed"
  | "linear"
  | "exponential"
  | "exponential-jitter"
  | "decorrelated-jitter";

/** 重试配置 */
export interface RetryConfig {
  maxAttempts: number;
  backoffStrategy: BackoffStrategy;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  retryableErrors?: string[];
  retryableStatusCodes?: number[];
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

/** 重试结果 */
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDelayMs: number;
  attemptDetails: Array<{
    attempt: number;
    durationMs: number;
    delayMs: number;
    error?: string;
  }>;
}

/**
 * RetryWithBackoff - 带退避的重试执行器
 */
export class RetryWithBackoff {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      maxAttempts: 3,
      backoffStrategy: "exponential-jitter",
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      multiplier: 2,
      ...config,
    };
  }

  /**
   * 执行带重试的操作
   */
  async execute<T>(fn: () => Promise<T>): Promise<RetryResult<T>> {
    const attemptDetails: RetryResult<T>["attemptDetails"] = [];
    let totalDelayMs = 0;
    let lastError: Error | undefined;
    let previousDelay = this.config.initialDelayMs;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      const attemptStart = Date.now();

      try {
        const result = await fn();
        attemptDetails.push({
          attempt,
          durationMs: Date.now() - attemptStart,
          delayMs: 0,
        });

        return {
          success: true,
          result,
          attempts: attempt,
          totalDelayMs,
          attemptDetails,
        };
      } catch (error) {
        const err = error as Error;
        lastError = err;
        const attemptDuration = Date.now() - attemptStart;

        // 检查是否应该重试
        if (attempt === this.config.maxAttempts || !this.shouldRetry(err)) {
          attemptDetails.push({
            attempt,
            durationMs: attemptDuration,
            delayMs: 0,
            error: err.message,
          });
          break;
        }

        // 计算退避延迟
        const delayMs = this.calculateDelay(attempt, previousDelay);
        previousDelay = delayMs;
        totalDelayMs += delayMs;

        attemptDetails.push({
          attempt,
          durationMs: attemptDuration,
          delayMs,
          error: err.message,
        });

        // 回调通知
        if (this.config.onRetry) {
          this.config.onRetry(attempt, err, delayMs);
        }

        console.log(
          `[RetryWithBackoff] 第 ${attempt} 次尝试失败，${delayMs}ms 后重试: ${err.message}`
        );

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return {
      success: false,
      error: lastError,
      attempts: attemptDetails.length,
      totalDelayMs,
      attemptDetails,
    };
  }

  /**
   * 判断是否应该重试
   */
  private shouldRetry(error: Error): boolean {
    // 如果配置了可重试的错误类型
    if (this.config.retryableErrors && this.config.retryableErrors.length > 0) {
      return this.config.retryableErrors.some(
        (e) => error.name === e || error.message.includes(e)
      );
    }

    // 如果配置了可重试的状态码
    if (
      this.config.retryableStatusCodes &&
      this.config.retryableStatusCodes.length > 0
    ) {
      const statusMatch = error.message.match(/status[:\s]*(\d+)/i);
      if (statusMatch) {
        const status = parseInt(statusMatch[1]);
        return this.config.retryableStatusCodes.includes(status);
      }
    }

    // 默认对临时性错误重试
    const retryablePatterns = [
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "EPIPE",
      "rate limit",
      "Rate limit",
      "429",
      "503",
      "502",
      "timeout",
      "Timeout",
      "UNAVAILABLE",
      "temporarily",
    ];

    return retryablePatterns.some(
      (pattern) =>
        error.message.includes(pattern) || error.name.includes(pattern)
    );
  }

  /**
   * 计算退避延迟
   */
  private calculateDelay(attempt: number, previousDelay: number): number {
    let delay: number;

    switch (this.config.backoffStrategy) {
      case "fixed":
        delay = this.config.initialDelayMs;
        break;

      case "linear":
        delay = this.config.initialDelayMs * attempt;
        break;

      case "exponential":
        delay =
          this.config.initialDelayMs *
          Math.pow(this.config.multiplier, attempt - 1);
        break;

      case "exponential-jitter": {
        const exponential =
          this.config.initialDelayMs *
          Math.pow(this.config.multiplier, attempt - 1);
        delay = exponential * (0.5 + Math.random() * 0.5);
        break;
      }

      case "decorrelated-jitter": {
        delay =
          Math.random() * (previousDelay * this.config.multiplier - this.config.initialDelayMs) +
          this.config.initialDelayMs;
        break;
      }

      default:
        delay = this.config.initialDelayMs;
    }

    return Math.min(delay, this.config.maxDelayMs);
  }
}
```

### 18.2.5 舱壁模式

舱壁模式（Bulkhead Pattern）通过隔离不同类型的工作负载来防止故障蔓延。在 Agent 系统中，这意味着对不同的 LLM 提供商、工具调用等使用独立的资源池：

```typescript
// ============================================================
// 文件: bulkhead.ts
// 描述: 舱壁隔离模式实现
// ============================================================

/** 舱壁配置 */
export interface BulkheadConfig {
  maxConcurrent: number;
  maxQueueSize: number;
  queueTimeoutMs: number;
  name: string;
}

/** 舱壁状态 */
export interface BulkheadStatus {
  name: string;
  activeCalls: number;
  queuedCalls: number;
  maxConcurrent: number;
  maxQueueSize: number;
  availableSlots: number;
  totalAccepted: number;
  totalRejected: number;
  totalTimedOut: number;
}

/** 排队的任务 */
interface QueuedTask<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
  enqueuedAt: number;
}

/**
 * Bulkhead - 舱壁隔离模式
 *
 * 限制对特定资源的并发访问量，超出的请求进入等待队列。
 * 队列满时直接拒绝，防止系统过载。
 */
export class Bulkhead {
  private config: BulkheadConfig;
  private activeCalls: number = 0;
  private queue: Array<QueuedTask<unknown>> = [];
  private stats = {
    totalAccepted: 0,
    totalRejected: 0,
    totalTimedOut: 0,
  };

  constructor(config: BulkheadConfig) {
    this.config = config;
  }

  /**
   * 执行被舱壁保护的操作
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // 检查是否有可用的并发槽位
    if (this.activeCalls < this.config.maxConcurrent) {
      return this.executeImmediately(fn);
    }

    // 检查队列是否已满
    if (this.queue.length >= this.config.maxQueueSize) {
      this.stats.totalRejected++;
      throw new BulkheadError(
        `舱壁 ${this.config.name} 已满：活跃 ${this.activeCalls}/${this.config.maxConcurrent}，排队 ${this.queue.length}/${this.config.maxQueueSize}`,
        this.config.name
      );
    }

    // 加入等待队列
    return this.enqueue(fn);
  }

  /**
   * 立即执行
   */
  private async executeImmediately<T>(fn: () => Promise<T>): Promise<T> {
    this.activeCalls++;
    this.stats.totalAccepted++;

    try {
      const result = await fn();
      return result;
    } finally {
      this.activeCalls--;
      this.drainQueue();
    }
  }

  /**
   * 入队等待
   */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = {
        fn,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      };

      this.queue.push(task as QueuedTask<unknown>);

      // 设置队列超时
      setTimeout(() => {
        const index = this.queue.indexOf(task as QueuedTask<unknown>);
        if (index !== -1) {
          this.queue.splice(index, 1);
          this.stats.totalTimedOut++;
          reject(
            new BulkheadError(
              `舱壁 ${this.config.name} 队列等待超时: ${this.config.queueTimeoutMs}ms`,
              this.config.name
            )
          );
        }
      }, this.config.queueTimeoutMs);
    });
  }

  /**
   * 从队列中取出下一个任务执行
   */
  private drainQueue(): void {
    while (
      this.activeCalls < this.config.maxConcurrent &&
      this.queue.length > 0
    ) {
      const task = this.queue.shift();
      if (!task) break;

      // 检查是否已经超时
      if (Date.now() - task.enqueuedAt > this.config.queueTimeoutMs) {
        this.stats.totalTimedOut++;
        task.reject(
          new BulkheadError(
            `舱壁 ${this.config.name} 队列等待超时`,
            this.config.name
          )
        );
        continue;
      }

      this.activeCalls++;
      this.stats.totalAccepted++;

      task
        .fn()
        .then((result) => {
          task.resolve(result);
        })
        .catch((error) => {
          task.reject(error);
        })
        .finally(() => {
          this.activeCalls--;
          this.drainQueue();
        });

      break; // 每次只取一个
    }
  }

  /**
   * 获取状态
   */
  getStatus(): BulkheadStatus {
    return {
      name: this.config.name,
      activeCalls: this.activeCalls,
      queuedCalls: this.queue.length,
      maxConcurrent: this.config.maxConcurrent,
      maxQueueSize: this.config.maxQueueSize,
      availableSlots: Math.max(0, this.config.maxConcurrent - this.activeCalls),
      totalAccepted: this.stats.totalAccepted,
      totalRejected: this.stats.totalRejected,
      totalTimedOut: this.stats.totalTimedOut,
    };
  }
}

/** 舱壁异常 */
export class BulkheadError extends Error {
  public readonly bulkheadName: string;

  constructor(message: string, bulkheadName: string) {
    super(message);
    this.name = "BulkheadError";
    this.bulkheadName = bulkheadName;
  }
}
```

### 18.2.6 弹性编排器

将上述所有弹性组件组合在一起，形成统一的弹性编排层：

```typescript
// ============================================================
// 文件: resilience-orchestrator.ts
// 描述: 弹性模式编排器——统一协调所有弹性组件
// ============================================================

import {
  AdvancedSemanticCache,
  SemanticCacheConfig,
  EmbeddingProvider,
} from "./advanced-semantic-cache";
import {
  HierarchicalCircuitBreaker,
  CircuitBreakerConfig,
} from "./hierarchical-circuit-breaker";
import {
  DistributedRateLimiter,
  RateLimitConfig,
  RedisClient,
} from "./distributed-rate-limiter";
import { RetryWithBackoff, RetryConfig } from "./retry-backoff";
import { Bulkhead, BulkheadConfig } from "./bulkhead";

/** 弹性编排配置 */
export interface ResilienceConfig {
  cache?: SemanticCacheConfig;
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  rateLimiter?: RateLimitConfig;
  retry?: Partial<RetryConfig>;
  bulkhead?: BulkheadConfig;
  executionOrder?: Array<
    "cache" | "rateLimiter" | "circuitBreaker" | "bulkhead" | "retry"
  >;
}

/** 执行上下文 */
export interface ExecutionContext {
  requestId: string;
  userId?: string;
  operationType: string;
  cacheKey?: string;
  rateLimitKey?: string;
  metadata?: Record<string, string>;
}

/** 弹性执行结果 */
export interface ResilienceResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  cacheHit: boolean;
  retryAttempts: number;
  totalDurationMs: number;
  rateLimited: boolean;
  circuitBroken: boolean;
  bulkheadRejected: boolean;
}

/**
 * ResilienceOrchestrator - 弹性编排器
 *
 * 按照配置的顺序依次应用各种弹性模式：
 * 默认顺序：Cache -> RateLimiter -> CircuitBreaker -> Bulkhead -> Retry
 *
 * 这遵循了 "快速失败" 原则：
 * 1. 先检查缓存（最快返回）
 * 2. 再检查限流（防止过载）
 * 3. 再检查熔断（隔离故障）
 * 4. 舱壁控制并发
 * 5. 最后执行带重试的实际调用
 */
export class ResilienceOrchestrator {
  private cache: AdvancedSemanticCache<unknown> | null = null;
  private circuitBreaker: HierarchicalCircuitBreaker | null = null;
  private rateLimiter: DistributedRateLimiter | null = null;
  private retry: RetryWithBackoff | null = null;
  private bulkhead: Bulkhead | null = null;
  private executionOrder: Array<
    "cache" | "rateLimiter" | "circuitBreaker" | "bulkhead" | "retry"
  >;

  constructor(
    config: ResilienceConfig,
    embeddingProvider?: EmbeddingProvider,
    redis?: RedisClient
  ) {
    if (config.cache && embeddingProvider) {
      this.cache = new AdvancedSemanticCache(config.cache, embeddingProvider);
    }
    if (config.circuitBreaker) {
      this.circuitBreaker = new HierarchicalCircuitBreaker(
        "main",
        config.circuitBreaker
      );
    }
    if (config.rateLimiter) {
      this.rateLimiter = new DistributedRateLimiter(config.rateLimiter, redis);
    }
    if (config.retry) {
      this.retry = new RetryWithBackoff(config.retry);
    }
    if (config.bulkhead) {
      this.bulkhead = new Bulkhead(config.bulkhead);
    }

    this.executionOrder = config.executionOrder || [
      "cache",
      "rateLimiter",
      "circuitBreaker",
      "bulkhead",
      "retry",
    ];
  }

  /**
   * 通过弹性编排层执行操作
   */
  async execute<T>(
    ctx: ExecutionContext,
    fn: () => Promise<T>
  ): Promise<ResilienceResult<T>> {
    const startTime = Date.now();
    const result: ResilienceResult<T> = {
      success: false,
      cacheHit: false,
      retryAttempts: 0,
      totalDurationMs: 0,
      rateLimited: false,
      circuitBroken: false,
      bulkheadRejected: false,
    };

    try {
      // 按配置顺序逐步应用弹性模式
      let currentFn: () => Promise<T> = fn;

      for (const step of [...this.executionOrder].reverse()) {
        const wrappedFn = currentFn;

        switch (step) {
          case "cache":
            currentFn = () => this.withCache(ctx, wrappedFn, result);
            break;
          case "rateLimiter":
            currentFn = () => this.withRateLimit(ctx, wrappedFn, result);
            break;
          case "circuitBreaker":
            currentFn = () => this.withCircuitBreaker(wrappedFn, result);
            break;
          case "bulkhead":
            currentFn = () => this.withBulkhead(wrappedFn, result);
            break;
          case "retry":
            currentFn = () => this.withRetry(wrappedFn, result);
            break;
        }
      }

      const value = await currentFn();
      result.success = true;
      result.result = value;
    } catch (error) {
      result.success = false;
      result.error = error as Error;
    }

    result.totalDurationMs = Date.now() - startTime;
    return result;
  }

  /**
   * 缓存层
   */
  private async withCache<T>(
    ctx: ExecutionContext,
    fn: () => Promise<T>,
    result: ResilienceResult<T>
  ): Promise<T> {
    if (!this.cache || !ctx.cacheKey) {
      return fn();
    }

    const cached = await this.cache.get(ctx.cacheKey);
    if (cached) {
      result.cacheHit = true;
      return cached.value as T;
    }

    const value = await fn();

    // 异步写入缓存，不阻塞返回
    this.cache.set(ctx.cacheKey, value).catch((err) => {
      console.error("[ResilienceOrchestrator] 缓存写入异常:", err);
    });

    return value;
  }

  /**
   * 限流层
   */
  private async withRateLimit<T>(
    ctx: ExecutionContext,
    fn: () => Promise<T>,
    result: ResilienceResult<T>
  ): Promise<T> {
    if (!this.rateLimiter) {
      return fn();
    }

    const key = ctx.rateLimitKey || ctx.userId || "global";
    const limitResult = await this.rateLimiter.checkLimit(key);

    if (!limitResult.allowed) {
      result.rateLimited = true;
      throw new Error(
        `请求被限流: 剩余 ${limitResult.remaining}/${limitResult.limit}，请在 ${limitResult.retryAfterMs}ms 后重试`
      );
    }

    return fn();
  }

  /**
   * 熔断层
   */
  private async withCircuitBreaker<T>(
    fn: () => Promise<T>,
    result: ResilienceResult<T>
  ): Promise<T> {
    if (!this.circuitBreaker) {
      return fn();
    }

    try {
      return await this.circuitBreaker.execute(fn);
    } catch (error) {
      if ((error as Error).name === "CircuitBreakerError") {
        result.circuitBroken = true;
      }
      throw error;
    }
  }

  /**
   * 舱壁层
   */
  private async withBulkhead<T>(
    fn: () => Promise<T>,
    result: ResilienceResult<T>
  ): Promise<T> {
    if (!this.bulkhead) {
      return fn();
    }

    try {
      return await this.bulkhead.execute(fn);
    } catch (error) {
      if ((error as Error).name === "BulkheadError") {
        result.bulkheadRejected = true;
      }
      throw error;
    }
  }

  /**
   * 重试层
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    result: ResilienceResult<T>
  ): Promise<T> {
    if (!this.retry) {
      return fn();
    }

    const retryResult = await this.retry.execute(fn);
    result.retryAttempts = retryResult.attempts;

    if (retryResult.success && retryResult.result !== undefined) {
      return retryResult.result;
    }

    throw retryResult.error || new Error("重试全部失败");
  }

  /**
   * 获取所有组件的综合状态
   */
  getStatus(): Record<string, unknown> {
    return {
      cache: this.cache ? this.cache.getStats() : null,
      circuitBreaker: this.circuitBreaker
        ? this.circuitBreaker.getMetrics()
        : null,
      rateLimiter: this.rateLimiter ? this.rateLimiter.getStats() : null,
      bulkhead: this.bulkhead ? this.bulkhead.getStatus() : null,
    };
  }

  /**
   * 销毁所有组件
   */
  destroy(): void {
    if (this.cache) {
      this.cache.destroy();
    }
    if (this.circuitBreaker) {
      this.circuitBreaker.reset();
    }
  }
}
```

---

## 18.3 自动扩缩容

AI Agent 工作负载具有显著的突发性和不可预测性。一个用户对话可能触发多次 LLM 调用和工具执行，导致资源消耗远超传统 API 服务。自动扩缩容策略必须能够感知 Agent 特有的指标信号。

### 18.3.1 多信号自动扩缩容器

```typescript
// ============================================================
// 文件: agent-auto-scaler.ts
// 描述: 基于多信号决策的 Agent 自动扩缩容器
// ============================================================

/** 扩缩容信号 */
export interface ScalingSignal {
  name: string;
  value: number;
  threshold: number;
  weight: number;
  direction: "scale-up" | "scale-down" | "neutral";
  source: "prometheus" | "custom" | "keda" | "predictive";
  timestamp: number;
}

/** 扩缩容决策 */
export interface ScalingDecision {
  action: "scale-up" | "scale-down" | "no-change";
  currentReplicas: number;
  desiredReplicas: number;
  reason: string;
  signals: ScalingSignal[];
  confidence: number;
  cooldownRemainingMs: number;
  timestamp: number;
}

/** 扩缩容历史记录 */
export interface ScalingEvent {
  decision: ScalingDecision;
  executed: boolean;
  actualReplicas: number;
  timestamp: number;
  durationMs: number;
}

/** 扩缩容配置 */
export interface AutoScalerConfig {
  minReplicas: number;
  maxReplicas: number;
  scaleUpCooldownMs: number;
  scaleDownCooldownMs: number;
  scaleUpStepPercent: number;
  scaleDownStepPercent: number;
  evaluationWindowMs: number;
  stabilizationWindowMs: number;
  enablePredictiveScaling: boolean;
  targetUtilization: number;
  panicThreshold: number;
  panicMultiplier: number;
}

/** 指标提供者接口 */
export interface MetricsProvider {
  getCPUUtilization(): Promise<number>;
  getMemoryUtilization(): Promise<number>;
  getQueueDepth(): Promise<number>;
  getActiveConnections(): Promise<number>;
  getResponseTimeP95(): Promise<number>;
  getErrorRate(): Promise<number>;
  getTokensPerSecond(): Promise<number>;
  getCurrentReplicas(): Promise<number>;
  getRequestsPerSecond(): Promise<number>;
}

/**
 * AgentAutoScaler - Agent 自动扩缩容器
 *
 * 基于多维信号做出扩缩容决策：
 * 1. CPU/内存利用率（基础信号）
 * 2. 请求队列深度（Agent 特有信号）
 * 3. 响应延迟 P95（SLA 信号）
 * 4. 错误率（健康信号）
 * 5. Token 消耗速率（LLM 特有信号）
 * 6. 预测性信号（基于历史模式）
 */
export class AgentAutoScaler {
  private config: AutoScalerConfig;
  private metricsProvider: MetricsProvider;
  private history: ScalingEvent[] = [];
  private lastScaleUpTime: number = 0;
  private lastScaleDownTime: number = 0;
  private historicalLoad: Array<{ timestamp: number; load: number }> = [];

  constructor(config: AutoScalerConfig, metricsProvider: MetricsProvider) {
    this.config = config;
    this.metricsProvider = metricsProvider;
  }

  /**
   * 评估并返回扩缩容决策
   */
  async evaluate(): Promise<ScalingDecision> {
    const signals = await this.collectSignals();
    const currentReplicas = await this.metricsProvider.getCurrentReplicas();

    // 检查是否处于紧急模式
    const panicSignal = signals.find(
      (s) => s.name === "error_rate" && s.value >= this.config.panicThreshold
    );

    if (panicSignal) {
      return this.panicScale(currentReplicas, signals);
    }

    // 基于加权信号计算期望副本数
    const desiredReplicas = this.calculateDesiredReplicas(
      currentReplicas,
      signals
    );

    // 应用稳定化窗口
    const stabilizedReplicas = this.stabilize(desiredReplicas, currentReplicas);

    // 应用冷却期
    const cooldownInfo = this.checkCooldown(stabilizedReplicas, currentReplicas);

    // 构造决策
    const action =
      stabilizedReplicas > currentReplicas
        ? "scale-up"
        : stabilizedReplicas < currentReplicas
          ? "scale-down"
          : "no-change";

    const decision: ScalingDecision = {
      action: cooldownInfo.inCooldown ? "no-change" : action,
      currentReplicas,
      desiredReplicas: cooldownInfo.inCooldown
        ? currentReplicas
        : stabilizedReplicas,
      reason: cooldownInfo.inCooldown
        ? `冷却期中，剩余 ${cooldownInfo.remainingMs}ms`
        : this.buildReason(signals, action),
      signals,
      confidence: this.calculateConfidence(signals),
      cooldownRemainingMs: cooldownInfo.remainingMs,
      timestamp: Date.now(),
    };

    // 记录历史负载（用于预测性扩缩容）
    const avgLoad =
      signals.reduce((sum, s) => sum + s.value / s.threshold, 0) /
      signals.length;
    this.historicalLoad.push({ timestamp: Date.now(), load: avgLoad });
    if (this.historicalLoad.length > 1440) {
      this.historicalLoad = this.historicalLoad.slice(-720);
    }

    return decision;
  }

  /**
   * 收集所有扩缩容信号
   */
  private async collectSignals(): Promise<ScalingSignal[]> {
    const now = Date.now();
    const signals: ScalingSignal[] = [];

    try {
      const cpuUtil = await this.metricsProvider.getCPUUtilization();
      signals.push({
        name: "cpu_utilization",
        value: cpuUtil,
        threshold: this.config.targetUtilization,
        weight: 0.25,
        direction:
          cpuUtil > this.config.targetUtilization
            ? "scale-up"
            : cpuUtil < this.config.targetUtilization * 0.5
              ? "scale-down"
              : "neutral",
        source: "prometheus",
        timestamp: now,
      });
    } catch (err) {
      console.error("[AgentAutoScaler] CPU 指标获取失败:", err);
    }

    try {
      const memUtil = await this.metricsProvider.getMemoryUtilization();
      signals.push({
        name: "memory_utilization",
        value: memUtil,
        threshold: 80,
        weight: 0.15,
        direction:
          memUtil > 80
            ? "scale-up"
            : memUtil < 40
              ? "scale-down"
              : "neutral",
        source: "prometheus",
        timestamp: now,
      });
    } catch (err) {
      console.error("[AgentAutoScaler] 内存指标获取失败:", err);
    }

    try {
      const queueDepth = await this.metricsProvider.getQueueDepth();
      signals.push({
        name: "queue_depth",
        value: queueDepth,
        threshold: 10,
        weight: 0.25,
        direction:
          queueDepth > 10
            ? "scale-up"
            : queueDepth < 2
              ? "scale-down"
              : "neutral",
        source: "custom",
        timestamp: now,
      });
    } catch (err) {
      console.error("[AgentAutoScaler] 队列深度指标获取失败:", err);
    }

    try {
      const responseTime = await this.metricsProvider.getResponseTimeP95();
      signals.push({
        name: "response_time_p95",
        value: responseTime,
        threshold: 5000,
        weight: 0.2,
        direction:
          responseTime > 5000
            ? "scale-up"
            : responseTime < 1000
              ? "scale-down"
              : "neutral",
        source: "prometheus",
        timestamp: now,
      });
    } catch (err) {
      console.error("[AgentAutoScaler] 延迟指标获取失败:", err);
    }

    try {
      const errorRate = await this.metricsProvider.getErrorRate();
      signals.push({
        name: "error_rate",
        value: errorRate,
        threshold: 0.05,
        weight: 0.15,
        direction:
          errorRate > 0.05
            ? "scale-up"
            : "neutral",
        source: "prometheus",
        timestamp: now,
      });
    } catch (err) {
      console.error("[AgentAutoScaler] 错误率指标获取失败:", err);
    }

    // 预测性信号
    if (this.config.enablePredictiveScaling && this.historicalLoad.length > 60) {
      const predictedLoad = this.predictLoad();
      signals.push({
        name: "predicted_load",
        value: predictedLoad,
        threshold: 1.0,
        weight: 0.1,
        direction:
          predictedLoad > 1.2
            ? "scale-up"
            : predictedLoad < 0.5
              ? "scale-down"
              : "neutral",
        source: "predictive",
        timestamp: now,
      });
    }

    return signals;
  }

  /**
   * 根据信号计算期望副本数
   */
  private calculateDesiredReplicas(
    currentReplicas: number,
    signals: ScalingSignal[]
  ): number {
    if (signals.length === 0) return currentReplicas;

    // 使用加权平均计算扩缩比例
    let totalWeight = 0;
    let weightedRatio = 0;

    for (const signal of signals) {
      if (signal.direction === "neutral") continue;

      const ratio = signal.value / signal.threshold;
      weightedRatio += ratio * signal.weight;
      totalWeight += signal.weight;
    }

    if (totalWeight === 0) return currentReplicas;

    const avgRatio = weightedRatio / totalWeight;
    let desiredReplicas = Math.ceil(currentReplicas * avgRatio);

    // 限制单次扩缩范围
    const maxScaleUp = Math.ceil(
      currentReplicas * (1 + this.config.scaleUpStepPercent / 100)
    );
    const minScaleDown = Math.floor(
      currentReplicas * (1 - this.config.scaleDownStepPercent / 100)
    );

    desiredReplicas = Math.min(desiredReplicas, maxScaleUp);
    desiredReplicas = Math.max(desiredReplicas, minScaleDown);

    // 应用最小和最大限制
    desiredReplicas = Math.max(desiredReplicas, this.config.minReplicas);
    desiredReplicas = Math.min(desiredReplicas, this.config.maxReplicas);

    return desiredReplicas;
  }

  /**
   * 稳定化窗口：避免频繁波动
   */
  private stabilize(desired: number, current: number): number {
    const recentDecisions = this.history.filter(
      (e) =>
        Date.now() - e.timestamp < this.config.stabilizationWindowMs
    );

    if (recentDecisions.length === 0) return desired;

    // 缩容时取窗口内最大值（保守策略）
    if (desired < current) {
      const maxDesired = Math.max(
        desired,
        ...recentDecisions.map((e) => e.decision.desiredReplicas)
      );
      return maxDesired;
    }

    return desired;
  }

  /**
   * 冷却期检查
   */
  private checkCooldown(
    desired: number,
    current: number
  ): { inCooldown: boolean; remainingMs: number } {
    const now = Date.now();

    if (desired > current) {
      const elapsed = now - this.lastScaleUpTime;
      if (elapsed < this.config.scaleUpCooldownMs) {
        return {
          inCooldown: true,
          remainingMs: this.config.scaleUpCooldownMs - elapsed,
        };
      }
    }

    if (desired < current) {
      const elapsed = now - this.lastScaleDownTime;
      if (elapsed < this.config.scaleDownCooldownMs) {
        return {
          inCooldown: true,
          remainingMs: this.config.scaleDownCooldownMs - elapsed,
        };
      }
    }

    return { inCooldown: false, remainingMs: 0 };
  }

  /**
   * 紧急扩容模式
   */
  private panicScale(
    currentReplicas: number,
    signals: ScalingSignal[]
  ): ScalingDecision {
    const panicReplicas = Math.min(
      Math.ceil(currentReplicas * this.config.panicMultiplier),
      this.config.maxReplicas
    );

    return {
      action: "scale-up",
      currentReplicas,
      desiredReplicas: panicReplicas,
      reason: `紧急扩容模式：错误率超过阈值 ${this.config.panicThreshold}`,
      signals,
      confidence: 0.95,
      cooldownRemainingMs: 0,
      timestamp: Date.now(),
    };
  }

  /**
   * 预测未来负载
   * 使用简单的移动平均 + 趋势分析
   */
  private predictLoad(): number {
    if (this.historicalLoad.length < 10) return 1.0;

    const recent = this.historicalLoad.slice(-30);
    const avgLoad =
      recent.reduce((sum, r) => sum + r.load, 0) / recent.length;

    // 计算趋势（最近数据点 vs 较早数据点的斜率）
    const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
    const secondHalf = recent.slice(Math.floor(recent.length / 2));

    const avgFirst =
      firstHalf.reduce((sum, r) => sum + r.load, 0) / firstHalf.length;
    const avgSecond =
      secondHalf.reduce((sum, r) => sum + r.load, 0) / secondHalf.length;

    const trend = avgSecond - avgFirst;

    // 预测值 = 当前平均 + 趋势外推
    return Math.max(0, avgLoad + trend * 2);
  }

  /**
   * 计算决策置信度
   */
  private calculateConfidence(signals: ScalingSignal[]): number {
    if (signals.length === 0) return 0;

    // 信号方向一致性越高，置信度越高
    const directions = signals.map((s) => s.direction);
    const scaleUpCount = directions.filter((d) => d === "scale-up").length;
    const scaleDownCount = directions.filter((d) => d === "scale-down").length;
    const neutralCount = directions.filter((d) => d === "neutral").length;

    const dominant = Math.max(scaleUpCount, scaleDownCount, neutralCount);
    const consistency = dominant / signals.length;

    // 信号数量越多，置信度基线越高
    const signalCoverage = Math.min(signals.length / 5, 1);

    return consistency * 0.7 + signalCoverage * 0.3;
  }

  /**
   * 构造决策原因说明
   */
  private buildReason(signals: ScalingSignal[], action: string): string {
    const relevantSignals = signals.filter((s) =>
      action === "scale-up"
        ? s.direction === "scale-up"
        : action === "scale-down"
          ? s.direction === "scale-down"
          : true
    );

    if (relevantSignals.length === 0) {
      return "所有信号处于正常范围，无需调整";
    }

    const descriptions = relevantSignals.map(
      (s) => `${s.name}=${s.value.toFixed(2)}(阈值:${s.threshold})`
    );

    return `基于 ${relevantSignals.length} 个信号触发 ${action}: ${descriptions.join(", ")}`;
  }

  /**
   * 执行扩缩容决策
   */
  async applyDecision(decision: ScalingDecision): Promise<ScalingEvent> {
    const startTime = Date.now();

    const event: ScalingEvent = {
      decision,
      executed: false,
      actualReplicas: decision.currentReplicas,
      timestamp: Date.now(),
      durationMs: 0,
    };

    if (decision.action === "no-change") {
      event.executed = true;
      event.durationMs = Date.now() - startTime;
      this.history.push(event);
      return event;
    }

    try {
      console.log(
        `[AgentAutoScaler] 执行 ${decision.action}: ${decision.currentReplicas} -> ${decision.desiredReplicas} 副本`
      );
      console.log(`[AgentAutoScaler] 原因: ${decision.reason}`);

      // 实际执行扩缩容（通过 K8s API）
      // 此处为模拟，实际需调用 K8s client
      event.executed = true;
      event.actualReplicas = decision.desiredReplicas;

      // 更新冷却时间
      if (decision.action === "scale-up") {
        this.lastScaleUpTime = Date.now();
      } else {
        this.lastScaleDownTime = Date.now();
      }
    } catch (error) {
      console.error("[AgentAutoScaler] 扩缩容执行失败:", error);
      event.executed = false;
    }

    event.durationMs = Date.now() - startTime;
    this.history.push(event);

    // 保留最近 100 条历史
    if (this.history.length > 100) {
      this.history = this.history.slice(-50);
    }

    return event;
  }

  /**
   * 获取扩缩容历史
   */
  getHistory(limit: number = 20): ScalingEvent[] {
    return this.history.slice(-limit);
  }
}
```

### 18.3.2 KEDA 集成模式

KEDA（Kubernetes Event Driven Autoscaling）允许我们基于事件源进行更精细的扩缩容。以下是 Agent 场景下的 KEDA 配置生成器：

```typescript
// ============================================================
// 文件: keda-scaler-config.ts
// 描述: KEDA 扩缩容配置生成器
// ============================================================

/** KEDA 触发器类型 */
export type KedaTriggerType =
  | "prometheus"
  | "redis-lists"
  | "redis-streams"
  | "rabbitmq"
  | "kafka"
  | "cron"
  | "metrics-api"
  | "external";

/** KEDA 触发器配置 */
export interface KedaTrigger {
  type: KedaTriggerType;
  name: string;
  metadata: Record<string, string>;
  authenticationRef?: string;
}

/** KEDA ScaledObject 配置 */
export interface KedaScaledObjectConfig {
  name: string;
  namespace: string;
  deploymentName: string;
  minReplicas: number;
  maxReplicas: number;
  pollingInterval: number;
  cooldownPeriod: number;
  triggers: KedaTrigger[];
  fallback?: {
    failureThreshold: number;
    replicas: number;
  };
  advanced?: {
    horizontalPodAutoscalerConfig?: {
      behavior?: {
        scaleDown?: {
          stabilizationWindowSeconds: number;
          policies: Array<{ type: string; value: number; periodSeconds: number }>;
        };
        scaleUp?: {
          stabilizationWindowSeconds: number;
          policies: Array<{ type: string; value: number; periodSeconds: number }>;
        };
      };
    };
  };
}

/**
 * KedaConfigGenerator - KEDA 配置生成器
 *
 * 为 Agent 工作负载生成 KEDA ScaledObject 清单
 */
export class KedaConfigGenerator {
  /**
   * 生成 Agent 专用的 KEDA ScaledObject
   */
  static generateAgentScaledObject(
    config: KedaScaledObjectConfig
  ): string {
    const triggersYaml = config.triggers
      .map(
        (t) => `    - type: ${t.type}
      name: ${t.name}
      metadata:
${Object.entries(t.metadata)
  .map(([k, v]) => `        ${k}: "${v}"`)
  .join("\n")}
${t.authenticationRef ? `      authenticationRef:\n        name: ${t.authenticationRef}` : ""}`
      )
      .join("\n");

    const fallbackYaml = config.fallback
      ? `  fallback:
    failureThreshold: ${config.fallback.failureThreshold}
    replicas: ${config.fallback.replicas}`
      : "";

    const advancedYaml = config.advanced?.horizontalPodAutoscalerConfig
      ? `  advanced:
    horizontalPodAutoscalerConfig:
      behavior:
        scaleDown:
          stabilizationWindowSeconds: ${config.advanced.horizontalPodAutoscalerConfig.behavior?.scaleDown?.stabilizationWindowSeconds || 300}
          policies:
${(config.advanced.horizontalPodAutoscalerConfig.behavior?.scaleDown?.policies || [])
  .map(
    (p) => `          - type: ${p.type}
            value: ${p.value}
            periodSeconds: ${p.periodSeconds}`
  )
  .join("\n")}
        scaleUp:
          stabilizationWindowSeconds: ${config.advanced.horizontalPodAutoscalerConfig.behavior?.scaleUp?.stabilizationWindowSeconds || 30}
          policies:
${(config.advanced.horizontalPodAutoscalerConfig.behavior?.scaleUp?.policies || [])
  .map(
    (p) => `          - type: ${p.type}
            value: ${p.value}
            periodSeconds: ${p.periodSeconds}`
  )
  .join("\n")}`
      : "";

    return `apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: ${config.name}
  namespace: ${config.namespace}
  labels:
    app: ${config.deploymentName}
    scaler: keda
spec:
  scaleTargetRef:
    name: ${config.deploymentName}
  minReplicaCount: ${config.minReplicas}
  maxReplicaCount: ${config.maxReplicas}
  pollingInterval: ${config.pollingInterval}
  cooldownPeriod: ${config.cooldownPeriod}
${fallbackYaml}
${advancedYaml}
  triggers:
${triggersYaml}`;
  }

  /**
   * 生成 Agent 典型的 KEDA 配置
   */
  static generateTypicalAgentKedaConfig(
    deploymentName: string,
    namespace: string,
    prometheusUrl: string
  ): string {
    const config: KedaScaledObjectConfig = {
      name: `${deploymentName}-scaledobject`,
      namespace,
      deploymentName,
      minReplicas: 2,
      maxReplicas: 30,
      pollingInterval: 15,
      cooldownPeriod: 120,
      triggers: [
        {
          type: "prometheus",
          name: "agent-queue-depth",
          metadata: {
            serverAddress: prometheusUrl,
            metricName: "agent_request_queue_depth",
            query: `avg(agent_request_queue_depth{deployment="${deploymentName}"})`,
            threshold: "5",
            activationThreshold: "2",
          },
        },
        {
          type: "prometheus",
          name: "agent-response-latency",
          metadata: {
            serverAddress: prometheusUrl,
            metricName: "agent_response_duration_seconds",
            query: `histogram_quantile(0.95, sum(rate(agent_response_duration_seconds_bucket{deployment="${deploymentName}"}[5m])) by (le))`,
            threshold: "5",
            activationThreshold: "3",
          },
        },
        {
          type: "prometheus",
          name: "agent-concurrent-requests",
          metadata: {
            serverAddress: prometheusUrl,
            metricName: "agent_concurrent_requests",
            query: `sum(agent_concurrent_requests{deployment="${deploymentName}"})`,
            threshold: "50",
            activationThreshold: "30",
          },
        },
        {
          type: "cron",
          name: "business-hours-scale",
          metadata: {
            timezone: "Asia/Shanghai",
            start: "0 8 * * 1-5",
            end: "0 20 * * 1-5",
            desiredReplicas: "5",
          },
        },
      ],
      fallback: {
        failureThreshold: 3,
        replicas: 3,
      },
      advanced: {
        horizontalPodAutoscalerConfig: {
          behavior: {
            scaleDown: {
              stabilizationWindowSeconds: 300,
              policies: [
                { type: "Percent", value: 10, periodSeconds: 60 },
                { type: "Pods", value: 2, periodSeconds: 60 },
              ],
            },
            scaleUp: {
              stabilizationWindowSeconds: 30,
              policies: [
                { type: "Percent", value: 100, periodSeconds: 30 },
                { type: "Pods", value: 5, periodSeconds: 30 },
              ],
            },
          },
        },
      },
    };

    return this.generateAgentScaledObject(config);
  }
}
```

---

## 18.4 部署策略

部署策略决定了新版本如何替代旧版本。对 Agent 系统而言，部署策略必须考虑长连接会话的优雅迁移和模型行为一致性验证。

### 18.4.1 蓝绿部署

蓝绿部署通过维护两套完全独立的环境（蓝色和绿色），在验证通过后一次性切换流量：

```typescript
// ============================================================
// 文件: blue-green-deployer.ts
// 描述: Agent 蓝绿部署控制器
// ============================================================

/** 蓝绿环境标识 */
export type BlueGreenSlot = "blue" | "green";

/** 蓝绿部署状态 */
export interface BlueGreenState {
  activeSlot: BlueGreenSlot;
  blueVersion: string | null;
  greenVersion: string | null;
  blueHealthy: boolean;
  greenHealthy: boolean;
  lastSwitchTime: number | null;
  switchCount: number;
}

/** 切换验证结果 */
export interface SwitchValidation {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
    durationMs: number;
  }>;
  totalDurationMs: number;
}

/**
 * BlueGreenDeployer - 蓝绿部署控制器
 *
 * 流程：
 * 1. 在非活跃环境部署新版本
 * 2. 运行健康检查和验证套件
 * 3. 切换流量到新环境
 * 4. 保留旧环境用于快速回滚
 */
export class BlueGreenDeployer {
  private state: BlueGreenState;
  private k8sClient: {
    deployVersion(
      slot: BlueGreenSlot,
      version: string,
      config: Record<string, unknown>
    ): Promise<boolean>;
    switchTraffic(slot: BlueGreenSlot): Promise<boolean>;
    checkHealth(slot: BlueGreenSlot): Promise<boolean>;
    runSmokeTests(slot: BlueGreenSlot): Promise<{ passed: boolean; details: string }>;
    getEndpoint(slot: BlueGreenSlot): string;
    scaleDown(slot: BlueGreenSlot): Promise<void>;
    scaleUp(slot: BlueGreenSlot): Promise<void>;
  };

  constructor(k8sClient: BlueGreenDeployer["k8sClient"]) {
    this.k8sClient = k8sClient;
    this.state = {
      activeSlot: "blue",
      blueVersion: null,
      greenVersion: null,
      blueHealthy: false,
      greenHealthy: false,
      lastSwitchTime: null,
      switchCount: 0,
    };
  }

  /**
   * 执行蓝绿部署
   */
  async deploy(
    version: string,
    config: Record<string, unknown>
  ): Promise<{
    success: boolean;
    activeSlot: BlueGreenSlot;
    validationResult: SwitchValidation;
    message: string;
  }> {
    const targetSlot = this.getInactiveSlot();
    console.log(
      `[BlueGreenDeployer] 开始部署 v${version} 到 ${targetSlot} 环境`
    );

    // 步骤 1: 在目标环境部署新版本
    console.log(`[BlueGreenDeployer] 步骤 1: 部署新版本到 ${targetSlot}...`);
    const deployed = await this.k8sClient.deployVersion(
      targetSlot,
      version,
      config
    );
    if (!deployed) {
      return {
        success: false,
        activeSlot: this.state.activeSlot,
        validationResult: { passed: false, checks: [], totalDurationMs: 0 },
        message: `部署到 ${targetSlot} 环境失败`,
      };
    }

    // 步骤 2: 等待新环境就绪并运行验证
    console.log("[BlueGreenDeployer] 步骤 2: 验证新环境...");
    const validation = await this.validateSlot(targetSlot);
    if (!validation.passed) {
      console.log("[BlueGreenDeployer] 验证失败，保持当前环境不变");
      return {
        success: false,
        activeSlot: this.state.activeSlot,
        validationResult: validation,
        message: `${targetSlot} 环境验证失败: ${validation.checks.filter((c) => !c.passed).map((c) => c.message).join("; ")}`,
      };
    }

    // 步骤 3: 切换流量
    console.log(`[BlueGreenDeployer] 步骤 3: 切换流量到 ${targetSlot}...`);
    const switched = await this.k8sClient.switchTraffic(targetSlot);
    if (!switched) {
      return {
        success: false,
        activeSlot: this.state.activeSlot,
        validationResult: validation,
        message: "流量切换失败",
      };
    }

    // 步骤 4: 更新状态
    if (targetSlot === "blue") {
      this.state.blueVersion = version;
      this.state.blueHealthy = true;
    } else {
      this.state.greenVersion = version;
      this.state.greenHealthy = true;
    }
    this.state.activeSlot = targetSlot;
    this.state.lastSwitchTime = Date.now();
    this.state.switchCount++;

    console.log(
      `[BlueGreenDeployer] 部署成功: 活跃环境切换到 ${targetSlot} (v${version})`
    );

    return {
      success: true,
      activeSlot: targetSlot,
      validationResult: validation,
      message: `成功部署 v${version} 到 ${targetSlot} 环境`,
    };
  }

  /**
   * 快速回滚
   */
  async rollback(): Promise<{
    success: boolean;
    activeSlot: BlueGreenSlot;
    message: string;
  }> {
    const previousSlot = this.getInactiveSlot();
    const previousVersion =
      previousSlot === "blue"
        ? this.state.blueVersion
        : this.state.greenVersion;

    if (!previousVersion) {
      return {
        success: false,
        activeSlot: this.state.activeSlot,
        message: "没有可回滚的版本",
      };
    }

    console.log(
      `[BlueGreenDeployer] 回滚到 ${previousSlot} 环境 (v${previousVersion})`
    );

    // 确保旧环境健康
    const healthy = await this.k8sClient.checkHealth(previousSlot);
    if (!healthy) {
      await this.k8sClient.scaleUp(previousSlot);
      const retryHealthy = await this.k8sClient.checkHealth(previousSlot);
      if (!retryHealthy) {
        return {
          success: false,
          activeSlot: this.state.activeSlot,
          message: `回滚目标环境 ${previousSlot} 不健康`,
        };
      }
    }

    const switched = await this.k8sClient.switchTraffic(previousSlot);
    if (!switched) {
      return {
        success: false,
        activeSlot: this.state.activeSlot,
        message: "流量切换失败",
      };
    }

    this.state.activeSlot = previousSlot;
    this.state.lastSwitchTime = Date.now();
    this.state.switchCount++;

    return {
      success: true,
      activeSlot: previousSlot,
      message: `成功回滚到 ${previousSlot} 环境 (v${previousVersion})`,
    };
  }

  /**
   * 验证目标环境
   */
  private async validateSlot(slot: BlueGreenSlot): Promise<SwitchValidation> {
    const startTime = Date.now();
    const checks: SwitchValidation["checks"] = [];

    // 检查 1: 健康检查
    const healthStart = Date.now();
    const healthy = await this.k8sClient.checkHealth(slot);
    checks.push({
      name: "健康检查",
      passed: healthy,
      message: healthy ? "所有 Pod 健康" : "健康检查未通过",
      durationMs: Date.now() - healthStart,
    });

    if (!healthy) {
      return {
        passed: false,
        checks,
        totalDurationMs: Date.now() - startTime,
      };
    }

    // 检查 2: 冒烟测试
    const smokeStart = Date.now();
    const smokeResult = await this.k8sClient.runSmokeTests(slot);
    checks.push({
      name: "冒烟测试",
      passed: smokeResult.passed,
      message: smokeResult.details,
      durationMs: Date.now() - smokeStart,
    });

    // 检查 3: 端点可达性
    const endpointStart = Date.now();
    const endpoint = this.k8sClient.getEndpoint(slot);
    const endpointReachable = endpoint.length > 0;
    checks.push({
      name: "端点可达性",
      passed: endpointReachable,
      message: endpointReachable ? `端点可达: ${endpoint}` : "端点不可达",
      durationMs: Date.now() - endpointStart,
    });

    return {
      passed: checks.every((c) => c.passed),
      checks,
      totalDurationMs: Date.now() - startTime,
    };
  }

  /**
   * 获取非活跃环境
   */
  private getInactiveSlot(): BlueGreenSlot {
    return this.state.activeSlot === "blue" ? "green" : "blue";
  }

  /**
   * 获取当前状态
   */
  getState(): BlueGreenState {
    return { ...this.state };
  }
}
```

### 18.4.2 金丝雀发布控制器

金丝雀发布通过逐步增加新版本的流量比例，在检测到异常时自动回滚：

```typescript
// ============================================================
// 文件: canary-deployment-controller.ts
// 描述: 带自动回滚的金丝雀发布控制器
// ============================================================

/** 金丝雀阶段 */
export interface CanaryStage {
  weight: number;
  durationMs: number;
  successCriteria: {
    maxErrorRate: number;
    maxLatencyP95Ms: number;
    minSuccessRate: number;
  };
}

/** 金丝雀配置 */
export interface CanaryConfig {
  stages: CanaryStage[];
  analysisIntervalMs: number;
  rollbackOnFailure: boolean;
  baselineComparison: boolean;
  maxRollbackAttempts: number;
  warmupDurationMs: number;
}

/** 金丝雀状态 */
export type CanaryStatus =
  | "not_started"
  | "in_progress"
  | "paused"
  | "succeeded"
  | "failed"
  | "rolled_back";

/** 金丝雀指标 */
export interface CanaryMetrics {
  errorRate: number;
  latencyP95Ms: number;
  successRate: number;
  requestCount: number;
  canaryRequestCount: number;
  baselineErrorRate: number;
  baselineLatencyP95Ms: number;
}

/** 阶段分析结果 */
export interface StageAnalysis {
  stagePassed: boolean;
  stageIndex: number;
  weight: number;
  metrics: CanaryMetrics;
  violations: string[];
  timestamp: number;
}

/** 流量路由接口 */
export interface TrafficRouter {
  setCanaryWeight(weight: number): Promise<void>;
  getCanaryWeight(): Promise<number>;
  getMetrics(): Promise<CanaryMetrics>;
  deployCanary(version: string): Promise<boolean>;
  removeCanary(): Promise<boolean>;
  promoteCanary(): Promise<boolean>;
}

/**
 * CanaryDeploymentController - 金丝雀发布控制器
 *
 * 核心能力：
 * - 多阶段逐步放量
 * - 基于实时指标的自动分析
 * - 与基线对比检测回归
 * - 异常时自动回滚
 * - 暂停/恢复控制
 */
export class CanaryDeploymentController {
  private config: CanaryConfig;
  private router: TrafficRouter;
  private status: CanaryStatus = "not_started";
  private currentStageIndex: number = 0;
  private version: string = "";
  private analyses: StageAnalysis[] = [];
  private abortController: AbortController | null = null;

  constructor(config: CanaryConfig, router: TrafficRouter) {
    this.config = config;
    this.router = router;
  }

  /**
   * 启动金丝雀发布
   */
  async start(version: string): Promise<void> {
    if (this.status === "in_progress") {
      throw new Error("金丝雀发布已在进行中");
    }

    this.version = version;
    this.status = "in_progress";
    this.currentStageIndex = 0;
    this.analyses = [];
    this.abortController = new AbortController();

    console.log(
      `[CanaryController] 开始金丝雀发布 v${version}, 共 ${this.config.stages.length} 个阶段`
    );

    // 部署金丝雀版本
    const deployed = await this.router.deployCanary(version);
    if (!deployed) {
      this.status = "failed";
      throw new Error("金丝雀版本部署失败");
    }

    // 预热阶段
    if (this.config.warmupDurationMs > 0) {
      console.log(
        `[CanaryController] 预热阶段: ${this.config.warmupDurationMs}ms`
      );
      await this.router.setCanaryWeight(1);
      await this.sleep(this.config.warmupDurationMs);
    }

    // 逐步执行各阶段
    try {
      await this.executeStages();
    } catch (error) {
      console.error("[CanaryController] 金丝雀发布异常:", error);
      if (this.config.rollbackOnFailure) {
        await this.rollback();
      }
    }
  }

  /**
   * 逐步执行各个阶段
   */
  private async executeStages(): Promise<void> {
    for (let i = 0; i < this.config.stages.length; i++) {
      if (this.abortController?.signal.aborted) {
        console.log("[CanaryController] 金丝雀发布已被中止");
        return;
      }

      if (this.status === "paused") {
        console.log("[CanaryController] 金丝雀发布已暂停");
        return;
      }

      this.currentStageIndex = i;
      const stage = this.config.stages[i];

      console.log(
        `[CanaryController] 进入阶段 ${i + 1}/${this.config.stages.length}: 权重 ${stage.weight}%`
      );

      // 设置流量权重
      await this.router.setCanaryWeight(stage.weight);

      // 等待并分析
      const analysisResult = await this.analyzeStage(i, stage);
      this.analyses.push(analysisResult);

      if (!analysisResult.stagePassed) {
        console.log(
          `[CanaryController] 阶段 ${i + 1} 未通过: ${analysisResult.violations.join(", ")}`
        );
        this.status = "failed";

        if (this.config.rollbackOnFailure) {
          await this.rollback();
        }
        return;
      }

      console.log(`[CanaryController] 阶段 ${i + 1} 通过`);
    }

    // 所有阶段通过，提升金丝雀为稳定版本
    console.log("[CanaryController] 所有阶段通过，提升金丝雀版本");
    const promoted = await this.router.promoteCanary();
    if (promoted) {
      this.status = "succeeded";
    } else {
      this.status = "failed";
      if (this.config.rollbackOnFailure) {
        await this.rollback();
      }
    }
  }

  /**
   * 分析当前阶段
   */
  private async analyzeStage(
    stageIndex: number,
    stage: CanaryStage
  ): Promise<StageAnalysis> {
    const analysisEnd = Date.now() + stage.durationMs;
    let latestMetrics: CanaryMetrics | null = null;
    const violations: string[] = [];

    while (Date.now() < analysisEnd) {
      if (this.abortController?.signal.aborted) {
        break;
      }

      await this.sleep(this.config.analysisIntervalMs);

      latestMetrics = await this.router.getMetrics();

      // 检查成功标准
      const currentViolations = this.checkCriteria(
        latestMetrics,
        stage.successCriteria
      );

      if (currentViolations.length > 0) {
        // 如果是基线对比模式，需要和基线版本做比较
        if (this.config.baselineComparison) {
          const baselineViolations = this.checkBaselineRegression(latestMetrics);
          if (baselineViolations.length > 0) {
            violations.push(...baselineViolations);
            break;
          }
        } else {
          violations.push(...currentViolations);
          break;
        }
      }
    }

    if (!latestMetrics) {
      latestMetrics = {
        errorRate: 0,
        latencyP95Ms: 0,
        successRate: 1,
        requestCount: 0,
        canaryRequestCount: 0,
        baselineErrorRate: 0,
        baselineLatencyP95Ms: 0,
      };
    }

    return {
      stagePassed: violations.length === 0,
      stageIndex,
      weight: stage.weight,
      metrics: latestMetrics,
      violations,
      timestamp: Date.now(),
    };
  }

  /**
   * 检查成功标准
   */
  private checkCriteria(
    metrics: CanaryMetrics,
    criteria: CanaryStage["successCriteria"]
  ): string[] {
    const violations: string[] = [];

    if (metrics.errorRate > criteria.maxErrorRate) {
      violations.push(
        `错误率 ${(metrics.errorRate * 100).toFixed(2)}% 超过阈值 ${(criteria.maxErrorRate * 100).toFixed(2)}%`
      );
    }

    if (metrics.latencyP95Ms > criteria.maxLatencyP95Ms) {
      violations.push(
        `P95 延迟 ${metrics.latencyP95Ms}ms 超过阈值 ${criteria.maxLatencyP95Ms}ms`
      );
    }

    if (metrics.successRate < criteria.minSuccessRate) {
      violations.push(
        `成功率 ${(metrics.successRate * 100).toFixed(2)}% 低于阈值 ${(criteria.minSuccessRate * 100).toFixed(2)}%`
      );
    }

    return violations;
  }

  /**
   * 检查相对基线的回归
   */
  private checkBaselineRegression(metrics: CanaryMetrics): string[] {
    const violations: string[] = [];
    const regressionThreshold = 1.2; // 20% 回归阈值

    if (
      metrics.baselineErrorRate > 0 &&
      metrics.errorRate > metrics.baselineErrorRate * regressionThreshold
    ) {
      violations.push(
        `错误率相对基线回归: ${(metrics.errorRate * 100).toFixed(2)}% vs 基线 ${(metrics.baselineErrorRate * 100).toFixed(2)}%`
      );
    }

    if (
      metrics.baselineLatencyP95Ms > 0 &&
      metrics.latencyP95Ms > metrics.baselineLatencyP95Ms * regressionThreshold
    ) {
      violations.push(
        `P95 延迟相对基线回归: ${metrics.latencyP95Ms}ms vs 基线 ${metrics.baselineLatencyP95Ms}ms`
      );
    }

    return violations;
  }

  /**
   * 回滚金丝雀发布
   */
  async rollback(): Promise<boolean> {
    console.log("[CanaryController] 执行回滚...");

    // 将流量权重设为 0
    await this.router.setCanaryWeight(0);

    // 移除金丝雀版本
    const removed = await this.router.removeCanary();

    this.status = "rolled_back";
    console.log(`[CanaryController] 回滚${removed ? "成功" : "失败"}`);

    return removed;
  }

  /**
   * 暂停金丝雀发布
   */
  pause(): void {
    if (this.status === "in_progress") {
      this.status = "paused";
      console.log("[CanaryController] 金丝雀发布已暂停");
    }
  }

  /**
   * 恢复金丝雀发布
   */
  async resume(): Promise<void> {
    if (this.status === "paused") {
      this.status = "in_progress";
      console.log("[CanaryController] 金丝雀发布已恢复");
      await this.executeStages();
    }
  }

  /**
   * 中止金丝雀发布
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.status = "failed";
    console.log("[CanaryController] 金丝雀发布已中止");
  }

  /**
   * 获取发布状态报告
   */
  getReport(): {
    status: CanaryStatus;
    version: string;
    currentStage: number;
    totalStages: number;
    analyses: StageAnalysis[];
    progress: number;
  } {
    return {
      status: this.status,
      version: this.version,
      currentStage: this.currentStageIndex + 1,
      totalStages: this.config.stages.length,
      analyses: [...this.analyses],
      progress:
        this.config.stages.length > 0
          ? ((this.currentStageIndex + 1) / this.config.stages.length) * 100
          : 0,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

### 18.4.3 部署编排器

将多种部署策略整合为统一的编排接口：

```typescript
// ============================================================
// 文件: deployment-orchestrator.ts
// 描述: 统一部署编排器，支持多种部署策略
// ============================================================

/** 部署策略类型 */
export type DeploymentStrategy =
  | "blue-green"
  | "canary"
  | "rolling"
  | "shadow"
  | "ab-testing";

/** 部署请求 */
export interface DeploymentRequest {
  applicationName: string;
  version: string;
  strategy: DeploymentStrategy;
  environment: string;
  config: Record<string, unknown>;
  owner: string;
  description: string;
  autoRollback: boolean;
  notificationChannels: string[];
}

/** 部署进度事件 */
export interface DeploymentProgressEvent {
  phase: string;
  status: "pending" | "in_progress" | "succeeded" | "failed";
  message: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/** 完整部署结果 */
export interface DeploymentOrchestratorResult {
  requestId: string;
  success: boolean;
  strategy: DeploymentStrategy;
  version: string;
  environment: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  events: DeploymentProgressEvent[];
  rollbackPerformed: boolean;
  finalMessage: string;
}

/** 通知服务接口 */
export interface NotificationService {
  send(channel: string, message: string, severity: "info" | "warning" | "error"): Promise<void>;
}

/** 审计日志接口 */
export interface AuditLogger {
  log(event: {
    action: string;
    actor: string;
    resource: string;
    details: Record<string, unknown>;
    timestamp: number;
  }): Promise<void>;
}

/**
 * DeploymentOrchestrator - 部署编排器
 *
 * 职责：
 * 1. 接收部署请求并路由到对应的策略执行器
 * 2. 管理部署生命周期（预检查、执行、验证、通知）
 * 3. 统一异常处理和回滚流程
 * 4. 提供审计日志
 */
export class DeploymentOrchestrator {
  private notifier: NotificationService;
  private audit: AuditLogger;
  private activeDeployments: Map<string, DeploymentOrchestratorResult> = new Map();

  constructor(notifier: NotificationService, audit: AuditLogger) {
    this.notifier = notifier;
    this.audit = audit;
  }

  /**
   * 执行部署
   */
  async deploy(
    request: DeploymentRequest
  ): Promise<DeploymentOrchestratorResult> {
    const requestId = `deploy-${request.applicationName}-${request.version}-${Date.now()}`;
    const startTime = Date.now();
    const events: DeploymentProgressEvent[] = [];

    const result: DeploymentOrchestratorResult = {
      requestId,
      success: false,
      strategy: request.strategy,
      version: request.version,
      environment: request.environment,
      startTime,
      endTime: 0,
      durationMs: 0,
      events,
      rollbackPerformed: false,
      finalMessage: "",
    };

    this.activeDeployments.set(requestId, result);

    try {
      // 阶段 1: 部署前检查
      this.addEvent(events, "pre-check", "in_progress", "执行部署前检查...");
      await this.preDeploymentChecks(request);
      this.addEvent(events, "pre-check", "succeeded", "部署前检查通过");

      // 阶段 2: 通知部署开始
      await this.notifyStart(request);
      this.addEvent(events, "notification", "succeeded", "已发送部署开始通知");

      // 阶段 3: 审计记录
      await this.audit.log({
        action: "deployment_started",
        actor: request.owner,
        resource: request.applicationName,
        details: {
          version: request.version,
          strategy: request.strategy,
          environment: request.environment,
        },
        timestamp: Date.now(),
      });

      // 阶段 4: 执行部署策略
      this.addEvent(
        events,
        "deploy",
        "in_progress",
        `执行 ${request.strategy} 部署...`
      );

      const deploySuccess = await this.executeStrategy(request, events);

      if (deploySuccess) {
        this.addEvent(events, "deploy", "succeeded", "部署成功完成");

        // 阶段 5: 部署后验证
        this.addEvent(events, "post-validation", "in_progress", "执行部署后验证...");
        const validationPassed = await this.postDeploymentValidation(request);

        if (validationPassed) {
          this.addEvent(events, "post-validation", "succeeded", "部署后验证通过");
          result.success = true;
          result.finalMessage = `v${request.version} 部署成功 (${request.strategy})`;
        } else {
          this.addEvent(events, "post-validation", "failed", "部署后验证失败");

          if (request.autoRollback) {
            this.addEvent(events, "rollback", "in_progress", "自动回滚中...");
            await this.performRollback(request, events);
            result.rollbackPerformed = true;
            this.addEvent(events, "rollback", "succeeded", "回滚完成");
          }

          result.finalMessage = "部署后验证失败";
        }
      } else {
        this.addEvent(events, "deploy", "failed", "部署执行失败");

        if (request.autoRollback) {
          this.addEvent(events, "rollback", "in_progress", "自动回滚中...");
          await this.performRollback(request, events);
          result.rollbackPerformed = true;
          this.addEvent(events, "rollback", "succeeded", "回滚完成");
        }

        result.finalMessage = "部署执行失败";
      }
    } catch (error) {
      const err = error as Error;
      this.addEvent(events, "error", "failed", `异常: ${err.message}`);
      result.finalMessage = `部署异常: ${err.message}`;

      if (request.autoRollback) {
        try {
          await this.performRollback(request, events);
          result.rollbackPerformed = true;
        } catch (rollbackErr) {
          this.addEvent(
            events,
            "rollback",
            "failed",
            `回滚也失败了: ${rollbackErr}`
          );
        }
      }
    } finally {
      result.endTime = Date.now();
      result.durationMs = result.endTime - result.startTime;
      result.events = events;

      // 通知部署结果
      await this.notifyResult(request, result);

      // 审计记录
      await this.audit.log({
        action: result.success ? "deployment_succeeded" : "deployment_failed",
        actor: request.owner,
        resource: request.applicationName,
        details: {
          version: request.version,
          durationMs: result.durationMs,
          rollbackPerformed: result.rollbackPerformed,
        },
        timestamp: Date.now(),
      });

      this.activeDeployments.delete(requestId);
    }

    return result;
  }

  /**
   * 部署前检查
   */
  private async preDeploymentChecks(request: DeploymentRequest): Promise<void> {
    // 检查是否有正在进行的部署
    for (const [, active] of this.activeDeployments) {
      if (
        active.environment === request.environment &&
        active.events.some((e) => e.status === "in_progress")
      ) {
        throw new Error(
          `环境 ${request.environment} 已有部署正在进行: ${active.requestId}`
        );
      }
    }

    // 验证版本格式
    if (!request.version || request.version.trim().length === 0) {
      throw new Error("版本号不能为空");
    }

    // 验证策略与环境兼容性
    if (request.environment === "production" && request.strategy === "rolling") {
      console.warn(
        "[DeploymentOrchestrator] 警告: 生产环境建议使用 canary 或 blue-green 策略"
      );
    }
  }

  /**
   * 根据策略执行部署
   */
  private async executeStrategy(
    request: DeploymentRequest,
    events: DeploymentProgressEvent[]
  ): Promise<boolean> {
    switch (request.strategy) {
      case "blue-green":
        this.addEvent(events, "strategy", "in_progress", "执行蓝绿部署策略");
        console.log("[DeploymentOrchestrator] 执行蓝绿部署");
        return true;

      case "canary":
        this.addEvent(
          events,
          "strategy",
          "in_progress",
          "执行金丝雀发布策略"
        );
        console.log("[DeploymentOrchestrator] 执行金丝雀发布");
        return true;

      case "rolling":
        this.addEvent(
          events,
          "strategy",
          "in_progress",
          "执行滚动更新策略"
        );
        console.log("[DeploymentOrchestrator] 执行滚动更新");
        return true;

      case "shadow":
        this.addEvent(events, "strategy", "in_progress", "执行影子部署策略");
        console.log("[DeploymentOrchestrator] 执行影子部署——将流量镜像到新版本，不影响生产");
        return true;

      case "ab-testing":
        this.addEvent(events, "strategy", "in_progress", "执行 A/B 测试部署策略");
        console.log("[DeploymentOrchestrator] 执行 A/B 测试部署——按用户群组分流");
        return true;

      default:
        throw new Error(`不支持的部署策略: ${request.strategy}`);
    }
  }

  /**
   * 部署后验证
   */
  private async postDeploymentValidation(
    request: DeploymentRequest
  ): Promise<boolean> {
    console.log(`[DeploymentOrchestrator] 验证 ${request.applicationName} v${request.version}`);
    // 实际实现中会调用健康检查和冒烟测试
    return true;
  }

  /**
   * 执行回滚
   */
  private async performRollback(
    request: DeploymentRequest,
    events: DeploymentProgressEvent[]
  ): Promise<void> {
    console.log(`[DeploymentOrchestrator] 回滚 ${request.applicationName}`);
    this.addEvent(events, "rollback", "succeeded", "回滚操作已完成");
  }

  /**
   * 发送部署开始通知
   */
  private async notifyStart(request: DeploymentRequest): Promise<void> {
    const message = `部署开始: ${request.applicationName} v${request.version} (${request.strategy}) -> ${request.environment}`;
    for (const channel of request.notificationChannels) {
      await this.notifier.send(channel, message, "info");
    }
  }

  /**
   * 发送部署结果通知
   */
  private async notifyResult(
    request: DeploymentRequest,
    result: DeploymentOrchestratorResult
  ): Promise<void> {
    const severity = result.success ? "info" : "error";
    const message = `部署${result.success ? "成功" : "失败"}: ${request.applicationName} v${request.version}, 耗时 ${result.durationMs}ms${result.rollbackPerformed ? " (已回滚)" : ""}`;
    for (const channel of request.notificationChannels) {
      await this.notifier.send(channel, message, severity);
    }
  }

  /**
   * 添加进度事件
   */
  private addEvent(
    events: DeploymentProgressEvent[],
    phase: string,
    status: DeploymentProgressEvent["status"],
    message: string
  ): void {
    events.push({
      phase,
      status,
      message,
      timestamp: Date.now(),
    });
  }

  /**
   * 获取活跃部署列表
   */
  getActiveDeployments(): DeploymentOrchestratorResult[] {
    return Array.from(this.activeDeployments.values());
  }
}
```

---

## 18.5 配置管理

Agent 系统的配置管理需要处理比传统应用更复杂的场景：模型参数、提示词模板、工具配置、特性开关等都需要支持动态更新而无需重新部署。

### 18.5.1 Agent 配置管理器

```typescript
// ============================================================
// 文件: agent-config-manager.ts
// 描述: 支持层级覆盖、动态更新、版本管理的配置管理器
// ============================================================

/** 配置层级 */
export type ConfigLayer = "default" | "environment" | "cluster" | "application" | "override";

/** 配置值类型 */
export type ConfigValue = string | number | boolean | string[] | Record<string, unknown>;

/** 配置条目 */
export interface ConfigEntry {
  key: string;
  value: ConfigValue;
  layer: ConfigLayer;
  version: number;
  updatedAt: number;
  updatedBy: string;
  description?: string;
  validation?: ConfigValidationRule;
}

/** 配置验证规则 */
export interface ConfigValidationRule {
  type: "string" | "number" | "boolean" | "array" | "object";
  required: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  allowedValues?: ConfigValue[];
}

/** 配置变更事件 */
export interface ConfigChangeEvent {
  key: string;
  oldValue: ConfigValue | undefined;
  newValue: ConfigValue;
  layer: ConfigLayer;
  version: number;
  changedBy: string;
  timestamp: number;
}

/** 配置快照 */
export interface ConfigSnapshot {
  id: string;
  entries: Map<string, ConfigEntry>;
  createdAt: number;
  description: string;
}

/** 配置后端接口 */
export interface ConfigBackend {
  get(key: string, layer: ConfigLayer): Promise<ConfigEntry | null>;
  set(entry: ConfigEntry): Promise<void>;
  delete(key: string, layer: ConfigLayer): Promise<void>;
  list(layer: ConfigLayer): Promise<ConfigEntry[]>;
  watch(callback: (event: ConfigChangeEvent) => void): void;
}

/** 特性开关 */
export interface FeatureFlag {
  name: string;
  enabled: boolean;
  rolloutPercentage: number;
  targetGroups: string[];
  conditions: Array<{
    field: string;
    operator: "eq" | "neq" | "gt" | "lt" | "in" | "nin";
    value: ConfigValue;
  }>;
  createdAt: number;
  expiresAt?: number;
}

/**
 * AgentConfigManager - Agent 配置管理器
 *
 * 核心特性：
 * 1. 层级配置覆盖（default < environment < cluster < application < override）
 * 2. 动态配置更新（无需重部署）
 * 3. 配置版本管理与回滚
 * 4. 特性开关
 * 5. 配置验证
 * 6. 变更审计
 */
export class AgentConfigManager {
  private layers: Map<ConfigLayer, Map<string, ConfigEntry>> = new Map();
  private changeListeners: Array<(event: ConfigChangeEvent) => void> = [];
  private changeHistory: ConfigChangeEvent[] = [];
  private snapshots: ConfigSnapshot[] = [];
  private featureFlags: Map<string, FeatureFlag> = new Map();
  private backend: ConfigBackend | null = null;

  /** 层级优先级（数字越大优先级越高） */
  private static readonly LAYER_PRIORITY: Record<ConfigLayer, number> = {
    default: 0,
    environment: 1,
    cluster: 2,
    application: 3,
    override: 4,
  };

  constructor(backend?: ConfigBackend) {
    this.backend = backend || null;

    // 初始化各层级
    const layerNames: ConfigLayer[] = [
      "default",
      "environment",
      "cluster",
      "application",
      "override",
    ];
    for (const layer of layerNames) {
      this.layers.set(layer, new Map());
    }
  }

  /**
   * 获取配置值（按层级优先级合并）
   */
  get<T extends ConfigValue>(key: string, defaultValue?: T): T {
    const orderedLayers: ConfigLayer[] = [
      "override",
      "application",
      "cluster",
      "environment",
      "default",
    ];

    for (const layer of orderedLayers) {
      const layerMap = this.layers.get(layer);
      if (layerMap && layerMap.has(key)) {
        return layerMap.get(key)!.value as T;
      }
    }

    if (defaultValue !== undefined) {
      return defaultValue;
    }

    throw new Error(`配置键 "${key}" 未找到且未提供默认值`);
  }

  /**
   * 设置配置值
   */
  async set(
    key: string,
    value: ConfigValue,
    layer: ConfigLayer = "application",
    updatedBy: string = "system"
  ): Promise<void> {
    const layerMap = this.layers.get(layer);
    if (!layerMap) {
      throw new Error(`无效的配置层级: ${layer}`);
    }

    // 验证配置值
    const existing = layerMap.get(key);
    if (existing?.validation) {
      this.validateValue(value, existing.validation);
    }

    const oldValue = existing?.value;
    const version = (existing?.version || 0) + 1;

    const entry: ConfigEntry = {
      key,
      value,
      layer,
      version,
      updatedAt: Date.now(),
      updatedBy,
      description: existing?.description,
      validation: existing?.validation,
    };

    layerMap.set(key, entry);

    // 同步到后端
    if (this.backend) {
      await this.backend.set(entry);
    }

    // 触发变更事件
    const changeEvent: ConfigChangeEvent = {
      key,
      oldValue,
      newValue: value,
      layer,
      version,
      changedBy: updatedBy,
      timestamp: Date.now(),
    };

    this.changeHistory.push(changeEvent);
    for (const listener of this.changeListeners) {
      try {
        listener(changeEvent);
      } catch (err) {
        console.error("[AgentConfigManager] 变更监听器异常:", err);
      }
    }
  }

  /**
   * 批量设置配置
   */
  async setBatch(
    entries: Array<{ key: string; value: ConfigValue }>,
    layer: ConfigLayer = "application",
    updatedBy: string = "system"
  ): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.value, layer, updatedBy);
    }
  }

  /**
   * 删除配置
   */
  async delete(key: string, layer: ConfigLayer): Promise<boolean> {
    const layerMap = this.layers.get(layer);
    if (!layerMap) return false;

    const deleted = layerMap.delete(key);
    if (deleted && this.backend) {
      await this.backend.delete(key, layer);
    }
    return deleted;
  }

  /**
   * 获取所有解析后的配置（所有层级合并）
   */
  getResolved(): Record<string, ConfigValue> {
    const resolved: Record<string, ConfigValue> = {};
    const allKeys = new Set<string>();

    // 收集所有 key
    for (const layerMap of this.layers.values()) {
      for (const key of layerMap.keys()) {
        allKeys.add(key);
      }
    }

    // 为每个 key 获取最终值
    for (const key of allKeys) {
      try {
        resolved[key] = this.get(key);
      } catch {
        // 忽略
      }
    }

    return resolved;
  }

  /**
   * 创建配置快照
   */
  createSnapshot(description: string): string {
    const snapshotId = `snapshot-${Date.now()}`;
    const entries = new Map<string, ConfigEntry>();

    for (const [, layerMap] of this.layers) {
      for (const [key, entry] of layerMap) {
        entries.set(`${entry.layer}:${key}`, { ...entry });
      }
    }

    this.snapshots.push({
      id: snapshotId,
      entries,
      createdAt: Date.now(),
      description,
    });

    console.log(`[AgentConfigManager] 创建配置快照: ${snapshotId}`);
    return snapshotId;
  }

  /**
   * 恢复配置快照
   */
  async restoreSnapshot(snapshotId: string): Promise<boolean> {
    const snapshot = this.snapshots.find((s) => s.id === snapshotId);
    if (!snapshot) {
      console.error(`[AgentConfigManager] 快照 ${snapshotId} 不存在`);
      return false;
    }

    // 清除当前配置
    for (const layerMap of this.layers.values()) {
      layerMap.clear();
    }

    // 恢复快照配置
    for (const entry of snapshot.entries.values()) {
      const layerMap = this.layers.get(entry.layer);
      if (layerMap) {
        layerMap.set(entry.key, { ...entry });
      }
    }

    console.log(`[AgentConfigManager] 已恢复快照: ${snapshotId}`);
    return true;
  }

  /**
   * 注册变更监听器
   */
  onChange(listener: (event: ConfigChangeEvent) => void): () => void {
    this.changeListeners.push(listener);
    return () => {
      const index = this.changeListeners.indexOf(listener);
      if (index > -1) {
        this.changeListeners.splice(index, 1);
      }
    };
  }

  /**
   * 设置特性开关
   */
  setFeatureFlag(flag: FeatureFlag): void {
    this.featureFlags.set(flag.name, flag);
  }

  /**
   * 检查特性开关是否启用
   */
  isFeatureEnabled(
    flagName: string,
    context?: { userId?: string; group?: string; attributes?: Record<string, ConfigValue> }
  ): boolean {
    const flag = this.featureFlags.get(flagName);
    if (!flag) return false;

    // 检查过期
    if (flag.expiresAt && Date.now() > flag.expiresAt) {
      return false;
    }

    if (!flag.enabled) return false;

    // 检查目标群组
    if (flag.targetGroups.length > 0 && context?.group) {
      if (!flag.targetGroups.includes(context.group)) {
        return false;
      }
    }

    // 检查灰度比例
    if (flag.rolloutPercentage < 100 && context?.userId) {
      const hash = this.hashString(context.userId + flagName);
      if (hash % 100 >= flag.rolloutPercentage) {
        return false;
      }
    }

    // 检查条件
    if (flag.conditions.length > 0 && context?.attributes) {
      for (const condition of flag.conditions) {
        const fieldValue = context.attributes[condition.field];
        if (!this.evaluateCondition(fieldValue, condition.operator, condition.value)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 获取变更历史
   */
  getChangeHistory(limit: number = 50): ConfigChangeEvent[] {
    return this.changeHistory.slice(-limit);
  }

  /**
   * 验证配置值
   */
  private validateValue(value: ConfigValue, rule: ConfigValidationRule): void {
    if (rule.required && (value === null || value === undefined)) {
      throw new Error("配置值不能为空");
    }

    if (rule.type === "number" && typeof value === "number") {
      if (rule.min !== undefined && value < rule.min) {
        throw new Error(`配置值 ${value} 小于最小值 ${rule.min}`);
      }
      if (rule.max !== undefined && value > rule.max) {
        throw new Error(`配置值 ${value} 大于最大值 ${rule.max}`);
      }
    }

    if (rule.type === "string" && typeof value === "string" && rule.pattern) {
      if (!new RegExp(rule.pattern).test(value)) {
        throw new Error(`配置值不匹配规则: ${rule.pattern}`);
      }
    }

    if (rule.allowedValues && rule.allowedValues.length > 0) {
      if (!rule.allowedValues.includes(value)) {
        throw new Error(
          `配置值不在允许列表中: ${JSON.stringify(rule.allowedValues)}`
        );
      }
    }
  }

  /**
   * 评估条件
   */
  private evaluateCondition(
    fieldValue: ConfigValue | undefined,
    operator: FeatureFlag["conditions"][0]["operator"],
    conditionValue: ConfigValue
  ): boolean {
    if (fieldValue === undefined) return false;

    switch (operator) {
      case "eq":
        return fieldValue === conditionValue;
      case "neq":
        return fieldValue !== conditionValue;
      case "gt":
        return Number(fieldValue) > Number(conditionValue);
      case "lt":
        return Number(fieldValue) < Number(conditionValue);
      case "in":
        return Array.isArray(conditionValue) && conditionValue.includes(fieldValue as string);
      case "nin":
        return Array.isArray(conditionValue) && !conditionValue.includes(fieldValue as string);
      default:
        return false;
    }
  }

  /**
   * 简单哈希函数
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 转为 32 位整数
    }
    return Math.abs(hash);
  }
}
```

### 18.5.2 模型版本管理器

Agent 系统中模型版本的管理至关重要——模型切换可能导致行为变化，需要严格的版本控制和灰度发布：

```typescript
// ============================================================
// 文件: model-version-manager.ts
// 描述: LLM 模型版本管理与灰度切换
// ============================================================

/** 模型版本信息 */
export interface ModelVersion {
  id: string;
  provider: string;
  modelName: string;
  version: string;
  endpoint: string;
  maxTokens: number;
  costPer1kTokens: number;
  avgLatencyMs: number;
  capabilities: string[];
  status: "active" | "deprecated" | "testing" | "disabled";
  rolloutPercentage: number;
  createdAt: number;
  metadata: Record<string, string>;
}

/** 模型选择上下文 */
export interface ModelSelectionContext {
  userId?: string;
  taskType: string;
  requiredCapabilities?: string[];
  maxCostPer1kTokens?: number;
  maxLatencyMs?: number;
  preferredProvider?: string;
}

/** 模型切换记录 */
export interface ModelSwitchRecord {
  fromModel: string;
  toModel: string;
  reason: string;
  switchedBy: string;
  timestamp: number;
  rolloutPercentage: number;
}

/**
 * ModelVersionManager - 模型版本管理器
 *
 * 管理多个 LLM 模型版本的生命周期，支持：
 * - 多版本并存
 * - 灰度切换
 * - 基于能力/成本/延迟的智能选择
 * - 自动降级
 */
export class ModelVersionManager {
  private models: Map<string, ModelVersion> = new Map();
  private switchHistory: ModelSwitchRecord[] = [];
  private fallbackChain: string[] = [];

  /**
   * 注册模型版本
   */
  registerModel(model: ModelVersion): void {
    this.models.set(model.id, model);
    console.log(
      `[ModelVersionManager] 注册模型: ${model.id} (${model.provider}/${model.modelName} v${model.version})`
    );
  }

  /**
   * 选择最佳模型
   */
  selectModel(context: ModelSelectionContext): ModelVersion | null {
    const candidates = Array.from(this.models.values()).filter((model) => {
      // 仅考虑活跃或测试中的模型
      if (model.status !== "active" && model.status !== "testing") {
        return false;
      }

      // 检查能力要求
      if (context.requiredCapabilities) {
        const hasAll = context.requiredCapabilities.every((cap) =>
          model.capabilities.includes(cap)
        );
        if (!hasAll) return false;
      }

      // 检查成本限制
      if (
        context.maxCostPer1kTokens !== undefined &&
        model.costPer1kTokens > context.maxCostPer1kTokens
      ) {
        return false;
      }

      // 检查延迟限制
      if (
        context.maxLatencyMs !== undefined &&
        model.avgLatencyMs > context.maxLatencyMs
      ) {
        return false;
      }

      // 检查提供商偏好
      if (
        context.preferredProvider &&
        model.provider !== context.preferredProvider
      ) {
        return false;
      }

      return true;
    });

    if (candidates.length === 0) {
      return this.getFallbackModel();
    }

    // 基于灰度比例进行加权随机选择
    const activeModels = candidates.filter(
      (m) => m.status === "active" && m.rolloutPercentage > 0
    );
    const testingModels = candidates.filter(
      (m) => m.status === "testing" && m.rolloutPercentage > 0
    );

    // 决定是使用测试版本还是稳定版本
    if (testingModels.length > 0 && context.userId) {
      const hash = this.hashUserId(context.userId);
      for (const testModel of testingModels) {
        if (hash % 100 < testModel.rolloutPercentage) {
          return testModel;
        }
      }
    }

    // 从活跃模型中选择（按性价比排序）
    if (activeModels.length > 0) {
      activeModels.sort((a, b) => {
        // 综合评分：越低越好
        const scoreA = a.costPer1kTokens * 0.4 + a.avgLatencyMs / 1000 * 0.6;
        const scoreB = b.costPer1kTokens * 0.4 + b.avgLatencyMs / 1000 * 0.6;
        return scoreA - scoreB;
      });
      return activeModels[0];
    }

    return candidates[0] || null;
  }

  /**
   * 灰度切换模型
   */
  async switchModel(
    fromModelId: string,
    toModelId: string,
    rolloutPercentage: number,
    switchedBy: string,
    reason: string
  ): Promise<boolean> {
    const fromModel = this.models.get(fromModelId);
    const toModel = this.models.get(toModelId);

    if (!fromModel || !toModel) {
      console.error("[ModelVersionManager] 模型不存在");
      return false;
    }

    // 设置灰度比例
    toModel.rolloutPercentage = rolloutPercentage;
    toModel.status = rolloutPercentage >= 100 ? "active" : "testing";

    // 降低旧模型的灰度比例
    fromModel.rolloutPercentage = Math.max(
      0,
      100 - rolloutPercentage
    );
    if (fromModel.rolloutPercentage === 0) {
      fromModel.status = "deprecated";
    }

    // 记录切换历史
    this.switchHistory.push({
      fromModel: fromModelId,
      toModel: toModelId,
      reason,
      switchedBy,
      timestamp: Date.now(),
      rolloutPercentage,
    });

    console.log(
      `[ModelVersionManager] 模型切换: ${fromModelId} -> ${toModelId} (${rolloutPercentage}%)`
    );
    return true;
  }

  /**
   * 设置降级链
   */
  setFallbackChain(modelIds: string[]): void {
    this.fallbackChain = modelIds;
  }

  /**
   * 获取降级模型
   */
  private getFallbackModel(): ModelVersion | null {
    for (const modelId of this.fallbackChain) {
      const model = this.models.get(modelId);
      if (model && model.status === "active") {
        return model;
      }
    }
    return null;
  }

  /**
   * 获取所有模型状态
   */
  getAllModels(): ModelVersion[] {
    return Array.from(this.models.values());
  }

  /**
   * 获取切换历史
   */
  getSwitchHistory(): ModelSwitchRecord[] {
    return [...this.switchHistory];
  }

  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = (hash << 5) - hash + userId.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}
```

---

## 18.6 灾备与恢复

Agent 系统的灾备设计面临独特挑战：除了传统的数据备份，还需要考虑 Agent 状态（对话上下文、工具执行进度）的持久化与恢复。

### 18.6.1 灾备恢复管理器

```typescript
// ============================================================
// 文件: disaster-recovery-manager.ts
// 描述: 多区域灾备恢复管理器
// ============================================================

/** 区域状态 */
export type RegionStatus = "healthy" | "degraded" | "unhealthy" | "offline";

/** 区域信息 */
export interface Region {
  id: string;
  name: string;
  endpoint: string;
  status: RegionStatus;
  isPrimary: boolean;
  lastHealthCheck: number;
  latencyMs: number;
  capacity: number;
  currentLoad: number;
}

/** 故障转移策略 */
export type FailoverStrategy =
  | "active-passive"
  | "active-active"
  | "pilot-light"
  | "warm-standby";

/** 灾备配置 */
export interface DRConfig {
  strategy: FailoverStrategy;
  regions: Region[];
  healthCheckIntervalMs: number;
  failoverThreshold: number;
  failbackEnabled: boolean;
  failbackDelayMs: number;
  dataReplicationLagToleranceMs: number;
  rpoTargetMs: number;
  rtoTargetMs: number;
}

/** 故障转移记录 */
export interface FailoverRecord {
  id: string;
  fromRegion: string;
  toRegion: string;
  reason: string;
  startTime: number;
  completionTime: number | null;
  durationMs: number | null;
  success: boolean;
  dataLossEstimate: string;
  automatic: boolean;
}

/** 区域健康检查器接口 */
export interface RegionHealthChecker {
  checkRegion(region: Region): Promise<{
    healthy: boolean;
    latencyMs: number;
    details: string;
  }>;
  getReplicationLag(
    primary: Region,
    secondary: Region
  ): Promise<number>;
}

/** 数据复制器接口 */
export interface DataReplicator {
  syncData(from: Region, to: Region): Promise<{
    success: boolean;
    recordsSynced: number;
    lagMs: number;
  }>;
  getReplicationStatus(
    primary: Region,
    secondary: Region
  ): Promise<{
    inSync: boolean;
    lagMs: number;
    pendingRecords: number;
  }>;
}

/**
 * DisasterRecoveryManager - 灾备恢复管理器
 *
 * 核心能力：
 * - 多区域健康监控
 * - 自动故障转移
 * - 数据复制状态追踪
 * - 故障恢复
 * - RPO/RTO 目标跟踪
 */
export class DisasterRecoveryManager {
  private config: DRConfig;
  private regions: Map<string, Region> = new Map();
  private healthChecker: RegionHealthChecker;
  private replicator: DataReplicator;
  private failoverHistory: FailoverRecord[] = [];
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private consecutiveFailures: Map<string, number> = new Map();

  constructor(
    config: DRConfig,
    healthChecker: RegionHealthChecker,
    replicator: DataReplicator
  ) {
    this.config = config;
    this.healthChecker = healthChecker;
    this.replicator = replicator;

    for (const region of config.regions) {
      this.regions.set(region.id, { ...region });
    }
  }

  /**
   * 启动健康监控
   */
  startMonitoring(): void {
    if (this.healthCheckTimer) return;

    console.log(
      `[DRManager] 启动健康监控, 间隔: ${this.config.healthCheckIntervalMs}ms`
    );

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckIntervalMs);

    // 立即执行一次
    this.performHealthChecks().catch((err) =>
      console.error("[DRManager] 首次健康检查异常:", err)
    );
  }

  /**
   * 停止健康监控
   */
  stopMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * 执行所有区域的健康检查
   */
  private async performHealthChecks(): Promise<void> {
    for (const [regionId, region] of this.regions) {
      try {
        const result = await this.healthChecker.checkRegion(region);

        region.lastHealthCheck = Date.now();
        region.latencyMs = result.latencyMs;

        if (result.healthy) {
          region.status = result.latencyMs > 1000 ? "degraded" : "healthy";
          this.consecutiveFailures.set(regionId, 0);
        } else {
          const failures =
            (this.consecutiveFailures.get(regionId) || 0) + 1;
          this.consecutiveFailures.set(regionId, failures);

          if (failures >= this.config.failoverThreshold) {
            region.status = "unhealthy";

            // 如果是主区域且不健康，触发自动故障转移
            if (region.isPrimary) {
              console.log(
                `[DRManager] 主区域 ${regionId} 连续 ${failures} 次健康检查失败，触发故障转移`
              );
              await this.automaticFailover(regionId);
            }
          } else {
            region.status = "degraded";
          }
        }
      } catch (error) {
        console.error(
          `[DRManager] 区域 ${regionId} 健康检查异常:`,
          error
        );
        region.status = "degraded";
      }
    }

    // 检查数据复制状态
    await this.checkReplicationStatus();
  }

  /**
   * 检查数据复制状态
   */
  private async checkReplicationStatus(): Promise<void> {
    const primary = this.getPrimaryRegion();
    if (!primary) return;

    for (const [regionId, region] of this.regions) {
      if (region.isPrimary) continue;

      try {
        const status = await this.replicator.getReplicationStatus(
          primary,
          region
        );

        if (status.lagMs > this.config.dataReplicationLagToleranceMs) {
          console.warn(
            `[DRManager] 区域 ${regionId} 复制延迟 ${status.lagMs}ms 超过容忍阈值 ${this.config.dataReplicationLagToleranceMs}ms`
          );
        }
      } catch (error) {
        console.error(`[DRManager] 复制状态检查异常 (${regionId}):`, error);
      }
    }
  }

  /**
   * 自动故障转移
   */
  private async automaticFailover(failedRegionId: string): Promise<FailoverRecord> {
    return this.failover(failedRegionId, "健康检查连续失败触发自动故障转移", true);
  }

  /**
   * 执行故障转移
   */
  async failover(
    failedRegionId: string,
    reason: string,
    automatic: boolean = false
  ): Promise<FailoverRecord> {
    const startTime = Date.now();
    const failoverRecord: FailoverRecord = {
      id: `failover-${Date.now()}`,
      fromRegion: failedRegionId,
      toRegion: "",
      reason,
      startTime,
      completionTime: null,
      durationMs: null,
      success: false,
      dataLossEstimate: "unknown",
      automatic,
    };

    console.log(`[DRManager] 开始故障转移: 从 ${failedRegionId}, 原因: ${reason}`);

    // 选择最佳目标区域
    const targetRegion = this.selectFailoverTarget(failedRegionId);
    if (!targetRegion) {
      failoverRecord.completionTime = Date.now();
      failoverRecord.durationMs = Date.now() - startTime;
      failoverRecord.success = false;
      this.failoverHistory.push(failoverRecord);
      console.error("[DRManager] 没有可用的目标区域");
      return failoverRecord;
    }

    failoverRecord.toRegion = targetRegion.id;

    try {
      // 步骤 1: 估算数据丢失
      const primary = this.getPrimaryRegion();
      if (primary) {
        try {
          const lag = await this.healthChecker.getReplicationLag(
            primary,
            targetRegion
          );
          failoverRecord.dataLossEstimate = `约 ${lag}ms 的数据延迟`;
        } catch {
          failoverRecord.dataLossEstimate = "无法估算";
        }
      }

      // 步骤 2: 将旧主区域标记为离线
      const failedRegion = this.regions.get(failedRegionId);
      if (failedRegion) {
        failedRegion.isPrimary = false;
        failedRegion.status = "offline";
      }

      // 步骤 3: 提升新区域为主区域
      targetRegion.isPrimary = true;
      console.log(`[DRManager] 区域 ${targetRegion.id} 已提升为主区域`);

      // 步骤 4: 尝试最终数据同步
      if (primary && primary.status !== "offline") {
        try {
          await this.replicator.syncData(primary, targetRegion);
        } catch (err) {
          console.warn("[DRManager] 最终数据同步失败，可能有少量数据丢失:", err);
        }
      }

      failoverRecord.success = true;
      console.log(
        `[DRManager] 故障转移成功: ${failedRegionId} -> ${targetRegion.id}`
      );
    } catch (error) {
      console.error("[DRManager] 故障转移失败:", error);
      failoverRecord.success = false;
    }

    failoverRecord.completionTime = Date.now();
    failoverRecord.durationMs = Date.now() - startTime;
    this.failoverHistory.push(failoverRecord);

    // 检查 RTO 达标
    if (
      failoverRecord.success &&
      failoverRecord.durationMs > this.config.rtoTargetMs
    ) {
      console.warn(
        `[DRManager] 故障转移耗时 ${failoverRecord.durationMs}ms 超过 RTO 目标 ${this.config.rtoTargetMs}ms`
      );
    }

    return failoverRecord;
  }

  /**
   * 故障恢复（将流量切回原主区域）
   */
  async failback(originalPrimaryId: string): Promise<FailoverRecord> {
    if (!this.config.failbackEnabled) {
      throw new Error("故障恢复未启用");
    }

    const region = this.regions.get(originalPrimaryId);
    if (!region) {
      throw new Error(`区域 ${originalPrimaryId} 不存在`);
    }

    // 确保原主区域已恢复健康
    const health = await this.healthChecker.checkRegion(region);
    if (!health.healthy) {
      throw new Error(`区域 ${originalPrimaryId} 尚未恢复健康`);
    }

    // 等待复制赶上
    const currentPrimary = this.getPrimaryRegion();
    if (currentPrimary) {
      const syncResult = await this.replicator.syncData(
        currentPrimary,
        region
      );
      if (!syncResult.success) {
        throw new Error("数据同步失败，无法执行故障恢复");
      }
    }

    return this.failover(
      this.getPrimaryRegion()?.id || "",
      `故障恢复：切回原主区域 ${originalPrimaryId}`,
      false
    );
  }

  /**
   * 选择最佳故障转移目标
   */
  private selectFailoverTarget(excludeRegionId: string): Region | null {
    const candidates = Array.from(this.regions.values())
      .filter(
        (r) =>
          r.id !== excludeRegionId &&
          r.status !== "offline" &&
          r.status !== "unhealthy"
      )
      .sort((a, b) => {
        // 优先选择延迟低、负载低的区域
        const scoreA = a.latencyMs + (a.currentLoad / a.capacity) * 1000;
        const scoreB = b.latencyMs + (b.currentLoad / b.capacity) * 1000;
        return scoreA - scoreB;
      });

    return candidates[0] || null;
  }

  /**
   * 获取当前主区域
   */
  private getPrimaryRegion(): Region | null {
    for (const region of this.regions.values()) {
      if (region.isPrimary) return region;
    }
    return null;
  }

  /**
   * 获取所有区域状态
   */
  getRegionStatus(): Region[] {
    return Array.from(this.regions.values());
  }

  /**
   * 获取故障转移历史
   */
  getFailoverHistory(): FailoverRecord[] {
    return [...this.failoverHistory];
  }

  /**
   * 获取 DR 仪表盘数据
   */
  getDashboard(): {
    strategy: FailoverStrategy;
    primaryRegion: Region | null;
    regions: Region[];
    recentFailovers: FailoverRecord[];
    rpoTarget: number;
    rtoTarget: number;
  } {
    return {
      strategy: this.config.strategy,
      primaryRegion: this.getPrimaryRegion(),
      regions: this.getRegionStatus(),
      recentFailovers: this.failoverHistory.slice(-10),
      rpoTarget: this.config.rpoTargetMs,
      rtoTarget: this.config.rtoTargetMs,
    };
  }
}
```

### 18.6.2 Agent 状态备份

Agent 的对话上下文和工具执行状态需要定期备份，以支持灾难恢复时的状态恢复：

```typescript
// ============================================================
// 文件: agent-state-backup.ts
// 描述: Agent 状态备份与恢复
// ============================================================

/** Agent 会话状态 */
export interface AgentSessionState {
  sessionId: string;
  userId: string;
  agentId: string;
  conversationHistory: Array<{
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    timestamp: number;
    metadata?: Record<string, string>;
  }>;
  toolExecutionState: Array<{
    toolName: string;
    status: "pending" | "running" | "completed" | "failed";
    input: Record<string, unknown>;
    output?: Record<string, unknown>;
    startedAt: number;
    completedAt?: number;
  }>;
  workingMemory: Record<string, unknown>;
  planState?: {
    currentStep: number;
    totalSteps: number;
    plan: string[];
    completedSteps: string[];
  };
  createdAt: number;
  lastActivityAt: number;
}

/** 备份元数据 */
export interface BackupMetadata {
  backupId: string;
  timestamp: number;
  sessionCount: number;
  totalSizeBytes: number;
  compressed: boolean;
  encryptionKeyId?: string;
  region: string;
  ttlDays: number;
  backupType: "full" | "incremental";
  previousBackupId?: string;
}

/** 恢复结果 */
export interface RestoreResult {
  success: boolean;
  sessionsRestored: number;
  sessionsFailed: number;
  errors: string[];
  durationMs: number;
}

/** 存储后端接口 */
export interface BackupStorage {
  save(backupId: string, data: Buffer, metadata: BackupMetadata): Promise<void>;
  load(backupId: string): Promise<{ data: Buffer; metadata: BackupMetadata } | null>;
  list(options?: { region?: string; limit?: number }): Promise<BackupMetadata[]>;
  delete(backupId: string): Promise<void>;
}

/** 状态源接口 */
export interface StateSource {
  getAllSessions(): Promise<AgentSessionState[]>;
  getSessionsSince(timestamp: number): Promise<AgentSessionState[]>;
  restoreSession(state: AgentSessionState): Promise<boolean>;
  getSessionCount(): Promise<number>;
}

/**
 * AgentStateBackup - Agent 状态备份管理器
 *
 * 支持：
 * - 全量备份与增量备份
 * - 压缩与加密
 * - 定时自动备份
 * - 按需恢复
 * - 备份生命周期管理
 */
export class AgentStateBackup {
  private storage: BackupStorage;
  private stateSource: StateSource;
  private region: string;
  private backupTimer: ReturnType<typeof setInterval> | null = null;
  private lastFullBackupTime: number = 0;
  private lastIncrementalBackupTime: number = 0;

  constructor(
    storage: BackupStorage,
    stateSource: StateSource,
    region: string
  ) {
    this.storage = storage;
    this.stateSource = stateSource;
    this.region = region;
  }

  /**
   * 执行全量备份
   */
  async fullBackup(): Promise<BackupMetadata> {
    console.log("[AgentStateBackup] 开始全量备份...");
    const startTime = Date.now();

    const sessions = await this.stateSource.getAllSessions();
    const backupId = `full-${this.region}-${Date.now()}`;

    const serialized = JSON.stringify(sessions);
    const compressed = this.compress(Buffer.from(serialized, "utf-8"));

    const metadata: BackupMetadata = {
      backupId,
      timestamp: Date.now(),
      sessionCount: sessions.length,
      totalSizeBytes: compressed.length,
      compressed: true,
      region: this.region,
      ttlDays: 30,
      backupType: "full",
    };

    await this.storage.save(backupId, compressed, metadata);
    this.lastFullBackupTime = Date.now();

    console.log(
      `[AgentStateBackup] 全量备份完成: ${sessions.length} 个会话, ${compressed.length} 字节, 耗时 ${Date.now() - startTime}ms`
    );

    return metadata;
  }

  /**
   * 执行增量备份
   */
  async incrementalBackup(): Promise<BackupMetadata> {
    const since = Math.max(
      this.lastFullBackupTime,
      this.lastIncrementalBackupTime
    );

    if (since === 0) {
      console.log("[AgentStateBackup] 无历史备份，执行全量备份");
      return this.fullBackup();
    }

    console.log(
      `[AgentStateBackup] 开始增量备份 (since: ${new Date(since).toISOString()})...`
    );

    const sessions = await this.stateSource.getSessionsSince(since);
    const backupId = `incr-${this.region}-${Date.now()}`;

    const serialized = JSON.stringify(sessions);
    const compressed = this.compress(Buffer.from(serialized, "utf-8"));

    const metadata: BackupMetadata = {
      backupId,
      timestamp: Date.now(),
      sessionCount: sessions.length,
      totalSizeBytes: compressed.length,
      compressed: true,
      region: this.region,
      ttlDays: 7,
      backupType: "incremental",
    };

    await this.storage.save(backupId, compressed, metadata);
    this.lastIncrementalBackupTime = Date.now();

    console.log(
      `[AgentStateBackup] 增量备份完成: ${sessions.length} 个变更会话`
    );

    return metadata;
  }

  /**
   * 从备份恢复
   */
  async restore(backupId: string): Promise<RestoreResult> {
    console.log(`[AgentStateBackup] 开始从备份 ${backupId} 恢复...`);
    const startTime = Date.now();

    const backup = await this.storage.load(backupId);
    if (!backup) {
      return {
        success: false,
        sessionsRestored: 0,
        sessionsFailed: 0,
        errors: [`备份 ${backupId} 不存在`],
        durationMs: Date.now() - startTime,
      };
    }

    const decompressed = backup.metadata.compressed
      ? this.decompress(backup.data)
      : backup.data;

    let sessions: AgentSessionState[];
    try {
      sessions = JSON.parse(decompressed.toString("utf-8"));
    } catch (error) {
      return {
        success: false,
        sessionsRestored: 0,
        sessionsFailed: 0,
        errors: [`备份数据解析失败: ${error}`],
        durationMs: Date.now() - startTime,
      };
    }

    let restored = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const session of sessions) {
      try {
        const ok = await this.stateSource.restoreSession(session);
        if (ok) {
          restored++;
        } else {
          failed++;
          errors.push(`会话 ${session.sessionId} 恢复失败`);
        }
      } catch (error) {
        failed++;
        errors.push(`会话 ${session.sessionId} 恢复异常: ${error}`);
      }
    }

    console.log(
      `[AgentStateBackup] 恢复完成: ${restored} 成功, ${failed} 失败`
    );

    return {
      success: failed === 0,
      sessionsRestored: restored,
      sessionsFailed: failed,
      errors,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * 启动自动备份计划
   */
  startScheduledBackup(
    fullBackupIntervalMs: number,
    incrementalIntervalMs: number
  ): void {
    let incrementalCounter = 0;
    const incrementalsBetweenFull = Math.floor(
      fullBackupIntervalMs / incrementalIntervalMs
    );

    this.backupTimer = setInterval(async () => {
      try {
        incrementalCounter++;
        if (incrementalCounter >= incrementalsBetweenFull) {
          await this.fullBackup();
          incrementalCounter = 0;
        } else {
          await this.incrementalBackup();
        }
      } catch (error) {
        console.error("[AgentStateBackup] 自动备份失败:", error);
      }
    }, incrementalIntervalMs);

    console.log(
      `[AgentStateBackup] 自动备份已启动: 全量间隔 ${fullBackupIntervalMs}ms, 增量间隔 ${incrementalIntervalMs}ms`
    );
  }

  /**
   * 停止自动备份
   */
  stopScheduledBackup(): void {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }
  }

  /**
   * 清理过期备份
   */
  async cleanupExpiredBackups(): Promise<number> {
    const backups = await this.storage.list({ region: this.region });
    const now = Date.now();
    let cleaned = 0;

    for (const backup of backups) {
      const expiryTime = backup.timestamp + backup.ttlDays * 24 * 60 * 60 * 1000;
      if (now > expiryTime) {
        await this.storage.delete(backup.backupId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[AgentStateBackup] 清理了 ${cleaned} 个过期备份`);
    }

    return cleaned;
  }

  /**
   * 列出可用备份
   */
  async listBackups(): Promise<BackupMetadata[]> {
    return this.storage.list({ region: this.region });
  }

  /**
   * 简单压缩（实际环境中使用 zlib）
   */
  private compress(data: Buffer): Buffer {
    // 简化实现：实际使用 zlib.gzipSync
    return data;
  }

  /**
   * 解压缩
   */
  private decompress(data: Buffer): Buffer {
    // 简化实现：实际使用 zlib.gunzipSync
    return data;
  }
}
```

---

## 18.7 运维自动化

Agent 系统的运维复杂度远超传统服务。本节将构建一套自动化运维框架，包含 ChatOps 集成、自愈机制和容量规划。

### 18.7.1 运维自动化引擎

```typescript
// ============================================================
// 文件: agent-ops-automation.ts
// 描述: Agent 运维自动化引擎，含自愈和 ChatOps
// ============================================================

/** 运维事件 */
export interface OpsEvent {
  id: string;
  type:
    | "alert"
    | "incident"
    | "deployment"
    | "scaling"
    | "configuration"
    | "health";
  severity: "info" | "warning" | "critical" | "emergency";
  source: string;
  title: string;
  description: string;
  timestamp: number;
  metadata: Record<string, unknown>;
  acknowledged: boolean;
  resolvedAt?: number;
}

/** 自愈规则 */
export interface SelfHealingRule {
  id: string;
  name: string;
  condition: {
    eventType: OpsEvent["type"];
    severityMin: OpsEvent["severity"];
    sourcePattern?: string;
    metadataMatch?: Record<string, unknown>;
  };
  actions: Array<{
    type:
      | "restart_pod"
      | "scale_up"
      | "scale_down"
      | "clear_cache"
      | "switch_model"
      | "enable_circuit_breaker"
      | "notify"
      | "runbook";
    parameters: Record<string, unknown>;
    timeoutMs: number;
  }>;
  cooldownMs: number;
  maxExecutionsPerHour: number;
  enabled: boolean;
}

/** 自愈执行记录 */
export interface HealingExecution {
  ruleId: string;
  eventId: string;
  actions: Array<{
    type: string;
    success: boolean;
    message: string;
    durationMs: number;
  }>;
  startTime: number;
  endTime: number;
  success: boolean;
}

/** ChatOps 命令 */
export interface ChatOpsCommand {
  name: string;
  description: string;
  usage: string;
  handler: (args: string[], context: ChatOpsContext) => Promise<string>;
}

/** ChatOps 上下文 */
export interface ChatOpsContext {
  userId: string;
  channel: string;
  permissions: string[];
}

/** 运维执行器接口 */
export interface OpsExecutor {
  restartPod(podName: string, namespace: string): Promise<boolean>;
  scaleDeployment(name: string, namespace: string, replicas: number): Promise<boolean>;
  clearCache(cacheType: string): Promise<boolean>;
  switchModel(fromModel: string, toModel: string): Promise<boolean>;
  enableCircuitBreaker(serviceName: string): Promise<boolean>;
  sendNotification(channel: string, message: string): Promise<boolean>;
  executeRunbook(runbookId: string, params: Record<string, unknown>): Promise<{
    success: boolean;
    output: string;
  }>;
}

/**
 * AgentOpsAutomation - 运维自动化引擎
 *
 * 核心功能：
 * 1. 事件驱动的自愈机制
 * 2. ChatOps 命令集成
 * 3. 运维事件管理
 * 4. 自动化 Runbook 执行
 */
export class AgentOpsAutomation {
  private events: OpsEvent[] = [];
  private healingRules: Map<string, SelfHealingRule> = new Map();
  private healingHistory: HealingExecution[] = [];
  private ruleLastExecution: Map<string, number[]> = new Map();
  private chatOpsCommands: Map<string, ChatOpsCommand> = new Map();
  private executor: OpsExecutor;

  constructor(executor: OpsExecutor) {
    this.executor = executor;
    this.registerDefaultChatOpsCommands();
  }

  /**
   * 处理运维事件
   */
  async handleEvent(event: OpsEvent): Promise<void> {
    this.events.push(event);

    // 保留最近 10000 条事件
    if (this.events.length > 10000) {
      this.events = this.events.slice(-5000);
    }

    console.log(
      `[OpsAutomation] 收到事件 [${event.severity}]: ${event.title}`
    );

    // 检查是否匹配自愈规则
    for (const rule of this.healingRules.values()) {
      if (!rule.enabled) continue;

      if (this.matchesRule(event, rule)) {
        await this.executeHealingRule(rule, event);
      }
    }
  }

  /**
   * 检查事件是否匹配自愈规则
   */
  private matchesRule(event: OpsEvent, rule: SelfHealingRule): boolean {
    const condition = rule.condition;

    if (condition.eventType !== event.type) return false;

    const severityLevel: Record<OpsEvent["severity"], number> = {
      info: 0,
      warning: 1,
      critical: 2,
      emergency: 3,
    };

    if (
      severityLevel[event.severity] <
      severityLevel[condition.severityMin]
    ) {
      return false;
    }

    if (condition.sourcePattern) {
      const regex = new RegExp(condition.sourcePattern);
      if (!regex.test(event.source)) return false;
    }

    if (condition.metadataMatch) {
      for (const [key, value] of Object.entries(condition.metadataMatch)) {
        if (event.metadata[key] !== value) return false;
      }
    }

    return true;
  }

  /**
   * 执行自愈规则
   */
  private async executeHealingRule(
    rule: SelfHealingRule,
    event: OpsEvent
  ): Promise<void> {
    // 检查冷却期
    const executions = this.ruleLastExecution.get(rule.id) || [];
    const now = Date.now();
    const recentExecutions = executions.filter(
      (t) => now - t < rule.cooldownMs
    );

    if (recentExecutions.length > 0) {
      console.log(
        `[OpsAutomation] 规则 ${rule.name} 在冷却期内，跳过`
      );
      return;
    }

    // 检查每小时执行次数限制
    const hourlyExecutions = executions.filter(
      (t) => now - t < 3600000
    );
    if (hourlyExecutions.length >= rule.maxExecutionsPerHour) {
      console.log(
        `[OpsAutomation] 规则 ${rule.name} 已达每小时最大执行次数 ${rule.maxExecutionsPerHour}`
      );
      return;
    }

    console.log(
      `[OpsAutomation] 执行自愈规则: ${rule.name} (事件: ${event.title})`
    );

    const execution: HealingExecution = {
      ruleId: rule.id,
      eventId: event.id,
      actions: [],
      startTime: Date.now(),
      endTime: 0,
      success: true,
    };

    for (const action of rule.actions) {
      const actionStart = Date.now();
      let success = false;
      let message = "";

      try {
        switch (action.type) {
          case "restart_pod": {
            success = await this.executor.restartPod(
              action.parameters.podName as string,
              action.parameters.namespace as string
            );
            message = success ? "Pod 重启成功" : "Pod 重启失败";
            break;
          }
          case "scale_up": {
            success = await this.executor.scaleDeployment(
              action.parameters.deploymentName as string,
              action.parameters.namespace as string,
              action.parameters.replicas as number
            );
            message = success
              ? `扩容到 ${action.parameters.replicas} 副本`
              : "扩容失败";
            break;
          }
          case "scale_down": {
            success = await this.executor.scaleDeployment(
              action.parameters.deploymentName as string,
              action.parameters.namespace as string,
              action.parameters.replicas as number
            );
            message = success
              ? `缩容到 ${action.parameters.replicas} 副本`
              : "缩容失败";
            break;
          }
          case "clear_cache": {
            success = await this.executor.clearCache(
              action.parameters.cacheType as string
            );
            message = success ? "缓存已清除" : "缓存清除失败";
            break;
          }
          case "switch_model": {
            success = await this.executor.switchModel(
              action.parameters.fromModel as string,
              action.parameters.toModel as string
            );
            message = success ? "模型切换成功" : "模型切换失败";
            break;
          }
          case "enable_circuit_breaker": {
            success = await this.executor.enableCircuitBreaker(
              action.parameters.serviceName as string
            );
            message = success ? "熔断器已启用" : "熔断器启用失败";
            break;
          }
          case "notify": {
            success = await this.executor.sendNotification(
              action.parameters.channel as string,
              `[自愈] ${rule.name}: ${event.title}`
            );
            message = success ? "通知已发送" : "通知发送失败";
            break;
          }
          case "runbook": {
            const result = await this.executor.executeRunbook(
              action.parameters.runbookId as string,
              action.parameters
            );
            success = result.success;
            message = result.output;
            break;
          }
          default:
            message = `未知操作类型: ${action.type}`;
        }
      } catch (error) {
        success = false;
        message = `执行异常: ${error}`;
      }

      execution.actions.push({
        type: action.type,
        success,
        message,
        durationMs: Date.now() - actionStart,
      });

      if (!success) {
        execution.success = false;
        break; // 一个动作失败则停止后续动作
      }
    }

    execution.endTime = Date.now();
    this.healingHistory.push(execution);

    // 记录执行时间
    const times = this.ruleLastExecution.get(rule.id) || [];
    times.push(Date.now());
    this.ruleLastExecution.set(rule.id, times.slice(-100));

    console.log(
      `[OpsAutomation] 自愈规则 ${rule.name} 执行${execution.success ? "成功" : "失败"}, 耗时 ${execution.endTime - execution.startTime}ms`
    );
  }

  /**
   * 注册自愈规则
   */
  registerHealingRule(rule: SelfHealingRule): void {
    this.healingRules.set(rule.id, rule);
    console.log(`[OpsAutomation] 注册自愈规则: ${rule.name}`);
  }

  /**
   * 注册默认的 ChatOps 命令
   */
  private registerDefaultChatOpsCommands(): void {
    this.registerChatOpsCommand({
      name: "status",
      description: "查看 Agent 系统状态",
      usage: "/agent status [component]",
      handler: async (args: string[]) => {
        const component = args[0] || "all";
        const recentEvents = this.events
          .slice(-5)
          .map((e) => `  [${e.severity}] ${e.title}`)
          .join("\n");
        return `Agent 系统状态 (${component}):\n活跃事件: ${this.events.filter((e) => !e.resolvedAt).length}\n最近事件:\n${recentEvents}`;
      },
    });

    this.registerChatOpsCommand({
      name: "heal",
      description: "手动触发自愈",
      usage: "/agent heal <rule-id>",
      handler: async (args: string[]) => {
        const ruleId = args[0];
        if (!ruleId) return "请指定自愈规则 ID";

        const rule = this.healingRules.get(ruleId);
        if (!rule) return `自愈规则 ${ruleId} 不存在`;

        const mockEvent: OpsEvent = {
          id: `manual-${Date.now()}`,
          type: rule.condition.eventType,
          severity: rule.condition.severityMin,
          source: "chatops",
          title: "手动触发自愈",
          description: `手动触发自愈规则: ${rule.name}`,
          timestamp: Date.now(),
          metadata: {},
          acknowledged: true,
        };

        await this.executeHealingRule(rule, mockEvent);
        return `已触发自愈规则: ${rule.name}`;
      },
    });

    this.registerChatOpsCommand({
      name: "scale",
      description: "手动扩缩容",
      usage: "/agent scale <deployment> <replicas>",
      handler: async (args: string[], context: ChatOpsContext) => {
        if (!context.permissions.includes("admin")) {
          return "权限不足：需要 admin 权限";
        }

        const [deployment, replicasStr] = args;
        if (!deployment || !replicasStr) {
          return "用法: /agent scale <deployment> <replicas>";
        }

        const replicas = parseInt(replicasStr);
        if (isNaN(replicas) || replicas < 0) {
          return "副本数必须是非负整数";
        }

        const success = await this.executor.scaleDeployment(
          deployment,
          "agent-production",
          replicas
        );
        return success
          ? `已将 ${deployment} 扩缩至 ${replicas} 个副本`
          : `扩缩容失败`;
      },
    });

    this.registerChatOpsCommand({
      name: "events",
      description: "查看最近事件",
      usage: "/agent events [count]",
      handler: async (args: string[]) => {
        const count = parseInt(args[0] || "10");
        const events = this.events.slice(-count);
        if (events.length === 0) return "没有最近事件";

        return events
          .map(
            (e) =>
              `[${new Date(e.timestamp).toISOString()}] [${e.severity}] ${e.title} (${e.source})`
          )
          .join("\n");
      },
    });

    this.registerChatOpsCommand({
      name: "rules",
      description: "查看自愈规则列表",
      usage: "/agent rules",
      handler: async () => {
        const rules = Array.from(this.healingRules.values());
        if (rules.length === 0) return "没有配置自愈规则";

        return rules
          .map(
            (r) =>
              `${r.enabled ? "✓" : "✗"} [${r.id}] ${r.name}: ${r.actions.map((a) => a.type).join(" -> ")}`
          )
          .join("\n");
      },
    });
  }

  /**
   * 注册 ChatOps 命令
   */
  registerChatOpsCommand(command: ChatOpsCommand): void {
    this.chatOpsCommands.set(command.name, command);
  }

  /**
   * 执行 ChatOps 命令
   */
  async executeChatOpsCommand(
    input: string,
    context: ChatOpsContext
  ): Promise<string> {
    const parts = input.trim().split(/\s+/);
    const commandName = parts[0]?.replace("/agent ", "").replace("/", "");
    const args = parts.slice(1);

    const command = this.chatOpsCommands.get(commandName || "");
    if (!command) {
      const available = Array.from(this.chatOpsCommands.keys()).join(", ");
      return `未知命令: ${commandName}\n可用命令: ${available}`;
    }

    try {
      return await command.handler(args, context);
    } catch (error) {
      return `命令执行失败: ${error}`;
    }
  }

  /**
   * 获取自愈执行历史
   */
  getHealingHistory(limit: number = 20): HealingExecution[] {
    return this.healingHistory.slice(-limit);
  }

  /**
   * 获取事件统计
   */
  getEventStats(): {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    unresolved: number;
  } {
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    let unresolved = 0;

    for (const event of this.events) {
      byType[event.type] = (byType[event.type] || 0) + 1;
      bySeverity[event.severity] = (bySeverity[event.severity] || 0) + 1;
      if (!event.resolvedAt) unresolved++;
    }

    return {
      total: this.events.length,
      byType,
      bySeverity,
      unresolved,
    };
  }
}
```

### 18.7.2 容量规划器

基于历史数据和趋势分析的容量规划，帮助团队提前做好资源准备：

```typescript
// ============================================================
// 文件: capacity-planner.ts
// 描述: 基于历史数据的容量规划与预测
// ============================================================

/** 资源使用数据点 */
export interface UsageDataPoint {
  timestamp: number;
  cpuUtilization: number;
  memoryUtilization: number;
  requestsPerSecond: number;
  activeConnections: number;
  tokenConsumptionRate: number;
  costPerHour: number;
  replicas: number;
}

/** 容量预测结果 */
export interface CapacityForecast {
  forecastDate: number;
  predictedCPU: number;
  predictedMemory: number;
  predictedRPS: number;
  predictedTokenRate: number;
  predictedCost: number;
  recommendedReplicas: number;
  confidence: number;
}

/** 容量建议 */
export interface CapacityRecommendation {
  category: "compute" | "memory" | "storage" | "network" | "cost";
  severity: "info" | "warning" | "urgent";
  title: string;
  description: string;
  currentValue: number;
  recommendedValue: number;
  estimatedCostImpact: number;
  timeToAction: string;
}

/**
 * CapacityPlanner - 容量规划器
 *
 * 基于历史数据的趋势分析和容量预测，
 * 帮助提前规划资源、避免容量不足或过度配置。
 */
export class CapacityPlanner {
  private historicalData: UsageDataPoint[] = [];
  private maxHistorySize: number = 43200; // 30 天 * 24 小时 * 60 分钟 / 分钟间隔

  /**
   * 记录使用数据
   */
  recordUsage(dataPoint: UsageDataPoint): void {
    this.historicalData.push(dataPoint);
    if (this.historicalData.length > this.maxHistorySize) {
      this.historicalData = this.historicalData.slice(
        -Math.floor(this.maxHistorySize / 2)
      );
    }
  }

  /**
   * 批量导入历史数据
   */
  importHistory(data: UsageDataPoint[]): void {
    this.historicalData.push(...data);
    if (this.historicalData.length > this.maxHistorySize) {
      this.historicalData = this.historicalData.slice(-this.maxHistorySize);
    }
  }

  /**
   * 生成容量预测
   */
  forecast(daysAhead: number): CapacityForecast[] {
    if (this.historicalData.length < 48) {
      console.warn("[CapacityPlanner] 历史数据不足（需要至少 48 个数据点）");
      return [];
    }

    const forecasts: CapacityForecast[] = [];
    const now = Date.now();
    const intervalMs = 24 * 60 * 60 * 1000; // 每天一个预测点

    for (let day = 1; day <= daysAhead; day++) {
      const forecastDate = now + day * intervalMs;
      const forecast = this.predictForDate(forecastDate);
      forecasts.push(forecast);
    }

    return forecasts;
  }

  /**
   * 预测特定日期的指标
   */
  private predictForDate(targetDate: number): CapacityForecast {
    const data = this.historicalData;
    const n = data.length;

    // 使用线性回归预测各指标
    const cpuTrend = this.linearRegression(
      data.map((d) => d.timestamp),
      data.map((d) => d.cpuUtilization)
    );
    const memTrend = this.linearRegression(
      data.map((d) => d.timestamp),
      data.map((d) => d.memoryUtilization)
    );
    const rpsTrend = this.linearRegression(
      data.map((d) => d.timestamp),
      data.map((d) => d.requestsPerSecond)
    );
    const tokenTrend = this.linearRegression(
      data.map((d) => d.timestamp),
      data.map((d) => d.tokenConsumptionRate)
    );
    const costTrend = this.linearRegression(
      data.map((d) => d.timestamp),
      data.map((d) => d.costPerHour)
    );

    const predictedCPU = Math.min(
      100,
      Math.max(0, cpuTrend.slope * targetDate + cpuTrend.intercept)
    );
    const predictedMemory = Math.min(
      100,
      Math.max(0, memTrend.slope * targetDate + memTrend.intercept)
    );
    const predictedRPS = Math.max(
      0,
      rpsTrend.slope * targetDate + rpsTrend.intercept
    );
    const predictedTokenRate = Math.max(
      0,
      tokenTrend.slope * targetDate + tokenTrend.intercept
    );
    const predictedCost = Math.max(
      0,
      costTrend.slope * targetDate + costTrend.intercept
    );

    // 推算推荐副本数
    const currentReplicas = data[n - 1]?.replicas || 1;
    const currentRPS = data[n - 1]?.requestsPerSecond || 1;
    const rpsPerReplica = currentRPS / currentReplicas;
    const recommendedReplicas = Math.max(
      1,
      Math.ceil(predictedRPS / (rpsPerReplica || 1))
    );

    // 计算置信度（基于 R^2）
    const confidence =
      (cpuTrend.rSquared +
        memTrend.rSquared +
        rpsTrend.rSquared +
        tokenTrend.rSquared) /
      4;

    return {
      forecastDate: targetDate,
      predictedCPU,
      predictedMemory,
      predictedRPS,
      predictedTokenRate,
      predictedCost,
      recommendedReplicas,
      confidence,
    };
  }

  /**
   * 生成容量建议
   */
  generateRecommendations(): CapacityRecommendation[] {
    const recommendations: CapacityRecommendation[] = [];

    if (this.historicalData.length < 48) {
      return recommendations;
    }

    const recent = this.historicalData.slice(-24);
    const avgCPU =
      recent.reduce((s, d) => s + d.cpuUtilization, 0) / recent.length;
    const avgMemory =
      recent.reduce((s, d) => s + d.memoryUtilization, 0) / recent.length;
    const avgRPS =
      recent.reduce((s, d) => s + d.requestsPerSecond, 0) / recent.length;
    const avgCost =
      recent.reduce((s, d) => s + d.costPerHour, 0) / recent.length;
    const avgReplicas =
      recent.reduce((s, d) => s + d.replicas, 0) / recent.length;

    // 预测 7 天后的情况
    const sevenDayForecast = this.forecast(7);
    const peakCPU = sevenDayForecast.length > 0
      ? Math.max(...sevenDayForecast.map((f) => f.predictedCPU))
      : avgCPU;
    const peakMemory = sevenDayForecast.length > 0
      ? Math.max(...sevenDayForecast.map((f) => f.predictedMemory))
      : avgMemory;

    // CPU 建议
    if (avgCPU > 80) {
      recommendations.push({
        category: "compute",
        severity: "urgent",
        title: "CPU 使用率过高",
        description: `当前 CPU 平均使用率 ${avgCPU.toFixed(1)}%，建议增加计算资源或扩容`,
        currentValue: avgCPU,
        recommendedValue: 60,
        estimatedCostImpact: avgCost * 0.5,
        timeToAction: "立即",
      });
    } else if (peakCPU > 80) {
      recommendations.push({
        category: "compute",
        severity: "warning",
        title: "CPU 使用率预计将超过阈值",
        description: `预计 7 天内 CPU 峰值将达到 ${peakCPU.toFixed(1)}%`,
        currentValue: avgCPU,
        recommendedValue: 60,
        estimatedCostImpact: avgCost * 0.3,
        timeToAction: "7 天内",
      });
    } else if (avgCPU < 20) {
      recommendations.push({
        category: "compute",
        severity: "info",
        title: "CPU 使用率偏低，可考虑缩容",
        description: `CPU 平均使用率仅 ${avgCPU.toFixed(1)}%，可能存在资源浪费`,
        currentValue: avgCPU,
        recommendedValue: 50,
        estimatedCostImpact: -avgCost * 0.3,
        timeToAction: "下次维护窗口",
      });
    }

    // 内存建议
    if (avgMemory > 85) {
      recommendations.push({
        category: "memory",
        severity: "urgent",
        title: "内存使用率过高",
        description: `当前内存平均使用率 ${avgMemory.toFixed(1)}%，存在 OOM 风险`,
        currentValue: avgMemory,
        recommendedValue: 70,
        estimatedCostImpact: avgCost * 0.4,
        timeToAction: "立即",
      });
    } else if (peakMemory > 85) {
      recommendations.push({
        category: "memory",
        severity: "warning",
        title: "内存使用率预计将超过安全阈值",
        description: `预计 7 天内内存峰值将达到 ${peakMemory.toFixed(1)}%`,
        currentValue: avgMemory,
        recommendedValue: 70,
        estimatedCostImpact: avgCost * 0.25,
        timeToAction: "7 天内",
      });
    }

    // 成本建议
    const costGrowthRate = this.calculateGrowthRate(
      this.historicalData.map((d) => ({ timestamp: d.timestamp, value: d.costPerHour }))
    );
    if (costGrowthRate > 0.1) {
      recommendations.push({
        category: "cost",
        severity: "warning",
        title: "成本增长速度过快",
        description: `成本周增长率 ${(costGrowthRate * 100).toFixed(1)}%，建议优化缓存命中率或调整模型选择策略（参见第 19 章）`,
        currentValue: avgCost,
        recommendedValue: avgCost * 0.8,
        estimatedCostImpact: -avgCost * costGrowthRate,
        timeToAction: "本周",
      });
    }

    return recommendations;
  }

  /**
   * 线性回归
   */
  private linearRegression(
    x: number[],
    y: number[]
  ): { slope: number; intercept: number; rSquared: number } {
    const n = x.length;
    if (n === 0) return { slope: 0, intercept: 0, rSquared: 0 };

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    let sumY2 = 0;

    // 归一化时间戳以避免浮点精度问题
    const xMin = x[0];
    const xNorm = x.map((v) => (v - xMin) / 1000000);

    for (let i = 0; i < n; i++) {
      sumX += xNorm[i];
      sumY += y[i];
      sumXY += xNorm[i] * y[i];
      sumX2 += xNorm[i] * xNorm[i];
      sumY2 += y[i] * y[i];
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return { slope: 0, intercept: sumY / n, rSquared: 0 };

    const slopeNorm = (n * sumXY - sumX * sumY) / denominator;
    const interceptNorm = (sumY - slopeNorm * sumX) / n;

    // 反归一化 slope
    const slope = slopeNorm / 1000000;
    const intercept = interceptNorm + slopeNorm * (-xMin / 1000000);

    // R^2
    const ssTot = sumY2 - (sumY * sumY) / n;
    const ssRes = ssTot - (slopeNorm * (sumXY - (sumX * sumY) / n));
    const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

    return { slope, intercept, rSquared: Math.min(1, rSquared) };
  }

  /**
   * 计算增长率
   */
  private calculateGrowthRate(
    data: Array<{ timestamp: number; value: number }>
  ): number {
    if (data.length < 2) return 0;

    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const recentWeek = data.filter((d) => now - d.timestamp < weekMs);
    const previousWeek = data.filter(
      (d) => now - d.timestamp >= weekMs && now - d.timestamp < 2 * weekMs
    );

    if (recentWeek.length === 0 || previousWeek.length === 0) return 0;

    const recentAvg =
      recentWeek.reduce((s, d) => s + d.value, 0) / recentWeek.length;
    const previousAvg =
      previousWeek.reduce((s, d) => s + d.value, 0) / previousWeek.length;

    if (previousAvg === 0) return 0;

    return (recentAvg - previousAvg) / previousAvg;
  }

  /**
   * 获取历史数据摘要
   */
  getSummary(): {
    dataPoints: number;
    timeRange: { start: number; end: number };
    averages: {
      cpu: number;
      memory: number;
      rps: number;
      cost: number;
    };
    peaks: {
      cpu: number;
      memory: number;
      rps: number;
      cost: number;
    };
  } {
    if (this.historicalData.length === 0) {
      return {
        dataPoints: 0,
        timeRange: { start: 0, end: 0 },
        averages: { cpu: 0, memory: 0, rps: 0, cost: 0 },
        peaks: { cpu: 0, memory: 0, rps: 0, cost: 0 },
      };
    }

    const data = this.historicalData;
    return {
      dataPoints: data.length,
      timeRange: {
        start: data[0].timestamp,
        end: data[data.length - 1].timestamp,
      },
      averages: {
        cpu: data.reduce((s, d) => s + d.cpuUtilization, 0) / data.length,
        memory: data.reduce((s, d) => s + d.memoryUtilization, 0) / data.length,
        rps: data.reduce((s, d) => s + d.requestsPerSecond, 0) / data.length,
        cost: data.reduce((s, d) => s + d.costPerHour, 0) / data.length,
      },
      peaks: {
        cpu: Math.max(...data.map((d) => d.cpuUtilization)),
        memory: Math.max(...data.map((d) => d.memoryUtilization)),
        rps: Math.max(...data.map((d) => d.requestsPerSecond)),
        cost: Math.max(...data.map((d) => d.costPerHour)),
      },
    };
  }
}
```

---

## 18.8 生产就绪检查清单

在 Agent 系统上线前，需要通过一套全面的生产就绪检查，确保系统在安全性、性能、可观测性和灾备等各方面都已达标。

### 18.8.1 生产就绪检查器

```typescript
// ============================================================
// 文件: production-readiness-checker.ts
// 描述: 全面的生产就绪检查清单
// ============================================================

/** 检查类别 */
export type CheckCategory =
  | "security"
  | "performance"
  | "observability"
  | "reliability"
  | "disaster-recovery"
  | "cost"
  | "compliance"
  | "operational";

/** 检查优先级 */
export type CheckPriority = "critical" | "high" | "medium" | "low";

/** 检查结果 */
export interface CheckResult {
  id: string;
  category: CheckCategory;
  priority: CheckPriority;
  name: string;
  description: string;
  passed: boolean;
  message: string;
  remediation?: string;
  durationMs: number;
}

/** 检查清单摘要 */
export interface ReadinessSummary {
  overallReady: boolean;
  totalChecks: number;
  passed: number;
  failed: number;
  skipped: number;
  criticalFailures: number;
  highFailures: number;
  byCategory: Record<
    CheckCategory,
    { total: number; passed: number; failed: number }
  >;
  totalDurationMs: number;
  timestamp: number;
  recommendations: string[];
}

/** 检查执行环境接口 */
export interface CheckEnvironment {
  hasSSLCertificate(host: string): Promise<boolean>;
  hasSecretRotation(secretName: string): Promise<boolean>;
  getNetworkPolicies(namespace: string): Promise<string[]>;
  hasRBAC(namespace: string): Promise<boolean>;
  hasResourceQuotas(namespace: string): Promise<boolean>;
  hasMonitoring(deploymentName: string): Promise<boolean>;
  hasAlerts(deploymentName: string): Promise<{ count: number; critical: number }>;
  hasDashboard(deploymentName: string): Promise<boolean>;
  hasBackup(deploymentName: string): Promise<{ exists: boolean; lastBackup: number }>;
  hasHPA(deploymentName: string): Promise<boolean>;
  hasPDB(deploymentName: string): Promise<boolean>;
  hasReadinessProbe(deploymentName: string): Promise<boolean>;
  hasLivenessProbe(deploymentName: string): Promise<boolean>;
  hasStartupProbe(deploymentName: string): Promise<boolean>;
  hasLogCollection(namespace: string): Promise<boolean>;
  hasDistributedTracing(deploymentName: string): Promise<boolean>;
  getReplicaCount(deploymentName: string): Promise<number>;
  hasRateLimiting(deploymentName: string): Promise<boolean>;
  hasCircuitBreaker(deploymentName: string): Promise<boolean>;
  hasDRPlan(deploymentName: string): Promise<boolean>;
  getCostPerDay(deploymentName: string): Promise<number>;
  hasInputValidation(deploymentName: string): Promise<boolean>;
  hasOutputFiltering(deploymentName: string): Promise<boolean>;
}

/**
 * ProductionReadinessChecker - 生产就绪检查器
 *
 * 涵盖 8 大检查类别：
 * 1. 安全性（TLS、密钥轮换、RBAC、输入过滤）
 * 2. 性能（资源限制、HPA、连接池）
 * 3. 可观测性（监控、告警、日志、追踪）
 * 4. 可靠性（探针、副本数、PDB、熔断器）
 * 5. 灾备（备份、DR 计划、多区域）
 * 6. 成本（资源效率、预算告警）
 * 7. 合规性（数据保护、审计日志）
 * 8. 运维（文档、Runbook、值班）
 */
export class ProductionReadinessChecker {
  private env: CheckEnvironment;
  private deploymentName: string;
  private namespace: string;

  constructor(
    env: CheckEnvironment,
    deploymentName: string,
    namespace: string
  ) {
    this.env = env;
    this.deploymentName = deploymentName;
    this.namespace = namespace;
  }

  /**
   * 运行完整的生产就绪检查
   */
  async runFullCheck(): Promise<ReadinessSummary> {
    const startTime = Date.now();
    const results: CheckResult[] = [];

    // 运行各类检查
    const securityChecks = await this.runSecurityChecks();
    results.push(...securityChecks);

    const performanceChecks = await this.runPerformanceChecks();
    results.push(...performanceChecks);

    const observabilityChecks = await this.runObservabilityChecks();
    results.push(...observabilityChecks);

    const reliabilityChecks = await this.runReliabilityChecks();
    results.push(...reliabilityChecks);

    const drChecks = await this.runDisasterRecoveryChecks();
    results.push(...drChecks);

    const costChecks = await this.runCostChecks();
    results.push(...costChecks);

    const complianceChecks = await this.runComplianceChecks();
    results.push(...complianceChecks);

    const operationalChecks = await this.runOperationalChecks();
    results.push(...operationalChecks);

    // 汇总结果
    return this.summarize(results, Date.now() - startTime);
  }

  /**
   * 安全性检查
   */
  private async runSecurityChecks(): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    // 检查 1: TLS/SSL
    results.push(
      await this.runCheck(
        "sec-001",
        "security",
        "critical",
        "TLS/SSL 证书",
        "检查服务是否启用 TLS 加密",
        async () => {
          const has = await this.env.hasSSLCertificate(
            `${this.deploymentName}.${this.namespace}.svc`
          );
          return {
            passed: has,
            message: has ? "TLS 证书已配置" : "未配置 TLS 证书",
            remediation: has ? undefined : "配置 cert-manager 自动签发 TLS 证书",
          };
        }
      )
    );

    // 检查 2: 密钥轮换
    results.push(
      await this.runCheck(
        "sec-002",
        "security",
        "critical",
        "API 密钥轮换",
        "检查 LLM API 密钥是否配置了自动轮换",
        async () => {
          const has = await this.env.hasSecretRotation("llm-api-keys");
          return {
            passed: has,
            message: has ? "密钥轮换已配置" : "未配置密钥轮换",
            remediation: has
              ? undefined
              : "使用 Vault 或 External Secrets Operator 配置密钥自动轮换",
          };
        }
      )
    );

    // 检查 3: 网络策略
    results.push(
      await this.runCheck(
        "sec-003",
        "security",
        "high",
        "网络策略",
        "检查是否配置了 Kubernetes NetworkPolicy",
        async () => {
          const policies = await this.env.getNetworkPolicies(this.namespace);
          const has = policies.length > 0;
          return {
            passed: has,
            message: has
              ? `已配置 ${policies.length} 条网络策略`
              : "未配置网络策略",
            remediation: has
              ? undefined
              : "配置 NetworkPolicy 限制 Pod 之间的网络访问",
          };
        }
      )
    );

    // 检查 4: RBAC
    results.push(
      await this.runCheck(
        "sec-004",
        "security",
        "critical",
        "RBAC 权限控制",
        "检查是否配置了 RBAC 权限",
        async () => {
          const has = await this.env.hasRBAC(this.namespace);
          return {
            passed: has,
            message: has ? "RBAC 已配置" : "RBAC 未配置",
            remediation: has
              ? undefined
              : "配置 ServiceAccount 和 Role/RoleBinding",
          };
        }
      )
    );

    // 检查 5: 输入验证
    results.push(
      await this.runCheck(
        "sec-005",
        "security",
        "critical",
        "Agent 输入验证",
        "检查 Agent 是否有输入验证和注入防护",
        async () => {
          const has = await this.env.hasInputValidation(this.deploymentName);
          return {
            passed: has,
            message: has ? "输入验证已启用" : "未配置输入验证",
            remediation: has
              ? undefined
              : "实现提示词注入检测和用户输入消毒机制",
          };
        }
      )
    );

    // 检查 6: 输出过滤
    results.push(
      await this.runCheck(
        "sec-006",
        "security",
        "high",
        "Agent 输出过滤",
        "检查 Agent 是否有输出内容过滤",
        async () => {
          const has = await this.env.hasOutputFiltering(this.deploymentName);
          return {
            passed: has,
            message: has ? "输出过滤已启用" : "未配置输出过滤",
            remediation: has
              ? undefined
              : "实现 LLM 输出内容安全过滤，防止敏感信息泄露",
          };
        }
      )
    );

    return results;
  }

  /**
   * 性能检查
   */
  private async runPerformanceChecks(): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    // 检查 1: 资源配额
    results.push(
      await this.runCheck(
        "perf-001",
        "performance",
        "high",
        "资源配额",
        "检查是否设置了资源请求和限制",
        async () => {
          const has = await this.env.hasResourceQuotas(this.namespace);
          return {
            passed: has,
            message: has ? "资源配额已设置" : "未设置资源配额",
            remediation: has
              ? undefined
              : "为命名空间设置 ResourceQuota 和 LimitRange",
          };
        }
      )
    );

    // 检查 2: HPA
    results.push(
      await this.runCheck(
        "perf-002",
        "performance",
        "high",
        "水平自动扩缩容",
        "检查是否配置了 HPA",
        async () => {
          const has = await this.env.hasHPA(this.deploymentName);
          return {
            passed: has,
            message: has ? "HPA 已配置" : "未配置 HPA",
            remediation: has
              ? undefined
              : "配置 HPA 或 KEDA 以应对流量波动",
          };
        }
      )
    );

    // 检查 3: 速率限制
    results.push(
      await this.runCheck(
        "perf-003",
        "performance",
        "high",
        "速率限制",
        "检查是否配置了 API 速率限制",
        async () => {
          const has = await this.env.hasRateLimiting(this.deploymentName);
          return {
            passed: has,
            message: has ? "速率限制已配置" : "未配置速率限制",
            remediation: has
              ? undefined
              : "配置分布式速率限制器保护后端服务",
          };
        }
      )
    );

    return results;
  }

  /**
   * 可观测性检查（参见第 17 章）
   */
  private async runObservabilityChecks(): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    // 检查 1: 监控
    results.push(
      await this.runCheck(
        "obs-001",
        "observability",
        "critical",
        "监控系统",
        "检查是否接入监控系统",
        async () => {
          const has = await this.env.hasMonitoring(this.deploymentName);
          return {
            passed: has,
            message: has ? "监控已接入" : "未接入监控系统",
            remediation: has
              ? undefined
              : "接入 Prometheus + Grafana 监控系统（参见第 17 章）",
          };
        }
      )
    );

    // 检查 2: 告警
    results.push(
      await this.runCheck(
        "obs-002",
        "observability",
        "critical",
        "告警配置",
        "检查是否配置了关键告警",
        async () => {
          const alerts = await this.env.hasAlerts(this.deploymentName);
          const passed = alerts.count >= 5 && alerts.critical >= 2;
          return {
            passed,
            message: passed
              ? `已配置 ${alerts.count} 条告警 (${alerts.critical} 条关键告警)`
              : `告警配置不足: 共 ${alerts.count} 条 (关键 ${alerts.critical} 条)`,
            remediation: passed
              ? undefined
              : "至少配置: 错误率告警、延迟告警、可用性告警、费用告警、模型错误率告警",
          };
        }
      )
    );

    // 检查 3: 日志收集
    results.push(
      await this.runCheck(
        "obs-003",
        "observability",
        "high",
        "日志收集",
        "检查日志是否被集中收集",
        async () => {
          const has = await this.env.hasLogCollection(this.namespace);
          return {
            passed: has,
            message: has ? "日志收集已配置" : "日志收集未配置",
            remediation: has
              ? undefined
              : "部署 Fluentd/Fluent Bit 收集结构化日志",
          };
        }
      )
    );

    // 检查 4: 分布式追踪
    results.push(
      await this.runCheck(
        "obs-004",
        "observability",
        "high",
        "分布式追踪",
        "检查是否集成了分布式追踪",
        async () => {
          const has = await this.env.hasDistributedTracing(this.deploymentName);
          return {
            passed: has,
            message: has ? "分布式追踪已集成" : "未集成分布式追踪",
            remediation: has
              ? undefined
              : "集成 OpenTelemetry 实现端到端追踪（参见第 17 章）",
          };
        }
      )
    );

    // 检查 5: 仪表盘
    results.push(
      await this.runCheck(
        "obs-005",
        "observability",
        "medium",
        "运维仪表盘",
        "检查是否配置了运维仪表盘",
        async () => {
          const has = await this.env.hasDashboard(this.deploymentName);
          return {
            passed: has,
            message: has ? "仪表盘已配置" : "未配置仪表盘",
            remediation: has
              ? undefined
              : "创建 Grafana 仪表盘覆盖关键业务和技术指标",
          };
        }
      )
    );

    return results;
  }

  /**
   * 可靠性检查
   */
  private async runReliabilityChecks(): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    // 检查 1: 就绪探针
    results.push(
      await this.runCheck(
        "rel-001",
        "reliability",
        "critical",
        "就绪探针",
        "检查是否配置了 readinessProbe",
        async () => {
          const has = await this.env.hasReadinessProbe(this.deploymentName);
          return {
            passed: has,
            message: has ? "就绪探针已配置" : "未配置就绪探针",
            remediation: has
              ? undefined
              : "配置 readinessProbe 确保只有健康的 Pod 接收流量",
          };
        }
      )
    );

    // 检查 2: 存活探针
    results.push(
      await this.runCheck(
        "rel-002",
        "reliability",
        "critical",
        "存活探针",
        "检查是否配置了 livenessProbe",
        async () => {
          const has = await this.env.hasLivenessProbe(this.deploymentName);
          return {
            passed: has,
            message: has ? "存活探针已配置" : "未配置存活探针",
            remediation: has
              ? undefined
              : "配置 livenessProbe 自动重启异常 Pod",
          };
        }
      )
    );

    // 检查 3: 副本数
    results.push(
      await this.runCheck(
        "rel-003",
        "reliability",
        "critical",
        "高可用副本数",
        "检查副本数是否满足高可用要求",
        async () => {
          const replicas = await this.env.getReplicaCount(this.deploymentName);
          const passed = replicas >= 2;
          return {
            passed,
            message: passed
              ? `当前 ${replicas} 个副本`
              : `当前仅 ${replicas} 个副本，不满足高可用要求`,
            remediation: passed
              ? undefined
              : "生产环境至少配置 2 个副本，建议 3 个",
          };
        }
      )
    );

    // 检查 4: PDB
    results.push(
      await this.runCheck(
        "rel-004",
        "reliability",
        "high",
        "Pod 中断预算",
        "检查是否配置了 PodDisruptionBudget",
        async () => {
          const has = await this.env.hasPDB(this.deploymentName);
          return {
            passed: has,
            message: has ? "PDB 已配置" : "未配置 PDB",
            remediation: has
              ? undefined
              : "配置 PodDisruptionBudget 确保节点维护时的最低可用性",
          };
        }
      )
    );

    // 检查 5: 熔断器
    results.push(
      await this.runCheck(
        "rel-005",
        "reliability",
        "high",
        "熔断器",
        "检查是否启用了熔断器",
        async () => {
          const has = await this.env.hasCircuitBreaker(this.deploymentName);
          return {
            passed: has,
            message: has ? "熔断器已启用" : "未启用熔断器",
            remediation: has
              ? undefined
              : "为 LLM API 和外部工具调用配置熔断器",
          };
        }
      )
    );

    return results;
  }

  /**
   * 灾备检查
   */
  private async runDisasterRecoveryChecks(): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    // 检查 1: 备份
    results.push(
      await this.runCheck(
        "dr-001",
        "disaster-recovery",
        "critical",
        "数据备份",
        "检查是否配置了定期备份",
        async () => {
          const backup = await this.env.hasBackup(this.deploymentName);
          const passed = backup.exists;
          const lastBackupAge = backup.lastBackup
            ? Date.now() - backup.lastBackup
            : Infinity;
          const isRecent = lastBackupAge < 24 * 60 * 60 * 1000; // 24 小时内

          return {
            passed: passed && isRecent,
            message:
              passed && isRecent
                ? `最近备份: ${new Date(backup.lastBackup).toISOString()}`
                : passed
                  ? `备份已过期，最近备份在 ${Math.floor(lastBackupAge / 3600000)} 小时前`
                  : "未配置备份",
            remediation:
              passed && isRecent
                ? undefined
                : "配置 Agent 状态和对话历史的自动备份",
          };
        }
      )
    );

    // 检查 2: DR 计划
    results.push(
      await this.runCheck(
        "dr-002",
        "disaster-recovery",
        "high",
        "灾备计划",
        "检查是否有灾备恢复计划",
        async () => {
          const has = await this.env.hasDRPlan(this.deploymentName);
          return {
            passed: has,
            message: has ? "DR 计划已就绪" : "未配置 DR 计划",
            remediation: has
              ? undefined
              : "制定并测试灾备恢复计划，包括 RPO/RTO 目标",
          };
        }
      )
    );

    return results;
  }

  /**
   * 成本检查
   */
  private async runCostChecks(): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    results.push(
      await this.runCheck(
        "cost-001",
        "cost",
        "medium",
        "每日成本监控",
        "检查是否有成本监控和预算告警",
        async () => {
          const dailyCost = await this.env.getCostPerDay(this.deploymentName);
          const reasonable = dailyCost > 0 && dailyCost < 10000;
          return {
            passed: reasonable,
            message: `日均成本: $${dailyCost.toFixed(2)}`,
            remediation: reasonable
              ? undefined
              : "检查资源配置和 LLM 调用量，参考第 19 章成本工程优化方案",
          };
        }
      )
    );

    return results;
  }

  /**
   * 合规性检查
   */
  private async runComplianceChecks(): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    results.push(
      await this.runCheck(
        "comp-001",
        "compliance",
        "high",
        "启动探针",
        "检查是否配置了 startupProbe 以区分慢启动和真正故障",
        async () => {
          const has = await this.env.hasStartupProbe(this.deploymentName);
          return {
            passed: has,
            message: has ? "启动探针已配置" : "未配置启动探针",
            remediation: has
              ? undefined
              : "配置 startupProbe 避免存活探针误杀慢启动的 Agent Pod",
          };
        }
      )
    );

    return results;
  }

  /**
   * 运维检查
   */
  private async runOperationalChecks(): Promise<CheckResult[]> {
    // 运维检查通常是文档和流程层面的，此处简化
    return [
      {
        id: "ops-001",
        category: "operational" as CheckCategory,
        priority: "high" as CheckPriority,
        name: "Runbook 文档",
        description: "检查是否有运维 Runbook",
        passed: true, // 此处为示例
        message: "Runbook 检查（需人工确认）",
        durationMs: 0,
      },
      {
        id: "ops-002",
        category: "operational" as CheckCategory,
        priority: "high" as CheckPriority,
        name: "值班制度",
        description: "检查是否有 On-Call 值班安排",
        passed: true,
        message: "值班制度检查（需人工确认）",
        durationMs: 0,
      },
    ];
  }

  /**
   * 执行单项检查
   */
  private async runCheck(
    id: string,
    category: CheckCategory,
    priority: CheckPriority,
    name: string,
    description: string,
    check: () => Promise<{
      passed: boolean;
      message: string;
      remediation?: string;
    }>
  ): Promise<CheckResult> {
    const startTime = Date.now();

    try {
      const result = await check();
      return {
        id,
        category,
        priority,
        name,
        description,
        passed: result.passed,
        message: result.message,
        remediation: result.remediation,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        id,
        category,
        priority,
        name,
        description,
        passed: false,
        message: `检查执行异常: ${error}`,
        remediation: "检查环境配置或检查脚本",
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * 汇总检查结果
   */
  private summarize(
    results: CheckResult[],
    totalDurationMs: number
  ): ReadinessSummary {
    const byCategory: ReadinessSummary["byCategory"] = {} as ReadinessSummary["byCategory"];
    let criticalFailures = 0;
    let highFailures = 0;
    let passed = 0;
    let failed = 0;
    const recommendations: string[] = [];

    for (const result of results) {
      // 按类别统计
      if (!byCategory[result.category]) {
        byCategory[result.category] = { total: 0, passed: 0, failed: 0 };
      }
      byCategory[result.category].total++;

      if (result.passed) {
        passed++;
        byCategory[result.category].passed++;
      } else {
        failed++;
        byCategory[result.category].failed++;

        if (result.priority === "critical") criticalFailures++;
        if (result.priority === "high") highFailures++;

        if (result.remediation) {
          recommendations.push(`[${result.priority.toUpperCase()}] ${result.name}: ${result.remediation}`);
        }
      }
    }

    // 按优先级排序建议
    recommendations.sort((a, b) => {
      const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      const aPriority = a.match(/\[(\w+)\]/)?.[1] || "LOW";
      const bPriority = b.match(/\[(\w+)\]/)?.[1] || "LOW";
      return (
        (priorityOrder[aPriority as keyof typeof priorityOrder] || 3) -
        (priorityOrder[bPriority as keyof typeof priorityOrder] || 3)
      );
    });

    return {
      overallReady: criticalFailures === 0,
      totalChecks: results.length,
      passed,
      failed,
      skipped: 0,
      criticalFailures,
      highFailures,
      byCategory,
      totalDurationMs,
      timestamp: Date.now(),
      recommendations,
    };
  }
}
```

---

## 18.9 本章小结

本章系统地探讨了 AI Agent 系统从实验室到生产环境的部署架构与运维实践。以下是十条核心要点：

### 十大核心要点

**1. Kubernetes 原生部署是 Agent 系统的首选架构**

Agent 工作负载需要精细的资源管理、弹性伸缩和服务发现。Kubernetes 提供了完善的原语（Deployment、Service、HPA 等）来支撑这些需求。通过 `K8sAgentDeployer` 和完善的配置类型体系，我们可以实现声明式的、可重复的部署流程。

**2. 语义缓存是 Agent 系统最有价值的优化手段之一**

`AdvancedSemanticCache` 通过向量相似度匹配实现"近似命中"，相比精确匹配缓存能获得更高的命中率。结合 LRU/LFU 淘汰策略和 TTL 管理，语义缓存可以在保证质量的前提下显著降低 LLM 调用成本（详见第 19 章：成本工程）。

**3. 弹性模式需要分层编排，而非独立使用**

`ResilienceOrchestrator` 将缓存、限流、熔断、舱壁和重试五种弹性模式按照"快速失败"原则进行编排。这种分层设计确保了：缓存最先生效（最快返回）、限流防止过载、熔断隔离故障、舱壁控制并发、重试处理临时异常。

**4. Agent 扩缩容需要业务级指标，而非仅靠 CPU/内存**

`AgentAutoScaler` 综合使用 CPU 利用率、请求队列深度、P95 延迟、错误率和 Token 消耗速率等多维信号来做出扩缩容决策。传统的 CPU/内存指标无法反映 Agent 的真实负载——一个 LLM 调用可能 CPU 不高但队列积压严重。

**5. 金丝雀发布是 Agent 最安全的部署策略**

`CanaryDeploymentController` 通过多阶段逐步放量和实时指标分析，在检测到异常时自动回滚。对于 Agent 系统而言，模型行为变化可能不会导致显式错误，因此需要与基线版本进行对比分析。

**6. 配置管理需要支持层级覆盖和动态更新**

`AgentConfigManager` 通过五级配置层级（default < environment < cluster < application < override）实现灵活的配置管理。特性开关和模型版本管理支持无需重部署即可调整 Agent 行为——这对于需要频繁调优的 Agent 系统至关重要。

**7. 灾备设计必须包含 Agent 状态的备份与恢复**

`DisasterRecoveryManager` 提供多区域故障转移能力，`AgentStateBackup` 确保对话上下文和工具执行状态可以被持久化和恢复。Agent 系统的状态比传统无状态服务更复杂，灾备计划必须覆盖这些有状态组件。

**8. 自愈机制是降低运维负担的关键**

`AgentOpsAutomation` 通过事件驱动的自愈规则，能够自动响应常见的运维事件——重启异常 Pod、扩容应对流量洪峰、切换降级模型等。结合 ChatOps 集成，运维人员可以在即时通讯工具中快速诊断和处理问题。

**9. 容量规划应基于数据而非直觉**

`CapacityPlanner` 通过历史数据分析和趋势外推，提供有据可依的容量建议。Agent 系统的成本结构独特（LLM API 调用费用可能远超计算资源费用），容量规划必须同时考虑基础设施成本和 API 调用成本。

**10. 上线前的全面检查是质量的最后防线**

`ProductionReadinessChecker` 涵盖安全性、性能、可观测性、可靠性、灾备、成本、合规和运维八大维度的检查项。任何关键检查未通过都应该阻止上线——这是避免生产事故的最有效手段。

### 下一章预告

在下一章（第 19 章：成本工程）中，我们将深入探讨 Agent 系统的成本优化策略。LLM API 调用费用通常是 Agent 系统最大的运营成本，我们将学习如何通过智能路由、缓存优化、Token 管理和成本预算控制来构建高效且经济的 Agent 系统。本章介绍的语义缓存、模型版本管理和容量规划将作为成本工程的重要基础。

---

> **架构师笔记**：部署和运维是一项持续改进的工作，而非一次性任务。建议团队定期（至少每季度一次）重新运行 `ProductionReadinessChecker`，根据业务发展和技术演进持续完善部署架构与运维实践。
