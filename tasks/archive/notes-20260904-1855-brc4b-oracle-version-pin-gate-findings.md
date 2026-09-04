> **Archived**: 2026-09-04 18:55
> **Related Plan**: plans/archive/plan-20260903-0438-brc4b-oracle-version-pin-gate-findings.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260904-1855
> **Archive Projection V1**: `plans/plan-20260903-0438-brc4b-oracle-version-pin-gate-findings.md` => `plans/archive/plan-20260903-0438-brc4b-oracle-version-pin-gate-findings.md`
> **Archive Projection V1**: `tasks/notes/20260903-0438-brc4b-oracle-version-pin-gate-findings.notes.md` => `tasks/archive/notes-20260904-1855-brc4b-oracle-version-pin-gate-findings.md`
> **Archive Projection V1**: `tasks/contracts/20260903-0438-brc4b-oracle-version-pin-gate-findings.contract.md` => `tasks/archive/contract-20260904-1855-brc4b-oracle-version-pin-gate-findings.md`
> **Archive Projection V1**: `tasks/reviews/20260903-0438-brc4b-oracle-version-pin-gate-findings.review.md` => `tasks/archive/review-20260904-1855-brc4b-oracle-version-pin-gate-findings.md`

# Implementation Notes: brc4b-oracle-version-pin-gate-findings

> **Status**: Active
> **Plan**: plans/archive/plan-20260903-0438-brc4b-oracle-version-pin-gate-findings.md
> **Contract**: tasks/archive/contract-20260904-1855-brc4b-oracle-version-pin-gate-findings.md
> **Review**: tasks/archive/review-20260904-1855-brc4b-oracle-version-pin-gate-findings.md
> **Last Updated**: 2026-09-03 04:38
> **Lifecycle**: notes

## Design Decisions

- The exact-version match is the product invariant, not an accident: `--browser-chrome-profile`
  is a hidden Oracle flag with no stability promise, so only a pinned, hand-verified Oracle
  build is trusted to carry the bound-profile transport. The fix therefore raises the constant
  and deliberately does not introduce a floor or range comparison.
- `browserCookiePath` was deleted rather than kept as an inert probe. Since #290 the flag is
  never sent, so continuing to require it for readiness would turn a future Oracle release
  that drops the flag into a false `action_required`. Removing the stale requirement before
  the removal happens is cheaper than debugging it afterwards.
- The stale-session sentence moved under `result.status !== 0` because the engine's stated
  authority is the answer file plus the terminal exit state, with stdout/stderr as logs only.
  Matching a log line above the exit check let a log string outrank the process result; nesting
  it restores the documented ordering without losing the refusal classification.
- `native_profile` is a new third transport value rather than reusing `copy_profile`. The
  native CDP provider attaches to the bound profile directly and never copies it, so labelling
  it `copy_profile` would have made `meta.browser.transport` unable to distinguish two
  genuinely different mechanisms in stored session evidence.

## Deviations From Plan Or Spec

- The plan named `README.md` and `assets/skills/repo-harness-chatgpt/` as likely doc targets.
  `rg` found no oracle `0.14.1` literal or `browserCookiePath` mention in either, so only the
  doctor capability map sentence in `docs/repo-harness-chatgpt-browser-engine.md` changed.
  Both paths stay in `allowed_paths` as the surveyed surface.
- Doc line 217's claim that Oracle rejects `--copy-profile` together with
  `--browser-manual-login` was re-verified against the installed Oracle 0.18.0
  (`dist/src/cli/browserConfig.js:90-91` still throws) and left unchanged, as the plan decided.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Raise the exact pin to `0.18.0` vs. accept a minimum version | Raise the exact pin | The transport depends on a hidden flag; only a verified build is trusted, and a floor would silently admit untested Oracle releases |
| Delete `browserCookiePath` vs. keep probing it | Delete | The flag is never sent, so the probe can only produce false negatives once Oracle drops it |
| Nest the stale-session match under the non-zero exit vs. keep it first | Nest it | The answer file plus exit state are the documented authority; a log string must not outrank them |
| Add `native_profile` vs. reuse `copy_profile` for native | Add the value | Native attaches to the bound profile and never copies it; stored session evidence must tell the two apart |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix failure artifact: `.ai/harness/evidence/brc4b-pre-fix.txt` (gitignored runtime evidence)

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
