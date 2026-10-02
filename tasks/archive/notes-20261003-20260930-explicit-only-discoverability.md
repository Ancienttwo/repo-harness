> **Archived**: 2026-10-03
> **Related Plan**: (none; completed local commit landing)
> **Outcome**: Completed
> **Lifecycle**: notes

# explicit-only discoverability notes

> **Substantive Change SHA256**: `sha256:c6d379de3554d3d8dda18e8f4a0795c432c051c87ca62cbda3c19e4a12c4132c`

- Decision: add a `explicit-only` discoverability tier (installed, not model-auto-routed) for `auto-campaign`, `repo-harness-ship`, `obsidian-memory`, because they mutate the repo, push/open PRs, or write an external vault and were only guarded by description wording.
- The manifest is the single source. `disable-model-invocation: true` in `SKILL.md` (Claude) and `agents/openai.yaml` `allow_implicit_invocation: false` (Codex) are projections, guarded by the iff drift test in `tests/skill-surface/catalog.test.ts`. The shared skill tree is copied to both hosts unchanged, so no new copy path.
- Open: Codex may drop explicit-only skills from its injected catalog (openai/codex#19695, not reproduced). `obsidian-memory` description still says "invoked by the model or operator". `evals/skill-routing/discovery-baseline.json` may need regeneration on the next live eval.

## Local landing review (2026-10-03)

- P1: the manifest owns discoverability; the catalog validates the vocabulary and selects installed facades by kind/profile. Host-native policy files are checked-in projections, with the existing catalog suite enforcing parity.
- P2: manifest package -> catalog validation -> `computeFacadesForProfile` -> existing runtime skill installation. The new tier leaves installation selection unchanged; Claude and Codex consume their native invocation switches. No new installer/parser/runtime authority is added.
- P3: integrate the completed local commits against current main, retaining its newer archctx 0.6.1 clean-room readback and architecture projection when old generated evidence conflicts. The superseded 0.6.0 observation remains in commit history.
- Verification: `bun test tests/skill-surface --timeout 60000` passed 123 tests across seven files. Governance typecheck, state boundaries, hook/helper/reference projections and architecture checks passed; the first task-sync run required updating the substantive digest to the actual integrated subject. The bound task-sync, strict workflow, repository inspection and source-checkout init dry-run then passed; all nine root integrity checks are satisfied.
- Landing scope: the independent release preflight is historical preparation evidence, not publication authorization. Draft PRs #473, #474 and #476 and active/dirty worktrees remain outside this closeout.
