import { defineConfig } from 'vitest/config';

// Dedicated config so the honest-model eval runs outside the default suite.
//   npx vitest run --config scripts/vitest.honest.config.ts --disable-console-intercept
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['scripts/honest-eval.ts'],
  },
});
