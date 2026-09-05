import { constants, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeSync } from 'fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { execFileSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';

import {
  buildDevelopmentCampaignEvent,
  canonicalDevelopmentCampaignCurrentBytes,
  canonicalDevelopmentCampaignDefinitionBytes,
  canonicalDevelopmentCampaignEventBytes,
  foldDevelopmentCampaignCurrent,
  validateDevelopmentCampaignCurrent,
  validateDevelopmentCampaignDefinition,
  validateDevelopmentCampaignEvent,
  type DevelopmentCampaignCurrentV1,
  type DevelopmentCampaignDefinitionV1,
  type DevelopmentCampaignEventV1,
  type DevelopmentCampaignOperation,
} from '../../core/automation/development-campaign';
import { readStoredProgramAuthorization } from './grant-store';
import { readDevelopmentCampaignPolicyAtRevision, requireDevelopmentCampaignStartPolicy } from './development-campaign-policy';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';

const STORE_RELATIVE_ROOT = 'repo-harness/development-campaigns/v1';
const CAMPAIGN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;

export type DevelopmentCampaignStoreErrorCode =
  | 'campaign_mode_disabled'
  | 'campaign_not_found'
  | 'campaign_conflict'
  | 'campaign_reconciliation_required'
  | 'campaign_unsafe'
  | 'campaign_authorization_stale'
  | 'campaign_group_limit_exceeded'
  | 'campaign_external_sources_disabled'
  | 'campaign_persistence_failed';

export class DevelopmentCampaignStoreError extends Error {
  constructor(readonly code: DevelopmentCampaignStoreErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'DevelopmentCampaignStoreError';
  }
}

function fail(code: DevelopmentCampaignStoreErrorCode, message: string, cause?: unknown): never {
  throw new DevelopmentCampaignStoreError(code, message, cause);
}

function campaignKey(value: string): string {
  if (!CAMPAIGN_ID.test(value)) fail('campaign_unsafe', 'campaign id is invalid');
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function transitionKey(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(value)) fail('campaign_unsafe', 'idempotency key is invalid');
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function paths(repoRoot: string, campaignId: string) {
  const common = resolveGitCommonDirectory(repoRoot);
  const root = resolve(common, STORE_RELATIVE_ROOT);
  const campaign = join(root, campaignKey(campaignId));
  return {
    common, root, campaign,
    definition: join(campaign, 'campaign.json'),
    events: join(campaign, 'events'),
    transitions: join(campaign, 'transitions'),
    current: join(campaign, 'current.json'),
    lock: `${STORE_RELATIVE_ROOT}/${campaignKey(campaignId)}/locks/mutation.lock`,
  };
}

export function developmentCampaignStoreRoot(repoRoot: string): string {
  return resolve(resolveGitCommonDirectory(resolve(repoRoot)), STORE_RELATIVE_ROOT);
}

/** Serialize a short synchronous campaign authority decision. Never pass an async callback. */
export function withDevelopmentCampaignLock<T>(repoRootInput: string, campaignId: string, callback: () => T & (T extends PromiseLike<unknown> ? never : unknown)): T {
  const repoRoot = resolve(repoRootInput);
  const value = paths(repoRoot, campaignId);
  return withExclusiveDirectoryLock(value.common, value.lock, callback, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

function fsyncDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function ensureDirectoryChain(root: string, target: string): void {
  const scoped = relative(root, target);
  if (!scoped || scoped === '..' || scoped.startsWith(`..${sep}`) || isAbsolute(scoped)) fail('campaign_unsafe', 'campaign store path escapes Git common dir');
  let current = root;
  for (const segment of scoped.split(sep)) {
    current = join(current, segment);
    try {
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail('campaign_unsafe', `unsafe campaign directory: ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      try { mkdirSync(current, { mode: 0o700 }); } catch (mkdirError) {
        if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') throw mkdirError;
      }
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail('campaign_unsafe', `unsafe campaign directory: ${current}`);
      fsyncDirectory(dirname(current));
    }
  }
}

function prepare(value: ReturnType<typeof paths>): void {
  ensureDirectoryChain(value.common, value.root);
  ensureDirectoryChain(value.common, value.campaign);
  ensureDirectoryChain(value.common, value.events);
  ensureDirectoryChain(value.common, value.transitions);
}

function regular(path: string): Buffer {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('campaign_unsafe', `unsafe campaign file: ${path}`);
  return readFileSync(path);
}

function writeAll(fd: number, bytes: Buffer): void {
  let offset = 0;
  while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
}

function atomic(path: string, bytes: Buffer): void {
  const temporary = join(dirname(path), `.${process.pid}.${randomUUID()}.tmp`);
  let fd: number | null = null;
  try {
    fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    writeAll(fd, bytes);
    fsyncSync(fd);
  } catch (error) {
    return fail('campaign_persistence_failed', `cannot stage campaign file ${path}`, error);
  } finally { if (fd !== null) closeSync(fd); }
  try {
    renameSync(temporary, path);
    fsyncDirectory(dirname(path));
  } catch (error) {
    fail('campaign_persistence_failed', `cannot publish campaign file ${path}`, error);
  } finally { try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
}

function immutable(path: string, bytes: Buffer): void {
  if (existsSync(path)) {
    if (!regular(path).equals(bytes)) fail('campaign_conflict', `${path} names different immutable bytes`);
    return;
  }
  atomic(path, bytes);
}

function parse<T>(path: string, validate: (value: unknown) => T, canonical: (value: T) => string): T {
  const bytes = regular(path);
  let value: T;
  try { value = validate(JSON.parse(bytes.toString('utf8'))); }
  catch (error) { return fail('campaign_conflict', `${path} is invalid`, error); }
  if (!bytes.equals(Buffer.from(`${canonical(value)}\n`, 'utf8'))) fail('campaign_conflict', `${path} is not canonical`);
  return value;
}

function eventFiles(path: string): readonly string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).map((entry) => {
    if (!entry.isFile() || !/^\d{8}-[a-f0-9]{64}\.json$/u.test(entry.name)) fail('campaign_unsafe', `unexpected campaign event entry: ${entry.name}`);
    return entry.name;
  }).sort();
}

function rebuild(value: ReturnType<typeof paths>, campaign: DevelopmentCampaignDefinitionV1): { events: DevelopmentCampaignEventV1[]; current: DevelopmentCampaignCurrentV1 | null } {
  const events = eventFiles(value.events).map((name) => {
    const event = parse(join(value.events, name), validateDevelopmentCampaignEvent, canonicalDevelopmentCampaignEventBytes);
    const expected = `${String(event.revision).padStart(8, '0')}-${event.event_sha256.slice('sha256:'.length)}.json`;
    if (name !== expected) fail('campaign_conflict', `campaign event filename does not bind its immutable content: ${name}`);
    return event;
  });
  return { events, current: events.length === 0 ? null : foldDevelopmentCampaignCurrent(campaign, events) };
}

function assertCurrentProjection(value: ReturnType<typeof paths>, current: DevelopmentCampaignCurrentV1 | null): void {
  if (!existsSync(value.current)) return;
  try {
    const stored = parse(value.current, validateDevelopmentCampaignCurrent, canonicalDevelopmentCampaignCurrentBytes);
    if (!current || stored.current_sha256 !== current.current_sha256) fail('campaign_reconciliation_required', 'campaign current projection does not match durable events');
  } catch (error) {
    if (error instanceof DevelopmentCampaignStoreError && error.code === 'campaign_reconciliation_required') throw error;
    fail('campaign_reconciliation_required', 'campaign current projection is invalid and must be reconciled from durable events', error);
  }
}

function reconcileLaggingCurrentProjection(
  value: ReturnType<typeof paths>,
  campaign: DevelopmentCampaignDefinitionV1,
  events: readonly DevelopmentCampaignEventV1[],
  current: DevelopmentCampaignCurrentV1 | null,
): void {
  if (!existsSync(value.current) || current === null) return;
  let stored: DevelopmentCampaignCurrentV1;
  try { stored = parse(value.current, validateDevelopmentCampaignCurrent, canonicalDevelopmentCampaignCurrentBytes); }
  catch (error) { return fail('campaign_reconciliation_required', 'campaign current projection is invalid and must be reconciled from durable events', error); }
  if (stored.current_sha256 === current.current_sha256) return;
  const isExactPrefix = events.some((_, index) => foldDevelopmentCampaignCurrent(campaign, events.slice(0, index + 1)).current_sha256 === stored.current_sha256);
  if (!isExactPrefix) fail('campaign_reconciliation_required', 'campaign current projection does not match any durable event prefix');
  atomic(value.current, Buffer.from(`${canonicalDevelopmentCampaignCurrentBytes(current)}\n`, 'utf8'));
}

function readExactAuthorityBinding(repoRoot: string, campaign: DevelopmentCampaignDefinitionV1, env: NodeJS.ProcessEnv) {
  const grant = readStoredProgramAuthorization(repoRoot, campaign.authorization_sha256, env);
  if (grant.campaign === null || grant.campaign.campaign_id !== campaign.campaign_id
    || grant.authorization_id !== campaign.authorization_id || grant.repository_id !== campaign.repository_id
    || grant.target_ref !== campaign.target_ref || grant.target_revision !== campaign.target_revision) {
    fail('campaign_authorization_stale', 'campaign authorization binding is stale');
  }
  if (grant.merge_mode !== 'manual') fail('campaign_authorization_stale', 'development campaign merge_mode must be manual');
  return grant;
}

export function assertAuthorityBinding(repoRoot: string, campaign: DevelopmentCampaignDefinitionV1, env: NodeJS.ProcessEnv) {
  const grant = readExactAuthorityBinding(repoRoot, campaign, env);
  if (Date.parse(grant.expires_at) <= Date.now()) fail('campaign_authorization_stale', 'campaign authorization expired');
  let target: string;
  try { target = execFileSync('git', ['rev-parse', '--verify', `${grant.target_ref}^{commit}`], { cwd: repoRoot, encoding: 'utf8' }).trim(); }
  catch (error) { return fail('campaign_authorization_stale', `cannot resolve authorized target ref ${grant.target_ref}`, error); }
  if (target !== grant.target_revision) fail('campaign_authorization_stale', 'authorized target ref moved');
  return grant;
}

function requireMutationPolicy(repoRoot: string, campaign: DevelopmentCampaignDefinitionV1, env: NodeJS.ProcessEnv) {
  const grant = assertAuthorityBinding(repoRoot, campaign, env);
  const policy = readDevelopmentCampaignPolicyAtRevision(repoRoot, campaign.target_revision);
  if (policy.mode === 'off') fail('campaign_mode_disabled', 'development_campaign.mode is off at the authorized target revision');
  if (grant.campaign === null) fail('campaign_authorization_stale', 'campaign authorization payload is missing');
  if (policy.limits.maximum_group_count < grant.campaign.group_count
    || policy.limits.maximum_issues_per_group < grant.campaign.issues_per_group
    || policy.limits.maximum_parallel_tasks < grant.campaign.max_parallel_tasks) {
    fail('campaign_group_limit_exceeded', 'campaign authorization exceeds target-base development_campaign limits');
  }
  return { grant, policy };
}

const RECORDING_OPERATIONS: ReadonlySet<DevelopmentCampaignOperation> = new Set([
  'stop',
  'require_reconciliation',
  'expire_authorization',
]);

function hasSameAuthorizationBinding(left: DevelopmentCampaignDefinitionV1, right: DevelopmentCampaignDefinitionV1): boolean {
  return left.campaign_id === right.campaign_id
    && left.authorization_id === right.authorization_id
    && left.authorization_sha256 === right.authorization_sha256
    && left.repository_id === right.repository_id
    && left.target_ref === right.target_ref
    && left.target_revision === right.target_revision;
}

export interface AppendDevelopmentCampaignEventInput {
  readonly repo_root: string;
  readonly campaign_id: string;
  readonly expected_current_sha256: string | null;
  readonly idempotency_key: string;
  readonly operation: DevelopmentCampaignOperation;
  readonly evidence_refs?: readonly string[];
  readonly observed_at: string;
  readonly env?: NodeJS.ProcessEnv;
}

function appendLocked(value: ReturnType<typeof paths>, campaign: DevelopmentCampaignDefinitionV1, input: AppendDevelopmentCampaignEventInput) {
  if (input.operation === 'expire_authorization') {
    const grant = readExactAuthorityBinding(input.repo_root, campaign, input.env ?? process.env);
    if (Date.parse(grant.expires_at) > Date.now()) fail('campaign_authorization_stale', 'campaign authorization has not expired');
  } else if (!RECORDING_OPERATIONS.has(input.operation)) {
    requireMutationPolicy(input.repo_root, campaign, input.env ?? process.env);
  }
  prepare(value);
  const rebuilt = rebuild(value, campaign);
  reconcileLaggingCurrentProjection(value, campaign, rebuilt.events, rebuilt.current);
  const previous = rebuilt.current;
  const transition = join(value.transitions, `${transitionKey(input.idempotency_key)}.json`);
  const build = (revision: number, previousState: DevelopmentCampaignCurrentV1 | null, previousEvent: string | null) => buildDevelopmentCampaignEvent({
    campaign_id: campaign.campaign_id, revision, idempotency_key: input.idempotency_key, operation: input.operation,
    previous_state: previousState?.state ?? null, evidence_refs: input.evidence_refs ?? [], observed_at: input.observed_at,
    previous_event_sha256: previousEvent,
  });
  const indexed = existsSync(transition) ? parse(transition, validateDevelopmentCampaignEvent, canonicalDevelopmentCampaignEventBytes) : null;
  const stored = indexed ?? rebuilt.events.find((event) => event.idempotency_key === input.idempotency_key) ?? null;
  if (stored) {
    if (!rebuilt.events.some((event) => event.event_sha256 === stored.event_sha256)) fail('campaign_reconciliation_required', 'campaign transition index has no durable event');
    const replayPrevious = stored.revision === 1 ? null : foldDevelopmentCampaignCurrent(campaign, rebuilt.events.slice(0, stored.revision - 1));
    const evidence = input.evidence_refs ?? [];
    const sameRequest = stored.campaign_id === campaign.campaign_id && stored.idempotency_key === input.idempotency_key
      && stored.operation === input.operation && stored.observed_at === input.observed_at
      && (replayPrevious?.current_sha256 ?? null) === input.expected_current_sha256
      && stored.evidence_refs.length === evidence.length && stored.evidence_refs.every((entry, index) => entry === evidence[index]);
    if (!sameRequest) fail('campaign_conflict', 'idempotency key names another campaign transition');
    immutable(transition, Buffer.from(`${canonicalDevelopmentCampaignEventBytes(stored)}\n`, 'utf8'));
    if (rebuilt.current && !existsSync(value.current)) atomic(value.current, Buffer.from(`${canonicalDevelopmentCampaignCurrentBytes(rebuilt.current)}\n`, 'utf8'));
    return { event: stored, current: rebuilt.current ?? foldDevelopmentCampaignCurrent(campaign, [stored]) };
  }
  if ((previous?.current_sha256 ?? null) !== input.expected_current_sha256) fail('campaign_conflict', 'campaign current revision changed');
  const event = build((previous?.revision ?? 0) + 1, previous, previous?.current_event_sha256 ?? null);
  const bytes = Buffer.from(`${canonicalDevelopmentCampaignEventBytes(event)}\n`, 'utf8');
  immutable(join(value.events, `${String(event.revision).padStart(8, '0')}-${event.event_sha256.slice('sha256:'.length)}.json`), bytes);
  immutable(transition, bytes);
  const current = foldDevelopmentCampaignCurrent(campaign, [...rebuilt.events, event]);
  atomic(value.current, Buffer.from(`${canonicalDevelopmentCampaignCurrentBytes(current)}\n`, 'utf8'));
  return { event, current };
}

export function createDevelopmentCampaign(input: {
  readonly repo_root: string;
  readonly campaign: DevelopmentCampaignDefinitionV1;
  readonly idempotency_key: string;
  /** Only the CLI's omitted --observed-at form may reuse the existing immutable request. */
  readonly reuse_existing_definition?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}) {
  const repoRoot = resolve(input.repo_root);
  const requestedCampaign = validateDevelopmentCampaignDefinition(input.campaign);
  const value = paths(repoRoot, requestedCampaign.campaign_id);
  const env = input.env ?? process.env;
  try { requireDevelopmentCampaignStartPolicy(repoRoot, requestedCampaign.target_revision); }
  catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code === 'campaign_mode_disabled') fail('campaign_mode_disabled', (error as Error).message, error);
    if (code === 'campaign_external_sources_disabled') fail('campaign_external_sources_disabled', (error as Error).message, error);
    throw error;
  }
  requireMutationPolicy(repoRoot, requestedCampaign, env);
  return withExclusiveDirectoryLock(value.common, value.lock, () => {
    prepare(value);
    const storedCampaign = existsSync(value.definition)
      ? parse(value.definition, validateDevelopmentCampaignDefinition, canonicalDevelopmentCampaignDefinitionBytes)
      : null;
    const campaign = input.reuse_existing_definition && storedCampaign !== null
      ? storedCampaign
      : requestedCampaign;
    if (storedCampaign !== null && input.reuse_existing_definition && !hasSameAuthorizationBinding(storedCampaign, requestedCampaign)) {
      fail('campaign_conflict', 'campaign was created under another authorization binding');
    }
    requireDevelopmentCampaignStartPolicy(repoRoot, campaign.target_revision);
    requireMutationPolicy(repoRoot, campaign, env);
    immutable(value.definition, Buffer.from(`${canonicalDevelopmentCampaignDefinitionBytes(campaign)}\n`, 'utf8'));
    const existing = rebuild(value, campaign);
    if (existing.current) {
      if (existing.events[0]?.idempotency_key !== input.idempotency_key) fail('campaign_conflict', 'campaign was created under another idempotency key');
      return Object.freeze({ campaign, event: existing.events[0]!, current: existing.current });
    }
    const result = appendLocked(value, campaign, { repo_root: repoRoot, campaign_id: campaign.campaign_id, expected_current_sha256: null, idempotency_key: input.idempotency_key, operation: 'authorize', observed_at: campaign.created_at, env });
    return Object.freeze({ campaign, ...result });
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

export function appendDevelopmentCampaignEvent(input: AppendDevelopmentCampaignEventInput) {
  const repoRoot = resolve(input.repo_root);
  const value = paths(repoRoot, input.campaign_id);
  return withExclusiveDirectoryLock(value.common, value.lock, () => {
    if (!existsSync(value.definition)) fail('campaign_not_found', 'development campaign is missing');
    const campaign = parse(value.definition, validateDevelopmentCampaignDefinition, canonicalDevelopmentCampaignDefinitionBytes);
    return Object.freeze({ campaign, ...appendLocked(value, campaign, { ...input, repo_root: repoRoot }) });
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

export function readDevelopmentCampaignStatus(repoRootInput: string, campaignId: string, _env: NodeJS.ProcessEnv = process.env) {
  const repoRoot = resolve(repoRootInput);
  const value = paths(repoRoot, campaignId);
  if (!existsSync(value.definition)) fail('campaign_not_found', 'development campaign is missing');
  const campaign = parse(value.definition, validateDevelopmentCampaignDefinition, canonicalDevelopmentCampaignDefinitionBytes);
  const rebuilt = rebuild(value, campaign);
  if (!rebuilt.current) fail('campaign_conflict', 'development campaign has no event chain');
  assertCurrentProjection(value, rebuilt.current);
  return Object.freeze({ campaign, current: rebuilt.current, events: Object.freeze(rebuilt.events) });
}
