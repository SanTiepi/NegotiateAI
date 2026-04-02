import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { anonymizeSessionTitle, buildHallOfFameExcerpt, buildHallOfFameStories, formatHallOfFameStories } from '../src/hall-of-fame.mjs';

function makeSession(overrides = {}) {
  return {
    id: overrides.id || 'sess-1',
    date: overrides.date || '2026-04-02T06:00:00.000Z',
    turns: overrides.turns ?? 4,
    brief: {
      situation: 'Achat appartement a 850 000 CHF avec vendeur presse',
      difficulty: 'neutral',
      ...(overrides.brief || {}),
    },
    transcript: overrides.transcript || [
      { role: 'user', content: 'Je peux signer cette semaine si on descend a 810000 CHF.' },
      { role: 'assistant', content: 'Impossible, j ai deja une offre a 835000 CHF.' },
    ],
    feedback: {
      globalScore: overrides.score ?? 84,
      recommendations: overrides.recommendations || ['Ancre plus haut des le premier tour.'],
    },
  };
}

describe('hall-of-fame', () => {
  it('anonymizeSessionTitle removes raw monetary details', () => {
    const title = anonymizeSessionTitle(makeSession(), 0);
    assert.match(title, /Operateur vs Interlocuteur/);
    assert.doesNotMatch(title, /850/);
    assert.match(title, /\[montant\]/);
  });

  it('buildHallOfFameExcerpt redacts money and percentages', () => {
    const excerpt = buildHallOfFameExcerpt(makeSession({
      transcript: [
        { role: 'user', content: 'Je propose 780000 CHF soit 8% sous le prix.' },
        { role: 'assistant', content: 'Je peux faire 2% de geste.' },
      ],
    }));
    assert.doesNotMatch(excerpt, /780000|8%|2%/);
    assert.match(excerpt, /\[montant\]|\[pourcentage\]/);
  });

  it('buildHallOfFameStories ranks by score then by fewer turns', () => {
    const stories = buildHallOfFameStories([
      makeSession({ id: 'silver', score: 91, turns: 5 }),
      makeSession({ id: 'gold', score: 95, turns: 6 }),
      makeSession({ id: 'tie-break', score: 91, turns: 3 }),
    ]);

    assert.equal(stories[0].sessionId, 'gold');
    assert.equal(stories[1].sessionId, 'tie-break');
    assert.equal(stories[2].sessionId, 'silver');
  });

  it('formatHallOfFameStories produces a readable digest', () => {
    const text = formatHallOfFameStories(buildHallOfFameStories([makeSession({ id: 'gold', score: 95 })]));
    assert.match(text, /#1/);
    assert.match(text, /Score 95\/100/);
    assert.match(text, /Ouverture:/);
  });
});
