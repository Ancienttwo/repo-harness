import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { registerRepoHarnessRepo, repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { getMcpPolicy } from '../../src/cli/mcp/policy';
import { buildMcpToolDefinitions, callMcpTool, type McpToolContext } from '../../src/cli/mcp/tools';
import { WorkspaceManager } from '../../src/cli/mcp/workspaces';

async function withRepo<T>(fn: (repoRoot: string, ctx: McpToolContext) => Promise<T>): Promise<T> {
  const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-tools-'));
  try {
    mkdirSync(join(repoRoot, '.ai/harness/handoff'), { recursive: true });
    mkdirSync(join(repoRoot, '.ai/harness/checks'), { recursive: true });
    mkdirSync(join(repoRoot, 'plans/prds'), { recursive: true });
    mkdirSync(join(repoRoot, 'plans/sprints'), { recursive: true });
    mkdirSync(join(repoRoot, 'tasks'), { recursive: true });
    writeFileSync(join(repoRoot, '.ai/harness/policy.json'), '{}\n');
    writeFileSync(join(repoRoot, 'tasks/current.md'), 'status=Active\n');
    writeFileSync(join(repoRoot, 'plans/prds/existing.prd.md'), '# Existing\n');
    writeFileSync(join(repoRoot, 'plans/sprints/example.sprint.md'), '# Sprint\n');
    const policy = getMcpPolicy('planner', {
      enableReader: true,
      allowedRoots: [repoRoot],
    });
    return await fn(repoRoot, {
      repoRoot,
      policy,
      workspaceManager: new WorkspaceManager({ allowedRoots: [repoRoot], policy }),
    });
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

async function jsonTool(ctx: McpToolContext, name: string, args: Record<string, unknown> = {}) {
  const result = await callMcpTool(ctx, name, args);
  return JSON.parse(result.content[0].text);
}

async function withRegistryHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const home = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-registry-'));
  const previous = process.env.REPO_HARNESS_HOME;
  try {
    process.env.REPO_HARNESS_HOME = home;
    return await fn(home);
  } finally {
    if (previous === undefined) delete process.env.REPO_HARNESS_HOME;
    else process.env.REPO_HARNESS_HOME = previous;
    rmSync(home, { recursive: true, force: true });
  }
}

describe('mcp tools', () => {
  test('exposes ChatGPT browser tools only behind the explicit enable flag', async () => {
    await withRepo(async (_repoRoot, ctx) => {
      expect(buildMcpToolDefinitions(ctx.policy).some((tool) => tool.name === 'run_chatgpt_browser_consult')).toBe(false);
      expect(buildMcpToolDefinitions(ctx.policy, { enableChatgptBrowser: true }).some((tool) => tool.name === 'run_chatgpt_browser_consult')).toBe(true);
      expect(buildMcpToolDefinitions(ctx.policy, { enableChatgptBrowser: true }).some((tool) => tool.name === 'open_chatgpt_browser_session')).toBe(true);
      const disabled = await jsonTool(ctx, 'run_chatgpt_browser_consult', { prompt: 'Say OK', dryRun: true });
      expect(disabled.error.code).toBe('TOOL_DISABLED');
    });
  });

  test('runs ChatGPT browser dry-run consults through MCP and reads the saved session', async () => {
    await withRepo(async (repoRoot, ctx) => {
      const browserCtx = { ...ctx, enableChatgptBrowser: true };
      const created = await jsonTool(browserCtx, 'run_chatgpt_browser_consult', {
        prompt: 'Review this sprint.',
        files: ['plans/sprints/example.sprint.md'],
        model: 'GPT-5.5 Pro',
        thinking: 'heavy',
        dryRun: true,
      });
      expect(created.status).toBe('dry_run');
      expect(created.sessionId).toMatch(/^chgpt_/);

      const read = await jsonTool(browserCtx, 'read_chatgpt_browser_session', { sessionId: created.sessionId });
      expect(read.meta.engine).toBe('chatgpt-browser');
      expect(read.output).toContain('Dry run only');

      const listed = await jsonTool(browserCtx, 'list_chatgpt_browser_sessions', { limit: 1 });
      expect(listed.sessions[0].sessionId).toBe(created.sessionId);

      const metaPath = join(repoRoot, '.ai/harness/chatgpt/sessions', created.sessionId, 'meta.json');
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      meta.browser.conversationUrl = 'https://chatgpt.com/c/mcp-open-test';
      writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
      const openedRaw = await callMcpTool(browserCtx, 'open_chatgpt_browser_session', { sessionId: created.sessionId });
      const opened = JSON.parse(openedRaw.content[0].text);
      expect(opened.url).toBe('https://chatgpt.com/c/mcp-open-test');
      expect(openedRaw.structuredContent).toEqual(opened);

      const absolute = await jsonTool(browserCtx, 'run_chatgpt_browser_consult', {
        prompt: 'Review this sprint.',
        writeOutput: '/tmp/repo-harness-mcp-browser-output.md',
        dryRun: true,
      });
      expect(absolute.error.code).toBe('TOOL_FAILED');
      expect(absolute.error.message).toContain('absolute write output paths are not allowed');

      const denied = await jsonTool(browserCtx, 'run_chatgpt_browser_consult', {
        prompt: 'Review this sprint.',
        writeOutput: '.env',
        dryRun: true,
      });
      expect(denied.error.code).toBe('TOOL_FAILED');
      expect(denied.error.message).toContain('path is denied by ChatGPT browser policy');

      const allowed = await jsonTool(browserCtx, 'run_chatgpt_browser_consult', {
        prompt: 'Review this sprint.',
        writeOutput: 'plans/sprints/browser-review.md',
        dryRun: true,
      });
      expect(allowed.status).toBe('dry_run');
      expect(readFileSync(join(repoRoot, 'plans/sprints/browser-review.md'), 'utf-8')).toContain('Dry run only');
    });
  });

  test('lists and reads allowed workflow files with redaction', async () => {
    await withRepo(async (repoRoot, ctx) => {
      const listed = await jsonTool(ctx, 'list_workflow_files');
      expect(listed.files.some((entry: { path: string }) => entry.path === 'tasks/current.md')).toBe(true);

      const read = await jsonTool(ctx, 'read_workflow_file', { path: 'tasks/current.md' });
      expect(read.path).toBe('tasks/current.md');
      expect(read.content).toContain('status=Active');

      const denied = await jsonTool(ctx, 'read_workflow_file', { path: '.env' });
      expect(denied.error.code).toBe('POLICY_DENIED');

      writeFileSync(join(repoRoot, '.env'), 'OPENAI_API_KEY=sk-testsecret\n');
      const fullDiskCtx = { ...ctx, policy: getMcpPolicy('planner', { fullDiskRead: true }) };
      const absolute = await jsonTool(fullDiskCtx, 'read_workflow_file', { path: join(repoRoot, '.env') });
      expect(absolute.error.code).toBe('POLICY_DENIED');
    });
  });

  test('planner connector opens allowed repo workspaces and reads text through tree and line ranges', async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-reader-'));
    const outside = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-reader-outside-'));
    try {
      mkdirSync(join(repoRoot, 'docs'), { recursive: true });
      mkdirSync(join(repoRoot, 'src'), { recursive: true });
      mkdirSync(join(repoRoot, 'ignored-dir'), { recursive: true });
      mkdirSync(join(repoRoot, 'secrets'), { recursive: true });
      writeFileSync(join(repoRoot, 'docs/design.md'), ['# Design', 'authentication route', 'final line'].join('\n'));
      writeFileSync(join(repoRoot, 'src/index.ts'), 'export const readerFixture = 1;\n');
      writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: 'reader-fixture', private: true }, null, 2));
      writeFileSync(join(repoRoot, '.gitignore'), 'ignored.md\nignored-dir/\n');
      writeFileSync(join(repoRoot, 'ignored.md'), '# ignored\n');
      writeFileSync(join(repoRoot, 'ignored-dir/note.md'), '# ignored child\n');
      writeFileSync(join(repoRoot, '.env'), 'OPENAI_API_KEY=sk-testsecret\n');
      writeFileSync(join(repoRoot, 'secrets/token.txt'), 'TOKEN=secret\n');
      const policy = getMcpPolicy('planner', { enableReader: true, allowedRoots: [repoRoot] });
      const ctx: McpToolContext = {
        repoRoot,
        policy,
        workspaceManager: new WorkspaceManager({ allowedRoots: [repoRoot], policy }),
      };

      const toolNames = buildMcpToolDefinitions(ctx.policy).map((tool) => tool.name);
      expect(toolNames).toContain('write_prd');
      expect(toolNames).toContain('prepare_codex_goal_from_sprint');
      expect(toolNames).toContain('reader_status');
      expect(toolNames).toContain('list_allowed_roots');
      expect(toolNames).toContain('open_workspace');
      expect(toolNames).toContain('tree');
      expect(toolNames).toContain('search_text');
      expect(toolNames).toContain('read_text');
      expect(toolNames).not.toContain('run_agent_goal');

      const status = await jsonTool(ctx, 'reader_status');
      expect(status.profile).toBe('planner');
      expect(status.capability).toBe('workspaceReader');
      expect(status.package_version).toMatch(/^\d+\.\d+\.\d+/);
      expect(typeof status.schema_hash).toBe('string');

      const roots = await jsonTool(ctx, 'list_allowed_roots');
      const root = roots.roots.find((entry: { root_id: string; path?: string }) => entry.root_id.startsWith('root_'));
      expect(root?.path).toBeUndefined();
      expect(root?.repo_id).toBeUndefined();
      const rootId = root?.root_id;
      expect(rootId).toMatch(/^root_/);

      const opened = await jsonTool(ctx, 'open_workspace', { root_id: rootId });
      expect(opened.workspace_id).toMatch(/^ws_/);

      const deniedRoot = await jsonTool(ctx, 'open_workspace', { root_id: rootId, path: outside });
      expect(deniedRoot.error.code).toBe('ABSOLUTE_PATH_DENIED');

      const tree = await jsonTool(ctx, 'tree', { workspace_id: opened.workspace_id, path: '.', include_hidden: true });
      expect(tree.entries.some((entry: { path: string }) => entry.path === 'docs/design.md')).toBe(true);
      expect(tree.entries.some((entry: { path: string }) => entry.path === '.env')).toBe(false);
      expect(tree.entries.some((entry: { path: string }) => entry.path === 'ignored.md')).toBe(false);
      expect(tree.entries.some((entry: { path: string }) => entry.path === 'ignored-dir')).toBe(false);
      expect(tree.blocked_entries).toBeGreaterThanOrEqual(1);

      const read = await jsonTool(ctx, 'read_text', {
        workspace_id: opened.workspace_id,
        path: 'docs/design.md',
        start_line: 2,
        end_line: 2,
      });
      expect(read.text).toBe('2: authentication route');
      expect(read.has_more).toBe(true);
      expect(read.next_start_line).toBe(3);

      const source = await jsonTool(ctx, 'read_text', { workspace_id: opened.workspace_id, path: 'src/index.ts' });
      expect(source.text).toBe('1: export const readerFixture = 1;');
      const legacySource = await jsonTool(ctx, 'read_workflow_file', { path: 'src/index.ts' });
      expect(legacySource.error.code).toBe('POLICY_DENIED');
      const legacyManifest = await jsonTool(ctx, 'read_workflow_file', { path: 'package.json' });
      expect(legacyManifest.error.code).toBe('POLICY_DENIED');

      const blocked = await jsonTool(ctx, 'read_text', { workspace_id: opened.workspace_id, path: 'secrets/token.txt' });
      expect(blocked.error.code).toBe('PATH_DENIED');
      const ignored = await jsonTool(ctx, 'read_text', { workspace_id: opened.workspace_id, path: 'ignored.md' });
      expect(ignored.error.code).toBe('PATH_IGNORED');
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test('discovers registered adopted repos and targets them with repo_path', async () => {
    await withRegistryHome(async () => {
      const scanRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-discovery-'));
      const repoRoot = join(scanRoot, 'workspace', 'agentic-dev');
      try {
        mkdirSync(join(repoRoot, '.ai/harness/handoff'), { recursive: true });
        mkdirSync(join(repoRoot, 'plans/prds'), { recursive: true });
        mkdirSync(join(repoRoot, 'tasks'), { recursive: true });
        writeFileSync(join(repoRoot, '.ai/harness/policy.json'), '{}\n');
        writeFileSync(join(repoRoot, '.ai/harness/handoff/resume.md'), '# Resume\n\nready\n');
        writeFileSync(join(repoRoot, 'tasks/current.md'), 'status=Active\n');
        registerRepoHarnessRepo(repoRoot, 'adopt');
        const canonicalRepoRoot = realpathSync(repoRoot);

        const policy = getMcpPolicy('planner', { enableReader: true });
        const ctx: McpToolContext = {
          repoRoot: scanRoot,
          policy,
          workspaceManager: new WorkspaceManager({ allowedRoots: [], policy }),
        };
        expect(buildMcpToolDefinitions(ctx.policy).some((tool) => tool.name === 'discover_harness_repos')).toBe(true);

        const discovered = await jsonTool(ctx, 'discover_harness_repos');
        expect(discovered.repos.some((entry: { repoRoot: string }) => entry.repoRoot === canonicalRepoRoot)).toBe(true);

        const queried = await jsonTool(ctx, 'discover_harness_repos', { query: 'agentic-dev/' });
        expect(queried.query).toBe('agentic-dev');
        expect(queried.repos.map((entry: { repoRoot: string }) => entry.repoRoot)).toContain(canonicalRepoRoot);

        const roots = await jsonTool(ctx, 'list_allowed_roots');
        expect(roots.roots.some(
          (entry: { repo_id: string; path?: string }) => entry.repo_id === repoHarnessRepoIdFor(canonicalRepoRoot) && entry.path === undefined,
        )).toBe(true);

        const status = await jsonTool(ctx, 'harness_status');
        expect(status.repoRoot).toBe(scanRoot);
        expect(status.adopted).toBe(false);

        const targetedStatus = await jsonTool(ctx, 'harness_status', { repo_path: repoRoot });
        expect(targetedStatus.repoRoot).toBe(canonicalRepoRoot);
        expect(targetedStatus.adopted).toBe(true);

        const aliasStatus = await jsonTool(ctx, 'harness_status', { repo_path: 'agentic-dev/' });
        expect(aliasStatus.repoRoot).toBe(canonicalRepoRoot);
        expect(aliasStatus.adopted).toBe(true);

        const handoff = await jsonTool(ctx, 'latest_handoff', { repo_path: repoRoot });
        const resume = handoff.handoff.find((entry: { path: string }) => entry.path === '.ai/harness/handoff/resume.md');
        expect(resume).toMatchObject({ exists: true });
        expect(resume.preview).toContain('# Resume');

        const aliasHandoff = await jsonTool(ctx, 'latest_handoff', { repo_path: 'agentic-dev/' });
        const aliasResume = aliasHandoff.handoff.find((entry: { path: string }) => entry.path === '.ai/harness/handoff/resume.md');
        expect(aliasResume).toMatchObject({ exists: true });

        const current = await jsonTool(ctx, 'read_workflow_file', { repo_path: repoRoot, path: 'tasks/current.md' });
        expect(current.content).toContain('status=Active');

        const aliasCurrent = await jsonTool(ctx, 'read_workflow_file', { repo_path: 'agentic-dev/', path: 'tasks/current.md' });
        expect(aliasCurrent.content).toContain('status=Active');

        const prd = await jsonTool(ctx, 'write_prd', {
          repo_path: repoRoot,
          title: 'Registered Repo Feature',
          slug: 'registered-repo-feature',
          body: '# Registered Repo Feature\n\nBody.',
        });
        expect(prd.repoRoot).toBe(canonicalRepoRoot);
        expect(existsSync(join(repoRoot, prd.path))).toBe(true);

        const siblingRoot = join(scanRoot, 'sibling');
        mkdirSync(join(siblingRoot, '.ai/harness/handoff'), { recursive: true });
        writeFileSync(join(siblingRoot, '.ai/harness/policy.json'), '{}\n');
        const deniedAbsoluteTarget = await jsonTool(ctx, 'latest_handoff', { repo_path: siblingRoot });
        expect(deniedAbsoluteTarget.error.code).toBe('POLICY_DENIED');
        const deniedRelativeTarget = await jsonTool(ctx, 'latest_handoff', { repo_path: 'sibling' });
        expect(deniedRelativeTarget.error.code).toBe('POLICY_DENIED');
      } finally {
        rmSync(scanRoot, { recursive: true, force: true });
      }
    });
  });

  test('writes planning artifacts and blocks overwrite by default', async () => {
    await withRepo(async (repoRoot, ctx) => {
      const prd = await jsonTool(ctx, 'write_prd', {
        title: 'New Feature',
        slug: 'new-feature',
        body: '# New Feature\n\nBody.',
      });
      expect(prd.status).toBe('written');
      expect(prd.path).toMatch(/^plans\/prds\/\d{8}-\d{4}-new-feature\.prd\.md$/);
      expect(existsSync(join(repoRoot, prd.path))).toBe(true);

      const blocked = await jsonTool(ctx, 'write_prd', {
        title: 'New Feature',
        slug: prd.path.replace(/^plans\/prds\//, '').replace(/\.prd\.md$/, ''),
        body: '# New Feature\n\nBody.',
      });
      expect(blocked.error.code).toBe('WOULD_OVERWRITE');

      const sprint = await jsonTool(ctx, 'write_sprint', {
        title: 'Sprint',
        slug: 'sprint-one',
        body: '# Sprint\n\nBody.',
      });
      expect(sprint.path).toMatch(/^plans\/sprints\/\d{8}-\d{4}-sprint-one\.sprint\.md$/);

      const plan = await jsonTool(ctx, 'write_plan', {
        title: 'Plan',
        slug: 'plan-one',
        body: '# Plan\n\nBody.',
      });
      expect(plan.path).toBe('plans/plan-plan-one.md');

      const handoff = await jsonTool(ctx, 'append_handoff_note', { actor: 'test', body: 'handoff note' });
      expect(handoff.path).toBe('.ai/harness/handoff/chatgpt-plan.md');
      expect(readFileSync(join(repoRoot, '.ai/harness/handoff/chatgpt-plan.md'), 'utf-8')).toContain('handoff note');
    });
  });

  test('blocks oversized workflow reads', async () => {
    await withRepo(async (repoRoot, ctx) => {
      writeFileSync(join(repoRoot, 'plans/prds/large.prd.md'), 'x'.repeat(32));
      const smallLimit = { ...ctx, policy: { ...ctx.policy, maxFileBytes: 8 } };
      const result = await jsonTool(smallLimit, 'read_workflow_file', { path: 'plans/prds/large.prd.md' });
      expect(result.error.code).toBe('FILE_TOO_LARGE');
    });
  });

  test('validates fixed Codex goal path and required sections', async () => {
    await withRepo(async (repoRoot, ctx) => {
      const invalid = await jsonTool(ctx, 'write_codex_goal', { body: '# Codex Goal\nshort' });
      expect(invalid.error.code).toBe('INVALID_GOAL');

      const missingExecutionBoundary = [
        '# Codex Goal',
        '## Source of truth',
        'plans/prds/example.prd.md',
        '## Role',
        'Codex executor.',
        '## Scope',
        'Only workflow artifacts.',
        '## Required workflow',
        'Read PRD and sprint.',
        '## Required checks',
        'bun test tests/cli/mcp.test.ts',
        '## Done when',
        'Checks pass and handoff is updated.',
      ].join('\n\n');
      const missingBoundary = await jsonTool(ctx, 'write_codex_goal', { body: missingExecutionBoundary });
      expect(missingBoundary.error.code).toBe('INVALID_GOAL');
      expect(missingBoundary.error.details.missing).toContain('## Execution boundary');

      const validBody = [
        '# Codex Goal',
        '## Source of truth',
        'plans/prds/example.prd.md',
        '## Role',
        'Codex executor.',
        '## Scope',
        'Only workflow artifacts.',
        '## Execution boundary',
        'Implement exactly the listed scope; do not add unrequested extras.',
        '## Required workflow',
        'Read PRD and sprint.',
        '## Required checks',
        'bun test tests/cli/mcp.test.ts',
        '## Done when',
        'Checks pass and handoff is updated.',
      ].join('\n\n');
      const written = await jsonTool(ctx, 'write_codex_goal', { body: validBody });
      expect(written.status).toBe('written');
      expect(readFileSync(join(repoRoot, '.ai/harness/handoff/codex-goal.md'), 'utf-8')).toContain('# Codex Goal');
    });
  });

  test('supports idea to PRD to checklist Sprint to Codex goal handoff', async () => {
    await withRepo(async (repoRoot, ctx) => {
      const prd = await jsonTool(ctx, 'write_prd_from_idea', {
        title: 'Goal Chain',
        slug: 'goal-chain',
        idea: 'Convert idea to PRD, checklist Sprint, and host-native Codex /goal handoff.',
        users: ['ChatGPT planner', 'Codex executor'],
        goals: ['Generate reviewable workflow artifacts'],
        success_criteria: ['Codex receives a staged checklist Sprint execution prompt'],
      });
      expect(prd.path).toMatch(/^plans\/prds\/\d{8}-\d{4}-goal-chain\.prd\.md$/);
      const prdContent = readFileSync(join(repoRoot, prd.path), 'utf-8');
      expect(prdContent).toContain('> **Status**: Draft');
      expect(prdContent).toContain('## Workflow Contract');

      const sprint = await jsonTool(ctx, 'write_checklist_sprint', {
        title: 'Goal Chain Sprint',
        slug: 'goal-chain-sprint',
        prd_path: prd.path,
        tasks: [
          {
            title: 'Implement chain surface',
            objective: 'Expose the idea to PRD to checklist Sprint to Goal route.',
            files: ['src/cli/mcp/tools.ts'],
            checks: ['bun test tests/cli/mcp-tools.test.ts'],
            stage_gate: 'Stage MCP tool changes before continuing.',
          },
        ],
      });
      expect(sprint.path).toMatch(/^plans\/sprints\/\d{8}-\d{4}-goal-chain-sprint\.sprint\.md$/);
      const sprintContent = readFileSync(join(repoRoot, sprint.path), 'utf-8');
      expect(sprintContent).toContain('### Task Card 1: Implement chain surface');
      expect(sprintContent).toContain('- [ ] Stage gate: Stage MCP tool changes before continuing.');

      const goal = await jsonTool(ctx, 'prepare_codex_goal_from_sprint', {
        prd_path: prd.path,
        sprint_path: sprint.path,
        reference_repo: '/tmp/reference-repo',
      });
      expect(goal.status).toBe('written');
      expect(goal.path).toBe('.ai/harness/handoff/codex-goal.md');
      expect(goal.prompt).toContain('/goal');
      expect(goal.prompt).toContain(`Read: ${prd.path}`);
      expect(goal.prompt).toContain(`Open or use a worktree and complete: ${sprint.path}`);
      expect(goal.prompt).toContain('After each completed phase, stage the result before continuing.');
      expect(goal.prompt).toContain("Use the user's language for status reports unless repo-local instructions require otherwise.");
      expect(goal.prompt).not.toContain('阅读：');
      expect(goal.prompt).not.toContain('开worktree完整执行');
      const goalContent = readFileSync(join(repoRoot, '.ai/harness/handoff/codex-goal.md'), 'utf-8');
      expect(goalContent).toContain('## Host-native /goal prompt');
      expect(goalContent).toContain('No commit is created unless the user explicitly asks for commit.');
      expect(goalContent).toContain('## Execution boundary');
      expect(goalContent).toContain(
        'Execution boundary: implement exactly the Goal, In scope items, Allowed Paths, and Exit Criteria in this brief.',
      );
    });
  });

  test('exposes a written Codex goal through the handoff read path', async () => {
    await withRepo(async (repoRoot, ctx) => {
      const validBody = [
        '# Codex Goal',
        '## Source of truth',
        'plans/prds/example.prd.md',
        '## Role',
        'Codex executor.',
        '## Scope',
        'Only workflow artifacts.',
        '## Execution boundary',
        'Implement exactly the listed scope; do not add unrequested extras.',
        '## Required workflow',
        'Read PRD and sprint.',
        '## Required checks',
        'bun test tests/cli/mcp.test.ts',
        '## Done when',
        'Checks pass and handoff is updated.',
      ].join('\n\n');

      await jsonTool(ctx, 'write_codex_goal', { body: validBody });

      const handoff = await jsonTool(ctx, 'latest_handoff');
      const goal = handoff.handoff.find((entry: { path: string }) => entry.path === '.ai/harness/handoff/codex-goal.md');
      expect(goal).toMatchObject({ exists: true });
      expect(goal.preview).toContain('# Codex Goal');

      const readGoal = await jsonTool(ctx, 'read_workflow_file', { path: '.ai/harness/handoff/codex-goal.md' });
      expect(readGoal.content).toContain('## Required checks');
      expect(readFileSync(join(repoRoot, '.ai/harness/handoff/codex-goal.md'), 'utf-8')).toContain('source: "repo-harness-mcp"');
    });
  });

  test('latest_checks is not starved by large earlier workflow roots', async () => {
    await withRepo(async (repoRoot, ctx) => {
      for (let index = 0; index < 720; index += 1) {
        writeFileSync(join(repoRoot, 'plans/prds', `bulk-${String(index).padStart(3, '0')}.prd.md`), '# Bulk\n');
      }
      writeFileSync(join(repoRoot, '.ai/harness/checks/latest.json'), '{"ok":true}\n');

      const result = await jsonTool(ctx, 'latest_checks');
      expect(result.files.some((entry: { path: string }) => entry.path === '.ai/harness/checks/latest.json')).toBe(true);
    });
  });

  test('runs fixed Codex goal only when orchestrator dev runner is enabled', async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-runner-'));
    const binRoot = mkdtempSync(join(tmpdir(), 'repo-harness-mcp-runner-bin-'));
    const originalPath = process.env.PATH;
    try {
      mkdirSync(join(repoRoot, '.ai/harness/handoff'), { recursive: true });
      writeFileSync(join(repoRoot, '.ai/harness/policy.json'), '{}\n');
      writeFileSync(join(repoRoot, '.ai/harness/handoff/codex-goal.md'), '# Codex Goal\n\n## Required workflow\n\nRun fake codex.\n');
      const fakeCodex = join(binRoot, 'codex');
      writeFileSync(fakeCodex, '#!/usr/bin/env bash\necho "fake-codex:$1:$2:$3"\n', 'utf-8');
      chmodSync(fakeCodex, 0o755);
      process.env.PATH = `${binRoot}:${originalPath ?? ''}`;

      const disabledCtx = { repoRoot, policy: getMcpPolicy('orchestrator') };
      const disabled = await jsonTool(disabledCtx, 'run_agent_goal', { agent: 'codex' });
      expect(disabled.error.code).toBe('DEV_RUNNER_DISABLED');

      const enabledCtx = {
        repoRoot,
        policy: getMcpPolicy('orchestrator', { devAgentRunner: true, allowedAgents: ['codex'], runnerTimeoutMs: 5000 }),
      };
      const result = await jsonTool(enabledCtx, 'run_agent_goal', { agent: 'codex', timeout_ms: 5000 });
      expect(result.agent).toBe('codex');
      expect(result.goalPath).toBe('.ai/harness/handoff/codex-goal.md');
      expect(result.command).toContain('codex exec --json --cd');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('fake-codex:exec:--json:--cd');

      const denied = await jsonTool(enabledCtx, 'run_agent_goal', { agent: 'claude' });
      expect(denied.error.code).toBe('AGENT_DENIED');
    } finally {
      process.env.PATH = originalPath;
      rmSync(repoRoot, { recursive: true, force: true });
      rmSync(binRoot, { recursive: true, force: true });
    }
  });
});
