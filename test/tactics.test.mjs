import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectAdversaryTactics,
  detectUserTechniques,
  computeTacticalScore,
  ADVERSARY_PATTERNS,
  USER_PATTERNS,
} from '../src/tactics.mjs';

// ---------------------------------------------------------------------------
// Adversary tactics — Cialdini principles
// ---------------------------------------------------------------------------

describe('detectAdversaryTactics', () => {
  it('detects reciprocity (FR)', () => {
    const results = detectAdversaryTactics('Je vous ai déjà fait une concession importante.');
    assert.equal(results.length, 1);
    assert.equal(results[0].principle, 'reciprocity');
    assert.ok(results[0].evidence.length > 0);
    assert.ok(results[0].confidence >= 0.7);
  });

  it('detects scarcity (FR)', () => {
    const results = detectAdversaryTactics("C'est votre dernière chance, après c'est fini.");
    assert.equal(results.length, 1);
    assert.equal(results[0].principle, 'scarcity');
  });

  it('detects authority (EN)', () => {
    const results = detectAdversaryTactics('This is the industry standard for this type of deal.');
    assert.equal(results.length, 1);
    assert.equal(results[0].principle, 'authority');
  });

  it('detects consistency (FR)', () => {
    const results = detectAdversaryTactics("Vous aviez dit que 5% vous convenait la dernière fois.");
    assert.equal(results.length, 1);
    assert.equal(results[0].principle, 'consistency');
  });

  it('detects liking (FR)', () => {
    const results = detectAdversaryTactics("J'apprécie votre franchise, vraiment.");
    assert.equal(results.length, 1);
    assert.equal(results[0].principle, 'liking');
  });

  it('detects socialProof (FR)', () => {
    const results = detectAdversaryTactics('La plupart de nos clients acceptent ces termes.');
    assert.equal(results.length, 1);
    assert.equal(results[0].principle, 'socialProof');
  });

  it('detects unity (EN)', () => {
    const results = detectAdversaryTactics("We're in this together, let's make it work.");
    assert.equal(results.length, 1);
    assert.equal(results[0].principle, 'unity');
  });

  it('detects multiple principles in one message', () => {
    const results = detectAdversaryTactics(
      "Dernière chance! La plupart des gens acceptent. Vous aviez dit oui."
    );
    const principles = results.map((r) => r.principle);
    assert.ok(principles.includes('scarcity'));
    assert.ok(principles.includes('socialProof'));
    assert.ok(principles.includes('consistency'));
  });

  it('returns empty for neutral message (false positive resistance)', () => {
    const results = detectAdversaryTactics('Pouvons-nous discuter du prix demain matin ?');
    assert.equal(results.length, 0);
  });

  it('returns empty for empty input', () => {
    assert.deepEqual(detectAdversaryTactics(''), []);
    assert.deepEqual(detectAdversaryTactics(null), []);
  });
});

// ---------------------------------------------------------------------------
// User techniques — Chris Voss
// ---------------------------------------------------------------------------

describe('detectUserTechniques', () => {
  it('detects labeling (FR)', () => {
    const results = detectUserTechniques("On dirait que cette situation vous frustre.");
    assert.equal(results.length, 1);
    assert.equal(results[0].technique, 'labeling');
  });

  it('detects labeling (EN)', () => {
    const results = detectUserTechniques("It sounds like you're under a lot of pressure.");
    assert.equal(results.length, 1);
    assert.equal(results[0].technique, 'labeling');
  });

  it('detects calibratedQuestion (FR)', () => {
    const results = detectUserTechniques("Comment est-ce que je pourrais vous aider ?");
    assert.equal(results.length, 1);
    assert.equal(results[0].technique, 'calibratedQuestion');
  });

  it('detects calibratedQuestion (EN)', () => {
    const results = detectUserTechniques('How can we solve this together?');
    assert.equal(results.length, 1);
    assert.equal(results[0].technique, 'calibratedQuestion');
  });

  it('detects accusationAudit (FR)', () => {
    const results = detectUserTechniques("Vous allez probablement penser que je suis trop exigeant.");
    assert.equal(results.length, 1);
    assert.equal(results[0].technique, 'accusationAudit');
  });

  it('detects reframing (FR)', () => {
    const results = detectUserTechniques("Si on regarde autrement, c'est un investissement.");
    assert.equal(results.length, 1);
    assert.equal(results[0].technique, 'reframing');
  });

  it('detects mirroring with 2 consecutive words', () => {
    const adversary = 'Le budget est vraiment serré cette année';
    const user = 'Vraiment serré ?';
    const results = detectUserTechniques(user, adversary);
    const mirror = results.find((r) => r.technique === 'mirroring');
    assert.ok(mirror, 'mirroring should be detected');
    assert.ok(mirror.evidence.includes('vraiment') || mirror.evidence.includes('serre'));
  });

  it('detects mirroring with 3+ words', () => {
    const adversary = 'We cannot go below fifty thousand dollars on this deal';
    const user = 'Fifty thousand dollars?';
    const results = detectUserTechniques(user, adversary);
    const mirror = results.find((r) => r.technique === 'mirroring');
    assert.ok(mirror, 'mirroring should be detected with 3 consecutive words');
    assert.ok(mirror.quality >= 0.7, 'quality should be higher for longer mirror');
  });

  it('does NOT detect mirroring with only 1 shared word', () => {
    const adversary = 'The price is fixed.';
    const user = 'Fixed is interesting.';
    // "fixed" alone is not enough — need 2 consecutive
    const results = detectUserTechniques(user, adversary);
    const mirror = results.find((r) => r.technique === 'mirroring');
    assert.equal(mirror, undefined, 'single shared word should not trigger mirroring');
  });

  it('detects strategicSilence after pressure', () => {
    const adversary = "C'est votre dernière chance.";
    const user = 'Hmm.';
    const results = detectUserTechniques(user, adversary);
    const silence = results.find((r) => r.technique === 'strategicSilence');
    assert.ok(silence, 'short reply after scarcity pressure → strategicSilence');
  });

  it('does NOT detect strategicSilence without pressure', () => {
    const adversary = "D'accord, on peut en discuter.";
    const user = 'Ok.';
    const results = detectUserTechniques(user, adversary);
    const silence = results.find((r) => r.technique === 'strategicSilence');
    assert.equal(silence, undefined, 'short reply without pressure → no strategicSilence');
  });

  it('detects anchoringFirst when user is first to state a number', () => {
    const results = detectUserTechniques('Je propose 50 000€ pour ce contrat.', '', {
      firstAnchorBy: null,
    });
    const anchor = results.find((r) => r.technique === 'anchoringFirst');
    assert.ok(anchor, 'user should be detected as anchoring first');
  });

  it('does NOT detect anchoringFirst when adversary already anchored', () => {
    const results = detectUserTechniques('Je propose 50 000€.', '', {
      firstAnchorBy: 'adversary',
    });
    const anchor = results.find((r) => r.technique === 'anchoringFirst');
    assert.equal(anchor, undefined, 'should not trigger when adversary anchored first');
  });

  it('returns empty for neutral message (false positive resistance)', () => {
    const results = detectUserTechniques('Bonjour, merci pour votre temps.');
    assert.equal(results.length, 0);
  });
});

// ---------------------------------------------------------------------------
// computeTacticalScore
// ---------------------------------------------------------------------------

describe('computeTacticalScore', () => {
  it('returns 0 for no techniques', () => {
    const { score, breakdown } = computeTacticalScore([], 5);
    assert.equal(score, 0);
    assert.equal(breakdown.mirroring, 0);
    assert.equal(breakdown.labeling, 0);
  });

  it('computes a positive score with mixed techniques', () => {
    const techniques = [
      { technique: 'mirroring', quality: 0.8 },
      { technique: 'labeling', quality: 0.9 },
      { technique: 'calibratedQuestion', quality: 0.7 },
      { technique: 'reframing', quality: 0.8 },
    ];
    const { score, breakdown } = computeTacticalScore(techniques, 6);
    assert.ok(score > 0, 'score should be positive');
    assert.ok(score <= 100, 'score should be at most 100');
    assert.ok(breakdown.mirroring > 0);
    assert.ok(breakdown.labeling > 0);
    assert.ok(breakdown.calibratedQuestion > 0);
    assert.ok(breakdown.reframing > 0);
    assert.equal(breakdown.strategicSilence, 0);
  });

  it('never exceeds weight cap per technique', () => {
    // Spam mirroring — should still cap at 15
    const techniques = Array.from({ length: 20 }, () => ({
      technique: 'mirroring',
      quality: 1.0,
    }));
    const { breakdown } = computeTacticalScore(techniques, 5);
    assert.ok(breakdown.mirroring <= 15, 'mirroring should not exceed its weight of 15');
  });

  it('score sums to breakdown values', () => {
    const techniques = [
      { technique: 'mirroring', quality: 0.7 },
      { technique: 'accusationAudit', quality: 0.8 },
      { technique: 'anchoringFirst', quality: 0.9 },
    ];
    const { score, breakdown } = computeTacticalScore(techniques, 4);
    const sum = Object.values(breakdown).reduce((a, b) => a + b, 0);
    assert.equal(score, Math.min(100, Math.round(sum)));
  });
});

// ---------------------------------------------------------------------------
// Pattern list exports are available
// ---------------------------------------------------------------------------

describe('exported pattern lists', () => {
  it('ADVERSARY_PATTERNS has all 7 Cialdini principles', () => {
    const keys = Object.keys(ADVERSARY_PATTERNS);
    for (const p of ['reciprocity', 'scarcity', 'authority', 'consistency', 'liking', 'socialProof', 'unity']) {
      assert.ok(keys.includes(p), `missing principle: ${p}`);
    }
  });

  it('USER_PATTERNS has expected techniques', () => {
    const keys = Object.keys(USER_PATTERNS);
    for (const t of ['labeling', 'calibratedQuestion', 'accusationAudit', 'reframing']) {
      assert.ok(keys.includes(t), `missing technique: ${t}`);
    }
  });
});
