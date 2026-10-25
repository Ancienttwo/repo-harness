import type { EngineeringOverlaySnapshotV2, OrganizationAttentionSnapshotV2 } from '../engineers/engineering-overlay';
import type { ProviderEngineerSchedulingSnapshot } from '../engineers/scheduling';
import { decodeOperatorTaskSessions } from './task-sessions';

export interface OperatorOrganizationSnapshot {
  readonly overlay: EngineeringOverlaySnapshotV2;
  readonly organization_attention: OrganizationAttentionSnapshotV2;
}
const SHA = /^sha256:[0-9a-f]{64}$/;
const ENGINEER = /^engineer:capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/;
function invalid(): never { throw new Error('operator_organization_payload_invalid'); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length
    || Object.keys(value).some(key => !keys.includes(key))) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value || value.length > 2048 || (pattern && !pattern.test(value))) invalid();
  return value;
}
function array(value: unknown, maximum = 200): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) invalid();
  return value;
}
/** Browser-safe validation; these observations cannot authorize scheduling or effects. */
export function decodeAdmittedScheduling(value: unknown, repositoryId: string): ProviderEngineerSchedulingSnapshot {
  const input = object(value, ['protocol', 'kind', 'repository_id', 'profiles', 'tasks', 'source_revision']);
  if (input.protocol !== 2 || input.kind !== 'provider_engineer_scheduling' || input.repository_id !== repositoryId) invalid();
  text(input.source_revision, SHA);
  const profiles = array(input.profiles);
  const ids = new Set<string>();
  for (const raw of profiles) {
    const profile = object(raw, ['engineer_id', 'capability_id', 'engineer_contract_revision']);
    const id = text(profile.engineer_id, ENGINEER);
    if (ids.has(id)) invalid();
    ids.add(id);
    text(profile.capability_id, /^capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/);
    text(profile.engineer_contract_revision, SHA);
  }
  const tasks = array(input.tasks), seen = new Set<string>(), sessions = new Set<string>();
  for (const raw of tasks) {
    const task = object(raw, ['provider_repository_id', 'issue_id', 'issue', 'sessions']);
    const repo = text(task.provider_repository_id, /^[1-9][0-9]*$/), issueId = text(task.issue_id, /^[1-9][0-9]*$/);
    const key = `${repo}:${issueId}`;
    if (seen.has(key)) invalid();
    seen.add(key);
    if (task.issue !== null) {
      if (!task.issue || typeof task.issue !== 'object' || Array.isArray(task.issue)) invalid();
      const issue = task.issue as Record<string, unknown>;
      if (issue.protocol !== 1 || issue.kind !== 'repo-harness-provider-issue-observation'
        || issue.registered_repository_id !== repositoryId || issue.provider_repository_id !== repo
        || issue.provider_issue_id !== issueId || !['open', 'closed'].includes(issue.state as string)
        || typeof issue.title !== 'string' || typeof issue.body !== 'string' || typeof issue.eligible !== 'boolean') invalid();
      text(issue.source_revision, SHA); text(issue.observation_sha256, SHA);
    }
    for (const rawSession of array(task.sessions)) {
      const row = object(rawSession, ['session', 'selection']);
      const decoded = decodeOperatorTaskSessions({ protocol: 1, kind: 'operator_task_sessions', repository_id: repositoryId,
        observed_at: '2000-01-01T00:00:00.000Z', sessions: [row.session] }, { repository_id: repositoryId }).sessions[0]!;
      if (decoded.selector.provider_repository_id !== repo || decoded.selector.issue_id !== issueId
        || sessions.has(decoded.selector.session_binding_sha256)) invalid();
      sessions.add(decoded.selector.session_binding_sha256);
      const selection = row.selection as Record<string, unknown>;
      if (selection?.state === 'unassigned') {
        object(selection, ['state']);
        if (decoded.profile_selection.state !== 'unassigned') invalid();
      } else {
        object(selection, ['state', 'engineer_id', 'engineer_contract_revision']);
        if (!['selected', 'profile_missing', 'profile_revision_changed'].includes(selection.state as string)) invalid();
        text(selection.engineer_id, ENGINEER); text(selection.engineer_contract_revision, SHA);
        if (decoded.profile_selection.state !== 'selected' || selection.engineer_id !== decoded.profile_selection.engineer_id
          || selection.engineer_contract_revision !== decoded.profile_selection.engineer_contract_revision) invalid();
        const profile = profiles.find(raw => (raw as Record<string, unknown>).engineer_id === selection.engineer_id) as Record<string, unknown> | undefined;
        const expected = !profile ? 'profile_missing' : profile.engineer_contract_revision !== selection.engineer_contract_revision ? 'profile_revision_changed' : 'selected';
        if (selection.state !== expected) invalid();
      }
    }
  }
  return value as ProviderEngineerSchedulingSnapshot;
}
export function decodeOperatorOrganizationSnapshot(value: unknown, repositoryId: string): OperatorOrganizationSnapshot {
  if (new TextEncoder().encode(JSON.stringify(value)).length > 2 * 1024 * 1024) invalid();
  const pair = object(value, ['overlay', 'organization_attention']);
  const overlay = object(pair.overlay, ['protocol', 'kind', 'repository_id', 'registry_revision', 'observed_at', 'scheduling', 'runtime_effects', 'components', 'snapshot_consistency', 'snapshot_sha256']);
  if (overlay.protocol !== 2 || overlay.kind !== 'repo-harness-engineering-overlay-snapshot' || overlay.repository_id !== repositoryId) invalid();
  text(overlay.registry_revision, SHA); text(overlay.snapshot_sha256, SHA);
  if (!Number.isFinite(Date.parse(text(overlay.observed_at)))) invalid();
  if (overlay.scheduling !== null) decodeAdmittedScheduling(overlay.scheduling, repositoryId);
  const components = array(overlay.components, 1);
  if (components.length !== 1) invalid();
  const component = object(components[0], ['component', 'support', 'observation_before', 'observation_after']);
  if (component.component !== 'scheduling') invalid();
  if (component.support === 'available') {
    text(component.observation_before, SHA); text(component.observation_after, SHA);
    if (overlay.scheduling === null || (overlay.scheduling as ProviderEngineerSchedulingSnapshot).source_revision !== component.observation_after) invalid();
  } else if (component.support !== 'unreadable' || component.observation_before !== null || component.observation_after !== null || overlay.scheduling !== null) invalid();
  const expected = component.support === 'unreadable' ? 'degraded' : component.observation_before === component.observation_after ? 'stable' : 'changed_during_read';
  if (overlay.snapshot_consistency !== expected) invalid();
  const runtime = object(overlay.runtime_effects, ['support', 'engineers']);
  if (!['available', 'unreadable'].includes(runtime.support as string)) invalid();
  const engineers = array(runtime.engineers);
  if (runtime.support === 'unreadable' && engineers.length) invalid();
  for (const raw of engineers) {
    const row = object(raw, ['engineer_id', 'effects']); text(row.engineer_id, ENGINEER);
    const effects = object(row.effects, ['support', 'active', 'reconciliation_required', 'failed', 'wake', 'revision']);
    if (effects.support !== 'available') invalid();
    for (const key of ['active', 'reconciliation_required', 'failed']) if (!Number.isSafeInteger(effects[key]) || (effects[key] as number) < 0) invalid();
    text(effects.revision, SHA);
    const wake = object(effects.wake, ['pending', 'delivered', 'failed', 'reconciliation_required']);
    for (const count of Object.values(wake)) if (!Number.isSafeInteger(count) || (count as number) < 0) invalid();
  }
  const attention = object(pair.organization_attention, ['protocol', 'kind', 'repository_id', 'overlay_snapshot_sha256', 'observed_at', 'snapshot_consistency', 'attention', 'snapshot_sha256']);
  if (attention.protocol !== 2 || attention.kind !== 'repo-harness-organization-attention-snapshot' || attention.repository_id !== repositoryId
    || attention.overlay_snapshot_sha256 !== overlay.snapshot_sha256 || attention.observed_at !== overlay.observed_at || attention.snapshot_consistency !== expected) invalid();
  text(attention.snapshot_sha256, SHA);
  for (const raw of array(attention.attention)) {
    const item = object(raw, ['session_binding_sha256', 'engineer_id', 'reason', 'owner']);
    text(item.session_binding_sha256, SHA);
    if (item.engineer_id !== null) text(item.engineer_id, ENGINEER);
    if (item.owner !== 'maintainer' || !['profile_unassigned', 'profile_missing', 'engineer_contract_revision_changed'].includes(item.reason as string)) invalid();
  }
  return value as OperatorOrganizationSnapshot;
}

export function projectOperatorOrganizationSnapshot(overlay: EngineeringOverlaySnapshotV2, organization_attention: OrganizationAttentionSnapshotV2): OperatorOrganizationSnapshot {
  return decodeOperatorOrganizationSnapshot({ overlay, organization_attention }, overlay.repository_id);
}
