import { fileURLToPath } from 'node:url';
import { ObservationViolation, type ReadonlyObservationIO } from '../state/readonly-observation';
import { resolveEffectiveStateReadOnly } from '../state/resolve-effective-state';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, opendirSync, realpathSync, openSync, readSync, closeSync, fstatSync, constants } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
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
function scopedPath(root: string, path: string, metadata = false): string {
  if (metadata && !path) return root;
  if (isAbsolute(path) || /^[A-Za-z]:/.test(path) || /[\0\r\n]/.test(path) || path.includes('\\') || path.split('/').some(p => !p || p === '.' || p === '..' || p === '.git')) throw new Error('Invalid repository-relative source path');
  let current = root;
  const parts = path.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = join(current, parts[i]!);
    let stat;
    try { stat = lstatSync(current); } catch (error) {
      if (metadata && (error as NodeJS.ErrnoException).code === 'ENOENT') return resolve(root, path);
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error('Symlink sources are forbidden');
    if (i < parts.length - 1 && (!stat.isDirectory() || existsSync(join(current, '.git')))) throw new Error('Nested repository or non-directory source');
  }
  const actual = realpathSync(current);
  const rel = relative(root, actual);
  if (!rel || rel.startsWith(`..${sep}`) || isAbsolute(rel) || (!metadata && !lstatSync(actual).isFile())) throw new Error('Source escapes repository or is not a file');
  return actual;
}

export class StrategySourceDriftError extends Error {}

export class StrategyBudgetError extends ObservationViolation {}

export class StrategyReader {
  private bytes = 0;
  private unselectedMemoryBodies = new Set<string>();
  restrictStateMemoryBodies(paths: string[], selected: string[]): void {
    const permitted = new Set(selected.map(path => resolve(this.root, path)));
    this.unselectedMemoryBodies = new Set(paths.map(path => resolve(this.root, path)).filter(path => !permitted.has(path)));
  }
  private capture(file: string, args: string[], env: NodeJS.ProcessEnv): Buffer {
    this.reserve(1);
    const result = spawnSync(file, args, {
      maxBuffer: Math.min(FILE_LIMIT, TOTAL_LIMIT - this.bytes), timeout: 5000,
      env, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = result.stdout ?? Buffer.alloc(0); const stderr = result.stderr ?? Buffer.alloc(0);
    this.charge(stdout.length + stderr.length);
    if (result.error || result.status !== 0) {
      throw Object.assign(result.error ?? new Error(`Observation command failed: ${file}`), {
        status: result.status, signal: result.signal, stdout, stderr,
      });
    }
    return stdout;
  }
  constructor(readonly root: string) {}
  get bytesRead(): number { return this.bytes; }
  private reserve(length: number): void {
    if (length > FILE_LIMIT || length > TOTAL_LIMIT - this.bytes) throw new StrategyBudgetError('Strategy source byte limit exceeded');
  }
  private charge(length: number): void { this.reserve(length); this.bytes += length; }
  /** Count both Git metadata and historical payload output in this request. */
  private git(args: string[]): string {
    const result = this.capture('git', ['-C', this.root, ...args], { ...process.env, GIT_OPTIONAL_LOCKS: '0' });
    return new TextDecoder('utf-8', { fatal: true }).decode(result);
  }
  assertRoot(): void {
    if (realpathSync(this.git(['rev-parse', '--show-toplevel']).trim()) !== this.root) throw new Error('Strategy requires the exact repository worktree root');
  }
  head(): string { return this.git(['rev-parse', 'HEAD']).trim(); }
  private readBytes(file: string): Buffer {
    const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile()) throw new ObservationViolation('Observation source is not a regular file');
      const size = stat.size; this.reserve(size);
      const buffer = Buffer.alloc(size); let length = 0;
      while (length < size) {
        const count = readSync(fd, buffer, length, size - length, length);
        this.charge(count); length += count;
        if (!count) throw new StrategySourceDriftError('Source changed during read');
      }
      if (fstatSync(fd).size !== size) throw new StrategySourceDriftError('Source changed during read');
      return buffer;
    } finally { closeSync(fd); }
  }
  read(path: string): string {
    return new TextDecoder('utf-8', { fatal: true }).decode(this.readBytes(scopedPath(this.root, path)));
  }
  observationIO(): ReadonlyObservationIO {
    const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
    const packaged = new Set(['package.json', 'src/effects/evidence/verification-execution.ts', 'src/core/evidence/verification-plan.ts',
      'src/core/evidence/redaction.ts', 'src/effects/evidence/secret-env.ts', 'src/effects/process-runner.ts',
      'src/effects/process-supervisor.ts', 'src/effects/expensive-run-lock.ts', 'src/effects/process-group-launcher.ts',
      'src/effects/git/common-directory.ts', 'src/effects/locking/exclusive-directory-lock.ts'].map(p => join(packageRoot, p)));
    const rawCommon = this.git(['rev-parse', '--git-common-dir']).trim();
    const common = realpathSync(resolve(this.root, rawCommon));
    const version = join(common, 'repo-harness/effective-state-version.json');
    const home = process.env.HOME ? realpathSync(process.env.HOME) : null;
    const authority = home ? join(home, '.repo-harness/gates', strategyHash(this.root)) : null;
    const validatePath = (path: string): void => {
      const absolute = resolve(path);
      try {
        if (absolute === version) { scopedPath(common, relative(common, absolute), true); return; }
        if (packaged.has(absolute)) { scopedPath(packageRoot, relative(packageRoot, absolute), true); return; }
        if (authority && absolute.startsWith(`${authority}${sep}`)) {
          const leaf = relative(authority, absolute).split(sep).join('/');
          if (!/^(acceptance\.latest|acceptance\.review-result|archive-projection\.latest|user-waiver-grant\.latest)\.json$/.test(leaf)
            && !/^acceptance-observations\/[a-f0-9]{64}\.json$/.test(leaf)) throw new Error('Unrecognized project authority file');
          scopedPath(home!, relative(home!, absolute), true); return;
        }
        const rel = relative(this.root, absolute).split(sep).join('/');
        scopedPath(this.root, rel, true);
      } catch (error) { throw new ObservationViolation(`Observation source scope rejected: ${error instanceof Error ? error.message : String(error)}`); }
    };
    return {
      validatePath,
      readFile: path => {
        validatePath(path);
        if (this.unselectedMemoryBodies.has(resolve(path))) throw new ObservationViolation('Canonical state requires an unselected memory body');
        return this.readBytes(resolve(path));
      },
      readDirectory: path => {
        validatePath(path); const entries: string[] = []; const directory = opendirSync(path);
        try {
          this.charge(2); let entry;
          while ((entry = directory.readSync())) {
            this.charge(Buffer.byteLength(JSON.stringify(entry.name)) + 1); entries.push(entry.name);
          }
          return entries;
        } finally { directory.closeSync(); }
      },
      exec: (file, inputArgs, options) => {
        const args = [...inputArgs]; let cwd = typeof options.cwd === 'string' ? resolve(options.cwd) : this.root;
        if (args[0] === '-C') { cwd = resolve(args[1]!); args.splice(0, 2); }
        if (cwd !== this.root) throw new ObservationViolation('Observation command escapes repository');
        while (args[0]?.startsWith('--literal-pathspecs')) args.shift();
        const gitBinary = file === 'git' || file === '/usr/bin/git' || file === '/bin/git' || file === '/usr/local/bin/git';
        if (gitBinary) {
          if (args.some(arg => /^(--output|--ext-diff|--textconv|--filters|--follow-symlinks)(=|$)/.test(arg))) throw new ObservationViolation('Observation cannot redirect output, run filters or read outside Git scope');
          if (args.includes('--no-index') && args[0] !== 'check-ignore') throw new ObservationViolation('Observation cannot compare files outside Git scope');
          if (!['rev-parse', 'status', 'diff', 'merge-base', 'ls-files', 'ls-tree', 'cat-file', 'show', 'config', 'check-ignore', 'check-attr', '--version'].includes(args[0]!)) throw new ObservationViolation('Observation Git operation is not read-only');
          if (args[0] === 'config' && !(['--get', '--get-regexp'].includes(args[1]!) || (args[1] === '--bool' && args[2] === '--get'))) throw new ObservationViolation('Observation cannot change Git config');
          if (args[0] === 'status' && !args.includes('--porcelain=v1') && !args.includes('--porcelain=v2')) throw new ObservationViolation('Unsupported observation Git status');
        } else if (!((file === '/bin/bash' || file === '/usr/bin/bash' || file === process.execPath) && args.length === 1 && args[0] === '--version')) throw new ObservationViolation('Observation cannot execute a tool or provider');
        const env: NodeJS.ProcessEnv = { ...process.env, ...options.env, GIT_OPTIONAL_LOCKS: '0' };
        for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[key];
        return this.capture(file, gitBinary ? ['-C', this.root, '-c', 'core.fsmonitor=false', '-c', 'maintenance.auto=false', ...(['check-ignore', 'check-attr'].includes(args[0]!) ? [] : ['--literal-pathspecs']), ...args.slice(0, 1), ...(args[0] === 'diff' ? ['--no-ext-diff', '--no-textconv'] : []), ...args.slice(1)] : args, env);
      },
    };
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
   * Production uses the existing state owner through scoped bounded IO.
   */
  observeReadOnlyState?: (reader: StrategyReader, nowMs: number) => string | null;
}
function observeState(reader: StrategyReader, nowMs: number, effects: StrategyCollectionEffects): string | null {
  try {
    const revision = effects.observeReadOnlyState
      ? effects.observeReadOnlyState(reader, nowMs)
      : resolveEffectiveStateReadOnly(reader.root, nowMs, { targetPaths: [], operationKind: 'inspect' }, reader.observationIO()).state_revision.replace(/^sha256:/, '');
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
  const eligible = activeMemory(doc, nowMs, revision, topics);
  reader.restrictStateMemoryBodies(doc.memory.flatMap(m => m.body ? [m.body.path] : []),
    eligible.filter(m => load.includes(m.id)).flatMap(m => m.body ? [m.body.path] : []));
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
  if (observedState === null) unknowns.push('Effective state unavailable: bounded observation failed');
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
