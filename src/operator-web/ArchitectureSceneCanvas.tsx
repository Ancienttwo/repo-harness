// The one canvas of a placed scene: pan, zoom, keyboard selection, the
// background, the legend and zoom panels, and the first view. Each scene box
// is a React Flow node at its placed size; each route is a `RouteEdge` that
// draws the placed points, so the screen and the SVG file draw one geometry.

import { memo, useCallback, useMemo, useRef, type ReactNode } from 'react';
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
  type EdgeChange,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeHandle,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { FirstViewport, ZoomControls } from './architecture-map-parts';
import { routePath, sceneBounds, sceneSvg, type PlacedScene, type SceneBox, type SceneLabel, type SceneRoute } from './architecture-scene';
import type { OperatorTranslate } from './i18n';

interface RouteData extends Record<string, unknown> {
  readonly route: SceneRoute;
  readonly label: SceneLabel | null;
}
type RouteEdgeType = Edge<RouteData, 'route'>;

/** A route takes its path from the scene, not from the handle positions. */
const RouteEdge = memo(function RouteEdge({ data, markerStart, markerEnd, style }: EdgeProps<RouteEdgeType>) {
  const { route, label } = data!;
  return <BaseEdge path={routePath(route.points)} markerStart={markerStart} markerEnd={markerEnd} style={style}
    label={label?.text} labelX={label === null ? undefined : label.x + label.width / 2} labelY={label === null ? undefined : label.y + label.height / 2} labelBgPadding={[4, 2]} />;
});

const EDGE_TYPES = { route: RouteEdge };

/**
 * React Flow attaches an edge to a node handle; a route ignores the handle place. A node component renders these
 * handles for the browser, and the node lists them for a renderer that measures nothing.
 */
export function SceneHandles() {
  return <>
    <Handle type="target" position={Position.Top} isConnectable={false} />
    <Handle type="source" position={Position.Bottom} isConnectable={false} />
  </>;
}

const handlesOf = (box: SceneBox): NodeHandle[] => [
  { type: 'target', position: Position.Top, x: box.width / 2, y: 0, width: 1, height: 1 },
  { type: 'source', position: Position.Bottom, x: box.width / 2, y: box.height, width: 1, height: 1 },
];

/** How a view shows one scene box: its node type and data, and the model id that a selection of the box selects; null for a box that a person cannot select. */
export interface SceneNodeView {
  readonly type: string;
  readonly data: Record<string, unknown>;
  readonly ariaLabel: string;
  readonly selection: string | null;
}

/** One legend row: the swatch and its text. */
export interface SceneLegendEntry {
  readonly key: string;
  readonly swatch: ReactNode;
  readonly text: string;
}

/** Starts the browser download of the scene as an SVG file. */
export function downloadSceneSvg(name: string, scene: PlacedScene, lines: (box: SceneBox) => readonly string[]): void {
  const url = URL.createObjectURL(new Blob([sceneSvg(scene, lines)], { type: 'image/svg+xml' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // The click starts the download in this task; the URL can go after it.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

interface SceneCanvasProps {
  readonly scene: PlacedScene;
  readonly nodeTypes: NodeTypes;
  /** Keep it stable across renders: a new function rebuilds every node. */
  readonly view: (box: SceneBox) => SceneNodeView;
  /** The selected model id. */
  readonly selected: string | null;
  /**
   * The box whose routes a selection lights. Optional: a caller that passes none lights the routes of the selected id, as before.
   * A view whose routes join the holders of its boxes names the holder.
   */
  readonly emphasis?: string | null;
  /** The accessible name of a route. Optional: a caller that passes none gives its routes no accessible name, as before. */
  readonly routeLabel?: (route: SceneRoute) => string;
  /** The model id that a selection of a route selects; null for a route that a person cannot select. Optional: a caller that passes none has no selectable route. */
  readonly routeSelection?: (route: SceneRoute) => string | null;
  readonly onSelect: (id: string | null) => void;
  readonly legend: readonly SceneLegendEntry[];
  readonly t: OperatorTranslate;
}

const noRouteSelection = () => null;

function SceneFlow({ scene, nodeTypes, view, selected, emphasis = selected, routeLabel, routeSelection = noRouteSelection, onSelect, legend, t }: SceneCanvasProps) {
  const views = useMemo(() => new Map(scene.boxes.map(box => [box.id, view(box)])), [scene, view]);
  const content = useMemo(() => sceneBounds(scene), [scene]);
  const nodes = useMemo<Node[]>(() => {
    const byId = new Map(scene.boxes.map(box => [box.id, box]));
    return scene.boxes.map(box => {
      const parent = box.parent === null ? null : byId.get(box.parent)!;
      const shown = views.get(box.id)!;
      return {
        id: box.id, type: shown.type, data: shown.data, ariaLabel: shown.ariaLabel,
        position: { x: box.x - (parent?.x ?? 0), y: box.y - (parent?.y ?? 0) }, width: box.width, height: box.height, handles: handlesOf(box),
        ...(parent ? { parentId: parent.id } : {}),
        draggable: false, connectable: false, selected: shown.selection !== null && shown.selection === selected,
        ...(shown.selection === null ? { selectable: false, focusable: false } : {}),
      };
    });
  }, [scene, views, selected]);
  const edges = useMemo<RouteEdgeType[]>(() => {
    const labels = new Map(scene.labels.filter(label => label.route !== null).map(label => [label.route!, label]));
    return scene.routes.map(route => {
      const selection = routeSelection(route);
      const chosen = selection !== null && selection === selected;
      const touches = chosen || (emphasis !== null && (route.source === emphasis || route.target === emphasis));
      const marker = { type: MarkerType.ArrowClosed, width: 14, height: 14, color: touches ? 'var(--rh-accent)' : 'var(--text-color-kumo-subtle)' };
      return {
        id: route.id, type: 'route', source: route.source, target: route.target,
        className: `architecture-map__edge architecture-map__edge--${route.kind}${touches ? ' is-active' : selected !== null ? ' is-dim' : ''}`,
        style: { strokeWidth: route.width, ...(route.dashed ? { strokeDasharray: '6 4' } : {}) },
        ...(route.arrows.start ? { markerStart: marker } : {}), ...(route.arrows.end ? { markerEnd: marker } : {}),
        data: { route, label: labels.get(route.id) ?? null }, selectable: selection !== null, focusable: selection !== null, selected: chosen, zIndex: touches ? 2 : 1,
        ...(routeLabel ? { ariaLabel: routeLabel(route) } : {}),
      };
    });
  }, [scene, selected, emphasis, routeLabel, routeSelection]);
  // Selection is the only change the read-only map applies; click and the keyboard both arrive here. One click sends the
  // select of one element and the deselect of the element selected before, nodes and edges in either order, so a
  // deselect clears only the selection that it holds; the ref keeps the selection of this event for the second call.
  const current = useRef(selected);
  current.current = selected;
  const routes = useMemo(() => new Map(scene.routes.map(route => [route.id, route])), [scene]);
  const applySelect = useCallback((changes: readonly (NodeChange | EdgeChange)[], selectionOf: (id: string) => string | null) => {
    const selects = changes.filter(change => change.type === 'select');
    const chosen = selects.find(change => change.selected);
    const next = chosen ? selectionOf(chosen.id) : selects.some(change => selectionOf(change.id) === current.current) ? null : undefined;
    if (next === undefined) return;
    current.current = next;
    onSelect(next);
  }, [onSelect]);
  const onNodesChange = useCallback((changes: NodeChange[]) => applySelect(changes, id => views.get(id)!.selection), [applySelect, views]);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => applySelect(changes, id => routeSelection(routes.get(id)!)), [applySelect, routes, routeSelection]);
  return <ReactFlow
    nodes={nodes}
    edges={edges}
    nodeTypes={nodeTypes}
    edgeTypes={EDGE_TYPES}
    onNodesChange={onNodesChange}
    onEdgesChange={onEdgesChange}
    nodesDraggable={false}
    nodesConnectable={false}
    edgesFocusable={false}
    minZoom={0.05}
    maxZoom={2}
    attributionPosition="top-right"
  >
    <FirstViewport content={content} />
    <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="var(--rh-diagram-dot)" />
    <Panel position="bottom-left"><dl className="architecture-map__legend" aria-label={t('architecture.map.legend')}>
      {legend.map(entry => <div key={entry.key}><dt>{entry.swatch}</dt><dd>{entry.text}</dd></div>)}
    </dl></Panel>
    <Panel position="bottom-right"><ZoomControls bounds={content} t={t} /></Panel>
  </ReactFlow>;
}

/** The canvas region of a scene. A view that needs a fresh first view gives the canvas a new `key`. */
export function ArchitectureSceneCanvas({ label, ...props }: SceneCanvasProps & { readonly label: string }) {
  return <div className="architecture-map__canvas" aria-label={label} role="region">
    <ReactFlowProvider><SceneFlow {...props} /></ReactFlowProvider>
  </div>;
}
