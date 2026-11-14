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

/**
 * Shell pattern match of one path segment. By default a nested or invalid bracket matches every name, as on main, so the evaluator
 * keeps each main denial (#2369 rule 1). The gate trigger passes `exact`: only a POSIX class (`[[:lower:]]`) matches every name, and a
 * bracket that does not compile, such as `[--x]`, matches one character, so a command line such as `rh x [--dry-run]` does not trigger.
 */
export function segmentMatches(pattern: string, name: string, exact = false): boolean {
  let source = '', loose = '';
  const add = (strict: string, wide = strict) => { source += strict; loose += wide; };
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    const negated = ch === '[' && (pattern[i + 1] === '!' || pattern[i + 1] === '^');
    // A `]` right after `[` or `[!` is a member of the bracket expression, not its end.
    const close = ch === '[' ? pattern.indexOf(']', i + (negated ? 3 : 2)) : -1;
    if (ch === '\\') add((pattern[++i] ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    else if (ch === '*') add('.*');
    else if (ch === '?') add('.');
    // A POSIX class, equivalence class or collating symbol is outside this grammar, so the pattern matches.
    else if (close > 0 && (exact ? /\[[:=.]/ : /\[/).test(pattern.slice(i + 1, close))) return true;
    else if (close > 0) {
      add(`[${negated ? '^' : ''}${unescapePattern(pattern.slice(i + (negated ? 2 : 1), close)).replace(/[\\\]]/g, '\\$&')}]`, '.');
      i = close;
    } else add(ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  }
  // A match with or without case counts: the shell glob is case-sensitive, but `nocaseglob` and the filesystem are not.
  // `u` folds `ſ` to `s` as APFS does.
  for (const text of exact ? [source, loose] : [source]) {
    try { return new RegExp(`^${text}$`, 'u').test(name) || new RegExp(`^${text}$`, 'iu').test(name); } catch { /* the next form */ }
  }
  return true;
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
    return this.inProtected(dir) || (this.isRoot(dir) && PROTECTED_REPO_DIRS.some(name => segmentMatches(rest[0]!, name, true)));
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

const HEREDOC_HEAD = /"\$\(cat <<\s?'([A-Za-z_][A-Za-z0-9_]*)'\n/y;
const REDIRECT = /^(\d*)(>>|>\||>&|>|<>|<&|<<<|<<-|<<|<|&>>|&>)$/;

/**
 * Rule 3: the `"$(cat <<'D' ... D\n)"` span at `at`, or null. The body has no `$`, backtick, `\`, `"` or delimiter line, so the
 * shell prints it as text, and the lexer reads it as a quoted literal. Its text counts for the trigger and as a possible target
 * in every position (round 5): no position keeps a span as data.
 */
function heredocLiteral(text: string, at: number): { end: number; body: string } | null {
  HEREDOC_HEAD.lastIndex = at;
  const head = HEREDOC_HEAD.exec(text);
  if (!head) return null;
  const close = `\n${head[1]}\n)"`;
  const start = HEREDOC_HEAD.lastIndex;
  const end = text.indexOf(close, start - 1);
  if (end < 0) return null;
  const body = text.slice(start, end);
  if (/[$`\\"]/.test(body) || body.split('\n').includes(head[1]!)) return null;
  return { end: end + close.length, body };
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
      const span = heredocLiteral(text, i);
      if (span) {
        current().quoted = true;
        for (const c of span.body) literal(c);
        i = span.end - 1;
        continue;
      }
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
    // In `$'...'` a backslash escapes the quote, so `$'\''` is one character; the joint decision on F4 puts it outside the strict form.
    if (ch === '$' && text[i + 1] === "'") {
      violations.push("an ANSI-C $'...' string");
      let end = i + 2;
      while (end < text.length && text[end] !== "'") end += text[end] === '\\' ? 2 : 1;
      const w = current();
      w.expand = true; w.quoted = true;
      for (const c of text.slice(i + 2, end)) literal(c);
      if (end >= text.length) { violations.push('an unclosed quote'); break; }
      i = end;
      continue;
    }
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
    // `$name` and `$1` change the word at run time.
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
  readonly kind: 'command';
  readonly words: Word[];
  readonly redirects: Redirect[];
  /** The separator before the pipeline that holds this command; '' at the start. */
  readonly before: string;
  /** The operator right after this command: `|` inside a pipeline, else the list separator; 'end' at the end. */
  readonly after: string;
  readonly last: boolean;
  readonly size: number;
}

/** A command, or the `(` or `)` of a subshell or group. */
type Step = Command | { readonly kind: '(' | ')' };

function commands(tokens: readonly Token[], violations: string[]): Step[] {
  const result: Step[] = [];
  let words: Word[] = [], redirects: Redirect[] = [], before = '', inPipeline: Command[] = [];
  const end = (separator: string) => {
    if (words.length || redirects.length) {
      const command: Command = { kind: 'command', words, redirects, before, after: separator, last: false, size: 0 };
      result.push(command); inPipeline.push(command);
    } else if (separator !== '\n' && separator !== '(' && separator !== ')' && separator !== 'end') violations.push(`an empty command before ${separator}`);
    words = []; redirects = [];
    if (separator !== '|' && separator !== '|&') {
      inPipeline.forEach((command, n) => Object.assign(command, { last: n === inPipeline.length - 1, size: inPipeline.length }));
      inPipeline = [];
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
    if (token.value === '(' || token.value === ')') { end(token.value); result.push({ kind: token.value }); continue; }
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

export const READ_ONLY = new Set(['cat', 'head', 'tail', 'wc', 'grep', 'rg', 'ls', 'stat', 'file', 'du', 'diff', 'cmp', 'cut', 'tr', 'jq', 'echo',
  'printf', 'test', 'pwd', 'basename', 'dirname', 'realpath', 'readlink', 'which', 'type', 'cd', 'find', 'sort', 'git', 'gh']);
/**
 * The git read subcommands and the exact options each one takes. git takes a unique prefix of a long option (`--textc` is
 * `--textconv`), so only the full name of a listed option passes. Not listed: `grep` (-O runs a command on the matched files),
 * `cat-file` and `for-each-ref` (`--textconv`, `--filters` and `%(signature)` run configured programs), and every option that
 * writes a file (`--output`) or turns on a configured command (`--ext-diff`, `--textconv`, `--show-signature`).
 */
interface GitRead { readonly options: ReadonlySet<string>; readonly glued?: RegExp }
const optionSet = (...lists: string[]) => new Set(lists.join(' ').split(' '));
const REVISIONS = '--all --reverse --first-parent --merges --no-merges --topo-order --date-order --boundary --left-right --cherry-pick '
  + '--full-history --follow --since= --until= --after= --before= --author= --committer= --grep= --max-count= --skip= -n';
const PRETTY = '--oneline --pretty --pretty= --format= --abbrev-commit --no-abbrev-commit --decorate --decorate= --no-decorate --graph '
  + '--date= --source --no-color --color=';
const DIFF = '-p --patch -s --no-patch --stat --stat= --shortstat --numstat --name-only --name-status --summary --raw --diff-filter= '
  + '--unified= -w --ignore-all-space -b --ignore-space-change --word-diff --word-diff= -M --find-renames --no-renames --minimal '
  + '--relative --no-ext-diff --no-textconv --no-color --color=';
const COUNT = /^-n?\d+$/;
export const GIT_READ = new Map<string, GitRead>([
  ['log', { options: optionSet(REVISIONS, PRETTY, DIFF), glued: /^-n?\d+$|^-U\d+$/ }],
  ['show', { options: optionSet(PRETTY, DIFF), glued: /^-U\d+$/ }],
  ['diff', { options: optionSet(DIFF, '--cached --staged --quiet --exit-code --check --merge-base'), glued: /^-U\d+$/ }],
  ['shortlog', { options: optionSet(REVISIONS, '-s -e --summary --numbered --email --format='), glued: COUNT }],
  ['rev-list', { options: optionSet(REVISIONS, '--count --abbrev-commit'), glued: COUNT }],
  ['status', { options: optionSet('--short -s --branch -b --porcelain --porcelain= --long -z --untracked-files= -u --ignored --ignored= '
    + '--show-stash --ahead-behind --no-ahead-behind') }],
  ['ls-files', { options: optionSet('--cached -c --deleted -d --modified -m --others -o --ignored -i --exclude-standard --stage -s '
    + '--unmerged -u -z --full-name --error-unmatch --directory --no-empty-directory --eol -t') }],
  ['rev-parse', { options: optionSet('--show-toplevel --abbrev-ref --abbrev-ref= --verify --short --short= --git-dir --git-common-dir '
    + '--absolute-git-dir --is-inside-work-tree --is-inside-git-dir --is-bare-repository --show-prefix --show-cdup --symbolic-full-name '
    + '-q --quiet') }],
  ['ls-tree', { options: optionSet('-r -d -t -l --long -z --name-only --name-status --full-name --full-tree --abbrev --abbrev= --object-only') }],
  ['blame', { options: optionSet('-L -w -M -C -e -s -l -t -p --porcelain --line-porcelain --show-email --root -n --show-number -f '
    + '--show-name --date='), glued: /^-L\S+$/ }],
  ['merge-base', { options: optionSet('--is-ancestor --all --fork-point --octopus --independent') }],
  ['show-ref', { options: optionSet('--heads --tags --head --verify -q --quiet -s --hash --hash= --abbrev --abbrev= -d --dereference --exists') }],
  ['describe', { options: optionSet('--tags --all --always --long --exact-match --dirty --dirty= --contains --first-parent --abbrev= '
    + '--match= --exclude= --candidates=') }],
]);
/** Options that run a configured program or write a file; a prefix of one is an abbreviation even where the option is not listed. */
const GIT_RUNS = new Map([['--textconv', 'runs a configured program'], ['--ext-diff', 'runs a configured program'],
  ['--output', 'writes a file'], ['--show-signature', 'runs a configured program'], ['--filters', 'runs a configured program']]);
/**
 * Format placeholders that run the configured signature verifier (`gpg.program`), also with a `+`, `-` or space modifier after `%`.
 * Only a format option value holds placeholders; `--date=format:%G` is a strftime year.
 */
const GIT_SIGNATURE = /%[-+ ]?G|%\(signature/;
const GIT_FORMAT = /^--(?:format|pretty)=/;
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

const readOnly = (args: readonly Word[]): boolean => programFinding(args, true, 1) === null;

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

/** Programs whose operands are write targets; only their operands and redirect targets take the writable-directory exemption. */
const WRITERS = new Set(['touch', 'mkdir', 'rm', 'rmdir', 'mv', 'tee', 'ln', 'truncate']);
const MOVES_DIR = new Set(['cd', 'pushd', 'popd']);
const NAME = new RegExp(`(?:^|[^\\w.-])(?:${PROTECTED_REPO_DIRS.map(name => name.toUpperCase()).join('|')})(?![\\w.-])`);
const namesProtected = (text: string) => NAME.test(text.toUpperCase());
/** A word names a protected directory itself, or as the value of a glued short option such as `sort -o_ops/x` or `-uo_ops/x`. */
const wordNamesProtected = (value: string) => {
  if (namesProtected(value)) return true;
  const flags = /^-[A-Za-z]+/.exec(value)?.[0].length ?? 0;
  for (let at = 2; at <= flags; at++) if (namesProtected(value.slice(at))) return true;
  return false;
};
const WRITE_REDIRECT = /^\d*(?:>|>>|>\||<>|&>|&>>)$/;

export const PROTECTED_NAME_GUARD = 'ProtectedNameGuard';

interface Finding { readonly reason: string; readonly fix: string }
const STRICT = 'Name a protected directory only in simple commands of read-only programs (cat, rg, ls, git log, ...) or as a cp source.';
const SPLIT = `Split the command line: run the command that names _ops or _ref alone. ${STRICT}`;
const finding = (reason: string, fix = STRICT): Finding => ({ reason, fix });

/**
 * The first word after a git read subcommand that is not one of its listed options, or null. A shell-expanded word before `--`
 * may become an option, and a `%G` or `%(signature` format runs the signature verifier. `unlisted` is the fix for an unlisted option.
 */
function gitOptionFinding(args: readonly Word[], at: number, unlisted: string): Finding | null {
  const sub = args[at]!.value;
  const read = GIT_READ.get(sub)!;
  for (const word of args.slice(at + 1)) {
    const value = word.value;
    if (value === '--') break;
    if (GIT_FORMAT.test(value) && GIT_SIGNATURE.test(value)) {
      return finding(`passes ${value} to git ${sub}, a format that runs the signature verifier`, 'Remove the %G and %(signature) placeholders: they run gpg.program.');
    }
    if (word.expand || word.glob) {
      return finding(`passes ${value} to git ${sub}, a word that the shell expands before --`, `Write each git ${sub} option as literal text, and put paths after --.`);
    }
    if (!value.startsWith('-') || value === '-') continue;
    const equals = value.indexOf('=');
    if (read.options.has(value) || (equals > 0 && read.options.has(value.slice(0, equals + 1))) || read.glued?.test(value)) continue;
    const name = equals > 0 ? value.slice(0, equals) : value;
    if (name.startsWith('--')) {
      const replacements = completions(read.options, name, equals > 0 ? value.slice(equals + 1) : null);
      if (replacements.length) {
        if (read.options.has(`${name}=`)) {
          return finding(`passes ${value} to git ${sub}, an option that the gate reads only with its value after =`,
            `Write the value after = (${replacements[0]}).`);
        }
        return finding(`passes ${value} to git ${sub}, an abbreviation of ${replacements.join(' or ')}`,
          `Write the full option name (${replacements.join(' or ')}): git takes a unique prefix of a long option, and the gate reads only full names.`);
      }
      const runs = [...GIT_RUNS].find(([option]) => option.startsWith(name));
      const listed = [...read.options].some(option => option.startsWith(name));
      if (runs || listed) {
        const reason = !runs ? `and no listed option completes ${value}`
          : runs[0] === name ? `which ${runs[1]}` : `an abbreviation of ${runs[0]}, which ${runs[1]}`;
        return finding(`passes ${value} to git ${sub}, ${reason}`, `Remove ${value} from the git ${sub} command.`);
      }
    }
    return finding(`passes ${value} to git ${sub}, an option outside the read list`, unlisted);
  }
  return null;
}

/**
 * The admitted spellings that replace the long option `name` (with `value` after `=`, or null), in the list entry syntax: a bare
 * entry only without a value, and an equals-only entry (`--color=`) as `--color=<value>` or with the given value. A name that is an
 * equals-only entry itself (`--date iso`) gets only that entry.
 */
function completions(listed: ReadonlySet<string>, name: string, value: string | null): string[] {
  const entries = listed.has(`${name}=`) ? [`${name}=`] : [...listed].filter(option => option.startsWith(name));
  return entries.flatMap(option => {
    if (!option.endsWith('=')) return value === null ? [option] : [];
    if (value === null && listed.has(option.slice(0, -1))) return [];
    return [`${option}${value ?? '<value>'}`];
  });
}

/** The values of one option in its three spellings: `--title x` or `-t x`, `--title=x`, `-tx`. */
function optionValues(words: readonly Word[], long: string, short: string): string[] {
  return words.flatMap((word, n) => {
    if (word.value === long || word.value === short) return words[n + 1] ? [words[n + 1]!.value] : [];
    if (word.value.startsWith(`${long}=`)) return [word.value.slice(long.length + 1)];
    return word.value.startsWith(short) && word.value.length > short.length && !word.value.startsWith('--') ? [word.value.slice(short.length)] : [];
  });
}

const MESSAGE_FILE = 'Write the message to a file on its own command line, then pass it with git commit -F <file> or git tag -F <file>.';

const GIT_GLOBAL = 'Remove the git global option: only -C <dir>, --no-pager, -P, --no-optional-locks and the pathspec flags pass.';

/** Rule 6 for git: null for a listed read subcommand with listed options. */
function gitFinding(args: readonly Word[], split: boolean, commands: number): Finding | null {
  const git = gitInvocation(args);
  if (git && GIT_READ.has(args[git.at]!.value)) {
    const sub = args[git.at]!.value;
    return gitOptionFinding(args, git.at, split ? SPLIT : `Pass git ${sub} only options of its read list, or read with rg, cat or ls.`);
  }
  const sub = git ? args[git.at]!.value : null;
  const global = git ? undefined : args.slice(1).find((word, n) => word.value.startsWith('-') && word.value !== '-C' && !GIT_FLAGS.has(word.value)
    && args[n]!.value !== '-C');
  const reason = sub ? `runs git ${sub}, which is not a read-only program`
    : global ? `runs git with the global option ${global.value}, which is not listed` : 'runs git with no subcommand';
  if (sub === 'grep') return finding(reason, 'Use rg to search: git grep -O runs a command on the matched files.');
  if (sub === 'cat-file') return finding(reason, 'Use git show <rev>:<path>: git cat-file --textconv and --filters run configured programs.');
  if (sub === 'for-each-ref') return finding(reason, 'Use git show-ref or git log: git for-each-ref %(signature) formats run gpg.program.');
  if (split) return finding(reason, SPLIT);
  if (sub === 'commit' || sub === 'tag') return finding(reason, MESSAGE_FILE);
  if (!sub) return finding(reason, global ? GIT_GLOBAL : 'Give git a read subcommand, such as git log, git show or git status.');
  return finding(reason, commands > 1 ? SPLIT : STRICT);
}

/** Rule 6 for gh: null for a listed read subcommand. */
function ghFinding(args: readonly Word[], split: boolean): Finding | null {
  const sub = args.slice(1).find(word => !word.value.startsWith('-'))?.value;
  if (GH_READ.has(`${args[1]?.value} ${args[2]?.value}`)) return null;
  const reason = `runs gh ${sub ?? ''}`.trim() + ', which is not a read-only program';
  if (split) return finding(reason, SPLIT);
  if (optionValues(args, '--title', '-t').some(wordNamesProtected)) {
    return finding(reason, 'Keep _ops and _ref out of the title: gh reads only the body from a file (--body-file <file>).');
  }
  if (sub === 'api') {
    return finding(reason, 'Keep _ops and _ref out of the gh api endpoint; pass a request body that names them with gh api --input <file>, written on its own command line.');
  }
  return finding(reason, 'Write the body to a file on its own command line, then pass it with gh --body-file <file>.');
}

/**
 * Rule 6: null for a read-only program; else the finding, whose fix names the usual way out. One decision serves admission and the
 * denial text. The lexer already removed quotes and backslashes from the program word, so every lookup reads the name the shell
 * runs; a read-only program admits only its plain spelling.
 */
function programFinding(args: readonly Word[], named: boolean, commands: number): Finding | null {
  const word = args[0]!;
  const program = word.value;
  const split = !named && commands > 1;
  const rest = args.slice(1).map(arg => arg.value);
  const notRead = finding(`runs ${program}, which is not a read-only program`, commands > 1 ? SPLIT : STRICT);
  if (word.expand || !READ_ONLY.has(program)) return notRead;
  const denies = (test: (value: string) => boolean) => rest.some(test) ? notRead : null;
  let result: Finding | null;
  switch (program) {
    case 'git': result = gitFinding(args, split, commands); break;
    case 'gh': result = ghFinding(args, split); break;
    case 'find': result = denies(value => FIND_WRITES.test(value)); break;
    case 'sort': result = denies(value => /^-[^-]*o/.test(value) || value.startsWith('--output')); break;
    case 'rg': result = denies(value => value === '--pre' || value.startsWith('--pre=')); break;
    case 'file': result = denies(value => value === '-C' || value === '--compile'); break;
    default: result = null;
  }
  if (result || !word.quoted) return result;
  return finding(`writes the program name ${program} with a quote or a backslash`, `Write ${program} as a plain word: the gate admits a read-only program only in its plain spelling.`);
}

export interface GateDecision {
  readonly denial: Denial | null;
  /** Rule 2 held for the command. */
  readonly trigger: boolean;
}

/** The gate decision for one Bash command; the evaluator of mutation-bash.ts runs first and its denials stand. */
export function protectedNameGate(command: string, repoRoot: string, cwd: string): GateDecision {
  // The Bash route fails open when a handler throws, so the gate turns its own error into a denial.
  try {
    return gate(command, repoRoot, cwd);
  } catch (error) {
    return {
      trigger: true,
      denial: {
        guard: PROTECTED_NAME_GUARD,
        reason: `The protected-name gate failed: ${error instanceof Error ? error.message : String(error)}.`,
        fix: 'Split the command into simple commands, or report the gate error.',
      },
    };
  }
}

function gate(command: string, repoRoot: string, cwd: string): GateDecision {
  const resolver = new Resolver(repoRoot);
  const { streams, violations } = lex(command);
  const findings: Finding[] = [];
  let trigger = resolver.inProtected(cwd);
  let recursion: string | null = null;

  streams.forEach((tokens, index) => {
    // A substitution body runs where the walk cannot follow the directory.
    let dirs: Dirs = index === 0 ? [cwd] : null;
    const outer: Dirs[] = [];
    const steps = commands(tokens, violations);
    const list = steps.filter((step): step is Command => step.kind === 'command');
    // F1 (owner, 2026-11-14): the writable-directory exemption holds only for a write target with no earlier cd, pushd or popd.
    const moved = new Map<Command, boolean>();
    list.reduce((seen, cmd) => {
      moved.set(cmd, seen);
      const program = cmd.words[0];
      return seen || (!!program && MOVES_DIR.has(program.value));
    }, false);
    const writeTarget = (cmd: Command, word: Word) => {
      const program = cmd.words[0];
      if (moved.get(cmd)) return false;
      if (cmd.redirects.some(r => r.target === word)) return true;
      return !!program && word !== program && !program.quoted && WRITERS.has(program.value);
    };
    const exempt = (cmd: Command, word: Word, base: Dirs) => !word.glob && !word.expand && writeTarget(cmd, word)
      && resolver.writableLiteral(word.value, base);
    const wordNames = (cmd: Command, word: Word, base: Dirs) => (wordNamesProtected(word.value) && !exempt(cmd, word, base))
      || (word.glob && !word.expand && resolver.mayReachProtected(word.pattern, base));
    for (const cmd of steps) {
      // A subshell does not move the shell that started it.
      if (cmd.kind !== 'command') {
        if (cmd.kind === '(') outer.push(dirs); else dirs = outer.length ? outer.pop()! : null;
        continue;
      }
      // Rule 6 has one trigger for the whole command line: a file or a pipe carries a name from one command to the next.
      const named = cmd.words.some(word => wordNames(cmd, word, dirs))
        || cmd.redirects.some(r => (r.target !== null && wordNames(cmd, r.target, dirs)) || (r.body !== undefined && namesProtected(r.body)));
      trigger ||= named;
      const args = cmd.words;
      const program = args[0];
      recursion ??= recursionFinding(args, dirs, resolver);
      let decision: Finding | null = null;

      if (program) {
        if (program.expand) violations.push('a substitution in the program position');
        if (program.assign) violations.push('a leading NAME=value assignment');
        if (args.some(word => !word.quoted && RESERVED.has(word.value) && (word === program || ['{', '}', '!'].includes(word.value)))) {
          violations.push('a compound command or reserved word');
        }
        decision = programFinding(args, named, list.length);
        const known = decision === null;
        const cp = program.value === 'cp' && !program.quoted;
        const operands = args.slice(1);
        if (!known && operands.some(word => word.expand)) violations.push(`an expanded word for ${program.value}`);
        if (cp) {
          if (operands.some(word => /^-[^-]*t|^--target-directory/.test(word.value))) findings.push(finding('cp with a target-directory option'));
          const destination = operands.filter(word => !word.value.startsWith('-')).at(-1);
          if (destination && resolver.mayReachProtected(destination.pattern, dirs)) findings.push(finding(`cp to ${destination.value}`));
        } else if (decision) findings.push(decision);
      }
      for (const redirect of cmd.redirects) {
        const target = redirect.target;
        if (!target) continue;
        if (redirect.op.endsWith('<<<')) {
          if (target.expand && !(program && decision === null)) violations.push('an expanded here-string');
          continue;
        }
        const duplicate = /^\d*(?:>&|<&)$/.test(redirect.op);
        if (duplicate && /^(?:\d+|-)$/.test(target.value) && !target.quoted) continue;
        if (!WRITE_REDIRECT.test(redirect.op) && !redirect.op.endsWith('>&')) continue;
        if (target.expand) { violations.push('an expanded redirect target'); continue; }
        if (resolver.mayReachProtected(target.pattern, dirs)) findings.push(finding(`a redirect to ${target.value}`));
      }

      // Rule 5: the directory set after this command.
      if (program && !program.quoted && program.value === 'cd') {
        const operands = args.slice(1);
        const target = operands.length === 1 && !operands[0]!.expand && !operands[0]!.glob && !operands[0]!.value.startsWith('-')
          && !operands[0]!.value.startsWith('~') && operands[0]!.value ? operands[0]!.value : null;
        const next: Dirs = target === null ? null : isAbsolute(target) ? [resolve(target)] : dirs && dirs.map(dir => resolve(dir, target));
        // A cd before `|` runs in a subshell in bash and zsh, so it never moves the shell. A cd before `&` runs in the background,
        // the last command of a pipeline runs in the shell only in zsh, and a cd after `||`, `;` or a newline may not have run:
        // each of these adds to the directory set.
        if (cmd.size > 1 && !cmd.last) { /* no effect */ }
        else if (cmd.size === 1 && (cmd.before === '' || cmd.before === '&&') && cmd.after !== '&') dirs = next;
        else dirs = dirs && next && [...new Set([...dirs, ...next])];
      } else if (program && MOVES_SHELL.has(program.value)) dirs = null;
    }
  });
  if (!trigger && violations.length && /_(?:OPS|REF)/.test(command.replace(/['"\\]/g, '').toUpperCase())) trigger = true;

  if (recursion) {
    return { trigger, denial: { guard: PROTECTED_NAME_GUARD, reason: `The command runs ${recursion}.`, fix: 'Name the directories to clean below the repository root.' } };
  }
  const first = !trigger ? null : violations[0] ? finding(`uses ${violations[0]}, outside the strict form`) : findings[0];
  return {
    trigger,
    denial: first ? { guard: PROTECTED_NAME_GUARD, reason: `The command names _ops or _ref and ${first.reason}.`, fix: first.fix } : null,
  };
}
