import type { RepositoryViewState } from './RepositoryWorkspace';
import type { OperatorFleetCardV1 } from './types';
import type { OperatorTranslate } from './i18n';
import { taskKey } from './worklist';

export function PlanningView({ state, repositoryId, cards, onSelect, t }: {
  readonly state: RepositoryViewState; readonly repositoryId: string; readonly cards: readonly OperatorFleetCardV1[];
  readonly onSelect: (card: OperatorFleetCardV1) => void; readonly t: OperatorTranslate;
}) {
  const source = state.kind === 'ready' && state.snapshot.repository_id === repositoryId ? state.snapshot.planning : null;
  const snapshot = source?.status === 'observed' ? source.snapshot : null;
  const graph = snapshot?.graph.status === 'observed' ? snapshot.graph.snapshot : null;
  return <section className="planning-view" aria-labelledby="planning-heading">
    <h2 id="planning-heading">{t('view.planning')}</h2>
    {!snapshot ? <p role="status">{t(state.kind === 'loading' ? 'planning.loading' : 'planning.unavailable')}</p> : <>
      <p className="planning-observation">{snapshot.observation.observed_at}</p>
      {!graph && <p role="status">{t('planning.graphUnavailable')} · <code>{snapshot.graph.status === 'unavailable' ? snapshot.graph.code : ''}</code></p>}
      {snapshot.scheduling.tasks.length === 0 && <p>{t('planning.empty')}</p>}
      <ul className="planning-tasks">{snapshot.scheduling.tasks.map(task => {
        const matches = cards.filter(c => c.repository_id === repositoryId && c.provider_repository_id === task.provider_repository_id && c.provider_issue_id === task.issue_id);
        return <li key={`${task.provider_repository_id}:${task.issue_id}`} data-planning-task={`${task.provider_repository_id}:${task.issue_id}`}>
          <h3>{task.issue?.title ?? `${task.provider_repository_id} / ${task.issue_id}`}</h3>
          <p className="planning-requirement">{task.issue?.body}</p>
          <p>{task.issue?.state ?? t('planning.unavailable')}</p>
          <ul>{task.sessions.map(({session,selection}) => <li key={session.selector.session_binding_sha256}>
            <code>{session.selector.campaign_id} · {session.selector.task} · {session.selector.role} · {session.runtime}</code>
            <p>{selection.state === 'unassigned' ? t('org.unassigned') : `${selection.engineer_id} · ${selection.state} · ${selection.engineer_contract_revision}`}</p>
          </li>)}</ul>
          <details><summary>{t('planning.taskEvidence')}</summary><pre>{JSON.stringify(task,null,2)}</pre></details>
          {matches.map(card => <button className="operator-button" key={taskKey(card)} type="button" onClick={() => onSelect(card)}>{t('planning.openTask')} · {card.execution ? `${card.execution.selector.campaign_id} / ${card.execution.selector.role} / ${card.execution.runtime}` : t('sessions.noIssueSession')}</button>)}
          {matches.length === 0 && <p>{t('planning.taskMismatch')}</p>}
        </li>;
      })}</ul>
      {graph && <div className="planning-packages">{graph.packages.map(workPackage => <section className="planning-package" key={`${workPackage.repository_id}:${workPackage.work_package_id}`}>
        <h3>{workPackage.work_package_id} · {workPackage.issue?.title ?? workPackage.task.issue_id}</h3>
        <p><code>{workPackage.primary_capability}</code> · {workPackage.task.provider_repository_id} / {workPackage.task.issue_id}</p>
        <h4>{t('planning.dependencies')}</h4>
        {workPackage.dependencies.length === 0 ? <p>{t('planning.noDependencies')}</p> : <ul>{workPackage.dependencies.map(edge => <li key={JSON.stringify([edge.repository_id,edge.work_package_id,edge.required_state])}>
          <code>{edge.repository_id} / {edge.work_package_id}</code><br />{edge.required_state} · <strong>{edge.status}</strong> · <code>{edge.authority_revision}</code>
        </li>)}</ul>}
        <h4>{t('planning.acceptance')}</h4><ul>{workPackage.required_acceptance.map((policy,index) => <li key={index}>{policy.gate} · <code>{policy.policy_ref}</code> · <code>{policy.policy_revision}</code></li>)}</ul>
        <details><summary>{t('planning.references')}</summary><pre>{JSON.stringify(workPackage,null,2)}</pre></details>
      </section>)}</div>}
      <details><summary>{t('planning.source')}</summary><pre>{JSON.stringify({observation:snapshot.observation,scheduling_revision:snapshot.scheduling.source_revision,graph:graph ? {sources:graph.sources} : snapshot.graph},null,2)}</pre></details>
    </>}
  </section>;
}
