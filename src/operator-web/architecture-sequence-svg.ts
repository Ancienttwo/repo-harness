// One flow of the sequence base map as a standalone SVG file, drawn from the
// same layout as the canvas. The file carries its own light palette, because
// the page tokens do not exist outside the page.

import { SEQUENCE_COLUMN, SEQUENCE_HEADER, type SequenceBox, type SequenceLayout } from './architecture-sequence-layout';

export interface SequenceSvgText {
  /** The title of a process box. */
  readonly box: (box: SequenceBox) => string;
  /** The name and kind of the model node of a participant. */
  readonly participant: (nodeId: string) => { readonly name: string; readonly kind: string };
}

const STYLE = [
  'text{font-family:system-ui,sans-serif;font-size:11px;fill:#1F2328}',
  '.box{fill:#F2F4F7;stroke:#D3D9E0}.box.external,.box.unknown{fill:none;stroke-dasharray:6 4}',
  '.title{fill:#5B6573}.header{fill:#FFFFFF;stroke:#D3D9E0}.header.external-system{stroke-dasharray:6 4}.name{font-size:12px;font-weight:600}',
  '.lifeline{stroke:#8C96A3;stroke-dasharray:4 4}.message{stroke:#5B6573;stroke-width:1.5;fill:none}',
  '.fragment{stroke-dasharray:5 4}.fragment.success{fill:#EDF7F0;stroke:#B4D9BF}.fragment.error{fill:#FBEFEF;stroke:#E9C0C0}',
  '.success{fill:#2C6A3D}.error{fill:#B42318}text.success,text.error{font-weight:600}',
].join('');

const escape = (value: string) => value.replace(/[&<>"]/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);

/** Width of the terminal label on the canvas, centred on the participant's lifeline. */
const TERMINAL_WIDTH = 180;
/** Text inset from the edge of its shape. */
const INSET = 8;

/**
 * Shortens a label to `width` pixels at `size` px, counting 0.6 em per character; the full label
 * stays in the element's `<title>`. Every caller passes the width between the label's own bounds.
 */
function fit(label: string, width: number, size = 11): string {
  const room = Math.max(1, Math.floor(width / (size * 0.6)));
  return label.length <= room ? label : `${label.slice(0, room - 1)}…`;
}

export function sequenceSvg(layout: SequenceLayout, text: SequenceSvgText): string {
  const parts: string[] = [];
  for (const box of layout.boxes) {
    parts.push(`<rect class="box ${box.placement.kind}" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="12"/>`,
      `<text class="title" x="${box.x + 12}" y="${box.y + box.height - layout.boxTitle / 2 + 4}">${escape(fit(text.box(box), box.width - 24))}</text>`);
  }
  for (const fragment of layout.fragments) {
    const kind = fragment.outcome.kind;
    const tag = fragment.index === 0 ? 'alt' : 'else';
    parts.push(`<rect class="fragment ${kind}" x="${fragment.x}" y="${fragment.y}" width="${fragment.width}" height="${fragment.height}" rx="8"/>`,
      `<text x="${fragment.x + INSET}" y="${fragment.y + 16}"><title>${escape(fragment.outcome.label)}</title><tspan class="${kind}">${tag}</tspan> ${escape(fit(fragment.outcome.label, fragment.width - 2 * INSET - (tag.length + 1) * 11 * 0.6))}</text>`);
  }
  const width = SEQUENCE_COLUMN - 24;
  for (const column of layout.columns) {
    const { name, kind } = text.participant(column.participant.node);
    parts.push(`<line class="lifeline" x1="${column.x}" y1="${layout.headerY + SEQUENCE_HEADER - 8}" x2="${column.x}" y2="${layout.bottom}"/>`,
      `<rect class="header ${escape(kind)}" x="${column.x - width / 2}" y="${layout.headerY}" width="${width}" height="${SEQUENCE_HEADER - 8}" rx="8"/>`,
      `<text class="name" x="${column.x}" y="${layout.headerY + (SEQUENCE_HEADER - 8) / 2 + 4}" text-anchor="middle"><title>${escape(name)}</title>${escape(fit(name, width - 2 * INSET, 12))}</text>`);
  }
  for (const message of layout.messages) {
    const self = message.from === message.to;
    const line = self
      ? `<path class="message" d="M${message.from} ${message.y - 8}h${SEQUENCE_COLUMN / 4}v12h-${SEQUENCE_COLUMN / 4 - 6}" marker-end="url(#arrow)"/>`
      : `<line class="message" x1="${message.from}" y1="${message.y}" x2="${message.to}" y2="${message.y}" marker-end="url(#arrow)"/>`;
    // A self message's label starts at its lifeline and keeps to the right half of the column.
    const span = self ? SEQUENCE_COLUMN / 2 - 6 - INSET : Math.abs(message.to - message.from) - 2 * INSET;
    const x = self ? message.from + 6 : (message.from + message.to) / 2;
    parts.push(line, `<text x="${x}" y="${message.y - 6}"${self ? '' : ' text-anchor="middle"'}><title>${escape(message.step.label)}</title>${escape(fit(message.step.label, span))}</text>`);
  }
  for (const terminal of layout.terminals) {
    const kind = layout.fragments.find(fragment => fragment.outcome.id === terminal.outcome)!.outcome.kind;
    // Centred on the participant as on the canvas, so the rightmost column keeps the label inside the file.
    parts.push(`<text class="${kind}" x="${terminal.x}" y="${terminal.y + 4}" text-anchor="middle"><title>${escape(terminal.label)}</title>${escape(fit(terminal.label, TERMINAL_WIDTH - 2 * INSET))}</text>`);
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">`,
    `<style>${STYLE}</style>`,
    '<defs><marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" fill="#5B6573"/></marker></defs>',
    `<rect width="${layout.width}" height="${layout.height}" fill="#FFFFFF"/>`,
    ...parts,
    '</svg>',
  ].join('\n');
}
