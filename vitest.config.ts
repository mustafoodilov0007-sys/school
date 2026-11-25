import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Fayllar ketma-ket: integratsiya testlari bitta umumiy test bazasini tozalab qayta yaratadi.
    // (Vitest 3 da bu sozlama faqat root darajasida ishlaydi; loyiha ichida e'tiborsiz qoldiriladi.)
    fileParallelism: false,
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['packages/*/tests/**/*.test.ts', 'apps/*/tests/**/*.test.ts'],
          exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['apps/*/tests/**/*.integration.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
