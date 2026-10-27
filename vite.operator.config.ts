import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

import { DESIGN_TOKENS_MODULE, designTokenStylesheet } from './src/operator-web/design-tokens';

const operatorRoot = fileURLToPath(new URL('./src/operator-web', import.meta.url));
const operatorOutput = fileURLToPath(new URL('./dist/operator-ui', import.meta.url));
// The design system's logos and mascots ship under their own names (`/logos/…`, `/mascots/…`).
const brandAssets = fileURLToPath(new URL('./docs/design/operator-console/design-system/assets', import.meta.url));

/** Serves the design-system tokens as one stylesheet; `main.tsx` imports it after `app.css`. */
function designTokens(): Plugin {
  const resolved = `\0${DESIGN_TOKENS_MODULE}`;
  return {
    name: 'repo-harness:design-tokens',
    resolveId: id => (id === DESIGN_TOKENS_MODULE ? resolved : undefined),
    load: id => (id === resolved ? designTokenStylesheet() : undefined),
  };
}

export default defineConfig({
  root: operatorRoot,
  publicDir: brandAssets,
  plugins: [react(), tailwindcss(), designTokens()],
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
