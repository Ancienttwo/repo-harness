# Implementation Notes: agent-fleet-dependency

> **Status**: Active
> **Plan**: plans/plan-20260706-0232-agent-fleet-dependency.md
> **Contract**: tasks/contracts/20260706-0232-agent-fleet-dependency.contract.md
> **Review**: tasks/reviews/20260706-0232-agent-fleet-dependency.review.md
> **Last Updated**: 2026-07-06 02:32
> **Lifecycle**: notes

## Design Decisions

- P1: `fable_agents` inserted into `external_tooling` immediately after `hai_stack`, before `codex_automation_profile`, in all three faces (`.ai/harness/policy.json`, `scripts/ensure-task-workflow.sh` seed +mirror, `scripts/lib/project-init-lib.sh` `pi_write_harness_policy()` seed). Formatting follows each face's existing local convention rather than a uniform style: `.ai/harness/policy.json` uses the expanded (one-array-item-per-line) style already used by `waza`/`hai_stack` there; the two seed heredocs use the compact single-line array style already used by their own `waza`/`hai_stack`/`codex_automation_profile` entries. This matches the pre-existing precedent (the same divergence already exists between policy.json and the seeds for every other key) rather than introducing a new formatting rule.
- P1: confirmed via direct read that `scripts/ensure-task-workflow.sh`'s `external_tooling` block (its own `POLICY_EOF` heredoc, only written when `.ai/harness/policy.json` is absent) and `scripts/lib/project-init-lib.sh`'s `EOF_POLICY` heredoc are textually identical for every existing sub-key (`waza`, `hai_stack`, `codex_automation_profile`, `diagram_design`, `gbrain`, `codegraph`) except `codegraph.install_mode` (which is already environment-specific: `target-aware-mcp` in both seeds vs `self-host-dev-dependency-with-global-mcp-opt-in` in the self-hosted policy.json). `fable_agents` was added with the exact same value in both seed heredocs (`"advisory"`) to preserve that established parity, diverging only in policy.json (`"auto-install-on-init"`), matching the codegraph precedent the plan named.
- P1: no test does a static byte-comparison between the `POLICY_EOF` (ensure-task-workflow.sh) and `EOF_POLICY` (project-init-lib.sh) heredocs directly — that parity is a manual authoring obligation, not machine-enforced. (The `helper-scripts.test.ts:467-468` guard the plan's recon cited is for a *different* heredoc pair — the `CONTRACT_TEMPLATE_EOF`/`EOF_TEMPLATE_CONTRACT` task-contract markdown template — not the policy JSON seed. Verified by direct read before relying on it; the plan's line-number citation for that specific guard does not apply to the policy heredoc.) Actual runtime coverage for the policy heredocs comes from: `tests/create-project-dirs.runtime.test.ts` (exercises `project-init-lib.sh`'s fresh-init path), `tests/migration-script.test.ts` (exercises both the fresh-migrate and preserve-overrides-merge paths, both ultimately sourced from the same `pi_write_harness_policy()` heredoc), and `tests/helper-scripts.test.ts` (multiple invocations of `ensure-task-workflow.sh` against repos with no pre-existing `policy.json`, which trigger its `POLICY_EOF` heredoc and then `JSON.parse` the result — this would fail on any JSON syntax error even though it doesn't assert `fable_agents` values specifically).
- P1: added explicit `fable_agents` field assertions to `tests/create-project-dirs.runtime.test.ts` (fresh-init, expects `install_mode: "advisory"`) and to both relevant blocks of `tests/migration-script.test.ts` (fresh-migrate-no-existing-policy, and preserve-explicit-overrides-while-merging-defaults — both also expect `"advisory"` since neither fixture pre-supplies a competing `fable_agents` override), following the existing per-key assertion convention used for `waza`/`hai_stack`/`codegraph`. This was treated as in-scope because the contract's Scope section explicitly lists these files under "测试扩展" (test extension), not merely "must keep passing".

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Uniform JSON array formatting across all 3 policy faces vs match each face's existing local style | Match each face's existing local style | Every prior external_tooling key (waza/hai_stack/codegraph) already diverges in formatting between policy.json (expanded) and the seed heredocs (compact); introducing a new uniform style for only the new key would make `fable_agents` inconsistent with its siblings within the same file |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
