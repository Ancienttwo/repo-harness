import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getMcpPolicy } from '../../src/cli/mcp/policy';
import { buildMcpToolDefinitions, callMcpTool, type McpToolContext } from '../../src/cli/mcp/tools';

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
    return await fn(repoRoot, { repoRoot, policy: getMcpPolicy('planner') });
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

async function jsonTool(ctx: McpToolContext, name: string, args: Record<string, unknown> = {}) {
  const result = await callMcpTool(ctx, name, args);
  return JSON.parse(result.content[0].text);
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
    });
  });

  test('lists and reads allowed workflow files with redaction', async () => {
    await withRepo(async (_repoRoot, ctx) => {
      const listed = await jsonTool(ctx, 'list_workflow_files');
      expect(listed.files.some((entry: { path: string }) => entry.path === 'tasks/current.md')).toBe(true);

      const read = await jsonTool(ctx, 'read_workflow_file', { path: 'tasks/current.md' });
      expect(read.path).toBe('tasks/current.md');
      expect(read.content).toContain('status=Active');

      const denied = await jsonTool(ctx, 'read_workflow_file', { path: '.env' });
      expect(denied.error.code).toBe('POLICY_DENIED');
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

      const validBody = [
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
      expect(goal.prompt).toContain(`阅读： ${prd.path}`);
      expect(goal.prompt).toContain(`开worktree完整执行：${sprint.path}`);
      expect(goal.prompt).toContain('完成阶段性任务，要staging再继续');
      const goalContent = readFileSync(join(repoRoot, '.ai/harness/handoff/codex-goal.md'), 'utf-8');
      expect(goalContent).toContain('## Host-native /goal prompt');
      expect(goalContent).toContain('No commit is created unless the user explicitly asks for commit.');
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
});
