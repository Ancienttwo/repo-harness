// The topology base map (the ArchTopology artboard) in three segments:
// processes, namespaces and mounts. The lens row holds the segment choice,
// the legacy switch and the SVG export. Every value is the model's; the
// layout module places the boxes.

import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
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
import {
  layoutTopology, processNamespace, TOPOLOGY_BASES, TOPOLOGY_BOX_HEADER, TOPOLOGY_KINDS, TOPOLOGY_MEMBER, topologySvg, withoutDeprecated,
  type MountTone, type TopologyBase, type TopologyBox, type TopologyLayout,
} from './architecture-topology-layout';
import type { OperatorTranslate } from './i18n';

interface BoxData extends Record<string, unknown> {
  readonly node: ArchitectureMapNodeV1;
  readonly mark: MapMark | null;
  readonly quiet: boolean;
  readonly detail: string;
  readonly tone: MountTone | null;
  readonly empty: string | null;
}
type TopologyNode = Node<BoxData, 'box' | 'namespace' | 'mount' | 'member'>;

/** Handles exist for edge routing only; the map is read-only, so they accept no connection. */
function Handles() {
  return <>
    <Handle type="target" position={Position.Top} isConnectable={false} />
    <Handle type="source" position={Position.Bottom} isConnectable={false} />
  </>;
}

const deprecated = (node: ArchitectureMapNodeV1) => node.status === 'deprecated' || undefined;

const BoxNode = memo(function BoxNode({ data, selected }: NodeProps<Node<BoxData, 'box'>>) {
  return <div className="architecture-map__group architecture-topology__box" data-kind={data.node.kind} data-selected={selected || undefined} data-tone={data.mark?.tone} data-quiet={data.quiet || undefined} data-deprecated={deprecated(data.node)}>
    <Handles />
    <div className="architecture-map__group-title">
      <span className="architecture-map__title"><strong>{data.node.name}</strong><Mark mark={data.mark} /></span>
      <span className="architecture-map__meta">{data.detail}</span>
    </div>
  </div>;
});

const NamespaceNode = memo(function NamespaceNode({ data, selected }: NodeProps<Node<BoxData, 'namespace'>>) {
  return <div className="architecture-map__group architecture-topology__namespace" data-kind="namespace" data-selected={selected || undefined} data-tone={data.mark?.tone} data-quiet={data.quiet || undefined} data-deprecated={deprecated(data.node)}>
    <Handles />
    <div className="architecture-map__group-title">
      <span className="architecture-map__title"><strong>{data.node.name}</strong><Mark mark={data.mark} /></span>
      <span className="architecture-map__meta mono-value">{data.detail}</span>
    </div>
    {data.empty !== null && <p className="architecture-topology__empty" data-namespace-empty>{data.empty}</p>}
  </div>;
});

const MountNode = memo(function MountNode({ data, selected }: NodeProps<Node<BoxData, 'mount'>>) {
  return <div className="architecture-map__box architecture-topology__mount" data-kind="mount" data-mount-tone={data.tone ?? undefined} data-selected={selected || undefined} data-tone={data.mark?.tone} data-quiet={data.quiet || undefined} data-deprecated={deprecated(data.node)}>
    <Handles />
    <span className="architecture-map__title"><strong>{data.node.name}</strong><Mark mark={data.mark} /></span>
    <span className="architecture-topology__summary" title={data.node.summary}>{data.node.summary}</span>
  </div>;
});

const MemberNode = memo(function MemberNode({ data, selected }: NodeProps<Node<BoxData, 'member'>>) {
  return <div className="architecture-map__box architecture-topology__member" data-kind={data.node.kind} data-selected={selected || undefined} data-tone={data.mark?.tone} data-quiet={data.quiet || undefined} data-deprecated={deprecated(data.node)}>
    <span className="architecture-map__title"><strong>{data.detail}</strong><Mark mark={data.mark} /></span>
  </div>;
});

const NODE_TYPES = { box: BoxNode, namespace: NamespaceNode, mount: MountNode, member: MemberNode };

/** A code node deployed on two processes shows in both boxes, so its canvas id names the box. Model ids hold no `/`. */
const memberId = (box: string, node: string) => `${box}/${node}`;

/** A masked mount path: the prose guard would change it, so the map carries null. */
const mountPath = (value: string | null, t: OperatorTranslate) => value ?? t('architecture.topology.masked');

function mountRow(mount: ArchitectureMapNodeV1, t: OperatorTranslate): string {
  const { order, source, target, mode } = mount.mount!;
  return t('architecture.topology.mountRow', { order, source: mountPath(source, t), target: mountPath(target, t), mode });
}

/** The second line of a box, as the canvas and the SVG file show it. */
function boxDetail(box: TopologyBox, t: OperatorTranslate): string {
  if (box.members.length > 0) return t(box.members[0]!.kind === 'mount' ? 'architecture.topology.mounts' : 'architecture.topology.deployed', { count: box.members.length });
  return box.node.kind === 'namespace' ? box.node.namespace!.type : box.node.kind;
}

const memberText = (member: ArchitectureMapNodeV1, t: OperatorTranslate) => member.kind === 'mount' ? mountRow(member, t) : member.name;

function Legend({ base, t }: { readonly base: TopologyBase; readonly t: OperatorTranslate }) {
  return <dl className="architecture-map__legend" aria-label={t('architecture.map.legend')} data-topology-legend={base}>
    {base === 'process' ? <>
      <div><dt><span className="architecture-map__swatch" /></dt><dd>{t('architecture.map.legend.code')}</dd></div>
      <div><dt><span className="architecture-map__swatch architecture-map__swatch--dashed" /></dt><dd>{t('architecture.topology.legend.runtime')}</dd></div>
      <div><dt><span className="architecture-map__swatch architecture-map__swatch--external" /></dt><dd>{t('architecture.map.legend.external')}</dd></div>
    </> : (base === 'namespace' ? ['writer', 'reader', 'point'] as const : ['point'] as const).map(tone => <div key={tone}>
      <dt><span className="architecture-topology__swatch" data-mount-tone={tone} /></dt><dd>{t(`architecture.topology.legend.${tone}`)}</dd>
    </div>)}
  </dl>;
}

/** Starts the browser download of one file built on the page. */
function download(name: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'image/svg+xml' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // The click starts the download in this task; the URL can go after it.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function segmentLayout(map: ArchitectureMapV1, base: TopologyBase, legacy: boolean): TopologyLayout {
  const shown = legacy ? map : withoutDeprecated(map);
  return layoutTopology(shown, runtimePlacement(shown), base);
}

/** The lens-row tools of the topology map: the segment, the legacy switch and the SVG export of the segment on screen. */
export function TopologyLensTools({ map, base, onBase, legacy, onLegacy, t }: {
  readonly map: ArchitectureMapV1;
  readonly base: TopologyBase;
  readonly onBase: (base: TopologyBase) => void;
  readonly legacy: boolean;
  readonly onLegacy: (legacy: boolean) => void;
  readonly t: OperatorTranslate;
}) {
  const full = useMemo(() => segmentLayout(map, base, true), [map, base]);
  const deprecatedCount = full.boxes.flatMap(box => [box.node, ...box.members]).filter(node => node.status === 'deprecated').length;
  const exportSvg = () => download(`topology-${base}-${map.commit.slice(0, 7)}.svg`,
    topologySvg(segmentLayout(map, base, legacy), { detail: box => boxDetail(box, t), member: (_, member) => memberText(member, t) }));
  return <span className="architecture-lens__tools">
    <span className="architecture-topology__bases" role="group" aria-label={t('architecture.topology.base')}>
      {TOPOLOGY_BASES.map(item => <button key={item} type="button" data-topology-base={item} aria-pressed={item === base} onClick={() => onBase(item)}>{t(`architecture.topology.base.${item}`)}</button>)}
    </span>
    <button type="button" className="architecture-lens__export architecture-topology__legacy" data-topology-legacy aria-pressed={legacy} disabled={deprecatedCount === 0}
      title={deprecatedCount === 0 ? t('architecture.topology.legacyNone') : undefined} onClick={() => onLegacy(!legacy)}>
      <span className="architecture-topology__switch" aria-hidden="true" />{t('architecture.topology.legacy')}<span className="mono-value">{deprecatedCount}</span>
    </button>
    <button type="button" className="architecture-lens__export" data-topology-export disabled={full.boxes.length === 0} onClick={exportSvg}>{t('architecture.topology.export')}</button>
  </span>;
}

/** The `writes` relations into a namespace or a mount, by writer name. */
function Writers({ map, nodeId, names, t }: { readonly map: ArchitectureMapV1; readonly nodeId: string; readonly names: ReadonlyMap<string, string>; readonly t: OperatorTranslate }) {
  const writers = map.relations.filter(relation => relation.kind === 'writes' && relation.target === nodeId);
  return <>
    <h4>{t('architecture.topology.writers')}</h4>
    {writers.length === 0 ? <p className="detail-quiet" data-writers="none">{t('architecture.topology.noWriter')}</p>
      : <ul data-writers>{writers.map(relation => <li key={relation.id}>{names.get(relation.source)}</li>)}</ul>}
  </>;
}

function TopologyCanvas({ map, layout, layer, pullRequest, side, onModule, t }: {
  readonly map: ArchitectureMapV1;
  readonly layout: TopologyLayout;
  readonly layer: MapLayerId;
  readonly pullRequest: number | null;
  readonly side: ReactNode;
  readonly onModule: (id: string) => void;
  readonly t: OperatorTranslate;
}) {
  const placement = useMemo(() => runtimePlacement(map), [map]);
  const view = useMemo(() => mapLayerView(map, layer, pullRequest), [map, layer, pullRequest]);
  const names = useMemo(() => new Map(map.nodes.map(node => [node.id, node.name])), [map]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const boxes = useMemo(() => new Map(layout.boxes.map(box => [box.node.id, box])), [layout]);
  // Canvas id to model node id; selection and the inspector use the model id.
  const modelIds = useMemo(() => new Map(layout.boxes.flatMap(box => [[box.node.id, box.node.id] as const,
    ...box.members.map(member => [memberId(box.node.id, member.id), member.id] as const)])), [layout]);
  // The first view opens on the first top-level box, a runtime box on the process segment; the rest is a pan or a Fit away.
  const firstView = useMemo(() => {
    const anchor = layout.boxes.find(box => box.parent === null && box.node.kind !== 'external-system')!;
    return firstViewport(anchor.x, anchor.y);
  }, [layout]);
  // A box is lit when a node it shows, or a node that runs in it, holds a mark; a frame is lit through what it holds.
  const lit = useMemo(() => {
    const holder = new Map(layout.boxes.flatMap(box => box.members.map(member => [member.id, box.node.id] as const)));
    const home = (id: string): string | null => {
      if (boxes.has(id)) return id;
      if (holder.has(id)) return holder.get(id)!;
      const where = placement(id);
      if (where.kind !== 'process') return null;
      return boxes.has(where.process) ? where.process : processNamespace(map, where.process);
    };
    const result = new Set<string>();
    for (const id of view.lit) {
      for (let cursor = home(id); cursor !== null && !result.has(cursor); cursor = boxes.get(cursor)?.parent ?? null) result.add(cursor);
    }
    return result;
  }, [layout, view, placement, boxes, map]);

  const nodes = useMemo<TopologyNode[]>(() => layout.boxes.flatMap((box: TopologyBox): TopologyNode[] => {
    const parent = box.parent === null ? null : boxes.get(box.parent)!;
    const own: TopologyNode = {
      id: box.node.id, type: layout.base !== 'namespace' ? 'box' : box.node.kind === 'namespace' ? 'namespace' : 'mount',
      position: { x: box.x - (parent?.x ?? 0), y: box.y - (parent?.y ?? 0) }, width: box.width, height: box.height,
      ...(parent ? { parentId: parent.node.id } : {}),
      data: {
        node: box.node, mark: view.marks.get(box.node.id) ?? null, quiet: view.available && !lit.has(box.node.id), detail: boxDetail(box, t), tone: box.tone,
        empty: layout.base === 'namespace' && box.node.kind === 'namespace' && !box.group ? t('architecture.topology.noMount') : null,
      },
      draggable: false, connectable: false, selected: box.node.id === selectedId, ariaLabel: `${box.node.kind} ${box.node.name}`,
    };
    return [own, ...box.members.map((member, index): TopologyNode => ({
      id: memberId(box.node.id, member.id), type: 'member', parentId: box.node.id,
      position: { x: 12, y: TOPOLOGY_BOX_HEADER + index * TOPOLOGY_MEMBER }, width: box.width - 24, height: TOPOLOGY_MEMBER - 4,
      data: { node: member, mark: view.marks.get(member.id) ?? null, quiet: view.available && !view.lit.has(member.id), detail: memberText(member, t), tone: null, empty: null },
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
      ...(edge.protocols.length > 0 ? { label: edge.protocols.join(' · ') } : {}), data: { kind: edge.kind },
      selectable: false, focusable: false, zIndex: touches ? 2 : 1,
    };
  }), [layout, selectedId]);

  // Selection is the only node change the read-only map applies; click and the keyboard both arrive here.
  const onNodesChange = useCallback((changes: NodeChange<TopologyNode>[]) => {
    const chosen = changes.find(change => change.type === 'select' && change.selected);
    if (chosen && 'id' in chosen) setSelectedId(modelIds.get(chosen.id)!);
    else if (changes.some(change => change.type === 'select')) setSelectedId(null);
  }, [modelIds]);

  const selected = selectedId === null ? null : map.nodes.find(node => node.id === selectedId)!;
  const selectedBox = selectedId === null ? null : boxes.get(selectedId) ?? null;
  const where = selected === null || TOPOLOGY_KINDS.has(selected.kind) ? null : placement(selected.id);
  const runsIn = selected?.kind === 'process' ? processNamespace(map, selected.id) : null;
  const mounter = selected?.kind === 'mount' ? map.relations.find(relation => relation.kind === 'mounts' && relation.target === selected.id)?.source ?? null : null;
  return <div className="architecture-map" data-view="topology" data-base={layout.base} data-node-count={layout.boxes.length} data-edge-count={layout.edges.length} data-layer={layer}>
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
        <Panel position="bottom-left"><Legend base={layout.base} t={t} /></Panel>
        <Panel position="bottom-right"><ZoomControls t={t} /></Panel>
      </ReactFlow>
    </div>
    <aside className="architecture-map__inspector" aria-label={t('architecture.map.inspector')} data-node-id={selectedId ?? undefined}>
      {side}
      {selected === null ? <p className="detail-quiet">{t('architecture.map.pick')}</p>
        : <NodeDetails map={map} layer={layer} pullRequest={pullRequest} nodeId={selected.id} onModule={onModule} t={t}>
          {runsIn !== null && <p data-runs-in={runsIn}>{t('architecture.topology.in', { name: names.get(runsIn)! })}</p>}
          {where?.kind === 'process' && <p data-runtime="process">{t('architecture.sequence.runsIn', { place: names.get(where.process)! })}</p>}
          {selected.kind === 'namespace' && <dl className="detail-list"><div><dt>{t('architecture.topology.type')}</dt><dd data-namespace-type>{selected.namespace!.type}</dd></div></dl>}
          {selected.kind === 'mount' && <dl className="detail-list" data-mount-fields>
            <div><dt>{t('architecture.topology.order')}</dt><dd className="mono-value">{selected.mount!.order}</dd></div>
            <div><dt>{t('architecture.topology.path')}</dt><dd className="mono-value">{mountPath(selected.mount!.source, t)} → {mountPath(selected.mount!.target, t)}</dd></div>
            <div><dt>{t('architecture.topology.mode')}</dt><dd className="mono-value">{selected.mount!.mode}</dd></div>
            {mounter !== null && <div><dt>{t('architecture.topology.mounter')}</dt><dd>{names.get(mounter)}</dd></div>}
          </dl>}
          {(selected.kind === 'namespace' || selected.kind === 'mount') && <Writers map={map} nodeId={selected.id} names={names} t={t} />}
          {selected.kind === 'process' && selectedBox !== null && selectedBox.members.length > 0 && <>
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

/** Why a segment has no box: the model declares none of its node kind. */
const SEGMENT_EMPTY = {
  process: { part: 'topology.processes', reason: 'process_undeclared' },
  namespace: { part: 'topology.namespaces', reason: 'namespace_undeclared' },
  mount: { part: 'topology.mounts', reason: 'mount_undeclared' },
} as const;

/** The topology base map on one segment. `legacy` false leaves out the `deprecated` nodes. `side` leads the side panel. */
export function ArchitectureTopology({ map, layer, pullRequest, base, legacy, side, onModule, t }: {
  readonly map: ArchitectureMapV1;
  readonly layer: MapLayerId;
  readonly pullRequest: number | null;
  readonly base: TopologyBase;
  readonly legacy: boolean;
  readonly side: ReactNode;
  readonly onModule: (id: string) => void;
  readonly t: OperatorTranslate;
}) {
  const shown = useMemo(() => legacy ? map : withoutDeprecated(map), [map, legacy]);
  const placement = useMemo(() => runtimePlacement(shown), [shown]);
  const layout = useMemo(() => layoutTopology(shown, placement, base), [shown, placement, base]);
  const view = useMemo(() => mapLayerView(map, layer, pullRequest), [map, layer, pullRequest]);
  const declared = shown.nodes.some(node => node.kind === 'process' || node.kind === 'namespace' || node.kind === 'mount');
  const empty = !declared ? { part: 'topology.empty', reason: 'topology_undeclared', text: t('architecture.topology.none') }
    : !layout.boxes.some(box => box.node.kind !== 'external-system') ? { ...SEGMENT_EMPTY[base], text: t(`architecture.topology.none.${base}`) } : null;
  if (empty !== null) {
    return <div className="architecture-map" data-view="topology" data-base={base}>
      <Note part={empty.part} reason={empty.reason}>{empty.text}</Note>
      <aside className="architecture-map__inspector" aria-label={t('architecture.map.inspector')}>{side}</aside>
    </div>;
  }
  const names = new Map(map.nodes.map(node => [node.id, node.name]));
  const relations = new Map(map.relations.map(relation => [relation.id, relation]));
  const drawn = new Set(layout.boxes.flatMap(box => [box.node.id, ...box.members.map(member => member.id)]));
  const hidden = base === 'process' ? [...view.marks.keys()].filter(id => !drawn.has(id) && placement(id).kind === 'unknown') : [];
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
    <ReactFlowProvider><TopologyCanvas key={`${map.commit}:${base}:${legacy}`} map={shown} layout={layout} layer={layer} pullRequest={pullRequest} side={side} onModule={onModule} t={t} /></ReactFlowProvider>
  </div>;
}
