> **Archived**: 2026-07-11 20:33
> **Related Plan**: plans/archive/plan-20260711-1401-mcp-rollout-cutover-v1.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260711-2033

# Task Review: mcp-rollout-cutover-v1

> **Status**: Done
> **Plan**: plans/plan-20260711-1401-mcp-rollout-cutover-v1.md
> **Contract**: tasks/contracts/20260711-1401-mcp-rollout-cutover-v1.contract.md
> **Notes File**: tasks/notes/20260711-1401-mcp-rollout-cutover-v1.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-11 20:25 +0800
> **Recommendation**: pass
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: sha256:43a618e43090c9e184b431749655c40a518f940080b68749fc8a21250c6e2c60
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass; no unresolved P0/P1/P2 finding.
- Change type: code-change
- Intended files changed: the B1 policy, MCP runtime/tool/authority,
  setup/reference/runbook, regression, and workflow artifacts enumerated by
  the contract.
- Actual files changed: only the intended B1 paths; the temporary rollout gate
  and test were deleted, while the registry authority module was added to the
  contract before its required hardening edit.
- Commands passed: 75 focused MCP tests; full repository suite (1126 pass, 1
  platform skip, 0 fail); deploy SQL order, architecture sync, task sync,
  project-state inspection, self-migration dry-run, and `git diff --check`.
- External acceptance: manual_override. Independent Codex architecture and
  security reviewers re-reviewed the final diff after the two authority
  hardening fixes; the current workflow policy requires a Claude peer, which
  is unavailable in this runtime.
- Residual risks: the public MCP break removes rollout flags and requires
  callers of `search_text` to provide a registered `repo_id`; no hosted
  rollout, registry migration, or release publication is included here.
- Reviewer action required: none.
- Rollback: revert the bounded branch commit; no external runtime, registry,
  database, or published-package rollback is required.

## Mode Evidence

- Selected route: one isolated, breaking MCP contract cutover with independent
  read-only architecture and security review.
- P1/P2/P3 evidence: policy/config assembly -> tool discovery/dispatch ->
  registry/path/ignore/mutation authority -> consumer documentation. The
  retired rollout object was the pressure point because it independently
  changed discovery, read visibility, write authorization, and fallback
  routing. Removing it leaves `workspaceReader` as the capability gate,
  registry `accessMode` as the mutation gate, and guarded filesystem access as
  the visible-content gate.
- Root cause or plan evidence: the captured B1 plan and task contract define
  the single-authority cutover and explicitly exclude B2 and release work.

## Verification Evidence

- Waza `/check` run: Deep review completed; architecture and security passes
  found two concrete authority issues, both corrected and re-reviewed.
- Commands run: focused MCP suite (75 pass / 0 fail); `bun test --parallel=4
  --no-orphans` (1126 pass / 1 skip / 0 fail / 11,437 assertions / 97 files);
  deploy SQL order, architecture sync, task sync, project-state inspection,
  self-migration dry-run, and `git diff --check`.
- Manual checks: confirmed unregistered explicit roots expose no general
  `repo_id`, registry-scoped `read_file` rejects them, malformed local config
  fails closed, and active docs use the current tool schemas.
- Supporting artifacts: current contract, notes, check cache, and ignored run
  snapshots in `.ai/harness/`.
- Implementation notes reviewed: yes.
- Run snapshot: local `.ai/harness/runs/` evidence cache.

## External Acceptance Advice

> **External Acceptance**: manual_override
> **External Reviewer**: Mendel (architecture) and Huygens (security)
> **External Source**: independent Codex subagent review plus local verification
> **External Started**: 2026-07-11 14:20 +0800
> **External Completed**: 2026-07-11 15:10 +0800
> **Reviewed Diff Fingerprint**: sha256:43a618e43090c9e184b431749655c40a518f940080b68749fc8a21250c6e2c60
> **Reviewed Scope**: branch+staged+unstaged+untracked

- P1 blockers: none. The original P1—promoting `allowedRoots` into General
  Repo records and thereby exposing unregistered sensitive files—was fixed by
  enumerating only adopted registered records.
- P2 advisories: none. The original P2—treating malformed local MCP config as
  absent and silently falling back to the default profile—now throws before
  policy construction; the setup/reference schema examples were also corrected.
- Manual Override: a Claude peer reviewer is unavailable in this runtime. Two
  independent read-only Codex reviewers found and then verified fixes for the
  only P1/P2 findings; focused and complete repository suites, contract
  verification, and required repository gates pass.
- Acceptance checklist: pass under the recorded manual override. Tool discovery is deterministic for an enabled
  reader, identity and writes resolve only through the registry, visible
  unindexed reads remain path/ignore guarded, and no retired rollout control
  remains in active surfaces.

## Behavior Diff Notes

- The six-field rollout object, environment overrides, capability rollout
  response, temporary gate, and rollout documentation are removed rather than
  defaulted on.
- General-repo tool definitions are deterministic for `workspaceReader`; write
  calls retain their schemas but fail closed at call time unless the registered
  repo has `accessMode: read_write`.
- `search_text` has one General Repo contract requiring `repo_id`; the
  workspace fallback and workflow-to-general bridge are gone. Direct workspace
  and workflow reads remain separate, named bounded operations.
- CodeGraph remains advisory metadata; the existing guarded filesystem route
  serves visible unindexed content without bypassing containment or ignore
  checks.

## Residual Risks / Follow-ups

- Intentional public MCP breaking change: clients must stop sending rollout
  fields and must supply a registered `repo_id` to `search_text`. This branch
  does not perform release publication or hosted-client migration.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Deterministic discovery, registry-only identity/write authority, and unindexed guarded reads have focused and full-suite coverage. |
| Product depth | 8/10 | Setup/reference/runbook explain the breaking contract and operational diagnosis; hosted-client migration is correctly out of scope. |
| Design quality | 9/10 | One authority per decision; no aliases, default-on switches, or hidden fallback routes remain. |
| Code quality | 9/10 | Tight deletions, explicit guards, and reviewer-driven regression tests preserve existing path, ignore, and revision invariants. |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test tests/cli/mcp-stdio.test.ts tests/cli/mcp.test.ts tests/cli/mcp-reader-tools.test.ts tests/cli/mcp-setup.test.ts tests/cli/mcp-tools.test.ts tests/cli/mcp-policy.test.ts tests/cli/mcp-http.test.ts`
- Re-check: `bun test --parallel=4 --no-orphans` plus the repository required
  gates recorded in the task contract.

## Summary

- PASS. B1 removes the temporary rollout control plane in one coherent breaking
  cutover. The final design has one capability gate, one registry identity and
  mutation authority, and one guarded content path; independent re-review and
  regression coverage found no remaining release-blocking issue.
