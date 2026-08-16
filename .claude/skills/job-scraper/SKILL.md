---
name: scrape
description: >
  Finds new job postings matching your profile via installed CLI, WebSearch,
  and manual-fallback job sources. Normalizes China internship/graduate fields,
  deduplicates across sources and runs, checks trust and expiry, and prioritizes
  results. Triggers on: job scrape, find jobs, search jobs, new jobs, job search,
  internships, campus recruitment, scrape jobs, /scrape
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(bun --version), Bash(bun run .agents/skills/*/cli/src/cli.ts *), WebFetch, WebSearch, Agent, AskUserQuestion
---

# Job Scraper

---

## How It Works

This skill orchestrates installed **job-source skills** in `.agents/skills/`.
Sources may be CLIs, public WebSearch strategies, or manual fallbacks. It uses
the authoritative preferences in `search-queries.md`, merges duplicates across
sources, validates freshness and source confidence, and presents a prioritized
set with a quick fit assessment.

## Invocation

The user triggers this skill by saying things like:
- "Find new jobs"
- "Scrape for jobs"
- "Any new positions?"
- "/scrape"

Optional arguments:
- A focus area, e.g. "/scrape data science" or "/scrape geophysics"
- "broad" to run all search categories, e.g. "/scrape broad"
- "health" to run the portal health check only (Step 4.75), without searching, deduplicating, or presenting jobs - e.g. "/scrape health", or "/scrape health jobnet" to probe one portal even if disabled

---

## Execution Steps

### Step 0: Load State

1. Read `job_scraper/seen_jobs.json` (create if missing - start with `{"seen": {}}`)
2. Read `job_search_tracker.csv` to extract already-applied companies+roles
3. Read `search-queries.md` (this directory) for the search strategy
4. Read `.claude/skills/job-application-assistant/01-candidate-profile.md` and
   `04-job-evaluation.md` for eligibility, deal-breakers, and quick fit. Do not
   mutate either file during a scrape.

### Step 1: Search

Read `search-queries.md` (this directory) for the search strategy. By default, run the top 3 priority query categories. If the user said "broad", run all categories. If the user specified a focus area (e.g. "data science"), prioritize queries from that category.

Discover skills under `.agents/skills/*/SKILL.md`, then classify them:

- A skill is a search source when frontmatter has `kind: job-source`, or, for
  backward compatibility, when its directory contains `cli/`.
- `kind: workflow` files are thin discovery pointers. Never execute them as
  portals or include them in the disabled-source report.
- `execution: cli` (and legacy `cli/` sources) runs in Step 1b.
- `execution: web-search` runs its documented strategy in Step 1c.
- `execution: manual` is listed as an available fallback and makes no automated
  request.

Honor `enabled: false` only for search sources. A missing `enabled` key means
enabled.

#### 1a. Check bun availability

```bash
bun --version
```

Run this check only when at least one enabled CLI source exists. If it fails,
skip CLI sources to **1c (WebSearch fallback)** and note the fallback in Step 5.

#### 1b. Run CLI tools (primary — run these in parallel where possible)

For enabled CLI sources, read the source's `SKILL.md` for its exact flags and
usage. **Do not guess flags.** Skills added with `/add-portal` remain automatic.

For each **enabled CLI source**:

1. Read its `SKILL.md` to find the correct `bun run …` invocation and supported flags.
2. Translate the query terms from `search-queries.md` into that portal's flag format (e.g. `--key`, `--search-string`, `--query`, filter codes — whatever the portal's SKILL.md specifies).
3. Scope to `recency_days` from the Search Preference Profile using the source's
   documented recency flag (`--jobage`, `--since`, ordering, etc.).
4. Cap results to ~20 per call using the portal's limit flag.
5. Use `--format json` for machine-readable output.

Run all portal CLI calls in parallel where possible using the Agent tool. Collect all `results` arrays into a single pool for Step 2, keeping each result tagged with its source portal skill (for Step 2 `detail` lookups).

If a CLI tool exits with a non-zero code, log the error message and continue — do not abort the whole search.

#### 1c. WebSearch fallback

Use `WebSearch` for:

- every enabled source whose frontmatter says `execution: web-search`; follow
  its own source tiers, query construction, and access policy
- sites/query families in `search-queries.md` without a CLI adapter
- any CLI source that fails, or all CLI sources when bun is unavailable

Use the saved query families directly and tag each result with its producing
source skill/query. A WebSearch source may cover many sites; it is still one
strategy, not permission to crawl those sites.

### Step 2: Fetch & Parse

For each promising result from Step 1:

**From CLI results:** Search output already includes title, company, location, date,
and URL. For jobs worth a deeper look, fetch full detail with that portal's `detail`
command (see its SKILL.md — do not guess flags) to extract **key requirements**,
**application deadline**, and a brief description snippet.

**From WebSearch results:** Pre-filter by title/snippet. For promising results,
use `WebFetch` only when the source strategy and the robots/terms gate in
`.claude/skills/job-application-assistant/09-web-research.md` allow it. On a
login, CAPTCHA, app, mini-program, or interactive-verification wall, stop. Keep
the result as a `snippet_only` lead for manual review or drop it; never bypass
the control. A permitted HTTP 403 retry may use the gated browser-header path in
`09-web-research.md`.

**Store a URL that actually resolves to the posting.** A listing-page URL with a
`#fragment` appended (`.../jobs/ciso/#ikerian`) is not a posting: it fetches fine and
returns unrelated job titles, which makes every later `/rank` and `/apply` run fail on
that entry. When WebSearch only yields a listing page, search the employer's own careers
site for the role and store that URL instead, or drop the candidate rather than saving a
fragment link.

### Step 2.25: Normalize the job record

Every candidate uses this additive schema. Values omitted by the posting are
`null`/`unknown`, never inferred as fact:

```json
{
  "title": "...",
  "company": "...",
  "canonical_url": "https://.../specific-posting",
  "source_urls": ["https://..."],
  "source": "china-job-search",
  "source_tier": "A/B/C",
  "source_publisher": "...",
  "source_confidence": "high/medium/low",
  "evidence_status": "verified_detail/snippet_only/manual_review_required",
  "requisition_id": "...",
  "published_date": "YYYY-MM-DD or unknown",
  "deadline": "YYYY-MM-DD or unknown",
  "date_status": "fresh/active_deadline/unknown/stale/expired/closed",
  "city": "...",
  "workplace": "...",
  "remote_policy": "remote/hybrid/on_site/unknown",
  "arrival_date": "YYYY-MM-DD or text or unknown",
  "days_per_week": "number/range/unknown",
  "internship_duration_months": "number/range/unknown",
  "season_eligibility": ["summer", "winter", "off_cycle"],
  "education": "...",
  "year_of_study": "...",
  "graduation_cohort": "...",
  "salary_daily_cny": "number/range/unknown",
  "salary_monthly_cny": "number/range/unknown",
  "conversion_opportunity": "yes/no/possible/unknown",
  "job_cycle": "internship/campus/graduate/early_career/experienced/unknown",
  "role_family": "...",
  "industry": "...",
  "company_size": "...",
  "application_route": "official_site/platform/email/manual/unknown",
  "requirements": ["..."],
  "fit": "high/medium/low",
  "search_priority": 0,
  "first_seen": "YYYY-MM-DD",
  "last_verified": "YYYY-MM-DD",
  "status": "new/skipped/ranked/expired"
}
```

Keep the legacy `url` and `portal` aliases when writing `seen_jobs.json` so old
readers remain compatible: `url = canonical_url`; `portal = source`.

### Step 2.5: Cross-source deduplication and consolidation

Normalize before comparing:

1. Canonicalize URLs: remove tracking parameters and fragments, normalize the
   host/path, and prefer the employer detail URL over an aggregator URL.
2. Normalize titles and company names case-insensitively, whitespace and
   punctuation-insensitively. Legal suffixes may be ignored for matching, but
   never collapse named subsidiaries or business units into a parent company.
3. Treat an exact canonical URL or the same source+requisition ID as a duplicate.
4. Otherwise merge only when normalized company + substantially equivalent
   title + compatible city/work-mode identify the same opening. Similar titles
   at the same employer are not enough when IDs, locations, or descriptions
   conflict.
5. On merge, preserve every URL in `source_urls`, the richest non-conflicting
   fields, the most authoritative canonical URL, and the highest supported
   confidence. Record conflicting deadline/salary/location values for manual
   review; never pick one silently.
6. Exclude a consolidated record from presentation if any alias already exists
   in `seen_jobs.json`, or its normalized company+role already exists in
   `job_search_tracker.csv`. Still update `last_verified` and merged source
   evidence without dropping prior rank fields.

### Step 2.75: Mass-Posting Detection (within this run)

A distribution pattern worth flagging to the user as a caution signal, not as an accusation against the employer - it describes how a listing is being distributed, not a verdict on whether the company is legitimate. It alone proves nothing is wrong (companies do legitimately hire the same role across several cities); flag it so the user can factor it in when deciding whether to invest time, don't downgrade fit or silently exclude the result because of it.

If two or more results in this run's pool (from the same company, or sharing the same req/job ID visible in the URL or title) have substantially the same description and differ only in city/location/title, don't present them as separate rows. Consolidate into a single row and note the spread, e.g. "posted identically across 6 cities (BR, MX, GT)".

### Step 3: Quick Fit Assessment

For each new job, do a rapid fit check (NOT the full evaluation from `04-job-evaluation.md` - just a quick signal):

- **High match**: Role directly involves your core skills
- **Medium match**: Role is adjacent to your experience
- **Low match**: Role requires significant skills you lack

**Language override:** before assigning a match level, check the posting against `04-job-evaluation.md`'s Language Gate (a required language you haven't declared at all in your CLAUDE.md Languages table). A required language that's entirely undeclared overrides skill fit: mark it **Low** regardless of how well the skills align, and name it in the highlight bullets so it isn't buried under an otherwise-good-looking match. A **declared** language at a requirement that reads higher than your declared level is *not* an override — score fit normally, but add a red-flag bullet under that job's highlights (Step 5) quoting the posting's requirement next to your declared level, so the gap is visible without being auto-downgraded.

Apply the Search Preference Profile to city, remote policy, arrival date, weekly
attendance, duration, season, education/year/cohort, compensation, job cycle,
and conversion opportunity. An explicit deal-breaker mismatch is excluded. An
unknown or soft mismatch stays visible with a flag.

### Step 3.5: Trust, expiry, and search priority

**Source confidence:**

- `high`: verified employer-owned detail page, official public-employment page,
  or official recruitment announcement with a verifiable application route
- `medium`: public platform detail page naming the employer and role, or a
  credible announcement corroborated by another source
- `low`: search snippet only, uncorroborated repost, anonymous employer, missing
  application route, or conflicting material fields

Confidence describes evidence, not whether the employer is "good." Never call a
company fraudulent from a low-confidence source label.

**Expiry:** set `closed`/`expired` when the source says so or a stated deadline
has passed. A reachable live detail page with a future deadline is
`active_deadline` regardless of publication age. A posting older than
`recency_days` without a future deadline is `stale` and requires verification;
an unknown date is `unknown`, not fresh. Exclude `closed` and `expired`; lower
priority for `stale` and `unknown`.

**Search priority (0-100):** this is a triage score, not `/rank`'s full fit score.
Use one transparent score per record:

- quick candidate fit: 0-40 (high 40, medium 25, low 10)
- hard/soft preference alignment: 0-25
- freshness/deadline urgency: 0-15
- source confidence: 0-15 (high 15, medium 9, low 3)
- field completeness/application readiness: 0-5

An explicit deal-breaker or expired/closed state vetoes presentation rather than
being hidden inside the number. Store the component reasons so ties are
explainable. Sort by `search_priority`, then future deadline urgency, then
publication date. Never let source confidence alone override candidate fit.

### Step 4: Deduplicate & Store

1. Add ALL fetched and consolidated jobs (new and skipped) to
`seen_jobs.json`. The minimal backward-compatible example is:
```json
{
  "seen": {
    "<url_or_company_title_key>": {
      "title": "...",
      "company": "...",
      "url": "...",
      "canonical_url": "...",
      "source_urls": ["..."],
      "first_seen": "YYYY-MM-DD",
      "fit": "high/medium/low",
      "status": "new/skipped/ranked/expired",
      "portal": "<source skill, legacy alias>",
      "source": "<source skill>",
      "source_confidence": "high/medium/low",
      "evidence_status": "verified_detail/snippet_only/manual_review_required",
      "date_status": "fresh/active_deadline/unknown/stale/expired/closed",
      "search_priority": 0
    }
  }
}
```

The `source` field records the producing source skill; `portal` is its legacy
alias. Entries written before these fields existed are tolerated. Do not
backfill unverifiable evidence, dates, or China-specific fields.

`/rank` extends this schema additively: ranked entries also carry `rank_score` (0–100 overall score), `rank_verdict` (fit band, e.g. "strong fit"), `rank_date` (ISO date of ranking), and `strengths`/`gaps` (1-3 verbatim bullets each, copied from the scoring agent's findings). The `status` field is set to `"ranked"`. Do not drop any of these fields when re-writing entries. Entries ranked before `strengths`/`gaps` existed simply lack them; readers tolerate their absence and never backfill by guessing.

2. Only present jobs NOT already in the seen list or tracker.

### Step 4.5: Generate Referral Contact Links (High & Medium Fit Only)

For every job from this run with `fit` of **high** or **medium** (skip low-fit jobs),
build two LinkedIn people-search URLs so the user can find a recruiter or team member to
reach out to for a referral or a warm intro. This is deliberately a link-generation step,
not an automated lookup: no scraping, no third-party API, zero runtime dependencies or
credentials required.

**A. Recruiters / Talent Acquisition (the referral path)**
```
https://www.linkedin.com/search/results/people/?keywords=<url-encoded "<Company Name> recruiter">&origin=GLOBAL_SEARCH_HEADER
```

**B. Role/team peers (informational-outreach / warm-intro path)**
```
https://www.linkedin.com/search/results/people/?keywords=<url-encoded "<Company Name> <role keyword>">&origin=GLOBAL_SEARCH_HEADER
```
Use a short keyword drawn from the posting's title for `<role keyword>` - e.g. a posting
titled "AI Program Manager" becomes `"<Company Name> AI Program Manager"`.

Both links are for the user to open and browse themselves - never fetch or scrape the
LinkedIn people-search result pages programmatically. Never fabricate contacts or claim a
specific person was found; these are search links, not results.

### Step 4.75: Portal Health Check

Scraper-based portal CLIs rot silently: when a portal changes its markup, the parser usually exits 0 with zero results or with null/garbled fields, and the Step 1c fallback never fires because it only triggers on hard failure. This step catches that from evidence the run already holds.

**Free pass (no extra requests).** For each enabled CLI source that ran in Step 1b:

- **Degraded scan:** inspect the results it returned this run. Flags: `company` null or empty on every result, empty titles, undecoded entities (`&amp;`) or HTML fragments in titles, URLs that do not point at the portal. Any of these means the parser is half-working and `/scrape` is silently collecting junk.
- **Yield history:** if the portal returned zero results across all of this run's queries, check whether `seen_jobs.json` holds prior entries from it (via the `portal` field, or by matching URL domains for entries predating the field). A portal that produced jobs on earlier runs and produces nothing now is suspect - the same queries worked before.

**Escalation (bounded, on suspicion only).** A suspect portal gets **one** sentinel probe: run its documented `search` with the example query from its own SKILL.md (that query provably worked when the skill was registered), the portal's limit flag capped at 3, `--format json`. If that returns nothing, retry **once** with a single common word. Only then is the verdict **broken**. A 429 or block page is **never** evidence of breakage - record the portal as **inconclusive (rate-limited)**, back off, and do not retry.

**Verdicts.** Healthy portals get silence - no table, no line. Anything else surfaces in the Step 5 summary as a health line.

**Probe-only mode (`/scrape health`).** Skip Steps 1-4 and this step's free pass
(there is no fresh run to scan). Probe enabled CLI sources by default; probe a
disabled CLI source only when named. Each gets the bounded sentinel probe above.
For `execution: web-search`, run one documented sentinel query and open at most
one public detail result; report `healthy`, `degraded`, `blocked/manual`, or
`inconclusive`. A manual source is reported `manual by design`, not broken.
Volume stays bounded: one search, at most one retry, and at most one detail per
source.

### Step 5: Present Results

Present new jobs sorted by `search_priority` (then deadline urgency and
publication date). When Step 1 skipped sources (`enabled: false`), report them
with the `skipped (disabled):` line below
so opting one out stays visible rather than silent; omit the line when nothing
was skipped. When Step 4.75 found a portal degraded, broken, or inconclusive,
add one `health:` line per suspect portal (healthy portals get no line); after
the report, offer to set that portal's `enabled: false` so `/scrape` stops
running it (and covers it via the Step 1c fallback) until it is fixed - only
edit the toggle with the user's confirmation, and never edit anything else in
the skill.

```
## New Job Matches - YYYY-MM-DD

Found X new positions (Y high, Z medium, W low match).

skipped (disabled): <portal-name>, <portal-name>

health: <portal-name> - degraded (company null on all 12 results); parsing anchors in .agents/skills/<portal-name>/url-reference.md
health: <portal-name> - broken (0 results for the SKILL.md test query and a broader retry); parsing anchors in .agents/skills/<portal-name>/url-reference.md

| # | Priority | Fit | Title | Company | Location / work mode | Schedule / duration | Pay | Deadline / freshness | Confidence | URL |
|---|----------|-----|-------|---------|----------------------|---------------------|-----|----------------------|------------|-----|
| 1 | 86 | High | ... | ... | Shanghai / hybrid | 4-5 days / 3+ months | CNY 180-220/day | 2026-09-01 / fresh | High / verified detail | [Link](...) |

Use `unknown` visibly for missing schedule, salary, eligibility, or date fields.
If Step 2.75 flagged a mass-posting pattern, note it in the Title cell (e.g.
"Frontend Developer (posted in 6 cities)") rather than burying it. Do the same
for a declared-language-insufficient-level flag from the Language Gate.

After the table, add compact detail bullets for internship/campus records when
available: arrival date; weekly attendance; duration; summer/winter/off-cycle;
remote policy; education/year/cohort; conversion opportunity; role family;
industry; company size; source publisher; and any conflicting source values.
Do not hide a configured preference mismatch in those bullets.

### High-Match Highlights
For each high-match job, add 2-3 bullet points:
- Why it matches your profile
- Key requirements to check
- Any red flags (including mass-posting signals from Step 2.75)

### Manual-review leads
List `snippet_only` and `manual_review_required` leads separately from verified
matches. Give the search/result URL, what is known, what could not be verified,
and the required user action (open while signed in, use the app/mini-program, or
paste the JD). Never mix low-confidence snippets into the verified-match count.

### Contacts
For each high/medium-fit job from Step 4.5, add a short contacts block with the two
LinkedIn search links:
- Recruiters/TA search link, for the referral path
- Role/team-peer search link, for the warm-intro / informational-outreach path
```

After presenting, ask:
> "Want me to evaluate any of these in detail? Just give me the number(s)."

If the user picks a number, invoke the **job-application-assistant** skill workflow (fit evaluation first, then CV + cover letter if approved).

If the run found many new jobs (roughly 8+), also suggest `/rank` - it batch-scores all new postings against the full fit framework and returns a ranked shortlist, which beats eyeballing a long table. (`/rank` sets the `ranked` and `expired` status values in `seen_jobs.json`; treat both as already-seen for dedup purposes.)

### Step 6: Update Tracker (Optional)

If the user decides to apply to any job, the tracker row is written by **job-application-assistant Step 3b**, which Step 5 already routes into - do not add a second row here. Only when the user says they applied to something outside that path, add a row using the header and the match-then-update rule in `/outcome` Step 1.

---

## Important Rules

1. **Never fabricate job postings.** Only present jobs from actual CLI
   search/detail output or WebSearch/WebFetch results. Search snippets are leads,
   never verified details.
2. **Respect cross-source deduplication.** Always consolidate aliases, retain
   source provenance, and check seen_jobs.json AND job_search_tracker.csv.
3. **Honor configured preferences.** Exclude only explicit deal-breaker
   mismatches; flag unknown or soft schedule/location/eligibility mismatches.
4. **Only open positions.** Skip postings with expired deadlines or those marked as closed.
5. **Be efficient with detail fetches.** Don't run `detail` or WebFetch on every search hit — pre-filter by title/snippet, then fetch only promising matches.
6. **Use each source by its declared execution mode.** Run CLI sources in
   parallel, execute WebSearch source strategies directly, and keep manual
   sources manual.
7. **No automated people lookups.** Referral contacts (Step 4.5) are LinkedIn search links only - never fetch or scrape LinkedIn people-search result pages programmatically.
8. **Health checks are bounded and honest.** Step 4.75 spends at most one probe, one retry, and (in `health` mode) one detail fetch per portal - a diagnosis, not a crawl. A rate-limit is never evidence of breakage. Health verdicts come only from observed CLI output; a portal that could not be tested is reported as inconclusive, never guessed. The `enabled` toggle is the only thing the health check may edit, and only with confirmation.
9. **Flag distribution patterns, never accuse.** The mass-posting signal (Step
   2.75) describes distribution, not a claim that an employer is fraudulent.
10. **Confidence is evidence quality.** It never becomes an accusation or a
    substitute for user judgment. Low-confidence and access-walled leads stay in
    the manual-review section.
