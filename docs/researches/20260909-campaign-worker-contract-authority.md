# Contract authority across campaign acquisition

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

The plan proof created by canonical coordination is the authority for contract content. Fleet acquisition creates the execution worktree and invokes the packaged plan-to-todo helper. That projection must initialize missing contracts only: replacing an existing contract invalidates the admission proof and destroys authored instructions. Incomplete existing contracts remain incomplete and are rejected by the unchanged contract-run brief preflight.

Campaign workers consume `acquired.envelope.plan.contract_sha256`, removing only its `sha256:` representation prefix for file comparisons and launch requests. New handoffs no longer store a duplicate digest. They do not derive a competing value from projected worktree content. Bind-time file validation remains mandatory and rejects drift against that proof-bound value.

The same helper is shipped at `scripts/plan-to-todo.sh` and `assets/templates/helpers/plan-to-todo.sh`; helper synchronization validates this projection. Scope carry-forward runs only during missing-contract initialization so it cannot modify an already admitted contract on replay.

## Verification boundary

The package-only fleet CLI regression exercises real acquire and packaged projection, authored-byte preservation and brief preflight; it also verifies missing-contract initialization, template rejection and repeated projection. The worker unit regression isolates handoff persistence after the separate live-admission gate using the historical fixture, while existing tests retain real refusal, drift and replay checks. Neither fixture is evidence of a successful live campaign.

## Existing dispatches

Planning handoffs are immutable. Changing the writer does not rewrite an old dispatch that already stored the wrong digest. Bind and launch now consume the existing envelope plan proof directly, so obsolete extra digest fields in historical records cannot grant or deny content authority. Records remain byte-identical; any already-recorded launch with different request bytes still fails the unchanged replay check. Directly editing its store would destroy evidence. Successor replacement eligibility and budget authority remain unchanged by this fix.
