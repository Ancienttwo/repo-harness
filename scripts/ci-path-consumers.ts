import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { API } from 'typescript/unstable/async';
import { createVirtualFileSystem } from 'typescript/unstable/fs';
import { isCallExpression, isPropertyAccessExpression, isIdentifier, isVariableDeclaration, isNewExpression, isStringLiteralLikeNode, SyntaxKind, type Node } from 'typescript/unstable/ast';
import { getLeadingCommentRanges, getTrailingCommentRanges } from 'typescript/unstable/ast/scanner';
import { createPathEvaluator } from './lib/path-values';

export type PathReference = { path: string; operation: 'data' | 'execute' | 'literal' | 'constructed' };
export type SourceEvidence = { start: number; end: number; reason: string };
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
      const { nodes, bindingFor, op, values } = createPathEvaluator(source, root, file, product ? '/__target_repository__' : root);
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
      const add = (value: string, operation: PathReference['operation']) => {
        value = value.replaceAll('\\', '/');
        if (product && !value.startsWith(root + '/')) return;
        if (value.startsWith(root + '/')) value = value.slice(root.length + 1);
        else if (value.startsWith('/')) return;
        value = value.replace(/^(?:\.\/|\*\/)+/, '').replace(/\/$/, '');
        if (!value || value === '*' || value === '.' || value.startsWith('../') || value.includes('\n')) return;
        const reference = { path: value, operation };
        found.set(operation + ':' + value, reference);
      };
      // Prune only a proven intermediate directory. Returned, exported, spread,
      // defaulted or otherwise opaque values retain their conservative data edge.
      const pathDerivation = (node: Node): boolean => {
        const parent = node.parent;
        return !!parent && (isCallExpression(parent) || isNewExpression(parent))
          && (pathOperations.has(op(parent.expression)) || pathInspections.has(op(parent.expression)));
      };
      const intermediate = (node: Node): boolean => {
        if (pathDerivation(node)) return true;
        const declaration = node.parent;
        if (!declaration || !isVariableDeclaration(declaration) || declaration.initializer !== node
          || !isIdentifier(declaration.name) || /^export\b/.test(declaration.parent.parent.getText())) return false;
        return nodes.filter(candidate => isIdentifier(candidate) && candidate !== declaration.name
          && candidate.text === declaration.name.getText() && bindingFor(candidate) === declaration).every(pathDerivation);
      };
      for (const node of nodes) {
        if (isCallExpression(node) || isNewExpression(node)) {
          const operation = op(node.expression);
          if (node.expression.kind === SyntaxKind.ImportKeyword) for (const value of values(node.arguments?.[0])) {
            if (value.startsWith('.')) {
              const target = resolve(root, dirname(file), value);
              for (const path of [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`, `${target}/index.tsx`]) add(path, 'execute');
            }
          }
          if (pathOperations.has(operation)) for (const value of values(node)) add(value, intermediate(node) ? 'constructed' : 'data');
          if (readers.has(operation)) for (const value of values(node.arguments?.[0])) add(value, 'data');
          if (launchers.has(operation)) for (const arg of node.arguments ?? []) for (const value of values(arg)) add(value, 'execute');
        }
        if (!product && isStringLiteralLikeNode(node) && (/[\/\\]/.test(node.text) || /^[\w.-]+\.[\w]+$/.test(node.text))) add(node.text, 'literal');
      }
      cache.set(key, [...found.values()]);
    }
  } finally {
    if (snapshot) await snapshot.dispose();
    await api.close();
  }
  return cache;
}
