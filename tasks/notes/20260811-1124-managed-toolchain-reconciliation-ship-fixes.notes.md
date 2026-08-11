# Implementation Notes: managed-toolchain-reconciliation-ship-fixes

- The pre-fix review reproduced four independent blockers: destructive global
  package repair, partial host projection, mutable default external providers,
  and stale architecture projection. The smallest coherent release boundary is
  to keep dependency readback strict while leaving destructive repair and mutable
  provider refresh explicit/outside the ordinary update path.
- The current-turn ship authorization covers review fixes, commit, PR, CI, merge,
  and main readback. It does not authorize npm publish, tags, GitHub Releases, or
  real host-tool mutation during verification.

> **Status**: Active
> **Plan**: plans/plan-20260811-1124-managed-toolchain-reconciliation-ship-fixes.md
> **Contract**: tasks/contracts/20260811-1124-managed-toolchain-reconciliation-ship-fixes.contract.md
> **Review**: tasks/reviews/20260811-1124-managed-toolchain-reconciliation-ship-fixes.review.md
> **Last Updated**: 2026-08-11 11:24
> **Lifecycle**: notes

## Design Decisions

- Split capability-source readiness from projection-model readiness. Status and
  capability resolution require canonical nodes; apply requires manifest,
  product, nodes, and projection targets.
- Preserve the currently installed CLI on exact dependency mismatch. Automatic
  destructive remove/reinstall was removed; the operator receives an explicit
  recovery command while the usable runtime remains intact.
- Keep Waza/Mermaid provider refresh behind explicit `--with-external-skills`.
  This closes the new default-update supply-chain exposure without pretending
  that mutable provider strings are an integrity authority.
- Remove raw `--accepted-*` architecture flags. The current stack has no
  ledger-backed approval lookup, so caller-authored identifiers cannot be
  treated as human acceptance.
- Use the installed candidate's packaged `check-managed-runtime.ts` during the
  sync handoff. This makes the first 0.14.1 -> 0.14.2 update invocation verify
  the new closure before host projection even though the parent process still
  runs the old CLI code.
- Generate architecture docs with the repository profile and repeat apply to a
  fixed point. The resulting global-runtime flow has proven P1/P2 evidence and
  the projection manifest contains the eleventh capability.
- Pin Node 24 in both GitHub Actions jobs. The ArchContext package contract is
  `>=24 <26`; relying on the runner image's ambient Node makes CI readiness
  nondeterministic even when local release gates use a compatible PATH.
- Preserve protected-helper PATH isolation while carrying one exact Node
  authority. `helper-runner` verifies a compatible executable from the caller
  PATH, canonicalizes it, and passes only `REPO_HARNESS_NODE_BIN`; the general
  protected PATH never gains the candidate directory. ArchContext independently
  revalidates the exact executable and version before use.

## Deviations From Plan Or Spec

- Immutable revision/tree-digest distribution for third-party external skills
  remains out of scope. The release-safe boundary is explicit opt-in; ordinary
  update consumes no mutable external provider.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Automatic remove/reinstall | Reject | A failed reinstall destroys the last known-good CLI and has no rollback authority. |
| Continue after one host projection failure | Reject | It creates mixed-version host state; full destination preflight and early stop preserve all-or-nothing behavior for the covered projections. |
| Validate accepted-change string shape | Reject | Syntactic identifiers do not prove a ledger event or human approval. |
| Capability nodes imply full projection readiness | Reject | Capability lookup and generated-doc apply have different minimum authorities. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Full local gate: `bun run check:ci` -> 2321 pass, 1 skip, 0 fail; tarball install smoke OK.
- Release gate: `bun run check:release` -> npm package gate OK, including a second full CI/tarball smoke.
- Architecture fixed point: `archctx docs plan --profile repo-harness/v1 --json` -> `drift.ok: true`.
- Required workflow gates: architecture sync, task sync, strict task workflow, repository inspection, and init dry-run all passed.
- The full CI/release producers are executed and recorded outside
  `verify-contract`; the contract verifier consumes bounded targeted and
  workflow checks so its fixed deadline does not re-run two 13-minute evidence
  producers sequentially.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
