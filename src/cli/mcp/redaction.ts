import { SECRET_TOKEN_PATTERNS } from '../../core/security/secret-patterns';

export interface McpRedaction {
  type: string;
  count: number;
}

export interface McpRedactionResult {
  text: string;
  redactions: McpRedaction[];
}

interface RedactionPattern {
  type: string;
  pattern: RegExp;
  replacement: string;
}

const REDACTION_PATTERNS: RedactionPattern[] = [
  ...SECRET_TOKEN_PATTERNS,
  {
    type: 'secret_assignment',
    pattern: /(^|[^\w])((?=[A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIALS))[A-Z0-9_]*)\s*([:=])\s*\S+/gi,
    replacement: '$1$2$3[REDACTED]',
  },
  {
    type: 'database_url',
    pattern: /(^|[^\w])((?:DATABASE_URL|POSTGRES_URL|MONGODB_URI|REDIS_URL))\s*([:=])\s*\S+/gi,
    replacement: '$1$2$3[REDACTED]',
  },
];

const LINE_BREAK = /\r\n|\r|\n/g;

function lineBreakCount(text: string): number {
  return text.match(LINE_BREAK)?.length ?? 0;
}

// A replacement adds back the line breaks that it removed, so line N of the
// redacted text is line N of the input even when a match spans lines
// (private_key). A captured group such as `(^|[^\w])` can keep a break itself.
function replaceKeepingLineBreaks(replacement: string) {
  return (match: string, ...rest: unknown[]): string => {
    const groups = rest.slice(0, rest.findIndex((value) => typeof value === 'number'));
    const expanded = replacement.replace(/\$(\d)/g, (_, index: string) => String(groups[Number(index) - 1] ?? ''));
    return expanded + '\n'.repeat(lineBreakCount(match) - lineBreakCount(expanded));
  };
}

export function redactMcpText(input: string): McpRedactionResult {
  const redactions: McpRedaction[] = [];
  let text = input;

  for (const entry of REDACTION_PATTERNS) {
    const matches = text.match(entry.pattern);
    if (!matches) continue;
    redactions.push({ type: entry.type, count: matches.length });
    text = text.replace(entry.pattern, replaceKeepingLineBreaks(entry.replacement));
  }

  return { text, redactions };
}
