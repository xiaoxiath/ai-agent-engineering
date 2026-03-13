# 第 8 章 RAG 与知识工程

> **"语言模型的知识是静态的，RAG 让它拥有了活的记忆。"**

Retrieval-Augmented Generation（RAG）是当前 AI Agent 系统中最核心的知识增强架构。它通过在推理时动态检索外部知识，解决了大语言模型（LLM）知识截止、幻觉（hallucination）和领域适配三大痛点。本章将从工程实践角度，系统讲解 RAG 系统的完整架构、分块策略、混合检索、GraphRAG、评估体系、高级模式与生产部署。

---

## 8.1 RAG Pipeline 架构

### 8.1.1 整体架构概览

一个生产级 RAG 系统包含 **离线索引（Offline Indexing）** 和 **在线查询（Online Serving）** 两条独立的 Pipeline：

```
┌─────────────────────────────────────────────────────────────────────┐
│                     离线索引 Pipeline (Offline)                      │
│                                                                     │
│  ┌──────────┐   ┌──────────┐   ┌───────────┐   ┌───────────────┐  │
│  │ Document  │──>│ Chunking │──>│ Embedding │──>│   Indexing    │  │
│  │ Ingestion │   │ Strategy │   │  Model    │   │ (Vector DB)  │  │
│  └──────────┘   └──────────┘   └───────────┘   └───────────────┘  │
│       │              │              │                   │           │
│       v              v              v                   v           │
│  [解析文档]    [分块+元数据]   [向量化表示]       [存储到向量库]      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     在线查询 Pipeline (Online)                       │
│                                                                     │
│  ┌───────┐  ┌──────────┐  ┌───────────┐  ┌─────────┐  ┌────────┐ │
│  │ Query │─>│  Query   │─>│ Retrieval │─>│Reranking│─>│ LLM    │ │
│  │ Input │  │Preprocess│  │ (Hybrid)  │  │         │  │Generate│ │
│  └───────┘  └──────────┘  └───────────┘  └─────────┘  └────────┘ │
│      │           │              │              │            │      │
│      v           v              v              v            v      │
│  [用户问题]  [查询扩展]    [多路召回]     [精排过滤]   [生成回答]   │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.1.2 核心类型定义

```typescript
// ============================================================
// RAG Pipeline 核心类型定义
// ============================================================

/** 文档元数据 */
interface DocumentMetadata {
  source: string;           // 来源路径或 URL
  title?: string;           // 文档标题
  author?: string;          // 作者
  createdAt?: Date;         // 创建时间
  updatedAt?: Date;         // 更新时间
  documentType: string;     // 文档类型: markdown | pdf | code | html
  language?: string;        // 语言
  tags?: string[];          // 标签
  permissions?: string[];   // 权限标识
  [key: string]: unknown;   // 扩展字段
}

/** 原始文档 */
interface Document {
  id: string;
  content: string;
  metadata: DocumentMetadata;
}

/** 分块后的文本块 */
interface Chunk {
  id: string;
  documentId: string;       // 所属文档 ID
  content: string;          // 分块文本内容
  embedding?: number[];     // 向量表示
  metadata: ChunkMetadata;
}

/** 分块元数据 */
interface ChunkMetadata {
  chunkIndex: number;       // 块序号
  totalChunks: number;      // 总块数
  startOffset: number;      // 在原文中的起始偏移
  endOffset: number;        // 在原文中的结束偏移
  sectionPath?: string[];   // 章节路径，如 ["第1章", "1.2节", "概述"]
  pageNumber?: number;      // 页码（PDF 场景）
  parentChunkId?: string;   // 父块 ID（层级分块场景）
  tokenCount: number;       // Token 数量
  documentMetadata: DocumentMetadata; // 继承的文档元数据
}

/** 检索结果 */
interface RetrievalResult {
  chunk: Chunk;
  score: number;            // 相关性分数
  retrievalMethod: string;  // 检索方式: dense | sparse | hybrid
}

/** Pipeline 阶段性能指标 */
interface StageMetrics {
  stageName: string;
  startTime: number;
  endTime: number;
  itemCount: number;
  errors: Error[];
}

/** RAG 查询上下文 */
interface RAGContext {
  query: string;
  expandedQueries?: string[];
  retrievalResults: RetrievalResult[];
  rerankedResults: RetrievalResult[];
  generatedAnswer: string;
  metrics: StageMetrics[];
  traceId: string;
}
```

### 8.1.3 RAGPipeline 核心实现

```typescript
import { randomUUID } from "crypto";

// ============================================================
// RAGPipeline: 核心 Pipeline 实现
// ============================================================

/**
 * Embedding 服务接口 — 将文本转换为向量嵌入
 * 与第 7 章 Memory Architecture 使用统一接口
 * 实际生产中可对接 OpenAI Embeddings、Cohere 或本地模型
 */
interface EmbeddingService {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  readonly dimensions: number;
}

/** 向量存储接口 */
interface VectorStore {
  upsert(chunks: Chunk[]): Promise<void>;
  search(
    embedding: number[],
    topK: number,
    filter?: Record<string, unknown>
  ): Promise<RetrievalResult[]>;
  delete(ids: string[]): Promise<void>;
}

/** 分块器接口 */
interface Chunker {
  chunk(document: Document): Promise<Chunk[]>;
}

/** Reranker 接口 */
interface Reranker {
  rerank(query: string, results: RetrievalResult[]): Promise<RetrievalResult[]>;
}

/** LLM 接口 */
interface LLMClient {
  generate(prompt: string, context: string): Promise<string>;
}

/** Pipeline 日志级别 */
type LogLevel = "debug" | "info" | "warn" | "error";

/** Pipeline 观测器——收集每个阶段的日志和指标 */
class PipelineObserver {
  private metrics: StageMetrics[] = [];
  private logLevel: LogLevel;

  constructor(logLevel: LogLevel = "info") {
    this.logLevel = logLevel;
  }

  /** 记录一个阶段的执行 */
  async trackStage<T>(
    stageName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const stage: StageMetrics = {
      stageName,
      startTime: Date.now(),
      endTime: 0,
      itemCount: 0,
      errors: [],
    };

    this.log("info", `[${stageName}] 开始执行`);

    try {
      const result = await fn();

      // 自动统计结果数量
      if (Array.isArray(result)) {
        stage.itemCount = result.length;
      }

      stage.endTime = Date.now();
      const duration = stage.endTime - stage.startTime;
      this.log(
        "info",
        `[${stageName}] 完成, 耗时 ${duration}ms, 处理 ${stage.itemCount} 项`
      );
      this.metrics.push(stage);

      return result;
    } catch (error) {
      stage.endTime = Date.now();
      stage.errors.push(error as Error);
      this.metrics.push(stage);
      this.log("error", `[${stageName}] 失败: ${(error as Error).message}`);
      throw error;
    }
  }

  /** 获取所有阶段指标 */
  getMetrics(): StageMetrics[] {
    return [...this.metrics];
  }

  /** 重置指标 */
  reset(): void {
    this.metrics = [];
  }

  private log(level: LogLevel, message: string): void {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    if (levels.indexOf(level) >= levels.indexOf(this.logLevel)) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    }
  }
}

class RAGPipeline {
  private embeddingService: EmbeddingService;
  private vectorStore: VectorStore;
  private chunker: Chunker;
  private reranker?: Reranker;
  private llmClient: LLMClient;
  private observer: PipelineObserver;

  constructor(config: {
    embeddingService: EmbeddingService;
    vectorStore: VectorStore;
    chunker: Chunker;
    reranker?: Reranker;
    llmClient: LLMClient;
    logLevel?: LogLevel;
  }) {
    this.embeddingService = config.embeddingService;
    this.vectorStore = config.vectorStore;
    this.chunker = config.chunker;
    this.reranker = config.reranker;
    this.llmClient = config.llmClient;
    this.observer = new PipelineObserver(config.logLevel ?? "info");
  }

  // ---- 离线索引 Pipeline ----

  /** 索引一批文档 */
  async indexDocuments(documents: Document[]): Promise<{
    totalChunks: number;
    metrics: StageMetrics[];
  }> {
    this.observer.reset();
    let allChunks: Chunk[] = [];

    // 阶段 1: 文档分块
    allChunks = await this.observer.trackStage("chunking", async () => {
      const chunks: Chunk[] = [];
      for (const doc of documents) {
        try {
          const docChunks = await this.chunker.chunk(doc);
          chunks.push(...docChunks);
        } catch (error) {
          // 单个文档分块失败不应阻断整个批次
          console.error(`文档 ${doc.id} 分块失败: ${(error as Error).message}`);
        }
      }
      return chunks;
    });

    if (allChunks.length === 0) {
      throw new Error("所有文档分块均失败，无法继续索引");
    }

    // 阶段 2: 批量 Embedding
    const embeddedChunks = await this.observer.trackStage(
      "embedding",
      async () => {
        const batchSize = 100; // 避免单次请求过大
        const results: Chunk[] = [];

        for (let i = 0; i < allChunks.length; i += batchSize) {
          const batch = allChunks.slice(i, i + batchSize);
          const texts = batch.map((c) => c.content);

          try {
            const embeddings = await this.embeddingService.embedBatch(texts);
            batch.forEach((chunk, idx) => {
              chunk.embedding = embeddings[idx];
            });
            results.push(...batch);
          } catch (error) {
            // Embedding 失败时记录错误但继续处理其他批次
            console.error(
              `Embedding 批次 ${i}~${i + batchSize} 失败: ${(error as Error).message}`
            );
          }
        }
        return results;
      }
    );

    // 阶段 3: 存储到向量库
    await this.observer.trackStage("indexing", async () => {
      await this.vectorStore.upsert(embeddedChunks);
      return embeddedChunks;
    });

    return {
      totalChunks: embeddedChunks.length,
      metrics: this.observer.getMetrics(),
    };
  }

  // ---- 在线查询 Pipeline ----

  /** 执行 RAG 查询 */
  async query(
    userQuery: string,
    options: {
      topK?: number;
      filter?: Record<string, unknown>;
      includeMetrics?: boolean;
    } = {}
  ): Promise<RAGContext> {
    const { topK = 10, filter, includeMetrics = false } = options;
    this.observer.reset();
    const traceId = randomUUID();

    // 阶段 1: Query Embedding
    const queryEmbedding = await this.observer.trackStage(
      "query_embedding",
      async () => {
        const embedding = await this.embeddingService.embed(userQuery);
        return embedding;
      }
    );

    // 阶段 2: 向量检索
    const retrievalResults = await this.observer.trackStage(
      "retrieval",
      async () => {
        const results = await this.vectorStore.search(
          queryEmbedding,
          topK,
          filter
        );
        if (results.length === 0) {
          console.warn("向量检索返回空结果，生成回答可能不准确");
        }
        return results;
      }
    );

    // 阶段 3: Reranking（可选）
    const rerankedResults = await this.observer.trackStage(
      "reranking",
      async () => {
        if (this.reranker && retrievalResults.length > 0) {
          return this.reranker.rerank(userQuery, retrievalResults);
        }
        return retrievalResults;
      }
    );

    // 阶段 4: 构建上下文并生成回答
    const generatedAnswer = await this.observer.trackStage(
      "generation",
      async () => {
        const context = this.buildContext(rerankedResults);
        return this.llmClient.generate(userQuery, context);
      }
    );

    return {
      query: userQuery,
      retrievalResults,
      rerankedResults,
      generatedAnswer,
      metrics: includeMetrics ? this.observer.getMetrics() : [],
      traceId,
    };
  }

  /** 将检索结果拼接为 LLM 上下文 */
  private buildContext(results: RetrievalResult[]): string {
    return results
      .map((r, i) => {
        const source = r.chunk.metadata.documentMetadata.source;
        return `[来源 ${i + 1}: ${source}]\n${r.chunk.content}`;
      })
      .join("\n\n---\n\n");
  }
}
```

### 8.1.4 RAGPipelineBuilder: Fluent Builder 模式

在实际项目中，RAG Pipeline 的配置项非常多。使用 Builder 模式可以提供清晰、链式的配置体验：

```typescript
// ============================================================
// RAGPipelineBuilder: 流畅构建器
// ============================================================

class RAGPipelineBuilder {
  private config: Partial<{
    embeddingService: EmbeddingService;
    vectorStore: VectorStore;
    chunker: Chunker;
    reranker: Reranker;
    llmClient: LLMClient;
    logLevel: LogLevel;
  }> = {};

  /** 设置 Embedding 模型 */
  withEmbeddingService(model: EmbeddingService): this {
    this.config.embeddingService = model;
    return this;
  }

  /** 设置向量存储 */
  withVectorStore(store: VectorStore): this {
    this.config.vectorStore = store;
    return this;
  }

  /** 设置分块策略 */
  withChunker(chunker: Chunker): this {
    this.config.chunker = chunker;
    return this;
  }

  /** 设置 Reranker（可选） */
  withReranker(reranker: Reranker): this {
    this.config.reranker = reranker;
    return this;
  }

  /** 设置 LLM 客户端 */
  withLLMClient(client: LLMClient): this {
    this.config.llmClient = client;
    return this;
  }

  /** 设置日志级别 */
  withLogLevel(level: LogLevel): this {
    this.config.logLevel = level;
    return this;
  }

  /** 构建 Pipeline 实例——校验必填配置 */
  build(): RAGPipeline {
    if (!this.config.embeddingService) {
      throw new Error("必须设置 embeddingService");
    }
    if (!this.config.vectorStore) {
      throw new Error("必须设置 vectorStore");
    }
    if (!this.config.chunker) {
      throw new Error("必须设置 chunker");
    }
    if (!this.config.llmClient) {
      throw new Error("必须设置 llmClient");
    }

    return new RAGPipeline({
      embeddingService: this.config.embeddingService,
      vectorStore: this.config.vectorStore,
      chunker: this.config.chunker,
      reranker: this.config.reranker,
      llmClient: this.config.llmClient,
      logLevel: this.config.logLevel,
    });
  }
}

// 使用示例:
// const pipeline = new RAGPipelineBuilder()
//   .withEmbeddingService(openAIEmbeddingService)
//   .withVectorStore(pineconeStore)
//   .withChunker(new RecursiveChunker({ chunkSize: 512 }))
//   .withReranker(new CrossEncoderReranker({ crossEncoder: cohereReranker }))
//   .withLLMClient(anthropicClient)
//   .withLogLevel("info")
//   .build();
```

### 8.1.5 错误处理策略

生产环境中，RAG Pipeline 的每个阶段都可能失败。下表总结了常见故障及应对策略：

| 阶段 | 可能故障 | 影响 | 处理策略 |
|------|---------|------|---------|
| Document Ingestion | 文件格式解析失败 | 该文档缺失 | 跳过并记录，不阻断批次 |
| Chunking | 文本过短或为空 | 产生无效块 | ChunkValidator 过滤 |
| Embedding | API 超时或限流 | 部分块无向量 | 指数退避重试，最多 3 次 |
| Indexing | 向量库写入失败 | 索引不完整 | 事务性批量写入加回滚 |
| Query Embedding | 模型不可用 | 查询失败 | 降级到 BM25 纯文本检索 |
| Retrieval | 返回空结果 | 无上下文 | 扩展查询词后重试 |
| Reranking | Reranker 超时 | 排序缺失 | 跳过 Reranking，使用原始排序 |
| Generation | LLM 幻觉或拒答 | 答案质量差 | 后置验证加 Faithfulness 检查 |

---

## 8.2 文档分块策略

文档分块（Chunking）是 RAG 系统中影响检索质量最关键的环节之一。分块粒度过大会引入噪声，过小则丢失上下文。本节系统讲解六种分块策略及其适用场景。

### 8.2.1 分块策略对比

| 策略 | 优点 | 缺点 | 适用场景 | 推荐块大小 |
|------|------|------|---------|-----------|
| Fixed Size | 实现简单、速度快 | 可能从句子中间截断 | 通用文本、快速原型 | 256-512 tokens |
| Semantic | 保持语义完整性 | 依赖 Embedding 模型质量 | 长文档、学术论文 | 动态 |
| Recursive | 多级分隔符保留结构 | 配置复杂 | Markdown、代码 | 512-1024 tokens |
| Parent-Child | 兼顾精确检索和上下文 | 存储开销翻倍 | 技术文档 | 父2048/子256 |
| Agentic | 最高语义质量 | 速度慢、成本高 | 高价值文档 | 由 LLM 决定 |
| Late Chunking | 保留全局注意力信息 | 需特殊模型支持 | 长上下文场景 | 动态 |

### 8.2.2 基础分块器实现

```typescript
// ============================================================
// 基础分块器：固定大小分块
// ============================================================

interface ChunkerConfig {
  chunkSize: number;      // 目标块大小（字符数）
  chunkOverlap: number;   // 重叠区域大小
  minChunkSize: number;   // 最小块大小（过滤碎片）
}

class FixedSizeChunker implements Chunker {
  private config: ChunkerConfig;

  constructor(config: Partial<ChunkerConfig> = {}) {
    this.config = {
      chunkSize: config.chunkSize ?? 1000,
      chunkOverlap: config.chunkOverlap ?? 200,
      minChunkSize: config.minChunkSize ?? 100,
    };
  }

  async chunk(document: Document): Promise<Chunk[]> {
    const { content } = document;
    const { chunkSize, chunkOverlap, minChunkSize } = this.config;
    const chunks: Chunk[] = [];

    let startOffset = 0;
    let chunkIndex = 0;

    while (startOffset < content.length) {
      let endOffset = Math.min(startOffset + chunkSize, content.length);

      // 尝试在句子边界处截断，避免从句子中间切开
      if (endOffset < content.length) {
        const boundary = this.findSentenceBoundary(
          content,
          endOffset,
          startOffset + chunkSize * 0.8
        );
        if (boundary > 0) endOffset = boundary;
      }

      const chunkContent = content.slice(startOffset, endOffset).trim();

      // 过滤过短的碎片块
      if (chunkContent.length >= minChunkSize) {
        chunks.push({
          id: `${document.id}_chunk_${chunkIndex}`,
          documentId: document.id,
          content: chunkContent,
          metadata: {
            chunkIndex,
            totalChunks: 0, // 最后回填
            startOffset,
            endOffset,
            tokenCount: this.estimateTokens(chunkContent),
            documentMetadata: document.metadata,
          },
        });
        chunkIndex++;
      }

      // 下一个块的起点 = 当前终点 - 重叠区域
      startOffset = endOffset - chunkOverlap;
      if (startOffset >= content.length) break;
    }

    // 回填 totalChunks
    chunks.forEach((c) => (c.metadata.totalChunks = chunks.length));
    return chunks;
  }

  /** 查找最近的句子边界 */
  private findSentenceBoundary(
    text: string,
    pos: number,
    minPos: number
  ): number {
    const sentenceEnders = ["\u3002", ".", "\uff01", "!", "\uff1f", "?", "\n\n"];
    let bestPos = -1;
    for (const ender of sentenceEnders) {
      const idx = text.lastIndexOf(ender, pos);
      if (idx > minPos && idx > bestPos) {
        bestPos = idx + ender.length;
      }
    }
    return bestPos;
  }

  /** 粗略估计 Token 数（中文约 1.5 字符/token，英文约 4 字符/token） */
  private estimateTokens(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }
}
```

### 8.2.3 语义分块

语义分块通过计算相邻句子的 Embedding 相似度来确定分块边界。当相似度低于阈值时，说明话题发生了转换，应在此处切分：

```typescript
// ============================================================
// 语义分块器：基于 Embedding 相似度切分
// ============================================================

class SemanticChunker implements Chunker {
  private embeddingService: EmbeddingService;
  private similarityThreshold: number;
  private maxChunkSize: number;
  private minChunkSize: number;

  constructor(config: {
    embeddingService: EmbeddingService;
    similarityThreshold?: number;
    maxChunkSize?: number;
    minChunkSize?: number;
  }) {
    this.embeddingService = config.embeddingService;
    this.similarityThreshold = config.similarityThreshold ?? 0.75;
    this.maxChunkSize = config.maxChunkSize ?? 2000;
    this.minChunkSize = config.minChunkSize ?? 100;
  }

  async chunk(document: Document): Promise<Chunk[]> {
    // 第一步：将文档拆分为句子
    const sentences = this.splitSentences(document.content);
    if (sentences.length <= 1) {
      return this.createSingleChunk(document);
    }

    // 第二步：为每个句子生成 Embedding
    const embeddings = await this.embeddingService.embedBatch(sentences);

    // 第三步：计算相邻句子的余弦相似度
    const similarities: number[] = [];
    for (let i = 0; i < embeddings.length - 1; i++) {
      similarities.push(
        this.cosineSimilarity(embeddings[i], embeddings[i + 1])
      );
    }

    // 第四步：在低相似度处切分
    const chunks: Chunk[] = [];
    let currentSentences: string[] = [sentences[0]];
    let chunkIndex = 0;
    let startOffset = 0;

    for (let i = 0; i < similarities.length; i++) {
      const currentContent = currentSentences.join("");
      const wouldExceedMax =
        currentContent.length + sentences[i + 1].length > this.maxChunkSize;
      const isBoundary = similarities[i] < this.similarityThreshold;

      if (isBoundary || wouldExceedMax) {
        if (currentContent.length >= this.minChunkSize) {
          const endOffset = startOffset + currentContent.length;
          chunks.push({
            id: `${document.id}_semantic_${chunkIndex}`,
            documentId: document.id,
            content: currentContent,
            metadata: {
              chunkIndex,
              totalChunks: 0,
              startOffset,
              endOffset,
              tokenCount: Math.ceil(currentContent.length / 3),
              documentMetadata: document.metadata,
            },
          });
          chunkIndex++;
          startOffset = endOffset;
          currentSentences = [];
        }
      }
      currentSentences.push(sentences[i + 1]);
    }

    // 处理最后一批句子
    const remaining = currentSentences.join("");
    if (remaining.length >= this.minChunkSize) {
      chunks.push({
        id: `${document.id}_semantic_${chunkIndex}`,
        documentId: document.id,
        content: remaining,
        metadata: {
          chunkIndex,
          totalChunks: 0,
          startOffset,
          endOffset: startOffset + remaining.length,
          tokenCount: Math.ceil(remaining.length / 3),
          documentMetadata: document.metadata,
        },
      });
    }

    chunks.forEach((c) => (c.metadata.totalChunks = chunks.length));
    return chunks;
  }

  /** 中英文混合句子切分 */
  private splitSentences(text: string): string[] {
    return text
      .split(/(?<=[\u3002\uff01\uff1f.!?\n])\s*/)
      .filter((s) => s.trim().length > 0);
  }

  // cosineSimilarity 实现见第 5 章 Context Engineering 的工具函数定义
  // 此处为简化展示，完整实现请参考 code-examples/shared/utils.ts
  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
    return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0;
  }

  private createSingleChunk(document: Document): Chunk[] {
    return [{
      id: `${document.id}_semantic_0`,
      documentId: document.id,
      content: document.content,
      metadata: {
        chunkIndex: 0, totalChunks: 1, startOffset: 0,
        endOffset: document.content.length,
        tokenCount: Math.ceil(document.content.length / 3),
        documentMetadata: document.metadata,
      },
    }];
  }
}
```

### 8.2.4 递归分块

递归分块是 LangChain 推广的经典策略，通过多级分隔符逐层切分，优先在高层级结构边界处切分：

```typescript
// ============================================================
// 递归分块器：多级分隔符策略
// ============================================================

class RecursiveChunker implements Chunker {
  private chunkSize: number;
  private chunkOverlap: number;
  private separators: string[];

  constructor(config: {
    chunkSize?: number;
    chunkOverlap?: number;
    separators?: string[];
  } = {}) {
    this.chunkSize = config.chunkSize ?? 1000;
    this.chunkOverlap = config.chunkOverlap ?? 200;
    // 默认分隔符优先级：章节 > 段落 > 句子 > 词
    this.separators = config.separators ?? [
      "\n## ",  "\n### ", "\n\n", "\n",
      "\u3002", ". ", " ", "",
    ];
  }

  async chunk(document: Document): Promise<Chunk[]> {
    const rawChunks = this.splitRecursive(document.content, this.separators);
    return rawChunks.map((text, idx) => ({
      id: `${document.id}_recursive_${idx}`,
      documentId: document.id,
      content: text,
      metadata: {
        chunkIndex: idx,
        totalChunks: rawChunks.length,
        startOffset: 0,
        endOffset: text.length,
        tokenCount: Math.ceil(text.length / 3),
        documentMetadata: document.metadata,
      },
    }));
  }

  /** 递归切分核心逻辑 */
  private splitRecursive(text: string, separators: string[]): string[] {
    if (text.length <= this.chunkSize) return [text];
    if (separators.length === 0) return [text.slice(0, this.chunkSize)];

    const separator = separators[0];
    const remainingSeparators = separators.slice(1);
    const splits = separator === ""
      ? [...text]
      : text.split(separator).filter((s) => s.length > 0);

    const results: string[] = [];
    let currentChunk = "";

    for (const split of splits) {
      const piece = separator === "" ? split : separator + split;
      const wouldExceed = (currentChunk + piece).length > this.chunkSize;

      if (wouldExceed && currentChunk.length > 0) {
        results.push(currentChunk.trim());
        const overlap = currentChunk.slice(-this.chunkOverlap);
        currentChunk = overlap + piece;
      } else {
        currentChunk += piece;
      }

      if (piece.length > this.chunkSize) {
        const subChunks = this.splitRecursive(piece, remainingSeparators);
        results.push(...subChunks);
        currentChunk = "";
      }
    }

    if (currentChunk.trim().length > 0) {
      results.push(currentChunk.trim());
    }
    return results;
  }
}
```

### 8.2.5 Parent-Child 分块

Parent-Child 策略同时维护大块（Parent）和小块（Child）。检索时匹配小块以获得精确度，返回时扩展为父块以保证上下文完整性：

```typescript
// ============================================================
// Parent-Child 分块器
// ============================================================

class ParentChildChunker implements Chunker {
  private parentChunkSize: number;
  private childChunkSize: number;
  private childOverlap: number;

  constructor(config: {
    parentChunkSize?: number;
    childChunkSize?: number;
    childOverlap?: number;
  } = {}) {
    this.parentChunkSize = config.parentChunkSize ?? 2000;
    this.childChunkSize = config.childChunkSize ?? 300;
    this.childOverlap = config.childOverlap ?? 50;
  }

  async chunk(document: Document): Promise<Chunk[]> {
    const allChunks: Chunk[] = [];
    const content = document.content;

    // 第一步：按大粒度切出父块
    const parentTexts = this.splitBySize(content, this.parentChunkSize, 0);

    for (let pi = 0; pi < parentTexts.length; pi++) {
      const parentText = parentTexts[pi];
      const parentId = `${document.id}_parent_${pi}`;

      // 创建父块（用于返回上下文）
      allChunks.push({
        id: parentId,
        documentId: document.id,
        content: parentText,
        metadata: {
          chunkIndex: pi,
          totalChunks: parentTexts.length,
          startOffset: 0,
          endOffset: parentText.length,
          tokenCount: Math.ceil(parentText.length / 3),
          documentMetadata: document.metadata,
        },
      });

      // 第二步：在父块内切出子块（用于精确检索）
      const childTexts = this.splitBySize(
        parentText, this.childChunkSize, this.childOverlap
      );

      for (let ci = 0; ci < childTexts.length; ci++) {
        allChunks.push({
          id: `${parentId}_child_${ci}`,
          documentId: document.id,
          content: childTexts[ci],
          metadata: {
            chunkIndex: ci,
            totalChunks: childTexts.length,
            startOffset: 0,
            endOffset: childTexts[ci].length,
            parentChunkId: parentId,
            tokenCount: Math.ceil(childTexts[ci].length / 3),
            documentMetadata: document.metadata,
          },
        });
      }
    }
    return allChunks;
  }

  private splitBySize(text: string, size: number, overlap: number): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + size, text.length);
      chunks.push(text.slice(start, end));
      start = end - overlap;
      if (start >= text.length) break;
    }
    return chunks;
  }
}
```

### 8.2.6 Agentic Chunking: 用 LLM 决定分块边界

Agentic Chunking 是一种前沿方法——让 LLM 自身判断文档的语义边界，实现最高质量的分块：

```typescript
// ============================================================
// Agentic Chunking: 基于 LLM 的智能分块
// ============================================================

class AgenticChunker implements Chunker {
  private llm: LLMClient;
  private maxChunkTokens: number;

  constructor(llm: LLMClient, maxChunkTokens: number = 500) {
    this.llm = llm;
    this.maxChunkTokens = maxChunkTokens;
  }

  async chunk(document: Document): Promise<Chunk[]> {
    // 第一步：让 LLM 分析文档结构并确定分割点
    const propositions = await this.extractPropositions(document.content);

    // 第二步：让 LLM 将 propositions 分组为语义连贯的块
    const groups = await this.groupPropositions(propositions);

    return groups.map((group, idx) => ({
      id: `${document.id}_agentic_${idx}`,
      documentId: document.id,
      content: group.content,
      metadata: {
        chunkIndex: idx,
        totalChunks: groups.length,
        startOffset: 0,
        endOffset: group.content.length,
        sectionPath: group.sectionPath,
        tokenCount: Math.ceil(group.content.length / 3),
        documentMetadata: document.metadata,
      },
    }));
  }

  /** 让 LLM 将文档拆解为原子命题 */
  private async extractPropositions(content: string): Promise<string[]> {
    const prompt = `你是一个文档分析专家。请将以下文档拆解为独立的原子命题。
每个命题包含一个完整的事实或陈述。以 JSON 数组格式返回。

文档内容:
${content.slice(0, 8000)}`;

    const response = await this.llm.generate(prompt, "");
    try {
      return JSON.parse(response) as string[];
    } catch {
      return content.split(/[\u3002.!\uff01?\uff1f\n]+/).filter((s) => s.trim().length > 10);
    }
  }

  /** 让 LLM 将命题按语义连贯性分组 */
  private async groupPropositions(
    propositions: string[]
  ): Promise<Array<{ content: string; sectionPath: string[] }>> {
    const prompt = `你是一个知识组织专家。以下是从文档中提取的原子命题列表。
请将它们按语义相关性分组，每组应讨论同一个主题。
每组输出格式: {"topic": "主题名", "indices": [命题序号]}
以 JSON 数组格式返回。

命题列表:
${propositions.map((p, i) => `${i}: ${p}`).join("\n")}`;

    const response = await this.llm.generate(prompt, "");
    try {
      const groups = JSON.parse(response) as Array<{
        topic: string;
        indices: number[];
      }>;
      return groups.map((g) => ({
        content: g.indices.map((i) => propositions[i]).join("\n"),
        sectionPath: [g.topic],
      }));
    } catch {
      const groupSize = 5;
      const results: Array<{ content: string; sectionPath: string[] }> = [];
      for (let i = 0; i < propositions.length; i += groupSize) {
        results.push({
          content: propositions.slice(i, i + groupSize).join("\n"),
          sectionPath: ["unknown"],
        });
      }
      return results;
    }
  }
}
```

### 8.2.7 文档类型适配器

不同文档类型需要不同的解析和分块策略：

```typescript
// ============================================================
// Markdown 专用分块器——保留标题层级结构
// ============================================================

class MarkdownChunker implements Chunker {
  private maxChunkSize: number;

  constructor(maxChunkSize: number = 1500) {
    this.maxChunkSize = maxChunkSize;
  }

  async chunk(document: Document): Promise<Chunk[]> {
    const sections = this.parseMarkdownSections(document.content);
    const chunks: Chunk[] = [];

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const enrichedContent = [
        `[章节路径: ${section.path.join(" > ")}]`,
        section.content,
      ].join("\n");

      chunks.push({
        id: `${document.id}_md_${i}`,
        documentId: document.id,
        content: enrichedContent,
        metadata: {
          chunkIndex: i,
          totalChunks: sections.length,
          startOffset: section.startOffset,
          endOffset: section.endOffset,
          sectionPath: section.path,
          tokenCount: Math.ceil(enrichedContent.length / 3),
          documentMetadata: document.metadata,
        },
      });
    }
    return chunks;
  }

  /** 解析 Markdown 标题结构 */
  private parseMarkdownSections(content: string): Array<{
    path: string[];
    content: string;
    startOffset: number;
    endOffset: number;
  }> {
    const lines = content.split("\n");
    const sections: Array<{
      path: string[];
      content: string;
      startOffset: number;
      endOffset: number;
    }> = [];

    const headingStack: string[] = [];
    let currentContent = "";
    let currentStart = 0;
    let offset = 0;

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        if (currentContent.trim().length > 0) {
          sections.push({
            path: [...headingStack],
            content: currentContent.trim(),
            startOffset: currentStart,
            endOffset: offset,
          });
        }
        const level = headingMatch[1].length;
        const title = headingMatch[2].trim();
        while (headingStack.length >= level) headingStack.pop();
        headingStack.push(title);
        currentContent = line + "\n";
        currentStart = offset;
      } else {
        currentContent += line + "\n";
      }
      offset += line.length + 1;
    }

    if (currentContent.trim().length > 0) {
      sections.push({
        path: [...headingStack],
        content: currentContent.trim(),
        startOffset: currentStart,
        endOffset: offset,
      });
    }
    return sections;
  }
}
```

### 8.2.8 ChunkQualityValidator: 分块质量校验

```typescript
// ============================================================
// 分块质量校验器
// ============================================================

interface QualityReport {
  totalChunks: number;
  validChunks: number;
  filteredChunks: number;
  issues: Array<{ chunkId: string; issue: string }>;
}

class ChunkQualityValidator {
  private minTokens: number;
  private maxTokens: number;
  private minAlphanumericRatio: number;

  constructor(config: {
    minTokens?: number;
    maxTokens?: number;
    minAlphanumericRatio?: number;
  } = {}) {
    this.minTokens = config.minTokens ?? 20;
    this.maxTokens = config.maxTokens ?? 2000;
    this.minAlphanumericRatio = config.minAlphanumericRatio ?? 0.3;
  }

  /** 校验并过滤分块列表 */
  validate(chunks: Chunk[]): { validChunks: Chunk[]; report: QualityReport } {
    const report: QualityReport = {
      totalChunks: chunks.length,
      validChunks: 0,
      filteredChunks: 0,
      issues: [],
    };

    const validChunks = chunks.filter((chunk) => {
      const issues = this.checkChunk(chunk);
      if (issues.length > 0) {
        report.filteredChunks++;
        report.issues.push(
          ...issues.map((issue) => ({ chunkId: chunk.id, issue }))
        );
        return false;
      }
      report.validChunks++;
      return true;
    });

    return { validChunks, report };
  }

  private checkChunk(chunk: Chunk): string[] {
    const issues: string[] = [];
    const { content, metadata } = chunk;

    if (metadata.tokenCount < this.minTokens) {
      issues.push(`块过短: ${metadata.tokenCount} tokens`);
    }
    if (metadata.tokenCount > this.maxTokens) {
      issues.push(`块过长: ${metadata.tokenCount} tokens`);
    }

    const alphanumeric = content.replace(/[\s\p{P}]/gu, "").length;
    const ratio = alphanumeric / content.length;
    if (ratio < this.minAlphanumericRatio) {
      issues.push(`有意义字符比例过低: ${(ratio * 100).toFixed(1)}%`);
    }

    if (this.isRepetitive(content)) {
      issues.push("检测到重复内容");
    }

    const codeBlockMarkers = (content.match(/```/g) || []).length;
    if (codeBlockMarkers % 2 !== 0) {
      issues.push("包含未闭合的代码块");
    }

    return issues;
  }

  private isRepetitive(text: string): boolean {
    const words = text.split(/\s+/);
    if (words.length < 10) return false;
    const uniqueWords = new Set(words);
    return uniqueWords.size / words.length < 0.3;
  }
}
```

---

## 8.3 混合检索

单一的向量检索（Dense Retrieval）在面对精确关键词匹配、专有名词查询时表现不佳；而传统的 BM25 检索无法理解语义相似性。混合检索（Hybrid Retrieval）通过融合多种检索策略，取长补短，显著提升召回率和准确性。

### 8.3.1 Query 预处理与扩展

在执行检索之前，对用户原始查询进行预处理可以大幅提升检索效果：

```typescript
// ============================================================
// Query 预处理: 查询扩展、分解与 HyDE
// ============================================================

/** 查询扩展结果 */
interface ExpandedQuery {
  original: string;         // 原始查询
  expanded: string[];       // 扩展后的查询变体
  hypotheticalDoc?: string; // HyDE 生成的假设文档
  subQueries?: string[];    // 分解后的子查询
}

class QueryExpander {
  private llm: LLMClient;
  private embeddingService: EmbeddingService;

  constructor(llm: LLMClient, embeddingService: EmbeddingService) {
    this.llm = llm;
    this.embeddingService = embeddingService;
  }

  /** 综合查询扩展: 同义词扩展 + 查询分解 + HyDE */
  async expand(query: string): Promise<ExpandedQuery> {
    const [synonymExpansion, decomposition, hyde] = await Promise.allSettled([
      this.synonymExpand(query),
      this.decomposeQuery(query),
      this.generateHypotheticalDocument(query),
    ]);

    return {
      original: query,
      expanded:
        synonymExpansion.status === "fulfilled"
          ? synonymExpansion.value
          : [query],
      subQueries:
        decomposition.status === "fulfilled"
          ? decomposition.value
          : undefined,
      hypotheticalDoc:
        hyde.status === "fulfilled" ? hyde.value : undefined,
    };
  }

  /** 同义词扩展: 让 LLM 生成查询的多种表达方式 */
  private async synonymExpand(query: string): Promise<string[]> {
    const prompt = `请为以下搜索查询生成 3 个语义相同但表达不同的变体。
仅返回 JSON 数组格式。

原始查询: "${query}"`;

    const response = await this.llm.generate(prompt, "");
    try {
      const variants = JSON.parse(response) as string[];
      return [query, ...variants];
    } catch {
      return [query];
    }
  }

  /** 查询分解: 将复杂问题拆解为多个简单子问题 */
  private async decomposeQuery(query: string): Promise<string[]> {
    const prompt = `分析以下问题，如果它是一个复合问题，请将其拆解为独立的子问题。
如果是简单问题则原样返回。以 JSON 数组格式输出。

问题: "${query}"`;

    const response = await this.llm.generate(prompt, "");
    try {
      return JSON.parse(response) as string[];
    } catch {
      return [query];
    }
  }

  /**
   * HyDE (Hypothetical Document Embeddings):
   * 让 LLM 生成一个可能包含答案的"假设文档"，
   * 用它的 Embedding 替代 query Embedding 进行检索。
   * 核心思想：假设文档与真实文档在向量空间中更接近。
   */
  private async generateHypotheticalDocument(
    query: string
  ): Promise<string> {
    const prompt = `请写一段可能回答以下问题的参考文档段落（约 200 字）。
不需要完全准确，但应包含相关的关键概念和术语。

问题: "${query}"`;

    return this.llm.generate(prompt, "");
  }
}
```

### 8.3.2 多路召回: Dense + Sparse + RRF 融合

```typescript
// ============================================================
// 混合检索器: Dense + Sparse 多路召回 + RRF 融合
// ============================================================

/** 稀疏检索接口 (BM25 / SPLADE) */
interface SparseRetriever {
  search(
    query: string,
    topK: number,
    filter?: Record<string, unknown>
  ): Promise<RetrievalResult[]>;
}

/** 密集检索接口 */
interface DenseRetriever {
  search(
    embedding: number[],
    topK: number,
    filter?: Record<string, unknown>
  ): Promise<RetrievalResult[]>;
}

/** 高级检索过滤器 */
interface RetrievalFilter {
  documentTypes?: string[];
  dateRange?: { start: Date; end: Date };
  tags?: string[];
  permissions?: string[];
  excludeDocIds?: string[];
}

class HybridRetriever {
  private denseRetriever: DenseRetriever;
  private sparseRetriever: SparseRetriever;
  private embeddingService: EmbeddingService;
  private denseWeight: number;
  private sparseWeight: number;
  private rrfK: number;

  constructor(config: {
    denseRetriever: DenseRetriever;
    sparseRetriever: SparseRetriever;
    embeddingService: EmbeddingService;
    denseWeight?: number;
    sparseWeight?: number;
    rrfK?: number;
  }) {
    this.denseRetriever = config.denseRetriever;
    this.sparseRetriever = config.sparseRetriever;
    this.embeddingService = config.embeddingService;
    this.denseWeight = config.denseWeight ?? 0.6;
    this.sparseWeight = config.sparseWeight ?? 0.4;
    this.rrfK = config.rrfK ?? 60;
  }

  /** 执行混合检索 */
  async search(
    query: string,
    topK: number = 10,
    filter?: RetrievalFilter
  ): Promise<RetrievalResult[]> {
    const metadataFilter = this.buildMetadataFilter(filter);

    // 并行执行 Dense 和 Sparse 检索
    const queryEmbedding = await this.embeddingService.embed(query);

    const [denseResults, sparseResults] = await Promise.all([
      this.denseRetriever.search(queryEmbedding, topK * 2, metadataFilter),
      this.sparseRetriever.search(query, topK * 2, metadataFilter),
    ]);

    // 使用 Reciprocal Rank Fusion 融合结果
    return this.reciprocalRankFusion(
      [
        { results: denseResults, weight: this.denseWeight },
        { results: sparseResults, weight: this.sparseWeight },
      ],
      topK
    );
  }

  /**
   * Reciprocal Rank Fusion (RRF):
   * 将多个检索列表按排名融合。公式:
   *   RRF_score(d) = sum( weight_i / (k + rank_i(d)) )
   *
   * 其中 k 是平滑常数（通常为 60），rank_i(d) 是文档 d 在第 i 个列表中的排名。
   * RRF 的优势在于只依赖排名而不依赖绝对分数，因此可以融合不同量纲的结果。
   */
  private reciprocalRankFusion(
    rankedLists: Array<{ results: RetrievalResult[]; weight: number }>,
    topK: number
  ): RetrievalResult[] {
    const scoreMap = new Map<
      string,
      { score: number; result: RetrievalResult }
    >();

    for (const { results, weight } of rankedLists) {
      results.forEach((result, rank) => {
        const chunkId = result.chunk.id;
        const rrfScore = weight / (this.rrfK + rank + 1);

        const existing = scoreMap.get(chunkId);
        if (existing) {
          existing.score += rrfScore;
        } else {
          scoreMap.set(chunkId, {
            score: rrfScore,
            result: { ...result, retrievalMethod: "hybrid" },
          });
        }
      });
    }

    return Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((entry) => ({ ...entry.result, score: entry.score }));
  }

  /** 将高级过滤器转换为向量库的元数据过滤条件 */
  private buildMetadataFilter(
    filter?: RetrievalFilter
  ): Record<string, unknown> | undefined {
    if (!filter) return undefined;
    const conditions: Record<string, unknown> = {};

    if (filter.documentTypes?.length) {
      conditions["documentType"] = { $in: filter.documentTypes };
    }
    if (filter.dateRange) {
      conditions["createdAt"] = {
        $gte: filter.dateRange.start.toISOString(),
        $lte: filter.dateRange.end.toISOString(),
      };
    }
    if (filter.tags?.length) {
      conditions["tags"] = { $containsAny: filter.tags };
    }
    if (filter.permissions?.length) {
      conditions["permissions"] = { $containsAny: filter.permissions };
    }
    if (filter.excludeDocIds?.length) {
      conditions["documentId"] = { $nin: filter.excludeDocIds };
    }

    return Object.keys(conditions).length > 0 ? conditions : undefined;
  }
}
```

### 8.3.3 Cross-Encoder Reranker

Reranker 使用 Cross-Encoder 模型对 query-document pair 进行精细打分，精度远高于 Bi-Encoder 的向量相似度：

```typescript
// ============================================================
// Cross-Encoder Reranker 实现
// ============================================================

/** Cross-Encoder 模型接口 */
interface CrossEncoderModel {
  /** 对 query-document pair 打分，返回 0~1 之间的相关性分数 */
  score(
    pairs: Array<{ query: string; document: string }>
  ): Promise<number[]>;
}

class CrossEncoderReranker implements Reranker {
  private crossEncoder: CrossEncoderModel;
  private topK: number;
  private scoreThreshold: number;

  constructor(config: {
    crossEncoder: CrossEncoderModel;
    topK?: number;
    scoreThreshold?: number;
  }) {
    this.crossEncoder = config.crossEncoder;
    this.topK = config.topK ?? 5;
    this.scoreThreshold = config.scoreThreshold ?? 0.1;
  }

  async rerank(
    query: string,
    results: RetrievalResult[]
  ): Promise<RetrievalResult[]> {
    if (results.length === 0) return [];

    // 构建 query-document pairs 并批量打分
    const pairs = results.map((r) => ({
      query,
      document: r.chunk.content,
    }));

    const scores = await this.crossEncoder.score(pairs);

    // 将分数赋给结果、按分数降序排列、过滤低分、取 Top-K
    return results
      .map((result, idx) => ({
        ...result,
        score: scores[idx],
        retrievalMethod: `${result.retrievalMethod}+reranked`,
      }))
      .filter((r) => r.score >= this.scoreThreshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.topK);
  }
}
```

### 8.3.4 Contextual Retrieval

Anthropic 提出的 Contextual Retrieval 方法的核心思想是：在索引阶段，为每个 chunk 前置一段由 LLM 生成的上下文说明，解决 chunk 脱离原文后语义不完整的问题：

```typescript
// ============================================================
// Contextual Retrieval: 上下文增强分块
// ============================================================

class ContextualRetriever {
  private llm: LLMClient;
  private baseChunker: Chunker;

  constructor(llm: LLMClient, baseChunker: Chunker) {
    this.llm = llm;
    this.baseChunker = baseChunker;
  }

  /** 为每个 chunk 生成上下文前缀 */
  async enrichChunks(document: Document): Promise<Chunk[]> {
    const chunks = await this.baseChunker.chunk(document);
    const enrichedChunks: Chunk[] = [];

    for (const chunk of chunks) {
      const contextPrefix = await this.generateContext(
        document.content,
        chunk.content
      );

      enrichedChunks.push({
        ...chunk,
        content: `${contextPrefix}\n\n${chunk.content}`,
      });
    }
    return enrichedChunks;
  }

  /**
   * 让 LLM 为 chunk 生成简短的上下文说明。
   * 关键：prompt 中需要包含整个文档（或摘要）以提供全局信息。
   */
  private async generateContext(
    fullDocument: string,
    chunkContent: string
  ): Promise<string> {
    const docContext =
      fullDocument.length > 10000
        ? fullDocument.slice(0, 5000) +
          "\n...(中间省略)...\n" +
          fullDocument.slice(-2000)
        : fullDocument;

    const prompt = `<document>
${docContext}
</document>

以下是文档中的一个片段:
<chunk>
${chunkContent}
</chunk>

请用一两句话简要说明这个片段在文档中的位置和上下文。
只输出上下文说明，不要重复片段内容。`;

    return this.llm.generate(prompt, "");
  }
}
```

---

## 8.4 GraphRAG

传统的向量检索将每个 chunk 视为独立单元，无法捕捉实体之间的关系和全局文档结构。GraphRAG 通过构建知识图谱（Knowledge Graph），将文档中的实体和关系显式建模，实现更强大的推理和检索能力。

### 8.4.1 GraphRAG 架构概览

```
┌──────────────────────────────────────────────────────────────┐
│                    GraphRAG 构建流程                          │
│                                                              │
│  文档集合                                                     │
│    │                                                         │
│    v                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────┐     │
│  │ Entity       │──> │ Relation    │──> │ Community    │     │
│  │ Extraction   │    │ Extraction  │    │ Detection    │     │
│  └─────────────┘    └─────────────┘    └──────────────┘     │
│                                              │               │
│                                              v               │
│                                        ┌──────────────┐     │
│                                        │ Community    │     │
│                                        │ Summarization│     │
│                                        └──────────────┘     │
│                                              │               │
│              ┌───────────────────────────────┤               │
│              v                               v               │
│       ┌────────────┐                 ┌────────────┐         │
│       │ Local Search│                │Global Search│         │
│       │ (实体邻域)  │                │ (社区摘要)  │         │
│       └────────────┘                 └────────────┘         │
└──────────────────────────────────────────────────────────────┘
```

### 8.4.2 知识图谱核心类型

```typescript
// ============================================================
// GraphRAG 核心类型定义
// ============================================================

/** 图谱实体 */
interface GraphEntity {
  id: string;
  name: string;               // 实体名称
  type: string;               // 实体类型: person | org | concept | event | technology
  description: string;        // 实体描述
  attributes: Record<string, unknown>; // 扩展属性
  sourceChunkIds: string[];   // 来源 chunk ID 列表
  embedding?: number[];       // 实体描述的向量表示
}

/** 图谱关系 */
interface GraphRelation {
  id: string;
  sourceEntityId: string;     // 源实体 ID
  targetEntityId: string;     // 目标实体 ID
  relationType: string;       // 关系类型: uses | belongs_to | causes | etc.
  description: string;        // 关系描述
  weight: number;             // 关系权重 (0~1)
  sourceChunkIds: string[];   // 来源 chunk ID 列表
}

/** 图谱社区 */
interface GraphCommunity {
  id: string;
  level: number;              // 社区层级（0 为最细粒度）
  entityIds: string[];        // 包含的实体 ID
  summary: string;            // 社区摘要（由 LLM 生成）
  embedding?: number[];       // 摘要的向量表示
  parentCommunityId?: string; // 父社区 ID（层级结构）
}

/** 知识图谱 */
interface KnowledgeGraph {
  entities: Map<string, GraphEntity>;
  relations: GraphRelation[];
  communities: GraphCommunity[];
}
```

### 8.4.3 GraphBuilder: 知识图谱构建

```typescript
// ============================================================
// GraphBuilder: 知识图谱构建器
// ============================================================

class GraphBuilder {
  private llm: LLMClient;
  private embeddingService: EmbeddingService;
  private entities: Map<string, GraphEntity> = new Map();
  private relations: GraphRelation[] = [];
  private communities: GraphCommunity[] = [];

  constructor(llm: LLMClient, embeddingService: EmbeddingService) {
    this.llm = llm;
    this.embeddingService = embeddingService;
  }

  /** 从文档块中提取实体 */
  async extractEntities(chunks: Chunk[]): Promise<GraphEntity[]> {
    const allEntities: GraphEntity[] = [];

    for (const chunk of chunks) {
      const prompt = `你是一个知识图谱构建专家。请从以下文本中提取所有重要实体。
对每个实体，提供: name（名称）、type（类型）、description（一句话描述）。
类型可选: person, organization, technology, concept, event, location, product

以 JSON 数组格式返回，格式:
[{"name": "...", "type": "...", "description": "..."}]

文本:
${chunk.content}`;

      try {
        const response = await this.llm.generate(prompt, "");
        const extracted = JSON.parse(response) as Array<{
          name: string;
          type: string;
          description: string;
        }>;

        for (const e of extracted) {
          // 去重：如果同名实体已存在，合并来源
          const existingKey = this.findEntityKey(e.name);
          if (existingKey) {
            const existing = this.entities.get(existingKey)!;
            existing.sourceChunkIds.push(chunk.id);
            // 选择更长的描述
            if (e.description.length > existing.description.length) {
              existing.description = e.description;
            }
          } else {
            const entity: GraphEntity = {
              id: `entity_${this.entities.size}`,
              name: e.name,
              type: e.type,
              description: e.description,
              attributes: {},
              sourceChunkIds: [chunk.id],
            };
            this.entities.set(entity.id, entity);
            allEntities.push(entity);
          }
        }
      } catch (error) {
        console.error(
          `从 chunk ${chunk.id} 提取实体失败: ${(error as Error).message}`
        );
      }
    }

    return allEntities;
  }

  /** 从文档块中提取实体间的关系 */
  async extractRelations(chunks: Chunk[]): Promise<GraphRelation[]> {
    const entityNames = Array.from(this.entities.values()).map((e) => e.name);

    for (const chunk of chunks) {
      const prompt = `你是一个知识图谱构建专家。以下是已知的实体列表和一段文本。
请提取文本中实体之间的关系。

已知实体: ${entityNames.join(", ")}

对每个关系，提供:
- source: 源实体名称
- target: 目标实体名称
- relation: 关系类型 (uses, belongs_to, causes, collaborates_with, depends_on, creates, improves)
- description: 关系的简短描述

以 JSON 数组格式返回。

文本:
${chunk.content}`;

      try {
        const response = await this.llm.generate(prompt, "");
        const extracted = JSON.parse(response) as Array<{
          source: string;
          target: string;
          relation: string;
          description: string;
        }>;

        for (const r of extracted) {
          const sourceId = this.findEntityKey(r.source);
          const targetId = this.findEntityKey(r.target);

          if (sourceId && targetId) {
            this.relations.push({
              id: `relation_${this.relations.length}`,
              sourceEntityId: sourceId,
              targetEntityId: targetId,
              relationType: r.relation,
              description: r.description,
              weight: 1.0,
              sourceChunkIds: [chunk.id],
            });
          }
        }
      } catch (error) {
        console.error(
          `从 chunk ${chunk.id} 提取关系失败: ${(error as Error).message}`
        );
      }
    }

    // 合并重复关系并累加权重
    this.mergeRelations();
    return this.relations;
  }

  // ================================================================
  // 社区检测（简化版 Louvain 算法）
  // ----------------------------------------------------------------
  // 教学简化版：演示基于模块度（modularity）优化的社区发现核心思想。
  // 生产环境应使用 graphology-communities-louvain（JS）或 neo4j GDS
  // 等图计算库，它们支持加权边、层级社区和大规模图的高效处理。
  // ================================================================

  /**
   * 计算将节点 nodeId 移入 targetCommunity 带来的模块度增益（ΔQ）。
   * ΔQ > 0 表示移动后图的社区结构更优。
   */
  private modularityGain(
    nodeId: string,
    targetCommunity: string,
    communityOf: Map<string, string>,
    adjacency: Map<string, Map<string, number>>,
    totalWeight: number
  ): number {
    const neighbors = adjacency.get(nodeId) || new Map<string, number>();
    // k_i: 节点 nodeId 的加权度
    let ki = 0;
    for (const w of neighbors.values()) ki += w;
    // Σ_in: targetCommunity 内部边的总权重
    // Σ_tot: targetCommunity 所有节点的度之和
    let sigmaIn = 0;
    let sigmaTot = 0;
    for (const [nId, comm] of communityOf) {
      if (comm !== targetCommunity) continue;
      const nNeighbors = adjacency.get(nId) || new Map<string, number>();
      for (const [neighbor, w] of nNeighbors) {
        if (communityOf.get(neighbor) === targetCommunity) sigmaIn += w;
        sigmaTot += w;
      }
    }
    sigmaIn /= 2; // 每条内部边被计数两次

    // k_i_in: nodeId 与 targetCommunity 内节点的连边权重
    let kiIn = 0;
    for (const [neighbor, w] of neighbors) {
      if (communityOf.get(neighbor) === targetCommunity) kiIn += w;
    }

    const m2 = 2 * totalWeight;
    return (kiIn / m2) - (sigmaTot * ki) / (m2 * m2);
  }

  /** 社区检测（简化版 Louvain 算法） */
  async buildCommunities(): Promise<GraphCommunity[]> {
    // ---------- 1. 构建加权邻接表 ----------
    const adjacency = new Map<string, Map<string, number>>();
    for (const entityId of this.entities.keys()) {
      adjacency.set(entityId, new Map());
    }
    let totalWeight = 0;
    for (const rel of this.relations) {
      const w = rel.weight || 1;
      const srcNeighbors = adjacency.get(rel.sourceEntityId)!;
      const tgtNeighbors = adjacency.get(rel.targetEntityId)!;
      srcNeighbors.set(rel.targetEntityId, (srcNeighbors.get(rel.targetEntityId) || 0) + w);
      tgtNeighbors.set(rel.sourceEntityId, (tgtNeighbors.get(rel.sourceEntityId) || 0) + w);
      totalWeight += w;
    }

    // ---------- 2. 初始化：每个节点自成一个社区 ----------
    const communityOf = new Map<string, string>();
    for (const entityId of this.entities.keys()) {
      communityOf.set(entityId, entityId); // 初始社区 ID = 节点 ID
    }

    // ---------- 3. 迭代优化（Phase 1 of Louvain） ----------
    const MAX_ITERATIONS = 20;
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      let moved = false;

      for (const nodeId of this.entities.keys()) {
        const currentComm = communityOf.get(nodeId)!;
        const neighbors = adjacency.get(nodeId) || new Map<string, number>();

        // 收集邻居所在的社区（去重）
        const neighborComms = new Set<string>();
        for (const neighbor of neighbors.keys()) {
          neighborComms.add(communityOf.get(neighbor)!);
        }

        // 尝试将节点移入每个邻居社区，选模块度增益最大的
        let bestComm = currentComm;
        let bestGain = 0;
        for (const targetComm of neighborComms) {
          if (targetComm === currentComm) continue;
          const gain = this.modularityGain(
            nodeId, targetComm, communityOf, adjacency, totalWeight
          );
          if (gain > bestGain) {
            bestGain = gain;
            bestComm = targetComm;
          }
        }

        if (bestComm !== currentComm) {
          communityOf.set(nodeId, bestComm);
          moved = true;
        }
      }

      // 如果本轮没有任何节点移动，提前收敛
      if (!moved) break;
    }

    // ---------- 4. 汇总社区成员 ----------
    const communityGroups = new Map<string, string[]>();
    for (const [entityId, commId] of communityOf) {
      if (!communityGroups.has(commId)) communityGroups.set(commId, []);
      communityGroups.get(commId)!.push(entityId);
    }

    // ---------- 5. 为每个社区生成 LLM 摘要 ----------
    this.communities = [];
    let idx = 0;
    for (const [, entityIds] of communityGroups) {
      const entities = entityIds
        .map((id) => this.entities.get(id)!)
        .filter(Boolean);

      const summary = await this.generateCommunitySummary(entities);

      this.communities.push({
        id: `community_${idx}`,
        level: 0,
        entityIds,
        summary,
      });
      idx++;
    }

    return this.communities;
  }

  /** 为社区生成摘要 */
  private async generateCommunitySummary(
    entities: GraphEntity[]
  ): Promise<string> {
    const entityDescriptions = entities
      .map((e) => `- ${e.name} (${e.type}): ${e.description}`)
      .join("\n");

    const relatedRelations = this.relations.filter(
      (r) =>
        entities.some((e) => e.id === r.sourceEntityId) &&
        entities.some((e) => e.id === r.targetEntityId)
    );

    const relationDescriptions = relatedRelations
      .map((r) => {
        const source = this.entities.get(r.sourceEntityId)!;
        const target = this.entities.get(r.targetEntityId)!;
        return `- ${source.name} --[${r.relationType}]--> ${target.name}: ${r.description}`;
      })
      .join("\n");

    const prompt = `请为以下实体和关系集合生成一个综合性的摘要段落（约 150 字），
概述这个知识社区的核心主题和关键信息。

实体:
${entityDescriptions}

关系:
${relationDescriptions}`;

    return this.llm.generate(prompt, "");
  }

  /** 构建完整的知识图谱 */
  async build(chunks: Chunk[]): Promise<KnowledgeGraph> {
    console.log("开始提取实体...");
    await this.extractEntities(chunks);
    console.log(`提取到 ${this.entities.size} 个实体`);

    console.log("开始提取关系...");
    await this.extractRelations(chunks);
    console.log(`提取到 ${this.relations.length} 条关系`);

    console.log("开始构建社区...");
    await this.buildCommunities();
    console.log(`构建了 ${this.communities.length} 个社区`);

    // 为实体和社区生成 Embedding
    await this.generateEmbeddings();

    return {
      entities: this.entities,
      relations: this.relations,
      communities: this.communities,
    };
  }

  /** 为实体和社区摘要生成 Embedding */
  private async generateEmbeddings(): Promise<void> {
    // 实体 Embedding
    const entityList = Array.from(this.entities.values());
    const entityTexts = entityList.map(
      (e) => `${e.name}: ${e.description}`
    );
    if (entityTexts.length > 0) {
      const embeddings = await this.embeddingService.embedBatch(entityTexts);
      entityList.forEach((entity, idx) => {
        entity.embedding = embeddings[idx];
      });
    }

    // 社区摘要 Embedding
    const communityTexts = this.communities.map((c) => c.summary);
    if (communityTexts.length > 0) {
      const embeddings = await this.embeddingService.embedBatch(communityTexts);
      this.communities.forEach((community, idx) => {
        community.embedding = embeddings[idx];
      });
    }
  }

  /** 按名称查找实体（模糊匹配） */
  private findEntityKey(name: string): string | undefined {
    const normalized = name.toLowerCase().trim();
    for (const [key, entity] of this.entities) {
      if (entity.name.toLowerCase().trim() === normalized) {
        return key;
      }
    }
    return undefined;
  }

  /** 合并重复关系 */
  private mergeRelations(): void {
    const relationMap = new Map<string, GraphRelation>();

    for (const rel of this.relations) {
      const key = `${rel.sourceEntityId}-${rel.relationType}-${rel.targetEntityId}`;
      const existing = relationMap.get(key);
      if (existing) {
        existing.weight += 1;
        existing.sourceChunkIds.push(...rel.sourceChunkIds);
      } else {
        relationMap.set(key, { ...rel });
      }
    }

    this.relations = Array.from(relationMap.values());
    // 归一化权重
    const maxWeight = Math.max(...this.relations.map((r) => r.weight));
    if (maxWeight > 0) {
      this.relations.forEach((r) => (r.weight /= maxWeight));
    }
  }
}
```

### 8.4.4 GraphAugmentedRetriever: Local 与 Global 检索

GraphRAG 提供两种检索模式：

- **Local Search**: 从查询相关的实体出发，沿关系边扩展，获取局部子图上下文。适合具体的事实性问题。
- **Global Search**: 基于社区摘要进行检索，获取全局性概览。适合总结性、宏观性问题。

```typescript
// ============================================================
// GraphAugmentedRetriever: 图谱增强检索
// ============================================================

class GraphAugmentedRetriever {
  private graph: KnowledgeGraph;
  private vectorRetriever: HybridRetriever;
  private embeddingService: EmbeddingService;

  constructor(
    graph: KnowledgeGraph,
    vectorRetriever: HybridRetriever,
    embeddingService: EmbeddingService
  ) {
    this.graph = graph;
    this.vectorRetriever = vectorRetriever;
    this.embeddingService = embeddingService;
  }

  /** Local Search: 实体邻域检索 */
  async localSearch(
    query: string,
    topK: number = 5,
    hops: number = 2
  ): Promise<{
    vectorResults: RetrievalResult[];
    graphContext: string;
  }> {
    // 第一步：向量检索获取初始结果
    const vectorResults = await this.vectorRetriever.search(query, topK);

    // 第二步：从检索到的 chunk 中找到相关实体
    const relevantChunkIds = vectorResults.map((r) => r.chunk.id);
    const seedEntities = Array.from(this.graph.entities.values()).filter(
      (e) => e.sourceChunkIds.some((id) => relevantChunkIds.includes(id))
    );

    // 第三步：沿关系边扩展，收集 N-hop 邻域
    const expandedEntities = this.expandNeighborhood(
      seedEntities.map((e) => e.id),
      hops
    );

    // 第四步：构建图谱上下文
    const graphContext = this.buildLocalContext(expandedEntities);

    return { vectorResults, graphContext };
  }

  /** Global Search: 社区摘要检索 */
  async globalSearch(
    query: string,
    topK: number = 3
  ): Promise<{
    communityContexts: string[];
    vectorResults: RetrievalResult[];
  }> {
    // 第一步：用查询 Embedding 匹配最相关的社区
    const queryEmbedding = await this.embeddingService.embed(query);

    const communityScores = this.graph.communities
      .filter((c) => c.embedding)
      .map((community) => ({
        community,
        score: this.cosineSimilarity(queryEmbedding, community.embedding!),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    const communityContexts = communityScores.map(
      (cs) => cs.community.summary
    );

    // 第二步：同时执行向量检索
    const vectorResults = await this.vectorRetriever.search(query, topK);

    return { communityContexts, vectorResults };
  }

  /** 自动选择检索策略 */
  async adaptiveSearch(
    query: string,
    topK: number = 5
  ): Promise<string> {
    // 简单启发式：如果查询是总结性的，用 Global；否则用 Local
    const globalKeywords = [
      "总结", "概述", "总览", "全部", "所有", "整体",
      "summarize", "overview", "all", "overall",
    ];

    const isGlobal = globalKeywords.some((kw) =>
      query.toLowerCase().includes(kw)
    );

    if (isGlobal) {
      const { communityContexts, vectorResults } = await this.globalSearch(
        query,
        topK
      );
      return [
        "## 社区摘要上下文",
        ...communityContexts.map((c, i) => `### 社区 ${i + 1}\n${c}`),
        "\n## 向量检索上下文",
        ...vectorResults.map(
          (r, i) => `### 片段 ${i + 1}\n${r.chunk.content}`
        ),
      ].join("\n\n");
    } else {
      const { vectorResults, graphContext } = await this.localSearch(
        query,
        topK
      );
      return [
        "## 知识图谱上下文",
        graphContext,
        "\n## 向量检索上下文",
        ...vectorResults.map(
          (r, i) => `### 片段 ${i + 1}\n${r.chunk.content}`
        ),
      ].join("\n\n");
    }
  }

  /** 沿关系边扩展 N-hop 邻域 */
  private expandNeighborhood(
    seedEntityIds: string[],
    hops: number
  ): Set<string> {
    const visited = new Set<string>(seedEntityIds);
    let frontier = new Set<string>(seedEntityIds);

    for (let hop = 0; hop < hops; hop++) {
      const nextFrontier = new Set<string>();

      for (const entityId of frontier) {
        // 查找所有相邻实体
        for (const rel of this.graph.relations) {
          if (rel.sourceEntityId === entityId && !visited.has(rel.targetEntityId)) {
            nextFrontier.add(rel.targetEntityId);
            visited.add(rel.targetEntityId);
          }
          if (rel.targetEntityId === entityId && !visited.has(rel.sourceEntityId)) {
            nextFrontier.add(rel.sourceEntityId);
            visited.add(rel.sourceEntityId);
          }
        }
      }

      frontier = nextFrontier;
      if (frontier.size === 0) break; // 无法继续扩展
    }

    return visited;
  }

  /** 构建局部图谱上下文 */
  private buildLocalContext(entityIds: Set<string>): string {
    const entities = Array.from(entityIds)
      .map((id) => this.graph.entities.get(id))
      .filter(Boolean) as GraphEntity[];

    const relations = this.graph.relations.filter(
      (r) => entityIds.has(r.sourceEntityId) && entityIds.has(r.targetEntityId)
    );

    const entitySection = entities
      .map((e) => `- **${e.name}** (${e.type}): ${e.description}`)
      .join("\n");

    const relationSection = relations
      .map((r) => {
        const source = this.graph.entities.get(r.sourceEntityId)!;
        const target = this.graph.entities.get(r.targetEntityId)!;
        return `- ${source.name} --[${r.relationType}]--> ${target.name}`;
      })
      .join("\n");

    return `### 相关实体\n${entitySection}\n\n### 实体关系\n${relationSection}`;
  }

  // cosineSimilarity 实现见第 5 章 Context Engineering 的工具函数定义
  // 此处为简化展示，完整实现请参考 code-examples/shared/utils.ts
  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
    return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0;
  }
}
```

---

## 8.5 RAG 评估

没有评估就没有改进。RAG 系统的评估需要同时考量检索质量和生成质量两个维度。本节介绍基于 RAGAS 框架的系统性评估方法。

### 8.5.1 评估指标总览

| 指标 | 维度 | 含义 | 计算方式 |
|------|------|------|---------|
| Faithfulness | 生成质量 | 回答是否忠实于检索到的上下文 | 从回答中提取 claims，检查每个 claim 是否能从 context 推导 |
| Answer Relevancy | 生成质量 | 回答是否与问题相关 | 从回答反向生成问题，比较与原问题的相似度 |
| Context Precision | 检索质量 | 排序靠前的结果是否更相关 | 检查标注为相关的 chunk 在结果列表中的位置 |
| Context Recall | 检索质量 | 是否检索到了所有必要的信息 | ground truth 中的 claims 有多少能从 context 中找到 |
| Answer Correctness | 端到端 | 回答的最终正确性 | 与 ground truth 答案对比的 F1 分数 |

### 8.5.2 RAGEvaluator 实现

```typescript
// ============================================================
// RAGEvaluator: RAG 系统评估器
// ============================================================

/** 评估测试用例 */
interface RAGTestCase {
  query: string;
  groundTruthAnswer: string;
  groundTruthContextIds?: string[]; // 理想情况下应检索到的 chunk IDs
}

/** 单条评估结果 */
interface EvaluationResult {
  query: string;
  faithfulness: number;       // 0~1
  answerRelevancy: number;    // 0~1
  contextPrecision: number;   // 0~1
  contextRecall: number;      // 0~1
  answerCorrectness: number;  // 0~1
  latencyMs: number;          // 端到端延迟
}

/** 批次评估报告 */
interface EvaluationReport {
  timestamp: Date;
  totalCases: number;
  averageScores: {
    faithfulness: number;
    answerRelevancy: number;
    contextPrecision: number;
    contextRecall: number;
    answerCorrectness: number;
    latencyMs: number;
  };
  results: EvaluationResult[];
  failureModes: FailureMode[];
}

/** 失败模式分析 */
interface FailureMode {
  type: "low_faithfulness" | "low_recall" | "low_precision" | "hallucination" | "slow_response";
  count: number;
  examples: string[];
  suggestedFix: string;
}

class RAGEvaluator {
  private llm: LLMClient;
  private embeddingService: EmbeddingService;
  private pipeline: RAGPipeline;

  constructor(
    llm: LLMClient,
    embeddingService: EmbeddingService,
    pipeline: RAGPipeline
  ) {
    this.llm = llm;
    this.embeddingService = embeddingService;
    this.pipeline = pipeline;
  }

  /** 执行完整的评估流程 */
  async evaluate(testCases: RAGTestCase[]): Promise<EvaluationReport> {
    const results: EvaluationResult[] = [];

    for (const testCase of testCases) {
      const startTime = Date.now();

      // 执行 RAG 查询
      const ragContext = await this.pipeline.query(testCase.query, {
        topK: 10,
        includeMetrics: true,
      });

      const latencyMs = Date.now() - startTime;

      // 并行计算各项指标
      const [faithfulness, answerRelevancy, contextPrecision, contextRecall, answerCorrectness] =
        await Promise.all([
          this.measureFaithfulness(
            ragContext.generatedAnswer,
            ragContext.rerankedResults.map((r) => r.chunk.content)
          ),
          this.measureAnswerRelevancy(testCase.query, ragContext.generatedAnswer),
          this.measureContextPrecision(
            ragContext.rerankedResults,
            testCase.groundTruthContextIds
          ),
          this.measureContextRecall(
            ragContext.rerankedResults.map((r) => r.chunk.content),
            testCase.groundTruthAnswer
          ),
          this.measureAnswerCorrectness(
            ragContext.generatedAnswer,
            testCase.groundTruthAnswer
          ),
        ]);

      results.push({
        query: testCase.query,
        faithfulness,
        answerRelevancy,
        contextPrecision,
        contextRecall,
        answerCorrectness,
        latencyMs,
      });
    }

    // 计算平均分数
    const avg = (arr: number[]) =>
      arr.reduce((s, v) => s + v, 0) / arr.length;

    const report: EvaluationReport = {
      timestamp: new Date(),
      totalCases: testCases.length,
      averageScores: {
        faithfulness: avg(results.map((r) => r.faithfulness)),
        answerRelevancy: avg(results.map((r) => r.answerRelevancy)),
        contextPrecision: avg(results.map((r) => r.contextPrecision)),
        contextRecall: avg(results.map((r) => r.contextRecall)),
        answerCorrectness: avg(results.map((r) => r.answerCorrectness)),
        latencyMs: avg(results.map((r) => r.latencyMs)),
      },
      results,
      failureModes: this.analyzeFailureModes(results),
    };

    return report;
  }

  /** Faithfulness: 回答对上下文的忠实度 */
  private async measureFaithfulness(
    answer: string,
    contexts: string[]
  ): Promise<number> {
    // 第一步：从回答中提取原子 claims
    const claimsPrompt = `请从以下回答中提取所有事实性声明(claims)。
以 JSON 数组格式返回。

回答: "${answer}"`;

    let claims: string[];
    try {
      const claimsResponse = await this.llm.generate(claimsPrompt, "");
      claims = JSON.parse(claimsResponse) as string[];
    } catch {
      return 0.5; // 无法解析时返回中间值
    }

    if (claims.length === 0) return 1.0;

    // 第二步：检查每个 claim 是否能从 context 推导
    const contextText = contexts.join("\n\n");
    let supportedCount = 0;

    for (const claim of claims) {
      const verifyPrompt = `根据以下上下文，判断这个声明是否能被支持。
仅回答 "supported" 或 "not_supported"。

上下文:
${contextText.slice(0, 6000)}

声明: "${claim}"`;

      const verdict = await this.llm.generate(verifyPrompt, "");
      // ✅ 修复：includes("supported") 会同时匹配 "supported" 和 "not_supported"
      // 使用显式否定模式检测，排除 not_supported / unsupported 等情况
      const NEGATION_PATTERNS = [
        /\bnot[_\s]+supported\b/i,
        /\bunsupported\b/i,
      ];
      const containsNegation = NEGATION_PATTERNS.some((p) => p.test(verdict));
      if (!containsNegation && /\bsupported\b/i.test(verdict)) {
        supportedCount++;
      }
    }

    return supportedCount / claims.length;
  }

  /** Answer Relevancy: 回答与问题的相关度 */
  private async measureAnswerRelevancy(
    query: string,
    answer: string
  ): Promise<number> {
    // 从回答反向生成 3 个问题，计算与原问题的平均相似度
    const reversePrompt = `根据以下回答，生成 3 个可能产生该回答的问题。
以 JSON 数组格式返回。

回答: "${answer}"`;

    try {
      const response = await this.llm.generate(reversePrompt, "");
      const generatedQuestions = JSON.parse(response) as string[];

      // 计算 Embedding 相似度
      const allTexts = [query, ...generatedQuestions];
      const embeddings = await this.embeddingService.embedBatch(allTexts);

      const queryEmb = embeddings[0];
      let totalSimilarity = 0;

      for (let i = 1; i < embeddings.length; i++) {
        totalSimilarity += this.cosineSimilarity(queryEmb, embeddings[i]);
      }

      return totalSimilarity / generatedQuestions.length;
    } catch {
      return 0.5;
    }
  }

  /** Context Precision: 检索结果排序质量 */
  private async measureContextPrecision(
    results: RetrievalResult[],
    groundTruthIds?: string[]
  ): Promise<number> {
    if (!groundTruthIds || groundTruthIds.length === 0) return 0.5;

    // 计算 Precision@K
    let relevantFound = 0;
    let precisionSum = 0;

    for (let i = 0; i < results.length; i++) {
      if (groundTruthIds.includes(results[i].chunk.id)) {
        relevantFound++;
        precisionSum += relevantFound / (i + 1);
      }
    }

    // Average Precision
    return relevantFound > 0
      ? precisionSum / groundTruthIds.length
      : 0;
  }

  /** Context Recall: 必要信息召回率 */
  private async measureContextRecall(
    retrievedContexts: string[],
    groundTruthAnswer: string
  ): Promise<number> {
    const prompt = `将以下 ground truth 答案分解为独立的事实 claims。
然后判断每个 claim 是否能在检索到的上下文中找到支持。
返回格式: {"total_claims": N, "supported_claims": M}

Ground Truth 答案:
${groundTruthAnswer}

检索到的上下文:
${retrievedContexts.join("\n---\n").slice(0, 6000)}`;

    try {
      const response = await this.llm.generate(prompt, "");
      const result = JSON.parse(response) as {
        total_claims: number;
        supported_claims: number;
      };
      return result.total_claims > 0
        ? result.supported_claims / result.total_claims
        : 0;
    } catch {
      return 0.5;
    }
  }

  /** Answer Correctness: 答案正确性 */
  private async measureAnswerCorrectness(
    generatedAnswer: string,
    groundTruthAnswer: string
  ): Promise<number> {
    // 使用 Embedding 相似度作为近似度量
    const embeddings = await this.embeddingService.embedBatch([
      generatedAnswer,
      groundTruthAnswer,
    ]);
    return this.cosineSimilarity(embeddings[0], embeddings[1]);
  }

  /** 分析失败模式 */
  private analyzeFailureModes(results: EvaluationResult[]): FailureMode[] {
    const modes: FailureMode[] = [];

    // 低 Faithfulness
    const lowFaith = results.filter((r) => r.faithfulness < 0.5);
    if (lowFaith.length > 0) {
      modes.push({
        type: "low_faithfulness",
        count: lowFaith.length,
        examples: lowFaith.slice(0, 3).map((r) => r.query),
        suggestedFix: "检查 LLM 是否正确使用了上下文，考虑添加 system prompt 约束",
      });
    }

    // 低 Recall
    const lowRecall = results.filter((r) => r.contextRecall < 0.5);
    if (lowRecall.length > 0) {
      modes.push({
        type: "low_recall",
        count: lowRecall.length,
        examples: lowRecall.slice(0, 3).map((r) => r.query),
        suggestedFix: "增加 topK、优化分块策略、添加 query expansion",
      });
    }

    // 低 Precision
    const lowPrec = results.filter((r) => r.contextPrecision < 0.5);
    if (lowPrec.length > 0) {
      modes.push({
        type: "low_precision",
        count: lowPrec.length,
        examples: lowPrec.slice(0, 3).map((r) => r.query),
        suggestedFix: "添加 Reranker、优化 Embedding 模型、调整相似度阈值",
      });
    }

    // 慢响应
    const slowResp = results.filter((r) => r.latencyMs > 5000);
    if (slowResp.length > 0) {
      modes.push({
        type: "slow_response",
        count: slowResp.length,
        examples: slowResp.slice(0, 3).map((r) => r.query),
        suggestedFix: "减少 topK、添加缓存、优化 Reranker 或切换为更快的模型",
      });
    }

    return modes;
  }

  // cosineSimilarity 实现见第 5 章 Context Engineering 的工具函数定义
  // 此处为简化展示，完整实现请参考 code-examples/shared/utils.ts
  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
    return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0;
  }
}
```

### 8.5.3 A/B 测试框架

在优化 RAG 系统时，需要对比不同配置的效果。以下是一个轻量级 A/B 测试框架：

```typescript
// ============================================================
// RAG A/B 测试框架
// ============================================================

interface ABTestConfig {
  name: string;
  description: string;
  pipelineA: RAGPipeline;   // 对照组
  pipelineB: RAGPipeline;   // 实验组
  testCases: RAGTestCase[];
}

interface ABTestReport {
  configName: string;
  winner: "A" | "B" | "tie";
  scoreComparison: {
    metric: string;
    pipelineA: number;
    pipelineB: number;
    improvement: string;
  }[];
}

class RAGABTester {
  private evaluatorA: RAGEvaluator;
  private evaluatorB: RAGEvaluator;

  constructor(
    llm: LLMClient,
    embeddingService: EmbeddingService,
    config: ABTestConfig
  ) {
    this.evaluatorA = new RAGEvaluator(llm, embeddingService, config.pipelineA);
    this.evaluatorB = new RAGEvaluator(llm, embeddingService, config.pipelineB);
  }

  async runTest(testCases: RAGTestCase[]): Promise<ABTestReport> {
    // 并行评估两条 Pipeline
    const [reportA, reportB] = await Promise.all([
      this.evaluatorA.evaluate(testCases),
      this.evaluatorB.evaluate(testCases),
    ]);

    const metrics = [
      "faithfulness",
      "answerRelevancy",
      "contextPrecision",
      "contextRecall",
      "answerCorrectness",
    ] as const;

    const comparison = metrics.map((metric) => {
      const scoreA = reportA.averageScores[metric];
      const scoreB = reportB.averageScores[metric];
      const diff = ((scoreB - scoreA) / scoreA) * 100;
      return {
        metric,
        pipelineA: scoreA,
        pipelineB: scoreB,
        improvement: `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`,
      };
    });

    // 判断赢家：多数指标更优者获胜
    const bWins = comparison.filter(
      (c) => c.pipelineB > c.pipelineA
    ).length;
    const aWins = comparison.filter(
      (c) => c.pipelineA > c.pipelineB
    ).length;

    return {
      configName: "A/B Test",
      winner: bWins > aWins ? "B" : aWins > bWins ? "A" : "tie",
      scoreComparison: comparison,
    };
  }
}
```

---

## 8.6 高级 RAG 模式

基础 RAG（Naive RAG）的"检索-生成"单次流程在面对复杂查询时效果有限。本节介绍四种高级 RAG 模式，它们引入了反馈循环、自我评估和动态策略选择。

### 8.6.1 Corrective RAG (CRAG)

CRAG 在检索后增加一个"校正"步骤：如果检索结果质量不佳，系统会自动回退到 Web 搜索或其他数据源补充信息。

```typescript
// ============================================================
// Corrective RAG (CRAG): 带校正的检索增强生成
// ============================================================

/** Web 搜索接口 */
interface WebSearchClient {
  search(query: string, maxResults: number): Promise<string[]>;
}

class CorrectiveRAG {
  private pipeline: RAGPipeline;
  private llm: LLMClient;
  private webSearch: WebSearchClient;
  private relevanceThreshold: number;

  constructor(config: {
    pipeline: RAGPipeline;
    llm: LLMClient;
    webSearch: WebSearchClient;
    relevanceThreshold?: number;
  }) {
    this.pipeline = config.pipeline;
    this.llm = config.llm;
    this.webSearch = config.webSearch;
    this.relevanceThreshold = config.relevanceThreshold ?? 0.5;
  }

  async query(userQuery: string): Promise<{
    answer: string;
    source: "knowledge_base" | "web_search" | "combined";
    confidence: number;
  }> {
    // 第一步：常规 RAG 检索
    const ragContext = await this.pipeline.query(userQuery, { topK: 10 });

    // 第二步：评估检索结果的相关性
    const relevanceScore = await this.evaluateRelevance(
      userQuery,
      ragContext.rerankedResults
    );

    let answer: string;
    let source: "knowledge_base" | "web_search" | "combined";

    if (relevanceScore >= this.relevanceThreshold) {
      // 检索结果足够好，直接使用
      answer = ragContext.generatedAnswer;
      source = "knowledge_base";
    } else if (relevanceScore < 0.2) {
      // 检索结果非常差，完全回退到 Web 搜索
      const webResults = await this.webSearch.search(userQuery, 5);
      const webContext = webResults.join("\n\n---\n\n");
      answer = await this.llm.generate(userQuery, webContext);
      source = "web_search";
    } else {
      // 部分相关：结合知识库和 Web 搜索结果
      const webResults = await this.webSearch.search(userQuery, 3);
      const combinedContext = [
        "## 知识库检索结果",
        ...ragContext.rerankedResults.map((r) => r.chunk.content),
        "\n## Web 搜索结果",
        ...webResults,
      ].join("\n\n");
      answer = await this.llm.generate(userQuery, combinedContext);
      source = "combined";
    }

    return { answer, source, confidence: relevanceScore };
  }

  /** 评估检索结果与查询的相关性 */
  private async evaluateRelevance(
    query: string,
    results: RetrievalResult[]
  ): Promise<number> {
    if (results.length === 0) return 0;

    const prompt = `请评估以下检索结果与用户问题的相关程度。
返回一个 0 到 1 之间的分数（0 = 完全不相关，1 = 高度相关）。
仅返回数字。

用户问题: "${query}"

检索结果:
${results
  .slice(0, 5)
  .map((r, i) => `${i + 1}. ${r.chunk.content.slice(0, 200)}`)
  .join("\n")}`;

    const response = await this.llm.generate(prompt, "");
    const score = parseFloat(response.trim());
    return isNaN(score) ? 0.5 : Math.max(0, Math.min(1, score));
  }
}
```

### 8.6.2 Self-RAG: 自我评估的 RAG

Self-RAG 让 Agent 自主决定**是否需要检索**、**检索结果是否有用**以及**生成的回答是否准确**：

```typescript
// ============================================================
// Self-RAG: 自我评估的检索增强生成
// ============================================================

type RetrievalDecision = "retrieve" | "no_retrieve";
type RelevanceJudgment = "relevant" | "irrelevant";
type SupportLevel = "fully_supported" | "partially_supported" | "no_support";

class SelfRAG {
  private pipeline: RAGPipeline;
  private llm: LLMClient;

  constructor(pipeline: RAGPipeline, llm: LLMClient) {
    this.pipeline = pipeline;
    this.llm = llm;
  }

  async query(userQuery: string): Promise<{
    answer: string;
    retrievalUsed: boolean;
    selfEvaluation: {
      needsRetrieval: RetrievalDecision;
      relevance: RelevanceJudgment;
      support: SupportLevel;
    };
  }> {
    // 反思 Token 1: 是否需要检索？
    const retrievalDecision = await this.shouldRetrieve(userQuery);

    if (retrievalDecision === "no_retrieve") {
      // 不需要检索，直接用 LLM 内部知识回答
      const answer = await this.llm.generate(userQuery, "");
      return {
        answer,
        retrievalUsed: false,
        selfEvaluation: {
          needsRetrieval: "no_retrieve",
          relevance: "relevant",
          support: "no_support",
        },
      };
    }

    // 执行检索
    const ragContext = await this.pipeline.query(userQuery, { topK: 5 });

    // 反思 Token 2: 检索结果是否相关？
    const relevance = await this.judgeRelevance(
      userQuery,
      ragContext.rerankedResults.map((r) => r.chunk.content)
    );

    // 反思 Token 3: 生成答案并评估支持度
    const support = await this.evaluateSupport(
      ragContext.generatedAnswer,
      ragContext.rerankedResults.map((r) => r.chunk.content)
    );

    // 如果支持度低，尝试重新生成
    let finalAnswer = ragContext.generatedAnswer;
    if (support === "no_support") {
      finalAnswer = await this.regenerateWithConstraint(
        userQuery,
        ragContext.rerankedResults.map((r) => r.chunk.content)
      );
    }

    return {
      answer: finalAnswer,
      retrievalUsed: true,
      selfEvaluation: {
        needsRetrieval: retrievalDecision,
        relevance,
        support,
      },
    };
  }

  /** 判断是否需要检索 */
  private async shouldRetrieve(query: string): Promise<RetrievalDecision> {
    const prompt = `判断以下问题是否需要检索外部知识库来回答。
对于事实性问题、领域特定问题、时效性问题，回答 "retrieve"。
对于常识性问题、数学计算、创意写作，回答 "no_retrieve"。
仅返回 "retrieve" 或 "no_retrieve"。

问题: "${query}"`;

    const response = await this.llm.generate(prompt, "");
    return response.trim().toLowerCase().includes("no_retrieve")
      ? "no_retrieve"
      : "retrieve";
  }

  /** 判断检索结果的相关性 */
  private async judgeRelevance(
    query: string,
    contexts: string[]
  ): Promise<RelevanceJudgment> {
    const prompt = `判断以下检索结果是否与问题相关。
仅返回 "relevant" 或 "irrelevant"。

问题: "${query}"
检索结果摘要: "${contexts.slice(0, 3).map((c) => c.slice(0, 100)).join(" | ")}"`;

    const response = await this.llm.generate(prompt, "");
    return response.trim().toLowerCase().includes("irrelevant")
      ? "irrelevant"
      : "relevant";
  }

  /** 评估回答的支持度 */
  private async evaluateSupport(
    answer: string,
    contexts: string[]
  ): Promise<SupportLevel> {
    const prompt = `评估以下回答被检索上下文支持的程度。
仅返回: "fully_supported"、"partially_supported" 或 "no_support"。

回答: "${answer}"
上下文: "${contexts.join(" ").slice(0, 3000)}"`;

    const response = await this.llm.generate(prompt, "");
    const lower = response.trim().toLowerCase();
    if (lower.includes("fully")) return "fully_supported";
    if (lower.includes("partial")) return "partially_supported";
    return "no_support";
  }

  /** 约束性重新生成 */
  private async regenerateWithConstraint(
    query: string,
    contexts: string[]
  ): Promise<string> {
    const prompt = `请严格基于以下上下文回答问题。
如果上下文中没有足够信息，请明确说明"根据现有信息无法完全回答"。
不要编造上下文中没有的信息。

问题: ${query}

上下文:
${contexts.join("\n\n---\n\n")}`;

    return this.llm.generate(prompt, "");
  }
}
```

### 8.6.3 Adaptive RAG: 动态策略选择

Adaptive RAG 根据查询的复杂度和类型，动态选择最合适的检索策略：

```typescript
// ============================================================
// Adaptive RAG: 根据查询类型动态选择检索策略
// ============================================================

type QueryComplexity = "simple" | "moderate" | "complex";
type RetrievalStrategy = "direct_llm" | "single_step_rag" | "multi_hop_rag" | "graph_rag";

class AdaptiveRAG {
  private llm: LLMClient;
  private pipeline: RAGPipeline;
  private graphRetriever: GraphAugmentedRetriever;

  constructor(
    llm: LLMClient,
    pipeline: RAGPipeline,
    graphRetriever: GraphAugmentedRetriever
  ) {
    this.llm = llm;
    this.pipeline = pipeline;
    this.graphRetriever = graphRetriever;
  }

  async query(userQuery: string): Promise<{
    answer: string;
    strategy: RetrievalStrategy;
    reasoning: string;
  }> {
    // 第一步：分析查询复杂度并选择策略
    const { strategy, reasoning } = await this.classifyQuery(userQuery);

    // 第二步：按选定策略执行
    let answer: string;

    switch (strategy) {
      case "direct_llm":
        // 简单问题直接用 LLM 回答
        answer = await this.llm.generate(userQuery, "");
        break;

      case "single_step_rag":
        // 标准 RAG 检索
        const ragResult = await this.pipeline.query(userQuery);
        answer = ragResult.generatedAnswer;
        break;

      case "multi_hop_rag":
        // 多跳检索（见 8.6.4）
        answer = await this.multiHopQuery(userQuery);
        break;

      case "graph_rag":
        // 图谱增强检索
        const graphContext = await this.graphRetriever.adaptiveSearch(
          userQuery
        );
        answer = await this.llm.generate(userQuery, graphContext);
        break;

      default:
        const ragFallback = await this.pipeline.query(userQuery);
        answer = ragFallback.generatedAnswer;
    }

    return { answer, strategy, reasoning };
  }

  /** 分类查询并选择策略 */
  private async classifyQuery(
    query: string
  ): Promise<{ strategy: RetrievalStrategy; reasoning: string }> {
    const prompt = `分析以下用户查询，选择最合适的回答策略。

策略选项:
1. direct_llm - 常识/简单计算/创意类问题，不需要检索
2. single_step_rag - 事实性问题，单次检索即可回答
3. multi_hop_rag - 复杂推理问题，需要多次检索串联信息
4. graph_rag - 涉及实体关系、需要全局概览的问题

返回 JSON 格式: {"strategy": "...", "reasoning": "..."}

查询: "${query}"`;

    try {
      const response = await this.llm.generate(prompt, "");
      return JSON.parse(response) as {
        strategy: RetrievalStrategy;
        reasoning: string;
      };
    } catch {
      return { strategy: "single_step_rag", reasoning: "默认策略" };
    }
  }

  /** 多跳检索实现 */
  private async multiHopQuery(
    query: string,
    maxHops: number = 3
  ): Promise<string> {
    let currentQuery = query;
    const collectedContexts: string[] = [];
    const queryChain: string[] = [query];

    for (let hop = 0; hop < maxHops; hop++) {
      // 第 N 跳检索
      const result = await this.pipeline.query(currentQuery, { topK: 3 });
      collectedContexts.push(
        ...result.rerankedResults.map((r) => r.chunk.content)
      );

      // 判断是否还需要继续检索
      const nextQueryPrompt = `基于用户原始问题和当前已检索到的信息，
判断是否还需要进一步检索。如果需要，生成下一步的检索查询。

原始问题: "${query}"
已收集的信息:
${collectedContexts.slice(-3).join("\n---\n")}

如果信息已足够回答问题，返回: {"done": true}
如果还需要检索，返回: {"done": false, "next_query": "..."}`;

      try {
        const nextStep = JSON.parse(
          await this.llm.generate(nextQueryPrompt, "")
        ) as { done: boolean; next_query?: string };

        if (nextStep.done || !nextStep.next_query) break;
        currentQuery = nextStep.next_query;
        queryChain.push(currentQuery);
      } catch {
        break;
      }
    }

    // 用所有收集到的上下文生成最终答案
    const finalContext = collectedContexts.join("\n\n---\n\n");
    const finalPrompt = `基于以下通过多轮检索收集到的信息，回答用户的原始问题。
检索链路: ${queryChain.join(" -> ")}

原始问题: ${query}

收集到的信息:
${finalContext}`;

    return this.llm.generate(finalPrompt, "");
  }
}
```

### 8.6.4 Agentic RAG：自主检索与推理

前面介绍的 Corrective RAG、Self-RAG 和 Adaptive RAG 都在检索管线的某个环节引入了"判断"能力。2025 年最重要的演进是把这些零散的判断统一交给一个 **AI Agent**，让它自主决定检索的全部策略——这就是 **Agentic RAG**。

> **核心定义** Agentic RAG = 由 AI Agent 自主驱动的 RAG 管线。Agent 负责四个决策：
> - **WHEN**：是否需要检索（不是每个查询都需要外部知识）
> - **WHAT**：检索什么（查询改写、查询分解）
> - **WHERE**：从哪里检索（跨多个知识源的动态路由）
> - **HOW**：如何组合结果（迭代精炼、交叉验证）

#### 与其他 RAG 模式的对比

| 特性 | Naive RAG | Corrective RAG | Self-RAG | Agentic RAG |
|------|-----------|---------------|---------|------------|
| 检索决策 | 始终检索 | 始终检索 | 自判断 | 自主决策 |
| 检索轮次 | 单轮 | 单轮+修正 | 多轮 | 多轮+迭代 |
| 来源选择 | 固定 | 固定 | 固定 | 动态路由 |
| 结果评估 | 无 | 有 | 有 | 有+反思 |
| 查询理解 | 原始透传 | 原始透传 | 改写 | 分解+改写+路由 |
| 适用复杂度 | 简单事实 | 简单事实 | 中等推理 | 复杂多跳推理 |

关键区别在于：Agentic RAG 不再把检索当作管线中的固定步骤，而是当作 Agent 工具箱中的一组工具，由 Agent 根据推理需要自主调用。

#### 架构实现

```typescript
// ============================================================
// Agentic RAG Engine: Agent 自主驱动的检索与推理
// ============================================================

interface KnowledgeSource {
  name: string;
  type: "vector_db" | "sql_db" | "api" | "web_search" | "knowledge_graph";
  description: string;                    // Agent 用来决策路由的描述
  query: (q: string) => Promise<RetrievalResult[]>;
}

interface RetrievalDecision {
  shouldRetrieve: boolean;
  reason: string;
  confidence: number;
}

interface SubQuery {
  text: string;
  intent: string;
  targetSources: string[];               // 推荐的知识源名称
}

interface EvaluationResult {
  score: number;                          // 0-1，结果充分度
  gaps: string[];                         // 缺失的信息
  suggestions: string[];                  // 下一步检索建议
}

class AgenticRAGEngine {
  private sources: Map<string, KnowledgeSource> = new Map();
  private llm: LLMClient;
  private tokenBudget: number;
  private tokensUsed: number = 0;

  constructor(
    llm: LLMClient,
    sources: KnowledgeSource[],
    tokenBudget: number = 8000           // 控制检索成本
  ) {
    this.llm = llm;
    this.tokenBudget = tokenBudget;
    for (const source of sources) {
      this.sources.set(source.name, source);
    }
  }

  // ---- 决策 1: WHEN — 是否需要检索 ----
  async shouldRetrieve(
    query: string,
    conversationContext: string
  ): Promise<RetrievalDecision> {
    const prompt = `你是一个检索决策器。判断以下查询是否需要外部知识检索。

查询: ${query}
对话上下文: ${conversationContext}

不需要检索的情况:
- 简单的问候、闲聊
- LLM 自身知识可以可靠回答的通识问题
- 上下文中已经包含充分信息

需要检索的情况:
- 涉及特定领域的专业知识
- 需要最新信息或实时数据
- 上下文信息不充分

返回 JSON: { "shouldRetrieve": boolean, "reason": string, "confidence": number }`;

    const response = await this.llm.generate(prompt, "");
    return JSON.parse(response);
  }

  // ---- 决策 2: WHAT — 查询分解 ----
  async decomposeQuery(query: string): Promise<SubQuery[]> {
    const sourceDescriptions = Array.from(this.sources.entries())
      .map(([name, s]) => `- ${name} (${s.type}): ${s.description}`)
      .join("\n");

    const prompt = `将以下复杂查询分解为可独立检索的子查询。

原始查询: ${query}

可用知识源:
${sourceDescriptions}

要求:
1. 每个子查询应聚焦于一个信息需求
2. 为每个子查询推荐最合适的知识源
3. 简单查询无需分解，直接返回原始查询

返回 JSON 数组: [{ "text": string, "intent": string, "targetSources": string[] }]`;

    const response = await this.llm.generate(prompt, "");
    return JSON.parse(response);
  }

  // ---- 决策 3: WHERE — 动态路由 ----
  async routeQuery(subQuery: SubQuery): Promise<RetrievalResult[]> {
    const allResults: RetrievalResult[] = [];

    for (const sourceName of subQuery.targetSources) {
      const source = this.sources.get(sourceName);
      if (!source) continue;

      const results = await source.query(subQuery.text);
      allResults.push(
        ...results.map((r) => ({ ...r, source: sourceName }))
      );
    }

    return allResults;
  }

  // ---- 决策 4: HOW — 结果评估与反思 ----
  async evaluateResults(
    results: RetrievalResult[],
    query: string
  ): Promise<EvaluationResult> {
    const context = results
      .map((r, i) => `[${i + 1}] (来源: ${r.source}) ${r.content}`)
      .join("\n\n");

    const prompt = `评估以下检索结果是否充分回答了查询。

查询: ${query}

检索结果:
${context}

评估维度:
1. 完整性: 是否覆盖了查询的所有方面
2. 准确性: 信息是否可靠，来源是否权威
3. 时效性: 信息是否足够新

返回 JSON: { "score": number, "gaps": string[], "suggestions": string[] }`;

    const response = await this.llm.generate(prompt, "");
    return JSON.parse(response);
  }

  // ---- 核心: 迭代精炼检索 ----
  async iterativeRefine(
    query: string,
    maxRounds: number = 3
  ): Promise<{ context: string; rounds: number; decisions: string[] }> {
    const decisions: string[] = [];
    let allResults: RetrievalResult[] = [];

    for (let round = 0; round < maxRounds; round++) {
      // 第一轮: 分解原始查询; 后续轮: 根据 gaps 生成补充查询
      const subQueries =
        round === 0
          ? await this.decomposeQuery(query)
          : await this.decomposeQuery(
              `基于已有信息的不足，补充检索: ${query}\n缺失信息: ${allResults.length > 0 ? (await this.evaluateResults(allResults, query)).gaps.join(", ") : "全部"}`
            );

      decisions.push(
        `Round ${round + 1}: 生成 ${subQueries.length} 个子查询`
      );

      // 执行检索
      for (const sq of subQueries) {
        if (this.tokensUsed >= this.tokenBudget) {
          decisions.push(`Token 预算耗尽，停止检索`);
          break;
        }
        const results = await this.routeQuery(sq);
        allResults.push(...results);
        this.tokensUsed += results.reduce(
          (sum, r) => sum + this.estimateTokens(r.content), 0
        );
      }

      // 评估结果充分度
      const evaluation = await this.evaluateResults(allResults, query);
      decisions.push(
        `Round ${round + 1} 评估: score=${evaluation.score.toFixed(2)}`
      );

      // 充分度足够高则提前终止
      if (evaluation.score >= 0.85) {
        decisions.push(`信息充分，结束检索`);
        break;
      }

      // 没有改进建议也终止
      if (evaluation.suggestions.length === 0) {
        decisions.push(`无进一步检索建议，结束`);
        break;
      }
    }

    const context = allResults
      .map((r) => `[${r.source}] ${r.content}`)
      .join("\n\n");

    return { context, rounds: decisions.length, decisions };
  }

  // ---- 完整的 Agentic RAG 流程 ----
  async answer(
    query: string,
    conversationContext: string = ""
  ): Promise<{ answer: string; trace: string[] }> {
    const trace: string[] = [];

    // Step 1: 决定是否需要检索
    const decision = await this.shouldRetrieve(query, conversationContext);
    trace.push(`检索决策: ${decision.shouldRetrieve} (${decision.reason})`);

    if (!decision.shouldRetrieve) {
      const answer = await this.llm.generate(query, conversationContext);
      trace.push("直接由 LLM 回答，无需检索");
      return { answer, trace };
    }

    // Step 2: 迭代检索
    const { context, decisions } = await this.iterativeRefine(query);
    trace.push(...decisions);

    // Step 3: 基于检索结果生成回答
    const finalPrompt = `基于以下检索到的信息回答用户问题。
如果检索信息不足以回答，请明确指出哪些部分是基于检索，哪些是推断。

用户问题: ${query}

检索信息:
${context}`;

    const answer = await this.llm.generate(finalPrompt, conversationContext);
    trace.push("基于检索结果生成最终回答");

    return { answer, trace };
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 3);
  }
}
```

#### 关键设计模式

**检索路由（Retrieval Routing）**：不同类型的查询路由到不同的知识源。事实型查询优先走向量数据库；数据分析型查询路由到 SQL 数据库；需要最新信息的查询路由到 Web 搜索。路由决策本身由 LLM 完成，这也是"Agentic"的核心含义。

**迭代深化（Iterative Deepening）**：第一轮做宽泛检索获取整体上下文，Agent 评估结果后识别信息缺口，生成更有针对性的后续查询。这类似于人类研究者的工作方式——先快速浏览，再深入细节。

**自我反思（Self-Reflection）**：Agent 在生成最终回答前评估检索结果的充分度。如果置信度不够，要么继续检索，要么在回答中明确标注不确定的部分。这避免了传统 RAG 中"有检索结果就一定用"的盲目性。

#### 生产注意事项

在生产环境中部署 Agentic RAG 需要注意以下平衡：

- **Token 预算管理**：每轮 LLM 调用（决策、评估、生成）都消耗 Token。设置严格的预算上限，避免复杂查询触发无限循环检索。
- **延迟与质量的权衡**：迭代检索显著增加端到端延迟。对于延迟敏感的场景，可设置最大轮次为 1-2 轮；对于质量优先的场景（如法律、医疗），允许 3-5 轮迭代。
- **降级策略**：当 Agent 决策模块出错或超时时，自动降级为标准 RAG（直接检索 + 生成），保证系统可用性。
- **决策追踪**：记录每一步的决策理由（`trace`），便于调试和审计。这在受监管行业中尤为重要。

---

## 8.7 生产环境部署

将 RAG 系统从原型推进到生产环境，需要解决规模化索引、向量数据库选型、缓存策略和成本控制等工程难题。

### 8.7.1 规模化索引策略

在生产环境中，文档数量可能达到数百万级。索引策略需要支持批量处理、增量更新和实时索引三种模式：

```typescript
// ============================================================
// 规模化索引管理器
// ============================================================

/** 索引任务 */
interface IndexJob {
  id: string;
  type: "full" | "incremental" | "realtime";
  documents: Document[];
  status: "pending" | "processing" | "completed" | "failed";
  progress: { processed: number; total: number; errors: number };
  startedAt?: Date;
  completedAt?: Date;
}

class IndexingManager {
  private pipeline: RAGPipeline;
  private batchSize: number;
  private concurrency: number;
  private documentHashes: Map<string, string>; // 用于增量更新的文档指纹

  constructor(config: {
    pipeline: RAGPipeline;
    batchSize?: number;
    concurrency?: number;
  }) {
    this.pipeline = config.pipeline;
    this.batchSize = config.batchSize ?? 50;
    this.concurrency = config.concurrency ?? 3;
    this.documentHashes = new Map();
  }

  /** 全量索引：清空并重建整个索引 */
  async fullIndex(documents: Document[]): Promise<IndexJob> {
    const job: IndexJob = {
      id: `full_${Date.now()}`,
      type: "full",
      documents,
      status: "processing",
      progress: { processed: 0, total: documents.length, errors: 0 },
      startedAt: new Date(),
    };

    console.log(`开始全量索引，共 ${documents.length} 个文档`);

    // 分批处理
    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);

      try {
        await this.pipeline.indexDocuments(batch);
        job.progress.processed += batch.length;

        // 记录文档指纹（用于后续增量更新）
        for (const doc of batch) {
          this.documentHashes.set(doc.id, this.hashContent(doc.content));
        }
      } catch (error) {
        job.progress.errors += batch.length;
        console.error(`批次 ${i} 索引失败: ${(error as Error).message}`);
      }

      // 打印进度
      const pct = ((job.progress.processed / job.progress.total) * 100).toFixed(1);
      console.log(
        `进度: ${pct}% (${job.progress.processed}/${job.progress.total})`
      );
    }

    job.status = job.progress.errors === 0 ? "completed" : "failed";
    job.completedAt = new Date();
    return job;
  }

  /** 增量索引：只处理新增和修改的文档 */
  async incrementalIndex(documents: Document[]): Promise<IndexJob> {
    // 过滤出需要更新的文档
    const changedDocs = documents.filter((doc) => {
      const oldHash = this.documentHashes.get(doc.id);
      const newHash = this.hashContent(doc.content);
      return oldHash !== newHash; // 内容变化了才需要重新索引
    });

    console.log(
      `增量索引: ${documents.length} 个文档中有 ${changedDocs.length} 个需要更新`
    );

    if (changedDocs.length === 0) {
      return {
        id: `incr_${Date.now()}`,
        type: "incremental",
        documents: [],
        status: "completed",
        progress: { processed: 0, total: 0, errors: 0 },
      };
    }

    return this.fullIndex(changedDocs);
  }

  /** 实时索引：单个文档的即时索引 */
  async realtimeIndex(document: Document): Promise<void> {
    try {
      await this.pipeline.indexDocuments([document]);
      this.documentHashes.set(document.id, this.hashContent(document.content));
      console.log(`实时索引完成: ${document.id}`);
    } catch (error) {
      console.error(`实时索引失败: ${(error as Error).message}`);
      throw error;
    }
  }

  /** 简单的内容哈希（生产中应使用 SHA-256） */
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // 转为 32 位整数
    }
    return hash.toString(16);
  }
}
```

### 8.7.2 向量数据库选型

| 数据库 | 类型 | 优势 | 劣势 | 适用场景 | 价格模式 |
|--------|------|------|------|---------|---------|
| Pinecone | 全托管 SaaS | 零运维、自动扩缩容 | 供应商锁定、成本不透明 | 快速上线、中小规模 | 按量付费 |
| Weaviate | 开源/云端 | 内置向量化、模块化 | 大规模时内存消耗高 | 需要内置 ML 能力 | 开源免费/云端付费 |
| Milvus | 开源分布式 | 超大规模、高性能 | 运维复杂 | 十亿级向量、企业级 | 开源免费/Zilliz 云 |
| Qdrant | 开源/云端 | Rust 高性能、过滤能力强 | 生态较新 | 需要复杂过滤条件 | 开源免费/云端付费 |
| pgvector | PostgreSQL 扩展 | 与现有 PG 集成 | 大规模性能有限 | 已有 PG、百万级以下 | 随 PG 定价 |
| ChromaDB | 开源嵌入式 | 轻量、开发友好 | 不适合大规模生产 | 原型开发、本地测试 | 开源免费 |

### 8.7.3 多级缓存策略

RAG 系统的响应延迟主要来自 Embedding 计算和 LLM 调用。通过多级缓存可以显著降低延迟和成本：

```typescript
// ============================================================
// RAG 多级缓存系统
// ============================================================

/** 缓存接口 */
interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
}

/** 缓存统计 */
interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
}

class RAGCache {
  private queryCache: CacheStore;       // 查询级缓存: query -> answer
  private embeddingCache: CacheStore;   // Embedding 缓存: text -> embedding
  private resultCache: CacheStore;      // 检索结果缓存: query -> results
  private stats: { hits: number; misses: number };

  constructor(config: {
    queryCache: CacheStore;
    embeddingCache: CacheStore;
    resultCache: CacheStore;
  }) {
    this.queryCache = config.queryCache;
    this.embeddingCache = config.embeddingCache;
    this.resultCache = config.resultCache;
    this.stats = { hits: 0, misses: 0 };
  }

  /** 查询级缓存: 完全相同的问题直接返回缓存答案 */
  async getCachedAnswer(query: string): Promise<string | null> {
    const key = `answer:${this.normalizeQuery(query)}`;
    const cached = await this.queryCache.get(key);
    if (cached) {
      this.stats.hits++;
      return cached;
    }
    this.stats.misses++;
    return null;
  }

  async cacheAnswer(
    query: string,
    answer: string,
    ttlSeconds: number = 3600
  ): Promise<void> {
    const key = `answer:${this.normalizeQuery(query)}`;
    await this.queryCache.set(key, answer, ttlSeconds);
  }

  /** Embedding 缓存: 避免重复计算相同文本的 Embedding */
  async getCachedEmbedding(text: string): Promise<number[] | null> {
    const key = `emb:${this.hashText(text)}`;
    const cached = await this.embeddingCache.get(key);
    if (cached) {
      this.stats.hits++;
      return JSON.parse(cached) as number[];
    }
    this.stats.misses++;
    return null;
  }

  async cacheEmbedding(
    text: string,
    embedding: number[],
    ttlSeconds: number = 86400
  ): Promise<void> {
    const key = `emb:${this.hashText(text)}`;
    await this.embeddingCache.set(key, JSON.stringify(embedding), ttlSeconds);
  }

  /** 语义缓存: 相似的问题命中缓存（需要 Embedding 比较） */
  async getSemanticallySimilarAnswer(
    queryEmbedding: number[],
    threshold: number = 0.95
  ): Promise<string | null> {
    // 在实际实现中，这里应该在向量索引中搜索相似的历史查询
    // 如果相似度超过阈值，直接返回缓存的答案
    // 此处为概念性实现
    return null;
  }

  /** 获取缓存统计信息 */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  /** 查询标准化: 去除多余空格、统一大小写 */
  private normalizeQuery(query: string): string {
    return query.trim().toLowerCase().replace(/\s+/g, " ");
  }

  /** 文本哈希 */
  private hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < Math.min(text.length, 1000); i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash.toString(16);
  }
}
```

### 8.7.4 成本优化策略

RAG 系统的主要成本来自三个方面：Embedding API 调用、Reranker 推理和 LLM 生成。以下是成本优化的实践建议：

```typescript
// ============================================================
// 成本感知的 RAG 路由器
// ============================================================

interface CostConfig {
  embeddingCostPer1kTokens: number;   // 美元
  rerankerCostPerPair: number;        // 美元
  llmCostPer1kInputTokens: number;    // 美元
  llmCostPer1kOutputTokens: number;   // 美元
  monthlyBudget: number;              // 月度预算（美元）
}

class CostAwareRouter {
  private costConfig: CostConfig;
  private monthlySpent: number = 0;
  private costLog: Array<{ timestamp: Date; operation: string; cost: number }> = [];

  constructor(costConfig: CostConfig) {
    this.costConfig = costConfig;
  }

  /** 根据剩余预算决定是否使用昂贵的 Reranker */
  shouldUseReranker(): boolean {
    const remaining = this.costConfig.monthlyBudget - this.monthlySpent;
    const budgetRatio = remaining / this.costConfig.monthlyBudget;

    // 预算剩余不足 20% 时跳过 Reranker
    if (budgetRatio < 0.2) {
      console.warn("预算紧张，跳过 Reranker");
      return false;
    }
    return true;
  }

  /** 根据查询复杂度选择 LLM */
  selectModel(queryComplexity: QueryComplexity): string {
    const remaining = this.costConfig.monthlyBudget - this.monthlySpent;
    const budgetRatio = remaining / this.costConfig.monthlyBudget;

    if (budgetRatio < 0.1) {
      return "gpt-4o-mini"; // 最便宜的模型
    }

    switch (queryComplexity) {
      case "simple":
        return "gpt-4o-mini";     // 简单问题用小模型
      case "moderate":
        return "gpt-4o";          // 中等复杂度
      case "complex":
        return "claude-sonnet-4";   // 复杂问题用高能力模型
      default:
        return "gpt-4o";
    }
  }

  /** 记录一次操作的成本 */
  recordCost(operation: string, cost: number): void {
    this.monthlySpent += cost;
    this.costLog.push({
      timestamp: new Date(),
      operation,
      cost,
    });
  }

  /** 估算一次 RAG 查询的成本 */
  estimateQueryCost(config: {
    inputTokens: number;
    outputTokens: number;
    rerankerPairs: number;
    useReranker: boolean;
  }): number {
    let cost = 0;

    // Embedding 成本
    cost +=
      (config.inputTokens / 1000) * this.costConfig.embeddingCostPer1kTokens;

    // Reranker 成本
    if (config.useReranker) {
      cost += config.rerankerPairs * this.costConfig.rerankerCostPerPair;
    }

    // LLM 成本
    cost +=
      (config.inputTokens / 1000) * this.costConfig.llmCostPer1kInputTokens;
    cost +=
      (config.outputTokens / 1000) * this.costConfig.llmCostPer1kOutputTokens;

    return cost;
  }

  /** 获取月度成本报告 */
  getMonthlySummary(): {
    totalSpent: number;
    remaining: number;
    projectedMonthly: number;
    costByOperation: Record<string, number>;
  } {
    const costByOp: Record<string, number> = {};
    for (const log of this.costLog) {
      costByOp[log.operation] = (costByOp[log.operation] ?? 0) + log.cost;
    }

    // 预估月度总成本（基于已有数据线性外推）
    const dayOfMonth = new Date().getDate();
    const projected = (this.monthlySpent / dayOfMonth) * 30;

    return {
      totalSpent: this.monthlySpent,
      remaining: this.costConfig.monthlyBudget - this.monthlySpent,
      projectedMonthly: projected,
      costByOperation: costByOp,
    };
  }
}
```

### 8.7.5 完整的生产级 RAG 服务

将前面所有组件整合为一个完整的生产级 RAG 服务：

```typescript
// ============================================================
// 生产级 RAG 服务: 整合所有组件
// ============================================================

interface RAGServiceConfig {
  embeddingService: EmbeddingService;
  vectorStore: VectorStore;
  chunker: Chunker;
  reranker: Reranker;
  llm: LLMClient;
  cache: RAGCache;
  costRouter: CostAwareRouter;
  logLevel: LogLevel;
}

class ProductionRAGService {
  private pipeline: RAGPipeline;
  private queryExpander: QueryExpander;
  private cache: RAGCache;
  private costRouter: CostAwareRouter;
  private indexingManager: IndexingManager;

  constructor(config: RAGServiceConfig) {
    this.pipeline = new RAGPipelineBuilder()
      .withEmbeddingService(config.embeddingService)
      .withVectorStore(config.vectorStore)
      .withChunker(config.chunker)
      .withReranker(config.reranker)
      .withLLMClient(config.llm)
      .withLogLevel(config.logLevel)
      .build();

    this.queryExpander = new QueryExpander(config.llm, config.embeddingService);
    this.cache = config.cache;
    this.costRouter = config.costRouter;
    this.indexingManager = new IndexingManager({
      pipeline: this.pipeline,
      batchSize: 50,
    });
  }

  /** 处理用户查询——完整生产链路 */
  async handleQuery(
    query: string,
    userId: string,
    options: { permissions?: string[] } = {}
  ): Promise<{
    answer: string;
    sources: Array<{ title: string; source: string }>;
    cached: boolean;
    costEstimate: number;
  }> {
    // 第一层: 查询缓存命中
    const cachedAnswer = await this.cache.getCachedAnswer(query);
    if (cachedAnswer) {
      return {
        answer: cachedAnswer,
        sources: [],
        cached: true,
        costEstimate: 0,
      };
    }

    // 第二层: 查询预处理
    const expandedQuery = await this.queryExpander.expand(query);

    // 第三层: 执行 RAG 查询
    const ragContext = await this.pipeline.query(
      expandedQuery.hypotheticalDoc ?? query,
      {
        topK: this.costRouter.shouldUseReranker() ? 20 : 5,
        filter: options.permissions
          ? { permissions: { $containsAny: options.permissions } }
          : undefined,
        includeMetrics: true,
      }
    );

    // 第四层: 缓存结果
    await this.cache.cacheAnswer(query, ragContext.generatedAnswer);

    // 第五层: 记录成本
    const cost = this.costRouter.estimateQueryCost({
      inputTokens: query.length / 3,
      outputTokens: ragContext.generatedAnswer.length / 3,
      rerankerPairs: ragContext.rerankedResults.length,
      useReranker: this.costRouter.shouldUseReranker(),
    });
    this.costRouter.recordCost("query", cost);

    // 构建来源引用
    const sources = ragContext.rerankedResults.map((r) => ({
      title: r.chunk.metadata.documentMetadata.title ?? "未知",
      source: r.chunk.metadata.documentMetadata.source,
    }));

    return {
      answer: ragContext.generatedAnswer,
      sources,
      cached: false,
      costEstimate: cost,
    };
  }

  /** 健康检查 */
  async healthCheck(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    components: Record<string, boolean>;
    cacheStats: CacheStats;
    costSummary: ReturnType<CostAwareRouter["getMonthlySummary"]>;
  }> {
    const cacheStats = this.cache.getStats();
    const costSummary = this.costRouter.getMonthlySummary();

    // 简单健康检查：尝试执行一个简单的 Embedding
    let embeddingOk = false;
    try {
      await this.pipeline.query("health check", { topK: 1 });
      embeddingOk = true;
    } catch {
      embeddingOk = false;
    }

    const status = embeddingOk ? "healthy" : "unhealthy";

    return {
      status,
      components: {
        embedding: embeddingOk,
        cache: cacheStats.hitRate >= 0,
        budget: costSummary.remaining > 0,
      },
      cacheStats,
      costSummary,
    };
  }
}
```

### 8.7.6 嵌入模型选型与多向量检索

嵌入模型（Embedding Model）是 RAG 系统的"感知层"——它决定了系统能"看懂"什么。选错模型，后续的检索和生成再精巧也无济于事。本节系统梳理选型维度，并介绍正在改变检索范式的多向量方法。

#### 选型维度

| 维度 | 考量因素 | 推荐 |
|------|----------|------|
| 维度数 | 384 / 768 / 1024 / 1536 / 3072 | 768-1024 性价比最优 |
| 多语言 | 中英混合语料 | multilingual-e5-large, BGE-M3 |
| 领域适配 | 代码 / 法律 / 医学 | 领域微调模型 |
| 推理速度 | 实时交互 vs 离线批量 | 小模型实时，大模型批量 |
| 上下文长度 | 512 / 8192+ tokens | 长文档用 8K+ 模型 |
| 量化支持 | 二进制 / int8 / float16 | 大规模场景用量化降本 |

#### 主流模型对比（2025-2026）

```typescript
// ============================================================
// 嵌入模型选型参考: 主流模型特性对比
// ============================================================

interface EmbeddingModelSpec {
  name: string;
  provider: string;
  dimensions: number;
  maxTokens: number;
  multilingual: boolean;
  strengths: string[];
}

const EMBEDDING_MODELS_2025: EmbeddingModelSpec[] = [
  {
    name: "text-embedding-3-large",
    provider: "OpenAI",
    dimensions: 3072,                     // 支持降维到 256/1024
    maxTokens: 8191,
    multilingual: true,
    strengths: ["维度灵活可调", "生态成熟", "Matryoshka 表示"],
  },
  {
    name: "embed-v4",
    provider: "Cohere",
    dimensions: 1024,
    maxTokens: 512,
    multilingual: true,
    strengths: ["压缩感知", "int8/binary 量化", "搜索质量领先"],
  },
  {
    name: "BGE-M3",
    provider: "BAAI (智源)",
    dimensions: 1024,
    maxTokens: 8192,
    multilingual: true,
    strengths: ["多粒度检索", "开源可私有部署", "中文表现优秀"],
  },
  {
    name: "voyage-code-3",
    provider: "Voyage AI",
    dimensions: 1024,
    maxTokens: 16000,
    multilingual: false,
    strengths: ["代码检索专精", "长上下文", "多语言代码"],
  },
  {
    name: "jina-embeddings-v3",
    provider: "Jina AI",
    dimensions: 1024,
    maxTokens: 8192,
    multilingual: true,
    strengths: ["Task LoRA 适配", "开源", "多任务切换"],
  },
];
```

选型原则：优先在 MTEB（Massive Text Embedding Benchmark）排行榜上验证目标语言和任务类型的表现，再结合成本和部署约束做最终决策。

#### ColBERT：晚期交互检索

传统嵌入模型为每个文档生成**单一向量**——无论文档多长、内容多丰富，都被压缩到一个固定维度的点。这导致了信息瓶颈：多面向的查询难以用单个向量精确匹配。

ColBERT（Contextualized Late Interaction over BERT）采用了完全不同的策略——**为每个 Token 生成独立的向量**，在检索时进行"晚期交互"：

```typescript
// ============================================================
// 单向量 vs 多向量检索: 概念对比
// ============================================================

// ---- 传统单向量模型 ----
interface SingleVectorModel {
  // 整个文档 → 1 个向量
  encode(text: string): number[];         // e.g., [0.12, -0.34, ...] (1024 维)
}

// 相似度计算: 简单的余弦相似度
function singleVectorSimilarity(
  queryVec: number[],
  docVec: number[]
): number {
  return cosineSimilarity(queryVec, docVec);
}

// ---- ColBERT 多向量模型 ----
interface ColBERTModel {
  // 每个 Token → 1 个向量，文档 → N 个向量
  encode(text: string): number[][];       // e.g., [[0.12, ...], [0.08, ...], ...] (N × 128 维)
}

// 相似度计算: MaxSim 操作
function maxSimSimilarity(
  queryTokenVecs: number[][],             // Q 个查询 Token 向量
  docTokenVecs: number[][]                // D 个文档 Token 向量
): number {
  let totalScore = 0;

  for (const qVec of queryTokenVecs) {
    // 对每个查询 Token，找到与文档中最相似的 Token
    let maxSim = -Infinity;
    for (const dVec of docTokenVecs) {
      const sim = cosineSimilarity(qVec, dVec);
      if (sim > maxSim) maxSim = sim;
    }
    totalScore += maxSim;                 // 累加每个查询 Token 的最大相似度
  }

  return totalScore;
}
```

**MaxSim 的直觉**：查询"TypeScript 的类型推断和编译性能"包含两个意图——"类型推断"和"编译性能"。单向量模型必须用一个向量同时表达两者，往往顾此失彼。ColBERT 让"类型"、"推断"、"编译"、"性能"各自的 Token 向量独立匹配文档中对应的内容，每个意图都能精确对齐。

**ColBERT 的优势**：
- 多面向查询的精确匹配，检索质量显著优于单向量
- Token 级别的细粒度交互，适合长文档场景
- 文档端向量可以预计算和索引，查询延迟可控

**代价**：存储空间大幅增加（每个文档从 1 个向量变为数百个向量），需要专门的索引结构（如 PLAID）支持高效检索。

#### ColPali：多模态文档检索

真实世界的文档不只有纯文本——PDF 中的图表、表格、流程图往往包含关键信息。传统 RAG 依赖 OCR 和布局解析来提取这些内容，但提取质量往往不稳定。

ColPali 将 ColBERT 的多向量思想扩展到视觉领域：直接对文档页面的**截图**生成 Patch 级别的嵌入向量，无需 OCR：

```typescript
// ============================================================
// ColPali: 基于视觉语言模型的多模态文档检索
// ============================================================

interface ColPaliModel {
  // 文档页面截图 → 每个图像 Patch 的向量
  encodeImage(pageScreenshot: ImageData): number[][];   // P 个 Patch 向量

  // 文本查询 → 每个 Token 的向量 (与 ColBERT 一致)
  encodeQuery(query: string): number[][];               // Q 个 Token 向量
}

// 检索流程: 与 ColBERT 的 MaxSim 完全一致
function colPaliRetrieval(
  model: ColPaliModel,
  query: string,
  pageImages: ImageData[]
): Array<{ pageIndex: number; score: number }> {
  const queryVecs = model.encodeQuery(query);

  return pageImages
    .map((img, idx) => {
      const patchVecs = model.encodeImage(img);
      // 复用 MaxSim: 查询 Token 向量 × 图像 Patch 向量
      const score = maxSimSimilarity(queryVecs, patchVecs);
      return { pageIndex: idx, score };
    })
    .sort((a, b) => b.score - a.score);
}
```

**ColPali 的核心价值**：
- **跳过 OCR**：直接处理页面图像，避免 OCR 错误和布局解析的复杂性
- **理解视觉元素**：图表、表格、公式等视觉信息被原生理解，而非丢失
- **端到端简化**：文档处理管线从"PDF → OCR → 文本分块 → 嵌入"简化为"PDF → 截图 → Patch 嵌入"

**适用场景**：包含大量图表和表格的技术文档、扫描版 PDF、排版复杂的金融报告等。

#### 选型决策树

根据实际场景选择合适的嵌入与检索策略：

```
查询和文档类型?
├── 纯文本，查询简单 → 单向量模型 (text-embedding-3, BGE-M3)
│   └── 成本敏感? → 量化 + Matryoshka 降维
├── 纯文本，查询复杂/多面向 → ColBERT 多向量
│   └── 存储受限? → ColBERTv2 + PLAID 压缩索引
├── 包含图表/表格的文档 → ColPali 多模态
│   └── 混合场景? → ColPali 检索 + 文本精排
└── 代码库 → 代码专用模型 (voyage-code-3)
    └── 多语言代码? → 通用代码模型
```

> **实践建议**：大多数项目应从单向量模型起步（成熟、成本低、生态好），在确认检索质量是瓶颈后再评估 ColBERT 或 ColPali。过早引入多向量方案会增加存储成本和系统复杂度。

---

## 8.8 本章小结

本章系统讲解了 RAG 与知识工程的完整技术栈。回顾核心要点：

### 关键知识点

| 主题 | 核心内容 | 关键收获 |
|------|---------|---------|
| **8.1 Pipeline 架构** | 离线索引 + 在线查询的双 Pipeline 设计 | Builder 模式配置、观测器追踪每个阶段 |
| **8.2 分块策略** | 6 种分块策略的对比与实现 | 没有万能策略，需根据文档类型选择 |
| **8.3 混合检索** | Dense + Sparse + RRF 融合 | HyDE、Contextual Retrieval 等前沿技术 |
| **8.4 GraphRAG** | 知识图谱构建与检索 | Local/Global 双模式检索 |
| **8.5 评估体系** | RAGAS 框架五大指标 | 自动化评估 + A/B 测试 |
| **8.6 高级模式** | CRAG、Self-RAG、Adaptive RAG | 多跳推理、自我校正、动态策略 |
| **8.7 生产部署** | 向量库选型、缓存、成本优化 | 规模化索引、成本感知路由 |

### 最佳实践清单

1. **分块策略选择**: 优先使用 Recursive Chunker 作为基线，再根据效果切换到 Semantic 或 Parent-Child 策略。
2. **混合检索是标配**: 永远不要只用 Dense Retrieval，BM25 + Dense + RRF 的组合在绝大多数场景下优于单一策略。
3. **Reranker 是性价比最高的优化**: 加入 Cross-Encoder Reranker 通常能提升 5-15% 的准确率，成本远低于更换 LLM。
4. **Contextual Retrieval**: Anthropic 的方法简单有效，索引时为每个 chunk 加上上下文前缀即可获得显著提升。
5. **评估驱动优化**: 在修改任何 RAG 配置前，先建立自动化评估 Pipeline，用数据说话。
6. **缓存三级策略**: 查询缓存 -> Embedding 缓存 -> 语义缓存，可以将 90% 的重复查询成本降至接近零。
7. **成本意识**: 生产系统必须有成本监控，根据预算动态调整 Reranker 使用和模型选择。

### 下一步

本章的 RAG 系统为 Agent 提供了强大的外部知识获取能力。下一章（第九章）我们将进入 Multi-Agent 领域，探讨多 Agent 编排基础——包括 ADK 三原语、Agent 间通信机制、共享状态协调与容错恢复。

---

> **本章参考资料**
>
> - Lewis et al., "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks" (2020)
> - Gao et al., "Retrieval-Augmented Generation for Large Language Models: A Survey" (2024)
> - Edge et al., "From Local to Global: A Graph RAG Approach to Query-Focused Summarization" (2024)
> - Anthropic, "Introducing Contextual Retrieval" (2024)
> - Es et al., "RAGAS: Automated Evaluation of Retrieval Augmented Generation" (2023)
> - Asai et al., "Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection" (2023)
> - Yan et al., "Corrective Retrieval Augmented Generation" (2024)
