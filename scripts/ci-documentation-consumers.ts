#!/usr/bin/env bun
import { existsSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { API } from 'typescript/unstable/async';
import { isArrayLiteralExpression, isCallExpression, isForOfStatement, isFunctionDeclaration, isIdentifier, isImportDeclaration, isNewExpression, isPropertyAccessExpression, isStringLiteralLikeNode, isVariableDeclaration, SyntaxKind, type Node, type SourceFile } from 'typescript/unstable/ast';
import { isDocumentationPath } from './select-ci-coverage';

const readers = new Set(['readFileSync', 'readFile', 'readdirSync', 'readdir', 'existsSync', 'statSync', 'lstatSync', 'copyFileSync', 'cpSync', 'file']);
const nameOf = (node: Node): string => isIdentifier(node) ? node.text : isPropertyAccessExpression(node) ? node.name.text : '';
function walk(node: Node, visit: (node: Node) => void) { visit(node); node.forEachChild(child => { walk(child, visit); }); }

/** Bounded lexical path flow, not arbitrary execution: unresolved rooted reads are conservative. */
export function sourceConsumesDocumentation(source: SourceFile, repoRoot: string, file: string, trackedDocuments: ReadonlySet<string>): boolean {
  const nodes: Node[] = [];
  walk(source, node => nodes.push(node));
  const declarations = nodes.filter(isVariableDeclaration);
  const calls = nodes.filter(isCallExpression);
  const functions = nodes.filter(isFunctionDeclaration);
  const aliases = new Map<string, string>();
  for (const node of nodes) {
    if (isImportDeclaration(node)) {
      // Imported read/path aliases retain their operation name; namespace calls already use the property name.
      for (const match of node.getText().matchAll(/\b(readFileSync|readFile|writeFileSync|writeFile|readdirSync|readdir|existsSync|copyFileSync|cpSync|join|resolve|dirname|fileURLToPath)\s+as\s+(\w+)/g)) aliases.set(match[2]!, match[1]!);
    }
  }
  const op = (node: Node) => aliases.get(nameOf(node)) ?? nameOf(node);
  const scope = (node: Node): Node => {
    let current = node.parent;
    while (current && current.kind !== SyntaxKind.Block && current.kind !== SyntaxKind.SourceFile && !functions.includes(current as any)) current = current.parent;
    return current ?? source;
  };
  const ancestor = (outer: Node, inner: Node): boolean => { for (let node: Node | undefined = inner; node; node = node.parent) if (node === outer) return true; return false; };
  const values = (node: Node | undefined, depth = 0, seen = new Set<Node>()): string[] => {
    if (!node || depth > 18 || seen.has(node)) return ['*'];
    const next = new Set(seen).add(node);
    const recur = (child: Node | undefined) => values(child, depth + 1, next);
    if (isStringLiteralLikeNode(node)) return [node.text];
    if (node.getText() === 'import.meta.dir' || node.getText() === '__dirname') return [dirname(resolve(repoRoot, file))];
    if (node.getText() === 'import.meta.url') return [resolve(repoRoot, file)];
    if (isArrayLiteralExpression(node)) return node.elements.flatMap(recur);
    if (isIdentifier(node)) {
      const bindings = declarations.filter(decl => isIdentifier(decl.name) && decl.name.text === node.text && ancestor(scope(decl), node));
      const binding = bindings.sort((a, b) => ancestor(scope(a), scope(b)) ? 1 : -1)[0];
      if (binding?.initializer) return recur(binding.initializer);
      if (binding) {
        let parent: Node | undefined = binding.parent;
        while (parent && !isForOfStatement(parent) && parent !== source) parent = parent.parent;
        if (parent && isForOfStatement(parent)) return recur(parent.expression);
      }
      for (const fn of functions) {
        const index = fn.parameters.findIndex(param => isIdentifier(param.name) && param.name.text === node.text);
        if (index >= 0 && ancestor(fn, node) && fn.name) return calls.filter(call => nameOf(call.expression) === fn.name!.text).flatMap(call => recur(call.arguments[index]));
      }
      return ['*'];
    }
    if (isCallExpression(node) || isNewExpression(node)) {
      const args = node.arguments ?? [];
      const operation = op(node.expression);
      if (operation === 'cwd' && node.expression.getText() === 'process.cwd') return [repoRoot];
      if (operation === 'dirname') return recur(args[0]).map(value => value === '*' ? '*' : dirname(value));
      if (operation === 'fileURLToPath') return recur(args[0]);
      if (operation === 'URL') return recur(args[0]).flatMap(value => recur(args[1]).map(base => resolve(dirname(base), value)));
      if (operation === 'join' || operation === 'resolve') {
        let combinations: string[][] = [[]];
        for (const arg of args) {
          combinations = combinations.flatMap(parts => [...new Set(recur(arg))].map(value => [...parts, value]));
          if (combinations.length > 256) throw new Error(`Documentation path expansion exceeds bounded analysis in ${file}`);
        }
        return combinations.map(parts => operation === 'resolve' ? resolve(repoRoot, ...parts) : join(...parts));
      }
      // Walk/list/read wrappers forward a path argument; filesystem temporaries do not.
      if (/^(?:mkdtemp|tmpdir|createTemp|withTemp)/i.test(operation)) return ['*'];
      return args.flatMap(recur);
    }
    // Preserve a literal prefix in template paths and unwrap assertions/parentheses.
    const text = node.getText();
    if (text.startsWith('`')) return [text.slice(1, -1).replace(/\$\{[^}]*\}/g, '*')];
    const children: Node[] = [];
    node.forEachChild(child => { children.push(child); });
    return children.length === 1 ? recur(children[0]) : ['*'];
  };
  const family = (path: string) => isDocumentationPath(path.replace(/\*/g, 'document.md')) || isDocumentationPath(`${path.replace(/\/$/, '')}/document.md`);
  const literals = nodes.filter(isStringLiteralLikeNode).some(node => family(node.text));
  for (const call of calls) {
    if (!readers.has(op(call.expression))) continue;
    for (const value of values(call.arguments[0])) {
      const path = isAbsolute(value) ? relative(repoRoot, value) : value;
      if (path.startsWith('../')) continue;
      if (family(path)) return true;
      if (isAbsolute(value) && (path === '*' || path === '') && literals) return true;
    }
  }
  // named-checkout-document-reference: fixture/generated reads can assert a named
  // tracked docs/ guide's contract. Fixture tasks/plans ledgers do not establish
  // that guide relationship. Include these conservatively when the test also
  // resolves checkout code, without promoting arbitrary fixture docs to consumers.
  const resolvesCheckout = declarations.some(decl => values(decl.initializer).some(value =>
    isAbsolute(value) && !relative(repoRoot, value).startsWith('../') && !value.includes('*') && existsSync(value)));
  if (resolvesCheckout) {
    const authoredGuides = new Set<string>();
    for (const call of calls) {
      if (!['writeFile', 'writeFileSync'].includes(op(call.expression)) || !call.arguments[0]) continue;
      walk(call.arguments[0], node => {
        if (isStringLiteralLikeNode(node) && trackedDocuments.has(node.text)) authoredGuides.add(node.text);
      });
    }
    for (const call of calls) {
      if (!readers.has(op(call.expression)) || !call.arguments[0]) continue;
      let named = false;
      walk(call.arguments[0], node => {
        if (isStringLiteralLikeNode(node) && node.text.startsWith('docs/') && trackedDocuments.has(node.text) && !authoredGuides.has(node.text)) named = true;
      });
      if (named) return true;
    }
  }
  return false;
}

export async function discoverDocumentationConsumers(repoRoot = resolve(import.meta.dir, '..'), trackedDocuments?: ReadonlySet<string>): Promise<string[]> {
  if (!trackedDocuments) {
    const result = spawnSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Documentation discovery requires tracked Git paths: ${result.stderr}`);
    trackedDocuments = new Set(result.stdout.split('\0').filter(isDocumentationPath));
  }
  const files: string[] = [];
  function collect(dir: string) {
    for (const entry of readdirSync(resolve(repoRoot, dir), { withFileTypes: true })) {
      const file = `${dir}/${entry.name}`;
      if (entry.isDirectory()) collect(file);
      else if (/\.[cm]?tsx?$/.test(file)) files.push(file);
    }
  }
  collect('tests');
  const api = new API();
  const snapshot = await api.updateSnapshot({ openProjects: [resolve(repoRoot, 'tsconfig.json')] });
  try {
    const project = snapshot.getProjects().find(project => resolve(project.configFileName) === resolve(repoRoot, 'tsconfig.json'));
    if (!project) throw new Error('Documentation discovery requires the repository TypeScript project');
    const syntaxErrors = await project.program.getSyntacticDiagnostics();
    if (syntaxErrors.length) throw new Error(`Documentation discovery requires parseable TypeScript: ${syntaxErrors[0]!.fileName}: ${syntaxErrors[0]!.text}`);
    const sources = new Map<string, SourceFile>();
    for (const file of files) {
      const source = await project.program.getSourceFile(resolve(repoRoot, file));
      if (!source) throw new Error(`Documentation discovery could not parse ${file}`);
      sources.set(file, source);
    }
    const consumers = new Set([...sources].filter(([file, source]) => sourceConsumesDocumentation(source, repoRoot, file, trackedDocuments!)).map(([file]) => file));
    // Propagate local test-helper dependencies without executing imports.
    for (let changed = true; changed;) {
      changed = false;
      for (const [file, source] of sources) {
        if (consumers.has(file)) continue;
        for (const statement of source.statements) {
          if (!isImportDeclaration(statement) || !isStringLiteralLikeNode(statement.moduleSpecifier) || !statement.moduleSpecifier.text.startsWith('.')) continue;
          const target = relative(repoRoot, resolve(repoRoot, dirname(file), statement.moduleSpecifier.text));
          if ([target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`].some(path => consumers.has(path))) { consumers.add(file); changed = true; }
        }
      }
    }
    return [...consumers].filter(file => /\.test\.tsx?$/.test(file)).sort();
  } finally { await snapshot.dispose(); await api.close(); }
}

if (import.meta.main) {
  if (process.argv.slice(2).join(' ') !== '--list') throw new Error('Usage: bun scripts/ci-documentation-consumers.ts --list');
  console.log((await discoverDocumentationConsumers()).join('\n'));
}
