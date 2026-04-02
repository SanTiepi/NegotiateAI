import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCoachingLevels } from '../src/coach.mjs';

describe('coach', () => {
  it('builds explicit level 1-3 coaching outputs', () => {
    const levels = buildCoachingLevels({
      userMessage: 'Take it or leave it.',
      adversaryResponse: 'That sounds rigid.',
      coaching: {
        biasDetected: 'conflict_avoidance',
        alternative: 'Reframe around objective criteria',
        momentum: 'losing',
        tip: 'Slow down and ask a calibrated question',
      },
      biasIndicators: [
        { biasType: 'anchoring', severity: 0.2 },
        { biasType: 'conflict_avoidance', severity: 0.9 },
      ],
      userTechniques: [
        { technique: 'reframing', quality: 0.8 },
        { technique: 'labeling', quality: 0.5 },
      ],
    });

    assert.match(levels.observer, /conflict_avoidance/i);
    assert.match(levels.observer, /losing/i);
    assert.match(levels.observer, /reframing/i);
    assert.match(levels.suggest, /Reframe around objective criteria/i);
    assert.match(levels.draft, /Proposition de reformulation/i);
    assert.equal(levels.modeLabels.level3, 'draft');
  });

  it('falls back to tip when no alternative exists', () => {
    const levels = buildCoachingLevels({
      userMessage: 'Fine.',
      adversaryResponse: 'Can you be more specific?',
      coaching: { momentum: 'stable', tip: 'Ask what would make the deal workable' },
      biasIndicators: [],
      userTechniques: [],
    });

    assert.match(levels.suggest, /Ask what would make the deal workable/i);
    assert.match(levels.draft, /Ask what would make the deal workable/i);
  });
});
