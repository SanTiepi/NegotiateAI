import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createMockProvider } from '../src/provider.mjs';
import { runVersusCli } from '../src/cli/versus-cli.mjs';

const BASE_BRIEF = {
  situation: 'Renouvellement fournisseur',
  userRole: 'Acheteur',
  adversaryRole: 'Fournisseur',
  objective: 'Signer avec 10% de reduction',
  minimalThreshold: 'Au moins 5% de reduction',
  batna: 'Basculer chez un concurrent en 30 jours',
  difficulty: 'neutral',
};

function createWritableCapture() {
  let output = '';
  return {
    stream: {
      write(chunk) {
        output += String(chunk);
      },
    },
    get text() {
      return output;
    },
  };
}

describe('versus-cli', () => {
  it('prints usage when required args are missing', async () => {
    const stdout = createWritableCapture();
    const stderr = createWritableCapture();

    const code = await runVersusCli({
      argv: [],
      stdout: stdout.stream,
      stderr: stderr.stream,
    });

    assert.equal(code, 0);
    assert.match(stdout.text, /Versus CLI/);
    assert.match(stdout.text, /--brief brief\.json/);
    assert.equal(stderr.text, '');
  });

  it('adjudicates a versus round from a brief file with a mock provider', async () => {
    const stdout = createWritableCapture();
    const stderr = createWritableCapture();
    const provider = createMockProvider({
      versusJudgment: {
        winner: 'playerB',
        scoreA: { clarity: 71, leverage: 66, emotionalControl: 70, batnaDiscipline: 64, total: 68 },
        scoreB: { clarity: 84, leverage: 79, emotionalControl: 82, batnaDiscipline: 86, total: 83 },
        rationale: 'Message B cadre mieux le BATNA et garde un ton ferme.',
        coachingA: ['Nomme plus vite ton alternative.'],
        coachingB: ['Garde cette structure concise.'],
        swingFactors: ['BATNA discipline', 'Clarity'],
      },
    });

    const files = new Map([
      ['brief.json', JSON.stringify(BASE_BRIEF)],
    ]);

    const code = await runVersusCli({
      argv: ['--brief', 'brief.json', '--message-a', 'Pouvez-vous faire un geste ?', '--message-b', 'Nous signons cette semaine a -10%, sinon nous activons notre alternative.'],
      provider,
      stdout: stdout.stream,
      stderr: stderr.stream,
      readFileImpl: async (filePath) => files.get(filePath),
    });

    assert.equal(code, 0);
    assert.match(stdout.text, /Versus Verdict/);
    assert.match(stdout.text, /Vainqueur:/);
    assert.match(stdout.text, /Message B/);
    assert.match(stdout.text, /83\/100/);
    assert.match(stdout.text, /BATNA discipline/);
    assert.match(stdout.text, /Coach A/);
    assert.equal(stderr.text, '');
  });

  it('returns an error code when the brief file is invalid', async () => {
    const stdout = createWritableCapture();
    const stderr = createWritableCapture();

    const code = await runVersusCli({
      argv: ['--brief', 'missing.json', '--message-a', 'A', '--message-b', 'B'],
      stdout: stdout.stream,
      stderr: stderr.stream,
      readFileImpl: async () => { throw new Error('ENOENT: missing.json'); },
    });

    assert.equal(code, 1);
    assert.match(stderr.text, /ENOENT/);
  });
});
