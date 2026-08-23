# AI Career Agent 技术整合方案

## 目标

在不修改 `H:\\codex\\ai-job-search` 的前提下，把两个项目的互补能力放进一个本地优先、可持续更新的系统：

- `ai-job-search-private`：中国岗位发现、JD 结构化分析、候选人匹配、简历与申请材料优化。
- `santifer/career-ops`：投递流水线、状态变更、跟进、面试、结果归档、漏斗统计与复盘。

新项目目录为 `H:\\codex\\ai-career-agent`。核心系统基于 career-ops 1.28.0；中国市场策略和统一路由作为本地扩展层存在，不复制第二套状态库。

## 架构

```text
Codex / Claude Code / 其他 Agent CLI
                 │
                 ▼
 .agents/skills/ai-career-agent/SKILL.md
        统一意图识别与模式路由
                 │
       ┌─────────┴─────────┐
       ▼                   ▼
岗位与材料能力          流程与状态能力
scan / oferta / pdf     tracker / followup
apply / upskill         interview / outcome
       │                   │
       └─────────┬─────────┘
                 ▼
     本地文件事实源（H 盘）
 data/job-leads.jsonl → data/pipeline.md → data/applications.md
 reports/ · jds/
 interview-prep/ · data/outcomes/
```

## 能力映射

| 原 ai-job-search-private 能力 | 统一系统实现 | 唯一规范 |
|---|---|---|
| 岗位搜索与聚合 | `search`（Provider + WebSearch）与 `search-local`（Provider only） | `modes/scan.md` + `integration/skills/china-job-search/SKILL.md` |
| JD 分析 | `jd` 只做 evaluation-only；完整处理使用 `pipeline` | `modes/oferta.md` + `modes/pipeline.md` |
| 匹配与排序 | `rank-pipeline.mjs` 低成本标注；A-G 结构化评分进入完整 Pipeline | `rank-pipeline.mjs` / `modes/oferta.md` |
| 简历优化 | 基于事实门禁的 HTML/PDF/LaTeX 生成 | `modes/pdf.md` / `modes/apply.md` |
| 求职进度表 | 原跟踪能力迁入规范化 tracker | `data/applications.md` |
| 技能差距 | 按已评估岗位汇总缺口 | `modes/upskill.md` |
| 面试准备 | 公司定制准备、练习、复盘 | `modes/interview/*` |
| 结果记录 | 状态账本、结果归档与经验复盘 | `modes/outcome.md` + `outcome.mjs` |

## 数据设计

- `data/applications.md` 是投递状态唯一事实源。
- `data/applications.db` 如生成，仅是可重建索引，不是第二事实源。
- 状态只能通过 `set-status.mjs` 变更，以保留原子写入和 `status-log.tsv` 历史。
- 搜索发现先进入 `data/job-leads.jsonl`；它保存中国岗位结构化元数据和人工审核状态，但不拥有投递状态。
- 只有人工确认并执行 `lead promote` 的线索才进入 `data/pipeline.md`；评估后生成 `reports/`，保存的 JD 进入 `jds/`。
- 面试材料进入 `interview-prep/`，最终结果与附件进入 `data/outcomes/`。
- `cv.md`、`config/profile.yml`、`modes/_profile.md` 才能提供候选人事实；不得从记忆、外部仓库或 JD 推断个人经历。

## 中国市场策略

- 默认宽行业、宽岗位，不以体育、电竞或少数大厂作为唯一范围。
- 公开可访问的企业官网、国家/地方公共就业服务、高校就业中心优先。
- 招聘平台、公众号索引和聚合页只作为线索；保留来源、可信度和人工复核状态。
- 不绕过登录、验证码、App/小程序限制、robots、条款或速率限制。
- 记录城市、到岗时间、每周天数、持续月数、毕业年份、薪资、转正机会、截止时间等中国求职字段；缺失值保持未知。
- 同一岗位的结构化字段通过 `integration/china-leads.mjs` 冲突安全地合并，来源冲突进入 `field_conflicts`，不得静默覆盖。

## 更新与隔离

- career-ops 上游系统文件可通过其更新器升级。
- 本项目规范实现集中在登记到 `config/local-paths.txt` 的 `integration/`；两个 `.agents/skills/` 入口属于上游系统路径，由启动器从 integration 模板幂等重建。
- 个人数据使用上游 `.gitignore` 规则，不进入版本库。
- 不合并两个无关 Git 历史；来源提交写入 `SOURCE_PROVENANCE.md`，便于审计。

## 本次文件变更

新增：

- `integration/INTEGRATION_PLAN.zh-CN.md`
- `integration/SOURCE_PROVENANCE.md`
- `integration/unified-career.mjs`
- `integration/install-pointers.mjs` 与 `integration/pointers/`
- `integration/tests/unified-career.test.mjs`
- `integration/COMPATIBILITY_CONTRACT.zh-CN.md`
- `integration/china-leads.mjs`
- `integration/search-local.mjs`
- `integration/templates/`（可复现但不覆盖用户配置的中国市场初始模板）
- `integration/reply-watch-safe.mjs`
- `integration/html-report.mjs`
- `integration/skills/ai-career-agent/SKILL.md`
- `integration/skills/china-job-search/SKILL.md`
- `.agents/skills/{ai-career-agent,china-job-search}/SKILL.md`（thin pointers）
- `Start-AI-Career-Agent.cmd`
- `Start-AI-Career-Agent.ps1`
- `config/local-paths.txt`
- `config/profile.yml`
- `modes/_profile.md`
- `modes/_custom.md`
- `portals.yml`
- `data/applications.md`
- `data/pipeline.md`

不修改：

- 原 `H:\\codex\\ai-job-search` 工作树。
- career-ops 的评分核心、更新器和状态脚本。
- 用户尚未提供的真实 CV、联系方式和经历事实。

## 审核后第二轮整合

第二轮没有修改 career-ops 上游核心，所有兼容实现仍位于受保护的 `integration/`：

- `search` 不再误等同于 `scan.mjs`；完整搜索会执行 Provider 和中国公开来源 WebSearch。
- 新增 `search-local`，保留快速、零 Token 的官方 Provider 扫描。
- `rank` 改为真正的低成本 `rank-pipeline.mjs`，不再误触发完整 Pipeline。
- `jd` 改为 evaluation-only；只有 `pipeline` 负责报告、PDF 与 Tracker 全流程。
- 旧版 setup、expand、reply-watch、Notion、Gmail leads、html-report 和 add-portal 获得统一入口。
- 新增中国岗位 Lead Schema、冲突记录和未知值规则。
- 通过安全包装器阻止 career-ops 演示邮件数据进入真实 Tracker。
- 用无 Go 依赖的本地静态 HTML 看板补齐旧版 html-report 能力。

## 第三轮：审核队列与 1.28 升级

- 上游核心升级到 career-ops 1.28.0，继承严格 ATS 标题过滤、地点硬阻断和 Windows 写锁修复。
- Provider 扫描改用临时 Pipeline 和临时扫描历史；真实搜索结果直接合并到 Lead，dry-run 完全不写用户数据。
- Lead Schema 升级到 v2，增加 `discovery_channel`、`review_state`、人工判断原因和提升时间。
- 增加 `lead review` / `lead promote`，明确“发现、审核、评估、投递状态”四层边界。
- 启动器明确区分 3 家精选官网快速扫描和完整多来源搜索，错误时保留窗口信息。
