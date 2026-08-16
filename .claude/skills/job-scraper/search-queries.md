# Search Queries for Job Scraper

<!-- SETUP: This file is the authoritative user preference configuration for /scrape. -->

## Search Preference Profile

`/setup --section search` updates this block. This fork currently ships a
`sports_business_v1` focus preset. The source architecture remains broad, but a
normal `/scrape` searches this priority chain first; `/scrape broad` temporarily
adds wider role and industry families without overwriting the preset.

```yaml
market: China mainland
focus_preset: sports_business_v1
broad_search: false
languages: [Chinese, English]
job_cycles: [daily_internship, summer_internship, winter_internship, campus, graduate, early_career]
primary_role_families: [体育商务, 体育营销, 赛事商务, "赞助 / Partnership", 电竞商务, 体育平台商业运营, 体育品牌 Marketing, SportsTech 产品运营]
adjacent_role_families: []
technical_roles: broad_mode_only
preferred_industries: [体育, 电竞, 赛事与活动, 体育品牌与运动消费, 体育媒体与内容平台, SportsTech]
excluded_industries: []
company_sizes: [startup, growth, SME, large, multinational, state_owned, public_institution, nonprofit]
cities:
  ideal: [YOUR_IDEAL_CITIES]
  acceptable: [YOUR_ACCEPTABLE_CITIES]
  remote: acceptable
availability:
  earliest_start: unknown
  days_per_week_min: unknown
  internship_months_min: unknown
  summer_or_winter_only: false
eligibility:
  education_levels: [YOUR_EDUCATION_LEVELS]
  graduation_cohorts: [YOUR_GRADUATION_COHORTS]
compensation:
  daily_min_cny: unknown
  monthly_min_cny: unknown
  unpaid_allowed: ask
conversion_opportunity: preferred
recency_days: 30
```

Use `unknown` rather than guessing. A missing preference is not a rejection
rule. Hard-exclude only explicit deal-breakers; flag all other mismatches.

## Installed search sources

`/scrape` discovers `.agents/skills/*/SKILL.md` but treats only a skill with
`kind: job-source` or a legacy skill containing `cli/` as a search source.
Workflow-pointer skills are never portals.

- `execution: cli` or a legacy `cli/` directory: run the source's documented
  command; shipped examples include LinkedIn, freehire, and opt-in Danish boards.
- `execution: web-search`: follow the source's query and access policy; the
  enabled `china-job-search` skill provides broad mainland-China coverage.
- `execution: manual`: show the user where/how to search or ask for a pasted JD;
  never automate an access wall.

The site-query templates below are also fallbacks for failed CLIs and sources
without an adapter.

**Language scope:** generate every query family in the languages listed above
and in the CLAUDE.md Languages table. Translate titles idiomatically and include
common English title variants used by multinational and outbound companies.
The Language Gate in `04-job-evaluation.md` remains the single source of truth
for required-language filtering.

## Search source coverage

Primary:
- enabled `kind: job-source` skills
- verified employer career/campus pages
- official public-employment, government, public-institution, SOE, and
  university career-center pages

Secondary:
- publicly indexable pages on major general, internship, campus, professional,
  and international job platforms
- official-account and recruitment-announcement pages discoverable through web
  search

Fallback:
- search-engine result snippets marked `snippet_only`
- user-opened/login-required pages and pasted job descriptions

## Query Categories

The default run executes Priorities 1-3 using the `sports_business_v1` chain.
`broad` additionally executes Priorities 4-7 across all source tiers and rotates
through wider industries so the result set is not dominated by one employer type.

### Priority 1: Primary role families

```
("体育商务" OR "体育营销" OR "赛事商务" OR "电竞商务") (实习 OR 校招 OR 应届生 OR 初级) [IDEAL_CITY]
("赞助" OR "Partnership" OR "商业合作") (体育 OR 赛事 OR 电竞) (实习 OR 校招 OR 初级) [IDEAL_CITY]
("体育平台商业运营" OR "体育品牌 Marketing" OR "SportsTech 产品运营") (实习 OR 校招 OR 初级) [IDEAL_CITY]
("sports business" OR "sports marketing" OR sponsorship OR partnerships) (intern OR graduate OR associate) China
site:shixiseng.com (体育商务 OR 体育营销 OR 赛事商务 OR 电竞商务) [IDEAL_CITY]
site:nowcoder.com/jobs (体育 OR 电竞 OR 赛事 OR SportsTech) (日常实习 OR 暑期实习 OR 校招)
```

### Priority 2: Skills and preferred industries

```
"[KEY_SKILL]" (体育 OR 电竞 OR 赛事 OR 运动品牌 OR SportsTech) (招聘 OR 实习 OR 校招) [CITY]
(赞助销售 OR 权益开发 OR 品牌合作 OR 商业化 OR 赛事运营 OR 产品运营) (体育 OR 电竞) [CITY]
site:job.mohrss.gov.cn (体育 OR 赛事 OR 品牌 OR 商务 OR 运营) [CITY]
site:ncss.cn (体育 OR 电竞 OR 赛事 OR SportsTech) [CITY]
```

### Priority 3: Adjacent and transferable roles

```
(商务拓展 OR 品牌营销 OR 商业化运营 OR 活动运营 OR 产品运营) (体育 OR 电竞 OR 赛事 OR 运动消费) (实习 OR 应届 OR 0-3年) [CITY]
(business development OR brand marketing OR commercial operations OR product operations) (sports OR esports OR sporting goods) China
```

### Priority 4: Broad non-technical coverage

Rotate through: 商务/BD/销售/合作伙伴/客户成功; 市场/品牌/增长/公关/媒介;
运营/内容/用户/社区/电商/出海; 产品/项目/PMO/用户研究; 战略/商业分析/咨询;
赛事/活动/文娱/传媒; 管培生 and general functions.

```
"[ROLE_FAMILY_TERM]" "[INDUSTRY_FAMILY_TERM]" (日常实习 OR 校招 OR 初级) [CITY]
```

### Priority 5: Technical expansion

This preset runs technical expansion only in `/scrape broad`, preserving future
SportsTech/technical extensibility without diluting the normal sports-business
results.

```
"[TECH_ROLE]" "[PREFERRED_INDUSTRY]" (实习 OR 校招 OR 初级) [CITY]
"[TECH_SKILL]" (developer OR engineer OR data OR AI OR hardware) [CITY]
```

### Priority 6: Generic official-company discovery

Do not rely on a fixed famous-company list. Discover employers from broad
results, public hiring programs, campus schedules, associations, incubators,
and industry/company directories, then run:

```
"[DISCOVERED_COMPANY]" (招聘 OR 校招 OR 实习 OR careers OR jobs) "[ROLE_FAMILY]"
site:[VERIFIED_COMPANY_DOMAIN] (招聘 OR internship OR graduate) "[ROLE_FAMILY]"
site:mp.weixin.qq.com "[DISCOVERED_COMPANY]" (招聘 OR 实习 OR 校招)
```

### Priority 7: Seasonal and announcement sweep

```
(暑期实习 OR 寒假实习 OR 春招 OR 秋招 OR 提前批) "[GRADUATION_COHORT]" [CITY]
(招聘公告 OR 实习生招募 OR 管培生计划) "[INDUSTRY]" [CITY]
```

## Location and schedule filters

Apply the preference block to city, remote policy, arrival date, days per week,
and internship duration. Unknown posting values are flagged, not silently
treated as matches. A hard mismatch is excluded only when the user configured
that field as a deal-breaker.

## Language Filter

Your working languages and levels are in CLAUDE.md's Languages table. When filtering scraped results, apply `04-job-evaluation.md`'s Language Gate: a posting requiring a language you haven't declared at all is excluded; a posting requiring a higher level than you declared in a language you do work in is not excluded, flag it clearly instead (see `job-scraper/SKILL.md`'s Step 3 "Quick Fit Assessment" for how the flag surfaces in `/scrape` output). Postings simply *written* in a language you don't work in, that don't require it on the job, are fine.

## Date Filter

Use `recency_days` from the preference block. A future deadline overrides an
older publication date. If neither publication date nor deadline can be
confirmed, include the result only with `date_status: unknown` and lower its
priority/confidence; never present it as fresh.

## Adapting Queries

If the user specifies a focus area, select matching categories and generate 2-3
custom queries without rewriting the saved focus preset. A focused run narrows
that run only. Examples:

- `/scrape 体育品牌 marketing 上海`
- `/scrape 电竞商务 北京`
- `/scrape broad`
- `/scrape health china-job-search`
