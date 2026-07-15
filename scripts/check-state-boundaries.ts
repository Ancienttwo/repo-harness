#!/usr/bin/env bun

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { API, type Project, type Snapshot } from 'typescript/unstable/async';
import {
  SyntaxKind,
  isArrayBindingPattern,
  isCallExpression,
  isClassDeclaration,
  isEnumDeclaration,
  isExportDeclaration,
  isExternalModuleReference,
  isFunctionDeclaration,
  isIdentifier,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isInterfaceDeclaration,
  isMethodDeclaration,
  isNamedImports,
  isNamespaceImport,
  isNewExpression,
  isObjectBindingPattern,
  isPropertyAccessExpression,
  isRegularExpressionLiteral,
  isStringLiteralLikeNode,
  isTaggedTemplateExpression,
  isTypeAliasDeclaration,
  isVariableDeclaration,
  type BindingName,
  type Node,
  type SourceFile,
} from 'typescript/unstable/ast';

const CORE_ROOTS = [
  'src/core/state',
  'src/core/workflow',
  'src/core/capabilities',
] as const;

const CAPABILITY_SOURCE = 'src/core/capabilities/registry.ts';
const CAPABILITY_SCRIPT = 'scripts/capability-resolver.ts';
const CAPABILITY_PROJECTION = 'assets/templates/helpers/capability-resolver.ts';
const STATE_SNAPSHOT_ADAPTER = 'src/cli/hook/state-snapshot.ts';
const RETIRED_WORKFLOW_PROFILE_ADAPTER = 'src/cli/hook/workflow-profile.ts';

const CANONICAL_SYMBOL_OWNERS: Readonly<Record<string, string>> = {
  WorkflowProfile: 'src/core/workflow/profile.ts',
  WorkflowOperationKind: 'src/core/workflow/profile.ts',
  WorkflowProfileInput: 'src/core/workflow/profile.ts',
  WorkflowProfileSignals: 'src/core/workflow/profile.ts',
  WorkflowProfileResolution: 'src/core/workflow/profile.ts',
  WorkflowProfileError: 'src/core/workflow/profile.ts',
  WorkflowProfileResult: 'src/core/workflow/profile.ts',
  StrictRiskCategory: 'src/core/workflow/profile.ts',
  resolveWorkflowProfile: 'src/core/workflow/profile.ts',
  CAPABILITY_REGISTRY_VERSION: CAPABILITY_SOURCE,
  ContractFiles: CAPABILITY_SOURCE,
  Capability: CAPABILITY_SOURCE,
  CapabilityRegistry: CAPABILITY_SOURCE,
  CapabilityRegistryDiagnosticCode: CAPABILITY_SOURCE,
  CapabilityRegistryDiagnostic: CAPABILITY_SOURCE,
  CapabilityRegistryResolution: CAPABILITY_SOURCE,
  CapabilityPathMatch: CAPABILITY_SOURCE,
  CapabilityPathMatchResult: CAPABILITY_SOURCE,
  CapabilityPathResolution: CAPABILITY_SOURCE,
  normalizeCapabilityPath: CAPABILITY_SOURCE,
  validateCapabilityRegistryValue: CAPABILITY_SOURCE,
  parseCapabilityRegistry: CAPABILITY_SOURCE,
  matchCapabilityPath: CAPABILITY_SOURCE,
  resolveCapabilityPaths: CAPABILITY_SOURCE,
  stripWrappingQuotes: 'src/core/state/artifact-parsers.ts',
  markdownHeader: 'src/core/state/artifact-parsers.ts',
  markdownBullet: 'src/core/state/artifact-parsers.ts',
  markdownSection: 'src/core/state/artifact-parsers.ts',
  markdownSectionHeader: 'src/core/state/artifact-parsers.ts',
  parseAllowedPaths: 'src/core/state/artifact-parsers.ts',
  firstOpenTask: 'src/core/state/artifact-parsers.ts',
  parseIsoOrLocalTimestamp: 'src/core/state/artifact-parsers.ts',
  planStatusFromText: 'src/core/state/artifact-parsers.ts',
  planSlugFromPath: 'src/core/state/artifact-parsers.ts',
  artifactStemFromPlan: 'src/core/state/artifact-parsers.ts',
  evidenceContractComplete: 'src/core/state/artifact-parsers.ts',
  planContractRelationshipConflicts: 'src/core/state/artifact-parsers.ts',
  EffectiveStateV1: 'src/core/state/types.ts',
  EffectiveState: 'src/core/state/types.ts',
  EffectiveStateInputs: 'src/core/state/project-effective-state.ts',
  projectEffectiveState: 'src/core/state/project-effective-state.ts',
} as const;

const REQUIRED_CAPABILITY_IMPORTS = new Set([
  'matchCapabilityPath',
  'normalizeCapabilityPath',
  'parseCapabilityRegistry',
]);

const FORBIDDEN_CORE_MODULES = [
  'fs',
  'path',
  'child_process',
  'process',
  'commander',
  '@modelcontextprotocol/sdk',
] as const;

const PROCESS_EXECUTION_CALLS = new Set([
  'Bun.$',
  'Bun.spawn',
  'Bun.spawnSync',
  'Deno.Command',
  '$',
  'exec',
  'execFile',
  'execFileSync',
  'execSync',
  'fork',
  'process.abort',
  'process.chdir',
  'process.exit',
  'process.kill',
  'spawn',
  'spawnSync',
]);

const CLI_AUTHORITY_NAME = /^(?:(?:calculate|compute|derive|parse|validate|match|resolve).*WorkflowProfile|(?:parse|validate|match|resolve).*Capability(?:Registry|Path|Paths)|(?:extract|parse).*(?:AllowedPaths|ArtifactAuthority|WorkflowArtifact)|(?:get|parse|resolve).*PlanStatus|artifactStemFromPlan(?:Path)?|evidenceContractComplete|planContractRelationshipConflicts|markdown(?:Header|Bullet|Section|SectionHeader)|firstOpenTask|parseIsoOrLocalTimestamp)$/i;
const SNAPSHOT_AUTHORITY_NAME = /(?:markdown|allowedpaths|parseiso|firstopentask|state(?:lock|cache|version)|git(?:common|dir|head|rev|status)|readfilesync|writefilesync|renameSync|spawnSync|execSync)/i;
const SNAPSHOT_FORBIDDEN_IMPORT = /(?:artifact-parsers|workflow\/profile|capabilities\/registry|state-lock|state-cache|git-state-version-store|collect-state-inputs)/;

export interface StateBoundaryViolation {
  readonly code: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

export interface StateBoundaryCheckResult {
  readonly ok: boolean;
  readonly filesChecked: number;
  readonly violations: readonly StateBoundaryViolation[];
}

interface ParsedSources {
  readonly sources: ReadonlyMap<string, SourceFile>;
  readonly violations: readonly StateBoundaryViolation[];
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function relPath(repoRoot: string, absolutePath: string): string {
  return normalizePath(relative(repoRoot, absolutePath));
}

function violation(
  code: string,
  file: string,
  message: string,
  line = 1,
  column = 1,
): StateBoundaryViolation {
  return { code, file, line, column, message };
}

function nodeViolation(
  repoRoot: string,
  source: SourceFile,
  node: Node,
  code: string,
  message: string,
): StateBoundaryViolation {
  const position = source.getLineAndCharacterOfPosition(node.getStart(source));
  return violation(
    code,
    relPath(repoRoot, source.fileName),
    message,
    position.line + 1,
    position.character + 1,
  );
}

function collectTypeScriptFiles(
  repoRoot: string,
  relativeRoot: string,
  violations: StateBoundaryViolation[],
): string[] {
  const absoluteRoot = resolve(repoRoot, relativeRoot);
  if (!existsSync(absoluteRoot)) {
    violations.push(violation(
      'REQUIRED_PATH_MISSING',
      relativeRoot,
      `required architecture path is missing: ${relativeRoot}`,
    ));
    return [];
  }
  if (!lstatSync(absoluteRoot).isDirectory()) {
    violations.push(violation(
      'REQUIRED_PATH_INVALID',
      relativeRoot,
      `required architecture path is not a directory: ${relativeRoot}`,
    ));
    return [];
  }

  const files: string[] = [];
  const stack = [absoluteRoot];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absoluteEntry = resolve(current, entry.name);
      if (entry.isSymbolicLink()) {
        violations.push(violation(
          'SOURCE_SYMLINK_FORBIDDEN',
          relPath(repoRoot, absoluteEntry),
          'source-boundary checks do not follow symbolic links',
        ));
      } else if (entry.isDirectory()) {
        stack.push(absoluteEntry);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(absoluteEntry);
      }
    }
  }
  return files.sort((left, right) => relPath(repoRoot, left).localeCompare(relPath(repoRoot, right)));
}

function visit(node: Node, callback: (node: Node) => void): void {
  callback(node);
  node.forEachChild((child) => {
    visit(child, callback);
    return undefined;
  });
}

function importSpecifier(node: Node): string | null {
  if (isImportDeclaration(node) || isExportDeclaration(node)) {
    return node.moduleSpecifier && isStringLiteralLikeNode(node.moduleSpecifier)
      ? node.moduleSpecifier.text
      : null;
  }
  if (isImportEqualsDeclaration(node) && isExternalModuleReference(node.moduleReference)) {
    const expression = node.moduleReference.expression;
    return expression && isStringLiteralLikeNode(expression) ? expression.text : null;
  }
  return null;
}

function callName(node: Node): string | null {
  if (isIdentifier(node)) return node.text;
  if (!isPropertyAccessExpression(node)) return null;
  const receiver = callName(node.expression);
  return receiver ? `${receiver}.${node.name.text}` : node.name.text;
}

function forbiddenCoreModule(specifier: string): string | null {
  const normalized = specifier.startsWith('node:') ? specifier.slice('node:'.length) : specifier;
  return FORBIDDEN_CORE_MODULES.find(
    (candidate) => normalized === candidate || normalized.startsWith(`${candidate}/`),
  ) ?? null;
}

function reverseLayerImport(repoRoot: string, source: SourceFile, specifier: string): string | null {
  let target = normalizePath(specifier);
  if (specifier.startsWith('.')) {
    target = relPath(repoRoot, resolve(dirname(source.fileName), specifier));
  }
  for (const forbidden of ['src/cli', 'src/effects']) {
    if (target === forbidden || target.startsWith(`${forbidden}/`)) return forbidden;
  }
  return null;
}

function checkCoreDependencies(
  repoRoot: string,
  source: SourceFile,
  violations: StateBoundaryViolation[],
): void {
  const inspectModule = (node: Node, specifier: string): void => {
    const forbidden = forbiddenCoreModule(specifier);
    if (forbidden) {
      violations.push(nodeViolation(
        repoRoot,
        source,
        node,
        'CORE_FORBIDDEN_IMPORT',
        `pure core cannot import ${specifier} (forbidden runtime authority: ${forbidden})`,
      ));
    }
    const reverse = reverseLayerImport(repoRoot, source, specifier);
    if (reverse) {
      violations.push(nodeViolation(
        repoRoot,
        source,
        node,
        'CORE_REVERSE_IMPORT',
        `pure core cannot depend on adapter/effect layer ${reverse}: ${specifier}`,
      ));
    }
  };

  visit(source, (node) => {
    const staticSpecifier = importSpecifier(node);
    if (staticSpecifier !== null) inspectModule(node, staticSpecifier);

    if (isCallExpression(node)) {
      const dynamicImport = node.expression.kind === SyntaxKind.ImportKeyword;
      const requireCall = isIdentifier(node.expression) && node.expression.text === 'require';
      if (dynamicImport || requireCall) {
        const argument = node.arguments[0];
        if (!argument || !isStringLiteralLikeNode(argument)) {
          violations.push(nodeViolation(
            repoRoot,
            source,
            node,
            'CORE_DYNAMIC_IMPORT_UNRESOLVED',
            'pure core dynamic module loads must use a literal so the boundary can be verified',
          ));
        } else {
          inspectModule(node, argument.text);
        }
      }

      const name = callName(node.expression);
      if (
        name &&
        PROCESS_EXECUTION_CALLS.has(name) &&
        (isIdentifier(node.expression) || name.includes('.'))
      ) {
        violations.push(nodeViolation(
          repoRoot,
          source,
          node,
          'CORE_PROCESS_EXECUTION',
          `pure core cannot execute processes or terminate/change the host process: ${name}`,
        ));
      }
    }

    if (isNewExpression(node) && callName(node.expression) === 'Deno.Command') {
      violations.push(nodeViolation(
        repoRoot,
        source,
        node,
        'CORE_PROCESS_EXECUTION',
        'pure core cannot execute processes: Deno.Command',
      ));
    }

    if (isTaggedTemplateExpression(node)) {
      const name = callName(node.tag);
      if (name === '$' || name === 'Bun.$') {
        violations.push(nodeViolation(
          repoRoot,
          source,
          node,
          'CORE_PROCESS_EXECUTION',
          `pure core cannot execute shell templates: ${name}`,
        ));
      }
    }
  });
}

function checkEffectDependencies(
  repoRoot: string,
  source: SourceFile,
  violations: StateBoundaryViolation[],
): void {
  const inspectModule = (node: Node, specifier: string): void => {
    if (reverseLayerImport(repoRoot, source, specifier) !== 'src/cli') return;
    violations.push(nodeViolation(
      repoRoot,
      source,
      node,
      'EFFECTS_REVERSE_IMPORT',
      `effect modules cannot depend on CLI adapters: ${specifier}`,
    ));
  };

  visit(source, (node) => {
    const staticSpecifier = importSpecifier(node);
    if (staticSpecifier !== null) inspectModule(node, staticSpecifier);
    if (!isCallExpression(node)) return;
    const dynamicImport = node.expression.kind === SyntaxKind.ImportKeyword;
    const requireCall = isIdentifier(node.expression) && node.expression.text === 'require';
    if (!dynamicImport && !requireCall) return;
    const argument = node.arguments[0];
    if (!argument || !isStringLiteralLikeNode(argument)) {
      violations.push(nodeViolation(
        repoRoot,
        source,
        node,
        'EFFECTS_DYNAMIC_IMPORT_UNRESOLVED',
        'effect dynamic module loads must use a literal so reverse CLI dependencies can be verified',
      ));
      return;
    }
    inspectModule(node, argument.text);
  });
}

function bindingNames(name: BindingName): string[] {
  if (isIdentifier(name)) return [name.text];
  if (!isObjectBindingPattern(name) && !isArrayBindingPattern(name)) return [];
  return name.elements.flatMap((element) =>
    element.name ? bindingNames(element.name) : []);
}

function declarationNames(node: Node): string[] {
  if (isVariableDeclaration(node)) return bindingNames(node.name);
  if (
    isFunctionDeclaration(node) ||
    isClassDeclaration(node) ||
    isInterfaceDeclaration(node) ||
    isTypeAliasDeclaration(node) ||
    isEnumDeclaration(node)
  ) {
    return node.name ? [node.name.text] : [];
  }
  if (isMethodDeclaration(node) && node.name) {
    return isIdentifier(node.name) ? [node.name.text] : [node.name.getText()];
  }
  return [];
}

function checkCanonicalDeclarations(
  repoRoot: string,
  sources: ReadonlyMap<string, SourceFile>,
  violations: StateBoundaryViolation[],
): void {
  const ownerCounts = new Map<string, number>();
  for (const [file, source] of sources) {
    visit(source, (node) => {
      for (const name of declarationNames(node)) {
        const owner = CANONICAL_SYMBOL_OWNERS[name];
        if (owner) {
          if (file === owner) {
            ownerCounts.set(name, (ownerCounts.get(name) ?? 0) + 1);
          } else {
            violations.push(nodeViolation(
              repoRoot,
              source,
              node,
              'CANONICAL_SYMBOL_OWNER',
              `${name} may only be declared by ${owner}; found a competing declaration`,
            ));
          }
          continue;
        }
        if (file.startsWith('src/cli/') && CLI_AUTHORITY_NAME.test(name)) {
          violations.push(nodeViolation(
            repoRoot,
            source,
            node,
            'CLI_AUTHORITY_REDECLARATION',
            `CLI adapter declaration ${name} appears to reimplement workflow, capability, or artifact authority`,
          ));
        }
      }
    });
  }

  for (const [name, owner] of Object.entries(CANONICAL_SYMBOL_OWNERS)) {
    const count = ownerCounts.get(name) ?? 0;
    if (count !== 1) {
      violations.push(violation(
        'CANONICAL_SYMBOL_MISSING',
        owner,
        `${owner} must declare canonical symbol ${name} exactly once; found ${count}`,
      ));
    }
  }
}

function checkCapabilityScript(
  repoRoot: string,
  source: SourceFile | undefined,
  violations: StateBoundaryViolation[],
): void {
  if (!source) return;
  const imported = new Set<string>();
  for (const statement of source.statements) {
    if (!isImportDeclaration(statement) || !isStringLiteralLikeNode(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== '../src/core/capabilities/registry') continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && isNamespaceImport(bindings)) {
      for (const name of REQUIRED_CAPABILITY_IMPORTS) imported.add(name);
    } else if (bindings && isNamedImports(bindings)) {
      for (const element of bindings.elements) imported.add(element.propertyName?.text ?? element.name.text);
    }
  }
  const missing = [...REQUIRED_CAPABILITY_IMPORTS].filter((name) => !imported.has(name)).sort();
  if (missing.length > 0) {
    violations.push(violation(
      'CAPABILITY_HELPER_NOT_CANONICAL',
      CAPABILITY_SCRIPT,
      `standalone helper source must import canonical registry operations from ${CAPABILITY_SOURCE}; missing ${missing.join(', ')}`,
    ));
  }
}

function checkStateSnapshotAdapter(
  repoRoot: string,
  source: SourceFile | undefined,
  violations: StateBoundaryViolation[],
): void {
  if (!source) return;
  visit(source, (node) => {
    const specifier = importSpecifier(node);
    if (specifier && (forbiddenCoreModule(specifier) || SNAPSHOT_FORBIDDEN_IMPORT.test(specifier))) {
      violations.push(nodeViolation(
        repoRoot,
        source,
        node,
        'STATE_SNAPSHOT_AUTHORITY',
        `state-snapshot adapter cannot import parser, Git, lock, cache, or host-I/O authority: ${specifier}`,
      ));
    }
    if (isRegularExpressionLiteral(node)) {
      violations.push(nodeViolation(
        repoRoot,
        source,
        node,
        'STATE_SNAPSHOT_AUTHORITY',
        'state-snapshot adapter cannot own regular-expression artifact parsing',
      ));
    }
    if (isCallExpression(node)) {
      const name = callName(node.expression);
      if (name && (['match', 'exec', 'test'].includes(name.split('.').at(-1) ?? '') || SNAPSHOT_AUTHORITY_NAME.test(name))) {
        violations.push(nodeViolation(
          repoRoot,
          source,
          node,
          'STATE_SNAPSHOT_AUTHORITY',
          `state-snapshot adapter cannot own parser, Git, lock, or cache behavior: ${name}`,
        ));
      }
    }
    if (isNewExpression(node) && callName(node.expression) === 'RegExp') {
      violations.push(nodeViolation(
        repoRoot,
        source,
        node,
        'STATE_SNAPSHOT_AUTHORITY',
        'state-snapshot adapter cannot construct artifact parsers',
      ));
    }
    for (const name of declarationNames(node)) {
      if (SNAPSHOT_AUTHORITY_NAME.test(name)) {
        violations.push(nodeViolation(
          repoRoot,
          source,
          node,
          'STATE_SNAPSHOT_AUTHORITY',
          `state-snapshot adapter cannot declare parser, Git, lock, or cache authority: ${name}`,
        ));
      }
    }
  });
}

function compactProcessOutput(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').slice(0, 500);
}

function checkGeneratedCapabilityProjection(
  repoRoot: string,
  violations: StateBoundaryViolation[],
): void {
  const sourcePath = resolve(repoRoot, CAPABILITY_SOURCE);
  const projectionPath = resolve(repoRoot, CAPABILITY_PROJECTION);
  for (const [file, absolutePath] of [
    [CAPABILITY_SOURCE, sourcePath],
    [CAPABILITY_PROJECTION, projectionPath],
  ] as const) {
    if (!existsSync(absolutePath) || !lstatSync(absolutePath).isFile()) {
      violations.push(violation(
        'REQUIRED_PATH_MISSING',
        file,
        `required capability projection path is missing or not a file: ${file}`,
      ));
      return;
    }
  }

  const sourceHash = createHash('sha256').update(readFileSync(sourcePath)).digest('hex');
  const projection = readFileSync(projectionPath, 'utf8');
  const markers = [...projection.matchAll(/^\/\/ @generated-from (\S+) sha256:([0-9a-f]{64})$/gm)];
  if (markers.length !== 1) {
    violations.push(violation(
      'CAPABILITY_PROJECTION_MARKER',
      CAPABILITY_PROJECTION,
      `generated capability helper must contain exactly one @generated-from marker; found ${markers.length}`,
    ));
  } else {
    const [, markerSource, markerHash] = markers[0];
    if (markerSource !== CAPABILITY_SOURCE) {
      violations.push(violation(
        'CAPABILITY_PROJECTION_SOURCE',
        CAPABILITY_PROJECTION,
        `generated capability helper points to ${markerSource}; expected ${CAPABILITY_SOURCE}`,
      ));
    }
    if (markerHash !== sourceHash) {
      violations.push(violation(
        'CAPABILITY_PROJECTION_HASH',
        CAPABILITY_PROJECTION,
        `generated capability helper hash ${markerHash} does not match canonical source sha256:${sourceHash}`,
      ));
    }
  }

  // This arbitrary-root checker treats the target as data and never invokes a
  // target-owned script or bundler macro. Canonical byte-for-byte regeneration
  // remains owned by the separately wired, trusted-root `check:helpers` gate.
  if ((lstatSync(projectionPath).mode & 0o111) === 0) {
    violations.push(violation(
      'HELPER_PROJECTION_MODE',
      CAPABILITY_PROJECTION,
      'generated capability helper must be executable (mode 100755)',
    ));
  }
}

async function parseSources(
  repoRoot: string,
  relativeFiles: readonly string[],
): Promise<ParsedSources> {
  const configPath = resolve(repoRoot, 'tsconfig.json');
  if (!existsSync(configPath)) {
    return {
      sources: new Map(),
      violations: [violation(
        'TYPESCRIPT_CONFIG_MISSING',
        'tsconfig.json',
        'TypeScript AST boundary analysis requires the repository tsconfig.json',
      )],
    };
  }

  const api = new API();
  let snapshot: Snapshot | undefined;
  try {
    const absoluteFiles = relativeFiles.map((file) => resolve(repoRoot, file));
    const scriptPath = resolve(repoRoot, CAPABILITY_SCRIPT);
    snapshot = await api.updateSnapshot({
      openProjects: [configPath],
      openFiles: existsSync(scriptPath) ? [scriptPath] : [],
    });
    const configuredProject = snapshot.getProjects().find(
      (project) => resolve(project.configFileName) === configPath,
    );
    if (!configuredProject) {
      throw new Error(`TypeScript did not load configured project ${configPath}`);
    }

    const projectsByFile = new Map<string, Project>();
    for (const file of absoluteFiles) projectsByFile.set(file, configuredProject);
    if (existsSync(scriptPath) && !configuredProject.rootFiles.some((file) => resolve(file) === scriptPath)) {
      const scriptProject = await snapshot.getDefaultProjectForFile(scriptPath);
      if (!scriptProject) throw new Error(`TypeScript did not assign a project to ${CAPABILITY_SCRIPT}`);
      projectsByFile.set(scriptPath, scriptProject);
    }

    const violations: StateBoundaryViolation[] = [];
    const projectFiles = new Map<Project, Set<string>>();
    for (const [file, project] of projectsByFile) {
      const files = projectFiles.get(project) ?? new Set<string>();
      files.add(file);
      projectFiles.set(project, files);
    }
    for (const [project, checkedFiles] of projectFiles) {
      const diagnostics = await project.program.getSyntacticDiagnostics();
      for (const diagnostic of diagnostics) {
        if (!diagnostic.fileName || !checkedFiles.has(resolve(diagnostic.fileName))) continue;
        const file = relPath(repoRoot, diagnostic.fileName);
        const source = await project.program.getSourceFile(diagnostic.fileName);
        const position = source
          ? source.getLineAndCharacterOfPosition(Math.max(0, diagnostic.pos))
          : { line: 0, character: 0 };
        violations.push(violation(
          'TYPESCRIPT_SYNTAX_ERROR',
          file,
          `TypeScript AST parse failed (TS${diagnostic.code}): ${diagnostic.text}`,
          position.line + 1,
          position.character + 1,
        ));
      }
    }

    const sourceEntries = await Promise.all([...projectsByFile].map(async ([absoluteFile, project]) => {
      const source = await project.program.getSourceFile(absoluteFile);
      if (!source) {
        violations.push(violation(
          'TYPESCRIPT_SOURCE_UNAVAILABLE',
          relPath(repoRoot, absoluteFile),
          'TypeScript AST service did not return the requested source file',
        ));
        return null;
      }
      return [relPath(repoRoot, absoluteFile), source] as const;
    }));
    return {
      sources: new Map(sourceEntries.filter((entry) => entry !== null)),
      violations,
    };
  } finally {
    if (snapshot) await snapshot.dispose();
    await api.close();
  }
}

function sortedViolations(violations: readonly StateBoundaryViolation[]): StateBoundaryViolation[] {
  return [...violations].sort((left, right) =>
    left.file.localeCompare(right.file) ||
    left.line - right.line ||
    left.column - right.column ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message));
}

export async function checkStateBoundaries(repoInput = '.'): Promise<StateBoundaryCheckResult> {
  const repoRoot = resolve(repoInput);
  const violations: StateBoundaryViolation[] = [];
  try {
    const coreFiles = CORE_ROOTS.flatMap((root) => collectTypeScriptFiles(repoRoot, root, violations));
    const cliFiles = collectTypeScriptFiles(repoRoot, 'src/cli', violations);
    const effectsFiles = collectTypeScriptFiles(repoRoot, 'src/effects', violations);
    const requiredFiles = [CAPABILITY_SCRIPT, STATE_SNAPSHOT_ADAPTER];
    for (const file of requiredFiles) {
      const absolutePath = resolve(repoRoot, file);
      if (!existsSync(absolutePath) || !lstatSync(absolutePath).isFile()) {
        violations.push(violation('REQUIRED_PATH_MISSING', file, `required architecture file is missing: ${file}`));
      }
    }
    if (existsSync(resolve(repoRoot, RETIRED_WORKFLOW_PROFILE_ADAPTER))) {
      violations.push(violation(
        'RETIRED_ADAPTER_PATH',
        RETIRED_WORKFLOW_PROFILE_ADAPTER,
        'temporary workflow-profile adapter/re-export is forbidden at Sprint close',
      ));
    }

    const sourceFiles = [...new Set([
      ...coreFiles,
      ...cliFiles,
      ...effectsFiles,
      resolve(repoRoot, CAPABILITY_SCRIPT),
    ].filter((file) => existsSync(file)))].map((file) => relPath(repoRoot, file));
    const parsed = await parseSources(repoRoot, sourceFiles);
    violations.push(...parsed.violations);

    const coreSet = new Set(coreFiles.map((file) => relPath(repoRoot, file)));
    for (const file of coreSet) {
      const source = parsed.sources.get(file);
      if (source) checkCoreDependencies(repoRoot, source, violations);
    }
    const effectsSet = new Set(effectsFiles.map((file) => relPath(repoRoot, file)));
    for (const file of effectsSet) {
      const source = parsed.sources.get(file);
      if (source) checkEffectDependencies(repoRoot, source, violations);
    }
    checkCanonicalDeclarations(repoRoot, parsed.sources, violations);
    checkCapabilityScript(repoRoot, parsed.sources.get(CAPABILITY_SCRIPT), violations);
    checkStateSnapshotAdapter(repoRoot, parsed.sources.get(STATE_SNAPSHOT_ADAPTER), violations);
    checkGeneratedCapabilityProjection(repoRoot, violations);

    const sorted = sortedViolations(violations);
    return { ok: sorted.length === 0, filesChecked: parsed.sources.size, violations: sorted };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const sorted = sortedViolations([
      ...violations,
      violation('BOUNDARY_CHECKER_FAILURE', '(checker)', `state boundary analysis failed closed: ${message}`),
    ]);
    return { ok: false, filesChecked: 0, violations: sorted };
  }
}

function usage(): never {
  process.stderr.write('Usage: bun scripts/check-state-boundaries.ts [--repo <path>]\n');
  process.exit(2);
}

function parseRepoArg(argv: readonly string[]): string {
  if (argv.length === 0) return '.';
  if (argv.length === 2 && argv[0] === '--repo' && argv[1]) return argv[1];
  return usage();
}

if (import.meta.main) {
  const result = await checkStateBoundaries(parseRepoArg(process.argv.slice(2)));
  if (result.ok) {
    process.stdout.write(
      `[state-boundaries] OK: ${result.filesChecked} TypeScript files checked; canonical helper projection verified\n`,
    );
  } else {
    for (const item of result.violations) {
      process.stderr.write(
        `[state-boundaries] ${item.code} ${item.file}:${item.line}:${item.column} ${item.message}\n`,
      );
    }
    process.stderr.write(`[state-boundaries] failed: ${result.violations.length} violation(s)\n`);
    process.exitCode = 1;
  }
}
