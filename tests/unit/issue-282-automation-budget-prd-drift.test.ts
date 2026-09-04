/**
 * The PRD is the single schema source for `ProgramAuthorizationV1`, and issue
 * #282 found it already one field behind the code. A prose claim that two
 * things agree is not a check, so this parses the PRD's own code block and
 * compares its field list to the implemented type's key set.
 */
import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

import { sealProgramAuthorization, type ProgramBudgetLimitV1 } from '../../src/core/automation/budget';

const ROOT = join(import.meta.dir, '..', '..');
const PRD = join(ROOT, 'plans/prds/20260828-2321-guarded-merge-unattended-automation.prd.md');
const hex = (seed: string): string => createHash('sha256').update(seed, 'utf8').digest('hex');

const LIMITS: ProgramBudgetLimitV1 = Object.freeze({
  max_agent_turns: 10,
  max_successful_acquisitions: 2,
  max_runner_invocations: 6,
  max_provider_failures: 3,
  max_consecutive_no_progress_steps: 2,
  max_repair_cycles: 4,
  max_wall_clock_seconds: 3600,
  max_input_tokens: null,
  max_output_tokens: null,
  max_cost_micros: null,
});

/** Field names declared by one `interface <name> { … }` block in the PRD. */
function prdInterfaceFields(markdown: string, name: string): readonly string[] {
  const opened = markdown.indexOf(`interface ${name} {`);
  expect(opened).toBeGreaterThan(-1);
  const body = markdown.slice(opened + `interface ${name} {`.length, markdown.indexOf('\n}', opened));
  const fields: string[] = [];
  for (const line of body.split('\n')) {
    const match = line.match(/^\s{2}([a-z_][a-z0-9_]*)\??\s*:/u);
    if (match) fields.push(match[1]!);
  }
  return fields;
}

describe('issue #282 — the PRD schema and the implemented type cannot drift', () => {
  const markdown = readFileSync(PRD, 'utf8');

  test('ProgramAuthorizationV1 declares exactly the implemented key set', () => {
    const implemented = Object.keys(sealProgramAuthorization({
      authorization_id: 'authorization-drift',
      repository_id: 'repo-harness',
      target_ref: 'refs/heads/main',
      target_revision: hex('target'),
      work_graph_revision: hex('work-graph'),
      allowed_work_package_ids: ['wp-1'],
      allowed_risk_tiers: ['low'],
      merge_mode: 'disabled',
      allowed_merge_method: 'squash',
      max_repair_cycles: LIMITS.max_repair_cycles,
      budget: LIMITS,
      contract_scope: 'contract_less',
      contract_path: null, campaign: null,
      issued_by: 'ancienttwo',
      issued_at: '2026-09-03T00:00:00.000Z',
      expires_at: '2026-09-04T00:00:00.000Z',
    })).sort();
    expect([...prdInterfaceFields(markdown, 'ProgramAuthorizationV1')].sort()).toEqual(implemented);
  });

  test('ProgramBudgetLimitV1 declares exactly the implemented key set', () => {
    expect([...prdInterfaceFields(markdown, 'ProgramBudgetLimitV1')].sort()).toEqual(Object.keys(LIMITS).sort());
  });
});
