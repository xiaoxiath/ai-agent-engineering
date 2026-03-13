# 附录 D：Agent 安全检查清单

> 本检查清单对齐 [[OWASP Agentic AI Top 10]](https://owasp.org/www-project-agentic-ai-top-10/) 风险分类（ASI01–ASI10）。每个检查项标注了对应的 OWASP 风险 ID，便于与组织安全策略映射。

### OWASP Agentic AI Top 10 速查

| 风险 ID | 风险名称 | 简述 |
|---------|---------|------|
| ASI01 | Excessive Agency | Agent 拥有超出必要范围的权限或自主权 |
| ASI02 | Prompt Injection | 通过恶意输入操纵 Agent 行为 |
| ASI03 | Supply Chain Vulnerabilities | 第三方组件、插件、模型的供应链风险 |
| ASI04 | Knowledge Poisoning | 知识库或训练数据被污染 |
| ASI05 | Memory Threats | Agent 记忆系统被篡改或泄露 |
| ASI06 | Uncontrolled Escalation | Agent 不受控地升级权限或调用链 |
| ASI07 | Misaligned Behaviors | Agent 行为偏离预期目标 |
| ASI08 | Identity and Access Mismanagement | 身份认证和访问控制不当 |
| ASI09 | Insufficient Logging and Monitoring | 日志和监控不充分 |
| ASI10 | Insecure Interoperability | 跨系统/跨协议交互的安全缺陷 |

## D.1 设计阶段安全审查

### D.1.1 威胁建模

- [ ] 已识别所有数据流和信任边界
- [ ] 已列举 OWASP ASI01–ASI10 中适用的威胁
- [ ] 已为每个威胁制定缓解措施
- [ ] 已定义安全等级和对应策略

### D.1.2 架构安全

- [ ] Agent 系统 prompt 与用户输入严格隔离 — `ASI02`
- [ ] 工具调用实现了最小权限原则 — `ASI01`
- [ ] 敏感操作需要人工审批 (HITL) — `ASI01` `ASI06`
- [ ] 沙箱环境隔离了代码执行 — `ASI01` `ASI06`
- [ ] 超时和资源限制已配置 — `ASI06`
- [ ] Agent 不可自行提升权限或绕过审批流程 — `ASI06`

## D.2 开发阶段安全检查

### D.2.1 Prompt Injection 防护 — `ASI02`

- [ ] 输入清洗层 (InputSanitizer) 已实现
- [ ] 系统 prompt 包含注入防御指令
- [ ] 输出验证器检查未授权指令执行
- [ ] 间接注入（来自工具返回）已防护
- [ ] 已进行红队测试验证防护效果

### D.2.2 数据与知识安全 — `ASI04` `ASI05`

- [ ] 传输层加密 (TLS 1.3)
- [ ] 静态数据加密
- [ ] PII 数据自动检测和脱敏
- [ ] API Key 和凭据使用密钥管理服务
- [ ] 日志中不包含敏感信息
- [ ] 知识库数据来源经过可信验证 — `ASI04`
- [ ] RAG 检索结果包含来源溯源和可信度评分 — `ASI04`
- [ ] Agent 记忆存储具备完整性校验机制 — `ASI05`
- [ ] 记忆注入攻击已纳入测试场景 — `ASI05`

### D.2.3 工具与供应链安全 — `ASI03` `ASI10`

- [ ] 工具参数严格验证（类型、范围、格式）
- [ ] 文件操作限制在允许的路径内
- [ ] HTTP 请求白名单限制域名
- [ ] 数据库查询仅允许只读操作（分析场景）
- [ ] 工具调用频率限制已配置
- [ ] 第三方 MCP Server / 插件来源经过安全审计 — `ASI03`
- [ ] 依赖的 LLM 模型版本已固定并验证 — `ASI03`
- [ ] 跨协议（MCP/A2A/ANP）通信的认证和数据校验已实现 — `ASI10`

### D.2.4 身份与访问管理 — `ASI08`

- [ ] Agent 身份标识唯一，且与操作日志绑定
- [ ] 工具调用基于角色的访问控制 (RBAC) 已配置
- [ ] Agent-to-Agent 通信需双向身份验证
- [ ] 用户会话与 Agent 会话隔离，防止跨会话信息泄露

## D.3 部署阶段安全检查

### D.3.1 基础设施

- [ ] 容器运行在非 root 用户下
- [ ] 网络策略限制了出入站流量
- [ ] 密钥管理使用 Vault 或云 KMS
- [ ] 健康检查和存活探针已配置
- [ ] 自动扩缩容策略防止资源耗尽 — `ASI06`

### D.3.2 监控与告警 — `ASI09`

- [ ] 异常行为检测规则已配置
- [ ] Prompt injection 尝试的告警
- [ ] API 用量异常的告警
- [ ] 敏感操作审计日志开启
- [ ] 事故响应流程已制定并演练
- [ ] Agent 决策链（工具调用序列、推理过程）完整记录
- [ ] 日志保留策略满足合规要求

### D.3.3 行为对齐验证 — `ASI07`

- [ ] Agent 输出经过安全过滤层（拒绝有害内容生成）
- [ ] 关键决策路径有置信度阈值检查
- [ ] Agent 偏离预期行为模式时自动触发告警

## D.4 运营阶段安全检查

### D.4.1 持续安全

- [ ] 定期红队测试（至少每季度一次）
- [ ] 依赖库漏洞扫描自动化 — `ASI03`
- [ ] LLM 模型更新后回归测试 — `ASI07`
- [ ] 安全事件复盘和修复流程
- [ ] 用户反馈的安全问题响应 SLA

### D.4.2 应急预案

| 场景 | 应急措施 | 恢复时间 | 相关风险 |
|------|---------|---------|---------|
| Prompt 注入攻击 | 阻断恶意会话 + 规则更新 | < 1h | ASI02 |
| 数据泄露 | 密钥轮转 + 影响评估 | < 4h | ASI08 |
| 模型幻觉导致错误操作 | 回滚操作 + 人工接管 | < 30min | ASI07 |
| DDoS/API 滥用 | 限流 + IP 封禁 | < 15min | ASI06 |
| 第三方服务故障 | 降级到本地模型/缓存 | < 5min | ASI03 |
| 知识库投毒 | 隔离污染数据 + 回滚索引 | < 2h | ASI04 |
| Agent 记忆篡改 | 冻结记忆写入 + 完整性校验 | < 1h | ASI05 |

## D.5 安全评分卡

```
总分 = Σ(已检查项 / 总检查项) × 100

90-100: 优秀 ✅ - 可上线
75-89:  良好 ⚠️ - 修复高风险项后上线
60-74:  及格 🟡 - 需要重点改进
<60:    不合格 ❌ - 需要重新设计安全架构
```

## D.6 参考资料

- [[OWASP Agentic AI Top 10]](https://owasp.org/www-project-agentic-ai-top-10/) — ASI01 至 ASI10 风险分类的权威来源
- [[OWASP Top 10 for LLM Applications]](https://owasp.org/www-project-top-10-for-large-language-model-applications/) — LLM 应用安全补充参考
