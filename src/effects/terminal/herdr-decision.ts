import { execFile } from 'node:child_process';
import { constants, closeSync, fchmodSync, fstatSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import { OPTIONS, type PaneOption } from '../../core/decision/pane-status.mjs';
import { acquireExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';

const runFile = promisify(execFile);
const LOG_LIMIT = 20 * 1024 * 1024;
interface BlindRecord { event_id: string; agent: 'claude' | 'codex'; herdr_status: 'done'; tail: string | null }
interface Label { event_id: string; label: PaneOption; labeler: 'bot'; ts: string }

function readPrivate(path: string, limit: number, optional = false): string {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0) throw new Error('Invalid private file.');
    return readFileSync(fd, 'utf8');
  } catch (error) { if (optional && (error as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw error; }
  finally { if (fd !== undefined) closeSync(fd); }
}

async function stateDirectory(explicit?: string): Promise<string> {
  if (explicit !== undefined) {
    if (!isAbsolute(explicit)) throw new Error('Invalid state directory.');
    return explicit;
  }
  const { stdout } = await runFile('herdr', ['plugin', 'config-dir', 'aimpact.webhook-notify'], {
    encoding: 'utf8', timeout: 2000, maxBuffer: 16 * 1024,
  });
  const dir = stdout.trim();
  if (!isAbsolute(dir) || /[\r\n\x00]/.test(dir)) throw new Error('Invalid config directory.');
  // Written by the event process from HERDR_PLUGIN_STATE_DIR. Never derive a
  // second path from Herdr's private platform/config directory layout.
  const pointer = JSON.parse(readPrivate(join(dir, 'decision-state.json'), 16 * 1024));
  if (pointer.protocol !== 1 || typeof pointer.state_dir !== 'string' || !isAbsolute(pointer.state_dir)) throw new Error('Invalid state pointer.');
  return pointer.state_dir;
}

function shadowRecords(dir: string): BlindRecord[] {
  const seen = new Set<string>();
  return readPrivate(join(dir, 'decision-shadow.jsonl'), LOG_LIMIT).split('\n').filter(Boolean).map(line => {
    const record = JSON.parse(line);
    if (typeof record.event_id !== 'string' || !/^[a-f0-9-]{36}$/.test(record.event_id) || seen.has(record.event_id)
      || !['claude', 'codex'].includes(record.agent) || record.herdr_status !== 'done'
      || !((record.tail === null && record.tail_sha256 === null) || (typeof record.tail === 'string' && Buffer.byteLength(record.tail) <= 16 * 1024
        && createHash('sha256').update(record.tail).digest('hex') === record.tail_sha256))) throw new Error('Invalid shadow record.');
    seen.add(record.event_id);
    // Whitelist output fields. Never spread model records into blind output.
    return { event_id: record.event_id, agent: record.agent, herdr_status: record.herdr_status, tail: record.tail };
  });
}

function labels(dir: string): Label[] {
  const seen = new Set<string>();
  return readPrivate(join(dir, 'decision-labels.jsonl'), LOG_LIMIT, true).split('\n').filter(Boolean).map(line => {
    const item = JSON.parse(line);
    if (typeof item.event_id !== 'string' || seen.has(item.event_id) || !OPTIONS.includes(item.label)
      || item.labeler !== 'bot' || !Number.isFinite(Date.parse(item.ts))) throw new Error('Invalid labels.');
    seen.add(item.event_id);
    return { event_id: item.event_id, label: item.label, labeler: item.labeler, ts: item.ts };
  });
}

export async function labelDecision(input: { next?: boolean; eventId?: string; option?: string; stateDir?: string }): Promise<BlindRecord | Label | null> {
  if (input.next ? input.eventId !== undefined || input.option !== undefined
    : !input.eventId || !OPTIONS.includes(input.option as PaneOption)) throw new Error('Invalid label arguments.');
  const dir = await stateDirectory(input.stateDir);
  // A label command never waits: a held lock fails this command.
  const lock = acquireExclusiveDirectoryLock(realpathSync(dir), 'decision-labels.lock', {
    waitTimeoutMs: 1,
    reclaimStaleEmptyDirectory: true,
  });
  try {
    const records = shadowRecords(dir);
    const saved = labels(dir);
    const labeled = new Set(saved.map(item => item.event_id));
    if (input.next) return records.find(record => !labeled.has(record.event_id)) ?? null;
    if (!records.some(record => record.event_id === input.eventId) || labeled.has(input.eventId!)) throw new Error('Unknown or labeled event.');
    const label: Label = { event_id: input.eventId!, label: input.option as PaneOption, labeler: 'bot', ts: new Date().toISOString() };
    // Retention follows the retained shadow window. Neither command writes the log.
    const retained = new Set(records.map(record => record.event_id));
    const text = [...saved.filter(item => retained.has(item.event_id)), label].map(item => JSON.stringify(item)).join('\n') + '\n';
    if (Buffer.byteLength(text) > LOG_LIMIT) throw new Error('Labels exceed the file limit.');
    const path = join(dir, 'decision-labels.jsonl');
    const temporary = `${path}-${randomUUID()}`;
    try {
      const fd = openSync(temporary, 'wx', 0o600);
      try { fchmodSync(fd, 0o600); writeFileSync(fd, text); } finally { closeSync(fd); }
      renameSync(temporary, path);
    } finally { try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
    return label;
  } finally { lock.release(); }
}
