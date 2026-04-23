import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "AUTH_SECRET=e2e-secret DATABASE_URL=postgresql://portal:portal@localhost:5432/portal?schema=public E2E_AUTH_BYPASS=true npm run dev",
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
