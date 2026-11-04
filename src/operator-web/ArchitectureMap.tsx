import { useCallback, useEffect, useRef, useState } from 'react';
import '@xyflow/react/dist/base.css';
import {
  decodeArchitectureMap,
  decodeArchitectureMapRefusal,
  type ArchctxRefusalV1,
  type ArchitectureImpactV1,
  type ArchitectureLayerDirectionReason,
  type ArchitectureMapUnavailableV1,
  type ArchitectureMapV1,
} from '../core/operator/architecture-map';
import {
  archctxCode,
  firstImpactPullRequest,
  MAP_LAYERS,
  modulesLayerView,
  truncatedParts,
  violationItems,
  type MapLayerId,
} from './architecture-map-layers';
import { counted, Gap, Note } from './architecture-map-parts';
import { ArchitectureModules } from './ArchitectureModules';
import { ArchitectureSequence, SequenceLensTools } from './ArchitectureSequence';
import { ArchitectureTopology } from './ArchitectureTopology';
import type { OperatorTranslate } from './i18n';
import { useObservationRefresh } from './useObservationRefresh';

/** The route's refusal, or `unreachable` when the route gave no typed refusal. */
export type ArchitectureMapRead =
  | { readonly state: 'ok'; readonly map: ArchitectureMapV1 }
  | ArchitectureMapUnavailableV1
  | { readonly state: 'unavailable'; readonly reason: 'unreachable' };
export type ArchitectureMapReader = (repositoryId: string, signal: AbortSignal) => Promise<ArchitectureMapRead>;

export async function fetchArchitectureMap(repositoryId: string, signal: AbortSignal): Promise<ArchitectureMapRead> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/repositories/${encodeURIComponent(repositoryId)}/architecture/map`, { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal.aborted) throw error;
    return { state: 'unavailable', reason: 'unreachable' };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) return decodeArchitectureMapRefusal(body) ?? { state: 'unavailable', reason: 'unreachable' };
  try { return { state: 'ok', map: decodeArchitectureMap(body) }; } catch { return { state: 'unavailable', reason: 'architecture_map_invalid' }; }
}

/** The map of one repository. A new collection of the same commit keeps the shown map, so the layout runs again only on a change. */
function useArchitectureMap(read: ArchitectureMapReader, repositoryId: string, generation: number): ArchitectureMapRead | null {
  const [result, setResult] = useState<{ readonly repositoryId: string; readonly read: ArchitectureMapRead } | null>(null);
  const request = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    const next = await read(repositoryId, signal);
    if (signal.aborted) return false;
    setResult(current => {
      const shown = current?.repositoryId === repositoryId && current.read.state === 'ok' ? current.read.map : null;
      if (next.state === 'ok' && shown !== null && JSON.stringify(shown) === JSON.stringify({ ...next.map, collected_at: shown.collected_at })) return current;
      return { repositoryId, read: next };
    });
    return next.state === 'ok';
  }, [read, repositoryId]);
  useObservationRefresh(request, JSON.stringify([repositoryId, generation]));
  return result?.repositoryId === repositoryId ? result.read : null;
}

/** A layer with no data shows as unavailable; it stays selectable so its reason can be read. */
function layerAvailable(map: ArchitectureMapV1, layer: MapLayerId): boolean {
  return layer === 'violations' ? Object.values(map.layers.violations).some(part => part.state === 'ok') : map.layers[layer].state === 'ok';
}

/** The count on a layer chip: what the layer covers, in capabilities where it marks the module map. `null` when the layer has no data. */
function layerCount(map: ArchitectureMapV1, layer: MapLayerId, pullRequest: number | null, t: OperatorTranslate): string | null {
  if (!layerAvailable(map, layer)) return null;
  const { changes, pull_requests: pullRequests, tests, decisions } = map.layers;
  const modules = (id: MapLayerId) => [...modulesLayerView(map, id, pullRequest).marks.values()].filter(mark => mark.tone !== 'muted').length;
  if (layer === 'changes') return changes.state === 'ok' ? t('architecture.layer.count.changes', { modules: counted(t, modules('changes'), 'module', changes.truncated.nodes), commits: counted(t, changes.commits.length, 'commit') }) : null;
  if (layer === 'violations') return String(violationItems(map));
  if (layer === 'pull_requests') {
    const impact = pullRequests.state === 'ok' ? pullRequests.pull_requests.find(item => item.number === pullRequest)?.impact : undefined;
    return pullRequest === null ? null : impact?.state === 'ok' ? t('architecture.layer.count.pull_requests', { number: pullRequest, modules: counted(t, modules('pull_requests'), 'module', impact.truncated.nodes) }) : `#${pullRequest}`;
  }
  if (layer === 'tests') return tests.state === 'ok' ? `${tests.capabilities.length} / ${map.nodes.filter(node => node.kind === 'capability').length}` : null;
  return counted(t, decisions.items.length, 'decision');
}

function LayerBar({ map, layer, pullRequest, onLayer, t }: {
  readonly map: ArchitectureMapV1;
  readonly layer: MapLayerId;
  readonly pullRequest: number | null;
  readonly onLayer: (layer: MapLayerId) => void;
  readonly t: OperatorTranslate;
}) {
  return <div className="architecture-layers" role="group" aria-labelledby="architecture-layers-label">
    {MAP_LAYERS.map(item => {
      const count = layerCount(map, item, pullRequest, t);
      return <button key={item} type="button" aria-pressed={layer === item} data-layer={item}
        data-state={layerAvailable(map, item) ? 'ok' : 'unavailable'} onClick={() => onLayer(item)}>
        {t(`architecture.layer.${item}`)}{count !== null && <span className="architecture-layers__count mono-value">{count}</span>}
      </button>;
    })}
  </div>;
}

/** The flow steps archctx ties to a change, or its reason codes when it cannot, on the sequence map that draws them; and the parts it cut at its limits. */
function ImpactNotes({ part, impact, flowSteps, t }: { readonly part: string; readonly impact: ArchitectureImpactV1; readonly flowSteps: boolean; readonly t: OperatorTranslate }) {
  const { flow_steps: steps } = impact;
  const truncated = truncatedParts(impact.truncated);
  return <>
    {flowSteps && (steps.status === 'known'
      ? <p data-flow-steps={part}>{t('architecture.layer.flow_steps.known', { count: steps.items!.length })}</p>
      : <Gap part={`${part}.flow_steps`} reason={steps.reason_codes.join(' ')}>{t('architecture.layer.flow_steps.unknown', { reasons: steps.reason_codes.join(', ') })}</Gap>)}
    {flowSteps && steps.items !== null && steps.items.length > 0 && <ul data-flow-step-list={part}>
      {steps.items.map(item => <li key={`${item.flow}:${item.outcome ?? ''}:${item.step}`}><code>{item.flow}</code> · {item.step}{item.reason_codes.length > 0 && ` · ${item.reason_codes.join(', ')}`}</li>)}
    </ul>}
    {truncated.length > 0 && <Note part={`${part}.truncated`} reason={truncated.join(' ')}>{[
      t('architecture.layer.truncated', { parts: truncated.map(item => t(`architecture.layer.truncated.part.${item}`)).join(', ') }),
      ...(truncated.includes('paths') ? [t('architecture.layer.truncated.paths')] : []),
    ].join(' ')}</Note>}
  </>;
}

/** What the active layer covers, or why it has no data. Every number is a count from the collector. */
function LayerSummary({ map, view, layer, pullRequest, onPullRequest, t }: {
  readonly map: ArchitectureMapV1;
  readonly view: ArchitectureBaseMap;
  readonly layer: MapLayerId;
  readonly pullRequest: number | null;
  readonly onPullRequest: (number: number) => void;
  readonly t: OperatorTranslate;
}) {
  const { changes, violations, pull_requests: pullRequests, tests, decisions } = map.layers;
  if (layer === 'changes') {
    if (changes.state === 'unavailable') {
      return changes.reason === 'archctx_error'
        ? <Gap part="changes" reason={changes.reason} code={archctxCode(changes)}>{t('architecture.layer.changes.archctx_error', { code: archctxCode(changes) })}</Gap>
        : <Gap part="changes" reason={changes.reason}>{t(`architecture.layer.changes.${changes.reason}`)}</Gap>;
    }
    const count = (kind: 'nodes' | 'relations' | 'flows', change: 'added' | 'removed' | 'changed') => changes.model.filter(item => item.kind === kind && item.change === change).length;
    return <div className="architecture-layer-summary" data-layer-summary="changes">
      <p>{t('architecture.layer.changes.summary', {
        commits: counted(t, changes.commits.length, 'commit'),
        files: counted(t, changes.paths.length, 'file', changes.truncated.paths),
        unowned: `${changes.truncated.paths ? '≥' : ''}${changes.unowned_paths.length}`,
      })}{' '}
        <time dateTime={changes.since}>{new Date(changes.since).toLocaleString()}</time> · <code>{changes.base.slice(0, 12)}</code></p>
      <p>{t('architecture.layer.changes.model', {
        nodesAdded: count('nodes', 'added'), nodesRemoved: count('nodes', 'removed'), nodesChanged: count('nodes', 'changed'),
        relationsAdded: count('relations', 'added'), relationsRemoved: count('relations', 'removed'), relationsChanged: count('relations', 'changed'),
        flowsAdded: count('flows', 'added'), flowsRemoved: count('flows', 'removed'), flowsChanged: count('flows', 'changed'),
      })}</p>
      <ImpactNotes part="changes" impact={changes} flowSteps={view === 'sequence'} t={t} />
    </div>;
  }
  if (layer === 'violations') {
    const { debt, flows, anchors, dependencies, layer_direction: layerDirection } = violations;
    type Part = 'debt' | 'flows' | 'anchors' | 'dependencies' | 'layer_direction';
    const text = (part: Part, reason: string) => t('architecture.layer.violations.gap', { part: t(`architecture.layer.violations.${part}.label`), reason });
    const gap = (part: Part, missing: { readonly reason: ArchitectureLayerDirectionReason } | ArchctxRefusalV1) => missing.reason === 'archctx_error'
      ? <Gap part={`violations.${part}`} reason={missing.reason} code={archctxCode(missing)}>{text(part, t('architecture.layer.reason.archctx_error', { code: archctxCode(missing) }))}</Gap>
      : <Gap part={`violations.${part}`} reason={missing.reason}>{text(part, t(`architecture.layer.reason.${missing.reason}`))}</Gap>;
    // No ordered layers or no layer-direction constraint is the model's setup, not a failed read.
    const direction = layerDirection.state === 'ok'
      ? <p>{t('architecture.layer.violations.layer_direction', {
        count: layerDirection.edges.length, imports: layerDirection.edges.reduce((sum, edge) => sum + edge.imports, 0), checked: layerDirection.imports,
      })}</p>
      : layerDirection.reason === 'model_layers_undeclared' || layerDirection.reason === 'layer_direction_undeclared'
        ? <Note part="violations.layer_direction" reason={layerDirection.reason}>{text('layer_direction', t(`architecture.layer.reason.${layerDirection.reason}`))}</Note>
        : gap('layer_direction', layerDirection);
    const unowned = debt.state === 'ok' ? debt.items.filter(item => item.nodes.length === 0) : [];
    return <div className="architecture-layer-summary" data-layer-summary="violations">
      {debt.state === 'ok' ? <p>{t('architecture.layer.violations.debt', { count: debt.items.length })}</p> : gap('debt', debt)}
      {unowned.length > 0 && <details><summary>{t('architecture.layer.unowned', { count: unowned.length })}</summary>
        <ul>{unowned.flatMap(item => item.paths.map(path => <li key={`${item.kind}:${path}`}><code>{path}</code> · {t(`architecture.layer.debt.${item.kind}`)}</li>))}</ul>
      </details>}
      {flows.state === 'ok'
        ? <p>{t('architecture.layer.violations.flows', { proven: flows.proven, selectors: flows.selectors, unprovable: flows.unprovable.length })}</p>
        : gap('flows', flows)}
      {anchors.state === 'ok' ? <p>{t('architecture.layer.violations.anchors', { findings: anchors.nodes.reduce((sum, item) => sum + item.findings.length, 0), citations: anchors.citations })}</p> : gap('anchors', anchors)}
      {dependencies.state === 'ok' ? <p>{t('architecture.layer.violations.dependencies', { count: dependencies.edges.length })}</p> : gap('dependencies', dependencies)}
      {direction}
    </div>;
  }
  if (layer === 'tests') {
    if (tests.state === 'unavailable') return <Gap part="tests" reason={tests.reason}>{t(`architecture.layer.tests.${tests.reason}`)}</Gap>;
    const capabilities = map.nodes.filter(node => node.kind === 'capability').length;
    return <div className="architecture-layer-summary" data-layer-summary="tests">
      <p>{t('architecture.layer.tests.summary', {
        run: tests.run.id, failed: tests.capabilities.filter(item => item.failed > 0).length, covered: tests.capabilities.length, capabilities,
      })}{' '}<time dateTime={tests.run.created_at}>{new Date(tests.run.created_at).toLocaleString()}</time> · <code>{tests.run.head_sha.slice(0, 12)}</code></p>
      {tests.results !== 'ok' && <Gap part="results" reason={tests.results}>{t(`architecture.layer.tests.results.${tests.results}`)}</Gap>}
    </div>;
  }
  if (layer === 'pull_requests') {
    if (pullRequests.state === 'unavailable') return <Gap part="pull_requests" reason={pullRequests.reason}>{t(`architecture.layer.pull_requests.${pullRequests.reason}`)}</Gap>;
    const chosen = pullRequests.pull_requests.find(item => item.number === pullRequest) ?? null;
    return <div className="architecture-layer-summary" data-layer-summary="pull_requests">
      <p>{t('architecture.layer.pull_requests.summary', { count: pullRequests.pull_requests.length })}{' '}
        <time dateTime={pullRequests.observed_at}>{new Date(pullRequests.observed_at).toLocaleString()}</time></p>
      {pullRequests.pull_requests.length > 0 && <label className="architecture-layer-summary__pick">
        <span>{t('architecture.layer.pull_requests.pick')}</span>
        <select value={chosen?.number ?? ''} onChange={event => onPullRequest(Number(event.target.value))}>
          {chosen === null && <option value="" disabled>{t('architecture.layer.pull_requests.none')}</option>}
          {pullRequests.pull_requests.map(item => <option key={item.number} value={item.number}>#{item.number} {item.title}</option>)}
        </select>
      </label>}
      {chosen && <p data-pull-request={chosen.number}>
        <a href={chosen.url} target="_blank" rel="noreferrer">#{chosen.number}</a>
        {chosen.head_sha !== null && <> · <code>{chosen.head_sha.slice(0, 12)}</code></>}
        {chosen.impact.state === 'ok' && <> · {t('architecture.layer.pull_requests.impact', {
          files: counted(t, chosen.impact.paths.length, 'file', chosen.impact.truncated.paths),
          nodes: counted(t, chosen.impact.nodes.length, 'node', chosen.impact.truncated.nodes),
          unowned: `${chosen.impact.truncated.paths ? '≥' : ''}${chosen.impact.unowned_paths.length}`,
        })}</>}
      </p>}
      {chosen?.impact.state === 'ok' && <ImpactNotes part="pull_request" impact={chosen.impact} flowSteps={view === 'sequence'} t={t} />}
      {chosen?.impact.state === 'unavailable' && (chosen.impact.reason === 'archctx_error'
        ? <Gap part="pull_request" reason={chosen.impact.reason} code={archctxCode(chosen.impact)}>{t('architecture.layer.pull_requests.pr.archctx_error', { code: archctxCode(chosen.impact) })}</Gap>
        : <Gap part="pull_request" reason={chosen.impact.reason}>{t(`architecture.layer.pull_requests.pr.${chosen.impact.reason}`)}</Gap>)}
    </div>;
  }
  const unapplied = decisions.items.filter(item => item.applies_to.length === 0);
  return <div className="architecture-layer-summary" data-layer-summary="decisions">
    <p>{t('architecture.layer.decisions.summary', { count: counted(t, decisions.items.length, 'decision'), applied: decisions.items.length - unapplied.length })}</p>
    {unapplied.length > 0 && <details><summary>{t('architecture.layer.decisions.unapplied', { count: unapplied.length })}</summary>
      <ul>{unapplied.map(item => <li key={item.id}>{item.title} · <code>{item.path}</code></li>)}</ul>
    </details>}
  </div>;
}

/** Why the map is missing and the next step; a pending map is a status, not a failure. archctx's codes stay visible. */
function MapUnavailable({ read, kept, t }: {
  readonly read: Exclude<ArchitectureMapRead, { readonly state: 'ok' }>;
  readonly kept: boolean;
  readonly t: OperatorTranslate;
}) {
  const code = read.reason === 'archctx_error' ? archctxCode(read) : undefined;
  const pending = read.reason === 'architecture_map_pending';
  return <p className={pending ? undefined : 'architecture-notice'} role={pending ? 'status' : 'alert'} data-error-code={read.reason} data-code={code}>
    {kept && <span className="block">{t('architecture.map.kept')}</span>}
    <span className="block">{t(`architecture.map.unavailable.${read.reason}`, code === undefined ? undefined : { code })}</span>
    <span className="block">{t(`architecture.map.unavailable.${read.reason}.next`)}</span>
  </p>;
}

/** The base maps that read the map route: modules (capabilities in domain groups), sequence and topology. */
export type ArchitectureBaseMap = 'modules' | 'sequence' | 'topology';

/**
 * What the page shows about the map outside the map view: the header row's commit, collection time,
 * branch (`headRef`, null for a detached HEAD) and archctx version, and the tab counts.
 */
export interface ArchitectureMapSummary {
  readonly commit: string;
  readonly collectedAt: string;
  readonly headRef: string | null;
  readonly archctxVersion: string;
  readonly modules: number;
  readonly flows: number;
}

/** The map-wide gaps. No base map draws the layer order, so its gap is not one. */
function MapGaps({ map, t }: { readonly map: ArchitectureMapV1; readonly t: OperatorTranslate }) {
  return <>
    {map.sizes.state === 'unavailable' && <p className="architecture-map__gap" data-gap="sizes" data-reason={map.sizes.reason}>{t(`architecture.map.sizes.${map.sizes.reason}`)}</p>}
    {map.dependencies.state === 'unavailable' && <p className="architecture-map__gap" data-gap="dependencies" data-reason={map.dependencies.reason}>{t(`architecture.map.dependencies.${map.dependencies.reason}`)}</p>}
  </>;
}

/**
 * The committed model on one base map, with line and import counts from the map collector.
 * The read, the active layer, the chosen PR and the chosen flow stay when the base map changes.
 */
export function ArchitectureMap({ repositoryId, view = 'modules', read = fetchArchitectureMap, refreshGeneration, onModule, onSummary, t }: {
  readonly repositoryId: string;
  readonly view?: ArchitectureBaseMap;
  readonly read?: ArchitectureMapReader;
  readonly refreshGeneration: number;
  readonly onModule: (id: string) => void;
  /** Receives the summary of the map on screen: `null` while no map shows and when the view closes. A failed refresh keeps the shown map, so it keeps the summary. */
  readonly onSummary: (summary: ArchitectureMapSummary | null) => void;
  readonly t: OperatorTranslate;
}) {
  const result = useArchitectureMap(read, repositoryId, refreshGeneration);
  // PRD 2-ARCH-P1: the map opens on today's changes.
  const [layer, setLayer] = useState<MapLayerId>('changes');
  const [picked, setPicked] = useState<number | null>(null);
  const [flow, setFlow] = useState<string | null>(null);
  // The last good map stays on screen through a failed refresh; a new repository starts empty.
  const shown = useRef<{ repositoryId: string; map: ArchitectureMapV1 } | null>(null);
  if (result?.state === 'ok') shown.current = { repositoryId, map: result.map };
  const map = shown.current?.repositoryId === repositoryId ? shown.current.map : null;
  // A picked PR that a refresh no longer lists falls back to the first PR with impact data.
  const listed = map !== null && map.layers.pull_requests.state === 'ok' && map.layers.pull_requests.pull_requests.some(item => item.number === picked);
  const pullRequest = map === null ? null : listed ? picked : firstImpactPullRequest(map);
  useEffect(() => {
    onSummary(map === null ? null : {
      commit: map.commit, collectedAt: map.collected_at, headRef: map.head_ref, archctxVersion: map.archctx_version,
      modules: map.nodes.filter(node => node.kind === 'capability').length, flows: map.flows.length,
    });
  }, [map, onSummary]);
  useEffect(() => () => onSummary(null), [onSummary]);
  // The active layer's summary and the gaps of this view go to the side panel, so the canvas starts below the lens row.
  const side = map && <div className="architecture-map__side" data-map-side>
    <MapGaps map={map} t={t} />
    <LayerSummary map={map} view={view} layer={layer} pullRequest={pullRequest} onPullRequest={setPicked} t={t} />
  </div>;
  return <div className="architecture-map-view">
    {result === null && <p role="status">{t('architecture.map.loading')}</p>}
    {result?.state === 'unavailable' && <MapUnavailable read={result} kept={map !== null} t={t} />}
    {map && <>
      <div className="architecture-lens">
        <span id="architecture-layers-label" className="architecture-lens__label">{t('architecture.layers')}</span>
        <LayerBar map={map} layer={layer} pullRequest={pullRequest} onLayer={setLayer} t={t} />
        {view === 'sequence' ? <SequenceLensTools map={map} layer={layer} pullRequest={pullRequest} flowId={flow} t={t} />
          : <span className="architecture-lens__hint">{t('architecture.lens.hint')}</span>}
      </div>
      {view === 'modules' && <ArchitectureModules key={`${repositoryId}:${map.commit}`} map={map} layer={layer} pullRequest={pullRequest} side={side} onModule={onModule} t={t} />}
      {view === 'sequence' && <ArchitectureSequence key={`${repositoryId}:${map.commit}`} map={map} layer={layer} pullRequest={pullRequest} flowId={flow} onFlow={setFlow} side={side} onModule={onModule} t={t} />}
      {view === 'topology' && <ArchitectureTopology key={`${repositoryId}:${map.commit}`} map={map} layer={layer} pullRequest={pullRequest} side={side} onModule={onModule} t={t} />}
    </>}
  </div>;
}
