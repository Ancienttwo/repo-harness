// Pieces that the module, sequence and topology base maps share: zoom,
// gap and note lines, layer facts, and the inspector body of a model node.
// Every number is the collector's; every command is a collector read.

import { useMemo } from 'react';
import { useReactFlow, useViewport } from '@xyflow/react';
import {
  architectureViolationCommand,
  type ArchitectureImpactV1,
  type ArchitectureMapV1,
  type ArchitectureViolationsLayerV1,
} from '../core/operator/architecture-map';
import { impactLines, impactTargets, type MapLayerId, type MapMark } from './architecture-map-layers';
import type { OperatorTranslate } from './i18n';
import { CopyButton } from './ui';

export type CountUnit = 'file' | 'commit' | 'node' | 'relation' | 'decision';

/** "1 node", "2 nodes". `atLeast` marks a count that archctx cut at its limit. Only English inflects; Chinese keeps the bare number and its own classifier. */
export function counted(t: OperatorTranslate, count: number, unit: CountUnit, atLeast = false): string {
  return `${atLeast ? '≥' : ''}${t(count === 1 ? `architecture.unit.${unit}One` : `architecture.unit.${unit}`, { count })}`;
}

/** `code`: archctx's own error code when the gap is an archctx refusal. */
export function Gap({ part, reason, code, children }: { readonly part: string; readonly reason: string; readonly code?: string; readonly children: string }) {
  return <p className="architecture-map__gap" data-gap={part} data-reason={reason} data-code={code}>{children}</p>;
}

/** A part that has no source until archctx or a collector provides one, or that a base map does not draw; a fixed limit, not a failed read. */
export function Note({ part, reason, children }: { readonly part: string; readonly reason: string; readonly children: React.ReactNode }) {
  return <div className="architecture-map__note" data-note={part} data-reason={reason}>{children}</div>;
}

export function Mark({ mark }: { readonly mark: MapMark | null }) {
  return mark === null ? null : <span className="architecture-map__mark mono-value" data-tone={mark.tone}>{mark.label}</span>;
}

export function ZoomControls({ t }: { readonly t: OperatorTranslate }) {
  const flow = useReactFlow();
  const { zoom } = useViewport();
  return <div className="architecture-map__zoom" role="group" aria-label={t('architecture.map.zoom')}>
    <button type="button" aria-label={t('architecture.map.zoomOut')} onClick={() => { void flow.zoomOut(); }}>−</button>
    <button type="button" aria-label={t('architecture.map.zoomReset')} className="mono-value" onClick={() => { void flow.zoomTo(1); }}>{Math.round(zoom * 100)}%</button>
    <button type="button" aria-label={t('architecture.map.zoomIn')} onClick={() => { void flow.zoomIn(); }}>+</button>
    <button type="button" aria-label={t('architecture.map.fitLabel')} onClick={() => { void flow.fitView(); }}>{t('architecture.map.fit')}</button>
  </div>;
}

export type ViolationPart = keyof ArchitectureViolationsLayerV1;

/** The archctx read that lists a finding of `part`, ready to copy. */
export function FixCommand({ part, t }: { readonly part: ViolationPart; readonly t: OperatorTranslate }) {
  const command = architectureViolationCommand(part);
  return <div className="copy-value architecture-map__command">
    <code data-fix-command={part}>{command}</code>
    <CopyButton label={t('architecture.inspector.command')} value={command} t={t} />
  </div>;
}

export function nodeSize(map: ArchitectureMapV1, nodeId: string): { readonly files: number; readonly lines: number } | null {
  return map.sizes.state === 'ok' ? map.sizes.nodes.find(entry => entry.id === nodeId) ?? null : null;
}

interface Fact { readonly key: string; readonly text: string; readonly paths?: readonly string[]; readonly part?: ViolationPart }

/** The violation items that name one node, each with the part whose read lists it. */
export function violationFacts(map: ArchitectureMapV1, nodeId: string, names: ReadonlyMap<string, string>, t: OperatorTranslate): Fact[] {
  const { debt, flows, anchors, dependencies, layer_direction: layerDirection } = map.layers.violations;
  const facts: Fact[] = [];
  if (debt.state === 'ok') {
    debt.items.filter(item => item.nodes.includes(nodeId)).forEach((item, index) => facts.push({ key: `debt-${index}`, text: t(`architecture.layer.debt.${item.kind}`), paths: item.paths, part: 'debt' }));
  }
  if (flows.state === 'ok') {
    const entry = flows.unprovable.find(item => item.id === nodeId);
    if (entry) facts.push({ key: 'flows', text: t('architecture.layer.node.flows', { count: entry.diagnostics }), part: 'flows' });
  }
  if (anchors.state === 'ok') {
    const entry = anchors.nodes.find(item => item.id === nodeId);
    if (entry) facts.push({ key: 'anchors', text: t('architecture.layer.node.anchors', { count: entry.findings }), part: 'anchors' });
  }
  if (dependencies.state === 'ok') {
    for (const edge of dependencies.edges.filter(item => item.source === nodeId)) {
      facts.push({ key: `undeclared-${edge.target}`, text: t('architecture.layer.node.undeclared', { name: names.get(edge.target) ?? edge.target, count: edge.imports }), part: 'dependencies' });
    }
  }
  if (layerDirection.state === 'ok') {
    for (const edge of layerDirection.edges.filter(item => item.source === nodeId)) {
      facts.push({ key: `layer-${edge.target}`, part: 'layer_direction', text: t('architecture.layer.node.layer_direction', {
        name: names.get(edge.target) ?? edge.target, count: edge.imports, from: edge.source_layer, to: edge.target_layer,
      }) });
    }
  }
  return facts;
}

function FactList({ facts, layer }: { readonly facts: readonly Fact[]; readonly layer?: string }) {
  return <ul data-layer-facts={layer}>{facts.map(fact => <li key={fact.key}>
    {fact.text}
    {fact.paths?.length ? <ul>{fact.paths.map(path => <li key={path}><code>{path}</code></li>)}</ul> : null}
  </li>)}</ul>;
}

/** The facts of the active layer for one node, straight from the collector. Violations have their own inspector section. */
export function LayerFacts({ map, layer, pullRequest, nodeId, names, t }: {
  readonly map: ArchitectureMapV1;
  readonly layer: MapLayerId;
  readonly pullRequest: number | null;
  readonly nodeId: string;
  readonly names: ReadonlyMap<string, string>;
  readonly t: OperatorTranslate;
}) {
  if (layer === 'violations') return null;
  const facts: Fact[] = [];
  const { changes, pull_requests: pullRequests, tests, decisions } = map.layers;
  // The node's own changed paths and the changed nodes archctx says it depends on.
  const impactFacts = (impact: ArchitectureImpactV1, text: (files: number) => string) => {
    const entry = impact.nodes.find(item => item.id === nodeId);
    if (entry) facts.push({ key: 'impact', text: text(entry.files), paths: impact.paths.filter(item => item.owners.includes(nodeId)).map(item => item.path) });
    const targets = impactTargets(impact, nodeId);
    if (targets.length > 0) facts.push({ key: 'dependent', text: t('architecture.layer.node.dependent', { names: targets.map(id => names.get(id) ?? id).join(', ') }) });
  };
  if (layer === 'changes' && changes.state === 'ok') {
    const lines = impactLines(changes, nodeId);
    impactFacts(changes, files => t('architecture.layer.node.changes', { files: counted(t, files, 'file'), added: lines.added, deleted: lines.deleted })
      + (lines.unknown > 0 ? ` ${t('architecture.layer.node.lines_unknown', { count: lines.unknown })}` : ''));
  }
  const impact = pullRequests.state === 'ok' ? pullRequests.pull_requests.find(item => item.number === pullRequest)?.impact : undefined;
  if (layer === 'pull_requests' && impact?.state === 'ok') {
    impactFacts(impact, files => t('architecture.layer.node.pull_request', { files: counted(t, files, 'file'), number: pullRequest! }));
  }
  if (layer === 'tests' && tests.state === 'ok') {
    const entry = tests.capabilities.find(item => item.id === nodeId);
    if (entry) facts.push({ key: 'tests', text: t('architecture.layer.node.tests', { files: entry.files, passed: entry.passed, failed: entry.failed, skipped: entry.skipped, noResult: entry.no_result }) });
  }
  if (layer === 'decisions') {
    for (const item of decisions.items.filter(entry => entry.applies_to.includes(nodeId))) {
      facts.push({ key: `decision-${item.id}`, text: item.status === null ? item.title : t('architecture.layer.node.decision', { title: item.title, status: item.status }), paths: [item.path] });
    }
  }
  return <>
    <h4>{t(`architecture.layer.${layer}`)}</h4>
    {facts.length ? <FactList facts={facts} layer={layer} /> : <p className="detail-quiet">{t('architecture.layer.node.none')}</p>}
  </>;
}

/** Open PRs whose impact archctx ties to one node: it changes the node, or the node depends on a node it changes. */
function RelatedPullRequests({ map, nodeId, t }: { readonly map: ArchitectureMapV1; readonly nodeId: string; readonly t: OperatorTranslate }) {
  const { pull_requests: pullRequests } = map.layers;
  if (pullRequests.state === 'unavailable') return <p className="detail-quiet" data-related-prs-gap={pullRequests.reason}>{t(`architecture.layer.pull_requests.${pullRequests.reason}`)}</p>;
  const related = pullRequests.pull_requests.flatMap(pr => {
    if (pr.impact.state !== 'ok') return [];
    const files = pr.impact.nodes.find(entry => entry.id === nodeId)?.files;
    if (files !== undefined) return [{ pr, text: t('architecture.inspector.pr.changes', { files: counted(t, files, 'file') }) }];
    return impactTargets(pr.impact, nodeId).length > 0 ? [{ pr, text: t('architecture.inspector.pr.depends') }] : [];
  });
  return related.length ? <ul data-related-prs>{related.map(({ pr, text }) => <li key={pr.number} data-pull-request-number={pr.number}>
    <a href={pr.url} target="_blank" rel="noreferrer">#{pr.number}</a> {pr.title} · {text}
  </li>)}</ul> : <p className="detail-quiet">{t('architecture.inspector.none')}</p>;
}

/** The violation items of one node and the command that lists each kind. */
export function Violations({ facts, t }: { readonly facts: readonly Fact[]; readonly t: OperatorTranslate }) {
  const parts = [...new Set(facts.flatMap(fact => (fact.part ? [fact.part] : [])))];
  return <>
    {facts.length ? <FactList facts={facts} layer="violations" /> : <p className="detail-quiet">{t('architecture.inspector.none')}</p>}
    {parts.map(part => <FixCommand key={part} part={part} t={t} />)}
  </>;
}

/**
 * The inspector body of one model node (PRD 2-ARCH-P2): code size, the active
 * layer's facts, related PRs, violation items with the command that lists
 * them, and the node's relations with import counts.
 */
export function NodeDetails({ map, layer, pullRequest, nodeId, onModule, t, children }: {
  readonly map: ArchitectureMapV1;
  readonly layer: MapLayerId;
  readonly pullRequest: number | null;
  readonly nodeId: string;
  readonly onModule: (id: string) => void;
  readonly t: OperatorTranslate;
  readonly children?: React.ReactNode;
}) {
  const names = useMemo(() => new Map(map.nodes.map(node => [node.id, node.name])), [map]);
  const node = map.nodes.find(entry => entry.id === nodeId);
  if (node === undefined) return null;
  const size = nodeSize(map, nodeId);
  const imports = map.dependencies.state === 'ok' ? map.dependencies.edges : [];
  const lines = (direction: 'out' | 'in') => map.relations
    .filter(relation => (direction === 'out' ? relation.source : relation.target) === node.id)
    .map(relation => {
      const other = direction === 'out' ? relation.target : relation.source;
      const count = imports.find(edge => edge.source === relation.source && edge.target === relation.target)?.imports;
      return <li key={relation.id} data-relation-id={relation.id}>
        <code>{relation.kind}</code> {names.get(other)}{count !== undefined && <span className="mono-value"> · {t('architecture.map.imports', { count })}</span>}
      </li>;
    });
  const outgoing = lines('out');
  const incoming = lines('in');
  return <>
    <h3>{node.name}</h3>
    <code className="architecture-map__id">{node.id}</code>
    <p>{node.summary}</p>
    <dl className="detail-list">
      <div><dt>{t('architecture.map.kind')}</dt><dd>{node.kind}</dd></div>
      <div><dt>{t('architecture.map.layer')}</dt><dd>{node.layer ?? t('architecture.none')}</dd></div>
      <div><dt>{t('architecture.map.status')}</dt><dd>{node.status}</dd></div>
      {map.sizes.state === 'ok' && <div><dt>{t('architecture.map.size')}</dt><dd data-node-size>
        {size === null ? t('architecture.map.noSize') : t('architecture.map.sizeValue', { lines: size.lines, files: size.files })}
      </dd></div>}
    </dl>
    {node.kind === 'capability' && <button type="button" className="operator-button operator-button--secondary" onClick={() => onModule(node.id)}>{t('architecture.map.open')}</button>}
    {children}
    <LayerFacts map={map} layer={layer} pullRequest={pullRequest} nodeId={node.id} names={names} t={t} />
    <h4>{t('architecture.inspector.pullRequests')}</h4>
    <RelatedPullRequests map={map} nodeId={node.id} t={t} />
    <h4>{t('architecture.layer.violations')}</h4>
    <Violations facts={violationFacts(map, node.id, names, t)} t={t} />
    <h4>{t('architecture.map.outgoing', { count: outgoing.length })}</h4>
    {outgoing.length ? <ul>{outgoing}</ul> : <p className="detail-quiet">{t('architecture.none')}</p>}
    <h4>{t('architecture.map.incoming', { count: incoming.length })}</h4>
    {incoming.length ? <ul>{incoming}</ul> : <p className="detail-quiet">{t('architecture.none')}</p>}
  </>;
}
