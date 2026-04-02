import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createMockProvider } from '../src/provider.mjs';
import { adjudicateVersusRound, assertValidVersusJudgment } from '../src/versus.mjs';

const BASE_BRIEF = {
  situation: 'A supplier renewal is on the table.',
  userRole: 'Buyer',
  adversaryRole: 'Supplier',
  objective: 'Reduce yearly spend by 10%',
  minimalThreshold: 'At least 5% reduction',
  batna: 'Switch to a backup supplier within 30 days',
  difficulty: 'neutral',
};

describe('versus', () => {
  it('adjudicates a versus round with the provider verdict', async () => {
    const provider = createMockProvider({
      versusJudgment: {
        winner: 'playerA',
        scoreA: { clarity: 82, leverage: 85, emotionalControl: 78, batnaDiscipline: 88, total: 83 },
        scoreB: { clarity: 70, leverage: 66, emotionalControl: 62, batnaDiscipline: 55, total: 63 },
        rationale: 'Player A protected BATNA and made the cleaner ask.',
        coachingA: ['Keep the ask concise.'],
        coachingB: ['Anchor around your fallback sooner.'],
        swingFactors: ['BATNA discipline', 'Concise framing'],
      },
    });

    const judgment = await adjudicateVersusRound({
      brief: BASE_BRIEF,
      playerA: { name: 'Alice', message: 'We can sign this week at 10% lower, otherwise we shift the volume to our backup supplier.' },
      playerB: { name: 'Bob', message: 'We would prefer a premium renewal and maybe can discuss a gesture later.' },
    }, provider);

    assert.equal(judgment.winner, 'playerA');
    assert.equal(judgment.scoreA.total, 83);
    assert.equal(judgment.coachingB[0], 'Anchor around your fallback sooner.');
  });

  it('falls back to heuristic judgment when provider fails', async () => {
    const provider = createMockProvider({
      versusJudgment: () => {
        throw new Error('provider down');
      },
    });

    const judgment = await adjudicateVersusRound({
      brief: BASE_BRIEF,
      playerA: { message: 'We can close today if you match 10% and I have a backup supplier if not.' },
      playerB: { message: 'Please reconsider.' },
    }, provider);

    assert.equal(judgment.winner, 'playerA');
    assert.match(judgment.rationale, /Fallback judgment/);
    assert.ok(judgment.scoreA.total > judgment.scoreB.total);
  });

  it('rejects invalid judgments', () => {
    assert.throws(() => assertValidVersusJudgment({ winner: 'nobody' }), /winner/);
  });

  it('requires both player messages', async () => {
    const provider = createMockProvider({ versusJudgment: {} });
    await assert.rejects(() => adjudicateVersusRound({
      brief: BASE_BRIEF,
      playerA: { message: 'Hello' },
      playerB: { message: '' },
    }, provider), /playerB.message is required/);
  });
});
