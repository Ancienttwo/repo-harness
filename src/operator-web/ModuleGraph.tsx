import { useId, useState, type KeyboardEvent } from 'react';
import type { GraphNode, ModuleGraph as ModuleGraphV1 } from '../core/architecture/module-view';
import type { OperatorTranslate } from './i18n';
import { CAPABILITY_ID } from './workspace-location';


const NODE_W = 200, NODE_H = 40, ROW = 52, CENTER_X = 260, CENTER_W = 240, HEADER = 44, INSET = 24, SIDE_X = 580;
const WIDTH = SIDE_X + NODE_W;

interface Box { readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly column: 0 | 1 | 2; readonly center: boolean }
type Point = readonly [number, number];

function short(name: string): string {
  return name.length > 26 ? `${name.slice(0, 25)}…` : name;
}

function activate(event: KeyboardEvent, action: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  action();
}

function layout(graph: ModuleGraphV1): { boxes: Map<string, Box>; height: number } {
  const side = (role: 'caller' | 'callee') => graph.nodes.filter(node => node.role === role);
  const callers = side('caller'), callees = side('callee'), children = graph.nodes.filter(node => node.role === 'child');
  const centerH = HEADER + children.length * ROW + (children.length ? 4 : 0);
  const height = Math.max(callers.length * ROW, callees.length * ROW, centerH) + 8;
  const boxes = new Map<string, Box>();
  const column = (nodes: readonly GraphNode[], x: number, index: 0 | 2) => {
    const top = (height - nodes.length * ROW) / 2 + 6;
    nodes.forEach((node, row) => boxes.set(node.id, { x, y: top + row * ROW, w: NODE_W, h: NODE_H, column: index, center: false }));
  };
  column(callers, 0, 0); column(callees, SIDE_X, 2);
  const centerY = (height - centerH) / 2;
  boxes.set(graph.center, { x: CENTER_X, y: centerY, w: CENTER_W, h: centerH, column: 1, center: true });
  children.forEach((node, row) => boxes.set(node.id, { x: CENTER_X + INSET, y: centerY + HEADER + row * ROW, w: CENTER_W - INSET - 12, h: NODE_H, column: 1, center: false }));
  return { boxes, height };
}

/** Center anchors use the header, because child boxes fill the rest of the frame. */
function anchorY(box: Box): number {
  return box.center ? box.y + HEADER / 2 : box.y + box.h / 2;
}

function edgePoints(source: Box, target: Box): Point[] {
  if (source.column < target.column) return [[source.x + source.w, anchorY(source)], [target.x, anchorY(target)]];
  if (source.column > target.column) return [[source.x, anchorY(source)], [target.x + target.w, anchorY(target)]];
  // Both ends sit in the center frame: route along its left inset.
  const rail = CENTER_X + 12;
  const end = (box: Box): Point => box.center ? [rail, box.y + HEADER - 6] : [box.x, anchorY(box)];
  const [sx, sy] = end(source), [tx, ty] = end(target);
  return [[sx, sy], [rail, sy], [rail, ty], [tx, ty]];
}

function path(points: readonly Point[]): string {
  if (points.length === 2) {
    const [[sx, sy], [tx, ty]] = points as [Point, Point];
    const bend = (tx - sx) / 2;
    return `M${sx} ${sy} C${sx + bend} ${sy} ${tx - bend} ${ty} ${tx} ${ty}`;
  }
  return points.map(([x, y], index) => `${index ? 'L' : 'M'}${x} ${y}`).join(' ');
}

function nodeName(node: GraphNode, t: OperatorTranslate): string {
  return node.kind === 'group' ? t('architecture.graph.more', { count: node.count }) : node.name;
}

/**
 * One-hop graph. `parent` is containment: child components sit inside the center
 * frame. Only directed edges carry an arrow; other relations are dashed and
 * labelled with their kind. A collapsed side expands to a list, not to nodes.
 */
export function ModuleGraph({ graph, onSelect, t }: {
  readonly graph: ModuleGraphV1;
  readonly onSelect: (capabilityId: string) => void;
  readonly t: OperatorTranslate;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState<readonly string[]>([]);
  const { boxes, height } = layout(graph);
  const names = new Map(graph.nodes.map(node => [node.id, nodeName(node, t)]));
  const toggle = (group: string) => setExpanded(current => current.includes(group) ? current.filter(item => item !== group) : [...current, group]);
  const groups = graph.nodes.filter(node => node.kind === 'group' && expanded.includes(node.id));
  return (
    <figure className="module-graph" aria-labelledby={`${id}-caption`}>
      <figcaption id={`${id}-caption`} className="module-graph__caption">
        <span>{t('architecture.graph.callers')}</span><span>{t('architecture.graph.module')}</span><span>{t('architecture.graph.callees')}</span>
      </figcaption>
      <svg className="module-graph__svg" viewBox={`0 0 ${WIDTH} ${height}`} width={WIDTH} height={height} role="group" aria-labelledby={`${id}-caption`}>
        <defs>
          <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" className="module-graph__arrow" />
          </marker>
        </defs>
        {graph.nodes.map(node => {
          const box = boxes.get(node.id);
          if (!box) return null;
          const label = nodeName(node, t);
          if (node.kind === 'group') {
            const open = expanded.includes(node.id);
            return (
              <g key={node.id} className="module-graph__node module-graph__node--group" data-node-role={node.role} role="button" tabIndex={0}
                aria-expanded={open} aria-label={t(`architecture.graph.group.${node.role}`, { count: node.count })}
                onClick={() => toggle(node.id)} onKeyDown={event => activate(event, () => toggle(node.id))}>
                <rect x={box.x} y={box.y} width={box.w} height={box.h} rx="8" />
                <text x={box.x + box.w / 2} y={box.y + box.h / 2} textAnchor="middle" dominantBaseline="central">{label}</text>
              </g>
            );
          }
          const target = node.role === 'caller' || node.role === 'callee' ? CAPABILITY_ID.test(node.id) : false;
          const select = () => onSelect(node.id);
          return (
            <g key={node.id} className={`module-graph__node module-graph__node--${node.role}`} data-node-id={node.id} data-node-role={node.role}
              {...(target ? { role: 'button', tabIndex: 0, 'aria-label': t('architecture.graph.open', { name: node.name }),
                onClick: select, onKeyDown: (event: KeyboardEvent) => activate(event, select) } : {})}>
              <title>{`${node.name} (${node.id})`}</title>
              <rect x={box.x} y={box.y} width={box.w} height={box.h} rx="8" />
              <text x={box.x + 12} y={box.center ? box.y + HEADER / 2 : box.y + box.h / 2} dominantBaseline="central">{short(label)}</text>
            </g>
          );
        })}
        {graph.edges.map((edge, index) => {
          const source = boxes.get(edge.source), target = boxes.get(edge.target);
          if (!source || !target) return null;
          const points = edgePoints(source, target);
          const directed = edge.direction === 'directed';
          const [mx, my] = points.length === 2
            ? [(points[0]![0] + points[1]![0]) / 2, (points[0]![1] + points[1]![1]) / 2] : [points[1]![0] + 4, (points[1]![1] + points[2]![1]) / 2];
          return (
            <g key={index} className="module-graph__edge" data-direction={edge.direction}>
              <path d={path(points)} {...(directed ? { markerEnd: `url(#${id}-arrow)` } : { strokeDasharray: '5 4' })}>
                <title>{`${edge.intent} (${edge.relation_kind})`}</title>
              </path>
              {!directed && <text className="module-graph__edge-label" x={mx} y={my - 4} textAnchor="middle">{edge.relation_kind}</text>}
            </g>
          );
        })}
      </svg>
      {groups.map(group => group.kind === 'group' && (
        <section key={group.id} className="module-graph__group" aria-label={t(`architecture.graph.group.${group.role}`, { count: group.count })}>
          <h4>{t(`architecture.graph.group.${group.role}`, { count: group.count })}</h4>
          <ul>
            {group.members.map(member => <li key={member.id}>
              {CAPABILITY_ID.test(member.id)
                ? <button type="button" onClick={() => onSelect(member.id)}>{member.name}</button>
                : <span>{member.name}</span>}
              <code>{member.id}</code>
            </li>)}
          </ul>
        </section>
      ))}
      <ul className="module-graph__relations" aria-label={t('architecture.graph.relations')}>
        {graph.edges.map((edge, index) => <li key={index} data-direction={edge.direction}>
          <span>{names.get(edge.source) ?? edge.source}</span>
          <span>{edge.direction === 'directed' ? ' → ' : ' — '}</span>
          <span>{names.get(edge.target) ?? edge.target}</span>
          <span className="module-graph__intent">{edge.intent}</span>
          <code>{edge.relation_kind}</code>
        </li>)}
      </ul>
    </figure>
  );
}
