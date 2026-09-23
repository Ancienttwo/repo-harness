import { createHash } from 'node:crypto';
import { deriveTaskMessageRecipientKey, type TaskMessageRecipient } from './task-message';

export const TASK_INBOX_LAYOUT_VERSION = 2;
export const TASK_INBOX_V2_RELATIVE_PATH = 'repo-harness/task-inbox/v2';
export const TASK_INBOX_RETIREMENT_MARKER = 'repo-harness-task-inbox-layout-retired:v2\n';

/** Filesystem identity is a projection; canonical recipient keys remain unchanged. */
export function taskInboxRecipientStorageKey(recipient: TaskMessageRecipient): string {
  const key = deriveTaskMessageRecipientKey(recipient);
  return `r-${createHash('sha256').update('repo-harness-task-inbox-recipient-path/v2\0').update(key, 'utf8').digest('hex')}`;
}
