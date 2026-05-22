import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Strip the ONNX-runtime WASM blobs from the build output. Transformers.js
// references them via `new URL('...wasm', import.meta.url)` which makes Vite
// copy them into dist/ — the asyncify variant alone is ~23 MB. At runtime we
// point ONNX Runtime at the jsDelivr CDN instead (see intentClassifier.ts), so
// these local copies are dead weight that would blow past GH Pages' budget.
function skipOnnxWasmAssets(): Plugin {
  return {
    name: 'skip-onnx-wasm-assets',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (/ort-wasm.*\.wasm$/.test(fileName) || /ort-wasm.*\.mjs$/.test(fileName)) {
          delete bundle[fileName];
        }
      }
    },
  };
}

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), skipOnnxWasmAssets()],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  // Transformers.js ships ONNX runtime and tokenizers as ESM — let Vite handle
  // the dynamic imports directly instead of pre-bundling.
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
});
