import { defineConfig } from 'vitest/config';

// Self-contained config so the script's tests don't pick up the parent
// Next.js project's vitest config (which uses @vitejs/plugin-react).
export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
  },
  // Prevent Vite from climbing up the directory tree to find the parent
  // project's postcss.config.mjs (which references @tailwindcss/postcss
  // not installed in this self-contained package). Inline empty config
  // short-circuits the search.
  css: {
    postcss: { plugins: [] },
  },
});
