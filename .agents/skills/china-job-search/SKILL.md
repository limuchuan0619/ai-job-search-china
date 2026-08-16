---
name: china-job-search
version: 1.0.0
description: >
  Search broadly for jobs and internships in mainland China across public
  employment services, official company career and campus pages, publicly
  indexed recruitment platforms, university career centers, and recruitment
  announcements. Covers 日常实习, 暑期实习, 寒假实习, 校招, 春招, 秋招, 管培生,
  应届生, 初级社招, and early-career roles across business and technical functions.
  Triggers on 中国求职, 找实习, 校园招聘, 社招, 招聘公告, 公司官网招聘, China jobs,
  internships in China, graduate jobs China, /scrape China, $scrape China.
kind: job-source
execution: web-search
market: CN
enabled: true
allowed-tools: WebSearch, WebFetch, Read
---

# China multi-source job search

This is a source strategy consumed by the canonical scrape workflow in
`.claude/skills/job-scraper/SKILL.md`. That workflow owns the record schema,
deduplication, expiry checks, trust labels, filtering, and priority score. This
file owns only China-specific source selection, query construction, and access
boundaries.

The strategy is intentionally broad. It is not limited to a fixed company list,
a few large technology firms, or one industry. Generate searches from the
candidate's configured role families, industries, cities, availability, and
graduation cohort in `search-queries.md`.

## Access policy

1. Use public pages and ordinary search-engine discovery only.
2. Prefer an employer's official career page or an official public-employment
   source over a repost or discussion thread.
3. Before direct automated fetching on an unfamiliar host, follow the
   robots/terms gate in
   `.claude/skills/job-application-assistant/09-web-research.md`.
4. Never bypass login, CAPTCHA, app-only flows, rate limits, or interactive
   verification. Never reverse-engineer private APIs or automate chat/apply.
5. A search-result snippet is a lead, not a verified posting. Preserve its
   source URL and label it `snippet_only` until the details are confirmed.
6. Keep request volume low. Search by query family and pre-filter snippets
   before opening detail pages.

## Source tiers

### Tier A - primary and authoritative

Use these first. A live, matching detail page in this tier normally receives a
`source_confidence` of `high`.

- Employer-owned career, campus, graduate, internship, or recruitment pages on
  the employer's verified domain.
- Public employment services, including the China Public Recruitment site
  (`job.mohrss.gov.cn`), the National College Student Employment Service
  Platform (`ncss.cn` and its official subdomains), 12333 employment services,
  and provincial or municipal human-resources and social-security sites.
- Central/local government, public-institution, state-owned-enterprise, and
  university career-center announcements on their official domains.
- An employer's verified public recruitment announcement whose publisher and
  application destination can be tied back to the employer.

### Tier B - public job-platform pages

Use public, indexable search/detail pages from LinkedIn Jobs, 实习僧, 牛客,
智联招聘, 前程无忧, 猎聘, 拉勾, BOSS直聘, and comparable platforms when
accessible. These are discovery sources, not permission to crawl.

- Prefer search-engine `site:` discovery when the platform is login-gated,
  app-first, CAPTCHA-protected, or unstable under direct fetch.
- Open a detail page only if it is publicly reachable without bypassing a
  control. Stop on login/CAPTCHA/app walls.
- If the platform redirects to an employer application page, use the employer
  page as `canonical_url` and retain the platform page under `source_urls`.
- A public platform detail page with a named employer and usable application
  route is normally `medium` confidence until corroborated; anonymous recruiter
  posts or incomplete snippets are `low`.

### Tier C - announcements and communities

Use official-account articles indexed at `mp.weixin.qq.com`, employer posts,
university employment-office notices, industry associations, incubators,
accelerators, and reputable recruitment roundups to discover opportunities that
never reach a traditional job board.

- Query both the announcement channel and the employer/role terms.
- Capture publisher, publication date, named employer, application method,
  stated deadline, and any linked official destination.
- If a WeChat article or mini-program requires a signed-in/interactive session,
  do not automate it. Keep the indexed result as `snippet_only` and ask the user
  to open it or paste the JD.
- Reposts without an official destination remain `low` confidence even when the
  text looks complete.

## Broad query construction

Build queries from combinations, not from a fixed employer allowlist:

```
<role term> + <job cycle term> + <city/region> + <industry term>
<industry term> + <job cycle term> + <graduation cohort>
<company name discovered in results> + (招聘 OR 校招 OR 实习 OR careers)
site:<verified company domain> (<role term>) (招聘 OR internship OR graduate)
site:mp.weixin.qq.com (<role term>) (招聘 OR 实习 OR 校招) <city>
site:job.mohrss.gov.cn <role term> <city>
site:ncss.cn <role term> <city>
site:nowcoder.com/jobs <role term> (日常实习 OR 暑期实习 OR 校招)
site:shixiseng.com <role term> <city>
```

### Job-cycle terms

Always cover the cycles allowed by the preference profile:

- 日常实习, 暑期实习, 寒假实习, off-cycle internship
- 校招, 春招, 秋招, 提前批, 应届生, graduate program, 管培生
- 社招, 初级, 助理, 专员, coordinator, associate, 0-3年, 经验不限

### Role families

Use the configured role families first. For broad mode, expand across both
Chinese and common English title variants:

- 商务, 商业化, BD, 销售, 渠道, 大客户, 合作伙伴, 生态合作, 客户成功
- 市场, 品牌, 整合营销, 增长, 用户增长, 公关, 媒介, 活动, 赛事
- 运营, 产品运营, 内容运营, 用户运营, 社区, 电商, 出海, 海外运营
- 产品, 产品助理, 项目, 项目管理, PMO, 用户研究, 战略, 商业分析
- 内容, 编辑, 策划, 制片, 发行, 创作者运营, 文娱, 传媒
- 咨询, 行业研究, 战略研究, 投资研究, 数据分析, 管培生
- 技术扩展：软件, 数据, AI/算法, 测试, 硬件, 供应链, 解决方案

Never require a role to be technical. Never exclude technical roles when the
candidate opts into them.

### Industry families

Broad mode rotates through configured industries plus adjacent sectors:

- 互联网, AI, 软件/SaaS, 云计算, 科技硬件, 半导体
- 消费品牌, 快消, 零售, 电商, 本地生活
- 汽车, 新能源, 智能制造, 机器人, 供应链
- 金融, 金融科技, 支付, 保险, 证券, 咨询, 专业服务
- 体育, 电竞, 游戏, 文娱, 传媒, 广告, 内容平台
- 教育, 医疗健康, 生物科技, 气候科技, 出海业务
- 创业公司, 成长型企业, 国企/央企, 事业单位, 社会组织

Treat this list as coverage prompts, not a hard limit. Add sectors inferred from
the candidate's transferable skills and remove only those the user explicitly
excludes.

## Generic company-career discovery

Do not hardcode only famous companies. For each configured industry/city pair:

1. Discover employer names from public-employment results, industry lists,
   campus schedules, credible funding/accelerator portfolios, associations, and
   the first page of broad job-platform results.
2. For each promising employer, search its exact name with `招聘`, `校招`,
   `实习`, `career`, `jobs`, and the target role family.
3. Identify the verified employer domain. Search that domain for career pages
   and common public ATS-hosted pages. Do not assume the first similarly named
   domain is official.
4. Prefer the role-specific official detail page. A general careers landing
   page is not a job record unless it exposes a stable role ID or leads to the
   specific posting.
5. Record the company regardless of size: startup, SME, growth company, listed
   company, multinational, state-owned enterprise, public institution, and
   nonprofit are all in scope unless excluded by preferences.

## Detail extraction for China postings

In addition to title, company, URL, description, and publication date, extract
the canonical China-search fields defined by the scrape workflow:

- city/region and workplace detail
- arrival date or earliest start date
- required days per week
- internship duration
- summer/winter/off-cycle eligibility
- remote/hybrid/on-site policy
- education level, graduation cohort, and year-of-study constraints
- application deadline
- daily/monthly salary and benefits when stated
- conversion/return-offer opportunity
- job cycle, role family, industry, company size/stage
- source publisher, source tier, evidence status, and application route

Use `unknown`, never an invented value, when the posting omits a field.

## Fallback behavior

- **Direct page works:** extract it and preserve the canonical URL.
- **Search result exists but direct fetch fails:** keep the result only as a
  `snippet_only` lead, lower confidence, and mark `manual_review_required`.
- **Login/CAPTCHA/app/mini-program wall:** stop automation; provide the search
  URL and ask the user to open it or paste the JD.
- **Announcement contains an email/QR code only:** do not send or scan anything;
  preserve the announcement and ask the user to verify/apply manually.
- **No accessible details:** do not create a high-confidence job record and do
  not guess dates, salary, or application instructions.
