import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generatePersona, assertValidAdversary } from '../src/persona.mjs';
import { createMockProvider } from '../src/provider.mjs';

const MOCK_BRIEF = {
  situation: 'Lease renewal negotiation',
  userRole: 'Tenant',
  adversaryRole: 'Landlord',
  objective: 'Reduce rent by 10%',
  minimalThreshold: 'Keep rent unchanged',
  batna: 'Move to a cheaper apartment nearby',
  constraints: ['Must stay in same neighborhood'],
  difficulty: 'hostile',
  relationalStakes: 'Low — willing to move',
};

const MOCK_ADVERSARY = {
  identity: 'Marc Dupont, landlord for 15 years',
  style: 'Aggressive and dismissive',
  publicObjective: 'Maintain current rent level',
  hiddenObjective: 'Avoid vacancy — last tenant search took 3 months',
  batna: 'Find a new tenant at market rate',
  nonNegotiables: ['No more than 5% reduction', 'Minimum 2-year lease'],
  timePressure: 'Moderate — lease expires in 30 days',
  emotionalProfile: { confidence: 80, frustration: 20, egoThreat: 10 },
  likelyTactics: ['Anchoring high', 'Appeal to market rates', 'Feigned indifference'],
  vulnerabilities: ['Fear of vacancy', 'Pressure from mortgage payments'],
};

describe('persona', () => {
  it('generates a complete adversary from brief and provider', async () => {
    const provider = createMockProvider({ adversary: MOCK_ADVERSARY });
    const adversary = await generatePersona(MOCK_BRIEF, provider);
    assert.equal(typeof adversary.identity, 'string');
    assert.ok(adversary.identity.length > 0);
    assert.equal(typeof adversary.style, 'string');
    assert.equal(typeof adversary.publicObjective, 'string');
    assert.equal(typeof adversary.hiddenObjective, 'string');
    assert.equal(typeof adversary.batna, 'string');
    assert.ok(Array.isArray(adversary.nonNegotiables));
    assert.equal(typeof adversary.timePressure, 'string');
    assert.equal(typeof adversary.emotionalProfile, 'object');
    assert.equal(typeof adversary.emotionalProfile.confidence, 'number');
    assert.equal(typeof adversary.emotionalProfile.frustration, 'number');
    assert.equal(typeof adversary.emotionalProfile.egoThreat, 'number');
    assert.ok(Array.isArray(adversary.likelyTactics));
    assert.ok(Array.isArray(adversary.vulnerabilities));
  });

  it('passes the brief context to the provider', async () => {
    let capturedReq;
    const provider = createMockProvider({
      adversary: (req) => {
        capturedReq = req;
        return MOCK_ADVERSARY;
      },
    });
    await generatePersona(MOCK_BRIEF, provider);
    assert.ok(capturedReq.prompt.includes(MOCK_BRIEF.adversaryRole));
    assert.ok(capturedReq.prompt.includes(MOCK_BRIEF.difficulty));
  });

  describe('assertValidAdversary', () => {
    it('does not throw for a valid adversary', () => {
      assert.doesNotThrow(() => assertValidAdversary(MOCK_ADVERSARY));
    });

    it('throws for an adversary missing identity', () => {
      const { identity, ...incomplete } = MOCK_ADVERSARY;
      assert.throws(() => assertValidAdversary(incomplete));
    });

    it('throws for an adversary missing emotionalProfile', () => {
      const { emotionalProfile, ...incomplete } = MOCK_ADVERSARY;
      assert.throws(() => assertValidAdversary(incomplete));
    });
  });
});
