import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/e2e.xml' }]],
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'node api/tests/e2e-server.js', url: 'http://127.0.0.1:4100/api/health',
      reuseExistingServer: false, gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 } },
    { command: 'npm --prefix front-react run start', env: { HOSTNAME: '127.0.0.1', PORT: '3100' },
      url: 'http://127.0.0.1:3100/login', reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 } },
  ],
});
