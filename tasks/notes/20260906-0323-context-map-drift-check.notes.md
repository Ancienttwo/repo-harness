# Implementation Notes: context-map-drift-check

> **Status**: Active
> **Plan**: plans/plan-20260906-0323-context-map-drift-check.md
> **Contract**: tasks/contracts/20260906-0323-context-map-drift-check.contract.md
> **Review**: tasks/reviews/20260906-0323-context-map-drift-check.review.md
> **Last Updated**: 2026-09-06 03:23
> **Lifecycle**: notes

## Design Decisions

- Falsifier (`rg -n 'discoverable_contexts' src scripts --glob '*.ts'`) returned five hits and none is a runtime consumer: `scripts/architecture-event.ts:1103,1129,1136,1137` is the writer itself and `src/core/adoption/standard-plan.ts:854` only scaffolds an empty array on init. Nothing reads an entry by `capability_id`, so removing the root duplicates cannot change behavior.
- The check reuses `readRegistry` from `scripts/capability-resolver.ts` rather than calling `capabilityRegistryFromArchcontextNodes` directly. `readRegistry` already owns policy source-mode selection, node reading, `archcontextIncludeToPrefix` translation, and fail-closed diagnostics; calling the mapper directly would have duplicated the YAML/host plumbing next to the one authority.
- Plan rule 2 says a contract entry's directory equals `matched_prefix`. Archcontext declares `extensions.contractFiles` as a human authority that deliberately does not follow the prefix (`assets/CLAUDE.md` sits under prefix `assets/workflow-contract.v1.json`, `scripts/CLAUDE.md` under `scripts/inspect-project-state.ts`), so the literal rule would reject three valid entries. The implemented invariant is the authority-derived form: the entry path must equal the owning node's declared contract file for that agent (`contract_path_mismatch`), while ownership of the prefix stays a separate check (`prefix_not_owned`).
- `--write` derives `matched_prefix`/`functional_block` from the node's first declared include prefix. That is the value the architecture-event writer produced for every surviving entry, so the repair diff on this repo is pure deletion with no incidental field churn.
- The generated-projection exemption reads `assets/hooks/projection.json#projection_target`; `.ai/harness/policy.json` names no projection manifest, so the manifest is the only authority. An absent manifest means an empty exemption set, which the fixture test pins by deleting it and asserting `.ai/hooks/CLAUDE.md` then reports `unmapped_contract`.
- `scripts/check-context-map.ts` is not projected into `assets/templates/helpers/`: the projection set is driven by `assets/workflow-contract.v1.json#helpers.scripts`, which is outside this contract's allowed paths, and `bun run check:helpers` is green without it.

## Deviations From Plan Or Spec

- Plan rule 2's "directory equals matched_prefix" clause is implemented as "path equals the node's declared contract file" for the reason recorded above. Same intent, no false positives against the live authority.
- `tests/bootstrap-files.test.ts` was left untouched: it asserts individual `check-ci.sh` lines and orderings, never an exhaustive step list, so the new `[ci] context map` step needs no test update.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

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
