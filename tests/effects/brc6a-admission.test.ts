import { fixtureTemplate } from '../helpers/repo-fixture';
import { afterAll, describe, expect, test } from 'bun:test';
import { rmSync } from 'fs';
import { adoptIssueBatch } from '../../src/effects/automation/issue-batch-adoption';
import { readIssueBatchAdoptionArtifact } from '../../src/effects/automation/issue-batch-store';
import { installHistoricalAdoption, historicalPlanningFixture } from '../helpers/historical-campaign-lifecycle';
import { runCampaignPlanningStep } from '../../src/effects/automation/campaign-planning';
import { runCampaignAcquisition } from '../../src/effects/automation/campaign-acquisition';
import { createAdoptionRepository } from '../helpers/campaign-adoption-repository';

const adoptionTemplates = fixtureTemplate(createAdoptionRepository);
const planningTemplates = fixtureTemplate(historicalPlanningFixture);
afterAll(() => { adoptionTemplates.dispose(); planningTemplates.dispose(); });

describe('BRC6a active revision admission', () => {
  test('refuses historical adoption replay without upgrading content evidence', async () => {
    const f = await adoptionTemplates.materialize('active', 1, 'capability.runtime-harness.fixture');
    f.resetCalls();
    try {
      installHistoricalAdoption(f);
      const before = readIssueBatchAdoptionArtifact(f.root, f.intent, 'publication');
      await expect(adoptIssueBatch(f.input, f.deps)).rejects.toThrow('trusted exact revision readback');
      expect(f.calls()).toBe(0);
      expect(readIssueBatchAdoptionArtifact(f.root, f.intent, 'publication')).toEqual(before);
    } finally { rmSync(f.root, {recursive:true,force:true}); rmSync(f.home,{recursive:true,force:true}); }
  });
  test('historical materialization cannot admit planning or acquisition', async () => {
    const f = await planningTemplates.materialize();
    let effects = 0;
    try {
      expect(() => runCampaignPlanningStep(f.executeInput, { preflight: () => { effects++; throw new Error('called'); }, refresh: () => { effects++; throw new Error('called'); } })).toThrow('trusted exact revision readback');
      expect(() => runCampaignAcquisition(f.executeInput, () => { effects++; throw new Error('called'); })).toThrow('trusted exact revision readback');
      expect(effects).toBe(0);
    } finally { rmSync(f.root, {recursive:true,force:true}); rmSync(f.home,{recursive:true,force:true}); }
  });
  test('refuses active adoption before challenge, observation or publication', async () => {
    const f = await adoptionTemplates.materialize();
    f.resetCalls();
    let observations = 0;
    try {
      await expect(adoptIssueBatch(f.input, { ...f.deps, observe: (...args) => {
        observations++;
        return f.deps.observe!(...args);
      } })).rejects.toThrow('trusted exact revision readback');
      expect(f.calls()).toBe(0);
      expect(observations).toBe(0);
      for (const kind of ['challenge', 'response', 'adoption', 'publication'] as const) {
        expect(readIssueBatchAdoptionArtifact(f.root, f.intent, kind)).toBeNull();
      }
    } finally {
      rmSync(f.root, { recursive: true, force: true });
      rmSync(f.home, { recursive: true, force: true });
    }
  });
});
