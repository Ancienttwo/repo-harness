# BRC14 fresh audit runtime

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

## Implemented boundary

The campaign audit command builds a complete ordered slot snapshot from the published adoption manifest and validated per-Task cleanup. Completed merges must be ancestors of the current target. Unfilled and not-planned slots remain explicit. Immutable snapshots bind the intent, adoption, publication and final main SHA.

`campaign audit` reserves the existing campaign provider budget for the `audit` operation, then uses a fresh browser consult with explicit GitHub selection and the user's current default model. Audit does not consume an authoring round. A same-key retry reuses durable observations without browser access. Unresolved outcomes retain their reservation and block another provider call through the existing reconciliation gate. Completed malformed output is retained with a digest and charged as provider failure.

The answer is strictly parsed as one JSON object covering every slot. Authoring session reuse across campaign groups is rejected. The observation is always `unverified`: a model answer, including an echoed SHA or an accepted recommendation, is not trusted revision evidence. The CLI returns a nonzero status for that observation. No active-admission gate is removed.

The shared campaign store consumes typed evidence for begin-audit and accept-group transitions; naked or stale references cannot advance lifecycle state. Ordered group progress derives from canonical lifecycle events. Later authoring baselines require the previous accepted audit snapshot. Group skipping, exceeding the grant and early completion fail closed.

## Scope and remaining acceptance

This is a model-free implementation slice, not a real BRC14 audit completion. Trusted exact-version provenance and a real accepted group remain unavailable. BRC6a re-probing was stopped by the user. No live GPT/browser requests, global installation, release, GitHub writes or stopped budget reuse were performed here. BRC14/BRC15a/BRC15 are not marked complete by these tests.

No dependencies were added. The two new source files separate the pure snapshot/answer/event protocol from Git, durable stores and browser effects; CLI, lifecycle store and authoring consumers share these invariants. The two new test files exercise pure validation and effect-level admission/replay independently.

## Verification scope

Named tests cover fresh audit, campaign store, authoring, observer, planning, heartbeat, shadow budget and CLI, plus TypeScript and the six repository integrity checks. No full suite is required by this bounded contract. The contract's final prepare-acceptance run and receipt own the exact accepted subject; development logs do not imply final acceptance.

Two old fixture failures reproduced on integration baseline `67d3e858`: Issue-number selection now fails at campaign creation, and heartbeat authoring requires a committed capability registry. User-authorized fixture alignment updates those inputs/assertions without relaxing production gates. The heartbeat out-of-group case now expects the shared group-sequence error before provider access.

## Private response capture

Fresh audit now requests Oracle's existing `--write-network-evidence` exporter with `--wait`. The wrapper allocates a private per-invocation directory under the controlled Oracle home and retains the original stream file across success, failure and answer-directory cleanup. This is an internal audit input, not a public CLI setting; ordinary authoring and followups do not enable it.

Browser metadata and the durable audit-answer record retain the capture path, byte count, SHA-256 and the exporter-reported `captured`, `empty` or `incomplete` status. The wrapper checks the envelope protocol, sequence, origin and exact descriptor session; unavailable or invalid files have distinct `missing`/`invalid` observations. Symlinks and files above the existing 64 MiB exporter bound are refused. Raw response bodies stay in private ignored runtime storage and are not copied into output text, logs or tracked documents.

This transport observation is not a GitHub tool request/result pairing or a resolved-commit receipt. Historical conversation evidence contains provider-origin fetch results but lacks the matching original tool request and a fresh Oracle audit binding. The fresh-audit revision result therefore remains `unverified`, and active admission remains disabled until actual trusted version evidence is available. No historical canary or BRC6a task is reopened by this wiring.


## Pre-active observation

A completed-group audit cannot bootstrap active admission: it requires published adoption and per-Task cleanup, while active currently refuses unavailable exact-revision authority. The new `campaign observe-revision --authorization-sha256 <digest>` entry consumes an anchored grant before campaign creation, or in the initial authorized/preparing state, before any provider operation, and does not require or manufacture an issue-batch intent. Existing campaigns must share that grant. Its immutable request binds the exact campaign grant, repository, target revision, profile and sent prompt.

`observe_revision` uses the same campaign provider budget. Its context has a real request digest and a null issue intent; it consumes one provider call and no authoring round. Intent binding excludes this pre-intent operation, allowing subsequent initial authoring under its own real intent. A second observation request is refused, concurrent requests issue at most one call, and unknown results retain their reservation. A completed result is persisted before settlement so a crash can replay the stored result without provider I/O.

The result retains the fresh Oracle/GitHub session proof and private raw capture metadata. Missing session proof is charged as a provider failure; even a captured valid session remains `revision_evidence: unavailable`. This entry provides actual material for a future strict tool parser; it does not manufacture requested-ref/resolved-commit pairing, change active admission, accept a group or reopen BRC6a. CLI exit status remains nonzero while revision authority is unavailable. The candidate source CLI must be used until a separately authorized release includes the entry.


Finite Issue selection remains invalid for campaign start, but it is not an input to this read-only revision operation. The observation therefore precedes campaign creation without weakening the start policy. Admission is serialized with campaign transitions under the existing mutation lock; the provider promise starts after reservation and the lock is released before awaiting it. Stops ordered before admission prevent the call; later stops encounter already admitted in-flight work. The deterministic stop-between-preflight-and-reservation test failed before this ordering fix and passes afterward.
