/**
 * Jest Configuration for Backend (Node.js/Express)
 * 
 * Coverage output: coverage/lcov.info (for SonarQube)
 */
module.exports = {
  displayName: 'backend',
  testEnvironment: 'node',
  
  roots: ['<rootDir>/backend'],
  
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js',
    '**/__tests__/**/*.js'
  ],
  
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ],
  
  collectCoverage: true,
  collectCoverageFrom: [
    'backend/**/*.js',
    'server.js',
    '!backend/tests/**',
    '!backend/**/*.test.js',
    '!backend/**/*.spec.js',
    '!backend/migrations/**',
    '!backend/scripts/**',
    '!**/node_modules/**'
  ],
  
  coverageDirectory: 'coverage/backend',
  
  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'json',
    'clover'
  ],
  
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0
    }
  },
  
  moduleFileExtensions: ['js', 'json', 'node'],
  
  setupFilesAfterEnv: ['<rootDir>/backend/tests/setup.js'],
  
  testTimeout: 30000,
  
  verbose: true,
  
  forceExit: true,
  
  detectOpenHandles: true,
  
  clearMocks: true,
  
  resetMocks: true
};
