import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, realpathSync, openSync, readSync, closeSync, constants } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { activeMemory, parseStrategyDocument, type Evidence, type StrategyPacket } from '../../core/strategy/contracts';
import { resolveEffectiveStateReadOnly } from '../state/resolve-effective-state';

export const STRATEGY_DOCUMENT = 'docs/strategy/context.json';
const FILE_LIMIT = 65536;
const TOTAL_LIMIT = 1048576;
const OUTPUT_LIMIT = 131072;
export const strategyHash = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex');

function git(root: string, args: string[], maxBuffer = FILE_LIMIT): string {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', maxBuffer, timeout: 5000,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
}
export function strategyRoot(repo: string): string {
  const root = realpathSync(resolve(repo));
  if (realpathSync(git(root, ['rev-parse', '--show-toplevel']).trim()) !== root) throw new Error('Strategy requires the exact repository worktree root');
  return root;
}
/** Reject every symlink component and every nested repository before reading. */
function scopedPath(root: string, path: string): string {
  if (isAbsolute(path) || /^[A-Za-z]:/.test(path) || /[\0\r\n]/.test(path) || path.includes('\\') || path.split('/').some(p => !p || p === '.' || p === '..' || p === '.git')) throw new Error('Invalid repository-relative source path');
  let current = root;
  const parts = path.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = join(current, parts[i]!);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error('Symlink sources are forbidden');
    if (i < parts.length - 1 && (!stat.isDirectory() || existsSync(join(current, '.git')))) throw new Error('Nested repository or non-directory source');
  }
  const actual = realpathSync(current);
  const rel = relative(root, actual);
  if (!rel || rel.startsWith(`..${sep}`) || isAbsolute(rel) || !lstatSync(actual).isFile()) throw new Error('Source escapes repository or is not a file');
  return actual;
}

export class StrategySourceDriftError extends Error {}

export class StrategyReader {
  private bytes = 0;
  constructor(readonly root: string) {}
  read(path: string): string {
    const file = scopedPath(this.root, path);
    // O_NOFOLLOW protects the final component against replacement after preflight.
    const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const buffer = Buffer.alloc(FILE_LIMIT + 1);
      const length = readSync(fd, buffer, 0, buffer.length, 0);
      this.bytes += length;
      if (length > FILE_LIMIT || this.bytes > TOTAL_LIMIT) throw new Error('Strategy source byte limit exceeded');
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
    } finally { closeSync(fd); }
  }
  verify(e: Evidence): string {
    const body = this.read(e.path);
    if (strategyHash(body) !== e.sha256) throw new StrategySourceDriftError(`Source hash drift: ${e.path}`);
    const historical = git(this.root, ['show', `${e.revision}:${e.path}`]);
    if (strategyHash(historical) !== e.sha256) throw new StrategySourceDriftError(`Unproved source revision: ${e.path}`);
    return body;
  }
}

export function strategyStatus(repo: string): { enabled: boolean; mode: 'context_packet_only'; document: string } {
  const root = strategyRoot(repo);
  // Presence is readiness only. This command never loads the document or lessons.
  return { enabled: existsSync(join(root, STRATEGY_DOCUMENT)), mode: 'context_packet_only', document: STRATEGY_DOCUMENT };
}

export function collectStrategyContext(repo: string, opts: { nowMs?: number; load?: string[]; topics?: string[] } = {}): StrategyPacket {
  const root = strategyRoot(repo);
  const nowMs = opts.nowMs ?? Date.now();
  if (!Number.isFinite(nowMs)) throw new Error('Invalid clock');
  const load = opts.load ?? [];
  const topics = opts.topics ?? [];
  if (load.length > 8 || new Set(load).size !== load.length || topics.length > 16 || topics.some(t => !t || t.length > 500)) throw new Error('Invalid retrieval selection');
  const reader = new StrategyReader(root);
  const raw = reader.read(STRATEGY_DOCUMENT);
  const doc = parseStrategyDocument(JSON.parse(raw));
  const revision = git(root, ['rev-parse', 'HEAD']).trim();
  const unknowns: string[] = [];
  const sources: Evidence[] = [{ path: STRATEGY_DOCUMENT, sha256: strategyHash(raw), revision }];
  for (const e of [...doc.evidence].sort((a, b) => a.path.localeCompare(b.path, 'en'))) {
    try { reader.verify(e); sources.push(e); }
    catch { unknowns.push(`Unverified evidence: ${e.path}`); }
  }
  const proved = new Set(sources.slice(1).map(e => e.path));
  for (const c of [doc.goal, ...doc.intendedResults, ...doc.observedOutcomes, ...doc.gaps, ...doc.architecture]) {
    if (c.kind === 'fact' && (!c.evidence.length || c.evidence.some(p => !proved.has(p)))) unknowns.push(`Unsupported fact: ${c.text}`);
  }
  for (const c of doc.realityConstraints) {
    if (!c.evidence.length || c.evidence.some(p => !proved.has(p))) unknowns.push(`Unsupported constraint: ${c.key}`);
  }
  let stateRevision = 'unavailable';
  try { stateRevision = resolveEffectiveStateReadOnly(root, nowMs, { targetPaths: [], operationKind: 'inspect' }).state_revision; }
  catch { unknowns.push('Effective state unavailable'); }
  const eligible = activeMemory(doc, nowMs, revision, topics);
  const memory = eligible.map(m => ({ ...m, authority: 'unverified_summary' as const }));
  const bodies: StrategyPacket['bodies'] = [];
  for (const id of [...load].sort()) {
    const m = eligible.find(m => m.id === id);
    if (!m?.body) throw new Error(`Memory absent, inactive or outside selection: ${id}`);
    if (!m.provenance.length || m.provenance.some(p => !proved.has(p))) throw new Error(`Memory provenance unavailable: ${id}`);
    const text = reader.verify(m.body);
    const bounded = new TextDecoder().decode(Buffer.from(text).subarray(0, 8192), { stream: true });
    bodies.push({ id, text: bounded, sha256: m.body.sha256, truncated: bounded !== text });
  }
  const { memory: _memory, ...document } = doc;
  const packet: StrategyPacket = {
    version: 1, mode: 'context_packet_only', executionAuthorized: false, repository: root,
    revision, stateRevision, sources, document, memory, bodies, unknowns,
    truncated: bodies.some(b => b.truncated), digest: '',
  };
  // Fixed envelope bound. Never emit a partial JSON string or hide truncation.
  while (Buffer.byteLength(JSON.stringify(packet)) > OUTPUT_LIMIT && packet.memory.length) { packet.memory.pop(); packet.truncated = true; }
  while (Buffer.byteLength(JSON.stringify(packet)) > OUTPUT_LIMIT && packet.bodies.length) { packet.bodies.pop(); packet.truncated = true; }
  if (Buffer.byteLength(JSON.stringify(packet)) > OUTPUT_LIMIT - 64) throw new Error('Context summary exceeds output limit');
  // Digest includes all binding and selection fields, excludes only itself.
  packet.digest = strategyHash(JSON.stringify(packet));
  // Re-read every proved source and selected body. Fail if collection crossed edits.
  if (reader.read(STRATEGY_DOCUMENT) !== raw || git(root, ['rev-parse', 'HEAD']).trim() !== revision) throw new Error('Strategy sources changed during collection');
  for (const e of sources.slice(1)) if (strategyHash(reader.read(e.path)) !== e.sha256) throw new Error('Strategy evidence changed during collection');
  for (const id of load) { const m = eligible.find(m => m.id === id)!; if (strategyHash(reader.read(m.body!.path)) !== m.body!.sha256) throw new Error('Memory changed during collection'); }
  return packet;
}

export function readStrategyProposal(repo: string, path: string): unknown {
  return JSON.parse(new StrategyReader(strategyRoot(repo)).read(path));
}
