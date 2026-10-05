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
    pattern: /(^|[^\w])([A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIALS)[A-Z0-9_]*)\s*([:=])\s*\S+/gi,
    replacement: '$1$2$3[REDACTED]',
  },
  {
    type: 'database_url',
    pattern: /(^|[^\w])((?:DATABASE_URL|POSTGRES_URL|MONGODB_URI|REDIS_URL))\s*([:=])\s*\S+/gi,
    replacement: '$1$2$3[REDACTED]',
  },
];

export function redactMcpText(input: string): McpRedactionResult {
  const redactions: McpRedaction[] = [];
  let text = input;

  for (const entry of REDACTION_PATTERNS) {
    const matches = text.match(entry.pattern);
    if (!matches) continue;
    redactions.push({ type: entry.type, count: matches.length });
    text = text.replace(entry.pattern, entry.replacement);
  }

  return { text, redactions };
}
