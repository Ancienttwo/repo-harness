// Differential replay of the Bash route decision (#2082, #2369): every row runs through runBashMutationGuard, the function the
// bash-mutation-guard handler calls, of <base> and of <head>, from two directories. No row is executed; the hook only decides.
// Usage: bun tests/fixtures/mutation-replay/replay.ts <checkout> [base-ref=origin/main] [head-ref=HEAD] [probe.json | --corpus]
// --corpus skips the composed rows and runs only the hand rows, corpus.json and the command lines of the docs and skills.
// Exit 1 when a row that the base denies is allowed by the head (A1), a head-only denial is not explained by a protected
// name or rule 8 (A4), an in-scope catch row is allowed (A2) or an ordinary row gets a new denial (A3).
import { execFileSync, spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { Glob } from 'bun';
import { tmpdir } from 'os';
import { join } from 'path';

const [checkout = process.cwd(), baseRef = 'origin/main', headRef = 'HEAD', probeArg] = process.argv.slice(2);
const corpusOnly = probeArg === '--corpus';
const probe = corpusOnly ? undefined : probeArg;
// REPLAY_JOBS=n splits the rows over n processes; each child runs every n-th row from REPLAY_SHARD=i/n.
const jobs = Number(process.env.REPLAY_JOBS ?? 1);
const [shard, shards] = (process.env.REPLAY_SHARD ?? '0/1').split('/').map(Number) as [number, number];

interface Summary {
  total: number; baseDeny: number; headDeny: number; stricter: number; seconds: number; base: string; head: string;
  loosened: string[]; unexplained: string[]; caught: string[]; newOrdinary: string[];
  guards: Record<string, number>; acceptedAllowed: Record<string, number>;
  sizes: { catch: number; ordinary: number; docs: number; hand: number; accepted: Record<string, number> };
}

function report(summary: Summary): never {
  const s = summary;
  console.log(`base ${baseRef} ${s.base}\nhead ${headRef} ${s.head}`);
  console.log(`rows=${s.total} base_deny=${s.baseDeny} head_deny=${s.headDeny} head_only_deny=${s.stricter} main_deny_head_allow=${s.loosened.length} seconds=${s.seconds.toFixed(0)}`);
  console.log(`A2 catch=${s.sizes.catch} catch_allowed=${s.caught.length} accepted_allowed=${JSON.stringify(Object.fromEntries(Object.entries(s.sizes.accepted).map(([c, n]) => [c, `${s.acceptedAllowed[c] ?? 0}/${n}`])))}`);
  console.log(`A3 ordinary=${s.sizes.ordinary} (docs ${s.sizes.docs}, hand ${s.sizes.hand}) new_denials=${s.newOrdinary.length}`);
  console.log(`A4 head_only_guards=${JSON.stringify(s.guards)} unexplained=${s.unexplained.length}`);
  for (const row of s.loosened) console.log(`LOOSENED ${row}`);
  for (const row of s.unexplained) console.log(`UNEXPLAINED ${row}`);
  for (const row of s.caught) console.log(`CATCH-ALLOWED ${row}`);
  for (const row of s.newOrdinary) console.log(`ORDINARY-DENIED ${row}`);
  process.exit(s.loosened.length || s.unexplained.length || s.caught.length || s.newOrdinary.length ? 1 : 0);
}

if (jobs > 1 && !process.env.REPLAY_SHARD && !probe) {
  const started = performance.now();
  const children = Array.from({ length: jobs }, (_, i) => Bun.spawn([process.execPath, import.meta.path, ...process.argv.slice(2)], {
    env: { ...process.env, REPLAY_SHARD: `${i}/${jobs}` }, stdout: 'pipe', stderr: 'inherit',
  }));
  const parts = await Promise.all(children.map(async child => {
    const text = await new Response(child.stdout).text();
    await child.exited;
    const line = text.split('\n').find(l => l.startsWith('SUMMARY '));
    if (!line) throw new Error(`a replay shard printed no summary:\n${text}`);
    return JSON.parse(line.slice(8)) as Summary;
  }));
  const sum = parts.reduce((a, b) => ({
    ...a, total: a.total + b.total, baseDeny: a.baseDeny + b.baseDeny, headDeny: a.headDeny + b.headDeny, stricter: a.stricter + b.stricter,
    loosened: [...a.loosened, ...b.loosened], unexplained: [...a.unexplained, ...b.unexplained], caught: [...a.caught, ...b.caught],
    newOrdinary: [...a.newOrdinary, ...b.newOrdinary],
    guards: Object.fromEntries([...new Set([...Object.keys(a.guards), ...Object.keys(b.guards)])].map(k => [k, (a.guards[k] ?? 0) + (b.guards[k] ?? 0)])),
    acceptedAllowed: Object.fromEntries([...new Set([...Object.keys(a.acceptedAllowed), ...Object.keys(b.acceptedAllowed)])]
      .map(k => [k, (a.acceptedAllowed[k] ?? 0) + (b.acceptedAllowed[k] ?? 0)])),
  }));
  report({ ...sum, seconds: (performance.now() - started) / 1000 });
}
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
// Each denial appends a failure record; the record does not change a decision, so it goes to /dev/null.
mkdirSync(join(repo, '.ai/harness/failures'), { recursive: true });
symlinkSync('/dev/null', join(repo, '.ai/harness/failures/latest.jsonl'));
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
// 697 gatekeeper entries are [command, cwd] pairs for another fixture; only the command is replayed.
FORMS.push(...(JSON.parse(readFileSync(join(import.meta.dir, 'extra-rows.json'), 'utf8')) as (string | [string, string])[])
  .map(row => Array.isArray(row) ? row[0] : row));
// Round 3: a substitution in the word of a descriptor redirect, and a cd after a leading assignment.
for (const redirect of ['>&', '>& ', '2>&', '<&']) FORMS.push(`echo x ${redirect}$(rm -rf _ops)`, `echo x ${redirect}$(git worktree add ../x)`);

const rows = new Set<string>(FORMS);
if (!corpusOnly) for (const cd of CD) for (const body of BODY) {
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
const sequences: string[][] = corpusOnly ? [] : SHAPES.map(shape => [shape]);
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
if (!corpusOnly) for (const assign of ['CDPATH=..', 'CDPATH=_ops', 'X=1', 'X=1 CDPATH=..']) for (const shape of [...SHAPES, 'repo', 'env']) {
  for (const join of [' && ', '; ']) for (const write of WRITES) {
    for (const row of [`${assign} cd ${shape}${join}${write}`, `(${assign} cd ${shape}${join}${write})`]) { rows.add(row); composed++; }
  }
}
console.log(`composed=${composed} sequences=${sequences.length}`);

// #2369 corpora. Catch rows (A2) must be denied; accepted-class rows are counted; ordinary rows (A3) get no new denial.
const corpus = JSON.parse(readFileSync(join(import.meta.dir, 'corpus.json'), 'utf8')) as {
  catch: string[]; accepted: Record<string, string[]>; ordinary: string[];
};
const fill = (row: string) => row.replaceAll('${MANAGED}', managed);
const docLines = new Set<string>();
for (const pattern of ['docs/**/*.md', 'assets/skills/**/*.md', 'assets/reference-configs/**/*.md', '*.md']) {
  for (const file of new Glob(pattern).scanSync(checkout)) {
    let inBlock = false;
    for (const line of readFileSync(join(checkout, file), 'utf8').split('\n')) {
      const fence = /^\s*```(\w*)/.exec(line);
      if (fence) { inBlock = !inBlock && ['bash', 'sh', 'shell', 'zsh', 'console'].includes(fence[1]!); continue; }
      if (inBlock && line.trim() && !line.trim().startsWith('#')) docLines.add(line.trim().replace(/^\$ /, ''));
    }
  }
}
const ordinary = new Set([...corpus.ordinary.map(fill), ...docLines]);
const catchRows = new Set(corpus.catch);
const accepted = new Map(Object.entries(corpus.accepted).flatMap(([cls, list]) => list.map(row => [row, cls] as const)));
for (const row of [...ordinary, ...catchRows, ...accepted.keys()]) rows.add(row);

// A4: a head-only denial must come from a protected name (text, glob or directory) or from rule 8. This predicate reads the row text
// only, independently of the gate code.
const A4 = (row: string, cwd: string) => /(^|[^\w.-])_(ops|ref)(?![\w.-])/i.test(row.replace(/['"\\]/g, '')) || /[*?[{]/.test(row)
  || cwd.split('/').some(part => /^_(ops|ref)$/i.test(part))
  || /\bgit\b[^;&|\n]*\bclean\b[^;&|\n]*-\w*[xX]/.test(row) || /\bfind\b/.test(row) || /\brm\b[^;&|\n]*(-\w*[rR]|--recursive)/.test(row);

// Optional 4th argument: a JSON array of commands; each one prints its base and head decision instead of the corpus.
if (probe) { rows.clear(); for (const row of JSON.parse(await Bun.file(probe).text()) as string[]) rows.add(row); }
const base = extract(baseRef, 'base');
const head = extract(headRef, 'head');
const load = async (dir: string) => (await import(join(dir, 'src/cli/hook/mutation-bash.ts'))).runBashMutationGuard as
  (opts: unknown) => { exitCode: number; stderr: string };
const decide = { base: await load(base.dir), head: await load(head.dir) };
const identity = { host: 'claude', sessionId: null, runId: null, turnId: null };
const loosened: string[] = [], unexplained: string[] = [], caught: string[] = [], newOrdinary: string[] = [];
const guards = new Map<string, number>();
const acceptedAllowed = new Map<string, number>();
let total = 0, baseDeny = 0, headDeny = 0, stricter = 0;
const started = performance.now();
let index = -1;
for (const command of rows) for (const cwd of [repo, join(repo, 'src')]) {
  if (++index % shards !== shard) continue;
  const run = (fn: typeof decide.base) => fn({ repoRoot: repo, payload: { tool_input: { command }, cwd }, identity });
  const b = run(decide.base).exitCode !== 0, result = run(decide.head), h = result.exitCode !== 0;
  const where = `${JSON.stringify(command)} cwd=${cwd === repo ? 'repo' : 'repo/src'}`;
  total++; if (b) baseDeny++; if (h) headDeny++;
  if (b && !h) loosened.push(where);
  if (!b && h) {
    stricter++;
    const guard = /^\[(\w+)\]/.exec(result.stderr)?.[1] ?? '?';
    guards.set(guard, (guards.get(guard) ?? 0) + 1);
    if (!A4(command, cwd)) unexplained.push(`${where} ${guard}`);
    if (ordinary.has(command)) newOrdinary.push(where);
  }
  if (cwd === repo && catchRows.has(command) && !h) caught.push(where);
  if (cwd === repo && accepted.has(command) && !h) acceptedAllowed.set(accepted.get(command)!, (acceptedAllowed.get(accepted.get(command)!) ?? 0) + 1);
  if (probe) console.log(`${b ? 'deny ' : 'allow'} -> ${h ? 'deny ' : 'allow'} cwd=${cwd === repo ? 'repo' : 'src'} ${JSON.stringify(command)}`);
}
const summary: Summary = {
  total, baseDeny, headDeny, stricter, seconds: (performance.now() - started) / 1000, base: base.sha, head: head.sha,
  loosened, unexplained, caught, newOrdinary, guards: Object.fromEntries(guards), acceptedAllowed: Object.fromEntries(acceptedAllowed),
  sizes: {
    catch: catchRows.size, ordinary: ordinary.size, docs: docLines.size, hand: corpus.ordinary.length,
    accepted: Object.fromEntries(Object.entries(corpus.accepted).map(([c, l]) => [c, l.length])),
  },
};
rmSync(scratch, { recursive: true, force: true });
if (process.env.REPLAY_SHARD) { console.log(`SUMMARY ${JSON.stringify(summary)}`); process.exit(0); }
report(summary);
