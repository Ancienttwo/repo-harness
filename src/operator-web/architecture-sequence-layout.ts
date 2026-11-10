// Layout of one flow on the sequence base map, as the shared placed scene.
// Participants are columns, grouped so that each OS process box is
// contiguous; boxes keep the order in which the flow first names a participant
// of theirs. A process box holds its title and its participant headers; each
// header holds a 1 px lifeline box. Rows are the main steps in model order,
// then one fragment per outcome: a band over the columns that it names, its
// steps and its terminal. Each message is a route from lifeline to lifeline
// with its label in the gap next to the sender. Every box and gap that holds
// text takes its width from `textWidth`, so no text is cut. This module
// computes positions only and adds no fact to the map.

import type { ArchitectureMapFlowOutcomeV1, ArchitectureMapFlowStepV1, ArchitectureMapFlowV1 } from '../core/operator/architecture-map';
import type { RuntimePlacement } from './architecture-runtime';
import { labelAt, sceneExtent, textWidth, type PlacedScene, type Point, type SceneBox, type SceneLabel, type SceneRoute } from './architecture-scene';

const MARGIN = 16;
const PROCESS_TITLE = 24;
const PROCESS_PAD = 8;
const PROCESS_GAP = 16;
const HEADER_MIN = 196;
const HEADER_HEIGHT = 44;
/** The space between two headers of one process. */
const HEADER_GAP = 24;
/** The space between a text and each side of its box, and between a label box and each lifeline beside it. */
const TEXT_PAD = 12;
const ROW = 52;
/** The label box ends this many px above its message. */
const LABEL_LIFT = 4;
const LABEL_HEIGHT = 16;
const BAND_HEIGHT = 28;
const FRAGMENT_GAP = 12;
const TERMINAL_HEIGHT = 28;
/** A self message loops this far right of its lifeline. */
const SELF_LOOP = 24;

type Required = Extract<ArchitectureMapFlowV1, { applicability: 'required' }>;
export type SequenceParticipant = Required['participants'][number];
export type MessageTone = 'change' | 'danger';

/** What a scene box of the sequence map shows. */
export type SequencePart =
  | { readonly kind: 'process'; readonly placement: RuntimePlacement }
  | { readonly kind: 'participant'; readonly participant: SequenceParticipant }
  | { readonly kind: 'lifeline' }
  | { readonly kind: 'fragment'; readonly outcome: ArchitectureMapFlowOutcomeV1; readonly index: number }
  | { readonly kind: 'terminal'; readonly outcome: ArchitectureMapFlowOutcomeV1 };

/** The model step of a message route, with its mark on the active layer. */
export interface SequenceMessage {
  /** null: a main step. */
  readonly outcome: string | null;
  readonly step: ArchitectureMapFlowStepV1;
  readonly tone: MessageTone | null;
  /** archctx's proof status when it is not `proven`; the label shows it on a `danger` message. */
  readonly status: string | null;
}

export interface SequenceLayout {
  readonly scene: PlacedScene;
  /** By scene box id. */
  readonly parts: ReadonlyMap<string, SequencePart>;
  /** By route id. */
  readonly messages: ReadonlyMap<string, SequenceMessage>;
  /** The text lines of each box, as the canvas and the file draw them. */
  readonly lines: (box: SceneBox) => readonly string[];
}

/** How the active layer marks the steps of a flow. */
export interface SequenceMarks {
  readonly tone: (outcome: string | null, step: ArchitectureMapFlowStepV1) => MessageTone | null;
  /** archctx's proof status of a step when it is not `proven`, else null. */
  readonly status: (step: ArchitectureMapFlowStepV1) => string | null;
}

/** The titles that the boxes draw; the layout sizes each box to its title. */
export interface SequenceText {
  readonly process: (placement: RuntimePlacement) => string;
  readonly participant: (participant: SequenceParticipant) => string;
}

function boxKey(placement: RuntimePlacement): string {
  return placement.kind === 'process' ? `process:${placement.process}` : placement.kind === 'external' ? 'external' : `unknown:${placement.reason}`;
}

const participantId = (participant: string) => `participant:${participant}`;
const messageId = (outcome: string | null, step: string) => `message:${outcome ?? ''}:${step}`;
export const fragmentTag = (index: number) => index === 0 ? 'alt' : 'else';

const labelText = (step: ArchitectureMapFlowStepV1, status: string | null) => status === null ? step.label : `${step.label} · ${status}`;
/** The width of a box that holds `title` on one line. */
const holder = (title: string) => textWidth(title, 'title') + 2 * TEXT_PAD;

interface Row { readonly outcome: string | null; readonly step: ArchitectureMapFlowStepV1; readonly y: number }

export function layoutSequence(flow: Required, placement: (nodeId: string) => RuntimePlacement, marks: SequenceMarks, text: SequenceText): SequenceLayout {
  const order: string[] = [];
  const members = new Map<string, { placement: RuntimePlacement; participants: SequenceParticipant[] }>();
  for (const participant of flow.participants) {
    const where = placement(participant.node);
    const key = boxKey(where);
    if (!members.has(key)) { order.push(key); members.set(key, { placement: where, participants: [] }); }
    members.get(key)!.participants.push(participant);
  }
  const columns = order.flatMap(key => members.get(key)!.participants.map(participant => ({ participant, key, header: Math.max(HEADER_MIN, holder(text.participant(participant))) })));
  const column = new Map(columns.map((entry, index) => [entry.participant.id, index]));

  // Gap i lies between lifelines i and i + 1; the left edge holds what reaches past the first lifeline.
  const gaps = columns.slice(1).map((entry, index) => columns[index]!.header / 2 + entry.header / 2 + HEADER_GAP);
  let leftEdge = PROCESS_PAD + columns[0]!.header / 2;
  const need = (gap: number, width: number) => {
    if (gap < 0) leftEdge = Math.max(leftEdge, width);
    else if (gap < gaps.length) gaps[gap] = Math.max(gaps[gap]!, width);
  };
  const steps = [...flow.steps, ...flow.outcomes.flatMap(outcome => outcome.steps)];
  // The gaps fit the label with its status, so the boxes stay in place when the layer changes.
  for (const step of steps) {
    const from = column.get(step.from)!, to = column.get(step.to)!;
    const width = textWidth(labelText(step, marks.status(step)), 'label');
    if (from === to) need(from, SELF_LOOP + width + 2 * TEXT_PAD);
    else need(from < to ? from : from - 1, width + 2 * TEXT_PAD);
  }
  for (const outcome of flow.outcomes) {
    const at = column.get(outcome.terminal.participant)!;
    const half = holder(outcome.terminal.label) / 2 + TEXT_PAD;
    need(at - 1, half);
    need(at, half);
  }
  // Lifelines left to right. A process box is at least as wide as its title, and the next process box starts after it.
  const lifeline: number[] = [];
  const spans = new Map<string, { left: number; right: number }>();
  for (const [index, entry] of columns.entries()) {
    const previous = columns[index - 1];
    let x = previous === undefined ? MARGIN + leftEdge : lifeline[index - 1]! + gaps[index - 1]!;
    if (previous !== undefined && previous.key !== entry.key) x = Math.max(x, spans.get(previous.key)!.right + PROCESS_GAP + PROCESS_PAD + entry.header / 2);
    lifeline.push(x);
    const left = spans.get(entry.key)?.left ?? x - entry.header / 2 - PROCESS_PAD;
    spans.set(entry.key, { left, right: Math.max(x + entry.header / 2 + PROCESS_PAD, left + holder(text.process(members.get(entry.key)!.placement))) });
  }
  const x = (participant: string) => lifeline[column.get(participant)!]!;

  const boxes: SceneBox[] = [];
  const parts = new Map<string, SequencePart>();
  const titles = new Map<string, string>();
  const add = (box: SceneBox, part: SequencePart, title: string | null) => {
    boxes.push(box);
    parts.set(box.id, part);
    if (title !== null) titles.set(box.id, title);
  };
  const processBottom = MARGIN + PROCESS_TITLE + HEADER_HEIGHT + PROCESS_PAD;
  const rows: Row[] = [];
  const fragments: { outcome: ArchitectureMapFlowOutcomeV1; index: number; top: number; terminal: number }[] = [];
  let y = processBottom + ROW / 2 + LABEL_HEIGHT / 2;
  for (const step of flow.steps) { rows.push({ outcome: null, step, y }); y += ROW; }
  for (const [index, outcome] of flow.outcomes.entries()) {
    const top = y - ROW / 2 + FRAGMENT_GAP;
    y = top + BAND_HEIGHT + ROW / 2 + LABEL_HEIGHT / 2;
    for (const step of outcome.steps) { rows.push({ outcome: outcome.id, step, y }); y += ROW; }
    fragments.push({ outcome, index, top, terminal: y });
    y += ROW;
  }
  const bottom = y - ROW / 2;

  for (const key of order) {
    const { placement: where, participants } = members.get(key)!;
    const { left, right } = spans.get(key)!;
    const processId = `box:${key}`;
    add({ id: processId, parent: null, x: left, y: MARGIN, width: right - left, height: processBottom - MARGIN, kind: where.kind === 'process' ? 'box' : 'external' },
      { kind: 'process', placement: where }, text.process(where));
    for (const participant of participants) {
      const header = participantId(participant.id);
      const width = columns[column.get(participant.id)!]!.header;
      add({ id: header, parent: processId, x: x(participant.id) - width / 2, y: MARGIN + PROCESS_TITLE, width, height: HEADER_HEIGHT, kind: 'member' },
        { kind: 'participant', participant }, text.participant(participant));
      add({ id: `lifeline:${participant.id}`, parent: header, x: x(participant.id) - 0.5, y: MARGIN + PROCESS_TITLE + HEADER_HEIGHT, width: 1, height: bottom - MARGIN - PROCESS_TITLE - HEADER_HEIGHT, kind: 'lifeline' },
        { kind: 'lifeline' }, null);
    }
  }
  for (const { outcome, index, top, terminal } of fragments) {
    const named = [outcome.terminal.participant, ...outcome.steps.flatMap(step => [step.from, step.to])].map(x);
    const left = Math.min(...named) - HEADER_MIN / 2, right = Math.max(...named) + HEADER_MIN / 2;
    const band = `${fragmentTag(index)} ${outcome.label}`;
    add({ id: `fragment:${outcome.id}`, parent: null, x: left, y: top, width: Math.max(right - left, holder(band)), height: BAND_HEIGHT, kind: `fragment ${outcome.kind}` },
      { kind: 'fragment', outcome, index }, band);
    const width = holder(outcome.terminal.label);
    add({ id: `terminal:${outcome.id}`, parent: null, x: x(outcome.terminal.participant) - width / 2, y: terminal - TERMINAL_HEIGHT / 2, width, height: TERMINAL_HEIGHT, kind: `terminal ${outcome.kind}` },
      { kind: 'terminal', outcome }, outcome.terminal.label);
  }

  const routes: SceneRoute[] = [];
  const labels: SceneLabel[] = [];
  const messages = new Map<string, SequenceMessage>();
  for (const { outcome, step, y: at } of rows) {
    const id = messageId(outcome, step.id);
    const from = x(step.from), to = x(step.to);
    const tone = marks.tone(outcome, step);
    const status = marks.status(step);
    const label = labelText(step, tone === 'danger' ? status : null);
    const self = from === to;
    const side = to > from ? 0.5 : -0.5;
    const points: Point[] = self
      ? [[from + 0.5, at - 8], [from + SELF_LOOP, at - 8], [from + SELF_LOOP, at + 8], [from + 0.5, at + 8]]
      : [[from + side, at], [to - side, at]];
    // A label sits in the gap next to the sender, so it crosses no other lifeline.
    const centre: Point = self ? [from + SELF_LOOP + TEXT_PAD + textWidth(label, 'label') / 2, at]
      : [(from + (to > from ? from + gaps[column.get(step.from)!]! : from - gaps[column.get(step.from)! - 1]!)) / 2, at - LABEL_LIFT - LABEL_HEIGHT / 2];
    routes.push({ id, source: `lifeline:${step.from}`, target: `lifeline:${step.to}`, points, arrows: { start: false, end: true },
      kind: tone === null ? 'message' : `message-${tone}`, dashed: false, width: 1.5 });
    labels.push(labelAt(label, centre, id));
    messages.set(id, { outcome, step, tone, status });
  }
  const extent = sceneExtent(boxes, routes, MARGIN);
  return {
    scene: { boxes, routes, labels, extent: { width: Math.max(extent.width, ...labels.map(item => item.x + item.width + MARGIN)), height: extent.height } },
    parts, messages, lines: box => titles.has(box.id) ? [titles.get(box.id)!] : [],
  };
}
