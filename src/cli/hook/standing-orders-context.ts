import { readFileSync } from 'fs';
import { join } from 'path';

export const STANDING_ORDERS_MARKER = '[repo-harness:standing-orders]';
export const STANDING_ORDERS_MAX_BYTES = 1500;
const REGISTER_PATH = '.ai/harness/standing-orders.md';
const TRUNCATION_LINE = `\n... (truncated; read ${REGISTER_PATH})`;

/** Read one checkout's register. Invalid or unreadable input adds no block. */
export function resolveStandingOrdersBlock(repoRoot: string): string | null {
  try {
    const content = readFileSync(join(repoRoot, REGISTER_PATH), 'utf8');
    if (!content.trim()) return null;
    const lines = content.split(/\r?\n/);
    if (lines.at(-1) === '') lines.pop();
    if (!lines.every((line, index) => {
      const prefix = `${index + 1}. `;
      return line.startsWith(prefix) && line.slice(prefix.length).trim().length > 0;
    })) return null;

    const block = `${STANDING_ORDERS_MARKER}\n${content}`;
    const bytes = Buffer.from(block, 'utf8');
    if (bytes.byteLength <= STANDING_ORDERS_MAX_BYTES) return block;
    let end = STANDING_ORDERS_MAX_BYTES - Buffer.byteLength(TRUNCATION_LINE, 'utf8');
    // Keep the original prefix and stop before a partial UTF-8 character.
    while ((bytes[end]! & 0xc0) === 0x80) end -= 1;
    return bytes.subarray(0, end).toString('utf8') + TRUNCATION_LINE;
  } catch {
    return null;
  }
}

/** Both hosts append the same bytes. An existing marker suppresses a repeat. */
export function appendStandingOrders(repoRoot: string, context: string): string {
  if (context.includes(STANDING_ORDERS_MARKER)) return context;
  const block = resolveStandingOrdersBlock(repoRoot);
  return block === null ? context : `${context}\n\n${block}`;
}
