---
name: china-job-search
description: >-
  Search broadly for jobs and internships in mainland China across public
  employment services, official company career and campus pages, publicly
  indexed recruitment platforms, university career centers, and recruitment
  announcements. Covers internships, campus recruitment, graduate programs and
  early-career roles across business and technical functions.
allowed-tools: WebSearch, WebFetch, Read
license: MIT
metadata:
  version: "3.0.0"
  kind: job-source
  execution: web-search
  market: CN
  enabled: true
---

# China multi-source job search

This source strategy extends the canonical `modes/scan.md` workflow. The
career-ops scanner owns provider execution and source-level deduplication;
`integration/china-leads.mjs` owns the rich China Lead schema, conflict-safe
upserts and the human review gate. Search results never enter Pipeline or the
application tracker directly. This file owns China-specific discovery, query
construction and access limits.

The default is broad: derive searches from the candidate's configured role
families, industries, cities, availability and graduation cohort. Do not limit
the search to famous companies, technical roles, sports, esports or any other
single sector unless the user explicitly requests that filter.

## Required execution path

`search` is not an alias for `scan.mjs` alone. A complete run has two lanes:

1. **Provider lane:** run `node integration/search-local.mjs` with the user's
   company/date filters. This calls the zero-token scanner in an isolated inbox
   and writes accepted discoveries directly to `data/job-leads.jsonl`, never to
   the real Pipeline.
2. **Discovery lane:** read enabled `search_queries` from `portals.yml`, expand
   them using the candidate's roles/cities/industries and execute ordinary
   WebSearch. Fetch only promising public detail pages under the access policy.

Normalize every accepted Discovery-lane item to the schema in
`integration/COMPATIBILITY_CONTRACT.zh-CN.md`, then import it through:

```text
node integration/china-leads.mjs upsert --stdin
```

Pass a JSON object or array on stdin. If the execution environment cannot pass
stdin, write one exact temporary JSON file under `data/`, run `upsert --input`,
and remove only that exact temporary file after a successful import. Never edit
`data/job-leads.jsonl` by hand.

After both lanes finish, show the new Leads and ask the user which should be
shortlisted or dismissed. A Lead enters `data/pipeline.md` only through
`node integration/china-leads.mjs promote <lead-key>` after that review.

Use `search-local`, not `search`, when the user explicitly requests a fast
Provider-only scan with no search-engine work.

## Access policy

1. Use public pages and ordinary search-engine discovery only.
2. Prefer an employer's verified career page or public-employment source.
3. Never bypass login, CAPTCHA, app-only or mini-program flows, rate limits,
   robots restrictions, terms restrictions or interactive verification.
4. Never reverse-engineer private APIs and never automate chat, Apply, Submit or Send.
5. A search snippet is a lead, not a verified posting. Mark it `snippet_only`.
6. Preserve source URL, publisher, date, confidence and manual-review status.

## Source tiers

### Tier A — primary and authoritative

- Employer-owned career, campus, graduate, internship and recruitment pages.
- China Public Recruitment (`job.mohrss.gov.cn`), National College Student
  Employment Service Platform (`ncss.cn`), 12333, and provincial/municipal
  human-resources and social-security sites.
- Official government, public-institution, state-owned-enterprise and university
  career-center announcements.

A live role-specific detail page from this tier can normally be marked high
confidence. A general careers landing page is not a job record.

### Tier B — public recruitment platforms

Use public, indexable pages from 实习僧、牛客、智联招聘、前程无忧、猎聘、
拉勾、BOSS直聘、LinkedIn Jobs and comparable platforms when accessible.

- Prefer search-engine `site:` discovery for login-gated or app-first sources.
- Stop when a page requires login, CAPTCHA, an app or interactive verification.
- If a platform links to an employer page, use the employer URL as canonical
  while retaining the platform URL as provenance.

### Tier C — announcements and communities

Use indexed employer announcements, `mp.weixin.qq.com`, university employment
notices, industry associations, incubators and reputable roundups as leads.
Anonymous or uncorroborated reposts remain low confidence.

## Broad query construction

Build combinations instead of using a fixed employer allowlist:

```text
<role> + <job cycle> + <city> + <industry>
<industry> + <job cycle> + <graduation cohort>
<company> + (招聘 OR 校招 OR 实习 OR careers)
site:<verified employer domain> <role> (招聘 OR internship OR graduate)
site:job.mohrss.gov.cn <role> <city>
site:ncss.cn <role> <city>
site:nowcoder.com/jobs <role> (实习 OR 校招)
site:shixiseng.com <role> <city>
site:mp.weixin.qq.com <role> (招聘 OR 实习 OR 校招) <city>
```

Job cycles: 日常实习、暑期实习、寒假实习、校招、春招、秋招、提前批、
应届生、管培生、初级社招、助理、专员、coordinator、associate、0-3 年。

Role families include both Chinese and English variants:

- 商务、商业化、BD、销售、渠道、大客户、合作伙伴、客户成功
- 市场、品牌、增长、公关、媒介、活动、赛事、整合营销
- 运营、产品运营、内容运营、用户运营、社区、电商、出海
- 产品、项目、PMO、用户研究、战略、商业分析、咨询、研究
- 内容、编辑、策划、制片、发行、传媒、创作者运营
- 技术、软件、数据、AI/算法、测试、硬件、供应链、解决方案

Industry prompts include AI/SaaS、硬件/半导体、消费/零售、汽车/新能源、
金融/金融科技、咨询、体育/电竞/游戏、文娱/传媒、教育、医疗健康、制造、
气候科技、国企/央企、创业公司和社会组织。Treat the list as prompts,
not a hard limit.

## Company discovery

For each configured city and industry, discover employers from authoritative
results, campus schedules, public industry lists and credible portfolios. Then
search each employer's exact name with 招聘、校招、实习、career and jobs. Verify
the domain before accepting it as official and keep companies of every size.

## China posting fields

Alongside company, title, description and URL, capture when stated:

- city/region and workplace detail
- arrival date, days per week and internship duration
- season eligibility, remote/hybrid/on-site policy
- education, year of study and graduation cohort
- application deadline
- daily/monthly salary and benefits
- conversion or return-offer opportunity
- job cycle, role family, industry and company size/stage
- publisher, source tier, confidence, evidence status and application route

Use `unknown`, never an invented value, when a posting omits a field.

The runtime field names are fixed by `integration/china-leads.mjs`. At minimum,
every item must carry `canonical_url` or a source URL, `company`, `title`,
`source_publisher`, `source_tier`, `source_confidence`, `evidence_status`,
`date_status`, `preference_gate`, and `language_gate`. Missing values remain
their schema sentinel; do not omit fields to make a record look complete.

Before setting the two gates, read the real profile. A missing profile means
`UNKNOWN`, not PASS. A clear conflict with arrival date, weekly attendance,
duration, city, graduation cohort or another declared hard preference is
`preference_gate: FAIL`. An omitted requirement is normally FLAG/UNKNOWN.

## Fallbacks

- Direct detail works: extract it and preserve the canonical URL.
- Fetch fails but a search result exists: keep only a `snippet_only` lead with
  `manual_review_required` and lower confidence.
- Login/CAPTCHA/app/mini-program wall: stop and ask the user to open or paste the JD.
- Email or QR application only: preserve the announcement; do not send or scan.
- No accessible detail: do not create a high-confidence record or guess facts.
