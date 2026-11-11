// The History view: archctx's architecture milestones on a timeline, newest first, and the
// shape of one milestone on the base-map layout with its delta marked.
// archctx owns the milestones, the deltas and their base revisions. This view
// only draws them: it computes no delta and parses no subject.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import type { ArchitectureHistory as HistoryPage, HistoryEdge, HistoryMilestone, HistoryNode } from 'archctx-contracts';
import { layoutArchitectureMap, type MapLayoutInput } from './architecture-map-layout';
import type { SceneBox, SceneRoute } from './architecture-scene';
import { ArchitectureSceneCanvas, SceneHandles, type SceneLegendEntry, type SceneNodeView } from './ArchitectureSceneCanvas';
import type { ArchitectureSelect, ArchitectureSelections } from './ArchitectureMap';
import type { OperatorTranslate } from './i18n';
import { CommandLine } from './ui';
import { answered, useObservationRefresh } from './useObservationRefresh';
import './architecture-history.css';

/** About 16 KB per milestone of this repository; 25 keeps one page near 400 KB. */
const HISTORY_PAGE = 25;

export type ValidMilestone = Extract<HistoryMilestone, { error?: never }>;
type MilestoneDelta = ValidMilestone['delta'];
export type HistoryDiff = 'added' | 'removed' | 'renamed' | 'inside';
export type HistoryEdgeDiff = 'added' | 'removed';

/** The route's typed refusal. */
export interface ArchitectureRefusal { readonly state: 'unavailable'; readonly reason: string }
/** The conditional read of the architecture routes: `null` is a 304. A request with no typed answer rejects. */
export type HistoryReader = (path: string, etag: string | null, signal: AbortSignal) => Promise<{ body: unknown; etag: string | null } | ArchitectureRefusal | null>;

/** What the page header and the tab badge show: the pinned head, the milestones read and archctx's total. */
export interface HistorySummary { readonly head: string; readonly read: number; readonly total: number }

/** One milestone's shape: its capabilities in domain groups, and the capabilities and relations its delta names. */
export interface HistoryShape {
  readonly input: MapLayoutInput;
  readonly nodes: ReadonlyMap<string, HistoryDiff>;
  readonly renamed: ReadonlyMap<string, { readonly from: string; readonly to: string }>;
  readonly edges: ReadonlyMap<string, HistoryEdgeDiff>;
  /** The drawn capabilities, removed ones included. */
  readonly capabilities: ReadonlyMap<string, HistoryNode>;
}

const domainId = (domain: string) => `domain:${domain}`;
const edgeId = (edge: HistoryEdge) => `${edge.source}->${edge.target}`;

/**
 * Capabilities that archctx names as the owner of a changed module or component. A
 * capability's own change wins over that mark.
 */
function insideCapabilities(delta: MilestoneDelta): ReadonlySet<string> {
  const own = new Set([...delta.added, ...delta.removed, ...delta.renamed].flatMap(item => item.kind === 'capability' ? [item.id] : []));
  return new Set([...delta.added, ...delta.removed, ...delta.renamed]
    .flatMap(item => item.kind !== 'capability' && item.capability !== null && !own.has(item.capability) ? [item.capability] : []));
}

/**
 * A removed capability is not in the milestone, so it is drawn from the base milestone
 * that archctx names in `delta.baseRev`. A module or component change marks the capability
 * that archctx gives it in `capability`.
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
  for (const id of insideCapabilities(delta)) nodes.set(id, 'inside');

  const drawn = new Set(capabilities.map(node => node.id));
  const removedEdges = delta.edgesChanged.removed.filter(edge => drawn.has(edge.source) && drawn.has(edge.target));
  return {
    input: {
      nodes: [
        ...domains.map(domain => ({ id: domainId(domain), kind: 'domain', name: domain, parent: null })),
        ...capabilities.map(node => ({ id: node.id, kind: 'capability', name: node.name, parent: node.domain === null ? null : domainId(node.domain) })),
      ],
      relations: [...milestone.edges, ...removedEdges].map(edge => ({ id: edgeId(edge), kind: 'relation', source: edge.source, target: edge.target })),
    },
    nodes,
    renamed: new Map(delta.renamed.filter(item => item.kind === 'capability').map(item => [item.id, { from: item.from, to: item.to }])),
    edges: new Map<string, HistoryEdgeDiff>([
      ...delta.edgesChanged.added.map(edge => [edgeId(edge), 'added'] as const),
      ...removedEdges.map(edge => [edgeId(edge), 'removed'] as const),
    ]),
    capabilities: new Map(capabilities.map(node => [node.id, node])),
  };
}

/**
 * Error milestones between the base and this milestone: archctx compared across them.
 * `null` when the base is older than the milestones read so far.
 */
export function skippedMilestones(milestones: readonly HistoryMilestone[], milestone: ValidMilestone): number | null {
  const { baseRev } = milestone.delta;
  if (baseRev === null) return 0;
  const base = milestones.findIndex(item => item.rev === baseRev);
  return base === -1 ? null : milestones.indexOf(milestone) - base - 1;
}

/** `milestones` keeps archctx's order, oldest first; `start` is the archctx offset of the first one. */
interface Timeline { readonly head: string; readonly total: number; readonly start: number; readonly milestones: readonly HistoryMilestone[] }
interface HistoryState {
  readonly path: string;
  readonly timeline: Timeline | null;
  readonly error: string | null;
  readonly more: { readonly loading: boolean; readonly error: string | null };
}

const errorCode = (error: unknown) => error instanceof Error && /^[a-z][a-z0-9_]{0,63}$/u.test(error.message) ? error.message : 'unavailable';

/**
 * archctx pages run oldest first. A one-milestone read of offset 0 gives the head and the
 * total; the newest page follows with that head as `ref`, and each later page is the older
 * window before the first one read, with the same `ref`. A new head starts over.
 */
function useHistory(path: string, read: HistoryReader, generation: number) {
  const initial: HistoryState = { path, timeline: null, error: null, more: { loading: false, error: null } };
  const [state, setState] = useState<HistoryState>(initial);
  const etag = useRef<{ path: string; etag: string } | null>(null);
  const request = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    const fail = (code: string) => {
      if (etag.current?.path !== path) etag.current = null;
      setState(current => current.path === path ? { ...current, error: code } : { ...initial, error: code });
    };
    try {
      const probe = await read(`${path}?offset=0&limit=1`, etag.current?.path === path ? etag.current.etag : null, signal);
      if (signal.aborted) return false;
      if (probe === null) {
        setState(current => current.error === null ? current : { ...current, error: null });
        return true;
      }
      if ('state' in probe) { fail(probe.reason); return answered(probe); }
      // The route decodes each page with the archctx decoder; the browser does not decode it again.
      const first = probe.body as HistoryPage;
      const start = Math.max(0, first.total - HISTORY_PAGE);
      let page = first;
      if (first.total > 1) {
        // No ETag: the reader returns null only for a 304.
        const newest = (await read(`${path}?offset=${start}&limit=${HISTORY_PAGE}&ref=${first.head}`, null, signal))!;
        if (signal.aborted) return false;
        if ('state' in newest) { fail(newest.reason); return answered(newest); }
        page = newest.body as HistoryPage;
      }
      etag.current = probe.etag === null ? null : { path, etag: probe.etag };
      setState({ path, timeline: { head: first.head, total: first.total, start, milestones: page.milestones }, error: null, more: { loading: false, error: null } });
      return true;
    } catch (error) {
      if (signal.aborted) return false;
      fail(errorCode(error));
      return false;
    }
  }, [path, read]);
  const retry = useObservationRefresh(request, JSON.stringify([path, generation]));

  const shown = state.path === path ? state : initial;
  const loadMore = useCallback(() => {
    const timeline = shown.timeline;
    if (timeline === null || shown.more.loading || timeline.start === 0) return;
    const offset = Math.max(0, timeline.start - HISTORY_PAGE);
    const same = (current: HistoryState) => current.path === path && current.timeline?.head === timeline.head && current.timeline.start === timeline.start;
    const moreFailed = (code: string) => setState(current => same(current) ? { ...current, more: { loading: false, error: code } } : current);
    setState(current => same(current) ? { ...current, more: { loading: true, error: null } } : current);
    read(`${path}?offset=${offset}&limit=${timeline.start - offset}&ref=${timeline.head}`, null, new AbortController().signal).then(result => {
      if (result !== null && 'state' in result) { moreFailed(result.reason); return; }
      const page = result!.body as HistoryPage;
      setState(current => same(current)
        ? { ...current, timeline: { ...timeline, start: offset, milestones: [...page.milestones, ...timeline.milestones] }, more: { loading: false, error: null } }
        : current);
    }, (error: unknown) => moreFailed(errorCode(error)));
  }, [path, read, shown]);
  return { ...shown, loadMore, retry };
}

interface HistoryBoxData extends Record<string, unknown> {
  readonly name: string;
  readonly diff: HistoryDiff | null;
  readonly from: string | null;
  readonly quiet: boolean;
}
interface HistoryGroupData extends Record<string, unknown> { readonly name: string; readonly count: number }

const MARK: Readonly<Record<HistoryDiff, string>> = { added: '+', removed: '−', renamed: '~', inside: '•' };
const short = (rev: string) => rev.slice(0, 7);

const HistoryBox = memo(function HistoryBox({ id, data, selected }: NodeProps<Node<HistoryBoxData, 'box'>>) {
  const { name, diff, from, quiet } = data;
  return <div className="architecture-history__node" title={id} data-node-id={id} data-diff={diff ?? undefined}
    data-quiet={quiet || undefined} data-selected={selected || undefined}>
    <SceneHandles />
    <b className="architecture-history__mark" aria-hidden="true">{diff && MARK[diff]}</b>
    <span className="architecture-history__name">
      <span>{name}</span>
      {from !== null && <s className="architecture-history__from">{from}</s>}
    </span>
  </div>;
});

const HistoryGroup = memo(function HistoryGroup({ id, data }: NodeProps<Node<HistoryGroupData, 'group'>>) {
  return <div className="architecture-history__group" data-node-id={id}>
    <SceneHandles />
    <span>{data.name} · {data.count}</span>
  </div>;
});

const NODE_TYPES = { box: HistoryBox, group: HistoryGroup };

interface Marks { readonly nodes: ReadonlyMap<string, HistoryDiff>; readonly edges: ReadonlyMap<string, HistoryEdgeDiff>; readonly touched: ReadonlySet<string> }

/** The marks archctx's delta gives this milestone. A first milestone has no base, so it marks nothing. */
function marksOf(milestone: ValidMilestone, shape: HistoryShape): Marks {
  if (milestone.delta.baseRev === null) return { nodes: new Map(), edges: new Map(), touched: new Set() };
  const touched = new Set(shape.nodes.keys());
  for (const relation of shape.input.relations) if (shape.edges.has(relation.id)) { touched.add(relation.source); touched.add(relation.target); }
  return { nodes: shape.nodes, edges: shape.edges, touched };
}

/** The milestone shape that the layout places: each relation takes its change (`added`, `removed`) as its kind, an unchanged one `relation`. */
export function historyLayoutInput(shape: HistoryShape, edges: ReadonlyMap<string, HistoryEdgeDiff>): MapLayoutInput {
  return { nodes: shape.input.nodes, relations: shape.input.relations.map(relation => ({ ...relation, kind: edges.get(relation.id) ?? 'relation' })) };
}

const PICK_ORDER: readonly HistoryDiff[] = ['removed', 'added', 'renamed', 'inside'];

/** The capability the inspector opens on: the first drawn one the delta marks, in the design's order, else the first drawn one. */
function firstCapability(marks: Marks, shape: HistoryShape): string | null {
  for (const diff of PICK_ORDER) for (const [id, mark] of marks.nodes) if (mark === diff && shape.capabilities.has(id)) return id;
  return shape.capabilities.keys().next().value ?? null;
}

function captionOf(milestone: ValidMilestone, skipped: number | null, t: OperatorTranslate): string {
  const { baseRev } = milestone.delta;
  if (baseRev === null) return t('architecture.history.caption.first', { rev: short(milestone.rev) });
  const revs = { base: short(baseRev), rev: short(milestone.rev) };
  if (skipped === null) return t('architectureHistory.caption.unread', revs);
  return skipped > 0 ? t('architectureHistory.caption.skipped', { ...revs, count: skipped }) : `${revs.base} → ${revs.rev}`;
}

/** The legend rows: the four capability changes and the two relation changes. */
function legendOf(t: OperatorTranslate): SceneLegendEntry[] {
  return [
    ...(['added', 'removed', 'renamed', 'inside'] as const).map(diff => ({
      key: diff, swatch: <i className="architecture-history__swatch" data-diff={diff} />, text: t(`architecture.history.diff.${diff}`),
    })),
    ...(['added', 'removed'] as const).map(diff => ({
      key: `edge-${diff}`, swatch: <i className="architecture-history__line" data-diff={diff} />, text: t(`architecture.history.edge.${diff}`),
    })),
  ];
}

function MilestoneMap({ milestone, shape, marks, skipped, selected, onSelect, t }: {
  readonly milestone: ValidMilestone;
  readonly shape: HistoryShape;
  readonly marks: Marks;
  readonly skipped: number | null;
  readonly selected: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly t: OperatorTranslate;
}) {
  const [focus, setFocus] = useState(false);
  const highlight = milestone.delta.baseRev !== null;
  const quiet = highlight && focus;
  const layout = useMemo(() => layoutArchitectureMap(historyLayoutInput(shape, marks.edges)), [shape, marks]);
  const nodes = useMemo(() => new Map(shape.input.nodes.map(node => [node.id, node])), [shape]);
  const members = useMemo(() => {
    const count = new Map<string, number>();
    for (const node of shape.input.nodes) if (node.parent !== null) count.set(node.parent, (count.get(node.parent) ?? 0) + 1);
    return count;
  }, [shape]);
  const view = useCallback((box: SceneBox): SceneNodeView => {
    const node = nodes.get(box.id)!;
    if (box.kind === 'frame') return { type: 'group', ariaLabel: `${node.kind} ${node.name}`, selection: null, data: { name: node.name, count: members.get(node.id) ?? 0 } satisfies HistoryGroupData };
    const diff = marks.nodes.get(node.id) ?? null;
    return {
      type: 'box', selection: node.id,
      ariaLabel: `${node.kind} ${node.name}${diff ? ` (${t(`architecture.history.diff.${diff}`)})` : ''}`,
      data: { name: node.name, diff, from: diff === 'renamed' ? shape.renamed.get(node.id)!.from : null, quiet: quiet && !marks.touched.has(node.id) } satisfies HistoryBoxData,
    };
  }, [nodes, members, marks, shape, quiet, t]);
  const routeLabel = useCallback((route: SceneRoute) => {
    const words = [t('architecture.modules.route.relation', { source: nodes.get(route.source)!.name, target: nodes.get(route.target)!.name }),
      `${layout.relations.get(route.id)!.length} ${t('architecture.history.count.relations')}`];
    return (route.kind === 'relation' ? words : [...words, t(`architecture.history.edge.${route.kind as HistoryEdgeDiff}`)]).join(' · ');
  }, [nodes, layout, t]);
  const legend = useMemo(() => legendOf(t), [t]);
  return <div className="architecture-history__stage" data-focus={quiet || undefined}>
    <div className="architecture-history__bar">
      <p className="architecture-history__caption" data-base-rev={milestone.delta.baseRev ?? ''}>{captionOf(milestone, skipped, t)}</p>
      <label className="architecture-history__focus">
        <button type="button" role="switch" className="architecture-history__switch" aria-checked={quiet} disabled={!highlight}
          onClick={() => setFocus(!focus)} />
        {t('architecture.history.focus')}
      </label>
    </div>
    <ArchitectureSceneCanvas label={t('architecture.history.map')} scene={layout.scene} nodeTypes={NODE_TYPES} view={view}
      selected={selected} emphasis={null} routeLabel={routeLabel} onSelect={onSelect} legend={legend} t={t} />
  </div>;
}

function CommitLink({ github, rev }: { readonly github: string | null; readonly rev: string }) {
  return github === null ? <code>{short(rev)}</code>
    : <a href={`https://github.com/${github}/commit/${rev}`} target="_blank" rel="noreferrer"><code>{short(rev)}</code> ↗</a>;
}

/** Counts of the delta archctx reports; nothing here is derived from two shapes. */
function MilestoneChips({ milestone, skipped, t }: { readonly milestone: HistoryMilestone; readonly skipped: number | null; readonly t: OperatorTranslate }) {
  if (milestone.error) return <span className="architecture-history__chips"><span className="architecture-history__chip" data-tone="error">{milestone.error.code}</span></span>;
  const { delta } = milestone;
  if (delta.baseRev === null) return <span className="architecture-history__chips"><span className="architecture-history__chip">{t('architecture.history.chip.first')}</span></span>;
  const relations = delta.edgesChanged.added.length + delta.edgesChanged.removed.length;
  const inside = insideCapabilities(delta).size;
  return <span className="architecture-history__chips">
    {delta.added.length > 0 && <span className="architecture-history__chip" data-tone="added">+{delta.added.length}</span>}
    {delta.removed.length > 0 && <span className="architecture-history__chip" data-tone="removed">−{delta.removed.length}</span>}
    {delta.renamed.length > 0 && <span className="architecture-history__chip" data-tone="renamed">~{delta.renamed.length}</span>}
    {inside > 0 && <span className="architecture-history__chip" data-tone="inside" title={t('architecture.history.diff.inside')}>•{inside}</span>}
    {relations > 0 && <span className="architecture-history__chip">{t('architecture.history.chip.relations', { added: delta.edgesChanged.added.length, removed: delta.edgesChanged.removed.length })}</span>}
    {skipped !== null && skipped > 0 && <span className="architecture-history__chip" data-tone="gap">{t('architecture.history.chip.gap', { count: skipped, rev: short(delta.baseRev) })}</span>}
  </span>;
}

function MilestoneList({ timeline, selected, onSelect, more, onMore, t }: {
  readonly timeline: Timeline;
  readonly selected: string;
  readonly onSelect: (rev: string) => void;
  readonly more: { readonly loading: boolean; readonly error: string | null };
  readonly onMore: () => void;
  readonly t: OperatorTranslate;
}) {
  const { milestones } = timeline;
  const shown = useMemo(() => [...milestones].reverse(), [milestones]);
  const list = useRef<HTMLOListElement>(null);
  const move = (index: number) => {
    const next = shown[Math.min(shown.length - 1, Math.max(0, index))]!;
    onSelect(next.rev);
    list.current?.querySelector(`[data-milestone-rev="${next.rev}"]`)?.scrollIntoView({ block: 'nearest' });
  };
  return <nav className="architecture-history__timeline" aria-label={t('architecture.history.timeline')}>
    {timeline.total === 0 && <p className="architecture-history__empty">{t('architecture.history.empty')}</p>}
    <ol ref={list} role="listbox" tabIndex={0} aria-label={t('architecture.history.timeline')} aria-activedescendant={`history-milestone-${selected}`}
      onKeyDown={event => {
        const current = shown.findIndex(item => item.rev === selected);
        const index = { ArrowDown: current + 1, ArrowUp: current - 1, Home: 0, End: shown.length - 1 }[event.key];
        if (index === undefined || shown.length === 0) return;
        event.preventDefault(); move(index);
      }}>
      {shown.map(item => <li key={item.rev} id={`history-milestone-${item.rev}`} role="option" aria-selected={item.rev === selected}
        data-milestone-rev={item.rev} data-state={item.error ? 'error' : 'ok'} onClick={() => onSelect(item.rev)}>
        <span className="architecture-history__top"><code>{short(item.rev)}</code><time dateTime={item.date} title={item.date}>{item.date.slice(5, 10)}</time></span>
        <span className="architecture-history__subject" title={item.subject}>{item.subject}</span>
        <MilestoneChips milestone={item} skipped={item.error ? 0 : skippedMilestones(milestones, item)} t={t} />
      </li>)}
    </ol>
    {timeline.start > 0 && <button type="button" className="architecture-history__load" disabled={more.loading} onClick={onMore}>
      {t('architectureHistory.more', { count: Math.min(HISTORY_PAGE, timeline.start), head: short(timeline.head) })}
    </button>}
    {more.error !== null && <p className="architecture-history__callout" data-tone="error" role="alert" data-error-code={more.error}>{t('architecture.history.moreFailed', { code: more.error })}</p>}
  </nav>;
}

function whatChanged(id: string, milestone: ValidMilestone, marks: Marks, shape: HistoryShape, t: OperatorTranslate): string {
  const { baseRev } = milestone.delta;
  if (baseRev === null) return t('architectureHistory.what.first');
  const diff = marks.nodes.get(id);
  if (diff === 'renamed') return t('architectureHistory.what.renamed', shape.renamed.get(id)!);
  if (diff === 'removed') return t('architectureHistory.what.removed', { rev: short(baseRev) });
  return diff === undefined ? t('architectureHistory.what.same') : t(`architectureHistory.what.${diff}`);
}

/**
 * The relation changes archctx reports for one capability. They come from the delta, not from the
 * drawn shape: a relation to a capability of an unread base is still a change. A first milestone has none.
 */
export function nodeRelations(milestone: ValidMilestone, id: string): readonly { readonly edge: HistoryEdge; readonly diff: HistoryEdgeDiff }[] {
  const { delta } = milestone;
  if (delta.baseRev === null) return [];
  const touches = (edge: HistoryEdge) => edge.source === id || edge.target === id;
  return [
    ...delta.edgesChanged.added.filter(touches).map(edge => ({ edge, diff: 'added' as const })),
    ...delta.edgesChanged.removed.filter(touches).map(edge => ({ edge, diff: 'removed' as const })),
  ];
}

/** The selected capability: its head, its change in this milestone, its changed relations and the base. */
function Inspector({ milestone, shape, marks, skipped, selected, github, t }: {
  readonly milestone: HistoryMilestone;
  readonly shape: HistoryShape | null;
  readonly marks: Marks | null;
  readonly skipped: number | null;
  readonly selected: string | null;
  readonly github: string | null;
  readonly t: OperatorTranslate;
}) {
  const label = t('architectureHistory.node');
  if (milestone.error) {
    return <aside className="architecture-history__inspector" aria-label={label} data-milestone-rev={milestone.rev}>
      <p className="architecture-history__callout" data-tone="error" data-gap="milestone" data-code={milestone.error.code}>
        {t('architecture.history.error')} <code>{milestone.error.code}</code>{milestone.error.path && <><br /><code>{milestone.error.path}</code></>}
      </p>
    </aside>;
  }
  const { baseRev } = milestone.delta;
  const node = selected === null ? null : shape!.capabilities.get(selected)!;
  const relations = node === null ? [] : nodeRelations(milestone, node.id);
  // A capability that is not drawn (its base milestone is not read yet) shows as its archctx id.
  const endpoint = (id: string) => {
    const capability = shape!.capabilities.get(id);
    return capability === undefined ? <code>{id}</code> : capability.name;
  };
  return <aside className="architecture-history__inspector" aria-label={label} data-milestone-rev={milestone.rev} data-node-id={node?.id}>
    {node !== null && <>
      <header>
        <p className="architecture-history__eyebrow">{node.domain ?? '—'}</p>
        <h3>{node.name}</h3>
        <code>{node.id}</code>
      </header>
      <section>
        <h4>{t('architectureHistory.milestone')}</h4>
        <p data-diff={marks!.nodes.get(node.id)}>{whatChanged(node.id, milestone, marks!, shape!, t)}</p>
      </section>
      <section>
        <h4>{t('architectureHistory.relations')}</h4>
        {relations.length === 0 ? <p className="architecture-history__quiet">{t('architectureHistory.none')}</p>
          : <ul>{relations.map(({ edge, diff }) => <li key={`${diff}:${edgeId(edge)}`} data-diff={diff}>
            <span className="architecture-history__chip" data-tone={diff}>{diff === 'added' ? '+' : '−'}</span>
            <span>{endpoint(edge.source)} → {endpoint(edge.target)}</span>
          </li>)}</ul>}
      </section>
    </>}
    <section>
      <h4>{t('architecture.history.base')}</h4>
      {baseRev === null ? <p className="architecture-history__quiet" data-base-rev="">{t('architecture.history.first')}</p> : <p data-base-rev={baseRev}>
        <CommitLink github={github} rev={baseRev} />
        {skipped !== null && skipped > 0 && <span className="architecture-history__quiet" data-gap="skipped" data-count={skipped}> {t('architectureHistory.base.skipped', { count: skipped })}</span>}
      </p>}
    </section>
  </aside>;
}

/** Read-only: every request is a GET of the history route. */
export function ArchitectureHistory({ path, github, read, refreshGeneration, selection, select, onSummary, t }: {
  readonly path: string;
  /** `owner/name` on GitHub; without it a commit shows as text. */
  readonly github: string | null;
  readonly read: HistoryReader;
  readonly refreshGeneration: number;
  /** The History entry of the workspace selection store; its scope is the milestone revision. */
  readonly selection: ArchitectureSelections['history'] | null;
  readonly select: (action: ArchitectureSelect) => void;
  /** Receives the summary of the timeline on screen, and `null` when none shows or the view closes. */
  readonly onSummary: (summary: HistorySummary | null) => void;
  readonly t: OperatorTranslate;
}) {
  const history = useHistory(path, read, refreshGeneration);
  const [picked, setPicked] = useState<string | null>(null);
  const { timeline } = history;
  const milestones = useMemo(() => timeline?.milestones ?? [], [timeline]);
  const milestone = milestones.find(item => item.rev === picked) ?? milestones.at(-1) ?? null;
  const valid = milestone === null || milestone.error ? null : milestone;
  const shape = useMemo(() => valid === null ? null : historyShape(milestones, valid), [milestones, valid]);
  const marks = useMemo(() => valid === null || shape === null ? null : marksOf(valid, shape), [valid, shape]);
  const skipped = valid === null ? 0 : skippedMilestones(milestones, valid);
  // A selection made on this milestone wins, an empty one included; with none, the inspector opens on the first marked capability.
  const chosen = valid !== null && selection?.scope === valid.rev ? selection : null;
  const selected = shape === null || marks === null ? null
    : chosen === null ? firstCapability(marks, shape) : chosen.id !== null && shape.capabilities.has(chosen.id) ? chosen.id : null;
  const rev = valid?.rev ?? '';
  const onNode = useCallback((id: string | null) => select({ view: 'history', scope: rev, id }), [select, rev]);
  // A milestone change drops the History selection, so the inspector opens on the new milestone's first marked capability.
  const pick = (next: string) => { setPicked(next); select({ view: 'history', scope: '', id: null }); };

  const head = timeline?.head ?? null;
  const total = timeline?.total ?? 0;
  useEffect(() => { onSummary(head === null ? null : { head, read: milestones.length, total }); }, [head, milestones.length, total, onSummary]);
  useEffect(() => () => onSummary(null), [onSummary]);

  if (timeline === null) {
    if (history.error === 'history_shallow_repository') {
      return <section className="architecture-history__whole-error" role="alert" data-error-code={history.error}>
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
        <MilestoneList timeline={timeline} selected={milestone.rev} onSelect={pick} more={history.more} onMore={history.loadMore} t={t} />
        {milestone.error
          ? <section className="architecture-history__canvas" aria-label={t('architecture.history.map')}>
            <p className="architecture-history__caption">{t('architectureHistory.caption.error', { rev: short(milestone.rev) })}</p>
            <div className="architecture-history__canvas-error"><code>{milestone.error.code}</code>{milestone.error.path && <p><code>{milestone.error.path}</code></p>}</div>
          </section>
          : <MilestoneMap key={milestone.rev} milestone={milestone} shape={shape!} marks={marks!} skipped={skipped} selected={selected} onSelect={onNode} t={t} />}
        <Inspector milestone={milestone} shape={shape} marks={marks} skipped={skipped} selected={selected} github={github} t={t} />
      </>}
    </div>
  </div>;
}
