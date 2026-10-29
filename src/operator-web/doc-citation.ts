import type { DocCitationV1 } from '../core/operator/doc-citation';
import { DOC_CITATION_MAX_LINES } from '../core/operator/doc-session-api';
import type { DocsFileV1 } from '../core/operator/docs';

/**
 * Browser side of the G8 citation: the same bytes the server's
 * `checkDocCitation` hashes, taken from the committed file the docs route
 * served. The console is served on loopback only, a secure context, so
 * `crypto.subtle` is present.
 */
export async function buildCitation(file: DocsFileV1, startLine: number, endLine: number): Promise<DocCitationV1> {
  if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || startLine < 1 || endLine < startLine || endLine > file.lines.length) {
    throw new Error('citation lines');
  }
  if (endLine - startLine + 1 > DOC_CITATION_MAX_LINES) throw new Error('citation over the line cap');
  // A line keeps its LF or CRLF; the last line of a file may have none.
  const bytes = new TextEncoder().encode(file.lines.slice(startLine - 1, endLine).map(line => line.text).join(''));
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return {
    path: file.path, start_line: startLine, end_line: endLine,
    range_sha256: Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join(''),
    file_sha256: file.sha256, commit: file.commit,
  };
}

/** `path:L3–L8`, or `path:L3` for one line. */
export function citationLabel(citation: Pick<DocCitationV1, 'path' | 'start_line' | 'end_line'>): string {
  const { path, start_line: start, end_line: end } = citation;
  return start === end ? `${path}:L${start}` : `${path}:L${start}–L${end}`;
}

const lineOf = (element: Element): number => Number(element.getAttribute('data-line'));

/**
 * Whether the selected part of `block` holds any of its content. A range that
 * ends at the first offset of the next block, as a triple click does, does
 * not select that block. A block without text, such as a diagram, counts when
 * the range covers one of its children.
 */
function selects(range: Range, block: Element): boolean {
  if (!range.intersectsNode(block)) return false;
  const part = block.ownerDocument.createRange();
  part.selectNodeContents(block);
  if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0) part.setStart(range.startContainer, range.startOffset);
  if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0) part.setEnd(range.endContainer, range.endOffset);
  if (part.collapsed) return false;
  return (block.textContent ?? '') === '' || part.toString() !== '';
}

/**
 * The source lines a selection covers. A source file renders one
 * `li[data-line]` per line. Markdown puts `data-line` on blocks; a top-level
 * block runs from its own line to the line before the next top-level block,
 * or to the end of the file, without its trailing blank lines. A selection
 * that touches no such block is null.
 */
export function selectionLineRange(selection: Selection, container: Element, file: DocsFileV1): { readonly start_line: number; readonly end_line: number } | null {
  if (selection.rangeCount === 0 || selection.isCollapsed) return null;
  const blocks = Array.from(container.querySelectorAll('[data-line]'))
    .filter(block => !container.contains(block.parentElement?.closest('[data-line]') ?? null));
  const ranges = Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index));
  const touched = blocks.flatMap((block, index) => ranges.some(range => selects(range, block)) ? [index] : []);
  if (touched.length === 0) return null;
  const first = blocks[touched[0]!]!;
  const lastIndex = touched.at(-1)!;
  const last = blocks[lastIndex]!;
  const start = lineOf(first);
  if (!Number.isSafeInteger(start) || start < 1 || start > file.lines.length) return null;
  if (last.closest('[data-docs-source]') !== null) return { start_line: start, end_line: Math.max(start, Math.min(lineOf(last), file.lines.length)) };
  const next = blocks[lastIndex + 1];
  let end = Math.min(next === undefined ? file.lines.length : lineOf(next) - 1, file.lines.length);
  while (end > start && file.lines[end - 1]!.text.trim() === '') end--;
  return { start_line: start, end_line: Math.max(start, end) };
}
