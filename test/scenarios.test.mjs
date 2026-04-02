import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { listScenarios, loadScenario } from '../scenarios/index.mjs';
import { assertValidBrief } from '../src/scenario.mjs';
import { assertValidAdversary } from '../src/persona.mjs';

describe('scenarios', () => {
  it('listScenarios returns at least 8 scenarios', async () => {
    const list = await listScenarios();
    assert.ok(list.length >= 8, `Expected >= 8, got ${list.length}`);
  });

  it('each scenario has stable summary metadata', async () => {
    const list = await listScenarios();
    for (const s of list) {
      assert.equal(typeof s.id, 'string');
      assert.equal(typeof s.name, 'string');
      assert.equal(typeof s.description, 'string');
      assert.equal(typeof s.category, 'string');
      assert.equal(typeof s.scenarioFile, 'string');
      assert.equal(s.scenarioFile, s.id);
      assert.equal(s.metadata.id, s.id);
      assert.equal(s.metadata.scenarioFile, s.id);
      assert.equal(s.metadata.category, s.category);
    }
  });

  it('loadScenario salary-negotiation returns valid brief, adversary, and metadata', async () => {
    const { brief, adversary, metadata } = await loadScenario('salary-negotiation');
    assert.ok(brief.objective);
    assert.ok(adversary.identity);
    assert.equal(metadata.id, 'salary-negotiation');
    assert.equal(metadata.scenarioFile, 'salary-negotiation');
    assert.equal(metadata.category, 'core');
    assert.equal(metadata.tier, 'neutral');
  });

  it('loadScenario with tier hostile overrides difficulty', async () => {
    const { brief } = await loadScenario('salary-negotiation', 'hostile');
    assert.equal(brief.difficulty, 'hostile');
  });

  it('loadScenario with unknown id throws', async () => {
    await assert.rejects(() => loadScenario('nonexistent'), { message: /not found/i });
  });

  it('all scenario briefs pass assertValidBrief', async () => {
    const list = await listScenarios();
    for (const s of list) {
      const { brief } = await loadScenario(s.id);
      assert.doesNotThrow(() => assertValidBrief(brief), `Brief for ${s.id} is invalid`);
    }
  });

  it('all scenario adversaries pass assertValidAdversary', async () => {
    const list = await listScenarios();
    for (const s of list) {
      const { adversary } = await loadScenario(s.id);
      assert.doesNotThrow(() => assertValidAdversary(adversary), `Adversary for ${s.id} is invalid`);
    }
  });

  it('loads the swiss real-estate scenarios', async () => {
    for (const id of ['swiss-lease-renegotiation', 'swiss-property-purchase', 'swiss-regie-owner-conflict']) {
      const { brief, adversary, metadata } = await loadScenario(id);
      assert.ok(brief.objective, `missing objective for ${id}`);
      assert.ok(adversary.identity, `missing adversary for ${id}`);
      assert.equal(metadata.category, 'swiss');
      assert.equal(metadata.scenarioFile, id);
    }
  });
});
