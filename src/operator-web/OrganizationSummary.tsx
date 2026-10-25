import { AdmittedTaskActivity } from './AdmittedTaskActivity';
import { useState } from 'react';
import type { RepositoryViewState } from './RepositoryWorkspace';
import type { OperatorTranslate } from './i18n';
import { TaskDiff } from './TaskDiff';

export function OrganizationSummary({ state, repositoryId, t }: { readonly state: RepositoryViewState; readonly repositoryId: string; readonly t: OperatorTranslate }) {
  const [profileId, setProfileId] = useState(''), [sessionId, setSessionId] = useState('');
  const source = state.kind === 'ready' && state.snapshot.repository_id === repositoryId ? state.snapshot.organization : null;
  const snapshot = source?.status === 'observed' ? source.snapshot : null;
  const overlay = snapshot?.overlay, scheduling = overlay?.scheduling;
  const executions = scheduling?.tasks.flatMap(task => task.sessions.map(execution => ({ task, execution }))) ?? [];
  const visible = executions.filter(({ execution }) => !profileId || execution.selection.state !== 'unassigned' && execution.selection.engineer_id === profileId);
  const selected = visible.find(({ execution }) => execution.session.selector.session_binding_sha256 === sessionId);
  return <section className="organization-summary" aria-labelledby="organization-heading">
    <h2 id="organization-heading">{t('org.title')}</h2>
    <p>{t('org.boundary')}</p>
    {source && !snapshot && <p>{t('org.observedAt')}: <time>{source.observed_at}</time></p>}
    {!snapshot || !overlay ? <p role="status">{t(state.kind === 'loading' || state.kind === 'idle' || (state.kind === 'ready' && state.snapshot.repository_id !== repositoryId) ? 'org.loading' : 'org.sourceUnavailable')}</p> : <>
      <p>{t('org.observedAt')}: <time>{overlay.observed_at}</time> · {overlay.snapshot_consistency}</p>
      <h3>{t('org.attention')}</h3>
      {snapshot.organization_attention.attention.length === 0 ? <p>{t(scheduling ? 'org.noAttention' : 'org.sourceUnavailable')}</p> : <ul>{snapshot.organization_attention.attention.map(item => <li key={`${item.session_binding_sha256}:${item.reason}`}>
        <strong>{item.engineer_id ?? t('org.unassigned')}</strong> · {item.reason} · {t('org.owner')}: {item.owner}
        <details><summary>{t('org.source')}</summary><code>{item.session_binding_sha256}</code></details>
      </li>)}</ul>}
      <h3>{t('org.engineers')}</h3>
      {!scheduling ? <p role="status">{t('org.sourceUnavailable')}</p> : <>
        <label>{t('org.profileFilter')}<select value={profileId} onChange={event => { setProfileId(event.target.value); setSessionId(''); }}>
          <option value="">{t('org.allProfiles')}</option>
          {scheduling.profiles.map(profile => <option key={profile.engineer_id} value={profile.engineer_id}>{profile.engineer_id}</option>)}
        </select></label>
        {scheduling.profiles.length === 0 ? <p>{t('org.empty')}</p> : <ul className="organization-engineers">{scheduling.profiles.filter(profile => !profileId || profile.engineer_id === profileId).map(profile => {
          const effects = overlay.runtime_effects.support === 'available' ? overlay.runtime_effects.engineers.find(row => row.engineer_id === profile.engineer_id)?.effects : undefined;
          return <li key={profile.engineer_id}>
            <h4>{profile.engineer_id}</h4><p>{profile.capability_id}</p>
            <dl><div><dt>{t('org.profileRevision')}</dt><dd><code>{profile.engineer_contract_revision}</code></dd></div>
              <div><dt>{t('org.effects')}</dt><dd>{!effects || effects.support !== 'available' ? t('org.sourceUnavailable') : `${t('org.pending')}: ${effects.active} · ${t('org.reconcile')}: ${effects.reconciliation_required} · ${t('org.failed')}: ${effects.failed}`}</dd></div>
            </dl>
            {effects && <details><summary>{t('org.source')}</summary><pre>{JSON.stringify(effects, null, 2)}</pre></details>}
          </li>;
        })}</ul>}
        <h3>{t('sessions.title')}</h3>
        {visible.length === 0 ? <p>{t('sessions.empty')}</p> : <>
          <label>{t('sessions.select')}<select value={selected ? sessionId : ''} onChange={event => setSessionId(event.target.value)}>
            <option value="">{t('sessions.choose')}</option>
            {visible.map(({ task, execution }) => <option key={execution.session.selector.session_binding_sha256} value={execution.session.selector.session_binding_sha256}>
              {task.issue?.title ?? `${task.provider_repository_id} / ${task.issue_id}`} · {execution.session.selector.campaign_id} · {execution.session.selector.task} / {execution.session.selector.role} · {execution.selection.state}
            </option>)}
          </select></label>
          {selected && <div className="organization-session">
            <p>{selected.task.issue?.title ?? `${selected.task.provider_repository_id} / ${selected.task.issue_id}`}</p>
            <p>{t('org.profileSelection')}: {selected.execution.selection.state}</p>
            <p>{t('org.claim')}: <code>{selected.execution.session.selector.claim_ref}</code> · <code>{selected.execution.session.selector.claim_revision}</code></p>
            <p>{t('org.provider')}: {selected.execution.session.runtime} · {selected.execution.session.harness_kind} · {selected.execution.session.branch}</p>
            <div key={JSON.stringify(selected.execution.session.selector)}><TaskDiff selector={selected.execution.session.selector} t={t} /><AdmittedTaskActivity selector={selected.execution.session.selector} t={t} /></div>
            <details><summary>{t('org.source')}</summary><pre>{JSON.stringify(selected, null, 2)}</pre></details>
          </div>}
        </>}
      </>}
      <details><summary>{t('org.sourceHealth')}</summary><pre>{JSON.stringify({ registry_revision: overlay.registry_revision, snapshot_sha256: overlay.snapshot_sha256, components: overlay.components, runtime_effects: overlay.runtime_effects.support }, null, 2)}</pre></details>
    </>}
  </section>;
}
