#!/usr/bin/env node
// profile-cli.mjs — Display cognitive vaccination card and offer shareable copy

import { createStore } from '../store.mjs';
import { evaluateBelts } from '../belt.mjs';
import { updateBiasProfile } from '../biasTracker.mjs';
import { generateVaccinationCard, formatVaccinationCard, formatShareableCard } from '../vaccination.mjs';
import { createInterface } from 'node:readline';
import { exec } from 'node:child_process';

async function main() {
  const store = createStore();
  const sessions = await store.loadSessions();
  const progression = await store.loadProgression();

  // Ensure belts are up to date
  if (!progression.belts || Object.keys(progression.belts).length === 0) {
    progression.belts = evaluateBelts(sessions);
  }

  // Ensure bias profile is populated
  if (!progression.biasProfile || typeof progression.biasProfile !== 'object' || Array.isArray(progression.biasProfile)) {
    progression.biasProfile = {};
  }

  const card = generateVaccinationCard(progression, sessions);

  console.log('');
  console.log(formatVaccinationCard(card));
  console.log('');

  // Ask if user wants to copy shareable version
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Copier la version partageable dans le presse-papier ? (o/n) ', (answer) => {
    if (answer.trim().toLowerCase() === 'o' || answer.trim().toLowerCase() === 'oui') {
      const shareText = formatShareableCard(card);
      const platform = process.platform;
      let cmd;
      if (platform === 'win32') {
        cmd = 'clip';
      } else if (platform === 'darwin') {
        cmd = 'pbcopy';
      } else {
        cmd = 'xclip -selection clipboard';
      }

      const child = exec(cmd);
      child.stdin.write(shareText);
      child.stdin.end();
      child.on('close', () => {
        console.log('\n\u2705 Copié ! Voici un aperçu:\n');
        console.log(shareText);
        rl.close();
      });
      child.on('error', () => {
        console.log('\nImpossible de copier. Voici le texte:\n');
        console.log(shareText);
        rl.close();
      });
    } else {
      rl.close();
    }
  });
}

main().catch((e) => { console.error(e.message); process.exit(1); });
