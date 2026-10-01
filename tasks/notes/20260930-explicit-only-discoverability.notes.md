# explicit-only discoverability notes

> **Substantive Change SHA256**: `sha256:f888d1b73006b42f92a457120ccbd3368a8c88d744e8c8d1574cff9fd09a41a0`

- Decision: add a `explicit-only` discoverability tier (installed, not model-auto-routed) for `auto-campaign`, `repo-harness-ship`, `obsidian-memory`, because they mutate the repo, push/open PRs, or write an external vault and were only guarded by description wording.
- The manifest is the single source. `disable-model-invocation: true` in `SKILL.md` (Claude) and `agents/openai.yaml` `allow_implicit_invocation: false` (Codex) are projections, guarded by the iff drift test in `tests/skill-surface/catalog.test.ts`. The shared skill tree is copied to both hosts unchanged, so no new copy path.
- Open: Codex may drop explicit-only skills from its injected catalog (openai/codex#19695, not reproduced). `obsidian-memory` description still says "invoked by the model or operator". `evals/skill-routing/discovery-baseline.json` may need regeneration on the next live eval.
