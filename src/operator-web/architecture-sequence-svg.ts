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

/** Font of each label class; `textWidth` and the stylesheet both read it. */
export const SEQUENCE_SVG_FONT = {
  title: { size: 11, bold: false },
  'fragment-label': { size: 11, bold: false },
  name: { size: 12, bold: true },
  'message-label': { size: 11, bold: false },
  terminal: { size: 11, bold: true },
} as const;
/** Width of a participant header, as on the canvas. */
export const SEQUENCE_SVG_HEADER_WIDTH = SEQUENCE_COLUMN - 24;
/** Width of a terminal label, centred on the participant's lifeline as on the canvas. */
export const SEQUENCE_SVG_TERMINAL_WIDTH = 180;
/** Text inset from the edge of its shape. */
const INSET = 8;

const STYLE = [
  'text{font-family:system-ui,sans-serif;font-size:11px;fill:#1F2328}',
  '.box{fill:#F2F4F7;stroke:#D3D9E0}.box.external,.box.unknown{fill:none;stroke-dasharray:6 4}',
  '.title{fill:#5B6573}.header{fill:#FFFFFF;stroke:#D3D9E0}.header.external-system{stroke-dasharray:6 4}',
  `.name{font-size:${SEQUENCE_SVG_FONT.name.size}px;font-weight:600}.terminal{font-weight:600}`,
  '.lifeline{stroke:#8C96A3;stroke-dasharray:4 4}.message{stroke:#5B6573;stroke-width:1.5;fill:none}',
  '.fragment{stroke-dasharray:5 4}.fragment.success{fill:#EDF7F0;stroke:#B4D9BF}.fragment.error{fill:#FBEFEF;stroke:#E9C0C0}',
  '.success{fill:#2C6A3D}.error{fill:#B42318}',
].join('');

const escape = (value: string) => value.replace(/[&<>"]/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);

// Advance widths in em, at or above each printable ASCII glyph of system-ui (SF Pro) as Chrome draws it
// at weights 400 and 600: CJK 0.94, `W` 0.92, `%` 0.81, `O` 0.73, `&` 0.67, digits 0.62, lower case
// up to 0.58 apart from `m` and `w`; weight 600 adds up to 7 %.
const WIDE = new Set(['m', 'w', 'M', 'W', '@', '%']);
const BROAD = new Set(['#', '$', '&', '+', '<', '=', '>', '^', '~']);
const BOLD = 1.07;
const charWidth = (char: string): number => char.charCodeAt(0) >= 128 ? 1
  : WIDE.has(char) ? 0.95 : (char >= 'A' && char <= 'Z') || BROAD.has(char) ? 0.75 : char >= '0' && char <= '9' ? 0.62 : 0.58;

/** The estimated width of `text` in px. Every non-ASCII character counts 1 em, so CJK is never undercounted. */
export function textWidth(text: string, size: number, bold: boolean): number {
  let em = 0;
  for (const char of text) em += charWidth(char);
  return em * size * (bold ? BOLD : 1);
}

/** Shortens a label to `width` px by `textWidth`; the full label stays in the element's `<title>`. */
function fit(label: string, width: number, font: { readonly size: number; readonly bold: boolean }): string {
  if (textWidth(label, font.size, font.bold) <= width) return label;
  let kept = '';
  for (const char of label) {
    if (textWidth(`${kept}${char}…`, font.size, font.bold) > width) break;
    kept += char;
  }
  return `${kept}…`;
}

/** A label: its class names the font, `<title>` keeps the full text, and the visible text fits the width between its own bounds. */
function label(className: keyof typeof SEQUENCE_SVG_FONT, x: number, y: number, middle: boolean, full: string, width: number, extra = '', lead = ''): string {
  return `<text class="${className}${extra}" x="${x}" y="${y}"${middle ? ' text-anchor="middle"' : ''}><title>${escape(full)}</title>${lead}${escape(fit(full, width, SEQUENCE_SVG_FONT[className]))}</text>`;
}

export function sequenceSvg(layout: SequenceLayout, text: SequenceSvgText): string {
  const parts: string[] = [];
  for (const box of layout.boxes) {
    parts.push(`<rect class="box ${box.placement.kind}" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="12"/>`,
      label('title', box.x + 12, box.y + box.height - layout.boxTitle / 2 + 4, false, text.box(box), box.width - 24));
  }
  for (const fragment of layout.fragments) {
    const kind = fragment.outcome.kind;
    const tag = `${fragment.index === 0 ? 'alt' : 'else'} `;
    const font = SEQUENCE_SVG_FONT['fragment-label'];
    parts.push(`<rect class="fragment ${kind}" x="${fragment.x}" y="${fragment.y}" width="${fragment.width}" height="${fragment.height}" rx="8"/>`,
      label('fragment-label', fragment.x + INSET, fragment.y + 16, false, fragment.outcome.label, fragment.width - 2 * INSET - textWidth(tag, font.size, font.bold), '',
        `<tspan class="${kind}">${tag.trim()}</tspan> `));
  }
  for (const column of layout.columns) {
    const { name, kind } = text.participant(column.participant.node);
    const width = SEQUENCE_SVG_HEADER_WIDTH;
    parts.push(`<line class="lifeline" x1="${column.x}" y1="${layout.headerY + SEQUENCE_HEADER - 8}" x2="${column.x}" y2="${layout.bottom}"/>`,
      `<rect class="header ${escape(kind)}" x="${column.x - width / 2}" y="${layout.headerY}" width="${width}" height="${SEQUENCE_HEADER - 8}" rx="8"/>`,
      label('name', column.x, layout.headerY + (SEQUENCE_HEADER - 8) / 2 + 4, true, name, width - 2 * INSET));
  }
  for (const message of layout.messages) {
    const self = message.from === message.to;
    parts.push(self
      ? `<path class="message" d="M${message.from} ${message.y - 8}h${SEQUENCE_COLUMN / 4}v12h-${SEQUENCE_COLUMN / 4 - 6}" marker-end="url(#arrow)"/>`
      : `<line class="message" x1="${message.from}" y1="${message.y}" x2="${message.to}" y2="${message.y}" marker-end="url(#arrow)"/>`);
    // A self message's label starts at its lifeline and keeps to the right half of the column.
    parts.push(self
      ? label('message-label', message.from + 6, message.y - 6, false, message.step.label, SEQUENCE_COLUMN / 2 - 6 - INSET)
      : label('message-label', (message.from + message.to) / 2, message.y - 6, true, message.step.label, Math.abs(message.to - message.from) - 2 * INSET));
  }
  for (const terminal of layout.terminals) {
    const kind = layout.fragments.find(fragment => fragment.outcome.id === terminal.outcome)!.outcome.kind;
    parts.push(label('terminal', terminal.x, terminal.y + 4, true, terminal.label, SEQUENCE_SVG_TERMINAL_WIDTH - 2 * INSET, ` ${kind}`));
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
