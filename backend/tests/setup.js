/**
 * Jest Setup File for Backend Tests
 * 
 * This file runs before each test file and sets up the testing environment.
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
process.env.JWT_EXPIRES_IN = '1h';

// Mock console methods to reduce noise during tests (optional)
// Uncomment if you want quieter test output
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
// };

// Increase timeout for database operations
jest.setTimeout(30000);

// Global test utilities
global.testUtils = {
  // Helper to wait for async operations
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Generate random test data
  randomString: (length = 10) => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  },
  
  // Generate test user data
  createTestUser: (overrides = {}) => ({
    email: `test-${Date.now()}@example.com`,
    username: `testuser-${Date.now()}`,
    password: 'TestPassword123!',
    role: 'user',
    ...overrides
  }),
  
  // Generate test project data
  createTestProject: (overrides = {}) => ({
    name: `Test Project ${Date.now()}`,
    description: 'Test project description',
    ...overrides
  }),
  
  // Generate test file metadata
  createTestFile: (overrides = {}) => ({
    filename: `test-file-${Date.now()}.csv`,
    file_type: 'csv',
    file_size: 1024,
    row_count: 100,
    column_count: 5,
    quality_score: 85.5,
    ...overrides
  })
};

// Cleanup after all tests
afterAll(async () => {
  // Add any global cleanup here
  // For example, close database connections
});
