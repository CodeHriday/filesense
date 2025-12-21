import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks - split large dependencies
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-redux': ['@reduxjs/toolkit', 'react-redux', 'reselect', 'immer'],
          'vendor-charts': ['chart.js', 'react-chartjs-2', 'chartjs-plugin-datalabels'],
          'vendor-flow': ['reactflow', 'dagre'],
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/modifiers', '@dnd-kit/utilities'],
          'vendor-ui': ['framer-motion', 'react-icons', 'clsx'],
          'vendor-utils': ['lodash', 'axios', 'uuid'],
          'vendor-query': ['@tanstack/react-query'],
        }
      }
    },
    chunkSizeWarningLimit: 500,
    sourcemap: false,
    minify: 'esbuild'
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    hmr: {
      clientPort: 443
    },
    cors: true,
    // Allow all hosts - custom domains handled by backend CORS via ALLOWED_ORIGINS env var
    allowedHosts: true,
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