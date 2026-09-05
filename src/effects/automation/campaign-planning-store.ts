import { closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { randomUUID } from 'crypto';
import { canonicalMessageBytes, canonicalMessageDigest } from '../../core/messages/mechanics';
import { CampaignPlanningError } from '../../core/automation/campaign-planning';
import { validateIssueBatchIntent, type IssueBatchIntentV1 } from '../../core/automation/issue-batch';
import { developmentCampaignStoreRoot } from './development-campaign-store';
import { issueBatchGroupStoreRoot } from './issue-batch-store';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';

function regular(path: string): string {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new CampaignPlanningError('planning_failed', 'unsafe planning record');
  return readFileSync(path, 'utf8');
}
function directory(path: string): void {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new CampaignPlanningError('planning_failed', 'unsafe planning directory');
}
function location(root: string, intent: IssueBatchIntentV1, key: string): string {
  if (!/^(?:parent|[a-f0-9]{64})$/u.test(key)) throw new CampaignPlanningError('planning_failed', 'invalid planning store identity');
  return join(issueBatchGroupStoreRoot(root, intent.campaign_id, intent.group_number), 'planning', `${key}.json`);
}
export function readPlanningRecord<T>(root: string, intent: IssueBatchIntentV1, key: string): T | null {
  const path = location(root, intent, key);
  if (!existsSync(path)) return null;
  directory(dirname(path));
  const raw = regular(path); const parsed = JSON.parse(raw);
  if (parsed.intent_sha256 !== intent.intent_sha256 || parsed.record_sha256 !== canonicalMessageDigest({ intent_sha256: parsed.intent_sha256, record: parsed.record }) || `${canonicalMessageBytes(parsed)}\n` !== raw) throw new CampaignPlanningError('planning_failed', 'planning record digest differs');
  return parsed.record as T;
}
/** The caller holds the group planning lock; immutable content supports crash replay. */
export function persistPlanningRecord(root: string, intent: IssueBatchIntentV1, key: string, record: unknown): void {
  const existing = readPlanningRecord<unknown>(root, intent, key);
  if (existing !== null) {
    if (canonicalMessageBytes({ record: existing }) !== canonicalMessageBytes({ record })) throw new CampaignPlanningError('human_attention_required', 'planning identity already has different immutable content');
    return;
  }
  const path = location(root, intent, key); const dir = dirname(path);
  directory(dirname(dir));
  if (!existsSync(dir)) mkdirSync(dir, { mode: 0o700 });
  directory(dir);
  const basis = { intent_sha256: intent.intent_sha256, record };
  const temp = join(dir, `.write-${randomUUID()}`);
  const fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, `${canonicalMessageBytes({ ...basis, record_sha256: canonicalMessageDigest(basis) })}\n`); fsyncSync(fd); }
  finally { closeSync(fd); }
  try { renameSync(temp, path); const d = openSync(dir, constants.O_RDONLY); try { fsyncSync(d); } finally { closeSync(d); } }
  finally { if (existsSync(temp)) unlinkSync(temp); }
}
export function withCampaignPlanningLock<T>(root: string, intent: IssueBatchIntentV1, action: () => T): T {
  const store = developmentCampaignStoreRoot(root);
  return withExclusiveDirectoryLock(store, `${relative(store, issueBatchGroupStoreRoot(root, intent.campaign_id, intent.group_number))}/locks/planning.lock`, action);
}
/** Enumerate existing intent authorities so deleting a canonical manifest cannot remove admission. */
export function storedPlanningIntents(root: string): readonly IssueBatchIntentV1[] {
  const store = developmentCampaignStoreRoot(root); if (!existsSync(store)) return [];
  directory(store); const result: IssueBatchIntentV1[] = [];
  for (const campaign of readdirSync(store)) {
    if (!/^[a-f0-9]{64}$/u.test(campaign)) continue;
    const groups = join(store, campaign, 'groups'); if (!existsSync(groups)) continue;
    directory(join(store, campaign)); directory(groups);
    for (const group of readdirSync(groups)) {
      if (!/^000[123]$/u.test(group)) throw new CampaignPlanningError('planning_failed', `invalid campaign group directory: ${group}`);
      directory(join(groups, group));
      const path = join(groups, group, 'intent.json'); if (existsSync(path)) result.push(validateIssueBatchIntent(JSON.parse(regular(path))));
    }
  }
  return result;
}
