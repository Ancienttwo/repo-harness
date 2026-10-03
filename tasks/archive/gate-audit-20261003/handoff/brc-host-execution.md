> Superseded by Owner direction on 2026-09-11: stop full BRC acceptance work. Release 0.19.0 first, close #398 by scope amendment after release report; native host evidence and model-free matrix are deferred until real campaign use. The pending Grok bot host question no longer blocks this task. Do not start further host research or provider work.

# BRC native host execution — investigation checkpoint

User authorized execution of the full BRC acceptance direction on 2026-09-11. Containers remain forbidden. Do not restart stopped campaigns or reuse old grants. The current question is whether the Grok bot cloud host is Linux; its connection identity has not been located or provided. SSH config has no named Grok bot entry. Await a host address/alias or deployment project before remote inspection.

Owned isolated checkout: /Users/ancienttwo/Projects/repo-harness-wt-brc-host-execution, branch codex/brc-host-execution, base a8b56203 (origin/main at investigation). Shared main WIP is untouched. No product edits, new contract, provider call, container, campaign transition, merge, or publication occurred.

## Verified pressure point

On current Darwin, a model-free probe invoked scripts/run-bounded-verifier-command.ts with a Node worker that spawns a detached child (stdio ignore), writes its PID, unrefs it and exits. Wrapper result: exit 0, termination_cause completed, output_complete true, scope posix_process_group/state quiescent. Direct kill(pid,0) after wrapper exit confirmed detached_descendant_alive=true. The exact fixture child was killed in finally and scratch files removed. This disproves treating current host process-group quiescence as full workload inactivity.

Focused checks in isolated checkout: bun test tests/bounded-supervisor-audit.test.ts --test-name-pattern 'cancellation bounds inherited pipes': 4 pass, 0 fail, 16 assertions, 4.71 seconds. Read-only research agent additionally reports 37 pass for process-runner, closeout-runner-guardrails and brc10-supervised-renewal tests; its result is baseline evidence, not acceptance of a new implementation.

Existing supervisor supplies start barrier, timeout, parent loss and original process-group cleanup. Existing delegated-run-store supplies immutable invocation/output receipts and launch/reconciliation records. Neither proves detached-descendant inactivity. A differently named same-user writable journal is not independent authority.

## Corrected scope

The earlier statement that exact-SHA audit is wholly unwired was too broad. campaign-fresh-audit.ts, campaign-revision-admission.ts and docs/researches/20260908-brc14-provider-history-evidence.md show implemented provider-history validation and group sequencing. Reuse these and verify named affected tests; remaining live acceptance is not a reason to reimplement them.

## Candidate native boundary

Linux cgroup v2 is a candidate, not yet tested here. Need protected membership, no worker migration/delegation privileges, an independently owned durable journal, startup barrier, deadline/parent-loss cleanup, cgroup.kill and cgroup.events populated=0 proof, exact output digests and invocation identity; also writable Git index/shared lock under canonical verifier ownership. Inspect actual host OS/kernel/controllers/permissions/resources without touching Grok bot service. No container or new host provisioning is implied.

Primary references: https://cdn.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html ; https://github.com/apple-oss-distributions/launchd/blob/main/man/launchd.plist.5 ; https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/event.h . launchd documents original process group only; XNU notes NOTE_TRACK/NOTE_CHILD unsupported since 10.5. Do not infer Mac impossibility in general; current repo/native mechanisms are insufficient.

Next: identify Grok bot host and read back OS/cgroup capability. Then parent owns P3 and capture-plan work-package with approved implementation authorization. State costs before >10 minute work or real provider budget; immutable stopped records stay unchanged. No decision-complete plan exists yet because execution host is unresolved.
