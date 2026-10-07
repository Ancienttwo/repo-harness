import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, realpathSync, openSync, readSync, closeSync, fstatSync, constants } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { activeMemory, parseStrategyDocument, validateProposal, type Evidence, type StrategyPacket } from '../../core/strategy/contracts';

export const STRATEGY_DOCUMENT = 'docs/strategy/context.json';
const FILE_LIMIT = 65536;
const TOTAL_LIMIT = 1048576;
const OUTPUT_LIMIT = 131072;
export const strategyHash = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex');

function requestReader(repo: string): StrategyReader {
  const reader = new StrategyReader(realpathSync(resolve(repo)));
  reader.assertRoot();
  return reader;
}
export function strategyRoot(repo: string): string { return requestReader(repo).root; }
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

export class StrategyBudgetError extends Error {}

export class StrategyReader {
  private bytes = 0;
  constructor(readonly root: string) {}
  get bytesRead(): number { return this.bytes; }
  private reserve(length: number): void {
    if (length > FILE_LIMIT || length > TOTAL_LIMIT - this.bytes) throw new StrategyBudgetError('Strategy source byte limit exceeded');
  }
  private charge(length: number): void { this.reserve(length); this.bytes += length; }
  /** Count both Git metadata and historical payload output in this request. */
  private git(args: string[]): string {
    this.reserve(1);
    let result: Buffer;
    try {
      result = execFileSync('git', ['-C', this.root, ...args], {
        maxBuffer: Math.min(FILE_LIMIT, TOTAL_LIMIT - this.bytes), timeout: 5000,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const failed = error as { stdout?: Buffer; stderr?: Buffer };
      this.charge((failed.stdout?.length ?? 0) + (failed.stderr?.length ?? 0));
      throw error;
    }
    this.charge(result.length);
    return new TextDecoder('utf-8', { fatal: true }).decode(result);
  }
  assertRoot(): void {
    if (realpathSync(this.git(['rev-parse', '--show-toplevel']).trim()) !== this.root) throw new Error('Strategy requires the exact repository worktree root');
  }
  head(): string { return this.git(['rev-parse', 'HEAD']).trim(); }
  read(path: string): string {
    const file = scopedPath(this.root, path);
    const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const size = fstatSync(fd).size;
      this.reserve(size);
      const buffer = Buffer.alloc(size);
      let length = 0;
      while (length < size) {
        const count = readSync(fd, buffer, length, size - length, length);
        this.charge(count); length += count;
        if (!count) throw new StrategySourceDriftError('Source changed during read');
      }
      if (fstatSync(fd).size !== size) throw new StrategySourceDriftError('Source changed during read');
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } finally { closeSync(fd); }
  }
  optional(path: string): string | null {
    try { return this.read(path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
  verify(e: Evidence): string {
    const body = this.read(e.path);
    if (strategyHash(body) !== e.sha256) throw new StrategySourceDriftError(`Source hash drift: ${e.path}`);
    if (this.git(['cat-file', '-t', e.revision]).trim() !== 'commit') throw new Error(`Source revision is not a commit: ${e.path}`);
    const object = `${e.revision}:${e.path}`;
    if (this.git(['cat-file', '-t', object]).trim() !== 'blob') throw new Error('Historical source is not a blob');
    const size = Number(this.git(['cat-file', '-s', object]).trim());
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid historical source size');
    this.reserve(size);
    const historical = this.git(['show', object]);
    if (strategyHash(historical) !== e.sha256) throw new StrategySourceDriftError(`Unproved source revision: ${e.path}`);
    return body;
  }
}

export interface StrategyCollectionOptions { nowMs?: number; load?: string[]; topics?: string[] }
export interface StrategyCollectionEffects {
  /** Internal dependency seam. An observer must use only this request reader.
   * No production observer exists until the full state owner supports bounded reads.
   */
  observeReadOnlyState?: (reader: StrategyReader, nowMs: number) => string | null;
}
function observeState(reader: StrategyReader, nowMs: number, effects: StrategyCollectionEffects): string | null {
  try {
    const revision = effects.observeReadOnlyState?.(reader, nowMs) ?? null;
    if (revision !== null && !/^[a-f0-9]{64}$/.test(revision)) throw new Error('Invalid state revision');
    return revision;
  } catch (error) { if (error instanceof StrategyBudgetError) throw error; return null; }
}

export function strategyStatus(repo: string): { enabled: boolean; mode: 'context_packet_only'; document: string } {
  const root = strategyRoot(repo);
  // Presence is readiness only. This command never loads the document or lessons.
  return { enabled: existsSync(join(root, STRATEGY_DOCUMENT)), mode: 'context_packet_only', document: STRATEGY_DOCUMENT };
}

function collectContext(reader: StrategyReader, opts: StrategyCollectionOptions, effects: StrategyCollectionEffects, proposal?: { path: string; raw: string }): StrategyPacket {
  const root = reader.root;
  const nowMs = opts.nowMs ?? Date.now();
  if (!Number.isFinite(nowMs)) throw new Error('Invalid clock');
  const load = opts.load ?? [];
  const topics = opts.topics ?? [];
  if (load.length > 8 || new Set(load).size !== load.length || topics.length > 16 || topics.some(t => !t || t.length > 500)) throw new Error('Invalid retrieval selection');
  const raw = reader.read(STRATEGY_DOCUMENT);
  const doc = parseStrategyDocument(JSON.parse(raw));
  const revision = reader.head();
  const unknowns: string[] = [];
  const sources: Evidence[] = [{ path: STRATEGY_DOCUMENT, sha256: strategyHash(raw), revision }];
  for (const e of [...doc.evidence].sort((a, b) => a.path.localeCompare(b.path, 'en'))) {
    try { reader.verify(e); sources.push(e); }
    catch (error) { if (error instanceof StrategyBudgetError) throw error; unknowns.push(`Unverified evidence: ${e.path}`); }
  }
  const proved = new Set(sources.slice(1).map(e => e.path));
  for (const c of [doc.goal, ...doc.intendedResults, ...doc.observedOutcomes, ...doc.gaps, ...doc.architecture]) {
    if (c.kind === 'fact' && (!c.evidence.length || c.evidence.some(p => !proved.has(p)))) unknowns.push(`Unsupported fact: ${c.text}`);
  }
  for (const c of doc.realityConstraints) {
    if (!c.evidence.length || c.evidence.some(p => !proved.has(p))) unknowns.push(`Unsupported constraint: ${c.key}`);
  }
  const observedState = observeState(reader, nowMs, effects);
  const stateRevision = observedState ?? 'unavailable';
  if (observedState === null) unknowns.push('Effective state unavailable: no bounded state observer');
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
  // Re-read every proved source and selected body. Fail if collection crossed edits.
  if (reader.read(STRATEGY_DOCUMENT) !== raw || reader.head() !== revision) throw new StrategySourceDriftError('Strategy sources changed during collection');
  for (const e of sources.slice(1)) if (strategyHash(reader.read(e.path)) !== e.sha256) throw new StrategySourceDriftError('Strategy evidence changed during collection');
  for (const id of load) { const m = eligible.find(m => m.id === id)!; if (strategyHash(reader.read(m.body!.path)) !== m.body!.sha256) throw new StrategySourceDriftError('Memory changed during collection'); }
  if (proposal && reader.read(proposal.path) !== proposal.raw) throw new StrategySourceDriftError('Proposal changed during collection');
  if (observeState(reader, nowMs, effects) !== observedState) throw new StrategySourceDriftError('Effective state changed during collection');
  packet.digest = strategyHash(JSON.stringify(packet));
  return packet;
}

export function collectStrategyContext(repo: string, opts: StrategyCollectionOptions = {}, effects: StrategyCollectionEffects = {}): StrategyPacket {
  return collectContext(requestReader(repo), opts, effects);
}

/** Proposal, context, history, state and confirmations share one IO budget. */
export function validateStrategyRequest(repo: string, path: string, opts: StrategyCollectionOptions = {}, effects: StrategyCollectionEffects = {}) {
  const reader = requestReader(repo);
  const raw = reader.read(path);
  const proposal: unknown = JSON.parse(raw);
  const packet = collectContext(reader, opts, effects, { path, raw });
  return validateProposal(proposal, packet);
}
