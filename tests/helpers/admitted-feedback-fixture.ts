import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { admittedInboxFixture } from './admitted-inbox-fixture';
import { prepareFeedbackSubject } from '../../src/effects/publication/feedback';

/** Public task admission plus an explicit provider subject. No publication or lease authority. */
export async function admittedFeedbackFixture(pr_number = 9) {
  const inbox = await admittedInboxFixture('1'.repeat(64), { repositoryId: '123', issueId: '903' });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: inbox.root, encoding: 'utf8' }).trim();
  const selection = { repository: 'acme/widgets', provider_repository_id: inbox.admission.identity.repository_id,
    pr_number, expected_head_sha: head, expected_base_sha: 'b'.repeat(40) };
  const input = { repo_root: inbox.root, source: inbox.source, selection };
  const subject = prepareFeedbackSubject(input);
  return { ...inbox, selection, subject, head, base: selection.expected_base_sha,
    publication_id: subject.publication_id, task_id: inbox.task,
    bindingPath: join(inbox.dir, 'binding.json'), input: { ...input, publication_id: subject.publication_id } };
}
