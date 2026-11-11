import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://test:test@127.0.0.1:1/test',
      JWT_SECRET: 'test-jwt-secret-0123456789abcdef0123456789',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef01234',
      IP_HASH_SALT: 'test-ip-salt-0123456789',
      ADMIN_API_TOKEN: 'test-admin-token-0123456789abcdef',
      ML_INTERNAL_TOKEN: 'test-ml-token-0123456789abcdef0123',
      ML_SERVICE_URL: 'http://127.0.0.1:1',
      UPLOAD_DIR: './uploads-test',
      MODELS_DIR: './uploads-test/models',
      TRAINING_DIR: './uploads-test/training',
      LOG_LEVEL: 'silent',
    },
    coverage: {
      provider: 'v8',
      all: false,
      include: ['server/src/services/**', 'server/src/middleware/**'],
      reporter: ['text-summary', 'text'],
    },
  },
});
