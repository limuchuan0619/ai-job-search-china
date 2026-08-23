#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { withPipelineLock } from "../pipeline-lock.mjs";
import { writeFileAtomic } from "../tracker-utils.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "..");
export const DEFAULT_LEADS_PATH = process.env.AI_CAREER_LEADS_PATH
  ? resolve(process.env.AI_CAREER_LEADS_PATH)
  : resolve(ROOT, "data", "job-leads.jsonl");

export const UNKNOWN = "unknown";
export const SCHEMA_VERSION = 2;
export const DEFAULT_PIPELINE_PATH = resolve(ROOT, "data", "pipeline.md");

const PIPELINE_SKELETON = `# Pipeline — Pending URLs

Paste job URLs below as \`- [ ] {url}\` then run \`/career-ops pipeline\`.

## Pending

## Processed
`;

const ENUMS = Object.freeze({
  source_tier: new Set(["A", "B", "C", UNKNOWN]),
  source_confidence: new Set(["high", "medium", "low", UNKNOWN]),
  evidence_status: new Set(["verified", "public_detail", "snippet_only", "manual_review", UNKNOWN]),
  date_status: new Set(["fresh", "active_deadline", UNKNOWN, "stale", "expired", "closed"]),
  conversion_opportunity: new Set(["yes", "no", "possible", UNKNOWN]),
  preference_gate: new Set(["PASS", "FAIL", "FLAG", "UNKNOWN"]),
  language_gate: new Set(["PASS", "FAIL", "FLAG", "UNKNOWN"]),
  discovery_channel: new Set(["provider", "websearch", "ats", "manual", UNKNOWN]),
  review_state: new Set(["new", "shortlisted", "dismissed", "promoted"]),
});

const ARRAY_FIELDS = new Set(["source_urls", "season_eligibility", "benefits"]);
const VOLATILE_FIELDS = new Set([
  "last_verified",
  "date_status",
  "preference_gate",
  "language_gate",
  "manual_review_required",
]);

function text(value, fallback = UNKNOWN) {
  if (value == null) return fallback;
  const out = String(value).trim();
  return out || fallback;
}

function list(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))];
}

function enumValue(field, value) {
  const fallback = field.endsWith("_gate") ? "UNKNOWN" : UNKNOWN;
  const normalized = text(value, fallback);
  if (!ENUMS[field].has(normalized)) {
    throw new Error(`${field} must be one of: ${[...ENUMS[field]].join(", ")}`);
  }
  return normalized;
}

function isoDate(value, fallback) {
  const raw = text(value, fallback);
  if (raw === UNKNOWN) return raw;
  const match = raw.match(/^\d{4}-\d{2}-\d{2}$/);
  if (!match || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) return raw;
  return raw;
}

export function normalizeUrl(value) {
  const raw = text(value, "");
  if (!raw) return "";
  let url;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) return "";
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|ref$|src$|source$|gh_src$)/i.test(key)) url.searchParams.delete(key);
  }
  return url.toString().replace(/\/$/, "");
}

export function leadKey(input) {
  const canonical = normalizeUrl(input.canonical_url)
    || list(input.source_urls).map(normalizeUrl).find(Boolean)
    || "";
  const material = canonical || [text(input.company), text(input.title), text(input.source_publisher)].join("::");
  return createHash("sha256").update(material.toLowerCase()).digest("hex").slice(0, 20);
}

export function normalizeLead(input, { now = new Date().toISOString() } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("lead must be a JSON object");
  }
  const canonical = normalizeUrl(input.canonical_url)
    || list(input.source_urls).map(normalizeUrl).find(Boolean)
    || "";
  const sourceUrls = list([canonical, ...list(input.source_urls)])
    .map(normalizeUrl)
    .filter(Boolean);
  const priority = input.search_priority == null || input.search_priority === ""
    ? null
    : Math.max(0, Math.min(100, Number(input.search_priority)));
  if (priority != null && !Number.isFinite(priority)) throw new Error("search_priority must be numeric or null");

  const lead = {
    schema_version: SCHEMA_VERSION,
    lead_key: "",
    canonical_url: canonical || UNKNOWN,
    source_urls: sourceUrls,
    title: text(input.title),
    company: text(input.company),
    description: text(input.description),
    city: text(input.city ?? input.location),
    workplace_detail: text(input.workplace_detail),
    arrival_date: isoDate(input.arrival_date, UNKNOWN),
    days_per_week: text(input.days_per_week),
    internship_duration_months: text(input.internship_duration_months),
    season_eligibility: list(input.season_eligibility),
    work_mode: text(input.work_mode),
    education_level: text(input.education_level),
    year_of_study: text(input.year_of_study),
    graduation_cohort: text(input.graduation_cohort),
    deadline: isoDate(input.deadline, UNKNOWN),
    posted_at: isoDate(input.posted_at, UNKNOWN),
    salary_daily_cny: text(input.salary_daily_cny),
    salary_monthly_cny: text(input.salary_monthly_cny),
    compensation_text: text(input.compensation_text),
    benefits: list(input.benefits),
    conversion_opportunity: enumValue("conversion_opportunity", input.conversion_opportunity),
    job_cycle: text(input.job_cycle),
    role_family: text(input.role_family),
    industry: text(input.industry),
    company_size_stage: text(input.company_size_stage),
    source_publisher: text(input.source_publisher),
    source_tier: enumValue("source_tier", input.source_tier),
    evidence_status: enumValue("evidence_status", input.evidence_status),
    application_route: text(input.application_route ?? canonical),
    source_confidence: enumValue("source_confidence", input.source_confidence),
    discovery_channel: enumValue("discovery_channel", input.discovery_channel),
    date_status: enumValue("date_status", input.date_status),
    search_priority: priority,
    preference_gate: enumValue("preference_gate", input.preference_gate),
    language_gate: enumValue("language_gate", input.language_gate),
    manual_review_required: Boolean(input.manual_review_required),
    review_state: enumValue("review_state", input.review_state ?? "new"),
    decision_reason: text(input.decision_reason, ""),
    reviewed_at: text(input.reviewed_at, ""),
    promoted_at: text(input.promoted_at, ""),
    first_seen: text(input.first_seen, now),
    last_verified: text(input.last_verified, now),
    notes: text(input.notes, ""),
    field_conflicts: Array.isArray(input.field_conflicts) ? input.field_conflicts : [],
  };
  lead.lead_key = leadKey(lead);
  if (lead.canonical_url === UNKNOWN && lead.title === UNKNOWN && lead.company === UNKNOWN) {
    throw new Error("lead needs a URL or company/title evidence");
  }
  return lead;
}

function isUnknown(value) {
  return value == null || value === "" || value === UNKNOWN || value === "UNKNOWN";
}

function chooseRanked(field, existing, incoming) {
  const ranks = {
    source_tier: { A: 3, B: 2, C: 1, unknown: 0 },
    source_confidence: { high: 3, medium: 2, low: 1, unknown: 0 },
    evidence_status: { verified: 4, public_detail: 3, manual_review: 2, snippet_only: 1, unknown: 0 },
  };
  if (!ranks[field]) return null;
  return (ranks[field][incoming] ?? 0) > (ranks[field][existing] ?? 0) ? incoming : existing;
}

export function mergeLeads(existingInput, incomingInput, { now = new Date().toISOString() } = {}) {
  const existing = normalizeLead(existingInput, { now });
  const incoming = normalizeLead(incomingInput, { now });
  const merged = { ...existing };
  const conflicts = [...(existing.field_conflicts ?? [])];

  for (const [field, incomingValue] of Object.entries(incoming)) {
    if (["schema_version", "lead_key", "field_conflicts"].includes(field)) continue;
    const current = merged[field];
    if (ARRAY_FIELDS.has(field)) {
      merged[field] = [...new Set([...list(current), ...list(incomingValue)])];
      continue;
    }
    if (field === "search_priority") {
      merged[field] = Math.max(current ?? 0, incomingValue ?? 0) || null;
      continue;
    }
    if (field === "first_seen") {
      merged[field] = [current, incomingValue].filter(Boolean).sort()[0];
      continue;
    }
    if (field === "last_verified") {
      merged[field] = [current, incomingValue].filter(Boolean).sort().at(-1);
      continue;
    }
    if (field === "manual_review_required") {
      merged[field] = Boolean(current || incomingValue);
      continue;
    }
    if (["review_state", "decision_reason", "reviewed_at", "promoted_at"].includes(field)) {
      if (Object.prototype.hasOwnProperty.call(incomingInput, field)) merged[field] = incomingValue;
      continue;
    }
    const ranked = chooseRanked(field, current, incomingValue);
    if (ranked != null) {
      merged[field] = ranked;
      continue;
    }
    if (isUnknown(current) && !isUnknown(incomingValue)) {
      merged[field] = incomingValue;
      continue;
    }
    if (VOLATILE_FIELDS.has(field) && !isUnknown(incomingValue)) {
      merged[field] = incomingValue;
      continue;
    }
    if (!isUnknown(current) && !isUnknown(incomingValue) && current !== incomingValue) {
      const conflict = { field, existing: current, incoming: incomingValue, observed_at: now };
      if (!conflicts.some((item) => item.field === field && item.existing === current && item.incoming === incomingValue)) {
        conflicts.push(conflict);
      }
    }
  }
  merged.field_conflicts = conflicts;
  if (conflicts.length) merged.manual_review_required = true;
  merged.lead_key = leadKey(merged);
  return merged;
}

export function parseLeadFile(content) {
  if (!content.trim()) return [];
  return content.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
    try {
      return normalizeLead(JSON.parse(line));
    } catch (error) {
      throw new Error(`invalid lead JSONL line ${index + 1}: ${error.message}`);
    }
  });
}

export function serializeLeads(leads) {
  return [...leads]
    .sort((a, b) => (b.search_priority ?? -1) - (a.search_priority ?? -1)
      || String(a.company).localeCompare(String(b.company), "zh-CN")
      || String(a.title).localeCompare(String(b.title), "zh-CN"))
    .map((lead) => JSON.stringify(lead))
    .join("\n") + (leads.length ? "\n" : "");
}

export function parsePipelineText(content, { now = new Date().toISOString() } = {}) {
  const leads = [];
  for (const raw of content.split(/\r?\n/)) {
    const match = raw.match(/^\s*- \[ \]\s+(https?:\/\/\S.*)$/);
    if (!match) continue;
    const cells = match[1].split("|").map((cell) => cell.trim());
    const canonical = normalizeUrl(cells[0]);
    if (!canonical) continue;
    const positional = [];
    const labels = {};
    for (const cell of cells.slice(1)) {
      const labeled = cell.match(/^([a-z-]+):\s*(.*)$/i);
      if (labeled) labels[labeled[1].toLowerCase()] = labeled[2].trim();
      else positional.push(cell);
    }
    const [company = UNKNOWN, title = UNKNOWN, location = UNKNOWN, compensation = UNKNOWN] = positional;
    const trustScore = Number.parseInt(labels.trust, 10);
    const sourceConfidence = Number.isFinite(trustScore)
      ? trustScore >= 90 ? "high" : trustScore >= 60 ? "medium" : "low"
      : UNKNOWN;
    leads.push(normalizeLead({
      canonical_url: canonical,
      source_urls: [canonical],
      company,
      title,
      city: location,
      compensation_text: compensation,
      posted_at: labels.posted || UNKNOWN,
      source_publisher: "career-ops provider scan",
      discovery_channel: "provider",
      evidence_status: "public_detail",
      source_confidence: sourceConfidence,
      manual_review_required: sourceConfidence === "low",
      notes: labels.note || "",
      first_seen: now,
      last_verified: now,
    }, { now }));
  }
  return leads;
}

export function readLeads(path = DEFAULT_LEADS_PATH) {
  return existsSync(path) ? parseLeadFile(readFileSync(path, "utf8")) : [];
}

export async function upsertLeads(incoming, { path = DEFAULT_LEADS_PATH, dryRun = false } = {}) {
  const normalized = incoming.map((lead) => normalizeLead(lead));
  const apply = () => {
    const current = readLeads(path);
    const byKey = new Map(current.map((lead) => [lead.lead_key, lead]));
    let inserted = 0;
    let updated = 0;
    for (const lead of normalized) {
      const existing = byKey.get(lead.lead_key);
      if (existing) {
        byKey.set(lead.lead_key, mergeLeads(existing, lead));
        updated++;
      } else {
        byKey.set(lead.lead_key, lead);
        inserted++;
      }
    }
    if (!dryRun) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileAtomic(path, serializeLeads([...byKey.values()]));
    }
    return { inserted, updated, total: byKey.size, dryRun };
  };
  if (dryRun) return apply();
  return withPipelineLock(path, apply);
}

function findLead(leads, selector) {
  const exact = leads.filter((lead) => lead.lead_key === selector);
  if (exact.length === 1) return exact[0];
  const prefix = leads.filter((lead) => lead.lead_key.startsWith(selector));
  if (prefix.length === 1) return prefix[0];
  if (prefix.length > 1) throw new Error(`lead key is ambiguous: ${selector}`);
  throw new Error(`lead not found: ${selector}`);
}

export async function setReviewState(selector, state, {
  path = DEFAULT_LEADS_PATH,
  reason = "",
  now = new Date().toISOString(),
  dryRun = false,
} = {}) {
  enumValue("review_state", state);
  const apply = () => {
    const leads = readLeads(path);
    const target = findLead(leads, selector);
    const updated = normalizeLead({
      ...target,
      review_state: state,
      decision_reason: reason || target.decision_reason,
      reviewed_at: now,
      promoted_at: state === "promoted" ? now : target.promoted_at,
    }, { now });
    const next = leads.map((lead) => lead.lead_key === target.lead_key ? updated : lead);
    if (!dryRun) writeFileAtomic(path, serializeLeads(next));
    return { lead_key: target.lead_key, review_state: state, dryRun };
  };
  if (dryRun) return apply();
  return withPipelineLock(path, apply);
}

function pipelineField(value) {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s*\|\s*/g, " / ")
    .trim();
}

export function formatPromotedLead(lead) {
  const fields = [
    lead.canonical_url,
    lead.company === UNKNOWN ? "" : lead.company,
    lead.title === UNKNOWN ? "" : lead.title,
  ].map(pipelineField);
  if (lead.city !== UNKNOWN) fields.push(pipelineField(lead.city));
  let line = `- [ ] ${fields.join(" | ")}`;
  if (lead.posted_at !== UNKNOWN) line += ` | posted: ${pipelineField(lead.posted_at)}`;
  return line;
}

async function appendPromotedLead(lead, pipelinePath) {
  mkdirSync(dirname(pipelinePath), { recursive: true });
  return withPipelineLock(pipelinePath, () => {
    let content = existsSync(pipelinePath)
      ? readFileSync(pipelinePath, "utf8")
      : PIPELINE_SKELETON;
    if (parsePipelineText(content).some((item) => item.lead_key === lead.lead_key)) return true;

    const line = formatPromotedLead(lead);
    const marker = ["## Pending", "## Pendientes"].find((candidate) => content.includes(candidate));
    if (marker) {
      const markerIndex = content.indexOf(marker);
      const afterMarker = markerIndex + marker.length;
      const nextSection = content.indexOf("\n## ", afterMarker);
      const insertAt = nextSection === -1 ? content.length : nextSection;
      content = `${content.slice(0, insertAt).trimEnd()}\n\n${line}\n${content.slice(insertAt)}`;
    } else {
      const processed = ["## Processed", "## Procesadas"]
        .map((candidate) => content.indexOf(candidate))
        .filter((index) => index >= 0)
        .sort((a, b) => a - b)[0] ?? content.length;
      const block = `\n## Pending\n\n${line}\n\n`;
      content = content.slice(0, processed) + block + content.slice(processed);
    }
    writeFileAtomic(pipelinePath, content);
    return false;
  });
}

export async function promoteLead(selector, {
  path = DEFAULT_LEADS_PATH,
  pipelinePath = DEFAULT_PIPELINE_PATH,
  reason = "",
  now = new Date().toISOString(),
  dryRun = false,
} = {}) {
  const target = findLead(readLeads(path), selector);
  if (target.canonical_url === UNKNOWN) throw new Error("lead has no canonical URL and cannot be promoted");
  const existing = dryRun
    ? existsSync(pipelinePath)
      && parsePipelineText(readFileSync(pipelinePath, "utf8")).some((lead) => lead.lead_key === target.lead_key)
    : await appendPromotedLead(target, pipelinePath);
  const review = await setReviewState(target.lead_key, "promoted", { path, reason, now, dryRun });
  return { ...review, pipeline: pipelinePath, already_present: existing };
}

function loadInput(path, useStdin) {
  const raw = useStdin ? readFileSync(0, "utf8") : readFileSync(resolve(path), "utf8");
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) return JSON.parse(trimmed);
  if (trimmed.startsWith("{")) return [JSON.parse(trimmed)];
  return parseLeadFile(raw);
}

function flagValue(args, name) {
  const equal = args.find((item) => item.startsWith(`${name}=`));
  if (equal) return equal.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function printList(leads, limit) {
  if (!leads.length) {
    console.log("暂无结构化岗位 Lead。运行 search 或 search-local 后再查看。");
    return;
  }
  console.log("Key                  State        Company              Title                         City        Confidence  Date");
  for (const lead of leads.slice(0, limit)) {
    console.log([
      lead.lead_key.padEnd(20),
      lead.review_state.padEnd(12),
      lead.company.slice(0, 20).padEnd(20),
      lead.title.slice(0, 29).padEnd(29),
      lead.city.slice(0, 10).padEnd(10),
      lead.source_confidence.padEnd(10),
      lead.date_status,
    ].join("  "));
  }
}

export async function main(argv = process.argv.slice(2)) {
  const [command = "list"] = argv;
  const json = argv.includes("--json");
  const dryRun = argv.includes("--dry-run");
  const path = flagValue(argv, "--path") ? resolve(flagValue(argv, "--path")) : DEFAULT_LEADS_PATH;

  if (command === "list") {
    const limit = Math.max(1, Number(flagValue(argv, "--limit") || 20));
    const state = flagValue(argv, "--state");
    if (state) enumValue("review_state", state);
    const leads = readLeads(path).filter((lead) => !state || lead.review_state === state);
    if (json) console.log(JSON.stringify(leads.slice(0, limit), null, 2));
    else printList(leads, limit);
    return 0;
  }
  if (command === "show") {
    const key = argv[1];
    if (!key) throw new Error("show requires a lead key");
    const lead = readLeads(path).find((item) => item.lead_key === key || item.lead_key.startsWith(key));
    if (!lead) return 2;
    console.log(JSON.stringify(lead, null, 2));
    return 0;
  }
  if (command === "upsert") {
    const input = flagValue(argv, "--input");
    const useStdin = argv.includes("--stdin");
    if (!input && !useStdin) throw new Error("upsert requires --input <json|jsonl> or --stdin");
    const result = await upsertLeads(loadInput(input, useStdin), { path, dryRun });
    console.log(JSON.stringify(result));
    return 0;
  }
  if (command === "sync-pipeline") {
    const pipeline = resolve(flagValue(argv, "--pipeline") || resolve(ROOT, "data", "pipeline.md"));
    if (!existsSync(pipeline)) throw new Error(`pipeline not found: ${pipeline}`);
    const result = await upsertLeads(parsePipelineText(readFileSync(pipeline, "utf8")), { path, dryRun });
    console.log(JSON.stringify(result));
    return 0;
  }
  if (command === "review") {
    const selector = argv[1];
    const state = argv[2];
    if (!selector || !state) throw new Error("review requires <lead-key> <new|shortlisted|dismissed>");
    if (state === "promoted") throw new Error("use promote to move a Lead into the evaluation pipeline");
    const result = await setReviewState(selector, state, {
      path,
      reason: flagValue(argv, "--reason") || "",
      dryRun,
    });
    console.log(JSON.stringify(result));
    return 0;
  }
  if (command === "promote") {
    const selector = argv[1];
    if (!selector) throw new Error("promote requires a lead key");
    const pipeline = resolve(flagValue(argv, "--pipeline") || DEFAULT_PIPELINE_PATH);
    const result = await promoteLead(selector, {
      path,
      pipelinePath: pipeline,
      reason: flagValue(argv, "--reason") || "",
      dryRun,
    });
    console.log(JSON.stringify(result));
    return 0;
  }
  if (command === "stats") {
    const leads = readLeads(path);
    const stats = {
      total: leads.length,
      manual_review: leads.filter((lead) => lead.manual_review_required).length,
      conflicts: leads.filter((lead) => lead.field_conflicts.length).length,
      verified: leads.filter((lead) => lead.evidence_status === "verified").length,
      review_state: Object.fromEntries(["new", "shortlisted", "dismissed", "promoted"]
        .map((state) => [state, leads.filter((lead) => lead.review_state === state).length])),
      discovery_channel: Object.fromEntries(["provider", "websearch", "ats", "manual", UNKNOWN]
        .map((channel) => [channel, leads.filter((lead) => lead.discovery_channel === channel).length])),
      source_confidence: Object.fromEntries(["high", "medium", "low", UNKNOWN]
        .map((level) => [level, leads.filter((lead) => lead.source_confidence === level).length])),
    };
    console.log(JSON.stringify(stats, null, 2));
    return 0;
  }
  if (command === "validate") {
    const leads = readLeads(path);
    const keys = new Set();
    for (const lead of leads) {
      if (keys.has(lead.lead_key)) throw new Error(`duplicate lead key: ${lead.lead_key}`);
      keys.add(lead.lead_key);
    }
    console.log(JSON.stringify({ valid: true, total: leads.length, path }));
    return 0;
  }
  throw new Error(`unknown command: ${command}`);
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
