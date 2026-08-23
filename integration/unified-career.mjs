#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "..");

export const ROUTES = Object.freeze({
  doctor: { kind: "script", file: "doctor.mjs", description: "检查环境与初始化状态" },
  verify: { kind: "script", file: "verify-pipeline.mjs", description: "检查流水线一致性" },
  search: {
    kind: "agent",
    mode: "scan",
    extra: "执行 Provider 扫描和中国公开来源 WebSearch；所有发现先按中国 Lead Schema 规范化到 data/job-leads.jsonl，等待人工 review / promote；搜索阶段不得写入 Pipeline 或 applications.md。",
    description: "完整中国多来源岗位搜索",
  },
  "search-local": {
    kind: "script",
    file: "integration/search-local.mjs",
    description: "运行精选官网快速扫描，结果只进入 Lead 审核队列",
  },
  lead: {
    kind: "script",
    file: "integration/china-leads.mjs",
    defaultCommand: "list",
    subcommands: ["list", "show", "upsert", "sync-pipeline", "review", "promote", "stats", "validate"],
    defaults: ["--limit", "20"],
    description: "查看或维护中国岗位结构化 Lead",
  },
  bootstrap: {
    kind: "script",
    file: "integration/install-pointers.mjs",
    description: "补齐缺失的本地入口和中国求职配置（不覆盖已有内容）",
  },
  track: {
    kind: "script",
    file: "tracker.mjs",
    defaultCommand: "query",
    subcommands: ["sync", "query", "history", "export", "delete"],
    defaults: ["--limit", "20"],
    description: "查看或同步投递跟踪器",
  },
  status: { kind: "script", file: "set-status.mjs", description: "原子更新投递状态" },
  "followup-check": { kind: "script", file: "followup-cadence.mjs", description: "检查跟进节奏" },
  "outcome-record": { kind: "script", file: "outcome.mjs", description: "记录并归档结果" },
  stats: { kind: "script", file: "stats.mjs", defaults: ["--summary"], description: "查看求职漏斗统计" },
  dedup: { kind: "script", file: "dedup-tracker.mjs", description: "检查重复投递记录" },
  normalize: { kind: "script", file: "normalize-statuses.mjs", description: "规范化状态名称" },
  rank: { kind: "script", file: "rank-pipeline.mjs", description: "低成本批量匹配并标注岗位优先级" },
  "reply-watch": {
    kind: "script",
    file: "integration/reply-watch-safe.mjs",
    description: "人工确认后同步招聘回复状态（不生成模拟邮件）",
  },
  notion: {
    kind: "script",
    file: "plugins.mjs",
    fixedArgs: ["run", "notion"],
    description: "将 Tracker 镜像到 Notion 或导入 Notion 岗位",
  },
  "gmail-leads": {
    kind: "script",
    file: "plugins.mjs",
    fixedArgs: ["run", "gmail"],
    description: "从已授权 Gmail 标签导入岗位线索",
  },
  dashboard: {
    kind: "script",
    file: "integration/html-report.mjs",
    description: "生成本地静态求职看板",
  },
  templates: {
    kind: "script",
    file: "cv-templates.mjs",
    fixedArgs: ["list", "cv"],
    description: "列出可用简历模板",
  },
  setup: { kind: "agent", mode: "intake", description: "从本地材料初始化候选人画像" },
  intake: { kind: "agent", mode: "intake", description: "从本地材料增量更新候选人画像" },
  expand: { kind: "agent", mode: "expand", description: "从已确认材料扩展经历与能力资产" },
  "add-portal": { kind: "agent", mode: "discover", description: "发现并注册公开招聘源" },
  jd: { kind: "agent", mode: "oferta", description: "只做 JD 分析、匹配与风险评估" },
  pipeline: { kind: "agent", mode: "pipeline", description: "处理人工确认后的岗位池并生成报告、材料与跟踪记录" },
  resume: { kind: "agent", mode: "pdf", description: "按 JD 优化简历并生成 PDF" },
  apply: { kind: "agent", mode: "apply", description: "生成申请材料并辅助填写，提交前停止" },
  interview: { kind: "agent", mode: "interview-prep", description: "公司定制面试准备" },
  "interview-plan": { kind: "agent", mode: "interview/plan", description: "生成时间化面试计划" },
  "interview-practice": { kind: "agent", mode: "interview/practice", description: "逐题模拟面试" },
  "interview-review": { kind: "agent", mode: "interview/debrief", description: "面试后复盘" },
  followup: { kind: "agent", mode: "followup", description: "生成待审阅跟进草稿" },
  outcome: { kind: "agent", mode: "outcome", description: "记录结果、归档材料并提炼经验" },
  review: { kind: "agent", mode: "patterns", description: "分析拒绝与漏斗模式" },
  upskill: { kind: "agent", mode: "upskill", description: "汇总技能缺口与学习优先级" },
});

export function buildPrompt(command, payload = []) {
  const route = ROUTES[command];
  if (!route || route.kind !== "agent") throw new Error(`Unknown agent route: ${command}`);
  const detail = payload.join(" ").trim();
  return [
    `在当前项目中运行 ai-career-agent 的 ${command} 模式。`,
    `使用 career-ops canonical mode: ${route.mode}。`,
    "同时遵守 modes/_custom.md、integration/COMPATIBILITY_CONTRACT.zh-CN.md、候选人事实边界和人工提交门禁。",
    ...(route.extra ? [route.extra] : []),
    detail ? `输入：${detail}` : "如缺少完成该模式所需的 JD、岗位编号或面试信息，请只询问必要信息。",
  ].join("\n");
}

function usage() {
  const lines = [
    "AI Career Agent — unified local entrypoint",
    "",
    "用法：node integration/unified-career.mjs <command> [args]",
    "",
    "直接工具：",
  ];
  for (const [name, route] of Object.entries(ROUTES).filter(([, value]) => value.kind === "script")) {
    lines.push(`  ${name.padEnd(17)} ${route.description}`);
  }
  lines.push("", "Agent 工作流（输出可直接交给 Codex 的规范提示）：");
  for (const [name, route] of Object.entries(ROUTES).filter(([, value]) => value.kind === "agent")) {
    lines.push(`  ${name.padEnd(17)} ${route.description}`);
  }
  lines.push("", "选项：", "  --json             输出机器可读的路由结果", "  --run-agent        使用本机 codex exec 执行 Agent 工作流");
  return lines.join("\n");
}

export function resolveScriptArgs(route, args) {
  const requested = [...args];
  if (route.defaultCommand && !route.subcommands?.includes(requested[0])) {
    requested.unshift(route.defaultCommand);
  }
  if (route.defaults?.length && (!route.defaultCommand || requested[0] === route.defaultCommand)) {
    const insertion = route.defaultCommand ? 1 : 0;
    requested.splice(insertion, 0, ...route.defaults);
  }
  return [...(route.fixedArgs ?? []), ...requested];
}

function runScript(route, args) {
  const script = resolve(ROOT, route.file);
  if (!existsSync(script)) {
    console.error(`缺少上游脚本：${script}`);
    return 2;
  }
  const result = spawnSync(process.execPath, [script, ...resolveScriptArgs(route, args)], {
    cwd: ROOT,
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

function runAgent(prompt) {
  const result = spawnSync("codex", ["exec", prompt], {
    cwd: ROOT,
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (result.error) {
    console.error("无法在本机自动启动 codex exec。请把下面提示粘贴到当前 Codex 任务中：\n");
    console.error(prompt);
    return 1;
  }
  return result.status ?? 1;
}

export function main(argv = process.argv.slice(2)) {
  const json = argv.includes("--json");
  const run = argv.includes("--run-agent");
  const filtered = argv.filter((item) => item !== "--json" && item !== "--run-agent");
  const [command = "help", ...args] = filtered;

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(usage());
    return 0;
  }

  const route = ROUTES[command];
  if (!route) {
    console.error(`未知命令：${command}\n`);
    console.error(usage());
    return 2;
  }

  if (route.kind === "script") {
    if (json) {
      console.log(JSON.stringify({ command, ...route, args, resolvedArgs: resolveScriptArgs(route, args) }));
      return 0;
    }
    return runScript(route, args);
  }

  const prompt = buildPrompt(command, args);
  if (json) {
    console.log(JSON.stringify({ command, ...route, prompt }));
    return 0;
  }
  if (run) return runAgent(prompt);
  console.log(prompt);
  return 0;
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) process.exitCode = main();
