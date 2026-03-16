/**
 * shared/utils.ts — 全书共享工具函数
 *
 * 包含 estimateTokens 和 cosineSimilarity 两个在全书 30+ 处
 * 被引用的基础工具函数，以及基于它们的 SemanticCache 通用实现。
 *
 * @see 附录 G.1 工具函数
 * @see 附录 G.3.2 SemanticCache
 */

import type {
  SemanticCacheConfig,
  CacheEntry,
  CacheQueryResult,
} from './types.js';
import type { EmbeddingService } from './embedding.js';

// ============================================================
// G.1.1 estimateTokens — Token 数量估算
// ============================================================

/**
 * 估算文本的 token 数量
 *
 * 启发式规则：
 * - 纯英文约 4 字符/token（GPT 系列的经验值）
 * - 中文约 1.5-2 字符/token
 * - 混合文本取折中值 ~3 字符/token
 *
 * 生产环境建议替换为 tiktoken 等精确分词器：
 *   import { encoding_for_model } from 'tiktoken';
 *   const enc = encoding_for_model('gpt-4o');
 *   return enc.encode(text).length;
 *
 * @param text - 待估算的文本
 * @returns 估算的 token 数（向上取整）
 */
export function estimateTokens(text: string): number {
  // 检测中文字符占比，动态调整除数
  const cjkPattern = /[\u4e00-\u9fff\u3400-\u4dbf]/g;
  const cjkCount = (text.match(cjkPattern) || []).length;
  const cjkRatio = text.length > 0 ? cjkCount / text.length : 0;

  // 纯英文 ~4 字符/token，纯中文 ~1.5 字符/token，线性插值
  const charsPerToken = 4 - cjkRatio * 2.5;
  return Math.ceil(text.length / charsPerToken);
}

// ============================================================
// G.1.2 cosineSimilarity — 余弦相似度
// ============================================================

/**
 * 计算两个向量的余弦相似度
 *
 * cosine_similarity(a, b) = (a · b) / (|a| * |b|)
 *
 * @param a - 向量 a
 * @param b - 向量 b（长度必须与 a 相同）
 * @returns 相似度值 [-1, 1]；若任一向量为零向量则返回 0
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`
    );
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  return magnitudeA && magnitudeB
    ? dotProduct / (magnitudeA * magnitudeB)
    : 0;
}

// ============================================================
// G.3.2 SemanticCache — 语义缓存
// ============================================================

/**
 * 语义缓存基类
 *
 * 核心流程：query embedding -> 向量近邻搜索 -> 相似度阈值过滤 -> 命中/未命中
 *
 * 第 19 章的 SemanticCostCache 在此基础上增加了：
 * - 成本感知 TTL（越贵的响应缓存越久）
 * - 质量反馈循环（低质量响应的 TTL 自动缩短）
 * - 按 Agent / 任务类型隔离缓存空间
 */
export class SemanticCache<T = unknown> {
  protected entries = new Map<string, CacheEntry<T>>();
  protected config: SemanticCacheConfig;
  protected embeddingService: EmbeddingService;

  constructor(
    config: Partial<SemanticCacheConfig>,
    embedding: EmbeddingService
  ) {
    this.config = {
      similarityThreshold: 0.95,
      baseTTLSeconds: 3600,
      maxEntries: 10000,
      embeddingDimension: embedding.dimensions,
      ...config,
    };
    this.embeddingService = embedding;
  }

  /** 语义查询：通过向量相似度实现 "近似命中" */
  async get(query: string): Promise<CacheQueryResult<T>> {
    const start = Date.now();
    const queryEmbedding = await this.embeddingService.embed(query);

    let bestMatch: CacheEntry<T> | undefined;
    let bestSimilarity = -1;

    for (const entry of this.entries.values()) {
      // 清除过期条目
      if (entry.expiresAt < Date.now()) {
        this.entries.delete(entry.key);
        continue;
      }
      const sim = cosineSimilarity(queryEmbedding, entry.embedding);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestMatch = entry;
      }
    }

    const hit =
      bestMatch !== undefined &&
      bestSimilarity >= this.config.similarityThreshold;

    if (hit) bestMatch!.hitCount++;

    return {
      hit,
      entry: hit ? bestMatch : undefined,
      similarity: hit ? bestSimilarity : undefined,
      queryLatencyMs: Date.now() - start,
    };
  }

  /** 写入缓存 */
  async set(key: string, value: T): Promise<void> {
    if (this.entries.size >= this.config.maxEntries) {
      this.evict();
    }
    const embedding = await this.embeddingService.embed(key);
    this.entries.set(key, {
      key,
      embedding,
      value,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.baseTTLSeconds * 1000,
      hitCount: 0,
    });
  }

  /** LRU 淘汰：移除最久未命中的条目 */
  protected evict(): void {
    let oldest: string | undefined;
    let oldestTime = Infinity;
    for (const [k, v] of this.entries) {
      if (v.createdAt < oldestTime) {
        oldestTime = v.createdAt;
        oldest = k;
      }
    }
    if (oldest) this.entries.delete(oldest);
  }

  /** 当前缓存条目数 */
  get size(): number {
    return this.entries.size;
  }
}
