import { defineConfig } from 'vitest/config';

// Dedicated config so the seed-stability harness runs OUTSIDE the default
// engine test suite (vite.config.ts only globs src/engine/**/*.test.ts).
// Keeps verify.sh's `vitest run` clean while letting us run the measurement
// on demand:  npx vitest run --config scripts/vitest.seed.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['scripts/seed-stability.ts'],
  },
});
