import re
import unittest
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
AGENT_SKILLS = REPO / ".agents" / "skills"
SCRAPER = REPO / ".claude" / "skills" / "job-scraper" / "SKILL.md"
SEARCH_QUERIES = REPO / ".claude" / "skills" / "job-scraper" / "search-queries.md"


class CodexThinPointerSpec(unittest.TestCase):
    POINTERS = {
        "setup": ".claude/commands/setup.md",
        "scrape": ".claude/skills/job-scraper/SKILL.md",
        "rank": ".claude/commands/rank.md",
        "apply": ".claude/commands/apply.md",
        "upskill": ".claude/skills/upskill/SKILL.md",
        "interview": ".claude/commands/interview.md",
        "outcome": ".claude/commands/outcome.md",
    }

    def test_codex_guide_exists(self):
        guide = (REPO / "CODEX.md").read_text(encoding="utf-8")
        for name in self.POINTERS:
            self.assertIn(f"${name}", guide)

    def test_all_workflow_pointers_are_thin_and_resolve(self):
        for name, canonical in self.POINTERS.items():
            with self.subTest(name=name):
                path = AGENT_SKILLS / name / "SKILL.md"
                text = path.read_text(encoding="utf-8")
                self.assertIn("kind: workflow", text)
                self.assertIn(f"canonical: {canonical}", text)
                self.assertTrue((REPO / canonical).is_file())
                self.assertLessEqual(len(text.splitlines()), 20)

    def test_scraper_discriminates_sources_from_workflows(self):
        text = SCRAPER.read_text(encoding="utf-8")
        self.assertIn("`kind: job-source`", text)
        self.assertIn("`kind: workflow`", text)
        self.assertIn("Never execute them as", text)


class ChinaSearchSourceSpec(unittest.TestCase):
    def setUp(self):
        self.source = (AGENT_SKILLS / "china-job-search" / "SKILL.md").read_text(
            encoding="utf-8"
        )

    def test_source_metadata_and_access_boundary(self):
        self.assertIn("kind: job-source", self.source)
        self.assertIn("execution: web-search", self.source)
        self.assertIn("market: CN", self.source)
        for boundary in ("login", "CAPTCHA", "mini-program", "Never reverse-engineer"):
            self.assertIn(boundary, self.source)

    def test_source_covers_official_platform_announcement_and_company_discovery(self):
        for marker in (
            "Tier A",
            "Tier B",
            "Tier C",
            "Generic company-career discovery",
            "job.mohrss.gov.cn",
            "ncss.cn",
            "mp.weixin.qq.com",
            "实习僧",
            "牛客",
        ):
            self.assertIn(marker, self.source)

    def test_broad_non_technical_and_technical_scope(self):
        for role in ("商务", "市场", "运营", "产品", "战略", "客户成功", "技术扩展"):
            self.assertIn(role, self.source)
        for industry in ("AI", "消费品牌", "体育", "汽车", "新能源", "金融科技", "创业公司"):
            self.assertIn(industry, self.source)


class JobRecordAndPreferenceSpec(unittest.TestCase):
    def test_requested_china_fields_are_canonical(self):
        text = SCRAPER.read_text(encoding="utf-8")
        for field in (
            "city",
            "arrival_date",
            "days_per_week",
            "internship_duration_months",
            "season_eligibility",
            "remote_policy",
            "education",
            "year_of_study",
            "graduation_cohort",
            "deadline",
            "salary_daily_cny",
            "salary_monthly_cny",
            "conversion_opportunity",
            "role_family",
            "industry",
            "company_size",
            "source_confidence",
        ):
            self.assertRegex(text, rf'"{re.escape(field)}"')

    def test_dedupe_trust_expiry_and_priority_are_explicit(self):
        text = SCRAPER.read_text(encoding="utf-8")
        for marker in (
            "Cross-source deduplication",
            "Source confidence",
            "Expiry",
            "Search priority (0-100)",
            "snippet_only",
            "manual_review_required",
        ):
            self.assertIn(marker, text)

    def test_preference_profile_uses_sports_business_v1_and_tracks_constraints(self):
        text = SEARCH_QUERIES.read_text(encoding="utf-8")
        self.assertIn("focus_preset: sports_business_v1", text)
        self.assertIn("broad_search: false", text)
        for role in (
            "体育商务",
            "体育营销",
            "赛事商务",
            '"赞助 / Partnership"',
            "电竞商务",
            "体育平台商业运营",
            "体育品牌 Marketing",
            "SportsTech 产品运营",
        ):
            self.assertIn(role, text)
        for field in (
            "job_cycles",
            "primary_role_families",
            "adjacent_role_families",
            "company_sizes",
            "earliest_start",
            "days_per_week_min",
            "internship_months_min",
            "education_levels",
            "graduation_cohorts",
            "daily_min_cny",
            "monthly_min_cny",
            "conversion_opportunity",
        ):
            self.assertIn(field, text)


if __name__ == "__main__":
    unittest.main()
