# Implementation Notes: codegraph-mandatory-runtime

> **Status**: Review
> **Plan**: plans/plan-20260816-2010-codegraph-mandatory-runtime.md
> **Contract**: tasks/contracts/20260816-2010-codegraph-mandatory-runtime.contract.md
> **Review**: tasks/reviews/20260816-2010-codegraph-mandatory-runtime.review.md
> **Last Updated**: 2026-08-16 21:21
> **Lifecycle**: notes

## Design Decisions

- npm registry `latest` was freshly read as `1.5.0`; the dependency change is
  classification and enforcement, not a version number increase beyond upstream.
- Global install/update retain ownership of CLI and MCP writes. Repo init owns
  only `.codegraph` initialization/sync and therefore preserves the HOME boundary.
- Readiness for repo init is CLI present plus `project_index.status=up-to-date`;
  missing host MCP config is not an init failure because init must not write HOME.

## Deviations From Plan Or Spec

- PR #195 CI run 921 exposed a Linux-only fixture defect in the new
  missing-CodeGraph regression test. Its synthetic `PATH` retained macOS runtime
  locations but removed GitHub Actions' Bun directory, so
  `check-agent-tooling.sh` failed before it could report `source=missing`. The
  fixture now retains `dirname(process.execPath)` while both CodeGraph resolver
  sources remain explicitly disabled; production behavior is unchanged.
- CI run 922 then passed the full test/workflow sequence and exposed two stale
  executable consumers of the retired flag: tarball install smoke and harness
  benchmark setup. Both now exercise mandatory CodeGraph instead; the tarball
  smoke also asserts that packaged init reports its CodeGraph step as `ok`.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Preserve `--no-codegraph` as compatibility | Rejected | A hard dependency with a public opt-out is contradictory and creates dual semantics. |
| Configure MCP from repo init | Rejected | User-level state belongs to global install/update; repo init remains repo-scoped. |
| Always sync on applied init | Accepted | Establishes a usable index for both new and previously initialized repos; dry-run stays read-only. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Change Assessment: `.ai/harness/checks/change-assessment.latest.json`
- Full suite: 2446 passed, 1 platform skip, 0 failed across 2447 tests.
- CI correction: the failing regression test passes with the CI isolation env;
  typecheck also remains green. The PR rerun is the authoritative clean-runner
  check for the Linux path contract.
- Package correction: `bash scripts/check-tarball-install-smoke.sh` passes with
  the packed production dependency and repo index initialization enabled.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
