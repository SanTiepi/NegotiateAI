import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:3000',
    headless: true,
  },
  webServer: {
    command: 'node -e "import(\'./src/web-app.mjs\').then(async({startWebServer})=>{await startWebServer({port:3000,host:\'127.0.0.1\'})})"',
    port: 3000,
    reuseExistingServer: true,
    timeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
