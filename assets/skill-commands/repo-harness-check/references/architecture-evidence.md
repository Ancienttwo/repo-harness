# Architecture and refactor evidence

Bot reference. repo-harness supplies tools and evidence. The Bot decides what
to schedule. No hook schedules architecture or refactor work.

Read evidence in the target worktree for the subject revision. Read it again
after edits. `check` and `recommendations` write no repository files.
`apply` and `decide` write; run them only inside authorized scope.

## When to read

Read the cheap diff-scoped evidence when a worker reports `done` for a branch
that changed source, `.archcontext/model/` or `docs/architecture/` files. A
Herdr `done` push is one such report. Also read it before you request review of
such a branch, and when the user asks about architecture drift or ownership. A
`blocked` report or a branch without such changes needs no architecture
evidence.

At `done`, run only the cheap checks below: path ownership, and
`architecture-projection check` when the model or documents changed. Do not run
`repo-harness refactor recommendations --json` at `done`. Run it once per merge,
on a fixed checkout and branch (the main checkout after the merge), or when the
user asks about refactors. The scan covers the whole repository, takes about
30 s and gives the same output on every branch.

Read the cheap signal first:

1. Ownership of new paths. Pipe the added, copied and renamed destinations,
   for example from
   `git diff --name-only --diff-filter=ACR <base>...HEAD -- . ':!.archcontext' ':!docs'`,
   to `repo-harness run capability-resolver match --repo <repo> --paths-from - --format json`.
   An entry with `"matched": false` has no capability owner. Act only on source
   or runtime config files. Plans, task files and CI files need no owner. Have a
   `repo-harness-architecture` worker claim an unowned source file in the same branch.
2. Documents. Run the `check` below. It can take a minute on a large model.
   `freshness.staleNodes` names the capabilities whose generated sections are stale.
   Save the check output to a file. Give the file to `repo-harness module list`
   or `module review-prompt` with `--projection-check <file>`. Then
   `generated_summary` is `fresh` or `stale`. Without the file it is `unknown`.
   The file must come from a check at the current HEAD.

Human-written sections have a citation signal. Run
`repo-harness architecture-projection anchors --json`. The command is read-only
and writes no file. It lists cited paths that are missing, line numbers out of
range, symbols that are missing and lines that moved. It reads all human-written
text after the generated summary, including §3, §4 History, the backlog and the
node prose. A finding does not fail the command. The anchors report carries no
commit. Run the command at the same HEAD as the review, on a clean worktree.
Save the output to a file and give it to `repo-harness module review-prompt <id> --anchors <file>`.
The prompt then has a STALE CITATIONS section.

## Architecture documents

Run `repo-harness architecture-projection render-check --json`. It reads the
per-target output decisions from the managed provider. Source-stamp changes do not fail it.
`renderEquivalent: null` means the check could not cover all targets; it is not
a clean result. The command exits 1 for false or null. It needs CodeGraph facts.
Use `repo-harness architecture-projection status --json` for provider readiness.
Agents fix model debt and human prose in their feature PR. The upstream rolling
writer publishes generated files. Do not run apply to refresh a feature PR.

| Result | Meaning | Bot decision |
| --- | --- | --- |
| `renderEquivalent: true` | Generated output matches; source stamps may differ. | Schedule nothing. |
| `renderEquivalent: false` | archctx reports changed output in `differingPaths`. | Inspect `bun run architecture:writer status` and the open rolling PR. An open rolling PR waits for the owner's GO. Without one, repair the writer or the reported model debt. The writer publishes generated output. |
| `human-action-required` with `unresolved-major-change` | ArchContext observed a major change that no rolling PR merge accepted yet. The writer accepts proven changes, so the writer did not run, its rolling PR is open, or the proof is unprovable. | Inspect `bun run architecture:writer status` and the open rolling PR. An open rolling PR waits for the owner's GO; its merge is the acceptance. A writer result with `unprovable-required-flow` or `projectionStatus: "applied-partial"` needs the missing proof in a model PR; start from `repo-harness architecture-debt --json`. A feature worker does not commit generated docs. |
| Other `humanActions` reason codes, or `adoption-required` | Ownership, conflict or proof needs a decision; coverage is incomplete. | Assign the bounded model or adoption repair. Preserve the writer as owner of subsequent generated updates. |
| Command error, `blocked` or a failure status | Environment, provider or incomplete render check. | Read the check and writer logs. Fix the reported cause; do not synthesize output or refresh stamps. |

## Refactor suggestions

Run `repo-harness refactor recommendations --json`. The result
`repo-harness.refactor-recommendations/v2` has a `status` and `candidates`.
Each candidate gives its kind, subject, risk, confidence, uncertainty,
`metrics`, bounded `evidence` and module statistics. The `evidence` has a
`kind`, a `totalCount`, a `truncated` flag and the first items. Module
statistics are files, lines, fan-in, fan-out, cycles, direction violations
(filled only when the model declares constraints) and unresolved imports.
archctx 0.9.1 does not measure instability or test files, so they are not shown.
A suggestion recorded by an earlier scan has `snapshot: "earlier"` and its own
`baselineSnapshotDigest`. It keeps its recorded metrics and evidence and shows
no module statistics, because the current scan measured a different snapshot.

| Status | Bot decision |
| --- | --- |
| `recommended` | Show the candidates and their evidence to the user, or schedule a bounded refactor task in the normal plan and pull request flow. |
| `no_action` | Schedule nothing. |
| `proof_required` | The message names the cause. Missing code facts: run `codegraph init`. `code-facts-import-limit`: run again with a larger `--import-node-limit <n>` and use the same value on `decide`. Ambiguous ownership: schedule a model ownership fix. |
| `unavailable` | Read `code`, `action` and `message`. A missing model or provider means schedule nothing. A code with an `action` has a fix: do it first. |

Record only a decision that the user made:
`repo-harness refactor decide <id> accept|defer|reject --reason "<text>"`.
A decided suggestion is not shown again in the same worktree path and branch
(Ancienttwo/arch-context#321). `decide` works for a recorded id or a fresh
candidate in one call. Pass `--import-node-limit` if the scan used one. A
suggestion is evidence. It does not authorize a refactor.
