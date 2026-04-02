import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createMockProvider } from '../src/provider.mjs';
import { runSimulateBatchCli } from '../src/cli/simulate-batch-cli.mjs';

const BASE_BRIEF = {
  situation: 'Achat appartement Lausanne',
  userRole: 'Acheteur',
  adversaryRole: 'Vendeur',
  objective: 'Signer a 780000 CHF',
  minimalThreshold: '820000 CHF maximum',
  batna: 'Deux autres biens similaires cette semaine',
  difficulty: 'neutral',
};

const BASE_ADVERSARY = {
  identity: 'Proprietaire vendeur',
  style: 'Calme mais ferme',
  publicObjective: 'Vendre vite sans trop baisser',
  hiddenObjective: 'Eviter une autre visite infructueuse',
  batna: 'Relancer une agence a 845000 CHF',
  nonNegotiables: ['Signature rapide'],
  timePressure: 'Moderee',
  emotionalProfile: { confidence: 65, frustration: 15, egoThreat: 10 },
  likelyTactics: ['Rareté', 'Ancrage haut'],
  vulnerabilities: ['Calendrier serre'],
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

describe('simulate-batch-cli', () => {
  it('prints usage when required args are missing', async () => {
    const stdout = createWritableCapture();
    const stderr = createWritableCapture();

    const code = await runSimulateBatchCli({
      argv: [],
      stdout: stdout.stream,
      stderr: stderr.stream,
    });

    assert.equal(code, 0);
    assert.match(stdout.text, /Simulate Batch CLI/);
    assert.match(stdout.text, /--messages variants\.txt/);
    assert.equal(stderr.text, '');
  });

  it('ranks variants from files with a mock provider', async () => {
    const stdout = createWritableCapture();
    const stderr = createWritableCapture();
    const provider = createMockProvider({
      turn: {
        adversaryResponse: 'Quel est votre dossier de financement ?',
        sessionOver: false,
        endReason: null,
      },
      coaching: { biasDetected: null, alternative: null, momentum: 'stable', tip: 'Soyez concret.' },
      offerSimulation: ({ prompt }) => {
        if (prompt.includes('Version 1')) {
          return {
            sendVerdict: 'revise', approvalScore: 64, predictedOutcome: 'Trop vague.', riskLevel: 'medium',
            likelyObjections: ['Prix trop bas'], strengths: ['Poli'], vulnerabilities: ['Pas d ancrage'],
            recommendedRewrite: 'Version 1 rewrite',
          };
        }
        if (prompt.includes('Version 2')) {
          return {
            sendVerdict: 'send', approvalScore: 88, predictedOutcome: 'Bonne ouverture.', riskLevel: 'low',
            likelyObjections: ['Delai de signature'], strengths: ['BATNA clair'], vulnerabilities: ['Peu d empathie'],
            recommendedRewrite: 'Version 2 rewrite',
          };
        }
        return {
          sendVerdict: 'send', approvalScore: 79, predictedOutcome: 'Correct.', riskLevel: 'medium',
          likelyObjections: ['Financement'], strengths: ['Chiffres'], vulnerabilities: ['Ton sec'],
          recommendedRewrite: 'Version 3 rewrite',
        };
      },
    });

    const files = new Map([
      ['brief.json', JSON.stringify(BASE_BRIEF)],
      ['adversary.json', JSON.stringify(BASE_ADVERSARY)],
      ['variants.txt', 'Version 1\nVersion 2\nVersion 3\n'],
      ['transcript.json', JSON.stringify([{ role: 'adversary', content: 'Le prix affiche est ferme.' }])],
    ]);

    const code = await runSimulateBatchCli({
      argv: ['--brief', 'brief.json', '--adversary', 'adversary.json', '--messages', 'variants.txt', '--transcript', 'transcript.json'],
      provider,
      stdout: stdout.stream,
      stderr: stderr.stream,
      readFileImpl: async (filePath) => files.get(filePath),
    });

    assert.equal(code, 0);
    assert.match(stdout.text, /Simulate Batch Verdict/);
    assert.match(stdout.text, /Meilleure option:/);
    assert.match(stdout.text, /#2/);
    assert.match(stdout.text, /Version 2/);
    assert.match(stdout.text, /88\/100/);
    assert.equal(stderr.text, '');
  });

  it('supports packaged scenarios via loadScenario injection', async () => {
    const stdout = createWritableCapture();
    const stderr = createWritableCapture();
    const provider = createMockProvider({
      turn: { adversaryResponse: 'Possible.', sessionOver: false, endReason: null },
      coaching: { biasDetected: null, alternative: null, momentum: 'gaining', tip: 'Bon angle.' },
      offerSimulation: {
        sendVerdict: 'send', approvalScore: 81, predictedOutcome: 'Solide.', riskLevel: 'low',
        likelyObjections: ['Calendrier'], strengths: ['Clarte'], vulnerabilities: ['Ancrage perfectible'],
        recommendedRewrite: 'Gardez cette structure.',
      },
    });

    const code = await runSimulateBatchCli({
      argv: ['--scenario', 'swiss-property-purchase', '--tier', 'neutral', '--messages', 'variants.txt'],
      provider,
      stdout: stdout.stream,
      stderr: stderr.stream,
      readFileImpl: async () => 'Offre A\n',
      loadScenarioImpl: async (id, tier) => {
        assert.equal(id, 'swiss-property-purchase');
        assert.equal(tier, 'neutral');
        return { brief: BASE_BRIEF, adversary: BASE_ADVERSARY };
      },
    });

    assert.equal(code, 0);
    assert.match(stdout.text, /#1/);
    assert.equal(stderr.text, '');
  });

  it('returns an error when more than 5 variants are provided', async () => {
    const stdout = createWritableCapture();
    const stderr = createWritableCapture();

    const files = new Map([
      ['brief.json', JSON.stringify(BASE_BRIEF)],
      ['adversary.json', JSON.stringify(BASE_ADVERSARY)],
      ['variants.txt', '1\n2\n3\n4\n5\n6\n'],
    ]);

    const code = await runSimulateBatchCli({
      argv: ['--brief', 'brief.json', '--adversary', 'adversary.json', '--messages', 'variants.txt'],
      stdout: stdout.stream,
      stderr: stderr.stream,
      readFileImpl: async (filePath) => files.get(filePath),
    });

    assert.equal(code, 1);
    assert.match(stderr.text, /up to 5 variants/i);
  });
});
