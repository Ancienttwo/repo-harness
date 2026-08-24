import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const operatorRoot = fileURLToPath(new URL('./src/operator-web', import.meta.url));
const operatorOutput = fileURLToPath(new URL('./dist/operator-ui', import.meta.url));

export default defineConfig({
  root: operatorRoot,
  plugins: [react()],
  build: {
    outDir: operatorOutput,
    emptyOutDir: true,
    sourcemap: false,
  },
});
