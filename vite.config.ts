import { defineConfig } from 'vitest/config';

// Tauri expects a fixed dev port and must not have its own files watched by Vite.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: { target: 'es2021' },
  test: { include: ['tests/**/*.test.ts'] },
});
