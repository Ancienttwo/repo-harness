import { createHash } from 'crypto';
import { lstatSync, readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

import {
  EngineerProfileBindingError,
  buildEngineerBindingCurrent,
  buildEngineerGenesisCurrent,
  canonicalEngineerBindingCurrentBytes,
  canonicalEngineerBindingEventBytes,
  validateEngineerBindingCurrent,
  validateEngineerBindingEvent,
  type EngineerBindingCurrentV1,
  type EngineerBindingEventV1,
  type EngineerBindingV1,
} from '../../core/engineers/profile-binding';
import { resolveGitCommonDirectory } from '../git/common-directory';

const ENGINEER_STORE_RELATIVE_ROOT = 'repo-harness/engineers/v1';

export interface EngineerBindingStatus {
  readonly current: EngineerBindingCurrentV1;
  readonly binding: EngineerBindingV1 | null;
  readonly event: EngineerBindingEventV1 | null;
  readonly genesis: boolean;
}

interface StorePaths {
  readonly common: string;
  readonly root: string;
  readonly engineerKey: string;
  readonly engineer: string;
  readonly events: string;
  readonly current: string;
}

interface CurrentRead {
  readonly status: EngineerBindingStatus;
  readonly raw: string | null;
}

function fail(
  code: 'binding_state_corrupt' | 'binding_stale' | 'idempotency_conflict' | 'binding_lock_timeout' | 'unsafe_engineer_path',
  message: string,
  cause?: unknown,
): never {
  throw new EngineerProfileBindingError(code, message, cause);
}

function pathKey(engineerId: string): string {
  if (typeof engineerId !== 'string' || !/^engineer:capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u.test(engineerId)) {
    return fail('unsafe_engineer_path', 'engineer_id cannot be mapped to a safe store key');
  }
  return createHash('sha256').update(Buffer.from(engineerId, 'utf8')).digest('hex');
}

function storePaths(cwd: string, engineerId: string): StorePaths {
  const common = resolveGitCommonDirectory(cwd);
  const root = resolve(common, ENGINEER_STORE_RELATIVE_ROOT);
  const engineerKey = pathKey(engineerId);
  const engineer = join(root, engineerKey);
  return {
    common,
    root,
    engineerKey,
    engineer,
    events: join(engineer, 'events'),
    current: join(engineer, 'current.json'),
  };
}

function readRegularFile(path: string, subject: string): string | null {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return fail('binding_state_corrupt', `${subject} cannot be inspected`, error);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail('unsafe_engineer_path', `${subject} is not a regular file`);
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    return fail('binding_state_corrupt', `${subject} cannot be read`, error);
  }
}

function eventEntries(paths: StorePaths): readonly string[] {
  try {
    const stat = lstatSync(paths.events);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('unsafe_engineer_path', 'events path is unsafe');
    const entries = readdirSync(paths.events)
      .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
    for (const entry of entries) {
      if (!/^[0-9a-f]{64}\.json$/u.test(entry)) fail('binding_state_corrupt', `unexpected events entry: ${entry}`);
      const entryStat = lstatSync(join(paths.events, entry));
      if (!entryStat.isFile() || entryStat.isSymbolicLink()) fail('unsafe_engineer_path', `unsafe events entry: ${entry}`);
    }
    return entries;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

function parseEvent(raw: string, subject: string): EngineerBindingEventV1 {
  try {
    const event = validateEngineerBindingEvent(JSON.parse(raw));
    if (raw !== canonicalEngineerBindingEventBytes(event)) fail('binding_state_corrupt', `${subject} is not canonical`);
    return event;
  } catch (error) {
    if (error instanceof EngineerProfileBindingError && error.code === 'binding_state_corrupt') throw error;
    return fail('binding_state_corrupt', `${subject} is invalid`, error);
  }
}

function parseCurrent(raw: string): EngineerBindingCurrentV1 {
  try {
    const current = validateEngineerBindingCurrent(JSON.parse(raw));
    if (raw !== canonicalEngineerBindingCurrentBytes(current)) fail('binding_state_corrupt', 'current.json is not canonical');
    return current;
  } catch (error) {
    if (error instanceof EngineerProfileBindingError && error.code === 'binding_state_corrupt') throw error;
    return fail('binding_state_corrupt', 'current.json is invalid', error);
  }
}

function readPersistedCurrent(paths: StorePaths, engineerId: string): CurrentRead | null {
  const raw = readRegularFile(paths.current, 'current.json');
  if (raw === null) return null;
  const current = parseCurrent(raw);
  if (current.engineer_id !== engineerId) fail('binding_state_corrupt', 'current engineer_id does not match store key');
  if (current.state === 'unbound') fail('binding_state_corrupt', 'generation-0 genesis must not be persisted');
  const eventPath = join(paths.events, `${current.current_transition_id!.slice('sha256:'.length)}.json`);
  const eventRaw = readRegularFile(eventPath, 'current event');
  if (eventRaw === null) fail('binding_state_corrupt', 'current event is missing');
  const event = parseEvent(eventRaw, 'current event');
  if (event.transition_id !== current.current_transition_id
    || event.event_digest !== current.current_event_digest
    || event.engineer_id !== engineerId) {
    fail('binding_state_corrupt', 'current/event digest binding is invalid');
  }
  const projected = buildEngineerBindingCurrent(event);
  if (canonicalEngineerBindingCurrentBytes(projected) !== raw) fail('binding_state_corrupt', 'current payload does not match current event');
  return {
    raw,
    status: Object.freeze({ current, binding: event.next_binding, event, genesis: false }),
  };
}

function readCurrent(paths: StorePaths, engineerId: string, contractRevision: string): CurrentRead {
  const persisted = readPersistedCurrent(paths, engineerId);
  if (persisted) return persisted;
  if (eventEntries(paths).length > 0) fail('binding_state_corrupt', 'events exist without current.json');
  return {
    raw: null,
    status: Object.freeze({
      current: buildEngineerGenesisCurrent(engineerId, contractRevision),
      binding: null,
      event: null,
      genesis: true,
    }),
  };
}

export function readEngineerBindingStatus(
  cwd: string,
  engineerId: string,
  engineerContractRevision: string,
): EngineerBindingStatus {
  const paths = storePaths(cwd, engineerId);
  try {
    const rootStat = lstatSync(paths.root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('unsafe_engineer_path', 'Engineer store root is unsafe');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return Object.freeze({
        current: buildEngineerGenesisCurrent(engineerId, engineerContractRevision),
        binding: null,
        event: null,
        genesis: true,
      });
    }
    throw error;
  }
  return readCurrent(paths, engineerId, engineerContractRevision).status;
}
