import { canonicalMessageBytes, canonicalMessageDigest } from '../messages/mechanics';

export const CONNECTOR_CHALLENGE_PROTOCOL = 1 as const;

export class ConnectorChallengeError extends Error {
  readonly code = 'connector_challenge_unverified' as const;
}
export interface ConnectorChallengeV1 {
  readonly protocol: typeof CONNECTOR_CHALLENGE_PROTOCOL;
  readonly kind: 'repo-harness-connector-challenge';
  readonly intent_sha256: string;
  readonly base_main_sha: string;
  readonly source_session_ref: string;
  readonly targets: readonly { readonly kind: 'directory_entries' | 'text_line' | 'file_sha256'; readonly path: string; readonly line: number | null; readonly expected: string }[];
  readonly challenge_sha256: string;
}
export interface ConnectorChallengeReceiptV1 {
  readonly protocol: typeof CONNECTOR_CHALLENGE_PROTOCOL;
  readonly kind: 'repo-harness-connector-challenge-receipt';
  readonly challenge_sha256: string;
  readonly intent_sha256: string;
  readonly base_main_sha: string;
  readonly source_session_ref: string;
  readonly response_session_ref: string;
  readonly response_sha256: string;
  readonly connector_evidence: 'challenge_verified';
  readonly receipt_sha256: string;
}
function fail(message: string): never { throw new ConnectorChallengeError(message); }
export function buildConnectorChallenge(input: Omit<ConnectorChallengeV1, 'protocol' | 'kind' | 'challenge_sha256'>): ConnectorChallengeV1 {
  if (!/^sha256:[a-f0-9]{64}$/u.test(input.intent_sha256) || !/^[a-f0-9]{40}$/u.test(input.base_main_sha) || !input.source_session_ref.trim()) fail('invalid challenge identity');
  if (input.targets.length !== 3 || input.targets.map(t => t.kind).join(',') !== 'directory_entries,text_line,file_sha256') fail('three typed readback targets are required');
  for (const t of input.targets) {
    if (!t.path || t.path.startsWith('/') || t.path.split('/').some(p => p === '..' || !p) || typeof t.expected !== 'string'
      || (t.kind === 'text_line' ? !Number.isSafeInteger(t.line) || t.line! < 1 : t.line !== null)) fail('invalid challenge target');
  }
  const basis = { protocol: CONNECTOR_CHALLENGE_PROTOCOL, kind: 'repo-harness-connector-challenge' as const, intent_sha256: input.intent_sha256, base_main_sha: input.base_main_sha, source_session_ref: input.source_session_ref, targets: input.targets.map(t => Object.freeze({ kind: t.kind, path: t.path, line: t.line, expected: t.expected })) };
  return Object.freeze({ ...basis, challenge_sha256: canonicalMessageDigest(basis) });
}
export function validateConnectorChallenge(value: ConnectorChallengeV1): ConnectorChallengeV1 {
  const { protocol: _p, kind: _k, challenge_sha256: _d, ...input } = value;
  const built = buildConnectorChallenge(input);
  if (canonicalMessageBytes({ ...built }) !== canonicalMessageBytes({ ...value })) fail('challenge bytes or digest differ');
  return built;
}
export function renderConnectorChallenge(value: ConnectorChallengeV1, repository: string): string {
  const challenge = validateConnectorChallenge(value);
  return [
    `Read GitHub repository ${repository} at exact commit ${challenge.base_main_sha} through the Connector. Read only; do not mutate Issues or repository state.`,
    'Return only JSON with exactly base_main_sha and answers (three strings in target order). No markdown fences. Stop if readback is unavailable. Do not infer from the conversation or a supplied bundle.',
    JSON.stringify({ base_main_sha: challenge.base_main_sha, targets: challenge.targets.map(({ expected: _expected, ...target }) => target) }),
    'directory_entries: immediate entry names sorted lexicographically, joined with newline; text_line: exact requested line without its line terminator; file_sha256: lowercase SHA-256 of exact file bytes, without prefix.',
  ].join('\n\n');
}
export function verifyConnectorChallenge(input: { challenge: ConnectorChallengeV1; response: string; response_session_ref: string; model_verified: boolean }): ConnectorChallengeReceiptV1 {
  const c = validateConnectorChallenge(input.challenge);
  if (!input.model_verified || !input.response_session_ref.trim()) fail('challenge requires a verified model and response session');
  let raw: unknown;
  try { raw = JSON.parse(input.response); } catch { return fail('challenge response must be exact JSON'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('invalid challenge response');
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).sort().join(',') !== 'answers,base_main_sha' || r.base_main_sha !== c.base_main_sha
    || !Array.isArray(r.answers) || r.answers.length !== 3 || r.answers.some((answer, i) => answer !== c.targets[i]!.expected)) fail('exact-SHA challenge answers do not match');
  const basis = { protocol: CONNECTOR_CHALLENGE_PROTOCOL, kind: 'repo-harness-connector-challenge-receipt' as const, challenge_sha256: c.challenge_sha256,
    intent_sha256: c.intent_sha256, base_main_sha: c.base_main_sha, source_session_ref: c.source_session_ref,
    response_session_ref: input.response_session_ref, response_sha256: canonicalMessageDigest({ response: input.response }), connector_evidence: 'challenge_verified' as const };
  return Object.freeze({ ...basis, receipt_sha256: canonicalMessageDigest(basis) });
}
