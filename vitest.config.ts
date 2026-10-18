import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      DB_PATH: ':memory:',
      TRACE_PATH: path.join(process.cwd(), 'data', 'test-trace.jsonl'),
      FO_MODE: 'fake',
    },
    testTimeout: 20000,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
