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
adapter. All managed entries use a 30-second deadline.
Stop has no deferred work: it publishes the evidence
checkpoint, renders the handoff and resume views, and reports protected path
changes. Stop does not run architecture projection and does not record
architecture drift.

Measure `Stop.default` using
`.ai/harness/runs/hook-events.jsonl` `elapsed_ms`. The terminal's Working
time is the whole turn, not the duration of its currently displayed hook.

This table is the one route inventory. It lists the 7 entries of `ROUTES` in
`src/cli/hook/route-registry.ts`, in registry order. The Host column follows the
`hosts` field of each route: Claude installs 6 routes and Codex installs 5.
Other documents link here. They do not copy this table.

| Route | Matcher | Host | Typed handler | Responsibility |
| --- | --- | --- | --- | --- |
| `SessionStart.default` | all sessions | Claude, Codex | `session-context` | Emit the Effective State section first, then the edit-guard-scope, architecture-debt and pending-plan sections under one budget. |
| `PreToolUse.edit` | `Edit\|Write` | Claude, Codex | `mutation-guard` | Block an `Edit`, `Write` or Codex `apply_patch` target outside the repository, under `_ref/` or `_ops/`, or without a parseable target path. Bash writes skip it; see [Edit guard coverage](#edit-guard-coverage). |
| `PreToolUse.subagent` | `Agent` | Claude | `return-channel` | Append the return-channel contract, standing orders and board slice to a Claude `Agent` prompt. |
| `PreToolUse.bash` | `Bash` | Claude | `bash-mutation-guard` | Check literal write destinations under `_ops/`, `_ref/` or outside the repository. Unsupported shell syntax remains unchecked. |
| `UserPromptSubmit.inbox` | all prompts | Claude, Codex | `agent-notice` | Deliver architecture debt on Codex; Claude emits nothing. |
| `SubagentStart.context` | subagent start | Codex | `subagent-context` | Record the native role and model observation. Add the bounded child context, standing orders and board slice. |
| `Stop.default` | session stop | Claude, Codex | `stop` | Publish the evidence checkpoint and render handoff and resume. Report protected path changes. Claude can get architecture debt. |

After upgrading the package, reinstall the host adapters. Codex must trust the
new command tuples once. Old adapters invoke removed routes and get exit 2.
`repo-harness hook` is removed. Use `repo-harness-hook` for direct hook calls.
Doctor reports projection mismatch and a missing hook bin. The new runtime
returns exit 2 for a removed tuple or an unsupported host route.

Publication-command architecture and `[PostBash]` advisories no longer reach
the Agent. Claude and Codex get debt context at SessionStart. Claude
also gets it at Stop. Codex gets it at UserPromptSubmit. No route observes `PostToolUse`.

## Standing orders

The standing-orders register is adapted from pstack (cursor/plugins, MIT, Lauren Tan).
The user or parent edits `.ai/harness/standing-orders.md` in each checkout.
Git ignores this file. Use consecutive `N. text` lines from 1, with no headings.
Missing, empty, invalid or unreadable files add no block and cause no error.
Both routes above use one renderer and preserve the register text verbatim.
The block starts with `[repo-harness:standing-orders]` and is at most 1500 UTF-8
bytes, including the marker and any truncation line.
A truncated block ends with `... (truncated; read .ai/harness/standing-orders.md)`.
Claude inserts it after the return-channel text and before the board slice.
Codex includes it in `additionalContext` before the board slice.
Claude skips the block when its prompt already has the marker.
Codex adds one block to the fresh context it builds for each `SubagentStart` event.

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
  model. A failed debt observation writes one diagnostic line and keeps exit 0.
- A non-zero exit keeps its refusal channel. Claude reads stdout and stderr.
  Codex gets both on stderr.

No shell operator library exists. Product changes to handler behavior belong
in `src/cli/hook/` and its tests. Run packaged helpers with
`repo-harness run <helper>`. `prepare-handoff` runs only
`recovery-view-cli.ts`. `summarize-failures` reads the same `FAILURE_LOG_FILE`
that the edit guard writes.

Init and upgrade preserve an old `.ai/hooks/lib/workflow-state.sh`, including
edits. Doctor reports it as legacy. Change its callers to
`repo-harness run <helper>`. Test the callers. Back up the old file before
manual removal. Review local changes first.

No hook answers `/delegate` or `/parallel`. `.ai/harness/delegation/` holds
only the native-role evidence.

`SessionStart` resolves Effective State once, read-only. It writes no state,
and its `state_version` is the last version that `repo-harness state resolve`
published. The `[HarnessState]` section, or
`[HarnessStateUnavailable]` when the resolution fails, comes first and always.
The `architecture-debt` section follows at priority 2 and is mandatory when
present. Its 800-byte limit keeps it bounded. `pending-plan-capture` remains
optional. Each section names its source. SessionStart does not
inject the resume body. `references.resume` points to its file. Effective
State carries no sprint pointer or task contract evidence. A provider that
throws becomes one `[SessionContextProviderFailed] <id>` line.
One budget of 1,500 estimated tokens applies to the whole payload. Mandatory
sections stay. An optional section that does not fit becomes
`[ContextRef:<id>] <source>`.

`SessionStart` runs no security scan, no tooling update check and no worktree
sweep. It writes no run identity. Run `repo-harness security scan --json` or
`repo-harness setup check --check-updates --json` when a task needs them.
`contract-worktree start` runs the managed worktree sweep.

The hook identity is the payload `session_id`, `run_id` and `turn_id`. A missing
value stays null. No hook mints or stores an id.

`UserPromptSubmit` output is advisory. `PreToolUse.edit` blocks invalid edit
targets. `PreToolUse.bash` blocks known protected write targets. No policy mode changes them. Stop and observer handlers never
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

### Edit guard coverage

`PreToolUse.edit` matches `Edit|Write`. On Codex it also reads `apply_patch`
input. Claude also has a separate `PreToolUse.bash` tripwire in both install
profiles. Codex shell tools have no Bash route. The tripwire is not a complete
shell parser. Bash writes get no `[CapabilityOwner]` line. #764 and #766 removed
`PostToolUse.bash` after each call paid about 5 seconds. That route stays absent.

The Bash handler checks command strings without Effective State, Git or owner
resolution. Only a suspicious literal destination runs the shared path guard.
It recognizes `>` and `>>`, `tee -a`, single-file `sed -i`, `rm`, `mv`, `cp`
destinations, and literal Python `open`/`Path` and Node file-write calls in
`-c`/`-e` source or a heredoc. Read operands and quoted shell examples do not
count as writes. A literal `cd DIR &&` changes the target base. Other `cd` forms
leave subsequent relative targets unchecked. A glob below a literal
protected directory also triggers the check.

A known `_ops/`, `_ref/` or outside-repository destination gets exit 2 and the
same guard diagnostic and failure record as an edit. Bash uses a repository-only
boundary; Edit/Write retains its verified external absolute-path allowance.
`/dev/null`, `/dev/stdout`, `/dev/stderr`, `/dev/tty` and numeric `/dev/fd/N`
targets are output streams and pass.

Missing absolute host `cwd`, commands above 64 KiB, variable expansion,
grouping, unsupported options, indirect scripts, code generators, `eval`,
`sh -c`, `git checkout`, `find` and `xargs` can skip the tripwire. Symlink aliases
without a protected or external path token can also skip it. Interpreter checks
recognize literal call text; they do not evaluate Python or JavaScript control
flow. The unparsed remainder passes. A handler failure exits 1 and does not block.
More than one heredoc on a line or an unresolved delimiter leaves the remaining
command unchecked. Earlier parsed targets still get checked. This is a tripwire,
not proof that an allowed command cannot write private files.

The `edit-guard-scope` SessionStart section tells the Agent this limit on every
host, also when Effective State is unavailable: Claude Bash has only a literal
tripwire; use the edit tools to change
repository files, and use Bash to run commands.

Stop reports a change under `_ops/` or `_ref/` after the fact. The guard denies
every `Edit`, `Write` and `apply_patch` target there, so a change there came from
Bash, a script or the person. The report cannot tell which one. It does not block.

- Stop walks `_ops/` and `_ref/` with `lstat`. It does not follow symbolic links.
  It records the size and mtime of each entry in the Git-ignored
  `.ai/harness/state/protected-paths.json`. A state path that Git does not
  ignore gets no write and one stderr diagnostic.
- Stop compares the walk with the manifest of the previous Stop, and reports
  added, modified and deleted paths. The first Stop records the baseline and
  reports nothing. When both directories are absent, the baseline is an empty
  manifest, so the first file that Bash creates there is reported. An empty
  baseline on a state path that Git does not ignore is skipped without a
  diagnostic. An unchanged manifest is not rewritten.
- The dedupe key is SHA-256 of JSON `[branch, sorted changed paths]`. Stop keeps
  only the last reported key. The same path set on the same branch is not
  reported again until a different path set is reported, also when a script
  writes the same log again. The key has no change kind, so a delete that
  follows a reported change of the same path is not reported.
- More than 5,000 entries, or an I/O or Git failure, gives no report, no state
  write and one stderr diagnostic at exit 0.
- Claude gets one `[ProtectedPathChange]` block in `additionalContext` (at most
  five paths and 800 bytes) and one human `systemMessage`. Codex Stop writes no
  stdout, so Codex gets one `repo-harness: Protected paths: ...` line on stderr
  for the operator. The Codex model does not see it.
- A continued Stop (`stop_hook_active`) skips the check.

### Git boundary

`repo-harness run check-protected-paths` checks staged changes. It rejects root
`_ops` and `_ref` entries and their descendants, including deletions and rename
sources. Other directories with those names are outside this boundary. Paths
come from NUL-delimited Git output, scoped to the protected roots, with rename
detection disabled. Output above Git's 1 MiB capture bound fails closed; unrelated
repository paths do not consume this bound.

A repository can call this command from its own `pre-commit` hook. Repo-harness
does not install a Git hook or replace an existing hook. CI runs
`bun scripts/check-protected-paths.ts --tracked` before coverage selection and
in daily governance. This checks the index tree, so committed private paths
cannot pass because the staged diff is empty. Ignore negations do not grant an
exception. Ignored local files that are not tracked or staged pass.

Only `REPO_HARNESS_ALLOW_PROTECTED_PATHS=1` permits flagged paths for that
invocation. The check prints the override on stderr. An agent must have human
authorization before setting it. No override is set by installation or CI.
Violations exit 1. Invalid arguments or Git inspection failures exit 2.

Circuit-breaker updates lock the complete read-modify-write and wait at most
two seconds. An update reclaims the lock only when the owner record is complete
and its pid is dead. A live owner, an unreadable owner, extra or unexpected
entries, or an empty lock directory still fails closed after two seconds. Only
in those cases, after verifying that no hook process is active, an operator may
remove `.ai/harness/state/circuit-breaker.json.lock` and retry.

The circuit breaker keeps one kind: `semantic-review`. A state
file from an older runtime fails closed when it has protocol 1 or a retired
kind (`guard`, `review`, `subagent`, `cross-model-consult`, `minimal-change`
or `repair`). The error names the one-shot cleanup. Run
`repo-harness run evidence-gc --repo <path>`, or
`bun scripts/evidence-gc.ts --repo <path>` in this source checkout.

## Architecture Drift and Parity

Hooks do not record architecture drift. They keep no queue and no drift cursor,
and they run no projection or LLM work. Architecture updates are explicit:

- `repo-harness run workstream-sync` maintains durable capability workstreams.
- Agents read architecture documents on demand, fix debt, and update the model and human prose. The archctx rolling writer publishes generated regions and the manifest.

`repo-harness state resolve --json` reports `capability_ownership`. It is a
projection of the ownership answer that state resolution already computed:
`review_base`, `capability_ids`, each capability's `module_document` and owned
`paths`, and `unowned_paths`. It is `null` when ownership was not computed: no
implementation path, an absent registry, an ownership blocker, or capability
ids that the caller declared.

`agent-notice.ts` selects and formats architecture debt. SessionStart reuses
Effective State ownership. Claude Stop and Codex UserPromptSubmit make one
ownership query without resolving workflow state. Notice queries use the hook
environment. Each archctx call (ownership resolve or checkpoint) has a 3 s
deadline. The Git calls that build the review subject keep their own timeouts.
Other ownership callers keep their 10 s default.
The effect intersects owned paths with Git changes against the
merge-base of `review_base`, including staged, unstaged and untracked paths.
No changed owned path means no checkpoint call. The old manifest history subject
in `state resolve` stays unchanged; it does not set the notice base.

The package-local `checkpoint --changed-path <path>... --json` has a 3 s deadline.
It needs no CodeGraph index. In practice, only citation debt (`stale-anchor`)
reaches the session. Checkpoint receives only owned changed paths. An ambiguous
owner stops the ownership resolve before checkpoint runs. Dependency and flow
debt stay in the PR lane. Checkpoint has no base classification or severity field. Partial coverage does not prove that
all architecture debt is absent.

Known limits:

- While owned paths are dirty, each Codex prompt and each Claude Stop pays one
  ownership resolve and one checkpoint before the dedupe check.
- Under archcontext, checkpoint receives only owned changed paths, so new
  unowned files reach the CI lane, not the session.
- `new` means a new delivery id set, not newly introduced debt.

The text starts with `[ArchitectureDebt] N new in <capability>`. Each item names
the capability, model field and command. At most three items fit within 800
UTF-8 bytes. An overflow line gives the remaining count and
`repo-harness architecture-debt --json`. A line that cannot fit stays in that
count; commands are never cut. No debt means no model text.

The marker `.ai/harness/state/agent-notice` must be Git-ignored. Its key is
SHA-256 of JSON `[branch, sorted item ids, sorted unowned paths]`. archctx calls
the stable identity field `id`. All delivery points share the marker. A manifest
refresh does not renew an unchanged set. Hooks never project or apply architecture.

Registry repositories also get `[ArchitectureDebt] N unowned changed path(s)`
from the registry ownership answer, with no checkpoint call. A branch that is
not ahead of its review base gets ownership from the last projection manifest
commit, so that answer can list paths that main changed. Like checkpoint, the
notice keeps only the paths that differ from the review-base merge-base. Under archcontext,
the unowned judgment stays with archctx, because it counts only paths inside
declared source roots. A repository without a declared capability authority gets no
architecture text.

A setup state gives one `[Architecture] inactive: <cause>` line and one human
`systemMessage`, also at SessionStart without a diff. The causes are a missing
`.archcontext/manifest.yaml` (the archctx checkpoint precondition; no checkpoint
runs), a missing global architecture configuration, and archctx setup errors
such as `AC_MODEL_ADOPTION_REQUIRED` or `AC_CODE_FACTS_NOT_READY`. An
explicit `projection_provider=disabled` gives no line. Another failure gives one
`[Architecture] notice unavailable (<code>)` line and keeps the one-line stderr
diagnostic at exit 0. A failed unowned-path filter in a setup state keeps the
setup state, and only stderr gets the error. The Git-ignored marker `.ai/harness/state/agent-notice-status`
dedupes these lines: once per cause, and once per branch and code for a failure.
A working notice records an active key, so a returning cause prints again. A
failure never writes the debt marker. A marker that cannot be written drops only
its own text and adds to the stderr diagnostic.

When Git does not ignore `.ai/harness/state/`, no marker can record a delivery.
SessionStart checks both markers in each session, also when it writes none. It
then gives one `[Architecture] notice unavailable: .ai/harness/state/ is not
Git-ignored` line and one human `systemMessage`. This line takes the place of
the notice text, because no marker can deduplicate that text. Claude Stop and
Codex UserPromptSubmit keep only the stderr diagnostic of a failed marker write.
Without a marker, the line would repeat at each turn, and each Claude Stop line
starts one more turn. Add `.ai/harness/state/` to `.gitignore`; the
`repo-harness init` ignore block has it.

| Point | Hosts | When |
| --- | --- | --- |
| `PreToolUse.edit` | Claude, Codex | Existing `[CapabilityOwner]` line; no debt call |
| `SessionStart.default` | Claude, Codex | Changed owned paths and a new id set, including worker sessions |
| `Stop.default` | Claude | Same rule; skip when `stop_hook_active` is true |
| `UserPromptSubmit.inbox` | Codex | Same rule; the installed tuple stays unchanged |

Claude receives one human `systemMessage` from the same notice: count, first
capability and one command. Multi-capability notices append `(+K capabilities)`
to the first capability in both the header and human line. An item without
capability ids uses the first scope capability, then `unowned`. Codex receives no human line, and Codex Stop emits
no stdout. The [Codex hooks documentation](https://developers.openai.com/codex/hooks#userpromptsubmit)
permits `hookSpecificOutput.additionalContext` at UserPromptSubmit.

CI and operators use the full debt comparison:

```bash
repo-harness architecture-debt --json --base origin/main
```

The command measures the debt at HEAD and at the base, and reports the items
whose ids are new at HEAD. It measures the base in a temporary checkout and
removes that checkout. Measured debt exits 0. An unresolvable base exits 1
with the reason on stderr. A failure of archctx does the same.

Agents author semantic snapshots and diagrams. Hooks do not spawn LLM agents or
long-running commands. Deterministic execution belongs in explicit CLI commands
such as `repo-harness review round`.

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
