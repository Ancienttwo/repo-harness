import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { tmpWorkspace } from '../helpers/repo-fixture';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { runGit } from '../../src/effects/git/run-git';
import {
  DEFAULT_GIT_TIMEOUT_MS,
  GitExecError,
  gitExecFile,
  gitExecFileSync,
  gitSpawnSync,
  resolveGitExecutable,
  resolveGitTimeout,
} from '../../src/effects/git/runner';

import { withReadonlyObservation, ObservationViolation } from '../../src/effects/readonly-observation';

const ROOT = join(import.meta.dir, '..', '..');
const SRC = join(ROOT, 'src');

function writeGit(dir: string, body: string): string {
  const bin = join(dir, 'git');
  writeFileSync(bin, body, { mode: 0o755 });
  chmodSync(bin, 0o755);
  return bin;
}

function withGitBin(bin: string, run: () => void): void {
  const previous = process.env.REPO_HARNESS_GIT_BIN;
  process.env.REPO_HARNESS_GIT_BIN = bin;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.REPO_HARNESS_GIT_BIN;
    else process.env.REPO_HARNESS_GIT_BIN = previous;
  }
}

describe('git runner', () => {
  test('REPO_HARNESS_GIT_BIN is the executable for every runner entry', () => {
    const root = tmpWorkspace('git-runner-bin');
    try {
      const record = join(root, 'args');
      const bin = writeGit(root, `#!/bin/sh\nprintf '%s\\n' "$*" > ${JSON.stringify(record)}\nprintf 'ok\\n'\n`);
      const gitDir = join(root, 'common');
      mkdirSync(gitDir);
      mkdirSync(join(root, 'common-bin'));
      const commonGit = writeGit(join(root, 'common-bin'), `#!/bin/sh\nprintf '%s\\n' ${JSON.stringify(gitDir)}\n`);
      expect(gitExecFileSync(['status', '--porcelain'], {
        encoding: 'utf8',
        env: { ...process.env, REPO_HARNESS_GIT_BIN: bin },
      }).trim()).toBe('ok');
      expect(readFileSync(record, 'utf8')).toBe('status --porcelain\n');
      const spawned = gitSpawnSync(['diff'], {
        encoding: 'utf8',
        env: { ...process.env, REPO_HARNESS_GIT_BIN: bin },
      });
      expect(spawned.status).toBe(0);
      expect(readFileSync(record, 'utf8')).toBe('diff\n');
      const ran = runGit(['rev-parse'], {
        env: { ...process.env, REPO_HARNESS_GIT_BIN: bin },
        timeoutMs: 5_000,
      });
      expect(ran.status).toBe(0);
      expect(ran.stdout.trim()).toBe('ok');
      withGitBin(commonGit, () => {
        expect(resolveGitCommonDirectory(root)).toBe(gitDir);
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('an explicit git path wins over REPO_HARNESS_GIT_BIN', () => {
    const root = tmpWorkspace('git-runner-explicit');
    try {
      const record = join(root, 'which');
      const ignored = writeGit(root, `#!/bin/sh\nprintf 'env\\n' > ${JSON.stringify(record)}\n`);
      mkdirSync(join(root, 'chosen'));
      const pinned = writeGit(join(root, 'chosen'), `#!/bin/sh\nprintf 'pinned\\n' > ${JSON.stringify(record)}\nprintf 'ok\\n'\n`);
      expect(gitExecFileSync(['status'], {
        encoding: 'utf8',
        gitBin: pinned,
        env: { ...process.env, REPO_HARNESS_GIT_BIN: ignored },
      }).trim()).toBe('ok');
      expect(readFileSync(record, 'utf8')).toBe('pinned\n');
      expect(resolveGitExecutable('git', { REPO_HARNESS_GIT_BIN: pinned }, {})).toBe(pinned);
      expect(resolveGitExecutable(pinned, { REPO_HARNESS_GIT_BIN: ignored }, {})).toBe(pinned);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('a hung git stops at the runner timeout', () => {
    const root = tmpWorkspace('git-runner-hang');
    try {
      const bin = writeGit(root, '#!/bin/sh\nsleep 30\n');
      const started = Date.now();
      const result = gitSpawnSync(['sleep'], { gitBin: bin, timeout: 300 });
      expect(Date.now() - started).toBeLessThan(5_000);
      expect((result.error as NodeJS.ErrnoException | undefined)?.code).toBe('ETIMEDOUT');
      expect(resolveGitTimeout(undefined)).toBe(DEFAULT_GIT_TIMEOUT_MS);
      expect(DEFAULT_GIT_TIMEOUT_MS).toBe(120_000);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('pinned synchronous calls retain observation refusal and the default deadline', () => {
    const denied = new ObservationViolation('fixture refuses git');
    let calls = 0;
    expect(() => withReadonlyObservation({
      readFile() { throw new Error('unexpected read'); },
      readDirectory() { throw new Error('unexpected directory'); },
      validatePath() {},
      exec(file, args, options) {
        calls++;
        expect(file).toBe('/fixture/pinned/git');
        expect(args).toEqual(['rev-parse']);
        expect(options.timeout).toBe(DEFAULT_GIT_TIMEOUT_MS);
        expect(options.env?.FIXTURE_PIN).toBe('retained');
        throw denied;
      },
    }, () => gitSpawnSync(['rev-parse'], {
      gitBin: '/fixture/pinned/git', encoding: 'utf8', env: { FIXTURE_PIN: 'retained' },
    }))).toThrow(denied);
    expect(calls).toBe(1);
  });

  test('a local git command runs without provider tokens, with or without a caller env', () => {
    const root = tmpWorkspace('git-runner-tokens');
    const tokens = { GH_TOKEN: 'fake-gh', GITHUB_TOKEN: 'fake-github', GH_ENTERPRISE_TOKEN: 'fake-ghe', GITHUB_ENTERPRISE_TOKEN: 'fake-github-e' };
    const previous = Object.fromEntries(Object.keys(tokens).map(key => [key, process.env[key]]));
    try {
      const gitBin = writeGit(root, '#!/bin/sh\nprintf "%s" "${GH_TOKEN-}${GITHUB_TOKEN-}${GH_ENTERPRISE_TOKEN-}${GITHUB_ENTERPRISE_TOKEN-}${gh_token-}${GitHub_Token-}"\n');
      const caseVariants = { gh_token: 'fake-lower', GitHub_Token: 'fake-mixed' };
      expect(gitExecFileSync(['-C', root, 'cat-file', '-t', 'HEAD'], { gitBin, encoding: 'utf8', env: { ...process.env, ...tokens, ...caseVariants } })).toBe('');
      expect(runGit(['rev-parse', 'HEAD'], { gitBin, env: tokens }).stdout).toBe('');
      Object.assign(process.env, tokens);
      expect(gitSpawnSync(['merge-tree', '--write-tree', 'a', 'b'], { gitBin, encoding: 'utf8' }).stdout).toBe('');
      // Help, version and unknown-option forms, and option values, do not run the remote command they name.
      for (const args of [['--help', 'fetch'], ['-h', 'push'], ['--version', 'push'], ['--unknown', 'clone'], ['--git-dirX', 'fetch'],
        ['-c', 'x=fetch', 'status'], ['--attr-source', 'fetch', 'version'], ['-C']]) {
        expect(gitSpawnSync(args, { gitBin, encoding: 'utf8' }).stdout, args.join(' ')).toBe('');
      }
      for (const args of [['-C', root, '-c', 'a=b', '--no-pager', '--git-dir=x', 'fetch'], ['--attr-source=HEAD', 'ls-remote']]) {
        expect(gitSpawnSync(args, { gitBin, encoding: 'utf8' }).stdout, args.join(' ')).toBe(Object.values(tokens).join(''));
      }
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('fetch and push keep the caller token for gh auth git-credential', async () => {
    const gh = Bun.which('gh');
    if (!gh) throw new Error('gh is required on PATH for the credential-helper case');
    const root = tmpWorkspace('git-runner-credential');
    const token = 'fake-credential-token';
    const authorized: string[] = [];
    let server: ReturnType<typeof Bun.serve> | undefined;
    try {
      // gh answers only https requests, so the localhost fixture serves TLS with a throwaway certificate.
      const [key, cert] = [join(root, 'key.pem'), join(root, 'cert.pem')];
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=127.0.0.1', '-days', '1', '-keyout', key, '-out', cert], { stdio: 'ignore' });
      server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        tls: { key: readFileSync(key, 'utf8'), cert: readFileSync(cert, 'utf8') },
        fetch(request) {
          const auth = request.headers.get('authorization');
          if (!auth) return new Response('', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="fixture"' } });
          authorized.push(`${new URL(request.url).searchParams.get('service')} ${auth}`);
          return new Response('', { status: 403 });
        },
      });
      const repo = join(root, 'repo');
      gitExecFileSync(['init', '-q', repo]);
      // gh reads GH_ENTERPRISE_TOKEN for a host other than github.com; the empty config dir holds no login.
      const env = { PATH: process.env.PATH, HOME: root, GH_CONFIG_DIR: join(root, 'gh'), GH_NO_UPDATE_NOTIFIER: '1',
        GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GH_ENTERPRISE_TOKEN: token };
      const url = `https://127.0.0.1:${server.port}/fixture.git`;
      const credential = ['-C', repo, '-c', 'http.sslVerify=false', '-c', 'credential.helper=', '-c', `credential.helper=!'${gh}' auth git-credential`];
      for (const args of [[...credential, 'fetch', url], [...credential, 'push', url, ':refs/heads/fixture']]) {
        const failure = await gitExecFile(args, { env, timeout: 30_000 }).then(() => undefined, (error: unknown) => error);
        expect(failure).toBeInstanceOf(GitExecError);
        expect((failure as GitExecError).stderr).not.toContain(token);
      }
      const basic = `Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
      expect(authorized).toEqual([`git-upload-pack ${basic}`, `git-receive-pack ${basic}`]);
    } finally {
      server?.stop(true);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('src starts git only through the runner', () => {
    const patterns = [
      /\b(?:execFileSync|spawnSync|spawn|execFile|observationExecFileSync|observationSpawnSync|runProcess|runBoundedProcess)\(\s*['"]git['"]/g,
      /\b(?:execFileSync|spawnSync)\(\s*(?:(?:gitBin|input\.gitBin|opts\.gitBin|runtime\.gitBin)\b|(?:gitBinary|configuredGitBinary)\s*\()/g,
      /\brunBoundedProcess\(\s*runtime\?\.gitBin/g,
      /\b(?:execFileSync|spawnSync|spawn|execFile|runProcess|runBoundedProcess)\(\s*[\w.?]*\bgit_bin\b(?![^\n]*gitChildEnv\()/g,
      // A branch that hands the same configured binary to the runner and to a raw launcher. The observation
      // executor (direct: true) is exempt: the runner already filtered the env it receives.
      /gitBin:\s*(\w+)(?![^}\n]*direct:\s*true)[\s\S]{0,300}?:\s*(?:execFileSync|spawnSync|spawn|execFile)\(\s*\1\b/g,
      // A script that runs git through REPO_HARNESS_GIT_BIN with an inherited env.
      /\.\.\.(?!withoutProviderTokens\()[^,}\n]*,\s*REPO_HARNESS_GIT_BIN:/g,
    ];
    for (const source of [
      "execFileSync(configuredGitBinary(), ['status'])",
      "spawnSync(gitBinary(), ['status'])",
      "execFileSync(gitBin, ['status'])",
      "spawnSync(input.gitBin, ['status'])",
      "spawnSync(runtime.gitBin, ['status'])",
      "spawnSync(opts.gitBin, ['status'])",
      "spawnSync(input.git_bin ?? 'git', ['rev-parse', 'HEAD'])",
      "isGit ? gitExecFileSync(args, { gitBin: command }) : execFileSync(command, args)",
      "env: { ...withoutRepositorySelectingGitEnv(), REPO_HARNESS_GIT_BIN: gitBinary(limits) }",
    ]) {
      expect(patterns.some(pattern => {
        pattern.lastIndex = 0;
        return pattern.test(source);
      }), source).toBe(true);
    }
    const violations: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
        const relativePath = relative(ROOT, path);
        if (relativePath === 'src/effects/git/runner.ts' || relativePath === 'src/effects/git/run-git.ts') continue;
        const text = readFileSync(path, 'utf8');
        for (const pattern of patterns) {
          pattern.lastIndex = 0;
          if (pattern.test(text)) violations.push(relativePath);
        }
      }
    };
    walk(SRC);
    expect(violations).toEqual([]);
    const collector = readFileSync(join(SRC, 'effects/dev-activity/collector.ts'), 'utf8');
    expect(collector).toContain("command === 'git' ? spawnGit");
  });
});
