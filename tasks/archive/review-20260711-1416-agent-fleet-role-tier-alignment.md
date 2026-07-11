> **Archived**: 2026-07-11 14:16
> **Related Plan**: plans/archive/plan-20260711-1402-agent-fleet-role-tier-alignment.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260711-1416

# Task Review: agent-fleet-role-tier-alignment

> **Status**: Done
> **Plan**: plans/plan-20260711-1402-agent-fleet-role-tier-alignment.md
> **Contract**: tasks/contracts/20260711-1402-agent-fleet-role-tier-alignment.contract.md
> **Notes File**: tasks/notes/20260711-1402-agent-fleet-role-tier-alignment.notes.md
> **Checks File**: `.ai/harness/checks/latest.json`
> **Last Updated**: 2026-07-11 14:16 +0800
> **Recommendation**: pass
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: sha256:d5a7d77835c9ac09a0af5493f579314666a48388006ebb5120a94b0fc7d82427
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass
- Change type: deterministic fleet projection update
- Intended files changed: contract Allowed Paths only
- Actual files changed: generator + mirrored helper, golden `fast-worker`, fleet/bootstrap tests, shell/PowerShell/CLI global runtime bootstrap paths, package runtime metadata, localized install docs, mirrored operator docs, changelog, lessons, and this work package's plan/contract/notes/review.
- Commands passed: focused fleet/bootstrap tests 32/32 and bootstrap installer tests 4/4 after the ship-review fixes; full `bun test`; deploy SQL, architecture sync, task sync, project inspection, migration dry-run, helper parity, and diff checks.
- External acceptance: Codex Sol/xhigh review found fourteen P2 privilege-boundary/parser/runtime issues and five P1 recovery/preservation/scope gaps. The installer now requires flat root YAML role metadata and uses Bun's semantic TOML parser with exact known-role comparison, normalizes quoted and indented role scalars/keys, rejects missing or mismatched source identities, derives sandbox access from the trusted managed filename, checks installed identities on every run before drift handling, exits non-zero until incomplete remediation is actually repaired, preserves identity-correct or ambiguous local drift, automatically reinstalls a corrected role after deactivating a stale mismatched target, and enforces Bun >= 1.1.35 across every public bootstrap/update path before creating user state.
- Residual risks: native V2 role selection remains outside this contract and is not claimed fixed.
- Reviewer action required: none
- Rollback: revert work package and reinstall prior fleet

## Mode Evidence

- Selected route: sequential main-thread implementation in an isolated worktree.
- P1: `scripts/install-agent-fleet.sh` is the conversion authority; the template helper, golden TOML, tests, and docs are deterministic projections.
- P2: upstream `fast-worker.md` (`sonnet/max`) now maps to Sol/high, emits workspace-write, and force-installs byte-identically to the golden file.
- P3: no new provider, fallback, alias, or runtime abstraction; the native V2 blocker remains a separate failed-closed contract.

## Verification Evidence

| Command | Result |
|---|---|
| `bun test tests/install-agent-fleet.test.ts tests/bootstrap-files.test.ts` | pass, 32 tests / 0 failures after adding role-identity, recovery, retry persistence, preservation, runtime-boundary, and semantic parser regressions |
| `bun test tests/install-scripts.test.ts` | pass, 4 tests / 0 failures for Unix/Windows bootstrap runtime-floor contracts |
| `bun test tests/cli/global-runtime-init.test.ts` | pass, 20 tests / 0 failures including old-Bun upgrade before global install/update mutations |
| `bun test` | final pass: 1135 pass, 1 platform-specific skip, 0 failures; an earlier follow-up run had one unrelated CodeGraph init concurrency failure that passed both isolated and in the complete 24-test `tests/cli/init.test.ts` file |
| `bash scripts/check-deploy-sql-order.sh` | pass |
| `bash scripts/check-architecture-sync.sh` | pass, 0 blocking capabilities |
| `bash scripts/check-task-sync.sh` | pass |
| `bun scripts/inspect-project-state.ts --repo . --format text` | current-v1, no drift signals or required decisions |
| `bash scripts/migrate-project-template.sh --repo . --dry-run` | pass |
| `cmp scripts/install-agent-fleet.sh assets/templates/helpers/install-agent-fleet.sh` | pass, byte-identical |
| `git diff --check` | pass |
| local `install-agent-fleet.sh --force` plus TOML readback | pass: fast-worker Sol/high/workspace-write; explorer Terra/medium/read-only |
| `repo-harness run check-task-workflow --strict` | pass after synchronizing the registered Brain mirror and clearing completed active-plan markers |
| `repo-harness run verify-contract --contract tasks/contracts/20260711-1402-agent-fleet-role-tier-alignment.contract.md --strict` | pass |

## External Acceptance Advice

> **External Acceptance**: completed with fourteen P2 and five P1 findings, then remediated
> **External Reviewer**: Codex review, GPT-5.6 Sol/xhigh
> **External Source**: review chain ending session `019f505c-ddb2-79b2-a4f8-1020fc2f7a26`
> **External Started**: 2026-07-11 14:45 +0800
> **External Completed**: 2026-07-11 14:50 +0800

- P1 blockers: none
- P2 advisories: native V2 named-role selection remains governed by the separate blocked contract and must be re-canary-tested after a runtime release explicitly changes that surface.
- Acceptance checklist: pass for deterministic artifact generation and local installation.

## Scorecard

| Dimension | Score | Notes |
|---|---:|---|
| Functionality | 9/10 | Generator, golden output, forced local install, and readback agree. |
| Code quality | 9/10 | One direct mapping change plus one role-specific sandbox line; no new abstraction. |

## Findings

- Resolved P2: a mismatched upstream frontmatter `name` could make a managed
  target inherit `fast-worker` write access. Validation now requires the parsed
  role name to equal the managed filename, permission derivation uses that
  trusted loop identity, and a regression test proves the mismatched
  `gatekeeper.md` path fails closed.
- Resolved P1 follow-up: a vulnerable target written by the prior installer
  could survive the first validation fix. Identity mismatch now exits non-zero
  and removes only installed managed targets whose own declared role name is
  also mismatched; identity-correct local targets remain untouched.
- Resolved P1 recovery-path follow-up: stale installed identities are inspected
  before source validation and normal drift handling on every run. A corrected
  source therefore reinstalls the canonical role instead of preserving the
  vulnerable file as user drift; a still-invalid or unavailable source leaves
  the affected role deactivated and returns non-zero.
- Resolved P1 preservation/failure follow-ups: role names are normalized from
  valid quoted YAML/TOML scalar forms before identity comparison, so semantic
  identity matches keep local drift intact. If a stale target is deactivated
  but its replacement fails any validation class, the installer now exits
  non-zero instead of reporting successful remediation.
- Resolved P2 TOML parser follow-up: installed Codex identity detection accepts
  bare, single-quoted, and double-quoted `name` keys, preventing valid TOML key
  syntax from bypassing stale privilege-bearing target remediation.
- Resolved P2 indentation follow-up: legal leading indentation is accepted for
  both flat YAML frontmatter keys and TOML identity assignments; BOM/CRLF
  normalization also keeps equivalent frontmatter parseable.
- Resolved P2 structure/failure follow-ups: missing or unparseable source role
  identity is fatal; YAML identity extraction only considers the root mapping
  indentation; TOML identity extraction now uses `Bun.TOML.parse`, so escaped
  multiline delimiters, tables, and body text cannot authorize deletion.
- Resolved P2 root/literal follow-ups: Claude role frontmatter must be a flat
  mapping with one consistent root indentation, so sequences or nested fields
  cannot become identity. Parsed TOML `name` is compared literally against the
  known managed role set; comment-like suffixes are ambiguous and preserved.
- Resolved P2 runtime/scalar follow-ups: `package.json` and the installer now
  enforce Bun >= 1.1.35 before user-level writes, matching stdin execution and
  multiline TOML parsing requirements. Claude deletion evidence is likewise
  restricted to exact known managed-role strings, so valid YAML `null`, boolean,
  or numeric scalars remain preserved ambiguous drift.
- Resolved P1/P2 corrective-scope and bootstrap follow-ups: the archived
  contract explicitly authorizes `package.json`, both top-level bootstrap
  installers, their test, and the correction-derived lesson. Unix and Windows
  bootstrap now upgrade and verify Bun >= 1.1.35 because older Bun ignores the
  package engine constraint.
- Resolved P2 retry follow-up: fetch or validation failure returns non-zero on
  every invocation while either managed host target remains unavailable, so an
  incomplete stale-target cleanup cannot appear successful on its second run.
- Resolved P2 direct-entrypoint follow-up: shared global runtime setup upgrades
  and verifies old Bun before any mutating `install`, `init`, or `update` step,
  so `bunx`, direct global package installation, and `npx` no longer bypass the
  runtime floor. Read-only update checks do not enter this mutating boundary.

## Summary

The managed Codex `fast-worker` now deterministically installs as Sol/high with workspace-write sandboxing, while role identity is validated before that permission is granted and stale mismatched targets are deactivated. All generator projections and checks pass. This review deliberately makes no claim that current GPT-5.6 MultiAgentV2 selects the named role at runtime.
