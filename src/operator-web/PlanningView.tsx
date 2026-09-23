import type { CollaborationViewState } from './App';
import type { OperatorFleetCardV1 } from './types';
import type { OperatorTranslate } from './i18n';

export function PlanningView({ state, repositoryId, cards, onSelect, t }: {
  readonly state: CollaborationViewState;
  readonly repositoryId: string;
  readonly cards: readonly OperatorFleetCardV1[];
  readonly onSelect: (card: OperatorFleetCardV1) => void;
  readonly t: OperatorTranslate;
}) {
  const source = state.kind === 'ready' && state.snapshot.repository_id === repositoryId ? state.snapshot.planning : null;
  const snapshot = source?.status === 'observed' ? source.snapshot : null;
  const graph = snapshot?.graph.status === 'observed' ? snapshot.graph.snapshot : null;
  return <section className="planning-view" aria-labelledby="planning-heading">
    <h2 id="planning-heading">{t('view.planning')}</h2>
    {!snapshot ? <p role="status">{t(state.kind === 'loading' ? 'planning.loading' : 'planning.unavailable')}</p> : <>
      <p className="planning-observation">{snapshot.observation.observed_at}</p>
      {!graph ? <p role="status">{t('planning.graphUnavailable')}</p>
        : graph.lane === 'unclassified' ? <p role="status">{t('planning.unclassified')}</p>
        : <p>{t('planning.lane')}: <code>{graph.lane}</code></p>}
      {snapshot.tasks.length === 0 && <p>{t('planning.empty')}</p>}
      <ul className="planning-tasks">{snapshot.tasks.map(task => {
        const card = cards.find(c => c.repository_id === task.repository_id && c.task_id === task.task_id && c.task_revision === task.task_revision && c.task_state !== 'missing');
        const workPackage = graph?.packages.find(p => p.task_id === task.task_id && p.task_revision === task.task_revision);
        return <li key={task.task_id} data-planning-task={task.task_id}>
          <h3>{task.task.title}</h3>
          <p className="planning-requirement">{task.task.acceptance}</p>
          <dl>
            <div><dt>{t('planning.mode')}</dt><dd>{task.task.mode}</dd></div>
            <div><dt>{t('planning.preparation')}</dt><dd>{task.offer.execution_readiness}</dd></div>
          </dl>
          <ul className="planning-blockers">{task.offer.blockers.map(blocker => <li key={blocker.code}><code>{blocker.code}</code> · {blocker.attention_owner}</li>)}</ul>
          {task.offer.plan && <p>{t('planning.plan')}: <code>{task.offer.plan.plan_path}</code> · <span>{task.offer.plan.basis}</span></p>}
          {workPackage && <div className="planning-package">
            <p><strong>{workPackage.work_package_id}</strong> · <code>{workPackage.primary_capability}</code></p>
            <h4>{t('planning.dependencies')}</h4>
            {workPackage.dependencies.length === 0 ? <p>{t('planning.noDependencies')}</p> : <ul>{workPackage.dependencies.map(edge => <li key={JSON.stringify([edge.repository_id,edge.work_package_id,edge.required_state])}>
              <code>{edge.repository_id} / {edge.work_package_id}</code><br />{edge.required_state} · <strong>{edge.status}</strong>
            </li>)}</ul>}
            <h4>{t('planning.acceptance')}</h4>
            <ul>{workPackage.required_acceptance.map((policy,index) => <li key={index}>{policy.gate} · <code>{policy.policy_ref}</code></li>)}</ul>
            <details><summary>{t('planning.references')}</summary><pre>{JSON.stringify(workPackage,null,2)}</pre></details>
          </div>}
          <details><summary>{t('planning.taskEvidence')}</summary><pre>{JSON.stringify(task,null,2)}</pre></details>
          <button className="operator-button" type="button" disabled={!card} onClick={() => { if (card) onSelect(card); }}>{t('planning.openTask')}</button>
          {!card && <p>{t('planning.taskMismatch')}</p>}
        </li>;
      })}</ul>
      <details><summary>{t('planning.source')}</summary><pre>{JSON.stringify({canonical:snapshot.canonical,observation:snapshot.observation,graph:graph ? {lane:graph.lane,work_graph_revision:graph.work_graph_revision,sources:graph.sources} : snapshot.graph},null,2)}</pre></details>
    </>}
  </section>;
}
