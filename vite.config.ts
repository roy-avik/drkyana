import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The receptionist no longer runs an on-device model — intent classification
// and intake moved server-side to the patient agent (/api/agent/patient). The
// old ONNX-WASM stripping plugin and the @huggingface/transformers optimizeDeps
// exclude were removed along with Transformers.js.
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});
