import type { EngineeringOverlaySnapshotV2, OrganizationAttentionSnapshotV2 } from '../engineers/engineering-overlay';
import type { ProviderEngineerSchedulingSnapshot } from '../engineers/scheduling';
import { decodeAdmittedTaskSessions } from '../sessions/task-sessions';

export interface OperatorOrganizationSnapshot {
  readonly overlay: EngineeringOverlaySnapshotV2;
  readonly organization_attention: OrganizationAttentionSnapshotV2;
}
const SHA = /^sha256:[0-9a-f]{64}$/;
const ENGINEER = /^engineer:capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/;
// Exact ProviderIssueObservationV1 keys; its node-side validator cannot load in the browser.
const ISSUE_OBSERVATION_KEYS = ['protocol', 'kind', 'registered_repository_id', 'provider', 'provider_host', 'provider_repository_id',
  'provider_issue_id', 'display_ref', 'url', 'observed_at', 'provider_created_at', 'provider_updated_at', 'state', 'title', 'body',
  'labels', 'assignees', 'comments_policy', 'policy_revision', 'eligible', 'eligibility_reasons', 'source_revision', 'observation_sha256'] as const;
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
    const capability = text(profile.capability_id, /^capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/);
    if (id !== `engineer:${capability}`) invalid();
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
      const issue = object(task.issue, ISSUE_OBSERVATION_KEYS);
      if (issue.protocol !== 1 || issue.kind !== 'repo-harness-provider-issue-observation'
        || issue.registered_repository_id !== repositoryId || issue.provider_repository_id !== repo
        || issue.provider_issue_id !== issueId || !['open', 'closed'].includes(issue.state as string)
        || typeof issue.title !== 'string' || typeof issue.body !== 'string' || typeof issue.eligible !== 'boolean') invalid();
      text(issue.source_revision, SHA); text(issue.observation_sha256, SHA);
    }
    for (const rawSession of array(task.sessions)) {
      const row = object(rawSession, ['session', 'selection']);
      const decoded = decodeAdmittedTaskSessions({ protocol: 1, kind: 'operator_task_sessions', repository_id: repositoryId,
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
  const components = array(overlay.components, 2).map(raw => object(raw, ['component', 'support', 'observation_before', 'observation_after']));
  if (components[0]?.component !== 'scheduling' || components[1]?.component !== 'runtime_effects') invalid();
  if (components.length !== 2 || new Set(components.map(component => component.component)).size !== 2
    || components.some(component => component.component !== 'scheduling' && component.component !== 'runtime_effects')) invalid();
  for (const component of components) {
    if (component.support === 'available') { text(component.observation_before, SHA); text(component.observation_after, SHA); }
    else if (component.support !== 'unreadable' || component.observation_before !== null || component.observation_after !== null) invalid();
  }
  const schedulingComponent = components.find(component => component.component === 'scheduling')!;
  if (schedulingComponent.support === 'available') {
    if (overlay.scheduling === null || (overlay.scheduling as ProviderEngineerSchedulingSnapshot).source_revision !== schedulingComponent.observation_after) invalid();
  } else if (overlay.scheduling !== null) invalid();
  const expected = components.some(component => component.support === 'unreadable') ? 'degraded'
    : components.some(component => component.observation_before !== component.observation_after) ? 'changed_during_read' : 'stable';
  if (overlay.snapshot_consistency !== expected) invalid();
  const runtime = object(overlay.runtime_effects, ['support', 'engineers']);
  if (!['available', 'unreadable'].includes(runtime.support as string)) invalid();
  if (components.find(component => component.component === 'runtime_effects')!.support !== runtime.support) invalid();
  const engineers = array(runtime.engineers);
  if (runtime.support === 'available' && (overlay.scheduling === null || engineers.length !== (overlay.scheduling as ProviderEngineerSchedulingSnapshot).profiles.length)) invalid();
  const runtimeIds = new Set<string>();
  if (runtime.support === 'unreadable' && engineers.length) invalid();
  for (const raw of engineers) {
    const row = object(raw, ['engineer_id', 'effects']); const id = text(row.engineer_id, ENGINEER);
    if (runtimeIds.has(id) || !(overlay.scheduling as ProviderEngineerSchedulingSnapshot).profiles.some(profile => profile.engineer_id === id)) invalid();
    runtimeIds.add(id);
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
    if (item.reason === 'runtime_reconciliation_required') {
      if (item.session_binding_sha256 !== null || item.owner !== 'runtime_operator') invalid();
      text(item.engineer_id, ENGINEER);
      if (!engineers.some(raw => (raw as {engineer_id: unknown; effects: {reconciliation_required: number}}).engineer_id === item.engineer_id && (raw as {effects: {reconciliation_required: number}}).effects.reconciliation_required > 0)) invalid();
    } else {
      text(item.session_binding_sha256, SHA);
      if (item.engineer_id !== null) text(item.engineer_id, ENGINEER);
      if (item.owner !== 'maintainer' || !['profile_unassigned', 'profile_missing', 'engineer_contract_revision_changed'].includes(item.reason as string)) invalid();
    }
  }
  return value as OperatorOrganizationSnapshot;
}

export function projectOperatorOrganizationSnapshot(overlay: EngineeringOverlaySnapshotV2, organization_attention: OrganizationAttentionSnapshotV2): OperatorOrganizationSnapshot {
  return decodeOperatorOrganizationSnapshot({ overlay, organization_attention }, overlay.repository_id);
}
