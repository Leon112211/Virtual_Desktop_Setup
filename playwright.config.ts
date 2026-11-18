import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    viewport: { width: 1440, height: 960 },
    headless: true,
    channel: 'chromium',
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
    },
  },
  reporter: 'list',
});
