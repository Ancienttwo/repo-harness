# Harness Overview

The harness adds a workflow contract around an existing repository. Three
layers hold every workflow fact, and each fact has one source. Root
`AGENTS.md` and `CLAUDE.md` keep the invariants and point to these layers.

| Layer | Question | Source |
| --- | --- | --- |
| Flow | Who acts, when, and in what order | `repo-harness-issue-flow` skill |
| Roles | Which seat runs which model, and which sub-agents it may call | The `seats` section of `~/.repo-harness/config.json`; sub-agent roles in `agents/fleet/` |
| Tools | How an action runs | Herdr, the review and publication commands, `contract-worktree` |

## Flow

The GitHub issue and PR hold the task state. The issue holds the scope,
dependencies, boundaries and acceptance. The PR holds the change, checks,
risk and rollback. No plan, sprint, contract, review or notes file holds
task state.

- An orchestrator splits the goal into issues, dispatches work and
  integrates the results.
- A worker claims one issue and delivers one PR.
- An acceptor takes one review in one round of the PR.
- An integrator merges. Only `rh publication merge` runs this
  step.

The `repo-harness-issue-flow` skill owns the lifecycle, the seats, the
comment board and the templates. Read `SKILL.md` and its `references/`
files; this page does not repeat them.

Product intent lives in `docs/prds/*.prd.md`. Durable architecture lives in
`docs/architecture/archimap.html` and the capability pages that it links.
A repeated mistake lives in `tasks/lessons.md`.

An ordinary task records goal, scope, changes, verification, risk and
rollback in the PR description. A one-time decision goes in the issue.

## Roles

A seat is a process: the orchestrator, the advisor or a worker. A
sub-agent is an `agents/fleet/` role that runs inside a seat process. A
claim role (coordinator, writer, head owner, integrator, acceptor) is the
role that a GitHub claim gives on one issue or PR. The model choice is
advice, not a gate. Any host can fill a seat.

| Role | Suggested fit | Writes |
| --- | --- | --- |
| Orchestrator | Long-lived top-level session, strong reasoning model | Issues, comments and dispatch; no product code |
| Worker | Capable coding model | One issue's branch and PR |
| Acceptor | Fresh context, read-only; for High, two reviews of each head, at least one from a model family different from the writer's | Review threads and the acceptance record |
| Gap reviewer | Different family from the orchestrator | Comments on drafts; no scope decision |

`rh seats argv <seat>` prints the launch argv of the
orchestrator, advisor and worker seats. `agents/fleet/` holds the sub-agent
roles that a seat may call; the installer projects each role to Claude and
Codex. The High tier needs two reviews of each head, at least one from a
model family different from the writer's; the other can be a fresh
same-family context. Each review records `model_relation` in its receipt.

## Tools

- Worktree: create a task worktree at `{{system_tmp}}/{{repo}}-wt-{{slug}}`
  with `rh run contract-worktree start --issue <number>`. Commit
  or push before a reboot or temp cleanup. Closeout removes only merged,
  clean and unowned worktrees.
- Dispatch: run peers in herdr-core (`hc`) terminals that Herdr.app shows
  as panes. Receipt-bearing acceptance
  uses `rh review round`; its OAR host runs the reviewer. See
  [Herdr dispatch and notify](herdr-notify.md).
- Review: an acceptor returns one `AcceptanceReviewResult`. The session
  that runs the round publishes it with
  `rh review publish --pr <n> --receipt <path>`. The merge
  executor refuses an unresolved review thread that a person started. A
  thread that a review bot (a GitHub App account) started is advisory.
- Merge: `rh publication merge` runs only when
  `publication.acceptance_merge` is `on` on the PR base. Otherwise the
  owner merges.
- CI: run typecheck and the affected tests on the PR head. Run the full
  suite daily and before a release. A pending main-push run does not block
  the next merge.
- Architecture: read `docs/architecture/archimap.html` and the linked
  capability pages. Update the architecture model only for a real
  responsibility change.

## Boundaries

- Main merge requires current-task authorization, passing checks on the
  exact head, no unresolved review threads that a person started and a
  current base. Review bot threads are advisory.
- Delete automatically only merged, clean, unowned worktrees and branches.
  Ask the user for every other deletion.
- Credentials, permissions, sandbox grants and confirmation bypass need
  user approval of the exact change.
- Release and production effects need user approval of the exact artifact
  and operation.

## Adoption and configuration

`rh init` writes the workflow marker, the policy file and the
root context files. `assets/workflow-contract.v1.json` is the contract.
`.ai/harness/workflow-contract.json` is the opt-in marker.

- Reference docs: `assets/reference-configs/` is the canonical set.
  `docs/reference-configs/` is its byte-identical projection. Run
  `bun scripts/sync-reference-configs.ts --check` after an edit.
- Install, update and package managers: [External tooling](external-tooling.md).
- Documentation profile: `minimal-agentic` by default. Required docs are
  `docs/spec.md` and the architecture entry. Create optional docs only
  with evidence or a user request; see [Document generation](document-generation.md).
- Capability context: the architecture model or the capability registry
  declares each capability. Keep paired contract files aligned with
  `rh capability-context status|sync`.
- Evidence and retention: the PR and CI hold current proof.
  `rh retention` archives ignored local evidence after a window.
  `docs/researches/` and `tasks/lessons.md` are advisory memory.
- Hooks: [Hook operations](hook-operations.md). User-level rules:
  [Global working rules](global-working-rules.md).
