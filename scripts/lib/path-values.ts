import { dirname, resolve, join } from 'node:path';
import { isArrowFunction, isFunctionExpression, isTemplateExpression, isArrayLiteralExpression, isCallExpression, isForOfStatement, isFunctionDeclaration, isIdentifier, isImportDeclaration, isNewExpression, isPropertyAccessExpression, isStringLiteralLikeNode, isVariableDeclaration, SyntaxKind, type Node, type SourceFile } from 'typescript/unstable/ast';

const nameOf = (node: Node): string => isIdentifier(node) ? node.text : isPropertyAccessExpression(node) ? node.name.text : '';
export function walk(node: Node, visit: (node: Node) => void) { visit(node); node.forEachChild(child => { walk(child, visit); }); }

/** Bounded lexical evaluation. The caller supplies the meaning of process.cwd(). */
export function createPathEvaluator(source: SourceFile, repoRoot: string, file: string, cwdRoot = repoRoot) {
  const nodes: Node[] = [];
  walk(source, node => nodes.push(node));
  const declarations = nodes.filter(isVariableDeclaration);
  const calls = nodes.filter(isCallExpression);
  const functions = nodes.filter(node => isFunctionDeclaration(node) || isArrowFunction(node) || isFunctionExpression(node));
  const aliases = new Map<string, string>();
  for (const node of nodes) {
    if (isImportDeclaration(node)) {
      // Imported read/path aliases retain their operation name; namespace calls already use the property name.
      for (const match of node.getText().matchAll(/\b(readFileSync|readFile|writeFileSync|writeFile|readdirSync|readdir|existsSync|copyFileSync|cpSync|spawn|spawnSync|execFile|execFileSync|execSync|exec|join|resolve|dirname|fileURLToPath)\s+as\s+(\w+)/g)) aliases.set(match[2]!, match[1]!);
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
        const functionName = isFunctionDeclaration(fn) ? fn.name?.text : isVariableDeclaration(fn.parent) && isIdentifier(fn.parent.name) ? fn.parent.name.text : undefined;
        if (index >= 0 && ancestor(fn, node) && functionName) return calls.filter(call => nameOf(call.expression) === functionName).flatMap(call => recur(call.arguments[index]));
      }
      return ['*'];
    }
    if (isCallExpression(node) || isNewExpression(node)) {
      const args = node.arguments ?? [];
      const operation = op(node.expression);
      if (operation === 'cwd' && node.expression.getText() === 'process.cwd') return [cwdRoot];
      if (operation === 'dirname') return recur(args[0]).map(value => value === '*' ? '*' : dirname(value));
      if (operation === 'fileURLToPath') return recur(args[0]);
      if (operation === 'URL') return recur(args[0]).flatMap(value => recur(args[1]).map(base => resolve(dirname(base), value)));
      if (operation === 'join' || operation === 'resolve') {
        let combinations: string[][] = [[]];
        for (const arg of args) {
          combinations = combinations.flatMap(parts => [...new Set(recur(arg))].map(value => [...parts, value]));
          if (combinations.length > 4096) throw new Error(`Path expansion exceeds bounded analysis in ${file}: ${node.getText().slice(0, 160)}`);
        }
        return combinations.map(parts => operation === 'resolve' ? resolve(repoRoot, ...parts) : join(...parts));
      }
      // Walk/list/read wrappers forward a path argument; filesystem temporaries do not.
      if (/^(?:mkdtemp|tmpdir|createTemp|withTemp)/i.test(operation)) return ['*'];
      return args.flatMap(recur);
    }
    if (isTemplateExpression(node)) {
      let paths = [node.head.text];
      for (const span of node.templateSpans) {
        paths = paths.flatMap(prefix => recur(span.expression).map(value => prefix + value + span.literal.text));
        if (paths.length > 4096) throw new Error(`Path expansion exceeds bounded analysis in ${file}: ${node.getText().slice(0, 160)}`);
      }
      return paths;
    }
    // Unwrap assertions and parentheses.
    const children: Node[] = [];
    node.forEachChild(child => { children.push(child); });
    return children.length === 1 ? recur(children[0]) : ['*'];
  };
  return { nodes, calls, declarations, op, values };
}
