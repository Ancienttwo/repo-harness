# Pipeline observer operations

This command group implements phase 1 R1-R4.
It records facts. It does not control live work.
A ledger failure is a telemetry gap. Existing work continues under its existing rules.

## Store configuration

The authority host is the kitos Mac mini. The default database is
`/Volumes/D/repo-harness/pipelines/pipelines.db`.
Set `REPO_HARNESS_PIPELINES_AUTHORITY_HOST` to the Mini's exact OS hostname.
The default host name is `kitos`. Verify that value before deployment.
Set `REPO_HARNESS_PIPELINES_DB` to change the local store path.
Paths under `/Volumes/D` require a mounted volume with a distinct device.
There is no automatic store on another host or directory.
Do not use a network filesystem, `_share` or `_ops`.

The writer requires SQLite 3.51.3 or later, or the fixed 3.44.6 and 3.50.7 branches.
Unknown and unfixed versions fail before directory creation.
`REPO_HARNESS_PIPELINES_SQLITE_LIBRARY` can select an installed SQLite library.
It does not disable the version check.
This macOS worktree uses Bun 1.4.2. Its default system SQLite is 3.51.0.
Acceptance tests use the installed Homebrew SQLite 3.53.4.
The shared test fixture selects it before the first DB opens and prints runtime metadata.
A missing or unfixed library fails the fixture prerequisite. There is no version bypass.
The pinned Linux Bun 1.4.0 runtime bundles SQLite 3.53.2.
That version was verified in a network-disabled local Linux container.
Production library selection remains explicit. No CI workflow changed.
See the [SQLite WAL-reset notice](https://sqlite.org/wal.html#the_wal_reset_bug).
No Mini deployment took place in this task.

## Register and inspect

```sh
repo-harness pipeline new --source-host max --repository-id /repo/.git \
  --adopt-task existing-task --root /repo --json
repo-harness pipeline record --source-host max --repository-id /repo/.git \
  --task existing-task --kind request --payload request-registration.json \
  --state-version 1 --reconcile --command-key enroll-1 --json
repo-harness pipeline list --projection board --json
repo-harness pipeline status --source-host max --repository-id /repo/.git \
  --task existing-task --events --limit 20 --json
repo-harness pipeline status --source-host max --repository-id /repo/.git \
  --task existing-task --evidence 0 --json
```

The registration payload is `{"role":"implement"}`.
The source CLI reads the real binding and persisted requests.
It preserves existing task and outbox identity.
A registered role also lets the next snapshot enroll later persisted requests.
Tasks without a reliable identity remain unclaimed. Do not invent their identity.

`new` creates version 1. `record` and `advance` require a record version.
`ingest-event` appends observations and never changes a record version.
Unknown version flags on `new` and `ingest-event` are usage errors.
A command key returns the original receipt before CAS, source reads or gates.
The receipt says `already_applied`, including its first return.
It proves the committed operation. It does not prove current admission.
Without a key, a retry is a new command. There is no response-loss replay promise.

## Evidence and source channels

Register `resource` with `resources`, `policy`, `subject`, `contract_path` and `base_ref`.
The source CLI checks the real repository, base, virtual tree, contract and environment.
The policy must map each requirement to explicit check IDs and contract identities.
Initial policy entries are marked unmapped and cannot qualify a gate.
There is no inference from command text or file names.

Register `evidence` with an `evidence` row and `contract_path` for test reports.
The report must be the original materialized execution report.
The original validator checks each immutable execution and its input identity.
Non-pass outcomes use a separate observer entry point. The existing pass API stays strict.
Plain logs and failed provenance checks stay attested.
A plan file must match its digest.
A review must be an original request-bound result with value fields:
`kind: pipeline_review`, `subject`, `check_id`, `verdict`, `reviewer`, `plan_digest`.
Include `request: {role, round}` with review registration.
Include `relations` to bind plan-review evidence to the plan evidence index.

Source artifacts stay on their recorded host.
`REPO_HARNESS_PIPELINES_SOURCE_HOST` names that host when its deployment label differs from its OS hostname.
For remote sources, set `REPO_HARNESS_PIPELINES_SOURCE_COMMANDS` to a JSON map from host label to an argv array.
Each argv array must name the existing read-only CLI channel.
The writer sends an `AuthorityQuery` as stdin. It receives one provenance bundle as stdout.
The channel runs `pipeline record --validate-only --payload -` on the source host.
It also supplies the required `--source-host`, `--repository-id`, `--task` and `--kind` selectors.
This mode opens no ledger. It runs the source authority validators only.
The returned host, query digest, request identity, subject and artifact digest must match.
No channel means unavailable or attested evidence. The writer never opens a remote path locally.
This is a same-user CLI trust boundary. It does not isolate a malicious channel operator.
No channel, credential or host permission was added by this PR.

## Observe a round

```sh
repo-harness pipeline ingest-event --payload pane-snapshot.json --snapshot --json
repo-harness pipeline list --summary --json
repo-harness pipeline export-snapshot --json
```

The snapshot payload uses the actual Herdr response envelope, `result.panes`.
It also includes the observed `host` and `herdr_session`.
A pane-only notice remains a weak observation, including a bound pane's notice.
Full request identity permits association only after original source validation.
Every explicit snapshot checks enrolled results for all roles. A done notice is not required.
The list's inbox is bounded to 100 unclaimed or weak observations.
Attention is a proposal. It does not suppress any notice.

Each commit triggers up to three snapshot export attempts.
An export failure keeps the committed receipt. It reports a warning on stderr.
The board keeps its last complete generation and source times.
After five minutes, the shared projection threshold labels that generation stale.
No published file is rewritten. Unchanged exports create no copy.
A failed build or losing exporter removes only its own unpublished file.
This implementation does not reclaim published or crash-orphan generations.
A later explicit export can catch up.

## Merge facts and restore

`ask`, `go` and `revoke` record pre-merge facts.
A go stays attested and binds to the exact repository, PR, target, head, base, tree and method.
Record a completed authorized merge with `observation`, kind `merge_fact`, then advance to `merged`.
The transition consumes historical go before it refreshes the moved base.
`external-merge` records a fact with observed admission.
`approval_not_recorded` does not prove a policy violation.
Cleanup accepts a recorded checklist only. It never removes a path.

Restore a quiescent backup through the normal operator process.
Then run `export-snapshot --restore-epoch --json` on the restored store.
This bumps the epoch, invalidates in-flight observations and blocks new writes.
Run `export-snapshot --reverify --json` after source access returns.
This checks original subjects, requests and evidence before it enables new writes.
Records that remain unreachable stay unavailable and cannot qualify a gate.
They do not stop unrelated observer writes.
A restore marker fences old derived run state. Inbox and receipt history stay intact.
Readers never initialize, migrate, recover or repair the store.
Incompatible store protocols fail closed. No migration from an older protocol is supplied.

## Deferred scope

Plugin delivery governance, payload enrichment and webhook migration remain deferred.
MCP identity, pane placement, timers and test-slot enforcement remain deferred.
Automatic dispatch, merge, cleanup, branch deletion and action outbox remain deferred.
The tests exercise local source CLI channels in isolated processes.
They do not prove the Mini's deployment or a live cross-machine channel.
The full suite was not run because the owner reserved that slot.
