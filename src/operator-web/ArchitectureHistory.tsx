// The History view: archctx's architecture milestones on a timeline, and the
// shape of one milestone on the base-map layout with its delta marked.
// archctx owns the milestones, the deltas and their base revisions. This view
// only draws them: it computes no delta and parses no subject.

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
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import type { ArchitectureHistory as HistoryPage, HistoryEdge, HistoryMilestone, HistoryNode } from 'archctx-contracts';
import { ZoomControls } from './architecture-map-parts';
import { layoutArchitectureMap, type MapLayoutInput, type MapLayoutNode } from './architecture-map-layout';
import type { OperatorTranslate } from './i18n';
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
  useObservationRefresh(request, JSON.stringify([path, generation]));

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
  return { ...shown, loadMore };
}

interface HistoryNodeData extends Record<string, unknown> {
  readonly item: MapLayoutNode;
  readonly diff: HistoryDiff | null;
  readonly renamed: { readonly from: string; readonly to: string } | null;
  readonly t: OperatorTranslate;
}
type HistoryFlowNode = Node<HistoryNodeData, 'box' | 'group'>;

function Handles() {
  return <>
    <Handle type="target" position={Position.Top} isConnectable={false} />
    <Handle type="source" position={Position.Bottom} isConnectable={false} />
  </>;
}

const HistoryBox = memo(function HistoryBox({ data }: NodeProps<HistoryFlowNode>) {
  const { item, diff, renamed, t } = data;
  return <div className="architecture-map__box architecture-history__node" data-kind={item.node.kind} data-node-id={item.node.id} data-diff={diff ?? undefined}>
    <Handles />
    <span className="architecture-map__title"><strong>{item.node.name}</strong>
      {diff !== null && <span className="architecture-history__mark" data-diff={diff}>{t(`architecture.history.diff.${diff}`)}</span>}
    </span>
    <span className="architecture-map__meta">{renamed ? `${renamed.from} → ${renamed.to}` : item.node.id}</span>
  </div>;
});

const HistoryGroup = memo(function HistoryGroup({ data }: NodeProps<HistoryFlowNode>) {
  return <div className="architecture-map__group" data-kind={data.item.node.kind} data-node-id={data.item.node.id}>
    <Handles />
    <div className="architecture-map__group-title"><span className="architecture-map__title"><strong>{data.item.node.name}</strong></span></div>
  </div>;
});

const NODE_TYPES = { box: HistoryBox, group: HistoryGroup };

function HistoryLegend({ t }: { readonly t: OperatorTranslate }) {
  return <dl className="architecture-map__legend" aria-label={t('architecture.history.legend')}>
    {(['added', 'removed', 'renamed', 'inside'] as const).map(diff => <div key={diff}>
      <dt><span className="architecture-history__swatch" data-diff={diff} /></dt><dd>{t(`architecture.history.diff.${diff}`)}</dd>
    </div>)}
  </dl>;
}

function MilestoneMap({ shape, t }: { readonly shape: HistoryShape; readonly t: OperatorTranslate }) {
  const layout = useMemo(() => layoutArchitectureMap(shape.input), [shape]);
  const items = useMemo(() => new Map(layout.nodes.map(item => [item.node.id, item])), [layout]);
  const nodes = useMemo<HistoryFlowNode[]>(() => layout.nodes.map(item => {
    const parent = item.node.parent === null ? null : items.get(item.node.parent)!;
    return {
      id: item.node.id,
      type: item.group ? 'group' : 'box',
      position: { x: item.x - (parent?.x ?? 0), y: item.y - (parent?.y ?? 0) },
      width: item.width,
      height: item.height,
      ...(parent ? { parentId: parent.node.id } : {}),
      data: { item, diff: shape.nodes.get(item.node.id) ?? null, renamed: shape.renamed.get(item.node.id) ?? null, t },
      draggable: false,
      connectable: false,
      selectable: false,
      ariaLabel: `${item.node.kind} ${item.node.name}`,
    };
  }), [layout, items, shape, t]);
  const edges = useMemo<Edge[]>(() => layout.edges.map(({ relation }) => {
    const diff = shape.edges.get(relation.id);
    return {
      id: relation.id,
      source: relation.source,
      target: relation.target,
      className: `architecture-map__edge${diff ? ` architecture-history__edge--${diff}` : ''}`,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: 'var(--text-color-kumo-subtle)' },
      selectable: false,
      focusable: false,
      zIndex: diff ? 2 : 1,
    };
  }), [layout, shape]);
  return <div className="architecture-history__map architecture-map__canvas" role="region" aria-label={t('architecture.history.map')}>
    <ReactFlow<HistoryFlowNode, Edge> nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} nodesDraggable={false} nodesConnectable={false}
      edgesFocusable={false} minZoom={0.05} maxZoom={2} fitView attributionPosition="top-right">
      <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="var(--rh-diagram-dot)" />
      <Panel position="bottom-left"><HistoryLegend t={t} /></Panel>
      <Panel position="bottom-right"><ZoomControls t={t} /></Panel>
    </ReactFlow>
  </div>;
}

function CommitLink({ github, rev }: { readonly github: string | null; readonly rev: string }) {
  const short = <code>{rev.slice(0, 12)}</code>;
  return github === null ? short : <a href={`https://github.com/${github}/commit/${rev}`} target="_blank" rel="noreferrer">{short}</a>;
}

function MilestoneDelta({ milestone, t }: { readonly milestone: ValidMilestone; readonly t: OperatorTranslate }) {
  const { delta } = milestone;
  const items = [
    ...delta.added.map(item => ({ ...item, diff: 'added' as const, text: item.id })),
    ...delta.removed.map(item => ({ ...item, diff: 'removed' as const, text: item.id })),
    ...delta.renamed.map(item => ({ ...item, diff: 'renamed' as const, text: `${item.id}: ${item.from} → ${item.to}` })),
  ];
  const count = (kind: string, diff: HistoryDiff) => items.filter(item => item.kind === kind && item.diff === diff).length;
  return <>
    <ul className="architecture-history__counts">
      {(['capability', 'module', 'component'] as const).filter(kind => items.some(item => item.kind === kind)).map(kind => <li key={kind} data-count-kind={kind}>
        {t('architecture.history.count.kind', { kind, added: count(kind, 'added'), removed: count(kind, 'removed'), renamed: count(kind, 'renamed') })}
      </li>)}
      <li data-count-kind="relation">{t('architecture.history.count.relations', { added: delta.edgesChanged.added.length, removed: delta.edgesChanged.removed.length })}</li>
    </ul>
    {items.length > 0 && <details className="architecture-history__items">
      <summary>{t('architecture.history.items', { count: items.length })}</summary>
      <ul>{items.map(item => <li key={`${item.diff}:${item.id}`} data-diff={item.diff}>
        <span className="architecture-history__mark" data-diff={item.diff}>{t(`architecture.history.diff.${item.diff}`)}</span> <code>{item.text}</code>
      </li>)}</ul>
    </details>}
  </>;
}

function Skipped({ count, t }: { readonly count: number; readonly t: OperatorTranslate }) {
  return count === 0 ? null : <p className="architecture-map__gap" data-gap="skipped" data-count={count}>{t('architecture.history.gap', { count })}</p>;
}

function MilestoneDetail({ milestones, index, github, t }: {
  readonly milestones: readonly HistoryMilestone[];
  readonly index: number;
  readonly github: string | null;
  readonly t: OperatorTranslate;
}) {
  const milestone = milestones[index]!;
  const shape = useMemo(() => milestone.error ? null : historyShape(milestones, milestone), [milestones, milestone]);
  return <article className="architecture-history__detail" data-milestone-rev={milestone.rev} aria-labelledby="architecture-history-subject">
    <header>
      <p className="detail-eyebrow"><time dateTime={milestone.date}>{milestone.date.slice(0, 10)}</time> · <CommitLink github={github} rev={milestone.rev} /></p>
      <h3 id="architecture-history-subject">{milestone.subject}</h3>
    </header>
    {milestone.error ? <p className="architecture-map__gap" data-gap="milestone" data-code={milestone.error.code}>
      {t('architecture.history.error', { code: milestone.error.code })}{milestone.error.path && <> <code>{milestone.error.path}</code></>}
    </p> : <>
      <p className="detail-quiet" data-base-rev={milestone.delta.baseRev ?? ''}>
        {milestone.delta.baseRev === null ? t('architecture.history.baseNone')
          : <>{t('architecture.history.base')} <CommitLink github={github} rev={milestone.delta.baseRev} /></>}
      </p>
      <Skipped count={skippedMilestones(milestones, milestone)} t={t} />
      <MilestoneDelta milestone={milestone} t={t} />
      {shape && <ReactFlowProvider><MilestoneMap key={milestone.rev} shape={shape} t={t} /></ReactFlowProvider>}
    </>}
  </article>;
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
  const { timeline } = history;
  const index = timeline === null || picked === null ? -1 : timeline.milestones.findIndex(item => item.rev === picked);
  return <div className="architecture-history">
    {history.error !== null && <p className="architecture-notice" role="alert" data-error-code={history.error}>
      {t(timeline === null ? 'architecture.failed' : 'architecture.refreshFailed', { code: history.error })}
    </p>}
    {timeline === null && history.error === null && <p role="status">{t('architecture.history.loading')}</p>}
    {timeline && <div className="architecture-history__body">
      <nav className="architecture-history__timeline" aria-label={t('architecture.history.timeline')}>
        <p className="detail-quiet">{t('architecture.history.shown', { shown: timeline.milestones.length, total: timeline.total })} · <code>{timeline.head.slice(0, 12)}</code></p>
        {timeline.total === 0 && <p className="detail-quiet">{t('architecture.history.empty')}</p>}
        <ol>
          {timeline.milestones.map(item => <li key={item.rev} data-milestone-rev={item.rev} data-state={item.error ? 'error' : 'ok'}>
            <button type="button" aria-pressed={item.rev === picked} onClick={() => setPicked(item.rev)}>
              <time dateTime={item.date}>{item.date.slice(0, 10)}</time>
              <span className="architecture-history__subject">{item.subject}</span>
              {item.error && <code className="architecture-history__error">{item.error.code}</code>}
            </button>
          </li>)}
        </ol>
        {timeline.milestones.length < timeline.total && <button type="button" className="operator-button operator-button--secondary"
          disabled={history.more.loading} onClick={history.loadMore}>{t('architecture.history.more')}</button>}
        {history.more.error !== null && <p className="architecture-notice" role="alert" data-error-code={history.more.error}>
          {t('architecture.history.moreFailed', { code: history.more.error })}
        </p>}
      </nav>
      {index === -1 ? <p className="detail-quiet">{t('architecture.history.pick')}</p>
        : <MilestoneDetail milestones={timeline.milestones} index={index} github={github} t={t} />}
    </div>}
  </div>;
}
