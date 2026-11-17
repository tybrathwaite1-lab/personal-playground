import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves project sites from /<repo-name>/.
// The deploy workflow sets BASE_PATH from the repository name automatically.
// For a user site (<user>.github.io) or a custom domain, set BASE_PATH=/.
const base = process.env.BASE_PATH ?? '/personal-playground/';

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : base,
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
}));
