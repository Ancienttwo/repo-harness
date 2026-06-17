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
  { type: 'bearer_token', pattern: /Authorization:\s*Bearer\s+\S+/gi, replacement: 'Authorization: Bearer [REDACTED]' },
  { type: 'openai_key', pattern: /sk-[A-Za-z0-9]{20,}/g, replacement: 'sk-[REDACTED]' },
  { type: 'github_pat', pattern: /ghp_[A-Za-z0-9]{20,}/g, replacement: 'ghp_[REDACTED]' },
  { type: 'github_pat_v2', pattern: /github_pat_[A-Za-z0-9_]{30,}/g, replacement: 'github_pat_[REDACTED]' },
  { type: 'aws_key', pattern: /AKIA[0-9A-Z]{16}/g, replacement: 'AKIA[REDACTED]' },
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
  { type: 'jwt_token', pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, replacement: '[JWT REDACTED]' },
  {
    type: 'private_key',
    pattern: /-----BEGIN\s+(?:RSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/g,
    replacement: '[PRIVATE KEY REDACTED]',
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
