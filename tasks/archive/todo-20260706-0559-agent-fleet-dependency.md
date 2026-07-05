> **Archived**: 2026-07-06 05:59
> **Related Plan**: plans/archive/plan-20260706-0232-agent-fleet-dependency.md
> **Outcome**: Completed
> **Source Plan**: (none)
> **Parent Run ID**: run-20260706-0559

# Deferred Goal Ledger

> **Status**: Backlog
> **Updated**: 2026-07-06 02:32
> **Scope**: Medium/long-term goals deferred from active plan execution

Current plan tasks live in the active plan's `## Task Breakdown`.
Do not duplicate that execution checklist here. Record only work intentionally deferred beyond this slice, with the tradeoff and revisit trigger.

## Deferred Goals

| Goal | Why Deferred | Tradeoff | Revisit Trigger |
|------|--------------|----------|-----------------|
| Codex re-acceptance of the merged authority-closure **and agent-fleet-dependency** diffs (fingerprint-bound rubric), superseding both reviews' manual overrides | Ship gates used the documented manual-override lane; a fresh cross-vendor pass on the merged tree is the stronger closure (precedent: contract-intent-boundary 2affc9f) | Override lane is honest but weaker than a bound external pass | Next `/codex` review session, or before the next release that ships template/gate surfaces |
| Re-install/relink the global `repo-harness` CLI after merge so the packaged helper runtime includes `install-agent-fleet.sh` | Frozen global copy (0.8.5, installed pre-branch) predates the new helper; no in-repo fix exists | `repo-harness run check-task-workflow --strict` stays red at the packaged-helper check until refresh | Right after merging agent-fleet-dependency, or next npm publish |
| Interactive `codex` `/agent` check confirming the three `.codex/agents/*.toml` load on cli 0.141.0 | No automatable introspection surface on this codex-cli version (C2 smoke inconclusive, not failing) | Fleet TOMLs are schema-valid but end-to-end recognition unproven | First interactive Codex session in this repo |
