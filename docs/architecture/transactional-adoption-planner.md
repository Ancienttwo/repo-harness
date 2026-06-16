# Transactional Adoption Planner

> **Status**: Sprint foundation
> **CLI Surface**: `repo-harness adopt --dry-run --json`
> **Protocol**: `1`

## Why This Exists

`repo-harness adopt` still applies repo-local workflow changes through
`scripts/migrate-project-template.sh`. That shell path remains the compatibility
apply engine, but it is hard to audit as a machine-readable plan because
creation, skip behavior, managed blocks, and verification are mixed with shell
side effects.

The transactional adoption planner starts the migration toward a structured
operation plan. The first shipped surface is additive: JSON dry-run planning.
It lets agents, tests, and future review tools inspect what adoption would do
without executing the legacy shell migrator or writing files.

## Boundary Map

- CLI boundary: `src/cli/index.ts` validates `adopt` arguments and routes only
  `--dry-run --json` into the TypeScript planner.
- Planning boundary: `src/core/adoption/` owns operation types, modes,
  summaries, deterministic templates, `.gitignore` block planning, and
  renderers.
- Effects boundary: `src/effects/` owns repo-relative path safety and the
  safe applicator subset for tests and future opt-in apply paths.
- Compatibility boundary: default `repo-harness adopt`, human-readable
  `--dry-run`, verification, CodeGraph setup, and runtime reclaim continue
  through the existing `runInit()` / `scripts/migrate-project-template.sh`
  path.

## Protocol 1 JSON Shape

```json
{
  "protocol": 1,
  "command": "adopt",
  "repoRoot": "/absolute/repo/path",
  "mode": "standard",
  "apply": false,
  "operations": [
    {
      "id": "mkdir:.ai/harness/checks",
      "kind": "mkdir",
      "path": ".ai/harness/checks",
      "reason": "Ensure repo-harness workflow surface directory exists",
      "risk": "low",
      "status": "planned"
    }
  ],
  "summary": {
    "total": 65,
    "byKind": {
      "mkdir": 17,
      "writeFile": 47,
      "appendManagedBlock": 1
    },
    "userOwnedFilesTouched": 1,
    "generatedFiles": 48,
    "repoHarnessOwnedFiles": 7,
    "requiresVerification": false
  },
  "warnings": []
}
```

Operation paths are repo-relative. `repoRoot` appears only in the plan header.
Renderers redact generated file content by default and expose `contentHash` plus
`contentPreview` for reviewable diffs without large stdout payloads.

## Supported Operation Kinds

The first model defines the following operation union:

- `mkdir`
- `writeFile`
- `appendManagedBlock`
- reserved future kinds: `mergeJson`, `move`, `remove`, `gitUntrack`, `runCheck`

The first safe applicator supports only:

- `mkdir`
- `writeFile ifMissing`
- `appendManagedBlock`

Unsupported operation kinds return structured failures from the applicator
rather than exiting the process.

## Atomic Applicator Writes

The safe applicator writes file-changing operations through
`src/effects/fs-transaction.ts#atomicWriteFile`. Each write acquires a
target-local lock, writes the new content to a temp file, fsyncs that file,
renames it over the target, and fsyncs the parent directory. Existing targets
are first copied into `.ai/harness/backups/fs-transaction/`, and that backup
path is returned in the operation result.

This currently protects `writeFile ifMissing` and `appendManagedBlock`
application in the safe subset. Dry-run and skipped operations do not create
locks, temp files, or backups.

## Gitignore Managed Block

The planner emits a `.gitignore` `appendManagedBlock` operation with marker:

```text
repo-harness generated-runtime
```

The applicator inserts the block when missing, replaces the existing block when
out of date, and preserves user-owned content outside the block. It also
recognizes legacy `claude-runtime-temp` markers so future apply migration can
replace the old shell-managed runtime block without duplicating entries.

## Workflow Contract Install Operation

In `standard` and `self-host` modes, the planner emits a `writeFile` operation
for `.ai/harness/workflow-contract.json` using the canonical tracked source
`assets/workflow-contract.v1.json`. The operation is marked `skipped` when the
target already matches the asset, and `planned` when the runtime manifest is
missing or stale.

This operation is currently part of the auditable dry-run plan only. Default
apply remains on the shell migrator, which still performs the actual manifest
copy until the opt-in TypeScript apply path is introduced.

## Manifest-Driven Bootstrap Templates

The planner now reads the initial `docs/spec.md` and `tasks/current.md`
bootstrap templates from `assets/workflow-contract.v1.json#adoptionTemplates`.
The manifest owns the target document key, reason, and line-based template body;
the planner only renders supported placeholders such as `{{repoName}}`.

This removes those two bootstrap file bodies from `plan.ts` while preserving
the existing `writeFile ifMissing` behavior. `tasks/todos.md` and
`tasks/lessons.md` remain local planner templates until their manifest entries
are promoted in a later slice.

## Helper Wrapper Operations

For ordinary `standard` downstream repos, the planner reads
`assets/workflow-contract.v1.json#helpers.scripts` and emits
`writeFile ifMissing` operations for the generated `scripts/<helper>`
compatibility wrappers. Wrapper content mirrors the shell
`pi_write_helper_wrapper` behavior: prefer a source checkout via
`REPO_HARNESS_SOURCE_ROOT`, `AGENTIC_DEV_ROOT`, or `AGENTIC_DEV_SKILL_ROOT`,
otherwise delegate to `repo-harness run <helper>`.

The planner also includes those generated wrapper paths in the `.gitignore`
managed block. Self-host source repos and repos with
`harness.helper_source = "repo"` remain shell-only in this slice so
source-helper/runtime-copy behavior is not misrepresented as wrapper
installation.

## Compatibility Strategy

The current sprint does not replace shell apply. The invariant is:

- `repo-harness adopt --dry-run --json`: TypeScript planner JSON renderer, no
  shell migration, no file writes.
- `repo-harness adopt --dry-run`: TypeScript planner text renderer, no shell
  migration, no file writes.
- `repo-harness adopt`: existing shell apply path and verification behavior.

This keeps existing user adoption behavior stable while making the new plan
auditable and testable.

## Next Migration Path

The next coherent slice is to add an explicit opt-in apply path after this
planner proves stable:

- move workflow-contract install application into the TypeScript applicator
- move remaining bootstrap templates into the workflow contract manifest
- move source-helper/runtime-copy handling into the TypeScript planner
- expose `--experimental-ts-apply` for the safe subset
- add rollback metadata to operation plans
