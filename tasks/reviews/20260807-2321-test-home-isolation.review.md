# Task Review: test-home-isolation

> **Status**: Complete
> **Plan**: plans/plan-20260807-2321-test-home-isolation.md
> **Contract**: tasks/contracts/20260807-2321-test-home-isolation.contract.md
> **Notes File**: tasks/notes/20260807-2321-test-home-isolation.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-08 00:14
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:6b47add986b2a4b76c42abfff97ff488652b6007ecb58e7fe0d8bfe86b0dbb4f
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: eae3a57b53a822ddf4160e6928de5575869fe004

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: `bunfig.toml` (preload array), `tests/preload-home-isolation.ts` (new), one test whose env handling had to be hardened, plus plan/contract/notes/review workflow artifacts and `tasks/todos.md`. No `src/**` change.
- Actual files changed: `bunfig.toml` (+1/-1), `tests/preload-home-isolation.ts` (new, 62 lines: 58 comment + 4 logic), `tests/cli/init.test.ts` (+17), `tasks/todos.md` (timestamp), `plans/plan-20260807-2321-test-home-isolation.md`, `tasks/contracts/...`, `tasks/notes/...`, `tasks/reviews/...`. `src/**` untouched — confirmed by `git diff --stat`.
- Commands passed: `bun run check:type` EXIT=0; `bun test` 2222 pass / 1 skip / 0 fail / 2223 across 177 files, EXIT=0 (gatekeeper-run, 565.60s; verify-sprint re-ran it at 533.71s); `bun test tests/cli/init.test.ts tests/cli/init-hook.test.ts tests/cli/mcp-setup.test.ts` 79 pass / 0 fail; `bash scripts/verify-sprint.sh --prepare-acceptance` total=8 failed=0 status=Fulfilled.
- Residual risks: the preload is a default-safety improvement, not a whole-class guarantee. Four gaps are documented in the notes and left open on purpose — (1) 254 of 392 spawn sites under `tests/` pass no `env` and Bun 1.3.14 does not propagate a runtime `process.env` mutation to them; (2) `HOME`-only writers (`brain-root.ts` `config.json`, `global-runtime.ts` `packages/`); (3) OS-account writers (`acceptance-receipt.ts:753`, `merge-gate.ts:180`) that no env var can redirect, which is where leak class 2 lives; (4) the `initCommandEnv` production bug at `src/cli/commands/init.ts:194`.
- Reviewer action required: none — gates clean, findings from review round 1 all closed in round 2.
- Rollback: revert commit `667a106c`. Test config and test files only; no production surface, no data migration.

## Mode Evidence

- Selected route: planning -> contract execution -> gatekeeper acceptance (two review rounds).
- P1/P2/P3 evidence: P1 — three groups of code write under `~/.repo-harness`, split by which home lever they read (`REPO_HARNESS_HOME` / `HOME` only / OS account record); the writer table in the notes and the header comment of `tests/preload-home-isolation.ts` are the map. P2 — traced `bun test` -> preload -> `process.env.REPO_HARNESS_HOME` -> child spawn -> `repoHarnessHome(env)` -> `registered-repos.json`, and measured each spawn shape in a live `bun test` run. P3 — `HOME` deliberately not overridden: it would reach the second writer group but drag in git/bun/every tool that resolves a home, a wider blast radius than this slice can verify.
- Root cause or plan evidence: `plans/plan-20260807-2321-test-home-isolation.md` Captured Planning Output names the three observed leak classes; the notes record which of them this slice structurally closes (class 1 and 3) and which it does not (class 2).

## Verification Evidence

- Waza `/check` run: covered by `bash scripts/verify-sprint.sh --prepare-acceptance` (8 checks, 0 failed, status Fulfilled).
- Commands run: `bun run check:type`; `bun test` (full); `bun test tests/cli/init.test.ts tests/cli/init-hook.test.ts tests/cli/mcp-setup.test.ts`; `bash scripts/verify-sprint.sh --prepare-acceptance --contract ...`; `bun scripts/acceptance-receipt.ts record --disposition external_pass ...`; `bash scripts/verify-sprint.sh --contract ...`.
- Manual checks: (1) zero-write probe — a 757-file `relpath|size|mtime` manifest of the real `~/.repo-harness` captured before any run and re-diffed after the init/mcp family, after the full suite, and after the round-2 runs: IDENTICAL every time, with `registry_count` flat at 841, the four `mcp.*` hashes and `config.json` unchanged, and the gates tree mtime unchanged. (2) preload semantics probed directly — precedence (an explicit `REPO_HARNESS_HOME` survives untouched), `mkdtempSync` uniqueness across runs, and the child-inheritance boundary measured inside a real `bun test` process: bare `spawnSync` / `execSync` / `Bun.spawnSync` children see the variable unset while `env: { ...process.env }` children see it, which is exactly what the committed comment now states. (3) determinism of the hardened test confirmed by running it with `AGENTIC_DEV_LINK_INSTALLED_COPIES=1` exported: 1 pass. (4) every file:line citation in the writer table read and confirmed, including `merge-gate.ts:180`'s `/usr/bin/id` + `dscl` path.
- Supporting artifacts: `.ai/harness/checks/latest.json`; gatekeeper probe files under `/tmp/gk-*` (manifests and full-suite log, transient).
- Implementation notes reviewed: yes — `tasks/notes/20260807-2321-test-home-isolation.notes.md`, including the three-group writer table, the measured coverage boundary, and the four open gaps.
- Run snapshot: `.ai/harness/runs/run-20260808T000445-18436-20260807-2321-test-home-isolation.json`

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:6b47add986b2a4b76c42abfff97ff488652b6007ecb58e7fe0d8bfe86b0dbb4f
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: eae3a57b53a822ddf4160e6928de5575869fe004
> **Verification Evidence SHA256**: sha256:ae8c5a7a9d96e10ad81f03297cd3db624e3046adac6794854574ed08fe51f597
> **Issued At**: 2026-08-07T16:14:08.413Z

- Summary: Gatekeeper round 2: preload semantics, coverage boundary, and the three-group writer table verified against the real Bun 1.3.14 runtime; zero-write probe over a 757-file manifest of the real ~/.repo-harness reproduced independently across the full suite and the init/mcp leak family; check:type and bun test green.
- Findings: none

## Behavior Diff Notes

- Under `bun test`, `REPO_HARNESS_HOME` is now always set: to a caller-supplied value when one exists, otherwise to a fresh `mkdtemp` directory per test process. Nothing else about the suite changes.
- In-process home resolution and every spawn site that spreads `process.env` now land in that temp directory instead of the operator's real `~/.repo-harness`. Bare spawn sites are unchanged in behavior and still resolve through the real `HOME`.
- `tests/cli/init.test.ts` "npx cache sources force copy-based installed skill sync" now passes a sanitized `process.env` copy with `AGENTIC_DEV_LINK_INSTALLED_COPIES` deleted; the assertion under test is unchanged and the forced-`0` path is still the one exercised.

## Residual Risks / Follow-ups

- **Bare spawns (widest gap).** 254 of 392 spawn sites under `tests/` pass no `env`. A lint/grep guard requiring an explicit `env` on spawns in `tests/` is the follow-up that would turn this preload into the structural guarantee it was first mistaken for.
- **`HOME`-only writers.** `src/cli/commands/brain-root.ts:24-35` (`config.json`) and `src/cli/commands/global-runtime.ts:259-261,387` (`packages/`) are not covered.
- **OS-account writers / leak class 2.** `scripts/acceptance-receipt.ts:753` and `scripts/merge-gate.ts:180` read the OS account record; no env var redirects them. Isolating them means injecting `opts.authorityHome` at the test call sites.
- **`initCommandEnv` production bug.** `src/cli/commands/init.ts:194` drops `process.env` wholesale for npx-cache sources when the caller passes no `env` — real production behavior, not just a test artifact. Out of contract scope here; worth its own slice.
- **Already-leaked operator state.** The ~841 temp-path entries in the real `registered-repos.json` are pre-existing and deliberately not cleaned by this slice.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Closes leak classes 1 and 3 for the covered surface; zero-write probe reproduced independently three times. Not 10 because class 2 and the bare-spawn population stay open by design. |
| Product depth | 8/10 | Operator-state safety is the product here, and the default is now safe rather than discipline-dependent. |
| Design quality | 9/10 | Smallest coherent change: 4 lines of logic on the one lever that covers the largest writer group, with the uncovered groups named instead of half-fixed. `HOME` deliberately left alone. |
| Code quality | 9/10 | Comment-to-code ratio is high but every claim in it is measured against the real runtime, and the coverage boundary is the load-bearing part a future reader needs. |

## Failing Items

- None outstanding. Review round 1 returned three findings — a false bare-spawn inheritance claim, a false "one lever covers all resolvers" completeness claim that also mis-framed leak class 2 as refuted, and an ambient-env dependency in the hardened test. All three are closed in round 2 and re-verified against the live runtime.

## Retest Steps

- Re-run: `bun run check:type` and `bun test` (or `bash scripts/verify-sprint.sh --prepare-acceptance --contract tasks/contracts/20260807-2321-test-home-isolation.contract.md`, which runs both).
- Re-check: snapshot the real `~/.repo-harness` before and after a full suite run and diff a `relpath|size|mtime` manifest — it must be identical, with `registered-repos.json` entry count flat. To re-confirm the coverage boundary, run a throwaway test under this preload that spawns a child both bare and with `env: { ...process.env }` and print `REPO_HARNESS_HOME` from each.

## Summary

- A bun test preload sets `REPO_HARNESS_HOME` to a fresh per-run temp directory when the environment has not set it, so the operator's real `~/.repo-harness` stops being the effective default for the test suite's largest writer group. Explicit settings keep precedence; `HOME` is untouched.
- Accepted after two review rounds. Round 1 failed the delivery for claiming a whole-class structural guarantee that the runtime does not provide; round 2 replaced those claims with a measured coverage boundary and a three-group writer table, and hardened the one edited test against an ambient-env dependency. The code itself never needed a functional change.
- Evidence: full suite 2222 pass / 0 fail EXIT=0, `check:type` EXIT=0, and a 757-file manifest of the real `~/.repo-harness` identical before and after — reproduced by the gatekeeper, not taken on report.
