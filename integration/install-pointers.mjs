#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

export const POINTERS = Object.freeze([
  {
    source: resolve(HERE, "pointers", "ai-career-agent.SKILL.md"),
    target: resolve(ROOT, ".agents", "skills", "ai-career-agent", "SKILL.md"),
  },
  {
    source: resolve(HERE, "pointers", "china-job-search.SKILL.md"),
    target: resolve(ROOT, ".agents", "skills", "china-job-search", "SKILL.md"),
  },
]);

// These are user-layer starter files. They are created only when absent and
// are never compared or overwritten after the user customizes them.
export const DEFAULTS = Object.freeze([
  {
    source: resolve(HERE, "templates", "portals.china.yml"),
    target: resolve(ROOT, "portals.yml"),
  },
  {
    source: resolve(HERE, "templates", "modes-custom.zh-CN.md"),
    target: resolve(ROOT, "modes", "_custom.md"),
  },
  {
    source: resolve(HERE, "templates", "local-paths.txt"),
    target: resolve(ROOT, "config", "local-paths.txt"),
  },
]);

export function syncPointers({ check = false, quiet = false } = {}) {
  const changed = [];
  const problems = [];

  for (const { source, target } of POINTERS) {
    if (!existsSync(source)) {
      problems.push(`missing pointer template: ${source}`);
      continue;
    }
    const expected = readFileSync(source, "utf8");
    const actual = existsSync(target) ? readFileSync(target, "utf8") : null;
    if (actual === expected) continue;
    if (check) {
      problems.push(`pointer differs or is missing: ${target}`);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, expected, "utf8");
    changed.push(target);
  }

  for (const { source, target } of DEFAULTS) {
    if (!existsSync(source)) {
      problems.push(`missing starter template: ${source}`);
      continue;
    }
    if (existsSync(target)) continue;
    if (check) {
      problems.push(`local starter is missing: ${target}`);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(source, "utf8"), "utf8");
    changed.push(target);
  }

  if (!quiet) {
    for (const item of changed) console.log(`restored: ${item}`);
    for (const item of problems) console.error(item);
    if (!changed.length && !problems.length) console.log("AI Career Agent pointers are current.");
  }
  return problems.length ? 1 : 0;
}

function main(argv = process.argv.slice(2)) {
  const known = new Set(["--check", "--quiet"]);
  const unknown = argv.filter((item) => !known.has(item));
  if (unknown.length) {
    console.error(`unknown option: ${unknown[0]}`);
    return 2;
  }
  return syncPointers({ check: argv.includes("--check"), quiet: argv.includes("--quiet") });
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) process.exitCode = main();
