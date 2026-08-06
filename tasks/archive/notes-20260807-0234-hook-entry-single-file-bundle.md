> **Archived**: 2026-08-07 02:34
> **Related Plan**: plans/archive/plan-20260805-1745-hook-entry-single-file-bundle.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260807-0234

# Implementation Notes: hook-entry-single-file-bundle

> **Status**: Active
> **Plan**: plans/plan-20260805-1745-hook-entry-single-file-bundle.md
> **Contract**: tasks/contracts/20260805-1745-hook-entry-single-file-bundle.contract.md
> **Review**: tasks/reviews/20260805-1745-hook-entry-single-file-bundle.review.md
> **Last Updated**: 2026-08-05 17:45
> **Lifecycle**: notes

## Design Decisions

- The hook-entry dispatch branch imports `DETACHED_TOOLING_POPULATE_FLAG` and `runDetachedToolingPopulate` statically, not through `await import()` like the sibling subcommand branches. Static import costs nothing on the hot path here: `hook-entry.ts` already statically imports `./hook/runtime`, which imports `./hook/handler-registry`, which imports `./hook/session-context`. Session-context is loaded on every hook invocation regardless, so a dynamic import would buy no cold-load savings and would force either duplicating the flag literal or a `--` prefix pre-guard to decide when to import.
- The build-defect detector for the `--define` injection is "the identifier `REPO_HARNESS_BUNDLED_CLI_VERSION` must not appear in the bundle", not a grep for the emitted assignment shape. When the define lands, bun folds `typeof X === "string"` and the identifier disappears (measured: 0 occurrences); when it does not land, the identifier survives inside the `typeof` guard (measured: 1 occurrence). That check is independent of bun's codegen shape, so it will not rot across bun versions the way matching `var BUNDLED_CLI_VERSION = "..."` would.
- The version guard is a compile-time constant with an early return, not a fallback chain. Unbundled runs keep reading `package.json` through the existing `PACKAGE_ROOT` walk; the bundled path returns the injected literal before that walk is reached. Detection of a missing define lives in `prepack` (build-time failure), deliberately not at runtime — a bundle that reached a user without the define is a build defect, and papering over it at runtime is what produced the invented `0.0.0` in the first place.
- `prepack` redirects the build's stdout to stderr (`1>&2`). `scripts/check-tarball-install-smoke.sh` runs `npm pack --json >pack.json` and parses that file; npm gives lifecycle scripts the same stdout, so `bun run`'s `$ <command>` echo and `bun build`'s "Bundled N modules" summary landed inside the JSON and failed the parse. Redirecting keeps the build output visible to a human running prepack while leaving the `--json` stream clean. Silencing the build entirely was rejected — a quiet build hides the shebang/define assertions when they matter.
- The bin-map change forced one consequential edit outside the enumerated items: `src/core/adoption/source-checkout.ts` identifies the self-host source checkout by the canonical package shape and asserted `bin["repo-harness-hook"] === "src/cli/hook-entry.ts"`. That expectation moved with the bin, not the authored source: `SOURCE_AUTHORITY_FILES` still requires `src/cli/hook-entry.ts` to exist, so the detector keeps both halves of its signal. Two tests depended on it (`tests/cli/adoption-plan.test.ts`, `tests/cli/init-hook.test.ts`) and failed until the constant moved.
- `build:hook-bundle` is a named script that `prepack` delegates to, rather than one inline `prepack` body. The bundle must be buildable on demand during development and from the regression test's perspective, and `scripts/` is outside this contract's allowed paths, so a package-script indirection was the only place to put a reusable entrypoint without adding a new build file.

## Deviations From Plan Or Spec

- None. The two authorized source changes and the packaging changes landed exactly as scoped.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Dynamic `await import('./hook/session-context')` in the dispatch branch, guarded by an `argv[0].startsWith('--')` pre-check | Rejected | Session-context is already eagerly loaded through the runtime import chain, so the guard would add an indirection that protects nothing |
| Duplicate the `--detached-tooling-populate` literal in `hook-entry.ts` | Rejected | Two authorities for one wire token; the flag is now exported from its owning module and both dispatch surfaces read the same constant |
| Assert the define landed by grepping the emitted `var BUNDLED_CLI_VERSION = "<version>"` line | Rejected | Couples the build gate to bun's codegen shape; asserting the pre-substitution identifier is absent is equivalent and shape-independent |
| Runtime detection of "bundled but no define" inside `providerCliVersion()` | Rejected | Would need a second define to know it is bundled, and any runtime branch there is a fail-open path emitting an invented version |
| Atomic install ritual instead of bundling (stage + rename the global tree) | Rejected upstream by the orchestrator | bun's global tree swap cannot be made truly atomic; the wrapper relocates the discipline problem rather than removing it |

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
