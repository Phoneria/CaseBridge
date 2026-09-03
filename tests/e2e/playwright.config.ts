import { defineConfig, devices } from "@playwright/test";
import path from "path";

const BACKEND_PORT = 8010;
const FRONTEND_PORT = 3010;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`;

const backendDir = path.resolve(__dirname, "../../backend");
const frontendDir = path.resolve(__dirname, "../../frontend");
const e2eDbPath = path.resolve(__dirname, "e2e.db");

export default defineConfig({
  testDir: "./specs",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: FRONTEND_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // No hardcoded executablePath: uses Playwright's normal browser
        // resolution (its managed install under ~/.cache or
        // PLAYWRIGHT_BROWSERS_PATH) so this config is portable across
        // machines/CI. Override only via the standard
        // PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH env var if a specific
        // machine needs a pinned/system Chromium.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
          : {},
      },
    },
  ],
  webServer: [
    {
      command: `sh -c "rm -f '${e2eDbPath}' && .venv/bin/python -m app.db.seed && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port ${BACKEND_PORT}"`,
      cwd: backendDir,
      url: `${BACKEND_URL}/health`,
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: `sqlite:///${e2eDbPath}`,
        JWT_SECRET: "e2e-test-secret",
        EXTRA_CORS_ORIGINS: FRONTEND_URL,
      },
    },
    {
      command: `npm run dev -- --port ${FRONTEND_PORT}`,
      cwd: frontendDir,
      url: FRONTEND_URL,
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_API_URL: BACKEND_URL,
      },
    },
  ],
});
