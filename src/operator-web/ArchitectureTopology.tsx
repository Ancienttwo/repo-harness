import { memo, useCallback, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import type { ArchitectureMapNodeV1, ArchitectureMapV1 } from '../core/operator/architecture-map';
import { mapLayerView, type MapLayerId, type MapMark } from './architecture-map-layers';
import { firstViewport, Mark, NodeDetails, Note, nodeSize, ZoomControls } from './architecture-map-parts';
import { runtimePlacement } from './architecture-runtime';
import { layoutTopology, TOPOLOGY_BOX_HEADER, TOPOLOGY_BOX_WIDTH, TOPOLOGY_MEMBER, type TopologyBox } from './architecture-topology-layout';
import type { OperatorTranslate } from './i18n';

interface BoxData extends Record<string, unknown> {
  readonly node: ArchitectureMapNodeV1;
  readonly mark: MapMark | null;
  readonly quiet: boolean;
  readonly detail: string | null;
}
type TopologyNode = Node<BoxData, 'box' | 'namespace' | 'member'>;

/** Handles exist for edge routing only; the map is read-only, so they accept no connection. */
function Handles() {
  return <>
    <Handle type="target" position={Position.Top} isConnectable={false} />
    <Handle type="source" position={Position.Bottom} isConnectable={false} />
  </>;
}

const BoxNode = memo(function BoxNode({ data, selected }: NodeProps<Node<BoxData, 'box'>>) {
  return <div className="architecture-map__group architecture-topology__box" data-kind={data.node.kind} data-selected={selected || undefined} data-tone={data.mark?.tone} data-quiet={data.quiet || undefined}>
    <Handles />
    <div className="architecture-map__group-title">
      <span className="architecture-map__title"><strong>{data.node.name}</strong><Mark mark={data.mark} /></span>
      <span className="architecture-map__meta">{data.detail ?? data.node.kind}</span>
    </div>
  </div>;
});

const NamespaceNode = memo(function NamespaceNode({ data, selected }: NodeProps<Node<BoxData, 'namespace'>>) {
  return <div className="architecture-map__group architecture-topology__namespace" data-kind="namespace" data-selected={selected || undefined} data-tone={data.mark?.tone} data-quiet={data.quiet || undefined}>
    <div className="architecture-map__group-title">
      <span className="architecture-map__title"><strong>{data.node.name}</strong><Mark mark={data.mark} /></span>
      <span className="architecture-map__meta">namespace</span>
    </div>
  </div>;
});

const MemberNode = memo(function MemberNode({ data, selected }: NodeProps<Node<BoxData, 'member'>>) {
  return <div className="architecture-map__box architecture-topology__member" data-kind={data.node.kind} data-selected={selected || undefined} data-tone={data.mark?.tone} data-quiet={data.quiet || undefined}>
    <span className="architecture-map__title"><strong>{data.node.name}</strong><Mark mark={data.mark} /></span>
  </div>;
});

const NODE_TYPES = { box: BoxNode, namespace: NamespaceNode, member: MemberNode };

function Legend({ t }: { readonly t: OperatorTranslate }) {
  return <dl className="architecture-map__legend" aria-label={t('architecture.map.legend')}>
    <div><dt><span className="architecture-map__swatch" /></dt><dd>{t('architecture.map.legend.code')}</dd></div>
    <div><dt><span className="architecture-map__swatch architecture-map__swatch--dashed" /></dt><dd>{t('architecture.topology.legend.runtime')}</dd></div>
    <div><dt><span className="architecture-map__swatch architecture-map__swatch--external" /></dt><dd>{t('architecture.map.legend.external')}</dd></div>
    <div><dt className="mono-value" aria-hidden="true">3</dt><dd>{t('architecture.topology.legend.count')}</dd></div>
  </dl>;
}

function TopologyCanvas({ map, layer, pullRequest, onModule, t }: {
  readonly map: ArchitectureMapV1;
  readonly layer: MapLayerId;
  readonly pullRequest: number | null;
  readonly onModule: (id: string) => void;
  readonly t: OperatorTranslate;
}) {
  const placement = useMemo(() => runtimePlacement(map), [map]);
  const layout = useMemo(() => layoutTopology(map, placement), [map, placement]);
  const view = useMemo(() => mapLayerView(map, layer, pullRequest), [map, layer, pullRequest]);
  const names = useMemo(() => new Map(map.nodes.map(node => [node.id, node.name])), [map]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const boxes = useMemo(() => new Map(layout.boxes.map(box => [box.node.id, box])), [layout]);
  // The first view opens on the first top-level runtime box; the external systems are a pan or a Fit away.
  const firstView = useMemo(() => {
    const anchor = layout.boxes.find(box => box.parent === null && box.node.kind !== 'external-system')!;
    return firstViewport(anchor.x, anchor.y);
  }, [layout]);
  // A box is lit when a node it shows, or a node that runs in it, holds a mark; a namespace is lit through what it holds.
  const lit = useMemo(() => {
    const result = new Set<string>();
    for (const id of view.lit) {
      const where = placement(id);
      let cursor: string | null = boxes.has(id) ? id : where.kind === 'process' ? where.process : null;
      for (; cursor !== null && !result.has(cursor); cursor = boxes.get(cursor)?.parent ?? null) result.add(cursor);
    }
    return result;
  }, [view, placement, boxes]);

  const nodes = useMemo<TopologyNode[]>(() => layout.boxes.flatMap((box: TopologyBox): TopologyNode[] => {
    const parent = box.parent === null ? null : boxes.get(box.parent)!;
    const own: TopologyNode = {
      id: box.node.id, type: box.group ? 'namespace' : 'box',
      position: { x: box.x - (parent?.x ?? 0), y: box.y - (parent?.y ?? 0) }, width: box.width, height: box.height,
      ...(parent ? { parentId: parent.node.id } : {}),
      data: { node: box.node, mark: view.marks.get(box.node.id) ?? null, quiet: view.available && !lit.has(box.node.id), detail: box.members.length > 0 ? t('architecture.topology.deployed', { count: box.members.length }) : null },
      draggable: false, connectable: false, selected: box.node.id === selectedId, ariaLabel: `${box.node.kind} ${box.node.name}`,
    };
    return [own, ...box.members.map((member, index): TopologyNode => ({
      id: member.id, type: 'member', parentId: box.node.id,
      position: { x: 12, y: TOPOLOGY_BOX_HEADER + index * TOPOLOGY_MEMBER }, width: TOPOLOGY_BOX_WIDTH - 24, height: TOPOLOGY_MEMBER - 4,
      data: { node: member, mark: view.marks.get(member.id) ?? null, quiet: view.available && !view.lit.has(member.id), detail: null },
      draggable: false, connectable: false, selected: member.id === selectedId, ariaLabel: `${member.kind} ${member.name}`,
    }))];
  }), [layout, boxes, view, lit, selectedId, t]);

  const edges = useMemo<Edge[]>(() => layout.edges.map(edge => {
    const touches = selectedId !== null && (edge.source === selectedId || edge.target === selectedId);
    return {
      id: edge.id, source: edge.source, target: edge.target,
      className: `architecture-map__edge${touches ? ' is-active' : selectedId !== null ? ' is-dim' : ''}`,
      style: edge.dashed ? { strokeDasharray: '6 4' } : {},
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: touches ? 'var(--rh-accent)' : 'var(--text-color-kumo-subtle)' },
      label: String(edge.relations.length), data: { kind: edge.kind },
      selectable: false, focusable: false, zIndex: touches ? 2 : 1,
    };
  }), [layout, selectedId]);

  // Selection is the only node change the read-only map applies; click and the keyboard both arrive here.
  const onNodesChange = useCallback((changes: NodeChange<TopologyNode>[]) => {
    const chosen = changes.find(change => change.type === 'select' && change.selected);
    if (chosen && 'id' in chosen) setSelectedId(chosen.id);
    else if (changes.some(change => change.type === 'select')) setSelectedId(null);
  }, []);

  const selectedBox = selectedId === null ? null : boxes.get(selectedId) ?? null;
  const where = selectedId === null || selectedBox !== null ? null : placement(selectedId);
  return <div className="architecture-map" data-view="topology" data-node-count={layout.boxes.length} data-edge-count={layout.edges.length} data-layer={layer}>
    <div className="architecture-map__canvas" aria-label={t('architecture.topology.label')} role="region">
      <ReactFlow<TopologyNode, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        minZoom={0.05}
        maxZoom={2}
        defaultViewport={firstView}
        attributionPosition="top-right"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="var(--rh-diagram-dot)" />
        <Panel position="bottom-left"><Legend t={t} /></Panel>
        <Panel position="bottom-right"><ZoomControls t={t} /></Panel>
      </ReactFlow>
    </div>
    <aside className="architecture-map__inspector" aria-label={t('architecture.map.inspector')} data-node-id={selectedId ?? undefined}>
      {selectedId === null ? <p className="detail-quiet">{t('architecture.map.pick')}</p>
        : <NodeDetails map={map} layer={layer} pullRequest={pullRequest} nodeId={selectedId} onModule={onModule} t={t}>
          {selectedBox !== null && selectedBox.parent !== null && <p data-runs-in={selectedBox.parent}>{t('architecture.topology.in', { name: names.get(selectedBox.parent) ?? selectedBox.parent })}</p>}
          {where?.kind === 'process' && <p data-runtime="process">{t('architecture.sequence.runsIn', { place: names.get(where.process) ?? where.process })}</p>}
          {selectedBox !== null && selectedBox.members.length > 0 && <>
            <h4>{t('architecture.topology.deployed', { count: selectedBox.members.length })}</h4>
            <ul data-deployed>{selectedBox.members.map(member => {
              const size = nodeSize(map, member.id);
              return <li key={member.id}>{member.name}{size && <span className="detail-quiet"> · {t('architecture.map.sizeValue', { lines: size.lines, files: size.files })}</span>}</li>;
            })}</ul>
          </>}
        </NodeDetails>}
    </aside>
  </div>;
}

/** The topology base map: namespaces, processes, mounts and external systems of the model. */
export function ArchitectureTopology({ map, layer, pullRequest, onModule, t }: {
  readonly map: ArchitectureMapV1;
  readonly layer: MapLayerId;
  readonly pullRequest: number | null;
  readonly onModule: (id: string) => void;
  readonly t: OperatorTranslate;
}) {
  const placement = useMemo(() => runtimePlacement(map), [map]);
  const layout = useMemo(() => layoutTopology(map, placement), [map, placement]);
  const view = useMemo(() => mapLayerView(map, layer, pullRequest), [map, layer, pullRequest]);
  if (!layout.boxes.some(box => box.node.kind !== 'external-system')) {
    return <Note part="topology.empty" reason="topology_undeclared">{t('architecture.topology.none')}</Note>;
  }
  const names = new Map(map.nodes.map(node => [node.id, node.name]));
  const relations = new Map(map.relations.map(relation => [relation.id, relation]));
  const drawn = new Set(layout.boxes.flatMap(box => [box.node.id, ...box.members.map(member => member.id)]));
  const hidden = [...view.marks.keys()].filter(id => !drawn.has(id) && placement(id).kind === 'unknown');
  return <div className="architecture-topology">
    {layer === 'violations' && <Note part="topology.violations" reason="imports_on_module_map">{t('architecture.sequence.note.imports_on_module_map')}</Note>}
    {hidden.length > 0 && <Note part="topology.unplaced_marks" reason="deployment_undeclared">{t('architecture.topology.hidden', { count: hidden.length })}</Note>}
    {layout.unplaced.length > 0 && <Note part="topology.unplaced" reason="deployment_undeclared">
      <details><summary>{t('architecture.topology.unplaced', { count: layout.unplaced.length })}</summary>
        <ul>{layout.unplaced.map(id => {
          const relation = relations.get(id)!;
          return <li key={id}><code>{relation.kind}</code> {names.get(relation.source)} → {names.get(relation.target)}</li>;
        })}</ul>
      </details>
    </Note>}
    {layout.stacked.length > 0 && <Note part="topology.mount_order" reason="mount_order_not_on_map">{t('architecture.topology.stacked', { names: layout.stacked.map(id => names.get(id) ?? id).join(', ') })}</Note>}
    <ReactFlowProvider><TopologyCanvas key={map.commit} map={map} layer={layer} pullRequest={pullRequest} onModule={onModule} t={t} /></ReactFlowProvider>
  </div>;
}
