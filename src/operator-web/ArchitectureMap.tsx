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
import { decodeArchitectureMap, type ArchitectureMapUnavailableReason, type ArchitectureMapV1 } from '../core/operator/architecture-map';
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
  const { item, t } = data;
  return <div className="architecture-map__box" data-kind={item.node.kind} data-selected={selected || undefined}>
    <Handles />
    <strong>{item.node.name}</strong>
    <span className="architecture-map__meta">{item.node.kind}{item.node.layer ? ` · ${item.node.layer}` : ''} <Size item={item} t={t} /></span>
  </div>;
});

const GroupNode = memo(function GroupNode({ data, selected }: NodeProps<MapNode>) {
  const { item, t } = data;
  return <div className="architecture-map__group" data-kind={item.node.kind} data-selected={selected || undefined}>
    <Handles />
    <div className="architecture-map__group-title">
      <strong>{item.node.name}</strong>
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

function Legend({ map, t }: { readonly map: ArchitectureMapV1; readonly t: OperatorTranslate }) {
  return <dl className="architecture-map__legend" aria-label={t('architecture.map.legend')}>
    <div><dt><span className="architecture-map__swatch" /></dt><dd>{t('architecture.map.legend.code')}</dd></div>
    <div><dt><span className="architecture-map__swatch architecture-map__swatch--dashed" /></dt><dd>{t('architecture.map.legend.runtime')}</dd></div>
    <div><dt><span className="architecture-map__swatch architecture-map__swatch--external" /></dt><dd>{t('architecture.map.legend.external')}</dd></div>
    {map.sizes.state === 'ok' && <div><dt aria-hidden="true">↔</dt><dd>{t('architecture.map.legend.width')}</dd></div>}
    {map.dependencies.state === 'ok' && <div><dt className="mono-value" aria-hidden="true">12</dt><dd>{t('architecture.map.legend.imports')}</dd></div>}
  </dl>;
}

function Inspector({ map, selected, onModule, t }: {
  readonly map: ArchitectureMapV1;
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
    <h4>{t('architecture.map.outgoing', { count: outgoing.length })}</h4>
    {outgoing.length ? <ul>{outgoing}</ul> : <p className="detail-quiet">{t('architecture.none')}</p>}
    <h4>{t('architecture.map.incoming', { count: incoming.length })}</h4>
    {incoming.length ? <ul>{incoming}</ul> : <p className="detail-quiet">{t('architecture.none')}</p>}
  </aside>;
}

function MapCanvas({ map, onModule, t }: { readonly map: ArchitectureMapV1; readonly onModule: (id: string) => void; readonly t: OperatorTranslate }) {
  const layout = useMemo(() => layoutArchitectureMap(map), [map]);
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
      data: { item, t },
      draggable: false,
      connectable: false,
      selected: item.node.id === selectedId,
      ariaLabel: `${item.node.kind} ${item.node.name}`,
    };
  }), [layout, items, selectedId, t]);

  const edges = useMemo<Edge[]>(() => layout.edges.map(edge => {
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
  }), [layout, selectedId]);

  // Selection is the only node change the read-only map applies; click and the keyboard both arrive here.
  const onNodesChange = useCallback((changes: NodeChange<MapNode>[]) => {
    const chosen = changes.find(change => change.type === 'select' && change.selected);
    if (chosen && 'id' in chosen) setSelectedId(chosen.id);
    else if (changes.some(change => change.type === 'select')) setSelectedId(null);
  }, []);

  return <div className="architecture-map" data-node-count={map.nodes.length} data-relation-count={map.relations.length}>
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
        <Panel position="bottom-left"><Legend map={map} t={t} /></Panel>
        <Panel position="bottom-right"><ZoomControls t={t} /></Panel>
      </ReactFlow>
    </div>
    <Inspector map={map} selected={selected} onModule={onModule} t={t} />
  </div>;
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
      <ReactFlowProvider><MapCanvas key={`${repositoryId}:${map.commit}`} map={map} onModule={onModule} t={t} /></ReactFlowProvider>
    </>}
  </div>;
}
