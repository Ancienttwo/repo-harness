> **Archived**: 2026-07-24 03:08
> **Related Plan**: plans/archive/plan-20260724-0300-provider-subprocess-isolation.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260724-0308

# Implementation Notes: provider-subprocess-isolation

> **Status**: Active
> **Plan**: plans/plan-20260724-0300-provider-subprocess-isolation.md
> **Contract**: tasks/contracts/20260724-0300-provider-subprocess-isolation.contract.md
> **Review**: tasks/reviews/20260724-0300-provider-subprocess-isolation.review.md
> **Last Updated**: 2026-07-24 03:00
> **Lifecycle**: notes

## Design Decisions

- P1: the routing evaluator's authority boundary is the per-case workspace
  assembled by `materializeDiscoveredSurface`; the Claude subprocess is the
  only boundary that can decide which project/user skill registries enter the
  measured subject. The verify-context row belongs to the separate bounded
  verifier/installer path and was treated as a closure audit, not a second fix.
- P2: `runProviderEval` creates `.claude/skills` symlinks, then
  `createProcessProvider` invokes `claude -p` from that case directory. Without
  a setting-source restriction, `system.init.skills` contained the operator's
  unrelated user skills. With `--setting-sources project`, the same authenticated
  CLI exposed `repo-harness-plan` plus Claude built-ins only and emitted a real
  `Skill(repo-harness-plan)` tool use.
- P3: add Claude's official project-only source selector to the existing command
  rather than inventing `HOME`/`CLAUDE_CONFIG_DIR` cloning or auth-token handling.
  This preserves default OAuth, makes the projected project surface authoritative,
  and leaves the Codex provider unchanged.
- The verify-context failure is already explained by commit `8763ad5d`: an
  inherited `REPO_HARNESS_HELPER_SOURCE_PATH` named `verify-sprint.sh`, so the
  nested fleet installer resolved the wrong package root. The existing basename
  guard and regression test own that fix; today's exact bounded replay proves the
  deferred row is stale.

## Deviations From Plan Or Spec

- The frozen 136-invocation Phase B matrix was not rerun. Its evidence remains
  intentionally invalid; this package repairs the apparatus and proves one live
  invocation, not routing-quality thresholds.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Isolated `CLAUDE_CONFIG_DIR` per case | Reject | It cleans the registry but also disconnects the operator's OAuth Keychain identity; the probe failed before a provider call. |
| `--setting-sources project` | Use | Official CLI boundary; removes user settings/skills while preserving authenticated provider access. |
| Copy or expose OAuth tokens into case config | Reject | Secret handling is outside the evaluator contract and unnecessary. |
| Rerun all 136 provider calls | Reject | Expensive and not required to prove the mechanism; quality measurement is a separate future run decision. |

## Open Questions

- Routing-quality thresholds remain unmeasured by valid real-provider evidence.
  A future operator may open a fresh eval run after reviewing cost; this package
  does not claim those thresholds pass.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix regression guard: `.ai/harness/runs/20260724-0300-provider-subprocess-isolation/pre-fix.log`
- Live project-source probe: `.ai/harness/runs/20260724-0300-provider-subprocess-isolation/live-project-source-probe.jsonl`
- Bounded helper/fleet replay: `.ai/harness/runs/20260724-0300-provider-subprocess-isolation/helper-bounded.log` and `fleet-bounded.log`

## Sibling Sweep

- `run-harness-profile-benchmark.ts` already pairs a project-only setting source
  with its harness arm and uses a disposable HOME; no same bug.
- `cross-review-runner.ts` explicitly passes `--disable-slash-commands`, so user
  skills cannot enter its review subject; no same bug.
- `run-skill-evals.ts` also disables slash commands and uses a distinct prompt/
  fixture injection contract; no same bug.
- Only `run-skill-routing-eval.ts` both measures Skill routing and previously
  allowed the default user setting source, so 1 same-shape site was found and fixed.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
