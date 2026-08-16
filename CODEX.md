# Using AI Job Search China with Codex

This repository is the mainland-China adaptation of the country-agnostic AI Job
Search framework. Codex reads `AGENTS.md` automatically. This file is the
human-facing quick start; the canonical workflow specifications remain in
`.claude/commands/` and `.claude/skills/`.

## Start here

Open the repository as your Codex workspace, then invoke a portable workflow
skill or ask in natural language:

| Goal | Codex invocation | Canonical specification |
|---|---|---|
| Build or update your profile | `$setup` | `.claude/commands/setup.md` |
| Search for new jobs | `$scrape` or `$scrape broad` | `.claude/skills/job-scraper/SKILL.md` |
| Rank collected jobs | `$rank` | `.claude/commands/rank.md` |
| Tailor an application | `$apply <URL or pasted JD>` | `.claude/commands/apply.md` |
| Build a learning plan | `$upskill` | `.claude/skills/upskill/SKILL.md` |
| Prepare for an interview | `$interview <company>` | `.claude/commands/interview.md` |
| Record a result or follow up | `$outcome <company>` | `.claude/commands/outcome.md` |

If your Codex client does not expose `$` skill completion, use the equivalent
plain-language request, for example:

```text
Read AGENTS.md, then execute the canonical setup workflow.
```

```text
Read AGENTS.md and run the broad job-search workflow for China. Include
internships, campus recruitment, early-career social recruitment, official
company career pages, and non-technical roles.
```

```text
Follow the canonical apply workflow for this posting: <URL or pasted JD>
```

Canonical files sometimes name Claude Code tools such as `Read`, `WebSearch`,
`Agent`, or `AskUserQuestion`. In Codex, use the available semantic equivalent;
the workflow rule and safety boundary are authoritative, not the vendor-specific
tool label.

## China-enhanced search

The `china-job-search` source skill is enabled by default. It uses public web
search and accessible official/public pages rather than a brittle crawler. It
covers public employment services, company career and campus pages, publicly
indexed job-board pages, recruitment announcements, and WeChat article results
that a search engine can index.

This version's saved default is `sports_business_v1`: 体育商务 → 体育营销 →
赛事商务 → 赞助/Partnership → 电竞商务 → 体育平台商业运营 → 体育品牌
Marketing → SportsTech 产品运营. `$scrape` follows that chain; `$scrape broad`
temporarily activates the wider generic role/industry categories.

Run `$setup --section search` once to populate the authoritative preference
profile in `.claude/skills/job-scraper/search-queries.md`. Use `$scrape` for the
top three configured query families or `$scrape broad` for every family and
source tier.

Some platforms require login, interactive verification, an app, or a WeChat
session for complete results. The workflow never bypasses those controls. It
keeps the search-engine result as a lead, asks you to open it manually when
needed, or accepts a pasted job description. See the source matrix in
`.agents/skills/china-job-search/SKILL.md`.

## Architecture boundary

- `AGENTS.md` and these portable skills are discovery and routing layers.
- `.claude/commands/` and `.claude/skills/` are the single source of truth.
- `.agents/skills/*` with `kind: job-source` are source adapters or search
  strategies consumed by the canonical scrape workflow.
- Do not copy a workflow into a Codex-specific file. Update the canonical file
  and keep its pointer thin.
