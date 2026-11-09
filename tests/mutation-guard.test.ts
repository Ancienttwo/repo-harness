import { beforeAll, describe, expect, test } from 'bun:test';
import { seedGlobalPackageFixture } from './helpers/install-ownership';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { runMutationGuard } from '../src/cli/hook/mutation-guard';
import { getRoute } from '../src/cli/hook/route-registry';
import { buildHookCommand } from '../src/cli/installer/managed-entries';
import { stateVersionOwnerPath } from '../src/effects/state/git-state-version-store';
import { hookIdentity } from './helpers/hook-identity';

// The in-process mutation guard keeps only the path boundaries that block:
// repository scope, `_ref`, `_ops` and a parseable target path.

function git(cwd: string, args: readonly string[]): void {
  const result = spawnSync('git', [...args], { cwd, encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(result.stderr);
}

function initRepo(cwd: string): void {
  git(cwd, ['init', '-b', 'main']);
  git(cwd, ['config', 'user.email', 'mutation-guard@example.com']);
  git(cwd, ['config', 'user.name', 'Mutation Guard Test']);
  mkdirSync(join(cwd, '.ai/harness'), { recursive: true });
  writeFileSync(join(cwd, '.ai/harness/workflow-contract.json'), '{}\n');
  writeFileSync(join(cwd, 'README.md'), '# fixture\n');
  git(cwd, ['add', '.']);
  git(cwd, ['commit', '-m', 'seed']);
}

function invoke(cwd: string, payload: Record<string, unknown>, runId: string | null = null) {
  return runMutationGuard({ repoRoot: cwd, payload, identity: hookIdentity({ runId }) });
}

function edit(cwd: string, filePath: string) {
  return invoke(cwd, { tool_input: { file_path: filePath } });
}

function writePolicy(cwd: string, dirs: unknown): void {
  writeFileSync(join(cwd, '.ai/harness/policy.json'), `${JSON.stringify({ operations: { private_dir: '_ops', agent_writable_private_dirs: dirs } })}\n`);
}

function failureRecords(cwd: string): Array<Record<string, unknown>> {
  const path = join(cwd, '.ai/harness/failures/latest.jsonl');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
}

const HOOK_ENTRY = join(import.meta.dir, '../src/cli/hook-entry.ts');
beforeAll(() => { seedGlobalPackageFixture(); });

describe('Bash write tripwire host route', () => {
  test('literal protected destinations block; reads, ordinary writes and unresolved targets pass', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'bash-write-guard-')));
    const cwd = join(root, 'repo');
    const home = join(root, 'home');
    try {
      mkdirSync(cwd); mkdirSync(home);
      initRepo(cwd);
      mkdirSync(join(cwd, 'src'));
      // Test HOME lives under /tmp, so a missing directory below / stands in for $HOME. The hook only decides; no command runs.
      const outsideHome = '/repo-harness-bash-guard-home';
      symlinkSync('/', join(root, 'root-alias'));
      symlinkSync(join(outsideHome, 'new-file'), join(root, 'dangling'));
      const invokeBash = (command: string, hookCwd = cwd, hookHome = home) => spawnSync(process.execPath,
        [HOOK_ENTRY, 'PreToolUse', '--route', 'bash'], {
          cwd: hookCwd, encoding: 'utf8',
          input: JSON.stringify({ tool_name: 'Bash', cwd: hookCwd, tool_input: { command } }),
          env: { PATH: process.env.PATH, HOME: hookHome, HOOK_HOST: 'claude', HOOK_REPO_ROOT: cwd },
        });
      for (const command of [
        'echo value > _ops/env/a.env', 'cat <<EOF >> "_ref/upstream.txt"\ntext\nEOF',
        'printf value | tee -a ./_ops/log.txt', "sed -i '' 's/a/b/' _ref/file.txt",
        'rm -rf _ops/cache', 'mv _ref/source.txt safe.txt', 'cp safe.txt _ops/copy.txt',
        'rm -rf _ops/*', 'cd _ops && rm file.txt',
        'cp safe.txt _ops/copy.txt 2>/dev/null', 'sed -i "" s/a/b/ _ref/x.txt 2>/dev/null',
        'cp safe.txt _ops/copy.txt 2>&1', 'sed -i "" s/a/b/ _ref/x.txt 2>&1',
        'echo value > _ops/file\nv=$(date)',
        // Outside the repository, Bash writes only strictly below a temp or managed worktree root.
        `echo value > '${outsideHome}/x.txt'`,
        `echo value > '${root}/root-alias/repo-harness-bash-guard-home/new.txt'`,
        // The kernel follows the link before `..`; the shell creates a dangling link's target.
        `echo value > '${root}/root-alias/../x.txt'`, `echo value > '${root}/dangling'`,
        'echo value > /tmp-repo-harness-bash-guard-neighbour/x.txt',
        'rm -rf /tmp/*',
        `echo value > '${cwd}/_ops/fixture'`, `echo value > '${cwd}/_ref/fixture'`,
        `cp safe.txt '${root}/ok.txt' && cp safe.txt '${outsideHome}/x.txt'`,
        `python3 -c "open('_ops/a.env', 'w').write('x')"`,
        `node -e "require('fs').writeFileSync('_ref/a.txt', 'x')"`,
        "python3 - <<'PY'\nopen('_ops/a.env', 'w').write('x')\nPY",
        // Unsupported heredocs and substitutions fail closed, including when their output looks safe.
        'echo x > _ops/x; cat <<A <<B\nx\nA\ny\nB', 'cat <<"$D" > _ops/x\nx\n$D',
        'cat <<A <<B\nx\nA\ny\nB\necho x > _ops/later',
        'cat <<"$D" > report.txt\nrm -rf /tmp/example\n$D',
        'cat <<A > a.txt; cat <<B > b.txt\nx\nA\nrm -rf /tmp/example\nB',
        'echo "$(echo x > _ops/x)" > report.txt', 'echo `echo x > _ops/x` > report.txt',
        'echo "`echo x > _ops/x`" > report.txt', 'rm -rf $(true) _ops',
        'echo pre$(echo x > _ops/x)post > report.txt', 'echo $(date) > report.txt',
        'cd $(printf src)\necho value > _ops/local.txt',
        'diff <(ls) x; rm -rf _ops', 'tee >(cat) _ops/y', 'diff <(echo x > _ops/x) x',
        "echo v > '_ops/a\nb'", 'rm ~/_ops/x', 'rm ~root/_ops/x',
      ]) {
        const result = invokeBash(command);
        expect({ command, status: result.status, stderr: result.stderr }).toMatchObject({ command, status: 2 });
        expect(result.stderr).toMatch(/\[(OpsPrivateGuard|ExternalReferenceGuard|RepoScopeGuard)\]/);
      }
      for (const command of [
        'git status --short', 'cat _ops/env/a.env > report.txt', 'cp _ref/source.txt safe.txt',
        'echo "rm _ops/cache > /tmp/example"', 'rg "_ops/" docs',
        'echo value > src/file.txt', `echo value > '${cwd}/src/file.txt'`,
        'echo value > "$TARGET"', 'python3 generator.py', 'echo value > /dev/null',
        'echo value > /dev/fd/2', 'echo value > /dev/tty', 'cp _ops/input safe.txt "2">/dev/null',
        'cd src && echo value > _ops/local.txt', 'cd "$TARGET" && rm _ops/file',
        'cd _ops | cat; echo value > report.txt',
        "printf '%s\\n' 'example:\nrm -rf /tmp/example\n'",
        "cat <<'EOF' > report.txt\nrm -rf _ops/cache\nEOF",
        `echo value > '${root}/outside.txt'`, 'echo value > /tmp/repo-harness-bash-guard-scratch.json',
        `cp safe.txt '${root}/ok.txt' && rm -rf '${root}/scratch'`,
      ]) {
        const result = invokeBash(command);
        expect({ command, status: result.status, stderr: result.stderr }).toMatchObject({ command, status: 0 });
      }
      expect(invokeBash('rm ~/_ops/x', cwd, cwd).status).toBe(2);
      expect(invokeBash('echo value > _ops/local.txt', join(cwd, 'src')).status).toBe(0);
      expect(invokeBash('echo value > ../_ops/a.env', join(cwd, 'src')).status).toBe(2);
      expect(existsSync(join(cwd, '_ops'))).toBe(false);
      writePolicy(cwd, ['_ops/dispatch']);
      // The allowlist is for structured tools; Bash targets are inferred from text.
      expect(invokeBash('echo value > _ops/dispatch/plan.md').status).toBe(2);
      // A glob that can match a protected directory, or a symlink on either side of _ops, is judged by where the write can land.
      const outside = realpathSync(mkdtempSync('/tmp/bash-write-guard-outside-'));
      try {
        writeFileSync(join(outside, 'secret'), 'x');
        mkdirSync(join(cwd, '_ops/env'), { recursive: true });
        symlinkSync(join(outside, 'secret'), join(cwd, '_ops/env/link'));
        symlinkSync('../_ops/env', join(cwd, 'src/l'));
        symlinkSync('../_ops/env/new.env', join(cwd, 'src/leaf'));
        // The kernel follows src/a before the `..` inside src/nested, so the write lands in _ops/env.
        mkdirSync(join(cwd, 'other'));
        symlinkSync('../other', join(cwd, 'src/a'));
        symlinkSync('a/../_ops/env/secret', join(cwd, 'src/nested'));
        symlinkSync('loop', join(cwd, 'loop'));
        symlinkSync('..', join(cwd, 'src/up'));
        symlinkSync('_ops', join(cwd, 'lnk'));
        mkdirSync(join(outside, 'x-safe'));
        symlinkSync(join(cwd, '_ops'), join(outside, 'ops-alias'));
        for (const [command, hookCwd] of [
          ['echo value > ./_op[s]/env/x'], ['echo value > _op*/env/x'], ['rm -rf _?ef'], ['rm -rf src/../_op[!x]'],
          ['echo value > _ops/env/*'], ['cp safe.txt _ops/env/*'], ['rm *', join(cwd, '_ops/env')], ['rm -rf *'],
          ['echo value > _ops/env/link'], ['echo value > src/l/y.env'], ['echo value > src/leaf'], ['rm src/l/*'],
          ['rm -rf _op[[:lower:]]'], ['echo value > src/nested'], ['echo value > README.md/child'],
          // Case variants, a glob that can match `..`, brace and tilde forms, and a cd to a glob.
          ['echo value > _OPS/env/x'], ['rm -rf src/.*/_ops'], ['rm -rf _op{s,x}'], ['rm -rf _op{r..t}'], ['rm -rf f{1..5000}'],
          ['echo value > ~+/_ops/x'], ['echo value > ~-/x'], ['cd _op* && rm -rf env'],
          ['rm -rf _op[^x]'], ['rm -rf _op[]s]'], ['rm -rf _op[z-a]'], ['echo value > loop/x'], ['rm -rf src/up/_op*'],
          ['cd src/* && rm -rf ../../_ops'], ['echo value > _op{s,x}/a && (echo ok)'], ['rm -rf _op@(s|x)'], ['echo value > _o\\\nps/x'],
          ['rm -rf x{999999999999999999999..999999999999999999999}'], ['rm -rf s*/../_ops'], ['cd -P _ops && rm -rf env'],
          ['rm -rf _op[!S]'], ['cd -P /etc && rm passwd'],
          ['cd src/* && rm _ops/x'], ['rm -rf l*/env'], ['rm -rf s*/l/y.env'],
          ['cd _op[s] && rm -rf env'], [`cd ${outside}/ops-alias/e* && rm secret`],
          ['cd /et[c] && rm passwd'], ['cd -P /et[c] && rm passwd'],
          [`cd ${outside}/x* && rm -rf build`], [`cd -P ${outside}/x* && rm -rf build`],
        ] as [string, string?][]) {
          const result = invokeBash(command, hookCwd);
          expect({ command, status: result.status, stderr: result.stderr }).toMatchObject({ command, status: 2 });
        }
        for (const command of ['rm src/*.tmp', 'echo value > _o/*', 'rm -rf *.log', 'rm -rf _ops_old*', 'rm -rf src/{a,b}.tmp',
          'rm -rf .??*', `rm -rf '${root}'/scratch*`, "rm -rf _op'{s,x}'*", "rm -rf '~+'/*", 'cd _ref* && rg x > /tmp/out',
          '(cd _op*); cd src; echo x > safe.txt', '(cd _op*); echo x > safe.txt',
          "echo '$(echo x > _ops/x)' > report.txt", 'echo "\\$(echo x > _ops/x)" > report.txt',
          "echo x > 'src/a\nb'", "cd '_op[s]' && echo x > safe.txt", 'echo "<(ls)" > report.txt']) {
          expect({ command, status: invokeBash(command).status }).toEqual({ command, status: 0 });
        }
      } finally { rmSync(outside, { recursive: true, force: true }); }
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 60_000);

  test('git worktree add outside the managed root is denied with the start command; literal managed targets and unresolved forms pass', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'bash-worktree-guard-')));
    const cwd = join(root, 'repo');
    const home = join(root, 'home');
    const managed = join(root, 'managed');
    try {
      mkdirSync(cwd); mkdirSync(home); mkdirSync(managed); mkdirSync(join(cwd, 'src'));
      initRepo(cwd);
      const invokeBash = (command: string, hookCwd = cwd) => spawnSync(process.execPath,
        [HOOK_ENTRY, 'PreToolUse', '--route', 'bash'], {
          cwd: hookCwd, encoding: 'utf8',
          input: JSON.stringify({ tool_name: 'Bash', cwd: hookCwd, tool_input: { command } }),
          env: { PATH: process.env.PATH, HOME: home, HOOK_HOST: 'claude', HOOK_REPO_ROOT: cwd, REPO_HARNESS_WORKTREE_ROOT: managed },
        });
      for (const command of [
        'git worktree add ../x', 'git worktree add -b task/x ../x main', 'git worktree add --detach ../x HEAD',
        'git worktree add -f -q --lock --reason "task" --no-checkout ../x', `git worktree add ${root}/x`,
        `git worktree add ${managed}/nested/x`, `git worktree add ${join(managed, '..')}/x`,
        `git -C ${cwd} worktree add ../x`, `git -C src worktree add ../../x`, 'git -C src worktree add ../x',
        'cd src && git worktree add ../x', 'git status && git worktree add ../x', "git worktree add '../x'",
        'git worktree add ../x\nf() { :; }', 'git worktree add /etc/wt[1]',
        'git worktree add --detach ../x HEAD && echo "$(date)"',
      ]) {
        const result = invokeBash(command);
        expect({ command, status: result.status, stderr: result.stderr }).toMatchObject({ command, status: 2 });
        expect(result.stderr).toContain('[WorktreeCreateGuard]');
        expect(result.stderr).toContain('repo-harness run contract-worktree start --issue <number>');
      }
      for (const command of [
        `git worktree add ${managed}/repo-wt-x`, `git worktree add -b task/x ${managed}/repo-wt-x main`,
        `git -C ${cwd} worktree add ${managed}/repo-wt-x`, `git -C src worktree add ../../managed/repo-wt-x`,
        `git worktree add "${managed}/repo-wt-x"`, `cd ${managed} && git worktree add repo-wt-x`,
        // The target or its directory is not certain, so the guard does not guess.
        'git worktree add "$DIR"', 'git worktree add $DIR/x', 'git worktree add ~/x', 'git worktree add "$(mktemp -d)"',
        'git worktree add "$HOME/x"', 'git worktree add ../x*', 'git worktree add', 'git worktree add a b c',
        'git worktree add --orphan ../x', 'git worktree add -fq ../x', 'git -c core.x=1 worktree add ../x',
        'git -C "$D" worktree add ../x', 'cd "$D" && git worktree add ../x', 'cd src; git worktree add ../x',
        'cd src\ngit worktree add ../x', 'git worktree add ../x $(date)\n(', 'git worktree list', 'git worktree remove ../x',
        'git worktree prune', 'echo "git worktree add ../x"', 'git log --grep "worktree add ../x"',
        'command git worktree add ../x', 'FOO=1 git worktree add ../x',
      ]) {
        const result = invokeBash(command);
        expect({ command, status: result.status, stderr: result.stderr }).toMatchObject({ command, status: 0 });
      }
      // The literal-write boundary is unchanged next to a worktree command.
      expect(invokeBash(`git worktree add ${managed}/repo-wt-x && echo value > _ops/a.env`).status).toBe(2);
      expect(invokeBash('echo value > src/file.txt').status).toBe(0);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 60_000);
});

/** The installed host path: `repo-harness-hook PreToolUse --route edit` in a child process with an isolated HOME. */
function hostEdit(cwd: string, home: string, toolInput: Record<string, string>, host: 'claude' | 'codex' = 'claude') {
  const result = spawnSync(process.execPath, [HOOK_ENTRY, 'PreToolUse', '--route', 'edit'], {
    cwd,
    encoding: 'utf-8',
    input: JSON.stringify({ tool_name: 'command' in toolInput ? 'apply_patch' : 'Edit', tool_input: toolInput }),
    env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, HOME: home, HOOK_HOST: host, HOOK_REPO_ROOT: cwd },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('mutation boundaries', () => {
  test('an ordinary edit is allowed and ignores old markers', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-cutover-')));
    try {
      initRepo(cwd);
      mkdirSync(join(cwd, '.claude'), { recursive: true });
      writeFileSync(join(cwd, '.claude/.require-worktree'), '');
      const result = edit(cwd, 'src/security/feature.ts');
      expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '' });
      expect(failureRecords(cwd)).toEqual([]);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
  test('path traversal, symlink escapes and private/reference state remain refused', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-cutover-path-')));
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-cutover-outside-')));
    try {
      initRepo(cwd);
      symlinkSync(outside, join(cwd, 'escape'));
      for (const path of ['../outside.ts', 'escape/secret.ts', '_ops/secret.env', '_ref/upstream.ts']) {
        expect(edit(cwd, path).exitCode).toBe(2);
      }
      expect(existsSync(join(outside, 'secret.ts'))).toBe(false);
    } finally { rmSync(cwd, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
  });
  test('policy-listed _ops subdirectories accept edits; the rest of _ops and invalid entries stay denied', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-ops-writable-')));
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-ops-outside-')));
    try {
      initRepo(cwd);
      writePolicy(cwd, ['_ops/dispatch']);
      expect(edit(cwd, '_ops/dispatch/plan.md')).toEqual({ exitCode: 0, stdout: '', stderr: '' });
      for (const path of ['_ops/dispatch', '_ops/dispatcher/plan.md', '_ops/secret.env', '_ref/dispatch/plan.md']) {
        expect({ path, exitCode: edit(cwd, path).exitCode }).toEqual({ path, exitCode: 2 });
      }
      for (const entry of ['_ops', '_ops/', '/_ops/dispatch', '_ops/../dispatch', '_ops/./dispatch', '_ops\\dispatch', '_ref/dispatch', 7]) {
        writePolicy(cwd, [entry]);
        const result = edit(cwd, '_ops/dispatch/plan.md');
        expect({ entry, exitCode: result.exitCode }).toEqual({ entry, exitCode: 2 });
        expect(result.stderr).toContain(`agent_writable_private_dirs: ${JSON.stringify(entry)} is not a canonical directory`);
      }
      writePolicy(cwd, '_ops/dispatch');
      expect(edit(cwd, '_ops/dispatch/plan.md').stderr).toContain('agent_writable_private_dirs: not an array');
      writePolicy(cwd, ['_ops/dispatch']);
      mkdirSync(join(cwd, '_ops/dispatch'), { recursive: true });
      writeFileSync(join(cwd, '_ops/dispatch/real.md'), 'x');
      symlinkSync(join(cwd, '_ops/dispatch/real.md'), join(cwd, '_ops/dispatch/inside.md'));
      symlinkSync(join(outside, 'file'), join(cwd, '_ops/dispatch/outside.md'));
      mkdirSync(join(cwd, '_ops/env'), { recursive: true });
      for (const path of ['_ops/dispatch/inside.md', '_ops/dispatch/outside.md', '_ops/dispatch/x/../plan.md', '_ops/dispatch/./plan.md', '_ops/dispatch/plans/*']) {
        const result = edit(cwd, path);
        expect({ path, exitCode: result.exitCode }).toEqual({ path, exitCode: 2 });
      }
      symlinkSync(join(cwd, '_ops/env/new.env'), join(cwd, '_ops/dispatch/dangling.md'));
      expect(edit(cwd, '_ops/dispatch/dangling.md').stderr).toContain('resolves through the symlink _ops/dispatch/dangling.md');
      // A root alias and, on a case-insensitive volume, a case variant name the same file but not the listed spelling.
      symlinkSync(cwd, join(outside, 'alias'));
      const spellings = [join(outside, 'alias/_ops/dispatch/plan.md')];
      if (existsSync(join(cwd, 'readme.md'))) spellings.push('_ops/DISPATCH/plan.md', '_OPS/dispatch/plan.md');
      for (const path of spellings) expect({ path, exitCode: edit(cwd, path).exitCode }).toEqual({ path, exitCode: 2 });
      expect(edit(cwd, join(cwd, '_ops/dispatch/new/plan.md')).exitCode).toBe(0);
    } finally { rmSync(cwd, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
  });
  test('a denial writes one stderr reason with its fix and one failure record with the payload run id', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-denial-')));
    try {
      initRepo(cwd);
      const result = invoke(cwd, { tool_input: { file_path: '_ops/secret.env' } }, 'run-from-payload');
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr.trimEnd().split('\n')).toEqual([
        '[OpsPrivateGuard] _ops/secret.env is under _ops/, the ignored local private operations state for secrets, real env files, provider state, artifacts, logs, and scratch files.',
        '  Fix: Commit deploy/ runbooks, release checklists, scripts, submissions, and env examples; do not write _ops/* through agent edits.',
      ]);
      const records = failureRecords(cwd);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        guard: 'OpsPrivateGuard',
        action: 'block',
        failure_class: 'state_violation',
        run_id: 'run-from-payload',
      });
      expect(existsSync(join(cwd, '.ai/harness/state/circuit-breaker.json'))).toBe(false);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
  test('a missing edit target fails closed and legacy path aliases are not read', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-missing-path-')));
    try {
      initRepo(cwd);
      for (const payload of [
        {},
        { tool_input: {} },
        { file_path: '_ops/secret.env' },
        { trigger_file_path: '_ops/secret.env', parent_file_path: '_ops/secret.env' },
      ]) {
        const result = invoke(cwd, payload);
        expect({ payload, exitCode: result.exitCode }).toEqual({ payload, exitCode: 2 });
        expect(result.stderr).toContain('[EditScopeGuard] Edit input did not expose a target path in tool_input.file_path.');
        expect(result.stderr).toContain('  Fix: ');
        expect(result.stderr).not.toContain('OpsPrivateGuard');
      }
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
  test('host edit route refuses absolute aliases of private/reference targets and allows verified external paths', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-alias-')));
    const cwd = join(root, 'repo');
    const outside = join(root, 'outside');
    const home = join(root, 'home');
    try {
      for (const dir of [cwd, outside, home]) mkdirSync(dir, { recursive: true });
      initRepo(cwd);
      for (const dir of ['src', '_ops', '_ref']) mkdirSync(join(cwd, dir), { recursive: true });
      symlinkSync(join(cwd, '_ops'), join(cwd, 'src/opslink'));
      // Literal strings: path.join would collapse the `..` and `//` forms before the hook sees them.
      const refused = [
        `${cwd}/src/../_ops/secret.env`,
        `${cwd}/src/../_ref/upstream.txt`,
        `${cwd}//_ops/secret.env`,
        `${cwd}/./_ops/secret.env`,
        `${cwd}/src/opslink/secret.env`,
        `${outside}/../repo/_ops/secret.env`,
      ];
      // macOS volumes are usually case-insensitive; there `_OPS` is the same directory as `_ops`.
      if (existsSync(join(cwd, '_OPS'))) refused.push(`${cwd}/_OPS/secret.env`, `${cwd.toUpperCase()}/_ops/secret.env`);
      for (const filePath of refused) {
        const result = hostEdit(cwd, home, { file_path: filePath });
        expect({ filePath, status: result.status }).toEqual({ filePath, status: 2 });
        expect(result.stderr).toMatch(/\[(RepoScopeGuard|OpsPrivateGuard|ExternalReferenceGuard)\]/);
      }
      const patched = hostEdit(cwd, home, { command: `*** Begin Patch\n*** Add File: ${cwd}/src/../_ops/secret.env\n+secret\n*** End Patch` });
      expect(patched.status).toBe(2);
      expect(patched.stderr).toContain('[RepoScopeGuard]');

      const external = hostEdit(cwd, home, { file_path: `${outside}/notes.md` });
      expect(external.status).toBe(0);
      expect(external.stdout).not.toContain('action":"block');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 60_000);
  test.skipIf(process.platform === 'win32')('host edit route allows foreign Win32 drive paths only when no repository entry can alias them', () => {
    // On a POSIX host a Win32 drive path is not native-absolute. A host that reads
    // it as relative writes below `<repo>/C:`, so an existing entry there is an alias.
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-win32-')));
    const cwd = join(root, 'repo');
    const home = join(root, 'home');
    try {
      mkdirSync(cwd, { recursive: true }); mkdirSync(home, { recursive: true });
      initRepo(cwd);
      mkdirSync(join(cwd, '_ops'), { recursive: true });
      for (const host of ['claude', 'codex'] as const) {
        for (const filePath of ['C:/Users/user/notes.md', 'C:\\Users\\user\\notes.md']) {
          expect({ host, filePath, status: hostEdit(cwd, home, { file_path: filePath }, host).status })
            .toEqual({ host, filePath, status: 0 });
        }
        for (const filePath of ['C:/../_ops/secret.env', 'C:\\..\\_ops\\secret.env']) {
          const result = hostEdit(cwd, home, { file_path: filePath }, host);
          expect({ host, filePath, status: result.status }).toEqual({ host, filePath, status: 2 });
          expect(`${result.stdout}${result.stderr}`).toContain('[RepoScopeGuard]');
        }
      }
      const patch = { command: '*** Begin Patch\n*** Add File: C:/secret.env\n+secret\n*** End Patch' };
      // Control: the same patch passes while no `C:` entry exists, so the deny below comes from the alias.
      expect(hostEdit(cwd, home, patch, 'codex').status).toBe(0);
      symlinkSync(join(cwd, '_ops'), join(cwd, 'C:'));
      const aliased = hostEdit(cwd, home, patch, 'codex');
      expect(aliased.status).toBe(2);
      expect(`${aliased.stdout}${aliased.stderr}`).toContain('[RepoScopeGuard]');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 60_000);
  test('host edit route checks apply_patch headers that Codex accepts with surrounding whitespace', () => {
    // codex-cli 0.160.0 trims file hunk headers with Rust str::trim (Unicode
    // White_Space, including U+0085 that JS \s lacks) before it matches them.
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-patch-indent-')));
    const cwd = join(root, 'repo');
    const home = join(root, 'home');
    try {
      mkdirSync(cwd, { recursive: true }); mkdirSync(home, { recursive: true });
      initRepo(cwd);
      for (const [indent, target] of [['  ', '_ops/indented'], ['\t', '_ops/tab'], ['\u0085', '_ops/nel'], ['\u3000', '_ref/ideographic']]) {
        const command = `*** Begin Patch\n*** Add File: src/okay.ts\n+okay\n${indent}*** Add File: ${target}\n+secret\n*** End Patch`;
        for (const host of ['claude', 'codex'] as const) {
          const result = hostEdit(cwd, home, { command }, host);
          expect({ host, target, status: result.status }).toEqual({ host, target, status: 2 });
          expect(`${result.stdout}${result.stderr}`).toContain(`${target} is under`);
        }
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 60_000);
  test('host edit route refuses the protected directory itself', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-protected-dir-')));
    const cwd = join(root, 'repo');
    const home = join(root, 'home');
    try {
      mkdirSync(cwd, { recursive: true }); mkdirSync(home, { recursive: true });
      initRepo(cwd);
      const cases: Array<[Record<string, string>, string]> = [
        [{ file_path: '_ops' }, '[OpsPrivateGuard]'],
        [{ file_path: `${cwd}/_ops/` }, '[OpsPrivateGuard]'],
        [{ file_path: '_ref' }, '[ExternalReferenceGuard]'],
        [{ command: '*** Begin Patch\n*** Add File: _ops\n+x\n*** End Patch' }, '[OpsPrivateGuard]'],
      ];
      for (const [toolInput, guard] of cases) {
        for (const host of ['claude', 'codex'] as const) {
          const result = hostEdit(cwd, home, toolInput, host);
          expect({ host, toolInput, status: result.status }).toEqual({ host, toolInput, status: 2 });
          expect(`${result.stdout}${result.stderr}`).toContain(guard);
        }
      }
      const sibling = hostEdit(cwd, home, { file_path: '_opsnotes.md' });
      expect(sibling.status).toBe(0);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 60_000);
  test('host edit route keeps a private-path deny when diagnostic I/O fails', () => {
    const faults: Record<string, (cwd: string) => void> = {
      'read-only failure log directory': (cwd) => {
        mkdirSync(join(cwd, '.ai/harness/failures'), { recursive: true });
        chmodSync(join(cwd, '.ai/harness/failures'), 0o555);
      },
      'failure log path is a directory': (cwd) => mkdirSync(join(cwd, '.ai/harness/failures/latest.jsonl'), { recursive: true }),
    };
    for (const [fault, install] of Object.entries(faults)) {
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-diagnostic-fault-')));
      const cwd = join(root, 'repo');
      const home = join(root, 'home');
      try {
        mkdirSync(cwd, { recursive: true }); mkdirSync(home, { recursive: true });
        initRepo(cwd);
        install(cwd);
        const result = hostEdit(cwd, home, { file_path: '_ops/secret.env' });
        expect({ fault, status: result.status }).toEqual({ fault, status: 2 });
        expect(result.stderr).toContain('[OpsPrivateGuard] _ops/secret.env is under _ops/');
        expect(result.stderr).toContain('  Fix: ');
        expect(result.stderr).not.toContain('mutation-guard failed');
      } finally {
        if (existsSync(join(cwd, '.ai/harness/failures'))) chmodSync(join(cwd, '.ai/harness/failures'), 0o755);
        rmSync(root, { recursive: true, force: true });
      }
    }
  }, 60_000);
  test('unparseable patch fails closed and a private target stops the batch', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-cutover-patch-')));
    try {
      initRepo(cwd);
      const unparseable = invoke(cwd, { tool_input: { command: 'unparseable' } });
      expect(unparseable.exitCode).toBe(2);
      expect(unparseable.stderr).toContain('[ApplyPatchScopeGuard]');
      const result = invoke(cwd, { tool_input: { command: '*** Begin Patch\n*** Add File: _ops/secret.env\n+secret\n*** Add File: src/okay.ts\n+okay\n*** End Patch' } });
      expect(result.exitCode).toBe(2); expect(result.stderr).toContain('OpsPrivateGuard');
      expect(failureRecords(cwd)).toHaveLength(2);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
  test('one managed edit of an unowned path runs only the root lookup and writes no effective state', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-git-probe-')));
    const bin = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-git-probe-bin-')));
    try {
      initRepo(cwd);
      const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
      const gitLog = join(bin, 'git.log');
      writeFileSync(join(bin, 'git'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "$GIT_LOG"\nexec "${realGit}" "$@"\n`, { mode: 0o755 });
      writeFileSync(join(bin, 'repo-harness-hook'), `#!/bin/sh\nexec "${process.execPath}" "${HOOK_ENTRY}" "$@"\n`, { mode: 0o755 });
      const route = getRoute('PreToolUse', 'edit');
      if (!route) throw new Error('missing PreToolUse.edit route');
      const hostEnv: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, GIT_LOG: gitLog };
      delete hostEnv.HOOK_REPO_ROOT;
      delete hostEnv.HOOK_HOST;
      const result = spawnSync('sh', ['-c', buildHookCommand(route, 'claude')], {
        cwd,
        env: hostEnv,
        input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: 'src/feature.ts', content: 'x' } }),
        encoding: 'utf8',
      });
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(gitLog, 'utf8').trim().split('\n')).toEqual(['rev-parse --show-toplevel']);
      expect(existsSync(stateVersionOwnerPath(cwd))).toBe(false);
    } finally { rmSync(cwd, { recursive: true, force: true }); rmSync(bin, { recursive: true, force: true }); }
  }, 30_000);

  test('archcontext mode resolves ownership only for the clean paths of a batch', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'mutation-owner-archctx-')));
    try {
      initRepo(cwd);
      writeFileSync(join(cwd, '.ai/harness/policy.json'), `${JSON.stringify({ version: 1, context: { capability_source: 'archcontext' } })}\n`);
      mkdirSync(join(cwd, '.archcontext/model/nodes'), { recursive: true });
      writeFileSync(join(cwd, '.archcontext/model/nodes/capability.core.owned.yaml'), [
        'schemaVersion: archcontext.node/v2', 'id: capability.core.owned', 'kind: capability', 'name: owned', 'status: active',
        'summary: Owned core code', 'responsibilities:', '  - Own the core code', 'source:', '  include:', '    - src/owned/**',
        'extensions:', '  contractFiles:', '    agents: AGENTS.md', '    claude: CLAUDE.md', '  lspProfile: typescript-lsp', '  verification: []', '',
      ].join('\n'));
      mkdirSync(join(cwd, 'src/owned'), { recursive: true });
      writeFileSync(join(cwd, 'src/owned/a.ts'), 'export const a = 1;\n');
      writeFileSync(join(cwd, 'src/owned/b.ts'), 'export const b = 1;\n');
      git(cwd, ['add', '.']);
      git(cwd, ['commit', '-m', 'owned code']);
      writeFileSync(join(cwd, 'src/owned/a.ts'), 'export const a = 2;\n');

      // Each hook call is one process, so each payload runs in its own child.
      // The child registers an ownership provider whose stand-in for `archctx resolve`
      // records each batch and owns every path it gets.
      const worker = `
        const calls = [];
        const { registerArchitecturePorts } = await import(process.env.CONTRACTS_MODULE);
        const { ARCHITECTURE_PROVIDERS } = await import(process.env.PROVIDERS_MODULE);
        registerArchitecturePorts({ ownership: {
          ...ARCHITECTURE_PROVIDERS.ownership,
          resolvePaths(_root, owners, paths) {
            calls.push([...paths]);
            const capability = owners.get('capability.core.owned');
            return { status: 'valid', capabilityIds: [capability.id], matches: paths.map((filePath) => ({ capability, prefix: capability.id, filePath })), unmappedPaths: [], diagnostics: [] };
          },
        } });
        const { runMutationGuard } = await import(process.env.GUARD_MODULE);
        const identity = { host: 'codex', sessionId: null, runId: null, turnId: null };
        const { stdout } = runMutationGuard({ repoRoot: process.env.FIXTURE_ROOT, payload: JSON.parse(process.env.FIXTURE_PAYLOAD), identity });
        process.stdout.write(JSON.stringify({ calls, stdout }));
      `;
      const guard = (payload: Record<string, unknown>) => {
        const child = spawnSync(process.execPath, ['-e', worker], {
          cwd,
          encoding: 'utf8',
          env: {
            ...process.env,
            FIXTURE_ROOT: cwd,
            FIXTURE_PAYLOAD: JSON.stringify(payload),
            GUARD_MODULE: join(import.meta.dir, '../src/cli/hook/mutation-guard.ts'),
            CONTRACTS_MODULE: join(import.meta.dir, '../src/core/architecture/contracts.ts'),
            PROVIDERS_MODULE: join(import.meta.dir, '../src/effects/architecture/providers.ts'),
          },
        });
        expect(child.status, child.stderr).toBe(0);
        return JSON.parse(child.stdout) as { calls: string[][]; stdout: string };
      };
      const ownerLine = /^\[CapabilityOwner\] src\/owned\/b\.ts belongs to \S+ \(.+\)\.\n$/;

      expect(guard({ tool_input: { file_path: 'src/owned/a.ts' } })).toEqual({ calls: [], stdout: '' });
      const clean = guard({ tool_input: { file_path: 'src/owned/b.ts' } });
      expect(clean.calls).toEqual([['src/owned/b.ts']]);
      expect(clean.stdout).toMatch(ownerLine);
      const command = '*** Begin Patch\n*** Update File: src/owned/a.ts\n@@\n-x\n+y\n*** Update File: src/owned/b.ts\n@@\n-x\n+y\n*** End Patch';
      expect(guard({ tool_input: { command } })).toEqual(clean);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 30_000);
});
