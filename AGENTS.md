---
framework_version: 1.0.0
---

# Agent Guidelines: AI Job Search China

This workspace is the mainland-China market adaptation of the country-agnostic
AI Job Search framework. It manages job-search activities, source tools, CVs,
cover letters, and interview preparation while retaining extension support for
other markets.

## Thin-Pointer Design (Single Source of Truth)

To prevent duplication and configuration drift across different AI agent frameworks (Claude Code, Google Antigravity, Codex, Cursor, Gemini CLI, etc.), this workspace uses a unified thin-pointer design. All agent runtimes should load the canonical specifications and candidate profiles from the files and directories below:

1. **Personal Candidate Profile:**
   - The candidate profile, contact details, education, and target preferences are defined in [CLAUDE.md](CLAUDE.md) and the individual profile methodology files under [.claude/skills/job-application-assistant/](.claude/skills/job-application-assistant/) (specifically `01-*.md` etc.).
2. **Canonical Workflow Specifications:**
   - The step-by-step instructions and triggers for tasks (setup, scrape, rank, apply, upskill, interview) are defined in the [.claude/](.claude/) directory (specifically under `.claude/skills/` and `.claude/commands/`).
   - Do not duplicate these rules or specifications. Treat `.claude/` files as the single source of truth.
3. **Portable Agent Skills:**
   - Search-source adapters and thin workflow pointers live under
     [.agents/skills/](.agents/skills/) in the portable Agent Skills format.
     Codex discovers them automatically; the canonical `/scrape` workflow in
     [.claude/skills/job-scraper/](.claude/skills/job-scraper/) orchestrates only
     skills declared as job sources.

## Codex Entry Points

Codex users should read [CODEX.md](CODEX.md) for invocation examples. The
portable workflow skills under `.agents/skills/` are deliberately thin
pointers: they make `setup`, `scrape`, `rank`, `apply`, `upskill`, `interview`,
and `outcome` discoverable without copying their specifications. When one is
invoked, read and execute the canonical file named by its `SKILL.md`.

When discovering search providers, treat only skills whose frontmatter says
`kind: job-source` (or legacy skills that contain a `cli/` directory) as job
sources. Workflow pointer skills are not portals and must never be run as one.
