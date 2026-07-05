# Implementation Notes: archcontext-boundary-bridge

> **Status**: Active
> **Plan**: plans/plan-20260706-0211-archcontext-boundary-bridge.md
> **Contract**: tasks/contracts/20260706-0211-archcontext-boundary-bridge.contract.md
> **Review**: tasks/reviews/20260706-0211-archcontext-boundary-bridge.review.md
> **Last Updated**: 2026-07-06 02:12
> **Lifecycle**: notes

## Design Decisions

- **Contract `allowed_paths` reconciliation.** The captured contract shipped with the unmodified template default (`docs/spec.md`, `plans/`, `tasks/*`, `.ai/context/capabilities.json`, `.claude/templates/`, `src/`, `tests/`) — it never listed `scripts/` or `assets/templates/helpers/`, both of which the plan's Slice 1/Slice 2 explicitly require editing. Per the contract's own "Scope gate: ... update this contract before widening scope" and Workflow Inventory line, I widened `allowed_paths` to the two specific files in each directory the plan names (`scripts/capability-resolver.ts`, `scripts/capability-config.ts`, `assets/templates/helpers/capability-resolver.ts`, `assets/templates/helpers/capability-config.ts`) — reconciling the contract with the already-approved plan scope, not adding new scope of my own.
- **`import.meta.main` guard added to `capability-resolver.ts`.** Not explicit in the plan, but required for Slice 1 to work at all: the file previously ran `await main()` unconditionally at module load, so importing it (as `capability-config.ts`/`capability-context.ts` now do) would have executed the CLI entrypoint against the importer's `process.argv`. Guarded with `if (import.meta.main) { ... }`, the same idiom already used in `scripts/workflow-contract.ts`, `scripts/check-skill-version.ts`, and `src/cli/index.ts`.
- **`findCapabilityByPath` (capability-context.ts) kept as a thin adapter, not deleted outright.** Its return shape (`{capability: Capability, matchedPrefix: string}`) and its own root/file-prefix fallback (used when no prefix textually matches — see `isLikelyFile`/prefix `'.'` handling) differ from resolver's `findMatch` (which returns a flat object with `capability_id`, and falls back to a synthetic `capability_id: "root"` placeholder rather than a real registry lookup). Deleting `findCapabilityByPath` outright and calling `findMatch` directly, as the plan's literal wording suggested, would have changed capability-context's observable "no exact prefix match" behavior (its "file prefixes target their directory" test in `tests/cli/capability-context.test.ts` exercises exactly this fallback). Instead, `findCapabilityByPath` now calls `findMatch` for the core longest-prefix decision, maps a match back to the real `Capability` via the existing `findCapabilityById`, and falls through to the *unchanged* pre-existing root-capability search when `findMatch` reports no match. All 5 existing capability-context tests pass unchanged.
- **`capability-config.ts`/`capability-context.ts` now inherit resolver's `readRegistry` (with its legacy `agent-context-blocks.txt`/directory-walk fallback) instead of their own simpler "return `{version:1, capabilities:[]}` when the registry file is missing" fallback.** This is a real behavior difference in the missing-registry-file edge case, but: (a) it converges on the one canonical, already-tested "single export point" read path the plan asks for; (b) neither existing test suite exercises a missing-registry-file scenario where legacy AGENTS.md/CLAUDE.md files are also scattered in the repo (the only "registry missing" test case is a brand-new empty temp dir with nothing to discover, where both implementations already agreed); confirmed via `bun test tests/capability-config.test.ts tests/cli/capability-context.test.ts` passing unchanged.
- **Ambiguity-detection now applies uniformly.** capability-context's own old matching loop picked `matches[0]` after sorting by prefix length with no same-length-ambiguity check (unlike resolver's `findMatch`, which throws per `.ai/harness/policy.json`'s `capability_match_rule`). After convergence, capability-context now also throws on same-length ambiguous prefixes. This is the intended effect of using one canonical matcher, not a scope add; no current test registers overlapping same-length prefixes for the same path, so nothing broke.
- **`archcontext-boundaries-v1` export: output key is `id`, not literally `stableId`.** The plan's field-mapping table ("id→stableId") and the research doc both use "stableId" as the *concept* the value represents; the vendored upstream schema's actual key is `id` (pattern-constrained). Emitting a top-level `stableId` key would fail the vendored schema outright (`additionalProperties:false`, no such property). `id` holds the canonical `capability.<domain>.<name>` string.
- **Vendored schema is a deliberately narrowed subset, not a verbatim copy** (matches the dispatch's own "vendor a ... subset" wording). `kind` is narrowed from the upstream 8-value enum to `const: "capability"` (all we ever emit). `name`/`status`/`summary` stay in `properties` (documenting the fuller upstream shape) but are dropped from `required`, because the plan's field-mapping table never asks this export to populate them and the capability registry has no source data for them — fabricating placeholder text for a required `summary` would have been inventing data. `schemaVersion` const, the `id` pattern, and `source`/`extensions` shapes are unchanged from upstream (`schemas/repo/architecture-node.schema.json` @ `Ancienttwo/arch-context` commit `11cb5ae35bd9540ec3253e9ebc5a3dfb5496f455`, fetched 2026-07-06).
- **No `entrypoints` mapping emitted.** The plan says "entrypoints→source.entrypoints (如 registry 有)" — the `Capability` type (all three pre-convergence copies, and the real `.ai/context/capabilities.json`) has no `entrypoints` field at all, so the key is omitted rather than emitted empty.
- **New test file, not merged into `capability-resolver.test.ts`.** The plan allowed either. `tests/capability-archcontext-export.test.ts` covers three fairly different concerns (matching-semantics parity, schema validation, schemaVersion pin) against a small synthetic registry; keeping it separate avoids growing the existing CLI-behavior-focused test file.
- **Schema validator is native to this repo, not a vendored copy of arch-context's `validator.ts`.** Only the schema fixture itself is vendored (with attribution); the small recursive validator in the new test file is purpose-built for the keywords the vendored schema subset actually uses.

## Deviations From Plan Or Spec

- Contract `allowed_paths` widened (see Design Decisions) — mechanical reconciliation with the plan's already-approved scope, not new scope.
- Contract `exit_criteria.tests_pass` pointed at the real delivered test paths; the captured contract's template default named a non-existent `tests/unit/archcontext-boundary-bridge.test.ts`.
- `readRegistry`'s missing-registry-file fallback behavior changes for `capability-config.ts`/`capability-context.ts` in the untested edge case described above.
- capability-context.ts's path matching now enforces same-length-ambiguity-fails (previously silent); no current caller/test hits this path.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Delete `findCapabilityByPath` outright and call `findMatch` directly (literal plan wording) | Rejected | Return shape and no-match fallback differ; would have broken the "file prefixes target their directory" test and silently changed capability-context's root-capability semantics |
| Vendor the full, unmodified upstream `architecture-node.schema.json` and fabricate `name`/`status`/`summary` to satisfy it | Rejected | No field mapping or source data for those fields exists; fabricating required-field content is inventing data. Narrowed the vendored subset's `required` instead, keeping `schemaVersion`/`id`/`source`/`extensions` shapes byte-faithful to upstream |
| Emit export output key literally named `stableId` | Rejected | Upstream schema's key is `id`; `stableId` in the plan/research doc is the concept the value represents, not a literal JSON key name |
| Wrap export nodes in a custom envelope object (e.g. `{schemaVersion, generatedAt, nodes:[...]}}`) | Rejected | No upstream schema for such an envelope to validate against; a bare sorted array of individually-valid per-node objects matches this CLI's existing `list --format json` convention (also a bare array) and keeps each entry independently schema-checkable |

## Open Questions

- None blocking. Follow-on gating conditions for any deeper archctx integration are already tracked in `docs/researches/20260705-archcontext-capability-filing-handover.md` §7 and explicitly out of scope here.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
