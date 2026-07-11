> **Archived**: 2026-07-11 14:16
> **Related Plan**: plans/archive/plan-20260711-1402-agent-fleet-role-tier-alignment.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260711-1416

# Implementation Notes: agent-fleet-role-tier-alignment

> **Status**: Complete
> **Plan**: plans/plan-20260711-1402-agent-fleet-role-tier-alignment.md
> **Contract**: tasks/contracts/20260711-1402-agent-fleet-role-tier-alignment.contract.md
> **Review**: tasks/reviews/20260711-1402-agent-fleet-role-tier-alignment.review.md
> **Last Updated**: 2026-07-11 14:16 +0800
> **Lifecycle**: notes

## Design Decisions

- Treat the generator mapping as desired installed-artifact authority, not proof of native V2 runtime selection.
- Keep the upstream Claude `sonnet/max` source unchanged and change only its deterministic Codex projection.
- Do not add explorer to the Fable-managed list; the local standalone explorer remains an independent user-level custom agent and force install does not delete unmanaged files.
- Treat the managed filename as the trusted role identity: reject frontmatter
  name mismatches before writing either host target, and derive Codex sandbox
  permissions from the validated managed role rather than raw frontmatter.
- An identity failure is fatal even if other roles install successfully. Remove
  only an existing managed target whose own declared role name mismatches its
  managed filename; preserve identity-correct local targets and other drift.
- Inspect installed identity before fetching and validating the current source.
  This makes recovery independent of whether upstream is still malformed or
  has already been corrected, while preserving the never-clobber rule for
  identity-correct drift.
- Normalize the bounded role-name scalar grammar (plain, single-quoted, or
  double-quoted, with an optional comment) before comparison. Ambiguous names
  are not proof of mismatch and therefore are not deletion authority.
- For installed Codex TOML, accept the managed `name` key in bare,
  single-quoted, or double-quoted form before applying the same scalar parser.
- Accept legal leading indentation on flat YAML/TOML identity keys and
  normalize BOM/CRLF before frontmatter parsing.
- Treat the minimum YAML mapping-key indentation as the root level and ignore
  nested mappings. For TOML, require Bun and read the semantic root object with
  `Bun.TOML.parse`; text scans are not deletion authority.
- Missing or unparseable source role identity is an installer failure even when
  other managed roles install successfully.
- Require all non-comment frontmatter entries to be a flat mapping at one root
  indentation; reject sequences, nested mappings, and continuation structures.
- After `Bun.TOML.parse`, accept an installed identity only when its literal
  string exactly equals a known managed role; do not reinterpret it as YAML.
- Apply the same exact-known-role deletion authority to Claude frontmatter.
  Valid YAML non-string scalars such as `null`, booleans, and numbers remain
  ambiguous local drift rather than evidence that a managed role is misplaced.
- Raise and enforce the package runtime boundary to Bun >= 1.1.35 before any
  user-level state is created. Bun 1.0 satisfies the old engine declaration but
  cannot execute this stdin script, and Bun through 1.1.34 does not semantically
  parse the generated multiline TOML shape used for installed identity checks.
- Enforce the same runtime floor in `install.sh` and `install.ps1`. Older Bun
  releases install packages despite incompatible engine metadata, so bootstrap
  must actively upgrade and verify the resolved runtime before reporting
  repo-harness installed.
- Enforce that floor again at the shared `runGlobalRuntimeSetup` boundary used
  by global `install`, `init`, and mutating `update`. This covers public direct
  `bunx`, `bun add -g`, and `npx` paths that never invoke the top-level scripts;
  `update --check` and `--no-runtime-refresh` stay on their read-only branch.
- Resolve and probe one Bun executable, bind every direct Bun subprocess plus
  nested PATH lookup to that same binary, and never infer child compatibility
  from the parent process version alone. Only Bun self-installer-owned binaries
  may run `bun upgrade`; Homebrew, Scoop, npm, and unknown package-manager-owned
  paths fail closed with an actionable manager upgrade command.
- Treat an unavailable managed host target as an unresolved fleet failure on
  every run. Fetch and validation failures still isolate processing by role,
  but a second retry cannot convert an incomplete prior remediation into exit 0.

## Verified Platform Boundary

- OpenAI's current subagent documentation supports model/effort in custom agent files.
- Local Codex 0.144.0 MultiAgentV2 canary evidence still shows role-less inherited children on this surface.
- Codex 0.144.1 release notes contain installer/code-mode fixes only, so the blocked runtime contract remains open.

## Open Questions

- None for this artifact-generation slice.

## Verification Notes

- Focused fleet tests passed 18/18 after adding role-identity, recovery,
  preservation, duplicate-key, and fallback-runtime regression cases requested
  by external ship review.
- Bootstrap installer contract tests passed 4/4 and global runtime bootstrap
  tests passed 22/22, for 44/44 across the combined focused surface. The runtime
  cases cover self-managed upgrade ordering, validated-executable binding,
  package-manager fail-closed behavior, and public CLI update/install paths.
- The first full-suite attempt found the isolated worktree had no `node_modules`; `bun install --frozen-lockfile` restored the already-locked `archctx-contracts@0.2.2`, after which the full suite passed.
- After stale-target remediation, the full suite passed 1127 tests and had one
  unrelated `configures CodeGraph MCP only when explicitly requested` failure
  under full concurrency; that case then passed alone and in the complete
  24-test `tests/cli/init.test.ts` file. The changed fleet tests remained green.
- After the final public-entrypoint runtime fix, the full suite passed 1135
  tests with one platform-specific skip and zero failures.
- The local force install produced Sol/high/workspace-write `fast-worker`; the unmanaged Terra/medium/read-only `explorer` remained present.
- The first strict workflow pass caught the unsupported draft profile `refactor`, a terminal active-plan marker, and the expected Brain mirror drift after editing a registered doc. Closeout changed the profile to `code-change`, cleared the ignored markers, and synchronized the registered mirror before rerunning the gate.
- The contract explicitly authorizes the standard archive helper's `plans/archive/`, `tasks/archive/`, and deferred-ledger snapshot surfaces so completed workflow artifacts can leave the root active catalog.
