// Layout of one flow on the sequence base map. Participants are columns,
// grouped so that each OS process box is contiguous; boxes keep the order in
// which the flow first names a participant of theirs. Rows are the main steps
// in model order, then one fragment per outcome with its steps and its
// terminal. This module computes positions only and adds no fact to the map.

import type { ArchitectureMapFlowOutcomeV1, ArchitectureMapFlowStepV1, ArchitectureMapFlowV1 } from '../core/operator/architecture-map';
import type { RuntimePlacement } from './architecture-runtime';

export const SEQUENCE_COLUMN = 220;
export const SEQUENCE_HEADER = 52;
export const SEQUENCE_ROW = 52;
const BOX_TITLE = 28;
const BOX_GAP = 16;
const FRAGMENT_TITLE = 28;
const FRAGMENT_GAP = 12;
const MARGIN = 16;

type Required = Extract<ArchitectureMapFlowV1, { applicability: 'required' }>;
export type SequenceParticipant = Required['participants'][number];

export interface SequenceBox {
  /** `process:<id>`, `external`, or `unknown:<reason>`. */
  readonly key: string;
  readonly placement: RuntimePlacement;
  readonly participants: readonly string[];
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SequenceColumn {
  readonly participant: SequenceParticipant;
  readonly box: string;
  /** Centre of the lifeline. */
  readonly x: number;
}

export interface SequenceMessage {
  /** null: a main step. */
  readonly outcome: string | null;
  readonly step: ArchitectureMapFlowStepV1;
  readonly y: number;
  readonly from: number;
  readonly to: number;
}

export interface SequenceFragment {
  readonly outcome: ArchitectureMapFlowOutcomeV1;
  readonly y: number;
  readonly height: number;
}

export interface SequenceTerminal {
  readonly outcome: string;
  readonly participant: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
}

export interface SequenceLayout {
  readonly boxes: readonly SequenceBox[];
  readonly columns: readonly SequenceColumn[];
  readonly messages: readonly SequenceMessage[];
  readonly fragments: readonly SequenceFragment[];
  readonly terminals: readonly SequenceTerminal[];
  /** Top of each participant header; lifelines run from below it to `bottom`. */
  readonly headerY: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export function boxKey(placement: RuntimePlacement): string {
  return placement.kind === 'process' ? `process:${placement.process}` : placement.kind === 'external' ? 'external' : `unknown:${placement.reason}`;
}

export function layoutSequence(flow: Required, placement: (nodeId: string) => RuntimePlacement): SequenceLayout {
  const order: string[] = [];
  const members = new Map<string, { placement: RuntimePlacement; participants: SequenceParticipant[] }>();
  for (const participant of flow.participants) {
    const where = placement(participant.node);
    const key = boxKey(where);
    if (!members.has(key)) { order.push(key); members.set(key, { placement: where, participants: [] }); }
    members.get(key)!.participants.push(participant);
  }
  const columns: SequenceColumn[] = [];
  const spans: { key: string; left: number; right: number }[] = [];
  let left = MARGIN;
  for (const key of order) {
    const start = left;
    for (const participant of members.get(key)!.participants) {
      columns.push({ participant, box: key, x: left + SEQUENCE_COLUMN / 2 });
      left += SEQUENCE_COLUMN;
    }
    spans.push({ key, left: start, right: left });
    left += BOX_GAP;
  }
  const x = new Map(columns.map(column => [column.participant.id, column.x]));
  const headerY = MARGIN + BOX_TITLE;
  let y = headerY + SEQUENCE_HEADER + SEQUENCE_ROW / 2;
  const messages: SequenceMessage[] = [];
  const row = (outcome: string | null, step: ArchitectureMapFlowStepV1) => {
    messages.push({ outcome, step, y, from: x.get(step.from)!, to: x.get(step.to)! });
    y += SEQUENCE_ROW;
  };
  for (const step of flow.steps) row(null, step);
  const fragments: SequenceFragment[] = [];
  const terminals: SequenceTerminal[] = [];
  for (const outcome of flow.outcomes) {
    const top = y - SEQUENCE_ROW / 2 + FRAGMENT_GAP;
    y = top + FRAGMENT_TITLE + SEQUENCE_ROW / 2;
    for (const step of outcome.steps) row(outcome.id, step);
    terminals.push({ outcome: outcome.id, participant: outcome.terminal.participant, label: outcome.terminal.label, x: x.get(outcome.terminal.participant)!, y });
    y += SEQUENCE_ROW;
    fragments.push({ outcome, y: top, height: y - SEQUENCE_ROW / 2 - top });
  }
  const bottom = y;
  const boxes = spans.map(span => ({
    key: span.key, placement: members.get(span.key)!.placement, participants: members.get(span.key)!.participants.map(participant => participant.id),
    x: span.left, y: MARGIN, width: span.right - span.left, height: bottom - MARGIN,
  }));
  return { boxes, columns, messages, fragments, terminals, headerY, bottom, width: left - BOX_GAP + MARGIN, height: bottom + MARGIN };
}
