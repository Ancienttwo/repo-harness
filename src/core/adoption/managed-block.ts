import type { AppendManagedBlockOperation, ManagedBlockMarker } from "./operations";

export function managedBlockMarker(marker: string): ManagedBlockMarker {
  return {
    begin: `# BEGIN: ${marker}`,
    end: `# END: ${marker}`,
  };
}

export function renderManagedBlock(operation: AppendManagedBlockOperation): string {
  const marker = managedBlockMarker(operation.marker);
  return [marker.begin, operation.content.trimEnd(), marker.end].join("\n");
}

function allMarkers(operation: AppendManagedBlockOperation): readonly ManagedBlockMarker[] {
  return [managedBlockMarker(operation.marker), ...(operation.legacyMarkers ?? [])];
}

function findMarkerRange(lines: readonly string[], marker: ManagedBlockMarker): { start: number; end: number } | null {
  const start = lines.findIndex((line) => line === marker.begin);
  if (start === -1) return null;
  const end = lines.findIndex((line, index) => index > start && line === marker.end);
  if (end === -1) return { start, end: -1 };
  return { start, end };
}

function normalizeMarkerLine(line: string): string {
  return line.replace(/\r$/, "");
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function newlineFor(existing: string): string {
  return existing.includes("\r\n") ? "\r\n" : "\n";
}

function withNewlineStyle(value: string, newline: string): string {
  return value.split("\n").join(newline);
}

function endsWithLineBreak(value: string): boolean {
  return value.endsWith("\n") || value.endsWith("\r\n");
}

export interface ManagedBlockUpdate {
  readonly ok: boolean;
  readonly changed: boolean;
  /** The existing block differs from the rendering and has no proof that it is managed; it is kept. */
  readonly kept?: string;
  readonly content?: string;
  readonly error?: string;
}

/**
 * `isManaged` receives an existing block that differs from the rendering, from
 * its BEGIN line to its END line joined by `\n`. Only a block that it proves
 * managed is replaced; any other block is kept and named in `kept`.
 */
export function upsertManagedBlock(
  existing: string,
  operation: AppendManagedBlockOperation,
  isManaged: (block: string) => boolean,
): ManagedBlockUpdate {
  const block = renderManagedBlock(operation);
  const newline = newlineFor(existing);
  const normalizedExisting = normalizeLineEndings(existing.trimEnd());
  if (normalizedExisting === block) {
    return { ok: true, changed: false, content: endsWithLineBreak(existing) ? existing : `${existing}${newline}` };
  }

  const lines = existing.split("\n").map(normalizeMarkerLine);
  for (const marker of allMarkers(operation)) {
    const range = findMarkerRange(lines, marker);
    if (!range) continue;
    if (range.end === -1) {
      return { ok: false, changed: false, error: `managed block is missing end marker: ${marker.end}` };
    }
    const currentBlock = lines.slice(range.start, range.end + 1).join("\n");
    if (currentBlock === block) {
      return { ok: true, changed: false, content: endsWithLineBreak(existing) ? existing : `${existing}${newline}` };
    }
    if (!isManaged(currentBlock)) return { ok: true, changed: false, kept: marker.begin, content: existing };
    const nextLines = [...lines.slice(0, range.start), ...block.split("\n"), ...lines.slice(range.end + 1)];
    return { ok: true, changed: true, content: `${withNewlineStyle(nextLines.join("\n").trimEnd(), newline)}${newline}` };
  }

  const prefix = existing.trimEnd();
  const styledBlock = withNewlineStyle(block, newline);
  const content = prefix ? `${prefix}${newline}${newline}${styledBlock}${newline}` : `${styledBlock}${newline}`;
  return { ok: true, changed: true, content };
}

