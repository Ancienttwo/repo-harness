# CodeGraph Post-Fix GPT Review Request

Updated: 2026-06-24T02:04:12+0800
Status: ready for GPT/non-implementer review, not signed off
Scope: repo-harness CodeGraph sprint REQUEST_CHANGES closure after post-merge remediation

## Boundary

This artifact requests an external GPT/non-implementer review of the latest
`main` state. It is not an approval and not a release signoff.

Review target:

- Repository: `Ancienttwo/repo-harness`
- Branch: `main`
- Exact head: `b7ba8377602bd712989fcbacd1e80d729f9c9389`
- Hosted CI: `https://github.com/Ancienttwo/repo-harness/actions/runs/28046022559`
- CI result: success; `Test` plus Ubuntu/macOS/Windows MCP path matrix passed

## Ready-To-Paste Review Prompt

```text
You are reviewing repo-harness as a non-implementer reviewer.

Task: Re-review the CodeGraph sprint REQUEST_CHANGES closure on the exact current head:

- Repo: Ancienttwo/repo-harness
- Branch/head: main @ b7ba8377602bd712989fcbacd1e80d729f9c9389
- CI run: https://github.com/Ancienttwo/repo-harness/actions/runs/28046022559
- Prior review verdict: REQUEST_CHANGES
- Prior review order: #18@9a1ce34 -> #19@772f7a6 -> #33@68e6b37 -> #34@8e99492 -> #35@5abd9b9

Do not trust the implementer summary. Inspect the current repo state, the listed commits, tests, and CI evidence. Decide whether the previous blockers are closed on b7ba837, and whether any new blocker was introduced.

Original findings to verify:

1. P1-1: #34 mutation lock root could escape via repo-local symlink.
   Expected fix commit: c05d268 Harden MCP mutation lock root.
   Primary files: src/cli/mcp/general-repo-access.ts, tests/cli/mcp-reader-tools.test.ts.
   Verify: mutation locks are rooted under trusted REPO_HARNESS_HOME/mcp/mutation-locks/<repo_id>, not under repo-local .ai/harness/mcp/locks; lock root rejects symlink/untrusted containment; release does not recursively remove through untrusted ancestors.

2. P1-2: move_path no-overwrite commit used link + unlink, leaving two observable commit points.
   Expected fix commits: 2506de6 Harden move path atomic commit; 2feb0a1 Fix move path contract test on Windows.
   Primary files: src/cli/mcp/general-repo-access.ts, tests/cli/mcp-reader-tools.test.ts.
   Verify: commitMoveNoOverwrite uses platform no-replace rename semantics or equivalent contract-safe native path, not hard-link then unlink; tests cover no-overwrite race/contract including Windows-safe assertion.

3. P1-3: snapshot validation did not include .ignore policy revision.
   Expected fix commit: 3fcda72 Harden snapshot ignore policy revision.
   Primary files: src/cli/mcp/general-repo-access.ts, tests/cli/mcp-reader-tools.test.ts.
   Verify: snapshot validation safely rereads .ignore, compares digest and file identity, retries or fails stale when .ignore changes without other tree metadata changes; tests cover .ignore-only race.

4. P1-4: release gate evidence did not bind to exact PR/head/CI provenance and lacked canary provenance.
   Expected fix commit: c75273d Harden MCP rollout gate provenance.
   Primary files: scripts/mcp-rollout-gate.ts, tests/mcp-rollout-gate.test.ts, docs/reference-configs/general-repo-mcp.md, deploy/release-checklists/260623-repo-harness-codegraph-general-repo.md.
   Verify: rollout gate artifact binds base/head SHA, dirty state, PR/CI/run provenance, generated_at, and artifact digest; tests fail closed when dirty or missing PR CI provenance. Also check whether canary observation limits are documented honestly rather than self-signing release gates.

5. P1-5: #35 mixed hook-latency commits into the CodeGraph S4 rollout.
   Expected fix commit: 1b87fbf Split hook latency changes from S4 rollout.
   Primary files: .ai/hooks/*, assets/hooks/*, src/cli/hook/runtime.ts, tests/cli/hook.test.ts, tests/hook-runtime.test.ts, tasks/notes/20260622-repo-harness-codegraph.notes.md.
   Verify: executable hook-latency deltas from 2d16229/53d4353 were removed from the CodeGraph rollout line without reverting S4 MCP fixes; notes record post-merge split remediation; future hook latency work remains a separate review boundary.

6. P2-1: directory mutation locks had no safe stale recovery after a killed process.
   Expected fix commit: b7ba837 Recover stale MCP mutation locks.
   Primary files: src/cli/mcp/general-repo-access.ts, tests/cli/mcp-reader-tools.test.ts.
   Verify: reclaim only occurs when owner.json repo_id/path match and recorded PID is not live; live owner, malformed owner, missing owner, or mismatched repo/path remain fail-closed; reclaim uses atomic rename to a unique sibling before deletion and retries mkdir; release removes only locks with matching owner token. Do not accept time-only deletion.

Local evidence already run by implementer:

- bun test: 990 pass, 1 skip, 0 fail, 10424 expects.
- bun test tests/cli/mcp-reader-tools.test.ts: 22 pass, 0 fail.
- bun run check:type: pass.
- bash scripts/check-task-sync.sh: pass.
- bash scripts/check-task-workflow.sh --strict: pass.
- bash scripts/check-deploy-sql-order.sh: pass.
- bash scripts/check-architecture-sync.sh: pass.
- bun scripts/inspect-project-state.ts --repo . --format text: no drift signals.
- bash scripts/migrate-project-template.sh --repo . --dry-run: pass.
- git diff --check: pass.
- Hosted CI run 28046022559: success on b7ba837.

Required output format:

Verdict: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES | BLOCKED

Reviewed head:
- Commit:
- CI run:

Closure matrix:
- P1-1: CLOSED | OPEN | UNCLEAR, evidence:
- P1-2: CLOSED | OPEN | UNCLEAR, evidence:
- P1-3: CLOSED | OPEN | UNCLEAR, evidence:
- P1-4: CLOSED | OPEN | UNCLEAR, evidence:
- P1-5: CLOSED | OPEN | UNCLEAR, evidence:
- P2-1: CLOSED | OPEN | UNCLEAR, evidence:

Findings:
- List only actionable blockers or material risks, with file/path/line references.

Residual risks / signoff gaps:
- Distinguish code correctness, release signoff, security signoff, and canary/release-readiness. Do not treat green CI as human signoff.

If REQUEST_CHANGES:
- Provide exact minimal changes required before approval.
```

## Reviewer Notes

- The review must bind to `b7ba8377602bd712989fcbacd1e80d729f9c9389`, not an
  earlier green CI run.
- The expected outcome may still be `APPROVE_WITH_NOTES` if all code blockers
  are closed but human release/security/canary signoff remains outside this code
  review.
- Do not ask ChatGPT to write source files through MCP for this step. The output
  should be a review verdict and findings only.
