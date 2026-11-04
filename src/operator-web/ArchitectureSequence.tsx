import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import { Background, BackgroundVariant, Panel, ReactFlow, ReactFlowProvider, type Node, type NodeChange, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import {
  flowSelectorKey,
  flowSteps,
  type ArchitectureFlowEvidenceV1,
  type ArchitectureMapFlowStepV1,
  type ArchitectureMapFlowV1,
  type ArchitectureMapV1,
} from '../core/operator/architecture-map';
import { archctxCode, mapLayerView, type MapLayerId, type MapMark } from './architecture-map-layers';
import { firstViewport, FixCommand, Mark, NodeDetails, Note, nodeSize, ZoomControls } from './architecture-map-parts';
import { runtimePlacement, type RuntimePlacement } from './architecture-runtime';
import { layoutSequence, SEQUENCE_COLUMN, SEQUENCE_HEADER, type SequenceBox } from './architecture-sequence-layout';
import { sequenceSvg } from './architecture-sequence-svg';
import type { OperatorTranslate } from './i18n';

type RequiredFlow = Extract<ArchitectureMapFlowV1, { applicability: 'required' }>;
type MessageTone = 'change' | 'danger';

const stepKey = (flowId: string, outcome: string | null, step: string) => `${flowId}\0${outcome ?? ''}\0${step}`;

/** Flow steps that the active layer reaches: archctx's impact steps for today or the chosen PR. */
function reachedSteps(map: ArchitectureMapV1, layer: MapLayerId, pullRequest: number | null): ReadonlySet<string> {
  const { changes, pull_requests: pullRequests } = map.layers;
  const impact = layer === 'changes' ? (changes.state === 'ok' ? changes : null)
    : layer === 'pull_requests' && pullRequests.state === 'ok' ? pullRequests.pull_requests.find(entry => entry.number === pullRequest)?.impact ?? null : null;
  if (impact === null || impact.state === 'unavailable') return new Set();
  return new Set((impact.flow_steps.items ?? []).map(item => stepKey(item.flow, item.outcome, item.step)));
}

/** archctx's proof status of each step selector, when `flows check` answered. */
function proofs(map: ArchitectureMapV1): ReadonlyMap<string, string> | null {
  const { flows } = map.layers.violations;
  return flows.state === 'ok' ? new Map(flows.evidence.map(entry => [flowSelectorKey(entry), entry.status])) : null;
}

function messageTone(layer: MapLayerId, reached: ReadonlySet<string>, proven: ReadonlyMap<string, string> | null, flowId: string, outcome: string | null, step: ArchitectureMapFlowStepV1): MessageTone | null {
  if (reached.has(stepKey(flowId, outcome, step.id))) return 'change';
  const status = proven?.get(flowSelectorKey(step.evidence));
  return layer === 'violations' && status !== undefined && status !== 'proven' ? 'danger' : null;
}

/** The flows with a step that the active layer marks. */
function litFlows(map: ArchitectureMapV1, layer: MapLayerId, reached: ReadonlySet<string>, proven: ReadonlyMap<string, string> | null): ReadonlySet<string> {
  return new Set(map.flows.filter(flow => flowSteps(flow).some(({ outcome, step }) => messageTone(layer, reached, proven, flow.id, outcome, step) !== null)).map(flow => flow.id));
}

/** The flow the canvas opens on: the first one the active layer reaches, else the first flow with steps. */
function firstFlow(map: ArchitectureMapV1, layer: MapLayerId, reached: ReadonlySet<string>, proven: ReadonlyMap<string, string> | null): string | null {
  const required = map.flows.filter((flow): flow is RequiredFlow => flow.applicability === 'required');
  const lit = litFlows(map, layer, reached, proven);
  return (required.find(flow => lit.has(flow.id)) ?? required[0] ?? map.flows[0])?.id ?? null;
}

interface BoxData extends Record<string, unknown> { readonly box: SequenceBox; readonly title: string; readonly reason: string | null }
interface FragmentData extends Record<string, unknown> { readonly kind: 'success' | 'error'; readonly index: number; readonly label: string }
interface HeaderData extends Record<string, unknown> { readonly name: string; readonly kind: string; readonly mark: MapMark | null; readonly quiet: boolean }
interface MessageData extends Record<string, unknown> { readonly label: string; readonly direction: 'right' | 'left' | 'self'; readonly tone: MessageTone | null; readonly status: string | null }
interface TerminalData extends Record<string, unknown> { readonly kind: 'success' | 'error'; readonly label: string }
type SequenceNode = Node<BoxData, 'box'> | Node<FragmentData, 'fragment'> | Node<HeaderData, 'header'> | Node<Record<string, never>, 'lifeline'> | Node<MessageData, 'message'> | Node<TerminalData, 'terminal'>;

const BoxNode = memo(function BoxNode({ data }: NodeProps<Node<BoxData, 'box'>>) {
  return <div className="architecture-sequence__box" data-placement={data.box.placement.kind} data-reason={data.reason ?? undefined} title={data.reason ?? undefined}><span>{data.title}</span></div>;
});
const FragmentNode = memo(function FragmentNode({ data }: NodeProps<Node<FragmentData, 'fragment'>>) {
  return <div className="architecture-sequence__fragment" data-kind={data.kind}><span className="mono-value">{data.index === 0 ? 'alt' : 'else'}</span> {data.label}</div>;
});
const HeaderNode = memo(function HeaderNode({ data, selected }: NodeProps<Node<HeaderData, 'header'>>) {
  return <div className="architecture-map__box architecture-sequence__header" data-kind={data.kind} data-selected={selected || undefined} data-tone={data.mark?.tone} data-quiet={data.quiet || undefined}>
    <span className="architecture-map__title"><strong title={data.name}>{data.name}</strong><Mark mark={data.mark} /></span>
  </div>;
});
const LifelineNode = memo(function LifelineNode() { return <div className="architecture-sequence__lifeline" />; });
const MessageNode = memo(function MessageNode({ data, selected }: NodeProps<Node<MessageData, 'message'>>) {
  return <div className="architecture-sequence__message" data-direction={data.direction} data-tone={data.tone ?? undefined} data-selected={selected || undefined}>
    <span className="architecture-sequence__label" title={data.label}>{data.label}{data.tone === 'danger' && data.status && <span className="architecture-map__mark mono-value" data-tone="danger">{data.status}</span>}</span>
    <span className="architecture-sequence__arrow" aria-hidden="true" />
  </div>;
});
const TerminalNode = memo(function TerminalNode({ data }: NodeProps<Node<TerminalData, 'terminal'>>) {
  return <div className="architecture-sequence__terminal" data-kind={data.kind} title={data.label}>{data.label}</div>;
});
const NODE_TYPES = { box: BoxNode, fragment: FragmentNode, header: HeaderNode, lifeline: LifelineNode, message: MessageNode, terminal: TerminalNode };

function placementText(placement: RuntimePlacement, names: ReadonlyMap<string, string>, t: OperatorTranslate): string {
  return placement.kind === 'process' ? names.get(placement.process) ?? placement.process
    : placement.kind === 'external' ? t('architecture.sequence.external') : t(`architecture.runtime.${placement.reason}`);
}

function Evidence({ evidence, t }: { readonly evidence: ArchitectureFlowEvidenceV1 | undefined; readonly t: OperatorTranslate }) {
  if (evidence === undefined) return <p className="architecture-map__gap" data-gap="evidence" data-reason="selector_undeclared">{t('architecture.sequence.evidence.undeclared')}</p>;
  const path = (value: string | null) => value === null ? <span data-path-withheld>{t('architecture.sequence.evidence.withheld')}</span> : <code>{value}</code>;
  return <ul className="architecture-sequence__code" data-step-evidence>
    <li>{path(evidence.source_path)} <code>{evidence.source_symbol}</code></li>
    <li>→ {path(evidence.sink_path)} <code>{evidence.sink_symbol}</code></li>
  </ul>;
}

/** The inspector body of one message (PRD 2-ARCH-P2). */
function StepDetails({ map, flow, outcome, step, t }: {
  readonly map: ArchitectureMapV1;
  readonly flow: RequiredFlow;
  readonly outcome: string | null;
  readonly step: ArchitectureMapFlowStepV1;
  readonly t: OperatorTranslate;
}) {
  const names = new Map(map.nodes.map(node => [node.id, node.name]));
  const participants = new Map(flow.participants.map(participant => [participant.id, participant.node]));
  const from = participants.get(step.from)!;
  const to = participants.get(step.to)!;
  const key = flowSelectorKey(step.evidence);
  const evidence = map.flow_evidence.find(entry => flowSelectorKey(entry) === key);
  const { flows } = map.layers.violations;
  const proof = flows.state === 'ok' ? flows.evidence.find(entry => flowSelectorKey(entry) === key) ?? null : null;
  const status = proof?.status ?? null;
  const imports = map.dependencies.state === 'ok' ? map.dependencies.edges : [];
  const between = map.relations.filter(relation => (relation.source === from && relation.target === to) || (relation.source === to && relation.target === from));
  const { changes, pull_requests: pullRequests } = map.layers;
  const reaches = (items: readonly { flow: string; outcome: string | null; step: string }[] | null) => (items ?? []).some(item => item.flow === flow.id && item.outcome === outcome && item.step === step.id);
  const today = changes.state === 'ok' && reaches(changes.flow_steps.items);
  const prs = pullRequests.state === 'ok' ? pullRequests.pull_requests.filter(pr => pr.impact.state === 'ok' && reaches(pr.impact.flow_steps.items)) : [];
  const size = (nodeId: string) => {
    const value = nodeSize(map, nodeId);
    return map.sizes.state !== 'ok' ? null : value === null ? t('architecture.map.noSize') : t('architecture.map.sizeValue', { lines: value.lines, files: value.files });
  };
  return <>
    <h4>{t('architecture.sequence.selected')}</h4>
    <h3 data-step-title>{names.get(from)} → {names.get(to)}</h3>
    <p>{step.label}</p>
    <code className="architecture-map__id">{flow.id} · {outcome ?? t('architecture.sequence.main')} · {step.id}</code>
    <dl className="detail-list">
      {[from, to].map((nodeId, index) => <div key={index}><dt>{t(index === 0 ? 'architecture.sequence.from' : 'architecture.sequence.to')}</dt><dd>
        {names.get(nodeId)}{size(nodeId) !== null && <span className="detail-quiet" data-node-size> · {size(nodeId)}</span>}
      </dd></div>)}
    </dl>
    <h4>{t('architecture.sequence.evidence')}</h4>
    <Evidence evidence={evidence} t={t} />
    <h4>{t('architecture.sequence.proof')}</h4>
    {flows.state === 'ok'
      ? <p data-step-proof={status ?? 'missing'}>{status === null ? t('architecture.sequence.proof.missing') : t(status === 'proven' ? 'architecture.sequence.proof.proven' : 'architecture.sequence.proof.unproven', { status })}</p>
      : <p className="architecture-map__gap" data-gap="proof" data-reason={flows.reason} data-code={flows.reason === 'archctx_error' ? archctxCode(flows) : undefined}>
        {flows.reason === 'archctx_error' ? t('architecture.layer.reason.archctx_error', { code: archctxCode(flows) }) : t(`architecture.layer.reason.${flows.reason}`)}
      </p>}
    {proof !== null && proof.call_sites.length > 0 && <ul className="architecture-sequence__code" data-call-sites aria-label={t('architecture.sequence.callSites')}>
      {proof.call_sites.map(site => <li key={`${site.path}:${site.line ?? ''}`}><code>{site.line === null ? site.path : `${site.path}:${site.line}`}</code></li>)}
    </ul>}
    {status !== 'proven' && <FixCommand part="flows" t={t} />}
    <h4>{t('architecture.inspector.pullRequests')}</h4>
    {today && <p data-step-today>{t('architecture.sequence.today')}</p>}
    {prs.length ? <ul data-related-prs>{prs.map(pr => <li key={pr.number}><a href={pr.url} target="_blank" rel="noreferrer">#{pr.number}</a> {pr.title}</li>)}</ul>
      : <p className="detail-quiet">{pullRequests.state === 'unavailable' ? t(`architecture.layer.pull_requests.${pullRequests.reason}`) : t('architecture.inspector.none')}</p>}
    <h4>{t('architecture.sequence.relations', { count: between.length })}</h4>
    {between.length ? <ul>{between.map(relation => {
      const count = imports.find(edge => edge.source === relation.source && edge.target === relation.target)?.imports;
      return <li key={relation.id} data-relation-id={relation.id}><code>{relation.kind}</code> {names.get(relation.source)} → {names.get(relation.target)}
        {count !== undefined && <span className="mono-value"> · {t('architecture.map.imports', { count })}</span>}</li>;
    })}</ul> : <p className="detail-quiet">{t('architecture.none')}</p>}
  </>;
}

function Legend({ t }: { readonly t: OperatorTranslate }) {
  return <dl className="architecture-map__legend" aria-label={t('architecture.map.legend')}>
    <div><dt><span className="architecture-map__swatch architecture-map__swatch--box" /></dt><dd>{t('architecture.sequence.legend.process')}</dd></div>
    <div><dt><span className="architecture-map__swatch architecture-map__swatch--external" /></dt><dd>{t('architecture.sequence.legend.external')}</dd></div>
    <div><dt><span className="architecture-map__swatch architecture-map__swatch--success" /></dt><dd>{t('architecture.sequence.legend.success')}</dd></div>
    <div><dt><span className="architecture-map__swatch architecture-map__swatch--danger" /></dt><dd>{t('architecture.sequence.legend.error')}</dd></div>
  </dl>;
}

type Selection = { readonly kind: 'participant'; readonly id: string } | { readonly kind: 'message'; readonly outcome: string | null; readonly step: string } | null;

/** The diagram of one flow. It owns no state: the selection lives with the side panel, which stays mounted across flow changes. */
function SequenceCanvas({ map, flow, layer, pullRequest, selection, onSelect, t }: {
  readonly map: ArchitectureMapV1;
  readonly flow: RequiredFlow;
  readonly layer: MapLayerId;
  readonly pullRequest: number | null;
  readonly selection: Selection;
  readonly onSelect: (flowId: string, selection: Selection) => void;
  readonly t: OperatorTranslate;
}) {
  const placement = useMemo(() => runtimePlacement(map), [map]);
  const layout = useMemo(() => layoutSequence(flow, placement), [flow, placement]);
  const firstView = useMemo(() => firstViewport(Math.min(...layout.boxes.map(box => box.x)), Math.min(...layout.boxes.map(box => box.y))), [layout]);
  const view = useMemo(() => mapLayerView(map, layer, pullRequest), [map, layer, pullRequest]);
  const reached = useMemo(() => reachedSteps(map, layer, pullRequest), [map, layer, pullRequest]);
  const proven = useMemo(() => proofs(map), [map]);
  const names = useMemo(() => new Map(map.nodes.map(node => [node.id, node.name])), [map]);

  const nodes = useMemo<SequenceNode[]>(() => {
    const kinds = new Map(map.nodes.map(node => [node.id, node.kind]));
    const fixed = { draggable: false, connectable: false, selectable: false, focusable: false } as const;
    return [
      ...layout.boxes.map((box): SequenceNode => ({
        id: `box:${box.key}`, type: 'box', position: { x: box.x, y: box.y }, width: box.width, height: box.height, zIndex: 0, ...fixed,
        data: { box, title: box.placement.kind === 'unknown' ? t('architecture.sequence.unknown') : placementText(box.placement, names, t),
          reason: box.placement.kind === 'unknown' ? t(`architecture.runtime.${box.placement.reason}`) : null },
      })),
      ...layout.fragments.map((fragment): SequenceNode => ({
        id: `fragment:${fragment.outcome.id}`, type: 'fragment', position: { x: fragment.x, y: fragment.y }, zIndex: 1, ...fixed,
        width: fragment.width, height: fragment.height, data: { kind: fragment.outcome.kind, index: fragment.index, label: fragment.outcome.label },
      })),
      ...layout.columns.map((column): SequenceNode => ({
        id: `lifeline:${column.participant.id}`, type: 'lifeline', position: { x: column.x - 1, y: layout.headerY + SEQUENCE_HEADER - 8 }, zIndex: 2, ...fixed,
        width: 2, height: layout.bottom - layout.headerY - SEQUENCE_HEADER + 8, data: {},
      })),
      ...layout.columns.map((column): SequenceNode => ({
        id: `participant:${column.participant.id}`, type: 'header', position: { x: column.x - (SEQUENCE_COLUMN - 24) / 2, y: layout.headerY },
        width: SEQUENCE_COLUMN - 24, height: SEQUENCE_HEADER - 8, zIndex: 3, draggable: false, connectable: false,
        selected: selection?.kind === 'participant' && selection.id === column.participant.id,
        ariaLabel: `${kinds.get(column.participant.node)} ${names.get(column.participant.node)}`,
        data: { name: names.get(column.participant.node) ?? column.participant.node, kind: kinds.get(column.participant.node) ?? '', mark: view.marks.get(column.participant.node) ?? null,
          quiet: view.available && !view.lit.has(column.participant.node) },
      })),
      ...layout.messages.map((message): SequenceNode => {
        const self = message.from === message.to;
        const status = proven?.get(flowSelectorKey(message.step.evidence)) ?? null;
        return {
          id: `message:${message.outcome ?? ''}:${message.step.id}`, type: 'message', zIndex: 4, draggable: false, connectable: false,
          position: { x: self ? message.from : Math.min(message.from, message.to), y: message.y - 26 }, width: self ? SEQUENCE_COLUMN / 2 : Math.abs(message.to - message.from), height: 36,
          selected: selection?.kind === 'message' && selection.outcome === message.outcome && selection.step === message.step.id,
          ariaLabel: message.step.label,
          data: { label: message.step.label, direction: self ? 'self' : message.to > message.from ? 'right' : 'left', status,
            tone: messageTone(layer, reached, proven, flow.id, message.outcome, message.step) },
        };
      }),
      ...layout.terminals.map((terminal): SequenceNode => ({
        id: `terminal:${terminal.outcome}`, type: 'terminal', position: { x: terminal.x - 90, y: terminal.y - 16 }, width: 180, height: 32, zIndex: 4, ...fixed,
        data: { kind: layout.fragments.find(fragment => fragment.outcome.id === terminal.outcome)!.outcome.kind, label: terminal.label },
      })),
    ];
  }, [map, flow, layout, view, reached, proven, names, selection, layer, t]);

  // Selection is the only change the read-only canvas applies; click and the keyboard both arrive here.
  const onNodesChange = useCallback((changes: NodeChange<SequenceNode>[]) => {
    const chosen = changes.find(change => change.type === 'select' && change.selected);
    if (chosen && 'id' in chosen) {
      const [kind, ...rest] = chosen.id.split(':');
      if (kind === 'participant') onSelect(flow.id, { kind: 'participant', id: rest.join(':') });
      if (kind === 'message') onSelect(flow.id, { kind: 'message', outcome: rest[0] === '' ? null : rest[0]!, step: rest.slice(1).join(':') });
    } else if (changes.some(change => change.type === 'select')) onSelect(flow.id, null);
  }, [flow.id, onSelect]);

  return <div className="architecture-map__canvas" aria-label={t('architecture.sequence.label')} role="region">
      <ReactFlow<SequenceNode>
        nodes={nodes}
        edges={[]}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        nodesDraggable={false}
        nodesConnectable={false}
        minZoom={0.1}
        maxZoom={2}
        defaultViewport={firstView}
        attributionPosition="top-right"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="var(--rh-diagram-dot)" />
        <Panel position="bottom-left"><Legend t={t} /></Panel>
        <Panel position="bottom-right"><ZoomControls t={t} /></Panel>
      </ReactFlow>
  </div>;
}

/** The side panel: `lead` (the flow list and the layer facts), then the selected message or participant of the flow on screen. */
function SequenceInspector({ map, flow, layer, pullRequest, selection, lead, onModule, t }: {
  readonly map: ArchitectureMapV1;
  readonly flow: ArchitectureMapFlowV1;
  readonly layer: MapLayerId;
  readonly pullRequest: number | null;
  readonly selection: Selection;
  readonly lead: ReactNode;
  readonly onModule: (id: string) => void;
  readonly t: OperatorTranslate;
}) {
  const required = flow.applicability === 'required' ? flow : null;
  const message = required !== null && selection?.kind === 'message'
    ? flowSteps(required).find(entry => entry.outcome === selection.outcome && entry.step.id === selection.step) ?? null : null;
  const node = required !== null && selection?.kind === 'participant' ? required.participants.find(entry => entry.id === selection.id)?.node ?? null : null;
  const participant = node === null ? null : { node, place: runtimePlacement(map)(node) };
  return <aside className="architecture-map__inspector" aria-label={t('architecture.sequence.inspector')}
    data-node-id={node ?? undefined} data-step-id={message ? `${message.outcome ?? ''}:${message.step.id}` : undefined}>
    {lead}
    {required !== null && (message ? <StepDetails map={map} flow={required} outcome={message.outcome} step={message.step} t={t} />
      : participant !== null ? <NodeDetails map={map} layer={layer} pullRequest={pullRequest} nodeId={participant.node} onModule={onModule} t={t}>
        <p data-runtime={participant.place.kind}>{t('architecture.sequence.runsIn', { place: placementText(participant.place, new Map(map.nodes.map(entry => [entry.id, entry.name])), t) })}</p>
      </NodeDetails>
        : <p className="detail-quiet">{t('architecture.sequence.pick')}</p>)}
  </aside>;
}

/** Why a layer marks only part of the sequence map. */
const LAYER_NOTES: Partial<Record<MapLayerId, 'imports_on_module_map' | 'tests_by_capability' | 'decisions_by_node'>> = { violations: 'imports_on_module_map', tests: 'tests_by_capability', decisions: 'decisions_by_node' };

/** The flow on screen: the picked flow while the model lists it, else the first flow that the layer reaches. */
function shownFlow(map: ArchitectureMapV1, layer: MapLayerId, reached: ReadonlySet<string>, proven: ReadonlyMap<string, string> | null, picked: string | null): ArchitectureMapFlowV1 {
  const flowId = picked !== null && map.flows.some(flow => flow.id === picked) ? picked : firstFlow(map, layer, reached, proven)!;
  return map.flows.find(entry => entry.id === flowId)!;
}

/** Starts the browser download of one file built on the page. */
function download(name: string, type: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // The click starts the download in this task; the URL can go after it.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** The sequence map's part of the lens row: how much of the model the flows cover, and the SVG export of the flow on screen. */
export function SequenceLensTools({ map, layer, pullRequest, flowId, t }: {
  readonly map: ArchitectureMapV1;
  readonly layer: MapLayerId;
  readonly pullRequest: number | null;
  readonly flowId: string | null;
  readonly t: OperatorTranslate;
}) {
  const reached = useMemo(() => reachedSteps(map, layer, pullRequest), [map, layer, pullRequest]);
  const proven = useMemo(() => proofs(map), [map]);
  const coverage = useMemo(() => {
    const declared = new Set(map.flow_evidence.map(entry => flowSelectorKey(entry)));
    const steps = map.flows.flatMap(entry => flowSteps(entry));
    return { flows: map.flows.length, steps: steps.length, evidenced: steps.filter(({ step }) => declared.has(flowSelectorKey(step.evidence))).length };
  }, [map]);
  if (map.flows.length === 0) return null;
  const flow = shownFlow(map, layer, reached, proven, flowId);
  const exportSvg = () => {
    if (flow.applicability !== 'required') return;
    const nodes = new Map(map.nodes.map(node => [node.id, node]));
    const names = new Map(map.nodes.map(node => [node.id, node.name]));
    const svg = sequenceSvg(layoutSequence(flow, runtimePlacement(map)), {
      box: box => box.placement.kind === 'unknown' ? t('architecture.sequence.unknown') : placementText(box.placement, names, t),
      // The decoder admits a flow only when each participant names a map node.
      participant: nodeId => nodes.get(nodeId)!,
    });
    download(`${flow.id}.svg`, 'image/svg+xml', svg);
  };
  return <div className="architecture-lens__tools">
    <span data-sequence-summary>{t('architecture.sequence.summary', coverage)}</span>
    <button type="button" className="architecture-lens__export" data-sequence-export disabled={flow.applicability !== 'required'} onClick={exportSvg}>{t('architecture.sequence.export')}</button>
  </div>;
}

/** The flows of the model in model order, at the top of the side panel. A lit flow has a step that the active layer marks. */
function FlowList({ map, flowId, lit, onFlow, t }: {
  readonly map: ArchitectureMapV1;
  readonly flowId: string;
  readonly lit: ReadonlySet<string>;
  readonly onFlow: (flowId: string) => void;
  readonly t: OperatorTranslate;
}) {
  return <div className="architecture-sequence__flows" role="group" aria-labelledby="architecture-sequence-flows">
    <h4 id="architecture-sequence-flows">{t('architecture.sequence.flows')}</h4>
    <div className="architecture-sequence__flow-list">
      {map.flows.map((entry, index) => <button key={entry.id} type="button" aria-pressed={entry.id === flowId} data-flow-id={entry.id} data-lit={lit.has(entry.id) || undefined}
        title={`${entry.name} · ${entry.id}`} onClick={() => onFlow(entry.id)}>
        <span className="mono-value">{index + 1}</span>
        <span className="architecture-sequence__flow-name">{entry.name}</span>
        {lit.has(entry.id) && <span className="architecture-sequence__lit" aria-label={t('architecture.sequence.lit')} />}
      </button>)}
    </div>
  </div>;
}

/** The sequence base map: one model flow per diagram, one light box per OS process. The side panel leads with the flow list, then `side`. */
export function ArchitectureSequence({ map, layer, pullRequest, flowId, onFlow, side, onModule, t }: {
  readonly map: ArchitectureMapV1;
  readonly layer: MapLayerId;
  readonly pullRequest: number | null;
  readonly flowId: string | null;
  readonly onFlow: (flowId: string) => void;
  readonly side: ReactNode;
  readonly onModule: (id: string) => void;
  readonly t: OperatorTranslate;
}) {
  const reached = useMemo(() => reachedSteps(map, layer, pullRequest), [map, layer, pullRequest]);
  const proven = useMemo(() => proofs(map), [map]);
  const lit = useMemo(() => litFlows(map, layer, reached, proven), [map, layer, reached, proven]);
  const [chosen, setChosen] = useState<{ readonly flow: string; readonly selection: Selection }>({ flow: '', selection: null });
  const onSelect = useCallback((flow: string, selection: Selection) => setChosen({ flow, selection }), []);
  if (map.flows.length === 0) {
    return <div className="architecture-map"><Note part="sequence.flows" reason="flows_undeclared">{t('architecture.sequence.none')}</Note>
      <aside className="architecture-map__inspector" aria-label={t('architecture.sequence.inspector')}>{side}</aside></div>;
  }
  const flow = shownFlow(map, layer, reached, proven, flowId);
  const note = LAYER_NOTES[layer];
  const lead = <>
    <FlowList map={map} flowId={flow.id} lit={lit} onFlow={onFlow} t={t} />
    {side}
    {note && <Note part={`sequence.${layer}`} reason={note}>{t(`architecture.sequence.note.${note}`)}</Note>}
  </>;
  // A selection belongs to the flow it was made on: a change of flow clears it, also for a later return to that flow.
  if (chosen.flow !== flow.id) setChosen({ flow: flow.id, selection: null });
  const selection = chosen.flow === flow.id ? chosen.selection : null;
  // The side panel is the second child in every case, so React keeps it, and the flow list in it, across flow changes.
  return <div className="architecture-sequence">
    <div className="architecture-map" data-view="sequence" data-flow={flow.id} data-layer={layer}>
      {flow.applicability === 'not-applicable'
        ? <Note part="sequence.not_applicable" reason="flow_not_applicable">{t('architecture.flow.notApplicable', { rationale: flow.rationale })}</Note>
        : <ReactFlowProvider><SequenceCanvas key={flow.id} map={map} flow={flow} layer={layer} pullRequest={pullRequest} selection={selection} onSelect={onSelect} t={t} /></ReactFlowProvider>}
      <SequenceInspector map={map} flow={flow} layer={layer} pullRequest={pullRequest} selection={selection} lead={lead} onModule={onModule} t={t} />
    </div>
  </div>;
}
