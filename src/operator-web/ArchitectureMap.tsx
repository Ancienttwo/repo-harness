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
  useReactFlow,
  useViewport,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import {
  decodeArchitectureMap,
  type ArchitectureMapUnavailableReason,
  type ArchitectureMapV1,
  type ArchitectureViolationReason,
} from '../core/operator/architecture-map';
import { MAP_LAYERS, mapLayerView, type MapLayerId, type MapLayerView, type MapMark } from './architecture-map-layers';
import { layoutArchitectureMap, type MapLayoutNode } from './architecture-map-layout';
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

function Mark({ mark }: { readonly mark: MapMark | null }) {
  return mark === null ? null : <span className="architecture-map__mark mono-value" data-tone={mark.tone}>{mark.label}</span>;
}

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

function ZoomControls({ t }: { readonly t: OperatorTranslate }) {
  const flow = useReactFlow();
  const { zoom } = useViewport();
  return <div className="architecture-map__zoom" role="group" aria-label={t('architecture.map.zoom')}>
    <button type="button" aria-label={t('architecture.map.zoomOut')} onClick={() => { void flow.zoomOut(); }}>−</button>
    <button type="button" aria-label={t('architecture.map.zoomReset')} className="mono-value" onClick={() => { void flow.zoomTo(1); }}>{Math.round(zoom * 100)}%</button>
    <button type="button" aria-label={t('architecture.map.zoomIn')} onClick={() => { void flow.zoomIn(); }}>+</button>
    <button type="button" aria-label={t('architecture.map.fitLabel')} onClick={() => { void flow.fitView(); }}>{t('architecture.map.fit')}</button>
  </div>;
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

/** The active layer's facts for one node, straight from the collector. */
function LayerFacts({ map, layer, nodeId, names, t }: {
  readonly map: ArchitectureMapV1;
  readonly layer: MapLayerId;
  readonly nodeId: string;
  readonly names: ReadonlyMap<string, string>;
  readonly t: OperatorTranslate;
}) {
  const facts: { key: string; text: string; paths?: readonly string[] }[] = [];
  const { changes, violations, tests } = map.layers;
  if (layer === 'changes' && changes.state === 'ok') {
    const entry = changes.nodes.find(item => item.id === nodeId);
    if (entry) facts.push({ key: 'changes', text: t('architecture.layer.node.changes', { files: entry.files, added: entry.added, deleted: entry.deleted }) });
  }
  if (layer === 'violations') {
    if (violations.debt.state === 'ok') {
      violations.debt.items.filter(item => item.nodes.includes(nodeId)).forEach((item, index) => facts.push({ key: `debt-${index}`, text: t(`architecture.layer.debt.${item.kind}`), paths: item.paths }));
    }
    if (violations.flows.state === 'ok') {
      const unproven = violations.flows.unproven.find(item => item.id === nodeId);
      if (unproven) facts.push({ key: 'unproven', text: t('architecture.layer.node.unproven', { count: unproven.selectors }) });
      if (violations.flows.capabilities.includes(nodeId)) facts.push({ key: 'flow', text: t('architecture.layer.node.flowFails') });
    }
    if (violations.anchors.state === 'ok') {
      const anchors = violations.anchors.nodes.find(item => item.id === nodeId);
      if (anchors) facts.push({ key: 'anchors', text: t('architecture.layer.node.anchors', { count: anchors.findings }) });
    }
    if (violations.dependencies.state === 'ok') {
      for (const edge of violations.dependencies.edges.filter(item => item.source === nodeId)) {
        facts.push({ key: `undeclared-${edge.target}`, text: t('architecture.layer.node.undeclared', { name: names.get(edge.target) ?? edge.target, count: edge.imports }) });
      }
    }
  }
  if (layer === 'tests' && tests.state === 'ok') {
    const entry = tests.capabilities.find(item => item.id === nodeId);
    if (entry) facts.push({ key: 'tests', text: t('architecture.layer.node.tests', { files: entry.files, passed: entry.passed, failed: entry.failed, skipped: entry.skipped, noResult: entry.no_result }) });
  }
  return <>
    <h4>{t(`architecture.layer.${layer}`)}</h4>
    {facts.length ? <ul data-layer-facts={layer}>{facts.map(fact => <li key={fact.key}>
      {fact.text}
      {fact.paths && <ul>{fact.paths.map(path => <li key={path}><code>{path}</code></li>)}</ul>}
    </li>)}</ul> : <p className="detail-quiet">{t('architecture.layer.node.none')}</p>}
  </>;
}

function Inspector({ map, layer, selected, onModule, t }: {
  readonly map: ArchitectureMapV1;
  readonly layer: MapLayerId;
  readonly selected: MapLayoutNode | null;
  readonly onModule: (id: string) => void;
  readonly t: OperatorTranslate;
}) {
  const names = useMemo(() => new Map(map.nodes.map(node => [node.id, node.name])), [map]);
  if (selected === null) {
    return <aside className="architecture-map__inspector" aria-label={t('architecture.map.inspector')}>
      <p className="detail-quiet">{t('architecture.map.pick')}</p>
      <p className="detail-quiet">{t('architecture.map.counts', { nodes: map.nodes.length, relations: map.relations.length })}</p>
    </aside>;
  }
  const { node } = selected;
  const imports = map.dependencies.state === 'ok' ? map.dependencies.edges : [];
  const lines = (direction: 'out' | 'in') => map.relations
    .filter(relation => (direction === 'out' ? relation.source : relation.target) === node.id)
    .map(relation => {
      const other = direction === 'out' ? relation.target : relation.source;
      const count = imports.find(edge => edge.source === relation.source && edge.target === relation.target)?.imports;
      return <li key={relation.id} data-relation-id={relation.id}>
        <code>{relation.kind}</code> {names.get(other)}{count !== undefined && <span className="mono-value"> · {t('architecture.map.imports', { count })}</span>}
      </li>;
    });
  const outgoing = lines('out');
  const incoming = lines('in');
  return <aside className="architecture-map__inspector" aria-label={t('architecture.map.inspector')} data-node-id={node.id}>
    <h3>{node.name}</h3>
    <code className="architecture-map__id">{node.id}</code>
    <p>{node.summary}</p>
    <dl className="detail-list">
      <div><dt>{t('architecture.map.kind')}</dt><dd>{node.kind}</dd></div>
      <div><dt>{t('architecture.map.layer')}</dt><dd>{node.layer ?? t('architecture.none')}</dd></div>
      <div><dt>{t('architecture.map.status')}</dt><dd>{node.status}</dd></div>
      {map.sizes.state === 'ok' && <div><dt>{t('architecture.map.size')}</dt><dd>
        {selected.size === null ? t('architecture.map.noSize') : t('architecture.map.sizeValue', { lines: selected.size.lines, files: selected.size.files })}
      </dd></div>}
    </dl>
    {node.kind === 'capability' && <button type="button" className="operator-button operator-button--secondary" onClick={() => onModule(node.id)}>{t('architecture.map.open')}</button>}
    <LayerFacts map={map} layer={layer} nodeId={node.id} names={names} t={t} />
    <h4>{t('architecture.map.outgoing', { count: outgoing.length })}</h4>
    {outgoing.length ? <ul>{outgoing}</ul> : <p className="detail-quiet">{t('architecture.none')}</p>}
    <h4>{t('architecture.map.incoming', { count: incoming.length })}</h4>
    {incoming.length ? <ul>{incoming}</ul> : <p className="detail-quiet">{t('architecture.none')}</p>}
  </aside>;
}

function MapCanvas({ map, layer, onModule, t }: {
  readonly map: ArchitectureMapV1;
  readonly layer: MapLayerId;
  readonly onModule: (id: string) => void;
  readonly t: OperatorTranslate;
}) {
  const layout = useMemo(() => layoutArchitectureMap(map), [map]);
  const view = useMemo(() => mapLayerView(map, layer), [map, layer]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const items = useMemo(() => new Map(layout.nodes.map(item => [item.node.id, item])), [layout]);
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
        fitView
        attributionPosition="top-right"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="var(--rh-diagram-dot)" />
        <Panel position="bottom-left"><Legend map={map} view={view} t={t} /></Panel>
        <Panel position="bottom-right"><ZoomControls t={t} /></Panel>
      </ReactFlow>
    </div>
    <Inspector map={map} layer={layer} selected={selected} onModule={onModule} t={t} />
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

function Gap({ part, reason, children }: { readonly part: string; readonly reason: string; readonly children: string }) {
  return <p className="architecture-map__gap" data-gap={part} data-reason={reason}>{children}</p>;
}

/** What the active layer covers, or why it has no data. Every number is a count from the collector. */
function LayerSummary({ map, layer, t }: { readonly map: ArchitectureMapV1; readonly layer: MapLayerId; readonly t: OperatorTranslate }) {
  const { changes, violations, pull_requests: pullRequests, tests, decisions } = map.layers;
  if (layer === 'changes') {
    if (changes.state === 'unavailable') return <Gap part="changes" reason={changes.reason}>{t(`architecture.layer.changes.${changes.reason}`)}</Gap>;
    const { model } = changes;
    return <div className="architecture-layer-summary" data-layer-summary="changes">
      <p>{t('architecture.layer.changes.summary', { commits: changes.commits, files: changes.files, unowned: changes.unowned_files })}{' '}
        <time dateTime={changes.since}>{new Date(changes.since).toLocaleString()}</time> · <code>{changes.base.slice(0, 12)}</code></p>
      {model.state === 'ok'
        ? <p>{t('architecture.layer.changes.model', {
          nodesAdded: model.nodes_added.length, nodesRemoved: model.nodes_removed.length, nodesChanged: model.nodes_changed.length,
          relationsAdded: model.relations_added.length, relationsRemoved: model.relations_removed.length, relationsChanged: model.relations_changed.length,
        })}</p>
        : <Gap part="model" reason={model.reason}>{t(`architecture.layer.model.${model.reason}`)}</Gap>}
    </div>;
  }
  if (layer === 'violations') {
    const { debt, flows, anchors, dependencies } = violations;
    const gap = (part: keyof typeof violations, reason: ArchitectureViolationReason) =>
      <Gap key={part} part={`violations.${part}`} reason={reason}>{t('architecture.layer.violations.gap', { part: t(`architecture.layer.violations.${part}.label`), reason: t(`architecture.layer.reason.${reason}`) })}</Gap>;
    const unowned = debt.state === 'ok' ? debt.items.filter(item => item.nodes.length === 0) : [];
    return <div className="architecture-layer-summary" data-layer-summary="violations">
      {debt.state === 'ok' ? <p>{t('architecture.layer.violations.debt', { count: debt.items.length })}</p> : gap('debt', debt.reason)}
      {unowned.length > 0 && <details><summary>{t('architecture.layer.unowned', { count: unowned.length })}</summary>
        <ul>{unowned.flatMap(item => item.paths.map(path => <li key={`${item.kind}:${path}`}><code>{path}</code> · {t(`architecture.layer.debt.${item.kind}`)}</li>))}</ul>
      </details>}
      {flows.state === 'ok' ? <p>{t('architecture.layer.violations.flows', {
        unproven: flows.unproven.reduce((sum, item) => sum + item.selectors, 0), selectors: flows.selectors, capabilities: flows.capabilities.length,
      })}</p> : gap('flows', flows.reason)}
      {anchors.state === 'ok' ? <p>{t('architecture.layer.violations.anchors', { findings: anchors.nodes.reduce((sum, item) => sum + item.findings, 0), citations: anchors.citations })}</p> : gap('anchors', anchors.reason)}
      {dependencies.state === 'ok' ? <p>{t('architecture.layer.violations.dependencies', { count: dependencies.edges.length })}</p> : gap('dependencies', dependencies.reason)}
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
  return layer === 'pull_requests'
    ? <Gap part={layer} reason={pullRequests.reason}>{t(`architecture.layer.pull_requests.${pullRequests.reason}`)}</Gap>
    : <Gap part={layer} reason={decisions.reason}>{t(`architecture.layer.decisions.${decisions.reason}`)}</Gap>;
}

/** The whole committed model on one canvas, with line and import counts from the map collector. */
export function ArchitectureMap({ repositoryId, read = fetchArchitectureMap, refreshGeneration, onModule, t }: {
  readonly repositoryId: string;
  readonly read?: ArchitectureMapReader;
  readonly refreshGeneration: number;
  readonly onModule: (id: string) => void;
  readonly t: OperatorTranslate;
}) {
  const result = useArchitectureMap(read, repositoryId, refreshGeneration);
  // PRD 2-ARCH-P1: the map opens on today's changes.
  const [layer, setLayer] = useState<MapLayerId>('changes');
  // The last good map stays on screen through a failed refresh; a new repository starts empty.
  const shown = useRef<{ repositoryId: string; map: ArchitectureMapV1 } | null>(null);
  if (result?.state === 'ok') shown.current = { repositoryId, map: result.map };
  const map = shown.current?.repositoryId === repositoryId ? shown.current.map : null;
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
      <LayerBar map={map} layer={layer} onLayer={setLayer} t={t} />
      <LayerSummary map={map} layer={layer} t={t} />
      <ReactFlowProvider><MapCanvas key={`${repositoryId}:${map.commit}`} map={map} layer={layer} onModule={onModule} t={t} /></ReactFlowProvider>
    </>}
  </div>;
}
