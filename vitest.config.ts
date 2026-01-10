import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  
  test: {
    globals: true,
    environment: 'jsdom',
    
    include: [
      'src/**/*.test.{ts,tsx,js,jsx}',
      'src/**/*.spec.{ts,tsx,js,jsx}',
      'src/**/__tests__/**/*.{ts,tsx,js,jsx}'
    ],
    
    exclude: [
      'node_modules',
      'dist',
      'coverage',
      'backend/**'
    ],
    
    coverage: {
      enabled: true,
      provider: 'v8',
      
      include: [
        'src/**/*.{ts,tsx,js,jsx}'
      ],
      
      exclude: [
        'src/**/*.test.{ts,tsx,js,jsx}',
        'src/**/*.spec.{ts,tsx,js,jsx}',
        'src/**/__tests__/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'node_modules/**'
      ],
      
      reportsDirectory: 'coverage/frontend',
      
      reporter: [
        'text',
        'text-summary',
        'lcov',
        'json',
        'clover'
      ],
      
      thresholds: {
        global: {
          branches: 0,
          functions: 0,
          lines: 0,
          statements: 0
        }
      }
    },
    
    setupFiles: ['./src/tests/setup.ts'],
    
    testTimeout: 10000,
    
    reporters: ['verbose'],
    
    deps: {
      inline: [/@tanstack/, /react-router/]
    }
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
