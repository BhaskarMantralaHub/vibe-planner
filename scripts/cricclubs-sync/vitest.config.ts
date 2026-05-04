import { defineConfig } from 'vitest/config';

// Self-contained config so the script's tests don't pick up the parent
// Next.js project's vitest config (which uses @vitejs/plugin-react).
export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
