import { useCallback, useState } from 'react';

/**
 * The operator board ships its own dictionary instead of an i18n library: the
 * surface is one page, the key set is closed, and a third-party runtime would
 * add a dependency to a bundle that must stay auditable. `zh` is typed against
 * the `en` key set, so a missing translation is a typecheck failure rather than
 * a runtime fallback.
 */
export type OperatorLocale = 'en' | 'zh';

export const OPERATOR_LOCALES: readonly OperatorLocale[] = ['en', 'zh'];
export const DEFAULT_OPERATOR_LOCALE: OperatorLocale = 'en';
export const OPERATOR_LOCALE_STORAGE_KEY = 'repo-harness:operator-locale';

/**
 * Recovery actions the transport repeats across many codes. They are named once
 * so a wording change cannot drift between two of the error codes the board
 * owns copy for.
 */
const EN_DIAGNOSTIC_ACTION = 'Run `repo-harness fleet board --json` for diagnostics, then retry.';
const EN_REOBSERVE_ACTION = 'Refresh the board to re-observe the task, then retry.';
const EN_COLLABORATION_ACTION = 'Check the repository collaboration store, then refresh the board.';
const ZH_DIAGNOSTIC_ACTION = '跑 `repo-harness fleet board --json` 看诊断，然后重试。';
const ZH_REOBSERVE_ACTION = '刷新看板重新读一次任务，然后重试。';
const ZH_COLLABORATION_ACTION = '检查仓库的协作 store，然后刷新看板。';

const en = {
  'app.subtitle': 'control board',
  'app.skipToWorklist': 'Skip to worklist',

  'status.observedAgo': 'observed {age} ago',
  'status.observedUnknown': 'observation time unavailable',
  'status.sequence': 'seq',
  'status.consistency': 'consistency',
  'status.consistency.stable': 'stable',
  'status.consistency.changed_during_read': 'changed during read',
  'status.consistency.degraded': 'degraded',
  'status.repositories': '{count} repos',
  'status.unreadable': '{count} unreadable',
  'status.refresh': 'Refresh',
  'status.refreshing': 'Refreshing',
  'status.stale': 'stale data',
  'status.language': 'Language',
  'status.languageEnglish': 'EN',
  'status.languageChinese': '中',

  'age.seconds': '{count}s',
  'age.minutes': '{count}m',
  'age.hours': '{count}h',
  'age.days': '{count}d',

  'worklist.title': 'Worklist',
  'worklist.filters': 'Worklist filters',
  'worklist.filterAll': 'All',
  'worklist.empty': 'Nothing in this snapshot needs a decision.',
  'worklist.groupEmpty': 'No tasks in this group.',
  'worklist.expand': 'Expand {group}',
  'worklist.collapse': 'Collapse {group}',

  'group.needs_you': 'Needs you',
  'group.ready_to_merge': 'Ready to merge',
  'group.unreadable': 'Unreadable repos',
  'group.unclassified': 'Unclassified',
  'group.agent_working': 'Agent working',
  'group.external': 'External',
  'group.done': 'Done',

  'row.unread': '{count} unread',
  'row.feedback': '{count} feedback',
  'row.changedDuringRead': 'changed during read',
  'row.noProgress': 'no progress',
  'row.noCause': 'no blocker recorded',

  'attention.user': 'you',
  'attention.agent': 'agent',
  'attention.external': 'external',
  'attention.none': 'no attention',
  'attention.owned': '{owner} attention',

  'stage.available': 'available',
  'stage.working': 'working',
  'stage.in_review': 'in review',
  'stage.ready_to_merge': 'ready to merge',
  'stage.done': 'done',
  'stage.unclassified': 'unclassified',

  'lease.available': 'available',
  'lease.reserving': 'reserving',
  'lease.bound': 'bound',
  'lease.completing': 'completing',
  'lease.reviewing': 'reviewing',
  'lease.released': 'released',
  'lease.unknown': 'unknown',

  'execution.execution_ready': 'execution ready',
  'execution.planning_required': 'planning required',
  'execution.inline_ready': 'inline ready',
  'execution.unsupported': 'unsupported',

  'detail.overviewTitle': 'Fleet overview',
  'detail.overviewHint': 'Select a task to see why it needs a decision.',
  'detail.matrixTitle': 'Tasks by repository and stage',
  'detail.matrixRepository': 'repository',
  'detail.repositoryHealth': 'Repository health',
  'detail.taskDetail': 'Task detail',
  'detail.close': 'Close task details',
  'detail.revisionChanged': 'Task definition changed since last snapshot',
  'detail.revisionChangedBody': 'The row is still on the board; its revision moved from {previous} to {current}.',
  'detail.cause': 'Why this is here',
  'detail.causeEmpty': 'No blocker, no stalled feedback, and no unread message in this snapshot.',
  'detail.blockerOwner': '{owner} owns this',
  'detail.noProgressTitle': 'Feedback reports no progress',
  'detail.noProgressBody': 'Fleet marked this task as not progressing. The snapshot carries the flag only, not how long it has been stalled.',
  'detail.repairTitle': 'Recovery paths recorded by Fleet',
  'detail.identity': 'Identity and lease',
  'detail.deliveryRuntime': 'Delivery and runtime evidence',
  'detail.signals': 'Signals',
  'detail.signalFeedback': 'feedback',
  'detail.signalInbox': 'inbox',
  'detail.signalBlockers': 'blockers',
  'detail.changedDuringRead': 'This task changed while the snapshot was read. Re-observe before acting.',

  'field.taskId': 'task id',
  'field.repository': 'repository',
  'field.revision': 'revision',
  'field.claim': 'claim',
  'field.generation': 'generation',
  'field.lease': 'lease',
  'field.execution': 'execution',
  'field.publication': 'publication',
  'field.headSha': 'head sha',
  'field.effectSha': 'effect sha256',
  'field.deliveryState': 'delivery state',
  'field.runtimeReachability': 'runtime reachability',
  'field.failureClass': 'failure class',
  'field.notClaimed': 'not claimed',
  'field.notApplicable': 'not applicable',
  'field.none': '—',

  'delivery.pending': 'pending',
  'delivery.delivered': 'delivered',
  'delivery.acknowledged': 'acknowledged',
  'delivery.failed': 'delivery failed',
  'delivery.reconciliation_required': 'reconciliation required',
  'runtime.reachable': 'reachable',
  'runtime.unavailable': 'runtime unavailable',
  'runtime.unknown': 'unknown',

  'copy.action': 'Copy {label}',
  'copy.idle': 'Copy',
  'copy.copied': 'Copied',
  'copy.failed': 'Copy failed',
  'copy.copiedStatus': '{label} copied',
  'copy.failedStatus': '{label} could not be copied',
  'copy.missing': 'No {label} recorded',

  'repo.accessMode.read_only': 'read only',
  'repo.accessMode.read_write': 'read write',
  'repo.status.unreadable': 'unreadable',
  'repo.error.repo_unreadable': 'The repository authority cannot be read. Check the repository path and permissions, then refresh.',
  'repo.error.repo_authority_invalid': 'The repository authority is invalid. Re-adopt the repository, then refresh.',
  'repo.error.repo_snapshot_changed': 'The repository snapshot changed while it was observed. Refresh to re-observe it.',
  'repo.error.repo_board_unavailable': 'The repository board observation is unavailable. Run `repo-harness fleet board --json` for diagnostics, then refresh.',
  'repo.error.repo_publication_unreadable': 'The repository publication observation is unavailable. Check the publication store, then refresh.',
  'repo.error.repo_readiness_unavailable': 'The repository readiness observation is unavailable. Re-run merge readiness, then refresh.',
  'repo.error.repo_feedback_unreadable': 'The repository feedback store is unavailable. Check the feedback store, then refresh.',
  'repo.error.repo_inbox_unreadable': 'The repository Task Inbox is unavailable. Check the inbox store, then refresh.',
  'repo.error.repo_runtime_effect_unreadable': 'Agent Runtime effect evidence is unavailable. Reconcile runtime delivery evidence, then refresh.',
  'repo.error.repo_collection_timeout': 'The repository exceeded the fleet round deadline. Refresh to collect it again.',

  'error.operator_api_unavailable.message': 'Fleet snapshot unavailable',
  'error.operator_api_unavailable.action': EN_DIAGNOSTIC_ACTION,
  'error.operator_payload_invalid.message': 'Fleet snapshot response is invalid',
  'error.operator_payload_invalid.action': EN_DIAGNOSTIC_ACTION,
  'error.operator_collaboration_payload_invalid.message': 'Collaboration snapshot response is invalid',
  'error.operator_collaboration_payload_invalid.action': EN_COLLABORATION_ACTION,
  'error.collaboration_repository_mismatch.message': 'The collaboration response does not match the requested repository.',
  'error.collaboration_repository_mismatch.action': EN_COLLABORATION_ACTION,
  'error.task_message_response_invalid.message': 'The task message acknowledgment is invalid',
  'error.task_message_response_invalid.action': 'Retry with the same message ID so the server can return the incumbent event.',
  'error.task_message_unavailable.message': 'The task message could not be sent',
  'error.task_message_unavailable.action': EN_REOBSERVE_ACTION,
  'error.fleet_snapshot_timeout.message': 'The Fleet snapshot timed out.',
  'error.fleet_snapshot_timeout.action': 'Refresh the board and retry.',
  'error.fleet_snapshot_unavailable.message': 'Fleet snapshot is unavailable.',
  'error.fleet_snapshot_unavailable.action': EN_DIAGNOSTIC_ACTION,
  'error.fleet_registry_unavailable.message': 'Fleet registry cannot be read.',
  'error.fleet_registry_unavailable.action': EN_DIAGNOSTIC_ACTION,
  'error.fleet_registry_invalid.message': 'Fleet registry is invalid.',
  'error.fleet_registry_invalid.action': EN_DIAGNOSTIC_ACTION,
  'error.fleet_board_argument_invalid.message': 'Fleet snapshot request is invalid.',
  'error.fleet_board_argument_invalid.action': EN_DIAGNOSTIC_ACTION,
  'error.fleet_watch_aborted_before_first_snapshot.message': 'Fleet snapshot collection was aborted.',
  'error.fleet_watch_aborted_before_first_snapshot.action': 'Refresh the board and retry.',
  'error.collaboration_snapshot_unavailable.message': 'The collaboration store cannot be read.',
  'error.collaboration_snapshot_unavailable.action': EN_COLLABORATION_ACTION,
  'error.collaboration_snapshot_busy.message': 'The collaboration snapshot service is busy.',
  'error.collaboration_snapshot_busy.action': 'Wait for the current collaboration refresh to finish, then retry.',
  'error.collaboration_snapshot_timeout.message': 'The collaboration snapshot timed out.',
  'error.collaboration_snapshot_timeout.action': 'Refresh the collaboration panel and retry.',
  'error.task_message_timeout.message': 'The task message outcome is unknown because the request timed out.',
  'error.task_message_timeout.action': 'Retry the exact same message id, body, and fence. If it committed, the existing message is returned without a duplicate.',
  'error.task_message_invalid.message': 'The task message is invalid.',
  'error.task_message_invalid.action': EN_REOBSERVE_ACTION,
  'error.task_message_unreadable.message': 'The task inbox cannot be read.',
  'error.task_message_unreadable.action': EN_DIAGNOSTIC_ACTION,
  'error.task_message_transition_invalid.message': 'The task message delivery state does not allow this write.',
  'error.task_message_transition_invalid.action': EN_REOBSERVE_ACTION,
  'error.task_message_envelope_too_large.message': 'The task message request envelope is too large.',
  'error.task_message_envelope_too_large.action': 'Shorten the request, then send it again.',
  'error.task_message_body_too_large.message': 'The message body is over the transport limit.',
  'error.task_message_body_too_large.action': 'Shorten the message, then send it again.',
  'error.message_id_conflict.message': 'A different message already used this message id.',
  'error.message_id_conflict.action': 'Compose the message again so it gets a new id.',
  'error.task_revision_mismatch.message': 'The canonical task definition moved since the snapshot.',
  'error.task_revision_mismatch.action': EN_REOBSERVE_ACTION,
  'error.canonical_source_stale.message': 'The active task board authority changed since the snapshot.',
  'error.canonical_source_stale.action': EN_REOBSERVE_ACTION,
  'error.canonical_sprint_unavailable.message': 'The canonical sprint authority cannot be read.',
  'error.canonical_sprint_unavailable.action': EN_DIAGNOSTIC_ACTION,
  'error.task_not_found.message': 'The task is not in the canonical sprint.',
  'error.task_not_found.action': EN_REOBSERVE_ACTION,
  'error.task_not_pending.message': 'This task no longer accepts messages.',
  'error.task_not_pending.action': EN_REOBSERVE_ACTION,
  'error.task_unowned.message': 'The task has no owner that can receive this message.',
  'error.task_unowned.action': EN_REOBSERVE_ACTION,
  'error.claim_mismatch.message': 'The task owner changed while the message was being sent.',
  'error.claim_mismatch.action': EN_REOBSERVE_ACTION,
  'error.recipient_unavailable.message': 'The task has no bound owner session to receive this message.',
  'error.recipient_unavailable.action': EN_REOBSERVE_ACTION,
  'error.repository_read_only.message': 'The repository is registered read only.',
  'error.repository_read_only.action': 'Re-register the repository with read_write access to send task messages.',
  'error.registry_unavailable.message': 'The fleet registry cannot be read.',
  'error.registry_unavailable.action': EN_DIAGNOSTIC_ACTION,
  'error.repository_not_found.message': 'The repository is not in the fleet registry.',
  'error.repository_not_found.action': 'Adopt the repository with `repo-harness adopt`, then refresh the board.',
  'error.invalid_request.message': 'The request is invalid.',
  'error.invalid_request.action': EN_REOBSERVE_ACTION,
  'error.host_not_allowed.message': 'The request Host is not allowed.',
  'error.host_not_allowed.action': EN_DIAGNOSTIC_ACTION,
  'error.origin_not_allowed.message': 'The request Origin is not allowed.',
  'error.origin_not_allowed.action': EN_DIAGNOSTIC_ACTION,
  'error.method_not_allowed.message': 'The request method is not supported.',
  'error.method_not_allowed.action': EN_DIAGNOSTIC_ACTION,
  'error.not_found.message': 'The requested operator API route does not exist.',
  'error.not_found.action': EN_DIAGNOSTIC_ACTION,
  'error.operator_assets_unavailable.message': 'Operator UI assets are unavailable.',
  'error.operator_assets_unavailable.action': 'Build the operator UI with `bun run build:operator-web`, then reload.',
  'error.operator_server_unavailable.message': 'Operator server failed to handle the request.',
  'error.operator_server_unavailable.action': EN_DIAGNOSTIC_ACTION,
  'repo.tasks': '{count} tasks',

  'blocker.receipt_unavailable': 'The publication receipt cannot be read',
  'blocker.publication_claim_mismatch': 'The lease on this task is not the one the receipt was written for',
  'blocker.publication_pointer_mismatch': 'The publication pointer no longer points at this receipt',
  'blocker.lease_not_reviewing': 'The lease is not in the reviewing state',
  'blocker.provider_unavailable': 'The Git provider could not be read',
  'blocker.provider_data_incomplete': 'The provider returned incomplete data',
  'blocker.changed_during_read': 'The publication changed while it was being read',
  'blocker.pr_not_open': 'The pull request is not open',
  'blocker.draft': 'The pull request is still a draft',
  'blocker.head_moved': 'The head commit moved after verification',
  'blocker.base_moved_since_verification': 'The base branch moved after verification',
  'blocker.review_subject_mismatch': 'The reviewed subject does not match the receipt',
  'blocker.verification_evidence_stale': 'The verification evidence is stale or does not match the receipt',
  'blocker.checks_failed': 'Required checks failed',
  'blocker.checks_pending': 'Checks are still running',
  'blocker.acceptance_missing': 'No acceptance record',
  'blocker.required_reviews_missing': 'Required reviews are missing',
  'blocker.changes_requested': 'A reviewer requested changes',
  'blocker.unresolved_threads': 'Review threads are still unresolved',
  'blocker.not_mergeable': 'The branch conflicts with its base',
  'blocker.task_revision_mismatch': 'The canonical task revision does not match the receipt',
  'blocker.already_integrated': 'The change is already integrated into the base',

  'repair.resume_same_owner': 'Resume with the same owner.',
  'repair.explicit_takeover': 'Take the task over explicitly.',

  'composer.toggleClaim': 'Message current owner',
  'composer.toggleTask': 'Queue message for next claimant',
  'composer.heading': 'Task message',
  'composer.untrusted': 'Your text enters that session as untrusted data inside its next turn of context. It is not an instruction, and the agent may ignore it.',
  'composer.bodyLabel': 'Message',
  'composer.bodyPlaceholder': 'What does the session need to know?',
  'composer.bytes': '{used} / {max} bytes',
  'composer.fenceClaim': 'claim …{claim} · gen {generation} · snapshot {consistency}',
  'composer.fenceTask': 'no current claim · snapshot {consistency}',
  'composer.toggleHeld': 'Queue a task message — held by …{claim}',
  'composer.fenceHeld': 'task scope · observed claim …{claim} · gen {generation} · lease {state} · snapshot {consistency}',
  'composer.sendHeld': 'Queue on the task — holder …{claim} · gen {generation} · {state}',
  'composer.boundary': 'writes: task message only · no lease, no merge',
  'composer.held.available': 'Held by claim …{claim} · generation {generation}, while the lease reads available. Only a bound lease receives claim-addressed messages, so this one queues on the task.',
  'composer.held.reserving': 'Held by claim …{claim} · generation {generation}, still reserving. Only a bound lease receives claim-addressed messages, so this one queues on the task.',
  'composer.held.bound': 'Held by claim …{claim} · generation {generation}, bound after this draft was opened. The draft carries no claim fence, so this message queues on the task.',
  'composer.held.completing': 'Held by claim …{claim} · generation {generation}, already completing. Only a bound lease receives claim-addressed messages, so this one queues on the task.',
  'composer.held.reviewing': 'Held by claim …{claim} · generation {generation}, now in review. Only a bound lease receives claim-addressed messages, so this one queues on the task.',
  'composer.held.released': 'Held by claim …{claim} · generation {generation}, whose lease is already released. Only a bound lease receives claim-addressed messages, so this one queues on the task.',
  'composer.held.unknown': 'Held by claim …{claim} · generation {generation}, and the lease state could not be read. Only a bound lease receives claim-addressed messages, so this one queues on the task.',
  'composer.unheld.available': 'Nobody holds this task now. The message waits for the next claimant, and nothing on this board changes until then.',
  'composer.unheld.reserving': 'A reservation is in progress and no claim is recorded yet. The message waits for the next claimant, and nothing on this board changes until then.',
  'composer.unheld.bound': 'The lease reads bound but records no claim, so there is no session to address. The message waits for the next claimant, and nothing on this board changes until then.',
  'composer.unheld.completing': 'The lease is completing and records no claim. The message waits for the next claimant, and nothing on this board changes until then.',
  'composer.unheld.reviewing': 'This task is in review and records no claim. The message waits for the next claimant, and nothing on this board changes until then.',
  'composer.unheld.released': 'The lease was released and no claim is recorded. The message waits for the next claimant, and nothing on this board changes until then.',
  'composer.unheld.unknown': 'The lease state could not be read and no claim is recorded. The message waits for the next claimant, and nothing on this board changes until then.',
  'composer.send': 'Send to owner — claim …{claim} · gen {generation}',
  'composer.sendTask': 'Send to the next claimant',
  'composer.sending': 'Sending',
  'composer.sent': 'Sent. Waiting for the next snapshot.',
  'composer.blockedReadOnly': 'This repository is registered read only, so the board cannot write to it.',
  'composer.blockedChanged': 'This task changed while the snapshot was read. Refresh before sending.',
  'composer.blockedBoard': 'The board is showing stale or degraded data. Refresh before sending.',
  'composer.blockedEmpty': 'Write the message before sending it.',
  'composer.blockedTooLarge': 'The message is over the {max} byte limit.',
  'composer.ownerGone': 'That session is gone — refresh and read the row again.',
  'composer.ambiguousRetry': 'The send outcome is unknown. Retrying keeps the same message id and fence.',
  'composer.rebindHint': 'This task or owner changed. Rebind only if you intend to address the current snapshot.',
  'composer.rebind': 'Rebind to current snapshot',
  'composer.newMessageIdHint': 'This message id belongs to a different message. Start with a new id before retrying.',
  'composer.newMessageId': 'Start with a new message ID',

  'collab.title': 'Collaboration',
  'collab.scope': 'repository {repository}',
  'collab.hint': 'Select a task to read its repository collaboration lanes.',
  'collab.loading': 'Reading the collaboration store',
  'collab.readOnly': 'Read only. Nothing in this section writes.',
  'collab.mode': 'mode',
  'collab.mode.off': 'off',
  'collab.mode.shadow': 'shadow',
  'collab.mode.active': 'active',
  'collab.modeOffTitle': 'Collaboration is switched off for this repository',
  'collab.modeOffBody': 'The store is still readable, and nothing new can be written to it while the mode is off.',
  'collab.sourceDigest': 'signal set',
  'collab.unverified': '{count} execution contexts withheld',
  'collab.unverifiedBody': 'Their bound task proof did not hold at read time, so the context is not shown.',
  'collab.failedTitle': 'The collaboration store cannot be read',
  'collab.degradedTitle': 'This view is incomplete',
  'collab.degradedBody': 'These sources could not be read: {sources}. What is missing from them is missing here, not absent from the repository.',
  'collab.changedTitle': 'The collaboration store changed while it was read',
  'collab.changedBody': 'These sources moved between the two reads: {sources}. Re-observe before acting on them.',
  'collab.source.mode': 'collaboration mode',
  'collab.source.signals': 'signals',
  'collab.source.handoffs': 'handoffs',
  'collab.source.adoptions': 'adoptions',
  'collab.source.execution_offers': 'execution offers',
  'collab.offersTitle': 'Execution offers are not on this board',
  'collab.offersBody': 'Offers answer what one Engineer could pick up, and the board is not an Engineer. Task availability stays on the worklist.',

  'collab.lanes': 'Lanes',
  'collab.lanesEmpty': 'No lane has a signal in this snapshot.',
  'collab.laneHotspot': 'hotspot {score}',
  'collab.laneSignals': '{count} signals',
  'collab.laneContributors': '{count} contributors',
  'collab.laneArtifacts': '{count} artifact refs',
  'collab.laneUnadopted': '{count} unadopted',
  'collab.laneAdopted': '{count} adopted',
  'collab.laneCrossRefs': '{count} cross-lane refs',

  'collab.discoveries': 'Discoveries',
  'collab.discoveriesEmpty': 'No signal has been published in this repository.',
  'collab.superseded': 'superseded',
  'collab.signalArtifacts': '{count} artifact refs',

  'collab.handoffs': 'Open handoffs',
  'collab.handoffsEmpty': 'No handoff is open.',
  'collab.handoffAdoptions': 'adopted {count}x',
  'collab.handoffNextActions': '{count} next actions',
  'collab.handoffHypotheses': '{count} open hypotheses',
  'collab.handoffTrigger': 'triggered by {trigger}',
  'collab.context.delegated_worker': 'from a delegated worker run',
  'collab.context.bound_task': 'from a task held under lease',
  'collab.context.publication': 'from a publication',
  'collab.context.none': 'no execution context recorded',
  'collab.contextWithheld': 'execution context withheld — its proof did not hold',

  'collab.contributors': 'Contributors',
  'collab.contributorsEmpty': 'Nobody has published to this repository.',
  'collab.actor.module_engineer': 'module engineer',
  'collab.actor.delegated_worker': 'delegated worker',
  'collab.contributorCounts': '{signals} signals · {handoffs} handoffs · {lanes} lanes',

  'collab.opportunities': 'Where a second pair of eyes helps',
  'collab.reason.unadopted_handoff': 'a handoff nobody has picked up',
  'collab.reason.low_contributor_coverage': 'only one participant so far',
  'collab.reason.cross_thread_reference': 'referenced from another lane',
  'collab.reason.recent_activity': 'active right now',
  'collab.reason.artifact_rich_thread': 'carries a lot of evidence',
  'collab.reason.exploration_slot': 'room for another reader',

  'notice.loadingTitle': 'Reading Fleet authority',
  'notice.loadingBody': 'Collecting one bounded snapshot from adopted repositories.',
  'notice.staleTitle': 'Showing the last successful snapshot',
  'notice.changedTitle': 'Snapshot changed during read',
  'notice.changedBody': 'Some task facts moved while Fleet authority was observed. Review the source before acting.',
  'notice.degradedTitle': 'One or more repositories are degraded',
  'notice.degradedBody': 'Fleet remains readable; the affected repository row carries its typed recovery message.',
  'notice.retry': 'Retry',

  'empty.eyebrow': 'no adopted repositories',
  'empty.title': 'The Fleet is quiet.',
  'empty.body': 'Adopt a repository, then refresh this local board to observe its authoritative task state.',
  'fatal.eyebrow': 'authority boundary',
  'fatal.title': 'Fleet snapshot unavailable',
  'fatal.retry': 'Retry observation',

  'footer.protocol': 'protocol {protocol} · sequence {sequence}',

  'error.untranslated': 'untranslated server message',
  'loading.boardLabel': 'Loading Fleet board',
} as const;

export type OperatorMessageKey = keyof typeof en;

/**
 * The dictionary is a closed key set. A code-derived lookup that misses is a
 * miss, not a silent fallback, so the caller can state that what it renders is
 * the server's own sentence rather than board copy.
 */
export function isOperatorMessageKey(value: string): value is OperatorMessageKey {
  return Object.hasOwn(en, value);
}

const zh: Readonly<Record<OperatorMessageKey, string>> = {
  'app.subtitle': '控制台',
  'app.skipToWorklist': '跳到工作队列',

  'status.observedAgo': '{age}前读到的快照',
  'status.observedUnknown': '读不到观测时间',
  'status.sequence': '序号',
  'status.consistency': '一致性',
  'status.consistency.stable': '稳定',
  'status.consistency.changed_during_read': '读取期间有变化',
  'status.consistency.degraded': '降级',
  'status.repositories': '{count} 个仓库',
  'status.unreadable': '{count} 个读不到',
  'status.refresh': '刷新',
  'status.refreshing': '刷新中',
  'status.stale': '数据已过期',
  'status.language': '语言',
  'status.languageEnglish': 'EN',
  'status.languageChinese': '中',

  'age.seconds': '{count} 秒',
  'age.minutes': '{count} 分钟',
  'age.hours': '{count} 小时',
  'age.days': '{count} 天',

  'worklist.title': '工作队列',
  'worklist.filters': '队列筛选',
  'worklist.filterAll': '全部',
  'worklist.empty': '这份快照里没有需要你决定的事。',
  'worklist.groupEmpty': '这一组没有任务。',
  'worklist.expand': '展开{group}',
  'worklist.collapse': '收起{group}',

  'group.needs_you': '需要你',
  'group.ready_to_merge': '可以合并',
  'group.unreadable': '读不到的仓库',
  'group.unclassified': '未分类',
  'group.agent_working': 'agent 在做',
  'group.external': '等外部',
  'group.done': '已完成',

  'row.unread': '{count} 条未读',
  'row.feedback': '{count} 条反馈',
  'row.changedDuringRead': '读取期间有变化',
  'row.noProgress': '没有进展',
  'row.noCause': '没有记录到阻塞',

  'attention.user': '你',
  'attention.agent': 'agent',
  'attention.external': '外部',
  'attention.none': '不需要处理',
  'attention.owned': '{owner}要处理',

  'stage.available': '待认领',
  'stage.working': '进行中',
  'stage.in_review': '审查中',
  'stage.ready_to_merge': '可以合并',
  'stage.done': '已完成',
  'stage.unclassified': '未分类',

  'lease.available': '空闲',
  'lease.reserving': '预留中',
  'lease.bound': '已绑定',
  'lease.completing': '收尾中',
  'lease.reviewing': '审查中',
  'lease.released': '已释放',
  'lease.unknown': '未知',

  'execution.execution_ready': '可以执行',
  'execution.planning_required': '要先规划',
  'execution.inline_ready': '可内联执行',
  'execution.unsupported': '不支持',

  'detail.overviewTitle': '舰队总览',
  'detail.overviewHint': '选一个任务，看它为什么排在这里。',
  'detail.matrixTitle': '各仓库按阶段的任务数',
  'detail.matrixRepository': '仓库',
  'detail.repositoryHealth': '仓库健康',
  'detail.taskDetail': '任务详情',
  'detail.close': '关闭任务详情',
  'detail.revisionChanged': '任务定义在上一次快照之后变过',
  'detail.revisionChangedBody': '这一行还在板上，revision 从 {previous} 变成了 {current}。',
  'detail.cause': '它为什么在这里',
  'detail.causeEmpty': '这份快照里没有阻塞、没有停滞反馈，也没有未读消息。',
  'detail.blockerOwner': '归{owner}处理',
  'detail.noProgressTitle': '反馈显示没有进展',
  'detail.noProgressBody': 'Fleet 把这个任务标成没有进展。快照只带这个标记，不带停了多久。',
  'detail.repairTitle': 'Fleet 记录的恢复路径',
  'detail.identity': '身份与租约',
  'detail.deliveryRuntime': '投递与 runtime 证据',
  'detail.signals': '信号',
  'detail.signalFeedback': '反馈',
  'detail.signalInbox': '信箱',
  'detail.signalBlockers': '阻塞',
  'detail.changedDuringRead': '读快照的时候这个任务变过。动手之前先重新读一次。',

  'field.taskId': '任务 id',
  'field.repository': '仓库',
  'field.revision': 'revision',
  'field.claim': 'claim',
  'field.generation': 'generation',
  'field.lease': '租约',
  'field.execution': '执行',
  'field.publication': '发布',
  'field.headSha': 'head sha',
  'field.effectSha': 'effect sha256',
  'field.deliveryState': '投递状态',
  'field.runtimeReachability': 'runtime 可达性',
  'field.failureClass': '失败分类',
  'field.notClaimed': '没有认领',
  'field.notApplicable': '不适用',
  'field.none': '—',

  'delivery.pending': '待投递',
  'delivery.delivered': '已投递',
  'delivery.acknowledged': '已确认',
  'delivery.failed': '投递失败',
  'delivery.reconciliation_required': '需要 reconcile',
  'runtime.reachable': '可达',
  'runtime.unavailable': 'runtime 不可用',
  'runtime.unknown': '未知',

  'copy.action': '复制{label}',
  'copy.idle': '复制',
  'copy.copied': '已复制',
  'copy.failed': '复制失败',
  'copy.copiedStatus': '{label}已复制',
  'copy.failedStatus': '{label}没能复制',
  'copy.missing': '没有记录{label}',

  'repo.accessMode.read_only': '只读',
  'repo.accessMode.read_write': '可读写',
  'repo.status.unreadable': '读不到',
  'repo.error.repo_unreadable': '读不到仓库权威。检查仓库路径和权限后刷新。',
  'repo.error.repo_authority_invalid': '仓库权威无效。重新接入这个仓库后刷新。',
  'repo.error.repo_snapshot_changed': '观测期间仓库快照变过。刷新后重新读一次。',
  'repo.error.repo_board_unavailable': '读不到仓库的 board 观测。先跑 `repo-harness fleet board --json` 看诊断，再刷新。',
  'repo.error.repo_publication_unreadable': '读不到仓库的 publication 观测。检查 publication store 后刷新。',
  'repo.error.repo_readiness_unavailable': '读不到仓库的 readiness 观测。重新跑一次 merge readiness 后刷新。',
  'repo.error.repo_feedback_unreadable': '读不到仓库的 feedback store。检查 feedback store 后刷新。',
  'repo.error.repo_inbox_unreadable': '读不到仓库的 Task Inbox。检查 inbox store 后刷新。',
  'repo.error.repo_runtime_effect_unreadable': 'Agent Runtime effect 证据不可用。请 reconcile runtime 投递证据后刷新。',
  'repo.error.repo_collection_timeout': '这个仓库超过了 fleet 轮次的收集期限。刷新后重新收一次。',

  'error.operator_api_unavailable.message': '读不到 Fleet 快照',
  'error.operator_api_unavailable.action': ZH_DIAGNOSTIC_ACTION,
  'error.operator_payload_invalid.message': 'Fleet 快照响应无效',
  'error.operator_payload_invalid.action': ZH_DIAGNOSTIC_ACTION,
  'error.operator_collaboration_payload_invalid.message': '协作快照响应无效',
  'error.operator_collaboration_payload_invalid.action': ZH_COLLABORATION_ACTION,
  'error.collaboration_repository_mismatch.message': '协作响应和请求的仓库对不上。',
  'error.collaboration_repository_mismatch.action': ZH_COLLABORATION_ACTION,
  'error.task_message_response_invalid.message': '任务消息的确认回执无效',
  'error.task_message_response_invalid.action': '用同一个 message ID 重试，服务端会把已经存下的事件返回来。',
  'error.task_message_unavailable.message': '这条任务消息没能发出去',
  'error.task_message_unavailable.action': ZH_REOBSERVE_ACTION,
  'error.fleet_snapshot_timeout.message': 'Fleet 快照超时了。',
  'error.fleet_snapshot_timeout.action': '刷新看板后重试。',
  'error.fleet_snapshot_unavailable.message': '读不到 Fleet 快照。',
  'error.fleet_snapshot_unavailable.action': ZH_DIAGNOSTIC_ACTION,
  'error.fleet_registry_unavailable.message': '读不到 Fleet registry。',
  'error.fleet_registry_unavailable.action': ZH_DIAGNOSTIC_ACTION,
  'error.fleet_registry_invalid.message': 'Fleet registry 无效。',
  'error.fleet_registry_invalid.action': ZH_DIAGNOSTIC_ACTION,
  'error.fleet_board_argument_invalid.message': 'Fleet 快照请求无效。',
  'error.fleet_board_argument_invalid.action': ZH_DIAGNOSTIC_ACTION,
  'error.fleet_watch_aborted_before_first_snapshot.message': 'Fleet 快照收集被中断了。',
  'error.fleet_watch_aborted_before_first_snapshot.action': '刷新看板后重试。',
  'error.collaboration_snapshot_unavailable.message': '读不到协作 store。',
  'error.collaboration_snapshot_unavailable.action': ZH_COLLABORATION_ACTION,
  'error.collaboration_snapshot_busy.message': '协作快照服务正忙。',
  'error.collaboration_snapshot_busy.action': '等当前的协作刷新跑完，然后重试。',
  'error.collaboration_snapshot_timeout.message': '协作快照超时了。',
  'error.collaboration_snapshot_timeout.action': '刷新协作面板后重试。',
  'error.task_message_timeout.message': '请求超时，这条任务消息的结果不明确。',
  'error.task_message_timeout.action': '用完全相同的 message id、正文和 fence 重试。如果已经写入，返回的是原来那条，不会多出一条。',
  'error.task_message_invalid.message': '这条任务消息无效。',
  'error.task_message_invalid.action': ZH_REOBSERVE_ACTION,
  'error.task_message_unreadable.message': '读不到 Task Inbox。',
  'error.task_message_unreadable.action': ZH_DIAGNOSTIC_ACTION,
  'error.task_message_transition_invalid.message': '任务消息的投递状态不允许这次写入。',
  'error.task_message_transition_invalid.action': ZH_REOBSERVE_ACTION,
  'error.task_message_envelope_too_large.message': '任务消息的请求信封太大了。',
  'error.task_message_envelope_too_large.action': '把请求改短一点再发。',
  'error.task_message_body_too_large.message': '消息正文超过传输上限。',
  'error.task_message_body_too_large.action': '把消息改短一点再发。',
  'error.message_id_conflict.message': '另一条消息已经用过这个 message id。',
  'error.message_id_conflict.action': '重新开一条消息，让它拿到新的 id。',
  'error.task_revision_mismatch.message': '权威的任务定义在快照之后动过了。',
  'error.task_revision_mismatch.action': ZH_REOBSERVE_ACTION,
  'error.canonical_source_stale.message': '当前生效的任务看板权威在快照之后换过了。',
  'error.canonical_source_stale.action': ZH_REOBSERVE_ACTION,
  'error.canonical_sprint_unavailable.message': '读不到权威的 sprint。',
  'error.canonical_sprint_unavailable.action': ZH_DIAGNOSTIC_ACTION,
  'error.task_not_found.message': '权威的 sprint 里没有这个任务。',
  'error.task_not_found.action': ZH_REOBSERVE_ACTION,
  'error.task_not_pending.message': '这个任务已经不收消息了。',
  'error.task_not_pending.action': ZH_REOBSERVE_ACTION,
  'error.task_unowned.message': '这个任务没有能收消息的持有者。',
  'error.task_unowned.action': ZH_REOBSERVE_ACTION,
  'error.claim_mismatch.message': '发送期间任务的持有者变了。',
  'error.claim_mismatch.action': ZH_REOBSERVE_ACTION,
  'error.recipient_unavailable.message': '这个任务没有 bound 的持有者 session 来收消息。',
  'error.recipient_unavailable.action': ZH_REOBSERVE_ACTION,
  'error.repository_read_only.message': '这个仓库注册成只读。',
  'error.repository_read_only.action': '把仓库改成 read_write 重新注册，才能发任务消息。',
  'error.registry_unavailable.message': '读不到 fleet registry。',
  'error.registry_unavailable.action': ZH_DIAGNOSTIC_ACTION,
  'error.repository_not_found.message': 'fleet registry 里没有这个仓库。',
  'error.repository_not_found.action': '用 `repo-harness adopt` 接入这个仓库，然后刷新看板。',
  'error.invalid_request.message': '请求无效。',
  'error.invalid_request.action': ZH_REOBSERVE_ACTION,
  'error.host_not_allowed.message': '请求的 Host 不在允许范围内。',
  'error.host_not_allowed.action': ZH_DIAGNOSTIC_ACTION,
  'error.origin_not_allowed.message': '请求的 Origin 不在允许范围内。',
  'error.origin_not_allowed.action': ZH_DIAGNOSTIC_ACTION,
  'error.method_not_allowed.message': '不支持这个请求方法。',
  'error.method_not_allowed.action': ZH_DIAGNOSTIC_ACTION,
  'error.not_found.message': '请求的 operator API 路由不存在。',
  'error.not_found.action': ZH_DIAGNOSTIC_ACTION,
  'error.operator_assets_unavailable.message': 'Operator UI 资源不可用。',
  'error.operator_assets_unavailable.action': '用 `bun run build:operator-web` 构建 Operator UI，然后重新加载。',
  'error.operator_server_unavailable.message': 'Operator server 没能处理这个请求。',
  'error.operator_server_unavailable.action': ZH_DIAGNOSTIC_ACTION,
  'repo.tasks': '{count} 个任务',

  'blocker.receipt_unavailable': '读不到发布回执',
  'blocker.publication_claim_mismatch': '当前租约不是回执登记的那一个',
  'blocker.publication_pointer_mismatch': '发布指针已经不指向这份回执',
  'blocker.lease_not_reviewing': '租约不在 reviewing 状态',
  'blocker.provider_unavailable': '读不到 Git provider',
  'blocker.provider_data_incomplete': 'provider 返回的数据不完整',
  'blocker.changed_during_read': '读取期间发布状态变过',
  'blocker.pr_not_open': 'PR 不是 open 状态',
  'blocker.draft': 'PR 还是草稿',
  'blocker.head_moved': '验证之后 head commit 动过',
  'blocker.base_moved_since_verification': '验证之后 base 分支动过',
  'blocker.review_subject_mismatch': '审查的对象和回执对不上',
  'blocker.verification_evidence_stale': '验证证据过期，或者和回执对不上',
  'blocker.checks_failed': '必需的检查没过',
  'blocker.checks_pending': '检查还在跑',
  'blocker.acceptance_missing': '缺验收记录',
  'blocker.required_reviews_missing': '还缺必需的 review',
  'blocker.changes_requested': 'reviewer 要求改动',
  'blocker.unresolved_threads': '还有没解决的审查讨论',
  'blocker.not_mergeable': '分支和 base 有冲突',
  'blocker.task_revision_mismatch': '任务的 revision 和回执对不上',
  'blocker.already_integrated': '改动已经进了 base',

  'repair.resume_same_owner': '让原来的 owner 接着做。',
  'repair.explicit_takeover': '显式接管这个任务。',

  'composer.toggleClaim': '给当前持有者发消息',
  'composer.toggleTask': '给下一个认领者留消息',
  'composer.heading': '任务消息',
  'composer.untrusted': '你写的文字会作为不可信数据，注入那个 session 下一轮的上下文。它不是指令，agent 可以不理。',
  'composer.bodyLabel': '消息',
  'composer.bodyPlaceholder': '这个 session 需要知道什么？',
  'composer.bytes': '{used} / {max} 字节',
  'composer.fenceClaim': 'claim …{claim} · gen {generation} · 快照{consistency}',
  'composer.fenceTask': '当前没有 claim · 快照{consistency}',
  'composer.toggleHeld': '给任务留消息 —— 现由 …{claim} 持有',
  'composer.fenceHeld': 'task 范围 · 观测到 claim …{claim} · gen {generation} · 租约{state} · 快照{consistency}',
  'composer.sendHeld': '排到任务上 —— 持有者 …{claim} · gen {generation} · {state}',
  'composer.boundary': '只写任务消息 · 不动租约，不做合并',
  'composer.held.available': '这个任务记着 claim …{claim} · generation {generation}，而租约状态是空闲。只有 bound 的租约才收 claim 定址的消息，所以这条排在任务上。',
  'composer.held.reserving': '这个任务记着 claim …{claim} · generation {generation}，租约还在预留中。只有 bound 的租约才收 claim 定址的消息，所以这条排在任务上。',
  'composer.held.bound': '这个任务记着 claim …{claim} · generation {generation}，是在这份草稿打开之后才绑定的。草稿没有 claim fence，所以这条排在任务上。',
  'composer.held.completing': '这个任务记着 claim …{claim} · generation {generation}，租约已经在收尾中。只有 bound 的租约才收 claim 定址的消息，所以这条排在任务上。',
  'composer.held.reviewing': '这个任务记着 claim …{claim} · generation {generation}，租约正在审查中。只有 bound 的租约才收 claim 定址的消息，所以这条排在任务上。',
  'composer.held.released': '这个任务记着 claim …{claim} · generation {generation}，租约已经释放。只有 bound 的租约才收 claim 定址的消息，所以这条排在任务上。',
  'composer.held.unknown': '这个任务记着 claim …{claim} · generation {generation}，而租约状态读不到。只有 bound 的租约才收 claim 定址的消息，所以这条排在任务上。',
  'composer.unheld.available': '现在没人认领这个任务。消息会等下一个认领者，在那之前这块板上不会有任何变化。',
  'composer.unheld.reserving': '预留还在进行，还没记下 claim。消息会等下一个认领者，在那之前这块板上不会有任何变化。',
  'composer.unheld.bound': '租约写着 bound，却没有 claim，没有可以定址的 session。消息会等下一个认领者，在那之前这块板上不会有任何变化。',
  'composer.unheld.completing': '租约在收尾，且没有记下 claim。消息会等下一个认领者，在那之前这块板上不会有任何变化。',
  'composer.unheld.reviewing': '这个任务在审查中，且没有记下 claim。消息会等下一个认领者，在那之前这块板上不会有任何变化。',
  'composer.unheld.released': '租约已经释放，也没有记下 claim。消息会等下一个认领者，在那之前这块板上不会有任何变化。',
  'composer.unheld.unknown': '租约状态读不到，也没有记下 claim。消息会等下一个认领者，在那之前这块板上不会有任何变化。',
  'composer.send': '发给持有者 — claim …{claim} · gen {generation}',
  'composer.sendTask': '发给下一个认领者',
  'composer.sending': '发送中',
  'composer.sent': '已发送。等下一次快照。',
  'composer.blockedReadOnly': '这个仓库注册成只读，板子写不进去。',
  'composer.blockedChanged': '读快照的时候这个任务变过。先刷新再发。',
  'composer.blockedBoard': '板上的数据已经过期或者降级。先刷新再发。',
  'composer.blockedEmpty': '先把消息写出来再发。',
  'composer.blockedTooLarge': '消息超过 {max} 字节上限。',
  'composer.ownerGone': '那个 session 已经不在了 —— 刷新之后重新读这一行。',
  'composer.ambiguousRetry': '这次发送的结果不明确。重试会保留同一个 message id 和 fence。',
  'composer.rebindHint': '这个任务或持有者已经变了。只有明确要发给当前快照时，才重新绑定。',
  'composer.rebind': '重新绑定到当前快照',
  'composer.newMessageIdHint': '这个 message id 已经属于另一条消息。重试前先换一个 id。',
  'composer.newMessageId': '用新的 message ID 重新开始',

  'collab.title': '协作',
  'collab.scope': '仓库 {repository}',
  'collab.hint': '选一个任务，看它所在仓库的协作 lane。',
  'collab.loading': '正在读协作 store',
  'collab.readOnly': '只读。这一段不写任何东西。',
  'collab.mode': '模式',
  'collab.mode.off': '关闭',
  'collab.mode.shadow': '影子',
  'collab.mode.active': '启用',
  'collab.modeOffTitle': '这个仓库的协作是关闭的',
  'collab.modeOffBody': 'store 还是能读的；模式关着的时候写不进新东西。',
  'collab.sourceDigest': '信号集',
  'collab.unverified': '{count} 个执行上下文被扣下',
  'collab.unverifiedBody': '它们的 bound task 证明在读的时候没通过，所以上下文不展示。',
  'collab.failedTitle': '读不到协作 store',
  'collab.degradedTitle': '这份视图不完整',
  'collab.degradedBody': '这些来源读不到：{sources}。缺的是这里缺，不是仓库里没有。',
  'collab.changedTitle': '协作 store 在读取期间变过',
  'collab.changedBody': '这些来源在两次读之间动过：{sources}。动它们之前先重新读一次。',
  'collab.source.mode': '协作模式',
  'collab.source.signals': 'signals',
  'collab.source.handoffs': 'handoffs',
  'collab.source.adoptions': 'adoptions',
  'collab.source.execution_offers': 'execution offers',
  'collab.offersTitle': '这块板上没有 execution offers',
  'collab.offersBody': 'offer 回答的是某一个 Engineer 能接什么，而板子不是 Engineer。任务可接状态还在工作队列里。',

  'collab.lanes': 'Lane',
  'collab.lanesEmpty': '这份快照里没有任何 lane 有信号。',
  'collab.laneHotspot': '热度 {score}',
  'collab.laneSignals': '{count} 条信号',
  'collab.laneContributors': '{count} 个参与者',
  'collab.laneArtifacts': '{count} 个证据引用',
  'collab.laneUnadopted': '{count} 个没人接',
  'collab.laneAdopted': '{count} 次被接',
  'collab.laneCrossRefs': '{count} 个跨 lane 引用',

  'collab.discoveries': '发现',
  'collab.discoveriesEmpty': '这个仓库还没有发布过信号。',
  'collab.superseded': '已被取代',
  'collab.signalArtifacts': '{count} 个证据引用',

  'collab.handoffs': '未关闭的交接',
  'collab.handoffsEmpty': '没有未关闭的交接。',
  'collab.handoffAdoptions': '被接 {count} 次',
  'collab.handoffNextActions': '{count} 个下一步',
  'collab.handoffHypotheses': '{count} 个未验证假设',
  'collab.handoffTrigger': '触发原因：{trigger}',
  'collab.context.delegated_worker': '来自一次委派 worker 运行',
  'collab.context.bound_task': '来自一个持租约的任务',
  'collab.context.publication': '来自一次发布',
  'collab.context.none': '没有记录执行上下文',
  'collab.contextWithheld': '执行上下文被扣下 —— 它的证明没通过',

  'collab.contributors': '参与者',
  'collab.contributorsEmpty': '还没有人往这个仓库发布过东西。',
  'collab.actor.module_engineer': 'module engineer',
  'collab.actor.delegated_worker': '委派 worker',
  'collab.contributorCounts': '{signals} 条信号 · {handoffs} 次交接 · {lanes} 个 lane',

  'collab.opportunities': '多一双眼睛会有用的地方',
  'collab.reason.unadopted_handoff': '有交接没人接',
  'collab.reason.low_contributor_coverage': '到现在只有一个参与者',
  'collab.reason.cross_thread_reference': '被别的 lane 引用过',
  'collab.reason.recent_activity': '正在活跃',
  'collab.reason.artifact_rich_thread': '带着不少证据',
  'collab.reason.exploration_slot': '还能再进一个读者',

  'notice.loadingTitle': '正在读 Fleet 权威',
  'notice.loadingBody': '从已接入的仓库收一份有边界的快照。',
  'notice.staleTitle': '显示的是上一次成功的快照',
  'notice.changedTitle': '快照在读取期间变过',
  'notice.changedBody': '读 Fleet 权威的时候有任务事实在动。动手之前先看源头。',
  'notice.degradedTitle': '有仓库处于降级状态',
  'notice.degradedBody': 'Fleet 还能读；受影响的仓库那一行带着自己的恢复提示。',
  'notice.retry': '重试',

  'empty.eyebrow': '没有已接入的仓库',
  'empty.title': 'Fleet 是空的。',
  'empty.body': '先接入一个仓库，再刷新这块本地板子，就能看到它的权威任务状态。',
  'fatal.eyebrow': '权威边界',
  'fatal.title': '读不到 Fleet 快照',
  'fatal.retry': '重新读一次',

  'footer.protocol': '协议 {protocol} · 序号 {sequence}',

  'error.untranslated': '未翻译的服务端消息',
  'loading.boardLabel': '正在加载 Fleet 看板',
};

const dictionaries: Readonly<Record<OperatorLocale, Readonly<Record<OperatorMessageKey, string>>>> = {
  en,
  zh,
};

export type OperatorMessageParams = Readonly<Record<string, string | number>>;

/** Substitution is positional-free and total: an unknown placeholder stays literal. */
export function translate(
  locale: OperatorLocale,
  key: OperatorMessageKey,
  params?: OperatorMessageParams,
): string {
  const template = dictionaries[locale][key];
  if (!params) return template;
  return template.replaceAll(/\{(\w+)\}/gu, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export type OperatorTranslate = (key: OperatorMessageKey, params?: OperatorMessageParams) => string;

export function isOperatorLocale(value: unknown): value is OperatorLocale {
  return value === 'en' || value === 'zh';
}

/** `zh-CN`, `zh-Hant`, and bare `zh` all resolve to the Chinese dictionary. */
export function localeFromNavigatorLanguage(language: string | null | undefined): OperatorLocale | null {
  if (typeof language !== 'string') return null;
  const primary = language.trim().toLowerCase().split('-')[0];
  if (primary === 'zh') return 'zh';
  if (primary === 'en') return 'en';
  return null;
}

function localStorageOrNull(): Storage | null {
  try {
    const scope = globalThis as { localStorage?: Storage; window?: { localStorage?: Storage } };
    return scope.localStorage ?? scope.window?.localStorage ?? null;
  } catch {
    return null;
  }
}

function navigatorLanguage(): string | null {
  try {
    const scope = globalThis as { navigator?: { language?: string } };
    return scope.navigator?.language ?? null;
  } catch {
    return null;
  }
}

export function readStoredLocale(storage: Storage | null = localStorageOrNull()): OperatorLocale | null {
  if (!storage) return null;
  try {
    const stored = storage.getItem(OPERATOR_LOCALE_STORAGE_KEY);
    return isOperatorLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writeStoredLocale(
  locale: OperatorLocale,
  storage: Storage | null = localStorageOrNull(),
): void {
  if (!storage) return;
  try {
    storage.setItem(OPERATOR_LOCALE_STORAGE_KEY, locale);
  } catch {
    // A blocked or full storage must never break the board.
  }
}

/** Stored choice wins over the browser language; both fail closed to `en`. */
export function resolveInitialLocale(options: {
  readonly stored?: OperatorLocale | null;
  readonly language?: string | null;
} = {}): OperatorLocale {
  const stored = options.stored === undefined ? readStoredLocale() : options.stored;
  if (stored) return stored;
  const language = options.language === undefined ? navigatorLanguage() : options.language;
  return localeFromNavigatorLanguage(language) ?? DEFAULT_OPERATOR_LOCALE;
}

export interface OperatorLocaleController {
  readonly locale: OperatorLocale;
  readonly setLocale: (locale: OperatorLocale) => void;
  readonly t: OperatorTranslate;
}

export function useLocale(initial?: OperatorLocale): OperatorLocaleController {
  const [locale, setLocaleState] = useState<OperatorLocale>(() => initial ?? resolveInitialLocale());
  const setLocale = useCallback((next: OperatorLocale) => {
    setLocaleState(next);
    writeStoredLocale(next);
  }, []);
  const t = useCallback<OperatorTranslate>((key, params) => translate(locale, key, params), [locale]);
  return { locale, setLocale, t };
}

export interface RelativeAge {
  readonly key: Extract<OperatorMessageKey, `age.${string}`>;
  readonly count: number;
}

/**
 * Data age is computed in the browser from `observed_at`; the snapshot carries
 * no duration of its own, so nothing here is invented beyond the clock read.
 */
export function relativeAge(observedAt: string, now: number): RelativeAge | null {
  const observed = Date.parse(observedAt);
  if (Number.isNaN(observed)) return null;
  const seconds = Math.max(0, Math.floor((now - observed) / 1000));
  if (seconds < 60) return { key: 'age.seconds', count: seconds };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { key: 'age.minutes', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: 'age.hours', count: hours };
  return { key: 'age.days', count: Math.floor(hours / 24) };
}

export function formatRelativeAge(observedAt: string, now: number, t: OperatorTranslate): string {
  const age = relativeAge(observedAt, now);
  if (!age) return t('status.observedUnknown');
  return t('status.observedAgo', { age: t(age.key, { count: age.count }) });
}
