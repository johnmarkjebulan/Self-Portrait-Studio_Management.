import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { pickWifiHost } from './wifi-host.js';

// Use this config when working in VS Code (replaces the Figma Make vite.config.ts)
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    // Bind only to Wi-Fi (or localhost when Wi-Fi is unavailable).
    // This excludes the unwanted 169.254.x.x Ethernet address.
    host: pickWifiHost(),
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
});
