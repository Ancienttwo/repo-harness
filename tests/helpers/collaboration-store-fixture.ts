/**
 * A disposable repository for collaboration store tests.
 *
 * Carries the real capability nodes and Engineer profiles plus a third profile
 * for the collaboration capability, so three distinct authenticated actors
 * exist. `REPO_HARNESS_HOME` is a temp directory *outside* the repository, so
 * the principal store never touches the developer's own state.
 *
 * Extracted for C3: the handoff store and the adoption store need the same
 * three-actor repository C1's signal store test builds, and a second hand-copied
 * fixture is a second place for the isolation rules to be forgotten.
 */
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';

import { bindEngineer, readEngineerBindingStatus } from '../../src/effects/engineers/binding-store';
import { enrollEngineerPrincipal } from '../../src/effects/engineers/principal-store';
import { loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';

export const COLLABORATION_ENGINEER = 'engineer:capability.runtime-harness.collaboration';
export const EVALS_ENGINEER = 'engineer:capability.verification.evals-checks';
export const CONTRACT_ENGINEER = 'engineer:capability.workflow-engine.contract-assets';

export interface CollaborationFixtureActor {
  readonly engineer_id: string;
  readonly authorization_id: string;
}

export interface CollaborationFixture {
  readonly repoRoot: string;
  readonly home: string;
  readonly env: NodeJS.ProcessEnv;
  readonly actors: readonly CollaborationFixtureActor[];
}

function git(cwd: string, args: readonly string[]): void {
  execFileSync('git', [...args], { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
}

function collaborationProfile(sourceRoot: string): string {
  const base = JSON.parse(readFileSync(
    join(sourceRoot, 'agents/engineers/profiles/verification-evals-checks.json'),
    'utf8',
  )) as Record<string, unknown>;
  return `${JSON.stringify({
    ...base,
    engineer_id: COLLABORATION_ENGINEER,
    capability_id: 'capability.runtime-harness.collaboration',
    sop_ref: 'agents/engineers/sops/runtime-harness-collaboration.md',
  }, null, 2)}\n`;
}

/**
 * Build one disposable repository. `roots` collects every temp directory so the
 * caller's `afterEach` can remove them; `mode` writes `collaboration.mode` into
 * the harness policy, and `null` writes no policy file at all.
 */
export function createCollaborationFixture(
  sourceRoot: string,
  roots: string[],
  mode: string | null = 'shadow',
  prefix = 'repo-harness-collab',
): CollaborationFixture {
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
  const home = realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-home-`)));
  roots.push(repoRoot, home);
  git(repoRoot, ['init', '-q', '-b', 'main']);
  git(repoRoot, ['config', 'user.email', 'tests@example.invalid']);
  git(repoRoot, ['config', 'user.name', 'Tests']);
  mkdirSync(join(repoRoot, '.archcontext/model'), { recursive: true });
  mkdirSync(join(repoRoot, 'agents'), { recursive: true });
  mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
  mkdirSync(join(repoRoot, 'src/core/collaboration'), { recursive: true });
  mkdirSync(join(repoRoot, 'src/effects/collaboration'), { recursive: true });
  cpSync(join(sourceRoot, '.archcontext/model/nodes'), join(repoRoot, '.archcontext/model/nodes'), { recursive: true });
  cpSync(join(sourceRoot, 'agents/engineers'), join(repoRoot, 'agents/engineers'), { recursive: true });
  writeFileSync(
    join(repoRoot, 'agents/engineers/profiles/runtime-harness-collaboration.json'),
    collaborationProfile(sourceRoot),
  );
  writeFileSync(join(repoRoot, 'agents/engineers/sops/runtime-harness-collaboration.md'), '# Collaboration SOP fixture\n');
  if (mode !== null) {
    writeFileSync(join(repoRoot, '.ai/harness/policy.json'), `${JSON.stringify({ collaboration: { mode } }, null, 2)}\n`);
  }
  writeFileSync(join(repoRoot, 'README.md'), 'fixture\n');
  writeFileSync(join(repoRoot, 'src/core/collaboration/.keep'), '');
  writeFileSync(join(repoRoot, 'src/effects/collaboration/.keep'), '');
  git(repoRoot, ['add', '.']);
  git(repoRoot, ['commit', '-qm', 'fixture']);

  const env = { ...process.env, REPO_HARNESS_HOME: home };
  const actors: CollaborationFixtureActor[] = [
    { engineer_id: COLLABORATION_ENGINEER, authorization_id: '22222222-2222-4222-8222-222222222222' },
    { engineer_id: EVALS_ENGINEER, authorization_id: '33333333-3333-4333-8333-333333333333' },
    { engineer_id: CONTRACT_ENGINEER, authorization_id: '44444444-4444-4444-8444-444444444444' },
  ];
  actors.forEach((actor, index) => {
    const profile = loadEngineerProfile(repoRoot, actor.engineer_id);
    bindEngineer(repoRoot, {
      engineer_id: actor.engineer_id,
      idempotency_key: `bind-${index}`,
      provider: 'codex',
      provider_thread_id: `thread-${index}`,
      host_id: 'local',
      engineer_contract_revision: profile.engineer_contract_revision,
      expected_current_digest: null,
      expected_binding_generation: 0,
      expected_binding_id: null,
      expected_engineer_contract_revision: profile.engineer_contract_revision,
      now: () => '2026-08-29T00:00:00.000Z',
      binding_id: () => `${index + 1}${`${index + 1}`.repeat(7)}-1111-4111-8111-111111111111`,
    });
    const status = readEngineerBindingStatus(repoRoot, actor.engineer_id, profile.engineer_contract_revision);
    enrollEngineerPrincipal({
      repository_id: repoHarnessRepoIdFor(repoRoot),
      authorization_id: actor.authorization_id,
      binding: status.binding!,
      created_at: '2026-08-29T00:00:00.000Z',
      env,
    });
  });
  return { repoRoot, home, env, actors };
}

export function removeFixtureRoots(roots: string[]): void {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
}

/**
 * A digest over every delivery-plane store under the Git common directory,
 * excluding the collaboration store itself. This is the before/after evidence
 * the Program Verification Matrix asks for on authority preservation.
 *
 * `scope` narrows it to one plane subtree (`coordination/v1`, `engineers/v1`) so
 * a falsifier can name the plane it claims not to have moved.
 */
export function deliveryPlaneDigest(repoRoot: string, scope = ''): string {
  const root = join(realpathSync(resolveGitCommonDirectory(repoRoot)), 'repo-harness', scope);
  const hash = createHash('sha256');
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => (left.name < right.name ? -1 : 1))) {
      const absolute = join(directory, entry.name);
      const scoped = relative(root, absolute);
      if (scoped === 'collaboration' || scoped.startsWith('collaboration/')) continue;
      // NUL-separated, matching what C1 hashed: a path may contain a space, and
      // a printable separator would let two different trees hash the same.
      if (entry.isDirectory()) {
        hash.update(`d ${scoped}\u0000`);
        walk(absolute);
      } else if (entry.isFile()) {
        hash.update(`f ${scoped}\u0000`);
        hash.update(readFileSync(absolute));
        hash.update('\u0000');
      }
    }
  };
  if (existsSync(root)) walk(root);
  return `sha256:${hash.digest('hex')}`;
}
