#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "..");
export const DEFAULT_CANDIDATES = resolve(ROOT, "data", "reply-candidates.json");

export function looksLikeBundledMock(candidates) {
  if (!Array.isArray(candidates) || candidates.length !== 4) return false;
  const ids = candidates.map((item) => item?.message_id).sort().join(",");
  const text = JSON.stringify(candidates);
  return ids === "msg1,msg2,msg3,msg4"
    && text.includes("wingyun.com")
    && text.includes("examplelabs.com")
    && text.includes("Zhaopin job alert");
}

export function validateCandidates(path) {
  if (!existsSync(path)) {
    throw new Error(
      `没有招聘回复候选文件：${path}\n`
      + "请先运行 node paste-reply.mjs 粘贴真实邮件，或传入一个真实 JSON 文件路径。"
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`招聘回复 JSON 无法解析：${error.message}`);
  }
  if (!Array.isArray(parsed)) throw new Error("招聘回复候选文件必须是 JSON 数组");
  if (looksLikeBundledMock(parsed)) {
    throw new Error("检测到 career-ops 演示邮件数据，已拒绝写入真实 Tracker。请换成真实回复。 ");
  }
  return parsed;
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("Usage: node integration/reply-watch-safe.mjs [real-reply-candidates.json]");
    return 0;
  }
  const positional = argv.filter((item) => !item.startsWith("-"));
  const path = resolve(positional[0] || DEFAULT_CANDIDATES);
  validateCandidates(path);
  const result = spawnSync(process.execPath, [resolve(ROOT, "reply-watch.mjs"), path], {
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

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
