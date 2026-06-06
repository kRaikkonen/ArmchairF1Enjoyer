import { defineConfig } from 'vitest/config';

// Dedicated config so the consistency diagnostic runs OUTSIDE the default engine
// test suite (vite.config.ts only globs src/engine/**/*.test.ts). On-demand:
//   npx vitest run --config scripts/vitest.diag.config.ts --disable-console-intercept
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['scripts/engine-consistency.ts'],
  },
});
