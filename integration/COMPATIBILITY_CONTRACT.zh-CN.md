# ai-job-search-private 兼容契约

本文件定义旧版能力在统一系统中的真实运行语义。它是本地受保护的整合层，不复制 career-ops 的评分、Tracker、PDF、面试或结果归档规则。

## 两类事实源

- `data/job-leads.jsonl`：岗位发现阶段的结构化 Lead 元数据。以 `lead_key` 去重，可由公开来源再次验证和补全。
- `data/applications.md`：岗位被评估、跟踪或投递后的唯一流程状态事实源。

Lead 元数据不能覆盖 Tracker 状态；Tracker 也不能反向制造岗位来源、截止时间或实习资格事实。

## 搜索语义

- `search`：完整 Agent 搜索。执行 `modes/scan.md`、本地 Provider 扫描和中国公开来源 WebSearch，并把可验证结果写入 Lead Schema。
- `search-local`：只执行零 Token Provider 扫描；不调用搜索引擎。扫描使用临时隔离 Pipeline，结果直接写入 Lead 审核队列，不污染真实 Pipeline。
- `lead review`：将线索标记为 `shortlisted` 或 `dismissed`，并记录人工判断原因。
- `lead promote`：唯一允许把已审查 Lead 写入 `data/pipeline.md` 的入口；可安全重试且不重复追加。
- 搜索摘要只是线索，必须标记为 `snippet_only` 和 `manual_review_required`。
- 登录、验证码、App、小程序、robots、条款或限流均不得绕过。

## 中国 Lead Schema

规范文件：`integration/china-leads.mjs`；存储：`data/job-leads.jsonl`。

必须显式保存未知值，不得从岗位标题或公司印象推断：

- URL 与来源：`canonical_url`、`source_urls`、`source_publisher`、`source_tier`、`source_confidence`、`evidence_status`、`application_route`
- 时效：`posted_at`、`deadline`、`date_status`、`first_seen`、`last_verified`
- 中国实习资格：`arrival_date`、`days_per_week`、`internship_duration_months`、`season_eligibility`、`education_level`、`year_of_study`、`graduation_cohort`
- 岗位条件：`city`、`workplace_detail`、`work_mode`、`salary_daily_cny`、`salary_monthly_cny`、`compensation_text`、`conversion_opportunity`
- 分类：`job_cycle`、`role_family`、`industry`、`company_size_stage`
- 门禁：`preference_gate`、`language_gate`、`manual_review_required`

同一字段出现冲突时保留已有值，并把冲突写入 `field_conflicts`；不得静默覆盖。

## JD 门禁

新版继续使用 career-ops A–G、5 分制和 Machine Summary，不恢复第二套 0–100 总分。每次 JD 分析必须在评分前单独输出：

| Gate | PASS | FLAG | FAIL |
|---|---|---|---|
| Work authorization | 已有工作权或明确支持 | JD 未说明 | 明确不支持且候选人需要 |
| Language | 达到明确要求 | 声明水平可能低于要求 | 要求一种画像完全未列出的语言 |
| China preference | 明确满足到岗、天数、周期、城市、毕业年份等硬条件 | 信息缺失或表述模糊 | 与候选人已声明的硬条件明确冲突 |

`FAIL` 是硬门禁，不能被高匹配分抵消；`FLAG` 交给用户判断。不得把缺失信息当作 PASS。

## 排序语义

- `rank` 使用 `rank-pipeline.mjs` 做低成本批量相关性标注，不生成 PDF、不提交申请、不隐藏岗位。
- `pipeline` 才执行完整评估、报告、可选 PDF 和 Tracker 写入。
- 已知 `date_status=expired|closed` 或 Gate=`FAIL` 的岗位必须在完整 Pipeline 前明确提示，不得用总分掩盖。

## 旧命令映射

| 旧能力 | 新入口 |
|---|---|
| setup | `setup` / `intake` |
| scrape | `search` / `search-local` |
| rank | `rank` |
| apply | `apply` |
| interview | `interview` / `interview-plan` / `interview-practice` / `interview-review` |
| outcome | `outcome` |
| upskill | `upskill` |
| expand | `expand` |
| gmail-sync | `reply-watch`（状态）或 `gmail-leads`（岗位线索） |
| notion-sync | `notion` |
| html-report | `dashboard` |
| add-portal | `add-portal` |

## 人工门禁

- 不自动发送邮件、消息或申请。
- 不自动接受 Offer。
- Gmail、Notion 等外部连接必须由用户单独配置和授权。
- `reply-watch` 只能读取真实用户提供的回复候选文件；演示邮件数据不得进入 Tracker。
