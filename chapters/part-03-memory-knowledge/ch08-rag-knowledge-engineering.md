# 第八章：RAG 与知识工程

> "RAG 不仅仅是'搜索+生成'，它是 Agent 知识管理的核心基础设施。"

---

## 8.1 RAG Pipeline 架构

```typescript
class RAGPipeline {
  constructor(
    private chunker: DocumentChunker,
    private embedder: Embedder,
    private retriever: HybridRetriever,
    private reranker: Reranker,
  ) {}

  // 离线索引阶段
  async index(documents: Document[]): Promise<void> {
    for (const doc of documents) {
      const chunks = this.chunker.chunk(doc);
      const embeddings = await this.embedder.batchEmbed(chunks.map(c => c.text));
      for (let i = 0; i < chunks.length; i++) {
        await this.retriever.store({
          ...chunks[i],
          embedding: embeddings[i],
        });
      }
    }
  }

  // 在线检索阶段
  async retrieve(query: string, topK: number = 5): Promise<RetrievedChunk[]> {
    // 1. 混合检索（语义 + 关键词）
    const candidates = await this.retriever.search(query, topK * 3);

    // 2. 重排序
    const reranked = await this.reranker.rerank(query, candidates);

    // 3. 返回 top-K
    return reranked.slice(0, topK);
  }
}
```

---

## 8.2 文档分块策略

```typescript
interface ChunkingStrategy {
  name: string;
  chunk(doc: Document): Chunk[];
}

// 1. 固定大小分块
class FixedSizeChunker implements ChunkingStrategy {
  name = 'fixed_size';
  constructor(private chunkSize: number = 512, private overlap: number = 50) {}

  chunk(doc: Document): Chunk[] {
    const chunks: Chunk[] = [];
    for (let i = 0; i < doc.text.length; i += this.chunkSize - this.overlap) {
      chunks.push({
        text: doc.text.slice(i, i + this.chunkSize),
        metadata: { source: doc.id, startChar: i },
      });
    }
    return chunks;
  }
}

// 2. 语义分块（按段落/章节）
class SemanticChunker implements ChunkingStrategy {
  name = 'semantic';
  chunk(doc: Document): Chunk[] {
    // 按标题和段落分割
    const sections = doc.text.split(/\n#{1,3}\s/);
    return sections.map((text, i) => ({
      text: text.trim(),
      metadata: { source: doc.id, sectionIndex: i },
    }));
  }
}

// 3. 递归字符分块
class RecursiveChunker implements ChunkingStrategy {
  name = 'recursive';
  private separators = ['\n\n', '\n', '。', '. ', ' '];

  chunk(doc: Document): Chunk[] {
    return this.recursiveSplit(doc.text, 0, doc.id);
  }

  private recursiveSplit(text: string, level: number, source: string): Chunk[] {
    if (text.length <= 512 || level >= this.separators.length) {
      return [{ text, metadata: { source, level } }];
    }
    const parts = text.split(this.separators[level]);
    return parts.flatMap(p => this.recursiveSplit(p, level + 1, source));
  }
}

// 4. 父子文档分块
class ParentChildChunker implements ChunkingStrategy {
  name = 'parent_child';
  chunk(doc: Document): Chunk[] {
    const parentChunks = new FixedSizeChunker(2048, 100).chunk(doc);
    const allChunks: Chunk[] = [];
    for (const parent of parentChunks) {
      const children = new FixedSizeChunker(256, 25).chunk({ id: doc.id, text: parent.text });
      for (const child of children) {
        allChunks.push({
          ...child,
          metadata: { ...child.metadata, parentText: parent.text },
        });
      }
    }
    return allChunks;
  }
}

interface Document { id: string; text: string; }
interface Chunk { text: string; metadata: Record<string, unknown>; }
```

---

## 8.3 混合检索

```typescript
class HybridRetriever {
  constructor(
    private vectorStore: VectorStore,
    private bm25Index: BM25Index,
    private alpha: number = 0.7, // 语义检索权重
  ) {}

  async search(query: string, topK: number): Promise<RetrievedChunk[]> {
    // 并行执行语义检索和关键词检索
    const [semanticResults, keywordResults] = await Promise.all([
      this.vectorStore.search(query, topK),
      this.bm25Index.search(query, topK),
    ]);

    // 加权融合（Reciprocal Rank Fusion）
    return this.reciprocalRankFusion(semanticResults, keywordResults, topK);
  }

  private reciprocalRankFusion(
    listA: RetrievedChunk[],
    listB: RetrievedChunk[],
    topK: number,
    k: number = 60,
  ): RetrievedChunk[] {
    const scores = new Map<string, number>();
    const chunks = new Map<string, RetrievedChunk>();

    for (let i = 0; i < listA.length; i++) {
      const id = listA[i].id;
      scores.set(id, (scores.get(id) ?? 0) + this.alpha / (k + i + 1));
      chunks.set(id, listA[i]);
    }

    for (let i = 0; i < listB.length; i++) {
      const id = listB[i].id;
      scores.set(id, (scores.get(id) ?? 0) + (1 - this.alpha) / (k + i + 1));
      if (!chunks.has(id)) chunks.set(id, listB[i]);
    }

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([id]) => chunks.get(id)!);
  }

  async store(chunk: any): Promise<void> {}
}

interface VectorStore { search(query: string, topK: number): Promise<RetrievedChunk[]>; }
interface BM25Index { search(query: string, topK: number): Promise<RetrievedChunk[]>; }
interface Reranker { rerank(query: string, chunks: RetrievedChunk[]): Promise<RetrievedChunk[]>; }
interface Embedder { batchEmbed(texts: string[]): Promise<number[][]>; }
interface RetrievedChunk { id: string; text: string; score: number; metadata: Record<string, unknown>; }
```

---

## 8.4 GraphRAG

GraphRAG 通过构建知识图谱增强检索质量：

```typescript
class GraphRAG {
  private graph: KnowledgeGraph;

  async retrieve(query: string): Promise<string> {
    // 1. 实体提取
    const entities = await this.extractEntities(query);

    // 2. 图谱遍历
    const subgraph = await this.graph.getSubgraph(entities, depth: 2);

    // 3. 社区检测
    const communities = this.detectCommunities(subgraph);

    // 4. 生成社区摘要
    const summaries = await Promise.all(
      communities.map(c => this.summarizeCommunity(c))
    );

    return summaries.join('\n\n');
  }

  private async extractEntities(text: string): Promise<string[]> { return []; }
  private detectCommunities(graph: any): any[] { return []; }
  private async summarizeCommunity(community: any): Promise<string> { return ''; }
}

interface KnowledgeGraph { getSubgraph(entities: string[], depth: number): Promise<any>; }
```

---

## 8.5 RAG 评估指标

| 指标 | 说明 | 目标值 |
|------|------|--------|
| **Recall@K** | Top-K 结果中包含正确文档的比例 | > 0.85 |
| **Precision@K** | Top-K 结果中相关文档的比例 | > 0.70 |
| **MRR** | 第一个正确结果的排名倒数 | > 0.80 |
| **Faithfulness** | 生成答案对检索文档的忠实度 | > 0.90 |
| **Answer Relevancy** | 生成答案与问题的相关度 | > 0.85 |

---

## 8.6 本章小结

1. **RAG Pipeline** = 分块 + 嵌入 + 检索 + 重排序 + 生成
2. **四种分块策略**各有适用场景，父子文档分块兼顾精度和上下文
3. **混合检索**结合语义和关键词，通过 RRF 融合结果
4. **GraphRAG** 通过知识图谱增强复杂查询的检索质量
5. 评估指标应覆盖检索质量和生成质量两个维度
