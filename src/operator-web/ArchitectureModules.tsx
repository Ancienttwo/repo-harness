// The module base map (the ArchModules artboard): the model's capabilities in
// their domain groups, the external systems above them, one edge per domain pair
// weighted by imports, and one card per capability with five fixed signal slots. The
// inspector shows one capability's changes, violations, PR impact, tests and
// decisions. Every value is the collector's; this view computes only roll-ups.

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
import { flowSteps, type ArchitectureMapNodeV1, type ArchitectureMapV1 } from '../core/operator/architecture-map';
import { archctxCode, capabilityOwners, impactPaths, impactTargets, modulesLayerView, type MapLayerId, type ModuleMark, type ModulesLayerView } from './architecture-map-layers';
import { contentBox, counted, FactList, FirstViewport, FixCommand, NodeDetails, NodeRelations, nodeSize, violationFacts, ZoomControls } from './architecture-map-parts';
import { layoutModules, type DomainSide, type ModulesLayout } from './architecture-modules-layout';
import type { OperatorTranslate } from './i18n';

const SIDES: readonly [DomainSide, Position][] = [['top', Position.Top], ['right', Position.Right], ['bottom', Position.Bottom], ['left', Position.Left]];
const domainId = (domain: string) => `domain:${domain}`;
/** "14.2k" for 14 200 lines. */
const compactLines = (lines: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(lines).toLowerCase();

interface DomainData extends Record<string, unknown> { readonly domain: string }
interface ModuleData extends Record<string, unknown> {
  readonly node: ArchitectureMapNodeV1;
  readonly size: { readonly lines: number; readonly files: number } | null;
  readonly layer: MapLayerId;
  readonly slots: readonly Slot[];
  readonly dimmed: boolean;
  readonly t: OperatorTranslate;
}
interface ExternalData extends Record<string, unknown> { readonly node: ArchitectureMapNodeV1; readonly dimmed: boolean }
type ModulesNode = Node<DomainData, 'domain'> | Node<ModuleData, 'module'> | Node<ExternalData, 'external'>;

/** Handles exist for edge routing only; the map is read-only, so they accept no connection. */
const DomainNode = memo(function DomainNode({ data }: NodeProps<Node<DomainData, 'domain'>>) {
  return <div className="architecture-modules__domain" data-domain={data.domain}>
    {SIDES.map(([side, position]) => <span key={side}>
      <Handle id={`s-${side}`} type="source" position={position} isConnectable={false} />
      <Handle id={`t-${side}`} type="target" position={position} isConnectable={false} />
    </span>)}
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
  const { node, size, layer, slots, dimmed, t } = data;
  const alert = slots.find(slot => slot.layer === layer && slot.value !== null)?.tone ?? undefined;
  const words = slots.flatMap(slot => slot.words ?? []).join(' · ');
  return <div className="architecture-modules__box" title={words || undefined} data-selected={selected || undefined} data-layer={layer} data-alert={alert} data-dimmed={dimmed || undefined} data-deprecated={node.status === 'deprecated' || undefined}>
    <Handle type="target" position={Position.Top} isConnectable={false} />
    <Handle type="source" position={Position.Bottom} isConnectable={false} />
    <span className="architecture-modules__name">
      <strong>{node.name}</strong>
      {node.status === 'deprecated' && <span className="architecture-modules__status">{t('architecture.modules.deprecated')}</span>}
    </span>
    <span className="architecture-modules__size mono-value">{size === null ? '' : `${compactLines(size.lines)} · ${compactLines(size.files)}`}</span>
    <span className="architecture-modules__slots">
      {slots.map(slot => <span key={slot.layer} className="architecture-modules__slot mono-value" data-slot={slot.layer} data-active={slot.layer === layer || undefined}
        data-tone={slot.layer === layer && slot.value !== null ? slot.tone ?? undefined : undefined}>{slot.value}</span>)}
    </span>
  </div>;
});

/** Handles exist so that a selected relation can reach an external system; the map accepts no connection. */
const ExternalNode = memo(function ExternalNode({ data, selected }: NodeProps<Node<ExternalData, 'external'>>) {
  return <div className="architecture-modules__external" data-selected={selected || undefined} data-dimmed={data.dimmed || undefined}>
    <Handle type="target" position={Position.Top} isConnectable={false} />
    <Handle type="source" position={Position.Bottom} isConnectable={false} />
    {data.node.name}
  </div>;
});

const NODE_TYPES = { domain: DomainNode, module: ModuleNode, external: ExternalNode };

function Legend({ map, layout, view, layer, t }: { readonly map: ArchitectureMapV1; readonly layout: ModulesLayout; readonly view: ModulesLayerView; readonly layer: MapLayerId; readonly t: OperatorTranslate }) {
  return <dl className="architecture-map__legend" aria-label={t('architecture.map.legend')}>
    {layout.edges.length > 0 && <div><dt aria-hidden="true">↔</dt><dd>{t('architecture.modules.legend.width')}</dd></div>}
    {view.edges.length > 0 && <div><dt><span className="architecture-map__swatch architecture-map__swatch--undeclared" /></dt><dd>{t('architecture.layer.legend.undeclared')}</dd></div>}
    {layout.externals.length > 0 && <div><dt><span className="architecture-map__swatch architecture-map__swatch--external" /></dt><dd>{t('architecture.map.legend.external')}</dd></div>}
    {map.sizes.state === 'ok' && <div><dt className="mono-value" aria-hidden="true">1.2k · 4</dt><dd>{t('architecture.modules.legend.lines')}</dd></div>}
    <div><dt className="architecture-modules__key mono-value">{SLOT_LAYERS.map(item => <span key={item} data-active={item === layer || undefined}>{t(`architecture.modules.slot.${item}`)}</span>)}</dt></div>
  </dl>;
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
function ModuleDetails({ map, pullRequest, node, onModule, t }: {
  readonly map: ArchitectureMapV1;
  readonly pullRequest: number | null;
  readonly node: ArchitectureMapNodeV1;
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
    <NodeRelations map={map} nodeId={node.id} names={names} t={t} />
  </>;
}

function ModulesCanvas({ map, layer, pullRequest, side, onModule, t }: {
  readonly map: ArchitectureMapV1;
  readonly layer: MapLayerId;
  readonly pullRequest: number | null;
  readonly side: ReactNode;
  readonly onModule: (id: string) => void;
  readonly t: OperatorTranslate;
}) {
  const layout = useMemo(() => layoutModules(map), [map]);
  const view = useMemo(() => modulesLayerView(map, layer, pullRequest), [map, layer, pullRequest]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const domains = useMemo(() => new Map(layout.domains.map(item => [item.domain, item])), [layout]);
  const sizes = useMemo(() => new Map(map.sizes.state === 'ok' ? map.sizes.nodes.map(entry => [entry.id, { lines: entry.lines, files: entry.files }]) : []), [map]);
  const signals = useMemo(() => moduleSignals(map), [map]);
  // The selected card keeps its declared relations one hop away; both ends are lifted to the capability that holds them.
  const neighbours = useMemo(() => {
    const owners = capabilityOwners(map);
    const drawn = new Set([...layout.capabilities.map(item => item.node.id), ...layout.externals.map(item => item.node.id)]);
    const lift = (id: string) => owners.get(id) ?? id;
    return new Set(selectedId === null ? [] : map.relations.flatMap(relation => {
      const [source, target] = [lift(relation.source), lift(relation.target)];
      const other = source === selectedId ? target : target === selectedId ? source : null;
      return other !== null && other !== selectedId && drawn.has(other) ? [other] : [];
    }));
  }, [map, layout, selectedId]);
  const dimmed = (id: string) => selectedId !== null && id !== selectedId && !neighbours.has(id);

  const nodes = useMemo<ModulesNode[]>(() => [
    ...layout.externals.map((item): ModulesNode => ({
      id: item.node.id, type: 'external', position: { x: item.x, y: item.y }, width: item.width, height: item.height,
      data: { node: item.node, dimmed: dimmed(item.node.id) }, draggable: false, connectable: false, selected: item.node.id === selectedId, ariaLabel: `${item.node.kind} ${item.node.name}`,
    })),
    ...layout.domains.map((item): ModulesNode => ({
      id: domainId(item.domain), type: 'domain', position: { x: item.x, y: item.y }, width: item.width, height: item.height,
      data: { domain: item.domain }, draggable: false, connectable: false, selectable: false, focusable: false,
    })),
    ...layout.capabilities.map((item): ModulesNode => {
      const group = domains.get(item.domain)!;
      return {
        id: item.node.id, type: 'module', parentId: domainId(item.domain), position: { x: item.x - group.x, y: item.y - group.y }, width: item.width, height: item.height,
        data: { node: item.node, size: sizes.get(item.node.id) ?? null, layer, slots: slotsOf(signals.get(item.node.id)!, t), dimmed: dimmed(item.node.id), t },
        draggable: false, connectable: false, selected: item.node.id === selectedId, ariaLabel: `${item.node.kind} ${item.node.name}`,
      };
    }),
  ], [layout, domains, sizes, signals, layer, neighbours, selectedId, t]);

  const edges = useMemo<Edge[]>(() => [
    ...layout.edges.map((edge): Edge => ({
      id: `domains:${edge.source}--${edge.target}`, source: domainId(edge.source), target: domainId(edge.target),
      sourceHandle: `s-${edge.sourceSide}`, targetHandle: `t-${edge.targetSide}`,
      className: 'architecture-map__edge architecture-modules__edge', style: { strokeWidth: edge.strokeWidth },
      label: String(edge.imports), selectable: false, focusable: false, zIndex: 1,
    })),
    // An undeclared import has no model relation, so it gets its own id and stays above the domain edges.
    ...view.edges.map((edge): Edge => ({
      id: `undeclared:${edge.source}->${edge.target}`, source: edge.source, target: edge.target,
      className: 'architecture-map__edge architecture-map__edge--undeclared', style: { strokeDasharray: '4 3' },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: 'var(--text-color-kumo-danger)' },
      label: String(edge.imports), selectable: false, focusable: false, zIndex: 3,
    })),
    ...[...neighbours].map((id): Edge => ({
      id: `relation:${selectedId}->${id}`, source: selectedId!, target: id,
      className: 'architecture-map__edge architecture-modules__relation', selectable: false, focusable: false, zIndex: 2,
    })),
  ], [layout, view, neighbours, selectedId]);

  // Selection is the only node change the read-only map applies; click and the keyboard both arrive here.
  const onNodesChange = useCallback((changes: NodeChange<ModulesNode>[]) => {
    const chosen = changes.find(change => change.type === 'select' && change.selected);
    if (chosen && 'id' in chosen) setSelectedId(chosen.id);
    else if (changes.some(change => change.type === 'select')) setSelectedId(null);
  }, []);

  const content = useMemo(() => contentBox([...layout.externals, ...layout.domains]), [layout]);
  const selected = selectedId === null ? null : map.nodes.find(node => node.id === selectedId) ?? null;
  return <div className="architecture-map" data-view="modules" data-node-count={map.nodes.length} data-relation-count={map.relations.length} data-layer={layer}>
    <div className="architecture-map__canvas" aria-label={t('architecture.map.label')} role="region">
      <ReactFlow<ModulesNode, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
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
        <Panel position="bottom-left"><Legend map={map} layout={layout} view={view} layer={layer} t={t} /></Panel>
        <Panel position="bottom-right"><ZoomControls t={t} /></Panel>
      </ReactFlow>
    </div>
    <aside className="architecture-map__inspector" aria-label={t('architecture.map.inspector')} data-node-id={selected?.id}>
      {side}
      {selected === null ? <>
        <p className="detail-quiet">{t('architecture.map.pick')}</p>
        <p className="detail-quiet">{t('architecture.map.counts', { nodes: counted(t, map.nodes.length, 'node'), relations: counted(t, map.relations.length, 'relation') })}</p>
      </> : selected.kind === 'capability'
        ? <ModuleDetails map={map} pullRequest={pullRequest} node={selected} onModule={onModule} t={t} />
        : <NodeDetails map={map} layer={layer} pullRequest={pullRequest} nodeId={selected.id} onModule={onModule} t={t} />}
    </aside>
  </div>;
}

/** The module base map. `side` leads the side panel. */
export function ArchitectureModules({ map, layer, pullRequest, side, onModule, t }: {
  readonly map: ArchitectureMapV1;
  readonly layer: MapLayerId;
  readonly pullRequest: number | null;
  readonly side: ReactNode;
  readonly onModule: (id: string) => void;
  readonly t: OperatorTranslate;
}) {
  return <ReactFlowProvider><ModulesCanvas key={map.commit} map={map} layer={layer} pullRequest={pullRequest} side={side} onModule={onModule} t={t} /></ReactFlowProvider>;
}
