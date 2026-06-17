# Transactional Adoption Planner

> **Status**: Sprint foundation
> **CLI Surface**: `repo-harness adopt --dry-run`, `repo-harness adopt --dry-run --json`, `repo-harness adopt --experimental-ts-apply`
> **Protocol**: `1`

## Why This Exists

`repo-harness adopt` still applies repo-local workflow changes through
`scripts/migrate-project-template.sh`. That shell path remains the compatibility
apply engine, but it is hard to audit as a machine-readable plan because
creation, skip behavior, managed blocks, and verification are mixed with shell
side effects.

The transactional adoption planner starts the migration toward a structured
operation plan. The first shipped surfaces are additive: dry-run text and JSON
planning. They let agents, tests, and future review tools inspect what adoption
would do without executing the legacy shell migrator or writing files.

## Boundary Map

- CLI boundary: `src/cli/index.ts` validates `adopt` arguments and routes
  ordinary dry-run and dry-run JSON into the TypeScript planner when not
  combined with interactive/reclaim/compact.
- Planning boundary: `src/core/adoption/` owns operation types, modes,
  summaries, deterministic templates, `.gitignore` block planning, and
  renderers.
- Effects boundary: `src/effects/` owns repo-relative path safety and the
  safe applicator subset for tests and future opt-in apply paths.
- Compatibility boundary: default `repo-harness adopt --mode standard`,
  verification, CodeGraph setup, runtime reclaim, and default apply continue
  through the existing `runInit()` / `scripts/migrate-project-template.sh`
  path. Non-standard default apply exits before mutation until shell migration
  parity or TypeScript apply promotion closes the mode gap.

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
    "byStatus": {
      "planned": 65
    },
    "plannedTotal": 65,
    "skippedTotal": 0,
    "failedTotal": 0,
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
Each rendered operation includes `rollback` metadata so reviewers can see the
planned recovery strategy before apply runs. Runtime backup paths remain in the
apply result because those paths are created only by the fs-transaction writer.

## Supported Operation Kinds

The first model defines the following operation union:

- `mkdir`
- `writeFile`
- `appendManagedBlock`
- reserved future kinds: `mergeJson`, `move`, `remove`, `gitUntrack`, `runCheck`

The first safe applicator supports only:

- `mkdir`
- `writeFile ifMissing`
- workflow-contract `writeFile` install/replacement
- `appendManagedBlock`

Unsupported operation kinds are preflighted before any operation writes. The
applicator returns structured failures rather than exiting the process or
partially applying the supported prefix of a mixed plan.

## Atomic Applicator Writes

The safe applicator writes file-changing operations through
`src/effects/fs-transaction.ts#atomicWriteFile`. Each write acquires a
target-local lock, writes the new content to a temp file, fsyncs that file,
renames it over the target, and fsyncs the parent directory. Existing targets
are first copied into `.ai/harness/backups/fs-transaction/`, and that backup
path is returned in the operation result.

This currently protects `writeFile ifMissing`, workflow-contract install, and
`appendManagedBlock` application in the safe subset. Dry-run and skipped
operations do not create locks, temp files, or backups.

Successful non-dry-run TypeScript apply writes a transaction manifest at:

```text
.ai/harness/backups/fs-transaction/<transaction>/manifest.json
```

The manifest records each operation result, backup path, applied content hash
when available, and the rollback command. Backup files created during plan-level
apply live under the same transaction directory, keeping the apply evidence and
restore inputs together.

## CLI Process Runner Boundary

Repo adoption, global runtime setup, CodeGraph setup, and `repo-harness run`
helper dispatch can all invoke child processes while reporting structured
step/action results. These paths now use `src/effects/process-runner.ts` for
process execution instead of local naked `spawnSync` calls. The shared runner
owns default timeout, output cap, merged environment handling, common
output/command redaction, and optional `stdio` passthrough for foreground helper
execution. Hook foreground runtime dispatch remains outside this boundary
because it has host protocol and stdio requirements of its own.

## Rollback Metadata

Every planned operation carries a rollback strategy:

- `mkdir`: `remove-empty-directory`
- `writeFile ifMissing`: `delete-created-file`
- `writeFile` replacement and `appendManagedBlock`: `restore-or-delete-file`
  using the runtime fs-transaction backup when one is produced
- skipped operations and verification-only boundaries: `none`

The metadata is part of the operation plan. For the current TypeScript safe
subset, successful apply turns that metadata into an executable transaction
manifest. `repo-harness adopt rollback --transaction <manifest>` walks applied
operations in reverse order: file operations restore their fs-transaction backup
when present, created files are deleted only if the current content hash still
matches the transaction hash, and directories are removed only when empty.
Skipped operations stay skipped during rollback, and unsupported/manual
operations fail closed instead of guessing.

## Gitignore Managed Block

The planner emits a `.gitignore` `appendManagedBlock` operation with marker:

```text
repo-harness generated-runtime
```

The applicator inserts the block when missing, replaces the existing block when
out of date, and preserves user-owned content outside the block. It also
recognizes legacy `claude-runtime-temp` markers so future apply migration can
replace the old shell-managed runtime block without duplicating entries.
Existing CRLF `.gitignore` files keep CRLF output, and marker detection
normalizes trailing carriage returns so managed blocks are updated rather than
duplicated.

## Workflow Contract Install Operation

In every adoption mode, including `minimal`, the planner emits a `writeFile`
operation for `.ai/harness/workflow-contract.json` using the canonical tracked
source `assets/workflow-contract.v1.json`. The operation is marked `skipped`
when the target already matches the asset, and `planned` when the runtime
manifest is missing or stale.

This operation is now part of the TypeScript safe-applicator subset. Default
apply remains on the shell migrator, which still performs the compatibility
manifest copy. The opt-in `--experimental-ts-apply` path can install or replace
the runtime manifest through the atomic writer and returns backup metadata when
it replaces an existing manifest.

## Manifest-Driven Bootstrap Templates

The planner now reads all initial bootstrap document templates from
`assets/workflow-contract.v1.json#adoptionTemplates`: `docs/spec.md`,
`tasks/todos.md`, `tasks/current.md`, and `tasks/lessons.md`. The manifest owns
the target document key, reason, and line-based template body; the planner only
renders supported placeholders such as `{{repoName}}`.

This removes the bootstrap file bodies from `plan.ts` while preserving the
existing `writeFile ifMissing` behavior.

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
- `repo-harness adopt --experimental-ts-apply --mode minimal`: TypeScript
  safe applicator for the currently supported operation subset, including the
  workflow-contract opt-in marker.
- `repo-harness adopt --experimental-ts-apply`: TypeScript safe applicator for
  standard downstream plans, including workflow-contract install.
- `repo-harness adopt --experimental-ts-apply --mode self-host`: preflight
  rejects unsupported manual review operations before writing files.
- `repo-harness adopt --mode standard`: existing shell apply path and
  verification behavior.
- `repo-harness adopt --mode minimal|self-host` outside ordinary TypeScript
  dry-run or `--experimental-ts-apply`: fail-closed exit 2, because the shell
  migrator does not yet implement those mode semantics.

This keeps existing user adoption behavior stable while making the new plan
auditable and testable.

## Next Migration Path

The next coherent slice is to make the opt-in apply plan more reviewable and
recoverable before widening its supported operation set:

- move source-helper/runtime-copy handling into the TypeScript planner
- add rollback execution helpers for the fs-transaction backup records
