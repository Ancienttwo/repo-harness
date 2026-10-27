import { publicDevActivityText } from '../operator/public-text';
import { isTruncatedDevActivityReason, type DevActivityAttentionKind, type DevActivityItem, type DevActivitySnapshotV2 } from './types';

/**
 * Text tags, in priority order. The snapshot owns placement and attention.
 * The projection removes PRs outside the shipped window before this read.
 *
 * | Condition | Tag |
 * | --- | --- |
 * | Hidden item or closed PR | Omit |
 * | Merged PR, including a dirty worktree | [merged #N] |
 * | Open PR with failed CI | [blocked: CI failed] |
 * | Open PR with changes requested | [blocked: changes requested] |
 * | Open PR with merge state DIRTY | [blocked: merge conflict] |
 * | Other open PR, including draft, pending CI or required review | [open PR #N] |
 * | No PR, any dirty worktree | [uncommitted <branch>] |
 * | No PR, clean, planned column | [planned <branch>] |
 * | No PR, clean, other column | [in flight <branch>] |
 *
 * Active counts exclude hidden, closed and shipped items. A non-ok Git or
 * GitHub source replaces item lines with source status lines, except a
 * source that dropped one PR category: it adds its status line and keeps the
 * item lines of the other categories. Runtime health
 * does not change Git or GitHub facts. The item cap does not cap attention.
 */

const LINE_LIMIT = 99;

const ATTENTION_CAUSE: Readonly<Record<DevActivityAttentionKind, string>> = {
  ready_to_merge: 'ready to merge',
  changes_requested: 'changes requested',
  merge_conflict: 'merge conflict',
  checks_failed: 'checks failed',
};

function shortText(value: string, limit: number): string {
  const text = publicDevActivityText(value)
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/\[/gu, '(').replace(/\]/gu, ')').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).replace(/[\uD800-\uDBFF]$/u, '')}…`;
}

function visible(item: DevActivityItem): boolean {
  return item.hidden === null && item.pull_request?.state !== 'closed';
}

function itemLine(item: DevActivityItem): string {
  const pr = item.pull_request;
  let tag: string;
  let subject = '';
  if (pr) {
    if (pr.state === 'merged') tag = `merged #${pr.number}`;
    else if (pr.ci === 'failure') tag = 'blocked: CI failed';
    else if (pr.review === 'changes_requested') tag = 'blocked: changes requested';
    else if (pr.merge_state === 'DIRTY') tag = 'blocked: merge conflict';
    else tag = `open PR #${pr.number}`;
    const number = tag.startsWith('blocked:') ? `#${pr.number} ` : '';
    subject = ` ${number}${shortText(item.branch, LINE_LIMIT - tag.length - number.length - 5)}`;
  } else {
    const state = item.worktrees.some(worktree => worktree.dirty) ? 'uncommitted'
      : item.column === 'planned' ? 'planned' : 'in flight';
    tag = `${state} ${shortText(item.branch, LINE_LIMIT - state.length - 5)}`;
  }
  const prefix = `  [${tag}]${subject}`;
  const title = item.title === item.branch ? '' : shortText(item.title, LINE_LIMIT);
  const remaining = LINE_LIMIT - prefix.length - 3;
  return title && remaining > 0 ? `${prefix} - ${shortText(title, remaining)}` : prefix;
}

/** Render a collected snapshot without I/O, a new clock, or inferred attention. */
export function formatDevActivityBrief(snapshot: DevActivitySnapshotV2, maxItems = 10): string {
  if (!Number.isSafeInteger(maxItems) || maxItems < 1) throw new RangeError('max-items must be a positive integer');
  const count = snapshot.attention.length;
  const lines = [count === 0 ? 'Nothing needs you.' : `${count} item(s) need you.`];
  if (snapshot.status === 'unavailable') lines.push('Snapshot unavailable.');
  if (count > 0) {
    lines.push('', 'Needs you');
    for (const attention of snapshot.attention) {
      const repo = snapshot.repositories.find(entry => entry.repository_id === attention.repository_id)!;
      const item = snapshot.items.find(entry => entry.id === attention.subject_id)!;
      const name = shortText(repo.display_name, 40);
      const cause = ATTENTION_CAUSE[attention.kind];
      const subject = item.pull_request ? `PR #${item.pull_request.number}` : item.branch;
      lines.push(`${name}: ${shortText(subject, LINE_LIMIT - name.length - cause.length - 5)} - ${cause}`);
    }
  }
  for (const repo of snapshot.repositories) {
    const items = snapshot.items.filter(item => item.repository_id === repo.repository_id && visible(item));
    const active = items.filter(item => item.column !== 'shipped' && item.pull_request?.state !== 'merged').length;
    const suffix = ` (${active} active)`;
    lines.push('', `${shortText(repo.display_name, LINE_LIMIT - suffix.length)}${suffix}`);
    const sources = repo.sources.filter(source => source.kind !== 'runtime' && source.status !== 'ok');
    for (const source of sources) lines.push(`  source ${source.kind} ${source.status}`);
    if (sources.some(source => !isTruncatedDevActivityReason(source.reason))) continue;
    for (const item of items.slice(0, maxItems)) lines.push(itemLine(item));
    if (items.length > maxItems) lines.push(`  +${items.length - maxItems} more`);
  }
  if (snapshot.unreadable_registrations > 0) lines.push('', `${snapshot.unreadable_registrations} registered repositories unreadable.`);
  return lines.join('\n');
}
