# 第十八章：部署与运维

> "开发只是开始，部署和运维才是 Agent 系统的日常。"

---

## 18.1 语义缓存

```typescript
class SemanticCache {
  private cache: Array<{
    queryEmbedding: number[];
    query: string;
    response: string;
    timestamp: number;
  }> = [];

  private similarityThreshold = 0.92;

  async get(query: string): Promise<string | null> {
    const queryEmb = await this.getEmbedding(query);

    for (const entry of this.cache) {
      const similarity = this.cosineSimilarity(queryEmb, entry.queryEmbedding);
      if (similarity >= this.similarityThreshold) {
        return entry.response;
      }
    }
    return null;
  }

  async set(query: string, response: string): Promise<void> {
    const queryEmbedding = await this.getEmbedding(query);
    this.cache.push({ queryEmbedding, query, response, timestamp: Date.now() });
  }

  private async getEmbedding(text: string): Promise<number[]> { return []; }
  private cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((s, v, i) => s + v * b[i], 0);
    const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
    return dot / (magA * magB || 1);
  }
}
```

---

## 18.2 断路器

```typescript
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(
    private failureThreshold: number = 5,
    private resetTimeout: number = 60_000,
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
    }
  }
}
```

---

## 18.3 限流器

```typescript
class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private maxTokens: number = 10,
    private refillRate: number = 1, // tokens per second
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<boolean> {
    this.refill();
    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}
```

---

## 18.4 部署策略

```typescript
class AgentDeployment {
  // 蓝绿部署
  async blueGreenDeploy(newVersion: string): Promise<void> {
    console.log(`部署新版本 ${newVersion} 到 Green 环境`);
    console.log(`健康检查通过后，切换流量到 Green`);
    console.log(`保留 Blue 环境用于回滚`);
  }

  // 金丝雀部署
  async canaryDeploy(newVersion: string, canaryPercent: number = 5): Promise<void> {
    console.log(`部署新版本 ${newVersion}，${canaryPercent}% 流量`);
    console.log(`监控错误率和延迟`);
    console.log(`逐步增加流量到 100%`);
  }
}
```

---

## 18.5 本章小结

1. **语义缓存**通过 embedding 相似度命中缓存，大幅降低成本
2. **断路器**防止故障级联扩散
3. **限流器**保护下游服务不被过载
4. **蓝绿/金丝雀部署**确保安全上线
