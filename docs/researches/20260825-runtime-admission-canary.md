# Runtime Admission Canary: Codex Persist-First Delivery

> **Status**: Passed first proof point
> **Executed**: 2026-08-25
> **Scope**: non-authoritative Codex Thread admission evidence for ME-1C and ME-3A

## Conclusion

The Codex runtime admits the required control-plane boundary for one already-bound persistent Thread:

```text
persist ModuleMessage event
  -> invoke Codex send exactly once
  -> lose the control-plane acknowledgement
  -> observe the exact event in one completed Codex turn
  -> reconcile by read only, without replay
```

The canary produced exactly one new Codex turn, no tool call, and no Task, Lease or repo-harness Fleet-column change. This proves the first Runtime Admission Canary point required before ME-1C approval. It does not approve automatic Thread creation/archive, a daemon, Provider retry, query-loop ownership, history/compaction ownership, a model gateway, or Provider fallback.

## Bound Subject

| Field | Value |
|---|---|
| Engineer | `engineer:capability.verification.evals-checks` |
| Engineer contract revision | `sha256:ab5956c087f6e55f38d0dda2758307f77d2ff1077c5be2621ffb024382925042` |
| Provider | `codex` |
| Host | `local` |
| Thread | `01a038fb-2c9d-7c21-86b3-95ae8d281bae` |
| Binding ID | `a737c7d2-f07c-42da-bddb-bea647ab19a0` |
| Binding generation | `1` |
| Binding transition | `sha256:366e89b4b032a06b2a12f3da5296e0a7f08f4d39f4dba6d79674c61646154e2c` |
| Binding current digest | `sha256:c285c1535eadac3933f6f31d4bfd30a57e8e7e0afd8718b33be8e4e2f44a4725` |

The Human explicitly authorized creating and selecting this Module Engineer. The task was bootstrapped from the tracked Profile/SOP on `codex/me1c-engineer-inbox`; its initial turn performed only required reads and reported no mutation.

## Persisted Input

| Field | Value |
|---|---|
| Message ID | `5b1aa6af-0f72-4cc2-a68b-8f4afeb03711` |
| Event digest | `sha256:cbad0d65626aeb8c8239086eda3e098399d8375dc46198e94921f1ebaa9ffa0f` |
| Body digest | `sha256:8269fbac64f76c47cc000a8a313a01cb01546b353232f70dbb8ff899d0539bf4` |
| Initial receipt | `pending`, attempt `0` |
| Initial receipt digest | `sha256:bfae9fa399d5bef6077d4d1c60e50fa263e25abbf24ff2691acff12b0ceec23b` |

`engineer message send` persisted the immutable event and pending receipt before any Provider call. The Provider payload contained the exact event digest, Binding fences, body digest and bounded body; it contained no Contract, transcript, credential, Claim, Lease, Publication or Acceptance bytes.

## Lost-Acknowledgement Observation

The Codex send operation was invoked once. Its return was deliberately not projected into the ModuleMessage receipt, representing acknowledgement loss after Provider admission. Recovery used `wait_threads` and two independent `read_thread` observations; it did not call send again.

| Observed identity | Value |
|---|---|
| Provider turn | `01a03901-1cc7-7da0-9030-a2952b14018d` |
| Provider user message | `01a03901-28c7-72c0-9d49-b13b631787a4` |
| Provider assistant message | `msg_02baa1d254731806016a8d91b8d7bc87d0a4cc46c9fe0ecd7f` |
| Assistant result | `RUNTIME_ADMISSION_CANARY_ACK_5b1aa6af` |
| Tool calls in turn | `0` |
| Duplicate turns | `0` |

Both reads returned the same Thread/turn/user-message/assistant-message tuple and the user message contained the exact persisted event digest. Therefore an unknown send outcome can be reconciled positively by observing that tuple; absence of that proof must remain `reconciliation_required` and must not trigger a second send.

## Authority Byte Comparison

| Authority | Before | After | Result |
|---|---|---|---|
| Task authority at `main:plans/sprints` | `.gitkeep` blob `8b137891791fe96927ad78e64b0aad7bded08bdc` | identical | unchanged |
| Lease authority at `<git-common-dir>/repo-harness/coordination/v1/leases` | absent | absent | unchanged |
| repo-harness Fleet projection | repository `repo_a5b76eee64af71c3`, stable, zero cards | identical canonical projection bytes | unchanged |

The Binding and Module Inbox stores changed by design. They are separate control-plane authorities and were excluded from the Task/Lease/Fleet comparison.

## Contract Frozen For ME-3A

For Codex send/reconcile, the minimum positive effect identity is:

```text
message_event_digest
+ host_id
+ provider_thread_id
+ provider_turn_id
+ provider_user_message_id
+ provider_assistant_message_id
```

The persisted intent must exist before Provider invocation. A successful call that has not yet published an observation and a call whose return is unknown take the same recovery path: observe the exact bound Thread, find the exact persisted event digest in one user message, and publish the observed turn tuple. A missing or ambiguous match fails closed. Provider send is never replayed merely because local acknowledgement is absent.

`create_thread` returned a temporary client setup identity before the final Thread became observable. That behavior is not admitted as an automatic adapter effect by this canary; Thread create/archive remain Human/operator-only until separately proven.

