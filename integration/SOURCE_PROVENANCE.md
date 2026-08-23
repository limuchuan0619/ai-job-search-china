# Source provenance

## career-ops system base

- Repository: `https://github.com/santifer/career-ops`
- Branch: `main`
- Commit inspected and cloned: `cc841f4e92928f3cb2e096e7ace92d2bff57177f`
- Version at integration time: `1.28.0`
- License: MIT
- Role in this project: system engine, canonical modes, state tracking, interview workflow, output generation, tests and updater.

## ai-job-search-private capability source

- Private repository: `https://github.com/limuchuan0619/ai-job-search-private`
- Verified local/public-safe baseline commit: `2b74c1dc26ea0880d092d98c1ac8a6a3818a19a1`
- Original upstream family: `https://github.com/MadsLorentzen/ai-job-search`
- License in the inspected source: MIT
- Role in this project: capability requirements and the adapted China public-source strategy.

The private repository was not merged wholesale. Its current GitHub credential was unavailable during integration, so the source was verified against the retained local checkout at the exact published baseline commit. No resume, contact details, candidate profile or other personal files were copied.

## Integration policy

- Career-ops files remain the canonical implementation for scoring, generation and lifecycle state.
- Canonical local skills are stored under the protected `integration/skills/` layer.
- `.agents/skills/ai-career-agent/` and `.agents/skills/china-job-search/` are thin Codex discovery pointers only.
- `integration/install-pointers.mjs` restores those discovery pointers from protected templates on each Windows launcher start.
- Canonical local additions are protected through `config/local-paths.txt`; `.agents/skills/` thin pointers are intentionally not protected inside the upstream-owned `.agents/` tree and are rebuilt by the launcher after updates.
