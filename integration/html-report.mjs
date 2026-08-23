#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseTrackerRow, resolveColumns } from "../tracker-parse.mjs";
import { writeFileAtomic } from "../tracker-utils.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "..");
export const DEFAULT_OUTPUT = resolve(ROOT, "output", "application-dashboard.html");

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function parseApplications(content) {
  const lines = content.split(/\r?\n/);
  const colmap = resolveColumns(lines);
  return lines.map((line) => parseTrackerRow(line, colmap)).filter(Boolean);
}

function scoreNumber(score) {
  const match = String(score ?? "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function dashboardStats(rows) {
  const byStatus = {};
  const scores = [];
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    const score = scoreNumber(row.score);
    if (score != null && Number.isFinite(score)) scores.push(score);
  }
  const progressed = rows.filter((row) => !new Set(["Evaluated", "Discarded", "Rejected"]).has(row.status)).length;
  return {
    total: rows.length,
    progressed,
    interviews: rows.filter((row) => /interview/i.test(row.status)).length,
    offers: rows.filter((row) => /offer/i.test(row.status)).length,
    averageScore: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
    byStatus,
  };
}

function safeReportLink(cell) {
  const match = String(cell ?? "").match(/\(([^)]+)\)/);
  if (!match) return "";
  const target = match[1].replaceAll("\\", "/");
  if (target.startsWith("/") || target.includes("..") || /^[a-z]+:/i.test(target)) return "";
  return target;
}

export function renderDashboard(rows, { generatedAt = new Date().toISOString() } = {}) {
  const stats = dashboardStats(rows);
  const maxStatus = Math.max(1, ...Object.values(stats.byStatus));
  const statusRows = Object.entries(stats.byStatus)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => `
      <div class="status-row">
        <span>${escapeHtml(status)}</span>
        <div class="bar"><i style="width:${Math.round(count / maxStatus * 100)}%"></i></div>
        <strong>${count}</strong>
      </div>`).join("");
  const tableRows = rows.map((row) => {
    const report = safeReportLink(row.report);
    const reportCell = report
      ? `<a href="../${escapeHtml(report)}">查看报告</a>`
      : "—";
    return `<tr>
      <td>${escapeHtml(row.num)}</td>
      <td>${escapeHtml(row.date)}</td>
      <td>${escapeHtml(row.company)}</td>
      <td>${escapeHtml(row.role)}</td>
      <td>${escapeHtml(row.score)}</td>
      <td><span class="pill">${escapeHtml(row.status)}</span></td>
      <td>${reportCell}</td>
      <td>${escapeHtml(row.notes)}</td>
    </tr>`;
  }).join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>AI Career Agent 求职看板</title>
  <style>
    :root{color-scheme:light;--ink:#17211b;--muted:#647067;--paper:#f4f1e8;--card:#fffdf7;--line:#d9d3c4;--accent:#176b4b;--accent2:#d8a830}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 system-ui,"Microsoft YaHei",sans-serif}
    main{max-width:1240px;margin:auto;padding:40px 24px 64px}header{display:flex;justify-content:space-between;gap:24px;align-items:end;margin-bottom:26px}
    h1{margin:0;font:700 clamp(30px,5vw,58px)/1.02 Georgia,"Microsoft YaHei",serif;letter-spacing:-.035em}.eyebrow{color:var(--accent);font-weight:700;letter-spacing:.12em;text-transform:uppercase}
    .meta{color:var(--muted);text-align:right}.cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin:20px 0}
    .card,.panel{background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:0 8px 24px #413d3010}.card{padding:18px}.card b{display:block;font:700 30px/1 Georgia,serif;margin-top:8px}.card span{color:var(--muted)}
    .grid{display:grid;grid-template-columns:minmax(280px,.8fr) minmax(0,2.2fr);gap:16px}.panel{padding:20px;overflow:hidden}.panel h2{margin:0 0 16px;font-size:18px}
    .status-row{display:grid;grid-template-columns:110px 1fr 28px;align-items:center;gap:10px;margin:12px 0}.bar{height:8px;background:#e7e2d6;border-radius:99px;overflow:hidden}.bar i{display:block;height:100%;background:var(--accent);border-radius:inherit}
    .table-wrap{overflow:auto;border:1px solid var(--line);border-radius:10px}table{width:100%;border-collapse:collapse;min-width:880px;background:#fff}th,td{padding:11px 12px;border-bottom:1px solid #ebe6da;text-align:left;vertical-align:top}th{position:sticky;top:0;background:#f7f3e9;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em}.pill{display:inline-block;padding:3px 9px;border-radius:99px;background:#e4f1e9;color:#145c41;font-size:12px;font-weight:700}a{color:var(--accent)}.empty{color:var(--muted);padding:28px;text-align:center}
    @media(max-width:900px){header{display:block}.meta{text-align:left;margin-top:12px}.cards{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}}
  </style>
</head>
<body><main>
  <header><div><div class="eyebrow">Local-first career operations</div><h1>求职进展看板</h1></div><div class="meta">生成时间<br>${escapeHtml(generatedAt)}</div></header>
  <section class="cards">
    <div class="card"><span>全部记录</span><b>${stats.total}</b></div>
    <div class="card"><span>已推进</span><b>${stats.progressed}</b></div>
    <div class="card"><span>面试</span><b>${stats.interviews}</b></div>
    <div class="card"><span>Offer</span><b>${stats.offers}</b></div>
    <div class="card"><span>平均匹配</span><b>${stats.averageScore == null ? "—" : stats.averageScore.toFixed(1)}</b></div>
  </section>
  <section class="grid">
    <div class="panel"><h2>状态分布</h2>${statusRows || '<div class="empty">还没有投递记录</div>'}</div>
    <div class="panel"><h2>申请明细</h2><div class="table-wrap"><table>
      <thead><tr><th>#</th><th>日期</th><th>公司</th><th>岗位</th><th>匹配</th><th>状态</th><th>报告</th><th>备注</th></tr></thead>
      <tbody>${tableRows || '<tr><td colspan="8" class="empty">完成画像并分析第一个 JD 后，这里会自动出现记录。</td></tr>'}</tbody>
    </table></div></div>
  </section>
</main></body></html>`;
}

function flagValue(args, name) {
  const equal = args.find((item) => item.startsWith(`${name}=`));
  if (equal) return equal.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export function main(argv = process.argv.slice(2)) {
  const tracker = resolve(flagValue(argv, "--tracker") || resolve(ROOT, "data", "applications.md"));
  const output = resolve(flagValue(argv, "--output") || DEFAULT_OUTPUT);
  const content = existsSync(tracker) ? readFileSync(tracker, "utf8") : "";
  const rows = parseApplications(content);
  mkdirSync(dirname(output), { recursive: true });
  writeFileAtomic(output, renderDashboard(rows));
  const result = { output, applications: rows.length };
  if (argv.includes("--json")) console.log(JSON.stringify(result));
  else console.log(`求职看板已生成：${output}（${rows.length} 条记录）`);
  return 0;
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
