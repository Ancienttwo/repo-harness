import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const operatorRoot = fileURLToPath(new URL('./src/operator-web', import.meta.url));
const operatorOutput = fileURLToPath(new URL('./dist/operator-ui', import.meta.url));

export default defineConfig({
  root: operatorRoot,
  plugins: [react(), tailwindcss()],
  // `bun run dev:operator` serves the board from source; reads go to a local
  // `repo-harness operator serve`, on its default loopback port unless
  // OPERATOR_API_ORIGIN names another one.
  server: {
    host: '127.0.0.1',
    proxy: { '/api': process.env.OPERATOR_API_ORIGIN ?? 'http://127.0.0.1:4318' },
  },
  build: {
    outDir: operatorOutput,
    emptyOutDir: true,
    sourcemap: false,
  },
});
