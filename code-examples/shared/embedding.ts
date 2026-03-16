/**
 * shared/embedding.ts — Embedding 服务接口与 Mock 实现
 *
 * 文本转向量（embedding）是语义搜索、记忆存储、缓存匹配的前置步骤。
 * 本书代码示例通过统一的 EmbeddingService 接口隔离具体实现，使
 * 架构演示不依赖特定 embedding 提供商。
 *
 * @see 附录 G.1.3 EmbeddingService
 */

// ============================================================
// G.1.3 EmbeddingService 接口
// ============================================================

/**
 * Embedding 服务接口 — 将文本转换为向量嵌入
 *
 * 实际生产中可对接：
 * - OpenAI:  text-embedding-3-small / text-embedding-3-large
 * - Cohere:  embed-v3
 * - 本地模型: nomic-embed-text via Ollama
 */
export interface EmbeddingService {
  /** 单文本嵌入 */
  embed(text: string): Promise<number[]>;
  /** 批量嵌入（减少网络往返） */
  embedBatch(texts: string[]): Promise<number[][]>;
  /** 向量维度 */
  readonly dimensions: number;
}

// ============================================================
// MockEmbeddingService — 占位实现
// ============================================================

/**
 * Mock Embedding 服务 — 仅用于代码示例演示，返回确定性伪向量
 *
 * 特性：
 * - 基于文本哈希生成确定性伪向量，相同输入得到相同输出
 * - 支持自定义维度（默认 1536，与 OpenAI text-embedding-3-small 一致）
 * - 零网络依赖，可离线运行
 *
 * 生产替换示例：
 * ```typescript
 * class OpenAIEmbeddingService implements EmbeddingService {
 *   readonly dimensions = 1536;
 *   async embed(text: string): Promise<number[]> {
 *     const res = await openai.embeddings.create({
 *       model: 'text-embedding-3-small', input: text,
 *     });
 *     return res.data[0].embedding;
 *   }
 *   async embedBatch(texts: string[]): Promise<number[][]> {
 *     const res = await openai.embeddings.create({
 *       model: 'text-embedding-3-small', input: texts,
 *     });
 *     return res.data.map(d => d.embedding);
 *   }
 * }
 * ```
 */
export class MockEmbeddingService implements EmbeddingService {
  readonly dimensions: number;

  constructor(dimensions: number = 1536) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    // 基于文本哈希生成确定性伪向量，确保相同输入得到相同输出
    const hash = this.simpleHash(text);
    const rng = this.seededRandom(hash);
    const vector = Array.from(
      { length: this.dimensions },
      () => rng() * 2 - 1
    );
    // L2 归一化，模拟真实 embedding 模型的行为
    return this.normalize(vector);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  /**
   * 简单字符串哈希（djb2 变体）
   * 仅用于生成伪随机种子，非密码学安全
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  /**
   * 种子随机数生成器（线性同余法）
   * 保证给定种子产生确定性序列
   */
  private seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) | 0;
      return (s >>> 0) / 0xffffffff;
    };
  }

  /** L2 归一化 */
  private normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(
      vector.reduce((sum, v) => sum + v * v, 0)
    );
    if (magnitude === 0) return vector;
    return vector.map((v) => v / magnitude);
  }
}
