import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    hmr: {
      clientPort: 443
    },
    cors: true,
    // Allow all hosts
    allowedHosts: ['all', '.replit.dev', '.repl.co', '.replit.app'],
    origin: 'https://${host}',
    fs: {
      strict: false
    }
  },
  // Allow all hosts
  preview: {
    port: 5000,
    strictPort: true,
    host: true
  },
});