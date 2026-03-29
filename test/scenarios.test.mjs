import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { listScenarios, loadScenario } from '../scenarios/index.mjs';
import { assertValidBrief } from '../src/scenario.mjs';
import { assertValidAdversary } from '../src/persona.mjs';

describe('scenarios', () => {
  it('listScenarios returns at least 5 scenarios', async () => {
    const list = await listScenarios();
    assert.ok(list.length >= 5, `Expected >= 5, got ${list.length}`);
  });

  it('each scenario has id, name, description', async () => {
    const list = await listScenarios();
    for (const s of list) {
      assert.equal(typeof s.id, 'string');
      assert.equal(typeof s.name, 'string');
      assert.equal(typeof s.description, 'string');
    }
  });

  it('loadScenario salary-negotiation returns valid brief and adversary', async () => {
    const { brief, adversary } = await loadScenario('salary-negotiation');
    assert.ok(brief.objective);
    assert.ok(adversary.identity);
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
});
