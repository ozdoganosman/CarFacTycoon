import { defineConfig } from 'vitest/config';

// Long-running headless playthroughs used to tune game balance (not part of `npm test`).
export default defineConfig({
  test: {
    include: ['scripts/**/*.balance.ts'],
    testTimeout: 600_000,
  },
});
