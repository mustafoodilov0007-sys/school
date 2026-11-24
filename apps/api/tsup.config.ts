import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { server: 'src/server.ts', migrate: 'src/db/migrate.ts', seed: 'src/db/seed.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  clean: true,
  // Workspace paketlari (TypeScript manba) bundle ichiga kiritiladi, qolganlari node_modules'dan olinadi
  noExternal: [/^@pep\//],
});
