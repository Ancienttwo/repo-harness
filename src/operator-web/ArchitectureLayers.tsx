// The layer base map (the ArchLayers artboard): the model's declared layer
// order as bands, one box for each layer's nodes with their own lines, and the
// selected layer's relations to other layers. The inspector shows the layer's
// files, its largest nodes and the imports that archctx reports against the
// layer order. Every value is the collector's; this view computes only sums.

import { memo, useCallback, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import type { ArchitectureMapV1 } from '../core/operator/architecture-map';
import { archctxCode } from './architecture-map-layers';
import { contentBox, FirstViewport, Note, ZoomControls } from './architecture-map-parts';
import { compactLines, lanePath, layersSvg, layoutLayers, type LayerBand, type LayerLane } from './architecture-layers-layout';
import type { OperatorTranslate } from './i18n';

/** The largest nodes of a layer that get their own size bar; the rest share one row. */
const SIZE_BARS = 7;

const bandLabel = (band: LayerBand) => `L${band.index} ${band.layer}`;
const memberNames = (band: LayerBand) => band.members.map(member => member.node.name).join(' · ');

interface LabelData extends Record<string, unknown> { readonly band: LayerBand }
interface LayerData extends Record<string, unknown> { readonly band: LayerBand; readonly t: OperatorTranslate }
type LayersNode = Node<LabelData, 'label'> | Node<LayerData, 'layer'>;
interface LaneData extends Record<string, unknown> { readonly lane: LayerLane }
type LaneEdge = Edge<LaneData, 'lane'>;

const LabelNode = memo(function LabelNode({ data }: NodeProps<Node<LabelData, 'label'>>) {
  return <span className="architecture-layermap__band">{bandLabel(data.band)}</span>;
});

/** Handles exist for edge routing only; the map is read-only, so they accept no connection. */
const LayerNode = memo(function LayerNode({ data, selected }: NodeProps<Node<LayerData, 'layer'>>) {
  const { band, t } = data;
  return <div className="architecture-layermap__box" data-layer-box={band.layer} data-selected={selected || undefined} data-empty={band.members.length === 0 || undefined}>
    {(['right', 'left'] as const).map(side => <span key={side}>
      <Handle id={`s-${side}`} type="source" position={side === 'right' ? Position.Right : Position.Left} isConnectable={false} />
      <Handle id={`t-${side}`} type="target" position={side === 'right' ? Position.Right : Position.Left} isConnectable={false} />
    </span>)}
    <strong>{band.layer}</strong>
    <span className="architecture-layermap__members" title={memberNames(band)}>{band.members.length === 0 ? t('architecture.layers.empty') : memberNames(band)}</span>
    {band.lines !== null && <span className="architecture-layermap__lines mono-value">{compactLines(band.lines)}</span>}
  </div>;
});

/** A lane takes its route from the layout, not from the handle positions. */
const LaneEdgeView = memo(function LaneEdgeView({ data, markerEnd }: EdgeProps<LaneEdge>) {
  const { lane } = data!;
  const [x, top] = lane.points[1]!;
  return <BaseEdge path={lanePath(lane.points)} markerEnd={markerEnd} className={lane.dashed ? 'architecture-layermap__lane--dashed' : undefined}
    label={lane.protocols.length > 0 ? lane.protocols.join(' · ') : undefined} labelX={x} labelY={(top + lane.points[2]![1]) / 2} labelBgPadding={[4, 2]} />;
});

const NODE_TYPES = { label: LabelNode, layer: LayerNode };
const EDGE_TYPES = { lane: LaneEdgeView };

function Legend({ map, t }: { readonly map: ArchitectureMapV1; readonly t: OperatorTranslate }) {
  return <dl className="architecture-map__legend" aria-label={t('architecture.map.legend')}>
    <div><dt><span className="architecture-map__swatch" /></dt><dd>{t('architecture.map.legend.code')}</dd></div>
    <div><dt><span className="architecture-map__swatch architecture-map__swatch--dashed" /></dt><dd>{t('architecture.layers.legend.runtime')}</dd></div>
    {map.sizes.state === 'ok' && <div><dt className="mono-value" aria-hidden="true">1.2k</dt><dd>{t('architecture.layers.legend.lines')}</dd></div>}
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

/** The layer's own lines by node, the largest first, as bars against the largest. */
function SizeBars({ band, t }: { readonly band: LayerBand; readonly t: OperatorTranslate }) {
  const sized = band.members.filter(member => member.lines! > 0);
  if (sized.length === 0) return <p className="detail-quiet">{t('architecture.map.noSize')}</p>;
  const shown = sized.slice(0, SIZE_BARS);
  const rest = sized.slice(SIZE_BARS);
  const rows = [
    ...shown.map(member => ({ key: member.node.id, name: member.node.name, lines: member.lines! })),
    ...(rest.length > 0 ? [{ key: 'rest', name: t('architecture.layers.rest', { count: rest.length }), lines: rest.reduce((sum, member) => sum + member.lines!, 0) }] : []),
  ];
  const max = Math.max(...rows.map(row => row.lines));
  return <ul className="architecture-layermap__sizes" data-layer-sizes>{rows.map(row => <li key={row.key} data-size-row={row.key}>
    <span className="architecture-layermap__size-name" title={row.name}>{row.name}</span>
    <span className="architecture-layermap__bar"><span style={{ width: `${Math.round((row.lines / max) * 100)}%` }} /></span>
    <span className="mono-value">{compactLines(row.lines)}</span>
  </li>)}</ul>;
}

/** The imports that archctx reports against the layer order, summed by layer pair, for pairs with this layer at either end. */
function Violations({ map, layer, t }: { readonly map: ArchitectureMapV1; readonly layer: string; readonly t: OperatorTranslate }) {
  const direction = map.layers.violations.layer_direction;
  if (direction.state === 'unavailable') {
    const reason = direction.reason === 'archctx_error'
      ? t('architecture.layer.reason.archctx_error', { code: archctxCode(direction) }) : t(`architecture.layer.reason.${direction.reason}`);
    return <p className="architecture-map__gap" data-gap="layer_direction" data-reason={direction.reason}>
      {t('architecture.layer.violations.gap', { part: t('architecture.layer.violations.layer_direction.label'), reason })}</p>;
  }
  const pairs = new Map<string, { source: string; target: string; imports: number }>();
  for (const edge of direction.edges) {
    if (edge.source_layer !== layer && edge.target_layer !== layer) continue;
    const key = `${edge.source_layer}\n${edge.target_layer}`;
    const pair = pairs.get(key) ?? { source: edge.source_layer, target: edge.target_layer, imports: 0 };
    pairs.set(key, { ...pair, imports: pair.imports + edge.imports });
  }
  return <>
    {pairs.size === 0 ? <p className="detail-quiet">{t('architecture.layers.violations.none')}</p>
      : <ul className="architecture-layermap__pairs" data-layer-violations>{[...pairs.values()].map(pair => <li key={`${pair.source}-${pair.target}`} data-pair={`${pair.source}->${pair.target}`}>
        <span>{pair.source} → {pair.target}</span>
        <span className="mono-value">{pair.imports}</span>
        <span className="architecture-layermap__verdict">{t('architecture.layers.violation')}</span>
      </li>)}</ul>}
    <p className="detail-quiet" data-layer-checked>{t('architecture.layers.checked', { imports: direction.imports })}</p>
  </>;
}

function LayerDetails({ map, band, t }: { readonly map: ArchitectureMapV1; readonly band: LayerBand; readonly t: OperatorTranslate }) {
  return <>
    <div className="architecture-modules__heading">
      <span className="architecture-modules__eyebrow">L{band.index}</span>
      <h3>{band.layer}</h3>
      {band.files !== null && <span className="detail-quiet" data-layer-size>{t('architecture.map.sizeValue', { lines: band.lines!, files: band.files })}</span>}
    </div>
    {map.sizes.state === 'ok' && <>
      <h4>{t('architecture.layers.size')}</h4>
      <SizeBars band={band} t={t} />
    </>}
    <h4>{t('architecture.layer.violations.layer_direction.label')}</h4>
    <Violations map={map} layer={band.layer} t={t} />
    <details className="architecture-layermap__nodes">
      <summary>{t('architecture.layers.members', { count: band.members.length })}</summary>
      <ul>{band.members.map(member => <li key={member.node.id} data-member={member.node.id}>{member.node.name} <span className="detail-quiet">{member.node.kind}</span></li>)}</ul>
    </details>
  </>;
}

/** The sizes gap leads the inspector: the boxes and the size bars both need line counts. */
function SizesGap({ map, t }: { readonly map: ArchitectureMapV1; readonly t: OperatorTranslate }) {
  return map.sizes.state === 'unavailable' ? <p className="architecture-map__gap" data-gap="sizes" data-reason={map.sizes.reason}>{t(`architecture.map.sizes.${map.sizes.reason}`)}</p> : null;
}

function LayersCanvas({ map, order, t }: { readonly map: ArchitectureMapV1; readonly order: readonly string[]; readonly t: OperatorTranslate }) {
  const layout = useMemo(() => layoutLayers(map, order), [map, order]);
  const [selected, setSelected] = useState<string | null>(null);
  const lanes = useMemo(() => layout.lanes(selected), [layout, selected]);
  // A band's label sits left of the band, so each row spans from the label to the band's right edge.
  const content = useMemo(() => contentBox(layout.bands.map(band => ({ x: layout.labelX, y: band.y, width: band.x + band.width - layout.labelX, height: band.height }))), [layout]);
  const unlayered = map.nodes.filter(node => node.layer === null).length;

  const nodes = useMemo<LayersNode[]>(() => layout.bands.flatMap((band): LayersNode[] => [
    {
      id: `label:${band.layer}`, type: 'label', position: { x: layout.labelX, y: band.y }, width: band.x - layout.labelX, height: band.height,
      data: { band }, draggable: false, connectable: false, selectable: false, focusable: false,
    },
    {
      id: band.layer, type: 'layer', position: { x: band.x, y: band.y }, width: band.width, height: band.height, data: { band, t },
      draggable: false, connectable: false, selected: band.layer === selected, ariaLabel: bandLabel(band),
    },
  ]), [layout, selected, t]);

  const edges = useMemo<LaneEdge[]>(() => lanes.map((lane): LaneEdge => ({
    id: `lane:${lane.source}->${lane.target}:${lane.dashed ? 'runtime' : 'code'}`, type: 'lane', source: lane.source, target: lane.target,
    sourceHandle: `s-${lane.side}`, targetHandle: `t-${lane.side}`, data: { lane },
    className: 'architecture-map__edge architecture-layermap__lane', selectable: false, focusable: false,
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: 'var(--text-color-kumo-subtle)' },
  })), [lanes]);

  // Selection is the only node change the read-only map applies; click and the keyboard both arrive here.
  const onNodesChange = useCallback((changes: NodeChange<LayersNode>[]) => {
    const chosen = changes.find(change => change.type === 'select' && change.selected);
    if (chosen && 'id' in chosen) setSelected(chosen.id);
    else if (changes.some(change => change.type === 'select')) setSelected(null);
  }, []);

  const exportSvg = () => download(`layers-${map.commit.slice(0, 7)}.svg`, layersSvg(layout, selected, { band: bandLabel, members: memberNames }));
  const band = layout.bands.find(item => item.layer === selected) ?? null;
  return <>
    <div className="architecture-lens">
      <span className="architecture-lens__tools">
        <span data-layers-provenance>{t('architecture.layers.provenance', { version: map.archctx_version })}</span>
        <button type="button" className="architecture-lens__export" data-layers-export onClick={exportSvg}>{t('architecture.layers.export')}</button>
      </span>
    </div>
    <div className="architecture-map" data-view="layers" data-layer-count={layout.bands.length} data-lane-count={lanes.length}>
      <div className="architecture-map__canvas" aria-label={t('architecture.layers.label')} role="region">
        <ReactFlow<LayersNode, LaneEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodesChange={onNodesChange}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesFocusable={false}
          minZoom={0.05}
          maxZoom={2}
          attributionPosition="top-right"
        >
          <FirstViewport content={content} />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="var(--rh-diagram-dot)" />
          <Panel position="bottom-left"><Legend map={map} t={t} /></Panel>
          <Panel position="bottom-right"><ZoomControls t={t} /></Panel>
        </ReactFlow>
      </div>
      <aside className="architecture-map__inspector" aria-label={t('architecture.layers.inspector')} data-layer-id={selected ?? undefined}>
        <SizesGap map={map} t={t} />
        {unlayered > 0 && <Note part="layers.unlayered" reason="node_layer_undeclared">{t('architecture.layers.unlayered', { count: unlayered })}</Note>}
        {band === null ? <p className="detail-quiet">{t('architecture.layers.pick')}</p> : <LayerDetails map={map} band={band} t={t} />}
      </aside>
    </div>
  </>;
}

/** The layer base map. A model without ordered layers gets the gap instead of a map. */
export function ArchitectureLayers({ map, t }: { readonly map: ArchitectureMapV1; readonly t: OperatorTranslate }) {
  const order = map.layer_order;
  if (order.state === 'unavailable') {
    return <div className="architecture-map" data-view="layers">
      <p className="architecture-map__gap" data-gap="layer_order" data-reason={order.reason}>{t(`architecture.layers.${order.reason}`)}</p>
    </div>;
  }
  return <ReactFlowProvider><LayersCanvas key={map.commit} map={map} order={order.layers} t={t} /></ReactFlowProvider>;
}
