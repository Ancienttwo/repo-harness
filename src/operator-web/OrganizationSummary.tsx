import type { CollaborationViewState } from './App';
import type { OperatorTranslate } from './i18n';

export function OrganizationSummary({ state, repositoryId, t }: { readonly state: CollaborationViewState; readonly repositoryId: string; readonly t: OperatorTranslate }) {
  const source = state.kind === 'ready' && state.snapshot.repository_id === repositoryId ? state.snapshot.organization : null;
  const snapshot = source?.status === 'observed' ? source.snapshot : null;
  return <section className="organization-summary" aria-labelledby="organization-heading">
    <h2 id="organization-heading">{t('org.title')}</h2>
    <p>{t('org.boundary')}</p>
    {source && !snapshot && <p>{t('org.observedAt')}: <time>{source.observed_at}</time></p>}
    {!snapshot ? <p role="status">{t(state.kind === 'loading' || state.kind === 'idle' || (state.kind === 'ready' && state.snapshot.repository_id !== repositoryId) ? 'org.loading' : 'org.sourceUnavailable')}</p> : <>
      <p>{t('org.observedAt')}: <time>{snapshot.observed_at}</time> · {snapshot.snapshot_consistency}</p>
      <h3>{t('org.attention')}</h3>
      {snapshot.attention.attention.length === 0 ? <p>{t('org.noAttention')}</p> : <ul>{snapshot.attention.attention.map(item => <li key={`${item.engineer_id}:${item.reason}`}>
        <strong>{item.engineer_id}</strong> · {item.reason} · {t('org.owner')}: {item.owner}
        <details><summary>{t('org.source')}</summary><code>{item.source_revision}</code></details>
      </li>)}</ul>}
      <h3>{t('org.engineers')}</h3>
      {snapshot.engineers.length === 0 ? <p>{t(snapshot.components.find(item => item.component === 'profiles')?.support === 'unreadable' ? 'org.sourceUnavailable' : 'org.empty')}</p> : <ul className="organization-engineers">{snapshot.engineers.map(engineer => <li key={engineer.engineer_id}>
        <h4>{engineer.engineer_id}</h4><p>{engineer.capability_id}</p>
        <dl>
          <div><dt>Binding</dt><dd>{engineer.binding.support} · {engineer.binding.state ?? t('org.unknown')}</dd></div>
          {engineer.binding.value && <div><dt>{t('org.provider')}</dt><dd>{engineer.binding.value.provider} · {engineer.binding.value.observation}</dd></div>}
          <div><dt>Claim</dt><dd>{engineer.active_claim.support === 'unreadable' ? t('org.sourceUnavailable') : engineer.active_claim.value ? `${engineer.active_claim.value.claim_id} / ${engineer.active_claim.value.lease_generation}` : t('org.noClaim')}</dd></div>
          {engineer.active_claim.value && <div><dt>Task</dt><dd>{engineer.active_claim.value.task_id}</dd></div>}
          <div><dt>{t('org.messages')}</dt><dd>{engineer.messages.support === 'unreadable' ? t('org.sourceUnavailable') : `${t('org.pending')}: ${engineer.messages.pending} · ${t('org.failed')}: ${engineer.messages.delivery_failed}`}</dd></div>
          <div><dt>{t('org.effects')}</dt><dd>{engineer.runtime_effects.support === 'unreadable' ? t('org.sourceUnavailable') : `${t('org.pending')}: ${engineer.runtime_effects.active} · ${t('org.reconcile')}: ${engineer.runtime_effects.reconciliation_required} · ${t('org.failed')}: ${engineer.runtime_effects.failed}`}</dd></div>
        </dl>
        <details><summary>{t('org.source')}</summary><pre>{JSON.stringify(engineer, null, 2)}</pre></details>
      </li>)}</ul>}
      <details><summary>{t('org.sourceHealth')}</summary><pre>{JSON.stringify({ registry_revision: snapshot.registry_revision, source_snapshot_sha256: snapshot.source_snapshot_sha256, components: snapshot.components }, null, 2)}</pre></details>
    </>}
  </section>;
}


export function DecisionSummary({ state, repositoryId, after, onPage, t }: {
  readonly state: CollaborationViewState;
  readonly repositoryId: string;
  readonly after: string | null;
  readonly onPage: (after: string | null) => void;
  readonly t: OperatorTranslate;
}) {
  const scoped = state.kind === 'ready' && state.snapshot.repository_id === repositoryId && state.snapshot.decision_after === after;
  const source = scoped ? state.snapshot.decisions : null;
  const page = source?.status === 'observed' ? source.snapshot : null;
  const loading = state.kind === 'idle' || state.kind === 'loading' || state.kind === 'ready' && !scoped;
  return <section className="organization-summary decision-summary" aria-labelledby="decisions-heading">
    <h2 id="decisions-heading">{t('decision.title')}</h2>
    <p>{t('decision.boundary')}</p>
    {source && <p>{t('org.observedAt')}: <time>{source.observed_at}</time></p>}
    {!page ? <p role="status">{t(loading ? 'decision.loading' : 'org.sourceUnavailable')}</p> : <>
      <p>{t(page.coverage.complete && after === null ? 'decision.complete' : 'decision.partial')} · {t('decision.scanned')}: {page.coverage.scanned}</p>
      {page.entries.length === 0 ? <p>{t(page.coverage.complete && after === null ? 'decision.empty' : 'decision.emptyPage')}</p> : <ul>{page.entries.map(entry => <li key={entry.decision_id}>
        <h3>{entry.question}</h3>
        <p>{t('decision.owner')}</p>
        <dl><div><dt>Task</dt><dd>{entry.task_fence.task_id}</dd></div><div><dt>Engineer</dt><dd>{entry.binding_fence.engineer_id}</dd></div></dl>
        <details><summary>{t('org.source')}</summary><pre>{JSON.stringify(entry, null, 2)}</pre></details>
      </li>)}</ul>}
      <details><summary>{t('decision.coverage')}</summary><pre>{JSON.stringify({ query: page.query, directory_revision: page.directory_revision, coverage: page.coverage }, null, 2)}</pre></details>
    </>}
    <div className="decision-pagination">
      {after !== null && <button className="operator-button" type="button" onClick={() => onPage(null)}>{t('decision.first')}</button>}
      {page?.coverage.next_after && <button className="operator-button" type="button" onClick={() => onPage(page.coverage.next_after)}>{t('decision.next')}</button>}
    </div>
  </section>;
}
