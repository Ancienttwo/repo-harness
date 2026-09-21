import { realpathSync } from 'node:fs';
import { TASK_ACTIVITY_DEADLINE_MS, TASK_ACTIVITY_MAX_BYTES, TASK_ACTIVITY_MAX_OUTPUT_BYTES, TASK_ACTIVITY_MAX_SCAN, decodeOperatorTaskActivity, isTaskActivityRequest, type ActivityEntry, type OperatorTaskActivity, type OperatorTaskActivityRequest, type TaskActivityFailure } from '../../core/operator/task-activity';
import { readHistoricalTaskActivity } from '../fleet/task-inbox';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';

export class OperatorTaskActivityError extends Error {
  constructor(readonly code: TaskActivityFailure) { super(code); }
}
const fail = (code: TaskActivityFailure): never => { throw new OperatorTaskActivityError(code); };
export function readOperatorTaskActivity(input: OperatorTaskActivityRequest & { readonly env?: NodeJS.ProcessEnv }): OperatorTaskActivity {
  try {
    if (!isTaskActivityRequest(input)) return fail('unavailable');
    const registry = () => readRepoHarnessRegistryStrictSnapshot({ env: input.env, adoptedOnly: false });
    const before = registry();
    const repo = before.repos.find(r => r.id === input.repository_id);
    if (!repo) return fail('history_unavailable');
    const root = realpathSync(repo.path);
    const facts = readHistoricalTaskActivity({ repo_root: root, task_id: input.task_id, limit: input.limit, after: input.after, message_id: input.message_id,
      budget: { max_scan: TASK_ACTIVITY_MAX_SCAN, max_bytes: TASK_ACTIVITY_MAX_BYTES, deadline_ms: TASK_ACTIVITY_DEADLINE_MS } });
    if (!facts.history_exists) return fail('history_unavailable');
    const after = registry();
    const current = after.repos.find(r => r.id === input.repository_id);
    if (!current || after.authorizationRevision !== before.authorizationRevision || realpathSync(current.path) !== root) return fail('unavailable');
    const entries: ActivityEntry[] = [];
    let outputBytes = 4096;
    let outputExhausted = false;
    for (const fact of facts.entries) {
      const e = fact.event;
      const event = { message_id:e.message_id, task_revision:e.task_revision, scope:e.scope, target_claim_id:e.target_claim_id, target_generation:e.target_generation,
        sender_kind:e.sender_kind, sender_id:e.sender_id, sender_trust:e.sender_trust, audience:e.audience, body:e.body, body_sha256:e.body_sha256, created_at:e.created_at, in_reply_to:e.in_reply_to, event_digest:e.event_digest };
      const receipts = fact.receipts.map(r => ({ message_id:r.message_id, recipient_kind:r.recipient_kind, recipient_id:r.recipient_id, recipient_task_revision:r.recipient_task_revision,
        recipient_claim_id:r.recipient_claim_id, recipient_generation:r.recipient_generation, delivery_state:r.delivery_state, delivery_channel:r.delivery_channel, delivery_ref:r.delivery_ref, delivered_at:r.delivered_at, acknowledged_at:r.acknowledged_at }));
      const replies = fact.replies.map(r => ({ claim_id:r.claim_id, generation:r.generation, reply_message_id:r.reply_message_id, state:r.observation.state,
        reason:r.observation.state === 'inconsistent' ? r.observation.reason : null,
        actor:r.actor ? { engineer_id:r.actor.engineer_id,binding_id:r.actor.binding_id,binding_generation:r.actor.binding_generation,engineer_contract_revision:r.actor.engineer_contract_revision,claim_id:r.actor.claim_id,lease_generation:r.actor.lease_generation,receipt_sha256:r.actor.receipt_sha256 } : null }));
      const entry: ActivityEntry = { event, receipts, replies, provenance:e.in_reply_to === null ? 'not_reply' : replies.some(r => r.actor?.receipt_sha256 === e.sender_id && r.reply_message_id === e.message_id) ? 'recorded_claim_actor' : 'unverified' };
      outputBytes += Buffer.byteLength(JSON.stringify(entry));
      if (outputBytes > TASK_ACTIVITY_MAX_OUTPUT_BYTES) { outputExhausted = true; break; }
      entries.push(entry);
    }
    const result: OperatorTaskActivity = { repository_id:input.repository_id,task_id:input.task_id,limit:input.limit,after:input.after,message_id:input.message_id,
      protocol:1,kind:'operator_task_activity',observed_at:new Date().toISOString(),consistency:'observed',entries,
      coverage:{ ...facts.coverage, scope:input.message_id === null ? 'task' : 'message', ...(outputExhausted ? { complete:false, reason:'output' as const } : {}) }, next_cursor:outputExhausted ? null : facts.next_cursor };
    return decodeOperatorTaskActivity(result,input);
  } catch (error) { if (error instanceof OperatorTaskActivityError) throw error; return fail('unavailable'); }
}
