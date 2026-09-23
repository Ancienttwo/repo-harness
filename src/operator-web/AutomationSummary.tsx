import { useEffect, useState, type ReactNode } from 'react';
import type { AutomationSource, OperatorAutomationSummary } from '../core/operator/automation-summary';
import type { OperatorRepositorySnapshot } from '../core/operator/repository-snapshot';
import { decodeOperatorRepositorySnapshot, fetchRepositorySnapshot } from './repository-snapshot';
import type { OperatorTranslate } from './i18n';

export type RepositoryObservationReader = (repositoryId: string, signal: AbortSignal) => Promise<OperatorRepositorySnapshot>;

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return <div className="automation-fact"><dt>{label}</dt><dd>{children}</dd></div>;
}

function Source<T>({ title, source, children, t }: {
  readonly title: string; readonly source: AutomationSource<T>;
  readonly children: (record: T, index: number) => ReactNode; readonly t: OperatorTranslate;
}) {
  return <section className="automation-source" data-source-status={source.status}>
    <header><h3>{title}</h3><span>{t(`automation.source.${source.status}`)}</span></header>
    <p className="automation-observed"><time dateTime={source.observed_at}>{source.observed_at}</time></p>
    {source.reason && <p><code>{source.reason}</code></p>}
    {source.records.map(children)}
  </section>;
}

/** Every displayed decision remains attached to its original run/group. */
export function AutomationEvidence({ observation, t }: { readonly observation: OperatorRepositorySnapshot; readonly t: OperatorTranslate }) {
  const summary: OperatorAutomationSummary = observation.automation;
  return <>
    <p className="automation-scope">{t('automation.scope')} <strong>{observation.repository_id}</strong>
      {' · '}<time dateTime={summary.observed_at}>{summary.observed_at}</time></p>
    <div className="automation-native" role="note">
      <strong>{t('automation.nativeUnavailable')}</strong>
      <p>{t('automation.nativeExplanation')}</p>
    </div>
    <div className="automation-grid">
      <Source title={t('automation.policy')} source={summary.policy} t={t}>{(row, index) => <details key={index}><summary>{t('automation.mode')}: <code>{row.mode}</code></summary><dl>
        <Fact label={t('automation.sourceRef')}><code>{row.source_ref}</code></Fact>
        <Fact label={t('automation.digest')}><code>{row.policy_sha256}</code></Fact>
      </dl></details>}</Source>
      <Source title={t('automation.grants')} source={summary.grants} t={t}>{(row) => <details key={row.authorization_id}>
        <summary>{row.authorization_id}</summary><p>{t('automation.grantObservation')}</p><dl>
          <Fact label={t('automation.scope')}><code>{row.contract_scope}</code>{row.contract_path && <code>{row.contract_path}</code>}</Fact>
          <Fact label={t('automation.workPackages')}>{row.allowed_work_package_ids.join(', ') || '—'}</Fact>
          <Fact label={t('automation.target')}><code>{row.target_ref}</code><code>{row.target_revision}</code></Fact>
          <Fact label={t('automation.issued')}><time dateTime={row.issued_at}>{row.issued_at}</time></Fact>
          <Fact label={t('automation.expires')}><time dateTime={row.expires_at}>{row.expires_at}</time></Fact>
          <Fact label={t('automation.mergeMode')}><code>{row.merge_mode}</code></Fact>
          <Fact label={t('automation.campaignId')}>{row.campaign_id ?? '—'}</Fact>
          <Fact label={t('automation.digest')}><code>{row.authorization_sha256}</code></Fact>
        </dl></details>}</Source>
      <Source title={t('automation.budgets')} source={summary.budgets} t={t}>{(row) => <details key={row.automation_run_id}>
        <summary><code>{row.state}</code> · {t('automation.owner')}: <code>{row.attention_owner}</code></summary><dl>
          <Fact label={t('automation.run')}><code>{row.automation_run_id}</code></Fact>
          <Fact label={t('automation.deadline')}><time dateTime={row.deadline_at}>{row.deadline_at}</time></Fact>
          <Fact label={t('automation.projection')}>{t(row.projection_stale ? 'automation.stale' : 'automation.observed')}</Fact>
          <Fact label={t('automation.revision')}>{row.budget_revision}</Fact>
          <Fact label={t('automation.events')}>{row.event_count}</Fact>
          <Fact label={t('automation.reservations')}>{row.open_reservation_count}</Fact>
          <Fact label={t('automation.lastStep')}>{row.last_completed_step_index}</Fact>
        </dl>
        <div className="automation-table"><table><caption>{t('automation.metrics')}</caption><thead><tr>
          {(['metric','enforced','limit','consumed','reserved','remaining'] as const).map((key) => <th key={key} scope="col">{t(`automation.${key}`)}</th>)}
        </tr></thead><tbody>{row.metrics.map((metric) => <tr key={metric.metric}>
          <th scope="row"><code>{metric.metric}</code></th><td>{t(metric.enforced ? 'automation.yes' : 'automation.no')}</td>
          {[metric.limit,metric.consumed,metric.reserved,metric.remaining].map((value,index) => <td key={index}>{value ?? t('automation.unknown')}</td>)}
        </tr>)}</tbody></table></div>
        <dl><Fact label={t('automation.stop')}>{row.stop_receipt ? <><code>{row.stop_receipt.refusal_code}</code><code>{row.stop_receipt.triggering_metric}</code><time>{row.stop_receipt.issued_at}</time><code>{row.stop_receipt.stop_receipt_sha256}</code></> : t('automation.source.missing')}</Fact>
          <Fact label={t('automation.evidence')}><code>{row.budget_sha256}</code><code>{row.ledger_sha256}</code><code>{row.slice_sha256}</code></Fact>
        </dl>
      </details>}</Source>
      <Source title={t('automation.controllers')} source={summary.controllers} t={t}>{(row) => <details key={row.run_id}>
        <summary><code>{row.state}</code> · <code>{row.operation}</code></summary><dl>
          <Fact label={t('automation.run')}><code>{row.run_id}</code></Fact>
          <Fact label={t('automation.owner')}><code>{row.source_attention_owner}</code></Fact>
          <Fact label={t('automation.reason')}>{t(`automation.source.${row.typed_reason_status}`)}</Fact>
          <Fact label={t('automation.observed')}><time>{row.observed_at}</time></Fact>
          <Fact label={t('automation.nextCheck')}>{row.retry_at ?? t('automation.source.missing')}</Fact>
          <Fact label={t('automation.task')}><code>{row.task_id ?? '—'}</code></Fact>
          <Fact label={t('automation.claim')}><code>{row.claim_id ?? '—'}</code></Fact>
          <Fact label={t('automation.dispatch')}><code>{row.dispatch_id ?? '—'}</code><code>{row.runtime_effect_id ?? '—'}</code></Fact>
          <Fact label={t('automation.revision')}>{row.revision}</Fact>
          <Fact label={t('automation.evidence')}><code>{row.run_sha256}</code><code>{row.current_sha256}</code><code>{row.event_sha256}</code><code>{row.budget_sha256}</code></Fact>
        </dl></details>}</Source>
      <Source title={t('automation.campaigns')} source={summary.campaigns} t={t}>{(row) => <details key={row.campaign_id}>
        <summary>{row.campaign_id} · <code>{row.state}</code></summary><dl>
          <Fact label={t('automation.operation')}><code>{row.operation}</code></Fact>
          <Fact label={t('automation.observed')}><time>{row.observed_at}</time></Fact>
          <Fact label={t('automation.owner')}>{t('automation.source.unavailable')}</Fact>
          <Fact label={t('automation.reason')}>{t('automation.source.unavailable')}</Fact>
          <Fact label={t('automation.revision')}>{row.revision}</Fact>
          <Fact label={t('automation.evidence')}><code>{row.campaign_sha256}</code><code>{row.authorization_sha256}</code><code>{row.current_sha256}</code><code>{row.event_sha256}</code></Fact>
        </dl>{row.group_decisions.map((group) => <section className="automation-decision" key={group.group_number}>
          <h4>{t('automation.group')} {group.group_number}</h4><dl>
            <Fact label={t('automation.intent')}><code>{group.intent_sha256}</code></Fact>
            <Fact label={t('automation.lastDecision')}>{group.last_decision ? <>
              <code>{group.last_decision.action}</code><code>{group.last_decision.outcome}</code><time>{group.last_decision.observed_at}</time><code>{group.last_decision.receipt_sha256}</code>
            </> : t('automation.source.missing')}</Fact>
            <Fact label={t('automation.nextCheck')}>{group.last_decision?.next_check_at ?? t('automation.source.missing')}</Fact>
          </dl></section>)}</details>}</Source>
    </div>
    <details className="automation-transport"><summary>{t('automation.observationIdentity')}</summary><dl>
      <Fact label={t('automation.reason')}><code>{summary.native_execution.reason}</code></Fact>
      <Fact label={t('automation.epoch')}><code>{observation.service_epoch}</code></Fact>
      <Fact label={t('automation.generation')}>{observation.generation}</Fact>
      <Fact label={t('automation.consistency')}><code>{summary.consistency}</code></Fact>
    </dl></details>
  </>;
}

interface ObservationState {
  readonly repositoryId: string; readonly refreshGeneration: number;
  readonly status: 'loading' | 'ready' | 'failed'; readonly observation: OperatorRepositorySnapshot | null;
}

export function AutomationSummary({ repositoryId, refreshGeneration, readObservation = fetchRepositorySnapshot, t }: {
  readonly repositoryId: string; readonly refreshGeneration: number;
  readonly readObservation?: RepositoryObservationReader; readonly t: OperatorTranslate;
}) {
  const [state, setState] = useState<ObservationState | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({ repositoryId, refreshGeneration, status: 'loading', observation: previous?.repositoryId === repositoryId ? previous.observation : null }));
    void (async () => {
      try {
        const result = decodeOperatorRepositorySnapshot(await readObservation(repositoryId, controller.signal), repositoryId);
        if (!controller.signal.aborted) setState((previous) => {
          const last = previous?.repositoryId === repositoryId ? previous.observation : null;
          if (last?.service_epoch === result.service_epoch && result.generation < last.generation) {
            return { repositoryId, refreshGeneration, status: 'failed', observation: last };
          }
          return { repositoryId, refreshGeneration, status: 'ready', observation: result };
        });
      } catch {
        if (!controller.signal.aborted) setState((previous) => ({ repositoryId, refreshGeneration, status: 'failed', observation: previous?.repositoryId === repositoryId ? previous.observation : null }));
      }
    })();
    return () => controller.abort();
  }, [repositoryId, refreshGeneration, readObservation]);
  // Render-time identity also fences the frame before the replacement effect runs.
  const scoped = state?.repositoryId === repositoryId ? state : null;
  const status = scoped?.refreshGeneration === refreshGeneration ? scoped.status : 'loading';
  return <section className="automation-summary" aria-labelledby="automation-heading" data-observation-status={status}>
    <header className="automation-heading"><div><p>{t('automation.eyebrow')}</p><h2 id="automation-heading">{t('automation.title')}</h2></div>
      <span role="status">{t(`automation.read.${status}`)}</span></header>
    <p className="automation-description">{t('automation.description')}</p>
    {status !== 'ready' && scoped?.observation && <p className="automation-warning" role="status">{t('automation.previous')}</p>}
    {status === 'failed' && <p className="automation-warning" role="alert">{t('automation.failed')}</p>}
    {scoped?.observation && <AutomationEvidence observation={scoped.observation} t={t} />}
  </section>;
}
