# Implementation Notes: repo-root-normalization

> **Status**: Active
> **Plan**: plans/plan-20260910-0309-repo-root-normalization.md
> **Contract**: tasks/contracts/20260910-0309-repo-root-normalization.contract.md
> **Review**: tasks/reviews/20260910-0309-repo-root-normalization.review.md
> **Last Updated**: 2026-09-10 03:10
> **Lifecycle**: notes
> **Substantive Change SHA256**: `sha256:b5dd5771514726ab210cd664c719b796f9e80940bf6f4bcdd888f3ae823e794e`

## Design Decisions

- **Fix at the caller, not inside `repoHarnessRepoIdFor`.** The id is a
  persisted identity. Canonicalizing inside the hash would re-key every
  repository registered under a non-canonical path, mask the next violating
  caller, and add filesystem I/O to a function that is also handed non-root
  identities (`grant-store.ts:72` passes a Git common directory).
- **Canonicalize with `canonicalRepoPath`, not `resolve`.** The comparison
  target is realpath-derived, so a lexical resolve leaves the identical false
  stale reachable through a symlinked absolute `--repo`. Exported the existing
  private helper rather than writing a second rule, so `repo-registry.ts:109`
  stays the single definition of "the same repository".
- **Swept the five `resolve`-only campaign sites too.** They were already
  absolute but still symlink-blind, so leaving them would have kept the same
  trap one line away from the fix.

## Deviations From Plan Or Spec

- The plan's P3 chose `resolve()` and forbade a new helper. That was wrong: the
  acceptance gate reproduced the same false stale through a symlinked root under
  the resolve-only fix. The contract's Goal, Scope, and taste constraint were
  corrected to require `canonicalRepoPath`, and the sweep grew from 26 sites to
  31.
- The plan said 27 unnormalized sites; the real count at HEAD is 26 bare plus 5
  `resolve`-only. Corrected in the contract.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Canonicalize inside `repoHarnessRepoIdFor` | Reject | Silently re-keys persisted identities, hides the next violating caller, and the function also receives non-root identities |
| `resolve()` at each call site | Reject | Lexical only; a symlinked absolute `--repo` reproduces the bug, proven by the gate |
| Export and reuse `canonicalRepoPath` | Use | Matches the rule every writer of a stored `repository_id` already applies; one authority, no second definition |
| Declare symlinked roots out of scope | Reject | Would leave a silent trap on a platform where `/tmp` is itself a symlink; the fixture has to realpath for exactly this reason |

## Open Questions

- The regression covers the campaign step path. `refactor` and `automation`
  were swept as the same class but have no observed failure of their own, so
  their canonicalization is guarded only by the existing focused suites.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
