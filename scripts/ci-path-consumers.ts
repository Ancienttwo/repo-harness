import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { API } from 'typescript/unstable/async';
import { createVirtualFileSystem } from 'typescript/unstable/fs';
import { isArrayLiteralExpression, isBinaryExpression, isCallExpression, isObjectLiteralExpression, isPropertyAssignment, isShorthandPropertyAssignment, isPropertyAccessExpression, isIdentifier, isVariableDeclaration, isNewExpression, isStringLiteralLikeNode, SyntaxKind, type Node } from 'typescript/unstable/ast';
import { getLeadingCommentRanges, getTrailingCommentRanges } from 'typescript/unstable/ast/scanner';
import { createPathEvaluator, walk } from './lib/path-values';

export type PathReference = { path: string; operation: 'data' | 'execute' | 'literal' | 'constructed'; rooted: boolean; start: number; end: number };
export type SourceEvidence = { start: number; end: number; reason: string; paths?: string[] };
export const sourceEvidence = new Map<string, SourceEvidence[]>();
const cache = new Map<string, PathReference[]>();
const root = '/__repo_harness_ci__';
const pathOperations = new Set(['join', 'resolve', 'URL', 'dirname', 'fileURLToPath']);
const pathInspections = new Set(['basename', 'isAbsolute', 'extname']);
const readers = new Set(['readFileSync', 'readFile', 'readdirSync', 'readdir', 'existsSync', 'statSync', 'lstatSync', 'copyFileSync', 'cpSync', 'file']);
const launchers = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync', 'execSync', 'exec']);
export const sourceKey = (file: string, source: string) => file + ':' + createHash('sha256').update(source).digest('hex');

/** Parse immutable source strings, including deleted versions, without running repository code. */
export async function discoverPathReferences(entries: readonly (readonly [string, string])[]): Promise<ReadonlyMap<string, PathReference[]>> {
  const missing = [...new Map(entries
    .filter(([file]) => /\.[cm]?[jt]sx?$/.test(file))
    .map(([file, source]) => [sourceKey(file, source), { file, source }])).entries()]
    .filter(([key]) => !cache.has(key));
  if (!missing.length) return cache;
  const virtual: Record<string, string> = {};
  const names = missing.map(([, entry], index) => {
    const name = `${index}.${entry.file.endsWith('x') ? 'tsx' : 'ts'}`;
    virtual[`${root}/${name}`] = entry.source;
    return name;
  });
  virtual[`${root}/tsconfig.json`] = JSON.stringify({ compilerOptions: { noLib: true, noResolve: true, jsx: 'preserve' }, files: names });
  const api = new API({ fs: createVirtualFileSystem(virtual) });
  let snapshot;
  try {
    snapshot = await api.updateSnapshot({ openProjects: [`${root}/tsconfig.json`] });
    const project = snapshot.getProjects()[0];
    if (!project) throw new Error('Path discovery requires a TypeScript project');
    for (let index = 0; index < missing.length; index++) {
      const [key, { file, source: text }] = missing[index]!;
      const source = await project.program.getSourceFile(`${root}/${names[index]}`);
      if (!source) throw new Error(`Path discovery could not parse ${file}`);
      const product = file.startsWith('src/');
      const { nodes, bindingFor, op, values, certain } = createPathEvaluator(source, root, file, product ? '/__target_repository__' : root);
      const evidence: SourceEvidence[] = [];
      for (const node of nodes) {
        for (const range of [...(getLeadingCommentRanges(text, node.pos) ?? []), ...(getTrailingCommentRanges(text, node.getEnd()) ?? [])]) {
          evidence.push({ start: range.pos, end: range.end, reason: 'comment-not-code' });
        }
        if (isStringLiteralLikeNode(node)) {
          const parent = node.parent;
          if (parent && isPropertyAccessExpression(parent) && parent.expression === node && parent.name.text === 'length') {
            evidence.push({ start: node.getStart(), end: node.getEnd(), reason: 'string-length-only' });
          }
          if (parent && isCallExpression(parent) && isPropertyAccessExpression(parent.expression)
            && ['startsWith', 'endsWith'].includes(parent.expression.name.text) && parent.arguments[0] === node) {
            evidence.push({ start: node.getStart(), end: node.getEnd(), reason: 'string-predicate-argument' });
          }
        }
      }
      sourceEvidence.set(key, evidence);
      const found = new Map<string, PathReference>();
      const add = (value: string, operation: PathReference['operation'], node: Node, proven = certain(node), filesystemRead = false) => {
        value = value.replaceAll('\\', '/');
        const rooted = proven && value.startsWith(root + '/') && !value.startsWith(root + '/*');
        if (product && !filesystemRead && !value.startsWith(root + '/')) return;
        if (value.startsWith(root + '/')) value = value.slice(root.length + 1);
        else if (value.startsWith('/')) return;
        value = value.replace(/^(?:\.\/|\*\/)+/, '').replace(/\/$/, '');
        if (filesystemRead) value = value.replace(/^(?:\.\.\/)+/, '');
        if (!value || value === '*' || value === '.' || value.startsWith('../') || value.includes('\n')) return;
        const reference = { path: value, operation, rooted, start: node.getStart(), end: node.getEnd() };
        found.set(operation + ':' + rooted + ':' + value, reference);
      };
      // Prune only a proven intermediate directory. Returned, exported, spread,
      // defaulted or otherwise opaque values retain their conservative data edge.
      const pathDerivation = (node: Node): boolean => {
        const parent = node.parent;
        if (!parent) return false;
        return ((isCallExpression(parent) || isNewExpression(parent))
          && (pathOperations.has(op(parent.expression)) || pathInspections.has(op(parent.expression))))
          || (isBinaryExpression(parent) && parent.operatorToken.kind === SyntaxKind.PlusToken);
      };
      const intermediate = (node: Node): boolean => {
        if (pathDerivation(node)) return true;
        const declaration = node.parent;
        if (!declaration || !isVariableDeclaration(declaration) || declaration.initializer !== node
          || !isIdentifier(declaration.name) || /^export\b/.test(declaration.parent.parent.getText())) return false;
        return nodes.filter(candidate => isIdentifier(candidate) && candidate !== declaration.name
          && candidate.text === declaration.name.getText() && bindingFor(candidate) === declaration).every(pathDerivation);
      };
      const object = (node: Node | undefined, seen = new Set<Node>()): Node | undefined => {
        if (!node || seen.has(node)) return undefined;
        seen.add(node);
        if (isObjectLiteralExpression(node)) return node;
        if (isIdentifier(node)) {
          const declaration = bindingFor(node);
          if (!declaration || nodes.some(candidate => isIdentifier(candidate) && candidate !== declaration.name
            && bindingFor(candidate) === declaration && !(isCallExpression(candidate.parent) && launchers.has(op(candidate.parent.expression))))) return undefined;
          return object(declaration.initializer, seen);
        }
        return undefined;
      };
      const property = (node: Node | undefined, name: string): Node | undefined => {
        const value = object(node);
        if (!value || !isObjectLiteralExpression(value)) return undefined;
        // An opaque spread can replace cwd. Keep the inherited/unknown policy.
        if (name === 'cwd' && value.properties.some(entry => (!isPropertyAssignment(entry) && !isShorthandPropertyAssignment(entry))
          || entry.name.kind === SyntaxKind.ComputedPropertyName)) return undefined;
        const entry = [...value.properties].reverse().find(entry => (isPropertyAssignment(entry) || isShorthandPropertyAssignment(entry))
          && entry.name.getText().replace(/['"]/g, '') === name);
        return entry && isPropertyAssignment(entry) ? entry.initializer : entry && isShorthandPropertyAssignment(entry) ? entry.name : undefined;
      };
      const launcherArguments = new Set<Node>();
      const enclosedByLauncher = (node: Node): boolean => {
        for (let parent: Node | undefined = node; parent; parent = parent.parent) {
          if (launcherArguments.has(parent)) return true;
        }
        return false;
      };
      const rootedFragment = (node: Node): boolean => {
        const parent = node.parent;
        return !!parent && pathDerivation(node) && certain(parent)
          && values(parent).every(path => path.startsWith('/'));
      };
      for (const node of nodes) {
        const concatenation = isBinaryExpression(node) && node.operatorToken.kind === SyntaxKind.PlusToken;
        if (concatenation || ((isCallExpression(node) || isNewExpression(node)) && pathOperations.has(op(node.expression)))) {
          const paths = values(node);
          for (const value of paths) add(value, intermediate(node) ? 'constructed' : 'data', node);
          evidence.push({ start: node.getStart(), end: node.getEnd(), reason: intermediate(node) ? 'resolved-construction' : 'resolved-path',
            paths: paths.map(path => !certain(node) && path.startsWith(root + '/') ? '*/' + path.slice(root.length + 1) : path) });
        }
        if (isCallExpression(node) || isNewExpression(node)) {
          const operation = op(node.expression);
          if (node.expression.kind === SyntaxKind.ImportKeyword) for (const value of values(node.arguments?.[0])) {
            if (value.startsWith('.')) {
              const target = resolve(root, dirname(file), value);
              for (const path of [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`, `${target}/index.tsx`]) add(path, 'execute', node, certain(node.arguments?.[0]));
            }
          }
          if (readers.has(operation)) for (const value of values(node.arguments?.[0])) add(value, 'data', node, certain(node.arguments?.[0]), true);
          if (launchers.has(operation)) {
            const args = [...(node.arguments ?? [])];
            const options = args.find(arg => object(arg));
            const cwdNode = property(options, 'cwd');
            const cwd = values(cwdNode);
            const knownCwd = certain(cwdNode) && cwd.length > 0 && cwd.every(value => value.startsWith('/') && !value.includes('*'));
            const command = property(options, 'cmd');
            const argumentsToResolve = [...args.filter(arg => arg !== options), ...(command ? [command] : [])];
            const commandArray = command ?? (args[0] && isArrayLiteralExpression(args[0]) ? args[0] : undefined);
            const array = commandArray && isArrayLiteralExpression(commandArray) ? commandArray.elements : undefined;
            const executable = array?.[0] ?? args[0];
            const argv = array ? [...array].slice(1) : args[1] && isArrayLiteralExpression(args[1]) ? [...args[1].elements] : [];
            const interpreter = executable?.getText() === 'process.execPath'
              || (certain(executable) && values(executable).every(value => /(?:^|\/)(?:bun|node|deno|tsx|ts-node|bash|sh|zsh|python(?:3)?)$/.test(value)));
            const runSubcommand = certain(executable) && values(executable).every(value => /(?:^|\/)(?:bun|deno)$/.test(value))
              && values(argv[0]).length === 1 && values(argv[0])[0] === 'run';
            const script = runSubcommand ? argv[1] : argv[0];
            const target = interpreter ? script : executable;
            const explicitTarget = !!target && certain(target) && values(target).every(value =>
              !value.startsWith('-') && (value.includes('/') || (interpreter && /\.[\w]+$/.test(value))));
            for (const arg of argumentsToResolve.flatMap(arg => isArrayLiteralExpression(arg) ? [...arg.elements] : [arg])) {
              launcherArguments.add(arg);
              // A script may resolve its data arguments through another root.
              // Shell command strings and opaque argv arrays also keep aliases.
              const rootedTarget = !['exec', 'execSync'].includes(operation) && knownCwd && explicitTarget && arg === target;
              const paths = values(arg).flatMap(value => !rootedTarget || value.startsWith('/') ? [value] : cwd.map(directory => resolve(directory, value)));
              for (const path of paths) add(path, 'execute', arg, rootedTarget);
              if (rootedTarget) evidence.push({ start: arg.getStart(), end: arg.getEnd(), reason: 'resolved-launcher', paths });
              else walk(arg, child => { if (isStringLiteralLikeNode(child)) add(child.text, 'execute', child, false); });
            }
          }
        }
        if (!product && isStringLiteralLikeNode(node) && !rootedFragment(node) && !enclosedByLauncher(node)
          && (/[\/\\]/.test(node.text) || /^[\w.-]+\.[\w]+$/.test(node.text))) add(node.text, 'literal', node);
      }
      cache.set(key, [...found.values()]);
    }
  } finally {
    if (snapshot) await snapshot.dispose();
    await api.close();
  }
  return cache;
}
