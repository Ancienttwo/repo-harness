# OAR request correlation and runtime observation

The user approved this scope on 2026-10-14. PR #733 added OAR 0.62.1 and has merged. The final base is main at `89837e52`.

## P1: Map

OAR owns runtime records and status. The coding and review hosts own the provider Session. Task sessions own process bindings, requests and results. PM reads task sessions. Seatbelt owns the child isolation boundary.

## P2: Trace

PM saves a TaskRequest and starts the fixed coding host. The host sends a prompt through OAR. A worker writes a Result. The owner validates and collects that Result. Review uses the same transport with its own fixed host.

Today, the hosts print OAR events. Task status mostly sees process bindings and Result files. It cannot report the native phase or failure class.

## P3: Decision

Use the canonical request ID as the OAR input ID. Add one shared observation module for both hosts. Save an atomic private snapshot with the request identity, host identity, native session ID, initial OAR status and exact subsequent OAR records. Publish on status or control changes and at the end of the prompt. Replay with OAR's reducer. PM exposes only typed status, control and failure fields.

This avoids a second runtime parser. It keeps incomplete writes out of reads. The raw records stay private. Observation never changes TaskResult or acceptance. Missing observation stays unavailable. Malformed data or an identity mismatch is rejected.

At higher concurrency, record size and repeated snapshot writes grow first. Write on meaningful phase and control changes, not each text delta. Bound reads and reject an oversized snapshot.

## Verification and stop

Extend real scripted OAR and task-session fixtures. Check native input identity, running and failed status, deterministic replay, request and host tampering, and unchanged result collection. Build both hosts. Run typecheck and affected tests once on the stable candidate. Check architecture coverage and projection.

The session is outside Herdr. The required Claude review cannot run here. Submit a Draft PR with the recorded checks and this review gap. Do not merge or release.
