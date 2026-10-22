/** A literal-write tripwire, not a shell interpreter. No state or process reads. */
import { isAbsolute, relative, resolve } from 'path';
import { payloadString } from './hook-input';
import { runMutationPathGuard, type MutationGuardInput, type MutationGuardResult } from './mutation-guard';
import { protectedRepoDir } from './mutation-protected-dirs';

interface Word { value: string; literal: boolean; operator?: true }

/** Quotes are removed only to locate literal operands. Expansions stay unresolved. */
function words(line: string): Word[] | null {
  const result: Word[] = [];
  let value = '', literal = true, active = false, quote = '';
  const flush = () => {
    if (active) result.push({ value, literal });
    value = ''; literal = true; active = false;
  };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (!quote && ch === '#' && !active) break;
    if (ch === '\\' && quote !== "'") {
      if (i + 1 === line.length) return null;
      value += line[++i]; active = true; continue;
    }
    if (quote) {
      if (ch === quote) quote = '';
      else { value += ch; if (quote === '"' && /[$`]/.test(ch)) literal = false; }
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; active = true; continue; }
    if (/\s/.test(ch)) { flush(); continue; }
    if (';|&<>'.includes(ch)) {
      flush();
      let op = ch;
      if (line[i + 1] === ch && ch !== ';') op += line[++i];
      if (op === '<<' && line[i + 1] === '-') op += line[++i];
      result.push({ value: op, literal: true, operator: true });
      continue;
    }
    // Grouping and command substitutions need a real shell parser.
    if (ch === '(' || ch === ')') return null;
    if (/[$`*?{}~]/.test(ch)) literal = false;
    value += ch; active = true;
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

function commandTargets(tokens: readonly Word[], heredoc: string): string[] {
  const args = tokens.filter(token => !token.operator);
  const program = args[0]?.literal ? args[0].value : '';
  const operands = args.slice(1);
  if (/^python(?:3(?:\.\d+)?)?$/.test(program) || program === 'node') {
    const flag = operands.findIndex(word => word.value === '-c' || word.value === '-e' || word.value === '--eval');
    return scriptTargets(program, flag >= 0 ? operands[flag + 1]?.value ?? '' : heredoc);
  }
  if (!['rm', 'mv', 'cp', 'tee', 'sed'].includes(program)) return [];
  // Options with operands are outside the narrow grammar, except sed's -e/-f.
  const supported = program === 'sed' ? /^-(?:i.*|[nEr]+|e|f)$/ : /^-(?:[rfivnpRa]+|-)$/;
  if (operands.some(word => word.value.startsWith('-') && !supported.test(word.value))) return [];
  const paths = operands.filter(word => !word.value.startsWith('-'));
  if (program === 'cp') return paths.length >= 2 && paths.at(-1)!.literal ? [paths.at(-1)!.value] : [];
  if (program === 'sed') {
    if (!operands.some(word => /^-i/.test(word.value))) return [];
    // The last operand is the file in the supported single-file sed form.
    return paths.length >= 2 && paths.at(-1)!.literal ? [paths.at(-1)!.value] : [];
  }
  return paths.filter(word => (word.literal || !/[$`{}~]/.test(word.value)) && word.value).map(word => word.value);
}

/** Only destinations in the supported literal forms reach filesystem validation. */
export function bashWriteTargets(command: string, repoRoot: string, cwd: string): readonly string[] {
  if (command.length > 65_536 || !/(?:>|\b(?:rm|mv|cp|tee|sed|python\d*|node)\b)/.test(command)) return [];
  const candidates: string[] = [];
  let commandCwd: string | null = cwd;
  const add = (candidate: string) => {
    if (!candidate || /[$`{}~\n\r]/.test(candidate) || ['/dev/null', '/dev/stdout', '/dev/stderr'].includes(candidate)) return;
    // A glob under a known literal directory can only mutate that directory.
    if (/[*?\[]/.test(candidate)) {
      const prefix = candidate.split(/[*?\[]/, 1)[0]!;
      const slash = prefix.lastIndexOf('/');
      if (slash < 0) return;
      candidate = prefix.slice(0, slash + 1);
    }
    if (!isAbsolute(candidate) && !commandCwd) return;
    const target = resolve(commandCwd ?? cwd, candidate);
    const rel = relative(repoRoot, target);
    if (isAbsolute(rel) || rel === '..' || rel.startsWith('../') || protectedRepoDir(rel)) candidates.push(target);
  };
  const lines = command.split('\n');
  for (let line = 0; line < lines.length; line++) {
    const tokens = words(lines[line]!);
    // A later physical line can still be inside this command's quoted argument.
    if (!tokens) return [];
    let body = '';
    const here = tokens.findIndex(token => token.operator && token.value.startsWith('<<'));
    if (here >= 0) {
      const delimiter = tokens[here + 1];
      if (!delimiter?.literal || delimiter.operator) continue;
      const content: string[] = [];
      while (++line < lines.length) {
        const current = tokens[here]!.value === '<<-' ? lines[line]!.replace(/^\t+/, '') : lines[line]!;
        if (current === delimiter.value) break;
        content.push(lines[line]!);
      }
      body = content.join('\n');
    }
    let segment: Word[] = [];
    const flush = (separator = '\n') => {
      for (const target of commandTargets(segment, body)) add(target);
      if (segment[0]?.value === 'cd') {
        const target = segment[1];
        commandCwd = separator === '&&' && commandCwd && segment.length === 2 && target?.literal && !target.value.startsWith('-')
          ? resolve(commandCwd, target.value) : null;
      } else if (['source', '.', 'eval', 'pushd', 'popd', 'command', 'builtin'].includes(segment[0]?.value ?? '')) {
        commandCwd = null;
      }
      segment = [];
    };
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      if (token.operator && [';', '|', '||', '&', '&&'].includes(token.value)) { flush(token.value); continue; }
      if (token.operator && ['>', '>>', '<', '<<', '<<-'].includes(token.value)) {
        const target = tokens[++i];
        if ((token.value === '>' || token.value === '>>') && target?.literal && !target.operator) add(target.value);
        continue;
      }
      segment.push(token);
    }
    flush();
  }
  return [...new Set(candidates)];
}

export function runBashMutationGuard(opts: MutationGuardInput): MutationGuardResult {
  const command = payloadString(opts.payload, 'tool_input.command');
  const cwd = payloadString(opts.payload, 'cwd');
  // A missing or non-absolute host cwd gives no reliable destination authority.
  if (!isAbsolute(cwd)) return { exitCode: 0, stdout: '', stderr: '' };
  const paths = bashWriteTargets(command, opts.repoRoot, cwd);
  if (!paths.length) return { exitCode: 0, stdout: '', stderr: '' };
  return runMutationPathGuard(opts, paths);
}
