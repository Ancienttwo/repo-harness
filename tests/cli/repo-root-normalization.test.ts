import { fixtureTemplate } from '../helpers/repo-fixture';
import { afterAll, afterEach, expect, test } from 'bun:test';
import { join, relative } from 'path';
import { mkdtempSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { historicalPlanningFixture } from '../helpers/historical-campaign-lifecycle';
import { runCampaignHeartbeatStep } from '../../src/cli/commands/campaign';

const roots: string[] = [];
const templates = fixtureTemplate(historicalPlanningFixture);
afterAll(() => templates.dispose());
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

/**
 * `repoHarnessRepoIdFor` hashes its argument verbatim, and every writer of a
 * stored `repository_id` canonicalizes first (repo-registry registration,
 * `engineer` via realpathSync, `work-demand-store` via resolve). A CLI that
 * forwards a relative `--repo` therefore derives a different identity than the
 * one recorded in the intent and the stored grant, and the planning boundary
 * reports as stale a repository that never moved.
 *
 * One repository, two spellings of its root: the observable outcome must not
 * depend on which spelling the operator typed.
 */
test('campaign step derives one repository identity from a relative and an absolute --repo', async () => {
  const fixture = await templates.materialize(false, false, undefined, true, {}, false, true);
  roots.push(fixture.root, fixture.home);

  const previousHome = process.env.REPO_HARNESS_HOME;
  process.env.REPO_HARNESS_HOME = fixture.env.REPO_HARNESS_HOME;
  const step = async (root: string, key: string) => {
    try {
      await runCampaignHeartbeatStep({
        repo: root,
        campaignId: fixture.intent.campaign_id,
        groupNumber: String(fixture.intent.group_number),
        intentSha256: fixture.intent.intent_sha256,
        idempotencyKey: key,
        host: 'codex',
        sessionId: 'repo-root-normalization',
      });
      return 'no-throw';
    } catch (error) {
      return (error as Error).message;
    }
  };

  try {
    const fromAbsolute = await step(fixture.root, 'absolute-spelling');
    const fromRelative = await step(relative(process.cwd(), fixture.root), 'relative-spelling');
    expect(fromRelative).not.toContain('authorization is stale');
    expect(fromRelative).toBe(fromAbsolute);

    // `resolve` is lexical and cannot collapse a symlink, but the ids this is
    // compared against are realpath-derived, so an absolute-but-symlinked root
    // reproduces the same false stale unless the CLI canonicalizes.
    const linkParent = mkdtempSync(join(tmpdir(), 'repo-root-link-'));
    roots.push(linkParent);
    const link = join(linkParent, 'repo-link');
    symlinkSync(fixture.root, link);
    const fromSymlink = await step(link, 'symlink-spelling');
    expect(fromSymlink).not.toContain('authorization is stale');
    expect(fromSymlink).toBe(fromAbsolute);
  } finally {
    if (previousHome === undefined) delete process.env.REPO_HARNESS_HOME;
    else process.env.REPO_HARNESS_HOME = previousHome;
  }
});
