// The History view: archctx's architecture milestones on a timeline, and the
// shape of one milestone on the base-map layout with its delta marked.
// archctx owns the milestones, the deltas and their base revisions. This view
// only draws them: it computes no delta and parses no subject.

import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
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
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import type { ArchitectureHistory as HistoryPage, HistoryEdge, HistoryMilestone, HistoryNode } from 'archctx-contracts';
import { ZoomControls } from './architecture-map-parts';
import { Mascot } from './brand';
import { layoutArchitectureMap, type MapLayoutInput, type MapLayoutNode } from './architecture-map-layout';
import type { OperatorTranslate } from './i18n';
import { CommandLine } from './ui';
import { useObservationRefresh } from './useObservationRefresh';

/** About 16 KB per milestone of this repository; 25 keeps one page near 400 KB. */
const HISTORY_PAGE = 25;

export type ValidMilestone = Extract<HistoryMilestone, { error?: never }>;
export type HistoryDiff = 'added' | 'removed' | 'renamed' | 'inside';
export type HistoryEdgeDiff = 'added' | 'removed';

/** The conditional read of the architecture routes: `null` is a 304. */
export type HistoryReader = (path: string, etag: string | null, signal: AbortSignal) => Promise<{ body: unknown; etag: string | null } | null>;

/** One milestone's shape: its capabilities in domain groups, and the capabilities and relations its delta names. */
export interface HistoryShape {
  readonly input: MapLayoutInput;
  readonly nodes: ReadonlyMap<string, HistoryDiff>;
  readonly renamed: ReadonlyMap<string, { readonly from: string; readonly to: string }>;
  readonly edges: ReadonlyMap<string, HistoryEdgeDiff>;
  /** Names of the drawn capabilities, removed ones included. */
  readonly names: ReadonlyMap<string, string>;
}

const domainId = (domain: string) => `domain:${domain}`;
const edgeId = (edge: HistoryEdge) => `${edge.source}->${edge.target}`;

/**
 * A removed capability is not in the milestone, so it is drawn from the base milestone
 * that archctx names in `delta.baseRev`. A module or component change marks the capability
 * that archctx gives it in `capability`; a capability's own change wins over that mark.
 */
export function historyShape(milestones: readonly HistoryMilestone[], milestone: ValidMilestone): HistoryShape {
  const { delta } = milestone;
  const base = milestones.find(item => item.rev === delta.baseRev);
  const baseNodes = new Map((base?.nodes ?? []).map(node => [node.id, node]));
  const removed = delta.removed.flatMap(item => item.kind === 'capability' && baseNodes.has(item.id) ? [baseNodes.get(item.id)!] : []);
  const capabilities: readonly HistoryNode[] = [...milestone.nodes, ...removed];
  const domains = [...new Set(capabilities.flatMap(node => node.domain === null ? [] : [node.domain]))];

  const nodes = new Map<string, HistoryDiff>();
  for (const item of delta.added) if (item.kind === 'capability') nodes.set(item.id, 'added');
  for (const item of delta.removed) if (item.kind === 'capability') nodes.set(item.id, 'removed');
  for (const item of delta.renamed) if (item.kind === 'capability') nodes.set(item.id, 'renamed');
  for (const item of [...delta.added, ...delta.removed, ...delta.renamed]) {
    if (item.kind !== 'capability' && item.capability !== null && !nodes.has(item.capability)) nodes.set(item.capability, 'inside');
  }

  const drawn = new Set(capabilities.map(node => node.id));
  const removedEdges = delta.edgesChanged.removed.filter(edge => drawn.has(edge.source) && drawn.has(edge.target));
  return {
    input: {
      nodes: [
        ...domains.map(domain => ({ id: domainId(domain), kind: 'domain', name: domain, layer: null, parent: null })),
        ...capabilities.map(node => ({ id: node.id, kind: 'capability', name: node.name, layer: null, parent: node.domain === null ? null : domainId(node.domain) })),
      ],
      relations: [...milestone.edges, ...removedEdges].map(edge => ({ id: edgeId(edge), kind: 'relation', source: edge.source, target: edge.target })),
    },
    nodes,
    renamed: new Map(delta.renamed.filter(item => item.kind === 'capability').map(item => [item.id, { from: item.from, to: item.to }])),
    edges: new Map<string, HistoryEdgeDiff>([
      ...delta.edgesChanged.added.map(edge => [edgeId(edge), 'added'] as const),
      ...removedEdges.map(edge => [edgeId(edge), 'removed'] as const),
    ]),
    names: new Map(capabilities.map(node => [node.id, node.name])),
  };
}

/** Error milestones between the base and this milestone: archctx compared across them. */
export function skippedMilestones(milestones: readonly HistoryMilestone[], milestone: ValidMilestone): number {
  const { baseRev } = milestone.delta;
  return baseRev === null ? 0 : milestones.indexOf(milestone) - milestones.findIndex(item => item.rev === baseRev) - 1;
}

interface Timeline { readonly head: string; readonly total: number; readonly milestones: readonly HistoryMilestone[] }
interface HistoryState {
  readonly path: string;
  readonly timeline: Timeline | null;
  readonly error: string | null;
  readonly more: { readonly loading: boolean; readonly error: string | null };
}

const errorCode = (error: unknown) => error instanceof Error && /^[a-z][a-z0-9_]{0,63}$/u.test(error.message) ? error.message : 'unavailable';

/**
 * The first page refreshes like the other architecture reads. Later pages pass the first
 * page's `head` as `ref`, so every page belongs to one history; a new head starts over.
 */
function useHistory(path: string, read: HistoryReader, generation: number) {
  const initial: HistoryState = { path, timeline: null, error: null, more: { loading: false, error: null } };
  const [state, setState] = useState<HistoryState>(initial);
  const etag = useRef<{ path: string; etag: string } | null>(null);
  const request = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    try {
      const result = await read(`${path}?offset=0&limit=${HISTORY_PAGE}`, etag.current?.path === path ? etag.current.etag : null, signal);
      if (signal.aborted) return false;
      if (result === null) {
        setState(current => current.error === null ? current : { ...current, error: null });
        return true;
      }
      // The route decodes the page with the archctx decoder; the browser does not decode it again.
      const page = result.body as HistoryPage;
      etag.current = result.etag === null ? null : { path, etag: result.etag };
      setState({ path, timeline: { head: page.head, total: page.total, milestones: page.milestones }, error: null, more: { loading: false, error: null } });
      return true;
    } catch (error) {
      if (signal.aborted) return false;
      if (etag.current?.path !== path) etag.current = null;
      setState(current => current.path === path ? { ...current, error: errorCode(error) } : { ...initial, error: errorCode(error) });
      return false;
    }
  }, [path, read]);
  const retry = useObservationRefresh(request, JSON.stringify([path, generation]));

  const shown = state.path === path ? state : initial;
  const loadMore = useCallback(() => {
    const timeline = shown.timeline;
    if (timeline === null || shown.more.loading || timeline.milestones.length >= timeline.total) return;
    const offset = timeline.milestones.length;
    const same = (current: HistoryState) => current.path === path && current.timeline?.head === timeline.head && current.timeline.milestones.length === offset;
    setState(current => same(current) ? { ...current, more: { loading: true, error: null } } : current);
    // No ETag: the reader returns null only for a 304.
    read(`${path}?offset=${offset}&limit=${HISTORY_PAGE}&ref=${timeline.head}`, null, new AbortController().signal).then(result => {
      const page = result!.body as HistoryPage;
      setState(current => same(current) ? { ...current, timeline: { ...timeline, milestones: [...timeline.milestones, ...page.milestones] }, more: { loading: false, error: null } } : current);
    }, (error: unknown) => {
      setState(current => same(current) ? { ...current, more: { loading: false, error: errorCode(error) } } : current);
    });
  }, [path, read, shown]);
  return { ...shown, loadMore, retry };
}

interface HistoryNodeData extends Record<string, unknown> {
  readonly item: MapLayoutNode;
  readonly diff: HistoryDiff | null;
  readonly from: string | null;
  readonly count: number;
  readonly quiet: boolean;
  readonly selected: boolean;
}
type HistoryFlowNode = Node<HistoryNodeData, 'box' | 'group'>;

const MARK: Readonly<Record<HistoryDiff, string>> = { added: '+', removed: '−', renamed: '~', inside: '•' };
const short = (rev: string) => rev.slice(0, 8);

function Handles() {
  return <>
    <Handle type="target" position={Position.Top} isConnectable={false} />
    <Handle type="source" position={Position.Bottom} isConnectable={false} />
  </>;
}

const HistoryBox = memo(function HistoryBox({ data }: NodeProps<HistoryFlowNode>) {
  const { item, diff, from, quiet, selected } = data;
  return <div className="architecture-history__node" title={item.node.id} data-node-id={item.node.id} data-diff={diff ?? undefined}
    data-quiet={quiet || undefined} data-selected={selected || undefined}>
    <Handles />
    <span className="architecture-history__name">{diff && <b aria-hidden="true">{MARK[diff]}</b>}<span>{item.node.name}</span></span>
    {from !== null && <s className="architecture-history__from">{from}</s>}
  </div>;
});

const HistoryGroup = memo(function HistoryGroup({ data }: NodeProps<HistoryFlowNode>) {
  return <div className="architecture-history__group" data-node-id={data.item.node.id}>
    <Handles />
    <span>{data.item.node.name} · {data.count}</span>
  </div>;
});

const NODE_TYPES = { box: HistoryBox, group: HistoryGroup };

/** The marks archctx's delta gives this milestone. A first milestone has no base, so it marks nothing. */
function marksOf(milestone: ValidMilestone, shape: HistoryShape) {
  if (milestone.delta.baseRev === null) return { nodes: new Map<string, HistoryDiff>(), edges: new Map<string, HistoryEdgeDiff>(), touched: new Set<string>() };
  const touched = new Set(shape.nodes.keys());
  for (const relation of shape.input.relations) if (shape.edges.has(relation.id)) { touched.add(relation.source); touched.add(relation.target); }
  return { nodes: shape.nodes, edges: shape.edges, touched };
}

function MilestoneMap({ milestone, shape, selected, onSelect, t }: {
  readonly milestone: ValidMilestone;
  readonly shape: HistoryShape;
  readonly selected: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly t: OperatorTranslate;
}) {
  const [focus, setFocus] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);
  const marks = useMemo(() => marksOf(milestone, shape), [milestone, shape]);
  const highlight = milestone.delta.baseRev !== null;
  const layout = useMemo(() => layoutArchitectureMap(shape.input), [shape]);
  const items = useMemo(() => new Map(layout.nodes.map(item => [item.node.id, item])), [layout]);
  const members = useMemo(() => {
    const count = new Map<string, number>();
    for (const node of shape.input.nodes) if (node.parent !== null) count.set(node.parent, (count.get(node.parent) ?? 0) + 1);
    return count;
  }, [shape]);
  const nodes = useMemo<HistoryFlowNode[]>(() => layout.nodes.map(item => {
    const parent = item.node.parent === null ? null : items.get(item.node.parent)!;
    const diff = marks.nodes.get(item.node.id) ?? null;
    return {
      id: item.node.id,
      type: item.group ? 'group' : 'box',
      position: { x: item.x - (parent?.x ?? 0), y: item.y - (parent?.y ?? 0) },
      width: item.width,
      height: item.height,
      ...(parent ? { parentId: parent.node.id } : {}),
      data: {
        item, diff, from: diff === 'renamed' ? shape.renamed.get(item.node.id)!.from : null, count: members.get(item.node.id) ?? 0,
        quiet: highlight && focus && !item.group && !marks.touched.has(item.node.id), selected: item.node.id === selected,
      },
      draggable: false,
      connectable: false,
      selectable: false,
      ariaLabel: `${item.node.kind} ${item.node.name}${diff ? ` (${t(`architecture.history.diff.${diff}`)})` : ''}`,
    };
  }), [layout, items, marks, members, shape, highlight, focus, selected, t]);
  const edges = useMemo<Edge[]>(() => layout.edges.map(({ relation }) => {
    const diff = marks.edges.get(relation.id);
    const hot = hovered !== null && (relation.source === hovered || relation.target === hovered);
    const state = hot ? ' is-hot' : hovered !== null ? ' is-cold' : highlight && focus && !diff ? ' is-quiet' : '';
    return {
      id: relation.id,
      source: relation.source,
      target: relation.target,
      className: `architecture-history__edge${diff ? ` architecture-history__edge--${diff}` : ''}${state}`,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: 'var(--rh-diagram-line)' },
      selectable: false,
      focusable: false,
      zIndex: diff || hot ? 2 : 1,
    };
  }), [layout, marks, hovered, highlight, focus]);
  return <section className="architecture-history__canvas" aria-label={t('architecture.history.map')}>
    <ReactFlow<HistoryFlowNode, Edge> nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} nodesDraggable={false} nodesConnectable={false}
      edgesFocusable={false} minZoom={0.05} maxZoom={2} fitView attributionPosition="top-right"
      onNodeClick={(_, node) => { if (node.type === 'box') onSelect(node.id === selected ? null : node.id); }}
      onNodeMouseEnter={(_, node) => setHovered(node.type === 'box' ? node.id : null)} onNodeMouseLeave={() => setHovered(null)}>
      <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="var(--rh-diagram-dot)" />
      <Panel position="top-left"><p className="architecture-history__caption" data-base-rev={milestone.delta.baseRev ?? ''}>
        {milestone.delta.baseRev === null ? t('architecture.history.caption.first', { rev: short(milestone.rev) })
          : `${short(milestone.delta.baseRev)} → ${short(milestone.rev)}`}
      </p></Panel>
      <Panel position="bottom-left"><HistoryLegend t={t} /></Panel>
      <Panel position="bottom-right"><div className="architecture-history__tools">
        <label><input type="checkbox" checked={focus} disabled={!highlight} onChange={event => setFocus(event.target.checked)} /> {t('architecture.history.focus')}</label>
        <ZoomControls t={t} />
      </div></Panel>
    </ReactFlow>
  </section>;
}

function HistoryLegend({ t }: { readonly t: OperatorTranslate }) {
  return <dl className="architecture-history__legend" aria-label={t('architecture.history.legend')}>
    {(['added', 'removed', 'renamed', 'inside'] as const).map(diff => <div key={diff}>
      <dt><i className="architecture-history__swatch" data-diff={diff} /></dt><dd>{t(`architecture.history.diff.${diff}`)}</dd>
    </div>)}
    {(['added', 'removed'] as const).map(diff => <div key={`edge-${diff}`}>
      <dt><i className="architecture-history__line" data-diff={diff} /></dt><dd>{t(`architecture.history.edge.${diff}`)}</dd>
    </div>)}
  </dl>;
}

function CommitLink({ github, rev, arrow = false }: { readonly github: string | null; readonly rev: string; readonly arrow?: boolean }) {
  return github === null ? <code>{short(rev)}</code>
    : <a href={`https://github.com/${github}/commit/${rev}`} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}><code>{short(rev)}</code>{arrow && ' ↗'}</a>;
}

/** Counts of the delta archctx reports; nothing here is derived from two shapes. */
function MilestoneChips({ milestone, skipped, t }: { readonly milestone: HistoryMilestone; readonly skipped: number; readonly t: OperatorTranslate }) {
  if (milestone.error) return <span className="architecture-history__chips"><span className="architecture-history__chip" data-tone="error">{milestone.error.code}</span></span>;
  const { delta } = milestone;
  if (delta.baseRev === null) return <span className="architecture-history__chips"><span className="architecture-history__chip">{t('architecture.history.chip.first')}</span></span>;
  const relations = delta.edgesChanged.added.length + delta.edgesChanged.removed.length;
  return <span className="architecture-history__chips">
    {delta.added.length > 0 && <span className="architecture-history__chip" data-tone="added">+{delta.added.length}</span>}
    {delta.removed.length > 0 && <span className="architecture-history__chip" data-tone="removed">−{delta.removed.length}</span>}
    {delta.renamed.length > 0 && <span className="architecture-history__chip" data-tone="renamed">~{delta.renamed.length}</span>}
    {relations > 0 && <span className="architecture-history__chip">{t('architecture.history.chip.relations', { added: delta.edgesChanged.added.length, removed: delta.edgesChanged.removed.length })}</span>}
    {skipped > 0 && <span className="architecture-history__chip" data-tone="gap">{t('architecture.history.chip.gap', { count: skipped, rev: short(delta.baseRev) })}</span>}
  </span>;
}

function Timeline({ timeline, selected, onSelect, github, more, onMore, t }: {
  readonly timeline: { readonly head: string; readonly total: number; readonly milestones: readonly HistoryMilestone[] };
  readonly selected: string;
  readonly onSelect: (rev: string) => void;
  readonly github: string | null;
  readonly more: { readonly loading: boolean; readonly error: string | null };
  readonly onMore: () => void;
  readonly t: OperatorTranslate;
}) {
  const { milestones } = timeline;
  const list = useRef<HTMLOListElement>(null);
  const move = (step: number) => {
    const next = milestones[Math.min(milestones.length - 1, Math.max(0, milestones.findIndex(item => item.rev === selected) + step))]!;
    onSelect(next.rev);
    list.current?.querySelector(`[data-milestone-rev="${next.rev}"]`)?.scrollIntoView({ block: 'nearest' });
  };
  return <nav className="architecture-history__timeline" aria-labelledby="architecture-history-timeline">
    <header>
      <h3 id="architecture-history-timeline">{t('architecture.history.timeline')}</h3>
      <span>{milestones.length} / {timeline.total}</span>
    </header>
    {timeline.total === 0 && <p className="architecture-history__empty">{t('architecture.history.empty')}</p>}
    <ol ref={list} role="listbox" tabIndex={0} aria-labelledby="architecture-history-timeline" aria-activedescendant={`history-milestone-${selected}`}
      onKeyDown={event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault(); move(event.key === 'ArrowDown' ? 1 : -1);
      }}>
      {milestones.map(item => <li key={item.rev} id={`history-milestone-${item.rev}`} role="option" aria-selected={item.rev === selected}
        data-milestone-rev={item.rev} data-state={item.error ? 'error' : 'ok'} onClick={() => onSelect(item.rev)}>
        <span className="architecture-history__dot" aria-hidden="true" />
        <span className="architecture-history__date"><time dateTime={item.date}>{item.date.slice(0, 10)}</time><CommitLink github={github} rev={item.rev} arrow /></span>
        <span className="architecture-history__subject">{item.subject}</span>
        <MilestoneChips milestone={item} skipped={item.error ? 0 : skippedMilestones(milestones, item)} t={t} />
      </li>)}
    </ol>
    <footer>
      <span>head <code>{short(timeline.head)}</code></span>
      {milestones.length < timeline.total && <button type="button" disabled={more.loading} onClick={onMore}>{t('architecture.history.more')}</button>}
    </footer>
    {more.error !== null && <p className="architecture-history__callout" data-tone="error" role="alert" data-error-code={more.error}>{t('architecture.history.moreFailed', { code: more.error })}</p>}
  </nav>;
}

const LIST_LIMIT = 8;

function DeltaList({ title, rows, t }: {
  readonly title: string;
  readonly rows: readonly { readonly key: string; readonly diff: HistoryDiff; readonly content: ReactNode }[];
  readonly t: OperatorTranslate;
}) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;
  const shown = open ? rows : rows.slice(0, LIST_LIMIT);
  return <section className="architecture-history__delta">
    <h4>{title}</h4>
    <ul>{shown.map(row => <li key={row.key} data-diff={row.diff}>{row.content}</li>)}</ul>
    {rows.length > LIST_LIMIT && <button type="button" className="architecture-history__more" onClick={() => setOpen(!open)}>
      {open ? t('architecture.history.list.less') : t('architecture.history.list.more', { count: rows.length - LIST_LIMIT })}
    </button>}
  </section>;
}

function Inspector({ milestones, milestone, shape, github, onSelect, t }: {
  readonly milestones: readonly HistoryMilestone[];
  readonly milestone: HistoryMilestone;
  readonly shape: HistoryShape | null;
  readonly github: string | null;
  readonly onSelect: (id: string) => void;
  readonly t: OperatorTranslate;
}) {
  const facts = <dl className="architecture-history__facts">
    <dt>{t('architecture.history.commit')}</dt><dd><CommitLink github={github} rev={milestone.rev} arrow /></dd>
    {milestone.delta && <><dt>{t('architecture.history.base')}</dt>
      <dd data-base-rev={milestone.delta.baseRev ?? ''}>{milestone.delta.baseRev === null ? '—' : <CommitLink github={github} rev={milestone.delta.baseRev} arrow />}</dd></>}
  </dl>;
  const header = <header>
    <p className="architecture-history__eyebrow"><time dateTime={milestone.date}>{milestone.date.slice(0, 10)}</time></p>
    <h3 id="architecture-history-subject">{milestone.subject}</h3>
  </header>;
  if (milestone.error) {
    return <aside className="architecture-history__inspector" aria-labelledby="architecture-history-subject" data-milestone-rev={milestone.rev}>{header}{facts}
      <p className="architecture-history__callout" data-tone="error" data-gap="milestone" data-code={milestone.error.code}>
        {t('architecture.history.error')} <code>{milestone.error.code}</code>{milestone.error.path && <><br /><code>{milestone.error.path}</code></>}
      </p>
    </aside>;
  }
  const { delta } = milestone;
  const skipped = skippedMilestones(milestones, milestone);
  const name = (id: string) => shape?.names.get(id) ?? null;
  const node = (id: string) => <button type="button" className="architecture-history__ref" onClick={() => onSelect(id)}>
    {name(id) && <span>{name(id)}</span>} <code>{id}</code>
  </button>;
  const items = (list: readonly { readonly id: string; readonly kind: string; readonly capability: string | null }[], diff: HistoryDiff) =>
    list.map(item => ({ key: `${diff}:${item.id}`, diff, content: item.kind === 'capability' ? node(item.id) : <code>{item.id}</code> }));
  const relations = (list: readonly HistoryEdge[], diff: HistoryDiff) =>
    list.map(edge => ({ key: `${diff}:${edgeId(edge)}`, diff, content: <>{node(edge.source)} <span aria-hidden="true">→</span> {node(edge.target)}</> }));
  return <aside className="architecture-history__inspector" aria-labelledby="architecture-history-subject" data-milestone-rev={milestone.rev}>{header}{facts}
    {delta.baseRev === null ? <>
      <p className="architecture-history__callout">{t('architecture.history.first')}</p>
      <div className="architecture-history__counts">
        <div><b>{milestone.nodes.length}</b><span>{t('architecture.history.count.capabilities')}</span></div>
        <div><b>{milestone.edges.length}</b><span>{t('architecture.history.count.relations')}</span></div>
      </div>
    </> : <>
      {skipped > 0 && <p className="architecture-history__callout" data-tone="gap" data-gap="skipped" data-count={skipped}>
        {t('architecture.history.gap', { count: skipped })} <code>{short(delta.baseRev)}</code>
      </p>}
      <div className="architecture-history__counts">
        <div data-diff="added"><b>+{delta.added.length}</b><span>{t('architecture.history.diff.added')}</span></div>
        <div data-diff="removed"><b>−{delta.removed.length}</b><span>{t('architecture.history.diff.removed')}</span></div>
        <div data-diff="renamed"><b>~{delta.renamed.length}</b><span>{t('architecture.history.diff.renamed')}</span></div>
        <div><b>{delta.edgesChanged.added.length + delta.edgesChanged.removed.length}</b><span>{t('architecture.history.count.relationsChanged')}</span></div>
      </div>
      <DeltaList title={t('architecture.history.diff.added')} rows={items(delta.added, 'added')} t={t} />
      <DeltaList title={t('architecture.history.diff.removed')} rows={items(delta.removed, 'removed')} t={t} />
      <DeltaList title={t('architecture.history.diff.renamed')} t={t} rows={delta.renamed.map(item => ({
        key: `renamed:${item.id}`, diff: 'renamed' as const,
        content: <span><s>{item.from}</s> <span aria-hidden="true">→</span> {item.to} <code>{item.id}</code></span>,
      }))} />
      <DeltaList title={t('architecture.history.edge.added')} rows={relations(delta.edgesChanged.added, 'added')} t={t} />
      <DeltaList title={t('architecture.history.edge.removed')} rows={relations(delta.edgesChanged.removed, 'removed')} t={t} />
    </>}
  </aside>;
}

/** Read-only: every request is a GET of the history route. */
export function ArchitectureHistory({ path, github, read, refreshGeneration, t }: {
  readonly path: string;
  /** `owner/name` on GitHub; without it a commit shows as text. */
  readonly github: string | null;
  readonly read: HistoryReader;
  readonly refreshGeneration: number;
  readonly t: OperatorTranslate;
}) {
  const history = useHistory(path, read, refreshGeneration);
  const [picked, setPicked] = useState<string | null>(null);
  const [node, setNode] = useState<string | null>(null);
  const { timeline } = history;
  const milestones = timeline?.milestones ?? [];
  const milestone = milestones.find(item => item.rev === picked) ?? milestones[0] ?? null;
  const shape = useMemo(() => milestone === null || milestone.error ? null : historyShape(milestones, milestone), [milestones, milestone]);
  const select = (rev: string) => { setPicked(rev); setNode(null); };

  if (timeline === null) {
    if (history.error === 'history_shallow_repository') {
      return <section className="architecture-history__whole-error" role="alert" data-error-code={history.error}>
        <Mascot name="cloud-off" className="h-auto w-[72px]" />
        <code>history-shallow-repository</code>
        <p>{t('architecture.history.shallow')}</p>
        <CommandLine command="git fetch --unshallow" t={t} />
      </section>;
    }
    return history.error !== null
      ? <p className="architecture-notice" role="alert" data-error-code={history.error}>{t('architecture.failed', { code: history.error })}</p>
      : <p role="status">{t('architecture.history.loading')}</p>;
  }
  return <div className="architecture-history">
    {history.error !== null && <div className="architecture-history__banner" role="alert" data-error-code={history.error}>
      <span>{t('architecture.refreshFailed', { code: history.error })}</span>
      <button type="button" onClick={history.retry}>{t('architecture.history.retry')}</button>
    </div>}
    <div className="architecture-history__body" data-stale={history.error !== null || undefined}>
      {milestone === null ? <p className="architecture-history__empty">{t('architecture.history.empty')}</p> : <>
        <Timeline timeline={timeline} selected={milestone.rev} onSelect={select} github={github} more={history.more} onMore={history.loadMore} t={t} />
        {milestone.error
          ? <section className="architecture-history__canvas" aria-label={t('architecture.history.map')}>
            <div className="architecture-history__canvas-error"><code>{milestone.error.code}</code>{milestone.error.path && <p><code>{milestone.error.path}</code></p>}</div>
          </section>
          : <ReactFlowProvider><MilestoneMap key={milestone.rev} milestone={milestone} shape={shape!} selected={node} onSelect={setNode} t={t} /></ReactFlowProvider>}
        <Inspector milestones={milestones} milestone={milestone} shape={shape} github={github} onSelect={setNode} t={t} />
      </>}
    </div>
  </div>;
}
