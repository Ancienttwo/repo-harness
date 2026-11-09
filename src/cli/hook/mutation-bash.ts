/** A literal tripwire, not a shell interpreter. No state or process reads; `git worktree add` also reads the managed root. */
import { lstatSync, readlinkSync, realpathSync } from 'fs';
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'path';
import { isManagedWorktreePath, managedWorktreeRoot } from '../../effects/git/managed-worktree';
import { payloadString } from './hook-input';
import { runMutationDenial, runMutationPathGuard, type Denial, type MutationGuardInput, type MutationGuardResult } from './mutation-guard';
import { PROTECTED_REPO_DIRS } from './mutation-protected-dirs';

/** `pattern` is `value` with each quoted or escaped glob, brace or tilde character escaped by a backslash. */
interface Word { value: string; pattern: string; literal: boolean; operator?: true }

/** A glob, brace or tilde form is expanded or bounded later; a parameter or command substitution is not. */
const pathOperand = (word: Word) => word.literal || !/[$`]/.test(word.value);
const escapePattern = (text: string) => text.replace(/[\\*?[\]{},~]/g, '\\$&');
const unescapePattern = (pattern: string) => pattern.replace(/\\(.)/gs, '$1');

/** Quotes are removed only to locate literal operands. Expansions stay unresolved. */
function words(line: string): Word[] | null {
  const result: Word[] = [];
  let value = '', pattern = '', literal = true, plain = true, active = false, quote = '';
  const flush = () => {
    if (active) result.push({ value, pattern, literal });
    value = ''; pattern = ''; literal = true; plain = true; active = false;
  };
  const quoted = (ch: string) => { value += ch; pattern += escapePattern(ch); };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (!quote && ch === '#' && !active) break;
    if (ch === '\\' && quote !== "'") {
      if (i + 1 === line.length) return null;
      // A backslash-newline joins the two lines.
      if (line[i + 1] === '\n') { i++; continue; }
      quoted(line[++i]!); active = true; plain = false; continue;
    }
    if (quote) {
      if (ch === quote) quote = '';
      else { quoted(ch); if (quote === '"' && /[$`]/.test(ch)) literal = false; }
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; active = true; plain = false; continue; }
    if (/\s/.test(ch)) { flush(); continue; }
    if (';|&<>'.includes(ch)) {
      // In 2>file, 2 is a descriptor. In "2">file it remains an argument.
      if ((ch === '<' || ch === '>') && active && plain && /^\d+$/.test(value)) {
        value = ''; active = false;
      }
      flush();
      let op = ch;
      if (line[i + 1] === ch && ch !== ';') op += line[++i];
      if (op === '<<' && line[i + 1] === '-') op += line[++i];
      result.push({ value: op, pattern: op, literal: true, operator: true });
      continue;
    }
    if (ch === '(' || ch === ')') {
      // `$(`, `=(` and `<(` open a subshell; `(` glued to another word (a function, extglob or zsh qualifier) is outside this grammar.
      if (ch === '(' && active && !/[$=]$/.test(value)) return null;
      flush();
      result.push({ value: ch, pattern: ch, literal: true, operator: true });
      continue;
    }
    if (/[$`*?{}~]/.test(ch)) literal = false;
    value += ch; pattern += ch; active = true;
  }
  if (quote) return null;
  flush();
  return result;
}

function scriptTargets(program: string, source: string): string[] {
  const targets: string[] = [];
  const patterns = /^python(?:3(?:\.\d+)?)?$/.test(program) ? [
    /\bopen\(\s*(['"])([^'"\n]+)\1\s*,\s*(?:mode\s*=\s*)?(['"])([^'"\n]*[wax+][^'"\n]*)\3/g,
    /\bPath\(\s*(['"])([^'"\n]+)\1\s*\)\.(?:write_text|write_bytes|unlink|rmdir)\s*\(/g,
  ] : program === 'node' ? [
    /\b(?:writeFile(?:Sync)?|appendFile(?:Sync)?|unlink(?:Sync)?|rm(?:Sync)?)\(\s*(['"])([^'"\n]+)\1/g,
  ] : [];
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) targets.push(match[2]!);
  return targets;
}

/** Patterns of the write targets of one command. */
function commandTargets(tokens: readonly Word[], heredoc: string): string[] {
  const args = tokens.filter(token => !token.operator);
  const program = args[0]?.literal ? args[0].value : '';
  const operands = args.slice(1);
  if (/^python(?:3(?:\.\d+)?)?$/.test(program) || program === 'node') {
    const flag = operands.findIndex(word => word.value === '-c' || word.value === '-e' || word.value === '--eval');
    return scriptTargets(program, flag >= 0 ? operands[flag + 1]?.value ?? '' : heredoc).map(escapePattern);
  }
  if (!['rm', 'mv', 'cp', 'tee', 'sed'].includes(program)) return [];
  // Options with operands are outside the narrow grammar, except sed's -e/-f.
  const supported = program === 'sed' ? /^-(?:i.*|[nEr]+|e|f)$/ : /^-(?:[rfivnpRa]+|-)$/;
  if (operands.some(word => word.value.startsWith('-') && !supported.test(word.value))) return [];
  const paths = operands.filter(word => !word.value.startsWith('-'));
  if (program === 'cp') return paths.length >= 2 && pathOperand(paths.at(-1)!) ? [paths.at(-1)!.pattern] : [];
  if (program === 'sed') {
    if (!operands.some(word => /^-i/.test(word.value))) return [];
    // The last operand is the file in the supported single-file sed form.
    return paths.length >= 2 && pathOperand(paths.at(-1)!) ? [paths.at(-1)!.pattern] : [];
  }
  return paths.filter(word => pathOperand(word) && word.value).map(word => word.pattern);
}

interface CommandVisitor {
  /** `cwd` is null once a command could have moved the shell to an unknown directory. */
  command?(segment: readonly Word[], body: string, cwd: string | null): void;
  redirect?(target: Word, cwd: string | null): void;
  /** The command is outside the parsed grammar; nothing of it was visited. */
  unparsed?(): void;
}

/** The directory operand of `cd`; `plain` is false when an option comes before it. Null for any other form. */
function cdOperand(segment: readonly Word[]): { target: Word; plain: boolean } | null {
  if (segment[0]?.value !== 'cd') return null;
  let i = 1;
  while (/^-[LPe@]+$/.test(segment[i]?.value ?? '')) i++;
  const plain = i === 1;
  if (segment[i]?.value === '--') i++;
  return i === segment.length - 1 ? { target: segment[i]!, plain } : null;
}

/** Visits each literal command segment and output redirect, tracking the working directory the same way for every caller. */
function walkCommands(command: string, cwd: string, visit: CommandVisitor): void {
  if (command.length > 65_536) return;
  const parsed: { tokens: Word[]; body: string }[] = [];
  let depth = 0;
  const lines = command.split('\n');
  for (let line = 0; line < lines.length; line++) {
    let text = lines[line]!;
    let tokens = words(text);
    // A quoted argument or a backslash-newline continues on the next physical line.
    while (!tokens && line + 1 < lines.length) tokens = words(text += `\n${lines[++line]}`);
    if (!tokens) return visit.unparsed?.();
    for (const token of tokens) if (token.operator && (token.value === '(' ? ++depth : token.value === ')' ? --depth : 0) < 0) return visit.unparsed?.();
    let body = '';
    const here = tokens.findIndex(token => token.operator && token.value.startsWith('<<'));
    if (here >= 0) {
      const delimiter = tokens[here + 1];
      if (!delimiter?.literal || delimiter.operator
        || tokens.filter(token => token.operator && token.value.startsWith('<<')).length !== 1) break;
      const content: string[] = [];
      while (++line < lines.length) {
        const current = tokens[here]!.value === '<<-' ? lines[line]!.replace(/^\t+/, '') : lines[line]!;
        if (current === delimiter.value) break;
        content.push(lines[line]!);
      }
      body = content.join('\n');
    }
    parsed.push({ tokens, body });
  }
  if (depth) return visit.unparsed?.();
  let commandCwd: string | null = cwd;
  // A subshell does not move the shell that started it.
  const outer: (string | null)[] = [];
  for (const { tokens, body } of parsed) {
    let segment: Word[] = [];
    const flush = (separator = '\n') => {
      visit.command?.(segment, body, commandCwd);
      if (segment[0]?.value === 'cd') {
        const cd = cdOperand(segment);
        commandCwd = separator === '&&' && commandCwd && cd?.plain && cd.target.literal && !cd.target.value.startsWith('-')
          ? resolve(commandCwd, cd.target.value) : null;
      } else if (['source', '.', 'eval', 'pushd', 'popd', 'command', 'builtin'].includes(segment[0]?.value ?? '')) {
        commandCwd = null;
      }
      segment = [];
    };
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      if (token.operator && [';', '|', '||', '&', '&&'].includes(token.value)) { flush(token.value); continue; }
      if (token.operator && token.value === '(') { flush('('); outer.push(commandCwd); continue; }
      if (token.operator && token.value === ')') { flush(')'); commandCwd = outer.pop()!; continue; }
      if (token.operator && ['>', '>>', '<', '<<', '<<-'].includes(token.value)) {
        const target = tokens[++i];
        if (target?.operator && target.value === '&' && (token.value === '>' || token.value === '<')) {
          i++; // Descriptor duplication/closure, such as 2>&1, has no file operand.
          continue;
        }
        if ((token.value === '>' || token.value === '>>') && target && !target.operator && pathOperand(target)) visit.redirect?.(target, commandCwd);
        continue;
      }
      segment.push(token);
    }
    flush();
  }
}

/** Shell pattern match of one path segment; a pattern that does not compile matches, so the guard fails closed. */
function segmentMatches(pattern: string, name: string): boolean {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    const negated = ch === '[' && (pattern[i + 1] === '!' || pattern[i + 1] === '^');
    // A `]` right after `[` or `[!` is a member of the bracket expression, not its end.
    const close = ch === '[' ? pattern.indexOf(']', i + (negated ? 3 : 2)) : -1;
    if (ch === '\\') source += (pattern[++i] ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (ch === '*') source += '.*';
    else if (ch === '?') source += '.';
    // A nested `[` (a POSIX class such as [[:lower:]]) is outside this grammar, so the pattern matches.
    else if (close > 0 && pattern.slice(i + 1, close).includes('[')) return true;
    else if (close > 0) {
      source += `[${negated ? '^' : ''}${unescapePattern(pattern.slice(i + (negated ? 2 : 1), close)).replace(/[\\\]]/g, '\\$&')}]`;
      i = close;
    } else source += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  // Case-insensitive, so `_OP*` and a `nocaseglob` shell also count; `u` folds `ſ` to `s` as APFS does.
  try { return new RegExp(`^${source}$`, 'iu').test(name); } catch { return true; }
}

/** Index of the first unescaped glob character of a pattern, or -1. */
function globIndex(pattern: string): number {
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '\\') i++;
    else if ('*?['.includes(pattern[i]!)) return i;
  }
  return -1;
}

/** macOS and Windows filesystems ignore case by default, so `_OPS/x` writes into `_ops`. The result uses the protected spelling. */
function protectedPath(rel: string): string | null {
  const dir = PROTECTED_REPO_DIRS.find(name => rel.slice(0, name.length).toUpperCase() === name.toUpperCase()
    && (rel.length === name.length || rel[name.length] === '/'));
  return dir ? dir + rel.slice(dir.length) : null;
}

const BRACE_LIMIT = 1024;
class BraceLimit extends Error {}

/** The words of a `{a..b[..step]}` sequence, or null when the text is not one. */
function braceSequence(inner: string): string[] | null {
  const match = /^(?:(-?\d+)\.\.(-?\d+)|([A-Za-z])\.\.([A-Za-z]))(?:\.\.(-?\d+))?$/.exec(inner);
  if (!match) return null;
  const [, a, b, c, d, increment] = match;
  const start = a !== undefined ? Number(a) : c!.charCodeAt(0);
  const end = a !== undefined ? Number(b) : d!.charCodeAt(0);
  const step = (Math.abs(Number(increment ?? 1)) || 1) * (start <= end ? 1 : -1);
  if (![start, end, step].every(Number.isSafeInteger) || Math.abs(end - start) / Math.abs(step) >= BRACE_LIMIT) throw new BraceLimit();
  // A leading zero pads every number to the wider bound, sign included.
  const width = a !== undefined && (/^-?0\d/.test(a) || /^-?0\d/.test(b!)) ? Math.max(a.length, b!.length) : 0;
  const format = (n: number) => a === undefined ? String.fromCharCode(n)
    : n < 0 ? `-${String(-n).padStart(width - 1, '0')}` : String(n).padStart(width, '0');
  const items: string[] = [];
  for (let n = start; step > 0 ? n <= end : n >= end; n += step) items.push(format(n));
  return items;
}

/** The patterns from the first expandable unescaped brace pair, or null when the pattern has none. */
function braceAlternatives(word: string): string[] | null {
  for (let open = 0; open < word.length; open++) {
    if (word[open] === '\\') { open++; continue; }
    if (word[open] !== '{') continue;
    const commas: number[] = [];
    let depth = 0, close = -1;
    for (let i = open; i < word.length && close < 0; i++) {
      if (word[i] === '\\') i++;
      else if (word[i] === '{') depth++;
      else if (word[i] === '}' && --depth === 0) close = i;
      else if (word[i] === ',' && depth === 1) commas.push(i);
    }
    if (close < 0) continue;
    const items = commas.length
      ? [open, ...commas].map((at, n) => word.slice(at + 1, [...commas, close][n]))
      : braceSequence(word.slice(open + 1, close));
    if (items) return items.map(item => word.slice(0, open) + item + word.slice(close + 1));
  }
  return null;
}

/** Brace expansion of one pattern, which the shell runs before tilde and glob expansion; null above the word limit. */
function expandBraces(word: string): string[] | null {
  const done: string[] = [];
  const pending = [word];
  try {
    while (pending.length) {
      const current = pending.pop()!;
      const items = braceAlternatives(current);
      if (items) pending.push(...items); else done.push(current);
      if (done.length + pending.length > BRACE_LIMIT) return null;
    }
  } catch (error) {
    if (error instanceof BraceLimit) return null;
    throw error;
  }
  return done;
}

/** The path the kernel writes through: every symlink is followed, a dangling one too, before the next `..`. Throws when it cannot resolve. */
function writeThroughPath(path: string): string {
  const split = (value: string) => value.slice(parse(value).root.length).split(sep === '/' ? '/' : /[\\/]/);
  const pending = split(path);
  let current = parse(path).root;
  for (let links = 0; pending.length;) {
    const part = pending.shift()!;
    if (!part || part === '.') continue;
    if (part === '..') { current = dirname(current); continue; }
    const next = join(current, part);
    if (!lstatSync(next, { throwIfNoEntry: false })?.isSymbolicLink()) { current = next; continue; }
    if (++links > 40) throw Object.assign(new Error(`too many symbolic links: ${path}`), { code: 'ELOOP' });
    // The raw link target is walked part by part, so a link inside it is followed before its `..`.
    const link = readlinkSync(next);
    pending.unshift(...split(link));
    if (isAbsolute(link)) current = parse(link).root;
  }
  return current;
}

interface BashWriteTargets {
  readonly paths: readonly string[];
  /** Targets whose write-through path could not be resolved, with the error code. */
  readonly unresolved: readonly string[];
}

/** Only destinations in the supported literal forms reach filesystem validation. */
export function bashWriteTargets(command: string, repoRoot: string, cwd: string): BashWriteTargets {
  if (!/(?:>|\b(?:rm|mv|cp|tee|sed|python\d*|node)\b)/.test(command)) return { paths: [], unresolved: [] };
  const candidates: string[] = [];
  const unresolved: string[] = [];
  let realRoot: string | undefined;
  /** The repository-relative write-through path; null only for a path verified outside the repository. */
  const realRel = (spelled: string): string | null => {
    try {
      const real = writeThroughPath(spelled);
      realRoot ??= realpathSync(repoRoot);
      const rel = relative(realRoot, real);
      return isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`) ? null : rel.split(sep).join('/');
    } catch (error) {
      unresolved.push(`${spelled} (${(error as NodeJS.ErrnoException).code ?? String(error)})`);
      return null;
    }
  };
  /** Set once a `cd` could have moved the shell into a protected directory. */
  let cwdMayBeProtected = false;
  const addPath = (pattern: string, commandCwd: string | null) => {
    let candidate = unescapePattern(pattern);
    if (!candidate || /[$`\n\r]/.test(candidate) || ['/dev/null', '/dev/stdout', '/dev/stderr', '/dev/tty'].includes(candidate)
      || /^\/dev\/fd\/\d+$/.test(candidate)) return;
    if (!isAbsolute(candidate) && !commandCwd) {
      // From an unknown directory, a relative target is safe only when it neither climbs out nor starts in a protected directory.
      if (cwdMayBeProtected || candidate.split('/').includes('..')) unresolved.push(`${candidate} (working directory not known)`);
      return;
    }
    const base = commandCwd ?? cwd;
    // A glob can mutate only below its literal directory, and at the repository root it can name a protected directory.
    const glob = globIndex(pattern);
    if (glob >= 0) {
      const cut = pattern.lastIndexOf('/', glob) + 1;
      // bash 3.2 lets a pattern that starts with `.` match `..`, and a later `..` leaves the matched directory again.
      if (pattern.slice(cut).split('/').some(part => part === '..' || (part.startsWith('.') && globIndex(part) >= 0 && segmentMatches(part, '..')))) {
        unresolved.push(`${candidate} (a glob can reach ..)`);
        return;
      }
      const dir = unescapePattern(pattern.slice(0, cut)) || '.';
      const atRoot = resolve(base, dir) === resolve(repoRoot) || realRel(isAbsolute(dir) ? dir : `${base}/${dir}`) === '';
      const segment = pattern.slice(cut).split('/', 1)[0]!;
      if (atRoot) candidates.push(...PROTECTED_REPO_DIRS.filter(name => segmentMatches(segment, name)));
      candidate = dir;
    }
    const target = resolve(base, candidate);
    const rel = relative(repoRoot, target);
    const leaves = isAbsolute(rel) || rel === '..' || rel.startsWith('../');
    // resolve() drops `..` before any symlink is followed, but the kernel follows the link first.
    // Keep `..` in a target that leaves the repository, so the canonical check refuses it.
    if (leaves && candidate.replaceAll('\\', '/').split('/').includes('..')) {
      candidates.push(isAbsolute(candidate) ? candidate : `${commandCwd}/${candidate}`);
    } else if (leaves) candidates.push(target);
    // Relative, so a symlink below a protected directory that leaves the repository is not read as an external target.
    else {
      const real = protectedPath(rel) ? rel : realRel(isAbsolute(candidate) ? candidate : `${base}/${candidate}`);
      const hit = real === null ? null : protectedPath(real);
      if (hit) candidates.push(hit);
    }
  };
  const add = (pattern: string, commandCwd: string | null) => {
    const expanded = expandBraces(pattern);
    if (!expanded) {
      unresolved.push(`${unescapePattern(pattern)} (brace expansion above ${BRACE_LIMIT} words or outside safe integers)`);
      return;
    }
    for (const word of expanded) {
      // Tilde expansion follows brace expansion. `~+` is the working directory; OLDPWD (`~-`) is not known here.
      if (/^~-(?:\/|$)/.test(word)) unresolved.push(`${unescapePattern(word)} (OLDPWD)`);
      else if (/^~\+(?:\/|$)/.test(word)) addPath(`.${word.slice(2)}`, commandCwd);
      else if (!word.startsWith('~')) addPath(word, commandCwd);
    }
  };
  walkCommands(command, cwd, {
    command: (segment, body, commandCwd) => {
      // After a `cd` with an option or an expanded operand the directory is not tracked. Its reachable targets
      // decide whether a later relative write can land in a protected directory; the cd itself writes nothing.
      const cd = cdOperand(segment);
      if (cd && (!cd.plain || !cd.target.literal)) {
        const found = candidates.length, failed = unresolved.length;
        add(cd.target.pattern, commandCwd);
        if (candidates.length > found || unresolved.length > failed) cwdMayBeProtected = true;
        candidates.length = found; unresolved.length = failed;
      }
      for (const target of commandTargets(segment, body)) add(target, commandCwd);
    },
    redirect: (target, commandCwd) => add(target.pattern, commandCwd),
    unparsed: () => { unresolved.push('the command (unbalanced parentheses, an unclosed quote or a `(` glued to a word)'); },
  });
  return { paths: [...new Set(candidates)], unresolved };
}

// Options of `git worktree add` that take no operand, and those that take one.
const WORKTREE_ADD_FLAGS = new Set(['-f', '--force', '-q', '--quiet', '-d', '--detach', '--lock', '--checkout', '--no-checkout',
  '--guess-remote', '--no-guess-remote', '--track', '--no-track']);
const WORKTREE_ADD_VALUE_OPTIONS = new Set(['-b', '-B', '--reason']);

/** The literal target of `git [-C <dir>] worktree add ...`, or null when any part is not certain. */
function worktreeAddTarget(segment: readonly Word[], cwd: string | null): string | null {
  const args = segment.filter(word => !word.operator);
  if (args[0]?.value !== 'git' || !args[0].literal) return null;
  let dir = cwd;
  let i = 1;
  for (; args[i]?.value === '-C'; i += 2) {
    const next = args[i + 1];
    if (!next?.literal || !next.value) return null;
    dir = isAbsolute(next.value) ? next.value : dir && resolve(dir, next.value);
  }
  if (args[i]?.value !== 'worktree' || args[i + 1]?.value !== 'add') return null;
  const operands: Word[] = [];
  for (i += 2; i < args.length; i++) {
    const value = args[i]!.value;
    if (WORKTREE_ADD_FLAGS.has(value)) continue;
    if (WORKTREE_ADD_VALUE_OPTIONS.has(value)) {
      if (++i >= args.length) return null;
      continue;
    }
    if (value.startsWith('-')) return null;
    operands.push(args[i]!);
  }
  // Operands are `<path> [<commit-ish>]`.
  const path = operands[0];
  if (operands.length > 2 || !path?.literal || !path.value) return null;
  if (isAbsolute(path.value)) return resolve(path.value);
  return dir ? resolve(dir, path.value) : null;
}

const WORKTREE_ADD_DENIAL = (target: string, root: string): Denial => ({
  guard: 'WorktreeCreateGuard',
  reason: `git worktree add target ${target} is outside the managed worktree root ${root}.`,
  fix: `Create the worktree under ${root} as <repo>-wt-<slug>, or run \`repo-harness run contract-worktree start --issue <number>\`.`,
});

/** Only a literal `git worktree add` target that resolves outside the managed root is denied. */
function worktreeAddDenial(command: string, cwd: string): Denial | null {
  if (!/\bworktree\b/.test(command)) return null;
  let denial: Denial | null = null;
  walkCommands(command, cwd, {
    command: (segment, _body, commandCwd) => {
      const target = denial ? null : worktreeAddTarget(segment, commandCwd);
      if (!target) return;
      let root: string;
      // The leaf does not exist yet. Its parent resolves symlinks such as macOS /tmp.
      let parent = dirname(target);
      try { root = managedWorktreeRoot(); } catch { return; }
      try { parent = realpathSync(parent); } catch { /* A missing parent cannot be the managed root. */ }
      if (!isManagedWorktreePath(join(parent, basename(target)), root)) denial = WORKTREE_ADD_DENIAL(target, root);
    },
  });
  return denial;
}

export function runBashMutationGuard(opts: MutationGuardInput): MutationGuardResult {
  const command = payloadString(opts.payload, 'tool_input.command');
  const cwd = payloadString(opts.payload, 'cwd');
  // A missing or non-absolute host cwd gives no reliable destination authority.
  if (!isAbsolute(cwd)) return { exitCode: 0, stdout: '', stderr: '' };
  const { paths, unresolved } = bashWriteTargets(command, opts.repoRoot, cwd);
  if (unresolved.length) {
    return runMutationDenial(opts, {
      guard: 'RepoScopeGuard',
      reason: `The destination of the Bash write target ${unresolved[0]} is not known.`,
      fix: 'Write to a path whose directories exist and can be read, from a known working directory, without a symlink loop, `~-`, a glob that can reach `..`, a large brace expansion or shell syntax outside the parsed grammar.',
    });
  }
  if (paths.length) {
    const result = runMutationPathGuard(opts, paths);
    if (result.exitCode !== 0) return result;
  }
  const denial = worktreeAddDenial(command, cwd);
  return denial ? runMutationDenial(opts, denial) : { exitCode: 0, stdout: '', stderr: '' };
}
