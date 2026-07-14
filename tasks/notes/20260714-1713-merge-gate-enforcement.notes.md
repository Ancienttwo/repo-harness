# Implementation Notes: merge-gate-enforcement

> **Status**: Completed
> **Plan**: plans/plan-20260714-1713-merge-gate-enforcement.md
> **Contract**: tasks/contracts/20260714-1713-merge-gate-enforcement.contract.md
> **Review**: tasks/reviews/20260714-1713-merge-gate-enforcement.review.md
> **Last Updated**: 2026-07-14 19:53
> **Lifecycle**: notes

## Design Decisions

- The actual choke point is `contract-worktree finish`, not the earlier review artifact: the gate runs only after finish has produced the exact candidate commit.
- The host-only `merge-gatekeeper` agent is a tool-free runtime wrapper only. The cross-host fleet `gatekeeper` remains unchanged; the `merge-gate` skill is the sole enforcement review/output authority, and `scripts/merge-gate.ts` is the only receipt writer.
- The exact target base commit owns gate enablement. The OS account home's `~/.repo-harness/config.json#merge_gate` owns the absolute Claude binary, agent, and skill identity; protected helper resolution ignores caller HOME/source/helper overrides, so candidate policy and environment variables cannot replace them.
- The receipt lives under host state and binds repository root, base ref/SHA, head SHA, binary-diff SHA-256, host-runtime fingerprint (config, binary identity, agent, skill), and installed-helper fingerprint. It has no time-based freshness heuristic.
- Claude receives no tools and starts in an empty temporary directory. The trusted orchestrator supplies complete goal/diff/evidence bytes over stdin; deterministic commands run before the semantic gate and the gate never executes candidate code or reads candidate paths.
- The Claude runner does not set `CLAUDE_CONFIG_DIR`: explicitly setting it to the default-looking user path made Claude Code 2.1.209 ignore the existing macOS login, while the same allowlisted environment with ordinary `HOME` authenticated correctly. The runner still loads only user settings from the OS-account home.
- The agent frontmatter intentionally omits `tools: []`; Claude Code treated that declaration as disabling its hidden structured-output mechanism and returned plain JSON despite `--json-schema`. The orchestrator-owned CLI flag `--tools ""` remains the enforceable tool-denial boundary and the live schema canary now returns `structured_output`.
- Official protected-helper execution pins Bash, Git, Bun, and `gh` to installed host paths, overwrites caller tool variables, and replaces caller `PATH`; direct helper execution is not an authority boundary.
- Local merge preflight is read-only and rejects every dirty target state. It never removes even byte-identical untracked target files before a PASS verdict.
- Install `merge-gate` only to Claude; do not create a Codex skill projection or provider fallback.

## Deviations From Plan Or Spec

- Enforcement moved from only `ship-worktrees` to the earlier `contract-worktree finish` commit/merge boundary, with an additional ship recheck. FAIL/BLOCKED now rolls finish back to the pre-finish commit and restores active workflow artifacts.
- PR mode fetches the exact remote target before review and pushes the verified SHA explicitly. Local merge also names the verified SHA rather than a mutable branch ref.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Gate before finish | Rejected | The worktree is not yet represented by an immutable head SHA and finish would invalidate the receipt by committing. |
| Gate after candidate commit | Selected | The receipt identifies the exact push/merge candidate and can be revalidated without a lock service; a rejected verdict rolls the finish transaction back. |
| GitHub required check | Deferred | Local agent-driven ship is the only authorized path in this slice. |
| Agent and skill with the same name | Rejected | `merge-gatekeeper` names the runtime identity; `merge-gate` names the reusable protocol. |

## Open Questions

- None. The installed-package live Claude canary returned PASS and the installed helper immediately revalidated the SHA/diff-bound receipt.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused lifecycle tests: `tests/merge-gate.test.ts`
- End-to-end PR ship fixture: `tests/helper-scripts.test.ts`
- Full repository suite: `1436 pass / 1 skip / 0 fail` across 112 files.
- Focused gate lifecycle: `19 pass / 0 fail`; ship/rollback lifecycle: `4 pass / 0 fail`.
- Live installed runtime: PASS for head `3a0ac9664ee80b19a29cedff6d653768b5f3be57`, diff `sha256:5df437a14455e52245763cfd125bb6e9a92617036a45a97ab7fd090ff34e4568`.
- Independent architecture/security re-review: PASS with no CRITICAL/HIGH.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
