#!/usr/bin/env node

import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { withPipelineLock } from "../pipeline-lock.mjs";
import { writeFileAtomic } from "../tracker-utils.mjs";
import { parsePipelineText, upsertLeads } from "./china-leads.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "..");
export const DATA_DIR = resolve(ROOT, "data");
export const PIPELINE = resolve(DATA_DIR, "pipeline.md");
export const SCAN_HISTORY = resolve(DATA_DIR, "scan-history.tsv");

const PIPELINE_SKELETON = `# Pipeline — Pending URLs

## Pending

## Processed
`;

function fileText(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export function newPipelineLeads(beforeText, afterText) {
  const beforeKeys = new Set(parsePipelineText(beforeText).map((lead) => lead.lead_key));
  return parsePipelineText(afterText).filter((lead) => !beforeKeys.has(lead.lead_key));
}

export function newHistoryLines(beforeText, afterText) {
  const before = new Set(beforeText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  return afterText.split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() && !before.has(line.trim()));
}

export function presentScanOutput(output, { dryRun = false } = {}) {
  let text = String(output ?? "");
  text = text.replace(/New offers added:/gi, dryRun ? "Would add (dry-run):" : "New Leads found:");
  text = text.replace(/New offers:/gi, dryRun ? "Candidate Leads (dry-run):" : "New Leads:");
  text = text.replace(/Results saved to .*? and .*?(?=\r?\n|$)/gi, "Results captured in the Lead review queue.");
  text = text.replace(
    /→ Run \/career-ops pipeline to evaluate new offers\./gi,
    "→ Review candidate Leads first; only promoted Leads enter Pipeline evaluation.",
  );
  text = text.replace(/^→ Share results and get help:.*(?:\r?\n|$)/gim, "");
  return text;
}

async function mergeHistory(path, baseline, scanned) {
  const additions = newHistoryLines(baseline, scanned);
  if (!additions.length) return 0;
  mkdirSync(dirname(path), { recursive: true });
  return withPipelineLock(path, () => {
    const current = fileText(path);
    const currentLines = new Set(current.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
    const pending = additions.filter((line) => !currentLines.has(line.trim()));
    if (!pending.length) return 0;
    const next = `${current.trimEnd()}${current.trim() ? "\n" : ""}${pending.join("\n")}\n`;
    writeFileAtomic(path, next);
    return pending.length;
  });
}

function removeOwnedTemp(path) {
  const absolute = resolve(path);
  const rel = relative(DATA_DIR, absolute);
  const insideData = rel && rel !== ".." && !rel.startsWith(`..${sep}`);
  if (!insideData || !/^\.search-local-[^\\/]+$/i.test(rel) || lstatSync(absolute).isSymbolicLink()) {
    throw new Error(`refusing to remove unexpected search temp: ${absolute}`);
  }
  rmSync(absolute, { recursive: true, force: true });
}

export async function main(argv = process.argv.slice(2)) {
  const dryRun = argv.includes("--dry-run");
  mkdirSync(DATA_DIR, { recursive: true });
  const tempDir = mkdtempSync(resolve(DATA_DIR, ".search-local-"));
  const tempPipeline = resolve(tempDir, "pipeline.md");
  const tempHistory = resolve(tempDir, "scan-history.tsv");
  const historyBefore = fileText(SCAN_HISTORY);
  writeFileSync(tempPipeline, PIPELINE_SKELETON, "utf8");
  if (historyBefore) writeFileSync(tempHistory, historyBefore, "utf8");

  try {
    const result = spawnSync(process.execPath, [resolve(ROOT, "scan.mjs"), ...argv], {
      cwd: ROOT,
      encoding: "utf8",
      shell: false,
      env: {
        ...process.env,
        CAREER_OPS_PIPELINE: tempPipeline,
        CAREER_OPS_SCAN_HISTORY: tempHistory,
      },
      maxBuffer: 16 * 1024 * 1024,
    });
    if (result.stdout) process.stdout.write(presentScanOutput(result.stdout, { dryRun }));
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) {
      console.error(result.error.message);
      return 1;
    }
    if ((result.status ?? 1) !== 0) return result.status ?? 1;
    if (dryRun) {
      console.log("Dry run：只做预览；未写入 Pipeline、Lead 或扫描历史。");
      return 0;
    }

    const fresh = parsePipelineText(fileText(tempPipeline));
    const sync = await upsertLeads(fresh);
    const historyAdded = await mergeHistory(SCAN_HISTORY, historyBefore, fileText(tempHistory));
    console.log(`Lead 审核队列已更新：新增 ${sync.inserted}，更新 ${sync.updated}，共 ${sync.total}；扫描历史新增 ${historyAdded} 行。`);
    console.log("这些岗位尚未进入投递流程。请先运行 lead list / lead review，再用 lead promote 确认进入 Pipeline。");
    return 0;
  } finally {
    removeOwnedTemp(tempDir);
  }
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
