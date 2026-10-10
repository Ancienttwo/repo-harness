// Strict, browser-safe decoder for GET /api/v1/setup. Exact keys, closed
// vocabularies. Machine-state text must already be a fixed point of
// `publicAgentConfigText`, so no absolute-path-looking text and no credential
// carrier survives decoding. Package-owned text (catalog summaries, fleet
// frontmatter) is public: it is a bounded plain string with no control
// characters and no absolute-path-looking token.

import { publicAgentConfigText } from '../operator/agent-config';
import {
  SETUP_CHECK_STATUSES,
  SETUP_HOOK_EVENTS,
  SETUP_HOOK_MISMATCH_FIELDS,
  SETUP_HOOK_MISMATCH_KINDS,
  SETUP_HOSTS,
  SETUP_PROJECTION,
  SETUP_REASONS,
  SETUP_SNAPSHOT_STATUSES,
  SKILL_PROJECTION_STATES,
  type SetupReason,
  type SetupSnapshotV1,
} from './types';

export function unavailableSetupSnapshot(reason: SetupReason = 'collection_pending'): SetupSnapshotV1 {
  return {
    projection_version: SETUP_PROJECTION, status: 'unavailable', reason, collected_at: null,
    setup_status: null, summary: null, checks: [], hosts: [], skills: [], hooks: [], fleet: [],
  };
}

export function decodeSetupSnapshot(value: unknown): SetupSnapshotV1 {
  const fail = (what: string): never => { throw new Error(`setup projection invalid: ${what}`); };
  const obj = (v: unknown, keys: readonly string[], what: string): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return fail(what);
    if (Object.keys(v).sort().join(',') !== [...keys].sort().join(',')) return fail(`${what} fields`);
    return v as Record<string, unknown>;
  };
  // Public text must already be redacted: redaction is idempotent on safe text.
  const text = (v: unknown, what: string): string =>
    (typeof v === 'string' && publicAgentConfigText(v) === v ? v : fail(what));
  const packageText = (v: unknown, what: string): string =>
    (typeof v === 'string' && v.length > 0 && v.length <= 2048 && !/[\x00-\x1f\x7f]/u.test(v)
      && !/(?:^|[\s("'=:])\/\S+|[A-Za-z]:[\\/]/u.test(v) ? v : fail(what));
  const packageScalar = (v: unknown, what: string): string =>
    (typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(v) ? v : fail(what));
  const nullable = <T>(v: unknown, read: (x: unknown) => T): T | null => (v === null ? null : read(v));
  const oneOf = <T extends string>(v: unknown, values: readonly T[], what: string): T =>
    (typeof v === 'string' && (values as readonly string[]).includes(v) ? v as T : fail(what));
  const bool = (v: unknown, what: string): boolean => (typeof v === 'boolean' ? v : fail(what));
  const count = (v: unknown, what: string): number =>
    (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : fail(what));
  const array = (v: unknown, what: string): unknown[] => (Array.isArray(v) ? v : fail(what));
  const id = (v: unknown, what: string): string =>
    (typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(v) ? v : fail(what));
  const time = (v: unknown, what: string): string =>
    (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : fail(what));
  const perHost = <T>(v: unknown, read: (x: unknown) => T, what: string): void => {
    const hosts = obj(v, SETUP_HOSTS, what);
    for (const host of SETUP_HOSTS) read(hosts[host]);
  };

  const v = obj(value, ['projection_version', 'status', 'reason', 'collected_at', 'setup_status', 'summary', 'checks',
    'hosts', 'skills', 'hooks', 'fleet'], 'snapshot');
  if (v.projection_version !== SETUP_PROJECTION) fail('projection_version');
  const status = oneOf(v.status, SETUP_SNAPSHOT_STATUSES, 'status');
  const reason = nullable(v.reason, x => oneOf(x, SETUP_REASONS, 'reason'));
  if ((status === 'ready') !== (reason === null)) fail('reason');
  if (status === 'stale' && reason === 'collection_pending') fail('reason');
  const collectedAt = nullable(v.collected_at, x => time(x, 'collected_at'));
  const setupStatus = nullable(v.setup_status, x => oneOf(x, ['ok', 'attention', 'blocked'], 'setup_status'));
  const summary = nullable(v.summary, x => {
    const s = obj(x, SETUP_CHECK_STATUSES, 'summary');
    for (const key of SETUP_CHECK_STATUSES) count(s[key], `summary ${key}`);
    return s;
  });
  const hasData = collectedAt !== null;
  if (hasData !== (status !== 'unavailable') || hasData !== (setupStatus !== null) || hasData !== (summary !== null)) fail('data presence');

  const checkIds = new Set<string>();
  for (const raw of array(v.checks, 'checks')) {
    const c = obj(raw, ['id', 'status', 'title', 'detail', 'command'], 'check');
    const checkId = id(c.id, 'check id');
    if (checkIds.has(checkId)) fail('duplicate check');
    checkIds.add(checkId);
    oneOf(c.status, ['warn', 'fail', 'needs_agent'], 'check status');
    text(c.title, 'check title');
    text(c.detail, 'check detail');
    nullable(c.command, x => text(x, 'check command'));
  }

  const hosts = array(v.hosts, 'hosts');
  if (hasData ? hosts.length !== SETUP_HOSTS.length : hosts.length !== 0) fail('hosts');
  hosts.forEach((raw, index) => {
    const h = obj(raw, ['host', 'reported', 'adapter_check', 'detected', 'adapter', 'cli_version'], 'host');
    if (h.host !== SETUP_HOSTS[index]) fail('host order');
    const reported = bool(h.reported, 'reported');
    const adapterCheck = nullable(h.adapter_check, x => oneOf(x, SETUP_CHECK_STATUSES, 'adapter_check'));
    const detected = nullable(h.detected, x => bool(x, 'detected'));
    const adapter = nullable(h.adapter, x => {
      const a = obj(x, ['configured', 'managed_entries', 'expected_entries', 'projection', 'mismatches'], 'adapter');
      bool(a.configured, 'configured');
      count(a.managed_entries, 'managed_entries');
      count(a.expected_entries, 'expected_entries');
      nullable(a.projection, y => oneOf(y, ['consistent', 'drift'], 'projection'));
      for (const rawMismatch of array(a.mismatches, 'mismatches')) {
        const m = obj(rawMismatch, ['kind', 'event', 'route_id', 'field'], 'mismatch');
        oneOf(m.kind, SETUP_HOOK_MISMATCH_KINDS, 'mismatch kind');
        text(m.event, 'mismatch event');
        nullable(m.route_id, y => id(y, 'mismatch route_id'));
        nullable(m.field, y => oneOf(y, SETUP_HOOK_MISMATCH_FIELDS, 'mismatch field'));
      }
      return a;
    });
    const version = nullable(h.cli_version, x => (typeof x === 'string' && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(x) ? x : fail('cli_version')));
    if (!reported && (adapterCheck !== null || detected !== null || adapter !== null || version !== null)) fail('unreported host carries facts');
    if (reported && (adapterCheck === null || detected === null)) fail('reported host facts');
    if (detected === false && adapter !== null) fail('undetected host adapter');
  });

  const skillNames = new Set<string>();
  for (const raw of array(v.skills, 'skills')) {
    const s = obj(raw, ['name', 'summary', 'hosts'], 'skill');
    const name = id(s.name, 'skill name');
    if (skillNames.has(name)) fail('duplicate skill');
    skillNames.add(name);
    nullable(s.summary, x => packageText(x, 'skill summary'));
    let rows = 0;
    perHost(s.hosts, x => nullable(x, y => {
      const r = obj(y, ['state', 'ok'], 'skill row');
      const state = oneOf(r.state, SKILL_PROJECTION_STATES, 'skill state');
      if (bool(r.ok, 'skill ok') && !state.startsWith('ok ')) fail('skill ok');
      rows += 1;
      return r;
    }), 'skill hosts');
    if (rows === 0) fail('skill without rows');
  }

  let eventIndex = -1;
  for (const raw of array(v.hooks, 'hooks')) {
    const e = obj(raw, ['event', 'routes'], 'hook event');
    const index = SETUP_HOOK_EVENTS.indexOf(oneOf(e.event, SETUP_HOOK_EVENTS, 'hook event name'));
    if (index <= eventIndex) fail('hook event order');
    eventIndex = index;
    const routeIds = new Set<string>();
    const routes = array(e.routes, 'routes');
    if (routes.length === 0) fail('empty hook event');
    for (const rawRoute of routes) {
      const r = obj(rawRoute, ['route_id', 'matcher', 'hosts'], 'route');
      const routeId = id(r.route_id, 'route_id');
      if (routeIds.has(routeId)) fail('duplicate route');
      routeIds.add(routeId);
      nullable(r.matcher, x => (typeof x === 'string' && /^[A-Za-z|]{1,128}$/u.test(x) ? x : fail('matcher')));
      const routeHosts = array(r.hosts, 'route hosts').map(x => oneOf(x, SETUP_HOSTS, 'route host'));
      if (routeHosts.length === 0 || new Set(routeHosts).size !== routeHosts.length) fail('route hosts');
    }
  }

  const roles = new Set<string>();
  for (const raw of array(v.fleet, 'fleet')) {
    const r = obj(raw, ['name', 'description', 'model', 'effort', 'hosts'], 'fleet role');
    const name = id(r.name, 'role name');
    if (roles.has(name)) fail('duplicate role');
    roles.add(name);
    nullable(r.description, x => packageText(x, 'role description'));
    nullable(r.model, x => packageScalar(x, 'role model'));
    nullable(r.effort, x => packageScalar(x, 'role effort'));
    perHost(r.hosts, x => nullable(x, y => oneOf(y, ['installed', 'missing'], 'role host')), 'role hosts');
  }

  if (!hasData && ((v.checks as unknown[]).length || (v.skills as unknown[]).length
    || (v.hooks as unknown[]).length || (v.fleet as unknown[]).length)) {
    fail('unavailable snapshot carries data');
  }
  return v as unknown as SetupSnapshotV1;
}
