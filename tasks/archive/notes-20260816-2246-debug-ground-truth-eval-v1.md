> **Archived**: 2026-08-16 22:46
> **Related Plan**: plans/archive/plan-20260816-1753-debug-ground-truth-eval-v1.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260816-2246

# Implementation Notes: debug-ground-truth-eval-v1

> **Status**: Active
> **Plan**: plans/plan-20260816-1753-debug-ground-truth-eval-v1.md
> **Contract**: tasks/contracts/20260816-1753-debug-ground-truth-eval-v1.contract.md
> **Review**: tasks/reviews/20260816-1753-debug-ground-truth-eval-v1.review.md
> **Last Updated**: 2026-08-16 20:28
> **Lifecycle**: notes

## Design Decisions

- The trusted in-process seam is assigned only a copied fixture, public scenario, and typed-response prompt. Those inputs contain no host root, truth path, oracle command, or expected diagnosis. Because the callback shares the Bun process, this is API/workspace separation rather than an untrusted-code sandbox.
- Fresh replay copies the original fixture after provider execution. The host grader therefore ignores provider-owned source and test mutations.
- Replay commands are deliberately constrained to `bun test <relative>.test.ts`; v1 does not execute arbitrary hidden-truth shell commands or hostile code.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Extend `run-skill-evals.ts` | Reject | Its provider path exposes the source checkout and bypasses the isolation boundary required for this profile. |
| Copy the upstream security runtime | Reject | ASAN, Docker/gVisor, and proactive vulnerability discovery do not match the reactive TypeScript/Bun diagnostic scope. |
| Normalize fresh replay path/timing noise before hashing | Accept | The report keeps deterministic evidence hashes while retaining the oracle command, exit code, and input hash as authoritative replay binding. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused tests: `bun test tests/debug-ground-truth-eval.test.ts tests/install-agent-fleet.test.ts` -> 28 pass, 0 fail.
- Typecheck: `bun run check:type` -> pass.
- Deterministic profile: `bun run benchmark:debug -- --provider stub --report /private/tmp/debug-ground-truth-eval-v1-final.json` -> 4 pass, 0 non-pass.
- Repository suite: clean-env `bun test` with the existing runtime-evidence write surface enabled -> 2452 pass, 1 skip, 0 fail across 188 files.
- Repository gates: deploy SQL order, architecture sync, task sync, strict workflow, project-state inspection, and init dry-run all passed.
- Independent gatekeeper: PASS after the full-suite result removed its sole prior blocker; no implementation finding remains.

## Verification Boundary

- The first sandboxed full-suite attempt was stopped after existing BDD2 tests received `EPERM` while creating ignored `.ai/harness/runs/` fixtures. Re-running the identical clean-env suite with the repository's required runtime-evidence write permission passed completely; this was a harness execution boundary, not a product assertion failure.
- Ambient Codex identity/root variables caused two pre-existing trace-observer assertions to fail in an earlier run. Clearing those variables made the focused trace suite pass 9/9 and the final clean-env repository suite pass. No compatibility fallback was added.
- The first `verify-sprint --prepare-acceptance` faithfully exposed that the contract still named a bare `bun test`; its only two test failures were the same ambient trace-observer pair. The contract oracle now declares the exact clean environment instead of relying on caller state. The simultaneous architecture readiness error was transient: immediate JSON readback returned `state=ready`, zero pending/running/dead-letter/human-action/adoption blockers.
- The second and third prepare runs proved the clean-env full suite inside the receipt flow. The remaining architecture failure was not a timing race: the bounded verifier intentionally strips all `REPO_HARNESS_*` variables, including the trusted Node 24 path required by the package-local archctx handshake, so this workflow-level check cannot be a contract child command without a machine-specific path. It was removed from `commands_succeed`; architecture readiness remains mandatory and fail-closed in the outer `contract-worktree finish` gate, where the trusted runtime binding is authoritative. Direct gate readback passed with `state=ready` and zero blockers. No fallback or retry was added.
- The next prepare fulfilled all 19 contract criteria but Change Assessment failed before receipt preparation because the captured plan had emitted string-valued `oracles`. Protocol v1 requires typed oracle objects; the contract now declares one deterministic-test oracle covering the final subject. This changes evidence selection metadata only, not runtime or test behavior.
- The typed-oracle prepare still blocked with an oracle gap: the subject includes `package.json`, whose release strict category is irreversible and therefore requires a `runtime_readback` oracle. The contract now declares that second oracle; its executable evidence is the exit-criteria stub benchmark run plus the init dry-run. Metadata-only change, same as the previous oracle fix.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
