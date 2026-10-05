/** Shared token rules. Each caller uses a fresh RegExp to avoid lastIndex state. */
export const SECRET_TOKEN_PATTERNS = [
  { type: 'bearer_token', pattern: /Authorization:\s*Bearer\s+\S+/gi, replacement: 'Authorization: Bearer [REDACTED]' },
  { type: 'openai_key', pattern: /sk-[A-Za-z0-9_-]{20,}/g, replacement: 'sk-[REDACTED]' },
  { type: 'github_pat', pattern: /ghp_[A-Za-z0-9]{20,}/g, replacement: 'ghp_[REDACTED]' },
  { type: 'github_pat_v2', pattern: /github_pat_[A-Za-z0-9_]{30,}/g, replacement: 'github_pat_[REDACTED]' },
  { type: 'aws_key', pattern: /AKIA[0-9A-Z]{16}/g, replacement: 'AKIA[REDACTED]' },
  { type: 'jwt_token', pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, replacement: '[JWT REDACTED]' },
  { type: 'private_key', pattern: /-----BEGIN\s+(?:RSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/g, replacement: '[PRIVATE KEY REDACTED]' },
  { type: 'webhook_url', pattern: /https:\/\/(?:hooks\.slack\.com\/services|(?:canary\.|ptb\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks)\/[^\s<>"']+/gi, replacement: '[WEBHOOK REDACTED]' },
  { type: 'credential_url', pattern: /[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@[^\s<>"']+/gi, replacement: '[CREDENTIAL URL REDACTED]' },
  { type: 'telegram_token', pattern: /\b\d{5,16}:[A-Za-z0-9_-]{30,}\b/g, replacement: '[TELEGRAM TOKEN REDACTED]' },
] as const;

/** Assignment detection is case-sensitive. Empty and explicit absent values are safe. */
export function containsSecret(text: string): boolean {
  if (SECRET_TOKEN_PATTERNS.some(({ pattern }) => new RegExp(pattern.source, pattern.flags).test(text))) return true;
  const assignments = /(?:^|[^\w])([A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIALS|DATABASE_URL|POSTGRES_URL|MONGODB_URI|REDIS_URL)[A-Z0-9_]*)\s*[:=][ \t]*([^\r\n]*)/g;
  for (const match of text.matchAll(assignments)) {
    const value = match[2].trim().split(/\s+#/)[0].trim();
    if (value && !/^(?:null|none|""|'')$/i.test(value)) return true;
  }
  return false;
}
