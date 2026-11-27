import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import fs from 'node:fs';
import { parse } from 'dotenv';
import { studioLocalNetwork } from './wifi-host.js';
const backendEnvPath=path.resolve(import.meta.dirname,'../backend/.env');
const backendEnv=fs.existsSync(backendEnvPath)?parse(fs.readFileSync(backendEnvPath)):{};
const backendPort=process.env.POSE_BACKEND_PORT || backendEnv.PORT || '5000';
const keyPath=path.resolve(import.meta.dirname,'certs/key.pem');
const certPath=path.resolve(import.meta.dirname,'certs/cert.pem');
const https=fs.existsSync(keyPath)&&fs.existsSync(certPath)?{key:fs.readFileSync(keyPath),cert:fs.readFileSync(certPath)}:undefined;

// Use this config when working in VS Code (replaces the Figma Make vite.config.ts)
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    studioLocalNetwork(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    // The studioLocalNetwork plugin limits this wildcard listener to loopback and Wi-Fi.
    // Allow only trusted/private networks in the Windows firewall.
    host: true,
    https,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
});
