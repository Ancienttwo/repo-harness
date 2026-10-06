import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

export interface OracleSessionEvidence {
  providerSessionId?: string;
  observation?: {
    source: 'oracle-session-metadata';
    sessionId: string;
    parentSessionId: string | null;
    modelSelection?: unknown;
    appSelection?: unknown;
    thinkingSelection?: unknown;
  };
  /** Oracle recorded `browser.runtime.promptSubmitted: true` for this session. */
  promptSubmitted?: true;
  evidenceError?: string;
  networkCapture?: OracleNetworkCapture;
  conversationCapture?: OracleConversationCapture;
}

function readJson(path: string): Record<string, unknown> {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new Error('invalid evidence file');
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid evidence object');
  return value as Record<string, unknown>;
}

/** The invocation owns the descriptor path; console output never supplies session identity. */
export function readOracleSessionEvidence(path: string, oracleHome: string, parentSessionId?: string): OracleSessionEvidence {
  try {
    const handle = readJson(path);
    if (handle.protocol !== 1 || handle.kind !== 'oracle-session'
      || typeof handle.sessionId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(handle.sessionId)
      || handle.parentSessionId !== (parentSessionId ?? null)
      || Object.keys(handle).some(key => !['protocol', 'kind', 'sessionId', 'parentSessionId'].includes(key))) throw new Error('invalid session descriptor');
    const metadata = readJson(join(oracleHome, 'sessions', handle.sessionId, 'meta.json'));
    if (metadata.id !== handle.sessionId) throw new Error('session metadata identity mismatch');
    const browser = metadata.browser;
    const observation = browser && typeof browser === 'object' && !Array.isArray(browser) ? browser as Record<string, unknown> : {};
    const runtime = observation.runtime as { promptSubmitted?: unknown } | undefined;
    return {
      ...(runtime?.promptSubmitted === true ? { promptSubmitted: true as const } : {}),
      providerSessionId: handle.sessionId,
      observation: {
        source: 'oracle-session-metadata', sessionId: handle.sessionId, parentSessionId: handle.parentSessionId as string | null,
        modelSelection: observation.modelSelection,
        appSelection: observation.appSelection,
        thinkingSelection: observation.thinkingSelection,
      },
    };
  } catch (error) {
    return { evidenceError: error instanceof Error ? error.message : String(error) };
  }
}

export interface OracleNetworkCapture {
  readonly status: 'captured' | 'empty' | 'incomplete' | 'missing' | 'invalid';
  readonly path: string;
  readonly sha256: string | null;
  readonly bytes: number | null;
  readonly sessionId: string | null;
}

function readPrivateEvidenceBytes(path: string, limit: number, requirePrivate = false): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit || (requirePrivate && ((stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())))) throw new Error('invalid evidence file');
    const bytes = readFileSync(fd);
    if (bytes.length > limit) throw new Error('invalid evidence file');
    return bytes;
  } finally { closeSync(fd); }
}

/** Retain transport provenance only; captured streams are not tool or revision receipts. */
export function readOracleNetworkCapture(path: string, sessionId: string | undefined, origin: string): OracleNetworkCapture {
  let bytes: Buffer;
  try { bytes = readPrivateEvidenceBytes(path, 64 * 1024 * 1024); }
  catch (error) {
    return { status: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'invalid', path, sha256: null, bytes: null, sessionId: null };
  }
  const basis = { path, sha256: 'sha256:' + createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, sessionId: null };
  try {
    if (!sessionId) throw new Error('descriptor unavailable');
    const lines = bytes.toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line) as Record<string, unknown>);
    const first = lines[0], last = lines.at(-1);
    // The exporter assigns a sequence before dropping the single over-limit record.
    const byteLimited = last?.event === 'capture_end' && last.status === 'incomplete'
      && Array.isArray(last.reasons) && last.reasons.includes('byte_limit');
    if (lines.length < 2 || lines.some((line, index) => !line || Array.isArray(line)
      || line.sequence !== index + 1 + (byteLimited && index === lines.length - 1 ? 1 : 0))) throw new Error('invalid capture sequence');
    if (!first || !last || first.event !== 'capture_start' || first.protocol !== 1 || first.kind !== 'oracle-page-response-streams'
      || first.sessionId !== sessionId || first.origin !== origin
      || last.event !== 'capture_end' || !['captured', 'empty', 'incomplete'].includes(last.status as string)
      || !Number.isInteger(last.streams) || (last.streams as number) < 0 || (last.streams as number) > 256
      || !Array.isArray(last.reasons) || !last.reasons.every(reason => typeof reason === 'string')
      || (last.status === 'empty' && last.streams !== 0) || (last.status === 'captured' && last.streams === 0)
      || (last.status !== 'incomplete' && last.reasons.length !== 0)
      || lines.slice(1, -1).some(line => line.event === 'capture_start' || line.event === 'capture_end')) throw new Error('invalid capture binding');
    return { ...basis, sessionId, status: last.status as 'captured' | 'empty' | 'incomplete' };
  } catch { return { ...basis, status: 'invalid' }; }
}

export interface OracleConversationCapture {
  readonly status: 'captured' | 'missing' | 'invalid';
  readonly sessionId: string | null;
  readonly conversationId: string | null;
  readonly sha256: string | null;
  readonly history: unknown;
}

/** Only the invocation-owned path and completed session metadata can supply history. */
export function readOracleConversationCapture(path: string, sessionId: string | undefined, oracleHome: string): OracleConversationCapture {
  const invalid = (status: 'missing' | 'invalid'): OracleConversationCapture => ({status,sessionId:null,conversationId:null,sha256:null,history:null});
  try {
    const stat=lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) return invalid('invalid');
    const bytes=readPrivateEvidenceBytes(path, 12*1024*1024, true);
    const value=JSON.parse(bytes.toString('utf8'));
    if (!sessionId || value.protocol!==1 || value.kind!=='oracle-session-conversation-history' || value.sessionId!==sessionId) return invalid('invalid');
    const meta=readJson(join(oracleHome,'sessions',sessionId,'meta.json'));
    const runtime=(meta.browser as {runtime?:{conversationId?:string;promptSubmitted?:boolean}}|undefined)?.runtime;
    if(meta.id!==sessionId || meta.status!=='completed' || runtime?.promptSubmitted!==true || value.history?.conversationId!==runtime.conversationId) return invalid('invalid');
    return {status:'captured',sessionId,conversationId:runtime.conversationId!,sha256:'sha256:'+createHash('sha256').update(bytes).digest('hex'),history:value.history};
  } catch(error) { return invalid((error as NodeJS.ErrnoException).code==='ENOENT'?'missing':'invalid'); }
}
