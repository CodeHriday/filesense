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
    watch: {
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.cache/**',
        '**/venv/**',
        '**/__pycache__/**',
        '**/uploads/**',
        '**/temp/**',
        '**/.pythonlibs/**',
        '**/rust-log-service/**',
        '**/.local/**'
      ]
    },
    fs: {
      strict: false
    },
    proxy: {
      '/profile-api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/profile-api/, ''),
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('profile-api proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Profile API Request:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('Profile API Response:', proxyRes.statusCode, req.url);
          });
        }
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, '/api'),
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        }
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
        secure: false
      }
    }
  },
  // Allow all hosts
  preview: {
    port: 5000,
    strictPort: true,
    host: true
  },
});