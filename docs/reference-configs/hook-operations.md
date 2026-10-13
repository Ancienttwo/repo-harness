# Hook Operations Reference

> Full troubleshooting runbook: `brain/repo-harness/runbooks/runbook-repo-harness-hook-troubleshooting.md`.

## Hook Authority Map

There is one host-event runtime. The observable path is:

1. `~/.claude/settings.json` and `~/.codex/hooks.json` send host events to
   `repo-harness-hook`.
2. The runtime validates the opt-in contract at
   `.ai/harness/workflow-contract.json` and resolves the repository root.
3. The route registry matches `(event, routeId, matcher)` and invokes exactly
   one typed in-process handler.
4. The handler returns a structured result; the runtime applies host-safe output
   shaping and records the route trace. A route never dispatches to a second
   handler or to a shell runtime.

The stable route tuple is the adapter contract. Handler identities are internal
authority names and are not selected by installation location or host provider.
The runtime checks that a route is installed for the host before a handler
runs. Handlers do not check the host.
Codex must trust `~/.codex/hooks.json` in Settings before it executes the
adapter. Generated adapters use 30 seconds except `Stop.default`. That entry
keeps its 150-second deadline until the route-registry trust transition (#698).
Pi gives Stop 30 seconds. Stop has no deferred work: it publishes the evidence
checkpoint and renders the handoff and resume views. Stop does not run
architecture projection and does not record architecture drift.

Measure `Stop.default` and `SubagentStop.quality` separately using
`.ai/harness/runs/hook-events.jsonl` `elapsed_ms`. The terminal's Working
time is the whole turn, not the duration of its currently displayed hook.

This table is the one route inventory. It lists the 12 entries of `ROUTES` in
`src/cli/hook/route-registry.ts`, in registry order. The Host column follows the
`hosts` field of each route: Claude installs 9 routes, Codex installs 12, and
Pi installs 6. Other documents link here. They do not copy this table.

| Route | Matcher | Host | Typed handler | Responsibility |
| --- | --- | --- | --- | --- |
| `SessionStart.default` | all sessions | Claude, Codex, Pi | `session-context` | Emit the Effective State section first, then the owed-architecture, pending-plan, active-sprint and resume sections under one budget. |
| `PreToolUse.edit` | `Edit\|Write` | Claude, Codex, Pi | `mutation-guard` | Block an edit outside the repository, under `_ref/` or `_ops/`, or without a parseable target path. |
| `PreToolUse.subagent` | `Task\|Agent\|SendUserMessage` | Claude, Codex | `return-channel` | Append the return-channel contract and the board slice to a `Task` or `Agent` prompt. A `SendUserMessage` call gets no output. |
| `PostToolUse.edit` | `Edit\|Write` | Claude, Codex, Pi | `retired-observer` | Retired. Exit 0 with no output and no writes. The route stays installed until #698. |
| `PostToolUse.bash` | `Bash` | Claude, Codex, Pi | `command-observed` | Count a known failing test run in the RepairLimit circuit when the payload has an exit status (Pi only). Report owed architecture updates after a publication command. |
| `PostToolUse.always` | all tools | Claude, Codex | `retired-observer` | Retired. Exit 0 with no output and no writes. The route stays installed until #698. |
| `UserPromptSubmit.default` | all prompts | Claude, Codex, Pi | `prompt` | Add the `[OperationBoundaries]` line when the prompt starts with an explicit workflow command. |
| `UserPromptSubmit.inbox` | all prompts | Claude, Codex | `task-inbox` | Deliver task messages at the turn boundary, outside prompt handling. |
| `UserPromptSubmit.delegation` | all prompts | Codex | `delegation-advisor` | Render the `policy.json` delegation rules for an explicit `/delegate` or `/parallel` prompt. |
| `SubagentStart.context` | subagent start | Codex | `subagent-context` | Record the native role and model observation. Add the bounded child context and the board slice. |
| `SubagentStop.quality` | subagent stop | Codex | `subagent-quality` | Add one advisory note when the child's final report is too thin or has no evidence. |
| `Stop.default` | session stop | Claude, Codex, Pi | `stop` | Publish the evidence checkpoint and render handoff and resume. Claude can get the owed-architecture line. |

The route-registry trust transition (#698) removes `PostToolUse.edit` and
`PostToolUse.always`, retires `UserPromptSubmit.default` and
`SubagentStop.quality`, and narrows the hosts of `PreToolUse.subagent`. Until
then, the tuple above stays unchanged.

## Host Output

The runtime alone writes to the host. Handlers return text; they never write to
a host file descriptor.

- Exit 0: handler stdout is advice for the Agent. The runtime writes it as one
  `{"hookSpecificOutput":{"hookEventName":"<event>","additionalContext":"..."}}`
  envelope on Claude and Codex. Output that is already a decision or an
  envelope goes out unchanged. Neither host gives plain stdout of `PreToolUse`,
  `PostToolUse` or `Stop` to the model, and Codex reads no plain stdout.
- Codex `Stop` writes no bytes. Codex Desktop renders Stop JSON as
  "Unsupported content type".
- stderr is for operators. No host gives stderr of a successful hook to the
  model. A successful Stop writes nothing to stderr.
- A non-zero exit keeps its refusal channel. Claude reads stdout and stderr.
  Codex gets both on stderr.
- Pi uses `--format json`. Its SessionStart sections reach `additional_context`.

No shell operator library exists. Product changes to handler behavior belong
in `src/cli/hook/` and its tests. Run packaged helpers with
`repo-harness run <helper>`. `prepare-handoff` runs only
`recovery-view-cli.ts`. `summarize-failures` reads the same `FAILURE_LOG_FILE`
that the edit guard writes.

Init and upgrade preserve an old `.ai/hooks/lib/workflow-state.sh`, including
edits. Doctor reports it as legacy. Change its callers to
`repo-harness run <helper>`. Test the callers. Back up the old file before
manual removal. Review local changes first.

The prompt handler reads only the payload `prompt` field. A prompt that starts
with `/setup`, `/init`, `/plan`, `/execute`, `/run`, `/check`, `/verify` or
`/handoff` gets one `[OperationBoundaries]` line. Every other prompt gets no
output. The handler does not classify intent, check a contract or a receipt,
or route to `/think`.

The delegation advisor runs only for a prompt that starts with `/delegate` or
`/parallel`. It renders `delegation.rule` and `delegation.runner_rule` from
`.ai/harness/policy.json` word for word. The caps are fixed in the handler: 2
agents, 3 for a high-risk workflow profile, and spawn depth 1. Policy numeric
fields are not read. Missing or empty policy text exits 1 with the reason
`delegation-policy-invalid`. The advisor keeps no state.
`.ai/harness/delegation/` holds only the native-role evidence and
`subagent-stop-quality.json`.

`SessionStart` resolves Effective State once. The `[HarnessState]` section, or
`[HarnessStateUnavailable]` when the resolution fails, comes first and always.
Optional sections follow in priority order: `architecture-owed`,
`pending-plan-capture`, `active-sprint` and `resume`. Each section names its
source. The resume file itself decides whether a `resume` section exists. A
provider that throws becomes one `[SessionContextProviderFailed] <id>` line.
One budget of 1,500 estimated tokens applies to the whole payload. Mandatory
sections stay. An optional section that does not fit becomes
`[ContextRef:<id>] <source>`.

`SessionStart` runs no security scan, no tooling update check and no worktree
sweep. It writes no run identity. Run `repo-harness security scan --json` or
`repo-harness setup check --check-updates --json` when a task needs them.
`contract-worktree start` runs the managed worktree sweep.

The hook identity is the payload `session_id`, `run_id` and `turn_id`. A missing
value stays null. No hook mints or stores an id.

`UserPromptSubmit` output is advisory. `PreToolUse.edit` is the only blocking
edit check, and no policy mode changes it. Stop and observer handlers never
spawn an LLM or a long-running worker.

## Host and Adoption Operations

`repo-harness init` installs the user-level adapters, writes the workflow
contract, and writes package helper guidance in `.ai/hooks/README.md`.
It does not copy the operator library into consumer repositories.
It removes retired generated hook entry scripts by exact manifest ownership and
does not create a repo-local dispatcher. Project-level `.claude/settings.json`
and `.codex/hooks.json` are user-owned legacy inputs and should be reviewed
manually during migration rather than treated as runtime authority.

If an adapter is missing, inspect `repo-harness install --state`, refresh the
recorded host profile, and trust the Codex settings entry. Do not edit generated
adapter commands by hand. The route registry and the adapter manifest must agree
on the route tuple; a mismatch is a fail-closed installation error.

## Hook Failure Playbook

When a hook blocks work:

1. Read the terminal output. A denial writes one `[<Guard>] <reason>` line and
   one `Fix:` line to stderr.
2. Read `.ai/harness/failures/latest.jsonl` for the durable failure record. It
   carries the payload run id, or null.
3. Read `.ai/harness/runs/hook-events.jsonl` for the route, exit code, reason
   and elapsed time of each hook event.
4. Use the external runbook for extended examples and historical failure modes.

Edit guards:

- `RepoScopeGuard`: the target path is not a canonical path inside the
  repository.
- `ExternalReferenceGuard`: the target is under `_ref/`.
- `OpsPrivateGuard`: the target is under `_ops/`.
- `ApplyPatchScopeGuard`: Codex `apply_patch` input has no parseable target
  path.
- `EditScopeGuard`: an `Edit` or `Write` call has no `tool_input.file_path`.

`RepairLimit` stops a repeated failing test run on Pi. It needs the payload
exit status, which only Pi sends.

Circuit-breaker updates lock the complete read-modify-write, wait at most two
seconds, and fail closed. They never reclaim a stale-looking lock. After
verifying that no hook process is active, an operator may remove
`.ai/harness/state/circuit-breaker.json.lock` and retry.

The circuit breaker keeps two kinds: `repair` and `semantic-review`. A state
file from an older runtime fails closed when it has protocol 1 or a retired
kind (`guard`, `review`, `subagent`, `cross-model-consult` or
`minimal-change`). The error names the one-shot cleanup. Run
`repo-harness run evidence-gc --repo <path>`, or
`bun scripts/evidence-gc.ts --repo <path>` in this source checkout.

## Architecture Drift and Parity

Hooks do not record architecture drift. They keep no queue and no drift cursor,
and they run no projection or LLM work. Architecture updates are explicit:

- `repo-harness run workstream-sync` maintains durable capability workstreams.
- Agents read architecture documents on demand and update real boundaries explicitly.

`repo-harness state resolve --json` reports `capability_ownership`. It is a
projection of the ownership answer that state resolution already computed:
`review_base`, `capability_ids`, each capability's `module_document` and owned
`paths`, and `unowned_paths`. It is `null` when ownership was not computed: no
implementation path, an absent registry, an ownership blocker, or capability
ids that the caller declared.

A capability is owed when one of its owned implementation paths in the review
subject changed after the last change to
`docs/architecture/.projection-manifest.json`. ArchContext is the only
ownership authority, and Git gives the changed set: one `git log` and one
`git status`. `SessionStart` uses the ownership answer of its own state
resolution. `PreToolUse.edit` resolves the owners of the edited paths only. It
takes no state lock and runs `git status` only for an owned path. `Stop`,
`PostToolUse.bash` and `state owed` run one read-only ownership resolution of
their own for the review subject. An uncommitted manifest change counts as the
newest change. A checkout without the manifest, or a repository without a
capability registry, is `not_projected`. The owed report has at most
three lines: the capability and its module document, new unowned source paths,
and the next step (`repo-harness architecture-projection check --json`, then
the worker flow of the `repo-harness-architecture` skill). It is evidence, not
a gate.

The Agent gets the report at these points:

| Point | Hosts | When |
| --- | --- | --- |
| `PreToolUse.edit` | Claude, Codex | `[CapabilityOwner]` line on the first edit of an owned path after its last commit |
| `SessionStart.default` | Claude, Codex, Pi | the branch already owes updates |
| `PostToolUse.bash` | Claude, Codex | after a `git commit`, `git push` or `gh pr create` that is not known to fail; Claude and Codex send no exit status, so every such command counts |
| `Stop.default` | Claude only | once per branch and owed set; nothing when `stop_hook_active` is true |

CI and operators use the same rule without hooks:

```bash
repo-harness state owed --json                     # policy review base
repo-harness state owed --json --base origin/main  # pull request base
```

The command writes nothing. A document exits 0, owed or not. `status` is
`owed`, `clear` or `not_projected`. A repository without a capability
registry gets a `not_projected` document. An unknown base, a malformed
registry or unavailable ownership (for example, archctx cannot run) exits 1
with the reason on stderr.

Agents author semantic snapshots and diagrams. Hooks do not spawn LLM agents or
long-running commands. Deterministic execution belongs in explicit CLI commands
such as `scripts/contract-run.ts`.

Validate the typed route registry with `bun test` and
`repo-harness init --repo . --dry-run`.

## Evidence Retention

`.ai/harness/runs/` holds these records. Only the run summary is disposable
history:

| File | Writer | Retention owner |
| --- | --- | --- |
| `${runId}.json` carrying the resolved projection paths | none now; Stop and the shell `prepare-handoff` writer wrote it | `evidence-gc` deletes this shape for one release |
| `${runId}-${contractSlug}.json` (`schema: repo-harness-run-trace.v1`) | `verify-sprint.sh` | none; a checks projection reads it back at acceptance finalization |
| `verification-${executionId}.json` / `.log` | `verification-execution.ts` | none; immutable, bound by sha256 in the evidence ledger |
| `hook-events.jsonl` | hook telemetry | `hook-event-log.ts`, on rotation: 8 MB segments, 256 MB or 32 archived segments |
| ad-hoc `*.json` reports | operator scripts | none; each report owns its own file |

Evidence checkpoints under `.ai/harness/evidence/checkpoints/` are owned by
`checkpoint-store.ts`, which keeps only the checkpoint the published marker
names and prunes inside every successful publish.

The unowned rows are not leaks. Operator reports own their own files; the
other two are durable evidence. A frozen acceptance
snapshot shares the run summary's `run-` prefix, and a missing verification
record makes `readValidRunResult` report an absent baseline, which fails a
`baseline_with_delta` criterion permanently because a rerun only mints a new
execution id. The one-release cleanup therefore deletes only records with the
run-summary shape -- a `run_id` plus `handoff_file`, `policy_file`, and
`context_map_file` -- and leaves every other shape to its owner.
The shape, not `reason`: that field is free-form operator text.

Checkpoint retention was added in 0.19.0. A repository upgraded from an earlier
version carries a checkpoint per Stop, each one a whole-ledger snapshot -- on a
long-running repository that reaches multiple gigabytes. The next successful Stop
after the upgrade prunes the entire backlog on its own, so no action is normally
required.

Run `repo-harness run evidence-gc` when that Stop will not come:

```bash
repo-harness run evidence-gc --repo . --dry-run   # report reclaimable bytes
repo-harness run evidence-gc --repo .             # apply the same policies now
```

It applies the checkpoint policy above and never defines its own. Use it for a
repository whose ledger was reset (publication skips quietly with no ledger), one
that no longer runs the harness, or when the space is needed before the next
Stop. It exits non-zero and names every entry it could not reclaim.

For one release, `evidence-gc` also runs two cleanups. It deletes the run
summaries that Stop no longer writes. It removes retired circuit-breaker kinds
and deletes a protocol-1 circuit-breaker state file. Both cleanups go away in
the next release.

## Verification Checklist

After handler or workflow-contract changes, run:

```bash
bun test
repo-harness run check-task-sync
repo-harness run check-task-workflow
repo-harness init --repo . --dry-run
```
