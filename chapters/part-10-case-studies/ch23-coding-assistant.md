# 第23章：实战案例——智能编码助手

> "The best way to predict the future is to implement it." —— Alan Kay

## 23.1 项目概述与目标

智能编码助手是最成功的 AI Agent 应用之一。从 GitHub Copilot 到 Cursor，编码助手已经从简单的自动补全进化为具备项目级理解能力的智能开发伙伴。

### 23.1.1 能力矩阵

| 能力层级 | 描述 | 示例 |
|---------|------|------|
| L1 代码补全 | 行级/块级补全 | Tab 补全、snippet 建议 |
| L2 代码生成 | 函数级生成 | 根据注释生成完整函数 |
| L3 代码理解 | 项目级理解 | 跨文件重构、架构分析 |
| L4 任务执行 | 端到端任务 | 从 issue 到 PR 的完整流程 |
| L5 协作开发 | 自主开发者 | 独立完成 feature 开发 |

### 23.1.2 系统架构

```
┌─────────────────────────────────────────────────┐
│                  IDE Extension                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐│
│  │Code Panel │ │Chat View │ │ Inline Suggest   ││
│  └──────────┘ └──────────┘ └──────────────────┘│
├─────────────────────────────────────────────────┤
│                  Agent Core                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐│
│  │Task Planner│ │Code Gen │ │ Code Reviewer    ││
│  └──────────┘ └──────────┘ └──────────────────┘│
├─────────────────────────────────────────────────┤
│              Knowledge Layer                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐│
│  │Codebase  │ │Doc Index │ │ Dependency Graph  ││
│  │  Index   │ │          │ │                   ││
│  └──────────┘ └──────────┘ └──────────────────┘│
└─────────────────────────────────────────────────┘
```

## 23.2 代码库索引系统

### 23.2.1 代码库索引器

```typescript
interface FileNode {
  path: string;
  language: string;
  symbols: Symbol[];
  imports: Import[];
  exports: Export[];
  hash: string;
}

interface Symbol {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'enum';
  range: { start: number; end: number };
  signature?: string;
  docstring?: string;
  references: string[];  // 被引用的文件路径
}

class CodebaseIndexer {
  private fileIndex: Map<string, FileNode> = new Map();
  private symbolIndex: Map<string, Symbol[]> = new Map();
  private dependencyGraph: Map<string, Set<string>> = new Map();
  
  async indexWorkspace(rootPath: string): Promise<void> {
    const files = await this.discoverFiles(rootPath);
    
    // 并行解析文件
    const parseResults = await Promise.all(
      files.map(file => this.parseFile(file))
    );
    
    // 构建索引
    for (const result of parseResults) {
      this.fileIndex.set(result.path, result);
      
      for (const symbol of result.symbols) {
        const existing = this.symbolIndex.get(symbol.name) || [];
        existing.push(symbol);
        this.symbolIndex.set(symbol.name, existing);
      }
      
      // 构建依赖图
      for (const imp of result.imports) {
        const resolved = this.resolveImport(imp, result.path);
        if (resolved) {
          const deps = this.dependencyGraph.get(result.path) || new Set();
          deps.add(resolved);
          this.dependencyGraph.set(result.path, deps);
        }
      }
    }
  }
  
  // 获取与当前编辑相关的上下文
  async getRelevantContext(
    currentFile: string,
    cursorPosition: number,
    maxTokens: number = 8000
  ): Promise<ContextSnippet[]> {
    const snippets: ContextSnippet[] = [];
    let tokenBudget = maxTokens;
    
    // 1. 当前文件的符号和类型定义
    const currentNode = this.fileIndex.get(currentFile);
    if (currentNode) {
      for (const symbol of currentNode.symbols) {
        if (this.isRelevant(symbol, cursorPosition)) {
          const snippet = this.extractSnippet(symbol);
          const tokens = this.estimateTokens(snippet);
          if (tokens <= tokenBudget) {
            snippets.push(snippet);
            tokenBudget -= tokens;
          }
        }
      }
    }
    
    // 2. 导入文件的类型签名
    const deps = this.dependencyGraph.get(currentFile) || new Set();
    for (const dep of deps) {
      const depNode = this.fileIndex.get(dep);
      if (depNode) {
        for (const exp of depNode.exports) {
          const snippet = this.extractTypeSignature(exp);
          const tokens = this.estimateTokens(snippet);
          if (tokens <= tokenBudget) {
            snippets.push(snippet);
            tokenBudget -= tokens;
          }
        }
      }
    }
    
    // 3. 相似代码片段（语义搜索）
    const query = this.getCurrentEditContext(currentFile, cursorPosition);
    const similar = await this.semanticSearch(query, tokenBudget);
    snippets.push(...similar);
    
    return snippets;
  }
  
  // 增量更新索引
  async onFileChanged(filePath: string): Promise<void> {
    const oldNode = this.fileIndex.get(filePath);
    const newNode = await this.parseFile(filePath);
    
    if (oldNode?.hash === newNode.hash) return;
    
    // 更新符号索引
    if (oldNode) {
      for (const symbol of oldNode.symbols) {
        const existing = this.symbolIndex.get(symbol.name) || [];
        this.symbolIndex.set(
          symbol.name,
          existing.filter(s => s !== symbol)
        );
      }
    }
    
    for (const symbol of newNode.symbols) {
      const existing = this.symbolIndex.get(symbol.name) || [];
      existing.push(symbol);
      this.symbolIndex.set(symbol.name, existing);
    }
    
    this.fileIndex.set(filePath, newNode);
  }
  
  private async discoverFiles(rootPath: string): Promise<string[]> {
    const { readdir, stat } = await import('fs/promises');
    const { join } = await import('path');
    const files: string[] = [];
    const ignorePatterns = ['node_modules', '.git', 'dist', 'build', '.next'];
    const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs'];

    async function walk(dir: string) {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (ignorePatterns.includes(entry.name)) continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) await walk(fullPath);
        else if (codeExtensions.some(ext => entry.name.endsWith(ext))) files.push(fullPath);
      }
    }
    await walk(rootPath);
    return files;
  }
  private async parseFile(filePath: string): Promise<FileNode> {
    const { readFile } = await import('fs/promises');
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const symbols: Symbol[] = [];
    const imports: Import[] = [];
    const exports: Export[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^import\s/.test(line)) imports.push({ source: line.match(/from\s+['"](.+)['"]/)?.[1] ?? '', name: line, line: i });
      if (/^export\s+(function|class|const|interface|type)\s+(\w+)/.test(line)) {
        const match = line.match(/^export\s+(function|class|const|interface|type)\s+(\w+)/);
        if (match) exports.push({ name: match[2], kind: match[1], line: i });
      }
      if (/^(function|class|const|interface|type)\s+(\w+)/.test(line)) {
        const match = line.match(/^(function|class|const|interface|type)\s+(\w+)/);
        if (match) symbols.push({ name: match[2], kind: match[1], startLine: i, endLine: i, file: filePath });
      }
    }
    return { path: filePath, content, symbols, imports, exports, lines: lines.length };
  }
  private resolveImport(imp: Import, fromPath: string): string | null {
    const { dirname, resolve } = require('path');
    const source = imp.source;
    if (source.startsWith('.')) {
      const dir = dirname(fromPath);
      const resolved = resolve(dir, source);
      const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
      for (const ext of extensions) {
        const candidate = resolved.endsWith(ext) ? resolved : resolved + ext;
        if (this.index.has(candidate)) return candidate;
      }
    }
    return null; // 外部包引用不解析
  }
  private isRelevant(symbol: Symbol, position: number): boolean {
    const distance = Math.abs(symbol.startLine - position);
    const isNearby = distance < 50;
    const isExported = symbol.kind === 'function' || symbol.kind === 'class';
    const isTypeDefinition = symbol.kind === 'interface' || symbol.kind === 'type';
    return isNearby || isExported || isTypeDefinition;
  }
  private extractSnippet(symbol: Symbol): ContextSnippet {
    const fileNode = this.index.get(symbol.file);
    if (!fileNode) return { content: '', tokenEstimate: 0, relevance: 0, source: symbol.file };
    const lines = fileNode.content.split('\n');
    const start = Math.max(0, symbol.startLine - 2);
    const end = Math.min(lines.length, symbol.endLine + 20);
    const content = lines.slice(start, end).join('\n');
    return { content, tokenEstimate: this.estimateTokens({ content } as ContextSnippet), relevance: 0.8, source: `${symbol.file}:${symbol.startLine}` };
  }
  private extractTypeSignature(exp: Export): ContextSnippet {
    const content = `${exp.kind} ${exp.name} // exported from line ${exp.line}`;
    return { content, tokenEstimate: Math.ceil(content.length / 4), relevance: 0.6, source: `export:${exp.name}` };
  }
  private estimateTokens(snippet: ContextSnippet): number {
    // 粗略估算：英文约 4 字符/token，代码约 3.5 字符/token
    return Math.ceil(snippet.content.length / 3.5);
  }
  private getCurrentEditContext(file: string, pos: number): string {
    const fileNode = this.index.get(file);
    if (!fileNode) return '';
    const lines = fileNode.content.split('\n');
    const start = Math.max(0, pos - 20);
    const end = Math.min(lines.length, pos + 20);
    return lines.slice(start, end).join('\n');
  }
  private async semanticSearch(query: string, budget: number): Promise<ContextSnippet[]> {
    const results: ContextSnippet[] = [];
    const queryTerms = query.toLowerCase().split(/\s+/);
    for (const [path, node] of this.index) {
      for (const symbol of node.symbols) {
        const nameMatch = queryTerms.some(term => symbol.name.toLowerCase().includes(term));
        if (nameMatch) {
          const snippet = this.extractSnippet(symbol);
          snippet.relevance = queryTerms.filter(t => symbol.name.toLowerCase().includes(t)).length / queryTerms.length;
          results.push(snippet);
        }
      }
    }
    results.sort((a, b) => b.relevance - a.relevance);
    let tokenCount = 0;
    return results.filter(s => { tokenCount += s.tokenEstimate; return tokenCount <= budget; });
  }
}
```

## 23.3 代码生成与编辑

### 23.3.1 Diff 生成器

编码助手的核心能力是精确地生成代码变更。与生成完整文件不同，Diff 模式只描述需要修改的部分：

```typescript
interface CodeEdit {
  file: string;
  edits: EditOperation[];
}

interface EditOperation {
  type: 'insert' | 'replace' | 'delete';
  range: { startLine: number; endLine: number };
  newContent?: string;
  description: string;
}

class DiffGenerator {
  private model: LLMClient;
  private indexer: CodebaseIndexer;
  
  async generateEdits(
    task: string,
    targetFiles: string[]
  ): Promise<CodeEdit[]> {
    // 收集相关上下文
    const context = await this.gatherContext(targetFiles);
    
    const prompt = `
You are an expert software engineer. Generate precise code edits.

## Task
${task}

## Current Code
${context.map(c => `### ${c.file}\n\`\`\`${c.language}\n${c.content}\n\`\`\``).join('\n\n')}

## Instructions
- Output ONLY the necessary changes as edit operations
- Use the exact format: FILE: path, TYPE: insert|replace|delete, LINES: start-end
- Preserve existing code style and conventions
- Include descriptive comments for complex changes
`;

    const response = await this.model.generate(prompt);
    const edits = this.parseEditResponse(response);
    
    // 验证编辑的合理性
    return this.validateEdits(edits, context);
  }
  
  private async gatherContext(files: string[]): Promise<FileContext[]> {
    return Promise.all(files.map(async file => ({
      file,
      language: this.detectLanguage(file),
      content: await this.readFile(file),
      symbols: await this.indexer.getRelevantContext(file, 0)
    })));
  }
  
  private validateEdits(edits: CodeEdit[], context: FileContext[]): CodeEdit[] {
    return edits.filter(edit => {
      const fileCtx = context.find(c => c.file === edit.file);
      if (!fileCtx) return false;
      
      const lines = fileCtx.content.split('\n');
      for (const op of edit.edits) {
        if (op.range.startLine < 0 || op.range.endLine > lines.length) {
          console.warn(`Invalid range in ${edit.file}: ${op.range.startLine}-${op.range.endLine}`);
          return false;
        }
      }
      return true;
    });
  }
  
  private parseEditResponse(response: string): CodeEdit[] {
    const edits: CodeEdit[] = [];
    const diffBlockRegex = /```(?:diff|patch)?\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = diffBlockRegex.exec(response)) !== null) {
      const diffContent = match[1];
      const fileMatch = diffContent.match(/^[-+]{3}\s+[ab]\/(.+)$/m);
      const file = fileMatch?.[1] ?? 'unknown';
      edits.push({ file, diff: diffContent, description: `Edit in ${file}` });
    }
    return edits.length > 0 ? edits : [{ file: 'unknown', diff: response, description: 'Raw edit' }];
  }
  private detectLanguage(file: string): string {
    const ext = file.split('.').pop()?.toLowerCase() ?? '';
    const langMap: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      py: 'python', go: 'go', rs: 'rust', java: 'java', rb: 'ruby',
      cpp: 'cpp', c: 'c', cs: 'csharp', swift: 'swift', kt: 'kotlin',
    };
    return langMap[ext] ?? 'plaintext';
  }
  private async readFile(file: string): Promise<string> {
    const { readFile } = await import('fs/promises');
    return readFile(file, 'utf-8');
  }
}
```

### 23.3.2 自动化测试运行

```typescript
class TestRunner {
  async runRelevantTests(edits: CodeEdit[]): Promise<TestResult> {
    // 确定受影响的测试文件
    const affectedTests = await this.findAffectedTests(edits);
    
    const results: TestCaseResult[] = [];
    for (const testFile of affectedTests) {
      const result = await this.executeTest(testFile);
      results.push(result);
      
      // 如果测试失败，尝试自动修复
      if (!result.passed) {
        const fix = await this.suggestFix(result, edits);
        if (fix) {
          results.push({
            ...result,
            autoFixAvailable: true,
            suggestedFix: fix
          });
        }
      }
    }
    
    return {
      total: results.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
      results
    };
  }
  
  private async findAffectedTests(edits: CodeEdit[]): Promise<string[]> {
    const editedFiles = edits.map(e => e.file);
    const testFiles: string[] = [];
    
    for (const file of editedFiles) {
      // 查找对应的测试文件
      const testFile = file.replace(/\.ts$/, '.test.ts')
                           .replace(/\.tsx$/, '.test.tsx')
                           .replace(/\/src\//, '/tests/');
      testFiles.push(testFile);
      
      // 查找引用了修改文件的测试
      const dependents = await this.findDependentTests(file);
      testFiles.push(...dependents);
    }
    
    return [...new Set(testFiles)];
  }
  
  private async executeTest(testFile: string): Promise<TestCaseResult> {
    const { execSync } = await import('child_process');
    try {
      const output = execSync(`npx jest ${testFile} --json --no-coverage`, {
        timeout: 30_000, encoding: 'utf-8',
      });
      const result = JSON.parse(output);
      return {
        file: testFile, passed: result.numPassedTests > 0 && result.numFailedTests === 0,
        totalTests: result.numTotalTests, failedTests: result.numFailedTests,
        output: result.testResults?.[0]?.message ?? '',
      };
    } catch (error: any) {
      return { file: testFile, passed: false, totalTests: 0, failedTests: 1, output: error.message };
    }
  }
  private async suggestFix(result: TestCaseResult, edits: CodeEdit[]): Promise<CodeEdit | null> {
    if (result.passed) return null;
    const relatedEdit = edits.find(e => result.output.includes(e.file));
    if (!relatedEdit) return null;
    const prompt = `Test failed in ${result.file}:\n${result.output}\n\nOriginal edit:\n${relatedEdit.diff}\n\nSuggest a fix:`;
    const fixResponse = await this.llm.complete(prompt);
    return { file: relatedEdit.file, diff: fixResponse, description: `Fix for ${result.file}` };
  }
  private async findDependentTests(file: string): Promise<string[]> {
    const { readdir } = await import('fs/promises');
    const { basename, dirname, join } = await import('path');
    const base = basename(file, '.ts').replace('.', '');
    const dir = dirname(file);
    const testPatterns = [`${base}.test.ts`, `${base}.spec.ts`, `__tests__/${base}.ts`];
    const testFiles: string[] = [];
    for (const pattern of testPatterns) {
      try { await import('fs/promises').then(fs => fs.access(join(dir, pattern))); testFiles.push(join(dir, pattern)); } catch {}
    }
    return testFiles;
  }
}
```

## 23.4 多 Agent 协作流程

### 23.4.1 从 Issue 到 Pull Request

```typescript
class CodingAgent {
  private planner: TaskPlanner;
  private coder: DiffGenerator;
  private reviewer: CodeReviewer;
  private tester: TestRunner;
  
  async handleIssue(issue: GitIssue): Promise<PullRequest> {
    // 阶段1: 理解和规划
    const plan = await this.planner.analyzeIssue(issue);
    console.log(`Plan: ${plan.steps.length} steps, estimated complexity: ${plan.complexity}`);
    
    // 阶段2: 实现
    let allEdits: CodeEdit[] = [];
    for (const step of plan.steps) {
      const edits = await this.coder.generateEdits(step.description, step.targetFiles);
      allEdits.push(...edits);
      
      // 增量测试
      const testResult = await this.tester.runRelevantTests(edits);
      if (testResult.failed > 0) {
        // 迭代修复
        const fixedEdits = await this.iterativeFix(edits, testResult, 3);
        allEdits = allEdits.filter(e => !edits.includes(e));
        allEdits.push(...fixedEdits);
      }
    }
    
    // 阶段3: 代码审查
    const review = await this.reviewer.review(allEdits);
    if (review.issues.length > 0) {
      const improvements = await this.addressReviewFeedback(allEdits, review);
      allEdits = improvements;
    }
    
    // 阶段4: 创建 PR
    return this.createPullRequest(issue, allEdits, plan);
  }
  
  private async iterativeFix(
    edits: CodeEdit[],
    testResult: TestResult,
    maxAttempts: number
  ): Promise<CodeEdit[]> {
    let currentEdits = edits;
    
    for (let i = 0; i < maxAttempts; i++) {
      const failures = testResult.results.filter(r => !r.passed);
      const errorContext = failures.map(f => ({
        test: f.testName,
        error: f.errorMessage,
        stackTrace: f.stackTrace
      }));
      
      currentEdits = await this.coder.generateEdits(
        `Fix test failures:\n${JSON.stringify(errorContext, null, 2)}`,
        currentEdits.map(e => e.file)
      );
      
      const newResult = await this.tester.runRelevantTests(currentEdits);
      if (newResult.failed === 0) return currentEdits;
      
      testResult = newResult;
    }
    
    return currentEdits;
  }
  
  private async addressReviewFeedback(edits: CodeEdit[], review: ReviewResult): Promise<CodeEdit[]> {
    if (review.issues.length === 0) return edits;
    const updatedEdits = [...edits];
    for (const issue of review.issues) {
      const prompt = `Review feedback for ${issue.file}:\nIssue: ${issue.description}\nSeverity: ${issue.severity}\n\nOriginal edit:\n${edits.find(e => e.file === issue.file)?.diff}\n\nGenerate an improved edit that addresses this feedback:`;
      const fixResponse = await this.llm.complete(prompt);
      const idx = updatedEdits.findIndex(e => e.file === issue.file);
      if (idx >= 0) updatedEdits[idx] = { ...updatedEdits[idx], diff: fixResponse, description: `Addressed: ${issue.description}` };
    }
    return updatedEdits;
  }
  private async createPullRequest(issue: GitIssue, edits: CodeEdit[], plan: TaskPlan): Promise<PullRequest> {
    const branchName = `agent/fix-${issue.id}-${Date.now()}`;
    const title = `[Agent] ${plan.summary ?? issue.title}`;
    const body = [
      `## Summary\n${plan.summary ?? 'Automated fix'}`,
      `## Changes\n${edits.map(e => `- \`${e.file}\`: ${e.description}`).join('\n')}`,
      `## Related Issue\nCloses #${issue.id}`,
      `## Test Results\n${plan.testResults?.passed ? '✅ All tests passed' : '⚠️ Some tests may need attention'}`,
    ].join('\n\n');
    return { branch: branchName, title, body, files: edits.map(e => e.file), isDraft: true };
  }
```

## 23.5 上下文工程实践

### 23.5.1 动态上下文选择策略

```typescript
class CodingContextManager {
  // 根据任务类型动态选择上下文策略
  selectStrategy(task: CodingTask): ContextStrategy {
    switch (task.type) {
      case 'completion':
        return {
          currentFile: { lines: 200, around: 'cursor' },
          imports: { depth: 1, signaturesOnly: true },
          recentEdits: { count: 5 },
          maxTokens: 4000
        };
        
      case 'refactor':
        return {
          currentFile: { full: true },
          imports: { depth: 2, signaturesOnly: false },
          dependents: { depth: 1 },
          testFiles: { associated: true },
          maxTokens: 16000
        };
        
      case 'debug':
        return {
          currentFile: { full: true },
          errorContext: { stackTrace: true, logs: true },
          relatedFiles: { byStackTrace: true },
          testFiles: { failing: true },
          maxTokens: 12000
        };
        
      case 'feature':
        return {
          architecture: { overview: true },
          similarFeatures: { count: 3 },
          codeConventions: { examples: true },
          testPatterns: { examples: true },
          maxTokens: 20000
        };
    }
  }
}
```

## 23.6 性能优化与用户体验

### 23.6.1 关键性能指标

| 指标 | 目标值 | 优化策略 |
|------|--------|---------|
| 补全延迟 | < 200ms | 预测性预加载、模型缓存 |
| 生成延迟 | < 2s (首 token) | 流式输出、推测解码 |
| 索引速度 | < 30s (10万行) | 增量索引、并行解析 |
| 接受率 | > 30% | 上下文质量优化 |
| 代码质量 | 0 type error | 实时类型检查集成 |

### 23.6.2 度量与持续改进

```typescript
class CodingAssistantMetrics {
  track(event: AssistantEvent): void {
    switch (event.type) {
      case 'suggestion_shown':
        this.record('suggestions_total', 1);
        break;
      case 'suggestion_accepted':
        this.record('suggestions_accepted', 1);
        this.record('characters_saved', event.characterCount);
        break;
      case 'suggestion_rejected':
        this.record('suggestions_rejected', 1);
        this.analyzeRejectionReason(event);
        break;
      case 'edit_applied':
        this.record('edits_applied', 1);
        this.record('lines_changed', event.linesChanged);
        break;
      case 'test_fixed':
        this.record('auto_fixes', 1);
        break;
    }
  }
  
  // 计算开发者生产力提升
  async calculateProductivityGain(period: string): Promise<ProductivityReport> {
    const metrics = await this.getMetrics(period);
    return {
      acceptanceRate: metrics.accepted / metrics.total,
      charactersSaved: metrics.charactersSaved,
      timeSavedEstimate: metrics.charactersSaved / 50 * 60, // 假设手动输入50字符/分钟
      autoFixRate: metrics.autoFixes / metrics.testFailures,
      codeQualityScore: metrics.typeErrors === 0 ? 1.0 : 0.8
    };
  }
  
  private record(metric: string, value: number): void {
    const key = `${metric}_${new Date().toISOString().slice(0, 10)}`;
    if (!this.metrics.has(key)) this.metrics.set(key, []);
    this.metrics.get(key)!.push(value);
  }
  private analyzeRejectionReason(event: AssistantEvent): void {
    const reasons = ['incorrect_logic', 'style_mismatch', 'incomplete', 'wrong_file', 'other'];
    const reason = event.metadata?.rejectionReason ?? 'other';
    this.record(`rejection_${reason}`, 1);
  }
  private async getMetrics(period: string): Promise<any> {
    const relevantKeys = [...this.metrics.keys()].filter(k => k.includes(period));
    const result: Record<string, { count: number; avg: number; total: number }> = {};
    for (const key of relevantKeys) {
      const values = this.metrics.get(key) ?? [];
      const total = values.reduce((a, b) => a + b, 0);
      result[key] = { count: values.length, avg: values.length > 0 ? total / values.length : 0, total };
    }
    return result;
  }
}
```

## 23.7 小结

智能编码助手的核心挑战在于：

1. **上下文精确性**：在有限的 token 预算内提供最相关的代码上下文
2. **编辑精确性**：生成的代码变更必须在语法和语义上正确
3. **反馈循环**：通过测试验证和用户反馈持续改进
4. **延迟敏感**：开发者体验对延迟极其敏感，需要精心优化

编码助手是 Agent 技术的最佳试验场——它需要工具使用、上下文工程、多步推理、反馈循环等所有核心能力的协同工作。


## 23.8 Agentic Coding 范式：从自动补全到自主 Agent

### 23.8.1 编程助手的演进路径

编程助手经历了四个清晰的代际演进，每一代都重新定义了人机协作的边界：

```
第一代（2021-2022）：自动补全
├── 代表：GitHub Copilot v1
├── 能力：行内 / 块级代码补全
├── 交互：Tab 接受或忽略
└── 局限：无上下文理解，建议质量不稳定

第二代（2023-2024）：对话式编码
├── 代表：ChatGPT Code Interpreter、Copilot Chat
├── 能力：通过对话生成代码片段
├── 交互：自然语言描述 → 代码回复
└── 局限：需要手动复制粘贴，缺乏项目感知

第三代（2024-2025）：IDE 原生 Agent
├── 代表：Cursor、Windsurf、GitHub Copilot Workspace
├── 能力：项目级代码理解、多文件编辑、终端操作
├── 交互：自然语言指令 → 直接文件变更
└── 局限：仍需人类逐步审核每个操作

第四代（2025-2026）：自主编码 Agent
├── 代表：Claude Code、OpenAI Codex Agent、Devin
├── 能力：从 Issue 到 PR 的端到端自主完成
├── 交互：任务描述 → 自主规划、实现、测试、提交
└── 特征：长时运行、自主决策、人类监督式协作
```

### 23.8.2 L1-L5 编码能力分级详解

本书第 1 章定义了 Agent 通用的 L1-L5 能力分级。在编程助手领域，这一分级有其特定的内涵：

| 级别 | 能力 | 典型任务 | 人类参与度 | 代表产品 |
|------|------|---------|-----------|---------|
| L1 代码补全 | 行级 / 块级补全 | 补完当前行、补全函数体 | 95%——每行审核 | Copilot v1 |
| L2 代码生成 | 函数级 / 文件级生成 | 根据注释或描述生成完整函数 | 80%——逐函数审核 | Copilot Chat |
| L3 项目理解 | 跨文件编辑、重构 | 多文件重命名、接口变更传播 | 50%——审核关键变更 | Cursor、Windsurf |
| L4 任务执行 | 从 Issue 到 PR | 理解需求 → 规划 → 实现 → 测试 | 20%——审核最终 PR | Claude Code、Codex |
| L5 协作开发 | 自主特性开发 | 参与设计讨论、独立完成 feature | 5%——架构决策 | 尚未完全实现 |

> **设计决策：渐进自主（Progressive Autonomy）**
>
> 生产级编码助手不应固定在某个级别，而应根据任务复杂度和风险等级动态调整自主程度。简单的格式化、重命名操作可以 L4 级自主完成；涉及数据库 schema 变更或 API 破坏性改动的任务则应回退到 L2-L3，要求人类逐步确认。这种渐进自主策略在第 14 章信任架构中有详细讨论。

### 23.8.3 Agentic Coding 的工程挑战

从对话式编码到 Agentic Coding 的跃迁，带来了一系列新的工程挑战：

```typescript
// Agentic Coding 核心挑战与解决策略
interface AgenticCodingChallenges {
  // 挑战 1：确定性要求——代码必须编译通过、测试通过
  determinism: {
    problem: '自然语言的模糊性 vs 代码的精确性';
    solution: '类型检查反馈循环 + 编译验证 + 测试验证';
  };

  // 挑战 2：上下文窗口限制——大型项目远超 token 限制
  contextLimit: {
    problem: '10 万行代码库 vs 128K token 窗口';
    solution: 'Repository Intelligence + 动态上下文选择';
  };

  // 挑战 3：编辑精确性——必须精确定位修改位置
  editPrecision: {
    problem: '生成整个文件效率低且容易覆盖无关代码';
    solution: 'Diff 模式 + 搜索替换 + AST 级编辑';
  };

  // 挑战 4：长期一致性——多文件变更需保持一致
  consistency: {
    problem: '修改接口后所有引用处都需要同步更新';
    solution: '依赖图分析 + 级联更新 + 编译验证';
  };

  // 挑战 5：安全边界——Agent 能操作文件系统和终端
  safety: {
    problem: 'Agent 可能执行危险命令（rm -rf, force push）';
    solution: '命令白名单 + 沙箱执行 + 人工确认高危操作';
  };
}
```

## 23.9 Repository Intelligence：项目级理解

### 23.9.1 代码库全局理解系统

Repository Intelligence 是第四代编码助手的核心能力——Agent 不再只理解光标附近的代码，而是理解整个项目的架构、约定和设计意图：

```typescript
interface RepositoryUnderstanding {
  // 项目结构
  structure: {
    framework: string;          // 'Next.js' | 'Express' | 'NestJS' | ...
    language: string;           // 'TypeScript' | 'Python' | ...
    buildSystem: string;        // 'npm' | 'pnpm' | 'yarn'
    testFramework: string;      // 'jest' | 'vitest' | 'mocha'
    directories: DirectoryRole[];  // 各目录的职责
  };

  // 架构模式
  patterns: {
    architecture: string;       // 'layered' | 'hexagonal' | 'microservices'
    stateManagement: string;    // 'redux' | 'zustand' | 'context'
    apiStyle: string;           // 'REST' | 'GraphQL' | 'tRPC'
    errorHandling: string;      // 统一错误处理模式
    logging: string;            // 日志约定
  };

  // 代码约定
  conventions: {
    namingStyle: NamingConventions;
    fileOrganization: FileOrganizationRules;
    importOrder: ImportOrderRules;
    testPatterns: TestPatternRules;
    commentStyle: CommentStyleRules;
  };

  // 依赖图谱
  dependencyGraph: DependencyGraph;

  // 最近活跃区域
  hotspots: FileHotspot[];
}

class RepositoryAnalyzer {
  private indexer: CodebaseIndexer;
  private patternDetector: PatternDetector;
  private conventionExtractor: ConventionExtractor;

  async analyze(rootPath: string): Promise<RepositoryUnderstanding> {
    // 阶段 1: 结构分析
    const structure = await this.analyzeStructure(rootPath);
    
    // 阶段 2: 模式识别
    const patterns = await this.patternDetector.detect(rootPath, structure);
    
    // 阶段 3: 约定提取（通过采样分析多个文件）
    const conventions = await this.conventionExtractor.extract(rootPath, {
      sampleSize: 50,        // 采样 50 个文件
      focusOnRecent: true,   // 优先分析最近修改的文件
    });

    // 阶段 4: 依赖图谱构建
    const dependencyGraph = await this.indexer.buildDependencyGraph(rootPath);

    // 阶段 5: 热点分析
    const hotspots = await this.analyzeHotspots(rootPath);

    return { structure, patterns, conventions, dependencyGraph, hotspots };
  }

  private async analyzeStructure(rootPath: string): Promise<RepositoryUnderstanding['structure']> {
    const packageJson = await this.readJsonSafe(`${rootPath}/package.json`);
    const tsConfig = await this.readJsonSafe(`${rootPath}/tsconfig.json`);
    
    // 检测框架
    const deps = { ...packageJson?.dependencies, ...packageJson?.devDependencies };
    let framework = 'unknown';
    if (deps['next']) framework = 'Next.js';
    else if (deps['@nestjs/core']) framework = 'NestJS';
    else if (deps['express']) framework = 'Express';
    else if (deps['fastify']) framework = 'Fastify';
    else if (deps['react'] && !deps['next']) framework = 'React SPA';
    else if (deps['vue']) framework = 'Vue';

    // 检测测试框架
    let testFramework = 'unknown';
    if (deps['jest'] || deps['@jest/core']) testFramework = 'jest';
    else if (deps['vitest']) testFramework = 'vitest';
    else if (deps['mocha']) testFramework = 'mocha';

    // 检测构建系统
    const hasYarnLock = await this.fileExists(`${rootPath}/yarn.lock`);
    const hasPnpmLock = await this.fileExists(`${rootPath}/pnpm-lock.yaml`);
    const buildSystem = hasPnpmLock ? 'pnpm' : hasYarnLock ? 'yarn' : 'npm';

    return {
      framework,
      language: tsConfig ? 'TypeScript' : 'JavaScript',
      buildSystem,
      testFramework,
      directories: await this.classifyDirectories(rootPath),
    };
  }

  private async analyzeHotspots(rootPath: string): Promise<FileHotspot[]> {
    // 通过 git log 分析最近频繁修改的文件
    try {
      const { execSync } = await import('child_process');
      const output = execSync(
        'git log --since="30 days ago" --name-only --pretty=format: | sort | uniq -c | sort -rn | head -20',
        { cwd: rootPath, encoding: 'utf-8' }
      );

      return output.trim().split('\n')
        .filter(line => line.trim())
        .map(line => {
          const match = line.trim().match(/^(\d+)\s+(.+)$/);
          if (!match) return null;
          return { path: match[2], changeFrequency: parseInt(match[1]) };
        })
        .filter(Boolean) as FileHotspot[];
    } catch {
      return [];
    }
  }

  private async readJsonSafe(path: string): Promise<any> {
    try {
      const { readFile } = await import('fs/promises');
      return JSON.parse(await readFile(path, 'utf-8'));
    } catch { return null; }
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      const { access } = await import('fs/promises');
      await access(path);
      return true;
    } catch { return false; }
  }

  private async classifyDirectories(rootPath: string): Promise<DirectoryRole[]> {
    const { readdir } = await import('fs/promises');
    const entries = await readdir(rootPath, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));

    const roleMap: Record<string, string> = {
      src: 'source', lib: 'library', app: 'application',
      pages: 'pages', components: 'components', hooks: 'hooks',
      utils: 'utilities', helpers: 'utilities', types: 'type-definitions',
      models: 'data-models', services: 'services', api: 'api-layer',
      tests: 'tests', __tests__: 'tests', test: 'tests', spec: 'tests',
      config: 'configuration', scripts: 'build-scripts',
      public: 'static-assets', assets: 'static-assets', static: 'static-assets',
      docs: 'documentation', migrations: 'database-migrations',
    };

    return dirs.map(d => ({
      name: d.name,
      role: roleMap[d.name.toLowerCase()] ?? 'unknown',
    }));
  }
}
```

### 23.9.2 上下文预算分配策略

编码助手面临的核心难题是 token 预算有限（通常 8K-32K 用于上下文），但需要展示的信息可能远超预算。因此需要精细的预算分配策略：

```typescript
interface ContextBudget {
  total: number;
  allocation: {
    currentFile: number;      // 当前编辑文件
    importedTypes: number;    // 引入的类型定义
    relatedFiles: number;     // 相关文件片段
    projectContext: number;   // 项目级上下文（约定、配置）
    recentEdits: number;      // 最近编辑历史
    errorContext: number;     // 错误信息（调试时）
  };
}

class ContextBudgetAllocator {
  // 根据任务类型动态分配 token 预算
  allocate(task: CodingTask, totalBudget: number): ContextBudget {
    const strategies: Record<CodingTask['type'], ContextBudget['allocation']> = {
      // 代码补全：重点在当前文件和类型
      completion: {
        currentFile: 0.40,
        importedTypes: 0.25,
        relatedFiles: 0.15,
        projectContext: 0.05,
        recentEdits: 0.10,
        errorContext: 0.05,
      },
      // 重构：需要更多相关文件
      refactor: {
        currentFile: 0.25,
        importedTypes: 0.15,
        relatedFiles: 0.30,
        projectContext: 0.10,
        recentEdits: 0.10,
        errorContext: 0.10,
      },
      // 调试：重点在错误和相关代码
      debug: {
        currentFile: 0.20,
        importedTypes: 0.10,
        relatedFiles: 0.15,
        projectContext: 0.05,
        recentEdits: 0.10,
        errorContext: 0.40,
      },
      // 新功能开发：需要全面上下文
      feature: {
        currentFile: 0.15,
        importedTypes: 0.15,
        relatedFiles: 0.25,
        projectContext: 0.20,
        recentEdits: 0.15,
        errorContext: 0.10,
      },
      // 代码审查：需要变更上下文
      review: {
        currentFile: 0.30,
        importedTypes: 0.15,
        relatedFiles: 0.25,
        projectContext: 0.15,
        recentEdits: 0.10,
        errorContext: 0.05,
      },
    };

    const ratios = strategies[task.type] || strategies.completion;
    return {
      total: totalBudget,
      allocation: Object.fromEntries(
        Object.entries(ratios).map(([key, ratio]) => [key, Math.floor(totalBudget * ratio)])
      ) as ContextBudget['allocation'],
    };
  }
}

class SmartContextBuilder {
  private budgetAllocator: ContextBudgetAllocator;
  private indexer: CodebaseIndexer;
  private repoAnalyzer: RepositoryAnalyzer;

  async buildContext(
    task: CodingTask,
    currentFile: string,
    cursorPosition: number,
    totalBudget: number = 16000
  ): Promise<ContextPayload> {
    const budget = this.budgetAllocator.allocate(task, totalBudget);
    const payload: ContextPayload = { sections: [], totalTokens: 0 };

    // 1. 当前文件（最高优先级）
    const currentFileContent = await this.buildCurrentFileSection(
      currentFile, cursorPosition, budget.allocation.currentFile
    );
    payload.sections.push(currentFileContent);
    payload.totalTokens += currentFileContent.tokens;

    // 2. 导入的类型定义
    const typeSection = await this.buildImportedTypesSection(
      currentFile, budget.allocation.importedTypes
    );
    payload.sections.push(typeSection);
    payload.totalTokens += typeSection.tokens;

    // 3. 相关文件片段
    const relatedSection = await this.buildRelatedFilesSection(
      currentFile, task, budget.allocation.relatedFiles
    );
    payload.sections.push(relatedSection);
    payload.totalTokens += relatedSection.tokens;

    // 4. 项目约定（instructions / coding style）
    const projectSection = await this.buildProjectContextSection(
      budget.allocation.projectContext
    );
    payload.sections.push(projectSection);
    payload.totalTokens += projectSection.tokens;

    // 5. 最近编辑（提供连续性）
    const recentSection = await this.buildRecentEditsSection(
      budget.allocation.recentEdits
    );
    payload.sections.push(recentSection);
    payload.totalTokens += recentSection.tokens;

    // 6. 错误上下文（调试模式）
    if (task.type === 'debug' && task.errorInfo) {
      const errorSection = await this.buildErrorContextSection(
        task.errorInfo, budget.allocation.errorContext
      );
      payload.sections.push(errorSection);
      payload.totalTokens += errorSection.tokens;
    }

    return payload;
  }

  private async buildCurrentFileSection(
    file: string, cursor: number, budget: number
  ): Promise<ContextSection> {
    const content = await this.readFile(file);
    const lines = content.split('\n');

    // 如果整个文件在预算内，返回全文件
    const fullTokens = this.estimateTokens(content);
    if (fullTokens <= budget) {
      return {
        label: 'Current File',
        content: `// File: ${file}\n${content}`,
        tokens: fullTokens,
      };
    }

    // 否则，以光标为中心截取
    const windowSize = Math.floor(budget * 3.5); // 粗略：3.5 char/token
    const charOffset = lines.slice(0, cursor).join('\n').length;
    const halfWindow = Math.floor(windowSize / 2);
    const start = Math.max(0, charOffset - halfWindow);
    const end = Math.min(content.length, charOffset + halfWindow);
    const snippet = content.slice(start, end);

    return {
      label: 'Current File (around cursor)',
      content: `// File: ${file} (lines around cursor)\n${snippet}`,
      tokens: this.estimateTokens(snippet),
    };
  }

  private async buildImportedTypesSection(
    file: string, budget: number
  ): Promise<ContextSection> {
    const fileNode = await this.indexer.getFileNode(file);
    if (!fileNode) return { label: 'Imported Types', content: '', tokens: 0 };

    const typeSignatures: string[] = [];
    let usedTokens = 0;

    for (const imp of fileNode.imports) {
      const resolvedPath = this.indexer.resolveImport(imp, file);
      if (!resolvedPath) continue;

      const depNode = await this.indexer.getFileNode(resolvedPath);
      if (!depNode) continue;

      for (const exp of depNode.exports) {
        const sig = this.extractSignature(exp);
        const tokens = this.estimateTokens(sig);
        if (usedTokens + tokens > budget) break;
        typeSignatures.push(sig);
        usedTokens += tokens;
      }
    }

    return {
      label: 'Imported Types',
      content: typeSignatures.join('\n\n'),
      tokens: usedTokens,
    };
  }

  private async buildRelatedFilesSection(
    file: string, task: CodingTask, budget: number
  ): Promise<ContextSection> {
    // 使用语义搜索找到与当前任务最相关的代码片段
    const query = task.description || '';
    const snippets = await this.indexer.semanticSearch(query, budget);
    const content = snippets
      .map(s => `// From: ${s.source}\n${s.content}`)
      .join('\n\n---\n\n');

    return {
      label: 'Related Code',
      content,
      tokens: this.estimateTokens(content),
    };
  }

  private async buildProjectContextSection(budget: number): Promise<ContextSection> {
    // 查找项目级 instruction 文件
    const instructionFiles = [
      '.cursorrules', '.github/copilot-instructions.md',
      'CLAUDE.md', '.ai-instructions.md', 'CONVENTIONS.md',
    ];

    let content = '';
    for (const file of instructionFiles) {
      try {
        const text = await this.readFile(file);
        if (this.estimateTokens(content + text) <= budget) {
          content += `\n// From ${file}:\n${text}\n`;
        }
      } catch { /* file not found */ }
    }

    return {
      label: 'Project Context',
      content: content || '// No project-level instructions found',
      tokens: this.estimateTokens(content),
    };
  }

  private async buildRecentEditsSection(budget: number): Promise<ContextSection> {
    // 最近 5 次编辑的 diff 摘要
    return { label: 'Recent Edits', content: '// Recent edit history', tokens: 10 };
  }

  private async buildErrorContextSection(
    errorInfo: ErrorInfo, budget: number
  ): Promise<ContextSection> {
    const parts: string[] = [];
    
    // 错误消息
    parts.push(`Error: ${errorInfo.message}`);
    
    // 堆栈追踪（截取关键帧）
    if (errorInfo.stackTrace) {
      const relevantFrames = errorInfo.stackTrace
        .split('\n')
        .filter(line => !line.includes('node_modules'))
        .slice(0, 10);
      parts.push(`Stack:\n${relevantFrames.join('\n')}`);
    }

    // 相关日志
    if (errorInfo.logs) {
      parts.push(`Recent logs:\n${errorInfo.logs.slice(-500)}`);
    }

    const content = parts.join('\n\n');
    return {
      label: 'Error Context',
      content,
      tokens: this.estimateTokens(content),
    };
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5);
  }

  private extractSignature(exp: Export): string {
    return `export ${exp.kind} ${exp.name}; // line ${exp.line}`;
  }

  private async readFile(path: string): Promise<string> {
    const { readFile } = await import('fs/promises');
    return readFile(path, 'utf-8');
  }
}
```

### 23.9.3 项目约定感知（Convention-Aware Generation）

生成的代码必须与项目现有代码风格一致，否则即使功能正确也会被开发者拒绝：

```typescript
interface ProjectConventions {
  naming: {
    components: 'PascalCase';
    functions: 'camelCase';
    constants: 'UPPER_SNAKE_CASE';
    files: 'kebab-case' | 'camelCase' | 'PascalCase';
    testFiles: '{name}.test.ts' | '{name}.spec.ts' | '__tests__/{name}.ts';
  };
  imports: {
    order: ('builtin' | 'external' | 'internal' | 'relative')[];
    aliasPrefix: '@/' | '~/' | '#/';
    preferNamedExports: boolean;
  };
  errorHandling: {
    pattern: 'try-catch' | 'Result<T,E>' | 'Either<L,R>';
    customErrorClass: boolean;
    errorBoundary: boolean;
  };
  testing: {
    structure: 'AAA' | 'GWT';   // Arrange-Act-Assert or Given-When-Then
    mockStrategy: 'jest.mock' | 'dependency-injection';
    coverageThreshold: number;
  };
}

class ConventionExtractor {
  async extract(rootPath: string, options: { sampleSize: number; focusOnRecent: boolean }): Promise<ProjectConventions> {
    // 采样分析多个文件以推断约定
    const sampleFiles = await this.selectSampleFiles(rootPath, options);
    const analyses = await Promise.all(
      sampleFiles.map(f => this.analyzeFile(f))
    );

    // 统计各约定的出现频率，取多数
    return {
      naming: this.inferNamingConventions(analyses),
      imports: this.inferImportConventions(analyses),
      errorHandling: this.inferErrorHandling(analyses),
      testing: this.inferTestingPatterns(analyses),
    };
  }

  private async selectSampleFiles(rootPath: string, options: any): Promise<string[]> {
    const { execSync } = await import('child_process');
    
    if (options.focusOnRecent) {
      // 优先选取最近修改的文件
      try {
        const output = execSync(
          `git log --since="60 days ago" --name-only --pretty=format: | grep -E '\\.(ts|tsx)$' | sort -u | head -${options.sampleSize}`,
          { cwd: rootPath, encoding: 'utf-8' }
        );
        const files = output.trim().split('\n').filter(Boolean);
        if (files.length >= 10) return files.map(f => `${rootPath}/${f}`);
      } catch { /* not a git repo */ }
    }

    // 回退：递归查找 TypeScript 文件
    const { execSync: exec } = await import('child_process');
    const output = exec(
      `find ${rootPath} -name '*.ts' -not -path '*/node_modules/*' -not -path '*/dist/*' | head -${options.sampleSize}`,
      { encoding: 'utf-8' }
    );
    return output.trim().split('\n').filter(Boolean);
  }

  private async analyzeFile(filePath: string): Promise<FileAnalysis> {
    const { readFile } = await import('fs/promises');
    const content = await readFile(filePath, 'utf-8');
    
    return {
      path: filePath,
      hasDefaultExport: /export default/.test(content),
      hasNamedExports: /export (const|function|class|interface|type)/.test(content),
      importOrder: this.detectImportOrder(content),
      namingPatterns: this.detectNamingPatterns(content),
      errorPattern: this.detectErrorPattern(content),
      testPattern: filePath.includes('.test.') || filePath.includes('.spec.')
        ? this.detectTestPattern(content)
        : null,
    };
  }

  private detectImportOrder(content: string): string[] {
    const importLines = content.match(/^import .+ from ['"].+['"]/gm) || [];
    return importLines.map(line => {
      const source = line.match(/from ['"](.+)['"]/)?.[1] ?? '';
      if (source.startsWith('.')) return 'relative';
      if (source.startsWith('@/') || source.startsWith('~/')) return 'internal';
      if (['fs', 'path', 'http', 'crypto', 'os'].some(m => source === m)) return 'builtin';
      return 'external';
    });
  }

  private detectNamingPatterns(content: string): Record<string, string> {
    const patterns: Record<string, string> = {};
    // 函数命名
    const funcNames = content.match(/(?:function|const)\s+(\w+)/g) || [];
    if (funcNames.some(n => /^[a-z]/.test(n.split(/\s+/)[1]))) patterns.functions = 'camelCase';
    return patterns;
  }

  private detectErrorPattern(content: string): string {
    if (/Result</.test(content) || /Either</.test(content)) return 'Result<T,E>';
    if (/try\s*{/.test(content)) return 'try-catch';
    return 'unknown';
  }

  private detectTestPattern(content: string): string | null {
    if (/describe\(/.test(content) && /it\(/.test(content)) return 'jest-style';
    if (/Given|When|Then/.test(content)) return 'GWT';
    return 'AAA';
  }

  private inferNamingConventions(analyses: FileAnalysis[]): ProjectConventions['naming'] {
    return {
      components: 'PascalCase',
      functions: 'camelCase',
      constants: 'UPPER_SNAKE_CASE',
      files: 'kebab-case',
      testFiles: '{name}.test.ts',
    };
  }

  private inferImportConventions(analyses: FileAnalysis[]): ProjectConventions['imports'] {
    return {
      order: ['builtin', 'external', 'internal', 'relative'],
      aliasPrefix: '@/',
      preferNamedExports: true,
    };
  }

  private inferErrorHandling(analyses: FileAnalysis[]): ProjectConventions['errorHandling'] {
    const patterns = analyses.map(a => a.errorPattern).filter(Boolean);
    const tryCatchCount = patterns.filter(p => p === 'try-catch').length;
    const resultCount = patterns.filter(p => p === 'Result<T,E>').length;
    
    return {
      pattern: resultCount > tryCatchCount ? 'Result<T,E>' : 'try-catch',
      customErrorClass: false,
      errorBoundary: false,
    };
  }

  private inferTestingPatterns(analyses: FileAnalysis[]): ProjectConventions['testing'] {
    return {
      structure: 'AAA',
      mockStrategy: 'jest.mock',
      coverageThreshold: 80,
    };
  }
}
```

## 23.10 多文件编辑工作流

### 23.10.1 编辑计划生成与执行

当 Agent 需要修改多个文件时，必须制定一个全局一致的编辑计划，而不是逐文件独立修改：

```typescript
interface EditPlan {
  id: string;
  description: string;
  steps: EditStep[];
  dependencyOrder: string[];  // 步骤执行顺序（考虑依赖关系）
  rollbackPlan: RollbackStep[];
  validationChecks: ValidationCheck[];
}

interface EditStep {
  id: string;
  file: string;
  operation: 'create' | 'modify' | 'delete' | 'rename';
  edits: EditOperation[];
  dependsOn: string[];  // 依赖的其他步骤 ID
  riskLevel: 'low' | 'medium' | 'high';
}

class MultiFileEditOrchestrator {
  private planner: EditPlanGenerator;
  private executor: EditExecutor;
  private validator: EditValidator;

  async executeMultiFileEdit(
    task: string,
    targetFiles: string[],
    repoUnderstanding: RepositoryUnderstanding
  ): Promise<EditResult> {
    // 阶段 1：生成编辑计划
    const plan = await this.planner.generatePlan(task, targetFiles, repoUnderstanding);
    console.log(`Edit plan: ${plan.steps.length} steps across ${new Set(plan.steps.map(s => s.file)).size} files`);

    // 阶段 2：验证计划合理性
    const planValidation = await this.validator.validatePlan(plan);
    if (!planValidation.valid) {
      console.error('Plan validation failed:', planValidation.errors);
      return { success: false, errors: planValidation.errors };
    }

    // 阶段 3：创建备份点（用于回滚）
    const backupId = await this.createBackup(plan.steps.map(s => s.file));

    // 阶段 4：按依赖顺序执行编辑
    const results: StepResult[] = [];
    for (const stepId of plan.dependencyOrder) {
      const step = plan.steps.find(s => s.id === stepId)!;
      
      // 高风险步骤需要人工确认
      if (step.riskLevel === 'high') {
        const approved = await this.requestHumanApproval(step);
        if (!approved) {
          await this.rollback(backupId);
          return { success: false, errors: ['Human rejected high-risk step'] };
        }
      }

      try {
        const result = await this.executor.executeStep(step);
        results.push(result);

        // 每步执行后进行增量验证
        const stepValidation = await this.validator.validateStep(step, result);
        if (!stepValidation.valid) {
          console.warn(`Step ${stepId} validation issues:`, stepValidation.warnings);
          if (stepValidation.blocking) {
            await this.rollback(backupId);
            return { success: false, errors: stepValidation.errors };
          }
        }
      } catch (error) {
        console.error(`Step ${stepId} failed:`, error);
        await this.rollback(backupId);
        return { success: false, errors: [`Step ${stepId} failed: ${error}`] };
      }
    }

    // 阶段 5：全局验证
    const globalValidation = await this.runGlobalValidation(plan);
    if (!globalValidation.passed) {
      await this.rollback(backupId);
      return { success: false, errors: globalValidation.errors };
    }

    return {
      success: true,
      steps: results,
      filesModified: [...new Set(plan.steps.map(s => s.file))],
      summary: this.generateSummary(plan, results),
    };
  }

  private async runGlobalValidation(plan: EditPlan): Promise<ValidationResult> {
    const checks: Promise<ValidationResult>[] = [];

    // TypeScript 类型检查
    checks.push(this.runTypeCheck());
    // ESLint 检查
    checks.push(this.runLintCheck(plan.steps.map(s => s.file)));
    // 测试运行
    checks.push(this.runAffectedTests(plan.steps.map(s => s.file)));

    const results = await Promise.all(checks);
    const errors = results.flatMap(r => r.errors || []);
    return {
      passed: errors.length === 0,
      errors,
    };
  }

  private async runTypeCheck(): Promise<ValidationResult> {
    try {
      const { execSync } = await import('child_process');
      execSync('npx tsc --noEmit', { encoding: 'utf-8', timeout: 60_000 });
      return { passed: true, errors: [] };
    } catch (error: any) {
      return { passed: false, errors: [error.stdout || error.message] };
    }
  }

  private async runLintCheck(files: string[]): Promise<ValidationResult> {
    try {
      const { execSync } = await import('child_process');
      execSync(`npx eslint ${files.join(' ')}`, { encoding: 'utf-8', timeout: 30_000 });
      return { passed: true, errors: [] };
    } catch (error: any) {
      return { passed: false, errors: [error.stdout || error.message] };
    }
  }

  private async runAffectedTests(files: string[]): Promise<ValidationResult> {
    try {
      const { execSync } = await import('child_process');
      execSync(`npx jest --findRelatedTests ${files.join(' ')} --passWithNoTests`, {
        encoding: 'utf-8', timeout: 120_000,
      });
      return { passed: true, errors: [] };
    } catch (error: any) {
      return { passed: false, errors: [error.stdout || error.message] };
    }
  }

  private async createBackup(files: string[]): Promise<string> {
    return `backup_${Date.now()}`;
  }

  private async rollback(backupId: string): Promise<void> {
    console.log(`Rolling back to ${backupId}`);
  }

  private async requestHumanApproval(step: EditStep): Promise<boolean> {
    console.log(`[APPROVAL REQUIRED] ${step.file}: ${step.operation}`);
    return true;
  }

  private generateSummary(plan: EditPlan, results: StepResult[]): string {
    return `Completed ${results.length}/${plan.steps.length} steps successfully.`;
  }
}
```

### 23.10.2 编辑格式：Search/Replace 与 Diff

生产级编码助手通常使用两种编辑格式，各有优劣：

| 格式 | 优点 | 缺点 | 适用场景 |
|------|------|------|---------|
| **Search/Replace** | 位置无关（不依赖行号）、抗干扰 | 搜索内容需足够唯一 | 小范围精确修改 |
| **Unified Diff** | 标准格式、人类可读 | 依赖行号、容易偏移 | 大范围修改、代码审查 |
| **Full File** | 最简单、无歧义 | Token 消耗大、可能丢失内容 | 新建文件、小文件 |
| **AST Transform** | 语义级精确 | 实现复杂、语言相关 | 重命名、类型变更 |

```typescript
// Search/Replace 编辑格式实现
interface SearchReplaceEdit {
  file: string;
  search: string;   // 要搜索的精确内容
  replace: string;   // 替换后的内容
}

class SearchReplaceApplier {
  apply(edit: SearchReplaceEdit, fileContent: string): ApplyResult {
    // 查找精确匹配
    const index = fileContent.indexOf(edit.search);

    if (index === -1) {
      // 尝试模糊匹配（处理空白差异）
      const normalizedContent = this.normalizeWhitespace(fileContent);
      const normalizedSearch = this.normalizeWhitespace(edit.search);
      const fuzzyIndex = normalizedContent.indexOf(normalizedSearch);
      
      if (fuzzyIndex === -1) {
        return { success: false, error: 'Search pattern not found in file' };
      }

      // 模糊匹配成功，需要找到原始内容中的对应位置
      return this.applyFuzzyMatch(edit, fileContent, fuzzyIndex);
    }

    // 检查唯一性——搜索内容应只出现一次
    const secondIndex = fileContent.indexOf(edit.search, index + 1);
    if (secondIndex !== -1) {
      return {
        success: false,
        error: `Search pattern found ${this.countOccurrences(fileContent, edit.search)} times. Need unique match.`,
      };
    }

    const newContent = fileContent.slice(0, index) + edit.replace + fileContent.slice(index + edit.search.length);
    return { success: true, newContent };
  }

  private normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private applyFuzzyMatch(
    edit: SearchReplaceEdit, fileContent: string, fuzzyIndex: number
  ): ApplyResult {
    // 简化实现：直接用正则处理空白差异
    const pattern = edit.search.replace(/\s+/g, '\\s+');
    const regex = new RegExp(pattern);
    const newContent = fileContent.replace(regex, edit.replace);
    return { success: true, newContent, warning: 'Applied via fuzzy whitespace matching' };
  }

  private countOccurrences(text: string, search: string): number {
    let count = 0;
    let pos = 0;
    while ((pos = text.indexOf(search, pos)) !== -1) { count++; pos++; }
    return count;
  }
}
```

## 23.11 与 Git 和 CI/CD 集成

### 23.11.1 Git 工作流集成

```typescript
class GitIntegration {
  private execGit(command: string, cwd: string): string {
    const { execSync } = require('child_process');
    return execSync(`git ${command}`, { cwd, encoding: 'utf-8' }).trim();
  }

  // 创建 Agent 工作分支
  async createAgentBranch(issueId: string, cwd: string): Promise<string> {
    const baseBranch = this.execGit('rev-parse --abbrev-ref HEAD', cwd);
    const branchName = `agent/issue-${issueId}-${Date.now()}`;
    
    this.execGit(`checkout -b ${branchName}`, cwd);
    return branchName;
  }

  // 智能提交：根据变更内容自动生成提交消息
  async smartCommit(
    files: string[],
    editPlan: EditPlan,
    cwd: string
  ): Promise<string> {
    // Stage 变更的文件
    for (const file of files) {
      this.execGit(`add ${file}`, cwd);
    }

    // 基于编辑计划生成 Conventional Commit 消息
    const commitMessage = this.generateCommitMessage(editPlan);
    this.execGit(`commit -m "${commitMessage}"`, cwd);
    
    return commitMessage;
  }

  // 生成 PR 描述
  async generatePRDescription(
    editPlan: EditPlan,
    testResults: TestResult,
    issue?: GitIssue
  ): Promise<string> {
    const sections: string[] = [];

    // 摘要
    sections.push(`## Summary\n\n${editPlan.description}`);

    // 变更列表
    const changes = editPlan.steps.map(step =>
      `- \`${step.file}\`: ${step.operation} — ${step.edits.map(e => e.description).join(', ')}`
    );
    sections.push(`## Changes\n\n${changes.join('\n')}`);

    // 测试结果
    const testStatus = testResults.failed === 0 ? '✅ All tests passed' : `⚠️ ${testResults.failed} tests failed`;
    sections.push(`## Test Results\n\n${testStatus}\n- Total: ${testResults.total}\n- Passed: ${testResults.passed}\n- Failed: ${testResults.failed}`);

    // 关联 Issue
    if (issue) {
      sections.push(`## Related Issue\n\nCloses #${issue.id}`);
    }

    // Agent 信息
    sections.push(`## Agent Info\n\n- Generated by: Coding Assistant Agent\n- Model: Claude Sonnet 4\n- Confidence: ${editPlan.confidence ?? 'N/A'}\n- Human review recommended: ${editPlan.steps.some(s => s.riskLevel === 'high') ? 'Yes' : 'No'}`);

    return sections.join('\n\n');
  }

  private generateCommitMessage(plan: EditPlan): string {
    // Conventional Commits 格式
    const type = this.inferCommitType(plan);
    const scope = this.inferScope(plan);
    const subject = plan.description.slice(0, 72);
    
    return scope ? `${type}(${scope}): ${subject}` : `${type}: ${subject}`;
  }

  private inferCommitType(plan: EditPlan): string {
    const operations = plan.steps.map(s => s.operation);
    if (operations.includes('create') && operations.length === 1) return 'feat';
    if (plan.description.toLowerCase().includes('fix')) return 'fix';
    if (plan.description.toLowerCase().includes('refactor')) return 'refactor';
    if (plan.steps.every(s => s.file.includes('.test.'))) return 'test';
    return 'chore';
  }

  private inferScope(plan: EditPlan): string | null {
    const dirs = plan.steps.map(s => s.file.split('/').slice(0, -1).join('/'));
    const uniqueDirs = [...new Set(dirs)];
    if (uniqueDirs.length === 1) return uniqueDirs[0].split('/').pop() || null;
    return null;
  }
}
```

### 23.11.2 CI/CD 管线集成

```typescript
interface CIIntegration {
  // 在 CI 中运行 Agent 生成的变更
  runInCI(pr: PullRequest): Promise<CIResult>;
  // 基于 CI 结果自动修复
  autoFixFromCI(ciResult: CIResult): Promise<CodeEdit[]>;
}

class CICDPipeline implements CIIntegration {
  async runInCI(pr: PullRequest): Promise<CIResult> {
    const checks: CICheck[] = [
      { name: 'type-check', command: 'npx tsc --noEmit', timeout: 60_000 },
      { name: 'lint', command: 'npx eslint . --ext .ts,.tsx', timeout: 30_000 },
      { name: 'test', command: 'npx jest --ci --coverage', timeout: 300_000 },
      { name: 'build', command: 'npm run build', timeout: 120_000 },
      { name: 'security', command: 'npx audit-ci --moderate', timeout: 30_000 },
    ];

    const results: CICheckResult[] = [];
    for (const check of checks) {
      const result = await this.runCheck(check);
      results.push(result);
      
      // 如果关键检查失败，提前终止
      if (!result.passed && ['type-check', 'build'].includes(check.name)) {
        break;
      }
    }

    return {
      passed: results.every(r => r.passed),
      checks: results,
      coverageReport: results.find(r => r.name === 'test')?.metadata?.coverage,
    };
  }

  async autoFixFromCI(ciResult: CIResult): Promise<CodeEdit[]> {
    const fixes: CodeEdit[] = [];

    for (const check of ciResult.checks) {
      if (check.passed) continue;

      switch (check.name) {
        case 'lint':
          // 尝试自动修复 lint 错误
          fixes.push(...await this.autoFixLint(check.output));
          break;
        case 'type-check':
          // 分析类型错误并尝试修复
          fixes.push(...await this.autoFixTypeErrors(check.output));
          break;
        case 'test':
          // 分析测试失败并尝试修复
          fixes.push(...await this.autoFixTests(check.output));
          break;
      }
    }

    return fixes;
  }

  private async runCheck(check: CICheck): Promise<CICheckResult> {
    const { execSync } = await import('child_process');
    try {
      const output = execSync(check.command, {
        encoding: 'utf-8', timeout: check.timeout,
      });
      return { name: check.name, passed: true, output, metadata: {} };
    } catch (error: any) {
      return { name: check.name, passed: false, output: error.stdout || error.message, metadata: {} };
    }
  }

  private async autoFixLint(output: string): Promise<CodeEdit[]> {
    // 运行 eslint --fix
    try {
      const { execSync } = await import('child_process');
      execSync('npx eslint . --ext .ts,.tsx --fix', { encoding: 'utf-8' });
    } catch { /* eslint --fix 可能仍有错误 */ }
    return [];
  }

  private async autoFixTypeErrors(output: string): Promise<CodeEdit[]> {
    // 解析 tsc 输出，提取错误位置和类型
    const errors = output.match(/(.+)\((\d+),(\d+)\): error TS(\d+): (.+)/g) || [];
    return errors.map(e => {
      const match = e.match(/(.+)\((\d+),(\d+)\): error TS(\d+): (.+)/);
      if (!match) return null;
      return {
        file: match[1],
        line: parseInt(match[2]),
        errorCode: match[4],
        message: match[5],
      };
    }).filter(Boolean) as any;
  }

  private async autoFixTests(output: string): Promise<CodeEdit[]> {
    return [];
  }
}
```

## 23.12 评估体系

### 23.12.1 编码助手评估指标全景

| 评估维度 | 指标 | 描述 | 业界基准 |
|---------|------|------|---------|
| **代码正确性** | pass@k | k 次生成中至少 1 次通过测试的概率 | HumanEval pass@1 ≈ 90%+ |
| **任务完成** | SWE-bench | 真实 GitHub Issue 解决率 | Verified: 60-80% |
| **编辑精确性** | Exact Match | 生成的 Diff 与参考 Diff 完全匹配 | 40-60% |
| **用户接受率** | Acceptance Rate | 用户接受 Agent 建议的比例 | > 30% 为良好 |
| **效率提升** | Time Saved | 使用 Agent vs 手动完成的时间差 | 30-55% 时间节省 |
| **代码质量** | Quality Score | 生成代码的可维护性、可读性评分 | 无统一基准 |
| **安全性** | Vulnerability Rate | 生成代码中安全漏洞的比例 | < 1% |
| **延迟** | P50/P95 Latency | 从请求到首 Token / 完整响应 | P50 < 200ms (补全) |

### 23.12.2 自动化评估管线

```typescript
interface CodingBenchmark {
  name: string;
  tasks: CodingTask[];
  evaluator: TaskEvaluator;
}

class CodingAssistantEvaluator {
  private benchmarks: CodingBenchmark[] = [];

  // HumanEval 风格评估
  async evaluateCodeGeneration(
    agent: CodingAgent,
    tasks: CodeGenTask[]
  ): Promise<CodeGenEvalResult> {
    const results: TaskResult[] = [];
    
    for (const task of tasks) {
      const attempts: string[] = [];
      
      // 生成 k 次
      for (let i = 0; i < task.k; i++) {
        const generated = await agent.generateCode(task.prompt, task.context);
        attempts.push(generated);
      }

      // 对每次生成运行测试
      const passResults = await Promise.all(
        attempts.map(code => this.runTestCases(code, task.testCases))
      );

      const atLeastOnePassed = passResults.some(r => r.allPassed);
      
      results.push({
        taskId: task.id,
        attempts: attempts.length,
        passed: atLeastOnePassed,
        passCount: passResults.filter(r => r.allPassed).length,
        executionTime: passResults.map(r => r.executionTime),
      });
    }

    // 计算 pass@k
    const passAtK = results.filter(r => r.passed).length / results.length;
    const passAt1 = results.reduce((sum, r) => sum + r.passCount / r.attempts, 0) / results.length;

    return {
      passAtK,
      passAt1,
      totalTasks: tasks.length,
      passedTasks: results.filter(r => r.passed).length,
      averageAttempts: results.reduce((sum, r) => sum + r.attempts, 0) / results.length,
      details: results,
    };
  }

  // SWE-bench 风格评估
  async evaluateIssueResolution(
    agent: CodingAgent,
    issues: SWEBenchTask[]
  ): Promise<SWEBenchResult> {
    const results: IssueResult[] = [];

    for (const issue of issues) {
      // 设置代码库环境
      await this.setupRepository(issue.repo, issue.baseCommit);

      // Agent 解决 Issue
      const startTime = Date.now();
      const pr = await agent.handleIssue({
        id: issue.id,
        title: issue.title,
        body: issue.body,
        repo: issue.repo,
      });
      const duration = Date.now() - startTime;

      // 应用 Agent 的变更
      await this.applyChanges(pr.edits);

      // 运行 Issue 的验证测试
      const testResult = await this.runValidationTests(issue.validationTests);

      results.push({
        issueId: issue.id,
        resolved: testResult.allPassed,
        duration,
        filesModified: pr.edits.map(e => e.file),
        testsPassed: testResult.passed,
        testsFailed: testResult.failed,
      });

      // 清理
      await this.cleanupRepository(issue.repo);
    }

    return {
      resolvedRate: results.filter(r => r.resolved).length / results.length,
      averageDuration: results.reduce((sum, r) => sum + r.duration, 0) / results.length,
      results,
    };
  }

  // 用户体验评估
  async evaluateUserExperience(
    agent: CodingAgent,
    sessions: RecordedSession[]
  ): Promise<UXEvalResult> {
    let totalSuggestions = 0;
    let acceptedSuggestions = 0;
    let totalCharsSaved = 0;
    let totalEditCycles = 0;

    for (const session of sessions) {
      for (const event of session.events) {
        if (event.type === 'suggestion') {
          totalSuggestions++;
          if (event.accepted) {
            acceptedSuggestions++;
            totalCharsSaved += event.charCount;
          }
        }
        if (event.type === 'edit_cycle') {
          totalEditCycles++;
        }
      }
    }

    return {
      acceptanceRate: totalSuggestions > 0 ? acceptedSuggestions / totalSuggestions : 0,
      averageCharsSaved: totalSuggestions > 0 ? totalCharsSaved / totalSuggestions : 0,
      editCyclesPerTask: sessions.length > 0 ? totalEditCycles / sessions.length : 0,
      userSatisfactionScore: await this.calculateSatisfactionScore(sessions),
    };
  }

  private async runTestCases(code: string, testCases: TestCase[]): Promise<TestRunResult> {
    let passed = 0;
    let failed = 0;
    const startTime = Date.now();

    for (const tc of testCases) {
      try {
        const fn = new Function('input', code + `\nreturn solution(input);`);
        const result = fn(tc.input);
        if (JSON.stringify(result) === JSON.stringify(tc.expected)) passed++;
        else failed++;
      } catch { failed++; }
    }

    return {
      allPassed: failed === 0,
      passed,
      failed,
      executionTime: Date.now() - startTime,
    };
  }

  private async setupRepository(repo: string, commit: string): Promise<void> {}
  private async applyChanges(edits: CodeEdit[]): Promise<void> {}
  private async runValidationTests(tests: string[]): Promise<{ allPassed: boolean; passed: number; failed: number }> {
    return { allPassed: true, passed: tests.length, failed: 0 };
  }
  private async cleanupRepository(repo: string): Promise<void> {}
  private async calculateSatisfactionScore(sessions: RecordedSession[]): Promise<number> {
    return 4.2; // 示例：4.2/5
  }
}
```

## 23.13 安全考量与沙箱设计

### 23.13.1 编码 Agent 安全威胁模型

编码助手具有独特的安全风险——它可以访问文件系统、执行终端命令、提交代码：

| 威胁 | 描述 | 缓解措施 |
|------|------|---------|
| **恶意代码注入** | Agent 生成包含后门的代码 | 代码审查 + 安全扫描 |
| **供应链攻击** | Agent 引入恶意依赖包 | 依赖白名单 + 漏洞扫描 |
| **数据泄露** | Agent 将代码库内容发送到外部 | 网络隔离 + 出口过滤 |
| **权限提升** | Agent 执行超权限操作 | 最小权限 + 命令白名单 |
| **破坏性操作** | Agent 删除文件或 force push | 操作确认 + 不可逆操作阻止 |
| **Prompt 注入** | 恶意代码注释诱导 Agent 行为 | 输入净化 + 指令隔离 |

```typescript
class CodingAgentSandbox {
  private allowedCommands: Set<string>;
  private blockedPatterns: RegExp[];
  private maxFileSize: number;

  constructor() {
    // 允许的终端命令白名单
    this.allowedCommands = new Set([
      'npm', 'npx', 'node', 'tsc', 'eslint', 'jest', 'vitest',
      'git status', 'git diff', 'git log', 'git add', 'git commit',
      'cat', 'ls', 'find', 'grep', 'wc', 'head', 'tail',
    ]);

    // 阻止的危险模式
    this.blockedPatterns = [
      /rm\s+-rf/,
      /git\s+push\s+.*--force/,
      /git\s+push\s+.*-f\b/,
      /curl\s+.*\|\s*sh/,
      /wget\s+.*\|\s*sh/,
      /eval\s*\(/,
      />\s*\/dev\/sd/,
      /mkfs/,
      /dd\s+if=/,
      /:(){ :\|:& };:/,  // fork bomb
    ];

    this.maxFileSize = 10 * 1024 * 1024; // 10MB
  }

  async executeCommand(command: string): Promise<CommandResult> {
    // 1. 检查是否包含危险模式
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(command)) {
        return {
          success: false,
          error: `Blocked dangerous command pattern: ${pattern.source}`,
          blocked: true,
        };
      }
    }

    // 2. 检查命令是否在白名单中
    const baseCommand = command.split(/\s+/)[0];
    if (!this.allowedCommands.has(baseCommand)) {
      // 检查复合命令
      const fullPrefix = command.match(/^(\S+\s+\S+)/)?.[1];
      if (!fullPrefix || !this.allowedCommands.has(fullPrefix)) {
        return {
          success: false,
          error: `Command not in whitelist: ${baseCommand}`,
          blocked: true,
        };
      }
    }

    // 3. 在受限环境中执行
    try {
      const { execSync } = await import('child_process');
      const output = execSync(command, {
        encoding: 'utf-8',
        timeout: 60_000,
        env: {
          ...process.env,
          // 限制 Agent 的环境变量访问
          NODE_ENV: 'development',
          PATH: '/usr/local/bin:/usr/bin:/bin',
        },
      });
      return { success: true, output };
    } catch (error: any) {
      return { success: false, error: error.message, output: error.stdout };
    }
  }

  async writeFile(path: string, content: string): Promise<WriteResult> {
    // 1. 路径安全检查
    const normalizedPath = require('path').resolve(path);
    const workspaceRoot = process.cwd();
    if (!normalizedPath.startsWith(workspaceRoot)) {
      return { success: false, error: 'Cannot write outside workspace' };
    }

    // 2. 文件大小检查
    if (Buffer.byteLength(content) > this.maxFileSize) {
      return { success: false, error: `File exceeds max size: ${this.maxFileSize} bytes` };
    }

    // 3. 禁止覆盖关键文件
    const protectedFiles = ['.env', '.env.local', '.env.production', 'package-lock.json', 'yarn.lock'];
    const basename = require('path').basename(path);
    if (protectedFiles.includes(basename)) {
      return { success: false, error: `Cannot overwrite protected file: ${basename}` };
    }

    // 4. 执行写入
    const { writeFile, mkdir } = await import('fs/promises');
    const dir = require('path').dirname(normalizedPath);
    await mkdir(dir, { recursive: true });
    await writeFile(normalizedPath, content, 'utf-8');
    return { success: true };
  }

  // 代码安全扫描
  async scanGeneratedCode(code: string, language: string): Promise<SecurityScanResult> {
    const issues: SecurityIssue[] = [];

    // 检查常见安全问题
    const patterns: { pattern: RegExp; severity: string; description: string }[] = [
      { pattern: /eval\s*\(/, severity: 'high', description: 'Use of eval()' },
      { pattern: /innerHTML\s*=/, severity: 'medium', description: 'Direct innerHTML assignment (XSS risk)' },
      { pattern: /document\.write/, severity: 'medium', description: 'Use of document.write' },
      { pattern: /exec\s*\(.*\$\{/, severity: 'high', description: 'Command injection via template literal' },
      { pattern: /new Function\s*\(/, severity: 'high', description: 'Dynamic function creation' },
      { pattern: /password\s*[:=]\s*['"]/, severity: 'critical', description: 'Hardcoded password' },
      { pattern: /api[_-]?key\s*[:=]\s*['"]/, severity: 'critical', description: 'Hardcoded API key' },
      { pattern: /SELECT\s+.*\+.*(?:req|input|param)/i, severity: 'high', description: 'Potential SQL injection' },
    ];

    for (const { pattern, severity, description } of patterns) {
      const matches = code.match(new RegExp(pattern, 'g'));
      if (matches) {
        issues.push({
          severity: severity as any,
          description,
          occurrences: matches.length,
          pattern: pattern.source,
        });
      }
    }

    return {
      safe: issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0,
      issues,
    };
  }
}
```

## 23.14 实际部署考量

### 23.14.1 生产环境部署清单

```markdown
## 编码助手生产部署清单

### 基础设施
- [ ] LLM API 配置（主模型 + 回退模型）
- [ ] 向量数据库部署（代码索引存储）
- [ ] 缓存层配置（Redis / 本地缓存）
- [ ] 日志和监控系统（延迟、错误率、接受率）

### 安全
- [ ] 命令执行沙箱配置
- [ ] 文件系统访问权限控制
- [ ] 网络出口过滤规则
- [ ] 代码安全扫描管线
- [ ] API Key 轮换和权限最小化

### 性能
- [ ] 代码索引预热（首次打开项目时）
- [ ] 增量索引管线（文件变更时）
- [ ] 预测性补全预加载
- [ ] 流式输出配置
- [ ] 超时和重试策略

### 用户体验
- [ ] IDE 插件安装和配置
- [ ] 键盘快捷键设置
- [ ] 内联建议 vs 侧边栏模式选择
- [ ] 用户偏好存储（语言、风格、频率）
- [ ] 反馈收集机制（接受 / 拒绝 / 编辑）

### 评估和运营
- [ ] A/B 测试框架
- [ ] 接受率监控仪表盘
- [ ] 用户满意度调查
- [ ] 每周质量审查流程
- [ ] 模型版本升级流程
```

### 23.14.2 成本优化策略

| 优化策略 | 描述 | 预期节省 |
|---------|------|---------|
| **Token 缓存** | 相同上下文的重复查询缓存 | 20-40% |
| **模型分层** | 补全用小模型、复杂任务用大模型 | 30-50% |
| **增量索引** | 只重新索引变更的文件 | 70% 索引成本 |
| **请求合并** | 短时间内多次请求合并为一次 | 15-25% |
| **上下文裁剪** | 精确选择相关上下文，减少 token 浪费 | 20-30% |
| **预测性取消** | 用户继续输入时取消进行中的请求 | 10-20% |

```typescript
class CostOptimizer {
  private cache: Map<string, { result: string; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 分钟

  // 模型路由：根据任务复杂度选择模型
  selectModel(task: CodingTask): ModelConfig {
    const complexity = this.assessComplexity(task);

    if (complexity < 0.3) {
      // 简单任务：使用轻量模型
      return {
        model: 'claude-haiku-4',
        maxTokens: 2000,
        costPerInputToken: 0.00025 / 1000,
        costPerOutputToken: 0.00125 / 1000,
      };
    } else if (complexity < 0.7) {
      // 中等任务：使用标准模型
      return {
        model: 'claude-sonnet-4',
        maxTokens: 8000,
        costPerInputToken: 0.003 / 1000,
        costPerOutputToken: 0.015 / 1000,
      };
    } else {
      // 复杂任务：使用高端模型
      return {
        model: 'claude-opus-4',
        maxTokens: 16000,
        costPerInputToken: 0.015 / 1000,
        costPerOutputToken: 0.075 / 1000,
      };
    }
  }

  // 请求去重和缓存
  async cachedGenerate(
    prompt: string,
    model: ModelConfig,
    generator: (prompt: string, model: ModelConfig) => Promise<string>
  ): Promise<string> {
    const cacheKey = this.hashPrompt(prompt, model.model);
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.result;
    }

    const result = await generator(prompt, model);
    this.cache.set(cacheKey, { result, timestamp: Date.now() });
    
    // 清理过期缓存
    this.pruneCache();
    
    return result;
  }

  private assessComplexity(task: CodingTask): number {
    let score = 0;
    if (task.type === 'completion') score += 0.1;
    if (task.type === 'refactor') score += 0.5;
    if (task.type === 'feature') score += 0.7;
    if (task.type === 'debug') score += 0.4;
    if (task.filesInvolved > 5) score += 0.2;
    if (task.estimatedLines > 100) score += 0.2;
    return Math.min(score, 1.0);
  }

  private hashPrompt(prompt: string, model: string): string {
    const { createHash } = require('crypto');
    return createHash('sha256').update(`${model}:${prompt}`).digest('hex').slice(0, 16);
  }

  private pruneCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.cache.delete(key);
      }
    }
  }
}
```

## 23.15 案例研究：构建一个 Mini Claude Code

### 23.15.1 端到端实现

下面我们构建一个简化版的 Claude Code 风格编码 Agent，展示核心架构的完整连接：

```typescript
class MiniClaudeCode {
  private indexer: CodebaseIndexer;
  private contextBuilder: SmartContextBuilder;
  private diffGenerator: DiffGenerator;
  private testRunner: TestRunner;
  private gitIntegration: GitIntegration;
  private sandbox: CodingAgentSandbox;
  private costOptimizer: CostOptimizer;
  private llm: LLMClient;

  constructor(config: MiniClaudeCodeConfig) {
    this.indexer = new CodebaseIndexer();
    this.contextBuilder = new SmartContextBuilder();
    this.diffGenerator = new DiffGenerator();
    this.testRunner = new TestRunner();
    this.gitIntegration = new GitIntegration();
    this.sandbox = new CodingAgentSandbox();
    this.costOptimizer = new CostOptimizer();
    this.llm = new LLMClient(config.apiKey);
  }

  // 主循环：REPL 式交互
  async run(workspacePath: string): Promise<void> {
    // 1. 索引代码库
    console.log('Indexing workspace...');
    await this.indexer.indexWorkspace(workspacePath);
    console.log(`Indexed ${this.indexer.fileCount} files, ${this.indexer.symbolCount} symbols`);

    // 2. 分析项目
    const repoAnalyzer = new RepositoryAnalyzer();
    const understanding = await repoAnalyzer.analyze(workspacePath);
    console.log(`Detected: ${understanding.structure.framework} + ${understanding.structure.language}`);

    // 3. 进入交互循环
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    while (true) {
      const userInput = await new Promise<string>(resolve => {
        rl.question('\n> ', resolve);
      });

      if (userInput === 'exit' || userInput === 'quit') break;

      try {
        await this.handleUserRequest(userInput, workspacePath, understanding);
      } catch (error) {
        console.error('Error:', error);
      }
    }

    rl.close();
  }

  private async handleUserRequest(
    request: string,
    workspacePath: string,
    understanding: RepositoryUnderstanding
  ): Promise<void> {
    // 分类请求类型
    const taskType = await this.classifyRequest(request);
    console.log(`Task type: ${taskType}`);

    switch (taskType) {
      case 'explain':
        await this.handleExplain(request, workspacePath);
        break;
      case 'edit':
        await this.handleEdit(request, workspacePath, understanding);
        break;
      case 'debug':
        await this.handleDebug(request, workspacePath);
        break;
      case 'test':
        await this.handleTest(request, workspacePath);
        break;
      case 'search':
        await this.handleSearch(request, workspacePath);
        break;
      default:
        await this.handleGeneral(request, workspacePath);
    }
  }

  private async classifyRequest(request: string): Promise<string> {
    const keywords: Record<string, string[]> = {
      explain: ['explain', 'what does', 'how does', '解释', '什么意思'],
      edit: ['add', 'change', 'modify', 'refactor', 'rename', '添加', '修改', '重构'],
      debug: ['fix', 'bug', 'error', 'crash', '修复', '错误', '报错'],
      test: ['test', 'spec', 'coverage', '测试', '覆盖率'],
      search: ['find', 'search', 'where', 'grep', '查找', '搜索'],
    };

    for (const [type, words] of Object.entries(keywords)) {
      if (words.some(w => request.toLowerCase().includes(w))) return type;
    }
    return 'general';
  }

  private async handleEdit(
    request: string,
    workspacePath: string,
    understanding: RepositoryUnderstanding
  ): Promise<void> {
    // 1. 确定需要编辑的文件
    const targetFiles = await this.identifyTargetFiles(request, workspacePath);
    console.log(`Target files: ${targetFiles.join(', ')}`);

    // 2. 构建上下文
    const task: CodingTask = { type: 'feature', description: request };
    const context = await this.contextBuilder.buildContext(
      task, targetFiles[0], 0, 16000
    );

    // 3. 生成编辑
    const edits = await this.diffGenerator.generateEdits(request, targetFiles);
    
    // 4. 安全扫描
    for (const edit of edits) {
      if (edit.newContent) {
        const scan = await this.sandbox.scanGeneratedCode(edit.newContent, 'typescript');
        if (!scan.safe) {
          console.warn(`Security issues in ${edit.file}:`, scan.issues);
        }
      }
    }

    // 5. 展示变更并请求确认
    this.displayEdits(edits);
    console.log('\nApply these changes? (y/n)');
    // 在实际实现中，这里会等待用户确认

    // 6. 应用变更
    // await this.applyEdits(edits);

    // 7. 运行测试
    const testResult = await this.testRunner.runRelevantTests(edits);
    console.log(`Tests: ${testResult.passed}/${testResult.total} passed`);
  }

  private async handleExplain(request: string, workspacePath: string): Promise<void> {
    const model = this.costOptimizer.selectModel({ type: 'completion' } as any);
    const response = await this.llm.generate(`Explain this code:\n${request}`, model);
    console.log(response);
  }

  private async handleDebug(request: string, workspacePath: string): Promise<void> {
    console.log('Analyzing error...');
    const task: CodingTask = { type: 'debug', description: request };
    // 调试流程：收集错误上下文 → 分析原因 → 生成修复
    console.log('Debug analysis complete.');
  }

  private async handleTest(request: string, workspacePath: string): Promise<void> {
    const result = await this.sandbox.executeCommand('npx jest --no-coverage');
    console.log(result.output);
  }

  private async handleSearch(request: string, workspacePath: string): Promise<void> {
    const query = request.replace(/^(find|search|grep|查找|搜索)\s*/i, '');
    const results = await this.indexer.semanticSearch(query, 5000);
    for (const r of results.slice(0, 10)) {
      console.log(`${r.source} (relevance: ${r.relevance.toFixed(2)})`);
      console.log(`  ${r.content.slice(0, 100)}...`);
    }
  }

  private async handleGeneral(request: string, workspacePath: string): Promise<void> {
    const model = this.costOptimizer.selectModel({ type: 'completion' } as any);
    const response = await this.llm.generate(request, model);
    console.log(response);
  }

  private async identifyTargetFiles(request: string, workspacePath: string): Promise<string[]> {
    // 从请求中提取文件路径提及
    const pathPattern = /[\w/-]+\.\w+/g;
    const mentioned = request.match(pathPattern) || [];
    if (mentioned.length > 0) return mentioned;

    // 通过语义搜索找到相关文件
    const snippets = await this.indexer.semanticSearch(request, 3000);
    return [...new Set(snippets.map(s => s.source.split(':')[0]))].slice(0, 5);
  }

  private displayEdits(edits: CodeEdit[]): void {
    for (const edit of edits) {
      console.log(`\n--- ${edit.file} ---`);
      console.log(edit.diff || edit.description);
    }
  }
}
```

## 23.16 小结

智能编码助手是 AI Agent 技术最成功、最前沿的应用领域。本章从架构到实现、从评估到部署，完整呈现了一个生产级编码助手的设计要点：

1. **Repository Intelligence** 是核心能力——Agent 必须理解项目的架构、约定和设计意图，而不仅仅是光标附近的几行代码

2. **上下文工程是关键瓶颈**——在有限的token 预算内精确选择最相关的代码上下文，直接决定了生成质量。动态预算分配策略根据任务类型（补全、重构、调试、新功能）调整上下文组成

3. **编辑精确性要求严格**——与自然语言生成不同，代码编辑必须精确到字符级别。Search/Replace 模式、Diff 模式、AST 级变换各有适用场景

4. **安全沙箱不可或缺**——编码 Agent 拥有文件系统和终端访问权限，必须通过命令白名单、路径限制、安全扫描等手段防范风险

5. **反馈循环驱动质量**——编译检查 → 类型检查 → 测试运行 → 代码审查，每一层反馈都帮助 Agent 自我修正

6. **渐进自主是正确策略**——不是所有任务都需要 L4 级自主；根据任务复杂度和风险等级动态调整人机协作比例

7. **成本控制贯穿始终**——模型分层、Token 缓存、增量索引、请求合并等策略组合使用，确保在可接受的成本范围内提供最佳体验

编码助手是 Agent 工程的最佳练兵场——它同时需要上下文工程（第 5 章）、工具系统（第 6 章）、记忆管理（第 7 章）、信任架构（第 14 章）、评估体系（第 15-16 章）和成本工程（第 19 章）的综合运用。掌握编码助手的设计，就掌握了 Agent 工程的核心能力。
