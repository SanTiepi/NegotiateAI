#!/usr/bin/env node
// hall-of-fame-cli.mjs — display anonymized top sessions

import { createStore } from '../store.mjs';
import { buildHallOfFameStories, formatHallOfFameStories } from '../hall-of-fame.mjs';

async function main() {
  const store = createStore();
  const sessions = await store.loadSessions();
  const entries = buildHallOfFameStories(sessions, { limit: Number(process.argv[2]) || 5 });
  console.log('\n=== NegotiateAI — Hall of Fame (anonymise) ===\n');
  console.log(formatHallOfFameStories(entries));
  console.log('');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
