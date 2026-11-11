// The layer base map (the ArchLayers artboard): the model's declared layer
// order as bands, one box for each layer's nodes with their own lines, and the
// selected layer's relations to other layers. The inspector shows the layer's
// lanes, files, its largest nodes and the imports that archctx reports against
// the layer order. Every value is the collector's; this view computes only sums.

import { memo, useCallback, useMemo } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import type { ArchitectureMapV1 } from '../core/operator/architecture-map';
import { archctxCode } from './architecture-map-layers';
import { Note } from './architecture-map-parts';
import type { SceneBox, SceneRoute } from './architecture-scene';
import { bandLabelId, compactLines, layoutLayers, type LayerBand, type LayerLane } from './architecture-layers-layout';
import { ArchitectureSceneCanvas, downloadSceneSvg, SceneHandles, type SceneLegendEntry, type SceneNodeView } from './ArchitectureSceneCanvas';
import type { OperatorTranslate } from './i18n';

/** The largest nodes of a layer that get their own size bar; the rest share one row. */
const SIZE_BARS = 7;

const bandLabel = (band: LayerBand) => `L${band.index} ${band.layer}`;
const memberNames = (band: LayerBand) => band.members.map(member => member.node.name).join(' · ');

interface LabelData extends Record<string, unknown> { readonly band: LayerBand }
interface LayerData extends Record<string, unknown> { readonly band: LayerBand; readonly t: OperatorTranslate }

const LabelNode = memo(function LabelNode({ data }: NodeProps<Node<LabelData, 'label'>>) {
  return <span className="architecture-layermap__band">{bandLabel(data.band)}</span>;
});

const LayerNode = memo(function LayerNode({ data, selected }: NodeProps<Node<LayerData, 'layer'>>) {
  const { band, t } = data;
  return <div className="architecture-layermap__box" data-layer-box={band.layer} data-selected={selected || undefined} data-empty={band.members.length === 0 || undefined}>
    <SceneHandles />
    <strong>{band.layer}</strong>
    <span className="architecture-layermap__members" title={memberNames(band)}>{band.members.length === 0 ? t('architecture.layers.empty') : memberNames(band)}</span>
    {band.lines !== null && <span className="architecture-layermap__lines mono-value">{compactLines(band.lines)}</span>}
  </div>;
});

const NODE_TYPES = { label: LabelNode, layer: LayerNode };

function legend(map: ArchitectureMapV1, t: OperatorTranslate): SceneLegendEntry[] {
  return [
    { key: 'code', swatch: <span className="architecture-map__swatch" />, text: t('architecture.map.legend.code') },
    { key: 'runtime', swatch: <span className="architecture-map__swatch architecture-map__swatch--dashed" />, text: t('architecture.layers.legend.runtime') },
    ...map.sizes.state === 'ok' ? [{ key: 'lines', swatch: <span className="mono-value" aria-hidden="true">1.2k</span>, text: t('architecture.layers.legend.lines') }] : [],
  ];
}

/** The text lines of each box in the SVG file: the band label, or the layer with its own lines and its members. */
function sceneLines(boxBands: ReadonlyMap<string, LayerBand>): (box: SceneBox) => readonly string[] {
  return box => {
    const band = boxBands.get(box.id)!;
    if (box.id !== band.layer) return [bandLabel(band)];
    return [band.layer, [...band.lines === null ? [] : [compactLines(band.lines)], memberNames(band)].filter(Boolean).join(' · ')];
  };
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

/** The accessible name of a lane: its layers and its protocols. */
const laneName = (lane: LayerLane) => [`${lane.source} → ${lane.target}`, ...lane.protocols].join(' · ');

/** The selected layer's lanes: the direction, the code or runtime line, the other layer and the protocols. */
function Lanes({ lanes, t }: { readonly lanes: readonly LayerLane[]; readonly t: OperatorTranslate }) {
  return <>
    <h4>{t('architecture.modules.relations', { count: lanes.length })}</h4>
    {lanes.length === 0 ? <p className="detail-quiet">{t('architecture.none')}</p> : <ul data-layer-lanes>{lanes.map(lane => {
      const direction = lane.side === 'right' ? 'out' : 'in';
      return <li key={lane.route.id} data-lane={lane.route.id} data-direction={direction}>
        <span className={`architecture-map__swatch${lane.dashed ? ' architecture-map__swatch--dashed' : ''}`}
          role="img" aria-label={t(lane.dashed ? 'architecture.layers.legend.runtime' : 'architecture.map.legend.code')} />
        {' '}<span className="mono-value">{t(`architecture.modules.direction.${direction}`)}</span> {direction === 'out' ? lane.target : lane.source}
        {lane.protocols.length > 0 && <> · <code>{lane.protocols.join(' · ')}</code></>}
      </li>;
    })}</ul>}
  </>;
}

function LayerDetails({ map, band, lanes, t }: { readonly map: ArchitectureMapV1; readonly band: LayerBand; readonly lanes: readonly LayerLane[]; readonly t: OperatorTranslate }) {
  return <>
    <div className="architecture-modules__heading">
      <span className="architecture-modules__eyebrow">L{band.index}</span>
      <h3>{band.layer}</h3>
      {band.files !== null && <span className="detail-quiet" data-layer-size>{t('architecture.map.sizeValue', { lines: band.lines!, files: band.files })}</span>}
    </div>
    <Lanes lanes={lanes} t={t} />
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

function LayersCanvas({ map, order, selected, onSelect, t }: {
  readonly map: ArchitectureMapV1;
  readonly order: readonly string[];
  readonly selected: string | null;
  readonly onSelect: (layer: string | null) => void;
  readonly t: OperatorTranslate;
}) {
  const layout = useMemo(() => layoutLayers(map, order), [map, order]);
  const band = layout.bands.find(item => item.layer === selected) ?? null;
  const layer = band?.layer ?? null;
  const scene = useMemo(() => layout.scene(layer), [layout, layer]);
  const lanes = useMemo(() => layout.lanes(layer), [layout, layer]);
  const unlayered = map.nodes.filter(node => node.layer === null).length;
  // A band has two boxes: its label, which a person cannot select, and its own box.
  const boxBands = useMemo(() => new Map(layout.bands.flatMap(item => [[bandLabelId(item.layer), item], [item.layer, item]] as const)), [layout]);
  const nodeView = useCallback((box: SceneBox): SceneNodeView => {
    const item = boxBands.get(box.id)!;
    return box.id === item.layer
      ? { type: 'layer', ariaLabel: bandLabel(item), selection: item.layer, data: { band: item, t } satisfies LayerData }
      : { type: 'label', ariaLabel: bandLabel(item), selection: null, data: { band: item } satisfies LabelData };
  }, [boxBands, t]);
  const routeLabel = useCallback((route: SceneRoute) => laneName(lanes.find(lane => lane.route.id === route.id)!), [lanes]);
  const exportSvg = () => downloadSceneSvg(`layers-${map.commit.slice(0, 7)}.svg`, scene, sceneLines(boxBands));
  return <>
    <div className="architecture-lens">
      <span className="architecture-lens__tools">
        <span data-layers-provenance>{t('architecture.layers.provenance', { version: map.archctx_version })}</span>
        <button type="button" className="architecture-lens__export" data-layers-export onClick={exportSvg}>{t('architecture.layers.export')}</button>
      </span>
    </div>
    <div className="architecture-map" data-view="layers" data-layer-count={layout.bands.length} data-lane-count={lanes.length}>
      <ArchitectureSceneCanvas label={t('architecture.layers.label')} scene={scene} nodeTypes={NODE_TYPES} view={nodeView}
        selected={layer} routeLabel={routeLabel} onSelect={onSelect} legend={legend(map, t)} t={t} />
      <aside className="architecture-map__inspector" aria-label={t('architecture.layers.inspector')} data-layer-id={layer ?? undefined}>
        <SizesGap map={map} t={t} />
        {unlayered > 0 && <Note part="layers.unlayered" reason="node_layer_undeclared">{t('architecture.layers.unlayered', { count: unlayered })}</Note>}
        {band === null ? <p className="detail-quiet">{t('architecture.layers.pick')}</p> : <LayerDetails map={map} band={band} lanes={lanes} t={t} />}
      </aside>
    </div>
  </>;
}

/** The layer base map. A model without ordered layers gets the gap instead of a map. */
export function ArchitectureLayers({ map, selectedId, onSelect, t }: {
  readonly map: ArchitectureMapV1;
  readonly selectedId: string | null;
  readonly onSelect: (layer: string | null) => void;
  readonly t: OperatorTranslate;
}) {
  const order = map.layer_order;
  if (order.state === 'unavailable') {
    return <div className="architecture-map" data-view="layers">
      <p className="architecture-map__gap" data-gap="layer_order" data-reason={order.reason}>{t(`architecture.layers.${order.reason}`)}</p>
    </div>;
  }
  return <LayersCanvas key={map.commit} map={map} order={order.layers} selected={selectedId} onSelect={onSelect} t={t} />;
}
