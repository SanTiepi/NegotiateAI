import { createAnthropicProvider } from '../provider.mjs';
import { createStore } from '../store.mjs';
import { createTelegramBot, createTelegramPollingRuntime } from '../telegram-bot.mjs';

const token = process.env.TELEGRAM_BOT_TOKEN;
const apiKey = process.env.ANTHROPIC_API_KEY;

if (!token) {
  console.error('Missing TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

if (!apiKey) {
  console.error('Missing ANTHROPIC_API_KEY');
  process.exit(1);
}

const provider = createAnthropicProvider({ apiKey });
const store = createStore();
const bot = createTelegramBot({ provider, token, store });
const runtime = createTelegramPollingRuntime({
  bot,
  token,
  onError(error) {
    console.error('[telegram-bot]', error instanceof Error ? error.message : error);
  },
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    runtime.stop();
  });
}

console.log('NegotiateAI Telegram bot polling started');
await runtime.start();
console.log('NegotiateAI Telegram bot polling stopped');
