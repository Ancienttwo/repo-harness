import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import {
  decodeArchitectureMap,
  type ArchctxRefusalV1,
  type ArchitectureImpactV1,
  type ArchitectureLayerDirectionReason,
  type ArchitectureMapUnavailableReason,
  type ArchitectureMapV1,
} from '../core/operator/architecture-map';
import {
  archctxCode,
  firstImpactPullRequest,
  MAP_LAYERS,
  mapLayerView,
  truncatedParts,
  type MapLayerId,
  type MapLayerView,
  type MapMark,
} from './architecture-map-layers';
import { counted, Gap, Mark, NodeDetails, Note, ZoomControls } from './architecture-map-parts';
import { layoutArchitectureMap, type MapLayout, type MapLayoutNode } from './architecture-map-layout';
import { ArchitectureSequence } from './ArchitectureSequence';
import { ArchitectureTopology } from './ArchitectureTopology';
import { asApiError } from './fleet-api';
import type { OperatorTranslate } from './i18n';
import { useObservationRefresh } from './useObservationRefresh';

export type ArchitectureMapReason = ArchitectureMapUnavailableReason | 'unreachable';
export type ArchitectureMapRead =
  | { readonly state: 'ok'; readonly map: ArchitectureMapV1 }
  | { readonly state: 'unavailable'; readonly reason: ArchitectureMapReason };
export type ArchitectureMapReader = (repositoryId: string, signal: AbortSignal) => Promise<ArchitectureMapRead>;

// Every refusal the map route sends; the record keeps this list complete against the route's reason type.
const MAP_REASONS: Readonly<Record<ArchitectureMapUnavailableReason, true>> = {
  architecture_map_pending: true, registry_unavailable: true, repository_not_found: true, model_unavailable: true, architecture_map_invalid: true,
};

export async function fetchArchitectureMap(repositoryId: string, signal: AbortSignal): Promise<ArchitectureMapRead> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/repositories/${encodeURIComponent(repositoryId)}/architecture/map`, { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal.aborted) throw error;
    return { state: 'unavailable', reason: 'unreachable' };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const { code } = asApiError(body);
    return { state: 'unavailable', reason: Object.hasOwn(MAP_REASONS, code) ? code as ArchitectureMapReason : 'unreachable' };
  }
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

interface MapNodeData extends Record<string, unknown> {
  readonly item: MapLayoutNode;
  readonly mark: MapMark | null;
  /** The active layer has data and nothing in this node's subtree. */
  readonly quiet: boolean;
  readonly t: OperatorTranslate;
}
type MapNode = Node<MapNodeData, 'box' | 'group'>;

function Size({ item, t }: { readonly item: MapLayoutNode; readonly t: OperatorTranslate }) {
  return item.size === null ? null : <span className="architecture-map__lines">{t('architecture.map.lines', { lines: item.size.lines })}</span>;
}

/** Handles exist for edge routing only; the map is read-only, so they accept no connection. */
function Handles() {
  return <>
    <Handle type="target" position={Position.Top} isConnectable={false} />
    <Handle type="source" position={Position.Bottom} isConnectable={false} />
  </>;
}

const BoxNode = memo(function BoxNode({ data, selected }: NodeProps<MapNode>) {
  const { item, mark, quiet, t } = data;
  return <div className="architecture-map__box" data-kind={item.node.kind} data-selected={selected || undefined} data-tone={mark?.tone} data-quiet={quiet || undefined}>
    <Handles />
    <span className="architecture-map__title"><strong>{item.node.name}</strong><Mark mark={mark} /></span>
    <span className="architecture-map__meta">{item.node.kind}{item.node.layer ? ` · ${item.node.layer}` : ''} <Size item={item} t={t} /></span>
  </div>;
});

const GroupNode = memo(function GroupNode({ data, selected }: NodeProps<MapNode>) {
  const { item, mark, quiet, t } = data;
  return <div className="architecture-map__group" data-kind={item.node.kind} data-selected={selected || undefined} data-tone={mark?.tone} data-quiet={quiet || undefined}>
    <Handles />
    <div className="architecture-map__group-title">
      <span className="architecture-map__title"><strong>{item.node.name}</strong><Mark mark={mark} /></span>
      <span className="architecture-map__meta">{item.node.layer ?? ''} <Size item={item} t={t} /></span>
    </div>
  </div>;
});

const NODE_TYPES = { box: BoxNode, group: GroupNode };

/**
 * Zoom of the first view of a banded map: a 13 px title shows at 11 px. The whole map of a
 * real model is several canvases wide, so the first view starts at the top band's leftmost
 * node and its label; Fit shows the whole map.
 */
const MAP_READABLE_ZOOM = 0.85;

/** Height of a layer label. It sits in the empty rank that the layout leaves above each band, so it covers no node. */
const MAP_BAND_LABEL = 28;

/** A labelled rule above each layer's rows, in canvas coordinates. */
function LayerBands({ layout, t }: { readonly layout: MapLayout; readonly t: OperatorTranslate }) {
  return <ViewportPortal>
    {layout.bands.map(band => <div key={band.layer ?? ''} className="architecture-map__band" data-band={band.layer ?? ''}
      style={{ transform: `translate(${band.x}px, ${band.y - MAP_BAND_LABEL - 8}px)`, width: layout.width - band.x, height: MAP_BAND_LABEL }}>
      {band.layer ?? t('architecture.map.unlayered')}
    </div>)}
  </ViewportPortal>;
}

function Legend({ map, view, t }: { readonly map: ArchitectureMapV1; readonly view: MapLayerView; readonly t: OperatorTranslate }) {
  return <dl className="architecture-map__legend" aria-label={t('architecture.map.legend')}>
    <div><dt><span className="architecture-map__swatch" /></dt><dd>{t('architecture.map.legend.code')}</dd></div>
    <div><dt><span className="architecture-map__swatch architecture-map__swatch--dashed" /></dt><dd>{t('architecture.map.legend.runtime')}</dd></div>
    <div><dt><span className="architecture-map__swatch architecture-map__swatch--external" /></dt><dd>{t('architecture.map.legend.external')}</dd></div>
    {map.sizes.state === 'ok' && <div><dt aria-hidden="true">↔</dt><dd>{t('architecture.map.legend.width')}</dd></div>}
    {map.dependencies.state === 'ok' && <div><dt className="mono-value" aria-hidden="true">12</dt><dd>{t('architecture.map.legend.imports')}</dd></div>}
    {view.edges.length > 0 && <div><dt><span className="architecture-map__swatch architecture-map__swatch--undeclared" /></dt><dd>{t('architecture.layer.legend.undeclared')}</dd></div>}
  </dl>;
}

function Inspector({ map, layer, pullRequest, selected, onModule, t }: {
  readonly map: ArchitectureMapV1;
  readonly layer: MapLayerId;
  readonly pullRequest: number | null;
  readonly selected: MapLayoutNode | null;
  readonly onModule: (id: string) => void;
  readonly t: OperatorTranslate;
}) {
  if (selected === null) {
    return <aside className="architecture-map__inspector" aria-label={t('architecture.map.inspector')}>
      <p className="detail-quiet">{t('architecture.map.pick')}</p>
      <p className="detail-quiet">{t('architecture.map.counts', { nodes: counted(t, map.nodes.length, 'node'), relations: counted(t, map.relations.length, 'relation') })}</p>
    </aside>;
  }
  return <aside className="architecture-map__inspector" aria-label={t('architecture.map.inspector')} data-node-id={selected.node.id}>
    <NodeDetails map={map} layer={layer} pullRequest={pullRequest} nodeId={selected.node.id} onModule={onModule} t={t} />
  </aside>;
}

function MapCanvas({ map, layer, pullRequest, onModule, t }: {
  readonly map: ArchitectureMapV1;
  readonly layer: MapLayerId;
  readonly pullRequest: number | null;
  readonly onModule: (id: string) => void;
  readonly t: OperatorTranslate;
}) {
  const layout = useMemo(() => layoutArchitectureMap(map), [map]);
  const view = useMemo(() => mapLayerView(map, layer, pullRequest), [map, layer, pullRequest]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const items = useMemo(() => new Map(layout.nodes.map(item => [item.node.id, item])), [layout]);
  const firstView = useMemo(() => {
    const top = layout.bands[0];
    if (top === undefined) return undefined;
    return { x: -(top.x - 24) * MAP_READABLE_ZOOM, y: -(top.y - MAP_BAND_LABEL - 24) * MAP_READABLE_ZOOM, zoom: MAP_READABLE_ZOOM };
  }, [layout]);
  const selected = selectedId === null ? null : items.get(selectedId) ?? null;

  const nodes = useMemo<MapNode[]>(() => layout.nodes.map(item => {
    const parent = item.node.parent === null ? null : items.get(item.node.parent)!;
    return {
      id: item.node.id,
      type: item.group ? 'group' : 'box',
      position: { x: item.x - (parent?.x ?? 0), y: item.y - (parent?.y ?? 0) },
      width: item.width,
      height: item.height,
      ...(parent ? { parentId: parent.node.id } : {}),
      data: { item, mark: view.marks.get(item.node.id) ?? null, quiet: view.available && !view.lit.has(item.node.id), t },
      draggable: false,
      connectable: false,
      selected: item.node.id === selectedId,
      ariaLabel: `${item.node.kind} ${item.node.name}`,
    };
  }), [layout, items, view, selectedId, t]);

  const edges = useMemo<Edge[]>(() => [...layout.edges.map(edge => {
    const { relation } = edge;
    const touches = selectedId !== null && (relation.source === selectedId || relation.target === selectedId);
    return {
      id: relation.id,
      source: relation.source,
      target: relation.target,
      className: `architecture-map__edge${touches ? ' is-active' : selectedId !== null ? ' is-dim' : ''}`,
      style: { strokeWidth: edge.strokeWidth, ...(edge.dashed ? { strokeDasharray: '6 4' } : {}) },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: touches ? 'var(--rh-accent)' : 'var(--text-color-kumo-subtle)' },
      ...(edge.imports === null ? {} : { label: String(edge.imports) }),
      selectable: false,
      focusable: false,
      zIndex: touches ? 2 : 1,
    };
  }), ...view.edges.map((edge): Edge => ({
    // An undeclared import has no model relation, so it gets its own id and stays above the relations.
    id: `undeclared:${edge.source}->${edge.target}`,
    source: edge.source,
    target: edge.target,
    className: 'architecture-map__edge architecture-map__edge--undeclared',
    style: { strokeDasharray: '4 3' },
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: 'var(--text-color-kumo-danger)' },
    label: String(edge.imports),
    selectable: false,
    focusable: false,
    zIndex: 3,
  }))], [layout, view, selectedId]);

  // Selection is the only node change the read-only map applies; click and the keyboard both arrive here.
  const onNodesChange = useCallback((changes: NodeChange<MapNode>[]) => {
    const chosen = changes.find(change => change.type === 'select' && change.selected);
    if (chosen && 'id' in chosen) setSelectedId(chosen.id);
    else if (changes.some(change => change.type === 'select')) setSelectedId(null);
  }, []);

  return <div className="architecture-map" data-node-count={map.nodes.length} data-relation-count={map.relations.length} data-layer={layer}>
    <div className="architecture-map__canvas" aria-label={t('architecture.map.label')} role="region">
      <ReactFlow<MapNode, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        minZoom={0.05}
        maxZoom={2}
        fitView={firstView === undefined}
        {...(firstView === undefined ? {} : { defaultViewport: firstView })}
        attributionPosition="top-right"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="var(--rh-diagram-dot)" />
        <LayerBands layout={layout} t={t} />
        <Panel position="bottom-left"><Legend map={map} view={view} t={t} /></Panel>
        <Panel position="bottom-right"><ZoomControls t={t} /></Panel>
      </ReactFlow>
    </div>
    <Inspector map={map} layer={layer} pullRequest={pullRequest} selected={selected} onModule={onModule} t={t} />
  </div>;
}

/** A layer with no data shows as unavailable; it stays selectable so its reason can be read. */
function layerAvailable(map: ArchitectureMapV1, layer: MapLayerId): boolean {
  return layer === 'violations' ? Object.values(map.layers.violations).some(part => part.state === 'ok') : map.layers[layer].state === 'ok';
}

function LayerBar({ map, layer, onLayer, t }: {
  readonly map: ArchitectureMapV1;
  readonly layer: MapLayerId;
  readonly onLayer: (layer: MapLayerId) => void;
  readonly t: OperatorTranslate;
}) {
  return <div className="architecture-layers" role="group" aria-label={t('architecture.layers')}>
    {MAP_LAYERS.map(item => (
      <button key={item} type="button" aria-pressed={layer === item} data-layer={item}
        data-state={layerAvailable(map, item) ? 'ok' : 'unavailable'} onClick={() => onLayer(item)}>
        {t(`architecture.layer.${item}`)}
      </button>
    ))}
  </div>;
}

/** The flow steps archctx ties to a change, or its reason codes when it cannot; and the parts it cut at its limits. */
function ImpactNotes({ part, impact, t }: { readonly part: string; readonly impact: ArchitectureImpactV1; readonly t: OperatorTranslate }) {
  const { flow_steps: steps } = impact;
  const truncated = truncatedParts(impact.truncated);
  return <>
    {steps.status === 'known'
      ? <p data-flow-steps={part}>{t('architecture.layer.flow_steps.known', { count: steps.items!.length })}</p>
      : <Gap part={`${part}.flow_steps`} reason={steps.reason_codes.join(' ')}>{t('architecture.layer.flow_steps.unknown', { reasons: steps.reason_codes.join(', ') })}</Gap>}
    {steps.items !== null && steps.items.length > 0 && <ul data-flow-step-list={part}>
      {steps.items.map(item => <li key={`${item.flow}:${item.outcome ?? ''}:${item.step}`}><code>{item.flow}</code> · {item.step}{item.reason_codes.length > 0 && ` · ${item.reason_codes.join(', ')}`}</li>)}
    </ul>}
    {truncated.length > 0 && <Note part={`${part}.truncated`} reason={truncated.join(' ')}>{[
      t('architecture.layer.truncated', { parts: truncated.map(item => t(`architecture.layer.truncated.part.${item}`)).join(', ') }),
      ...(truncated.includes('paths') ? [t('architecture.layer.truncated.paths')] : []),
    ].join(' ')}</Note>}
  </>;
}

/** What the active layer covers, or why it has no data. Every number is a count from the collector. */
function LayerSummary({ map, layer, pullRequest, onPullRequest, t }: {
  readonly map: ArchitectureMapV1;
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
        commits: counted(t, changes.commits, 'commit'),
        files: counted(t, changes.paths.length, 'file', changes.truncated.paths),
        unowned: `${changes.truncated.paths ? '≥' : ''}${changes.unowned_paths.length}`,
      })}{' '}
        <time dateTime={changes.since}>{new Date(changes.since).toLocaleString()}</time> · <code>{changes.base.slice(0, 12)}</code></p>
      <p>{t('architecture.layer.changes.model', {
        nodesAdded: count('nodes', 'added'), nodesRemoved: count('nodes', 'removed'), nodesChanged: count('nodes', 'changed'),
        relationsAdded: count('relations', 'added'), relationsRemoved: count('relations', 'removed'), relationsChanged: count('relations', 'changed'),
        flowsAdded: count('flows', 'added'), flowsRemoved: count('flows', 'removed'), flowsChanged: count('flows', 'changed'),
      })}</p>
      <ImpactNotes part="changes" impact={changes} t={t} />
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
      {anchors.state === 'ok' ? <p>{t('architecture.layer.violations.anchors', { findings: anchors.nodes.reduce((sum, item) => sum + item.findings, 0), citations: anchors.citations })}</p> : gap('anchors', anchors)}
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
      {chosen?.impact.state === 'ok' && <ImpactNotes part="pull_request" impact={chosen.impact} t={t} />}
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

/** The base maps that read the map route: modules (layered by the model's layer order), sequence and topology. */
export type ArchitectureBaseMap = 'modules' | 'sequence' | 'topology';

/**
 * The committed model on one base map, with line and import counts from the map collector.
 * The read, the active layer and the chosen PR stay when the base map changes.
 */
export function ArchitectureMap({ repositoryId, view = 'modules', read = fetchArchitectureMap, refreshGeneration, onModule, t }: {
  readonly repositoryId: string;
  readonly view?: ArchitectureBaseMap;
  readonly read?: ArchitectureMapReader;
  readonly refreshGeneration: number;
  readonly onModule: (id: string) => void;
  readonly t: OperatorTranslate;
}) {
  const result = useArchitectureMap(read, repositoryId, refreshGeneration);
  // PRD 2-ARCH-P1: the map opens on today's changes.
  const [layer, setLayer] = useState<MapLayerId>('changes');
  const [picked, setPicked] = useState<number | null>(null);
  // The last good map stays on screen through a failed refresh; a new repository starts empty.
  const shown = useRef<{ repositoryId: string; map: ArchitectureMapV1 } | null>(null);
  if (result?.state === 'ok') shown.current = { repositoryId, map: result.map };
  const map = shown.current?.repositoryId === repositoryId ? shown.current.map : null;
  // A picked PR that a refresh no longer lists falls back to the first PR with impact data.
  const listed = map !== null && map.layers.pull_requests.state === 'ok' && map.layers.pull_requests.pull_requests.some(item => item.number === picked);
  const pullRequest = map === null ? null : listed ? picked : firstImpactPullRequest(map);
  return <div className="architecture-map-view">
    {result === null && <p role="status">{t('architecture.map.loading')}</p>}
    {result?.state === 'unavailable' && <p className="architecture-notice" role="alert" data-error-code={result.reason}>
      {t(map === null ? 'architecture.failed' : 'architecture.refreshFailed', { code: result.reason })}
    </p>}
    {map && <>
      <p className="detail-quiet architecture-map__source">
        {t('architecture.commit')} <code>{map.commit}</code> · {t('architecture.map.collected')} <time dateTime={map.collected_at}>{map.collected_at}</time>
      </p>
      {map.sizes.state === 'unavailable' && <p className="architecture-map__gap" data-gap="sizes" data-reason={map.sizes.reason}>{t(`architecture.map.sizes.${map.sizes.reason}`)}</p>}
      {map.dependencies.state === 'unavailable' && <p className="architecture-map__gap" data-gap="dependencies" data-reason={map.dependencies.reason}>{t(`architecture.map.dependencies.${map.dependencies.reason}`)}</p>}
      {map.layer_order.state === 'unavailable' && <p className="architecture-map__gap" data-gap="layer_order" data-reason={map.layer_order.reason}>{t(`architecture.map.layer_order.${map.layer_order.reason}`)}</p>}
      <LayerBar map={map} layer={layer} onLayer={setLayer} t={t} />
      <LayerSummary map={map} layer={layer} pullRequest={pullRequest} onPullRequest={setPicked} t={t} />
      {view === 'modules' && <ReactFlowProvider><MapCanvas key={`${repositoryId}:${map.commit}`} map={map} layer={layer} pullRequest={pullRequest} onModule={onModule} t={t} /></ReactFlowProvider>}
      {view === 'sequence' && <ArchitectureSequence key={`${repositoryId}:${map.commit}`} map={map} layer={layer} pullRequest={pullRequest} onModule={onModule} t={t} />}
      {view === 'topology' && <ArchitectureTopology key={`${repositoryId}:${map.commit}`} map={map} layer={layer} pullRequest={pullRequest} onModule={onModule} t={t} />}
    </>}
  </div>;
}
