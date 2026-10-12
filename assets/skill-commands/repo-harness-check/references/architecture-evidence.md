# Architecture and refactor evidence

Bot reference. repo-harness supplies tools and evidence. The Bot decides what
to schedule. No hook schedules architecture or refactor work.

Read evidence in the target worktree for the subject revision. Read it again
after edits. `check` and `recommendations` write no repository files.
`apply` and `decide` write; run them only inside authorized scope.

## When to read

Read this evidence when a worker reports `done` for a branch that changed
source, `.archcontext/model/` or `docs/architecture/` files. A Herdr `done`
push is one such report. Also read it before you request review of such a
branch, and when the user asks about architecture drift, ownership or
refactors. A `blocked` report or a branch without such changes needs no
architecture evidence.

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

Human-written sections have no drift signal. When a branch moves, renames or
deletes a file or symbol, ask the worker to search the affected module pages
for those names.

## Architecture documents

Run `repo-harness architecture-projection check --json`. The result is an
ArchContext `ProjectionResultV2`. The command exits 1 when the status is not
`noop`. Use `repo-harness architecture-projection status --json` when the
provider state is unclear.

| Result | Meaning | Bot decision |
| --- | --- | --- |
| `noop` | Documents match the model and the source. | Schedule nothing. |
| `planned`, only `docs/architecture/.projection-manifest.json` in `files` | Source changed; rendered content did not. | Have the branch worker run `repo-harness architecture-projection apply --json` and commit the manifest. |
| `planned`, other `docs/architecture/` files | Rendered content changed. | Assign a `repo-harness-architecture` worker in the same branch. It checks the model, then runs `apply` and commits the documents. |
| `human-action-required` with `unresolved-major-change` | ArchContext observed a major change. | The same worker runs `apply`. `apply` accepts the observed change; the pull request review is the human gate. |
| Other `humanActions` reason codes, or `adoption-required` | Ownership, conflict or proof needs a decision. | Assign a `repo-harness-architecture` worker. Report to the user when ownership is ambiguous. |
| Command error, `blocked` or a failure status | Environment or provider problem. | Fix the environment first. For missing code facts, run `codegraph init`. Do not schedule model work from this result. |

## Refactor suggestions

Run `repo-harness refactor recommendations --json`. The result
`repo-harness.refactor-recommendations/v2` has a `status` and `candidates`.
Each candidate gives its kind, subject, risk, confidence, uncertainty, metrics
and affected module statistics.

| Status | Bot decision |
| --- | --- |
| `recommended` | Show the candidates and their evidence to the user, or schedule a bounded refactor task in the normal plan and pull request flow. |
| `no_action` | Schedule nothing. |
| `proof_required` | Code facts are incomplete or file ownership is ambiguous. The message names which. Run `codegraph init`, or schedule a model ownership fix, before you use this evidence. |
| `unavailable` | No model or no provider. Schedule nothing. |

Record only a decision that the user made:
`repo-harness refactor decide <id> accept|defer|reject --reason "<text>"`.
A decided suggestion is not shown again. A suggestion is evidence. It does not
authorize a refactor.
