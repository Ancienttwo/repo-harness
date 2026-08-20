> **Archived**: 2026-08-20 20:42
> **Related Plan**: plans/archive/plan-20260820-1902-envelope-pin-mergegate-leakscan.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-2042

# Implementation Notes: envelope-pin-mergegate-leakscan

> **Status**: Active
> **Plan**: plans/plan-20260820-1902-envelope-pin-mergegate-leakscan.md
> **Contract**: tasks/contracts/20260820-1902-envelope-pin-mergegate-leakscan.contract.md
> **Review**: tasks/reviews/20260820-1902-envelope-pin-mergegate-leakscan.review.md
> **Last Updated**: 2026-08-20 19:02
> **Lifecycle**: notes

## Design Decisions

- The bash round-trip rewrites the published command instead of re-quoting it. `advanceCommand` is module-private, so the test reads `envelope.command` from the real `state next --json` projection, asserts the fixed `repo-harness run sprint-backlog ` prefix, and replaces exactly that prefix with a single-quoted temp script path. Everything after the prefix is handed to `bash -c` untouched, so bash — not the test — tokenizes the `--task` value. The script is `printf '%s\0' "$@"`, and argv is recovered by splitting stdout on NUL, which is the only separator no corpus string can contain.
- The corpus is bounded by the backlog grammar, not by convenience. `|` and newline are unreachable in a Markdown table cell and `backlogRows` trims the cell, so the whitespace case keeps its spaces and tabs internal. Every remaining shape that makes single-quote escaping non-trivial is present, including the literal `'\''` sequence the escaper itself emits. All 12 recovered argv values were byte-identical on the first run, so the contract's falsifier did not fire.
- `shellArgv` gets a tripwire, not a parser. The check sits after the backslash-escape branch, so an explicitly escaped `\"` still parses; only an unquoted `"` or newline fails. Completing the parser would have added a second shell grammar to maintain against real bash — the exact drift the ledger row was filed about.
- The leak scan reads added lines only, from the same `Candidate` the seal binds, so it judges what this candidate introduces rather than what the base already carries. `diff` is captured with `--binary`; `Buffer.toString("utf-8")` substitutes replacement characters for non-UTF-8 hunks rather than throwing, which keeps a binary blob from being reported as a scanner malfunction.
- Pattern choice favours anchored vendor token shapes (fixed prefix plus fixed length) over entropy heuristics: a false positive blocks a merge with no allowlist to escape through, so recall was traded for precision deliberately. The pattern literals in the scanner source do not match themselves (`AKIA` is followed by `[` in the source, never by 16 uppercase characters), so merge-gate's own file can pass its own scan.
- Findings are redacted by construction: the message carries the pattern id and the file name parsed from the `+++ b/<path>` header, never the matched line. merge-gate writes to stderr, which lands in CI logs and terminal scrollback — printing the match would relocate the secret rather than block it.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Scan added lines vs. the full diff | Added lines only | The gate decides on what the candidate introduces; scanning context lines would fail candidates for a pre-existing base condition they cannot fix |
| Entropy/heuristic detection vs. anchored vendor shapes | Anchored shapes | No allowlist exists by contract, so every false positive is an unescapable merge block |
| Seed the leak fixture with a new file vs. an existing one | Existing `feature.txt` | A new top-level path changed the fixture's Change Assessment to `blocked`, failing before the scan; overwriting a file already in the candidate keeps the fixture's acceptance receipt ready |

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
