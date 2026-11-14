/**
 * The protected-name gate (#2369): the authority for Bash writes into `_ops` and `_ref`.
 *
 * It stops a careless command, not a command that hides its target. A command that names a protected directory
 * (or has a glob that can match one, or runs inside one) must keep the strict form: simple commands joined by
 * `;`, `&&`, `||`, `|`, `&` or a newline. In that form only read-only programs and `cp` run, and no write target
 * can land in a protected directory. Whole-repository recursion is denied with or without the name.
 * Accepted residual classes: a name built at run time or carried by a variable, a script or binary that writes,
 * a symlink reached without the name, and repository recursion outside rule 8.
 */
import { lstatSync, readlinkSync, realpathSync } from 'fs';
import { homedir } from 'os';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'path';
import { agentWritablePrivateDirs, readWorkflowPolicy } from '../../effects/state/resolve-effective-state';
import type { Denial } from './mutation-guard';
import { PROTECTED_REPO_DIRS } from './mutation-protected-dirs';

// ---------------------------------------------------------------------------
// Path patterns and the write-through resolver
// ---------------------------------------------------------------------------

export const escapePattern = (text: string) => text.replace(/[\\*?[\]{},~]/g, '\\$&');
export const unescapePattern = (pattern: string) => pattern.replace(/\\(.)/gs, '$1');

/** Shell pattern match of one path segment; a pattern that does not compile matches, so the guard fails closed. */
export function segmentMatches(pattern: string, name: string): boolean {
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
  // A match with or without case counts: the shell glob is case-sensitive, but `nocaseglob` and the filesystem are not.
  // `u` folds `ſ` to `s` as APFS does.
  try { return new RegExp(`^${source}$`, 'u').test(name) || new RegExp(`^${source}$`, 'iu').test(name); } catch { return true; }
}

/** Index of the first unescaped glob character of a pattern, or -1. */
export function globIndex(pattern: string): number {
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '\\') i++;
    else if ('*?['.includes(pattern[i]!)) return i;
  }
  return -1;
}

/** macOS and Windows filesystems ignore case by default, so `_OPS/x` writes into `_ops`. The result uses the protected spelling. */
export function protectedPath(rel: string): string | null {
  const dir = PROTECTED_REPO_DIRS.find(name => rel.slice(0, name.length).toUpperCase() === name.toUpperCase()
    && (rel.length === name.length || rel[name.length] === '/'));
  return dir ? dir + rel.slice(dir.length) : null;
}

export const BRACE_LIMIT = 1024;
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
export function expandBraces(word: string): string[] | null {
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
export function writeThroughPath(path: string): string {
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

const inside = (rel: string) => !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
const posixRel = (rel: string) => rel.split(sep).join('/');

/** The shell's directory set: absolute directories, or null when a command moved the shell somewhere not known. */
type Dirs = readonly string[] | null;

class Resolver {
  private realRootValue: string | undefined;
  private writableValue: readonly string[] | undefined;
  constructor(readonly repoRoot: string) {}

  private get realRoot(): string { return this.realRootValue ??= realpathSync(this.repoRoot); }

  /** True when the path, read lexically or through its symlinks, is in a protected directory; an unresolvable path counts. */
  inProtected(path: string): boolean {
    const rel = relative(this.repoRoot, path);
    if (inside(rel) && protectedPath(posixRel(rel))) return true;
    try {
      const real = relative(this.realRoot, writeThroughPath(path));
      return inside(real) && protectedPath(posixRel(real)) !== null;
    } catch { return true; }
  }

  private isRoot(path: string): boolean {
    if (resolve(path) === resolve(this.repoRoot)) return true;
    try { return relative(this.realRoot, writeThroughPath(path)) === ''; } catch { return false; }
  }

  /** Rule 7: a write target that can land in a protected directory from a member of the directory set. */
  mayReachProtected(pattern: string, dirs: Dirs): boolean {
    const expanded = expandBraces(pattern);
    if (!expanded) return true;
    for (let word of expanded) {
      if (/^~\+(?:\/|$)/.test(word)) word = `.${word.slice(2)}`;
      else if (/^~(?:\/|$)/.test(word)) word = escapePattern(homedir()) + word.slice(1);
      // `~-` (OLDPWD) and `~user` are not known here.
      else if (word.startsWith('~')) return true;
      const absolute = word.startsWith('/');
      if (!absolute && dirs === null) return true;
      for (const base of absolute ? ['/'] : dirs!) if (this.patternInProtected(word, base)) return true;
    }
    return false;
  }

  private patternInProtected(pattern: string, base: string): boolean {
    const glob = globIndex(pattern);
    if (glob < 0) return this.inProtected(resolve(base, unescapePattern(pattern)));
    // A glob can write only below its literal directory, and at the repository root it can name a protected directory.
    const cut = pattern.lastIndexOf('/', glob) + 1;
    const rest = pattern.slice(cut).split('/');
    // bash 3.2 lets a pattern that starts with `.` match `..`, and a later `..` leaves the matched directory again.
    if (rest.some(part => part === '..' || (part.startsWith('.') && globIndex(part) >= 0 && segmentMatches(part, '..')))) return true;
    const dir = resolve(base, unescapePattern(pattern.slice(0, cut)) || '.');
    return this.inProtected(dir) || (this.isRoot(dir) && PROTECTED_REPO_DIRS.some(name => segmentMatches(rest[0]!, name)));
  }

  /** Rule 8: whether a start path is the repository root or an ancestor of it. */
  startClass(pattern: string, dirs: Dirs): 'root' | 'other' | 'unknown' {
    const expanded = expandBraces(pattern);
    if (!expanded) return 'unknown';
    let unknown = false;
    for (let word of expanded) {
      if (/^~\+(?:\/|$)/.test(word)) word = `.${word.slice(2)}`;
      else if (/^~(?:\/|$)/.test(word)) word = escapePattern(homedir()) + word.slice(1);
      else if (word.startsWith('~')) { unknown = true; continue; }
      const absolute = word.startsWith('/');
      if (globIndex(word) >= 0 || (!absolute && dirs === null)) { unknown = true; continue; }
      for (const base of absolute ? ['/'] : dirs!) {
        const path = resolve(base, unescapePattern(word));
        if (inside(relative(path, this.repoRoot))) return 'root';
        try {
          if (inside(relative(writeThroughPath(path), this.realRoot))) return 'root';
        } catch { unknown = true; }
      }
    }
    return unknown ? 'unknown' : 'other';
  }

  /** The owner allows a Bash write to a literal target inside `operations.agent_writable_private_dirs`. */
  writableLiteral(value: string, dirs: Dirs): boolean {
    if (dirs === null || value.split('/').some(part => part === '..' || part === '.')) return false;
    try { this.writableValue ??= agentWritablePrivateDirs(readWorkflowPolicy(this.repoRoot)); } catch { this.writableValue = []; }
    const writable = this.writableValue;
    return writable.length > 0 && dirs.every(base => {
      const path = resolve(base, value);
      const rel = posixRel(relative(this.repoRoot, path));
      try {
        // Only the canonical spelling with no symlink on the way names the file that the allowlist names.
        if (posixRel(relative(this.realRoot, writeThroughPath(path))) !== rel) return false;
      } catch { return false; }
      return writable.some(dir => rel.startsWith(`${dir}/`));
    });
  }
}

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

/** `pattern` is `value` with each quoted or escaped glob, brace or tilde character escaped by a backslash. */
interface Word {
  readonly kind: 'word';
  value: string;
  pattern: string;
  /** A parameter, command or arithmetic substitution, or an ANSI-C string, can change the word at run time. */
  expand: boolean;
  /** An unquoted glob or brace character. */
  glob: boolean;
  /** A quote or a backslash appears in the word. */
  quoted: boolean;
  /** An unquoted `NAME=` or `NAME+=` prefix. */
  assign: boolean;
}

interface Op {
  readonly kind: 'op';
  readonly value: string;
  /** The body of a `<<` or `<<-` heredoc. */
  body?: string;
}

type Token = Word | Op;

interface Lexed {
  /** The top-level token stream first; then the body of each substitution, outermost last. */
  readonly streams: Token[][];
  /** Each strict-form violation found while reading (rule 4). */
  readonly violations: string[];
}

const DATA_HEAD = /"\$\(cat <<\s?'([A-Za-z_][A-Za-z0-9_]*)'\n/y;
const REDIRECT = /^(\d*)(>>|>\||>&|>|<>|<&|<<<|<<-|<<|<|&>>|&>)$/;

/** Rule 3: the end of a `"$(cat <<'D' ... D\n)"` data span at `at`, or -1. The body has no `$`, backtick, `\`, `"` or delimiter line. */
function dataSpanEnd(text: string, at: number): number {
  DATA_HEAD.lastIndex = at;
  const head = DATA_HEAD.exec(text);
  if (!head) return -1;
  const close = `\n${head[1]}\n)"`;
  const start = DATA_HEAD.lastIndex;
  const end = text.indexOf(close, start - 1);
  if (end < 0) return -1;
  const body = text.slice(start, end);
  if (/[$`\\"]/.test(body) || body.split('\n').includes(head[1]!)) return -1;
  return end + close.length;
}

interface Frame { tokens: Token[]; closer: ')' | '`' | null; depth: number; quote: boolean }

function lex(text: string): Lexed {
  const streams: Token[][] = [[]];
  const violations: string[] = [];
  const frames: Frame[] = [{ tokens: streams[0]!, closer: null, depth: 0, quote: false }];
  let word: Word | null = null;
  // The outer word of each open substitution; it continues after the substitution closes.
  const outerWords: (Word | null)[] = [];
  const frame = () => frames.at(-1)!;
  const current = (): Word => word ??= { kind: 'word', value: '', pattern: '', expand: false, glob: false, quoted: false, assign: false };
  const literal = (ch: string) => { const w = current(); w.value += ch; w.pattern += escapePattern(ch); w.quoted = true; };
  const flush = () => { if (word) frame().tokens.push(word); word = null; };
  const push = (closer: ')' | '`') => {
    current().expand = true;
    violations.push(closer === '`' ? 'a backtick substitution' : 'a substitution');
    outerWords.push(word);
    word = null;
    frames.push({ tokens: [], closer, depth: 0, quote: false });
  };
  const pop = () => {
    flush();
    const done = frames.pop()!;
    streams.push(done.tokens);
    word = outerWords.pop() ?? null;
  };
  const readHeredocs = (from: number): number => {
    const tokens = frame().tokens;
    let start = tokens.length;
    while (start > 0 && !(tokens[start - 1]!.kind === 'op' && (tokens[start - 1] as Op).value === '\n')) start--;
    const pending = tokens.slice(start).flatMap((token, n, line) => token.kind === 'op' && /<<-?$/.test(token.value) && token.body === undefined
      ? [{ op: token as Op, delimiter: line[n + 1] }] : []);
    if (pending.length > 1) violations.push('more than one heredoc on a line');
    let at = from;
    for (const { op, delimiter } of pending) {
      const end = delimiter?.kind === 'word' ? delimiter.value : null;
      const lines: string[] = [];
      while (at < text.length) {
        const next = text.indexOf('\n', at);
        const raw = text.slice(at, next < 0 ? text.length : next);
        at = next < 0 ? text.length : next + 1;
        if ((op.value.endsWith('-') ? raw.replace(/^\t+/, '') : raw) === end) break;
        lines.push(raw);
      }
      op.body = lines.join('\n');
      if (delimiter?.kind !== 'word' || delimiter.expand) violations.push('a heredoc delimiter that is not a literal word');
      else if (!delimiter.quoted && /\$\(|`/.test(op.body)) violations.push('a substitution in a heredoc body');
    }
    return at;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const f = frame();
    if (ch === '\\') {
      if (i + 1 === text.length) { violations.push('a trailing backslash'); break; }
      if (text[i + 1] === '\n') { i++; continue; }
      if (f.quote && !'$`"\\'.includes(text[i + 1]!)) { literal('\\'); continue; }
      literal(text[++i]!);
      continue;
    }
    if (f.quote) {
      if (ch === '"') { f.quote = false; continue; }
      if (ch === '`') { push('`'); continue; }
      if (ch === '$' && text[i + 1] === '(') { i++; push(')'); continue; }
      if (ch === '$') current().expand = true;
      literal(ch);
      continue;
    }
    if (f.closer === '`' && ch === '`') { pop(); continue; }
    if (f.closer === ')' && ch === ')' && f.depth === 0) { pop(); continue; }
    if (ch === '"') {
      const end = dataSpanEnd(text, i);
      if (end > 0) { literal('DATA'); i = end - 1; continue; }
      current().quoted = true;
      f.quote = true;
      continue;
    }
    if (ch === "'") {
      const end = text.indexOf("'", i + 1);
      if (end < 0) { violations.push('an unclosed quote'); literal(text.slice(i + 1)); break; }
      current().quoted = true;
      for (const c of text.slice(i + 1, end)) literal(c);
      i = end;
      continue;
    }
    if (ch === '`') { push('`'); continue; }
    if (ch === '$' && text[i + 1] === '(') { i++; push(')'); continue; }
    if (ch === '$' && text[i + 1] === '{') {
      let depth = 0, end = i + 1;
      for (; end < text.length; end++) {
        if (text[end] === '{') depth++;
        else if (text[end] === '}' && --depth === 0) break;
      }
      const inner = text.slice(i, end + 1);
      const w = current();
      w.value += inner; w.pattern += escapePattern(inner); w.expand = true;
      if (/\$\(|`/.test(inner)) {
        violations.push('a substitution in a parameter expansion');
        streams.push(...lex(inner.slice(2, -1)).streams);
      }
      i = end;
      continue;
    }
    if (/\s/.test(ch)) {
      flush();
      if (ch === '\n') { i = readHeredocs(i + 1) - 1; f.tokens.push({ kind: 'op', value: '\n' }); }
      continue;
    }
    if (ch === '#' && !word) {
      const end = text.indexOf('\n', i);
      i = (end < 0 ? text.length : end) - 1;
      continue;
    }
    if (';|&<>'.includes(ch)) {
      let fd = '';
      // In 2>file, 2 is a descriptor. In "2">file it remains an argument.
      const before = word as Word | null;
      if ((ch === '<' || ch === '>') && before && !before.quoted && !before.expand && /^\d+$/.test(before.value)) { fd = before.value; word = null; }
      flush();
      let op = ch;
      const two = text.slice(i, i + 3);
      for (const candidate of ['<<<', '<<-', '&>>', ';;', ';&', '&&', '||', '|&', '>>', '>|', '>&', '<>', '<&', '<<', '&>']) {
        if (two.startsWith(candidate)) { op = candidate; break; }
      }
      i += op.length - 1;
      if ((op === '<' || op === '>') && text[i + 1] === '(') {
        violations.push('a process substitution');
        i++;
        current();
        push(')');
        continue;
      }
      f.tokens.push({ kind: 'op', value: fd + op });
      continue;
    }
    if (ch === '(' || ch === ')') {
      violations.push(word ? 'a parenthesis glued to a word' : 'a subshell or group');
      flush();
      if (ch === '(') f.depth++; else f.depth--;
      f.tokens.push({ kind: 'op', value: ch });
      continue;
    }
    const w = current();
    if ('*?[{'.includes(ch)) w.glob = true;
    // `$name`, `$1` and `$'...'` (ANSI-C quoting) change the word at run time.
    if (ch === '$') w.expand = true;
    if (ch === '=' && !w.quoted && !w.expand && !w.assign && /^[A-Za-z_][A-Za-z0-9_]*\+?$/.test(w.value)) w.assign = true;
    w.value += ch; w.pattern += ch;
  }
  if (frames.length > 1 || frame().quote) violations.push('an unclosed quote or substitution');
  while (frames.length > 1) pop();
  flush();
  return { streams, violations };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

interface Redirect { readonly op: string; readonly target: Word | null; readonly body?: string }

interface Command {
  readonly words: Word[];
  readonly redirects: Redirect[];
  /** The separator before the pipeline that holds this command; '' at the start. */
  readonly before: string;
  readonly pipeline: number;
  readonly last: boolean;
  readonly size: number;
  /** Subshell depth change: `(` before the command and `)` after it. */
  readonly open: number;
  readonly close: number;
}

const LIST_SEPARATORS = new Set([';', '&&', '||', '&', '\n', ';;', ';&']);

function commands(tokens: readonly Token[], violations: string[]): Command[] {
  const result: Command[] = [];
  let words: Word[] = [], redirects: Redirect[] = [], before = '', pipeline = 0, inPipeline: Command[] = [], open = 0;
  const end = (separator: string, close = 0) => {
    if (words.length || redirects.length) {
      const command: Command = { words, redirects, before, pipeline, last: false, size: 0, open, close };
      result.push(command); inPipeline.push(command);
      open = 0;
    } else if (separator !== '\n' && separator !== '(' && separator !== ')' && separator !== 'end') violations.push(`an empty command before ${separator}`);
    words = []; redirects = [];
    if (separator !== '|' && separator !== '|&') {
      inPipeline.forEach((command, n) => Object.assign(command, { last: n === inPipeline.length - 1, size: inPipeline.length }));
      inPipeline = [];
      pipeline++;
      if (separator !== '(' && separator !== ')') before = separator;
    }
  };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.kind === 'word') { words.push(token); continue; }
    const redirect = REDIRECT.exec(token.value);
    if (redirect) {
      const next = tokens[i + 1];
      const target = next?.kind === 'word' ? next : null;
      if (target) i++; else violations.push(`a redirect ${token.value} without a word`);
      redirects.push({ op: token.value, target, body: token.body });
      continue;
    }
    if (token.value === '(') { end('('); open++; continue; }
    if (token.value === ')') {
      const last = result.at(-1);
      end(')');
      if (last && result.at(-1) === last) Object.assign(last, { close: last.close + 1 });
      else if (result.at(-1)) Object.assign(result.at(-1)!, { close: result.at(-1)!.close + 1 });
      continue;
    }
    if (token.value === '|&') violations.push('the |& operator');
    if (token.value === ';;' || token.value === ';&') violations.push(`the ${token.value} operator`);
    end(token.value);
  }
  end('end');
  return result;
}

// ---------------------------------------------------------------------------
// Programs (rule 6) and recursion (rule 8)
// ---------------------------------------------------------------------------

const READ_ONLY = new Set(['cat', 'head', 'tail', 'wc', 'grep', 'rg', 'ls', 'stat', 'file', 'du', 'diff', 'cmp', 'cut', 'tr', 'jq', 'echo',
  'printf', 'test', 'pwd', 'basename', 'dirname', 'realpath', 'readlink', 'which', 'type', 'cd', 'find', 'sort', 'git', 'gh']);
const GIT_READ = new Set(['log', 'diff', 'show', 'status', 'ls-files', 'grep', 'rev-parse', 'cat-file', 'ls-tree', 'blame', 'merge-base',
  'rev-list', 'show-ref', 'for-each-ref', 'describe', 'shortlog']);
const GIT_FLAGS = new Set(['--no-pager', '-P', '--no-optional-locks', '--literal-pathspecs', '--glob-pathspecs', '--noglob-pathspecs',
  '--icase-pathspecs']);
const GH_READ = new Set(['pr view', 'pr diff', 'pr list', 'pr checks', 'pr status', 'issue view', 'issue list', 'issue status',
  'run view', 'run list', 'repo view', 'release view', 'release list']);
const RESERVED = new Set(['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until', 'do', 'done', 'case', 'esac', 'select',
  'function', 'time', 'coproc', '[[', ']]', '{', '}', '!']);
/** Programs after which the shell's directory is not known. */
const MOVES_SHELL = new Set(['pushd', 'popd', 'source', '.', 'eval', 'builtin', 'command', 'exec']);
const FIND_WRITES = /^-(?:delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)$/;
const FIND_RUNS = /^-(?:exec|execdir|ok|okdir)$/;

/** Global git options before the subcommand, the `-C` directories in order, and the subcommand index; null for an option not listed. */
function gitInvocation(args: readonly Word[]): { dirs: Word[]; at: number } | null {
  const dirs: Word[] = [];
  let i = 1;
  for (; i < args.length && args[i]!.value.startsWith('-'); i++) {
    if (args[i]!.value === '-C' && args[i + 1]) dirs.push(args[++i]!);
    else if (!GIT_FLAGS.has(args[i]!.value)) return null;
  }
  return i < args.length ? { dirs, at: i } : null;
}

function readOnly(args: readonly Word[]): boolean {
  const program = args[0]!.value;
  const rest = args.slice(1).map(word => word.value);
  if (!READ_ONLY.has(program) || args[0]!.quoted) return false;
  switch (program) {
    case 'find': return !rest.some(value => FIND_WRITES.test(value));
    case 'sort': return !rest.some(value => /^-[^-]*o/.test(value) || value.startsWith('--output'));
    case 'rg': return !rest.some(value => value === '--pre' || value.startsWith('--pre='));
    case 'file': return !rest.some(value => value === '-C' || value === '--compile');
    case 'git': {
      const git = gitInvocation(args);
      return git !== null && GIT_READ.has(args[git.at]!.value)
        && !rest.some(value => value.startsWith('--output') || value === '-O' || value.startsWith('--open-files-in-pager'));
    }
    case 'gh': return GH_READ.has(`${rest[0]} ${rest[1]}`);
    default: return true;
  }
}

/** Rule 8: whole-repository recursion, with or without a protected name. */
function recursionFinding(args: readonly Word[], dirs: Dirs, resolver: Resolver): string | null {
  const program = args[0]?.value;
  if (!program || args[0]!.expand) return null;
  const starts = (words: readonly Word[], base: Dirs) => words.map(word => word.expand ? 'unknown' : resolver.startClass(word.pattern, base));
  if (program === 'rm') {
    let operandsOnly = false, recursive = false;
    const operands: Word[] = [];
    for (const word of args.slice(1)) {
      if (!operandsOnly && word.value === '--') operandsOnly = true;
      else if (!operandsOnly && /^-[^-]/.test(word.value)) recursive ||= /[rR]/.test(word.value);
      else if (!operandsOnly && word.value.startsWith('--')) recursive ||= word.value === '--recursive';
      else operands.push(word);
    }
    return recursive && starts(operands, dirs).includes('root') ? 'rm -r of the repository root or an ancestor' : null;
  }
  if (program === 'find') {
    let i = 1;
    const paths: Word[] = [];
    for (; i < args.length && /^-[HLPEXdsx]$|^-O\d$|^-f$/.test(args[i]!.value); i++) if (args[i]!.value === '-f' && args[i + 1]) paths.push(args[++i]!);
    for (; i < args.length && !/^[-(!)]/.test(args[i]!.value); i++) paths.push(args[i]!);
    const expression = args.slice(i);
    const writes = expression.some((word, n) => word.value === '-delete'
      || (FIND_RUNS.test(word.value) && !(expression[n + 1] && readOnly([expression[n + 1]!]))));
    if (!writes) return null;
    const classes = paths.length ? starts(paths, dirs) : starts([{ kind: 'word', value: '.', pattern: '.', expand: false, glob: false, quoted: false, assign: false }], dirs);
    return classes.some(c => c !== 'other') ? 'find -delete or -exec from the repository root, an ancestor or an unknown start' : null;
  }
  if (program === 'git') {
    const git = gitInvocation(args);
    const clean = git ? args[git.at]!.value === 'clean' : args.some(word => word.value === 'clean');
    if (!clean) return null;
    const options = git ? args.slice(git.at + 1) : args;
    const ignored = options.some(word => /^-[^-]*[xX]/.test(word.value));
    if (!ignored) return null;
    let base: Dirs = dirs;
    for (const dir of git?.dirs ?? []) {
      base = dir.expand || dir.glob ? null : isAbsolute(dir.value) ? [resolve(dir.value)] : base && base.map(d => resolve(d, dir.value));
    }
    if (!git) base = null;
    const pathspecs: Word[] = [];
    for (let n = 0; n < options.length; n++) {
      const value = options[n]!.value;
      if (value === '-e' || value === '--exclude') n++;
      else if (!value.startsWith('-')) pathspecs.push(options[n]!);
    }
    const dot: Word = { kind: 'word', value: '.', pattern: '.', expand: false, glob: false, quoted: false, assign: false };
    const classes = pathspecs.some(word => word.value.startsWith(':')) ? ['unknown'] : starts(pathspecs.length ? pathspecs : [dot], base);
    return classes.some(c => c !== 'other') ? 'git clean -x or -X from the repository root, an ancestor or an unknown directory' : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

const NAME = new RegExp(`(?:^|[^\\w.-])(?:${PROTECTED_REPO_DIRS.map(name => name.toUpperCase()).join('|')})(?![\\w.-])`);
const namesProtected = (text: string) => NAME.test(text.toUpperCase());
const WRITE_REDIRECT = /^\d*(?:>|>>|>\||<>|&>|&>>)$/;

export const PROTECTED_NAME_GUARD = 'ProtectedNameGuard';

export interface GateDecision {
  readonly denial: Denial | null;
  /** Rule 2 held for the command. */
  readonly trigger: boolean;
}

/** The gate decision for one Bash command; the evaluator of mutation-bash.ts runs first and its denials stand. */
export function protectedNameGate(command: string, repoRoot: string, cwd: string): GateDecision {
  const resolver = new Resolver(repoRoot);
  const { streams, violations } = lex(command);
  const findings: string[] = [];
  let trigger = resolver.inProtected(cwd);
  let recursion: string | null = null;

  streams.forEach((tokens, index) => {
    // A substitution body runs where the walk cannot follow the directory.
    let dirs: Dirs = index === 0 ? [cwd] : null;
    const outer: Dirs[] = [];
    const list = commands(tokens, violations);
    const pipelineTrigger = new Map<number, boolean>();
    const wordNames = (word: Word, base: Dirs) => (namesProtected(word.value) && !(word.glob || word.expand ? false : resolver.writableLiteral(word.value, base)))
      || (word.glob && !word.expand && resolver.mayReachProtected(word.pattern, base));
    for (const cmd of list) {
      for (let n = 0; n < cmd.open; n++) outer.push(dirs);
      if (!pipelineTrigger.has(cmd.pipeline)) {
        const members = list.filter(other => other.pipeline === cmd.pipeline);
        pipelineTrigger.set(cmd.pipeline, members.some(member => member.words.some(word => wordNames(word, dirs))
          || member.redirects.some(r => (r.target !== null && wordNames(r.target, dirs)) || (r.body !== undefined && namesProtected(r.body)))));
      }
      const named = pipelineTrigger.get(cmd.pipeline)!;
      trigger ||= named;
      const args = cmd.words;
      const program = args[0];
      recursion ??= recursionFinding(args, dirs, resolver);

      if (program) {
        if (program.expand) violations.push('a substitution in the program position');
        if (program.assign) violations.push('a leading NAME=value assignment');
        if (args.some(word => !word.quoted && RESERVED.has(word.value) && (word === program || ['{', '}', '!'].includes(word.value)))) {
          violations.push('a compound command or reserved word');
        }
        const known = !program.expand && readOnly(args);
        const cp = program.value === 'cp' && !program.quoted;
        const operands = args.slice(1);
        if (!known && operands.some(word => word.expand)) violations.push(`an expanded word for ${program.value}`);
        const holdsProtected = dirs === null || dirs.some(dir => resolver.inProtected(dir));
        if (cp) {
          if (operands.some(word => /^-[^-]*t|^--target-directory/.test(word.value))) findings.push('cp with a target-directory option');
          const destination = operands.filter(word => !word.value.startsWith('-')).at(-1);
          if (destination && resolver.mayReachProtected(destination.pattern, dirs)) findings.push(`cp to ${destination.value}`);
        } else if (!known && (named || holdsProtected)) {
          findings.push(`${program.value} ${named ? 'next to a protected name' : 'in a protected or unknown directory'}`);
        }
      }
      for (const redirect of cmd.redirects) {
        const target = redirect.target;
        if (!target) continue;
        if (redirect.op.endsWith('<<<')) {
          if (target.expand && !(program && readOnly(args))) violations.push('an expanded here-string');
          continue;
        }
        const duplicate = /^\d*(?:>&|<&)$/.test(redirect.op);
        if (duplicate && /^(?:\d+|-)$/.test(target.value) && !target.quoted) continue;
        if (!WRITE_REDIRECT.test(redirect.op) && !redirect.op.endsWith('>&')) continue;
        if (target.expand) { violations.push('an expanded redirect target'); continue; }
        if (resolver.mayReachProtected(target.pattern, dirs)) findings.push(`a redirect to ${target.value}`);
      }

      // Rule 5: the directory set after this command.
      if (program && !program.quoted && program.value === 'cd') {
        const operands = args.slice(1);
        const target = operands.length === 1 && !operands[0]!.expand && !operands[0]!.glob && !operands[0]!.value.startsWith('-')
          && !operands[0]!.value.startsWith('~') && operands[0]!.value ? operands[0]!.value : null;
        const next: Dirs = target === null ? null : isAbsolute(target) ? [resolve(target)] : dirs && dirs.map(dir => resolve(dir, target));
        // bash runs each command of a pipeline in a subshell; zsh runs the last one in the shell itself.
        if (cmd.size > 1 && !cmd.last) { /* no effect */ }
        else if (cmd.size === 1 && (cmd.before === '' || cmd.before === '&&')) dirs = next;
        else dirs = dirs && next && [...new Set([...dirs, ...next])];
      } else if (program && MOVES_SHELL.has(program.value)) dirs = null;
      for (let n = 0; n < cmd.close; n++) dirs = outer.length ? outer.pop()! : null;
    }
  });
  if (!trigger && violations.length && /_(?:OPS|REF)/.test(command.replace(/['"\\]/g, '').toUpperCase())) trigger = true;

  if (recursion) {
    return { trigger, denial: { guard: PROTECTED_NAME_GUARD, reason: `The command runs ${recursion}.`, fix: 'Name the directories to clean below the repository root.' } };
  }
  const reason = !trigger ? null : violations[0] ? `uses ${violations[0]}, outside the strict form` : findings[0];
  return {
    trigger,
    denial: reason ? {
      guard: PROTECTED_NAME_GUARD,
      reason: `The command names _ops or _ref and ${reason}.`,
      fix: 'Name a protected directory only in simple commands of read-only programs (cat, rg, ls, git log, ...) or as a cp source, '
        + 'and pass long text as "$(cat <<\'EOF\' ... EOF)" with no $, backtick, \\ or " in the body.',
    } : null,
  };
}
