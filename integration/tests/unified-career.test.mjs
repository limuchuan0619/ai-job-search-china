import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { ROOT, ROUTES, buildPrompt, resolveScriptArgs } from "../unified-career.mjs";
import {
  UNKNOWN,
  formatPromotedLead,
  mergeLeads,
  normalizeLead,
  parsePipelineText,
  promoteLead,
  readLeads,
  serializeLeads,
  setReviewState,
  upsertLeads,
} from "../china-leads.mjs";
import { newHistoryLines, newPipelineLeads, presentScanOutput } from "../search-local.mjs";
import { DEFAULTS, POINTERS } from "../install-pointers.mjs";
import { looksLikeBundledMock } from "../reply-watch-safe.mjs";
import { dashboardStats, parseApplications, renderDashboard } from "../html-report.mjs";

test("preserved old commands and the unified lifecycle all have routes", () => {
  for (const name of [
    "setup", "intake", "expand", "search", "search-local", "lead", "jd", "rank",
    "pipeline", "resume", "apply", "track", "interview", "reply-watch", "followup",
    "outcome", "review", "upskill", "notion", "gmail-leads", "dashboard", "add-portal",
  ]) assert.ok(ROUTES[name], `missing route ${name}`);
});

test("direct routes resolve only to existing fixed scripts", () => {
  for (const route of Object.values(ROUTES).filter((value) => value.kind === "script")) {
    assert.match(route.file, /^(?:integration\/)?[a-z0-9-]+\.mjs$/i);
    assert.ok(existsSync(resolve(ROOT, route.file)), `missing ${route.file}`);
  }
});

test("route semantics distinguish search, ranking, JD evaluation and full pipeline", () => {
  assert.equal(ROUTES.search.kind, "agent");
  assert.equal(ROUTES.search.mode, "scan");
  assert.equal(ROUTES["search-local"].file, "integration/search-local.mjs");
  assert.equal(ROUTES.rank.file, "rank-pipeline.mjs");
  assert.equal(ROUTES.jd.mode, "oferta");
  assert.equal(ROUTES.pipeline.mode, "pipeline");
});

test("track defaults to a bounded query and preserves explicit subcommands", () => {
  assert.deepEqual(resolveScriptArgs(ROUTES.track, []), ["query", "--limit", "20"]);
  assert.deepEqual(resolveScriptArgs(ROUTES.track, ["--status", "Applied"]), [
    "query", "--limit", "20", "--status", "Applied",
  ]);
  assert.deepEqual(resolveScriptArgs(ROUTES.track, ["sync", "--check"]), [
    "sync", "--check",
  ]);
});

test("fixed script prefixes cannot be displaced by user arguments", () => {
  assert.deepEqual(resolveScriptArgs(ROUTES.notion, ["export", "--dry-run"]), [
    "run", "notion", "export", "--dry-run",
  ]);
  assert.deepEqual(resolveScriptArgs(ROUTES.templates, []), ["list", "cv"]);
});

test("lead defaults to a bounded list and preserves explicit subcommands", () => {
  assert.deepEqual(resolveScriptArgs(ROUTES.lead, []), ["list", "--limit", "20"]);
  assert.deepEqual(resolveScriptArgs(ROUTES.lead, ["stats", "--json"]), ["stats", "--json"]);
  assert.ok(ROUTES.lead.subcommands.includes("review"));
  assert.ok(ROUTES.lead.subcommands.includes("promote"));
});

test("agent prompts carry compatibility and safety boundaries", () => {
  const jd = buildPrompt("jd", ["https://example.com/jobs/123"]);
  assert.match(jd, /canonical mode: oferta/);
  assert.match(jd, /COMPATIBILITY_CONTRACT/);
  assert.match(jd, /人工提交门禁/);
  assert.match(jd, /https:\/\/example\.com\/jobs\/123/);

  const search = buildPrompt("search", []);
  assert.match(search, /canonical mode: scan/);
  assert.match(search, /Provider/);
  assert.match(search, /WebSearch/);
  assert.match(search, /Lead Schema/);
});

test("json routing output is stable", () => {
  const runner = resolve(ROOT, "integration", "unified-career.mjs");
  const result = spawnSync(process.execPath, [runner, "--json", "resume", "42"], {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.command, "resume");
  assert.equal(parsed.mode, "pdf");
  assert.match(parsed.prompt, /输入：42/);
});

test("China Lead normalization makes every missing field explicit", () => {
  const lead = normalizeLead({
    canonical_url: "https://jobs.example.cn/123?utm_source=test#apply",
    company: "示例公司",
    title: "市场实习生",
    source_tier: "A",
    evidence_status: "verified",
    source_confidence: "high",
  }, { now: "2026-08-20T10:00:00.000Z" });
  assert.equal(lead.canonical_url, "https://jobs.example.cn/123");
  assert.equal(lead.arrival_date, UNKNOWN);
  assert.equal(lead.days_per_week, UNKNOWN);
  assert.equal(lead.graduation_cohort, UNKNOWN);
  assert.equal(lead.salary_daily_cny, UNKNOWN);
  assert.equal(lead.conversion_opportunity, UNKNOWN);
  assert.equal(lead.preference_gate, "UNKNOWN");
  assert.equal(lead.language_gate, "UNKNOWN");
  assert.equal(lead.discovery_channel, UNKNOWN);
  assert.equal(lead.review_state, "new");
  assert.equal(lead.source_urls.length, 1);
  assert.equal(lead.lead_key.length, 20);
});

test("Lead merge fills unknowns but preserves and records material conflicts", () => {
  const base = normalizeLead({
    canonical_url: "https://jobs.example.cn/123",
    company: "示例公司",
    title: "市场实习生",
    city: "上海",
    source_tier: "B",
    evidence_status: "snippet_only",
    source_confidence: "low",
  }, { now: "2026-08-20T10:00:00.000Z" });
  const incoming = normalizeLead({
    canonical_url: "https://jobs.example.cn/123",
    company: "示例公司",
    title: "市场实习生",
    city: "北京",
    days_per_week: "4",
    source_tier: "A",
    evidence_status: "verified",
    source_confidence: "high",
  }, { now: "2026-08-21T10:00:00.000Z" });
  const merged = mergeLeads(base, incoming, { now: "2026-08-21T10:00:00.000Z" });
  assert.equal(merged.city, "上海");
  assert.equal(merged.days_per_week, "4");
  assert.equal(merged.source_tier, "A");
  assert.equal(merged.evidence_status, "verified");
  assert.equal(merged.source_confidence, "high");
  assert.equal(merged.manual_review_required, true);
  assert.ok(merged.field_conflicts.some((item) => item.field === "city"));
  assert.doesNotThrow(() => serializeLeads([merged]));
});

test("Provider pipeline rows become basic structured Leads without invented China fields", () => {
  const content = [
    "## Pending",
    "- [ ] https://jobs.example.cn/123 | 示例公司 | 市场实习生 | 上海 | 200 CNY/day | posted: 2026-08-19 | trust: 80 missing_apply_url",
  ].join("\n");
  const [lead] = parsePipelineText(content, { now: "2026-08-20T10:00:00.000Z" });
  assert.equal(lead.company, "示例公司");
  assert.equal(lead.city, "上海");
  assert.equal(lead.compensation_text, "200 CNY/day");
  assert.equal(lead.posted_at, "2026-08-19");
  assert.equal(lead.source_confidence, "medium");
  assert.equal(lead.discovery_channel, "provider");
  assert.equal(lead.days_per_week, UNKNOWN);
});

test("search-local synchronizes only newly appended Pipeline rows", () => {
  const oldLine = "- [ ] https://jobs.example.cn/1 | A | Intern";
  const newLine = "- [ ] https://jobs.example.cn/2 | B | Graduate";
  const diff = newPipelineLeads(oldLine, `${oldLine}\n${newLine}\n`);
  assert.equal(diff.length, 1);
  assert.equal(diff[0].company, "B");
});

test("search-local presentation identifies previews and history deltas without claiming Pipeline writes", () => {
  const preview = presentScanOutput("New offers added: 2\nNew offers:\n→ Run /career-ops pipeline to evaluate new offers.\n", { dryRun: true });
  assert.match(preview, /Would add \(dry-run\): 2/);
  assert.match(preview, /Candidate Leads \(dry-run\):/);
  assert.doesNotMatch(preview, /New offers added/);
  assert.doesNotMatch(preview, /Run \/career-ops pipeline/);
  assert.match(preview, /only promoted Leads enter Pipeline/);
  assert.deepEqual(newHistoryLines("header\nold", "header\nold\nnew"), ["new"]);
});

test("Lead review and promotion are explicit, idempotent and isolated from application state", async () => {
  const temp = mkdtempSync(resolve(ROOT, "data", ".integration-lead-test-"));
  const leadsPath = resolve(temp, "job-leads.jsonl");
  const pipelinePath = resolve(temp, "pipeline.md");
  try {
    await upsertLeads([{
      canonical_url: "https://jobs.example.cn/review-1",
      company: "示例 / 公司",
      title: "市场实习生",
      city: "上海",
      posted_at: "2026-08-20",
      discovery_channel: "websearch",
    }], { path: leadsPath });
    const [created] = readLeads(leadsPath);
    assert.equal(created.review_state, "new");

    await setReviewState(created.lead_key, "shortlisted", {
      path: leadsPath,
      reason: "方向匹配",
      now: "2026-08-21T10:00:00.000Z",
    });
    assert.equal(readLeads(leadsPath)[0].review_state, "shortlisted");

    const first = await promoteLead(created.lead_key, {
      path: leadsPath,
      pipelinePath,
      reason: "人工确认",
      now: "2026-08-22T10:00:00.000Z",
    });
    const second = await promoteLead(created.lead_key, { path: leadsPath, pipelinePath });
    assert.equal(first.already_present, false);
    assert.equal(second.already_present, true);
    assert.equal(readLeads(leadsPath)[0].review_state, "promoted");
    assert.equal(parsePipelineText(readFileSync(pipelinePath, "utf8")).length, 1);
    assert.match(formatPromotedLead(readLeads(leadsPath)[0]), /^\- \[ \] https:/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("reply watcher rejects the exact bundled demonstration mailbox dataset", () => {
  const mock = [
    { message_id: "msg1", from: "recruiter@wingyun.com" },
    { message_id: "msg2", from: "hr@examplelabs.com" },
    { message_id: "msg3", subject: "Zhaopin job alert" },
    { message_id: "msg4" },
  ];
  assert.equal(looksLikeBundledMock(mock), true);
  assert.equal(looksLikeBundledMock([{ message_id: "real-1", subject: "Interview" }]), false);
});

test("static dashboard escapes tracker content and reports funnel counts", () => {
  const tracker = [
    "| # | Date | Company | Role | Score | Status | PDF | Report | Notes |",
    "|---|---|---|---|---|---|---|---|---|",
    "| 1 | 2026-08-20 | <script>alert(1)</script> | 实习生 | 4.2/5 | Interview | ✅ | [1](reports/001.md) | ok |",
    "| 2 | 2026-08-20 | 示例 | 运营 | 3.8/5 | Applied | ❌ | — | waiting |",
  ].join("\n");
  const rows = parseApplications(tracker);
  const stats = dashboardStats(rows);
  assert.equal(rows.length, 2);
  assert.equal(stats.interviews, 1);
  assert.equal(stats.progressed, 2);
  const html = renderDashboard(rows, { generatedAt: "2026-08-20" });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /求职进展看板/);
});

test("China source strategy stays broad, executable and access-safe", () => {
  const source = readFileSync(resolve(ROOT, "integration", "skills", "china-job-search", "SKILL.md"), "utf8");
  for (const marker of [
    "kind: job-source", "market: CN", "Tier A", "Tier B", "Tier C",
    "job.mohrss.gov.cn", "ncss.cn", "实习僧", "牛客", "CAPTCHA",
    "商务", "技术", "体育", "金融", "新能源", "search-local.mjs",
    "china-leads.mjs upsert", "Provider lane", "Discovery lane",
  ]) assert.ok(source.includes(marker), `missing ${marker}`);
  assert.doesNotMatch(source, /focus_preset:\s*sports_business_v1/);
});

test("broad starter search filters explicit senior scope without narrowing industries", () => {
  const portals = readFileSync(resolve(ROOT, "portals.yml"), "utf8");
  assert.match(portals, /location_filter:[\s\S]*always_allow:[\s\S]*- \"中国\"/);
  for (const positive of ["商务", "市场", "运营", "产品", "数据", "算法", "软件", "AI"]) {
    assert.ok(portals.includes(`- \"${positive}\"`), `missing broad role ${positive}`);
  }
  for (const senior of ["高级", "资深", "专家", "负责人", "Leader", "Senior", "Principal"]) {
    assert.ok(portals.includes(`- \"${senior}\"`), `missing seniority guard ${senior}`);
  }
  assert.match(portals, /skip_tiers:\s*\n\s*- senior/);
  assert.match(portals, /title_filter_full:[\s\S]*- "internship"[\s\S]*- "entry-level"/);
});

test("compatibility contract freezes old command mappings and gates", () => {
  const contract = readFileSync(resolve(ROOT, "integration", "COMPATIBILITY_CONTRACT.zh-CN.md"), "utf8");
  for (const marker of [
    "data/job-leads.jsonl", "data/applications.md", "Language", "China preference",
    "arrival_date", "days_per_week", "graduation_cohort", "conversion_opportunity",
    "rank-pipeline.mjs", "reply-watch", "dashboard", "lead review", "lead promote",
  ]) assert.ok(contract.includes(marker), `missing ${marker}`);
});

test("user layer is local, Chinese-first, and contains no example identity", () => {
  const profile = readFileSync(resolve(ROOT, "config", "profile.yml"), "utf8");
  const custom = readFileSync(resolve(ROOT, "modes", "_custom.md"), "utf8");
  const gitignore = readFileSync(resolve(ROOT, ".gitignore"), "utf8");
  assert.match(profile, /output:\s*zh-CN/);
  assert.match(profile, /modes_dir:\s*modes\/zh/);
  assert.doesNotMatch(profile, /Jane Smith|jane@example\.com|janesmith/);
  assert.match(custom, /宽行业、宽岗位/);
  assert.match(custom, /JD 兼容门禁/);
  for (const marker of ["config/profile.yml", "portals.yml", "modes/_profile.md", "modes/_custom.md"]) {
    assert.ok(gitignore.includes(marker), `not ignored: ${marker}`);
  }
});

test("local extensions are protected from upstream updates", () => {
  const localPaths = readFileSync(resolve(ROOT, "config", "local-paths.txt"), "utf8");
  for (const marker of [
    "integration/", "Start-AI-Career-Agent.cmd", "Start-AI-Career-Agent.ps1",
    "config/local-gitignore", ".playwright-browsers/", ".npm-cache/",
  ]) {
    assert.ok(localPaths.includes(marker), `not protected: ${marker}`);
  }
});

test("bootstrap assets are tracked templates while user-layer targets remain customizable", () => {
  assert.equal(POINTERS.length, 2);
  assert.equal(DEFAULTS.length, 3);
  for (const item of [...POINTERS, ...DEFAULTS]) assert.ok(existsSync(item.source), `missing ${item.source}`);
  const customTemplate = readFileSync(resolve(ROOT, "integration", "templates", "modes-custom.zh-CN.md"), "utf8");
  assert.match(customTemplate, /Lead 审核队列/);
  assert.match(customTemplate, /不得绕过 Lead 审核/);
});

test("Codex discovery files remain thin pointers to protected canonical skills", () => {
  for (const name of ["ai-career-agent", "china-job-search"]) {
    const pointer = readFileSync(resolve(ROOT, ".agents", "skills", name, "SKILL.md"), "utf8");
    const template = readFileSync(resolve(ROOT, "integration", "pointers", `${name}.SKILL.md`), "utf8");
    const canonical = `integration/skills/${name}/SKILL.md`;
    assert.equal(pointer, template);
    assert.ok(pointer.includes(`canonical: ${canonical}`));
    assert.ok(existsSync(resolve(ROOT, canonical)));
    assert.ok(pointer.split(/\r?\n/).length <= 15);
  }
});

test("pointer restoration check is clean", () => {
  const installer = resolve(ROOT, "integration", "install-pointers.mjs");
  const result = spawnSync(process.execPath, [installer, "--check", "--quiet"], {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr);
});
