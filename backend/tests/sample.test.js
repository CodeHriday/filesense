/**
 * Sample Backend Test
 * 
 * This test verifies the Jest configuration is working correctly.
 * Replace with actual tests for your services and routes.
 */

describe('Sample Backend Tests', () => {
  describe('Basic Assertions', () => {
    test('should pass a simple assertion', () => {
      expect(1 + 1).toBe(2);
    });

    test('should handle string comparisons', () => {
      expect('hello world').toContain('world');
    });

    test('should handle array operations', () => {
      const arr = [1, 2, 3, 4, 5];
      expect(arr).toHaveLength(5);
      expect(arr).toContain(3);
    });

    test('should handle object comparisons', () => {
      const obj = { name: 'test', value: 123 };
      expect(obj).toHaveProperty('name');
      expect(obj.name).toBe('test');
    });
  });

  describe('Async Operations', () => {
    test('should handle promises', async () => {
      const promise = Promise.resolve('success');
      await expect(promise).resolves.toBe('success');
    });

    test('should handle async/await', async () => {
      const asyncFn = async () => {
        return new Promise(resolve => {
          setTimeout(() => resolve('done'), 100);
        });
      };
      
      const result = await asyncFn();
      expect(result).toBe('done');
    });
  });

  describe('Test Utilities', () => {
    test('should have access to global test utilities', () => {
      expect(global.testUtils).toBeDefined();
      expect(global.testUtils.randomString).toBeDefined();
    });

    test('should generate random strings', () => {
      const str1 = global.testUtils.randomString(10);
      const str2 = global.testUtils.randomString(10);
      
      expect(str1).toHaveLength(10);
      expect(str2).toHaveLength(10);
      expect(str1).not.toBe(str2);
    });

    test('should create test user data', () => {
      const user = global.testUtils.createTestUser();
      
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('username');
      expect(user).toHaveProperty('password');
      expect(user.email).toContain('@');
    });

    test('should create test project data', () => {
      const project = global.testUtils.createTestProject({ name: 'Custom Name' });
      
      expect(project.name).toBe('Custom Name');
      expect(project).toHaveProperty('description');
    });
  });
});
