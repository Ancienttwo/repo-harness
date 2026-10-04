# Campaign independent supervision

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

Managed campaign invocations use a pinned local Docker image and a Linux Docker 28.3.2 daemon (API 1.51). The image PID1 owns an absolute deadline and drops the workload to the host non-root UID/GID with no capabilities. Namespace exit terminates detached descendants. The immutable root filesystem, exact bind inventory, read-only common Git mount, resource limits, no restart policy and daemon configuration are checked before start and again at terminal readback.

The account-level `repoHarnessHome(process.env)/campaign-containers/<uuid>` is the controller authority. It is canonicalized and must not overlap any mount source, including the optional exact auth file. A handle or modified worktree Git pointer cannot select another authority root. Request, created, start, terminal and interruption records are atomically published without overwrite. The controller hashes the streams held in memory; `contract-run` writes only copies into the worktree through descriptors opened before launch. The terminal consumer validates the protected original request, dispatch/claim/generations, invocation arguments, probe receipt and terminal stream hashes. Replacing worktree logs and local summaries does not replace that authority.

Controller-loss recovery consumes the original expired invocation and daemon inactivity. It never starts a container or invents provider output. An interruption settlement remains reconciliation-required; recorded final settlement and retirement remain available. This protocol cutover does not add a legacy host receipt reader.

`BRC_CAMPAIGN_IMAGE` is an exact local image ID; `BRC_CAMPAIGN_AUTH_FILE` is optional operator input. The controller's existing `REPO_HARNESS_HOME` selects host storage and must be inherited consistently by recovery processes. The Docker socket and host journal are not mounted. Codex model/effort selection remains the existing role configuration; this integration does not introduce a model override.

Production active admission remains closed after revision and budget validation. This integration is not BRC14/BRC15 real campaign acceptance and does not change Owner's BRC6a closeout. No real provider execution is used by the model-free tests: they substitute a synthetic executable; the real Codex binary is invoked only with `--version` or cancelled before start.

The source and packaged contract-run helper must remain byte-identical. Docker tests cover actual worker/verifier Git execution, mount visibility, simultaneous post-exit log/summary replacement, identity substitution, symlink/FIFO attacks, detached descendants, deadlines, cancellation, controller loss and atomic interruption publication. Offline readback tests use the preserved Docker 28.3.2 fixture directly against the production validator.

## PR #360 delta and remaining acceptance boundary

The post-archive delta at 22b9032c keeps containment fixtures outside Linux /tmp, including the fixture home that owns execution worktrees. Only these fixtures select /var/tmp on Linux; ordinary adoption fixtures retain their default. Production containment restrictions are unchanged. The newly added extensionless path-array exemption also rejects unknown high-entropy path segments through the existing redaction pass.

The three affected lifecycle/closeout files passed in a no-network Linux test container: 37 passed, one nested-Docker case skipped, zero failed. The evidence/projection regression set passed 43 tests. The skipped case and sixteen Docker supervision checks retain their original image-enabled baseline identities; neither the baseline AcceptanceReceipt nor these offline results prove current live campaign readiness. See tasks/reviews/20260908-brc354-ci-delta.review.md for exact evidence references.

At f9e24f50, recovery acceptance covered an already persisted invocation, exact-container inactivity, original deadline and no-restart settlement. Controller loss before durable invocation publication was not established by that baseline evidence. Successful container/journal retention also needs an explicit cleanup contract compatible with later exact-container readback; unconditional removal would invalidate that recovery dependency. Both remain pre-active review boundaries. PR #360 does not itself close #354; active remains disabled and BRC14/BRC15 live acceptance remains outstanding.

## Pre-invocation preparation recovery

The follow-up records preparation before invoking runtime and derives each probe/workload journal address from the canonical common directory and existing runtime identity. The protected pre-create request retains its original random Docker name. If the create response or invocation publication is lost, recovery reads that exact name, validates the original image/configuration and reconstitutes only its handle. It never creates, starts or restarts a workload. Missing daemon objects remain unknown.

Preparation observation now requires protected inactivity before no-start reclaim can succeed. Reconciliation waits for the original deadline; a pre-launch preparation returns reconciliation-required without minting an execution reservation or Claim. A preparation within an existing attempt uses normal single-settlement semantics. This extends recovery coverage before invocation publication while keeping the active gate closed. Container retention/cleanup and live acceptance remain independent boundaries.

## Recovery-compatible cleanup

`scripts/cleanup-campaign-container.ts <absolute-protected-journal-directory>` is an explicit operator entrypoint. It first requires the original expired deadline and publishes or reuses protected interruption evidence. It then verifies the same Docker daemon and exact container configuration, removes only that inactive container without force, verifies absence, and writes an immutable cleanup receipt. A crash after deletion but before receipt publication replays from the retained interruption.

The journal is retained, including request, configuration, created handle, interruption and any terminal output. Preparation reconciliation can reconstruct a lost created handle before cleanup; later preparation and terminal consumers read the same protected proof after removal. Unknown preparation and configuration drift refuse cleanup. This does not reclaim Claims/worktrees, enable active execution, establish live provider acceptance, or define journal TTL. Retained journal storage growth remains a separate operator policy.
