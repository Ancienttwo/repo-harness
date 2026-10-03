# Implementation Notes: herdr-pin-source

> **Status**: Active
> **Plan**: plans/plan-20260909-1731-herdr-pin-source.md
> **Contract**: tasks/contracts/20260909-1731-herdr-pin-source.contract.md
> **Review**: tasks/reviews/20260909-1731-herdr-pin-source.review.md
> **Last Updated**: 2026-09-09 17:31
> **Lifecycle**: notes

## Design Decisions

- A missing or malformed `external_tooling.herdr.min_version` fails closed rather than
  falling back to the previously hard-coded `0.9.0` floor: `herdrMinVersion()` returns
  `null`, `detectRuntimeCapabilities` marks herdr `unavailable`, and strict readiness fails
  with a message naming the pin key. A default floor would let a repo with a broken pin
  report a green readiness check against a version nobody declared, which is exactly the
  silent CI/readiness disagreement this task removes.
- The pin lives in `.ai/harness/policy.json#external_tooling.herdr` rather than a new
  `runtime-pins.json`. Every other external tool (`codegraph`, `archctx`, waza) already has
  an `external_tooling` block there, and `scripts/check-agent-tooling.sh` is shipped
  downstream as a byte-identical mirror of
  `assets/templates/helpers/check-agent-tooling.sh` — so whatever file the script reads must
  also exist in generated repos. Adding the block to the downstream policy seeds
  (`ensure-task-workflow.sh`, `project-init-lib.sh`) was cheaper and less duplicative than
  introducing a second runtime-config file plus its own seeding and drift checks.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Fall back to a built-in `0.9.0` floor when the pin is missing/malformed | Rejected | Reintroduces a second authority for the version and can report readiness green against an undeclared version; fail-closed keeps one source of truth. |
| New `runtime-pins.json` for runtime version pins | Rejected | `external_tooling` in `policy.json` already owns every other tool pin, and the downstream-mirrored tooling script would need a new file seeded into generated repos. |
| Pin in `policy.json#external_tooling.herdr`, projected into CI/script/docs/seeds | Chosen | One datum, all other mentions are deterministic projections guarded by drift tests. |
| Keep the `linux-x86_64` release asset only | Chosen | CI is the only consumer that downloads a binary; other hosts install herdr themselves and are checked against `min_version`. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
