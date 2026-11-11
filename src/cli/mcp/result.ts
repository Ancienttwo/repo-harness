import { redactMcpText } from './redaction';

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

export function textResult(value: unknown): McpToolResult {
  return {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
    structuredContent: typeof value === 'string' ? undefined : value,
  };
}

/** `retryable` is written only when the caller sets it, so the error JSON of a module without it keeps its shape. */
export function errorResult(code: string, message: string, options: { details?: unknown; retryable?: boolean } = {}): McpToolResult {
  const value = {
    error: {
      code,
      message: redactMcpText(message).text,
      ...(options.retryable === undefined ? {} : { retryable: options.retryable }),
      ...(options.details === undefined ? {} : { details: options.details }),
    },
  };
  return { ...textResult(value), isError: true };
}
