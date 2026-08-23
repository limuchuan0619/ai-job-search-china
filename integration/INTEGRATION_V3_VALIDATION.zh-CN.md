# AI Career Agent V3 验收记录

验收日期：2026-08-23

## 结论

统一系统已升级到 career-ops 1.28.0，并保留 ai-job-search-private 的中国岗位搜索、JD 分析、匹配、简历优化能力。发现结果与投递流程之间新增明确的人工审核门：

```text
Provider / WebSearch → Lead(new) → shortlisted / dismissed → promote
→ Pipeline → JD/简历/申请材料 → applications → 面试/跟进/结果/复盘
```

`data/job-leads.jsonl` 只负责投递前线索与审核状态，`data/applications.md` 仍是申请生命周期的唯一事实源。

## 自动化验证

- career-ops 1.28.0 全量回归：4896 passed，0 failed，5 warnings。
- 整合层路由、Schema、审核、提升、模板和安全边界：24 passed，0 failed。
- 两个本地 Skill：官方 `quick_validate.py` 验证通过。
- `portals.yml`：0 errors，0 warnings。
- 启动器：SmokeTest 通过。
- 上游路径覆盖保护：通过；`.agents/` 入口由 integration 模板重建，不与上游目录保护冲突。

5 个全量警告来自空白用户资料、可选 Go 编译器或上游负向测试夹具，不是失败。测试环境必须把 `I:\Git\bin` 放在 PATH 前部，否则 Windows 的 WSL 占位 `bash.exe` 会制造 12 个批处理假失败。

## 真实来源与写入边界验证

腾讯官方 Provider、最近 1 天窗口：

- 抓取 1267 条岗位。
- 标题过滤 594 条、职级过滤 5 条、地点过滤 21 条、年龄过滤 93 条、发布日期过滤 553 条。
- 最终保留 1 条。
- dry-run 前后 `pipeline.md`、`job-leads.jsonl`、`scan-history.tsv` 哈希不变。
- 非 dry-run 时该岗位以 `discovery_channel=provider`、`review_state=new` 进入 Lead。
- 非 dry-run 前后真实 `pipeline.md` 和 `applications.md` 哈希不变。

## 当前非阻断项

- 尚未提供真实 `cv.md`，因此没有把真实个人事实用于 JD 匹配或简历端到端验收。
- 快速菜单的 Provider 通道目前明确限定 3 家：腾讯、美团、阿里巴巴；完整多来源搜索通过 Codex 提示执行 Provider + 公开 WebSearch。
- Gmail、Notion 等外部连接仍需用户单独授权。
- Go Web 看板属于可选上游组件；当前已提供无需 Go 的本地静态看板。

## 发布边界

- 旧项目 `H:\codex\ai-job-search` 不修改。
- 不向 `santifer/career-ops` 推送。
- GitHub 仅发布系统层、整合代码、模板和测试；CV、画像、Lead、投递记录、报告、浏览器与包缓存均不发布。
