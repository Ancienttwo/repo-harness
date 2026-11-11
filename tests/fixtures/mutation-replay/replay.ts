// Differential replay for #2082 (JD-16 and the PR #2343 fix round; extends the JD-13 corpus of PR #2331): every corpus row runs through the Bash route decision
// (runBashMutationGuard, the function the bash-mutation-guard handler calls) of <base> and of <head>.
// Usage: bun /tmp/rh2082-replay/replay.ts <checkout> [base-ref=origin/main] [head-ref=HEAD]
// No corpus command is executed; the hook only decides.
import { execFileSync, spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const [checkout = process.cwd(), baseRef = 'origin/main', headRef = 'HEAD', probe] = process.argv.slice(2);
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'rh2082-replay-')));

function extract(ref: string, name: string): { dir: string; sha: string } {
  const sha = execFileSync('git', ['-C', checkout, 'rev-parse', ref], { encoding: 'utf8' }).trim();
  const dir = join(scratch, name);
  mkdirSync(dir);
  const archive = spawnSync('git', ['-C', checkout, 'archive', sha, 'src', 'package.json', 'tsconfig.json'], { maxBuffer: 1 << 30 });
  if (archive.status !== 0) throw new Error(String(archive.stderr));
  const tar = spawnSync('tar', ['-x', '-C', dir], { input: archive.stdout });
  if (tar.status !== 0) throw new Error(String(tar.stderr));
  symlinkSync(join(realpathSync(checkout), 'node_modules'), join(dir, 'node_modules'));
  return { dir, sha };
}

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' });
const root = join(scratch, 'fixture');
const repo = join(root, 'repo');
const managed = join(root, 'wt');
mkdirSync(managed, { recursive: true });
for (const dir of ['src/a', 'docs', '_ops/env', '_ref', '.ai/harness', 'node_modules/pkg']) mkdirSync(join(repo, dir), { recursive: true });
writeFileSync(join(repo, '.ai/harness/workflow-contract.json'), '{}\n');
writeFileSync(join(repo, 'a'), 'a\n');
symlinkSync('_ops', join(repo, 'lnk'));
symlinkSync('..', join(repo, 'src/up'));
git(repo, 'init', '-q', '-b', 'main');
git(repo, '-c', 'user.email=r@example.com', '-c', 'user.name=r', 'commit', '-q', '--allow-empty', '-m', 'seed');
process.env.REPO_HARNESS_WORKTREE_ROOT = managed;

const CD = [
  '', 'cd src && ', 'cd ./src && ', 'cd src/a && ', 'cd .. && ', 'cd nope && ', 'cd _ops && ', 'cd /tmp && ', 'cd /etc && ',
  'cd sr[c] && ', 'cd ./s[r]c && ', 'cd s[r]c/a && ', 'cd _op[s] && ', 'cd /tm[p] && ', 'cd /et[c] && ', 'cd no[p]e && ',
  'cd src && cd ../sr[c] && ', 'cd sr[c] && cd a && ', 'cd src && cd sr[c] && ', 'cd sr? && ', 'cd s*c && ', 'cd _op* && ',
  'cd /tm* && ', 'cd .[.] && ', 'cd {src,docs} && ', 'cd "sr[c]" && ', "cd 'sr[c]' && ", 'cd s\\[r\\]c && ', 'cd -P src && ',
  'cd -P sr[c] && ', 'cd -L /et[c] && ', 'cd -- sr[c] && ', 'cd $D && ', 'cd ~ && ', 'cd ~/x && ', 'cd src/* && ',
  'cd sr[c]; ', 'cd sr[c] || ', 'cd _op[s]; ', 'cd /tm[p]; ', 'cd sr[c]\n', '(cd _op*); cd src; ', '(cd sr[c]); ',
];
const BODY = [
  'git worktree add ../x', 'git worktree add x', 'git worktree add ./x', 'git worktree add --detach ../x HEAD',
  'git -C . worktree add ../x', 'git -C .. worktree add x', 'git -C src worktree add ../x', 'git -C /tmp worktree add x',
  'git worktree add /tmp/x', `git worktree add ${managed}/repo-wt-ok`, 'git worktree add ../wt/repo-wt-ok',
  'git worktree add ../../wt/repo-wt-ok', 'git worktree add -b br ../x', 'git worktree add "../x"', 'git worktree add ../x[1]',
  'git worktree add ../x*', 'git worktree add $T', 'git worktree add ~/x',
  'rm -rf env', 'rm -rf _ops/x', 'echo x > _ops/x', 'echo x > ../_ops/x', 'rm x', 'echo x > safe.txt', 'rm -rf ../_ref',
  'cp a _ops/x', 'echo x > /etc/x', 'rm -rf l*/env', 'echo x > ../../x',
];
const FORMS: string[] = [
  // #2090 round 1 (records 6743905756, 6743910851) and the head test table.
  'echo $(date) && git worktree add --detach ../x HEAD', 'echo "$(date)" && git worktree add ../x', 'echo pre$(date)post; git worktree add ../x',
  'echo `date`; git worktree add ../x', 'git worktree add --detach ../x "$(printf HEAD)"', 'git worktree add --detach ../x $(printf HEAD)',
  'echo $(date) && git worktree add ../x', 'echo `date` && git worktree add ../x', 'echo "$(date)"\ngit worktree add ../x',
  'X=$(pwd) git worktree add ../x', 'echo $(date)\ngit worktree add ../x', 'echo `date`\ngit worktree add ../x',
  'echo $(date) && git "worktree" "add" ../x', 'echo $(date) && git worktree ad\\\nd ../x', 'git worktree add --detach ../x HEAD && echo "$(date)"',
  'diff <(ls) x; git worktree add ../x', 'cat <<A <<B\nx\nA\ny\nB\ngit worktree add ../x', 'git worktree add "$(mktemp -d)"',
  'git worktree add ../x $(date)\n(', 'cat <<EOF > report.txt\n$(echo x > _ops/x)\nEOF', 'cat <<EOF > report.txt\n`echo x > _ref/x`\nEOF',
  "cat <<'EOF' > report.txt\n$(echo x)\nEOF", '(cd _op*); cd src; echo x > safe.txt', 'echo x >& _ops/x', 'echo x >| _ops/x',
  // #2090 round 2 (records 6746591844, 6746596846).
  'cd s[r]c && git worktree add ../x', 'cd ./s[r]c && git worktree add ../x', 'cd /et[c] && git worktree add ../x',
  'cd s[r]c && git worktree add --detach ../x HEAD', 'cd s[r]c && git -C . worktree add ../x', '(cd s[r]c && git worktree add ../x)',
  'cd "s[r]c" && git worktree add ../x', 'cd sr[c] && git worktree add ../x', 'cd _op[s] && git worktree add ../x',
  'cd /tm[p] && git worktree add x', 'cd src && cd ../sr[c] && git worktree add ../x',
  // #2082 issue body.
  'echo x > _ops/x; cat <<A <<B\nA\nB', 'cat <<"$D" > _ops/x\n$D', 'echo "$(echo x > _ops/x)" > report.txt', 'cd src/* && rm _ops/x',
  'rm -rf l*/env', 'diff <(ls) x; rm -rf _ops', 'tee >(cat) _ops/y', 'rm -rf $(true) _ops', "echo v > '_ops/a\nb'", 'rm -rf ~/x',
  '(cd _op*); cd src; echo x > safe.txt', 'cd _op[s] && rm -rf env', 'cd /tmp/x* && rm -rf build', 'cd -P /etc && rm passwd',
  'cd /et[c] && rm passwd',
];

// Record 6786114073 (PR #2331 Claude row): one cd per row missed glob-then-literal sequences.
FORMS.push(
  'cd sr[c] && cd .. && rm -rf _ops', 'cd sr[c] && cd .. && echo x > _ops/x', 'cd sr[c] && cd ../_ops && echo x > y',
  'cd sr[c] && cd ../_ops && rm -rf env', 'cd s[r]c/a && cd ../.. && rm -rf _ref', '(cd sr[c] && cd .. && rm -rf _ops)',
  'cd src && cd ../sr[c] && cd .. && rm -rf _ops', 'cd sr[c] && git worktree add ../../wt/repo-wt-ok',
  // Record 6786365948 (PR #2331 gatekeeper row) P3 forms.
  'cat <<EOF > notes.md\nDate: $(date)\nEOF', 'echo "$(date)" > notes.md', 'v=$(date) && echo $v > notes.md', 'rm -rf ~/build',
  'rm -rf node_modules/*',
  // Record 6787055526 (PR #2343 Claude row) F1 forms, and writes inside a substitution.
  "git commit -m \"$(cat <<'EOF'\nfix(hook): map a -> b\nEOF\n)\"",
  "gh pr create --title x --body \"$(cat <<'EOF'\n## Summary\n- run node scripts\nEOF\n)\"",
  'git commit -m "use `node` for the cp step"', 'ls $(pwd) | grep x > /tmp/out.txt',
  'echo "$(rm -rf _ops)"', 'x=$(cd _ops && rm -rf env)', 'echo `echo x > _ops/x`', 'cd src && echo "$(rm -rf ../_ops)"',
  'X=$(pwd) git worktree add ../x', 'X=1 rm -rf _ops', 'echo $(echo $(rm -rf _ref))', 'echo "$(cd .. && echo x > y)"',
);

// PR #2343 round-2 reviewer rows: the Claude reviewer probe files (/tmp/rv2343-claude/probe*.json, r2/probe.json) and the
// gatekeeper probe files (/tmp/gk2082r2/probe-*.json), copied into extra-rows.json next to this script.
FORMS.push(...JSON.parse(readFileSync(join(import.meta.dir, 'extra-rows.json'), 'utf8')) as string[]);
// Round 3: a substitution in the word of a descriptor redirect, and a cd after a leading assignment.
for (const redirect of ['>&', '>& ', '2>&', '<&']) FORMS.push(`echo x ${redirect}$(rm -rf _ops)`, `echo x ${redirect}$(git worktree add ../x)`);

const rows = new Set<string>(FORMS);
for (const cd of CD) for (const body of BODY) {
  rows.add(`${cd}${body}`);
  rows.add(`(${cd}${body})`);
}

// JD-16 composed rows: 1 to 3 cd from six shapes joined by one of six joins, then one write form, plain, whole in a subshell
// and with the write in a subshell.
const SHAPES = [
  'src', 'src/a', 'nope', // literal
  'sr[c]', 's*c', '_op*', // glob
  '..', '../_ops', 'a/..', // dot-dot
  '_ops', '_ref', // protected directory
  '/tmp', repo, `${repo}/src`, // absolute
  '$D', '"$(printf src)"', // substitution
];
const WRITES = [
  'rm -rf _ops', 'rm -rf env', 'rm -rf ../_ref', 'rm x', // rm
  'echo x > _ops/x', 'echo x > ../_ops/x', 'echo x > y', 'echo x > /tmp/rh2082-y', // redirect
  'git worktree add ../x', 'git worktree add x', `git worktree add ${managed}/repo-wt-ok`, 'git worktree add ../wt/repo-wt-ok', // worktree add
  'git -C .. worktree add x', 'git -C . worktree add ../x', 'git -C /tmp worktree add x', `git -C ${repo} worktree add x`, // git -C
  'echo "$(rm -rf env)"', 'x=`echo x > _ops/x`', // write inside a substitution
  'echo x >&$(rm -rf env)', // substitution in a descriptor redirect
];
const sequences: string[][] = SHAPES.map(shape => [shape]);
for (let n = 1; n < 3; n++) for (const prefix of sequences.filter(seq => seq.length === n)) for (const shape of SHAPES) sequences.push([...prefix, shape]);
let composed = 0;
for (const seq of sequences) {
  const joins = [' && ', '; ', '\n', ' || ', ' | ', ' & '];
  for (const join of joins) {
    const prefix = seq.map(shape => `cd ${shape}`).join(join) + join;
    for (const write of WRITES) for (const row of [`${prefix}${write}`, `(${prefix}${write})`, `${prefix}(${write})`]) {
      rows.add(row); composed++;
    }
  }
}
// Round 3: one cd after a leading assignment, for each operand and write form.
for (const assign of ['CDPATH=..', 'CDPATH=_ops', 'X=1', 'X=1 CDPATH=..']) for (const shape of [...SHAPES, 'repo', 'env']) {
  for (const join of [' && ', '; ']) for (const write of WRITES) {
    for (const row of [`${assign} cd ${shape}${join}${write}`, `(${assign} cd ${shape}${join}${write})`]) { rows.add(row); composed++; }
  }
}
console.log(`composed=${composed} sequences=${sequences.length}`);

// Optional 4th argument: a JSON array of commands; each one prints its base and head decision instead of the corpus.
if (probe) { rows.clear(); for (const row of JSON.parse(await Bun.file(probe).text()) as string[]) rows.add(row); }
const base = extract(baseRef, 'base');
const head = extract(headRef, 'head');
const load = async (dir: string) => (await import(join(dir, 'src/cli/hook/mutation-bash.ts'))).runBashMutationGuard as
  (opts: unknown) => { exitCode: number };
const decide = { base: await load(base.dir), head: await load(head.dir) };
const identity = { host: 'claude', sessionId: null, runId: null, turnId: null };
const loosened: string[] = [];
let total = 0, baseDeny = 0, headDeny = 0, stricter = 0;
for (const command of rows) for (const cwd of [repo, join(repo, 'src')]) {
  const run = (fn: typeof decide.base) => fn({ repoRoot: repo, payload: { tool_input: { command }, cwd }, identity }).exitCode !== 0;
  const b = run(decide.base), h = run(decide.head);
  total++; if (b) baseDeny++; if (h) headDeny++;
  if (b && !h) loosened.push(`${JSON.stringify(command)} cwd=${cwd === repo ? 'repo' : 'repo/src'}`);
  if (!b && h) stricter++;
  if (probe) console.log(`${b ? 'deny ' : 'allow'} -> ${h ? 'deny ' : 'allow'} cwd=${cwd === repo ? 'repo' : 'src'} ${JSON.stringify(command)}`);
}
console.log(`base ${baseRef} ${base.sha}\nhead ${headRef} ${head.sha}`);
console.log(`rows=${total} base_deny=${baseDeny} head_deny=${headDeny} head_only_deny=${stricter} main_deny_head_allow=${loosened.length}`);
for (const row of loosened) console.log(`LOOSENED ${row}`);
rmSync(scratch, { recursive: true, force: true });
process.exit(loosened.length ? 1 : 0);
