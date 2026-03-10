# 附录 A：开发环境搭建指南

## A.1 基础环境要求

### A.1.1 系统要求

| 组件 | 最低要求 | 推荐配置 |
|------|---------|---------|
| OS | macOS 13+ / Ubuntu 22.04+ / Windows 11 WSL2 | macOS 14+ (Apple Silicon) |
| Node.js | v18.0+ | v20 LTS |
| TypeScript | v5.0+ | v5.5+ |
| Python | v3.10+ (部分工具需要) | v3.12 |
| Docker | v24.0+ | v25.0+ |
| 内存 | 8 GB | 16 GB+ |
| 磁盘 | 20 GB 可用 | SSD 50 GB+ |

### A.1.2 快速安装脚本

```bash
#!/bin/bash
# AI Agent 开发环境一键安装脚本

echo "=== AI Agent Engineering 开发环境安装 ==="

# 1. 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "安装 Node.js..."
    curl -fsSL https://fnm.vercel.app/install | bash
    fnm install 20
    fnm use 20
fi
echo "Node.js: $(node --version)"

# 2. 安装 pnpm
if ! command -v pnpm &> /dev/null; then
    npm install -g pnpm
fi
echo "pnpm: $(pnpm --version)"

# 3. 安装 TypeScript
pnpm add -g typescript tsx

# 4. 克隆项目
git clone https://github.com/example/ai-agent-engineering.git
cd ai-agent-engineering/code-examples

# 5. 安装依赖
pnpm install

echo "=== 环境安装完成 ==="
echo "运行 'pnpm tsx 01-basic-agent-loop.ts' 验证安装"
```

## A.2 API Key 配置

### A.2.1 支持的 LLM 提供商

| 提供商 | 环境变量 | 获取方式 |
|-------|---------|---------|
| OpenAI | `OPENAI_API_KEY` | platform.openai.com |
| Anthropic | `ANTHROPIC_API_KEY` | console.anthropic.com |
| Google AI | `GOOGLE_API_KEY` | aistudio.google.com |
| DeepSeek | `DEEPSEEK_API_KEY` | platform.deepseek.com |
| 本地模型 | `OLLAMA_BASE_URL` | ollama.ai |

### A.2.2 环境变量配置

```bash
# .env 文件（勿提交到版本控制）
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AI...

# 可选：代理配置
HTTP_PROXY=http://proxy:7890
HTTPS_PROXY=http://proxy:7890

# 可选：本地模型
OLLAMA_BASE_URL=http://localhost:11434
```

## A.3 IDE 配置

### A.3.1 VS Code 推荐扩展

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-typescript-next",
    "bradlc.vscode-tailwindcss",
    "github.copilot",
    "Continue.continue",
    "ms-azuretools.vscode-docker"
  ]
}
```

### A.3.2 调试配置

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Agent",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "tsx",
      "args": ["${file}"],
      "env": {
        "DEBUG": "agent:*",
        "LOG_LEVEL": "debug"
      },
      "console": "integratedTerminal"
    }
  ]
}
```

## A.4 Docker 开发环境

### A.4.1 开发用 Docker Compose

```yaml
version: '3.8'
services:
  # 向量数据库
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage

  # Redis（缓存 & 会话）
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  # PostgreSQL（持久化存储）
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: agent_db
      POSTGRES_USER: agent
      POSTGRES_PASSWORD: agent_dev_password
    ports:
      - "5432:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data

  # Jaeger（追踪）
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"
      - "4318:4318"

volumes:
  qdrant_data:
  pg_data:
```

## A.5 常见问题排查

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| `ECONNREFUSED` | API 服务不可达 | 检查网络/代理配置 |
| `Rate limit exceeded` | API 限流 | 添加 RateLimiter，降低并发 |
| `Out of memory` | 上下文过长 | 启用 Context Compaction |
| `Type error` | TypeScript 版本 | 升级至 5.0+ |
| `Module not found` | 依赖缺失 | 运行 `pnpm install` |
