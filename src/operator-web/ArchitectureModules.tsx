// The module base map (the ArchModules artboard): the model's capabilities in
// their domain groups, the external systems, one directed route per domain pair
// with imports, and one card per capability with five fixed signal slots. A
// selected card lights its in and out neighbours, and the inspector lists its
// relations, changes, violations, PR impact, tests and decisions. Every value is
// the collector's; this view computes only roll-ups.

import { memo, useCallback, useMemo, type ReactNode } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { flowSteps, type ArchitectureMapNodeV1, type ArchitectureMapV1 } from '../core/operator/architecture-map';
import { compactLines } from './architecture-layers-layout';
import { archctxCode, capabilityOwners, impactPaths, impactTargets, modulesLayerView, type MapLayerId, type ModuleMark } from './architecture-map-layers';
import { counted, FactList, FixCommand, NodeDetails, nodeSize, violationFacts } from './architecture-map-parts';
import { domainId, layoutModules, markUndeclared, type ModulesLayout, type UndeclaredEnd } from './architecture-modules-layout';
import type { SceneBox, SceneRoute } from './architecture-scene';
import { ArchitectureSceneCanvas, SceneHandles, type SceneLegendEntry, type SceneNodeView } from './ArchitectureSceneCanvas';
import type { OperatorTranslate } from './i18n';

/** How a card relates to the selected card: it imports or calls it (`in`), the selected card reaches it (`out`), or both. */
type Direction = 'in' | 'out';
type Neighbour = Direction | 'both';

/** The glyph of a direction state on a card and in the legend; its text names the direction. */
const GLYPH: Readonly<Record<Neighbour, string>> = { in: '←', out: '→', both: '⇄' };

/** A direction state on a card: the glyph, with its words as the accessible name and the hover. */
function StateBadge({ kind, state, t }: { readonly kind: 'neighbour' | 'undeclared'; readonly state: Neighbour; readonly t: OperatorTranslate }) {
  const words = t(`architecture.modules.${kind}.${state}`);
  return <span className="architecture-modules__badge mono-value" data-badge={kind} data-state={state} role="img" aria-label={words} title={words}>{GLYPH[state]}</span>;
}

interface DomainData extends Record<string, unknown> { readonly domain: string }
interface ModuleData extends Record<string, unknown> {
  readonly node: ArchitectureMapNodeV1;
  readonly size: { readonly lines: number; readonly files: number } | null;
  readonly layer: MapLayerId;
  readonly slots: readonly Slot[];
  readonly neighbour: Neighbour | null;
  readonly undeclared: UndeclaredEnd | null;
  readonly dimmed: boolean;
  readonly t: OperatorTranslate;
}
interface ExternalData extends Record<string, unknown> { readonly node: ArchitectureMapNodeV1; readonly neighbour: Neighbour | null; readonly dimmed: boolean; readonly t: OperatorTranslate }

const DomainNode = memo(function DomainNode({ data }: NodeProps<Node<DomainData, 'domain'>>) {
  return <div className="architecture-modules__domain" data-domain={data.domain}>
    <SceneHandles />
    <b>{data.domain}</b>
  </div>;
});

const SLOT_LAYERS: readonly MapLayerId[] = ['changes', 'violations', 'pull_requests', 'tests', 'decisions'];
type TestsEntry = Extract<ArchitectureMapV1['layers']['tests'], { state: 'ok' }>['capabilities'][number];
type SlotTone = 'danger' | 'info';

/** One signal slot: `value` is null when the module has nothing to show; `tone` is set only for an actionable state. */
interface Slot { readonly layer: MapLayerId; readonly value: string | null; readonly tone: SlotTone | null; readonly words: string | null }

interface ModuleSignals {
  readonly changes: ModuleMark | undefined;
  readonly violations: number;
  readonly pullRequests: readonly number[];
  readonly tests: TestsEntry | undefined;
  readonly decisions: number;
}

/** Every capability's raw signals, read through the layer views the map already uses. */
function moduleSignals(map: ArchitectureMapV1): ReadonlyMap<string, ModuleSignals> {
  const changes = modulesLayerView(map, 'changes').marks;
  const violations = modulesLayerView(map, 'violations').marks;
  const decisions = modulesLayerView(map, 'decisions').marks;
  const { pull_requests: pullRequests, tests } = map.layers;
  // A PR touches a module when its impact marks the module itself, not only a dependent.
  const touching = (pullRequests.state === 'ok' ? pullRequests.pull_requests : []).map(item => ({ number: item.number, marks: modulesLayerView(map, 'pull_requests', item.number).marks }));
  const results = new Map((tests.state === 'ok' ? tests.capabilities : []).map(entry => [entry.id, entry]));
  return new Map(map.nodes.filter(node => node.kind === 'capability').map((node): [string, ModuleSignals] => [node.id, {
    changes: changes.get(node.id),
    violations: violations.get(node.id)?.count ?? 0,
    pullRequests: touching.filter(item => item.marks.get(node.id)?.tone === 'change').map(item => item.number),
    tests: results.get(node.id),
    decisions: decisions.get(node.id)?.count ?? 0,
  }]));
}

type HoverKey = 'changes' | 'violations' | 'pull_requests' | 'decisions';
function count(t: OperatorTranslate, key: HoverKey, n: number, extra: Record<string, string | number> = {}): string {
  return t(n === 1 ? `architecture.modules.hover.${key}One` : `architecture.modules.hover.${key}`, { count: n, ...extra });
}

/**
 * The five slots in their fixed order. A passing module shows nothing in the tests slot;
 * only a failure or a missing result does. `words` is the hover text.
 */
function slotsOf(signals: ModuleSignals, t: OperatorTranslate): Slot[] {
  const { changes, violations, pullRequests, tests, decisions } = signals;
  const commits = changes?.count ?? 0;
  const mark = changes?.atLeast ? '+' : '';
  return [
    { layer: 'changes', tone: null,
      value: changes === undefined ? null : changes.count === null ? '↳' : commits > 0 ? `${commits}${mark}` : null,
      words: changes === undefined ? null : changes.count === null ? t('architecture.modules.hover.dependent') : commits > 0 ? count(t, 'changes', commits) : null },
    { layer: 'violations', tone: 'danger', value: violations > 0 ? String(violations) : null, words: violations > 0 ? count(t, 'violations', violations) : null },
    { layer: 'pull_requests', tone: 'info', value: pullRequests.length > 0 ? String(pullRequests.length) : null,
      words: pullRequests.length > 0 ? count(t, 'pull_requests', pullRequests.length, { list: pullRequests.map(number => `#${number}`).join(', ') }) : null },
    { layer: 'tests', tone: tests !== undefined && tests.failed > 0 ? 'danger' : null,
      value: tests === undefined ? null : tests.failed > 0 ? `${tests.failed}✕` : tests.no_result > 0 ? '?' : null,
      words: tests === undefined ? null : t('architecture.layer.node.tests', { files: tests.files, passed: tests.passed, failed: tests.failed, skipped: tests.skipped, noResult: tests.no_result }) },
    { layer: 'decisions', tone: null, value: decisions > 0 ? String(decisions) : null, words: decisions > 0 ? count(t, 'decisions', decisions) : null },
  ];
}

/** The slot of the active layer is the only one that carries a color, and only for an actionable state. */
const ModuleNode = memo(function ModuleNode({ data, selected }: NodeProps<Node<ModuleData, 'module'>>) {
  const { node, size, layer, slots, neighbour, undeclared, dimmed, t } = data;
  const alert = slots.find(slot => slot.layer === layer && slot.value !== null)?.tone ?? undefined;
  const words = slots.flatMap(slot => slot.words ?? []).join(' · ');
  return <div className="architecture-modules__box" title={words || undefined} data-selected={selected || undefined} data-layer={layer} data-alert={alert} data-neighbour={neighbour ?? undefined} data-undeclared={undeclared ?? undefined} data-dimmed={dimmed || undefined} data-deprecated={node.status === 'deprecated' || undefined}>
    <span className="architecture-modules__name">
      <strong>{node.name}</strong>
      {node.status === 'deprecated' && <span className="architecture-modules__status">{t('architecture.modules.deprecated')}</span>}
      {neighbour !== null && <StateBadge kind="neighbour" state={neighbour} t={t} />}
      {undeclared !== null && <StateBadge kind="undeclared" state={undeclared} t={t} />}
    </span>
    <span className="architecture-modules__size mono-value">{size === null ? '' : `${compactLines(size.lines)} · ${compactLines(size.files)}`}</span>
    <span className="architecture-modules__slots">
      {slots.map(slot => <span key={slot.layer} className="architecture-modules__slot mono-value" data-slot={slot.layer} data-active={slot.layer === layer || undefined}
        data-tone={slot.layer === layer && slot.value !== null ? slot.tone ?? undefined : undefined}>{slot.value}</span>)}
    </span>
  </div>;
});

const ExternalNode = memo(function ExternalNode({ data, selected }: NodeProps<Node<ExternalData, 'external'>>) {
  return <div className="architecture-modules__external" data-selected={selected || undefined} data-neighbour={data.neighbour ?? undefined} data-dimmed={data.dimmed || undefined}>
    <SceneHandles />
    {data.node.name}
    {data.neighbour !== null && <StateBadge kind="neighbour" state={data.neighbour} t={data.t} />}
  </div>;
});

const NODE_TYPES = { domain: DomainNode, module: ModuleNode, external: ExternalNode };

/** The legend rows of the three direction states of one marker kind. */
const stateRows = (kind: 'neighbour' | 'undeclared', t: OperatorTranslate): SceneLegendEntry[] => (['out', 'in', 'both'] as const).map(state => ({
  key: `${kind}-${state}`, swatch: <span className="architecture-modules__badge mono-value" data-badge={kind} data-state={state} aria-hidden="true">{GLYPH[state]}</span>,
  text: t(`architecture.modules.legend.${kind}.${state}`),
}));

/** The state rows on screen: the undeclared routes and the direction states of the neighbours and the undeclared cards. */
function stateEntries(marks: { readonly routes: boolean; readonly cards: boolean; readonly selection: boolean }, t: OperatorTranslate): SceneLegendEntry[] {
  return [
    ...marks.routes ? [{ key: 'undeclared', swatch: <span className="architecture-map__swatch architecture-map__swatch--undeclared" />, text: t('architecture.layer.legend.undeclared') }] : [],
    ...marks.selection ? stateRows('neighbour', t) : [],
    ...marks.cards ? stateRows('undeclared', t) : [],
  ];
}

/** The state rows below the canvas on a narrow screen, where the canvas legend is hidden. */
function NarrowStates({ entries, t }: { readonly entries: readonly SceneLegendEntry[]; readonly t: OperatorTranslate }) {
  if (entries.length === 0) return null;
  return <dl className="architecture-modules__states" aria-label={t('architecture.map.legend')} data-narrow-legend>
    {entries.map(entry => <div key={entry.key}><dt>{entry.swatch}</dt><dd>{entry.text}</dd></div>)}
  </dl>;
}

/** The legend: the route widths, the undeclared routes, the direction states on screen, the external systems, the card size and the slots. */
function legend(map: ArchitectureMapV1, layout: ModulesLayout, marks: { readonly routes: boolean; readonly cards: boolean; readonly selection: boolean }, layer: MapLayerId, t: OperatorTranslate): SceneLegendEntry[] {
  return [
    ...layout.edges.length > 0 ? [{ key: 'width', swatch: <span aria-hidden="true">→</span>, text: t('architecture.modules.legend.width') }] : [],
    ...stateEntries(marks, t),
    ...layout.externals.length > 0 ? [{ key: 'external', swatch: <span className="architecture-map__swatch architecture-map__swatch--external" />, text: t('architecture.map.legend.external') }] : [],
    ...map.sizes.state === 'ok' ? [{ key: 'lines', swatch: <span className="mono-value" aria-hidden="true">1.2k · 4</span>, text: t('architecture.modules.legend.lines') }] : [],
    { key: 'slots', swatch: <span className="architecture-modules__key mono-value">{SLOT_LAYERS.map(item => <span key={item} data-active={item === layer || undefined}>{t(`architecture.modules.slot.${item}`)}</span>)}</span>, text: '' },
  ];
}

/** One model relation of the selected card or of a node inside it: the direction, the other end as the model names it and the capability that holds it, the kind and the `deps` imports between the two capabilities. */
interface CardRelation { readonly id: string; readonly direction: Direction; readonly other: string; readonly holder: string; readonly kind: string; readonly imports: number | null }

/** Each model relation with an end in `selected` or in a node it holds; a relation with both ends inside it counts as out of its source. */
function cardRelations(map: ArchitectureMapV1, selected: string): CardRelation[] {
  const owners = capabilityOwners(map);
  const lift = (id: string) => owners.get(id) ?? id;
  const imports = new Map(map.dependencies.state === 'ok' ? map.dependencies.edges.map(edge => [`${edge.source}\n${edge.target}`, edge.imports]) : []);
  return map.relations.flatMap((relation): CardRelation[] => {
    const [source, target] = [lift(relation.source), lift(relation.target)];
    const direction: Direction | null = source === selected ? 'out' : target === selected ? 'in' : null;
    if (direction === null) return [];
    return [{
      id: relation.id, direction, other: direction === 'out' ? relation.target : relation.source, holder: direction === 'out' ? target : source, kind: relation.kind,
      imports: source === target ? null : imports.get(`${source}\n${target}`) ?? null,
    }];
  });
}

/** The cards and external systems on the map that a relation joins to `selected`, with the direction; both ends lifted to their capability. */
function neighboursOf(map: ArchitectureMapV1, layout: ModulesLayout, selected: string): ReadonlyMap<string, Neighbour> {
  const owners = capabilityOwners(map);
  const drawn = new Set([...layout.capabilities, ...layout.externals].map(node => node.id));
  const lift = (id: string) => owners.get(id) ?? id;
  const result = new Map<string, Neighbour>();
  for (const relation of map.relations) {
    const [source, target] = [lift(relation.source), lift(relation.target)];
    const direction: Direction | null = source === target ? null : source === selected ? 'out' : target === selected ? 'in' : null;
    const other = direction === 'out' ? target : source;
    if (direction === null || !drawn.has(other)) continue;
    result.set(other, result.has(other) && result.get(other) !== direction ? 'both' : direction);
  }
  return result;
}

function CardRelations({ selected, relations, names, t }: { readonly selected: string; readonly relations: readonly CardRelation[]; readonly names: ReadonlyMap<string, string>; readonly t: OperatorTranslate }) {
  return <>
    <h4>{t('architecture.modules.relations', { count: relations.length })}</h4>
    {relations.length === 0 ? <p className="detail-quiet">{t('architecture.none')}</p> : <ul data-card-relations>{relations.map(row =>
      <li key={row.id} data-relation-id={row.id} data-direction={row.direction}>
        <span className="mono-value">{t(`architecture.modules.direction.${row.direction}`)}</span> {names.get(row.other)}{row.holder !== row.other && row.holder !== selected && <> ({names.get(row.holder)})</>} · <code>{row.kind}</code>
        {row.imports !== null && <span className="mono-value"> · {t('architecture.map.imports', { count: row.imports })}</span>}
      </li>)}</ul>}
  </>;
}

/** The commits of today's changes that touch a node of `ids`, newest first, as git gives them. */
function TodayCommits({ map, ids, t }: { readonly map: ArchitectureMapV1; readonly ids: ReadonlySet<string>; readonly t: OperatorTranslate }) {
  const { changes } = map.layers;
  if (changes.state === 'unavailable') {
    return <p className="detail-quiet" data-module-gap="changes">{changes.reason === 'archctx_error'
      ? t('architecture.layer.changes.archctx_error', { code: archctxCode(changes) }) : t(`architecture.layer.changes.${changes.reason}`)}</p>;
  }
  const commits = changes.commits.filter(commit => commit.nodes.some(id => ids.has(id)));
  return commits.length ? <ul data-module-commits>{commits.map(commit => <li key={commit.sha} data-commit={commit.sha}>
    <code>{commit.sha.slice(0, 7)}</code> {commit.subject}
  </li>)}</ul> : <p className="detail-quiet">{t('architecture.modules.changes.none')}</p>;
}

/** Where the chosen PR reaches this capability: its files, the flow steps it reaches here, and the capabilities downstream. */
function PullRequestImpact({ map, pullRequest, ids, capability, t }: {
  readonly map: ArchitectureMapV1;
  readonly pullRequest: number | null;
  readonly ids: ReadonlySet<string>;
  readonly capability: string;
  readonly t: OperatorTranslate;
}) {
  const { pull_requests: pullRequests } = map.layers;
  if (pullRequests.state === 'unavailable') return <p className="detail-quiet" data-module-gap="pull_requests">{t(`architecture.layer.pull_requests.${pullRequests.reason}`)}</p>;
  const chosen = pullRequests.pull_requests.find(item => item.number === pullRequest);
  if (chosen === undefined) return <p className="detail-quiet">{t('architecture.inspector.none')}</p>;
  const { impact } = chosen;
  if (impact.state === 'unavailable') {
    return <p className="detail-quiet" data-module-gap="pull_request">{impact.reason === 'archctx_error'
      ? t('architecture.layer.pull_requests.pr.archctx_error', { code: archctxCode(impact) }) : t(`architecture.layer.pull_requests.pr.${impact.reason}`)}</p>;
  }
  const names = new Map(map.nodes.map(node => [node.id, node.name]));
  const owners = capabilityOwners(map);
  const facts: { readonly key: string; readonly text: string }[] = [];
  const files = impactPaths(impact, ids);
  if (files > 0) facts.push({ key: 'files', text: t('architecture.modules.impact.files', { files: counted(t, files, 'file', impact.truncated.paths) }) });
  const targets = [...ids].flatMap(id => impactTargets(impact, id)).filter(id => !ids.has(id));
  if (targets.length > 0) facts.push({ key: 'targets', text: t('architecture.layer.node.dependent', { names: [...new Set(targets)].map(id => names.get(id) ?? id).join(', ') }) });
  const flows = new Map(map.flows.map(flow => [flow.id, flow]));
  for (const item of impact.flow_steps.items ?? []) {
    const flow = flows.get(item.flow);
    if (flow === undefined || flow.applicability !== 'required') continue;
    const steps = flowSteps(flow);
    const index = steps.findIndex(entry => entry.outcome === item.outcome && entry.step.id === item.step);
    const nodes = new Map(flow.participants.map(participant => [participant.id, participant.node]));
    const step = steps[index]?.step;
    if (step !== undefined && [step.from, step.to].some(id => ids.has(nodes.get(id)!))) {
      facts.push({ key: `step-${item.flow}-${item.outcome ?? ''}-${item.step}`, text: t('architecture.modules.impact.step', { flow: flow.name, step: index + 1 }) });
    }
  }
  const downstream = [...new Set(impact.dependents.filter(entry => ids.has(entry.touched)).flatMap(entry => owners.get(entry.id) ?? []))].filter(id => id !== capability);
  if (downstream.length > 0) facts.push({ key: 'downstream', text: t('architecture.modules.impact.downstream', { count: downstream.length, names: downstream.map(id => names.get(id) ?? id).join(', ') }) });
  return facts.length ? <ul data-module-impact={chosen.number}>{facts.map(fact => <li key={fact.key}>{fact.text}</li>)}</ul>
    : <p className="detail-quiet">{t('architecture.modules.impact.none', { number: chosen.number })}</p>;
}

function ModuleTests({ map, capability, t }: { readonly map: ArchitectureMapV1; readonly capability: string; readonly t: OperatorTranslate }) {
  const { tests } = map.layers;
  if (tests.state === 'unavailable') return <p className="detail-quiet" data-module-gap="tests">{t(`architecture.layer.tests.${tests.reason}`)}</p>;
  const entry = tests.capabilities.find(item => item.id === capability);
  return entry === undefined ? <p className="detail-quiet">{t('architecture.modules.tests.none')}</p>
    : <p data-module-tests>{t('architecture.layer.node.tests', { files: entry.files, passed: entry.passed, failed: entry.failed, skipped: entry.skipped, noResult: entry.no_result })}</p>;
}

/** The inspector body of one capability, in the artboard's order. A fact on one of its components counts for it. */
function ModuleDetails({ map, pullRequest, node, relations, onModule, t }: {
  readonly map: ArchitectureMapV1;
  readonly pullRequest: number | null;
  readonly node: ArchitectureMapNodeV1;
  readonly relations: readonly CardRelation[];
  readonly onModule: (id: string) => void;
  readonly t: OperatorTranslate;
}) {
  const names = useMemo(() => new Map(map.nodes.map(entry => [entry.id, entry.name])), [map]);
  const ids = useMemo(() => {
    const owners = capabilityOwners(map);
    return new Set(map.nodes.flatMap(entry => owners.get(entry.id) === node.id ? [entry.id] : []));
  }, [map, node.id]);
  const size = nodeSize(map, node.id);
  const facts = violationFacts(map, ids, names, t);
  const parts = [...new Set(facts.flatMap(fact => fact.part ?? []))];
  const decisions = map.layers.decisions.items.filter(item => item.applies_to.some(id => ids.has(id)));
  return <>
    <div className="architecture-modules__heading">
      <span className="architecture-modules__eyebrow" data-module-domain>{node.domain}</span>
      <h3>{node.name}</h3>
      <span className="architecture-map__id mono-value">{node.id}{map.sizes.state === 'ok' && <> · <span data-node-size>{size === null
        ? t('architecture.map.noSize') : t('architecture.map.sizeValue', { lines: size.lines, files: size.files })}</span></>}</span>
    </div>
    <h4>{t('architecture.layer.changes')}</h4>
    <TodayCommits map={map} ids={ids} t={t} />
    <h4>{t('architecture.layer.violations')}</h4>
    {facts.length ? <FactList facts={facts} layer="violations" source /> : <p className="detail-quiet">{t('architecture.inspector.none')}</p>}
    <h4>{pullRequest === null ? t('architecture.layer.pull_requests') : t('architecture.modules.impact.title', { number: pullRequest })}</h4>
    <PullRequestImpact map={map} pullRequest={pullRequest} ids={ids} capability={node.id} t={t} />
    <h4>{t('architecture.layer.tests')}</h4>
    <ModuleTests map={map} capability={node.id} t={t} />
    <h4>{t('architecture.layer.decisions')}</h4>
    {decisions.length ? <ul data-module-decisions>{decisions.map(item => <li key={item.id}>
      {item.status === null ? item.title : t('architecture.layer.node.decision', { title: item.title, status: item.status })} · <code>{item.path}</code>
    </li>)}</ul> : <p className="detail-quiet">{t('architecture.inspector.none')}</p>}
    {parts.length > 0 && <>
      <h4>{t('architecture.modules.fix')}</h4>
      {parts.map(part => <FixCommand key={part} part={part} t={t} />)}
    </>}
    <button type="button" className="operator-button operator-button--secondary" onClick={() => onModule(node.id)}>{t('architecture.map.open')}</button>
    <CardRelations selected={node.id} relations={relations} names={names} t={t} />
  </>;
}

/** The module base map. `side` leads the side panel. `selectedId` is the selected model node, which the map view holds. */
export function ArchitectureModules({ map, layer, pullRequest, selectedId, onSelect, side, onModule, t }: {
  readonly map: ArchitectureMapV1;
  readonly layer: MapLayerId;
  readonly pullRequest: number | null;
  readonly selectedId: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly side: ReactNode;
  readonly onModule: (id: string) => void;
  readonly t: OperatorTranslate;
}) {
  const layout = useMemo(() => layoutModules(map), [map]);
  const view = useMemo(() => modulesLayerView(map, layer, pullRequest), [map, layer, pullRequest]);
  const { scene, cards: undeclared } = useMemo(() => markUndeclared(layout, view.edges), [layout, view]);
  const nodes = useMemo(() => new Map(map.nodes.map(node => [node.id, node])), [map]);
  const sizes = useMemo(() => new Map(map.sizes.state === 'ok' ? map.sizes.nodes.map(entry => [entry.id, { lines: entry.lines, files: entry.files }]) : []), [map]);
  const signals = useMemo(() => moduleSignals(map), [map]);
  const imports = useMemo(() => new Map(layout.edges.map(edge => [edge.id, edge.imports])), [layout]);
  const selected = selectedId === null ? null : nodes.get(selectedId) ?? null;
  const relations = useMemo(() => selected === null ? [] : cardRelations(map, selected.id), [map, selected]);
  // Selection adds no route: it lights the in and out neighbours and dims every other card.
  const neighbours = useMemo(() => selected === null ? new Map<string, Neighbour>() : neighboursOf(map, layout, selected.id), [map, layout, selected]);

  const nodeView = useCallback((box: SceneBox): SceneNodeView => {
    if (box.parent === null && box.kind === 'frame') {
      const domain = box.id.slice(domainId('').length);
      return { type: 'domain', ariaLabel: domain, selection: null, data: { domain } satisfies DomainData };
    }
    const node = nodes.get(box.id)!;
    const neighbour = neighbours.get(node.id) ?? null;
    const dimmed = selectedId !== null && node.id !== selectedId && neighbour === null;
    const mark = undeclared.get(node.id) ?? null;
    const ariaLabel = [`${node.kind} ${node.name}`, ...neighbour === null ? [] : [t(`architecture.modules.neighbour.${neighbour}`)], ...mark === null ? [] : [t(`architecture.modules.undeclared.${mark}`)]].join(' · ');
    if (node.kind === 'external-system') return { type: 'external', ariaLabel, selection: node.id, data: { node, neighbour, dimmed, t } satisfies ExternalData };
    return {
      type: 'module', ariaLabel, selection: node.id,
      data: { node, size: sizes.get(node.id) ?? null, layer, slots: slotsOf(signals.get(node.id)!, t), neighbour, undeclared: mark, dimmed, t } satisfies ModuleData,
    };
  }, [nodes, neighbours, undeclared, selectedId, sizes, signals, layer, t]);

  const marks = { routes: scene !== layout.scene, cards: undeclared.size > 0, selection: neighbours.size > 0 };
  // A route joins domains, so a selected card lights the routes of its domain; an external system lights its own.
  const emphasis = selected === null ? null : selected.kind === 'capability' ? domainId(selected.domain!) : selected.id;
  const routeLabel = useCallback((route: SceneRoute) => {
    const name = (id: string) => id.startsWith(domainId('')) ? id.slice(domainId('').length) : nodes.get(id)?.name ?? id;
    const words = { source: name(route.source), target: name(route.target) };
    if (route.kind === 'relation') return t('architecture.modules.route.relation', words);
    return route.kind === 'undeclared' ? t('architecture.modules.route.undeclared', words) : t('architecture.modules.route.imports', { ...words, count: imports.get(route.id)! });
  }, [nodes, imports, t]);

  return <div className="architecture-map" data-view="modules" data-node-count={map.nodes.length} data-relation-count={map.relations.length} data-edge-count={layout.edges.length} data-layer={layer}>
    <ArchitectureSceneCanvas label={t('architecture.map.label')} scene={scene} nodeTypes={NODE_TYPES} view={nodeView}
      selected={selectedId} emphasis={emphasis} routeLabel={routeLabel} onSelect={onSelect}
      legend={legend(map, layout, marks, layer, t)} t={t} />
    <NarrowStates entries={stateEntries(marks, t)} t={t} />
    <aside className="architecture-map__inspector" aria-label={t('architecture.map.inspector')} data-node-id={selected?.id}>
      {side}
      {selected === null ? <>
        <p className="detail-quiet">{t('architecture.map.pick')}</p>
        <p className="detail-quiet">{t('architecture.map.counts', { nodes: counted(t, map.nodes.length, 'node'), relations: counted(t, map.relations.length, 'relation') })}</p>
      </> : selected.kind === 'capability'
        ? <ModuleDetails map={map} pullRequest={pullRequest} node={selected} relations={relations} onModule={onModule} t={t} />
        : <NodeDetails map={map} layer={layer} pullRequest={pullRequest} nodeId={selected.id} onModule={onModule} t={t} />}
    </aside>
  </div>;
}
